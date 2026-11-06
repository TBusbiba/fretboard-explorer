import { STRINGS, FRET_COUNT, INTERVALS, CHORDS, DEGREE_LABELS, NOTE_NAMES, intervalById, chordById, triadById, spokenName, tipFor, noteAt, midiToNoteName, frequencyToMidi, pickTarget, pitchClass } from './notes.js';
import { createFretboard } from './fretboard.js';
import { createPitchDetector } from './pitch.js';
import { createVoice, CLIP_VOICE, usesClips } from './voice.js';
import { createSound } from './sound.js';
import { createMicGate } from './mic-gate.js';
import { createSession } from './session.js';
import { pickChain, createChain, createChainSchedule, CHAIN_BONUS } from './chain.js';
import { createCombo, createCustomBest, speedLeft, BADGE_FROM } from './combo.js';
import { createHistory } from './history.js';
import { createBossFight, LIVES as BOSS_LIVES, COUNTDOWN_MS } from './boss.js';
import { LEVELS, WINDOW, FIRST_TRY_MIN, AVG_MS_MAX, STAR2_MS, STAR3_MS, levelById, levelTitle, createPath, createSpotBag, levelRange, positionWeigher, bossFretLabel, stringPrompt, NAMES_FROM_LEVEL } from './path.js';
import { landmarkHint } from './landmarks.js';
import { levelTip } from './tips.js';
import { createTriadsUI } from './triads-ui.js';
import { createScalesUI } from './scales-ui.js';
import * as hud from './hud.js';
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
const BUILD = '39';
if (document.documentElement.dataset.build !== BUILD) {
  const el = $('stale');
  if (el) el.hidden = false;
  else document.body.insertAdjacentHTML('afterbegin', '<div class="stale">This page is out of date — press Cmd+Shift+R to reload it.</div>');
  throw new Error(`Fretboard Practice: index.html build ${document.documentElement.dataset.build} ≠ app.js build ${BUILD}`);
}
const RING_LEN = 113.1;
const WRONG_MARKER_MS = 1200;

let settings = loadSettings();
if (['intervals', 'arpeggios'].includes(settings.mode)) settings = { ...settings, mode: 'note' };   // tabs not finished yet: greyed out
// Tab links from other pages (Chords) say which mode to open: ?mode= overrides and saves the setting, then leaves the URL.
{
  const url = new URL(location.href), asked = url.searchParams.get('mode');
  if (asked !== null) {
    if (['note', 'scales', 'triads'].includes(asked)) { settings = { ...settings, mode: asked }; saveSettings(settings); }
    url.searchParams.delete('mode');
    window.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }
}
window.addEventListener('pageshow', (e) => { if (e.persisted) location.reload(); });   // back/forward cache: never show a stale mode

// What the session actually drills: a single picked interval, or the random pool.
function sessionSettings() {
  const pick = settings.intervalPick, cpick = settings.chordPick;
  return {
    ...settings,
    // Path: the level's notes on all six strings, weighted to what is missed or slow.
    ...(isNoteMode() && settings.noteMode === 'path' ? { notes: path.currentLevel.notes, strings: [0, 1, 2, 3, 4, 5], weigh: weighPosition } : {}),
    intervals: pick && pick !== 'random' ? [pick] : settings.intervals,
    chords: cpick && cpick !== 'random' ? [cpick] : settings.chords,
  };
}

// ---------- modules ----------
const fretboard = createFretboard($('fretboard'));
const history = createHistory();
const path = createPath();
const customBest = createCustomBest();
const combo = createCombo();
const isNoteMode = () => !['intervals', 'arpeggios', 'triads', 'scales'].includes(settings.mode);
const sayNames = () => (settings.noteMode === 'path' ? path.current >= NAMES_FROM_LEVEL : settings.sayStringNames);
const fretRange = () => ({ from: settings.fretFrom, to: settings.fretTo });
// The frets actually drilled: in the Path, the setting kept inside 0-12.
const boardRange = () => (settings.mode === 'scales' ? { from: 0, to: FRET_COUNT - 1 } : settings.mode === 'triads' ? { from: 0, to: 12 } : isNoteMode() && settings.noteMode === 'path' ? levelRange(path.currentLevel, fretRange()) : fretRange());
function syncBoardRange() { const r = boardRange(); fretboard.setRange(r.from, r.to); }
let weigher = null;   // rebuilt from the history after every answer
function weighPosition(string, fret) { return (weigher ||= positionWeigher(history.positions()))(string, fret); }
let boss = null;      // the boss round in progress, else null
const spotBag = createSpotBag();
const chainSchedule = createChainSchedule();
let chain = null;     // the note chain in progress (Path only), else null
let bossFinale = null; // set when a boss round is cleared: the board lights up once the session stops
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
// `holdClock` (note prompts): the answer clock stays at zero until the prompt phrase itself starts playing.
const CLOCK_HOLD_MAX_MS = 4500;      // never freeze the clock longer than this once the voice has gone quiet
const CLOCK_HOLD_SPEECH_MS = 20000;  // ...or longer than this even while it is still talking (long chain/boss intros)
async function announce(text, playMidi, { speak = settings.voice, holdClock = false } = {}) {
  const token = ++promptToken;
  let release = () => {};
  const held = holdClock && speak && !!text;
  if (held) {
    session.holdClock();
    let done = false;
    const t0 = performance.now();
    let safety = 0;
    const guard = () => (voice.speaking && performance.now() - t0 < CLOCK_HOLD_SPEECH_MS ? (safety = setTimeout(guard, 1000)) : release());
    safety = setTimeout(guard, CLOCK_HOLD_MAX_MS);
    release = () => { if (done) return; done = true; clearTimeout(safety); if (token === promptToken) session.restartClock(); };
  }
  if (speak && text) {
    try { await voice.speak(text, { ...voiceOpts(), wait: true, onPromptStart: held ? release : null }); }
    finally { release(); }
  }
  if (token !== promptToken) return;
  if (playMidi != null) await sound.play(playMidi);
}

const DEBUG = new URLSearchParams(location.search).has('debug');
const debugPanel = DEBUG ? createDebugPanel() : null;

