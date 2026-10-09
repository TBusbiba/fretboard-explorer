import { STRINGS, noteAt, midiToNoteName, midiToOctave, fretForMidi } from '../notes.js';
import { createFretboard } from '../fretboard.js';
import { createTracker } from './tracker.js';
import { createAnalyzer, pointBand } from './analysis.js';
import { createLane } from './lane.js';

const $ = (id) => document.getElementById(id);
const KEY = 'fretboard-practice.vibrato.v1';
const DEFAULTS = { mode: 'fretted', depth: 100, bendCents: 200, gate: 0.004, clarity: 0.85, gain: 1.5 };

let settings = { ...DEFAULTS };
try { settings = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* defaults */ }
function save() { try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* ignore */ } }

// ---------- state ----------
const st = {
  running: false,
  baseline: null,      // midi of the fretted note
  pos: null,           // {string, fret} if chosen on the board
  phase: 'idle',       // idle | waiting | bending | vibrato
  points: [],          // {t, c, band}
  analyzer: null,
  lastValidT: 0,
  lockBuf: [],         // recent midi values for auto-lock
  targetSince: null,   // bend: when the pitch first sat on the target
  vibratoStart: null,  // when the current vibrato phase began (ghost starts here)
  result: null,
  problem: null, problemCandidate: null, problemCount: 0,
  session: { scores: [], cycles: 0 },
};

const fretboard = createFretboard($('fretboard'));
const lane = createLane($('lane'));
const tracker = createTracker({
  onFrame: handleFrame,
  onState: (s, err) => {
    const msg = s === 'denied' ? 'Microphone blocked — allow it in the browser’s site settings, then reload.'
      : s === 'error' ? `Couldn’t start the microphone: ${err && err.message ? err.message : err}` : '';
    $('mic-note').textContent = msg; $('mic-note').hidden = !msg;
  },
  clarityThreshold: settings.clarity, gate: settings.gate, gain: settings.gain,
});

function bendTarget() { return st.baseline + settings.bendCents / 100; }
function newAnalyzer() {
  st.analyzer = createAnalyzer({ mode: settings.mode, depth: settings.depth, bendCents: settings.bendCents });
  st.result = null;
}

// ---------- frames ----------
function handleFrame(f) {
  if (!st.running) return;
  const now = f.t;
  if (f.midi == null) {
    if (now - st.lastValidT > 0.4 && st.phase !== 'waiting') { st.phase = 'waiting'; st.targetSince = null; newAnalyzer(); }
    return;
  }
  st.lastValidT = now;

  // auto-lock the note: 300 ms of readings agreeing on one semitone
  if (st.baseline == null) {
    st.lockBuf.push({ t: now, m: f.midi });
    while (st.lockBuf.length && now - st.lockBuf[0].t > 0.3) st.lockBuf.shift();
    const rounded = Math.round(f.midi);
    if (now - st.lockBuf[0].t >= 0.28 && st.lockBuf.every(x => Math.abs(x.m - rounded) < 0.4)) {
      setBaseline(rounded, null);
    } else return;
  }

  const c = (f.midi - st.baseline) * 100;
  if (st.phase === 'waiting' || st.phase === 'idle') { st.phase = settings.mode === 'bend' ? 'bending' : 'vibrato'; st.vibratoStart = now; }

  if (settings.mode === 'bend' && st.phase === 'bending') {
    const onTarget = Math.abs(c - settings.bendCents) < 25;
    if (onTarget) { if (st.targetSince == null) st.targetSince = now; if (now - st.targetSince > 0.15) { st.phase = 'vibrato'; st.vibratoStart = now; newAnalyzer(); } }
    else st.targetSince = null;
    st.points.push({ t: now, c, band: onTarget ? 'ok' : c > settings.bendCents + 25 ? 'bad' : 'warn' });
  } else {
    st.points.push({ t: now, c, band: pointBand(c, settings) });
    st.analyzer.push(now, c);
  }
  while (st.points.length && now - st.points[0].t > 5) st.points.shift();
}

function setBaseline(midi, pos) {
  st.baseline = midi; st.pos = pos; st.lockBuf = [];
  st.phase = 'waiting'; st.targetSince = null;
  newAnalyzer();
  renderNote();
}

