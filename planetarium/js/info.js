// info.js: the selected-object panel (top left), modelled on Stellarium's info text.
// Every number shown is computed from the ephemeris or read from a catalogue; when a catalogue
// has no value the row says "no data".

import { A, DEG, RAD, AU_KM, LY_PER_PC, mod, mulMV, toSph, horToAzAlt, fmtRA, fmtDMS, fmtHA, fmtAngle, fmtMag } from './astro.js';
import { state, on, emit } from './state.js';
import { getFrame } from './skyframe.js';
import { getBodies, MOON_PARENT } from './ephem.js';
import { starRecord, dso, constellations, DSO_TYPES } from './catalog.js';
import { refEqj, refHorApparent, refKey } from './objects.js';
import { select, centerOn, toggleTracking } from './nav.js';
import { deepRecord, PROVIDER } from './deepstars.js';
import { fmtClock } from './timeutil.js';

let panel, lastHtmlKey = '', lastUpdate = 0, events = null, eventsKey = '';
let trailing = null;
const perfFov = () => (window.planetarium && window.planetarium.cam ? window.planetarium.cam.fov : 90);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const ND = '<span class="nodata">no data</span>';
const num = (v, dp, unit = '') => (v == null || !isFinite(v) ? ND : v.toFixed(dp) + unit);
/** A number to n significant figures, written out (3,480 rather than 3.48e+3). */
const sig = (v, n) => Number(v.toPrecision(n)).toLocaleString('en-US', { maximumSignificantDigits: n });

export function initInfo(el) {
  panel = el;
  on('selection', () => { lastHtmlKey = ''; render(true); });
  on('gaia-info', () => render(true));          // the online look-up of a clicked Gaia star has answered
  on('frame', () => render(false));
  panel.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'close') select(null);
    else if (act === 'center') centerOn(state.selected);
    else if (act === 'zoom') centerOn(state.selected, true);
    else if (act === 'track') toggleTracking();
    else if (act === 'parent') { select({ kind: 'body', id: b.dataset.id }); }
  });
}

