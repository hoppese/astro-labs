// check-deep.mjs: section 19 of tools/check.mjs: the hosted deep-star tiles (G 12-17, tools/build_deep.py) read through
// the app's own decoder (js/deepstars.js) and compared with the ESA Gaia archive and with GAVO.
//   DEEP_TILES=<folder holding manifest.json>   (default: ~/Documents/GitHub/astro-labs-stars/gaia/v1)
//   node tools/check.mjs --net                   adds the network part (three tiles at ESA, one at GAVO, one COUNT query: about 3 minutes)
import { readFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export async function checkDeep({ line, f2, X, netFetch }) {
  const HP = await import('../js/healpix.js');
  const D = await import('../js/deepstars.js');
  const dir = process.env.DEEP_TILES || join(homedir(), 'Documents/GitHub/astro-labs-stars/gaia/v1');
  if (!existsSync(join(dir, 'manifest.json'))) { line(`  no tile set at ${dir}: skipped`); return; }
  const man = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')), H = D.readDeepManifest(man), rec = man.record;
  line(`  manifest lists ${Object.values(man.skip || {}).reduce((a, v) => a + v.length, 0)} stars to leave out (already in the bright-star catalogue) in ${Object.keys(man.skip || {}).length} tiles; ${H.skipIds.size} source_ids`);
  line(`  manifest: G ${man.magStart} to ${man.magEnd}, ${man.levels.length} levels, ${man.stars.toLocaleString('en')} stars, ${man.tiles.toLocaleString('en')} tiles, ${man.bytes.toLocaleString('en')} bytes (${f2(man.bytes / man.stars, 2)} bytes a star)`);
  // every tile the manifest lists: present, named as its header says, and the headers' star counts add up to the level's
  const head = Buffer.alloc(20); let missing = 0, wrong = 0, largest = 0, seen = 0;
  const perLevel = H.levels.map((lv, L) => {
    let n = 0, files = 0;
    for (const [key, v] of lv.leaves) {
      if (!v) continue;
      if (!netFetch && seen++ % 50) continue;          // the quick run reads every 50th tile; --net reads them all
      const order = Math.floor(key / 268435456), ipix = key % 268435456;
      let fd; try { fd = openSync(join(dir, lv.dir, String(order), ipix + '.bin'), 'r'); } catch (e) { missing++; continue; }
      readSync(fd, head, 0, 20, 0); closeSync(fd);
      if (head.toString('latin1', 0, 4) !== 'GDT1' || head.readUInt32LE(12) !== ipix || head[16] !== order || head[17] !== L) wrong++;
      n += head.readUInt32LE(4); files++; largest = Math.max(largest, head.readUInt32LE(4));
    }
    return { n, files };
  });
  line(`  tile headers: ${perLevel.reduce((a, l) => a + l.files, 0).toLocaleString('en')} files read, ${missing} missing, ${wrong} with a wrong header; largest tile ${largest} stars (${20 + 10 * largest} bytes); ` +
    (netFetch ? `stars per level equal to the manifest's: ${perLevel.every((l, L) => l.n === man.levels[L].stars && l.files === man.levels[L].tiles)}` : 'every 50th tile only (all of them with --net)'));
  const tileOf = (L, ra, dec) => {
    const v = X.sph(ra, dec), p12 = HP.vec2pix(12, v[0], v[1], v[2]), lv = H.levels[L];
    for (let o = lv.minOrder; o <= lv.maxOrder; o++) { const ipix = Math.floor(p12 / 4 ** (12 - o)); if (lv.leaves.get(o * 268435456 + ipix) === 1) { const c = HP.pix2vec(o, ipix, [0, 0, 0]); return { L, order: o, ipix, cx: c[0], cy: c[1], cz: c[2] }; } }
    return null;
  };
  const load = (t) => { const b = readFileSync(join(dir, H.levels[t.L].dir, String(t.order), t.ipix + '.bin')); D.parseHosted(t, b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), rec, H.levels[t.L].m0); return t; };
  // decoding by itself: sorted by G, inside the level, on the sky inside (or within a proper-motion step of) the tile's pixel
  const last = H.levels.length - 1;
  const picks = [[0, 192.86, 27.13, 'north galactic pole'], [Math.min(last, 5), 305.5, 41, 'Cygnus'], [last, 266.4, -29.0, 'galactic centre'], [last, 10, -85, 'near the south pole']]
    .map(([L, ra, dec, where]) => ({ t: tileOf(L, ra, dec), where })).filter((p) => p.t);
  for (const p of picks) {
    const t = load(p.t); let sorted = true, inLevel = true, far = 0;
    for (let i = 0; i < t.n; i++) {
      if (i && t.mag[i] < t.mag[i - 1]) sorted = false;
      if (t.mag[i] < H.levels[t.L].m0 - 1e-4 || t.mag[i] > H.levels[t.L].m1 + 1e-4) inLevel = false;
      far = Math.max(far, X.angleBetween(X.sph(t.ra0[i], t.dec0[i]), [t.cx, t.cy, t.cz]));
    }
    line(`  tile ${t.L}/${t.order}/${t.ipix} (${p.where}): ${t.n} stars, sorted by G: ${sorted}, all in G ${H.levels[t.L].m0}-${H.levels[t.L].m1}: ${inLevel}, farthest from the pixel centre ${f2(far, 3)} deg (pixel radius bound ${f2(HP.pixRadius(t.order) * X.RAD, 3)})`);
  }
  if (!netFetch) { line('  comparison with the ESA archive and GAVO not run (add --net: about 3 minutes)'); return; }
  const UA = { 'User-Agent': 'Mozilla/5.0 (catalogue check script)' };
  const csv = async (url, body) => {
    const r = await netFetch(url, body ? { method: 'POST', headers: { ...UA, 'content-type': 'application/x-www-form-urlencoded' }, body, signal: AbortSignal.timeout(240000) } : { headers: UA, signal: AbortSignal.timeout(240000) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return (await r.text()).split(/\r?\n/).slice(1).filter((l) => l.length > 3).map((l) => l.split(','));
  };
  const esa = (q) => csv('https://gea.esac.esa.int/tap-server/tap/sync', new URLSearchParams({ REQUEST: 'doQuery', LANG: 'ADQL', FORMAT: 'csv', MAXREC: '3000000', QUERY: q }).toString());
  const num = (x) => (x === '' || x === undefined || x === 'null' ? NaN : +x);
  const [pa0, pb0] = rec.pm, [xa0, xb0] = rec.plx;
  const pmStep = (v) => Math.sqrt(pa0 * pa0 + 4 * pb0 * Math.abs(v)), plxStep = (v) => Math.sqrt(xa0 * xa0 + 4 * xb0 * Math.max(0, v));     // d(value)/d(code)
  // rows: [ra, dec, G, BP-RP, pmra, pmdec, parallax] at Gaia's epoch 2016.0. Each is matched to the nearest tile star of the same G.
  const compare = (t, rows, who) => {
    let dPos = 0, dG = 0, dC = 0, dPm = 0, dPx = 0, unmatched = 0, nulls = 0;
    const tv = []; for (let i = 0; i < t.n; i++) tv.push(X.sph(t.ra0[i], t.dec0[i]));
    for (const [ra, dec, g, c, pa, pd, px] of rows) {
      const dec0 = dec - (pd === pd ? pd * 16 / 3.6e6 : 0), ra0 = ra - (pa === pa ? pa * 16 / 3.6e6 / Math.cos(dec * X.DEG) : 0), v = X.sph(ra0, dec0);
      let best = -1, bd = 1e9;
      for (let i = 0; i < t.n; i++) { if (Math.abs(t.mag[i] - g) > 0.0016) continue; const d = X.angleBetween(v, tv[i]); if (d < bd) { bd = d; best = i; } }
      if (best < 0 || bd * 3600 > 0.2) { unmatched++; continue; }
      dPos = Math.max(dPos, bd * 3600); dG = Math.max(dG, Math.abs(t.mag[best] - g));
      if (c === c) { if (c > -1 && c < 4.08) dC = Math.max(dC, Math.abs(t.col[best] - c)); } else if (t.col[best] === t.col[best]) nulls++;
      if (pa === pa) dPm = Math.max(dPm, Math.abs(t.pmr[best] - pa) / pmStep(pa), Math.abs(t.pmd[best] - pd) / pmStep(pd)); else if (t.pmr[best] === t.pmr[best]) nulls++;
      if (px === px) { if (px > 0.02) dPx = Math.max(dPx, Math.abs(t.plx[best] - px) / plxStep(px)); else if (t.plx[best] !== 0) nulls++; } else if (t.plx[best] === t.plx[best]) nulls++;
    }
    line(`  tile ${t.L}/${t.order}/${t.ipix} against ${who}: ${rows.length} rows there, ${t.n} stars here, ${unmatched} unmatched; worst place ${f2(dPos, 3)}" (epoch 2000), G ${f2(dG, 4)} mag, BP-RP ${f2(dC, 3)}, ` +
      `proper motion ${f2(dPm, 2)} and parallax ${f2(dPx, 2)} of a coding step; missing and non-positive values kept so: ${nulls === 0}`);
  };
  const range = (t) => { const sh = BigInt(35 + 2 * (12 - t.order)); return [BigInt(t.ipix) << sh, ((BigInt(t.ipix) + 1n) << sh) - 1n]; };
  try {
    for (const p of picks.slice(0, 3)) {
      const t = p.t, [lo, hi] = range(t), lv = H.levels[t.L];
      const rows = (await esa(`SELECT ra, dec, phot_g_mean_mag, bp_rp, pmra, pmdec, parallax FROM gaiadr3.gaia_source WHERE source_id BETWEEN ${lo} AND ${hi} AND phot_g_mean_mag >= ${lv.m0} AND phot_g_mean_mag < ${lv.m1}`)).map((r) => r.map(num));
      compare(t, rows, 'the ESA archive');
    }
  } catch (e) { line('  ESA archive not reachable (' + e.message + '): tile comparison skipped'); }
  try {
    // the same tile as the app asks it of GAVO when the hosted set is down (its columns: id, ra, dec, g, c, plx, pmra, pmdec; rounded by the query)
    const t = picks[0].t, q = D.tileQuery(t);
    const rows = (await csv(D.PROVIDER.url + '?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=' + encodeURIComponent(q))).map((r) => [num(r[1]), num(r[2]), num(r[3]), num(r[4]), num(r[6]), num(r[7]), num(r[5])]);
    compare(t, rows, "GAVO (the app's own fallback request)");
  } catch (e) { line('  GAVO not reachable (' + e.message + '): skipped'); }
  try {
    const rows = await esa(`SELECT mb, COUNT(*) AS n FROM (SELECT FLOOR(phot_g_mean_mag*2) AS mb FROM gaiadr3.gaia_source WHERE phot_g_mean_mag >= ${man.magStart} AND phot_g_mean_mag < ${man.magEnd}) AS s GROUP BY mb`);
    const arch = new Map(rows.map((r) => [Math.round(+r[0]), +r[1]]));
    const diff = man.levels.map((lv) => lv.stars - (arch.get(Math.round(lv.m0 * 2)) ?? NaN));
    line(`  stars per level (manifest): ${man.levels.map((lv, L) => `${lv.m0}: ${lv.stars.toLocaleString('en')}${diff[L] === 0 ? '' : ' (ARCHIVE ' + arch.get(Math.round(lv.m0 * 2)) + ')'}`).join(', ')}`);
    line(`  all ${man.levels.length} levels equal to the archive's COUNT(*) just now: ${diff.every((d) => d === 0)}; total ${man.stars.toLocaleString('en')}, archive ${[...arch.values()].reduce((a, b) => a + b, 0).toLocaleString('en')}`);
  } catch (e) { line('  ESA archive not reachable (' + e.message + '): level counts not compared'); }
}
