import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/session.js';
import { noteAt } from '../js/notes.js';

function harness(overrides = {}) {
  let t = 1000;
  const events = [];
  const settings = {
    strings: [4], fretFrom: 0, fretTo: 3, naturalsOnly: true, // A, B, C on A string
    hintDelayMs: 3000, pauseMs: 500,
    ...overrides,
  };
  const s = createSession({
    getSettings: () => settings,
    now: () => t,
    rng: () => 0, // always picks the first candidate: A string fret 0 (A)
    onEvent: (type, payload) => events.push({ type, ...payload }),
  });
  return { s, events, settings, advance: (ms) => { t += ms; s.tick(); }, time: () => t };
}

test('start emits a target and begins listening', () => {
  const { s, events } = harness();
  s.start();
  assert.equal(s.state, 'listening');
  assert.equal(events[0].type, 'target');
  assert.deepEqual(events[0].target, { string: 4, fret: 0 });
  assert.equal(events[0].note.name, 'A');
});

test('hint fires after the delay, once', () => {
  const { s, events, advance } = harness();
  s.start();
  advance(2999);
  assert.ok(!events.some(e => e.type === 'hint'));
  advance(1);
  assert.equal(events.filter(e => e.type === 'hint').length, 1);
  advance(5000);
  assert.equal(events.filter(e => e.type === 'hint').length, 1);
});

test('hint never fires when delay is null', () => {
  const { s, events, advance } = harness({ hintDelayMs: null });
  s.start();
  advance(60_000);
  assert.ok(!events.some(e => e.type === 'hint'));
});

test('correct pitch resolves, records time, then advances after pause', () => {
  const { s, events, advance } = harness();
  s.start();
  advance(1200);
  s.noteDetected(45); // A2 = A string open
  const correct = events.find(e => e.type === 'correct');
  assert.ok(correct);
  assert.equal(correct.ms, 1200);
  assert.equal(correct.firstTry, true);
  assert.equal(s.state, 'resolved');
  advance(499);
  assert.equal(events.filter(e => e.type === 'target').length, 1);
  advance(1);
  assert.equal(events.filter(e => e.type === 'target').length, 2);
  assert.equal(s.state, 'listening');
});

test('wrong note announced once per distinct pitch, marks not first try', () => {
  const { s, events, advance } = harness();
  s.start();
  s.noteDetected(47); // B
  s.noteDetected(47);
  s.noteDetected(48); // C
  const wrongs = events.filter(e => e.type === 'wrong');
  assert.equal(wrongs.length, 2);
  assert.equal(wrongs[0].name, 'B');
  assert.equal(wrongs[0].fret, 2);   // B lives at fret 2 on the A string
  assert.equal(wrongs[1].name, 'C');
  s.noteDetected(45);
  const correct = events.find(e => e.type === 'correct');
  assert.equal(correct.firstTry, false);
  assert.equal(s.stats.total, 1);
  assert.equal(s.stats.firstTry, 0);
  assert.equal(s.stats.wrong, 2);
});

test('wrong pitch not on target string reports fret -1', () => {
  const { s, events } = harness();
  s.start();
  s.noteDetected(30);
  assert.equal(events.find(e => e.type === 'wrong').fret, -1);
});

test('notes detected while resolved or idle are ignored', () => {
  const { s, events } = harness();
  s.noteDetected(45);
  assert.equal(events.length, 0);
  s.start();
  s.noteDetected(45);
  const n = events.length;
  s.noteDetected(47);
  assert.equal(events.length, n);
});

test('skip moves to next target and counts as skipped', () => {
  const { s, events } = harness();
  s.start();
  s.skip();
  assert.equal(events.filter(e => e.type === 'target').length, 2);
  assert.equal(s.stats.skipped, 1);
  assert.equal(s.stats.total, 0);
});

test('showHint emits hint immediately and only once', () => {
  const { s, events, advance } = harness();
  s.start();
  s.showHint();
  s.showHint();
  advance(10_000);
  assert.equal(events.filter(e => e.type === 'hint').length, 1);
});

test('stop emits stopped and ignores further ticks', () => {
  const { s, events, advance } = harness();
  s.start();
  s.stop();
  assert.equal(s.state, 'idle');
  assert.ok(events.some(e => e.type === 'stopped'));
  advance(10_000);
  assert.ok(!events.some(e => e.type === 'hint'));
});

test('stats average time uses correct answers only', () => {
  const { s, advance } = harness();
  s.start();
  advance(1000); s.noteDetected(s.note.midi); advance(500);
  advance(3000); s.noteDetected(s.note.midi);
  assert.equal(s.stats.total, 2);
  assert.equal(s.stats.avgMs, 2000);
});

test('start with no candidates emits error and stays idle', () => {
  const { s, events } = harness({ strings: [] });
  s.start();
  assert.equal(s.state, 'idle');
  assert.equal(events[0].type, 'error');
});

