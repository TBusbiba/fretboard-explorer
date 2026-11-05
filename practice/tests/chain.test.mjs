import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, pitchClass } from '../js/notes.js';
import { LEVELS } from '../js/path.js';
import { octaveShift, chainSpots, chainOptions, pickChain, chainHint, createChainSchedule, createChain } from '../js/chain.js';
import { createCombo } from '../js/combo.js';
import { createSession } from '../js/session.js';

const R = { from: 0, to: 11 };
const midi = (s) => STRINGS[s.string].midi + s.fret;

test('octave shift: 2 frets from low E and A, 3 from D and G', () => {
  assert.deepEqual([5, 4, 3, 2].map(octaveShift), [2, 2, 3, 3]);
});

test('chains from low E and A: strings, frets, and real octaves', () => {
  assert.deepEqual(chainSpots(5, 8, { from: 0, to: 21 }), [{ string: 5, fret: 8 }, { string: 3, fret: 10 }, { string: 1, fret: 13 }]);
  assert.deepEqual(chainSpots(4, 3, R).map(s => s.string), [4, 2, 0]);
  for (const start of [5, 4]) for (let f = 0; f <= 6; f++) {
    const spots = chainSpots(start, f, R);
    assert.equal(midi(spots[1]) - midi(spots[0]), 12);
    assert.equal(midi(spots[2]) - midi(spots[1]), 12);
  }
});

test('a chain that leaves the fret range is rejected', () => {
  assert.equal(chainSpots(5, 7, R), null);      // third note would be fret 12
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
  assert.ok(chainOptions(LEVELS[0], R).length > 0);
});

test('pickChain: null when nothing fits, honours the prefer filter', () => {
  assert.equal(pickChain(LEVELS[0], { from: 9, to: 11 }), null);
  const a = chainOptions(LEVELS[0], R)[0];
  const c = pickChain(LEVELS[0], R, () => 0, (pc, spots) => spots[0].fret === a.spots[0].fret && spots[0].string === a.spots[0].string);
  assert.deepEqual(c.spots[0], a.spots[0]);
});

test('hints count from the previous spot', () => {
  const spots = chainSpots(5, 3, R);
  assert.equal(chainHint(spots, 0), null);
  assert.equal(chainHint(spots, 1), '2 strings down, 2 frets up');
  assert.equal(chainHint(spots, 2), '2 strings down, 3 frets up');
});

test('schedule: a chain every 6 to 9 normal questions', () => {
  for (const r of [0, 0.99]) {
    const sch = createChainSchedule(() => r);
    const gaps = []; let n = 0;
    for (let i = 0; i < 60; i++) { n++; if (sch.due()) { gaps.push(n); n = 0; } }
    assert.ok(gaps.length >= 5 && gaps.every(g => g >= 6 && g <= 9), JSON.stringify(gaps));
  }
});

test('chain: three clean answers make it perfect; one slip does not', () => {
  const spec = chainOptions(LEVELS[0], R)[0];
  const a = createChain(spec, 1);
  assert.deepEqual(a.current, spec.spots[0]);
  a.advance(true); a.advance(true);
  assert.equal(a.hint, '2 strings down, 3 frets up');
  assert.deepEqual(a.advance(true), { done: true, perfect: true });
  assert.equal(a.current, null);
  const b = createChain(spec, 1);
  b.advance(true); b.miss(); b.advance(true);
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
