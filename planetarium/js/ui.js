// ui.js: the chrome around the sky: toolbar toggles, time bar and date editor, settings drawer
// (location, sky, mount, markings), menu and modals, keyboard shortcuts, read-out.

import { state, eff, on, emit, toggle, set, save, SHOW_DEFAULTS } from './state.js';
import { cam, setMount, lookAtHor } from './camera.js';
import { getFrame } from './skyframe.js';
import { VANTAGES, MOON_PARENT, SURFACES, SITES, getBodies } from './ephem.js';
import { cities } from './catalog.js';
import { setNow, togglePlay, faster, slower, setRate, stepTime, setTime, rateLabel, rateWords, rateCap, SIDEREAL_DAY_MS, T_MIN, T_MAX } from './clock.js';
import { wallParts, wallToMs, zoneLabel, fmtDate, fmtTime, browserZone, zoneFromLongitude, dateProblem, daysInMonth } from './timeutil.js';
import { findCities } from './fuzzy.js';
import { readNumber } from './xui.js';
import { fmtFov, fmtLat, fmtLon, azAltToHor, horToAzAlt } from './astro.js';
import { BORTLE_NAMES, BORTLE_NELM } from './render/sky.js';
import { centerOn, toggleTracking, select, stopTracking } from './nav.js';
import { navKey } from './input.js';
import { latitudeHidden, running, stepHidden } from './labs/hidden.js';
import { keyReached, takesKeys } from './focus.js';
import { ICON, TICON } from './icons.js';
import { measure, toggleMeasure } from './measure.js';
import { INFO_HTML, CREDITS_HTML } from './about.js';
import { deep, netUsable, netWhy, depthNow, deepSource } from './deepstars.js';

