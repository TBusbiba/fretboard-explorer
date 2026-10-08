// Plucked-string synth for playing reference notes: extended Karplus–Strong
// (pick-position comb, frequency-dependent damping, fractional-delay tuning,
// a lightly detuned second string) through a small "body" (two resonances and
// a short synthetic reverb). Reports when it is playing so the pitch detector
// can ignore the speakers.

import { midiToFrequency } from './notes.js';

export function createSound({ onPlaying = () => {} } = {}) {
  let ctx = null;
  let body = null;      // input node of the body/reverb chain
  let playing = 0;

  async function context() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      body = buildBody(ctx);
    }
    if (ctx.state !== 'running') await ctx.resume();
    return ctx;
  }

  function setPlaying(delta) {
    const was = playing > 0;
    playing = Math.max(0, playing + delta);
    const is = playing > 0;
    if (was !== is) onPlaying(is);
  }

  return {
    /** Play a note. Resolves when it has rung out. */
    async play(midi, { duration = 1.8, volume = 0.6 } = {}) {
      const c = await context();
      const freq = midiToFrequency(midi);
      const buffer = c.createBuffer(1, Math.round(c.sampleRate * duration), c.sampleRate);
      const d = buffer.getChannelData(0);
      // Two strings a few cents apart read as one richer string.
      renderString(d, c.sampleRate, freq, duration, 1.0);
      renderString(d, c.sampleRate, freq * Math.pow(2, 3 / 1200), duration, 0.35);

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      gain.gain.value = volume;
      source.connect(gain).connect(body);

      setPlaying(+1);
      return new Promise((resolve) => {
        source.onended = () => { setPlaying(-1); resolve(); };
        source.start();
      });
    },

    /** Play notes one after another (short plucks), e.g. an arpeggio cue. */
    async playSequence(midis, { duration = 0.9, gap = 0.22, volume = 0.5 } = {}) {
      for (let i = 0; i < midis.length; i++) {
        const p = this.play(midis[i], { duration, volume });
        if (i < midis.length - 1) await new Promise(r => setTimeout(r, gap * 1000));
        else await p;
      }
    },

    get playing() { return playing > 0; },
  };
}

// Mix one plucked string into `out`.
function renderString(out, sr, freq, duration, amp) {
  const length = out.length;
  const period = sr / freq;                 // fractional
  const w = 2 * Math.PI * freq / sr;
  // Damping one-pole inside the loop: more for higher pitches so their upper
  // harmonics fade first. It also adds delay and loss at the fundamental,
  // which the delay length and the decay factor below compensate for.
  const damp = Math.min(0.85, 0.15 + freq / 1500);
  const k = 1 - damp;
  const lpDelay = Math.atan2(k * Math.sin(w), 1 - k * Math.cos(w)) / w;
  const lpGain = damp / Math.sqrt(1 - 2 * k * Math.cos(w) + k * k);
  const avgGain = Math.abs(Math.cos(w / 2));
  const loopLen = period - 0.5 - lpDelay;   // the averaging filter adds 0.5
  const n = Math.floor(loopLen);
  const frac = loopLen - n;
  if (n < 2) return;

  // Excitation: noise, softened (one-pole lowpass) and combed by the pick
  // position (~1/6 of the string from the bridge gives a classic timbre).
  const ex = new Float32Array(n + 2);
  let lp = 0;
  for (let i = 0; i < ex.length; i++) { lp += 0.5 * ((Math.random() * 2 - 1) - lp); ex[i] = lp; }
  const pick = Math.max(1, Math.round(0.16 * period));
  for (let i = ex.length - 1; i >= pick; i--) ex[i] -= ex[i - pick];
  // 2 ms fade-in so the attack is a pluck, not a click
  const att = Math.max(1, Math.round(sr * 0.002));
  for (let i = 0; i < Math.min(att, ex.length); i++) ex[i] *= i / att;
  // Exactly zero-mean: any DC would ring longer than the note itself.
  let mean = 0;
  for (let i = 0; i < ex.length; i++) mean += ex[i];
  mean /= ex.length;
  for (let i = 0; i < ex.length; i++) ex[i] -= mean;

  // Per-period gain so the fundamental rings for ~`duration` after the two
  // loop filters have taken their share.
  const decay = Math.min(0.9995, Math.pow(0.003, period / (sr * duration)) / (lpGain * avgGain));

  const y = new Float32Array(length);
  let prev = 0;
  for (let i = 0; i < length; i++) {
    let v = i < ex.length ? ex[i] : 0;
    if (i > n + 2) {
      const a = 0.5 * (y[i - n] + y[i - n - 1]);
      const b = 0.5 * (y[i - n - 1] + y[i - n - 2]);
      v += decay * ((1 - frac) * a + frac * b);
    }
    prev += damp * (v - prev);
    y[i] = prev;
  }
  // DC blocker (~15 Hz), outside the loop so it cannot affect tuning
  let xPrev = 0, hpPrev = 0;
  for (let i = 0; i < length; i++) { const v = y[i] - xPrev + 0.998 * hpPrev; xPrev = y[i]; hpPrev = v; y[i] = v; }
  // normalise and mix
  let peak = 0;
  for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(y[i]));
  const g = peak > 0 ? amp / peak : 0;
  const fade = Math.min(length, Math.round(sr * 0.05));
  for (let i = 0; i < length; i++) {
    const env = i >= length - fade ? (length - 1 - i) / fade : 1;
    out[i] += y[i] * g * env;
  }
}

// Guitar body: two low resonances, a gentle top roll-off, and a short
// synthetic reverb for air. Returns the node to connect sources to.
function buildBody(c) {
  const input = c.createGain();
  const r1 = c.createBiquadFilter(); r1.type = 'peaking'; r1.frequency.value = 105; r1.Q.value = 4; r1.gain.value = 6;
  const r2 = c.createBiquadFilter(); r2.type = 'peaking'; r2.frequency.value = 215; r2.Q.value = 3; r2.gain.value = 4;
  const tone = c.createBiquadFilter(); tone.type = 'lowpass'; tone.frequency.value = 4800; tone.Q.value = 0.6;
  const dry = c.createGain(); dry.gain.value = 0.85;
  const wet = c.createGain(); wet.gain.value = 0.22;
  const verb = c.createConvolver();
  const len = Math.round(c.sampleRate * 0.35);
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.5) * 0.5;
  }
  verb.buffer = ir;
  const out = c.createGain(); out.gain.value = 0.9;
  input.connect(r1).connect(r2).connect(tone);
  tone.connect(dry).connect(out);
  tone.connect(verb).connect(wet).connect(out);
  out.connect(c.destination);
  return input;
}
