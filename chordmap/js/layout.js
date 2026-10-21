// Radial tree layout. Pure: no DOM.
//
// The chosen chord sits in the centre; its three neighbours fan out at 120°,
// and every further chord shows the two neighbours it didn't come from, each
// inside its parent's wedge. The positions are "homes" that nodes are sprung
// to, so the map can be dragged around but always settles back into shape.

import { neighbours } from './theory.js';

export const RING_RADII = [0, 160, 305, 440, 575];

/**
 * @returns {{ nodes: Array, edges: Array }}
 *   node: { key, chord, depth, parent (node|null), move, angle, home: {x, y} }
 *   edge: { key, from (node), to (node), via (dom7 chord) }
 */
export function buildTree(root, depth) {
  const nodes = [];
  const edges = [];
  const rootNode = { key: 'r', chord: root, depth: 0, parent: null, move: null, angle: -90, home: { x: 0, y: 0 } };
  nodes.push(rootNode);

  function grow(node, wedge) {
    if (node.depth >= depth) return;
    const next = neighbours(node.chord).filter(n => !node.parent || n.to !== node.parent.chord);
    next.forEach((n, i) => {
      // Root: parallel straight up, relative lower-left, leading-tone lower-right
      // (the image's arrangement). Deeper: split the parent's wedge evenly.
      const angle = node.depth === 0
        ? -90 - 120 * i
        : node.angle - wedge / 2 + (i + 0.5) * (wedge / next.length);
      const r = RING_RADII[node.depth + 1];
      const rad = (angle * Math.PI) / 180;
      const child = {
        key: `${node.key}.${n.move}`, chord: n.to, depth: node.depth + 1, parent: node, move: n.move,
        angle, home: { x: r * Math.cos(rad), y: r * Math.sin(rad) },
      };
      nodes.push(child);
      edges.push({ key: `${child.key}~`, from: node, to: child, via: n.via });
      grow(child, node.depth === 0 ? 120 : wedge / next.length);
    });
  }
  grow(rootNode, 360);
  return { nodes, edges };
}
