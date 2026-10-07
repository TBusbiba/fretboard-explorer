import { STRINGS, FRET_COUNT, spokenName } from './notes.js';
import { createFretboard } from './fretboard.js';
import { createPitchDetector } from './pitch.js';
import { createVoice } from './voice.js';
import { createSession } from './session.js';
import { loadSettings, saveSettings, resetSettings, DEFAULTS } from './settings.js';

const $ = (id) => document.getElementById(id);
const RING_LEN = 113.1;
const WRONG_MARKER_MS = 1200;
const SPEECH_TAIL_MS = 250;

let settings = loadSettings();

// ---------- modules ----------
const fretboard = createFretboard($('fretboard'));

let muteTimer = 0;
const voice = createVoice({
  onSpeaking(speaking) {
    clearTimeout(muteTimer);
    if (speaking) pitch.setMuted(true);
    else muteTimer = setTimeout(() => pitch.setMuted(false), SPEECH_TAIL_MS);
  },
});

const pitch = createPitchDetector({
  getSettings: () => settings,
  onNote: (midi) => session.noteDetected(midi),
  onLevel: updateMeter,
  onState: updateMicState,
});

const session = createSession({
  getSettings: () => settings,
  onEvent: handleSessionEvent,
});

// ---------- elements ----------
const ui = {
  stringName: $('string-name'), noteName: $('note-name'), status: $('status'),
  boardScroll: $('board-scroll'),
  startBtn: $('start-btn'), skipBtn: $('skip-btn'), hintBtn: $('hint-btn'),
  meterFill: $('meter-fill'), meterGate: $('meter-gate'), micNote: $('mic-note'),
  ring: $('ring'), ringFill: $('ring-fill'), ringLabel: $('ring-label'),
  statCount: $('stat-count'), statAccuracy: $('stat-accuracy'), statAvg: $('stat-avg'), statWrong: $('stat-wrong'),
};

// ---------- session events ----------
let wrongTimers = [];

function handleSessionEvent(type, p) {
  switch (type) {
    case 'target': {
      wrongTimers.forEach(clearTimeout); wrongTimers = [];
      fretboard.clearNotes();
      fretboard.highlightString(p.target.string);
      scrollBoardTo(p.target.fret);
      pitch.reset();
      setPrompt(`String ${STRINGS[p.target.string].number}`, p.note.name, 'listening');
      setStatus('Listening…');
      ui.ring.classList.remove('is-done');
      if (settings.voice) voice.speak(`string ${STRINGS[p.target.string].number}, ${spokenName(p.note.name)}`, voiceOpts());
      break;
    }
    case 'hint':
      fretboard.showNote(p.target.string, p.target.fret, 'hint', session.note.name);
      ui.ring.classList.add('is-done');
      setStatus(`Fret ${p.target.fret}`);
      break;
    case 'correct':
      fretboard.showNote(p.target.string, p.target.fret, 'correct', session.note.name);
      ui.noteName.dataset.state = 'correct';
      setStatus(`Correct · ${(p.ms / 1000).toFixed(1)} s`, 'ok');
      if (settings.voice && settings.speakFeedback) voice.speak('correct', voiceOpts());
      updateStats();
      break;
    case 'wrong': {
      // Only mark positions inside the practised range; an octave-off note is
      // explained in words instead of pointing at a fret you aren't studying.
      if (p.fret >= settings.fretFrom && p.fret <= settings.fretTo && !p.octaveOff) {
        fretboard.showNote(session.target.string, p.fret, 'wrong', p.name);
        const { string } = session.target, fret = p.fret;
        wrongTimers.push(setTimeout(() => fretboard.hideNote(string, fret), WRONG_MARKER_MS));
      }
      ui.noteName.dataset.state = 'wrong';
      wrongTimers.push(setTimeout(() => { if (session.state === 'listening') ui.noteName.dataset.state = 'listening'; }, 600));
      const text = p.octaveOff
        ? `That's ${p.name}, but an octave too ${p.octaveOff > 0 ? 'high' : 'low'}`
        : `That was ${p.name}`;
      const spoken = p.octaveOff
        ? `octave too ${p.octaveOff > 0 ? 'high' : 'low'}`
        : `that was ${spokenName(p.name)}`;
      setStatus(text, 'bad');
      if (settings.voice && settings.speakFeedback) voice.speak(spoken, voiceOpts());
      updateStats();
      break;
    }
    case 'stopped':
      voice.cancel();
      fretboard.clearNotes();
      fretboard.highlightString(null);
      setPrompt('Stopped', '', 'idle');
      setStatus(`${p.stats.total} notes · press Start to go again`);
      setRing(0);
      ui.ring.classList.remove('is-done');
      break;
    case 'error':
      setStatus(p.message, 'bad');
      break;
  }
  syncButtons();
}

