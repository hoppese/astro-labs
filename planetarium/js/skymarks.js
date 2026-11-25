// skymarks.js: things drawn on top of the sky that belong to no catalogue: the reader's own marks
// (set from the right-click menu) and the highlighted constellation region (the one under the pointer
// while boundaries are shown, and a selected constellation's outline and figure).

import { state, emit } from './state.js';
import { cam } from './camera.js';
import { constellations } from './catalog.js';
import { refEqj, refKey, refName } from './objects.js';
import { projectPolyline, strokeStrips, eqjArrayToHor, projEqj } from './render/proj.js';
import { clipToSky } from './render/groundshade.js';
import { pointer, conById } from './cursor.js';

export const marks = [];          // {key, ref | vec, name}
const keyOf = (t) => (t.ref ? refKey(t.ref) : 'v' + t.vec.map((v) => v.toFixed(5)).join(','));
export const isMarked = (t) => marks.some((m) => m.key === keyOf(t));
export function toggleMark(t) {
  const k = keyOf(t), i = marks.findIndex((m) => m.key === k);
  if (i >= 0) marks.splice(i, 1);
  else marks.push({ key: k, ref: t.ref || null, vec: t.vec || null, name: t.name || (t.ref ? refName(t.ref) : 'Mark ' + (marks.filter((m) => !m.ref).length + 1)) });
  emit('render');
  return i < 0;
}
export function clearMarks() { marks.length = 0; emit('render'); }

let scratch = new Float64Array(3 * 1024);
const toHor = (src) => { if (scratch.length < src.length) scratch = new Float64Array(src.length * 2); return eqjArrayToHor(src, scratch.subarray(0, src.length)); };
const p = [0, 0];

/** Outline (and optionally the stick figure) of one constellation. Call inside a clipToSky() block when the ground is on. */
export function strokeConstellation(ctx, c, { bounds = true, lines = false, color = 'rgba(232,184,106,0.9)', width = 1.6, dash = [6, 4] } = {}) {
  const step = Math.max(Math.min(4, cam.fov / 8), 1e-3);
  ctx.strokeStyle = color; ctx.lineJoin = 'round';
  if (bounds) {
    const all = [];
    for (const b of c.boundVecs) all.push(...projectPolyline(toHor(b), step));
    ctx.lineWidth = width; ctx.setLineDash(dash); strokeStrips(ctx, all); ctx.setLineDash([]);
  }
  if (lines) {
    const all = [];
    for (const l of c.lineVecs) all.push(...projectPolyline(toHor(l), step));
    ctx.lineWidth = width + 0.6; strokeStrips(ctx, all);
  }
}

/** A moon that cannot be seen because its planet hides or darkens it: say so where it is. */
function drawHidden(R) {
  for (const ref of [state.selected, state.tracking ? state.trackRef : null]) {
    const b = ref && ref.kind === 'body' ? R.bodies.byId[ref.id] : null;
    if (!b || b.kind !== 'satellite' || !(b.occulted || b.light < 0.5)) continue;
    if (!projEqj([b.u[0] - R.frame.beta[0], b.u[1] - R.frame.beta[1], b.u[2] - R.frame.beta[2]], p)) continue;
    R.labels.add(p[0], p[1], b.occulted ? `${b.id} is behind ${b.parent}` : `${b.id} is in ${b.parent}’s shadow`, 'planet', 900, { anchor: 'below', gap: Math.max(13, b.angRadius * cam.pxPerDeg + 8) + 4 });
    return;
  }
}
export function drawSkyMarks(ctx, R) {
  drawHidden(R);
  const sel = state.selected && state.selected.kind === 'con' ? constellations.find((c) => c.id === state.selected.id) : null;
  const hov = state.show.conBounds && pointer.inside && pointer.con ? conById(pointer.con) : null;
  if (sel || hov) {
    ctx.save();
    if (R.ground) clipToSky(ctx);
    if (hov && hov !== sel) strokeConstellation(ctx, hov, { color: 'rgba(214,170,236,0.85)', width: 1.4, dash: [5, 4] });
    if (sel) strokeConstellation(ctx, sel, { lines: true, color: 'rgba(255,214,140,0.9)' });
    ctx.restore();
  }
  if (!marks.length) return;
  ctx.save();
  ctx.font = "600 11.5px 'Source Sans 3', system-ui, sans-serif"; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const m of marks) {
    const v = m.ref ? refEqj(m.ref, R.frame, R.bodies) : null;
    let ok;
    if (m.ref) { if (!v) continue; ok = projEqj([v[0] - R.frame.beta[0], v[1] - R.frame.beta[1], v[2] - R.frame.beta[2]], p); }
    else ok = projEqj(m.vec, p);
    if (!ok || p[0] < -20 || p[0] > cam.w + 20 || p[1] < -20 || p[1] > cam.h + 20) continue;
    const x = Math.round(p[0]) + 0.5, y = Math.round(p[1]) + 0.5, r = 9;
    ctx.strokeStyle = 'rgba(2,6,14,0.8)'; ctx.lineWidth = 3.4;
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      ctx.moveTo(x - r, y); ctx.lineTo(x - 3.5, y); ctx.moveTo(x + 3.5, y); ctx.lineTo(x + r, y);
      ctx.moveTo(x, y - r); ctx.lineTo(x, y - 3.5); ctx.moveTo(x, y + 3.5); ctx.lineTo(x, y + r);
      ctx.moveTo(x + r * 0.72, y); ctx.arc(x, y, r * 0.72, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.strokeStyle = '#7fe0c8'; ctx.lineWidth = 1.4;
    }
    if (!m.ref) {            // an object already carries its own name; a bare sky point gets "Mark n"
      ctx.strokeStyle = 'rgba(2,6,14,0.85)'; ctx.lineWidth = 3; ctx.strokeText(m.name, x + r + 5, y - r);
      ctx.fillStyle = '#9af0da'; ctx.fillText(m.name, x + r + 5, y - r);
    }
  }
  ctx.restore();
}
