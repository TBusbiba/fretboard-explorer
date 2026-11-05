import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS } from '../js/path.js';
import { levelTip, TIPS, neckSvg } from '../js/tips.js';

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
  assert.deepEqual(discs(levelTip(2).svg).map(d => d.note), ['B', 'E', 'A', 'D']);               // BEAD
  assert.deepEqual(discs(levelTip(3).svg).map(d => d.note), ['G', 'A', 'B', 'G', 'A', 'B']);
  assert.deepEqual(discs(levelTip(4).svg).filter(d => d.kind === 'c').map(d => d.note), ['C', 'D', 'E']);
  const open = discs(levelTip(1).svg);
  assert.equal(open.length, 12);
  assert.deepEqual(open.map(d => d.note).sort(), ['A', 'A', 'B', 'B', 'D', 'D', 'E', 'E', 'E', 'E', 'G', 'G']);
  const neighbours = discs(levelTip(5).svg);
  assert.deepEqual(neighbours.filter(d => d.kind === 'c').map(d => d.note), ['E', 'F', 'B', 'C']);
  assert.ok(neighbours.every(d => !d.note.includes('♯')));
  const sharps = discs(levelTip(7).svg);
  assert.deepEqual(sharps.filter(d => d.kind === 'p').map(d => d.note), ['F♯', 'G♯', 'A♯', 'C♯', 'D♯']);
  assert.deepEqual(discs(levelTip(6).svg).filter(d => d.kind === 'a').map(d => d.note), ['A', 'C', 'D', 'E', 'A']);
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
