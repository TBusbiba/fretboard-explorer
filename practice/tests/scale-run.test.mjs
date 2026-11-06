import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenPrompt, scaleClipPhrases, notePoints, liveScore, runScore, runStars, combineStats } from '../js/scale-run.js';
import { clipFiles } from '../js/clips.js';

test('spoken prompts split into a scale clip and a box clip', () => {
  assert.equal(spokenPrompt({ scale: 'minorPentatonic', rootPc: 9, boxes: [1] }), 'A minor pentatonic! Box 1!');
  assert.equal(spokenPrompt({ scale: 'majorPentatonic', rootPc: 7, boxes: [1, 2] }), 'G major pentatonic! Boxes 1 and 2!');
  assert.equal(spokenPrompt({ scale: 'major', rootPc: 1, boxes: [3] }), 'C sharp major! Position 3!');
});

test('every phrase of the clip list is one segment and every Path prompt is covered by it', () => {
  const list = scaleClipPhrases();
  assert.ok(list.length > 10 && list.length < 60, `${list.length} phrases`);
  assert.ok(list.every(p => /!$/.test(p) && p.split('!').filter(Boolean).length === 1));
  const manifest = Object.fromEntries(list.map(p => [p.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(), 'x.mp3']));
  assert.deepEqual(clipFiles('A minor pentatonic! Box 4!', manifest), ['x.mp3', 'x.mp3']);
  assert.deepEqual(clipFiles('C major! Positions 1 and 2!', manifest), ['x.mp3', 'x.mp3']);
});

test('quicker notes score more, mistakes cost, steadiness adds a bonus', () => {
  assert.equal(notePoints(700), 100);
  assert.ok(notePoints(350) > notePoints(700));
  assert.equal(notePoints(5), 200);
  assert.equal(liveScore([], 0, 0), 0);
  assert.equal(liveScore([700, 700], 3, 1), 250);
  const base = { gaps: [700, 700], evenness: 0.5, mistakes: 0 };
  assert.equal(runScore(base), 300);
  assert.equal(runScore({ ...base, evenness: 0.1 }), 360);
  assert.equal(runScore({ ...base, mistakes: 7 }), 0);
});

test('stars and combined stats', () => {
  assert.equal(runStars({ avgMs: 400, mistakes: 0 }), 3);
  assert.equal(runStars({ avgMs: 650, mistakes: 2 }), 2);
  assert.equal(runStars({ avgMs: 900, mistakes: 0 }), 1);
  const c = combineStats([{ total: 3, gaps: [400, 600], mistakes: 1 }, { total: 2, gaps: [500], mistakes: 0 }]);
  assert.equal(c.total, 5); assert.equal(c.totalMs, 1500); assert.equal(c.avgMs, 500); assert.equal(c.mistakes, 1);
});
