// camera.js: the view. Stereographic projection of the apparent sky, with either an alt-az
// mount (zenith stays up) or an equatorial mount (north celestial pole stays up).
//
// The camera points at (lon, lat) in its MOUNT frame:
//   alt-az mount      mount frame = HOR, so lat = altitude and lon = -azimuth (HOR's y axis is west)
//   equatorial mount  mount frame = EQD (equator of date), so lon = right ascension, lat = declination
// `fov` is the vertical field of view in degrees.

import { DEG, RAD, clamp, mod, mulMM, mulMV, transpose, IDENTITY, toSph } from './astro.js';
import { state, eff } from './state.js';

export const FOV_MIN = 0.00004, FOV_MAX = 180;      // 0.14 arcsec to all-sky

export const cam = {
  lon: -180, lat: 28, fov: 90,
  roll: 0,                    // degrees the picture is turned from the mount's own up; following with an offset and a drag over the mount's pole (trackBall) use it; it eases back to 0 once nothing holds it (nav.js)
  w: 800, h: 600, cx: 400, cy: 300, s: 1,      // (cx, cy): where the view direction is on screen: the middle of the sky left free by the panels (layout.js)
  ox: 0, oy: 0,               // (cx, cy) less the middle of the canvas
  V: IDENTITY.slice(),        // HOR -> view (rows: right, up, forward)
  Vt: IDENTITY.slice(),       // view -> HOR
  M: IDENTITY.slice(),        // mount -> HOR
  Mt: IDENTITY.slice(),       // HOR -> mount
  zMin: -1,                   // view-space z below which nothing can be on screen
  pxPerDeg: 1,                // screen scale at the center of the view
};

export function resize(w, h) { cam.w = w; cam.h = h; cam.cx = w / 2 + cam.ox; cam.cy = h / 2 + cam.oy; }
/** Move the place on screen where the view direction lies (px from the middle of the canvas). */
export function setCentre(ox, oy) { cam.ox = ox; cam.oy = oy; resize(cam.w, cam.h); }

/** Rebuild the matrices for the current pointing, mount and frame. Call before projecting. */
export function update(frame) {
  cam.lat = clamp(cam.lat, -90, 90);
  cam.lon = mod(cam.lon + 180, 360) - 180;
  cam.fov = clamp(cam.fov, FOV_MIN, FOV_MAX);
  const l = cam.lon * DEG, b = cam.lat * DEG, cl = Math.cos(l), sl = Math.sin(l), cb = Math.cos(b), sb = Math.sin(b);
  const f = [cb * cl, cb * sl, sb], r = [sl, -cl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const ca = Math.cos(cam.roll * DEG), sa = Math.sin(cam.roll * DEG);
  const Vm = cam.roll ? [ca * r[0] + sa * u[0], ca * r[1] + sa * u[1], ca * r[2] + sa * u[2], ca * u[0] - sa * r[0], ca * u[1] - sa * r[1], ca * u[2] - sa * r[2], f[0], f[1], f[2]]
    : [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]];     // mount -> view
  cam.M = eff.mount === 'eq' ? frame.Mdh : IDENTITY;
  cam.Mt = transpose(cam.M);
  cam.V = mulMM(Vm, cam.Mt);
  cam.Vt = transpose(cam.V);
  cam.s = (cam.h / 2) / (2 * Math.tan(cam.fov * DEG / 4));
  cam.pxPerDeg = cam.s * DEG;
  const rho = (Math.hypot(Math.max(cam.cx, cam.w - cam.cx), Math.max(cam.cy, cam.h - cam.cy)) + 60) / cam.s;
  cam.zMin = Math.cos(Math.min(2 * Math.atan(rho / 2), 160 * DEG));
}

/** Project an apparent HOR unit vector. Writes [x, y] into `out`; returns false when it is behind the view. */
export function projectHor(h, out) {
  const V = cam.V;
  const z = V[6] * h[0] + V[7] * h[1] + V[8] * h[2];
  if (z < cam.zMin) return false;
  const k = 2 * cam.s / (1 + z);
  out[0] = cam.cx + k * (V[0] * h[0] + V[1] * h[1] + V[2] * h[2]);
  out[1] = cam.cy - k * (V[3] * h[0] + V[4] * h[1] + V[5] * h[2]);
  return true;
}
export const onScreen = (p, margin = 0) => p[0] >= -margin && p[1] >= -margin && p[0] <= cam.w + margin && p[1] <= cam.h + margin;

