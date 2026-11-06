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

test('hasLowerOctave catches a low E whose odd partials are almost gone', async () => {
  const { hasLowerOctave } = await import('../js/octave.js');
  // 82 Hz heard through a laptop mic: barely any fundamental or 3rd partial,
  // so correctOctave leaves the octave-up reading alone, but the trace is there.
  const buf = tone([0.08, 1, 0.12, 0.8, 0.1, 0.5], 82.41);
  assert.equal(correctOctave(buf, SR, 164.81), 164.81);
  assert.equal(hasLowerOctave(buf, SR, 164.81), true);
});

test('hasLowerOctave leaves a real note an octave up alone', async () => {
  const { hasLowerOctave } = await import('../js/octave.js');
  for (const partials of [[1, 0.6, 0.4, 0.2], [0.1, 1, 0.6, 0.4, 0.3]]) {
    assert.equal(hasLowerOctave(tone(partials, 164.81), SR, 164.81), false, `E3 ${partials}`);
    assert.equal(hasLowerOctave(tone(partials, 220), SR, 220), false, `A3 ${partials}`);
  }
});

import { correctTowardExpected } from '../js/octave.js';

test('correctTowardExpected drops to the expected note when the lower octave has energy', () => {
  const buf = tone([0.6, 1], 164.81);
  assert.equal(correctTowardExpected(buf, SR, 329.63, 164.81), 164.81);
});

test('correctTowardExpected leaves a pure higher note or an unrelated expectation alone', () => {
  const pure = tone([1], 329.63);
  assert.equal(correctTowardExpected(pure, SR, 329.63, 164.81), 329.63);
  const both = tone([0.6, 1], 164.81);
  assert.equal(correctTowardExpected(both, SR, 329.63, 196), 329.63);
});
