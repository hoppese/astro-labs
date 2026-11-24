// Correctness checks, run in Node against the same modules the page uses.
//   node tools/check.mjs
// Prints numbers to compare with astronomy-engine's own Horizon() and with published values.
import { readFileSync } from 'node:fs';
import { A } from './check-env.mjs';

// catalog.js loads data with fetch(); serve file: URLs from disk
globalThis.fetch = async (url) => {
  const buf = readFileSync(new URL(url));
  return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) };
};
const { makeFrame } = await import('../js/skyframe.js');
const E = await import('../js/ephem.js');
const C = await import('../js/catalog.js');
const X = await import('../js/astro.js');
const { state } = await import('../js/state.js');

await C.loadCore();
const RICHMOND = { lat: 39.83, lon: -84.89, elev: 300 };
const star = (name) => { for (const i of Object.keys(C.stars.names.name)) if (C.stars.names.name[i] === name) return C.starRecord(0, +i); throw new Error(name); };
const utc = (s) => Date.parse(s);
const f2 = (v, n = 2) => v.toFixed(n);
const line = (s = '') => console.log(s);
/** Apparent alt/az of a catalogue star through the app's own pipeline. */
function appAltAz(s, frame, refr = true) {
  let h = frame.starHor(s.vec);
  h = X.unit(h);
  if (refr) h = X.refractHor(h);
  return X.horToAzAlt(h);
}
/** The same star through astronomy-engine alone: DefineStar -> Equator(of date, aberration) -> Horizon('normal'). */
function aeAltAz(s, frame) {
  const j = X.toSph(s.vec);
  A.DefineStar(A.Body.Star1, j.lon / 15, j.lat, 1000);
  const eq = A.Equator(A.Body.Star1, frame.time, frame.obs, true, true);
  const h = A.Horizon(frame.time, frame.obs, eq.ra, eq.dec, 'normal');
  return { az: h.azimuth, alt: h.altitude };
}

line('== 1. Polaris altitude vs latitude (Richmond, 39.83 N) ==');
{
  const t0 = utc('2026-11-24T02:00:00Z'); C.setStarEpoch(makeFrame(t0, RICHMOND).years);
  const pol = star('Polaris');
  let lo = 99, hi = -99, sum = 0, n = 0;
  for (let k = 0; k < 96; k++) { const a = appAltAz(pol, makeFrame(t0 + k * 86164090.5 / 96, RICHMOND), false).alt; lo = Math.min(lo, a); hi = Math.max(hi, a); sum += a; n++; }
  line(`  altitude now ${f2(appAltAz(pol, makeFrame(t0, RICHMOND)).alt, 3)} deg; over a sidereal day (no refraction) min ${f2(lo, 3)}  max ${f2(hi, 3)}  mean ${f2(sum / n, 3)}  (latitude 39.830)`);
}

line('== 2. Star alt/az: app pipeline vs astronomy-engine Horizon() at 2026-11-24 04:00 UTC ==');
{
  const fr = makeFrame(utc('2026-11-24T04:00:00Z'), RICHMOND); C.setStarEpoch(fr.years);
  for (const nm of ['Sirius', 'Vega', 'Betelgeuse', 'Polaris', 'Capella']) {
    const s = star(nm), a = appAltAz(s, fr), b = aeAltAz(s, fr);
    line(`  ${nm.padEnd(11)} app az ${f2(a.az, 4)} alt ${f2(a.alt, 4)} | AE az ${f2(b.az, 4)} alt ${f2(b.alt, 4)} | diff az ${f2((a.az - b.az) * 3600 * Math.cos(a.alt * X.DEG), 1)}" alt ${f2((a.alt - b.alt) * 3600, 1)}"`);
  }
  line('  planets: app (Equator J2000 vector -> Mjh -> refraction) vs AE Horizon(of-date RA/Dec)');
  const bodies = E.compute(fr, true);
  for (const id of ['Moon', 'Jupiter', 'Saturn', 'Mars']) {
    const a = X.horToAzAlt(X.refractHor(bodies.byId[id].hor));
    const eq = A.Equator(id, fr.time, fr.obs, true, true), h = A.Horizon(fr.time, fr.obs, eq.ra, eq.dec, 'normal');
    line(`  ${id.padEnd(11)} app az ${f2(a.az, 4)} alt ${f2(a.alt, 4)} | AE az ${f2(h.azimuth, 4)} alt ${f2(h.altitude, 4)} | diff az ${f2((a.az - h.azimuth) * 3600 * Math.cos(a.alt * X.DEG), 1)}" alt ${f2((a.alt - h.altitude) * 3600, 1)}"`);
  }
}

