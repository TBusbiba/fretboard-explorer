import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/session.js';
import { voicingsFor } from '../js/triad-match.js';

function make(voicings) {
  const events = [];
  let t = 1000;
  const session = createSession({
    getSettings: () => ({ mode: 'triads', pauseMs: 900 }),
    now: () => t, onEvent: (type, p) => events.push([type, p]),
    pickTriad: () => ({ rootPc: 0, quality: 'major', group: '321', kind: 'normal', voicings }),
  });
  session.start();
  return { session, events, advance: (ms) => { t += ms; } };
}
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
  session.noteDetected(30);
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
  session.noteDetected(30); session.noteDetected(30);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
  assert.equal(session.step, 0);
});
