import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBossFight, damageFor, LIVES } from '../js/boss.js';
import { LEVELS, noteSpots, levelRange } from '../js/path.js';
import { STRINGS, pitchClass } from '../js/notes.js';

const range = { from: 0, to: 12 };
const rngSeed = (seed = 1) => () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pcOf = (s) => pitchClass(STRINGS[s.string].midi + s.fret);
const midiOf = (s) => STRINGS[s.string].midi + s.fret;
const key = (s) => `${s.string}:${s.fret}`;
const lvl = (id) => LEVELS[id - 1];
const phase = (f, p) => f.items.filter(i => i.phase === p);

test('level 2: new phase is every D in range in order; rapid is E/A only, 2-3 each', () => {
  const f = createBossFight(lvl(2), range, { rng: rngSeed() });
  const d = lvl(2).added[0];
  assert.deepEqual(phase(f, 'new').map(key), noteSpots(d, levelRange(lvl(2), range)).map(key));
  const rapid = phase(f, 'rapid');
  assert.ok(rapid.every(s => lvl(2).notes.includes(pcOf(s)) && pcOf(s) !== d));
  for (const pc of lvl(2).notes.filter(p => p !== d)) {
    const n = rapid.filter(s => pcOf(s) === pc).length;
    assert.ok(n >= 2 && n <= 3, `note ${pc} has ${n}`);
  }
  assert.equal(new Set(f.items.map(key)).size, f.items.length);
});

test('level 11: rapid phase <= 24, covers all 11 earlier notes, no repeated spots or adjacent notes', () => {
  for (let seed = 1; seed < 20; seed++) {
    const f = createBossFight(lvl(11), range, { rng: rngSeed(seed) });
    const rapid = phase(f, 'rapid');
    assert.ok(rapid.length <= 24);
    assert.equal(new Set(rapid.map(pcOf)).size, 11);
    assert.equal(new Set(rapid.map(key)).size, rapid.length);
    for (let i = 1; i < rapid.length; i++) assert.notEqual(pcOf(rapid[i]), pcOf(rapid[i - 1]));
  }
});

test('level 1: all E and A spots; last third is shuffled rapid fire', () => {
  const f = createBossFight(lvl(1), range, { rng: rngSeed() });
  const all = lvl(1).notes.flatMap(pc => noteSpots(pc, range));
  assert.equal(f.of, all.length);
  assert.equal(new Set(f.items.map(key)).size, all.length);
  assert.equal(phase(f, 'rapid').length, Math.floor(all.length / 3));
  assert.ok(phase(f, 'new').length > 0);
});

test('countdown: none in phase 1, then 4 / 3 / 2 s by thirds of the rapid phase', () => {
  const f = createBossFight(lvl(6), range, { rng: rngSeed() });
  const limits = [];
  while (f.current()) { limits.push(f.timeLimitMs()); f.answer(midiOf(f.current()), 500); }
  const nNew = phase(f, 'new').length, rapid = limits.slice(nNew);
  assert.ok(limits.slice(0, nNew).every(l => l === null));
  assert.equal(rapid[0], 4000);
  assert.equal(rapid[Math.floor(rapid.length / 2)], 3000);
  assert.equal(rapid[rapid.length - 1], 2000);
  assert.ok(rapid.every((l, i) => i === 0 || l <= rapid[i - 1]));
});

test('damage scale and HP reaching exactly 0 on win', () => {
  assert.equal(damageFor(500), 100); assert.equal(damageFor(1000), 100);
  assert.equal(damageFor(2500), 75); assert.equal(damageFor(4000), 50); assert.equal(damageFor(9000), 50);
  const f = createBossFight(lvl(3), range, { rng: rngSeed() });
  assert.equal(f.hp, f.maxHp);
  let prev = f.hp, last;
  while (f.current()) {
    const c = f.current(); assert.equal(c.finish, f.n === f.of);
    last = f.answer({ string: c.string, fret: c.fret }, 2500);
    assert.equal(f.lastDamage, 75);
    assert.ok(f.hp < prev || last.result === 'won'); prev = f.hp;
  }
  assert.equal(last.result, 'won'); assert.equal(last.finish, true);
  assert.equal(f.hp, 0);
  const s = f.summary();
  assert.equal(s.won, true); assert.equal(s.livesLost, 0); assert.equal(s.spots, f.of);
});

test('wrong costs one life once per spot; 3 lives lost = lost', () => {
  const f = createBossFight(lvl(2), range, { rng: rngSeed() });
  const c = f.current();
  assert.equal(f.answer(midiOf(c) + 1, 500).result, 'wrong');
  assert.equal(f.answer(midiOf(c) + 2, 500).result, 'wrong');
  assert.equal(f.lives, LIVES - 1);
  assert.equal(f.answer(midiOf(c), 500).result, 'hit');
  let res;
  res = f.answer(midiOf(f.current()) + 1, 100);
  f.answer(midiOf(f.current()), 100);
  res = f.answer(midiOf(f.current()) + 1, 100);
  assert.equal(f.lives, 0);
  assert.equal(res.result, 'lost'); assert.equal(f.state, 'lost'); assert.equal(f.current(), null);
  assert.equal(f.summary().won, false); assert.equal(f.summary().stars, 0);
});

test('timeout costs a life, skips the spot, counts as missed; third timeout loses', () => {
  const f = createBossFight(lvl(2), range, { rng: rngSeed() });
  const first = f.current();
  assert.equal(f.timeout().result, 'hit');
  assert.notEqual(f.current(), first); assert.equal(f.lives, 2); assert.equal(f.summary().missed, 1);
  f.timeout();
  assert.equal(f.timeout().result, 'lost');
});

test('winning with a missed spot still ends at hp 0; stars use lives lost', () => {
  const f = createBossFight(lvl(2), range, { rng: rngSeed() });
  f.timeout();
  while (f.current()) f.answer(midiOf(f.current()), 500);
  assert.equal(f.state, 'won'); assert.equal(f.hp, 0);
  assert.equal(f.summary().stars, 2);
});

test('deterministic with the same rng', () => {
  const a = createBossFight(lvl(8), range, { rng: rngSeed(7) }).items.map(key);
  const b = createBossFight(lvl(8), range, { rng: rngSeed(7) }).items.map(key);
  assert.deepEqual(a, b);
});
