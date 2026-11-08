// Pure helpers for the Scales screen: what is said, the points, the run's verdict.

import { NOTE_NAMES, spokenName } from './notes.js';
import { SCALES } from './scales.js';
import { SCALE_LEVELS, exerciseRun, scaleStarsFor, AVG_NOTE_MS_MAX } from './scale-path.js';

const part = (scale, many) => (scale === 'major' ? (many ? 'Positions' : 'Position') : many ? 'Boxes' : 'Box');

/** "A minor pentatonic!" and "Box 1!" (or "Boxes 1 and 2!"): two recorded clips, played back to back. */
export function spokenPrompt(e) {
  const many = e.boxes.length > 1;
  const where = `${part(e.scale, many)} ${e.boxes.join(' and ')}!`;
  return `${spokenName(NOTE_NAMES[e.rootPc])} ${SCALES[e.scale].name}! ${where}`;
}

/** What the Path says: the scale clip only when the root or scale differs from the previous run, else just the box clip. */
export function announceText(e, prev) {
  const full = spokenPrompt(e);
  if (!prev || prev.rootPc !== e.rootPc || prev.scale !== e.scale) return full;
  return full.slice(full.indexOf('!') + 1).trim();
}

/** Every phrase the Path can say (the recording list and the preload list). */
export function scaleClipPhrases() {
  const out = new Set();
  const add = (text) => text.split(/(?<=!)\s*/).filter(Boolean).forEach(s => out.add(s));
  for (const l of SCALE_LEVELS) for (const e of l.pool) add(spokenPrompt(e));
  return [...out];
}

export const FULL_POINTS = 100;
export const MISTAKE_POINTS = 50;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** Points for one note by the time since the last one; the first note of a run scores the base. */
export function notePoints(gapMs) {
  if (gapMs == null) return FULL_POINTS;
  return Math.round(FULL_POINTS * clamp(AVG_NOTE_MS_MAX / Math.max(gapMs, 1), 0.25, 2));
}

/** A steady hand (low spread of the gaps) earns a bonus on the finished run. */
export function steadyBonus(evenness) {
  if (evenness == null) return 1;
  return evenness <= 0.15 ? 1.2 : evenness <= 0.3 ? 1.1 : 1;
}

/** Live score: the points so far minus the soft mistakes. */
export function liveScore(gaps, played, mistakes) {
  if (!played) return 0;
  return Math.max(0, notePoints(null) + gaps.reduce((s, g) => s + notePoints(g), 0) - MISTAKE_POINTS * mistakes);
}

/** The finished run's score (steadiness bonus included). */
export function runScore(stats) {
  const raw = notePoints(null) + stats.gaps.reduce((s, g) => s + notePoints(g), 0);
  return Math.max(0, Math.round(raw * steadyBonus(stats.evenness)) - MISTAKE_POINTS * stats.mistakes);
}

/** 1-3 stars for a finished run: the boss thresholds on its average gap and mistakes. */
export function runStars(stats) {
  return stats.avgMs == null ? 1 : scaleStarsFor(stats.avgMs, stats.mistakes);
}

/** Sum several runs' stats into one (boss): gaps are kept per run so evenness stays honest. */
export function combineStats(list) {
  const gaps = list.flatMap(s => s.gaps);
  const totalMs = gaps.reduce((a, b) => a + b, 0);
  return {
    total: list.reduce((n, s) => n + s.total, 0),
    gaps, totalMs,
    avgMs: gaps.length ? totalMs / gaps.length : null,
    mistakes: list.reduce((n, s) => n + s.mistakes, 0),
  };
}

export { exerciseRun };
