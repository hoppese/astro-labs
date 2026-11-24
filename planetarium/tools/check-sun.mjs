// Section 26 of check.mjs: the sunspots (js/sunspots.js). A failure throws. SUN_DUMP=file writes the monthly group list for a butterfly diagram.
import { writeFileSync } from 'node:fs';
export default async function checkSun(line) {
  const Z = await import('../js/sunspots.js'), { state } = await import('../js/state.js');
  line(); line('== 26. Sunspots: records, made-up groups, cycles (js/sunspots.js) ==');
  await Z.initSun(); for (let d = 1870; d <= 2020; d += 10) await Z.loadDecade(d);
  const tt = (y) => (y - 2000) * 365.2425, need = (ok, what) => { if (!ok) throw new Error('sunspots: ' + what); }, mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
  const disc = (t) => { const g = Z.groupsAt(t); return { kind: g.kind, L: Z.onDisc(g.list, Z.centralMeridian(t), 0) }; };
  const stat = (a, b, step = 5) => { let n = 0, A = 0, sn = 0, N = 0, S = 0, kinds = new Set(), empty = 0, c = 0; for (let y = a; y < b; y += step / 365.2425) { const q = disc(tt(y)), L = q.L.filter((g) => g.area > 1.5); kinds.add(q.kind); n += L.length; for (const g of L) { A += g.area; if (g.lat > 0) N++; else S++; } sn += Z.sunspotNumber(y).sn; c++; if (!q.L.some((g) => g.area > 3)) empty++; } return { n: n / sn, A: A / sn, N: N / (N + S || 1), kinds: [...kinds].join('+'), empty: empty / c, sn: sn / c }; };
  for (const [a, b, what] of [[1755, 1873, 'made up, monthly number'], [1716, 1749, 'made up, yearly number'], [1611, 1645, 'made up, group number'], [1650, 1700, 'Maunder Minimum'], [1875, 1976, 'Greenwich'], [1978, 2026, 'USAF/NOAA x 1.4'], [1400, 1600, 'typical'], [2040, 2150, 'typical']]) {
    const s = stat(a, b, 9); line(`  ${a}-${b} ${what.padEnd(24)} groups on the disc per unit of sunspot number ${s.n.toFixed(4)}, area ${s.A.toFixed(1)}, northern share ${s.N.toFixed(2)}, mean number ${s.sn.toFixed(0)}, spotless ${(100 * s.empty).toFixed(0)} % of days (${s.kinds})`);
    if (what === 'made up, monthly number') { need(Math.abs(s.n - 0.056) < 0.008 && Math.abs(s.A - 10.7) < 2, 'calibration'); need(Math.abs(s.N - 0.5) < 0.03, 'hemispheres'); }
    if (what === 'Maunder Minimum') need(s.empty > 0.75, 'Maunder Minimum too spotty');
  }
  line('  mean |latitude| by years since minimum:   ' + [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((p) => String(p).padStart(5)).join(''));
  const bands = (a, b) => { const B = Array.from({ length: 10 }, () => []); for (let y = a; y < b; y += 11 / 365.2425) { const c = Z.cycleAt(y), p = Math.floor(y - c.start); if (p < 0.5 || p > 10) continue; for (const g of disc(tt(y)).L) if (!(p < 3 && Math.abs(g.lat) < 11)) B[p - 1] && B[p - 1].push(Math.abs(g.lat)); } return B.map((x) => (x.length ? mean(x) : NaN)); };
  const r = bands(1879, 1976), m = bands(1755, 1873); line('    Greenwich 1879-1976                     ' + r.map((v) => v.toFixed(1).padStart(5)).join('')); line('    made up 1755-1873                       ' + m.map((v) => v.toFixed(1).padStart(5)).join(''));
  for (let i = 0; i < 9; i++) need(Math.abs(r[i] - m[i]) < 2.5, 'latitude by phase');
  const sl = (y) => { let e = 0, n = 0; for (let t = tt(y); t < tt(y + 1); t += 1) { n++; if (!disc(t).L.length) e++; } return Math.round(e / n * 365); };
  line('  spotless days in the year: ' + [1901, 1913, 1933, 1954, 1996, 2008, 2009, 2019].map((y) => `${y}: ${sl(y)}`).join(', ') + '   (SILSO daily numbers of zero, SN_d_tot_V2.0: 1901 287, 1913 311, 1933 240, 1954 241, 1996 165, 2008 265, 2009 262, 2019 274)');
  // continuity: nothing pops. Largest change of total drawn area in 20 minutes
  let worst = 0, wy = 0; for (const y0 of [1860.3, 1874.33, 1947.2, 2001.2, 2026.86, 2035.1, 1580.2]) for (let k = 0; k < 4000; k++) { const t = tt(y0) + k / 72; const pr = (x) => { const c = Z.centralMeridian(x); return disc(x).L.reduce((s, g) => s + g.area * Math.cos(g.lat * Math.PI / 180) * Math.cos((g.lon - c) * Math.PI / 180), 0); }, a = pr(t), b = pr(t + 1 / 72); if (Math.abs(a - b) > worst) { worst = Math.abs(a - b); wy = 2000 + t / 365.2425; } }
  line(`  largest change of the total spot area as seen (foreshortened) in 20 minutes: ${worst.toFixed(0)} millionths (${wy.toFixed(2)})`);
  const a1 = JSON.stringify(Z.groupsAt(tt(1800.123)).list), a0 = Z.groupsAt(tt(1500)).list.length; const a2 = JSON.stringify(Z.groupsAt(tt(1800.123)).list); need(a1 === a2, 'not repeatable'); line(`  same date, same Sun: ${a1 === a2}; pictures of groups: ${Z.sun.tiles.tiles.length}; on by default: ${state.show.sunspots} (${a0})`);
  for (const [d, want] of [['2001-03-29', 3000], ['1947-04-05', 5000], ['2014-10-23', 3500]]) { const t = Date.parse(d) / 864e5 - 10957.5 + 0.5, L = disc(t).L.sort((p, q) => q.area - p.area); line(`  ${d}: ${L.length} groups, largest ${L[0].area.toFixed(0)} at latitude ${L[0].lat.toFixed(1)}`); need(L[0].area > want * 0.8, d); }
  if (process.env.SUN_DUMP) { const o = []; for (let y = 1749; y < 2027; y += 1 / 24) { if (y > 2026.89) break; const q = disc(tt(y)); for (const g of q.L) o.push([+y.toFixed(3), +g.lat.toFixed(1), Math.round(g.area), q.kind[0]]); } writeFileSync(process.env.SUN_DUMP, JSON.stringify(o)); }
}
