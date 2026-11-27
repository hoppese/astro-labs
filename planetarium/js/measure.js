// measure.js: the angular-distance tool. Click two points; the great-circle separation and the
// position angle are shown and stay on screen until cleared.
// Clicks snap to objects: a star or a small body snaps to its centre; on a disc that is drawn to scale
// (Sun, Moon, a planet zoomed in, the Earth's shadow, a second observer's ghost) a click near the edge
// snaps to the LIMB at that position angle and a click elsewhere on it snaps to the centre. So
// limb-to-limb gives a diameter and limb-to-limb across two bodies gives a contact gap.
// Angles are between true directions (no refraction), so they match catalogue separations.

import { DEG, RAD, mod, mulMV, unit, cross, angleBetween, unrefractHor, toSph, fmtDMS } from './astro.js';
import { state, on, emit, eff } from './state.js';
import { cam, unproject, projectHor } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { pickAt, allPicks } from './picks.js';
import { refEqj, refName } from './objects.js';
import { projectPolyline, strokeStrips, R } from './render/proj.js';
import { refractHor } from './astro.js';
import { allTargets, resolveCustom } from './labs/targets.js';
import { openLoupe, closeLoupe, loupeOpen } from './notebook/loupe.js';
import { see, noisePair } from './notebook/seeing.js';

// byEye (lab notebook, js/notebook/host.js): stars and other point sources are NOT snapped to; a magnifier opens and the
// student places the point on the image by eye (discs still snap to centre and limb). onRecord: the notebook's Record.
// showPa: the measurement whose position angle is drawn on the sky (a press on the angle keeps it, pointing at the row shows it)
export const measure = { showPa: null, overPa: null, active: false, list: [], pending: null, hover: null, snap: true, byEye: false, onRecord: null };
let panel = null;

/** J2000 direction under a screen point (refraction removed). */
function skyVec(x, y) {
  const frame = getFrame();
  let h = unproject(x, y);
  if (eff.refraction) h = unrefractHor(h);
  return unit(mulMV(frame.Mhj, h));
}
/** Position angle (deg, north through east, J2000) of direction v as seen from center c. */
function paOf(c, v) {
  const e = unit(cross([0, 0, 1], c)), n = cross(c, e);
  const d = [v[0] - c[0], v[1] - c[1], v[2] - c[2]];
  return mod(Math.atan2(d[0] * e[0] + d[1] * e[1] + d[2] * e[2], d[0] * n[0] + d[1] * n[1] + d[2] * n[2]) * RAD, 360);
}
/** The point at angular distance rho (deg) from c toward position angle pa. */
function offsetPoint(c, rho, pa) {
  const e = unit(cross([0, 0, 1], c)), n = cross(c, e);
  const cr = Math.cos(rho * DEG), sr = Math.sin(rho * DEG), cp = Math.cos(pa * DEG), sp = Math.sin(pa * DEG);
  return unit([c[0] * cr + (n[0] * cp + e[0] * sp) * sr, c[1] * cr + (n[1] * cp + e[1] * sp) * sr, c[2] * cr + (n[2] * cp + e[2] * sp) * sr]);
}

/** A measured end point. One of
 *    {ref}                 an object's centre (follows the object)
 *    {custom: {type, id}}  a labs target's centre (ghost of the second observer, Earth's shadow)
 *    {vec}                 a fixed J2000 direction
 *  plus, for the first two, an optional `limb: pa` = the point on its limb at that position angle. */
