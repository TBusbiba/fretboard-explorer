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

// ---------- chords / arpeggios ----------
export const CHORDS = [
  { id: 'major', label: 'Major', spoken: 'major', tones: [0, 4, 7], tip: 'Major: root, major 3rd (4 frets above the root), 5th (7 frets above). Moving up a string lands ~5 frets lower (4 from string 3 to 2).' },
  { id: 'minor', label: 'Minor', spoken: 'minor', tones: [0, 3, 7], tip: 'Minor: root, minor 3rd (3 frets above the root), 5th (7 frets above). Only the 3rd differs from major — one fret lower.' },
  { id: 'dom7', label: '7', spoken: 'seven', tones: [0, 4, 7, 10], tip: 'Dominant 7: major triad plus the ♭7 (10 frets above the root, or 2 frets below the octave).' },
  { id: 'min7', label: 'm7', spoken: 'minor seven', tones: [0, 3, 7, 10], tip: 'Minor 7: minor triad plus the ♭7 (2 frets below the octave).' },
  { id: 'maj7', label: 'maj7', spoken: 'major seven', tones: [0, 4, 7, 11], tip: 'Major 7: major triad plus the 7th (1 fret below the octave).' },
];

export const DEGREE_LABELS = { 0: 'R', 3: '♭3', 4: '3', 7: '5', 10: '♭7', 11: '7' };

export function chordById(id) {
  return CHORDS.find(c => c.id === id) || null;
}

const ARPEGGIO_SPAN = 4;          // frets above the root fret that a shape may use
const ARPEGGIO_ROOT_STRINGS = [5, 4, 3];   // string 6, 5 or 4

/**
 * Pick a random arpeggio: root position + chord, one chord tone per string
 * from the root's string up to string 1, each within [rootFret, rootFret+4].
 * @returns {{root:{string,fret}, chord:string, notes:[{string,fret,midi,degree}], midi}|null}
 */
export function pickArpeggioTarget(opts, previous, rng = Math.random) {
  const chords = opts.chords.map(chordById).filter(Boolean);
  const enabled = new Set(opts.strings);
  const candidates = [];
  for (const rootString of ARPEGGIO_ROOT_STRINGS) {
    // every string from the root up to string 1 must be enabled
    let ok = true;
    for (let s = rootString; s >= 0; s--) if (!enabled.has(s)) ok = false;
    if (!ok) continue;
    for (let fret = opts.fretFrom; fret + ARPEGGIO_SPAN <= opts.fretTo; fret++) {
      const root = noteAt(rootString, fret);
      if (opts.naturalsOnly && !isNatural(root.name)) continue;
      for (const chord of chords) {
        const notes = [];
        for (let s = rootString; s >= 0; s--) {
          let found = null;
          for (let f = fret; f <= fret + ARPEGGIO_SPAN; f++) {
            const midi = STRINGS[s].midi + f;
            const degree = (((midi - root.midi) % 12) + 12) % 12;
            if (chord.tones.includes(degree)) { found = { string: s, fret: f, midi, degree }; break; }
          }
          if (!found) { notes.length = 0; break; }
          notes.push(found);
        }
        if (notes.length === 0) continue;
        candidates.push({ root: { string: rootString, fret }, chord: chord.id, notes, midi: root.midi });
      }
    }
  }
  if (candidates.length === 0) return null;
  const fresh = previous
    ? candidates.filter(c => !(c.root.string === previous.root.string && c.root.fret === previous.root.fret && c.chord === previous.chord))
    : candidates;
  const pool = fresh.length > 0 ? fresh : candidates;
  return pool[Math.floor(rng() * pool.length)];
}

