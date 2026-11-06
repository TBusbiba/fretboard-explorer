// The level path for Scales: eleven cumulative levels with a random pick from the pool for each question; recent runs
// fast and clean (and every new box played once) unlock the level's boss round of five mixed runs.
// Pure rules plus a small localStorage store; `storage` is injectable for tests.
// Mirrors path.js (Find the note) and triad-path.js.

import { NOTE_NAMES } from './notes.js';
import { SCALES, boxShape, joinShapes, lowestFret, runSequence } from './scales.js';

const KEY = 'fretboard-practice.scale-path.v2';

export const WINDOW_RUNS = 5;       // recent runs that count towards the unlock
export const AVG_NOTE_MS_MAX = 700; // average time per note over those runs
export const MAX_RUN_MISTAKES = 1;  // most soft mistakes in any one of those runs
export const STAR2_NOTE_MS = 700;   // boss average per note for 2 stars (with <= STAR2_MISTAKES)
export const STAR3_NOTE_MS = 500;   // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;

const pc = (name) => NOTE_NAMES.indexOf(name);

/** One thing to play: a scale on a root in one box, or several adjacent boxes joined into one run. */
const ex = (scale, root, ...boxes) => ({ scale, rootPc: pc(root), boxes });

const MINOR_ROOTS = ['A', 'E', 'D', 'G', 'C'];
const MAJOR_ROOTS = ['C', 'G', 'D', 'A', 'F'];
/** One exercise per root for each box set: the random root is part of the pool. */
const across = (scale, roots, ...sets) => sets.flatMap(boxes => roots.map(r => ex(scale, r, ...boxes)));
const minor = (...sets) => across('minorPentatonic', MINOR_ROOTS, ...sets);
const majPent = (...sets) => across('majorPentatonic', MAJOR_ROOTS, ...sets);
const majScale = (...sets) => across('major', MAJOR_ROOTS, ...sets);

const SPEC = [
  { title: 'Minor pentatonic, box 1', short: 'Box 1', added: minor([1]) },
  { title: 'Box 2', short: '+Box 2', added: minor([2]) },
  { title: 'Box 3', short: '+Box 3', added: minor([3]) },
  { title: 'Box 4', short: '+Box 4', added: minor([4]) },
  { title: 'Box 5', short: '+Box 5', added: minor([5]) },
  { title: 'Joined boxes', short: 'Joins', added: minor([1, 2], [2, 3], [3, 4], [4, 5]) },
  { title: 'Major pentatonic, boxes 1-2', short: 'Maj pent', added: majPent([1], [2]) },
  { title: 'Major pentatonic, all boxes', short: 'Maj pent 5', added: majPent([3], [4], [5]) },
  { title: 'Major scale, position 1', short: 'Scale 1', added: majScale([1]) },
  { title: 'Major scale, positions 2-3', short: 'Scale 2-3', added: majScale([2], [3]) },
  { title: 'Major scale, all positions', short: 'Scale 4-5', added: majScale([4], [5]) },
];

/**
 * `added`: the exercises this level brings in; `pool`: every exercise a run may ask, earlier levels
 * included; `required`: the box sets a player must have played once (any root) before the boss opens.
 */
export const SCALE_LEVELS = SPEC.map((l, i) => ({
  id: i + 1, ...l,
  scale: l.added[0].scale, rootPc: l.added[0].rootPc,
  pool: SPEC.slice(0, i + 1).flatMap(x => x.added),
  required: [...new Set(l.added.map(e => exerciseKey(e)))],
}));

/** "minorPentatonic:2" / "major:1+2": the shape without its root, for coverage. */
export function exerciseKey(e) { return `${e.scale}:${e.boxes.join('+')}`; }

export function scaleLevelById(id) { return SCALE_LEVELS.find(l => l.id === id) || null; }

/** "A minor pentatonic · box 1" / "C major · boxes 1 + 2". */
export function exerciseLabel(e) {
  const boxes = e.boxes.length > 1 ? `boxes ${e.boxes.join(' + ')}` : `box ${e.boxes[0]}`;
  return `${NOTE_NAMES[e.rootPc]} ${SCALES[e.scale].name} · ${boxes}`;
}

