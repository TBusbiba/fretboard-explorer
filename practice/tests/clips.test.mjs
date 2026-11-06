import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalize, segments, clipFiles } from '../js/clips.js';

const manifest = JSON.parse(readFileSync(new URL('../audio/voice/manifest.json', import.meta.url), 'utf8'));

test('normalize matches the recorder', () => {
  assert.equal(normalize('Find every C♯!'), 'find every c sharp');
  assert.equal(normalize('Next: every E!'), 'next every e');
  assert.equal(normalize('String 6, A'), 'string 6 a');
});

test('a prompt is split after . ! ? but not at commas', () => {
  assert.deepEqual(segments('Boss round! Find every B! String 2, B'), ['Boss round', 'Find every B', 'String 2, B']);
});

test('every Find the note phrase has a clip', () => {
  for (const t of ['String 6, A', 'String 1, C sharp', 'Correct!', 'Good', 'Octave too high', 'That was F sharp', 'A', 'Nice!', 'Chain complete!',
    'Quick note chain round! Four A notes! Start with the low E string! String 6, A', 'Quick note chain round! Three C sharp notes! Start with the high E string! String 1, C sharp',
    'Boss round! Find every B! String 2, B', 'Next: every E! String 5, E', 'Correct! Nice! New best streak!']) {
    assert.ok(clipFiles(t, manifest), t);
  }
});

test('a text with any phrase missing falls back (null)', () => {
  assert.equal(clipFiles('C, string 5. Then a major third up', manifest), null);
  assert.equal(clipFiles('Legendary ×40', manifest), null);
  assert.equal(clipFiles('Correct! Legendary ×40!', manifest), null);
  assert.equal(clipFiles('', manifest), null);
});

test('the string-only and string-name prompts have recorded clips', async () => {
  const { readFileSync } = await import('node:fs');
  const manifest = JSON.parse(readFileSync(new URL('../audio/voice/manifest.json', import.meta.url), 'utf8'));
  for (const t of ['String 3!', 'A string!', 'low E string!', 'high E string!', 'A string, C!', 'low E string, F sharp!', 'high E string, B!']) assert.ok(clipFiles(t, manifest), t);
  assert.deepEqual(clipFiles('Quick note chain round! A string, C!', manifest).length, 2);
});
