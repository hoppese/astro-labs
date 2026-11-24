// render/planets.js: Sun, Moon, planets and their moons. Far from the eyepiece they are points
// sized by magnitude; once the disc is a few pixels across it is drawn to scale with its phase,
// Saturn's rings (tilt and orientation from Saturn's real pole) and Jupiter's flattening.

import { DEG, RAD, AU_KM, refractHor, mulMV, unit, dot, airmass, clamp } from '../astro.js';
import { state } from '../state.js';
import { cam, projectHor } from '../camera.js';
import { addPick } from '../picks.js';
import { R } from './proj.js';
import { drawStarPoint, starSize } from './stars.js';

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

function litGradient(ctx, r, base, edge) {
  const g = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r);
  g.addColorStop(0, base); g.addColorStop(1, edge);
  return g;
}

function drawSun(ctx, b, pl, rpx) {
  const r = Math.max(rpx, 5);
  const day = R.sky.day;
  const gr = Math.max(r * 3.2, 34);
  const g = ctx.createRadialGradient(pl.x, pl.y, r * 0.9, pl.x, pl.y, gr);
  const soft = clamp(14 / r, 0.3, 1);                   // a big disc needs less halo
  g.addColorStop(0, `rgba(255,244,214,${(0.55 + 0.2 * day) * soft})`); g.addColorStop(0.35, `rgba(255,226,170,${0.16 * soft})`); g.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, gr, 0, 2 * Math.PI); ctx.fill();
  // redden toward the horizon when there is an atmosphere
  const low = R.atmo ? clamp(1 - pl.alt / 12, 0, 1) : 0;
  const core = `rgb(255,${Math.round(250 - 70 * low)},${Math.round(232 - 150 * low)})`;
  const dg = ctx.createRadialGradient(pl.x, pl.y, 0, pl.x, pl.y, r);
  dg.addColorStop(0, '#fffdf4'); dg.addColorStop(0.75, core); dg.addColorStop(1, `rgb(255,${Math.round(226 - 80 * low)},${Math.round(170 - 120 * low)})`);
  ctx.fillStyle = dg; ctx.beginPath(); ctx.arc(pl.x, pl.y, r, 0, 2 * Math.PI); ctx.fill();
  return r;
}

