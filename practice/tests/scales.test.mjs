import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCALES, boxShape, joinedBoxes, runSequence, joinShapes } from '../js/scales.js';
import { STRINGS } from '../js/notes.js';

const A = 9, C = 0;
// [string index 5..0 = low E..high E] -> frets
const byString = (notes) => [5, 4, 3, 2, 1, 0].map(s => notes.filter(n => n.string === s).map(n => n.fret));

test('A minor pentatonic box 1 is hand-checked (5th fret)', () => {
  assert.deepEqual(byString(boxShape('minorPentatonic', A, 1)), [[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
});

test('A minor pentatonic box 2 is hand-checked', () => {
  assert.deepEqual(byString(boxShape('minorPentatonic', A, 2)), [[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
});

test('A minor pentatonic boxes 3-5: box 3 at 9-13, boxes 4 and 5 wrap below box 1 (frets 0-3 and 2-5)', () => {
  assert.deepEqual(byString(boxShape('minorPentatonic', A, 3)), [[10, 12], [10, 12], [10, 12], [9, 12], [10, 13], [10, 12]]);
  assert.deepEqual(byString(boxShape('minorPentatonic', A, 4)), [[0, 3], [0, 3], [0, 2], [0, 2], [1, 3], [0, 3]]);
  assert.deepEqual(byString(boxShape('minorPentatonic', A, 5)), [[3, 5], [3, 5], [2, 5], [2, 5], [3, 5], [3, 5]]);
});

test('E minor pentatonic box 1 sits at fret 0 on the open strings', () => {
  assert.deepEqual(byString(boxShape('minorPentatonic', 4, 1)), [[0, 3], [0, 2], [0, 2], [0, 2], [0, 3], [0, 3]]);
});

test('notes are ordered low to high, with the right midi and degrees', () => {
  for (const scale of Object.keys(SCALES)) for (let box = 1; box <= 5; box++) {
    const notes = boxShape(scale, 4, box);
    for (let i = 1; i < notes.length; i++) assert.ok(notes[i].midi > notes[i - 1].midi, `${scale} box ${box}`);
    for (const n of notes) {
      assert.equal(n.midi, STRINGS[n.string].midi + n.fret);
      assert.ok(n.degree >= 1 && n.degree <= SCALES[scale].intervals.length);
      assert.equal(n.isRoot, (n.midi - 4) % 12 === 0);
    }
  }
});

test('every pentatonic box has 2 notes per string (12) and major positions 2-3 per string', () => {
  for (let box = 1; box <= 5; box++) {
    assert.equal(boxShape('minorPentatonic', 7, box).length, 12);
    for (let s = 0; s < 6; s++) {
      const n = boxShape('major', 7, box).filter(x => x.string === s).length;
      assert.ok(n >= 2 && n <= 3, `pos ${box} string ${s}: ${n}`);
    }
  }
});

test('box 5 ends on the low E note where box 1 starts, one octave lower or higher', () => {
  for (const root of [0, 4, 7, 9]) {
    const lowE = (box, i) => boxShape('minorPentatonic', root, box).filter(n => n.string === 5).at(i).midi;
    assert.equal(Math.abs(lowE(1, 0) - lowE(5, -1)) % 12, 0);
  }
});

test('box 1 puts the root on the low E under the index finger', () => {
  for (let root = 0; root < 12; root++) {
    const b = boxShape('minorPentatonic', root, 1);
    const low = b.filter(n => n.string === 5)[0];
    assert.equal(low.midi % 12, root);
    assert.ok(low.isRoot && low.fret >= 0 && low.fret <= 12);
  }
});

test('major pentatonic reuses the relative minor boxes with the major root marked', () => {
  for (let box = 1; box <= 5; box++) {
    const maj = boxShape('majorPentatonic', C, box), min = boxShape('minorPentatonic', A, box);
    assert.deepEqual(maj.map(n => [n.string, n.fret]), min.map(n => [n.string, n.fret]));
    assert.ok(maj.filter(n => n.isRoot).every(n => n.midi % 12 === C));
    assert.ok(maj.some(n => n.isRoot));
  }
});

test('G major scale positions are the Explorer 5-fret windows (2-6, 4-8, 7-11, 9-13, then 12-16 an octave down)', () => {
  assert.deepEqual(byString(boxShape('major', 7, 1)), [[2, 3, 5], [2, 3, 5], [2, 4, 5], [2, 4, 5], [3, 5], [2, 3, 5]]);
  assert.deepEqual(byString(boxShape('major', 7, 2)), [[5, 7, 8], [5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
  assert.deepEqual(byString(boxShape('major', 7, 5)), [[0, 2, 3], [0, 2, 3], [0, 2, 4], [0, 2], [0, 1, 3], [0, 2, 3]]);
});

test('C major position 1 is the E-shape at 7-10 (root C on the low E, fret 8) and position 3 the open C shape', () => {
  assert.deepEqual(byString(boxShape('major', C, 1)), [[7, 8, 10], [7, 8, 10], [7, 9, 10], [7, 9, 10], [8, 10], [7, 8, 10]]);
  assert.deepEqual(byString(boxShape('major', C, 3)), [[0, 1, 3], [0, 2, 3], [0, 2, 3], [0, 2], [0, 1, 3], [0, 1, 3]]);
});

test('the five major positions only use scale notes and together cover every scale note', () => {
  const pcs = new Set(SCALES.major.intervals.map(i => (2 + i) % 12)); // D major
  const frets = new Set();
  for (let box = 1; box <= 5; box++) for (const n of boxShape('major', 2, box)) {
    assert.ok(pcs.has(n.midi % 12));
    frets.add(`${n.string}:${n.fret % 12}`);
  }
  for (let s = 0; s < 6; s++) for (let f = 0; f < 12; f++) {
    if (pcs.has((STRINGS[s].midi + f) % 12)) assert.ok(frets.has(`${s}:${f}`), `string ${s} fret ${f}`);
  }
});

test('every box of every root sits in frets 0-13 (a handful of roots cannot, and stay at 15 or less)', () => {
  const over = [];
  for (const scale of Object.keys(SCALES)) for (let root = 0; root < 12; root++) for (let box = 1; box <= 5; box++) {
    const frets = boxShape(scale, root, box).map(n => n.fret);
    assert.ok(Math.min(...frets) >= 0 && Math.max(...frets) <= 15, `${scale} ${root} ${box}`);
    if (Math.max(...frets) > 13) over.push(`${scale}:${root}:${box}`);
  }
  assert.equal(over.length, 15, over.join(' '));
  for (const scale of ['minorPentatonic', 'major']) for (const root of [9, 4, 2, 7, 0]) for (let box = 1; box <= 5; box++) {
    assert.ok(Math.max(...boxShape(scale, root, box).map(n => n.fret)) <= 13, `${scale} ${root} ${box}`);
  }
});

test('joined boxes share one placement and stay contiguous (A minor 4 + 5 at frets 0-5)', () => {
  const fr = (b) => { const f = joinedBoxes('minorPentatonic', A, b).map(n => n.fret); return [Math.min(...f), Math.max(...f)]; };
  assert.deepEqual(fr([1, 2]), [5, 10]);
  assert.deepEqual(fr([2, 3]), [7, 12]);
  assert.deepEqual(fr([4, 5]), [0, 5]);
  const joined = joinedBoxes('minorPentatonic', A, [4, 5]);
  assert.deepEqual(joined.map(n => n.midi), [...new Set(joined.map(n => n.midi))].sort((a, b) => a - b));
});

test('runSequence goes up then down without repeating the top note', () => {
  const seq = runSequence(boxShape('minorPentatonic', A, 1));
  assert.equal(seq.length, 23);
  assert.deepEqual(seq.slice(0, 12).map(n => n.midi), seq.slice(11).reverse().map(n => n.midi));
  assert.equal(seq.filter(n => n.midi === seq[11].midi).length, 1);
  assert.deepEqual(runSequence([]), []);
  assert.deepEqual(runSequence([{ midi: 1 }]), [{ midi: 1 }]);
});

test('joinShapes merges boxes into one ascending run, each pitch once', () => {
  const joined = joinShapes([boxShape('minorPentatonic', A, 1), boxShape('minorPentatonic', A, 2)]);
  const midis = joined.map(n => n.midi);
  assert.equal(new Set(midis).size, midis.length);
  assert.deepEqual([...midis].sort((a, b) => a - b), midis);
  assert.equal(midis[0], 45); assert.equal(midis.at(-1), 74);
});

test('bad input throws', () => {
  assert.throws(() => boxShape('nope', 0, 1));
  assert.throws(() => boxShape('major', 0, 6));
});