function createDebugPanel() {
  const el = document.createElement('pre');
  el.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:9999;margin:0;padding:6px 8px;max-width:92vw;overflow:auto;font:11px/1.3 var(--nb-mono);background:var(--nb-card);color:var(--nb-ink);border:var(--nb-border-sm);box-shadow:var(--nb-shadow-sm);pointer-events:none';
  document.body.append(el);
  const rows = [];
  return {
    add(d) {
      const acc = d.accepted;
      const result = acc.includes(d.midi) ? (d.corrected ? 'corrected-down' : 'accepted')
        : acc.some(m => m + 12 === d.midi) ? 'octave too high'
        : acc.some(m => m - 12 === d.midi) ? 'octave too low' : 'wrong';
      const t = new Date(d.time).toTimeString().slice(0, 8);
      rows.push(`${t} ${d.rawHz.toFixed(1)}Hz ${midiToNoteName(frequencyToMidi(d.rawHz))}→${midiToNoteName(d.midi)}${Math.floor(d.midi / 12) - 1} cl${d.clarity.toFixed(2)} r${d.ratio.toFixed(2)} exp ${[...new Set(acc)].map(midiToNoteName).join('/') || '-'} ${result}`);
      if (rows.length > 8) rows.shift();
      el.textContent = rows.join('\n');
    },
  };
}

const pitch = createPitchDetector({
  getSettings: () => settings,
  getExpected: () => (scales.running ? scales.expected() : session.state === 'listening' && session.note ? session.note.midi : null),
  getAccepted: () => (scales.running ? scales.accepted() : session.acceptedMidis()),
  onDebug: DEBUG ? (d) => debugPanel.add(d) : null,
  isMuted: (now) => micGate.isMuted(now),
  onNote: (midi) => { if (!micGate.isMuted()) session.noteDetected(midi); },
  onStable: (midi, info) => {
    if (micGate.isMuted()) return;
    if (scales.running) scales.feed(midi, info);
    else if (session.matcher) session.stableDetected(midi, info);   // Triads: the only place a wrong note is counted
  },   // Scales: every steady reading, not one per note
  onLevel: updateMeter,
  onState: updateMicState,
});

const session = createSession({
  getSettings: sessionSettings,
  pickNote: (opts, previous, rng) => {
    const item = boss && boss.current();
    if (item) return { string: item.string, fret: item.fret };
    if (isNoteMode() && settings.noteMode === 'path') {
      const range = fretRange();
      if (chain && chain.levelId !== path.current) chain = null;
      if (!chain && chainSchedule.due()) {
        const have = new Set(path.progress(path.current, range).missing);
        const pick = pickChain(path.currentLevel, range, Math.random, (pc, spots) => have.has(`${pc}:${spots[0].string}`));
        if (pick) chain = createChain(pick, path.current);
      }
      if (chain) return { ...chain.current };
      return spotBag.next(path.currentLevel, range, path.progress(path.current, range).missing, weighPosition);
    }
    return pickTarget(opts, previous, rng);
  },
  // Any fret on the asked string that sounds the asked note is right, except in chains and the boss (exact spots).
  getAcceptRange: () => {
    if (!isNoteMode() || (boss && boss.state === 'running') || (chain && settings.noteMode === 'path')) return null;
    return boardRange();
  },
  onEvent: handleSessionEvent,
  pickTriad: (opts, previous, rng) => triads.pick(opts, previous, rng),
});

// ---------- elements ----------
const ui = {
  stage: $('stage'), timeVal: $('time-val'), foundBlock: $('found-block'), foundVal: $('found-val'), bossTitle: $('boss-title'), pathPop: $('path-strip'), cleanBanner: $('hud-clean'), timeBlock: $('time-block'),
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
  shapesToggle: $('shapes-toggle'), prompt: $('prompt'),
  picker: $('interval-picker'), chordPicker: $('chord-picker'), triadPicker: $('triad-picker'), groupPicker: $('group-picker'),
  combo: $('combo'), comboBadge: $('combo-badge'), comboN: $('combo-n'), comboMult: $('combo-mult'), comboScore: $('combo-score'), comboGain: $('combo-gain'), comboBest: $('combo-best'),
  tipBtn: $('tip-btn'), tipCard: $('tip-card'), tipTag: $('tip-tag'), tipHead: $('tip-head'), tipLine: $('tip-line'), tipNote: $('tip-note'), tipFig: $('tip-fig'), tipSwipe: $('tip-swipe'), tipGot: $('tip-got'),
  chainIntro: $('chain-intro'), chainKicker: $('chain-kicker'), bossPips: $('boss-pips'), bossTime: $('boss-time'), bossHp: $('boss-hp'), bossHpFill: $('boss-hp-fill'), bossHearts: $('boss-hearts'), bossCd: $('boss-cd'), bossCdFill: $('boss-cd-fill'), bossCdVal: $('boss-cd-val'),
  bossEnd: $('boss-end'), bossEndKicker: $('boss-end-kicker'), bossEndStars: $('boss-end-stars'), bossEndStats: $('boss-end-stats'), bossEndNext: $('boss-end-next'), bossEndGo: $('boss-end-go'), chainBig: $('chain-big'), chainStart: $('chain-start'),
  comboBar: $('combo-bar'), comboFill: $('combo-fill'), comboShout: $('combo-shout'), comboFlag: $('combo-flag'),
  heatReset: $('heat-reset'), heatBody: $('heat-body'),
};

// ---------- session events ----------
let wrongTimers = [];

