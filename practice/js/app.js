import { STRINGS, FRET_COUNT, INTERVALS, CHORDS, TRIADS, STRING_GROUPS, INVERSIONS, DEGREE_LABELS, intervalById, chordById, triadById, selectedTriads, stringGroupById, spokenName, tipFor, noteAt, pickTarget, pitchClass } from './notes.js';
import { createFretboard } from './fretboard.js';
import { createPitchDetector } from './pitch.js';
import { createVoice } from './voice.js';
import { createSound } from './sound.js';
import { createMicGate } from './mic-gate.js';
import { createSession } from './session.js';
import { createHistory } from './history.js';
import { LEVELS, WINDOW, FIRST_TRY_MIN, AVG_MS_MAX, STAR2_MS, STAR3_MS, levelById, levelTitle, createPath, createBoss, positionWeigher } from './path.js';
import { shapeSvg } from './triad-shapes.js';
import { loadSettings, saveSettings, resetSettings, DEFAULTS } from './settings.js';

const $ = (id) => document.getElementById(id);

// Any uncaught error is shown on the page (with a hard-reload hint, since a
// stale cached module is the usual cause) instead of failing silently.
function showFault(message) {
  let el = $('fault');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fault'; el.className = 'stale';
    document.body.appendChild(el);
  }
  el.textContent = `Something broke: ${message} — try a hard reload (Cmd+Shift+R).`;
}
window.addEventListener('error', (e) => showFault(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => showFault(e.reason && e.reason.message ? e.reason.message : String(e.reason)));

// Guard against a browser mixing a cached index.html with newer scripts (or
// vice versa): bump both this and data-build in index.html together.
const BUILD = '16';
if (document.documentElement.dataset.build !== BUILD) {
  const el = $('stale');
  if (el) el.hidden = false;
  else document.body.insertAdjacentHTML('afterbegin', '<div class="stale">This page is out of date — press Cmd+Shift+R to reload it.</div>');
  throw new Error(`Fretboard Practice: index.html build ${document.documentElement.dataset.build} ≠ app.js build ${BUILD}`);
}
const RING_LEN = 113.1;
const WRONG_MARKER_MS = 1200;

let settings = loadSettings();

// What the session actually drills: a single picked interval, or the random pool.
function sessionSettings() {
  const pick = settings.intervalPick, cpick = settings.chordPick;
  return {
    ...settings,
    // Path: the level's notes on all six strings, weighted to what is missed or slow.
    ...(isNoteMode() && settings.noteMode === 'path' ? { notes: path.currentLevel.notes, strings: [0, 1, 2, 3, 4, 5], weigh: weighPosition } : {}),
    intervals: pick && pick !== 'random' ? [pick] : settings.intervals,
    chords: cpick && cpick !== 'random' ? [cpick] : settings.chords,
    triads: selectedTriads(settings.triadPick),
  };
}

// ---------- modules ----------
const fretboard = createFretboard($('fretboard'));
const history = createHistory();
const path = createPath();
const isNoteMode = () => !['intervals', 'arpeggios', 'triads'].includes(settings.mode);
const fretRange = () => ({ from: settings.fretFrom, to: settings.fretTo });
let weigher = null;   // rebuilt from the history after every answer
function weighPosition(string, fret) { return (weigher ||= positionWeigher(history.positions()))(string, fret); }
let boss = null;      // the boss round in progress, else null
let notice = null;    // {text, tone}: shown instead of "Listening…" on the next question

// The mic is ignored while the voice speaks or a note plays, plus a grace period
// after each (the speakers' tail and echo), in every mode.
const micGate = createMicGate();
const voice = createVoice({ onSpeaking: (v) => micGate.block('voice', v) });
const sound = createSound({ onPlaying: (v) => micGate.block('sound', v) });

// Arpeggio and triad cue: the question's notes, one after another, unless Play the notes is off.
function playCue() {
  if (settings.playNotes) return sound.playSequence(session.steps.map(n => n.midi));
}

// Speak, then play. Dropped if the target changed meanwhile.
let promptToken = 0;
// `speak` forces the voice on (Say + play the note) even when spoken prompts are off.
async function announce(text, playMidi, { speak = settings.voice } = {}) {
  const token = ++promptToken;
  if (speak && text) await voice.speak(text, voiceOpts());
  if (token !== promptToken) return;
  if (playMidi != null) await sound.play(playMidi);
}

const pitch = createPitchDetector({
  getSettings: () => settings,
  getExpected: () => (session.state === 'listening' && session.note ? session.note.midi : null),
  isMuted: (now) => micGate.isMuted(now),
  onNote: (midi) => { if (!micGate.isMuted()) session.noteDetected(midi); },
  onLevel: updateMeter,
  onState: updateMicState,
});

const session = createSession({
  getSettings: sessionSettings,
  pickNote: (opts, previous, rng) => {
    const item = boss && boss.current;
    return item ? { string: item.string, fret: item.fret } : pickTarget(opts, previous, rng);
  },
  onEvent: handleSessionEvent,
});

// ---------- elements ----------
const ui = {
  stringName: $('string-name'), noteName: $('note-name'), status: $('status'), tip: $('tip'),
  boardScroll: $('board-scroll'),
  startBtn: $('start-btn'), skipBtn: $('skip-btn'), hintBtn: $('hint-btn'),
  meterFill: $('meter-fill'), meterGate: $('meter-gate'), micNote: $('mic-note'),
  ring: $('ring'), ringFill: $('ring-fill'), ringLabel: $('ring-label'),
  statCount: $('stat-count'), statAccuracy: $('stat-accuracy'), statAvg: $('stat-avg'), statWrong: $('stat-wrong'),
  customPicker: $('custom-picker'), customNotes: $('custom-notes'), customStrings: $('custom-strings'),
  noteModePicker: $('note-mode-picker'), path: $('path'), pathMap: $('path-map'), pathTitle: $('path-title'), pathGoal: $('path-goal'),
  pathStats: $('path-stats'), bossBtn: $('boss-btn'), bossNote: $('boss-note'),
  earPicker: $('ear-picker'), earToggle: $('ear-toggle'), earReplay: $('ear-replay'), namesToggle: $('names-toggle'),
  shapesToggle: $('shapes-toggle'), prompt: $('prompt'), promptTools: $('prompt-tools'), cueToggle: $('cue-toggle'), cuePicker: $('cue-picker'), shapes: $('shapes'), shapesTabs: $('shapes-tabs'), shapesList: $('shapes-list'),
  picker: $('interval-picker'), chordPicker: $('chord-picker'), triadPicker: $('triad-picker'), groupPicker: $('group-picker'), inversionPicker: $('inversion-picker'),
  heatReset: $('heat-reset'), heatBody: $('heat-body'),
};

// ---------- session events ----------
let wrongTimers = [];
let shapesType = null;   // triad type shown in the shapes cheat sheet
let shapesNow = null;    // {triad, group} of the question being drilled, else null
let lastTriadKey = null; // chord + strings of the previous triad target, to keep the voice short within a sequence

function handleSessionEvent(type, p) {
  switch (type) {
    case 'target': {
      wrongTimers.forEach(clearTimeout); wrongTimers = [];
      fretboard.clearNotes();
      pitch.reset();
      ui.ring.classList.remove('is-done');
      setTip('');
      if (p.mode === 'intervals') {
        const { root } = p.target, iv = session.interval, rootNote = session.rootNote;
        fretboard.highlightString(null);
        fretboard.showNote(root.string, root.fret, 'root', rootNote.name);
        scrollBoardTo(root.fret);
        setPrompt(`${rootNote.name} on string ${STRINGS[root.string].number} · then find`, `${iv.label} ${iv.arrow}`, 'listening');
        setStatus('Play the root first');
        announce(`${spokenName(rootNote.name)}, string ${STRINGS[root.string].number}. Then ${iv.spoken}`, settings.playNotes ? rootNote.midi : null);
      } else if (p.mode === 'arpeggios') {
        const { root } = p.target, chord = session.chord, rootNote = session.rootNote;
        fretboard.highlightString(null);
        fretboard.showNote(root.string, root.fret, 'root', 'R');
        scrollBoardTo(root.fret + 2);
        setPrompt(`Arpeggio · string ${STRINGS[root.string].number} → 1 · ${session.steps.length} notes`, `${rootNote.name} ${chord.label}`, 'listening');
        setStatus('Play the root first');
        announce(`${spokenName(rootNote.name)} ${chord.spoken}, from string ${STRINGS[root.string].number}`, null)
          .then(playCue);
      } else if (p.mode === 'triads') {
        const triad = session.triad, rootNote = session.rootNote, inv = INVERSIONS[p.target.inversion], group = stringGroupById(p.target.group);
        const low = session.steps[0];
        fretboard.highlightString(null);
        scrollBoardTo(low.fret + 1);
        shapesNow = { triad: p.target.triad, group: p.target.group };
        shapesType = p.target.triad;
        renderShapes();
        setPrompt(`Triad · strings ${group.label} · ${inv.label}`, `${rootNote.name} ${triad.label}`, 'listening');
        setStatus(`Play it low to high, starting on string ${STRINGS[low.string].number}`);
        // Same chord on the same strings as last time (a Root → 1st → 2nd or Climb
        // sequence): just name the inversion.
        const key = `${p.target.group}|${p.target.triad}|${p.target.rootPc}`;
        const continuing = key === lastTriadKey;
        lastTriadKey = key;
        const text = continuing
          ? inv.label
          : `${spokenName(rootNote.name)} ${triad.spoken}, ${inv.label}, strings ${group.strings.map(s => STRINGS[s].number).join(' ')}`;
        announce(text, null).then(playCue);
      } else {
        fretboard.highlightString(p.target.string);
        scrollBoardTo(p.target.fret);
        const inBoss = boss && boss.state === 'running';
        setPrompt(`${inBoss ? `Boss round · ${boss.index + 1} of ${boss.items.length} · ` : ''}String ${STRINGS[p.target.string].number}`, p.note.name, 'listening');
        if (notice) { setStatus(notice.text, notice.tone); notice = null; }
        else setStatus(inBoss ? 'Boss round: a wrong note or a skip ends it' : 'Listening…');
        announce(`string ${STRINGS[p.target.string].number}, ${spokenName(p.note.name)}`, settings.playNote ? p.note.midi : null,
          { speak: settings.voice || settings.playNote });
      }
      break;
    }
    case 'step': {
      const done = session.steps[p.step - 1];
      if (session.mode === 'arpeggios' || session.mode === 'triads') {
        fretboard.showNote(done.string, done.fret, 'correct', DEGREE_LABELS[done.degree] || done.name);
        const next = session.note;
        setStatus(`${p.step} of ${p.total} ✓ — next: ${DEGREE_LABELS[next.degree] || next.name} (${next.name}) on string ${STRINGS[next.string].number}`, 'ok');
      } else {
        const { root } = session.target, iv = session.interval;
        fretboard.showNote(root.string, root.fret, 'correct', session.rootNote.name);
        setStatus(`Root ✓ — now the ${iv.label} ${iv.arrow}`, 'ok');
        if (settings.voice && settings.speakFeedback) voice.speak('good', voiceOpts());
      }
      break;
    }
    case 'hint':
      if (session.mode === 'arpeggios' || session.mode === 'triads') {
        if (p.stage === 1) {
          setTip(session.mode === 'triads' ? `${session.triad.tip} ${INVERSIONS[session.target.inversion].tip}` : session.chord.tip);
        } else {
          // Only the note that is due now; the next one gets its own countdown.
          const n = session.steps[p.step];
          fretboard.showNote(n.string, n.fret, 'hint', DEGREE_LABELS[n.degree] || n.name);
          setStatus(`${DEGREE_LABELS[n.degree] || ''} ${n.name} — string ${STRINGS[n.string].number} fret ${n.fret}`);
          ui.ring.classList.add('is-done');
        }
      } else if (session.mode === 'intervals') {
        if (p.stage === 1) {
          setTip(tipFor(session.interval, p.target.root.string));
        } else {
          for (const pos of p.target.positions) fretboard.showNote(pos.string, pos.fret, 'hint', noteAt(pos.string, pos.fret).name);
          const where = p.target.positions.map(q => `string ${STRINGS[q.string].number} fret ${q.fret}`).join(' or ');
          setStatus(`${noteAt(p.target.positions[0].string, p.target.positions[0].fret).name} — ${where}`);
          ui.ring.classList.add('is-done');
        }
      } else {
        fretboard.showNote(p.target.string, p.target.fret, 'hint', session.note.name);
        setStatus(`Fret ${p.target.fret}`);
        ui.ring.classList.add('is-done');
      }
      break;
    case 'correct': {
      const result = { clean: p.firstTry && !p.hinted, ms: p.ms, hinted: p.hinted };
      if (session.mode === 'intervals') {
        for (const pos of p.target.positions) fretboard.showNote(pos.string, pos.fret, 'correct', session.note.name);
        history.recordInterval(p.target.interval, result);
      } else if (session.mode === 'arpeggios') {
        for (const n of session.steps) fretboard.showNote(n.string, n.fret, 'correct', DEGREE_LABELS[n.degree] || n.name);
        history.recordChord(p.target.chord, result);
      } else if (session.mode === 'triads') {
        for (const n of session.steps) fretboard.showNote(n.string, n.fret, 'correct', DEGREE_LABELS[n.degree] || n.name);
        history.recordTriad(p.target.triad, result);
      } else {
        fretboard.showNote(p.target.string, p.target.fret, 'correct', session.note.name);
        history.recordPosition(p.target, result);
        weigher = null;
      }
      ui.noteName.dataset.state = 'correct';
      const extra = session.mode === 'note' ? onNoteCorrect(p) : '';
      setStatus(`Correct · ${(p.ms / 1000).toFixed(1)} s${extra ? ` · ${extra}` : ''}`, 'ok');
      if (settings.voice && settings.speakFeedback) voice.speak('correct', voiceOpts());
      updateStats();
      renderHeatPanel();
      break;
    }
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
      const bossOver = session.mode === 'note' && boss && boss.state === 'running';
      if (bossOver) failBoss('wrong');
      setStatus(bossOver ? `${text} · Boss round over, try again anytime` : text, 'bad');
      if (settings.voice && settings.speakFeedback) voice.speak(spoken, voiceOpts());
      updateStats();
      break;
    }
    case 'stopped':
      boss = null; notice = null;
      renderPath();
      promptToken++;
      lastTriadKey = null;
      shapesNow = null;
      renderShapes();
      voice.cancel();
      fretboard.clearNotes();
      fretboard.highlightString(null);
      setPrompt('Stopped', '', 'idle');
      setStatus(`${p.stats.total} notes · press Start to go again`);
      setTip('');
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
    ui.noteName.classList.toggle('is-long', noteText.length > 3);
    ui.noteName.classList.remove('is-entering');
    void ui.noteName.offsetWidth; // restart animation
    ui.noteName.classList.add('is-entering');
  }
}

