// check-bodies.mjs: positions, orientations and magnitudes of the Sun, Moon, planets, moons and small bodies against JPL Horizons (tools/orient-truth.json, fetched
// 2026-11-24 from the geocentre by fetch_orient_truth.py), and the Great Red Spot. Run by check.mjs (section 24) or alone: node tools/check-bodies.mjs. A failure throws.
import { readFileSync } from 'node:fs';
import { A } from './check-env.mjs';
if (!globalThis.__catFetch) globalThis.fetch = async (url) => { const buf = readFileSync(new URL(url)); return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
const O = await import('../js/orient.js'), { makeFrame } = await import('../js/skyframe.js'), E = await import('../js/ephem.js'), M = await import('../js/moons.js'), X = await import('../js/astro.js');
const wrap = (d) => ((d + 540) % 360 + 360) % 360 - 180;
export async function checkBodies(line = console.log) {
  if (!M.small.data) await M.loadSmallBodies();
  const T = JSON.parse(readFileSync(new URL('./orient-truth.json', import.meta.url)));
  const worst = {}, bad = [];
  T.dates.forEach((ds, k) => {
    const f = makeFrame(Date.parse(ds.replace(' ', 'T') + ':00Z'), { lat: 0, lon: 0, elev: -6378137 });
    const B = E.compute(f, true, false);                 // no aberration: Horizons' quantity 1 is astrometric
    for (const [id, rows] of Object.entries(T.bodies)) {
      const h = rows[k], b = B.byId[id]; if (!h || !b) { continue; }
      const w = worst[id] || (worst[id] = { pos: 0, lon: 0, lat: 0, slat: 0, pa: 0, mag: 0, n: 0 }); w.n++;
      const j = X.toSph(b.u); let dr = wrap(j.lon - h.ra) * Math.cos(j.lat * X.DEG), dd = j.lat - h.dec;
      if (b.parent) { const P = X.toSph(B.byId[b.parent].u), H = T.bodies[b.parent][k]; dr -= wrap(P.lon - H.ra) * Math.cos(P.lat * X.DEG); dd -= P.lat - H.dec; }      // a moon: its place beside its planet
      if (id !== 'Moon') w.pos = Math.max(w.pos, Math.hypot(dr, dd) * 3600);      // (the Moon's astrometric place in Horizons carries the Earth's motion: check.mjs sections 4 and 12 test it)
      if (h.mag != null && b.mag < 40) w.mag = Math.max(w.mag, Math.abs(b.mag - h.mag));
      const ax = O.bodyAxes(id, b.ttSeen); if (!ax || h.lon == null) { w.noface = true; continue; }
      const fig = O.figure(id), e = O.subPoint(ax, b.u.map((v) => -v), fig), s = b.toSun && O.subPoint(ax, b.toSun, fig);
      // Horizons: planetographic (west-positive for prograde planets and most moons; east for Earth's Moon, the Sun, Venus, Uranus, Pluto, Ceres ...): take whichever sense fits, once per body
      const dE = wrap(e.lon - h.lon), dW = wrap(360 - e.lon - h.lon); w.e = (w.e || 0) + Math.abs(dE); w.w = (w.w || 0) + Math.abs(dW); (w.dl = w.dl || []).push([dE, dW]);
      w.lat = Math.max(w.lat, Math.min(Math.abs(e.latG - h.lat), Math.abs(e.lat - h.lat), Math.abs(-e.latG - h.lat)));
      if (s && h.slat != null) w.slat = Math.max(w.slat, Math.min(Math.abs(s.latG - h.slat), Math.abs(s.lat - h.slat), Math.abs(-s.latG - h.slat)));
      if (h.pa != null) {      // Horizons' NP.ang is on the true equator of date
        const u = X.mulMV(f.Mjd, b.u), z = X.mulMV(f.Mjd, ax.z), q = X.toSph(u), Ea = [-Math.sin(q.lon * X.DEG), Math.cos(q.lon * X.DEG), 0], Na = X.cross(u, Ea);
        const pa = Math.atan2(X.dot(z, Ea), X.dot(z, Na)) * X.RAD; let d = Math.abs(wrap(pa - h.pa)); w.pa = Math.max(w.pa, d);
      }
    }
  });
  line('  worst of 4 dates (2000, 2015, 2026, 2031) against JPL Horizons, geocentric: place in arcsec; face turned to us: longitude, latitude; subsolar latitude; pole PA in degrees; magnitude');
  for (const [id, w] of Object.entries(worst)) {
    const useE = (w.e || 0) <= (w.w || 0); const dl = w.dl ? Math.max(...w.dl.map((x) => Math.abs(x[useE ? 0 : 1]))) : null; w.lonErr = dl;
    line(`  ${id.padEnd(10)} place ${w.pos.toFixed(2).padStart(6)}"  ` + (dl == null ? 'no rotation model' : `lon ${dl.toFixed(3)} (${useE ? 'E' : 'W'})  lat ${w.lat.toFixed(3)}  sun lat ${w.slat.toFixed(3)}  PA ${w.pa.toFixed(3)}`) + `  mag ${w.mag.toFixed(2)}`);
    const planet = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'].includes(id);      // astronomy-engine's own accuracy (truncated VSOP)
    if (w.pos > (planet ? 25 : id === 'Hyperion' ? 2 : 1.2)) bad.push(`${id} place ${w.pos.toFixed(2)}`);
    if (dl != null && dl > 0.6 && id !== 'Vesta') bad.push(`${id} longitude ${dl.toFixed(2)}`);
  }
  // the Great Red Spot
  const cml = (ms) => { const f = makeFrame(ms, { lat: 0, lon: 0, elev: -6378137 }), b = E.compute(f, true, true).byId.Jupiter, e = O.subPoint(O.bodyAxes('Jupiter', b.ttSeen), b.u.map((v) => -v)); return { ...O.jupiterSystems(e.lon, b.ttSeen), tt: b.ttSeen, now: f.time.tt, tau: b.lightMin / 1440, lon: e.lon }; };
  const t0 = Date.parse('2026-11-24T06:00:00Z'), c0 = cml(t0), t = O.nextGrsTransit(c0.now, (x) => c0.II + 870.27 * (x - c0.now), c0.tau), ms = t0 + (t - c0.now) * 86400000, c1 = cml(ms);
  line(`  Great Red Spot: System II ${O.grsLongitude(c0.tt).lon.toFixed(1)} deg on 2026-11-24; next transit after 06:00 UT: ${new Date(ms).toISOString().slice(11, 16)} UT; CML II then ${c1.II.toFixed(2)}, spot's east longitude minus disc centre ${wrap(O.grsEast(c1.tt) - c1.lon).toFixed(2)} deg`);
  if (Math.abs(wrap(O.grsEast(c1.tt) - c1.lon)) > 0.5) bad.push('GRS transit');
  if (bad.length) throw new Error('check-bodies: ' + bad.join('; '));
}
if (process.argv[1] && process.argv[1].endsWith('check-bodies.mjs')) await checkBodies();