function handleSessionEvent(type, p) {
  if (triads.onEvent(type, p)) { syncButtons(); return; }   // Triads: practice/js/triads-ui.js
  switch (type) {
    case 'target': {
      wrongTimers.forEach(clearTimeout); wrongTimers = [];
      if (p.mode !== 'note') chain = null;
      hideChainIntro(); hideBossEnd();
      renderCombo();
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
      } else {
        fretboard.highlightString(p.target.string);
        scrollBoardTo(p.target.fret);
        const inBoss = boss && boss.state === 'running';
        const inChain = !inBoss && chain && chain.current && chain.current.string === p.target.string && chain.current.fret === p.target.fret;
        const sp = stringPrompt(p.target.string, spokenName(p.note.name), { names: sayNames(), short: inChain && !!chain.previous });
        const prefix = inChain ? `Chain ${chain.index + 1} of ${chain.spots.length} · ` : '';
        let spokenIntro = '';
        if (inBoss) {
          const item = boss.current();
          const bossLabel = bossFretLabel(item.string, item.fret, boss.range);
          for (const f of boss.found) fretboard.showNote(f.string, f.fret, 'correct', noteLetter(f.pc), true);
          ui.foundVal.textContent = `${item.n - 1}/${item.of}`;
          setPrompt(`${stringPrompt(item.string, '', { names: sayNames() }).label}${bossLabel ? ` · ${bossLabel}` : ''}`, p.note.name, 'listening');
          if (item.n === 1 && (item.phase === 'rapid' || boss.index === 0)) spokenIntro = `${showBossIntro(boss, item)} `;
          if (item.finish) { spokenIntro += 'Finish him! '; flash(ui.comboShout, 'Finish him!', 1500); }
        } else setPrompt(`${prefix}${sp.label}`, p.note.name, 'listening');
        if (notice) { setStatus(notice.text, notice.tone); notice = null; }
        else setStatus(inBoss ? (boss.current().phase === 'rapid' ? `Rapid fire · ${boss.current().n - 1} of ${boss.current().of} done` : `Find every ${p.note.name} · ${boss.current().n - 1} of ${boss.current().of} found`) : 'Listening…');
        if (inChain) {
          const prev = chain.previous;
          if (prev) {
            fretboard.showNote(prev.string, prev.fret, 'root', p.note.name);
            fretboard.showArrow(prev, p.target);
            setStatus(`${chain.hint} →`, 'chain');
          } else spokenIntro = `${showChainIntro(chain, p.note.name)} `;
        }
        announce(`${spokenIntro}${sp.spoken}`, settings.playNote ? p.note.midi : null,
          { speak: settings.voice || settings.playNote, holdClock: true });
      }
      break;
    }
    case 'step': {
      const done = session.steps[p.step - 1];
      if (session.mode === 'arpeggios') {
        fretboard.showNote(done.string, done.fret, 'correct', DEGREE_LABELS[done.degree] || done.name);
        const next = session.note;
        setStatus(`${p.step} of ${p.total} ✓ — next: ${DEGREE_LABELS[next.degree] || next.name} (${next.name}) on string ${STRINGS[next.string].number}`, 'ok');
      } else {
        const { root } = session.target, iv = session.interval;
        fretboard.showNote(root.string, root.fret, 'correct', session.rootNote.name);
        setStatus(`Root ✓ — now the ${iv.label} ${iv.arrow}`, 'ok');
        if (settings.voice && settings.speakFeedback) voice.speak('Good', voiceOpts());
      }
      break;
    }
    case 'hint':
      if (comboActive()) comboMiss();
      if (chain && session.mode === 'note') chain.miss();
      if (session.mode === 'arpeggios') {
        if (p.stage === 1) {
          setTip(session.chord.tip);
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
        showLandmarkHint(p.target);
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
      } else {
        const at = p.played || p.target;
        fretboard.showNote(at.string, at.fret, 'correct', session.note.name);
        history.recordPosition(at, result);
        weigher = null;
      }
      ui.noteName.dataset.state = 'correct';
      if (session.mode === 'note' && p.firstTry && !p.hinted) fretboard.bling((p.played || p.target).string, (p.played || p.target).fret);
      const extra = session.mode === 'note' ? onNoteCorrect(p) : '';
      if (comboActive() && !bossFinale && p.firstTry && !p.hinted) comboHit(p.ms);
      if (chain && session.mode === 'note' && !boss) onChainCorrect(p);
      setStatus(`Correct · ${(p.ms / 1000).toFixed(1)} s${extra ? ` · ${extra}` : ''}`, 'ok');
      if (settings.voice && settings.speakFeedback) speakCorrect();
      updateStats();
      renderHeatPanel();
      break;
    }
    case 'wrong': {
      // Only mark positions inside the practised range; an octave-off note is
      // explained in words instead of pointing at a fret you aren't studying.
      if (p.fret >= boardRange().from && p.fret <= boardRange().to && !p.octaveOff) {
        fretboard.showNote(session.target.string, p.fret, 'wrong', p.name);
        const { string } = session.target, fret = p.fret;
        wrongTimers.push(setTimeout(() => fretboard.hideNote(string, fret), WRONG_MARKER_MS));
      }
      if (comboActive()) comboMiss();
      if (chain) chain.miss();
      ui.noteName.dataset.state = 'wrong';
      wrongTimers.push(setTimeout(() => { if (session.state === 'listening') ui.noteName.dataset.state = 'listening'; }, 600));
      const text = p.octaveOff
        ? `That's ${p.name}, but an octave too ${p.octaveOff > 0 ? 'high' : 'low'}`
        : `That was ${p.name}`;
      const spoken = p.octaveOff
        ? `octave too ${p.octaveOff > 0 ? 'high' : 'low'}`
        : `that was ${spokenName(p.name)}`;
      const inBossRun = session.mode === 'note' && boss && boss.state === 'running';
      let bossLost = false;
      if (inBossRun) {
        const r = boss.answer({ string: session.target.string, fret: -1 }, 0);
        if (r.result === 'lost') { bossLost = true; endBoss(boss); } else renderBossStrip();
      }
      if (!bossLost) setStatus(inBossRun ? `${text} · ${boss.lives} ${boss.lives === 1 ? 'heart' : 'hearts'} left` : text, 'bad');
      if (session.mode === 'note' && !inBossRun) showLandmarkHint(session.target);
      if (!bossLost && settings.voice && settings.speakFeedback) voice.speak(spoken, voiceOpts());
      updateStats();
      break;
    }
    case 'stopped':
      boss = null; notice = null;
      combo.reset(); clearComboFx(); chain = null; hideChainIntro();
      renderPath();
      promptToken++;
      voice.cancel();
      fretboard.clearNotes();
      fretboard.highlightString(null);
      setPrompt('Stopped', '', 'idle');
      setStatus(`${p.stats.total} notes · press Start to go again`);
      triads.stopped();
      if (bossFinale) { lightWholeBoard(bossFinale); setStatus(`Level ${bossFinale.level} complete ${'★'.repeat(bossFinale.stars)}`, 'ok'); bossFinale = null; }
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

// Shouts earned by this answer (streak shouts, chain complete, new best): spoken after "Correct"
// when they have a recorded clip. "Legendary ×40" and the like stay silent.
let pendingShouts = [];
function queueShout(text) {
  if (settings.voice && settings.speakFeedback && usesClips(settings.voiceName) && voice.clipsFor(text)) pendingShouts.push(text);
}
function speakCorrect() {
  const shouts = usesClips(settings.voiceName) ? pendingShouts : [];
  pendingShouts = [];
  voice.speak(['Correct!', ...shouts].join(' '), voiceOpts());
}
// The common clips, fetched on the first Start so the first prompt does not lag.
let clipsWarm = false;
function warmClips() {
  if (clipsWarm || !usesClips(settings.voiceName)) return;
  clipsWarm = true;
  voice.preload(['Correct', 'Good', 'Octave too high', 'Octave too low', 'Nice!', 'Great!', 'On fire!', 'Unstoppable!', 'Legendary!', 'Chain complete!',
    'New best streak!', 'Quick note chain round!', 'Boss round!']);
  triads.warm();
  scales.warm();
}

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
  const running = scales.active() ? scales.running : session.state !== 'idle';
  ui.startBtn.innerHTML = running ? 'Stop <kbd>Space</kbd>' : 'Start <kbd>Space</kbd>';
  ui.startBtn.classList.toggle('is-running', running);
  ui.skipBtn.disabled = !running;
  ui.hintBtn.disabled = scales.active() ? !scales.canHint() : !(session.state === 'listening' && session.hintStage < session.hintStages);
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
$('say-names-toggle').addEventListener('click', () => commit({ sayStringNames: !settings.sayStringNames }));
ui.namesToggle.addEventListener('click', () => commit({ showStringNames: !settings.showStringNames }));
ui.shapesToggle.addEventListener('click', () => commit({ showShapes: !settings.showShapes }));
$('play-notes').addEventListener('change', (e) => commit({ playNotes: e.target.checked }));

// ---------- streak, combo and points (Find the note: Path and Custom, not boss rounds) ----------
const comboActive = () => (isNoteMode() && !boss) || triads.comboOn();
let comboCtx = null;
let fxTimers = [];
const fxLater = (fn, ms) => fxTimers.push(setTimeout(fn, ms));

function clearComboFx() {
  fxTimers.forEach(clearTimeout); fxTimers = [];
  for (const el of [ui.comboShout, ui.comboFlag, ui.comboGain]) el.classList.remove('is-on');
  ui.prompt.classList.remove('is-shaking');
}

/** Switching level, Path/Custom or into a boss starts a fresh run against that context's bests. */
function syncComboContext() {
  const key = triads.comboKey() || (boss ? 'boss' : settings.noteMode === 'path' ? `path:${path.current}` : 'custom');
  if (key === comboCtx) return;
  comboCtx = key;
  chain = null;
  combo.setBest(key === 'boss' ? {} : key.startsWith('triad:') ? triads.bests() : key === 'custom' ? customBest.get() : path.bests(path.current));
  clearComboFx();
  renderCombo();
}

function saveComboBests() {
  const b = { streak: combo.bestStreak, score: combo.bestScore };
  if (triads.active()) triads.saveBests(b);
  else if (settings.noteMode === 'path') path.saveBests(path.current, b); else customBest.save(b);
}

function renderCombo() {
  const on = comboActive();
  ui.combo.hidden = !on;
  ui.comboBar.hidden = !on || session.state === 'idle';
  ui.prompt.classList.toggle('has-combo', on);
  ui.prompt.dataset.heat = on ? combo.heat : 0;
  if (!on) return;
  ui.comboN.textContent = combo.streak;
  ui.comboMult.textContent = `×${combo.multiplier}`;
  ui.comboBadge.classList.toggle('is-hot', combo.multiplier > 1);
  ui.comboScore.textContent = combo.score.toLocaleString('en-US');
  const best = [];
  if (combo.bestStreak) best.push(`Best streak ${combo.bestStreak}`);
  if (combo.bestScore) best.push(`Best ${combo.bestScore.toLocaleString('en-US')}`);
  ui.comboBest.textContent = best.join(' · ');
}

function setSpeedBar(fraction) { ui.comboFill.style.transform = `scaleX(${fraction})`; }

function flash(el, text, ms) {
  el.textContent = text;
  el.classList.remove('is-on');
  void el.offsetWidth;
  el.classList.add('is-on');
  fxLater(() => el.classList.remove('is-on'), ms);
}

function comboHit(ms) {
  const r = combo.hit(ms);
  saveComboBests();
  renderCombo();
  flash(ui.comboGain, `+${r.points}`, 1100);
  flash(ui.cleanBanner, `Clean! +${r.points} ✦`, 1000);
  const lift = r.heat * 0.07 + 1.1;
  ui.prompt.style.setProperty('--pop', lift.toFixed(2));
  if (r.shout) { flash(ui.comboShout, r.shout, 1400); queueShout(r.shout); }
  if (r.newBest) { ui.comboFlag.dataset.kind = 'best'; flash(ui.comboFlag, 'New best streak!', 1800); queueShout('New best streak!'); }
}

function comboMiss() {
  const { lost } = combo.miss();
  if (!lost) return;
  renderCombo();
  if (lost >= BADGE_FROM) {
    ui.comboFlag.dataset.kind = 'lost';
    flash(ui.comboFlag, `Streak lost (${lost})`, 1600);
    ui.prompt.classList.remove('is-shaking'); void ui.prompt.offsetWidth; ui.prompt.classList.add('is-shaking');
    fxLater(() => ui.prompt.classList.remove('is-shaking'), 400);
  }
}

// ---------- note chains (Path only) ----------
let introTimer = null;
const INTRO_MS = 1500;
const BOSS_INTRO_MS = 1800;

function hideChainIntro() {
  clearTimeout(introTimer);
  ui.chainIntro.hidden = true;
  ui.chainIntro.classList.remove('is-on', 'is-chain');
}

/** The big announcement over the card; the answer clock starts when it lifts. Returns the spoken text. */
function showChainIntro(c, noteName) {
  const s = STRINGS[c.current.string];
  const stringName = c.current.string === 5 ? 'low E' : s.name;
  ui.chainIntro.classList.add('is-chain');
  ui.chainKicker.textContent = `${c.spots.length} notes`;
  ui.chainBig.textContent = 'Quick note chain round!';
  ui.chainStart.textContent = `Start with the ${stringName} string —`;
  ui.chainIntro.hidden = false;
  ui.chainIntro.classList.remove('is-on'); void ui.chainIntro.offsetWidth; ui.chainIntro.classList.add('is-on');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { hideChainIntro(); if (!session.held) session.restartClock(); }, INTRO_MS);
  return 'Quick note chain round!';
}