function pointAt(x, y, ref) {
  if (!measure.snap) return { vec: skyVec(x, y), byEye: measure.byEye };
  // every disc or point under the cursor: catalogue picks and labs targets
  const cands = [];
  const byId = getBodies(getFrame()).byId;
  for (const it of allPicks()) {
    if (!it.ref || it.ref.kind === 'con') continue;
    const b = it.ref.kind === 'body' ? byId[it.ref.id] : null;
    // a body's limb is at its true angular radius (the pick radius can be padded, or be Saturn's rings)
    const rTrue = b ? b.angRadius * cam.pxPerDeg : 0;
    cands.push({ x: it.x, y: it.y, r: rTrue >= 9 ? rTrue : it.r, mag: it.mag, p: { ref: it.ref }, disc: !!b });
  }
  for (const t of allTargets()) cands.push({ x: t.x, y: t.y, r: t.r, mag: 0, p: { custom: { type: t.type, id: t.id } }, disc: !t.centreOnly, custom: true, limbOnly: t.limbOnly });
  const LIMB_MIN = 9;                                   // discs smaller than this on screen snap to the center only
  // a disc behind a nearer, big one (the Sun in totality): what cannot be seen is not a target
  const dist = (c) => (c.p.ref && byId[c.p.ref.id] ? byId[c.p.ref.id].dist : 0);
  const covered = (c, px, py) => !c.custom && c.disc && cands.some((o) => o !== c && o.disc && !o.custom && o.r >= Math.max(LIMB_MIN, 0.5 * c.r) && dist(o) < dist(c) && Math.hypot(o.x - px, o.y - py) < o.r - 1);
  // the second end of a diameter: where two limbs lie side by side the one the first point is on has it
  const pend = measure.pending, keyOf = (p) => JSON.stringify([p.ref || 0, p.custom || 0]), mate = (c) => {
    if (!pend || pend.limb == null || keyOf(pend) !== keyOf(c.p)) return false;
    const f = getFrame(), v = eqjOf(pend, f, getBodies(f)); if (!v) return false;
    const h = mulMV(f.Mjh, v), s = [0, 0];
    return projectHor(eff.refraction ? refractHor(h) : h, s) && Math.hypot(s[0] - x, s[1] - y) > 0.6 * c.r;      // across the disc, not a gap beside the first point
  };
  let best = null, bestScore = Infinity;
  // the Sun, Moon and resolved planets hide what is behind them: a star inside such a disc is not a target
  // (with the faint-star tiles there is nearly always one behind the Moon's limb, and it used to steal the snap)
  const solid = cands.filter((c) => c.disc && !c.custom && c.r >= LIMB_MIN);
  const onLimb = solid.some((c) => Math.abs(Math.hypot(c.x - x, c.y - y) - c.r) <= Math.max(6, Math.min(14, 0.1 * c.r)));      // at an edge the edge is meant, never a star that shines beside it
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.y - y);
    if (!c.disc && !c.custom && solid.some((s) => Math.hypot(c.x - s.x, c.y - s.y) < s.r - 0.5)) continue;
    const big = c.disc && c.r >= LIMB_MIN;
    if (big) {
      const tol = Math.max(6, Math.min(14, 0.1 * c.r));
      const dl = Math.abs(d - c.r);
      const lx = c.x + (x - c.x) * c.r / (d || 1), ly = c.y + (y - c.y) * c.r / (d || 1);
      if (dl <= tol && !covered(c, lx, ly)) { const s = 1 + dl / tol - (mate(c) ? 1.5 : 0); if (s < bestScore) { bestScore = s; best = { c, limb: true }; } }
      // a click well inside a body's disc means its centre (a shadow or ghost outline has no such claim); one right on the centre means it even where
      // the second observer's circle happens to pass
      else if (d < c.r && !c.custom && !covered(c, c.x, c.y)) { const at = Math.min(9, 0.35 * c.r), s = d < at ? 0.3 + d / at : 3 + d / c.r; if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
      else if (d < 9 && c.custom && !c.limbOnly) { const s = d / 9; if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
    } else {
      const reach = Math.max(10, c.r + 4);
      // same preference as a plain click (picks.js): a click on a bright star's disc means that star, not a faint neighbour a pixel nearer
      // ... and beside a limb or an outline, a neighbouring star wins only when the click is right on it
      //     (limb snaps score 1-2, so "+ 2" puts a merely nearby star behind them)
      if (d <= reach) { const s = d / reach + 0.04 * (c.mag ?? 10) + (d <= c.r ? -0.5 : 0) + (d > Math.max(4, c.r) || (onLimb && !c.disc && !c.custom) ? 2.5 : 0); if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
    }
  }
  if (!best) return { vec: skyVec(x, y), byEye: measure.byEye };
  // lab notebook: a point source is placed by eye, never snapped to its catalogue centre
  if (measure.byEye && !(best.c.disc && best.c.r >= LIMB_MIN) && !best.c.custom) return { vec: skyVec(x, y), byEye: true };
  const p = { ...best.c.p };
  p.body = keyOf(best.c.p);
  if (best.limb) {
    const frame = getFrame(), bodies = getBodies(frame);
    const ctr = centreOf(p, frame, bodies);
    if (ctr) p.limb = paOf(ctr.u, skyVec(x, y));
  }
  return p;
}
/** Center direction, angular radius (deg) and name of a point's parent object. */
function centreOf(p, frame, bodies) {
  if (p.ref) {
    const u = refEqj(p.ref, frame, bodies); if (!u) return null;
    const b = p.ref.kind === 'body' ? bodies.byId[p.ref.id] : null;
    return { u, angRadius: b ? b.angRadius : 0, name: refName(p.ref) };
  }
  if (p.custom) return resolveCustom(p.custom, frame, bodies);
  return null;
}
function eqjOf(p, frame, bodies) {
  if (p.vec) return p.vec;
  const c = centreOf(p, frame, bodies);
  if (!c) return null;
  const v = p.limb == null ? c.u : offsetPoint(c.u, c.angRadius, p.limb);
  if (!p.off) return v;
  // the pointing error of this snapped end (see commit): a small step east and north of where the snap put it
  const e = unit(cross([0, 0, 1], v)), n = cross(v, e);
  return unit([0, 1, 2].map((k) => v[k] + (e[k] * p.off[0] + n[k] * p.off[1]) * DEG));
}
function nameOf(p) {
  if (p.vec) return p.near || 'sky point';
  const frame = getFrame(), c = centreOf(p, frame, getBodies(frame));
  const nm = c ? c.name : '?';
  return p.limb == null ? nm : nm + ' limb';
}

/** Separation (deg) and position angle of b from a (deg, north through east, equator of date). */
export function separation(a, b, frame) {
  const sep = angleBetween(a, b);
  const A1 = toSph(mulMV(frame.Mjd, a)), B1 = toSph(mulMV(frame.Mjd, b));
  const dra = (B1.lon - A1.lon) * DEG, d1 = A1.lat * DEG, d2 = B1.lat * DEG;
  const pa = mod(Math.atan2(Math.sin(dra) * Math.cos(d2), Math.cos(d1) * Math.sin(d2) - Math.sin(d1) * Math.cos(d2) * Math.cos(dra)) * RAD, 360);
  return { sep, pa };
}
const TOWARD = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest'];
export const towardOf = (pa) => TOWARD[Math.round(mod(pa, 360) / 45) % 8];
/** The J2000 direction at distance rho (deg) from a, toward position angle pa counted from north of date (as separation() counts it). */
export function fromNorth(a, rho, pa, frame) {
  const pole = [frame.Mjd[6], frame.Mjd[7], frame.Mjd[8]], e = unit(cross(pole, a)), n = cross(a, e);
  const cr = Math.cos(rho * DEG), sr = Math.sin(rho * DEG), cp = Math.cos(pa * DEG), sp = Math.sin(pa * DEG);
  return unit([0, 1, 2].map((k) => a[k] * cr + (n[k] * cp + e[k] * sp) * sr));
}
/** Full precision: 0.0001 deg and 0.1 arcsec above an arcminute, 0.01 arcsec below. */
export function fmtSep(sep) {
  const dms = fmtDMS(sep, { sign: false, dp: 1 });
  // under 5 arcminutes the reading is given in arcseconds to 0.01 (what small-angle astrometry needs), with arcminutes beside it
  return sep >= 1 ? `${sep.toFixed(4)}° (${dms})` : sep >= 5 / 60 ? `${(sep * 60).toFixed(3)}′ (${dms.replace(/^0° /, '')})` : sep >= 1 / 60 ? `${(sep * 3600).toFixed(2)}″ (${(sep * 60).toFixed(4)}′)` : `${(sep * 3600).toFixed(2)}″`;
}
/** Short form for the label drawn on the arc. */
const fmtArc = (s) => (s >= 1 ? s.toFixed(3) + '°' : s >= 1 / 60 ? (s * 60).toFixed(2) + '′' : (s * 3600).toFixed(1) + '″');

export function toggleMeasure(on) {
  measure.active = on === undefined ? !measure.active : on;
  closeLoupe();
  measure.pending = null; measure.hover = null;
  document.getElementById('sky').classList.toggle('measuring', measure.active);
  updatePanel(); emit('measure');
}
/** A measurement with an end placed by eye belongs to the second it was made in: that end does not follow anything, so once the clock has moved the pair
 *  is no longer the pair that was measured (a planet walks away from where its moon was). */
const moved = (t) => Math.abs(state.timeMs - t) >= 1000;
const isStale = (m) => (m.a.byEye || m.b.byEye) && moved(m.t);
let dropped = false;
function dropStale() { if (measure.pending && measure.pending.byEye && moved(measure.pending.t)) { measure.pending = null; dropped = true; closeLoupe(); } }
/** "Moon edge to Sun edge" (or to its center): an edge and a point of another body never make a diameter. */
export const mixedLimbs = (m) => (m.a.limb != null || m.b.limb != null) && !!m.a.body && !!m.b.body && m.a.body !== m.b.body;
const partOf = (p) => nameOf(p).replace(/ limb$/, '') + (p.limb == null ? ' center' : ' edge');
/** Delete one finished measurement. */
function removeMeasure(m) { const i = measure.list.indexOf(m); if (i < 0) return; measure.list.splice(i, 1); if (measure.showPa === m) measure.showPa = null; if (measure.overPa === m) measure.overPa = null; updatePanel(); emit('measure'); emit('render'); }
export function clearMeasures() { measure.list.length = 0; measure.showPa = measure.overPa = null; measure.pending = null; updatePanel(); emit('measure'); }

/** Called by input.js for every click on the sky; returns true when the click was used. */
export function measureClick(x, y, ref) {
  if (!measure.active) return false;
  dropStale();
  const p = pointAt(x, y, ref);
  if (p.byEye) {
    // the magnifier: the second click, inside it, is the measured point (to a tenth of a screen pixel)
    openLoupe(document.getElementById('sky'), x, y, (fx, fy) => commit({ vec: skyVec(fx, fy), near: nearName(fx, fy), byEye: true }));
    emit('render');                                   // without the names: the magnifier shows ten times everything
    const iv = setInterval(() => { if (!loupeOpen()) { clearInterval(iv); emit('render'); } }, 120);
    return true;
  }
  commit(p);
  return true;
}
let serial = 0;
const gg = [0, 0];
function commit(p) {
  // A snapped end lands exactly on the object, which no hand or eye does: it gets a pointing error of about half a screen pixel
  // (one sigma each way), drawn from the student's seed (js/notebook/seeing.js), so readings differ a little between students and
  // shrink as you zoom in, as they would at a real eyepiece. By-eye ends (the notebook's magnifier) and free clicks carry their own.
  if (!p.vec) { const s = 0.5 / cam.pxPerDeg, t = Math.floor(state.timeMs / 1000); noisePair(see.seed, t | 0, serial + 1, measure.pending ? 2 : 1, 0x0a9e1e, gg); p.off = [gg[0] * s, gg[1] * s]; }
  p.t = state.timeMs; dropped = false; measure.hover = null;      // (the old end of the rubber band is not the new one)
  dropStale();
  if (!measure.pending) measure.pending = p;
  else { measure.list.push({ a: measure.pending, b: p, t: p.t, n: ++serial }); measure.pending = null; if (measure.list.length > 12) { const x = measure.list.shift(); if (measure.showPa === x) measure.showPa = null; } }
  updatePanel(); emit('measure');
}
/** Name of the object whose image is under a by-eye point (a label for the record only: the point itself stays free). */
function nearName(x, y) {
  let best = null, bd = Infinity;
  for (const it of allPicks()) { if (!it.ref || it.ref.kind === 'con') continue; const d = Math.hypot(it.x - x, it.y - y); if (d <= Math.max(8, it.r) && d < bd) { bd = d; best = it; } }
  return best ? refName(best.ref) : '';
}
/** The last finished measurement as numbers, for the notebook's Record: {sep (deg), pa (deg), from, to} or null. */
export function lastMeasure() {
  const m = measure.list[measure.list.length - 1]; if (!m || isStale(m)) return null;
  const frame = getFrame(), bodies = getBodies(frame), a = eqjOf(m.a, frame, bodies), b = eqjOf(m.b, frame, bodies);
  if (!a || !b) return null;
  return { ...separation(a, b, frame), from: nameOf(m.a), to: nameOf(m.b) };
}

export function initMeasure(canvas, panelEl) {
  panel = panelEl;
  // the object panel above keeps clear of this one (css: --mp-h)
  new ResizeObserver(() => { document.documentElement.style.setProperty('--mp-h', (panel.hidden || !panel.offsetHeight || innerWidth <= 560 ? 0 : panel.offsetHeight + 4) + 'px'); }).observe(panel);
  canvas.addEventListener('pointermove', (e) => {
    if (!measure.active || !measure.pending) return;
    const r = canvas.getBoundingClientRect();
    measure.hover = [e.clientX - r.left, e.clientY - r.top];
    emit('render');
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const m = measure.list.find((x) => x.n === +b.dataset.n);
    if (b.dataset.act === 'del') removeMeasure(m);
    else if (b.dataset.act === 'undo') { measure.pending = null; measure.hover = null; closeLoupe(); updatePanel(); emit('measure'); emit('render'); }
    else if (b.dataset.act === 'pa') { measure.showPa = measure.showPa === m ? null : m; updatePanel(); emit('render'); }
    else if (b.dataset.act === 'clear') clearMeasures();
    else if (b.dataset.act === 'done') toggleMeasure(false);
    else if (b.dataset.act === 'snap') { measure.snap = !measure.snap; updatePanel(); }
    else if (b.dataset.act === 'record' && measure.onRecord) measure.onRecord();
  });
  const over = (e) => { const r = e && e.target.closest && e.target.closest('.mp-row[data-n]'), m = (r && measure.list.find((x) => x.n === +r.dataset.n)) || null; if (m !== measure.overPa) { measure.overPa = m; emit('render'); } };
  panel.addEventListener('pointerover', (e) => { if (e.pointerType === 'mouse') over(e); }); panel.addEventListener('pointerleave', () => over(null));
  on('time', updatePanel);
  on('notebook', updatePanel);          // the lab notebook opened or closed: Record button, by-eye hint
  setInterval(() => { if (measure.list.length && !panel.hidden) updatePanel(); }, 1000);
}

let lastCount = 0;
function updatePanel() {
  if (!panel) return;
  dropStale();
  if (!measure.active && !measure.list.length) { panel.hidden = true; return; }
  const frame = getFrame(), bodies = getBodies(frame);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = '<div class="mp-head">Angular distance</div>';
  if (measure.active) html += `<div class="mp-hint">${dropped ? '<b>The clock has moved</b>, so the first point was dropped: click it again.' : measure.pending ? 'Click the second point (' + esc(nameOf(measure.pending)) + ' → ?) <button class="mp-x" data-act="undo" title="Take back the first point" aria-label="Take back the first point">&times;</button>' : (measure.byEye ? 'Click near each of two objects. A magnifier opens: place the cross on the center of the image by eye.' + (measure.snap ? ' Discs still snap to center and limb.' : '') : measure.snap ? 'Click two points. Clicks snap to objects; near the edge of a disc they snap to its limb. Each snapped point is off by about half a screen pixel, as a hand would be: zoom in for a finer reading.' : 'Click two points (free: no snapping).')}</div>`;
  const rows = measure.list.map((m) => {
    const a = eqjOf(m.a, frame, bodies), b = eqjOf(m.b, frame, bodies);
    if (!a || !b) return '';
    const s = separation(a, b, frame), old = isStale(m);
    const names = `${nameOf(m.a)} → ${nameOf(m.b)}`, del = `<button class="mp-x" data-act="del" data-n="${m.n}" title="Delete this measurement" aria-label="Delete the measurement ${esc(names)}">&times;</button>`;
    if (old) return `<div class="mp-row old"><span class="mp-names">${esc(names)}</span><span></span>${del}<span class="mp-warn">The clock has moved since: measure again.</span></div>`;
    const mix = mixedLimbs(m) ? `<span class="mp-warn">${esc(partOf(m.a))} to ${esc(partOf(m.b))}: two different bodies, so not a diameter.</span>` : '';
    const shown = measure.showPa === m, deg = s.pa.toFixed(s.sep < 5 / 60 ? 3 : 1);
    return `<div class="mp-row" data-n="${m.n}"><span class="mp-names" title="${esc(names)}">${esc(names)}</span><span class="mp-val">${fmtSep(s.sep)}</span>${del}<button class="mp-pa" data-act="pa" data-n="${m.n}" aria-expanded="${shown}" title="The direction of the line: show it on the sky">Position angle <b>${deg}°</b> (toward the ${towardOf(s.pa)}) <i>${shown ? 'hide' : 'what is this?'}</i></button>`
      + (shown ? `<span class="mp-why">The direction of your line. Stand at the first point (${esc(nameOf(m.a))}): turn from celestial <b>north</b> (0°) through <b>east</b> (90°) until you face the second. It is drawn on the sky. East is to the left of north, because we look up at the sky, not down at a map.</span>` : '') + `${mix}</div>`;
  }).join('');
  html += `<div class="mp-list">${rows}</div>`;
  html += `<div class="mp-acts">${measure.onRecord ? `<button class="btn rec" data-act="record" title="Copy this reading into your notebook"${measure.list.length ? '' : ' disabled'}>Record</button>` : ''}${measure.list.length ? '<button class="btn" data-act="clear">Clear all</button>' : ''}${measure.active ? `<button class="btn${measure.snap ? ' on' : ''}" data-act="snap" aria-pressed="${measure.snap}" title="Snap clicks to objects and limbs">Snap</button><button class="btn" data-act="done">Done <kbd>R</kbd></button>` : ''}</div>`;
  if (html !== panel.dataset.html) {
    const L = panel.querySelector('.mp-list'), st = L ? L.scrollTop : 0, count = measure.list.length, f = panel.contains(document.activeElement) ? document.activeElement.dataset : null, sel = f && f.act ? `[data-act="${f.act}"]${f.n ? `[data-n="${f.n}"]` : ''}` : '';
    panel.innerHTML = html; panel.dataset.html = html;
    const N = panel.querySelector('.mp-list'); N.scrollTop = count > lastCount ? 1e6 : st; lastCount = count;          // a new one is in sight
    if (sel) { const b = panel.querySelector(sel); if (b) b.focus({ preventScroll: true }); }
  }
  panel.hidden = false;
}

/** At the first point: the way to celestial north, the way to east, and the turn from north through east to the line. */
function drawPa(ctx, a, pa, frame, toHor, proj) {
  const at = (rho, ang) => { const s = [0, 0]; return proj(toHor(fromNorth(a, rho, ang, frame)), s) ? s : null; };
  const px = Math.max(cam.pxPerDeg, 1e-6), long = Math.min(70 / px, 25), o = at(0, 0); if (!o) return;
  const line = (p) => { if (!p) return; ctx.beginPath(); ctx.moveTo(o[0], o[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); };
  const word = (p, t) => { if (!p) return; const d = Math.hypot(p[0] - o[0], p[1] - o[1]) || 1, x = p[0] + (p[0] - o[0]) / d * 11, y = p[1] + (p[1] - o[1]) / d * 11; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(2,6,14,0.85)'; ctx.strokeText(t, x, y); ctx.fillText(t, x, y); };
  ctx.save(); ctx.font = "600 13px 'Source Sans 3', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const [w, c] of [[3.6, 'rgba(2,6,14,0.7)'], [1.4, '#9fc2ff']]) {
    ctx.lineWidth = w; ctx.strokeStyle = c; ctx.setLineDash([5, 4]); line(at(long, 0)); line(at(long, 90)); ctx.setLineDash([]);
    ctx.beginPath(); let pen = false; const n = Math.max(2, Math.ceil(pa / 4));
    for (let i = 0; i <= n; i++) { const p = at(long * 0.5, pa * i / n); if (!p) { pen = false; continue; } if (pen) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); pen = true; }
    ctx.stroke();
    const p1 = at(long * 0.5, pa), p0 = at(long * 0.5, pa - Math.min(8, pa * 0.4));      // an arrowhead: which way it is counted
    if (p0 && p1 && pa > 12) { const g = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]); ctx.beginPath(); ctx.moveTo(p1[0] - 8 * Math.cos(g - 0.45), p1[1] - 8 * Math.sin(g - 0.45)); ctx.lineTo(p1[0], p1[1]); ctx.lineTo(p1[0] - 8 * Math.cos(g + 0.45), p1[1] - 8 * Math.sin(g + 0.45)); ctx.stroke(); }
  }
  ctx.fillStyle = '#cfe0ff'; word(at(long, 0), 'N'); word(at(long, 90), 'E');
  const mid = at(long * 0.5, pa / 2); if (mid && pa > 25) word(mid, pa.toFixed(0) + '°');
  ctx.restore();
}

