// renderer.js: owns the canvas and draws one frame by calling each layer in order.

import { state, on, emit } from './state.js';
import { cam, resize, update } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { setStarEpoch, wantMagnitude } from './catalog.js';
import { advance } from './clock.js';
import { stepNav } from './nav.js';
import { beginPicks } from './picks.js';
import { refHorApparent } from './objects.js';
import { projectHor } from './camera.js';
import { R } from './render/proj.js';
import { LabelLayer } from './render/labels.js';
import { skyConditions, drawSkyBackground } from './render/sky.js';
import { drawStars, stats as starStats } from './render/stars.js';
import { drawGrids } from './render/grids.js';
import { drawConstellations } from './render/constellations.js';
import { drawBodies } from './render/planets.js';
import { drawDso } from './render/dso.js';
import { drawGround } from './render/ground.js';
import { drawMilkyWay } from './milkyway.js';
import { drawDeepStars, deep } from './deepstars.js';
import { fieldFeedback } from './render/density.js';

let canvas, ctx, dpr = 1, dirty = true, lastDraw = 0;
const labels = new LabelLayer();
const overlays = [];          // extra draw callbacks (measure tool, quiz, ...): fn(ctx, R)
export const perf = { frameMs: 0, avgMs: 0, stars: 0, limMag: 0, fov: 0, stage: {} };

export function addOverlay(fn) { overlays.push(fn); }
export function requestRender() { dirty = true; }

export function initRenderer(el) {
  canvas = el; ctx = canvas.getContext('2d', { alpha: false });
  const fit = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr)); canvas.height = Math.max(1, Math.round(h * dpr));
    resize(w, h); dirty = true;
  };
  new ResizeObserver(fit).observe(canvas);
  window.addEventListener('resize', fit);
  fit();
  on('render', requestRender);
  requestAnimationFrame(loop);
}

function loop(now) {
  const ticking = advance(now);
  // at real-time rates the sky creeps; a few redraws a second are plenty unless zoomed far in
  const slow = Math.abs(state.rate) <= 1 && cam.fov > 1;
  if (ticking && (!slow || now - lastDraw > 250)) dirty = true;
  const frame = getFrame();
  if (stepNav(now, frame)) dirty = true;
  if (dirty) { dirty = false; lastDraw = now; draw(frame); }
  requestAnimationFrame(loop);
}

// Screen rectangles covered by the floating UI, so sky labels are not drawn underneath it.
let blockCache = null, blockAt = 0;
function uiBlocks() {
  const now = performance.now();
  if (blockCache && now - blockAt < 400) return blockCache;
  blockAt = now; blockCache = [];
  const c = canvas.getBoundingClientRect();
  for (const sel of ['.brand', '.search', '.top-actions', '.infopanel', '.bottombar', '.readout', '.measurepanel', '.xcursor:not(.follow)', '.xpanel', '.xhint']) {
    const el = document.querySelector(sel);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) blockCache.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]);
  }
  return blockCache;
}
const sp = [0, 0];
function draw(frame) {
  const t0 = performance.now();
  setStarEpoch(frame.years);
  const bodies = getBodies(frame);
  update(frame);
  const sky = skyConditions(bodies);
  wantMagnitude(sky.limMag);
  R.ctx = ctx; R.frame = frame; R.bodies = bodies; R.sky = sky; R.labels = labels;
  R.atmo = state.show.atmosphere; R.refr = state.show.refraction; R.ground = state.show.ground;
  labels.begin(); beginPicks();
  for (const b of uiBlocks()) labels.block(b[0], b[1], b[2], b[3]);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // per-stage times (ms) in perf.stage, for `planetarium.perf` in the console
  const st = perf.stage; let tl = performance.now();
  const lap = (k) => { const n = performance.now(); st[k] = n - tl; tl = n; };
  st.setup = tl - t0;
  drawSkyBackground(ctx, sky, bodies); lap('sky');
  drawMilkyWay(ctx); lap('milkyway');
  drawGrids(ctx); lap('grids');
  drawConstellations(ctx); lap('constellations');
  drawStars(ctx); lap('stars');
  drawDeepStars(ctx); lap('deep');         // Gaia DR3, bundled tiles + online: the stars fainter than the base catalogue holds (js/deepstars.js)
  drawDso(ctx); lap('dso');
  drawBodies(ctx); lap('bodies');
  drawGround(ctx); lap('ground');
  drawSelection(frame, bodies);
  for (const fn of overlays) fn(ctx, R);
  lap('overlays');
  labels.flush(ctx, cam.w, cam.h, sky.day > 0.4 ? `rgba(16,38,82,${0.35 + 0.2 * (1 - sky.day)})` : 'rgba(2,6,14,0.85)');
  lap('labels');

  perf.frameMs = performance.now() - t0;
  perf.avgMs = perf.avgMs ? perf.avgMs * 0.9 + perf.frameMs * 0.1 : perf.frameMs;
  perf.stars = starStats.drawn + deep.stats.drawn; perf.limMag = sky.limMag; perf.fov = cam.fov; perf.sky = sky;
  fieldFeedback(perf.stars, sky);          // render/density.js: was this field as rich as the star-count map said?
  emit('frame', perf);
}

function drawSelection(frame, bodies) {
  const ref = state.selected;
  if (!ref) return;
  const h = refHorApparent(ref, frame, bodies);
  if (!h || !projectHor(h, sp)) return;
  let r = 13;
  if (ref.kind === 'body') { const b = bodies.byId[ref.id]; if (b) r = Math.max(r, b.angRadius * cam.pxPerDeg * (b.id === 'Saturn' ? 2.4 : 1) + 8); }
  r = Math.min(r, Math.max(cam.w, cam.h));
  ctx.strokeStyle = state.tracking ? 'rgba(255,196,96,0.95)' : 'rgba(255,214,140,0.85)'; ctx.lineWidth = 1.5;
  // four corner brackets, Stellarium-style pointer
  const g = Math.PI / 7;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; ctx.moveTo(sp[0] + r * Math.cos(a - g), sp[1] + r * Math.sin(a - g)); ctx.arc(sp[0], sp[1], r, a - g, a + g); }
  ctx.stroke();
}
