// Defaults + localStorage persistence. Everything the UI can change lives here.

const KEY = 'fretboard-practice.settings.v2';

export const DEFAULTS = Object.freeze({
  mode: 'note',           // 'note' | 'intervals' | 'arpeggios' | 'triads' | 'scales'
  strings: [0, 1, 2, 3, 4, 5],
  fretFrom: 0,
  fretTo: 11,             // 0-11 covers every note once per string
  naturalsOnly: true,
  noteMode: 'path',       // note mode: 'path' (the level path) | 'custom' (pick the notes and strings)
  notes: [0, 2, 4, 5, 7, 9, 11], // note mode: pitch classes asked (0 = C ... 11 = B); default C D E F G A B

  showStringNames: true,  // note mode: string name labels on the drill fretboard
  sayStringNames: false,  // note mode, Custom: prompts say "A string" instead of "String 5" (the Path does from level 6)
  playNote: false,        // note mode: also play the target note after saying it
  intervals: ['octaveUp', 'octaveDown', 'fifth', 'majorThird', 'minorThird'], // pool for 'random'
  intervalPick: 'random', // 'random' or one interval id
  chords: ['major', 'minor', 'dom7', 'min7', 'maj7'], // pool for 'random' in arpeggio mode
  chordPick: 'random',
  triads: ['major', 'minor', 'dim', 'aug', 'dom7', 'min7'],
  triadPick: ['major', 'minor', 'dim', 'aug', 'dom7', 'min7'], // selected triad types; each question picks one at random
  triadMode: 'path',      // triads: 'path' (the 11 levels) | 'custom' (pick qualities and string groups)
  triadQualities: ['major', 'minor'], // triads, Custom: which qualities are asked
  triadGroups: ['654', '543', '432', '321'], // triads, Custom: which string groups are asked
  scalesMode: 'path',     // scales: 'path' (the 11 levels) | 'drill' (pick scale, root and box)
  scaleKind: 'minorPentatonic', // scales, Drill: minorPentatonic | majorPentatonic | major
  scaleRoot: 9,           // scales, Drill: root pitch class (9 = A)
  scaleBox: 1,            // scales, Drill: box / position 1-5
  showShapes: false,      // triads: the big Show-shapes panel in place of the prompt strip
  playNotes: false,       // intervals, arpeggios, triads: play the question's notes after naming it; off (default) = only speak it
  playNotesOffDone: true, // internal: the one-time switch of saved settings to playNotes off has run

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
  // Play the notes became opt-in: switch everyone's saved choice off once; they can turn it back on.
  if (!saved.playNotesOffDone) { saved.playNotes = false; saved.playNotesOffDone = true; }
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
  if (saved.triadMode !== 'path' && saved.triadMode !== 'custom') delete saved.triadMode;
  const keep = (key, valid) => {
    if (!Array.isArray(saved[key])) { delete saved[key]; return; }
    const ok = valid.filter(v => saved[key].includes(v));
    if (ok.length) saved[key] = ok; else delete saved[key];
  };
  keep('triadQualities', ['major', 'minor']);
  keep('triadGroups', ['654', '543', '432', '321']);
  if (saved.scalesMode !== 'path' && saved.scalesMode !== 'drill') delete saved.scalesMode;
  if (!['minorPentatonic', 'majorPentatonic', 'major'].includes(saved.scaleKind)) delete saved.scaleKind;
  if (!Number.isInteger(saved.scaleRoot) || saved.scaleRoot < 0 || saved.scaleRoot > 11) delete saved.scaleRoot;
  if (!Number.isInteger(saved.scaleBox) || saved.scaleBox < 1 || saved.scaleBox > 5) delete saved.scaleBox;
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
