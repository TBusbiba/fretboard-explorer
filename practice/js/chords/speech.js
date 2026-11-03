// Turns what the browser's speech recogniser heard into note pitch classes.
// Recognisers spell single letters as words ("see", "bee", "hey"), so each
// letter accepts its common sound-alikes. Unknown words are skipped.

const LETTER = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 };
const SOUNDS = {
  a: ['a', 'ay', 'eh', 'hey', 'hay', 'aye'],
  b: ['b', 'be', 'bee', 'bea', 'bi'],
  c: ['c', 'see', 'sea', 'si', 'cee'],
  d: ['d', 'dee', 'di', 'de'],
  e: ['e', 'ee', 'eee'],
  f: ['f', 'ef', 'eff'],
  g: ['g', 'gee', 'ji', 'jee', 'gi'],
};
const WORD = Object.fromEntries(Object.entries(SOUNDS).flatMap(([l, ws]) => ws.map(w => [w, LETTER[l]])));
const SHARP = new Set(['sharp', 'sharps', 'sharpe']);
const FLAT = new Set(['flat', 'flats']);

/** Pitch classes (0–11) in the order heard, without repeats. */
export function parseNotes(text) {
  const tokens = text.toLowerCase()
    .replace(/[♯#]/g, ' sharp ').replace(/♭/g, ' flat ')
    .replace(/\b([a-g])b\b/g, '$1 flat')
    .split(/[^a-z]+/).filter(Boolean);
  const out = [];
  for (let i = 0; i < tokens.length; i++) {
    let pc = WORD[tokens[i]];
    if (pc === undefined) continue;
    if (SHARP.has(tokens[i + 1])) { pc = (pc + 1) % 12; i++; }
    else if (FLAT.has(tokens[i + 1])) { pc = (pc + 11) % 12; i++; }
    if (!out.includes(pc)) out.push(pc);
  }
  return out;
}

/** Of the recogniser's alternatives, the first that reads as exactly three notes, else the one with the most. */
export function bestParse(alternatives) {
  const parsed = alternatives.map(text => ({ text, notes: parseNotes(text) }));
  return parsed.find(p => p.notes.length === 3)
    || parsed.reduce((best, p) => (p.notes.length > best.notes.length ? p : best), parsed[0] || { text: '', notes: [] });
}