/** The notes of an exercise (low to high; joined boxes merged) and the up-and-down sequence to play. */
export function exerciseRun(e) {
  const notes = e.boxes.length > 1
    ? joinShapes(e.boxes.map(b => boxShape(e.scale, e.rootPc, b)))
    : boxShape(e.scale, e.rootPc, e.boxes[0]);
  return { ...e, label: exerciseLabel(e), notes, sequence: runSequence(notes) };
}

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
export const BOSS_RUNS = 5;

/**
 * Boss: five runs back to back, random roots. At least the level's new material (as many different
 * shapes as fit, 3 at most), the rest from the earlier pool; no exercise twice.
 */
export function bossRuns(level, rng = Math.random) {
  const picked = [];
  const used = new Set();
  const take = (e) => { picked.push(e); used.add(exerciseLabel(e)); };
  const newKeys = shuffle(level.required, rng).slice(0, 3);
  for (const k of newKeys) {
    const e = shuffle(level.added.filter(x => exerciseKey(x) === k), rng)[0];
    if (e) take(e);
  }
  const rest = shuffle(level.pool.filter(e => !used.has(exerciseLabel(e))), rng);
  const older = rest.filter(e => !level.required.includes(exerciseKey(e)));
  const newer = rest.filter(e => level.required.includes(exerciseKey(e)));
  for (const e of [...older, ...newer]) { if (picked.length >= BOSS_RUNS) break; take(e); }
  return shuffle(picked, rng).map(exerciseRun);
}

/**
 * The next question: while a box the level adds is still unplayed, half the time one of those; else mostly
 * what the level adds, sometimes anything unlocked. Never the same exercise twice in a row.
 */
export function pickExercise(level, previous, covered = [], rng = Math.random) {
  const todo = level.added.filter(e => !covered.includes(exerciseKey(e)));
  const base = todo.length && rng() < 0.5 ? todo : rng() < 0.6 ? level.added : level.pool;
  const fresh = base.filter(e => exerciseLabel(e) !== previous);
  const from = fresh.length ? fresh : level.pool.filter(e => exerciseLabel(e) !== previous);
  return from[Math.floor(rng() * from.length)];
}

export function blankEntry() { return { recent: [], covered: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestScore: 0, tipSeen: false }; }

/**
 * Where a level stands: over the last WINDOW_RUNS runs the average time per note <= AVG_NOTE_MS_MAX
 * and no run with more than MAX_RUN_MISTAKES mistakes, and every box set in `required` played at least once.
 * A recent run is {ms: time per note, mistakes}.
 */
export function evaluate(entry, required = []) {
  const recent = (entry.recent || []).slice(-WINDOW_RUNS);
  const runs = recent.length;
  const avgMs = runs ? recent.reduce((t, r) => t + r.ms, 0) / runs : null;
  const worst = runs ? Math.max(...recent.map(r => r.mistakes)) : null;
  const met = {
    count: runs >= WINDOW_RUNS,
    time: avgMs != null && avgMs <= AVG_NOTE_MS_MAX,
    clean: runs > 0 && worst <= MAX_RUN_MISTAKES,
    covered: required.every(k => (entry.covered || []).includes(k)),
  };
  const coverage = { done: required.filter(k => (entry.covered || []).includes(k)).length, need: required.length };
  return { runs, avgMs, worstMistakes: worst, coverage, met, unlocked: met.count && met.time && met.clean && met.covered };
}

/** 1-3 stars for a boss from its average time per note and total mistakes. */
export function scaleStarsFor(avgMs, mistakes = 0) {
  if (avgMs <= STAR3_NOTE_MS && mistakes === 0) return 3;
  if (avgMs <= STAR2_NOTE_MS && mistakes <= STAR2_MISTAKES) return 2;
  return 1;
}

