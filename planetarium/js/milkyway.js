// milkyway.js: the Milky Way as a soft glow behind the stars.
// data/milkyway.bin is a small brightness map in galactic coordinates, baked from d3-celestial's
// outline polygons by tools/build_milkyway.py (BSD-3-Clause; see NOTES.md). It shows where the band
// is and roughly how bright; it is a picture, not photometry.
// Each frame a coarse grid of screen points is turned back into galactic coordinates, the map is
// sampled there, and the result is added to the sky. How strongly depends on the naked-eye limit
// of the sky (light pollution, moonlight, twilight), so it fades exactly when the faint stars do.

import { emit } from './state.js';
import { mulMM, smooth, clamp } from './astro.js';
import { cam } from './camera.js';
import { R } from './render/proj.js';
import { xs } from './xui.js';

// J2000 equatorial -> galactic (IAU 1958 system; Hipparcos Vol. 1, eq. 1.5.11)
const GAL = [-0.0548755604, -0.8734370902, -0.4838350155,
  0.4941094279, -0.4448296300, 0.7469822445,
  -0.8676661490, -0.1980763734, 0.4559837762];
const BASE = new URL('../data/', import.meta.url);
const CELL = 8;                       // screen px per sample

export const milkyWay = { status: 'idle', error: '' };     // idle | loading | ready | error
let tex = null, TW = 0, TH = 0, bMin = -30, bMax = 30, retryAt = 0;
let off = null, octx = null, img = null, gw = 0, gh = 0;

export function loadMilkyWay() {
  if (milkyWay.status === 'loading' || milkyWay.status === 'ready') return;
  if (milkyWay.status === 'error' && performance.now() < retryAt) return;
  milkyWay.status = 'loading';
  const get = (f) => fetch(new URL(f, BASE)).then((r) => { if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return r; });
  Promise.all([get('milkyway.json').then((r) => r.json()), get('milkyway.bin').then((r) => r.arrayBuffer())])
    .then(([meta, buf]) => {
      if (buf.byteLength !== meta.w * meta.h) throw new Error('milkyway.bin has the wrong size');
      tex = new Uint8Array(buf); TW = meta.w; TH = meta.h; bMin = meta.bMin; bMax = meta.bMax;
      milkyWay.status = 'ready'; milkyWay.error = '';
      emit('catalog', 'milkyway');
    })
    .catch((e) => {
      milkyWay.status = 'error'; milkyWay.error = e.message; retryAt = performance.now() + 20000;
      console.warn('Milky Way map failed to load', e);
      emit('catalog', 'milkyway-error');
    });
}

/** 0..1: how much of the Milky Way survives this sky. */
export function milkyWayVisibility(sky) {
  // sky.base = naked-eye limiting magnitude now (Bortle, Moon, twilight). The band needs about mag 5.5 to
  // be noticed at all and is at its best past mag 7.
  const v = sky.atmo ? smooth(4.7, 7.3, sky.base) : 1;
  return v * smooth(1.5, 9, cam.fov);          // zoomed far in it is only a flat veil: let it go
}

export function drawMilkyWay(ctx) {
  if (!xs.milkyWay) return;
  if (!tex) { loadMilkyWay(); return; }
  const sky = R.sky, vis = milkyWayVisibility(sky);
  if (vis < 0.015) return;
  const w = cam.w, h = cam.h;
  const nw = Math.max(8, Math.ceil(w / CELL)), nh = Math.max(8, Math.ceil(h / CELL));
  if (!off || nw !== gw || nh !== gh) {
    gw = nw; gh = nh;
    off = document.createElement('canvas'); off.width = gw; off.height = gh;
    octx = off.getContext('2d'); img = octx.createImageData(gw, gh);
  }
  const Vt = cam.Vt, T = mulMM(GAL, mulMM(R.frame.Mhj, Vt));       // view -> galactic
  const d = img.data, s = cam.s, atmo = sky.atmo, ground = R.ground;
  const gain = 74 * vis, xScale = TW / (2 * Math.PI), yScale = TH / ((bMax - bMin) * Math.PI / 180), b0 = bMin * Math.PI / 180;
  let any = false;
  for (let j = 0; j < gh; j++) {
    const py = -((j + 0.5) / gh * h - cam.cy) / s;
    for (let i = 0; i < gw; i++) {
      const o = (j * gw + i) * 4;
      const px = ((i + 0.5) / gw * w - cam.cx) / s;
      const r2 = px * px + py * py, z = (4 - r2) / (4 + r2), k = (1 + z) / 2;
      const vx = px * k, vy = py * k;
      let f = 1;
      const hz = Vt[6] * vx + Vt[7] * vy + Vt[8] * z;                // sine of the altitude
      if (hz < 0) { if (ground) { d[o] = d[o + 1] = d[o + 2] = 0; d[o + 3] = 255; continue; } }
      else if (atmo) f = 0.12 + 0.88 * smooth(0.02, 0.42, hz);        // extinction and horizon glow swallow it low down
      const gz = T[6] * vx + T[7] * vy + T[8] * z;
      const v = (Math.asin(gz > 1 ? 1 : gz < -1 ? -1 : gz) - b0) * yScale - 0.5;
      let t = 0;
      if (v > 0 && v < TH - 1) {
        let u = Math.atan2(T[3] * vx + T[4] * vy + T[5] * z, T[0] * vx + T[1] * vy + T[2] * z) * xScale - 0.5;
        if (u < 0) u += TW;
        const u0 = Math.floor(u), v0 = Math.floor(v), fu = u - u0, fv = v - v0, u1 = (u0 + 1) % TW;
        const a = v0 * TW, b = a + TW;
        t = (tex[a + u0 % TW] * (1 - fu) + tex[a + u1] * fu) * (1 - fv) + (tex[b + u0 % TW] * (1 - fu) + tex[b + u1] * fu) * fv;
      }
      if (t > 0) {
        // gentle curve: the faint outer band stays visible, the bright clouds do not burn out
        const c = Math.pow(t / 255, 0.72) * gain * f;
        d[o] = c * 0.80; d[o + 1] = c * 0.87; d[o + 2] = c;
        any = true;
      } else { d[o] = d[o + 1] = d[o + 2] = 0; }
      d[o + 3] = 255;
    }
  }
  if (!any) return;
  octx.putImageData(img, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';
  ctx.drawImage(off, 0, 0, gw, gh, 0, 0, w, h);
  ctx.restore();
}
export { clamp };
