// Movable triad shapes for the cheat sheet beside the drill fretboard. Pure
// shape maths plus an SVG string builder; no fret numbers or note names are
// ever drawn, so a shape never gives away the current question.

import { STRINGS, DEGREE_LABELS, triadById, stringGroupById } from './notes.js';

export const SHAPE_FRETS = 13;        // the mini neck shows frets 1..13
const SPANS = [4, 5];                 // frets between a shape's lowest and highest note: the drill's 4, else 5 (a few shell voicings need it)
export const SHAPE_LABELS = ['Root', '1st inv', '2nd inv'];
const INVERSION_NAMES = ['root position', '1st inversion', '2nd inversion'];

const mod12 = (n) => ((n % 12) + 12) % 12;

// Every close voicing (notes ascending low string to high) of `triad` on the
// strings `[low, mid, high]` whose lowest note is on `inversion`'s degree.
function voicings(triad, strings, rootPc, inversion, maxSpan) {
  const order = [0, 1, 2].map(k => triad.tones[(inversion + k) % 3]);
  const [low, mid, high] = strings;
  const out = [];
  for (let f0 = 1; f0 <= SHAPE_FRETS; f0++) {
    const m0 = STRINGS[low].midi + f0;
    if (mod12(m0 - rootPc) !== order[0]) continue;
    const above = (string, floor, degree) => {
      for (let f = 1; f <= SHAPE_FRETS; f++) {
        const m = STRINGS[string].midi + f;
        if (m > floor && mod12(m - rootPc) === degree) return { string, fret: f, midi: m, degree };
      }
      return null;
    };
    const n1 = above(mid, m0, order[1]); if (!n1) continue;
    const n2 = above(high, n1.midi, order[2]); if (!n2) continue;
    const notes = [{ string: low, fret: f0, midi: m0, degree: order[0] }, n1, n2];
    const frets = notes.map(n => n.fret);
    if (Math.max(...frets) - Math.min(...frets) > maxSpan) continue;
    out.push(notes.map(n => ({ ...n, label: DEGREE_LABELS[n.degree] })));
  }
  return out;
}

const lowest = (notes) => Math.min(...notes.map(n => n.fret));
const highest = (notes) => Math.max(...notes.map(n => n.fret));

/**
 * The three inversions of one triad on one string group, laid out up the neck:
 * root position first, then the next 1st inversion above it, then the next 2nd
 * inversion above that. The root note is chosen so the run fits the neck as low
 * as it can (no open strings).
 * @returns {{triad:string, group:string, rootPc:number, shapes:[{inversion:number, notes:[{string,fret,midi,degree,label}]}]}|null}
 */
export function triadShapes(triadId, groupId) {
  const triad = triadById(triadId), group = stringGroupById(groupId);
  if (!triad || !group) return null;
  for (const maxSpan of SPANS) {
    let best = null;
    for (let rootPc = 0; rootPc < 12; rootPc++) {
      const shapes = [];
      let floor = 0;
      for (let inversion = 0; inversion < 3; inversion++) {
        const next = voicings(triad, group.strings, rootPc, inversion, maxSpan)
          .filter(v => lowest(v) > floor)
          .sort((a, b) => lowest(a) - lowest(b))[0];
        if (!next) break;
        shapes.push({ inversion, notes: next });
        floor = lowest(next);
      }
      if (shapes.length < 3) continue;
      const top = highest(shapes[2].notes);
      if (!best || top < best.top) best = { top, triad: triad.id, group: group.id, rootPc, shapes };
    }
    if (best) { delete best.top; return best; }
  }
  return null;
}

// ---------- SVG ----------
const FRET_W = 28, STRING_GAP = 18, PAD_X = 10, PAD_TOP = 14, LABEL_H = 22, DISC_R = 9;
const NECK_W = SHAPE_FRETS * FRET_W;
const NECK_H = STRING_GAP * 5;
export const SHAPE_VIEW = { width: NECK_W + PAD_X * 2, height: PAD_TOP + NECK_H + LABEL_H + 8 };
const INLAYS = [3, 5, 7, 9];

const fretX = (fret) => PAD_X + (fret - 0.5) * FRET_W;      // centre of the cell between fret lines
const stringY = (index) => PAD_TOP + index * STRING_GAP;    // string index 0 (high E) on top

/** One mini neck as an <svg> string. */
export function shapeSvg(triadId, groupId) {
  const set = triadShapes(triadId, groupId);
  if (!set) return '';
  const group = stringGroupById(groupId), triad = triadById(triadId);
  const on = new Set(group.strings);
  const { width, height } = SHAPE_VIEW;
  const parts = [];
  parts.push(`<rect class="shp-neck" x="${PAD_X}" y="${PAD_TOP - 6}" width="${NECK_W}" height="${NECK_H + 12}"/>`);
  parts.push(`<rect class="shp-nut" x="${PAD_X - 3}" y="${PAD_TOP - 6}" width="5" height="${NECK_H + 12}"/>`);
  for (let f = 1; f <= SHAPE_FRETS; f++) parts.push(`<line class="shp-fret" x1="${PAD_X + f * FRET_W}" y1="${PAD_TOP - 6}" x2="${PAD_X + f * FRET_W}" y2="${PAD_TOP + NECK_H + 6}"/>`);
  const mid = PAD_TOP + NECK_H / 2;
  for (const f of INLAYS) parts.push(`<circle class="shp-inlay" cx="${fretX(f)}" cy="${mid}" r="4.5"/>`);
  parts.push(`<circle class="shp-inlay" cx="${fretX(12)}" cy="${mid - STRING_GAP * 1.5}" r="4.5"/><circle class="shp-inlay" cx="${fretX(12)}" cy="${mid + STRING_GAP * 1.5}" r="4.5"/>`);
  for (let s = 0; s < 6; s++) parts.push(`<line class="shp-string${on.has(s) ? ' is-on' : ''}" x1="${PAD_X}" y1="${stringY(s)}" x2="${PAD_X + NECK_W}" y2="${stringY(s)}"/>`);
  for (const shape of set.shapes) {
    const name = INVERSION_NAMES[shape.inversion];
    const frets = shape.notes.map(n => n.fret);
    const centre = PAD_X + ((Math.min(...frets) + Math.max(...frets)) / 2 - 0.5) * FRET_W;
    parts.push(`<g class="shp-shape" data-inversion="${shape.inversion}">`);
    for (const n of shape.notes) {
      parts.push(`<g class="shp-note${n.degree === 0 ? ' shp-note--root' : ''}${n.label.length > 1 ? ' shp-note--flat' : ''}" data-string="${n.string}" data-fret="${n.fret}"><circle cx="${fretX(n.fret)}" cy="${stringY(n.string)}" r="${DISC_R}"/><text x="${fretX(n.fret)}" y="${stringY(n.string)}">${n.label}</text></g>`);
    }
    parts.push(`<text class="shp-name" x="${centre}" y="${PAD_TOP + NECK_H + 20}">${SHAPE_LABELS[shape.inversion]}<title>${name}</title></text>`);
    parts.push('</g>');
  }
  const names = set.shapes.map(s => INVERSION_NAMES[s.inversion]).join(', ');
  return `<svg class="shp-svg" viewBox="0 0 ${width} ${height}" role="img" aria-label="${triad.label} triad on strings ${group.label}: ${names}">${parts.join('')}</svg>`;
}
