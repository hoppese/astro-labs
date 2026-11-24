// render/groundshade.js: gives the flat ground some depth. Called by ground.js right after the fill.
// Pale haze where the ground meets the sky, darkening in steps toward your feet, plus a faint warm
// wash on the side the Sun (or a low Moon at night) is on. Circles of constant depression below the
// horizon are exact circles under the stereographic projection, so each step is one filled circle.

import { DEG, lerp, clamp, smooth } from '../astro.js';
import { state } from '../state.js';
import { cam, projectHor } from '../camera.js';

// degrees below the horizon: many thin steps, so the eye sees a gradient and not bands
const STEPS = []; for (let d = 0.45; d < 76; d *= 1.115) STEPS.push(d);

/** Add to the current path the screen region more than `dep` degrees below the horizon. Returns false if it is off screen. */
function capPath(ctx, dep) {
  const V = cam.V, nx = -V[2], ny = -V[5], nz = -V[8];             // nadir in view space
  const th = Math.acos(clamp(nz, -1, 1)), rho = (90 - dep) * DEG;
  const hyp = Math.hypot(nx, ny);
  const ux = hyp > 1e-12 ? nx / hyp : 0, uy = hyp > 1e-12 ? ny / hyp : -1;
  const r1 = 2 * Math.tan((th - rho) / 2), r2 = 2 * Math.tan((th + rho) / 2), s = cam.s;
  const diag = Math.hypot(cam.w, cam.h);
  if (!isFinite(r2) || Math.abs(r2) > 1e6) {
    // the circle passes through the point behind the viewer: a straight edge
    const px = cam.cx + s * r1 * ux, py = cam.cy - s * r1 * uy, tx = uy, ty = ux, L = 4 * diag;
    ctx.moveTo(px - tx * L, py - ty * L); ctx.lineTo(px + tx * L, py + ty * L);
    ctx.lineTo(px + tx * L + ux * L, py + ty * L - uy * L); ctx.lineTo(px - tx * L + ux * L, py - ty * L - uy * L); ctx.closePath();
    return true;
  }
  const c = (r1 + r2) / 2, cx = cam.cx + s * c * ux, cy = cam.cy - s * c * uy, r = Math.abs(r2 - r1) / 2 * s;
  const inside = th + rho < Math.PI;                                // is the region the inside of the circle?
  const qx = Math.max(0, Math.min(cam.w, cx)), qy = Math.max(0, Math.min(cam.h, cy));
  const dmin = Math.hypot(qx - cx, qy - cy), dmax = Math.hypot(Math.max(cx, cam.w - cx), Math.max(cy, cam.h - cy));
  if (dmax < r) { if (inside) ctx.rect(0, 0, cam.w, cam.h); return inside; }      // screen wholly within the circle
  if (dmin > r) { if (!inside) ctx.rect(0, 0, cam.w, cam.h); return !inside; }    // screen wholly outside it
  if (!inside) ctx.rect(-2, -2, cam.w + 4, cam.h + 4);                            // even-odd: everything but the disc
  if (r < diag * 3) { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, 2 * Math.PI); return true; }
  const a0 = Math.atan2(cam.cy - cy, cam.cx - cx), half = Math.min(Math.PI, 1.6 * diag / r), n = 48;
  for (let i = 0; i <= n; i++) {
    const a = a0 - half + 2 * half * i / n, x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.lineTo(cx, cy); ctx.closePath();
  return true;
}
const fillCap = (ctx, dep, style) => { ctx.beginPath(); if (capPath(ctx, dep)) { ctx.fillStyle = style; ctx.fill('evenodd'); } };

const p = [0, 0];
export function drawGroundShade(ctx, sky, bodies) {
  const d = sky.day, lp = sky.atmo ? (state.bortle - 1) / 8 : 0;
  // 1. haze over all of the ground, strongest by day
  const haze = [lerp(34 + 60 * lp, 176, d), lerp(40 + 48 * lp, 196, d), lerp(54 + 36 * lp, 206, d)].map(Math.round);
  const hazeA = sky.atmo ? lerp(0.10 + 0.16 * lp, 0.42, d) : 0.04;
  fillCap(ctx, 0, `rgba(${haze[0]},${haze[1]},${haze[2]},${hazeA})`);
  // 2. warm light on the Sun's side, low Sun only (and a trace of it under a bright Moon)
  const lightOn = (body, strength, rgb) => {
    if (strength < 0.01 || !body) return;
    const h = body.hor, az = Math.hypot(h[0], h[1]);
    if (az < 1e-6 || !projectHor([h[0] / az, h[1] / az, 0], p)) return;
    const rad = Math.max(cam.w, cam.h) * clamp(60 / cam.fov, 0.5, 2.5);
    const g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], rad);
    g.addColorStop(0, `rgba(${rgb},${strength})`); g.addColorStop(1, `rgba(${rgb},0)`);
    fillCap(ctx, 0, g);
  };
  if (sky.atmo && bodies) {
    lightOn(bodies.sun, 0.34 * smooth(-7, -1, sky.sunAlt) * (1 - smooth(4, 22, sky.sunAlt)) * (sky.sunDim ?? 1), '232,150,84');
    lightOn(bodies.moon, 0.10 * (1 - d) * Math.pow(bodies.moon.phaseFrac || 0, 2) * smooth(0, 12, sky.moonAlt), '150,165,200');
  }
  // 3. darker toward your feet
  const deep = [lerp(5 + 6 * lp, 37, d), lerp(7 + 6 * lp, 51, d), lerp(7 + 5 * lp, 30, d)].map(Math.round);
  const stepA = lerp(0.042, 0.056, d);
  for (const dep of STEPS) fillCap(ctx, dep, `rgba(${deep[0]},${deep[1]},${deep[2]},${stepA})`);
}

/** Clip to the part of the screen that is sky (above the horizon). For overlays drawn after the ground. */
export function clipToSky(ctx) {
  ctx.beginPath();
  ctx.rect(-4, -4, cam.w + 8, cam.h + 8);
  const sub = new Path2D();
  // capPath may itself add a full-screen rectangle; build it on its own path and combine by even-odd
  const proxy = { rect: (...a) => sub.rect(...a), moveTo: (...a) => sub.moveTo(...a), lineTo: (...a) => sub.lineTo(...a), arc: (...a) => sub.arc(...a), closePath: () => sub.closePath() };
  const has = capPath(proxy, 0);
  if (!has) { ctx.clip(); return; }
  // sky = screen minus ground. Draw the ground mask and use destination-out? Simpler: even-odd of (big rect + ground),
  // which is exact because the ground path's own even-odd interior is the ground region.
  const all = new Path2D(); all.rect(-4000, -4000, cam.w + 8000, cam.h + 8000); all.addPath(sub);
  ctx.clip(all, 'evenodd');
}
