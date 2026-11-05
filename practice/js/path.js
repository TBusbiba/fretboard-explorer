// The level path for Find the note: eleven cumulative levels, each opened by
// answering well enough to unlock its boss round. Level 1 is E and A; every
// level after adds one note (D, B, G, C, F, then the sharps F♯ C♯ G♯ D♯ A♯), and
// a level asks all the notes so far on every string. Pure rules plus a small
// localStorage store; `storage` is injectable for tests.
//
// Level progress lives per level: the last WINDOW answers (first try or not,
// how fast) and every note-on-string answered correctly so far. A level's boss
// round unlocks once, then stays unlocked.

import { NOTE_NAMES, STRINGS, pitchClass } from './notes.js';

const KEY = 'fretboard-practice.path.v4';

export const WINDOW = 20;          // answers that count towards the unlock
export const FIRST_TRY_MIN = 0.75;  // share answered right on the first try
export const AVG_MS_MAX = 6000;    // average answer time
export const STAR2_MS = 3000;      // boss average per note for 2 stars
export const STAR3_MS = 2000;      // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;   // most mistakes that still earn 2 stars
export const MAX_FRET = 12;        // every level lives in frets 0-12

// The order notes join the path; level 1 starts with the first two.
const ORDER = ['E', 'A', 'D', 'B', 'G', 'C', 'F', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
const TITLES = ['E and A', 'Add D', 'BEAD', 'Gift of the gab', 'Add C', 'All naturals', 'Add F♯', 'Add C♯', 'Add G♯', 'Add D♯', 'Everything'];
const pc = (name) => NOTE_NAMES.indexOf(name);

/** `notes`: every pitch class the level asks; `added`: the ones this level brings in (the boss group). */
export const LEVELS = TITLES.map((title, i) => {
  const added = ORDER.slice(i === 0 ? 0 : i + 1, i + 2).map(pc);
  return {
    id: i + 1, title, added,
    short: i === 0 ? 'E A' : `+${ORDER[i + 1]}`,
    notes: ORDER.slice(0, i + 2).map(pc),
  };
});

export function levelById(id) { return LEVELS.find(l => l.id === id) || null; }

export function levelTitle(level) { return level.title; }

/** The frets a level is asked in: the fret-range setting, kept inside 0-12. */
export function levelRange(level, range) {
  return { from: Math.max(0, range.from), to: Math.min(MAX_FRET, range.to) };
}

/** Frets within `range` where `string` sounds pitch class `pc`. */
export function fretsFor(pc, string, { from, to }) {
  const out = [];
  for (let fret = from; fret <= to; fret++) if (pitchClass(STRINGS[string].midi + fret) === pc) out.push(fret);
  return out;
}

/** Fret suffix for a boss prompt when the same note sounds twice on that string in 0-12 (open vs 12th); '' otherwise. */
export function bossFretLabel(string, fret) {
  const pc = pitchClass(STRINGS[string].midi + fret);
  if (fretsFor(pc, string, { from: 0, to: MAX_FRET }).length < 2) return '';
  return fret === 0 ? 'open' : `fret ${fret}`;
}

/** Coverage key: the note and the string (any fret). */
export function spotKey(level, string, fret) {
  return `${pitchClass(STRINGS[string].midi + fret)}:${string}`;
}

/** What the level asks, as coverage keys, inside the fret range. */
export function requiredSpots(level, range) {
  const r = levelRange(level, range), out = [];
  for (const pc of level.notes) {
    for (const s of STRINGS) if (fretsFor(pc, s.index, r).length) out.push(`${pc}:${s.index}`);
  }
  return out;
}

export function blankEntry() { return { recent: [], covered: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestStreak: 0, bestScore: 0, tipSeen: false }; }

/**
 * Where a level stands against the unlock rule: over the last WINDOW answers
 * first try >= 75% and average <= 6 s, and every level note answered correctly
 * on every string (that has it in range) at least once.
 */
export function evaluate(entry, level, range) {
  const recent = (entry.recent || []).slice(-WINDOW);
  const answered = recent.length;
  const firstTry = recent.filter(a => a.ft).length;
  const avgMs = answered ? recent.reduce((t, a) => t + a.ms, 0) / answered : null;
  const required = requiredSpots(level, range);
  const have = new Set(entry.covered || []);
  const missing = required.filter(k => !have.has(k));
  const met = {
    count: answered >= WINDOW,
    firstTry: answered > 0 && firstTry >= answered * FIRST_TRY_MIN - 1e-9,
    time: avgMs != null && avgMs <= AVG_MS_MAX,
    spots: required.length > 0 && missing.length === 0,
  };
  return {
    answered, firstTry, firstTryPct: answered ? Math.round((firstTry / answered) * 100) : null, avgMs,
    spots: required.length - missing.length, spotsTotal: required.length, missing, met,
    unlocked: met.count && met.firstTry && met.time && met.spots,
  };
}

/** 3 stars: average <= 2 s and no mistakes; 2 stars: <= 3 s and at most 2 mistakes; else 1. */
export function starsFor(avgMs, mistakes = 0) {
  return avgMs <= STAR3_MS && mistakes === 0 ? 3 : avgMs <= STAR2_MS && mistakes <= STAR2_MISTAKES ? 2 : 1;
}

// ---------- boss round ----------

/** The notes a boss runs through: the ones this level adds. */
export function bossNotes(level) { return [...level.added]; }

/** Every spot of a note in frets 0-12, left to right: by fret, and at one fret the thicker (lower) string first. */
export function noteSpots(pc) {
  const out = [];
  for (const s of STRINGS) for (const fret of fretsFor(pc, s.index, { from: 0, to: MAX_FRET })) out.push({ string: s.index, fret });
  return out.sort((a, b) => a.fret - b.fret || b.string - a.string);
}

/**
 * One run per note of the level's group; in each run the player plays every spot of
 * that note from fret 0 to 12, left to right. The user's fret range does not apply.
 * Wrong notes are counted, not fatal; skipping ends the round. The average answer
 * time and the mistakes set the stars.
 */
export function createBoss(level) {
  const runs = bossNotes(level).map(pc => ({ pc, spots: noteSpots(pc) }));
  const items = runs.flatMap((r, run) => r.spots.map((s, i) => ({ ...s, pc: r.pc, run, n: i + 1, of: r.spots.length })));
  const boss = {
    levelId: level.id, runs, items, index: 0, times: [], mistakes: 0,
    state: items.length ? 'running' : 'failed', reason: items.length ? null : 'empty',
    get current() { return boss.state === 'running' ? boss.items[boss.index] : null; },
    get avgMs() { return boss.times.length ? boss.times.reduce((a, b) => a + b, 0) / boss.times.length : null; },
    get totalMs() { return boss.times.reduce((a, b) => a + b, 0); },
    get stars() { return boss.state === 'passed' ? starsFor(boss.avgMs, boss.mistakes) : 0; },
    /** Spots of the current run already found, in order. */
    get found() { const c = boss.items[boss.index]; return c ? boss.items.slice(0, boss.index).filter(i => i.run === c.run) : []; },
    /** True when the current spot is the first of its run (a new note starts). */
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

// ---------- question weighting ----------

/**
 * Path questions come from a shuffled bag of the level's note-on-string spots:
 * every spot is asked once before any repeats, so none can hide for long, and
 * spots not found yet go to the front of each new bag. Within a spot the fret
 * leans to what is missed or slow (`weigh`).
 */
export function createSpotBag(rng = Math.random) {
  let bag = [], key = '', last = null;
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  return {
    next(level, range, missing = [], weigh = () => 1) {
      const required = requiredSpots(level, range);
      if (!required.length) return null;
      const lr = levelRange(level, range);
      const k = `${level.id}|${lr.from}-${lr.to}`;
      if (k !== key) { key = k; bag = []; }
      bag = bag.filter(s => required.includes(s));
      if (!bag.length) {
        const open = new Set(missing);
        bag = [...shuffle(required.filter(s => open.has(s))), ...shuffle(required.filter(s => !open.has(s)))];
        if (bag.length > 1 && bag[0] === last) bag.push(bag.shift());
      }
      last = bag.shift();
      const [pc, string] = last.split(':').map(Number);
      const frets = fretsFor(pc, string, lr);
      const w = frets.map(f => Math.max(1e-6, weigh(string, f)));
      let r = rng() * w.reduce((a, b) => a + b, 0);
      const fret = frets.find((f, i) => (r -= w[i]) < 0) ?? frets[frets.length - 1];
      return { string, fret };
    },
  };
}

/**
 * Likelier picks for spots the player misses or is slow on, from
 * history.positions(): unpractised spots weigh 2, practised ones 1 to 4 by (1 - mastery).
 */
export function positionWeigher(positions) {
  const byKey = new Map(positions.map(p => [`${p.string}:${p.fret}`, p]));
  return (string, fret) => {
    const p = byKey.get(`${string}:${fret}`);
    return p && p.mastery != null ? 1 + 3 * (1 - p.mastery) : 2;
  };
}

// ---------- store ----------

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function sanitize(raw) {
  const levels = {};
  for (const l of LEVELS) {
    const e = raw && raw.levels && raw.levels[l.id];
    if (!e || typeof e !== 'object') continue;
    levels[l.id] = {
      recent: (Array.isArray(e.recent) ? e.recent : [])
        .filter(a => a && typeof a.ms === 'number').slice(-WINDOW).map(a => ({ ft: !!a.ft, ms: a.ms })),
      covered: (Array.isArray(e.covered) ? e.covered : []).filter(k => typeof k === 'string'),
      bossUnlocked: !!e.bossUnlocked || !!e.done,
      done: !!e.done,
      stars: [0, 1, 2, 3].includes(e.stars) ? e.stars : 0,
      bestMs: typeof e.bestMs === 'number' ? e.bestMs : null,
      bestStreak: posInt(e.bestStreak),
      bestScore: posInt(e.bestScore),
      tipSeen: !!e.tipSeen,
    };
  }
  const current = raw && levelById(raw.current) ? raw.current : 1;
  return { current, levels };
}

export function createPath(storage = globalThis.localStorage) {
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
    get currentLevel() { return levelById(data.current); },
    isUnlocked,
    isDone: (id) => !!(data.levels[id] && data.levels[id].done),
    stars: (id) => (data.levels[id] ? data.levels[id].stars : 0),
    /** Switch to an unlocked level; false when it is still locked. */
    select(id) {
      if (!levelById(id) || !isUnlocked(id)) return false;
      data.current = id;
      save();
      return true;
    },
    /** The level's standing, plus whether its boss round is open (sticky once earned). */
    progress(id, range) {
      const e = entry(id);
      const ev = evaluate(e, levelById(id), range);
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    /**
     * Log a correct answer in a level; `bossUnlocked` is true only the moment it opens.
     */
    record(id, { string, fret, firstTry, ms }, range) {
      const e = entry(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      const key = spotKey(levelById(id), string, fret);
      if (!e.covered.includes(key)) e.covered.push(key);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e, levelById(id), range).unlocked) { e.bossUnlocked = true; opened = true; }
      save();
      return { bossUnlocked: opened };
    },
    /** A passed boss: level done, next level open and current, best stars kept. */
    completeBoss(id, avgMs, mistakes = 0) {
      const e = entry(id);
      const stars = starsFor(avgMs, mistakes);
      const first = !e.done;
      e.done = true; e.bossUnlocked = true;
      e.stars = Math.max(e.stars, stars);
      e.bestMs = e.bestMs == null ? avgMs : Math.min(e.bestMs, avgMs);
      const next = levelById(id + 1);
      if (next && data.current === id) data.current = next.id;
      save();
      return { stars, bestStars: e.stars, first, next: next ? next.id : null };
    },
    /** Whether the level's tip card has been shown before, and mark it shown. */
    tipSeen: (id) => entry(id).tipSeen,
    markTip(id) { const e = entry(id); if (!e.tipSeen) { e.tipSeen = true; save(); } },
    /** Saved best streak and score of a level. */
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