function setStatus(text, tone = '') {
  ui.status.textContent = text;
  ui.status.className = 'prompt__status' + (tone ? ` is-${tone}` : '');
}

function setTip(text) {
  ui.tip.textContent = text;
  ui.tip.hidden = !text;
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
  ui.hintBtn.disabled = !(session.state === 'listening' && session.hintStage < session.hintStages);
  ui.earReplay.disabled = !canHearAgain();
}

// ---------- by ear: say the note and play it ----------
function canHearAgain() {
  return settings.playNote && session.state === 'listening' && session.mode === 'note';
}
function hearAgain() {
  if (!canHearAgain()) return;
  announce(spokenName(session.note.name), session.note.midi, { speak: true });
}
ui.earToggle.addEventListener('click', () => {
  commit({ playNote: !settings.playNote });
  syncButtons();
  hearAgain(); // switching it on mid-question plays the current note straight away
});
ui.earReplay.addEventListener('click', hearAgain);
ui.namesToggle.addEventListener('click', () => commit({ showStringNames: !settings.showStringNames }));
ui.shapesToggle.addEventListener('click', () => commit({ showShapes: !settings.showShapes }));
ui.cueToggle.addEventListener('click', () => commit({ playNotes: !settings.playNotes }));

// ---------- level path ----------
const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

