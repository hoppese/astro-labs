// point/math.js: attitude maths for pointing the phone at the sky. Pure, no DOM; tested in tools/check-point.mjs.
// Frames:  device  x right, y to the top, z out of the screen (W3C DeviceOrientation; does NOT turn with the screen)
//          ENU     x east, y north, z up (the W3C Earth frame)
//          HOR     x north, y west, z up (the app's)
// A quaternion [w, x, y, z] takes device vectors to ENU. "Azimuth offset" A: degrees to ADD to an azimuth (so a turn of -A about up).

export const DEG = Math.PI / 180, RAD = 180 / Math.PI;
export const wrap = (a) => ((a + 180) % 360 + 360) % 360 - 180;
const clamp1 = (v) => (v > 1 ? 1 : v < -1 ? -1 : v);

export const qMul = (a, b) => [a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3], a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
  a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1], a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]];
export const qConj = (q) => [q[0], -q[1], -q[2], -q[3]];
export const qNorm = (q) => { const n = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / n, q[1] / n, q[2] / n, q[3] / n]; };
export const qAxis = (ax, deg) => { const h = deg * DEG / 2, s = Math.sin(h), n = Math.hypot(ax[0], ax[1], ax[2]) || 1; return [Math.cos(h), ax[0] / n * s, ax[1] / n * s, ax[2] / n * s]; };
export function qRot(q, v) {
  const [w, x, y, z] = q, tx = 2 * (y * v[2] - z * v[1]), ty = 2 * (z * v[0] - x * v[2]), tz = 2 * (x * v[1] - y * v[0]);
  return [v[0] + w * tx + y * tz - z * ty, v[1] + w * ty + z * tx - x * tz, v[2] + w * tz + x * ty - y * tx];
}
/** The turn from a to b as a rotation vector (degrees), in the frame the quaternions lead to. */
export function qDelta(a, b) {
  let d = qMul(b, qConj(a)); if (d[0] < 0) d = [-d[0], -d[1], -d[2], -d[3]];
  const s = Math.hypot(d[1], d[2], d[3]), f = s < 1e-12 ? 2 * RAD : 2 * Math.atan2(s, d[0]) * RAD / s;
  return [d[1] * f, d[2] * f, d[3] * f];
}
export const qAngle = (a, b) => { const v = qDelta(a, b); return Math.hypot(v[0], v[1], v[2]); };
export function qSlerp(a, b, t) {
  const v = qDelta(a, b), n = Math.hypot(v[0], v[1], v[2]);
  return n < 1e-9 ? b : qNorm(qMul(qAxis(v, n * t), a));
}
/** Mean of nearby quaternions (signs made to agree). */
export function qMean(list) {
  const o = [0, 0, 0, 0], r = list[0];
  for (const q of list) { const s = q[0] * r[0] + q[1] * r[1] + q[2] * r[2] + q[3] * r[3] < 0 ? -1 : 1; for (let k = 0; k < 4; k++) o[k] += s * q[k]; }
  return qNorm(o);
}

/** W3C angles (degrees; intrinsic Z-X'-Y'') -> quaternion device -> ENU. */
export const fromAngles = (alpha, beta, gamma) => qMul(qMul(qAxis([0, 0, 1], alpha), qAxis([1, 0, 0], beta)), qAxis([0, 1, 0], gamma));
/** The inverse, in the W3C ranges (alpha 0..360, beta -180..180, gamma -90..90). For the simulator and the tests. */
export function toAngles(q) {
  const x = qRot(q, [1, 0, 0]), y = qRot(q, [0, 1, 0]), z = qRot(q, [0, 0, 1]);      // columns of R
  let a, b, g;
  if (Math.hypot(x[2], z[2]) < 1e-7) { a = Math.atan2(x[1], x[0]); b = Math.sign(y[2]) * Math.PI / 2; g = 0; }      // upright: alpha and gamma are one and the same
  else if (z[2] >= 0) { a = Math.atan2(-y[0], y[1]); b = Math.asin(clamp1(y[2])); g = Math.atan2(-x[2], z[2]); }
  else { a = Math.atan2(y[0], -y[1]); b = -Math.asin(clamp1(y[2])); b += b >= 0 ? -Math.PI : Math.PI; g = Math.atan2(x[2], -z[2]); }
  return { alpha: (a * RAD + 360) % 360, beta: b * RAD, gamma: g * RAD };
}

