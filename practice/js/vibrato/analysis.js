// Vibrato analysis. Pure functions, no DOM, no audio.
//
// Input: a pitch contour in cents relative to the fretted note (0 = the note).
// Fretted mode: the "home" is 0 and each cycle pushes UP to +depth and back.
// Bend mode: the home is the bend target (+bendCents) and each cycle dips DOWN
// by `depth` and back; going above the target is an error.
//
// Cycles are found from local extremes with hysteresis. Per cycle we get the
// excursion (how far from home), the return (how close to home it came back),
// and the period. From ≥ 2 cycles we derive rate, depth, evenness and return,
// a 0..100 score, and the single most important problem to fix.

export const RATE_MIN = 4, RATE_MAX = 7.5;      // musically pleasing range (Hz)

export function createAnalyzer({ mode = 'fretted', depth = 100, bendCents = 200, windowMs = 1800 } = {}) {
  const pts = [];                                 // {t (s), c (cents)}
  const home = mode === 'bend' ? bendCents : 0;
  const dir = mode === 'bend' ? -1 : 1;           // +1 excursions go up, -1 down

  function push(t, c) {
    pts.push({ t, c });
    while (pts.length && t - pts[0].t > windowMs / 1000 + 0.5) pts.shift();
  }

  /** Local extremes with hysteresis h (cents). Returns [{t, c, kind:'far'|'home'}] in time order. */
  function extremes(h) {
    const out = [];
    if (pts.length < 3) return out;
    let candidate = pts[0], lookingFor = 'far';       // start by looking for the first far point
    for (const p of pts) {
      const rel = dir * (p.c - candidate.c);         // >0 = further from home than the candidate
      if (lookingFor === 'far') {
        if (rel > 0) candidate = p;
        else if (rel < -h) { out.push({ ...candidate, kind: 'far' }); candidate = p; lookingFor = 'home'; }
      } else {
        if (rel < 0) candidate = p;
        else if (rel > h) { out.push({ ...candidate, kind: 'home' }); candidate = p; lookingFor = 'far'; }
      }
    }
    return out;
  }

  function analyze() {
    const h = Math.max(12, depth * 0.3);
    const ex = extremes(h);
    const cycles = [];
    for (let i = 0; i < ex.length; i++) {
      if (ex[i].kind !== 'far') continue;
      const before = ex[i - 1] && ex[i - 1].kind === 'home' ? ex[i - 1] : null;
      const after = ex[i + 1] && ex[i + 1].kind === 'home' ? ex[i + 1] : null;
      if (!after) continue;                           // the current push isn't finished
      const excursion = dir * (ex[i].c - home);       // positive = the right direction
      const ret = after.c - home;                     // signed: + sharp, - flat
      const period = before ? (after.t - before.t) : null;
      cycles.push({ t: ex[i].t, excursion, ret, period, far: ex[i], homePt: after });
    }
    const n = cycles.length;
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const std = (a) => { const m = mean(a); return Math.sqrt(mean(a.map(v => (v - m) ** 2))); };
    const result = { cycles, n, rate: null, depth: null, evenness: null, ret: null, overshoot: 0, score: null, problem: null };
    if (n < 2) return result;

    const exc = cycles.map(c => c.excursion);
    const periods = cycles.filter(c => c.period).map(c => c.period);
    result.depth = mean(exc);
    result.evenness = std(exc);
    result.ret = mean(cycles.map(c => c.ret));
    result.rate = periods.length ? 1 / mean(periods) : null;
    result.rateJitter = periods.length > 1 ? std(periods) / mean(periods) : 0;
    // bend mode: how far above the target the return points went
    result.overshoot = mode === 'bend' ? Math.max(0, ...cycles.map(c => c.ret)) : 0;

    // penalties -> score and the biggest problem
    const pen = [];
    const depthErr = result.depth - depth;
    pen.push({ code: depthErr > 0 ? 'too-deep' : 'too-shallow', w: Math.min(40, 40 * Math.abs(depthErr) / depth) });
    pen.push({ code: result.ret > 0 ? 'ret-sharp' : 'ret-flat', w: Math.min(25, 25 * Math.abs(result.ret) / 35) });
    pen.push({ code: 'uneven', w: Math.min(25, 25 * result.evenness / (0.3 * depth)) });
    if (result.rate != null) {
      const off = result.rate > RATE_MAX ? result.rate - RATE_MAX : result.rate < RATE_MIN ? RATE_MIN - result.rate : 0;
      pen.push({ code: result.rate > RATE_MAX ? 'too-fast' : 'too-slow', w: Math.min(20, 20 * off / 2) });
      pen.push({ code: 'rate-jitter', w: Math.min(15, 15 * result.rateJitter / 0.25) });
    }
    if (mode === 'bend') pen.push({ code: 'overshoot', w: Math.min(30, 30 * result.overshoot / 40) });
    result.score = Math.max(0, Math.round(100 - pen.reduce((a, p) => a + p.w, 0)));
    const worst = pen.reduce((a, p) => (p.w > a.w ? p : a), { w: 0 });
    result.problem = worst.w >= 6 ? describe(worst.code, result, { mode, depth }) : { code: 'good', text: 'Even and in tune.', tip: 'Keep the motion relaxed; this is the feel to memorise.' };
    return result;
  }

  return { push, analyze, get points() { return pts; }, home, dir };
}

