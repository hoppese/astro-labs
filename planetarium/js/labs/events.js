// labs/events.js: the Events finder. Lists upcoming (or earlier) eclipses, transits, oppositions,
// conjunctions, greatest elongations, Moon phases, apsides, equinoxes and solstices, all found with
// astronomy-engine's Search* functions, and jumps the clock to one of them.
// By design the list gives the DATE only: contact times and other answers are shown only when the
// "Instructor" box is ticked (or the page was opened with ?instructor=1).

import { A, horToAzAlt, refractHor } from '../astro.js';
import { state, emit, on } from '../state.js';
import { setTime } from '../clock.js';
import { makeFrame } from '../skyframe.js';
import { compute } from '../ephem.js';
import { select, flyTo, track } from '../nav.js';
import { wallParts, fmtDate, fmtTime } from '../timeutil.js';
import { makeCard } from './dock.js';
import { esc } from './util.js';
import { jovianEvents } from './jovian.js';
import { ensure, jpl } from '../jpl.js';
import { fmtClock } from '../timeutil.js';
import { running, eventsHidden } from './hidden.js';

const DAY = 86400000;
const ms = (t) => t.date.getTime();
const at = (m) => A.MakeTime(new Date(m));
const hms = (t) => { const p = wallParts(typeof t === 'number' ? t : ms(t), 'UTC'); return fmtTime(p); };
const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Each category: span = typical days between events (for paging back), list(startMs, n, opt) -> events
 *  {t, text, target, fov, detail}. `detail` is instructor-only. */
