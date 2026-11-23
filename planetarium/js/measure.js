// measure.js: the angular-distance tool. Click two points; the great-circle separation and the
// position angle are shown and stay on screen until cleared.
// Clicks snap to objects: a star or a small body snaps to its centre; on a disc that is drawn to scale
// (Sun, Moon, a planet zoomed in, the Earth's shadow, a second observer's ghost) a click near the edge
// snaps to the LIMB at that position angle and a click elsewhere on it snaps to the centre. So
// limb-to-limb gives a diameter and limb-to-limb across two bodies gives a contact gap.
// Angles are between true directions (no refraction), so they match catalogue separations.

import { DEG, RAD, mod, mulMV, unit, cross, angleBetween, unrefractHor, toSph, fmtDMS } from './astro.js';
import { state, on, emit } from './state.js';
import { cam, unproject, projectHor } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { pickAt, allPicks } from './picks.js';
import { refEqj, refName } from './objects.js';
import { projectPolyline, strokeStrips, R } from './render/proj.js';
import { refractHor } from './astro.js';
import { allTargets, resolveCustom } from './labs/targets.js';

export const measure = { active: false, list: [], pending: null, hover: null, snap: true };
let panel = null;

/** J2000 direction under a screen point (refraction removed). */
function skyVec(x, y) {
  const frame = getFrame();
  let h = unproject(x, y);
  if (state.show.refraction) h = unrefractHor(h);
  return unit(mulMV(frame.Mhj, h));
}
/** Position angle (deg, north through east, J2000) of direction v as seen from centre c. */
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
  if (!measure.snap) return { vec: skyVec(x, y) };
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
  for (const t of allTargets()) cands.push({ x: t.x, y: t.y, r: t.r, mag: 0, p: { custom: { type: t.type, id: t.id } }, disc: !t.centreOnly, custom: true });
  const LIMB_MIN = 9;                                   // discs smaller than this on screen snap to the centre only
  let best = null, bestScore = Infinity;
  for (const c of cands) {
    const d = Math.hypot(c.x - x, c.y - y);
    const big = c.disc && c.r >= LIMB_MIN;
    if (big) {
      const tol = Math.max(6, Math.min(14, 0.1 * c.r));
      const dl = Math.abs(d - c.r);
      if (dl <= tol) { const s = 1 + dl / tol; if (s < bestScore) { bestScore = s; best = { c, limb: true }; } }
      // a click well inside a body's disc means its centre (a shadow or ghost outline has no such claim)
      else if (d < c.r && !c.custom) { const s = 3 + d / c.r; if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
      else if (d < 9 && c.custom) { const s = d / 9; if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
    } else {
      const reach = Math.max(10, c.r + 4);
      if (d <= reach) { const s = d / reach + 0.01 * (c.mag ?? 10); if (s < bestScore) { bestScore = s; best = { c, limb: false }; } }
    }
  }
  if (!best) return { vec: skyVec(x, y) };
  const p = { ...best.c.p };
  if (best.limb) {
    const frame = getFrame(), bodies = getBodies(frame);
    const ctr = centreOf(p, frame, bodies);
    if (ctr) p.limb = paOf(ctr.u, skyVec(x, y));
  }
  return p;
}
/** Centre direction, angular radius (deg) and name of a point's parent object. */
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
  return p.limb == null ? c.u : offsetPoint(c.u, c.angRadius, p.limb);
}
function nameOf(p) {
  if (p.vec) return 'sky point';
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
/** Full precision: 0.0001 deg and 0.1 arcsec above an arcminute, 0.01 arcsec below. */
export function fmtSep(sep) {
  const dms = fmtDMS(sep, { sign: false, dp: 1 });
  return sep >= 1 ? `${sep.toFixed(4)}° (${dms})` : sep >= 1 / 60 ? `${(sep * 60).toFixed(3)}′ (${dms.replace(/^0° /, '')})` : `${(sep * 3600).toFixed(2)}″`;
}
/** Short form for the label drawn on the arc. */
const fmtArc = (s) => (s >= 1 ? s.toFixed(3) + '°' : s >= 1 / 60 ? (s * 60).toFixed(2) + '′' : (s * 3600).toFixed(1) + '″');

export function toggleMeasure(on) {
  measure.active = on === undefined ? !measure.active : on;
  measure.pending = null; measure.hover = null;
  document.getElementById('sky').classList.toggle('measuring', measure.active);
  updatePanel(); emit('measure');
}
export function clearMeasures() { measure.list.length = 0; measure.pending = null; updatePanel(); emit('measure'); }

/** Called by input.js for every click on the sky; returns true when the click was used. */
export function measureClick(x, y, ref) {
  if (!measure.active) return false;
  const p = pointAt(x, y, ref);
  if (!measure.pending) measure.pending = p;
  else { measure.list.push({ a: measure.pending, b: p }); measure.pending = null; if (measure.list.length > 12) measure.list.shift(); }
  updatePanel(); emit('measure');
  return true;
}

export function initMeasure(canvas, panelEl) {
  panel = panelEl;
  canvas.addEventListener('pointermove', (e) => {
    if (!measure.active || !measure.pending) return;
    const r = canvas.getBoundingClientRect();
    measure.hover = [e.clientX - r.left, e.clientY - r.top];
    emit('render');
  });
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'clear') clearMeasures();
    else if (b.dataset.act === 'done') toggleMeasure(false);
    else if (b.dataset.act === 'snap') { measure.snap = !measure.snap; updatePanel(); }
  });
  on('time', updatePanel);
  setInterval(() => { if (measure.list.length && !panel.hidden) updatePanel(); }, 1000);
}