export function describe(code, r, { mode, depth }) {
  const c = (v) => `${Math.round(v)}¢`;
  switch (code) {
    case 'too-deep': return { code, text: `Going too ${mode === 'bend' ? 'far down' : 'high'} — ${c(r.depth)} against a ${c(depth)} target.`, tip: mode === 'bend' ? 'Release less of the bend on each dip.' : 'Push the string less; stop at the target line.' };
    case 'too-shallow': return { code, text: `Not reaching the target — about ${c(r.depth)} of ${c(depth)}.`, tip: 'Commit to the movement; make every cycle touch the target line.' };
    case 'ret-sharp': return { code, text: mode === 'bend' ? `Returning above the target by ${c(r.ret)}.` : `Not coming back to the note — sitting ${c(r.ret)} sharp between pushes.`, tip: mode === 'bend' ? 'Bring the string back to pitch, not past it.' : 'Relax fully at the bottom of each cycle; the note is home.' };
    case 'ret-flat': return { code, text: mode === 'bend' ? `Not getting back up to the target — ${c(-r.ret)} short each time.` : `Dropping below the note by ${c(-r.ret)} between pushes.`, tip: mode === 'bend' ? 'Each cycle should finish back on the target line.' : 'Keep the fretting pressure steady; don’t let the pitch sag.' };
    case 'uneven': return { code, text: `Uneven — depth varies by ±${c(r.evenness)} from cycle to cycle.`, tip: 'Slow down until every push reaches the same height.' };
    case 'too-fast': return { code, text: `Too fast — ${r.rate.toFixed(1)} Hz reads as nervous.`, tip: 'Aim for 5–6 cycles a second.' };
    case 'too-slow': return { code, text: `Too slow — ${r.rate.toFixed(1)} Hz sounds like a wobble.`, tip: 'Aim for 5–6 cycles a second.' };
    case 'rate-jitter': return { code, text: 'The speed keeps changing from cycle to cycle.', tip: 'Lock into one steady pulse; count “one-and-two-and”.' };
    case 'overshoot': return { code, text: `Overshooting above the bend target by ${c(r.overshoot)}.`, tip: 'On a bend, the vibrato dips below the target and comes back — never above it.' };
    default: return { code: 'good', text: 'Even and in tune.', tip: '' };
  }
}

/** Colour band for one contour point: inside the corridor, near it, or off. */
export function pointBand(c, { mode = 'fretted', depth = 100, bendCents = 200 } = {}) {
  const lo = mode === 'bend' ? bendCents - depth : 0;
  const hi = mode === 'bend' ? bendCents : depth;
  const d = c < lo ? lo - c : c > hi ? c - hi : 0;
  return d <= 15 ? 'ok' : d <= 40 ? 'warn' : 'bad';
}
