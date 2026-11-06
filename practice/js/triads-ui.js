// The Triads screen: Path | Custom, any-shape answers, shape dots, boss round, Climb the neck and
// the big Show-shapes panel. Everything DOM-side for the Triads mode lives here; app.js only
// forwards session events and a few render calls (see the "triads" hooks there). The rules are
// pure and tested in triad-match.js / triad-path.js.

import { STRINGS, NOTE_NAMES, STRING_GROUPS, DEGREE_LABELS, stringGroupById, spokenName } from './notes.js';
import { voicingsFor, shapeLayout, QUALITIES, FULL_RANGE } from './triad-match.js';
import {
  TRIAD_LEVELS, createTriadPathStore, createTriadBag, createTriadBoss, createClimbSchedule, createClimb, pickClimbChord,
  requiredShapes, shapeKey, SHAPE_NAMES, chordKey, STAR2_MS, STAR3_MS,
} from './triad-path.js';
import { WINDOW, FIRST_TRY_MIN, AVG_MS_MAX } from './path.js';
import { createCustomBest } from './combo.js';
import { CHAIN_BONUS } from './chain.js';

const NATURAL_ROOTS = [0, 2, 4, 5, 7, 9, 11];
const ALL_ROOTS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const digits = (group, sep) => [...group].join(sep);
const chordName = (c) => `${NOTE_NAMES[c.rootPc ?? c.root]} ${c.quality}`;
const shortChord = (c) => `${NOTE_NAMES[c.root]}${c.quality === 'minor' ? 'm' : ''}`;
const qualityLabel = (q) => (q === 'major' ? 'Major' : 'Minor');
const BOSS_INTRO_MS = 1800;
const INTRO_MS = 1500;
const runClock = (ms) => { const t = Math.floor(ms / 100) / 10, m = Math.floor(t / 60); return `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}`; };
const clock = (ms) => { const t = Math.round(ms / 100) / 10, m = Math.floor(t / 60); return m ? `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}` : `${t.toFixed(1)} s`; };

/** Phrases the Triads screen speaks (recorded by tools/make-voice.mjs), for preloading. */
export const TRIAD_CLIPS = [
  ...QUALITIES.flatMap(q => NOTE_NAMES.map(n => `${spokenName(n)} ${q}!`)),
  ...STRING_GROUPS.map(g => `Strings ${digits(g.id, ' ')}!`), 'Climb the neck!', 'Find every shape!',
];

function levelTip(level) {
  const g = digits(level.group, '·');
  if (level.id === 1) return { head: 'Three notes, three shapes', line: `Play the chord's root, 3rd and 5th on strings ${g}, low to high. Any of its three close shapes counts.`, note: 'Show shapes draws all three, and how far apart they sit.' };
  if (level.id === 2) return { head: 'Minor = flat 3rd', line: 'A minor triad lowers the 3rd by one fret. The shape is the major one with that single note moved down.', note: 'Show shapes switches to the minor shapes when a minor chord is asked.' };
  if (level.id === 11) return { head: 'Sharps and flats', line: 'The shapes are movable: learn them once, then slide them to any root, black keys included.', note: 'Climb the neck chains show you how far each shape sits above the last.' };
  if (level.group !== '321' && /^Strings/.test(level.title)) return { head: `New strings: ${g}`, line: `The same three shapes, one string set lower. Their finger patterns change a little because the strings tune differently.`, note: 'Show shapes draws the shapes for the strings in play.' };
  return { head: level.title, line: `Keep every shape in reach: each new level asks the chords again on strings ${g}, from any position.`, note: 'The boss opens once every shape has been found at least once.' };
}

