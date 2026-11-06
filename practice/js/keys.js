import { spell, pitchClass } from './chords/deck.js';

export const KEY_ORDER = ['C', 'G', 'F', 'D', 'A', 'B♭', 'E♭', 'E', 'B', 'A♭', 'D♭', 'F♯'];
export const DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi'];
export const DEGREE_QUALITY = { I: 'major', ii: 'minor', iii: 'minor', IV: 'major', V: 'major', vi: 'minor' };
export const RULE_TEXT = '1, 4, 5 are major · 2, 3, 6 are minor · 7 is diminished (skipped)';

const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const ORDINALS = ['1st', '2nd', '3rd', '4th', '5th', '6th'];

export const PROGRESSIONS = [
  { id: 'I–V–vi–IV', degrees: ['I', 'V', 'vi', 'IV'] },
  { id: 'I–IV–V–I', degrees: ['I', 'IV', 'V', 'I'] },
  { id: 'ii–V–I', degrees: ['ii', 'V', 'I'] },
  { id: 'vi–IV–I–V', degrees: ['vi', 'IV', 'I', 'V'] },
  { id: 'I–vi–IV–V', degrees: ['I', 'vi', 'IV', 'V'] },
];

export function diatonicChords(keyName) {
  if (!KEY_ORDER.includes(keyName)) return [];
  return DEGREES.map((degree, i) => {
    const root = spell(keyName, MAJOR_STEPS[i], i);
    const quality = DEGREE_QUALITY[degree];
    return { degree, root, pc: pitchClass(root), quality, name: quality === 'minor' ? `${root}m` : root };
  });
}

export function degreeOf(keyName, chordName) {
  const hit = diatonicChords(keyName).find(c => c.name === chordName);
  return hit ? hit.degree : null;
}

export function progressionById(id) { return PROGRESSIONS.find(p => p.id === id) || null; }

export function resolveProgression(keyName, progId) {
  const prog = progressionById(progId);
  const row = diatonicChords(keyName);
  if (!prog || !row.length) return [];
  return prog.degrees.map(d => row.find(c => c.degree === d));
}

export function explain(keyName, degreeOrChord) {
  const row = diatonicChords(keyName);
  if (!row.length) return null;
  const asDegree = DEGREES.includes(degreeOrChord);
  const hit = row.find(c => (asDegree ? c.degree : c.name) === degreeOrChord);
  if (!hit) return null;
  const scale = MAJOR_STEPS.map((semis, i) => spell(keyName, semis, i));
  const highlight = DEGREES.indexOf(hit.degree);
  const n = highlight + 1;
  const workedText = asDegree
    ? `${hit.degree} of ${keyName} major: count up ${scale.slice(0, n).join(' ')} → ${hit.root}. ${n} is always ${hit.quality} → ${hit.name}.`
    : `${hit.name} is the ${ORDINALS[highlight]} note of ${keyName} major (${scale.slice(0, 6).join(' ')}) → ${hit.degree}. ${n} is always ${hit.quality}, so ${hit.name} fits.`;
  return {
    keyName, degree: hit.degree, scale, numbers: ['1', '2', '3', '4', '5', '6', '7'], highlight,
    ruleText: RULE_TEXT, workedText, row: row.map(c => ({ degree: c.degree, name: c.name })),
  };
}
