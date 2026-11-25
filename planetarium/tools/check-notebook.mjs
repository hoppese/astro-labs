// Sections 20 and 21 of tools/check.mjs: the lab notebook (js/notebook/).
//   20  unit tests: the unit-conversion table (known values, round trips, the wording of rules), number formatting,
//       the formula language with units, the model functions, and CSV export / re-import. A failure THROWS.
//   21  the physics the two parallax labs rely on, through the app's own star pipeline: the path of Barnard's star and
//       Proxima Centauri (parallax ellipse + proper motion), how much annual aberration and refraction change a small
//       separation, what the simulated measurement noise does, and what scatter two students should expect.

import { fmtNum, fmtColumn, plainNum, whyNotNumber, parseNum, colLetter } from '../js/notebook/format.js';
import { UNITS, UNIT, convert, convertRule, predictReason, compatible, RELATION, PC_M, AU_M, LY_M } from '../js/notebook/units.js';
import { parse, analyse, evaluate, pretty, letterTrap, FormulaError } from '../js/notebook/formula.js';
import { MODELS, MODEL, variant, switchPhase, extent, anchors, residuals, bestFit } from '../js/notebook/models.js';
import * as S from '../js/notebook/store.js';
import { PRACTICE, practiceData } from '../js/notebook/practice.js';

let n = 0;
function ok(cond, what) { n++; if (!cond) throw new Error('notebook check failed: ' + what); }
const close = (a, b, rel = 1e-12) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

