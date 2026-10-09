// Microphone -> AudioWorklet pitch tracker -> cleaned pitch frames.
// Frames: {t, midi (float, or null when silent/unclear), cents (vs A440 grid), clarity, rms}

export function createTracker({ onFrame, onState = () => {}, clarityThreshold = 0.85, gate = 0.004, gain = 1.5 } = {}) {
  let ctx = null, stream = null, node = null, gainNode = null;
  let state = 'idle';
  const recent = [];     // last 3 midi values for a median
  let muted = false;

  function setState(s, detail) { state = s; onState(s, detail); }

  function handle(m) {
    let midi = null;
    if (!muted && m.hz > 0 && m.clarity >= clarityThreshold) midi = 69 + 12 * Math.log2(m.hz / 440);
    // 3-point median kills single-frame glitches without smoothing the vibrato
    recent.push(midi);
    if (recent.length > 3) recent.shift();
    const valid = recent.filter(v => v != null);
    let out = midi;
    if (valid.length === 3) out = [...valid].sort((a, b) => a - b)[1];
    onFrame({ t: m.t, midi: out, clarity: m.clarity, rms: m.rms });
  }

  return {
    get state() { return state; },
    get context() { return ctx; },

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
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      await ctx.resume();
      try {
        await ctx.audioWorklet.addModule(new URL('./pitch-worklet.js', import.meta.url));
      } catch (err) {
        setState('error', new Error('AudioWorklet not available: ' + (err && err.message)));
        return;
      }
      const source = ctx.createMediaStreamSource(stream);
      gainNode = ctx.createGain();
      gainNode.gain.value = gain;
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass'; highpass.frequency.value = 70; highpass.Q.value = 0.7;
      node = new AudioWorkletNode(ctx, 'pitch-tracker', { numberOfOutputs: 0, processorOptions: { hop: 256, gate } });
      node.port.onmessage = (e) => handle(e.data);
      source.connect(gainNode).connect(highpass).connect(node);
      setState('running');
    },

    stop() {
      if (node) { node.port.onmessage = null; node.disconnect(); }
      if (stream) stream.getTracks().forEach(t => t.stop());
      if (ctx) ctx.close();
      ctx = stream = node = gainNode = null;
      recent.length = 0;
      setState('idle');
    },

    setGain(v) { if (gainNode) gainNode.gain.value = v; },
    setGate(v) { if (node) node.port.postMessage({ gate: v }); },
    setMuted(v) { muted = v; },
  };
}
