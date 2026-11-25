// labs/shadow.js: the Earth's shadow at the Moon's distance.
//  - earthShadow(): pure geometry, the same model astronomy-engine uses to predict lunar eclipses
//    (Sun radius 695,700 km; Earth radius 6,371 km + 88 km of atmosphere = 6,459 km, i.e. the shadow
//    is enlarged by 1.4%; the shadow axis is the line from the apparent Sun through the Earth's centre).
//  - an overlay that darkens the part of the Moon inside the penumbra and umbra (always on: it is
//    what a lunar eclipse looks like) and, when "Earth's shadow" is switched on, outlines both circles
//    so they can be measured with the angle tool.

import { A, AU_KM, RAD, C_AU_PER_DAY, vecOf, unit, dot, sub, scale, len } from '../astro.js';
import { state } from '../state.js';
import { R } from '../render/proj.js';
import { jpl } from '../jpl.js';
import { repaintSky } from '../render/sky.js';
import { squashMatrix } from '../render/planets.js';
import { placeEqj } from './util.js';
import { setTargets, registerResolver } from './targets.js';

const SUN_KM = 695700, EARTH_SHADOW_KM = 6459;

/** Shadow geometry for the observer of `frame`. Returns
 *  { u: J2000 unit direction of the shadow's centre as seen from the site, umbra / penumbra: angular
 *    radii in degrees, umbraKm / penumbraKm, moonOffKm: Moon's centre from the axis, axisAu }. */
export function earthShadow(frame, lightTime = true) {
  let time = frame.time;
  const obsVec = frame.opos;
  if (lightTime) {
    // the Moon is drawn where it was one light-time (1.3 s) ago; put the shadow at that instant too
    const d0 = len(sub(vecOf(A.GeoMoon(time)), obsVec));
    time = time.AddDays(-d0 / C_AU_PER_DAY);
  }
  const sun = vecOf(A.GeoVector('Sun', time, true));
  const dir = scale(sun, -1);                                   // from the Sun through the Earth's center
  const moon = vecOf(A.GeoMoon(time));
  let k = dot(dir, moon) / dot(dir, dir);                       // where along the axis the Moon is
  // Away from full Moon (more than 60 degrees from the anti-solar point) the Moon is nowhere near the shadow:
  // the outline is then drawn at the Moon's distance down the axis, and nothing is darkened.
  const kFar = len(moon) / len(dir), far = k < 0.5 * kFar;
  if (far) k = kFar;
  const axisPt = scale(dir, k);
  const umbraKm = SUN_KM - (1 + k) * (SUN_KM - EARTH_SHADOW_KM);
  const penumbraKm = -SUN_KM + (1 + k) * (SUN_KM + EARTH_SHADOW_KM);
  const topo = sub(axisPt, obsVec), dist = len(topo);
  // the Moon is drawn with the observer's aberration (or, with the switch off, without even the Earth's): the shadow goes with it
  const ab = frame.aberration === false ? sub(frame.betaDay, frame.betaTrue) : frame.betaDay, u = unit([0, 1, 2].map((i) => topo[i] / dist + (lightTime ? ab[i] : 0)));
  return {
    u, distAu: dist, k, far,
    umbraKm, penumbraKm,
    umbra: Math.atan(umbraKm / AU_KM / dist) * RAD,
    penumbra: Math.atan(penumbraKm / AU_KM / dist) * RAD,
    moonOffKm: len(sub(axisPt, moon)) * AU_KM,
  };
}

/** How much of the full Moon's light is left in the Earth's shadow (1 = all). The umbra itself keeps about 1/60,000 (sunlight bent through our air):
 *  a typical total eclipse, magnitude near -0.5; real ones run from about -3 to +4 with the dust in the air. */
export const UMBRA_LIGHT = 1.6e-5;
export function shadowLight(sep, r, umbra, penumbra) {
  if (sep > penumbra + r) return 1;
  let sum = 0, n = 0;
  for (let i = -11; i <= 11; i++) for (let j = -11; j <= 11; j++) {
    const x = i / 11.5, y = j / 11.5; if (x * x + y * y > 1) continue;
    const d = Math.hypot(sep + x * r, y * r), t = (d - umbra) / (penumbra - umbra);
    sum += t <= 0 ? UMBRA_LIGHT : t >= 1 ? 1 : UMBRA_LIGHT + (1 - UMBRA_LIGHT) * t * t * (3 - 2 * t); n++;
  }
  return sum / n;
}
let litFor = null, lit = 1;
export function moonLight(frame, moon) {
  if (moon.phaseFrac < 0.97) return 1;
  if (litFor === moon) return lit;
  litFor = moon;
  const sh = currentShadow(frame);
  return (lit = sh.far ? 1 : shadowLight(Math.acos(Math.max(-1, Math.min(1, dot(sh.u, moon.u)))) * RAD, moon.angRadius, sh.umbra, sh.penumbra));
}