line('== 3. Sun rise/set at Richmond, 2026-06-21 and 2026-12-21 (local = UTC-4 / UTC-5) ==');
for (const [d, off] of [['2026-06-21', -4], ['2026-12-21', -5]]) {
  const fr = makeFrame(utc(d + 'T08:00:00Z'), RICHMOND);
  const rise = A.SearchRiseSet('Sun', fr.obs, +1, fr.time, 1), set = A.SearchRiseSet('Sun', fr.obs, -1, fr.time, 1);
  const loc = (t) => new Date(t.date.getTime() + off * 3600000).toISOString().slice(11, 19);
  // the app's own picture at the rise instant: apparent altitude of the Sun's upper limb should be 0
  const b = E.compute(makeFrame(rise.date.getTime(), RICHMOND), true).byId.Sun;
  const upper = X.horToAzAlt(X.refractHor(b.hor)).alt + b.angRadius;
  line(`  ${d}: sunrise ${loc(rise)}  sunset ${loc(set)} local; app's upper-limb apparent altitude at that sunrise ${f2(upper * 60, 2)} arcmin`);
}

line('== 4. Moon phase ==');
for (const d of ['2026-11-24T14:53:00Z', '2026-12-09T00:52:00Z', '2026-11-17T11:48:00Z']) {
  const fr = makeFrame(utc(d), RICHMOND), m = E.compute(fr, true).byId.Moon;
  line(`  ${d}: elongation in ecliptic longitude ${f2(A.MoonPhase(fr.time), 2)} deg, illuminated ${f2(m.phaseFrac * 100, 2)}%, phase angle ${f2(m.phaseAngle, 2)} deg`);
}
{
  const q = A.SearchMoonQuarter(A.MakeTime(new Date(utc('2026-11-01T00:00:00Z'))));
  let mq = q; const out = [];
  for (let i = 0; i < 5; i++) { out.push(['new', 'first quarter', 'full', 'last quarter'][mq.quarter] + ' ' + mq.time.date.toISOString().slice(0, 16)); mq = A.NextMoonQuarter(mq); }
  line('  astronomy-engine quarters: ' + out.join('; '));
}

line('== 5. Total solar eclipse 2024-04-08 at Richmond (39.83 N, 84.89 W) ==');
{
  let best = null;
  for (let t = utc('2024-04-08T18:30:00Z'); t <= utc('2024-04-08T19:40:00Z'); t += 5000) {
    const b = E.compute(makeFrame(t, RICHMOND), true), sep = X.angleBetween(b.byId.Sun.u, b.byId.Moon.u);
    if (!best || sep < best.sep) best = { t, sep, rs: b.byId.Sun.angRadius, rm: b.byId.Moon.angRadius };
  }
  let t1 = null, t2 = null;
  for (let t = utc('2024-04-08T19:00:00Z'); t <= utc('2024-04-08T19:20:00Z'); t += 1000) {
    const b = E.compute(makeFrame(t, RICHMOND), true), sep = X.angleBetween(b.byId.Sun.u, b.byId.Moon.u);
    if (sep < b.byId.Moon.angRadius - b.byId.Sun.angRadius) { if (!t1) t1 = t; t2 = t; }
  }
  const hh = (t) => new Date(t).toISOString().slice(11, 19);
  line(`  closest approach ${hh(best.t)} UTC: centres ${f2(best.sep * 3600, 1)}" apart; Sun radius ${f2(best.rs * 3600, 1)}", Moon radius ${f2(best.rm * 3600, 1)}"`);
  line(t1 ? `  Moon fully covers the Sun from ${hh(t1)} to ${hh(t2)} UTC (${(t2 - t1) / 1000 + 1} s)` : '  NOT total at this site');
  const le = A.SearchLocalSolarEclipse(A.MakeTime(new Date(utc('2024-04-01T00:00:00Z'))), new A.Observer(RICHMOND.lat, RICHMOND.lon, RICHMOND.elev));
  line(`  astronomy-engine SearchLocalSolarEclipse: ${le.kind}, total ${le.total_begin ? hh(le.total_begin.time.date.getTime()) : '-'} to ${le.total_end ? hh(le.total_end.time.date.getTime()) : '-'} UTC, peak ${hh(le.peak.time.date.getTime())}`);
}