const tiles = LEVELS.map((l) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'path__tile'; b.dataset.id = l.id;
  b.innerHTML = `<span class="path__num">${l.id}</span><span class="path__names">${l.short}</span><span class="path__mark"></span>`;
  b.title = `Level ${l.id} · ${levelTitle(l)}`;
  b.addEventListener('click', () => {
    if (l.id === path.current || !path.select(l.id)) return;
    boss = null; notice = null;
    renderPath();
    if (session.state !== 'idle' && session.mode === 'note') session.skip();
  });
  li.appendChild(b);
  ui.pathMap.appendChild(li);
  return b;
});

function popTile(id) {
  const t = tiles[id - 1];
  t.classList.remove('is-pop'); void t.offsetWidth; t.classList.add('is-pop');
}

function renderPath() {
  const show = isNoteMode() && settings.noteMode === 'path';
  ui.path.hidden = !show;
  if (!show) return;
  const range = fretRange();
  tiles.forEach((b, i) => {
    const id = i + 1, open = path.isUnlocked(id), done = path.isDone(id), now = id === path.current;
    b.disabled = !open;
    b.classList.toggle('is-locked', !open);
    b.classList.toggle('is-done', done);
    b.classList.toggle('is-current', now);
    if (now) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.querySelector('.path__mark').innerHTML = !open ? LOCK_SVG : done ? stars(path.stars(id)) : '';
    b.setAttribute('aria-label', `Level ${id}, ${levelTitle(levelById(id))}${!open ? ', locked' : done ? `, done, ${path.stars(id)} of 3 stars` : now ? ', current' : ''}`);
  });
  const lvl = path.currentLevel, pr = path.progress(lvl.id, range);
  const running = boss && boss.state === 'running';
  ui.pathTitle.textContent = `Level ${lvl.id} · ${levelTitle(lvl)}`;
  ui.pathGoal.textContent = pr.spotsTotal === 0
    ? 'No spot of this level falls inside your fret range. Widen the frets in Settings.'
    : pr.bossUnlocked ? 'Boss round open: find every note on every string.'
    : `Unlock the boss: last ${WINDOW} answers ${Math.round(FIRST_TRY_MIN * 100)}%+ first try, ${AVG_MS_MAX / 1000} s or less on average, every note on every string.`;
  const box = (label, value, goal, met) =>
    `<div class="pstat${met ? ' is-met' : ''}"><span class="pstat__label">${label}</span><span class="pstat__value">${value}${met ? ' ✓' : ''}</span><span class="pstat__goal">${goal}</span></div>`;
  ui.pathStats.innerHTML =
    box('Answered', `${pr.answered}/${WINDOW}`, 'last 20', pr.met.count)
    + box('First try', pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`, `${Math.round(FIRST_TRY_MIN * 100)}% or more`, pr.met.firstTry)
    + box('Avg time', pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`, `${AVG_MS_MAX / 1000} s or less`, pr.met.time)
    + box('Spots', `${pr.spots}/${pr.spotsTotal}`, 'every string', pr.met.spots);
  ui.bossBtn.disabled = !pr.bossUnlocked || !!running;
  ui.bossBtn.classList.toggle('is-ready', pr.bossUnlocked && !running);
  ui.bossBtn.innerHTML = running ? `Boss ${boss.index}/${boss.items.length}` : `${pr.bossUnlocked ? '' : `${LOCK_SVG} `}${pr.done ? 'Boss again' : 'Boss round'}`;
  ui.bossNote.textContent = running ? 'A wrong note or a skip ends it.'
    : pr.bossUnlocked ? `${pr.done ? `Best ${stars(pr.stars)} · ` : ''}★ pass · ★★ avg ${STAR2_MS / 1000} s · ★★★ avg ${STAR3_MS / 1000} s`
    : '';
}

