// labs/labs.js: the Labs list (a dialog with every preset, grouped) and the lab card that stays on
// screen with the prompt: what to measure, never the answer.

import { state, emit, set } from '../state.js';
import { LABS, GROUPS, labById, truthFor } from './presets.js';
import { GUIDES } from './guides.js';
import { INSTRUCTOR } from './hidden.js';
import { see } from '../notebook/seeing.js';
import { getModelSeed } from '../variables.js';
import { applySetup } from './setup.js';
import { makeCard, getCard, getDock } from './dock.js';
import { clearMarks, restoreMarks } from './stopwatch.js';
import { el, esc } from './util.js';
import { running } from './hidden.js';
import { phot } from '../photometer.js';
import { fmtLat, fmtLon } from '../astro.js';
import { rememberLab, forgetLab, savedLab, resumeText } from './resume.js';
import { setTime } from '../clock.js';
import { swapObservers } from './compare.js';
import { setSquareFrom } from './squareon.js';
import { setFx } from './corrections.js';
import { closePanels, toast } from '../xui.js';
import { linkTerms } from '../glossary.js';

export const lab = { current: null };
const LAB_SHOW = { refraction: true, atmosphere: true, ground: true, meridian: false, azGrid: false, eqGrid: false, ecliptic: false, equator: false, conLines: true, conNames: true, starNames: true, planetNames: true, dso: true, conBounds: false };
let card = null, modal = null, step = 0, all = false;      // all: every step at once

export const labStep = () => step;
export function setLabStep(k) { if (!lab.current) return; offer = null; step = Math.max(0, Math.min(lab.current.steps.length - 1, k)); renderCard(); rememberLab(lab.current.id, step); emit('labstep'); }
/** The offer to go back is still on the card and nothing has been done yet: what it would go back to must not be overwritten. */
let starting = false;             // a lab is being set up: the sky is not at its date yet, nothing to remember
export const offerOpen = () => starting || !!offer && Math.abs(state.timeMs - Date.parse(lab.current.setup.t)) < 1000;
let offer = null;                 // where this student was the last time, when that is not where the lab starts
export async function startLab(id, { extra = null, at = 0, fresh = false, marks = null } = {}) {
  const L = labById(id);
  if (!L) return false;
  starting = true; offer = null;
  emit('lab-start', L);           // js/point/: a phone held at the sky lets go, with everything put back, before the lab sets its own
  lab.current = L; running.id = L.id; running.photometer = !!L.photometer; phot.filter = 'clear'; running.lonErr = L.lonErr || 0; state.keepTracked = false;
  clearMarks(); closePanels(); closeBoxes();
  // start clean: no leftovers from another lab
  const base = { closeOthers: true, tools: [], obs2: null, trail: null, clearMeasures: true, lightTime: true, play: false, rate: 1, mount: 'altaz',
    fx: { aberration: true, parallax: true, properMotion: true, earthShadow: false },
    show: { ...LAB_SHOW } };
  const s = { ...base, ...L.setup, fx: { ...base.fx, ...(L.setup.fx || {}) }, show: { ...base.show, ...(L.setup.show || {}) } };
  await applySetup(s);
  if (extra) await applySetup(extra);
  if (marks) restoreMarks(marks);
  emit('lab', L);                 // js/notebook/host.js opens the lab's notebook and sets its observing conditions
  step = Math.max(0, Math.min(L.steps.length - 1, at)); offer = at || extra || fresh ? null : savedLab(id); starting = false; renderCard(); emit('labstep');
  card.open();
  // on a phone or in a small embed the prompt would hide the sky: start it folded (its title bar still names the lab)
  if (window.innerWidth <= 560 || window.innerHeight < (L.notebook ? 640 : 560)) card.root.classList.add('min');
  if (window.innerHeight <= 520) document.querySelectorAll('.labsdock .lcard:not([hidden])').forEach((c) => c.classList.add('min'));      // a phone on its side: title bars only
  if (modal) modal.classList.remove('show');
  getDock().scrollTop = 0;        // the prompt first
  document.getElementById('sky').focus({ preventScroll: true });
  return true;
}
function renderCard() {
  const L = lab.current; if (!L) return;
  const l = state.loc;
  card.root.classList.add('stepwise');
  card.title.textContent = L.title;
  card.body.innerHTML = `<h3>${esc(L.title)}</h3><div class="who">${esc(L.who)}</div>` +
    // the full guide (guide/<id>.html: background, diagrams from other points of view, the steps in detail), where there is one
    (GUIDES.has(L.id) ? `<a class="lab-guide" href="guide/${L.id}.html" target="_blank" rel="noopener">Full guide: background, diagrams, step by step ↗</a>` : '') +
    // one step at a time, so that the prompt leaves the sky (and the stopwatch) free; its buttons above the text, so that they stay where they are
    (offer ? `<p class="lab-offer">You were here before: ${esc(resumeText(offer))}. <button class="btn" data-act="resume">Go back there</button></p>` : '') +
    (!all || L.notebook ? `<div class="lab-nav"><button class="btn" data-act="prev" aria-label="Previous step"${step ? '' : ' disabled'}>&lsaquo;</button><span>Step ${step + 1} of ${L.steps.length}</span><button class="btn" data-act="next" aria-label="Next step"${step < L.steps.length - 1 ? '' : ' disabled'}>&rsaquo;</button></div><div class="lab-step">${L.steps[step]}</div>`
      : `<div class="lab-nav"><span>All ${L.steps.length} steps</span></div><ol>${L.steps.map((s) => `<li>${s}</li>`).join('')}</ol>`) +
    // the instructor's key for THIS student's sky (their seed; open the lab with &seed=<their seed>&instructor=1)
    (INSTRUCTOR && truthFor(L.id) ? `<p class="lab-truth"><b>Instructor, seed ${getModelSeed() || 'none (catalog values)'}:</b> ${truthFor(L.id)}</p>` : '') +
    `<details><summary>About this measurement, restart, links</summary><p><i>${esc(L.who)}.</i> ${L.about}</p>${see.seed > 0 ? `<p class="lab-seed">Your seed: <b>${see.seed}</b>. It makes your measurement errors${L.photometer ? ' and your sky' : ''} your own; give it to your instructor with your results.</p>` : ''}` +
    `<div class="row"><button class="btn" data-act="restart" title="Put the date, place and view back to the start of this lab">Restart lab</button><button class="btn" data-act="list">All labs</button><button class="btn" data-act="link" title="Copy a link that opens this lab">Copy lab link</button>${L.notebook ? '' : `<button class="btn" data-act="all">${all ? 'One step at a time' : 'All steps at once'}</button>`}</div></details>`;
  linkTerms(card.body);           // umbra, arcminute and the like: a definition on hover or click
}
export function labLink(id) { const u = new URL(location.href); u.search = '?lab=' + encodeURIComponent(id); u.hash = ''; return u.toString(); }

