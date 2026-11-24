// Builds data/links.json: which English Wikipedia article belongs to which named star, deep-sky object, constellation,
// planet or moon. No title is guessed: an article is kept only if its Wikidata item is
// demonstrably the same object: it carries our catalogue number (HIP, M, NGC, IC) and its position agrees, or, for solar-system
// bodies and constellations, it is the expected item / class.  No match: no link.
//   node tools/build_links.mjs            (half a minute; needs the network; prints what was left out)
import { readFileSync, writeFileSync } from 'node:fs';
const D = new URL('../data/', import.meta.url);
const json = (f) => JSON.parse(readFileSync(new URL(f, D)));
const UA = { 'User-Agent': 'astro-labs-planetarium-link-builder/1.0' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function sparql(where) {
  const q = 'SELECT ?code ?title ?item ?ra ?dec WHERE { ' + where + ' ?a schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> ; schema:name ?title . OPTIONAL { ?item wdt:P6257 ?ra ; wdt:P6258 ?dec . } }';
  for (let k = 0; k < 6; k++) {
    try {
      const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) });
      if (r.ok) { const j = await r.json(); await sleep(1500); return j.results.bindings.map((b) => ({ code: b.code && b.code.value, title: b.title.value, q: b.item.value.split('/').pop(), ra: b.ra ? +b.ra.value : NaN, dec: b.dec ? +b.dec.value : NaN })); }
      console.error('  HTTP', r.status); await sleep(1000 * (+r.headers.get('retry-after') || 10));
    } catch (e) { await sleep(5000); }
  }
  throw new Error('Wikidata does not answer');
}
const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const DEG = Math.PI / 180;
const sep = (a, b) => Math.acos(Math.min(1, Math.sin(a.dec * DEG) * Math.sin(b.dec * DEG) + Math.cos(a.dec * DEG) * Math.cos(b.dec * DEG) * Math.cos((a.ra - b.ra) * DEG))) / DEG;

