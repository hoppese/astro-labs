// jpl.js: positions of the Sun, Moon and planets from JPL's DE440 / DE441 ephemerides, as compact Chebyshev segments made by
// tools/build_ephemeris.py (data/ephem/, loaded by stretches of time). astronomy-engine (vendor/astronomy.js, patched: tools/patch_engine.py)
// asks this module for every position, so the discs, the events finder, rise and set, shadows and trails all use the same numbers.
//   near set: 1550.2 to 2249.3, DE440, a few km for the inner planets, 14 km for the Moon (at most about 0.02 arcsec from the Earth)
//   far set:  3000 BC to AD 3001 outside that, DE441, planets to about 1 arcsec; the Moon there from a series fitted to DE441 (1 arcsec rms, 9 at worst)
// While a stretch is on its way: astronomy-engine's own series for the planets, the fitted series for the Moon.
// Times are TT days from J2000 (TT and TDB differ by under 2 ms). Axes: ICRF. Units: au, au/day.

import { A } from './astro.js';
import { emit } from './state.js';

const AU = 149597870.7, EMRAT = 81.3005682214972;
const base = new URL('../data/ephem/', import.meta.url);
let man = null, moonFar = null, sets = [], bodyIn = {};
const chunks = new Map();            // 'near-3' -> {state, bodies: {id: {seg, nc, t0, C: Float64Array, ell}}, at}
export const jpl = { version: 0, ready: false, failed: false, chunks };

function decode(buf, set, c) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let o = 0; const out = {};
  for (const b of set.bodies) {
    const t0 = set.t0 + c * set.L, nc = b.deg + 1, ns = Math.round(set.L / b.seg), r = { t0, seg: b.seg, nc, ns, ell: null, tm: t0 + set.L / 2 };
    if (b.ell) { r.ell = new Float64Array(11); for (let i = 0; i < 11; i++) r.ell[i] = dv.getFloat64(o + 8 * i, true); o += 88; }
    const w = u8.subarray(o, o + 3 * nc); o += 3 * nc;
    const C = new Float64Array(ns * nc * 3); let bit = o * 8;
    for (let k = 0; k < nc; k++) for (let j = 0; j < 3; j++) {
      const n = w[3 * k + j]; if (!n) continue;
      const half = 2 ** (n - 1);
      for (let s = 0; s < ns; s++) {
        let v = 0, left = n;
        while (left > 0) { const avail = 8 - (bit & 7), take = Math.min(avail, left); v = v * 2 ** take + ((u8[bit >> 3] >> (avail - take)) & ((1 << take) - 1)); bit += take; left -= take; }
        C[(s * 3 + j) * nc + k] = (v - half) * b.q;
      }
    }
    o = Math.ceil(bit / 8); r.C = C; out[b.id] = r;
  }
  return out;
}
function load(set, c) {
  const key = set.name + '-' + c; let h = chunks.get(key);
  if (h) { if (h.state !== -1 || Date.now() - h.at < 15000) return h.promise; }
  h = { state: 0, at: Date.now(), bodies: null }; chunks.set(key, h);
  h.promise = fetch(new URL(key + '.bin', base)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); })
    .then((buf) => { h.bodies = decode(buf, set, c); h.state = 1; jpl.version++; emit('catalog', 'ephem'); })
    .catch((e) => { h.state = -1; h.at = Date.now(); console.warn('ephemeris', key, e.message); });
  return h.promise;
}
/** Which stretch of which set holds tt. The near set where it exists. */
function place(tt) {
  for (const s of sets) { const x = (tt - s.t0) / s.L, c = Math.floor(x); if (c >= 0 && c < s.n && !s.skipSet.has(c)) return { s, c, f: x - c }; }
  return null;
}
function want(tt) {
  const p = place(tt); if (!p) return null;
  const h = chunks.get(p.s.name + '-' + p.c);
  if (!h || (h.state === -1 && Date.now() - h.at > 15000)) load(p.s, p.c);
  // the neighbour, a year or so before it is needed
  const m = p.f < 0.04 ? place(tt - p.s.L * 0.05) : p.f > 0.96 ? place(tt + p.s.L * 0.05) : null;
  if (m && !chunks.has(m.s.name + '-' + m.c)) load(m.s, m.c);
  return h && h.state === 1 ? h.bodies : null;
}
/** Load everything needed for [tt0, tt1] (the events finder does this before searching). At most `max` stretches. */
export async function ensure(tt0, tt1 = tt0, max = 12) {
  if (!man) await init();
  if (!man) return;
  const jobs = []; let t = tt0;
  for (let k = 0; k < max && t <= tt1 + 1; k++) { const p = place(t); if (!p) { t += 3650; continue; } jobs.push(load(p.s, p.c)); t = p.s.t0 + (p.c + 1) * p.s.L + 0.01; }
  await Promise.all(jobs);
}
export const covered = (tt) => { const p = place(tt), h = p && chunks.get(p.s.name + '-' + p.c); return !!(h && h.state === 1); };

