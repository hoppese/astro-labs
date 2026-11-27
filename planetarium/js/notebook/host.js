// notebook/host.js: the lab notebook inside the planetarium. Owns the side panel (split view on a wide window, an
// overlay on a small one, a full-screen sheet on a phone; resizable, collapsible to a tab), supplies the raw
// readings for Record, switches the angle tool to "by eye", and holds the observing conditions (seeing, simulated
// measurement noise, the student's seed). Called once from js/labs/index.js.
//
// URL parameters: notebook=1 (open it) · seeing=<arcsec> · noise=<arcsec> · seed=<n> · predict=0 (no "bigger or
// smaller?" prompt) · snap=1 (angle tool snaps to star centres even with the notebook open) · template=1 (instructor:
// a lab's suggested columns are pre-loaded) · instructor=1 (adds the least-squares button to the model sliders).
// A lab preset may carry: notebook: true, obs: {seeing, noise}, template: {...}.

import { state, on, emit } from '../state.js';
import { cam } from '../camera.js';
import { getFrame } from '../skyframe.js';
import { getBodies } from '../ephem.js';
import { horToAzAlt, mulMV, transpose, toSph, mod } from '../astro.js';
import { refHorApparent, refName, refEqj, refKey } from '../objects.js';
import { wallParts, fmtDate, fmtTime } from '../timeutil.js';
import { measure, lastMeasure, clearMeasures } from '../measure.js';
import { marks } from '../labs/stopwatch.js';
import { createNotebook } from './ui.js';
import { see, noisePair } from './seeing.js';
import { rowHidden, running } from '../labs/hidden.js';
import { lab, labStep, setLabStep } from '../labs/labs.js';
import { counts as photoCounts } from '../photometer.js';
import { setModelSeed } from '../variables.js';

const q = new URLSearchParams(location.search);
const num = (k) => { const v = parseFloat(q.get(k)); return Number.isFinite(v) ? v : null; };
const URLOPT = { seeing: num('seeing'), noise: num('noise'), seed: num('seed'), predict: q.get('predict') !== '0', snapAll: q.get('snap') === '1', template: q.get('template') === '1', instructor: q.get('instructor') === '1' };
export const DEFAULT_OBS = { seeing: 0.8, noise: 0.02 };

let panel = null, body = null, tabBtn = null, sub = null, api = null, active = false, collapsed = false, big = false, userW = null, slotNow = 'free', labNow = null;
const root = document.documentElement;
const r3 = (v, n) => +v.toFixed(n);

// ---- raw readings -----------------------------------------------------------------------------------------------------
/** Everything Record can copy: what the instruments show right now. Nothing derived. A reading taken to a fixed number
 *  of decimals is text ("12.80"), so that its last zero is kept. */
