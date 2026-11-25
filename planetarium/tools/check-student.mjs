// Section 27 of tools/check.mjs: what a student types and clicks (numbers, dates, names, events, zoom). A failure throws.
export async function checkStudent({ line }) {
  const need = (ok, what) => { if (!ok) throw new Error('student: ' + what); };
  const { readNumber } = await import('../js/xui.js'), T = await import('../js/timeutil.js'), F = await import('../js/fuzzy.js');
  const num = (s, u) => { const r = readNumber(s, u); return r.err ? 'err' : r.empty ? 'empty' : r.v; };
  for (const [s, v] of [['1,000', 1000], ['1,234,567.5', 1234567.5], ['1 000', 1000], ['12,5', 12.5], ['0,123', 0.123], ['2.5e1', 25], ['−3', -3], ['.5', 0.5], ['', 'empty'], ['1.000,5', 'err'], ['1,00,0', 'err'], ['12a', 'err'], ['abc', 'err'], ['1e999', 'err']]) need(num(s) === v, `readNumber("${s}") = ${num(s)}, not ${v}`);
  need(num('20 Mpc', /\s*mpc$/i) === 20, 'unit');
  const bad = (y, m, d) => T.dateProblem(y, m, d) !== '';
  need(bad(2026, 2, 30) && bad(2026, 2, 29) && !bad(2028, 2, 29) && bad(1900, 2, 29) && !bad(0, 2, 29) && bad(2026, 4, 31) && bad(2026, 13, 1) && bad(99999, 1, 1) && bad(-5000, 1, 1) && !bad(-3000, 1, 1) && bad(NaN, 1, 1) && bad(2026, 1, 0), 'dates');
  const C = await import('../js/catalog.js'), X = await import('../js/search.js'), nav = await import('../js/nav.js'), { cam } = await import('../js/camera.js');
  await C.loadAllTiers();
  const first = (q) => { const r = X.search(q); return (r.length ? r : X.guesses(q))[0]?.label || ''; };
  for (const [q, want] of [['Betelguese', 'Betelgeuse'], ['beetlejuice', 'Betelgeuse'], ['plieades', 'Pleiades'], ['seven sisters', 'Pleiades'], ["Barnerd's star", 'Barnard'], ['satrun', 'Saturn'], ['andromida', 'Andromeda'], ['north star', 'Polaris'], ['big dipper', 'Ursa Major'], ['kapteyn', 'Kapteyn'], ['vega', 'Vega'], ['m 31', 'M 31']]) need(first(q).includes(want), `search "${q}" gives "${first(q)}"`);
  need(X.guesses('zzzzxq').length === 0 && X.absentNote('ISS') && X.absentNote('International Space Station') && !X.absentNote('issue') && !X.absentNote('vega'), 'nothing / not included');
  const cities = [{ name: 'Sydney', region: 'Australia' }, { name: 'São Paulo', region: 'Brazil' }, { name: 'Paris', region: 'France' }];
  need(F.findCities(cities, 'sydny')[0].c.name === 'Sydney' && F.findCities(cities, 'sao')[0].c.name === 'São Paulo' && !F.findCities(cities, 'qqqq').length, 'cities');
  // Zoom to: the same field from anywhere; a search opens out only when it must
  for (const id of ['Moon', 'Jupiter', 'Saturn']) { const ref = { kind: 'body', id }, f = [1e-4, 0.01, 60].map((v) => { cam.fov = v; return nav.niceFov(ref); }); need(f[0] === f[1] && f[1] === f[2], 'niceFov ' + id); cam.fov = 1e-4; need(nav.arriveFov(ref) === f[0], 'arriveFov ' + id); cam.fov = 5; need(nav.arriveFov(ref) === null, 'arriveFov wide ' + id); }
  // doubtful magnitudes are flagged, the catalogue's values untouched
  await C.loadDeepDso();
  const row = (id) => C.dso.rows.find((o) => o.id === id), flagged = C.dso.rows.filter((o) => C.dsoDoubt(o)).length;
  need(row('IC 127').vmag === 9.2 && C.dsoDoubt(row('IC 127')) && C.dsoDoubt(row('NGC 253')) && !['NGC 224', 'NGC 4254', 'NGC 221', 'NGC 5194', 'NGC 4486'].some((id) => C.dsoDoubt(row(id))), 'doubtful');
  // events with a length: the clock goes to the middle, the list keeps the start
  const { CATEGORIES } = await import('../js/labs/events.js'), J = await import('../js/labs/jovian.js');
  let n = 0;
  for (const e of CATEGORIES.find((c) => c.id === 'jovian').list(Date.UTC(2026, 10, 25), 8)) { if (!e.end) continue; n++; need(Math.abs(2 * e.t - e.clock - e.end) < 2 && e.t > e.clock, 'middle of ' + e.text); const [m, rest] = e.text.split(/ in front| behind|’s shadow on | in /); const k = / in front/.test(e.text) ? 'transit' : / behind/.test(e.text) ? 'occultation' : /shadow on/.test(e.text) ? 'shadow' : 'eclipse'; need(J.KINDS[k](J.geometry(e.t), J.MOONS.findIndex((x) => x[0] === m)), `${e.text} at its middle`); }
  need(n > 2, 'no Jupiter events');
  line(`  numbers, dates, names, cities, zoom right; ${flagged} galaxies flagged doubtful; ${n} Jupiter events set to their middle`);
}