// A correct note in note mode: boss progress, or the path's scoring window. Returns text for the status line.
function onNoteCorrect(p) {
  let extra = '';
  if (boss && boss.state === 'running') {
    if (boss.correct(p.ms) === 'passed') {
      const lvl = levelById(boss.levelId), r = path.completeBoss(lvl.id, boss.avgMs), next = r.next && levelById(r.next);
      boss = null;
      notice = { text: next ? `Level ${next.id} unlocked: ${levelTitle(next)}` : 'Path complete: every level done', tone: 'ok' };
      popTile(lvl.id);
      extra = `Level ${lvl.id} complete ${'★'.repeat(r.stars)}`;
    } else extra = `Boss ${boss.index} of ${boss.items.length}`;
  } else if (settings.noteMode === 'path') {
    const pc = pitchClass(noteAt(p.target.string, p.target.fret).midi);
    const r = path.record(path.current, { pc, string: p.target.string, firstTry: p.firstTry && !p.hinted, ms: p.ms }, fretRange());
    if (r.bossUnlocked) { extra = 'Boss round unlocked!'; popTile(path.current); }
  }
  renderPath();
  return extra;
}

function failBoss(reason, text) {
  boss = null;
  if (text) notice = { text, tone: 'bad' };
  ui.stringName.textContent = `String ${STRINGS[session.target.string].number}`;
  renderPath();
}

