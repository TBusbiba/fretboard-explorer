// Plucked-string synth (Karplus–Strong) for playing reference notes.
// Reports when it is playing so the pitch detector can ignore the speakers.

import { midiToFrequency } from './notes.js';

export function createSound({ onPlaying = () => {} } = {}) {
  let ctx = null;
  let playing = 0;

  async function context() {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
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
    async play(midi, { duration = 1.6, volume = 0.6 } = {}) {
      const c = await context();
      const sr = c.sampleRate;
      const freq = midiToFrequency(midi);
      const period = Math.max(2, Math.round(sr / freq));
      const length = Math.round(sr * duration);
      const buffer = c.createBuffer(1, length, sr);
      const d = buffer.getChannelData(0);

      // Noise burst, then the averaging delay line. `decay` is chosen so every
      // pitch rings for roughly the same time (high notes would otherwise die fast).
      for (let i = 0; i < period; i++) d[i] = Math.random() * 2 - 1;
      const decay = Math.pow(0.002, period / (sr * duration));
      for (let i = period + 1; i < length; i++) d[i] = decay * 0.5 * (d[i - period] + d[i - period - 1]);
      // Short fade-out so the tail never clicks.
      const fade = Math.min(length, Math.round(sr * 0.05));
      for (let i = 0; i < fade; i++) d[length - 1 - i] *= i / fade;

      const source = c.createBufferSource();
      source.buffer = buffer;
      const gain = c.createGain();
      gain.gain.value = volume;
      const tone = c.createBiquadFilter();
      tone.type = 'lowpass';
      tone.frequency.value = 3500;
      source.connect(tone).connect(gain).connect(c.destination);

      setPlaying(+1);
      return new Promise((resolve) => {
        source.onended = () => { setPlaying(-1); resolve(); };
        source.start();
      });
    },

    /** Play notes one after another (short plucks), e.g. an arpeggio cue. */
    async playSequence(midis, { duration = 0.5, gap = 0.22, volume = 0.5 } = {}) {
      for (let i = 0; i < midis.length; i++) {
        const p = this.play(midis[i], { duration, volume });
        if (i < midis.length - 1) await new Promise(r => setTimeout(r, gap * 1000));
        else await p;
      }
    },

    get playing() { return playing > 0; },
  };
}
