// hubble.js: the Hubble's-law lab.
// 1. Browse the catalogue's galaxies (magnitude, angular size, redshift z, cz) and tick some.
// 2. They go into the student's table, which has an empty distance column to fill in.
// 3. A velocity-distance plot with a best-fit line through the origin gives the slope, H0.
//
// DATA HONESTY: magnitude, size and z are OpenNGC's values, untouched. The catalogue has NO distances and
// this module never supplies one: a distance is typed by the student, or computed from the catalogue's
// angular size and a true diameter THE STUDENT types (and is then labelled as such). cz is c times the
// catalogue's z, nothing more.

import { state, on, emit } from './state.js';
import { fmtMag } from './astro.js';
import { cam } from './camera.js';
import { dso, loadDeepDso } from './catalog.js';
import { projEqj } from './render/proj.js';
import { clipToSky } from './render/groundshade.js';
import { makePanel, esc, toast, download, isNarrow, loadJSON, saveJSON } from './xui.js';
import { goToDso } from './dsolist.js';

export const C_KM_S = 299792.458;
// Counted in OpenNGC's NGC.csv + addendum.csv (downloaded 2026-11-23): objects of type G, GPair, GTrpl, GGroup.
const ONGC = { galaxies: 10792, withZ: 10249 };
const GAL = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
const STORE = 'astro-labs.planetarium.hubble.v1';
const PAGE = 120;
const MORPH = [['all', 'Any shape'], ['S', 'Spiral (S, SA, SAB)'], ['SB', 'Barred spiral (SB)'], ['E', 'Elliptical (E)'], ['S0', 'Lenticular (S0)'], ['I', 'Irregular (I)']];

const f = { mag: '12', minCz: '1500', morph: 'all', q: '', sort: 'mag', dir: 1 };
let panel, tab = 'pick', shown = PAGE, loadErr = false, byId = null;
let table = [];                 // [{id, d: '12.3' (string as typed), src: '' | 'typed' | 'size', D: kpc used}]
let hover = -1, plotPts = [];

const cz = (o) => o.z * C_KM_S;
const magOf = (o) => (o.vmag != null ? { v: o.vmag, band: 'V' } : o.bmag != null ? { v: o.bmag, band: 'B' } : null);
const nameOf = (o) => (o.m ? 'M ' + o.m : o.id);
const morphClass = (h) => { if (!h) return ''; if (/^S0|^E-S0|^S0-a/.test(h)) return 'S0'; if (/^SB/.test(h)) return 'SB'; if (/^E/.test(h)) return 'E'; if (/^I/.test(h)) return 'I'; if (/^S/.test(h)) return 'S'; return ''; };
const fnum = (v, dp) => (v == null || !isFinite(v) ? '–' : v.toFixed(dp).replace('-', '−'));
const int = (v) => Math.round(v).toLocaleString('en-US').replace('-', '−');

function index() {
  byId = new Map();
  for (const o of dso.rows) if (GAL.has(o.type)) byId.set(o.id, o);
}
const galaxies = () => dso.rows.filter((o) => GAL.has(o.type));
const save = () => saveJSON(STORE, table.map((r) => ({ id: r.id, d: r.d, src: r.src, D: r.D })));
const dist = (r) => { const v = parseFloat(String(r.d).replace(',', '.')); return isFinite(v) && v > 0 ? v : null; };

// ---- the fit: v = H0 d, a line through the origin, least squares in v ----------------------------
export function fitThroughOrigin(pts) {
  const n = pts.length;
  if (n < 3) return null;
  let sxy = 0, sxx = 0;
  for (const p of pts) { sxy += p.d * p.v; sxx += p.d * p.d; }
  if (!(sxx > 0)) return null;
  const H = sxy / sxx;
  let ss = 0;
  for (const p of pts) ss += (p.v - H * p.d) ** 2;
  return { H, se: Math.sqrt(ss / (n - 1) / sxx), n };
}
function points() {
  const out = [];
  for (const r of table) { const o = byId && byId.get(r.id), d = dist(r); if (o && d != null) out.push({ d, v: cz(o), name: nameOf(o), id: r.id }); }
  return out;
}