/** A chain note was answered (called after the streak and path were scored). */
function onChainCorrect(p) {
  const r = chain.advance(p.firstTry && !p.hinted);
  if (!r.done) return;
  chain = null;
  if (!r.perfect) return;
  const bonus = CHAIN_BONUS * combo.multiplier;
  if (comboActive()) { combo.bonus(bonus); saveComboBests(); renderCombo(); flash(ui.comboGain, `+${bonus}`, 1400); }
  flash(ui.comboShout, 'Chain complete!', 1700);
  hud.confetti();
  queueShout('Chain complete!');
}

// ---------- boss round: interstitial, progress strip, finale ----------
const stringLabel = (i) => (i === 5 ? 'low E' : i === 0 ? 'high E' : STRINGS[i].name);
const noteLetter = (pc) => NOTE_NAMES[pc];

/** The punchy card at the start of each boss phase; the answer clock starts when it lifts. Returns the spoken text. */
function showBossIntro(b, item) {
  const rapid = item.phase === 'rapid';
  const fresh = [...new Set(b.items.filter(i => i.phase === 'new').map(i => noteLetter(i.pc)))];
  ui.chainKicker.textContent = rapid ? 'Phase 2' : 'Boss round!';
  ui.chainBig.textContent = rapid ? 'Rapid fire!' : `Every ${fresh.join(' · ')}!`;
  ui.chainStart.textContent = rapid
    ? `${item.of} spots · ${COUNTDOWN_MS[0] / 1000} s each, then faster —`
    : `${item.of} spots · start on the ${stringLabel(item.string)} string —`;
  ui.chainIntro.hidden = false;
  ui.chainIntro.classList.remove('is-on'); void ui.chainIntro.offsetWidth; ui.chainIntro.classList.add('is-on');
  clearTimeout(introTimer);
  introTimer = setTimeout(() => { hideChainIntro(); if (!session.held) session.restartClock(); }, BOSS_INTRO_MS);
  if (rapid) return 'Rapid fire!';
  return fresh.length === 1 ? `Boss round! Find every ${spokenName(fresh[0])}!` : 'Boss round!';
}

