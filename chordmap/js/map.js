// The floating map: SVG rendering, spring physics and pointer handling.
//
// Every chord is a small mass on three springs: one to its home in the radial
// layout (with a slow drift so the map breathes), one to its parent and one
// to each child (so dragging a chord tows its branch along). Let go and the
// home springs pull everything back into shape. Colliding chords push apart.

import { buildTree, RING_RADII } from './layout.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const NODE_R = [36, 30, 26, 23, 21];
const DOM_R = 14;
const K_HOME = 0.018;
const K_HOME_TOWED = 0.003;   // home pull on a branch while its chord is dragged
const K_EDGE = 0.05;
const DAMPING = 0.84;
const TAP_SLOP = 6;           // px of movement before a press becomes a drag
const DOUBLE_TAP_MS = 320;

function el(name, attrs = {}, parent) {
  const e = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}

export function createMap(svg, { onSelect = () => {}, onTravel = () => {} } = {}) {
  const defs = el('defs', {}, svg);
  for (const q of ['maj', 'min', 'dom7']) {
    const g = el('radialGradient', { id: `glow-${q}` }, defs);
    el('stop', { offset: '0%', 'stop-color': `var(--${q})`, 'stop-opacity': 0.55 }, g);
    el('stop', { offset: '45%', 'stop-color': `var(--${q})`, 'stop-opacity': 0.16 }, g);
    el('stop', { offset: '100%', 'stop-color': `var(--${q})`, 'stop-opacity': 0 }, g);
  }
  const world = el('g', { class: 'world' }, svg);
  const ringLayer = el('g', { class: 'rings' }, world);
  const edgeLayer = el('g', { class: 'edges' }, world);
  const glowLayer = el('g', { class: 'glows' }, world);
  const domLayer = el('g', { class: 'doms' }, world);
  const nodeLayer = el('g', { class: 'nodes' }, world);

  let nodes = [];       // simulated triads
  let edges = [];       // parent → child links, each with its dom7 badge
  let byKey = new Map();
  let depth = 4;
  let root = null;
  let selectedKey = null;
  const view = { x: 0, y: 0, z: 1 };
  let size = { w: 1, h: 1 };
  let drag = null;      // { node, pointerId, start, moved }
  let pan = null;       // { pointerId, start, origin }
  const pointers = new Map();
  let pinch = null;
  let lastTap = { key: null, at: 0 };
  let glide = false;    // camera easing back to the centre after a travel

  // ---- build ---------------------------------------------------------------

  function setRoot(chord, { keepPositions = true } = {}) {
    const old = nodes;
    root = chord;
    const tree = buildTree(chord, depth);
    nodeLayer.replaceChildren(); glowLayer.replaceChildren();
    edgeLayer.replaceChildren(); domLayer.replaceChildren();
    drawRings();

    // Travelling: shift the old map so the new centre chord is already at the
    // origin, and move the camera by the same amount so nothing jumps on
    // screen; the camera then glides over while the map regrows around it.
    const anchor = keepPositions && old.filter(o => o.chord === chord).sort((a, b) => a.depth - b.depth)[0];
    const shift = anchor ? { x: anchor.x, y: anchor.y } : { x: 0, y: 0 };
    if (anchor) { view.x += shift.x * view.z; view.y += shift.y * view.z; glide = true; }

    nodes = tree.nodes.map((n) => {
      // Start each chord where the same chord was before (the copy nearest its
      // new home), so travelling reads as the map flowing, not being redrawn.
      const dist = (o) => Math.hypot(o.x - shift.x - n.home.x, o.y - shift.y - n.home.y);
      const twin = keepPositions && old.filter(o => o.chord === n.chord).sort((a, b) => dist(a) - dist(b))[0];
      const from = twin ? { x: twin.x - shift.x, y: twin.y - shift.y }
        : keepPositions && n.parent ? n.parent : n.home;
      return Object.assign(n, {
        x: from.x + (twin ? 0 : (Math.random() - 0.5) * 4),
        y: from.y + (twin ? 0 : (Math.random() - 0.5) * 4),
        vx: 0, vy: 0, r: NODE_R[n.depth],
        phase: Math.random() * Math.PI * 2, towed: false,
      });
    });
    byKey = new Map(nodes.map(n => [n.key, n]));
    edges = tree.edges;

    for (const e of edges) {
      e.line = el('line', { class: `edge edge--${e.to.move}`, 'data-depth': e.to.depth }, edgeLayer);
      e.badge = el('g', {
        class: 'dom', 'data-key': e.key, 'data-depth': e.to.depth, tabindex: 0, role: 'button',
        'aria-label': `${e.via.name}, bridge from ${e.from.chord.name} to ${e.to.chord.name}`,
      }, domLayer);
      el('circle', { r: DOM_R * (e.to.depth > 2 ? 0.9 : 1) }, e.badge);
      el('text', { 'text-anchor': 'middle', dy: '0.35em' }, e.badge).textContent = e.via.name;
    }
    for (const n of nodes) {
      n.glow = el('circle', { class: `glow`, r: n.r * 2.8, fill: `url(#glow-${n.chord.quality})` }, glowLayer);
      n.g = el('g', {
        class: `node node--${n.chord.quality}`, 'data-key': n.key, 'data-depth': n.depth,
        tabindex: 0, role: 'button', 'aria-label': `${n.chord.name} ${n.chord.label}`,
      }, nodeLayer);
      el('circle', { class: 'node__halo', r: n.r + 6 }, n.g);
      el('circle', { class: 'node__body', r: n.r }, n.g);
      const t = el('text', { 'text-anchor': 'middle', dy: '0.36em' }, n.g);
      t.textContent = n.chord.name;
      t.style.fontSize = `${Math.round(n.r * 0.66)}px`;
    }
    nodes[0].g.classList.add('is-root');
    selectedKey = null;
    applySelection();
  }

  function drawRings() {
    ringLayer.replaceChildren();
    for (let d = 1; d <= depth; d++) el('circle', { r: RING_RADII[d], class: 'ring' }, ringLayer);
  }

  // ---- selection -----------------------------------------------------------

  function select(key) {
    selectedKey = key;
    applySelection();
    if (!key) return;
    if (key.endsWith('~')) {
      const e = edges.find(x => x.key === key);
      onSelect({ chord: e.via, key, edge: { from: e.from.chord, to: e.to.chord } });
    } else {
      const n = byKey.get(key);
      onSelect({ chord: n.chord, key, isRoot: n.depth === 0 });
    }
  }

  function applySelection() {
    const sel = selectedKey;
    const selEdge = sel?.endsWith('~') ? edges.find(e => e.key === sel) : null;
    const selNode = sel && !selEdge ? byKey.get(sel) : null;
    svg.classList.toggle('has-selection', !!sel);
    for (const n of nodes) {
      const near = selNode && (n.parent === selNode || selNode.parent === n);
      n.g.classList.toggle('is-selected', n === selNode);
      n.g.classList.toggle('is-near', !!near || (selEdge && (n === selEdge.from || n === selEdge.to)));
      n.g.classList.toggle('is-same', !!selNode && n !== selNode && n.chord === selNode.chord);
      n.glow.classList.toggle('is-lit', n === selNode || n.depth === 0);
    }
    for (const e of edges) {
      const on = (selNode && (e.from === selNode || e.to === selNode)) || e === selEdge;
      e.line.classList.toggle('is-lit', !!on);
      e.badge.classList.toggle('is-lit', !!on);
      e.badge.classList.toggle('is-selected', e === selEdge);
    }
  }

  // ---- simulation ----------------------------------------------------------

  function step(t) {
    const dragged = drag?.moved ? drag.node : null;
    if (glide && !pan && !pinch) {
      view.x *= 0.92; view.y *= 0.92;
      if (Math.abs(view.x) + Math.abs(view.y) < 0.5) { view.x = view.y = 0; glide = false; }
    }
    for (const n of nodes) {
      if (n === dragged) continue;
      const amp = 4 + n.depth * 1.6;
      const hx = n.home.x + amp * Math.sin(t * 0.00055 + n.phase);
      const hy = n.home.y + amp * Math.cos(t * 0.00047 + n.phase * 1.3);
      const k = n.towed ? K_HOME_TOWED : K_HOME;
      n.vx += (hx - n.x) * k;
      n.vy += (hy - n.y) * k;
    }
    for (const e of edges) {
      const a = e.from, b = e.to;
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 1;
      const rest = Math.hypot(b.home.x - a.home.x, b.home.y - a.home.y);
      const f = ((dist - rest) * K_EDGE) / dist;
      // a parent is heavier than its child, so the tree hangs off the centre
      if (a !== dragged) { a.vx += dx * f * 0.35; a.vy += dy * f * 0.35; }
      if (b !== dragged) { b.vx -= dx * f; b.vy -= dy * f; }
    }
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const min = a.r + b.r + 16;
        if (Math.abs(dx) > min || Math.abs(dy) > min) continue;
        const dist = Math.hypot(dx, dy) || 0.01;
        if (dist >= min) continue;
        const push = ((min - dist) / dist) * 0.12;
        if (a !== dragged) { a.vx -= dx * push; a.vy -= dy * push; }
        if (b !== dragged) { b.vx += dx * push; b.vy += dy * push; }
      }
    }
    for (const n of nodes) {
      if (n === dragged) { n.vx = n.vy = 0; continue; }
      n.vx *= DAMPING; n.vy *= DAMPING;
      n.x += n.vx; n.y += n.vy;
    }
  }

  function render() {
    world.setAttribute('transform', `translate(${size.w / 2 + view.x} ${size.h / 2 + view.y}) scale(${view.z})`);
    for (const n of nodes) {
      const tr = `translate(${n.x.toFixed(1)} ${n.y.toFixed(1)})`;
      n.g.setAttribute('transform', tr);
      n.glow.setAttribute('transform', tr);
    }
    for (const e of edges) {
      const a = e.from, b = e.to;
      e.line.setAttribute('x1', a.x.toFixed(1)); e.line.setAttribute('y1', a.y.toFixed(1));
      e.line.setAttribute('x2', b.x.toFixed(1)); e.line.setAttribute('y2', b.y.toFixed(1));
      e.badge.setAttribute('transform', `translate(${((a.x + b.x) / 2).toFixed(1)} ${((a.y + b.y) / 2).toFixed(1)})`);
    }
  }

  let last = 0;
  function frame(t) {
    // advance in fixed ~60 Hz steps so the feel doesn't depend on refresh rate
    const steps = last ? Math.min(4, Math.max(1, Math.round((t - last) / 16.7))) : 1;
    last = t;
    for (let i = 0; i < steps; i++) step(t);
    render();
    requestAnimationFrame(frame);
  }

  // ---- view ----------------------------------------------------------------

  function resize() {
    const r = svg.getBoundingClientRect();
    size = { w: r.width || 1, h: r.height || 1 };
  }

  function fit() {
    resize();
    // phones: fit the inner rings and let the outer ones run off-screen
    const reach = RING_RADII[size.w < 600 ? Math.min(depth, 2) : depth] + 50;
    view.z = Math.max(0.3, Math.min(1.3, Math.min(size.w, size.h) / (2 * reach)));
    view.x = 0; view.y = 0; glide = false;
  }

  function toWorld(clientX, clientY) {
    const r = svg.getBoundingClientRect();
    return {
      x: (clientX - r.left - size.w / 2 - view.x) / view.z,
      y: (clientY - r.top - size.h / 2 - view.y) / view.z,
    };
  }

  function zoomAt(clientX, clientY, factor) {
    const before = toWorld(clientX, clientY);
    view.z = Math.max(0.25, Math.min(3, view.z * factor));
    const after = toWorld(clientX, clientY);
    view.x += (after.x - before.x) * view.z;
    view.y += (after.y - before.y) * view.z;
  }

  // ---- pointers ------------------------------------------------------------

  function markTowed(node, on) {
    const stack = [node];
    while (stack.length) {
      const n = stack.pop();
      n.towed = on;
      for (const c of nodes) if (c.parent === n) stack.push(c);
    }
  }

  svg.addEventListener('pointerdown', (ev) => {
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    try { svg.setPointerCapture(ev.pointerId); } catch { /* synthetic pointer */ }
    if (pointers.size === 2) {
      // second finger: switch whatever was happening into a pinch
      if (drag) { markTowed(drag.node, false); drag = null; }
      pan = null;
      const [a, b] = [...pointers.values()];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) };
      return;
    }
    const target = ev.target.closest('[data-key]');
    if (target) {
      const key = target.dataset.key;
      drag = { key, node: byKey.get(key) || null, pointerId: ev.pointerId, start: { x: ev.clientX, y: ev.clientY }, moved: false };
    } else {
      glide = false;
      pan = { pointerId: ev.pointerId, start: { x: ev.clientX, y: ev.clientY }, origin: { x: view.x, y: view.y } };
      svg.classList.add('is-panning');
    }
  });

  svg.addEventListener('pointermove', (ev) => {
    if (!pointers.has(ev.pointerId)) return;
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, dist / pinch.dist);
      pinch.dist = dist;
      return;
    }
    if (drag && drag.pointerId === ev.pointerId) {
      if (!drag.moved && Math.hypot(ev.clientX - drag.start.x, ev.clientY - drag.start.y) > TAP_SLOP) {
        if (!drag.node) return;      // 7th badges ride on their line, they don't drag
        drag.moved = true;
        markTowed(drag.node, true);
        drag.node.g.classList.add('is-dragging');
        svg.classList.add('is-dragging');
      }
      if (drag.moved) {
        const p = toWorld(ev.clientX, ev.clientY);
        drag.node.x = p.x; drag.node.y = p.y;
      }
    } else if (pan && pan.pointerId === ev.pointerId) {
      view.x = pan.origin.x + ev.clientX - pan.start.x;
      view.y = pan.origin.y + ev.clientY - pan.start.y;
    }
  });

  function release(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && drag.pointerId === ev.pointerId) {
      if (drag.moved) {
        markTowed(drag.node, false);
        drag.node.g.classList.remove('is-dragging');
        svg.classList.remove('is-dragging');
      } else if (ev.type === 'pointerup') {
        tap(drag.key);
      }
      drag = null;
    }
    if (pan && pan.pointerId === ev.pointerId) {
      // a tap on empty space clears the selection
      if (ev.type === 'pointerup' && Math.hypot(ev.clientX - pan.start.x, ev.clientY - pan.start.y) < TAP_SLOP) select(null);
      pan = null;
      svg.classList.remove('is-panning');
    }
  }
  svg.addEventListener('pointerup', release);
  svg.addEventListener('pointercancel', release);

  function tap(key) {
    const now = performance.now();
    const n = byKey.get(key);
    if (n && lastTap.key === key && now - lastTap.at < DOUBLE_TAP_MS && n.depth > 0) {
      lastTap = { key: null, at: 0 };
      onTravel(n.chord);
      return;
    }
    lastTap = { key, at: now };
    select(key);
  }

  svg.addEventListener('keydown', (ev) => {
    const target = ev.target.closest?.('[data-key]');
    if (!target) return;
    if (ev.key === 'Enter' || ev.key === ' ') {
      ev.preventDefault();
      const n = byKey.get(target.dataset.key);
      if (ev.key === 'Enter' && n && selectedKey === n.key && n.depth > 0) onTravel(n.chord);
      else select(target.dataset.key);
    }
  });

  svg.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    zoomAt(ev.clientX, ev.clientY, Math.exp(-ev.deltaY * (ev.ctrlKey ? 0.01 : 0.0015)));
  }, { passive: false });

  new ResizeObserver(resize).observe(svg);
  resize();
  requestAnimationFrame(frame);

  /** Rewrite every label in place (after switching sharps/flats). */
  function relabel() {
    for (const n of nodes) {
      n.g.querySelector('text').textContent = n.chord.name;
      n.g.setAttribute('aria-label', `${n.chord.name} ${n.chord.label}`);
    }
    for (const e of edges) {
      e.badge.querySelector('text').textContent = e.via.name;
      e.badge.setAttribute('aria-label', `${e.via.name}, bridge from ${e.from.chord.name} to ${e.to.chord.name}`);
    }
  }

  return {
    setRoot,
    relabel,
    select,
    selectRoot() { select('r'); },
    get root() { return root; },
    get depth() { return depth; },
    setDepth(d) { depth = d; if (root) { setRoot(root); fit(); select('r'); } },
    fit,
    zoomBy(f) { const r = svg.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); },
  };
}
