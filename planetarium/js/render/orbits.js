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
  const V = state.vantage, home = MOON_PARENT[V] || V;
  const key = V + '|' + state.aboveAU + '|' + Math.round(time.ut * 24);
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
  const fam = Object.keys(MOON_PERIOD).filter((id) => MOON_PARENT[id] === home && id !== V && MOON_PERIOD[id] < 60);
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
