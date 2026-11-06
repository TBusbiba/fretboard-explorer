// SVG fretboard with true proportional fret spacing. Renders once; later calls
// only add/remove note markers and toggle classes, so the board never re-lays out.
//
// Drawn as the Neo-Brutalist neck: a white strip with ink strings and frets,
// yellow inlays where a real neck has its dots, and notes as round discs with
// an ink outline and a hard shadow. A played string vibrates.

import { STRINGS, FRET_COUNT } from './notes.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1200, H = 272;
const LABEL_X = 22;      // string name labels
const NUT_X = 96;        // nut line
const PAD_R = 20;
const TOP = 40, BOTTOM = 44;
const LAST = FRET_COUNT - 1;
const SINGLE_INLAYS = [3, 5, 7, 9, 15, 17, 19, 21];
const STRING_WIDTHS = [1.3, 1.6, 2.0, 2.5, 3.0, 3.5];
const INK = '#111111';

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
  const boardW = W - NUT_X - PAD_R, boardH = boardBottom - boardTop;

  el('rect', { class: 'fb-board', x: NUT_X, y: boardTop, width: boardW, height: boardH, rx: 4 }, svg);

  // Inlays: small orange LEDs between strings 3 and 4 (and 2–3 / 4–5 at the 12th)
  const inlays = el('g', { class: 'fb-inlays' }, svg);
  const midY = (stringY(2) + stringY(3)) / 2;
  for (const f of SINGLE_INLAYS) el('circle', { cx: noteX(f), cy: midY, r: 5 }, inlays);
  el('circle', { cx: noteX(12), cy: (stringY(1) + stringY(2)) / 2, r: 5 }, inlays);
  el('circle', { cx: noteX(12), cy: (stringY(3) + stringY(4)) / 2, r: 5 }, inlays);

  // Range dimming (two rects, resized by setRange)
  const dimL = el('rect', { class: 'fb-dim', x: NUT_X - 56, y: boardTop, width: 0, height: boardH }, svg);
  const dimR = el('rect', { class: 'fb-dim', x: 0, y: boardTop, width: 0, height: boardH }, svg);

  // Frets
  const frets = el('g', { class: 'fb-frets' }, svg);
  for (let n = 1; n <= LAST; n++) {
    el('line', { x1: fretX(n), x2: fretX(n), y1: boardTop, y2: boardBottom, class: n === 12 ? 'fb-fret fb-fret--12' : 'fb-fret', style: `--i:${n}` }, frets);
  }
  el('rect', { class: 'fb-nut', x: NUT_X - 5, y: boardTop - 4, width: 10, height: boardH + 8, rx: 2 }, svg);

  // Strings + labels. Each string is a group so it can vibrate as one.
  const strings = el('g', { class: 'fb-strings' }, svg);
  const labels = el('g', { class: 'fb-labels' }, svg);
  const stringLines = [], stringLabels = [], stringGroups = [], glints = [];
  STRINGS.forEach((s, i) => {
    const y = stringY(i), w = STRING_WIDTHS[i];
    const g = stringGroups[i] = el('g', { class: 'fb-string-g', style: `--i:${i}` }, strings);
    stringLines[i] = el('line', { class: 'fb-string', x1: NUT_X - 56, x2: W - PAD_R, y1: y, y2: y, 'stroke-width': w }, g);
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
  const arrows = el('g', { class: 'fb-arrows' }, svg);
  const box = el('g', { class: 'fb-box' }, svg);
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
    setStringNames(on) { labels.classList.toggle('is-hidden', !on); },

    highlightString(index) {
      stringLines.forEach((l, i) => l.classList.toggle('is-target', i === index));
      stringLabels.forEach((l, i) => l.classList.toggle('is-target', i === index));
      glints.forEach((l, i) => l.classList.toggle('is-target', i === index));
    },

    /** Emphasise these strings (indices) and fade the rest; null clears. */
    focusStrings(indices) {
      stringGroups.forEach((g, i) => g.classList.toggle('is-faded', !!indices && !indices.includes(i)));
      stringLabels.forEach((l, i) => l.classList.toggle('is-faded', !!indices && !indices.includes(i)));
      stringLines.forEach((l, i) => l.classList.toggle('is-focus', !!indices && indices.includes(i)));
    },

    /** kind: 'hint' | 'correct' | 'wrong' | 'root'. Replaces any marker at that position. `still` skips the string pluck (re-lighting spots). */
    showNote(string, fret, kind, text, still = false) {
      api.hideNote(string, fret);
      // Outer group positions; inner group animates. (A CSS transform on the
      // same element would override the positioning attribute.)
      const r = noteRadius(fret);
      const pos = el('g', { transform: `translate(${noteX(fret)} ${stringY(string)})` }, notes);
      const g = el('g', { class: `fb-note fb-note--${kind}` }, pos);
      el('circle', { class: 'fb-note__glow', r: r + 7 }, g);
      el('circle', { class: 'fb-note__ripple', r }, g);
      el('circle', { class: 'fb-note__shadow', cx: 2.5, cy: 2.5, r, fill: INK }, g);
      el('circle', { class: 'fb-note__dot', r }, g);
      const t = el('text', { y: 1 }, g);
      t.textContent = text;
      live.set(key(string, fret), pos);
      if (!still && (kind === 'correct' || kind === 'wrong')) pluck(string);
      return pos;
    },

    hideNote(string, fret) {
      const g = live.get(key(string, fret));
      if (!g) return;
      live.delete(key(string, fret));
      g.classList.add('is-leaving');
      setTimeout(() => g.remove(), 220);
    },

    /** An arrow from one spot to another (a chain hint), stopping at the discs' edges. */
    showArrow(from, to) {
      arrows.innerHTML = '';
      const x1 = noteX(from.fret), y1 = stringY(from.string), x2 = noteX(to.fret), y2 = stringY(to.string);
      const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len;
      const r1 = noteRadius(from.fret) + 6, r2 = noteRadius(to.fret) + 4;
      const ax = x1 + ux * r1, ay = y1 + uy * r1, bx = x2 - ux * r2, by = y2 - uy * r2;
      const g = el('g', { class: 'fb-arrow' }, arrows);
      el('line', { class: 'fb-arrow__line', x1: ax, y1: ay, x2: bx - ux * 12, y2: by - uy * 12 }, g);
      const px = -uy, py = ux;
      el('polygon', { class: 'fb-arrow__head', points: `${bx},${by} ${bx - ux * 18 + px * 10},${by - uy * 18 + py * 10} ${bx - ux * 18 - px * 10},${by - uy * 18 - py * 10}` }, g);
    },

    /**
     * A scale box: a dashed outline round the notes, each note a light ring (the root salmon-tinted),
     * and a "start" tag on the first. notes: [{string, fret, isRoot}] low to high.
     */
    showBox(items, startLabel = 'start') {
      box.innerHTML = '';
      if (!items.length) return;
      const frets = items.map(n => n.fret), lo = Math.min(...frets), hi = Math.max(...frets);
      const x1 = noteX(lo) - noteRadius(lo) - 12, x2 = noteX(hi) + noteRadius(hi) + 12;
      const y1 = stringY(0) - 24, y2 = stringY(STRINGS.length - 1) + 24;
      el('rect', { class: 'fb-box__frame', x: x1, y: y1, width: x2 - x1, height: y2 - y1, rx: 10 }, box);
      for (const n of items) {
        const g = el('g', { class: `fb-box__note${n.isRoot ? ' is-root' : ''}`, transform: `translate(${noteX(n.fret)} ${stringY(n.string)})` }, box);
        el('circle', { r: noteRadius(n.fret) }, g);
      }
      const f = items[0], tx = noteX(f.fret);
      const tag = el('g', { class: 'fb-box__start', transform: `translate(${tx} ${y2})` }, box);
      el('rect', { x: -26, y: -11, width: 52, height: 20, rx: 6 }, tag);
      el('text', { y: 4 }, tag).textContent = startLabel;
    },

    clearBox() { box.innerHTML = ''; },

    clearNotes() {
      arrows.innerHTML = '';
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
