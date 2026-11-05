import test from 'node:test';
import assert from 'node:assert/strict';
import { createAttackGuard } from '../js/attack.js';

const GATE = 0.01;

test('a ringing note cannot answer the next question', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  for (let t = 100; t <= 3000; t += 20) g.update(0.2 * Math.exp(-t / 2500), GATE, t); // slow decay, still above gate
  assert.equal(g.blocks(69), true);
});

test('other pitches are never blocked', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  assert.equal(g.blocks(70), false);
});

test('a fresh pluck over the decayed ring lifts the block', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  for (let t = 100; t <= 1500; t += 20) g.update(0.2 * Math.exp(-t / 800), GATE, t);
  g.update(0.15, GATE, 1520);
  assert.equal(g.blocks(69), false);
});

test('silence lifts the block', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  g.update(0.005, GATE, 400); g.update(0.005, GATE, 600);
  assert.equal(g.blocks(69), false);
});

test('a short dip under the gate does not', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  g.update(0.009, GATE, 400); g.update(0.012, GATE, 460);
  assert.equal(g.blocks(69), true);
});

test('the onset of the reported note itself is not an attack', () => {
  const g = createAttackGuard();
  g.arm(69, 0.1, 0);
  g.update(0.15, GATE, 50);
  assert.equal(g.blocks(69), true);
});

test('a loud sound while the mic is muted (the app speaking) is not an attack', () => {
  const g = createAttackGuard();
  g.arm(69, 0.1, 0);
  for (let t = 200; t < 1500; t += 20) g.update(0.3, GATE, t, true);
  assert.equal(g.blocks(69), true);
});

test('wobble in the ring does not count', () => {
  const g = createAttackGuard();
  g.arm(69, 0.2, 0);
  for (let t = 200; t < 2000; t += 20) g.update(0.1 * (1 + 0.2 * Math.sin(t / 40)), GATE, t);
  assert.equal(g.blocks(69), true);
});
