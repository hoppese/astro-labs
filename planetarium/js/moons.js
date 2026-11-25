// moons.js: positions of moons and small bodies that astronomy-engine does not have. Both come from JPL Horizons:
//  - moons: precessing ellipses with periodic terms in longitude, fitted to 1950-2100 (js/moon-data.js, tools/fit_bodies.py). Each carries its own
//    worst error against Horizons over that span, which the object panel quotes; outside it the panel says the place is not reliable.
//  - Phoebe, the asteroids, the dwarf planets and Halley: osculating elements tabulated every 30, 50 or 1000 days, interpolated (data/smallbodies.json).

import { A, AU_KM, vecOf } from './astro.js';
import { emit } from './state.js';
import { MOON_ORBITS, MOON_T0 } from './moon-data.js';

export const MOON_SPAN = [-18262, 36525];        // days TDB from J2000: 1950.0 to 2100.0
/** Planet-centered EQJ position (au) of a fitted moon at tt days from J2000 (TDB). */
export function moonVector(id, tt) {
  const o = MOON_ORBITS[id]; if (!o) return null;
  const [ra, de, , inc, O0, dO, , w0, dw, L0, n, q] = o.p, dt = tt - MOON_T0;
  let a = o.p[2], e = o.p[6], pi = w0 + dw * dt;
  let L = L0 + n * dt + q * (dt / 36525) ** 2;
  for (const [f, s, c] of o.h) L += s * Math.sin(f * dt) + c * Math.cos(f * dt);
  // Mimas and Hyperion (tools/fit_hard.py): periodic terms in longitude, eccentricity, apse and size
  if (o.k) for (const [f, sL, cL, se, ce, sw, cw, sa, ca] of o.k) { const S = Math.sin(f * dt), C = Math.cos(f * dt); L += sL * S + cL * C; e += se * S + ce * C; pi += sw * S + cw * C; a *= 1 + sa * S + ca * C; }
  const Om = O0 + dO * dt, M = (L - pi) % (2 * Math.PI);
  let E = M; for (let k = 0; k < 8; k++) E = M + e * Math.sin(E);
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E), r = Math.hypot(x, y), u = Math.atan2(y, x) + pi - Om;
  const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(inc), si = Math.sin(inc);
  const X = r * (cO * cu - sO * su * ci), Y = r * (sO * cu + cO * su * ci), Z = r * su * si;
  // pole frame -> EQJ: z = (ra, de), x = node of its equator on the J2000 equator
  const z = [Math.cos(de) * Math.cos(ra), Math.cos(de) * Math.sin(ra), Math.sin(de)], h = Math.hypot(z[0], z[1]), bx = [-z[1] / h, z[0] / h, 0];
  const by = [z[1] * bx[2] - z[2] * bx[1], z[2] * bx[0] - z[0] * bx[2], z[0] * bx[1] - z[1] * bx[0]];
  return [0, 1, 2].map((k) => (X * bx[k] + Y * by[k] + Z * z[k]) / AU_KM);
}
export const moonError = (id) => (MOON_ORBITS[id] ? MOON_ORBITS[id].max : null);      // km, 1950-2100

// ---- tabulated elements -------------------------------------------------------------------------
export const small = { data: null, failed: false };
export function loadSmallBodies() {
  return fetch(new URL('../data/smallbodies.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => { small.data = j; emit('catalog', 'small'); }).catch((e) => { small.failed = true; console.warn('smallbodies.json', e); });
}
/** Is there a place for this body at tt? (null = data not loaded) */
export function smallCovers(id, tt) { const o = small.data && small.data[id]; if (!o) return null; return tt >= o.t0 + 2 * o.dt && tt <= o.t0 + (o.e[0].length - 4) * o.dt; }
/** Six-point Lagrange weights for a fraction f past the third point. */
function lag6(f) {
  const x = [-2, -1, 0, 1, 2, 3], w = [];
  for (let i = 0; i < 6; i++) { let p = 1; for (let j = 0; j < 6; j++) if (j !== i) p *= (f - x[j]) / (x[i] - x[j]); w.push(p); }
  return w;
}
/** Position (au, EQJ) about its center ('sun', 'bary' or 'Saturn'). */
export function smallVector(id, tt) {
  const o = small.data && small.data[id]; if (!o || !smallCovers(id, tt)) return null;
  const s = (tt - o.t0) / o.dt, i = Math.floor(s), f = s - i, w = lag6(f), g = (k) => { const c = o.e[k]; let v = 0; for (let m = 0; m < 6; m++) v += w[m] * c[i - 2 + m]; return v; };
  const a = g(0), lam = g(1) + o.n * (tt - o.t0), h = g(2), k = g(3), p = g(4), q = g(5);
  const e = Math.hypot(h, k), lp = Math.atan2(h, k), ti = Math.hypot(p, q), Om = Math.atan2(p, q), inc = 2 * Math.atan(ti);
  let M = (lam - lp) % (2 * Math.PI); if (M > Math.PI) M -= 2 * Math.PI; if (M < -Math.PI) M += 2 * Math.PI;
  let E = e > 0.8 ? Math.PI * Math.sign(M || 1) : M; 
  for (let n = 0; n < 60; n++) { const d = (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E)); E -= d; if (Math.abs(d) < 1e-13) break; }
  const x = a * (Math.cos(E) - e), y = a * Math.sqrt(1 - e * e) * Math.sin(E), r = Math.hypot(x, y), u = Math.atan2(y, x) + lp - Om;
  const cu = Math.cos(u), su = Math.sin(u), cO = Math.cos(Om), sO = Math.sin(Om), ci = Math.cos(inc), si = Math.sin(inc);
  return [r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si];
}
export const smallCentre = (id) => (small.data && small.data[id] ? small.data[id].c : 'sun');
/** Sun-centered position (au, EQJ) of a small body. */
export function smallHelio(id, time, ssb) {
  const v = smallVector(id, time.tt); if (!v) return null;
  if (smallCentre(id) !== 'bary') return v;
  const s = ssb || vecOf(A.HelioVector('SSB', time));
  return [v[0] + s[0], v[1] + s[1], v[2] + s[2]];
}