function drawMoon(ctx, b, pl, rpx, sunU) {
  const r = Math.max(rpx, 5);
  const ang = screenAngleToward(b, sunU, pl.x, pl.y);
  // soft glow scaled by how much of the disc is lit
  const gr = r + 10 + 14 * b.phaseFrac;
  const g = ctx.createRadialGradient(pl.x, pl.y, r, pl.x, pl.y, gr);
  g.addColorStop(0, `rgba(225,230,240,${0.20 * b.phaseFrac * (1 - 0.6 * R.sky.day)})`); g.addColorStop(1, 'rgba(225,230,240,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(pl.x, pl.y, gr, 0, 2 * Math.PI); ctx.fill();
  // the unlit part: faint earthshine at night, lost in the blue by day
  // ... except in front of the Sun, where the dark Moon is what makes the eclipse
  const sun = R.bodies.sun;
  const onSun = Math.acos(clamp(dot(b.u, sun.u), -1, 1)) * RAD < (sun.angRadius + b.angRadius) * 1.05;
  drawPhaseDisc(ctx, pl.x, pl.y, r, ang, b.phaseAngle, '#eceae2', onSun ? '#0b0e15' : '#1b212b', onSun ? 1 : 1 - 0.9 * R.sky.day);
  if (r > 14) {       // gentle limb shading so the big disc does not look flat
    ctx.save(); ctx.translate(pl.x, pl.y);
    const sg = ctx.createRadialGradient(0, 0, r * 0.55, 0, 0, r);
    sg.addColorStop(0, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(20,24,32,0.22)');
    ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, r, 0, 2 * Math.PI); ctx.fill(); ctx.restore();
  }
  return r;
}

function ringAnnulus(ctx, aOut, aIn, sinB, style) {
  const k = Math.max(Math.abs(sinB), 0.004);
  ctx.fillStyle = style; ctx.beginPath();
  ctx.ellipse(0, 0, aOut, Math.max(aOut * k, 0.35), 0, 0, 2 * Math.PI);
  ctx.ellipse(0, 0, aIn, Math.max(aIn * k, 0.2), 0, 0, 2 * Math.PI);
  ctx.fill('evenodd');
}
function drawRings(ctx, kmToPx, sinB) {
  ringAnnulus(ctx, RING.b0 * kmToPx, RING.c0 * kmToPx, sinB, 'rgba(150,135,110,0.30)');
  ringAnnulus(ctx, RING.b1 * kmToPx, RING.b0 * kmToPx, sinB, 'rgba(232,214,170,0.95)');
  ringAnnulus(ctx, RING.a1 * kmToPx, RING.a0 * kmToPx, sinB, 'rgba(200,184,148,0.85)');
}

/** Jupiter or Saturn as a flattened disc with its pole in the right direction (and Saturn's rings). */
function drawGiant(ctx, b, pl, rpx) {
  const poleAng = screenAngleToward(b, b.pole, pl.x, pl.y);
  const B = b.subEarthLat * DEG, sinB = Math.sin(B);
  const ratio = b.polarKm / b.radiusKm;
  const rp = rpx * Math.sqrt(ratio * ratio * Math.cos(B) ** 2 + Math.sin(B) ** 2);    // apparent polar radius
  ctx.save();
  ctx.translate(pl.x, pl.y); ctx.rotate(poleAng + Math.PI / 2);                        // -y is now along the north pole
  const kmToPx = rpx / b.radiusKm;
  if (b.id === 'Saturn') drawRings(ctx, kmToPx, sinB);
  // globe
  ctx.beginPath(); ctx.ellipse(0, 0, rpx, rp, 0, 0, 2 * Math.PI);
  ctx.fillStyle = b.id === 'Jupiter' ? litGradient(ctx, rpx, '#f6e6cb', '#b99f7c') : litGradient(ctx, rpx, '#f3e2b4', '#b39c69');
  ctx.fill();
  if (rpx > 5) {
    ctx.save(); ctx.clip();
    const band = (lat0, lat1, style) => {             // a belt between two latitudes, seen at sub-Earth latitude B
      const yy = (lat) => -rp * Math.sin(clamp(lat * DEG - B, -Math.PI / 2, Math.PI / 2));
      const y0 = yy(lat0), y1 = yy(lat1);
      ctx.fillStyle = style; ctx.fillRect(-rpx, Math.min(y0, y1), 2 * rpx, Math.abs(y1 - y0));
    };
    if (b.id === 'Jupiter') {
      band(7, 20, 'rgba(150,96,62,0.55)'); band(-21, -8, 'rgba(150,96,62,0.55)');
      band(34, 42, 'rgba(160,120,90,0.28)'); band(-43, -35, 'rgba(160,120,90,0.28)');
      band(62, 90, 'rgba(120,110,105,0.30)'); band(-90, -62, 'rgba(120,110,105,0.30)');
    } else {
      band(12, 24, 'rgba(170,140,90,0.25)'); band(-24, -12, 'rgba(170,140,90,0.25)');
      band(60, 90, 'rgba(120,125,120,0.28)'); band(-90, -60, 'rgba(120,125,120,0.28)');
    }
    ctx.restore();
  }
  if (b.id === 'Saturn') {
    // redraw the half of the rings that passes in front of the globe
    ctx.save(); ctx.beginPath();
    const big = RING.a1 * kmToPx + 4;
    if (sinB >= 0) ctx.rect(-big, 0, 2 * big, big); else ctx.rect(-big, -big, 2 * big, big);
    ctx.clip(); drawRings(ctx, kmToPx, sinB); ctx.restore();
  }
  ctx.restore();
  return b.id === 'Saturn' ? RING.a1 * kmToPx : rpx;
}

export function drawBodies(ctx) {
  const { bodies, sky, labels } = R;
  const lim = sky.limMag, sunU = bodies.sun.u;
  const order = bodies.list.slice().sort((a, b) => b.dist - a.dist);
  for (const b of order) {
    const pl = place(b.hor);
    if (!pl) continue;
    const rpx = b.angRadius * pl.scale;
    if (R.ground && pl.alt < -b.angRadius - 0.05) continue;
    const reach = Math.max(rpx * 3, 60) + (b.moons.length ? 0.2 * pl.scale : 0);
    if (pl.x < -reach || pl.x > cam.w + reach || pl.y < -reach || pl.y > cam.h + reach) continue;
    const ext = R.atmo ? 0.2 * (airmass(pl.alt) - 1) : 0;
    const mag = b.mag + ext;
    let drawnR = 0, visible = true;
    const moonsBehind = [], moonsFront = [];
    for (const m of b.moons) (m.behind ? moonsBehind : moonsFront).push(m);

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
        ctx.fillStyle = '#07090d'; ctx.beginPath(); ctx.arc(pl.x, pl.y, drawnR, 0, 2 * Math.PI); ctx.fill();
      } else if (dm <= 0 && !resolved) visible = false;
      else {
        if (dm > 0 && rpx < starSize(dm)) drawnR = drawStarPoint(ctx, pl.x, pl.y, dm, POINT_BV[b.id]);
        if (resolved) {
          if (b.polarKm) drawnR = Math.max(drawnR, drawGiant(ctx, b, pl, rpx));
          else {
            const ang = screenAngleToward(b, sunU, pl.x, pl.y);
            drawPhaseDisc(ctx, pl.x, pl.y, rpx, ang, b.phaseAngle, b.color, '#14181f', 1);
            drawnR = Math.max(drawnR, rpx);
          }
        }
      }
    }
    if (b.kind === 'planet') for (const m of moonsFront) drawMoonOf(ctx, b, m, pl, rpx, lim, ext);
    if (!visible) continue;
    addPick(pl.x, pl.y, Math.max(drawnR, 4), b.mag, { kind: 'body', id: b.id });
    // no star or deep-sky label on the face of the Sun or Moon (the stars behind are hidden; their names were not)
    if ((b.kind === 'sun' || b.kind === 'moon') && drawnR >= 10) labels.blockDisc(pl.x, pl.y, drawnR, ['star', 'starDim', 'dso']);
    if (state.show.planetNames) labels.add(pl.x, pl.y, b.name, 'planet', 120 - b.mag * 0.5, { gap: Math.min(drawnR, 600) + 6 });
  }
}

