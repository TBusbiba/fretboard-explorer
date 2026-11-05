// Microphone capture -> pitch detection -> steady-note events.
//
// A note is reported once the same MIDI number has been read MIN_HITS times
// over at least HOLD_MS. Stray low-confidence frames (common in the attack of
// a plucked note, and in thin high notes) do not reset the hold; only real
// silence or a different note does. A note is not reported again until the
// signal drops below the gate (so re-plucking the same note triggers again)
// or reset() is called. After reset() or a mute the same pitch still waits for
// silence or a fresh pluck (attack.js), so a ringing string cannot answer the next
// question.
//
// isMuted(now) returns true while the app's own sound is playing or has just
// stopped; readings are discarded then.
//
// getExpected() may return the MIDI note the app is waiting for. A low reading
// exactly an octave above it is taken as that note when the signal shows any
// trace of the lower octave: a laptop mic often loses a low string's
// fundamental, and the sound alone can't always settle the octave.

import { PitchDetector } from '../vendor/pitchy.js';
import { frequencyToMidi } from './notes.js';
import { correctOctave, hasLowerOctave } from './octave.js';
import { createAttackGuard } from './attack.js';

const FFT_SIZE = 4096;          // ~85 ms at 48 kHz: enough for the low E (82 Hz)
const HOLD_MS = 90;
const LOW_HOLD_MS = 200;      // below LOW_HZ: the attack is messier, wait longer and want more agreement
const LOW_HITS = 5;
const LOW_HZ = 260;           // covers strings 6 and 5 and their octave-up mistakes
const RECENT_MS = 300;        // window in which a lower-octave reading overrides a higher one
const MIN_HITS = 3;
const SILENCE_RESET_MS = 150;   // this long under the gate forgets the candidate
const STALE_HIT_MS = 250;       // no agreeing reading for this long forgets it too
const MIN_HZ = 70;              // just below low E
const MAX_HZ = 1400;            // above the highest fretted note we care about
const HIGHPASS_HZ = 70;         // strip room rumble so it doesn't count toward the gate

export function createPitchDetector({ getSettings, getExpected = () => null, isMuted = () => false, onNote, onLevel = () => {}, onState = () => {} }) {
  let ctx = null, stream = null, gainNode = null, analyser = null, detector = null;
  let buf = null;
  let rafId = 0;
  let state = 'idle'; // idle | starting | running | denied | error

  let candidate = null, candidateSince = 0, hits = 0, lastHitAt = 0, lastLoudAt = 0;
  let recent = []; // [midi, time] of recent accepted readings
  let reported = null;
  let ringing = null; // last low note reported; survives reset() until real silence
  const attack = createAttackGuard(); // the reported pitch is ignored until silence or a fresh pluck, across reset() and mutes

  function setState(s, detail) { state = s; onState(s, detail); }

  function resetHold() { candidate = null; candidateSince = 0; hits = 0; lastHitAt = 0; recent = []; }

  function frame() {
    rafId = requestAnimationFrame(frame);
    const { gate, clarity: clarityThreshold, gain } = getSettings();
    if (gainNode.gain.value !== gain) gainNode.gain.value = gain;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    const rms = Math.sqrt(sum / buf.length);
    onLevel(rms, gate);

    const now = performance.now();
    const muted = isMuted(now);
    attack.update(rms, gate, now, muted);
    // Speakers playing or just stopped (see mic-gate.js): hear nothing, and forget
    // every held, reported or "ringing" note so none carries into the next question.
    if (muted) { resetHold(); reported = null; ringing = null; return; }
    if (rms < gate) {
      if (now - lastLoudAt > SILENCE_RESET_MS) { resetHold(); reported = null; ringing = null; }
      return;
    }
    lastLoudAt = now;

    const [rawHz, clarity] = detector.findPitch(buf, ctx.sampleRate);
    if (clarity < clarityThreshold || rawHz < MIN_HZ || rawHz > MAX_HZ) {
      if (now - lastHitAt > STALE_HIT_MS) resetHold();
      return;
    }
    let hz = correctOctave(buf, ctx.sampleRate, rawHz, { minHz: MIN_HZ });
    const expected = getExpected();
    if (expected != null && frequencyToMidi(hz) === expected + 12 && hz < LOW_HZ && hasLowerOctave(buf, ctx.sampleRate, hz)) hz /= 2;

    const midi = frequencyToMidi(hz);
    recent.push([midi, now]);
    while (recent.length && now - recent[0][1] > RECENT_MS) recent.shift();
    if (midi !== candidate) { candidate = midi; candidateSince = now; hits = 0; }
    hits += 1;
    lastHitAt = now;
    const low = hz < LOW_HZ;
    const hold = low ? LOW_HOLD_MS : HOLD_MS;
    const need = low ? LOW_HITS : MIN_HITS;
    if (hits >= need && now - candidateSince >= hold && reported !== midi) {
      // Octave-up errors on low strings are transient: if the lower octave was
      // read at all while this note settled, that is the real note.
      let final = midi;
      if (low && recent.filter(([m]) => m === midi - 12).length >= 2) final = midi - 12;
      if (reported === final) return;
      // A low string fades towards its octave-up partial; that is still the old note
      // ringing, unless the octave is exactly what the app is asking for next.
      if (low && ringing != null && final === ringing + 12 && expected !== final) return;
      if (attack.blocks(final)) return;
      reported = final;
      attack.arm(final, rms, now);
      ringing = low ? final : null;
      onNote(final, hz, clarity);
    }
  }

  return {
    get state() { return state; },

    async start() {
      if (state === 'running' || state === 'starting') return;
      setState('starting');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (err) {
        setState(err && err.name === 'NotAllowedError' ? 'denied' : 'error', err);
        return;
      }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      await ctx.resume();
      const source = ctx.createMediaStreamSource(stream);
      gainNode = ctx.createGain();
      gainNode.gain.value = getSettings().gain;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = HIGHPASS_HZ;
      highpass.Q.value = 0.7;
      analyser = ctx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0;
      source.connect(gainNode).connect(highpass).connect(analyser);
      buf = new Float32Array(analyser.fftSize);
      detector = PitchDetector.forFloat32Array(analyser.fftSize);
      resetHold(); reported = null; attack.clear();
      setState('running');
      rafId = requestAnimationFrame(frame);
    },

    stop() {
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close();
      ctx = stream = gainNode = analyser = detector = null;
      resetHold(); reported = null; attack.clear();
      setState('idle');
    },

    /** Forget the last reported note so the same pitch can trigger again. */
    reset() { resetHold(); reported = null; },
  };
}