function readings() {
  const out = [], t = state.timeMs, jd = t / 86400000 + 2440587.5, p = wallParts(t, 'UTC');
  out.push({ key: 'year', group: 'Clock', label: 'Date as a decimal year', unit: 'yr', kind: 'data', value: (2000 + (jd - 2451545) / 365.25).toFixed(5), sig: 0 });
  out.push({ key: 'jd', group: 'Clock', label: 'Julian Date', unit: 'd', kind: 'data', value: jd.toFixed(5), sig: 0 });
  out.push({ key: 'utc', group: 'Clock', label: 'Date and time (UTC), as words', kind: 'text', value: fmtDate(p) + ' ' + fmtTime(p) });
  const m = lastMeasure(), why = measure.active ? 'the angle tool has no finished measurement yet: click near each of two objects on the sky' : 'the angle tool is closed: press R, then click near each of two objects on the sky';
  out.push({ key: 'sep', group: 'Angle tool (last measurement)', label: 'Separation in arcseconds', unit: 'arcsec', kind: 'data', value: m ? (m.sep * 3600).toFixed(2) : null, sig: 0, why });
  out.push({ key: 'sepdeg', group: 'Angle tool (last measurement)', label: 'Separation in degrees', unit: 'deg', kind: 'data', value: m ? m.sep.toFixed(4) : null, sig: 0, why });
  out.push({ key: 'pa', group: 'Angle tool (last measurement)', label: 'Position angle (north through east)', unit: 'deg', kind: 'data', value: m ? m.pa.toFixed(m.sep < 5 / 60 ? 3 : 1) : null, sig: 0, why });
  out.push({ key: 'from', group: 'Angle tool (last measurement)', label: 'Measured from (name)', kind: 'text', value: m ? m.from : null, why });
  out.push({ key: 'to', group: 'Angle tool (last measurement)', label: 'Measured to (name)', kind: 'text', value: m ? m.to : null, why });
  const n = marks.length, why2 = 'the stopwatch needs at least two marks (X)';
  out.push({ key: 'lap', group: 'Stopwatch', label: 'Time between the last two marks', unit: 's', kind: 'data', value: n > 1 ? (marks[n - 1].t - marks[n - 2].t) / 1000 : null, sig: 0, why: why2 });
  out.push({ key: 'total', group: 'Stopwatch', label: 'Time from the first mark to the last', unit: 's', kind: 'data', value: n > 1 ? (marks[n - 1].t - marks[0].t) / 1000 : null, sig: 0, why: why2 });
  const ref = state.selected, why3 = 'no object is selected', frame = getFrame(), bodies = getBodies(frame);
  const b = ref && ref.kind === 'body' ? bodies.byId[ref.id] : null, why4 = 'the selected object is not the Sun, the Moon, a planet or a moon';
  let aa = null; if (ref) { const h = refHorApparent(ref, frame, bodies); if (h) aa = horToAzAlt(h); }
  out.push({ key: 'obj', group: 'Selected object (its panel)', label: 'Name', kind: 'text', value: ref ? refName(ref) : null, why: why3 });
  out.push({ key: 'dist', group: 'Selected object (its panel)', label: 'Distance from the observer', unit: 'AU', kind: 'data', value: b ? +b.dist.toPrecision(7) : null, sig: 5, why: ref ? why4 : why3 });
  out.push({ key: 'diam', group: 'Selected object (its panel)', label: 'Angular diameter', unit: 'arcsec', kind: 'data', value: b ? +(2 * b.angRadius * 3600).toPrecision(5) : null, sig: 4, why: ref ? why4 : why3 });
  out.push({ key: 'lit', group: 'Selected object (its panel)', label: 'Illuminated fraction', unit: '%', kind: 'data', value: b && b.phaseFrac != null ? r3(b.phaseFrac * 100, 2) : null, sig: 0, why: ref ? why4 : why3 });
  out.push({ key: 'alt', group: 'Selected object (its panel)', label: 'Altitude', unit: 'deg', kind: 'data', value: aa ? r3(aa.alt, 3) : null, sig: 0, why: why3 });
  out.push({ key: 'az', group: 'Selected object (its panel)', label: 'Azimuth', unit: 'deg', kind: 'data', value: aa ? r3(aa.az, 3) : null, sig: 0, why: why3 });
  // ecliptic longitudes on the fixed J2000 axes (no precession to untangle over decades), as an instrument reads them: in a lab that sets
  // running.lonErr (arcmin; the Kepler labs: Tycho's instruments were good to one or two), each reading carries that much error (1 sigma),
  // drawn from (seed, clock second, object), so the same exposure reads the same and the next one differs
  { const g2 = [0, 0], err = running.lonErr || 0, Mje = transpose(frame.Mej);
    const lonOf = (r, salt) => {
      const u = r && refEqj(r, frame, bodies); if (!u) return null;
      let L = toSph(mulMV(Mje, u)).lon;
      if (err) { let h = 0; const k = refKey(r); for (let i = 0; i < k.length; i++) h = Math.imul(h ^ k.charCodeAt(i), 16777619); const t = Math.floor(state.timeMs / 1000); noisePair(see.seed, t | 0, salt, h, 0x7c40, g2); L += g2[0] * err / 60; }
      return (mod(L, 360)).toFixed(err ? 3 : 4);
    };
    out.push({ key: 'sunlon', group: 'Ecliptic longitudes (J2000)' + (err ? `, as measured: about ${err}′ of error` : ''), label: 'The Sun', unit: 'deg', kind: 'data', value: lonOf({ kind: 'body', id: 'Sun' }, 1), sig: 0 });
    out.push({ key: 'elon', group: 'Ecliptic longitudes (J2000)' + (err ? `, as measured: about ${err}′ of error` : ''), label: 'The selected object', unit: 'deg', kind: 'data', value: ref && ref.kind !== 'con' ? lonOf(ref, 2) : null, sig: 0, why: why3 }); }
  { const n = ref ? photoCounts(ref, bodies) : null;
    out.push({ key: 'counts', group: 'Photometer (selected object)', label: 'Counts in one exposure', unit: 'counts', kind: 'data', value: n, sig: 0, why: ref ? 'nothing to measure there' : why3 }); }
  // a reading the running lab asks the student to find is not offered either (labs/hidden.js)
  for (const [k, l] of [['dist', 'distance'], ['diam', 'angular diameter'], ['lit', 'illuminated']]) { const r = out.find((x) => x.key === k); if (rowHidden(l)) { r.value = null; r.why = 'hidden during this lab'; } }
  return out;
}