export const azOf = (v) => (Math.atan2(v[0], v[1]) * RAD + 360) % 360;      // of an ENU vector
export const altOf = (v) => Math.atan2(v[2], Math.hypot(v[0], v[1])) * RAD;
export const enuToHor = (v) => [v[1], -v[0], v[2]];
export const horToEnu = (h) => [-h[1], h[0], h[2]];
/** Turn the ENU frame so that azimuths grow by `off` degrees. */
export const yawed = (q, off) => qMul(qAxis([0, 0, 1], -off), q);

// ---- the phone's axes -----------------------------------------------------------
export const BACK = [0, 0, -1], TOP = [0, 1, 0];      // out of the back camera; along the long edge
/** Directions on the screen, in device axes, for screen.orientation.angle (0, 90, 180, 270). At 90 the phone has been turned counterclockwise: its right edge is up. */
export function screenAxes(angle) {
  const a = Math.round(angle / 90) * 90 * DEG, s = Math.round(Math.sin(a)), c = Math.round(Math.cos(a));
  return { right: [c, -s, 0], up: [s, c, 0] };
}
/** Attitude -> the app's view matrix (HOR -> view; rows right, up, forward). */
export function viewMatrix(q, angle) {
  const ax = screenAxes(angle), r = enuToHor(qRot(q, ax.right)), u = enuToHor(qRot(q, ax.up)), f = enuToHor(qRot(q, BACK));
  return [...r, ...u, ...f];
}

// ---- compass ---------------------------------------------------------------------
/** The azimuth offset implied by a compass heading of the phone's TOP edge (iOS; magnetic + declination = `trueHeading`), or null where a heading of the
 *  top edge is not to be trusted. CLHeading is the heading of the top of the phone (Apple, headingOrientation: portrait by default); past the vertical
 *  (camera at the sky) the top edge leans backward and its azimuth turns round by 180 degrees, and nobody says what the phone does there. So:
 *  only with the screen facing up, and the top edge either well away from the vertical or in the same azimuth as the back (portrait, no roll). */
export function headingOffset(q, trueHeading) {
  const top = qRot(q, TOP), face = -qRot(q, BACK)[2], e = Math.abs(altOf(top));
  if (face < 0.25 || e > 72) return null;
  if (e > 45 && Math.abs(wrap(azOf(qRot(q, BACK)) - azOf(top))) > 12) return null;
  return wrap(trueHeading - azOf(top));
}
/** The azimuth offset between an absolute attitude and a relative one (Android): the part of the difference that is a turn about up. Good in any position. */
export function absoluteOffset(qAbs, qRel) { const d = qMul(qAbs, qConj(qRel)); return wrap(-2 * Math.atan2(d[3], d[0]) * RAD); }

// ---- calibration ------------------------------------------------------------------
/** One sighting: at attitude q the phone axis `axis` pointed at ENU direction `target`. -> {yaw: azimuth offset, pitch, about: device axis of the pitch correction}. */
export function fix(q, axis, target) {
  const m = qRot(q, axis), e = [m[1], -m[0], 0], about = qRot(qConj(q), e);      // e = m x up: turning m about it raises it
  return { yaw: wrap(azOf(target) - azOf(m)), pitch: altOf(target) - altOf(m), about };
}
/** Attitude with a fix applied. The tilt correction belongs to the phone, so it is a constant turn of the DEVICE frame: nothing jumps at the zenith. */
export const corrected = (q, yaw, pitch, about) => yawed(pitch ? qMul(q, qAxis(about, pitch)) : q, yaw);

// ---- smoothing: one-euro filter on the attitude --------------------------------------
/** The faster the phone turns the less it is smoothed. cutoff = min + beta * speed (Hz, deg/s); speed itself is a low-passed rate VECTOR, so noise, whose direction is random, averages away. */
export class OneEuro {
  constructor({ min = 0.6, beta = 0.22, dcut = 1.2 } = {}) { Object.assign(this, { min, beta, dcut }); this.reset(); }
  reset() { this.q = null; this.raw = null; this.w = [0, 0, 0]; this.t = 0; }
  push(q, t) {
    if (!this.q) { this.q = q; this.raw = q; this.t = t; return q; }
    const dt = Math.max(0.001, Math.min(0.2, (t - this.t) / 1000)); this.t = t;
    const v = qDelta(this.raw, q), ad = 1 - Math.exp(-2 * Math.PI * this.dcut * dt); this.raw = q;
    for (let k = 0; k < 3; k++) this.w[k] += ad * (v[k] / dt - this.w[k]);
    this.speed = Math.hypot(...this.w);
    const a = 1 - Math.exp(-2 * Math.PI * (this.min + this.beta * Math.max(0, this.speed - 0.8)) * dt);
    this.q = qSlerp(this.q, q, a);
    return this.q;
  }
}
