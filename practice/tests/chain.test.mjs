import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, pitchClass } from '../js/notes.js';
import { LEVELS } from '../js/path.js';
import { octaveShift, unisonShift, CHAIN_MIN, CHAIN_MAX, chainSpots, chainOptions, pickChain, chainHint, createChainSchedule, createChain } from '../js/chain.js';
import { createCombo } from '../js/combo.js';
import { createSession } from '../js/session.js';

const R = { from: 0, to: 11 };
const midi = (s) => STRINGS[s.string].midi + s.fret;

test('octave shift: 2 frets from low E and A, 3 from D and G', () => {
  assert.deepEqual([5, 4, 3, 2].map(octaveShift), [2, 2, 3, 3]);
});

test('unison shift: 5 frets up to the next thicker string, 4 from B to G', () => {
  assert.deepEqual([0, 1, 2, 3, 4].map(unisonShift), [5, 4, 5, 5, 5]);
});

test('chains: 3 to 5 notes, all one pitch, frets never go down, octave steps preferred', () => {
  const R12 = { from: 0, to: 12 };
  assert.deepEqual(chainSpots(4, 0, R12), [{ string: 4, fret: 0 }, { string: 2, fret: 2 }, { string: 0, fret: 5 }, { string: 1, fret: 10 }]);
  assert.deepEqual(chainSpots(5, 3, R12), [{ string: 5, fret: 3 }, { string: 3, fret: 5 }, { string: 1, fret: 8 }, { string: 2, fret: 12 }]);
  let longest = 0;
  for (const start of [5, 4]) for (let f = 0; f <= 12; f++) {
    const spots = chainSpots(start, f, R12);
    if (!spots) continue;
    longest = Math.max(longest, spots.length);
    assert.ok(spots.length >= CHAIN_MIN && spots.length <= CHAIN_MAX);
    for (let i = 1; i < spots.length; i++) {
      assert.ok(spots[i].fret > spots[i - 1].fret, 'fret goes up');
      const gap = midi(spots[i]) - midi(spots[i - 1]);
      assert.ok(gap === 12 || gap === 0, `octave or unison, got ${gap}`);
    }
    assert.ok(spots.every(s => s.string >= 0 && s.string <= 5 && s.fret >= 0 && s.fret <= 12));
  }
  assert.equal(longest, 5, 'some start reaches the full 5');
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
  for (const id of [0, 1, 2, 3]) assert.deepEqual(chainOptions(LEVELS[id], R), [], 'spot levels have no chains');
});

test('pickChain: null when nothing fits, honours the prefer filter', () => {
  assert.equal(pickChain(LEVELS[4], { from: 9, to: 11 }), null);
  const a = chainOptions(LEVELS[4], R)[0];
  const c = pickChain(LEVELS[4], R, () => 0, (pc, spots) => spots[0].fret === a.spots[0].fret && spots[0].string === a.spots[0].string);
  assert.deepEqual(c.spots[0], a.spots[0]);
});

test('hints count from the previous spot: octave steps and unison steps', () => {
  const spots = chainSpots(5, 3, { from: 0, to: 12 });     // E3 -> D5 -> B8 -> G12
  assert.equal(chainHint(spots, 0), null);
  assert.equal(chainHint(spots, 1), '2 strings down, 2 frets up');
  assert.equal(chainHint(spots, 2), '2 strings down, 3 frets up');
  assert.equal(chainHint(spots, 3), '1 string up, 4 frets up');
  const a = chainSpots(4, 0, { from: 0, to: 12 });         // A0 -> G2 -> e5 -> B10
  assert.equal(chainHint(a, 3), '1 string up, 5 frets up');
  assert.equal(chainHint(a, 4), null);
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
