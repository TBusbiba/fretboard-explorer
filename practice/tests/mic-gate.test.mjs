import test from 'node:test';
import assert from 'node:assert/strict';
import { createMicGate, PLAYBACK_GRACE_MS, SPEECH_GRACE_MS } from '../js/mic-gate.js';

test('open until something plays', () => {
  const g = createMicGate();
  assert.equal(g.isMuted(0), false);
});

test('muted while a note plays and for the grace period after it ends', () => {
  const g = createMicGate();
  g.block('sound', true, 100);
  assert.equal(g.isMuted(5000), true);
  g.block('sound', false, 5000);
  assert.equal(g.isMuted(5000 + 300), true);
  assert.equal(g.isMuted(5000 + PLAYBACK_GRACE_MS - 1), true);
  assert.equal(g.isMuted(5000 + PLAYBACK_GRACE_MS), false);
});

test('the voice has its own, shorter grace', () => {
  const g = createMicGate();
  g.block('voice', true, 0);
  g.block('voice', false, 1000);
  assert.equal(g.isMuted(1000 + SPEECH_GRACE_MS - 1), true);
  assert.equal(g.isMuted(1000 + SPEECH_GRACE_MS), false);
});

test('a new sound during the grace keeps it muted and restarts the grace', () => {
  const g = createMicGate();
  g.block('sound', true, 0);
  g.block('sound', false, 1000);
  g.block('sound', true, 1200);
  assert.equal(g.isMuted(1500), true);
  g.block('sound', false, 2000);
  assert.equal(g.isMuted(2000 + PLAYBACK_GRACE_MS - 1), true);
  assert.equal(g.isMuted(2000 + PLAYBACK_GRACE_MS), false);
});

test('the longest grace wins when the voice ends after a note', () => {
  const g = createMicGate();
  g.block('sound', true, 0);
  g.block('voice', true, 0);
  g.block('sound', false, 1000);
  g.block('voice', false, 1100);
  assert.equal(g.isMuted(1100 + SPEECH_GRACE_MS), true);
  assert.equal(g.isMuted(1000 + PLAYBACK_GRACE_MS), false);
});

test('stopping a source that was never started changes nothing', () => {
  const g = createMicGate();
  g.block('sound', false, 0);
  assert.equal(g.isMuted(1), false);
});
