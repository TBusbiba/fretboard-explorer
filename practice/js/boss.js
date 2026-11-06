// Find-the-note boss fight: pure logic, no DOM. Cumulative in two phases.
// Phase 'new': every spot of the level's new note(s), left to right (path.js orderSpots).
// Phase 'rapid': 2-3 random spots of every earlier note, mixed, with a per-spot countdown.
// Level 1 has no earlier notes: its last third (of all E and A spots) becomes the rapid phase.
// Three lives, an HP bar the player drains faster the faster they answer.

import { STRINGS, pitchClass } from './notes.js';
import { MAX_FRET, levelRange, noteSpots, starsFor } from './path.js';

export const LIVES = 3;
export const HIT_DAMAGE = 100;
export const FAST_MS = 1000;   // full damage at or under this
export const SLOW_MS = 4000;   // half damage at or over this
export const RAPID_CAP = 24;   // most spots in the rapid phase
export const COUNTDOWN_MS = [6000, 5000, 4000]; // per third of the rapid phase

/** Damage for an answer taking `ms`: full <=1 s, half >=4 s, linear between. */
export function damageFor(ms) {
  const k = ms <= FAST_MS ? 1 : ms >= SLOW_MS ? 0.5 : 1 - 0.5 * (ms - FAST_MS) / (SLOW_MS - FAST_MS);
  return Math.round(HIT_DAMAGE * k);
}

const midiOf = (s) => STRINGS[s.string].midi + s.fret;

/** Random order that avoids the same note twice in a row when another note is left. */
function mix(spots, rng) {
  const left = [...spots], out = [];
  while (left.length) {
    const last = out[out.length - 1];
    const count = (pc) => left.filter(s => s.pc === pc).length;
    let pcs = [...new Set(left.map(s => s.pc))].filter(pc => !last || pc !== last.pc);
    if (!pcs.length) pcs = [left[0].pc];
    const most = Math.max(...pcs.map(count));
    pcs = pcs.filter(pc => count(pc) === most);
    const pc = pcs[Math.floor(rng() * pcs.length)];
    const pool = left.filter(s => s.pc === pc);
    const pick = pool[Math.floor(rng() * pool.length)];
    left.splice(left.indexOf(pick), 1);
    out.push(pick);
  }
  return out;
}

/** 2 random spots per note (1 if it has only one), a third for some while under the cap. */
function rapidSpots(pcs, r, rng) {
  const pools = pcs.map(pc => noteSpots(pc, r).map(s => ({ ...s, pc })));
  const counts = pools.map(p => Math.min(2, p.length));
  let total = counts.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pools.length; i++) {
    if (total < RAPID_CAP && counts[i] < Math.min(3, pools[i].length) && rng() < 0.5) { counts[i]++; total++; }
  }
  const out = [];
  pools.forEach((p, i) => {
    const bag = [...p];
    for (let k = 0; k < counts[i]; k++) out.push(...bag.splice(Math.floor(rng() * bag.length), 1));
  });
  return mix(out, rng);
}

export function createBossFight(level, range = { from: 0, to: MAX_FRET }, { rng = Math.random } = {}) {
  const r = levelRange(level, range);
  const earlier = level.notes.filter(pc => !level.added.includes(pc));
  let fresh = level.added.flatMap(pc => noteSpots(pc, r).map(s => ({ ...s, pc })));
  let rapid;
  if (earlier.length) rapid = rapidSpots(earlier, r, rng);
  else {
    const tail = Math.floor(fresh.length / 3);
    rapid = mix(fresh.slice(fresh.length - tail), rng);
    fresh = fresh.slice(0, fresh.length - tail);
  }
  const phased = (list, phase) => list.map((s, i) => ({ ...s, phase, n: i + 1, of: list.length }));
  const items = [...phased(fresh, 'new'), ...phased(rapid, 'rapid')];
  items.forEach((s, i) => { s.finish = i === items.length - 1; });

  const f = {
    levelId: level.id, range: r, items, index: 0, times: [], livesLost: 0,
    maxHp: HIT_DAMAGE * items.length, hp: HIT_DAMAGE * items.length, lastDamage: 0,
    state: items.length ? 'running' : 'lost', spotsMissed: 0,
    get n() { return Math.min(f.index + 1, items.length); },
    get of() { return items.length; },
    get lives() { return LIVES - f.livesLost; },
    get mistakes() { return f.livesLost; },
    get phase() { const c = items[Math.min(f.index, items.length - 1)]; return c ? c.phase : 'new'; },
    get avgMs() { return f.times.length ? f.times.reduce((a, b) => a + b, 0) / f.times.length : null; },
    get totalMs() { return f.times.reduce((a, b) => a + b, 0); },
    get stars() { return f.state === 'won' ? starsFor(f.avgMs ?? Infinity, f.livesLost) : 0; },
    /** Spots of the current phase already done, in order. */
    get found() { const c = f.current(); return c ? items.slice(0, f.index).filter(i => i.phase === c.phase) : []; },
    get runStart() { const c = f.current(); return !!c && c.n === 1; },
    current() { return f.state === 'running' ? items[f.index] : null; },
    /** Milliseconds allowed for the current spot; null in the new-note phase. */
    timeLimitMs() {
      const c = f.current();
      if (!c || c.phase !== 'rapid') return null;
      return COUNTDOWN_MS[Math.min(2, Math.floor(((c.n - 1) * 3) / c.of))];
    },
    /** `target`: a midi number (exact pitch of the spot) or a {string, fret} spot. */
    answer(target, ms = 0) {
      const c = f.current();
      if (!c) return { result: f.state, damage: 0, finish: false };
      const ok = typeof target === 'number' ? target === midiOf(c) : (target.string === c.string && target.fret === c.fret) || (target.midi != null && target.midi === midiOf(c));
      if (!ok) {
        if (c.hurt) return { result: 'wrong', damage: 0, finish: false };
        c.hurt = true; f.livesLost++;
        return { result: f.lives <= 0 ? lose() : 'wrong', damage: 0, finish: false };
      }
      const damage = damageFor(ms);
      f.times.push(ms);
      f.lastDamage = damage;
      f.hp = Math.max(0, f.hp - damage);
      return { result: advance(), damage, finish: c.finish };
    },
    /** The countdown ran out: costs a life, spot counts as missed, moves on. */
    timeout() {
      const c = f.current();
      if (!c) return { result: f.state, damage: 0, finish: false };
      f.livesLost++; f.spotsMissed++; f.lastDamage = 0;
      if (f.lives <= 0) return { result: lose(), damage: 0, finish: false };
      return { result: advance() === 'won' ? 'won' : 'hit', damage: 0, finish: c.finish };
    },
    summary() {
      return { won: f.state === 'won', stars: f.stars, avgMs: f.avgMs, livesLost: f.livesLost, spots: items.length, missed: f.spotsMissed, totalMs: f.totalMs };
    },
  };
  function lose() { f.state = 'lost'; return 'lost'; }
  function advance() {
    f.index++;
    if (f.index >= items.length) { f.state = 'won'; f.hp = 0; return 'won'; }
    return 'hit';
  }
  return f;
}
