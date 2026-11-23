// astro.js: small maths + formatting helpers shared by every module.
// The ephemeris itself is astronomy-engine (vendor/), reached through `A`.
//
// Frames used in the app (all right-handed unit vectors as [x, y, z]):
//   EQJ  equatorial J2000            x -> RA 0h, z -> north celestial pole
//   EQD  equatorial of date          same, true equator and equinox of date
//   HOR  horizontal                  x -> north, y -> WEST, z -> zenith  (astronomy-engine's convention)
// Azimuth is measured from north through east, so az = atan2(-y, x) in HOR.

export const A = globalThis.Astronomy;
export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
export const AU_KM = 149597870.7;
export const C_AU_PER_DAY = 173.1446326846693;
export const LY_PER_PC = 3.2615637769;

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const mod = (a, n) => ((a % n) + n) % n;
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// ---- vectors -------------------------------------------------------------
export function sph(lonDeg, latDeg) {
  const l = lonDeg * DEG, b = latDeg * DEG, c = Math.cos(b);
  return [c * Math.cos(l), c * Math.sin(l), Math.sin(b)];
}
export function toSph(v) {
  const r = Math.hypot(v[0], v[1], v[2]);
  return { lon: mod(Math.atan2(v[1], v[0]) * RAD, 360), lat: Math.asin(clamp(v[2] / r, -1, 1)) * RAD, r };
}
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export function unit(a) { const r = len(a) || 1; return [a[0] / r, a[1] / r, a[2] / r]; }
/** Angle between two vectors, degrees (accurate for small angles too). */
export function angleBetween(a, b) {
  const c = cross(a, b);
  return Math.atan2(len(c), dot(a, b)) * RAD;
}

// ---- 3x3 matrices, flat row-major [m00, m01, m02, m10, ...] -----------------
export function mulMV(m, v) {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2],
          m[3] * v[0] + m[4] * v[1] + m[5] * v[2],
          m[6] * v[0] + m[7] * v[1] + m[8] * v[2]];
}
export function mulMM(a, b) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++)
    o[3 * i + j] = a[3 * i] * b[j] + a[3 * i + 1] * b[3 + j] + a[3 * i + 2] * b[6 + j];
  return o;
}
export const transpose = (m) => [m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]];
export const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
/** astronomy-engine RotationMatrix (rot[col][row]) -> flat row-major. */
export function fromRot(r) {
  const m = r.rot;
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}
export const vecOf = (v) => [v.x, v.y, v.z];

// ---- horizontal helpers ------------------------------------------------------
/** HOR unit vector -> {az, alt} in degrees (az from north through east). */
export function horToAzAlt(h) {
  return { az: mod(Math.atan2(-h[1], h[0]) * RAD, 360), alt: Math.asin(clamp(h[2], -1, 1)) * RAD };
}
export function azAltToHor(az, alt) {
  const a = az * DEG, b = alt * DEG, c = Math.cos(b);
  return [c * Math.cos(a), -c * Math.sin(a), Math.sin(b)];
}

/** Atmospheric refraction in degrees for a TRUE altitude in degrees.
 *  Same formula as astronomy-engine's Refraction('normal', alt) (Saemundsson/Meeus,
 *  tapered to zero toward the nadir so nothing jumps at the horizon). */