// ---- step 1: pick galaxies -------------------------------------------------------------------
function candidates() {
  const magLim = f.mag === '' ? Infinity : +f.mag, minCz = f.minCz === '' ? -Infinity : +f.minCz;
  const q = f.q.trim().toLowerCase().replace(/\s+/g, '');
  const out = [];
  for (const o of galaxies()) {
    if (o.z == null) continue;
    const m = magOf(o);
    if (magLim < Infinity && !(m && m.v <= magLim)) continue;
    if (cz(o) < minCz) continue;
    if (f.morph !== 'all' && morphClass(o.hubble) !== f.morph) continue;
    if (q && !((o.m ? 'm' + o.m : '') + o.id + (o.names || []).join('')).toLowerCase().replace(/\s+/g, '').includes(q)) continue;
    out.push(o);
  }
  const key = { mag: (o) => (magOf(o) ? magOf(o).v : 99), size: (o) => -(o.maj ?? -1), z: (o) => o.z, name: (o) => (o.m ? o.m : 1000 + (/^IC/.test(o.id) ? 1e5 : 0) + (parseInt(o.id.replace(/^\D+/, ''), 10) || 9e5)) }[f.sort];
  out.sort((a, b) => (key(a) - key(b)) * f.dir);
  return out;
}
function pickHtml() {
  if (!dso.deepLoaded) {
    return loadErr ? '<div class="xp-empty err">The galaxy list did not load. <button class="btn" data-act="retry">Try again</button></div>'
      : '<div class="xp-empty">Loading the galaxy list…</div>';
  }
  const list = candidates(), inTable = new Set(table.map((r) => r.id));
  const th = (k, label, cls = '') => `<th class="${cls}${f.sort === k ? ' sorted' : ''}" aria-sort="${f.sort === k ? (f.dir > 0 ? 'ascending' : 'descending') : 'none'}"><button type="button" data-sort="${k}">${label}${f.sort === k ? (f.dir > 0 ? ' ▲' : ' ▼') : ''}</button></th>`;
  let body = '';
  for (const o of list.slice(0, shown)) {
    const m = magOf(o), on = inTable.has(o.id);
    body += `<tr data-id="${esc(o.id)}"${on ? ' class="on"' : ''}><td class="ck"><input type="checkbox" aria-label="Add ${esc(nameOf(o))} to my table"${on ? ' checked' : ''}></td>` +
      `<td class="nm"><button type="button" class="hb-go" title="Show ${esc(nameOf(o))} on the sky">${esc(nameOf(o))}</button>${o.names && o.names.length ? `<i>${esc(o.names[0])}</i>` : ''}</td>` +
      `<td class="ty">${esc(o.hubble || '–')}</td>` +
      `<td class="n">${m ? fmtMag(m.v, 1) + (m.band === 'B' ? '<sup>B</sup>' : '') : '–'}</td>` +
      `<td class="n">${o.maj != null ? fnum(o.maj, o.maj < 10 ? 2 : 1) : '–'}</td>` +
      `<td class="n">${o.z.toFixed(5).replace('-', '−')}</td><td class="n">${int(cz(o))}</td></tr>`;
  }
  const more = list.length > shown ? `<button type="button" class="btn dl-more" data-act="more">Show ${Math.min(PAGE, list.length - shown)} more (${(list.length - shown).toLocaleString('en-US')} left)</button>` : '';
  return `
    <div class="hb-filters">
      <label>Brighter than<select class="field" data-f="mag"><option value="">Any</option>${[9, 10, 11, 12, 13, 14].map((m) => `<option value="${m}">mag ${m}</option>`).join('')}</select></label>
      <label>cz at least<select class="field" data-f="minCz"><option value="">Any (incl. blueshifts)</option><option value="0">0 km/s</option><option value="500">500 km/s</option><option value="1500">1,500 km/s</option><option value="3000">3,000 km/s</option><option value="6000">6,000 km/s</option></select></label>
      <label>Shape<select class="field" data-f="morph">${MORPH.map(([v, t]) => `<option value="${v}">${t}</option>`).join('')}</select></label>
      <label>Name<input class="field" type="search" data-f="q" placeholder="e.g. M 87, NGC 4889" autocomplete="off" spellcheck="false"></label>
    </div>
    <div class="hb-count"><span>${list.length.toLocaleString('en-US')} galaxies match</span><span>Tick a box to add a galaxy to your table. Click a name to see it.</span></div>
    ${list.length ? `<div class="hb-scroll"><table class="hb-table"><thead><tr><th class="ck"></th>${th('name', 'Galaxy', 'nm')}<th class="ty">Type</th>${th('mag', 'Mag', 'n')}${th('size', 'Size ′', 'n')}${th('z', 'z', 'n')}<th class="n">cz km/s</th></tr></thead><tbody>${body}</tbody></table>${more}</div>`
    : '<div class="xp-empty">No galaxy matches these filters. <button class="btn" data-act="reset">Reset filters</button></div>'}
    <div class="xp-foot">Magnitude is V where OpenNGC has it, otherwise B (marked <sup>B</sup>). Size is the catalogue's major axis in arcminutes. cz = c × z.</div>`;
}

