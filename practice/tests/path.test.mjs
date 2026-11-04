import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES, STRINGS, noteAt, pickTarget, pitchClass } from '../js/notes.js';
import {
  LEVELS, WINDOW, createSpotBag, evaluate, requiredSpots, fretsFor, blankEntry, createBoss, starsFor, positionWeigher, createPath,
} from '../js/path.js';
import { createSession } from '../js/session.js';
import { migrate } from '../js/settings.js';

const FULL = { from: 0, to: 11 };
const L1 = LEVELS[0];   // E A

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

test('levels: each level keeps the earlier notes and adds one', () => {
  const names = LEVELS.map(l => l.notes.map(n => NOTE_NAMES[n]).join(' '));
  assert.deepEqual(names, ['E A', 'E A D', 'E A D G', 'E A D G B', 'E A D G B C', 'E A D G B C F', 'E A D G B C F F♯',
    'E A D G B C F F♯ C♯', 'E A D G B C F F♯ C♯ G♯', 'E A D G B C F F♯ C♯ G♯ D♯', 'E A D G B C F F♯ C♯ G♯ D♯ A♯']);
  assert.deepEqual(LEVELS.map(l => l.short), ['E A', '+D', '+G', '+B', '+C', '+F', '+F♯', '+C♯', '+G♯', '+D♯', '+A♯']);
  assert.deepEqual(LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
});

test('requiredSpots: every level note on every string inside the fret range', () => {
  assert.equal(requiredSpots(L1, FULL).length, 12);                    // 2 notes x 6 strings
  assert.equal(requiredSpots(LEVELS.at(-1), FULL).length, 72);            // 12 notes x 6 strings
  assert.deepEqual(requiredSpots(L1, { from: 0, to: 0 }).sort(), ['4:0', '4:5', '9:4']); // open strings only: E on strings 1 and 6, A on string 5 (index 4)
  assert.deepEqual(fretsFor(4, 5, { from: 0, to: 21 }), [0, 12]);     // E on the low E string, both octaves
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

test('unlock rule: every level note must be covered on every string', () => {
  const e = entryWith();
  e.covered = e.covered.filter(k => k !== '9:0');   // A on string 1 never answered
  const r = evaluate(e, L1, FULL);
  assert.equal(r.unlocked, false);
  assert.deepEqual(r.missing, ['9:0']);
  assert.equal(r.spots, 11);
  assert.equal(evaluate(entryWith({ covered: false }), L1, FULL).unlocked, false);
});

test('unlock rule: a narrow fret range only asks for the spots that exist in it', () => {
  const range = { from: 0, to: 4 };
  assert.equal(evaluate(entryWith({ range, covered: true }), L1, range).unlocked, true);
  const nothing = { from: 1, to: 1 };   // no E or A anywhere on fret 1
  assert.equal(evaluate(entryWith({ range: nothing, covered: true }), L1, nothing).unlocked, false);
});

test('boss: one question per note and string, string 6 to 1, in level order', () => {
  const boss = createBoss(L1, FULL, () => 0);
  assert.equal(boss.items.length, 12);
  assert.deepEqual(boss.items.map(i => i.string), [5, 4, 3, 2, 1, 0, 5, 4, 3, 2, 1, 0]);
  assert.deepEqual(boss.items.map(i => NOTE_NAMES[i.pc]), ['E', 'E', 'E', 'E', 'E', 'E', 'A', 'A', 'A', 'A', 'A', 'A']);
  for (const it of boss.items) assert.equal(noteAt(it.string, it.fret).name, NOTE_NAMES[it.pc]);
  assert.deepEqual(boss.current, boss.items[0]);
});

test('boss: frets stay inside the range and strings without the note are left out', () => {
  const boss = createBoss(L1, { from: 0, to: 4 }, Math.random);
  for (const it of boss.items) assert.ok(it.fret >= 0 && it.fret <= 4);
  assert.equal(boss.items.length, requiredSpots(L1, { from: 0, to: 4 }).length);
  assert.equal(createBoss(L1, { from: 1, to: 1 }).state, 'failed');
});

test('boss: answering every question passes it', () => {
  const boss = createBoss(L1, FULL);
  for (let i = 0; i < 11; i++) assert.equal(boss.correct(1500), 'running');
  assert.equal(boss.correct(1500), 'passed');
  assert.equal(boss.current, null);
  assert.equal(boss.avgMs, 1500);
});

test('boss: a wrong note or a skip fails it for good', () => {
  const a = createBoss(L1, FULL);
  a.correct(1000);
  assert.equal(a.fail('wrong'), 'failed');
  assert.equal(a.reason, 'wrong');
  assert.equal(a.current, null);
  assert.equal(a.correct(1000), 'failed');   // later answers cannot revive it
  const b = createBoss(L1, FULL);
  b.fail('skipped');
  assert.equal(b.state, 'failed');
  assert.equal(b.stars, 0);
});

test('boss stars: pass is 1, 3 s average is 2, 2 s average is 3', () => {
  assert.equal(starsFor(5000), 1);
  assert.equal(starsFor(3001), 1);
  assert.equal(starsFor(3000), 2);
  assert.equal(starsFor(2001), 2);
  assert.equal(starsFor(2000), 3);
  const boss = createBoss(L1, FULL);
  boss.items.forEach(() => boss.correct(2400));
  assert.equal(boss.state, 'passed');
  assert.equal(boss.stars, 2);
});

test('store: the boss round opens on the 20th good answer and stays open', () => {
  const path = createPath(memoryStorage());
  const spots = requiredSpots(L1, FULL).map(k => k.split(':').map(Number));
  let opened = 0;
  for (let i = 0; i < 20; i++) {
    const [pc, string] = spots[i % spots.length];
    if (path.record(1, { pc, string, firstTry: true, ms: 2000 }, FULL).bossUnlocked) opened = i + 1;
  }
  assert.equal(opened, 20);
  assert.equal(path.progress(1, FULL).bossUnlocked, true);
  for (let i = 0; i < 20; i++) path.record(1, { pc: 4, string: 5, firstTry: false, ms: 9000 }, FULL);
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
  assert.equal(createPath(memoryStorage({ 'fretboard-practice.path.v2': '{nope' })).current, 1);
  const odd = createPath(memoryStorage({ 'fretboard-practice.path.v2': JSON.stringify({ current: 7, levels: { 1: { recent: 'x', done: false } } }) }));
  assert.equal(odd.current, 1);   // level 7 is locked, so back to 1
  assert.equal(odd.progress(1, FULL).answered, 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const p = createPath(broken);
  assert.doesNotThrow(() => p.record(1, { pc: 4, string: 5, firstTry: true, ms: 1000 }, FULL));
});

test('store: level 1 progress carries over from the old nine-level path, the rest starts fresh', () => {
  const old = { current: 4, levels: { 1: { recent: [{ ft: true, ms: 900 }], covered: ['4:0'], done: true, stars: 2 }, 2: { done: true } } };
  const p = createPath(memoryStorage({ 'fretboard-practice.path.v1': JSON.stringify(old) }));
  assert.deepEqual([p.current, p.isDone(1), p.stars(1), p.isDone(2), p.isUnlocked(2), p.isUnlocked(3)], [1, true, 2, false, true, false]);
  assert.equal(p.progress(1, FULL).answered, 1);
});

test('weighting: picks stay on the level notes, and favour weak spots', () => {
  const level = LEVELS[2];   // E A D G
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

test('spot bag: every spot once per round, missing spots first, no spot hides', () => {
  const range = { from: 0, to: 11 };
  const all = requiredSpots(L1, range);
  const bag = createSpotBag(Math.random);
  const key = (t) => `${pitchClass(STRINGS[t.string].midi + t.fret)}:${t.string}`;
  for (let round = 0; round < 20; round++) {
    const seen = Array.from({ length: all.length }, () => key(bag.next(L1, range)));
    assert.deepEqual([...seen].sort(), [...all].sort(), 'a full round asks each spot exactly once');
  }
  // a fresh bag with one spot still missing asks it first
  const missing = [all[7]];
  const fresh = createSpotBag(Math.random);
  assert.equal(key(fresh.next(L1, range, missing)), all[7]);
  // never the same spot twice in a row across rounds
  let prev = null;
  for (let i = 0; i < 500; i++) { const k = key(bag.next(L1, range)); assert.notEqual(k, prev); prev = k; }
});
