import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, pitchClass } from '../js/notes.js';
import { LEVELS } from '../js/path.js';
import { CHAIN_MIN, chainSpots, chainOptions, pickChain, chainHint, createChainSchedule, createChain } from '../js/chain.js';
import { createCombo } from '../js/combo.js';
import { createSession } from '../js/session.js';

const R = { from: 0, to: 11 };
const midi = (s) => STRINGS[s.string].midi + s.fret;

const sp = (list) => list.map(([string, fret]) => ({ string, fret }));

test('chains walk the note left to right: every later spot, nearest string first on ties', () => {
  const R12 = { from: 0, to: 12 };
  assert.deepEqual(chainSpots(4, 0, R12), sp([[4, 0], [2, 2], [0, 5], [5, 5], [3, 7], [1, 10], [4, 12]]));
  assert.deepEqual(chainSpots(4, 0, R), sp([[4, 0], [2, 2], [0, 5], [5, 5], [3, 7], [1, 10]]));
  assert.deepEqual(chainSpots(5, 0, R12), sp([[5, 0], [3, 2], [1, 5], [4, 7], [2, 9], [0, 12], [5, 12]]));
  assert.deepEqual(chainSpots(5, 0, R), sp([[5, 0], [3, 2], [1, 5], [4, 7], [2, 9]]));
  assert.deepEqual(chainSpots(5, 5, R), sp([[5, 5], [3, 7], [1, 10]]), 'spots on the start fret are skipped');
  for (const start of [5, 4]) for (let f = 0; f <= 12; f++) {
    const spots = chainSpots(start, f, R12);
    if (!spots) continue;
    assert.ok(spots.length >= CHAIN_MIN);
    for (let i = 1; i < spots.length; i++) assert.ok(spots[i].fret >= spots[i - 1].fret && (i < 2 || spots[i].fret > spots[i - 2].fret));
    assert.ok(spots.every(s => s.fret <= 12 && pitchClass(midi(s)) === pitchClass(midi(spots[0]))));
  }
});

test('a chain that cannot reach 3 notes, or leaves the fret range, is rejected', () => {
  assert.equal(chainSpots(5, 7, R), null);      // only 2 notes fit up to fret 11
  assert.equal(chainSpots(5, 12, { from: 0, to: 12 }), null);
  assert.ok(chainSpots(5, 6, R));
  assert.equal(chainSpots(5, 0, { from: 1, to: 11 }), null);
});

test('every option is in range, starts on E or A, and holds one pitch class of the level', () => {
  for (const level of LEVELS) {
    for (const c of chainOptions(level, R)) {
      assert.ok(level.notes.includes(c.pc));
      assert.ok([5, 4].includes(c.spots[0].string));
      assert.ok(c.spots.every(s => s.fret >= 0 && s.fret <= 11 && pitchClass(midi(s)) === c.pc));
    }
  }
  assert.ok(chainOptions(LEVELS[4], R).length > 0);
  assert.ok(chainOptions(LEVELS[0], R).length > 0, 'level 1 has chains too');
});

test('pickChain: null when nothing fits, honours the prefer filter', () => {
  assert.equal(pickChain(LEVELS[4], { from: 9, to: 11 }), null);
  const a = chainOptions(LEVELS[4], R)[0];
  const c = pickChain(LEVELS[4], R, () => 0, (pc, spots) => spots[0].fret === a.spots[0].fret && spots[0].string === a.spots[0].string);
  assert.deepEqual(c.spots[0], a.spots[0]);
});

test('hints: string and fret moves from the previous spot', () => {
  const e = chainSpots(5, 0, { from: 0, to: 12 });
  assert.equal(chainHint(e, 0), null);
  assert.equal(chainHint(e, 1), '2 strings down, 2 frets up');
  assert.equal(chainHint(e, 2), '2 strings down, 3 frets up');
  assert.equal(chainHint(e, 3), '3 strings up, 2 frets up');
  assert.equal(chainHint(e, 6), 'Same fret on the low E string');
  assert.equal(chainHint([{ string: 2, fret: 0 }, { string: 3, fret: 5 }], 1), '1 string up, 5 frets up');
  assert.equal(chainHint([{ string: 2, fret: 0 }, { string: 1, fret: 1 }], 1), '1 string down, 1 fret up');
  assert.equal(chainHint([{ string: 0, fret: 5 }, { string: 5, fret: 5 }], 1), 'Same fret on the low E string');
  assert.equal(chainHint([{ string: 5, fret: 5 }, { string: 0, fret: 5 }], 1), 'Same fret on the high E string');
});

test('schedule: a chain every 6 to 9 normal questions', () => {
  for (const r of [0, 0.99]) {
    const sch = createChainSchedule(() => r);
    const gaps = []; let n = 0;
    for (let i = 0; i < 60; i++) { n++; if (sch.due()) { gaps.push(n); n = 0; } }
    assert.ok(gaps.length >= 5 && gaps.every(g => g >= 6 && g <= 9), JSON.stringify(gaps));
  }
});

test('chain: clean answers all the way make it perfect; one slip does not', () => {
  const spec = chainOptions(LEVELS[4], R)[0];
  const n = spec.spots.length;
  const a = createChain(spec, 1);
  assert.deepEqual(a.current, spec.spots[0]);
  for (let i = 0; i < n - 1; i++) assert.deepEqual(a.advance(true), { done: false, perfect: true });
  assert.deepEqual(a.advance(true), { done: true, perfect: true });
  assert.equal(a.current, null);
  const b = createChain(spec, 1);
  b.advance(true); b.miss();
  for (let i = 1; i < n - 1; i++) b.advance(true);
  assert.deepEqual(b.advance(true), { done: true, perfect: false });
});

test('combo bonus adds to the score and the best score, not the streak', () => {
  const c = createCombo();
  c.hit(1000);
  c.bonus(500);
  assert.equal(c.score, 700);
  assert.equal(c.bestScore, 700);
  assert.equal(c.streak, 1);
});

test('session.restartClock restarts the answer clock while listening', () => {
  let t = 0;
  const s = createSession({ getSettings: () => ({ mode: 'note', notes: [4], strings: [5], fretFrom: 0, fretTo: 11 }), now: () => t, onEvent() {}, pickNote: () => ({ string: 5, fret: 0 }) });
  s.start(); t = 1500; s.restartClock();
  assert.equal(s.startedAt, 1500);
  s.stop(); t = 3000; s.restartClock();
  assert.equal(s.startedAt, 1500);
});