// ---- step 2: my table and the plot -----------------------------------------------------------
function dataHtml() {
  if (!table.length) {
    return `<div class="xp-empty big">Your table is empty.<br>Go to <b>1 · Choose galaxies</b> and tick six or more, spread over a wide range of redshift.<br><button class="btn" data-tab="pick">Choose galaxies</button></div>`;
  }
  let body = '';
  for (const r of table) {
    const o = byId && byId.get(r.id);
    if (!o) { body += `<tr data-id="${esc(r.id)}"><td class="nm">${esc(r.id)}</td><td colspan="5" class="nd">loading…</td><td></td></tr>`; continue; }
    const m = magOf(o);
    body += `<tr data-id="${esc(r.id)}"><td class="nm"><button type="button" class="hb-go" title="Show ${esc(nameOf(o))} on the sky">${esc(nameOf(o))}</button></td>` +
      `<td class="n">${m ? fmtMag(m.v, 1) + (m.band === 'B' ? '<sup>B</sup>' : '') : '–'}</td><td class="n">${o.maj != null ? fnum(o.maj, o.maj < 10 ? 2 : 1) : '–'}</td>` +
      `<td class="n">${o.z.toFixed(5).replace('-', '−')}</td><td class="n">${int(cz(o))}</td>` +
      `<td class="d"><input type="text" inputmode="decimal" class="field hb-d${r.d !== '' && dist(r) == null ? ' bad' : ''}" value="${esc(r.d)}" placeholder="?" aria-label="Distance to ${esc(nameOf(o))} in megaparsecs">${r.src === 'size' ? `<span class="src" title="Filled in from the angular size with an assumed diameter of ${esc(r.D)} kpc">θ</span>` : ''}</td>` +
      `<td class="x"><button type="button" class="hb-x" aria-label="Remove ${esc(nameOf(o))}" title="Remove from the table">&times;</button></td></tr>`;
  }
  const lastD = (table.find((r) => r.src === 'size') || {}).D || '';
  return `
    <div class="hb-scroll short"><table class="hb-table mine"><thead><tr><th class="nm">Galaxy</th><th class="n">Mag</th><th class="n">Size ′</th><th class="n">z</th><th class="n">v = cz km/s</th><th class="d">Distance Mpc</th><th class="x"></th></tr></thead><tbody>${body}</tbody></table></div>
    <div class="hb-acts">
      <button type="button" class="btn" data-act="copy">Copy table</button><button type="button" class="btn" data-act="csv">Download CSV</button>
      <button type="button" class="btn" data-tab="pick">Add galaxies</button><button type="button" class="btn quiet" data-act="clear">Clear table</button>
    </div>
    <details class="hb-size"${lastD ? ' open' : ''}><summary>Estimate distances from angular size</summary>
      <p>If every galaxy had the same true diameter <i>D</i>, a galaxy that looks θ across would be at <b>d = D / θ</b> (θ in radians). Type the diameter <i>you</i> assume; the app has no way to know it. Only rows with an empty distance are filled, and they are marked <span class="src">θ</span>.</p>
      <div class="hb-sizeRow"><label>Assumed true diameter <span class="unit"><input type="text" inputmode="decimal" class="field" id="hbD" value="${esc(lastD)}" placeholder="?" aria-label="Assumed true diameter in kiloparsecs"> kpc</span></label>
      <button type="button" class="btn" data-act="fill">Fill empty rows</button><button type="button" class="btn quiet" data-act="unfill">Remove θ estimates</button></div>
    </details>
    <div class="hb-plotwrap"><canvas class="hb-plot" role="img" aria-label="Velocity against distance for the galaxies in the table"></canvas><div class="hb-tip" hidden></div></div>
    <div class="hb-result" aria-live="polite"></div>`;
}
function resultHtml() {
  const pts = points(), fit = fitThroughOrigin(pts);
  if (!fit) {
    const need = 3 - pts.length;
    return `<span class="wait">Enter ${need === 3 ? 'at least three distances' : need + ' more distance' + (need > 1 ? 's' : '')} to fit a line. ${pts.length} of ${table.length} rows have one.</span>`;
  }
  const gyr = 977.8 / fit.H;       // 1 / (km/s/Mpc) in billions of years
  return `<span class="h0">H<sub>0</sub> = <b>${fit.H.toFixed(fit.H < 10 ? 2 : 1)}</b> ± ${fit.se.toFixed(fit.se < 10 ? 2 : 1)} km/s per Mpc</span>` +
    `<span class="sub">slope of the best-fit line through the origin, ${fit.n} galaxies; the ± is the scatter of your points about the line.` +
    (fit.H > 0 ? ` 1 / H<sub>0</sub> = ${gyr.toFixed(gyr < 10 ? 2 : 1)} billion years.` : '') + `</span>`;
}

