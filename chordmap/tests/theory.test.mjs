import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chord, chordById, setAccidentals, neighbours, dominantOf, resolutionsOf, voiceMove,
  voicing, voicingMidis, STRING_MIDI, mod12,
} from '../js/theory.js';

const names = (c) => c.notes.map(n => n.name);

test('note names follow the sharps/flats preference', () => {
  setAccidentals('sharp');
  assert.deepEqual(names(chord(3, 'min')), ['D♯', 'F♯', 'A♯']);
  assert.deepEqual(names(chord(1, 'dom7')), ['C♯', 'F', 'G♯', 'B']);
  assert.equal(chord(10, 'maj').name, 'A♯');
  setAccidentals('flat');
  assert.deepEqual(names(chord(3, 'min')), ['E♭', 'G♭', 'B♭']);
  assert.equal(chord(10, 'maj').name, 'B♭');
  assert.deepEqual(names(chord(7, 'dom7')), ['G', 'B', 'D', 'F']);
});

test('switching names renames the same chord object', () => {
  const c = chord(6, 'maj');
  setAccidentals('sharp'); assert.equal(c.name, 'F♯');
  setAccidentals('flat'); assert.equal(c.name, 'G♭');
  assert.equal(chord(6, 'maj'), c);
});

// Read straight off the reference image.
test('neighbours and bridging 7ths match the map', () => {
  setAccidentals('flat');   // the image mostly uses flats
  const show = (c) => neighbours(c).map(n => `${n.move}:${n.to.name}/${n.via.name}`);
  assert.deepEqual(show(chord(0, 'maj')), ['P:Cm/G7', 'R:Am/E7', 'L:Em/B7']);
  assert.deepEqual(show(chord(9, 'min')), ['P:A/E7', 'R:C/G7', 'L:F/C7']);
  assert.deepEqual(show(chord(4, 'min')), ['P:E/B7', 'R:G/D7', 'L:C/G7']);
  assert.deepEqual(show(chord(8, 'min')), ['P:A♭/E♭7', 'R:B/G♭7', 'L:E/B7']);
  setAccidentals('sharp');
  assert.deepEqual(show(chord(8, 'min')), ['P:G♯/D♯7', 'R:B/F♯7', 'L:E/B7']);
  assert.deepEqual(show(chord(0, 'min')).slice(1), ['R:D♯/A♯7', 'L:G♯/D♯7']);
});

test('every neighbour shares exactly two notes', () => {
  for (let pc = 0; pc < 12; pc++) for (const q of ['maj', 'min']) {
    const c = chord(pc, q);
    for (const n of neighbours(c)) {
      const m = voiceMove(c, n.to);
      assert.equal(m.kept.length, 2, `${c.name} → ${n.to.name}`);
      assert.ok(Math.abs(m.semis) <= 2);
      assert.ok(neighbours(n.to).some(b => b.to === c), 'moves are reversible');
    }
  }
});

test('a dominant resolves a fifth down', () => {
  assert.equal(dominantOf(chord(5, 'maj')).name, 'C7');
  assert.deepEqual(resolutionsOf(chord(4, 'dom7')).map(c => c.name), ['A', 'Am']);
});

test('every voicing sounds exactly the chord tones, root in the bass', () => {
  for (let pc = 0; pc < 12; pc++) for (const q of ['maj', 'min', 'dom7']) {
    const c = chord(pc, q);
    const v = voicing(c);
    assert.equal(v.frets.length, 6);
    const pcs = new Set(voicingMidis(v).map(mod12));
    const tones = c.notes.map(n => n.pc);
    for (const p of pcs) assert.ok(tones.includes(p), `${c.name} plays a stray note`);
    // every tone sounds, except a 7th chord may drop its 5th (open C7 does)
    for (const n of c.notes) assert.ok(pcs.has(n.pc) || (q === 'dom7' && n.degree === '5'), `${c.name} lacks ${n.name}`);
    assert.equal(mod12(voicingMidis(v)[0]), c.pc, `${c.name} bass`);
    assert.ok(Math.max(...v.frets) <= 14);
    assert.equal(STRING_MIDI.length, 6);
  }
});