export function checkNotebookUnits({ line }) {
  n = 0;
  // ---- known values ----
  ok(close(convert(1, 'pc', 'AU'), 206264.806247096, 1e-13), '1 pc = 206,264.806 AU');
  ok(convert(1, 'AU', 'km') === 149597870.7, '1 AU = 149,597,870.7 km');
  ok(close(convert(1, 'ly', 'km'), 9.4607304725808e12, 1e-14), '1 ly = 9.4607e12 km');
  ok(close(convert(1, 'pc', 'ly'), 3.2615637771675, 1e-12), '1 pc = 3.26156 ly');
  ok(close(convert(1, 'pc', 'km'), 3.0856775814913673e13, 1e-14), '1 pc = 3.0857e13 km');
  ok(convert(3600, 'arcsec', 'deg') === 1 && convert(60, 'arcmin', 'deg') === 1 && convert(1000, 'mas', 'arcsec') === 1, 'arcsec, arcmin, mas');
  ok(close(convert(180, 'deg', 'rad'), Math.PI) && close(convert(1, 'rad', 'arcsec'), 206264.80624709636), 'radians');
  ok(convert(1, 'hRA', 'deg') === 15 && convert(1, 'sRA', 'arcsec') === 15 && convert(1, 'mRA', 'arcmin') === 15, 'hours of right ascension');
  ok(convert(1, 'yr', 'd') === 365.25 && convert(1, 'd', 's') === 86400 && convert(1, 'sidday', 's') === 86164.0905, 'time');
  ok(convert(1, 'c', 'km/s') === 299792.458 && close(convert(1, 'AU/yr', 'km/s'), 4.740470463533349, 1e-13), 'speeds');
  ok(close(convert(1, 'AU', 'lmin'), 8.316746397, 1e-9) && convert(1, 'ls', 'km') === 299792.458, 'light-minute, light-second');
  ok(close(convert(1, 'Msun', 'kg'), 1.98841e30, 1e-5) && close(convert(1, 'Mjup', 'kg'), 1.89812e27, 1e-5) && close(convert(1, 'Mearth', 'kg'), 5.97217e24, 1e-5), 'masses = nominal GM / G');
  ok(close(convert(1, 'Rsun', 'km'), 695700) && close(convert(1, 'Rearth', 'km'), 6378.1), 'nominal radii');
  ok(close(PC_M / AU_M, 648000 / Math.PI) && LY_M === 9460730472580800, 'parsec and light-year definitions');
  // ---- round trips: every pair of compatible units ----
  let pairs = 0, worst = 0;
  for (const u of UNITS) for (const v of compatible(u.id)) {
    const x = 7.25, back = convert(convert(x, u.id, v.id), v.id, u.id);
    worst = Math.max(worst, Math.abs(back / x - 1)); pairs++;
    ok(close(back, x, 1e-13), `round trip ${u.id} -> ${v.id} -> ${u.id}`);
    const r = convertRule(u.id, v.id);
    ok(r.bigger === (convert(1, u.id, v.id) > 1) && typeof r.text === 'string' && r.text.length > 2, `rule ${u.id} -> ${v.id}`);
    ok(/^(Bigger|Smaller|The same)/.test(predictReason(u.id, v.id)), `reason ${u.id} -> ${v.id}`);
  }
  // a three-deep chain equals the one-step conversion
  ok(close(convert(convert(convert(1.5, 'arcsec', 'deg'), 'deg', 'rad'), 'rad', 'arcsec'), 1.5, 1e-13), 'chain arcsec -> deg -> rad -> arcsec');
  ok(close(convert(convert(2, 'pc', 'AU'), 'AU', 'km'), convert(2, 'pc', 'km'), 1e-14), 'chain pc -> AU -> km');
  // ---- the wording of rules ----
  ok(convertRule('arcsec', 'deg').text === '÷ 3600' && convertRule('arcsec', 'deg').why === '1° = 3600″', 'rule text arcsec -> deg');
  ok(convertRule('deg', 'rad').text === '× π/180' && convertRule('rad', 'deg').text === '× 180/π', 'rule text deg <-> rad');
  ok(convertRule('pc', 'AU').text === '× 206,264.806' && convertRule('AU', 'km').text === '× 149,597,870.7', 'rule text pc -> AU -> km');
  ok(convertRule('ly', 'km').text === '× 9.4607 × 10¹²', 'rule text ly -> km');
  let threw = false; try { convertRule('arcsec', 'km'); } catch (e) { threw = /angle/.test(e.message) && /length/.test(e.message); }
  ok(threw, 'an angle cannot be converted to a length');
  // ---- relations ----
  ok(close(RELATION['parallax-distance'].f({ p: 0.5 }, { p: 'arcsec' }), 2) && close(RELATION['parallax-distance'].f({ p: 500 }, { p: 'mas' }), 2), 'd = 1/p');
  ok(close(RELATION['small-angle-size'].f({ d: 1, th: 1 }, { d: 'pc', th: 'arcsec' }), 1 / 206264.80624709636, 1e-12), 's = d theta: 1 arcsec at 1 pc is 1 AU');
  // ---- numbers ----
  ok(fmtNum(1.5e8, 3) === '1.50 × 10⁸' && fmtNum(149597870.7, 4) === '1.496 × 10⁸' && fmtNum(-0.000123, 2) === '−1.2 × 10⁻⁴', 'powers of ten with real superscripts');
  ok(fmtNum(206264.806, 6) === '206,265' && fmtNum(12, 4) === '12.00' && fmtNum(0, 3) === '0' && fmtNum(2461193.5, 0) === '2,461,193.5', 'plain numbers');
  ok(parseNum('1.50 × 10⁸') === 1.5e8 && parseNum('1.5e8') === 1.5e8 && parseNum('1.5 x 10^8') === 1.5e8 && parseNum('−3') === -3 && parseNum('1,234.5') === 1234.5 && Number.isNaN(parseNum('abc')), 'reading numbers');
  ok(colLetter(0) === 'A' && colLetter(25) === 'Z' && colLetter(26) === 'AA', 'column letters');
  // ---- formulas with units ----
  const units = { A: 'arcsec', B: 'deg', C: 'km', D: 'AU', E: 's', F: 'yr', H: 'kg' };
  const vals = { A: 30, B: 90, C: 1e6, D: 2, E: 10, F: 2, H: 5 };
  const run = (src) => { const t = parse(src, (L) => L in units), a = analyse(t, (L) => units[L]); return { ...a, v: evaluate(t, (L) => vals[L]), text: pretty(t) }; };
  ok(run('A*sin(B)').v === 30 && run('A*sin(B)').label === '″', 'sin of a column in degrees; unit of the product');
  ok(run('C/E').unitId === 'km/s' && run('D/F').unitId === 'AU/yr' && run('D^3/F^2').label === 'AU³/yr²', 'compound units');
  ok(run('A - 10').unitId === 'arcsec' && run('sqrt(C*C)').unitId === 'km', 'a bare number takes the unit; square root');
  ok(run('4*pi^2*(C*1000)^3/(G*E^2)').warn.length > 0, 'km and m left unmixed are flagged');
  ok(close(run('4*pi^2*D^3/F^2').v, 4 * Math.PI ** 2 * 2), 'arithmetic');
  for (const [bad, re] of [['A+C', /angle.*length|length.*angle/], ['A+B', /different units/], ['sin(C)', /needs an angle/], ['A*', /stops too soon/], ['Z+1', /no column Z/]]) {
    let msg = ''; try { run(bad); } catch (e) { msg = e instanceof FormulaError ? e.message : 'not a FormulaError'; }
    ok(re.test(msg), `refusal of ${bad}: ${msg}`);
  }
  // ---- models ----
  const c = { x1: 0, t1: 0 };
  ok(MODEL.line0.f(3, { m: 2 }) === 6 && MODEL.line.f(3, { m: 2, b: 1 }) === 7 && close(MODEL.power.f(4, { A: 3, n: 1.5 }), 24) && close(MODEL.power.f(5, { A: 3, n: 2, x0: 1, y0: 10 }), 58) && MODEL.quad.f(3, { a: 1, b: 2, c: 0.5 }) === 11.5, 'lines, power law (with offsets), quadratic');
  { // on log-log axes a power law is a straight line of slope n
    const p = { A: 2.5, n: 2, x0: 0, y0: 0 }, s1 = (Math.log10(MODEL.power.f(100, p)) - Math.log10(MODEL.power.f(1, p))) / 2; ok(close(s1, 2), 'log-log slope of a power law is its exponent'); }
  ok(close(MODEL.sine.f(0.25, { A: 2, P: 1, x0: 0, y0: 5 }), 7) && close(MODEL.sine.f(0.75, { A: 2, P: 1, x0: 0, y0: 5 }), 3) && close(MODEL.sine.f(1.3, { A: 2, P: 1, x0: 0, y0: 5 }), MODEL.sine.f(0.3, { A: 2, P: 1, x0: 0, y0: 5 }), 1e-9), 'sine: amplitude, mean, period');
  ok(close(MODEL.sineline.f(10.25, { A: 2, P: 1, x0: 10, m: 3, b: 1 }, { x1: 10 }), 1 + 0.75 + 2), 'sine on a line');
  ok(Math.abs(MODEL.tilt.f(0, { A: 5, P: 4, x0: 0, i: 0 })) < 1e-12 && close(MODEL.tilt.f(1, { A: 5, P: 4, x0: 0, i: 0 }), 5) && close(MODEL.tilt.f(0, { A: 5, P: 4, x0: 0, i: 30 }), 2.5) && close(MODEL.tilt.f(0.7, { A: 5, P: 4, x0: 0, i: 90 }), 5), 'tilted orbit: edge-on touches zero, closest = A sin(tilt), face-on constant');
  { const p = { a: 3, b: 1, th: 0, P: 1, t0: 0, vx: 0, vy: 0, x0: 10, y0: 20 }, E = MODEL.ellipse;
    const q0 = E.xy(0, p, c), q1 = E.xy(0.25, p, c), q2 = E.xy(0.5, p, c);
    ok(close(q0[0], 13) && close(q0[1], 20) && close(q1[0], 10) && close(q1[1], 21) && close(q2[0], 7), 'ellipse: half-axes a and b');
    let worstE = 0; for (let k = 0; k < 50; k++) { const [x, y] = E.xy(k / 50, { ...p, th: 35 }, c); const dx = x - 10, dy = y - 20, ct = Math.cos(35 * Math.PI / 180), st = Math.sin(35 * Math.PI / 180), u = dx * ct + dy * st, v = -dx * st + dy * ct; worstE = Math.max(worstE, Math.abs(u * u / 9 + v * v - 1)); }
    ok(worstE < 1e-12, 'ellipse: every point satisfies (u/a)^2 + (v/b)^2 = 1 after turning by theta');
    const d1 = E.xy(2, { ...p, vx: 0.5, vy: -2 }, c), d0 = E.xy(1, { ...p, vx: 0.5, vy: -2 }, c);
    ok(close(d1[0] - d0[0], 0.5) && close(d1[1] - d0[1], -2), 'ellipse: one period apart the difference is pure drift'); }
  { // residuals and the instructor's least-squares fit recover known parameters
    const truth = { A: 1.7, P: 3.3, x0: 0.4, y0: 9 }, pts = []; for (let k = 0; k < 25; k++) { const x = k * 0.37; pts.push({ x, y: MODEL.sine.f(x, truth) }); }
    const d = extent(pts), r = residuals(MODEL.sine, truth, pts, anchors(d));
    ok(r.rms < 1e-12 && r.n === 25, 'residuals vanish on the true curve');
    const f = bestFit(MODEL.sine, { A: 1.5, P: 3.2, x0: 0.5, y0: 8.8 }, pts, anchors(d));
    ok(Math.abs(f.p.A - 1.7) < 1e-4 && Math.abs(f.p.P - 3.3) < 1e-4, 'least squares recovers the sine'); }
  ok(MODELS.length === 9 && MODELS.every((m) => typeof m.eq({ x: 'x', y: 'y', t: 't' }) === 'string' && m.params.length && (m.f || m.xy || m.path)), 'nine generic shapes, each with a formula');
  // ---- the notebook itself: chains, refusals, CSV out and back ----
  const nb = S.newNotebook('check');
  const a = S.addColumn(nb, { kind: 'data', name: 'separation', unit: 'arcsec' }), b = S.addColumn(nb, { kind: 'convert', name: 'separation', src: a.id, unit: 'deg' }), cc = S.addColumn(nb, { kind: 'convert', name: 'separation', src: b.id, unit: 'rad' });
  const dd = S.addColumn(nb, { kind: 'data', name: 'distance', unit: 'pc' }), e = S.addColumn(nb, { kind: 'convert', name: 'distance', src: dd.id, unit: 'AU' }), f = S.addColumn(nb, { kind: 'convert', name: 'distance', src: e.id, unit: 'km' });
  const g = S.addColumn(nb, { kind: 'calc', name: 'size', formula: 'F * C' }), h = S.addColumn(nb, { kind: 'relation', name: 'size', rel: 'small-angle-size', in: { d: f.id, th: a.id } });
  S.addRow(nb, { [a.id]: '3600', [dd.id]: 1 }); S.addRow(nb, { [a.id]: '1.5 × 10⁸', [dd.id]: '2' });
  ok(S.values(nb, cc.id)[0] === Math.PI / 180 && close(S.values(nb, f.id)[1], 2 * 3.0856775814913673e13, 1e-14), 'chains three deep compute');
  ok(close(S.values(nb, g.id)[0], S.values(nb, h.id)[0], 1e-13) && S.unitInfo(nb, g).id === 'km', 'formula and relation agree; unit km');
  ok(S.ruleOf(nb, b).head === 'A → °' && S.ruleOf(nb, b).rule === '÷ 3600' && S.chains(nb).length === 2, 'header rule and the chain tree');
  ok(/used by column B/.test(S.removeColumn(nb, a.id)), 'a column that feeds others cannot be deleted');
  const bad = S.addColumn(nb, { kind: 'calc', name: 'bad', formula: 'A + D' });
  ok(/angle/.test(S.unitInfo(nb, bad).error || ''), 'adding arcsec to pc is refused'); S.removeColumn(nb, bad.id);
  nb.graph.x = dd.id; nb.graph.y = f.id; nb.model.type = 'line0'; nb.model.p = { m: 3 }; nb.seed = 4242; nb.obs = { seeing: 0.8, noise: 0.02 };
  const csv = S.toCSV(nb, { when: new Date(0) }), back = S.fromCSV(csv, 'check');
  ok(S.toCSV(back, { when: new Date(0) }) === csv, 'CSV export -> import -> export is identical');
  ok(/unit,″,°,rad,pc,AU,km,km,km/.test(csv) && /convert A from ″ to °: ÷ 3600 \(1° = 3600″\)/.test(csv) && /seed 4242/.test(csv), 'the CSV carries units, rules and the seed');
  const plain = S.fromCSV('d (Mpc),v (km/s),galaxy\n1.2,90,NGC 1\n3.4,250,NGC 2\n');
  ok(plain.cols[0].unit === 'Mpc' && plain.cols[1].unit === 'km/s' && plain.cols[2].kind === 'text' && plain.rows.length === 2, 'a plain CSV becomes typed columns with units');
  // ---- fixes from the student tester (2026-11-24) ----
  // pasting: tabs win over commas (thousands stay whole), ambiguity is asked about
  { const tab = '13.8\t1,249\n2.1\t140'; ok(S.delimiterOf(tab) === '\t' && S.parseCSV(tab, '\t')[0][1] === '1,249' && parseNum('1,249') === 1249, 'tab paste keeps 1,249 whole');
    ok(S.delimiterOf('1,249\n2,310\n870') === 'ask' && S.delimiterOf('1.2,90\n3.4,250') === ',' && S.delimiterOf('1.2;90\n3.4;250') === ';' && S.delimiterOf('0.2 0.21\n0.4 0.76') === ' ' && S.delimiterOf('1 000\n2 000') === '' && S.delimiterOf('"1,249"\t3\n') === '\t', 'delimiters');
    const big = S.fromCSV('d (Mpc)\tv (km/s)\n13.8\t1,249\n20\t1,400\n'); ok(S.values(big, big.cols[1].id)[0] === 1249 && big.cols[1].unit === 'km/s', 'a pasted spreadsheet block with commas and headings'); }
  ok(whyNotNumber('3,14').includes('3.14') && whyNotNumber('5 m').includes('unit') && whyNotNumber('=2') && whyNotNumber('1/2') && whyNotNumber('12:30') && whyNotNumber('abc') && !whyNotNumber('1,000') && !whyNotNumber(''), 'bad cells are explained in words');
  ok(plainNum(35.550000000000004) === '35.55' && plainNum(2461193.51234) === '2461193.51234', 'CSV numbers without binary tails');
  { const f = fmtColumn([-9.066, 1.213, -0.7823], 4); ok(f(-9.066) === '−9.066' && f(-0.7823) === '−0.782' && f(1.213) === '1.213' && f(0.0001) === fmtNum(0.0001, 2), 'one number of decimals down a column'); }
  ok(run('a*sin(b)').v === 30 && letterTrap('B*c', (L) => L === 'C') && !letterTrap('B*c', () => false) && !letterTrap('B*C', () => true) && run('C/c_light').unitId === 's', 'small letters mean columns; bare c is asked about; c_light is the speed of light');
  ok(/taken to be in km\/s/.test(run('C/E + 1').note) && !run('C/E').note, 'a bare number added to a quantity is said to take its unit');
  ok(MODEL.circle.gap(3 + 5, 4, { x0: 3, y0: 4, D: 10 }) === 0 && MODEL.circle.path({ x0: 1, y0: 2, D: 4 }).every(([x, y]) => close(Math.hypot(x - 1, y - 2), 2, 1e-12)) && residuals(MODEL.circle, { x0: 0, y0: 0, D: 2 }, [{ x: 3, y: 0 }, { x: 0, y: -1 }], c).max === 2, 'circle: centre and diameter');
  for (const id of ['sine', 'sineline', 'tilt']) { // phase as an angle is the same curve
    const cc2 = { x1: 10 }, m = { type: id, p: { A: 2, P: 3, x0: 11.3, y0: 1, m: 0.2, b: 4, i: 20 }, r: {}, phase: 'moment' }, y = [10, 11.7, 19].map((x) => MODEL[id].f(x, m.p, cc2));
    switchPhase(MODEL[id], m, cc2, 'angle'); const V = variant(MODEL[id], m);
    ok('phi' in m.p && !('x0' in m.p) && m.p.phi >= 0 && m.p.phi < 360 && [10, 11.7, 19].every((x, i) => close(V.f(x, m.p, cc2), y[i], 1e-9)) && V.params.some((q) => q.key === 'phi') && /φ/.test(V.eq({ x: 'x', y: 'y' })), id + ': phase as an angle');
    switchPhase(MODEL[id], m, cc2, 'moment'); ok([10, 11.7, 19].every((x, i) => close(MODEL[id].f(x, m.p, cc2), y[i], 1e-9)), id + ': and back'); }
  ok(MODEL.tilt.knots({ P: 4, x0: 1 }, c, 0, 8).join() === '1,3,5,7', 'tilt: its cusps are sampled');
  { const m2 = S.newNotebook('move'), A1 = S.addColumn(m2, { kind: 'data', name: 'a', unit: 'km' }), B1 = S.addColumn(m2, { kind: 'data', name: 'b', unit: 's' }), C1 = S.addColumn(m2, { kind: 'calc', name: 'v', formula: 'A / B' });
    S.addRow(m2, { [A1.id]: 10, [B1.id]: 4 }); S.addRow(m2, { [A1.id]: 30, [B1.id]: 4 });
    S.moveColumn(m2, B1.id, -1); ok(C1.formula === 'B / A' && S.values(m2, C1.id)[0] === 2.5, 'moving a column rewrites the formulas'); S.moveColumn(m2, C1.id, -1);
    ok(C1.formula === 'C / A' && S.values(m2, C1.id)[0] === 2.5 && !S.moveColumn(m2, B1.id, -1), 'twice, and the edge');
    ok(S.flow(m2).length === 1 && S.flow(m2)[0].from.length === 2, 'the flow strip shows a two-input formula once');
    const f1 = S.footOf(m2, C1); ok(f1.n === 2 && f1.mean === 5, 'mean and count of a column');
    const K = S.addColumn(m2, { kind: 'const', name: 'p', unit: 'arcsec', value: 0.5, sig: 3 }), D1 = S.addColumn(m2, { kind: 'relation', name: 'd', rel: 'parallax-distance', in: { p: K.id } });
    ok(S.values(m2, D1.id)[1] === 2 && S.unitInfo(m2, D1).id === 'pc', 'a fitted value used as a column feeds a relation');
    ok(S.unitInfo(m2, S.addColumn(m2, { kind: 'const', name: 'm', parts: { arcsec: 1, yr: -1 }, value: 2 })).label === '″/yr' && S.toCSV(S.fromCSV(S.toCSV(m2, { when: new Date(0) }), 'move'), { when: new Date(0) }) === S.toCSV(m2, { when: new Date(0) }), 'compound units, and the CSV round trip'); }
  for (const P of PRACTICE) { const a1 = practiceData(P.id, 5), b1 = practiceData(P.id, 6); ok(/^PRACTICE DATA/.test(a1.title) && a1.rows.length > 8 && a1.rows.flat().every(Number.isFinite) && JSON.stringify(a1) !== JSON.stringify(b1) && JSON.stringify(a1) === JSON.stringify(practiceData(P.id, 5)) && a1.cols.every(([, u]) => UNIT[u]), 'practice data ' + P.id); }
  line(`  ${n} assertions passed: ${UNITS.length} units, ${pairs} conversion pairs (worst round-trip error ${worst.toExponential(1)}), 9 model shapes, formulas with units, CSV round trip`);
  line(`  1 pc = ${fmtNum(convert(1, 'pc', 'AU'), 9)} AU; 1 AU = ${fmtNum(convert(1, 'AU', 'km'), 0)} km; 1 ly = ${fmtNum(convert(1, 'ly', 'km'), 5)} km; 1 AU/yr = ${fmtNum(convert(1, 'AU/yr', 'km/s'), 7)} km/s; 1 M_J = ${fmtNum(convert(1, 'Mjup', 'kg'), 5)} kg`);
}

