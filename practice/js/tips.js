// Tip cards for the Path levels: a headline, one sentence, and a small fretboard
// diagram of the idea, drawn as an inline SVG string (Neo-Brutalist: white neck,
// ink lines, flat discs with hard shadows). Pure, no DOM; the page styles the
// classes (.tipsvg ...) in styles.css. Every disc label is computed from the real
// fretboard, so a diagram can never disagree with the notes.

import { STRINGS, noteAt } from './notes.js';

const NUT_X = 64, PAD_R = 18, SP = 26, BOARD_PAD = 22;

const wireX = (n, last, span) => NUT_X + span * (1 - Math.pow(2, -n / 12)) / (1 - Math.pow(2, -last / 12));
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const round = (n) => Math.round(n * 10) / 10;

/**
 * neckSvg: frets 0..last on the chosen strings (display order top to bottom, high E on top
 * like the main board). marks [{string, fret, kind, label?}] (label defaults to the real note;
 * kind a yellow, b cyan, c salmon, d green, p pink, w white, g ghost, x empty slot),
 * arcs [{from, to, text, kind}], bands [fret], guides [fret] (dashed line through all rows), focus [strings].
 */
export function neckSvg({ last = 12, strings = [0, 1, 2, 3, 4, 5], focus = null, marks = [], arcs = [], bands = [], guides = [], label = 'Fretboard diagram' }) {
  const W = last >= 12 ? 640 : 480;
  const span = W - NUT_X - PAD_R;
  const rows = strings.length;
  const topM = arcs.length ? 46 : 14;
  const y0 = topM + BOARD_PAD;
  const rowY = (s) => y0 + strings.indexOf(s) * SP;
  const bTop = y0 - BOARD_PAD, bBot = y0 + (rows - 1) * SP + BOARD_PAD;
  const H = bBot + 32;
  const wire = (n) => wireX(n, last, span);
  const cx = (f) => (f === 0 ? NUT_X - 26 : (wire(f - 1) + wire(f)) / 2);
  const rad = (f) => (f === 0 ? 13 : Math.min(14, (wire(f) - wire(f - 1)) * 0.42));
  const p = [];
  const add = (s) => p.push(s);

  add(`<rect class="tn-board" x="${NUT_X}" y="${bTop}" width="${round(wire(last) - NUT_X)}" height="${bBot - bTop}" rx="4"/>`);
  for (const f of bands) add(`<rect class="tn-band" x="${round(wire(f - 1))}" y="${bTop}" width="${round(wire(f) - wire(f - 1))}" height="${bBot - bTop}"/>`);

  if (rows === 6) {
    const mid = (a, b) => (rowY(a) + rowY(b)) / 2;
    for (const f of [3, 5, 7, 9].filter(f => f <= last)) add(`<circle class="tn-inlay" cx="${round(cx(f))}" cy="${mid(2, 3)}" r="5"/>`);
    if (last >= 12) for (const [a, b] of [[1, 2], [3, 4]]) add(`<circle class="tn-inlay" cx="${round(cx(12))}" cy="${mid(a, b)}" r="5"/>`);
  }

  for (let n = 1; n <= last; n++) add(`<line class="tn-fret${n === 12 ? ' tn-fret--12' : ''}" x1="${round(wire(n))}" x2="${round(wire(n))}" y1="${bTop}" y2="${bBot}"/>`);
  add(`<rect class="tn-nut" x="${NUT_X - 4}" y="${bTop - 3}" width="8" height="${bBot - bTop + 6}" rx="2"/>`);

  const widths = [1.3, 1.6, 2, 2.5, 3, 3.5];
  for (const s of strings) {
    const dim = focus && !focus.includes(s);
    add(`<line class="tn-string${dim ? ' is-dim' : ''}" x1="${NUT_X - 38}" x2="${round(wire(last))}" y1="${rowY(s)}" y2="${rowY(s)}" stroke-width="${widths[s]}"/>`);
    add(`<text class="tn-name${dim ? ' is-dim' : ''}" x="8" y="${rowY(s) + 5}">${STRINGS[s].name}</text>`);
  }
  for (const f of guides) add(`<line class="tn-guide" x1="${round(cx(f))}" x2="${round(cx(f))}" y1="${rowY(strings[0])}" y2="${rowY(strings[rows - 1])}"/>`);

  for (let n = 1; n <= last; n++) {
    const mark = [3, 5, 7, 9, 12].includes(n);
    add(`<text class="tn-num${mark ? ' tn-num--mark' : ''}" x="${round(cx(n))}" y="${bBot + 20}">${n}</text>`);
  }

  for (const a of arcs) {
    const x1 = cx(a.from.fret), x2 = cx(a.to.fret), y = rowY(a.from.string) - 17;
    const h = Math.min(24, 9 + Math.abs(x2 - x1) * 0.1), dir = x2 > x1 ? 1 : -1;
    add(`<g class="tn-arc tn-arc--${a.kind || 'a'}"><path d="M${round(x1)} ${y} Q${round((x1 + x2) / 2)} ${round(y - 2 * h)} ${round(x2)} ${y}"/>`
      + `<polygon points="${round(x2)},${y + 3} ${round(x2 - 6 * dir - 4)},${y - 6} ${round(x2 - 6 * dir + 4)},${y - 6}"/>`
      + `<text x="${round((x1 + x2) / 2)}" y="${round(y - h - 5)}">${esc(a.text)}</text></g>`);
  }

  for (const m of marks) {
    const x = round(cx(m.fret)), y = rowY(m.string), r = round(rad(m.fret));
    const text = m.label ?? noteAt(m.string, m.fret).name;
    if (m.kind === 'x') { add(`<circle class="tn-empty" cx="${x}" cy="${y}" r="3.5"/>`); continue; }
    add(`<g class="tn-disc tn-disc--${m.kind || 'w'}" data-note="${esc(text)}"><circle class="tn-sh" cx="${x + 2.5}" cy="${y + 2.5}" r="${r}"/><circle class="tn-dot" cx="${x}" cy="${y}" r="${r}"/>`
      + `<text x="${x}" y="${y + 5}">${esc(text)}</text></g>`);
  }

  return `<svg class="tipsvg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(label)}" style="min-width:${Math.round(W * 0.74)}px">${p.join('')}</svg>`;
}