/** A finger: do not open the keyboard unasked. */
const touchy = () => window.matchMedia('(pointer: coarse)').matches;
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
let lastClockText = '', lastZone = '', clockParts = null;
const putText = (n, s) => { if (n.data !== s) n.data = s; };
function buildTimeBar() {
  $('tSlower').innerHTML = TICON.slower; $('tFaster').innerHTML = TICON.faster; $('tNow').innerHTML = TICON.now;
  $('tSlower').addEventListener('click', slower);
  $('tFaster').addEventListener('click', faster);
  $('tPlay').addEventListener('click', togglePlay);
  $('tNow').addEventListener('click', setNow);
  const pop = $('timePop');
  const openPop = (open) => { pop.hidden = !open; draft = false; dateMsg(''); if (open) { fillEditor(true); (touchy() ? $('timeClose') : $('dtYear')).focus({ preventScroll: true }); } };
  $('clockBtn').addEventListener('click', () => openPop(pop.hidden));
  $('timeClose').addEventListener('click', () => openPop(false));
  $('dtNow').addEventListener('click', setNow);
  const sb = $('stepBtns');
  for (const [label, d] of STEPS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    on('lab', () => { b.hidden = stepHidden(label); });      // the size of this step is what the lab measures
    b.addEventListener('click', () => {
      if (typeof d === 'number') stepTime(d);
      else {
        const p = wallParts(state.timeMs, state.loc.tz), n = parseInt(d.slice(1), 10);
        let y = p.year, mo = p.month;
        if (d[0] === 'y') y += n; else { mo += n; if (mo < 1) { mo = 12; y--; } if (mo > 12) { mo = 1; y++; } }
        setTime(wallToMs(y, mo, Math.min(p.day, daysInMonth(y, mo)), p.hour, p.minute, p.second, state.loc.tz));      // a month after 31 January is the last of February
      }
    });
    sb.appendChild(b);
  }
  const apply = () => {
    const int = (id) => ($(id).value.trim() === '' ? NaN : Number($(id).value)), y = int('dtYear'), mo = int('dtMonth'), d = int('dtDay');
    const t = /^(\d\d):(\d\d)(?::(\d\d))?/.exec($('dtTime').value);
    const bad = dateProblem(y, mo, d) || (t ? '' : 'Type the whole time: hours, minutes and seconds.');
    draft = !!bad; dateMsg(bad ? bad + ' The clock has not been changed.' : '');
    if (bad) return;                      // what was typed stays in the boxes until it is right (fillEditor)
    setTime(wallToMs(y, mo, d, +t[1], +t[2], +(t[3] || 0), state.loc.tz));
  };
  for (const id of ['dtYear', 'dtMonth', 'dtDay', 'dtTime']) { $(id).addEventListener('change', apply); $(id).addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); }); }
  for (const b of [sb, $('dtNow'), $('tNow')]) b.addEventListener('click', () => { draft = false; if (state.timeMs > T_MIN && state.timeMs < T_MAX) dateMsg(''); fillEditor(true); });
  on('clock-end', () => dateMsg(`The clock runs from the year −3000 to the year 3000: it stopped at the ${state.timeMs <= T_MIN ? 'first' : 'last'} moment of that span.`));
  on('rate', syncRate); on('selection', syncRate); on('time', () => { updateClock(true); }); on('tick', () => updateClock(false)); on('loc', () => updateClock(true));
  setInterval(() => updateClock(false), 500);
  document.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !$('clockBtn').contains(e.target)) openPop(false); });
}
let draft = false;               // the date box holds something typed that is not a date
function dateMsg(text) { const m = $('dtMsg'); m.textContent = text; m.hidden = !text; }
function syncRate() {
  $('tPlay').innerHTML = state.playing ? TICON.pause : TICON.play;
  const r = $('rateLabel'); r.textContent = rateLabel();
  // plain words under the figure once it is too large to mean anything
  if (state.playing && Math.abs(state.rate) >= 1000) { const w = document.createElement('small'); w.textContent = rateWords().replace('about ', '≈ ').replace(' per second', '/s').replace(', backwards', ''); r.appendChild(w); }
  r.classList.toggle('rt', state.playing && state.rate === 1);
  r.classList.toggle('paused', !state.playing);
  r.title = state.playing ? (state.rate === 1 ? 'Real-time rate' : `Time runs ${rateWords()} (${rateLabel()} real time)`) : 'Time is paused';
}
function updateClock(force) {
  const tz = state.loc.tz, p = wallParts(state.timeMs, tz);
  const text = fmtDate(p) + fmtTime(p);
  if (text === lastClockText && !force) return;
  lastClockText = text;
  if (!clockParts) {
    const node = (el) => { el.textContent = ''; return el.appendChild(document.createTextNode('')); }, wd = document.createElement('span'); wd.className = 'wd';
    $('clockDate').textContent = ''; $('clockDate').appendChild(wd);
    clockParts = { wd: node(wd), date: $('clockDate').appendChild(document.createTextNode('')), time: node($('clockTime')), tz: node($('clockTz')) };
  }
  // text nodes are changed in place, and only when they differ: the bar is not rebuilt sixty times a second
  putText(clockParts.wd, p.weekday + ' '); putText(clockParts.date, fmtDate(p)); putText(clockParts.time, fmtTime(p));
  // the bar has little room: "UTC+2:05:09 LMT" there, the words in the editor and the tooltip
  const zl = zoneLabel(state.timeMs, tz);
  if (zl !== lastZone) { lastZone = zl; putText(clockParts.tz, zl.replace(' (local mean time)', ' LMT')); $('clockTz').title = zl; }
  if (!$('timePop').hidden) fillEditor(false);
}
function fillEditor(force) {
  const tz = state.loc.tz, p = wallParts(state.timeMs, tz);
  const active = document.activeElement;
  const put = (id, v) => { if (force || active !== $(id)) $(id).value = v; };
  if (!draft || force) { put('dtYear', p.year); put('dtMonth', p.month); put('dtDay', p.day); put('dtTime', fmtTime(p)); }
  $('calNote').hidden = state.timeMs >= Date.UTC(1582, 9, 15);
  $('timeTz').textContent = zoneLabel(state.timeMs, tz);
  $('timeUtc').textContent = new Date(state.timeMs).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
}

