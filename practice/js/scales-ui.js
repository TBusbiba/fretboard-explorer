// The Scales screen: Path | Drill. Play a scale in one box, up and back down; every stable pitch from the
// mic goes to a listener that only cares about the next note (ringing notes never nag). Everything
// DOM-side for the Scales mode lives here; app.js only forwards the mic feed, Start / Skip / Hint and a
// few render calls (see the "scales" hooks there). The rules are pure and tested in scales.js,
// scale-listen.js, scale-path.js and scale-run.js.

import { STRINGS, NOTE_NAMES } from './notes.js';
import { SCALES } from './scales.js';
import { createScaleListener } from './scale-listen.js';
import {
  SCALE_LEVELS, createScalePathStore, exerciseRun, exerciseKey, bossRuns, pickExercise, scaleStarsFor,
  WINDOW_RUNS, AVG_NOTE_MS_MAX, MAX_RUN_MISTAKES, STAR2_NOTE_MS, STAR3_NOTE_MS, STAR2_MISTAKES,
} from './scale-path.js';
import * as hud from './hud.js';
import { spokenPrompt, announceText, scaleClipPhrases, liveScore, runScore, runStars, combineStats } from './scale-run.js';

const KINDS = ['minorPentatonic', 'majorPentatonic', 'major'];
const KIND_LABEL = { minorPentatonic: 'Minor pentatonic', majorPentatonic: 'Major pentatonic', major: 'Major' };
const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const RESULT_PAUSE_MS = { path: 3200, drill: 1600, boss: 1800 };
const SOFT_MARK_MS = 1000;
const BOSS_INTRO_MS = 1800;
const DRILL_BEST_KEY = 'fretboard-practice.scale-drill-best.v1';
const now = () => performance.now();
const runClock = (ms) => { const t = Math.floor(ms / 100) / 10, m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const secs = (ms) => `${(ms / 1000).toFixed(1)} s`;
const noteLabel = (n) => NOTE_NAMES[n.midi % 12];
const evenLabel = (cv) => (cv == null ? '—' : cv <= 0.15 ? 'steady' : cv <= 0.3 ? 'fairly even' : 'uneven');
const stringName = (i) => (i === 5 ? 'low E' : STRINGS[i].name);
const partName = (scale) => (scale === 'major' ? 'position' : 'box');

/** Phrases the Scales screen speaks (recorded by tools/make-voice.mjs), for preloading. */
export const SCALE_CLIPS = [...scaleClipPhrases(), 'Boss round!', 'Boss defeated!'];

function levelTip(level) {
  const id = level.id;
  if (id === 1) return { head: 'A box, any root', line: 'A minor pentatonic is five notes repeated all over the neck. A box is one handful of them, two per string. Box 1 starts on the low E string, on the root, and slides to any root.', note: 'The root changes every question; the first note is marked "start". Play up to the top, then back down.' };
  if (id <= 5) return { head: `Box ${id} joins the pool`, line: 'Each box starts near where the last one ended and shares a note or two with it. Box 5 leads back to box 1, an octave up. Questions mix every box you have so far, in random roots.', note: 'The outlined shape on the board is the box. Notes light up as you play them.' };
  if (id === 6) return { head: 'Joined boxes', line: 'Two neighbouring boxes as one long run (1 + 2, 2 + 3, ...): the same notes, with a single change of position on the way up.', note: 'Stay relaxed at the change: the run only counts the notes you play.' };
  if (id <= 8) return { head: 'Major pentatonic', line: 'Major pentatonic is the relative of the minor one: the same five boxes, with the root three frets higher. Roots are C, G, D, A and F.', note: 'Everything from the earlier levels keeps coming up too.' };
  return { head: 'The major scale', line: 'Seven notes, so some strings give three. The shapes are a little wider than the pentatonic boxes: five positions up the neck.', note: 'Positions work like boxes: each starts near where the last one ended.' };
}

export function createScalesUI(ctx) {
  const { ui, fretboard, pitch, voice, $ } = ctx;
  const store = createScalePathStore();
  const el = {
    row: $('scales-path'), map: $('scales-map'), bossBtn: $('scales-boss-btn'), tipBtn: $('scales-tip-btn'), pop: $('scales-pop'),
    popTitle: $('scales-pop-title'), popGoal: $('scales-pop-goal'), popStats: $('scales-pop-stats'), popBoss: $('scales-pop-boss'),
    tipCard: $('scales-tip-card'), tipTag: $('scales-tip-tag'), tipHead: $('scales-tip-head'), tipLine: $('scales-tip-line'), tipNote: $('scales-tip-note'), tipGot: $('scales-tip-got'),
    modePicker: $('scales-mode-picker'), drill: $('scales-drill'), kinds: $('scales-kind'), roots: $('scales-root'), boxes: $('scales-box'), boxLabel: $('scales-box-label'),
    result: $('sc-result'), stats: $('sc-stats'), score: $('sc-score'), miss: $('sc-miss'), missBlock: $('sc-miss-block'),
  };

  const EARLY_MIC_MS = 500;   // the mic opens this long before the announcement ends
  let running = false;      // Start pressed: the mic is open and runs follow each other
  let run = null;           // the run in progress: {ex, listener, phase: 'intro' | 'play' | 'result', firstAt, lit, ...}
  let boss = null;          // the boss in progress: {levelId, runs, index, stats, score, totalMs, mistakes}
  let bossFinale = null;
  let token = 0;            // bumped to drop a stale announcement or pause
  let pause = 0;
  let lastEnd = null;       // the last pitch of the previous run: still ringing when the next one starts
  let tipOpen = false;
  let introTimer = 0;
  let drill = { runs: 0, last: null };
  let softTimers = [];
  let lastTime = '';

  const settings = () => ctx.getSettings();
  const active = () => settings().mode === 'scales';
  const isPath = () => settings().scalesMode !== 'drill';
  const level = () => store.currentLevel;
  const kindOf = () => (KINDS.includes(settings().scaleKind) ? settings().scaleKind : 'minorPentatonic');

  // ---------- picking the next run ----------

  const drillExercise = () => ({ scale: kindOf(), rootPc: settings().scaleRoot, boxes: [settings().scaleBox] });

  const pathExercise = (previous) => pickExercise(level(), previous, store.covered(level().id));

  // ---------- the board ----------

  const keyOf = (n) => `${n.string}:${n.fret}`;

  function drawBoard(r) {
    softTimers.forEach(clearTimeout); softTimers = [];
    fretboard.clearNotes();
    fretboard.highlightString(null);
    fretboard.showBox(r.notes.map(n => ({ string: n.string, fret: n.fret, isRoot: n.isRoot })), 'start');
    ctx.scrollBoardTo(Math.min(...r.notes.map(n => n.fret)) + 2);
  }

  function light(n) {
    run.lit.set(keyOf(n), n);
    fretboard.showNote(n.string, n.fret, 'correct', noteLabel(n));
  }

  /** The top note was played: the lit notes go out, so the way down lights them again. */
  function turnAround(top) {
    for (const n of run.lit.values()) if (n !== top && keyOf(n) !== keyOf(top)) fretboard.hideNote(n.string, n.fret);
    run.lit = new Map([[keyOf(top), top]]);
  }

  /** A counted mistake: a soft red mark where the wrong pitch sits in the box (no voice); elsewhere only the counter says so. */
  function softMark(midi) {
    const spots = run.ex.notes.filter(n => n.midi === midi);
    for (const n of spots) {
      fretboard.showNote(n.string, n.fret, 'soft', '✕', true);
      softTimers.push(setTimeout(() => {
        if (!run) return;
        if (run.lit.has(keyOf(n))) fretboard.showNote(n.string, n.fret, 'correct', noteLabel(n), true);
        else fretboard.hideNote(n.string, n.fret);
      }, SOFT_MARK_MS));
    }
    ui.status.classList.remove('is-soft'); void ui.status.offsetWidth; ui.status.classList.add('is-soft');
    el.missBlock.classList.remove('is-flash'); void el.missBlock.offsetWidth; el.missBlock.classList.add('is-flash');
  }

  // ---------- the strip ----------

  const total = () => (run ? run.ex.sequence.length : 0);
  const played = () => (run && run.listener ? run.listener.index : 0);
  const mistakes = () => (run && run.listener ? run.listener.mistakes : 0);
  const bossMistakes = () => (boss ? boss.mistakes : 0) + mistakes();

  function directionText() {
    if (!run) return '';
    const up = played() < run.ex.notes.length;
    return played() === 0 ? `Start on the ${stringName(run.ex.notes[0].string)} string, fret ${run.ex.notes[0].fret}` : up ? 'Going up' : 'Coming back down';
  }

  function renderProgress() {
    const t = total(), p = played();
    ui.bossPips.innerHTML = t ? `<span class="sc-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${t}" aria-valuenow="${p}"><i style="width:${Math.round(100 * p / t)}%"></i></span>` : '';
  }

  function renderScore() {
    const st = run && run.listener ? run.listener.stats() : null;
    const live = st ? liveScore(st.gaps, st.played, st.mistakes) : 0;
    el.score.textContent = ((boss ? boss.score : 0) + live).toLocaleString('en-US');
    el.miss.textContent = bossMistakes();
  }

  function renderRun() {
    if (!run) return;
    const label = run.ex.label, p = played();
    ctx.setPrompt(label, `${p} / ${total()}`, 'listening');
    ctx.setStatus(`Up and back down · ${directionText()}`);
    ui.status.hidden = false; el.result.hidden = true;
    renderProgress();
    renderScore();
  }

  function renderIdle() {
    if (!active() || running) return;
    const ex = isPath() ? level().added[0] : drillExercise();
    const r = exerciseRun(ex);
    drawBoard(r);
    ctx.setPrompt(r.label, `0 / ${r.sequence.length}`, 'ready');
    ctx.setStatus(`Press Start, then play the scale up and back down · start on the ${stringName(r.notes[0].string)} string, fret ${r.notes[0].fret}`);
    ui.status.hidden = false; el.result.hidden = true;
    ui.bossPips.innerHTML = '';
    el.score.textContent = '0'; el.miss.textContent = '0';
    ui.timeVal.textContent = '0:00';
  }

  function showResult(cells, kicker) {
    ui.status.hidden = true;
    ui.bossPips.innerHTML = '';
    el.result.hidden = false;
    el.result.innerHTML = `<div class="sc-result__head">${kicker}</div>` + cells.map(([v, l, cls]) => `<div class="sc-res${cls ? ` ${cls}` : ''}"><b>${v}</b><span>${l}</span></div>`).join('');
    ui.stringName.textContent = kicker;
  }

  // ---------- one run ----------

  async function beginRun(ex, { say = true, intro = '', text = spokenPrompt(ex) } = {}) {
    clearTimeout(pause);
    const my = ++token;
    const r = exerciseRun(ex);
    run = { ex: r, listener: null, phase: 'intro', firstAt: null, lit: new Map(), hinted: false };
    drawBoard(r);
    renderRun();
    ctx.setStatus(`Up and back down · ${directionText()}`);
    updateBossStrip();
    if (say && (intro || text) && ctx.getSettings().voice) {
      try { await ctx.announce(`${intro}${text}`, null, { speak: true, earlyMs: EARLY_MIC_MS }); } catch { /* a missing clip falls back to TTS inside announce */ }
    }
    if (my !== token || !running) return;
    run.listener = createScaleListener(r.sequence, { now });
    run.phase = 'play';
    renderRun();
  }

  /** The mic's steady pitch (every frame it holds), or a test's. Returns the listener's status. */
  function feed(midi, info = {}) {
    if (!running || !run || run.phase !== 'play') return null;
    const l = run.listener;
    if (l.index === 0 && !info.fresh && lastEnd != null && (midi === lastEnd || midi === lastEnd + 12 || midi === lastEnd - 12)) return 'ignored';
    return handle(midi, info.fast ? l.onClear(midi, info) : l.onPitch(midi, info));
  }

  function handle(midi, r) {
    if (r.status === 'advance' || r.status === 'done') {
      const n = run.ex.sequence[r.index - 1];
      if (r.index === 1) run.firstAt = now();
      light(n);
      if (r.index === run.ex.notes.length && r.status !== 'done') turnAround(n);
      renderRun();
      if (r.status === 'done') finishRun();
    } else if (r.status === 'mistake') {
      softMark(midi);
      renderScore();
    }
    return r.status;
  }

  function finishRun() {
    const st = run.listener.stats();
    run.phase = 'result';
    lastEnd = run.ex.sequence[run.ex.sequence.length - 1].midi;
    el.score.textContent = ((boss ? boss.score : 0) + runScore(st)).toLocaleString('en-US');
    ui.noteName.dataset.state = 'correct';
    if (boss) return finishBossRun(st);
    const score = runScore(st), n = runStars(st);
    const cells = [[secs(st.totalMs), 'time'], [`${Math.round(st.avgMs)} ms`, 'per note'], [st.evenness == null ? '—' : st.evenness.toFixed(2), `evenness · ${evenLabel(st.evenness)}`],
      [st.mistakes, st.mistakes === 1 ? 'mistake' : 'mistakes'], [stars(n), 'stars', 'sc-res--stars']];
    let newBest = false;
    let kicker;
    if (isPath()) {
      const lvl = level(), rec = store.record(lvl.id, { ms: st.avgMs, mistakes: st.mistakes, key: exerciseKey(run.ex) });
      newBest = store.saveBests(lvl.id, { score });
      kicker = rec.bossUnlocked ? 'Boss round unlocked!' : newBest ? 'New best score!' : 'Run done · next run starting';
      if (rec.bossUnlocked) { popTile(lvl.id); hud.confetti(); }
      renderRow();
    } else {
      drill.runs += 1; drill.last = st.totalMs;
      const best = drillBest(st.totalMs);
      cells.splice(0, 5, [secs(st.totalMs), 'last run'], [secs(best), 'best run'], [drill.runs, drill.runs === 1 ? 'run' : 'runs'], [`${Math.round(st.avgMs)} ms`, 'per note'], [st.mistakes, st.mistakes === 1 ? 'mistake' : 'mistakes']);
      kicker = 'Next loop starting';
    }
    showResult(cells, kicker);
    pause = setTimeout(() => { if (running && !boss) nextRun(); }, RESULT_PAUSE_MS[isPath() ? 'path' : 'drill']);
  }

  function nextRun() {
    if (!running) return;
    const prevEx = run ? run.ex : null;
    const prev = prevEx ? prevEx.label : null;
    const ex = isPath() ? pathExercise(prev) : drillExercise();
    beginRun(ex, { say: isPath() || drill.runs === 0, text: isPath() ? announceText(ex, prevEx) : spokenPrompt(ex) });
  }

  // ---------- Drill's best time ----------

  function drillBest(ms) {
    const key = `${kindOf()}:${settings().scaleRoot}:${settings().scaleBox}`;
    let all = {};
    try { all = JSON.parse(localStorage.getItem(DRILL_BEST_KEY)) || {}; } catch { all = {}; }
    const best = typeof all[key] === 'number' ? Math.min(all[key], ms) : ms;
    if (best !== all[key]) { all[key] = best; try { localStorage.setItem(DRILL_BEST_KEY, JSON.stringify(all)); } catch { /* ignore */ } }
    return best;
  }

  // ---------- boss: every box of the level's scale, up the neck, back to back ----------

  function updateBossStrip() { renderBossStrip(); }

  function renderBossStrip() {
    const on = !!(boss && active());
    ui.stage.classList.toggle('is-focus', on);
    ui.foundBlock.hidden = true;
    ui.timeBlock.hidden = on;
    el.missBlock.hidden = on;
    if (!on) { ui.bossHp.hidden = false; return; }
    const cur = boss.runs[boss.index];
    ui.bossTitle.textContent = `L${boss.levelId} · run ${boss.index + 1}/${boss.runs.length}`;
    $('boss-hearts-label').textContent = 'Mistakes';
    ui.bossHp.hidden = true; ui.bossCd.hidden = true;
    ui.bossHearts.textContent = `${bossMistakes()} ✗`;
    ui.bossHearts.setAttribute('aria-label', `${bossMistakes()} mistakes`);
  }

  function startBoss() {
    const lvl = level();
    if (!active() || !isPath() || !store.progress(lvl.id).bossUnlocked) return;
    boss = { levelId: lvl.id, runs: bossRuns(lvl), index: 0, stats: [], score: 0, totalMs: 0, mistakes: 0 };
    bossFinale = null; ctx.hideBossEnd();
    el.pop.hidden = true;
    renderRow();
    showIntro('Boss round!', `${lvl.title}`, `${boss.runs.length} runs back to back · ${boss.runs[0].label} first —`);
    if (!running) ctx.toggleStart(); else beginBossRun();
  }

  function beginBossRun() {
    const first = boss.index === 0;
    beginRun(boss.runs[boss.index], { intro: first ? 'Boss round! ' : '' });
  }

  function showIntro(kicker, big, start) {
    ui.chainKicker.textContent = kicker;
    ui.chainBig.textContent = big;
    ui.chainStart.textContent = start;
    ui.chainIntro.classList.remove('is-chain');
    ui.chainIntro.hidden = false;
    ui.chainIntro.classList.remove('is-on'); void ui.chainIntro.offsetWidth; ui.chainIntro.classList.add('is-on');
    clearTimeout(introTimer);
    introTimer = setTimeout(() => ctx.hideChainIntro(), BOSS_INTRO_MS);
  }

  function finishBossRun(st) {
    boss.stats.push(st);
    boss.score += runScore(st);
    boss.totalMs += st.totalMs;
    boss.mistakes += st.mistakes;
    const last = boss.index + 1 >= boss.runs.length;
    const all = combineStats(boss.stats);
    showResult([[`${boss.index + 1}/${boss.runs.length}`, 'runs'], [secs(st.totalMs), 'this run'], [`${Math.round(st.avgMs)} ms`, 'per note'], [boss.mistakes, boss.mistakes === 1 ? 'mistake' : 'mistakes']],
      last ? 'Boss round cleared' : `${run.ex.label} done · next box coming`);
    if (last) { pause = setTimeout(() => finishBoss(all), 900); return; }
    pause = setTimeout(() => { if (running && boss) { boss.index += 1; beginBossRun(); } }, RESULT_PAUSE_MS.boss);
  }

  function finishBoss(all) {
    const lvl = SCALE_LEVELS.find(l => l.id === boss.levelId);
    const r = store.completeBoss(lvl.id, all.avgMs, all.mistakes);
    const next = r.next && SCALE_LEVELS.find(l => l.id === r.next);
    bossFinale = { level: lvl.id, stars: r.stars };
    ui.bossEndKicker.textContent = r.stars === 3 ? 'Flawless!' : r.stars === 2 ? 'Boss round cleared!' : 'Boss round beaten!';
    ui.bossEndStars.innerHTML = [1, 2, 3].map(n => `<span class="${n <= r.stars ? 'is-on' : ''}">★</span>`).join('');
    ui.bossEndStats.innerHTML = `<div><b>${boss.runs.map(x => x.boxes[0]).join(' · ')}</b><span>${partName(lvl.scale) === 'box' ? 'boxes' : 'positions'}</span></div>`
      + `<div><b>${all.total}</b><span>notes</span></div><div><b>${secs(all.totalMs)}</b><span>playing time</span></div>`
      + `<div><b>${Math.round(all.avgMs)} ms</b><span>per note</span></div><div><b>${all.mistakes}</b><span>mistake${all.mistakes === 1 ? '' : 's'}</span></div>`;
    ui.bossEndNext.textContent = next ? `Level ${next.id} unlocked: ${next.title}` : 'Path complete: every level done';
    ui.bossEnd.classList.remove('is-lost');
    ui.bossEnd.hidden = false;
    ui.bossEnd.classList.remove('is-on'); void ui.bossEnd.offsetWidth; ui.bossEnd.classList.add('is-on');
    hud.confetti();
    boss = null;
    popTile(lvl.id);
    if (ctx.getSettings().voice) voice.speak('Boss defeated!', ctx.voiceOpts());
    setTimeout(() => { if (running) stop(); }, 0);
  }

  function failBoss(text) {
    boss = null;
    renderBossStrip();
    renderRow();
    if (text) ctx.setStatus(text, 'bad');
  }

  // ---------- start / stop / skip / hint ----------

  async function toggle() {
    if (running) { stop(); return; }
    ctx.warmClips();
    await pitch.start();
    running = true;
    lastEnd = null; drill = { runs: 0, last: null };
    ctx.hideBossEnd();
    if (boss) beginBossRun(); else nextRun();
    ctx.syncButtons();
  }

  function stop() {
    running = false;
    token++; clearTimeout(pause); clearTimeout(introTimer);
    softTimers.forEach(clearTimeout); softTimers = [];
    voice.cancel();
    pitch.stop();
    ctx.hideChainIntro();
    run = null;
    if (boss) boss = null;
    el.missBlock.hidden = false;
    renderBossStrip();
    renderRow();
    renderIdle();
    if (bossFinale) { ctx.setStatus(`Level ${bossFinale.level} complete ${'★'.repeat(bossFinale.stars)}`, 'ok'); bossFinale = null; }
    ctx.syncButtons();
  }

  /** Skip: a fresh run now; in a boss it ends the round. */
  function skip() {
    if (!running) return;
    if (boss) failBoss('Boss round over: skipping ends it. Try again anytime');
    lastEnd = run && run.listener && run.listener.index ? run.ex.sequence[run.listener.index - 1].midi : lastEnd;
    nextRun();
  }

  const canHint = () => running && !!run && run.phase === 'play' && !!run.listener && !run.listener.done;

  /** H: show the next note for a moment. */
  function hint() {
    if (!canHint()) return;
    const n = run.ex.sequence[run.listener.index];
    fretboard.showNote(n.string, n.fret, 'hint', noteLabel(n), true);
    const my = run;
    softTimers.push(setTimeout(() => {
      if (run !== my) return;
      if (my.lit.has(keyOf(n))) fretboard.showNote(n.string, n.fret, 'correct', noteLabel(n), true); else fretboard.hideNote(n.string, n.fret);
    }, 1800));
  }

  /** Called every frame by app.js: the run clock (and the boss clock). */
  function tick() {
    if (!active()) return;
    let text = '0:00';
    if (run && run.phase === 'play' && run.firstAt != null) text = runClock(now() - run.firstAt);
    else if (run && run.phase === 'result' && run.listener) text = runClock(run.listener.stats().totalMs);
    if (!boss && text !== lastTime) { lastTime = text; ui.timeVal.textContent = text; }
    if (boss) {
      const live = run && run.phase === 'play' && run.firstAt != null ? now() - run.firstAt : 0;
      const t = runClock(boss.totalMs + live);
      if (ui.bossTime.textContent !== t) ui.bossTime.textContent = t;
    }
  }

  // ---------- level row ----------

  const tiles = SCALE_LEVELS.map((l) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'path__tile'; b.dataset.id = l.id;
    b.innerHTML = `<b class="path__num">L${l.id}</b><span class="path__names">${l.short}</span><span class="path__mark"></span>`;
    b.addEventListener('click', () => {
      if (l.id === store.current) { el.pop.hidden = !el.pop.hidden; return; }
      if (!store.isUnlocked(l.id)) { showLocked(l); return; }
      hud.hideLock();
      if (!store.select(l.id)) return;
      el.pop.hidden = true;
      boss = null;
      openTip();
      renderAll();
      if (running) nextRun();
    });
    li.appendChild(b);
    el.map.appendChild(li);
    return b;
  });
  document.addEventListener('pointerdown', (e) => { if (!el.pop.hidden && !el.row.contains(e.target)) el.pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.pop.hidden = true; });

  const critsOf = (pr) => [
    { text: `${pr.runs} / ${WINDOW_RUNS} runs`, state: pr.met.count ? 'met' : 'open' },
    hud.crit(`${pr.avgMs == null ? '' : Math.round(pr.avgMs)} ms/note`, pr.avgMs, pr.met.time, `≤ ${AVG_NOTE_MS_MAX} ms/note`),
    { text: `new boxes ${pr.coverage.done}/${pr.coverage.need}`, state: pr.met.covered ? 'met' : 'open' },
    hud.crit(`worst run ${pr.worstMistakes} ✗`, pr.worstMistakes, pr.met.clean, `≤ ${MAX_RUN_MISTAKES} mistake`),
  ];

  function showLocked(l) {
    const before = SCALE_LEVELS[l.id - 2], isCurrent = before.id === store.current;
    el.pop.hidden = true;
    hud.showLock({
      kicker: `Path · Level ${l.id}`, title: `${l.title} is locked`,
      text: `Beat the L${before.id} boss to open it${isCurrent ? `: ${WINDOW_RUNS} runs at ${AVG_NOTE_MS_MAX} ms per note or less, at most ${MAX_RUN_MISTAKES} mistake in any run.` : ': finish the earlier levels first.'}`,
      rows: isCurrent ? critsOf(store.progress(before.id)) : [],
      backLabel: `Back to L${store.current}`, onBack: () => {},
    });
  }

  function popTile(id) {
    const t = tiles[id - 1];
    t.classList.remove('is-pop'); void t.offsetWidth; t.classList.add('is-pop');
  }

  function renderRow() {
    const show = active() && isPath();
    el.row.hidden = !show;
    if (!show) { el.tipCard.hidden = true; if (active()) hud.setPath(null); return; }
    const lvl = level(), pr = store.progress(lvl.id), inBoss = !!boss;
    tiles.forEach((b, i) => {
      const l = SCALE_LEVELS[i], open = store.isUnlocked(l.id), done = store.isDone(l.id), now_ = l.id === lvl.id;
      b.setAttribute('aria-disabled', String(!open));
      b.classList.toggle('is-locked', !open);
      b.classList.toggle('is-done', done);
      b.classList.toggle('is-current', now_);
      if (now_) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('.path__mark').innerHTML = !open ? LOCK_SVG : done ? stars(store.stars(l.id)) : '';
      b.title = `Level ${l.id} · ${l.title}${now_ ? ' (click for progress)' : ''}`;
      b.setAttribute('aria-label', `Level ${l.id}, ${l.title}${!open ? ', locked' : done ? `, done, ${store.stars(l.id)} of 3 stars` : now_ ? ', current' : ''}`);
    });
    el.popTitle.textContent = `Level ${lvl.id} · ${lvl.title}`;
    el.popGoal.textContent = pr.bossUnlocked ? 'Boss round open: five runs from this level and the ones before, random roots, back to back.'
      : `Unlock the boss: play each new box once, then your last ${WINDOW_RUNS} runs average ${AVG_NOTE_MS_MAX} ms per note or less, with at most ${MAX_RUN_MISTAKES} mistake in any run.`;
    const box = (label, value, goal, met) => `<div class="pstat${met ? ' is-met' : ''}"><span class="pstat__label">${label}</span><span class="pstat__value">${value}${met ? ' ✓' : ''}</span><span class="pstat__goal">${goal}</span></div>`;
    el.popStats.innerHTML = box('Runs', `${pr.runs}/${WINDOW_RUNS}`, `last ${WINDOW_RUNS}`, pr.met.count)
      + box('Per note', pr.avgMs == null ? '—' : `${Math.round(pr.avgMs)} ms`, `${AVG_NOTE_MS_MAX} ms or less`, pr.met.time)
      + box('New boxes', `${pr.coverage.done}/${pr.coverage.need}`, 'each played once', pr.met.covered)
      + box('Worst run', pr.worstMistakes == null ? '—' : `${pr.worstMistakes} ✗`, `${MAX_RUN_MISTAKES} or fewer`, pr.met.clean);
    hud.setPath({
      level: { n: lvl.id, sub: lvl.title },
      note: hud.opensNote(lvl.id, SCALE_LEVELS.length, pr.done), locked: !pr.done && lvl.id < SCALE_LEVELS.length,
      meter: inBoss
        ? { n: boss.index, of: boss.runs.length, crits: [{ text: `${bossMistakes()} mistake${bossMistakes() === 1 ? '' : 's'}`, state: bossMistakes() ? 'bad' : 'met' }, { text: `run ${boss.index + 1}/${boss.runs.length}`, state: 'open' }] }
        : { n: Math.min(pr.runs, WINDOW_RUNS), of: WINDOW_RUNS, crits: critsOf(pr).slice(1) },
    });
    el.bossBtn.disabled = !pr.bossUnlocked || inBoss;
    el.bossBtn.classList.toggle('is-ready', pr.bossUnlocked && !inBoss);
    el.bossBtn.innerHTML = inBoss ? `Boss ${boss.index + 1}/${boss.runs.length}` : `${pr.bossUnlocked ? '★' : LOCK_SVG} ${pr.done ? 'Boss again' : 'Boss'}`;
    el.bossBtn.title = pr.bossUnlocked ? 'Start the boss round for this level' : 'Unlock the boss: see the level progress';
    el.popBoss.textContent = inBoss ? 'Skipping ends it.'
      : pr.bossUnlocked ? `${pr.done ? `Best ${stars(pr.stars)} · ` : ''}★ pass · ★★ avg ${STAR2_NOTE_MS} ms per note, ${STAR2_MISTAKES} mistakes max · ★★★ avg ${STAR3_NOTE_MS} ms, none` : '';
    renderTip();
  }

  function renderAll() {
    renderBossStrip();
    renderRow();
    if (!running) renderIdle();
  }

  // ---------- level tip ----------

  function renderTip() {
    const show = tipOpen && active() && isPath();
    el.tipCard.hidden = !show;
    el.tipBtn.setAttribute('aria-expanded', String(show));
    el.tipBtn.classList.toggle('is-on', show);
    if (!show) return;
    const lvl = level(), t = levelTip(lvl);
    el.tipTag.textContent = `Level ${lvl.id} tip`;
    el.tipHead.textContent = t.head;
    el.tipLine.textContent = t.line;
    el.tipNote.textContent = t.note;
  }
  function openTip() { tipOpen = true; store.markTip(store.current); renderTip(); }
  function closeTip() { tipOpen = false; renderTip(); }
  el.tipBtn.addEventListener('click', () => (tipOpen ? closeTip() : openTip()));
  el.tipGot.addEventListener('click', closeTip);
  el.bossBtn.addEventListener('click', startBoss);

  // ---------- Path | Drill, and the Drill pickers ----------

  const chip = (parent, text, attrs, onClick, title) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = text; b.setAttribute('aria-pressed', 'false');
    Object.assign(b.dataset, attrs);
    if (title) b.title = title;
    b.addEventListener('click', onClick);
    parent.appendChild(b);
  };
  const restartIfRunning = () => { drill = { runs: 0, last: null }; if (running && !boss) nextRun(); };
  for (const m of [['path', 'Path', 'Work through the levels, one box at a time'], ['drill', 'Drill', 'Pick a scale, root and box and loop it up and down']]) {
    chip(el.modePicker, m[1], { id: m[0] }, () => {
      if (settings().scalesMode === m[0]) return;
      boss = null;
      ctx.commit({ scalesMode: m[0] });
      drill = { runs: 0, last: null };
      if (running) nextRun();
    }, m[2]);
  }
  for (const k of KINDS) chip(el.kinds, KIND_LABEL[k], { id: k }, () => { ctx.commit({ scaleKind: k }); restartIfRunning(); });
  for (let pc = 0; pc < 12; pc++) chip(el.roots, NOTE_NAMES[pc], { pc }, () => { ctx.commit({ scaleRoot: pc }); restartIfRunning(); });
  for (let b = 1; b <= 5; b++) chip(el.boxes, String(b), { box: b }, () => { ctx.commit({ scaleBox: b }); restartIfRunning(); });
  el.roots.querySelectorAll('.chip').forEach(c => c.classList.add('chip--key'));
  el.boxes.querySelectorAll('.chip').forEach(c => c.classList.add('chip--key'));

  // ---------- rendering from settings ----------

  /** Called from applySettingsToUI. */
  function render() {
    const on = active();
    el.modePicker.hidden = !on;
    el.modePicker.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === (isPath() ? 'path' : 'drill')));
    el.drill.hidden = !(on && !isPath());
    const s = settings();
    el.kinds.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === kindOf()));
    el.roots.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', +c.dataset.pc === s.scaleRoot));
    el.boxes.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', +c.dataset.box === s.scaleBox));
    el.boxLabel.textContent = partName(kindOf()) === 'box' ? 'Box' : 'Position';
    el.stats.hidden = !on;
    if (!on) fretboard.clearBox();
    renderAll();
    if (on && isPath() && !running && !store.tipSeen(store.current)) openTip();
  }

  return {
    toggle, stop, skip, hint, tick, feed, feedClear: (midi, info = {}) => feed(midi, { ...info, fast: true }), render, renderBossStrip, startBoss, active,
    get running() { return running; },
    get boss() { return boss; },
    canHint,
    /** The pitch the listener waits for (the detector's octave correction leans towards it), else null. */
    expected: () => (running && run && run.phase === 'play' && run.listener ? run.listener.expected : null),
    accepted() { const e = this.expected(); return e == null ? null : [e]; },
    warm: () => voice.preload(SCALE_CLIPS),
    cancelBoss() { boss = null; },
    resetPath() { store.reset(); boss = null; tipOpen = false; },
    state: () => (run ? { phase: run.phase, index: played(), total: total(), mistakes: mistakes(), label: run.ex.label, expected: run.listener ? run.listener.expected : null, sequence: run.ex.sequence.map(n => n.midi) } : null),
    store,
  };
}
