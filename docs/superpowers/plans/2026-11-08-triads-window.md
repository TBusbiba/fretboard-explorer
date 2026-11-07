# Triads Path: one placed shape per question (fret window) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Triads Path question asks one placed shape of a chord, shows only a shaded fret window on the three strings of the group (no dots), and the player must know where the shape lives; the old "all three shapes" question survives as the boss chain and Custom mode.

**Architecture:** Leg 1 is pure logic in `triad-match.js` / `triad-path.js` (`windowFor`, a bag that deals `(chord, voicingIndex)` pairs). Leg 2 is the UI: a `.fb-window` SVG layer in `fretboard.js`, the Path branch of `triads-ui.js` (one-voicing target with a `window`), and one session rule (no octave-slip acceptance for window questions). The window is only drawn: a note counts only if its pitch is exactly one of the asked voicing's three pitches (`createTriadMatcher([voicing])`, `session.js` `triadDetected`), so the same shape 12 frets up is wrong.

**Tech Stack:** Vanilla ES modules, `node --test` (no DOM tests), SVG board, headless Chrome (CDP) for screenshots.

**Spec:** `docs/superpowers/specs/2026-11-08-triads-window-design.md`

Run all tests from the repo root `/Users/tomybusbiba/fretboard-neo`: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs` (331 pass before this plan).

Commit identity for every commit step: `git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "..."` on branch `neo-brutalist`.

## Global Constraints

- Prompt is the chord name only (`G major`, `A minor`), large; level chip and HUD stay. No "Start on the X string" kicker, no "now string N", no fret or string words in the prompt, status or tip of a window question.
- No target dots before a hint. Hint (H, or after the existing hint delay) draws all three dots of the asked voicing; the stage-1 tip keeps only the quality line (`Major: root, 3rd, 5th.` / `Minor: root, ♭3rd, 5th.`).
- Window rule: extend `from` down and `to` up until the next fret in that direction lies inside another voicing's fret span (lowest to highest fret) of the same chord and group, or the board edge (0 and `maxFret`). `maxFret` defaults to `max(12, highest fret in the voicings list)` (the `questionVoicings` list, frets 0-12, up to 14). Returns `{from, to}` inclusive.
- `shapeIndex` = position in `questionVoicings(root, quality, group)`. Each placed voicing is its own question (Em on 3·2·1 and G on 4·3·2 have a shape copy at fret 0 and again at 12, so 4 questions).
- Bag: newest-string-group-first order is kept; every `(chord, shapeIndex)` of the level is dealt once before repeating.
- Scoring per answer (first try, time), `WINDOW`, thresholds, stars, and store key `fretboard-practice.triad-path.v1` unchanged (no migration). Same ringing-note tolerance.
- Custom mode and the boss chain keep today's behaviour (all shapes, `createTriadMatcher(allVoicings)`, octave slips accepted). Boss intro says "All three shapes". Progressions mode (`progressions-ui.js`) untouched.
- Build bump 39 -> 40 in `practice/js/app.js:38` and `practice/index.html:2` together.
- Do not edit files outside the task's list; do not touch `practice/js/progressions-ui.js`.

## Review Focus

Failure modes the spec implies; each has its test in the owning task.

1. Shape at fret 0 or at the top of the neck: window must clamp at 0 and at `maxFret`, never go negative or past the last used fret (Task 1: Em 3·2·1 real data, synthetic shape at fret 14).
2. Same shape played 12 frets up (right note names, wrong octave): must be wrong, not accepted as an octave slip (Task 3).
3. Chord with four placed voicings (Em 3·2·1, G 4·3·2): each copy is its own question and windows of the copies at 0 and 12 do not swallow each other (Tasks 1 and 2).
4. A first note belonging to another shape of the same chord: wrong, no step (Task 3). Bag refill must not deal the same `(chord, shapeIndex)` twice in a row, and a level change must restart the bag (Task 2).
5. Window left shaded after Stop, a mode switch (Custom, Progressions) or the boss chain; hint dots surviving into the next question (Tasks 5 and 6, checked in the headless run).

---

## Leg 1: pure logic

### Task 1: `windowFor`

**Files:**
- Modify: `practice/js/triad-match.js` (add after `questionVoicings`, ~line 53)
- Test: `practice/tests/triad-match.test.mjs` (import `windowFor`, append tests)

**Interfaces:**
- Consumes: `questionVoicings(rootPc, quality, groupId)` -> `{shape, notes:[{fret,...}], lowestFret}[]`.
- Produces: `windowFor(voicings, index, { maxFret } = {}) -> { from: number, to: number }`; `maxFret` defaults to `Math.max(12, highest fret over all notes of all voicings)`. Only reads `voicings[i].notes[k].fret`.

- [ ] **Step 1: Write the failing tests**

Add `windowFor` to the existing import. Helper `const syn = (...frets) => ({ notes: frets.map(fret => ({ fret })) });` and `const NOTE = (n) => NOTE_NAMES.indexOf(n)` (import `NOTE_NAMES` from `../js/notes.js` if absent).

```js
test('windowFor: G major on 3·2·1 (shapes at 3-4, 7-8, 10-12) gives 0-6, 5-9, 9-12', () => {
  const vs = questionVoicings(NOTE('G'), 'major', '321');
  assert.deepEqual(vs.map((_, i) => windowFor(vs, i)), [{ from: 0, to: 6 }, { from: 5, to: 9 }, { from: 9, to: 12 }]);
  assert.deepEqual(windowFor(vs, 2, { maxFret: 15 }), { from: 9, to: 15 });
});
test('windowFor: E minor on 3·2·1 has an open shape (window starts at 0) and a copy at 12', () => {
  const vs = questionVoicings(NOTE('E'), 'minor', '321');
  assert.equal(vs.length, 4);
  assert.deepEqual(vs.map((_, i) => windowFor(vs, i)),
    [{ from: 0, to: 2 }, { from: 1, to: 6 }, { from: 6, to: 11 }, { from: 10, to: 12 }]);
});
test('windowFor: a shape at the top ends at maxFret (default follows the highest fret)', () => {
  const vs = [syn(2, 3, 3), syn(14, 14, 12)];
  assert.deepEqual(windowFor(vs, 1), { from: 4, to: 14 });
  assert.deepEqual(windowFor([syn(2, 3, 3), syn(9, 9, 8)], 1), { from: 4, to: 12 });
});
test('windowFor: two adjacent shapes with one free fret between them share that fret', () => {
  const vs = [syn(2, 3, 3), syn(5, 6, 5)];
  assert.deepEqual(windowFor(vs, 0), { from: 0, to: 4 });
  assert.deepEqual(windowFor(vs, 1), { from: 4, to: 12 });
});
test('windowFor: a lone shape spans the whole board; touching shapes get no extra room', () => {
  assert.deepEqual(windowFor([syn(3, 4, 3)], 0), { from: 0, to: 12 });
  assert.deepEqual(windowFor([syn(2, 3, 3), syn(4, 5, 5)], 0), { from: 0, to: 3 });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test practice/tests/triad-match.test.mjs`
Expected: FAIL (`windowFor` is not exported / not a function).

- [ ] **Step 3: Implement `windowFor(voicings, index, { maxFret })` in `practice/js/triad-match.js`**

Span of a voicing = min..max of its note frets. Start from the asked voicing's span; step `from` down while `from > 0` and `from - 1` is outside every other voicing's span; step `to` up while `to < maxFret` and `to + 1` is outside every other span. JSDoc it as "the stretch of frets shaded for one placed shape". Update the `createTriadMatcher` JSDoc one-liner to say "(all shapes of a chord, or one placed shape for a Path question)".

- [ ] **Step 4: Run to verify it passes**

Run: `node --test practice/tests/triad-match.test.mjs`
Expected: PASS (all previous tests plus 5 new).

- [ ] **Step 5: Commit**

```bash
git add practice/js/triad-match.js practice/tests/triad-match.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Triads: windowFor, the fret stretch of one placed shape"
```

### Task 2: bag of `(chord, voicingIndex)` pairs

**Files:**
- Modify: `practice/js/triad-path.js` (replace `createTriadBag`, lines ~76-96; rewrite the header comment lines 1-3 and the boss comment so they say "Path questions are one placed shape; the boss asks every shape of a new chord")
- Test: `practice/tests/triad-path.test.mjs` (replace the `bag:` test at line ~59, update the import)

**Interfaces:**
- Consumes: `questionVoicings`, `chordKey`, `TRIAD_LEVELS` (`level.pool`, `level.group`, `level.id`).
- Produces: `createTriadShapeBag(rng = Math.random, voicingsOf = (c) => questionVoicings(c.root, c.quality, c.group)) -> { next(level): { root, quality, group, shapeIndex } | null }`. `createTriadBag` is removed (its only caller is `triads-ui.js`, switched in Task 5). Exported helper `shapeKey = (q) => \`${chordKey(q)}#${q.shapeIndex}\``.

- [ ] **Step 1: Write the failing tests**

Replace the `bag:` test and the `createTriadBag` import with `createTriadShapeBag, shapeKey`. Reuse the file's `seq`, `pc`, `TRIAD_LEVELS`.

```js
const total = (level, group) => level.pool.filter(c => !group || c.group === group)
  .reduce((n, c) => n + questionVoicings(c.root, c.quality, c.group).length, 0);

test('bag: every (chord, placed shape) once before repeats, newest group first', () => {
  const bag = createTriadShapeBag(seq(0.3, 0.7, 0.1));
  const l5 = TRIAD_LEVELS[4], n = total(l5);
  const asked = Array.from({ length: n }, () => bag.next(l5));
  assert.equal(new Set(asked.map(shapeKey)).size, n);
  assert.ok(asked.slice(0, total(l5, '432')).every(q => q.group === '432'), 'newest group first');
  assert.ok(asked.every(q => Number.isInteger(q.shapeIndex) && q.shapeIndex >= 0));
  assert.equal(createTriadShapeBag(() => 0.5).next(TRIAD_LEVELS[0]).group, '321');
});
test('bag: a chord with four placed shapes (E minor 3·2·1) is dealt four times, indexes 0-3', () => {
  const bag = createTriadShapeBag(seq(0.4, 0.8, 0.2));
  const l2 = TRIAD_LEVELS[1];
  const em = Array.from({ length: total(l2) }, () => bag.next(l2)).filter(q => q.root === pc('E') && q.quality === 'minor');
  assert.deepEqual(em.map(q => q.shapeIndex).sort(), [0, 1, 2, 3]);
});
test('bag: a refill never repeats the same (chord, shape) back to back; a level change restarts the bag', () => {
  const bag = createTriadShapeBag(() => 0.5);
  const l1 = TRIAD_LEVELS[0], n = total(l1);
  const keys = Array.from({ length: n * 3 }, () => shapeKey(bag.next(l1)));
  keys.slice(1).forEach((k, i) => assert.notEqual(k, keys[i]));
  const l2 = TRIAD_LEVELS[1];
  const next = Array.from({ length: total(l2) }, () => bag.next(l2));
  assert.equal(new Set(next.map(shapeKey)).size, total(l2));
});
test('bag: an empty pool returns null', () => {
  assert.equal(createTriadShapeBag().next({ id: 99, group: '321', pool: [] }), null);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test practice/tests/triad-path.test.mjs`
Expected: FAIL (`createTriadShapeBag` is not exported).

- [ ] **Step 3: Implement `createTriadShapeBag` in `practice/js/triad-path.js`**

Same structure as the old `createTriadBag` (shuffle with injected `rng`, reset when `level.id` changes, newest-group entries shuffled first then the rest shuffled, rotate the head when it equals the last dealt on a refill), but the bag holds `{ root, quality, group, shapeIndex }` built from `voicingsOf(chord).map((_, shapeIndex) => ...)` for each pool chord, and repeats are compared with `shapeKey`. Delete `createTriadBag`.

- [ ] **Step 4: Run to verify it passes, then the full suite**

Run: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs`
Expected: PASS, 0 failures (the app is not loaded by node tests, so the stale `triads-ui.js` import does not matter until Task 5).

- [ ] **Step 5: Commit**

```bash
git add practice/js/triad-path.js practice/tests/triad-path.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Triads path: the bag deals every placed shape of a chord once"
```

---

## Leg 2: UI (starts after Tasks 1 and 2 are committed)

### Task 3: window questions accept only their own voicing

**Files:**
- Modify: `practice/js/session.js` (`slipOf`, ~line 196; the comment above it, ~line 193)
- Test: `practice/tests/session-triads.test.mjs` (extend the `make` helper, append tests)

**Interfaces:**
- Consumes: a triad target `{ rootPc, quality, group, kind, voicings: [voicing], window: {from, to} }` from the `pickTriad` hook (shape produced by Task 5; the session only checks that `target.window` is truthy).
- Produces: for a target with `window`, `session.matcher = createTriadMatcher(target.voicings)` as today, no octave-slip acceptance (`slipOf` returns `undefined` for `target.run` or `target.window`), one `correct` event with `total: 1`, no `shape` event.

- [ ] **Step 1: Write the failing tests**

Change `make(voicings)` to `make(voicings, extra = {})` and spread `...extra` into the target returned by `pickTriad`. Append (uses `voicingsFor(7, 'major', '321')`: G shapes at frets 4·3·3, 7·8·7, 12·12·10; `const WIN = { from: 0, to: 6 }`):

```js
test('triads window: the same shape 12 frets up is wrong, not an octave slip', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  const up = vs[0].notes[0].midi + 12;
  session.noteDetected(up);
  assert.equal(session.step, 0);
  assert.equal(events.filter(e => e[0] === 'step').length, 0);
  session.stableDetected(up, HELD);
  assert.equal(wrongs(events), 1);
});
test('triads window: the first note of another shape of the chord is wrong, not a step', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  session.noteDetected(vs[1].notes[0].midi);
  assert.equal(session.step, 0);
  session.stableDetected(vs[1].notes[0].midi, HELD);
  assert.equal(wrongs(events), 1);
});
test('triads window: playing the one shape resolves the question (correct, total 1, no shape event)', () => {
  const vs = voicingsFor(7, 'major', '321');
  const { session, events } = make([vs[0]], { window: WIN });
  vs[0].notes.forEach(n => session.noteDetected(n.midi));
  const last = events[events.length - 1];
  assert.equal(last[0], 'correct');
  assert.equal(last[1].total, 1);
  assert.equal(events.filter(e => e[0] === 'shape').length, 0);
  assert.equal(session.state, 'resolved');
});
```

`wrongs` is defined mid-file in the existing test file; place the new tests after it.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test practice/tests/session-triads.test.mjs`
Expected: the first new test FAILS (`session.step` is 1: the +12 slip is accepted). The other two may already pass.