export const CATEGORIES = [
  { id: 'lunar', label: 'Lunar eclipses', span: 177, list(t0, n) {
    const out = []; let e = A.SearchLunarEclipse(at(t0));
    while (out.length < n) {
      const p = ms(e.peak), c = (sd) => (sd > 0 ? `${hms(p - sd * 60000)} – ${hms(p + sd * 60000)}` : '—');
      out.push({ t: p, text: `${cap(e.kind)} lunar eclipse`, target: 'Moon', fov: 3,
        detail: `greatest ${hms(p)} UTC\npenumbral ${c(e.sd_penum)}\npartial   ${c(e.sd_partial)}\ntotal     ${c(e.sd_total)}` });
      e = A.NextLunarEclipse(e.peak);
    }
    return out;
  } },
  { id: 'solar', label: 'Solar eclipses (anywhere on Earth)', span: 177, list(t0, n) {
    const out = []; let e = A.SearchGlobalSolarEclipse(at(t0));
    while (out.length < n) {
      const where = e.latitude != null && isFinite(e.latitude) ? `greatest at ${Math.abs(e.latitude).toFixed(1)}°${e.latitude >= 0 ? 'N' : 'S'} ${Math.abs(e.longitude).toFixed(1)}°${e.longitude >= 0 ? 'E' : 'W'}` : 'partial only';
      out.push({ t: ms(e.peak), text: `${cap(e.kind)} solar eclipse`, target: 'Sun', fov: 2.5, detail: `greatest ${hms(e.peak)} UTC, ${where}` });
      e = A.NextGlobalSolarEclipse(e.peak);
    }
    return out;
  } },
  { id: 'solarHere', label: 'Solar eclipses seen from here', span: 900, list(t0, n) {
    const obs = new A.Observer(state.loc.lat, state.loc.lon, state.loc.elev || 0);
    const out = []; let e = A.SearchLocalSolarEclipse(at(t0), obs);
    while (out.length < n) {
      const up = e.peak.altitude > 0;
      const d = [`partial ${hms(e.partial_begin.time)} – ${hms(e.partial_end.time)} UTC`];
      if (e.total_begin) d.push(`${e.kind} ${hms(e.total_begin.time)} – ${hms(e.total_end.time)} UTC`);
      d.push(`greatest ${hms(e.peak.time)} UTC, obscuration ${(e.obscuration * 100).toFixed(1)}%`);
      out.push({ t: ms(e.peak.time), text: `${cap(e.kind)} solar eclipse` + (up ? '' : ' (Sun below the horizon at greatest eclipse)'), target: 'Sun', fov: 2.5, detail: d.join('\n') });
      e = A.NextLocalSolarEclipse(e.peak.time, obs);
    }
    return out;
  } },
  { id: 'transit', label: 'Transits of Mercury and Venus', span: 2400, list(t0, n) {
    const all = [];
    for (const body of ['Mercury', 'Venus']) {
      let tr = A.SearchTransit(body, at(t0));
      for (let i = 0; i < n; i++) {
        all.push({ t: ms(tr.peak), text: `Transit of ${body}`, target: 'Sun', fov: 0.9,
          detail: `geocentric: I ${hms(tr.start)}  mid ${hms(tr.peak)}  IV ${hms(tr.finish)} UTC\nleast separation ${(tr.separation * 60).toFixed(1)}″` });
        if (body === 'Venus' && i >= 1) break;                 // Venus transits are over a century apart
        tr = A.NextTransit(body, tr.finish);
      }
    }
    return all.sort((a, b) => a.t - b.t).slice(0, n);
  } },
  ...[['Jupiter', 'moons, shadows, Red Spot', 0.06], ['Saturn', 'moons and their shadows', 0.03], ['Mars', 'moons and their shadows', 0.02], ['Uranus', 'moons and their shadows', 0.015], ['Neptune', 'Triton', 0.01], ['Pluto', 'Charon', 0.001]].map(([planet, what, fov]) => ({
    id: planet === 'Jupiter' ? 'jovian' : 'moons-' + planet, label: `${planet}: ${what}`, span: planet === 'Jupiter' ? 1 : 3, short: true, list(t0, n) {
      return jovianEvents(t0, n, { planet }).map((e) => ({ t: e.end ? e.t + Math.min(600000, (e.end - e.t) / 2) : e.t, clock: e.t, text: e.text, target: planet, fov: e.kind === 'spot' ? 0.03 : fov,
        detail: e.end ? `${hms(e.t)} – ${hms(e.end)} UTC` : `${hms(e.t)} UTC` }));
    }, empty: `None in the 40 days from this date: the moons pass above and below ${planet}, as they do whenever its orbit is tipped wide open toward us.` })),
  { id: 'phases', label: 'Moon phases', span: 7.4, list(t0, n) {
    const out = []; let q = A.SearchMoonQuarter(at(t0));
    const names = ['New Moon', 'First quarter', 'Full Moon', 'Last quarter'];
    while (out.length < n) { out.push({ t: ms(q.time), text: names[q.quarter], target: 'Moon', detail: `${hms(q.time)} UTC (Sun–Moon ecliptic longitude difference ${q.quarter * 90}°)` }); q = A.NextMoonQuarter(q); }
    return out;
  } },
  { id: 'apsis', label: 'Moon: perigee and apogee', span: 13.8, list(t0, n) {
    const out = []; let a = A.SearchLunarApsis(at(t0));
    while (out.length < n) { out.push({ t: ms(a.time), text: a.kind === 0 ? 'Moon at perigee (closest)' : 'Moon at apogee (farthest)', target: 'Moon', detail: `${hms(a.time)} UTC, ${Math.round(a.dist_km).toLocaleString('en-US')} km (centre to centre)` }); a = A.NextLunarApsis(a); }
    return out;
  } },
  { id: 'oppo', label: 'Oppositions and conjunctions', span: 420, planet: true, list(t0, n, body) {
    const out = [];
    const inner = body === 'Mercury' || body === 'Venus';
    const kinds = inner ? [[0, 'inferior conjunction (between us and the Sun)'], [180, 'superior conjunction (beyond the Sun)']] : [[0, 'opposition'], [180, 'conjunction with the Sun']];
    for (const [rel, name] of kinds) {
      let t = at(t0);
      for (let i = 0; i < n; i++) {
        const e = A.SearchRelativeLongitude(body, rel, t);
        out.push({ t: ms(e), text: `${body}: ${name}`, target: body, detail: `${hms(e)} UTC` });
        t = e.AddDays(10);
      }
    }
    return out.sort((a, b) => a.t - b.t).slice(0, n);
  } },
  { id: 'elong', label: 'Greatest elongations (Mercury, Venus)', span: 300, list(t0, n) {
    const all = [];
    for (const body of ['Mercury', 'Venus']) {
      let t = at(t0);
      for (let i = 0; i < n; i++) {
        const e = A.SearchMaxElongation(body, t);
        all.push({ t: ms(e.time), text: `${body}: greatest elongation, ${e.visibility} sky`, target: body, detail: `${hms(e.time)} UTC, ${e.elongation.toFixed(2)}° from the Sun (geocentric)` });
        t = e.time.AddDays(5);
      }
    }
    return all.sort((a, b) => a.t - b.t).slice(0, n);
  } },
  { id: 'seasons', label: 'Equinoxes and solstices', span: 91, list(t0, n) {
    const out = []; let y = new Date(t0).getUTCFullYear();
    while (out.length < n) {
      const s = A.Seasons(y++);
      for (const [k, name] of [['mar_equinox', 'March equinox'], ['jun_solstice', 'June solstice'], ['sep_equinox', 'September equinox'], ['dec_solstice', 'December solstice']]) {
        if (ms(s[k]) >= t0 && out.length < n) out.push({ t: ms(s[k]), text: name, target: 'Sun', detail: `${hms(s[k])} UTC` });
      }
    }
    return out;
  } },
  { id: 'earthApsis', label: 'Earth: perihelion and aphelion', span: 183, list(t0, n) {
    const out = []; let a = A.SearchPlanetApsis('Earth', at(t0));
    while (out.length < n) { out.push({ t: ms(a.time), text: a.kind === 0 ? 'Earth at perihelion (closest to the Sun)' : 'Earth at aphelion (farthest)', target: 'Sun', detail: `${hms(a.time)} UTC, ${a.dist_au.toFixed(5)} au` }); a = A.NextPlanetApsis('Earth', a); }
    return out;
  } },
];

