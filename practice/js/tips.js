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

const gabDiagram = () => neckSvg({
  last: 8, focus: [5, 0], guides: [3, 5, 7],
  marks: [5, 0].flatMap(s => [3, 5, 7].map(f => m(s, f, 'b'))),
  label: 'Frets 3, 5 and 7 on the low E and high E strings: G, A, B',
});

/** Levels 7-11: each string shows the natural (white) and the sharp one fret above it (pink). */
function sharpTip(natural, sharp, note) {
  return {
    headline: `${sharp} is one fret above ${natural}`,
    line: `A sharp sits one fret above its natural note: ${sharp} is right after ${natural}.`,
    note,
    diagram: () => {
      const marks = [], found = [];
      for (const s of ALL) {
        for (let f = 0; f < 12; f++) {
          if (noteAt(s, f).name !== natural) continue;
          marks.push(m(s, f, 'w'), m(s, f + 1, 'p'));
          found.push(f);
        }
      }
      return neckSvg({
        marks, label: `On every string, ${sharp} is one fret above ${natural}`,
        arcs: [{ from: { string: 0, fret: found[0] }, to: { string: 0, fret: found[0] + 1 }, text: '+1', kind: 'p' }],
      });
    },
  };
}

export const TIPS = {
  1: {
    headline: 'Fret 12 is the open string again',
    line: 'Fret 12 is the open string one octave higher: the same note.',
    note: 'Fret 5 is the next string\'s open note: A on the low E string at fret 5.',
    diagram: () => neckSvg({
      strings: [5, 4],
      marks: [m(5, 0, 'a'), m(5, 5, 'b'), m(5, 12, 'a'), m(4, 0, 'b'), m(4, 12, 'b')],
      arcs: [{ from: { string: 5, fret: 0 }, to: { string: 5, fret: 12 }, text: 'same note', kind: 'a' }],
      label: 'Low E and A strings: fret 12 repeats the open note, and fret 5 on the low E is the open A',
    }),
  },
  2: {
    headline: 'Almost BEAD: fret 7',
    line: 'Fret 7 on the low E, A and D strings spells B, E, A.',
    note: 'The D comes on the G string, also at fret 7.',
    diagram: () => neckSvg({
      last: 8, focus: [5, 4, 3, 2], bands: [7],
      marks: [m(5, 7, 'a'), m(4, 7, 'a'), m(3, 7, 'a'), m(2, 7, 'c')],
      label: 'Fret 7 on the low E, A, D and G strings: B, E, A, and D on the G string',
    }),
  },
  3: {
    headline: 'BEAD is complete',
    line: 'Fret 7 on the low E, A, D and G strings spells B, E, A, D.',
    note: 'Say it from the thickest string. Fret 7 is the middle of the neck.',
    diagram: () => neckSvg({
      last: 8, focus: [5, 4, 3, 2], bands: [7],
      marks: [m(5, 7, 'b'), ...[4, 3, 2].map(s => m(s, 7, 'a'))],
      label: 'Fret 7 on the low E, A, D and G strings: B, E, A, D',
    }),
  },
  4: {
    headline: 'Gift of the gab: G A B',
    line: 'On both E strings, frets 3, 5 and 7 are G, A and B. They sit under the dots.',
    note: 'The high E string is a mirror of the low E: same frets, same notes.',
    diagram: gabDiagram,
  },
  5: {
    headline: 'C D E, and B–C are neighbours',
    line: 'On the A string, frets 3, 5 and 7 are C, D and E.',
    note: 'B and C are one fret apart, with no sharp between.',
    diagram: () => neckSvg({
      last: 8, strings: [4], guides: [3, 5, 7],
      marks: [m(4, 2, 'w'), ...[3, 5, 7].map(f => m(4, f, 'c'))],
      arcs: [{ from: { string: 4, fret: 2 }, to: { string: 4, fret: 3 }, text: '1 fret', kind: 'c' }],
      label: 'The A string: frets 3, 5 and 7 are C, D, E; B at fret 2 is one fret from C',
    }),
  },
  6: {
    headline: 'E–F are neighbours too',
    line: 'E and F are one fret apart, like B and C. Every other pair of naturals is two frets apart.',
    note: 'That is all seven naturals. There is no E♯ or B♯. From here the app says string names ("A string, C!") instead of numbers.',
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
  7: sharpTip('F', 'F♯', 'There is no E♯ or B♯: after E and B comes the next natural.'),
  8: sharpTip('C', 'C♯', 'C♯ is also called D♭: the same note, one fret between C and D.'),
  9: sharpTip('G', 'G♯', 'G♯ is also called A♭.'),
  10: sharpTip('D', 'D♯', 'D♯ is also called E♭.'),
  11: sharpTip('A', 'A♯', 'A♯ is also called B♭. That is all twelve notes.'),
};

/** {headline, line, note, svg} for a level id, or null. */
export function levelTip(id) {
  const t = TIPS[id];
  return t ? { headline: t.headline, line: t.line, note: t.note, svg: t.diagram() } : null;
}
