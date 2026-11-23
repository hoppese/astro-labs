// objects.js: one way to refer to anything in the sky, and to find out where it is right now.
//   {kind: 'star', k: tier, i: index}   {kind: 'body', id: 'Jupiter' | 'Io' | ...}
//   {kind: 'dso', idx}                  {kind: 'con', id: 'Ori'}

import { mulMV, unit, refractHor } from './astro.js';
import { state } from './state.js';
import { stars, starRecord, starLabel, dso, constellations, starApparentEqj } from './catalog.js';

export function refKey(ref) {
  if (!ref) return '';
  if (ref.kind === 'star') return 's' + ref.k + ':' + ref.i;
  if (ref.kind === 'body') return 'b' + ref.id;
  if (ref.kind === 'dso') return 'd' + ref.idx;
  return 'c' + ref.id;
}
export const sameRef = (a, b) => refKey(a) === refKey(b);

/** Apparent J2000 direction (unit vector; aberration included) or null if it cannot be resolved yet. */
export function refEqj(ref, frame, bodies) {
  if (ref.kind === 'body') { const b = bodies.byId[ref.id]; return b ? b.u : null; }
  let v = null;
  if (ref.kind === 'star') return starApparentEqj(ref.k, ref.i, frame);
  else if (ref.kind === 'dso') { const o = dso.rows[ref.idx]; if (!o) return null; v = o.vec; }
  else if (ref.kind === 'con') { const c = constellations.find((x) => x.id === ref.id); if (!c) return null; v = c.labelVec; }
  if (!v) return null;
  const b = frame.beta;
  return unit([v[0] + b[0], v[1] + b[1], v[2] + b[2]]);
}
/** True (unrefracted) HOR direction. */
export function refHorTrue(ref, frame, bodies) {
  const v = refEqj(ref, frame, bodies);
  return v ? mulMV(frame.Mjh, v) : null;
}
/** HOR direction as drawn (refracted when the atmosphere is on). */
export function refHorApparent(ref, frame, bodies) {
  const h = refHorTrue(ref, frame, bodies);
  return h && state.show.refraction ? refractHor(h) : h;
}
export function refName(ref, bodies) {
  if (!ref) return '';
  if (ref.kind === 'body') return ref.id;
  if (ref.kind === 'star') return starLabel(starRecord(ref.k, ref.i));
  if (ref.kind === 'dso') { const o = dso.rows[ref.idx]; return o.m ? 'M ' + o.m : o.id; }
  const c = constellations.find((x) => x.id === ref.id);
  return c ? c.name : '';
}