function voiceOpts() { return { voiceName: settings.voiceName, rate: settings.voiceRate }; }

function setPrompt(stringText, noteText, state) {
  ui.stringName.textContent = stringText;
  ui.stringName.classList.toggle('is-live', state === 'listening');
  ui.noteName.dataset.state = state;
  if (ui.noteName.textContent !== noteText) {
    ui.noteName.textContent = noteText;
    ui.noteName.classList.remove('is-entering');
    void ui.noteName.offsetWidth; // restart animation
    ui.noteName.classList.add('is-entering');
  }
}

function setStatus(text, tone = '') {
  ui.status.textContent = text;
  ui.status.className = 'prompt__status' + (tone ? ` is-${tone}` : '');
}

function scrollBoardTo(fret) {
  const el = ui.boardScroll;
  if (el.scrollWidth <= el.clientWidth + 4) return;
  const x = fretboard.fretPosition(fret) * el.scrollWidth - el.clientWidth / 2;
  el.scrollTo({ left: Math.max(0, x), behavior: 'smooth' });
}

function updateStats() {
  const s = session.stats;
  ui.statCount.textContent = s.total;
  ui.statAccuracy.textContent = s.total ? `${Math.round((s.firstTry / s.total) * 100)}%` : '—';
  ui.statAvg.textContent = s.times.length ? `${(s.avgMs / 1000).toFixed(1)} s` : '—';
  ui.statWrong.textContent = s.wrong;
}

function syncButtons() {
  const running = session.state !== 'idle';
  ui.startBtn.innerHTML = running ? 'Stop <kbd>Space</kbd>' : 'Start <kbd>Space</kbd>';
  ui.startBtn.classList.toggle('is-running', running);
  ui.skipBtn.disabled = !running;
  ui.hintBtn.disabled = !(session.state === 'listening' && !session.hintShown);
}

// ---------- hint ring ----------
function setRing(fraction) {
  ui.ringFill.style.strokeDashoffset = RING_LEN * (1 - Math.min(1, Math.max(0, fraction)));
}

function updateRingLabel() {
  ui.ringLabel.textContent = settings.hintDelayMs == null ? '∞' : `${Math.round(settings.hintDelayMs / 1000)}s`;
}

function frame() {
  requestAnimationFrame(frame);
  if (session.state === 'idle') return;
  session.tick();
  if (session.state === 'listening' && settings.hintDelayMs != null && !session.hintShown) {
    const elapsed = performance.now() - session.startedAt;
    setRing(elapsed / settings.hintDelayMs);
    ui.ringLabel.textContent = `${Math.max(0, Math.ceil((settings.hintDelayMs - elapsed) / 1000))}s`;
  } else if (session.state === 'listening' && settings.hintDelayMs == null) {
    setRing(0);
    ui.ringLabel.textContent = '∞';
  } else if (session.hintShown || session.state === 'resolved') {
    setRing(session.hintShown ? 1 : 0);
    ui.ringLabel.textContent = session.hintShown ? 'hint' : '·';
  }
}
requestAnimationFrame(frame);

// ---------- mic ----------
function updateMeter(rms, gate) {
  const pct = Math.min(100, Math.sqrt(rms / 0.25) * 100); // sqrt curve so quiet signals are visible
  ui.meterFill.style.width = `${pct}%`;
  ui.meterFill.classList.toggle('is-open', rms >= gate);
  ui.meterGate.style.left = `${Math.min(100, Math.sqrt(gate / 0.25) * 100)}%`;
}

