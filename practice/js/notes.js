// Note math. Pure functions, no DOM. String index 0 is the high E (top of the
// fretboard as drawn), 5 is the low E — same convention as the main app.

export const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];

export const STRINGS = [
  { index: 0, number: 1, name: 'E', label: 'high E', midi: 64 },
  { index: 1, number: 2, name: 'B', label: 'B', midi: 59 },
  { index: 2, number: 3, name: 'G', label: 'G', midi: 55 },
  { index: 3, number: 4, name: 'D', label: 'D', midi: 50 },
  { index: 4, number: 5, name: 'A', label: 'A', midi: 45 },
  { index: 5, number: 6, name: 'E', label: 'low E', midi: 40 },
];

export const FRET_COUNT = 22; // frets 0..21

export function midiToFrequency(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function frequencyToMidi(freq) {
  return Math.round(69 + 12 * Math.log2(freq / 440));
}

export function midiToNoteName(midi) {
  return NOTE_NAMES[((midi % 12) + 12) % 12];
}

export function midiToOctave(midi) {
  return Math.floor(midi / 12) - 1;
}

export function noteAt(string, fret) {
  const midi = STRINGS[string].midi + fret;
  return { name: midiToNoteName(midi), midi, octave: midiToOctave(midi) };
}

export function isNatural(name) {
  return !name.includes('♯');
}

export function spokenName(name) {
  return name.replace('♯', ' sharp');
}

// Find the first fret on `string` whose pitch is `midi`, or -1.
export function fretForMidi(string, midi) {
  const fret = midi - STRINGS[string].midi;
  return fret >= 0 && fret < FRET_COUNT ? fret : -1;
}

/**
 * Pick a random {string, fret} target.
 * @param {{strings:number[], fretFrom:number, fretTo:number, naturalsOnly:boolean}} opts
 * @param {{string:number, fret:number}|null} previous  avoided when any alternative exists
 * @param {() => number} rng  returns [0,1)
 */
export function pickTarget(opts, previous, rng = Math.random) {
  const candidates = [];
  for (const string of opts.strings) {
    for (let fret = opts.fretFrom; fret <= opts.fretTo; fret++) {
      const { name } = noteAt(string, fret);
      if (opts.naturalsOnly && !isNatural(name)) continue;
      candidates.push({ string, fret });
    }
  }
  if (candidates.length === 0) return null;
  const fresh = previous
    ? candidates.filter(c => !(c.string === previous.string && c.fret === previous.fret))
    : candidates;
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(rng() * pool.length)];
}

// ---------- intervals ----------
// "Up a string" means toward string 1 (higher pitch). Tips use string numbers.
export const INTERVALS = [
  {
    id: 'octaveUp', semitones: 12, label: 'Octave', arrow: '↑', spoken: 'the octave above',
    tips: [
      'From string 6 or 5: two strings up, two frets higher (string 6 fret 3 → string 4 fret 5).',
      'From string 4 or 3: two strings up, three frets higher (string 4 fret 5 → string 2 fret 8).',
      'Same string: 12 frets higher.',
    ],
  },
  {
    id: 'octaveDown', semitones: -12, label: 'Octave', arrow: '↓', spoken: 'the octave below',
    tips: [
      'From string 4 or 3: two strings down, two frets lower (string 4 fret 5 → string 6 fret 3).',
      'From string 2 or 1: two strings down, three frets lower (string 2 fret 8 → string 4 fret 5).',
      'Same string: 12 frets lower.',
    ],
  },
  {
    id: 'fifth', semitones: 7, label: '5th', arrow: '↑', spoken: 'the fifth above',
    tips: [
      'Next string up, two frets higher (string 5 fret 3 → string 4 fret 5).',
      'From string 3 to string 2: three frets higher.',
      'Same string: 7 frets higher.',
    ],
  },
  {
    id: 'fourth', semitones: 5, label: '4th', arrow: '↑', spoken: 'the fourth above',
    tips: [
      'Next string up, same fret (string 5 fret 3 → string 4 fret 3).',
      'From string 3 to string 2: one fret higher.',
      'Same string: 5 frets higher.',
    ],
  },
  {
    id: 'majorThird', semitones: 4, label: 'Major 3rd', arrow: '↑', spoken: 'the major third above',
    tips: [
      'Next string up, one fret lower (string 5 fret 3 → string 4 fret 2).',
      'From string 3 to string 2: same fret.',
      'Same string: 4 frets higher.',
    ],
  },
  {
    id: 'minorThird', semitones: 3, label: 'Minor 3rd', arrow: '↑', spoken: 'the minor third above',
    tips: [
      'Next string up, two frets lower (string 5 fret 3 → string 4 fret 1).',
      'From string 3 to string 2: one fret lower.',
      'Same string: 3 frets higher.',
    ],
  },
];

export function intervalById(id) {
  return INTERVALS.find(i => i.id === id) || null;
}

/** Every {string, fret} inside the practised area that sounds `midi`. */
export function positionsForMidi(midi, { strings, fretFrom, fretTo }) {
  const out = [];
  for (const string of strings) {
    const fret = midi - STRINGS[string].midi;
    if (fret >= fretFrom && fret <= fretTo) out.push({ string, fret });
  }
  return out;
}

/**
 * Pick a random interval drill: a root position plus an interval whose target
 * pitch exists somewhere in the practised area (any string).
 * @param {{strings:number[], fretFrom:number, fretTo:number, naturalsOnly:boolean, intervals:string[]}} opts
 * @param {{root:{string:number,fret:number}, interval:string}|null} previous
 */
export function pickIntervalTarget(opts, previous, rng = Math.random) {
  const intervals = opts.intervals.map(intervalById).filter(Boolean);
  const candidates = [];
  for (const string of opts.strings) {
    for (let fret = opts.fretFrom; fret <= opts.fretTo; fret++) {
      const root = noteAt(string, fret);
      if (opts.naturalsOnly && !isNatural(root.name)) continue;
      for (const iv of intervals) {
        const midi = root.midi + iv.semitones;
        const positions = positionsForMidi(midi, opts);
        if (positions.length === 0) continue;
        candidates.push({ root: { string, fret }, interval: iv.id, midi, positions });
      }
    }
  }
  if (candidates.length === 0) return null;
  const fresh = previous
    ? candidates.filter(c => !(c.root.string === previous.root.string && c.root.fret === previous.root.fret && c.interval === previous.interval))
    : candidates;
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(rng() * pool.length)];
}

/** The tip most relevant to a root on `rootString` (0 = string 1). */
export function tipFor(interval, rootString) {
  const tips = interval.tips;
  if (interval.id === 'octaveUp') return rootString >= 4 ? tips[0] : rootString >= 2 ? tips[1] : tips[2];
  if (interval.id === 'octaveDown') return rootString === 3 || rootString === 2 ? tips[0] : rootString <= 1 ? tips[1] : tips[2];
  if (rootString === 2) return tips[1];   // string 3 → string 2 crosses the odd tuning gap
  if (rootString === 0) return tips[2];   // no higher string: same-string rule
  return tips[0];
}
