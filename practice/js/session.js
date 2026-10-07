// Practice-loop state machine. No DOM, no timers of its own: the host calls
// tick() regularly (e.g. from requestAnimationFrame) and feeds detected notes.
//
// States: idle -> listening -> resolved -> listening ... -> idle
//
// Note mode: one expected pitch per target. Intervals mode: two steps — the
// root first, then the interval — and two hint stages (tip, then positions).
//
// Events (via onEvent(type, payload)):
//   target  {target, note, mode}   new target chosen
//   step    {step, note}           intervals: root played, now listening for the interval
//   hint    {target, stage, stages} stage 1..stages (note mode has 1 stage; intervals 2)
//   correct {target, ms, firstTry, hinted}
//   wrong   {midi, name, fret, octaveOff}
//   stopped {stats}
//   error   {message}

import {
  noteAt, pickTarget, pickIntervalTarget, fretForMidi, midiToNoteName, midiToOctave, intervalById,
} from './notes.js';

export function createSession({ getSettings, now = () => performance.now(), rng = Math.random, onEvent }) {
  const stats = {
    total: 0, firstTry: 0, wrong: 0, skipped: 0, times: [],
    get avgMs() {
      return this.times.length ? Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length) : 0;
    },
  };

  const session = {
    state: 'idle',
    mode: 'note',
    target: null,
    note: null,        // the pitch currently expected
    rootNote: null,    // intervals: the root
    interval: null,    // intervals: the interval definition
    step: 0,           // intervals: 0 = waiting for root, 1 = waiting for interval
    stats,
    startedAt: 0,
    hintStage: 0,
    hintStages: 1,
    wrongSeen: new Set(),
    hadWrong: false,
    resolvedAt: 0,
  };

  function emit(type, payload = {}) { onEvent(type, payload); }

  function noteFor(midi) { return { name: midiToNoteName(midi), midi, octave: midiToOctave(midi) }; }

  function nextTarget() {
    const settings = getSettings();
    const mode = settings.mode === 'intervals' ? 'intervals' : 'note';
    const previous = session.mode === mode ? session.target : null;
    const target = mode === 'intervals'
      ? pickIntervalTarget(settings, previous, rng)
      : pickTarget(settings, previous, rng);
    if (!target) {
      session.state = 'idle';
      emit('error', {
        message: mode === 'intervals'
          ? 'No interval drills fit the current settings. Enable more strings, intervals, or widen the fret range.'
          : 'No notes match the current settings. Enable more strings or widen the fret range.',
      });
      return false;
    }
    session.mode = mode;
    session.target = target;
    session.step = 0;
    if (mode === 'intervals') {
      session.rootNote = noteAt(target.root.string, target.root.fret);
      session.interval = intervalById(target.interval);
      session.note = session.rootNote;      // step 0: play the root first
      session.hintStages = 2;
    } else {
      session.rootNote = null;
      session.interval = null;
      session.note = noteAt(target.string, target.fret);
      session.hintStages = 1;
    }
    session.startedAt = now();
    session.hintStage = 0;
    session.wrongSeen = new Set();
    session.hadWrong = false;
    session.state = 'listening';
    emit('target', { target, note: session.note, mode });
    return true;
  }

  function showHint() {
    if (session.state !== 'listening' || session.hintStage >= session.hintStages) return;
    session.hintStage += 1;
    emit('hint', { target: session.target, stage: session.hintStage, stages: session.hintStages });
  }

  Object.defineProperty(session, 'hintShown', { get: () => session.hintStage >= session.hintStages });

  session.start = () => {
    if (session.state !== 'idle') return;
    nextTarget();
  };

  session.stop = () => {
    if (session.state === 'idle') return;
    session.state = 'idle';
    emit('stopped', { stats });
  };

  session.skip = () => {
    if (session.state === 'idle') return;
    stats.skipped += 1;
    nextTarget();
  };

  session.showHint = showHint;

  session.noteDetected = (midi) => {
    if (session.state !== 'listening') return;
    if (midi === session.note.midi) {
      if (session.mode === 'intervals' && session.step === 0) {
        session.step = 1;
        session.note = noteFor(session.target.midi);
        session.wrongSeen = new Set();
        emit('step', { step: 1, note: session.note });
        return;
      }
      const ms = now() - session.startedAt;
      const firstTry = !session.hadWrong;
      stats.total += 1;
      if (firstTry) stats.firstTry += 1;
      stats.times.push(ms);
      session.state = 'resolved';
      session.resolvedAt = now();
      emit('correct', { target: session.target, ms, firstTry, hinted: session.hintStage > 0 });
      return;
    }
    if (session.wrongSeen.has(midi)) return;
    session.wrongSeen.add(midi);
    session.hadWrong = true;
    stats.wrong += 1;
    const diff = midi - session.note.midi;
    emit('wrong', {
      midi,
      name: midiToNoteName(midi),
      fret: session.mode === 'note' ? fretForMidi(session.target.string, midi) : -1,
      // Right note name, wrong octave: +1 = an octave too high, -1 too low, 0 = different note.
      octaveOff: diff % 12 === 0 ? Math.round(diff / 12) : 0,
    });
  };

  session.tick = () => {
    const t = now();
    if (session.state === 'listening') {
      const { hintDelayMs } = getSettings();
      // Each hint stage arrives one delay after the previous one.
      if (hintDelayMs != null && session.hintStage < session.hintStages
          && t - session.startedAt >= hintDelayMs * (session.hintStage + 1)) showHint();
    } else if (session.state === 'resolved') {
      const { pauseMs = 900 } = getSettings();
      if (t - session.resolvedAt >= pauseMs) nextTarget();
    }
  };

  /** Time until the next hint stage (null when hints are off, done, or not listening). */
  session.hintProgress = () => {
    const { hintDelayMs } = getSettings();
    if (session.state !== 'listening' || hintDelayMs == null || session.hintStage >= session.hintStages) return null;
    const elapsed = now() - session.startedAt - hintDelayMs * session.hintStage;
    return { fraction: Math.min(1, Math.max(0, elapsed / hintDelayMs)), remainingMs: Math.max(0, hintDelayMs - elapsed) };
  };

  return session;
}
