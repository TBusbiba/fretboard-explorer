import { test } from 'node:test';
import assert from 'node:assert/strict';
import { multiplierFor, speedBonus, pointsFor, shoutFor, heatFor, createCombo, createCustomBest, sanitizeBest } from '../js/combo.js';
import { createPath } from '../js/path.js';

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}

test('multiplier is 1 + floor(streak/5), capped at x5', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 19, 20, 24, 25, 100].map(multiplierFor), [1, 1, 2, 2, 3, 4, 5, 5, 5, 5]);
});

test('speed bonus: full at 1 s, zero at 6 s, linear between', () => {
  assert.equal(speedBonus(0), 100);
  assert.equal(speedBonus(1000), 100);
  assert.equal(speedBonus(3500), 50);
  assert.equal(speedBonus(6000), 0);
  assert.equal(speedBonus(20000), 0);
  assert.equal(pointsFor(1, 1000), 200);
  assert.equal(pointsFor(5, 6000), 200);
  assert.equal(pointsFor(25, 1000), 1000);
});

test('shouts at 5/10/15/20/30, then every 10 more', () => {
  assert.deepEqual([4, 5, 10, 15, 20, 25, 30, 35, 40, 50].map(shoutFor),
    [null, 'Nice!', 'Great!', 'On fire!', 'Unstoppable!', null, 'Legendary!', null, 'Legendary ×40', 'Legendary ×50']);
});

test('heat steps at 5, 10 and 20', () => {
  assert.deepEqual([0, 4, 5, 9, 10, 19, 20, 99].map(heatFor), [0, 0, 1, 1, 2, 2, 3, 3]);
});

test('run: hits build streak and score, a miss ends the streak but keeps the score', () => {
  const c = createCombo();
  let r;
  for (let i = 0; i < 5; i++) r = c.hit(1000);
  assert.equal(r.shout, 'Nice!');
  assert.equal(r.multiplier, 2);
  assert.equal(r.heat, 1);
  assert.equal(c.score, 200 * 4 + 400);
  assert.deepEqual(c.miss(), { lost: 5 });
  assert.equal(c.streak, 0);
  assert.equal(c.score, 1200);
  assert.deepEqual(c.miss(), { lost: 0 });
  assert.equal(c.bestStreak, 5);
  assert.equal(c.bestScore, 1200);
});

test('new best streak fires once, only against a real earlier record', () => {
  const first = createCombo();
  assert.ok([1, 2, 3, 4].every(() => !first.hit(1000).newBest));
  const c = createCombo({ streak: 3, score: 0 });
  const flags = [1, 2, 3, 4, 5].map(() => c.hit(1000).newBest);
  assert.deepEqual(flags, [false, false, false, true, false]);
  c.miss();
  assert.equal(c.bestStreak, 5);
  assert.ok(!c.hit(1000).newBest);
});

test('reset and setBest start a fresh run', () => {
  const c = createCombo({ streak: 2, score: 50 });
  c.hit(1000); c.reset();
  assert.equal(c.score, 0); assert.equal(c.streak, 0);
  c.setBest({ streak: 9, score: 900 });
  assert.equal(c.bestStreak, 9);
});

test('custom bests persist, keep the higher, and shrug off junk', () => {
  const st = memoryStorage();
  const a = createCustomBest(st);
  a.save({ streak: 7, score: 500 });
  a.save({ streak: 3, score: 900 });
  assert.deepEqual(createCustomBest(st).get(), { streak: 7, score: 900 });
  assert.deepEqual(sanitizeBest({ streak: -4, score: 'x' }), { streak: 0, score: 0 });
  assert.deepEqual(createCustomBest(memoryStorage({ 'fretboard-practice.custom-best.v1': '{bad' })).get(), { streak: 0, score: 0 });
});

test('path keeps best streak and score per level', () => {
  const st = memoryStorage();
  const p = createPath(st);
  assert.deepEqual(p.bests(1), { streak: 0, score: 0 });
  assert.equal(p.saveBests(1, { streak: 6, score: 800 }), true);
  assert.equal(p.saveBests(1, { streak: 2, score: 100 }), false);
  p.saveBests(1, { streak: 4, score: 1200 });
  assert.deepEqual(createPath(st).bests(1), { streak: 6, score: 1200 });
  assert.deepEqual(createPath(st).bests(2), { streak: 0, score: 0 });
  const bad = memoryStorage({ 'fretboard-practice.path.v2': JSON.stringify({ current: 1, levels: { 1: { bestStreak: -3, bestScore: 'x', recent: [], covered: [] } } }) });
  assert.deepEqual(createPath(bad).bests(1), { streak: 0, score: 0 });
});
