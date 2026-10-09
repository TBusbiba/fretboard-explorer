// Canvas renderer for the vibrato lane: time flows left to right, pitch (in
// cents relative to the note) up and down. Draws the grid, the corridor, the
// note/target lines, a phase-locked ghost of the ideal motion, the coloured
// trace, cycle markers and the "now" dot.

const COL = {
  bg: '#110f0c', grid: 'rgba(255,255,255,0.06)', accent: '#f2b544', accentDim: 'rgba(242,181,68,0.35)',
  corridor: 'rgba(242,181,68,0.05)', ghost: 'rgba(255,255,255,0.22)', text: '#9a9283', faint: '#5f594f',
  ok: '#4ed19a', warn: '#f2b544', bad: '#f0624d',
};

export function createLane(canvas, { visibleSeconds = 4 } = {}) {
  const ctx = canvas.getContext('2d');
  let dpr = 1, W = 0, H = 0;

  function resize() {
    dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener('resize', resize);

  /**
   * @param {object} v
   *   now, points [{t, c, band}], mode, depth, bendCents, labels {home, target},
   *   cycles [{far:{t,c}, homePt:{t,c}, excursion, ret}], rate, lastFarT, gap (bool: silent now)
   */
  function draw(v) {
    const padL = 14, padR = 64, padT = 14, padB = 26;
    const bend = v.mode === 'bend';
    const home = bend ? v.bendCents : 0;
    const far = bend ? v.bendCents - v.depth : v.depth;
    // bend mode keeps the base note (0¢) in view so the bend-up is visible
    const lo = Math.min(bend ? 0 : home, far) - Math.max(50, v.depth * 0.5);
    const hi = Math.max(home, far) + Math.max(50, v.depth * 0.5);
    const Y = c => padT + (hi - c) / (hi - lo) * (H - padT - padB);
    const X = t => padL + (1 - (v.now - t) / visibleSeconds) * (W - padL - padR);

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, W, H);

    // grid every 50 cents, labelled on the right
    ctx.font = '12px Work Sans'; ctx.textAlign = 'left';
    const step = hi - lo > 400 ? 100 : 50;
    for (let c = Math.ceil(lo / step) * step; c <= hi; c += step) {
      ctx.strokeStyle = COL.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, Y(c)); ctx.lineTo(W - padR + 6, Y(c)); ctx.stroke();
      ctx.fillStyle = COL.faint; ctx.fillText((c > 0 ? '+' : '') + c + '¢', W - padR + 12, Y(c) + 4);
    }
    // corridor
    ctx.fillStyle = COL.corridor;
    ctx.fillRect(padL, Y(Math.max(home, far) + 15), W - padL - padR, Y(Math.min(home, far) - 15) - Y(Math.max(home, far) + 15));
    // base (bend), note/target lines
    const line = (c, color, dash, width) => { ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(padL, Y(c)); ctx.lineTo(W - padR, Y(c)); ctx.stroke(); ctx.restore(); };
    if (bend) { line(0, COL.accentDim, [], 1.5); line(home, COL.accent, [], 2); }
    else { line(0, COL.accent, [], 2); line(far, COL.accent, [6, 6], 1.5); }
    ctx.fillStyle = COL.accent; ctx.font = '600 12px Outfit';
    if (bend) { ctx.fillText(v.labels.base || 'base', padL + 6, Y(0) - 6); ctx.fillText(v.labels.target || 'target', padL + 6, Y(home) - 6); }
    else { ctx.fillText(v.labels.home || 'note', padL + 6, Y(0) - 6); ctx.fillText(v.labels.target || 'target', padL + 6, Y(far) - 6); }

    // ghost: ideal motion phase-locked to the last detected far point
    if (v.rate && v.lastFarT != null) {
      const dir = bend ? -1 : 1;
      ctx.save(); ctx.strokeStyle = COL.ghost; ctx.lineWidth = 1.5; ctx.setLineDash([3, 5]); ctx.beginPath();
      let first = true;
      const from = Math.max(v.now - visibleSeconds, v.ghostFrom ?? -Infinity);
      for (let t = from; t <= v.now; t += 0.01) {
        const ph = 0.5 + 0.5 * Math.cos(2 * Math.PI * v.rate * (t - v.lastFarT)); // 1 at far points
        const c = home + dir * v.depth * ph;
        if (first) { ctx.moveTo(X(t), Y(c)); first = false; } else ctx.lineTo(X(t), Y(c));
      }
      ctx.stroke(); ctx.restore();
    }

    // trace
    ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const pts = v.points;
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      if (b.t - a.t > 0.08) continue;                       // silence gap
      ctx.strokeStyle = COL[b.band] || COL.ok;
      ctx.beginPath(); ctx.moveTo(X(a.t), Y(a.c)); ctx.lineTo(X(b.t), Y(b.c)); ctx.stroke();
    }
    // cycle markers: far point graded by depth accuracy, home point by return accuracy
    for (const cy of v.cycles || []) {
      const dErr = Math.abs(cy.excursion - v.depth) / v.depth;
      const farCol = dErr < 0.2 ? COL.ok : dErr < 0.4 ? COL.warn : COL.bad;
      const retCol = Math.abs(cy.ret) < 15 ? COL.ok : Math.abs(cy.ret) < 35 ? COL.warn : COL.bad;
      dot(X(cy.far.t), Y(cy.far.c), farCol, 4);
      dot(X(cy.homePt.t), Y(cy.homePt.c), retCol, 4);
    }
    // now dot
    const last = pts[pts.length - 1];
    if (last && v.now - last.t < 0.15) {
      const col = COL[last.band] || COL.ok;
      ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 18; dot(X(last.t), Y(last.c), col, 7); ctx.restore();
      ctx.fillStyle = '#efe9dd'; ctx.font = '600 13px Outfit'; ctx.textAlign = 'center';
      ctx.fillText((last.c >= 0 ? '+' : '') + Math.round(last.c) + '¢', X(last.t), Y(last.c) - 14);
    } else if (v.message) {
      ctx.fillStyle = COL.text; ctx.font = '500 15px Outfit'; ctx.textAlign = 'center';
      ctx.fillText(v.message, (padL + W - padR) / 2, H / 2);
    }
  }

  function dot(x, y, color, r) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  return { draw, resize };
}