// ---- observing conditions -------------------------------------------------------------------------------------------------
function applyObs(obs) {
  const nb = api.nb;
  if (obs) nb.obs = { seeing: +obs.seeing || 0, noise: +obs.noise || 0 };
  see.enabled = !!nb.obs && (nb.obs.seeing > 0 || nb.obs.noise > 0);
  see.seeing = nb.obs ? nb.obs.seeing : 0; see.noise = nb.obs ? nb.obs.noise : 0; see.seed = nb.seed;
  setModelSeed(nb.seed);      // this student's own version of the variable stars and supernovae (js/variables.js)
  emit('render'); emit('selection');
}
function conditionsDialog() {
  const nb = api.nb, o = nb.obs || { seeing: 0, noise: 0 };
  const b = api.dialog('Observing conditions', `<div class="nb-obs">
    <p class="nb-lead">A real telescope never shows a star as a point. These settings make the zoomed-in sky behave like real exposures, so that a measurement is a judgement and no two people get exactly the same number.</p>
    <label class="nb-f">Seeing: the width of a star’s blurred image <output data-o="seeing"></output><input type="range" name="seeing" min="0" max="3" step="0.1" value="${o.seeing}"></label>
    <p class="nb-def">0.5″ is a superb mountain night, 1″ a good one, 2–3″ an ordinary sea-level site. 0 = sharp points.</p>
    <label class="nb-f">Simulated measurement noise, per star image <output data-o="noise"></output><input type="range" name="noise" min="0" max="0.2" step="0.005" value="${o.noise}"></label>
    <p class="nb-def"><b>This part is simulated, not data.</b> In each exposure (each clock second) every star image is shifted by a small random amount, as photon noise and the air shift the image on a real detector. The shifts come from your seed, so your frames are yours: the same date shows you the same frame again, and someone with another seed sees slightly different ones. 0 = off.</p>
    <p>Your seed: <span class="nb-seed">${nb.seed}</span> &ensp;<button class="nb-btn sm" data-newseed>New seed</button></p>
    <p class="nb-def">The seed, the seeing and the noise are written into your CSV export.</p>
    <div class="nb-row"><button class="nb-btn primary" data-ok>Use these</button><button class="nb-btn" data-close>Cancel</button></div></div>`);
  const show = () => { b.querySelector('[data-o=seeing]').textContent = (+b.querySelector('[name=seeing]').value).toFixed(1) + '″'; b.querySelector('[data-o=noise]').textContent = (+b.querySelector('[name=noise]').value).toFixed(3) + '″'; };
  b.addEventListener('input', show); show();
  b.querySelector('[data-newseed]').addEventListener('click', () => { nb.seed = 1 + Math.floor(Math.random() * 999998); b.querySelector('.nb-seed').textContent = nb.seed; });
  b.querySelector('[data-ok]').addEventListener('click', () => { applyObs({ seeing: +b.querySelector('[name=seeing]').value, noise: +b.querySelector('[name=noise]').value }); api.closeDialog(); api.changed(); subtitle(); });
}

// Registered when this module loads, so that it runs before every other key listener of the app.
let mine = false;
document.addEventListener('pointerdown', (e) => { mine = !!panel && panel.contains(e.target); }, true);
window.addEventListener('keydown', (e) => { if (mine && panel && !panel.hidden && e.target === document.body && e.key !== 'Escape') { if (api.undoKey(e)) { e.stopImmediatePropagation(); return; } panel.focus({ preventScroll: true }); e.stopImmediatePropagation(); } }, true);