async function startBoss() {
  const lvl = path.currentLevel;
  if (!isNoteMode() || !path.progress(lvl.id, fretRange()).bossUnlocked) return;
  const b = createBoss(lvl, fretRange());
  if (b.state !== 'running') { setStatus('No spot of this level falls inside your fret range.', 'bad'); return; }
  boss = b; notice = null;
  renderPath();
  if (session.state === 'idle') await toggleSession();
  else session.skip();
}
ui.bossBtn.addEventListener('click', startBoss);

ui.noteModePicker.querySelectorAll('.chip').forEach((c) => c.addEventListener('click', () => {
  if (settings.noteMode === c.dataset.id) return;
  boss = null; notice = null;
  commit({ noteMode: c.dataset.id });
  if (session.state !== 'idle' && session.mode === 'note') session.skip();
}));

$('path-reset').addEventListener('click', () => {
  if (!confirm('Reset your level path? Every level goes back to locked except level 1.')) return;
  path.reset(); boss = null; notice = null;
  renderPath();
  if (session.state !== 'idle' && session.mode === 'note') session.skip();
});

// A skip is a "couldn't find it" for the heatmap.
function skipNow() {
  if (session.state === 'listening') {
    if (session.mode === 'intervals') history.recordInterval(session.target.interval, { skipped: true });
    else if (session.mode === 'arpeggios') history.recordChord(session.target.chord, { skipped: true });
    else if (session.mode === 'triads') history.recordTriad(session.target.triad, { skipped: true });
    else {
      history.recordPosition(session.target, { skipped: true });
      weigher = null;
      if (boss && boss.state === 'running') failBoss('skipped', 'Boss round over: skipping ends it. Try again anytime');
    }
    renderHeatPanel();
  }
  session.skip();
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
  const prog = session.hintProgress();
  if (prog) {
    setRing(prog.fraction);
    ui.ringLabel.textContent = `${Math.max(0, Math.ceil(prog.remainingMs / 1000))}s`;
  } else if (session.state === 'listening' && settings.hintDelayMs == null) {
    setRing(0);
    ui.ringLabel.textContent = '∞';
  } else {
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

// ---------- heatmap ----------
const heatBoard = createFretboard($('heat-board'));

function heatItems() {
  const known = new Map(history.positions().map(p => [`${p.string}:${p.fret}`, p]));
  const items = [];
  for (const string of settings.strings) {
    for (let fret = settings.fretFrom; fret <= settings.fretTo; fret++) {
      const name = noteAt(string, fret).name;
      if (settings.naturalsOnly && name.includes('♯')) continue;
      const p = known.get(`${string}:${fret}`);
      known.delete(`${string}:${fret}`);
      items.push(p ? {
        string, fret, text: name, level: p.level, alpha: 0.45 + 0.55 * p.confidence,
        title: `${name} · string ${STRINGS[string].number} fret ${fret} · ${p.n} ${p.n === 1 ? 'try' : 'tries'} · ${Math.round(p.cleanRate * 100)}% clean · ${p.avgMs != null ? (p.avgMs / 1000).toFixed(1) + ' s' : 'never found'}`,
      } : { string, fret, text: name, level: null, title: `${name} · string ${STRINGS[string].number} fret ${fret} · not practised yet` });
    }
  }
  // Practised positions outside the current range / note set still count.
  for (const p of known.values()) {
    const name = noteAt(p.string, p.fret).name;
    items.push({
      string: p.string, fret: p.fret, text: name, level: p.level, alpha: 0.45 + 0.55 * p.confidence,
      title: `${name} · string ${STRINGS[p.string].number} fret ${p.fret} · ${p.n} ${p.n === 1 ? 'try' : 'tries'} · ${Math.round(p.cleanRate * 100)}% clean · ${p.avgMs != null ? (p.avgMs / 1000).toFixed(1) + ' s' : 'never found'}`,
    });
  }
  return items;
}

function describe(p, label) {
  const time = p.avgMs != null ? `${(p.avgMs / 1000).toFixed(1)} s` : 'not found';
  return `<li><span class="heat__dot heat__dot--l${p.level}"></span><strong>${label}</strong><span class="heat__meta">${Math.round(p.cleanRate * 100)}% clean · ${time} · ${p.n}×</span></li>`;
}

function renderHeatPanel() {
  heatBoard.setRange(settings.fretFrom, settings.fretTo);
  heatBoard.showHeat(heatItems());
  const positions = history.positions();
  const intervals = history.intervals();
  ui.heatReset.hidden = history.empty;
  const label = (p) => `${noteAt(p.string, p.fret).name} · string ${STRINGS[p.string].number} fret ${p.fret}`;
  const weak = positions.filter(p => p.level <= 2).slice(0, 6);
  const strong = positions.filter(p => p.level >= 4).slice(-6).reverse();
  let html = '';
  if (history.empty) {
    html = '<p class="note">Nothing recorded yet. Every answer you give is remembered here, across sessions.</p>';
  } else {
    if (positions.length) {
      html += `<div class="heat__col"><h3>Needs work</h3><ul>${weak.map(p => describe(p, label(p))).join('') || '<li class="note">Nothing weak — nice.</li>'}</ul></div>`;
      html += `<div class="heat__col"><h3>Solid</h3><ul>${strong.map(p => describe(p, label(p))).join('') || '<li class="note">Keep going.</li>'}</ul></div>`;
    }
    if (intervals.length) {
      html += `<div class="heat__col"><h3>Intervals</h3><ul>${intervals.map(p => { const iv = intervalById(p.id); return describe(p, iv ? `${iv.label} ${iv.arrow}` : p.id); }).join('')}</ul></div>`;
    }
    const chords = history.chords();
    if (chords.length) {
      html += `<div class="heat__col"><h3>Arpeggios</h3><ul>${chords.map(p => { const c = chordById(p.id); return describe(p, c ? c.label : p.id); }).join('')}</ul></div>`;
    }
    const triads = history.triads();
    if (triads.length) {
      html += `<div class="heat__col"><h3>Triads</h3><ul>${triads.map(p => { const t = triadById(p.id); return describe(p, t ? t.label : p.id); }).join('')}</ul></div>`;
    }
  }
  ui.heatBody.innerHTML = html;
}

ui.heatReset.addEventListener('click', () => {
  if (!confirm('Forget all recorded practice history?')) return;
  history.reset();
  renderHeatPanel();
  syncButtons();
});

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
ui.skipBtn.addEventListener('click', skipNow);
ui.hintBtn.addEventListener('click', () => { session.showHint(); syncButtons(); });

// mode switcher
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => {
  boss = null; notice = null;
  commit({ mode: r.value });
  if (session.state !== 'idle') session.skip(); // re-pick in the new mode right away
}));

