// labs/trails.js: the path of the Sun, the Moon or a planet over a range of dates, with a tick at every
// step and dates on some of them.
//   frame = 'stars'    positions against the stars (retrograde loops, the Moon's monthly path)
//   frame = 'horizon'  altitude and azimuth at the same clock time on successive days (the analemma)
// The trail is centred on the instant at which it was started and stays put until restarted.

import { A, vecOf, unit, mulMV, refractHor, unrefractHor } from '../astro.js';
import { state, on, emit, eff } from '../state.js';
import { projectHor, cam } from '../camera.js';
import { makeFrame } from '../skyframe.js';
import { apparent } from '../ephem.js';
import { jpl } from '../jpl.js';
import { wallParts, fmtDate } from '../timeutil.js';
import { R } from '../render/proj.js';
import { makeCard } from './dock.js';
import { placeEqj } from './util.js';
import { setTargets, registerResolver } from './targets.js';

const DAY = 86400000, SID = 86164090.5;
export const STEPS = [['1 hour', 3600000], ['1 day', DAY], ['1 sidereal day', SID], ['5 days', 5 * DAY], ['10 days', 10 * DAY], ['30 days', 30 * DAY]];
const BODIES = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
export const trail = { on: false, body: 'Mars', step: DAY * 5, before: 30, after: 30, frame: 'stars', t0: null, pts: [], key: '' };
let card = null;

/** Apparent topocentric J2000 direction of a body (the same call ephem.js uses). */
function dirOf(id, frame) {
  return unit(apparent(id, frame, frame.aberration !== false).seen);
}
function build() {
  const key = [jpl.version, trail.body, trail.step, trail.before, trail.after, trail.frame, trail.t0, state.loc.lat, state.loc.lon, eff.refraction, state.fx.aberration].join('|');
  if (key === trail.key) return;
  trail.key = key; trail.pts = [];
  for (let i = -trail.before; i <= trail.after; i++) {
    const t = trail.t0 + i * trail.step;
    if (t < Date.UTC(-3000, 0, 1) || t > Date.UTC(3001, 0, 1)) continue;
    const f = makeFrame(t, state.loc);
    if (!state.fx.aberration) f.aberration = false;
    const u = dirOf(trail.body, f);
    let hor = null;
    if (trail.frame === 'horizon') { hor = mulMV(f.Mjh, u); if (eff.refraction) hor = refractHor(hor); }
    trail.pts.push({ i, t, u, hor });
  }
}
/** Trails exist for the Sun, the Moon and the planets (not for stars, moons of planets or deep-sky objects). */
export const canTrail = (id) => BODIES.includes(id);
export function startTrail(opts = {}) {
  for (const k of Object.keys(opts)) if (opts[k] !== undefined) trail[k] = opts[k];
  trail.on = true; trail.t0 = opts.t0 ?? state.timeMs;
  trail.before = Math.max(0, Math.min(400, trail.before | 0)); trail.after = Math.max(0, Math.min(400, trail.after | 0));
  emit('trail'); render();
}
export function stopTrail() { trail.on = false; setTargets('trail', []); emit('trail'); render(); }

