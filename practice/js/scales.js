// Scale shapes for the Practice "Scales" mode. Pure functions, no DOM.
// String index 0 is the high E, 5 the low E (notes.js). A shape is a list of
// {string, fret, midi, degree, isRoot} ordered low to high pitch.

import { STRINGS } from './notes.js';

export const SCALES = {
  minorPentatonic: { id: 'minorPentatonic', name: 'minor pentatonic', intervals: [0, 3, 5, 7, 10], boxes: 5 },
  majorPentatonic: { id: 'majorPentatonic', name: 'major pentatonic', intervals: [0, 2, 4, 7, 9], boxes: 5 },
  major: { id: 'major', name: 'major', intervals: [0, 2, 4, 5, 7, 9, 11], boxes: 5 },
};

// The five movable minor-pentatonic boxes: frets above the root's fret on the low E string,
// per string [low E, A, D, G, B, high E]. Box 5 ends where box 1 starts an octave up.
const PENT_BOXES = [
  [[0, 3], [0, 2], [0, 2], [0, 2], [0, 3], [0, 3]],
  [[3, 5], [2, 5], [2, 5], [2, 4], [3, 5], [3, 5]],
  [[5, 7], [5, 7], [5, 7], [4, 7], [5, 8], [5, 7]],
  [[7, 10], [7, 10], [7, 9], [7, 9], [8, 10], [7, 10]],
  [[10, 12], [10, 12], [9, 12], [9, 12], [10, 12], [10, 12]],
];

// Major-scale positions follow the Explorer's fret-position rule (script.js filterNotesForFretPosition):
// every scale note in a 5-fret window, a pitch kept on the first string it appears on (high E first).
// The five windows start this far above one fret below the root on the low E (the standard CAGED order).
const MAJOR_WINDOWS = [0, 2, 5, 7, 10];
const WINDOW_FRETS = 5;

const mod = (n, m) => ((n % m) + m) % m;
const LOW_E = STRINGS[5].midi % 12;

function shapeFrom(fretsByRow, scale, rootPc) {
  // fretsByRow[i] is for string index 5 - i (row 0 = low E).
  const iv = SCALES[scale].intervals;
  const notes = [];
  fretsByRow.forEach((frets, row) => {
    const string = 5 - row;
    for (const fret of frets) {
      const midi = STRINGS[string].midi + fret;
      const interval = mod(midi - rootPc, 12);
      const degree = iv.indexOf(interval) + 1;
      notes.push({ string, fret, midi, degree, isRoot: interval === 0 });
    }
  });
  return notes.sort((a, b) => a.midi - b.midi || b.string - a.string);
}

/** Explorer's window rule: scale notes in frets lo..lo+4 (frets below 0 dropped), high E first, each pitch once. */
function windowNotes(rootPc, lo) {
  const iv = SCALES.major.intervals;
  const seen = new Set();
  const notes = [];
  for (let string = 0; string <= 5; string++) {
    for (let fret = Math.max(lo, 0); fret < lo + WINDOW_FRETS; fret++) {
      const midi = STRINGS[string].midi + fret;
      const interval = mod(midi - rootPc, 12);
      if (!iv.includes(interval) || seen.has(midi)) continue;
      seen.add(midi);
      notes.push({ string, fret, midi, degree: iv.indexOf(interval) + 1, isRoot: interval === 0 });
    }
  }
  return notes.sort((a, b) => a.midi - b.midi || b.string - a.string);
}

const topFret = (notes) => Math.max(...notes.map(n => n.fret));
const botFret = (notes) => Math.min(...notes.map(n => n.fret));
const SHIFTS = [-24, -12, 0, 12];

/** Every octave placement of one box that stays on the neck (frets >= 0), lowest first. */
function placements(scale, rootPc, box) {
  const out = [];
  if (scale === 'major') {
    const start = mod(rootPc - LOW_E - 1, 12) + MAJOR_WINDOWS[box - 1];
    for (const sh of SHIFTS) if (start + sh >= -1) out.push(windowNotes(rootPc, start + sh));
  } else {
    const minorRoot = scale === 'majorPentatonic' ? mod(rootPc + 9, 12) : rootPc;
    const r = mod(minorRoot - LOW_E, 12);
    const offs = PENT_BOXES[box - 1];
    for (const sh of SHIFTS) {
      if (r + sh + Math.min(...offs.map(o => o[0])) < 0) continue;
      out.push(shapeFrom(offs.map(o => o.map(x => x + r + sh)), scale, rootPc));
    }
  }
  return out;
}

/** The placement that sits best in frets 0-12 (lowest one that fits; 13 only if nothing fits; else the lowest top). */
function bestOf(list, score = topFret) {
  return list.find(n => score(n) <= PREFERRED_TOP)
    || list.find(n => score(n) <= PREFERRED_TOP + 1)
    || list.reduce((a, b) => (score(b) < score(a) ? b : a));
}
const PREFERRED_TOP = 12;

/**
 * The notes of `scale` rooted on pitch class `rootPc` in box 1..5, low to high, each box in the octave where it
 * sits best inside frets 0-12 (13 only when nothing else fits; a box may start at fret 0 on open strings).
 * Major pentatonic uses the relative minor's boxes, major the Explorer's 5-fret window positions.
 */
export function boxShape(scale, rootPc, box) {
  if (!SCALES[scale]) throw new Error(`unknown scale ${scale}`);
  if (!Number.isInteger(box) || box < 1 || box > 5) throw new Error(`box must be 1..5, got ${box}`);
  return bestOf(placements(scale, rootPc, box));
}

/**
 * Neighbouring boxes as one run, placed together: each box one octave choice, the next box starting inside the
 * previous one's range and reaching higher, the whole run inside frets 0-13 when that is possible.
 */
export function joinedBoxes(scale, rootPc, boxes) {
  if (boxes.length === 1) return boxShape(scale, rootPc, boxes[0]);
  const lists = boxes.map(b => placements(scale, rootPc, b));
  const chains = [];
  const walk = (i, acc) => {
    if (i === lists.length) { chains.push(acc); return; }
    for (const cand of lists[i]) {
      const prev = acc[acc.length - 1];
      if (prev && !(cand[0].midi >= prev[0].midi && cand[0].midi <= prev.at(-1).midi && cand.at(-1).midi > prev.at(-1).midi)) continue;
      walk(i + 1, [...acc, cand]);
    }
  };
  walk(0, []);
  if (!chains.length) return joinShapes(boxes.map(b => boxShape(scale, rootPc, b)));
  const top = (c) => Math.max(...c.map(topFret));
  const pick = chains.find(c => top(c) <= PREFERRED_TOP) || chains.find(c => top(c) <= PREFERRED_TOP + 1)
    || chains.reduce((a, b) => (top(b) < top(a) ? b : a));
  return joinShapes(pick);
}

/** Up the shape then back down, the top note played once. */
export function runSequence(notes) {
  return [...notes, ...notes.slice(0, -1).reverse()];
}

/** The lowest fret of a shape (to order boxes up the neck). */
export function lowestFret(notes) { return Math.min(...notes.map(n => n.fret)); }

/** Boxes joined into one ascending run, same pitch kept once (first box wins). */
export function joinShapes(shapes) {
  const seen = new Set();
  return shapes.flat().filter(n => (seen.has(n.midi) ? false : seen.add(n.midi))).sort((a, b) => a.midi - b.midi);
}
