// The level path for Find the note: eight landmark levels, each opened by
// answering well enough to unlock its boss round. Levels 1-4 are defined by
// explicit spots (string + fret) that carry a trick to remember: fret 12 = fret 0,
// BEAD at fret 7, the G A B dots on the E strings, the same dots on the A string.
// Levels 5-8 are notes on every string. Pure rules plus a small localStorage
// store; `storage` is injectable for tests.
//
// Level progress lives per level: the last WINDOW answers (first try or not,
// how fast) and every spot answered correctly so far. A level's boss round
// unlocks once, then stays unlocked.

import { NOTE_NAMES, STRINGS, pitchClass } from './notes.js';

const KEY = 'fretboard-practice.path.v3';

export const WINDOW = 20;          // answers that count towards the unlock
export const FIRST_TRY_MIN = 0.75;  // share answered right on the first try
export const AVG_MS_MAX = 6000;    // average answer time
export const STAR2_MS = 3000;      // boss average per note for 2 stars
export const STAR3_MS = 2000;      // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;   // most mistakes that still earn 2 stars
export const BOSS_ALL_NOTES = 4;   // notes the "All" level's boss runs through
export const MAX_FRET = 12;        // every level lives in frets 0-12
export const REVIEW_P = 0.25;      // chance of a review question after a normal one; never twice in a row, so ~20% overall

const pcs = (names) => names.map(n => NOTE_NAMES.indexOf(n));
const spotsOf = (strings, frets) => strings.flatMap(string => frets.map(fret => ({ string, fret })));
const uniquePcs = (spots) => [...new Set(spots.map(s => pitchClass(STRINGS[s.string].midi + s.fret)))];
const NATURALS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const SHARPS = ['C♯', 'D♯', 'F♯', 'G♯', 'A♯'];

const SPOT_LEVELS = [
  { short: 'Open', title: 'Open strings', spots: spotsOf([5, 4, 3, 2, 1, 0], [0, 12]) },
  { short: 'BEAD', title: 'BEAD', spots: spotsOf([5, 4, 3, 2], [7]) },
  { short: 'G A B', title: 'Gift of the gab', spots: [...spotsOf([5], [3, 5, 7]), ...spotsOf([0], [3, 5, 7])] },
  { short: 'C D E', title: 'A-string dots', spots: spotsOf([4], [3, 5, 7]) },
];
const NOTE_LEVELS = [
  { short: 'E F B C', title: 'Neighbours', notes: pcs(['E', 'F', 'B', 'C']) },
  { short: 'Naturals', title: 'All naturals', notes: pcs(NATURALS) },
  { short: 'Sharps', title: 'Sharps', notes: pcs(SHARPS) },
  { short: 'All', title: 'Everything', notes: NOTE_NAMES.map((_, i) => i) },
];

/** Levels 1-4 carry `spots`; 5-8 only `notes` (asked on every string). `notes` is always the pitch classes involved. */
export const LEVELS = [...SPOT_LEVELS.map(l => ({ ...l, notes: uniquePcs(l.spots) })), ...NOTE_LEVELS]
  .map((l, i) => ({ id: i + 1, ...l }));

export function levelById(id) { return LEVELS.find(l => l.id === id) || null; }

export function levelTitle(level) { return level.title; }

/**
 * The frets a level is asked in. Spot levels (1-4) are the lesson itself, so they
 * always use their own frets whatever the fret-range setting says; note levels use
 * the setting, kept inside 0-12.
 */
export function levelRange(level, range) {
  if (level.spots) return { from: 0, to: MAX_FRET };
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

/** Coverage key: `string@fret` for a spot level, `pc:string` (any fret) for a note level. */
export function spotKey(level, string, fret) {
  return level.spots ? `${string}@${fret}` : `${pitchClass(STRINGS[string].midi + fret)}:${string}`;
}

/** What the level asks, as coverage keys, inside the fret range. */
export function requiredSpots(level, range) {
  if (level.spots) return level.spots.map(s => spotKey(level, s.string, s.fret));
  const r = levelRange(level, range), out = [];
  for (const pc of level.notes) {
    for (const s of STRINGS) if (fretsFor(pc, s.index, r).length) out.push(`${pc}:${s.index}`);
  }
  return out;
}

/** Every concrete {string, fret} the level can ask inside the fret range. */
export function levelSpots(level, range) {
  if (level.spots) return level.spots.map(s => ({ ...s }));
  const r = levelRange(level, range), out = [];
  for (const s of STRINGS) {
    for (let fret = r.from; fret <= r.to; fret++) if (level.notes.includes(pitchClass(s.midi + fret))) out.push({ string: s.index, fret });
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

/**
 * The notes a boss runs through: a spot level's own notes (level 2 BEAD: B, E, A, D),
 * a note level's notes. The "All" level has twelve, too many for one run, so it
 * gets BOSS_ALL_NOTES of them at random (kept in pitch order).
 */
export function bossNotes(level, rng = Math.random) {
  if (level.notes.length <= BOSS_ALL_NOTES * 2) return [...level.notes];
  const pool = [...level.notes];
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  return pool.slice(0, BOSS_ALL_NOTES).sort((a, b) => a - b);
}

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
export function createBoss(level, range, rng = Math.random) {
  const runs = bossNotes(level, rng).map(pc => ({ pc, spots: noteSpots(pc) }));
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
      if (level.spots) { const [string, fret] = last.split('@').map(Number); return { string, fret }; }
      const [pc, string] = last.split(':').map(Number);
      const frets = fretsFor(pc, string, lr);
      const w = frets.map(f => Math.max(1e-6, weigh(string, f)));
      let r = rng() * w.reduce((a, b) => a + b, 0);
      const fret = frets.find((f, i) => (r -= w[i]) < 0) ?? frets[frets.length - 1];
      return { string, fret };
    },
  };
}

// ---------- review questions ----------

/** Every spot of the levels before `level`, as {string, fret}, without duplicates. */
export function reviewPool(level, range) {
  const seen = new Set(), out = [];
  for (const l of LEVELS) {
    if (l.id >= level.id) break;
    for (const s of levelSpots(l, range)) {
      const k = `${s.string}:${s.fret}`;
      if (!seen.has(k)) { seen.add(k); out.push(s); }
    }
  }
  return out;
}

/**
 * Review questions: about one in five comes from an earlier level so old landmarks
 * stay warm. `next(level, range, weigh)` returns a review spot or null (a normal
 * question). Never twice in a row, never on level 1.
 */
export function createReviewMixer(rng = Math.random) {
  let prev = false, last = null;
  return {
    next(level, range, weigh = () => 1) {
      const wasReview = prev;
      prev = false;
      if (wasReview || level.id <= 1 || rng() >= REVIEW_P) return null;
      const pool = reviewPool(level, range).filter(s => !last || s.string !== last.string || s.fret !== last.fret);
      if (!pool.length) return null;
      const w = pool.map(s => Math.max(1e-6, weigh(s.string, s.fret)));
      let r = rng() * w.reduce((a, b) => a + b, 0);
      const pick = pool.find((_, i) => (r -= w[i]) < 0) ?? pool[pool.length - 1];
      prev = true; last = pick;
      return { string: pick.string, fret: pick.fret };
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
     * A review answer counts for the window but not for the level's coverage.
     */
    record(id, { string, fret, firstTry, ms, review = false }, range) {
      const e = entry(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      const key = spotKey(levelById(id), string, fret);
      if (!review && !e.covered.includes(key)) e.covered.push(key);
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
