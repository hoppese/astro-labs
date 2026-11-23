// ui.js: the chrome around the sky: toolbar toggles, time bar and date editor, settings drawer
// (location, sky, mount, markings), menu and modals, keyboard shortcuts, read-out.

import { state, on, emit, toggle, set, save } from './state.js';
import { cam, setMount } from './camera.js';
import { getFrame } from './skyframe.js';
import { cities } from './catalog.js';
import { setNow, togglePlay, faster, slower, setRate, stepTime, setTime, rateLabel, SIDEREAL_DAY_MS } from './clock.js';
import { wallParts, wallToMs, zoneLabel, fmtDate, fmtTime, browserZone, zoneFromLongitude } from './timeutil.js';
import { fmtFov, fmtLat, fmtLon } from './astro.js';
import { BORTLE_NAMES, BORTLE_NELM } from './render/sky.js';
import { centerOn, toggleTracking, select } from './nav.js';
import { navKey } from './input.js';
import { ICON, TICON } from './icons.js';
import { measure, toggleMeasure } from './measure.js';
import { INFO_HTML, CREDITS_HTML } from './about.js';

const $ = (id) => document.getElementById(id);

// label, state.show key (or action), keyboard key
const TOOLS = [
  { key: 'conLines', label: 'Constellation lines', k: 'C' },
  { key: 'conNames', label: 'Constellation names', k: 'V' },
  { key: 'conBounds', label: 'Constellation boundaries', k: 'B' },
  { key: 'starNames', label: 'Star names', k: 'S' },
  { key: 'planetNames', label: 'Planet and moon names', k: 'P' },
  { key: 'dso', label: 'Deep-sky objects', k: 'D' },
  null,
  { key: 'eqGrid', label: 'Equatorial grid', k: 'E' },
  { key: 'azGrid', label: 'Alt-az grid', k: 'Z' },
  { key: 'meridian', label: 'Meridian', k: ';' },
  { key: 'equator', label: 'Celestial equator', k: '.' },
  { key: 'ecliptic', label: 'Ecliptic', k: ',' },
  null,
  { key: 'atmosphere', label: 'Atmosphere', k: 'A' },
  { key: 'refraction', label: 'Refraction', k: 'F', hidden: true },
  { key: 'ground', label: 'Ground', k: 'G' },
  { key: 'cardinal', label: 'Cardinal points', k: 'Q' },
  { key: 'mount', label: 'Equatorial mount', k: 'M', mount: true },
  null,
  { key: 'measure', label: 'Measure an angle', k: 'R', act: () => toggleMeasure(), isOn: () => measure.active },
];
const HOUR = 3600000, DAY = 86400000;
const STEPS = [['\u22121 s', -1000], ['+1 s', 1000], ['\u22121 min', -60000], ['+1 min', 60000],
  ['\u22121 h', -HOUR], ['+1 h', HOUR], ['\u22121 day', -DAY], ['+1 day', DAY],
  ['\u22121 sid. d', -SIDEREAL_DAY_MS], ['+1 sid. d', SIDEREAL_DAY_MS], ['\u22121 week', -7 * DAY], ['+1 week', 7 * DAY],
  ['\u22121 month', 'm-1'], ['+1 month', 'm1'], ['\u22121 year', 'y-1'], ['+1 year', 'y1'],
  // labs: the Moon's months, Mars's year (Kepler), centuries (precession)
  ['\u22121 syn. mo', -29.530588853 * DAY], ['+1 syn. mo', 29.530588853 * DAY], ['\u22121 sid. mo', -27.321661547 * DAY], ['+1 sid. mo', 27.321661547 * DAY],
  ['\u22121 Mars yr', -686.9796 * DAY], ['+1 Mars yr', 686.9796 * DAY], ['\u2212100 yr', 'y-100'], ['+100 yr', 'y100']];

export function initUI({ search }) {
  buildToolbar();
  buildTimeBar();
  buildDrawer();
  buildMenu();
  buildShortcuts(search);
  on('frame', updateReadout);
  syncAll();
}

