// The level path for Scales: eleven cumulative levels, each opened by playing recent runs fast and
// clean enough to unlock its boss round (all five boxes of the level's scale up the neck).
// Pure rules plus a small localStorage store; `storage` is injectable for tests.
// Mirrors path.js (Find the note) and triad-path.js.

import { NOTE_NAMES } from './notes.js';
import { SCALES, boxShape, joinShapes, lowestFret, runSequence } from './scales.js';

const KEY = 'fretboard-practice.scale-path.v1';

export const WINDOW_RUNS = 5;       // recent runs that count towards the unlock
export const AVG_NOTE_MS_MAX = 700; // average time per note over those runs
export const MAX_RUN_MISTAKES = 1;  // most soft mistakes in any one of those runs
export const STAR2_NOTE_MS = 700;   // boss average per note for 2 stars (with <= STAR2_MISTAKES)
export const STAR3_NOTE_MS = 500;   // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;

const pc = (name) => NOTE_NAMES.indexOf(name);

/** One thing to play: a scale on a root in one box, or several adjacent boxes joined into one run. */
const ex = (scale, root, ...boxes) => ({ scale, rootPc: pc(root), boxes });

const SPEC = [
  { title: 'A minor pent, box 1', short: 'Box 1', added: [ex('minorPentatonic', 'A', 1)] },
  { title: 'Box 2', short: 'Box 2', added: [ex('minorPentatonic', 'A', 2)] },
  { title: 'Box 3', short: 'Box 3', added: [ex('minorPentatonic', 'A', 3)] },
  { title: 'Box 4', short: 'Box 4', added: [ex('minorPentatonic', 'A', 4)] },
  { title: 'Box 5', short: 'Box 5', added: [ex('minorPentatonic', 'A', 5)] },
  { title: 'Box to box', short: '1 + 2', added: [ex('minorPentatonic', 'A', 1, 2)] },
  { title: 'E minor pent', short: 'E min', added: [ex('minorPentatonic', 'E', 1), ex('minorPentatonic', 'E', 2)] },
  { title: 'G major pent', short: 'G maj', added: [ex('majorPentatonic', 'G', 1), ex('majorPentatonic', 'G', 2)] },
  { title: 'C major scale', short: 'C scale', added: [ex('major', 'C', 1)] },
  { title: 'C major, two positions', short: 'C 1 + 2', added: [ex('major', 'C', 2), ex('major', 'C', 1, 2)] },
  { title: 'G major scale', short: 'G scale', added: [ex('major', 'G', 1), ex('major', 'G', 2), ex('major', 'G', 3)] },
];

/**
 * `added`: the exercises this level brings in; `pool`: every exercise a run may ask, earlier levels
 * included; `scale`/`rootPc`: what the boss plays all five boxes of.
 */
export const SCALE_LEVELS = SPEC.map((l, i) => ({
  id: i + 1, ...l,
  scale: l.added[0].scale, rootPc: l.added[0].rootPc,
  pool: SPEC.slice(0, i + 1).flatMap(x => x.added),
}));

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

/** Boss: one run per box of the level's scale, 1-5, ordered up the neck. */
export function bossRuns(level) {
  return [1, 2, 3, 4, 5]
    .map(box => exerciseRun({ scale: level.scale, rootPc: level.rootPc, boxes: [box] }))
    .sort((a, b) => lowestFret(a.notes) - lowestFret(b.notes) || a.boxes[0] - b.boxes[0]);
}

export function blankEntry() { return { recent: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestScore: 0, tipSeen: false }; }

/**
 * Where a level stands: over the last WINDOW_RUNS runs the average time per note <= AVG_NOTE_MS_MAX
 * and no run with more than MAX_RUN_MISTAKES mistakes. A recent run is {ms: time per note, mistakes}.
 */
export function evaluate(entry) {
  const recent = (entry.recent || []).slice(-WINDOW_RUNS);
  const runs = recent.length;
  const avgMs = runs ? recent.reduce((t, r) => t + r.ms, 0) / runs : null;
  const worst = runs ? Math.max(...recent.map(r => r.mistakes)) : null;
  const met = {
    count: runs >= WINDOW_RUNS,
    time: avgMs != null && avgMs <= AVG_NOTE_MS_MAX,
    clean: runs > 0 && worst <= MAX_RUN_MISTAKES,
  };
  return { runs, avgMs, worstMistakes: worst, met, unlocked: met.count && met.time && met.clean };
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
      const ev = evaluate(e);
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    /** Log a finished run (`ms` per note, soft `mistakes`); `bossUnlocked` is true only the moment it opens. */
    record(id, { ms, mistakes = 0 }) {
      const e = entry(id);
      e.recent.push({ ms, mistakes: posInt(mistakes) });
      if (e.recent.length > WINDOW_RUNS) e.recent.splice(0, e.recent.length - WINDOW_RUNS);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e).unlocked) { e.bossUnlocked = true; opened = true; }
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