// ---- evaluation ----------------------------------------------------------------------------------
const K = new Float64Array(3);
function kepler(p, d) {
  const u = d / 10000, h = p[3] + p[7] * u, k = p[4] + p[8] * u, P = p[5] + p[9] * u, Q = p[6] + p[10] * u, lam = p[1] + p[2] * d;
  let F = lam;
  for (let i = 0; i < 12; i++) { const s = Math.sin(F), c = Math.cos(F), e = (F + h * c - k * s - lam) / (1 - h * s - k * c); F -= e; if (Math.abs(e) < 1e-14) break; }
  const b = 1 / (1 + Math.sqrt(1 - h * h - k * k)), c = Math.cos(F), s = Math.sin(F);
  const X = p[0] * ((1 - h * h * b) * c + h * k * b * s - k), Y = p[0] * ((1 - k * k * b) * s + h * k * b * c - h), q = 2 * Math.sqrt(1 - P * P - Q * Q);
  K[0] = X * (1 - 2 * P * P) + Y * 2 * P * Q; K[1] = X * 2 * P * Q + Y * (1 - 2 * Q * Q); K[2] = -X * P * q + Y * Q * q;
}
/** Position (km) of one body at tt from segment s of its record. */
function evalSeg(r, s, tt, out) {
  const x = (tt - r.t0 - r.seg * (s + 0.5)) / (r.seg / 2), x2 = 2 * x, nc = r.nc, C = r.C;
  for (let j = 0; j < 3; j++) { let b1 = 0, b2 = 0; const o = (s * 3 + j) * nc; for (let k = nc - 1; k > 0; k--) { const t = x2 * b1 - b2 + C[o + k]; b2 = b1; b1 = t; } out[j] = x * b1 - b2 + C[o]; }
  if (r.ell) { kepler(r.ell, tt - r.tm); out[0] += K[0]; out[1] += K[1]; out[2] += K[2]; }
}
const a1 = [0, 0, 0], a2 = [0, 0, 0];
/** [x, y, z] au, or with vel [x, y, z, vx, vy, vz]; null when the stretch is not here yet. */
function raw(set, id, tt, vel) {
  const r = set && set[id]; if (!r) return null;
  const s = Math.max(0, Math.min(r.ns - 1, Math.floor((tt - r.t0) / r.seg)));
  if (!vel) { const o = [0, 0, 0]; evalSeg(r, s, tt, o); o[0] /= AU; o[1] /= AU; o[2] /= AU; return o; }
  const h = 0.01; evalSeg(r, s, tt - h, a1); evalSeg(r, s, tt + h, a2);
  const o = [0, 0, 0]; evalSeg(r, s, tt, o);
  return [o[0] / AU, o[1] / AU, o[2] / AU, (a2[0] - a1[0]) / (2 * h * AU), (a2[1] - a1[1]) / (2 * h * AU), (a2[2] - a1[2]) / (2 * h * AU)];
}
const plus = (a, b, f) => a.map((v, i) => v + f * b[i]);

