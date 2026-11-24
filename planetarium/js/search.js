// search.js: the search box (Stellarium's F3). Ranked suggestions over stars (proper name, Bayer,
// Flamsteed, HIP, HD), Sun/Moon/planets/moons, constellations and deep-sky objects (M, NGC, IC,
// Caldwell, common names). With an empty box it lists the solar system and the brightest stars,
// marking which are above the horizon now.

import { state, on } from './state.js';
import { getFrame } from './skyframe.js';
import { getBodies, BODIES, MOON_PARENT } from './ephem.js';
import { stars, starRecord, constellations, dso, loadAllTiers, loadDeepDso, DSO_TYPES, F } from './catalog.js';
import { refHorApparent } from './objects.js';
import { select, centerOn } from './nav.js';
import { fmtMag } from './astro.js';

const GREEK = { 'α': 'alpha', 'β': 'beta', 'γ': 'gamma', 'δ': 'delta', 'ε': 'epsilon', 'ζ': 'zeta', 'η': 'eta', 'θ': 'theta', 'ι': 'iota', 'κ': 'kappa',
  'λ': 'lambda', 'μ': 'mu', 'ν': 'nu', 'ξ': 'xi', 'ο': 'omicron', 'π': 'pi', 'ρ': 'rho', 'σ': 'sigma', 'τ': 'tau', 'υ': 'upsilon', 'φ': 'phi', 'χ': 'chi', 'ψ': 'psi', 'ω': 'omega' };
const SUP = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' };
/** Lower-case, no accents, Greek letters spelled out, punctuation collapsed. */
export function norm(s) {
  return String(s).replace(/[α-ω]/g, (c) => (GREEK[c] || c) + ' ').replace(/[⁰¹²³⁴-⁹]/g, (c) => SUP[c] || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

let index = null;        // [{key, label, sub, mag, ref, w}]
function build() {
  index = [];
  const add = (key, label, sub, mag, ref, w) => index.push({ key: norm(key), label, sub, mag, ref, w });
  for (const b of BODIES) add(b.name, b.name, b.kind === 'planet' ? 'Planet' : b.kind === 'sun' ? 'Star' : "Earth's moon", null, { kind: 'body', id: b.id }, 100);
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
  const m = /^(hip|hd)\s*(\d+)$/.exec(n);
  if (m) {
    const field = m[1] === 'hip' ? F.hip : F.hd, want = +m[2];
    for (const t of stars.tiers) {
      if (!t.loaded) continue;
      for (let i = 0; i < t.n; i++) if (t.data[i * stars.NF + field] === want) {
        const s = starRecord(t.k, i);
        out.push({ label: (m[1] === 'hip' ? 'HIP ' : 'HD ') + want + (s.name ? ' · ' + s.name : ''), sub: 'Star', mag: s.mag, ref: { kind: 'star', k: t.k, i }, score: 1000 });
      }
    }
    if (!out.length && stars.tiers.some((t) => !t.loaded)) { loadAllTiers().then(() => rerun && rerun()); return [{ label: 'Loading the full star catalogue…', sub: '', pending: true }]; }
  }
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
  let items = [], active = -1;
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
      const sol = BODIES.map((b) => ({ label: b.name, sub: b.kind === 'planet' ? 'Planet' : '', mag: getBodies(getFrame()).byId[b.id].mag, ref: { kind: 'body', id: b.id } }));
      const br = brightestStars(30);
      items = sol.concat(br);
      html = '<div class="grp">Solar system</div>' + sol.map(optHtml).join('') +
        '<div class="grp">Brightest stars · ▲ = up now</div>' + br.map((e, i) => optHtml(e, i + sol.length)).join('');
    } else {
      items = search(q);
      html = items.length ? items.map(optHtml).join('') : '<div class="empty">Nothing found. Try a star name, “M 31”, “NGC 7000”, “HIP 91262” or a constellation.</div>';
    }
    list.innerHTML = html; list.hidden = false; input.setAttribute('aria-expanded', 'true');
    active = q && items.length && !items[0].pending ? 0 : -1;
    mark();
  }
  function mark() {
    list.querySelectorAll('.opt').forEach((el) => { const on = +el.dataset.i === active; el.classList.toggle('active', on); el.setAttribute('aria-selected', on); if (on) el.scrollIntoView({ block: 'nearest' }); });
    if (active >= 0) input.setAttribute('aria-activedescendant', 'sopt' + active); else input.removeAttribute('aria-activedescendant');
  }
  function hide() { list.hidden = true; input.setAttribute('aria-expanded', 'false'); rerun = null; }
  function choose(i) {
    const e = items[i];
    if (!e || e.pending) return;
    select(e.ref); centerOn(e.ref);
    input.value = ''; hide(); input.blur();
    document.getElementById('sky').focus({ preventScroll: true });
  }
  input.addEventListener('focus', () => { rerun = show; show(); });
  input.addEventListener('input', () => { rerun = show; show(); });
  input.addEventListener('keydown', (e) => {
    const n = items.filter((x) => !x.pending).length;
    if (e.key === 'ArrowDown') { e.preventDefault(); if (list.hidden) show(); else { active = Math.min(n - 1, active + 1); mark(); } }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = Math.max(0, active - 1); mark(); }
    else if (e.key === 'Enter') { e.preventDefault(); if (active >= 0) choose(active); else if (n) choose(0); }
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
