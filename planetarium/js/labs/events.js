// labs/events.js: the Events finder. Lists upcoming (or earlier) eclipses, transits, oppositions,
// conjunctions, greatest elongations, Moon phases, apsides, equinoxes and solstices, all found with
// astronomy-engine's Search* functions, and jumps the clock to one of them.
// By design the list gives the DATE only: contact times and other answers are shown only when the page was opened
// with ?instructor=1 (hidden.js); the box that switches them is not there otherwise.
// A click sets the clock to the MIDDLE of an event that lasts (`sets` says which moment that is in each list).

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
import { running, INSTRUCTOR } from './hidden.js';

const DAY = 86400000;
const ms = (t) => t.date.getTime();
const at = (m) => A.MakeTime(new Date(m));
const hms = (t) => { const p = wallParts(typeof t === 'number' ? t : ms(t), 'UTC'); return fmtTime(p); };
const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/** Each category: span = typical days between events (for paging back), list(startMs, n, opt) -> events
 *  {t, text, target, fov, detail}. `detail` is instructor-only. */
export const CATEGORIES = [
  { id: 'lunar', label: 'Lunar eclipses', sets: 'the middle of the eclipse (greatest eclipse)', span: 177, list(t0, n) {
    const out = []; let e = A.SearchLunarEclipse(at(t0));
    while (out.length < n) {
      const p = ms(e.peak), c = (sd) => (sd > 0 ? `${hms(p - sd * 60000)} – ${hms(p + sd * 60000)}` : '—');
      out.push({ t: p, text: `${cap(e.kind)} lunar eclipse`, target: 'Moon', fov: 3,
        detail: `greatest ${hms(p)} UTC\npenumbral ${c(e.sd_penum)}\npartial   ${c(e.sd_partial)}\ntotal     ${c(e.sd_total)}` });
      e = A.NextLunarEclipse(e.peak);
    }
    return out;
  } },
  { id: 'solar', label: 'Solar eclipses (anywhere on Earth)', sets: 'the middle of the eclipse for the Earth as a whole (greatest eclipse); from here it may come earlier or later, or not at all', span: 177, list(t0, n) {
    const out = []; let e = A.SearchGlobalSolarEclipse(at(t0));
    while (out.length < n) {
      const where = e.latitude != null && isFinite(e.latitude) ? `greatest at ${Math.abs(e.latitude).toFixed(1)}°${e.latitude >= 0 ? 'N' : 'S'} ${Math.abs(e.longitude).toFixed(1)}°${e.longitude >= 0 ? 'E' : 'W'}` : 'partial only';
      out.push({ t: ms(e.peak), text: `${cap(e.kind)} solar eclipse`, target: 'Sun', fov: 2.5, detail: `greatest ${hms(e.peak)} UTC, ${where}` });
      e = A.NextGlobalSolarEclipse(e.peak);
    }
    return out;
  } },
  { id: 'solarHere', label: 'Solar eclipses seen from here', sets: 'the middle of the eclipse as seen from here (greatest eclipse)', span: 900, list(t0, n) {
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
  { id: 'transit', label: 'Transits of Mercury and Venus', sets: 'the middle of the transit (least distance from the center of the Sun)', span: 2400, list(t0, n) {
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
    id: planet === 'Jupiter' ? 'jovian' : 'moons-' + planet, label: `${planet}: ${what}`, sets: 'the middle of the event (one moon covering another and the Red Spot at the center have a single time)', span: planet === 'Jupiter' ? 1 : 3, short: true, list(t0, n) {
      return jovianEvents(t0, n, { planet }).map((e) => ({ t: e.end ? (e.t + e.end) / 2 : e.t, clock: e.t, end: e.end, text: e.text, target: planet, fov: e.kind === 'spot' ? 0.03 : fov,
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
    while (out.length < n) { out.push({ t: ms(a.time), text: a.kind === 0 ? 'Moon at perigee (closest)' : 'Moon at apogee (farthest)', target: 'Moon', detail: `${hms(a.time)} UTC, ${Math.round(a.dist_km).toLocaleString('en-US')} km (center to center)` }); a = A.NextLunarApsis(a); }
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

export const ev = { cat: 'lunar', planet: 'Mars', anchor: null, instructor: INSTRUCTOR, rows: [] };
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
let later = 0;
/** The lists and buttons stay in place while the results change: rebuilding them under somebody typing in a list sent the rest of the word to the sky. */
function refresh(soon = false) {
  if (!card || !card.isOpen()) return;
  clearTimeout(later);
  if (soon) { head(); later = setTimeout(refresh, 160); return; }      // typing runs through several lists: search only the one it ends on
  const cat = CATEGORIES.find((c) => c.id === ev.cat);
  if (ev.anchor == null) ev.anchor = state.timeMs;
  // the positions for the years to be searched first; the search itself runs on whatever is here
  const tt = ev.anchor / DAY - 10957.5, key = ev.cat + ev.anchor + ev.planet, reach = ev.cat === 'transit' ? 366 * 260 : Math.min(cat.span * N * 1.3, 36500);
  if (pending !== key && !jpl.failed) { pending = key; ensure(tt - 400, tt + reach).then(() => { if (pending === key) refresh(); }); }
  let rows = [], error = '';
  try { rows = cat.list(ev.anchor, N, ev.planet); } catch (e) { error = 'No events found from this date (the search range of the ephemeris ends).'; }
  ev.rows = rows;
  if (!rows.length && !error) error = cat.empty || 'No events found from this date.';
  head();
  let list = '';
  if (error) list = `<div class="ev-empty">${error}</div>`;
  else {
    list = '<ul class="ev-list">' + rows.map((e, i) => {
      const alt = altitudeHere(e);
      const vis = alt == null ? '' : alt > 0 ? ' · up here' : ' · below the horizon here';
      // an event that lasts: when it starts and, for who may know, its middle; what has one instant: that
      const local = (t) => fmtClock(t, state.loc.tz), times = !e.clock ? '' : running.id && !ev.instructor ? '' : e.end ? ` <small>starts</small> ${local(e.clock)} <small>middle</small> ${local(e.t)}` : ` <small>at</small> ${local(e.clock)}`;
      return `<li><button data-i="${i}" title="Set the clock to ${e.end ? 'the middle of this event' : esc((cat.sets || 'this instant').split(/[(;.]/)[0].trim())}"><span class="when">${fmtDate(e.clock ? wallParts(e.clock, state.loc.tz) : wallParts(e.t, 'UTC'))}${times}</span><span class="what">${esc(e.text)}<span style="color:var(--muted)">${vis}</span></span>` +
        (ev.instructor && e.detail ? `<span class="more">${esc(e.detail)}</span>` : '') + '</button></li>';
    }).join('') + '</ul>';
  }
  card.body.querySelector('.ev-out').innerHTML = list;
  card.body.querySelector('.ev-foot').textContent = `${cat.short ? 'Dates and times are those of the place’s clock.' : 'Dates are UTC.'} A click sets the clock to ${cat.sets || 'that instant'}${cat.short || !cat.sets ? '' : '; measure the rest yourself'}.`;
}
/** The part that stays: built once, then only kept in step. */
function head() {
  const cat = CATEGORIES.find((c) => c.id === ev.cat);
  if (!card.body.querySelector('#evCat')) {
    card.body.innerHTML = `<div class="row"><select id="evCat" aria-label="Kind of event">${CATEGORIES.map((c) => `<option value="${c.id}">${c.label}</option>`).join('')}</select></div>` +
      `<div class="row" id="evPlanetRow"><select id="evPlanet" aria-label="Planet">${PLANETS.map((p) => `<option>${p}</option>`).join('')}</select></div>` +
      `<div class="row"><button class="btn" data-act="earlier" title="Earlier events">&#9664; Earlier</button><button class="btn" data-act="now" title="List from the date on the clock">From clock date</button><button class="btn" data-act="later" title="Later events">Later &#9654;</button></div>` +
      `<div class="ev-out"></div><p class="hint ev-foot"></p>` + (INSTRUCTOR ? `<label class="chk" style="margin-top:6px"><input type="checkbox" id="evInst"><span>Instructor: show contact times</span></label>` : '');
  }
  const q = (id) => card.body.querySelector('#' + id);
  if (q('evCat').value !== ev.cat) q('evCat').value = ev.cat;
  if (q('evPlanet').value !== ev.planet) q('evPlanet').value = ev.planet;
  q('evPlanetRow').hidden = !cat.planet;
  if (q('evInst')) q('evInst').checked = ev.instructor;
}
export function initEvents() {
  card = makeCard('events', 'Events finder', { onOpen() { ev.anchor = state.timeMs; refresh(); } });
  card.body.addEventListener('change', (e) => {
    if (e.target.id === 'evCat') { ev.cat = e.target.value; ev.anchor = state.timeMs; refresh(true); }
    else if (e.target.id === 'evPlanet') { ev.planet = e.target.value; refresh(true); }
    else if (e.target.id === 'evInst') { ev.instructor = e.target.checked; refresh(); }
  });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const cat = CATEGORIES.find((c) => c.id === ev.cat);
    if (b.dataset.act === 'now') { ev.anchor = state.timeMs; refresh(); }
    else if (b.dataset.act === 'later') { if (!ev.rows.length) { ev.anchor += (cat.short ? 40 : cat.span) * DAY; refresh(); } else { const r = ev.rows[ev.rows.length - 1]; ev.anchor = (r.clock ?? r.t) + (CATEGORIES.find((c) => c.id === ev.cat).short ? 60000 : DAY); refresh(); } }
    else if (b.dataset.act === 'earlier') {
      // back by as much time as the page on show covers (the fixed "typical interval x 8" overshot by years in mixed
      // lists such as Mercury + Venus elongations); searches only run forward, so this is the previous page, near enough
      const span = ev.rows.length ? ev.rows[ev.rows.length - 1].t - ev.anchor + DAY : cat.span * N * DAY;
      ev.anchor -= Math.max(span, 2 * DAY); refresh();
    }
    else if (b.dataset.i != null) jumpTo(ev.rows[+b.dataset.i]);
  });
  on('loc', () => refresh());
  return card;
}