// interval picker (Random + one chip per interval)
// custom note mode: which notes and strings are asked (at least one of each stays on)
const ACCIDENTALS = [1, 3, 6, 8, 10];
const hasAccidentals = (notes) => notes.some(n => ACCIDENTALS.includes(n));
function commitNotes(notes) {
  commit({ notes, naturalsOnly: !hasAccidentals(notes) });
  if (session.state !== 'idle' && session.mode === 'note') session.skip();
}
for (const [pc, label] of [[0, 'C'], [2, 'D'], [4, 'E'], [5, 'F'], [7, 'G'], [9, 'A'], [11, 'B']]) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip chip--key'; b.dataset.pc = pc; b.textContent = label;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = new Set(settings.notes);
    on.has(pc) ? on.delete(pc) : on.add(pc);
    if (on.size === 0) return;
    commitNotes([...on].sort((a, c) => a - c));
  });
  ui.customNotes.appendChild(b);
}
{
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip chip--key'; b.id = 'custom-accidentals'; b.textContent = '♯/♭';
  b.title = 'The five sharp / flat notes: C♯ D♯ F♯ G♯ A♯';
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = new Set(settings.notes);
    if (hasAccidentals(settings.notes)) ACCIDENTALS.forEach(n => on.delete(n)); else ACCIDENTALS.forEach(n => on.add(n));
    if (on.size === 0) return;
    commitNotes([...on].sort((a, c) => a - c));
  });
  ui.customNotes.appendChild(b);
}
for (const s of [...STRINGS].reverse()) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip chip--key'; b.dataset.index = s.index; b.textContent = s.number;
  b.setAttribute('aria-label', `String ${s.number} (${s.label})`);
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = new Set(settings.strings);
    on.has(s.index) ? on.delete(s.index) : on.add(s.index);
    if (on.size === 0) return;
    commit({ strings: [...on].sort() });
    if (session.state !== 'idle' && session.mode === 'note') session.skip();
  });
  ui.customStrings.appendChild(b);
}

for (const opt of [{ id: 'random', label: 'Random' }, ...INTERVALS.map(iv => ({ id: iv.id, label: `${iv.label} ${iv.arrow}` }))]) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = opt.id; b.textContent = opt.label;
  b.addEventListener('click', () => {
    commit({ intervalPick: opt.id });
    if (session.state !== 'idle' && session.mode === 'intervals') session.skip();
  });
  ui.picker.appendChild(b);
}

for (const opt of [{ id: 'random', label: 'Random' }, ...CHORDS.map(c => ({ id: c.id, label: c.label }))]) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = opt.id; b.textContent = opt.label;
  b.addEventListener('click', () => {
    commit({ chordPick: opt.id });
    if (session.state !== 'idle' && session.mode === 'arpeggios') session.skip();
  });
  ui.chordPicker.appendChild(b);
}

