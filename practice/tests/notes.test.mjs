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

test('pickArpeggioTarget builds one chord tone per string within a 5-fret window, root first', async () => {
  const { pickArpeggioTarget, chordById } = await import('../js/notes.js');
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: true, chords: ['major', 'minor', 'dom7', 'min7', 'maj7'] };
  let prev = null;
  for (let i = 0; i < 300; i++) {
    const t = pickArpeggioTarget(opts, prev, Math.random);
    const chord = chordById(t.chord);
    const root = noteAt(t.root.string, t.root.fret);
    assert.equal(t.notes[0].string, t.root.string);
    assert.equal(t.notes[0].fret, t.root.fret);
    assert.equal(t.notes[0].degree, 0);
    assert.equal(t.notes.length, t.root.string + 1, 'one note per string up to string 1');
    for (let k = 0; k < t.notes.length; k++) {
      const n = t.notes[k];
      assert.equal(n.string, t.root.string - k);
      assert.ok(n.fret >= t.root.fret && n.fret <= t.root.fret + 4, `fret ${n.fret} in window of ${t.root.fret}`);
      assert.equal(noteAt(n.string, n.fret).midi, n.midi);
      assert.ok(chord.tones.includes((((n.midi - root.midi) % 12) + 12) % 12));
    }
    assert.ok(t.root.fret + 4 <= opts.fretTo);
    if (prev) assert.ok(!(t.root.string === prev.root.string && t.root.fret === prev.root.fret && t.chord === prev.chord));
    prev = t;
  }
  // The classic shapes come out right: C major with the root on string 5 fret 3 (A-shape).
  const fixed = { ...opts, chords: ['major'] };
  let t;
  for (let i = 0; i < 2000 && !(t && t.root.string === 4 && t.root.fret === 3); i++) t = pickArpeggioTarget(fixed, null, Math.random);
  assert.deepEqual(t.notes.map(n => [n.string, n.fret]), [[4, 3], [3, 5], [2, 5], [1, 5], [0, 3]]);
});

test('pickArpeggioTarget returns null when a string in the run is disabled or the range is too short', async () => {
  const { pickArpeggioTarget } = await import('../js/notes.js');
  assert.equal(pickArpeggioTarget({ strings: [0, 1, 2, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: false, chords: ['major'] }, null, Math.random), null);
  assert.equal(pickArpeggioTarget({ strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 3, naturalsOnly: false, chords: ['major'] }, null, Math.random), null);
});

test('pickTriadTarget: ascending close voicing on the chosen 3-string group, right inversion, within 5 frets', async () => {
  const { pickTriadTarget, triadById, stringGroupById, NOTE_NAMES } = await import('../js/notes.js');
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: true,
    triads: ['major', 'minor', 'dim', 'aug', 'dom7', 'min7'], triadGroups: ['654', '543', '432', '321'] };
  let prev = null;
  for (let i = 0; i < 400; i++) {
    const t = pickTriadTarget(opts, prev, Math.random);
    const triad = triadById(t.triad), group = stringGroupById(t.group);
    assert.deepEqual(t.notes.map(n => n.string), group.strings);
    assert.ok(t.notes[0].midi < t.notes[1].midi && t.notes[1].midi < t.notes[2].midi, 'ascending');
    const frets = t.notes.map(n => n.fret);
    assert.ok(Math.max(...frets) - Math.min(...frets) <= 4);
    assert.ok(frets.every(f => f >= 0 && f <= 11));
    // degrees are the triad tones rotated by the inversion
    assert.deepEqual(t.notes.map(n => n.degree), [0, 1, 2].map(k => triad.tones[(t.inversion + k) % 3]));
    for (const n of t.notes) assert.equal((((n.midi - t.rootPc) % 12) + 12) % 12, n.degree);
    assert.ok(NOTE_NAMES[t.rootPc] && !NOTE_NAMES[t.rootPc].includes('♯'));
    assert.equal(noteAt(t.root.string, t.root.fret).midi % 12, t.rootPc);
    prev = t;
  }
  // A known shape: C major root position on 3·2·1 = G string fret 5 (C), B string fret 5 (E), E string fret 3 (G)
  const fixed = { ...opts, triads: ['major'], triadGroups: ['321'] };
  let t;
  for (let i = 0; i < 3000 && !(t && t.rootPc === 0 && t.inversion === 0); i++) t = pickTriadTarget(fixed, null, Math.random);
  assert.deepEqual(t.notes.map(n => [n.string + 1, n.fret]), [[3, 5], [2, 5], [1, 3]]);
});

test('pickTriadTarget returns null without groups or with a disabled string', async () => {
  const { pickTriadTarget } = await import('../js/notes.js');
  assert.equal(pickTriadTarget({ strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: false, triads: ['major'], triadGroups: [] }, null, Math.random), null);
  assert.equal(pickTriadTarget({ strings: [0, 1, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: false, triads: ['major'], triadGroups: ['321'] }, null, Math.random), null);
});

test('triad inversion control: random never repeats, fixed sticks, cycle walks root -> 1st -> 2nd up the neck', async () => {
  const { pickTriadTarget } = await import('../js/notes.js');
  const base = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: true, triads: ['major'], triadGroups: ['321'] };
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const t = pickTriadTarget({ ...base, triadInversion: 'random' }, prev, Math.random);
    if (prev) assert.notEqual(t.inversion, prev.inversion);
    prev = t;
  }
  for (const inv of [0, 1, 2]) {
    for (let i = 0; i < 50; i++) assert.equal(pickTriadTarget({ ...base, triadInversion: inv }, null, Math.random).inversion, inv);
  }
  const cyc = { ...base, triadInversion: 'cycle' };
  const low = (t) => Math.min(...t.notes.map(n => n.fret));
  const sameChord = (x, y) => x.group === y.group && x.triad === y.triad && x.rootPc === y.rootPc;
  for (let trial = 0; trial < 20; trial++) {
    // walk: same chord, strictly up the neck, inversions advancing, until a new chord starts low
    let t = pickTriadTarget(cyc, null, Math.random);
    const first = t;
    let steps = 0;
    for (;;) {
      const n = pickTriadTarget(cyc, t, Math.random);
      if (!sameChord(n, t)) {
        assert.ok(steps >= 1, 'a cycle has at least two voicings');
        assert.ok(!sameChord(n, first), 'the next cycle is a different chord');
        break;
      }
      assert.ok(low(n) > low(t), `climbs: ${low(t)} -> ${low(n)}`);
      assert.equal(n.inversion, (t.inversion + 1) % 3, 'next voicing up is the next inversion');
      t = n; steps++;
    }
  }
});

test('ordered inversions: root -> 1st -> 2nd of the same chord on the same strings, then a new chord', async () => {
  const { pickTriadTarget } = await import('../js/notes.js');
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: true,
    triads: ['major', 'minor'], triadGroups: ['654', '543', '432', '321'], triadInversion: 'ordered' };
  const sameChord = (x, y) => x.group === y.group && x.triad === y.triad && x.rootPc === y.rootPc;
  let prev = null;
  for (let round = 0; round < 30; round++) {
    const a = pickTriadTarget(opts, prev, Math.random);
    const b = pickTriadTarget(opts, a, Math.random);
    const c = pickTriadTarget(opts, b, Math.random);
    assert.deepEqual([a.inversion, b.inversion, c.inversion], [0, 1, 2]);
    assert.ok(sameChord(a, b) && sameChord(b, c), 'same chord');
    assert.equal(a.group, b.group); assert.equal(b.group, c.group);
    if (prev) assert.ok(!sameChord(a, prev), 'new chord after a full round');
    prev = c;
  }
});
