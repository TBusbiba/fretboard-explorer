// Defaults + localStorage persistence. Everything the UI can change lives here.

const KEY = 'fretboard-practice.settings.v2';

export const DEFAULTS = Object.freeze({
  mode: 'note',           // 'note' = find the named note; 'intervals' = find an interval from a root
  strings: [0, 1, 2, 3, 4, 5],
  fretFrom: 0,
  fretTo: 11,             // 0-11 covers every note once per string
  naturalsOnly: true,

  playNote: false,        // note mode: also play the target note after saying it
  intervals: ['octaveUp', 'octaveDown', 'fifth', 'majorThird', 'minorThird'],

  hintDelayMs: 5000,      // null = never
  pauseMs: 900,           // pause after a correct answer before the next target

  voice: true,
  voiceName: '',          // '' = browser default English voice
  voiceRate: 1,
  speakFeedback: true,

  gate: 0.007,            // RMS below this is silence
  clarity: 0.84,          // pitchy clarity threshold 0..1
  gain: 1.5,              // input gain multiplier
});

export function loadSettings() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = migrate(JSON.parse(raw));
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

// Older saved defaults that later versions relaxed. A saved value that still
// equals the old default was never deliberately chosen, so it follows the new one.
const RELAXED = { gate: [0.012], clarity: [0.9] };

function migrate(saved) {
  for (const [key, oldDefaults] of Object.entries(RELAXED)) {
    if (oldDefaults.includes(saved[key])) delete saved[key];
  }
  return saved;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or blocked storage: settings just won't persist.
  }
}

export function resetSettings() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return { ...DEFAULTS };
}