// ---- the panel ---------------------------------------------------------------------------------------------------------------
const mode = () => (window.innerWidth >= 1180 ? 'split' : 'over');
function defaultWidth() { const w = window.innerWidth; return mode() === 'split' ? Math.round(Math.min(600, Math.max(400, w * 0.275))) : w <= 560 ? w : Math.round(Math.min(440, w - 150, w * 0.56)); }
function layout() {
  if (!panel) return;
  const shown = active && !collapsed, m = mode();
  const w = shown ? (m === 'split' ? Math.max(360, Math.min(window.innerWidth - 520, userW || defaultWidth())) : defaultWidth()) : 0;
  root.style.setProperty('--nb-w', w + 'px');
  root.classList.toggle('nb-split', shown && m === 'split');
  root.classList.toggle('nb-over', shown && m === 'over');
  root.classList.toggle('nb-tight', shown && m === 'split' && window.innerWidth - w < 1010);
  root.classList.toggle('nb-slim', shown && m === 'split' && window.innerWidth - w < 800);          // the notebook has been dragged wide: a strip of sky is left
  root.classList.toggle('nb-folded', active && collapsed);
  root.classList.toggle('nb-big', shown && big);
  const bb = panel.querySelector('[data-a=big]'); bb.textContent = big ? 'Back to the sky' : 'Big notebook'; bb.title = big ? 'Put the notebook back beside the sky' : 'The whole window for the notebook: a large graph, with the table and the sliders beside it. The sky keeps everything.';
  showLab();
  panel.hidden = !shown; tabBtn.hidden = !(active && collapsed);
  window.dispatchEvent(new Event('resize'));          // the sky canvas re-measures itself
  emit('render');
}
/** The lab's steps inside the notebook, for when the card on the sky has no room (big, dragged wide, small window). */
function showLab() {
  const box = panel && panel.querySelector('.nbp-lab'); if (!box) return;
  const L = lab.current && lab.current.notebook ? lab.current : null; if (!L) { box.innerHTML = ''; return; }
  const k = labStep(), n = L.steps.length;
  box.innerHTML = `<summary><span>Lab: step ${k + 1} of ${n}</span><button type="button" class="nav" data-step="-1" aria-label="Previous step"${k ? '' : ' disabled'}>&lsaquo;</button><button type="button" class="nav" data-step="1" aria-label="Next step"${k < n - 1 ? '' : ' disabled'}>&rsaquo;</button></summary><div class="in">${L.steps[k]}</div>`;
}
function subtitle() {
  if (!api) return;
  const nb = api.nb, o = nb.obs;
  sub.textContent = (labNow ? labNow.title : 'your own notebook') + (o && (o.seeing || o.noise) ? ` · seeing ${o.seeing}″${o.noise ? `, simulated noise ${o.noise}″, seed ${nb.seed}` : ''}` : '');
  tabBtn.innerHTML = `Notebook <b>${nb.rows.length} row${nb.rows.length === 1 ? '' : 's'}</b>`;
}
const toSky = () => { if (!big) document.getElementById('sky').focus({ preventScroll: true }); };
function build() {
  panel = document.createElement('section'); panel.className = 'nbpanel'; panel.id = 'nbPanel'; panel.hidden = true; panel.setAttribute('aria-label', 'Lab notebook');
  panel.innerHTML = '<div class="nbp-drag" title="Drag to resize"></div><header class="nbp-head"><h2>Lab notebook</h2><span class="sub"></span>' +
    '<button type="button" class="big" data-a="big">Big notebook</button><button type="button" data-a="collapse" title="Fold the notebook away (it keeps recording)" aria-label="Collapse the notebook">&#8250;</button><button type="button" data-a="close" title="Close the notebook" aria-label="Close the notebook">&times;</button></header><details class="nbp-lab"></details><div class="nbp-body"></div>';
  tabBtn = document.createElement('button'); tabBtn.className = 'nbtab'; tabBtn.type = 'button'; tabBtn.hidden = true; tabBtn.title = 'Open the lab notebook';
  root.append(panel, tabBtn);                           // beside <body>, not inside it: in split view the body is the sky's (narrower) window
  body = panel.querySelector('.nbp-body'); sub = panel.querySelector('.sub');
  panel.querySelector('.nbp-head').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.a === 'big') { big = !big; layout(); } else if (b.dataset.a === 'collapse') { collapsed = true; big = false; layout(); } else closeNotebook(); });
  panel.querySelector('.nbp-lab').addEventListener('click', (e) => { const b = e.target.closest('[data-step]'); if (b) { e.preventDefault(); setLabStep(labStep() + +b.dataset.step); panel.querySelector('.nbp-lab').open = true; } });
  on('labstep', showLab);
  tabBtn.addEventListener('click', () => { collapsed = false; layout(); });
  // typing in the notebook must not drive the sky; Escape is left to the notebook's own dialogs
  panel.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  // choosing from a menu redraws it and the focus falls back to the page: until the student clicks the sky again, letters typed then are not sky shortcuts
  panel.tabIndex = -1;
  const drag = panel.querySelector('.nbp-drag');
  drag.addEventListener('pointerdown', (e) => {
    drag.setPointerCapture(e.pointerId); drag.classList.add('on');
    const move = (ev) => { userW = window.innerWidth - ev.clientX; layout(); };
    const up = () => { drag.classList.remove('on'); drag.removeEventListener('pointermove', move); drag.removeEventListener('pointerup', up); };
    drag.addEventListener('pointermove', move); drag.addEventListener('pointerup', up);
  });
  let lastMode = mode();
  window.addEventListener('resize', () => { if (mode() !== lastMode) { lastMode = mode(); layout(); } });
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('../../css/notebook.css', import.meta.url).href; document.head.appendChild(link);
  api = createNotebook(body, { slot: 'free', instructor: URLOPT.instructor, onChange: subtitle,
    host: { readings, big: () => { big = !big; layout(); }, conditions: conditionsDialog, afterRecord: ({ clear }) => { if (clear && measure.byEye) clearMeasures();
      // the next thing is to step the clock or measure again: the sky's keys work at once
      toSky(); }, afterMiss: () => toSky() } });
}