// ---------- toolbar ----------
const runTool = (t) => (t.act ? t.act() : t.mount ? switchMount() : toggle(t.key));
function switchMount() { setMount(state.mount === 'eq' ? 'altaz' : 'eq', getFrame()); save(); emit('mount'); }
function buildToolbar() {
  const bar = $('toolbar');
  const tip = document.createElement('div'); tip.className = 'tip'; tip.hidden = true; document.body.appendChild(tip);
  for (const t of TOOLS) {
    if (t && t.hidden) continue;        // keyboard + drawer only
    if (!t) { const g = document.createElement('span'); g.className = 'gap'; bar.appendChild(g); continue; }
    const b = document.createElement('button');
    b.className = 'tool'; b.type = 'button'; b.dataset.key = t.key;
    b.innerHTML = ICON[t.key];
    b.setAttribute('aria-label', `${t.label} (${t.k})`);
    b.addEventListener('click', () => runTool(t));
    const show = () => { tip.innerHTML = `${t.label}<kbd>${t.k}</kbd>`; tip.hidden = false; const r = b.getBoundingClientRect(); const w = tip.offsetWidth;
      tip.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px'; tip.style.top = (r.top - tip.offsetHeight - 8) + 'px'; };
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
    b.addEventListener('focus', () => { if (b.matches(':focus-visible')) show(); });
    b.addEventListener('pointerleave', () => { tip.hidden = true; });
    b.addEventListener('blur', () => { tip.hidden = true; });
    bar.appendChild(b);
  }
  $('settingsBtn').innerHTML = ICON.settings;
  on('show', syncToggles); on('mount', syncToggles); on('measure', syncToggles);
}
function syncToggles() {
  document.querySelectorAll('.tool').forEach((b) => {
    const k = b.dataset.key;
    const t = TOOLS.find((x) => x && x.key === k);
    if (!t) return;
    b.setAttribute('aria-pressed', t.isOn ? t.isOn() : k === 'mount' ? state.mount === 'eq' : !!state.show[k]);
  });
  document.querySelectorAll('[data-show]').forEach((c) => { c.checked = !!state.show[c.dataset.show]; });
  document.querySelectorAll('#mountSeg button').forEach((b) => b.setAttribute('aria-checked', b.dataset.mount === state.mount));
  const lp = $('bortle').closest('.slider-row'); if (lp) lp.classList.toggle('dim', !state.show.atmosphere);
}

// ---------- time ----------
let lastClockText = '';
function buildTimeBar() {
  $('tSlower').innerHTML = TICON.slower; $('tFaster').innerHTML = TICON.faster; $('tNow').innerHTML = TICON.now;
  $('tSlower').addEventListener('click', slower);
  $('tFaster').addEventListener('click', faster);
  $('tPlay').addEventListener('click', togglePlay);
  $('tNow').addEventListener('click', setNow);
  const pop = $('timePop');
  const openPop = (open) => { pop.hidden = !open; if (open) { fillEditor(true); $('dtYear').focus(); } };
  $('clockBtn').addEventListener('click', () => openPop(pop.hidden));
  $('timeClose').addEventListener('click', () => openPop(false));
  $('dtNow').addEventListener('click', setNow);
  const sb = $('stepBtns');
  for (const [label, d] of STEPS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.addEventListener('click', () => {
      if (typeof d === 'number') stepTime(d);
      else {
        const p = wallParts(state.timeMs, state.loc.tz), n = parseInt(d.slice(1), 10);
        let y = p.year, mo = p.month;
        if (d[0] === 'y') y += n; else { mo += n; if (mo < 1) { mo = 12; y--; } if (mo > 12) { mo = 1; y++; } }
        setTime(wallToMs(y, mo, p.day, p.hour, p.minute, p.second, state.loc.tz));
      }
    });
    sb.appendChild(b);
  }
  const apply = () => {
    const y = parseInt($('dtYear').value, 10), mo = parseInt($('dtMonth').value, 10), d = parseInt($('dtDay').value, 10);
    const t = /^(\d\d):(\d\d)(?::(\d\d))?/.exec($('dtTime').value);
    if (!t || !(y >= -3000 && y <= 3000) || !(mo >= 1 && mo <= 12) || !(d >= 1 && d <= 31)) return;
    setTime(wallToMs(y, mo, d, +t[1], +t[2], +(t[3] || 0), state.loc.tz));
  };
  for (const id of ['dtYear', 'dtMonth', 'dtDay', 'dtTime']) { $(id).addEventListener('change', apply); $(id).addEventListener('keydown', (e) => e.stopPropagation()); }
  on('rate', syncRate); on('time', () => { updateClock(true); }); on('tick', () => updateClock(false)); on('loc', () => updateClock(true));
  setInterval(() => updateClock(false), 500);
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !$('clockBtn').contains(e.target)) openPop(false); });
}
function syncRate() {
  $('tPlay').innerHTML = state.playing ? TICON.pause : TICON.play;
  const r = $('rateLabel'); r.textContent = rateLabel();
  r.classList.toggle('rt', state.playing && state.rate === 1);
  r.classList.toggle('paused', !state.playing);
  r.title = state.playing ? (state.rate === 1 ? 'Real-time rate' : `Time runs ${rateLabel()} real time`) : 'Time is paused';
}
function updateClock(force) {
  const tz = state.loc.tz, p = wallParts(state.timeMs, tz);
  const text = fmtDate(p) + fmtTime(p);
  if (text === lastClockText && !force) return;
  lastClockText = text;
  $('clockDate').innerHTML = `<span class="wd">${p.weekday} </span>${fmtDate(p)}`;
  $('clockTime').textContent = fmtTime(p);
  $('clockTz').textContent = zoneLabel(state.timeMs, tz);
  if (!$('timePop').hidden) fillEditor(false);
}
function fillEditor(force) {
  const tz = state.loc.tz, p = wallParts(state.timeMs, tz);
  const active = document.activeElement;
  const put = (id, v) => { if (force || active !== $(id)) $(id).value = v; };
  put('dtYear', p.year); put('dtMonth', p.month); put('dtDay', p.day); put('dtTime', fmtTime(p));
  $('calNote').hidden = state.timeMs >= Date.UTC(1582, 9, 15);
  $('timeTz').textContent = zoneLabel(state.timeMs, tz);
  $('timeUtc').textContent = new Date(state.timeMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ---------- drawer: location, sky, mount, markings ----------
const CHECKS = [['starNames', 'Star names', 'S'], ['planetNames', 'Planet names', 'P'], ['conLines', 'Constellation lines', 'C'], ['conNames', 'Constellation names', 'V'],
  ['conBounds', 'Boundaries', 'B'], ['dso', 'Deep-sky objects', 'D'], ['eqGrid', 'Equatorial grid', 'E'], ['azGrid', 'Alt-az grid', 'Z'],
  ['meridian', 'Meridian', ';'], ['equator', 'Celestial equator', '.'], ['ecliptic', 'Ecliptic', ','], ['cardinal', 'Cardinal points', 'Q']];
const PRESETS = [['Dark site', 2], ['Rural', 4], ['Suburban', 6], ['City', 8]];

export function openDrawer(open, section) {
  $('drawer').hidden = !open;
  if (open) { fillLocation(); (section ? $(section) : $('drawerClose')).scrollIntoView({ block: 'start' }); (section === 'secLocation' ? $('citySearch') : $('drawerClose')).focus(); }
}
function buildDrawer() {
  $('settingsBtn').addEventListener('click', () => openDrawer($('drawer').hidden));
  $('drawerClose').addEventListener('click', () => openDrawer(false));
  $('placeBtn').addEventListener('click', () => openDrawer(true, 'secLocation'));
  const box = $('showChecks');
  for (const [key, label, k] of CHECKS) {
    const l = document.createElement('label'); l.className = 'check';
    l.innerHTML = `<input type="checkbox" data-show="${key}"> ${label} <span class="k">${k}</span>`;
    box.appendChild(l);
  }
  document.querySelectorAll('[data-show]').forEach((c) => c.addEventListener('change', () => toggle(c.dataset.show, c.checked)));
  document.querySelectorAll('#mountSeg button').forEach((b) => b.addEventListener('click', () => { if (state.mount !== b.dataset.mount) switchMount(); }));
  const bortle = $('bortle');
  bortle.addEventListener('input', () => set('bortle', +bortle.value));
  const pr = $('bortlePresets');
  for (const [label, v] of PRESETS) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.dataset.v = v; b.addEventListener('click', () => set('bortle', v)); pr.appendChild(b); }
  on('bortle', syncBortle);
  $('lightTimeChk').addEventListener('change', (e) => set('lightTime', e.target.checked));

  // location
  const cs = $('citySearch');
  cs.addEventListener('input', fillCities);
  cs.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('cityList').querySelector('button'); if (b) b.click(); } e.stopPropagation(); });
  $('cityList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const c = cities[+b.dataset.i];
    setLocation({ name: c.name, region: c.region, lat: c.lat, lon: c.lon, elev: 0, tz: c.tz });
  });
  $('locApply').addEventListener('click', () => {
    const lat = parseFloat($('latIn').value), lon = parseFloat($('lonIn').value);
    if (!(lat >= -90 && lat <= 90) || !(lon >= -180 && lon <= 180)) return locMsg('Latitude must be between −90 and 90, longitude between −180 and 180.', true);
    const near = nearestCity(lat, lon);
    setLocation({ name: `${fmtLat(lat)}, ${fmtLon(lon)}`, region: 'Custom location', lat, lon, elev: 0, tz: near && near.d < 1.5 ? near.c.tz : zoneFromLongitude(lon) });
    locMsg(near && near.d < 1.5 ? `Using the time zone of ${near.c.name}.` : 'Time zone estimated from the longitude (whole hours).');
  });
  $('locGeo').addEventListener('click', () => {
    if (!navigator.geolocation) return locMsg('This browser cannot share a location.', true);
    locMsg('Asking the browser for your location…');
    navigator.geolocation.getCurrentPosition((pos) => {
      const lat = +pos.coords.latitude.toFixed(3), lon = +pos.coords.longitude.toFixed(3);
      setLocation({ name: 'My location', region: `${fmtLat(lat)}, ${fmtLon(lon)}`, lat, lon, elev: Math.max(0, Math.round(pos.coords.altitude || 0)), tz: browserZone() });
      locMsg('Location set from the browser, with this device’s time zone.');
    }, (err) => locMsg(err.code === 1 ? 'Location permission was declined.' : 'Could not get a location.', true), { timeout: 12000, maximumAge: 600000 });
  });
  on('loc', () => { fillLocation(); syncPlace(); });
}
function locMsg(text, err = false) { const m = $('locMsg'); m.textContent = text; m.classList.toggle('err', err); }
function nearestCity(lat, lon) {
  let best = null;
  for (const c of cities) { const d = Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos(lat * Math.PI / 180)); if (!best || d < best.d) best = { c, d }; }
  return best;
}
export function setLocation(loc) { locMsg(''); set('loc', loc); }
function fillLocation() {
  const l = state.loc;
  $('locNow').innerHTML = `<b></b><span class="sub"></span>`;
  $('locNow').querySelector('b').textContent = l.name + (l.region && !/^Custom/.test(l.region) ? ', ' + l.region : '');
  $('locNow').querySelector('.sub').textContent = `${fmtLat(l.lat)}  ${fmtLon(l.lon)}  ·  ${zoneLabel(state.timeMs, l.tz)}`;
  $('latIn').value = l.lat; $('lonIn').value = l.lon;
  fillCities();
}
function fillCities() {
  const q = $('citySearch').value.trim().toLowerCase();
  const list = $('cityList');
  const hits = cities.map((c, i) => ({ c, i })).filter(({ c }) => !q || (c.name + ' ' + c.region).toLowerCase().includes(q))
    .sort((a, b) => (q ? (b.c.name.toLowerCase().startsWith(q) - a.c.name.toLowerCase().startsWith(q)) : 0)).slice(0, 60);
  list.innerHTML = '';
  for (const { c, i } of hits) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i;
    b.append(c.name); const s = document.createElement('span'); s.textContent = c.region; b.appendChild(s);
    list.appendChild(b);
  }
  if (!hits.length) list.innerHTML = '<div class="hint" style="padding:8px 9px;margin:0">No match in the built-in list. Enter coordinates below.</div>';
}
function syncPlace() {
  const l = state.loc, b = $('placeBtn');
  b.innerHTML = ICON.pin + '<span class="txt"></span><span class="sub"></span>';
  b.querySelector('.txt').textContent = l.name;
  b.querySelector('.sub').textContent = `${fmtLat(l.lat)} ${fmtLon(l.lon)}`;
}
function syncBortle() {
  $('bortle').value = state.bortle;
  $('bortleOut').innerHTML = `<b>Bortle ${state.bortle}</b> · ${BORTLE_NAMES[state.bortle]} · naked-eye limit about mag ${BORTLE_NELM[state.bortle].toFixed(1)}`;
  document.querySelectorAll('#bortlePresets button').forEach((b) => b.classList.toggle('on', +b.dataset.v === state.bortle));
}