function updateMicState(state, detail) {
  let msg = '';
  if (state === 'denied') msg = 'Microphone blocked — allow it in the browser’s site settings, then reload. Hints still work.';
  else if (state === 'error') msg = `Couldn’t open the microphone${detail && detail.message ? `: ${detail.message}` : ''}. Hints still work.`;
  ui.micNote.textContent = msg;
  ui.micNote.hidden = !msg;
}

if (!window.isSecureContext) {
  updateMicState('error', { message: 'this page must be opened over http://localhost or https' });
}

// ---------- controls ----------
async function toggleSession() {
  if (session.state === 'idle') {
    await pitch.start();
    session.start();
  } else {
    session.stop();
    pitch.stop();
  }
}

ui.startBtn.addEventListener('click', toggleSession);
ui.skipBtn.addEventListener('click', () => session.skip());
ui.hintBtn.addEventListener('click', () => { session.showHint(); syncButtons(); });

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); toggleSession(); }
  else if (e.key === 'n' || e.key === 'N') session.skip();
  else if (e.key === 'h' || e.key === 'H') { session.showHint(); syncButtons(); }
  else if (e.key === 'Escape') closeSettings();
});

// ---------- settings drawer ----------
const drawer = $('settings'), scrim = $('scrim'), openBtn = $('settings-open');

function openSettings() {
  drawer.hidden = false; scrim.hidden = false;
  openBtn.setAttribute('aria-expanded', 'true');
  $('settings-close').focus();
}
function closeSettings() {
  if (drawer.hidden) return;
  drawer.hidden = true; scrim.hidden = true;
  openBtn.setAttribute('aria-expanded', 'false');
  openBtn.focus();
}
openBtn.addEventListener('click', openSettings);
$('settings-close').addEventListener('click', closeSettings);
scrim.addEventListener('click', closeSettings);

function commit(patch) {
  settings = { ...settings, ...patch };
  saveSettings(settings);
  applySettingsToUI();
}

const f = {
  pills: $('string-pills'), fretFrom: $('fret-from'), fretTo: $('fret-to'), presets: $('fret-presets'),
  hintDelay: $('hint-delay'), hintOut: $('hint-out'), pause: $('pause'), pauseOut: $('pause-out'),
  voiceOn: $('voice-on'), voiceFeedback: $('voice-feedback'), voiceSelect: $('voice-select'),
  voiceRate: $('voice-rate'), rateOut: $('rate-out'), voiceTest: $('voice-test'),
  gate: $('gate'), gateOut: $('gate-out'), clarity: $('clarity'), clarityOut: $('clarity-out'),
  gain: $('gain'), gainOut: $('gain-out'), reset: $('settings-reset'),
};

// strings
STRINGS.forEach((s) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pill'; b.textContent = `${s.number} · ${s.label}`; b.dataset.index = s.index;
  b.addEventListener('click', () => {
    const on = new Set(settings.strings);
    on.has(s.index) ? on.delete(s.index) : on.add(s.index);
    commit({ strings: [...on].sort() });
  });
  f.pills.appendChild(b);
});

// frets
function commitFrets(from, to) {
  from = Math.max(0, Math.min(FRET_COUNT - 1, from | 0));
  to = Math.max(0, Math.min(FRET_COUNT - 1, to | 0));
  if (from > to) [from, to] = [to, from];
  commit({ fretFrom: from, fretTo: to });
}
f.fretFrom.addEventListener('change', () => commitFrets(+f.fretFrom.value, settings.fretTo));
f.fretTo.addEventListener('change', () => commitFrets(settings.fretFrom, +f.fretTo.value));
f.presets.addEventListener('click', (e) => {
  const c = e.target.closest('.chip'); if (!c) return;
  commitFrets(+c.dataset.from, +c.dataset.to);
});

// note set
document.querySelectorAll('input[name="noteset"]').forEach((r) =>
  r.addEventListener('change', () => commit({ naturalsOnly: r.value === 'naturals' })));

