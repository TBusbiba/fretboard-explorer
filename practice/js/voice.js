// Speaks prompts: the recorded Adam clips when every phrase of the text has one
// (audio/voice/), else speechSynthesis. Reports when it is speaking so the pitch
// detector can ignore the speaker output.

import { clipFiles } from './clips.js';

const CLIP_DIR = new URL('../audio/voice/', import.meta.url);
const CLIP_REV = 8; // bump after re-recording clips so browsers drop cached copies
export const CLIP_VOICE = 'adam';           // the voice picker's value for the recorded clips
export const usesClips = (voiceName) => voiceName === CLIP_VOICE || voiceName === '';
const CLIP_TIMEOUT_MS = 8000;               // a clip that never ends must not mute the mic for good
const WAIT_MS = 4000;                       // longest a prompt waits for a clip still playing

export function createVoice({ onSpeaking = () => {} } = {}) {
  const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const supported = ttsSupported || typeof Audio === 'function';   // recorded clips need no speechSynthesis
  let speaking = false;
  let voices = [];
  let manifest = {};
  const manifestReady = typeof fetch === 'function'
    ? fetch(new URL(`manifest.json?v=${CLIP_REV}`, CLIP_DIR)).then(r => (r.ok ? r.json() : {})).then(m => { manifest = m; }).catch(() => {})
    : Promise.resolve();
  const cache = new Map();   // file -> HTMLAudioElement
  let run = 0;               // bumped by every speak()/cancel(): a stale clip chain stops itself
  let current = null;        // the clip playing now
  let clipDone = null;       // resolves when the clip chain ends

  function refreshVoices() {
    if (!ttsSupported) return;
    voices = speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (ttsSupported) {
    refreshVoices();
    speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }

  function setSpeaking(value) {
    if (speaking === value) return;
    speaking = value;
    onSpeaking(value);
  }

  function audioFor(file) {
    let a = cache.get(file);
    if (!a) {
      a = new Audio(new URL(`${file}?v=${CLIP_REV}`, CLIP_DIR).href);
      a.preload = 'auto';
      cache.set(file, a);
    }
    return a;
  }

  function playOne(file, rate, onStart) {
    return new Promise((resolve, reject) => {
      const a = audioFor(file);
      current = a;
      a.playbackRate = rate;
      a.currentTime = 0;
      let timer = 0;
      const finish = (fn, arg) => {
        clearTimeout(timer);
        a.removeEventListener('ended', onEnd); a.removeEventListener('error', onErr); a.removeEventListener('pause', onPause);
        if (current === a) current = null;
        fn(arg);
      };
      const onEnd = () => finish(resolve);
      const onErr = () => finish(reject, new Error('clip failed'));
      const onPause = () => { if (!a.ended) finish(resolve); };   // cancel() paused it
      a.addEventListener('ended', onEnd); a.addEventListener('error', onErr); a.addEventListener('pause', onPause);
      timer = setTimeout(() => finish(resolve), CLIP_TIMEOUT_MS);
      a.play().then(() => { if (onStart) onStart(); }, err => finish(reject, err));
    });
  }

  /** Play the clips back to back. Resolves true when played (or cancelled), false when the very first could not start. */
  async function playClips(files, rate, my, onPromptStart) {
    setSpeaking(true);
    let first = true;
    try {
      for (let i = 0; i < files.length; i++) {
        if (my !== run) return true;
        try { await playOne(files[i], rate, i === files.length - 1 ? onPromptStart : null); } catch (err) { if (first) return false; return true; }
        first = false;
      }
      return true;
    } finally {
      if (my === run) setSpeaking(false);
    }
  }

  function speakTts(text, rate, voiceName, onPromptStart) {
    if (!ttsSupported) return Promise.resolve();
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      const v = voices.find(x => x.name === voiceName);
      if (v) u.voice = v;
      u.lang = v ? v.lang : 'en-US';
      u.rate = rate;
      u.onstart = () => { setSpeaking(true); if (onPromptStart) onPromptStart(); };
      const done = () => { setSpeaking(false); resolve(); };
      u.onend = done;
      u.onerror = done;
      speechSynthesis.speak(u);
      // Browsers occasionally never fire onend. Force completion after a
      // generous estimate of the utterance length so the mic is never
      // muted for long.
      setTimeout(done, Math.min(3000, 600 + text.length * 70 / rate));
    });
  }

  return {
    supported,
    clipsReady: () => manifestReady,
    /** The clip files for this text, or null (no clip for some phrase). Empty until the manifest has loaded. */
    clipsFor: (text) => clipFiles(text, manifest),

    /** Fetch the clips for these texts ahead of time so the first prompt does not lag. */
    async preload(texts) {
      await manifestReady;
      for (const t of texts) {
        const files = clipFiles(t, manifest);
        if (files) files.forEach(audioFor);
      }
    },

    get speaking() { return speaking; },
    getVoices() { return voices; },

    /**
     * Speak text, cancelling anything playing. Resolves when done. With the recorded
     * voice every phrase of the text that has a clip is played; if any phrase lacks
     * one the whole text goes to speechSynthesis (or, with `clipsOnly`, stays silent).
     * `onPromptStart` is called once when the last phrase starts playing (or the TTS utterance starts).
     * `wait` lets a clip still playing finish first instead of cutting it off.
     */
    async speak(text, { voiceName = CLIP_VOICE, rate = 1, clipsOnly = false, wait = false, onPromptStart = null } = {}) {
      let started = false;   // fires once, when the last phrase (the prompt) begins playing
      const promptStart = onPromptStart ? () => { if (!started) { started = true; onPromptStart(); } } : null;
      const clips = usesClips(voiceName);
      if (clips) await manifestReady;
      const files = clips ? clipFiles(text, manifest) : null;
      if (clipsOnly && !files) return;
      if (wait && clipDone) {
        const mine = clipDone;
        await Promise.race([mine, new Promise(r => setTimeout(r, WAIT_MS))]);
      }
      const my = ++run;
      if (current) { current.pause(); current = null; }
      if (files) {
        const p = playClips(files, rate, my, promptStart);
        const tracked = p.then(() => {}, () => {});
        clipDone = tracked;
        tracked.then(() => { if (clipDone === tracked) clipDone = null; });
        if (ttsSupported && speechSynthesis.speaking) speechSynthesis.cancel();
        if (await p) return;
        if (clipsOnly || my !== run) return;
      }
      clipDone = null;
      return speakTts(text, rate, clips ? '' : voiceName, promptStart);
    },

    cancel() {
      run++;
      if (current) { current.pause(); current = null; }
      clipDone = null;
      if (ttsSupported) speechSynthesis.cancel();
      setSpeaking(false);
    },
  };
}