// ---------- menu, modals, bug report ----------
const SIM_ID = 'planetarium';
function buildMenu() {
  const menu = $('menu'), btn = $('menuBtn');
  const close = () => { menu.hidden = true; };
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; });
  document.addEventListener('click', (e) => { if (!menu.hidden && !menu.contains(e.target) && e.target !== btn) close(); });
  $('infoBody').innerHTML = INFO_HTML; $('creditsBody').innerHTML = CREDITS_HTML;
  const open = (id) => { close(); $(id).classList.add('show'); const f = $(id).querySelector('textarea, .close'); if (f) f.focus(); };
  $('mInfo').addEventListener('click', () => open('infoModal'));
  $('mCredits').addEventListener('click', () => open('creditsModal'));
  $('mBug').addEventListener('click', () => open('bugModal'));
  document.querySelectorAll('.modal-backdrop').forEach((m) => {
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) m.classList.remove('show'); });
    m.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  });
  // same endpoint and payload as the other astro-labs sims
  $('bugSend').addEventListener('click', () => {
    const text = ($('bugText').value || '').trim(), rEl = $('bugResult');
    if (text.length < 3) { rEl.textContent = 'Please describe the problem first.'; rEl.style.color = '#f0a58c'; return; }
    const btnS = $('bugSend'); btnS.disabled = true; rEl.textContent = 'Sending…'; rEl.style.color = '#9fb0bf';
    fetch('https://sims-api.sethhopper.com/report', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sim: SIM_ID, text: text.slice(0, 4000), email: ($('bugEmail').value || '').trim().slice(0, 200), pageUrl: location.href, userAgent: navigator.userAgent, website: '' }),
    }).then((r) => r.json().catch(() => ({})).then((j) => ({ ok: r.ok, j })))
      .then((res) => {
        btnS.disabled = false;
        if (res.ok && res.j && res.j.ok) { rEl.textContent = 'Thanks — your report was filed.'; rEl.style.color = '#7fd08a'; $('bugText').value = ''; }
        else { rEl.textContent = 'Could not send' + (res.j && res.j.error ? ' (' + res.j.error + ')' : '') + '. Try again later.'; rEl.style.color = '#f0a58c'; }
      }).catch(() => { btnS.disabled = false; rEl.textContent = 'Network error. Try again later.'; rEl.style.color = '#f0a58c'; });
  });
}
function closeEverything() {
  let closed = false;
  document.querySelectorAll('.modal-backdrop.show').forEach((m) => { m.classList.remove('show'); closed = true; });
  for (const id of ['menu', 'timePop', 'drawer']) if (!$(id).hidden) { $(id).hidden = true; closed = true; }
  if (closed) $('sky').focus({ preventScroll: true });      // keyboard shortcuts work again straight away
  return closed;
}

