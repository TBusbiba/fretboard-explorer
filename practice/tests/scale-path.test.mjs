import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SCALE_LEVELS, scaleLevelById, WINDOW_RUNS, AVG_NOTE_MS_MAX, MAX_RUN_MISTAKES, STAR2_NOTE_MS, STAR3_NOTE_MS,
  exerciseLabel, exerciseRun, bossRuns, blankEntry, evaluate, scaleStarsFor, createScalePathStore,
} from '../js/scale-path.js';
import { SCALES } from '../js/scales.js';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const KEY = 'fretboard-practice.scale-path.v1';
const entryWith = ({ n = WINDOW_RUNS, ms = 500, mistakes = 0 } = {}) => ({ ...blankEntry(), recent: Array.from({ length: n }, () => ({ ms, mistakes })) });
const clearLevel = (store, id) => { for (let i = 0; i < WINDOW_RUNS; i++) store.record(id, { ms: 400, mistakes: 0 }); store.completeBoss(id, 400, 0); };

test('eleven levels in the spec order', () => {
  assert.deepEqual(SCALE_LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(SCALE_LEVELS.slice(0, 5).map(l => l.added[0].boxes[0]), [1, 2, 3, 4, 5]);
  assert.ok(SCALE_LEVELS.slice(0, 5).every(l => l.scale === 'minorPentatonic' && l.rootPc === 9));
  assert.deepEqual(SCALE_LEVELS[5].added[0].boxes, [1, 2]);
  assert.equal(SCALE_LEVELS[6].rootPc, 4);
  assert.equal(SCALE_LEVELS[7].scale, 'majorPentatonic');
  assert.equal(SCALE_LEVELS[7].rootPc, 7);
  assert.equal(SCALE_LEVELS[8].scale, 'major');
  assert.equal(SCALE_LEVELS[8].rootPc, 0);
  assert.equal(scaleLevelById(12), null);
});

test('pools are cumulative', () => {
  assert.equal(SCALE_LEVELS[0].pool.length, 1);
  SCALE_LEVELS.forEach((l, i) => { if (i) assert.deepEqual(l.pool.slice(0, SCALE_LEVELS[i - 1].pool.length), SCALE_LEVELS[i - 1].pool); });
  assert.equal(SCALE_LEVELS[4].pool.length, 5);
});

test('every exercise builds a run that goes up and back down', () => {
  for (const l of SCALE_LEVELS) for (const e of l.pool) {
    const r = exerciseRun(e);
    assert.equal(r.sequence.length, r.notes.length * 2 - 1);
    assert.ok(r.label.includes(SCALES[e.scale].name));
  }
  assert.equal(exerciseLabel(SCALE_LEVELS[0].added[0]), 'A minor pentatonic · box 1');
  assert.equal(exerciseLabel(SCALE_LEVELS[5].added[0]), 'A minor pentatonic · boxes 1 + 2');
});

test('boss is five runs, all boxes of the level scale, ordered up the neck', () => {
  for (const l of SCALE_LEVELS) {
    const runs = bossRuns(l);
    assert.equal(runs.length, 5);
    assert.deepEqual(runs.map(r => r.boxes[0]).sort(), [1, 2, 3, 4, 5]);
    assert.ok(runs.every(r => r.scale === l.scale && r.rootPc === l.rootPc));
    const lows = runs.map(r => Math.min(...r.notes.map(n => n.fret)));
    assert.deepEqual([...lows].sort((a, b) => a - b), lows);
  }
  assert.deepEqual(bossRuns(SCALE_LEVELS[0]).map(r => r.boxes[0]), [1, 2, 3, 4, 5]);
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
  for (let i = 0; i < WINDOW_RUNS - 1; i++) assert.equal(s.record(1, { ms: 400, mistakes: 0 }).bossUnlocked, false);
  assert.equal(s.record(1, { ms: 400, mistakes: 0 }).bossUnlocked, true);
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
