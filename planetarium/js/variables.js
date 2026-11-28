// variables.js: stars whose brightness changes, and two kinds of object the star catalog does not hold at all (a Cepheid in another
// galaxy, supernovae). Pure: no DOM, no drawing (render/transients.js draws; tools/check-labs.mjs tests these functions).
//
// EVERY LIGHT CURVE HERE IS A MODEL, NOT A RECORD OF WHAT THE STAR DID. What is published and used as it stands:
//   - Cepheids and RR Lyrae: the General Catalogue of Variable Stars (GCVS 5.1, Samus et al. 2017, VizieR B/gcvs, fetched 2026-11-26):
//     type, V at maximum and minimum, period, a Julian Date of maximum, and M−m, the rise from minimum to maximum as a share of the period.
//     The shape between those numbers (a smooth fall, then a quicker rise of the catalog's length) is ours. Periods drift and catalog
//     epochs can be decades old, so the phase today can be off by a fraction of a cycle.
//   - Algol (β Persei), the eclipsing binary: GCVS 5.1 too (type EA/SD, V 2.12 out of eclipse, 3.39 at the middle of the primary
//     eclipse, a primary minimum on HJD 2445641.5135, period 2.8673043 d, eclipse lasting 14% of the period). The eclipse's shape (a
//     rounded V), the secondary eclipse (0.06 mag, half a period later, from the literature) and the steady light between are ours;
//     the real star's minima also wander by hours (a third star, and a slowly changing period).
//   - M31 V1, the Cepheid Hubble found in Andromeda in 1923: position, period 31.4 d and a maximum on JD 2455430.5 from Templeton et al.
//     2011 (AAVSO; arXiv:1111.0262); mean V ≈ 19.4 as quoted there. The V amplitude (0.8 mag) and the rise time are our estimate for a
//     31-day Cepheid: the paper measured in R.
//   - Supernovae: the dates and peak magnitudes below, with their sources. The rest of each curve is the typical shape of its type, scaled
//     to them: a model built on published numbers, good to a few tenths of a magnitude, not the measured light curve.

import { sph, unit } from './astro.js';

const DAY = 86400000;
export const jdOf = (ms) => ms / DAY + 2440587.5;

// ---- each student's own version of the model ----------------------------------------------------------------------------------
// In a lab every student has a notebook seed (js/notebook/host.js calls setModelSeed). The seed shifts each object's model by a small
// random amount, of the size of the uncertainty in the published numbers, so that no two students' skies are quite the same and their
// answers agree within their errors, not to the last digit. Seed 0 (no notebook open) is the catalog's values exactly.
let modelSeed = 0;
const jitCache = new Map();
export function setModelSeed(seed) { seed = seed | 0; if (seed !== modelSeed) { modelSeed = seed; jitCache.clear(); } }
export const getModelSeed = () => modelSeed;
/** Standard normal numbers for (seed, name): a small hash-seeded generator, the same in every browser. */
function normals(seed, name, n) {
  let h = 2166136261 ^ seed;
  for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  const rnd = () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ (h >>> 15), 1 | h); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out = [];
  while (out.length < n) { const u = rnd() || 1e-12, v = rnd(); out.push(Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)); }
  return out;
}
// one-sigma sizes; each shift is capped at 2.5 sigma
const cap = (x) => Math.max(-2.5, Math.min(2.5, x));
/** The shifts for one object: {dm (mag), amp (factor), dph (cycles), P (factor), dt (days)}; all zero without a seed. */
export function jitterOf(id, kind) {
  if (!modelSeed) return { dm: 0, amp: 1, dph: 0, P: 1, dt: 0 };
  let j = jitCache.get(id);
  if (!j) {
    const [a, b, c, d, e] = normals(modelSeed, String(id), 5).map(cap);
    j = kind === 'sn' ? { dm: 0.05 * a, amp: 1, dph: 0, P: 1, dt: 0.5 * b }
      : kind === 'cepheid' ? { dm: 0.08 * a, amp: 1 + 0.06 * b, dph: 0.03 * c, P: 1 + (0.1 / 31.4) * d, dt: 0 }
      : { dm: 0.05 * a, amp: 1 + 0.04 * b, dph: 0.03 * c, P: 1 + 1e-4 * d, dt: 0 };
    jitCache.set(id, j);
  }
  return j;
}