let lastBossLives = BOSS_LIVES;
/** The boss line: phase, boss HP, hearts, and (rapid fire only) the per-spot countdown. */
function renderBossStrip() {
  if (triads.active()) { triads.renderBossStrip(); return; }
  if (scales.active()) { scales.renderBossStrip(); return; }
  const on = !!(boss && boss.state === 'running');
  ui.stage.classList.toggle('is-focus', on);
  ui.foundBlock.hidden = !on;
  ui.timeBlock.hidden = on;
  if (!on) { lastBossLives = BOSS_LIVES; return; }
  const c = boss.current();
  ui.bossHp.hidden = false;
  ui.bossTitle.textContent = `L${boss.levelId} · ${c.phase === 'rapid' ? 'Rapid fire' : 'New notes'}`;
  $('boss-hearts-label').textContent = 'Lives';
  ui.bossHpFill.style.transform = `scaleX(${boss.hp / boss.maxHp})`;
  ui.bossHp.querySelector('.bhp__name').textContent = `BOSS HP · ${Math.round(100 * boss.hp / boss.maxHp)}% LEFT`;
  ui.bossHp.setAttribute('aria-label', `Boss health ${Math.round(100 * boss.hp / boss.maxHp)} percent`);
  const broke = boss.lives < lastBossLives;
  ui.bossHearts.innerHTML = Array.from({ length: BOSS_LIVES }, (_, i) => {
    const lost = i >= boss.lives;
    return `<i class="${lost ? 'is-lost' : ''}${lost && broke && i === boss.lives ? ' is-broke' : ''}">${lost ? '♡' : '♥'}</i>`;
  }).join('');
  ui.bossHearts.setAttribute('aria-label', `${boss.lives} of ${BOSS_LIVES} hearts left`);
  lastBossLives = boss.lives;
  ui.bossCd.hidden = c.phase !== 'rapid';
  ui.foundVal.textContent = `${c.n - 1}/${c.of}`;
}

/** A hit on the boss: the bar shakes harder the bigger the damage, and flashes. */
function bossHitFx(damage) {
  if (!damage) return;
  ui.bossHp.style.setProperty('--shake', `${(2 + 7 * damage / 100).toFixed(1)}px`);
  ui.bossHp.classList.remove('is-hit'); void ui.bossHp.offsetWidth; ui.bossHp.classList.add('is-hit');
}

const runClock = (ms) => { const t = Math.floor(ms / 100) / 10, m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };

/** Boss clock (answer time only: paused on the intro cards and while the voice holds the question) and the rapid-fire countdown, which costs a heart at zero. */
function updateBossTimer() {
  const b = boss || triads.boss;
  if (!b || b.state !== 'running') return;
  const live = session.state === 'listening' && !session.held && ui.chainIntro.hidden ? performance.now() - session.startedAt : 0;
  ui.bossTime.textContent = runClock(b.totalMs + live);
  if (b !== boss) return;   // Triads boss: clock only, no countdown
  const limit = boss.timeLimitMs();
  if (limit == null) return;
  ui.bossCdFill.style.transform = `scaleX(${Math.max(0, 1 - live / limit)})`;
  ui.bossCdVal.textContent = `${Math.max(0, (limit - live) / 1000).toFixed(1)}`;
  ui.bossCd.classList.toggle('is-low', limit - live < limit / 3);
  if (live >= limit) bossTimeout();
}

function bossTimeout() {
  history.recordPosition(session.target, { skipped: true });
  weigher = null;
  const f = boss, r = f.timeout();
  if (r.result === 'lost') { endBoss(f); return; }
  if (r.result === 'won') { endBoss(f); return; }
  notice = { text: 'Too slow! That spot costs a heart', tone: 'bad' };
  renderBossStrip();
  session.skip();
}

let pendingTip = null;   // the next level's tip waits until the boss result card is gone
function hideBossEnd() {
  ui.bossEnd.hidden = true; ui.bossEnd.classList.remove('is-on');
  if (pendingTip != null) { const id = pendingTip; pendingTip = null; if (id === path.current) openTip(id); }
}

const clock = (ms) => { const t = Math.round(ms / 100) / 10, m = Math.floor(t / 60); return m ? `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}` : `${t.toFixed(1)} s`; };

let bossEndLost = false;
/** The result card: stars, time, hearts left, what opened next (or Retry after a loss). */
function showBossEnd(f) {
  bossEndLost = !f.won;
  ui.bossEnd.classList.toggle('is-lost', !f.won);
  ui.bossEndKicker.textContent = !f.won ? 'The boss wins!' : f.stars === 3 ? 'Flawless!' : f.stars === 2 ? 'Boss defeated!' : 'Boss beaten!';
  ui.bossEndStars.innerHTML = [1, 2, 3].map(n => `<span class="${n <= f.stars ? 'is-on' : ''}">★</span>`).join('');
  const hearts = '♥'.repeat(f.lives) + '♡'.repeat(BOSS_LIVES - f.lives);
  ui.bossEndStats.innerHTML = f.won
    ? `<div><b>${f.notes.join(' · ')}</b><span>${f.spots} spots</span></div><div><b>${clock(f.totalMs)}</b><span>total</span></div>`
      + `<div><b>${(f.avgMs / 1000).toFixed(1)} s</b><span>per spot</span></div><div><b class="hearts">${hearts}</b><span>hearts left</span></div>`
    : `<div><b>${f.done}/${f.spots}</b><span>spots hit</span></div><div><b>${Math.round(100 * f.hp / f.maxHp)}%</b><span>boss health left</span></div>`
      + `<div><b class="hearts">${hearts}</b><span>hearts left</span></div>`;
  ui.bossEndNext.textContent = !f.won ? 'Out of hearts. Retry: the boss starts fresh'
    : f.next ? `Level ${f.next.id} unlocked: ${levelTitle(f.next)}` : 'Path complete: every level done';
  ui.bossEndGo.textContent = f.won ? 'Keep going' : 'Retry';
  ui.bossEnd.hidden = false;
  ui.bossEnd.classList.remove('is-on'); void ui.bossEnd.offsetWidth; ui.bossEnd.classList.add('is-on');
  if (f.won) hud.confetti();
}

