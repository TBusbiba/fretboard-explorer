// Chord flashcards: the decks, theory-correct spelling, answer checking and a
// small Leitner scheduler. Pure: no DOM.

// keys.js imports spell/pitchClass from here; neither module calls the other's
// exports while loading, so the cycle is safe.
import { KEY_ORDER, DEGREES, diatonicChords } from '../keys.js';

const LETTERS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
const LETTER_PC = [0, 2, 4, 5, 7, 9, 11];
export const ORDER_OF_SHARPS = ['F♯', 'C♯', 'G♯', 'D♯', 'A♯', 'E♯', 'B♯'];
export const ORDER_OF_FLATS = ['B♭', 'E♭', 'A♭', 'D♭', 'G♭', 'C♭', 'F♭'];

const mod12 = (n) => ((n % 12) + 12) % 12;

/** Pitch class of a spelled note ('E♯' → 5). */
export function pitchClass(name) {
  const li = LETTERS.indexOf(name[0]);
  let pc = LETTER_PC[li];
  for (const c of name.slice(1)) pc += c === '♯' ? 1 : c === '♭' ? -1 : 0;
  return mod12(pc);
}

/** The note `steps` letters and `semis` semitones above `root`, spelled correctly. */
export function spell(root, semis, steps) {
  const letterIdx = (LETTERS.indexOf(root[0]) + steps) % 7;
  let diff = mod12(pitchClass(root) + semis - LETTER_PC[letterIdx]);
  if (diff > 6) diff -= 12;
  return LETTERS[letterIdx] + (diff > 0 ? '♯'.repeat(diff) : '♭'.repeat(-diff));
}

const THIRD = { maj: 4, min: 3 };

// The keys from the video, in circle-of-fifths order, with their signatures.
const MAJOR_KEYS = [
  ['C', 0], ['G', 1], ['D', 2], ['A', 3], ['E', 4], ['B', 5], ['F♯', 6], ['C♯', 7],
  ['F', -1], ['B♭', -2], ['E♭', -3], ['A♭', -4], ['D♭', -5], ['G♭', -6],
];
const MINOR_KEYS = [
  ['A', 0], ['E', 1], ['B', 2], ['F♯', 3], ['C♯', 4], ['G♯', 5], ['D♯', 6], ['A♯', 7],
  ['D', -1], ['G', -2], ['C', -3], ['F', -4], ['B♭', -5], ['E♭', -6], ['A♭', -7],
];

function makeCard(root, quality, signature) {
  const notes = [root, spell(root, THIRD[quality], 2), spell(root, 7, 4)];
  const relative = quality === 'min' ? spell(root, 3, 2) : spell(root, 9, 5);
  return {
    id: `${root}${quality === 'min' ? 'm' : ''}`,
    root, quality, notes,
    name: root + (quality === 'min' ? 'm' : ''),
    keyName: `${root} ${quality === 'min' ? 'minor' : 'major'}`,
    signature,                       // + sharps, − flats
    accidentals: signature >= 0 ? ORDER_OF_SHARPS.slice(0, signature) : ORDER_OF_FLATS.slice(0, -signature),
    relative: relative + (quality === 'min' ? '' : 'm'),
  };
}

export const DECKS = {
  major: MAJOR_KEYS.map(([r, s]) => makeCard(r, 'maj', s)),
  minor: MINOR_KEYS.map(([r, s]) => makeCard(r, 'min', s)),
  get keys() { return keysCards(); },
};

export function cardsFor(deck, { natural = false } = {}) {
  if (deck === 'keys') return keysCards();
  const cards = deck === 'both' ? [...DECKS.major, ...DECKS.minor] : DECKS[deck] || DECKS.major;
  return natural ? cards.filter(c => c.root.length === 1) : cards;
}

// ---- Keys deck: diatonic chords of major keys, taught tier by tier ------------

export const KEY_TIERS = { 1: ['C', 'G', 'F'], 2: ['D', 'A', 'B♭', 'E♭'], 3: ['E', 'B', 'A♭', 'D♭', 'F♯'] };
export const DEGREE_TIERS = { 1: ['IV', 'V'], 2: ['ii', 'iii', 'vi'] };
export const UNLOCK_STEPS = [[1, 1], [1, 2], [2, 1], [2, 2], [3, 1], [3, 2]];
export const UNLOCK_SHARE = 0.75;

const tierOf = (tiers, v) => Number(Object.keys(tiers).find(t => tiers[t].includes(v)));