// ---- Cepheids and RR Lyrae in the star catalog, by Hipparcos number (GCVS 5.1) ------------------------------------------
// [hip, name, GCVS type, V max, V min, epoch of maximum (JD), period (d), M−m (% of the period)]
const G = [
  [110991, 'δ Cephei', 'DCEP', 3.48, 4.37, 2455479.905, 5.366208, 25],
  [97804, 'η Aquilae', 'DCEP', 3.48, 4.33, 2450323.31, 7.176915, 32],
  [34088, 'ζ Geminorum', 'DCEP', 3.62, 4.18, 2443805.927, 10.15073, 50],
  [26069, 'β Doradus', 'DCEP', 3.46, 4.08, 2440905.3, 9.8426, 48],
  [47854, 'ℓ Carinae', 'DCEP', 3.35, 4.06, 2451259.38, 35.5556, 29],
  [87072, 'X Sagittarii', 'DCEP', 4.20, 4.90, 2440741.7, 7.01283, 36],
  [89968, 'Y Sagittarii', 'DCEP', 5.25, 6.24, 2440762.38, 5.77335, 34],
  [102949, 'T Vulpeculae', 'DCEP', 5.41, 6.09, 2441705.121, 4.435462, 32],
  [88567, 'W Sagittarii', 'DCEP', 4.29, 5.14, 2443374.77, 7.59503, 32],
  [95820, 'U Aquilae', 'DCEP', 6.03, 6.83, 2447755.25, 7.024049, 26],
  [59551, 'S Muscae', 'DCEP', 5.89, 6.49, 2440299.42, 9.66007, 49],
  [93124, 'FF Aquilae', 'DCEPS', 5.18, 5.68, 2436792.539, 4.470881, 48],
  [13367, 'SU Cassiopeiae', 'DCEPS', 5.70, 6.18, 2450008.52, 1.9493236, 40],
  [11767, 'Polaris', 'DCEPS', 1.86, 2.13, 2431495.813, 3.9696, 50],
  [95497, 'RR Lyrae', 'RRAB', 7.06, 8.12, 2442923.4193, 0.56686776, 19],
  [14576, 'Algol', 'EA/SD', 2.12, 3.39, 2445641.5135, 2.8673043, 14],      // eclipsing: epoch = primary minimum, last number = eclipse length (% of P)
];
/** GCVS designations, for search. */
export const GCVS_NAME = { 110991: 'del Cep', 97804: 'eta Aql', 34088: 'zet Gem', 26069: 'bet Dor', 47854: 'l Car', 87072: 'X Sgr', 89968: 'Y Sgr', 102949: 'T Vul', 88567: 'W Sgr', 95820: 'U Aql', 59551: 'S Mus', 93124: 'FF Aql', 13367: 'SU Cas', 11767: 'alf UMi', 95497: 'RR Lyr', 14576: 'bet Per' };
export const TYPE_NAME = { DCEP: 'Classical Cepheid', DCEPS: 'Classical Cepheid (first overtone)', RRAB: 'RR Lyrae star', 'EA/SD': 'Eclipsing binary (Algol type)' };
export const VARIABLES = G.map(([hip, name, type, max, min, epoch, P, mm]) => ({ hip, name, type, max, min, epoch, P, rise: mm / 100, ecl: /^E/.test(type) ? mm / 100 : 0 }));
export const VAR_BY_HIP = new Map(VARIABLES.map((v) => [v.hip, v]));
// Polaris: its swing has shrunk from the catalog's 0.27 mag to about 0.03-0.1 since the 1960s and grown again; the catalog range is
// not used for it (the star would flicker by more than it does today). It stays in the list so that its panel can say so.
VAR_BY_HIP.get(11767).quiet = true;

