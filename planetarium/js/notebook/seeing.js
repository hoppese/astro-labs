// notebook/seeing.js: "observing conditions" for the measuring labs. Two things, both OFF unless a lab preset, a URL
// parameter or the student switches them on (the ordinary planetarium is untouched):
//
//   seeing (arcsec)  At high zoom a star is not a point: it is a blurred disc the size of the atmospheric seeing,
//                    a little lumpy and different in every exposure. Centring on it is a judgement.
//   noise (arcsec)   SIMULATED MEASUREMENT ERROR. In every "exposure" (= every clock second) each star image is
//                    displaced by a random amount, Gaussian with this standard deviation on each axis, as photon
//                    noise and the atmosphere displace the centroid of a real CCD image. The displacement is a
//                    fixed function of (the student's seed, the instant, the star): returning to the same date shows
//                    the same frame, and two students with different seeds see different frames. It is not real data.
//
// The star loops (render/stars.js, deepstars.js) call seeStar() instead of drawing the sprite themselves while
// see.on is true; that happens only when the seeing disc or the noise is at least a few pixels / tenths of a pixel,
// i.e. zoomed to arcminute fields, where a few hundred stars are on screen.

import { state } from '../state.js';
import { cam } from '../camera.js';
import { addPick } from '../picks.js';

// seed: the notebook's when one is open (host.js); otherwise this browser's own, kept between visits, so that the angle tool's pointing
// error and the photometer's noise differ from one student to the next even in a lab without a notebook
const browserSeed = (() => { try { let s = +localStorage.getItem('astro-labs.seed'); if (!(s > 0)) { s = 1 + Math.floor(Math.random() * 999998); localStorage.setItem('astro-labs.seed', String(s)); } return s; } catch (e) { return 1 + Math.floor(Math.random() * 999998); } })();
export const see = { enabled: false, seeing: 0, noise: 0, seed: browserSeed, on: false, fwhm: 0, pxas: 0, x: 0, y: 0, r: 0, noMarker: false };
let tLo = 0, tHi = 0;
const SPR = 64, ALPHA_N = 10;

/** Once per frame, before the stars are drawn. */
export function seeFrame() {
  see.pxas = cam.pxPerDeg / 3600;                         // pixels per arcsecond at the center of the view
  see.fwhm = see.seeing * see.pxas;
  see.on = see.enabled && (see.fwhm >= 3 || see.noise * see.pxas >= 0.05);
  const t = Math.floor(state.timeMs / 1000);
  tLo = t | 0; tHi = Math.floor(t / 4294967296) | 0;
  return see.on;
}
// 32-bit mixing (the steps of MurmurHash3): the same inputs give the same numbers in every browser
function mix(h, k) { k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593); h ^= k; h = (h << 13) | (h >>> 19); return (Math.imul(h, 5) + 0xe6546b64) | 0; }
function fin(h) { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; }
const U = 1 / 4294967296;
/** Two independent standard normal numbers for (seed, instant in whole seconds, star key), into out[0], out[1]. Exported for the checks. */
export function noisePair(seed, tl, th, ka, kb, out) {
  let h = mix(mix(mix(mix(seed | 0, tl), th), ka), kb);
  const u1 = (fin(h) + 1) * U, u2 = fin(mix(h, 0x9e3779b9)) * U;
  const r = Math.sqrt(-2 * Math.log(u1)), a = 2 * Math.PI * u2;
  out[0] = r * Math.cos(a); out[1] = r * Math.sin(a);
  return h;
}
const g = [0, 0];
/** Draw one star image under the current conditions and register it for picking.
 *  (sx, sy) = where the star truly is on screen; dm = magnitudes above the limit; (kx, ky) = two components of its
 *  J2000 unit vector (its identity for the random numbers); half0 = half-size the ordinary sprite would have had. */
export function seeStar(ctx, atlas, si, al, sx, sy, dm, kx, ky, half0, mag, ref) {
  const h = noisePair(see.seed, tLo, tHi, (kx * 1073741824) | 0, (ky * 1073741824) | 0, g);
  const x = sx + g[0] * see.noise * see.pxas, y = sy - g[1] * see.noise * see.pxas;
  // the seeing disc: full width at half maximum = see.fwhm (the sprite's half-light point is at 0.31 of its half-size);
  // brighter stars show more of their wings, so they look bigger, as on any exposure
  const bloat = dm < 1 ? 0.85 : dm > 9 ? 1.45 : 0.85 + 0.075 * (dm - 1);
  const half = Math.max(half0, see.fwhm / 0.62 * bloat);
  const big = half > half0 * 1.15;
  const a0 = big ? Math.max(0, Math.min(ALPHA_N - 1, Math.round((al + 1) * Math.min(1, 0.32 + 0.085 * dm)) - 1)) : al;
  if (a0 >= 0) ctx.drawImage(atlas, si * SPR, a0 * SPR, SPR, SPR, x - half, y - half, 2 * half, 2 * half);
  if (big && a0 >= 2) {
    // three faint off-centre lumps (speckles), different in every exposure: the image is never perfectly round
    let hh = h;
    for (let k = 0; k < 3; k++) {
      hh = mix(hh, k + 1); const u = fin(hh) * U; hh = mix(hh, 77); const v = fin(hh) * U;
      const rr = 0.2 * see.fwhm * Math.sqrt(u), an = 2 * Math.PI * v, hs = half * 0.62;
      ctx.drawImage(atlas, si * SPR, Math.max(0, a0 - 6) * SPR, SPR, SPR, x + rr * Math.cos(an) - hs, y + rr * Math.sin(an) - hs, 2 * hs, 2 * hs);
    }
  }
  see.x = x; see.y = y; see.r = Math.max(half * 0.34, 3);
  addPick(x, y, see.r, mag, ref);
}
