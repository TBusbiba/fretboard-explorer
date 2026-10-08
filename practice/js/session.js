// Practice-loop state machine. No DOM, no timers of its own: the host calls
// tick() regularly (e.g. from requestAnimationFrame) and feeds detected notes.
//
// States: idle -> listening -> resolved -> listening ... -> idle
//
// Every target is a sequence of expected pitches ("steps"): one in note mode,
// root then interval in intervals mode, one chord tone per string in arpeggio
// and triad modes. Multi-step modes have two hint stages: a tip, then the
// position(s). In sequence modes (arpeggios, triads) stage 2 reveals only the
// current step, and each new step restarts the countdown.
//
// Events (via onEvent(type, payload)):
//   target  {target, note, mode}   new target chosen
//   step    {step, total, note}    a step was played; now listening for the next one
//   hint    {target, stage, stages} stage 1..stages (note mode has 1 stage; intervals 2)
//   correct {target, ms, firstTry, hinted}
//   wrong   {midi, name, fret, octaveOff}
//   stopped {stats}
//   error   {message}

import {
  noteAt, pickTarget, pickIntervalTarget, pickArpeggioTarget, pickTriadTarget, fretForMidi, midiToNoteName,
  midiToOctave, intervalById, chordById, triadById,
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
    note: null,        // the pitch currently expected (= steps[step])
    steps: [],         // [{midi, name, octave, string?, fret?, degree?}]
    step: 0,
    rootNote: null,    // intervals / arpeggios: the root
    interval: null,    // intervals: the interval definition
    chord: null,       // arpeggios: the chord definition
    triad: null,       // triads: the triad definition
    hintAnchor: 0,     // time the next hint stage counts from
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
    const mode = ['intervals', 'arpeggios', 'triads'].includes(settings.mode) ? settings.mode : 'note';
    const previous = session.mode === mode ? session.target : null;
    const target = mode === 'intervals' ? pickIntervalTarget(settings, previous, rng)
      : mode === 'arpeggios' ? pickArpeggioTarget(settings, previous, rng)
      : mode === 'triads' ? pickTriadTarget(settings, previous, rng)
      : pickTarget(settings, previous, rng);
    if (!target) {
      session.state = 'idle';
      emit('error', {
        message: mode === 'intervals'
          ? 'No interval drills fit the current settings. Enable more strings, intervals, or widen the fret range.'
          : mode === 'arpeggios'
            ? 'No arpeggio fits the current settings. Enable all strings from 6 (or 5) up to 1, pick some chords, and allow at least 5 frets.'
            : mode === 'triads'
              ? 'No triad fits the current settings. Pick at least one string group (with its strings enabled) and one triad type.'
              : 'No notes match the current settings. Enable more strings or widen the fret range.',
      });
      return false;
    }
    session.mode = mode;
    session.target = target;
    session.step = 0;
    session.rootNote = null; session.interval = null; session.chord = null; session.triad = null;
    if (mode === 'intervals') {
      session.rootNote = noteAt(target.root.string, target.root.fret);
      session.interval = intervalById(target.interval);
      session.steps = [
        { ...session.rootNote, string: target.root.string, fret: target.root.fret },
        noteFor(target.midi),
      ];
      session.hintStages = 2;
    } else if (mode === 'arpeggios') {
      session.rootNote = noteAt(target.root.string, target.root.fret);
      session.chord = chordById(target.chord);
      session.steps = target.notes.map(n => ({ ...noteFor(n.midi), string: n.string, fret: n.fret, degree: n.degree }));
      session.hintStages = 2;
    } else if (mode === 'triads') {
      session.rootNote = noteAt(target.root.string, target.root.fret);
      session.triad = triadById(target.triad);
      session.steps = target.notes.map(n => ({ ...noteFor(n.midi), string: n.string, fret: n.fret, degree: n.degree }));
      session.hintStages = 2;
    } else {
      session.steps = [{ ...noteAt(target.string, target.fret), string: target.string, fret: target.fret }];
      session.hintStages = 1;
    }
    session.note = session.steps[0];
    session.startedAt = now();
    session.hintAnchor = session.startedAt;
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
    session.hintAnchor = now();
    emit('hint', { target: session.target, stage: session.hintStage, stages: session.hintStages, step: session.step });
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
      if (session.step < session.steps.length - 1) {
        session.step += 1;
        session.note = session.steps[session.step];
        session.wrongSeen = new Set();
        // Sequence modes reveal one note per hint: the next step needs its own countdown.
        if (session.mode === 'arpeggios' || session.mode === 'triads') session.hintStage = Math.min(session.hintStage, 1);
        session.hintAnchor = now();
        emit('step', { step: session.step, total: session.steps.length, note: session.note });
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
      // Each hint stage arrives one delay after the previous stage (or step).
      if (hintDelayMs != null && session.hintStage < session.hintStages && t - session.hintAnchor >= hintDelayMs) showHint();
    } else if (session.state === 'resolved') {
      const { pauseMs = 900 } = getSettings();
      if (t - session.resolvedAt >= pauseMs) nextTarget();
    }
  };

  /** Time until the next hint stage (null when hints are off, done, or not listening). */
  session.hintProgress = () => {
    const { hintDelayMs } = getSettings();
    if (session.state !== 'listening' || hintDelayMs == null || session.hintStage >= session.hintStages) return null;
    const elapsed = now() - session.hintAnchor;
    return { fraction: Math.min(1, Math.max(0, elapsed / hintDelayMs)), remainingMs: Math.max(0, hintDelayMs - elapsed) };
  };

  return session;
}
