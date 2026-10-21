// Chord Map: wires the map, the panel, the sound and the trail together.

import { chord, chordById, dominantOf, voicing, voicingMidis, setAccidentals, getAccidentals } from './theory.js';
import { createMap } from './map.js';
import { createPanel } from './panel.js';
import { createSound } from '../../practice/js/sound.js';

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem(`chordmap.${k}`); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`chordmap.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};

const sound = createSound();
let soundOn = store.get('sound', true);
let playToken = 0;
let trail = [];
let ready = false;   // no sound for the selection made on load
let lastSelection = null;
setAccidentals(store.get('accidentals', 'sharp'));

const wait = (ms) => new Promise(r => setTimeout(r, ms));

/** Play chords one after another; a new call cuts the previous sequence short. */
async function play(chords, { arpeggio = false } = {}) {
  if (!soundOn) return;
  const token = ++playToken;
  for (let i = 0; i < chords.length; i++) {
    if (token !== playToken) return;
    const midis = voicingMidis(voicing(chords[i]));
    if (arpeggio) {
      sound.playSequence(midis, { duration: 1.4, gap: 0.2, volume: 0.45 });
      await wait(midis.length * 200 + 600);
    } else {
      midis.forEach((m, k) => setTimeout(() => token === playToken && sound.play(m, { duration: 2.4, volume: 0.32 }), k * 26));
      if (i < chords.length - 1) await wait(chords[i].quality === 'dom7' ? 850 : 1100);
    }
  }
}

const panel = createPanel($('panel'), { play, travel });

const map = createMap($('map-svg'), {
  onSelect(sel) {
    lastSelection = sel;
    panel.render(sel);
    if (ready) play([sel.chord]);
  },
  onTravel: travel,
});

function travel(c) {
  if (c.quality === 'dom7') return;
  if (trail[trail.length - 1] !== c) trail.push(c);
  if (trail.length > 12) trail = trail.slice(-12);
  map.setRoot(c);
  map.selectRoot();
  renderTrail();
  store.set('root', c.id);
}

function renderTrail() {
  $('trail-chips').innerHTML = trail.map((c, i) => `${
    i ? `<span class="trail__via" title="bridge">${dominantOf(c).name}</span>` : ''
  }<button class="chip chip--${c.quality}${i === trail.length - 1 ? ' is-current' : ''}" data-i="${i}">${c.name}</button>`).join('');
  $('trail-play').disabled = trail.length < 2;
  $('trail-chips').scrollLeft = 1e6;
}

$('trail-chips').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-i]');
  if (b) travel(trail[Number(b.dataset.i)]);
});
$('trail-play').addEventListener('click', () => {
  const withBridges = $('trail-bridges').checked;
  play(trail.flatMap((c, i) => (withBridges && i ? [dominantOf(c), c] : [c])));
});
$('trail-clear').addEventListener('click', () => { trail = [map.root]; renderTrail(); });

// ---- controls ---------------------------------------------------------------

function syncSound() {
  $('sound-toggle').setAttribute('aria-pressed', String(soundOn));
  $('sound-toggle').classList.toggle('is-off', !soundOn);
}
$('sound-toggle').addEventListener('click', () => { soundOn = !soundOn; store.set('sound', soundOn); syncSound(); });

document.querySelectorAll('input[name="depth"]').forEach((r) => {
  r.addEventListener('change', () => { store.set('depth', Number(r.value)); map.setDepth(Number(r.value)); });
});
document.querySelectorAll('input[name="accidentals"]').forEach((r) => {
  r.addEventListener('change', () => {
    setAccidentals(r.value);
    store.set('accidentals', r.value);
    map.relabel();
    renderTrail();
    if (lastSelection) panel.render(lastSelection);
  });
});
$('zoom-in').addEventListener('click', () => map.zoomBy(1.25));
$('zoom-out').addEventListener('click', () => map.zoomBy(0.8));
$('zoom-fit').addEventListener('click', () => map.fit());
$('panel-open').addEventListener('click', () => document.querySelector('.layout').classList.remove('panel-closed'));
document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape') document.querySelector('.layout').classList.add('panel-closed');
});

// ---- start --------------------------------------------------------------------

const depth = store.get('depth', 4);
document.querySelector(`input[name="depth"][value="${depth}"]`).checked = true;
document.querySelector(`input[name="accidentals"][value="${getAccidentals()}"]`).checked = true;
syncSound();
const start = chordById(store.get('root', '0maj')) || chord(0, 'maj');
trail = [start];
map.setDepth(depth);
map.setRoot(start, { keepPositions: false });
map.fit();
map.selectRoot();
renderTrail();
// on a phone the sheet would hide the map; let the first tap open it
if (matchMedia('(max-width: 820px)').matches) document.querySelector('.layout').classList.add('panel-closed');
ready = true;