/** The fight is over (won or lost): record it, show the card, stop the session, then say the result. */
function endBoss(f) {
  const won = f.state === 'won', lvl = levelById(f.levelId);
  const data = { won, level: lvl.id, stars: 0, lit: f.items, notes: lvl.notes.map(noteLetter), spots: f.items.length, done: f.index, totalMs: f.totalMs, avgMs: f.avgMs,
    lives: f.lives, hp: f.hp, maxHp: f.maxHp, next: null };
  if (won) {
    const r = path.completeBoss(lvl.id, f.avgMs, f.livesLost);
    data.stars = r.stars; data.next = r.next && levelById(r.next);
    bossFinale = data;
    popTile(lvl.id);
    if (data.next) pendingTip = data.next.id;
  }
  boss = null;
  showBossEnd(data);
  renderPath();
  setTimeout(async () => {
    if (session.state !== 'idle') await toggleSession();
    if (settings.voice) voice.speak(won ? 'Boss defeated!' : 'The boss wins!', voiceOpts());
  }, 0);
}

/** Every spot of the group's notes, lit on the board. */
function lightWholeBoard(f) {
  for (const s of f.lit) fretboard.showNote(s.string, s.fret, 'correct', noteLetter(s.pc), true);
}

ui.bossEndGo.addEventListener('click', () => { hideBossEnd(); if (bossEndLost && !triads.active()) startBoss(); else if (session.state === 'idle') toggleSession(); });

// ---------- level path ----------
const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);

// ---------- level tip card + landmark hints ----------
let tipId = null;   // the level whose tip card is open, else null

function renderTip() {
  const show = tipId != null && tipId === path.current && isNoteMode() && settings.noteMode === 'path';
  ui.tipCard.hidden = !show;
  ui.tipBtn.setAttribute('aria-expanded', String(show));
  ui.tipBtn.classList.toggle('is-on', show);
  if (!show || ui.tipCard.dataset.id === String(tipId)) return;
  const t = levelTip(tipId);
  ui.tipCard.dataset.id = tipId;
  ui.tipTag.textContent = `Level ${tipId} tip`;
  ui.tipHead.textContent = t.headline;
  ui.tipLine.textContent = t.line;
  ui.tipNote.textContent = t.note;
  ui.tipFig.innerHTML = t.svg;
  ui.tipSwipe.hidden = ui.tipFig.scrollWidth <= ui.tipFig.clientWidth + 2;
}

function openTip(id = path.current) {
  tipId = id;
  path.markTip(id);
  delete ui.tipCard.dataset.id;
  renderTip();
}

function closeTip() { tipId = null; renderTip(); }

ui.tipBtn.addEventListener('click', () => (tipId === path.current ? closeTip() : openTip()));
ui.tipGot.addEventListener('click', closeTip);

/** After a miss in the Path: count from the nearest landmark, and mark that landmark on the board. */
function showLandmarkHint(target) {
  if (!isNoteMode() || settings.noteMode !== 'path' || (boss && boss.state === 'running')) return;
  const h = landmarkHint(target.string, target.fret);
  setTip(h.text);
  if (h.from) fretboard.showNote(h.from.string, h.from.fret, 'root', noteAt(h.from.string, h.from.fret).name);
}

const tiles = LEVELS.map((l) => {
  const li = document.createElement('li');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'path__tile'; b.dataset.id = l.id;
  b.innerHTML = `<b class="path__num">L${l.id}</b><span class="path__names">${l.short}</span><span class="path__mark"></span>`;
  b.title = `Level ${l.id} · ${levelTitle(l)}`;
  b.addEventListener('click', () => {
    if (l.id === path.current) { togglePathPop(); return; }
    if (!path.isUnlocked(l.id)) { showLockedLevel(l); return; }
    hud.hideLock();
    if (!path.select(l.id)) return;
    closePathPop();
    boss = null; notice = null;
    openTip(l.id);
    renderPath();
    if (session.state !== 'idle' && session.mode === 'note') session.skip();
  });
  li.appendChild(b);
  ui.pathMap.appendChild(li);
  return b;
});

/** A locked pip: say what unlocks it (the boss of the level before). */
function showLockedLevel(l) {
  const before = levelById(l.id - 1), isCurrent = before.id === path.current, pr = path.progress(before.id, fretRange());
  closePathPop();
  hud.showLock({
    kicker: `Path · Level ${l.id}`, title: `${levelTitle(l)} is locked`,
    text: `Beat the L${before.id} boss to open it${isCurrent ? `: answer ${WINDOW} times with a ${Math.round(FIRST_TRY_MIN * 100)}% clean-first-try rate and a ${AVG_MS_MAX / 1000} s average.` : ': finish the earlier levels first.'}`,
    rows: isCurrent ? noteCrits(pr) : [],
    backLabel: `Back to L${path.current}`, onBack: () => {},
  });
}
function noteCrits(pr) {
  return [
    { text: `${pr.answered} / ${WINDOW} answers`, state: pr.met.count ? 'met' : 'open' },
    hud.crit(`${pr.firstTryPct}% first try`, pr.firstTryPct, pr.met.firstTry, `≥ ${Math.round(FIRST_TRY_MIN * 100)}% 1st try`),
    hud.crit(`avg ${pr.avgMs == null ? '' : (pr.avgMs / 1000).toFixed(1)} s`, pr.avgMs, pr.met.time, `avg ≤ ${AVG_MS_MAX / 1000} s`),
    { text: `spots ${pr.spots}/${pr.spotsTotal}`, state: pr.met.spots ? 'met' : 'open' },
  ];
}

