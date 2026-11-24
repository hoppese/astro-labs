// render/sky.js: the atmosphere model. Two jobs:
//   1. the limiting magnitude (how faint a star can be drawn) from field of view, light pollution,
//      twilight/daylight and moonlight;
//   2. the sky background: a small image computed per pixel from Sun altitude, altitude of the
//      pixel and its distance from the Sun, then stretched over the window.
// This is a visual model tuned to look right, not a radiative-transfer calculation.

import { DEG, RAD, clamp, lerp, smooth, angleBetween } from '../astro.js';
import { state } from '../state.js';
import { cam, unproject } from '../camera.js';
import { densityLimit } from './density.js';

/** Naked-eye limiting magnitude at the zenith for Bortle classes 1..9. */
export const BORTLE_NELM = [0, 7.8, 7.3, 6.8, 6.3, 5.8, 5.3, 4.8, 4.3, 3.8];
export const BORTLE_NAMES = ['', 'Excellent dark site', 'Truly dark site', 'Rural sky', 'Rural/suburban transition', 'Suburban sky',
  'Bright suburban sky', 'Suburban/urban transition', 'City sky', 'Inner-city sky'];

/** Target number of stars per square centimetre of screen under a rural sky (Bortle 4). Tuned by eye. */
export const STARS_PER_CM2 = 1.3;

/** How many magnitudes zooming gains (a narrower field acts like a telescope). */
export function zoomGain(fov, night = 0) {
  if (fov >= 60) return -0.6 * (fov - 60) / 120;
  // Against a bright sky (day, twilight) a narrower field gains 2.5 log10 as before. Under a dark sky the gain is
  // twice that, which is steeper than the star counts need, so at night the crowding limit below is the one
  // that sets how many stars are drawn: the same number per square centimetre of screen at every zoom.
  const g = 2.5 * Math.log10(60 / fov);
  return Math.min(8, g) * (1 - night) + Math.min(16, 2 * g) * night;
}

/** Magnitudes lost to a bright sky, from the Sun's altitude in degrees. */
export function daylightLoss(sunAlt) {
  if (sunAlt <= -18) return 0;
  if (sunAlt <= -12) return lerp(0, 0.5, (sunAlt + 18) / 6);
  if (sunAlt <= -6) return lerp(0.5, 3.2, (sunAlt + 12) / 6);
  if (sunAlt <= 0) return lerp(3.2, 8.0, (sunAlt + 6) / 6);
  return lerp(8.0, 10.2, clamp(sunAlt / 12, 0, 1));
}

/** Fraction (0..1) of a disc of radius r1 covered by a disc of radius r2 whose centre is d away. */
export function discOverlap(r1, r2, d) {
  if (d >= r1 + r2) return 0;
  if (d <= Math.abs(r2 - r1)) return r2 >= r1 ? 1 : (r2 * r2) / (r1 * r1);
  const a = Math.acos(clamp((d * d + r1 * r1 - r2 * r2) / (2 * d * r1), -1, 1));
  const b = Math.acos(clamp((d * d + r2 * r2 - r1 * r1) / (2 * d * r2), -1, 1));
  const area = r1 * r1 * (a - Math.sin(2 * a) / 2) + r2 * r2 * (b - Math.sin(2 * b) / 2);
  return area / (Math.PI * r1 * r1);
}

/** Sky conditions for this frame. */
export function skyConditions(bodies) {
  const atmo = state.show.atmosphere;
  const sunAlt = Math.asin(bodies.sun.hor[2]) * RAD;
  const moon = bodies.moon, moonAlt = Math.asin(moon.hor[2]) * RAD;
  // without an atmosphere there is no scattered light at all: no daylight, no light pollution
  const nelm = atmo ? BORTLE_NELM[state.bortle] : BORTLE_NELM[1];
  // a solar eclipse dims the daylight: sunFrac = fraction of the Sun's disc left uncovered by the Moon
  const sunFrac = 1 - discOverlap(bodies.sun.angRadius, moon.angRadius, angleBetween(bodies.sun.u, moon.u));
  const eclipseGain = Math.min(6.5, -2.5 * Math.log10(sunFrac + 0.0025));          // magnitudes regained
  const dayLoss = atmo ? Math.max(0, daylightLoss(sunAlt) - eclipseGain * smooth(-6, 0, sunAlt)) : 0;
  const moonLoss = atmo ? 1.1 * Math.pow(moon.phaseFrac, 2) * smooth(-4, 15, moonAlt) * (1 - smooth(0, 6, dayLoss)) : 0;
  const base = nelm - dayLoss - moonLoss;
  // Two limits, and the fainter stars must pass both:
  //  physical  what this sky lets through, deeper as you zoom in (a narrower field acts like a telescope);
  //  crowding  the magnitude at which the screen holds a fixed number of stars per square centimetre, so a wide
  //            view shows only the bright stars and does not turn into a carpet. A darker sky is allowed a
  //            richer screen (x1.5 per magnitude of naked-eye limit, up to x1.22), so light pollution still shows at any zoom.
  // a short window (phone, small iframe) packs the same sky into fewer pixels: treat it as a wider field
  const physical = base + zoomGain(Math.min(180, cam.fov * clamp(Math.sqrt(760 / cam.h), 1, 1.8)), 1 - smooth(0.5, 3, dayLoss));
  const perCm2 = STARS_PER_CM2 * (state.starScale || 1) * Math.pow(1.5, clamp(base - 6.3, -4, 0.5));
  const crowd = densityLimit(perCm2);
  return {
    atmo, sunAlt, moonAlt, nelm, dayLoss, moonLoss, sunFrac,
    sunDim: 0.1 + 0.9 * Math.sqrt(sunFrac),         // how much of the daylight colour survives an eclipse
    base,                                           // naked-eye limit under this sky
    physical, crowd, perCm2,
    // 13.5 = a magnitude and a half past the end of the star catalogue: beyond that no fainter star can appear, and letting
    // the limit run on only made every field star swell (they are sized by how far they are above the limit) until a
    // magnitude-11 star outshone Jupiter's moons at high zoom
    limMag: Math.min(physical, crowd, 13.5),
    day: atmo ? smooth(-8, 4, sunAlt) * (0.1 + 0.9 * Math.sqrt(sunFrac)) : 0,          // 0 night .. 1 day (used for colours)
    twilight: atmo ? smooth(-18, -4, sunAlt) * (1 - smooth(0, 12, sunAlt)) : 0,
  };
}

