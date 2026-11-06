// Triad answering for Practice: every close voicing of a major or minor triad on three
// adjacent strings, a matcher for the three notes played low to high, and the relative
// shape layout (with the distances between shapes) for the big Show-shapes panel.
// Pure functions, no DOM.

import { STRINGS, DEGREE_LABELS, triadById, stringGroupById } from './notes.js';

export const QUALITIES = ['major', 'minor'];
export const FULL_RANGE = { from: 0, to: 12 };

const mod12 = (n) => ((n % 12) + 12) % 12;

/**
 * Every close voicing (3 ascending notes, low string to high, one octave or less) of the triad on
 * the group's strings inside `range`. `shape` is 1 root position, 2 first inversion, 3 second
 * inversion; going up the neck the shapes follow 1, 2, 3, 1 ... Sorted by `lowestFret`.
 * @returns {{shape:number, notes:{string:number,fret:number,midi:number,degree:number}[], lowestFret:number}[]}
 */
export function voicingsFor(rootPc, quality, groupId, range = FULL_RANGE) {
  const triad = QUALITIES.includes(quality) && triadById(quality), group = stringGroupById(groupId);
  if (!triad || !group) return [];
  const [low, mid, high] = group.strings;
  const out = [];
  for (let inversion = 0; inversion < 3; inversion++) {
    const order = [0, 1, 2].map(k => triad.tones[(inversion + k) % 3]);
    for (let f0 = range.from; f0 <= range.to; f0++) {
      const m0 = STRINGS[low].midi + f0;
      if (mod12(m0 - rootPc) !== order[0]) continue;
      const above = (string, floor, degree) => {
        for (let f = range.from; f <= range.to; f++) {
          const m = STRINGS[string].midi + f;
          if (m > floor && mod12(m - rootPc) === degree) return { string, fret: f, midi: m, degree };
        }
        return null;
      };
      const n1 = above(mid, m0, order[1]); if (!n1) continue;
      const n2 = above(high, n1.midi, order[2]); if (!n2) continue;
      const notes = [{ string: low, fret: f0, midi: m0, degree: order[0] }, n1, n2];
      if (n2.midi - m0 >= 12) continue;
      out.push({ shape: inversion + 1, notes, lowestFret: Math.min(...notes.map(n => n.fret)) });
    }
  }
  return out.sort((a, b) => a.lowestFret - b.lowestFret || a.shape - b.shape);
}

/** All the shapes of a chord for one question: frets 0-12, reaching up to fret 14 when the chord has fewer than 3 shapes below. */
export function questionVoicings(rootPc, quality, groupId, to = FULL_RANGE.to) {
  for (let hi = to; ; hi++) {
    const vs = voicingsFor(rootPc, quality, groupId, { from: FULL_RANGE.from, to: hi });
    if (new Set(vs.map(v => v.shape)).size >= 3 || hi >= to + 2) return vs;
  }
}

/**
 * Matches a whole question: the chord in every shape of `voicings`, each played low to high from
 * the thickest string of the group, in any order. A first note must be the lowest note of a
 * voicing whose shape is still open; it fixes the voicing, later notes must continue it (exact
 * MIDI). A wrong note changes nothing; a first note of a shape already done is `dup`.
 */
export function createTriadMatcher(voicings) {
  const shapes = [...new Set(voicings.map(v => v.shape))];
  let candidates = [...voicings], step = 0;
  const done = new Map();   // shape -> the voicing played
  const open = () => voicings.filter(v => !done.has(v.shape));
  return {
    get step() { return step; },
    get candidates() { return candidates; },
    get found() { return [...done.values()]; },
    get total() { return shapes.length; },
    /** The pitches that would be accepted next. */
    expected() { return [...new Set(candidates.map(v => v.notes[step].midi))]; },
    /**
     * @returns {{status:'step'|'shape'|'done'|'dup'|'wrong', step:number, voicing?:object, shape?:number, found?:number, total?:number}}
     * `step`: note n of a shape taken; `shape`: a shape finished, more to go; `done`: the last shape finished.
     */
    feed(midi) {
      if (done.size >= shapes.length) return { status: 'done', step: 3, found: done.size, total: shapes.length };
      if (step === 0) {
        const hit = voicings.filter(v => v.notes[0].midi === midi);
        if (!hit.length) return { status: 'wrong', step };
        const fresh = hit.filter(v => !done.has(v.shape));
        if (!fresh.length) return { status: 'dup', step, shape: hit[0].shape };
        candidates = fresh; step = 1;
        return { status: 'step', step, voicing: fresh[0] };
      }
      const next = candidates.filter(v => v.notes[step].midi === midi);
      if (!next.length) return { status: 'wrong', step };
      candidates = next; step += 1;
      if (step < 3) return { status: 'step', step, voicing: next[0] };
      const v = next[0];
      done.set(v.shape, v);
      step = 0; candidates = open();
      return { status: done.size >= shapes.length ? 'done' : 'shape', step: 3, voicing: v, shape: v.shape, found: done.size, total: shapes.length };
    },
    reset() { done.clear(); candidates = [...voicings]; step = 0; },
  };
}

/**
 * The 3 shapes of a quality on a string group as relative fret grids, plus the frets between
 * consecutive shapes on the same root. Notes are low to high; `rel` is the fret relative to the
 * lowest fret of shape 1 (0 = where shape 1's lowest-fretted note sits); `offset` is the shape's
 * lowest fret relative to shape 1. `upFrets` = [1 to 2, 2 to 3, 3 to 1 an octave up] (sums to 12).
 */
export function shapeLayout(quality, groupId) {
  if (!QUALITIES.includes(quality) || !stringGroupById(groupId)) return null;
  for (let rootPc = 0; rootPc < 12; rootPc++) {
    const vs = voicingsFor(rootPc, quality, groupId, { from: 0, to: 24 }).filter(v => v.lowestFret >= 1);
    const first = vs.find(v => v.shape === 1);
    if (!first) continue;
    const run = [first];
    for (const s of [2, 3, 1]) {
      const prev = run[run.length - 1];
      const next = vs.find(v => v.shape === s && v.lowestFret > prev.lowestFret);
      if (!next) break;
      run.push(next);
    }
    if (run.length < 4) continue;
    const base = first.lowestFret;
    return {
      quality, group: groupId,
      shapes: run.slice(0, 3).map(v => ({
        index: v.shape,
        offset: v.lowestFret - base,
        notes: v.notes.map(n => ({ string: n.string, rel: n.fret - base, degree: n.degree, label: DEGREE_LABELS[n.degree] })),
      })),
      upFrets: [1, 2, 3].map(i => run[i].lowestFret - run[i - 1].lowestFret),
    };
  }
  return null;
}