// ---------- store ----------

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function sanitize(raw) {
  const levels = {};
  for (const l of SCALE_LEVELS) {
    const e = raw && raw.levels && raw.levels[l.id];
    if (!e || typeof e !== 'object') continue;
    levels[l.id] = {
      recent: (Array.isArray(e.recent) ? e.recent : [])
        .filter(r => r && typeof r.ms === 'number').slice(-WINDOW_RUNS).map(r => ({ ms: r.ms, mistakes: posInt(r.mistakes) })),
      covered: (Array.isArray(e.covered) ? e.covered : []).filter(k => typeof k === 'string'),
      bossUnlocked: !!e.bossUnlocked || !!e.done,
      done: !!e.done,
      stars: [0, 1, 2, 3].includes(e.stars) ? e.stars : 0,
      bestMs: typeof e.bestMs === 'number' ? e.bestMs : null,
      bestScore: posInt(e.bestScore),
      tipSeen: !!e.tipSeen,
    };
  }
  const current = raw && scaleLevelById(raw.current) ? raw.current : 1;
  return { current, levels };
}

export function createScalePathStore(storage = globalThis.localStorage) {
  let data = { current: 1, levels: {} };
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) data = sanitize(JSON.parse(raw));
  } catch { data = { current: 1, levels: {} }; }
  if (!isUnlocked(data.current)) data.current = 1;

  function save() {
    try { storage && storage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }
  function entry(id) { return data.levels[id] || (data.levels[id] = blankEntry()); }
  function isUnlocked(id) { return id === 1 || !!(data.levels[id - 1] && data.levels[id - 1].done); }

  return {
    get current() { return data.current; },
    get currentLevel() { return scaleLevelById(data.current); },
    isUnlocked,
    isDone: (id) => !!(data.levels[id] && data.levels[id].done),
    stars: (id) => (data.levels[id] ? data.levels[id].stars : 0),
    /** Switch to an unlocked level; false when it is still locked. */
    select(id) {
      if (!scaleLevelById(id) || !isUnlocked(id)) return false;
      data.current = id;
      save();
      return true;
    },
    /** The level's standing, plus whether its boss round is open (sticky once earned). */
    progress(id) {
      const e = entry(id);
      const ev = evaluate(e, scaleLevelById(id).required);
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    /** Log a finished run (`ms` per note, soft `mistakes`); `bossUnlocked` is true only the moment it opens. */
    record(id, { ms, mistakes = 0, key = null }) {
      const e = entry(id);
      if (key && !e.covered.includes(key)) e.covered.push(key);
      e.recent.push({ ms, mistakes: posInt(mistakes) });
      if (e.recent.length > WINDOW_RUNS) e.recent.splice(0, e.recent.length - WINDOW_RUNS);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e, scaleLevelById(id).required).unlocked) { e.bossUnlocked = true; opened = true; }
      save();
      return { bossUnlocked: opened };
    },
    /** A passed boss: level done, next level open and current, best stars kept. */
    completeBoss(id, avgMs, mistakes = 0) {
      const e = entry(id);
      const stars = scaleStarsFor(avgMs, mistakes);
      const first = !e.done;
      e.done = true; e.bossUnlocked = true;
      e.stars = Math.max(e.stars, stars);
      e.bestMs = e.bestMs == null ? avgMs : Math.min(e.bestMs, avgMs);
      const next = scaleLevelById(id + 1);
      if (next && data.current === id) data.current = next.id;
      save();
      return { stars, bestStars: e.stars, first, next: next ? next.id : null };
    },
    covered: (id) => [...entry(id).covered],
    tipSeen: (id) => entry(id).tipSeen,
    markTip(id) { const e = entry(id); if (!e.tipSeen) { e.tipSeen = true; save(); } },
    bests: (id) => ({ score: entry(id).bestScore }),
    /** Keep the higher score; saves only when it improved. */
    saveBests(id, { score = 0 }) {
      const e = entry(id);
      const c = posInt(score);
      if (c <= e.bestScore) return false;
      e.bestScore = c;
      save();
      return true;
    },
    reset() { data = { current: 1, levels: {} }; save(); },
  };
}
