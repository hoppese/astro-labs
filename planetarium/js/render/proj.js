// render/proj.js: the per-draw rendering context and the projection helpers every layer uses.
// `R` is filled in by renderer.js at the start of each frame.

import { mulMV, refractHor, DEG, clamp } from '../astro.js';
import { cam, projectHor } from '../camera.js';

export const R = {
  ctx: null, frame: null, bodies: null, sky: null,
  atmo: true,              // extinction, sky glow
  refr: true,              // refraction (independent of atmo)
  ground: true,
  labels: null,
};

const tmp = [0, 0];
/** True (unrefracted) HOR unit vector -> screen. Applies refraction when the atmosphere is on. */
export function projTrueHor(h, out) {
  return projectHor(R.refr ? refractHor(h) : h, out);
}
/** J2000 unit vector of a fixed object (star, DSO, line vertex) -> screen, with aberration and refraction. */
export function projEqj(v, out) {
  return projTrueHor(R.frame.starHor(v), out);
}
/** Apparent altitude (degrees) of a true HOR vector, as drawn. */
export function apparentAlt(h) {
  return Math.asin(clamp((R.refr ? refractHor(h) : h)[2], -1, 1)) / DEG;
}

/** Project a polyline given as true-HOR unit vectors (flat xyz array). Long pieces are subdivided
 *  so they follow the projection's curvature. Pass refract = false for lines that are already
 *  in apparent coordinates (the alt-az grid, the horizon, the meridian). Returns screen strips: [[x0, y0, x1, y1, ...], ...]. */
export function projectPolyline(pts, maxStepDeg, refract = true) {
  const proj = refract ? projTrueHor : projectHor;
  const strips = [];
  let cur = null;
  const n = pts.length / 3;
  const V = cam.V, zMin = cam.zMin;
  const viewR = Math.acos(clamp(zMin, -1, 1));
  const step = Math.max(1e-4, maxStepDeg) * DEG;
  const LIM = 30000;
  const emit = (h) => {
    if (proj(h, tmp) && Math.abs(tmp[0]) < LIM && Math.abs(tmp[1]) < LIM) {
      if (!cur) { cur = []; strips.push(cur); }
      cur.push(tmp[0], tmp[1]);
    } else cur = null;
  };
  for (let i = 0; i < n - 1; i++) {
    const ax = pts[3 * i], ay = pts[3 * i + 1], az = pts[3 * i + 2];
    const bx = pts[3 * i + 3], by = pts[3 * i + 4], bz = pts[3 * i + 5];
    const da = Math.acos(clamp(V[6] * ax + V[7] * ay + V[8] * az, -1, 1));
    const db = Math.acos(clamp(V[6] * bx + V[7] * by + V[8] * bz, -1, 1));
    const seg = Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1));
    if (Math.min(da, db) - seg > viewR + 0.02) { cur = null; continue; }        // nowhere near the view
    const k = Math.max(1, Math.min(400, Math.ceil(seg / step)));
    if (!cur) emit([ax, ay, az]);
    for (let j = 1; j <= k; j++) {
      const t = j / k;
      let x = ax + (bx - ax) * t, y = ay + (by - ay) * t, z = az + (bz - az) * t;
      const r = Math.hypot(x, y, z);
      emit([x / r, y / r, z / r]);
    }
  }
  return strips;
}

export function strokeStrips(ctx, strips) {
  ctx.beginPath();
  for (const s of strips) {
    if (s.length < 4) continue;
    ctx.moveTo(s[0], s[1]);
    for (let i = 2; i < s.length; i += 2) ctx.lineTo(s[i], s[i + 1]);
  }
  ctx.stroke();
}

/** Transform a flat array of EQJ unit vectors into true-HOR vectors (aberration applied). */
export function eqjArrayToHor(src, dst) {
  const M = R.frame.Mjh, b = R.frame.beta;
  for (let i = 0; i < src.length; i += 3) {
    const x = src[i] + b[0], y = src[i + 1] + b[1], z = src[i + 2] + b[2];
    dst[i] = M[0] * x + M[1] * y + M[2] * z;
    dst[i + 1] = M[3] * x + M[4] * y + M[5] * z;
    dst[i + 2] = M[6] * x + M[7] * y + M[8] * z;
  }
  return dst;
}
export { mulMV };
