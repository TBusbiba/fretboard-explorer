import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSession } from '../js/session.js';
import { voicingsFor } from '../js/triad-match.js';

function make(voicings) {
  const events = [];
  const session = createSession({
    getSettings: () => ({ mode: 'triads', pauseMs: 900 }),
    now: () => 1000, onEvent: (t, p) => events.push([t, p]),
    pickTriad: () => ({ rootPc: 0, quality: 'major', group: '321', kind: 'normal', voicings }),
  });
  session.start();
  return { session, events };
}

test('triads: any shape of the chord answers, steps then done', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  const v = vs[vs.length - 1];
  assert.ok(session.acceptedMidis().length > 1);
  session.noteDetected(v.notes[0].midi);
  session.noteDetected(v.notes[1].midi);
  session.noteDetected(v.notes[2].midi);
  const last = events[events.length - 1];
  assert.equal(last[0], 'correct');
  assert.equal(last[1].played.voicing.shape, v.shape);
  assert.equal(session.state, 'resolved');
});

test('triads: a wrong note is counted once and breaks first try', () => {
  const vs = voicingsFor(0, 'major', '321');
  const { session, events } = make(vs);
  session.noteDetected(30); session.noteDetected(30);
  assert.equal(events.filter(e => e[0] === 'wrong').length, 1);
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  assert.equal(events[events.length - 1][1].firstTry, false);
});
