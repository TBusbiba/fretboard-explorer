// Scale shapes for the Practice "Scales" mode. Pure functions, no DOM.
// String index 0 is the high E, 5 the low E (notes.js). A shape is a list of
// {string, fret, midi, degree, isRoot} ordered low to high pitch.

import { STRINGS, FRET_COUNT } from './notes.js';

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

// Major-scale CAGED positions: every scale note in a 4-fret window starting this far above the
// root's fret on the low E string (2 or 3 notes per string).
const MAJOR_WINDOWS = [0, 2, 5, 7, 10]; // from position 1, which starts one fret below the root

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

const MAX_FRET = FRET_COUNT - 1;
/** 0, or -12 when a shape ending on `topFret` would run off the neck. */
const dropFor = (topFret) => (topFret > MAX_FRET ? -12 : 0);

/**
 * The notes of `scale` rooted on pitch class `rootPc` in box 1..5, low to high, placed from the
 * lowest position (box 1, frets >= 0) with boxes 2-5 continuing up the neck (dropped an octave if they would run past the last fret). Major pentatonic uses the relative minor's boxes.
 */
export function boxShape(scale, rootPc, box) {
  if (!SCALES[scale]) throw new Error(`unknown scale ${scale}`);
  if (!Number.isInteger(box) || box < 1 || box > 5) throw new Error(`box must be 1..5, got ${box}`);
  let rows;
  if (scale === 'major') {
    const start = mod(rootPc - LOW_E - 1, 12) + MAJOR_WINDOWS[box - 1];
    const lo = start + dropFor(start + 3);
    const iv = SCALES.major.intervals;
    rows = STRINGS.slice().reverse().map((st) => {
      const out = [];
      for (let f = lo; f < lo + 4; f++) if (iv.includes(mod(st.midi + f - rootPc, 12))) out.push(f);
      return out;
    });
  } else {
    const minorRoot = scale === 'majorPentatonic' ? mod(rootPc + 9, 12) : rootPc;
    const r = mod(minorRoot - LOW_E, 12);
    const offs = PENT_BOXES[box - 1];
    const shift = dropFor(r + Math.max(...offs.map(o => o[1])));
    rows = offs.map(o => o.map(x => x + r + shift));
  }
  return shapeFrom(rows, scale, rootPc);
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
