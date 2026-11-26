// render/ground.js: the opaque ground, the horizon line and the cardinal points.
// Under a stereographic projection the horizon is exactly a circle (or a straight line) on
// screen, so the ground is filled analytically rather than from sampled points.

import { air } from '../air.js';
import { DEG, azAltToHor, smooth } from '../astro.js';
import { state, eff } from '../state.js';
import { cam, projectHor } from '../camera.js';
import { R } from './proj.js';
import { groundColour } from './sky.js';
import { drawGroundShade } from './groundshade.js';

/** Screen-space circle of the horizon: {cx, cy, r, groundInside} or a half-plane {line: true, px, py, nx, ny}. */
export function horizonCircle() {
  const V = cam.V;
  const nx = -V[2], ny = -V[5], nz = -V[8];                 // nadir in view space
  const th = Math.acos(Math.max(-1, Math.min(1, nz)));
  const hyp = Math.hypot(nx, ny);
  const ux = hyp > 1e-12 ? nx / hyp : 0, uy = hyp > 1e-12 ? ny / hyp : -1;   // screen direction (y up) toward the nadir
  const r1 = 2 * Math.tan((th - Math.PI / 2) / 2), r2 = 2 * Math.tan((th + Math.PI / 2) / 2);
  const s = cam.s;
  if (!isFinite(r2) || Math.abs(r2) > 1e7) {
    return { line: true, px: cam.cx + s * r1 * ux, py: cam.cy - s * r1 * uy, nx: ux, ny: -uy };
  }
  const c = (r1 + r2) / 2;
  return { cx: cam.cx + s * c * ux, cy: cam.cy - s * c * uy, r: Math.abs(r2 - r1) / 2 * s, groundInside: th < Math.PI / 2 };
}

/** Trace the part of the horizon circle near the screen. Returns true if the path is a closed disc/sector. */
function traceInside(ctx, hc, forStroke) {
  const diag = Math.hypot(cam.w, cam.h);
  if (hc.r < diag * 3) {
    ctx.moveTo(hc.cx + hc.r, hc.cy);
    ctx.arc(hc.cx, hc.cy, hc.r, 0, 2 * Math.PI);
    return;
  }
  // huge circle: only the arc facing the screen matters. Sample it, then (for fills) fan to the centre.
  const a0 = Math.atan2(cam.cy - hc.cy, cam.cx - hc.cx);
  const half = Math.min(Math.PI, 1.6 * diag / hc.r);
  const n = 48;
  for (let i = 0; i <= n; i++) {
    const a = a0 - half + 2 * half * i / n;
    const x = hc.cx + hc.r * Math.cos(a), y = hc.cy + hc.r * Math.sin(a);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  if (!forStroke) { ctx.lineTo(hc.cx, hc.cy); ctx.closePath(); }
}

/** How the horizon circle sits relative to the screen: 'inside' (screen wholly within the disc),
 *  'outside' (wholly beyond it) or 'cross' (the horizon passes through the screen). */
function screenVsCircle(hc) {
  const nx = Math.max(0, Math.min(cam.w, hc.cx)), ny = Math.max(0, Math.min(cam.h, hc.cy));
  const dmin = Math.hypot(nx - hc.cx, ny - hc.cy);
  const dmax = Math.hypot(Math.max(hc.cx, cam.w - hc.cx), Math.max(hc.cy, cam.h - hc.cy));
  const pad = 20;                                  // the horizon haze is 16 px wide
  if (dmax < hc.r - pad) return 'inside';
  if (dmin > hc.r + pad) return 'outside';
  return 'cross';
}

export function drawGround(ctx) {
  if (eff.steady === 'full' || eff.space) return;      // steady.js: no ground, horizon line or compass points sweeping past; in space there are none
  const hc = horizonCircle();
  const sky = R.sky;
  const rel = hc.line ? 'cross' : screenVsCircle(hc);
  if (eff.ground) {
    ctx.fillStyle = eff.onSurface ? surfaceColour(sky) : groundColour(sky);
    ctx.beginPath();
    if (hc.line) {
      // half-plane on the nadir side of the line
      const tx = -hc.ny, ty = hc.nx, L = 4 * Math.hypot(cam.w, cam.h);
      ctx.moveTo(hc.px - tx * L, hc.py - ty * L); ctx.lineTo(hc.px + tx * L, hc.py + ty * L);
      ctx.lineTo(hc.px + tx * L + hc.nx * L, hc.py + ty * L + hc.ny * L); ctx.lineTo(hc.px - tx * L + hc.nx * L, hc.py - ty * L + hc.ny * L);
      ctx.closePath(); ctx.fill();
    } else if (rel !== 'cross') {
      // the horizon is off screen: the view is either all ground or all sky
      if ((rel === 'inside') === hc.groundInside) ctx.fillRect(0, 0, cam.w, cam.h);
    } else if (hc.groundInside) {
      traceInside(ctx, hc, false); ctx.fill();
    } else {
      ctx.rect(-2, -2, cam.w + 4, cam.h + 4);
      traceInside(ctx, hc, false); ctx.fill('evenodd');
    }
  }
  if (eff.ground) drawGroundShade(ctx, sky, R.bodies);
  // horizon: a soft haze band plus a thin line
  const stroke = (w, style) => {
    ctx.lineWidth = w; ctx.strokeStyle = style; ctx.beginPath();
    if (hc.line) { const tx = -hc.ny, ty = hc.nx, L = 4 * Math.hypot(cam.w, cam.h); ctx.moveTo(hc.px - tx * L, hc.py - ty * L); ctx.lineTo(hc.px + tx * L, hc.py + ty * L); }
    else traceInside(ctx, hc, true);
    ctx.stroke();
  };
  if (rel === 'cross') {
    if (eff.ground) {
      const hz = sky.atmo ? 0.5 + 0.5 * sky.day : 0.25;
      const ah = air().haze, tint = !sky.atmo ? '90,100,120' : state.vantage ? (sky.day > 0.5 ? ah.join(',') : ah.map((v) => Math.round(v * 0.6)).join(',')) : sky.day > 0.5 ? '190,205,220' : '120,135,160';
      stroke(16, `rgba(${tint},${0.035 * hz})`); stroke(8, `rgba(${tint},${0.06 * hz})`); stroke(3, `rgba(${tint},${0.10 * hz})`);
      stroke(1, `rgba(${tint},${0.30})`);
    } else {
      stroke(1.2, 'rgba(150,170,120,0.55)');
    }
  }
  if (state.show.cardinal) drawCardinals();
}

/** Standing on another body: its own colour, lit by the Sun (no air: full light once the Sun is clear of the horizon, black ground at night). */
function surfaceColour(sky) {
  const b = R.bodies && R.bodies.byId[state.vantage], hex = (b && b.color) || '#9a948a';
  const lit = 0.05 + 0.6 * smooth(-0.5, 6, sky.sunAlt);
  const c = [1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * lit));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

const NAMES = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const p0 = [0, 0], p1 = [0, 0];
function drawCardinals() {
  for (let i = 0; i < 8; i++) {
    const az = i * 45;
    if (!projectHor(azAltToHor(az, 0), p0)) continue;
    if (!projectHor(azAltToHor(az, -1), p1)) continue;
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], d = Math.hypot(dx, dy) || 1;
    const major = i % 2 === 0;
    if (!major && cam.fov > 150) continue;
    const off = major ? 14 : 11;
    R.labels.add(p0[0] + dx / d * off, p0[1] + dy / d * off, NAMES[i], major ? 'cardinal' : 'cardinalMinor', major ? 200 : 150, { anchor: 'center' });
  }
}
export { DEG };
