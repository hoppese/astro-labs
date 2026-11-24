// notebook/chart.js: the notebook's graph, drawn on a canvas. One plot, ONE vertical scale (a second series shares it),
// optional residual strip underneath. The same routine draws the on-screen graph (dark) and the saved PNG (light).
// Nothing is labelled unless the student wrote the label.

import { fmtNum } from './format.js';

export const THEMES = {
  dark: { bg: '#0d141f', ink: '#e4ebf3', muted: '#94a3b5', faint: '#66768a', grid: 'rgba(255,255,255,0.08)', axis: 'rgba(255,255,255,0.3)', s1: '#3987e5', s2: '#d95926', m1: '#f0efec', m2: '#199e70', ring: '#0d141f' },
  light: { bg: '#ffffff', ink: '#0b0b0b', muted: '#52514e', faint: '#8a8984', grid: 'rgba(0,0,0,0.09)', axis: 'rgba(0,0,0,0.45)', s1: '#2a78d6', s2: '#eb6834', m1: '#0b0b0b', m2: '#1baf7a', ring: '#ffffff' },
};
const FONT = "'Source Sans 3', system-ui, -apple-system, 'Segoe UI', sans-serif";

function niceStep(range, target) {
  const raw = range / Math.max(1, target), p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p;
}
function linTicks(lo, hi, target) {
  const step = niceStep(hi - lo, target), out = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
  return { ticks: out, step };
}
function logTicks(lo, hi) {
  const out = [], a = Math.floor(Math.log10(lo) + 1e-9), b = Math.ceil(Math.log10(hi) - 1e-9), few = b - a <= 2;
  const narrow = hi / lo < 12;         // under about a decade: more marks, or the axis has one label
  for (let e = a; e <= b; e++) for (const m of narrow ? [1, 1.5, 2, 3, 4, 5, 7] : few ? [1, 2, 5] : [1]) { const v = m * Math.pow(10, e); if (v >= lo * (1 - 1e-9) && v <= hi * (1 + 1e-9)) out.push(v); }
  return { ticks: out, step: 0 };
}
function tickText(v, step) {
  const a = Math.abs(v);
  if (a !== 0 && (a >= 1e6 || a < 1e-3) && !(step && a < 1e9 && step >= 1)) return fmtNum(v, 3).replace(/\.?0+ ×/, ' ×').replace(/^(−?)1 × /, '$1');
  if (!step) return fmtNum(v, 0);
  const dec = Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
  const s = Math.abs(v).toFixed(dec), [i, f] = s.split('.');
  return (v < 0 ? '−' : '') + (i.length > 4 ? i.replace(/\B(?=(\d{3})+$)/g, ',') : i) + (f ? '.' + f : '');
}
/** Range of the data with a margin; for a log axis only positive values count. */
function rangeOf(vals, log) {
  let lo = Infinity, hi = -Infinity;
  for (const v of vals) if (Number.isFinite(v) && (!log || v > 0)) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  if (!Number.isFinite(lo)) return log ? [1, 10] : [0, 1];
  if (log) { if (lo === hi) return [lo / 3, hi * 3]; const k = Math.pow(hi / lo, 0.06); return [lo / k, hi * k]; }
  if (lo === hi) { const d = Math.abs(lo) * 0.1 || 1; return [lo - d, hi + d]; }
  const d = (hi - lo) * 0.07; return [lo - d, hi + d];
}

/** Draw. spec = {
 *    series: [{pts: [{x, y, e?, i}], name}]            (at most two; the second is drawn as squares)
 *    xLabel, yLabel, title, logX, logY, flipX, flipY, connect, equal, placeholders: bool,
 *    curves: [{pts: [[x, y], ...], name, ties?: [[x, y, mx, my], ...]}]   model curves, already sampled
 *    resid: {pts: [{x, r, r2?}], xLabel, label} | null   residual strip (r2 = second component, drawn hollow)
 *    empty: text shown instead of a plot }
 *  w, h in CSS pixels. Returns {plot: {x, y, w, h}, sx, sy, hit: [{px, py, s, i, x, y}]} for hover. */
