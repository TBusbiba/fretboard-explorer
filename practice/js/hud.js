// Game-HUD helpers shared by the three Path modes: the level chip, the "Lx opens after..." note,
// the boss meter row, the locked-level card and the confetti burst. DOM-only; looked up by id.

const $ = (id) => document.getElementById(id);
const LOCK_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

/** The first-try / average-time pills of the boss meter: open until there is data, then met or missed. */
export function crit(label, value, met, goal) {
  if (value == null) return { text: goal, state: 'open' };
  return { text: `${label} ${met ? '✓' : '✗'}`, state: met ? 'met' : 'bad' };
}

/**
 * Show the Path chrome for the mode on screen, or hide it (Custom / Drill).
 * p = { level: {n, sub}, note, meter: {n, of, label, crits: [{text, state}]} } | null
 */
export function setPath(p) {
  const chip = $('hud-level'), note = $('dock-note'), bm = $('bossmeter');
  if (!p) { chip.hidden = true; note.hidden = true; bm.hidden = true; return; }
  chip.hidden = false;
  chip.querySelector('small').textContent = `Level ${p.level.n}`;
  chip.querySelector('b').textContent = p.level.sub;
  note.hidden = !p.note;
  note.innerHTML = p.note ? `${p.locked ? LOCK_SVG : ''}<span>${p.note}</span>` : '';
  const m = p.meter;
  bm.hidden = !m;
  if (!m) return;
  const cells = $('bm-cells');
  if (cells.children.length !== m.of) cells.innerHTML = '<i></i>'.repeat(m.of);
  [...cells.children].forEach((c, i) => c.classList.toggle('on', i < m.n));
  $('bm-n').textContent = m.label ?? `${m.n}/${m.of}`;
  $('bm-crits').innerHTML = m.crits.map(c => `<span class="crit crit--${c.state}">${c.text}</span>`).join('');
}

/** The level-unlock note under the pips. */
export function opensNote(id, last, done) {
  if (done) return id >= last ? 'Every level done' : `L${id + 1} is open`;
  return id >= last ? 'Final level' : `L${id + 1} opens after the L${id} boss`;
}

let lockBack = null;
/** The "this level is locked" card over the board. rows: [{text, state}]. */
export function showLock({ kicker, title, text, rows = [], backLabel, onBack }) {
  $('lock-kicker').textContent = kicker;
  $('lock-title').textContent = title;
  $('lock-text').textContent = text;
  $('lock-rows').innerHTML = rows.map(r => `<span class="crit crit--${r.state}">${r.text}</span>`).join('');
  $('lock-back').textContent = backLabel;
  lockBack = onBack;
  $('lock-card').hidden = false;
}
export function hideLock() { $('lock-card').hidden = true; }
$('lock-back').addEventListener('click', () => { hideLock(); if (lockBack) lockBack(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideLock(); });

const CONFETTI = ['#ffd400', '#3de0ff', '#ff7a59', '#9cff6b', '#ffb8c6'];
/** A short confetti burst over the stage card. CSS only; nothing at all under reduced motion. */
export function confetti(count = 46) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const host = $('stagecard');
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.style.cssText = `left:${(Math.random() * 100).toFixed(1)}%;top:${(Math.random() * 45).toFixed(1)}%;background:${CONFETTI[i % 5]};--r:${Math.round(Math.random() * 360)}deg;--dx:${Math.round(Math.random() * 80 - 40)}px;animation-delay:${Math.round(Math.random() * 160)}ms`;
    layer.appendChild(c);
  }
  host.appendChild(layer);
  setTimeout(() => layer.remove(), 1100);
}
