# Fretboard Practice — design

A second page, independent of the existing Fretboard Explorer, for memorising
note positions on the guitar neck by ear. The app names a string and a note,
the player plays it, and the microphone confirms it.

## Constraints

- Lives entirely under `practice/`. No file outside that directory (other than
  this spec) is touched. The existing app at `/index.html` keeps working.
- Static: no build step, no server-side code. Works from `python3 -m http.server`.
- Microphone access requires a secure or localhost origin; `file://` is not supported.
- Pitch detection uses [pitchy](https://github.com/ianprime0509/pitchy) (MIT),
  vendored under `practice/vendor/` so the page works offline.

## Practice loop

1. Pick a random target `{string, fret}` from the enabled strings, fret range,
   and note set (naturals only, or chromatic). Never repeat the previous target.
2. Show the target: large note name, string name, and the target string
   highlighted on the fretboard. Speak it: "A string, C sharp".
3. Start the hint timer. When the configured delay elapses, show the answer
   position on the fretboard. Delay is 0–15 s or "never".
4. Listen. A note counts once it has been detected steadily (~120 ms) above
   the gate and clarity thresholds.
   - **Correct** = detected MIDI number equals the target's MIDI number
     (exact pitch; same pitch on another string also passes since the mic
     can't distinguish). Flash green, say "correct", record time-to-find,
     short pause, next target.
   - **Wrong** = any other steady note. Flash red at the first position of
     that pitch on the target string if it exists (else nothing), say
     "that was D". Each distinct wrong note is announced once per target.
5. Repeat until stopped. Running stats: notes done, accuracy, average time.

## Settings (persisted in localStorage)

- Strings enabled (6 toggles), fret range (from/to), naturals or chromatic.
- Hint delay (0–15 s, or never).
- Voice on/off, voice choice, rate.
- Mic: gate (RMS threshold), clarity (pitchy clarity threshold), gain.
- Tuning: standard only in v1.

Keyboard: Space start/stop, N skip, H show hint now.

## Modules (`practice/js/`)

| file | purpose | depends on |
|---|---|---|
| `notes.js` | note names, MIDI ↔ frequency, note at string/fret, target picking | — |
| `fretboard.js` | SVG fretboard with proportional fret spacing; API: `highlightString`, `showNote(string, fret, kind)`, `clear()` | — |
| `pitch.js` | mic capture → pitchy → debounced steady-note events; gate/clarity/gain | vendor/pitchy |
| `voice.js` | speechSynthesis wrapper; emits speaking start/end so pitch.js can mute | — |
| `settings.js` | defaults + localStorage load/save | — |
| `session.js` | pure state machine for the loop (testable without DOM) | notes.js |
| `app.js` | wires DOM, settings panel, stats | all |

## Error handling

- Mic denied/unavailable: inline message with instructions; page remains usable
  with hints only.
- No speech voices: prompt shown on screen only, voice toggle disabled.

## Testing

- `node --test practice/tests` for notes.js and session.js.
- pitch.js verified against synthesized tones in Node (pitchy) and by hand in the browser.

## Additions (same day)

- Prompts use string numbers (1 = high E … 6 = low E). Default fret range 0–11 so
  every note appears once per string.
- Octave-off answers are reported as "That's G, but an octave too high/low";
  wrong-note markers are only drawn inside the practised range.
- Detection hold is tolerant (3 agreeing readings over ≥90 ms, stray misses
  ignored); 70 Hz high-pass ahead of the detector; defaults gate 0.007, clarity 0.84.
- **Sound** (`sound.js`): Karplus–Strong pluck. Note mode has a "play the note
  after saying it" toggle; the mic is muted while speaking or playing.
- **Intervals mode** (`settings.mode = 'intervals'`): a root position is shown,
  played and spoken ("B, string 4. Find the fifth above"). The answer is the
  target pitch on any enabled string in range. Hint marks every such position
  and shows the shape tip for that root string. Intervals: octave ↑/↓, 5th,
  4th, major 3rd, minor 3rd — each with three tips (`INTERVALS` in `notes.js`,
  verified by a test that recomputes every worked example).

## Round 3

- Intervals mode is two-step: the root must be played first (root ring turns
  green, "now the 5th ↑"), then the interval. A wrong note in either step
  spoils first-try.
- Hints are staged in Intervals mode: stage 1 (after the hint delay) shows the
  shape tip on the main screen; stage 2 (one delay later) marks the positions.
  H advances one stage. Note mode keeps a single stage.
- Interval picker chips under the mode switch: Random (pool = the intervals
  ticked in settings) or a specific interval (`settings.intervalPick`).
- History (`history.js`, localStorage `fretboard-practice.history.v1`): per
  position (note mode) and per interval, counting clean (first try, no hint),
  solved, hints, skips and time. Mastery = 0.6·clean rate + 0.4·speed
  (1.5 s → 1, 6 s → 0); bands strong ≥ 0.7, ok ≥ 0.4, weak below.
  "Show on fretboard" overlays dots (opacity grows with tries); the panel lists
  needs-work / solid / intervals; "Reset history" clears it.

## Dev server and cache guard

`python3 serve.py` (repo root) serves everything with `Cache-Control: no-store`
so plain reloads always pick up edits; the stock `http.server` let Chrome mix a
cached `index.html` with newer scripts. `index.html` carries `data-build` and
`app.js` a matching `BUILD`; on mismatch the page shows a "reload" banner and
stops instead of half-working. Bump both together when the HTML structure changes.

## Round 4 (2026-10-08)

- **Arpeggios mode**: chord (major, minor, 7, m7, maj7) with the root on string
  6, 5 or 4; one chord tone per string up to string 1 within a 5-fret window
  (lowest tone in the window per string → CAGED-style shapes). Spoken cue is
  short ("A major, from string 6"); the shape is then played as quick plucks
  (`sound.playSequence`).
- **Triads mode**: close-voiced triads (major, minor, dim, aug, plus 7 / m7
  shell voicings R·3·♭7) on a 3-string group (6·5·4, 5·4·3, 4·3·2, 3·2·1 —
  any subset) in all three inversions, ascending, within 5 frets. Prompt names
  the inversion.
- Sequence modes reveal hints **one note at a time**: stage 1 tip, stage 2 the
  current step only; after each played note the stage drops back to 1 and the
  countdown restarts (`session.hintAnchor`).
- History gains `chords` and `triads`; the heatmap panel lists them.

## Vibrato trainer (2026-10-09)

`practice/vibrato.html` + `practice/js/vibrato/`:
- `pitch-worklet.js`: AudioWorklet running the pitch detector (pitchy + octave
  guard) every 256 samples (~5 ms) on a 2048-sample window; posts {t, hz, clarity, rms}.
- `tracker.js`: mic → gain → 70 Hz high-pass → worklet; clarity gating and a
  3-point median; frames carry a fractional MIDI value.
- `analysis.js` (pure, tested): cents contour → cycles via extremes with
  hysteresis → rate, depth, evenness (std of excursions), return (signed
  offset from home), bend overshoot; penalties → 0..100 score and the single
  worst problem with text + tip. Fretted: home 0, pushes up. Bend: home =
  bend target, dips down; above the target is overshoot. Musical rate 4–7.5 Hz.
- `lane.js`: canvas, time left→right, cents up/down; corridor, note/target
  lines, phase-locked ghost of the ideal motion from the vibrato start, trace
  coloured per point (ok/warn/bad by distance to the corridor), cycle markers,
  now-dot.
- `vibrato.js`: note chosen by tapping the fretboard or auto-locked after
  300 ms of a steady pitch; bend mode phases bending → vibrato once the pitch
  sits within 25¢ of the target for 150 ms; verdict needs ≥ 2 cycles; a problem
  must repeat before it replaces the current one.