// hint + pause
f.hintDelay.addEventListener('input', () => {
  const v = +f.hintDelay.value;
  commit({ hintDelayMs: v >= 16 ? null : v * 1000 });
});
f.pause.addEventListener('input', () => commit({ pauseMs: +f.pause.value }));

// voice
f.voiceOn.addEventListener('change', () => commit({ voice: f.voiceOn.checked }));
f.voiceFeedback.addEventListener('change', () => commit({ speakFeedback: f.voiceFeedback.checked }));
f.voiceSelect.addEventListener('change', () => commit({ voiceName: f.voiceSelect.value }));
f.voiceRate.addEventListener('input', () => commit({ voiceRate: +f.voiceRate.value }));
f.voiceTest.addEventListener('click', () => voice.speak('string 5, C sharp', voiceOpts()));

function populateVoices() {
  const list = voice.getVoices();
  f.voiceSelect.innerHTML = '<option value="">Browser default</option>';
  for (const v of list) {
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    f.voiceSelect.appendChild(o);
  }
  f.voiceSelect.value = list.some(v => v.name === settings.voiceName) ? settings.voiceName : '';
}
if (voice.supported) {
  populateVoices();
  speechSynthesis.addEventListener('voiceschanged', populateVoices);
} else {
  f.voiceOn.disabled = f.voiceFeedback.disabled = f.voiceSelect.disabled = f.voiceTest.disabled = true;
  commit({ voice: false });
}

// mic
f.gate.addEventListener('input', () => commit({ gate: +f.gate.value / 1000 }));
f.clarity.addEventListener('input', () => commit({ clarity: +f.clarity.value }));
f.gain.addEventListener('input', () => commit({ gain: +f.gain.value }));

f.reset.addEventListener('click', () => { settings = resetSettings(); applySettingsToUI(); });

function applySettingsToUI() {
  f.pills.querySelectorAll('.pill').forEach((b) =>
    b.setAttribute('aria-pressed', settings.strings.includes(+b.dataset.index)));
  f.fretFrom.value = settings.fretFrom;
  f.fretTo.value = settings.fretTo;
  f.presets.querySelectorAll('.chip').forEach((c) =>
    c.classList.toggle('is-active', +c.dataset.from === settings.fretFrom && +c.dataset.to === settings.fretTo));
  fretboard.setRange(settings.fretFrom, settings.fretTo);

  document.querySelector(`input[name="noteset"][value="${settings.naturalsOnly ? 'naturals' : 'chromatic'}"]`).checked = true;

  f.hintDelay.value = settings.hintDelayMs == null ? 16 : settings.hintDelayMs / 1000;
  f.hintOut.textContent = settings.hintDelayMs == null ? 'never' : `${settings.hintDelayMs / 1000} s`;
  f.pause.value = settings.pauseMs;
  f.pauseOut.textContent = `${(settings.pauseMs / 1000).toFixed(1)} s`;
  updateRingLabel();

  f.voiceOn.checked = settings.voice;
  f.voiceFeedback.checked = settings.speakFeedback;
  f.voiceFeedback.disabled = !settings.voice || !voice.supported;
  if (f.voiceSelect.querySelector(`option[value="${CSS.escape(settings.voiceName)}"]`)) f.voiceSelect.value = settings.voiceName;
  f.voiceRate.value = settings.voiceRate;
  f.rateOut.textContent = `${settings.voiceRate.toFixed(1)}×`;

  f.gate.value = Math.round(settings.gate * 1000);
  f.gateOut.textContent = `${Math.round(settings.gate * 1000)}`;
  f.clarity.value = settings.clarity;
  f.clarityOut.textContent = `${Math.round(settings.clarity * 100)}%`;
  f.gain.value = settings.gain;
  f.gainOut.textContent = `${settings.gain.toFixed(1)}×`;
}

applySettingsToUI();
syncButtons();
updateStats();

// Expose for poking around in devtools.
window.practice = { session, pitch, voice, fretboard, get settings() { return settings; }, DEFAULTS };