const p = [0, 0];
export function drawTrail(ctx) {
  if (!trail.on || trail.t0 == null) { return; }
  build();
  const pts = [], targets = [];
  for (const q of trail.pts) {
    let s = null;
    if (q.hor) { if (projectHor(q.hor, p)) s = { x: p[0], y: p[1] }; }
    else s = placeEqj(q.u, R.frame);
    pts.push(s && Math.abs(s.x) < 30000 && Math.abs(s.y) < 30000 ? { x: s.x, y: s.y, q } : null);
  }
  ctx.save();
  ctx.strokeStyle = 'rgba(255,150,210,0.8)'; ctx.fillStyle = 'rgba(255,170,220,0.95)'; ctx.lineWidth = 1.3; ctx.lineJoin = 'round';
  ctx.beginPath();
  let pen = false;
  for (const s of pts) { if (!s) { pen = false; continue; } if (pen) ctx.lineTo(s.x, s.y); else ctx.moveTo(s.x, s.y); pen = true; }
  ctx.stroke();
  // label about a dozen ticks, always including the start
  const n = trail.pts.length, every = Math.max(1, Math.ceil(n / 12));
  const showTime = trail.step < DAY;
  for (const s of pts) {
    if (!s || s.x < -20 || s.y < -20 || s.x > cam.w + 20 || s.y > cam.h + 20) continue;
    const major = s.q.i % every === 0;
    ctx.beginPath(); ctx.arc(s.x, s.y, s.q.i === 0 ? 3.6 : major ? 2.6 : 1.5, 0, 2 * Math.PI); if (major) { ctx.strokeStyle = 'rgba(70,0,45,0.9)'; ctx.lineWidth = 2; ctx.stroke(); } ctx.fill();      // a dark edge: a tick can lie on the Sun
    if (major) {
      const w = wallParts(s.q.t, state.loc.tz);
      const txt = showTime ? `${String(w.month).padStart(2, '0')}-${String(w.day).padStart(2, '0')} ${String(w.hour).padStart(2, '0')}h` : fmtDate(w);
      R.labels.add(s.x, s.y, txt, 'grid', 45 - Math.abs(s.q.i) * 0.01, { gap: 6, color: '#ffb3dc' });
    }
    targets.push({ x: s.x, y: s.y, r: 2.5, type: 'trail', id: s.q.i, centreOnly: true });
  }
  ctx.restore();
  setTargets('trail', targets);
}

function render() {
  if (!card || !card.isOpen()) return;
  const sel = (id, opts, cur) => `<select id="${id}">${opts.map(([l, v]) => `<option value="${v}"${String(v) === String(cur) ? ' selected' : ''}>${l}</option>`).join('')}</select>`;
  card.body.innerHTML =
    `<div class="row"><label for="trBody">Path of</label>${sel('trBody', BODIES.map((b) => [b, b]), trail.body)}</div>` +
    `<div class="row"><label for="trStep">one tick every</label>${sel('trStep', STEPS, trail.step)}</div>` +
    `<div class="row"><input type="number" id="trBefore" min="0" max="400" value="${trail.before}" aria-label="Ticks before"><span>ticks before,</span><input type="number" id="trAfter" min="0" max="400" value="${trail.after}" aria-label="Ticks after"><span>after the clock time</span></div>` +
    `<div class="row"><label for="trFrame">drawn</label>${sel('trFrame', [['against the stars', 'stars'], ['in the sky here, same clock time (analemma)', 'horizon']], trail.frame)}</div>` +
    `<div class="row"><button class="btn primary" data-act="start">${trail.on ? 'Redraw from the clock time' : 'Draw path'}</button>${trail.on ? '<button class="btn" data-act="stop">Remove</button>' : ''}</div>` +
    `<p class="hint">${trail.on ? 'The large dot is the start. Dates are local. The angle tool snaps to the ticks.' : 'Ticks are labelled with their dates. For the analemma choose the Sun, 5 or 10 days, and “in the sky here”.'}</p>`;
}
function readForm() {
  const g = (id) => card.body.querySelector('#' + id);
  return { body: g('trBody').value, step: +g('trStep').value, before: +g('trBefore').value, after: +g('trAfter').value, frame: g('trFrame').value };
}
export function initTrails() {
  card = makeCard('trails', 'Path of an object', { onOpen: render });
  registerResolver('trail', (id, frame) => {
    const q = trail.pts.find((x) => x.i === id); if (!q) return null;
    // a tick of an "in the sky here" trail is a fixed altitude and azimuth: express it in today's J2000 frame
    // (angles between two such ticks do not depend on the instant chosen)
    const u = q.hor ? mulMV(frame.Mhj, eff.refraction ? unrefractHor(q.hor) : q.hor) : q.u;
    return { u, angRadius: 0, name: `${trail.body} ${fmtDate(wallParts(q.t, state.loc.tz))}` };
  });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'start') startTrail(readForm()); else if (b.dataset.act === 'stop') stopTrail();
  });
  return card;
}