- [ ] **Step 3: Make `slipOf` return `undefined` when `session.target.window` is set**

Extend the existing guard (`session.target && session.target.run`) with `|| session.target.window`. Reword the comment above `nearMidis` to "the chord in every shape of `target.voicings` (all three, or one placed shape when `target.window` is set)".

- [ ] **Step 4: Run to verify it passes**

Run: `node --test practice/tests/session-triads.test.mjs practice/tests/session.test.mjs practice/tests/session-progression.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add practice/js/session.js practice/tests/session-triads.test.mjs
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Triads: a window question counts only its own voicing, no octave slips"
```

### Task 4: the fret-window layer on the board

**Files:**
- Modify: `practice/js/fretboard.js` (new group before `fb-heat`, ~line 99; two methods on `api`, after `clearBox`)
- Modify: `practice/styles.css` (rules next to `.fb-box__frame`, ~line 1101, and a `.p-hud` variant next to `.p-hud .fb-box__frame`, ~line 1385)

**Interfaces:**
- Consumes: `fretX`, `stringY`, `NUT_X` inside `fretboard.js`.
- Produces: `fretboard.showWindow(strings: number[], from: number, to: number): void` (replaces any previous window; `strings` are string indices as in `stringGroupById(g).strings`) and `fretboard.clearWindow(): void`. Layer `<g class="fb-window">` holding one `<rect class="fb-window__rect">`, under the dots, `pointer-events: none`. Other pages that call `createFretboard` (vibrato, chords quiz) only get an empty group.

