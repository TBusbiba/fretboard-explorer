# Chord progressions: Keys flashcards + Progressions mode in Triads

Date: 2026-11-07 · Branch: neo-brutalist · Status: draft for review

## Intent

Teach the diatonic chords of major keys two ways: by naming them (flashcards, no guitar) and by playing them as triads in a progression with strict voice leading (inside Triads). Both reuse the Practice page's Game HUD look, the Triads ringing-note rules, and the Path/boss progression style of `triad-path.js`.

## Goals / non-goals / anti-goals

- Goals: major keys only; chords I ii iii IV V vi (never vii°); Numbers or Names display; strict closest-voicing chain; a Path with boss levels; written text over speech.
- Non-goals: minor keys, seventh chords, strumming or rhythm detection, a new tab.
- Anti-goals: speaking every chord; a wrong-note note name on screen; any change to the Triads rules or scoring for the existing modes; touching the main checkout or the frozen copy.

## Shared theory module (new, pure): `practice/js/keys.js`

- `KEY_ORDER = ['C','G','F','D','A','B♭','E♭','E','B','A♭','D♭','F♯']` (intro order; tiers below).
- `DEGREES = ['I','ii','iii','IV','V','vi']`, qualities major/minor/minor/major/major/minor.
- `diatonicChords(keyName)` → six `{degree, root, pc, quality, name}` with letter-correct spelling (reuse `spell` from `practice/js/chords/deck.js:20` or the same algorithm; the builder decides, but one spelling source).
- `degreeOf(keyName, chordName)` → degree or null.
- `PROGRESSIONS`: `I–V–vi–IV`, `I–IV–V`, `ii–V–I`, `vi–IV–I–V`, `I–vi–IV–V` as `{id, degrees:[…]}`.
- `resolveProgression(keyName, progId)` → chords in order.
- Tests: `practice/tests/keys.test.mjs` (every key spells correctly, e.g. F major has B♭ not A♯; E♭ major vi is Cm; no vii° anywhere).

## Part A: "Keys" deck in the Chords tab

- New radio `Keys` beside major/minor/both (`practice/chords.html:41-45`); `DECKS.keys` in `deck.js` (`cardsFor` gets a `keys` branch; the unknown-deck fallback at `deck.js:59` must not swallow it).
- Card ids: `K:C:V` (degree card) and `K:F:Dm` (reverse card). Two card types:
  - `degree`: prompt line 1 `C major`, line 2 `what is the V?`. Answer = root on the existing 12-note wheel plus a two-button major/minor chooser. Correct when pitch class and quality both match. (My call: the chooser is always shown on degree cards; it defaults to nothing selected.)
  - `roman`: prompt `In F major, Dm is…?`. Answer = six chips I ii iii IV V vi. The wheel is hidden.
- Reveal shows the whole diatonic row of that key (`C  Dm  Em  F  G  Am` with numerals under). Key-signature and fretboard steps are skipped for keys cards (`quiz.js:225-305` branches on card type).
- Gradual introduction (new code; Leitner boxes stay as-is, keyed by card id):
  - Key tiers: 1 = C G F · 2 = D A B♭ E♭ · 3 = E B A♭ D♭ F♯.
  - Degree tiers: 1 = I IV V · 2 = ii iii vi.
  - Pool = all cards whose key tier ≤ unlocked key tier and degree tier ≤ unlocked degree tier. Order of unlocks: (keys 1, degrees 1) → (keys 1, degrees 2) → (keys 2, degrees 1) → (keys 2, degrees 2) → (keys 3, …). A tier unlocks when ≥75 % of the current pool is mastered (box ≥ 3). Reverse cards follow the same tiers as their degree card. Unlock state is derived from boxes each time, no extra storage.
  - Tests: pool contents per unlock state; unlock threshold.
- Speech input (`speech.js`) is note-only; for keys cards it fills the root only (my call).

## Part B: "Progressions" mode inside Triads

### Entry and controls
- A third chip `Progressions` in `#triad-mode-picker` (`practice/index.html:54`) next to Path / Custom; settings key `triadMode: 'progressions'`.
- Sub-controls under it: `Show as` toggle **Numbers | Names** (settings `progDisplay`, default Names), and the progression Path strip (levels + boss, same component as the Triads path).

### Question
- Target kind `progression`: `{keyName, progId, group, chords:[…], display}`. The question line reads `Key of G · I – V – vi – IV · strings 3·2·1` (Numbers) or `Key of G · G – D – Em – C · strings 3·2·1` (Names).
- HUD: a chip row for the progression, current chord highlighted, label per toggle; the current chord's name (or numeral) is also the big on-screen word at its turn.
- Voice: nothing by default (my call: no new clips; "little speech"). If a key announcement is wanted later it is one `speak('Key of G')` at question start.

