// render/density.js: how faint the stars may go so that the SCREEN never fills up with them.
// Rule (Seth's): at any zoom there should be about the same number of stars per square centimetre of
// screen. So the limit is the magnitude m at which
//     N(<m) per square degree  x  square degrees of sky per cm^2 of screen  =  target stars per cm^2
// N(<m) comes from the catalogue itself (all-sky mean; counts rise about x3 per magnitude), and the
// screen scale from the projection. sky.js then caps this by what the sky physically allows.
// Everything is in CSS pixels (38 px to the centimetre), so a retina screen gives the same picture.

import { cam, unproject } from '../camera.js';
import { getFrame } from '../skyframe.js';
import { stars } from '../catalog.js';
import { deep } from '../deepstars.js';

export const PX_PER_CM = 37.8;
const SKY_SQDEG = 41252.96;
const STEP = 0.25, M0 = -1.5;            // table: cumulative counts at M0, M0 + STEP, ...
let table = null, tableDeep = false;      // log10 N(<m) per square degree; tableDeep = built from the Tycho-2 manifest

/** Cumulative star counts per square degree, from the loaded bright tier (exact) and the tier totals (to mag 9.5). */
function build() {
  if (deep.ready && deep.counts) {
    // with the faint-star tiles: the manifest holds the all-sky counts of everything that can be drawn (HYG + Tycho-2),
    // used up to the magnitude where the catalogue starts to thin out; past it the slope of real star counts
    const c = deep.counts, pts = [];
    for (let b = 0; b < c.cum.length; b++) { const m = c.m0 + (b + 1) * c.step; if (m > c.peakMag + 1e-9) break; pts.push([m, Math.max(c.cum[b], 0.5)]); }
    const last = pts[pts.length - 1];
    for (let m = last[0] + 1; m <= 20; m++) pts.push([m, last[1] * Math.pow(2.5, m - last[0])]);
    tableDeep = true;
    return pts.map(([m, n]) => [m, Math.log10(n / SKY_SQDEG)]);
  }
  const t0 = stars.tiers[0];
  if (!t0 || !t0.loaded) return null;
  const pts = [];                         // [m, N all sky]
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
/** log10 of stars per square degree brighter than m (all-sky mean). */
export function logCount(m) {
  if (!table || tableDeep !== deep.ready) table = build();
  if (!table) return -9;
  if (m <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) if (m <= table[k][0]) { const a = table[k - 1], b = table[k]; return a[1] + (b[1] - a[1]) * (m - a[0]) / (b[0] - a[0]); }
  return table[table.length - 1][1];
}
/** Magnitude at which the all-sky mean density reaches `perSqDeg`. */
export function magForDensity(perSqDeg) {
  if (!table || tableDeep !== deep.ready) table = build();
  if (!table) return 6;
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

// ---- where in the sky: the Milky Way is several times richer than the galactic poles ------------------
// With the all-sky mean alone, a 5-degree field in Cygnus held 8 times the stars of one in Coma. The
// manifest of the faint-star tiles has the counts in 8 equal-area bands of |sin b| (galactic latitude), so
// the limit is set from a weighted geometric mean of the counts at the latitudes on screen (weight 0.65) and
// the all-sky counts: the Milky Way still looks richer (as it is), but by much less than the true ratio, and the limiting
// magnitude changes smoothly (by up to about a magnitude) as the view moves from the plane to the pole.
const GPOLE = [-0.8676661490, -0.1980763734, 0.4559837762];       // north galactic pole, J2000
const LOCAL_W = 0.65;
const wBand = new Float64Array(8);
function bandWeights() {
  const frame = getFrame(), M = frame.Mhj, nx = 5, ny = 3;
  wBand.fill(0);
  let tot = 0;
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const h = unproject((i + 0.5) / nx * cam.w, (j + 0.5) / ny * cam.h);
    const sb = Math.abs(GPOLE[0] * (M[0] * h[0] + M[1] * h[1] + M[2] * h[2]) + GPOLE[1] * (M[3] * h[0] + M[4] * h[1] + M[5] * h[2]) + GPOLE[2] * (M[6] * h[0] + M[7] * h[1] + M[8] * h[2]));
    // linear interpolation between band centres (|sin b| = 1/16, 3/16, ...)
    const u = Math.min(7, Math.max(0, sb * 8 - 0.5)), k = Math.min(6, Math.floor(u)), f = u - k;
    wBand[k] += 1 - f; wBand[k + 1] += f; tot++;
  }
  for (let k = 0; k < 8; k++) wBand[k] /= tot;
}
/** log10 of stars per square degree brighter than m at the galactic latitudes on screen (null without the manifest). */
function localLogCount(m) {
  const c = deep.counts;
  if (!deep.ready || !c || !c.bands) return null;
  const mm = Math.min(m, c.peakMag);                        // past the catalogue's turnover: the slope of real counts
  const x = (mm - c.m0) / c.step - 1, b0 = Math.max(0, Math.min(c.cum.length - 2, Math.floor(x))), f = Math.max(0, Math.min(1, x - b0));
  let n = 0;
  for (let k = 0; k < 8; k++) if (wBand[k] > 0) { const row = c.bands[k]; n += wBand[k] * Math.max(0.5, row[b0]) * Math.pow(Math.max(0.5, row[b0 + 1]) / Math.max(0.5, row[b0]), f); }
  return Math.log10(n / (SKY_SQDEG / 8)) + (m - mm) * Math.log10(2.5);
}

/** The limiting magnitude that puts `perCm2` stars on each square centimetre of screen at this zoom. */
export function densityLimit(perCm2) {
  const perSqDeg = perCm2 / sqDegPerCm2();
  const mMean = magForDensity(perSqDeg);
  if (!deep.ready || !deep.counts || !deep.counts.bands) return mMean;
  bandWeights();
  // solve  0.65 log N_local(m) + 0.35 log N_mean(m) = log(target)  by bisection (both counts rise with m)
  const y = Math.log10(perSqDeg);
  let lo = mMean - 3, hi = mMean + 3;
  for (let k = 0; k < 18; k++) { const m = (lo + hi) / 2; if (LOCAL_W * localLogCount(m) + (1 - LOCAL_W) * logCount(m) < y) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