/** Where in its cycle (0 = maximum light) a pulsating star is at Julian Date jd. */
export const phaseAt = (v, jd) => { const f = (jd - v.epoch) / v.P; return f - Math.floor(f); };
/** 0 at maximum light, 1 at minimum: a smooth fall over (1 − rise) of the cycle, then the rise back. A shape of our own between the
 *  catalog's numbers (a real Cepheid's fall has a bump in it, an RR Lyrae's rise is steeper still). Its average over a cycle is 1/2. */
export function shape(ph, rise) {
  const fall = 1 - rise;
  return ph < fall ? (1 - Math.cos(Math.PI * ph / fall)) / 2 : (1 + Math.cos(Math.PI * (ph - fall) / rise)) / 2;
}
/** Model V magnitude of a catalog variable at jd (this student's version of it, when a seed is set). */
export function varMag(v, jd) {
  if (v.quiet) return (v.max + v.min) / 2;
  const j = jitterOf(v.hip, 'var'), P = v.P * j.P, f = (jd - v.epoch) / P + j.dph, ph = f - Math.floor(f);
  if (v.ecl) { const e = recentEpoch(v), g = (jd - e) / eclP(v, j) + j.dph * ECL_PH; return eclipseMag(v, j, g - Math.floor(g)); }
  const mid = (v.max + v.min) / 2 + j.dm, half = (v.min - v.max) / 2 * j.amp;
  return mid - half + 2 * half * shape(ph, v.rise);
}
const SECONDARY = 0.06;      // Algol's secondary eclipse in V (mag)
// A student's period shift (1 part in 10^4) counted from a 1983 epoch would move today's eclipses by more than a day; it is applied
// from a recent minimum instead (the catalog's ephemeris carried to 2026), so that each student's eclipses move by hours, not days.
const ECL_PH = 0.25;      // an eclipse's timing is shifted a quarter as much as a pulsation's (σ about 30 min for Algol): a lab can start just before it
const eclP = (v, j) => v.P * (1 + (j.P - 1) * 0.1);      // and its period a tenth as much (1 part in 10^5): an eclipsing binary's period is known very well
const recentEpoch = (v) => v.epoch + Math.round((2461000 - v.epoch) / v.P) * v.P;
/** An eclipsing binary (v.ecl = eclipse length as a share of the period; phase 0 = primary minimum): steady light, and two eclipses of
 *  that length, the primary of the catalog's depth (times this student's depth factor), the secondary half a period later. The light
 *  lost goes as 1 − x² across an eclipse (x from −1 to 1): a rounded V, as a partial eclipse looks. */
function eclipseMag(v, j, ph) {
  const lost = (dph, depthMag) => { const x = dph / (v.ecl / 2); return Math.abs(x) >= 1 ? 0 : (1 - Math.pow(10, -0.4 * depthMag)) * (1 - x * x); };
  const d1 = ph > 0.5 ? ph - 1 : ph, d2 = ph - 0.5;
  const L = Math.min(0.97, lost(d1, (v.min - v.max)) * j.amp + lost(d2, SECONDARY));
  return v.max + j.dm - 2.5 * Math.log10(1 - L);
}

