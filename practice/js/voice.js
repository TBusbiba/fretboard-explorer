// Thin wrapper over speechSynthesis. Reports when it is speaking so the pitch
// detector can ignore the speaker output.

export function createVoice({ onSpeaking = () => {} } = {}) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  let speaking = false;
  let voices = [];

  function refreshVoices() {
    if (!supported) return;
    voices = speechSynthesis.getVoices()
      .filter(v => v.lang && v.lang.toLowerCase().startsWith('en'))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
  if (supported) {
    refreshVoices();
    speechSynthesis.addEventListener('voiceschanged', refreshVoices);
  }

  function setSpeaking(value) {
    if (speaking === value) return;
    speaking = value;
    onSpeaking(value);
  }

  return {
    supported,
    get speaking() { return speaking; },
    getVoices() { return voices; },

    /** Speak text, cancelling anything queued. Resolves when done. */
    speak(text, { voiceName = '', rate = 1 } = {}) {
      if (!supported) return Promise.resolve();
      speechSynthesis.cancel();
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        const v = voices.find(x => x.name === voiceName);
        if (v) u.voice = v;
        u.lang = v ? v.lang : 'en-US';
        u.rate = rate;
        u.onstart = () => setSpeaking(true);
        const done = () => { setSpeaking(false); resolve(); };
        u.onend = done;
        u.onerror = done;
        speechSynthesis.speak(u);
        // Browsers occasionally never fire onend. Force completion after a
        // generous estimate of the utterance length so the mic is never
        // muted for long.
        setTimeout(done, Math.min(3000, 600 + text.length * 70 / rate));
      });
    },

    cancel() {
      if (!supported) return;
      speechSynthesis.cancel();
      setSpeaking(false);
    },
  };
}