// ---------------------------------------------------------------------------------------------------------------------
export async function checkNotebookPhysics({ line, f2, X, C, makeFrame, state }) {
  await C.loadAllTiers();
  const { noisePair } = await import('../js/notebook/seeing.js');
  const SITE = { lat: 39.83, lon: -84.89, elev: 300 };
  const byHip = (hip) => { for (const t of C.stars.tiers) for (let i = 0; i < t.n; i++) if (t.data[i * C.stars.NF + 4] === hip) return { k: t.k, i, rec: C.starRecord(t.k, i) }; throw new Error('HIP ' + hip); };
  const tangent = (c) => { const e = X.unit(X.cross([0, 0, 1], c)), nn = X.cross(c, e); return { e, n: nn }; };
  const AS = 648000 / Math.PI;
  const frameAt = (ms, { ab = false, par = true } = {}) => { const fr = makeFrame(ms, SITE); if (!ab) fr.beta = [0, 0, 0]; fr.parallax = par; return fr; };
  const saveFx = { ...state.fx }; state.fx.properMotion = true;
  const t0 = Date.parse('2026-03-01T04:00:00Z'), YR = 365.25 * 86400000;
  const E = MODEL.ellipse;

  for (const [name, hip, pub] of [["Barnard's star", 87937, 'p 0.547", 1.83 pc, mu 10.36"/yr'], ['Proxima Centauri', 70890, 'p 0.768", 1.30 pc, mu 3.86"/yr']]) {
    const s = byHip(hip), ref = C.starApparentEqj(s.k, s.i, frameAt(t0, { par: false })), tp = tangent(ref);
    // (a) the star against a FIXED direction, 25 dates over two years: offsets east and north in arcsec
    const pts = [];
    for (let k = 0; k <= 24; k++) { const ms = t0 + k / 12 * YR, u = C.starApparentEqj(s.k, s.i, frameAt(ms)); pts.push({ t: 2000 + frameAt(ms).years, x: X.dot(u, tp.e) * AS, y: X.dot(u, tp.n) * AS }); }
    const d = extent(pts), c = anchors(d), mu0 = Math.hypot(s.rec.pmra, s.rec.pmdec) / 1000;
    const start = { a: 0.6, b: 0.3, th: 0, P: 1, t0: d.tmin + 0.2, vx: s.rec.pmra / 1000, vy: s.rec.pmdec / 1000, x0: pts[0].x, y0: pts[0].y };
    let fit = bestFit(E, start, pts, c, { scale: { a: 0.2, b: 0.2, th: 20, P: 0.01, t0: 0.2, vx: 0.2, vy: 0.2, x0: 0.3, y0: 0.3 } }); fit = bestFit(E, fit.p, pts, c); fit = bestFit(E, fit.p, pts, c);
    const p = Math.max(Math.abs(fit.p.a), Math.abs(fit.p.b)), q = Math.min(Math.abs(fit.p.a), Math.abs(fit.p.b)), mu = Math.hypot(fit.p.vx, fit.p.vy);
    const ecl = X.toSph(X.mulMV(frameAt(t0).Mjt, ref));
    line(`  ${name} (HIP ${hip}; catalogue distance ${f2(s.rec.dist, 4)} pc so p = ${f2(1 / s.rec.dist, 4)}", proper motion ${f2(mu0, 3)}"/yr at 2000; published ${pub})`);
    line(`    least-squares ellipse + drift through the app's own places, 25 dates over 2 years: a = ${f2(p, 4)}" b = ${f2(q, 4)}" (b/a = ${f2(q / p, 4)}; sin|beta| = ${f2(Math.abs(Math.sin(ecl.lat * X.DEG)), 4)} for ecliptic latitude ${f2(ecl.lat, 2)} deg), period ${f2(fit.p.P, 4)} yr, drift ${f2(mu, 4)}"/yr, rms ${fit.rms.toExponential(1)}"`);
    line(`    => distance 1/a = ${f2(1 / p, 4)} pc; the drift is larger than the catalogue's 2000.0 rate by ${f2((mu / mu0 - 1) * 100, 2)} % (perspective acceleration of an approaching star, in the app since the astrometry pass)`);
    if (Math.abs(p * s.rec.dist - 1) > 0.002 || Math.abs(q / p - Math.abs(Math.sin(ecl.lat * X.DEG))) > 0.003 || Math.abs(fit.p.P - 1) > 0.002) throw new Error('parallax ellipse of ' + name + ' is not p by p sin(beta) with a period of one year');
    // (b) a 60 arcsec and a 300 arcsec separation from the star to a fixed, very distant neighbour, over the year
    for (const [sepAs, pa] of [[60, 40], [300, 130]]) {
      const nb2 = X.unit([0, 1, 2].map((j) => ref[j] + (tp.n[j] * Math.cos(pa * X.DEG) + tp.e[j] * Math.sin(pa * X.DEG)) * sepAs / AS));
      let lo = Infinity, hi = -Infinity, rlo = Infinity, rhi = -Infinity;
      for (let k = 0; k < 48; k++) {
        const ms = t0 + k / 48 * YR, fr = makeFrame(ms, SITE), b = fr.beta;
        // with aberration ON: both directions get the same velocity vector added (js/objects.js), then the angle between them is taken
        const A1 = X.unit([ref[0] + b[0], ref[1] + b[1], ref[2] + b[2]]), A2 = X.unit([nb2[0] + b[0], nb2[1] + b[1], nb2[2] + b[2]]);
        const sA = X.angleBetween(A1, A2) * 3600; lo = Math.min(lo, sA); hi = Math.max(hi, sA);
        // with refraction ON: what the angle tool does to a click: refract (as drawn), then remove it again (measure.js skyVec)
        const h1 = X.mulMV(fr.Mjh, ref), h2 = X.mulMV(fr.Mjh, nb2);
        if (h1[2] > Math.sin(5 * X.DEG)) { const sR = X.angleBetween(X.unrefractHor(X.refractHor(h1)), X.unrefractHor(X.refractHor(h2))) * 3600 - sepAs; rlo = Math.min(rlo, sR); rhi = Math.max(rhi, sR); }
      }
      line(`    a ${sepAs}" separation: with annual aberration ON it breathes by ${f2(hi - lo, 4)}" over the year (range ${f2(lo, 4)}-${f2(hi, 4)}); with refraction ON the angle tool's remove-refraction step leaves ${rlo === Infinity ? 'n/a (never above 5 deg here)' : f2(Math.max(Math.abs(rlo), Math.abs(rhi)), 5) + '" at most (altitudes above 5 deg)'}`);
    }
  }
  line('    => annual aberration changes a 60" separation by 0.009-0.011" and a 300" one by 0.04-0.05" over a year: at or over the 0.01" that matters here, so BOTH parallax presets switch aberration off');
  line('       (and refraction too, although the angle tool removes refraction to 0.0002"). A student who turns aberration back on in Corrections adds a spurious yearly term of that size.');

  // (c) the simulated measurement noise: unit variance, zero mean, no correlation between axes or between seeds / instants
  { const g = [0, 0]; let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, N = 200000, same = 0; const g2 = [0, 0];
    for (let k = 0; k < N; k++) { noisePair(4242, 1700000000 + k, 0, 12345 + 7 * k, -999 + k, g); sx += g[0]; sy += g[1]; sxx += g[0] * g[0]; syy += g[1] * g[1]; sxy += g[0] * g[1]; noisePair(4243, 1700000000 + k, 0, 12345 + 7 * k, -999 + k, g2); same += g[0] * g2[0]; }
    line(`  simulated noise generator, ${N} draws: mean ${f2(sx / N, 4)}, ${f2(sy / N, 4)}; variance ${f2(sxx / N, 4)}, ${f2(syy / N, 4)}; x-y correlation ${f2(sxy / N, 4)}; correlation between seeds 4242 and 4243 ${f2(same / N, 4)}`);
    if (Math.abs(sxx / N - 1) > 0.02 || Math.abs(syy / N - 1) > 0.02 || Math.abs(sxy / N) > 0.02 || Math.abs(same / N) > 0.02 || Math.abs(sx / N) > 0.01) throw new Error('noise generator is not standard normal');
    noisePair(7, 100, 0, 5, 6, g); noisePair(7, 100, 0, 5, 6, g2); if (g[0] !== g2[0] || g[1] !== g2[1]) throw new Error('noise is not repeatable'); }

  // (d) what two students should expect: simulated students for Barnard's star. Each picks 12 dates over 1.7 years and
  //     a reference star 20-60 arcsec away (fixed here); each end of each measurement carries the simulated noise
  //     (sigma per axis) and a by-eye click error; the readings are rounded as the angle tool rounds them (0.01", 0.001 deg).
  { const s = byHip(87937), ref = C.starApparentEqj(s.k, s.i, frameAt(t0, { par: false })), tp = tangent(ref);
    let seed = 12345; const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) | 0; return (seed >>> 0) / 4294967296; }, gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
    const student = (noise, click, nDates) => {
      const rho = 20 + 40 * rnd(), pa0 = 360 * rnd(), rx = -rho * Math.sin(pa0 * X.DEG), ry = -rho * Math.cos(pa0 * X.DEG), pts = [];
      for (let k = 0; k < nDates; k++) {
        const ms = t0 + (k + rnd() * 0.8) / nDates * 1.7 * YR, u = C.starApparentEqj(s.k, s.i, frameAt(ms));
        const sig = Math.hypot(noise, click) * Math.SQRT2;
        const dx = X.dot(u, tp.e) * AS - rx + gauss() * sig, dy = X.dot(u, tp.n) * AS - ry + gauss() * sig;
        const sep = Math.round(Math.hypot(dx, dy) * 100) / 100, pa = Math.round(Math.atan2(dx, dy) * X.RAD * 1000) / 1000;
        pts.push({ t: 2000 + frameAt(ms).years, x: sep * Math.sin(pa * X.DEG), y: sep * Math.cos(pa * X.DEG) });
      }
      const d = extent(pts), c = anchors(d);
      let fit = bestFit(E, { a: 0.5, b: 0.25, th: 0, P: 1, t0: 2026.0, vx: -0.8, vy: 10.3, x0: pts[0].x, y0: pts[0].y }, pts, c, { scale: { a: 0.2, b: 0.2, th: 15, P: 0.001, t0: 0.2, vx: 0.2, vy: 0.2, x0: 0.3, y0: 0.3 } }); fit = bestFit(E, fit.p, pts, c);
      return { p: Math.max(Math.abs(fit.p.a), Math.abs(fit.p.b)), mu: Math.hypot(fit.p.vx, fit.p.vy) };
    };
    line('  expected scatter between students, Barnard\'s star (60 simulated students each; least-squares ellipse + drift, period free; true p = 0.5483"):');
    for (const [noise, click, nd] of [[0, 0.035, 12], [0.02, 0.035, 12], [0.02, 0.035, 20], [0.04, 0.035, 12], [0.02, 0.07, 12]]) {
      const ps = [], mus = []; for (let k = 0; k < 60; k++) { const r = student(noise, click, nd); ps.push(r.p); mus.push(r.mu); }
      const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length, sd = (a) => { const m = mean(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / (a.length - 1)); };
      line(`    noise ${f2(noise, 2)}" + click error ${f2(click, 3)}" per star image, ${nd} dates: p = ${f2(mean(ps), 3)} ± ${f2(sd(ps), 3)}" (${f2(sd(ps) / 0.5483 * 100, 1)} %), mu = ${f2(mean(mus), 3)} ± ${f2(sd(mus), 3)}"/yr; two students typically differ by ${f2(sd(ps) * Math.SQRT2 / 0.5483 * 100, 1)} % in p`);
    }
  }
  Object.assign(state.fx, saveFx);
}
