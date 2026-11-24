// Section 25 of check.mjs: every body against JPL Horizons, 1600-2200, and no steps in time. A failure throws.
import { readFileSync } from 'node:fs';
import { A } from './check-env.mjs';
export default async function checkJpl(line) {
  const { makeFrame } = await import('../js/skyframe.js'), E = await import('../js/ephem.js'), X = await import('../js/astro.js'), J = await import('../js/jpl.js'), D = await import('../js/deltat.js');
  line(); line('== 25. Positions against JPL Horizons, apparent, topocentric at Richmond (arcsec; the same TT; js/jpl.js) ==');
  const d = JSON.parse(readFileSync(new URL('./jpl-truth.json', import.meta.url))), RICH = { lat: 39.83, lon: -84.89, elev: 300 };
  const ids = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'], worst = {}, geo = [];
  line('  date        dT app - Horizons  ' + ids.map((s) => s.slice(0, 7).padStart(7)).join(' '));
  d.jd.forEach((jd, i) => {
    let t = (jd - 2440587.5) * 864e5, fr = makeFrame(t, RICH); const ddt = (fr.time.tt - fr.time.ut) * 86400 - d.dt[i];
    t -= ddt * 1000; fr = makeFrame(t, RICH);
    const b = E.compute(fr, true).byId, old = jd < 2437684.5 || jd > 2461480;
    const row = ids.map((id) => {
      let w = X.sph(d[id][i][0], d[id][i][1]), u = b[id].u;
      // Horizons: IAU 1976/80 frame without Earth-orientation corrections before 1962 and after the prediction ends; with them in between (53 mas in right ascension from IAU 2006)
      if (old) { const M = d.m[i]; w = [0, 1, 2].map((k) => M[k] * w[0] + M[3 + k] * w[1] + M[6 + k] * w[2]); } else { w = X.sph(d[id][i][0] + 0.053 / 3600, d[id][i][1]); u = X.mulMV(fr.Mjd, u); }
      const s = X.angleBetween(u, w) * 3600; if (id !== 'Moon' || jd < 2461480) worst[id] = Math.max(worst[id] || 0, s); return s;
    });
    line('  ' + new Date(t).toISOString().slice(0, 10) + ddt.toFixed(3).padStart(13) + '      ' + row.map((x) => x.toFixed(3).padStart(7)).join(' '));
    const f2 = makeFrame(t, RICH); f2.opos = [0, 0, 0]; geo.push(X.angleBetween(E.apparent('Moon', f2, false).seen, X.sph(...d.geoMoon[i])) * 3600);
  });
  line('  worst' + ' '.repeat(24) + ids.map((x) => worst[x].toFixed(3).padStart(7)).join(' '));
  line('  (0.065 before 1962 and 0.115 after 2027 are common to all bodies: the constant offset between Horizons\' old frame and IAU 2006. Moon topocentric after 2027 differs because Horizons stops counting leap seconds.)');
  line('  Moon, geocentric, all 24 dates: ' + geo.map((x) => x.toFixed(2)).join(' '));
  for (const id of ids) if (worst[id] > (id === 'Moon' ? 0.45 : 0.2)) throw new Error(id + ' is ' + worst[id] + '" from Horizons');
  if (Math.max(...geo) > 0.3) throw new Error('Moon');
  // continuity: 4th differences of every body's J2000 direction, 1-minute steps over the joints of the segments and the edges of the sets
  let step = {}; const probe = (t0, dt, n) => { const h = {}; for (let i = 0; i < n; i++) { const b = E.compute(makeFrame(t0 + i * dt, RICH), true); for (const o of b.list) { if (!ids.includes(o.id)) continue; const a = (h[o.id] = h[o.id] || []); a.push(o.u); if (a.length > 5) a.shift(); if (a.length === 5) { const v = [0, 1, 2].map((c) => a[0][c] - 4 * a[1][c] + 6 * a[2][c] - 4 * a[3][c] + a[4][c]); step[o.id] = Math.max(step[o.id] || 0, X.len(v) * X.RAD * 3600); } } } };
  const ms = (tt) => (tt + 10957.5) * 864e5;
  for (const tt of [-164300 + 9 * 18240, -164300 + 9 * 18240 + 64 * 100, -164300 + 9 * 18240 + 32 * 211, -164300 + 9 * 18240 + 304 * 33, -164300 + 10 * 18240]) probe(ms(tt) - 15 * 60000, 60000, 30);
  line('  largest step across segment joints (4th difference, arcsec): ' + ids.map((i) => i + ' ' + step[i].toFixed(4)).join(', '));
  for (const i of ids) if (step[i] > (i === 'Moon' ? 0.3 : 0.15)) throw new Error('step in ' + i);
  line('  Delta T (TT - UT1) used: ' + [-1000, 0, 1000, 1600, 1800, 1900, 1962, 2000, 2026.9, 2050, 2100, 2200].map((y) => y + ': ' + D.deltaT((y - 2000) * 365.2425).toFixed(1) + ' s').join(', '));
  // the library's own events run on the same positions
  const e = A.SearchLunarEclipse(new Date('2026-12-01')); line('  engine is patched: ' + !!A.SetEphemeris + '; stretches loaded ' + [...J.jpl.chunks.values()].filter((c) => c.state === 1).length + '; next lunar eclipse ' + e.peak.date.toISOString().slice(0, 19));
}
