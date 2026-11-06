# Chord Progressions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Teach the diatonic chords of major keys two ways: a "Keys" flashcard deck in the Chords tab (with a teach-on-a-miss Why panel) and a "Progressions" mode inside Triads (strict closest-voicing chain, level Path with boss runs).

**Architecture:** Three pure modules (`keys.js`, `progression.js`, `progression-path.js`) carry all rules and are node-tested. The Keys deck extends `chords/deck.js` and `chords/quiz.js`. Progressions is a new DOM module `progressions-ui.js` that `triads-ui.js` delegates to; the session accepts a progression run object in place of `createTriadMatcher` (one line), so the Triads rules, scoring and existing tests are untouched.

**Tech Stack:** Vanilla ES modules, no build step, `node --test`, headless Chrome via the CDP driver for screenshots.

**Spec:** `/Users/tomybusbiba/fretboard-neo/docs/superpowers/specs/2026-11-07-chord-progressions-design.md` (read it fully, including the decisions table and the last section "Keys deck: teach on a miss"). Mockups: `/Users/tomybusbiba/fretboard-neo/docs/superpowers/specs/mockups/2026-11-07-progressions/*.html` (markup and class names; the `mk-*` classes and the `.ghost` rules in their `<style>` block are reused verbatim).

## Execution legs (file ownership)

