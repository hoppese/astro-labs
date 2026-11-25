// point/wmm.js: the Earth's magnetic field from the World Magnetic Model 2025 (degree 12), for the declination: true azimuth = compass reading + declination.
// Pure. Follows the WMM2025 technical report: geodetic -> geocentric, Schmidt semi-normalized harmonics, back to geodetic. Checked against NOAA's test values (check-point.mjs).

import { WMM, EPOCH, VALID_TO } from './wmm-data.js';

const DEG = Math.PI / 180, N = 12, A = 6378.137, F = 1 / 298.257223563, E2 = F * (2 - F), RE = 6371.2;
const K = (n, m) => n * (n + 1) / 2 + m;

/** {D, I (degrees, D east of north), H, X, Y, Z, F (nT)} at a place (geodetic degrees, height km above the ellipsoid) and decimal year. */
export function field(lat, lon, heightKm, year) {
  const la = Math.max(-89.9999, Math.min(89.9999, lat)), phi = la * DEG, lam = lon * DEG, dt = year - EPOCH;
  const s = Math.sin(phi), c = Math.cos(phi), Rc = A / Math.sqrt(1 - E2 * s * s);
  const p = (Rc + heightKm) * c, z = (Rc * (1 - E2) + heightKm) * s, r = Math.hypot(p, z), ct = z / r, st = p / r;      // ct = sin(geocentric latitude)
  // Schmidt semi-normalized associated Legendre functions of ct, and their derivatives with respect to colatitude
  const P = new Float64Array(K(N, N) + 1), dP = new Float64Array(K(N, N) + 1);
  P[0] = 1;
  for (let n = 1; n <= N; n++) for (let m = 0; m <= n; m++) {
    const k = K(n, m);
    if (n === m) {
      const f = n === 1 ? 1 : Math.sqrt(1 - 1 / (2 * n)), j = K(n - 1, n - 1);
      P[k] = f * st * P[j]; dP[k] = f * (st * dP[j] + ct * P[j]);
    } else {
      const a = (2 * n - 1) / Math.sqrt(n * n - m * m), b = n - 1 > m ? Math.sqrt(((n - 1) * (n - 1) - m * m) / (n * n - m * m)) : 0, j = K(n - 1, m), i = n - 1 > m ? K(n - 2, m) : 0;
      P[k] = a * ct * P[j] - b * (b ? P[i] : 0); dP[k] = a * (ct * dP[j] - st * P[j]) - b * (b ? dP[i] : 0);
    }
  }
  let X = 0, Y = 0, Z = 0;      // geocentric north, east, down
  for (const [n, m, g0, h0, dg, dh] of WMM) {
    const g = g0 + dt * dg, h = h0 + dt * dh, q = Math.pow(RE / r, n + 2), k = K(n, m), cm = Math.cos(m * lam), sm = Math.sin(m * lam);
    X += q * (g * cm + h * sm) * dP[k];
    Y += q * m * (g * sm - h * cm) * P[k] / st;
    Z -= q * (n + 1) * (g * cm + h * sm) * P[k];
  }
  const psi = Math.atan2(z, p) - phi, cp = Math.cos(psi), sp = Math.sin(psi);
  const x = X * cp - Z * sp, zz = X * sp + Z * cp, H = Math.hypot(x, Y);
  return { X: x, Y, Z: zz, H, F: Math.hypot(H, zz), D: Math.atan2(Y, x) / DEG, I: Math.atan2(zz, H) / DEG };
}
export function decimalYear(ms) { const y = new Date(ms).getUTCFullYear(), a = Date.UTC(y, 0, 1), b = Date.UTC(y + 1, 0, 1); return y + (ms - a) / (b - a); }
/** {deg, H, weak, expired}: what is added to a compass reading. weak: NOAA's caution and blackout zones (horizontal field under 6000 / 2000 nT). */
export function declination(lat, lon, ms, heightKm = 0) {
  const year = decimalYear(ms), f = field(lat, lon, heightKm, year);
  return { deg: f.D, H: f.H, weak: f.H < 2000 ? 'blackout' : f.H < 6000 ? 'caution' : '', expired: year >= VALID_TO || year < EPOCH };
}
