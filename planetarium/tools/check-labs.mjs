// Section 27 of tools/check.mjs: the labs' prompts and tools (js/labs/). A failure throws.
export async function checkLabs({ line }) {
  const { LABS, PLACES } = await import('../js/labs/presets.js');
  const H = await import('../js/labs/hidden.js'), S = await import('../js/labs/stopwatch.js'), G = await import('../js/clickguard.js'), Sh = await import('../js/labs/shadow.js'), M = await import('../js/measure.js');
  const { makeFrame } = await import('../js/skyframe.js'), E = await import('../js/ephem.js'), C = await import('../js/catalog.js'), X = await import('../js/astro.js');
  const need = (ok, t) => { if (!ok) throw new Error('labs: ' + t); };

  // ---- prompts: nothing left unfilled, no angle tool or clock rate at the start, buttons that exist, no key values of LABS.md
  const KEYS = /2\.57|2\.66|2\.75|\b123 s\b|29\.9\s*′|1\.340|357,000|5\.96|354,|89\.85|\b379\b|31\.93|33\.70|7\.11|0\.0167|23\.44|46\.95|0\.73 au|\b688\b|19\.33|124\.55|43\.37|139\.41|1\.66 au|1\.9 × 10|35\.78|25\.59|57\.8|149\.[2-9]\d* million km\?|9\.95|73\.6|23\.94|\b2658\b|\b3001\b|299,|19\.78|0\.287|3\.48 pc|10\.36|1\.83 pc|5\.95 ly|23 h 56|46\.83|\b0\.62°/;
  let n = 0, longest = 0;
  for (const L of LABS) {
    need(L.steps.length > 1, L.id + ' steps'); need(L.setup.rate === undefined, L.id + ' sets a clock rate');
    need(!(L.setup.tools || []).includes('measure') || /^(barnard|proxima)-parallax$/.test(L.id), L.id + ' opens with the angle tool');
    for (const s of L.steps) {
      const text = s.replace(/<svg.*?<\/svg>/gs, '').replace(/<[^>]*>/g, '');
      need(!/\$\{|undefined|\[object/.test(s), L.id + ': unfilled text'); need(!KEYS.test(text), `${L.id}: a key value in the prompt: ${(KEYS.exec(text) || [])[0]}`);
      for (const m of s.matchAll(/data-do="(\w+)"/g)) need(['swap', 'shadow', 'goto', 'light', 'square'].includes(m[1]), L.id + ' button ' + m[1]);
      for (const m of s.matchAll(/data-t="([^"]+)"/g)) need(Number.isFinite(Date.parse(m[1])), L.id + ' date ' + m[1]);
      longest = Math.max(longest, text.length); n++;
    }
    if (/BC/.test(L.steps[0]) && L.setup.t.startsWith('-')) need(/a year 0/.test(L.steps[0]), L.id + ': the clock’s year is not explained');
  }
  // through a telescope the picture must not turn: in alt-az it spins when the target passes near the zenith (the Sun, 88.6 deg high, at the 2012 transit's contacts)
  for (const L of LABS) if (L.setup.fov <= 2.5 && L.setup.track) need(L.setup.mount === 'eq', L.id + ' turns with the zenith');
  for (const id of Object.keys(H.HIDDEN)) need(LABS.some((L) => L.id === id), 'hidden.js names no lab: ' + id);
  line(`  ${LABS.length} labs, ${n} steps (longest ${longest} characters): no unfilled text, no key value, angle tool off and the same clock rate at the start`);

  // ---- answers not given away beside the prompt
  for (const [lab, row] of [['moonrise', 'Hour angle'], ['months', 'Hour angle'], ['months', 'Transit'], ['proper-motion', 'Distance'], ['romer', 'Spot crosses centre'], ['romer', 'Spot crosses center'], ['eclipse-timing', 'Magnitude']]) { H.running.id = lab; need(H.rowHidden(row), lab + ' shows ' + row); }
  for (const [lab, step, hid] of [['months', '+1 syn. mo', true], ['months', '−1 sid. mo', true], ['months', '+1 day', false], ['sidereal-day', '+1 sid. d', true], ['kepler-mars', '+1 Mars yr', false]]) { H.running.id = lab; need(H.stepHidden(step) === hid, lab + ' ' + step); }
  H.running.id = 'elongation'; need(H.eventsHidden('elong') && !H.eventsHidden('oppo'), 'elongation list'); H.running.id = 'moonrise'; need(H.groundStays(), 'ground'); H.running.id = null;
  need(!H.stepHidden('+1 syn. mo') && !H.eventsHidden('elong'), 'hidden outside a lab');

  // ---- J / L from a pause: real time, in their own direction
  { const Ck = await import('../js/clock.js'), { state } = await import('../js/state.js'), was = [state.rate, state.playing];
    state.rate = 100; state.playing = false; Ck.slower(); need(state.playing && state.rate === -1, 'J from a pause ' + state.rate);
    state.rate = -1e4; state.playing = false; Ck.faster(); need(state.playing && state.rate === 1, 'L from a pause ' + state.rate);
    state.rate = 100; state.playing = true; Ck.faster(); need(state.rate === 1000, 'L while running');
    [state.rate, state.playing] = was; line('  J / L from a pause start at -x1 / x1'); }
  // ---- stopwatch
  need(S.wholeSecond(1532726666900) === 1532726666000 && S.wholeSecond(-1500) === -2000, 'seconds');
  const T = PLACES.tahiti, V = PLACES.vardo, mk = (t, loc) => ({ t: Date.parse(t), label: '', loc });
  const marks = [mk('1769-06-03T19:40:02Z', T), mk('1769-06-04T01:09:43Z', T), mk('1769-06-04T01:20:46Z', V), mk('1769-06-03T19:27:44Z', V)], g = S.bySite(marks);
  need(g.length === 2 && g[0].items.map((x) => x.n).join() === '1,2' && g[1].items.map((x) => x.n).join() === '3,4', 'marks by place');
  need(S.markText(marks[1]).sub.join('|') === '1769-06-03 local|1769-06-04 01:09:43 UTC', 'mark text ' + S.markText(marks[1]).sub);
  need(S.gapText(marks[2], marks[3]) === S.gapText(marks[3], marks[2]) && S.gapText(marks[0], marks[1]) === '5 h 29 m 41 s = 19,781 s', 'gap ' + S.gapText(marks[0], marks[1]));

  // ---- clicks meant for a panel; two limbs of different bodies
  need(G.fallsThrough({ x: 100, y: 50, t: 1000 }, 104, 52, 1200) && !G.fallsThrough({ x: 100, y: 50, t: 1000 }, 104, 52, 1600) && !G.fallsThrough({ x: 100, y: 50, t: 1000 }, 160, 52, 1100) && !G.fallsThrough(null, 0, 0, 0), 'click guard');
  need(M.mixedLimbs({ a: { limb: 3, body: 'Moon' }, b: { limb: 9, body: 'Sun' } }) && !M.mixedLimbs({ a: { limb: 3, body: 'Moon' }, b: { limb: 9, body: 'Moon' } }) && M.mixedLimbs({ a: { body: 'Moon' }, b: { limb: 9, body: 'Sun' } }) && !M.mixedLimbs({ a: { body: 'Moon' }, b: { body: 'Sun' } }) && !M.mixedLimbs({ a: { limb: 3, body: 'Moon' }, b: { vec: [1, 0, 0] } }), 'mixed limbs');

  // ---- the Moon's light in the Earth's shadow
  const f = (sep) => Sh.shadowLight(sep, 0.25, 0.66, 1.2);
  need(f(2) === 1 && Math.abs(f(0) / Sh.UMBRA_LIGHT - 1) < 1e-9 && f(1.2) < 1 && f(0.66) > 0.02 && f(0.66) < f(1), 'shadow light');
  { const at = (t) => { const fr = makeFrame(Date.parse(t), PLACES.nairobi), b = E.compute(fr, true).moon, s = Sh.earthShadow(fr, true); return b.mag - 2.5 * Math.log10(Sh.shadowLight(Math.acos(X.unit(s.u).reduce((q, v, i) => q + v * b.u[i], 0)) * X.RAD, b.angRadius, s.umbra, s.penumbra)); };
    line(`  Moon 2018-07-27: before ${at('2018-07-27T16:30:00Z').toFixed(2)}, half in the umbra ${at('2018-07-27T18:57:00Z').toFixed(2)}, totality ${at('2018-07-27T20:22:00Z').toFixed(2)} mag`);
    need(at('2018-07-27T20:22:00Z') > -2 && at('2018-07-27T16:30:00Z') < -12, 'totality magnitude'); }

  // ---- Rømer: both dates give a fading of Io clear of the limb, and the speed of light
  { const R = LABS.find((L) => L.id === 'romer'), t2 = /data-t="([^"]+)"/.exec(R.steps.join(''))[1], gone = (start, lt) => { let lo = Date.parse(start), hi = lo + 30 * 60000; const io = (t) => E.compute(makeFrame(t, PLACES.richmond), lt).byId; need(io(lo).Io.light > 0.98 && io(hi).Io.light < 0.002, 'Io at ' + start); for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (io(m).Io.light > 0.002) lo = m; else hi = m; } return { t: lo, b: io(lo) }; };
    const back = (g) => new Date(g.t - 3600000).toISOString();
    const out = [R.setup.t, t2].map((s) => { const on = gone(s, true), off = gone(back(on), false); const sep = on.b.Io.sepDeg / on.b.Jupiter.angRadius; need(sep > 1.4 && !on.b.Io.occulted, 'Io too near the limb'); return { d: on.b.Jupiter.dist, delay: (on.t - off.t) / 1000, sep, when: new Date(on.t).toISOString().slice(0, 19) }; });
    const c = (out[0].d - out[1].d) * 149597870.7 / (out[0].delay - out[1].delay);
    line('  Io gone: ' + out.map((o) => `${o.when} at ${o.sep.toFixed(2)} Jupiter radii, delay ${o.delay.toFixed(0)} s, ${o.d.toFixed(3)} au`).join('; ') + `; c = ${Math.round(c).toLocaleString('en-US')} km/s`);
    need(Math.abs(c / 299792 - 1) < 0.003, 'c ' + c); }

  // ---- Canopus is still coming to the meridian when the lab opens
  { let can = null; for (const i of Object.keys(C.stars.names.name)) if (C.stars.names.name[i] === 'Canopus') can = +i;
    const L = LABS.find((x) => x.id === 'canopus'), fr = makeFrame(Date.parse(L.setup.t), L.setup.loc), d = X.toSph(X.mulMV(fr.Mjd, C.starApparentEqj(0, can, fr))), ha = X.mod(fr.lst - d.lon / 15 + 12, 24) - 12;
    line(`  Canopus at the start: hour angle ${(ha * 60).toFixed(1)} min`); need(ha < -0.1 && ha > -1, 'Canopus hour angle ' + ha); }

  // ---- Earth seen square-on (js/labs/squareon.js): the baselines the answer key uses, and the grid on the sites
  { const { state } = await import('../js/state.js'), Cm = await import('../js/labs/compare.js'), Sq = await import('../js/labs/squareon.js'), out = [];
    for (const [id, from, mid, km] of [['lunar-parallax', 'Moon', 0, 8330], ['eclipse-two-sites', 'Moon', 0, 614], ['venus-transit-1769', 'Sun', '1769-06-03T22:26:00Z', 10470], ['venus-transit-2012', 'Sun', '2012-06-06T01:27:00Z', 7490]]) {
      const s = LABS.find((x) => x.id === id).setup, t = mid ? Date.parse(mid) : Date.parse(s.t);
      state.loc = { elev: 0, ...s.loc }; Cm.cmp.obs2 = s.obs2;
      const f = makeFrame(t, state.loc), f2 = makeFrame(t, s.obs2), g = Sq.geometry(f, E.compute(f, true), from, { frame: f2, bodies: E.compute(f2, true) }), [p, q] = g.sites;
      const sq = Math.hypot(p.x - q.x, p.y - q.y);
      need(Math.abs(sq / km - 1) < 0.01, `${id}: square-on ${sq.toFixed(0)} km, the key says ${km}`); need(p.z > 0 && q.z > 0, id + ': a site on the far side');
      for (const st of g.sites) {                // a site's latitude and longitude on the drawn grid within the 0.19 deg of geodetic against geocentric latitude
        const B = st.lat * X.DEG, Lo = st.lon * X.DEG, v = [Math.cos(B) * Math.cos(Lo), Math.cos(B) * Math.sin(Lo), Math.sin(B)];
        const e = X.unit(X.add(X.add(X.scale(g.ef[0], v[0]), X.scale(g.ef[1], v[1])), X.scale(g.ef[2], v[2])));
        need(Math.acos(Math.min(1, X.dot(e, X.unit(st.p)))) * X.RAD < 0.2, id + ': the grid is off at ' + st.name);
      }
      out.push(`${id} ${sq.toFixed(0)} km`);
    }
    Cm.cmp.obs2 = null;
    line('  Earth seen square-on: ' + out.join(', ') + ' (the answer key), sites on the grid within 0.2 deg'); }

  // ---- Kepler I and II (the readings students record: J2000 ecliptic longitudes of the Sun and Mars, here without the 1′ error)
  { const O = await import('../js/objects.js'), loc = { lat: 39.83, lon: -84.89, elev: 0 }, D = X.DEG;
    const lons = (ms) => { const f = makeFrame(ms, loc), b = E.compute(f, true, true), Mje = X.transpose(f.Mej), L = (id) => X.toSph(X.mulMV(Mje, O.refEqj({ kind: 'body', id }, f, b))).lon; return [L('Sun'), L('Mars')]; };
    const MY = 686.9796 * 86400000, t0 = Date.parse('2014-04-08T20:57:00Z'), l0 = lons(t0)[1], P1 = [];
    for (let k = 1; k <= 9; k++) { const [ls, lm] = lons(t0 + k * MY), r = Math.sin((l0 - lm) * D) / Math.sin((lm - ls) * D), le = (ls + 180) * D; P1.push([r * Math.cos(le), r * Math.sin(le)]); }
    const circ = (P) => { const n = P.length; let a = [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]]; for (const [x, y] of P) { const z = x * x + y * y, row = [x, y, 1]; for (let i = 0; i < 3; i++) { for (let j = 0; j < 3; j++) a[i][j] += row[i] * row[j]; a[i][3] += row[i] * z; } }
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) { const f = a[j][i] / a[i][i]; for (let k = i; k < 4; k++) a[j][k] -= f * a[i][k]; }
      const q = [0, 0, 0]; for (let i = 2; i >= 0; i--) { let v = a[i][3]; for (let k = i + 1; k < 3; k++) v -= a[i][k] * q[k]; q[i] = v / a[i][i]; }
      const cx = q[0] / 2, cy = q[1] / 2; return { cx, cy, R: Math.sqrt(q[2] + cx * cx + cy * cy) }; };
    const e1 = circ(P1), off = Math.hypot(e1.cx, e1.cy) / e1.R, phi = X.mod(Math.atan2(e1.cy, e1.cx) * X.RAD, 360);
    need(Math.abs(off - 0.0167) < 0.002 && Math.abs(phi - 283) < 6 && Math.abs(1 / e1.R - 1.62) < 0.01, `Kepler I: offset ${off}, toward ${phi}, Sun-Mars ${1 / e1.R}`);
    // Kepler II with the Earth circle of Kepler I, first dates every two months from 2026-01-01
    const c = off, ph = phi * D, earth = (ls) => { const le = (ls + 180) * D, k = c * Math.cos(le - ph), r = k + Math.sqrt(1 - c * c + k * k); return [r * Math.cos(le), r * Math.sin(le)]; };
    const P2 = [];
    for (let m = 0; m < 24; m += 2) { const d = new Date(Date.UTC(2026, m, 1)).getTime(), [s1, l1] = lons(d), [s2, l2] = lons(d + MY), sn = Math.sin((l2 - l1) * D);
      if (Math.abs(sn) < 0.15) continue;
      const [x1, y1] = earth(s1), [x2, y2] = earth(s2), s = ((x2 - x1) * Math.sin(l2 * D) - (y2 - y1) * Math.cos(l2 * D)) / sn;
      P2.push([x1 + s * Math.cos(l1 * D), y1 + s * Math.sin(l1 * D), d]); }
    const rs = P2.map(([x, y]) => Math.hypot(x, y)), rmax = Math.max(...rs), rmin = Math.min(...rs), am = (rmax + rmin) / 2, ecc = (rmax - rmin) / (rmax + rmin), c2 = circ(P2);
    need(Math.abs(am - 1.5237) < 0.02 && Math.abs(ecc - 0.0934) < 0.02 && P2.length >= 8, `Kepler II: ${P2.length} points, a ${am}, e ${ecc}`);
    line(`  Kepler I: Earth's circle off center by ${off.toFixed(4)} of its radius toward ${phi.toFixed(0)}°, Mars at λ0 ${(1 / e1.R).toFixed(3)} au; Kepler II: ${P2.length} of 12 pairs kept, r ${rmin.toFixed(3)}-${rmax.toFixed(3)} au, a ${am.toFixed(3)}, e ${ecc.toFixed(3)}, circle center ${Math.hypot(c2.cx, c2.cy).toFixed(3)} au from the Sun`); }

  // ---- standard candles (js/variables.js, js/photometer.js): the models stay inside the catalog's numbers and hit the published peaks
  { const Vb = await import('../js/variables.js'), Ph = await import('../js/photometer.js'), jd0 = 2461300;
    for (const v of Vb.VARIABLES) { if (v.quiet) continue; let lo = 99, hi = -99, sum = 0; const n = 2000;
      for (let k = 0; k < n; k++) { const m = Vb.varMag(v, jd0 + v.P * k / n); lo = Math.min(lo, m); hi = Math.max(hi, m); sum += m; }
      need(Math.abs(lo - v.max) < 0.01 && Math.abs(hi - v.min) < 0.01 && Math.abs(sum / n - (v.max + v.min) / 2) < 0.01, 'variable range ' + v.name);
      need(Math.abs(Vb.varMag(v, v.epoch + 3 * v.P) - v.max) < 1e-6, 'maximum at the catalog epoch: ' + v.name); }
    const T = Vb.TRANSIENT, m = (id, jd) => Vb.transientMag(T[id], jd);
    for (const id of ['SN2011fe', 'SN2014J', 'SN2023ixf']) { const o = T[id]; need(m(id, o.t0 - 0.1) === null && Math.abs(m(id, o.tPeak) - o.peak) < 1e-9, 'peak of ' + id);
      for (let d = -15; d <= 200; d += 0.5) { const x = m(id, o.tPeak + d); need(x === null || x >= o.peak - 1e-9, 'nothing brighter than the peak: ' + id); } }
    need(Math.abs(Math.min(...Array.from({ length: 400 }, (_, k) => m('SN1987A', T.SN1987A.t0 + k * 0.5)).filter((x) => x != null)) - 2.9) < 0.01, 'SN 1987A peak');
    const v1 = Array.from({ length: 400 }, (_, k) => m('M31-V1', 2461000 + k * 31.4 / 400)), mean = v1.reduce((a, b) => a + b) / 400;
    need(Math.abs(mean - 19.4) < 0.01, 'M31 V1 mean');
    // each student's version (a notebook seed): small shifts of the size of the published uncertainties, none without a seed
    { const v = Vb.VAR_BY_HIP.get(110991), mean = () => { let t = 0; for (let k = 0; k < 400; k++) t += Vb.varMag(v, jd0 + v.P * k / 400); return t / 400; };
      const sn = T.SN2011fe, peakOf = () => Math.min(...Array.from({ length: 400 }, (_, k) => Vb.transientMag(sn, sn.tPeak - 5 + k * 0.025)));
      const dv = [], dp = [];
      for (let seed = 1; seed <= 300; seed++) { Vb.setModelSeed(seed); dv.push(mean() - 3.925); dp.push(peakOf() - 9.99); }
      Vb.setModelSeed(0);
      const sdv = Math.sqrt(dv.reduce((a, b) => a + b * b, 0) / dv.length), sdp = Math.sqrt(dp.reduce((a, b) => a + b * b, 0) / dp.length);
      need(Math.abs(mean() - 3.925) < 0.002 && Math.abs(peakOf() - 9.99) < 1e-6, 'no shift without a seed');
      need(sdv > 0.04 && sdv < 0.06 && Math.max(...dv.map(Math.abs)) <= 0.126 && sdp > 0.04 && sdp < 0.06 && Math.max(...dp.map(Math.abs)) <= 0.126, `student shifts: δ Cep mean ${sdv}, SN peak ${sdp}`);
      line(`  each student's own model (300 seeds): δ Cep mean magnitude ±${sdv.toFixed(3)} (distance ±${(sdv * 46).toFixed(1)}%), SN 2011fe peak ±${sdp.toFixed(3)}; none without a seed`); }
    // the photometer: counts = 10^(-0.4 (m - 25)) on average, with photon noise
    const ref = { kind: 'tr', id: 'SN2011fe' }, t = Math.floor((T.SN2011fe.tPeak - 2440587.5) * 86400) * 1000, c = [];      // (on a whole second: +400 ms is the same exposure)
    for (let k = 0; k < 200; k++) c.push(Ph.counts(ref, null, t + k * 1000));
    const mc = c.reduce((a, b) => a + b) / c.length, sd = Math.sqrt(c.reduce((a, b) => a + (b - mc) ** 2, 0) / c.length), N = Math.pow(10, -0.4 * (9.99 - 25));
    need(Math.abs(mc / N - 1) < 0.002 && Math.abs(sd / Math.sqrt(N + (0.005 * N) ** 2) - 1) < 0.2 && Ph.counts(ref, null, t) === Ph.counts(ref, null, t + 400), `photometer counts: mean/N ${mc / N}, sd ratio ${sd / Math.sqrt(N + (0.005 * N) ** 2)}, model seed ${Vb.getModelSeed()}`);
    // the answer keys of LABS.md, from the models
    const dCep = Vb.VAR_BY_HIP.get(110991), Mv = (P) => -2.43 * (Math.log10(P) - 1) - 4.05, pc = (mu) => Math.pow(10, mu / 5 + 1);
    line(`  standard candles: ${Vb.VARIABLES.length} variables inside their catalog ranges, peaks of 3 supernovae, M31 V1 mean 19.40, photometer noise ${(sd / mc * 100).toFixed(2)}% at mag 9.99; `
      + `δ Cep with Benedict's law ${pc((dCep.max + dCep.min) / 2 - Mv(dCep.P)).toFixed(0)} pc; SN 2011fe M = ${(9.99 - 29.19).toFixed(2)}, M82 from SN 2014J ${(pc(10.44 - (9.99 - 29.19)) / 1e6).toFixed(1)} Mpc`); }

  // ---- the observer away from the Earth (state.vantage): every place gives finite directions and magnitudes, and a few sizes are right
  { const t = Date.parse('2026-11-26T12:00:00Z'), loc = { lat: 0, lon: 0, elev: 0 }, at = (v) => E.compute(makeFrame(t, loc, v), true, true);
    for (const v of E.VANTAGES) { const b = at(v); need(!b.list.some((x) => x.id === v), v + ' draws itself'); const bad = b.list.filter((x) => !(Number.isFinite(x.u[0]) && Number.isFinite(x.mag) && Number.isFinite(x.angRadius))); need(!bad.length, `from ${v}: ${bad.map((x) => x.id)}`); need(!!b.byId.Earth, 'no Earth from ' + v); }
    const io = at('Io').byId.Jupiter, moon = at('Moon').byId.Earth, sun = at('Sun').byId.Earth;
    need(Math.abs(2 * io.angRadius - 2 * Math.asin(71492 / (io.dist * X.AU_KM)) * X.RAD) < 1e-9 && io.dist * X.AU_KM > 4.1e5 && io.dist * X.AU_KM < 4.4e5, 'Jupiter from Io');
    need(Math.abs(sun.mag + 4.0) < 0.15 && sun.phaseFrac > 0.999, 'Earth from the Sun: mag ' + sun.mag);
    // standing on a body: the horizon frame built from the body's axes agrees with astronomy-engine's own on the Earth. (Within 0.5 deg: the
    // IAU rotation model of the Earth that bodyAxes uses differs that much from the sidereal time; a mixed-up axis would be 90 or 180 deg off.)
    { const F = await import('../js/skyframe.js'), tm = X.A.MakeTime(new Date(t)), lat = 40, lon = -84.9, b2a = (6356.752 / 6378.137) ** 2;
      const s = F.surfacePoint('Earth', Math.atan(b2a * Math.tan(lat * X.DEG)) * X.RAD, lon, tm.tt), M = X.fromRot(X.A.Rotation_EQJ_HOR(tm, new X.A.Observer(lat, lon, 0)));
      const err = Math.max(...[s.north, s.west, s.up].map((r, i) => Math.acos(Math.min(1, r[0] * M[3 * i] + r[1] * M[3 * i + 1] + r[2] * M[3 * i + 2]))));
      need(err < 1 * X.DEG, 'surface horizon frame vs the Earth\'s: ' + err * X.RAD * 3600 + ' arcsec');
      const on = (v, la, lo) => E.compute(makeFrame(t, loc, v, { lat: la, lon: lo }), true, true), aa = (b) => X.horToAzAlt(b.hor);
      const tq = aa(on('Moon', 0.674, 23.473).byId.Earth), far = aa(on('Moon', -45.44, 177.6).byId.Earth), jz = on('Io', 0, 20).byId.Jupiter;
      need(tq.alt > 55 && tq.alt < 80 && Math.abs(tq.az - 270) < 35, 'Earth from Tranquility Base: az ' + tq.az + ' alt ' + tq.alt);
      need(far.alt < -20, 'Earth seen from the far side');
      need(Math.abs(aa(jz).alt - 70) < 3, 'Jupiter from Io (0, 20 E): alt ' + aa(jz).alt);
      for (const v of E.SURFACES) { const b = on(v, 30, 40); const bad = b.list.filter((x) => !(Number.isFinite(x.hor[2]) && Number.isFinite(x.mag))); need(!bad.length, `on ${v}: ${bad.map((x) => x.id)}`); }
      { const { state, eff } = await import('../js/state.js'), { air } = await import('../js/air.js'), was = [state.vantage, state.surface, state.show.atmosphere];
        state.show.atmosphere = true; state.vantage = 'Mars'; state.surface = { lat: 18, lon: 77 };
        need(eff.atmosphere && !eff.refraction && air().id === 'Mars', 'the air on Mars');
        state.vantage = 'Moon'; need(!eff.atmosphere && air().id === 'Earth', 'no air on the Moon');
        state.vantage = 'Titan'; need(eff.atmosphere && air().k > 3, 'Titan haze');
        [state.vantage, state.surface, state.show.atmosphere] = was; need(air().id === 'Earth' && !eff.space, 'back on the Earth'); }
      { const { state } = await import('../js/state.js'), was = [state.aboveAU, state.aboveLat, state.aboveLon, state.abovePan], tm = X.A.MakeTime(new Date(t)), d = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
        Object.assign(state, { aboveAU: 10, aboveLat: 0, aboveLon: 0, abovePan: [0, 0, 0] }); need(d(E.vantageHelio('Above', tm), [10, 0, 0]) < 1e-9, 'solar-system view toward the equinox');
        Object.assign(state, { aboveLat: 90, aboveLon: 123, abovePan: [1, 2, 3] }); const pole = E.vantageHelio('Above', tm), ep = 23.4392911 * X.DEG;
        need(d(pole, [1, 2 - 10 * Math.sin(ep), 3 + 10 * Math.cos(ep)]) < 1e-9, 'solar-system view from the ecliptic pole, panned');
        Object.assign(state, { aboveAU: was[0], aboveLat: was[1], aboveLon: was[2], abovePan: was[3] }); }
      line(`  standing on ${E.SURFACES.length} bodies: horizon frame within ${(err * X.RAD).toFixed(2)} deg of the Earth's; Earth from Tranquility Base az ${tq.az.toFixed(0)} alt ${tq.alt.toFixed(1)}, from the far side alt ${far.alt.toFixed(0)}`); }
    line(`  from ${E.VANTAGES.length} other bodies: all finite; Jupiter from Io ${(2 * io.angRadius).toFixed(2)} deg, ${(io.phaseFrac * 100).toFixed(0)}% lit; Earth from the Moon ${(2 * moon.angRadius).toFixed(2)} deg; from the Sun mag ${sun.mag.toFixed(2)}`); }
}