function niceStep(span, n) {
  const raw = span / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p;
  return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p;
}
function drawPlot() {
  const cv = panel.body.querySelector('.hb-plot'); if (!cv) return;
  const w = cv.clientWidth, h = cv.clientHeight, dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (!w || !h) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
  const pts = points(), fit = fitThroughOrigin(pts);
  const L = 58, Rm = 14, T = 12, B = 38, pw = w - L - Rm, ph = h - T - B;
  const allV = table.map((r) => (byId && byId.get(r.id) ? cz(byId.get(r.id)) : 0));
  const vMax = Math.max(1000, ...allV) * 1.08, vMin = Math.min(0, ...allV) * 1.08;
  const dMax = pts.length ? Math.max(...pts.map((p) => p.d)) * 1.12 : 100;
  const X = (d) => L + d / dMax * pw, Y = (v) => T + ph - (v - vMin) / (vMax - vMin) * ph;
  const mono = "400 10.5px 'JetBrains Mono', ui-monospace, monospace", sans = "500 11.5px 'Source Sans 3', system-ui, sans-serif";
  // grid and ticks (recessive)
  g.lineWidth = 1; g.font = mono; g.fillStyle = '#94a3b5';
  const vs = niceStep(vMax - vMin, 5), ds = niceStep(dMax, 5);
  g.textAlign = 'right'; g.textBaseline = 'middle';
  for (let v = Math.ceil(vMin / vs) * vs; v <= vMax; v += vs) {
    g.strokeStyle = Math.abs(v) < 1e-9 ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(L, Math.round(Y(v)) + 0.5); g.lineTo(L + pw, Math.round(Y(v)) + 0.5); g.stroke();
    g.fillText(int(v), L - 7, Y(v));
  }
  g.textAlign = 'center'; g.textBaseline = 'top';
  for (let d = 0; d <= dMax; d += ds) {
    g.strokeStyle = d === 0 ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.08)';
    g.beginPath(); g.moveTo(Math.round(X(d)) + 0.5, T); g.lineTo(Math.round(X(d)) + 0.5, T + ph); g.stroke();
    if (pts.length) g.fillText(String(+d.toPrecision(6)), X(d), T + ph + 6);
  }
  g.font = sans; g.fillStyle = '#b9c6d6';
  g.fillText(pts.length ? 'distance (Mpc)' : 'distance (Mpc): enter distances in the table', L + pw / 2, T + ph + 21);
  g.save(); g.translate(13, T + ph / 2); g.rotate(-Math.PI / 2); g.textBaseline = 'middle'; g.fillText('velocity cz (km/s)', 0, 0); g.restore();
  // fit line
  if (fit) {
    g.save(); g.beginPath(); g.rect(L, T, pw, ph); g.clip();
    g.strokeStyle = '#e8b86a'; g.lineWidth = 2; g.beginPath(); g.moveTo(X(0), Y(0)); g.lineTo(X(dMax), Y(fit.H * dMax)); g.stroke();
    g.restore();
  }
  // points: 9 px discs with a ring in the panel colour so overlapping ones stay separate
  plotPts = pts.map((p) => ({ ...p, x: X(p.d), y: Y(p.v) }));
  plotPts.forEach((p, i) => {
    g.beginPath(); g.arc(p.x, p.y, i === hover ? 6.5 : 4.5, 0, 2 * Math.PI);
    g.fillStyle = '#6fb0ff'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#101927'; g.stroke();
  });
}
function refreshResult() {
  const r = panel.body.querySelector('.hb-result'); if (r) r.innerHTML = resultHtml();
  drawPlot();
}

