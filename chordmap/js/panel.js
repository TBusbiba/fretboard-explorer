// The side panel: everything about the chord you picked.

import {
  neighbours, voicing, voiceMove, character, resolutionsOf, MOVES, STRING_MIDI, mod12,
} from './theory.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const chip = (c, extra = '') => `<span class="chip chip--${c.quality}" ${extra}>${esc(c.name)}</span>`;

const PLAY_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l13-7.5z"/></svg>';

/**
 * @param {HTMLElement} host
 * @param {{ play: (chords: object[], opts?: object) => void, travel: (chord) => void }} actions
 */
export function createPanel(host, actions) {
  let current = null;

  host.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-action]');
    if (!b || !current) return;
    const { action, idx } = b.dataset;
    const c = current.chord;
    if (action === 'strum') actions.play([c]);
    else if (action === 'arp') actions.play([c], { arpeggio: true });
    else if (action === 'travel') actions.travel(c);
    else if (action === 'go') actions.travel(current.targets[idx]);
    else if (action === 'hear') actions.play(current.sequences[idx]);
    else if (action === 'close') host.closest('.layout')?.classList.add('panel-closed');
  });

  function render(sel) {
    const c = sel.chord;
    const ch = character(c);
    current = { chord: c, targets: [], sequences: [] };

    const head = `
      <header class="p-head p-head--${c.quality}">
        <button class="p-close" data-action="close" aria-label="Close panel">×</button>
        <div class="p-kind">${esc(c.label)}${c.quality === 'dom7' ? ' chord' : ' triad'}</div>
        <h2 class="p-name">${esc(c.name)}</h2>
        <div class="p-mood"><span class="swatch swatch--${c.quality}"></span>${esc(ch.mood)}</div>
        <div class="p-actions">
          <button class="btn btn--primary" data-action="strum">${PLAY_ICON}Strum</button>
          <button class="btn" data-action="arp">Note by note</button>
          ${!sel.isRoot && c.quality !== 'dom7' ? '<button class="btn btn--ghost" data-action="travel">Centre map here →</button>' : ''}
        </div>
      </header>`;

    const sound = `
      <section class="p-sec">
        <h3>How it sounds</h3>
        <p>${esc(ch.text)}</p>
      </section>`;

    const notes = `
      <section class="p-sec">
        <h3>Notes</h3>
        <div class="notes">
          ${c.notes.map(n => {
            const role = n.degree === '1' ? 'Root' : n.degree.includes('3') ? 'Mood note' : n.degree === '♭7' ? 'Tension' : 'Support';
            const key = n.degree === '1' ? 'root' : n.degree.includes('3') || n.degree === '♭7' ? 'colour' : 'plain';
            return `<div class="note note--${key} note--${c.quality}">
              <span class="note__deg">${esc(n.degree)}</span>
              <span class="note__name">${esc(n.name)}</span>
              <span class="note__role">${role}</span>
            </div>`;
          }).join('')}
        </div>
      </section>`;

    const v = voicing(c);
    const guitar = `
      <section class="p-sec">
        <h3>On the guitar</h3>
        <div class="guitar">
          <div class="guitar__diagram">${diagram(c, v)}</div>
          <p class="guitar__cap">${v.shape === 'open' ? 'Open chord.' : `${esc(v.shape)}, ${ordinal(v.barre)} fret.`}
            Dots show each finger's note: <b>R</b> root, <b>${esc(c.notes[1].degree)}</b> the 3rd${c.quality === 'dom7' ? ', <b>♭7</b> the 7th' : ''}, <b>5</b> the 5th.</p>
        </div>
      </section>`;

    let moves = '';
    if (c.quality === 'dom7') {
      const res = resolutionsOf(c);
      current.targets = res;
      current.sequences = res.map(r => [c, r]);
      const bridge = sel.edge ? `
        <p class="bridge">On this line it bridges ${chip(sel.edge.from)} → <b>${esc(c.name)}</b> → ${chip(sel.edge.to)}.
          <button class="btn btn--small" data-action="hear" data-idx="${res.length}">${PLAY_ICON}Hear it</button></p>` : '';
      if (sel.edge) current.sequences.push([sel.edge.from, c, sel.edge.to]);
      moves = `
        <section class="p-sec">
          <h3>Where it wants to go</h3>
          ${bridge}
          <ul class="moves">
            ${res.map((r, i) => `
              <li class="move">
                <button class="move__go" data-action="go" data-idx="${i}" aria-label="Centre map on ${esc(r.name)}">${chip(r)}</button>
                <div class="move__text"><b>Resolves to ${esc(r.name)}</b>
                  <span>${esc(c.notes[1].name)} rises to ${esc(r.notes[0].name)}, ${esc(c.notes[3].name)} falls to ${esc(r.notes[1].name)}: the tension releases.</span></div>
                <button class="btn btn--icon" data-action="hear" data-idx="${i}" aria-label="Hear ${esc(c.name)} to ${esc(r.name)}">${PLAY_ICON}</button>
              </li>`).join('')}
          </ul>
        </section>`;
    } else {
      const ns = neighbours(c);
      current.targets = ns.map(n => n.to);
      current.sequences = ns.map(n => [c, n.via, n.to]);
      moves = `
        <section class="p-sec">
          <h3>Where it can go</h3>
          <p class="hint">Each move changes one note. The 7th in the middle is the optional bridge that pulls you there.</p>
          <ul class="moves">
            ${ns.map((n, i) => {
              const m = voiceMove(c, n.to);
              const dir = m.semis > 0 ? 'up' : 'down';
              const dist = Math.abs(m.semis) === 1 ? 'a half step' : 'a whole step';
              const mood = n.to.quality === 'min' ? 'darker' : 'brighter';
              return `
              <li class="move">
                <button class="move__go" data-action="go" data-idx="${i}" aria-label="Centre map on ${esc(n.to.name)}">${chip(n.to)}</button>
                <div class="move__text">
                  <b>${MOVES[n.move].name}</b> · ${esc(MOVES[n.move].short)}
                  <span>${esc(m.from.name)} moves ${dist} ${dir} to ${esc(m.to.name)}; ${m.kept.map(k => esc(k.name)).join(' and ')} stay. Sounds ${mood}.</span>
                  <span class="via">bridge: ${chip(n.via)}</span>
                </div>
                <button class="btn btn--icon" data-action="hear" data-idx="${i}" aria-label="Hear ${esc(c.name)}, ${esc(n.via.name)}, ${esc(n.to.name)}">${PLAY_ICON}</button>
              </li>`;
            }).join('')}
          </ul>
        </section>`;
    }

    host.innerHTML = head + `<div class="p-body">${sound}${notes}${guitar}${moves}</div>`;
    host.closest('.layout')?.classList.remove('panel-closed');
    host.scrollTop = 0;
  }

  return { render };
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// A standard chord box: strings vertical (low E on the left), nut on top.
export function diagram(c, v) {
  const fretted = v.frets.filter(f => f > 0);
  const top = Math.max(...fretted, 0) > 4 ? Math.min(...fretted) : 1;
  const rows = 5, sx = 26, sy = 30, x0 = 34, y0 = 34;
  const w = x0 + sx * 5 + 30, h = y0 + sy * rows + 16;
  const degreeOf = (midi) => {
    const n = c.notes.find(n => n.pc === mod12(midi));
    return n ? (n.degree === '1' ? 'R' : n.degree) : '';
  };
  let s = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(c.name)} chord diagram">`;
  // nut / position
  s += top === 1
    ? `<rect x="${x0 - 1}" y="${y0 - 5}" width="${sx * 5 + 2}" height="5" rx="1.5" class="d-nut"/>`
    : `<text x="${x0 - 12}" y="${y0 + sy / 2}" dy="0.35em" text-anchor="end" class="d-pos">${top}fr</text>`;
  for (let r = 0; r <= rows; r++) s += `<line x1="${x0}" x2="${x0 + sx * 5}" y1="${y0 + r * sy}" y2="${y0 + r * sy}" class="d-fret"/>`;
  for (let i = 0; i < 6; i++) s += `<line x1="${x0 + i * sx}" x2="${x0 + i * sx}" y1="${y0}" y2="${y0 + rows * sy}" class="d-string" style="stroke-width:${1.8 - i * 0.2}"/>`;
  // barre
  if (v.barre > 0) {
    const on = v.frets.map((f, i) => (f === v.barre ? i : -1)).filter(i => i >= 0);
    const y = y0 + (v.barre - top + 0.5) * sy;
    s += `<rect x="${x0 + on[0] * sx - 10}" y="${y - 10}" width="${(on[on.length - 1] - on[0]) * sx + 20}" height="20" rx="10" class="d-barre d-barre--${c.quality}"/>`;
  }
  v.frets.forEach((f, i) => {
    const x = x0 + i * sx;
    if (f < 0) { s += `<text x="${x}" y="${y0 - 14}" text-anchor="middle" class="d-mute">×</text>`; return; }
    const deg = degreeOf(STRING_MIDI[i] + f);
    const cls = deg === 'R' ? 'root' : 'tone';
    if (f === 0) {
      s += `<circle cx="${x}" cy="${y0 - 17}" r="7" class="d-open d-open--${cls} d-${c.quality}"/>`;
      s += `<text x="${x}" y="${y0 - 17}" dy="0.35em" text-anchor="middle" class="d-lbl d-lbl--open">${deg}</text>`;
      return;
    }
    const y = y0 + (f - top + 0.5) * sy;
    s += `<circle cx="${x}" cy="${y}" r="10.5" class="d-dot d-dot--${cls} d-${c.quality}"/>`;
    s += `<text x="${x}" y="${y}" dy="0.35em" text-anchor="middle" class="d-lbl d-lbl--${cls}">${deg}</text>`;
  });
  s += '</svg>';
  return s;
}

