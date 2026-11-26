// labs/squareon.js: the Earth drawn square-on, as the Moon (or the Sun) sees it at this instant, with the two observers
// marked and a ruler that reads in km. A parallax shift is made only by the part of the baseline that is square-on to
// the target, so the students measure that part on this picture instead of working it out with the law of cosines.
// The picture is an orthographic view along the line from the target to the Earth's center, celestial north up.
// Land: Natural Earth 1:50m (public domain), data/earth-land.json (tools/build_earth.py).

import { AU_KM, mulMV, unit, dot, cross, sub, scale, add } from '../astro.js';
import { state, on } from '../state.js';
import { getFrame } from '../skyframe.js';
import { getBodies } from '../ephem.js';
import { makeCard } from './dock.js';
import { cmp, bodies2 } from './compare.js';
import { esc } from './util.js';

const RE = 6378.137;                                   // equatorial radius, km (the outline of the disc)
const NAMES = { Moon: 'the Moon', Sun: 'the Sun' };
export const sq = { from: 'Moon' };
let card = null, cv = null, land = null, loading = false, lastKey = '';
// the view: center of the picture in km on the image plane, km per pixel; the ruler's two ends in km on the image plane
let view = { cx: 0, cy: 0, kmpx: 0, fit: 'earth' }, ruler = null, drag = null;

/** Land outlines as Earth-fixed unit vectors, one Float32Array (x, y, z, ...) per ring. */
function loadLand() {
  if (land || loading) return; loading = true;
  fetch(new URL('../../data/earth-land.json', import.meta.url)).then((r) => r.json()).then((d) => {
    const k = Math.PI / 180 / d.q;
    land = d.rings.map((r) => {
      const a = new Float32Array(r.length / 2 * 3); let lo = 0, la = 0;
      for (let i = 0, j = 0; i < r.length; i += 2, j += 3) {
        lo += r[i]; la += r[i + 1];
        const L = lo * k, B = la * k; a[j] = Math.cos(B) * Math.cos(L); a[j + 1] = Math.cos(B) * Math.sin(L); a[j + 2] = Math.sin(B);
      }
      return a;
    });
    lastKey = ''; redraw();
  }).catch(() => { loading = false; });
}

/** The geometry at this instant: image axes (EQJ unit vectors) r (right), u (up, toward celestial north), w (toward the
 *  viewer), the Sun's direction, the two sites in km on the image plane, and the matrix Earth-fixed -> EQJ. Exported for tools/check-labs.mjs. */
export function geometry(frame, bodies, from = sq.from, b2 = bodies2(frame)) {
  const geo = (b) => add(b.vecGeo, frame.opos);                       // from the Earth's center, au
  const w = unit(geo(bodies.byId[from]));
  const n = [0, 0, 1], u = unit(sub(n, scale(w, dot(n, w)))), r = cross(scale(w, -1), u);      // looking along -w with north up
  const th = (frame.lst - frame.loc.lon / 15) * Math.PI / 12, c = Math.cos(th), s = Math.sin(th);   // Greenwich apparent sidereal time
  const col = (v) => mulMV(frame.Mdj, v);                               // Earth-fixed -> equator of date (by the sidereal angle) -> EQJ
  const ef = [col([c, s, 0]), col([-s, c, 0]), col([0, 0, 1])];         // the Earth-fixed axes in EQJ
  const site = (opos, name, lat, lon) => { const p = scale(opos, AU_KM); return { name, lat, lon, x: dot(p, r), y: dot(p, u), z: dot(p, w), p }; };
  const sites = [site(frame.opos, state.loc.name, state.loc.lat, state.loc.lon)];
  if (b2 && cmp.obs2) sites.push(site(b2.frame.opos, cmp.obs2.name, cmp.obs2.lat, cmp.obs2.lon));
  return { r, u, w, sun: unit(geo(bodies.sun)), ef, sites };
}

function fitView(g) {
  const W = cv.clientWidth, H = cv.clientHeight;
  if (view.fit === 'sites' && g.sites.length === 2) {
    const [a, b] = g.sites, span = Math.max(Math.hypot(a.x - b.x, a.y - b.y), 300);
    view.cx = (a.x + b.x) / 2; view.cy = (a.y + b.y) / 2; view.kmpx = span / (Math.min(W, H) * 0.6);
    if (view.kmpx * Math.min(W, H) > 1.4 * RE) { view.fit = 'earth'; return fitView(g); }      // places far apart: the whole Earth shows them
  } else { view.cx = 0; view.cy = 0; view.kmpx = RE / (Math.min(W, H) / 2 - 10); }
  view.fit = null;
}
const toPx = (x, y) => [cv.clientWidth / 2 + (x - view.cx) / view.kmpx, cv.clientHeight / 2 - (y - view.cy) / view.kmpx];
const toKm = (px, py) => [view.cx + (px - cv.clientWidth / 2) * view.kmpx, view.cy - (py - cv.clientHeight / 2) * view.kmpx];
const fmtKm = (k) => Math.round(k).toLocaleString('en-US') + ' km';