// ---- step 3: where distances come from ---------------------------------------------------------
function aboutHtml() {
  const gal = galaxies(), withZ = gal.filter((o) => o.z != null);
  const far = withZ.filter((o) => cz(o) > 1500).length, blue = withZ.filter((o) => o.z < 0).length;
  const loaded = dso.deepLoaded;
  return `<div class="hb-about">
    <h3>What the catalogue gives you</h3>
    <p>For each galaxy, <a href="https://github.com/mattiaverga/OpenNGC" target="_blank" rel="noopener">OpenNGC</a> lists an apparent magnitude, an angular size (major and minor axis, arcminutes) and a redshift <i>z</i>. The velocity column here is <b>cz</b>, the speed of light (299,792.458 km/s) times that <i>z</i>.</p>
    <p><b>Redshift coverage.</b> OpenNGC has ${ONGC.galaxies.toLocaleString('en-US')} galaxies, and ${ONGC.withZ.toLocaleString('en-US')} of them (${(100 * ONGC.withZ / ONGC.galaxies).toFixed(0)}%) have a redshift. This app carries the brighter ones (to about magnitude 14): ${loaded ? `<b>${withZ.length.toLocaleString('en-US')}</b> galaxies with a redshift out of ${gal.length.toLocaleString('en-US')} loaded; ${far.toLocaleString('en-US')} of those have cz above 1,500 km/s and ${blue} are blueshifted (negative z).` : 'the list is still loading.'} The largest redshift in the list is about z = 0.06.</p>
    <h3>What it does not give you: distance</h3>
    <p><b>OpenNGC contains no distances, and this app does not make any up.</b> The distance column in your table starts empty. Ways to fill it:</p>
    <ul>
      <li><b>Angular size.</b> Assume all your galaxies have the same true diameter <i>D</i> (the Milky Way's disc is roughly 30 kpc across); then d = D / θ. It is crude, because real galaxies differ in size by a factor of ten or more, so expect scatter, and choose galaxies of one type (large spirals, say). The table has a helper that does the arithmetic with the <i>D</i> you type.</li>
      <li><b>Apparent brightness.</b> Assume one absolute magnitude <i>M</i> for all of them; then d = 10<sup>(m − M + 5)/5</sup> parsecs. Equally crude, for the same reason.</li>
      <li><b>Measured distances</b> from your instructor or the literature (Cepheids, Type Ia supernovae, Tully–Fisher, surface-brightness fluctuations). These are the honest way to get H<sub>0</sub>; type them in.</li>
    </ul>
    <p>Do <i>not</i> get distances from the redshift (many websites quote “distances” that are just cz / H<sub>0</sub>): you would be assuming the answer.</p>
    <h3>Choosing galaxies</h3>
    <ul>
      <li><b>Avoid nearby galaxies.</b> Galaxies also move through space at a few hundred km/s (up to about 1,000 km/s inside a cluster such as Virgo). For the Local Group and the Virgo cluster that is as large as the expansion itself; M 31 is even approaching us. The list therefore starts at cz ≥ 1,500 km/s; higher is better.</li>
      <li>Spread your choices over a wide range of redshift, and take at least six.</li>
      <li>The line is forced through the origin (zero distance, zero velocity): v = H<sub>0</sub> d.</li>
    </ul>
    <p class="fine">Fine print: OpenNGC's own radial-velocity column is slightly smaller than cz at the high end (it uses the relativistic Doppler formula; 3% smaller at z = 0.06). cz is the usual choice for a Hubble diagram. Redshifts are heliocentric.</p>
  </div>`;
}