line("== 6. Jupiter's moons, 2026-11-24 09:00 UTC: offsets east(+)/west(-) and north(+) of Jupiter, arcsec ==");
{
  const fr = makeFrame(utc('2026-11-24T09:00:00Z'), RICHMOND), b = E.compute(fr, true), J = b.byId.Jupiter;
  const jr = X.toSph(J.u);
  const rows = J.moons.map((m) => {
    const s = X.toSph(m.u);
    return { id: m.id, dx: (X.mod(s.lon - jr.lon + 180, 360) - 180) * Math.cos(jr.lat * X.DEG) * 3600, dy: (s.lat - jr.lat) * 3600, behind: m.behind };
  });
  // independent route: astronomy-engine's jovicentric vectors added to GeoVector, no app code
  const lt = A.GeoVector('Jupiter', fr.time, true), jm = A.JupiterMoons(fr.time.AddDays(-Math.hypot(lt.x, lt.y, lt.z) / X.C_AU_PER_DAY));
  const ref = ['io', 'europa', 'ganymede', 'callisto'].map((k) => {
    const v = [lt.x + jm[k].x, lt.y + jm[k].y, lt.z + jm[k].z], s = X.toSph(v), j0 = X.toSph([lt.x, lt.y, lt.z]);
    return { id: k, dx: (X.mod(s.lon - j0.lon + 180, 360) - 180) * Math.cos(j0.lat * X.DEG) * 3600, dy: (s.lat - j0.lat) * 3600 };
  });
  rows.forEach((r, i) => line(`  ${r.id.padEnd(9)} app dx ${f2(r.dx, 1).padStart(7)} dy ${f2(r.dy, 1).padStart(7)} ${r.behind ? 'far side ' : 'near side'} | AE geocentric dx ${f2(ref[i].dx, 1).padStart(7)} dy ${f2(ref[i].dy, 1).padStart(7)}`));
  line('  order west -> east (app): ' + rows.slice().sort((a, c) => a.dx - c.dx).map((r) => r.id).join(', ') + '   (AE): ' + ref.slice().sort((a, c) => a.dx - c.dx).map((r) => r.id).join(', '));
}

line("== 7. Saturn's ring tilt (sub-Earth latitude from Saturn's pole; + = north face) ==");
for (const d of ['2017-10-15T00:00:00Z', '2025-03-23T12:00:00Z', '2026-11-24T02:00:00Z', '2032-05-01T00:00:00Z']) {
  const fr = makeFrame(utc(d), RICHMOND), s = E.compute(fr, true).byId.Saturn;
  line(`  ${d.slice(0, 10)}: app ${f2(s.ringTilt, 2)} deg | astronomy-engine Illumination().ring_tilt ${f2(A.Illumination('Saturn', fr.time).ring_tilt, 2)} deg (its sign convention is opposite)`);
}

line('== 8. Angular distances from the star catalogue ==');
{
  C.setStarEpoch(0);
  const sep = (a, b) => X.angleBetween(star(a).vec, star(b).vec);
  line(`  Dubhe-Merak ${f2(sep('Dubhe', 'Merak'), 3)} deg (expected 5.37);  Pollux-Castor ${f2(sep('Pollux', 'Castor'), 3)} deg (expected 4.5);  Betelgeuse-Rigel ${f2(sep('Betelgeuse', 'Rigel'), 3)} deg (expected 18.6)`);
}

