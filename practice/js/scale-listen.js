// Listening rules for one scale run (ringing notes must never nag). Pure; the clock is injected.
// Feed it every detected pitch; it only ever cares about the next expected note.

export const MISTAKE_HOLD_MS = 250; // a wrong note counts only after this long a stable hold
export const RECENT_IGNORED = 2;    // pitches of the last N played notes are ignored entirely

const midiOf = (n) => (typeof n === 'number' ? n : n.midi);

/**
 * `sequence`: the notes to play in order (note objects or MIDI numbers).
 * onPitch(midi, {fresh, heldMs}) -> {status: 'advance'|'ignored'|'mistake'|'done', index}
 * `index` is the next expected position after handling the pitch; 'done' comes with the last
 * note played and on every pitch after it.
 */
export function createScaleListener(sequence, { now = () => Date.now() } = {}) {
  const midis = sequence.map(midiOf);
  let index = 0;
  let startedAt = now();
  let times = [];                // when each note was played
  let mistakes = 0;
  let marked = new Set();        // pitches already counted as a mistake at this step

  const lastPlayed = () => midis.slice(Math.max(0, index - RECENT_IGNORED), index);

  function onPitch(midi, { fresh = false, heldMs = 0 } = {}) {
    if (index >= midis.length) return { status: 'done', index };
    const want = midis[index];
    if (midi === want || midi === want + 12 || midi === want - 12) {
      times.push(now());
      index += 1;
      marked = new Set();
      return { status: index >= midis.length ? 'done' : 'advance', index };
    }
    if (lastPlayed().includes(midi)) return { status: 'ignored', index };
    if (fresh && heldMs >= MISTAKE_HOLD_MS && !marked.has(midi)) {
      marked.add(midi);
      mistakes += 1;
      return { status: 'mistake', index };
    }
    return { status: 'ignored', index };
  }

  function stats() {
    const gaps = times.slice(1).map((t, i) => t - times[i]);
    const totalMs = gaps.reduce((a, b) => a + b, 0);
    const mean = gaps.length ? totalMs / gaps.length : null;
    const variance = gaps.length ? gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length : null;
    return {
      played: index, total: midis.length, done: index >= midis.length,
      totalMs, gaps, avgMs: mean,
      firstMs: times.length ? times[0] - startedAt : null,
      evenness: mean ? Math.sqrt(variance) / mean : null, // coefficient of variation of the gaps; lower is steadier
      mistakes,
    };
  }

  return {
    onPitch, stats,
    get index() { return index; },
    get expected() { return index < midis.length ? midis[index] : null; },
    get done() { return index >= midis.length; },
    get mistakes() { return mistakes; },
    reset() { index = 0; times = []; mistakes = 0; marked = new Set(); startedAt = now(); },
  };
}
