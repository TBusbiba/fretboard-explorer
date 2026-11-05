import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NOTE_NAMES, STRINGS, noteAt, pickTarget, pitchClass } from '../js/notes.js';
import {
  LEVELS, WINDOW, createSpotBag, evaluate, requiredSpots, fretsFor, blankEntry, createBoss, starsFor, positionWeigher, createPath,
  levelRange, levelSpots, spotKey, reviewPool, createReviewMixer, REVIEW_P,
} from '../js/path.js';
import { createSession } from '../js/session.js';
import { migrate } from '../js/settings.js';

const FULL = { from: 0, to: 11 };
const L1 = LEVELS[0];   // Open strings: every string at fret 0 and 12
const L5 = LEVELS[4];   // Neighbours: E F B C on every string
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

test('levels: eight landmark levels, the first four defined by spots', () => {
  assert.deepEqual(LEVELS.map(l => l.id), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(LEVELS.map(l => l.short), ['Open', 'BEAD', 'G A B', 'C D E', 'E F B C', 'Naturals', 'Sharps', 'All']);
  assert.deepEqual(LEVELS.map(l => l.title), ['Open strings', 'BEAD', 'Gift of the gab', 'A-string dots', 'Neighbours', 'All naturals', 'Sharps', 'Everything']);
  const names = (l) => l.notes.map(n => NOTE_NAMES[n]).join(' ');
  assert.equal(LEVELS[0].spots.length, 12);                                   // 6 strings x fret 0 and 12
  assert.deepEqual(LEVELS[1].spots.map(s => noteAt(s.string, s.fret).name), ['B', 'E', 'A', 'D']);   // BEAD
  assert.ok(LEVELS[1].spots.every(s => s.fret === 7 && [5, 4, 3, 2].includes(s.string)));
  assert.deepEqual(LEVELS[2].spots.map(s => `${s.string}:${s.fret}:${noteAt(s.string, s.fret).name}`),
    ['5:3:G', '5:5:A', '5:7:B', '0:3:G', '0:5:A', '0:7:B']);
  assert.deepEqual(LEVELS[3].spots.map(s => `${s.string}:${s.fret}:${noteAt(s.string, s.fret).name}`), ['4:3:C', '4:5:D', '4:7:E']);
  assert.equal(names(LEVELS[3]), 'C D E');
  assert.equal(names(L5), 'E F B C');
  assert.equal(names(LEVELS[5]), 'C D E F G A B');
  assert.equal(names(LEVELS[6]), 'C♯ D♯ F♯ G♯ A♯');
  assert.equal(LEVELS[7].notes.length, 12);
  assert.ok(LEVELS.slice(0, 4).every(l => l.spots.every(s => s.fret >= 0 && s.fret <= 12)));
});

test('levelRange: spot levels ignore the fret setting, note levels follow it inside 0-12', () => {
  assert.deepEqual(levelRange(L1, { from: 0, to: 4 }), { from: 0, to: 12 });
  assert.deepEqual(levelRange(L5, { from: 2, to: 21 }), { from: 2, to: 12 });
  assert.deepEqual(levelRange(L5, { from: 0, to: 4 }), { from: 0, to: 4 });
});

test('requiredSpots: spot levels are their own spots, note levels are note-on-string in range', () => {
  assert.equal(requiredSpots(L1, FULL).length, 12);
  assert.deepEqual(requiredSpots(L1, { from: 0, to: 2 }), requiredSpots(L1, FULL));          // narrow range changes nothing
  assert.equal(new Set(requiredSpots(L1, FULL)).size, 12);                                  // fret 0 and 12 are separate spots
  assert.equal(requiredSpots(L5, FULL).length, 24);                                         // 4 notes x 6 strings
  assert.equal(requiredSpots(LEVELS.at(-1), FULL).length, 72);                              // 12 notes x 6 strings
  assert.equal(requiredSpots(LEVELS.at(-1), { from: 0, to: 21 }).length, 72);               // capped at fret 12
  assert.deepEqual(requiredSpots(L5, { from: 0, to: 0 }), ['4:0', '4:5', '11:1']);          // open strings: E twice, B
  assert.deepEqual(fretsFor(4, 5, { from: 0, to: 21 }), [0, 12]);
  assert.equal(spotKey(L1, 5, 12), '5@12');
  assert.equal(spotKey(L5, 5, 12), '4:5');
  assert.deepEqual(levelSpots(LEVELS[3], FULL), [{ string: 4, fret: 3 }, { string: 4, fret: 5 }, { string: 4, fret: 7 }]);
  assert.ok(levelSpots(L5, FULL).every(s => L5.notes.includes(pitchClass(STRINGS[s.string].midi + s.fret))));
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
  e.covered = e.covered.filter(k => k !== '0@12');   // high E at fret 12 never answered
  const r = evaluate(e, L1, FULL);
  assert.equal(r.unlocked, false);
  assert.deepEqual(r.missing, ['0@12']);
  assert.equal(r.spots, 11);
  assert.equal(evaluate(entryWith({ covered: false }), L1, FULL).unlocked, false);
});

test('unlock rule: a narrow fret range only asks for the spots that exist in it (note levels)', () => {
  const range = { from: 0, to: 4 };
  assert.equal(evaluate(entryWith({ range, covered: true, level: L5 }), L5, range).unlocked, true);
  const nothing = { from: 0, to: 0 };   // no sharp on any open string
  assert.equal(evaluate(entryWith({ range: nothing, covered: true, level: LEVELS[6] }), LEVELS[6], nothing).unlocked, false);
});

test('unlock rule: spot levels keep all their spots whatever the fret range', () => {
  const range = { from: 0, to: 4 };
  const r = evaluate(entryWith({ range, covered: false }), LEVELS[1], range);   // BEAD is fret 7
  assert.equal(r.spotsTotal, 4);
  assert.equal(evaluate(entryWith({ range, covered: true, level: LEVELS[1] }), LEVELS[1], range).unlocked, true);
});

test('boss: a spot level asks its own spots, string 6 to 1', () => {
  const boss = createBoss(LEVELS[2], FULL);   // G A B on both E strings
  assert.deepEqual(boss.items.map(i => `${i.string}:${i.fret}`), ['5:3', '5:5', '5:7', '0:3', '0:5', '0:7']);
  assert.deepEqual(boss.items.map(i => NOTE_NAMES[i.pc]), ['G', 'A', 'B', 'G', 'A', 'B']);
  const open = createBoss(L1, { from: 0, to: 2 });   // range does not matter for spot levels
  assert.equal(open.items.length, 12);
  assert.ok(open.items.some(i => i.fret === 12));
});

test('boss: a note level asks one question per note and string, string 6 to 1, in level order', () => {
  const boss = createBoss(L5, FULL, () => 0);
  assert.equal(boss.items.length, 24);
  assert.deepEqual(boss.items.slice(0, 6).map(i => i.string), [5, 4, 3, 2, 1, 0]);
  assert.deepEqual(boss.items.map(i => NOTE_NAMES[i.pc]).filter((_, i) => i % 6 === 0), ['E', 'F', 'B', 'C']);
  for (const it of boss.items) assert.equal(noteAt(it.string, it.fret).name, NOTE_NAMES[it.pc]);
  assert.deepEqual(boss.current, boss.items[0]);
});

test('boss: note-level frets stay inside the range and strings without the note are left out', () => {
  const boss = createBoss(L5, { from: 0, to: 4 }, Math.random);
  for (const it of boss.items) assert.ok(it.fret >= 0 && it.fret <= 4);
  assert.equal(boss.items.length, requiredSpots(L5, { from: 0, to: 4 }).length);
  assert.equal(createBoss(LEVELS[6], { from: 0, to: 0 }).state, 'failed');
});

test('boss: answering every question passes it', () => {
  const boss = createBoss(L1, FULL);
  for (let i = 0; i < 11; i++) assert.equal(boss.correct(1500), 'running');   // 12 spots
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
  const spots = L1.spots;
  let opened = 0;
  for (let i = 0; i < 20; i++) {
    const { string, fret } = spots[i % spots.length];
    if (path.record(1, { string, fret, firstTry: true, ms: 2000 }, FULL).bossUnlocked) opened = i + 1;
  }
  assert.equal(opened, 20);
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
  for (let i = 1; i <= 8; i++) path.completeBoss(i, 1900);
  assert.equal(path.completeBoss(8, 1900).next, null);
  path.reset();
  assert.deepEqual([path.current, path.isDone(1), path.isUnlocked(2)], [1, false, false]);
});

test('store: corrupt or odd saved data falls back safely', () => {
  assert.equal(createPath(memoryStorage({ 'fretboard-practice.path.v3': '{nope' })).current, 1);
  const odd = createPath(memoryStorage({ 'fretboard-practice.path.v3': JSON.stringify({ current: 5, levels: { 1: { recent: 'x', done: false } } }) }));
  assert.equal(odd.current, 1);   // level 5 is locked, so back to 1
  assert.equal(odd.progress(1, FULL).answered, 0);
  const broken = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
  const p = createPath(broken);
  assert.doesNotThrow(() => p.record(1, { string: 5, fret: 0, firstTry: true, ms: 1000 }, FULL));
});

test('store: the old v1 and v2 progress is not carried over: the path starts fresh on the new levels', () => {
  const old = { current: 4, levels: { 1: { recent: [{ ft: true, ms: 900 }], covered: ['4:0'], done: true, stars: 2, bestStreak: 9 }, 2: { done: true } } };
  const p = createPath(memoryStorage({ 'fretboard-practice.path.v1': JSON.stringify(old), 'fretboard-practice.path.v2': JSON.stringify(old) }));
  assert.deepEqual([p.current, p.isDone(1), p.isUnlocked(2)], [1, false, false]);
  assert.deepEqual(p.bests(1), { streak: 0, score: 0 });
});

test('store: review answers count for the window but never for coverage, and the tip card is remembered', () => {
  const storage = memoryStorage();
  const path = createPath(storage);
  path.record(2, { string: 5, fret: 7, firstTry: true, ms: 1000, review: true }, FULL);
  let pr = path.progress(2, FULL);
  assert.deepEqual([pr.answered, pr.spots], [1, 0]);
  path.record(2, { string: 5, fret: 7, firstTry: true, ms: 1000 }, FULL);
  pr = path.progress(2, FULL);
  assert.deepEqual([pr.answered, pr.spots, pr.spotsTotal], [2, 1, 4]);
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

test('spot bag: every spot once per round, missing spots first, no spot hides (spot level)', () => {
  const range = { from: 0, to: 11 };
  const all = requiredSpots(L1, range);
  const bag = createSpotBag(Math.random);
  const key = (t) => `${t.string}@${t.fret}`;
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

test('spot bag: note levels ask each note on every string, inside the fret range', () => {
  const range = { from: 0, to: 11 };
  const all = requiredSpots(L5, range);
  const bag = createSpotBag(Math.random);
  for (let round = 0; round < 10; round++) {
    const seen = Array.from({ length: all.length }, () => { const t = bag.next(L5, range); assert.ok(t.fret >= 0 && t.fret <= 11); return keyOf(t); });
    assert.deepEqual([...seen].sort(), [...all].sort());
  }
});

test('review: pool is every earlier level spot, none on level 1', () => {
  assert.deepEqual(reviewPool(L1, FULL), []);
  const pool2 = reviewPool(LEVELS[1], FULL);
  assert.equal(pool2.length, 12);   // the open-string level
  const pool5 = reviewPool(L5, FULL);
  assert.equal(new Set(pool5.map(s => `${s.string}:${s.fret}`)).size, pool5.length);   // no duplicates
  assert.ok(pool5.some(s => s.string === 5 && s.fret === 7) && pool5.some(s => s.string === 0 && s.fret === 12));
  const pool6 = reviewPool(LEVELS[5], FULL);   // includes the neighbours level's notes
  assert.ok(pool6.length > pool5.length);
});

test('review: about one question in five, never two in a row, never on level 1', () => {
  const mixer = createReviewMixer(Math.random);
  for (let i = 0; i < 50; i++) assert.equal(mixer.next(L1, FULL), null);
  let n = 0, reviews = 0, run = 0;
  for (let i = 0; i < 20000; i++) {
    const r = mixer.next(LEVELS[3], FULL);
    n++;
    if (r) {
      reviews++; run++;
      assert.ok(run < 2, 'two reviews in a row');
      assert.ok(reviewPool(LEVELS[3], FULL).some(s => s.string === r.string && s.fret === r.fret));
    } else run = 0;
  }
  assert.ok(Math.abs(reviews / n - 0.2) < 0.02, `${reviews / n}`);
  assert.equal(REVIEW_P / (1 + REVIEW_P), 0.2);
});

test('review: weak spots are likelier, and a forced roll picks from the pool', () => {
  const lvl = LEVELS[1];
  const seq = [0, 0.5];
  const mixer = createReviewMixer(() => seq.shift() ?? 0);
  const r = mixer.next(lvl, FULL, (string, fret) => (string === 0 && fret === 12 ? 1000 : 0));
  assert.deepEqual(r, { string: 0, fret: 12 });
  assert.equal(mixer.next(lvl, FULL), null);   // the next one is a normal question
});