// ---- background image ----------------------------------------------------------
const GW = 96, GH = 54;
let off = null, octx = null, img = null;

export function drawSkyBackground(ctx, sky, bodies) {
  if (!sky.atmo) { ctx.fillStyle = '#01030a'; ctx.fillRect(0, 0, cam.w, cam.h); return; }
  if (!off) {
    off = document.createElement('canvas'); off.width = GW; off.height = GH;
    octx = off.getContext('2d'); img = octx.createImageData(GW, GH);
  }
  const d = img.data, sun = bodies.sun.hor;
  const sunAlt = sky.sunAlt;
  const day = smooth(-9, 6, sunAlt) * sky.sunDim;      // overall brightness of the blue sky
  const dusk = smooth(-16, -3, sunAlt) * (1 - smooth(-1, 14, sunAlt));     // strength of the warm horizon glow
  const lp = (state.bortle - 1) / 8;
  // zenith and horizon colours for night, and for full day
  const zN = [3 + 16 * lp, 5 + 16 * lp, 12 + 18 * lp], hN = [9 + 78 * lp, 12 + 62 * lp, 22 + 46 * lp];
  const zD = [38, 96, 190], hD = [158, 196, 236];
  const zT = [14, 28, 68], hT = [46, 62, 104];         // deep twilight
  const tw = smooth(-18, -5, sunAlt) * (1 - day);
  for (let j = 0; j < GH; j++) {
    for (let i = 0; i < GW; i++) {
      const h = unproject((i + 0.5) / GW * cam.w, (j + 0.5) / GH * cam.h);
      const sinAlt = clamp(h[2], 0, 1);
      const hz = Math.pow(1 - sinAlt, 3);              // 1 at the horizon, 0 well above it
      const cosSun = h[0] * sun[0] + h[1] * sun[1] + h[2] * sun[2];
      const gamma = Math.acos(clamp(cosSun, -1, 1)) * RAD;
      const o = (j * GW + i) * 4;
      for (let c = 0; c < 3; c++) {
        let v = lerp(zN[c], hN[c], hz);
        v = lerp(v, lerp(zT[c], hT[c], hz), tw);
        v = lerp(v, lerp(zD[c], hD[c], hz), day);
        d[o + c] = v;
      }
      // warm glow hugging the horizon on the Sun's side at dusk and dawn
      const side = Math.exp(-gamma / 38) * hz * dusk;
      d[o] += 215 * side; d[o + 1] += 105 * side; d[o + 2] += 18 * side;
      // aureole round the Sun when it is up (or nearly)
      const glow = (Math.exp(-gamma / 7) * 0.9 + Math.exp(-gamma / 28) * 0.35) * smooth(-4, 3, sunAlt) * sky.sunDim;
      // capped so that the Sun's disc (and a planet in transit) still stands out against it when zoomed in
      const gl = Math.min(glow, 0.55);
      d[o] = Math.min(d[o] + 150 * gl, 214); d[o + 1] = Math.min(d[o + 1] + 140 * gl, 226); d[o + 2] = Math.min(d[o + 2] + 110 * gl, 244);
      d[o + 3] = 255;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'low';       // 'high' costs ~12 ms a frame on a 4K canvas
  ctx.drawImage(off, 0, 0, GW, GH, 0, 0, cam.w, cam.h);
}

/** Ground colour for the current light. */
export function groundColour(sky) {
  const d = sky.day, lp = sky.atmo ? (state.bortle - 1) / 8 : 0;
  const n = [9 + 10 * lp, 12 + 9 * lp, 11 + 8 * lp], dd = [58, 72, 48];
  const c = n.map((v, i) => Math.round(lerp(v, dd[i], d)));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