for (const opt of TRIADS.map(t => ({ id: t.id, label: t.label }))) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = opt.id; b.textContent = opt.label;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = new Set(selectedTriads(settings.triadPick));
    on.has(opt.id) ? on.delete(opt.id) : on.add(opt.id);
    if (on.size === 0) return; // keep at least one type
    commit({ triadPick: TRIADS.map(t => t.id).filter(id => on.has(id)) });
    if (session.state !== 'idle' && session.mode === 'triads') session.skip();
  });
  ui.triadPicker.appendChild(b);
}
for (const opt of [{ id: 'random', label: 'Any inversion' }, { id: 0, label: 'Root position' }, { id: 1, label: '1st inversion' }, { id: 2, label: '2nd inversion' }, { id: 'ordered', label: 'Root → 1st → 2nd' }, { id: 'cycle', label: 'Climb up the neck' }]) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = String(opt.id); b.textContent = opt.label;
  b.addEventListener('click', () => {
    commit({ triadInversion: opt.id });
    if (session.state !== 'idle' && session.mode === 'triads') session.skip();
  });
  ui.inversionPicker.appendChild(b);
}
for (const g of STRING_GROUPS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'chip'; b.dataset.id = g.id; b.textContent = `strings ${g.label}`;
  b.setAttribute('aria-pressed', 'false');
  b.addEventListener('click', () => {
    const on = new Set(settings.triadGroups);
    on.has(g.id) ? on.delete(g.id) : on.add(g.id);
    if (on.size === 0) return; // keep at least one group
    commit({ triadGroups: STRING_GROUPS.map(x => x.id).filter(id => on.has(id)) });
    if (session.state !== 'idle' && session.mode === 'triads') session.skip();
  });
  ui.groupPicker.appendChild(b);
}

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); toggleSession(); }
  else if (e.key === 'n' || e.key === 'N') skipNow();
  else if (e.key === 'h' || e.key === 'H') { session.showHint(); syncButtons(); }
  else if (e.key === 'r' || e.key === 'R') hearAgain();
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
  r.addEventListener('change', () => {
    const naturalsOnly = r.value === 'naturals';
    const kept = settings.notes.filter(n => !ACCIDENTALS.includes(n));
    commit({ naturalsOnly, notes: naturalsOnly ? (kept.length ? kept : [0, 2, 4, 5, 7, 9, 11]) : [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] });
  }));

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
$('play-note').addEventListener('change', (e) => { commit({ playNote: e.target.checked }); syncButtons(); });
$('sound-test').addEventListener('click', () => sound.play(48));

// intervals pool for Random
const intervalList = $('interval-list');
for (const iv of INTERVALS) {
  const label = document.createElement('label');
  label.className = 'check';
  label.innerHTML = `<input type="checkbox" value="${iv.id}"><span>${iv.label} ${iv.arrow}</span><small>${iv.semitones > 0 ? '+' : ''}${iv.semitones} semitones</small>`;
  label.querySelector('input').addEventListener('change', () => {
    const on = new Set(settings.intervals);
    label.querySelector('input').checked ? on.add(iv.id) : on.delete(iv.id);
    commit({ intervals: INTERVALS.map(i => i.id).filter(id => on.has(id)) });
  });
  intervalList.appendChild(label);
}
const chordList = $('chord-list');
for (const c of CHORDS) {
  const label = document.createElement('label');
  label.className = 'check';
  label.innerHTML = `<input type="checkbox" value="${c.id}"><span>${c.label}</span><small>${c.tones.map(t => DEGREE_LABELS[t]).join(' ')}</small>`;
  label.querySelector('input').addEventListener('change', () => {
    const on = new Set(settings.chords);
    label.querySelector('input').checked ? on.add(c.id) : on.delete(c.id);
    commit({ chords: CHORDS.map(i => i.id).filter(id => on.has(id)) });
  });
  chordList.appendChild(label);
}
const tipList = $('tip-list');
for (const iv of INTERVALS) {
  const li = document.createElement('li');
  li.innerHTML = `<strong>${iv.label} ${iv.arrow}</strong><ul>${iv.tips.map(t => `<li>${t}</li>`).join('')}</ul>`;
  tipList.appendChild(li);
}

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

const TICKER = {
  note: ['Press Start or Space and allow the mic', 'Play the note shown, on the string shown', 'Path: clear each level’s boss round to unlock the next', 'Custom: pick your own notes and strings', 'Stuck? H shows where it is, N skips', 'Turn on Say + play the note to find it by ear, R plays it again', 'Your fretboard, over time shows which notes need work'],
  intervals: ['Play the root, then the interval above it', 'Practise one interval, or let it pick at random', 'H shows a tip first, then where both notes are', 'N skips to the next one'],
  arpeggios: ['Play the chord one note per string, from the low string up', 'Pick a chord type, or let it pick at random', 'Each note counts as soon as you hit it', 'H shows a tip, then where the next note is', 'N skips to the next chord'],
  triads: ['Play the three notes of the triad on the string group shown', 'Choose the triad types, the inversion and which string groups to use', 'H shows a tip, then where the next note is', 'N skips to the next triad'],
};

