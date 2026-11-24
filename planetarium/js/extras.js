// extras.js: wires the teaching features and the polish layer into the app without touching the
// core UI module: deep-sky list, Hubble's-law lab, quiz, Milky Way, night mode, screenshot, the pointer
// read-out, the right-click menu, the phone "More" sheet, the first-run hint and load-error toasts.
// main.js calls initExtras() once and routes sky clicks through extrasClick().

import { state, on, emit } from './state.js';
import { cam } from './camera.js';
import { addOverlay, perf } from './renderer.js';
import { stars } from './catalog.js';
import { wallParts, fmtDate, fmtTime, zoneLabel } from './timeutil.js';
import { fmtFov, fmtLat, fmtLon } from './astro.js';
import { xs, loadXs, saveXs, el, esc, toast, addTip, openPanel, download, isNarrow } from './xui.js';
import { milkyWay, loadMilkyWay } from './milkyway.js';
import { initDsoList } from './dsolist.js';
import { initHubble } from './hubble.js';
import { initQuiz } from './quiz.js';
import { initCursor } from './cursor.js';
import { initContextMenu, contextSwallowsClick } from './ctxmenu.js';
import { drawSkyMarks } from './skymarks.js';

const S = (body) => `<svg class="line" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const dot = (x, y, r = 1.4) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
export const XICON = {
  milkyWay: S(`<path d="M3 18C7 10 14 5.500 21 4.500"/><path d="M5.500 20.500C9 13.500 15 9 21.500 8" opacity=".55"/>${dot(8, 9)}${dot(15.5, 14.5)}${dot(18.5, 18.5, 1.1)}${dot(4.5, 6, 1.1)}`),
  list: S(`<path d="M9 6.500h11M9 12h11M9 17.500h11"/><ellipse cx="4.800" cy="6.500" rx="2" ry="1.200" transform="rotate(-25 4.800 6.500)"/><circle cx="4.800" cy="12" r="1.500" stroke-dasharray="1.600 1.300"/><rect x="3.400" y="16.100" width="2.800" height="2.800"/>`),
  hubble: S(`<path d="M4 4v16h16"/><path d="M4 20 19 7" stroke-dasharray="2.600 2.400"/>${dot(8, 15.5, 1.6)}${dot(11.5, 14, 1.6)}${dot(14, 10.2, 1.6)}${dot(17.5, 9.2, 1.6)}`),
  quiz: S(`<circle cx="12" cy="12" r="9"/><path d="M9.300 9.300a2.800 2.800 0 1 1 4.200 2.500c-.9.600-1.500 1.100-1.500 2.200"/>${dot(12, 17, 1.1)}`),
  night: S(`<path d="M19.500 14.500A8 8 0 0 1 9.500 4.500a8 8 0 1 0 10 10z"/>`),
  camera: S(`<path d="M4 8h3.200l1.500-2.200h6.600L16.800 8H20v10.500H4z"/><circle cx="12" cy="13" r="3.300"/>`),
  more: S(`${dot(6, 12, 1.7)}${dot(12, 12, 1.7)}${dot(18, 12, 1.7)}`),
};

const $ = (id) => document.getElementById(id);
let quiz = null, hubble = null, dsoList = null;

export function initExtras({ canvas }) {
  loadXs();
  dsoList = initDsoList();
  hubble = initHubble();
  quiz = initQuiz();
  addOverlay((ctx, R) => { drawSkyMarks(ctx, R); hubble.draw(ctx, R); quiz.draw(ctx, R); });
  initCursor(canvas);
  initContextMenu(canvas, { dsoList, hubble, quizActive: () => quiz.active() });

  buildActions();
  buildToolbarExtras();
  buildDrawerExtras();
  buildMoreSheet();
  polishTips();
  setNight(xs.night, true);
  window.addEventListener('keydown', onKey, true);
  on('catalog', onCatalog);
  firstRunHint(canvas);
  if (xs.milkyWay) setTimeout(loadMilkyWay, 300);
  if (window.planetarium) Object.assign(window.planetarium, { xs, quiz, hubble, dsoList, milkyWay });
}

/** Sky clicks pass through here first. True = the click was used (do not select). */
export function extrasClick(x, y, ref) {
  if (contextSwallowsClick()) return true;
  if (quiz && quiz.active()) return quiz.click(x, y, ref);
  return false;
}

// ---- actions: top-bar buttons (laptop) and menu entries (always) ----------------------------
const ACTIONS = [
  { id: 'xList', icon: 'list', label: 'Deep-sky list', k: 'O', run: () => dsoList.panel.toggle(), on: () => dsoList.panel.isOpen() },
  { id: 'xHubble', icon: 'hubble', label: 'Hubble’s-law lab', k: 'H', run: () => hubble.panel.toggle(), on: () => hubble.panel.isOpen() },
  { id: 'xQuiz', icon: 'quiz', label: 'Sky quiz', k: '', run: () => quiz.panel.toggle(), on: () => quiz.panel.isOpen() },
  null,
  { id: 'xNight', icon: 'night', label: 'Night mode (red)', k: 'N', run: () => setNight(!xs.night), on: () => xs.night },
  { id: 'xShot', icon: 'camera', label: 'Save a screenshot', k: 'Ctrl S', run: screenshot },
];
function buildActions() {
  const bar = document.querySelector('.top-actions'), first = $('settingsBtn');
  const menu = $('menu'), before = $('mInfo');
  for (const a of ACTIONS) {
    if (!a) { const sep = el('div', 'xmenu-sep'); menu.insertBefore(sep, before); continue; }
    const b = el('button', 'iconbtn xact', XICON[a.icon]); b.type = 'button'; b.id = a.id;
    addTip(b, a.label, a.k);
    b.addEventListener('click', a.run);
    bar.insertBefore(b, first);
    const m = el('button', 'xmenu-item', `<span class="ico">${XICON[a.icon]}</span><span>${esc(a.label)}</span>${a.k ? `<kbd>${esc(a.k)}</kbd>` : ''}`);
    m.type = 'button'; m.dataset.act = a.id;
    m.addEventListener('click', () => { menu.hidden = true; a.run(); });
    menu.insertBefore(m, before);
  }
  menu.insertBefore(el('div', 'xmenu-sep'), before);
  on('render', syncActions);
  syncActions();
}
let lastSync = '';
function syncActions() {
  const key = ACTIONS.map((a) => (a && a.on ? +a.on() : 0)).join('') + (xs.milkyWay ? 1 : 0);
  if (key === lastSync) return;
  lastSync = key;
  for (const a of ACTIONS) {
    if (!a || !a.on) continue;
    const v = String(!!a.on());
    $(a.id).setAttribute('aria-pressed', v);
    const m = $('menu').querySelector(`[data-act="${a.id}"]`); if (m) m.setAttribute('aria-pressed', v);
  }
  const mwBtn = document.querySelector('.tool[data-key="milkyWay"]'); if (mwBtn) mwBtn.setAttribute('aria-pressed', String(xs.milkyWay));
  const mwChk = $('xMwChk'); if (mwChk) mwChk.checked = xs.milkyWay;
}

// ---- Milky Way toggle: toolbar button next to Atmosphere, and a drawer checkbox -------------
export function setMilkyWay(v) {
  xs.milkyWay = v === undefined ? !xs.milkyWay : !!v;
  saveXs();
  if (xs.milkyWay) {
    loadMilkyWay();
    const sky = perf.sky;
    if (milkyWay.status === 'error') toast('The Milky Way map did not load (' + milkyWay.error + '). It will try again shortly.', { kind: 'err' });
    else if (sky && sky.atmo && sky.base < 5.2) toast(sky.dayLoss > 1 ? 'Milky Way on. The sky is too bright to see it right now.' : 'Milky Way on, but this sky is too bright for it. Lower the light pollution in Settings.', { ms: 5200 });
  }
  emit('render'); syncActions();
}
function buildToolbarExtras() {
  const bar = $('toolbar');
  const b = el('button', 'tool', XICON.milkyWay); b.type = 'button'; b.dataset.key = 'milkyWay';
  addTip(b, 'Milky Way', 'W');
  b.addEventListener('click', () => setMilkyWay());
  const anchor = bar.querySelector('.tool[data-key="atmosphere"]');
  bar.insertBefore(b, anchor || null);
}
function buildDrawerExtras() {
  const box = $('showChecks');
  if (!box) return;
  const l = el('label', 'check', `<input type="checkbox" id="xMwChk"> Milky Way <span class="k">W</span>`);
  box.appendChild(l);
  l.querySelector('input').addEventListener('change', (e) => setMilkyWay(e.target.checked));
}

// ---- night mode ----------------------------------------------------------------------------
function setNight(v, quiet = false) {
  xs.night = !!v; saveXs();
  if (xs.night && !$('xNightSvg')) {
    // everything is rendered through one colour matrix: brightness becomes red, green and blue go to zero
    const svg = el('div', '', `<svg id="xNightSvg" width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="xNightRed" color-interpolation-filters="sRGB">` +
      `<feColorMatrix type="matrix" values="0.42 0.52 0.22 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0"/></filter></svg>`);
    document.body.appendChild(svg.firstChild);
  }
  document.documentElement.classList.toggle('night', xs.night);
  if (!quiet) toast(xs.night ? 'Night mode on: everything in red to protect dark-adapted eyes. Press N to leave.' : 'Night mode off.', { ms: 2600 });
  emit('render'); syncActions();
}

// ---- screenshot ----------------------------------------------------------------------------
function screenshot() {
  const sky = $('sky');
  try {
    const c = document.createElement('canvas'); c.width = sky.width; c.height = sky.height;
    const g = c.getContext('2d'), k = sky.width / sky.clientWidth;
    g.drawImage(sky, 0, 0);
    // caption: where, when, how wide. Drawn on the copy only.
    const l = state.loc, p = wallParts(state.timeMs, l.tz);
    const text = `${l.name}  ${fmtLat(l.lat)} ${fmtLon(l.lon)}   ${fmtDate(p)} ${fmtTime(p)} ${zoneLabel(state.timeMs, l.tz)}   field ${fmtFov(cam.fov)}`;
    const fs = Math.max(11, Math.min(14, sky.clientWidth / 60)) * k, pad = 9 * k;
    g.font = `500 ${fs}px 'JetBrains Mono', ui-monospace, monospace`; g.textBaseline = 'alphabetic';
    const mark = 'Astro Labs planetarium', tw = g.measureText(text).width, mw = g.measureText(mark).width;
    const h = fs + 2 * pad;
    g.fillStyle = 'rgba(4,7,13,0.78)'; g.fillRect(0, c.height - h, c.width, h);
    g.fillStyle = '#dfe8f2'; g.fillText(text, pad * 1.4, c.height - pad - fs * 0.12);
    if (tw + mw + pad * 5 < c.width) { g.fillStyle = '#94a3b5'; g.fillText(mark, c.width - mw - pad * 1.4, c.height - pad - fs * 0.12); }
    const stamp = `${fmtDate(p)}_${fmtTime(p).replace(/:/g, '')}`;
    c.toBlob((blob) => {
      if (!blob) { toast('The browser could not make the image.', { kind: 'err' }); return; }
      download(`planetarium_${stamp}.png`, blob);
      toast(`Screenshot saved: planetarium_${stamp}.png (${c.width} × ${c.height} px)`);
    }, 'image/png');
  } catch (e) {
    console.warn(e);
    toast('Could not save a screenshot (' + e.message + ').', { kind: 'err' });
  }
}

// ---- phone: the toolbar keeps a few toggles and a "More" sheet lists them all, with names ----
function buildMoreSheet() {
  const bar = $('toolbar');
  const more = el('button', 'tool x-more', XICON.more); more.type = 'button'; more.dataset.key = 'xMore';
  more.setAttribute('aria-label', 'All display toggles'); more.setAttribute('aria-haspopup', 'dialog'); more.setAttribute('aria-expanded', 'false');
  bar.appendChild(more);
  const sheet = el('div', 'xsheet'); sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Display toggles');
  document.body.appendChild(sheet);
  const fill = () => {
    sheet.innerHTML = '<div class="xsheet-head"><span>Show on the sky</span><button class="close" type="button" aria-label="Close">&times;</button></div><div class="xsheet-grid"></div>';
    const grid = sheet.querySelector('.xsheet-grid');
    bar.querySelectorAll('.tool:not(.x-more)').forEach((t) => {
      const name = (t.dataset.tip || t.getAttribute('aria-label') || t.dataset.key).replace(/\s*\([^)]*\)\s*$/, '');
      const b = el('button', 'xsheet-item', `<span class="ico">${t.innerHTML}</span><span class="nm">${esc(name)}</span>`);
      b.type = 'button'; b.setAttribute('aria-pressed', t.getAttribute('aria-pressed') || 'false');
      b.addEventListener('click', () => { t.click(); setTimeout(() => b.setAttribute('aria-pressed', t.getAttribute('aria-pressed') || 'false'), 0); });
      grid.appendChild(b);
    });
    sheet.querySelector('.close').addEventListener('click', () => open(false));
  };
  const open = (v) => { if (v) fill(); sheet.hidden = !v; more.setAttribute('aria-expanded', String(v)); more.setAttribute('aria-pressed', String(v)); };
  more.addEventListener('click', () => open(sheet.hidden));
  document.addEventListener('pointerdown', (e) => { if (!sheet.hidden && !sheet.contains(e.target) && !more.contains(e.target)) open(false); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !sheet.hidden) { open(false); e.stopPropagation(); } }, true);
}

// ---- one tooltip style everywhere ----------------------------------------------------------
function polishTips() {
  const keys = { settingsBtn: '', menuBtn: '', tSlower: 'J', tPlay: '7', tFaster: 'L', tNow: '8', placeBtn: '', clockBtn: '' };
  for (const id of Object.keys(keys)) {
    const b = $(id); if (!b || !b.title) continue;
    addTip(b, b.title.replace(/\s*\([^)]*\)\s*$/, ''), keys[id]);
  }
}

// ---- keyboard (capture phase, so it runs before the core handler) ---------------------------
function onKey(e) {
  const t = e.target;
  const typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable);
  if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 's') { e.preventDefault(); e.stopPropagation(); screenshot(); return; }
  if (e.key === 'Escape') {
    // the core closes its own modal / menu / drawer / popover first; then an open panel of ours
    const coreOpen = document.querySelector('.modal-backdrop.show') || ['menu', 'timePop', 'drawer'].some((id) => $(id) && !$(id).hidden);
    const p = openPanel();
    if (!coreOpen && p) {
      if (typing) { t.blur(); $('sky').focus({ preventScroll: true }); }
      else p.close();
      e.stopPropagation();
    }
    return;
  }
  if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('.modal-backdrop.show')) return;
  if (quiz.active() && quiz.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
  const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  const used = () => { e.preventDefault(); e.stopPropagation(); };
  if (k === 'w') { setMilkyWay(); used(); }
  else if (k === 'n') { setNight(!xs.night); used(); }
  else if (k === 'o') { dsoList.panel.toggle(); used(); }
  else if (k === 'h') { hubble.panel.toggle(); used(); }
}

// ---- loading problems the reader should hear about ------------------------------------------
let warnedTier = -1e9;
function onCatalog(what) {
  if (what === 'stars-error') {
    const failed = stars.tiers.filter((t) => t.failed);
    if (failed.length && performance.now() - warnedTier > 30000) {
      warnedTier = performance.now();
      toast(`Fainter stars did not load (${failed.map((t) => t.file).join(', ')}). Showing stars to magnitude ${stars.tiers.filter((t) => t.loaded).reduce((m, t) => Math.max(m, t.magMax), 0)} only; retrying.`, { kind: 'err', ms: 7000 });
    }
  } else if (what === 'milkyway-error' && xs.milkyWay) {
    toast('The Milky Way map did not load. Everything else works; it will try again shortly.', { kind: 'warn', ms: 5000 });
  }
}

// ---- first-run hint ------------------------------------------------------------------------
function firstRunHint(canvas) {
  if (xs.hintSeen) return;
  const touch = window.matchMedia('(pointer: coarse)').matches;
  const hint = el('div', 'xhint', touch
    ? '<span><b>Drag</b> to look around</span><span><b>Pinch</b> to zoom</span><span><b>Tap</b> an object for details</span>'
    : '<span><b>Drag</b> to look around</span><span><b>Scroll</b> to zoom</span><span><kbd>/</kbd> to search</span><span><b>Right-click</b> for more</span>');
  hint.setAttribute('role', 'note');
  document.body.appendChild(hint);
  let gone = false;
  const done = () => {
    if (gone) return; gone = true;
    xs.hintSeen = true; saveXs();
    hint.classList.add('bye'); setTimeout(() => hint.remove(), 500);
    canvas.removeEventListener('pointerdown', done); canvas.removeEventListener('wheel', done); window.removeEventListener('keydown', done);
  };
  canvas.addEventListener('pointerdown', done); canvas.addEventListener('wheel', done, { passive: true }); window.addEventListener('keydown', done);
  setTimeout(done, 14000);
}
export { isNarrow };
