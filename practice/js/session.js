// Practice-loop state machine. No DOM, no timers of its own: the host calls
// tick() regularly (e.g. from requestAnimationFrame) and feeds detected notes.
//
// States: idle -> listening -> resolved -> listening ... -> idle
//
// Events (via onEvent(type, payload)):
//   target  {target, note}        new target chosen
//   hint    {target}              show the answer position
//   correct {target, ms, firstTry}
//   wrong   {midi, name, fret}    fret is the position on the target string, or -1
//   stopped {stats}
//   error   {message}

import { noteAt, pickTarget, fretForMidi, midiToNoteName } from './notes.js';

export function createSession({ getSettings, now = () => performance.now(), rng = Math.random, onEvent }) {
  const stats = { total: 0, firstTry: 0, wrong: 0, skipped: 0, times: [], get avgMs() {
    return this.times.length ? Math.round(this.times.reduce((a, b) => a + b, 0) / this.times.length) : 0;
  } };

  const session = {
    state: 'idle',
    target: null,
    note: null,
    stats,
    startedAt: 0,
    hintShown: false,
    wrongSeen: new Set(),
    resolvedAt: 0,
  };

  function emit(type, payload = {}) { onEvent(type, payload); }

  function nextTarget() {
    const settings = getSettings();
    const target = pickTarget(settings, session.target, rng);
    if (!target) {
      session.state = 'idle';
      emit('error', { message: 'No notes match the current settings. Enable more strings or widen the fret range.' });
      return false;
    }
    session.target = target;
    session.note = noteAt(target.string, target.fret);
    session.startedAt = now();
    session.hintShown = false;
    session.wrongSeen = new Set();
    session.state = 'listening';
    emit('target', { target, note: session.note });
    return true;
  }

  function showHint() {
    if (session.state !== 'listening' || session.hintShown) return;
    session.hintShown = true;
    emit('hint', { target: session.target });
  }

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
      const ms = now() - session.startedAt;
      const firstTry = session.wrongSeen.size === 0;
      stats.total += 1;
      if (firstTry) stats.firstTry += 1;
      stats.times.push(ms);
      session.state = 'resolved';
      session.resolvedAt = now();
      emit('correct', { target: session.target, ms, firstTry });
      return;
    }
    if (session.wrongSeen.has(midi)) return;
    session.wrongSeen.add(midi);
    stats.wrong += 1;
    const octaves = Math.round((midi - session.note.midi) / 12);
    emit('wrong', {
      midi,
      name: midiToNoteName(midi),
      fret: fretForMidi(session.target.string, midi),
      // Right note name, wrong octave: +1 = an octave too high, -1 too low, 0 = different note.
      octaveOff: (midi - session.note.midi) % 12 === 0 ? octaves : 0,
    });
  };

  session.tick = () => {
    const t = now();
    if (session.state === 'listening') {
      const { hintDelayMs } = getSettings();
      if (hintDelayMs != null && !session.hintShown && t - session.startedAt >= hintDelayMs) showHint();
    } else if (session.state === 'resolved') {
      const { pauseMs = 900 } = getSettings();
      if (t - session.resolvedAt >= pauseMs) nextTarget();
    }
  };

  return session;
}
