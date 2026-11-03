// Chord flashcards: name the three notes, the key signature, then find the
// notes on the fretboard. Cards you miss come back sooner (deck.js).

import {
  cardsFor, checkNotes, noteForPitch, chordMidis, pitchClass, pickCard, promote,
  signatureLabel, MASTERED_BOX, ORDER_OF_SHARPS, ORDER_OF_FLATS,
} from './deck.js';
import { bestParse } from './speech.js';
import { createFretboard } from '../fretboard.js';
import { createSound } from '../sound.js';
import { noteAt, midiToNoteName } from '../notes.js';

const $ = (id) => document.getElementById(id);
const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
// Raise ♯/♭ like a chord chart does, for the big display names.
const acc = (name) => name.replace(/([♯♭]+)/g, '<span class="acc">$1</span>');

// ---- persisted state ---------------------------------------------------------

const KEY = 'practice.chords';
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const prefs = { deck: 'major', boxes: {}, best: 0, sound: true, notesOnly: false, natural: false, ...saved };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* private mode */ } };

// ---- round state -------------------------------------------------------------

let card = null;
let picked = [];          // spelled names, in slot order (null = empty slot)
let step = 'notes';       // 'notes' | 'key' | 'fret' | 'done'
let clean = true;         // no mistakes on notes or key signature this card
let found = new Set();    // pitch classes found on the fretboard
let tapped = new Set();   // 'string:fret' spots already marked correct
let streak = 0;
let busy = false;         // an animation is resolving; ignore input

const sound = createSound();
const board = createFretboard($('fretboard'));
const cardEl = $('card');

// ---- sound -------------------------------------------------------------------

function playNote(midi, volume = 0.4) { if (prefs.sound) sound.play(midi, { duration: 1.4, volume }); }
function strum(midis, gap = 45) {
  if (!prefs.sound) return;
  midis.forEach((m, i) => setTimeout(() => sound.play(m, { duration: 2.2, volume: 0.32 }), i * gap));
}

// ---- keypad ------------------------------------------------------------------

// The 12 notes around a circle, sharps only. Answers are checked by pitch, so
// C♯ counts for D♭; after a right answer the slots show the textbook spelling.
// The picks are joined by a shape: every major chord makes the same triangle.
const CIRCLE = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
const spot = (i) => {
  const a = (i / 12) * 2 * Math.PI;
  return [50 + 40 * Math.sin(a), 50 - 40 * Math.cos(a)];
};

function buildKeypad() {
  $('keypad').innerHTML = '<svg class="keypad__shape" viewBox="0 0 100 100" aria-hidden="true"><polygon/></svg>'
    + '<span class="keypad__mid" aria-hidden="true"></span>'
    + CIRCLE.map((name, i) => {
      const [x, y] = spot(i);
      const kind = name.length > 1 ? 'sharp' : 'natural';
      return `<button class="key key--${kind}" data-note="${name}" aria-pressed="false" style="--x:${x.toFixed(2)};--y:${y.toFixed(2)}">${acc(name)}</button>`;
    }).join('');
}

const pickedAt = (name) => picked.findIndex(n => n && pitchClass(n) === pitchClass(name));

$('keypad').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-note]');
  if (!b || step !== 'notes' || busy) return;
  const name = b.dataset.note;
  const at = pickedAt(name);
  if (at >= 0) { removePick(at); return; }
  const free = picked.indexOf(null) >= 0 ? picked.indexOf(null) : picked.length;
  if (free > 2) { nudge($('slots')); return; }
  picked[free] = name;
  playNote(60 + pitchClass(name), 0.35);
  bounce(b);
  flyTo(b, $('slots').children[free], name).then(() => renderSlots(free));
  renderKeypad();
});

$('slots').addEventListener('click', (ev) => {
  const s = ev.target.closest('.slot');
  if (s && step === 'notes' && !busy && picked[Number(s.dataset.i)]) removePick(Number(s.dataset.i));
});

function removePick(i) {
  picked[i] = null;
  while (picked.length && picked[picked.length - 1] === null) picked.pop();
  renderSlots();
  renderKeypad();
}

// ---- say it: the browser's speech recogniser fills the slots -----------------

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let listening = null;

