import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScaleListener, MISTAKE_HOLD_MS } from '../js/scale-listen.js';

const clock = () => { let t = 0; const f = () => t; f.set = (v) => { t = v; }; f.tick = (d) => { t += d; }; return f; };
const SEQ = [45, 48, 50, 52, 55];
const fresh = { fresh: true, heldMs: 400 };

test('advances immediately on the expected midi and finishes', () => {
  const now = clock(), l = createScaleListener(SEQ, { now });
  assert.deepEqual(l.onPitch(45), { status: 'advance', index: 1 });
  assert.deepEqual(l.onPitch(48), { status: 'advance', index: 2 });
  l.onPitch(50); l.onPitch(52);
  assert.deepEqual(l.onPitch(55), { status: 'done', index: 5 });
  assert.deepEqual(l.onPitch(60, fresh), { status: 'done', index: 5 });
  assert.ok(l.done);
});

test('accepts octave slips of the expected note', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.onPitch(57).status, 'advance');   // 45 + 12
  assert.equal(l.onPitch(36).status, 'advance');   // 48 - 12
  assert.equal(l.index, 2);
});

test('the last two played notes are ignored, even as fresh long attacks', () => {
  const l = createScaleListener(SEQ);
  l.onPitch(45); l.onPitch(48);
  assert.deepEqual(l.onPitch(45, fresh), { status: 'ignored', index: 2 });
  assert.deepEqual(l.onPitch(48, fresh), { status: 'ignored', index: 2 });
  assert.equal(l.mistakes, 0);
});

test('a note three back is no longer protected', () => {
  const l = createScaleListener(SEQ);
  l.onPitch(45); l.onPitch(48); l.onPitch(50);
  assert.equal(l.onPitch(45, fresh).status, 'mistake');
});

test('a wrong pitch is a mistake only when fresh and held long enough', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.onPitch(60, { fresh: false, heldMs: 900 }).status, 'ignored');
  assert.equal(l.onPitch(60, { fresh: true, heldMs: MISTAKE_HOLD_MS - 1 }).status, 'ignored');
  assert.equal(l.onPitch(60, {}).status, 'ignored');
  assert.deepEqual(l.onPitch(60, { fresh: true, heldMs: MISTAKE_HOLD_MS }), { status: 'mistake', index: 0 });
  assert.equal(l.mistakes, 1);
});

test('at most one mistake per pitch per step; a new step or pitch counts again', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.onPitch(60, fresh).status, 'mistake');
  assert.equal(l.onPitch(60, fresh).status, 'ignored');
  assert.equal(l.onPitch(61, fresh).status, 'mistake');
  l.onPitch(45); l.onPitch(48);
  l.onPitch(70, fresh);
  l.onPitch(52 - 2); // advance step 2 (50)
  assert.equal(l.onPitch(70, fresh).status, 'mistake');
  assert.equal(l.mistakes, 4);
});

test('a mistake never blocks the expected note', () => {
  const l = createScaleListener(SEQ);
  l.onPitch(60, fresh);
  assert.equal(l.onPitch(45).status, 'advance');
});

test('accepts note objects as the sequence', () => {
  const l = createScaleListener([{ midi: 45 }, { midi: 48 }]);
  l.onPitch(45);
  assert.equal(l.onPitch(48).status, 'done');
});

test('stats: total time, gaps, evenness and mistakes', () => {
  const now = clock(), l = createScaleListener(SEQ, { now });
  now.set(1000); l.onPitch(45);
  now.set(1500); l.onPitch(48);
  now.set(2000); l.onPitch(50);
  now.set(2500); l.onPitch(52);
  now.set(3000); l.onPitch(55);
  const s = l.stats();
  assert.equal(s.firstMs, 1000);
  assert.deepEqual(s.gaps, [500, 500, 500, 500]);
  assert.equal(s.totalMs, 2000);
  assert.equal(s.avgMs, 500);
  assert.equal(s.evenness, 0);
  assert.equal(s.mistakes, 0);
  assert.ok(s.done);
});

test('stats: uneven playing has a higher evenness', () => {
  const play = (gaps) => {
    const now = clock(), l = createScaleListener([1, 2, 3, 4, 5], { now });
    let t = 0; l.onPitch(1);
    gaps.forEach((g, i) => { t += g; now.set(t); l.onPitch(i + 2); });
    return l.stats();
  };
  const steady = play([400, 400, 400, 400]), ragged = play([200, 800, 200, 800]);
  assert.ok(ragged.evenness > steady.evenness);
  assert.ok(Math.abs(ragged.evenness - 0.6) < 1e-9);
});

test('stats before two notes have no gaps; reset starts over', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.stats().evenness, null);
  l.onPitch(45); l.onPitch(60, fresh);
  l.reset();
  assert.equal(l.index, 0); assert.equal(l.mistakes, 0); assert.equal(l.expected, 45);
});
