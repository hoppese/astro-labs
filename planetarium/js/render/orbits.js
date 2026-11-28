// render/orbits.js: the paths of the planets (and of the moons of the planet the observer is at) drawn on the sky when
// looking from space (state.vantage). Each path is one revolution, worked out by sampling the ephemeris, so it is the real
// orbit and not an ellipse drawn from elements. Seen from high above the Sun it is the familiar diagram of the solar system.

import { unit, sub, add } from '../astro.js';
import { state, eff } from '../state.js';
import { vantageHelio, MOON_PARENT, MOON_PERIOD, BODIES, EARTH_DEF } from '../ephem.js';
import { placeEqj } from '../labs/util.js';
import { R } from './proj.js';

const PLANETS = [['Mercury', 87.97], ['Venus', 224.70], ['Earth', 365.256], ['Mars', 686.98], ['Jupiter', 4332.6], ['Saturn', 10759], ['Uranus', 30687], ['Neptune', 60190], ['Pluto', 90560]];
const COLOR = Object.fromEntries([...BODIES, EARTH_DEF].map((b) => [b.id, b.color]));
const N = 240;
let cache = { key: '', paths: [] };

/** Sun-centered points (au, EQJ) round one revolution of each path, centered on now. Planets: cached per day; moons: per hour. */
function paths(time) {
  const V = state.vantage, T = V === 'Above' ? state.aboveTarget : V, home = T ? MOON_PARENT[T] || T : null;      // (in the solar-system view: the moons of the planet circled)
  const key = V + '|' + T + '|' + Math.round(time.ut * 24);
  if (cache.key === key) return cache.paths;
  const out = [];
  const dayKey = Math.round(time.ut);
  if (cache.dayKey === dayKey && cache.planets) out.push(...cache.planets);
  else {
    const pl = PLANETS.map(([id, P]) => {
      const pts = [];
      for (let k = 0; k <= N; k++) { const p = vantageHelio(id, time.AddDays((k / N - 0.5) * P)); if (p) pts.push(p); }
      return { id, pts, moon: false };
    });
    cache.planets = pl; cache.dayKey = dayKey; out.push(...pl);
  }
  // the moons of the planet the observer is at (or whose moon the observer is on), drawn round the planet where it is now
  const fam = !home ? [] : Object.keys(MOON_PERIOD).filter((id) => MOON_PARENT[id] === home && id !== V && MOON_PERIOD[id] < 60);
  for (const id of fam) {
    const P = MOON_PERIOD[id], parent = home, c = vantageHelio(parent, time);
    if (!c) continue;
    const pts = [];
    for (let k = 0; k <= N; k++) {
      const t = time.AddDays((k / N - 0.5) * P), m = vantageHelio(id, t), q = vantageHelio(parent, t);
      if (m && q) pts.push(add(c, sub(m, q)));
    }
    out.push({ id, pts, moon: true });
  }
  cache = { ...cache, key, paths: out };
  return out;
}

export function drawOrbits(ctx) {
  if (!eff.space || !state.show.orbits) return;      // (standing on a body the ground hides half of them)
  const frame = R.frame, obs = vantageHelio(state.vantage, frame.time);
  if (!obs) return;
  const W = ctx.canvas.width, H = ctx.canvas.height, far = Math.hypot(W, H);
  ctx.save(); ctx.lineWidth = 1.2;
  for (const p of paths(frame.time)) {
    if (p.id === state.vantage) continue;              // its own path runs through the observer
    ctx.strokeStyle = (COLOR[p.id] || '#9fb6d8') + (p.moon ? '88' : '77');
    ctx.beginPath(); let prev = null;
    for (const q of p.pts) {
      const pl = placeEqj(unit(sub(q, obs)), frame);
      if (!pl || (prev && Math.hypot(pl.x - prev.x, pl.y - prev.y) > far * 0.5)) { prev = null; continue; }      // behind the observer, or a jump across the sky
      if (prev) ctx.lineTo(pl.x, pl.y); else ctx.moveTo(pl.x, pl.y);
      prev = pl;
    }
    ctx.stroke();
  }
  ctx.restore();
}

// The solar-system view's distance grid (state.show.auGrid): circles round the Sun in the plane of the ecliptic. The spacing (1, 2 or 5 × a power
// of ten, in au) is about a tenth of the viewing distance; every fifth circle is brighter, and each is labelled toward the March equinox.
const EPS = 23.4392911 * Math.PI / 180, CE = Math.cos(EPS), SE = Math.sin(EPS);
const ecl = (x, y) => [x, y * CE, y * SE];                                   // ecliptic plane point -> Sun-centered EQJ, au
export function drawAuGrid(ctx) {
  if (state.vantage !== 'Above' || !state.show.auGrid) return;
  const frame = R.frame, obs = vantageHelio('Above', frame.time);
  if (!obs) return;
  const d = state.aboveAU, raw = d / 10, p10 = 10 ** Math.floor(Math.log10(raw));
  const step = p10 * (raw >= 5 * p10 ? 5 : raw >= 2 * p10 ? 2 : 1);
  const c = (state.aboveTarget && vantageHelio(state.aboveTarget, frame.time)) || state.abovePan || [0, 0, 0];
  const rc = Math.hypot(c[0], c[1] * CE + c[2] * SE);      // how far out the view is centred: circles from there less to more than the field
  const k0 = Math.max(1, Math.floor((rc - 4 * d) / step)), k1 = Math.min(k0 + 60, Math.ceil((rc + 4 * d) / step)), SEG = 180;
  const W = ctx.canvas.width, H = ctx.canvas.height, far = Math.hypot(W, H);
  const at = (x, y) => { const pl = placeEqj(unit(sub(ecl(x, y), obs)), frame); return pl ? { x: pl.x, y: pl.y } : null; };      // (placeEqj reuses its result)
  ctx.save(); ctx.lineWidth = 1;
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = 'rgba(170,195,235,0.8)'; ctx.textBaseline = 'top';
  for (let k = k0; k <= k1; k++) {
    const r = k * step;
    ctx.strokeStyle = k % 5 === 0 ? 'rgba(150,180,230,0.4)' : 'rgba(110,140,190,0.2)';
    ctx.beginPath(); let prev = null;
    for (let j = 0; j <= SEG; j++) {
      const a = 2 * Math.PI * j / SEG, q = at(r * Math.cos(a), r * Math.sin(a));
      if (!q || (prev && Math.hypot(q.x - prev.x, q.y - prev.y) > far * 0.5)) { prev = null; continue; }
      if (prev) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y);
      prev = q;
    }
    ctx.stroke();
    // its distance, where it crosses the line from the Sun toward the March equinox
    const q = at(r, 0);
    if (q && q.x > -50 && q.x < W && q.y > -20 && q.y < H) ctx.fillText(+r.toPrecision(6) + ' au', q.x + 3, q.y + 2);
  }
  ctx.restore();
}