/** Rise, transit and set of the pass that contains (or is nearest to) the current instant. */
function riseTransitSet(ref, frame, eqjUnit) {
  const key = refKey(ref) + '|' + Math.round(frame.timeMs / 300000) + '|' + frame.loc.lat + '|' + frame.loc.lon;
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
  if (!ref) { if (!panel.hidden) { panel.hidden = true; panel.innerHTML = ''; } return; }
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
  let title = '', aka = '', type = '', note = '';
  const rows = [];
  const row = (k, v) => rows.push(`<tr><td>${k}</td><td>${v}</td></tr>`);
  const sep = () => rows.push('<tr class="sep"><td></td><td></td></tr>');

  if (ref.kind === 'star') {
    const s = starRecord(ref.k, ref.i);
    const ids = [s.bayer, s.flam, s.hip ? 'HIP ' + s.hip : null, s.hd ? 'HD ' + s.hd : null].filter(Boolean);
    title = s.name || ids.shift() || 'Star';
    aka = ids.join(' · ');
    type = 'Star';
    row('Magnitude', fmtMag(s.mag) + ' (V)');
    row('Colour index', s.bv == null ? ND : s.bv.toFixed(2) + ' (B−V)');
    row('Distance', s.dist ? `${sig(s.dist * LY_PER_PC, 3)} ly (${sig(s.dist, 3)} pc)` : ND);
  } else if (ref.kind === 'gaia') {
    // a star of the Gaia DR3 layers: every number is Gaia's own (the tile's rounded copy until the full record arrives)
    const s = deepRecord(ref);
    title = s.id ? 'Gaia DR3 ' + s.id : 'Gaia DR3 star'; type = 'Star';
    const r = s.rounded;
    row('Magnitude', s.mag.toFixed(r ? 2 : 3) + ' (Gaia G)');
    row('Colour index', s.col == null ? ND : s.col.toFixed(r ? 2 : 3) + ' (G<sub>BP</sub>−G<sub>RP</sub>)');
    if (s.plx == null) { row('Parallax', ND); row('Distance', ND); } else {
      row('Parallax', s.plx.toFixed(r ? 1 : 3) + (s.plxErr != null ? ' ± ' + s.plxErr.toFixed(3) : '') + ' mas');
      // a distance only where the parallax is worth inverting: at least 5 times its error (or, from the rounded tile value, at least 1 mas)
      const good = s.plx > 0 && (s.plxErr != null ? s.plx >= 5 * s.plxErr : s.plx >= 1);
      const pc = 1000 / s.plx;
      row('Distance', good ? `${sig(pc * LY_PER_PC, r ? 2 : 3)} ly (${sig(pc, r ? 2 : 3)} pc), from 1 / parallax` : '<span class="nodata">parallax too uncertain</span>');
    }
    row('Proper motion', s.pmra == null || s.pmdec == null ? ND : `${Math.hypot(s.pmra, s.pmdec).toFixed(r ? 0 : 2)} mas/yr (RA ${s.pmra.toFixed(r ? 0 : 2)}, Dec ${s.pmdec.toFixed(r ? 0 : 2)})`);
    if (s.rv != null) row('Radial velocity', s.rv.toFixed(1) + ' km/s');
    note = 'Gaia DR3 (ESA/Gaia/DPAC), ' + (s.src === 'online' ? `fetched from ${PROVIDER.short} for this field. ` : 'from the bundled catalogue. ') +
      (s.exact ? `Full record from ${PROVIDER.short}.` : s.lookup === 'pending' ? 'Looking up the full record…' :
        s.lookup === 'none' ? 'The online look-up found no matching source; values are the catalogue tile’s, rounded.' :
        s.src === 'online' ? '' : 'Values rounded as stored in the tile; the source number and exact values need the online look-up' + (s.lookup === 'failed' ? ', which did not answer.' : s.lookup === 'off' ? ', which is off or unavailable.' : '.'));
  } else if (ref.kind === 'body') {
    const b = bodies.byId[ref.id];
    title = b.name;
    if (b.kind === 'sun') type = 'Star';
    else if (b.kind === 'moon') type = "Earth's moon";
    else if (b.kind === 'satellite') type = `Moon of <button class="btn" style="padding:1px 7px;font-size:11.5px" data-act="parent" data-id="${b.parent}">${b.parent}</button>`;
    else type = 'Planet';
    row('Magnitude', fmtMag(b.mag));
    if (b.kind === 'moon') row('Distance', Math.round(b.dist * AU_KM).toLocaleString('en-US') + ' km');
    else row('Distance', b.dist.toFixed(b.dist < 2 ? 4 : 3) + ' au');
    if (b.kind !== 'satellite') row('Angular diameter', fmtAngle(2 * b.angRadius));
    else { row('From ' + b.parent, fmtAngle(b.sepDeg) + (b.occulted ? ' (behind the disc)' : b.light < 0.5 ? ' (in the planet’s shadow)' : b.transit ? ' (in front of the disc)' : b.behind ? ' (far side)' : ' (near side)')); row('Angular diameter', fmtAngle(2 * b.angRadius)); }
    if (b.kind !== 'sun') {
      row('Illuminated', (b.phaseFrac * 100).toFixed(b.kind === 'moon' ? 2 : 1) + '%' + (b.kind === 'moon' ? ' · ' + moonPhaseName(A.MoonPhase(frame.time)) : ''));
      if (b.kind !== 'satellite') row('Elongation', b.elong.toFixed(1) + '° from the Sun');
    }
    if (b.id === 'Saturn') row('Ring tilt', (b.ringTilt >= 0 ? '+' : '−') + Math.abs(b.ringTilt).toFixed(1) + '° (' + (b.ringTilt >= 0 ? 'north' : 'south') + ' face)');
    const lt = b.lightMin;
    row('Light time', lt >= 1 ? lt.toFixed(1) + ' min' : (lt * 60).toFixed(2) + ' s');
    row('Seen vs. actual', fmtAngle(b.shiftDeg) + (state.lightTime ? '' : ' (showing actual)'));
    if (b.kind === 'satellite' && b.parent === 'Saturn') note = b.id === 'Mimas' ? 'Approximate position: Mimas can be 10\u00b0 or more of orbital longitude from its true place (several arcseconds on the sky).' : 'Approximate position: within about 1\u00b0 of orbital longitude (roughly 1\u2033 on the sky) for dates within a decade of 2026, drifting slowly beyond that.';
    if (b.kind === 'satellite') note += (note ? ' ' : '') + 'Magnitude ignores the phase and any eclipse by the planet’s shadow.';
  } else if (ref.kind === 'dso') {
    const o = dso.rows[ref.idx];
    const ids = [];
    if (o.m) ids.push('M ' + o.m);
    if (o.c) ids.push('Caldwell ' + o.c);
    if (!/^(C|M|Mel|B)\d/.test(o.id) || !(o.m || o.c)) ids.push(o.id);
    title = (o.names && o.names[0]) || ids[0];
    aka = ids.filter((x) => x !== title).concat((o.names || []).slice(1)).join(' · ');
    type = (DSO_TYPES[o.type] || o.type) + (o.hubble ? ' · Hubble type ' + esc(o.hubble) : '');
    row('Magnitude', o.vmag != null ? fmtMag(o.vmag) + ' (V)' : o.bmag != null ? fmtMag(o.bmag) + ' (B)' : ND);
    row('Size', o.maj != null ? (o.min != null ? `${o.maj}′ × ${o.min}′` : `${o.maj}′`) : ND);
    row('Surface brightness', o.sb != null ? o.sb.toFixed(2) + ' mag/arcsec²' : ND);
    row('Redshift z', o.z != null ? o.z.toFixed(6) : ND);
    row('Radial velocity', o.rv != null ? Math.round(o.rv).toLocaleString('en-US') + ' km/s' : ND);
    note = 'Catalogue values from OpenNGC. No distance is listed there.';
  } else if (ref.kind === 'con') {
    const c = constellations.find((x) => x.id === ref.id);
    title = c.name; type = 'Constellation'; aka = `${c.id} · genitive ${c.gen}`;
  }

  // --- where it is ---
  const j = toSph(eqj), d = toSph(mulMV(frame.Mjd, eqj));
  const hApp = refHorApparent(ref, frame, bodies), aa = horToAzAlt(hApp);
  sep();
  // zoomed far in (labs: aberration, parallax, proper motion) the coordinates are given to 0.01 arcsec
  const fine = perfFov() < 0.5, raDp = fine ? 3 : 1, decDp = fine ? 2 : 0;
  row('RA / Dec (J2000)', fmtRA(j.lon, raDp) + '&ensp;' + fmtDMS(j.lat, { dp: decDp }));
  row('RA / Dec (of date)', fmtRA(d.lon, raDp) + '&ensp;' + fmtDMS(d.lat, { dp: decDp }));
  { const ecl = toSph(mulMV(frame.Mjt, eqj)); row('Ecliptic lon / lat', ecl.lon.toFixed(fine ? 4 : 2) + '°&ensp;' + (ecl.lat >= 0 ? '+' : '−') + Math.abs(ecl.lat).toFixed(fine ? 4 : 2) + '° (of date)'); }
  row('Az / Alt', fmtDMS(aa.az, { sign: false }) + '&ensp;' + fmtDMS(aa.alt) + (state.show.refraction ? '' : ' (no refraction)'));
  row('Hour angle', fmtHA(mod(frame.lst - d.lon / 15 + 12, 24) - 12));
  if (ref.kind !== 'con') {
    const ev = riseTransitSet(ref, frame, eqj);
    if (ev) {
      const t = (ms) => (ms == null ? '—' : fmtClock(ms, tz));
      if (ev.rise == null && ev.set == null) row('Rise / Set', ev.transitAlt > 0 ? 'circumpolar (always up)' : 'never rises here');
      else row('Rise / Set', t(ev.rise) + ' / ' + t(ev.set));
      row('Transit', t(ev.transit) + ' at ' + ev.transitAlt.toFixed(1) + '°');
    }
    try { const c = A.Constellation(j.lon / 15, j.lat); if (ref.kind !== 'con') row('Constellation', esc(c.name)); } catch (e) { /* ignore */ }
  }

  const head = `<button class="close" data-act="close" aria-label="Deselect">&times;</button><h2>${esc(title)}</h2>` +
    (aka ? `<div class="aka">${esc(aka)}</div>` : '') + `<div class="type">${type}</div>`;
  const acts = `<div class="acts"><button class="btn" data-act="center" title="Centre the view on it (Space)">Center <kbd>Space</kbd></button>` +
    `<button class="btn${state.tracking ? ' on' : ''}" data-act="track" aria-pressed="${state.tracking}" title="Keep it centred as time runs (T)">Track <kbd>T</kbd></button>` +
    `<button class="btn" data-act="zoom" title="Centre and zoom in">Zoom to</button></div>`;
  const html = head + `<table>${rows.join('')}</table>` + (note ? `<div class="note">${note}</div>` : '') + acts;
  // only touch the DOM when something changed, so buttons keep focus and hover state
  if (html !== lastHtmlKey) {
    const keepFocus = panel.contains(document.activeElement) ? document.activeElement.dataset.act : null;
    panel.innerHTML = html; lastHtmlKey = html;
    if (keepFocus) { const b = panel.querySelector(`[data-act="${keepFocus}"]`); if (b) b.focus(); }
  }
  panel.hidden = false;
}
export { DEG, RAD, emit };
