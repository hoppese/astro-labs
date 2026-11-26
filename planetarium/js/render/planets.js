// render/planets.js: Sun, Moon, planets, their moons and the small bodies. Far from the eyepiece they are points sized by magnitude; once the
// disc is a few pixels across it is drawn to scale from its published map on its true figure (render/globe.js), turned and lit as it really is.
// Where no picture exists, or WebGL is missing, a plain disc with the right phase stands in (and the object panel says so).

import { air } from '../air.js';
import { DEG, RAD, AU_KM, refractHor, mulMV, unit, dot, cross, airmass, clamp, smooth, scale as vscale, len } from '../astro.js';
import { state, eff, emit } from '../state.js';
import { cam, projectHor } from '../camera.js';
import { addPick } from '../picks.js';
import { R } from './proj.js';
import { repaintSky } from './sky.js';
import { drawStarPoint, starSize, starSprite } from './stars.js';
import { BODY_ART } from '../bodydata.js';
import { bodyAxes, toBody, subPoint, figure, spinRate, grsEast, GRS_MAP_EAST } from '../orient.js';
import { drawGlobe, pickMap, getTex, photo, globesWork, pumpTextures } from './globe.js';
import { running } from '../labs/hidden.js';
import { moonLight } from '../labs/shadow.js';
import { moonFade } from '../steady.js';
import { sun, initSun, groupsAt, tileFor, centralMeridian } from '../sunspots.js';

const POINT_BV = { Mercury: 0.9, Venus: 0.65, Mars: 1.5, Jupiter: 0.8, Saturn: 1.0, Uranus: 0.25, Neptune: 0.1 };
// Saturn's ring radii in km (inner C, inner B, outer B, inner A, outer A)
const RING = { c0: 74658, b0: 92000, b1: 117580, a0: 122170, a1: 136775 };
const p = [0, 0], q = [0, 0];

/** Screen position, local scale (px per degree) and apparent altitude for a true HOR vector. */
function place(horTrue) {
  const h = R.refr ? refractHor(horTrue) : horTrue;
  const V = cam.V, vz = V[6] * h[0] + V[7] * h[1] + V[8] * h[2];
  // A disc can cross the screen while its centre is far outside the view cone (zoomed in on the Sun's or
  // Moon's limb), so do not use projectHor()'s cone test here: only reject what is behind the viewer.
  if (vz < -0.2) return null;
  const k = 2 * cam.s / (1 + vz);
  p[0] = cam.cx + k * (V[0] * h[0] + V[1] * h[1] + V[2] * h[2]);
  p[1] = cam.cy - k * (V[3] * h[0] + V[4] * h[1] + V[5] * h[2]);
  return { x: p[0], y: p[1], scale: cam.s * 2 / (1 + vz) * DEG, alt: Math.asin(clamp(h[2], -1, 1)) * RAD };
}
/** Screen angle (canvas radians) from a body toward another EQJ direction (the Sun, a pole). */
function screenAngleToward(b, towardEqj, x, y) {
  const u = b.u, d = dot(u, towardEqj);
  const perp = unit([towardEqj[0] - d * u[0], towardEqj[1] - d * u[1], towardEqj[2] - d * u[2]]);
  const eps = Math.max(2e-5, Math.min(0.02, 8 / cam.pxPerDeg * DEG));     // about 8 px on screen
  const v = unit([u[0] + eps * perp[0], u[1] + eps * perp[1], u[2] + eps * perp[2]]);
  const h = mulMV(R.frame.Mjh, v);
  if (!projectHor(R.refr ? refractHor(h) : h, q)) return 0;
  return Math.atan2(q[1] - y, q[0] - x);
}

