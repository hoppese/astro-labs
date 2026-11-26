// render/grids.js: coordinate grids (alt-az, equatorial of date) and the single great circles
// (meridian, celestial equator, ecliptic). Line spacing adapts to the field of view and each
// line is labelled where it enters the screen.

import { DEG, RAD, mod, clamp, sph, toSph, mulMV, azAltToHor, horToAzAlt, unrefractHor } from '../astro.js';
import { state, eff } from '../state.js';
import { cam, centerHor, unproject } from '../camera.js';
import { R, projectPolyline, strokeStrips } from './proj.js';

const DEG_STEPS = [30, 20, 15, 10, 5, 2, 1, 1 / 2, 1 / 3, 1 / 6, 1 / 12, 1 / 30, 1 / 60, 1 / 120, 1 / 360, 1 / 720, 1 / 3600, 1 / 7200, 1 / 18000, 1 / 36000, 1 / 72000, 1 / 180000, 1 / 360000, 1 / 720000];
const HOUR_STEPS = [2, 1, 1 / 2, 1 / 3, 1 / 6, 1 / 12, 1 / 30, 1 / 60, 1 / 120, 1 / 360, 1 / 720, 1 / 3600, 1 / 7200, 1 / 18000, 1 / 36000, 1 / 72000, 1 / 180000, 1 / 360000, 1 / 720000, 1 / 1800000, 1 / 3600000].map((h) => h * 15);
const pick = (list, target) => list.find((s) => s <= target) || list[list.length - 1];
/** The smallest step in a (descending) list that is at least `target`: lines never closer than the target spacing. */
const pickUp = (list, target) => { for (let i = list.length - 1; i >= 0; i--) if (list[i] >= target - 1e-12) return list[i]; return list[0]; };
/** Wanted distance between neighbouring grid lines, in degrees at the centre of the view: about a dozen
 *  lines across the longer side of the window at most, and never closer than 100 px. */
const lineSpacingDeg = () => clamp(Math.max(cam.w, cam.h) / 11, 100, 190) / cam.pxPerDeg;

const INSET = { l: 8, t: 8, r: 8, b: 8 };       // set by renderer so labels clear the UI
export function setLabelInset(l, t, r, b) { INSET.l = l; INSET.t = t; INSET.r = r; INSET.b = b; }

/** Label a projected line where it crosses into the labelled area of the screen.
 *  prefer: 'tb' = top/bottom edges first (meridians), 'lr' = left/right first (parallels), '' = first crossing found.
 *  Keeping each family on its own pair of edges makes the labels read like the scales of a chart. */
function edgeLabel(strips, text, style, prio = 4, max = 1, { prefer = '', color = null } = {}) {
  const hw = Math.max(16, text.length * 3.3 + 5);          // half the label's width: keeps it wholly on screen
  const x0 = INSET.l + hw, y0 = INSET.t + 10, x1 = cam.w - INSET.r - hw, y1 = cam.h - INSET.b - 10;
  const inside = (x, y) => x > x0 && x < x1 && y > y0 && y < y1;
  let count = 0, low = null;
  const byEdge = [null, null, null, null];
  for (const s of strips) {
    for (let i = 0; i + 3 < s.length; i += 2) {
      const a = inside(s[i], s[i + 1]), b = inside(s[i + 2], s[i + 3]);
      if (a !== b) {
        const k = a ? i : i + 2;
        if (R.ground && unproject(s[k], s[k + 1])[2] < 0.01) continue;      // would sit on the ground
        // the exact point where the line leaves the labelled area (not the nearest vertex, which can be a
        // whole segment away and would make the label hop as vertices slide past the edge)
        const o = k === i ? i + 2 : i, px = s[k], py = s[k + 1], ox = s[o], oy = s[o + 1];
        let t = 1, edge = 0;
        if (oy > y1) { const u = (y1 - py) / (oy - py); if (u < t) { t = u; edge = 0; } }
        if (oy < y0) { const u = (y0 - py) / (oy - py); if (u < t) { t = u; edge = 1; } }
        if (ox < x0) { const u = (x0 - px) / (ox - px); if (u < t) { t = u; edge = 2; } }
        if (ox > x1) { const u = (x1 - px) / (ox - px); if (u < t) { t = u; edge = 3; } }
        const x = clamp(px + (ox - px) * t, x0, x1), y = clamp(py + (oy - py) * t, y0, y1);
        if (!prefer) {
          R.labels.add(x, y, text, style, prio, { anchor: 'center', color });
          if (++count >= max) return;
          continue;
        }
        // edge: 0 bottom, 1 top, 2 left, 3 right
        const rank = prefer === 'tb' ? [0, 1, 2, 3][edge] : [2, 3, 0, 1][edge];
        if (!byEdge[edge]) byEdge[edge] = { x, y, rank };
      }
    }
  }
  if (!prefer) return;
  // the preferred edge, plus one fallback at a lower priority (it survives only if nothing else wants the spot)
  const found = byEdge.filter(Boolean).sort((a, b) => a.rank - b.rank);
  if (found.length) {
    R.labels.add(found[0].x, found[0].y, text, style, prio, { anchor: 'center', color });
    if (found.length > 1 && found[0].rank > 1) R.labels.add(found[1].x, found[1].y, text, style, prio - 1, { anchor: 'center', color });
    return;
  }
  // a closed circle wholly on screen (a parallel round the pole, an almucantar round the zenith): label its lowest point
  for (const s of strips) for (let i = 0; i + 1 < s.length; i += 2) if (inside(s[i], s[i + 1]) && (!low || s[i + 1] > low[1])) low = [s[i], s[i + 1]];
  if (low && !(R.ground && unproject(low[0], low[1])[2] < 0.01)) R.labels.add(low[0], low[1] - 8, text, style, prio, { anchor: 'center', color });
}