line('== 9. Light-travel time ==');
{
  let lo = 1e9, hi = 0;
  for (let t = utc('2026-01-01T00:00:00Z'); t < utc('2027-06-01T00:00:00Z'); t += 5 * 86400000) { const l = E.compute(makeFrame(t, RICHMOND), true).byId.Jupiter.lightMin; lo = Math.min(lo, l); hi = Math.max(hi, l); }
  const b = E.compute(makeFrame(utc('2026-11-24T02:00:00Z'), RICHMOND), true).byId;
  line(`  Jupiter ${f2(lo, 1)} to ${f2(hi, 1)} min over 2026-01..2027-05;  now: Jupiter ${f2(b.Jupiter.lightMin, 1)} min, Sun ${f2(b.Sun.lightMin, 2)} min, Moon ${f2(b.Moon.lightMin * 60, 2)} s`);
  line(`  seen-vs-geometric shift now: Sun ${f2(b.Sun.shiftDeg * 3600, 1)}", Jupiter ${f2(b.Jupiter.shiftDeg * 3600, 1)}", Saturn ${f2(b.Saturn.shiftDeg * 3600, 1)}", Moon ${f2(b.Moon.shiftDeg * 3600, 2)}"`);
}

line('== 11. Precession, parallax of the observer, transit of Venus ==');
{
  for (const [y, nm] of [[-2700, 'Thuban'], [2026, 'Polaris'], [2026, 'Thuban']]) {
    const d = new Date(Date.UTC(2000, 0, 1)); d.setUTCFullYear(y);
    const fr = makeFrame(d.getTime(), RICHMOND); C.setStarEpoch(fr.years);
    const s = X.toSph(X.mulMV(fr.Mjd, star(nm).vec));
    line(`  year ${y}: ${nm} declination of date ${f2(s.lat, 2)} deg (${f2(90 - s.lat, 2)} deg from the pole)`);
  }
  const t = utc('2026-11-24T02:00:00Z');
  const a = E.compute(makeFrame(t, RICHMOND), true).byId.Moon, b = E.compute(makeFrame(t, { lat: -33.92, lon: 18.42, elev: 0 }), true).byId.Moon;
  line(`  Moon seen from Richmond vs Cape Town at the same instant: ${f2(X.angleBetween(a.u, b.u), 3)} deg apart; angular diameter ${f2(a.angRadius * 120, 2)}' vs ${f2(b.angRadius * 120, 2)}'`);
  // Venus transit 2012-06-05/06: minimum Sun-Venus separation for two sites
  for (const [nm, loc] of [['Richmond', RICHMOND], ['Honolulu', { lat: 21.31, lon: -157.86, elev: 0 }], ['Sydney', { lat: -33.87, lon: 151.21, elev: 0 }]]) {
    let best = null, c1 = null, c4 = null;
    for (let tt = utc('2012-06-05T21:30:00Z'); tt <= utc('2012-06-06T05:30:00Z'); tt += 10000) {
      const bb = E.compute(makeFrame(tt, loc), true).byId, sep = X.angleBetween(bb.Sun.u, bb.Venus.u);
      if (!best || sep < best.sep) best = { tt, sep, rs: bb.Sun.angRadius, rv: bb.Venus.angRadius };
      if (sep < bb.Sun.angRadius + bb.Venus.angRadius) { if (!c1) c1 = tt; c4 = tt; }
    }
    const hh = (x) => new Date(x).toISOString().slice(11, 19);
    line(`  Venus transit 2012 from ${nm}: contact I ${hh(c1)}, contact IV ${hh(c4)} UTC, least separation ${f2(best.sep * 3600, 1)}" at ${hh(best.tt)}; Venus diameter ${f2(best.rv * 7200, 1)}", Sun ${f2(best.rs * 120, 2)}'`);
  }
  const tr = A.SearchTransit('Venus', A.MakeTime(new Date(utc('2012-01-01T00:00:00Z'))));
  line(`  astronomy-engine SearchTransit (geocentric): start ${tr.start.date.toISOString().slice(11, 19)}, peak ${tr.peak.date.toISOString().slice(11, 19)}, finish ${tr.finish.date.toISOString().slice(11, 19)}, separation ${f2(tr.separation * 60, 1)}"`);
}

line('== 10. Data ==');
line(`  stars tier 0: ${C.stars.tiers[0].n};  tiers: ${C.stars.tiers.map((t) => t.n + ' to mag ' + t.magMax).join(' | ')}`);
line(`  constellations ${C.constellations.length};  DSO (start set) ${C.dso.rows.length}, with redshift ${C.dso.rows.filter((o) => o.z != null).length}`);