/** A disc lit from screen angle `sunAng`, with phase angle i (0 = full, 180 = new). */
export function drawPhaseDisc(ctx, x, y, r, sunAng, phaseAngle, lit, dark, darkAlpha = 1) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(sunAng);
  if (darkAlpha > 0.01) { ctx.globalAlpha = darkAlpha; ctx.fillStyle = dark; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1; }
  const c = Math.cos(phaseAngle * DEG);
  ctx.fillStyle = lit;
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);                                     // sunward limb
  ctx.ellipse(0, 0, Math.max(0.01, r * Math.abs(c)), r, 0, Math.PI / 2, -Math.PI / 2, c < 0);  // terminator
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---- drawing a body from its map -----------------------------------------------------------------
let dpr = 1;
const sRate = { t: 0, ms: 16 };                 // real milliseconds per frame, smoothed
/** Colour left by the air at this altitude (display units): 1, 1, 1 without atmosphere. */
function airTint(alt) {
  if (!R.atmo) return [1, 1, 1];
  const X = Math.min(airmass(Math.max(alt, 0)), 38) - 1, f = (k) => Math.max(0.12, Math.pow(10, -0.4 * k * X * 0.4545 * 0.3)), t = air().tint;
  return [f(t[0]), f(t[1]), f(t[2])];
}
const j0 = [0, 0], j1 = [0, 0];
/** Inverse of the local map (east, north) -> (screen right, screen up), scaled so that without refraction it is a pure rotation: [rightE, rightN, upE, upN]. */
function skyJacobian(u, E, N, x, y) {
  const eps = Math.max(2e-6, Math.min(0.01, 8 / cam.pxPerDeg * DEG)), M = R.frame.Mjh;
  const at = (d, k, out) => { const v = unit([u[0] + k * d[0], u[1] + k * d[1], u[2] + k * d[2]]), h = mulMV(M, v); return projectHor(R.refr ? refractHor(h) : h, out); };
  const col = (d) => (at(d, eps, j0) && at(d, -eps, j1) ? [(j0[0] - j1[0]) / (2 * eps), -(j0[1] - j1[1]) / (2 * eps)] : null);
  const e = col(E), n = col(N); if (!e || !n) return [1, 0, 0, 1];
  const h = mulMV(M, u), a = R.refr ? refractHor(h) : h, V = cam.V, sc = 2 * cam.s / (1 + V[6] * a[0] + V[7] * a[1] + V[8] * a[2]);
  const D = e[0] * n[1] - e[1] * n[0];
  return [sc * n[1] / D, -sc * e[1] / D, -sc * n[0] / D, sc * e[0] / D];
}
/** The same squash as a canvas transform about a point: ideal (unrefracted) offsets -> screen offsets. Used by the Earth's shadow on the Moon. */
export function squashMatrix(u, x, y) {
  const E = unit(cross([0, 0, 1], u)), N = cross(u, E), J = skyJacobian(u, E, N, x, y);
  // J maps screen (right, up) to (E, N); its symmetric part after removing the rotation is the inverse of the squash
  const D = J[0] * J[3] - J[1] * J[2], F = [J[3] / D, -J[2] / D, -J[1] / D, J[0] / D];      // (E, N) -> (right, up): [rE, rN, uE, uN]
  const t = Math.atan2(F[2] - F[1], F[0] + F[3]), c = Math.cos(t), s = Math.sin(t);
  // S = F * rotation(-t)
  const S = [F[0] * c - F[1] * s, F[0] * s + F[1] * c, F[2] * c - F[3] * s, F[2] * s + F[3] * c];
  return [S[0], -S[2], -S[1], S[3]];      // canvas a, b, c, d (y down)
}
/** The body's axes as seen on the screen, in its own frame. */
function viewAxes(b, ax, x, y) {
  const u = b.u, E = unit(cross([0, 0, 1], u)), N = cross(u, E), back = [-u[0], -u[1], -u[2]];
  // How the sky's east and north lie on the screen here, refraction included: low down it presses everything together vertically (17 % at the
  // horizon), the discs as much as the gaps between them. So `right` and `up` are the sky directions that one screen unit spans, not unit vectors.
  const J = skyJacobian(u, E, N, x, y), mix = (a, e) => [a * E[0] + e * N[0], a * E[1] + e * N[1], a * E[2] + e * N[2]];
  const right = mix(J[0], J[1]), up = mix(J[2], J[3]);
  if (!ax) {
    const al = screenAngleToward(b, [0, 0, 1], x, y), c = Math.cos(al), s = Math.sin(al), r0 = mix(s, c), u0 = mix(c, -s);
    return { R: [dot(right, r0), 0, dot(right, u0)], U: [dot(up, r0), 0, dot(up, u0)], V: [0, -1, 0], map: (v) => [dot(v, r0), -dot(v, back), dot(v, u0)] };
  }
  return { R: toBody(ax, right), U: toBody(ax, up), V: toBody(ax, back), map: (v) => toBody(ax, v) };
}
const hex = (c) => [1, 3, 5].map((k) => Math.pow(parseInt(c.slice(k, k + 2), 16) / 255, 2.2));
export const artFor = (id) => BODY_ART[id] || null;
/** Draw body b (a list entry of ephem.js) with equatorial radius r px from its map or photograph. Returns the drawn radius, or 0 if it cannot be. */
function drawFromMap(ctx, b, pl, r, extra = {}) {
  const art = BODY_ART[b.id];
  if (art && art.kind === 'photo') {
    const p = photo(art.tex); if (!p) return 0;
    const f = figure(b.id), k = art.scale || (f ? f[0] / b.radiusKm : 1), d = 2 * r * k;
    ctx.save(); ctx.globalAlpha = Math.max(0.05, b.light ?? 1) * (1 - 0.7 * R.sky.day); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(p, pl.x - d / 2, pl.y - d / 2, d, d); ctx.restore();
    return r * k;
  }
  if (!globesWork()) return 0;
  const map = art ? pickMap(extra.tex ? { ...art, tex: extra.tex } : art, r * dpr) : null;
  if (art && !map && extra.needMap) return 0;
  const tt = b.ttSeen ?? R.frame.time.tt, ax = art && art.kind === 'front' ? null : bodyAxes(b.id, tt), va = viewAxes(b, ax, pl.x, pl.y);
  const fig = (ax && figure(b.id)) || b.fig || null, ratio = fig ? [1, fig[1] / fig[0], fig[2] / fig[0]] : [1, 1, 1];
  const rr = fig ? r * fig[0] / b.radiusKm : r;
  const S = va.map(b.toSun ? unit(b.toSun) : [-b.u[0], -b.u[1], -b.u[2]]);
  const spin = state.playing ? Math.abs(spinRate(b.id) * state.rate * sRate.ms / 1000) / 360 : 0;       // turns per frame
  const o = { x: pl.x, y: pl.y, r: rr, R: va.R, U: va.U, V: va.V, S, ax: ratio, map, light: art ? art.light : 'lunar', kind: art ? art.kind : 'map', graphic: art && art.graphic,
    gain: art ? art.gain : 1, sky: R.sky, body: art ? [0.5, 0.48, 0.45] : hex(b.color || '#8a8580'), tint: airTint(pl.alt), day: R.sky.day, spin: spin > 0.03 ? spin : 0, ...extra };
  if (b.id === 'Jupiter' && map) o.lonOff = -(grsEast(tt) - GRS_MAP_EAST) / 360;
  if (b.moons && b.moons.length && b.toSun && r > 3) {
    const km = b.radiusKm / AU_KM, dSun = len(b.toSun);
    o.alphaSun = 695700 / AU_KM / dSun;
    // only moons on the sunward side whose shadow can reach the globe or, at Saturn, the rings
    const list = [], ringed = b.id === 'Saturn' && Math.abs(S[2]) > 1e-4;
    for (const m of b.moons) {
      if (moonFade(m.periodDays, sRate.ms) < 0.5) continue;
      const p = vscale(va.map(m.rel), 1 / km), h = dot(p, S), w = m.radiusKm / b.radiusKm;
      let hit = h > 0 && len([p[0] - h * S[0], p[1] - h * S[1], p[2] - h * S[2]]) < 1.1;
      if (!hit && ringed) { const t = p[2] / S[2]; hit = t > 0 && Math.abs(Math.hypot(p[0] - t * S[0], p[1] - t * S[1]) - 1.75) < 0.55 + Math.min(1, (w + t * o.alphaSun) / Math.abs(S[2])); }
      if (hit) list.push([p[0], p[1], p[2], w]);
    }
    list.sort((p, q) => q[3] - p[3]);
    o.minShadow = Math.min(1.3, rr / 18);
    o.shadows = list;
  }
  if (b.mutual && r > 1.5) { const km = b.radiusKm / AU_KM; o.alphaSun = 695700 / AU_KM / len(b.toSun); o.shadows = b.mutual.map((m) => { const p = vscale(va.map(m.rel), 1 / km); return [p[0], p[1], p[2], m.km / b.radiusKm]; }); }
  if (b.id === 'Saturn') { const ring = getTex('rings.png', { nomip: true, wrap: false }); if (ring) { o.rings = ring; o.reach = RING.a1 / b.radiusKm; } }
  if (!drawGlobe(ctx, o, dpr, cam.w, cam.h)) return 0;
  return b.id === 'Saturn' && o.rings ? rr * o.reach : rr;
}