### Playing rules
- Each chord is a triad on the given string group, thickest string first, low to high, through `createTriadMatcher` and the unchanged `stableDetected` rules in `session.js`.
- Chord 1: acceptable voicings = `questionVoicings(root, quality, group)` (any shape).
- Chord n+1: acceptable voicings = the closest shapes to the voicing actually played for chord n: distance = sum over the 3 strings of |fret difference|; all ties accepted. A farther shape's notes do not match the acceptable set, so they count as wrong (buzz + red flash, no name). Open-string frets count as 0.
- Board shows a faint outline of the previous chord's shape while the next chord is pending.
- Pure module `practice/js/progression.js`: `voicingDistance(a,b)`, `closestVoicings(prev, candidates)` (returns all minimal), `chainFrom(startVoicing, chords, group)` for tests, `createProgressionRun(chords, group)` (step/done/wrong feed built on the triad matcher). Test the worked example: G major I–V–vi–IV on 3·2·1 from G4 B3 e3 → D G2 B3 e2 → Em G4 B5 e3 → C G5 B5 e3, all within frets 2–5; and from G7 B8 e7 the chain stays up the neck (every chord's lowest fret ≥ 5).

### Result
- After the last chord: run success or fail; a result card (same `.boss-end` style, `styles.css:752`) with time, mistakes, stars. A run with ≥1 wrong note still finishes but is not first-try.

### Path: `practice/js/progression-path.js`
- Mirrors `triad-path.js` (level shape, `evaluate`, bag, boss, store); storage key `fretboard-practice.progression-path.v1`; same window/threshold constants from `path.js`; same unlock style (next level opens when the current is met; boss sticky).
- Levels (cumulative pool): 1 `I–IV–V` in C G D on 3·2·1 · 2 adds `I–V–vi–IV` · 3 adds `vi–IV–I–V`, `ii–V–I`, `I–vi–IV–V` · 4 adds A E F on 3·2·1 · 5 adds strings 4·3·2 · 6 adds 5·4·3 · 7 adds 6·5·4 · 8 adds B♭ E♭ and the rest.
- Boss per level: one 8-chord run = the level's longest progression played twice through, no stopping; the boss meter and mistake rules of the Triads boss apply.

## Verification

- Pure logic: node tests for keys, pool unlocks, voicing distance, worked example, path evaluate.
- Headless: screenshots at 1270×625 and 390×844 of the Keys deck (both card types) and Progressions (question, mid-run with outline, result card). Build bumped to 39.
- Not verifiable here: real-guitar detection and the ringing-note feel; the user tests on http://127.0.0.1:8012/practice/.

## Left to the builder

- Exact chip/outline CSS within the existing tokens; how the roman chooser reuses the keypad markup; whether `questionVoicings` or `voicingsFor(…, {from:0,to:14})` is the candidate set.

## Decisions from the builder check (my calls; veto any)

| # | Question | Decision |
|---|---|---|
| 1 | Path "answer" unit | One answer per chord: first-try = no wrong note on that chord; time runs from the previous chord's last note (chord 1: from the question). Same window and thresholds as `path.js:15-17`. |
| 2 | Boss run | The level's newest longest progression, on its newest key and string group, played twice through, second pass chained to the last chord (6 chords on level 1, 8 from level 2). |
| 3 | Run fail | Only Skip fails a run. Wrong notes cost first-try and show in the result card. |
| 4 | Level pool | Cumulative: every key × progression × group unlocked so far, newest first in the bag. Level 8 "the rest" = what is left of `KEY_ORDER`. |
| 5 | Matcher | `createProgressionRun` owns "one voicing finishes the chord"; `createTriadMatcher` untouched. Outline = the voicing actually played. |
| 6 | Chords-tab toggles | Natural and Notes-only toggles are hidden and ignored for the Keys deck. |
| 7 | Degree card submit | Auto-check once root and quality are both chosen; wrong = unclean, shake, retry, as `quiz.js:198-210`. |
| 8 | Voice | Progressions is silent whatever the Voice setting; buzz and bling stay. |
| 9 | Chain and Custom | The chain resets every question. Path only, no Custom picker, in this version. |

Builder check verified the worked example against `voicingsFor` 0–14: G4 B3 e3 → D 2·3·2 → Em 4·5·3 → C 5·5·3 with no ties; from G7 B8 e7 every chord sits at fret 5 or higher.