// =====================================================================================================
// Tier 4 (measurement labs): numerical checks of the tools in js/labs/ and of the effects they switch.
// =====================================================================================================
globalThis.document = globalThis.document || { createElement: () => ({}) };
const SH = await import('../js/labs/shadow.js');
const hms = (t) => new Date(t).toISOString().slice(11, 19);
/** First instant in [a, b] (ms) at which f(t) becomes true, to the second (f false at a, true at b). */
function cross(f, a, b) { while (b - a > 1000) { const m = Math.round((a + b) / 2000) * 1000; if (f(m)) b = m; else a = m; } return b; }

line('== 12. Lunar eclipse contacts: app shadow model vs astronomy-engine SearchLunarEclipse (UTC) ==');
for (const d of ['2018-07-01', '2019-01-01', '2000-07-01', '2029-06-01', '2025-03-01']) {
  const e = A.SearchLunarEclipse(A.MakeTime(new Date(d + 'T00:00:00Z')));
  const p = e.peak.date.getTime(), site = { lat: 0, lon: 0, elev: 0 };
  const sh = (t) => SH.earthShadow(makeFrame(t, site), false);
  const inU = (t) => { const s = sh(t); return s.moonOffKm < s.umbraKm + 1737.4; }, tot = (t) => { const s = sh(t); return s.moonOffKm < s.umbraKm - 1737.4; };
  const u1 = cross(inU, p - 4 * 3600e3, p), u4 = cross((t) => !inU(t), p, p + 4 * 3600e3);
  let txt = `  ${e.peak.date.toISOString().slice(0, 10)} ${e.kind}: U1 app ${hms(u1)} AE ${hms(p - e.sd_partial * 60000)} | U4 app ${hms(u4)} AE ${hms(p + e.sd_partial * 60000)}`;
  if (e.sd_total > 0) { const u2 = cross(tot, p - 2 * 3600e3, p), u3 = cross((t) => !tot(t), p, p + 2 * 3600e3); txt += ` | U2 app ${hms(u2)} AE ${hms(p - e.sd_total * 60000)} | U3 app ${hms(u3)} AE ${hms(p + e.sd_total * 60000)}`; }
  const s0 = sh(p);
  line(txt + ` | umbra / Moon diameter at greatest eclipse ${f2(s0.umbraKm / 1737.4, 3)}, penumbra ${f2(s0.penumbraKm / 1737.4, 3)}`);
}
{
  // what is drawn (angles seen from a site, light time on) against the same contact defined in km at the Earth's centre
  const NAI = { lat: -1.29, lon: 36.82, elev: 0 };
  const drawn = (t) => { const fr = makeFrame(t, NAI), s = SH.earthShadow(fr, true), m = E.compute(fr, true).byId.Moon; return X.angleBetween(s.u, m.u) < s.umbra + m.angRadius; };
  const t = cross(drawn, utc('2018-07-27T18:00:00Z'), utc('2018-07-27T19:00:00Z'));
  line(`  2018-07-27 from Nairobi, as drawn (topocentric angles, Moon's 1.3 s light time): U1 ${hms(t)} (geocentric, no light time: 18:24:06)`);
}

line('== 13. Transit contacts: app criterion (centre distance = Sun radius +/- planet radius) vs SearchTransit, geocentric ==');
for (const [body, d, rkm] of [['Venus', '2012-01-01', 6051.8], ['Venus', '1769-01-01', 6051.8], ['Mercury', '2019-01-01', 2439.7], ['Venus', '1639-01-01', 6051.8]]) {
  const tr = A.SearchTransit(body, A.MakeTime(new Date(d + 'T00:00:00Z')));
  const g = (t) => { const tm = A.MakeTime(new Date(t)), s = X.vecOf(A.GeoVector('Sun', tm, true)), v = X.vecOf(A.GeoVector(body, tm, true));
    return { sep: X.angleBetween(s, v), rs: Math.asin(695700 / X.AU_KM / X.len(s)) * X.RAD, rv: Math.asin(rkm / X.AU_KM / X.len(v)) * X.RAD }; };
  const on = (t) => { const q = g(t); return q.sep < q.rs + q.rv; };
  const p = tr.peak.date.getTime(), c1 = cross(on, p - 6 * 3600e3, p), c4 = cross((t) => !on(t), p, p + 6 * 3600e3);
  line(`  ${body} ${tr.peak.date.toISOString().slice(0, 10)}: I app ${hms(c1)} AE ${hms(tr.start.date.getTime())} | IV app ${hms(c4)} AE ${hms(tr.finish.date.getTime())} | least separation ${f2(g(p).sep * 3600, 1)}" (AE ${f2(tr.separation * 60, 1)}")`);
}
{
  const TA = { lat: -17.50, lon: -149.50, elev: 0 }, VA = { lat: 70.37, lon: 31.11, elev: 0 };
  const dur = (loc) => { const ins = (t) => { const b = E.compute(makeFrame(t, loc), true).byId; return X.angleBetween(b.Sun.u, b.Venus.u) < b.Sun.angRadius - b.Venus.angRadius; };
    const mid = utc('1769-06-03T22:25:00Z'); const c2 = cross(ins, mid - 4 * 3600e3, mid), c3 = cross((t) => !ins(t), mid, mid + 4 * 3600e3); return [c2, c3]; };
  const a = dur(TA), b = dur(VA);
  line(`  Venus 1769, internal contacts II-III: Tahiti ${hms(a[0])}-${hms(a[1])} (${(a[1] - a[0]) / 1000} s), Vardo ${hms(b[0])}-${hms(b[1])} (${(b[1] - b[0]) / 1000} s); difference ${((b[1] - b[0]) - (a[1] - a[0])) / 1000} s`);
}