- [ ] **Step 1: Implement the layer and the two methods**

Rect geometry: `x = from === 0 ? NUT_X - 56 : fretX(from - 1)`, `width = fretX(to) - x`, `y = stringY(minIndex) - 22`, `height = stringY(maxIndex) + 22 - y`, `rx` 6. The group is created right before the `heat` group so it sits above strings and below notes. `clearWindow` empties the group.

- [ ] **Step 2: Style it**

`.fb-window__rect`: translucent `var(--nb-yellow)` fill (about 30% via `color-mix(in srgb, var(--nb-yellow) 30%, transparent)`), 2px `var(--nb-yellow)` stroke, `pointer-events: none`, no animation. `.p-hud .fb-window__rect`: same hue, readable on the charcoal board (`--nb-board`); pick the percentage by looking at the screenshot in Step 3.

- [ ] **Step 3: Verify in the browser**

Run: `node /private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/cdp/shot-m.mjs http://127.0.0.1:8010/practice/ /private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/triads-window/layer '[{"eval":"practice.fretboard.showWindow([2,1,0],3,8); document.querySelectorAll(\".fb-window__rect\").length"},{"wait":300,"shot":"on"},{"eval":"practice.fretboard.clearWindow(); document.querySelectorAll(\".fb-window__rect\").length"}]' 1270,625`
Expected: prints `eval: 1` then `eval: 0`, no `EXCEPTION` lines; open `layer-on.png` with the Read tool: a shaded rectangle across strings 3·2·1 from fret 3 to fret 8, over the strings, under no dots. (Create the output folder first: `mkdir -p .../scratchpad/triads-window`.) The page is served from the working tree, so no build bump is needed yet; if the stale banner shows, do Task 5 Step 5 first.