// ---- sunspots --------------------------------------------------------------------------------------
const spotData = new Float32Array(640), slides = { tt: null, prev: null, at: 0 };
const SLIDE_MS = 420, FADE = 160;
/** The groups on the disc, ready for the shader. When time runs so fast that the Sun turns more than a twentieth of a rotation a frame, single frames would
 *  flicker: the spots are then shown as a slow series of stills (each the Sun of one date, cross-faded), a whole number of solar rotations apart if that is possible. */
function sunSpots(b, r) {
  if (r < 14) return null;
  if (!sun.tiles) { initSun(); return null; }
  const tex = getTex('sun/spots.webp', { wrap: false }); if (!tex) return null;
  const now = performance.now(), tt = b.ttSeen ?? R.frame.time.tt, perFrame = state.playing ? Math.abs(state.rate) * sRate.ms / 86400000 : 0;
  const sets = [];
  if (perFrame < 1.3) { slides.tt = null; sets.push([tt, 1]); }
  else {
    if (slides.tt === null || now - slides.at > SLIDE_MS || Math.abs(slides.tt - tt) > perFrame * 400) { slides.prev = slides.tt; slides.at = now; const s = Math.sign(state.rate); slides.tt = slides.tt === null || Math.abs(slides.tt - tt) > perFrame * 400 ? tt : slides.tt + s * Math.max(27.2753, Math.round(Math.abs(tt - slides.tt) / 27.2753) * 27.2753); }
    const u = clamp((now - slides.at) / FADE, 0, 1); if (slides.prev !== null && u < 1) sets.push([slides.prev, 1 - u]); sets.push([slides.tt, slides.prev === null ? 1 : u]);
    emit('render');
  }
  let n = 0; const T = sun.tiles, ax0 = bodyAxes('Sun', tt);
  for (const [t, w] of sets) {
    const { list } = groupsAt(t); if (!list) continue;
    // in a still the disc keeps its own face: longitudes are carried over to the present orientation
    const sub = (a) => subPoint(a, [-b.u[0], -b.u[1], -b.u[2]]).lon, dl = t === tt ? 0 : sub(ax0) - centralMeridian(t), c = sub(ax0), la = subPoint(ax0, [-b.u[0], -b.u[1], -b.u[2]]).lat;
    const L = list.filter((g) => Math.sin(g.lat * DEG) * Math.sin(la * DEG) + Math.cos(g.lat * DEG) * Math.cos(la * DEG) * Math.cos((g.lon + dl - c) * DEG) > -0.08).sort((p, q) => q.area - p.area);
    for (const g of L) {
      if (n >= 40) break;
      const k = tileFor(g), m = T.tiles[k.i], lo = (g.lon + dl) * DEG, cb = Math.cos(g.lat * DEG), o = 16 * n++;
      spotData[o] = cb * Math.cos(lo); spotData[o + 1] = cb * Math.sin(lo); spotData[o + 2] = Math.sin(g.lat * DEG); spotData[o + 3] = w * clamp(g.area / 4, 0, 1);
      spotData.set([m[0], m[1], m[2], m[3], m[4], m[5], RAD / T.dpp / k.scale, k.flip, Math.cos(k.rot), Math.sin(k.rot), 0, 0], o + 4);
    }
  }
  return { tex, data: spotData, n, w: T.w, h: T.h };
}
let glareLast = null;
function drawSun(ctx, b, pl, rpx) {
  const r = Math.max(rpx, 5);
  const day = R.sky.day;
  const frac = R.sky.sunFrac;                            // a covered Sun has no glare
  const gr = Math.max(r * 3.2, 34);
  const soft = clamp(14 / r, 0, 1) * Math.sqrt(frac);    // glare at wide fields; none once zoomed in, as through a solar filter
  // the glare is light scattered in our own air and eye: it lies over everything, the dark Moon included, so it is drawn last
  glareLast = soft > 0.02 ? () => {
    const g = ctx.createRadialGradient(pl.x, pl.y, r * 0.9, pl.x, pl.y, gr);
    g.addColorStop(0, `rgba(255,244,214,${(0.55 + 0.2 * day) * soft})`); g.addColorStop(0.35, `rgba(255,226,170,${0.16 * soft})`); g.addColorStop(1, 'rgba(255,220,160,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, gr, 0, 2 * Math.PI); ctx.fill();
  } : null;
  if (frac < 0.004) drawCorona(ctx, b, pl, r, 1 - frac / 0.004);
  const quiet = !state.show.sunspots || !!running.id;    // labs time the limbs of real planets: no unrelated spots on the disc
  const air = airTint(pl.alt), glare = 1 + (1.2 + 0.8 * day) * clamp((46 - r) / 32, 0, 1);      // reddened, never dimmed below the sky; dazzling when small
  if (r >= 8 && drawFromMap(ctx, b, pl, r, { spots: quiet ? null : sunSpots(b, r), day: 0, body: [1.06 * glare, 0.95 * glare, 0.68 * glare], tint: [1, air[1] / air[0], air[2] / air[0]], gain: 1, spin: 0 })) return r;
  // redden toward the horizon when there is an atmosphere
  const low = R.atmo ? clamp(1 - pl.alt / 12, 0, 1) : 0;
  const core = `rgb(255,${Math.round(250 - 70 * low)},${Math.round(232 - 150 * low)})`;
  const dg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, r);
  dg.addColorStop(0, '#fffdf4'); dg.addColorStop(0.75, core); dg.addColorStop(1, `rgb(255,${Math.round(226 - 80 * low)},${Math.round(170 - 120 * low)})`);
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(pl.x, pl.y, r, 0, 2 * Math.PI); ctx.fill();
  return r;
}
/** Total eclipses only: the corona, from one photograph (see NOTES.md); its shape is that of its own date. */
function drawCorona(ctx, b, pl, r, a) {
  const p = photo('corona'); if (!p) return;
  const north = screenAngleToward(b, [0, 0, 1], pl.x, pl.y);
  const d = r * CORONA_WIDTH;
  ctx.save(); ctx.translate(pl.x, pl.y); ctx.rotate(north + Math.PI / 2); ctx.globalAlpha = clamp(a, 0, 1); ctx.globalCompositeOperation = 'screen';
  ctx.imageSmoothingQuality = 'high'; ctx.drawImage(p, -d / 2, -d / 2, d, d); ctx.restore();
}
const CORONA_WIDTH = 4.4;                                  // the picture's width in solar radii

