# Triads Path: one placed shape per question (fret window)

Date: 2026-11-08 · Branch: neo-brutalist · Status: approved in chat

## Intent

Today a Triads Path question asks for all three shapes of one chord, with the target dots drawn. The player follows dots and does not learn where the shapes live. Replace it with: one shape per question, no dots, only a shaded fret window on the three strings of the group. The player must know the shape. The "all three shapes" question survives as the boss chain.

## Goals / non-goals

- Goals: a window per question, as wide as possible without overlapping another shape of the same chord on the same string group; minimal text (chord name only); same playing rules and ringing-note tolerance; same scoring, unlock rules, stars and store; Custom mode unchanged.
- Non-goals: parent-chord hints (dropped after discussion), changing Progressions, changing voice.
- Anti-goals: fret or string words in the prompt ("frets 1–4", "strings 3·2·1" are not written); dots visible before a hint.

## Window rule (pure, tested)

`windowFor(voicings, index, {maxFret=15})` in `practice/js/triad-match.js` (or a new `triad-window.js`, builder's call):
- `lo` = the shape's lowest fret, `hi` = its highest fret.
- Extend `lo` down and `hi` up until the next fret in that direction is used by any other shape of the same chord on the same group, or the board edge (0 and `maxFret`).
- Returns `{from, to}` inclusive. Example G major 3·2·1: shapes at 3–4, 7–8, 10–12 → windows 0–6, 5–9, 9–15 (a fret shared by nobody can belong to two windows; that's fine, the asked shape is the only one fully inside its window).
- Tests: the G example; a chord with an open-string shape (window starts at 0); a shape at the top (window ends at `maxFret`); two shapes adjacent with one free fret between them.

## Question and board

- Prompt: the chord name only (`G major`, `A minor`), large. The level chip and HUD stay.
- Board: the three strings of the group are lit as today; frets `from`–`to` on those strings get a translucent shade (new `.fret-window` layer in `fretboard.js`, scoped to the Practice board). No target dots.
- Status line: as today for step progress ("1 of 3 ✓"), no fret numbers.
- Correct note outside the window = wrong (buzz + red flash, no name). The match uses `createTriadMatcher([thatVoicing])` so only that shape counts; octave slips are still accepted only when they land inside the window.
- Hint (H or after the existing hint delay): draws the triad dots inside the window, as the current stage-2 reveal. Stage-1 "quality" tip stays.

## Path

- Each Path question = one shape: `{rootPc, quality, group, shapeIndex}`. The bag deals every (chord, shape) of the level once before repeating; new shapes first.
- Scoring per answer (first-try, time) unchanged; `WINDOW`, thresholds and stars unchanged; store `fretboard-practice.triad-path.v1` entries keep their shape (no migration).
- Boss: the current chain ("all three shapes of each chord, in order, no dots") stays as the boss round. The boss intro says "All three shapes".
- Custom mode: unchanged (still asks all three shapes with dots), so the old behaviour is one click away.

## Verification

- Node tests for `windowFor` and the bag; the existing triad tests stay green.
- Headless: Path question with the window and no dots, after a hint, after a wrong note outside the window, boss intro; 1270×625 and 390×844. Build bump 39 → 40.
- Deviation: no octave slips on window questions.
- Not verifiable here: the feel on a real guitar.