- [ ] **Step 4: Commit**

```bash
git add practice/js/fretboard.js practice/styles.css
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Practice board: a shaded fret-window layer"
```

### Task 5: Path asks one placed shape (triads-ui) and build bump

**Files:**
- Modify: `practice/js/triads-ui.js` (header comment lines 1-4; imports; `levelTip` line 40; `bag` line 49; `pick` ~98-110; `paintBoard` ~126; `onTarget` ~169-202; `onStep` ~204; `onHint` ~215; `onCorrect` ~258; `stopped` ~308; `renderIdle` ~591; `render` ~601)
- Modify: `practice/js/app.js:38` (`BUILD = '40'`)
- Modify: `practice/index.html:2` (`data-build="40"`)

**Interfaces:**
- Consumes: `windowFor(voicings, index)` (Task 1), `createTriadShapeBag().next(level)` -> `{root, quality, group, shapeIndex}` (Task 2), `fretboard.showWindow(strings, from, to)` / `clearWindow()` (Task 4), session rule for `target.window` (Task 3).
- Produces: Path targets `{ rootPc, quality, group, voicings: [voicing], kind: 'normal', levelId, window: {from, to}, shapeIndex }`; boss and Custom targets are unchanged and carry no `window`.

- [ ] **Step 1: Switch the Path pick**