const fmtDegLabel = (v, step, signed) => {
  const neg = v < -1e-9; const a = Math.abs(v);
  const sg = neg ? '−' : (signed && a > 1e-9 ? '+' : '');
  if (step >= 1 - 1e-9) return sg + Math.round(a) + '°';
  const dp = Math.max(0, Math.ceil(-Math.log10(step * 3600) - 1e-6)), k = 10 ** dp, n = Math.round(a * 3600 * k), r = n % (60 * k), t = (n - r) / (60 * k);      // r: seconds, in steps of 1/k
  return sg + Math.floor(t / 60) + '°' + String(t % 60).padStart(2, '0') + '′' + (step < 1 / 60 - 1e-9 ? (r / k).toFixed(dp).padStart(dp ? 3 + dp : 2, '0') + '″' : '');
};
const fmtHourLabel = (deg, step) => {
  const dp = Math.max(0, Math.ceil(-Math.log10(step * 240) - 1e-6)), k = 10 ** dp, n = Math.round(mod(deg, 360) * 240 * k) % (86400 * k), r = n % (60 * k), t = (n - r) / (60 * k), h = Math.floor(t / 60), m = t % 60;
  if (step >= 15 - 1e-9) return h + 'h';
  return h + 'h' + String(m).padStart(2, '0') + 'm' + (step < 0.25 - 1e-9 ? (r / k).toFixed(dp).padStart(dp ? 3 + dp : 2, '0') + 's' : '');
};

