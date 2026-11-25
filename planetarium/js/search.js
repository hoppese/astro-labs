// search.js: the search box (Stellarium's F3). Ranked suggestions over stars (proper name, Bayer,
// Flamsteed, HIP, HD), Sun/Moon/planets/moons, constellations and deep-sky objects (M, NGC, IC,
// Caldwell, common names). With an empty box it lists the solar system and the brightest stars,
// marking which are above the horizon now.

import { state, on } from './state.js';
import { getFrame } from './skyframe.js';
import { getBodies, BODIES, SMALL, MOON_PARENT } from './ephem.js';
import { stars, starRecord, constellations, dso, loadAllTiers, loadDeepDso, DSO_TYPES, F, FAINT_NAMES } from './catalog.js';
import { refHorApparent } from './objects.js';
import { select, centerOn } from './nav.js';
import { fmtMag } from './astro.js';
import { nearest } from './fuzzy.js';

const GREEK = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
/** Lower-case, no accents, Greek letters spelled out, punctuation collapsed. */
export function norm(s) {
  return String(s).replace(/[α-ω]/g, (c) => (GREEK[c] || c) + ' ').replace(/[⁰¹²³⁴-⁹]/g, (c) => SUP[c] || '')
    .replace(/['’‘]/g, '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

let index = null;        // [{key, label, sub, mag, ref, w}]
function build() {
  index = [];
  const add = (key, label, sub, mag, ref, w) => index.push({ key: norm(key), label, sub, mag, ref, w });
  for (const b of BODIES) add(b.name, b.name, b.kind === 'planet' ? 'Planet' : b.kind === 'sun' ? 'Star' : b.kind === 'dwarf' ? 'Dwarf planet' : "Earth's moon", null, { kind: 'body', id: b.id }, 100);
  for (const b of SMALL) { add(b.name, b.name, b.kind === 'dwarf' ? 'Dwarf planet' : b.kind === 'comet' ? 'Comet' : 'Asteroid', null, { kind: 'body', id: b.id }, 58); if (b.id === 'Halley') add('1P', b.name, 'Comet', null, { kind: 'body', id: b.id }, 40); }
  for (const id of Object.keys(MOON_PARENT)) add(id, id, 'Moon of ' + MOON_PARENT[id], null, { kind: 'body', id }, 60);
  const conById = {};
  for (const c of constellations) {
    conById[c.id] = c;
    add(c.name, c.name, 'Constellation', null, { kind: 'con', id: c.id }, 70);
    add(c.id, c.name, 'Constellation (' + c.id + ')', null, { kind: 'con', id: c.id }, 30);
  }
  const t0 = stars.tiers[0], names = stars.names;
  for (const i of Object.keys(names.name)) {
    const mag = t0.data[i * stars.NF + F.mag];
    add(names.name[i], names.name[i], (names.bayer[i] ? names.bayer[i] + ' · ' : '') + 'Star', mag, { kind: 'star', k: 0, i: +i }, 80 - mag * 4);
  }
  for (const i of Object.keys(names.bayer)) {
    const mag = t0.data[i * stars.NF + F.mag], bay = names.bayer[i];
    const [letter, con] = bay.split(' ');
    const label = names.name[i] ? `${bay} (${names.name[i]})` : bay;
    const ref = { kind: 'star', k: 0, i: +i };
    add(bay, label, 'Star', mag, ref, 55 - mag * 4);
    if (conById[con]) add(letter + ' ' + conById[con].gen, label, 'Star', mag, ref, 50 - mag * 4);
    const plain = letter.replace(/[⁰¹²³⁴-⁹]/g, '');          // "α¹ Cen" is also found as "alpha cen"
    if (plain !== letter) { add(plain + ' ' + con, label, 'Star', mag, ref, 45 - mag * 4); if (conById[con]) add(plain + ' ' + conById[con].gen, label, 'Star', mag, ref, 44 - mag * 4); }
  }
  for (const i of Object.keys(names.flam)) {
    if (names.bayer[i]) continue;
    const mag = t0.data[i * stars.NF + F.mag], fl = names.flam[i];
    const ref = { kind: 'star', k: 0, i: +i };
    add(fl, fl, 'Star', mag, ref, 35 - mag * 4);
    const [n, con] = fl.split(' ');
    if (conById[con]) add(n + ' ' + conById[con].gen, fl, 'Star', mag, ref, 30 - mag * 4);
  }
  addDso(0);
  const best = new Map();
  for (const e of index) { const b = best.get(e.key); if (!b || e.w > b.w) best.set(e.key, e); }
  for (const [text, target] of Object.entries(ALIASES)) { const e = best.get(norm(target)); if (e) index.push({ ...e, key: norm(text), sub: `“${text}”` + (e.sub ? ' · ' + e.sub : '') }); }
}
/** Everyday names. */
const ALIASES = { 'Seven Sisters': 'Pleiades', Subaru: 'Pleiades', 'North Star': 'Polaris', 'Pole Star': 'Polaris', 'Dog Star': 'Sirius', 'Beetlejuice': 'Betelgeuse', 'Beetle juice': 'Betelgeuse', 'Orion’s Belt': 'Alnilam',
  'Demon Star': 'Algol', 'Big Dipper': 'Ursa Major', Plough: 'Ursa Major', Plow: 'Ursa Major', 'Great Bear': 'Ursa Major', 'Little Dipper': 'Ursa Minor', 'Little Bear': 'Ursa Minor', 'Northern Cross': 'Cygnus', 'Southern Cross': 'Crux',
  Teapot: 'Sagittarius', 'Great Square': 'Pegasus', 'Great Square of Pegasus': 'Pegasus', 'Summer Triangle': 'Vega', 'Evening Star': 'Venus', 'Morning Star': 'Venus', 'Red Planet': 'Mars', Luna: 'Moon', Sol: 'Sun',
  'Beehive Cluster': 'Beehive', Praesepe: 'M 44', 'Rigil Kent': 'α Cen', 'Andromeda Nebula': 'M 31', 'Great Nebula': 'M 42', 'Halley’s Comet': 'Halley', 'Comet Halley': 'Halley' };
/** Things people look for that are not here, and what to say. */
const ABSENT = [[/^(iss|(the )?international space station|space stations?|tiangong|starlink|satellites?|hubble( space)? telescope|hst|jwst|(james )?webb( space)?( telescope)?|voyager( [12])?|spacecraft)$/, 'Satellites and spacecraft (the ISS, Starlink, Hubble …) are not included.'],
  [/^(milky ?way|our galaxy|galactic cent(er|re)|sagittarius a|sgr a)$/, 'The Milky Way is a band across the sky, not one object: press W to show it. Its center is in Sagittarius.'],
  [/^(earth|the earth)$/, 'You are standing on it: the ground at the bottom of the view.'],
  [/^(planet (nine|9|x)|nibiru)$/, 'No such planet has been found.'],
  [/^(black holes?|quasars?|exoplanets?|meteors?( showers?)?|shooting stars?|perseids|leonids|geminids|aurora|northern lights|comets?|asteroid belt|oort cloud)$/, 'Not included. Try a star, a planet, a moon, a constellation, or a Messier or NGC number. The one comet here is Halley.']];
export const absentNote = (q) => { const n = norm(q), a = ABSENT.find(([re]) => re.test(n)); return a ? a[1] : ''; };
/** For a query that matched nothing: what it was probably meant to be. */
export function guesses(q) {
  const n = norm(q), seen = new Set(), out = [];
  if (n.length < 4) return out;
  const pool = index.filter((e) => /^[a-z][a-z ]{2,}$/.test(e.key) && e.w > 0).concat(Object.values(FAINT_NAMES).map((x) => ({ key: norm(x), faint: x })));
  for (const e of nearest(n, pool, (x) => x.key, 24)) {
    const hit = e.faint ? search(e.faint, 1)[0] : e;
    if (!hit || (e.faint && hit.pending)) { if (hit) return [hit]; continue; }
    const k = JSON.stringify(hit.ref); if (seen.has(k)) continue;
    seen.add(k); out.push(hit); if (out.length >= 5) break;
  }
  return out;
}
let dsoIndexed = 0;
function addDso() {
  for (let k = dsoIndexed; k < dso.rows.length; k++) {
    const o = dso.rows[k];
    const ref = { kind: 'dso', idx: o.idx };
    const sub = (DSO_TYPES[o.type] || o.type) + ' in ' + o.con;
    const w = 45 - (o.mag ?? 12) * 2;
    const main = o.m ? 'M ' + o.m : o.id;
    const shown = main + (o.names ? ' · ' + o.names[0] : '');
    const push = (key, bonus = 0) => index.push({ key: norm(key), label: shown, sub, mag: o.mag, ref, w: w + bonus });
    if (o.m) { push('M ' + o.m, 30); push('M' + o.m, 30); push('Messier ' + o.m, 30); }
    if (o.c) { push('C ' + o.c, 5); push('C' + o.c, 5); push('Caldwell ' + o.c, 20); }
    if (/^(NGC|IC) /.test(o.id)) { push(o.id, 10); push(o.id.replace(' ', ''), 10); }
    for (const n of o.names || []) push(n, 25);
  }
  dsoIndexed = dso.rows.length;
}

/** Ranked matches for a query string. */
export function search(q, limit = 12) {
  if (!index) build();
  if (dsoIndexed < dso.rows.length) addDso();
  const n = norm(q);
  if (!n) return [];
  const out = [];
  // catalogue numbers that are not in the name index
  // named stars too faint for the name index (Barnard's, Proxima): found by their Hipparcos number
  const faint = n.length >= 3 ? Object.keys(FAINT_NAMES).filter((h) => norm(FAINT_NAMES[h]).startsWith(n)) : [];
  const m = /^(hip|hd)\s*(\d+)$/.exec(n), unloaded = stars.tiers.some((t) => !t.loaded);
  for (const [field, want, name] of (m ? [[m[1] === 'hip' ? F.hip : F.hd, +m[2], '']] : faint.map((h) => [F.hip, +h, FAINT_NAMES[h]]))) {
    for (const t of stars.tiers) {
      if (!t.loaded) continue;
      for (let i = 0; i < t.n; i++) if (t.data[i * stars.NF + field] === want) {
        const s = starRecord(t.k, i);
        out.push({ label: name || (m[1] === 'hip' ? 'HIP ' : 'HD ') + want + (s.name ? ' · ' + s.name : ''), sub: name ? 'HIP ' + want + ' · Star' : 'Star', mag: s.mag, ref: { kind: 'star', k: t.k, i }, w: 0, score: name ? 380 : 1000 });
      }
    }
  }
  const loading = (faint.length || m) && unloaded && !out.length;
  if (loading) loadAllTiers().then(() => rerun && rerun());
  if (loading && m) return [{ label: 'Loading the full star catalog…', sub: '', pending: true }];
  const seen = new Set();
  for (const e of index) {
    let s;
    if (e.key === n) s = 400;
    else if (e.key.startsWith(n)) s = 250 - (e.key.length - n.length);
    else if ((' ' + e.key).includes(' ' + n)) s = 150;
    else if (n.length >= 3 && e.key.includes(n)) s = 80;
    else continue;
    out.push({ ...e, score: s + e.w });
  }
  out.sort((a, b) => b.score - a.score);
  const res = [];
  for (const e of out) {
    const k = e.ref ? JSON.stringify(e.ref) : e.label;
    if (seen.has(k)) continue;
    seen.add(k); res.push(e);
    if (res.length >= limit) break;
  }
  if (!res.length && loading) return [{ label: 'Loading the full star catalog…', sub: '', pending: true }];
  if (!res.length && /^(ngc|ic)\s*\d+/.test(n) && !dso.deepLoaded) { loadDeepDso().then(() => rerun && rerun()); return [{ label: 'Loading the full NGC/IC list…', sub: '', pending: true }]; }
  return res;
}
let rerun = null;

/** The 30 brightest stars, brightest first. */
export function brightestStars(count = 30) {
  const out = [];
  for (let i = 0; i < count; i++) { const s = starRecord(0, i); out.push({ label: s.name || s.bayer || 'HIP ' + s.hip, sub: s.bayer || '', mag: s.mag, ref: { kind: 'star', k: 0, i } }); }
  return out;
}

// ---- UI --------------------------------------------------------------------------------
export function initSearch(root) {
  const input = root.querySelector('input'), list = root.querySelector('.search-list');
  let items = [], active = -1, wanted = false;      // wanted: Enter was pressed before the answer was there
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const isUp = (ref) => {
    const frame = getFrame(); const h = refHorApparent(ref, frame, getBodies(frame));
    return h ? h[2] > 0 : null;
  };
  const optHtml = (e, i) => {
    if (e.pending) return `<div class="empty">${esc(e.label)}</div>`;
    const up = isUp(e.ref);
    return `<button class="opt" role="option" id="sopt${i}" data-i="${i}" aria-selected="false">` +
      `<span class="up${up ? '' : ' down'}" title="${up ? 'Above the horizon now' : 'Below the horizon now'}">${up ? '▲' : '▽'}</span>` +
      `<span>${esc(e.label)}</span><span class="sub">${esc(e.sub || '')}</span>` +
      (e.mag != null ? `<span class="mag">${fmtMag(e.mag, 1)}</span>` : '') + `</button>`;
  };
  function show() {
    const q = input.value.trim();
    let html = '';
    if (!q) {
      const sol = BODIES.map((b) => ({ label: b.name, sub: b.kind === 'planet' ? 'Planet' : b.kind === 'dwarf' ? 'Dwarf planet' : '', mag: getBodies(getFrame()).byId[b.id].mag, ref: { kind: 'body', id: b.id } }));
      const br = brightestStars(30);
      items = sol.concat(br);
      html = '<div class="grp">Solar system</div>' + sol.map(optHtml).join('') +
        '<div class="grp">Brightest stars · ▲ = up now</div>' + br.map((e, i) => optHtml(e, i + sol.length)).join('');
    } else {
      const note = absentNote(q);
      items = note ? [] : search(q);
      let head = '';
      if (!note && !items.length) { items = guesses(q); if (items.length && !items[0].pending) head = '<div class="grp">Nothing by that exact name. Did you mean</div>'; }
      html = note ? `<div class="empty">${esc(note)}</div>` : items.length ? head + items.map(optHtml).join('') : '<div class="empty">Nothing found. Try a star name, “M 31”, “NGC 7000”, “HIP 91262” or a constellation.</div>';
    }
    list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true');
    active = q && items.length && !items[0].pending ? 0 : -1;
    mark();
    if (wanted && active === 0) { wanted = false; choose(0); }
  }
  function mark() {
    list.querySelectorAll('.opt').forEach((el) => { const on = +el.dataset.i === active; el.classList.toggle('active', on); el.setAttribute('aria-selected', on); if (on) el.scrollIntoView({ block: 'nearest' }); });
    if (active >= 0) input.setAttribute('aria-activedescendant', 'sopt' + active); else input.removeAttribute('aria-activedescendant');
  }
  function hide() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); rerun = null; wanted = false; }
  function choose(i) {
    const e = items[i];
    if (!e || e.pending) return;
    select(e.ref); centerOn(e.ref, 'arrive');
    input.value = ''; hide(); input.blur();
    document.getElementById('sky').focus({ preventScroll: true });
  }
  input.addEventListener('focus', () => { rerun = show; show(); });
  input.addEventListener('input', () => { wanted = false; rerun = show; show(); });
  input.addEventListener('keydown', (e) => {
    const n = items.filter((x) => !x.pending).length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) show(); else { active = Math.min(n - 1, active + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); else if (n) choose(0); else wanted = items.some((x) => x.pending); }
    else if (e.key === 'Escape') { e.preventDefault(); if (input.value) { input.value = ''; show(); } else { hide(); input.blur(); } }
    e.stopPropagation();
  });
  list.addEventListener('pointerdown', (e) => e.preventDefault());      // keep focus in the input
  list.addEventListener('click', (e) => { const b = e.target.closest('.opt'); if (b) choose(+b.dataset.i); });
  document.addEventListener('pointerdown', (e) => { if (!root.contains(e.target)) hide(); });
  on('catalog', () => { if (!list.hidden && rerun) rerun(); });
  return { focus() { input.focus(); input.select(); } };
}
export { state };
