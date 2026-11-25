// dsolist.js: the deep-sky browser. Messier / Caldwell / NGC-IC lists filtered by type, magnitude,
// constellation and "above the horizon now"; click a row to go to the object.
// Every value is OpenNGC's; a missing one is shown as a dash and sorts last.

import { state, on } from './state.js';
import { RAD, fmtMag } from './astro.js';
import { getFrame } from './skyframe.js';
import { dso, dsoDoubt, loadDeepDso, constellations, DSO_TYPES } from './catalog.js';
import { select, flyTo, niceFov, toggleTracking } from './nav.js';
import { makePanel, esc, toast, isNarrow } from './xui.js';

const CLASSES = [['all', 'All types'], ['gal', 'Galaxies'], ['oc', 'Open clusters'], ['gc', 'Globular clusters'], ['pn', 'Planetary nebulae'], ['neb', 'Nebulae'], ['other', 'Other']];
const GAL = new Set(['G', 'GPair', 'GTrpl', 'GGroup']), NEB = new Set(['Neb', 'HII', 'RfN', 'SNR', 'EmN', 'Cl+N', 'DrkN']);
const classOf = (t) => (GAL.has(t) ? 'gal' : t === 'OCl' || t === '*Ass' ? 'oc' : t === 'GCl' ? 'gc' : t === 'PN' ? 'pn' : NEB.has(t) ? 'neb' : 'other');
const SHORT = { gal: 'Galaxy', oc: 'Open cl.', gc: 'Globular', pn: 'Planetary', neb: 'Nebula', other: 'Other' };
const PAGE = 150;

const f = { cat: 'm', cls: 'all', mag: '', con: '', up: false, sort: 'num', q: '' };
let panel, shown = PAGE, deepError = false, flash = -1;

/** Apparent altitude (degrees, no refraction) of a catalogue row right now. */
export function dsoAltitude(o, frame = getFrame()) { return Math.asin(Math.max(-1, Math.min(1, frame.starHor(o.vec)[2]))) * RAD; }

/** Select a row, glide to it, say so if it is below the horizon. */
export function goToDso(o) {
  const ref = { kind: 'dso', idx: o.idx };
  select(ref);
  toggleTracking(true);            // hold it in the centre, as every other "go to" does (nav.js centerOn)
  flyTo(ref, { fov: niceFov(ref) });
  const alt = dsoAltitude(o);
  if (alt < 0 && state.show.ground) toast(`${o.label} is below the horizon now (altitude ${alt.toFixed(0).replace('-', '−')}°). Turn the ground off (G) or change the time to see it.`, { ms: 5200, kind: 'warn' });
}

function rows() {
  const frame = getFrame(), q = f.q.trim().toLowerCase().replace(/\s+/g, '');
  const magLim = f.mag === '' ? Infinity : +f.mag;
  const out = [];
  for (const o of dso.rows) {
    if (f.cat === 'm' && !o.m) continue;
    if (f.cat === 'c' && !o.c) continue;
    if (f.cat === 'n' && !/^(NGC|IC)/.test(o.id)) continue;
    if (f.cls !== 'all' && classOf(o.type) !== f.cls) continue;
    if (f.con && o.con !== f.con) continue;
    if (magLim < Infinity && !(o.mag != null && o.mag <= magLim)) continue;
    if (q) {
      const hay = ((o.m ? 'm' + o.m + ' messier' + o.m : '') + (o.c ? ' c' + o.c + ' caldwell' + o.c : '') + ' ' + o.id + ' ' + (o.names || []).join(' ')).toLowerCase().replace(/\s+/g, '');
      if (!hay.includes(q)) continue;
    }
    const alt = dsoAltitude(o, frame);
    if (f.up && alt <= 0) continue;
    out.push({ o, alt });
  }
  const num = (o) => (f.cat === 'm' ? o.m : f.cat === 'c' ? o.c : (/^IC/.test(o.id) ? 1e5 : 0) + (parseInt(o.id.replace(/^\D+/, ''), 10) || 9e5));
  if (f.sort === 'mag') out.sort((a, b) => (a.o.mag ?? 99) - (b.o.mag ?? 99));
  else if (f.sort === 'alt') out.sort((a, b) => b.alt - a.alt);
  else if (f.sort === 'size') out.sort((a, b) => (b.o.maj ?? -1) - (a.o.maj ?? -1));
  else out.sort((a, b) => num(a.o) - num(b.o));
  return out;
}

