// Triads > Progressions: chord progressions in a key, each chord the closest shape to the one just
// played. Silent whatever the Voice setting. The rules are pure and tested (keys.js, progression.js,
// progression-path.js); this file is the DOM side. triads-ui.js owns the mode chip and delegates here.

import { STRINGS, DEGREE_LABELS, stringGroupById } from './notes.js';
import { resolveProgression } from './keys.js';
import { createProgressionRun } from './progression.js';
import {
  PROG_LEVELS, createProgressionPathStore, createProgressionBag, createProgressionBoss, starsFor,
} from './progression-path.js';
import { WINDOW, FIRST_TRY_MIN, AVG_MS_MAX } from './path.js';
import * as hud from './hud.js';

const LOCK_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';
const stars = (n) => '★'.repeat(n) + '☆'.repeat(3 - n);
const digits = (group) => [...group].join('·');
const BOSS_INTRO_MS = 1800;
const clock = (ms) => { const t = Math.round(ms / 100) / 10, m = Math.floor(t / 60); return m ? `${m}:${(t - m * 60).toFixed(1).padStart(4, '0')}` : `${t.toFixed(1)} s`; };
const IDLE_STATUS = 'Press Start, then play each chord low to high, staying close';

export function createProgressionsUI(ctx, helpers) {
  const { ui, session, fretboard, history, pitch } = ctx;
  const $ = ctx.$;
  const store = createProgressionPathStore();
  const bag = createProgressionBag();
  const el = {
    row: $('prog-path'), map: $('prog-map'), bossBtn: $('prog-boss-btn'), pop: $('prog-pop'),
    popTitle: $('prog-pop-title'), popGoal: $('prog-pop-goal'), popStats: $('prog-pop-stats'), popBoss: $('prog-pop-boss'),
    display: $('prog-display'), displayLab: $('prog-display-lab'),
    foundLabel: ui.foundBlock.querySelector('small'),
  };

  let boss = null;
  let notice = null;
  let introTimer = 0;
  let missed = new Set();
  let mistakes = 0;
  let times = [];
  let allClean = true;

  const settings = () => ctx.getSettings();
  const active = () => settings().mode === 'triads' && settings().triadMode === 'progressions';
  const level = () => store.currentLevel;
  const live = () => {
    const t = session.state !== 'idle' && session.mode === 'triads' ? session.target : null;
    return t && t.run ? t : null;
  };
  const numbers = () => settings().progDisplay === 'numbers';
  const labelOf = (c) => (numbers() ? c.degree : c.name);

  // ---------- picking the next question ----------

  function pick() {
    const inBoss = !!(boss && boss.state === 'running');
    let entry, chords, levelId;
    if (inBoss) { entry = boss.entry; chords = boss.chords; levelId = boss.levelId; }
    else {
      const lvl = level();
      entry = bag.next(lvl);
      if (!entry) return null;
      chords = resolveProgression(entry.keyName, entry.progId);
      levelId = lvl.id;
    }
    if (!chords.length) return null;
    const run = createProgressionRun(chords, entry.group);
    return {
      kind: inBoss ? 'progression-boss' : 'progression', keyName: entry.keyName, progId: entry.progId, group: entry.group,
      chords, display: settings().progDisplay, rootPc: chords[0].pc, quality: chords[0].quality,
      voicings: run.candidates, run, levelId, entry,
    };
  }

  // ---------- the strip: question line, chord chips, counter, status ----------

  function questionLine(t) {
    const once = t.kind === 'progression-boss' ? t.chords.slice(0, t.chords.length / 2) : t.chords;
    return `Key of ${t.keyName} · ${once.map(labelOf).join(' – ')}${t.kind === 'progression-boss' ? ' ×2' : ''} · strings ${digits(t.group)}`;
  }

  function renderLive(done = false) {
    const t = live();
    if (!t) return;
    const run = t.run, labels = t.chords.map(labelOf);
    hud.setProgChips(labels, done ? -1 : run.index, done ? labels.length : run.index);
    ui.foundVal.textContent = `${done ? labels.length : run.index + 1}/${labels.length}`;
    ui.bossPips.replaceChildren();
    ctx.setPrompt(questionLine(t), labels[done ? labels.length - 1 : run.index], done ? 'correct' : 'listening');
  }

  function startStatus(t) {
    const run = t.run, i = run.index, name = labelOf(t.chords[i]);
    if (i === 0) return `Play ${name} on strings ${digits(t.group)}, thickest string first`;
    return `Stay close: the nearest ${name} to your ${labelOf(t.chords[i - 1])}`;
  }

  function status(text, tone) {
    const t = live();
    const extra = t && t.kind === 'progression-boss' && boss && boss.mistakes && tone === 'bad' ? ` · ${boss.mistakes} mistake${boss.mistakes > 1 ? 's' : ''}` : '';
    ctx.setStatus(text + extra, tone);
  }

  // ---------- the board ----------

  function outline(v) {
    if (!v) return;
    for (const n of v.notes) {
      const g = fretboard.showNote(n.string, n.fret, 'hint', '', true);
      if (g && g.classList) g.classList.add('ghost');
    }
  }

  function paintBoard(t) {
    fretboard.clearNotes();
    outline(t.run.previous);
    for (let i = 0; i < session.step; i++) {
      const n = session.steps[i];
      fretboard.showNote(n.string, n.fret, 'correct', DEGREE_LABELS[n.degree] || n.name, true);
    }
  }

  // ---------- session events ----------

  function onTarget(p) {
    const t = p.target, g = stringGroupById(t.group);
    ctx.clearWrongTimers();
    clearTimeout(introTimer);
    ctx.hideChainIntro(); ctx.hideBossEnd();
    ctx.syncComboContext(); ctx.renderCombo();
    fretboard.clearNotes();
    pitch.reset();
    ui.ring.classList.remove('is-done');
    ctx.setTip('');
    fretboard.highlightString(g.strings[0]);
    fretboard.focusStrings(g.strings);
    ctx.scrollBoardTo(5);
    missed = new Set(); mistakes = 0; times = []; allClean = true;
    renderLive();
    if (notice) { ctx.setStatus(notice.text, notice.tone); notice = null; } else ctx.setStatus(startStatus(t));
    if (t.kind === 'progression-boss') {
      session.holdClock();
      const once = t.chords.slice(0, t.chords.length / 2);
      helpers.showIntro('Boss round!', once.map(labelOf).join(' – '), `Key of ${t.keyName} · played twice · strings ${digits(t.group)}`, BOSS_INTRO_MS, false);
      introTimer = setTimeout(() => { if (session.target === t && session.held) session.restartClock(); }, BOSS_INTRO_MS);
    }
    renderAll();
  }

  function onStep(p) {
    const t = session.target;
    paintBoard(t);
    const next = session.note;
    ctx.setStatus(`${p.step} of 3 ✓ — now string ${STRINGS[next.string].number}`, 'ok');
  }

  function onHint(p) {
    const t = session.target;
    if (p.stage === 1) {
      const q = t.chords[t.run.index].quality;
      ctx.setTip(`Start on the ${STRINGS[stringGroupById(t.group).strings[0]].label} string, the lowest note of a shape, then go up. ${q === 'major' ? 'Major: root, 3rd, 5th.' : 'Minor: root, ♭3rd, 5th.'}`);
    } else {
      const n = session.steps[p.step];
      fretboard.showNote(n.string, n.fret, 'hint', DEGREE_LABELS[n.degree] || n.name);
      ctx.setStatus(`${DEGREE_LABELS[n.degree] || ''} ${n.name} — string ${STRINGS[n.string].number} fret ${n.fret}`);
      ui.ring.classList.add('is-done');
    }
  }

  /** One chord played: a timed answer in history and the path store (or the boss). Returns the status extra. */
  function recordChord(p) {
    const t = p.target, chord = t.chords[p.found - 1], clean = p.firstTry && !p.hinted;
    history.recordTriad(chord.quality, { clean, ms: p.ms, hinted: p.hinted });
    times.push(p.ms);
    if (!clean) allClean = false;
    let extra = '';
    if (t.kind === 'progression-boss' && boss) { boss.chordDone(p.ms); extra = `${boss.index} of ${boss.total}`; }
    else {
      const r = store.record(t.levelId, { firstTry: clean, ms: p.ms });
      if (r.bossUnlocked) { extra = 'Boss round unlocked!'; popTile(t.levelId); hud.confetti(); }
    }
    return extra;
  }

  function onShape(p) {
    const t = p.target, extra = recordChord(p);
    fretboard.clearNotes();
    outline(p.voicing);
    helpers.blingTop(p.voicing);
    helpers.flashStrip('hit');
    ctx.bling();
    renderLive();
    ctx.setStatus(`${startStatus(t)}${extra ? ` · ${extra}` : ''}`, 'ok');
    ctx.updateStats();
    ctx.renderHeatPanel();
    renderAll();
  }

  function onCorrect(p) {
    const t = p.target, extra = recordChord(p);
    fretboard.clearNotes();
    outline(p.voicing);
    helpers.blingTop(p.voicing);
    helpers.flashStrip('hit');
    renderLive(true);
    ctx.setStatus(`All ${p.total} chords ✓${extra ? ` · ${extra}` : ''}`, 'ok');
    ctx.updateStats();
    ctx.renderHeatPanel();
    finishRun(t, p);
    renderAll();
  }

  function onWrong() {
    const t = session.target;
    ctx.buzz();
    helpers.flashStrip('miss');
    mistakes += 1;
    if (t && t.run) missed.add(t.run.index);
    if (boss && boss.state === 'running') { boss.wrong(); renderBossStrip(); }
    status('Not that one', 'bad');
    ctx.updateStats();
  }

  /** Session events while Progressions runs. Returns true when handled. */
  function onEvent(type, p) {
    if (session.mode !== 'triads' || !session.target || !session.target.run) return false;
    switch (type) {
      case 'target': onTarget(p); return true;
      case 'step': onStep(p); return true;
      case 'shape': onShape(p); return true;
      case 'dup': return true;
      case 'hint': onHint(p); return true;
      case 'correct': onCorrect(p); return true;
      case 'wrong': onWrong(); return true;
      default: return false;
    }
  }

  function onSkip() {
    const t = live();
    if (t) history.recordTriad(t.chords[t.run.index].quality, { skipped: true });
    if (boss && boss.state === 'running') {
      boss.fail('skip');
      boss = null;
      notice = { text: 'Boss round over: skipping ends it. Try again anytime', tone: 'bad' };
      renderAll();
    }
  }

  function stopped() {
    clearTimeout(introTimer);
    boss = null; notice = null;
    renderAll();
    renderIdle();
  }

  // ---------- run end: the result card ----------

  function finishRun(t, p) {
    const isBoss = t.kind === 'progression-boss' && boss && boss.state === 'passed';
    const avg = times.reduce((a, b) => a + b, 0) / times.length, total = times.reduce((a, b) => a + b, 0);
    let next, kicker, s;
    if (isBoss) {
      const lvl = PROG_LEVELS.find(l => l.id === boss.levelId), r = store.completeBoss(lvl.id, boss.avgMs, boss.mistakes);
      const after = r.next && PROG_LEVELS.find(l => l.id === r.next);
      s = r.stars;
      kicker = s === 3 ? 'Flawless!' : 'Boss round cleared!';
      next = after ? `Level ${after.id} unlocked: ${after.title}` : 'Path complete: every level done';
      boss = null;
      popTile(lvl.id);
    } else {
      s = starsFor(avg, mistakes);
      kicker = s === 3 ? 'Flawless!' : 'Progression cleared!';
      const pr = store.progress(t.levelId);
      next = `${t.progId} in ${t.keyName} · ${mistakes === 0 && allClean ? 'first try' : 'not first try'} · ${pr.bossUnlocked ? 'Boss open' : `${Math.min(pr.answered, WINDOW)}/${WINDOW} chords toward the boss`}`;
    }
    const chain = t.chords.map((c, i) => `${i ? '<i>›</i>' : ''}<span${missed.has(i) ? ' class="miss"' : ''}>${labelOf(c)}${missed.has(i) ? ' ✗' : ''}</span>`).join('');
    ui.bossEnd.classList.remove('is-lost');
    ui.bossEndKicker.textContent = kicker;
    ui.bossEndStars.innerHTML = [1, 2, 3].map(n => `<span class="${n <= s ? 'is-on' : ''}">★</span>`).join('');
    ui.bossEndStats.innerHTML = `<div><b>${clock(total)}</b><span>time</span></div>`
      + `<div><b>${mistakes}</b><span>mistake${mistakes === 1 ? '' : 's'}</span></div>`
      + `<div><b>${p.total} / ${p.total}</b><span>chords</span></div>`;
    ui.bossEndNext.innerHTML = `<div class="mk-path">${chain}</div><div class="mk-path__note"></div>`;
    ui.bossEndNext.querySelector('.mk-path__note').textContent = next;
    ui.bossEndGo.textContent = isBoss ? 'Keep going' : 'Next key';
    ui.bossEnd.hidden = false;
    ui.bossEnd.classList.remove('is-on'); void ui.bossEnd.offsetWidth; ui.bossEnd.classList.add('is-on');
    if (isBoss) hud.confetti();
    setTimeout(() => { if (session.state !== 'idle') ctx.toggleSession(); }, 0);
  }

  // ---------- boss round ----------

  async function startBoss() {
    const lvl = level();
    if (!active() || !store.progress(lvl.id).bossUnlocked) return;
    const b = createProgressionBoss(lvl);
    if (b.state !== 'running') { ctx.setStatus('No progression fits this level.', 'bad'); return; }
    boss = b; notice = null; ctx.hideBossEnd();
    renderAll();
    if (session.state === 'idle') await ctx.toggleSession(); else session.skip();
  }

  function renderBossStrip() {
    const running = !!(boss && boss.state === 'running'), t = live();
    ui.stage.classList.toggle('is-focus', running);
    ui.foundBlock.hidden = !t;
    ui.timeBlock.hidden = running;
    if (!running) { ui.bossHp.hidden = false; return; }
    ui.bossTitle.textContent = `L${boss.levelId} · ${boss.entry.keyName} ${boss.entry.progId}`;
    $('boss-hearts-label').textContent = 'Mistakes';
    ui.bossHp.hidden = true; ui.bossCd.hidden = true;
    ui.bossHearts.textContent = `${boss.mistakes} ✗`;
    ui.bossHearts.setAttribute('aria-label', `${boss.mistakes} mistakes`);
    if (t) ui.foundVal.textContent = `${Math.min(t.run.index + 1, boss.total)}/${boss.total}`;
  }

  function cancelBoss() { boss = null; notice = null; }

  // ---------- level row ----------

  const tiles = PROG_LEVELS.map((l) => {
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
      boss = null; notice = null;
      renderAll();
      if (session.state !== 'idle' && session.mode === 'triads') session.skip();
    });
    li.appendChild(b);
    el.map.appendChild(li);
    return b;
  });
  document.addEventListener('pointerdown', (e) => { if (!el.pop.hidden && !el.row.contains(e.target)) el.pop.hidden = true; });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') el.pop.hidden = true; });

  const critsOf = (pr) => [
    { text: `${Math.min(pr.answered, WINDOW)} / ${WINDOW} chords`, state: pr.met.count ? 'met' : 'open' },
    hud.crit(`${pr.firstTryPct}% first try`, pr.firstTryPct, pr.met.firstTry, `≥ ${Math.round(FIRST_TRY_MIN * 100)}% 1st try`),
    hud.crit(`avg ${pr.avgMs == null ? '' : (pr.avgMs / 1000).toFixed(1)} s`, pr.avgMs, pr.met.time, `avg ≤ ${AVG_MS_MAX / 1000} s`),
  ];

  function showLocked(l) {
    const before = PROG_LEVELS[l.id - 2], isCurrent = before.id === store.current;
    el.pop.hidden = true;
    hud.showLock({
      kicker: `Path · Level ${l.id}`, title: `${l.title} is locked`,
      text: `Beat the L${before.id} boss to open it${isCurrent ? `: ${WINDOW} chords, ${Math.round(FIRST_TRY_MIN * 100)}% clean first try, ${AVG_MS_MAX / 1000} s average or less.` : ': finish the earlier levels first.'}`,
      rows: isCurrent ? critsOf(store.progress(before.id)) : [],
      backLabel: `Back to L${store.current}`, onBack: () => {},
    });
  }

  function popTile(id) {
    const t = tiles[id - 1];
    t.classList.remove('is-pop'); void t.offsetWidth; t.classList.add('is-pop');
  }

  function renderRow() {
    const lvl = level(), pr = store.progress(lvl.id), running = !!(boss && boss.state === 'running');
    tiles.forEach((b, i) => {
      const l = PROG_LEVELS[i], open = store.isUnlocked(l.id), done = store.isDone(l.id), now = l.id === lvl.id;
      b.setAttribute('aria-disabled', String(!open));
      b.classList.toggle('is-locked', !open);
      b.classList.toggle('is-done', done);
      b.classList.toggle('is-current', now);
      if (now) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
      b.querySelector('.path__mark').innerHTML = !open ? LOCK_SVG : done ? stars(store.stars(l.id)) : '';
      b.title = `Level ${l.id} · ${l.title}${now ? ' (click for progress)' : ''}`;
      b.setAttribute('aria-label', `Level ${l.id}, ${l.title}${!open ? ', locked' : done ? `, done, ${store.stars(l.id)} of 3 stars` : now ? ', current' : ''}`);
    });
    tiles[lvl.id - 1].title = `Level ${lvl.id} · ${lvl.title}: ${pr.answered}/${WINDOW} answered, ${pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`} first try, ${pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`} avg`;
    el.popTitle.textContent = `Level ${lvl.id} · ${lvl.title}`;
    const missing = [];
    if (!pr.met.count) missing.push(`${WINDOW - pr.answered} more chord${WINDOW - pr.answered === 1 ? '' : 's'}`);
    if (pr.answered && !pr.met.firstTry) missing.push(`first try ${pr.firstTryPct}%, needs ${Math.round(FIRST_TRY_MIN * 100)}%`);
    if (pr.avgMs != null && !pr.met.time) missing.push(`average ${(pr.avgMs / 1000).toFixed(1)} s, needs ${AVG_MS_MAX / 1000} s or less`);
    el.popGoal.textContent = pr.bossUnlocked ? `Boss round open: ${lvl.boss.keyName} ${lvl.boss.progId}, played twice in a row.`
      : `Unlock the boss: last ${WINDOW} chords, ${Math.round(FIRST_TRY_MIN * 100)}%+ first try (no wrong note, no hint), ${AVG_MS_MAX / 1000} s or less per chord on average.${missing.length ? ` Still missing: ${missing.join('; ')}.` : ''}`;
    const box = (label, value, goal, met) => `<div class="pstat${met ? ' is-met' : ''}"><span class="pstat__label">${label}</span><span class="pstat__value">${value}${met ? ' ✓' : ''}</span><span class="pstat__goal">${goal}</span></div>`;
    el.popStats.innerHTML = box('Chords', `${pr.answered}/${WINDOW}`, 'last 20', pr.met.count)
      + box('First try', pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`, `${Math.round(FIRST_TRY_MIN * 100)}% or more`, pr.met.firstTry)
      + box('Avg per chord', pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`, `${AVG_MS_MAX / 1000} s or less`, pr.met.time);
    hud.setPath({
      level: { n: lvl.id, sub: lvl.title },
      note: hud.opensNote(lvl.id, PROG_LEVELS.length, pr.done), locked: !pr.done && lvl.id < PROG_LEVELS.length,
      meter: running
        ? { n: boss.index, of: boss.total, crits: [{ text: `${boss.mistakes} mistake${boss.mistakes === 1 ? '' : 's'}`, state: boss.mistakes ? 'bad' : 'met' }, { text: boss.times.length ? `avg ${(boss.avgMs / 1000).toFixed(1)} s` : `avg ≤ ${AVG_MS_MAX / 1000} s`, state: 'open' }] }
        : { n: Math.min(pr.answered, WINDOW), of: WINDOW, crits: critsOf(pr).slice(1) },
    });
    el.bossBtn.disabled = !pr.bossUnlocked || running;
    el.bossBtn.classList.toggle('is-ready', pr.bossUnlocked && !running);
    el.bossBtn.innerHTML = running ? `Boss ${boss.index}/${boss.total}` : `${pr.bossUnlocked ? '★' : LOCK_SVG} ${pr.done ? 'Boss again' : pr.bossUnlocked ? 'Boss' : `Boss ${Math.min(pr.answered, WINDOW)}/${WINDOW}`}`;
    el.bossBtn.title = pr.bossUnlocked ? 'Start the boss round for this level' : `Unlock the boss: ${pr.answered}/${WINDOW} chords, ${pr.firstTryPct == null ? '—' : `${pr.firstTryPct}%`} first try, ${pr.avgMs == null ? '—' : `${(pr.avgMs / 1000).toFixed(1)} s`} avg per chord`;
    el.popBoss.textContent = running ? 'Wrong notes count against your stars. Skipping ends it.'
      : pr.bossUnlocked ? `${pr.done ? `Best ${stars(pr.stars)} · ` : ''}★ pass · ★★ avg 6 s per chord, 2 mistakes max · ★★★ avg 4 s, none` : '';
  }

  function renderAll() {
    ctx.syncComboContext();
    renderBossStrip();
    ctx.renderCombo();
    if (active()) renderRow();
  }

  el.bossBtn.addEventListener('click', startBoss);
  el.display.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => {
    if (settings().progDisplay !== b.dataset.id) ctx.commit({ progDisplay: b.dataset.id });
  }));

  // ---------- idle strip and rendering from settings ----------

  function renderIdle() {
    if (!active() || session.state !== 'idle') return;
    const g = level().group;
    fretboard.focusStrings(stringGroupById(g).strings);
    ctx.setPrompt(`Strings ${digits(g)}`, 'Progressions', 'standby');
    ui.bossPips.replaceChildren();
    hud.setProgChips(null, 0, 0);
    ctx.setStatus(IDLE_STATUS);
  }

  /** Called from triads render(): shows or hides everything Progressions owns. */
  function render() {
    const on = active();
    el.row.hidden = !on;
    el.display.hidden = !on;
    el.displayLab.hidden = !on;
    if (!on) {
      hud.setProgChips(null, 0, 0);
      delete document.body.dataset.prog;
      el.foundLabel.textContent = 'Found';
      el.pop.hidden = true;
      return;
    }
    document.body.dataset.prog = '1';
    el.foundLabel.textContent = 'Chord';
    el.display.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.id === (numbers() ? 'numbers' : 'names'))));
    renderAll();
    if (live()) renderLive(session.state === 'resolved');
    else renderIdle();
  }

  return {
    active, pick, onEvent, onSkip, stopped, render, renderBossStrip, cancelBoss,
    get boss() { return boss; },
    store,
  };
}
