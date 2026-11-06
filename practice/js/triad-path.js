// The level path for Triads: eleven cumulative levels of major and minor triads on three
// adjacent strings, each opened by answering well enough to unlock its boss round (every shape
// of the level's new chords, left to right up the neck). Pure rules plus a small localStorage
// store; `storage` is injectable for tests. Mirrors path.js (Find the note).

import { NOTE_NAMES } from './notes.js';
import { WINDOW, FIRST_TRY_MIN, AVG_MS_MAX } from './path.js';

export const STAR2_MS = 6000;      // boss average per 3-note answer for 2 stars (with <= STAR2_MISTAKES)
export const STAR3_MS = 4000;      // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;
/** 3 stars: average <= 4 s and no mistakes; 2 stars: <= 6 s and at most 2 mistakes; else 1. */
export function starsFor(avgMs, mistakes = 0) {
  return avgMs <= STAR3_MS && mistakes === 0 ? 3 : avgMs <= STAR2_MS && mistakes <= STAR2_MISTAKES ? 2 : 1;
}
import { createChainSchedule } from './chain.js';
import { voicingsFor, QUALITIES, FULL_RANGE } from './triad-match.js';

const KEY = 'fretboard-practice.triad-path.v1';

export const SHAPES = [1, 2, 3];
export const SHAPE_NAMES = ['Root position', '1st inversion', '2nd inversion'];

const pc = (name) => NOTE_NAMES.indexOf(name);
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'].map(pc);
const ACCIDENTALS = [1, 3, 6, 8, 10];
const EASY = { major: ['C', 'F', 'G'].map(pc), minor: ['A', 'D', 'E'].map(pc) };
const GROUPS = ['321', '432', '543', '654'];

const chord = (root, quality, group) => ({ root, quality, group });
const all = (roots, qualities, groups) => groups.flatMap(g => qualities.flatMap(q => roots.map(r => chord(r, q, g))));
const naturalsOn = (g) => all(NATURALS, QUALITIES, [g]);
const easyOn = (g) => [...EASY.major.map(r => chord(r, 'major', g)), ...EASY.minor.map(r => chord(r, 'minor', g))];
const minus = (list, drop) => list.filter(c => !drop.some(d => d.root === c.root && d.quality === c.quality && d.group === c.group));

const L = [];
L.push({ title: 'C F G', short: 'C F G', group: '321', added: EASY.major.map(r => chord(r, 'major', '321')) });
L.push({ title: 'Am Dm Em', short: '+Am Dm Em', group: '321', added: EASY.minor.map(r => chord(r, 'minor', '321')) });
L.push({ title: 'D A E', short: '+D A E', group: '321', added: ['D', 'A', 'E'].map(n => chord(pc(n), 'major', '321')) });
L.push({ title: 'All naturals', short: '+B, minors', group: '321',
  added: [chord(pc('B'), 'major', '321'), ...['C', 'F', 'G', 'B'].map(n => chord(pc(n), 'minor', '321'))] });
for (const g of ['432', '543', '654']) {
  L.push({ title: `Strings ${[...g].join('·')}`, short: `+${[...g].join('·')}`, group: g, added: easyOn(g) });
  L.push({ title: `Naturals on ${[...g].join('·')}`, short: `All ${[...g].join('·')}`, group: g, added: minus(naturalsOn(g), easyOn(g)) });
}
L.push({ title: 'Everything', short: '♯ ♭', group: '654', added: all(ACCIDENTALS, QUALITIES, ['654']) });

/**
 * `added`: the chords this level brings in (the boss group, one entry per root, quality and
 * string group); `group`: the newest string group (where shape coverage counts); `pool`: every
 * chord a question may ask, earlier levels included.
 */
export const TRIAD_LEVELS = L.map((l, i) => {
  const pool = i === 10
    ? all([...NATURALS, ...ACCIDENTALS], QUALITIES, GROUPS)
    : L.slice(0, i + 1).flatMap(x => x.added);
  return { id: i + 1, ...l, pool };
});

export function triadLevelById(id) { return TRIAD_LEVELS.find(l => l.id === id) || null; }

export const chordKey = (c) => `${c.root}:${c.quality}:${c.group}`;
export const shapeKey = (quality, shape) => `${quality}:${shape}`;

/** The shape-coverage keys a level asks: each shape of each quality the level has on its newest group. */
export function requiredShapes(level) {
  const qualities = QUALITIES.filter(q => level.pool.some(c => c.group === level.group && c.quality === q));
  return qualities.flatMap(q => SHAPES.map(s => shapeKey(q, s)));
}

export function blankEntry() { return { recent: [], shapes: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestStreak: 0, bestScore: 0, tipSeen: false }; }

/**
 * Where a level stands against the unlock rule: over the last WINDOW answers first try >= 75% and
 * average <= 6 s, and every shape of every quality on the newest group found at least once.
 */
