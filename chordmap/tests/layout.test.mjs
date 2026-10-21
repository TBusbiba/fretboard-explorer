import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTree } from '../js/layout.js';
import { chord } from '../js/theory.js';

test('three neighbours at the centre, two new ones per chord after that', () => {
  const { nodes, edges } = buildTree(chord(0, 'maj'), 4);
  assert.equal(nodes.length, 1 + 3 + 6 + 12 + 24);
  assert.equal(edges.length, nodes.length - 1);
  const ring1 = nodes.filter(n => n.depth === 1).map(n => n.chord.name);
  assert.deepEqual(ring1, ['Cm', 'Am', 'Em']);
  // never step straight back to where you came from
  for (const n of nodes) if (n.parent?.parent) assert.notEqual(n.chord, n.parent.parent.chord);
});

test('homes are spread out: no two chords crowd each other', () => {
  const { nodes } = buildTree(chord(9, 'min'), 4);
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i].home, b = nodes[j].home;
    assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 90, `${nodes[i].key} vs ${nodes[j].key}`);
  }
});
