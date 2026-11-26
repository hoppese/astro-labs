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

  // ---- the observer away from the Earth (state.vantage): every place gives finite directions and magnitudes, and a few sizes are right
  { const t = Date.parse('2026-11-26T12:00:00Z'), loc = { lat: 0, lon: 0, elev: 0 }, at = (v) => E.compute(makeFrame(t, loc, v), true, true);
    for (const v of E.VANTAGES) { const b = at(v); need(!b.list.some((x) => x.id === v), v + ' draws itself'); const bad = b.list.filter((x) => !(Number.isFinite(x.u[0]) && Number.isFinite(x.mag) && Number.isFinite(x.angRadius))); need(!bad.length, `from ${v}: ${bad.map((x) => x.id)}`); need(!!b.byId.Earth, 'no Earth from ' + v); }
    const io = at('Io').byId.Jupiter, moon = at('Moon').byId.Earth, sun = at('Sun').byId.Earth;
    need(Math.abs(2 * io.angRadius - 2 * Math.asin(71492 / (io.dist * X.AU_KM)) * X.RAD) < 1e-9 && io.dist * X.AU_KM > 4.1e5 && io.dist * X.AU_KM < 4.4e5, 'Jupiter from Io');
    need(Math.abs(sun.mag + 4.0) < 0.15 && sun.phaseFrac > 0.999, 'Earth from the Sun: mag ' + sun.mag);
    line(`  from ${E.VANTAGES.length} other bodies: all finite; Jupiter from Io ${(2 * io.angRadius).toFixed(2)} deg, ${(io.phaseFrac * 100).toFixed(0)}% lit; Earth from the Moon ${(2 * moon.angRadius).toFixed(2)} deg; from the Sun mag ${sun.mag.toFixed(2)}`); }
}
