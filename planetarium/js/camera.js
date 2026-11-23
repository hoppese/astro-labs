// camera.js: the view. Stereographic projection of the apparent sky, with either an alt-az
// mount (zenith stays up) or an equatorial mount (north celestial pole stays up).
//
// The camera points at (lon, lat) in its MOUNT frame:
//   alt-az mount      mount frame = HOR, so lat = altitude and lon = -azimuth (HOR's y axis is west)
//   equatorial mount  mount frame = EQD (equator of date), so lon = right ascension, lat = declination
// `fov` is the vertical field of view in degrees.

import { DEG, RAD, clamp, mod, mulMM, mulMV, transpose, IDENTITY, toSph } from './astro.js';
import { state } from './state.js';

export const FOV_MIN = 0.0005, FOV_MAX = 180;      // 1.8 arcsec to all-sky

export const cam = {
  lon: -180, lat: 28, fov: 90,
  w: 800, h: 600, cx: 400, cy: 300, s: 1,
  V: IDENTITY.slice(),        // HOR -> view (rows: right, up, forward)
  Vt: IDENTITY.slice(),       // view -> HOR
  M: IDENTITY.slice(),        // mount -> HOR
  Mt: IDENTITY.slice(),       // HOR -> mount
  zMin: -1,                   // view-space z below which nothing can be on screen
  pxPerDeg: 1,                // screen scale at the centre of the view
};

export function resize(w, h) { cam.w = w; cam.h = h; cam.cx = w / 2; cam.cy = h / 2; }

/** Rebuild the matrices for the current pointing, mount and frame. Call before projecting. */
export function update(frame) {
  cam.lat = clamp(cam.lat, -90, 90);
  cam.lon = mod(cam.lon + 180, 360) - 180;
  cam.fov = clamp(cam.fov, FOV_MIN, FOV_MAX);
  const l = cam.lon * DEG, b = cam.lat * DEG, cl = Math.cos(l), sl = Math.sin(l), cb = Math.cos(b), sb = Math.sin(b);
  const f = [cb * cl, cb * sl, sb], r = [sl, -cl, 0];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const Vm = [r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]];     // mount -> view
  cam.M = state.mount === 'eq' ? frame.Mdh : IDENTITY;
  cam.Mt = transpose(cam.M);
  cam.V = mulMM(Vm, cam.Mt);
  cam.Vt = transpose(cam.V);
  cam.s = (cam.h / 2) / (2 * Math.tan(cam.fov * DEG / 4));
  cam.pxPerDeg = cam.s * DEG;
  const rho = (Math.hypot(cam.w, cam.h) / 2 + 60) / cam.s;
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
/** The apparent HOR direction at the centre of the view. */
export const centerHor = () => [cam.V[6], cam.V[7], cam.V[8]];

/** Turn the camera so that mount-frame point `g` ({lon, lat}) sits under screen position (x, y).
 *  Solved in closed form, which matters at the mount's pole (the zenith in alt-az, the celestial pole in
 *  equatorial): there a point on the far side of the pole moves the "wrong" way when the camera tilts, and a
 *  step-by-step search either sticks or oscillates. The screen point fixes a direction v in view space; a
 *  camera tilt b puts it at mount latitude asin(vy cos b + vz sin b), which is solved for b; the turn about
 *  the mount's axis then follows. The camera cannot tip over the pole (b stays within +-90), so a drag that
 *  would need to stops at the pole and swings the sky round it instead, as an alt-az or equatorial mount does. */
let poleGrab = null, poleSide = 0, poleOf = null;
export function bringUnder(g, x, y, frame) {
  const px = (x - cam.cx) / cam.s, py = -(y - cam.cy) / cam.s;
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
    if (over(best) > 1e-9 || flip) {
      // Out of reach: the mount is hard against its pole. Putting the grabbed point "as near as possible" would
      // whip the sky half a turn as the pointer crosses the centre, so instead hold the pole and turn the sky
      // about it by exactly as much as the pointer swings round the centre of the view.
      const ang = Math.atan2(py, px), up = (flip ? cam.lat : best) > 0 ? 1 : -1;
      // (weighted by the pointer's distance from the centre: close to the axis a tiny movement is a huge swing)
      const lever = Math.min(1, Math.hypot(x - cam.cx, y - cam.cy) / 90);
      if (poleGrab !== null && poleSide === up && poleOf === g) cam.lon += up * wrap(ang - poleGrab) * RAD * lever * lever;
      poleGrab = ang; poleSide = up; poleOf = g;       // (`g` is one object per drag, so a new drag starts afresh)
      cam.lat = up * 90;
      update(frame);
      return;
    }
    b = best;
  }
  poleGrab = null;
  const cb = Math.cos(b), sb = Math.sin(b);
  const mx = -vy * sb + vz * cb, my = -vx;                         // the point's mount direction for a camera at longitude 0
  cam.lat = b * RAD;
  if (Math.hypot(mx, my) > 1e-9) cam.lon = g.lon - Math.atan2(my, mx) * RAD;      // (at the pole itself longitude is free: leave it)
  update(frame);
}

/** Zoom by `factor` (< 1 zooms in) keeping the sky point under (x, y) fixed. */
export function zoomAt(factor, x, y, frame, keepCentre = false) {
  const g = keepCentre ? null : mountAt(x, y);
  cam.fov = clamp(cam.fov * factor, FOV_MIN, FOV_MAX);
  update(frame);
  if (g) bringUnder(g, x, y, frame);
}

/** Switch mounts without moving the centre of the view. */
export function setMount(mount, frame) {
  const h = centerHor();
  state.mount = mount;
  update(frame);
  lookAtHor(h);
  update(frame);
}

export const camAz = () => mod(-cam.lon, 360);
export { RAD };
