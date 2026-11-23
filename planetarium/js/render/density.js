// render/density.js: how faint the stars may go so that the SCREEN never fills up with them.
// Rule (Seth's): at any zoom there should be about the same number of stars per square centimetre of
// screen. So the limit is the magnitude m at which
//     N(<m) per square degree  x  square degrees of sky per cm^2 of screen  =  target stars per cm^2
// N(<m) comes from the catalogue itself (all-sky mean; counts rise about x3 per magnitude), and the
// screen scale from the projection. sky.js then caps this by what the sky physically allows.
// Everything is in CSS pixels (38 px to the centimetre), so a retina screen gives the same picture.

import { cam } from '../camera.js';
import { stars } from '../catalog.js';

export const PX_PER_CM = 37.8;
const SKY_SQDEG = 41252.96;
const STEP = 0.25, M0 = -1.5;            // table: cumulative counts at M0, M0 + STEP, ...
let table = null;                         // log10 N(<m) per square degree

/** Cumulative star counts per square degree, from the loaded bright tier (exact) and the tier totals (to mag 9.5). */
function build() {
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
  if (!table) table = build();
  if (!table) return -9;
  if (m <= table[0][0]) return table[0][1];
  for (let k = 1; k < table.length; k++) if (m <= table[k][0]) { const a = table[k - 1], b = table[k]; return a[1] + (b[1] - a[1]) * (m - a[0]) / (b[0] - a[0]); }
  return table[table.length - 1][1];
}
/** Magnitude at which the all-sky mean density reaches `perSqDeg`. */
export function magForDensity(perSqDeg) {
  if (!table) table = build();
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

/** The limiting magnitude that puts `perCm2` stars on each square centimetre of screen at this zoom. */
export function densityLimit(perCm2) {
  return magForDensity(perCm2 / sqDegPerCm2());
}