function listen() {
  if (!Recognition || step !== 'notes' || busy) return;
  if (listening) { listening.stop(); return; }
  const rec = new Recognition();
  rec.lang = 'en-US';
  rec.interimResults = true;
  rec.maxAlternatives = 8;
  rec.onresult = (ev) => {
    const res = ev.results[ev.results.length - 1];
    const heard = bestParse([...res].map(a => a.transcript));
    if (!res.isFinal) { say(`Heard: “${heard.text.trim()}”`); return; }
    if (!heard.notes.length) { say(`Heard “${heard.text.trim()}” but no notes in it. Try again.`, 'bad'); return; }
    picked = heard.notes.slice(0, 3).map(pc => CIRCLE[pc]);
    renderSlots();
    renderKeypad();
    say(`Heard “${heard.text.trim()}”: ${picked.join(' – ')}`);
    if (picked.length === 3) setTimeout(go, 700);
  };
  rec.onerror = (ev) => say(ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
    ? 'The microphone is blocked. Allow it from the address bar, then try again.'
    : ev.error === 'no-speech' ? "Didn't hear anything. Press Say it and say the three notes." : `Speech recognition failed (${ev.error}).`, 'bad');
  rec.onend = () => { listening = null; $('btn-say').classList.remove('is-listening'); $('btn-say').setAttribute('aria-pressed', 'false'); };
  listening = rec;
  $('btn-say').classList.add('is-listening');
  $('btn-say').setAttribute('aria-pressed', 'true');
  say('Listening… say the three notes, like “C sharp, F, G sharp”');
  rec.start();
}

$('btn-say').hidden = !Recognition;
$('btn-say').addEventListener('click', listen);

function filledCount() { return picked.filter(Boolean).length; }

function renderKeypad() {
  for (const k of $('keypad').querySelectorAll('.key')) {
    const on = pickedAt(k.dataset.note) >= 0;
    k.classList.toggle('is-picked', on);
    k.setAttribute('aria-pressed', String(on));
  }
  const pcs = picked.filter(Boolean).map(pitchClass).sort((a, b) => a - b);
  $('keypad').querySelector('polygon').setAttribute('points', pcs.length > 1 ? pcs.map(p => spot(p).join(',')).join(' ') : '');
  $('keypad').querySelector('.keypad__mid').textContent = pcs.length ? `${pcs.length} / 3` : 'Tap 3 notes';
  $('btn-go').disabled = filledCount() !== 3 || busy;
}

function renderSlots(popIndex = -1) {
  [...$('slots').children].forEach((s, i) => {
    const name = picked[i];
    s.textContent = name || '';
    s.classList.toggle('is-filled', !!name);
    s.classList.remove('is-ok', 'is-bad');
    if (i === popIndex) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
  });
}

// ---- step 1: notes -------------------------------------------------------------

async function go() {
  if (step !== 'notes' || busy || filledCount() !== 3) return;
  busy = true;
  renderKeypad();
  const names = picked.filter(Boolean);
  const result = checkNotes(card, names);
  const slots = [...$('slots').children].filter((s, i) => picked[i]);
  result.picks.forEach((p, i) => slots[i].classList.add(p.ok ? 'is-ok' : 'is-bad'));

  if (result.correct) {
    const respelled = result.picks.filter(p => p.spelledAs);
    say(respelled.length
      ? `Right! Spelled properly: ${respelled.map(p => `${p.name} → ${p.spelledAs}`).join(', ')}.`
      : 'Right!', 'ok');
    strum(chordMidis(card));
    glow(cardEl);
    burst(cardEl, card.quality === 'min' ? 'var(--cq-min)' : 'var(--accent)');
    // settle the slots into the textbook spelling and order
    await wait(650);
    picked = [...card.notes];
    renderSlots();
    [...$('slots').children].forEach((s) => s.classList.add('is-ok'));
    await wait(500);
    busy = false;
    if (prefs.notesOnly) nextCard();
    else setStep('key');
  } else {
    clean = false;
    const wrong = result.picks.filter(p => !p.ok).map(p => p.name);
    say(`Not quite: ${wrong.join(', ')} ${wrong.length > 1 ? "aren't" : "isn't"} in ${card.name}.`, 'bad');
    shake(cardEl);
    await wait(900);
    // keep the right ones, clear the wrong ones
    picked = picked.map((n) => (n && result.picks.find(p => p.name === n)?.ok ? n : null));
    while (picked.length && picked[picked.length - 1] === null) picked.pop();
    busy = false;
    renderSlots();
    renderKeypad();
  }
}

