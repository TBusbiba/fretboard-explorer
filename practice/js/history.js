// Long-term practice history for the heatmap: per note position and per
// interval. Persisted in localStorage; `storage` is injectable for tests.
//
// A "clean" answer is correct, first try, without any hint. Mastery blends how
// often a position is clean with how fast it is found.

const KEY = 'fretboard-practice.history.v1';
const FAST_MS = 1500;   // this quick or faster = full speed score
const SLOW_MS = 6000;   // this slow or slower = zero speed score

function blank() { return { positions: {}, intervals: {}, chords: {}, triads: {} }; }

function entry(map, key) {
  return map[key] || (map[key] = { n: 0, clean: 0, solved: 0, msTotal: 0, hints: 0, skips: 0 });
}

function record(e, { clean = false, ms = null, hinted = false, skipped = false }) {
  e.n += 1;
  if (skipped) { e.skips += 1; return; }
  e.solved += 1;
  if (clean) e.clean += 1;
  if (hinted) e.hints += 1;
  if (ms != null) e.msTotal += ms;
}

export function mastery(e) {
  if (!e || e.n === 0) return null;
  const cleanRate = e.clean / e.n;
  const avgMs = e.solved ? e.msTotal / e.solved : SLOW_MS;
  const speed = Math.min(1, Math.max(0, (SLOW_MS - avgMs) / (SLOW_MS - FAST_MS)));
  return 0.6 * cleanRate + 0.4 * speed;
}

/** 0 (needs work) .. 5 (solid), or null when unpractised. */
export function level(score) {
  if (score == null) return null;
  return Math.min(5, Math.floor(score * 6));
}

export function band(score) {
  if (score == null) return null;
  return score >= 0.7 ? 'strong' : score >= 0.4 ? 'ok' : 'weak';
}

function summarize(key, e) {
  return {
    key,
    n: e.n,
    cleanRate: e.n ? e.clean / e.n : 0,
    avgMs: e.solved ? Math.round(e.msTotal / e.solved) : null,
    hints: e.hints,
    skips: e.skips,
    mastery: mastery(e),
    band: band(mastery(e)),
    level: level(mastery(e)),
    confidence: Math.min(1, e.n / 5),   // 5 tries = fully confident
  };
}

export function createHistory(storage = globalThis.localStorage) {
  let data = blank();
  try {
    const raw = storage && storage.getItem(KEY);
    if (raw) data = { ...blank(), ...JSON.parse(raw) };
  } catch { data = blank(); }

  function save() {
    try { storage && storage.setItem(KEY, JSON.stringify(data)); } catch { /* ignore */ }
  }

  return {
    recordPosition({ string, fret }, result) {
      record(entry(data.positions, `${string}:${fret}`), result);
      save();
    },
    recordInterval(id, result) {
      record(entry(data.intervals, id), result);
      save();
    },
    /** All practised positions, weakest first. */
    positions() {
      return Object.entries(data.positions)
        .map(([key, e]) => {
          const [string, fret] = key.split(':').map(Number);
          return { string, fret, ...summarize(key, e) };
        })
        .sort((a, b) => a.mastery - b.mastery);
    },
    intervals() {
      return Object.entries(data.intervals)
        .map(([id, e]) => ({ id, ...summarize(id, e) }))
        .sort((a, b) => a.mastery - b.mastery);
    },
    recordChord(id, result) {
      record(entry(data.chords, id), result);
      save();
    },
    chords() {
      return Object.entries(data.chords || {})
        .map(([id, e]) => ({ id, ...summarize(id, e) }))
        .sort((a, b) => a.mastery - b.mastery);
    },
    recordTriad(id, result) {
      record(entry(data.triads || (data.triads = {}), id), result);
      save();
    },
    triads() {
      return Object.entries(data.triads || {})
        .map(([id, e]) => ({ id, ...summarize(id, e) }))
        .sort((a, b) => a.mastery - b.mastery);
    },
    get empty() { return ['positions', 'intervals', 'chords', 'triads'].every(k => Object.keys(data[k] || {}).length === 0); },
    reset() { data = blank(); save(); },
  };
}
