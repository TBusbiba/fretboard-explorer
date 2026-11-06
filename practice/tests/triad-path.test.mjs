import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES } from '../js/notes.js';
import { WINDOW } from '../js/path.js';
import { voicingsFor } from '../js/triad-match.js';
import {
  TRIAD_LEVELS, evaluate, blankEntry, requiredShapes, chordKey, createTriadBag, createTriadBoss,
  createClimb, createClimbSchedule, climbHint, pickClimbChord, createTriadPathStore,
} from '../js/triad-path.js';

const pc = (n) => NOTE_NAMES.indexOf(n);
const names = (list) => list.map(c => `${NOTE_NAMES[c.root]}${c.quality === 'minor' ? 'm' : ''}@${c.group}`).join(' ');
const seq = (...v) => { let i = 0; return () => v[i++ % v.length]; };
function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m };
}
const good = (n, ft = true, ms = 2000) => Array.from({ length: n }, () => ({ ft, ms }));

test('eleven levels; L1 is C F G major on 3·2·1 only', () => {
  assert.equal(TRIAD_LEVELS.length, 11);
  assert.equal(names(TRIAD_LEVELS[0].pool), 'C@321 F@321 G@321');
  assert.equal(TRIAD_LEVELS[0].group, '321');
});

test('pools are cumulative and follow the spec counts', () => {
  assert.deepEqual(TRIAD_LEVELS.slice(0, 4).map(l => l.pool.length), [3, 6, 9, 14]);
  assert.equal(names(TRIAD_LEVELS[1].added), 'Am@321 Dm@321 Em@321');
  assert.equal(names(TRIAD_LEVELS[2].added), 'D@321 A@321 E@321');
  assert.equal(names(TRIAD_LEVELS[3].added), 'B@321 Cm@321 Fm@321 Gm@321 Bm@321');
  for (let i = 1; i < 10; i++) {
    const prev = new Set(TRIAD_LEVELS[i - 1].pool.map(chordKey));
    assert.ok([...prev].every(k => TRIAD_LEVELS[i].pool.some(c => chordKey(c) === k)), `L${i + 1} keeps earlier chords`);
  }
  assert.deepEqual([5, 6, 7, 8, 9, 10].map(i => TRIAD_LEVELS[i - 1].group), ['432', '432', '543', '543', '654', '654']);
  assert.equal(names(TRIAD_LEVELS[4].added), 'C@432 F@432 G@432 Am@432 Dm@432 Em@432');
  assert.equal(TRIAD_LEVELS[5].added.length, 8);
  assert.equal(TRIAD_LEVELS[9].pool.length, 56);
});

test('L11 asks every root and quality on every group', () => {
  const l = TRIAD_LEVELS[10];
  assert.equal(l.pool.length, 24 * 4);
  assert.ok(l.pool.some(c => c.root === pc('F♯') && c.quality === 'minor' && c.group === '321'));
  assert.ok(l.added.every(c => [1, 3, 6, 8, 10].includes(c.root)));
});

test('required shapes: major only on L1, both qualities from L2', () => {
  assert.deepEqual(requiredShapes(TRIAD_LEVELS[0]), ['major:1', 'major:2', 'major:3']);
  assert.equal(requiredShapes(TRIAD_LEVELS[1]).length, 6);
  assert.equal(requiredShapes(TRIAD_LEVELS[4]).length, 6);
});

test('evaluate: needs 20 answers, first-try share, time and every shape', () => {
  const L1 = TRIAD_LEVELS[0];
  const full = { ...blankEntry(), recent: good(WINDOW), shapes: ['major:1', 'major:2', 'major:3'] };
  assert.equal(evaluate(full, L1).unlocked, true);
  assert.equal(evaluate({ ...full, shapes: ['major:1', 'major:2'] }, L1).unlocked, false);
  assert.deepEqual(evaluate({ ...full, shapes: ['major:1', 'major:2'] }, L1).missing, ['major:3']);
  assert.equal(evaluate({ ...full, recent: good(WINDOW - 1) }, L1).unlocked, false);
  assert.equal(evaluate({ ...full, recent: good(WINDOW, true, 6500) }, L1).unlocked, false);
  const mixed = [...good(15, true), ...good(5, false)];
  assert.equal(evaluate({ ...full, recent: mixed }, L1).unlocked, true);
  assert.equal(evaluate({ ...full, recent: [...good(14, true), ...good(6, false)] }, L1).unlocked, false);
  const e = evaluate({ ...full, shapes: ['major:1'] }, L1);
  assert.equal(e.shapes, 1); assert.equal(e.shapesTotal, 3);
  assert.equal(evaluate(blankEntry(), L1).firstTryPct, null);
});

test('bag: every chord once before repeats, missing-shape chords first', () => {
  const bag = createTriadBag(seq(0.3, 0.7, 0.1));
  const l5 = TRIAD_LEVELS[4];
  const asked = Array.from({ length: l5.pool.length }, () => bag.next(l5, ['major:1']));
  assert.equal(new Set(asked.map(chordKey)).size, l5.pool.length);
  const wantedGroup = asked.slice(0, 3).every(c => c.group === '432' && c.quality === 'major');
  assert.ok(wantedGroup, 'newest group + missing quality first');
  const second = createTriadBag(() => 0.5);
  assert.equal(second.next(TRIAD_LEVELS[0], []).group, '321');
});

