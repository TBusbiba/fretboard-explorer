// The level path for Find the note: eleven levels of pitch classes, each adding one note,, each opened
// by answering well enough to unlock its boss round. Pure rules plus a small
// localStorage store; `storage` is injectable for tests.
//
// Level progress lives per level: the last WINDOW answers (first try or not,
// how fast) and every note-on-string spot answered correctly so far. A level's
// boss round unlocks once, then stays unlocked.

import { NOTE_NAMES, STRINGS, pitchClass } from './notes.js';

const KEY = 'fretboard-practice.path.v2';
const OLD_KEY = 'fretboard-practice.path.v1';   // level 1 (E A) is unchanged, so its progress carries over

export const WINDOW = 20;          // answers that count towards the unlock
export const FIRST_TRY_MIN = 0.75;  // share answered right on the first try
export const AVG_MS_MAX = 6000;    // average answer time
export const STAR2_MS = 3000;      // boss average per note for 2 stars
export const STAR3_MS = 2000;      // ... and for 3 stars

const pcs = (names) => names.map(n => NOTE_NAMES.indexOf(n));

const ORDER = ['E', 'A', 'D', 'G', 'B', 'C', 'F', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯'];
const TITLES = { 7: 'All naturals', 11: 'Everything' };

/** Each level keeps the notes before it and adds one more: E A, then +D, +G ... up to all 12. */
export const LEVELS = ORDER.slice(1).map((note, i) => {
  const id = i + 1;
  return { id, notes: pcs(ORDER.slice(0, id + 1)), short: id === 1 ? 'E A' : `+${note}`, newNote: id === 1 ? null : NOTE_NAMES.indexOf(note), title: TITLES[id] };
});

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

export function blankEntry() { return { recent: [], covered: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestStreak: 0, bestScore: 0 }; }

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
      const k = `${level.id}|${range.from}-${range.to}`;
      if (k !== key) { key = k; bag = []; }
      bag = bag.filter(s => required.includes(s));
      if (!bag.length) {
        const open = new Set(missing);
        bag = [...shuffle(required.filter(s => open.has(s))), ...shuffle(required.filter(s => !open.has(s)))];
        if (bag.length > 1 && bag[0] === last) bag.push(bag.shift());
      }
      last = bag.shift();
      const [pc, string] = last.split(':').map(Number);
      const frets = fretsFor(pc, string, range);
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
    else {
      const old = storage && storage.getItem(OLD_KEY);
      const l1 = old && JSON.parse(old)?.levels?.[1];
      if (l1) data = sanitize({ current: 1, levels: { 1: l1 } });
    }
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
