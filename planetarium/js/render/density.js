// render/density.js: how faint the stars may go so that the SCREEN never fills up with them.
// Rule (Seth's): at any zoom there should be about the same number of stars per square centimetre of
// screen. So the limit is the magnitude m at which
//     N(<m) per square degree  x  square degrees of sky per cm^2 of screen  =  target stars per cm^2
// N(<m) comes from the catalogue itself (all-sky mean; counts rise about x3 per magnitude), and the
// screen scale from the projection. sky.js then caps this by what the sky physically allows.
// Everything is in CSS pixels (38 px to the centimetre), so a retina screen gives the same picture.

import { state, emit } from '../state.js';
import { cam, unproject } from '../camera.js';
import { getFrame } from '../skyframe.js';
import { stars } from '../catalog.js';
import { deep } from '../deepstars.js';
import { vec2pix } from '../healpix.js';

export const PX_PER_CM = 37.8;
const SKY_SQDEG = 41252.96;
const STEP = 0.25, M0 = -1.5;            // table: cumulative counts at M0, M0 + STEP, ...
let table = null, tableKey = '';          // log10 N(<m) per square degree, all-sky mean

/** Cumulative all-sky star counts per square degree. With the faint-star manifest (data/gaia/index.json): the exact
 *  counts of everything that can be drawn, HYG + Gaia DR3, to G = 21.5. Without it: the HYG tiers, to mag 9.5. */
function build() {
  const pts = [];                         // [m, N all sky]
  if (deep.ready && deep.counts) {
    const c = deep.counts, mp = deep.map;
    for (let b = 0; b < c.cum.length; b++) pts.push([c.m0 + (b + 1) * c.step, Math.max(c.cum[b], 0.5)]);
    for (let b = 0; b < mp.n; b++) { const m = mp.m0 + b * mp.step; if (m > pts[pts.length - 1][0] + 1e-9) pts.push([m, mp.allsky[b]]); }
    // past the end of Gaia (G = 21.5) nothing more can be drawn; the curve carries on gently only so that the limit
    // keeps moving with the zoom (sky.js caps it just beyond the last real star)
    const last = pts[pts.length - 1];
    for (let m = last[0] + 1; m <= 30; m++) pts.push([m, last[1] * Math.pow(END_SLOPE, m - last[0])]);
    return pts.map(([m, n]) => [m, Math.log10(n / SKY_SQDEG)]);
  }
  const t0 = stars.tiers[0];
  if (!t0 || !t0.loaded) return null;
  const d = t0.data, NF = stars.NF;
  let i = 0;
  for (let m = M0; m <= t0.magMax + 1e-9; m += STEP) {
    while (i < t0.n && d[i * NF + 2] <= m) i++;
    pts.push([m, Math.max(i, 0.5)]);
  }
  let total = t0.n;
  for (const t of stars.tiers.slice(1)) {
    if (t.magMax > 9.6) break;            // the last tier is the catalogue's incomplete tail
    total += t.n; pts.push([t.magMax, total]);
  }
  // past the catalogue's completeness: keep the slope of real star counts there (about x2.5 per magnitude)
  const last = pts[pts.length - 1];
  for (let m = last[0] + 1; m <= 16; m++) pts.push([m, last[1] * Math.pow(2.5, m - last[0])]);
  return pts.map(([m, n]) => [m, Math.log10(n / SKY_SQDEG)]);
}
const END_SLOPE = 1.6;
function ensure() {
  const key = deep.ready ? 'deep' : 'hyg';
  if (!table || tableKey !== key) { table = build(); tableKey = key; }
  return table;
}
/** log10 of stars per square degree brighter than m (all-sky mean). */
export function logCount(m) {
  if (!ensure()) return -9;
  if (m <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) if (m <= table[k][0]) { const a = table[k - 1], b = table[k]; return a[1] + (b[1] - a[1]) * (m - a[0]) / (b[0] - a[0]); }
  return table[table.length - 1][1];
}
/** Magnitude at which the all-sky mean density reaches `perSqDeg`. */
export function magForDensity(perSqDeg) {
  if (!ensure()) return 6;
  const y = Math.log10(perSqDeg);
  if (y <= table[0][1]) return table[0][0];
  for (let k = 1; k < table.length; k++) if (y <= table[k][1]) { const a = table[k - 1], b = table[k]; return b[1] === a[1] ? b[0] : a[0] + (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]); }
  return table[table.length - 1][0];
}

/** Square degrees of sky shown per square centimetre of screen, averaged over the window (stereographic:
 *  the scale grows toward the edges of a wide view, so the centre value alone would overfill the middle). */