line("== 14. Io in Jupiter's shadow: app half-light instant vs JPL Horizons (geocentric visibility codes, 10 s steps) ==");
{
  const io = (t) => E.compute(makeFrame(t, RICHMOND), true).byId.Io;
  const dis = cross((t) => io(t).light < 0.5, utc('2025-10-01T14:50:00Z'), utc('2025-10-01T15:20:00Z'));
  const re = cross((t) => io(t).light >= 0.5, utc('2026-03-01T03:30:00Z'), utc('2026-03-01T04:10:00Z'));
  line(`  2025-10-01 disappearance: app ${hms(dis)}; Horizons partial-umbral phase 15:02:05-15:05:35 (middle 15:03:50)`);
  line(`  2026-03-01 reappearance:  app ${hms(re)}; Horizons partial-umbral phase 03:46:15-03:49:55 (middle 03:48:05)`);
  line('  (the app\'s half-light point sits half a penumbra width, about 15 s, outside Horizons\' purely umbral limits)');
  // Roemer: the same eclipse with light time off happens earlier by Jupiter's light time
  const off = (t) => E.compute(makeFrame(t, RICHMOND), false).byId.Io;
  const disOff = cross((t) => off(t).light < 0.5, utc('2025-10-01T14:00:00Z'), utc('2025-10-01T14:50:00Z'));
  const J = E.compute(makeFrame(dis, RICHMOND), true).byId.Jupiter;
  line(`  light time on vs off, 2025-10-01: ${(dis - disOff) / 1000} s apart; Jupiter's light time ${f2(J.lightMin * 60, 0)} s at ${f2(J.dist, 4)} au -> c = ${f2(J.dist * X.AU_KM / ((dis - disOff) / 1000), 0)} km/s`);
}

