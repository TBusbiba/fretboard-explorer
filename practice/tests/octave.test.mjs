import { test } from 'node:test';
import assert from 'node:assert/strict';
import { correctOctave, goertzel } from '../js/octave.js';
import { PitchDetector } from '../vendor/pitchy.js';
import { frequencyToMidi } from '../js/notes.js';

const SR = 48000, N = 4096;

function tone(partials, f0, noise = 0.002) {
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / SR;
    let v = noise * (Math.random() * 2 - 1);
    partials.forEach((a, k) => { v += a * Math.sin(2 * Math.PI * f0 * (k + 1) * t); });
    buf[i] = v * 0.3;
  }
  return buf;
}

test('goertzel measures the right bins', () => {
  const buf = tone([1], 220);
  assert.ok(goertzel(buf, SR, 220) > 20 * goertzel(buf, SR, 110));
  assert.ok(goertzel(buf, SR, 220) > 20 * goertzel(buf, SR, 330));
});

test('a clean fundamental is left alone', () => {
  for (const f of [82.41, 110, 196, 329.6, 659.3]) {
    const buf = tone([1, 0.5, 0.3], f);
    assert.equal(correctOctave(buf, SR, f), f);
  }
});

test('an octave-up detection on a weak-fundamental low note is corrected', () => {
  // The detector errs on the attack transient, which is hard to synthesize
  // faithfully, so feed the correction the octave-up value directly against a
  // low E whose fundamental is almost gone (what a laptop mic hears).
  for (const f0 of [82.41, 98, 110, 130.8]) {
    const buf = tone([0.08, 1, 0.6, 0.3], f0);
    const fixed = correctOctave(buf, SR, f0 * 2);
    assert.equal(frequencyToMidi(fixed), frequencyToMidi(f0), `f0 ${f0}`);
  }
});

test('the check is limited to the low range', () => {
  // A real B4 (494 Hz) handed in as if it were an octave-up error must not be halved.
  const buf = tone([0.08, 1, 0.6, 0.3], 246.9);
  assert.equal(correctOctave(buf, SR, 493.9), 493.9);
});

test('correction never drops below the instrument range', () => {
  const buf = tone([1, 1], 100);
  assert.equal(correctOctave(buf, SR, 100, { minHz: 70 }), 100); // 50 Hz would be below the low E
});