export function sqDegPerCm2() {
  const s = cam.s, nx = 12, ny = 8;
  let omega = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = ((i + 0.5) / nx - 0.5) * cam.w / s, y = ((j + 0.5) / ny - 0.5) * cam.h / s;
    const k = 1 + (x * x + y * y) / 4;
    omega += 1 / (k * k);
  }
  const sr = omega * (cam.w / nx) * (cam.h / ny) / (s * s);                      // steradians on screen
  const cm2 = cam.w * cam.h / (PX_PER_CM * PX_PER_CM);
  return Math.min(sr, 4 * Math.PI) * 3282.806 / cm2;
}

// ---- where in the sky: the Milky Way is many times richer than the galactic poles ---------------------------
// With the all-sky mean alone, a 5-degree field in Cygnus held 8 times the stars of one in Coma, and at G = 19
// the plane holds 50 times the stars of the pole. data/gaia/counts.bin has the real counts, to G = 21.5, in the
// 3,072 cells of a HEALPix order-4 grid (13.4 square degrees each; exact to G = 17, sampled beyond), so the limit
// is set from the counts where the view IS: a weighted geometric mean of the local counts (weight LOCAL_W) and
// the all-sky counts. The Milky Way still looks richer (as it is), but only a little, and the limit moves smoothly
// (by several magnitudes at high zoom) as the view goes from the plane to a pole.
// "Local" = the mean over 19 directions spread over the view, and never over less than a 2.5-degree circle, so
// the limit does not jump when a narrow view crosses from one cell of the map to the next.
const LOCAL_W = 0.9;
const NS = 19, CELL_SQDEG = SKY_SQDEG / 3072;
const cells = new Int32Array(NS), centre = [0, 0, 1];
let haveCells = false;
const RING = [[0, 0]];
for (let k = 0; k < 6; k++) RING.push([0.5, k * Math.PI / 3]);
for (let k = 0; k < 12; k++) RING.push([0.92, (k + 0.5) * Math.PI / 6]);
function sampleCells() {
  const mp = deep.map;
  haveCells = !!(deep.ready && mp && mp.data);
  if (!haveCells) return;
  const M = getFrame().Mhj, h = unproject(cam.w / 2, cam.h / 2);
  // centre of the view in J2000, and two directions across it
  const c0 = M[0] * h[0] + M[1] * h[1] + M[2] * h[2], c1 = M[3] * h[0] + M[4] * h[1] + M[5] * h[2], c2 = M[6] * h[0] + M[7] * h[1] + M[8] * h[2];
  centre[0] = c0; centre[1] = c1; centre[2] = c2;
  let u0, u1, u2;
  if (Math.abs(c2) < 0.9) { u0 = -c1; u1 = c0; u2 = 0; } else { u0 = 0; u1 = -c2; u2 = c1; }
  const un = Math.hypot(u0, u1, u2); u0 /= un; u1 /= un; u2 /= un;
  const v0 = c1 * u2 - c2 * u1, v1 = c2 * u0 - c0 * u2, v2 = c0 * u1 - c1 * u0;
  const viewR = Math.acos(Math.max(-1, Math.min(1, cam.zMin)));
  const rho = Math.min(1.2, Math.max(0.0436, 0.62 * viewR));
  for (let k = 0; k < NS; k++) {
    const th = RING[k][0] * rho, ph = RING[k][1], st = Math.sin(th), ct = Math.cos(th), a = st * Math.cos(ph), b = st * Math.sin(ph);
    cells[k] = vec2pix(mp.order, ct * c0 + a * u0 + b * v0, ct * c1 + a * u1 + b * v1, ct * c2 + a * u2 + b * v2);
  }
}
/** log10 of stars per square degree brighter than m around the view (null without the count map). */
function localLogCount(m) {
  if (!haveCells) return null;
  const mp = deep.map, d = mp.data, last = mp.n - 1;
  const mEnd = mp.m0 + last * mp.step;
  const mm = m < mp.m0 ? mp.m0 : m > mEnd ? mEnd : m;
  const x = (mm - mp.m0) / mp.step, b0 = Math.min(last - 1, Math.floor(x)), f = x - b0;
  let n = 0;
  for (let k = 0; k < NS; k++) {
    const o = cells[k] * mp.n + b0;
    n += Math.max(0.3, Math.pow(10, (d[o] + (d[o + 1] - d[o]) * f) / mp.scale) - 1);
  }
  let y = Math.log10(n / NS / CELL_SQDEG);
  if (m < mp.m0) y += logCount(m) - logCount(mp.m0);            // brighter than the map: the all-sky shape
  else if (m > mEnd) y += (m - mEnd) * Math.log10(END_SLOPE);   // fainter than Gaia: see build()
  return y;
}
/** How many times richer than the all-sky mean the view is at magnitude m (for read-outs and tests). */
export function localExcess(m) { sampleCells(); const l = localLogCount(m); return l === null ? 1 : Math.pow(10, l - logCount(m)); }

