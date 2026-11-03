// The level path for Find the note: nine levels of pitch classes, each opened
// by answering well enough to unlock its boss round. Pure rules plus a small
// localStorage store; `storage` is injectable for tests.
//
// Level progress lives per level: the last WINDOW answers (first try or not,
// how fast) and every note-on-string spot answered correctly so far. A level's
// boss round unlocks once, then stays unlocked.

import { NOTE_NAMES, STRINGS, pitchClass } from './notes.js';

const KEY = 'fretboard-practice.path.v1';

export const WINDOW = 20;          // answers that count towards the unlock
export const FIRST_TRY_MIN = 0.75;  // share answered right on the first try
export const AVG_MS_MAX = 6000;    // average answer time
export const STAR2_MS = 3000;      // boss average per note for 2 stars
export const STAR3_MS = 2000;      // ... and for 3 stars

const pcs = (names) => names.map(n => NOTE_NAMES.indexOf(n));

export const LEVELS = [
  { id: 1, notes: pcs(['E', 'A']), short: 'E A' },
  { id: 2, notes: pcs(['D', 'G']), short: 'D G' },
  { id: 3, notes: pcs(['E', 'A', 'D', 'G']), short: 'E A D G', title: 'Review E A D G', review: true },
  { id: 4, notes: pcs(['B', 'C']), short: 'B C' },
  { id: 5, notes: pcs(['F']), short: 'F' },
  { id: 6, notes: pcs(['C', 'D', 'E', 'F', 'G', 'A', 'B']), short: 'C–B', title: 'Review all naturals', review: true },
  { id: 7, notes: pcs(['F♯', 'C♯']), short: 'F♯ C♯' },
  { id: 8, notes: pcs(['G♯', 'D♯', 'A♯']), short: 'G♯ D♯ A♯' },
  { id: 9, notes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], short: 'All 12', title: 'Everything' },
];

export function levelById(id) { return LEVELS.find(l => l.id === id) || null; }

export function levelTitle(level) {
  return level.title || level.notes.map(n => NOTE_NAMES[n]).join(' ');
}

/** Frets within `range` where `string` sounds pitch class `pc`. */
export function fretsFor(pc, string, { from, to }) {
  const out = [];
  for (let fret = from; fret <= to; fret++) if (pitchClass(STRINGS[string].midi + fret) === pc) out.push(fret);
  return out;
}

const spot = (pc, string) => `${pc}:${string}`;

/** Every note-on-string spot of the level that exists inside the fret range. */
export function requiredSpots(level, range) {
  const out = [];
  for (const pc of level.notes) {
    for (const s of STRINGS) if (fretsFor(pc, s.index, range).length) out.push(spot(pc, s.index));
  }
  return out;
}

export function blankEntry() { return { recent: [], covered: [], bossUnlocked: false, done: false, stars: 0, bestMs: null }; }

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

export function starsFor(avgMs) {
  return avgMs <= STAR3_MS ? 3 : avgMs <= STAR2_MS ? 2 : 1;
}

// ---------- boss round ----------

/**
 * One question per note and string, string 6 up to string 1, for each level
 * note in turn. Any wrong note or skip fails it; the average answer time sets the stars.
 */
export function createBoss(level, range, rng = Math.random) {
  const items = [];
  for (const pc of level.notes) {
    for (let string = STRINGS.length - 1; string >= 0; string--) {
      const frets = fretsFor(pc, string, range);
      if (frets.length) items.push({ string, fret: frets[Math.floor(rng() * frets.length)], pc });
    }
  }
  const boss = {
    levelId: level.id, items, index: 0, times: [], state: items.length ? 'running' : 'failed', reason: items.length ? null : 'empty',
    get current() { return boss.state === 'running' ? boss.items[boss.index] : null; },
    get avgMs() { return boss.times.length ? boss.times.reduce((a, b) => a + b, 0) / boss.times.length : null; },
    get stars() { return boss.state === 'passed' ? starsFor(boss.avgMs) : 0; },
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
    /** Log a correct answer in a level; `bossUnlocked` is true only the moment it opens. */
    record(id, { pc, string, firstTry, ms }, range) {
      const e = entry(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      const key = spot(pc, string);
      if (!e.covered.includes(key)) e.covered.push(key);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e, levelById(id), range).unlocked) { e.bossUnlocked = true; opened = true; }
      save();
      return { bossUnlocked: opened };
    },
    /** A passed boss: level done, next level open and current, best stars kept. */
    completeBoss(id, avgMs) {
      const e = entry(id);
      const stars = starsFor(avgMs);
      const first = !e.done;
      e.done = true; e.bossUnlocked = true;
      e.stars = Math.max(e.stars, stars);
      e.bestMs = e.bestMs == null ? avgMs : Math.min(e.bestMs, avgMs);
      const next = levelById(id + 1);
      if (next && data.current === id) data.current = next.id;
      save();
      return { stars, bestStars: e.stars, first, next: next ? next.id : null };
    },
    reset() { data = { current: 1, levels: {} }; save(); },
  };
}
