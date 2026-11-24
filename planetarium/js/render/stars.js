// render/stars.js: draws the star tiers as soft discs sized by magnitude.
// The loop is the app's hot path: plain arithmetic on typed arrays, no allocation per star.

import { DEG, RAD, clamp, refractionDeg } from '../astro.js';
import { stars, FAINT_NAMES } from '../catalog.js';
import { state } from '../state.js';
import { cam } from '../camera.js';
import { addPick } from '../picks.js';
import { R } from './proj.js';
import { see, seeFrame, seeStar } from '../notebook/seeing.js';

// ---- colour from B-V ---------------------------------------------------------
const NB = 14, BV0 = -0.4, BV_STEP = 0.2;
/** Approximate RGB for a colour index (Ballesteros temperature, then a blackbody tint, softened). */
export function bvToRgb(bv) {
  bv = clamp(bv, -0.4, 2.0);
  const t = 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62)) / 100;
  let r, g, b;
  r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  g = t <= 66 ? 99.4708025861 * Math.log(t) - 161.1195681661 : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  b = t >= 66 ? 255 : (t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307);
  const soft = 0.42;          // pull toward white: real star colours are subtle to the eye
  return [r, g, b].map((v) => Math.round(clamp(v, 0, 255) * (1 - soft) + 255 * soft));
}