/** Open the notebook (and switch the planetarium into notebook mode). slot: which saved notebook; obs: conditions to set. */
export function openNotebook({ slot = slotNow, obs, lab = null, template = null, folded = false } = {}) {
  if (!panel) build();
  labNow = lab; slotNow = slot;
  if (api.nb.slot !== slot) api.open(slot);
  const nb = api.nb;
  if (URLOPT.seed) nb.seed = Math.round(URLOPT.seed);
  if (!URLOPT.predict) nb.predict = false;
  // conditions: the URL wins, then what this notebook was last used with, then the lab's, else none
  const base = nb.obs || obs || null;
  const want = URLOPT.seeing != null || URLOPT.noise != null ? { seeing: URLOPT.seeing ?? (base ? base.seeing : 0), noise: URLOPT.noise ?? (base ? base.noise : 0) } : base;
  applyObs(want || { seeing: 0, noise: 0 });
  if (template && URLOPT.template) api.template(template);
  // a lab that opens its notebook in a small window starts with it folded to its tab, so the sky and the lab's prompt are seen first
  active = true; collapsed = folded;
  measure.byEye = !URLOPT.snapAll; measure.onRecord = () => api.record();
  api.changed(); subtitle(); layout(); emit('notebook'); emit('measure');
  return api;
}
export function closeNotebook() {
  if (!active) return;
  active = false; big = false; measure.byEye = false; measure.onRecord = null; see.enabled = false;
  layout(); emit('notebook'); emit('measure'); emit('selection');
}
export const notebookOpen = () => active;
export function toggleNotebook() { if (active && !collapsed) closeNotebook(); else if (active) { collapsed = false; layout(); } else openNotebook({ slot: labNow ? 'lab:' + labNow.id : 'free', lab: labNow }); }

export function initNotebookHost() {
  // a lab that uses the notebook opens its own (saved per lab); any other lab switches the observing conditions off
  // a notebook lab starts with the object panel folded to its title and holds its star whatever is selected or closed (nav.js)
  const info = document.querySelector('.infopanel');
  let shown = null;
  on('dismiss', () => { info.classList.add('gone'); });
  on('selection', () => { if (state.selected !== shown) { shown = state.selected; info.classList.remove('gone'); } });
  info.addEventListener('click', (e) => { if (root.classList.contains('nb-lab') && e.target.closest('h2')) info.classList.toggle('fold'); });
  on('lab', (L) => {
    const nl = !!(L && L.notebook);
    root.classList.toggle('nb-lab', nl);
    info.classList.remove('gone'); info.classList.toggle('fold', nl);
    state.keepTracked = nl && state.tracking; shown = state.selected;
    if (L && L.notebook) openNotebook({ slot: 'lab:' + L.id, obs: L.obs || null, lab: L, template: L.template || null, folded: mode() === 'over' });
    else { labNow = null; if (active) { see.enabled = false; emit('render'); } }
  });
  on('measure', () => { see.noMarker = active && measure.byEye && measure.active; if (active && panel) subtitle(); });
  if (q.get('notebook') === '1' && !q.get('lab')) openNotebook({ slot: 'free' });
  if (window.planetarium) window.planetarium.notebook = { open: openNotebook, close: closeNotebook, toggle: toggleNotebook, see, get api() { return api; }, readings, cam };
}