/** Generic lon/lat grid. toHor(lon, lat) gives a HOR unit vector; c = view centre {lon, lat} in the grid's frame. */
function drawGrid(ctx, toHor, c, { color, labelColor, refract, lonSteps, lonLabel, latLabel }) {
  const viewR = Math.acos(clamp(cam.zMin, -1, 1)) * RAD;
  const want = lineSpacingDeg();
  const latStep = pickUp(DEG_STEPS, want);
  const poleInView = Math.abs(c.lat) + viewR >= 89.5;
  const whole = viewR > 55 || poleInView && viewR > 30;
  let lat0 = -90, lat1 = 90, lon0 = 0, lonSpan = 360;
  if (!whole) { lat0 = Math.max(-90, c.lat - viewR); lat1 = Math.min(90, c.lat + viewR); }
  const cosEdge = Math.cos(Math.min(89.9, Math.max(Math.abs(lat0), Math.abs(lat1), Math.abs(c.lat))) * DEG);
  // Meridians: judged where they are farthest apart on screen, i.e. at the edge of the view on the equator side.
  // With the pole itself in view they form a fan; a little wider spacing keeps the fan to about two dozen spokes.
  const halfDiag = 2 * Math.atan(Math.hypot(cam.w, cam.h) / 2 / cam.s / 2) * RAD;
  const edgeLat = Math.max(0, Math.abs(c.lat) - halfDiag);
  let lonStep = pickUp(lonSteps, (poleInView ? 1.5 : 1) * want / Math.max(Math.cos(edgeLat * DEG), 1e-9));
  if (!whole && !poleInView) {
    lonSpan = Math.min(360, 2 * viewR / Math.max(cosEdge, 0.01));
    lon0 = c.lon - lonSpan / 2;
  }
  // keep the line count bounded near the poles
  while (lonSpan / lonStep > 72 && lonStep < 30) lonStep = lonSteps[Math.max(0, lonSteps.indexOf(lonStep) - 1)];
  ctx.strokeStyle = color; ctx.lineWidth = 1;
  const maxStep = Math.max(cam.fov / 10, 1e-3);
  // parallels
  const all = [];
  const nSeg = 96;
  for (let lat = Math.ceil((lat0 + 1e-9) / latStep) * latStep; lat <= lat1 - 1e-9; lat += latStep) {
    if (Math.abs(lat) > 90 - 1e-6) continue;
    const pts = new Float64Array((nSeg + 1) * 3);
    for (let i = 0; i <= nSeg; i++) pts.set(toHor(lon0 + lonSpan * i / nSeg, lat), 3 * i);
    const strips = projectPolyline(pts, 1e9, refract);
    all.push(...strips);
    edgeLabel(strips, latLabel(lat, latStep), 'grid', 4, 1, { prefer: 'lr', color: labelColor });
  }
  // meridians
  const first = Math.ceil((lon0 - 1e-9) / lonStep) * lonStep;
  const latSpan = lat1 - lat0, mSeg = Math.max(8, Math.min(90, Math.ceil(latSpan / Math.max(maxStep, latSpan / 90))));
  for (let k = 0; first + k * lonStep < lon0 + lonSpan - 1e-9; k++) {
    const lon = first + k * lonStep;
    // away from the pole, thin out the meridians that would crowd together there
    // Each meridian belongs to the coarsest family (every 90 deg, every 2 h, every 1 h, ...) it is a member of, and
    // is drawn toward the pole only as far as that family's lines stay a readable distance apart. So the fan
    // thins out in stages instead of piling up into a knot at the pole.
    let fam = lonStep;
    for (const g of [90, ...lonSteps]) { if (g < lonStep - 1e-9) break; const tol = Math.min(1e-5, lonStep * 0.01), m = mod(lon, g); if (m < tol || g - m < tol) { fam = g; break; } }
    // ... and each stage ends on a parallel, not in mid-air
    const top = fam >= 90 ? 90 : Math.min(90 - latStep, Math.ceil(Math.acos(Math.min(1, want / 3 / fam)) * RAD / latStep - 1e-9) * latStep);
    const a = Math.max(lat0, -top), b = Math.min(lat1, top);
    if (b <= a) continue;
    const pts = new Float64Array((mSeg + 1) * 3);
    for (let i = 0; i <= mSeg; i++) pts.set(toHor(lon, a + (b - a) * i / mSeg), 3 * i);
    const strips = projectPolyline(pts, maxStep, refract);
    all.push(...strips);
    edgeLabel(strips, lonLabel(lon, lonStep), 'grid', 4, 1, { prefer: 'tb', color: labelColor });
  }
  strokeStrips(ctx, all);
}

export function drawGrids(ctx) {
  const f = R.frame, sh = state.show;
  const cHor = centerHor();
  if (sh.eqGrid) {
    const c = toSph(mulMV(f.Mhd, R.refr ? unrefractHor(cHor) : cHor));
    drawGrid(ctx, (lon, lat) => mulMV(f.Mdh, sph(lon, lat)), c, {
      color: 'rgba(96,150,255,0.36)', labelColor: '#8fb2f2', refract: true, lonSteps: HOUR_STEPS,
      lonLabel: (v, st) => fmtHourLabel(v, st), latLabel: (v, st) => fmtDegLabel(v, st, true),
    });
  }
  if (sh.azGrid && !eff.space) {
    const a = horToAzAlt(cHor);
    drawGrid(ctx, (lon, lat) => azAltToHor(lon, lat), { lon: a.az, lat: a.alt }, {
      color: 'rgba(110,205,150,0.30)', labelColor: '#86cfa2', refract: false, lonSteps: DEG_STEPS,
      lonLabel: (v, st) => fmtDegLabel(mod(v, 360), st, false), latLabel: (v, st) => fmtDegLabel(v, st, true),
    });
  }
  const circle = (toHor, color, name, refract) => {
    const n = 180, pts = new Float64Array((n + 1) * 3);
    for (let i = 0; i <= n; i++) pts.set(toHor(i * 360 / n), 3 * i);
    const strips = projectPolyline(pts, Math.max(cam.fov / 10, 1e-3), refract);
    ctx.strokeStyle = color; ctx.lineWidth = 1.3;
    strokeStrips(ctx, strips);
    edgeLabel(strips, name, 'grid', 6, 1);
  };
  if (sh.equator) circle((l) => mulMV(f.Mdh, sph(l, 0)), 'rgba(110,170,255,0.62)', 'Celestial equator', true);
  if (sh.ecliptic) {
    // true ecliptic of date (it precesses with the equinox; longitude 0 is the equinox of date)
    circle((l) => mulMV(f.Mjh, mulMV(f.Mtj, sph(l, 0))), 'rgba(240,190,80,0.6)', 'Ecliptic', true);
  }
  if (sh.meridian && !eff.space) circle((l) => { const a = l * DEG; return [Math.cos(a), 0, Math.sin(a)]; }, 'rgba(120,220,160,0.58)', 'Meridian', false);
}