let keysMemo = null;
/** 120 cards: per key, a degree card (name the chord) and a numeral card (name the degree), for ii iii IV V vi (never the I). */
export function keysCards() {
  if (keysMemo) return keysMemo;
  keysMemo = [];
  for (const keyName of KEY_ORDER) {
    const row = diatonicChords(keyName);
    const keyTier = tierOf(KEY_TIERS, keyName);
    for (const c of row) {
      if (c.degree === 'I') continue;   // the tonic is the key itself: not asked
      const degTier = tierOf(DEGREE_TIERS, c.degree);
      keysMemo.push({ kind: 'degree', id: `K:${keyName}:${c.degree}`, keyName, degree: c.degree, answer: c, row, keyTier, degTier });
    }
    for (const c of row) {
      if (c.degree === 'I') continue;   // the tonic is the key itself: not asked
      const degTier = tierOf(DEGREE_TIERS, c.degree);
      keysMemo.push({ kind: 'roman', id: `K:${keyName}:${c.name}`, keyName, degree: c.degree, chordName: c.name, row, keyTier, degTier });
    }
  }
  return keysMemo;
}

const inStep = (c, i) => UNLOCK_STEPS.slice(0, i + 1).some(([k, d]) => c.keyTier <= k && c.degTier <= d);

/** Which unlock step the learner is on, derived from the boxes alone. */
export function keysUnlock(boxes = {}) {
  const all = keysCards();
  let step = 0;
  while (step < UNLOCK_STEPS.length - 1) {
    const pool = all.filter(c => inStep(c, step));
    const mastered = pool.filter(c => (boxes[c.id] ?? 0) >= MASTERED_BOX).length;
    const entered = all.some(c => inStep(c, step + 1) && !inStep(c, step) && c.id in boxes);
    if (mastered >= UNLOCK_SHARE * pool.length || entered) step++;
    else break;
  }
  const [keyTier, degTier] = UNLOCK_STEPS[step];
  return { step, keyTier, degTier };
}

export function keysPool(boxes = {}) {
  const { step } = keysUnlock(boxes);
  return keysCards().filter(c => inStep(c, step));
}

export const keysSeen = (boxes = {}) => Object.keys(boxes).some(id => id.startsWith('K:'));

/** degree card: answer = { pc, quality }; numeral card: answer = { degree }. */
export function checkKeysAnswer(card, answer) {
  if (card.kind === 'roman') return { correct: answer.degree === card.degree };
  return { correct: answer.pc === card.answer.pc && answer.quality === card.answer.quality };
}

export function signatureLabel(sig) {
  if (sig === 0) return 'No sharps or flats';
  const n = Math.abs(sig);
  return `${n} ${sig > 0 ? 'sharp' : 'flat'}${n > 1 ? 's' : ''}`;
}

/**
 * Check three picked notes against a card. Spelling is lenient: any name for
 * the right pitch counts, but each pick reports whether it was spelled as the
 * textbook would.
 * @returns {{ correct: boolean, picks: Array<{ name, ok, spelledAs: string|null }> }}
 */
export function checkNotes(card, picked) {
  const target = new Map(card.notes.map(n => [pitchClass(n), n]));
  const seen = new Set();
  const picks = picked.map((name) => {
    const pc = pitchClass(name);
    const ok = target.has(pc) && !seen.has(pc);
    seen.add(pc);
    const proper = target.get(pc);
    return { name, ok, spelledAs: ok && proper !== name ? proper : null };
  });
  return { correct: picked.length === 3 && picks.every(p => p.ok), picks };
}

/** Does a fretboard position's pitch belong to the chord? Returns the chord's spelling or null. */
export function noteForPitch(card, midi) {
  return card.notes.find(n => pitchClass(n) === mod12(midi)) || null;
}

/** MIDI notes for a close root-position voicing around the guitar's middle. */
export function chordMidis(card) {
  const root = 48 + pitchClass(card.root);
  return [root, root + THIRD[card.quality], root + 7];
}

// ---- Leitner scheduling ------------------------------------------------------
// Each card sits in a box 0..4. A clean answer moves it up a box, any mistake
// sends it back to 0. Lower boxes come up far more often.

const BOX_WEIGHT = [10, 6, 3, 1.5, 0.6];
export const MASTERED_BOX = 3;

export function promote(boxes, id, clean) {
  const next = { ...boxes };
  next[id] = clean ? Math.min(4, (boxes[id] ?? 0) + 1) : 0;
  return next;
}

export function pickCard(cards, boxes, previousId, rng = Math.random) {
  const pool = cards.length > 1 ? cards.filter(c => c.id !== previousId) : cards;
  const weights = pool.map(c => BOX_WEIGHT[boxes[c.id] ?? 0]);
  let r = rng() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { r -= weights[i]; if (r < 0) return pool[i]; }
  return pool[pool.length - 1];
}

/** Saved Chords prefs with the defaults applied: Natural chords and Notes only start ON, and are switched on once for prefs saved before that (`defaultsV2`). */
export function loadPrefs(saved = {}) {
  const prefs = { deck: 'major', boxes: {}, best: 0, sound: true, notesOnly: true, natural: true, ...saved };
  if (!prefs.defaultsV2) { prefs.notesOnly = true; prefs.natural = true; prefs.defaultsV2 = true; }
  return prefs;
}
