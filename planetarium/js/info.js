// info.js: the selected-object panel (top left), modelled on Stellarium's info text.
// Every number shown is computed from the ephemeris or read from a catalogue; when a catalogue
// has no value the row says "no data".

import { A, DEG, RAD, AU_KM, LY_PER_PC, mod, mulMV, toSph, horToAzAlt, fmtRA, fmtDMS, fmtHA, fmtAngle, fmtMag } from './astro.js';
import { see } from './notebook/seeing.js';
import { state, on, emit, eff, toggle } from './state.js';
import { setTime } from './clock.js';
import { getFrame } from './skyframe.js';
import { getBodies, MOON_PARENT, SMALL, SURFACES } from './ephem.js';
import { landOn } from './ui.js';
import { starRecord, dso, dsoDoubt, constellations, DSO_TYPES, ASTROMETRY } from './catalog.js';
import { refEqj, refHorApparent, refKey } from './objects.js';
import { select, centerOn, toggleTracking } from './nav.js';
import { deepRecord, PROVIDER } from './deepstars.js';
import { fmtClock, wallParts } from './timeutil.js';
import { linksFor, loadLinks } from './links.js';
import { BODY_ART } from './bodydata.js';
import { bodyAxes, subPoint, figure, jupiterSystems, grsLongitude, nextGrsTransit } from './orient.js';
import { moonError } from './moons.js';
import { jpl, covered } from './jpl.js';
import { sun, initSun, groupsAt, onDisc, cycleFacts } from './sunspots.js';
import { openSunPanel } from './sunpanel.js';
import { rowHidden, running, groundStays } from './labs/hidden.js';
import { moonLight } from './labs/shadow.js';
import { counts as photoCounts } from './photometer.js';
import { VAR_BY_HIP, TYPE_NAME, varMag, jdOf, TRANSIENT, transientMag } from './variables.js';
import { smallWindow } from './layout.js';

let panel, partHtml = {}, lastUpdate = 0, events = null, eventsKey = '';
let trailing = null;
const pxPerDeg = () => (window.planetarium && window.planetarium.cam ? window.planetarium.cam.pxPerDeg : 1);
const perfFov = () => (window.planetarium && window.planetarium.cam ? window.planetarium.cam.fov : 90);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ND = '<span class="nodata">no data</span>';
const num = (v, dp, unit = '') => (v == null || !isFinite(v) ? ND : v.toFixed(dp) + unit);
/** A number to n significant figures, written out (3,480 rather than 3.48e+3). */
const sig = (v, n) => Number(v.toPrecision(n)).toLocaleString('en-US', { maximumSignificantDigits: n });

export function initInfo(el) {
  panel = el;
  on('selection', () => render(true));
  on('gaia-info', () => render(true));          // the online look-up of a clicked Gaia star has answered
  on('frame', () => render(false));
  on('links', () => render(true));
  loadLinks();
  initSheet();
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') select(null);
    else if (act === 'grip') { if (performance.now() - openedAt > 350) setSheet(!mini); }
    else if (act === 'center') centerOn(state.selected);
    else if (act === 'zoom') centerOn(state.selected, true);
    else if (act === 'track') toggleTracking();
    else if (act === 'land') landOn(b.dataset.id);
    else if (act === 'noground') { toggle('ground', false); centerOn(state.selected); }
    else if (act === 'whenup') { const u = upNext(state.selected); if (u) { setTime(u.go); centerOn(state.selected); } }
    else if (act === 'sunpanel') openSunPanel();
    else if (act === 'parent') { select({ kind: 'body', id: b.dataset.id }); }
  });
}