function drawMoonOf(ctx, parent, m, ppl, prpx, lim, ext) {
  if (m.occulted || m.light <= 0.002) return;              // behind the disc, or deep in the planet's shadow
  const pl = place(m.hor);
  if (!pl) return;
  const sepPx = Math.hypot(pl.x - ppl.x, pl.y - ppl.y);
  const rpx = m.angRadius * pl.scale;
  const dm = lim - (m.mag + ext);
  if (dm <= 0 && rpx < 1.6) return;
  if (sepPx < Math.max(prpx + 1.5, 5) && !(rpx >= 1.2 && (m.transit || m.behind))) return;     // lost in the planet's glare (a resolved moon behind is simply covered by the disc drawn after it)
  let r = 0;
  if (rpx >= 1.6) { ctx.globalAlpha = Math.max(0.03, m.light ?? 1); ctx.fillStyle = m.color; ctx.beginPath(); ctx.arc(pl.x, pl.y, rpx, 0, 2 * Math.PI); ctx.fill(); ctx.globalAlpha = 1; r = rpx; }
  else {
    // A moon's point is capped in size (dm 6); apply any eclipse dimming AFTER the cap, so a moon sliding into
    // its planet's shadow is seen to fade out over the few minutes that takes, instead of staying at full size.
    const dim = m.light < 1 ? 2.5 * Math.log10(Math.max(m.light, 1e-6)) : 0;
    const dmPoint = Math.min(dm - dim, 6) + dim;
    if (dmPoint <= 0) return;
    r = drawStarPoint(ctx, pl.x, pl.y, dmPoint, 0.7);
  }
  addPick(pl.x, pl.y, Math.max(r, 3), m.mag, { kind: 'body', id: m.id });
  if (state.show.planetNames && sepPx > 14) R.labels.add(pl.x, pl.y, m.name, 'moon', 90 - m.mag, { gap: r + 4 });
}
export { AU_KM };
