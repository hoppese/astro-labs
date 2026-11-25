// labs/jovian.js: what the moons of a planet do, found from the same positions the picture is drawn from (geocentric, light time included):
// transits of the disc, shadows on it, eclipses in the planet's shadow, occultations behind it, the moons covering or shadowing one another, and
// Jupiter's Great Red Spot crossing the centre. Times are when the moon's centre (or half its light) crosses the edge of the flattened globe.

import { A, AU_KM, C_AU_PER_DAY, RAD, vecOf, sub, scale, len, dot, unit, mod } from '../astro.js';
import { hiddenFraction, BODIES, MOON_DEFS } from '../ephem.js';
import { moonVector } from '../moons.js';
import { bodyAxes, subPoint, jupiterSystems, nextGrsTransit, grsLongitude } from '../orient.js';

// [name, key of the Galilean theory or null, radius km], and the step (minutes) that cannot jump over an event of the planet's fastest moon
const SETS = {
  Jupiter: { step: 12, list: [['Io', 'io', 1821.6], ['Europa', 'europa', 1560.8], ['Ganymede', 'ganymede', 2634.1], ['Callisto', 'callisto', 2410.3]] },
  Saturn: { step: 10, ids: ['Mimas', 'Enceladus', 'Tethys', 'Dione', 'Rhea', 'Titan'] },
  Uranus: { step: 10, ids: ['Miranda', 'Ariel', 'Umbriel', 'Titania', 'Oberon'] },
  Neptune: { step: 12, ids: ['Triton'] },
  Mars: { step: 5, ids: ['Phobos', 'Deimos'] },
  Pluto: { step: 10, ids: ['Charon'] },
};
const setOf = (planet) => { const s = SETS[planet]; if (!s.list) s.list = s.ids.map((id) => [id, null, MOON_DEFS.find((m) => m.id === id).radiusKm]); return s; };
export const MOONS = SETS.Jupiter.list;
const P = {}; for (const b of BODIES) P[b.id] = b;
/** Geometry at the instant (ms): moons from the planet (au), line of sight u, shadow direction s (away from the Sun), pole. */
export function geometry(ms, planet = 'Jupiter') {
  const time = A.MakeTime(new Date(ms)), g = vecOf(A.GeoVector(planet, time, false)), d = len(g), tr = time.AddDays(-d / C_AU_PER_DAY);
  const jm = planet === 'Jupiter' ? A.JupiterMoons(tr) : null, hel = vecOf(A.HelioVector(planet, tr));
  return { time, tr, planet: P[planet], moons: setOf(planet).list, u: unit(g), d, s: unit(hel), dSun: len(hel) * AU_KM, pole: bodyAxes(planet, tr.tt).z, rel: setOf(planet).list.map(([id, k]) => (k ? vecOf(jm[k]) : moonVector(id, tr.tt))) };
}
const inside = (h) => h.depth > 0 && h.frac < 0.5;
export const KINDS = {
  transit: (g, i) => inside(hiddenFraction(g.rel[i], scale(g.u, -1), g.pole, g.planet, g.moons[i][2])),
  shadow: (g, i) => inside(hiddenFraction(g.rel[i], scale(g.s, -1), g.pole, g.planet, g.moons[i][2])),
  occultation: (g, i) => inside(hiddenFraction(g.rel[i], g.u, g.pole, g.planet, g.moons[i][2])),
  eclipse: (g, i) => inside(hiddenFraction(g.rel[i], g.s, g.pole, g.planet, g.moons[i][2], (695700 - g.planet.radiusKm) / g.dSun, (695700 + g.planet.radiusKm) / g.dSun)),
};
const NAME = { transit: (m, p) => `${m} in front of ${p}`, shadow: (m, p) => `${m}’s shadow on ${p}`, occultation: (m, p) => `${m} behind ${p}`, eclipse: (m, p) => `${m} in ${p}’s shadow` };
/** Distance (km) between moons i and j across the line `axis`, and how far j is beyond i along it. */
function pair(g, i, j, axis) { const d = scale(sub(g.rel[j], g.rel[i]), AU_KM), z = dot(d, axis); return { z, p: len(sub(d, scale(axis, z))) }; }

