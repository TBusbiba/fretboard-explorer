import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicingsFor, createTriadMatcher, shapeLayout } from '../js/triad-match.js';

const C = 0, A = 9;
const GROUPS = ['321', '432', '543', '654'];
const fretsOf = (v) => v.notes.map(n => n.fret).join(',');
const sig = (vs) => vs.map(v => `${v.shape}@${fretsOf(v)}`).join(' ');

test('voicingsFor: C major on every group, sorted up the neck', () => {
  assert.equal(sig(voicingsFor(C, 'major', '321')), '3@0,1,0 1@5,5,3 2@9,8,8');
  assert.equal(sig(voicingsFor(C, 'major', '432')), '2@2,0,1 3@5,5,5 1@10,9,8');
  assert.equal(sig(voicingsFor(C, 'major', '543')), '1@3,2,0 2@7,5,5 3@10,10,9');
  assert.equal(sig(voicingsFor(C, 'major', '654')), '3@3,3,2 1@8,7,5 2@12,10,10');
});

test('voicingsFor: A minor on every group', () => {
  assert.equal(sig(voicingsFor(A, 'minor', '321')), '1@2,1,0 2@5,5,5 3@9,10,8');
  assert.equal(sig(voicingsFor(A, 'minor', '432')), '3@2,2,1 1@7,5,5 2@10,9,10');
  assert.equal(sig(voicingsFor(A, 'minor', '543')), '2@3,2,2 3@7,7,5 1@12,10,9');
  assert.equal(sig(voicingsFor(A, 'minor', '654')), '1@5,3,2 2@8,7,7 3@12,12,10');
});

test('voicingsFor: notes ascend low to high on the group strings and spell the chord', () => {
  for (const g of GROUPS) for (const [root, q, tones] of [[C, 'major', [0, 4, 7]], [A, 'minor', [0, 3, 7]]]) {
    for (const v of voicingsFor(root, q, g)) {
      assert.ok(v.notes[0].midi < v.notes[1].midi && v.notes[1].midi < v.notes[2].midi);
      assert.deepEqual(v.notes.map(n => n.string), { 321: [2, 1, 0], 432: [3, 2, 1], 543: [4, 3, 2], 654: [5, 4, 3] }[g]);
      assert.deepEqual([...v.notes.map(n => n.degree)].sort((a, b) => a - b), tones);
      assert.equal(v.lowestFret, Math.min(...v.notes.map(n => n.fret)));
    }
  }
});

test('voicingsFor: honours the fret range and bad input', () => {
  assert.equal(sig(voicingsFor(C, 'major', '321', { from: 3, to: 9 })), '1@5,5,3 2@9,8,8');
  assert.deepEqual(voicingsFor(C, 'dim', '321'), []);
  assert.deepEqual(voicingsFor(C, 'major', 'nope'), []);
});

test('matcher accepts every shape of the chord', () => {
  const vs = voicingsFor(C, 'major', '321');
  for (const v of vs) {
    const m = createTriadMatcher(vs);
    assert.deepEqual(m.feed(v.notes[0].midi), { status: 'step', step: 1 });
    assert.deepEqual(m.feed(v.notes[1].midi), { status: 'step', step: 2 });
    const end = m.feed(v.notes[2].midi);
    assert.equal(end.status, 'done');
    assert.equal(end.voicing, v);
  }
});

test('matcher rejects wrong notes without losing progress', () => {
  const vs = voicingsFor(C, 'major', '321');
  const [v] = vs.filter(x => x.shape === 1);
  const m = createTriadMatcher(vs);
  assert.equal(m.feed(v.notes[0].midi + 1).status, 'wrong');
  assert.equal(m.feed(v.notes[0].midi).status, 'step');
  assert.deepEqual(m.feed(v.notes[1].midi + 12), { status: 'wrong', step: 1 });
  const other = vs.find(x => x.shape === 2);
  assert.equal(m.feed(other.notes[1].midi).status, 'wrong');
  assert.equal(m.feed(v.notes[1].midi).status, 'step');
  assert.equal(m.feed(v.notes[2].midi).status, 'done');
});

test('matcher reset starts over', () => {
  const vs = voicingsFor(A, 'minor', '654');
  const m = createTriadMatcher(vs);
  m.feed(vs[0].notes[0].midi);
  m.reset();
  assert.equal(m.step, 0);
  assert.equal(m.feed(vs[1].notes[0].midi).status, 'step');
});

test('shapeLayout upFrets: values and an octave in total', () => {
  const up = (q, g) => shapeLayout(q, g).upFrets;
  assert.deepEqual(up('major', '321'), [5, 4, 3]);
  assert.deepEqual(up('minor', '321'), [5, 3, 4]);
  assert.deepEqual(up('major', '432'), [4, 5, 3]);
  assert.deepEqual(up('minor', '432'), [4, 4, 4]);
  assert.deepEqual(up('major', '543'), [5, 4, 3]);
  assert.deepEqual(up('minor', '543'), [5, 3, 4]);
  assert.deepEqual(up('major', '654'), [5, 4, 3]);
  assert.deepEqual(up('minor', '654'), [5, 3, 4]);
  for (const g of GROUPS) for (const q of ['major', 'minor']) assert.equal(up(q, g).reduce((a, b) => a + b, 0), 12);
});

test('shapeLayout major on 3·2·1 agrees with the real C major shapes', () => {
  const l = shapeLayout('major', '321');
  assert.deepEqual(l.shapes.map(s => s.index), [1, 2, 3]);
  assert.deepEqual(l.shapes.map(s => s.offset), [0, 5, 9]);
  assert.deepEqual(l.shapes[0].notes.map(n => n.rel), [2, 2, 0]);
  assert.deepEqual(l.shapes[0].notes.map(n => n.label), ['R', '3', '5']);
  assert.deepEqual(l.shapes[1].notes.map(n => n.rel), [6, 5, 5]);
  assert.deepEqual(l.shapes[2].notes.map(n => n.rel), [9, 10, 9]);
  const c = voicingsFor(C, 'major', '321');
  const s1 = c.find(v => v.shape === 1), s2 = c.find(v => v.shape === 2);
  assert.equal(s2.lowestFret - s1.lowestFret, 5);
});

test('shapeLayout: bad input is null', () => {
  assert.equal(shapeLayout('dim', '321'), null);
  assert.equal(shapeLayout('major', 'x'), null);
});
