// Octave-error correction for pitch detection. Pure functions, no DOM.
//
// Plucked low strings often start with a weak fundamental, so a detector can
// report the 2nd harmonic (an octave up). A true fundamental f has nothing at
// f/2 or 1.5f; an octave-up mistake has the real note at f/2 and its strong
// 3rd harmonic at 1.5f. Measuring those two spots tells the cases apart.

/** Magnitude of `freq` in `buf` (Hann-windowed Goertzel). */
export function goertzel(buf, sampleRate, freq) {
  const n = buf.length;
  const w = (2 * Math.PI * freq) / sampleRate;
  const coeff = 2 * Math.cos(w);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < n; i++) {
    const win = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const s0 = buf[i] * win + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2));
}

/**
 * Return `hz`, or `hz / 2` when the signal shows the sub-harmonic evidence of
 * an octave-up error. `minHz` keeps the corrected pitch inside the instrument;
 * `maxHz` limits the check to the low range where the detector actually errs
 * (attack transients on strings 6 and 5).
 */
export function correctOctave(buf, sampleRate, hz, { minHz = 70, maxHz = 270, ratio = 0.2 } = {}) {
  const half = hz / 2;
  // Only the low strings suffer from this; never second-guess higher detections.
  if (half < minHz || hz > maxHz) return hz;
  const atF = goertzel(buf, sampleRate, hz);
  if (atF === 0) return hz;
  const atHalf = goertzel(buf, sampleRate, half);
  const at3Half = goertzel(buf, sampleRate, half * 3);
  return atHalf > ratio * atF || at3Half > ratio * atF ? half : hz;
}