// ---- wiring ----------------------------------------------------------------------------------------
function render() {
  if (!panel || !panel.isOpen()) return;
  if (dso.deepLoaded && !byId) index();
  const n = table.length;
  panel.sub.textContent = '';
  panel.body.innerHTML = `<div class="hb-tabs" role="tablist">
      <button type="button" role="tab" data-tab="pick" aria-selected="${tab === 'pick'}">1 · Choose galaxies</button>
      <button type="button" role="tab" data-tab="data" aria-selected="${tab === 'data'}">2 · My table &amp; plot${n ? ` <span class="badge">${n}</span>` : ''}</button>
      <button type="button" role="tab" data-tab="about" aria-selected="${tab === 'about'}">Distances?</button>
    </div><div class="hb-pane" role="tabpanel">${tab === 'pick' ? pickHtml() : tab === 'data' ? dataHtml() : aboutHtml()}</div>`;
  panel.body.querySelectorAll('[data-f]').forEach((c) => { c.value = f[c.dataset.f]; });
  if (tab === 'data') refreshResult();
}
function setTab(t) { tab = t; shown = PAGE; hover = -1; render(); }

function tsv(sep) {
  const q = (s) => (sep === ',' && /[",\n]/.test(String(s)) ? '"' + String(s).replace(/"/g, '""') + '"' : String(s));
  const rows = [['galaxy', 'common_name', 'type', 'magnitude', 'mag_band', 'major_axis_arcmin', 'minor_axis_arcmin', 'z', 'cz_km_s', 'distance_Mpc', 'distance_source']];
  for (const r of table) {
    const o = byId.get(r.id); if (!o) continue;
    const m = magOf(o), d = dist(r);
    rows.push([nameOf(o), (o.names || [])[0] || '', o.hubble || '', m ? m.v : '', m ? m.band : '', o.maj ?? '', o.min ?? '', o.z, cz(o).toFixed(0), d ?? '',
      d == null ? '' : r.src === 'size' ? `angular size with assumed diameter ${r.D} kpc` : 'entered by student']);
  }
  return rows.map((r) => r.map(q).join(sep)).join('\n') + '\n';
}

function bind() {
  const body = panel.body;
  body.addEventListener('click', (e) => {
    const t = e.target;
    const tb = t.closest('[data-tab]'); if (tb) { setTab(tb.dataset.tab); return; }
    const sort = t.closest('[data-sort]');
    if (sort) { const k = sort.dataset.sort; if (f.sort === k) f.dir = -f.dir; else { f.sort = k; f.dir = 1; } shown = PAGE; render(); return; }
    const act = t.closest('[data-act]');
    if (act) {
      const a = act.dataset.act;
      if (a === 'more') { shown += PAGE; const sc = body.querySelector('.hb-scroll'), y = sc ? sc.scrollTop : 0; render(); const s2 = body.querySelector('.hb-scroll'); if (s2) s2.scrollTop = y; }
      else if (a === 'retry') { loadErr = false; ensureData(); render(); }
      else if (a === 'reset') { Object.assign(f, { mag: '12', minCz: '1500', morph: 'all', q: '' }); render(); }
      else if (a === 'csv') { download('hubble-lab-table.csv', tsv(','), 'text/csv'); toast('Saved hubble-lab-table.csv'); }
      else if (a === 'copy') {
        const text = tsv('\t');
        const ok = () => toast('Table copied. Paste it into a spreadsheet.');
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, () => toast('The browser did not allow copying. Use Download CSV instead.', { kind: 'warn' }));
        else toast('This browser cannot copy from here. Use Download CSV instead.', { kind: 'warn' });
      } else if (a === 'clear') {
        if (act.dataset.sure) { table = []; save(); emit('render'); render(); }
        else { act.dataset.sure = '1'; act.textContent = 'Really clear? Click again'; setTimeout(() => { if (act.isConnected) { delete act.dataset.sure; act.textContent = 'Clear table'; } }, 3500); }
      } else if (a === 'fill') fillFromSize();
      else if (a === 'unfill') { for (const r of table) if (r.src === 'size') { r.d = ''; r.src = ''; r.D = ''; } save(); render(); }
      return;
    }
    const tr = t.closest('tr[data-id]');
    if (!tr) return;
    const id = tr.dataset.id, o = byId && byId.get(id);
    if (t.closest('.hb-go') && o) { goToDso(o); if (isNarrow()) panel.peek(true); }
    else if (t.closest('.hb-x')) { remove(o ? o.idx : id); }
  });
  body.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.f) { f[t.dataset.f] = t.value; shown = PAGE; if (t.type !== 'search') render(); return; }
    const tr = t.closest('tr[data-id]');
    if (tr && t.type === 'checkbox') {
      const o = byId.get(tr.dataset.id);
      if (t.checked) add(o.idx, false, true); else remove(o.idx, true);
      tr.classList.toggle('on', t.checked);
      const badge = body.querySelector('.hb-tabs [data-tab="data"]');
      if (badge) badge.innerHTML = `2 · My table &amp; plot${table.length ? ` <span class="badge">${table.length}</span>` : ''}`;
    }
  });
  let qTimer = 0;
  body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.dataset.f === 'q') {
      f.q = t.value; clearTimeout(qTimer);
      qTimer = setTimeout(() => { const pos = t.selectionStart; render(); const n = body.querySelector('[data-f="q"]'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (err) { /* fine */ } } }, 220);
      return;
    }
    if (t.classList.contains('hb-d')) {
      const tr = t.closest('tr[data-id]'), r = table.find((x) => x.id === tr.dataset.id);
      if (!r) return;
      r.d = t.value.trim(); r.src = r.d === '' ? '' : 'typed'; r.D = '';
      const mark = tr.querySelector('.src'); if (mark) mark.remove();
      t.classList.toggle('bad', r.d !== '' && dist(r) == null);
      save(); refreshResult();
    }
  });
  // Enter in a distance box moves to the next one, like a spreadsheet
  body.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || !e.target.classList.contains('hb-d')) return;
    const all = [...body.querySelectorAll('.hb-d')], i = all.indexOf(e.target);
    if (all[i + 1]) { all[i + 1].focus(); all[i + 1].select(); } else e.target.blur();
  });
  // hover on the plot
  body.addEventListener('pointermove', (e) => {
    const cv = e.target.closest && e.target.closest('.hb-plot'), tip = body.querySelector('.hb-tip');
    if (!cv) { if (hover >= 0) { hover = -1; drawPlot(); } if (tip) tip.hidden = true; return; }
    const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = -1, bd = 16;
    plotPts.forEach((p, i) => { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = i; } });
    if (best !== hover) { hover = best; drawPlot(); }
    if (best < 0) { tip.hidden = true; return; }
    const p = plotPts[best];
    tip.innerHTML = `<b>${esc(p.name)}</b><span>d = ${p.d} Mpc</span><span>v = ${int(p.v)} km/s</span>`;
    tip.hidden = false;
    const tw = tip.offsetWidth;
    tip.style.left = Math.max(4, Math.min(r.width - tw - 4, p.x - tw / 2)) + 'px';
    tip.style.top = (p.y > 70 ? p.y - tip.offsetHeight - 12 : p.y + 14) + 'px';
  });
  body.addEventListener('pointerleave', () => { const tip = body.querySelector('.hb-tip'); if (tip) tip.hidden = true; if (hover >= 0) { hover = -1; drawPlot(); } });
  new ResizeObserver(() => { if (panel.isOpen() && tab === 'data') drawPlot(); }).observe(panel.el);
}