function setTicker(mode) {
  const text = TICKER[mode].join(' ★ ') + ' ★ ';
  document.querySelectorAll('#ticker > span').forEach((s) => { s.textContent = text; });
}

// ---------- triad shapes cheat sheet ----------
// Movable shapes, degrees only: nothing here shows the current question's frets.
function renderShapes() {
  ui.promptTools.hidden = settings.mode !== 'triads';
  const show = settings.mode === 'triads' && settings.showShapes;
  ui.shapes.hidden = !show;
  ui.prompt.classList.toggle('has-shapes', show);
  if (!show) return;
  const types = selectedTriads(settings.triadPick);
  if (!types.includes(shapesType)) shapesType = types.includes(shapesNow && shapesNow.triad) ? shapesNow.triad : types[0];
  const focused = ui.shapes.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  ui.shapesTabs.replaceChildren(...types.map((id) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip chip--small'; b.dataset.id = id; b.textContent = triadById(id).label;
    b.setAttribute('aria-pressed', id === shapesType);
    b.addEventListener('click', () => { shapesType = id; renderShapes(); });
    return b;
  }));
  const on = new Set(settings.triadGroups);
  ui.shapesList.innerHTML = STRING_GROUPS.filter((g) => on.has(g.id)).map((g) => {
    const now = shapesNow && shapesNow.group === g.id;
    return `<figure class="shapes__item${now ? ' is-now' : ''}">
      <figcaption><span>Strings ${g.label}</span>${now ? '<b>Now</b>' : ''}</figcaption>${shapeSvg(shapesType, g.id)}</figure>`;
  }).join('');
  if (focused) ui.shapesTabs.querySelector(`[data-id="${focused}"]`)?.focus();
}

function applySettingsToUI() {
  const mode = ['intervals', 'arpeggios', 'triads'].includes(settings.mode) ? settings.mode : 'note';
  setTicker(mode);
  ui.triadPicker.hidden = mode !== 'triads';
  ui.triadPicker.querySelectorAll('.chip[data-id]').forEach((c) => { const on = selectedTriads(settings.triadPick).includes(c.dataset.id); c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', on); });
  ui.shapesToggle.setAttribute('aria-pressed', settings.showShapes);
  ui.cuePicker.hidden = mode === 'note';
  ui.cueToggle.setAttribute('aria-pressed', settings.playNotes);
  renderShapes();
  ui.inversionPicker.hidden = mode !== 'triads';
  ui.inversionPicker.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.id === String(settings.triadInversion ?? 'random')));
  ui.groupPicker.hidden = mode !== 'triads';
  ui.groupPicker.querySelectorAll('.chip').forEach((c) => { const on = settings.triadGroups.includes(c.dataset.id); c.classList.toggle('is-active', on); c.setAttribute('aria-pressed', on); });
  document.querySelector(`input[name="mode"][value="${mode}"]`).checked = true;
  ui.picker.hidden = mode !== 'intervals';
  ui.picker.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.id === (settings.intervalPick || 'random')));
  ui.chordPicker.hidden = mode !== 'arpeggios';
  ui.chordPicker.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c.dataset.id === (settings.chordPick || 'random')));
  chordList.querySelectorAll('input').forEach((i) => { i.checked = settings.chords.includes(i.value); });
  $('play-note').checked = settings.playNote;
  ui.earPicker.hidden = mode !== 'note';
  ui.noteModePicker.hidden = mode !== 'note';
  ui.noteModePicker.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', c.dataset.id === settings.noteMode));
  ui.customPicker.hidden = mode !== 'note' || settings.noteMode !== 'custom';
  renderPath();
  ui.customNotes.querySelectorAll('.chip[data-pc]').forEach((c) => c.setAttribute('aria-pressed', settings.notes.includes(+c.dataset.pc)));
  $('custom-accidentals').setAttribute('aria-pressed', hasAccidentals(settings.notes));
  ui.customStrings.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', settings.strings.includes(+c.dataset.index)));
  ui.earToggle.setAttribute('aria-pressed', settings.playNote);
  ui.namesToggle.setAttribute('aria-pressed', settings.showStringNames);
  fretboard.setStringNames(settings.showStringNames);
  intervalList.querySelectorAll('input').forEach((i) => { i.checked = settings.intervals.includes(i.value); });

  f.pills.querySelectorAll('.pill').forEach((b) =>
    b.setAttribute('aria-pressed', settings.strings.includes(+b.dataset.index)));
  f.fretFrom.value = settings.fretFrom;
  f.fretTo.value = settings.fretTo;
  f.presets.querySelectorAll('.chip').forEach((c) =>
    c.classList.toggle('is-active', +c.dataset.from === settings.fretFrom && +c.dataset.to === settings.fretTo));
  fretboard.setRange(settings.fretFrom, settings.fretTo);
  if (typeof renderHeatPanel === 'function') renderHeatPanel();

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
renderHeatPanel();

// Expose for poking around in devtools.
window.practice = { session, pitch, voice, sound, fretboard, history, path, startBoss, renderHeatPanel, get boss() { return boss; }, get settings() { return settings; }, DEFAULTS };
