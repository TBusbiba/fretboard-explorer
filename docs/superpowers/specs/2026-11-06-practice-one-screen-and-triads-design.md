# Practice: one-screen layout, chain voice, Triads overhaul

Approved by the user 2026-11-06 from the mock-ups (scratchpad practice-one-screen.html, panels A–E).
Builds on 2026-11-05-find-the-note-overhaul-design.md (Find the note is the reference for feel).

## 1. Find the note: quieter chains, string names later

- In a note chain, after the intro, each prompt says only the string: "String 3!" (the note is
  known). Normal questions are unchanged.
- From Path level 6 on (and in Custom when a new setting "Say string names" is on), prompts use
  string names instead of numbers: "A string, C!", "Low E string, F sharp!", "High E string, B!";
  chains say "A string!". The level-6 tip card mentions the switch. The on-screen label follows the
  same rule.
- New ElevenLabs clips (Adam, same styles as tools/make-voice.mjs): "String 1!"…"String 6!",
  6 string names × 12 notes, and the 6 "<name> string!" chain prompts. Bump CLIP_REV.

## 2. One-screen Practice (all modes)

Target: at a 1270×625 viewport, header + mode tabs + level row + prompt + full-size fretboard +
controls are all visible (mock-up A measured 606px). Layout per the mock-up:

- Mode tabs: one thin row. Path/Custom chips at its right.
- Path: one row of small level chips (number, short name, stars; current highlighted, locked
  dimmed), Boss chip and Tip button at the end. Replaces the tall tile map and the stats strip;
  level stats move into the chip's tooltip / a small popover.
- Prompt: a strip ~130px: left = string label + big note (~88px), middle = title/status line,
  right = timer, combo, score, streak blocks. Shouts/heat keep working on the strip.
- Fretboard unchanged in size. Controls (mic meter, Hint / Start-Stop / Skip) right under it.
- Stats, heat map: below the fold, unchanged.
- Focus during a Boss round: the tabs and level row collapse into one boss bar (name, n of m,
  stars pace bar, timer) — mock-up B.
- Phone (390px): same order stacked, chips scroll sideways, board scrolls as today (mock-up E).

## 3. Triads overhaul

Simple on purpose: major and minor only, one game, no inversion choices.

### The game
- Prompt: "C major · strings 3·2·1". Play the 3 notes low to high; **any of the 3 close-voiced
  shapes** on those strings within frets 0–12 counts. Answer matching: exact MIDI; the first note
  narrows the candidate voicings, later notes must continue one of them. Three step dots.
- The board emphasises the 3 strings in play and fades the rest (mock-up C).
- Streak, combo, points, shouts, heat, voice, answer clock exactly as Find the note.

### Path (cumulative, naturals first)

| Level | Strings | Adds | Chords |
|---|---|---|---|
| 1 | 3·2·1 | C F G | 3 |
| 2 | 3·2·1 | Am Dm Em | 6 |
| 3 | 3·2·1 | D A E | 9 |
| 4 | 3·2·1 | B, Cm Fm Gm Bm (all naturals) | 14 |
| 5 | +4·3·2 | C F G Am Dm Em on 4·3·2 | |
| 6 | 4·3·2 | all naturals on 4·3·2 | |
| 7–8 | +5·4·3 | same two steps | |
| 9–10 | +6·5·4 | same two steps | |
| 11 | all groups | sharp/flat roots, major + minor | 24 |

Earlier groups stay in the question pool. Unlock as Find the note (last 20: ≥75% first try,
avg ≤6 s per triad) plus coverage: each of the 3 shapes found at least once for each quality on
the level's newest group; the level row shows the 3 shape dots lighting up, and when the player
repeats a covered shape the status nudges "Try another shape". Boss: every shape of the level's
new chords, left to right up the neck, timer and stars like Find the note.

Chain equivalent, "Climb the neck": every 6–9 questions, one chord in all 3 shapes in order up
the neck, intro "Climb the neck! C major!", hint between steps "+N frets".

### Show shapes, big
- Panel replaces the prompt strip while open (mock-up D): the 3 shapes of the current quality on
  the current group, each a large 3-string diagram (≈300px, discs ≈22px, R / 3 / ♭3 / 5 labels,
  root salmon, others cyan, no note names).
- **Distances:** between consecutive diagrams an arrow "→ +N frets" (N = how far the next shape
  sits above the previous one, measured on the same root's positions), and each diagram shows its
  frets relative to shape 1 so the player knows where to place the next one. After shape 3, "+N
  frets → shape 1 again (an octave up)".

### Removed
Triad type chips beyond Major/Minor, all inversion chips and sub-modes, 7 shells. Custom keeps:
Major/Minor chips and the string-group chips. "Play the notes" moves to Settings.

### Voice
New clips: "<Root> major!" / "<Root> minor!" (12 roots each, sharps spoken "C sharp"), "Strings
3 2 1!" ×4 groups, "Climb the neck!", "Find every shape!".

## Left to the builder
Exact copy, sizes within the mock-up, code structure following practice/js/path.js (pure rules +
tests) and practice/js/app.js (UI); a separate triad path store key.