test('reads settings fresh on every target', () => {
  const { s, events, settings } = harness();
  s.start();
  settings.strings = [5];
  settings.fretFrom = 1; settings.fretTo = 1; settings.naturalsOnly = false;
  s.skip();
  const t = events.filter(e => e.type === 'target').at(-1).target;
  assert.deepEqual(t, { string: 5, fret: 1 });
  assert.equal(noteAt(5, 1).name, 'F');
});

test('wrong note reports octave offset when the note name matches', () => {
  const { s, events } = harness();
  s.start();                 // target A string open = A2 (45)
  s.noteDetected(57);        // A3
  s.noteDetected(33);        // A1
  s.noteDetected(47);        // B
  const w = events.filter(e => e.type === 'wrong');
  assert.deepEqual(w.map(e => e.octaveOff), [1, -1, 0]);
  assert.equal(w[0].name, 'A');
});

test('intervals mode: root first, then the interval; hints come in two stages', () => {
  const { s, events, advance } = harness({
    mode: 'intervals', strings: [4, 3], fretFrom: 0, fretTo: 11, naturalsOnly: true, intervals: ['fifth'],
  });
  s.start();
  const t = events[0];
  assert.equal(t.mode, 'intervals');
  assert.equal(s.step, 0);
  assert.equal(s.note.midi, s.rootNote.midi, 'step 0 expects the root');
  assert.equal(s.interval.semitones, 7);
  assert.equal(s.target.midi, s.rootNote.midi + 7);
  assert.ok(t.target.positions.length >= 1);

  // playing the interval before the root is wrong
  s.noteDetected(s.target.midi);
  assert.equal(events.filter(e => e.type === 'wrong').length, 1);
  assert.equal(events.at(-1).fret, -1);

  // root -> step event, now expecting the interval
  s.noteDetected(s.rootNote.midi);
  const step = events.find(e => e.type === 'step');
  assert.equal(step.step, 1);
  assert.equal(s.step, 1);
  assert.equal(s.note.midi, s.target.midi);
  assert.equal(s.state, 'listening');

  // hint stages: tip at 3 s, positions at 6 s
  advance(3000);
  assert.deepEqual(events.filter(e => e.type === 'hint').map(e => [e.stage, e.stages]), [[1, 2]]);
  assert.equal(s.hintShown, false);
  advance(3000);
  assert.deepEqual(events.filter(e => e.type === 'hint').map(e => e.stage), [1, 2]);
  assert.equal(s.hintShown, true);

  s.noteDetected(s.target.midi);
  const c = events.find(e => e.type === 'correct');
  assert.ok(c);
  assert.equal(c.firstTry, false, 'a wrong note in any step spoils first-try');
  assert.equal(c.hinted, true);
});

test('intervals: manual hint steps through the stages; note mode has one stage', () => {
  const iv = harness({ mode: 'intervals', strings: [4, 3], fretFrom: 0, fretTo: 11, intervals: ['fifth'] });
  iv.s.start();
  iv.s.showHint(); iv.s.showHint(); iv.s.showHint();
  assert.deepEqual(iv.events.filter(e => e.type === 'hint').map(e => e.stage), [1, 2]);
  const n = harness();
  n.s.start();
  n.s.showHint(); n.s.showHint();
  assert.deepEqual(n.events.filter(e => e.type === 'hint').map(e => [e.stage, e.stages]), [[1, 1]]);
  assert.equal(n.s.hintShown, true);
});

test('hintProgress reports the fraction toward the next stage', () => {
  const { s, advance } = harness({ hintDelayMs: 4000 });
  assert.equal(s.hintProgress(), null);
  s.start();
  advance(1000);
  assert.equal(s.hintProgress().fraction, 0.25);
  assert.equal(s.hintProgress().remainingMs, 3000);
  advance(3000);
  assert.equal(s.hintProgress(), null); // stage reached, note mode done
});

test('intervals mode with no reachable drill emits error', () => {
  const { s, events } = harness({ mode: 'intervals', strings: [0], fretFrom: 0, fretTo: 11, intervals: ['octaveUp'] });
  s.start();
  assert.equal(s.state, 'idle');
  assert.equal(events[0].type, 'error');
});

test('switching mode between targets starts fresh (no cross-mode repeat check crash)', () => {
  const { s, events, settings } = harness();
  s.start();
  settings.mode = 'intervals'; settings.intervals = ['fifth'];
  settings.strings = [4, 3]; settings.fretTo = 11;
  s.skip();
  const t = events.filter(e => e.type === 'target').at(-1);
  assert.equal(t.mode, 'intervals');
  settings.mode = 'note';
  s.skip();
  assert.equal(events.filter(e => e.type === 'target').at(-1).mode, 'note');
});
