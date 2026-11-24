// Section 23 of tools/check.mjs: data/links.json and data/img/index.json refer to things the app has; link addresses are well formed.
import { readFileSync, existsSync, statSync } from 'node:fs';
export async function checkLinks({ line }) {
  const D = new URL('../data/', import.meta.url), json = (f) => JSON.parse(readFileSync(new URL(f, D)));
  const C = await import('../js/catalog.js'), L = await import('../js/links.js');
  const l = json('links.json'); L.links.data = l;
  const names = new Set(Object.values(C.stars.names.name)), ids = new Set(C.dso.rows.map((o) => o.id)), cons = new Set(C.constellations.map((c) => c.id));
  const stray = [...Object.keys(l.star).filter((k) => !names.has(k)), ...Object.keys(l.dso).filter((k) => !ids.has(k)), ...Object.keys(l.con).filter((k) => !cons.has(k))];
  if (stray.length) throw new Error('links.json names unknown objects: ' + stray.join(', '));
  const refs = [...C.dso.rows.map((o) => ({ kind: 'dso', idx: o.idx })), ...C.constellations.map((c) => ({ kind: 'con', id: c.id })), ...Object.keys(l.body).map((id) => ({ kind: 'body', id }))];
  for (const t of C.stars.tiers) if (t.loaded) for (let i = 0; i < t.n; i++) refs.push({ kind: 'star', k: t.k, i });
  let none = 0, wiki = 0, all = 0, coo = 0;
  for (const r of refs) { const a = L.linksFor(r); if (!a.some((x) => x.label !== 'Wikipedia')) none++; if (a.some((x) => x.label === 'Wikipedia')) wiki++; if (a.some((x) => x.url.includes('sim-coo'))) coo++; all += a.length; for (const x of a) { const u = new URL(x.url); if (u.protocol !== 'https:' || /\s|undefined|NaN/.test(x.url)) throw new Error('bad link ' + x.url); } }
  line(`  ${refs.length} objects: ${refs.length - none} have a science database link (${coo} of them by position, for want of a catalogue number SIMBAD knows), ${wiki} also Wikipedia; ${all} links in all`);
  if (none) throw new Error(none + ' objects without a database link');
  const im = json('img/index.json'); let bytes = 0, n = 0;
  for (const [k, v] of Object.entries(im.items)) { const f = new URL('img/' + v[0], D); if (!ids.has(k.split('|')[0])) throw new Error('picture of an unknown object: ' + k); if (!existsSync(f)) throw new Error('missing ' + v[0]); bytes += statSync(f).size; n++; }
  line(`  deep-sky pictures: ${n} files, ${(bytes / 1e6).toFixed(2)} MB, every one belongs to a catalogue object`);
}