// ---------- triads on three adjacent strings ----------
export const TRIADS = [
  { id: 'major', label: 'Major', spoken: 'major', tones: [0, 4, 7], tip: 'Major triad: root, major 3rd, 5th (R · 3 · 5).' },
  { id: 'minor', label: 'Minor', spoken: 'minor', tones: [0, 3, 7], tip: 'Minor triad: root, minor 3rd, 5th (R · ♭3 · 5) — the 3rd one fret lower than major.' },
  { id: 'dim', label: 'Dim', spoken: 'diminished', tones: [0, 3, 6], tip: 'Diminished: root, minor 3rd, flat 5th (R · ♭3 · ♭5) — minor with the 5th one fret lower.' },
  { id: 'aug', label: 'Aug', spoken: 'augmented', tones: [0, 4, 8], tip: 'Augmented: root, major 3rd, sharp 5th (R · 3 · ♯5) — major with the 5th one fret higher.' },
  { id: 'dom7', label: '7 shell', spoken: 'seven', tones: [0, 4, 10], tip: 'Dominant 7 shell voicing: root, 3rd, ♭7 — no 5th.' },
  { id: 'min7', label: 'm7 shell', spoken: 'minor seven', tones: [0, 3, 10], tip: 'Minor 7 shell voicing: root, ♭3, ♭7 — no 5th.' },
];
DEGREE_LABELS[6] = '♭5';
DEGREE_LABELS[8] = '♯5';

// Three adjacent strings, low to high, named by string number.
export const STRING_GROUPS = [
  { id: '654', strings: [5, 4, 3], label: '6 · 5 · 4' },
  { id: '543', strings: [4, 3, 2], label: '5 · 4 · 3' },
  { id: '432', strings: [3, 2, 1], label: '4 · 3 · 2' },
  { id: '321', strings: [2, 1, 0], label: '3 · 2 · 1' },
];

export const INVERSIONS = [
  { index: 0, label: 'root position', tip: 'Root position: the root is on the lowest string of the group.' },
  { index: 1, label: '1st inversion', tip: '1st inversion: the 3rd is on the lowest string; the root ends up on top.' },
  { index: 2, label: '2nd inversion', tip: '2nd inversion: the 5th (or 7th in a shell) is on the lowest string.' },
];

export function triadById(id) { return TRIADS.find(t => t.id === id) || null; }
export function stringGroupById(id) { return STRING_GROUPS.find(g => g.id === id) || null; }

const TRIAD_SPAN = 4;

/**
 * Pick a close-voiced triad on a 3-string group in some inversion. Notes are
 * ascending, low string to high, within a 5-fret window and the fret range.
 * opts.triadInversion: 'random' (never the same inversion twice in a row),
 * 0 | 1 | 2 (fixed), 'ordered' (one chord on one group: root position, then
 * 1st, then 2nd inversion — each up the neck when it exists higher, else the
 * lowest voicing of that inversion — then a different chord), or 'cycle'
 * (one chord on one group from its lowest voicing, climbing through the
 * inversions until no higher voicing is left, then a different chord).
 * @returns {{root:{string,fret}, group:string, triad:string, inversion:number, notes:[{string,fret,midi,degree}], midi}|null}
 */