async function reveal() {
  if (step !== 'notes' || busy) return;
  clean = false;
  picked = [...card.notes];
  renderSlots();
  renderKeypad();
  strum(chordMidis(card));
  flip(true);
  if (prefs.notesOnly) {
    say(`${card.name} is ${card.notes.join(' – ')}. Press Enter for the next card.`);
    step = 'done';
    renderSteps();
    return;
  }
  say(`${card.name} is ${card.notes.join(' – ')}.`);
  setStep('fret');
}

// ---- step 2: key signature -----------------------------------------------------

function buildKeysig() {
  const opt = (sig) => {
    const n = Math.abs(sig);
    const label = sig === 0 ? 'None' : `${n}<span>${sig > 0 ? '♯' : '♭'}</span>`;
    return `<button class="sig ${sig > 0 ? 'sig--sharp' : sig < 0 ? 'sig--flat' : 'sig--none'}" data-sig="${sig}">${label}</button>`;
  };
  $('keysig').innerHTML = `
    <div class="keysig__row">${opt(0)}</div>
    <div class="keysig__row">${[1, 2, 3, 4, 5, 6, 7].map(opt).join('')}</div>
    <div class="keysig__row">${[-1, -2, -3, -4, -5, -6, -7].map(opt).join('')}</div>`;
}

$('keysig').addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-sig]');
  if (!b || step !== 'key' || busy) return;
  busy = true;
  const sig = Number(b.dataset.sig);
  const right = $('keysig').querySelector(`[data-sig="${card.signature}"]`);
  const list = card.accidentals.length ? `: ${card.accidentals.join(' ')}` : '';
  if (sig === card.signature) {
    b.classList.add('is-ok');
    burst(b, 'var(--ok)', 10);
    say(`Yes, ${card.keyName} has ${signatureLabel(card.signature).toLowerCase()}${list}.`, 'ok');
  } else {
    clean = false;
    b.classList.add('is-bad');
    shake(b);
    right.classList.add('is-ok', 'is-reveal');
    say(`${card.keyName} has ${signatureLabel(card.signature).toLowerCase()}${list}.`, 'bad');
  }
  await wait(sig === card.signature ? 900 : 1700);
  flip(true);
  await wait(450);
  busy = false;
  setStep('fret');
});

// ---- step 3: fretboard ---------------------------------------------------------

board.onTap(({ string, fret }) => {
  if (step !== 'fret' || busy) return;
  const { midi } = noteAt(string, fret);
  const spelled = noteForPitch(card, midi);
  playNote(midi, 0.45);
  if (spelled) {
    board.showNote(string, fret, 'correct', spelled);
    tapped.add(`${string}:${fret}`);
    const pc = pitchClass(spelled);
    if (!found.has(pc)) {
      found.add(pc);
      const chip = $('found').querySelector(`[data-pc="${pc}"]`);
      chip.classList.add('is-found');
      burst(chip, 'var(--ok)', 8);
      if (found.size === 3) finishFretboard();
    }
  } else {
    const name = midiToNoteName(midi);
    board.showNote(string, fret, 'wrong', name);
    say(`${name} isn't in ${card.name}.`, 'bad');
    setTimeout(() => board.hideNote(string, fret), 700);
  }
});

async function finishFretboard() {
  step = 'done';
  renderSteps();
  say(`All three! Here's everywhere ${card.name}'s notes live in the first 12 frets.`, 'ok');
  strum(chordMidis(card), 70);
  $('found').querySelector('.found__hint').textContent = 'Press Enter for the next card';
  $('btn-next').disabled = false;
  $('btn-next').classList.add('is-ready');
  $('btn-skip').hidden = true;
  // then show every other spot on frets 0–12, string by string
  for (let s = 5; s >= 0; s--) {
    for (let f = 0; f <= 12; f++) {
      const spelled = noteForPitch(card, noteAt(s, f).midi);
      if (spelled && !tapped.has(`${s}:${f}`)) board.showNote(s, f, 'hint', spelled);
    }
    if (!REDUCED) await wait(70);
  }
}

function buildFound() {
  $('found').innerHTML = card.notes.map((n) => `<span class="found found--${card.quality}" data-pc="${pitchClass(n)}">${acc(n)}</span>`).join('')
    + '<span class="found__hint">Tap each note somewhere on the neck</span>';
}

// ---- flow --------------------------------------------------------------------