function drawMoon(ctx, b, pl, rpx, sunU) {
  const r = Math.max(rpx, 5);
  // soft glow scaled by how much of the disc is lit
  const gr = r + 10 + 14 * b.phaseFrac, inShadow = moonLight(R.frame, b);      // eclipsed: no glow left
  const g = ctx.createRadialGradient(pl.x, pl.y, r, pl.x, pl.y, gr);
  g.addColorStop(0, `rgba(225,230,240,${0.20 * inShadow * b.phaseFrac * (R.atmo ? 1 - smooth(-9, -2, R.sky.sunAlt) : 1)})`); g.addColorStop(1, 'rgba(225,230,240,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, gr, 0, 2 * Math.PI); ctx.fill();
  // the unlit part: faint earthshine at night, lost in the blue by day
  // ... except in front of the Sun, where the dark Moon is what makes the eclipse
  const sun = R.bodies.sun;
  const onSun = Math.acos(clamp(dot(b.u, sun.u), -1, 1)) * RAD < (sun.angRadius + b.angRadius) * 1.05;
  // earthshine: the Earth seen from the Moon has the opposite phase
  const es = 0.022 * Math.pow(1 - b.phaseFrac, 1.5) * (R.atmo ? 1 - smooth(-11, -4, R.sky.sunAlt) : 1);      // lost in any bright sky, an eclipsed one included
  const relief = r > 24 ? getTex('moon-n.webp') : null;
  if (drawFromMap(ctx, b, pl, r, { needMap: true, relief, amb: [0.86 * es, 0.95 * es, 1.12 * es], day: R.sky.day, spin: 0 })) return r;
  const ang = screenAngleToward(b, sunU, pl.x, pl.y);
  drawPhaseDisc(ctx, pl.x, pl.y, r, ang, b.phaseAngle, '#d6d4cd', onSun ? '#0b0e15' : '#1b212b', onSun ? 1 : 1 - 0.9 * R.sky.day);
  return r;
}

export function drawBodies(ctx) {
  glareLast = null;
  const { bodies, sky, labels } = R;
  dpr = ctx.getTransform().a || 1;
  { const n = performance.now(), d = n - sRate.t; sRate.t = n; if (d > 2 && d < 200) sRate.ms += (d - sRate.ms) * 0.1; }
  pumpTextures();
  const lim = sky.limMag, sunU = bodies.sun.u;
  const order = bodies.list.slice().sort((a, b) => b.dist - a.dist);
  for (const b of order) {
    const pl = place(b.hor);
    if (!pl) continue;
    const rpx = b.angRadius * pl.scale;
    if (R.ground && pl.alt < -b.angRadius - 0.05) continue;
    const reach = Math.max(rpx * 3, 60) + (b.moons.length ? Math.max(...b.moons.map((m) => m.sepDeg)) * 1.05 * pl.scale : 0);
    if (pl.x < -reach || pl.x > cam.w + reach || pl.y < -reach || pl.y > cam.h + reach) continue;
    const ext = R.atmo ? air().k * (airmass(pl.alt) - 1) : 0;
    const mag = b.mag + ext;
    let drawnR = 0, visible = true;
    const moonsBehind = [], moonsFront = [];
    for (const m of b.moons) (m.behind ? moonsBehind : moonsFront).push(m);
    if (b.moons.length > 1) { const far = (a, c) => c.dist - a.dist; moonsBehind.sort(far); moonsFront.sort(far); }      // one moon in front of another covers it

    if (b.kind !== 'sun' && b.kind !== 'moon') for (const m of moonsBehind) drawMoonOf(ctx, b, m, pl, rpx, lim, ext);
    if (b.kind === 'sun') drawnR = drawSun(ctx, b, pl, rpx);
    else if (b.kind === 'moon') drawnR = drawMoon(ctx, b, pl, rpx, sunU);
    else {
      const dm = lim - mag;
      const resolved = rpx >= 1.6;
      // in transit across the Sun the planet is a black dot, however small
      const sun = bodies.sun;
      const onSun = b.dist < sun.dist && Math.acos(clamp(dot(b.u, sunU), -1, 1)) * RAD < sun.angRadius + b.angRadius;
      if (onSun) {
        drawnR = Math.max(rpx, 0.9);
        ctx.save(); ctx.beginPath(); ctx.arc(pl.x, pl.y, drawnR, 0, 2 * Math.PI); ctx.clip(); repaintSky(ctx, sky); ctx.restore();      // dark: what we see there is our own sky
        if (nearSide(b) < 1) darkOutline(ctx, pl, rpx, 1 - nearSide(b));      // the same before, at and after the contacts: nothing but the edges themselves gives the instant away
      // beside the Sun its dark side faces us (the sunlit part left is a hair): no star-like glow, and a faint outline so that its way to the Sun's edge can be followed
      } else if (nearSide(b) < 1) drawnR = drawDarkSide(ctx, b, pl, rpx, dm, resolved);
      else if (dm <= 0 && !resolved) visible = false;
      else {
        // a point of light that shrinks into the disc as the disc outgrows it
        if (dm > 0) { const ss = starSize(dm), k = resolved ? 1 - smooth(0.45, 1.1, rpx / ss) : 1; if (k > 0.02) drawnR = drawPointFaded(ctx, pl.x, pl.y, dm, POINT_BV[b.id] ?? 0.7, k); }
        if (resolved) {
          const d = drawFromMap(ctx, b, pl, rpx);
          if (d) drawnR = Math.max(drawnR, d);
          else { drawPhaseDisc(ctx, pl.x, pl.y, rpx, screenAngleToward(b, b.toSun ? unit(b.toSun) : sunU, pl.x, pl.y), b.phaseAngle, b.color, '#14181f', 1); drawnR = Math.max(drawnR, rpx); }
        }
      }
    }
    if (b.moons.length) for (const m of moonsFront) drawMoonOf(ctx, b, m, pl, rpx, lim, ext);
    if (!visible) continue;
    addPick(pl.x, pl.y, Math.max(drawnR, 4), b.mag, { kind: 'body', id: b.id });
    // no star or deep-sky label on the face of the Sun or Moon (the stars behind are hidden; their names were not)
    if ((b.kind === 'sun' || b.kind === 'moon') && drawnR >= 10) labels.blockDisc(pl.x, pl.y, drawnR, ['star', 'starDim', 'dso']);
    else if (b.moons.length && rpx >= 6) labels.blockDisc(pl.x, pl.y, rpx, ['moon']);      // nor a moon's name on its planet
    if (state.show.planetNames) labels.add(pl.x, pl.y, b.name, 'planet', state.selected && state.selected.kind === 'body' && state.selected.id === b.id ? 200 : 120 - b.mag * 0.5, { gap: Math.min(drawnR, 600) + 6 });
  }
  if (glareLast) glareLast();
}

/** 0: Mercury or Venus within about 1.5 degrees of passing between us and the Sun; 1: ordinary. */
const nearSide = (b) => (b.dist < R.bodies.sun.dist && (b.id === 'Venus' || b.id === 'Mercury') ? smooth(0.0015, 0.005, b.phaseFrac) : 1);
function darkOutline(ctx, pl, rpx, a) { ctx.strokeStyle = `rgba(150,168,192,${0.6 * a})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(pl.x, pl.y, Math.max(rpx, 2), 0, 2 * Math.PI); ctx.stroke(); }
function drawDarkSide(ctx, b, pl, rpx, dm, resolved) {
  const k = nearSide(b); let r = 0;
  if (dm > 0 && k > 0.02) r = drawPointFaded(ctx, pl.x, pl.y, dm, POINT_BV[b.id] ?? 0.7, k * (resolved ? 1 - smooth(0.45, 1.1, rpx / starSize(dm)) : 1));
  if (resolved) { const d = drawFromMap(ctx, b, pl, rpx); if (!d) drawPhaseDisc(ctx, pl.x, pl.y, rpx, 0, 180, '#14181f', '#14181f', 1); }
  darkOutline(ctx, pl, rpx, 1 - k);
  return Math.max(r, rpx, 2);
}
function drawPointFaded(ctx, x, y, dm, bv, k) {
  if (k >= 0.999) return drawStarPoint(ctx, x, y, dm, bv);
  ctx.save(); ctx.beginPath(); const r = starSize(dm), half = r / 0.34; ctx.globalAlpha = k; ctx.drawImage(starSprite(bv), x - half, y - half, 2 * half, 2 * half); ctx.restore();
  return r;
}
/** A moon in front of a disc, too small to show its own: an opaque dot in its own light, never under 3 px across, with a thin dark edge so that it can be told
 *  from the clouds behind it and followed across. (An unresolved moon has no other honest picture: the object panel says the mark is larger than the moon.) */
const MARK_R = 1.6;
function drawMark(ctx, x, y, r, colour, light, alpha) {
  const c = [1, 3, 5].map((k) => Math.round(parseInt(colour.slice(k, k + 2), 16) * (0.15 + 0.85 * light)));
  ctx.save(); ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(20,12,4,0.72)'; ctx.beginPath(); ctx.arc(x, y, r + 0.9, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = `rgb(${c})`; ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI); ctx.fill();
  ctx.restore();
}
function drawMoonOf(ctx, parent, m, ppl, prpx, lim, ext) {
  const fade = moonFade(m.periodDays, sRate.ms); if (fade < 0.02) return;
  if (m.light <= 0.002) return;                             // deep in the planet's shadow
  const pl = place(m.hor);
  if (!pl) return;
  const sepPx = Math.hypot(pl.x - ppl.x, pl.y - ppl.y);
  const rpx = m.angRadius * pl.scale;
  const dIn = m.inLimb * prpx;                              // px inside the limb (flattened as it is); negative outside
  const bigDisc = prpx >= 5;                                // the planet shows a disc: which side of it a moon is on can be seen
  if (!bigDisc && sepPx < 5) return;                        // all one point of light
  if (m.behind && dIn > 0 && (rpx >= 1.6 ? m.occFrac <= 0 : m.occulted)) return;      // hidden by the disc (a part still showing is covered by the disc drawn after it)
  const over = m.behind ? 0 : smooth(-1.5, 1.5, dIn + (rpx >= 1.6 ? rpx : 0));          // 1: in front of the disc
  const dm = lim - (m.mag + ext);
  if (dm <= 0 && rpx < 1.6 && over <= 0) return;
  let r = 0;
  if (rpx >= 1.6) {
    // in the planet's shadow: sunlight goes, a trace of coppery light stays so the disc can still be found when zoomed in
    const lit = m.light ?? 1;
    if (over > 0.02 && rpx < 7) { ctx.strokeStyle = `rgba(20,12,4,${0.6 * over * fade * (1 - smooth(4, 7, rpx))})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(pl.x, pl.y, rpx + 0.4, 0, 2 * Math.PI); ctx.stroke(); }
    r = drawFromMap(ctx, m, pl, rpx, { eclDim: Math.max(0.02, lit) * fade, ...(over > 0 && parent.id === 'Saturn' && BODY_ART[m.id] && BODY_ART[m.id].light === 'icy' ? { gain: BODY_ART[m.id].gain * (1 + 0.35 * over) } : {}) });      // ice (albedo about 1) beside Saturn's clouds (0.5): the brighter of the two
    if (!r) { ctx.globalAlpha = Math.max(0.03, lit) * fade; ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(pl.x, pl.y, rpx, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1; r = rpx; }
  }
  else {
    // A moon's point is capped in size (dm 6); apply any eclipse dimming AFTER the cap, so a moon sliding into
    // its planet's shadow is seen to fade out over the few minutes that takes, instead of staying at full size.
    const dim = (m.light < 1 ? 2.5 * Math.log10(Math.max(m.light, 1e-6)) : 0) + (fade < 1 ? 2.5 * Math.log10(fade) : 0);
    const dmPoint = Math.min(dm - dim, 6) + dim;
    if (dmPoint > 0 && over < 0.99) { if (over > 0.01) { ctx.save(); ctx.globalAlpha = 1 - over; } r = over > 0.01 ? drawPointAt(ctx, pl.x, pl.y, dmPoint, 0.7) : drawStarPoint(ctx, pl.x, pl.y, dmPoint, 0.7); if (over > 0.01) ctx.restore(); }
    if (over > 0.01) { const mr = Math.max(rpx, Math.min(MARK_R, prpx / 14)); drawMark(ctx, pl.x, pl.y, mr, m.color, m.light, over * fade); r = Math.max(r * (1 - over), mr + 0.9); }
    if (!r) return;
  }
  addPick(pl.x, pl.y, Math.max(r, 3), m.mag, { kind: 'body', id: m.id });
  if (state.show.planetNames && fade > 0.6 && sepPx > 14 && !(over > 0.5 && prpx < 30)) R.labels.add(pl.x, pl.y, m.name, 'moon', 90 - m.mag + (over > 0.5 ? 40 : 0), { gap: r + 4 });
}
function drawPointAt(ctx, x, y, dm, bv) { const r = starSize(dm), half = r / 0.34; ctx.drawImage(starSprite(bv), x - half, y - half, 2 * half, 2 * half); return r; }
export { AU_KM };