/** Screen point -> apparent HOR unit vector. */
export function unproject(x, y) {
  const px = (x - cam.cx) / cam.s, py = -(y - cam.cy) / cam.s;
  const r2 = px * px + py * py;
  const z = (4 - r2) / (4 + r2), k = (1 + z) / 2;
  return mulMV(cam.Vt, [px * k, py * k, z]);
}

/** Mount-frame {lon, lat} of the sky point under a screen position. */
export function mountAt(x, y) { return toSph(mulMV(cam.Mt, unproject(x, y))); }
/** Point the camera at an apparent HOR direction. */
export function lookAtHor(h) {
  const m = toSph(mulMV(cam.Mt, h));
  cam.lon = m.lon; cam.lat = m.lat;
}
/** The apparent HOR direction at the center of the view. */
export const centerHor = () => [cam.V[6], cam.V[7], cam.V[8]];

/** Turn the camera so that mount-frame point `g` ({lon, lat}) sits under screen position (x, y).
 *  Solved in closed form, which matters at the mount's pole (the zenith in alt-az, the celestial pole in
 *  equatorial): there a point on the far side of the pole moves the "wrong" way when the camera tilts, and a
 *  step-by-step search either sticks or oscillates. The screen point fixes a direction v in view space; a
 *  camera tilt b puts it at mount latitude asin(vy cos b + vz sin b), which is solved for b; the turn about
 *  the mount's axis then follows. The camera cannot tip over the pole (b stays within +-90). A drag that would
 *  need to (dragging a star across the zenith, say) used to stop at the pole and only swing the sky round it,
 *  which on a phone felt like a wall. Now the view turns freely there instead (trackBall): the grabbed point
 *  stays under the finger and the picture may tilt; the tilt (roll) eases back to level once the finger lifts (nav.js). */
export function bringUnder(g, x, y, frame) {
  const qx = (x - cam.cx) / cam.s, qy = -(y - cam.cy) / cam.s, ca = Math.cos(cam.roll * DEG), sa = Math.sin(cam.roll * DEG);
  const px = cam.roll ? qx * ca - qy * sa : qx, py = cam.roll ? qx * sa + qy * ca : qy;      // on the mount's own axes
  const r2 = px * px + py * py, vz = (4 - r2) / (4 + r2), k = (1 + vz) / 2, vx = px * k, vy = py * k;
  const S = Math.sin(clamp(g.lat, -90, 90) * DEG), Rr = Math.hypot(vy, vz);
  let b = cam.lat * DEG;
  if (Rr > 1e-12) {
    const phi = Math.atan2(vz, vy), d = Math.acos(clamp(S / Rr, -1, 1));
    const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
    const c1 = wrap(phi + d), c2 = wrap(phi - d), H = Math.PI / 2;
    const over = (a) => Math.max(0, Math.abs(a) - H);              // how far past the pole this solution would be
    // prefer a solution the mount can reach; between two, the one nearer the present tilt
    const cost = (a) => over(a) * 1e3 + Math.abs(a - b);
    const best = cost(c1) <= cost(c2) ? c1 : c2;
    // At the pole the mount's longitude is a roll of the picture. A solution that needs the camera to face the
    // opposite way (longitude jumping by about half a turn) would flip the whole view upside down in one step.
    const lonFor = (bb) => { const mx = -vy * Math.sin(bb) + vz * Math.cos(bb); return Math.hypot(mx, vx) > 1e-9 ? g.lon - Math.atan2(-vx, mx) * RAD : cam.lon; };
    const flip = Math.abs(mod(lonFor(clamp(best, -H, H)) - cam.lon + 180, 360) - 180) > 100 && Math.abs(cam.lat) > 60;
    const short = Math.abs(S) > Rr + 1e-12;                         // no upright tilt brings the point this far round at all
    if (short || over(best) > 1e-9 || flip) { trackBall(g, qx, qy, frame); return; }      // out of reach upright: turn freely
    b = best;
  }
  const cb = Math.cos(b), sb = Math.sin(b);
  const mx = -vy * sb + vz * cb, my = -vx;                         // the point's mount direction for a camera at longitude 0
  cam.lat = b * RAD;
  if (Math.hypot(mx, my) > 1e-9) cam.lon = g.lon - Math.atan2(my, mx) * RAD;      // (at the pole itself longitude is free: leave it)
  update(frame);
}

/** Turn the view by the smallest rotation that puts mount-frame point g under the screen offset (qx, qy) (in units of
 *  cam.s, y up), allowing the picture to tilt: sets lon, lat and roll. Used where an upright camera cannot reach. */