// ---------- analysis loop (10×/s) ----------
setInterval(() => {
  if (!st.running || !st.analyzer || st.phase !== 'vibrato') return;
  const r = st.analyzer.analyze();
  st.result = r;
  // a problem must be reported twice in a row before it replaces the current one (no flicker)
  if (r.problem) {
    if (st.problemCandidate && st.problemCandidate.code === r.problem.code) st.problemCount++;
    else { st.problemCandidate = r.problem; st.problemCount = 1; }
    if (st.problemCount >= 2 || !st.problem) st.problem = r.problem;
  }
  if (r.score != null) { st.session.scores.push(r.score); if (st.session.scores.length > 600) st.session.scores.shift(); }
  renderSide();
}, 100);

// ---------- render ----------
function frame() {
  requestAnimationFrame(frame);
  const now = tracker.context ? tracker.context.currentTime : performance.now() / 1000;
  const bend = settings.mode === 'bend';
  const labels = st.baseline == null ? {} : bend
    ? { base: `base · ${noteName(st.baseline)}${st.pos ? ` (fret ${st.pos.fret})` : ''}`, target: `target · ${noteName(bendTarget())}` }
    : { home: `note · ${noteName(st.baseline)}`, target: `target +${settings.depth}¢` };
  const r = st.result;
  lane.draw({
    now, points: st.points, mode: settings.mode, depth: settings.depth, bendCents: settings.bendCents, labels,
    cycles: r ? r.cycles.filter(cy => now - cy.t < 4) : [], rate: r && r.rate, lastFarT: r && r.cycles.length ? r.cycles[r.cycles.length - 1].far.t : null,
    ghostFrom: st.vibratoStart,
    message: !st.running ? 'Press Start, then play a note and add vibrato' : st.baseline == null ? 'Play a note and hold it — it locks in 300 ms' : st.phase === 'bending' ? 'Bend up to the target line' : st.phase === 'waiting' ? 'Play the note' : '',
  });
}
requestAnimationFrame(frame);

function noteName(midi) { return `${midiToNoteName(Math.round(midi))}${midiToOctave(Math.round(midi))}`; }

function renderNote() {
  const bend = settings.mode === 'bend';
  if (st.baseline == null) {
    $('note-name').textContent = '—';
    $('note-meta').innerHTML = bend ? 'Tap the base fret on the board, or play the unbent note and hold it.' : 'Tap a position on the board, or just play a note and hold it.';
    return;
  }
  $('note-name').textContent = bend ? `${midiToNoteName(st.baseline)} → ${midiToNoteName(Math.round(bendTarget()))}` : midiToNoteName(st.baseline);
  const where = st.pos ? `String ${STRINGS[st.pos.string].number} · fret ${st.pos.fret}` : `${noteName(st.baseline)} (any string)`;
  $('note-meta').innerHTML = bend
    ? `<b>${where}, bend ${settings.bendCents / 100 === 1 ? '½' : settings.bendCents / 100 === 2 ? 'a full' : '1½'} step</b><br>Bend up to the target, then vibrato at the top.`
    : `<b>${where}</b><br>Vibrato goes up from the note to +${settings.depth}¢ and back.`;
  fretboard.clearNotes();
  if (st.pos) {
    fretboard.showNote(st.pos.string, st.pos.fret, 'root', midiToNoteName(st.baseline));
    if (bend) { const f = fretForMidi(st.pos.string, Math.round(bendTarget())); if (f >= 0) fretboard.showNote(st.pos.string, f, 'hint', midiToNoteName(Math.round(bendTarget()))); }
  }
}