const SPR = 64;
let sprites = null;
function makeSprites() {
  sprites = [];
  for (let i = 0; i < NB; i++) {
    const [r, g, b] = bvToRgb(BV0 + i * BV_STEP);
    const c = document.createElement('canvas'); c.width = c.height = SPR;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(SPR / 2, SPR / 2, 0, SPR / 2, SPR / 2, SPR / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.16, `rgba(${r},${g},${b},0.98)`);
    gr.addColorStop(0.30, `rgba(${r},${g},${b},0.55)`);
    gr.addColorStop(0.55, `rgba(${r},${g},${b},0.12)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, SPR, SPR);
    sprites.push(c);
  }
}
// One atlas holding every colour at ALPHA_N opacities (row l = opacity (l + 1) / ALPHA_N). The star loops draw
// from it without touching globalAlpha, so the browser can batch thousands of stars into a few GPU calls
// (separate sprite canvases plus per-star alpha changes cost about 4 microseconds a star; this is about 1).
export const ALPHA_N = 10;
let atlasCanvas = null;
export function starAtlas() {
  if (atlasCanvas) return atlasCanvas;
  if (!sprites) makeSprites();
  const c = document.createElement('canvas'); c.width = NB * SPR; c.height = ALPHA_N * SPR;
  const x = c.getContext('2d');
  for (let l = 0; l < ALPHA_N; l++) { x.globalAlpha = (l + 1) / ALPHA_N; for (let i = 0; i < NB; i++) x.drawImage(sprites[i], i * SPR, l * SPR); }
  atlasCanvas = c;
  return c;
}
export function starSprite(bv) {
  if (!sprites) makeSprites();
  const i = bv > 50 ? 5 : clamp(Math.round((bv - BV0) / BV_STEP), 0, NB - 1);
  return sprites[i];
}

/** Disc radius (px) and opacity for a star `d` magnitudes brighter than the limit. */
export function starSize(d) {
  return Math.min(10, 0.85 + 0.48 * Math.pow(d, 1.1));
}
/** Draw one star-like point (also used for planets shown as points). */
export function drawStarPoint(ctx, x, y, d, bv) {
  const r = starSize(d);
  const half = r / 0.34;
  ctx.globalAlpha = d < 1.5 ? 0.08 + 0.92 * Math.pow(Math.max(d, 0) / 1.5, 0.6) : 1;
  ctx.drawImage(starSprite(bv), x - half, y - half, 2 * half, 2 * half);
  ctx.globalAlpha = 1;
  return r;
}

export const stats = { drawn: 0, considered: 0 };

export function drawStars(ctx) {
  const atlas = starAtlas();
  const { frame, sky, atmo, refr, ground, labels } = R;
  const lim = sky.limMag;
  const M = frame.Mjh, V = cam.V, bx = frame.beta[0], by = frame.beta[1], bz = frame.beta[2];
  const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
  const zMin = cam.zMin, s2 = 2 * cam.s, cx = cam.cx, cy = cam.cy, W = cam.w, H = cam.h;
  const NF = stars.NF, names = stars.names;
  const showNames = state.show.starNames && !(see.on && see.noMarker);          // (measuring star images by eye: no name printed across them)
  // label thresholds: proper names for the brighter stars, Bayer/Flamsteed once zoomed in
  const nameLim = lim - (cam.fov > 100 ? 4.6 : cam.fov > 50 ? 4.0 : 3.0);
  const bayerLim = cam.fov < 45 ? lim - 3.2 : -99;
  const flamLim = cam.fov < 12 ? lim - 3.0 : -99;
  const hipLim = cam.fov < 2.5 ? lim - 2.5 : -99;
  // forward axis of the view expressed in J2000, for a cheap cone test before any trigonometry
  const f0 = V[6] * m0 + V[7] * m3 + V[8] * m6, f1 = V[6] * m1 + V[7] * m4 + V[8] * m7, f2 = V[6] * m2 + V[7] * m5 + V[8] * m8;
  const zLoose = Math.cos(Math.min(Math.PI, Math.acos(zMin < -1 ? -1 : zMin) + 0.02));       // refraction never moves a star by more than ~0.6 deg
  const minZ = ground ? -0.03 : -2;        // true altitude below about -1.7 deg can never be lifted above the horizon
  let drawn = 0, considered = 0;
  const seeOn = seeFrame();                 // lab notebook: seeing discs and simulated measurement noise at high zoom (js/notebook/seeing.js)
  // annual parallax (labs): each star shifts opposite to the Earth's place, by 1 arcsec / distance in pc
  const par = frame.parallax && cam.fov < 5, PW = Math.PI / 648000;
  const ex = par ? frame.epos[0] * PW : 0, ey = par ? frame.epos[1] * PW : 0, ez = par ? frame.epos[2] * PW : 0;
  ctx.globalAlpha = 1;
  for (const t of stars.tiers) {
    if (!t.loaded) continue;
    if (t.magMin > lim) break;
    const d = t.data, v = t.vec, n = t.n;
    for (let i = 0; i < n; i++) {
      const o = i * NF;
      let mag = d[o + 2];
      if (mag > lim) break;
      considered++;
      let x = v[3 * i] + bx, y = v[3 * i + 1] + by, z = v[3 * i + 2] + bz;
      if (f0 * x + f1 * y + f2 * z < zLoose) continue;
      if (par) { const dd = d[o + 6]; if (dd > 0) { x -= ex / dd; y -= ey / dd; z -= ez / dd; } }
      // back to unit length: adding the aberration vector changes it by up to 1e-4, and the refraction step below takes asin(hz),
      // which turned that into an altitude error of (1e-4 x tan alt): 10 arcsec at 40 deg, an arcminute near the zenith
      { const f = 1 / Math.sqrt(x * x + y * y + z * z); x *= f; y *= f; z *= f; }
      let hz = m6 * x + m7 * y + m8 * z;
      if (hz < minZ) continue;
      let hx = m0 * x + m1 * y + m2 * z, hy = m3 * x + m4 * y + m5 * z;
      if (refr || atmo) {
        // refraction (Saemundsson) and extinction (Kasten-Young air mass, 0.2 mag per air mass)
        let alt = Math.asin(hz > 1 ? 1 : hz) * RAD;
        if (refr) {
          const rf = refractionDeg(alt);
          const a2 = (alt + rf) * DEG, c = Math.sqrt(hx * hx + hy * hy);
          if (c > 1e-9) { const k = Math.cos(a2) / c; hx *= k; hy *= k; hz = Math.sin(a2); }
          alt += rf;
        }
        if (atmo && alt < 40) {
          const am = 1 / (Math.sin((alt < 0 ? 0 : alt) * DEG) + 0.50572 * Math.pow((alt < 0 ? 0 : alt) + 6.07995, -1.6364));
          mag += 0.2 * (am - 1);
          if (mag > lim) continue;
        }
      }
      if (ground && hz < 0) continue;
      const vz = V[6] * hx + V[7] * hy + V[8] * hz;
      if (vz < zMin) continue;
      const k = s2 / (1 + vz);
      const sx = cx + k * (V[0] * hx + V[1] * hy + V[2] * hz);
      if (sx < -12 || sx > W + 12) continue;
      const sy = cy - k * (V[3] * hx + V[4] * hy + V[5] * hz);
      if (sy < -12 || sy > H + 12) continue;
      const dm = lim - mag;
      const r = Math.min(10, 0.85 + 0.48 * Math.pow(dm, 1.1));
      const half = r / 0.34;
      const bv = d[o + 3];
      const si = bv > 50 ? 5 : bv < BV0 ? 0 : bv > 2.1 ? NB - 1 : Math.round((bv - BV0) / BV_STEP);
      // within 1.5 mag of the limit a star fades in from nothing, so nothing pops while zooming
      const al = dm < 1.5 ? Math.round((0.08 + 0.92 * Math.pow(dm / 1.5, 0.6)) * ALPHA_N) - 1 : ALPHA_N - 1;
      drawn++;
      if (seeOn) seeStar(ctx, atlas, si, al, sx, sy, dm, v[3 * i], v[3 * i + 1], half, mag, { kind: 'star', k: t.k, i });
      else {
        if (al >= 0) ctx.drawImage(atlas, si * SPR, al * SPR, SPR, SPR, sx - half, sy - half, 2 * half, 2 * half);
        addPick(sx, sy, r, mag, { kind: 'star', k: t.k, i });
      }
      if (showNames) {
        const m = d[o + 2];
        if (t.k === 0) {
          const nm = names.name[i];
          if (nm && m < nameLim) labels.add(sx, sy, nm, 'star', 60 - m, { gap: r + 4 });
          else if (m < bayerLim && names.bayer[i]) labels.add(sx, sy, names.bayer[i].split(' ')[0], 'starDim', 40 - m, { gap: r + 4 });
          else if (m < flamLim && names.flam[i]) labels.add(sx, sy, names.flam[i].split(' ')[0], 'starDim', 30 - m, { gap: r + 4 });
          else if (m < hipLim && d[o + 4]) labels.add(sx, sy, 'HIP ' + d[o + 4], 'starDim', 20 - m, { gap: r + 4 });
        } else if (m < hipLim) {
          labels.add(sx, sy, FAINT_NAMES[d[o + 4]] || (d[o + 4] ? 'HIP ' + d[o + 4] : 'HD ' + d[o + 5]), 'starDim', 20 - m, { gap: r + 4 });
        }
      }
    }
  }
  stats.drawn = drawn; stats.considered = considered;
}
