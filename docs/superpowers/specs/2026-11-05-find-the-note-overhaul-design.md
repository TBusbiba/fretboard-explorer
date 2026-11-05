# Find the note: mini overhaul

Practice → Find the note → Path. Today the Path adds one note per level and drills it at random.
The player said what is missing is structure: a few things worth burning into memory, asked
together, with tricks that make the neck make sense, and a game feel that makes streaks fun.
Source of the tricks: a guitar-teaching video transcript (BEAD at fret 7, E–F / B–C neighbours,
the G A B dots on the E strings, the string-pair "kink" at G→B).

## Goals

- Every level drills one idea the player should remember, asked as a group.
- Tricks are taught in the game: a tip card when a level opens, hints that count from a landmark,
  and octave-shape hints in note chains.
- Streaks feel exciting (combo, shouts, heat, points, best streak), in the Neo-Brutalist look.
- The boss proves the player knows a note: every spot of it from fret 0 to 12, in order.

Non-goals: no new page, no change to Explorer / Chords / other practice modes, no dark mode,
no accounts. Anti-goals: noisy or childish effects that hide the fretboard; animation that ignores
reduced motion; hints so strong the player stops thinking.

## Strings and words

String indices in code: 5 = low E … 0 = high E. "Down" in hints means toward the floor
(thinner string, higher pitch), the way the player says it: A → G is "2 strings down".

## Step 1: streaks, combo, points (Find the note, Path and Custom)

- Streak = consecutive answers right on the first try. A wrong note or a reveal/skip ends it.
- From 3: a "×N" combo badge on the prompt card.
- Shouts at 5 "Nice!", 10 "Great!", 15 "On fire!", 20 "Unstoppable!", 30 "Legendary!",
  then every 10 more "Legendary ×N". Big, bold, slightly rotated, pops in and fades.
- Heat: the prompt card colour moves with the streak: cyan (0–4) → yellow (5–9) →
  salmon (10–19) → pink (20+). The correct-answer pop grows with heat.
- Points: base 100 plus a speed bonus up to 100 (full at ≤1 s, zero at 6 s), times the
  multiplier 1 + floor(streak / 5), capped at ×5. A thin speed bar drains on the card while a
  question is open, so the player sees the bonus melting.
- Score shown on the card; best streak and best score saved per level (Path) and for Custom.
- "New best streak!" when beaten; a short "Streak lost (12)" on a miss; heat resets.
- Reduced motion: same information, no shake/pop/rotation.

## Step 2: note chains with octave-shape hints

- Every 6–9 questions in Path, a chain round: one note, 3 times, each an octave higher.
- Announcement, held ~1.5 s, big and intimidating: "Quick note chain round! 3 C notes!
  Start with the A string —".
- Octave shapes (2 strings down): from low E or A: +2 frets; from D or G: +3 frets (the B-string
  kink). Chains start on low E or A: low E → D → B, A → G → high E. Every spot must be inside
  the fret range; otherwise pick another start or note from the level.
- From the 2nd note the hint is shown: "2 strings down, 2 frets up" (or 3), with an arrow on the
  board from the last spot.
- All 3 first try: "Chain complete!" and a bonus. Chain answers count like normal answers
  (window stats, coverage, streak).

## Step 3: landmark levels, tip cards, landmark hints

Levels (spots within frets 0–12):

| # | Name | Spots asked | Idea |
|---|---|---|---|
| 1 | Open strings | every string at fret 0 and 12 | fret 12 = fret 0 |
| 2 | BEAD | fret 7 on strings low E, A, D, G (B E A D) | the middle landmark |
| 3 | Gift of the gab | G A B at frets 3-5-7, low E and high E | the dots, mirrored E strings |
| 4 | A-string dots | C D E at frets 3-5-7 on the A string | same dots, next string |
| 5 | Neighbours | E, F, B, C on every string | one fret apart, no sharp between |
| 6 | All naturals | every natural on every string | count from a landmark |
| 7 | Sharps | every sharp on every string | one fret above a natural |
| 8 | Everything | all 12 | — |

- About 20% of questions come from earlier levels (review). They count for streak and points,
  not for the level's coverage.
- Unlock rule unchanged: last 20 answers ≥75% first try, average ≤6 s, every level spot covered.
- Tip card when a level is opened (dismissible, reopen from a "Tip" button): one sentence and a
  small fretboard diagram of the idea.
- Hint after a miss: count from the nearest landmark on that string, both ways.
  Landmarks: frets 0 and 12; fret 7 BEAD; frets 3-5-7 on the E strings (G A B) and on the A
  string (C D E); fret 5 = the next string's open note. Examples: "Fret 7 is A (BEAD) → up 2 → B",
  "Fret 12 is A → back 2 → G". Sharps: "One fret above F".
- New store key; Path progress resets once.

## Step 4: boss: every note, in order

- One run per note of the level's group (the level's own notes, not review notes).
- The player plays every spot of the note from fret 0 to 12, left to right: sorted by fret, and
  at the same fret the lower (thicker) string first.
- Prompt: "Every A · 3 of 6", with the next string. Found spots stay lit on the board.
- Mistakes are counted; stars from average time and mistakes (3★: ≤2 s and 0 mistakes;
  2★: ≤3 s and ≤2 mistakes; 1★: passed). Fails as today (time-outs).

## Left to the builder

Exact copy, animation timings, colours within the Neo-Brutalist tokens (shared/console.css),
layout of the badge, bar and tip card, and code structure, following the precedent in
practice/js/path.js (pure rules + tests) and practice/js/app.js (UI).
