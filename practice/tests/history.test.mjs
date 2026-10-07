import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHistory, mastery, band } from '../js/history.js';

function memStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k) };
}

test('records positions and summarises them', () => {
  const st = memStorage();
  const h = createHistory(st);
  assert.ok(h.empty);
  h.recordPosition({ string: 4, fret: 3 }, { clean: true, ms: 1000 });
  h.recordPosition({ string: 4, fret: 3 }, { clean: false, ms: 3000, hinted: true });
  h.recordPosition({ string: 4, fret: 3 }, { skipped: true });
  const [p] = h.positions();
  assert.equal(p.string, 4); assert.equal(p.fret, 3);
  assert.equal(p.n, 3); assert.equal(p.cleanRate, 1 / 3);
  assert.equal(p.avgMs, 2000); assert.equal(p.hints, 1); assert.equal(p.skips, 1);
  assert.ok(p.mastery > 0 && p.mastery < 1);
  assert.equal(p.confidence, 3 / 5);
  assert.ok(!h.empty);
});

test('persists across instances and resets', () => {
  const st = memStorage();
  createHistory(st).recordInterval('fifth', { clean: true, ms: 1200 });
  const h = createHistory(st);
  assert.equal(h.intervals()[0].id, 'fifth');
  h.reset();
  assert.ok(createHistory(st).empty);
});

test('mastery blends clean rate and speed; bands are stable', () => {
  assert.equal(mastery({ n: 0 }), null);
  assert.equal(mastery({ n: 4, clean: 4, solved: 4, msTotal: 4000 }), 1);          // all clean, 1 s
  assert.equal(mastery({ n: 4, clean: 0, solved: 4, msTotal: 40000 }), 0);         // never clean, 10 s
  const mid = mastery({ n: 4, clean: 2, solved: 4, msTotal: 15000 });              // 50% clean, 3.75 s
  assert.ok(mid > 0.4 && mid < 0.7);
  assert.equal(band(0.9), 'strong'); assert.equal(band(0.5), 'ok'); assert.equal(band(0.1), 'weak'); assert.equal(band(null), null);
});

test('positions are sorted weakest first', () => {
  const h = createHistory(memStorage());
  h.recordPosition({ string: 0, fret: 1 }, { clean: true, ms: 800 });
  h.recordPosition({ string: 1, fret: 2 }, { clean: false, ms: 7000 });
  assert.deepEqual(h.positions().map(p => p.fret), [2, 1]);
});

test('survives corrupt storage', () => {
  const st = memStorage(); st.setItem('fretboard-practice.history.v1', '{not json');
  assert.ok(createHistory(st).empty);
});
