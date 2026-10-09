import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalyzer, pointBand } from '../js/vibrato/analysis.js';

// Synthesize a contour: home + dir*depth*(0.5-0.5cos) + options
function feed(an, { seconds = 2, rate = 5.5, depth = 100, home = 0, dir = 1, retOffset = 0, noise = 0, unevenAmp = 0, hop = 0.005 }) {
  for (let t = 0; t <= seconds; t += hop) {
    const d = depth * (1 + unevenAmp * Math.sin(2 * Math.PI * 0.6 * t));
    const ph = 0.5 - 0.5 * Math.cos(2 * Math.PI * rate * t);
    const n = noise * Math.sin(t * 53.3);
    an.push(t, home + dir * (retOffset + d * ph) + n);
  }
}

test('clean fretted vibrato: rate, depth and return are recovered; score high; no problem', () => {
  const an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { rate: 5.5, depth: 100, noise: 3 });
  const r = an.analyze();
  assert.ok(r.n >= 6, `cycles ${r.n}`);
  assert.ok(Math.abs(r.rate - 5.5) < 0.2, `rate ${r.rate}`);
  assert.ok(Math.abs(r.depth - 100) < 8, `depth ${r.depth}`);
  assert.ok(Math.abs(r.ret) < 6, `ret ${r.ret}`);
  assert.ok(r.score >= 85, `score ${r.score}`);
  assert.equal(r.problem.code, 'good');
});

test('too deep / too shallow are named with numbers', () => {
  let an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { depth: 145 });
  let r = an.analyze();
  assert.equal(r.problem.code, 'too-deep');
  assert.match(r.problem.text, /too high/);
  an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { depth: 55 });
  r = an.analyze();
  assert.equal(r.problem.code, 'too-shallow');
  assert.ok(r.score < 90 && r.score > 60, `score ${r.score}`);
});

test('not returning to the note is detected as sharp return', () => {
  const an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { retOffset: 28 });
  const r = an.analyze();
  assert.ok(Math.abs(r.ret - 28) < 5, `ret ${r.ret}`);
  assert.equal(r.problem.code, 'ret-sharp');
});

test('too fast and uneven', () => {
  let an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { rate: 8.8 });
  let r = an.analyze();
  assert.equal(r.problem.code, 'too-fast');
  an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { unevenAmp: 0.5, seconds: 3 });
  r = an.analyze();
  assert.equal(r.problem.code, 'uneven');
  assert.ok(r.evenness > 20);
});

test('bend mode: dips below the target are the right direction; going above is overshoot', () => {
  let an = createAnalyzer({ mode: 'bend', depth: 100, bendCents: 200 });
  feed(an, { home: 200, dir: -1, depth: 100 });
  let r = an.analyze();
  assert.ok(Math.abs(r.depth - 100) < 8, `depth ${r.depth}`);
  assert.equal(r.problem.code, 'good');
  assert.equal(r.overshoot, 0);
  // returning 40¢ above the target each cycle
  an = createAnalyzer({ mode: 'bend', depth: 100, bendCents: 200 });
  feed(an, { home: 200, dir: -1, depth: 100, retOffset: -40 });
  r = an.analyze();
  assert.ok(r.overshoot > 30, `overshoot ${r.overshoot}`);
  assert.ok(['overshoot', 'ret-sharp'].includes(r.problem.code), r.problem.code);
});

test('fewer than two cycles yields no verdict', () => {
  const an = createAnalyzer({ mode: 'fretted', depth: 100 });
  feed(an, { seconds: 0.25 });
  const r = an.analyze();
  assert.equal(r.score, null);
  assert.equal(r.problem, null);
});

test('pointBand grades distance from the corridor', () => {
  assert.equal(pointBand(50, { depth: 100 }), 'ok');
  assert.equal(pointBand(110, { depth: 100 }), 'ok');
  assert.equal(pointBand(130, { depth: 100 }), 'warn');
  assert.equal(pointBand(160, { depth: 100 }), 'bad');
  assert.equal(pointBand(-50, { depth: 100 }), 'bad');
  assert.equal(pointBand(150, { mode: 'bend', depth: 100, bendCents: 200 }), 'ok');
  assert.equal(pointBand(260, { mode: 'bend', depth: 100, bendCents: 200 }), 'bad');
});
