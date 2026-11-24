// labs/labs.js: the Labs list (a dialog with every preset, grouped) and the lab card that stays on
// screen with the prompt: what to measure, never the answer.

import { state, emit } from '../state.js';
import { LABS, GROUPS, labById } from './presets.js';
import { applySetup } from './setup.js';
import { makeCard, getCard } from './dock.js';
import { clearMarks } from './stopwatch.js';
import { el, esc } from './util.js';
import { running } from './hidden.js';
import { fmtLat, fmtLon } from '../astro.js';

export const lab = { current: null };
let card = null, modal = null, step = 0;

export async function startLab(id, { extra = null } = {}) {
  const L = labById(id);
  if (!L) return false;
  lab.current = L; running.id = L.id; state.keepTracked = false;
  clearMarks();
  // start clean: no leftovers from another lab
  const base = { closeOthers: true, tools: [], obs2: null, trail: null, clearMeasures: true, lightTime: true, play: false, rate: 1, mount: 'altaz',
    fx: { aberration: true, parallax: true, properMotion: true, earthShadow: false },
    show: { refraction: true, atmosphere: true, ground: true, meridian: false, azGrid: false, eqGrid: false, ecliptic: false, equator: false, conLines: true, conNames: true, starNames: true, planetNames: true, dso: true, conBounds: false } };
  const s = { ...base, ...L.setup, fx: { ...base.fx, ...(L.setup.fx || {}) }, show: { ...base.show, ...(L.setup.show || {}) } };
  if (L.setup.rate) { s.rate = L.setup.rate; }
  await applySetup(s);
  if (extra) await applySetup(extra);
  emit('lab', L);                 // js/notebook/host.js opens the lab's notebook and sets its observing conditions
  step = 0; renderCard();
  card.open();
  // on a phone or in a small embed the prompt would hide the sky: start it folded (its title bar still names the lab)
  if (window.innerWidth <= 560 || window.innerHeight < (L.notebook ? 640 : 560)) card.root.classList.add('min');
  if (modal) modal.classList.remove('show');
  document.getElementById('sky').focus({ preventScroll: true });
  return true;
}
function renderCard() {
  const L = lab.current; if (!L) return;
  const l = state.loc;
  card.root.classList.toggle('stepwise', !!L.notebook);
  card.title.textContent = (L.notebook ? '' : 'Lab · ') + L.title;
  card.body.innerHTML = `<h3>${esc(L.title)}</h3><div class="who">${esc(L.who)}</div>` +
    // a lab with the notebook beside it: one step at a time, so that the prompt leaves the sky free
    (L.notebook ? `<div class="lab-step">${L.steps[step]}</div><div class="lab-nav"><button class="btn" data-act="prev" aria-label="Previous step"${step ? '' : ' disabled'}>&lsaquo;</button><span>Step ${step + 1} of ${L.steps.length}</span><button class="btn" data-act="next" aria-label="Next step"${step < L.steps.length - 1 ? '' : ' disabled'}>&rsaquo;</button></div>`
      : `<ol>${L.steps.map((s) => `<li>${s}</li>`).join('')}</ol>`) +
    (L.notebook ? '<details><summary>About this measurement, restart, links</summary><p>' + L.about + '</p>' : `<details><summary>About this measurement</summary><p>${L.about}</p></details>`) +
    `<div class="row"><button class="btn" data-act="restart" title="Put the date, place and view back to the start of this lab">Restart lab</button><button class="btn" data-act="list">All labs</button><button class="btn" data-act="link" title="Copy a link that opens this lab">Copy lab link</button></div>` + (L.notebook ? '</details>' : '');
}
export function labLink(id) { const u = new URL(location.href); u.search = '?lab=' + encodeURIComponent(id); u.hash = ''; return u.toString(); }

export function openLabsList() {
  if (!modal) {
    modal = el('div', { class: 'modal-backdrop labsmodal', id: 'labsModal' });
    let html = '<div class="modal" role="dialog" aria-label="Labs: classic measurements"><h2>Labs: classic measurements <button class="close" data-close aria-label="Close">&times;</button></h2>' +
      '<p style="color:#b7c2cd;font-size:13px;margin:0 0 4px">Each lab sets the date, the place and the view, and tells you what to measure. The numbers are yours to find: with the clock, the stopwatch and the angle tool.</p>';
    for (const g of GROUPS) {
      html += `<div class="labs-group">${g}</div><div class="labs-grid">` + LABS.filter((L) => L.group === g).map((L) => `<button data-lab="${L.id}"><b>${esc(L.title)}</b><small>${esc(L.who)}. ${esc(L.blurb)}</small></button>`).join('') + '</div>';
    }
    html += '<div class="labs-group">Galaxies</div><div class="labs-grid"><button data-hubble="1"><b>Hubble’s law</b><small>Hubble, 1929. Redshifts and sizes of galaxies from the catalogue.</small></button></div></div>';
    modal.innerHTML = html;
    document.body.appendChild(modal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal || e.target.closest('[data-close]')) { modal.classList.remove('show'); return; }
      const b = e.target.closest('button[data-lab]');
      if (b) { startLab(b.dataset.lab); return; }
      if (e.target.closest('[data-hubble]')) { modal.classList.remove('show'); const h = window.planetarium && window.planetarium.hubble; if (h && h.panel) h.panel.open(); }
    });
    modal.addEventListener('keydown', (e) => { if (e.key === 'Escape') { modal.classList.remove('show'); e.stopPropagation(); } else e.stopPropagation(); });
  }
  modal.classList.add('show');
  const f = modal.querySelector('.close'); if (f) f.focus();
}
export function initLabs() {
  card = makeCard('lab', 'Lab', { cls: 'lab-card', onClose() { lab.current = null; running.id = null; emit('lab', null); emit('selection'); } });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'restart' && lab.current) startLab(lab.current.id);
    else if (b.dataset.act === 'prev' || b.dataset.act === 'next') { const a = b.dataset.act; step = Math.max(0, Math.min(lab.current.steps.length - 1, step + (a === 'next' ? 1 : -1))); renderCard(); const n = card.body.querySelector(`[data-act="${a}"]:not(:disabled)`); if (n) n.focus({ preventScroll: true }); }
    else if (b.dataset.act === 'list') openLabsList();
    else if (b.dataset.act === 'link' && lab.current && navigator.clipboard) navigator.clipboard.writeText(labLink(lab.current.id)).then(() => { b.textContent = 'Link copied'; setTimeout(() => { b.textContent = 'Copy lab link'; }, 1600); }, () => {});
  });
  return card;
}
export { getCard, fmtLat, fmtLon };
