// Streak, combo and points for Find the note. Pure rules plus a tiny run
// tracker; no DOM and no clock. The host feeds hit(ms) / miss() and draws the result.

export const BASE_POINTS = 100;
export const SPEED_MAX = 100;       // bonus at or under FAST_MS
export const FAST_MS = 1000;
export const SLOW_MS = 6000;        // no bonus from here on
export const MULT_CAP = 5;
export const BADGE_FROM = 3;        // the x-N badge appears from this streak

const SHOUTS = { 5: 'Nice!', 10: 'Great!', 15: 'On fire!', 20: 'Unstoppable!', 30: 'Legendary!' };

/** Points multiplier: 1 + floor(streak / 5), capped at x5. */
export function multiplierFor(streak) {
  return Math.min(MULT_CAP, 1 + Math.floor(Math.max(0, streak) / 5));
}

/** 0..100: full at 1 s or faster, zero at 6 s, straight line between. */
export function speedBonus(ms) {
  if (!(ms > FAST_MS)) return SPEED_MAX;
  if (ms >= SLOW_MS) return 0;
  return Math.round(SPEED_MAX * (SLOW_MS - ms) / (SLOW_MS - FAST_MS));
}

/** Share of the speed bonus still left after `ms` (the draining bar). */
export function speedLeft(ms) { return speedBonus(ms) / SPEED_MAX; }

export function pointsFor(streak, ms) {
  return (BASE_POINTS + speedBonus(ms)) * multiplierFor(streak);
}

/** Shout for reaching exactly this streak, or null. 30 Legendary!, then every 10 more. */
export function shoutFor(streak) {
  if (SHOUTS[streak]) return SHOUTS[streak];
  if (streak > 30 && streak % 10 === 0) return `Legendary ×${streak}`;
  return null;
}

/** Heat 0..3: cyan (0-4), yellow (5-9), salmon (10-19), pink (20+). */
export function heatFor(streak) {
  return streak >= 20 ? 3 : streak >= 10 ? 2 : streak >= 5 ? 1 : 0;
}

/**
 * One run of questions. `best` = {streak, score} saved so far.
 * hit(ms): a right-first-try answer. miss(): a wrong note, hint or skip.
 */
export function createCombo(best = {}) {
  let bestStreak = Math.max(0, best.streak | 0), bestScore = Math.max(0, best.score | 0);
  let beatFrom = bestStreak;     // the record to beat in this run (set when the run starts)
  const c = {
    streak: 0, score: 0,
    get bestStreak() { return bestStreak; },
    get bestScore() { return bestScore; },
    get heat() { return heatFor(c.streak); },
    get multiplier() { return multiplierFor(c.streak); },
    hit(ms) {
      c.streak += 1;
      const points = pointsFor(c.streak, ms);
      c.score += points;
      const newBest = beatFrom >= BADGE_FROM && c.streak === beatFrom + 1;
      if (c.streak > bestStreak) bestStreak = c.streak;
      if (c.score > bestScore) bestScore = c.score;
      return { points, streak: c.streak, multiplier: multiplierFor(c.streak), heat: heatFor(c.streak), shout: shoutFor(c.streak), newBest };
    },
    /** Extra points outside a single answer (chain bonus). */
    bonus(points) {
      c.score += points;
      if (c.score > bestScore) bestScore = c.score;
      return c.score;
    },
    /** Ends the streak; `lost` is the streak that ended (0 when there was none). */
    miss() {
      const lost = c.streak;
      c.streak = 0;
      beatFrom = bestStreak;
      return { lost };
    },
    /** A fresh run (stop, level change): score back to 0, streak ended. */
    reset() { c.streak = 0; c.score = 0; beatFrom = bestStreak; },
    /** Replace the saved bests (after switching level). */
    setBest(b = {}) { bestStreak = Math.max(0, b.streak | 0); bestScore = Math.max(0, b.score | 0); beatFrom = bestStreak; c.streak = 0; c.score = 0; },
  };
  return c;
}

// ---------- Custom mode's saved bests ----------

const CUSTOM_KEY = 'fretboard-practice.custom-best.v1';

export function sanitizeBest(raw) {
  const n = (v) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  return { streak: n(raw && raw.streak), score: n(raw && raw.score) };
}

export function createCustomBest(storage = globalThis.localStorage) {
  let data = { streak: 0, score: 0 };
  try { const raw = storage && storage.getItem(CUSTOM_KEY); if (raw) data = sanitizeBest(JSON.parse(raw)); } catch { data = { streak: 0, score: 0 }; }
  return {
    get: () => ({ ...data }),
    /** Keep the higher of each. */
    save(b) {
      const s = sanitizeBest(b);
      data = { streak: Math.max(data.streak, s.streak), score: Math.max(data.score, s.score) };
      try { storage && storage.setItem(CUSTOM_KEY, JSON.stringify(data)); } catch { /* ignore */ }
    },
  };
}
