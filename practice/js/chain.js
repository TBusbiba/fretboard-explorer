// Note chains for the Path: one note, walked left to right up the neck. From the start
// spot the chain visits every later spot of that note (a higher fret each time) up to
// fret 12. "Down" means toward the thinner strings, the way the player says it.

import { STRINGS, pitchClass } from './notes.js';
import { levelRange, orderSpots } from './path.js';

export const CHAIN_MIN = 3;                  // a chain is at least this long
export const CHAIN_LAST_FRET = 12;           // the neck repeats after this
export const CHAIN_STARTS = [5, 4];          // low E, A
export const CHAIN_GAP = [6, 9];             // normal questions between chains (inclusive)
export const CHAIN_BONUS = 250;              // x the current points multiplier

/**
 * The chain from a start spot: the start, then every spot of the same note inside `range` (never past fret 12) with a higher fret, left to right. Spots on the same fret (the two E
 * strings) go nearest-string-first from the previous spot. null when shorter than CHAIN_MIN.
 */
export function chainSpots(string, fret, range) {
  const last = Math.min(range.to, CHAIN_LAST_FRET);
  if (fret < range.from || fret > last) return null;
  const pc = pitchClass(STRINGS[string].midi + fret);
  const start = { string, fret };
  const later = [];
  for (let f = fret + 1; f <= last; f++) {
    for (let s = 0; s < STRINGS.length; s++) if (pitchClass(STRINGS[s].midi + f) === pc) later.push({ string: s, fret: f });
  }
  const spots = [start, ...orderSpots(later, start)];
  return spots.length >= CHAIN_MIN ? spots : null;
}

/**
 * Every chain (3 or more notes) that starts on low E or A, with a level note, and fits the fret range.
 */
export function chainOptions(level, fretRange) {
  const range = levelRange(level, fretRange);
  const out = [];
  for (const string of CHAIN_STARTS) {
    for (let fret = range.from; fret <= range.to; fret++) {
      const pc = pitchClass(STRINGS[string].midi + fret);
      if (!level.notes.includes(pc)) continue;
      const spots = chainSpots(string, fret, range);
      if (spots) out.push({ pc, spots });
    }
  }
  return out;
}

/** A random chain for the level; `prefer(pc, spots)` may bias towards chains not covered yet. null when none fits. */
export function pickChain(level, range, rng = Math.random, prefer = () => false) {
  const all = chainOptions(level, range);
  if (!all.length) return null;
  const wanted = all.filter(c => prefer(c.pc, c.spots));
  const pool = wanted.length ? wanted : all;
  return pool[Math.floor(rng() * pool.length)];
}

/** Hint for the chain note at `index` (2nd note on), from the previous spot; null for the first note. */
export function chainHint(spots, index) {
  if (index < 1 || index >= spots.length) return null;
  const prev = spots[index - 1], cur = spots[index];
  const frets = cur.fret - prev.fret, strings = cur.string - prev.string;
  const n = (k, word) => `${k} ${word}${k === 1 ? '' : 's'}`;
  if (frets === 0) return `Same fret on the ${cur.string === 5 ? 'low' : 'high'} E string`;
  const move = strings === 0 ? '' : `${n(Math.abs(strings), 'string')} ${strings < 0 ? 'down' : 'up'}, `;
  return `${move}${n(frets, 'fret')} up`;
}

/** Calls the next chain after 6 to 9 normal questions. Chain questions do not count. */
export function createChainSchedule(rng = Math.random) {
  const gap = () => CHAIN_GAP[0] + Math.floor(rng() * (CHAIN_GAP[1] - CHAIN_GAP[0] + 1));
  let left = gap();
  return {
    /** Call once per normal question; true when a chain is due now. */
    due() {
      left -= 1;
      if (left > 0) return false;
      left = gap();
      return true;
    },
  };
}

/** One chain in progress. */
export function createChain({ pc, spots }, levelId) {
  const chain = {
    pc, spots, levelId, index: 0, perfect: true, done: false,
    get current() { return chain.done ? null : chain.spots[chain.index]; },
    get previous() { return chain.index > 0 ? chain.spots[chain.index - 1] : null; },
    get hint() { return chainHint(chain.spots, chain.index); },
    miss() { chain.perfect = false; },
    /** The current note was answered; `clean` = right first try without a hint. */
    advance(clean) {
      if (!clean) chain.perfect = false;
      chain.index += 1;
      if (chain.index >= chain.spots.length) chain.done = true;
      return { done: chain.done, perfect: chain.perfect };
    },
  };
  return chain;
}
