// render/dso.js: deep-sky objects as outline symbols by type (ellipse = galaxy, dashed circle =
// open cluster, crossed circle = globular, ticked circle = planetary nebula, square = nebula).
// Faintest magnitude shown follows the star limit, so zooming in brings more of them out.

import { DEG, RAD, clamp, unit } from '../astro.js';
import { state } from '../state.js';
import { cam } from '../camera.js';
import { dso, loadDeepDso } from '../catalog.js';
import { addPick } from '../picks.js';
import { R, projTrueHor, projEqj } from './proj.js';

const GAL = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
const NEB = new Set(['Neb', 'HII', 'RfN', 'SNR', 'EmN', 'Cl+N', 'DrkN']);
const COL = { gal: '#e08f8f', oc: '#e6cf7a', gc: '#e6cf7a', pn: '#7fd6c2', neb: '#86d09a', other: '#a8b4c4' };
const p = [0, 0], q = [0, 0];

export function dsoClass(type) {
  if (GAL.has(type)) return 'gal';
  if (type === 'OCl' || type === '*Ass') return 'oc';
  if (type === 'GCl') return 'gc';
  if (type === 'PN') return 'pn';
  if (NEB.has(type)) return 'neb';
  return 'other';
}

export function drawDso(ctx) {
  if (!state.show.dso) return;
  const { frame, sky, labels } = R;
  const lim = sky.limMag + 0.6 - 3 * sky.day;
  if (lim > 10.5 && cam.fov < 25) loadDeepDso();
  const M = frame.Mjh, b = frame.beta, V = cam.V;
  ctx.lineWidth = 1.1;
  const selIdx = state.selected && state.selected.kind === 'dso' ? state.selected.idx : -1;      // the selected one is always drawn
  for (const o of dso.rows) {
    if (o.idx === selIdx) { /* keep */ }
    else if (o.mag == null) { if (cam.fov > 25 || !(o.names || o.m || o.c)) continue; }
    else if (o.mag > lim) continue;
    const x = o.vec[0] + b[0], y = o.vec[1] + b[1], z = o.vec[2] + b[2];
    const h = [M[0] * x + M[1] * y + M[2] * z, M[3] * x + M[4] * y + M[5] * z, M[6] * x + M[7] * y + M[8] * z];
    if (R.ground && h[2] < -0.02) continue;
    if (V[6] * h[0] + V[7] * h[1] + V[8] * h[2] < cam.zMin) continue;
    if (!projTrueHor(h, p)) continue;
    if (p[0] < -30 || p[0] > cam.w + 30 || p[1] < -30 || p[1] > cam.h + 30) continue;
    const cls = dsoClass(o.type);
    const majPx = (o.maj || 0) / 60 * cam.pxPerDeg / 2;            // semi-major axis in px
    const r = clamp(majPx, 4.5, 4000);
    ctx.strokeStyle = COL[cls]; ctx.globalAlpha = o.mag == null ? 0.55 : clamp(0.45 + 0.18 * (lim - o.mag), 0.45, 0.95);
    ctx.beginPath();
    if (cls === 'gal') {
      const ratio = o.maj && o.min ? clamp(o.min / o.maj, 0.25, 1) : 0.55;
      let rot = 0;
      if (o.pa != null && projEqj(unit([o.vec[0], o.vec[1], o.vec[2] + 1e-4]), q)) {      // must stay a unit vector
        // screen direction of celestial north at the object, then position angle (north through east)
        const nx = q[0] - p[0], ny = q[1] - p[1];
        rot = Math.atan2(ny, nx) - o.pa * DEG;
      } else rot = -0.5;
      ctx.ellipse(p[0], p[1], r, r * ratio, rot, 0, 2 * Math.PI);
    } else if (cls === 'oc') {
      ctx.setLineDash([3, 3]); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
    } else if (cls === 'gc') {
      ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      ctx.moveTo(p[0] - r, p[1]); ctx.lineTo(p[0] + r, p[1]); ctx.moveTo(p[0], p[1] - r); ctx.lineTo(p[0], p[1] + r);
    } else if (cls === 'pn') {
      ctx.arc(p[0], p[1], r, 0, 2 * Math.PI);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(p[0] + dx * r, p[1] + dy * r); ctx.lineTo(p[0] + dx * (r + 3.5), p[1] + dy * (r + 3.5)); }
    } else if (cls === 'neb') {
      ctx.rect(p[0] - r, p[1] - r, 2 * r, 2 * r);
    } else {
      ctx.moveTo(p[0] - r, p[1]); ctx.lineTo(p[0], p[1] - r); ctx.lineTo(p[0] + r, p[1]); ctx.lineTo(p[0], p[1] + r); ctx.closePath();
    }
    ctx.stroke(); ctx.setLineDash([]);
    addPick(p[0], p[1], Math.min(r, 14), (o.mag ?? 12) + 3, { kind: 'dso', idx: o.idx });
    const labelLim = o.mag == null ? 99 : lim - (o.m ? 0 : 1.0);
    if ((o.mag ?? 0) < labelLim) labels.add(p[0], p[1], o.label, 'dso', 44 - (o.mag ?? 9) + (o.m ? 3 : 0), { gap: Math.min(r, 30) + 4 });
  }
  ctx.globalAlpha = 1;
}
export { RAD };
