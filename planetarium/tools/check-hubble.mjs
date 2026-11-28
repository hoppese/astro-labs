// check-hubble.mjs: the Hubble-law lab (labs/presets.js 'hubble'): the model galaxy spectra (js/spectro.js makeGalaxy) carry the
// catalogue's redshift in their lines, and the lab's galaxies give a sensible H0 with the diameter calibrated on M101. A failure throws.
import { readFileSync } from 'node:fs';
import * as S from '../js/spectro.js';

export async function checkHubble({ line }) {
  const fail = (m) => { throw new Error('hubble lab: ' + m); };
  const rows = [];
  for (const f of ['dso.json', 'dso-deep.json']) {
    const d = JSON.parse(readFileSync(new URL('../data/' + f, import.meta.url), 'utf8'));
    for (const r of d.rows) rows.push(Object.fromEntries(d.fields.map((k, i) => [k, r[i]])));
  }
  const by = new Map(rows.map((o) => [o.id, o]));
  // the eleven galaxies named in the prompt
  const pre = readFileSync(new URL('../js/labs/presets.js', import.meta.url), 'utf8');
  const lab = pre.slice(pre.indexOf("id: 'hubble'"), pre.indexOf("id: 'hubble'") + 6000);
  const list = /add these eleven by name: ([^.]*)\./.exec(lab);
  if (!list) fail('the prompt no longer lists the galaxies');
  const ids = list[1].split(',').map((s) => s.trim().replace(/\s*\(.*\)$/, ''));
  if (ids.length !== 11) fail(`${ids.length} galaxies in the prompt, expected 11`);
  // 1. the lines are where (1 + z) puts them: find calcium K as the deepest point near its shifted place, with the student's 1% noise
  let worst = 0, worstHa = 0;
  for (const id of [...ids, 'NGC 5457', 'NGC 224', 'NGC 3034']) {
    const o = by.get(id); if (!o || o.z == null) fail(`${id}: no redshift in OpenNGC`);
    const g = S.makeGalaxy({ z: o.z, hubble: o.hubble, key: 7, seed: 3 }), want = 393.37 * (1 + o.z);
    let best = Infinity, at = 0;
    for (let l = want - 3; l <= want + 3; l += 0.01) { const v = g.flux(l) / g.continuum(l); if (v < best) { best = v; at = l; } }
    worst = Math.max(worst, Math.abs(at - want));
    if (g.spiral) {      // hydrogen α in emission
      const wa = 656.28 * (1 + o.z); let top = 0, ta = 0;
      for (let l = wa - 3; l <= wa + 3; l += 0.01) { const v = g.flux(l, false) / g.continuum(l); if (v > top) { top = v; ta = l; } }
      if (!(top > 1.3)) fail(`${id}: no Hα emission`); worstHa = Math.max(worstHa, Math.abs(ta - wa));
    }
  }
  const kms = worst / 393.37 * S.C_KMS;
  if (worst > 0.15) fail(`calcium K found ${worst.toFixed(3)} nm from (1 + z) × 393.37 nm`);
  line(`  model galaxy spectra: calcium K at (1 + z) × 393.37 nm to within ${worst.toFixed(3)} nm (${Math.round(kms)} km/s) with the 1% noise; Hα emission in the spirals within ${worstHa.toFixed(3)} nm`);
  // 2. the key: M101's diameter, then d = D / θ, a line through the origin
  const m101 = by.get('NGC 5457'), rad = (arcmin) => arcmin / 60 * Math.PI / 180;
  const D = 6.85 * rad(m101.maj);         // Mpc
  let sxy = 0, sxx = 0;
  for (const id of ids) { const o = by.get(id); if (!/^S/.test(o.hubble || '') || /^S0/.test(o.hubble)) fail(`${id} (${o.hubble}) is not a spiral`); const d = D / rad(o.maj), v = o.z * S.C_KMS; sxy += d * v; sxx += d * d; }
  const H0 = sxy / sxx;
  if (!(H0 > 60 && H0 < 80)) fail(`the key's H0 is ${H0.toFixed(1)} km/s/Mpc`);
  const blue = by.get('NGC 224').z < 0;
  if (!blue) fail('M31 is not blueshifted in the catalogue');
  line(`  key: M101 ${m101.maj}′ at 6.85 Mpc, D = ${(D * 1000).toFixed(1)} kpc; the eleven spirals give H0 = ${H0.toFixed(1)} km/s/Mpc, 1/H0 = ${(977.8 / H0).toFixed(1)} billion years; M31 blueshifted`);
  // 3. the redshift stays hidden: object-panel rows, and the module and spectrograph hooks
  const hid = readFileSync(new URL('../js/labs/hidden.js', import.meta.url), 'utf8');
  if (!/hubble: \['redshift', 'c × z', 'radial velocity'\]/.test(hid) || !/redshiftHidden = \(\) => running.id === 'hubble'/.test(hid)) fail('hidden.js no longer hides the redshift in the hubble lab');
  const hub = readFileSync(new URL('../js/hubble.js', import.meta.url), 'utf8'), spg = readFileSync(new URL('../js/labs/spectrograph.js', import.meta.url), 'utf8');
  if (!hub.includes('redshiftHidden') || !spg.includes('redshiftHidden')) fail('the Hubble panel or the spectrograph no longer asks redshiftHidden()');
  line('  hidden in the lab: Redshift z, c × z and Radial velocity rows; the z and cz columns and the cz filter of the Hubble panel; the Spectrograph\'s redshift');
  // 4. search finds the lab's galaxies by Messier number, name and NGC number, also after the index is rebuilt (a fainter star tier
  //    loading throws it away: it once came back without the deep-sky objects, and M 31, M 82, M 101 were "Nothing found")
  const Q = await import('../js/search.js'), C = await import('../js/catalog.js');
  if (!C.dso.deepLoaded) await C.loadDeepDso();
  const want = { 'M 82': 'NGC 3034', M82: 'NGC 3034', 'M 31': 'NGC 224', M101: 'NGC 5457', Andromeda: 'NGC 224', 'NGC 3034': 'NGC 3034', 'NGC 6195': 'NGC 6195', 'M 99': 'NGC 4254' };
  const finds = () => { for (const [q, id] of Object.entries(want)) { const r = Q.search(q, 5).filter((x) => x.ref && x.ref.kind === 'dso').map((x) => C.dso.rows[x.ref.idx].id); if (!r.includes(id)) fail(`search "${q}" does not find ${id} (got ${r.join(', ') || 'nothing'})`); } };
  finds(); Q.dropIndex(); finds(); Q.dropIndex(); Q.search('Vega'); finds();
  line(`  search finds ${Object.keys(want).join(', ')}, also after the index is rebuilt`);
}