function updatePanel() {
  if (!panel) return;
  if (!measure.active && !measure.list.length) { panel.hidden = true; return; }
  const frame = getFrame(), bodies = getBodies(frame);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  let html = '<div class="mp-head">Angular distance</div>';
  if (measure.active) html += `<div class="mp-hint">${measure.pending ? 'Click the second point (' + esc(nameOf(measure.pending)) + ' → ?)' : (measure.snap ? 'Click two points. Clicks snap to objects; near the edge of a disc they snap to its limb.' : 'Click two points (free: no snapping).')}</div>`;
  const rows = measure.list.slice(-5).map((m) => {
    const a = eqjOf(m.a, frame, bodies), b = eqjOf(m.b, frame, bodies);
    if (!a || !b) return '';
    const s = separation(a, b, frame);
    return `<div class="mp-row"><span class="mp-names">${esc(nameOf(m.a))} → ${esc(nameOf(m.b))}</span><span class="mp-val">${fmtSep(s.sep)}</span><span class="mp-pa">PA ${s.pa.toFixed(1)}°</span></div>`;
  }).join('');
  html += rows;
  html += `<div class="mp-acts">${measure.list.length ? '<button class="btn" data-act="clear">Clear</button>' : ''}${measure.active ? `<button class="btn${measure.snap ? ' on' : ''}" data-act="snap" aria-pressed="${measure.snap}" title="Snap clicks to objects and limbs">Snap</button><button class="btn" data-act="done">Done <kbd>R</kbd></button>` : ''}</div>`;
  if (html !== panel.dataset.html) { panel.innerHTML = html; panel.dataset.html = html; }
  panel.hidden = false;
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
  const marker = (p) => { ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 2 * Math.PI); ctx.fill(); };
  const arc = (ha, hb, label) => {
    const pts = new Float64Array([ha[0], ha[1], ha[2], hb[0], hb[1], hb[2]]);
    const strips = projectPolyline(pts, Math.max(Math.min(2, cam.fov / 20), 1e-4));
    strokeStrips(ctx, strips);
    const okA = proj(ha, pa), okB = proj(hb, pb);
    if (okA) marker(pa);
    if (okB) marker(pb);
    if (label) {
      // label at the middle of the visible arc
      let mid = unit([ha[0] + hb[0], ha[1] + hb[1], ha[2] + hb[2]]);
      const pm = [0, 0];
      if (proj(mid, pm) && pm[0] > 0 && pm[0] < cam.w && pm[1] > 0 && pm[1] < cam.h) {
        const dx = pb[0] - pa[0], dy = pb[1] - pa[1], d = Math.hypot(dx, dy) || 1;
        let nx = -dy / d, ny = dx / d; if (ny > 0) { nx = -nx; ny = -ny; }       // offset to the upper side of the line
        ctx.font = "600 12.5px 'JetBrains Mono', ui-monospace, monospace"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(2,6,14,0.9)'; ctx.lineJoin = 'round';
        ctx.strokeText(label, pm[0] + nx * 13, pm[1] + ny * 13);
        ctx.fillText(label, pm[0] + nx * 13, pm[1] + ny * 13);
        ctx.lineWidth = 1.6; ctx.strokeStyle = 'rgba(255,214,107,0.95)'; ctx.textAlign = 'left';
      }
    }
  };
  for (const m of measure.list) {
    const a = eqjOf(m.a, frame, bodies), b = eqjOf(m.b, frame, bodies);
    if (!a || !b) continue;
    const s = angleBetween(a, b);
    arc(toHor(a), toHor(b), fmtArc(s));
  }
  if (measure.pending) {
    const a = eqjOf(measure.pending, frame, bodies);
    if (a) {
      const ha = toHor(a);
      if (measure.hover) {
        let h = unproject(measure.hover[0], measure.hover[1]);
        if (R.refr) h = unrefractHor(h);
        ctx.setLineDash([5, 4]);
        const s = angleBetween(ha, h);
        arc(ha, h, fmtArc(s));
        ctx.setLineDash([]);
      } else if (proj(ha, pa)) marker(pa);
    }
  }
  ctx.restore();
}