/** Events whose start lies in [t0, t0 + span], at most n, in order. opt.planet; opt.kinds: subset of transit, shadow, occultation, eclipse, mutual, spot. */
export function jovianEvents(t0, n = 8, opt = {}) {
  const planet = opt.planet || 'Jupiter', set = setOf(planet), M = set.list, STEP = set.step * 60000, geo = (t) => geometry(t, planet);
  const kinds = new Set(opt.kinds || ['transit', 'shadow', 'occultation', 'eclipse', 'mutual', 'spot']), span = opt.span || 40 * 86400000, out = [];
  if (planet !== 'Jupiter') kinds.delete('spot');
  const keys = Object.keys(KINDS).filter((k) => kinds.has(k)), on = {}, hist = [];
  const edge = (k, i, a, b, rising) => { while (b - a > 2000) { const m = (a + b) / 2; if (KINDS[k](geo(m), i) === rising) b = m; else a = m; } return (a + b) / 2; };
  const end = (k, i, t) => { let b = t + 60000; while (b < t + 24 * 3600000 && KINDS[k](geo(b), i)) b += STEP; return edge(k, i, b - STEP, b, false); };
  if (planet !== 'Jupiter' && geo(t0).rel.some((r) => !r)) return out;
  for (let t = t0; t < t0 + span; t += STEP) {
    const g = geo(t);
    for (const k of keys) for (let i = 0; i < M.length; i++) {
      const v = KINDS[k](g, i), id = k + i;
      if (t === t0) { on[id] = v; continue; }
      if (v && !on[id]) { const s = edge(k, i, t - STEP, t, true), e = end(k, i, s); out.push({ t: s, end: e, kind: k, moon: M[i][0], text: NAME[k](M[i][0], planet) }); }
      on[id] = v;
    }
    if (kinds.has('mutual')) {
      const row = []; for (let i = 0; i < M.length; i++) for (let j = i + 1; j < M.length; j++) for (const ax of ['u', 's']) row.push([i, j, ax, pair(g, i, j, g[ax]).p]);
      hist.push(row); if (hist.length > 3) hist.shift();
      if (hist.length === 3) row.forEach(([i, j, ax], k) => {
        if (!(hist[1][k][3] < hist[0][k][3] && hist[1][k][3] <= hist[2][k][3]) || hist[1][k][3] > 40000) return;
        let a = t - 2 * STEP, b = t; const f = (x) => { const q = geo(x); return pair(q, i, j, q[ax]).p; };
        while (b - a > 2000) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (f(m1) < f(m2)) b = m2; else a = m1; }
        const tm = (a + b) / 2, q = geo(tm), V = pair(q, i, j, q[ax]), [near, far] = V.z > 0 ? [i, j] : [j, i];
        const reach = M[i][2] + M[j][2] + (ax === 's' ? Math.abs(V.z) * 695700 / q.dSun * 0.3 : 0);
        if (V.p >= reach) return;
        // skip what happens behind or in the shadow of the planet
        if (KINDS.occultation(q, i) || KINDS.occultation(q, j) || KINDS.eclipse(q, i) || KINDS.eclipse(q, j)) return;
        out.push({ t: tm, end: null, kind: 'mutual', moon: M[far][0], text: ax === 'u' ? `${M[near][0]} covers ${M[far][0]}${V.p > Math.abs(M[near][2] - M[far][2]) ? ' partly' : ''}` : `${M[near][0]}’s shadow on ${M[far][0]}` });
      });
    }
    if (out.length >= n + 6) break;
  }
  if (kinds.has('spot')) {
    const lim = out.length ? Math.max(...out.map((e) => e.t)) : t0 + span;
    let t = t0;
    for (let k = 0; k < n && t < lim; k++) {
      const g = geometry(t), ax = bodyAxes('Jupiter', g.tr.tt), cml = jupiterSystems(subPoint(ax, scale(g.u, -1)).lon, g.tr.tt).II, tt = g.time.tt;
      if (!grsLongitude(g.tr.tt).ok) break;
      const x = nextGrsTransit(tt, (y) => cml + 870.27 * (y - tt), tt - g.tr.tt), ms = t + (x - tt) * 86400000;
      out.push({ t: ms, end: null, kind: 'spot', moon: null, text: 'Great Red Spot at the center' }); t = ms + 3600000;
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, n);
}
export { RAD, mod };
