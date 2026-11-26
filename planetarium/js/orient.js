// orient.js: which way every body is turned. Poles, prime meridians and figures are the IAU Working Group's (WGCCRE 2015) as NAIF's
// pck00011.tpc holds them (js/orient-data.js, tools/build_orient.py). Times are TDB days from J2000 (astronomy-engine's tt) and must already
// be moved back by the light time. Frame: EQJ (J2000 equator), the same axes as everything else. tools/check-bodies.mjs compares with JPL Horizons.

import { A, DEG, RAD, vecOf, unit, cross, dot, mod } from './astro.js';
import { ORIENT, ANGLES } from './orient-data.js';

const poly = (c, t) => c[0] + (c[1] || 0) * t + (c[2] || 0) * t * t;
/** {ra, dec, w} in degrees. */
export function poleAndMeridian(id, tt) {
  const o = ORIENT[id]; if (!o) return null;
  const T = tt / 36525;
  let ra = poly(o.ra, T), dec = poly(o.dec, T), w = poly(o.w, tt);
  if (o.sys) {
    const ang = ANGLES[o.sys];
    for (let i = 0; i < ang.length; i++) {
      const n = (o.nra && o.nra[i]) || 0, d = (o.ndec && o.ndec[i]) || 0, m = (o.nw && o.nw[i]) || 0;
      if (!n && !d && !m) continue;
      const a = poly(ang[i], T) * DEG, s = Math.sin(a);
      ra += n * s; dec += d * Math.cos(a); w += m * s;
    }
  }
  return { ra, dec, w: mod(w, 360) };
}
function axesFrom(ra, dec, w) {
  const a = ra * DEG, d = dec * DEG, z = [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)];
  const q = [-Math.sin(a), Math.cos(a), 0], p = cross(z, q), c = Math.cos(w * DEG), s = Math.sin(w * DEG);
  const x = [q[0] * c + p[0] * s, q[1] * c + p[1] * s, q[2] * c + p[2] * s];
  return { x, y: cross(z, x), z };
}
/** Body-fixed axes (unit vectors in EQJ): z = north pole, x = prime meridian on the equator. null when no rotation model is known. */
export function bodyAxes(id, tt) {
  if (id === 'Moon' || id === 'Earth') { const r = A.RotationAxis(id, A.AstroTime.FromTerrestrialTime(tt)); return axesFrom(r.ra * 15, r.dec, r.spin); }
  const p = poleAndMeridian(id, tt);
  return p && axesFrom(p.ra, p.dec, p.w);
}
export const toBody = (ax, v) => [dot(ax.x, v), dot(ax.y, v), dot(ax.z, v)];
/** Sub-point of direction v (EQJ, from the body's center): {lon east 0-360, lat planetocentric, latG planetographic}, degrees. */
export function subPoint(ax, v, radii) {
  const b = toBody(ax, unit(v)), h = Math.hypot(b[0], b[1]);
  const f = radii ? (radii[0] / radii[2]) ** 2 : 1;
  return { lon: mod(Math.atan2(b[1], b[0]) * RAD, 360), lat: Math.atan2(b[2], h) * RAD, latG: Math.atan2(b[2] * f, h) * RAD };
}
/** Figure radii [a, b, c] km. */
export const figure = (id) => (id === 'Moon' ? [1737.4, 1737.4, 1737.4] : ORIENT[id] ? ORIENT[id].r : null);
/** Degrees of rotation per second (signed as seen on the sky axes; 0 when unknown). */
export const spinRate = (id) => (id === 'Moon' ? 13.17635815 / 86400 : id === 'Earth' ? 360.9856235 / 86400 : ORIENT[id] ? (ORIENT[id].w[1] || 0) / 86400 : 0);

// ---- Jupiter's three longitude systems -----------------------------------------------------------
/** West central-meridian longitudes {I, II, III} for a sub-observer east longitude (System III frame). */
export function jupiterSystems(lonEast, tt) {
  const III = mod(360 - lonEast, 360);
  return { I: mod(III + (67.1 + 877.900 * tt) - (284.95 + 870.536 * tt), 360), II: mod(III + (43.3 + 870.270 * tt) - (284.95 + 870.536 * tt), 360), III };
}
// ---- the Great Red Spot --------------------------------------------------------------------------
// System II longitude of the spot's centre. 2015-2025: measured for this app on the published Hubble OPAL global maps (f395n, both rotations of each
// year; they agree to 0.4 deg). 2026-06-01: 91 deg with a drift of 1.75 deg/month, the values Sky & Telescope's transit calculator uses (JUPOS).
const J = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 - 10957.5;
const GRS = [[J(2015, 1, 19.3), 223.6], [J(2016, 2, 9.6), 240.3], [J(2017, 4, 3.5), 267.6], [J(2018, 4, 17.4), 289.1], [J(2019, 6, 26.8), 313.7], [J(2020, 8, 25.1), 340.0],
  [J(2021, 9, 4.4), 362.2], [J(2022, 11, 12.7), 387.1], [J(2024, 1, 6.1), 410.6], [J(2024, 11, 20), 423.5], [J(2025, 12, 11.6), 439.6], [J(2026, 6, 1), 451.0]];
export const GRS_RATE = 1.75 / 30.4375;                   // deg/day after the last entry
/** {lon (System II, 0-360), sigma (deg), ok, basis}. sigma: 2 deg between the measured dates (the spot also swings about 1 deg in 90 days), growing outside. */
export function grsLongitude(tt) {
  const a = GRS[0], z = GRS[GRS.length - 1];
  if (tt >= z[0]) { const dt = tt - z[0]; return { lon: mod(z[1] + GRS_RATE * dt, 360), sigma: 2 + 0.5 * dt / 30.4, ok: dt < 400, basis: 'forecast from 1 June 2026' }; }
  if (tt <= a[0]) { const dt = a[0] - tt; return { lon: mod(a[1] - 1.3 / 30.4375 * dt, 360), sigma: 2 + 0.8 * dt / 30.4, ok: dt < 200, basis: 'extrapolated back from 2015' }; }
  let i = 0; while (GRS[i + 1][0] < tt) i++;
  const f = (tt - GRS[i][0]) / (GRS[i + 1][0] - GRS[i][0]);
  return { lon: mod(GRS[i][1] + f * (GRS[i + 1][1] - GRS[i][1]), 360), sigma: 2 + 4 * f * (1 - f) * 1.5, ok: true, basis: 'Hubble OPAL maps' };
}
/** System III east longitude of the spot (the frame bodyAxes('Jupiter') uses). */
export const grsEast = (tt) => mod(360 - (grsLongitude(tt).lon + (284.95 + 870.536 * tt) - (43.3 + 870.270 * tt)), 360);
/** The spot's east longitude in data/bodies/jupiter.webp. */
export const GRS_MAP_EAST = 38.0;
/** Instant (tt days, received time) of the next transit of the spot over the central meridian: cmlII(tt) = observed System II CML, deg. */
export function nextGrsTransit(tt, cmlII, tauDays) {
  let t = tt;
  for (let k = 0; k < 6; k++) {
    let d = mod(grsLongitude(t - tauDays).lon - cmlII(t) + (k ? 180 : 0), 360) - (k ? 180 : 0);      // the spot crosses when the CML reaches its longitude
    t += d / 870.27;
  }
  return t;
}
export { vecOf };