// ---- objects the star catalog does not have ---------------------------------------------------------------------------------
const hms = (h, m, s) => (h + m / 60 + s / 3600) * 15, dms = (sg, d, m, s) => sg * (d + m / 60 + s / 3600);
// monotone piecewise-linear table [days after peak, magnitudes below peak] (linear is enough: the steps are a few days apart)
const table = (T, x) => { if (x <= T[0][0]) return T[0][1]; for (let k = 1; k < T.length; k++) if (x <= T[k][0]) { const [a, p] = T[k - 1], [b, q] = T[k]; return p + (q - p) * (x - a) / (b - a); } return null; };
// a typical Type Ia in V (fall of about 0.6 mag in the 15 days after peak, a shoulder near 30 days, the steady radioactive tail from
// about 60 days): magnitudes below peak
const IA = [[0, 0], [5, 0.1], [10, 0.33], [15, 0.62], [20, 0.95], [25, 1.3], [30, 1.62], [40, 2.15], [50, 2.45], [60, 2.65]];
// a fast-declining Type II (II-P/II-L): a slow slide down a short plateau, the drop when the hydrogen envelope has recombined, then the tail
const IIP = [[0, 0], [10, 0.22], [30, 0.55], [50, 0.8], [65, 1.0], [75, 1.25], [85, 2.6], [95, 3.4], [110, 3.6]];
/** Brightness on the rise: fraction of the peak flux at x = time since explosion / time to peak. Grows as t² at first (the expanding
 *  fireball), and levels off smoothly at the peak. (SN 2011fe half a day after it exploded: model 16.8, found at 17.3 in g.) */
const riseFlux = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export const TRANSIENTS = [
  { id: 'M31-V1', name: 'M31 V1', aka: 'Hubble’s variable in the Andromeda Galaxy', kind: 'cepheid', host: 'the Andromeda Galaxy (M31)',
    ra: hms(0, 41, 27.30), dec: dms(1, 41, 10, 10.4), P: 31.4, epoch: 2455430.5, mean: 19.4, amp: 0.8, rise: 0.3,
    src: 'Position, period and a date of maximum: Templeton et al. 2011 (AAVSO). Mean V about 19.4 as quoted there; the amplitude and shape are a model.' },
  { id: 'SN2011fe', name: 'SN 2011fe', kind: 'sn', type: 'Ia', host: 'the Pinwheel Galaxy (M101)', ra: hms(14, 3, 5.73), dec: dms(1, 54, 16, 25.2),
    t0: 2455796.687, tPeak: 2455817.0, peak: 9.99, curve: IA, tail: 0.0247,
    src: 'Explosion JD 2455796.687 (Nugent et al. 2011); V maximum 9.99 on JD 2455817.0 and the late decline of 0.0247 mag/day: Richmond & Smith 2012.' },
  { id: 'SN2014J', name: 'SN 2014J', kind: 'sn', type: 'Ia', host: 'the Cigar Galaxy (M82)', ra: hms(9, 55, 42.14), dec: dms(1, 69, 40, 26.0),
    t0: 2456672.22, tPeak: 2456692.2, peak: 10.44, curve: IA, tail: 0.0247,
    src: 'Explosion 2014 January 14.72 (Zheng et al. 2014); V maximum 10.44 on MJD 56691.7 (arXiv:1407.0452; others give 10.6). About 1.9 mag of it is lost to dust in M82.' },
  { id: 'SN2023ixf', name: 'SN 2023ixf', kind: 'sn', type: 'II', host: 'the Pinwheel Galaxy (M101)', ra: hms(14, 3, 38.56), dec: dms(1, 54, 18, 41.9),
    t0: 2460083.288, tPeak: 2460089.0, peak: 11.11, curve: IIP, tail: 0.0098,
    src: 'First light MJD 60082.788 and V peak 11.11 on MJD 60088.5: Zheng et al. 2025, who find a plateau shorter than about 70 days. After the peak the curve is a typical fast-declining Type II, not the measured one.' },
  { id: 'SN1987A', name: 'SN 1987A', kind: 'sn', type: 'II (peculiar)', host: 'the Large Magellanic Cloud', ra: hms(5, 35, 28.03), dec: dms(-1, 69, 16, 11.8),
    t0: 2446849.816, table87: [[0.5, 6.0], [1, 4.8], [2, 4.5], [5, 4.5], [10, 4.4], [20, 4.1], [40, 3.6], [60, 3.2], [86, 2.9], [100, 3.1], [115, 3.7], [125, 4.4], [140, 4.9], [160, 5.1]], tail: 0.0098,
    src: 'Core collapse at 07:35 UT on 1987 February 23 (the neutrinos). The curve is a smoothed outline of the published V light curve (rise to 2.9 near day 86), not the measurements.' },
];
export const TRANSIENT = Object.fromEntries(TRANSIENTS.map((o) => [o.id, o]));
const FAINT = 24;      // fainter than this, nothing is drawn or measured

