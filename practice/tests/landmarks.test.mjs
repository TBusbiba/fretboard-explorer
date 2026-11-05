import { test } from 'node:test';
import assert from 'node:assert/strict';
import { landmarkHint, landmarksFor } from '../js/landmarks.js';
import { noteAt } from '../js/notes.js';

const hint = (string, fret) => landmarkHint(string, fret).text;

test('landmarks per string', () => {
  const frets = (s) => landmarksFor(s).map(l => l.fret);
  assert.deepEqual(frets(5), [0, 3, 5, 7, 12]);   // low E: G A B dots
  assert.deepEqual(frets(4), [0, 3, 5, 7, 12]);   // A: C D E dots
  assert.deepEqual(frets(3), [0, 5, 7, 12]);      // D: fret 5 is the open G string
  assert.deepEqual(frets(2), [0, 7, 12]);
  assert.deepEqual(frets(1), [0, 5, 12]);         // B: fret 5 is the open E string
  assert.deepEqual(frets(0), [0, 3, 5, 7, 12]);
  assert.equal(landmarksFor(3).find(l => l.fret === 7).tag, 'BEAD');
});

test('hints from the doc: BEAD, fret 12, sharps', () => {
  assert.equal(hint(3, 9), 'Fret 7 is A (BEAD) → up 2 → B');    // D string, fret 9 = B
  assert.equal(hint(4, 10), 'Fret 12 is A → back 2 → G');       // A string, fret 10 = G
  assert.equal(hint(5, 2), 'One fret above F');                 // low E fret 2 = F♯
});

test('hints name the landmark, tag and direction', () => {
  assert.equal(hint(5, 0), 'Open string is E');
  assert.equal(hint(5, 12), 'Fret 12 is E');
  assert.equal(hint(5, 1), 'Open string is E → up 1 → F');
  assert.equal(hint(5, 3), 'Fret 3 is G (G A B)');
  assert.equal(hint(4, 8), 'Fret 7 is E (BEAD) → up 1 → F');
  assert.equal(hint(3, 3), 'Fret 5 is G (open G string) → back 2 → F');   // D string, fret 3 = F (D+3)
  assert.equal(hint(1, 3), 'Fret 5 is E (open E string) → back 2 → D');
  assert.equal(hint(2, 5), 'Fret 7 is D (BEAD) → back 2 → C');
  assert.equal(hint(0, 8), 'Fret 7 is B (G A B) → up 1 → C');
  assert.equal(hint(5, 7), 'Fret 7 is B (BEAD)');
});

test('every spot in frets 0-12: the hint counts to the right note and never more than 3 frets', () => {
  for (let string = 0; string < 6; string++) {
    for (let fret = 0; fret <= 12; fret++) {
      const name = noteAt(string, fret).name, h = landmarkHint(string, fret);
      assert.ok(h.text.length > 0);
      if (name.includes('♯')) {
        assert.equal(h.text, `One fret above ${noteAt(string, fret - 1).name}`);
        assert.deepEqual(h.from, { string, fret: fret - 1 });
        continue;
      }
      if (!h.from) { assert.ok(!h.text.includes('→'), h.text); continue; }
      const n = +/(?:up|back) (\d+)/.exec(h.text)[1];
      assert.ok(n >= 1 && n <= 3, `${string}:${fret} ${h.text}`);
      assert.equal(Math.abs(fret - h.from.fret), n);
      assert.ok(h.text.endsWith(`→ ${name}`), h.text);
      assert.ok(h.text.includes(`is ${noteAt(string, h.from.fret).name}`), h.text);
    }
  }
});
