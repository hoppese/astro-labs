// check-spectro.mjs: the spectrograph's model spectra (js/spectro.js) and its catalogue of types (data/sptype.txt). A failure throws.
import { readFileSync } from 'node:fs';
import * as S from '../js/spectro.js';

export async function checkSpectro({ line }) {
  const fail = (m) => { throw new Error('spectrograph: ' + m); };
  // parsing
  const P = (t) => S.parseType(t);
  const cases = [['A0V', 20, 5], ['B8Ia', 18, 1], ['K2IIIp', 52, 3], ['M1Ib + B2.5V', 61, 1], ['A0Vvar', 20, 5], ['F5IV-V', 35, 4], ['G8III', 48, 3], ['O9.5Ib SB', 9.5, 1], ['M2Ib', 62, 1], ['F7:Ib-IIv SB', 37, 1]];
  for (const [t, x, lum] of cases) { const p = P(t); if (!p || Math.abs(p.x - x) > 1e-9 || p.lum !== lum) fail(`parse ${t}: ${JSON.stringify(p)}`); }
  line(`  types parsed: ${cases.map((c) => c[0]).join(', ')}`);

  // Wien: the model continuum peaks at 2.898e6 / T nm (search 80 to 3000 nm)
  for (const type of ['B2V', 'A0V', 'G2V', 'K5III', 'M2Ib']) {
    const st = S.makeStar({ type, noise: 0 });
    let best = 0, at = 0;
    for (let l = 80; l <= 3000; l += 0.25) { const f = st.continuum(l); if (f > best) { best = f; at = l; } }
    const want = S.WIEN / st.T;
    if (Math.abs(at - want) / want > 0.03) fail(`Wien peak for ${type}: ${at} nm, want ${want.toFixed(1)}`);
    line(`  ${type}: T ${Math.round(st.T)} K, continuum peak ${at.toFixed(1)} nm (2.898e6 / T = ${want.toFixed(1)} nm)`);
  }
  // Balmer strongest at A
  const depthHb = (type) => S.makeStar({ type, noise: 0 }).lines.find((l) => l.name === 'Hβ').depth;
  const dep = Object.fromEntries(['O5V', 'B5V', 'A0V', 'F5V', 'G2V', 'K5V', 'M2V'].map((t) => [t, depthHb(t)]));
  if (Object.entries(dep).some(([t, d]) => t !== 'A0V' && d >= dep['A0V'])) fail('Balmer not strongest at A0: ' + JSON.stringify(dep));
  line(`  Hβ depth by type: ${Object.entries(dep).map(([t, d]) => `${t} ${d.toFixed(2)}`).join(', ')} (strongest at A0)`);
  // Doppler: 30 km/s moves Hα by 0.066 nm; find the minimum of the noiseless spectrum near Hα
  const minNear = (st, c) => { let m = Infinity, at = 0; for (let l = c - 2; l <= c + 2; l += 0.0005) { const f = st.flux(l, false) / st.continuum(l); if (f < m) { m = f; at = l; } } return at; };
  const s0 = S.makeStar({ type: 'A0V', rv: 0, noise: 0 }), s30 = S.makeStar({ type: 'A0V', rv: 30, noise: 0 });
  const shift = minNear(s30, 656.28) - minNear(s0, 656.28), want = 656.28 * 30 / S.C_KMS;
  if (Math.abs(shift - want) > 0.003) fail(`Doppler: Hα moved ${shift.toFixed(4)} nm for 30 km/s, want ${want.toFixed(4)}`);
  line(`  Doppler: Hα moves ${shift.toFixed(4)} nm for +30 km/s (656.28 × 30 / c = ${want.toFixed(4)} nm)`);
  // TiO only in M, Ca II K strong in K, He II only in O
  const has = (type, name, min) => S.makeStar({ type, noise: 0 }).lines.some((l) => l.name === name && l.depth >= min);
  if (!has('M2III', 'TiO', 0.3) || has('K0III', 'TiO', 0.1) || !has('O5V', 'He II', 0.2) || has('B5V', 'He II', 0.05) || !has('K0III', 'Ca II K', 0.6)) fail('class markers (TiO in M, He II in O, Ca II K in K)');
  line('  TiO only in M, He II only in O, Ca II K strong in K: yes');
  // noise: fixed for one student and star, different for another student
  const a = S.makeStar({ type: 'G2V', key: 7, seed: 11 }), b = S.makeStar({ type: 'G2V', key: 7, seed: 11 }), c = S.makeStar({ type: 'G2V', key: 7, seed: 12 });
  if (a.flux(550) !== b.flux(550) || a.flux(550) === c.flux(550)) fail('noise is not a fixed function of seed, star and wavelength');
  // a double-lined binary (Spica): the two stars' He I 587.56 lines sit where their orbit velocities put them, and merge at conjunction
  { const el = S.sb2Elements(65474, 0), dip = (b, lo, hi) => { let best = 2, at = 0; for (let l = lo; l <= hi; l += 0.001) { const t = b.transmission(l); if (t < best) { best = t; at = l; } } return at; };
    for (const ph of [0.25, 0.75]) {
      const jd = el.T0 + ph * el.P, b = S.makeBinary(65474, jd, 0, 0), [v1, v2] = S.sb2Velocities(el, jd), z1 = 587.56 * (1 + v1 / S.C_KMS), z2 = 587.56 * (1 + v2 / S.C_KMS);
      const d1 = dip(b, z1 - 0.1, z1 + 0.1), d2 = dip(b, z2 - 0.1, z2 + 0.1);
      if (Math.abs(d1 - z1) > 0.02 || Math.abs(d2 - z2) > 0.02) fail(`Spica at phase ${ph}: dips at ${d1.toFixed(3)} and ${d2.toFixed(3)}, want ${z1.toFixed(3)} and ${z2.toFixed(3)}`);
      if (Math.abs(v1 - el.gamma - (ph === 0.25 ? 1 : -1) * el.K1) > 1e-6 || Math.abs(v2 - el.gamma + (ph === 0.25 ? 1 : -1) * el.K2) > 1e-6) fail('Spica velocities');
    }
    const msin = 1.0361e-7 * (el.K1 + el.K2) ** 3 * el.P, M = msin / Math.sin(el.inc * Math.PI / 180) ** 3, M1 = M * el.K2 / (el.K1 + el.K2);
    if (Math.abs(M - (el.M1 + el.M2)) / (el.M1 + el.M2) > 0.05 || Math.abs(el.K2 / el.K1 - el.M1 / el.M2) > 0.02) fail(`Spica masses from the model: ${M.toFixed(2)} (want ${el.M1 + el.M2}), ratio ${(el.K2 / el.K1).toFixed(3)}`);
    const s1 = S.sb2Elements(65474, 5), s2 = S.sb2Elements(65474, 5); if (s1.K1 !== s2.K1 || s1.K1 === el.K1) fail('Spica per-student elements');
    line(`  Spica (double-lined, circular model): He I 587.56 split ±${(587.56 * el.K1 / S.C_KMS).toFixed(3)} and ±${(587.56 * el.K2 / S.C_KMS).toFixed(3)} nm; from K1 ${el.K1}, K2 ${el.K2}, P ${el.P} d and i ${el.inc}°: M1 + M2 ${M.toFixed(1)}, M1 ${M1.toFixed(1)} M☉ (published ${el.M1} + ${el.M2})`); }
  // B−V fallback
  const sun = S.teffFromBV(0.65); if (Math.abs(sun - 5800) > 150) fail('B−V 0.65 gives ' + sun);
  line(`  B−V fallback: B−V 0.65 → ${Math.round(sun)} K`);
  // the catalogue file: decodes, and the bright stars have the types the lab relies on
  const txt = readFileSync(new URL('../data/sptype.txt', import.meta.url), 'utf8');
  const m = new Map(); let hip = 0;
  for (const l of txt.split('\n')) { if (!l) continue; const sp = l.indexOf(' '); hip += sp > 0 ? +l.slice(0, sp) : 1; m.set(hip, l.slice(sp + 1)); }
  const want2 = { 32349: 'A', 24436: 'B', 27989: 'M', 24608: 'G', 21421: 'K', 37279: 'F', 26727: 'O' };
  for (const [h, cls] of Object.entries(want2)) if (!m.has(+h) || !m.get(+h).startsWith(cls)) fail(`HIP ${h}: type ${m.get(+h)}, expected ${cls}`);
  line(`  data/sptype.txt: ${m.size} types; Sirius ${m.get(32349)}, Rigel ${m.get(24436)}, Betelgeuse ${m.get(27989)}, Capella ${m.get(24608)}, Alnitak ${m.get(26727)}`);
}