/** Leave whatever lab is on: its cards, its sky and its date. (Hubble's law is a panel of its own, not a preset.) */
async function endLab() {
  if (!lab.current) return;
  card.close();
  for (const id of ['stopwatch', 'events', 'compare', 'squareon', 'trails', 'corrections', 'spectro']) getCard(id).close();
  await applySetup({ closeOthers: true, tools: [], obs2: null, trail: null, clearMeasures: true, lightTime: true, t: Date.now(), play: true, rate: 1, mount: 'altaz', target: '', fov: 90,
    fx: { aberration: true, parallax: true, properMotion: true, earthShadow: false }, show: { ...LAB_SHOW } });
}
function closeBoxes() { const p = document.getElementById('timePop'); if (p) p.hidden = true; }
/** Buttons inside a step: <button data-do="swap"> and so on. They press a tool's own control; they never measure. */
const DO = {
  swap: swapObservers,
  light: () => { set('lightTime', !state.lightTime); toast('Light-travel time is now ' + (state.lightTime ? 'on: you see things as they were.' : 'off: you see things as they are.'), { ms: 3200 }); },
  shadow: () => setFx('earthShadow', !state.fx.earthShadow),
  square: (b) => { setSquareFrom(b.dataset.from || 'Moon'); const c = getCard('squareon'); if (c) c.open(); },
  goto: (b) => { state.playing = false; emit('rate'); setTime(Date.parse(b.dataset.t)); },
  nextring: (b) => emit('nextring', b.dataset.cl),      // js/labs/clusters.js: the next ringed star of a cluster
};
export function openLabsList() {
  if (!modal) {
    modal = el('div', { class: 'modal-backdrop labsmodal', id: 'labsModal' });
    let html = '<div class="modal" role="dialog" aria-label="Labs: classic measurements"><h2>Labs: classic measurements <button class="close" data-close aria-label="Close">&times;</button></h2>' +
      '<p style="color:#b7c2cd;font-size:13px;margin:0 0 4px">Each lab sets the date, the place and the view, and tells you what to measure. The numbers are yours to find: with the clock, the stopwatch and the angle tool.</p>';
    for (const g of GROUPS) {
      html += `<div class="labs-group">${g}</div><div class="labs-grid">` + LABS.filter((L) => L.group === g).map((L) => `<button data-lab="${L.id}"><b>${esc(L.title)}</b><small>${esc(L.who)}. ${esc(L.blurb)}</small></button>`).join('') + '</div>';
    }
    html += '<div class="labs-group">Galaxies</div><div class="labs-grid"><button data-hubble="1"><b>Hubble’s law</b><small>Hubble, 1929. Redshifts and sizes of galaxies from the catalog.</small></button></div></div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) { modal.classList.remove('show'); return; }
      const b = e.target.closest('button[data-lab]');
      if (b) { startLab(b.dataset.lab); return; }
      if (e.target.closest('[data-hubble]')) { modal.classList.remove('show'); endLab(); const h = window.planetarium && window.planetarium.hubble; if (h && h.panel) h.panel.open(); }
    });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal.classList.remove('show'); e.stopPropagation(); } else e.stopPropagation(); });
  }
  modal.classList.add('show');
  const f = modal.querySelector('.close'); if (f) f.focus();
}
export function initLabs() {
  card = makeCard('lab', 'Lab', { cls: 'lab-card', onClose() { forgetLab(); lab.current = null; running.id = null; running.photometer = false; running.lonErr = 0; emit('lab', null); emit('selection'); } });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.do) DO[b.dataset.do](b);
    else if (b.dataset.act === 'all') { all = !all; renderCard(); }
    else if (b.dataset.act === 'restart' && lab.current) startLab(lab.current.id, { fresh: true });
    else if (b.dataset.act === 'resume' && offer) startLab(lab.current.id, { extra: offer.setup, at: offer.step, marks: offer.marks });
    else if (b.dataset.act === 'prev' || b.dataset.act === 'next') { const a = b.dataset.act; setLabStep(step + (a === 'next' ? 1 : -1)); const n = card.body.querySelector(`[data-act="${a}"]:not(:disabled)`); if (n) n.focus({ preventScroll: true }); }
    else if (b.dataset.act === 'list') openLabsList();
    else if (b.dataset.act === 'link' && lab.current && navigator.clipboard) navigator.clipboard.writeText(labLink(lab.current.id)).then(() => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy lab link'; }, 1600); }, () => {});
  });
  return card;
}
export { getCard, fmtLat, fmtLon };
