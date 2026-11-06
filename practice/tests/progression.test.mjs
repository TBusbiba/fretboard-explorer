import { test } from 'node:test';
import assert from 'node:assert/strict';
import { voicingsFor, questionVoicings } from '../js/triad-match.js';
import { resolveProgression, PROGRESSIONS, KEY_ORDER } from '../js/keys.js';
import { CHAIN_RANGE, voicingDistance, closestVoicings, chainFrom, createProgressionRun } from '../js/progression.js';

const fr = (v) => v.notes.map(n => n.fret);
const fake = (frets) => ({ shape: 1, lowestFret: Math.min(...frets), notes: frets.map(fret => ({ fret, midi: 40 + fret })) });
const startG = (frets) => voicingsFor(7, 'major', '321', CHAIN_RANGE).find(v => fr(v).join() === frets.join());
const G = resolveProgression('G', 'I–V–vi–IV');

test('distance is the sum of fret differences; open strings are fret 0', () => {
  assert.equal(voicingDistance(fake([4, 3, 3]), fake([2, 3, 2])), 3);
  assert.equal(voicingDistance(fake([0, 1, 0]), fake([2, 1, 3])), 5);
});

test('closestVoicings returns every tie, none for no candidates', () => {
  const r = closestVoicings(fake([3, 3, 3]), [fake([2, 3, 3]), fake([4, 3, 3]), fake([9, 9, 9])]);
  assert.deepEqual(r.map(fr), [[2, 3, 3], [4, 3, 3]]);
  assert.deepEqual(closestVoicings(fake([0, 1, 0]), []), []);
});

test('worked example, low: G major I-V-vi-IV stays inside frets 2-5', () => {
  const chain = chainFrom(startG([4, 3, 3]), G, '321');
  assert.deepEqual(chain.map(fr), [[4, 3, 3], [2, 3, 2], [4, 5, 3], [5, 5, 3]]);
  assert.ok(chain.every(v => v.notes.every(n => n.fret >= 2 && n.fret <= 5)));
});

test('worked example, high: from G7 B8 e7 every chord stays at fret 5 or higher', () => {
  const chain = chainFrom(startG([7, 8, 7]), G, '321');
  assert.deepEqual(chain.map(fr), [[7, 8, 7], [7, 7, 5], [9, 8, 7], [9, 8, 8]]);
  assert.ok(chain.every(v => v.lowestFret >= 5));
});

test('no dead end: every key x progression x group chains from every first-chord shape', () => {
  for (const group of ['654', '543', '432', '321']) for (const k of KEY_ORDER) for (const p of PROGRESSIONS) {
    const chords = resolveProgression(k, p.id);
    for (const start of questionVoicings(chords[0].pc, chords[0].quality, group)) {
      assert.equal(chainFrom(start, chords, group).length, chords.length, `${k} ${p.id} ${group}`);
    }
  }
});

const play = (run, v) => v.notes.map(n => run.feed(n.midi).status);

test('run: chord 1 takes any shape, then only the closest shapes; ties all accepted', () => {
  const run = createProgressionRun(G, '321');
  assert.equal(run.candidates.length, questionVoicings(7, 'major', '321').length);
  assert.deepEqual(play(run, startG([4, 3, 3])), ['step', 'step', 'shape']);
  assert.equal(run.index, 1);
  assert.deepEqual(fr(run.previous), [4, 3, 3]);
  assert.deepEqual(run.candidates.map(fr), [[2, 3, 2]]);
});

test('run: tie between two shapes accepts both first notes', () => {
  const GF = [{ pc: 7, quality: 'major' }, { pc: 5, quality: 'major' }];
  const run = createProgressionRun(GF, '321');
  play(run, startG([4, 3, 3]));
  assert.deepEqual(run.candidates.map(fr), [[2, 1, 1], [5, 6, 5]]);
  assert.equal(run.expected().length, 2);
});

test('run: a farther shape is wrong; the whole run finishes with done', () => {
  const run = createProgressionRun(G, '321');
  const chain = chainFrom(startG([4, 3, 3]), G, '321');
  play(run, chain[0]);
  const far = voicingsFor(2, 'major', '321', CHAIN_RANGE).find(v => v.lowestFret >= 9);
  const w = run.feed(far.notes[0].midi);
  assert.deepEqual([w.status, w.step, w.index], ['wrong', 0, 1]);
  assert.equal(run.feed(chain[1].notes[0].midi).status, 'step');
  assert.equal(run.feed(chain[1].notes[0].midi + 1).status, 'wrong');
  assert.equal(run.step, 1);
  chain[1].notes.slice(1).forEach(n => run.feed(n.midi));
  play(run, chain[2]);
  const last = play(run, chain[3]);
  assert.deepEqual(last, ['step', 'step', 'done']);
  assert.equal(run.found.length, 4);
  assert.equal(run.feed(0).status, 'done');
});

test('run: reset restores chord 1', () => {
  const run = createProgressionRun(G, '321');
  play(run, startG([4, 3, 3]));
  run.reset();
  assert.deepEqual([run.index, run.step, run.found.length, run.previous], [0, 0, 0, null]);
});
