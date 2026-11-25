// labs/compare.js: a second observer. At the same instant the Sun, Moon and planets are also computed
// for a second place on Earth and drawn as dashed cyan "ghost" discs, so the parallax between the two
// sites can be measured with the angle tool (ghost centres and limbs are snap targets).
//   align = 'stars'  ghosts are placed against the same stars (the true parallax shift on the sky)
//   align = 'sun'    ghosts are shifted so both observers' Suns coincide: the planet (or Moon) in front
//                    of the Sun then shows as two dots on one disc (transits, solar eclipses)

import { jpl } from '../jpl.js';
import { RAD, unit, dot, horToAzAlt, refractHor, fmtLat, fmtLon } from '../astro.js';
import { state, on, emit, eff } from '../state.js';
import { makeFrame, getFrame } from '../skyframe.js';
import { compute, getBodies } from '../ephem.js';
import { cities } from '../catalog.js';
import { zoneFromLongitude } from '../timeutil.js';
import { R } from '../render/proj.js';
import { makeCard } from './dock.js';
import { toast } from '../xui.js';
import { keepFocus } from '../focus.js';
import { findCities } from '../fuzzy.js';
import { alsoFrame } from '../nav.js';
import { running } from './hidden.js';
import { readPlace } from '../ui.js';
import { placeEqj, esc } from './util.js';
import { setTargets, registerResolver } from './targets.js';

export const cmp = { obs2: null, align: 'stars' };       // obs2 = {name, region, lat, lon, elev, tz}
let card = null, cache = null, cacheKey = '';
const IDS = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune'];

/** The second observer's bodies at the instant of `frame` (cached). */
export function bodies2(frame) {
  if (!cmp.obs2) return null;
  const o = cmp.obs2;
  const key = jpl.version + '|' + frame.timeMs + '|' + o.lat + '|' + o.lon + '|' + state.lightTime + '|' + frame.aberration;
  if (key !== cacheKey) { cacheKey = key; const f2 = makeFrame(frame.timeMs, o); cache = { frame: f2, bodies: compute(f2, state.lightTime, frame.aberration !== false) }; }
  return cache;
}
/** Where observer 2's body `id` is drawn in observer 1's sky: J2000 unit vector, or null. */
export function ghostDir(id, frame, bodies) {
  const b2 = bodies2(frame); if (!b2) return null;
  const g = b2.bodies.byId[id]; if (!g) return null;
  if (cmp.align !== 'sun') return g.u;
  const s1 = bodies.sun.u, s2 = b2.bodies.sun.u;
  if (Math.acos(Math.min(1, dot(g.u, s2))) * RAD > 3) return null;       // only what is near the Sun
  return unit([s1[0] + g.u[0] - s2[0], s1[1] + g.u[1] - s2[1], s1[2] + g.u[2] - s2[2]]);
}
export function setObserver2(o) { cmp.obs2 = o; cacheKey = ''; emit('compare'); render(); }
export function setAlign(a) { cmp.align = a === 'sun' ? 'sun' : 'stars'; emit('compare'); render(); }
export function swapObservers() {
  if (!cmp.obs2) return;
  const a = { ...state.loc }, b = { ...cmp.obs2 };
  cmp.obs2 = a; cacheKey = '';
  state.loc = { elev: 0, ...b }; emit('loc'); emit('compare'); render();
}

