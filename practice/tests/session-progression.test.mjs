import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/session.js';
import { voicingsFor } from '../js/triad-match.js';
import { resolveProgression } from '../js/keys.js';
import { CHAIN_RANGE, chainFrom, createProgressionRun } from '../js/progression.js';

const fr = (v) => v.notes.map(n => n.fret).join();
const chords = resolveProgression('G', 'I–V–vi–IV');
const start = voicingsFor(7, 'major', '321', CHAIN_RANGE).find(v => fr(v) === '4,3,3');
const chain = chainFrom(start, chords, '321');
const HELD = { fresh: true, heldMs: 300 };
const types = (events) => events.map(e => e[0]);

function make(pick) {
  const events = [];
  let t = 1000;
  const run = createProgressionRun(chords, '321');
  const session = createSession({
    getSettings: () => ({ mode: 'triads', pauseMs: 900 }),
    now: () => t, onEvent: (type, p) => events.push([type, p]),
    pickTriad: pick || (() => ({ kind: 'progression', rootPc: 7, quality: 'major', group: '321', voicings: run.candidates, run, chords })),
  });
  session.start();
  return { session, events, run, advance: (ms) => { t += ms; } };
}

test('progression: the worked chain emits step step shape per chord, then correct; resolved only at the end', () => {
  const { session, events } = make();
  for (const v of chain) {
    assert.equal(session.state, 'listening');
    v.notes.forEach(n => session.noteDetected(n.midi));
  }
  assert.deepEqual(types(events), ['target', 'step', 'step', 'shape', 'step', 'step', 'shape', 'step', 'step', 'shape', 'step', 'step', 'correct']);
  assert.equal(events[events.length - 1][1].total, 4);
  assert.equal(session.state, 'resolved');
});

test('progression: after chord 1 only the closest D voicing is accepted and shown', () => {
  const { session } = make();
  chain[0].notes.forEach(n => session.noteDetected(n.midi));
  assert.deepEqual(session.acceptedMidis(), [chain[1].notes[0].midi]);
  assert.equal(session.note.midi, chain[1].notes[0].midi);
});

test('progression: the clock restarts at each chord', () => {
  const { session, events, advance } = make();
  advance(2000);
  chain[0].notes.forEach(n => session.noteDetected(n.midi));
  advance(500);
  chain[1].notes.forEach(n => session.noteDetected(n.midi));
  const ms = events.filter(e => e[0] === 'shape').map(e => e[1].ms);
  assert.deepEqual(ms, [2000, 500]);
});

test('progression: a farther shape is wrong, and only that chord loses its first try', () => {
  const { session, events, advance } = make();
  chain[0].notes.forEach(n => session.noteDetected(n.midi));
  const accepted = chain[1];
  const far = voicingsFor(2, 'major', '321', CHAIN_RANGE)
    .find(v => v.lowestFret >= 9 && Math.abs(v.notes[0].midi - accepted.notes[0].midi) % 12 !== 0);
  advance(2000);
  session.stableDetected(far.notes[0].midi, HELD);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
  chain[1].notes.forEach(n => session.noteDetected(n.midi));
  chain[2].notes.forEach(n => session.noteDetected(n.midi));
  const flags = events.filter(e => e[0] === 'shape').map(e => e[1].firstTry);
  assert.deepEqual(flags, [true, false, true]);
});

test('progression: the same shape 12 frets up is wrong, not an octave slip', () => {
  const { session, events, advance } = make();
  chain[0].notes.forEach(n => session.noteDetected(n.midi));
  const octaveUp = chain[1].notes.map(n => n.midi + 12);
  octaveUp.forEach(m => session.noteDetected(m));
  assert.equal(events.filter(e => e[0] === 'step' || e[0] === 'shape').length, 2 + 1);
  advance(2000);
  session.stableDetected(octaveUp[0], HELD);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
});

test('a target without a run still gets a triad matcher', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session } = make(() => ({ rootPc: 0, quality: 'major', group: '321', kind: 'normal', voicings: vs }));
  assert.equal(session.matcher.total, 3);
});