function setStep(s) {
  step = s;
  renderSteps();
  const panels = { notes: 'panel-notes', key: 'panel-key', fret: 'panel-fret' };
  for (const [k, id] of Object.entries(panels)) {
    const el = $(id);
    const show = k === s;
    if (show && el.hidden) { el.hidden = false; el.classList.remove('enter'); void el.offsetWidth; el.classList.add('enter'); }
    else if (!show) el.hidden = true;
  }
  if (s === 'key') {
    $('key-question').innerHTML = `How many sharps or flats in the key of <b>${card.keyName}</b>?`;
    $('keysig').querySelectorAll('.sig').forEach(b => b.classList.remove('is-ok', 'is-bad', 'is-reveal'));
    $('card-ask').textContent = 'Key signature?';
  }
  if (s === 'fret') {
    found = new Set();
    tapped = new Set();
    board.clearNotes();
    buildFound();
    $('btn-next').disabled = true;
    $('btn-next').classList.remove('is-ready');
    $('btn-skip').hidden = false;
  }
  if (s !== 'notes') {
    const panel = $(panels[s]);
    requestAnimationFrame(() => panel.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'nearest' }));
  }
}

function renderSteps() {
  const order = ['notes', 'key', 'fret'];
  const at = step === 'done' ? 3 : order.indexOf(step);
  document.querySelectorAll('.cq-step').forEach((li, i) => {
    li.classList.toggle('is-done', i < at);
    li.classList.toggle('is-current', i === at);
  });
}

async function nextCard({ first = false } = {}) {
  if (busy) return;
  busy = true;
  if (!first) {
    // score the card that's leaving
    prefs.boxes = promote(prefs.boxes, card.id, clean);
    streak = clean ? streak + 1 : 0;
    if (streak > prefs.best) prefs.best = streak;
    save();
    renderStats(true);
    cardEl.classList.remove('is-dealing');
    cardEl.classList.add('is-leaving');
    await wait(REDUCED ? 0 : 380);
  }
  const cards = cardsFor(prefs.deck, { natural: prefs.natural });
  card = pickCard(cards, prefs.boxes, card?.id);
  picked = [];
  clean = true;
  flip(false, true);
  renderCard();
  renderSlots();
  renderKeypad();
  say('');
  cardEl.classList.remove('is-leaving', 'is-dealing');
  void cardEl.offsetWidth;
  cardEl.classList.add('is-dealing');
  busy = false;
  setStep('notes');
  renderKeypad();
}

function renderCard() {
  cardEl.dataset.quality = card.quality;
  $('card-tag').textContent = card.quality === 'min' ? 'Minor chord' : 'Major chord';
  $('card-name').innerHTML = acc(card.name);
  $('card-ask').textContent = 'Which three notes?';
  const degrees = card.quality === 'min' ? ['1', '♭3', '5'] : ['1', '3', '5'];
  const order = card.signature >= 0 ? ORDER_OF_SHARPS : ORDER_OF_FLATS;
  $('card-back').innerHTML = `
    <div class="card__tag">${card.keyName}</div>
    <div class="back__notes">${card.notes.map((n, i) => `<div class="back__note"><b>${acc(n)}</b><span>${degrees[i]}</span></div>`).join('')}</div>
    <div class="back__sig">
      <div class="back__count">${signatureLabel(card.signature)}</div>
      ${card.signature === 0 ? '' : `<div class="back__order">${order.map((a, i) => `<span class="${i < card.accidentals.length ? 'on' : ''}">${a}</span>`).join('')}</div>`}
    </div>
    <div class="back__rel">Relative ${card.quality === 'min' ? 'major' : 'minor'}: <b>${card.relative}</b></div>`;
}

function flip(on, instant = false) {
  if (instant) cardEl.classList.add('no-anim');
  cardEl.classList.toggle('is-flipped', on);
  if (instant) { void cardEl.offsetWidth; cardEl.classList.remove('no-anim'); }
}

function renderStats(pop = false) {
  const cards = cardsFor(prefs.deck, { natural: prefs.natural });
  const mastered = cards.filter(c => (prefs.boxes[c.id] ?? 0) >= MASTERED_BOX).length;
  $('stat-streak').textContent = streak;
  $('stat-best').textContent = prefs.best;
  $('stat-mastered').textContent = mastered;
  $('stat-total').textContent = cards.length;
  $('mastery-fill').style.width = `${(mastered / cards.length) * 100}%`;
  if (pop && streak > 0) { const v = $('stat-streak'); v.classList.remove('pop'); void v.offsetWidth; v.classList.add('pop'); }
  document.querySelector('.cq-stat--streak').classList.toggle('is-hot', streak >= 3);
}

function say(text, kind = '') {
  const f = $('feedback');
  f.textContent = text;
  f.className = `cq-feedback${kind ? ` is-${kind}` : ''}`;
  if (text) { f.classList.remove('enter'); void f.offsetWidth; f.classList.add('enter'); }
}