function title(o) {
  if (f.cat === 'c' && o.c) return 'C ' + o.c;
  return o.m ? 'M ' + o.m : o.id;
}
function subtitle(o) {
  const bits = [];
  if (o.names && o.names.length) bits.push(o.names[0]);
  const t = title(o);
  if (o.m && t !== 'M ' + o.m) bits.push('M ' + o.m);
  if (o.id !== t && /^(NGC|IC)/.test(o.id)) bits.push(o.id);
  if (o.c && f.cat !== 'c') bits.push('C ' + o.c);
  return bits.join(' · ');
}

function renderList() {
  const box = panel.body.querySelector('.dl-rows'), count = panel.body.querySelector('.dl-count');
  const needDeep = f.cat === 'n' || f.cat === 'all';
  if (needDeep && !dso.deepLoaded) {
    if (deepError) { box.innerHTML = '<div class="xp-empty err">The full NGC/IC list did not load. <button class="btn" data-act="retry">Try again</button></div>'; count.textContent = ''; return; }
    box.innerHTML = '<div class="xp-empty">Loading the full NGC/IC list…</div>'; count.textContent = '';
    const p = loadDeepDso();
    p.then(() => { deepError = !dso.deepLoaded; if (panel.isOpen()) renderList(); });
    return;
  }
  const list = rows();
  const total = dso.rows.filter((o) => (f.cat === 'm' ? o.m : f.cat === 'c' ? o.c : f.cat === 'n' ? /^(NGC|IC)/.test(o.id) : true)).length;
  count.textContent = `${list.length.toLocaleString('en-US')} of ${total.toLocaleString('en-US')} objects`;
  if (!list.length) {
    box.innerHTML = `<div class="xp-empty">Nothing matches these filters.${f.up ? ' Try turning off “Above the horizon now”.' : ''} <button class="btn" data-act="reset">Reset filters</button></div>`;
    return;
  }
  const sel = state.selected && state.selected.kind === 'dso' ? state.selected.idx : -1;
  let html = '';
  for (const { o, alt } of list.slice(0, shown)) {
    const cls = classOf(o.type), up = alt > 0;
    html += `<button type="button" class="dl-row${o.idx === sel ? ' sel' : ''}${o.idx === flash ? ' flash' : ''}" data-idx="${o.idx}" title="${esc(DSO_TYPES[o.type] || o.type)} in ${esc(o.con || '?')}">` +
      `<span class="up${up ? '' : ' down'}" aria-label="${up ? 'above the horizon' : 'below the horizon'}">${up ? '▲' : '▽'}</span>` +
      `<span class="nm"><b>${esc(title(o))}</b><i>${esc(subtitle(o))}</i></span>` +
      `<span class="ty t-${cls}">${SHORT[cls]}</span>` +
      `<span class="mg">${o.mag != null ? fmtMag(o.mag, 1) + (dsoDoubt(o) ? `<sup title="${esc('Doubtful: ' + dsoDoubt(o))}">?</sup>` : '') : '–'}</span>` +
      `<span class="al">${alt.toFixed(0).replace('-', '−')}°</span></button>`;
  }
  if (list.length > shown) html += `<button type="button" class="btn dl-more" data-act="more">Show ${Math.min(PAGE, list.length - shown)} more (${(list.length - shown).toLocaleString('en-US')} left)</button>`;
  box.innerHTML = html;
  if (flash >= 0) { const r = box.querySelector('.dl-row.flash'); if (r) r.scrollIntoView({ block: 'center' }); flash = -1; }
}