function fillFromSize() {
  const inp = panel.body.querySelector('#hbD'), D = parseFloat(String(inp.value).replace(',', '.'));
  if (!(D > 0)) { toast('Type the true diameter you want to assume, in kiloparsecs, first.', { kind: 'warn' }); inp.focus(); return; }
  let n = 0, skipped = 0;
  for (const r of table) {
    if (dist(r) != null && r.src !== 'size') continue;          // keep what the student typed; empty or unreadable rows are filled
    const o = byId.get(r.id);
    if (!o || !(o.maj > 0)) { skipped++; continue; }
    const theta = o.maj / 60 * Math.PI / 180;                 // major axis in radians
    r.d = String(+(D / 1000 / theta).toPrecision(3)); r.src = 'size'; r.D = String(D); n++;
  }
  save(); render();
  toast(`${n} distance${n === 1 ? '' : 's'} computed as d = ${D} kpc ÷ angular size.` + (skipped ? ` ${skipped} skipped: no size in the catalogue.` : ''), { ms: 5000 });
}

function ensureData() {
  if (dso.deepLoaded) { if (!byId) index(); return; }
  loadDeepDso().then(() => { loadErr = !dso.deepLoaded; if (dso.deepLoaded) index(); render(); emit('render'); });
}

function add(idx, announce = false, quiet = false) {
  const o = dso.rows[idx];
  if (!o || o.z == null || table.some((r) => r.id === o.id)) return;
  table.push({ id: o.id, d: '', src: '', D: '' }); save(); emit('render');
  if (!byId) index(); else byId.set(o.id, o);
  if (announce) toast(`${nameOf(o)} added to the Hubble table (${table.length} galax${table.length === 1 ? 'y' : 'ies'}).`);
  if (!quiet) render();
}
function remove(idx, quiet = false) {
  const id = typeof idx === 'string' ? idx : dso.rows[idx].id;
  table = table.filter((r) => r.id !== id); save(); emit('render');
  if (!quiet) render();
}

