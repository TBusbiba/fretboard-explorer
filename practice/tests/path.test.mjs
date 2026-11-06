import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES, STRINGS, noteAt, pickTarget, pitchClass } from '../js/notes.js';
import {
  LEVELS, WINDOW, createSpotBag, evaluate, requiredSpots, fretsFor, blankEntry, createBoss, bossNotes, noteSpots, starsFor, positionWeigher, createPath,
  levelRange, spotKey,
} from '../js/path.js';
import { createSession } from '../js/session.js';
import { migrate } from '../js/settings.js';

const FULL = { from: 0, to: 11 };
const L1 = LEVELS[0];   // E A
const L5 = LEVELS[4];   // E A D B G C
const keyOf = (t) => `${pitchClass(STRINGS[t.string].midi + t.fret)}:${t.string}`;

function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

/** An entry with `n` recent answers (the first `ft` first-try, each `ms`) and every spot of the level covered. */
function entryWith({ n = WINDOW, ft = n, ms = 2000, covered = true, level = L1, range = FULL } = {}) {
  const e = blankEntry();
  e.recent = Array.from({ length: n }, (_, i) => ({ ft: i < ft, ms }));
  if (covered) e.covered = requiredSpots(level, range);
  return e;
}

test('levels: eleven cumulative note levels, each adding one note after E A', () => {
  assert.deepEqual(LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  assert.deepEqual(LEVELS.map(l => l.short), ['E A', '+D', '+B', '+G', '+C', '+F', '+F♯', '+C♯', '+G♯', '+D♯', '+A♯']);
  assert.deepEqual(LEVELS.map(l => l.title), ['E and A', 'Add D', 'BEAD', 'Gift of the gab', 'Add C', 'All naturals', 'Add F♯', 'Add C♯', 'Add G♯', 'Add D♯', 'Everything']);
  const names = (ids) => ids.map(n => NOTE_NAMES[n]).join(' ');
  assert.equal(names(L1.notes), 'E A');
  assert.equal(names(LEVELS[1].notes), 'E A D');
  assert.equal(names(LEVELS[2].notes), 'E A D B');
  assert.equal(names(LEVELS[5].notes.slice().sort((a, b) => a - b)), 'C D E F G A B'.split(' ').map(n => NOTE_NAMES.indexOf(n)).sort((a, b) => a - b).map(n => NOTE_NAMES[n]).join(' '));
  assert.equal(LEVELS[10].notes.length, 12);
  assert.deepEqual(LEVELS.map(l => names(l.added)), ['E A', 'D', 'B', 'G', 'C', 'F', 'F♯', 'C♯', 'G♯', 'D♯', 'A♯']);
  LEVELS.forEach((l, i) => { if (i) assert.deepEqual(l.notes, [...LEVELS[i - 1].notes, ...l.added]); });   // cumulative
});

test('levelRange: the fret setting, kept inside 0-12', () => {
  assert.deepEqual(levelRange(L5, { from: 2, to: 21 }), { from: 2, to: 12 });
  assert.deepEqual(levelRange(L1, { from: 0, to: 4 }), { from: 0, to: 4 });
});

test('requiredSpots: note-on-string keys in the fret range', () => {
  assert.equal(requiredSpots(L1, FULL).length, 12);                                         // 2 notes x 6 strings
  assert.equal(requiredSpots(L5, FULL).length, 36);                                         // 6 notes x 6 strings
  assert.equal(requiredSpots(LEVELS.at(-1), FULL).length, 72);                              // 12 notes x 6 strings
  assert.equal(requiredSpots(LEVELS.at(-1), { from: 0, to: 21 }).length, 72);               // capped at fret 12
  assert.deepEqual(requiredSpots(L1, { from: 0, to: 0 }), ['4:0', '4:5', '9:4']);           // open strings: E twice, A
  assert.deepEqual(fretsFor(4, 5, { from: 0, to: 21 }), [0, 12]);
  assert.equal(spotKey(L1, 5, 12), '4:5');
  assert.equal(spotKey(L1, 5, 0), '4:5');
});

test('coverage: answering every question with the open-string fret still completes the level', () => {
  for (const level of LEVELS) {
    const bag = createSpotBag(Math.random);
    const path = createPath(memoryStorage());
    const all = requiredSpots(level, FULL);
    for (let i = 0; i < all.length * 3 && path.progress(level.id, FULL).missing.length; i++) {
      const asked = bag.next(level, FULL, path.progress(level.id, FULL).missing);
      const played = fretsFor(pitchClass(STRINGS[asked.string].midi + asked.fret), asked.string, FULL)[0];   // the lowest fret
      path.record(level.id, { string: asked.string, fret: played, firstTry: true, ms: 1000 }, FULL);
    }
    const pr = path.progress(level.id, FULL);
    assert.deepEqual([pr.missing, pr.met.spots], [[], true], `level ${level.id}`);
  }
  const e = blankEntry();
  e.covered = ['4:5'];   // low E answered at fret 12 ...
  const path = createPath(memoryStorage());
  path.record(1, { string: 5, fret: 12, firstTry: true, ms: 1000 }, FULL);
  assert.ok(!path.progress(1, FULL).missing.includes('4:5'));   // ... covers the same key as open
});

test('unlock rule: needs a full window of 20 answers', () => {
  assert.equal(evaluate(entryWith({ n: 20 }), L1, FULL).unlocked, true);
  const short = evaluate(entryWith({ n: 19 }), L1, FULL);
  assert.equal(short.unlocked, false);
  assert.equal(short.met.count, false);
  assert.equal(short.met.firstTry, true);
  assert.equal(evaluate(entryWith({ n: 0 }), L1, FULL).unlocked, false);
});

test('unlock rule: 75% first try passes, anything below fails', () => {
  assert.equal(evaluate(entryWith({ ft: 15 }), L1, FULL).unlocked, true);   // 75%
  const below = evaluate(entryWith({ ft: 14 }), L1, FULL);                 // 70%
  assert.equal(below.unlocked, false);
  assert.equal(below.firstTryPct, 70);
  assert.equal(below.met.firstTry, false);
});

test('unlock rule: only the last 20 answers count', () => {
  const e = entryWith({ n: 20, ft: 18 });
  e.recent.unshift(...Array.from({ length: 30 }, () => ({ ft: false, ms: 9000 })));  // old, bad answers fall out
  assert.equal(evaluate(e, L1, FULL).unlocked, true);
  e.recent.push(...Array.from({ length: 4 }, () => ({ ft: false, ms: 2000 })));      // four fresh misses push out four good ones: 14/20
  assert.equal(evaluate(e, L1, FULL).unlocked, false);
});

test('unlock rule: average time of 6 s passes, slower fails', () => {
  assert.equal(evaluate(entryWith({ ms: 6000 }), L1, FULL).unlocked, true);
  const slow = evaluate(entryWith({ ms: 6001 }), L1, FULL);
  assert.equal(slow.unlocked, false);
  assert.equal(slow.met.time, false);
});

test('unlock rule: every level spot must be covered', () => {
  const e = entryWith();
  e.covered = e.covered.filter(k => k !== '4:0');   // high E never answered with an E
  const r = evaluate(e, L1, FULL);
  assert.equal(r.unlocked, false);
  assert.deepEqual(r.missing, ['4:0']);
  assert.equal(r.spots, 11);
  assert.equal(evaluate(entryWith({ covered: false }), L1, FULL).unlocked, false);
});

test('unlock rule: a narrow fret range only asks for the spots that exist in it', () => {
  const range = { from: 0, to: 4 };
  assert.equal(evaluate(entryWith({ range, covered: true, level: L5 }), L5, range).unlocked, true);
  const nothing = { from: 0, to: 0 };   // no sharp on any open string
  assert.equal(evaluate(entryWith({ range: nothing, covered: true, level: LEVELS[6] }), LEVELS[6], nothing).unlocked, true);   // earlier notes still count
});

const names = (items) => [...new Set(items.map(i => NOTE_NAMES[i.pc]))];

test('boss: the group is only the notes the level adds', () => {
  assert.deepEqual(names(createBoss(L1).items), ['E', 'A']);
  assert.deepEqual(names(createBoss(LEVELS[1]).items), ['D']);
  assert.deepEqual(names(createBoss(LEVELS[5]).items), ['F']);
  assert.deepEqual(names(createBoss(LEVELS[10]).items), ['A♯']);
  assert.equal(createBoss(L1).runs.length, 2);
  assert.equal(bossNotes(LEVELS[3]).length, 1);
});

test('boss: every spot of the note in frets 0-12, left to right, thicker string first at one fret', () => {
  const A = NOTE_NAMES.indexOf('A');
  const spots = noteSpots(A);
  assert.deepEqual(spots.map(s => `${s.string}@${s.fret}`), ['4@0', '2@2', '0@5', '5@5', '3@7', '1@10', '4@12']);
  for (const s of spots) { assert.ok(s.fret >= 0 && s.fret <= 12); assert.equal(noteAt(s.string, s.fret).name, 'A'); }
  const E = noteSpots(NOTE_NAMES.indexOf('E')).map(s => `${s.string}@${s.fret}`);
  assert.deepEqual(E, ['5@0', '0@0', '3@2', '1@5', '4@7', '2@9', '0@12', '5@12']);
});

test('boss: uses the level fret range (0-11 by default), nearer string first at a tie', () => {
  const R = { from: 0, to: 11 };
  const seq = (pc, range) => noteSpots(pc, range).map(s => `${s.string}@${s.fret}`);
  assert.deepEqual(seq(NOTE_NAMES.indexOf('A'), R), ['4@0', '2@2', '0@5', '5@5', '3@7', '1@10']);
  assert.deepEqual(seq(NOTE_NAMES.indexOf('E'), R), ['5@0', '0@0', '3@2', '1@5', '4@7', '2@9']);
  assert.deepEqual(seq(NOTE_NAMES.indexOf('E'), { from: 0, to: 12 }).slice(-3), ['2@9', '0@12', '5@12']);
  const boss = createBoss(L1, R);
  assert.ok(boss.items.every(i => i.fret <= 11));
  assert.equal(boss.items.length, 12);
});

test('boss: items carry the run, the position in it and the run size', () => {
  const boss = createBoss(L1);
  const first = boss.items[0];
  assert.deepEqual([first.run, first.n, first.of], [0, 1, boss.runs[0].spots.length]);
  assert.equal(boss.items.length, boss.runs.reduce((t, r) => t + r.spots.length, 0));
  assert.deepEqual(boss.current, boss.items[0]);
  assert.equal(boss.runStart, true);
});

test('boss: plays every spot of E and A from fret 0 to 12', () => {
  assert.equal(createBoss(L1).items.length, noteSpots(NOTE_NAMES.indexOf('E')).length + noteSpots(NOTE_NAMES.indexOf('A')).length);
});

test('boss: answering every spot passes it; found spots and runStart follow along', () => {
  const boss = createBoss(L1);
  const total = boss.items.length;
  const firstRun = boss.runs[0].spots.length;
  boss.correct(1500);
  assert.equal(boss.found.length, 1);
  assert.equal(boss.runStart, firstRun === 1);
  for (let i = 1; i < firstRun; i++) boss.correct(1500);
  assert.equal(boss.runStart, true);
  assert.equal(boss.found.length, 0);
  for (let i = firstRun; i < total - 1; i++) assert.equal(boss.correct(1500), 'running');
  assert.equal(boss.correct(1500), 'passed');
  assert.equal(boss.current, null);
  assert.equal(boss.avgMs, 1500);
  assert.equal(boss.totalMs, 1500 * total);
});

test('boss: wrong notes are counted and do not end it; a skip fails it for good', () => {
  const a = createBoss(L1);
  a.correct(1000);
  assert.equal(a.wrong(), 1);
  assert.equal(a.wrong(), 2);
  assert.equal(a.state, 'running');
  assert.equal(a.fail('skipped'), 'failed');
  assert.equal(a.reason, 'skipped');
  assert.equal(a.current, null);
  assert.equal(a.wrong(), 2);
  assert.equal(a.correct(1000), 'failed');   // later answers cannot revive it
  assert.equal(a.stars, 0);
});

test('boss stars: 3 = avg <= 2 s and no mistakes, 2 = avg <= 3 s and <= 2 mistakes, else 1', () => {
  assert.equal(starsFor(5000), 1);
  assert.equal(starsFor(3001), 1);
  assert.equal(starsFor(3000), 2);
  assert.equal(starsFor(2001), 2);
  assert.equal(starsFor(2000), 3);
  assert.equal(starsFor(2000, 1), 2);
  assert.equal(starsFor(2000, 2), 2);
  assert.equal(starsFor(2000, 3), 1);
  assert.equal(starsFor(3000, 3), 1);
  assert.equal(starsFor(3001, 0), 1);
  const boss = createBoss(L1);
  boss.items.forEach(() => boss.correct(1800));
  assert.equal(boss.stars, 3);
  const b2 = createBoss(L1);
  b2.wrong();
  b2.items.forEach(() => b2.correct(1800));
  assert.equal(b2.stars, 2);
  const b3 = createBoss(L1);
  b3.items.forEach(() => b3.correct(2400));
  assert.equal(b3.stars, 2);
});

test('store: the boss round opens on the 20th good answer and stays open', () => {
  const path = createPath(memoryStorage());
  const spots = requiredSpots(L1, FULL).map(k => { const [pc, string] = k.split(':').map(Number); return { string, fret: fretsFor(pc, string, FULL)[0] }; });
  let opened = 0, openings = 0;
  for (let i = 0; i < 25; i++) {
    const { string, fret } = spots[i % spots.length];
    if (path.record(1, { string, fret, firstTry: true, ms: 2000 }, FULL).bossUnlocked) { opened = i + 1; openings++; }
  }
  assert.equal(opened, 20);
  assert.equal(openings, 1);
  assert.equal(path.progress(1, FULL).bossUnlocked, true);
  for (let i = 0; i < 20; i++) path.record(1, { string: 5, fret: 0, firstTry: false, ms: 9000 }, FULL);
  assert.equal(path.progress(1, FULL).unlocked, false);   // the window is now bad ...
  assert.equal(path.progress(1, FULL).bossUnlocked, true); // ... but the boss stays unlocked
});

test('store: a passed boss completes the level, opens the next and keeps the best stars', () => {
  const storage = memoryStorage();
  const path = createPath(storage);
  assert.equal(path.isUnlocked(1), true);
  assert.equal(path.isUnlocked(2), false);
  assert.equal(path.select(2), false);
  assert.equal(path.current, 1);
  let r = path.completeBoss(1, 2500);
  assert.deepEqual([r.stars, r.first, r.next], [2, true, 2]);
  assert.equal(path.isDone(1), true);
  assert.equal(path.isUnlocked(2), true);
  assert.equal(path.current, 2);
  r = path.completeBoss(1, 3800);   // a worse retry
  assert.equal(r.stars, 1);
  assert.equal(r.bestStars, 2);
  assert.equal(path.stars(1), 2);
  assert.equal(path.current, 2);    // replaying an earlier level does not move you back
  r = path.completeBoss(1, 1800);
  assert.equal(path.stars(1), 3);
  assert.equal(path.select(1), true);
  const again = createPath(storage);   // persisted
  assert.deepEqual([again.current, again.stars(1), again.isUnlocked(2)], [1, 3, true]);
});

test('store: the last level has no next, reset clears everything', () => {
  const path = createPath(memoryStorage());
  for (let i = 1; i <= 11; i++) path.completeBoss(i, 1900);
  assert.equal(path.completeBoss(11, 1900).next, null);
  path.reset();
  assert.deepEqual([path.current, path.isDone(1), path.isUnlocked(2)], [1, false, false]);
});

test('store: corrupt or odd saved data falls back safely', () => {
  assert.equal(createPath(memoryStorage({ 'fretboard-practice.path.v4': '{nope' })).current, 1);
  const odd = createPath(memoryStorage({ 'fretboard-practice.path.v4': JSON.stringify({ current: 5, levels: { 1: { recent: 'x', done: false } } }) }));
  assert.equal(odd.current, 1);   // level 5 is locked, so back to 1
  assert.equal(odd.progress(1, FULL).answered, 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const p = createPath(broken);
  assert.doesNotThrow(() => p.record(1, { string: 5, fret: 0, firstTry: true, ms: 1000 }, FULL));
});

test('store: the old v1-v3 progress is not carried over: the path starts fresh on the new levels', () => {
  const old = { current: 4, levels: { 1: { recent: [{ ft: true, ms: 900 }], covered: ['4:0'], done: true, stars: 2, bestStreak: 9 }, 2: { done: true } } };
  const p = createPath(memoryStorage({ 'fretboard-practice.path.v1': JSON.stringify(old), 'fretboard-practice.path.v2': JSON.stringify(old), 'fretboard-practice.path.v3': JSON.stringify(old) }));
  assert.deepEqual([p.current, p.isDone(1), p.isUnlocked(2)], [1, false, false]);
  assert.deepEqual(p.bests(1), { streak: 0, score: 0 });
});

test('store: the tip card is remembered per level', () => {
  const storage = memoryStorage();
  const path = createPath(storage);
  assert.equal(path.tipSeen(2), false);
  path.markTip(2);
  assert.equal(createPath(storage).tipSeen(2), true);
  assert.equal(createPath(storage).tipSeen(3), false);
});

test('weighting: picks stay on the level notes, and favour weak spots', () => {
  const level = LEVELS[5];   // all naturals
  const wanted = new Set(level.notes);
  const weak = { string: 5, fret: 0 };   // low E, open
  const positions = [{ ...weak, mastery: 0 }, { string: 5, fret: 5, mastery: 1 }];
  const weigh = positionWeigher(positions);
  assert.equal(weigh(5, 0), 4);   // never right, slow
  assert.equal(weigh(5, 5), 1);   // solid
  assert.equal(weigh(0, 3), 2);   // never practised
  const opts = { strings: [0, 1, 2, 3, 4, 5], fretFrom: 0, fretTo: 11, naturalsOnly: false, notes: level.notes, weigh };
  let weakHits = 0, solidHits = 0;
  for (let i = 0; i < 4000; i++) {
    const t = pickTarget(opts, null, Math.random);
    assert.ok(wanted.has(pitchClass(STRINGS[t.string].midi + t.fret)), `${t.string}:${t.fret}`);
    if (t.string === 5 && t.fret === 0) weakHits++;
    if (t.string === 5 && t.fret === 5) solidHits++;
  }
  assert.ok(weakHits > solidHits * 2.5, `weak ${weakHits} vs solid ${solidHits}`);
});

test('weighting: an rng at the extremes still lands on a candidate, and zero weights fall back', () => {
  const opts = { strings: [4], fretFrom: 0, fretTo: 3, naturalsOnly: true, weigh: () => 1 };
  assert.deepEqual(pickTarget(opts, null, () => 0), { string: 4, fret: 0 });
  assert.deepEqual(pickTarget(opts, null, () => 0.999999), { string: 4, fret: 3 });
  assert.ok(pickTarget({ ...opts, weigh: () => 0 }, null, () => 0.5));
});

test('settings migration: noteMode is path or custom, anything else is dropped', () => {
  assert.equal(migrate({ noteMode: 'custom' }).noteMode, 'custom');
  assert.equal(migrate({ noteMode: 'path' }).noteMode, 'path');
  assert.equal('noteMode' in migrate({ noteMode: 'bogus' }), false);
  assert.equal('noteMode' in migrate({}), false);
});

test('session: pickNote hands the host the choice of the next note target', () => {
  const events = [];
  const forced = [{ string: 5, fret: 0 }, { string: 4, fret: 0 }];
  let i = 0, t = 0;
  const s = createSession({
    getSettings: () => ({ strings: [0], fretFrom: 0, fretTo: 11, naturalsOnly: true, hintDelayMs: 3000, pauseMs: 100 }),
    now: () => t, rng: () => 0, onEvent: (type, p) => events.push({ type, ...p }),
    pickNote: () => forced[i++],
  });
  s.start();
  assert.equal(s.target.string, 5);
  s.noteDetected(40);          // low E open
  t += 200; s.tick();
  assert.equal(s.target.string, 4);
  assert.equal(s.note.midi, 45);
});

test('spot bag: every spot once per round, missing spots first, no spot repeats back to back', () => {
  const range = { from: 0, to: 11 };
  const all = requiredSpots(L1, range);
  const bag = createSpotBag(Math.random);
  const key = keyOf;
  for (let round = 0; round < 20; round++) {
    const seen = Array.from({ length: all.length }, () => key(bag.next(L1, range)));
    assert.deepEqual([...seen].sort(), [...all].sort(), 'a full round asks each spot exactly once');
  }
  const missing = [all[7]];
  const fresh = createSpotBag(Math.random);
  assert.equal(key(fresh.next(L1, range, missing)), all[7]);
  let prev = null;
  for (let i = 0; i < 500; i++) { const k = key(bag.next(L1, range)); assert.notEqual(k, prev); prev = k; }
});

test('spot bag: levels ask each note on every string, inside the fret range', () => {
  const range = { from: 0, to: 11 };
  const all = requiredSpots(L5, range);
  const bag = createSpotBag(Math.random);
  for (let round = 0; round < 10; round++) {
    const seen = Array.from({ length: all.length }, () => { const t = bag.next(L5, range); assert.ok(t.fret >= 0 && t.fret <= 11); return keyOf(t); });
    assert.deepEqual([...seen].sort(), [...all].sort());
  }
});

test('bossFretLabel names the fret only when the string repeats the note in 0-12', async () => {
  const { bossFretLabel } = await import('../js/path.js');
  assert.equal(bossFretLabel(5, 0), 'open');
  assert.equal(bossFretLabel(5, 12), 'fret 12');
  assert.equal(bossFretLabel(5, 5), '');
  assert.equal(bossFretLabel(5, 0, { from: 0, to: 11 }), '');
});

test('stringPrompt: numbers by default, names from level 6, only the string inside a chain', async () => {
  const { stringPrompt, NAMES_FROM_LEVEL } = await import('../js/path.js');
  assert.equal(NAMES_FROM_LEVEL, 6);
  assert.deepEqual(stringPrompt(3, 'C'), { label: 'String 4', spoken: 'String 4, C' });
  assert.deepEqual(stringPrompt(3, 'C', { short: true }), { label: 'String 4', spoken: 'String 4!' });
  assert.deepEqual(stringPrompt(4, 'C', { names: true }), { label: 'A string', spoken: 'A string, C!' });
  assert.equal(stringPrompt(5, 'F sharp', { names: true }).spoken, 'Low E string, F sharp!'.replace('Low', 'low'));
  assert.equal(stringPrompt(0, 'B', { names: true }).spoken, 'high E string, B!');
  assert.equal(stringPrompt(4, 'C', { names: true, short: true }).spoken, 'A string!');
});