export const ev = { cat: 'lunar', planet: 'Mars', anchor: null, instructor: false, rows: [] };
let card = null, pending = '';
const N = 8;

/** Go to an event: clock (paused), target selected and centred. */
export function jumpTo(e) {
  state.playing = false; emit('rate');
  setTime(e.t);
  if (e.target) {
    const ref = { kind: 'body', id: e.target };
    select(ref);
    track(ref);
    flyTo(ref, { fov: e.fov || null, dur: 500 });
  }
}
function altitudeHere(e) {
  if (!e.target) return null;
  try {
    const b = compute(makeFrame(e.t, state.loc), true).byId[e.target];
    return horToAzAlt(refractHor(b.hor)).alt;
  } catch (err) { return null; }
}
/** Solar eclipses anywhere on Earth: is any of it seen from here? (The Sun being up is not enough: the Moon's shadow has to reach this place.) */
function seenHere(e) {
  if (ev.cat !== 'solar') return null;
  try {
    const obs = new A.Observer(state.loc.lat, state.loc.lon, state.loc.elev || 0), q = A.SearchLocalSolarEclipse(at(e.t - 0.6 * DAY), obs);
    if (Math.abs(ms(q.peak.time) - e.t) > 0.5 * DAY || Math.max(q.partial_begin.altitude, q.peak.altitude, q.partial_end.altitude) < 0) return 'no eclipse at your place';
    return q.kind === 'partial' ? 'only partial at your place' : q.kind + ' at your place';
  } catch (err) { return null; }
}
/** A lab begins: its own list, from its own date, whatever was shown before. */
export function resetEvents(cat, planet) { ev.cat = cat || 'lunar'; ev.planet = planet || 'Mars'; ev.anchor = null; ev.rows = []; pending = ''; refresh(); }
function refresh() {
  if (!card || !card.isOpen()) return;
  const cat = CATEGORIES.find((c) => c.id === ev.cat);
  if (ev.anchor == null) ev.anchor = state.timeMs;
  // the positions for the years to be searched first; the search itself runs on whatever is here
  const tt = ev.anchor / DAY - 10957.5, key = ev.cat + ev.anchor + ev.planet, reach = ev.cat === 'transit' ? 366 * 260 : Math.min(cat.span * N * 1.3, 36500);
  if (pending !== key && !jpl.failed) { pending = key; ensure(tt - 400, tt + reach).then(() => { if (pending === key) refresh(); }); }
  let rows = [], error = '';
  try { rows = cat.list(ev.anchor, N, ev.planet); } catch (e) { error = 'No events found from this date (the search range of the ephemeris ends).'; }
  ev.rows = rows;
  if (!rows.length && !error) error = cat.empty || 'No events found from this date.';
  const head = `<div class="row"><select id="evCat" aria-label="Kind of event">${CATEGORIES.filter((c) => !eventsHidden(c.id)).map((c) => `<option value="${c.id}"${c.id === ev.cat ? ' selected' : ''}>${c.label}</option>`).join('')}</select></div>` +
    (cat.planet ? `<div class="row"><select id="evPlanet" aria-label="Planet">${PLANETS.map((p) => `<option${p === ev.planet ? ' selected' : ''}>${p}</option>`).join('')}</select></div>` : '') +
    `<div class="row"><button class="btn" data-act="earlier" title="Earlier events">&#9664; Earlier</button><button class="btn" data-act="now" title="List from the date on the clock">From clock date</button><button class="btn" data-act="later" title="Later events">Later &#9654;</button></div>`;
  let list = '';
  if (error) list = `<div class="ev-empty">${error}</div>`;
  else {
    list = '<ul class="ev-list">' + rows.map((e, i) => {
      const alt = altitudeHere(e);
      const vis = alt == null ? '' : ' · ' + (seenHere(e) ?? (alt > 0 ? `${e.target} above your horizon` : `${e.target} below your horizon`));
      return `<li><button data-i="${i}" title="Set the clock to this event"><span class="when">${e.clock ? fmtDate(wallParts(e.clock, state.loc.tz)) + (running.id && !ev.instructor ? '' : ' ' + fmtClock(e.clock, state.loc.tz)) : fmtDate(wallParts(e.t, 'UTC'))}</span><span class="what">${esc(e.text)}<span style="color:var(--muted)">${vis}</span></span>` +
        (ev.instructor && e.detail ? `<span class="more">${esc(e.detail)}</span>` : '') + '</button></li>';
    }).join('') + '</ul>';
  }
  const foot = `<label class="chk" style="margin-top:6px"><input type="checkbox" id="evInst"${ev.instructor ? ' checked' : ''}><span>Instructor: show times and contact times<small>${cat.short ? 'Dates and times are those of the place’s clock.' : 'Dates are UTC.'} Click an event to set the clock to its middle; measure the rest yourself.</small></span></label>`;
  card.body.innerHTML = head + list + foot;
}
export function initEvents() {
  card = makeCard('events', 'Events finder', { onOpen() { ev.anchor = state.timeMs; refresh(); } });
  card.body.addEventListener('change', (e) => {
    if (e.target.id === 'evCat') { ev.cat = e.target.value; ev.anchor = state.timeMs; refresh(); }
    else if (e.target.id === 'evPlanet') { ev.planet = e.target.value; refresh(); }
    else if (e.target.id === 'evInst') { ev.instructor = e.target.checked; refresh(); }
  });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const cat = CATEGORIES.find((c) => c.id === ev.cat);
    if (b.dataset.act === 'now') { ev.anchor = state.timeMs; refresh(); }
    else if (b.dataset.act === 'later') { if (!ev.rows.length) { ev.anchor += (cat.short ? 40 : cat.span) * DAY; refresh(); } else { ev.anchor = ev.rows[ev.rows.length - 1].t + (CATEGORIES.find((c) => c.id === ev.cat).short ? 60000 : DAY); refresh(); } }
    else if (b.dataset.act === 'earlier') {
      // back by as much time as the page on show covers (the fixed "typical interval x 8" overshot by years in mixed
      // lists such as Mercury + Venus elongations); searches only run forward, so this is the previous page, near enough
      const span = ev.rows.length ? ev.rows[ev.rows.length - 1].t - ev.anchor + DAY : cat.span * N * DAY;
      ev.anchor -= Math.max(span, 2 * DAY); refresh();
    }
    else if (b.dataset.i != null) jumpTo(ev.rows[+b.dataset.i]);
  });
  on('loc', refresh);
  return card;
}