// ---------- keyboard ----------
function buildShortcuts(search) {
  const byKey = {};
  for (const t of TOOLS) if (t) byKey[t.k.toLowerCase()] = t;
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (closeEverything()) return; if (measure.active) toggleMeasure(false); else if (state.selected) select(null); return; }
    const el = e.target;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    if (document.querySelector('.modal-backdrop.show')) return;
    if (e.key === 'F3' || (e.key === '/' && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); search.focus(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // let Space / Enter activate a focused button instead of acting on the sky
    if ((e.key === ' ' || e.key === 'Enter') && el && (el.tagName === 'BUTTON' || el.tagName === 'A')) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const t = byKey[k];
    if (t) { e.preventDefault(); runTool(t); return; }
    switch (k) {
      case ' ': e.preventDefault(); if (state.selected) centerOn(state.selected); return;
      case 't': toggleTracking(); return;
      case 'j': slower(); return;
      case 'l': faster(); return;
      case 'k': setRate(1); return;
      case '7': togglePlay(); return;
      case '8': setNow(); return;
      case ']': stepTime(DAY); return;
      case '[': stepTime(-DAY); return;
      case '}': stepTime(SIDEREAL_DAY_MS); return;
      case '{': stepTime(-SIDEREAL_DAY_MS); return;
      case '>': stepTime(HOUR); return;
      case '<': stepTime(-HOUR); return;
    }
    if (navKey(e)) e.preventDefault();
  });
}

// ---------- read-out ----------
let lastRead = '';
function updateReadout(perf) {
  const txt = `FOV <b>${fmtFov(cam.fov)}</b> · stars to mag <b>${perf.limMag.toFixed(1)}</b>` + (perf.limMag > 9.5 ? '<br>catalogue thins out past mag 9' : '') +
    (state.mount === 'eq' ? '<br>equatorial mount' : '') + (state.tracking ? '<br>tracking' : '');
  if (txt !== lastRead) { $('readout').innerHTML = txt; lastRead = txt; }
}

function syncAll() {
  syncToggles(); syncRate(); syncBortle(); syncPlace(); updateClock(true);
  $('lightTimeChk').checked = state.lightTime;
}
