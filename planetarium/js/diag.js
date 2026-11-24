// diag.js: a small flight recorder. Keeps the last 30 s of things that make a picture jump or blink (slow frames, sudden jumps of the followed object
// or of the sky's brightness, layout shifts, canvas resizes, a lost graphics context). Nothing leaves the page: type planetarium.diag() in the console.

import { on, state, eff } from './state.js';
import { cam } from './camera.js';
import { R } from './render/proj.js';

const log = [], KEEP = 30000;
let last = null;
function note(kind, data) {
  const t = performance.now();
  log.push({ t, kind, clock: new Date(state.timeMs).toISOString().slice(0, 19), rate: state.playing ? state.rate : 0, fov: +cam.fov.toPrecision(3), sel: state.selected ? state.selected.id || state.selected.kind : '', ...data });
  while (log.length && t - log[0].t > KEEP) log.shift();
  if (log.length > 400) log.shift();
}
export function initDiag(canvas) {
  on('frame', (perf) => {
    const now = performance.now(), sky = R.sky, c = { now, T: state.timeMs, lim: sky.limMag, day: sky.day, steady: eff.steady, w: cam.w, h: cam.h, fov: cam.fov };
    if (state.playing && document.visibilityState === 'visible' && last) {
      const gap = now - last.now;
      if (gap > 80 && Math.abs(state.rate) > 1) note('slow frame', { ms: Math.round(gap), js: Math.round(perf.frameMs) });
      if (Math.abs(c.day - last.day) > 0.15 || (Math.abs(c.lim - last.lim) > 1.5 && c.fov === last.fov)) note('sky jump', { day: [last.day.toFixed(2), c.day.toFixed(2)], lim: [last.lim.toFixed(1), c.lim.toFixed(1)] });
      if (c.steady !== last.steady) note('steady sky', { from: last.steady, to: c.steady });
      if (c.w !== last.w || c.h !== last.h) note('canvas size', { from: [last.w, last.h], to: [c.w, c.h] });
    }
    last = c;
  });
  canvas.addEventListener('contextlost', () => note('canvas context lost', {}));
  on('gl-lost', () => note('graphics context lost', {}));
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.value > 0.002) note('layout shift', { value: +e.value.toFixed(4), what: e.sources && e.sources.map((s) => s.node && (s.node.id || s.node.className)).join(' | ') }); }).observe({ type: 'layout-shift' }); } catch (e) { /* not supported */ }
  if (window.planetarium) window.planetarium.diag = () => { console.table(log.map((e) => ({ ...e, t: ((e.t - performance.now()) / 1000).toFixed(1) + ' s' }))); return JSON.stringify(log); };
}