// ---- the short form -------------------------------------------------------------
// On a small screen (layout.js smallWindow) the panel opens short: name, type, the key rows, the buttons. The grip at its top, a tap on the name or a
// drag upward shows everything; a drag downward shortens it again and then puts it away, as × does. The choice is remembered on the device.
const SHEET_KEY = 'astro-labs.planetarium.sheet';
let mini = true, openedAt = -1e9;
const isSheet = () => window.innerWidth <= 560;
function setSheet(m) { mini = m; try { localStorage.setItem(SHEET_KEY, m ? 'short' : 'full'); } catch (e) { /* fine */ } if (m) panel.scrollTop = 0; syncSheet(); emit('render'); }
function syncSheet() {
  const small = smallWindow();
  panel.classList.toggle('small', small); panel.classList.toggle('mini', small && mini);
  const g = panel.querySelector('.ip-grip');
  if (g) { const t = mini ? 'Show everything' : 'Show less'; g.setAttribute('aria-expanded', String(!mini)); g.setAttribute('aria-label', t); g.querySelector('span').textContent = mini ? 'More' : 'Less'; }
}
function initSheet() {
  try { mini = localStorage.getItem(SHEET_KEY) !== 'full'; } catch (e) { /* storage unavailable: short */ }
  syncSheet();
  window.addEventListener('resize', syncSheet);
  let d = null;
  panel.addEventListener('pointerdown', (e) => {
    d = null;
    if (!panel.classList.contains('small') || (e.pointerType === 'mouse' && e.button) || e.target.closest('a, .close, .ip-acts')) return;
    // in the long form the list scrolls: there only the grip and the title drag
    if (!mini && !e.target.closest('.ip-grip, h2, .type, .aka')) return;
    d = { id: e.pointerId, y: e.clientY, dy: 0, moved: false };
  });
  window.addEventListener('pointermove', (e) => {
    if (!d || e.pointerId !== d.id) return;
    d.dy = e.clientY - d.y;
    if (!d.moved && Math.abs(d.dy) > 8) d.moved = true;
    if (d.moved && isSheet()) panel.style.transform = `translateY(${Math.max(-24, d.dy)}px)`;
  });
  const end = (e) => {
    if (!d || e.pointerId !== d.id) return;
    const { dy, moved } = d; d = null;
    panel.style.transform = '';
    if (!moved) return;
    eatClick = performance.now();                       // the click that ends a drag presses nothing
    if (e.type === 'pointercancel') return;
    if (isSheet()) { if (dy < -24 && mini) setSheet(false); else if (dy > 30) { if (mini) select(null); else setSheet(true); } }
    else if (dy > 24 && mini) setSheet(false); else if (dy < -24 && !mini) setSheet(true);
  };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  let eatClick = -1e9;
  panel.addEventListener('click', (e) => {
    if (performance.now() - eatClick < 60) { e.stopPropagation(); e.preventDefault(); return; }
    if (panel.classList.contains('small') && !document.documentElement.classList.contains('nb-lab') && e.target.closest('h2') && performance.now() - openedAt > 350) setSheet(!mini);
  }, true);
}