export function drawChart(canvas, spec, { theme = 'dark', w, h, dpr = 1 } = {}) {
  const T = THEMES[theme];
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = T.bg; ctx.fillRect(0, 0, w, h);
  const out = { plot: null, hit: [] };
  if (spec.empty) {
    ctx.fillStyle = T.muted; ctx.font = `400 13.5px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    wrapText(ctx, spec.empty, w / 2, h / 2, Math.min(w - 40, 420), 19);
    return out;
  }
  const small = w < 420;
  const hasResid = !!(spec.resid && spec.resid.pts.length);
  const fs = small ? 11 : 12;
  const mt = (spec.title || spec.placeholders ? 30 : 12) + (legendItems(spec).length > 1 ? 20 : 0), mb = 46, mr = 16;
  // ---- ranges and ticks (ticks first: the left margin depends on the widest tick label) ----
  const all = spec.series.flatMap((s) => s.pts);
  const xs = all.map((p) => p.x), ys = all.flatMap((p) => (Number.isFinite(p.e) && p.e > 0 ? [p.y - p.e, p.y + p.e, p.y] : [p.y]));
  let [x0, x1] = rangeOf(xs, spec.logX), [y0, y1] = rangeOf(ys, spec.logY);
  const residH = hasResid ? Math.max(64, Math.round(h * 0.2)) : 0, residGap = hasResid ? (spec.resid.ownX ? 44 : 14) : 0;
  let ph = h - mt - mb - residH - residGap;
  const yt0 = spec.logY ? logTicks(y0, y1) : linTicks(y0, y1, Math.max(3, Math.round(ph / 52)));
  ctx.font = `400 ${fs}px ${FONT}`;
  let ml = Math.max(...yt0.ticks.map((v) => ctx.measureText(tickText(v, yt0.step)).width), 20) + 34;
  let pw = w - ml - mr;
  if (spec.equal && !spec.logX && !spec.logY) {
    // the same number of pixels per unit on both axes (a path on the sky keeps its shape)
    const k = Math.min(pw / (x1 - x0), ph / (y1 - y0));
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; x0 = cx - pw / k / 2; x1 = cx + pw / k / 2; y0 = cy - ph / k / 2; y1 = cy + ph / k / 2;
  }
  const xt = spec.logX ? logTicks(x0, x1) : linTicks(x0, x1, Math.max(3, Math.round(pw / (small ? 78 : 96))));
  const yt = spec.logY ? logTicks(y0, y1) : linTicks(y0, y1, Math.max(3, Math.round(ph / 52)));
  const px0 = ml, py0 = mt;
  const fx = (v) => { const u = spec.logX ? (Math.log10(v) - Math.log10(x0)) / (Math.log10(x1) - Math.log10(x0)) : (v - x0) / (x1 - x0); return px0 + (spec.flipX ? 1 - u : u) * pw; };
  const fy = (v) => { const u = spec.logY ? (Math.log10(v) - Math.log10(y0)) / (Math.log10(y1) - Math.log10(y0)) : (v - y0) / (y1 - y0); return py0 + (spec.flipY ? u : 1 - u) * ph; };
  out.plot = { x: px0, y: py0, w: pw, h: ph }; out.sx = fx; out.sy = fy;

  // ---- frame, grid, ticks ----
  ctx.lineWidth = 1; ctx.strokeStyle = T.grid; ctx.fillStyle = T.muted; ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.beginPath();
  for (const v of xt.ticks) { const X = Math.round(fx(v)) + 0.5; ctx.moveTo(X, py0); ctx.lineTo(X, py0 + ph); }
  for (const v of yt.ticks) { const Y = Math.round(fy(v)) + 0.5; ctx.moveTo(px0, Y); ctx.lineTo(px0 + pw, Y); }
  ctx.stroke();
  ctx.strokeStyle = T.axis; ctx.strokeRect(px0 + 0.5, py0 + 0.5, pw, ph);
  const xTickY = hasResid && !spec.resid.ownX ? py0 + ph + residGap + residH + 6 : py0 + ph + 6;
  let lastR = -1e9;
  for (const v of (spec.flipX ? xt.ticks.slice().reverse() : xt.ticks)) { const s = tickText(v, xt.step), X = fx(v), wd = ctx.measureText(s).width; if (X - wd / 2 < lastR + 8) continue; ctx.fillText(s, X, xTickY); lastR = X + wd / 2; }
  ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
  for (const v of yt.ticks) ctx.fillText(tickText(v, yt.step), px0 - 7, fy(v));

  // ---- labels and title: the student's own words, or a faint prompt on screen (never in the saved picture) ----
  const label = (text, hint, x, y, rot, size = 13, weight = 600) => {
    if (!text && !spec.placeholders) return;
    ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(-Math.PI / 2);
    ctx.font = text ? `${weight} ${size}px ${FONT}` : `italic 400 ${size - 1}px ${FONT}`; ctx.fillStyle = text ? T.ink : T.faint; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text || hint, 0, 0, rot ? ph + residH + 30 : w - 20); ctx.restore();
  };
  label(spec.xLabel, 'horizontal axis: no label yet', px0 + pw / 2, h - 13, false);
  label(spec.yLabel, 'vertical axis: no label yet', 13, py0 + ph / 2, true);
  label(spec.title, 'no title yet', w / 2, 16, false, 14.5, 600);

  // ---- clip to the plot for curves and points ----
  ctx.save(); ctx.beginPath(); ctx.rect(px0, py0, pw, ph); ctx.clip();
  const okv = (x, y) => Number.isFinite(x) && Number.isFinite(y) && (!spec.logX || x > 0) && (!spec.logY || y > 0);
  (spec.curves || []).forEach((c, k) => {
    ctx.strokeStyle = k ? T.m2 : T.m1; ctx.lineWidth = 2; ctx.setLineDash(k ? [7, 5] : []); ctx.lineJoin = 'round';
    ctx.beginPath(); let pen = false;
    for (const [x, y] of c.pts) { if (!okv(x, y)) { pen = false; continue; } const X = fx(x), Y = fy(y); if (Math.abs(Y) > 1e5) { pen = false; continue; } if (pen) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); pen = true; }
    ctx.stroke(); ctx.setLineDash([]);
    if (c.ties) {          // where the model is at each point's own time, tied to the point: the residual made visible
      ctx.lineWidth = 1; ctx.strokeStyle = T.muted; ctx.fillStyle = k ? T.m2 : T.m1; ctx.beginPath();
      for (const [x, y, mx, my] of c.ties) if (okv(x, y) && okv(mx, my)) { ctx.moveTo(fx(x), fy(y)); ctx.lineTo(fx(mx), fy(my)); }
      ctx.stroke();
      for (const [x, y, mx, my] of c.ties) if (okv(mx, my)) { ctx.beginPath(); ctx.arc(fx(mx), fy(my), 2.2, 0, 7); ctx.fill(); }
    }
  });
  spec.series.forEach((s, k) => {
    const col = k ? T.s2 : T.s1, pts = s.pts.filter((p) => okv(p.x, p.y));
    if (spec.connect && pts.length > 1) { ctx.strokeStyle = col; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.5; ctx.beginPath(); pts.forEach((p, j) => (j ? ctx.lineTo(fx(p.x), fy(p.y)) : ctx.moveTo(fx(p.x), fy(p.y)))); ctx.stroke(); ctx.globalAlpha = 1; }
    for (const p of pts) {
      const X = fx(p.x), Y = fy(p.y);
      if (Number.isFinite(p.e) && p.e > 0 && (!spec.logY || p.y - p.e > 0)) { const a = fy(p.y - p.e), b = fy(p.y + p.e); ctx.strokeStyle = col; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(X, a); ctx.lineTo(X, b); ctx.moveTo(X - 3.5, a); ctx.lineTo(X + 3.5, a); ctx.moveTo(X - 3.5, b); ctx.lineTo(X + 3.5, b); ctx.stroke(); }
      ctx.fillStyle = col; ctx.strokeStyle = T.ring; ctx.lineWidth = 1.5; ctx.beginPath();
      if (k) ctx.rect(X - 3.8, Y - 3.8, 7.6, 7.6); else ctx.arc(X, Y, 4.2, 0, 7);
      ctx.fill(); ctx.stroke();
      out.hit.push({ px: X, py: Y, s: k, i: p.i, x: p.x, y: p.y });
    }
  });
  ctx.restore();

  // ---- legend (only when there is more than one thing to tell apart) ----
  const items = legendItems(spec);
  if (items.length > 1) {
    ctx.font = `400 ${fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    let X = px0, Y = mt - 12;
    for (const it of items) {
      const col = it.kind === 'series' ? (it.k ? T.s2 : T.s1) : (it.k ? T.m2 : T.m1);
      ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 2;
      if (it.kind === 'series') { ctx.beginPath(); if (it.k) ctx.rect(X, Y - 4, 8, 8); else ctx.arc(X + 4, Y, 4, 0, 7); ctx.fill(); X += 13; }
      else { ctx.setLineDash(it.k ? [5, 3] : []); ctx.beginPath(); ctx.moveTo(X, Y); ctx.lineTo(X + 18, Y); ctx.stroke(); ctx.setLineDash([]); X += 23; }
      ctx.fillStyle = T.muted; const tx = clipText(ctx, it.name, Math.max(40, (pw - 20) / items.length - 24)); ctx.fillText(tx, X, Y); X += ctx.measureText(tx).width + 16;
    }
  }

  // ---- residual strip ----
  if (hasResid) {
    const R = spec.resid, ry = py0 + ph + residGap, rs = R.pts.flatMap((p) => [p.r, p.r2]).filter(Number.isFinite);
    const m = Math.max(...rs.map(Math.abs), 1e-300) * 1.25;
    let rx = fx;
    if (R.ownX) { const [a, b] = rangeOf(R.pts.map((p) => p.x), false); rx = (v) => px0 + (v - a) / (b - a) * pw; }
    const ry0 = (v) => ry + residH / 2 - v / m * (residH / 2);
    ctx.strokeStyle = T.axis; ctx.lineWidth = 1; ctx.strokeRect(px0 + 0.5, ry + 0.5, pw, residH);
    ctx.strokeStyle = T.grid; ctx.beginPath(); ctx.moveTo(px0, Math.round(ry0(0)) + 0.5); ctx.lineTo(px0 + pw, Math.round(ry0(0)) + 0.5); ctx.stroke();
    ctx.fillStyle = T.muted; ctx.font = `400 ${fs - 1}px ${FONT}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('+' + fmtNum(m / 1.25, 2), px0 - 7, ry0(m / 1.25)); ctx.fillText('0', px0 - 7, ry0(0)); ctx.fillText(fmtNum(-m / 1.25, 2), px0 - 7, ry0(-m / 1.25));
    ctx.save(); ctx.translate(13, ry + residH / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.fillText(R.label || 'residual', 0, 0); ctx.restore();
    ctx.save(); ctx.beginPath(); ctx.rect(px0, ry, pw, residH); ctx.clip();
    for (const p of R.pts) {
      const X = rx(p.x);
      if (Number.isFinite(p.r)) { ctx.fillStyle = T.s1; ctx.strokeStyle = T.ring; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X, ry0(p.r), 3.4, 0, 7); ctx.fill(); ctx.stroke(); }
      if (Number.isFinite(p.r2)) { ctx.strokeStyle = T.s1; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.rect(X - 3, ry0(p.r2) - 3, 6, 6); ctx.stroke(); }
    }
    ctx.restore();
    if (R.ownX) {
      const [a, b] = rangeOf(R.pts.map((p) => p.x), false), t = linTicks(a, b, Math.max(3, Math.round(pw / 96)));
      ctx.fillStyle = T.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.font = `400 ${fs}px ${FONT}`;
      for (const v of t.ticks) ctx.fillText(tickText(v, t.step), rx(v), ry + residH + 5);
      if (R.note) { ctx.textAlign = 'left'; ctx.fillStyle = T.faint; ctx.font = `400 ${fs - 1}px ${FONT}`; ctx.fillText(R.note, px0 + 4, ry + 3); }
    }
  }
  return out;
}
function legendItems(spec) {
  const out = [];
  if (spec.series.length > 1 || (spec.curves || []).length) spec.series.forEach((s, k) => out.push({ kind: 'series', k, name: s.name || 'data' }));
  (spec.curves || []).forEach((c, k) => out.push({ kind: 'curve', k, name: c.name }));
  return out;
}
function clipText(ctx, s, max) { if (ctx.measureText(s).width <= max) return s; while (s.length > 3 && ctx.measureText(s + '…').width > max) s = s.slice(0, -1); return s + '…'; }
function wrapText(ctx, text, x, y, max, lh) {
  const words = text.split(' '), lines = []; let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (ctx.measureText(t).width > max && line) { lines.push(line); line = wd; } else line = t; }
  lines.push(line);
  lines.forEach((l, i) => ctx.fillText(l, x, y + (i - (lines.length - 1) / 2) * lh));
}