const ALL = [0, 1, 2, 3, 4, 5];
const m = (string, fret, kind, label) => ({ string, fret, kind, label });
const isNatural = (string, fret) => !noteAt(string, fret).name.includes('♯');

/** A whole string as a ruler: naturals as discs (kind from `kindOf`), sharps as empty slots or pink discs. */
function ruler(string, kindOf, sharpKind = 'x') {
  const out = [];
  for (let f = 0; f <= 12; f++) out.push(isNatural(string, f) ? m(string, f, kindOf(f)) : m(string, f, sharpKind));
  return out;
}

export const TIPS = {
  1: {
    headline: 'Fret 12 is fret 0',
    line: 'Fret 12 is the open string again, one octave higher: the same note.',
    note: 'Six notes to learn, twelve spots to find.',
    diagram: () => neckSvg({
      marks: ALL.flatMap(s => [m(s, 0, 'a'), m(s, 12, 'a')]),
      arcs: [{ from: { string: 0, fret: 0 }, to: { string: 0, fret: 12 }, text: 'same note', kind: 'a' }],
      label: 'Every string: the note at fret 12 is the open string note',
    }),
  },
  2: {
    headline: 'BEAD at fret 7',
    line: 'Fret 7 on the low E, A, D and G strings spells BEAD: B, E, A, D.',
    note: 'Say it from the thickest string. Fret 7 is the middle of the neck.',
    diagram: () => neckSvg({
      last: 8, focus: [5, 4, 3, 2], bands: [7],
      marks: [5, 4, 3, 2].map(s => m(s, 7, 'a')),
      label: 'Fret 7 on the low E, A, D and G strings: B, E, A, D',
    }),
  },
  3: {
    headline: 'Gift of the gab: G A B',
    line: 'On both E strings, frets 3, 5 and 7 are G, A and B. They sit under the dots.',
    note: 'The high E string is a mirror of the low E: same frets, same notes.',
    diagram: () => neckSvg({
      last: 8, focus: [5, 0], guides: [3, 5, 7],
      marks: [5, 0].flatMap(s => [3, 5, 7].map(f => m(s, f, 'b'))),
      label: 'Frets 3, 5 and 7 on the low E and high E strings: G, A, B',
    }),
  },
  4: {
    headline: 'Same dots, next string',
    line: 'Slide the same three dots to the A string and they spell C, D and E.',
    note: 'Same frets, one string over: G A B becomes C D E.',
    diagram: () => neckSvg({
      last: 8, focus: [4], guides: [3, 5, 7],
      marks: [m(5, 3, 'g'), m(5, 5, 'g'), m(5, 7, 'g'), m(0, 3, 'g'), m(0, 5, 'g'), m(0, 7, 'g'), ...[3, 5, 7].map(f => m(4, f, 'c'))],
      label: 'Frets 3, 5 and 7 on the A string: C, D, E',
    }),
  },
  5: {
    headline: 'Neighbours: E F and B C',
    line: 'E–F and B–C are one fret apart, with no sharp between. Every other pair of naturals is two frets apart.',
    note: 'So F is right next to E, and C is right next to B.',
    diagram: () => neckSvg({
      strings: [5], label: 'Natural notes along the low E string; E to F and B to C are one fret apart',
      marks: ruler(5, f => ([0, 1, 7, 8].includes(f) ? 'c' : 'w')),
      arcs: [
        { from: { string: 5, fret: 0 }, to: { string: 5, fret: 1 }, text: '1 fret', kind: 'c' },
        { from: { string: 5, fret: 7 }, to: { string: 5, fret: 8 }, text: '1 fret', kind: 'c' },
        ...[[1, 3], [3, 5], [5, 7], [8, 10], [10, 12]].map(([a, b]) => ({ from: { string: 5, fret: a }, to: { string: 5, fret: b }, text: '2', kind: 'g' })),
      ],
    }),
  },
  6: {
    headline: 'Start from a landmark',
    line: 'Do not count from fret 0. Start at the nearest landmark (0, 3, 5, 7 or 12) and count a fret or two.',
    note: 'On the A string: B is one back from C, F is one up from E, G is two back from the 12th.',
    diagram: () => neckSvg({
      strings: [4], label: 'Natural notes along the A string, counted from the nearest landmark fret',
      marks: ruler(4, f => ([0, 3, 5, 7, 12].includes(f) ? 'a' : 'w')),
      arcs: [
        { from: { string: 4, fret: 3 }, to: { string: 4, fret: 2 }, text: '−1', kind: 'c' },
        { from: { string: 4, fret: 7 }, to: { string: 4, fret: 8 }, text: '+1', kind: 'c' },
        { from: { string: 4, fret: 12 }, to: { string: 4, fret: 10 }, text: '−2', kind: 'c' },
      ],
    }),
  },
  7: {
    headline: 'A sharp is one fret up',
    line: 'A sharp sits one fret above its natural note: F♯ is one fret above F.',
    note: 'There is no E♯ or B♯. After E and B comes the next natural.',
    diagram: () => neckSvg({
      strings: [5], label: 'The low E string: each sharp is one fret above its natural note',
      marks: ruler(5, () => 'w', 'p'),
      arcs: [[1, 2], [3, 4], [5, 6], [8, 9], [10, 11]].map(([a, b]) => ({ from: { string: 5, fret: a }, to: { string: 5, fret: b }, text: '+1', kind: 'p' })),
    }),
  },
  8: {
    headline: 'Use every trick',
    line: 'Start from a landmark, count a fret or two, and put a sharp one fret above its natural.',
    note: 'Yellow: open and 12th. Green: BEAD. Blue: G A B. Salmon: C D E.',
    diagram: () => {
      const seen = new Set(), out = [];
      const put = (s, f, kind) => { const k = `${s}:${f}`; if (!seen.has(k)) { seen.add(k); out.push(m(s, f, kind)); } };
      for (const s of [5, 4, 3, 2]) put(s, 7, 'd');
      for (const s of ALL) { put(s, 0, 'a'); put(s, 12, 'a'); }
      for (const s of [5, 0]) for (const f of [3, 5, 7]) put(s, f, 'b');
      for (const f of [3, 5, 7]) put(4, f, 'c');
      return neckSvg({ marks: out, label: 'Every landmark on the neck' });
    },
  },
};

/** {headline, line, note, svg} for a level id, or null. */
export function levelTip(id) {
  const t = TIPS[id];
  return t ? { headline: t.headline, line: t.line, note: t.note, svg: t.diagram() } : null;
}
