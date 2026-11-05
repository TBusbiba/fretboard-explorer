// Note chains for the Path: one note, three times, each an octave higher, two
// strings down. Pure rules, no DOM. "Down" means toward the thinner strings,
// the way the player says it (A -> G is 2 strings down).
//
// Octave shapes two strings down: from low E or A the octave sits 2 frets up;
// from D or G it sits 3 frets up (the kink between G and B).

import { STRINGS, pitchClass } from './notes.js';
import { levelRange } from './path.js';

export const CHAIN_LENGTH = 3;
export const CHAIN_STARTS = [5, 4];          // low E, A
export const CHAIN_GAP = [6, 9];             // normal questions between chains (inclusive)
export const CHAIN_BONUS = 250;              // x the current points multiplier

/** Frets up for the octave two strings down from `string`. */
export function octaveShift(string) { return string >= 4 ? 2 : 3; }

/** The chain's three spots from a start spot, or null when one falls outside the range. */
export function chainSpots(string, fret, range) {
  const spots = [{ string, fret }];
  for (let i = 1; i < CHAIN_LENGTH; i++) {
    const prev = spots[i - 1];
    spots.push({ string: prev.string - 2, fret: prev.fret + octaveShift(prev.string) });
  }
  return spots.every(s => s.string >= 0 && s.fret >= range.from && s.fret <= range.to) ? spots : null;
}

/**
 * Every chain that starts on low E or A, with a level note, and fits the fret range.
 * Spot levels (the landmark levels) are made of fixed spots a chain cannot follow: none.
 */
export function chainOptions(level, fretRange) {
  if (level.spots) return [];
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

/** Hint for the chain note at `index` (1 or 2), from the previous spot; null for the first note. */
export function chainHint(spots, index) {
  if (index < 1 || index >= spots.length) return null;
  const prev = spots[index - 1];
  return `2 strings down, ${octaveShift(prev.string)} frets up`;
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