let cache = null, cacheKey = '';
export function currentShadow(frame) {
  const key = jpl.version + '|' + frame.aberration + frame.timeMs + '|' + frame.loc.lat + '|' + frame.loc.lon + '|' + state.lightTime;
  if (key !== cacheKey) { cacheKey = key; cache = earthShadow(frame, state.lightTime); }
  return cache;
}

export function initShadow() {
  registerResolver('shadow', (id, frame) => {
    const s = currentShadow(frame);
    return { u: s.u, angRadius: id === 'penumbra' ? s.penumbra : s.umbra, name: id === 'penumbra' ? 'Penumbra' : 'Umbra' };
  });
}

export function drawShadow(ctx) {
  const frame = R.frame, moon = R.bodies.moon;
  const show = state.fx.earthShadow;
  const sh = currentShadow(frame);
  const sep = Math.acos(Math.max(-1, Math.min(1, dot(sh.u, moon.u)))) * RAD;
  const touching = !sh.far && sep < sh.penumbra + moon.angRadius;
  if (!show && !touching) { setTargets('shadow', []); return; }
  const c = placeEqj(sh.u, frame);
  if (!c) { setTargets('shadow', []); return; }
  const ru = sh.umbra * c.scale, rp = sh.penumbra * c.scale;

  // ---- darken the Moon ----
  const m = placeEqj(moon.u, frame);
  if (touching && m && !(R.ground && m.alt < moon.angRadius)) {
    const rm = Math.max(moon.angRadius * m.scale, 5);
    // when the Moon is drawn enlarged (wide fields) scale the shadow about the Moon so the picture stays in proportion
    const k = rm / (moon.angRadius * m.scale);
    // low down the Moon is drawn pressed flat by refraction, and so is the shadow on it: both are drawn round, inside that squash
    const q = squashMatrix(moon.u, m.x, m.y), det = q[0] * q[3] - q[1] * q[2], ox = c.x - m.x, oy = c.y - m.y;
    const cx = m.x + (q[3] * ox - q[2] * oy) / det * k, cy = m.y + (q[0] * oy - q[1] * ox) / det * k;
    ctx.save();
    { ctx.translate(m.x, m.y); ctx.transform(q[0], q[1], q[2], q[3], 0, 0); ctx.translate(-m.x, -m.y); }
    ctx.beginPath(); ctx.arc(m.x, m.y, rm + 0.3, 0, 2 * Math.PI); ctx.clip();
    // penumbra: a soft grey that deepens toward the umbra (to the eye only its inner part is noticeable)
    const dk = 1 - R.sky.day, g = ctx.createRadialGradient(cx, cy, ru * k, cx, cy, rp * k);
    g.addColorStop(0, `rgba(8,8,10,${0.34 * dk})`); g.addColorStop(0.45, `rgba(8,8,10,${0.13 * dk})`); g.addColorStop(1, 'rgba(8,8,10,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, rp * k, 0, 2 * Math.PI); ctx.fill();
    // umbra: dark, coppery (sunlight bent through the Earth's atmosphere), a little brighter toward its edge
    const ug = ctx.createRadialGradient(cx, cy, 0, cx, cy, ru * k);
    // multiplied onto the Moon's own picture, so that its seas still show through the copper
    ug.addColorStop(0, '#5c180c'); ug.addColorStop(0.7, '#832a16'); ug.addColorStop(1, '#a34826');
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = ug; ctx.beginPath(); ctx.arc(cx, cy, ru * k, 0, 2 * Math.PI); ctx.fill();
    // the shadow darkens the Moon, not the sky in front of it: put back the sky's light that the multiplication took away
    ctx.beginPath(); ctx.arc(cx, cy, ru * k, 0, 2 * Math.PI); ctx.clip(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.72; repaintSky(ctx, R.sky); ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- outlines, for measuring ----
  if (!show) { setTargets('shadow', []); return; }
  if (R.ground && c.alt < -sh.penumbra) { setTargets('shadow', []); return; }
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,120,80,0.9)';
  ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(ru, 1), 0, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(255,170,120,0.75)';
  ctx.beginPath(); ctx.arc(c.x, c.y, Math.max(rp, 1.5), 0, 2 * Math.PI); ctx.stroke();
  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255,150,110,0.9)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y); ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6); ctx.stroke();
  ctx.restore();
  if (ru > 30) {
    R.labels.add(c.x + ru * 0.7071, c.y - ru * 0.7071, 'Umbra', 'grid', 50, { gap: 5, color: '#ff9a78' });
    R.labels.add(c.x + rp * 0.7071, c.y - rp * 0.7071, 'Penumbra', 'grid', 49, { gap: 5, color: '#ffb999' });
  } else R.labels.add(c.x, c.y, "Earth's shadow", 'grid', 50, { gap: Math.max(rp, 4) + 4, color: '#ff9a78' });
  setTargets('shadow', [
    { x: c.x, y: c.y, r: ru, type: 'shadow', id: 'umbra' },
    { x: c.x, y: c.y, r: rp, type: 'shadow', id: 'penumbra' },
  ]);
}
