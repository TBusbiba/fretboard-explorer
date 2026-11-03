import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNotes, bestParse } from '../js/chords/speech.js';

test('letters, sound-alikes, sharps and flats', () => {
  assert.deepEqual(parseNotes('C E G'), [0, 4, 7]);
  assert.deepEqual(parseNotes('see, ee and gee'), [0, 4, 7]);
  assert.deepEqual(parseNotes('E G sharp B'), [4, 8, 11]);
  assert.deepEqual(parseNotes('E G# B'), [4, 8, 11]);
  assert.deepEqual(parseNotes('D flat F A flat'), [1, 5, 8]);
  assert.deepEqual(parseNotes('Db F Ab'), [1, 5, 8]);
  assert.deepEqual(parseNotes('hey C sharp E'), [9, 1, 4]);
});

test('repeats and unknown words are skipped', () => {
  assert.deepEqual(parseNotes('um C C E the G'), [0, 4, 7]);
  assert.deepEqual(parseNotes('hello there'), []);
});

test('bestParse prefers an alternative with exactly three notes', () => {
  assert.deepEqual(bestParse(['see you', 'C E G', 'C E G A']).notes, [0, 4, 7]);
  assert.deepEqual(bestParse(['see you', 'C E']).notes, [0, 4]);
  assert.deepEqual(bestParse([]).notes, []);
});