// ---------- drawer: location, sky, mount, markings ----------
const CHECKS = [['starNames', 'Star names', 'S'], ['planetNames', 'Planet names', 'P'], ['conLines', 'Constellation lines', 'C'], ['conNames', 'Constellation names', 'V'],
  ['conBounds', 'Boundaries', 'B'], ['dso', 'Deep-sky objects', 'D'], ['eqGrid', 'Equatorial grid', 'E'], ['azGrid', 'Alt-az grid', 'Z'],
  ['meridian', 'Meridian', ';'], ['equator', 'Celestial equator', '.'], ['ecliptic', 'Ecliptic', ','], ['cardinal', 'Cardinal points', 'Q'], ['orbits', 'Orbits (looking from space)', '']];
const PRESETS = [['Dark site', 2], ['Rural', 4], ['Suburban', 6], ['City', 8]];

export function openDrawer(open, section) {
  $('drawer').hidden = !open;
  if (open) { fillLocation(); (section ? $(section) : $('drawerClose')).scrollIntoView({ block: 'start' }); (section === 'secLocation' && !touchy() ? $('citySearch') : $('drawerClose')).focus({ preventScroll: true }); }
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
  on('lightTime', () => { $('lightTimeChk').checked = state.lightTime; });      // also switched from Labs > Corrections

  // location
  const cs = $('citySearch');
  cs.addEventListener('input', () => { locMsg(''); fillCities(); });
  cs.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const b = $('cityList').querySelector('button'); if (b) b.click(); } else if (e.key === 'Escape' && cs.value) { e.preventDefault(); cs.value = ''; fillCities(); e.stopPropagation(); return; } if (e.key !== 'Escape') e.stopPropagation(); });
  $('cityList').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const c = cities[+b.dataset.i];
    setLocation({ name: c.name, region: c.region, lat: c.lat, lon: c.lon, elev: 0, tz: c.tz });
    if (cs.value) { cs.value = ''; fillCities(); }          // the choice is made: show the whole list again
    locMsg('');
  });
  // Enter in a coordinate box applies the coordinates
  for (const id of ['latIn', 'lonIn']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('locApply').click(); } });
  $('locApply').addEventListener('click', () => {
    const q = readPlace($('latIn').value, $('lonIn').value);
    if (q.err) return locMsg(q.err, true);
    const { lat, lon } = q;
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
  $('resetShow').addEventListener('click', (e) => {
    const b = e.currentTarget;
    if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Really reset? Click again'; setTimeout(() => { delete b.dataset.sure; b.textContent = 'Reset display to defaults'; }, 3500); return; }
    delete b.dataset.sure; b.textContent = 'Reset display to defaults';
    Object.assign(state.show, SHOW_DEFAULTS); state.bortle = 4; state.lightTime = true;
    for (const k of Object.keys(state.fx)) { state.fx[k] = k !== 'earthShadow'; emit('fx', k); }
    if (state.mount !== 'altaz') switchMount();
    save(); emit('show'); emit('bortle'); emit('lightTime', true); emit('display-reset');
  });
  // where the observer is: on the Earth (the place below), or floating at the center of another body
  {
    const sel = $('vantageSel'), moons = VANTAGES.filter((id) => MOON_PARENT[id]), rest = VANTAGES.filter((id) => !MOON_PARENT[id] && id !== 'Above');
    sel.innerHTML = '<option value="">the Earth (the place below)</option><option value="Above">high above the Sun (the solar system)</option><optgroup label="Floating in space at">' + rest.map((id) => `<option value="${id}">${id === 'Sun' || id === 'Moon' ? 'the ' + id : id}</option>`).join('') +
      '</optgroup><optgroup label="At a moon">' + moons.map((id) => `<option value="${id}">${id} (${MOON_PARENT[id]})</option>`).join('') + '</optgroup>';
    sel.addEventListener('change', () => setVantage(sel.value || null));
    $('aboveSel').addEventListener('change', (e) => { state.aboveAU = +e.target.value; emit('loc'); lookDown(); });
    // standing on the body instead of floating at its center
    $('surfOn').addEventListener('change', (e) => setSurface(e.target.checked ? defaultSite(state.vantage) : null));
    $('surfSite').addEventListener('change', (e) => { const s = sitesFor(state.vantage)[+e.target.value]; if (s) setSurface({ lat: s[1], lon: s[2] }); });
    const go = () => {
      const r = readPlace($('surfLat').value, $('surfLon').value), m = $('surfMsg');
      m.hidden = !r.err; m.textContent = r.err || '';
      if (!r.err) setSurface({ lat: r.lat, lon: r.lon });
    };
    $('surfGo').addEventListener('click', go);
    for (const id of ['surfLat', 'surfLon']) $(id).addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }
  on('loc', () => { fillLocation(); syncPlace(); });
  on('lab', () => { fillLocation(); syncPlace(); });        // a lab may hide the latitude (labs/hidden.js)
}
function locMsg(text, err = false) { const m = $('locMsg'); m.textContent = text; m.classList.toggle('err', err); }
function nearestCity(lat, lon) {
  let best = null;
  for (const c of cities) { const d = Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos(lat * Math.PI / 180)); if (!best || d < best.d) best = { c, d }; }
  return best;
}
/** Two coordinates somebody typed: {lat, lon} or {err}. A letter N, S, E or W may follow. */
export function readPlace(a, b) {
  const one = (text, what, lim, pos, neg) => {
    const t = String(text).trim(), m = /\s*°?\s*([NSEW])\s*$/i.exec(t), r = readNumber(m ? t.slice(0, m.index) : t.replace(/°/g, ''));
    if (r.empty) return { err: `Type a ${what}.` };
    if (r.err) return r;
    const c = m ? m[1].toUpperCase() : pos;
    if (c !== pos && c !== neg) return { err: `A ${what} is ${pos} or ${neg}.` };
    const v = c === neg ? -Math.abs(r.v) : r.v;
    return Math.abs(v) <= lim ? { v } : { err: `The ${what} must be between −${lim} and ${lim} degrees.` };
  };
  const la = one(a, 'latitude', 90, 'N', 'S'), lo = one(b, 'longitude', 180, 'E', 'W');
  return la.err || lo.err ? { err: la.err || lo.err } : { lat: la.v, lon: lo.v };
}
/** Float at the center of body `id` (null: back on the Earth). Turns to the body worth seeing from there. */
export function setVantage(id) {
  id = id && VANTAGES.includes(id) ? id : null;
  if (id === (state.vantage || null)) return;
  state.vantage = id;
  if (state.surface) state.surface = SURFACES.includes(id) ? defaultSite(id) : null;      // still standing, on the new body
  if (state.trackRef && state.trackRef.id === id) stopTracking();
  if (state.selected && state.selected.id === id) select(null);
  emit('loc');
  if (id === 'Above') { lookDown(); return; }
  if (eff.onSurface) { lookAround(); return; }
  const look = lookTarget(id);
  if (look) { const ref = { kind: 'body', id: look }; select(ref); centerOn(ref, !!MOON_PARENT[id] || id === 'Moon'); }
}
const lookTarget = (id) => (!id ? null : MOON_PARENT[id] || (id === 'Sun' || id === 'Moon' ? 'Earth' : 'Sun'));      // a moon's planet; the Earth from the Sun or the Moon; else the Sun
/** Named places on body `id`, then the default one: [label, lat, east lon]. */
function sitesFor(id) {
  const own = SITES[id] || [], look = lookTarget(id);
  return own.length ? own : [[look === 'Sun' ? '20° N 20° E' : `20° N 20° E (${look} high in the sky)`, 20, 20]];
}
const defaultSite = (id) => { const s = sitesFor(id)[0]; return { lat: s[1], lon: s[2] }; };
/** Stand on the vantage body at {lat, lon} (null: float at its center again). */
export function setSurface(surf) {
  state.surface = surf && SURFACES.includes(state.vantage) ? { lat: Math.round(surf.lat * 1e4) / 1e4, lon: Math.round(surf.lon * 1e4) / 1e4 } : null;
  emit('loc');
  if (eff.onSurface) lookAround();
  else if (state.vantage) { const ref = { kind: 'body', id: lookTarget(state.vantage) }; select(ref); centerOn(ref, true); }
}
/** On the ground: turn to the planet (or the Earth, or the Sun) when it is up, else to the southern (northern) horizon. */
function lookAround() {
  const id = lookTarget(state.vantage), b = getBodies(getFrame()).byId[id];
  cam.fov = 90; emit('fov');
  if (b && b.hor[2] > Math.sin(3 * Math.PI / 180)) { const ref = { kind: 'body', id }; select(ref); centerOn(ref); return; }
  select(null); stopTracking();
  lookAtHor(azAltToHor(state.surface.lat >= 0 ? 180 : 0, 25)); emit('render');
}
/** High above the Sun: look straight down at it, with a field that holds the orbits out to about the height. */
function lookDown() { const ref = { kind: 'body', id: 'Sun' }; select(null); centerOn(ref); cam.fov = 110; emit('fov'); }
/** A new place. What is followed goes on being followed, seen from there. */
export function setLocation(loc) { locMsg(''); set('loc', loc); }
function fillLocation() {
  const l = state.loc;
  $('locNow').innerHTML = `<b></b><span class="sub"></span>`;
  $('locNow').querySelector('b').textContent = l.name + (l.region && !/^Custom/.test(l.region) ? ', ' + l.region : '');
  $('locNow').querySelector('.sub').textContent = latitudeHidden() ? 'latitude hidden during this lab' : `${fmtLat(l.lat)}  ${fmtLon(l.lon)}  ·  ${zoneLabel(state.timeMs, l.tz)}`;
  $('latIn').value = latitudeHidden() ? '' : l.lat; $('lonIn').value = latitudeHidden() ? '' : l.lon;
  fillCities();
}
function fillCities() {
  const list = $('cityList');
  const hits = findCities(cities, $('citySearch').value).slice(0, 60);
  list.innerHTML = hits.length && hits[0].near ? '<div class="hint" style="padding:6px 9px 2px;margin:0">Did you mean</div>' : '';
  for (const { c, i } of hits) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.i = i;
    b.append(c.name); const s = document.createElement('span'); s.textContent = c.region; b.appendChild(s);
    list.appendChild(b);
  }
  if (!hits.length) list.innerHTML = '<div class="hint" style="padding:8px 9px;margin:0">No match in the built-in list. Enter coordinates below.</div>';
}
function syncPlace() {
  const l = state.loc, b = $('placeBtn'), v = state.vantage;
  b.innerHTML = ICON.pin + '<span class="txt"></span><span class="sub"></span>';
  const the = (x) => (x === 'Sun' || x === 'Moon' ? 'the ' + x : x), ground = eff.onSurface, sf = state.surface;
  b.querySelector('.txt').textContent = v === 'Above' ? `${state.aboveAU} au above the Sun` : ground ? 'On ' + the(v) : v ? 'At ' + the(v) : l.name;
  b.querySelector('.sub').textContent = ground ? `${fmtLat(sf.lat)} ${fmtLon(sf.lon)}` : v ? 'in space' : latitudeHidden() ? '' : `${fmtLat(l.lat)} ${fmtLon(l.lon)}`;
  const sel = $('vantageSel'); if (sel && sel.value !== (v || '')) sel.value = v || '';
  const note = $('vantageNote');
  const ab = $('aboveRow'); if (ab) { ab.hidden = v !== 'Above'; $('aboveSel').value = String(state.aboveAU); }
  const sr = $('surfRow');
  if (sr) {
    sr.hidden = !SURFACES.includes(v); $('surfOn').checked = ground; $('surfWhere').hidden = !ground;
    if (ground) {
      const ss = sitesFor(v), k = ss.findIndex((s) => Math.abs(s[1] - sf.lat) < 1e-3 && Math.abs(s[2] - sf.lon) < 1e-3), sel = $('surfSite');
      const html = ss.map((s, i) => `<option value="${i}">${s[0]}</option>`).join('') + '<option value="-1">Somewhere else (below)</option>';
      if (sel.dataset.v !== v) { sel.innerHTML = html; sel.dataset.v = v; }
      sel.value = String(k); if (document.activeElement !== $('surfLat') && document.activeElement !== $('surfLon')) { $('surfLat').value = sf.lat; $('surfLon').value = sf.lon; }
    }
  }
  if (note && ground) { note.hidden = false; note.textContent = `You stand on ${the(v)}. ${v === 'Titan' ? 'Its thick orange haze is drawn (Settings: Atmosphere): a dim orange day, and at night only the brightest stars and planets, Saturn among them, get through.' : v === 'Mars' ? 'Its thin, dusty air is drawn (Settings: Atmosphere): butterscotch by day, a blue glow round the setting Sun, no stars by day.' : 'There is no air: the sky stays black by day and nothing twinkles.'} North is toward ${the(v)}\u2019s north pole; longitudes are east. Settings: Ground hides or shows the ground. The place below is used again when you go back to the Earth.`; }
  else if (note) { note.hidden = !v; note.textContent = v === 'Above' ? 'You float above the north pole of the ecliptic, looking down on the Sun. The lines are the orbits of the planets (Settings: Orbits). The planets are drawn at their true size: zoom in to see them.' : v ? `You float at the center of ${v === 'Sun' || v === 'Moon' ? 'the ' + v : v}, which is not drawn. No ground, no air: “up” is the north pole of the ecliptic. The place below is used again when you go back to the Earth.` : ''; }
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
    if (takesKeys(el, e)) return;
    if (document.querySelector('.modal-backdrop.show')) return;
    if (e.key === '?') { e.preventDefault(); $('mInfo').click(); return; }
    if (e.key === 'F3' || (e.key === '/' && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); search.focus(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    // a button reached with Tab keeps Space / Enter; one that was merely clicked does not (focus.js)
    if ((e.key === ' ' || e.key === 'Enter') && keyReached(el)) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    const t = byKey[k];
    if (t) { e.preventDefault(); runTool(t); return; }
    switch (k) {
      case ' ': e.preventDefault(); { const ref = state.selected || (state.tracking && state.trackRef); if (ref) centerOn(ref); } return;
      case 't': toggleTracking(); return;
      case 'j': slower(); return;
      case 'l': faster(); return;
      case 'k': setRate(1); return;
      case '7': togglePlay(); return;
      case '8': setNow(); return;
      case ']': stepTime(DAY); return;
      case '[': stepTime(-DAY); return;
      case '}': if (!stepHidden('+1 sid. d')) stepTime(SIDEREAL_DAY_MS); return;
      case '{': if (!stepHidden('+1 sid. d')) stepTime(-SIDEREAL_DAY_MS); return;
      case '>': stepTime(HOUR); return;
      case '<': stepTime(-HOUR); return;
    }
    if (navKey(e)) e.preventDefault();
  });
}