function togglePathPop() { ui.pathPop.hidden = !ui.pathPop.hidden; }
function closePathPop() { ui.pathPop.hidden = true; }
document.addEventListener('pointerdown', (e) => { if (!ui.pathPop.hidden && !ui.path.contains(e.target)) closePathPop(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePathPop(); });

function popTile(id) {
  const t = tiles[id - 1];
  t.classList.remove('is-pop'); void t.offsetWidth; t.classList.add('is-pop');
}

function renderPath() {
  syncComboContext();
  renderBossStrip();
  renderCombo();
  const show = isNoteMode() && settings.noteMode === 'path';
  ui.path.hidden = !show;
  syncBoardRange();
  renderTip();
  if (isNoteMode() && !show) hud.setPath(null);
  if (!show) return;
  const range = fretRange();
  tiles.forEach((b, i) => {
    const id = i + 1, open = path.isUnlocked(id), done = path.isDone(id), now = id === path.current;
    b.setAttribute('aria-disabled', String(!open));
    b.classList.toggle('is-locked', !open);
    b.classList.toggle('is-done', done);
    b.classList.toggle('is-current', now);
    if (now) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    b.querySelector('.path__mark').innerHTML = !open ? LOCK_SVG : done ? stars(path.stars(id)) : '';
    b.title = `Level ${id} · ${levelTitle(levelById(id))}${now ? ' (click for progress)' : ''}`;
    b.setAttribute('aria-label', `Level ${id}, ${levelTitle(levelById(id))}${!open ? ', locked' : done ? `, done, ${path.stars(id)} of 3 stars` : now ? ', current' : ''}`);
  });
  const lvl = path.currentLevel, pr = path.progress(lvl.id, range);
  const running = boss && boss.state === 'running';
  ui.pathTitle.textContent = `Level ${lvl.id} · ${levelTitle(lvl)}`;
  ui.pathGoal.textContent = pr.spotsTotal === 0
    ? 'No spot of this level falls inside your fret range. Widen the frets in Settings.'
    : pr.bossUnlocked ? 'Boss round open: play every spot of each of the level\'s notes, frets 0-12.'
    : `Unlock the boss: last ${WINDOW} answers ${Math.round(FIRST_TRY_MIN * 100)}%+ first try, ${AVG_MS_MAX / 1000} s or less on average, every spot of the level.`;
  const box = (label, value, goal, met) =>
    `<div class="pstat${met ? ' is-met' : ''}"><span class="pstat__label">${label}</span><span class="pstat__value">${value}${met ? ' ✓' : ''}</span><span class="pstat__goal">${goal}</span></div>`;
  ui.pathStats.innerHTML =
    box('Answered', `${pr.answered}/${WINDOW}`, 'last 20', pr.met.count)
    + box('First try', pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`, `${Math.round(FIRST_TRY_MIN * 100)}% or more`, pr.met.firstTry)
    + box('Avg time', pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`, `${AVG_MS_MAX / 1000} s or less`, pr.met.time)
    + box('Spots', `${pr.spots}/${pr.spotsTotal}`, 'every spot', pr.met.spots);
  hud.setPath({
    level: { n: lvl.id, sub: levelTitle(lvl) },
    note: hud.opensNote(lvl.id, LEVELS.length, pr.done), locked: !pr.done && lvl.id < LEVELS.length,
    meter: running
      ? { n: boss.index, of: boss.items.length, label: `${boss.index}/${boss.items.length}`, crits: [{ text: `${boss.lives} ${boss.lives === 1 ? 'heart' : 'hearts'} left`, state: boss.lives < BOSS_LIVES ? 'bad' : 'met' }, { text: boss.index ? `avg ${(boss.totalMs / boss.index / 1000).toFixed(1)} s` : `avg ≤ ${AVG_MS_MAX / 1000} s`, state: 'open' }] }
      : { n: Math.min(pr.answered, WINDOW), of: WINDOW, crits: noteCrits(pr).slice(1) },
  });
  ui.bossBtn.disabled = !pr.bossUnlocked || !!running;
  ui.bossBtn.classList.toggle('is-ready', pr.bossUnlocked && !running);
  ui.bossBtn.innerHTML = running ? `Boss ${boss.index}/${boss.items.length}` : `${pr.bossUnlocked ? '★' : LOCK_SVG} ${pr.done ? 'Boss again' : 'Boss'}`;
  ui.bossBtn.title = pr.bossUnlocked ? 'Start the boss round for this level' : 'Unlock the boss: see the level progress';
  const cur = tiles[lvl.id - 1];
  cur.title = `Level ${lvl.id} · ${levelTitle(lvl)}: ${pr.answered}/${WINDOW} answered, ${pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`} first try, ${pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`} avg, spots ${pr.spots}/${pr.spotsTotal}`;
  ui.bossNote.textContent = running ? 'Three hearts: a wrong note or a timeout costs one. Skipping ends it.'
    : pr.bossUnlocked ? `${pr.done ? `Best ${stars(pr.stars)} · ` : ''}★ pass · ★★ avg ${STAR2_MS / 1000} s, 2 hearts lost max · ★★★ avg ${STAR3_MS / 1000} s, none`
    : '';
}

// A correct note in note mode: boss progress, or the path's scoring window. Returns text for the status line.

function onNoteCorrect(p) {
  let extra = '';
  if (boss && boss.state === 'running') {
    const f = boss, r = f.answer({ string: p.target.string, fret: p.target.fret }, p.ms);
    bossHitFx(r.damage);
    if (r.result === 'won') { endBoss(f); extra = `Level ${f.levelId} complete`; }
    else extra = `${f.index} of ${f.items.length}`;
  } else if (settings.noteMode === 'path') {
    const at = p.played || p.target;
    const r = path.record(path.current, { string: at.string, fret: at.fret, firstTry: p.firstTry && !p.hinted, ms: p.ms }, fretRange());
    if (r.bossUnlocked) {
      extra = 'Boss round unlocked!'; popTile(path.current); hud.confetti();
      const lvlId = path.current;
      setTimeout(() => { if (session.state !== 'idle' && !(boss && boss.state === 'running') && path.current === lvlId && isNoteMode() && settings.noteMode === 'path') startBoss(); }, 900);
    }
  }
  renderPath();
  return extra;
}

function failBoss(reason, text) {
  boss = null;
  if (text) notice = { text, tone: 'bad' };
  ui.stringName.textContent = stringPrompt(session.target.string, '', { names: sayNames() }).label;
  renderPath();
}

async function startBoss() {
  const lvl = path.currentLevel;
  if (!isNoteMode() || !path.progress(lvl.id, fretRange()).bossUnlocked) return;
  const b = createBossFight(lvl, fretRange());
  if (b.state !== 'running') { setStatus('No spot of this level falls inside your fret range.', 'bad'); return; }
  boss = b; notice = null; chain = null; bossFinale = null; hideBossEnd();
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
  openTip(path.current);
  renderPath();
  if (session.state !== 'idle' && session.mode === 'note') session.skip();
});