test('boss: every shape of the new chords, run by run, up the neck', () => {
  const boss = createTriadBoss(TRIAD_LEVELS[0]);
  assert.equal(boss.state, 'running');
  assert.equal(boss.runs.length, 3);
  const expect = TRIAD_LEVELS[0].added.flatMap(c => voicingsFor(c.root, c.quality, c.group, { from: 0, to: 12 }));
  assert.equal(boss.items.length, expect.length);
  for (const run of boss.runs) {
    const items = boss.items.filter(i => i.run === boss.runs.indexOf(run));
    const frets = items.map(i => i.voicing.lowestFret);
    assert.deepEqual(frets, [...frets].sort((a, b) => a - b));
    assert.deepEqual(items.map(i => i.n), items.map((_, k) => k + 1));
    assert.ok(items.every(i => i.of === items.length));
  }
  assert.deepEqual([...new Set(boss.items.map(i => NOTE_NAMES[i.root]))], ['C', 'F', 'G']);
  assert.equal(NOTE_NAMES[boss.items[0].root], 'C');
  assert.equal(boss.runStart, true);
});

test('boss: plays through, counts mistakes, awards stars', () => {
  const boss = createTriadBoss(TRIAD_LEVELS[0]);
  const n = boss.items.length;
  boss.wrong();
  for (let i = 0; i < n; i++) {
    assert.equal(boss.state, 'running');
    boss.correct(1500);
  }
  assert.equal(boss.state, 'passed');
  assert.equal(boss.mistakes, 1);
  assert.equal(boss.stars, 2);
  const skipped = createTriadBoss(TRIAD_LEVELS[0]);
  skipped.fail('skipped');
  assert.equal(skipped.state, 'failed');
  assert.equal(skipped.stars, 0);
});

test('climb: 3 shapes in order up the neck with +N frets hints', () => {
  const climb = createClimb({ root: pc('C'), quality: 'major', group: '321' }, 1);
  assert.deepEqual(climb.steps.map(s => s.shape), [3, 1, 2]);
  assert.deepEqual(climb.steps.map(s => s.voicing.lowestFret), [0, 3, 8]);
  assert.equal(climb.hint, null);
  assert.deepEqual(climb.advance(true), { done: false, perfect: true });
  assert.equal(climb.hint, '+3 frets');
  climb.advance(false);
  assert.equal(climb.hint, '+5 frets');
  assert.deepEqual(climb.advance(true), { done: true, perfect: false });
  assert.equal(climb.current, null);
  assert.equal(climbHint(climb.steps, 1), '+3 frets');
});

test('climb: a chord with fewer than 3 shapes below fret 12 still gets 3', () => {
  const climb = createClimb({ root: pc('F'), quality: 'major', group: '654' }, 9);
  assert.equal(climb.steps.length, 3);
  assert.equal(new Set(climb.steps.map(s => s.shape)).size, 3);
  const lows = climb.steps.map(s => s.voicing.lowestFret);
  assert.deepEqual(lows, [...lows].sort((a, b) => a - b));
});

test('climb schedule is due every 6 to 9 questions; chord pick prefers the newest group', () => {
  const s = createClimbSchedule(() => 0);
  const due = Array.from({ length: 13 }, () => s.due());
  assert.deepEqual(due.map((d, i) => d ? i + 1 : 0).filter(Boolean), [6, 12]);
  assert.equal(pickClimbChord(TRIAD_LEVELS[4], () => 0).group, '432');
});

test('store: own key, levels unlock one by one, record lights shape dots', () => {
  const st = memoryStorage();
  const p = createTriadPathStore(st);
  assert.equal(p.current, 1);
  assert.equal(p.isUnlocked(2), false);
  assert.equal(p.select(2), false);
  let r;
  for (let i = 0; i < WINDOW; i++) r = p.record(1, { quality: 'major', group: '321', shape: (i % 3) + 1, firstTry: true, ms: 2000 });
  assert.equal(r.bossUnlocked, true);
  assert.equal(p.progress(1).bossUnlocked, true);
  assert.equal(p.shapeCovered(1, 'major', 2), true);
  assert.ok(st.m.has('fretboard-practice.triad-path.v1'));
  assert.equal(p.record(1, { quality: 'major', group: '321', shape: 1, firstTry: true, ms: 1000 }).bossUnlocked, false);
});

test('store: shapes on older groups answer but do not count as coverage', () => {
  const p = createTriadPathStore(memoryStorage());
  const r = p.record(5, { quality: 'major', group: '321', shape: 1, firstTry: true, ms: 1000 });
  assert.equal(r.newShape, false);
  assert.equal(p.shapeCovered(5, 'major', 1), false);
  assert.equal(p.record(5, { quality: 'major', group: '432', shape: 1, firstTry: true, ms: 1000 }).newShape, true);
});

test('store: completing a boss opens the next level and persists', () => {
  const st = memoryStorage();
  const p = createTriadPathStore(st);
  const res = p.completeBoss(1, 1800, 0);
  assert.deepEqual([res.stars, res.first, res.next], [3, true, 2]);
  assert.equal(p.current, 2);
  const again = createTriadPathStore(st);
  assert.equal(again.isDone(1), true);
  assert.equal(again.stars(1), 3);
  assert.equal(again.select(2), true);
  assert.equal(again.saveBests(2, { streak: 5, score: 100 }), true);
  assert.equal(again.saveBests(2, { streak: 4, score: 90 }), false);
  again.reset();
  assert.equal(again.current, 1);
});

test('store: survives corrupt storage', () => {
  const p = createTriadPathStore(memoryStorage({ 'fretboard-practice.triad-path.v1': '{nope' }));
  assert.equal(p.current, 1);
  const q = createTriadPathStore(memoryStorage({ 'fretboard-practice.triad-path.v1': JSON.stringify({ current: 4, levels: { 1: { done: true, shapes: ['bogus', 'major:1'] } } }) }));
  assert.equal(q.current, 1);
  assert.equal(q.shapeCovered(1, 'major', 1), true);
});