/** What is known about the spots on the date: plainly recorded, statistical, or typical. */
function sunRows(b, row, e) {
  initSun();
  const tt = b.ttSeen, f = cycleFacts(tt), { kind, list } = groupsAt(tt);
  if (list) {
    const L = onDisc(list, e.lon, e.lat), k = kind === 'recorded' ? 'recorded groups' : kind === 'statistical' ? 'statistical, from the sunspot number: not real groups' : 'typical cycle, no record: not real groups';
    const src = kind === 'recorded' ? (tt < -8400 ? 'Royal Greenwich Observatory' : 'USAF/NOAA') : f.basis === 'forecast' ? 'forecast' : f.basis === 'monthly' ? 'monthly number' : f.basis === 'yearly' ? 'yearly number' : f.basis === 'group' ? 'yearly group number' : 'average cycle';
    row('Sunspots', `<b>${k}</b> (${src})`);
    const A = L.reduce((s, g) => s + g.rec, 0), day = Math.floor(tt + 0.5), gap = kind === 'recorded' && sun.numbers.missSet.has(day);
    row('On the disc', L.length ? `${L.length} group${L.length > 1 ? 's' : ''}, ${Math.round(A).toLocaleString('en-US')} millionths of a hemisphere` : 'no spots');
    if (gap) row('That day', '<span class="nodata">no observation: interpolated</span>');
  }
  row('Sunspot number', `about ${Math.round(f.sn)} (${f.basis === 'monthly' ? 'monthly, smoothed' : f.basis === 'yearly' ? 'yearly mean' : f.basis === 'group' ? 'from the group number' : f.basis === 'forecast' ? 'forecast' : 'average cycle'})`);
  row('Cycle', (f.number ? f.number + ', ' : '') + f.phase + `, ${f.since.toFixed(1)} yr after minimum` + (f.maunder ? ' (Maunder Minimum)' : ''));
  row('', '<button class="btn" style="padding:2px 9px;font-size:12px" data-act="sunpanel">Butterfly diagram</button>');
}
/** Rows about which side of a body we see, from its rotation (orient.js). */
function faceRows(b, row, frame) {
  const ax = bodyAxes(b.id, b.ttSeen ?? frame.time.tt); if (!ax) return;
  const toUs = [-b.u[0], -b.u[1], -b.u[2]], fig = figure(b.id), e = subPoint(ax, toUs, fig);
  const sgn = (v, n = 1) => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(n) + '°';
  const j = toSph(b.u), E = [-Math.sin(j.lon * DEG), Math.cos(j.lon * DEG), 0], N = [-Math.sin(j.lat * DEG) * Math.cos(j.lon * DEG), -Math.sin(j.lat * DEG) * Math.sin(j.lon * DEG), Math.cos(j.lat * DEG)];
  const pa = mod(Math.atan2(ax.z[0] * E[0] + ax.z[1] * E[1], ax.z[0] * N[0] + ax.z[1] * N[1] + ax.z[2] * N[2]) * RAD, 360);
  if (b.id === 'Sun') {
    // the Sun's axis is given against the true north of date
    row('Center of the disc', 'L<sub>0</sub> ' + e.lon.toFixed(1) + '°, B<sub>0</sub> ' + sgn(e.lat)); row('Axis', 'P ' + sgn(pa > 180 ? pa - 360 : pa));
    if (state.show.sunspots && !running.id) sunRows(b, row, e);
    return;
  }
  if (b.id === 'Moon') row('Libration', 'longitude ' + sgn(e.lon > 180 ? e.lon - 360 : e.lon) + ', latitude ' + sgn(e.lat));
  else if (b.id === 'Jupiter') { const s = jupiterSystems(e.lon, b.ttSeen); row('Central meridian', `I ${s.I.toFixed(1)}°&ensp;II ${s.II.toFixed(1)}°&ensp;III ${s.III.toFixed(1)}°`); }
  else row('Central meridian', e.lon.toFixed(1) + '° E (' + mod(360 - e.lon, 360).toFixed(1) + '° W)');
  if (b.id !== 'Moon' && b.id !== 'Saturn') row('Tilt toward us', sgn(e.lat) + (e.lat >= 0 ? ' (north' : ' (south') + ' side toward us)');
  if (b.toSun) { const s = subPoint(ax, b.toSun, fig); if (b.kind !== 'satellite' && b.id !== 'Moon') row('Sun overhead', 'latitude ' + sgn(s.lat) + (b.polarKm ? ' (planetocentric)' : '')); }
  row('Axis', 'position angle ' + pa.toFixed(1) + '°');
  if (b.id === 'Jupiter') {
    const g = grsLongitude(b.ttSeen), tau = b.lightMin / 1440, now = jupiterSystems(e.lon, b.ttSeen).II, tt = frame.time.tt;
    const t = nextGrsTransit(tt, (x) => now + 870.27 * (x - tt), state.lightTime ? tau : 0);
    const min = Math.round(g.sigma * 1.66);
    row('Great Red Spot', `System II ${g.lon.toFixed(0)}° ± ${g.sigma.toFixed(0)}°` + (g.ok ? '' : ' <span class="nodata">(unreliable for this date)</span>'));
    row('Spot crosses center', g.ok ? fmtClock(frame.timeMs + (t - tt) * 86400000, state.loc.tz) + ` ± ${min} min` : '<span class="nodata">no reliable drift for this date</span>');
  }
}
/** Rise, transit and set of the pass that contains (or is nearest to) the current instant. */
function riseTransitSet(ref, frame, eqjUnit) {
  const key = jpl.version + refKey(ref) + '|' + Math.round(frame.timeMs / 300000) + '|' + frame.loc.lat + '|' + frame.loc.lon;
  if (key === eventsKey) return events;
  eventsKey = key; events = null;
  try {
    let body;
    if (ref.kind === 'body') body = MOON_PARENT[ref.id] || ref.id;
    else {
      const s = toSph(eqjUnit);
      A.DefineStar(A.Body.Star1, s.lon / 15, s.lat, 1000);
      body = A.Body.Star1;
    }
    const start = frame.time.AddDays(-0.5);
    const tr = A.SearchHourAngle(body, frame.obs, 0, start, +1);
    const up = tr.hor.altitude;
    const rise = A.SearchRiseSet(body, frame.obs, +1, tr.time, -1);
    const set = A.SearchRiseSet(body, frame.obs, -1, tr.time, +1);
    events = { transit: tr.time.date.getTime(), transitAlt: up, rise: rise ? rise.date.getTime() : null, set: set ? set.date.getTime() : null };
  } catch (e) { events = null; }
  return events;
}

