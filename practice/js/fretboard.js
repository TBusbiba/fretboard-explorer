// SVG fretboard with true proportional fret spacing. Renders once; later calls
// only add/remove note markers and toggle classes, so the board never re-lays out.

import { STRINGS, FRET_COUNT } from './notes.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1200, H = 272;
const LABEL_X = 22;      // string name labels
const NUT_X = 96;        // nut line
const PAD_R = 20;
const TOP = 40, BOTTOM = 44;
const LAST = FRET_COUNT - 1;
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const STRING_WIDTHS = [1.2, 1.5, 1.9, 2.4, 3, 3.6];

function el(name, attrs = {}, parent) {
  const node = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.appendChild(node);
  return node;
}

function stringY(i) { return TOP + i * (H - TOP - BOTTOM) / (STRINGS.length - 1); }

// Fret n's wire x position. Equal-temperament spacing, scaled so fret LAST
// lands at the right edge.
function fretX(n) {
  const span = W - NUT_X - PAD_R;
  return NUT_X + span * (1 - Math.pow(2, -n / 12)) / (1 - Math.pow(2, -LAST / 12));
}

function noteX(fret) {
  if (fret === 0) return NUT_X - 28;
  return (fretX(fret - 1) + fretX(fret)) / 2;
}

function noteRadius(fret) {
  if (fret === 0) return 15;
  return Math.min(15, (fretX(fret) - fretX(fret - 1)) * 0.42);
}

export function createFretboard(svg) {
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Guitar fretboard');
  svg.innerHTML = '';

  const boardTop = TOP - 20, boardBottom = H - BOTTOM + 20;

  // Wood
  el('rect', { class: 'fb-board', x: NUT_X, y: boardTop, width: W - NUT_X - PAD_R, height: boardBottom - boardTop, rx: 6 }, svg);

  // Inlays
  const inlays = el('g', { class: 'fb-inlays' }, svg);
  const midY = (stringY(0) + stringY(5)) / 2;
  for (const f of SINGLE_INLAYS) el('circle', { cx: noteX(f), cy: midY, r: 5.5 }, inlays);
  el('circle', { cx: noteX(12), cy: (stringY(1) + stringY(2)) / 2, r: 5.5 }, inlays);
  el('circle', { cx: noteX(12), cy: (stringY(3) + stringY(4)) / 2, r: 5.5 }, inlays);

  // Range dimming (two rects, resized by setRange)
  const dimL = el('rect', { class: 'fb-dim', x: NUT_X - 56, y: boardTop, width: 0, height: boardBottom - boardTop }, svg);
  const dimR = el('rect', { class: 'fb-dim', x: 0, y: boardTop, width: 0, height: boardBottom - boardTop }, svg);

  // Frets
  const frets = el('g', { class: 'fb-frets' }, svg);
  for (let n = 1; n <= LAST; n++) {
    el('line', { x1: fretX(n), x2: fretX(n), y1: boardTop, y2: boardBottom, class: n === 12 ? 'fb-fret fb-fret--12' : 'fb-fret' }, frets);
  }
  el('line', { class: 'fb-nut', x1: NUT_X, x2: NUT_X, y1: boardTop - 2, y2: boardBottom + 2 }, svg);

  // Strings + labels
  const strings = el('g', { class: 'fb-strings' }, svg);
  const labels = el('g', { class: 'fb-labels' }, svg);
  const stringLines = [], stringLabels = [];
  STRINGS.forEach((s, i) => {
    const y = stringY(i);
    stringLines[i] = el('line', { class: 'fb-string', x1: NUT_X - 56, x2: W - PAD_R, y1: y, y2: y, 'stroke-width': STRING_WIDTHS[i] }, strings);
    stringLabels[i] = el('text', { class: 'fb-label', x: LABEL_X, y: y + 5 }, labels);
    stringLabels[i].textContent = s.name;
  });

  // Fret numbers
  const nums = el('g', { class: 'fb-numbers' }, svg);
  for (let n = 1; n <= LAST; n++) {
    const t = el('text', { x: noteX(n), y: H - 14, class: SINGLE_INLAYS.includes(n) || n === 12 ? 'fb-num fb-num--mark' : 'fb-num' }, nums);
    t.textContent = n;
  }

  const heat = el('g', { class: 'fb-heat' }, svg);
  const notes = el('g', { class: 'fb-notes' }, svg);
  const live = new Map(); // key -> g

  function key(string, fret) { return `${string}:${fret}`; }

  const api = {
    highlightString(index) {
      stringLines.forEach((l, i) => l.classList.toggle('is-target', i === index));
      stringLabels.forEach((l, i) => l.classList.toggle('is-target', i === index));
    },

    /** kind: 'hint' | 'correct' | 'wrong'. Replaces any marker at that position. */
    showNote(string, fret, kind, text) {
      api.hideNote(string, fret);
      // Outer group positions; inner group animates. (A CSS transform on the
      // same element would override the positioning attribute.)
      const pos = el('g', { transform: `translate(${noteX(fret)} ${stringY(string)})` }, notes);
      const g = el('g', { class: `fb-note fb-note--${kind}` }, pos);
      el('circle', { r: noteRadius(fret) }, g);
      const t = el('text', { y: 1 }, g);
      t.textContent = text;
      live.set(key(string, fret), pos);
      return pos;
    },

    hideNote(string, fret) {
      const g = live.get(key(string, fret));
      if (!g) return;
      live.delete(key(string, fret));
      g.classList.add('is-leaving');
      setTimeout(() => g.remove(), 220);
    },

    clearNotes() {
      for (const [, g] of live) { g.classList.add('is-leaving'); setTimeout(() => g.remove(), 220); }
      live.clear();
    },

    setRange(from, to) {
      // Dim everything left of fret `from` (including open area) and right of `to`.
      const left = from <= 0 ? 0 : fretX(from - 1) - (NUT_X - 56);
      dimL.setAttribute('width', Math.max(0, left));
      const rightStart = fretX(to);
      dimR.setAttribute('x', rightStart);
      dimR.setAttribute('width', to >= LAST ? 0 : W - PAD_R - rightStart);
    },

    /**
     * Heatmap overlay. items: [{string, fret, text, band: 'strong'|'ok'|'weak', alpha, title}].
     * Drawn under the live markers; replaced wholesale on each call.
     */
    showHeat(items) {
      heat.innerHTML = '';
      for (const it of items) {
        const g = el('g', { class: `fb-heat-dot fb-heat-dot--${it.band}`, transform: `translate(${noteX(it.fret)} ${stringY(it.string)})`, opacity: it.alpha }, heat);
        el('title', {}, g).textContent = it.title;
        el('circle', { r: noteRadius(it.fret) }, g);
        el('text', { y: 1 }, g).textContent = it.text;
      }
    },

    clearHeat() { heat.innerHTML = ''; },

    /** Horizontal position (0..1) of a fret, for scrolling the container. */
    fretPosition(fret) { return noteX(fret) / W; },
  };
  return api;
}
