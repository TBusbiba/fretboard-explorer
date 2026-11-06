import { evaluate, blankEntry, starsFor } from './triad-path.js';
import { WINDOW } from './path.js';
import { resolveProgression, KEY_ORDER } from './keys.js';

export { evaluate, blankEntry, starsFor };

const KEY = 'fretboard-practice.progression-path.v1';

const INTRO = ['I–IV–V–I', 'I–V–vi–IV', 'vi–IV–I–V', 'ii–V–I', 'I–vi–IV–V'];
const GROUPS = ['321', '432', '543', '654'];
const EARLY_KEYS = ['C', 'G', 'D'];
const MID_KEYS = ['A', 'E', 'F'];
const SIX_KEYS = ['C', 'G', 'D', 'A', 'E', 'F'];
const LATE_KEYS = KEY_ORDER.filter(k => !SIX_KEYS.includes(k));

export const progKey = (e) => `${e.keyName}:${e.progId}:${e.group}`;

const entries = (keys, progs, groups) =>
  groups.flatMap(group => keys.flatMap(keyName => progs.map(progId => ({ keyName, progId, group }))));

const spec = [
  { title: 'I–IV–V–I', short: 'I IV V I', group: '321', added: entries(EARLY_KEYS, ['I–IV–V–I'], ['321']), boss: ['D', 'I–IV–V–I'] },
  { title: 'I–V–vi–IV', short: '+ I V vi IV', group: '321', added: entries(EARLY_KEYS, ['I–V–vi–IV'], ['321']), boss: ['D', 'I–V–vi–IV'] },
  { title: 'Three more', short: '+ 3 more', group: '321', added: entries(EARLY_KEYS, INTRO.slice(2), ['321']), boss: ['D', 'I–vi–IV–V'] },
  { title: 'Keys A E F', short: '+ A E F', group: '321', added: entries(MID_KEYS, INTRO, ['321']), boss: ['F', 'I–vi–IV–V'] },
  { title: 'Strings 4·3·2', short: '+ 432', group: '432', added: entries(SIX_KEYS, INTRO, ['432']), boss: ['F', 'I–vi–IV–V'] },
  { title: 'Strings 5·4·3', short: '+ 543', group: '543', added: entries(SIX_KEYS, INTRO, ['543']), boss: ['F', 'I–vi–IV–V'] },
  { title: 'Strings 6·5·4', short: '+ 654', group: '654', added: entries(SIX_KEYS, INTRO, ['654']), boss: ['F', 'I–vi–IV–V'] },
  { title: 'Every key', short: '+ B♭ E♭', group: '654', added: entries(LATE_KEYS, INTRO, GROUPS), boss: ['F♯', 'I–vi–IV–V'] },
];

export const PROG_LEVELS = spec.map((l, i) => ({
  id: i + 1, title: l.title, short: l.short, group: l.group, added: l.added,
  pool: spec.slice(0, i + 1).flatMap(x => x.added),
  boss: { keyName: l.boss[0], progId: l.boss[1], group: l.group },
}));

export function progLevelById(id) { return PROG_LEVELS.find(l => l.id === id) || null; }

export function bossChords(level) {
  const once = resolveProgression(level.boss.keyName, level.boss.progId);
  return [...once, ...once];
}

export function createProgressionBag(rng = Math.random) {
  let bag = [], levelId = null, last = null;
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  return {
    next(level) {
      if (!level.pool.length) return null;
      if (levelId !== level.id) { levelId = level.id; bag = []; }
      if (!bag.length) {
        const newest = new Set(level.added.map(progKey));
        bag = [...shuffle(level.pool.filter(e => newest.has(progKey(e)))), ...shuffle(level.pool.filter(e => !newest.has(progKey(e))))];
        if (bag.length > 1 && last && progKey(bag[0]) === progKey(last)) bag.push(bag.shift());
      }
      last = bag.shift();
      return { ...last };
    },
  };
}

export function createProgressionBoss(level) {
  const chords = bossChords(level);
  const boss = {
    levelId: level.id, entry: level.boss, chords, total: chords.length, index: 0, times: [], mistakes: 0,
    state: chords.length ? 'running' : 'failed', reason: chords.length ? null : 'empty',
    get avgMs() { return boss.times.length ? boss.times.reduce((a, b) => a + b, 0) / boss.times.length : null; },
    get totalMs() { return boss.times.reduce((a, b) => a + b, 0); },
    get stars() { return boss.state === 'passed' ? starsFor(boss.avgMs, boss.mistakes) : 0; },
    wrong() { if (boss.state === 'running') boss.mistakes += 1; return boss.mistakes; },
    chordDone(ms) {
      if (boss.state !== 'running') return boss.state;
      boss.times.push(ms);
      boss.index += 1;
      if (boss.index >= boss.total) boss.state = 'passed';
      return boss.state;
    },
    fail(reason) {
      if (boss.state === 'running') { boss.state = 'failed'; boss.reason = reason; }
      return boss.state;
    },
  };
  return boss;
}

const posInt = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function sanitize(raw) {
  const levels = {};
  for (const l of PROG_LEVELS) {
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
  const current = raw && progLevelById(raw.current) ? raw.current : 1;
  return { current, levels };
}

export function createProgressionPathStore(storage = globalThis.localStorage) {
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
    get currentLevel() { return progLevelById(data.current); },
    isUnlocked,
    isDone: (id) => !!(data.levels[id] && data.levels[id].done),
    stars: (id) => (data.levels[id] ? data.levels[id].stars : 0),
    select(id) {
      if (!progLevelById(id) || !isUnlocked(id)) return false;
      data.current = id;
      save();
      return true;
    },
    progress(id) {
      const e = entry(id);
      const ev = evaluate(e);
      return { ...ev, bossUnlocked: e.bossUnlocked || ev.unlocked, done: e.done, stars: e.stars };
    },
    record(id, { firstTry, ms }) {
      const e = entry(id);
      e.recent.push({ ft: !!firstTry, ms });
      if (e.recent.length > WINDOW) e.recent.splice(0, e.recent.length - WINDOW);
      let opened = false;
      if (!e.bossUnlocked && evaluate(e).unlocked) { e.bossUnlocked = true; opened = true; }
      save();
      return { bossUnlocked: opened };
    },
    completeBoss(id, avgMs, mistakes = 0) {
      const e = entry(id);
      const stars = starsFor(avgMs, mistakes);
      const first = !e.done;
      e.done = true; e.bossUnlocked = true;
      e.stars = Math.max(e.stars, stars);
      e.bestMs = e.bestMs == null ? avgMs : Math.min(e.bestMs, avgMs);
      const next = progLevelById(id + 1);
      if (next && data.current === id) data.current = next.id;
      save();
      return { stars, bestStars: e.stars, first, next: next ? next.id : null };
    },
    reset() { data = { current: 1, levels: {} }; save(); },
  };
}
