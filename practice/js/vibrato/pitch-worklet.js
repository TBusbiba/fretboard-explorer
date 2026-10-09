// AudioWorklet pitch tracker: runs the detector every `hop` samples on a
// sliding window and posts {t, hz, clarity, rms} frames. Runs on the audio
// thread, so timing is sample-accurate and independent of screen refresh.

import { PitchDetector } from '../../vendor/pitchy.js';
import { correctOctave } from '../octave.js';

const WINDOW = 2048;

class PitchTracker extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const o = (options && options.processorOptions) || {};
    this.hop = o.hop || 256;
    this.gate = o.gate ?? 0.004;
    this.buf = new Float32Array(WINDOW);
    this.since = 0;
    this.detector = PitchDetector.forFloat32Array(WINDOW);
    this.port.onmessage = (e) => { if (e.data && e.data.gate != null) this.gate = e.data.gate; };
  }

  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    this.buf.copyWithin(0, ch.length);
    this.buf.set(ch, WINDOW - ch.length);
    this.since += ch.length;
    if (this.since < this.hop) return true;
    this.since = 0;

    let sum = 0;
    for (let i = 0; i < WINDOW; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / WINDOW);
    if (rms < this.gate) { this.port.postMessage({ t: currentTime, hz: 0, clarity: 0, rms }); return true; }
    const [raw, clarity] = this.detector.findPitch(this.buf, sampleRate);
    const hz = raw > 0 ? correctOctave(this.buf, sampleRate, raw, { minHz: 70 }) : 0;
    this.port.postMessage({ t: currentTime, hz, clarity, rms });
    return true;
  }
}

registerProcessor('pitch-tracker', PitchTracker);
