import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  NOTE_NAMES, STRINGS, midiToFrequency, frequencyToMidi, midiToNoteName,
  noteAt, isNatural, pickTarget, spokenName,
} from '../js/notes.js';

test('standard tuning open strings, index 0 is high E', () => {
  assert.equal(STRINGS.length, 6);
  assert.deepEqual(STRINGS.map(s => s.midi), [64, 59, 55, 50, 45, 40]);
  assert.deepEqual(STRINGS.map(s => s.number), [1, 2, 3, 4, 5, 6]);
  assert.equal(STRINGS[0].label, 'high E');
  assert.equal(STRINGS[5].label, 'low E');
});

test('midi <-> frequency around A440', () => {
  assert.ok(Math.abs(midiToFrequency(69) - 440) < 1e-9);
  assert.ok(Math.abs(midiToFrequency(57) - 220) < 1e-9);
  assert.equal(frequencyToMidi(440), 69);
  assert.equal(frequencyToMidi(82.41), 40); // low E
  assert.equal(frequencyToMidi(445), 69);   // slightly sharp still rounds to A
});

test('noteAt returns name and midi for string/fret', () => {
  assert.deepEqual(noteAt(5, 0), { name: 'E', midi: 40, octave: 2 });
  assert.deepEqual(noteAt(4, 3), { name: 'C', midi: 48, octave: 3 });
  assert.deepEqual(noteAt(0, 12), { name: 'E', midi: 76, octave: 5 });
  assert.deepEqual(noteAt(2, 1), { name: 'G♯', midi: 56, octave: 3 });
});

test('midiToNoteName uses sharps and ♯ glyph', () => {
  assert.equal(midiToNoteName(61), 'C♯');
  assert.equal(NOTE_NAMES.length, 12);
  assert.ok(isNatural('C'));
  assert.ok(!isNatural('C♯'));
});

test('spokenName expands sharps for speech', () => {
  assert.equal(spokenName('C♯'), 'C sharp');
  assert.equal(spokenName('A'), 'A');
});

test('pickTarget respects strings, fret range, naturals, and avoids repeat', () => {
  const opts = { strings: [4], fretFrom: 0, fretTo: 3, naturalsOnly: true };
  // A string frets 0-3: A, A#, B, C -> naturals A(0), B(2), C(3)
  const seen = new Set();
  for (let i = 0; i < 200; i++) {
    const t = pickTarget(opts, null, Math.random);
    assert.equal(t.string, 4);
    assert.ok([0, 2, 3].includes(t.fret), `fret ${t.fret}`);
    seen.add(t.fret);
  }
  assert.deepEqual([...seen].sort(), [0, 2, 3]);

  // never repeats the previous target when alternatives exist
  const prev = { string: 4, fret: 2 };
  for (let i = 0; i < 100; i++) {
    const t = pickTarget(opts, prev, Math.random);
    assert.ok(!(t.string === 4 && t.fret === 2));
  }
});

test('pickTarget allows repeat when it is the only option, null when none', () => {
  const only = { strings: [4], fretFrom: 2, fretTo: 2, naturalsOnly: true };
  assert.deepEqual(pickTarget(only, { string: 4, fret: 2 }, Math.random), { string: 4, fret: 2 });
  const none = { strings: [4], fretFrom: 1, fretTo: 1, naturalsOnly: true }; // A# only
  assert.equal(pickTarget(none, null, Math.random), null);
  assert.equal(pickTarget({ strings: [], fretFrom: 0, fretTo: 12, naturalsOnly: false }, null, Math.random), null);
});

test('pickTarget is deterministic given rng', () => {
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 12, naturalsOnly: false };
  const a = pickTarget(opts, null, () => 0.42);
  const b = pickTarget(opts, null, () => 0.42);
  assert.deepEqual(a, b);
});

test('interval tips are consistent with the semitone math', async () => {
  const { INTERVALS } = await import('../js/notes.js');
  // Each tip example in the form "string A fret B → string C fret D" must really be that interval.
  for (const iv of INTERVALS) {
    for (const tip of iv.tips) {
      const m = tip.match(/string (\d) fret (\d+) → string (\d) fret (\d+)/);
      if (!m) continue;
      const [, s1, f1, s2, f2] = m.map(Number);
      const a = noteAt(s1 - 1, f1).midi, b = noteAt(s2 - 1, f2).midi;
      assert.equal(b - a, iv.semitones, `${iv.id}: ${tip}`);
    }
  }
});

test('positionsForMidi finds every position in range', async () => {
  const { positionsForMidi } = await import('../js/notes.js');
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11 };
  // E4 (64): string 1 open, string 2 fret 5, string 3 fret 9
  assert.deepEqual(positionsForMidi(64, opts), [{ string: 0, fret: 0 }, { string: 1, fret: 5 }, { string: 2, fret: 9 }]);
  assert.deepEqual(positionsForMidi(40, { ...opts, fretFrom: 1 }), []); // low E open excluded
});

test('pickIntervalTarget only yields reachable targets and avoids repeats', async () => {
  const { pickIntervalTarget, intervalById } = await import('../js/notes.js');
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: true, intervals: ['octaveUp', 'octaveDown', 'fifth', 'majorThird', 'minorThird'] };
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const t = pickIntervalTarget(opts, prev, Math.random);
    assert.ok(t.positions.length > 0);
    const iv = intervalById(t.interval);
    assert.equal(t.midi, noteAt(t.root.string, t.root.fret).midi + iv.semitones);
    assert.ok(isNatural(noteAt(t.root.string, t.root.fret).name));
    for (const p of t.positions) assert.equal(noteAt(p.string, p.fret).midi, t.midi);
    if (prev) assert.ok(!(t.root.string === prev.root.string && t.root.fret === prev.root.fret && t.interval === prev.interval));
    prev = t;
  }
  // Octave down from the lowest notes is impossible; octave up from string 1 fret 0..11 needs fret 12+ -> none in range on string 1 only
  assert.equal(pickIntervalTarget({ ...opts, strings: [0], intervals: ['octaveUp'] }, null, Math.random), null);
  assert.equal(pickIntervalTarget({ ...opts, intervals: [] }, null, Math.random), null);
});
