// labs/spectrograph.js: the Spectrograph card. Select a star and it shows the star's spectrum: brightness against wavelength,
// and under it the spectrum as a strip of colour with its dark lines. Point at the plot for the wavelength and brightness there;
// click to pin up to two wavelengths (and read the difference between them, for a Doppler shift). The spectra are MODELS built
// from the star's catalogued MK type and radial velocity (js/spectro.js says how); the card says so.
//
// The types (data/sptype.txt, Hipparcos) are fetched the first time the card opens. During a lab that asks the student to
// classify stars (labs/hidden.js spectroHidden), the type is not printed and the line labels cannot be switched on.

import { state, on } from '../state.js';
import { starRecord, starLabel, dso } from '../catalog.js';
import { makeCard } from './dock.js';
import { el, esc } from './util.js';
import { loadTypes, typeOfHip, makeStar, makeGalaxy, makeBinary, SB2 } from '../spectro.js';
import { jdOf } from '../variables.js';
import { see } from '../notebook/seeing.js';
import { spectroHidden, redshiftHidden } from './hidden.js';

const GALAXY = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);

const VIEWS = { vis: [380, 750], wide: [300, 1000] };
const sp = { binary: 0, view: 'vis', lo: 380, hi: 750, rect: false, labels: false, pins: [], hover: null, star: null, name: '', note: '', loaded: false, failed: false };
let card = null, plot = null, strip = null, read = null, head = null;
let lastGal = null;      // the Hubble lab: the last galaxy shown, kept when a click lands on a faint star by accident

/** The star the card shows: the selection, as {star (js/spectro.js), name, typeText} or a reason why there is none. */
function current() {
  const c = pick();
  if (c.galaxy) lastGal = c;
  else if (lastGal && redshiftHidden() && (!state.selected || state.selected.kind === 'star' || state.selected.kind === 'gaia')) return { ...lastGal, kept: true };
  return c;
}
function pick() {
  const ref = state.selected;
  if (!ref) return { why: 'Select a star to see its spectrum.' };
  if (ref.kind === 'body') {
    if (ref.id === 'Sun') return { name: 'Sun', info: { type: 'G2V', rv: 0, key: 1 } };
    return { why: 'Planets and moons shine by reflected sunlight: select a star.' };
  }
  if (ref.kind === 'gaia') return { why: 'This Gaia star has no catalogued spectral type yet. Try a brighter star (one with a name or a Hipparcos number).' };
  if (ref.kind === 'dso') {      // a galaxy: the light of all its stars together (js/spectro.js makeGalaxy)
    const o = dso.rows[ref.idx];
    if (!o || !GALAXY.has(o.type)) return { why: 'Select a star or a galaxy: a nebula or a cluster has no single spectrum here.' };
    if (o.z == null) return { why: 'The catalogue has no redshift for this galaxy, so there is no model of its spectrum.' };
    return { name: (o.names && o.names[0]) || (o.m ? 'M ' + o.m : o.id), galaxy: { z: o.z, hubble: o.hubble, key: 7e6 + ref.idx } };
  }
  if (ref.kind !== 'star') return { why: 'Select a star to see its spectrum.' };
  const s = starRecord(ref.k, ref.i);
  if (SB2[s.hip]) return { name: starLabel(s), binary: s.hip };      // a double-lined binary: two spectra, shifting with the orbit (js/spectro.js)
  return { name: starLabel(s), info: { type: typeOfHip(s.hip), bv: s.bv, rv: s.rv || 0, key: s.hip || (ref.k * 1e6 + ref.i) } };
}
function rebuild() {
  const c = current();
  if (!(c.kept && sp.star && sp.star.galaxy && sp.name === c.name)) sp.pins = [];
  sp.hover = null; sp.binary = c.binary || 0;
  if (c.why) { sp.star = null; sp.name = ''; sp.note = c.why; return; }
  if (c.binary) {
    sp.star = makeBinary(c.binary, jdOf(state.timeMs), see.seed); sp.name = c.name;
    sp.note = spectroHidden() ? 'Spectral type hidden during this lab.' : `Two stars, ${esc(sp.star.typeText)}: a double-lined binary. Its spectrum changes as the clock runs.`;
    return;
  }
  if (c.galaxy) {
    sp.star = makeGalaxy({ ...c.galaxy, seed: see.seed }); sp.name = c.name;
    sp.note = (c.kept ? 'Still the last galaxy you selected: click or search for another galaxy to change it. ' : '') + `A galaxy: the light of all its stars${sp.star.spiral ? ' and glowing gas' : ''}. ` + (redshiftHidden() ? 'Its redshift is hidden during this lab: measure it.' : `Catalogued redshift z = ${c.galaxy.z} (OpenNGC).`);
    return;
  }
  sp.star = makeStar({ ...c.info, seed: see.seed });
  sp.name = c.name;
  if (!sp.star) { sp.note = 'No spectral type or colour is catalogued for this star.'; return; }
  const hide = spectroHidden();
  sp.note = sp.star.fromColour ? 'No catalogued type: the model is a main-sequence star of this star’s colour.' : hide ? 'Spectral type hidden during this lab.' : `Catalogued type ${esc(sp.star.typeText)} (Hipparcos).`;
}

