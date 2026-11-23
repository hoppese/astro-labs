// labs/util.js: small helpers shared by the labs modules (projection of a J2000 direction, DOM, text).

import { DEG, RAD, clamp, mulMV, unit, cross, refractHor } from '../astro.js';
import { cam, projectHor } from '../camera.js';
import { R } from '../render/proj.js';

const p = [0, 0];
/** Screen place of an apparent J2000 direction in the current frame: {x, y, scale px/deg, alt} or null. */
export function placeEqj(u, frame = R.frame) {
  const h0 = mulMV(frame.Mjh, u);
  const h = R.refr ? refractHor(h0) : h0;
  // no view-cone test: a big circle (the Sun, the Earth's shadow) can cross the screen with its centre far off it
  const V = cam.V, vz = V[6] * h[0] + V[7] * h[1] + V[8] * h[2];
  if (vz < -0.2) return null;
  const k = 2 * cam.s / (1 + vz);
  p[0] = cam.cx + k * (V[0] * h[0] + V[1] * h[1] + V[2] * h[2]);
  p[1] = cam.cy - k * (V[3] * h[0] + V[4] * h[1] + V[5] * h[2]);
  return { x: p[0], y: p[1], scale: cam.s * 2 / (1 + vz) * DEG, alt: Math.asin(clamp(h[2], -1, 1)) * RAD };
}
/** North and east unit tangents (J2000) at direction c. */
export function tangent(c) {
  const e = unit(cross([0, 0, 1], c)), n = cross(c, e);
  return { n, e };
}
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function el(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
  if (html) e.innerHTML = html;
  return e;
}
/** "1 h 05 m 48 s" for a duration in ms (always shows seconds). */
export function fmtDuration(ms) {
  const neg = ms < 0; let s = Math.round(Math.abs(ms) / 1000);
  const d = Math.floor(s / 86400); s -= d * 86400;
  const h = Math.floor(s / 3600); s -= h * 3600;
  const m = Math.floor(s / 60); s -= m * 60;
  const p2 = (n) => String(n).padStart(2, '0');
  const t = (d ? d + ' d ' : '') + (d || h ? (d ? p2(h) : h) + ' h ' : '') + (d || h ? p2(m) : m) + ' m ' + p2(s) + ' s';
  return (neg ? '−' : '') + t;
}