function build() {
  const cons = constellations.slice().sort((a, b) => a.name.localeCompare(b.name));
  panel.body.innerHTML = `
    <div class="dl-filters">
      <div class="seg dl-cat" role="radiogroup" aria-label="Catalogue">
        <button type="button" role="radio" data-cat="m">Messier</button><button type="button" role="radio" data-cat="c">Caldwell</button><button type="button" role="radio" data-cat="n">NGC / IC</button><button type="button" role="radio" data-cat="all">All</button>
      </div>
      <div class="dl-grid">
        <label>Type<select class="field" data-f="cls">${CLASSES.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
        <label>Constellation<select class="field" data-f="con"><option value="">Any</option>${cons.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select></label>
        <label>Brighter than<select class="field" data-f="mag"><option value="">Any magnitude</option>${[5, 6, 7, 8, 9, 10, 11, 12].map((m) => `<option value="${m}">mag ${m}</option>`).join('')}</select></label>
        <label>Sort by<select class="field" data-f="sort"><option value="num">Catalogue number</option><option value="mag">Brightness</option><option value="alt">Altitude now</option><option value="size">Angular size</option></select></label>
      </div>
      <div class="dl-line">
        <label class="check"><input type="checkbox" data-f="up"> Above the horizon now</label>
        <input class="field dl-q" type="search" placeholder="Filter by name or number" aria-label="Filter by name or number" data-f="q" autocomplete="off" spellcheck="false">
      </div>
    </div>
    <div class="dl-headrow"><span class="dl-count" aria-live="polite"></span><span class="dl-cols"><span>mag</span><span>alt</span></span></div>
    <div class="dl-rows" role="list"></div>
    <div class="xp-foot">Data: OpenNGC (CC BY-SA 4.0). A dash means the catalogue lists no magnitude, ? that its value is doubtful. ▲ = above the horizon now.</div>`;
  const sync = () => {
    panel.body.querySelectorAll('.dl-cat button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cat === f.cat)));
    panel.body.querySelectorAll('[data-f]').forEach((c) => { if (c.type === 'checkbox') c.checked = f[c.dataset.f]; else c.value = f[c.dataset.f]; });
  };
  panel.body.querySelectorAll('.dl-cat button').forEach((b) => b.addEventListener('click', () => {
    f.cat = b.dataset.cat; if (f.sort === 'num' && f.cat === 'all') f.sort = 'mag';
    shown = PAGE; sync(); renderList(); panel.body.querySelector('.dl-rows').scrollTop = 0;
  }));
  panel.body.querySelectorAll('[data-f]').forEach((c) => c.addEventListener(c.type === 'search' ? 'input' : 'change', () => {
    f[c.dataset.f] = c.type === 'checkbox' ? c.checked : c.value; shown = PAGE; renderList();
  }));
  panel.body.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]');
    if (act) {
      if (act.dataset.act === 'more') { shown += PAGE; renderList(); }
      else if (act.dataset.act === 'retry') { deepError = false; renderList(); }
      else if (act.dataset.act === 'reset') { Object.assign(f, { cls: 'all', mag: '', con: '', up: false, q: '' }); sync(); renderList(); }
      return;
    }
    const row = e.target.closest('.dl-row'); if (!row) return;
    const o = dso.rows[+row.dataset.idx];
    goToDso(o);
    if (isNarrow()) panel.peek(true);
  });
  sync();
}

export function initDsoList() {
  let built = false, timer = 0;
  panel = makePanel({
    id: 'dsoPanel', title: 'Deep-sky objects',
    onOpen() { if (!built) { build(); built = true; } renderList(); timer = setInterval(() => { if (!document.hidden && !panel.peeked()) softRefresh(); }, 30000); },
    onClose() { clearInterval(timer); },
  });
  // keep the scroll position when only the altitudes change
  const softRefresh = () => { const box = panel.body.querySelector('.dl-rows'); if (!box) return; const y = box.scrollTop; renderList(); box.scrollTop = y; };
  let pend = 0;
  const later = () => { if (!panel.isOpen() || pend) return; pend = setTimeout(() => { pend = 0; if (panel.isOpen()) softRefresh(); }, 400); };
  on('time', later); on('loc', later); on('selection', later);
  return {
    panel,
    /** Open the list with this object visible and highlighted (from the right-click menu). */
    reveal(idx) {
      const o = dso.rows[idx]; if (!o) return;
      f.cat = o.m ? 'm' : o.c ? 'c' : /^(NGC|IC)/.test(o.id) ? 'n' : 'all';
      // in the long NGC/IC list, narrow to the object itself (the list may still be loading)
      Object.assign(f, { cls: 'all', mag: '', con: '', up: false, q: f.cat === 'n' || f.cat === 'all' ? o.id : '', sort: f.cat === 'all' ? 'mag' : 'num' });
      const wasOpen = panel.isOpen();
      panel.open();
      panel.body.querySelectorAll('.dl-cat button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.cat === f.cat)));
      panel.body.querySelectorAll('[data-f]').forEach((c) => { if (c.type === 'checkbox') c.checked = f[c.dataset.f]; else c.value = f[c.dataset.f]; });
      const pos = rows().findIndex((r) => r.o.idx === idx);
      shown = Math.max(PAGE, Math.ceil((pos + 1) / PAGE) * PAGE);
      flash = idx; select({ kind: 'dso', idx });
      renderList();
    },
  };
}