// ---- drawing ----
/** An RGB colour for a wavelength (nm), after Dan Bruton's approximation; outside 380–750 a dim grey-violet or grey-red. */
function waveRGB(l) {
  let r = 0, g = 0, b = 0;
  if (l < 380) return [70, 50, 90]; if (l > 750) return [90, 40, 40];
  if (l < 440) { r = -(l - 440) / 60; b = 1; } else if (l < 490) { g = (l - 440) / 50; b = 1; } else if (l < 510) { g = 1; b = -(l - 510) / 20; }
  else if (l < 580) { r = (l - 510) / 70; g = 1; } else if (l < 645) { r = 1; g = -(l - 645) / 65; } else r = 1;
  const f = l < 420 ? 0.3 + 0.7 * (l - 380) / 40 : l > 700 ? 0.3 + 0.7 * (750 - l) / 50 : 1;
  return [r, g, b].map((v) => Math.round(255 * Math.pow(v * f, 0.8)));
}
function fit(cv, h) {
  const w = Math.max(200, card.body.clientWidth - 24 || 300), d = window.devicePixelRatio || 1;
  if (cv.width !== Math.round(w * d) || cv.height !== Math.round(h * d)) { cv.width = Math.round(w * d); cv.height = Math.round(h * d); cv.style.width = w + 'px'; cv.style.height = h + 'px'; }
  const ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); return { ctx, w, h };
}
const M = { l: 30, r: 16, t: 8, b: 30 };
const value = (l, noise = true) => (sp.rect ? sp.star.flux(l, noise) / sp.star.continuum(l) : sp.star.flux(l, noise));
function draw() {
  if (!card || !card.isOpen() || !plot) return;
  const { ctx, w, h } = fit(plot, 176);
  ctx.clearRect(0, 0, w, h);
  const pw = w - M.l - M.r, ph = h - M.t - M.b, x = (l) => M.l + (l - sp.lo) / (sp.hi - sp.lo) * pw;
  ctx.font = '10px ui-monospace, SFMono-Regular, Menlo, monospace'; ctx.fillStyle = '#8fa3b8'; ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 1;
  // axes and wavelength ticks
  const span = sp.hi - sp.lo, step = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50, 100, 200].find((s) => span / s <= 7);
  ctx.textAlign = 'center';
  for (let t = Math.ceil(sp.lo / step) * step; t <= sp.hi + 1e-9; t += step) { const X = x(t); ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, M.t + ph); ctx.stroke(); ctx.fillText(+t.toFixed(2) + '', X, h - 17); }
  ctx.fillText('wavelength (nm)', M.l + pw / 2, h - 3);
  if (!sp.star) { ctx.fillStyle = '#8fa3b8'; ctx.textAlign = 'center'; ctx.fillText('no spectrum', M.l + pw / 2, M.t + ph / 2); drawStrip(); return; }
  const n = Math.round(pw * 4), ys = new Float64Array(n + 1);
  let top = 0, low = Infinity;
  for (let i = 0; i <= n; i++) { const v = value(sp.lo + span * i / n); ys[i] = v; if (v > top) top = v; if (v < low) low = v; }
  top = sp.rect ? Math.max(1.1, top * 1.03) : top * 1.08 || 1;
  // divided by the continuum, the plot starts just below the deepest dip (not at 0), so that shallow lines show: a faint second star's, say
  const bot = sp.rect ? Math.max(0, Math.floor((low - 0.03) / 0.05) * 0.05) : 0;
  const y = (v) => M.t + ph - (v - bot) / (top - bot) * ph;
  ctx.textAlign = 'right';
  const ystep = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1].find((s) => (top - bot) / s <= 5);
  for (let v = bot; v <= top + 1e-9; v += ystep) { const Y = y(v); ctx.beginPath(); ctx.moveTo(M.l, Y); ctx.lineTo(M.l + pw, Y); ctx.stroke(); ctx.fillText(v.toFixed(ystep < 0.1 ? 2 : 1), M.l - 4, Y + 3); }
  // line labels (not during a lab that asks for them)
  if (sp.labels && !spectroHidden()) {
    ctx.fillStyle = '#e8b86a'; ctx.strokeStyle = 'rgba(232,184,106,0.5)'; ctx.textAlign = 'left';
    let lastX = -99;
    for (const ln of [...sp.star.lines].filter((q) => q.depth > 0.12 && q.obs > sp.lo && q.obs < sp.hi).sort((a, b) => a.obs - b.obs)) {
      const X = x(ln.obs); ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, M.t + 6); ctx.stroke();
      if (X - lastX > 22) { ctx.save(); ctx.translate(X + 2, M.t + 8); ctx.rotate(Math.PI / 2); ctx.fillText(ln.name, 0, 0); ctx.restore(); lastX = X; }
    }
  }
  // the spectrum
  ctx.strokeStyle = '#eef2f6'; ctx.lineWidth = 1.2; ctx.beginPath();
  for (let i = 0; i <= n; i++) { const X = M.l + pw * i / n, Y = y(ys[i]); if (i) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); }
  ctx.stroke();
  // pins and the pointer
  const mark = (l, col) => { const X = x(l); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X, M.t); ctx.lineTo(X, M.t + ph); ctx.stroke(); ctx.setLineDash([]); };
  for (const p of sp.pins) mark(p, '#7fe3e8');
  if (sp.hover != null) { mark(sp.hover, '#ffd66b'); const Y = y(value(sp.hover)); ctx.fillStyle = '#ffd66b'; ctx.beginPath(); ctx.arc(x(sp.hover), Y, 2.5, 0, 7); ctx.fill(); }
  drawStrip();
}
function drawStrip() {
  const { ctx, w, h } = fit(strip, 26);
  ctx.fillStyle = '#05070a'; ctx.fillRect(0, 0, w, h);
  const pw = w - M.l - M.r;
  for (let i = 0; i < pw; i++) {
    const l = sp.lo + (sp.hi - sp.lo) * (i + 0.5) / pw, c = waveRGB(l), t = sp.star ? Math.max(0, Math.min(1.15, sp.star.transmission(l))) : 0.6;
    ctx.fillStyle = `rgb(${c.map((v) => Math.min(255, Math.round(v * t))).join(',')})`; ctx.fillRect(M.l + i, 3, 1, h - 6);
  }
  ctx.fillStyle = '#8fa3b8'; ctx.font = '9px ui-monospace, Menlo, monospace'; ctx.textAlign = 'left';
  if (sp.lo < 380) ctx.fillText('UV', 4, h / 2 + 3); if (sp.hi > 750) { ctx.textAlign = 'right'; ctx.fillText('IR', w - 2, h / 2 + 3); }
}
function readout() {
  if (!read) return;
  if (!sp.star) { read.innerHTML = ''; return; }
  const f = (l) => `λ <b>${l.toFixed(sp.hi - sp.lo < 30 ? 3 : 2)}</b> nm, ${sp.rect ? 'relative' : 'brightness'} <b>${value(l).toFixed(3)}</b>`;
  let html = sp.hover != null ? f(sp.hover) : 'Point at the spectrum to read it; click to pin.';
  sp.pins.forEach((p, i) => { html += `<br>pin ${i + 1}: ${f(p)}`; });
  if (sp.pins.length === 2) html += `<br>difference: <b>${Math.abs(sp.pins[1] - sp.pins[0]).toFixed(3)}</b> nm`;
  read.innerHTML = html;
}
function render() {
  if (!card || !card.isOpen()) return;
  if (!sp.loaded && !sp.failed) {
    card.body.innerHTML = '<p class="hint">Loading the spectral types…</p>';
    loadTypes().then(() => { sp.loaded = true; rebuild(); build(); }, () => { sp.failed = true; rebuild(); build(); });
    return;
  }
  rebuild(); build();
}
function build() {
  if (!card || !card.isOpen()) return;
  const hide = spectroHidden();
  if (hide) sp.labels = false;
  card.body.innerHTML = '';
  head = el('div', { class: 'spg-head' }, (sp.name ? `<b>${esc(sp.name)}</b><small>${sp.note}</small>` : `<small>${sp.note}</small>`) + `<span class="spg-ycap">${sp.rect ? 'Brightness relative to the continuum (1 = no line)' : (sp.star && sp.star.galaxy ? 'Brightness relative to this galaxy’s peak' : 'Brightness relative to this star’s peak')}</span>`);
  plot = el('canvas', { class: 'spg-plot', tabindex: '0', 'aria-label': 'Spectrum: brightness against wavelength. Click to pin a wavelength; the arrow keys then nudge the last pin.' });
  strip = el('canvas', { class: 'spg-strip', 'aria-hidden': 'true' });
  read = el('div', { class: 'spg-read', role: 'status' });
  const opts = el('div', { class: 'row' },
    `<span class="spg-views" role="group" aria-label="Wavelength range">${[['vis', 'Visible', '380–750 nm'], ['wide', 'Wide', '300–1000 nm'], ['zoom', 'Zoom', 'a range you type']].map(([v, t, tip]) => `<button type="button" class="btn${sp.view === v ? ' primary' : ''}" data-view="${v}" aria-pressed="${sp.view === v}" title="${tip}">${t}</button>`).join('')}</span>` +
    `<span class="spg-zoom"${sp.view === 'zoom' ? '' : ' hidden'}><input type="number" data-k="lo" step="any" value="${sp.lo}" aria-label="From (nm)"> to <input type="number" data-k="hi" step="any" value="${sp.hi}" aria-label="To (nm)"> nm</span>`);
  const chks = el('div', {},
    `<label class="chk"><input type="checkbox" data-k="rect"${sp.rect ? ' checked' : ''}><span>Divide by the continuum<small>The lines against a flat 1, for measuring their depths and positions.</small></span></label>` +
    `<label class="chk"><input type="checkbox" data-k="labels"${sp.labels ? ' checked' : ''}${hide ? ' disabled' : ''}><span>Label the lines${hide ? '<small>Not during this lab: identifying them is the task.</small>' : ''}</span></label>`);
  const pinRow = el('div', { class: 'row' }, '<button class="btn" data-act="clear" type="button">Clear pins</button>');
  const foot = el('p', { class: 'hint' }, sp.star && sp.star.galaxy
    ? 'A <b>model</b> galaxy spectrum built from the galaxy’s catalogued redshift and Hubble type (OpenNGC), not an observed one.'
    : 'A <b>model</b> spectrum built from the star’s catalogued spectral type and radial velocity, not an observed one.');
  card.body.append(head, plot, strip, read, opts, chks, pinRow, foot);
  draw(); readout();
}
function lamAt(e) {
  const r = plot.getBoundingClientRect(), pw = r.width - M.l - M.r, f = (e.clientX - r.left - M.l) / pw;
  return f < 0 || f > 1 ? null : sp.lo + f * (sp.hi - sp.lo);
}