export function pickTriadTarget(opts, previous, rng = Math.random) {
  const triads = opts.triads.map(triadById).filter(Boolean);
  const groups = opts.triadGroups.map(stringGroupById).filter(Boolean);
  const enabled = new Set(opts.strings);
  const candidates = [];
  for (const group of groups) {
    if (!group.strings.every(s => enabled.has(s))) continue;
    const [low, mid, high] = group.strings;
    for (const triad of triads) {
      for (let rootPc = 0; rootPc < 12; rootPc++) {
        if (opts.naturalsOnly && !isNatural(NOTE_NAMES[rootPc])) continue;
        for (let inv = 0; inv < 3; inv++) {
          const order = [0, 1, 2].map(k => triad.tones[(inv + k) % 3]);   // degree on low, mid, high
          for (let f0 = opts.fretFrom; f0 <= opts.fretTo; f0++) {
            const m0 = STRINGS[low].midi + f0;
            if ((((m0 - rootPc) % 12) + 12) % 12 !== order[0]) continue;
            // mid: smallest pitch above m0 with the right degree, then high above that
            const pick = (string, above, degree) => {
              for (let f = opts.fretFrom; f <= opts.fretTo; f++) {
                const m = STRINGS[string].midi + f;
                if (m > above && (((m - rootPc) % 12) + 12) % 12 === degree) return { string, fret: f, midi: m, degree };
              }
              return null;
            };
            const n1 = pick(mid, m0, order[1]); if (!n1) continue;
            const n2 = pick(high, n1.midi, order[2]); if (!n2) continue;
            const frets = [f0, n1.fret, n2.fret];
            if (Math.max(...frets) - Math.min(...frets) > TRIAD_SPAN) continue;
            const notes = [{ string: low, fret: f0, midi: m0, degree: order[0] }, n1, n2];
            const rootNote = notes.find(n => n.degree === 0);
            candidates.push({
              root: { string: rootNote.string, fret: rootNote.fret }, rootPc,
              group: group.id, triad: triad.id, inversion: inv, notes, midi: rootNote.midi,
            });
          }
        }
      }
    }
  }
  if (candidates.length === 0) return null;
  const want = opts.triadInversion;
  const same = (a, b) => a.group === b.group && a.triad === b.triad && a.inversion === b.inversion && a.rootPc === b.rootPc && a.notes[0].fret === b.notes[0].fret;

  const lowFret = (c) => Math.min(...c.notes.map(n => n.fret));
  const sameChord = (a, b) => a.group === b.group && a.triad === b.triad && a.rootPc === b.rootPc;
  if (want === 'ordered') {
    if (previous && previous.inversion < 2) {
      const run = candidates.filter(c => sameChord(c, previous) && c.inversion === previous.inversion + 1).sort((a, b) => lowFret(a) - lowFret(b));
      if (run.length) {
        const prevLow = lowFret(previous);
        return run.find(c => lowFret(c) > prevLow) || run[0];
      }
    }
    // a new chord (different when possible) that has all three inversions, from its lowest root position
    const byChord = new Map();
    for (const c of candidates) {
      const k = `${c.group}|${c.triad}|${c.rootPc}`;
      (byChord.get(k) || byChord.set(k, []).get(k)).push(c);
    }
    let chords = [...byChord.values()].filter(vs => [0, 1, 2].every(i => vs.some(c => c.inversion === i)));
    if (chords.length === 0) chords = [...byChord.values()];
    if (previous) {
      const other = chords.filter(vs => !sameChord(vs[0], previous));
      if (other.length) chords = other;
    }
    const vs = chords[Math.floor(rng() * chords.length)];
    return vs.filter(c => c.inversion === 0).sort((a, b) => lowFret(a) - lowFret(b))[0]
      || vs.sort((a, b) => lowFret(a) - lowFret(b))[0];
  }
  if (want === 'cycle') {
    if (previous) {
      // the same chord's next voicing up the neck, if there is one
      const prevLow = lowFret(previous);
      const up = candidates.filter(c => sameChord(c, previous) && lowFret(c) > prevLow).sort((a, b) => lowFret(a) - lowFret(b));
      if (up.length) return up[0];
    }
    // a new chord (different from the last when possible), from its lowest voicing
    let pool = candidates;
    if (previous) {
      const other = pool.filter(c => !sameChord(c, previous));
      if (other.length) pool = other;
    }
    const seed = pool[Math.floor(rng() * pool.length)];
    return pool.filter(c => sameChord(c, seed)).sort((a, b) => lowFret(a) - lowFret(b))[0];
  }

  let pool = candidates;
  if (typeof want === 'number') pool = pool.filter(c => c.inversion === want);
  if (pool.length === 0) return null;
  if (previous) {
    const fresh = pool.filter(c => !same(c, previous));
    if (fresh.length) pool = fresh;
    if (want === 'random' || want == null) {
      const varied = pool.filter(c => c.inversion !== previous.inversion);
      if (varied.length) pool = varied;
    }
  }
  return pool[Math.floor(rng() * pool.length)];
}
