// Note chains for the Path: one note, 3 to 6 times, always moving right along the
// board (the fret never goes down). Pure rules, no DOM. "Down" means toward the
// thinner strings, the way the player says it (A -> G is 2 strings down).
//
// Octave two strings down: from low E or A it sits 2 frets up; from D or G it sits
// 3 frets up (the kink between G and B). Unison, the same pitch one string up
// (thicker): 5 frets up, 4 from B to G. Unisons let a chain keep going right.

import { STRINGS, pitchClass } from './notes.js';
import { levelRange } from './path.js';

export const CHAIN_MIN = 3;                  // a chain is at least this long
export const CHAIN_MAX = 6;                  // ... and at most this long
export const CHAIN_STARTS = [5, 4];          // low E, A
export const CHAIN_GAP = [6, 9];             // normal questions between chains (inclusive)
export const CHAIN_BONUS = 250;              // x the current points multiplier

/** Frets up for the octave two strings down from `string`. */
export function octaveShift(string) { return string >= 4 ? 2 : 3; }

/** Frets up for the same pitch one string up (thicker): 5, except B to G which is 4. */
export function unisonShift(string) { return string === 1 ? 4 : 5; }

/** The steps that can follow a spot, in priority order: octave, mirror (high E to low E, same fret), unison. Frets never go down. */
function stepsFrom(spot) {
  const out = [];
  if (spot.string >= 2) out.push({ string: spot.string - 2, fret: spot.fret + octaveShift(spot.string), octave: true });
  if (spot.string === 0) out.push({ string: 5, fret: spot.fret, octave: false });
  if (spot.string <= 4) out.push({ string: spot.string + 1, fret: spot.fret + unisonShift(spot.string), octave: false });
  return out;
}

/**
 * The longest chain (up to CHAIN_MAX notes, steps tried in priority order) from a start spot,
 * moving right along the board inside `range`. null when it cannot reach CHAIN_MIN.
 */
export function chainSpots(string, fret, range) {
  const inRange = (s) => s.fret >= range.from && s.fret <= range.to;
  const start = { string, fret };
  if (!inRange(start)) return null;
  let best = { spots: [start] };
  const walk = (spots) => {
    if (spots.length > best.spots.length) best = { spots: [...spots] };
    if (spots.length >= CHAIN_MAX) return;
    for (const step of stepsFrom(spots[spots.length - 1])) {
      if (!inRange(step)) continue;
      walk([...spots, { string: step.string, fret: step.fret }]);
    }
  };
  walk([start]);
  return best.spots.length >= CHAIN_MIN ? best.spots : null;
}

/**
 * Every chain (3 to 6 notes) that starts on low E or A, with a level note, and fits the fret range.
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
  if (prev.string === 0 && cur.string === 5 && cur.fret === prev.fret) return 'Same fret on the low E string';
  return `${cur.string < prev.string ? '2 strings down' : '1 string up'}, ${cur.fret - prev.fret} frets up`;
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