Import `windowFor` from `./triad-match.js` and `createTriadShapeBag` (replacing `createTriadBag`) from `./triad-path.js`. In `pick`, the Path branch: `const q = bag.next(level())`, null when none; `const all = allVoicings(q)`; return `asTarget(q, [all[q.shapeIndex]], 'normal', { window: windowFor(all, q.shapeIndex), shapeIndex: q.shapeIndex })`. Boss and Custom branches stay as they are. Add `const windowed = (t) => !!(t && t.window)`.

- [ ] **Step 2: Window questions in `onTarget`, `onStep`, `onCorrect`, `paintBoard`**

Add a module-level `let hintDots = false`; `onTarget` resets it and calls `fretboard.clearWindow()` first for every target.

| Place | Windowed target | Other targets |
|---|---|---|
| `onTarget` window | `fretboard.showWindow(g.strings, t.window.from, t.window.to)` | none |
| `onTarget` prompt | `ctx.setPrompt('', name, 'listening')` | unchanged |
| `onTarget` scroll | `ctx.scrollBoardTo(t.window.from)` | `scrollBoardTo(5)` |
| `onTarget` status | `Play the shape in the shaded area, low to high` | `Play all 3 shapes, any order · each one low to high` |
| `onTarget` boss intro start text | n/a | `All three shapes · start on the ${stringLabel} string —` (use `all ${it.shapes} shapes` only when `it.shapes !== 3`) |
| `onStep` status | `${p.step} of 3 ✓` | unchanged (`... — now string N`) |
| `onCorrect` status | `Shape ✓ · ${(p.ms / 1000).toFixed(1)} s${extra}` | unchanged |
| `paintBoard` | when `hintDots` and the target is windowed, first draw all three notes of `session.target.voicings[0]` as `'hint'` dots with `DEGREE_LABELS[n.degree]`, then the played/found notes as today (they replace the hint dot at the same spot) | unchanged |

