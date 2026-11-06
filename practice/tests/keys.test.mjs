import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_ORDER, DEGREES, diatonicChords, degreeOf, PROGRESSIONS, progressionById, resolveProgression } from '../js/keys.js';

const names = (k) => diatonicChords(k).map(c => c.name);

test('spelling of the diatonic row, every key', () => {
  assert.deepEqual(names('C'), ['C', 'Dm', 'Em', 'F', 'G', 'Am']);
  assert.deepEqual(names('F'), ['F', 'Gm', 'Am', 'B♭', 'C', 'Dm']);
  assert.deepEqual(names('E♭'), ['E♭', 'Fm', 'Gm', 'A♭', 'B♭', 'Cm']);
  assert.deepEqual(names('D♭'), ['D♭', 'E♭m', 'Fm', 'G♭', 'A♭', 'B♭m']);
  assert.deepEqual(names('F♯'), ['F♯', 'G♯m', 'A♯m', 'B', 'C♯', 'D♯m']);
  assert.deepEqual(names('B'), ['B', 'C♯m', 'D♯m', 'E', 'F♯', 'G♯m']);
  assert.equal(KEY_ORDER.length, 12);
  for (const k of KEY_ORDER) {
    const row = diatonicChords(k);
    assert.equal(row.length, 6);
    assert.deepEqual(row.map(c => c.degree), DEGREES);
    assert.equal(new Set(row.map(c => c.root[0])).size, 6);
    assert.ok(row.every(c => !/dim|°/.test(c.name)));
  }
});

test('chord objects carry pitch class and quality', () => {
  const g = diatonicChords('G');
  assert.deepEqual(g.map(c => c.pc), [7, 9, 11, 0, 2, 4]);
  assert.deepEqual(g.map(c => c.quality), ['major', 'minor', 'minor', 'major', 'major', 'minor']);
  assert.deepEqual(diatonicChords('H'), []);
});

test('degreeOf and progressions', () => {
  assert.equal(degreeOf('F', 'Dm'), 'vi');
  assert.equal(degreeOf('F', 'Gm'), 'ii');
  assert.equal(degreeOf('C', 'F♯m'), null);
  assert.equal(degreeOf('Z', 'C'), null);
  assert.deepEqual(PROGRESSIONS.map(p => p.id), ['I–V–vi–IV', 'I–IV–V–I', 'ii–V–I', 'vi–IV–I–V', 'I–vi–IV–V']);
  assert.deepEqual(progressionById('ii–V–I').degrees, ['ii', 'V', 'I']);
  assert.equal(progressionById('nope'), null);
  assert.deepEqual(resolveProgression('G', 'I–V–vi–IV').map(c => c.name), ['G', 'D', 'Em', 'C']);
  assert.deepEqual(resolveProgression('G', 'nope'), []);
});

import { explain, RULE_TEXT } from '../js/keys.js';

test('explain: degree card text is exact', () => {
  const e = explain('C', 'V');
  assert.deepEqual(e.scale, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.deepEqual(e.numbers, ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(e.highlight, 4);
  assert.equal(e.ruleText, '1, 4, 5 are major · 2, 3, 6 are minor · 7 is diminished (skipped)');
  assert.equal(e.ruleText, RULE_TEXT);
  assert.equal(e.workedText, 'V of C major: count up C D E F G → G. 5 is always major → G.');
  assert.deepEqual(e.row.map(r => r.name), ['C', 'Dm', 'Em', 'F', 'G', 'Am']);
  assert.equal(explain('C', 'ii').workedText, 'ii of C major: count up C D → D. 2 is always minor → Dm.');
});

test('explain: reverse card text is exact and spells flats', () => {
  const e = explain('F', 'Dm');
  assert.equal(e.degree, 'vi');
  assert.equal(e.workedText, 'Dm is the 6th note of F major (F G A B♭ C D) → vi. 6 is always minor, so Dm fits.');
  assert.deepEqual(explain('F♯', 'I').scale, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
});

test('explain: unknown key or chord gives null', () => {
  assert.equal(explain('H', 'V'), null);
  assert.equal(explain('C', 'F♯m'), null);
  assert.equal(explain('C', 'vii'), null);
});
