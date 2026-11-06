import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALE_LEVELS, scaleLevelById, WINDOW_RUNS, AVG_NOTE_MS_MAX, MAX_RUN_MISTAKES, STAR2_NOTE_MS, STAR3_NOTE_MS,
  exerciseLabel, exerciseRun, exerciseKey, pickExercise, bossRuns, blankEntry, evaluate, scaleStarsFor, createScalePathStore,
} from '../js/scale-path.js';
import { SCALES } from '../js/scales.js';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const KEY = 'fretboard-practice.scale-path.v2';
const entryWith = ({ n = WINDOW_RUNS, ms = 500, mistakes = 0 } = {}) => ({ ...blankEntry(), recent: Array.from({ length: n }, () => ({ ms, mistakes })) });
const clearLevel = (store, id) => { for (const key of scaleLevelById(id).required) store.record(id, { ms: 400, mistakes: 0, key }); for (let i = 0; i < WINDOW_RUNS; i++) store.record(id, { ms: 400, mistakes: 0 }); store.completeBoss(id, 400, 0); };
const seeded = (seed = 7) => () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);

test('eleven levels in the spec order', () => {
  assert.deepEqual(SCALE_LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(SCALE_LEVELS.slice(0, 5).map(l => l.required), ['1', '2', '3', '4', '5'].map(b => [`minorPentatonic:${b}`]));
  assert.deepEqual(SCALE_LEVELS[5].required, ['1+2', '2+3', '3+4', '4+5'].map(b => `minorPentatonic:${b}`));
  assert.deepEqual(SCALE_LEVELS[6].required, ['majorPentatonic:1', 'majorPentatonic:2']);
  assert.deepEqual(SCALE_LEVELS[10].required, ['major:4', 'major:5']);
  assert.equal(scaleLevelById(12), null);
  assert.deepEqual(SCALE_LEVELS.map(l => l.short).slice(0, 3), ['Box 1', '+Box 2', '+Box 3']);
});

test('L1 pool is box 1 in five roots; L5 pool covers all five boxes', () => {
  const l1 = SCALE_LEVELS[0].pool;
  assert.equal(l1.length, 5);
  assert.ok(l1.every(e => e.scale === 'minorPentatonic' && e.boxes.join() === '1'));
  assert.equal(new Set(l1.map(e => e.rootPc)).size, 5);
  const l5 = SCALE_LEVELS[4].pool;
  assert.deepEqual([...new Set(l5.map(e => e.boxes[0]))].sort(), [1, 2, 3, 4, 5]);
  assert.equal(l5.length, 25);
  assert.ok(SCALE_LEVELS[5].pool.some(e => e.boxes.length === 2));
  assert.ok(SCALE_LEVELS[7].pool.some(e => e.scale === 'majorPentatonic' && e.boxes[0] === 5));
  assert.ok(SCALE_LEVELS[10].pool.some(e => e.scale === 'major' && e.boxes[0] === 5));
});

test('pools are cumulative', () => {
  SCALE_LEVELS.forEach((l, i) => { if (i) assert.deepEqual(l.pool.slice(0, SCALE_LEVELS[i - 1].pool.length), SCALE_LEVELS[i - 1].pool); });
});

test('every pool shape sits in frets 0-15 (a few roots cannot fit 0-13)', () => {
  for (const e of SCALE_LEVELS[10].pool) {
    const frets = exerciseRun(e).notes.map(n => n.fret);
    assert.ok(Math.min(...frets) >= 0 && Math.max(...frets) <= 15, `${exerciseLabel(e)} ${frets}`);
  }
});

test('pickExercise: never the same exercise twice, varied roots, favours unplayed boxes', () => {
  const rng = seeded();
  let prev = null; const roots = new Set();
  for (let i = 0; i < 300; i++) {
    const e = pickExercise(SCALE_LEVELS[0], prev, [], rng);
    assert.notEqual(exerciseLabel(e), prev);
    roots.add(e.rootPc); prev = exerciseLabel(e);
  }
  assert.equal(roots.size, 5);
  const l5 = SCALE_LEVELS[4];
  const boxes = new Set();
  for (let i = 0; i < 300; i++) boxes.add(pickExercise(l5, null, [], rng).boxes[0]);
  assert.equal(boxes.size, 5);
  let fresh = 0;
  for (let i = 0; i < 200; i++) if (pickExercise(l5, null, [], rng).boxes[0] === 5) fresh++;
  assert.ok(fresh > 40);
});

test('every exercise builds a run that goes up and back down', () => {
  for (const l of SCALE_LEVELS) for (const e of l.pool) {
    const r = exerciseRun(e);
    assert.equal(r.sequence.length, r.notes.length * 2 - 1);
    assert.ok(r.label.includes(SCALES[e.scale].name));
  }
  assert.equal(exerciseLabel(SCALE_LEVELS[0].added[0]), 'A minor pentatonic · box 1');
  assert.equal(exerciseLabel(SCALE_LEVELS[5].added[0]), 'A minor pentatonic · boxes 1 + 2');
  assert.equal(exerciseKey(SCALE_LEVELS[5].added[0]), 'minorPentatonic:1+2');
});

test('boss: five different runs, new material plus earlier boxes, random roots', () => {
  const rng = seeded(3);
  for (const l of SCALE_LEVELS) for (let k = 0; k < 20; k++) {
    const runs = bossRuns(l, rng);
    assert.equal(runs.length, 5);
    assert.equal(new Set(runs.map(r => r.label)).size, 5);
    const poolLabels = l.pool.map(exerciseLabel);
    assert.ok(runs.every(r => poolLabels.includes(r.label)));
    assert.ok(runs.some(r => l.required.includes(exerciseKey(r))), `level ${l.id} has new material`);
  }
  const rootsSeen = new Set();
  for (let k = 0; k < 30; k++) bossRuns(SCALE_LEVELS[0], rng).forEach(r => rootsSeen.add(r.rootPc));
  assert.equal(rootsSeen.size, 5);
  assert.ok(bossRuns(SCALE_LEVELS[4], rng).some(r => r.boxes[0] < 5), 'earlier boxes included');
});

test('coverage gate: fast clean runs alone do not open the boss until each new box is played', () => {
  const l6 = SCALE_LEVELS[5];
  const store = createScalePathStore(memoryStorage());
  for (let i = 0; i < 6; i++) store.record(6, { ms: 400, mistakes: 0, key: l6.required[0] });
  let p = store.progress(6);
  assert.equal(p.met.covered, false);
  assert.deepEqual(p.coverage, { done: 1, need: 4 });
  assert.equal(p.bossUnlocked, false);
  l6.required.slice(1, -1).forEach(key => store.record(6, { ms: 400, mistakes: 0, key }));
  assert.equal(store.progress(6).bossUnlocked, false);
  assert.equal(store.record(6, { ms: 400, mistakes: 0, key: l6.required[3] }).bossUnlocked, true);
  assert.equal(store.progress(6).coverage.done, 4);
  assert.equal(evaluate(entryWith(), []).unlocked, true);
  assert.equal(evaluate(entryWith(), ['x']).unlocked, false);
});

test('evaluate: unlocks on enough fast, clean runs', () => {
  assert.equal(evaluate(blankEntry()).unlocked, false);
  assert.equal(evaluate(entryWith()).unlocked, true);
  assert.equal(evaluate(entryWith({ n: WINDOW_RUNS - 1 })).met.count, false);
  assert.equal(evaluate(entryWith({ ms: AVG_NOTE_MS_MAX })).unlocked, true);
  assert.equal(evaluate(entryWith({ ms: AVG_NOTE_MS_MAX + 1 })).met.time, false);
  assert.equal(evaluate(entryWith({ mistakes: MAX_RUN_MISTAKES })).unlocked, true);
  assert.equal(evaluate(entryWith({ mistakes: MAX_RUN_MISTAKES + 1 })).met.clean, false);
});

test('evaluate: only the last WINDOW_RUNS runs count', () => {
  const e = entryWith({ n: 3, ms: 3000, mistakes: 5 });
  e.recent.push(...Array.from({ length: WINDOW_RUNS }, () => ({ ms: 400, mistakes: 0 })));
  assert.equal(evaluate(e).unlocked, true);
  assert.equal(evaluate(e).runs, WINDOW_RUNS);
});

test('stars: 3 fast and clean, 2 decent, 1 otherwise', () => {
  assert.equal(scaleStarsFor(STAR3_NOTE_MS, 0), 3);
  assert.equal(scaleStarsFor(STAR3_NOTE_MS, 1), 2);
  assert.equal(scaleStarsFor(STAR2_NOTE_MS, 2), 2);
  assert.equal(scaleStarsFor(STAR2_NOTE_MS, 3), 1);
  assert.equal(scaleStarsFor(STAR2_NOTE_MS + 1, 0), 1);
});

test('store: level 1 is open, others locked until the previous boss is done', () => {
  const s = createScalePathStore(memoryStorage());
  assert.equal(s.current, 1);
  assert.equal(s.isUnlocked(2), false);
  assert.equal(s.select(2), false);
  assert.equal(s.select(99), false);
  clearLevel(s, 1);
  assert.equal(s.current, 2);
  assert.equal(s.isUnlocked(2), true);
  assert.equal(s.select(1), true);
});

test('store: record opens the boss once, sticky afterwards', () => {
  const s = createScalePathStore(memoryStorage());
  const key = SCALE_LEVELS[0].required[0];
  for (let i = 0; i < WINDOW_RUNS - 1; i++) assert.equal(s.record(1, { ms: 400, mistakes: 0, key }).bossUnlocked, false);
  assert.equal(s.record(1, { ms: 400, mistakes: 0, key }).bossUnlocked, true);
  assert.equal(s.record(1, { ms: 400, mistakes: 0 }).bossUnlocked, false);
  for (let i = 0; i < WINDOW_RUNS; i++) s.record(1, { ms: 3000, mistakes: 4 });
  assert.equal(s.progress(1).unlocked, false);
  assert.equal(s.progress(1).bossUnlocked, true);
});

test('store: completeBoss keeps best stars and best time', () => {
  const s = createScalePathStore(memoryStorage());
  const a = s.completeBoss(1, 450, 0);
  assert.deepEqual([a.stars, a.first, a.next], [3, true, 2]);
  const b = s.completeBoss(1, 900, 3);
  assert.deepEqual([b.stars, b.bestStars, b.first], [1, 3, false]);
  assert.equal(s.stars(1), 3);
  assert.equal(s.isDone(1), true);
  assert.equal(s.completeBoss(11, 400, 0).next, null);
});

test('store: persists under its key and restores', () => {
  const st = memoryStorage();
  const s = createScalePathStore(st);
  clearLevel(s, 1); clearLevel(s, 2);
  s.markTip(2); s.saveBests(2, { score: 120 });
  assert.ok(st.m.has(KEY));
  const t = createScalePathStore(st);
  assert.equal(t.current, 3);
  assert.equal(t.isDone(2), true);
  assert.equal(t.tipSeen(2), true);
  assert.equal(t.bests(2).score, 120);
  assert.equal(t.saveBests(2, { score: 100 }), false);
  t.reset();
  assert.equal(createScalePathStore(st).current, 1);
});

test('store: survives corrupt or hostile storage', () => {
  assert.equal(createScalePathStore(memoryStorage({ [KEY]: '{nope' })).current, 1);
  const locked = createScalePathStore(memoryStorage({ [KEY]: JSON.stringify({ current: 7, levels: {} }) }));
  assert.equal(locked.current, 1);
  const throwing = { getItem() { throw new Error('x'); }, setItem() { throw new Error('x'); } };
  const s = createScalePathStore(throwing);
  assert.doesNotThrow(() => s.record(1, { ms: 400, mistakes: 0 }));
  assert.equal(createScalePathStore(null).current, 1);
});
