// The level path for Triads: eleven cumulative levels of major and minor triads on three
// adjacent strings. Path questions are one placed shape of a chord, a timed answer; the boss
// round asks every shape of a new chord (any order). Pure rules plus a small
// localStorage store; `storage` is injectable for tests. Mirrors path.js (Find the note).

import { NOTE_NAMES } from './notes.js';
import { WINDOW, FIRST_TRY_MIN, AVG_MS_MAX } from './path.js';

export { AVG_MS_MAX };

export const STAR2_MS = 6000;      // boss average per shape (one 3-note triad) for 2 stars (with <= STAR2_MISTAKES)
export const STAR3_MS = 4000;      // ... and for 3 stars (with no mistakes)
export const STAR2_MISTAKES = 2;
/** 3 stars: average <= 4 s and no mistakes; 2 stars: <= 6 s and at most 2 mistakes; else 1. */
export function starsFor(avgMs, mistakes = 0) {
  return avgMs <= STAR3_MS && mistakes === 0 ? 3 : avgMs <= STAR2_MS && mistakes <= STAR2_MISTAKES ? 2 : 1;
}
import { questionVoicings, QUALITIES, FULL_RANGE } from './triad-match.js';

const KEY = 'fretboard-practice.triad-path.v1';


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
 * string group); `group`: the newest string group; `pool`: every
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

export function blankEntry() { return { recent: [], bossUnlocked: false, done: false, stars: 0, bestMs: null, bestStreak: 0, bestScore: 0, tipSeen: false }; }

/**
 * Where a level stands against the unlock rule: over the last WINDOW shape answers first try >= 75%
 * and average <= 6 s per shape. (All three shapes of every chord are asked, so no coverage rule.)
 */
export function evaluate(entry) {
  const recent = (entry.recent || []).slice(-WINDOW);
  const answered = recent.length;
  const firstTry = recent.filter(a => a.ft).length;
  const avgMs = answered ? recent.reduce((t, a) => t + a.ms, 0) / answered : null;
  const met = {
    count: answered >= WINDOW,
    firstTry: answered > 0 && firstTry >= answered * FIRST_TRY_MIN - 1e-9,
    time: avgMs != null && avgMs <= AVG_MS_MAX,
  };
  return {
    answered, firstTry, firstTryPct: answered ? Math.round((firstTry / answered) * 100) : null, avgMs, met,
    unlocked: met.count && met.firstTry && met.time,
  };
}

// ---------- question bag ----------

export const shapeKey = (q) => `${chordKey(q)}#${q.shapeIndex}`;

/**
 * Path questions come from a shuffled bag of the level's (chord, placed shape) pairs: every pair is
 * dealt once before any repeats, newest string group first. `shapeIndex` is the position in
 * `voicingsOf(chord)` (default `questionVoicings`).
 */
export function createTriadShapeBag(rng = Math.random, voicingsOf = (c) => questionVoicings(c.root, c.quality, c.group)) {
  let bag = [], key = '', last = null;
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  return {
    next(level) {
      if (!level.pool.length) return null;
      if (key !== String(level.id)) { key = String(level.id); bag = []; last = null; }
      if (!bag.length) {
        const all = level.pool.flatMap(c => voicingsOf(c).map((_, shapeIndex) => ({ root: c.root, quality: c.quality, group: c.group, shapeIndex })));
        const newest = (q) => q.group === level.group;
        bag = [...shuffle(all.filter(newest)), ...shuffle(all.filter(q => !newest(q)))];
        if (bag.length > 1 && last && shapeKey(bag[0]) === shapeKey(last)) bag.push(bag.shift());
      }
      last = bag.shift();
      return { ...last };
    },
  };
}

// ---------- boss round ----------

/**
 * One question per new chord of the level: the chord in every shape inside the range (frets
 * 0-12, a little higher when a chord needs it), each shape timed on its own. Wrong notes are counted, not fatal; skipping ends the
 * round. The average time per shape and the mistakes set the stars.
 */
export function createTriadBoss(level, range = FULL_RANGE) {
  const items = level.added.map((c, run) => {
    const voicings = questionVoicings(c.root, c.quality, c.group, range.to);
    return { root: c.root, quality: c.quality, group: c.group, voicings, run, n: run + 1, of: level.added.length, shapes: new Set(voicings.map(v => v.shape)).size };
  }).filter(i => i.voicings.length);
  const total = items.reduce((t, i) => t + i.shapes, 0);
  const boss = {
    levelId: level.id, range, items, total, index: 0, shapesDone: 0, times: [], mistakes: 0,
    state: items.length ? 'running' : 'failed', reason: items.length ? null : 'empty',
    get current() { return boss.state === 'running' ? boss.items[boss.index] : null; },
    get avgMs() { return boss.times.length ? boss.times.reduce((a, b) => a + b, 0) / boss.times.length : null; },
    get totalMs() { return boss.times.reduce((a, b) => a + b, 0); },
    get stars() { return boss.state === 'passed' ? starsFor(boss.avgMs, boss.mistakes) : 0; },
    wrong() { if (boss.state === 'running') boss.mistakes += 1; return boss.mistakes; },
    /** One shape finished in `ms`. */
    shape(ms) { if (boss.state === 'running') { boss.times.push(ms); boss.shapesDone += 1; } return boss.shapesDone; },
    /** The current chord has all its shapes: on to the next chord; the round passes after the last. */
    chordDone() {
      if (boss.state !== 'running') return boss.state;
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

// ---------- store ----------

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function sanitize(raw) {
  const levels = {};
  for (const l of TRIAD_LEVELS) {
    const e = raw && raw.levels && raw.levels[l.id];
    if (!e || typeof e !== 'object') continue;
    levels[l.id] = {
      recent: (Array.isArray(e.recent) ? e.recent : [])
        .filter(a => a && typeof a.ms === 'number').slice(-WINDOW).map(a => ({ ft: !!a.ft, ms: a.ms })),
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
      const ev = evaluate(e);
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    /** Log one shape answer in a level; `bossUnlocked` is true only the moment it opens. */
    record(id, { firstTry, ms }) {
      const e = entry(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e).unlocked) { e.bossUnlocked = true; opened = true; }
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