const sp = [0, 0];
/** Ring the table's galaxies on the sky so the student can see what they picked. */
function draw(ctx, R) {
  if (!table.length || !byId || !panel.isOpen()) return;
  ctx.save();
  if (R.ground) clipToSky(ctx);
  ctx.font = "600 11px 'Source Sans 3', system-ui, sans-serif"; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  for (const r of table) {
    const o = byId.get(r.id);
    if (!o || !projEqj(o.vec, sp) || sp[0] < -20 || sp[0] > cam.w + 20 || sp[1] < -20 || sp[1] > cam.h + 20) continue;
    const rad = Math.max(8, Math.min(60, (o.maj || 0) / 60 * cam.pxPerDeg / 2 + 5));
    ctx.lineWidth = 3.2; ctx.strokeStyle = 'rgba(2,6,14,0.7)'; ctx.beginPath(); ctx.arc(sp[0], sp[1], rad, 0, 2 * Math.PI); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.strokeStyle = '#6fb0ff'; ctx.stroke();
    if (!(state.selected && state.selected.kind === 'dso' && state.selected.idx === o.idx)) {
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,6,14,0.85)'; ctx.strokeText(nameOf(o), sp[0] + rad + 4, sp[1] + rad * 0.6);
      ctx.fillStyle = '#9cc8ff'; ctx.fillText(nameOf(o), sp[0] + rad + 4, sp[1] + rad * 0.6);
    }
  }
  ctx.restore();
}

export function initHubble() {
  const saved = loadJSON(STORE, []);
  if (Array.isArray(saved)) table = saved.filter((r) => r && typeof r.id === 'string').map((r) => ({ id: r.id, d: String(r.d ?? ''), src: r.src || '', D: String(r.D ?? '') }));
  let bound = false;
  panel = makePanel({
    id: 'hubblePanel', title: 'Hubble’s-law lab', cls: 'wide',
    onOpen() { if (!bound) { bind(); bound = true; } ensureData(); render(); },
  });
  on('catalog', (w) => { if (w === 'dso' && panel.isOpen()) { index(); render(); } });
  return { panel, draw, add, remove, has: (idx) => { const o = dso.rows[idx]; return !!o && table.some((r) => r.id === o.id); }, table: () => table, fit: () => fitThroughOrigin(points()), csv: () => (byId ? tsv(',') : '') };
}