// The Moon outside the near set: a series in the mean arguments, fitted to DE441 over 3000 BC - AD 3001 (tools/fit_moon_far.py), mean ecliptic and equinox of date.
function farMoonOnce(tt) {
  if (!moonFar) return null;
  const T = tt / 36525, U = tt / 1e6, ar = moonFar.args.map((c) => { let v = 0; for (let i = c.length - 1; i >= 0; i--) v = v * T + c[i]; return v; });
  const sum = (o) => {
    let v = o.c[0] + o.c[1] * U;
    for (const [m, c] of o.t) {
      let a = 0; for (let i = 0; i < 10; i++) if (m[i]) a += m[i] * ar[i];
      let S = 0, Cc = 0, u = 1; for (let i = 0; i < c.length; i += 2) { S += c[i] * u; Cc += (c[i + 1] || 0) * u; u *= U; }
      v += o.u * (S * Math.sin(a) + Cc * Math.cos(a));
    }
    return v;
  };
  const lon = ar[9] + sum(moonFar.lon), lat = sum(moonFar.lat), R = 385000 * (1 + sum(moonFar.r)) / AU, cb = Math.cos(lat);
  return A.EclipticOfDateToEqj([R * cb * Math.cos(lon), R * cb * Math.sin(lon), R * Math.sin(lat)], tt);
}
function farMoon(tt, vel) {
  const p = farMoonOnce(tt); if (!p || !vel) return p;
  const a = farMoonOnce(tt - 0.01), b = farMoonOnce(tt + 0.01);
  return [p[0], p[1], p[2], (b[0] - a[0]) / 0.02, (b[1] - a[1]) / 0.02, (b[2] - a[2]) / 0.02];
}
/** Geocentric Moon. At the two ends of the near set it is eased into the fitted series over 200 days (they differ by about 1 arcsec). */
export function moon(tt, vel) {
  const set = want(tt), n = raw(set, 'Moon', tt, vel);
  if (!n) return farMoon(tt, vel);
  const s = sets[0], e = Math.min(tt - s.t0, s.t0 + s.n * s.L - tt);
  if (e < 200) { const f = farMoon(tt, vel); if (f) { const w = e / 200, k = w * w * (3 - 2 * w); return n.map((v, i) => f[i] + k * (v - f[i])); } }
  return n;
}
/** Sun from the solar-system barycenter. */
export function sunBary(tt, vel) { return raw(want(tt), 'Sun', tt, vel); }
/** Heliocentric place of a planet's SYSTEM (its barycenter; the Earth's is its own center). */
export function helio(id, tt, vel) {
  const set = want(tt); if (!set) return null;
  if (id === 'Earth' || id === 'EMB') { const e = raw(set, 'EMB', tt, vel); if (!e || id === 'EMB') return e; const m = moon(tt, vel); return m ? plus(e, m, -1 / (1 + EMRAT)) : null; }
  const p = raw(set, id, tt, vel); if (!p) return null;
  return set[id].ell ? p : plus(p, raw(set, 'Sun', tt, vel), -1);
}

// ---- start ---------------------------------------------------------------------------------------
let starting = null;
export function init() {
  if (starting) return starting;
  starting = Promise.all([fetch(new URL('index.json', base)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }), fetch(new URL('moon-far.json', base)).then((r) => (r.ok ? r.json() : null))]).then(([j, m]) => {
    man = j; sets = j.sets.map((s) => ({ ...s, skipSet: new Set(s.skip) }));
    moonFar = m; if (m) { m.lon.u = m.lat.u = Math.PI / 648000; m.r.u = 1e-6; }
    if (A.SetEphemeris) A.SetEphemeris({ helio, moon, sunBary, version: () => jpl.version });
    jpl.ready = true; jpl.version++;
  }).catch((e) => { jpl.failed = true; console.warn('JPL ephemeris files did not load: positions fall back to astronomy-engine (errors up to about 20 arcseconds).', e.message); });
  return starting;
}
/** All stretches (checks only). */
export async function loadAll() { await init(); await Promise.all(sets.flatMap((s) => Array.from({ length: s.n }, (_, c) => c).filter((c) => !s.skipSet.has(c)).map((c) => load(s, c)))); }
