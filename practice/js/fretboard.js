// SVG fretboard with true proportional fret spacing. Renders once; later calls
// only add/remove note markers and toggle classes, so the board never re-lays out.
//
// Drawn as an instrument: rosewood with grain, nickel fret wires, pearl
// inlays, strings that cast shadows (the low three wound), and note markers
// that glow. A string vibrates when a played note is marked on it.

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
const WOUND = [false, false, false, true, true, true];
const GLOWS = { hint: '#f0b24a', correct: '#5ad8a2', wrong: '#f46a54', root: '#f4ecdf' };

let instances = 0;

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

// Gradients, patterns and filters, ids prefixed so several boards can share a page.
function buildDefs(svg, id) {
  const defs = el('defs', {}, svg);
  const wood = el('linearGradient', { id: id('wood'), x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#3b2519' }, wood);
  el('stop', { offset: '0.5', 'stop-color': '#2c1a12' }, wood);
  el('stop', { offset: '1', 'stop-color': '#22140d' }, wood);

  // long, stretched noise reads as rosewood grain
  const grain = el('filter', { id: id('grain'), x: 0, y: 0, width: 1, height: 1 }, defs);
  el('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.0028 0.11', numOctaves: 3, seed: 11 }, grain);
  el('feColorMatrix', { type: 'matrix', values: '0 0 0 0 0.05  0 0 0 0 0.02  0 0 0 0 0.01  0 0 0 -2.4 1.25' }, grain);
  el('feComposite', { in2: 'SourceGraphic', operator: 'in' }, grain);

  const sheen = el('linearGradient', { id: id('sheen'), x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
  el('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': 0.09 }, sheen);
  el('stop', { offset: '0.35', 'stop-color': '#fff', 'stop-opacity': 0 }, sheen);
  el('stop', { offset: '1', 'stop-color': '#000', 'stop-opacity': 0.35 }, sheen);

  const pearl = el('radialGradient', { id: id('pearl'), cx: '35%', cy: '30%', r: '75%' }, defs);
  el('stop', { offset: '0', 'stop-color': '#fbf6ee' }, pearl);
  el('stop', { offset: '0.45', 'stop-color': '#d9d4e6' }, pearl);
  el('stop', { offset: '0.75', 'stop-color': '#bfe0dc' }, pearl);
  el('stop', { offset: '1', 'stop-color': '#a99f91' }, pearl);

  const nut = el('linearGradient', { id: id('nut'), x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
  el('stop', { offset: '0', 'stop-color': '#bcae93' }, nut);
  el('stop', { offset: '0.5', 'stop-color': '#f3ead8' }, nut);
  el('stop', { offset: '1', 'stop-color': '#a99a7f' }, nut);

  // diagonal windings for the low strings (user space, so a zero-height line still takes it)
  const wind = el('pattern', { id: id('wind'), width: 3, height: 3, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(60)' }, defs);
  el('rect', { width: 1.3, height: 3, fill: '#000', 'fill-opacity': 0.55 }, wind);

  el('filter', { id: id('soft'), x: '-5%', y: '-200%', width: '110%', height: '500%' }, defs)
    .appendChild(el('feGaussianBlur', { stdDeviation: 1.6 }));

  for (const [kind, color] of Object.entries(GLOWS)) {
    const g = el('radialGradient', { id: id(`glow-${kind}`) }, defs);
    el('stop', { offset: '0', 'stop-color': color, 'stop-opacity': 0.55 }, g);
    el('stop', { offset: '0.5', 'stop-color': color, 'stop-opacity': 0.14 }, g);
    el('stop', { offset: '1', 'stop-color': color, 'stop-opacity': 0 }, g);
  }
}

export function createFretboard(svg) {
  const prefix = `fb${++instances}-`;
  const id = (name) => prefix + name;
  const ref = (name) => `url(#${prefix}${name})`;

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Guitar fretboard');
  svg.innerHTML = '';
  buildDefs(svg, id);

  const boardTop = TOP - 20, boardBottom = H - BOTTOM + 20;
  const boardW = W - NUT_X - PAD_R, boardH = boardBottom - boardTop;

  // Wood: base colour, grain, light from above; cream binding on both edges
  el('rect', { class: 'fb-board', x: NUT_X, y: boardTop, width: boardW, height: boardH, rx: 6, style: `fill:${ref('wood')}` }, svg);
  el('rect', { class: 'fb-grain', x: NUT_X, y: boardTop, width: boardW, height: boardH, rx: 6, filter: ref('grain') }, svg);
  el('rect', { class: 'fb-sheen', x: NUT_X, y: boardTop, width: boardW, height: boardH, rx: 6, fill: ref('sheen') }, svg);
  el('line', { class: 'fb-binding', x1: NUT_X + 4, x2: W - PAD_R - 4, y1: boardTop + 0.75, y2: boardTop + 0.75 }, svg);
  el('line', { class: 'fb-binding', x1: NUT_X + 4, x2: W - PAD_R - 4, y1: boardBottom - 0.75, y2: boardBottom - 0.75 }, svg);

  // Inlays (pearl)
  const inlays = el('g', { class: 'fb-inlays' }, svg);
  const midY = (stringY(0) + stringY(5)) / 2;
  const inlay = (cx, cy) => el('circle', { cx, cy, r: 5.5, style: `fill:${ref('pearl')}` }, inlays);
  for (const f of SINGLE_INLAYS) inlay(noteX(f), midY);
  inlay(noteX(12), (stringY(1) + stringY(2)) / 2);
  inlay(noteX(12), (stringY(3) + stringY(4)) / 2);

  // Range dimming (two rects, resized by setRange)
  const dimL = el('rect', { class: 'fb-dim', x: NUT_X - 56, y: boardTop, width: 0, height: boardH }, svg);
  const dimR = el('rect', { class: 'fb-dim', x: 0, y: boardTop, width: 0, height: boardH }, svg);

  // Frets: a shadow, the wire, and a glint along its crown
  const frets = el('g', { class: 'fb-frets' }, svg);
  for (let n = 1; n <= LAST; n++) {
    const x = fretX(n);
    el('line', { class: 'fb-fret-sh', x1: x + 2.2, x2: x + 2.2, y1: boardTop + 1, y2: boardBottom - 1 }, frets);
    el('line', { x1: x, x2: x, y1: boardTop, y2: boardBottom, class: n === 12 ? 'fb-fret fb-fret--12' : 'fb-fret' }, frets);
    el('line', { class: 'fb-fret-hi', x1: x - 0.6, x2: x - 0.6, y1: boardTop + 1, y2: boardBottom - 1 }, frets);
  }
  el('line', { class: 'fb-nut', x1: NUT_X, x2: NUT_X, y1: boardTop - 2, y2: boardBottom + 2, style: `stroke:${ref('nut')}` }, svg);

  // String shadows on the wood, blurred once as a group
  const shadows = el('g', { class: 'fb-string-shadows', filter: ref('soft') }, svg);
  STRINGS.forEach((s, i) => {
    el('line', { x1: NUT_X, x2: W - PAD_R, y1: stringY(i) + 3.5, y2: stringY(i) + 3.5, 'stroke-width': STRING_WIDTHS[i] + 0.8 }, shadows);
  });

  // Strings + labels. Each string is a group (base, windings, highlight,
  // glint) so it can vibrate as one.
  const strings = el('g', { class: 'fb-strings' }, svg);
  const labels = el('g', { class: 'fb-labels' }, svg);
  const stringLines = [], stringLabels = [], stringGroups = [], glints = [];
  STRINGS.forEach((s, i) => {
    const y = stringY(i), w = STRING_WIDTHS[i];
    const g = stringGroups[i] = el('g', { class: 'fb-string-g' }, strings);
    stringLines[i] = el('line', { class: 'fb-string', x1: NUT_X - 56, x2: W - PAD_R, y1: y, y2: y, 'stroke-width': w }, g);
    if (WOUND[i]) el('line', { class: 'fb-string-wind', x1: NUT_X - 56, x2: W - PAD_R, y1: y, y2: y, 'stroke-width': w, style: `stroke:${ref('wind')}` }, g);
    el('line', { class: 'fb-string-hi', x1: NUT_X - 56, x2: W - PAD_R, y1: y - w * 0.28, y2: y - w * 0.28 }, g);
    glints[i] = el('line', { class: 'fb-glint', x1: NUT_X - 56, x2: W - PAD_R, y1: y, y2: y, 'stroke-width': w + 1.5 }, g);
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

  function pluck(string) {
    const g = stringGroups[string];
    if (!g) return;
    g.classList.remove('is-plucked');
    void g.getBBox();          // restart the animation
    g.classList.add('is-plucked');
    clearTimeout(g._pluck);
    g._pluck = setTimeout(() => g.classList.remove('is-plucked'), 900);
  }

  const api = {
    highlightString(index) {
      stringLines.forEach((l, i) => l.classList.toggle('is-target', i === index));
      stringLabels.forEach((l, i) => l.classList.toggle('is-target', i === index));
      glints.forEach((l, i) => l.classList.toggle('is-target', i === index));
    },

    /** kind: 'hint' | 'correct' | 'wrong' | 'root'. Replaces any marker at that position. */
    showNote(string, fret, kind, text) {
      api.hideNote(string, fret);
      // Outer group positions; inner group animates. (A CSS transform on the
      // same element would override the positioning attribute.)
      const r = noteRadius(fret);
      const pos = el('g', { transform: `translate(${noteX(fret)} ${stringY(string)})` }, notes);
      const g = el('g', { class: `fb-note fb-note--${kind}` }, pos);
      if (GLOWS[kind]) el('circle', { class: 'fb-note__glow', r: r * 2.3, style: `fill:${ref(`glow-${kind}`)}` }, g);
      el('circle', { class: 'fb-note__ripple', r }, g);
      el('circle', { class: 'fb-note__dot', r }, g);
      el('ellipse', { class: 'fb-note__shine', cx: -r * 0.28, cy: -r * 0.42, rx: r * 0.5, ry: r * 0.26 }, g);
      const t = el('text', { y: 1 }, g);
      t.textContent = text;
      live.set(key(string, fret), pos);
      if (kind === 'correct' || kind === 'wrong') pluck(string);
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

    /** Make a string vibrate briefly. */
    pluck,

    setRange(from, to) {
      // Dim everything left of fret `from` (including open area) and right of `to`.
      const left = from <= 0 ? 0 : fretX(from - 1) - (NUT_X - 56);
      dimL.setAttribute('width', Math.max(0, left));
      const rightStart = fretX(to);
      dimR.setAttribute('x', rightStart);
      dimR.setAttribute('width', to >= LAST ? 0 : W - PAD_R - rightStart);
    },

    /**
     * Heatmap. items: [{string, fret, text, level: 0..5 | null, alpha, title}].
     * level null = not practised yet (faint outline). Replaced wholesale on each call.
     */
    showHeat(items) {
      heat.innerHTML = '';
      for (const it of items) {
        const cls = it.level == null ? 'fb-heat-dot fb-heat-dot--none' : `fb-heat-dot fb-heat-dot--l${it.level}`;
        const g = el('g', { class: cls, transform: `translate(${noteX(it.fret)} ${stringY(it.string)})`, opacity: it.alpha ?? 1 }, heat);
        el('title', {}, g).textContent = it.title;
        el('circle', { r: noteRadius(it.fret) }, g);
        el('text', { y: 1 }, g).textContent = it.text;
      }
    },

    clearHeat() { heat.innerHTML = ''; },

    /** Call handler({string, fret}) when the board is clicked/tapped. */
    onTap(handler) {
      svg.style.cursor = 'pointer';
      svg.classList.add('is-tappable');
      svg.addEventListener('click', (e) => {
        const r = svg.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width * W, y = (e.clientY - r.top) / r.height * H;
        if (y < TOP - 18 || y > H - BOTTOM + 18) return;
        let string = 0, best = Infinity;
        for (let i = 0; i < STRINGS.length; i++) { const d = Math.abs(stringY(i) - y); if (d < best) { best = d; string = i; } }
        let fret = 0;
        if (x >= NUT_X) { fret = 1; while (fret < LAST && x > fretX(fret)) fret++; }
        else if (x < NUT_X - 56) return;
        handler({ string, fret });
      });
    },

    /** Horizontal position (0..1) of a fret, for scrolling the container. */
    fretPosition(fret) { return noteX(fret) / W; },
  };
  return api;
}
