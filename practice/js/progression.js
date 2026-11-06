import { voicingsFor, questionVoicings } from './triad-match.js';

export const CHAIN_RANGE = { from: 0, to: 14 };

export function voicingDistance(a, b) {
  return a.notes.reduce((t, n, i) => t + Math.abs(n.fret - b.notes[i].fret), 0);
}

export function closestVoicings(prev, candidates) {
  if (!candidates.length) return [];
  const dist = candidates.map(v => voicingDistance(prev, v));
  const min = Math.min(...dist);
  return candidates.filter((_, i) => dist[i] === min);
}

const reachable = (chord, group) => voicingsFor(chord.pc, chord.quality, group, CHAIN_RANGE);

export function chainFrom(startVoicing, chords, group) {
  const chain = [startVoicing];
  for (let i = 1; i < chords.length; i++) {
    const next = closestVoicings(chain[i - 1], reachable(chords[i], group))[0];
    if (!next) break;
    chain.push(next);
  }
  return chain;
}

export function createProgressionRun(chords, group) {
  const total = chords.length;
  let index = 0, step = 0, finished = false;
  let played = [];
  let candidates = questionVoicings(chords[0].pc, chords[0].quality, group);

  return {
    get step() { return step; },
    get index() { return index; },
    get total() { return total; },
    get candidates() { return candidates; },
    get found() { return [...played]; },
    get previous() { return index > 0 ? played[index - 1] || null : null; },
    expected() { return [...new Set(candidates.map(v => v.notes[step].midi))]; },
    feed(midi) {
      if (finished) return { status: 'done', step: 3, found: played.length, total, index };
      const hit = candidates.filter(v => v.notes[step].midi === midi);
      if (!hit.length) return { status: 'wrong', step, index };
      candidates = hit;
      step += 1;
      if (step < 3) return { status: 'step', step, voicing: hit[0], index };
      const voicing = hit[0];
      const doneIndex = index;
      played.push(voicing);
      step = 0;
      if (doneIndex + 1 >= total) {
        finished = true;
        return { status: 'done', step: 3, voicing, shape: voicing.shape, found: played.length, total, index: doneIndex };
      }
      index += 1;
      candidates = closestVoicings(voicing, reachable(chords[index], group));
      return { status: 'shape', step: 3, voicing, shape: voicing.shape, found: played.length, total, index: doneIndex };
    },
    reset() {
      index = 0; step = 0; finished = false; played = [];
      candidates = questionVoicings(chords[0].pc, chords[0].quality, group);
    },
  };
}