export function drawCompare(ctx) {
  if (!cmp.obs2) { setTargets('compare', []); return; }
  const frame = R.frame, bodies = R.bodies, b2 = bodies2(frame);
  const targets = [];
  ctx.save();
  ctx.strokeStyle = 'rgba(110,226,232,0.95)'; ctx.fillStyle = 'rgba(110,226,232,0.95)'; ctx.lineWidth = 1.3;
  for (const id of IDS) {
    if (cmp.align === 'sun' && id === 'Sun') continue;               // coincides with the real Sun by construction
    const u = ghostDir(id, frame, bodies); if (!u) continue;
    const pl = placeEqj(u, frame); if (!pl) continue;
    if (pl.x < -200 || pl.y < -200 || pl.x > ctx.canvas.width || pl.y > ctx.canvas.height) continue;
    const g = b2.bodies.byId[id], mine = bodies.byId[id];
    const sepPx = Math.acos(Math.min(1, dot(u, mine.u))) * RAD * pl.scale;
    if (cmp.align !== 'sun' && sepPx < 1.5) continue;                 // indistinguishable from the real one at this zoom
    const r = g.angRadius * pl.scale;
    ctx.setLineDash(r > 6 ? [5, 4] : []);
    ctx.beginPath(); ctx.arc(pl.x, pl.y, Math.max(r, 3), 0, 2 * Math.PI); ctx.stroke();
    ctx.setLineDash([]);
    if (r < 3) { ctx.beginPath(); ctx.arc(pl.x, pl.y, 1.2, 0, 2 * Math.PI); ctx.fill(); }
    R.labels.add(pl.x, pl.y, `${id} · ${cmp.obs2.name}`, 'grid', 80, { gap: Math.min(Math.max(r, 3), 400) * 0.72 + 5, color: '#7fe3e8' });
    targets.push({ x: pl.x, y: pl.y, r: Math.max(r, 3), type: 'ghost', id });
  }
  ctx.restore();
  setTargets('compare', targets);
}

function nearestCity(lat, lon) {
  let best = null;
  for (const c of cities) { const d = Math.hypot(c.lat - lat, (c.lon - lon) * Math.cos(lat * Math.PI / 180)); if (!best || d < best.d) best = { c, d }; }
  return best;
}
function render() { if (card && card.isOpen()) keepFocus(card.body, draw); }
function draw() {
  const o = cmp.obs2;
  let html = `<div class="cmp-now">You: <b style="color:#fff">${esc(state.loc.name)}</b> (${fmtLat(state.loc.lat)} ${fmtLon(state.loc.lon)})<br>Second observer: ${o ? `<b>${esc(o.name)}</b> (${fmtLat(o.lat)} ${fmtLon(o.lon)})` : '<span style="color:var(--muted)">none</span>'}</div>`;
  html += `<div class="row"><input type="search" id="cmpCity" placeholder="Second place: search a city…" style="flex:1" aria-label="Search a city for the second observer"></div><div class="cmp-cities" id="cmpList" hidden></div>`;
  html += `<div class="row"><input type="text" class="num" id="cmpLat" placeholder="lat" autocomplete="off" aria-label="Latitude of the second observer" value="${o ? o.lat : ''}"><input type="text" class="num" id="cmpLon" placeholder="lon" autocomplete="off" aria-label="Longitude (east +) of the second observer" value="${o ? o.lon : ''}"><button class="btn" data-act="set">Set lat / lon</button></div><p class="hint err" id="cmpMsg" role="alert" hidden></p>`;
  if (o) {
    html += `<div class="row"><span>Line up on:</span><button class="btn${cmp.align === 'stars' ? ' on' : ''}" data-act="stars" aria-pressed="${cmp.align === 'stars'}" title="Ghosts against the same stars">the stars</button>` +
      `<button class="btn${cmp.align === 'sun' ? ' on' : ''}" data-act="sun" aria-pressed="${cmp.align === 'sun'}" title="Both observers' Suns drawn on top of each other">the Sun's disc</button></div>` +
      `<div class="row"><button class="btn" data-act="swap" title="Stand at the other place">Swap observers</button><button class="btn" data-act="off">Remove</button></div><div class="cmp-alt" id="cmpAlt"></div>` +
      `<p class="hint">Dashed cyan circles show where the second observer sees the Sun, Moon and planets at this same instant. The angle tool snaps to them.</p>`;
  } else html += '<p class="hint">Pick a second place. Its view of the Sun, Moon and planets is drawn over yours at the same instant.</p>';
  card.body.innerHTML = html;
  updateAlt();
}
function updateAlt() {
  const box = card && card.isOpen() ? card.body.querySelector('#cmpAlt') : null;
  if (!box || !cmp.obs2) return;
  const b2 = bodies2(makeFrameNow());
  const alt = (id) => horToAzAlt(eff.refraction ? refractHor(b2.bodies.byId[id].hor) : b2.bodies.byId[id].hor).alt;
  const ids = ['Sun', 'Moon'];
  const sel = state.selected && state.selected.kind === 'body' && b2.bodies.byId[state.selected.id] && !ids.includes(state.selected.id) ? state.selected.id : null;
  if (sel && IDS.includes(sel)) ids.push(sel);
  const txt = `Altitude at ${cmp.obs2.name}:  ` + ids.map((id) => `${id} ${alt(id) >= 0 ? '+' : '−'}${Math.abs(alt(id)).toFixed(1)}°`).join('   ');
  if (box.textContent !== txt) box.textContent = txt;
}
let lastFrame = null;
function makeFrameNow() { return lastFrame || makeFrame(state.timeMs, state.loc); }

