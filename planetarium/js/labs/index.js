// labs/index.js: start-up for the measurement tools and the classic-measurement labs (Tier 4).
// Adds the "Labs" button and menu to the top bar, the dock of tool cards, the overlays (Earth's
// shadow, second observer, trails), keyboard steps for timing, and URL parameters.
//
// URL parameters (all optional; see setup.js): lab, t, lat, lon, place, tz, target, track, fov,
// az + alt | ra + dec, mount, on, off, play, rate, obs2, align, trail, tools, instructor.

import { takesKeys } from '../focus.js';
import { state, on, emit } from '../state.js';
import { addOverlay } from '../renderer.js';
import { stepTime } from '../clock.js';
import { measure, toggleMeasure } from '../measure.js';
import { el } from './util.js';
import { getCard } from './dock.js';
import { initShadow, drawShadow } from './shadow.js';
import { initStopwatch, mark } from './stopwatch.js';
import { initCorrections, setFx } from './corrections.js';
import { initEvents } from './events.js';
import { initCompare, drawCompare } from './compare.js';
import { initTrails, drawTrail, startTrail, stopTrail, trail, canTrail, trailDefaults } from './trails.js';
import { initLabs, openLabsList, startLab, lab, labLink } from './labs.js';
import { applySetup, describeView, setupFromQuery } from './setup.js';
import { labById } from './presets.js';
import { allTargets } from './targets.js';
import { reloadedLab, initResume } from './resume.js';
import { marks } from './stopwatch.js';
import { initNotebookHost, toggleNotebook, notebookOpen } from '../notebook/host.js';

const FLASK = '<svg class="line" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6M10 3v6l-5.200 9.200A1.800 1.800 0 0 0 6.400 21h11.200a1.800 1.800 0 0 0 1.600-2.800L14 9V3"/><path d="M7.600 15h8.800"/></svg>';

const MENU = [
  { id: 'labs', ico: '&#9878;', label: 'Labs: classic measurements…', run: openLabsList },
  null,
  { id: 'stopwatch', ico: '&#9201;', label: 'Stopwatch · mark time', card: 'stopwatch' },
  { id: 'events', ico: '&#9788;', label: 'Events finder', card: 'events' },
  { id: 'compare', ico: '&#9901;', label: 'Two observers', card: 'compare' },
  { id: 'trails', ico: '&#8767;', label: 'Path of an object', card: 'trails' },
  { id: 'corrections', ico: '&#916;', label: 'Corrections · effects', card: 'corrections' },
  { id: 'shadow', ico: '&#9681;', label: 'Outline of the Earth’s shadow', run: () => setFx('earthShadow', !state.fx.earthShadow), on: () => state.fx.earthShadow },
  { id: 'measure', ico: '&#8736;', label: 'Measure an angle', k: 'R', run: () => toggleMeasure(), on: () => measure.active },
  { id: 'notebook', ico: '&#9638;', label: 'Lab notebook · table, graph, model', run: () => toggleNotebook(), on: () => notebookOpen() },
  null,
  { id: 'link', ico: '&#128279;', label: 'Copy link to this view', run: copyLink },
];
let menu = null, btn = null;

export function viewLink() {
  const u = new URL(location.href); u.hash = '';
  const q = describeView();
  if (lab.current) q.set('lab', lab.current.id);
  u.search = '?' + q.toString();
  return u.toString();
}
function copyLink() {
  const link = viewLink();
  const done = (ok) => { const b = menu.querySelector('[data-id="link"] .lbl'); if (b) { b.textContent = ok ? 'Link copied' : 'Could not copy'; setTimeout(() => { b.textContent = 'Copy link to this view'; }, 1800); } };
  if (navigator.clipboard) navigator.clipboard.writeText(link).then(() => done(true), () => done(false)); else done(false);
  return link;
}
function syncMenu() {
  if (!menu) return;
  for (const m of MENU) {
    if (!m) continue;
    const b = menu.querySelector(`[data-id="${m.id}"]`); if (!b) continue;
    const pressed = m.card ? getCard(m.card).isOpen() : m.on ? m.on() : null;
    if (pressed != null) b.setAttribute('aria-pressed', pressed);
  }
}
function buildMenu() {
  const bar = document.querySelector('.top-actions');
  const wrap = el('div', { class: 'menuwrap' });
  btn = el('button', { class: 'iconbtn labsbtn', id: 'labsBtn', type: 'button', title: 'Labs and measuring tools', 'aria-haspopup': 'true', 'aria-label': 'Labs and measuring tools' }, FLASK + '<span class="txt">Labs</span>');
  menu = el('div', { class: 'menu labsmenu', id: 'labsMenu', hidden: true });
  for (const m of MENU) {
    if (!m) { menu.appendChild(el('div', { class: 'sep' })); continue; }
    const b = el('button', { type: 'button', 'data-id': m.id }, `<span class="ico">${m.ico}</span><span class="lbl">${m.label}</span>` + (m.k ? `<span class="k">${m.k}</span>` : ''));
    b.addEventListener('click', () => {
      if (m.card) getCard(m.card).toggle(); else m.run();
      if (m.id !== 'link') menu.hidden = true;
      syncMenu();
    });
    menu.appendChild(b);
  }
  wrap.append(btn, menu);
  bar.insertBefore(wrap, bar.firstChild);
  btn.addEventListener('click', (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; syncMenu(); });
  document.addEventListener('click', (e) => { if (!menu.hidden && !wrap.contains(e.target)) menu.hidden = true; });
}