// ---- drawing (registered as a renderer overlay) ---------------------------------------
const pa = [0, 0], pb = [0, 0];
export function drawMeasures(ctx) {
  if (!measure.list.length && !measure.pending) return;
  const frame = R.frame, bodies = R.bodies;
  const toHor = (v) => mulMV(frame.Mjh, v);
  const proj = (h, out) => projectHor(R.refr ? refractHor(h) : h, out);
  ctx.save();
  ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,214,107,0.95)'; ctx.fillStyle = 'rgba(255,214,107,0.95)';
  // by eye: an open ring, so the mark never hides the star image the next click has to be placed on
  const marker = measure.byEye ? (p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 9, 0, 2 * Math.PI); ctx.stroke(); } : (p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 2 * Math.PI); ctx.fill(); };
  const placed = [];                                 // labels so far: the next one keeps clear of them
  const arc = (ha, hb, label, free = false) => {
    const pts = new Float64Array([ha[0], ha[1], ha[2], hb[0], hb[1], hb[2]]);
    const strips = projectPolyline(pts, Math.max(Math.min(2, cam.fov / 20), 1e-4));
    // a dark edge under the line: it has to show on the bright Sun too
    { const w = ctx.lineWidth, st = ctx.strokeStyle; ctx.lineWidth = 3.6; ctx.strokeStyle = 'rgba(2,6,14,0.75)'; strokeStrips(ctx, strips); ctx.lineWidth = w; ctx.strokeStyle = st; }
    strokeStrips(ctx, strips);
    const okA = proj(ha, pa), okB = proj(hb, pb);
    if (okA) marker(pa);
    if (okB && !(measure.byEye && free)) marker(pb);          // by eye: no mark at the pointer's end of the rubber band (it would sit in the magnifier)
    if (label) {
      // label at the middle of the visible arc
      const dx = pb[0] - pa[0], dy = pb[1] - pa[1], d = Math.hypot(dx, dy) || 1;
      let nx = -dy / d, ny = dx / d; if (ny > 0) { nx = -nx; ny = -ny; }       // offset to the upper side of the line
      const pm = [0, 0], hw = label.length * 3.9 + 4;
      // where no bright star or body is under it: the middle if possible, else along the arc or on the other side of it
      let best = null;
      for (const [f, side] of [[0.5, 1], [0.5, -1], [0.4, 1], [0.6, 1], [0.4, -1], [0.6, -1], [0.3, 1], [0.7, 1]]) {
        if (!proj(unit([0, 1, 2].map((k) => ha[k] * (1 - f) + hb[k] * f)), pm) || !(pm[0] > 0 && pm[0] < cam.w && pm[1] > 0 && pm[1] < cam.h)) continue;
        const x = pm[0] + side * nx * 13, y = pm[1] + side * ny * 13;
        const hit = allPicks().some((it) => it.ref && it.ref.kind !== 'con' && (it.mag ?? 9) < 4 && Math.abs(it.x - x) < hw + it.r && Math.abs(it.y - y) < 9 + it.r);
        if (!best || !hit) best = { x, y };
        if (!hit) break;
      }
      if (best) {
        ctx.font = "600 12.5px 'JetBrains Mono', ui-monospace, monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const w = ctx.measureText(label).width / 2 + 6; let lx = best.x, ly = best.y;
        for (let k = 0; k < 8 && placed.some((q) => Math.abs(q[0] - lx) < q[2] + w && Math.abs(q[1] - ly) < 20); k++) ly -= 21;
        placed.push([lx, ly, w]);
        ctx.fillStyle = 'rgba(8,13,22,0.86)'; ctx.beginPath(); ctx.roundRect(lx - w, ly - 10, 2 * w, 20, 5); ctx.fill();
        ctx.fillStyle = 'rgba(255,214,107,0.98)';
        ctx.fillText(label, lx, ly + 0.5);
        R.labels.block(lx - w, ly - 10, lx + w, ly + 10);      // the names of things keep off it
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,214,107,0.95)'; ctx.textAlign = 'left';
      }
    }
  };
  for (const m of measure.list) {
    const a = eqjOf(m.a, frame, bodies), b = eqjOf(m.b, frame, bodies);
    if (!a || !b || isStale(m)) continue;
    const s = angleBetween(a, b);
    arc(toHor(a), toHor(b), fmtArc(s));
    if (m === measure.showPa || m === measure.overPa) drawPa(ctx, a, separation(a, b, frame).pa, frame, toHor, proj);
  }
  if (measure.pending) {
    const a = eqjOf(measure.pending, frame, bodies);
    if (a) {
      const ha = toHor(a);
      if (measure.hover && !loupeOpen()) {          // (the rubber band would cross the image in the magnifier)
        let h = unproject(measure.hover[0], measure.hover[1]);
        if (R.refr) h = unrefractHor(h);
        ctx.setLineDash([5, 4]);
        const s = angleBetween(ha, h);
        arc(ha, h, fmtArc(s), true);
        ctx.setLineDash([]);
      } else if (proj(ha, pa)) marker(pa);
    }
  }
  ctx.restore();
}
