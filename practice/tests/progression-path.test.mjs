import { test } from 'node:test';
import assert from 'node:assert/strict';
import { questionVoicings } from '../js/triad-match.js';
import { resolveProgression } from '../js/keys.js';
import {
  PROG_LEVELS, progLevelById, progKey, bossChords, createProgressionBag, createProgressionBoss, createProgressionPathStore,
} from '../js/progression-path.js';

const L = (id) => progLevelById(id);
const fakeStorage = (init) => {
  const m = new Map(init ? [['fretboard-practice.progression-path.v1', init]] : []);
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, v); } };
};
const seeded = (seed = 7) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('level table: pool sizes, titles, shorts', () => {
  assert.deepEqual(PROG_LEVELS.map(l => l.pool.length), [3, 6, 15, 30, 60, 90, 120, 240]);
  const last = PROG_LEVELS[7].pool.map(progKey);
  assert.equal(new Set(last).size, last.length);
  assert.deepEqual(PROG_LEVELS.map(l => l.title),
    ['I–IV–V', 'I–V–vi–IV', 'Three more', 'Keys A E F', 'Strings 4·3·2', 'Strings 5·4·3', 'Strings 6·5·4', 'Every key']);
  assert.deepEqual(PROG_LEVELS.map(l => l.short),
    ['I IV V', '+ I V vi IV', '+ 3 more', '+ A E F', '+ 432', '+ 543', '+ 654', '+ B♭ E♭']);
  assert.deepEqual(PROG_LEVELS.map(l => l.group), ['321', '321', '321', '321', '432', '543', '654', '654']);
});

test('boss entries and boss chords', () => {
  assert.deepEqual(PROG_LEVELS.map(l => progKey(l.boss)), [
    'D:I–IV–V:321', 'D:I–V–vi–IV:321', 'D:I–vi–IV–V:321', 'F:I–vi–IV–V:321',
    'F:I–vi–IV–V:432', 'F:I–vi–IV–V:543', 'F:I–vi–IV–V:654', 'F♯:I–vi–IV–V:654',
  ]);
  assert.equal(bossChords(L(1)).length, 6);
  assert.deepEqual(bossChords(L(2)).map(c => c.name), ['D', 'A', 'Bm', 'G', 'D', 'A', 'Bm', 'G']);
  for (let id = 2; id <= 8; id++) assert.equal(bossChords(L(id)).length, 8);
});

test('every level 8 entry has playable voicings on its group', () => {
  for (const e of L(8).pool) {
    const chords = resolveProgression(e.keyName, e.progId);
    assert.ok(chords.length === 3 || chords.length === 4);
    for (const c of chords) assert.ok(questionVoicings(c.pc, c.quality, e.group).length > 0, progKey(e));
  }
});

test('bag: newest first, no immediate repeat, empty pool is null', () => {
  const bag = createProgressionBag(seeded());
  const added = new Set(L(3).added.map(progKey));
  const first = Array.from({ length: added.size }, () => progKey(bag.next(L(3))));
  assert.ok(first.every(k => added.has(k)));
  assert.equal(new Set(first).size, added.size);
  let prev = null;
  for (let i = 0; i < 200; i++) {
    const k = progKey(bag.next(L(3)));
    assert.notEqual(k, prev);
    prev = k;
  }
  assert.equal(createProgressionBag().next({ id: 99, pool: [], added: [] }), null);
});

test('boss: passes, counts wrong without failing, fails on skip', () => {
  const a = createProgressionBoss(L(1));
  for (let i = 0; i < 5; i++) assert.equal(a.chordDone(2000), 'running');
  assert.equal(a.chordDone(2000), 'passed');
  assert.equal(a.avgMs, 2000);
  assert.equal(a.stars, 3);

  const b = createProgressionBoss(L(1));
  b.wrong(); b.wrong(); assert.equal(b.wrong(), 3);
  for (let i = 0; i < 6; i++) b.chordDone(3000);
  assert.equal(b.state, 'passed');
  assert.equal(b.stars, 1);

  const c = createProgressionBoss(L(1));
  assert.equal(c.fail('skip'), 'failed');
  assert.equal(c.stars, 0);
  assert.equal(c.chordDone(1000), 'failed');
});

test('store: boss unlock, level unlock, stars, persistence', () => {
  const st = fakeStorage();
  const s = createProgressionPathStore(st);
  for (let i = 0; i < 19; i++) assert.equal(s.record(1, { firstTry: true, ms: 1000 }).bossUnlocked, false);
  assert.equal(s.progress(1).bossUnlocked, false);
  assert.equal(s.record(1, { firstTry: true, ms: 1000 }).bossUnlocked, true);
  assert.equal(s.progress(1).bossUnlocked, true);
  assert.equal(s.select(2), false);
  const r = s.completeBoss(1, 3000, 0);
  assert.equal(r.stars, 3);
  assert.equal(r.next, 2);
  assert.equal(s.current, 2);
  assert.equal(s.select(2), true);
  const again = createProgressionPathStore(st);
  assert.equal(again.current, 2);
  assert.equal(again.isDone(1), true);
  assert.equal(createProgressionPathStore(fakeStorage()).completeBoss(1, 5000, 2).stars, 2);
  assert.equal(createProgressionPathStore(fakeStorage()).completeBoss(1, 7000, 0).stars, 1);
});

test('store: corrupt data falls back; failing setItem is harmless; key name', () => {
  assert.equal(createProgressionPathStore({ getItem: () => '{not json', setItem() {} }).current, 1);
  assert.equal(createProgressionPathStore({ getItem: () => JSON.stringify({ current: 5, levels: {} }), setItem() {} }).current, 1);
  const bad = createProgressionPathStore({ getItem: () => null, setItem() { throw new Error('full'); } });
  assert.doesNotThrow(() => bad.record(1, { firstTry: true, ms: 1000 }));
  const st = fakeStorage();
  createProgressionPathStore(st).record(1, { firstTry: true, ms: 1000 });
  assert.deepEqual([...st.m.keys()], ['fretboard-practice.progression-path.v1']);
});
