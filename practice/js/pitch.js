// Microphone capture -> pitch detection -> steady-note events.
//
// A note is reported once the same MIDI number has been read MIN_HITS times
// over at least HOLD_MS. Stray low-confidence frames (common in the attack of
// a plucked note, and in thin high notes) do not reset the hold; only real
// silence or a different note does. A note is not reported again until the
// signal drops below the gate (so re-plucking the same note triggers again)
// or reset() is called.

import { PitchDetector } from '../vendor/pitchy.js';
import { frequencyToMidi } from './notes.js';
import { correctOctave } from './octave.js';

const FFT_SIZE = 4096;          // ~85 ms at 48 kHz: enough for the low E (82 Hz)
const HOLD_MS = 90;
const LOW_HOLD_MS = 150;      // below LOW_HZ: the attack is messier, wait a little longer
const LOW_HZ = 120;
const MIN_HITS = 3;
const SILENCE_RESET_MS = 150;   // this long under the gate forgets the candidate
const STALE_HIT_MS = 250;       // no agreeing reading for this long forgets it too
const MIN_HZ = 70;              // just below low E
const MAX_HZ = 1400;            // above the highest fretted note we care about
const HIGHPASS_HZ = 70;         // strip room rumble so it doesn't count toward the gate

export function createPitchDetector({ getSettings, onNote, onLevel = () => {}, onState = () => {} }) {
  let ctx = null, stream = null, gainNode = null, analyser = null, detector = null;
  let buf = null;
  let rafId = 0;
  let muted = false;
  let state = 'idle'; // idle | starting | running | denied | error

  let candidate = null, candidateSince = 0, hits = 0, lastHitAt = 0, lastLoudAt = 0;
  let reported = null;

  function setState(s, detail) { state = s; onState(s, detail); }

  function resetHold() { candidate = null; candidateSince = 0; hits = 0; lastHitAt = 0; }

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
    if (muted) { resetHold(); return; }
    if (rms < gate) {
      if (now - lastLoudAt > SILENCE_RESET_MS) { resetHold(); reported = null; }
      return;
    }
    lastLoudAt = now;

    const [rawHz, clarity] = detector.findPitch(buf, ctx.sampleRate);
    if (clarity < clarityThreshold || rawHz < MIN_HZ || rawHz > MAX_HZ) {
      if (now - lastHitAt > STALE_HIT_MS) resetHold();
      return;
    }
    const hz = correctOctave(buf, ctx.sampleRate, rawHz, { minHz: MIN_HZ });

    const midi = frequencyToMidi(hz);
    if (midi !== candidate) { candidate = midi; candidateSince = now; hits = 0; }
    hits += 1;
    lastHitAt = now;
    const hold = hz < LOW_HZ ? LOW_HOLD_MS : HOLD_MS;
    if (hits >= MIN_HITS && now - candidateSince >= hold && reported !== midi) {
      reported = midi;
      onNote(midi, hz, clarity);
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
      resetHold(); reported = null;
      setState('running');
      rafId = requestAnimationFrame(frame);
    },

    stop() {
      cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close();
      ctx = stream = gainNode = analyser = detector = null;
      resetHold(); reported = null;
      setState('idle');
    },

    /** Forget the last reported note so the same pitch can trigger again. */
    reset() { resetHold(); reported = null; },

    setMuted(value) { muted = value; if (value) resetHold(); },
  };
}