function band(v, ok, warn) { return v <= ok ? 'ok' : v <= warn ? 'warn' : 'bad'; }
function renderSide() {
  const r = st.result;
  const score = r && r.score != null ? r.score : null;
  $('score').textContent = score == null ? '–' : score;
  const ring = $('ring');
  ring.style.strokeDashoffset = 251 * (1 - (score || 0) / 100);
  ring.style.stroke = score == null ? 'var(--faint)' : score >= 75 ? 'var(--ok)' : score >= 55 ? 'var(--accent)' : 'var(--bad)';
  const set = (id, text, cls) => { const el = $(id); el.className = 'vm ' + (cls || ''); el.querySelector('.v').textContent = text; };
  if (!r || r.n < 2) {
    set('c-rate', '–'); set('c-depth', '–'); set('c-even', '–'); set('c-return', '–');
  } else {
    set('c-rate', r.rate ? `${r.rate.toFixed(1)} Hz` : '–', r.rate ? (r.rate >= 4 && r.rate <= 7.5 ? 'ok' : 'bad') : '');
    set('c-depth', `${Math.round(r.depth)}¢`, band(Math.abs(r.depth - settings.depth) / settings.depth, 0.2, 0.4));
    set('c-even', `±${Math.round(r.evenness)}¢`, band(r.evenness / settings.depth, 0.15, 0.3));
    set('c-return', `${r.ret >= 0 ? '+' : ''}${Math.round(r.ret)}¢`, band(Math.abs(r.ret), 15, 35));
  }
  const fb = $('fb');
  if (st.problem) {
    fb.className = 'vfb ' + (st.problem.code === 'good' ? 'ok' : score != null && score >= 55 ? 'warn' : 'bad');
    fb.innerHTML = `${st.problem.text}<small>${st.problem.tip}</small>`;
  }
  const s = st.session.scores;
  $('session').textContent = s.length ? `Session · avg ${Math.round(s.reduce((a, b) => a + b, 0) / s.length)} · best ${Math.max(...s)}` : '';
}

// ---------- controls ----------
async function toggle() {
  if (!st.running) {
    await tracker.start();
    if (tracker.state !== 'running') return;
    st.running = true; st.points = []; st.phase = st.baseline == null ? 'idle' : 'waiting'; newAnalyzer();
    $('start-btn').innerHTML = 'Stop <kbd>Space</kbd>'; $('start-btn').classList.add('is-running');
  } else {
    tracker.stop();
    st.running = false; st.phase = 'idle';
    $('start-btn').innerHTML = 'Start <kbd>Space</kbd>'; $('start-btn').classList.remove('is-running');
  }
}
$('start-btn').addEventListener('click', toggle);
$('relock-btn').addEventListener('click', () => { st.baseline = null; st.pos = null; st.phase = 'idle'; st.points = []; st.problem = null; st.result = null; renderNote(); renderSide(); fretboard.clearNotes(); });
document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag)) return;
  if (e.code === 'Space') { e.preventDefault(); toggle(); }
  else if (e.key === 'l' || e.key === 'L') $('relock-btn').click();
});

fretboard.onTap(({ string, fret }) => { setBaseline(noteAt(string, fret).midi, { string, fret }); st.points = []; st.problem = null; renderSide(); });

function chips(sel, key, parse = (v) => v) {
  document.querySelectorAll(sel).forEach((b) => b.addEventListener('click', () => {
    settings[key] = parse(b.dataset.v); save(); syncUI();
    newAnalyzer(); st.points = []; st.problem = null; st.result = null; st.phase = st.baseline == null ? st.phase : 'waiting';
    renderNote(); renderSide();
  }));
}
chips('[data-k="mode"]', 'mode');
chips('[data-k="depth"]', 'depth', Number);
chips('[data-k="bend"]', 'bendCents', Number);

function syncUI() {
  document.querySelectorAll('[data-k]').forEach((b) => b.classList.toggle('is-active', String(settings[{ mode: 'mode', depth: 'depth', bend: 'bendCents' }[b.dataset.k]]) === b.dataset.v));
  $('bend-row').hidden = settings.mode !== 'bend';
  $('lane-title').textContent = settings.mode === 'bend' ? `Vibrato on a bend · dips ${settings.depth}¢ below the target` : `Fretted vibrato · up to +${settings.depth}¢ and back`;
}

// mic sliders
for (const [id, key, scale] of [['gate', 'gate', 1000], ['clarity', 'clarity', 1], ['gain', 'gain', 1]]) {
  const el = $(id); el.value = settings[key] * scale;
  const out = $(id + '-out'); out.textContent = id === 'clarity' ? `${Math.round(settings.clarity * 100)}%` : id === 'gain' ? `${settings.gain.toFixed(1)}×` : Math.round(settings.gate * 1000);
  el.addEventListener('input', () => {
    settings[key] = +el.value / scale; save();
    out.textContent = id === 'clarity' ? `${Math.round(settings.clarity * 100)}%` : id === 'gain' ? `${settings.gain.toFixed(1)}×` : Math.round(settings.gate * 1000);
    if (key === 'gain') tracker.setGain(settings.gain);
    if (key === 'gate') tracker.setGate(settings.gate);
  });
}

syncUI(); renderNote(); renderSide();
window.vibrato = { st, settings, tracker, lane, fretboard, setBaseline };