function trackBall(g, qx, qy, frame) {
  const r2 = qx * qx + qy * qy, vz = (4 - r2) / (4 + r2), k = (1 + vz) / 2, v = [qx * k, qy * k, vz];      // where g must appear (view space)
  const gl = g.lon * DEG, gb = g.lat * DEG, gm = [Math.cos(gb) * Math.cos(gl), Math.cos(gb) * Math.sin(gl), Math.sin(gb)];
  const Vm = mulMM(cam.V, cam.M), v0 = mulMV(Vm, gm);             // mount -> view now, and where g appears now
  let ax = [v0[1] * v[2] - v0[2] * v[1], v0[2] * v[0] - v0[0] * v[2], v0[0] * v[1] - v0[1] * v[0]];
  const sn = Math.hypot(ax[0], ax[1], ax[2]), cs = v0[0] * v[0] + v0[1] * v[1] + v0[2] * v[2];
  if (sn < 1e-12) return;
  ax = ax.map((c) => c / sn);
  const t = 1 - cs, [x, y, z] = ax;                                // Rodrigues: the turn taking v0 to v
  const Q = [cs + x * x * t, x * y * t - z * sn, x * z * t + y * sn, y * x * t + z * sn, cs + y * y * t, y * z * t - x * sn, z * x * t - y * sn, z * y * t + x * sn, cs + z * z * t];
  const N = mulMM(Q, Vm), R = [N[0], N[1], N[2]], f = [N[6], N[7], N[8]];
  const lat = Math.asin(clamp(f[2], -1, 1)), lon = Math.hypot(f[0], f[1]) > 1e-9 ? Math.atan2(f[1], f[0]) : cam.lon * DEG;
  const sl = Math.sin(lon), cl = Math.cos(lon), r = [sl, -cl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  cam.lat = lat * RAD; cam.lon = lon * RAD;
  cam.roll = Math.atan2(R[0] * u[0] + R[1] * u[1] + R[2] * u[2], R[0] * r[0] + R[1] * r[1] + R[2] * r[2]) * RAD;
  update(frame);
}

/** Give the camera the orientation V (HOR -> view, rows right, up, forward), as longitude, latitude and roll of the mount. */
export function setAxes(V, frame) {
  const f = mulMV(cam.Mt, [V[6], V[7], V[8]]), u = mulMV(cam.Mt, [V[3], V[4], V[5]]), m = toSph(f);
  cam.lon = m.lon; cam.lat = m.lat;
  const l = m.lon * DEG, b = m.lat * DEG;
  cam.roll = Math.atan2(-(u[0] * Math.sin(l) - u[1] * Math.cos(l)), -u[0] * Math.sin(b) * Math.cos(l) - u[1] * Math.sin(b) * Math.sin(l) + u[2] * Math.cos(b)) * RAD;
  update(frame);
}
/** Point the camera, at the given roll, so that the HOR direction h is seen along the view-space direction v. False if the mount cannot. */
export function placeAt(h, v, roll, frame) {
  const m = mulMV(cam.Mt, h), ca = Math.cos(roll * DEG), sa = Math.sin(roll * DEG);
  const vx = v[0] * ca - v[1] * sa, vy = v[0] * sa + v[1] * ca, vz = v[2], Rr = Math.hypot(vy, vz);
  if (Rr < 1e-9 || Math.abs(m[2]) > Rr) return false;
  const phi = Math.atan2(vz, vy), d = Math.acos(clamp(m[2] / Rr, -1, 1)), near = cam.lat * DEG;
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), ok = [wrap(phi + d), wrap(phi - d)].filter((a) => Math.abs(a) <= Math.PI / 2).sort((a, b) => Math.abs(a - near) - Math.abs(b - near));
  if (!ok.length) return false;
  const b = ok[0], mx = -vy * Math.sin(b) + vz * Math.cos(b), my = -vx;
  cam.lat = b * RAD; cam.lon = (Math.atan2(m[1], m[0]) - Math.atan2(my, mx)) * RAD; cam.roll = roll;
  update(frame);
  return true;
}

/** Zoom by `factor` (< 1 zooms in) keeping the sky point under (x, y) fixed. */
export function zoomAt(factor, x, y, frame, keepCentre = false) {
  const g = keepCentre ? null : mountAt(x, y);
  cam.fov = clamp(cam.fov * factor, FOV_MIN, FOV_MAX);
  update(frame);
  if (g) bringUnder(g, x, y, frame);
}

/** Switch mounts without moving the center of the view. */
export function setMount(mount, frame) {
  const h = centerHor();
  state.mount = mount; cam.roll = 0;
  update(frame);
  lookAtHor(h);
  update(frame);
}

export const camAz = () => mod(-cam.lon, 360);
export { RAD };