/** The limiting magnitude that puts `perCm2` stars on each square centimetre of screen at this zoom. */
export function densityLimit(perCm2) {
  const perSqDeg = perCm2 / sqDegPerCm2();
  const mMean = magForDensity(perSqDeg);
  sampleCells();
  if (!haveCells) return mMean;
  // solve  LOCAL_W log N_local(m) + (1 - LOCAL_W) log N_mean(m) + (this field's measured correction) = log(target)
  // by bisection (both counts rise with m)
  const y = Math.log10(perSqDeg) - fieldAdjNow();
  let lo = mMean - 6, hi = mMean + 8;
  for (let k = 0; k < 22; k++) { const m = (lo + hi) / 2; if (LOCAL_W * localLogCount(m) + (1 - LOCAL_W) * logCount(m) < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---- this very field: correcting the map with what was actually drawn --------------------------------------
// The count map is coarse (13 square degrees a cell), and the sky is not: behind a dark cloud of the Cygnus rift a
// 10-arcminute field held less than half the stars the map promised. So when a zoomed-in frame is a fair sample
// (the view is still, every tile it needs has arrived, the crowding limit is the one in force, the window is all
// sky and well above the horizon, and the catalogue has not run out), the number of stars drawn is compared with
// the number aimed for, and the difference is kept as a correction (log10 of true / mapped density) for the next
// frames. It moves by steps: correct, let the deeper tiles arrive, look again; and it glides (0.5 dex a second) so
// the stars do not jump. Wide views (over 20 degrees) do not use it. It belongs to the field it was measured in:
// zooming out past 1.5 times that field, or panning most of a field away, drops it (to be measured afresh), so a
// correction learnt inside a dark cloud is never carried to a wider view, where it would ask the star service for
// magnitudes the view does not need. A step never takes the limit past G = 20.9, where Gaia ends.
let adj = 0, adjGoal = 0, adjAt = 0;
const at = { fov: 0, c: [0, 0, 1] };
function fieldAdjNow() {
  if (adjGoal !== 0 && (cam.fov > 20 || cam.fov > 1.5 * at.fov ||
    Math.acos(Math.min(1, centre[0] * at.c[0] + centre[1] * at.c[1] + centre[2] * at.c[2])) * 57.29578 > 0.75 * cam.fov)) adjGoal = 0;
  const now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (adj !== adjGoal) {
    const step = 0.5 * Math.min(0.1, Math.max(0.001, (now - adjAt) / 1000));
    adj = Math.abs(adjGoal - adj) <= step ? adjGoal : adj + Math.sign(adjGoal - adj) * step;
    if (adj !== adjGoal) emit('render');
  }
  adjAt = now;
  return adj;
}
/** Called by the renderer after each frame with the number of stars it drew and the sky conditions it used. */
export function fieldFeedback(nDrawn, sky) {
  const st = deep.stats, net = deep.net;
  if (!deep.ready || cam.fov > 20 || adj !== adjGoal || sky.limMag !== sky.crowd || net.complete !== Infinity) return;
  if (st.loading || st.netLoading || net.wanted || !net.settled) return;
  if (sky.crowd + 0.3 > sky.depth || sky.crowd > 20.7) return;                 // the catalogue is running out: nothing to learn
  const target = sky.perCm2 * cam.w * cam.h / (PX_PER_CM * PX_PER_CM);
  if (target < 150 || nDrawn < 15) return;
  // all sky, and high enough that extinction dims nothing (40 degrees) when the atmosphere is on
  const minZ = state.show.atmosphere ? 0.643 : state.show.ground ? 0.02 : -2;
  if (minZ > -1) for (const [fx, fy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (unproject(fx * cam.w, fy * cam.h)[2] < minZ) return;
  let e = Math.log10(nDrawn / target);
  if (Math.abs(e) < 0.05) return;                                              // within 12 %: leave it
  if (e < 0) {
    // going deeper: not past the end of Gaia (slope = dex of counts per magnitude here)
    const c = sky.crowd, slope = Math.max(0.05, LOCAL_W * (localLogCount(c + 0.5) - localLogCount(c - 0.5)) + (1 - LOCAL_W) * (logCount(c + 0.5) - logCount(c - 0.5)));
    e = Math.max(e, -(20.9 - c) * slope);
    if (e > -0.02) return;
  }
  adjGoal = Math.max(-0.9, Math.min(0.6, adj + 0.85 * e));
  at.fov = cam.fov; at.c[0] = centre[0]; at.c[1] = centre[1]; at.c[2] = centre[2];
  emit('render');
}
export const fieldAdjust = () => adj;
