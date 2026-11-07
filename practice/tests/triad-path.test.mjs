import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES } from '../js/notes.js';
import { WINDOW } from '../js/path.js';
import { questionVoicings } from '../js/triad-match.js';
import {
  TRIAD_LEVELS, evaluate, blankEntry, chordKey, createTriadBag, createTriadShapeBag, shapeKey, createTriadBoss, createTriadPathStore, starsFor, STAR2_MS, STAR3_MS, AVG_MS_MAX,
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

test('evaluate: last 20 shape answers, first-try share and average time per shape', () => {
  const full = { ...blankEntry(), recent: good(WINDOW) };
  assert.equal(AVG_MS_MAX, 6000);
  assert.equal(evaluate(full).unlocked, true);
  assert.equal(evaluate({ ...full, recent: good(WINDOW - 1) }).unlocked, false);
  assert.equal(evaluate({ ...full, recent: good(WINDOW, true, 6000) }).unlocked, true);
  assert.equal(evaluate({ ...full, recent: good(WINDOW, true, 6500) }).unlocked, false);
  assert.equal(evaluate({ ...full, recent: [...good(15, true), ...good(5, false)] }).unlocked, true);
  assert.equal(evaluate({ ...full, recent: [...good(14, true), ...good(6, false)] }).unlocked, false);
  assert.equal(evaluate(blankEntry()).firstTryPct, null);
});

test('bag: every chord once before repeats, newest group first', () => {
  const bag = createTriadBag(seq(0.3, 0.7, 0.1));
  const l5 = TRIAD_LEVELS[4];
  const asked = Array.from({ length: l5.pool.length }, () => bag.next(l5));
  assert.equal(new Set(asked.map(chordKey)).size, l5.pool.length);
  assert.ok(asked.slice(0, 6).every(c => c.group === '432'), 'newest group first');
  assert.equal(createTriadBag(() => 0.5).next(TRIAD_LEVELS[0]).group, '321');
});

test('boss: one question per new chord, each with every shape', () => {
  const boss = createTriadBoss(TRIAD_LEVELS[0]);
  assert.equal(boss.state, 'running');
  assert.equal(boss.items.length, 3);
  assert.deepEqual(boss.items.map(i => NOTE_NAMES[i.root]), ['C', 'F', 'G']);
  for (const it of boss.items) {
    assert.deepEqual(it.voicings, questionVoicings(it.root, it.quality, it.group));
    assert.deepEqual([...new Set(it.voicings.map(v => v.shape))].sort(), [1, 2, 3]);
    assert.equal(it.shapes, 3);
  }
  assert.equal(boss.total, 9);
});

test('boss: times each shape, counts mistakes, awards stars per shape', () => {
  const boss = createTriadBoss(TRIAD_LEVELS[0]);
  boss.wrong();
  for (let c = 0; c < 3; c++) {
    assert.equal(boss.state, 'running');
    for (let s = 0; s < 3; s++) boss.shape(4500);
    boss.chordDone();
  }
  assert.equal(boss.state, 'passed');
  assert.equal(boss.shapesDone, 9);
  assert.equal(boss.mistakes, 1);
  assert.equal(boss.stars, 2);
  const skipped = createTriadBoss(TRIAD_LEVELS[0]);
  skipped.fail('skipped');
  assert.equal(skipped.state, 'failed');
  assert.equal(skipped.stars, 0);
});

test('stars: 3 at <= 4 s per shape with no mistakes, 2 at <= 6 s and <= 2 mistakes, else 1', () => {
  assert.deepEqual([STAR3_MS, STAR2_MS], [4000, 6000]);
  assert.equal(starsFor(4000, 0), 3);
  assert.equal(starsFor(4000, 1), 2);
  assert.equal(starsFor(6000, 2), 2);
  assert.equal(starsFor(6000, 3), 1);
  assert.equal(starsFor(6100, 0), 1);
});

test('store: own key, levels unlock one by one, each shape answer is recorded', () => {
  const st = memoryStorage();
  const p = createTriadPathStore(st);
  assert.equal(p.current, 1);
  assert.equal(p.isUnlocked(2), false);
  assert.equal(p.select(2), false);
  let r;
  for (let i = 0; i < WINDOW; i++) r = p.record(1, { firstTry: true, ms: 2000 });
  assert.equal(r.bossUnlocked, true);
  assert.equal(p.progress(1).bossUnlocked, true);
  assert.ok(st.m.has('fretboard-practice.triad-path.v1'));
  assert.equal(p.record(1, { firstTry: true, ms: 1000 }).bossUnlocked, false);
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
  assert.equal(q.isDone(1), true);
});

test('regression: 20 quick first-try shapes open the L1 boss, a pass opens L2 (survives a reload)', () => {
  const st = memoryStorage();
  const s = createTriadPathStore(st);
  assert.equal(s.isUnlocked(2), false);
  for (let i = 0; i < 19; i++) assert.equal(s.record(1, { firstTry: true, ms: 2500 }).bossUnlocked, false);
  assert.equal(s.progress(1).bossUnlocked, false);
  assert.equal(s.record(1, { firstTry: true, ms: 2500 }).bossUnlocked, true);
  const again = createTriadPathStore(st);
  assert.equal(again.progress(1).bossUnlocked, true);
  assert.equal(again.isUnlocked(2), false);
  const boss = createTriadBoss(TRIAD_LEVELS[0]);
  while (boss.state === 'running') { for (let i = 0; i < boss.current.shapes; i++) boss.shape(3000); boss.chordDone(); }
  assert.equal(boss.state, 'passed');
  const r = again.completeBoss(1, boss.avgMs, boss.mistakes);
  assert.equal(r.next, 2);
  assert.equal(again.isUnlocked(2), true);
  assert.equal(again.current, 2);
  assert.equal(createTriadPathStore(st).isUnlocked(2), true);
});

test('regression: one hinted/slow shape per question (a clock that includes the prompt) misses the 75% bar; clean shapes pass', () => {
  const s = createTriadPathStore(memoryStorage());
  for (let i = 0; i < 20; i++) s.record(1, { firstTry: i % 3 !== 0, ms: 3000 });
  const p = s.progress(1);
  assert.equal(p.met.firstTry, false);
  assert.equal(p.bossUnlocked, false);
  assert.equal(p.met.count, true);
});

const total = (level, group) => level.pool.filter(c => !group || c.group === group)
  .reduce((n, c) => n + questionVoicings(c.root, c.quality, c.group).length, 0);

test('shape bag: every (chord, placed shape) once before repeats, newest group first', () => {
  const bag = createTriadShapeBag(seq(0.3, 0.7, 0.1));
  const l5 = TRIAD_LEVELS[4], n = total(l5);
  const asked = Array.from({ length: n }, () => bag.next(l5));
  assert.equal(new Set(asked.map(shapeKey)).size, n);
  assert.ok(asked.slice(0, total(l5, '432')).every(q => q.group === '432'), 'newest group first');
  assert.ok(asked.every(q => Number.isInteger(q.shapeIndex) && q.shapeIndex >= 0));
  assert.equal(createTriadShapeBag(() => 0.5).next(TRIAD_LEVELS[0]).group, '321');
});
test('shape bag: a chord with four placed shapes (E minor 3·2·1) is dealt four times, indexes 0-3', () => {
  const bag = createTriadShapeBag(seq(0.4, 0.8, 0.2));
  const l2 = TRIAD_LEVELS[1];
  const em = Array.from({ length: total(l2) }, () => bag.next(l2)).filter(q => q.root === pc('E') && q.quality === 'minor');
  assert.deepEqual(em.map(q => q.shapeIndex).sort(), [0, 1, 2, 3]);
});
test('shape bag: a refill never repeats the same (chord, shape) back to back; a level change restarts the bag', () => {
  const bag = createTriadShapeBag(() => 0.5);
  const l1 = TRIAD_LEVELS[0], n = total(l1);
  const keys = Array.from({ length: n * 3 }, () => shapeKey(bag.next(l1)));
  keys.slice(1).forEach((k, i) => assert.notEqual(k, keys[i]));
  const l2 = TRIAD_LEVELS[1];
  const next = Array.from({ length: total(l2) }, () => bag.next(l2));
  assert.equal(new Set(next.map(shapeKey)).size, total(l2));
});
test('shape bag: an empty pool returns null', () => {
  assert.equal(createTriadShapeBag().next({ id: 99, group: '321', pool: [] }), null);
});