- [ ] **Step 3: Hint for window questions**

In `onHint` for a windowed target: stage 1 `ctx.setTip` with only the quality line plus `Play it low to high.` (no string word); stage 2 sets `hintDots = true`, calls `paintBoard()`, `ctx.setStatus('Here is the shape')`, and adds `is-done` to `ui.ring` as today. Non-windowed targets keep the current behaviour (current-step dot, status with string and fret).

- [ ] **Step 4: Clean-up of the window and copy**

- `fretboard.clearWindow()` and `hintDots = false` at the top of `stopped()` (before the Progressions early return) and in `render()` whenever `!(on && isPath())`.
- `renderIdle` in Path mode: status `Press Start, then play the shape in the shaded area, low to high`; Custom keeps its text.
- `levelTip` level 1: line `Every chord comes in three close shapes. A shaded stretch of the neck on strings ${g} marks where one of them lives: start on the ${low} string, then the next two, low to high.` and note `Hint (H) lights the notes; Shapes (top right) draws all three.` Other levels' tips stay.
- Header comment (lines 1-4): Path asks one placed shape in a shaded window; Custom and the boss ask all three shapes.

- [ ] **Step 5: Bump the build**

`practice/js/app.js:38`: `const BUILD = '40';`; `practice/index.html:2`: `data-build="40"`.

- [ ] **Step 6: Run the suite and a headless smoke**

Run: `node --test practice/tests/*.test.mjs chordmap/tests/*.test.mjs`
Expected: PASS, 0 failures (about 340 tests).

Run: `node /private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/cdp/shot-m.mjs http://127.0.0.1:8010/practice/ /private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/triads-window/smoke '[{"eval":"localStorage.setItem(\"fretboard-practice.settings.v2\", JSON.stringify({mode:\"triads\",triadMode:\"path\",voice:false})); location.reload()"},{"wait":2000,"eval":"document.getElementById(\"start-btn\").click()"},{"wait":2500,"eval":"JSON.stringify({w: practice.session.target.window, n: practice.session.target.voicings.length, rects: document.querySelectorAll(\".fb-window__rect\").length, stale: !document.getElementById(\"stale\") || document.getElementById(\"stale\").hidden})"}]' 1270,625`
Expected: prints `eval:` JSON with `n: 1`, a `w` object, `rects: 1`, `stale: true`, and no `EXCEPTION` or `EVAL ERR` lines.

- [ ] **Step 7: Commit**

```bash
git add practice/js/triads-ui.js practice/js/app.js practice/index.html
git -c user.name="Tomy Busbiba Ratoshnik" -c user.email="tomybusbiba@Tomys-Macbook.local" commit -m "Triads path: one placed shape per question in a shaded fret window (build 40)"
```

### Task 6: headless screenshots and cleanup checks

**Files:**
- Create (not committed): PNGs in `/private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/triads-window/`
- No source edits; if a screenshot shows a defect, report it to the coordinator instead of patching.

**Interfaces:**
- Consumes: the shipped UI of Task 5, `window.practice` (`session`, `triads`, `fretboard`), `shot-m.mjs <url> <prefix> '<steps json>' W,H` at `/private/tmp/claude-502/-Users-tomybusbiba-fretboard-explorer/21a3f9de-492a-4437-bb1d-50a47c7e7088/scratchpad/cdp/shot-m.mjs` (fresh Chrome profile per run, so every run seeds its own localStorage).
- Produces: eight PNGs (four states x two sizes) and the cleanup check results.