/** Model V magnitude of one of TRANSIENTS at jd, or null when there is nothing to see (before the explosion, or long after). */
export function transientMag(o, jd) {
  if (o.kind === 'cepheid') {
    const j = jitterOf(o.id, 'cepheid'), f = (jd - o.epoch) / (o.P * j.P) + j.dph, amp = o.amp * j.amp;
    return o.mean + j.dm - amp / 2 + amp * shape(f - Math.floor(f), o.rise);
  }
  const jj = jitterOf(o.id, 'sn');
  jd -= jj.dt;                                                                      // this student's supernova peaks a little earlier or later
  const t = jd - o.t0;
  if (t <= 0) return null;
  let m;
  if (o.table87) {
    const last = o.table87[o.table87.length - 1];
    m = t <= last[0] ? table(o.table87, t) : last[1] + o.tail * (t - last[0]);
    if (t < o.table87[0][0]) m = 6.0 + 5 * Math.log10(o.table87[0][0] / t);
  } else if (jd < o.tPeak) {
    const f = riseFlux(t / (o.tPeak - o.t0));
    m = o.peak - 2.5 * Math.log10(f);
  } else {
    const x = jd - o.tPeak, T = o.curve, last = T[T.length - 1];
    m = o.peak + (x <= last[0] ? table(T, x) : last[1] + o.tail * (x - last[0]));
  }
  m += jj.dm;
  return m < FAINT ? m : null;
}

const vecs = Object.fromEntries(TRANSIENTS.map((o) => [o.id, sph(o.ra, o.dec)]));
/** Apparent J2000 direction of a transient (aberration included). */
export function transientEqj(id, frame) { const v = vecs[id], b = frame.beta; return v ? unit([v[0] + b[0], v[1] + b[1], v[2] + b[2]]) : null; }
/** Model V magnitude at an instant (UTC ms), or null. */
export const transientMagNow = (id, timeMs) => (TRANSIENT[id] ? transientMag(TRANSIENT[id], jdOf(timeMs)) : null);

// ---- the instructor's view (labs.js, with instructor=1): this seed's true values ----------------------------------------------
/** A catalog variable as this student's sky has it: period, mean magnitude, range. */
export function varTruth(hip) {
  const v = VAR_BY_HIP.get(hip), j = jitterOf(hip, 'var'), mid = (v.max + v.min) / 2 + j.dm, half = (v.min - v.max) / 2 * j.amp;
  if (v.ecl) return { name: v.name, P: eclP(v, j), max: v.max + j.dm, min: eclipseMag(v, j, 0), dur: v.ecl * eclP(v, j), epoch: recentEpoch(v) - j.dph * ECL_PH * eclP(v, j) };
  return { name: v.name, P: v.P * j.P, mean: mid, max: mid - half, min: mid + half };
}
/** M31 V1 or a supernova as this student's sky has it: {P, mean} or {peak, tPeak}. */
export function transientTruth(id) {
  const o = TRANSIENT[id];
  if (o.kind === 'cepheid') { const j = jitterOf(id, 'cepheid'); return { name: o.name, P: o.P * j.P, mean: o.mean + j.dm }; }
  const j = jitterOf(id, 'sn'); return { name: o.name, peak: o.peak + j.dm, tPeak: o.tPeak + j.dt };
}