const GREEK = { α: 'Alpha', β: 'Beta', γ: 'Gamma', δ: 'Delta', ε: 'Epsilon', ζ: 'Zeta', η: 'Eta', θ: 'Theta', ι: 'Iota', κ: 'Kappa', λ: 'Lambda', μ: 'Mu', ν: 'Nu', ξ: 'Xi', ο: 'Omicron', π: 'Pi', ρ: 'Rho', σ: 'Sigma', τ: 'Tau', υ: 'Upsilon', φ: 'Phi', χ: 'Chi', ψ: 'Psi', ω: 'Omega' };
const cons = json('constellations.json'), gen = Object.fromEntries(cons.map((c) => [c.id, c.gen]));
const targets = [];
// --- stars with a proper name (names index the first star tier)
{ const names = json('starnames.json'), man = json('stars.json'), buf = readFileSync(new URL(man.tiers[0].file, D));
  const f = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4), NF = man.fields.length, at = (i, k) => f[i * NF + man.fields.indexOf(k)];
  for (const [i, name] of Object.entries(names.name)) {
    const cand = [name, name + ' (star)'], b = names.bayer[i], fl = names.flam[i];
    if (b) { const m = /^(.)([¹²³⁴⁵⁶⁷⁸⁹]*) (\w+)$/u.exec(b); if (m && GREEK[m[1]] && gen[m[3]]) { const sup = [...m[2]].map((c) => '⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)).join(''); cand.push(`${GREEK[m[1]]}${sup} ${gen[m[3]]}`); if (sup) cand.push(`${GREEK[m[1]]} ${gen[m[3]]}`); } }
    if (fl) { const m = /^(\d+) (\w+)$/.exec(fl); if (m && gen[m[2]]) cand.push(`${m[1]} ${gen[m[2]]}`); }
    const hip = at(+i, 'hip');
    if (hip) cand.push('HIP ' + hip);
    targets.push({ group: 'star', key: name, cand: [...new Set(cand)], ra: at(+i, 'ra'), dec: at(+i, 'dec'), tol: 0.05, codes: hip ? ['HIP ' + hip] : [] });
  } }
// --- deep sky: Messier, Caldwell and everything OpenNGC has a common name for
{ const d = json('dso.json'); for (const r of d.rows) {
  const o = Object.fromEntries(d.fields.map((k, i) => [k, r[i]]));
  if (!(o.m || o.c || o.names)) continue;
  const ngc = /^(NGC|IC) /.test(o.id) ? o.id : null, cand = [];
  if (o.m) cand.push('Messier ' + o.m);
  if (ngc) cand.push(ngc);
  if (o.c) cand.push('Caldwell ' + o.c);
  for (const n of o.names || []) cand.push(n);
  const codes = [o.m && 'M ' + o.m, o.m && 'Messier ' + o.m, ngc].filter(Boolean);
  targets.push({ group: 'dso', key: o.id, cand, ra: o.ra, dec: o.dec, tol: Math.max(0.1, Math.min(2, (o.maj || 0) / 60 * 0.5)), codes });
} }
for (const c of cons) targets.push({ group: 'con', key: c.id, cand: [c.name + ' (constellation)', c.name, ...(c.id === 'CrA' ? ['Corona Australis'] : [])], cls: 'Q8928' });
const BODIES = { Sun: ['Sun', 'Q525'], Moon: ['Moon', 'Q405'], Mercury: ['Mercury (planet)', 'Q308'], Venus: ['Venus', 'Q313'], Mars: ['Mars', 'Q111'], Jupiter: ['Jupiter', 'Q319'], Saturn: ['Saturn', 'Q193'], Uranus: ['Uranus', 'Q324'], Neptune: ['Neptune', 'Q332'] };
for (const [k, [t, q]] of Object.entries(BODIES)) targets.push({ group: 'body', key: k, cand: [t], q });
for (const [par, pq, list] of [['Jupiter', 'Q319', ['Io', 'Europa', 'Ganymede', 'Callisto']], ['Saturn', 'Q193', ['Mimas', 'Enceladus', 'Tethys', 'Dione', 'Rhea', 'Titan', 'Iapetus']]])
  for (const m of list) targets.push({ group: 'body', key: m, cand: [`${m} (moon)`, m], parent: pq, par });

// --- ask Wikidata for the items that carry our catalogue numbers (or the expected item numbers) and have an English article
const out = { star: {}, dso: {}, con: {}, body: {} }, left = [];
const byCode = {};
for (const c of chunk([...new Set(targets.flatMap((t) => t.codes || []))], 120))
  for (const r of await sparql(`VALUES ?code { ${c.map((x) => JSON.stringify(x)).join(' ')} } ?item wdt:P528 ?code .`)) (byCode[r.code] = byCode[r.code] || []).push(r);
const conRows = await sparql('?item wdt:P31 wd:Q8928 .'), bodyRows = await sparql(`VALUES ?item { ${Object.values(BODIES).map((b) => 'wd:' + b[1]).join(' ')} }`);
const moonRows = {}; for (const pq of ['Q319', 'Q193']) moonRows[pq] = await sparql(`?item wdt:P397 wd:${pq} ; wdt:P31/wdt:P279* wd:Q2537 .`);
// second look-up, by article title, for what the numbers did not find: kept only if the position (or the class) agrees
async function byTitle(list) {
  const rows = [];
  for (const c of chunk([...new Set(list)], 100)) {
    const q = 'SELECT ?title ?item ?ra ?dec ?code ?con WHERE { VALUES ?title { ' + c.map((x) => JSON.stringify(x) + '@en').join(' ') + ' } ?a schema:name ?title ; schema:isPartOf <https://en.wikipedia.org/> ; schema:about ?item . OPTIONAL { ?item p:P6257/ps:P6257 ?ra ; p:P6258/ps:P6258 ?dec . } OPTIONAL { ?item p:P528/ps:P528 ?code . } BIND(EXISTS { ?item p:P31/ps:P31 wd:Q8928 } AS ?con) }';
    for (let k = 0; ; k++) { const r = await fetch('https://query.wikidata.org/sparql', { method: 'POST', headers: { ...UA, Accept: 'application/sparql-results+json', 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'query=' + encodeURIComponent(q) }).catch(() => ({ ok: false })); if (r.ok) { for (const b of (await r.json()).results.bindings) rows.push({ title: b.title.value, q: b.item.value.split('/').pop(), ra: b.ra ? +b.ra.value : NaN, dec: b.dec ? +b.dec.value : NaN, code: b.code && b.code.value, con: b.con && b.con.value === 'true' }); break; } if (k > 5) throw new Error('Wikidata does not answer'); await sleep(8000); }
    await sleep(1500);
  }
  return rows;
}
const second = [];
for (const t of targets) {
  let title = null, why = 'not in Wikidata under ' + (t.codes || []).join(', ');
  if (t.q) title = (bodyRows.find((r) => r.q === t.q) || {}).title;
  else if (t.parent) title = t.cand.find((c) => moonRows[t.parent].some((r) => r.title === c));
  else if (t.cls) title = t.cand.find((c) => conRows.some((r) => r.title === c));
  else {
    // each title: how far is the nearest position its item states?
    const opt = new Map();
    for (const r of (t.codes || []).flatMap((c) => byCode[c] || [])) { const d = isFinite(r.ra) && isFinite(r.dec) ? sep(t, r) : null; const o = opt.get(r.title); if (o === undefined || (d != null && (o == null || d < o))) opt.set(r.title, d); }
    const good = [...opt].filter(([, d]) => d == null || d < t.tol);
    if (good.length === 1) title = good[0][0];
    else if (good.length > 1) { title = t.cand.find((c) => good.some((g) => g[0] === c)) || null; why = 'ambiguous: ' + good.map((g) => g[0]).join(', '); }
    else if (opt.size) why = 'position disagrees: ' + [...opt].map(([k, d]) => `${k} ${d.toFixed(2)} deg`).join(', ');
  }
  if (title) out[t.group][t.key] = title; else second.push([t, why]);
}
{ const rows = await byTitle(second.flatMap(([t]) => t.cand));
  for (const [t, why] of second) {
    let title = null;
    for (const c of t.cand) { const rs = rows.filter((r) => r.title === c); if (rs.some((r) => (t.cls ? r.con || c === t.cand[0] : t.codes && ((isFinite(r.ra) && sep(t, r) < t.tol) || t.codes.includes(r.code))))) { title = c; break; } }
    if (title) { out[t.group][t.key] = title; console.log('  by title:', t.group, t.key, '->', title); } else left.push(`${t.group} ${t.key}: ${why}; titles seen: ${[...new Set(rows.filter((r) => t.cand.includes(r.title)).map((r) => r.title + (isFinite(r.ra) ? ' ' + (t.cls ? '' : sep(t, r).toFixed(2)) : ' (no position)')))].join(', ') || 'none'}`);
  } }
// an article about a constellation's star must not stand for two different stars unless it covers both: list repeats for a look
const seen = {}; for (const g of ['star', 'dso']) for (const [k, v] of Object.entries(out[g])) (seen[v] = seen[v] || []).push(k);
const date = new Date().toISOString().slice(0, 10);
writeFileSync(new URL('links.json', D), JSON.stringify({ date, note: 'English Wikipedia titles, each checked through its Wikidata item (tools/build_links.mjs)', ...out }).replace(/\},"/g, '},\n"') + '\n');
for (const g of Object.keys(out)) console.log(g, Object.keys(out[g]).length, 'of', targets.filter((t) => t.group === g).length);
console.log('one article, several objects:', Object.entries(seen).filter(([, v]) => v.length > 1).map(([k, v]) => `${k}: ${v.join(', ')}`).join(' | '));
console.log('left out (' + left.length + '):\n  ' + left.join('\n  '));
