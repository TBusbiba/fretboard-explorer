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
//   correct {target, ms, firstTry, hinted, played: {string, fret}}
//   wrong   {midi, name, fret, octaveOff}
//   stopped {stats}
//   error   {message}

import { createTriadMatcher } from './triad-match.js';
import { MISTAKE_HOLD_MS } from './scale-listen.js';

const RING_MS = 1500;   // the shape just finished keeps ringing into the next one
import {
  noteAt, pickTarget, pickIntervalTarget, pickArpeggioTarget, pickTriadTarget, fretForMidi, midiToNoteName,
  midiToOctave, STRINGS, intervalById, chordById, triadById,
} from './notes.js';

/** MIDI pitches that answer "string N, note X" with any fret in `range`: same pitch class, any octave reachable on that string. */
export function validMidis(string, fret, range) {
  const pc = (STRINGS[string].midi + fret) % 12, out = [];
  for (let f = range.from; f <= range.to; f++) if ((STRINGS[string].midi + f) % 12 === pc) out.push(STRINGS[string].midi + f);
  return out;
}

// `pickNote` lets the host choose find-the-note targets itself (the path's boss round).
export function createSession({ getSettings, now = () => performance.now(), rng = Math.random, onEvent, pickNote = pickTarget, getAcceptRange = () => null, pickTriad = null }) {
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
    matcher: null,     // triads (host-picked): matches the 3 notes against the target's voicings, any shape
    triad: null,       // triads: the triad definition
    hintAnchor: 0,     // time the next hint stage counts from
    stats,
    startedAt: 0,
    hintStage: 0,
    hintStages: 1,
    wrongSeen: new Set(),
    hadWrong: false,
    resolvedAt: 0,
    ring: { current: [], finished: [], finishedAt: -Infinity },   // triads: pitches still ringing
  };

  function emit(type, payload = {}) { onEvent(type, payload); }

  const voicingSteps = (v) => v.notes.map(n => ({ ...noteFor(n.midi), string: n.string, fret: n.fret, degree: n.degree }));

  function noteFor(midi) { return { name: midiToNoteName(midi), midi, octave: midiToOctave(midi) }; }

  function nextTarget() {
    const settings = getSettings();
    const mode = ['intervals', 'arpeggios', 'triads'].includes(settings.mode) ? settings.mode : 'note';
    const previous = session.mode === mode ? session.target : null;
    const target = mode === 'intervals' ? pickIntervalTarget(settings, previous, rng)
      : mode === 'arpeggios' ? pickArpeggioTarget(settings, previous, rng)
      : mode === 'triads' ? (pickTriad ? pickTriad(settings, previous, rng) : pickTriadTarget(settings, previous, rng))
      : pickNote(settings, previous, rng);
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
    session.rootNote = null; session.interval = null; session.chord = null; session.triad = null; session.matcher = null;
    if (mode === 'triads' && pickTriad) {
      session.matcher = target.run || createTriadMatcher(target.voicings);
      session.steps = voicingSteps(session.matcher.candidates[0]);
      session.hintStages = 2;
    } else if (mode === 'intervals') {
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
    session.held = false;
    session.hintStage = 0;
    session.shapeHinted = false;
    session.wrongSeen = new Set();
    session.hadWrong = false;
    session.ring = { current: [], finished: [], finishedAt: -Infinity };
    session.state = 'listening';
    emit('target', { target, note: session.note, mode });
    return true;
  }

  function showHint() {
    if (session.state !== 'listening' || session.hintStage >= session.hintStages) return;
    session.hintStage += 1;
    session.shapeHinted = true;
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

  // The host held the question back (an announcement): the clock and the hint countdown start now.
  session.restartClock = () => {
    session.held = false;
    if (session.state !== 'listening') return;
    session.startedAt = now();
    session.hintAnchor = session.startedAt;
  };

  // Hold the clock and hint countdown at zero until restartClock (the voice is still saying what to play).
  session.holdClock = () => { if (session.state === 'listening') session.held = true; };

  session.showHint = showHint;

  function acceptedNow() {
    const asked = session.mode === 'note' ? session.target : null;
    const accept = asked ? getAcceptRange(asked) : null;
    return { asked, valid: accept ? validMidis(asked.string, asked.fret, accept) : [session.note.midi] };
  }

  /** MIDI pitches that would be accepted right now (empty when no question is open). */
  session.acceptedMidis = () => {
    if (session.state !== 'listening' || !session.note) return [];
    if (session.matcher) return session.matcher.expected();
    return [session.note.midi, ...acceptedNow().valid];
  };

  // Triads with host-picked voicings: the chord in every shape of target.voicings (all three, or one
  // placed shape when target.window is set), each shape low to high from the
  // thickest string. The clock, first try and hint count per shape (session.startedAt restarts).
  const nearMidis = (list) => list.flatMap(m => [m, m + 12, m - 12]);
  const slipOf = (midi) => { if (session.target && (session.target.run || session.target.window)) return undefined; const exp = session.matcher.expected(); return [12, -12].map(d => midi + d).find(m => exp.includes(m)); };

  function triadDetected(midi) {
    let r = session.matcher.feed(midi);
    if (r.status === 'wrong') { const fix = slipOf(midi); if (fix != null) r = session.matcher.feed(fix); }
    if (r.status === 'wrong') return;   // a wrong note counts only from stableDetected (fresh attack + stable hold)
    if (r.status === 'dup') { emit('dup', { shape: r.shape }); return; }
    if (r.status === 'step') {
      session.ring.current.push(r.voicing.notes[r.step - 1].midi);
      session.steps = voicingSteps(r.voicing);
      session.step = r.step;
      session.note = session.steps[r.step];
      session.wrongSeen = new Set();
      session.hintStage = Math.min(session.hintStage, 1);
      session.hintAnchor = now();
      emit('step', { step: r.step, total: 3, note: session.note, voicing: r.voicing });
      return;
    }
    const t = now();
    const ms = Math.max(1, session.held ? 0 : t - session.startedAt);
    const firstTry = !session.hadWrong, hinted = session.hintStage > 0 || session.shapeHinted;
    stats.total += 1;
    if (firstTry) stats.firstTry += 1;
    stats.times.push(ms);
    const info = { target: session.target, voicing: r.voicing, shape: r.shape, found: r.found, total: r.total, voicings: session.matcher.found, ms, firstTry, hinted };
    session.shapeHinted = false; session.hadWrong = false; session.wrongSeen = new Set();
    session.ring = { current: [], finished: r.voicing.notes.map(n => n.midi), finishedAt: t };
    if (r.status === 'shape') {
      session.step = 0;
      session.steps = voicingSteps(session.matcher.candidates[0]);
      session.note = session.steps[0];
      session.startedAt = t; session.hintAnchor = t; session.hintStage = 0;
      emit('shape', info);
      return;
    }
    session.state = 'resolved';
    session.resolvedAt = t;
    session.played = { voicing: r.voicing, voicings: session.matcher.found };
    emit('correct', { ...info, played: session.played });
  }

  /**
   * Triads, every steady pitch (not one per note): the only place a wrong note is counted.
   * Pitches still ringing are ignored (this shape's played notes; the last finished shape's for
   * RING_MS); anything else counts once per pitch per step, after a fresh attack held MISTAKE_HOLD_MS.
   */
  session.stableDetected = (midi, info = {}) => {
    if (session.state !== 'listening' || !session.matcher) return;
    if (session.matcher.expected().includes(midi) || slipOf(midi) != null) return;
    if (nearMidis(session.ring.current).includes(midi)) return;
    if (now() - session.ring.finishedAt < RING_MS && nearMidis(session.ring.finished).includes(midi)) return;
    if (!info.fresh || !(info.heldMs >= MISTAKE_HOLD_MS) || session.wrongSeen.has(midi)) return;
    session.wrongSeen.add(midi);
    session.hadWrong = true;
    stats.wrong += 1;
    const near = session.matcher.expected().reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a));
    const diff = midi - near;
    emit('wrong', { midi, name: midiToNoteName(midi), fret: -1, octaveOff: diff % 12 === 0 ? Math.round(diff / 12) : 0 });
  };

  session.noteDetected = (midi) => {
    if (session.state !== 'listening') return;
    if (session.matcher) { triadDetected(midi); return; }
    const { asked, valid } = acceptedNow();
    if (midi === session.note.midi || valid.includes(midi)) {
      session.played = asked ? { string: asked.string, fret: midi - STRINGS[asked.string].midi } : null;
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
      const ms = Math.max(1, session.held ? 0 : now() - session.startedAt);
      const firstTry = !session.hadWrong;
      stats.total += 1;
      if (firstTry) stats.firstTry += 1;
      stats.times.push(ms);
      session.state = 'resolved';
      session.resolvedAt = now();
      emit('correct', { target: session.target, played: session.played, ms, firstTry, hinted: session.hintStage > 0 });
      return;
    }
    if (session.wrongSeen.has(midi)) return;
    session.wrongSeen.add(midi);
    session.hadWrong = true;
    stats.wrong += 1;
    const nearest = valid.reduce((a, b) => (Math.abs(b - midi) < Math.abs(a - midi) ? b : a), session.note.midi);
    const diff = midi - nearest;
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
      if (!session.held && hintDelayMs != null && session.hintStage < session.hintStages && t - session.hintAnchor >= hintDelayMs) showHint();
    } else if (session.state === 'resolved') {
      const { pauseMs = 900 } = getSettings();
      if (t - session.resolvedAt >= (session.target && session.target.pauseMs != null ? session.target.pauseMs : pauseMs)) nextTarget();
    }
  };

  /** Time until the next hint stage (null when hints are off, done, or not listening). */
  session.hintProgress = () => {
    const { hintDelayMs } = getSettings();
    if (session.state !== 'listening' || hintDelayMs == null || session.hintStage >= session.hintStages) return null;
    const elapsed = session.held ? 0 : now() - session.hintAnchor;
    return { fraction: Math.min(1, Math.max(0, elapsed / hintDelayMs)), remainingMs: Math.max(0, hintDelayMs - elapsed) };
  };

  return session;
}
