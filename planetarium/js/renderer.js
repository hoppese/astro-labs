// renderer.js: owns the canvas and draws one frame by calling each layer in order.

import { state, eff, on, emit } from './state.js';
import { cam, resize, update } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { setStarEpoch, wantMagnitude, stars, epochTolFor } from './catalog.js';
import { advance } from './clock.js';
import { stepNav } from './nav.js';
import { beginPicks } from './picks.js';
import { refHorApparent } from './objects.js';
import { projectHor } from './camera.js';
import { R } from './render/proj.js';
import { loupeOpen } from './notebook/loupe.js';
import { LabelLayer } from './render/labels.js';
import { skyConditions, drawSkyBackground } from './render/sky.js';
import { drawStars, stats as starStats } from './render/stars.js';
import { drawTransients } from './render/transients.js';
import { drawGrids } from './render/grids.js';
import { drawConstellations } from './render/constellations.js';
import { drawBodies } from './render/planets.js';
import { drawDso } from './render/dso.js';
import { drawGround } from './render/ground.js';
import { drawMilkyWay } from './milkyway.js';
import { drawSkyImages } from './skyimages.js';
import { drawDeepStars, deep } from './deepstars.js';
import { fieldFeedback } from './render/density.js';
import { see } from './notebook/seeing.js';
import { allPicks } from './picks.js';
import { stepSteady, drawSteadyFade } from './steady.js';
import { sameRef } from './objects.js';

let canvas, ctx, dpr = 1, dirty = true, lastDraw = 0;
const labels = new LabelLayer();
const overlays = [];          // extra draw callbacks (measure tool, quiz, ...): fn(ctx, R)
export const perf = { frameMs: 0, avgMs: 0, stars: 0, limMag: 0, fov: 0, stage: {} };

export function addOverlay(fn) { overlays.push(fn); }
const underlays = [];        // drawn just before the Sun, Moon and planets, so their discs cover them (orbit lines)
export function addUnderlay(fn) { underlays.push(fn); }
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
  requestAnimationFrame(loop);      // first: an error in one frame must not stop the sky for good
  const ticking = advance(now);
  // at real-time rates the sky creeps; a few redraws a second are plenty unless zoomed far in
  const slow = Math.abs(state.rate) <= 1 && cam.fov > 1;
  if (ticking && (!slow || now - lastDraw > 250)) dirty = true;
  const frame = getFrame();
  if (stepSteady(now, frame, canvas)) dirty = true;      // before stepNav: it can change which mount the view is held in
  if (stepNav(now, frame)) dirty = true;
  if (dirty) { dirty = false; lastDraw = now; draw(frame, now); }
}

// Screen rectangles covered by the floating UI, so sky labels are not drawn underneath it.
let blockCache = null, blockAt = 0;
function uiBlocks() {
  const now = performance.now();
  if (blockCache && now - blockAt < 400) return blockCache;
  blockAt = now; blockCache = [];
  const c = canvas.getBoundingClientRect();
  for (const sel of ['.brand', '.search', '.top-actions', '.infopanel', '.bottombar', '.readout', '.measurepanel', '.xcursor:not(.follow)', '.xpanel', '.xhint', '.steady-note', '.imgcredit', '.trackchip', '.ptbar', '.ptgo']) {
    const el = document.querySelector(sel);
    if (!el || el.hidden) continue;
    const r = el.getBoundingClientRect();
    if (r.width && r.height) blockCache.push([r.left - c.left - 4, r.top - c.top - 4, r.right - c.left + 4, r.bottom - c.top + 4]);
  }
  return blockCache;
}
const sp = [0, 0];
function draw(frame, now) {
  const t0 = performance.now();
  // time running fast past a body: re-place the 120,000 stars every 18 h of sky time, not every frame (7 ms each; the fastest moves 0.02 arcsec meanwhile)
  stars.epochTol = eff.steady && state.tracking && state.trackRef && state.trackRef.kind === 'body' ? Math.max(0.002, Math.abs(state.rate) * 0.5 / 31557600, epochTolFor(cam.fov)) : epochTolFor(cam.fov);          // before the frame, not after it (catalog.js)
  setStarEpoch(frame.years);
  const bodies = getBodies(frame);
  update(frame);
  const sky = skyConditions(bodies);
  wantMagnitude(sky.limMag);
  R.ctx = ctx; R.frame = frame; R.bodies = bodies; R.sky = sky; R.labels = labels;
  R.atmo = eff.atmosphere; R.refr = eff.refraction; R.ground = eff.ground;
  labels.begin(); beginPicks();
  for (const b of uiBlocks()) labels.block(b[0], b[1], b[2], b[3]);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // per-stage times (ms) in perf.stage, for `planetarium.perf` in the console
  const st = perf.stage; let tl = performance.now();
  const lap = (k) => { const n = performance.now(); st[k] = n - tl; tl = n; };
  st.setup = tl - t0;
  drawSkyBackground(ctx, sky, bodies); lap('sky');
  drawMilkyWay(ctx); lap('milkyway');
  drawSkyImages(ctx); lap('images');       // deep-sky pictures and the survey layer, under everything else (js/skyimages.js)
  drawGrids(ctx); lap('grids');
  drawConstellations(ctx); lap('constellations');
  drawStars(ctx); lap('stars');
  drawDeepStars(ctx); lap('deep');
  drawTransients(ctx);                     // a Cepheid in another galaxy and the supernovae (js/variables.js): models, not catalog stars         // Gaia DR3, bundled tiles + online: the stars fainter than the base catalog holds (js/deepstars.js)
  drawDso(ctx); lap('dso');
  for (const fn of underlays) fn(ctx, R);
  drawBodies(ctx); lap('bodies');
  drawGround(ctx); lap('ground');
  drawSelection(frame, bodies);
  for (const fn of overlays) fn(ctx, R);
  lap('overlays');
  if (!loupeOpen()) labels.flush(ctx, cam.w, cam.h, sky.day > 0.4 ? `rgba(16,38,82,${0.35 + 0.2 * (1 - sky.day)})` : 'rgba(2,6,14,0.85)');
  drawSteadyFade(ctx, now);
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
  // lab notebook: with simulated measurement noise on, the marker sits on the star's IMAGE in this exposure, not on its true place
  if (see.on && see.noMarker && ref.kind !== 'body') return;          // measuring by eye: brackets round the image would do the centering for the student
  if (see.on && (ref.kind === 'star' || ref.kind === 'gaia')) { for (const it of allPicks()) if (it.ref && it.ref.kind === ref.kind && sameRef(it.ref, ref)) { sp[0] = it.x; sp[1] = it.y; break; } }
  let r = 13;
  if (ref.kind === 'body') { const b = bodies.byId[ref.id]; if (b) { const rp = b.angRadius * cam.pxPerDeg; if (rp > 40) return;      // a disc this large needs no pointer, and brackets along its edge hide contacts
    r = Math.max(r, rp * (b.id === 'Saturn' ? 2.4 : 1) + 8); } }
  r = Math.min(r, Math.max(cam.w, cam.h));
  ctx.strokeStyle = state.tracking && sameRef(ref, state.trackRef) ? 'rgba(255,196,96,0.95)' : 'rgba(255,214,140,0.85)'; ctx.lineWidth = 1.5;
  // four corner brackets, Stellarium-style pointer
  const g = Math.PI / 7;
  ctx.beginPath();
  for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2; ctx.moveTo(sp[0] + r * Math.cos(a - g), sp[1] + r * Math.sin(a - g)); ctx.arc(sp[0], sp[1], r, a - g, a + g); }
  ctx.stroke();
}
