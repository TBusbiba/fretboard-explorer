import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/path.js';
import { levelTip, TIPS, neckSvg } from '../js/tips.js';
import { noteAt } from '../js/notes.js';

const discs = (svg) => [...svg.matchAll(/<g class="tn-disc tn-disc--(\w)" data-note="([^"]*)">/g)].map(m => ({ kind: m[1], note: m[2] }));

test('every level has a tip: headline, one sentence, a note and an SVG diagram', () => {
  for (const l of LEVELS) {
    const t = levelTip(l.id);
    assert.ok(t, `level ${l.id}`);
    assert.ok(t.headline && t.line && t.note);
    assert.ok(t.svg.startsWith('<svg') && t.svg.endsWith('</svg>'));
    assert.ok((t.svg.match(/<svg/g) || []).length === 1);
  }
  assert.equal(levelTip(99), null);
  assert.deepEqual(Object.keys(TIPS).map(Number), LEVELS.map(l => l.id));
});

test('diagram discs carry the real notes of the idea', () => {
  const notes = (id, kind) => discs(levelTip(id).svg).filter(d => !kind || d.kind === kind).map(d => d.note);
  assert.deepEqual(notes(1), ['E', 'A', 'E', 'A', 'A']);            // fret 12 repeats the open note; fret 5 on low E is A
  assert.deepEqual(notes(2), ['B', 'E', 'A', 'D']);                 // fret 7 on strings 6-3 (+ D on the G string)
  assert.deepEqual(notes(3), ['B', 'E', 'A', 'D']);                 // BEAD
  assert.deepEqual(notes(4), ['G', 'A', 'B', 'G', 'A', 'B']);
  assert.deepEqual(notes(5), ['B', 'C', 'D', 'E']);
  assert.deepEqual(notes(5, 'c'), ['C', 'D', 'E']);
  assert.deepEqual(notes(6, 'c'), ['E', 'F', 'B', 'C']);
  assert.ok(discs(levelTip(6).svg).every(d => !d.note.includes('♯')));
  const pairs = { 7: ['F', 'F♯'], 8: ['C', 'C♯'], 9: ['G', 'G♯'], 10: ['D', 'D♯'], 11: ['A', 'A♯'] };
  for (const [id, [nat, sharp]] of Object.entries(pairs)) {
    assert.deepEqual(notes(id, 'w'), Array(6).fill(nat), `level ${id}`);
    assert.deepEqual(notes(id, 'p'), Array(6).fill(sharp), `level ${id}`);
  }
});

test('fret positions: BEAD at fret 7, G A B at 3-5-7, the neighbours one fret apart', () => {
  assert.deepEqual([5, 4, 3, 2].map(s => noteAt(s, 7).name), ['B', 'E', 'A', 'D']);
  assert.deepEqual([3, 5, 7].map(f => noteAt(5, f).name), ['G', 'A', 'B']);
  assert.deepEqual([3, 5, 7].map(f => noteAt(0, f).name), ['G', 'A', 'B']);
  assert.deepEqual([3, 5, 7].map(f => noteAt(4, f).name), ['C', 'D', 'E']);
  assert.equal(noteAt(5, 5).name, 'A');
});

test('every disc label matches the note on the board (labels are computed, never typed)', () => {
  for (const l of LEVELS) {
    for (const m of levelTip(l.id).svg.matchAll(/data-note="([^"]*)"/g)) assert.match(m[1], /^[A-G]♯?$/);
  }
});

test('neckSvg escapes labels and keeps its parts', () => {
  const svg = neckSvg({ strings: [4], marks: [{ string: 4, fret: 3, kind: 'a', label: '<b>' }], arcs: [{ from: { string: 4, fret: 0 }, to: { string: 4, fret: 3 }, text: 'a&b' }] });
  assert.ok(svg.includes('&lt;b>') && svg.includes('a&amp;b'));
  assert.ok(!svg.includes('<b>'));
});
