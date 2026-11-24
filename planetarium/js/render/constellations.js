// render/constellations.js: stick figures, IAU boundaries and names.

import { state } from '../state.js';
import { cam } from '../camera.js';
import { constellations } from '../catalog.js';
import { R, projectPolyline, strokeStrips, eqjArrayToHor, projTrueHor, apparentAlt } from './proj.js';
import { addPick } from '../picks.js';

let scratch = new Float64Array(3 * 512);
const out = [0, 0];

function toHor(src) {
  if (scratch.length < src.length) scratch = new Float64Array(src.length * 2);
  return eqjArrayToHor(src, scratch.subarray(0, src.length));
}

export function drawConstellations(ctx) {
  const sh = state.show;
  const step = Math.max(Math.min(4, cam.fov / 8), 1e-3);
  if (sh.conBounds) {
    const all = [];
    for (const c of constellations) for (const b of c.boundVecs) all.push(...projectPolyline(toHor(b), step));
    ctx.strokeStyle = 'rgba(186,140,205,0.5)'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    strokeStrips(ctx, all);
    ctx.setLineDash([]);
  }
  if (sh.conLines) {
    const all = [];
    for (const c of constellations) for (const l of c.lineVecs) all.push(...projectPolyline(toHor(l), step));
    ctx.strokeStyle = `rgba(118,160,226,${0.5 - 0.2 * R.sky.day})`; ctx.lineWidth = 1.15; ctx.lineJoin = 'round';
    strokeStrips(ctx, all);
  }
  if (sh.conNames && cam.fov > 4) {
    for (const c of constellations) {
      const h = toHor(c.labelVec);
      if (R.ground && apparentAlt(h) < 1) continue;
      if (!projTrueHor(h, out)) continue;
      if (out[0] < -40 || out[0] > cam.w + 40 || out[1] < -20 || out[1] > cam.h + 20) continue;
      R.labels.add(out[0], out[1], c.name, 'con', 52 - c.rank * 6, { anchor: 'center' });
      addPick(out[0], out[1], 4, 12, { kind: 'con', id: c.id });
    }
  }
}