export function initCompare() {
  card = makeCard('compare', 'Two observers', { onOpen: render, onClose(byUser) {
    // closing the tool ends what it does (it used to go on, also into shared links); a lab that is built on the second observer keeps it
    if (!byUser || !cmp.obs2) return;
    if (running.id) { toast('The second observer stays on: this lab needs it.'); return; }
    const name = cmp.obs2.name; setObserver2(null);
    toast(`The second observer (${name}) is off.`);
  } });
  // "Zoom to" a body leaves room for where the second observer sees it
  alsoFrame.push((ref) => {
    if (!cmp.obs2 || ref.kind !== 'body' || !IDS.includes(ref.id)) return 0;
    const frame = getFrame(), bodies = getBodies(frame), u = ghostDir(ref.id, frame, bodies), b = bodies.byId[ref.id];
    return u && b ? 2.3 * (Math.acos(Math.min(1, dot(u, b.u))) * RAD + b.angRadius) : 0;
  });
  registerResolver('ghost', (id, frame, bodies) => {
    const u = ghostDir(id, frame, bodies), b2 = bodies2(frame);
    return u ? { u, angRadius: b2.bodies.byId[id].angRadius, name: `${id} (${cmp.obs2.name})` } : null;
  });
  card.body.addEventListener('input', (e) => {
    if (e.target.id !== 'cmpCity') return;
    const list = card.body.querySelector('#cmpList'), hits = e.target.value.trim() ? findCities(cities, e.target.value).slice(0, 30) : [];
    list.hidden = !e.target.value.trim();
    list.innerHTML = (!hits.length ? '<div class="hint" style="padding:5px 8px;margin:0">No match in the built-in list. Type coordinates below.</div>' : hits[0].near ? '<div class="hint" style="padding:5px 8px 0;margin:0">Did you mean</div>' : '') + hits.map(({ c, i }) => `<button data-city="${i}">${esc(c.name)}<span>${esc(c.region)}</span></button>`).join('');
  });
  card.body.addEventListener('keydown', (e) => { if (e.target.id === 'cmpCity' && e.key === 'Enter') { const b = card.body.querySelector('#cmpList button'); if (b) { b.click(); document.getElementById('sky').focus({ preventScroll: true }); } } });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.city != null) { const c = cities[+b.dataset.city]; setObserver2({ name: c.name, region: c.region, lat: c.lat, lon: c.lon, elev: 0, tz: c.tz }); }
    else if (b.dataset.act === 'set') {
      const { lat, lon, err } = readPlace(card.body.querySelector('#cmpLat').value, card.body.querySelector('#cmpLon').value), msg = card.body.querySelector('#cmpMsg');
      msg.textContent = err || ''; msg.hidden = !err;
      if (err) return;
      const near = nearestCity(lat, lon);
      setObserver2({ name: `${fmtLat(lat)}, ${fmtLon(lon)}`, region: 'Custom location', lat, lon, elev: 0, tz: near && near.d < 1.5 ? near.c.tz : zoneFromLongitude(lon) });
    } else if (b.dataset.act === 'stars' || b.dataset.act === 'sun') setAlign(b.dataset.act);
    else if (b.dataset.act === 'swap') swapObservers();
    else if (b.dataset.act === 'off') setObserver2(null);
  });
  on('frame', () => { lastFrame = R.frame; updateAlt(); });
  on('loc', render);
  return card;
}