function redraw(force = false) {
  if (!card || !card.isOpen() || !cv) return;
  const frame = getFrame(), bodies = getBodies(frame);
  const key = frame.timeMs + '|' + sq.from + '|' + (cmp.obs2 ? cmp.obs2.lat + ',' + cmp.obs2.lon : '') + '|' + state.loc.lat + ',' + state.loc.lon + '|' + JSON.stringify(view) + '|' + JSON.stringify(ruler) + '|' + !!land + cv.clientWidth;
  if (!force && key === lastKey) return; lastKey = key;
  const g = geometry(frame, bodies);
  const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight;
  if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
  if (view.fit) fitView(g);
  const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#05080e'; ctx.fillRect(0, 0, W, H);
  const [ox, oy] = toPx(0, 0), Rpx = RE / view.kmpx;
  ctx.save(); ctx.beginPath(); ctx.arc(ox, oy, Rpx, 0, 2 * Math.PI); ctx.fillStyle = '#16314f'; ctx.fill(); ctx.clip();
  // Earth-fixed -> image coordinates (km on the image plane per unit vector)
  const M = [g.r, g.u, g.w].map((ax) => g.ef.map((e) => dot(e, ax)));
  const proj = (x, y, z) => {
    let X = (M[0][0] * x + M[0][1] * y + M[0][2] * z) * RE, Y = (M[1][0] * x + M[1][1] * y + M[1][2] * z) * RE;
    if (M[2][0] * x + M[2][1] * y + M[2][2] * z < 0) { const k = RE / Math.max(1e-9, Math.hypot(X, Y)); X *= k; Y *= k; }      // far side: onto the edge of the disc
    return toPx(X, Y);
  };
  if (land) {
    ctx.fillStyle = '#5b6b4a'; ctx.strokeStyle = 'rgba(214,226,190,0.55)'; ctx.lineWidth = 0.6;
    for (const a of land) {           // one ring at a time: a ring pushed on to the edge of the disc must not cancel its neighbours
      ctx.beginPath();
      for (let j = 0; j < a.length; j += 3) { const [px, py] = proj(a[j], a[j + 1], a[j + 2]); if (j) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
      ctx.fill(); ctx.stroke();
    }
  } else loadLand();
  // latitude and longitude every 30 degrees
  ctx.strokeStyle = 'rgba(190,210,235,0.22)'; ctx.lineWidth = 0.8;
  const line = (f) => { ctx.beginPath(); let up = false; for (let t = 0; t <= 360; t += 3) { const v = f(t * Math.PI / 180); const z = M[2][0] * v[0] + M[2][1] * v[1] + M[2][2] * v[2]; if (z < 0) { up = false; continue; } const [px, py] = proj(...v); if (up) ctx.lineTo(px, py); else ctx.moveTo(px, py); up = true; } ctx.stroke(); };
  for (let lat = -60; lat <= 60; lat += 30) { const B = lat * Math.PI / 180; ctx.strokeStyle = lat ? 'rgba(190,210,235,0.22)' : 'rgba(190,210,235,0.45)'; line((L) => [Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B)]); }
  ctx.strokeStyle = 'rgba(190,210,235,0.22)';
  for (let lon = 0; lon < 360; lon += 30) { const L = lon * Math.PI / 180; line((B) => [Math.cos(B) * Math.cos(L), Math.cos(B) * Math.sin(L), Math.sin(B)]); }
  // night: the half turned away from the Sun (nothing to shade when seen from the Sun)
  if (sq.from !== 'Sun') {
    const s = [dot(g.sun, g.r), dot(g.sun, g.u), dot(g.sun, g.w)], step = 2;
    for (let py = 0; py < H; py += step) for (let px = 0; px < W; px += step) {
      const [x, y] = toKm(px + step / 2, py + step / 2), X = x / RE, Y = y / RE, q = 1 - X * X - Y * Y; if (q <= 0) continue;
      const d = X * s[0] + Y * s[1] + Math.sqrt(q) * s[2];
      if (d < 0.02) { ctx.fillStyle = `rgba(0,0,8,${(0.62 * Math.min(1, (0.02 - d) / 0.06)).toFixed(3)})`; ctx.fillRect(px, py, step, step); }
    }
  }
  ctx.restore();
  ctx.beginPath(); ctx.arc(ox, oy, Rpx, 0, 2 * Math.PI); ctx.strokeStyle = 'rgba(200,220,245,0.5)'; ctx.lineWidth = 1; ctx.stroke();
  // the two places
  g.sites.forEach((p, i) => {
    const [px, py] = toPx(p.x, p.y), ink = i ? '#7fe3e8' : '#ffd27a';
    ctx.beginPath(); ctx.arc(px, py, 3.2, 0, 2 * Math.PI); ctx.fillStyle = ink; ctx.fill(); ctx.strokeStyle = '#05080e'; ctx.lineWidth = 1; ctx.stroke();
    ctx.font = '600 11.5px "Source Sans 3", system-ui, sans-serif'; ctx.fillStyle = ink; ctx.textBaseline = 'middle';
    const other = g.sites[1 - i], left = other && other.x > p.x;
    ctx.textAlign = left ? 'right' : 'left'; ctx.fillText(p.name, px + (left ? -7 : 7), py);
  });
  // the ruler
  if (ruler) {
    const [ax, ay] = toPx(ruler.a[0], ruler.a[1]), [bx, by] = toPx(ruler.b[0], ruler.b[1]), L = Math.hypot(bx - ax, by - ay) || 1, nx = -(by - ay) / L * 5, ny = (bx - ax) / L * 5;
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by);
    ctx.moveTo(ax - nx, ay - ny); ctx.lineTo(ax + nx, ay + ny); ctx.moveTo(bx - nx, by - ny); ctx.lineTo(bx + nx, by + ny); ctx.stroke();
  }
  // scale bar
  const want = view.kmpx * W * 0.28, pow = 10 ** Math.floor(Math.log10(want)), bar = [1, 2, 5, 10].map((m) => m * pow).filter((v) => v <= want).pop() || pow;
  const bl = bar / view.kmpx, y0 = H - 12;
  ctx.strokeStyle = '#dbe5f0'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(10, y0 - 4); ctx.lineTo(10, y0); ctx.lineTo(10 + bl, y0); ctx.lineTo(10 + bl, y0 - 4); ctx.stroke();
  ctx.font = '11px "JetBrains Mono", monospace'; ctx.fillStyle = '#dbe5f0'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillText(fmtKm(bar), 14 + bl, y0 + 2);
  const out = card.body.querySelector('.sq-read');
  const txt = ruler ? `Ruler: ${fmtKm(Math.hypot(ruler.b[0] - ruler.a[0], ruler.b[1] - ruler.a[1]))}` : 'Drag on the picture to measure.';
  if (out && out.textContent !== txt) out.textContent = txt;
}

