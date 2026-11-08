import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScaleListener } from '../js/scale-listen.js';

const SEQ = [40, 42, 44, 44, 45];
const stable = (a, h = 400) => ({ fresh: true, heldMs: h, attackId: a });

test('fast lane accepts the expected note on the first clear frame', () => {
  const l = createScaleListener(SEQ);
  assert.deepEqual(l.onClear(40, { fresh: true, attackId: 1 }), { status: 'advance', index: 1 });
});

test('fast then stable of the same attack does not advance twice', () => {
  const l = createScaleListener(SEQ);
  l.onClear(40, { attackId: 1 });
  l.onClear(42, { attackId: 2 });
  assert.equal(l.onPitch(42, stable(2)).status, 'ignored');
  assert.equal(l.index, 2);
});

test('a repeated note needs a new attack', () => {
  const l = createScaleListener(SEQ);
  l.onClear(40, { attackId: 1 }); l.onClear(42, { attackId: 2 }); l.onClear(44, { attackId: 3 });
  assert.equal(l.onClear(44, { attackId: 3 }).status, 'ignored');
  assert.equal(l.onPitch(44, stable(3)).status, 'ignored');
  assert.equal(l.index, 3);
  assert.equal(l.onClear(44, { attackId: 4 }).status, 'advance');
});

test('a wrong note on the fast lane is ignored and never a mistake', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.onClear(60, { fresh: true, heldMs: 900, attackId: 1 }).status, 'ignored');
  assert.equal(l.mistakes, 0);
  assert.equal(l.onPitch(60, stable(1, 249)).status, 'ignored');
  assert.equal(l.onPitch(60, stable(1, 250)).status, 'mistake');
});

test('without attackId (fast lane off) onPitch behaves as before', () => {
  const l = createScaleListener([44, 44, 45]);
  assert.equal(l.onPitch(44).status, 'advance');
  assert.equal(l.onPitch(44).status, 'advance');
});

test('fast lane takes the expected note an octave off, like the stable path', () => {
  const l = createScaleListener(SEQ);
  assert.equal(l.onClear(52, { attackId: 1 }).status, 'advance');
});
