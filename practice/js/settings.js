// Defaults + localStorage persistence. Everything the UI can change lives here.

const KEY = 'fretboard-practice.settings.v2';

export const DEFAULTS = Object.freeze({
  mode: 'note',           // 'note' | 'intervals' | 'arpeggios' | 'triads'
  strings: [0, 1, 2, 3, 4, 5],
  fretFrom: 0,
  fretTo: 11,             // 0-11 covers every note once per string
  naturalsOnly: true,
  noteMode: 'path',       // note mode: 'path' (the level path) | 'custom' (pick the notes and strings)
  notes: [0, 2, 4, 5, 7, 9, 11], // note mode: pitch classes asked (0 = C ... 11 = B); default C D E F G A B

  showStringNames: true,  // note mode: string name labels on the drill fretboard
  playNote: false,        // note mode: also play the target note after saying it
  intervals: ['octaveUp', 'octaveDown', 'fifth', 'majorThird', 'minorThird'], // pool for 'random'
  intervalPick: 'random', // 'random' or one interval id
  chords: ['major', 'minor', 'dom7', 'min7', 'maj7'], // pool for 'random' in arpeggio mode
  chordPick: 'random',
  triads: ['major', 'minor', 'dim', 'aug', 'dom7', 'min7'],
  triadPick: ['major', 'minor', 'dim', 'aug', 'dom7', 'min7'], // selected triad types; each question picks one at random
  triadGroups: ['654', '543', '432', '321'],
  triadInversion: 'random', // 'random' | 0 | 1 | 2 | 'cycle'
  showShapes: false,      // triads mode: the movable triad-shape cheat sheet inside the prompt card
  playNotes: true,        // intervals, arpeggios, triads: play the question's notes after naming it; off = only speak it

  hintDelayMs: 5000,      // null = never
  pauseMs: 900,           // pause after a correct answer before the next target

  voice: true,
  voiceName: 'adam',      // 'adam' = recorded clips (TTS where a phrase has none); '__browser' = browser default voice; else a browser voice name
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

const NATURALS = [0, 2, 4, 5, 7, 9, 11];
const ALL_NOTES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

export function migrate(saved) {
  for (const [key, oldDefaults] of Object.entries(RELAXED)) {
    if (oldDefaults.includes(saved[key])) delete saved[key];
  }
  if (typeof saved.triadPick === 'string' && saved.triadPick !== 'random') saved.triadPick = [saved.triadPick];
  else if (!Array.isArray(saved.triadPick) || saved.triadPick.length === 0) delete saved.triadPick;
  // Settings saved before the note chips existed ask whatever the old naturals/sharps switch allowed.
  if (!Array.isArray(saved.notes) || !saved.notes.every(n => Number.isInteger(n) && n >= 0 && n <= 11) || saved.notes.length === 0) {
    saved.notes = saved.naturalsOnly === false ? [...ALL_NOTES] : [...NATURALS];
  } else {
    saved.notes = ALL_NOTES.filter(n => saved.notes.includes(n));
  }
  if (saved.noteMode !== 'path' && saved.noteMode !== 'custom') delete saved.noteMode;
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