function build() {
  const from = NAMES[sq.from];
  card.body.innerHTML =
    `<div class="row sq-from"><span>Seen from:</span>${Object.keys(NAMES).map((id) => `<button class="btn${sq.from === id ? ' on' : ''}" data-from="${id}" aria-pressed="${sq.from === id}">${id === 'Moon' ? 'the Moon' : 'the Sun'}</button>`).join('')}</div>` +
    `<canvas class="sq-cv" aria-label="The Earth as ${from} sees it, with the two places marked"></canvas>` +
    `<div class="row"><span class="sq-read" aria-live="polite"></span><span style="flex:1"></span><button class="btn" data-act="sites" title="Zoom in on the two places"${cmp.obs2 ? '' : ' disabled'}>Zoom to the places</button><button class="btn" data-act="earth">Whole Earth</button></div>` +
    `<p class="hint">The Earth as ${esc(from)} sees it at this instant, north up. Lengths on this picture are the square-on part: the part of a baseline that makes a shift. Drag to measure; the scroll wheel zooms.` +
    (cmp.obs2 ? '' : ' Add a second place under <b>Two observers</b> to see both.') + `</p>`;
  cv = card.body.querySelector('canvas');
  cv.addEventListener('pointerdown', (e) => { cv.setPointerCapture(e.pointerId); const k = toKm(e.offsetX, e.offsetY); drag = true; ruler = { a: k, b: k }; redraw(); });
  cv.addEventListener('pointermove', (e) => { if (!drag) return; ruler = { ...ruler, b: toKm(e.offsetX, e.offsetY) }; redraw(); });
  cv.addEventListener('pointerup', () => { drag = false; if (ruler && ruler.a[0] === ruler.b[0] && ruler.a[1] === ruler.b[1]) ruler = null; redraw(); });
  cv.addEventListener('wheel', (e) => {
    e.preventDefault();
    const [kx, ky] = toKm(e.offsetX, e.offsetY), f = Math.exp(Math.max(-1, Math.min(1, e.deltaY * 0.0025)));
    view.kmpx = Math.max(2, Math.min(RE / 40, view.kmpx * f));
    view.cx = kx - (e.offsetX - cv.clientWidth / 2) * view.kmpx; view.cy = ky + (e.offsetY - cv.clientHeight / 2) * view.kmpx; redraw();
  }, { passive: false });
  lastKey = ''; redraw();
}

export function setSquareFrom(id) { if (NAMES[id]) { sq.from = id; ruler = null; view.fit = view.fit || 'earth'; if (card && card.isOpen()) build(); } }

export function initSquareOn() {
  card = makeCard('squareon', 'Earth seen square-on', { onOpen() { view.fit = cmp.obs2 ? 'sites' : 'earth'; ruler = null; build(); } });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.from) { sq.from = b.dataset.from; ruler = null; build(); }
    else if (b.dataset.act === 'sites' || b.dataset.act === 'earth') { view.fit = b.dataset.act; lastKey = ''; redraw(); }
  });
  on('frame', () => redraw());
  on('compare', () => { if (card.isOpen()) { view.fit = cmp.obs2 ? 'sites' : 'earth'; ruler = null; build(); } });
  window.addEventListener('resize', () => { lastKey = ''; redraw(); });
  return card;
}