// A skip is a "couldn't find it" for the heatmap.
function skipNow() {
  if (scales.active()) { scales.skip(); syncButtons(); return; }
  chain = null;
  if (session.state === 'listening') {
    if (comboActive()) comboMiss();
    if (session.mode === 'intervals') history.recordInterval(session.target.interval, { skipped: true });
    else if (session.mode === 'arpeggios') history.recordChord(session.target.chord, { skipped: true });
    else if (session.mode === 'triads') triads.onSkip();
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

const mmss = (ms) => { const t = Math.floor(ms / 1000); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
function setTime(text) { if (ui.timeVal.textContent !== text) ui.timeVal.textContent = text; }

function frame() {
  requestAnimationFrame(frame);
  if (scales.active()) { scales.tick(); return; }
  if (session.state === 'idle') { setTime('0:00'); return; }
  session.tick();
  if (session.state === 'listening') setTime(mmss(session.held ? 0 : performance.now() - session.startedAt));
  if (session.state === 'listening' && comboActive()) setSpeedBar(speedLeft(session.held ? 0 : performance.now() - session.startedAt));
  updateBossTimer();
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

// ---------- triads (practice/js/triads-ui.js) ----------
const triads = createTriadsUI({
  $, ui, session, fretboard, history, pitch, combo, voice,
  getSettings: () => settings,
  commit: (patch) => commit(patch),
  announce: (...a) => announce(...a),
  playCue: () => playCue(), buzz: () => sound.buzz(), bling: () => sound.bling(),
  voiceOpts: () => voiceOpts(),
  setPrompt: (...a) => setPrompt(...a), setStatus: (...a) => setStatus(...a), setTip: (t) => setTip(t),
  scrollBoardTo: (f) => scrollBoardTo(f), updateStats: () => updateStats(), renderHeatPanel: () => renderHeatPanel(),
  comboActive: () => comboActive(), comboHit: (ms) => comboHit(ms), comboMiss: () => comboMiss(), renderCombo: () => renderCombo(),
  saveComboBests: () => saveComboBests(), syncComboContext: () => syncComboContext(), flash: (...a) => flash(...a), queueShout: (t) => queueShout(t),
  speakCorrect: () => speakCorrect(), toggleSession: () => toggleSession(),
  hideChainIntro: () => hideChainIntro(), hideBossEnd: () => hideBossEnd(),
  clearWrongTimers: () => { wrongTimers.forEach(clearTimeout); wrongTimers = []; },
  later: (fn, ms) => wrongTimers.push(setTimeout(fn, ms)),
});
// ---------- scales (practice/js/scales-ui.js) ----------
const scales = createScalesUI({
  $, ui, fretboard, pitch, voice,
  getSettings: () => settings,
  commit: (patch) => commit(patch),
  announce: (...a) => announce(...a),
  voiceOpts: () => voiceOpts(),
  setPrompt: (...a) => setPrompt(...a), setStatus: (...a) => setStatus(...a),
  scrollBoardTo: (f) => scrollBoardTo(f),
  toggleStart: () => toggleSession(), syncButtons: () => syncButtons(), warmClips: () => warmClips(),
  hideChainIntro: () => hideChainIntro(), hideBossEnd: () => hideBossEnd(),
});
$('scales-path-reset').addEventListener('click', () => {
  if (!confirm('Reset your Scales path? Every level goes back to locked except level 1.')) return;
  scales.resetPath(); applySettingsToUI();
});
$('triad-path-reset').addEventListener('click', () => {
  if (!confirm('Reset your Triads path? Every level goes back to locked except level 1.')) return;
  triads.resetPath(); applySettingsToUI();
});

// ---------- controls ----------
async function toggleSession() {
  if (scales.active()) { await scales.toggle(); syncButtons(); return; }
  if (session.state === 'idle') {
    warmClips();
    await pitch.start();
    session.start();
  } else {
    session.stop();
    pitch.stop();
  }
}

ui.startBtn.addEventListener('click', toggleSession);
ui.skipBtn.addEventListener('click', skipNow);
function hintNow() { if (scales.active()) scales.hint(); else session.showHint(); syncButtons(); }
ui.hintBtn.addEventListener('click', hintNow);

// mode switcher
document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => {
  boss = null; notice = null; triads.cancelBoss(); scales.cancelBoss();
  if (scales.running) scales.stop();                                 // leaving Scales: the mic closes
  else if (r.value === 'scales' && session.state !== 'idle') { session.stop(); pitch.stop(); }   // entering Scales: its own runs, not a session
  commit({ mode: r.value });
  if (session.state !== 'idle') session.skip(); // re-pick in the new mode right away
  syncButtons();
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

document.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (['input', 'select', 'textarea'].includes(tag) || e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.code === 'Space') { e.preventDefault(); toggleSession(); }
  else if (e.key === 'n' || e.key === 'N') skipNow();
  else if (e.key === 'h' || e.key === 'H') hintNow();
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
f.voiceTest.addEventListener('click', () => voice.speak('String 5, C sharp', voiceOpts()));
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
  f.voiceSelect.innerHTML = `<option value="${CLIP_VOICE}">Adam (recorded)</option><option value="__browser">Browser default</option>`;
  for (const v of list) {
    const o = document.createElement('option');
    o.value = v.name; o.textContent = `${v.name} (${v.lang})`;
    f.voiceSelect.appendChild(o);
  }
  f.voiceSelect.value = list.some(v => v.name === settings.voiceName) || settings.voiceName === '__browser' ? settings.voiceName : CLIP_VOICE;
}
if (voice.supported) {
  populateVoices();
  if ('speechSynthesis' in window) speechSynthesis.addEventListener('voiceschanged', populateVoices);
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
  const mode = ['intervals', 'arpeggios', 'triads', 'scales'].includes(settings.mode) ? settings.mode : 'note';
  document.body.dataset.mode = mode;
  $('play-notes').checked = settings.playNotes;
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
  triads.render();
  scales.render();
  ui.customNotes.querySelectorAll('.chip[data-pc]').forEach((c) => c.setAttribute('aria-pressed', settings.notes.includes(+c.dataset.pc)));
  $('custom-accidentals').setAttribute('aria-pressed', hasAccidentals(settings.notes));
  ui.customStrings.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', settings.strings.includes(+c.dataset.index)));
  ui.earToggle.setAttribute('aria-pressed', settings.playNote);
  ui.namesToggle.setAttribute('aria-pressed', settings.showStringNames);
  $('say-names-toggle').setAttribute('aria-pressed', settings.sayStringNames);
  fretboard.setStringNames(settings.showStringNames);
  intervalList.querySelectorAll('input').forEach((i) => { i.checked = settings.intervals.includes(i.value); });

  f.pills.querySelectorAll('.pill').forEach((b) =>
    b.setAttribute('aria-pressed', settings.strings.includes(+b.dataset.index)));
  f.fretFrom.value = settings.fretFrom;
  f.fretTo.value = settings.fretTo;
  f.presets.querySelectorAll('.chip').forEach((c) =>
    c.classList.toggle('is-active', +c.dataset.from === settings.fretFrom && +c.dataset.to === settings.fretTo));
  syncBoardRange();
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
if (isNoteMode() && settings.noteMode === 'path' && !path.tipSeen(path.current)) openTip();
syncButtons();
updateStats();
renderHeatPanel();

// Expose for poking around in devtools.
window.practice = { triads, scales, session, pitch, voice, sound, fretboard, history, path, startBoss, renderHeatPanel, get boss() { return boss; }, get settings() { return settings; }, DEFAULTS };