/** For the notebook's Record (js/notebook/host.js): the pinned wavelengths (nm), in the order pinned, and whose spectrum, or null. */
export function spectroPins() { return card && card.isOpen() && sp.star ? { name: sp.name, pins: sp.pins.slice() } : null; }

export function initSpectrograph() {
  card = makeCard('spectro', 'Spectrograph', { onOpen: render });
  card.body.addEventListener('pointermove', (e) => { if (e.target !== plot || !sp.star) return; sp.hover = lamAt(e); draw(); readout(); });
  card.body.addEventListener('pointerleave', () => { sp.hover = null; draw(); readout(); }, true);
  card.body.addEventListener('click', (e) => {
    if (e.target === plot && sp.star) { const l = lamAt(e); if (l != null) { sp.pins = [...sp.pins.slice(-1), l]; draw(); readout(); } return; }
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'clear') { sp.pins = []; draw(); readout(); }
    else if (b.dataset.view) {
      const was = sp.view; sp.view = b.dataset.view;
      if (VIEWS[sp.view]) [sp.lo, sp.hi] = VIEWS[sp.view];
      else if (was !== 'zoom' && redshiftHidden()) [sp.lo, sp.hi] = [385, 410];      // the Hubble lab: calcium K and H, where a redshift is measured
      sp.pins = []; build();
    }
  });
  card.body.addEventListener('change', (e) => {
    const k = e.target.dataset.k; if (!k) return;
    if (k === 'lo' || k === 'hi') {      // a wavelength from 250 to 1100 nm is taken (anything else is refused, with a word why); the two are put in order, at least 0.05 nm apart
      const v = +e.target.value;
      if (!isFinite(v) || v < 250 || v > 1100) { e.target.value = k === 'lo' ? sp.lo : sp.hi; if (read) read.innerHTML = 'The spectrograph covers 250 to 1100 nm: type a wavelength in that range.'; return; }
      let lo = k === 'lo' ? v : sp.lo, hi = k === 'hi' ? v : sp.hi;
      if (lo > hi) [lo, hi] = [hi, lo];
      lo = Math.max(250, Math.min(1099.95, lo)); hi = Math.min(1100, Math.max(250.05, hi));
      if (hi - lo < 0.05) { const mid = (lo + hi) / 2; lo = mid - 0.025; hi = mid + 0.025; }
      sp.lo = +lo.toFixed(3); sp.hi = +hi.toFixed(3);
      const ins = card.body.querySelectorAll('.spg-zoom input'); if (ins.length === 2) { ins[0].value = sp.lo; ins[1].value = sp.hi; }
      sp.pins = []; draw(); readout();
    }
    else if (k === 'rect') { sp.rect = e.target.checked; build(); }
    else if (k === 'labels') { sp.labels = e.target.checked && !spectroHidden(); draw(); }
  });
  // the From and To boxes: typing replaces what is there (appending to it once made 380385 nm, clamped to 1100)
  card.body.addEventListener('focusin', (e) => { if (e.target.matches && e.target.matches('.spg-zoom input')) e.target.select(); });
  // a pin can be nudged with the arrow keys once the plot has the focus (clicking it gives it the focus): a quarter of a pixel's
  // width of wavelength a press, ten times that with Shift
  card.body.addEventListener('keydown', (e) => {
    if (e.target !== plot || !sp.pins.length || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return;
    const pw = Math.max(1, plot.clientWidth - M.l - M.r), step = (sp.hi - sp.lo) / pw / 4 * (e.shiftKey ? 10 : 1);
    sp.pins[sp.pins.length - 1] += e.key === 'ArrowLeft' ? -step : step;
    e.preventDefault(); e.stopPropagation(); draw(); readout();
  });
  on('selection', render);
  on('lab', () => { lastGal = null; render(); });
  // a binary's lines move with the clock: rebuild its spectrum when the time changes (at most once a frame), keeping the pins and the zoom
  let queued = false;
  const moved = () => {
    if (!sp.binary || !card || !card.isOpen() || queued) return;
    queued = true;
    // (the pins are cleared: a wavelength pinned at one time is not a reading at the next, and Record copies the pins)
    requestAnimationFrame(() => { queued = false; if (!sp.binary) return; sp.star = makeBinary(sp.binary, jdOf(state.timeMs), see.seed); sp.pins = []; draw(); readout(); });
  };
  on('time', moved); on('tick', moved);
  window.addEventListener('resize', () => requestAnimationFrame(draw));
  return card;
}