- [ ] **Step 1: Window question, no dots, then hint, then wrong note**

For each size `1270,625` (prefix `d`) and `390,844` (prefix `m`), run `shot-m.mjs http://127.0.0.1:8010/practice/ <scratchpad>/triads-window/<prefix> '<steps>' <size>` with these steps, in order: seed `fretboard-practice.settings.v2` with `{mode:"triads",triadMode:"path",voice:false}` and reload; click `#start-btn`; wait 2500 and `shot: "1-window"`; eval `practice.session.showHint(); practice.session.showHint()`, wait 400, `shot: "2-hint"`; eval `practice.session.stableDetected(practice.session.target.voicings[0].notes[0].midi + 12, {fresh:true, heldMs:400})`, wait 150, `shot: "3-wrong"`.
Expected (open each PNG with Read): `1-window` shows the chord name large, no "Start on the X string" line, a shaded stretch on three strings, no dots; `2-hint` shows three dots inside the shade; `3-wrong` shows the red miss flash on the strip and a "Not that one" status, no note name; no `EXCEPTION` lines; nothing clipped at 390 px.

- [ ] **Step 2: Boss intro**

Same sizes, prefixes `d` and `m`, steps: seed settings as above plus `localStorage.setItem("fretboard-practice.triad-path.v1", JSON.stringify({current:1,levels:{1:{bossUnlocked:true}}}))`, reload; click `#start-btn`, wait 2500; eval `practice.triads.startBoss()`, wait 500, `shot: "4-boss-intro"`.
Expected: the intro card reads "Boss round!", the chord, and "All three shapes · start on the ... string"; the board has no window shade (eval `document.querySelectorAll(".fb-window__rect").length` prints `0` in the same run).

- [ ] **Step 3: Cleanup and Custom checks (one run at 1270,625)**

Steps: seed Path settings, reload, start, wait 2500, eval rect count (expect 1); eval `document.getElementById("start-btn").click()` (Stop), wait 400, eval rect count (expect 0); start again, wait 2500, eval `document.querySelector("#triad-mode-picker .chip[data-id=custom]").click()` (switch to Custom), wait 1500, eval `JSON.stringify({w: practice.session.target && practice.session.target.window, rects: document.querySelectorAll(".fb-window__rect").length, n: practice.session.target && practice.session.target.voicings.length})`.
Expected: rect counts `1`, `0`; after switching to Custom `w` undefined, `rects: 0`, `n` 3 (or 4 for a four-shape chord): Custom still asks all shapes with no shade. Do the same switch to `progressions` (`data-id=progressions`) and expect `rects: 0`.

- [ ] **Step 4: Report**

No commit. Return the PNG paths and the check results to the coordinator.

---

## Self-review (run after writing)

- **Spec coverage:** window rule and its four tests (Task 1); chord-name-only prompt, shaded layer, no dots, step status without fret numbers, hint dots, stage-1 tip (Tasks 4, 5); one-shape-per-question bag, scoring/store unchanged, boss "All three shapes", Custom unchanged (Tasks 2, 5, 6); matcher with one voicing and wrong note outside (Task 3); build bump 39 -> 40 and the headless list (Tasks 5, 6). The spec's "9-15" top window becomes 9-12 by decision (default `maxFret` = `max(12, highest fret)`); the 9-15 case is still asserted with an explicit `maxFret: 15`.
- **Decisions beyond the spec text:** other shapes block by their whole fret span (identical to "used" on every real chord and on the spec example); "new shapes first" is read as newest string group first, as the old bag did; `shapeIndex` is the list position, not the shape number 1-3.
- **Types:** `windowFor` -> `{from, to}`; `bag.next` -> `{root, quality, group, shapeIndex}`; target `window` / `shapeIndex`; `showWindow(strings, from, to)` / `clearWindow()` are named the same in Tasks 4, 5, 6.
- **Proportion:** the plan is about four times the spec's length, almost all of it test assertions and a copy table; no function bodies are written out.
