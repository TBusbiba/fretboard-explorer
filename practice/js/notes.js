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
