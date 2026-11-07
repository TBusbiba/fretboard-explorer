import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/session.js';
import { voicingsFor } from '../js/triad-match.js';

function make(voicings, extra = {}) {
  const events = [];
  let t = 1000;
  const session = createSession({
    getSettings: () => ({ mode: 'triads', pauseMs: 900 }),
    now: () => t, onEvent: (type, p) => events.push([type, p]),
    pickTriad: () => ({ rootPc: 0, quality: 'major', group: '321', kind: 'normal', voicings, ...extra }),
  });
  session.start();
  return { session, events, advance: (ms) => { t += ms; } };
}
const HELD = { fresh: true, heldMs: 300 };
const types = (events) => events.map(e => e[0]);

test('triads: all three shapes, any order; shape events then correct, state resolved only at the end', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  assert.deepEqual(session.acceptedMidis().sort(), vs.map(v => v.notes[0].midi).sort());
  for (const v of [vs[2], vs[0]]) v.notes.forEach(n => session.noteDetected(n.midi));
  assert.equal(session.state, 'listening');
  assert.equal(types(events).filter(t => t === 'shape').length, 2);
  vs[1].notes.forEach(n => session.noteDetected(n.midi));
  const last = events[events.length - 1];
  assert.equal(last[0], 'correct');
  assert.equal(last[1].total, 3);
  assert.equal(last[1].voicings.length, 3);
  assert.equal(session.state, 'resolved');
});

test('triads: the clock, first try and hints count per shape', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events, advance } = make(vs);
  advance(5000);
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  advance(2000);
  session.stableDetected(30, HELD);
  vs[1].notes.forEach(n => session.noteDetected(n.midi));
  advance(3000);
  vs[2].notes.forEach(n => session.noteDetected(n.midi));
  const done = events.filter(e => e[0] === 'shape' || e[0] === 'correct').map(e => [e[1].ms, e[1].firstTry]);
  assert.deepEqual(done, [[5000, true], [2000, false], [3000, true]]);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
});

test('triads: a repeated shape is ignored (dup), not a mistake', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  session.noteDetected(vs[0].notes[0].midi);
  const dup = events.find(e => e[0] === 'dup');
  assert.equal(dup[1].shape, vs[0].shape);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 0);
  assert.ok(!session.acceptedMidis().includes(vs[0].notes[0].midi));
});

test('triads: a note that is not the lowest note of a shape is a wrong start, counted once', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  session.stableDetected(30, HELD); session.stableDetected(30, HELD);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
  assert.equal(session.step, 0);
});

const wrongs = (events) => events.filter(e => e[0] === 'wrong').length;

test('triads: the last note of the finished shape ringing into the next shape is no mistake', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events, advance } = make(vs);
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  advance(400);
  for (const n of vs[0].notes) session.stableDetected(n.midi, HELD);
  advance(900);   // still inside the ring window
  session.stableDetected(vs[0].notes[2].midi, HELD);
  assert.equal(wrongs(events), 0);
  advance(1000);  // past the window: a ringing pitch still needs fresh + hold,
  session.stableDetected(vs[0].notes[2].midi, { fresh: false, heldMs: 400 });
  assert.equal(wrongs(events), 0);
});

test('triads: a held previous-string note during the same shape is no mistake', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  const [a, b] = vs[0].notes;
  session.noteDetected(a.midi);
  session.noteDetected(b.midi);
  session.stableDetected(a.midi, HELD);
  session.stableDetected(a.midi + 12, HELD);
  assert.equal(wrongs(events), 0);
});

test('triads: a freshly attacked wrong note held 300 ms is one mistake; a short or unattacked one is none', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  session.stableDetected(30, { fresh: true, heldMs: 100 });
  session.stableDetected(30, { fresh: false, heldMs: 400 });
  assert.equal(wrongs(events), 0);
  session.stableDetected(30, HELD); session.stableDetected(30, HELD);
  assert.equal(wrongs(events), 1);
});

test('triads: an octave slip of the expected note is accepted, not a mistake', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  const first = vs[0].notes[0].midi;
  session.noteDetected(first + 12);
  assert.equal(session.step, 1);
  assert.equal(wrongs(events), 0);
});

const WIN = { from: 0, to: 6 };
test('triads window: the same shape 12 frets up is wrong, not an octave slip', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  const up = vs[0].notes[0].midi + 12;
  session.noteDetected(up);
  assert.equal(session.step, 0);
  assert.equal(events.filter(e => e[0] === 'step').length, 0);
  session.stableDetected(up, HELD);
  assert.equal(wrongs(events), 1);
});
test('triads window: the first note of another shape of the chord is wrong, not a step', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  session.noteDetected(vs[1].notes[0].midi);
  assert.equal(session.step, 0);
  session.stableDetected(vs[1].notes[0].midi, HELD);
  assert.equal(wrongs(events), 1);
});
test('triads window: playing the one shape resolves the question (correct, total 1, no shape event)', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  const last = events[events.length - 1];
  assert.equal(last[0], 'correct');
  assert.equal(last[1].total, 1);
  assert.equal(events.filter(e => e[0] === 'shape').length, 0);
  assert.equal(session.state, 'resolved');
});

test('triads: a window question hints in two stages, one delay apart (first note, then all three)', () => {
  const vs = voicingsFor(0, 'major', '321');
  const events = [];
  let t = 1000;
  const session = createSession({
    getSettings: () => ({ mode: 'triads', pauseMs: 900, hintDelayMs: 5000 }),
    now: () => t, onEvent: (type, p) => events.push([type, p]),
    pickTriad: () => ({ rootPc: 0, quality: 'major', group: '321', kind: 'normal', voicings: [vs[0]], window: { from: 0, to: 4 } }),
  });
  session.start();
  const hints = () => events.filter(e => e[0] === 'hint').map(e => e[1].stage);
  t += 4900; session.tick();
  assert.deepEqual(hints(), []);
  t += 200; session.tick();
  assert.deepEqual(hints(), [1]);
  t += 4900; session.tick();
  assert.deepEqual(hints(), [1]);
  t += 200; session.tick();
  assert.deepEqual(hints(), [1, 2]);
  assert.equal(events.find(e => e[0] === 'hint')[1].stages, 2);
});
