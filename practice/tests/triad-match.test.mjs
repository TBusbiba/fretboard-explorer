import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicingsFor, questionVoicings, createTriadMatcher, shapeLayout, windowFor } from '../js/triad-match.js';
import { NOTE_NAMES } from '../js/notes.js';

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

const play = (m, v) => v.notes.map(n => m.feed(n.midi));

test('matcher: each shape low to high from the thickest string, any order, done after all three', () => {
  const vs = voicingsFor(C, 'major', '321');
  const m = createTriadMatcher(vs);
  assert.equal(m.total, 3);
  const order = [vs[2], vs[0], vs[1]];
  order.forEach((v, i) => {
    const r = play(m, v);
    assert.deepEqual(r.slice(0, 2).map(x => x.status), ['step', 'step']);
    assert.equal(r[0].voicing, v);
    assert.equal(r[2].status, i === 2 ? 'done' : 'shape');
    assert.equal(r[2].shape, v.shape);
    assert.equal(r[2].found, i + 1);
  });
  assert.equal(m.found.length, 3);
});

test('matcher: a first note must be the lowest note of an open shape on the thickest string', () => {
  const vs = voicingsFor(C, 'major', '321');
  const m = createTriadMatcher(vs);
  const v = vs[0];
  assert.equal(m.feed(30).status, 'wrong');
  assert.equal(m.feed(v.notes[0].midi + 1).status, 'wrong');
  assert.deepEqual(m.expected(), vs.map(x => x.notes[0].midi));
  assert.equal(m.feed(v.notes[0].midi).status, 'step');
  assert.deepEqual(m.expected(), [v.notes[1].midi]);
});

test('matcher: a repeated shape is a dup and changes nothing', () => {
  const vs = voicingsFor(C, 'major', '321');
  const m = createTriadMatcher(vs);
  play(m, vs[0]);
  assert.deepEqual(m.feed(vs[0].notes[0].midi), { status: 'dup', step: 0, shape: vs[0].shape });
  assert.equal(m.step, 0);
  assert.equal(m.found.length, 1);
  assert.ok(!m.expected().includes(vs[0].notes[0].midi));
  assert.equal(play(m, vs[1])[2].status, 'shape');
});

test('matcher rejects wrong notes mid-shape without losing progress', () => {
  const vs = voicingsFor(C, 'major', '321');
  const [v] = vs.filter(x => x.shape === 1);
  const m = createTriadMatcher(vs);
  m.feed(v.notes[0].midi);
  assert.deepEqual(m.feed(v.notes[1].midi + 12), { status: 'wrong', step: 1 });
  const other = vs.find(x => x.shape === 2);
  assert.equal(m.feed(other.notes[1].midi).status, 'wrong');
  assert.equal(m.feed(v.notes[1].midi).status, 'step');
  assert.equal(m.feed(v.notes[2].midi).status, 'shape');
});

test('matcher reset starts over', () => {
  const vs = voicingsFor(A, 'minor', '654');
  const m = createTriadMatcher(vs);
  play(m, vs[0]);
  m.reset();
  assert.equal(m.step, 0);
  assert.equal(m.found.length, 0);
  assert.equal(m.feed(vs[0].notes[0].midi).status, 'step');
});

test('every voicing is identified by its first note; each chord of every group has all three shapes', () => {
  for (const g of GROUPS) for (let root = 0; root < 12; root++) for (const q of ['major', 'minor']) {
    const vs = questionVoicings(root, q, g);
    assert.equal(new Set(vs.map(v => v.notes[0].midi)).size, vs.length);
    assert.deepEqual([...new Set(vs.map(v => v.shape))].sort(), [1, 2, 3], `${root} ${q} ${g}`);
  }
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

const syn = (...frets) => ({ notes: frets.map(fret => ({ fret })) });
const NOTE = (n) => NOTE_NAMES.indexOf(n);

test('windowFor: G major on 3·2·1 (shapes at 3-4, 7-8, 10-12) gives 0-6, 5-9, 9-12', () => {
  const vs = questionVoicings(NOTE('G'), 'major', '321');
  assert.deepEqual(vs.map((_, i) => windowFor(vs, i)), [{ from: 0, to: 6 }, { from: 5, to: 9 }, { from: 9, to: 12 }]);
  assert.deepEqual(windowFor(vs, 2, { maxFret: 15 }), { from: 9, to: 15 });
});
test('windowFor: E minor on 3·2·1 has an open shape (window starts at 0) and a copy at 12', () => {
  const vs = questionVoicings(NOTE('E'), 'minor', '321');
  assert.equal(vs.length, 4);
  assert.deepEqual(vs.map((_, i) => windowFor(vs, i)),
    [{ from: 0, to: 2 }, { from: 1, to: 6 }, { from: 6, to: 11 }, { from: 10, to: 12 }]);
});
test('windowFor: a shape at the top ends at maxFret (default follows the highest fret)', () => {
  const vs = [syn(2, 3, 3), syn(14, 14, 12)];
  assert.deepEqual(windowFor(vs, 1), { from: 4, to: 14 });
  assert.deepEqual(windowFor([syn(2, 3, 3), syn(9, 9, 8)], 1), { from: 4, to: 12 });
});
test('windowFor: two adjacent shapes with one free fret between them share that fret', () => {
  const vs = [syn(2, 3, 3), syn(5, 6, 5)];
  assert.deepEqual(windowFor(vs, 0), { from: 0, to: 4 });
  assert.deepEqual(windowFor(vs, 1), { from: 4, to: 12 });
});
test('windowFor: a lone shape spans the whole board; touching shapes get no extra room', () => {
  assert.deepEqual(windowFor([syn(3, 4, 3)], 0), { from: 0, to: 12 });
  assert.deepEqual(windowFor([syn(2, 3, 3), syn(4, 5, 5)], 0), { from: 0, to: 3 });
});