line('== 15. Aberration, parallax, proper motion (catalog.starApparentEqj) ==');
{
  const hipStar = async (hip) => { await C.loadAllTiers(); for (const t of C.stars.tiers) for (let i = 0; i < t.n; i++) if (t.data[i * C.stars.NF + 4] === hip) return { k: t.k, i, rec: C.starRecord(t.k, i) }; };
  const place = (s, t, { ab = true, par = true, pm = true }) => { const fr = makeFrame(t, RICHMOND); fr.parallax = par; if (!ab) fr.beta[0] = fr.beta[1] = fr.beta[2] = 0; state.fx.properMotion = pm; const v = C.starApparentEqj(s.k, s.i, fr); state.fx.properMotion = true; return v; };
  const t0 = utc('2026-01-01T00:00:00Z'), DAYMS = 86400000;
  const swing = (s, opt, ref) => { let lo = 1e9, hi = 0; const mean = place(s, t0, ref); for (let d = 0; d < 366; d += 2) { const a = X.angleBetween(place(s, t0 + d * DAYMS, opt), place(s, t0 + d * DAYMS, ref)) * 3600; lo = Math.min(lo, a); hi = Math.max(hi, a); } return [lo, hi]; };
  const gd = await hipStar(87833);
  const ab = swing(gd, { ab: true, par: false, pm: false }, { ab: false, par: false, pm: false });
  line(`  annual aberration of gamma Dra over 2026: ${f2(ab[0], 2)}" to ${f2(ab[1], 2)}" from its mean place (constant of aberration 20.50")`);
  for (const [nm, hip, pTrue] of [['61 Cyg A', 104214, '0.286'], ['alpha Cen A', 71683, '0.75'], ["Barnard's star", 87937, '0.547']]) {
    const s = await hipStar(hip);
    const p = swing(s, { ab: false, par: true, pm: false }, { ab: false, par: false, pm: false });
    line(`  annual parallax of ${nm}: ${f2(p[0], 3)}" to ${f2(p[1], 3)}" (1 / catalogue distance ${f2(1 / s.rec.dist, 3)}"; published ${pTrue}")`);
  }
  const bs = await hipStar(87937);
  const pmv = X.angleBetween(place(bs, t0, { ab: false, par: false, pm: true }), place(bs, t0 + 3652.5 * DAYMS, { ab: false, par: false, pm: true })) * 3600 / 10;
  line(`  proper motion of Barnard's star: ${f2(pmv, 3)}"/yr (Hipparcos 10.358"/yr; HYG's own pmdec is clipped at 9999.99 mas/yr, restored in build_stars.py)`);
}

line('== 16. Half Moon as seen from the site; ecliptic of date ==');
{
  const TOK = { lat: 35.68, lon: 139.69, elev: 0 };
  const ph = (t) => E.compute(makeFrame(t, TOK), true).byId.Moon;
  const td = cross((t) => ph(t).phaseFrac >= 0.5, utc('2026-12-16T12:00:00Z'), utc('2026-12-17T12:00:00Z'));
  const b = E.compute(makeFrame(td, TOK), true).byId;
  line(`  dichotomy at Tokyo ${new Date(td).toISOString().slice(0, 19)}: Sun-Moon angle ${f2(X.angleBetween(b.Sun.u, b.Moon.u), 4)} deg; 90 - asin(d_Moon / d_Sun) = ${f2(90 - Math.asin(b.Moon.dist / b.Sun.dist) * X.RAD, 4)} deg; distance ratio ${f2(b.Sun.dist / b.Moon.dist, 1)}`);
  const q = A.SearchMoonQuarter(A.MakeTime(new Date(utc('2026-12-10T00:00:00Z'))));
  line(`  astronomy-engine first quarter (geocentric longitudes 90 deg apart): ${q.time.date.toISOString().slice(0, 19)}`);
  const s = A.Seasons(2026).mar_equinox.date.getTime(), fr = makeFrame(s, RICHMOND), sun = E.compute(fr, true).byId.Sun;
  const ecl = X.toSph(X.mulMV(fr.Mjt, X.vecOf(A.GeoVector('Sun', fr.time, true))));
  line(`  March equinox 2026: geocentric Sun in the app's ecliptic of date: longitude ${f2(ecl.lon > 180 ? ecl.lon - 360 : ecl.lon, 5)} deg, latitude ${f2(ecl.lat * 3600, 2)}"`);
  const y = (yr) => { const d = new Date(Date.UTC(2000, 8, 25)); d.setUTCFullYear(yr); return makeFrame(d.getTime(), RICHMOND); };
  C.setStarEpoch(0); const sp = star('Spica');
  const lam = (yr) => { const f = y(yr); C.setStarEpoch(f.years); return X.toSph(X.mulMV(f.Mjt, C.starRecord(sp.k, sp.i).vec)).lon; };
  line(`  Spica's ecliptic longitude of date: ${f2(lam(-293), 2)} (294 BC), ${f2(lam(-128), 2)} (129 BC), ${f2(lam(2026), 2)} (2026): ${f2((lam(2026) - lam(-128)) / 21.54 * 36, 1)}"/yr`);
}