// ---- behind the ground --------------------------------------------------------------------
let upKey = '', up = null;
/** For something below the horizon: {rise (ms), go: 90 minutes later, or the highest point if that comes first}; null when it never rises here. */
function upNext(ref) {
  const frame = getFrame(), key = jpl.version + refKey(ref) + '|' + frame.loc.lat + '|' + frame.loc.lon;
  if (key === upKey && up && up.rise > frame.timeMs && up.asked <= frame.timeMs && up.rise - frame.timeMs < 1.05 * 86400000) return up;
  if (key === upKey && !up && Math.abs(upNext.at - frame.timeMs) < 1800000) return null;
  upKey = key; up = null; upNext.at = frame.timeMs;
  try {
    let body = ref.kind === 'body' ? MOON_PARENT[ref.id] || ref.id : null;
    if (!body || !A.Body[body] || body === 'Earth') { const s = toSph(refEqj(ref, frame, getBodies(frame))); A.DefineStar(A.Body.Star1, s.lon / 15, s.lat, 1000); body = A.Body.Star1; }
    const rise = A.SearchRiseSet(body, frame.obs, +1, frame.time, 2);
    if (!rise) return null;
    const tr = A.SearchHourAngle(body, frame.obs, 0, rise, +1), r = rise.date.getTime();
    up = { rise: r, go: Math.min(r + 90 * 60000, tr.time.date.getTime()), asked: frame.timeMs };
  } catch (e) { up = null; }
  return up;
}
const dayWord = (ms, tz) => { const a = wallParts(getFrame().timeMs, tz), b = wallParts(ms, tz); return a.day === b.day && a.month === b.month ? '' : 'tomorrow '; };
/** The line "Jupiter is below the horizon (rises 23:26)" with its buttons, or ''. */
function belowHtml(ref, name, alt, tz) {
  if (!eff.ground || alt > -0.02 || ref.kind === 'con' || groundStays()) return '';      // (a lab about the horizon keeps it)
  const u = upNext(ref), secret = rowHidden('Rise / Set') || rowHidden('Transit') || rowHidden('Hour angle'), t = (ms) => dayWord(ms, tz) + fmtClock(ms, tz);
  return `<div class="below"><span><b>${esc(name)}</b> is below the horizon${secret ? '' : u ? ` (rises ${t(u.rise)})` : ' and never rises here'}. The ground hides it.</span>` +
    `<div class="below-acts"><button class="btn" data-act="noground">Hide the ground</button>${u && !running.id ? `<button class="btn" data-act="whenup" title="Set the clock to ${t(u.go)}, when it is up">Go to ${fmtClock(u.go, tz)}</button>` : ''}</div></div>`;
}
function moonPhaseName(elong) {
  const names = ['New Moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full Moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  const e = mod(elong, 360);
  if (e < 6 || e > 354) return names[0];
  if (Math.abs(e - 90) < 6) return names[2];
  if (Math.abs(e - 180) < 6) return names[4];
  if (Math.abs(e - 270) < 6) return names[6];
  return names[e < 90 ? 1 : e < 180 ? 3 : e < 270 ? 5 : 7];
}

function render(force) {
  const ref = state.selected;
  if (!ref) { if (!panel.hidden) { panel.hidden = true; panel.innerHTML = ''; panel.style.transform = ''; } return; }
  const now = performance.now();
  if (!force && now - lastUpdate < 240) {
    // throttled: make sure the panel still catches up with the last frame (a single time step must not leave stale numbers)
    if (!trailing) trailing = setTimeout(() => { trailing = null; render(true); }, 250);
    return;
  }
  lastUpdate = now;
  const frame = getFrame(), bodies = getBodies(frame);
  const eqj = refEqj(ref, frame, bodies);
  if (!eqj) return;
  const tz = state.loc.tz;
  let title = '', aka = '', type = '', note = '', pic = '';
  const rows = [];
  const row = (k, v) => rows.push(`<tr${/^(Magnitude|Distance|Az \/ Alt|Rise)/.test(k) ? ` class="key${k[0] === 'R' ? ' rise' : ''}"` : ''}><td>${k}</td><td>${rowHidden(k) ? '<span class="nodata">hidden during this lab</span>' : v}</td></tr>`);      // labs/hidden.js: what the lab asks for
  const sep = () => rows.push('<tr class="sep"><td></td><td></td></tr>');

  if (ref.kind === 'star') {
    const s = starRecord(ref.k, ref.i);
    const ids = [s.bayer, s.flam, s.hip ? 'HIP ' + s.hip : null, s.hd ? 'HD ' + s.hd : null].filter(Boolean);
    title = s.name || ids.shift() || 'Star';
    aka = ids.join(' · ');
    type = 'Star';
    const vr = VAR_BY_HIP.get(s.hip);
    if (vr) {      // a Cepheid or RR Lyrae star: its brightness now from the catalog's elements (js/variables.js), and the elements themselves
      type = TYPE_NAME[vr.type];
      row('Magnitude now', vr.quiet ? fmtMag(s.mag) + ' (V; varies by a few hundredths)' : fmtMag(varMag(vr, jdOf(state.timeMs))) + ' (V, a model)');
      row('Variable', `V ${vr.max.toFixed(2)} to ${vr.min.toFixed(2)}, period ${vr.P} days (GCVS)`);
    } else row('Magnitude', fmtMag(s.mag) + ' (V)');
    row('Color index', s.bv == null ? ND : s.bv.toFixed(2) + ' (B−V)');
    row('Distance', s.dist ? `${sig(s.dist * LY_PER_PC, 3)} ly (${sig(s.dist, 3)} pc)` : ND);
    // where the place and proper motion come from (tools/build_stars.py); everything else is HYG's
    if (s.src != null && ASTROMETRY[s.src]) note = 'Position and proper motion: ' + ASTROMETRY[s.src] + '.';
    if (vr) note = (vr.quiet ? 'Polaris is a Cepheid whose swing has shrunk to a few hundredths of a magnitude; it is drawn steady. ' : 'Its brightness here is a <b>model</b>, not a measurement: a smooth curve through the catalog’s maximum, minimum, period, date of maximum and rise time (General Catalogue of Variable Stars). Real curves have bumps this one lacks, and the phase today can be off by part of a cycle. ') + (note || '');
  } else if (ref.kind === 'gaia') {
    // a star of the Gaia DR3 layers: every number is Gaia's own (the tile's rounded copy until the full record arrives)
    const s = deepRecord(ref);
    title = s.id ? 'Gaia DR3 ' + s.id : 'Gaia DR3 star'; type = 'Star';
    const r = s.rounded;
    row('Magnitude', s.mag.toFixed(r ? 2 : 3) + ' (Gaia G)');
    row('Color index', s.col == null ? ND : s.col.toFixed(r ? 2 : 3) + ' (G<sub>BP</sub>−G<sub>RP</sub>)');
    if (s.plx == null) { row('Parallax', ND); row('Distance', ND); } else {
      row('Parallax', s.plx.toFixed(r ? 1 : 3) + (s.plxErr != null ? ' ± ' + s.plxErr.toFixed(3) : '') + ' mas');
      // a distance only where the parallax is worth inverting: at least 5 times its error (or, from the rounded tile value, at least 1 mas)
      const good = s.plx > 0 && (s.plxErr != null ? s.plx >= 5 * s.plxErr : s.plx >= 1);
      const pc = 1000 / s.plx;
      row('Distance', good ? `${sig(pc * LY_PER_PC, r ? 2 : 3)} ly (${sig(pc, r ? 2 : 3)} pc), from 1 / parallax` : '<span class="nodata">parallax too uncertain</span>');
    }
    row('Proper motion', s.pmra == null || s.pmdec == null ? ND : `${Math.hypot(s.pmra, s.pmdec).toFixed(r ? 0 : 2)} mas/yr (RA ${s.pmra.toFixed(r ? 0 : 2)}, Dec ${s.pmdec.toFixed(r ? 0 : 2)})`);
    if (s.rv != null) row('Radial velocity', s.rv.toFixed(1) + ' km/s');
    note = 'Gaia DR3 (ESA/Gaia/DPAC), ' + (s.src === 'online' ? `fetched from ${PROVIDER.short} for this field. ` : s.src === 'hosted' ? 'from the deep star tiles (G 12 to 17). ' : 'from the bundled catalog. ') +
      (s.exact ? `Full record from ${PROVIDER.short}.` : s.lookup === 'pending' ? 'Looking up the full record…' :
        s.lookup === 'none' ? 'The online look-up found no matching source; values are the catalog tile’s, rounded.' :
        s.src === 'online' ? '' : 'Values rounded as stored in the tile; the source number and exact values need the online look-up' + (s.lookup === 'failed' ? ', which did not answer.' : s.lookup === 'off' ? ', which is off or unavailable.' : '.'));
  } else if (ref.kind === 'body') {
    const b = bodies.byId[ref.id];
    title = b.name;
    if (b.kind === 'sun') type = 'Star';
    else if (b.kind === 'moon') type = "Earth's moon";
    else if (b.kind === 'satellite') type = `Moon of <button class="btn" style="padding:1px 7px;font-size:11.5px" data-act="parent" data-id="${b.parent}">${b.parent}</button>`;
    else type = b.kind === 'dwarf' ? 'Dwarf planet' : b.kind === 'asteroid' ? 'Asteroid' : b.kind === 'comet' ? 'Comet' : 'Planet';
    { const f = b.id === 'Moon' ? moonLight(frame, b) : 1; row('Magnitude', f > 0.9995 ? fmtMag(b.mag) : (f < 1e-3 ? 'about ' : '') + fmtMag(b.mag - 2.5 * Math.log10(f), f < 1e-3 ? 0 : 1) + ' (in the Earth’s shadow)'); }
    if (b.kind === 'moon' || (state.vantage && b.dist < 0.02)) row('Distance', Math.round(b.dist * AU_KM).toLocaleString('en-US') + ' km');
    else row('Distance', b.dist.toFixed(b.dist < 2 ? 4 : 3) + ' au');
    if (b.kind !== 'satellite') row('Angular diameter', fmtAngle(2 * b.angRadius));
    else { row('From ' + b.parent, fmtAngle(b.sepDeg) + (b.occulted ? ' (behind the disc)' : b.light < 0.5 ? ' (in the planet’s shadow)' : b.transit ? ' (in front of the disc)' : b.behind ? ' (far side)' : ' (near side)')); row('Angular diameter', fmtAngle(2 * b.angRadius)); }
    if (b.kind !== 'sun') {
      row('Illuminated', (b.phaseFrac * 100).toFixed(b.kind === 'moon' ? 2 : 1) + '%' + (b.kind === 'moon' && !state.vantage ? ' · ' + moonPhaseName(A.MoonPhase(frame.time)) : ''));
      if (b.kind !== 'satellite' && state.vantage !== 'Sun') row('Elongation', b.elong.toFixed(1) + '° from the Sun');
    }
    if (b.id === 'Saturn') row('Ring tilt', (b.ringTilt >= 0 ? '+' : '−') + Math.abs(b.ringTilt).toFixed(1) + '° (' + (b.ringTilt >= 0 ? 'north' : 'south') + ' face toward us)');
    const lt = b.lightMin;
    row('Light time', lt >= 1 ? lt.toFixed(1) + ' min' : (lt * 60).toFixed(2) + ' s');
    if (b.shiftDeg != null) row('Seen vs. actual', fmtAngle(b.shiftDeg) + (state.lightTime ? '' : ' (showing actual)'));
    faceRows(b, row, frame);
    if (b.kind === 'satellite') {
      const km = moonError(b.id);
      if (km != null) {
        const as = km / AU_KM / b.dist * 206265;
        if (b.inSpan === false) note = 'Outside 1950 to 2100 this moon’s place is an extrapolation and not reliable.';
        else if (as > 0.3) note = `Position from a fit to JPL Horizons for 1950 to 2100: can be ${as < 2 ? as.toFixed(1) : Math.round(as)}″ (${Math.round(km).toLocaleString('en-US')} km) from its true place.`;
      }
    }
    const art = BODY_ART[b.id];
    if (art) { if (art.note && !(b.id === 'Sun' && (!state.show.sunspots || running.id))) note += (note ? ' ' : '') + art.note + (b.id === 'Sun' ? ' Each group is drawn with an SDO/HMI photograph of a real group of about the recorded area, not of that very group; its place and size are the record’s.' : ''); pic = art.credit; }
    else if (b.kind === 'comet') note += 'Magnitude: the whole comet, from JPL’s parameters, very uncertain. Its nucleus (about 15 × 8 km, photographed by Giotto in 1986) is far too small to see, and no tail is drawn.';
    else if (SMALL.some((x) => x.id === b.id) && b.kind === 'dwarf') note += 'Never imaged as more than a point or a few blurred pixels: drawn as a plain disc of its measured size' + (b.id === 'Haumea' ? ' (an ellipsoid 2,322 × 1,704 × 1,026 km; which way it is turned is not modelled).' : '.');
    if (b.kind === 'satellite') note += (note ? ' ' : '') + 'Magnitude ignores the phase and any eclipse by the planet’s shadow.' + (b.transit && b.angRadius * pxPerDeg() < 1.6 ? ' The dot on the disc is larger than the moon would look at this scale, so that it can be followed.' : '');
  } else if (ref.kind === 'dso') {
    const o = dso.rows[ref.idx];
    const ids = [];
    if (o.m) ids.push('M ' + o.m);
    if (o.c) ids.push('Caldwell ' + o.c);
    if (!/^(C|M|Mel|B)\d/.test(o.id) || !(o.m || o.c)) ids.push(o.id);
    title = (o.names && o.names[0]) || ids[0];
    aka = ids.filter((x) => x !== title).concat((o.names || []).slice(1)).join(' · ');
    type = (DSO_TYPES[o.type] || o.type) + (o.hubble ? ' · Hubble type ' + esc(o.hubble) : '');
    const doubt = dsoDoubt(o);
    row('Magnitude', (o.vmag != null ? fmtMag(o.vmag) + ' (V)' : o.bmag != null ? fmtMag(o.bmag) + ' (B)' : ND) + (doubt ? ' <span class="nodata">doubtful</span>' : ''));
    row('Size', o.maj != null ? (o.min != null ? `${o.maj}′ × ${o.min}′` : `${o.maj}′`) : ND);
    row('Surface brightness', o.sb != null ? o.sb.toFixed(2) + ' mag/arcsec²' : ND);
    row('Redshift z', o.z != null ? o.z.toFixed(6) : ND);
    if (o.z != null) row('c × z', Math.round(o.z * 299792.458).toLocaleString('en-US').replace('-', '−') + ' km/s');
    row('Radial velocity', o.rv != null ? Math.round(o.rv).toLocaleString('en-US') + ' km/s' : ND);
    note = 'Catalog values from OpenNGC. No distance is listed there.';
    if (doubt) note += ' <b>Doubtful magnitude:</b> ' + doubt;
    if (o.rv != null && o.z != null && Math.abs(o.rv - o.z * 299792.458) >= 2) note += ' Two velocities: c × z is the one used for Hubble’s law; the catalog’s own “radial velocity” is worked out from the same redshift with the relativistic Doppler formula, which gives a little less.';
  } else if (ref.kind === 'tr') {
    // a supernova or M31 V1 (js/variables.js): a model built on published numbers
    const o = TRANSIENT[ref.id], m = transientMag(o, jdOf(state.timeMs));
    title = o.name; aka = o.aka || ''; type = o.kind === 'sn' ? 'Supernova' : 'Cepheid variable star';
    if (o.kind === 'sn') row('Type', 'Type ' + o.type);
    row('Magnitude now', m == null ? '<span class="nodata">nothing to see at this date</span>' : fmtMag(m) + ' (V, a model)');
    if (o.kind === 'cepheid') row('Variable', `period ${o.P} days (Templeton et al. 2011)`);
    row('In', o.host);
    note = (rowHidden('Magnitude now') ? 'Its brightness here is a model built on published numbers (position, period, dates), not the measurements themselves.' : o.kind === 'sn' && rowHidden('Type') ? 'The supernova’s brightness here is a model built on published dates and magnitudes, not the measurements themselves.' : o.src + ' The brightness drawn is a <b>model</b> built on these numbers, not the measurements themselves.');
  } else if (ref.kind === 'con') {
    const c = constellations.find((x) => x.id === ref.id);
    title = c.name; type = 'Constellation'; aka = `${c.id} · genitive ${c.gen}`;
  }

  // the standard-candle labs: what the photometer collects from it in one exposure (js/photometer.js)
  if (running.photometer && ref.kind !== 'con' && ref.kind !== 'dso') { const n = photoCounts(ref, getBodies(getFrame())); if (n != null) row('Photometer', n.toLocaleString('en-US') + ' counts (one exposure)'); }

  // --- where it is ---
  const j = toSph(eqj), d = toSph(mulMV(frame.Mjd, eqj));
  const hApp = refHorApparent(ref, frame, bodies), aa = horToAzAlt(hApp);
  sep();
  // zoomed far in (labs: aberration, parallax, proper motion) the coordinates are given to 0.01 arcsec
  // (not while a notebook lab simulates measurement noise: the catalogue place to 0.01 arcsec would be an answer key beside the noisy image)
  const fine = perfFov() < 0.5 && !(see.enabled && see.noise > 0), raDp = fine ? 3 : 1, decDp = fine ? 2 : 0;
  row('<span title="J2000 axes, as seen now: proper motion, aberration and parallax are included when switched on (Labs, Corrections), so it can differ from a catalog by up to about 20 arcseconds">RA / Dec (J2000)</span>', fmtRA(j.lon, raDp) + '&ensp;' + fmtDMS(j.lat, { dp: decDp }));
  row('RA / Dec (of date)', fmtRA(d.lon, raDp) + '&ensp;' + fmtDMS(d.lat, { dp: decDp }));
  { const ecl = toSph(mulMV(frame.Mjt, eqj)); row('Ecliptic lon / lat', ecl.lon.toFixed(fine ? 4 : 2) + '°&ensp;' + (ecl.lat >= 0 ? '+' : '−') + Math.abs(ecl.lat).toFixed(fine ? 4 : 2) + '° (of date)'); }
  if (!eff.space) {      // (in space there is no horizon to measure from; standing on another body there is, but no Earth sidereal time)
    row('Az / Alt', fmtDMS(aa.az, { sign: false }) + '&ensp;' + fmtDMS(aa.alt) + (eff.refraction || state.vantage ? '' : ' (no refraction)'));
  }
  if (!state.vantage) {
    row('Hour angle', fmtHA(mod(frame.lst - d.lon / 15 + 12, 24) - 12));
  }
  if (ref.kind !== 'con') {
    const ev = state.vantage ? null : riseTransitSet(ref, frame, eqj);
    if (ev) {
      const t = (ms) => (ms == null ? '—' : fmtClock(ms, tz));
      if (ev.rise == null && ev.set == null) row('Rise / Set', ev.transitAlt > 0 ? 'circumpolar (always up)' : 'never rises here');
      else row('Rise / Set', t(ev.rise) + ' / ' + t(ev.set));
      row('Transit', t(ev.transit) + ' at ' + ev.transitAlt.toFixed(1) + '°');
    }
    try { const c = A.Constellation(j.lon / 15, j.lat); if (ref.kind !== 'con') row('Constellation', esc(c.name)); } catch (e) { /* ignore */ }
  }

  const head = `<h2>${esc(title)}</h2>` +
    (aka ? `<div class="aka">${esc(aka)}</div>` : '') + `<div class="type">${type}</div>`;
  const trk = state.tracking && refKey(state.trackRef) === refKey(ref);
  const acts = `<div class="acts"><button class="btn" data-act="center" title="Center the view on it (Space)">Center <kbd>Space</kbd></button>` +
    `<button class="btn${trk ? ' on' : ''}" data-act="track" aria-pressed="${trk}" title="Keep it centered as time runs (T)">Track <kbd>T</kbd></button>` +
    `<button class="btn" data-act="zoom" title="Center it and set the field that frames it">Zoom to</button>` +
    (ref.kind === 'body' && SURFACES.includes(ref.id) && !running.id ?      /* (not in a lab: it would leave the lab's own setup) */ `<button class="btn" data-act="land" data-id="${ref.id}" title="Stand on its surface (as in the settings: where you are)">Land on it</button>` : '') + '</div>';
  const ls = rowHidden('Parallax') ? [] : linksFor(ref);      // a lab that hides the parallax does not link to it either
  const look = ls.length ? `<div class="look"><span>Look it up</span>${ls.map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener" title="${esc(l.title)}">${esc(l.label)}</a>`).join('')}</div>` : '';
  const html = head + `<table>${rows.join('')}</table>` + (note ? `<div class="note">${note}</div>` : '') + (pic ? `<div class="note">Picture: ${pic}.</div>` : '');
  // The numbers change several times a second, the buttons and links hardly ever: they live in boxes of their own, each touched
  // only when it changes. (A button replaced between press and release never gets its click.)
  if (!panel.querySelector('.ip-main')) { panel.innerHTML = '<button class="ip-grip" type="button" data-act="grip"><i></i><span></span></button><button class="close" data-act="close" aria-label="Deselect">&times;</button><div class="ip-below"></div><div class="ip-main"></div><div class="ip-look"></div><div class="ip-acts"></div>'; partHtml = {}; syncSheet(); }
  for (const [k, h] of [['below', belowHtml(ref, title, aa.alt, tz)], ['main', html], ['look', look], ['acts', acts]]) {
    if (partHtml[k] === h) continue;
    partHtml[k] = h;
    const box = panel.querySelector('.ip-' + k), keepFocus = box.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    box.innerHTML = h;
    if (keepFocus) { const b = box.querySelector(`[data-act="${keepFocus}"]`); if (b) b.focus(); }
  }
  if (panel.hidden) openedAt = performance.now();
  panel.hidden = false;
}
export { DEG, RAD, emit };