| Leg | Tasks | Runs | Owns (no other leg touches these) |
|---|---|---|---|
| 1 Pure logic | 1-4 | FIRST, alone | `practice/js/keys.js`, `practice/js/progression.js`, `practice/js/progression-path.js`, `practice/tests/keys.test.mjs`, `practice/tests/progression.test.mjs`, `practice/tests/progression-path.test.mjs` |
| 2 Chords tab | 5-7 | parallel with Leg 3, after Leg 1 | `practice/js/chords/deck.js`, `practice/js/chords/quiz.js`, `practice/chords.html`, `practice/chords.css`, `practice/tests/chords-deck.test.mjs` |
| 3 Progressions UI | 8-12 | parallel with Leg 2, after Leg 1 | `practice/js/progressions-ui.js` (new), `practice/js/triads-ui.js`, `practice/js/session.js`, `practice/js/app.js`, `practice/js/settings.js`, `practice/js/hud.js`, `practice/index.html`, `practice/styles.css`, `practice/tests/settings-migrate.test.mjs`, `practice/tests/session-progression.test.mjs` |
| Verify | 13 | last, after Legs 2 and 3 | screenshots only (fixes go back to the owning leg's files) |

## Global Constraints

- Legs 2 and 3 run in separate git worktrees (one per leg, branched from the Leg 1 commit) and commit there; the coordinator merges them. Leg 1 commits on `neo-brutalist` directly.

- Branch `neo-brutalist` in `/Users/tomybusbiba/fretboard-neo`. Never touch `/Users/tomybusbiba/fretboard-explorer` (main checkout) or the frozen copy. Never push.
- Vanilla ES modules, no build step, no new dependencies. Zero code comments by default.
- Tests: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs` run from the repo root; baseline 292 pass, and the count may only grow.
- Commit step command (from the repo root): `git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "<msg>"`; end each message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01CEzHZ7sWxaQAMnZtwAbGGh`.
- Major keys only; chords `I ii iii IV V vi`, qualities major/minor/minor/major/major/minor; never `vii°` anywhere (also never in copy).
- `KEY_ORDER = ['C','G','F','D','A','B♭','E♭','E','B','A♭','D♭','F♯']`; `DEGREES = ['I','ii','iii','IV','V','vi']`. Accidentals are the unicode `♯` and `♭`.
- Progression ids use the en dash: `I–V–vi–IV`, `I–IV–V`, `ii–V–I`, `vi–IV–I–V`, `I–vi–IV–V`.
- Progressions is silent whatever the Voice setting (no `speak`, no new clips); buzz and bling stay. Written text over speech everywhere.
- No change to Triads rules or scoring for Path/Custom; `createTriadMatcher` and `stableDetected` rules unchanged.
- Progression path storage key `fretboard-practice.progression-path.v1`; window and thresholds are `WINDOW`, `FIRST_TRY_MIN`, `AVG_MS_MAX` imported from `practice/js/path.js` (20, 0.75, 6000); stars via `starsFor` from `practice/js/triad-path.js`.
- Open-string frets count as 0 in voicing distance; string index 0 is the high E (`STRINGS` in `practice/js/notes.js`); string group ids `'654' '543' '432' '321'`, strings listed low to high.
- Settings keys: `triadMode: 'progressions'`, `progDisplay: 'numbers' | 'names'` (default `'names'`).
- Build bump to `39`: `BUILD` in `practice/js/app.js` and `data-build` in `practice/index.html` change together, in Task 12 only.
- Chords tab Keys deck: Natural and Notes-only toggles are hidden and ignored; key-signature and fretboard steps are skipped for keys cards.
- Styling uses the existing neo-brutalist tokens (`--nb-*`); mobile widths 390 and desktop 1270x625 must both fit with no horizontal page scroll.

## Review Focus

Failure modes the spec implies that no spec line pins; each has a test in the named task.

1. A chord chain must never dead-end: every key x progression x string group gives a non-empty candidate set at every step (Task 3).
2. One miss must not pull cards out of the Keys pool or re-lock a tier the user already entered (Task 5; the spec's unlock rule is read as cumulative, see Task 5).
3. A wrong note must not end a progression run, and only Skip fails a boss (Task 4 boss object, Task 9 session).
4. Corrupt or old saved data (path store JSON, `triadMode`, `progDisplay`) falls back to defaults instead of throwing (Tasks 4 and 8).
5. The Keys first-visit panel appears only until a keys card has been scored, and the Natural toggle never shrinks the Keys deck (Task 5 `keysSeen`, `cardsFor('keys', {natural:true})`).

---

# LEG 1 - Pure logic (runs first, alone)

### Task 1: Keys theory module (Leg 1)

**Files:**
- Create: `practice/js/keys.js`
- Test: `practice/tests/keys.test.mjs`

**Interfaces:**
- Consumes: `spell(root, semis, steps)` and `pitchClass(name)` from `practice/js/chords/deck.js` (the single spelling source). `keys.js` must not use them at module-evaluation time (Task 5 makes `deck.js` import `keys.js` back; the cycle is safe only if neither module calls the other's exports while loading).
- Produces:
  - `KEY_ORDER: string[]`, `DEGREES: string[]`, `DEGREE_QUALITY: {I:'major', ii:'minor', iii:'minor', IV:'major', V:'major', vi:'minor'}`
  - `diatonicChords(keyName: string): Array<{degree: string, root: string, pc: number, quality: 'major'|'minor', name: string}>` (name = root, plus `m` when minor; `[]` for a key not in `KEY_ORDER`)
  - `degreeOf(keyName: string, chordName: string): string | null`
  - `PROGRESSIONS: Array<{id: string, degrees: string[]}>` in the order `I–V–vi–IV`, `I–IV–V`, `ii–V–I`, `vi–IV–I–V`, `I–vi–IV–V`
  - `progressionById(id: string): {id, degrees} | null`
  - `resolveProgression(keyName: string, progId: string): Array<chord>` (chords in order, same shape as `diatonicChords`; `[]` when either is unknown)

- [ ] **Step 1: Write the failing test** in `practice/tests/keys.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEY_ORDER, DEGREES, diatonicChords, degreeOf, PROGRESSIONS, progressionById, resolveProgression } from '../js/keys.js';

const names = (k) => diatonicChords(k).map(c => c.name);

test('spelling of the diatonic row, every key', () => {
  assert.deepEqual(names('C'), ['C', 'Dm', 'Em', 'F', 'G', 'Am']);
  assert.deepEqual(names('F'), ['F', 'Gm', 'Am', 'B♭', 'C', 'Dm']);
  assert.deepEqual(names('E♭'), ['E♭', 'Fm', 'Gm', 'A♭', 'B♭', 'Cm']);
  assert.deepEqual(names('D♭'), ['D♭', 'E♭m', 'Fm', 'G♭', 'A♭', 'B♭m']);
  assert.deepEqual(names('F♯'), ['F♯', 'G♯m', 'A♯m', 'B', 'C♯', 'D♯m']);
  assert.deepEqual(names('B'), ['B', 'C♯m', 'D♯m', 'E', 'F♯', 'G♯m']);
  assert.equal(KEY_ORDER.length, 12);
  for (const k of KEY_ORDER) {
    const row = diatonicChords(k);
    assert.equal(row.length, 6);
    assert.deepEqual(row.map(c => c.degree), DEGREES);
    assert.equal(new Set(row.map(c => c.root[0])).size, 6);
    assert.ok(row.every(c => !/dim|°/.test(c.name)));
  }
});

test('chord objects carry pitch class and quality', () => {
  const g = diatonicChords('G');
  assert.deepEqual(g.map(c => c.pc), [7, 9, 11, 0, 2, 4]);
  assert.deepEqual(g.map(c => c.quality), ['major', 'minor', 'minor', 'major', 'major', 'minor']);
  assert.deepEqual(diatonicChords('H'), []);
});

test('degreeOf and progressions', () => {
  assert.equal(degreeOf('F', 'Dm'), 'ii');
  assert.equal(degreeOf('C', 'F♯m'), null);
  assert.equal(degreeOf('Z', 'C'), null);
  assert.deepEqual(PROGRESSIONS.map(p => p.id), ['I–V–vi–IV', 'I–IV–V', 'ii–V–I', 'vi–IV–I–V', 'I–vi–IV–V']);
  assert.deepEqual(progressionById('ii–V–I').degrees, ['ii', 'V', 'I']);
  assert.equal(progressionById('nope'), null);
  assert.deepEqual(resolveProgression('G', 'I–V–vi–IV').map(c => c.name), ['G', 'D', 'Em', 'C']);
  assert.deepEqual(resolveProgression('G', 'nope'), []);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/keys.test.mjs`. Expected: FAIL, cannot find module `../js/keys.js`.
- [ ] **Step 3: Implement `practice/js/keys.js`** with the exports above. Root of degree i = `spell(keyName, [0,2,4,5,7,9][i], i)`; `pc` = `pitchClass(root)`.
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/keys.test.mjs`. Expected: 3 tests pass.
- [ ] **Step 5: Commit**

```bash
git add practice/js/keys.js practice/tests/keys.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Keys: diatonic chords and progressions of major keys"
```

### Task 2: `explain` teaching helper (Leg 1)

**Files:**
- Modify: `practice/js/keys.js`
- Test: `practice/tests/keys.test.mjs`

**Interfaces:**
- Consumes: `diatonicChords`, `degreeOf`, `DEGREES`, `DEGREE_QUALITY` (Task 1); `spell` from `deck.js`.
- Produces: `RULE_TEXT: string` (exactly `1, 4, 5 are major · 2, 3, 6 are minor · 7 is diminished (skipped)`) and
  `explain(keyName: string, degreeOrChord: string): {keyName: string, degree: string, scale: string[7], numbers: string[7], highlight: number, ruleText: string, workedText: string, row: Array<{degree: string, name: string}>} | null`.
  `degreeOrChord` is a degree (`'V'`) or a chord name (`'Dm'`); null when the key or the chord is unknown. `scale` is the 7 major-scale notes spelled via `spell`; `numbers` is `['1',...,'7']`; `highlight` is the asked degree's index in `scale` (0-5); `row` is the six chords. `workedText`:
  - asked by degree: `${degree} of ${key} major: count up ${scale.slice(0, n).join(' ')} → ${root}. ${n} is always ${quality} → ${chordName}.`
  - asked by chord name: `${name} is the ${ordinal} note of ${key} major (${scale.slice(0, 6).join(' ')}) → ${degree}. ${n} is always ${quality}, so ${name} fits.`
  - where `n` = highlight + 1, ordinals `1st 2nd 3rd 4th 5th 6th`.

- [ ] **Step 1: Write the failing test** (append to `keys.test.mjs`):

```js
import { explain, RULE_TEXT } from '../js/keys.js';

test('explain: degree card text is exact', () => {
  const e = explain('C', 'V');
  assert.deepEqual(e.scale, ['C', 'D', 'E', 'F', 'G', 'A', 'B']);
  assert.deepEqual(e.numbers, ['1', '2', '3', '4', '5', '6', '7']);
  assert.equal(e.highlight, 4);
  assert.equal(e.ruleText, '1, 4, 5 are major · 2, 3, 6 are minor · 7 is diminished (skipped)');
  assert.equal(e.ruleText, RULE_TEXT);
  assert.equal(e.workedText, 'V of C major: count up C D E F G → G. 5 is always major → G.');
  assert.deepEqual(e.row.map(r => r.name), ['C', 'Dm', 'Em', 'F', 'G', 'Am']);
  assert.equal(explain('C', 'ii').workedText, 'ii of C major: count up C D → D. 2 is always minor → Dm.');
});

test('explain: reverse card text is exact and spells flats', () => {
  const e = explain('F', 'Dm');
  assert.equal(e.degree, 'ii');
  assert.equal(e.workedText, 'Dm is the 2nd note of F major (F G A B♭ C D) → ii. 2 is always minor, so Dm fits.');
  assert.deepEqual(explain('F♯', 'I').scale, ['F♯', 'G♯', 'A♯', 'B', 'C♯', 'D♯', 'E♯']);
});

test('explain: unknown key or chord gives null', () => {
  assert.equal(explain('H', 'V'), null);
  assert.equal(explain('C', 'F♯m'), null);
  assert.equal(explain('C', 'vii'), null);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/keys.test.mjs`. Expected: FAIL, `explain` is not exported.
- [ ] **Step 3: Implement `explain` and `RULE_TEXT` in `practice/js/keys.js`** per the Interfaces block (scale step i = `spell(key, [0,2,4,5,7,9,11][i], i)`).
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/keys.test.mjs`. Expected: 6 tests pass.
- [ ] **Step 5: Commit**

```bash
git add practice/js/keys.js practice/tests/keys.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Keys: explain helper for the teach-on-a-miss panel"
```

### Task 3: Voicing distance, closest chain and progression run (Leg 1)

**Files:**
- Create: `practice/js/progression.js`
- Test: `practice/tests/progression.test.mjs`

**Interfaces:**
- Consumes: `voicingsFor(rootPc, quality, groupId, range)`, `questionVoicings(rootPc, quality, groupId)` from `practice/js/triad-match.js`; `resolveProgression` (Task 1). A voicing is `{shape: number, notes: [{string, fret, midi, degree}] low to high, lowestFret: number}`. A chord is `{pc: number, quality: 'major'|'minor'}` (diatonic chord objects qualify).
- Produces (Legs 2/3 rely on these exact names):
  - `CHAIN_RANGE = { from: 0, to: 14 }`
  - `voicingDistance(a, b): number` (sum over the 3 strings of the absolute fret difference, index-aligned low to high)
  - `closestVoicings(prev, candidates): voicing[]` (every candidate at the minimum distance, input order kept; `[]` for no candidates)
  - `chainFrom(startVoicing, chords, group): voicing[]` (`chords[0]` is the chord `startVoicing` plays; result[0] is `startVoicing`; each next element is the first of `closestVoicings(prev, voicingsFor(chord.pc, chord.quality, group, CHAIN_RANGE))`)
  - `createProgressionRun(chords, group): ProgressionRun`, matcher-compatible so `session.js` can use it in place of `createTriadMatcher`:
    - getters `step` (0-2 inside the current chord), `index` (current chord, 0-based), `total` (= chords.length), `candidates` (voicings still acceptable for the current chord and step), `found` (voicings played so far, one per finished chord, in order), `previous` (voicing played for chord index-1, else null)
    - `expected(): number[]` (distinct MIDI pitches accepted next)
    - `feed(midi): {status: 'step', step, voicing, index} | {status: 'shape', step: 3, voicing, shape, found: number, total, index} | {status: 'done', step: 3, voicing, shape, found, total, index} | {status: 'wrong', step, index}`; `shape` = chord finished with more to go; `done` = last chord finished (`found` and `total` are counts); after done every feed returns `{status: 'done', step: 3, found, total, index}`
    - `reset()`
  - Chord 1 accepts `questionVoicings(pc, quality, group)` (any shape); chord n+1 accepts `closestVoicings(playedForChordN, voicingsFor(pc, quality, group, CHAIN_RANGE))`. Within a chord, the first note must be the lowest note of an acceptable voicing and fixes it; later notes continue it by exact MIDI; a wrong note changes nothing.

- [ ] **Step 1: Write the failing test** in `practice/tests/progression.test.mjs`:

```js
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
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/progression.test.mjs`. Expected: FAIL, cannot find module `../js/progression.js`.
- [ ] **Step 3: Implement `practice/js/progression.js`.** Run state: `index`, `step`, `candidates`, `played[]`. Step 0 filters candidates by `notes[0].midi === midi`, later steps by `notes[step].midi`; completing the third note stores `next[0]` as the played voicing and, unless last, sets `candidates = closestVoicings(played, voicingsFor(nextChord..., CHAIN_RANGE))`. `status 'step'` returns `voicing: candidates[0]` (the same shape `createTriadMatcher` returns).
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/progression.test.mjs`. Expected: all pass (the no-dead-end test takes a few seconds).
- [ ] **Step 5: Commit**

```bash
git add practice/js/progression.js practice/tests/progression.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Progression: closest-voicing chain and run matcher"
```

### Task 4: Progression path, bag, boss and store (Leg 1)

**Files:**
- Create: `practice/js/progression-path.js`
- Test: `practice/tests/progression-path.test.mjs`

**Interfaces:**
- Consumes: `evaluate`, `blankEntry`, `starsFor` from `practice/js/triad-path.js`; `WINDOW` from `practice/js/path.js`; `resolveProgression`, `KEY_ORDER` (Task 1); `questionVoicings` from `triad-match.js` (tests only).
- Produces (Leg 3 relies on these exact names):
  - `type Entry = {keyName: string, progId: string, group: string}`; `progKey(e: Entry): string` = `${keyName}:${progId}:${group}`
  - `PROG_LEVELS: Array<{id: number, title: string, short: string, group: string, added: Entry[], pool: Entry[], boss: Entry}>` (pool = every level's `added` up to this one; `group` = newest string group)
  - `progLevelById(id): level | null`
  - re-exports `evaluate`, `blankEntry`, `starsFor`
  - `bossChords(level): chord[]` (the boss progression resolved in its boss key, played twice through)
  - `createProgressionBag(rng = Math.random): { next(level): Entry | null }` (shuffled bag; the level's `added` entries first, then the rest; never the same entry twice in a row when more than one)
  - `createProgressionBoss(level): { levelId, entry, chords, total, index, times: number[], mistakes: number, state: 'running'|'passed'|'failed', reason, avgMs, totalMs, stars, wrong(): number, chordDone(ms): 'running'|'passed', fail(reason): string }` (`wrong` is counted, never fatal; `stars` is `starsFor(avgMs, mistakes)` once passed, else 0)
  - `createProgressionPathStore(storage = globalThis.localStorage)`: `{current, currentLevel, isUnlocked(id), isDone(id), stars(id), select(id): boolean, progress(id), record(id, {firstTry, ms}): {bossUnlocked: boolean}, completeBoss(id, avgMs, mistakes): {stars, bestStars, first, next}, reset()}`; same semantics as `createTriadPathStore` (level opens when the previous level's boss is done; boss unlock is sticky; one answer = one chord).

**Level table (decided, tests pin it).** Progression intro order: `I–IV–V`, `I–V–vi–IV`, `vi–IV–I–V`, `ii–V–I`, `I–vi–IV–V`. Groups `321 432 543 654`.

| id | title / short | group | added |
|---|---|---|---|
| 1 | `I–IV–V` / `I IV V` | 321 | `I–IV–V` in C G D |
| 2 | `I–V–vi–IV` / `+ I V vi IV` | 321 | `I–V–vi–IV` in C G D |
| 3 | `Three more` / `+ 3 more` | 321 | `vi–IV–I–V`, `ii–V–I`, `I–vi–IV–V` in C G D |
| 4 | `Keys A E F` / `+ A E F` | 321 | all 5 progressions in A E F |
| 5 | `Strings 4·3·2` / `+ 432` | 432 | all 5 in C G D A E F |
| 6 | `Strings 5·4·3` / `+ 543` | 543 | same keys |
| 7 | `Strings 6·5·4` / `+ 654` | 654 | same keys |
| 8 | `Every key` / `+ B♭ E♭` | 654 | all 5 in B♭ E♭ B A♭ D♭ F♯ (the rest of `KEY_ORDER`) on all four groups |

Boss entry per level = last-added key, last longest progression of that level's `added` (intro order), the level's `group`: L1 D·`I–IV–V`·321, L2 D·`I–V–vi–IV`·321, L3 D·`I–vi–IV–V`·321, L4 F·`I–vi–IV–V`·321, L5 F·`I–vi–IV–V`·432, L6 ·543, L7 ·654, L8 F♯·`I–vi–IV–V`·654. Boss chords: 6 on L1, 8 on L2-L8. Pool sizes by level: 3, 6, 15, 30, 60, 90, 120, 240.

- [ ] **Step 1: Write the failing test** in `practice/tests/progression-path.test.mjs` covering, with exact assertions:
  - `PROG_LEVELS.map(l => l.pool.length)` deepEqual `[3, 6, 15, 30, 60, 90, 120, 240]`; no duplicate `progKey` in the last pool; titles and shorts from the table.
  - boss entries from the table (`progKey(l.boss)` list) and `bossChords(L1).length === 6`, `bossChords(L2).map(c => c.name)` deepEqual `['D','A','Bm','G','D','A','Bm','G']`, length 8 for levels 2-8.
  - every entry of the level 8 pool resolves 4 or 3 chords that each have `questionVoicings(...).length > 0` on the entry's group.
  - bag: first draws of level 3 are all from `added` (newest first); no immediate repeat over 200 draws with a seeded rng; empty pool returns null.
  - boss object: 6 `chordDone(2000)` calls on L1 give `'passed'`, `avgMs` 2000, `stars` 3; `wrong()` x3 then pass at 3000 ms gives `stars` 1 and state never `'failed'`; `fail('skip')` gives `'failed'`, `stars` 0; `chordDone` after failure stays `'failed'`.
  - store (fake storage `{getItem, setItem}` over a Map): 19 clean 1000 ms `record(1, ...)` calls leave `progress(1).bossUnlocked` false, the 20th returns `{bossUnlocked: true}`; `select(2)` is false before the boss and true after `completeBoss(1, 3000, 0)` (which returns `stars: 3`, `next: 2`, and sets `current` 2); `completeBoss(1, 5000, 2).stars === 2` and `(1, 7000, 0).stars === 1` on a fresh store; a second store on the same storage restores `current` and `isDone(1)`.
  - corrupt storage: `getItem` returning `'{not json'` and returning `JSON.stringify({current: 5, levels: {}})` both yield `current === 1`; `setItem` throwing does not throw out of `record`.
  - storage key: after one `record`, the fake storage holds exactly the key `fretboard-practice.progression-path.v1`.
- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/progression-path.test.mjs`. Expected: FAIL, cannot find module.
- [ ] **Step 3: Implement `practice/js/progression-path.js`**, mirroring `practice/js/triad-path.js` (level shape, bag at line 88, boss at line 116, store at line 172); levels are built from the table above; the store's `sanitize` mirrors the one in `triad-path.js` just above the store over `PROG_LEVELS`.
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/progression-path.test.mjs`. Expected: all pass.
- [ ] **Step 5: Leg 1 gate.** Run: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs`. Expected: all pass, count above 292.
- [ ] **Step 6: Commit**

```bash
git add practice/js/progression-path.js practice/tests/progression-path.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Progression path: levels, bag, boss, store"
```

---

# LEG 2 - Chords tab Keys deck (parallel with Leg 3, after Leg 1)

### Task 5: Keys deck data, unlock tiers, answer check (Leg 2)

**Files:**
- Modify: `practice/js/chords/deck.js` (`DECKS` at line 55, `cardsFor` at line 58, new exports)
- Test: `practice/tests/chords-deck.test.mjs`

**Interfaces:**
- Consumes: `diatonicChords`, `KEY_ORDER`, `DEGREES` (Task 1); existing `MASTERED_BOX`.
- Produces:
  - `KEY_TIERS = {1: ['C','G','F'], 2: ['D','A','B♭','E♭'], 3: ['E','B','A♭','D♭','F♯']}`, `DEGREE_TIERS = {1: ['I','IV','V'], 2: ['ii','iii','vi']}`, `UNLOCK_STEPS = [[1,1],[1,2],[2,1],[2,2],[3,1],[3,2]]` (key tier, degree tier), `UNLOCK_SHARE = 0.75`
  - Card types (no top-level `quality` field; the old `'maj'|'min'` values stay in the classic decks):
    - degree card: `{kind: 'degree', id: 'K:C:V', keyName: 'C', degree: 'V', answer: {root: 'G', pc: 7, quality: 'major', name: 'G'}, row: chord[], keyTier, degTier}`
    - reverse card: `{kind: 'roman', id: 'K:F:Dm', keyName: 'F', degree: 'ii', chordName: 'Dm', row: chord[], keyTier, degTier}`
  - `keysCards(): card[]` (144, memoized, built on first call). `DECKS` gets a lazy `get keys()` returning `keysCards()`; `deck.js` must not call anything from `keys.js` while loading (cycle with Task 1).
  - `cardsFor('keys')` returns all 144 and ignores `natural`.
  - `keysUnlock(boxes): {step: number, keyTier: number, degTier: number}`; `keysPool(boxes): card[]`; `keysSeen(boxes): boolean` (true when any id starts with `K:`); `checkKeysAnswer(card, answer): {correct: boolean}` (degree card: `answer = {pc, quality}`, both must match; roman card: `answer = {degree}`).

**Unlock rule (the spec's order read as cumulative so the pool never shrinks).** Step i's pool = every card that some step j <= i allows (`keyTier <= S[j][0]` and `degTier <= S[j][1]`); sizes 18, 36, 60, 84, 114, 144. `keysUnlock` starts at step 0 and moves from step i to i+1 when mastered cards (box >= `MASTERED_BOX`) are >= 75 % of pool i, OR when any card that only pool i+1 contains already has a box entry (a tier once entered stays open). Derived from `boxes` each call; nothing stored.

- [ ] **Step 1: Write the failing test** (append to `practice/tests/chords-deck.test.mjs`):

```js
import { keysCards, keysPool, keysUnlock, keysSeen, checkKeysAnswer } from '../js/chords/deck.js';

const master = (ids) => Object.fromEntries(ids.map(id => [id, 3]));
const idsOf = (pool) => pool.map(c => c.id);

test('keys deck: 144 cards, two types, ids as specified', () => {
  const all = keysCards();
  assert.equal(all.length, 144);
  assert.equal(new Set(all.map(c => c.id)).size, 144);
  const d = all.find(c => c.id === 'K:C:V');
  assert.deepEqual([d.kind, d.answer.name, d.answer.pc, d.answer.quality], ['degree', 'G', 7, 'major']);
  const r = all.find(c => c.id === 'K:F:Dm');
  assert.deepEqual([r.kind, r.degree, r.chordName], ['roman', 'ii', 'Dm']);
  assert.deepEqual(r.row.map(c => c.name), ['F', 'Gm', 'Am', 'B♭', 'C', 'Dm']);
});

test('keys deck ignores the Natural toggle and falls through to nothing else', () => {
  assert.equal(cardsFor('keys', { natural: true }).length, 144);
  assert.equal(cardsFor('keys').length, 144);
});

test('keys pool per unlock state: 18 / 36 / 60 / 84 / 114 / 144', () => {
  const sizes = [];
  let boxes = {};
  for (let i = 0; i < 6; i++) {
    const pool = keysPool(boxes);
    sizes.push(pool.length);
    boxes = master(idsOf(pool));
  }
  assert.deepEqual(sizes, [18, 36, 60, 84, 114, 144]);
  const first = keysPool({});
  assert.ok(first.every(c => c.keyTier === 1 && c.degTier === 1));
  assert.ok(idsOf(first).includes('K:G:IV') && idsOf(first).includes('K:G:C') && !idsOf(first).includes('K:C:ii'));
});

test('keys unlock needs 75 percent of the pool mastered (14 of 18)', () => {
  const ids = idsOf(keysPool({}));
  assert.equal(keysUnlock(master(ids.slice(0, 13))).step, 0);
  assert.equal(keysUnlock(master(ids.slice(0, 14))).step, 1);
});

test('keys: one miss does not re-lock a tier already entered, and a seen card opens it', () => {
  const ids = idsOf(keysPool({}));
  const boxes = { ...master(ids.slice(0, 14)), 'K:C:ii': 0 };
  assert.equal(keysUnlock(boxes).step, 1);
  assert.equal(keysUnlock({ ...boxes, [ids[0]]: 0, [ids[1]]: 0, [ids[2]]: 0 }).step, 1);
  assert.equal(keysUnlock({ 'K:C:ii': 0 }).step, 1);
});

test('keysSeen turns on after the first scored keys card only', () => {
  assert.equal(keysSeen({}), false);
  assert.equal(keysSeen({ C: 2, Am: 1 }), false);
  assert.equal(keysSeen({ 'K:C:V': 0 }), true);
});

test('keys answers: degree needs pitch class and quality; numeral needs the degree', () => {
  const d = keysCards().find(c => c.id === 'K:C:V');
  assert.equal(checkKeysAnswer(d, { pc: 7, quality: 'major' }).correct, true);
  assert.equal(checkKeysAnswer(d, { pc: 7, quality: 'minor' }).correct, false);
  assert.equal(checkKeysAnswer(d, { pc: 2, quality: 'major' }).correct, false);
  const r = keysCards().find(c => c.id === 'K:F:Dm');
  assert.equal(checkKeysAnswer(r, { degree: 'ii' }).correct, true);
  assert.equal(checkKeysAnswer(r, { degree: 'vi' }).correct, false);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/chords-deck.test.mjs`. Expected: FAIL, `keysCards` is not exported.
- [ ] **Step 3: Implement the exports in `practice/js/chords/deck.js`.** `cardsFor`: apply the `natural` filter only when `deck !== 'keys'`; keep the unknown-deck fallback to `DECKS.major` for anything that is not a key of `DECKS`. A degree card's `answer` is the diatonic chord for that degree; a roman card's `chordName` is the same chord's name; tiers come from `KEY_TIERS` / `DEGREE_TIERS`.
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/chords-deck.test.mjs practice/tests/keys.test.mjs`. Expected: all pass (the existing deck tests too; the module cycle must not throw in either import order).
- [ ] **Step 5: Commit**

```bash
git add practice/js/chords/deck.js practice/tests/chords-deck.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Chords: Keys deck cards, tiers and unlock"
```

### Task 6: Keys cards in the Chords quiz (Leg 2)

**Files:**
- Modify: `practice/chords.html` (deck radios at lines 41-45, `#panel-notes` at line ~95), `practice/chords.css`, `practice/js/chords/quiz.js`

**Interfaces:**
- Consumes: from `deck.js` (Task 5) `keysPool`, `checkKeysAnswer`, `cardsFor('keys')`; from `keys.js` `DEGREES`; existing `promote`, `pickCard`, `MASTERED_BOX`, `pitchClass`, `strum`, `say`, `shake`, `glow`, `burst`, `flip`.
- Produces: a working Keys deck in the quiz; Task 7 hooks onto `showWhy(card)` / `hideWhy()` (stubs here, filled there) and the `'intro'` step.

- [ ] **Step 1: Markup.** In `chords.html`: add `<label><input type="radio" name="deck" value="keys"><span>Keys</span></label>` after "Both". In `#panel-notes`, after `#keypad`, add `<div class="mk-chooser" id="keys-chooser" hidden>` with two `<button type="button" data-quality="major|minor">Major|Minor</button>` and `<div class="mk-roman" id="keys-roman" hidden></div>` (six `<button type="button" data-degree>` built in JS from `DEGREES`). Card back and front reuse the existing `#card-back`, `#card-tag`, `#card-name`, `#card-ask`.
- [ ] **Step 2: CSS.** In `chords.css` copy the rules for `.mk-chooser`, `.mk-roman`, `.cq .card__name.mk-key`, `.mk-row` and the 560px media rule from the mockup `<style>` block (`mockups/2026-11-07-progressions/keys-degree.html`), plus `.mk-chooser[hidden], .mk-roman[hidden], .cq-opts [hidden] { display: none }` (`display:flex/grid` would otherwise defeat `hidden`).
- [ ] **Step 3: Quiz flow in `quiz.js`** (behaviours, names fixed here):
  - `isKeys()` = `prefs.deck === 'keys'`; `activeCards()` = `isKeys() ? keysPool(prefs.boxes) : cardsFor(prefs.deck, {natural: prefs.natural})`, used by `nextCard` (card pick) and `renderStats` (so "Mastered x/total" counts the unlocked pool; 0/18 on a fresh keys deck).
  - `syncKeysUi()` on load and on deck change: hide the `.cq-natural` and `.cq-notes-only` labels, hide `.cq-steps`, hide `#slots`, show `#keypad` + `#keys-chooser` for degree cards or `#keys-roman` for roman cards.
  - `renderKeysCard()`: degree card tag `Keys · degree`, name `${keyName} major` (class `mk-key`), ask `What is the ${degree}?` plus a second line `Root, then major or minor`; roman card tag `Keys · numeral`, name `In ${keyName} major, ${chordName} is…?`. Card back = the whole diatonic row as `.mk-row` (`<div><b>name</b><span>degree</span></div>` x6).
  - Degree answers: keypad click sets `keysPick.pc` (click again clears); chooser sets `keysPick.quality`; `.keypad__mid` shows `${note} · ${quality}?`. As soon as both are set, `checkKeys()` runs automatically.
  - Roman answers: a chip click runs `checkKeys()` immediately.
  - `checkKeys()` correct: `say('Right! ' + row names joined by two spaces, 'ok')`, `strum`, `glow`, `burst`, wait 900 ms, `nextCard()`. Wrong: `clean = false`, `shake(cardEl)`, `showWhy(card)`, clear the picks after 900 ms, same card stays for a retry.
  - `reveal()` for keys: `clean = false`, `flip(true)`, `showWhy(card)`, `step = 'done'`, `btn-go` enabled (Enter or Go moves on). In keys mode `btn-go` is enabled only when `step === 'done'`; `go()` is a no-op while `step === 'notes'` in keys mode; because `go()` already guards on `step !== 'notes'` (`quiz.js:165`), the `btn-go` click handler and the Enter handler must instead branch first: `step === 'done'` -> `nextCard()`, `step === 'intro'` -> the intro dismissal (Task 7), `step === 'notes'` in keys mode -> nothing.
  - Clear and Escape clear `keysPick`; Backspace is ignored in keys mode.
  - Say it (`listen()`): for a degree card fill the root only from `heard.notes[0]`; the button is hidden for roman cards.
  - Scoring unchanged: leaving a card calls `promote(prefs.boxes, card.id, clean)`.
- [ ] **Step 4: Verify.** Run: `node --check practice/js/chords/quiz.js && node --test practice/tests/chords-deck.test.mjs practice/tests/chords-speech.test.mjs`. Expected: no syntax error, tests pass. (Behaviour is proven in Task 13.)
- [ ] **Step 5: Commit**

```bash
git add practice/chords.html practice/chords.css practice/js/chords/quiz.js
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Chords: Keys deck degree and numeral cards"
```

### Task 7: Why panel, shown on a miss, Show answer and first visit (Leg 2)

**Files:**
- Modify: `practice/chords.html`, `practice/chords.css`, `practice/js/chords/quiz.js`

**Interfaces:**
- Consumes: `explain(keyName, degreeOrChord)` (Task 2; returns `{scale, numbers, highlight, ruleText, workedText, row}`), `keysSeen(boxes)` (Task 5), `showWhy` / `hideWhy` call sites from Task 6.
- Produces: `renderWhy(info, {heading})`, `showWhy(card)`, `hideWhy()`, step value `'intro'`.

- [ ] **Step 1: Markup.** In `chords.html` inside `.cq-work` add `<aside class="why" id="why" hidden aria-live="polite">` containing: `<div class="why__head" id="why-head"></div>`, `<div class="why__scale" id="why-scale"></div>`, `<p class="why__rule" id="why-rule"></p>`, `<p class="why__worked" id="why-worked"></p>`, `<div class="mk-row why__row" id="why-row"></div>`. The panel replaces the key-signature and fretboard panels for keys cards.
- [ ] **Step 2: CSS** in `chords.css`: `.why` as a bordered card on `--nb-card` with the neo-brutalist border/shadow tokens; `.why__scale` is 7 columns (note over number), the asked degree's column gets `.is-ask` (yellow background); `.why__row` reuses `.mk-row`. Must fit 390 px wide without horizontal scroll (7 columns shrink, no wrap of note over number).
- [ ] **Step 3: Behaviour in `quiz.js`.**
  - `showWhy(card)`: `renderWhy(explain(card.keyName, card.kind === 'degree' ? card.degree : card.chordName))`; unhide `#why`. Called from the wrong-answer path and `reveal()` (Task 6); the card stays unclean and the user can retry after a wrong answer. `hideWhy()` runs at the start of `nextCard`.
  - `renderWhy`: line 1 chips of `scale` over `numbers` with `highlight` marked `.is-ask`; line 2 `ruleText`; line 3 `workedText`; line 4 the row, name over degree. All text via `textContent`.
  - First visit: when the deck becomes `'keys'` (page load or radio change) and `!keysSeen(prefs.boxes)` and the intro has not run in this page session, do not deal a card: show `explain('C', 'V')` with `heading` `How the Keys deck works`, set `step = 'intro'`, enable `btn-go`; Go or Enter hides the panel and calls `nextCard({ first: true })` (not plain `nextCard()`: `card` is null and the non-first path would promote the leaving card, `quiz.js:353-358`). After the first scored keys card `keysSeen` is true, so the intro never shows again.
- [ ] **Step 4: Verify.** Run: `node --check practice/js/chords/quiz.js && node --test practice/tests/keys.test.mjs practice/tests/chords-deck.test.mjs`. Expected: pass. (Panel rendering is proven in Task 13.)
- [ ] **Step 5: Commit**

```bash
git add practice/chords.html practice/chords.css practice/js/chords/quiz.js
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Chords: Why panel for the Keys deck"
```

---

# LEG 3 - Progressions UI (parallel with Leg 2, after Leg 1)

### Task 8: Settings keys and migration (Leg 3)

**Files:**
- Modify: `practice/js/settings.js` (`DEFAULTS` at line 23, `migrate` at line 79)
- Test: `practice/tests/settings-migrate.test.mjs`

**Interfaces:**
- Produces: `DEFAULTS.progDisplay === 'names'`; `migrate` keeps `triadMode: 'progressions'` and a valid `progDisplay`.

- [ ] **Step 1: Write the failing test** (append):

```js
test('Progressions: names by default; triadMode progressions and progDisplay survive migrate', () => {
  assert.equal(DEFAULTS.progDisplay, 'names');
  assert.equal(migrate({ triadMode: 'progressions' }).triadMode, 'progressions');
  assert.equal(migrate({ progDisplay: 'numbers' }).progDisplay, 'numbers');
});

test('Progressions: unknown triadMode or progDisplay fall back to the defaults', () => {
  assert.equal('triadMode' in migrate({ triadMode: 'bogus' }), false);
  assert.equal('progDisplay' in migrate({ progDisplay: 'roman' }), false);
  assert.equal('progDisplay' in migrate({ progDisplay: 7 }), false);
});
```

- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/settings-migrate.test.mjs`. Expected: FAIL (`progDisplay` undefined, `triadMode` deleted).
- [ ] **Step 3: Implement.** Add `progDisplay: 'names'` to `DEFAULTS` (update the `triadMode` comment to list `'progressions'`); in `migrate` accept `'progressions'` in the `triadMode` check and delete `saved.progDisplay` unless it is `'numbers'` or `'names'`.
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/settings-migrate.test.mjs`. Expected: all pass.
- [ ] **Step 5: Commit**

```bash
git add practice/js/settings.js practice/tests/settings-migrate.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Settings: progressions mode and display toggle"
```

### Task 9: Session accepts a progression run (Leg 3)

**Files:**
- Modify: `practice/js/session.js` (`nextTarget`, lines ~89-93)
- Test: `practice/tests/session-progression.test.mjs` (new)

**Interfaces:**
- Consumes: `createProgressionRun`, `chainFrom`, `CHAIN_RANGE` (Task 3); `resolveProgression` (Task 1).
- Produces: in triads mode, a target with `run` (a `ProgressionRun`) uses it as `session.matcher`; any target without `run` behaves exactly as before. Per chord the session emits `step` x2 then `shape` (`found` = chords done, `total` = chords.length, `ms`, `firstTry`, `hinted` per chord) and `correct` after the last chord (state `resolved`); `session.steps` / `session.note` always follow `session.matcher.candidates[0]`.

- [ ] **Step 1: Write the failing test** in `practice/tests/session-progression.test.mjs` (same `make` helper style as `session-triads.test.mjs`, with `pickTriad` returning `{kind: 'progression', rootPc: 7, quality: 'major', group: '321', voicings: run.candidates, run, chords}`):
  - play the worked chain from `[4,3,3]` (`chainFrom` gives the voicings, feed every `n.midi` through `session.noteDetected`): event types are `step step shape step step shape step step shape step step correct`; the last event has `total === 4`; `session.state === 'resolved'` only after it.
  - after chord 1, `session.acceptedMidis()` deepEquals `[closest D voicing].notes[0].midi` only, and `session.note.midi` equals it.
  - per-chord clock: advance 2000 before chord 1's last note and 500 before chord 2's; the two `shape` events carry `ms` 2000 and 500 (clock restarts at each chord).
  - a farther D shape (`voicingsFor(2,'major','321',CHAIN_RANGE).find(v => v.lowestFret >= 9)`): after `advance(2000)`, `session.stableDetected(far.notes[0].midi, {fresh: true, heldMs: 300})` emits `wrong` (choose `far` so its first note is not the accepted first note nor an octave of it: add `&& Math.abs(v.notes[0].midi - accepted.notes[0].midi) % 12 !== 0` to the `find`; `session.js:200` octave-corrects a wrong note, so a farther shape whose first note is an octave away is accepted as the near one. This is accepted behaviour and stays undocumented in the UI), and the next chord's `firstTry` is false for that chord only.
  - a target without `run` (the existing `voicingsFor(0,'major','321')` case) still gets a `createTriadMatcher` (assert `session.matcher.total === 3`).
- [ ] **Step 2: Run to verify it fails.** Run: `node --test practice/tests/session-progression.test.mjs`. Expected: FAIL (session builds a triad matcher from `voicings`, wrong event sequence).
- [ ] **Step 3: Implement** in `session.js` `nextTarget`: `session.matcher = target.run || createTriadMatcher(target.voicings)` and `session.steps = voicingSteps(session.matcher.candidates[0])`. No other change.
- [ ] **Step 4: Run to verify it passes.** Run: `node --test practice/tests/session-progression.test.mjs practice/tests/session-triads.test.mjs practice/tests/session.test.mjs`. Expected: all pass (existing triad tests unchanged).
- [ ] **Step 5: Commit**

```bash
git add practice/js/session.js practice/tests/session-progression.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Session: accept a progression run as the triad matcher"
```

### Task 10: Markup, styles and HUD chip row (Leg 3)

**Files:**
- Modify: `practice/index.html`, `practice/styles.css`, `practice/js/hud.js`

**Interfaces:**
- Produces: DOM ids that Tasks 11-12 use and `hud.setProgChips`.
  - `#prog-display-lab` (`<span class="mk-lab">Show as</span>`) and `#prog-display` (`<div class="mk-seg" role="group" aria-label="Show as">` with `<button type="button" data-id="numbers">Numbers</button>` and `data-id="names"`), both `hidden`, placed first inside `.modebar__right` (as in the mockup)
  - `#prog-chips` (`<div class="mk-chips" id="prog-chips" hidden>`) inside `.hud__c`, directly before `#status`
  - `<section class="path" id="prog-path" aria-label="Progression level path" hidden>` after the `#triad-path` section, same inner structure without the tip button and tip card: `<ol class="path__map" id="prog-map">`, `<button class="chip chip--boss" id="prog-boss-btn" disabled>Boss</button>`, `<div class="path__pop" id="prog-pop" hidden>` with `#prog-pop-title`, `#prog-pop-goal`, `.path__stats#prog-pop-stats`, `.path__bossnote#prog-pop-boss`
  - `#triad-mode-picker` `aria-label` becomes `Triads: path, custom or progressions`
  - `hud.setProgChips(labels: string[] | null, cur: number, done: number): void` (null or empty hides the row; chips below `done` get `is-done`, index `cur` gets `is-cur`; text via `textContent`)

- [ ] **Step 1: `index.html`** — add the markup above. Do not touch `data-build` yet (Task 12).
- [ ] **Step 2: `styles.css`** — copy the mockup rules `.mk-seg`, `.mk-lab`, `.mk-chips` (+ `.is-done`, `.is-cur`), `.mk-path` (+ `i`, `.miss`) and the `.ghost` outline rules (`.ghost .fb-note__dot`, `.fb-note__shadow`, `.fb-note__glow`, `text`, `.ghost{opacity:.5}`) next to `.boss-end` (line ~752), add `.mk-seg[hidden], .mk-lab[hidden], .mk-chips[hidden] { display: none }`, and chip-row spacing. Do NOT copy the mockup's `.p-hud .prompt__status{display:none}` or its unscoped `.p-hud .prompt__note{font-size:46px!important}` (they would change the other modes); any HUD rule only Progressions needs (note size, hiding or compacting the status line) is scoped under `.p-hud[data-prog]`. If the chip row needs more height than `--hud-h: 120px` (line 1132), add `.p-hud[data-mode="triads"][data-prog] { --hud-h: <fit> }`; Task 11 sets `document.body.dataset.prog` while Progressions is on screen. Tokens only.
- [ ] **Step 3: `hud.js`** — add and export `setProgChips`, looked up by id like the other helpers.
- [ ] **Step 4: Verify.** Run: `for id in prog-display-lab prog-display prog-chips prog-path prog-map prog-boss-btn prog-pop prog-pop-title prog-pop-goal prog-pop-stats prog-pop-boss; do printf "%s " $id; grep -c "id=\"$id\"" practice/index.html; done; node --check practice/js/hud.js`. Expected: every id prints `1`, no syntax error.
- [ ] **Step 5: Commit**

```bash
git add practice/index.html practice/styles.css practice/js/hud.js
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Practice: Progressions markup, styles and HUD chip row"
```

### Task 11: `progressions-ui.js` (Leg 3)

**Files:**
- Create: `practice/js/progressions-ui.js`

**Interfaces:**
- Consumes: `resolveProgression`, `progressionById` (Task 1); `createProgressionRun` (Task 3); `PROG_LEVELS`, `createProgressionPathStore`, `createProgressionBag`, `createProgressionBoss`, `bossChords`, `starsFor`, `progKey` (Task 4); `WINDOW`, `FIRST_TRY_MIN`, `AVG_MS_MAX` from `path.js`; `hud.setPath`, `hud.setProgChips`, `hud.crit`, `hud.opensNote`, `hud.showLock`, `hud.confetti`; DOM ids from Task 10; the `ctx` object built in `app.js:1103-1121` (`$`, `ui`, `session`, `fretboard`, `history`, `getSettings`, `commit`, `setPrompt`, `setStatus`, `setTip`, `scrollBoardTo`, `updateStats`, `renderHeatPanel`, `buzz`, `bling`, `hideChainIntro`, `hideBossEnd`, `toggleSession`, `clearWrongTimers`, `renderCombo`, `syncComboContext`).
- Produces: `createProgressionsUI(ctx, helpers)` where `helpers = {flashStrip(kind: 'hit'|'miss'), blingTop(voicing), showIntro(kicker, big, start, ms, chain)}` (supplied by `triads-ui.js`) returns `{active(): boolean, pick(opts, previous, rng): target | null, onEvent(type, p): boolean, onSkip(): void, stopped(): void, render(): void, renderBossStrip(): void, cancelBoss(): void, boss: {state, totalMs} | null, store}`.

**Behaviour (each line is a requirement):**
- `active()` = `settings.mode === 'triads' && settings.triadMode === 'progressions'`.
- `pick`: boss running gives `{kind: 'progression-boss', ...}` over `bossChords(level)`; else `bag.next(level)` gives `{kind: 'progression', ...}`. Both targets carry `keyName, progId, group, chords, display, rootPc: chords[0].pc, quality: chords[0].quality, voicings: run.candidates, run, levelId, entry`; a fresh `createProgressionRun(chords, group)` per target (the chain resets every question).
- Question line, via `ctx.setPrompt(line, bigWord, 'listening')`: Numbers `Key of G · I – V – vi – IV · strings 3·2·1`, Names `Key of G · G – D – Em – C · strings 3·2·1`; the big word is the current chord's label. Labels and chips read `settings.progDisplay` live, so toggling `#prog-display` re-renders mid-run (`ctx.commit({progDisplay})`, aria-pressed on both buttons).
- Chips: `hud.setProgChips(labels, run.index, run.index)` after every event; `#found-val` shows `${run.index + 1}/${chords.length}` with its label (`small`) set to `Chord`; the dots strip `ui.bossPips` is emptied.
- Status text: first chord `Play ${name} on strings 3·2·1, thickest string first`; later chords `Stay close: the nearest ${name} to your ${previousName}`; step `${n} of 3 ✓ — now string ${s}`; wrong `Not that one` (boss adds ` · N mistakes`); the session hint events behave as in Triads (tip, then the next note), except the stage-1 tip text uses the CURRENT chord's quality (`target.chords[run.index].quality`), not chord 1's (`triads-ui.js:213` reads `t.quality`, which is chord 1 here).
- Board: on `target` clear everything; on `step` clear, draw the previous chord's voicing as an outline (`fretboard.showNote(string, fret, 'hint', '', true)` then `classList.add('ghost')` on the returned group) and the notes played so far for this chord as `'correct'`; on `shape` (chord finished) clear, draw the finished chord as the outline, `helpers.blingTop`, `helpers.flashStrip('hit')`, `ctx.bling()`.
- Wrong note: `ctx.buzz()`, `helpers.flashStrip('miss')`, no note name on screen; mark the chord at `target.run.index` as missed for the result card; in a boss also `boss.wrong()`. A wrong note never ends a run.
- Answers: on each `shape` and the final `correct`, `clean = p.firstTry && !p.hinted`; normal runs `store.record(level.id, {firstTry: clean, ms: p.ms})` (a first record that opens the boss shows `Boss round unlocked!` and `hud.confetti()`); boss runs `boss.chordDone(p.ms)`; both `history.recordTriad(chord.quality, {clean, ms: p.ms, hinted: p.hinted})` with `chord = target.chords[p.found - 1]`. No combo, no scoring change (`comboOn` is false in this mode, Task 12).
- Run end (`correct`): fill the result card (`ui.bossEnd*`, same `.boss-end` look): kicker `Progression cleared!` (boss: `Boss round cleared!`; 3 stars `Flawless!`), stars `starsFor(avg ms per chord, mistakes)`, stats `time`, `mistakes`, `chords` (`4 / 4`), next-line = `.mk-path` chips of the chord names with `.miss` and a ` ✗` on missed chords, then `${progId} in ${key} · ${first try or not first try} · ${boss open ? 'Boss open' : `${answered}/${WINDOW} chords toward the boss`}` (boss: `Level N unlocked: title`, `store.completeBoss(...)`); the button reads `Next key` (boss: `Keep going`); show the card, `hud.confetti()` on boss, then stop the session on the next tick exactly as `triads-ui.js finishBoss` does (`setTimeout(() => { if (session.state !== 'idle') ctx.toggleSession(); }, 0)`); the card's button already restarts via `app.js:753`.
- Only Skip fails a run: `onSkip` records `history.recordTriad(quality, {skipped: true})`; a skipped boss calls `boss.fail('skip')`, drops the boss and shows the status `Boss round over: skipping ends it. Try again anytime`.
- Boss start (`#prog-boss-btn`): needs `store.progress(level.id).bossUnlocked`; `createProgressionBoss(level)`; the intro card via `helpers.showIntro('Boss round!', ..., 1800, false)` with `session.holdClock()` before it and `session.restartClock()` after 1800 ms (silent, no `announce`); the strip shows `L${n} · ${key} ${progId}`, `Mistakes` as hearts-label, `${boss.mistakes} ✗`, `Found` replaced by chord counter.
- Path row: tiles in `#prog-map` from `PROG_LEVELS` (`path__tile` markup identical to `triads-ui.js` tiles: `path__num`, `path__names` = `level.short`, `path__mark`), locked tiles open `hud.showLock` (`Path · Level N`, `Beat the L(N-1) boss to open it: ...` same wording as Triads), current tile toggles `#prog-pop` with the stats boxes (`Chords`, `First try`, `Avg per chord`), `hud.setPath({level: {n, sub: title}, note, locked, meter})` with `meter` = boss `{n: chordsDone, of: total, crits}` or `{n: min(answered, WINDOW), of: WINDOW, crits}`.
- `render()`: shows `#prog-path`, `#prog-display-lab`, `#prog-display`, `#prog-chips` and sets `document.body.dataset.prog` only while `active()`; when not active it hides them, removes `data-prog`, and resets the `#found-val` label to `Found`.
- `stopped()` clears the boss and re-renders idle (`Key of ...` is not shown; prompt `Strings 3·2·1` / `Progressions`, status `Press Start, then play each chord low to high, staying close`).

- [ ] **Step 1: Implement `practice/js/progressions-ui.js`** per the behaviour list; mirror the structure of `practice/js/triads-ui.js` (tiles lines 349-420, `renderRow` 389-420, boss 313-346, `onTarget`/`onStep`/`onShape`/`onCorrect`/`onWrong` 150-262).
- [ ] **Step 2: Verify the syntax and pure imports.** Run: `node --check practice/js/progressions-ui.js && node --test practice/tests/progression.test.mjs practice/tests/progression-path.test.mjs practice/tests/session-progression.test.mjs`. Expected: no syntax error, tests pass. (The DOM module cannot load in node; behaviour is proven in Task 13.)
- [ ] **Step 3: Commit**

```bash
git add practice/js/progressions-ui.js
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Practice: Progressions UI"
```

### Task 12: Wire Progressions into Triads and bump the build (Leg 3)

**Files:**
- Modify: `practice/js/triads-ui.js`, `practice/js/app.js` (line 38 `BUILD`), `practice/index.html` (line 2 `data-build`)

**Interfaces:**
- Consumes: `createProgressionsUI(ctx, helpers)` and its returned API (Task 11); `isPath`-style helpers already in `triads-ui.js`.
- Produces: `triads-ui.js` API unchanged in shape; `triads.boss` returns the progressions boss while that mode is on, so `app.js:674 updateBossTimer` keeps working without edits.

- [ ] **Step 1: `triads-ui.js` mode helpers.** Add `isProg = () => active() && settings().triadMode === 'progressions'`; change `isPath` to `settings().triadMode === 'path'` and add `isCustom = () => settings().triadMode === 'custom'`; every existing `!isPath()` that meant Custom becomes `isCustom()` (`grep -n "isPath" practice/js/triads-ui.js` lists all 13 sites; `render()`'s `custom` flag, `customChord` guard, `idleSubject`, `shapesSubject`, `bests`, `saveBests`, `comboKey` are the ones to check).
- [ ] **Step 2: Create and delegate.** After `flashStrip`, `blingTop` and `showIntro` are defined, `const prog = createProgressionsUI(ctx, { flashStrip, blingTop, showIntro })`. Delegations: `pick` -> `prog.pick` when `isProg()`; `onEvent` -> `prog.onEvent` first when `isProg()`; `onSkip`, `stopped`, `cancelBoss`, `renderBossStrip` also call `prog`; `render()` always calls `prog.render()` (it hides itself when inactive) and skips the Triads path row, tip and custom pickers when `isProg()`; returned `get boss()` is `isProg() ? prog.boss : boss`; `comboOn` is false and `comboKey` returns `'boss'` while `isProg()`; `bests` returns `{}` and `saveBests` does nothing while `isProg()`.
- [ ] **Step 3: Third chip.** Add `['progressions', 'Progressions', 'Play chord progressions in a key, staying close from chord to chord']` to the `modePicker` chip list (`triads-ui.js:495-503`; the click handler there must also call `prog.cancelBoss()` next to `boss = null; notice = null;`) and make `render()` set `aria-pressed` from `c.dataset.id === settings().triadMode`.
- [ ] **Step 4: Build bump.** Set `const BUILD = '39';` in `practice/js/app.js` and `data-build="39"` on `<html>` in `practice/index.html`.
- [ ] **Step 5: Verify.** Run: `node --check practice/js/triads-ui.js && node --check practice/js/app.js && grep -n "BUILD = '39'" practice/js/app.js && grep -c 'data-build="39"' practice/index.html && node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs`. Expected: no syntax error, both greps match, all tests pass (count above 292).
- [ ] **Step 6: Commit**

```bash
git add practice/js/triads-ui.js practice/js/app.js practice/index.html
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Practice: Progressions chip in Triads, build 39"
```

---

# Task 13: Headless screenshot verification (after Legs 2 and 3)

**Files:** none changed here; fixes go back to the owning leg's files and are committed with `git commit -m "Fix: <what>"`.

**Setup:** server `http://127.0.0.1:8010/` serves this checkout (check `curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8010/practice/` prints 200). Driver: `node /private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/cdp/shot-m.mjs <url> <prefix> '<steps json>' <W,H>` (steps `{wait, eval, shot}`; it uses debug port 9333, so run captures one at a time). Write the PNGs under the scratchpad `cdp/` folder with prefix `prog-<name>`. Sizes: `1270,625` and `390,844`. A pass needs: no `EXCEPTION` or `EVAL ERR` line from the driver, no horizontal page scroll (`document.documentElement.scrollWidth <= innerWidth` printed by an eval step), and the screenshot matching its mockup's layout.

- [ ] **Step 1: Keys deck, degree card.** URL `.../practice/chords.html`; first eval `localStorage.setItem('practice.chords', JSON.stringify({deck:'keys', defaultsV2:true, boxes:{'K:C:V':0}})); location.reload(); 1`. Shot `keys-degree` once the card tag reads `Keys · degree` (while it reads `Keys · numeral`, click `#btn-reveal` then `#btn-go` to deal another). Expect: Keys radio checked, keypad plus Major/Minor chooser, Natural and Notes-only toggles hidden, Mastered `0/18`.
- [ ] **Step 2: Keys deck, numeral card, and the Why panel.** Deal cards the same way until the tag reads `Keys · numeral`; shot `keys-roman` (six chips I ii iii IV V vi, no wheel). Click a wrong chip, shot `keys-why` (panel with scale over numbers, the exact rule line, the worked line, the chord row; card still unclean, retry possible). Click `Show answer`, shot `keys-reveal` (card flipped to the row, panel visible).
- [ ] **Step 3: Keys first visit.** Eval `localStorage.setItem('practice.chords', JSON.stringify({deck:'keys', defaultsV2:true, boxes:{}})); location.reload(); 1`; shot `keys-intro`. Expect the `How the Keys deck works` panel with the C example before any card; Go dismisses it and deals a card.
- [ ] **Step 4: Progressions, question.** URL `.../practice/`; eval `localStorage.setItem('fretboard-practice.settings.v2', JSON.stringify({mode:'triads', triadMode:'progressions', progDisplay:'names'})); localStorage.removeItem('fretboard-practice.progression-path.v1'); location.reload(); 1`, then `document.getElementById('start-btn').click()` and shot `prog-question` after 3500 ms. Expect: third chip `Progressions` pressed, `Show as` toggle, question line `Key of ... · ... · strings 3·2·1`, chip row with the first chord highlighted, big chord word, Path strip L1..L8, no stale-build banner.
- [ ] **Step 5: Progressions, mid-run with the outline.** Eval feeds the first chord then one note of the second using `window.practice.session.noteDetected(midi)` for each `window.practice.session.target.run.candidates[0].notes[i].midi`; shot `prog-midrun`. Expect the previous chord's dashed outline on the board, current note solid, status `Stay close: ...`, chip 1 done and chip 2 current. Toggle `Numbers` (`document.querySelector('#prog-display [data-id=numbers]').click()`) and confirm the question line and chips switch to numerals without a new question.
- [ ] **Step 6: Wrong note and result card.** Feed a farther shape's first note with `window.practice.session.stableDetected(midi, {fresh: true, heldMs: 300})` after 2 s; expect the red flash, status `Not that one`, no note name, run continues. Finish the run (feed `run.candidates[0]` voicings in turn), shot `prog-result`. Expect the `.boss-end` card `Progression cleared!`, stars, time, mistakes, chords `N / N`, the chord chips with the missed chord marked, a `Next key` button, session stopped.
- [ ] **Step 7: Both sizes.** Repeat Steps 1, 4, 5, 6 at `390,844` (same prefixes with `-390` suffix) and read each PNG. Expect: no clipped text, no horizontal page scroll, chord chips wrap rather than overflow, the Why panel's seven scale columns fit.
- [ ] **Step 8: Boss intro (spot check).** Seed the progression store with 20 clean answers (`localStorage.setItem('fretboard-practice.progression-path.v1', JSON.stringify({current:1, levels:{1:{recent: Array.from({length:20}, () => ({ft:true, ms:1500})), bossUnlocked:true, done:false, stars:0, bestMs:null, bestStreak:0, bestScore:0, tipSeen:true}}}))`), reload, click `#prog-boss-btn`, shot `prog-boss`. Expect the `Boss round!` intro, then the boss strip with `L1 · D I–IV–V` and a `0 ✗` mistakes counter and a 6-chord counter.
- [ ] **Step 9: Full suite.** Run: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs`. Expected: all pass, count above 292.
- [ ] **Step 10: Report.** List the PNG paths, any fix commits, and what could not be verified here (real-guitar detection and the ringing-note feel; the user tests on `http://127.0.0.1:8012/practice/`).
