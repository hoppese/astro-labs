// labs/jovian.js: what Jupiter's four large moons do, found from the same positions the picture is drawn from (geocentric, light time included):
// transits of the disc, shadows on it, eclipses in Jupiter's shadow, occultations behind it, the moons covering or shadowing one another, and the
// Great Red Spot crossing the centre. Times are when the moon's centre (or half its light) crosses the edge.

import { A, AU_KM, C_AU_PER_DAY, RAD, vecOf, sub, scale, len, dot, unit, mod } from '../astro.js';
import { hiddenFraction, BODIES } from '../ephem.js';
import { bodyAxes, subPoint, jupiterSystems, nextGrsTransit, grsLongitude } from '../orient.js';

const J = BODIES.find((b) => b.id === 'Jupiter');
export const MOONS = [['Io', 'io', 1821.6], ['Europa', 'europa', 1560.8], ['Ganymede', 'ganymede', 2634.1], ['Callisto', 'callisto', 2410.3]];
/** Geometry at the instant (ms): moons from Jupiter (au), line of sight u, shadow direction s (away from the Sun), pole. */
export function geometry(ms) {
  const time = A.MakeTime(new Date(ms)), g = vecOf(A.GeoVector('Jupiter', time, false)), d = len(g), tr = time.AddDays(-d / C_AU_PER_DAY);
  const jm = A.JupiterMoons(tr), hel = vecOf(A.HelioVector('Jupiter', tr));
  return { time, tr, u: unit(g), d, s: unit(hel), dSun: len(hel) * AU_KM, pole: bodyAxes('Jupiter', tr.tt).z, rel: MOONS.map(([, k]) => vecOf(jm[k])) };
}
const KINDS = {
  transit: (g, i) => { const h = hiddenFraction(g.rel[i], scale(g.u, -1), g.pole, J, MOONS[i][2]); return h.depth > 0 && h.frac < 0.5; },
  shadow: (g, i) => { const h = hiddenFraction(g.rel[i], scale(g.s, -1), g.pole, J, MOONS[i][2]); return h.depth > 0 && h.frac < 0.5; },
  occultation: (g, i) => { const h = hiddenFraction(g.rel[i], g.u, g.pole, J, MOONS[i][2]); return h.depth > 0 && h.frac < 0.5; },
  eclipse: (g, i) => { const h = hiddenFraction(g.rel[i], g.s, g.pole, J, MOONS[i][2], (695700 - J.radiusKm) / g.dSun, (695700 + J.radiusKm) / g.dSun); return h.depth > 0 && h.frac < 0.5; },
};
const NAME = { transit: (m) => `${m} in front of Jupiter`, shadow: (m) => `${m}’s shadow on Jupiter`, occultation: (m) => `${m} behind Jupiter`, eclipse: (m) => `${m} in Jupiter’s shadow` };
const STEP = 12 * 60000;
/** Distance (km) between moons i and j across the line `axis`, and how far j is beyond i along it. */
function pair(g, i, j, axis) { const d = scale(sub(g.rel[j], g.rel[i]), AU_KM), z = dot(d, axis); return { z, p: len(sub(d, scale(axis, z))) }; }

/** Events whose start lies in [t0, t0 + span], at most n, in order. opt.kinds: subset of transit, shadow, occultation, eclipse, mutual, spot. */
export function jovianEvents(t0, n = 8, opt = {}) {
  const kinds = new Set(opt.kinds || ['transit', 'shadow', 'occultation', 'eclipse', 'mutual', 'spot']), span = opt.span || 40 * 86400000, out = [];
  const keys = Object.keys(KINDS).filter((k) => kinds.has(k)), on = {}, hist = [];
  const edge = (k, i, a, b, rising) => { while (b - a > 2000) { const m = (a + b) / 2; if (KINDS[k](geometry(m), i) === rising) b = m; else a = m; } return (a + b) / 2; };
  const end = (k, i, t) => { let b = t + 60000; while (b < t + 12 * 3600000 && KINDS[k](geometry(b), i)) b += STEP; return edge(k, i, b - STEP, b, false); };
  for (let t = t0; t < t0 + span; t += STEP) {
    const g = geometry(t);
    for (const k of keys) for (let i = 0; i < 4; i++) {
      const v = KINDS[k](g, i), id = k + i;
      if (t === t0) { on[id] = v; continue; }
      if (v && !on[id]) { const s = edge(k, i, t - STEP, t, true), e = end(k, i, s); out.push({ t: s, end: e, kind: k, moon: MOONS[i][0], text: NAME[k](MOONS[i][0]) }); }
      on[id] = v;
    }
    if (kinds.has('mutual')) {
      const row = []; for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) for (const ax of ['u', 's']) row.push([i, j, ax, pair(g, i, j, g[ax]).p]);
      hist.push(row); if (hist.length > 3) hist.shift();
      if (hist.length === 3) row.forEach(([i, j, ax], k) => {
        if (!(hist[1][k][3] < hist[0][k][3] && hist[1][k][3] <= hist[2][k][3]) || hist[1][k][3] > 40000) return;
        let a = t - 2 * STEP, b = t; const f = (x) => { const q = geometry(x); return pair(q, i, j, q[ax]).p; };
        while (b - a > 2000) { const m1 = a + (b - a) / 3, m2 = b - (b - a) / 3; if (f(m1) < f(m2)) b = m2; else a = m1; }
        const tm = (a + b) / 2, q = geometry(tm), P = pair(q, i, j, q[ax]), [near, far] = P.z > 0 ? [i, j] : [j, i];
        const reach = MOONS[i][2] + MOONS[j][2] + (ax === 's' ? Math.abs(P.z) * 695700 / q.dSun * 0.3 : 0);
        if (P.p >= reach) return;
        // skip what happens behind or in the shadow of Jupiter
        if (KINDS.occultation(q, i) || KINDS.occultation(q, j) || KINDS.eclipse(q, i) || KINDS.eclipse(q, j)) return;
        out.push({ t: tm, end: null, kind: 'mutual', moon: MOONS[far][0], text: ax === 'u' ? `${MOONS[near][0]} covers ${MOONS[far][0]}${P.p > Math.abs(MOONS[near][2] - MOONS[far][2]) ? ' partly' : ''}` : `${MOONS[near][0]}’s shadow on ${MOONS[far][0]}` });
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
      out.push({ t: ms, end: null, kind: 'spot', moon: null, text: 'Great Red Spot at the centre' }); t = ms + 3600000;
    }
  }
  out.sort((a, b) => a.t - b.t);
  return out.slice(0, n);
}
export { RAD, mod };