// ---------- read-out ----------
let lastRead = '';
function updateReadout(perf) {
  // Past the end of what can be supplied the internal limit keeps rising (it sets how large the stars are drawn), but no
  // fainter stars exist to show: the read-out then gives the catalogue's limit, not a magnitude nothing on screen has.
  // It also says where the faintest stars on screen come from: HYG, the bundled Gaia DR3 tiles, or Gaia DR3 fetched online.
  const lim = perf.limMag, online = netUsable();
  const catEnd = !deep.ready ? 9.5 : depthNow(), past = lim > catEnd + 0.2;
  let src;
  if (!deep.ready) src = past ? '<br>the star catalog ends here' : '';
  else if (past && !online) src = `<br><span class="ro-note">deep stars unavailable (${netWhy()}):<br>showing stars to mag ${catEnd.toFixed(1)}</span>`;
  else if (past) src = '<br>Gaia DR3 ends here';
  else if (lim > 12) src = `<br>faintest: ${deepSource(lim)}` + (deep.stats.netLoading ? ' · loading' : '');
  else src = lim > 7 ? '<br>faintest: Gaia DR3' : '<br>faintest: HYG';
  if (perf.sky && perf.sky.glare <= perf.sky.limWant && perf.sky.glare < catEnd) src = '<br>fainter stars are lost in the planet’s glare';
  const txt = `FOV <b>${fmtFov(cam.fov)}</b> · stars to mag <b>${(past ? catEnd : lim).toFixed(1)}</b>` + src +
    (state.mount === 'eq' ? '<br>equatorial mount' + (state.loc.lat < 0 && eff.ground && cam.fov > 15 ? ': celestial north is<br>up, so the zenith is not at the top' : '') : '');
  if (txt !== lastRead) { $('readout').innerHTML = txt; lastRead = txt; }
}

function syncAll() {
  syncToggles(); syncRate(); syncBortle(); syncPlace(); updateClock(true);
  $('lightTimeChk').checked = state.lightTime;
}
