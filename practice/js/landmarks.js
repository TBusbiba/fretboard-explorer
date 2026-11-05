// Landmark hints for the Path: after a miss, count from the nearest landmark on
// that string. Pure rules, no DOM.
//
// Landmarks: fret 0 and fret 12 (the open note), fret 7 on the four thick strings
// (BEAD), frets 3-5-7 on the E strings (G A B) and on the A string (C D E), and
// fret 5 when it is the next string's open note (D string -> G, B string -> E).

import { STRINGS, noteAt } from './notes.js';

const BEAD_STRINGS = [5, 4, 3, 2];
const DOT_TAGS = { 5: 'G A B', 0: 'G A B', 4: 'C D E' };

/** Landmark frets of a string with the tag shown after the note, e.g. [{fret: 7, tag: 'BEAD'}]. */
export function landmarksFor(string) {
  const out = [{ fret: 0, tag: '' }, { fret: 12, tag: '' }];
  const add = (fret, tag) => { if (!out.some(l => l.fret === fret)) out.push({ fret, tag }); };
  if (BEAD_STRINGS.includes(string)) add(7, 'BEAD');
  const dots = DOT_TAGS[string];
  if (dots) for (const f of [3, 5, 7]) add(f, dots);
  if (string === 3) add(5, `open ${STRINGS[2].name} string`);
  if (string === 1) add(5, `open ${STRINGS[0].name} string`);
  return out.sort((a, b) => a.fret - b.fret);
}

const noteName = (string, fret) => noteAt(string, fret).name;

/**
 * The hint for the spot {string, fret}: text plus the spot to mark on the board
 * (`from`; null when the spot is itself a landmark, so nothing else is shown).
 * Naturals count from the nearest landmark, both ways ("Fret 7 is A (BEAD) → up 2 → B").
 * Sharps sit one fret above the natural before them ("One fret above F").
 */
export function landmarkHint(string, fret) {
  const name = noteName(string, fret);
  if (name.includes('♯')) {
    return { text: `One fret above ${noteName(string, fret - 1)}`, from: { string, fret: fret - 1 } };
  }
  let best = null;
  for (const l of landmarksFor(string)) {
    const d = Math.abs(fret - l.fret);
    if (!best || d < best.d) best = { ...l, d };
  }
  const where = best.fret === 0 ? `Open string is ${noteName(string, 0)}`
    : `Fret ${best.fret} is ${noteName(string, best.fret)}${best.tag ? ` (${best.tag})` : ''}`;
  if (best.d === 0) return { text: where, from: null };
  const way = fret > best.fret ? `up ${best.d}` : `back ${best.d}`;
  return { text: `${where} → ${way} → ${name}`, from: { string, fret: best.fret } };
}