export function refractionDeg(alt) {
  let hd = alt < -1 ? -1 : alt;
  let r = (1.02 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG)) / 60;
  if (alt < -1) r *= (alt + 90) / 89;
  return r;
}
/** Lift a true HOR unit vector to its apparent (refracted) direction. */
export function refractHor(h) {
  const alt = Math.asin(clamp(h[2], -1, 1)) * RAD;
  const a2 = (alt + refractionDeg(alt)) * DEG;
  const c = Math.hypot(h[0], h[1]);
  if (c < 1e-9) return h;
  const k = Math.cos(a2) / c;
  return [h[0] * k, h[1] * k, Math.sin(a2)];
}
/** Inverse of refractHor: apparent HOR direction -> true direction. */
export function unrefractHor(h) {
  const app = Math.asin(clamp(h[2], -1, 1)) * RAD;
  let alt = app - refractionDeg(app);
  for (let i = 0; i < 3; i++) alt -= (alt + refractionDeg(alt)) - app;
  const c = Math.hypot(h[0], h[1]);
  if (c < 1e-9) return h;
  const k = Math.cos(alt * DEG) / c;
  return [h[0] * k, h[1] * k, Math.sin(alt * DEG)];
}
/** Relative air mass (Kasten & Young 1989) for an apparent altitude in degrees. */
export function airmass(alt) {
  if (alt < -0.5) alt = -0.5;
  return 1 / (Math.sin(alt * DEG) + 0.50572 * Math.pow(alt + 6.07995, -1.6364));
}

// ---- formatting ------------------------------------------------------------
const pad = (n, w = 2) => String(n).padStart(w, '0');
/** Right ascension in degrees -> "06h 45m 08.9s". */
export function fmtRA(deg, dp = 1) {
  const f = Math.pow(10, dp);
  let t = Math.round(mod(deg, 360) / 15 * 3600 * f) / f;
  if (t >= 86400) t -= 86400;
  const h = Math.floor(t / 3600), m = Math.floor((t - h * 3600) / 60), s = t - h * 3600 - m * 60;
  return `${pad(h)}h ${pad(m)}m ${s.toFixed(dp).padStart(dp ? dp + 3 : 2, '0')}s`;
}
/** Angle in degrees -> "−16° 42′ 58″" (always signed when `sign` is true). */
export function fmtDMS(deg, { sign = true, dp = 0 } = {}) {
  const f = Math.pow(10, dp);
  const neg = deg < 0;
  const t = Math.round(Math.abs(deg) * 3600 * f) / f;
  const d = Math.floor(t / 3600), m = Math.floor((t - d * 3600) / 60), s = t - d * 3600 - m * 60;
  const sg = neg ? '−' : (sign ? '+' : '');
  return `${sg}${d}° ${pad(m)}′ ${s.toFixed(dp).padStart(dp ? dp + 3 : 2, '0')}″`;
}
/** Hour angle in hours (-12..12) -> "+02h 13m". */
export function fmtHA(hours) {
  const neg = hours < 0; const t = Math.round(Math.abs(hours) * 3600);
  const h = Math.floor(t / 3600), m = Math.floor((t - h * 3600) / 60), s = t - h * 3600 - m * 60;
  return `${neg ? '−' : '+'}${pad(h)}h ${pad(m)}m ${pad(s)}s`;
}
/** An angular size or separation with a sensible unit. */
export function fmtAngle(deg) {
  const a = Math.abs(deg);
  if (a >= 1) return a.toFixed(2) + '°';
  if (a >= 1 / 60) return (a * 60).toFixed(1) + '′';
  return (a * 3600).toFixed(a * 3600 < 10 ? 2 : 1) + '″';
}
export function fmtFov(deg) {
  if (deg >= 10) return deg.toFixed(0) + '°';
  if (deg >= 1) return deg.toFixed(1) + '°';
  if (deg >= 1 / 60) return (deg * 60).toFixed(deg * 60 < 10 ? 1 : 0) + '′';
  return (deg * 3600).toFixed(0) + '″';
}
export function fmtLat(lat) { return Math.abs(lat).toFixed(2) + '° ' + (lat >= 0 ? 'N' : 'S'); }
export function fmtLon(lon) { return Math.abs(lon).toFixed(2) + '° ' + (lon >= 0 ? 'E' : 'W'); }
/** A magnitude with a real minus sign and no "-0.0". */
export function fmtMag(m, dp = 2) {
  if (m == null || !isFinite(m)) return '';
  const t = m.toFixed(dp);
  return +t === 0 ? (0).toFixed(dp) : t.replace('-', '\u2212');
}
