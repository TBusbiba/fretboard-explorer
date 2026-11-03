import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STRINGS, TRIADS, STRING_GROUPS, DEGREE_LABELS } from '../js/notes.js';
import { triadShapes, shapeSvg, SHAPE_FRETS, SHAPE_LABELS } from '../js/triad-shapes.js';

const mod12 = (n) => ((n % 12) + 12) % 12;

for (const triad of TRIADS) {
  for (const group of STRING_GROUPS) {
    test(`shapes: ${triad.id} on strings ${group.label}`, () => {
      const set = triadShapes(triad.id, group.id);
      assert.ok(set, 'a shape set exists');
      assert.deepEqual(set.shapes.map(s => s.inversion), [0, 1, 2]);
      let previousLow = 0;
      for (const shape of set.shapes) {
        const { notes, inversion } = shape;
        assert.equal(notes.length, 3);
        // each note is on the intended string, low to high, one per string
        assert.deepEqual(notes.map(n => n.string), group.strings);
        for (const n of notes) {
          assert.equal(n.midi, STRINGS[n.string].midi + n.fret, 'midi matches string + fret');
          assert.ok(n.fret >= 1 && n.fret <= SHAPE_FRETS, `fret ${n.fret} on the mini neck`);
          assert.equal(n.label, DEGREE_LABELS[n.degree]);
        }
        // pitches ascend and form the triad's intervals above the root
        assert.ok(notes[0].midi < notes[1].midi && notes[1].midi < notes[2].midi, 'ascending pitches');
        assert.deepEqual(notes.map(n => mod12(n.midi - set.rootPc)), notes.map(n => n.degree));
        assert.deepEqual(notes.map(n => n.degree).sort((a, b) => a - b), [...triad.tones].sort((a, b) => a - b));
        // the lowest note carries the inversion's degree
        assert.equal(notes[0].degree, triad.tones[inversion], `lowest degree of inversion ${inversion}`);
        assert.equal(notes.filter(n => n.degree === 0).length, 1);
        // playable
        const frets = notes.map(n => n.fret);
        assert.ok(Math.max(...frets) - Math.min(...frets) <= 5, 'span of at most 5 frets');
        // laid out up the neck
        assert.ok(Math.min(...frets) > previousLow, 'each inversion sits above the last');
        previousLow = Math.min(...frets);
      }
    });
  }
}

test('shapes: major on strings 3·2·1 is the standard trio', () => {
  const [root, first, second] = triadShapes('major', '321').shapes;
  const f = root.notes[0].fret;   // root on the G string
  assert.deepEqual(root.notes.map(n => [n.label, n.fret]), [['R', f], ['3', f], ['5', f - 2]]);
  assert.deepEqual(first.notes.map(n => [n.label, n.fret]), [['3', f + 4], ['5', f + 3], ['R', f + 3]]);
  assert.deepEqual(second.notes.map(n => [n.label, n.fret]), [['5', f + 7], ['R', f + 8], ['3', f + 7]]);
});

test('shapes: unknown triad or group gives nothing', () => {
  assert.equal(triadShapes('nope', '321'), null);
  assert.equal(triadShapes('major', 'nope'), null);
  assert.equal(shapeSvg('major', 'nope'), '');
});

test('shapes: the drawing shows degrees and shape names only, never frets or note names', () => {
  for (const triad of TRIADS) {
    for (const group of STRING_GROUPS) {
      const svg = shapeSvg(triad.id, group.id);
      const texts = [...svg.matchAll(/<text[^>]*>([^<]*)/g)].map(m => m[1]);
      const allowed = new Set([...Object.values(DEGREE_LABELS), ...SHAPE_LABELS]);
      assert.equal(texts.length, 9 + 3);
      for (const t of texts) assert.ok(allowed.has(t), `unexpected label "${t}"`);
    }
  }
});