line();
line('== 17. Gaia layers: HEALPix numbering, tile requests, the bundled tiles (js/healpix.js, js/deepstars.js) ==');
{
  const { existsSync } = await import('node:fs');
  const HP = await import('../js/healpix.js');
  const D = await import('../js/deepstars.js');
  // real Gaia DR3 rows (ESA archive, 2026-11-23): source_id, ra, dec. source_id >> 35 is the source's nested pixel at order 12.
  const rows = [['2306216916182228224', 358.66306047507965, -40.2999246476269], ['1737404401122124672', 314.2988695457744, 6.604775509124999],
    ['2074262603186614912', 299.98492062881826, 40.046327462166374], ['137339074009308288', 45.078942785206046, 35.32353215535138],
    ['377480758635720320', 12.760573068437326, 44.58674487716579], ['1018776176872261248', 143.20753978122536, 51.67490604097004]];
  let ok = 0;
  for (const [id, ra, dec] of rows) { const v = X.sph(ra, dec); if (HP.vec2pix(12, v[0], v[1], v[2]) === Number(BigInt(id) >> 35n)) ok++; }
  line(`  vec2pix(order 12) equals source_id >> 35 for ${ok} of ${rows.length} real Gaia sources`);
  const v = [0, 0, 0]; let bad = 0, n = 0;
  for (const o of [0, 3, 6, 9, 12]) for (let p = 0; p < 12 * 4 ** o; p += Math.max(1, Math.floor(12 * 4 ** o / 5000))) { HP.pix2vec(o, p, v); n++; if (HP.vec2pix(o, v[0], v[1], v[2]) !== p) bad++; }
  line(`  pix2vec -> vec2pix round trip: ${bad} failures in ${n} pixels (orders 0, 3, 6, 9, 12)`);
  // a tile's request must be the id range of its pixel: the first row above, G = 5.89, is not in a G 12-12.5 tile, but its pixel's range must hold its id
  const id = BigInt(rows[1][0]), order = 7, ipix = Number(id >> BigInt(35 + 2 * (12 - order)));
  const q = D.tileQuery({ L: 2, order, ipix }), m = /BETWEEN (\d+) AND (\d+)/.exec(q);
  line(`  tile request for order ${order}, pixel ${ipix}, level ${D.NET_LEVELS[2].join('-')}: id range holds the source: ${BigInt(m[1]) <= id && id <= BigInt(m[2])}; ${q.length} characters`);
  line(`  colour for the disc: BP-RP 0.0 -> B-V ${f2(D.bprpToBv(0))}, 0.82 (Sun) -> ${f2(D.bprpToBv(0.82))}, 2.0 -> ${f2(D.bprpToBv(2))}  (Gaia DR3 documentation, table 5.9)`);
  const root = new URL('../data/gaia/', import.meta.url);
  if (!existsSync(new URL('index.json', root))) line('  data/gaia/ is not present: bundled-tile checks skipped');
  else {
    const man = JSON.parse(readFileSync(new URL('index.json', root), 'utf8'));
    const counts = new Uint16Array(readFileSync(new URL('counts.bin', root)).buffer.slice(0));
    let mono = true; for (let b = 1; b < man.map.n; b++) if (man.map.allsky[b] < man.map.allsky[b - 1]) mono = false;
    line(`  bundle: ${man.levels.map((l) => l.id + ' ' + l.n).join(', ')} stars; ${man.special.length} in the manifest; ends at G ${man.magEnd}`);
    line(`  count map: ${counts.length / man.map.n} cells x ${man.map.n} magnitudes; all-sky N(<12) ${man.map.allsky[8]}, N(<21.5) ${man.map.allsky[man.map.n - 1]}; rising: ${mono}`);
    // one tile of each record size: sorted by G, inside its magnitude range, record count as the manifest says
    for (const lv of [man.levels[0], man.levels[3]]) {
      const j = Math.floor(lv.counts.length / 2), c = 3, buf = readFileSync(new URL(`${lv.id}/${j}_${c}.bin`, root)), dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
      const nrec = buf.byteLength / lv.rec; let sorted = true, inRange = true, prev = -9;
      for (let i = 0; i < nrec; i++) { const g = dv.getUint16(i * lv.rec + 4, true) / 1000 - 2; if (g < prev) sorted = false; if (g < lv.magMin - 0.0006 || g >= lv.magMax + 0.0006) inRange = false; prev = g; }
      line(`  tile ${lv.id}/${j}_${c}: ${nrec} records of ${lv.rec} bytes (manifest ${lv.counts[j][c]}), sorted by G: ${sorted}, all within ${lv.magMin}-${lv.magMax}: ${inRange}`);
    }
  }
}
