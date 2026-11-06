# Practice: Scales

Approved direction from the user 2026-11-06. Reference for feel: Find the note (path, streaks,
voice, one-screen layout) and the Triads overhaul.

## The game
- Prompt: "A minor pentatonic · box 1". The first note is shown on the board; the player plays
  the scale in that box up, then back down. Each note lights up on the board as it is played.
- A run is short (≈15–30 s). Score: total time, evenness of timing, soft mistakes.
- Drill mode: pick any scale + root + box and loop up-and-down continuously, no levels, no
  game pressure; a run counter and the last run's time.

## Shapes
Minor pentatonic in the 5 standard movable boxes (the common chart: box 1 = root on the low E
string under the index finger, 2 notes per string; boxes 2–5 continue up the neck and box 5 leads
back to box 1 an octave up — the CAGED-linked set). Major pentatonic uses the same 5 boxes with
the relative-major root highlighted. Major scale (5 CAGED positions, 3 notes per string where
the standard shapes do) comes later in the path.

## Listening rules (ringing notes must never nag)
- Listen only for the expected next note; advance as soon as it is heard, even if the previous
  note is still ringing.
- Pitches of the last 2 notes played are ignored entirely.
- A wrong note counts only after a fresh attack (practice/js/attack.js) and a stable hold of
  ≈250 ms, and only if it is neither expected nor recently played.
- Octave slips toward the expected note are accepted (same expected-aware correction as Find the
  note).
- Mistakes are soft: a small red mark on the board; no voice, no streak loss inside a run.
- Known limit: very fast playing (>~8 notes/s), soft hammer-ons and slides may be missed.

## Path
| Level | Adds |
|---|---|
| 1 | A minor pentatonic, box 1 |
| 2–5 | boxes 2, 3, 4, 5 (each level drills its new box, earlier boxes stay in the pool) |
| 6 | box-to-box: two adjacent boxes in one run |
| 7+ | other roots (E, D, G, C), then major pentatonic, then the major scale positions |
Unlock as Find the note (recent runs fast and clean enough). Boss: all 5 boxes in one run up the
neck, with the boss HP/lives/countdown fight.

## UI
Same one-screen layout: level chip row, prompt strip ("A minor pentatonic · box 1", step
counter, time/score), full fretboard with the box outlined and played notes lighting up,
controls. Path | Drill toggle where Find the note has Path | Custom.

## Also
Intervals, Arpeggios and Vibrato tabs stay visible but disabled ("Coming soon").

## Left to the builder
Exact timings, scoring formula, copy, code structure (pure rules + tests, like path.js /
triad-path.js).