export function evaluate(entry, level) {
  const recent = (entry.recent || []).slice(-WINDOW);
  const answered = recent.length;
  const firstTry = recent.filter(a => a.ft).length;
  const avgMs = answered ? recent.reduce((t, a) => t + a.ms, 0) / answered : null;
  const required = requiredShapes(level);
  const have = new Set(entry.shapes || []);
  const missing = required.filter(k => !have.has(k));
  const met = {
    count: answered >= WINDOW,
    firstTry: answered > 0 && firstTry >= answered * FIRST_TRY_MIN - 1e-9,
    time: avgMs != null && avgMs <= AVG_MS_MAX,
    shapes: required.length > 0 && missing.length === 0,
  };
  return {
    answered, firstTry, firstTryPct: answered ? Math.round((firstTry / answered) * 100) : null, avgMs,
    shapes: required.length - missing.length, shapesTotal: required.length, missing, met,
    unlocked: met.count && met.firstTry && met.time && met.shapes,
  };
}

// ---------- question bag ----------

/**
 * Questions come from a shuffled bag of the level's chord pool: every chord is asked once before
 * any repeats, and chords on the newest group whose quality still has a missing shape go first.
 * `missing` is evaluate()'s missing list.
 */
export function createTriadBag(rng = Math.random) {
  let bag = [], key = '', last = null;
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  return {
    next(level, missing = []) {
      if (!level.pool.length) return null;
      if (key !== String(level.id)) { key = String(level.id); bag = []; }
      if (!bag.length) {
        const wanted = new Set(missing.map(k => k.split(':')[0]));
        const first = (c) => c.group === level.group && wanted.has(c.quality);
        bag = [...shuffle(level.pool.filter(first)), ...shuffle(level.pool.filter(c => !first(c)))];
        if (bag.length > 1 && last && chordKey(bag[0]) === chordKey(last)) bag.push(bag.shift());
      }
      last = bag.shift();
      return { ...last };
    },
  };
}

// ---------- boss round ----------

/**
 * One run per new chord of the level; in each run the player plays every shape of that chord
 * inside the range (default frets 0-12), left to right up the neck. Wrong notes are counted, not
 * fatal; skipping ends the round. The average answer time and the mistakes set the stars.
 */
export function createTriadBoss(level, range = FULL_RANGE) {
  const runs = level.added.map(c => ({ ...c, voicings: voicingsFor(c.root, c.quality, c.group, range) }));
  const items = runs.flatMap((r, run) => r.voicings.map((v, i) => ({
    root: r.root, quality: r.quality, group: r.group, voicing: v, shape: v.shape, run, n: i + 1, of: r.voicings.length,
  })));
  const boss = {
    levelId: level.id, range, runs, items, index: 0, times: [], mistakes: 0,
    state: items.length ? 'running' : 'failed', reason: items.length ? null : 'empty',
    get current() { return boss.state === 'running' ? boss.items[boss.index] : null; },
    get avgMs() { return boss.times.length ? boss.times.reduce((a, b) => a + b, 0) / boss.times.length : null; },
    get totalMs() { return boss.times.reduce((a, b) => a + b, 0); },
    get stars() { return boss.state === 'passed' ? starsFor(boss.avgMs, boss.mistakes) : 0; },
    /** Shapes of the current chord already found, in order. */
    get found() { const c = boss.items[boss.index]; return c ? boss.items.slice(0, boss.index).filter(i => i.run === c.run) : []; },
    /** True when the current shape is the first of its chord (a new chord starts). */
    get runStart() { const c = boss.current; return !!c && c.n === 1; },
    wrong() { if (boss.state === 'running') boss.mistakes += 1; return boss.mistakes; },
    correct(ms) {
      if (boss.state !== 'running') return boss.state;
      boss.times.push(ms);
      boss.index += 1;
      if (boss.index >= boss.items.length) boss.state = 'passed';
      return boss.state;
    },
    fail(reason) {
      if (boss.state === 'running') { boss.state = 'failed'; boss.reason = reason; }
      return boss.state;
    },
  };
  return boss;
}

// ---------- climb the neck (the chain) ----------

export const createClimbSchedule = createChainSchedule;

/** The chord's first 3 shapes up the neck (frets 0-12; reaching to 17 when the neck below 12 holds fewer than 3). */
export function climbVoicings(c) {
  let vs = voicingsFor(c.root, c.quality, c.group, FULL_RANGE);
  if (vs.length < 3) vs = voicingsFor(c.root, c.quality, c.group, { from: 0, to: 17 });
  return vs.slice(0, 3);
}

/** A random pool chord for a climb, preferring chords on the level's newest group. */
export function pickClimbChord(level, rng = Math.random) {
  const near = level.pool.filter(c => c.group === level.group);
  const pool = near.length ? near : level.pool;
  return pool.length ? { ...pool[Math.floor(rng() * pool.length)] } : null;
}

/** "+N frets" between two voicings; null for the first. */
export function climbHint(steps, index) {
  if (index < 1 || index >= steps.length) return null;
  const n = steps[index].voicing.lowestFret - steps[index - 1].voicing.lowestFret;
  return `+${n} fret${n === 1 ? '' : 's'}`;
}