// ---- effects -------------------------------------------------------------------

function restart(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
function shake(el) { restart(el, 'shake'); }
function nudge(el) { restart(el, 'nudge'); }
function bounce(el) { restart(el, 'bounce'); }
function glow(el) { restart(el, 'glow'); }

/** A ghost of the pressed key flies into its slot. */
function flyTo(from, to, text) {
  if (REDUCED) return Promise.resolve();
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'ghost';
  ghost.textContent = text;
  Object.assign(ghost.style, { left: `${a.left + a.width / 2}px`, top: `${a.top + a.height / 2}px` });
  $('fx').appendChild(ghost);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const anim = ghost.animate([
    { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
    { transform: `translate(calc(-50% + ${dx * 0.5}px), calc(-50% + ${dy * 0.5 - 40}px)) scale(1.25)`, opacity: 1, offset: 0.5 },
    { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.9)`, opacity: 0.2 },
  ], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)' });
  return anim.finished.then(() => ghost.remove());
}

/** A small burst of sparks from the middle of `el`. */
function burst(el, color, count = 22) {
  if (REDUCED) return;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'spark';
    p.style.background = color;
    p.style.left = `${cx}px`; p.style.top = `${cy}px`;
    const size = 4 + Math.random() * 6;
    p.style.width = p.style.height = `${size}px`;
    $('fx').appendChild(p);
    const angle = Math.random() * Math.PI * 2;
    const dist = 60 + Math.random() * Math.max(80, r.width * 0.6);
    p.animate([
      { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
      { transform: `translate(calc(-50% + ${Math.cos(angle) * dist}px), calc(-50% + ${Math.sin(angle) * dist + 30}px)) scale(0.2)`, opacity: 0 },
    ], { duration: 600 + Math.random() * 500, easing: 'cubic-bezier(.15,.7,.3,1)' }).finished.then(() => p.remove());
  }
}

// ---- controls -------------------------------------------------------------------

$('btn-go').addEventListener('click', () => (step === 'done' ? nextCard() : go()));
$('btn-reveal').addEventListener('click', reveal);
$('btn-clear').addEventListener('click', () => { if (step === 'notes' && !busy) { picked = []; renderSlots(); renderKeypad(); } });
$('btn-next').addEventListener('click', () => nextCard());
$('btn-skip').addEventListener('click', () => { if (step === 'fret') { clean = false; nextCard(); } });

document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('input')) return;
  if (ev.key === 'Enter') {
    ev.preventDefault();
    if (step === 'notes') go();
    else if (step === 'done') nextCard();
  } else if (ev.key === 'Backspace' && step === 'notes' && !busy && picked.length) {
    ev.preventDefault();
    removePick(picked.length - 1);
  } else if (ev.key.toLowerCase() === 's' && !ev.metaKey && !ev.ctrlKey) {
    listen();
  } else if (ev.key === 'Escape' && step === 'notes' && !busy) {
    picked = []; renderSlots(); renderKeypad();
  }
});

document.querySelectorAll('input[name="deck"]').forEach((r) => {
  r.checked = r.value === prefs.deck;
  r.addEventListener('change', () => {
    prefs.deck = r.value; save();
    streak = 0;
    renderStats();
    card = null;
    nextCard({ first: true });
  });
});

$('natural-toggle').checked = prefs.natural;
$('natural-toggle').addEventListener('change', (ev) => {
  prefs.natural = ev.target.checked; save();
  streak = 0;
  renderStats();
  card = null;
  nextCard({ first: true });
});

function syncNotesOnly() {
  $('notes-only-toggle').checked = prefs.notesOnly;
  document.querySelector('.cq-steps').hidden = prefs.notesOnly;
}
$('notes-only-toggle').addEventListener('change', (ev) => {
  prefs.notesOnly = ev.target.checked; save();
  syncNotesOnly();
  if (step !== 'notes' && !busy) nextCard();
});

function syncSound() {
  $('sound-toggle').setAttribute('aria-pressed', String(prefs.sound));
  $('sound-toggle').classList.toggle('is-off', !prefs.sound);
}
$('sound-toggle').addEventListener('click', () => { prefs.sound = !prefs.sound; save(); syncSound(); });

// ---- start ------------------------------------------------------------------------

buildKeypad();
buildKeysig();
syncSound();
syncNotesOnly();
renderStats();
nextCard({ first: true });