export function createTriadsUI(ctx) {
  const { ui, session, fretboard, history, pitch, combo } = ctx;
  const store = createTriadPathStore();
  const bag = createTriadBag();
  const schedule = createClimbSchedule();
  const customBest = createCustomBest({
    getItem: () => localStorage.getItem('fretboard-practice.triad-custom-best.v1'),
    setItem: (k, v) => localStorage.setItem('fretboard-practice.triad-custom-best.v1', v),
  });
  const $ = ctx.$;
  const el = {
    row: $('triad-path'), map: $('triad-map'), bossBtn: $('triad-boss-btn'), tipBtn: $('triad-tip-btn'), pop: $('triad-pop'),
    popTitle: $('triad-pop-title'), popGoal: $('triad-pop-goal'), popStats: $('triad-pop-stats'), popBoss: $('triad-pop-boss'),
    tipCard: $('triad-tip-card'), tipTag: $('triad-tip-tag'), tipHead: $('triad-tip-head'), tipLine: $('triad-tip-line'), tipNote: $('triad-tip-note'), tipGot: $('triad-tip-got'),
    modePicker: $('triad-mode-picker'), qualityPicker: ui.triadPicker, groupPicker: ui.groupPicker,
    shapes: $('shapes-big'), shapesTitle: $('shapes-title'), shapesBody: $('shapes-body'), shapesClose: $('shapes-close'),
  };

  let boss = null;          // the triad boss round in progress, else null
  let climb = null;         // Climb the neck in progress, else null
  let notice = null;        // {text, tone} shown instead of the usual status on the next question
  let bossFinale = null;
  let tipOpen = false;
  let lastGroup = null;     // string group of the previous question: the voice names the strings only when they change
  let introTimer = 0;
  let shapesKey = '';

  const settings = () => ctx.getSettings();
  const active = () => settings().mode === 'triads';
  const isPath = () => settings().triadMode !== 'custom';
  const level = () => store.currentLevel;

  // ---------- picking the next question ----------

  const asTarget = (chord, voicings, kind, extra = {}) => ({
    rootPc: chord.root ?? chord.rootPc, quality: chord.quality, group: chord.group, voicings, kind, levelId: isPath() ? level().id : null, ...extra,
  });
  const allVoicings = (c) => voicingsFor(c.root, c.quality, c.group, FULL_RANGE);

  function customChord(previous, rng) {
    const s = settings();
    const roots = s.naturalsOnly ? NATURAL_ROOTS : ALL_ROOTS;
    const options = s.triadGroups.flatMap(group => s.triadQualities.flatMap(quality => roots.map(root => ({ root, quality, group }))))
      .filter(c => allVoicings(c).length);
    if (!options.length) return null;
    const prevKey = previous && previous.kind ? chordKey({ root: previous.rootPc, quality: previous.quality, group: previous.group }) : null;
    const fresh = options.length > 1 ? options.filter(c => chordKey(c) !== prevKey) : options;
    return fresh[Math.floor(rng() * fresh.length)];
  }

  /** The session's pickTriad hook. */
  function pick(opts, previous, rng) {
    if (boss && boss.current) {
      const it = boss.current;
      return asTarget(it, [it.voicing], 'boss', { item: it, levelId: boss.levelId });
    }
    if (isPath()) {
      const lvl = level();
      if (climb && climb.levelId !== lvl.id) climb = null;
      if (!climb && schedule.due()) {
        const c = pickClimbChord(lvl, rng);
        if (c) { const next = createClimb(c, lvl.id); if (next.steps.length === 3) climb = next; }
      }
      if (climb && !climb.done) return asTarget(climb, [climb.current.voicing], 'climb', { step: climb.index, climb });
      const chord = bag.next(lvl, store.progress(lvl.id).missing);
      return chord ? asTarget(chord, allVoicings(chord), 'normal') : null;
    }
    const chord = customChord(previous, rng);
    return chord ? asTarget(chord, allVoicings(chord), 'normal') : null;
  }

  // ---------- the strip: prompt, step dots, status ----------

  function renderDots(done) {
    ui.bossPips.innerHTML = [0, 1, 2].map(i => `<i class="${i < done ? 'is-done' : i === done ? 'is-now' : ''}"></i>`).join('');
  }

  function showIntro(kicker, big, start, ms, chain) {
    ui.chainKicker.textContent = kicker;
    ui.chainBig.textContent = big;
    ui.chainStart.textContent = start;
    ui.chainIntro.classList.toggle('is-chain', chain);
    ui.chainIntro.hidden = false;
    ui.chainIntro.classList.remove('is-on'); void ui.chainIntro.offsetWidth; ui.chainIntro.classList.add('is-on');
    clearTimeout(introTimer);
    introTimer = setTimeout(() => { ctx.hideChainIntro(); if (!session.held) session.restartClock(); }, ms);
  }

  function onTarget(p) {
    const t = p.target, g = stringGroupById(t.group), name = chordName(t), said = `${spokenName(NOTE_NAMES[t.rootPc])} ${t.quality}!`;
    ctx.clearWrongTimers();
    clearTimeout(introTimer);
    ctx.hideChainIntro(); ctx.hideBossEnd();
    ctx.renderCombo();
    fretboard.clearNotes();
    pitch.reset();
    ui.ring.classList.remove('is-done');
    ctx.setTip('');
    fretboard.highlightString(null);
    fretboard.focusStrings(g.strings);
    ctx.scrollBoardTo(t.kind === 'normal' ? 6 : t.voicings[0].lowestFret + 1);
    ctx.setPrompt(`Strings ${digits(t.group, '·')}`, name, 'listening');
    renderDots(0);
    renderShapes();
    const strings = lastGroup !== t.group ? ` Strings ${digits(t.group, ' ')}!` : '';
    lastGroup = t.group;
    let text = `${said}${strings}`, status = 'Play the 3 notes low to high — any shape', tone = '';
    if (t.kind === 'boss') {
      const it = t.item;
      for (const f of boss.found) for (const n of f.voicing.notes) fretboard.showNote(n.string, n.fret, 'correct', DEGREE_LABELS[n.degree], true);
      ui.foundVal.textContent = `${it.n - 1}/${it.of}`;
      status = `Find every shape · ${it.n - 1} of ${it.of} found${boss.mistakes ? ` · ${boss.mistakes} mistake${boss.mistakes > 1 ? 's' : ''}` : ''}`;
      if (boss.runStart) {
        const first = it.run === 0, prev = first ? '' : shortChord(boss.runs[it.run - 1]);
        showIntro(first ? 'Boss round!' : `${prev} done · chord ${it.run + 1} of ${boss.runs.length}`, `${name}!`, `${it.of} shapes · left to right up the neck —`, BOSS_INTRO_MS, false);
        text = `${first ? 'Boss round! ' : ''}${said} Find every shape!`;
      } else text = '';
    } else if (t.kind === 'climb') {
      const prev = climb.index > 0 ? climb.steps[climb.index - 1].voicing : null;
      status = `Shape ${climb.index + 1} of 3 · Play the 3 notes low to high`;
      if (prev) {
        for (const n of prev.notes) fretboard.showNote(n.string, n.fret, 'root', DEGREE_LABELS[n.degree], true);
        fretboard.showArrow(prev.notes[0], t.voicings[0].notes[0]);
        status = `${climb.hint} →`; tone = 'chain';
        text = '';
      } else {
        showIntro('3 shapes', name, 'Each one higher up the neck —', INTRO_MS, true);
        text = `Climb the neck! ${said}${strings}`;
      }
    }
    if (notice) { ctx.setStatus(notice.text, notice.tone); notice = null; } else ctx.setStatus(status, tone);
    ctx.announce(text, null, { speak: settings().voice, holdClock: true }).then(() => (t.kind === 'boss' ? null : ctx.playCue()));
  }

  function onStep(p) {
    const done = session.steps[p.step - 1];
    fretboard.showNote(done.string, done.fret, 'correct', DEGREE_LABELS[done.degree] || done.name);
    renderDots(p.step);
    const next = session.note;
    ctx.setStatus(`${p.step} of 3 ✓ — now string ${STRINGS[next.string].number}`, 'ok');
  }

  function onHint(p) {
    if (ctx.comboActive()) ctx.comboMiss();
    if (climb) climb.miss();
    if (p.stage === 1) {
      const t = session.target;
      ctx.setTip(t.quality === 'major' ? 'Major: root, 3rd, 5th. Start on the lowest string and go up.' : 'Minor: root, ♭3rd, 5th. Start on the lowest string and go up.');
    } else {
      const n = session.steps[p.step];
      fretboard.showNote(n.string, n.fret, 'hint', DEGREE_LABELS[n.degree] || n.name);
      ctx.setStatus(`${DEGREE_LABELS[n.degree] || ''} ${n.name} — string ${STRINGS[n.string].number} fret ${n.fret}`);
      ui.ring.classList.add('is-done');
    }
  }

  function onCorrect(p) {
    const t = p.target, v = p.played.voicing, lvl = isPath() ? level() : null;
    const result = { clean: p.firstTry && !p.hinted, ms: p.ms, hinted: p.hinted };
    for (const n of v.notes) fretboard.showNote(n.string, n.fret, 'correct', DEGREE_LABELS[n.degree]);
    history.recordTriad(t.quality, result);
    ui.noteName.dataset.state = 'correct';
    renderDots(3);
    let extra = '';
    if (t.kind === 'boss' && boss) {
      if (boss.correct(p.ms) === 'passed') finishBoss(); else extra = `${boss.index} of ${boss.items.length}`;
    } else if (lvl) {
      const covered = store.shapeCovered(lvl.id, t.quality, v.shape);
      const r = store.record(lvl.id, { quality: t.quality, group: t.group, shape: v.shape, firstTry: p.firstTry && !p.hinted, ms: p.ms });
      if (r.bossUnlocked) { extra = 'Boss round unlocked!'; popTile(lvl.id); }
      else if (r.newShape) extra = `New shape: ${SHAPE_NAMES[v.shape - 1]}`;
      else if (covered && t.kind === 'normal' && t.group === lvl.group && store.progress(lvl.id).missing.some(k => k.startsWith(`${t.quality}:`))) extra = 'Try another shape';
    }
    if (ctx.comboActive() && !bossFinale && p.firstTry && !p.hinted) ctx.comboHit(p.ms);
    if (t.kind === 'climb' && climb && !boss) onClimbCorrect(p);
    ctx.setStatus(`Correct · ${(p.ms / 1000).toFixed(1)} s${extra ? ` · ${extra}` : ''}`, 'ok');
    if (settings().voice && settings().speakFeedback) ctx.speakCorrect();
    ctx.updateStats();
    ctx.renderHeatPanel();
    renderAll();
  }

  function onClimbCorrect(p) {
    const r = climb.advance(p.firstTry && !p.hinted);
    if (!r.done) return;
    climb = null;
    if (!r.perfect) return;
    const bonus = CHAIN_BONUS * combo.multiplier;
    if (ctx.comboActive()) { combo.bonus(bonus); ctx.saveComboBests(); ctx.renderCombo(); ctx.flash(ui.comboGain, `+${bonus}`, 1400); }
    ctx.flash(ui.comboShout, 'Chain complete!', 1700);
    ctx.queueShout('Chain complete!');
  }

  function onWrong(p) {
    if (ctx.comboActive()) ctx.comboMiss();
    if (climb) climb.miss();
    ui.noteName.dataset.state = 'wrong';
    ctx.later(() => { if (session.state === 'listening') ui.noteName.dataset.state = 'listening'; }, 600);
    const text = p.octaveOff ? `That's ${p.name}, but an octave too ${p.octaveOff > 0 ? 'high' : 'low'}` : `That was ${p.name}`;
    const spoken = p.octaveOff ? `octave too ${p.octaveOff > 0 ? 'high' : 'low'}` : `that was ${spokenName(p.name)}`;
    const inBoss = !!(boss && boss.state === 'running');
    if (inBoss) { boss.wrong(); renderBossStrip(); }
    ctx.setStatus(inBoss ? `${text} · ${boss.mistakes} mistake${boss.mistakes > 1 ? 's' : ''}` : text, 'bad');
    if (settings().voice && settings().speakFeedback) ctx.voice.speak(spoken, ctx.voiceOpts());
    ctx.updateStats();
  }

  /** Session events while the Triads mode runs. Returns true when handled. */
  function onEvent(type, p) {
    if (session.mode !== 'triads' || !session.matcher) return false;
    switch (type) {
      case 'target': onTarget(p); return true;
      case 'step': onStep(p); return true;
      case 'hint': onHint(p); return true;
      case 'correct': onCorrect(p); return true;
      case 'wrong': onWrong(p); return true;
      default: return false;
    }
  }

  function onSkip() {
    climb = null;
    const t = session.target;
    if (t) history.recordTriad(t.quality, { skipped: true });
    if (boss && boss.state === 'running') failBoss('Boss round over: skipping ends it. Try again anytime');
  }

  function stopped() {
    clearTimeout(introTimer);
    boss = null; climb = null; notice = null; lastGroup = null;
    renderAll();
    renderIdle();
    if (bossFinale) { ctx.setStatus(`Level ${bossFinale.level} complete ${'★'.repeat(bossFinale.stars)}`, 'ok'); bossFinale = null; }
  }

  // ---------- boss round ----------

  function finishBoss() {
    const lvl = TRIAD_LEVELS.find(l => l.id === boss.levelId), r = store.completeBoss(lvl.id, boss.avgMs, boss.mistakes);
    const next = r.next && TRIAD_LEVELS.find(l => l.id === r.next);
    bossFinale = { level: lvl.id, stars: r.stars };
    ui.bossEndKicker.textContent = r.stars === 3 ? 'Flawless!' : r.stars === 2 ? 'Boss round cleared!' : 'Boss round beaten!';
    ui.bossEndStars.innerHTML = [1, 2, 3].map(n => `<span class="${n <= r.stars ? 'is-on' : ''}">★</span>`).join('');
    ui.bossEndStats.innerHTML = `<div><b>${boss.runs.map(shortChord).join(' · ')}</b><span>every shape, frets 0-12</span></div>`
      + `<div><b>${boss.items.length}</b><span>shapes</span></div><div><b>${clock(boss.totalMs)}</b><span>total</span></div>`
      + `<div><b>${(boss.avgMs / 1000).toFixed(1)} s</b><span>per shape</span></div><div><b>${boss.mistakes}</b><span>mistake${boss.mistakes === 1 ? '' : 's'}</span></div>`;
    ui.bossEndNext.textContent = next ? `Level ${next.id} unlocked: ${next.title}` : 'Path complete: every level done';
    ui.bossEnd.hidden = false;
    ui.bossEnd.classList.remove('is-on'); void ui.bossEnd.offsetWidth; ui.bossEnd.classList.add('is-on');
    boss = null;
    popTile(lvl.id);
    setTimeout(() => { if (session.state !== 'idle') ctx.toggleSession(); }, 0);
  }

  function failBoss(text) {
    boss = null;
    if (text) notice = { text, tone: 'bad' };
    renderAll();
  }

  async function startBoss() {
    const lvl = level();
    if (!active() || !isPath() || !store.progress(lvl.id).bossUnlocked) return;
    const b = createTriadBoss(lvl);
    if (b.state !== 'running') { ctx.setStatus('No shape of this level fits.', 'bad'); return; }
    boss = b; notice = null; climb = null; bossFinale = null; ctx.hideBossEnd();
    renderAll();
    if (session.state === 'idle') await ctx.toggleSession(); else session.skip();
  }

  function renderBossStrip() {
    const on = !!(boss && boss.state === 'running');
    ui.bossStrip.hidden = !on;
    ui.stage.classList.toggle('is-focus', on);
    ui.foundBlock.hidden = !on;
    ui.timeBlock.hidden = on;
    if (!on) { ui.bossHp.hidden = false; return; }
    const cur = boss.items[boss.index];
    ui.bossTitle.textContent = `★ Boss · Level ${boss.levelId} · ${chordName(cur)} · chord ${cur.run + 1}/${boss.runs.length}`;
    ui.bossHp.hidden = true; ui.bossCd.hidden = true;
    ui.bossHearts.textContent = `${boss.mistakes} ✗`;
    ui.bossHearts.setAttribute('aria-label', `${boss.mistakes} mistakes`);
    ui.foundVal.textContent = `${boss.found.length}/${cur.of}`;
  }

  // ---------- level row ----------

  const tiles = TRIAD_LEVELS.map((l) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'path__tile'; b.dataset.id = l.id;
    b.innerHTML = `<b class="path__num">L${l.id}</b><span class="path__names">${l.short}</span><span class="path__mark"></span><span class="tdots" aria-hidden="true"></span>`;
    b.addEventListener('click', () => {
      if (l.id === store.current) { el.pop.hidden = !el.pop.hidden; return; }
      if (!store.select(l.id)) return;
      el.pop.hidden = true;
      boss = null; notice = null; climb = null;
      openTip();
      renderAll();
      if (session.state !== 'idle' && session.mode === 'triads') session.skip();
    });
    li.appendChild(b);
    el.map.appendChild(li);
    return b;
  });
  document.addEventListener('pointerdown', (e) => { if (!el.pop.hidden && !el.row.contains(e.target)) el.pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.pop.hidden = true; });

  function popTile(id) {
    const t = tiles[id - 1];
    t.classList.remove('is-pop'); void t.offsetWidth; t.classList.add('is-pop');
  }

  function renderRow() {
    const show = active() && isPath();
    el.row.hidden = !show;
    if (!show) { el.tipCard.hidden = true; return; }
    const lvl = level(), pr = store.progress(lvl.id), running = !!(boss && boss.state === 'running');
    tiles.forEach((b, i) => {
      const l = TRIAD_LEVELS[i], open = store.isUnlocked(l.id), done = store.isDone(l.id), now = l.id === lvl.id;
      b.disabled = !open;
      b.classList.toggle('is-locked', !open);
      b.classList.toggle('is-done', done);
      b.classList.toggle('is-current', now);
      if (now) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('.path__mark').innerHTML = !open ? LOCK_SVG : done ? stars(store.stars(l.id)) : '';
      const dots = b.querySelector('.tdots');
      if (now) {
        const have = new Set(store.progress(l.id).missing);
        dots.innerHTML = requiredShapes(l).map(k => `<i class="${have.has(k) ? '' : 'is-on'}" title="${qualityLabel(k.split(':')[0])} · ${SHAPE_NAMES[+k.split(':')[1] - 1]}"></i>`).join('');
      } else dots.innerHTML = '';
      b.title = `Level ${l.id} · ${l.title}${now ? ' (click for progress)' : ''}`;
      b.setAttribute('aria-label', `Level ${l.id}, ${l.title}${!open ? ', locked' : done ? `, done, ${store.stars(l.id)} of 3 stars` : now ? ', current' : ''}`);
    });
    tiles[lvl.id - 1].title = `Level ${lvl.id} · ${lvl.title}: ${pr.answered}/${WINDOW} answered, ${pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`} first try, ${pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`} avg, shapes ${pr.shapes}/${pr.shapesTotal}`;
    el.popTitle.textContent = `Level ${lvl.id} · ${lvl.title}`;
    el.popGoal.textContent = pr.bossUnlocked ? 'Boss round open: play every shape of each of the level\'s new chords, left to right up the neck.'
      : `Unlock the boss: last ${WINDOW} answers ${Math.round(FIRST_TRY_MIN * 100)}%+ first try, ${AVG_MS_MAX / 1000} s or less on average, and every shape found.`;
    const box = (label, value, goal, met) => `<div class="pstat${met ? ' is-met' : ''}"><span class="pstat__label">${label}</span><span class="pstat__value">${value}${met ? ' ✓' : ''}</span><span class="pstat__goal">${goal}</span></div>`;
    el.popStats.innerHTML = box('Answered', `${pr.answered}/${WINDOW}`, 'last 20', pr.met.count)
      + box('First try', pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`, `${Math.round(FIRST_TRY_MIN * 100)}% or more`, pr.met.firstTry)
      + box('Avg time', pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`, `${AVG_MS_MAX / 1000} s or less`, pr.met.time)
      + box('Shapes', `${pr.shapes}/${pr.shapesTotal}`, 'every shape', pr.met.shapes);
    el.bossBtn.disabled = !pr.bossUnlocked || running;
    el.bossBtn.classList.toggle('is-ready', pr.bossUnlocked && !running);
    el.bossBtn.innerHTML = running ? `Boss ${boss.index}/${boss.items.length}` : `${pr.bossUnlocked ? '★' : LOCK_SVG} ${pr.done ? 'Boss again' : 'Boss'}`;
    el.bossBtn.title = pr.bossUnlocked ? 'Start the boss round for this level' : 'Unlock the boss: see the level progress';
    el.popBoss.textContent = running ? 'Wrong notes count against your stars. Skipping ends it.'
      : pr.bossUnlocked ? `${pr.done ? `Best ${stars(pr.stars)} · ` : ''}★ pass · ★★ avg ${STAR2_MS / 1000} s, 2 mistakes max · ★★★ avg ${STAR3_MS / 1000} s, none` : '';
    renderTip();
  }

  function renderAll() {
    ctx.syncComboContext();
    renderBossStrip();
    ctx.renderCombo();
    renderRow();
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

  // ---------- Custom: Major / Minor and the string groups ----------

  const chip = (parent, text, attrs, onClick) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip'; b.textContent = text; b.setAttribute('aria-pressed', 'false');
    Object.assign(b.dataset, attrs);
    b.addEventListener('click', onClick);
    parent.appendChild(b);
  };
  const toggleIn = (key, valid, id) => {
    const on = new Set(settings()[key]);
    on.has(id) ? on.delete(id) : on.add(id);
    if (on.size === 0) return;
    ctx.commit({ [key]: valid.filter(v => on.has(v)) });
    if (session.state !== 'idle' && session.mode === 'triads') session.skip();
  };
  for (const q of QUALITIES) chip(el.qualityPicker, qualityLabel(q), { id: q }, () => toggleIn('triadQualities', QUALITIES, q));
  for (const g of STRING_GROUPS) chip(el.groupPicker, `Strings ${g.label}`, { id: g.id }, () => toggleIn('triadGroups', STRING_GROUPS.map(x => x.id), g.id));
  for (const m of [['path', 'Path', 'Work through the levels, a few chords at a time'], ['custom', 'Custom', 'Choose major or minor and the string groups yourself']]) {
    chip(el.modePicker, m[1], { id: m[0] }, () => {
      if (settings().triadMode === m[0]) return;
      boss = null; notice = null; climb = null;
      ctx.commit({ triadMode: m[0] });
      if (session.state !== 'idle' && session.mode === 'triads') session.skip();
    });
    el.modePicker.lastChild.title = m[2];
  }

  // ---------- Show shapes: the big panel ----------

  /** One 3-string diagram: columns are frets counted from shape 1's lowest note; root salmon, the rest cyan. */
  function diagramSvg(sh, group) {
    const W = 300, X0 = 34, PAD = 8, ROW = 24, TOPY = 12;
    const rels = sh.notes.map(n => n.rel), lo = Math.min(...rels), hi = Math.max(...rels), cols = Math.max(4, hi - lo + 1);
    const colW = (W - X0 - PAD) / cols;
    const rank = [...group.strings].sort((a, b) => a - b);          // thinnest string on top
    const y = (s) => TOPY + rank.indexOf(s) * ROW;
    const x = (rel) => X0 + (rel - lo + 0.5) * colW;
    const H = TOPY + (rank.length - 1) * ROW + 24;
    const p = [`<rect class="tri-board" x="${X0}" y="${TOPY - 10}" width="${W - X0 - PAD}" height="${(rank.length - 1) * ROW + 20}" rx="3"/>`];
    for (let c = 1; c < cols; c++) p.push(`<line class="tri-fret" x1="${X0 + c * colW}" x2="${X0 + c * colW}" y1="${TOPY - 10}" y2="${TOPY + (rank.length - 1) * ROW + 10}"/>`);
    for (const s of rank) {
      p.push(`<line class="tri-string" x1="${X0}" x2="${W - PAD}" y1="${y(s)}" y2="${y(s)}" stroke-width="${[1.3, 1.6, 2, 2.5, 3, 3.5][s]}"/>`);
      p.push(`<text class="tri-snum" x="${X0 - 12}" y="${y(s) + 4}">${STRINGS[s].number}</text>`);
    }
    for (const n of sh.notes) {
      const cls = n.degree === 0 ? 'tri-disc tri-disc--root' : 'tri-disc';
      p.push(`<g class="${cls}" transform="translate(${x(n.rel)} ${y(n.string)})"><circle class="tri-sh" cx="2" cy="2" r="11"/><circle class="tri-dot" r="11"/><text y="4.5">${n.label}</text></g>`);
    }
    for (let r = lo; r < lo + cols; r++) p.push(`<text class="tri-num" x="${x(r)}" y="${H - 4}">${r === 0 ? '0' : `+${r}`}</text>`);
    return `<svg class="tri-svg" viewBox="0 0 ${W} ${H}" width="${W}" role="img" aria-label="Shape ${sh.index}, ${group.label}">${p.join('')}</svg>`;
  }

  /** The quality and group the panel shows: the live question, else the level's (Path) or the first Custom picks. */
  function shapesSubject() {
    const t = session.state !== 'idle' && session.mode === 'triads' ? session.target : null;
    if (t && t.group) return { quality: t.quality, group: t.group, name: chordName(t) };
    if (isPath()) {
      const lvl = level(), q = QUALITIES.find(x => lvl.pool.some(c => c.group === lvl.group && c.quality === x)) || 'major';
      return { quality: q, group: lvl.group, name: `${qualityLabel(q)} triads` };
    }
    const s = settings();
    return { quality: s.triadQualities[0], group: s.triadGroups[0], name: `${qualityLabel(s.triadQualities[0])} triads` };
  }

  function renderShapes() {
    const open = active() && settings().showShapes;
    el.shapes.hidden = !open;
    ui.prompt.classList.toggle('is-away', open);
    ui.shapesToggle.hidden = !active();
    ui.shapesToggle.setAttribute('aria-pressed', open);
    ui.shapesToggle.textContent = open ? 'Shapes ▴' : 'Shapes ▾';
    if (!open) { shapesKey = ''; return; }
    const sub = shapesSubject(), g = stringGroupById(sub.group), key = `${sub.name}|${sub.group}`;
    if (key === shapesKey) return;
    shapesKey = key;
    el.shapesTitle.textContent = `${sub.name} · strings ${digits(sub.group, ' · ')}`;
    const lay = shapeLayout(sub.quality, sub.group);
    if (!lay) { el.shapesBody.textContent = ''; return; }
    const frets = (n) => `+${n} fret${n === 1 ? '' : 's'}`;
    el.shapesBody.innerHTML = lay.shapes.map((sh, i) => `<figure class="tri-fig">
        <figcaption><b>Shape ${sh.index}</b> ${SHAPE_NAMES[sh.index - 1]}${sh.offset ? ` · starts ${frets(sh.offset)}` : ''}</figcaption>${diagramSvg(sh, g)}</figure>${
        i < 2 ? `<div class="tri-arrow" aria-label="Next shape ${frets(lay.upFrets[i])} higher"><b>${frets(lay.upFrets[i])}</b><span>→</span></div>` : ''}`).join('')
      + `<div class="tri-arrow tri-arrow--loop"><b>${frets(lay.upFrets[2])}</b><span>→ shape 1 again, an octave up</span></div>`;
  }
  el.shapesClose.addEventListener('click', () => ctx.commit({ showShapes: false }));

  // ---------- idle strip, mode switching, rendering from settings ----------

  function idleSubject() {
    if (isPath()) { const l = level(), c = l.added[0] || l.pool[0]; return { group: l.group, name: chordName({ rootPc: c.root, quality: c.quality }) }; }
    const s = settings(); return { group: s.triadGroups[0], name: `${NOTE_NAMES[0]} ${s.triadQualities[0]}` };
  }

  function renderIdle() {
    if (!active() || session.state !== 'idle') return;
    const s = idleSubject();
    fretboard.focusStrings(stringGroupById(s.group).strings);
    ctx.setPrompt(`Strings ${digits(s.group, '·')}`, s.name, 'idle');
    renderDots(0);
    ctx.setStatus('Press Start, then play the 3 notes low to high — any shape');
  }

  /** Called from applySettingsToUI. */
  function render() {
    const on = active();
    el.modePicker.hidden = !on;
    el.modePicker.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c.dataset.id === (settings().triadMode === 'custom' ? 'custom' : 'path')));
    const custom = on && !isPath();
    el.qualityPicker.hidden = !custom;
    el.groupPicker.hidden = !custom;
    el.qualityPicker.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', settings().triadQualities.includes(c.dataset.id)));
    el.groupPicker.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', settings().triadGroups.includes(c.dataset.id)));
    if (!on) fretboard.focusStrings(null);
    renderAll();
    renderShapes();
    if (on && isPath() && session.state === 'idle' && !store.tipSeen(store.current)) openTip();
    renderIdle();
  }

  return {
    pick, onEvent, onSkip, stopped, render, renderBossStrip, startBoss,
    get boss() { return boss; },
    active,
    warm: () => ctx.voice.preload(TRIAD_CLIPS),
    cancelBoss() { boss = null; climb = null; notice = null; },
    dropClimb() { climb = null; },
    comboOn: () => active() && !boss,
    comboKey: () => (!active() ? null : boss ? 'boss' : isPath() ? `triad:${store.current}` : 'triad:custom'),
    bests: () => (isPath() ? store.bests(store.current) : customBest.get()),
    saveBests(b) { if (isPath()) store.saveBests(store.current, b); else customBest.save(b); },
    resetPath() { store.reset(); boss = null; climb = null; tipOpen = false; },
    store,
  };
}
