// Chord theory for the chord map. Pure functions, no DOM.
//
// The map links every major/minor triad to its three closest neighbours, the
// chords reachable by moving a single note (the neo-Riemannian P, R and L
// moves). Each link carries the dominant 7th of the chord it leads to: the
// "secondary dominant" you can slip in to pull the ear across.

export const QUALITIES = {
  maj: { label: 'Major', suffix: '', intervals: [[0, 0, '1'], [4, 2, '3'], [7, 4, '5']] },
  min: { label: 'Minor', suffix: 'm', intervals: [[0, 0, '1'], [3, 2, '♭3'], [7, 4, '5']] },
  dom7: { label: 'Dominant 7th', suffix: '7', intervals: [[0, 0, '1'], [4, 2, '3'], [7, 4, '5'], [10, 6, '♭7']] },
};

// Note names follow one global preference, sharps or flats, as plain pitch
// names (C♯ rather than a theory spelling like B♯), so they read like a
// fretboard. Chord objects are cached and their names are getters, so
// switching the preference renames every chord in place.
const PC_NAMES = {
  sharp: ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'],
  flat: ['C', 'D♭', 'D', 'E♭', 'E', 'F', 'G♭', 'G', 'A♭', 'A', 'B♭', 'B'],
};
let accidentals = 'sharp';

export function setAccidentals(pref) { accidentals = pref === 'flat' ? 'flat' : 'sharp'; }
export function getAccidentals() { return accidentals; }
export function noteName(pc) { return PC_NAMES[accidentals][mod12(pc)]; }

export const mod12 = (n) => ((n % 12) + 12) % 12;

const cache = new Map();

/** A chord by root pitch class (0 = C) and quality ('maj' | 'min' | 'dom7'). */
export function chord(pc, quality) {
  pc = mod12(pc);
  const id = `${pc}${quality}`;
  if (cache.has(id)) return cache.get(id);
  const q = QUALITIES[quality];
  const notes = q.intervals.map(([semis, , degree]) => {
    const npc = mod12(pc + semis);
    return { pc: npc, degree, get name() { return noteName(npc); } };
  });
  const c = {
    id, pc, quality, label: q.label, notes,
    get root() { return noteName(pc); },
    get name() { return noteName(pc) + q.suffix; },
  };
  cache.set(id, c);
  return c;
}

export function chordById(id) {
  const m = /^(\d+)(maj|min|dom7)$/.exec(id);
  return m ? chord(Number(m[1]), m[2]) : null;
}

/** The dominant 7th whose resolution is `target` (its V7). */
export function dominantOf(target) {
  return chord(target.pc + 7, 'dom7');
}

/** The chords a dominant 7th resolves to: the major and minor a 5th below. */
export function resolutionsOf(dom) {
  return [chord(dom.pc - 7, 'maj'), chord(dom.pc - 7, 'min')];
}

export const MOVES = {
  P: { name: 'Parallel', short: 'Same root, opposite mood' },
  R: { name: 'Relative', short: 'The twin that shares two notes' },
  L: { name: 'Leading-tone', short: 'One note slides a half step' },
};

/** The three one-note-away neighbours of a triad, each with its bridging 7th. */
export function neighbours(c) {
  const list = c.quality === 'maj'
    ? [['P', chord(c.pc, 'min')], ['R', chord(c.pc + 9, 'min')], ['L', chord(c.pc + 4, 'min')]]
    : [['P', chord(c.pc, 'maj')], ['R', chord(c.pc + 3, 'maj')], ['L', chord(c.pc + 8, 'maj')]];
  return list.map(([move, to]) => ({ move, to, via: dominantOf(to) }));
}

/** Which note moves (and how far) going from triad `a` to triad `b`. */
export function voiceMove(a, b) {
  const bPcs = new Set(b.notes.map(n => n.pc));
  const aPcs = new Set(a.notes.map(n => n.pc));
  const from = a.notes.find(n => !bPcs.has(n.pc));
  const to = b.notes.find(n => !aPcs.has(n.pc));
  const kept = a.notes.filter(n => bPcs.has(n.pc));
  if (!from || !to) return null;
  const up = mod12(to.pc - from.pc);
  const semis = up <= 6 ? up : up - 12;
  return { from, to, kept, semis };
}

// ---- Guitar voicings -------------------------------------------------------
// Frets listed low E → high E; -1 = muted string.

export const STRING_MIDI = [40, 45, 50, 55, 59, 64];

const OPEN = {
  '0maj': [-1, 3, 2, 0, 1, 0], '2maj': [-1, -1, 0, 2, 3, 2], '4maj': [0, 2, 2, 1, 0, 0],
  '7maj': [3, 2, 0, 0, 0, 3], '9maj': [-1, 0, 2, 2, 2, 0],
  '9min': [-1, 0, 2, 2, 1, 0], '2min': [-1, -1, 0, 2, 3, 1], '4min': [0, 2, 2, 0, 0, 0],
  '0dom7': [-1, 3, 2, 3, 1, 0], '2dom7': [-1, -1, 0, 2, 1, 2], '4dom7': [0, 2, 0, 1, 0, 0],
  '7dom7': [3, 2, 0, 0, 0, 1], '9dom7': [-1, 0, 2, 0, 2, 0], '11dom7': [-1, 2, 1, 2, 0, 2],
};

const SHAPES = {
  // relative to the barre fret f, rooted on the low E (E-shape) or A string (A-shape)
  E: { maj: [0, 2, 2, 1, 0, 0], min: [0, 2, 2, 0, 0, 0], dom7: [0, 2, 0, 1, 0, 0] },
  A: { maj: [-1, 0, 2, 2, 2, 0], min: [-1, 0, 2, 2, 1, 0], dom7: [-1, 0, 2, 0, 2, 0] },
};

/** A playable voicing: { frets, barre, shape } with the lowest-reaching option. */
export function voicing(c) {
  if (OPEN[c.id]) return { frets: OPEN[c.id], barre: 0, shape: 'open' };
  const eFret = mod12(c.pc - 4);
  const aFret = mod12(c.pc - 9);
  const [shape, f] = eFret <= aFret ? ['E', eFret] : ['A', aFret];
  const frets = SHAPES[shape][c.quality].map(x => (x < 0 ? -1 : x + f));
  return { frets, barre: f, shape: `${shape}-shape barre` };
}

/** MIDI notes the voicing sounds, low → high. */
export function voicingMidis(v) {
  return v.frets.flatMap((f, s) => (f < 0 ? [] : [STRING_MIDI[s] + f]));
}

// ---- How it sounds ---------------------------------------------------------

export function character(c) {
  const third = c.notes[1].name;
  if (c.quality === 'maj') return {
    mood: 'Bright · open · settled',
    text: `The major 3rd (${third}) sits four semitones above the root. That wide gap is what the ear hears as bright, happy or "home".`,
  };
  if (c.quality === 'min') return {
    mood: 'Dark · soft · inward',
    text: `The minor 3rd (${third}) is one semitone lower than in ${c.root} major. That single half step is the whole difference between bright and sad.`,
  };
  const [maj] = resolutionsOf(c);
  return {
    mood: 'Tense · restless · leaning forward',
    text: `The 3rd (${c.notes[1].name}) and ♭7 (${c.notes[3].name}) form a tritone, the most unstable interval. It wants to collapse inward onto ${maj.name} or ${maj.name}m, so use it as a bridge, not a place to rest.`,
  };
}