function keys(e) {
  const t = e.target;
  if (takesKeys(t, e) || (t && t.closest && t.closest('.nbpanel, .nb-dialog'))) return;      // (a letter typed beside a box in the notebook is not X on the stopwatch)
  if (document.querySelector('.modal-backdrop.show')) return;
  if (e.key === 'Escape' && menu && !menu.hidden) { menu.hidden = true; e.stopPropagation(); return; }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  // fine time steps for contact timings: Shift + arrows (plain arrows pan the view)
  if (e.shiftKey && e.key.startsWith('Arrow')) {
    const d = { ArrowLeft: -1000, ArrowRight: 1000, ArrowDown: -60000, ArrowUp: 60000 }[e.key];
    if (d) { e.preventDefault(); e.stopPropagation(); state.playing = false; emit('rate'); stepTime(d); }
    return;
  }
  if (e.key === 'x' || e.key === 'X') { e.preventDefault(); e.stopPropagation(); mark(); }
}

/** Call once, after the core UI exists and the catalog is loaded. */
export function initLabsSuite() {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('../../css/labs.css', import.meta.url).href;
  document.head.appendChild(link);
  initShadow();
  initLabs();                     // the lab card sits at the top of the dock
  initStopwatch(); initEvents(); initCompare(); initTrails(); initCorrections();
  addOverlay(drawShadow); addOverlay(drawTrail); addOverlay(drawCompare);
  buildMenu();
  window.addEventListener('keydown', keys, true);
  document.addEventListener('labs-cards', syncMenu);
  on('fx', syncMenu); on('measure', syncMenu);
  initNotebookHost();             // the lab notebook (js/notebook/): before the URL is read, so a lab link can open it

  // ---- URL parameters ----
  const q = new URLSearchParams(location.search);
  const extra = setupFromQuery(q);
  const id = q.get('lab');
  const back = reloadedLab();       // a reload: back to the step, the date and the view (not only to the notebook)
  initResume();
  if (back && (id ? back.id === id : !extra)) startLab(back.id, back.atStart ? {} : { extra: back.setup, at: back.step, marks: back.marks });
  else if (id && labById(id)) startLab(id, { extra });
  else if (extra) applySetup(extra);
  else if (id === 'list') openLabsList();

  // ---- hook for other modules (e.g. a right-click menu): start a trail without importing this folder ----
  //   emit('trail-request', { ref | body, step?, before?, after?, frame? })   or
  //   window.planetarium.labs.startTrailFor(ref | bodyId, opts) -> true when a trail was started
  //   window.planetarium.labs.canTrail(ref | bodyId) says whether the object can have one (Sun, Moon, planets)
  const startTrailFor = (target, opts = {}) => {
    const id = typeof target === 'string' ? target : target && target.kind === 'body' ? target.id : null;
    if (!canTrail(id)) return false;
    startTrail({ ...trailDefaults(id), ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)), body: id });
    getCard('trails').open();
    return true;
  };
  on('trail-request', (o) => { if (o) startTrailFor(o.ref || o.body, { step: o.step, before: o.before, after: o.after, frame: o.frame }); });
  if (window.planetarium) Object.assign(window.planetarium, { labs: { startLab, applySetup, describeView, viewLink, labLink, lab, startTrailFor, stopTrail, canTrail, trail, allTargets, marks } });
  return { startLab, applySetup, viewLink };
}