/** One climb in progress: the chord's 3 shapes in order up the neck. */
export function createClimb(c, levelId) {
  const steps = climbVoicings(c).map((v, i) => ({ voicing: v, shape: v.shape, n: i + 1 }));
  const climb = {
    ...c, levelId, steps, index: 0, perfect: true, done: false,
    get current() { return climb.done ? null : climb.steps[climb.index]; },
    get hint() { return climbHint(climb.steps, climb.index); },
    miss() { climb.perfect = false; },
    /** The current shape was played; `clean` = right first try without a hint. */
    advance(clean) {
      if (!clean) climb.perfect = false;
      climb.index += 1;
      if (climb.index >= climb.steps.length) climb.done = true;
      return { done: climb.done, perfect: climb.perfect };
    },
  };
  return climb;
}

// ---------- store ----------

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
const VALID_SHAPE_KEYS = new Set(QUALITIES.flatMap(q => SHAPES.map(s => shapeKey(q, s))));

function sanitize(raw) {
  const levels = {};
  for (const l of TRIAD_LEVELS) {
    const e = raw && raw.levels && raw.levels[l.id];
    if (!e || typeof e !== 'object') continue;
    levels[l.id] = {
      recent: (Array.isArray(e.recent) ? e.recent : [])
        .filter(a => a && typeof a.ms === 'number').slice(-WINDOW).map(a => ({ ft: !!a.ft, ms: a.ms })),
      shapes: (Array.isArray(e.shapes) ? e.shapes : []).filter(k => VALID_SHAPE_KEYS.has(k)),
      bossUnlocked: !!e.bossUnlocked || !!e.done,
      done: !!e.done,
      stars: [0, 1, 2, 3].includes(e.stars) ? e.stars : 0,
      bestMs: typeof e.bestMs === 'number' ? e.bestMs : null,
      bestStreak: posInt(e.bestStreak),
      bestScore: posInt(e.bestScore),
      tipSeen: !!e.tipSeen,
    };
  }
  const current = raw && triadLevelById(raw.current) ? raw.current : 1;
  return { current, levels };
}

export function createTriadPathStore(storage = globalThis.localStorage) {
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
    get currentLevel() { return triadLevelById(data.current); },
    isUnlocked,
    isDone: (id) => !!(data.levels[id] && data.levels[id].done),
    stars: (id) => (data.levels[id] ? data.levels[id].stars : 0),
    /** Switch to an unlocked level; false when it is still locked. */
    select(id) {
      if (!triadLevelById(id) || !isUnlocked(id)) return false;
      data.current = id;
      save();
      return true;
    },
    /** The level's standing, plus whether its boss round is open (sticky once earned). */
    progress(id) {
      const e = entry(id);
      const ev = evaluate(e, triadLevelById(id));
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    /** True when this quality's shape was already found on the level's newest group (for the "Try another shape" nudge). */
    shapeCovered: (id, quality, shape) => entry(id).shapes.includes(shapeKey(quality, shape)),
    /**
     * Log a correct answer in a level (`shape` 1-3 of the voicing played, `group` of the question);
     * `bossUnlocked` is true only the moment it opens, `newShape` when it lit a new coverage dot.
     */
    record(id, { quality, group, shape, firstTry, ms }) {
      const e = entry(id), level = triadLevelById(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      const key = shapeKey(quality, shape);
      let newShape = false;
      if (group === level.group && VALID_SHAPE_KEYS.has(key) && !e.shapes.includes(key)) { e.shapes.push(key); newShape = true; }
      let opened = false;
      if (!e.bossUnlocked && evaluate(e, level).unlocked) { e.bossUnlocked = true; opened = true; }
      save();
      return { bossUnlocked: opened, newShape };
    },
    /** A passed boss: level done, next level open and current, best stars kept. */
    completeBoss(id, avgMs, mistakes = 0) {
      const e = entry(id);
      const stars = starsFor(avgMs, mistakes);
      const first = !e.done;
      e.done = true; e.bossUnlocked = true;
      e.stars = Math.max(e.stars, stars);
      e.bestMs = e.bestMs == null ? avgMs : Math.min(e.bestMs, avgMs);
      const next = triadLevelById(id + 1);
      if (next && data.current === id) data.current = next.id;
      save();
      return { stars, bestStars: e.stars, first, next: next ? next.id : null };
    },
    tipSeen: (id) => entry(id).tipSeen,
    markTip(id) { const e = entry(id); if (!e.tipSeen) { e.tipSeen = true; save(); } },
    bests: (id) => ({ streak: entry(id).bestStreak, score: entry(id).bestScore }),
    /** Keep the higher of each; saves only when something improved. */
    saveBests(id, { streak = 0, score = 0 }) {
      const e = entry(id);
      const s = posInt(streak), c = posInt(score);
      if (s <= e.bestStreak && c <= e.bestScore) return false;
      e.bestStreak = Math.max(e.bestStreak, s); e.bestScore = Math.max(e.bestScore, c);
      save();
      return true;
    },
    reset() { data = { current: 1, levels: {} }; save(); },
  };
}
