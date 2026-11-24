// deltat.js: the clocks. The app's clock is UTC (UT1 before 1962); the planets move by TT; the Earth turns by UT1.
//   TT - UT1 (Delta T): 720 BC - 1962 the cubic pieces of Morrison, Stephenson, Hohenkerk and Zawilski 2021 (Table S15); 1962 - 2026 observed (IERS C04);
//   earlier the same authors' long-term parabola, -320 + 32.5 ((year - 1825) / 100)^2, joined on; later a smooth curve from today's value and rate to that
//   parabola in 2500: a prediction, uncertain by about 100 s in 2200 and by several minutes in 2500. JPL Horizons instead holds its future clock at TT - 69.18 s.
//   TT - UTC: the leap seconds. They are counted from 1962 to today; from 2027 on the clock simply follows the Sun (UT1), whatever is decided about leap seconds.

import { A } from './astro.js';
import { S15, EOP0, EOP_STEP, EOP, LEAP } from './deltat-data.js';

const MJD_J2000 = 51544.5;
const yearOf = (tt) => 2000 + tt / 365.2425;
const parab = (y) => -320 + 32.5 * ((y - 1825) / 100) ** 2;
const EOP_END = EOP0 + (EOP.length - 1) * EOP_STEP;          // MJD
const Y1 = yearOf(EOP_END - MJD_J2000), V1 = EOP[EOP.length - 1], S1 = (EOP[EOP.length - 1] - EOP[EOP.length - 25]) / (24 * EOP_STEP / 365.2425), Y2 = 2500, V2 = parab(Y2), S2 = 0.65 * (Y2 - 1825) / 100;
function s15(y) {
  let i = S15.findIndex((r) => y < r[1]); if (i < 0) i = S15.length - 1;
  const r = S15[i], t = (y - r[0]) / (r[1] - r[0]);
  return r[2] + t * (r[3] + t * (r[4] + t * r[5]));
}
const D0 = s15(-720) - parab(-720);
/** TT - UT1 in seconds at tt (days from J2000). */
export function deltaT(tt) {
  const m = tt + MJD_J2000;
  if (m >= EOP0 && m <= EOP_END) {
    // four-point interpolation (the curve is smooth: leap seconds are not in it)
    const x = (m - EOP0) / EOP_STEP, i = Math.min(Math.max(1, Math.floor(x)), EOP.length - 3), f = x - i, a = EOP[i - 1], b = EOP[i], c = EOP[i + 1], d = EOP[i + 2];
    return b + 0.5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - d + f * (3 * (b - c) + d - a)));
  }
  const y = yearOf(tt);
  if (m < EOP0) {
    if (y < -720) return parab(y) + D0 * Math.exp((y + 720) / 400);
    const v = s15(y), e = (EOP0 - m) / 1500;                  // the two sources differ by a few hundredths of a second in 1962: eased together
    return e < 1 ? v + (EOP[0] - s15(yearOf(EOP0 - MJD_J2000))) * (1 - e) : v;
  }
  if (y >= Y2) return parab(y);
  const h = Y2 - Y1, t = (y - Y1) / h, t2 = t * t, t3 = t2 * t;
  return V1 * (2 * t3 - 3 * t2 + 1) + S1 * h * (t3 - 2 * t2 + t) + V2 * (3 * t2 - 2 * t3) + S2 * h * (t3 - t2);
}
/** How far UT1 may be from deltaT's value (s), for notes: the published standard errors, rounded up. */
export const LAST_OBSERVED = EOP_END - MJD_J2000;
/** TT - UTC in seconds at the clock time ut (days from J2000). */
export function ttMinusUtc(ut) {
  const m = ut + MJD_J2000;
  if (m < LEAP[0][0] || m < EOP0) return deltaT(ut + deltaT(ut) / 86400);
  if (m > EOP_END) return 32.184 + LEAP[LEAP.length - 1][1] + deltaT(ut + 69 / 86400) - V1;
  for (let i = LEAP.length - 1; i >= 0; i--) if (m >= LEAP[i][0]) return 32.184 + LEAP[i][1] + (LEAP[i].length > 2 ? (m - LEAP[i][2]) * LEAP[i][3] : 0);
  return 0;
}
if (A && A.SetUt1Function) {
  A.SetDeltaTFunction(ttMinusUtc);
  A.SetUt1Function((tt) => tt - deltaT(tt) / 86400);
}
