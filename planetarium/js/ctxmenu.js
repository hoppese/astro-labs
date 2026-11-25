// ctxmenu.js: the right-click menu on the sky (press and hold on a touch screen).
// On an object: centre, track, zoom, measure from it, mark, copy coordinates, more info, and for
// deep-sky objects "show in the list" / "add to the Hubble table". On empty sky: centre here, measure
// from here, mark the point, copy coordinates. Only the canvas's own browser menu is suppressed.
//
// "Start trail" calls the labs module's startTrail() (js/labs/trails.js), which draws paths for the Sun,
// Moon and planets; for anything else the item is shown disabled and says why.

import { state, emit } from './state.js';
import { fmtRA, fmtDMS, toSph, horToAzAlt } from './astro.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { pickAt } from './picks.js';
import { dso } from './catalog.js';
import { refName, sameRef, refEqj, refHorApparent } from './objects.js';
import { select, centerOn, toggleTracking, flyTo } from './nav.js';
import { toggleMeasure, measureClick } from './measure.js';
import { el, esc, toast } from './xui.js';
import { skyAt, conLabel } from './cursor.js';
import { marks, isMarked, toggleMark, clearMarks } from './skymarks.js';
import { linksFor } from './links.js';
import { rowHidden } from './labs/hidden.js';
import { trail, startTrail, stopTrail, canTrail, trailDefaults } from './labs/trails.js';

const GAL = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);
let menu = null, canvas = null, deps = null, swallowUntil = 0, swallowTouch = false, ctx = null;

/** True for a moment after the menu opens, so the click that belongs to the same gesture selects nothing. */
export const contextSwallowsClick = () => swallowTouch || performance.now() < swallowUntil;

export function initContextMenu(canvasEl, d) {
  canvas = canvasEl; deps = d;
  menu = el('div', 'xctx'); menu.hidden = true; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', 'Sky menu');
  document.body.appendChild(menu);

  canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    openAt(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
  });
  // long press (touch / pen): 550 ms without moving
  let timer = 0, start = null;
  const cancel = () => { clearTimeout(timer); timer = 0; start = null; };
  canvas.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' || !e.isPrimary) { cancel(); return; }
    const r = canvas.getBoundingClientRect();
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    clearTimeout(timer);
    timer = setTimeout(() => { if (start) { swallowTouch = true; openAt(start.x - r.left, start.y - r.top, start.x, start.y); if (navigator.vibrate) { try { navigator.vibrate(8); } catch (err) { /* fine */ } } } start = null; }, 550);
  });
  canvas.addEventListener('pointermove', (e) => { if (start && (e.pointerId !== start.id || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8)) cancel(); });
  for (const t of ['pointerup', 'pointercancel', 'wheel']) canvas.addEventListener(t, () => { cancel(); setTimeout(() => { swallowTouch = false; }, 0); }, { passive: true });

  document.addEventListener('pointerdown', (e) => { if (!menu.hidden && !menu.contains(e.target)) { close(); if (e.target === canvas && e.button === 0) swallowUntil = performance.now() + 450; } }, true);
  window.addEventListener('blur', close);
  window.addEventListener('resize', close);
  window.addEventListener('keydown', (e) => {
    if (menu.hidden) return;
    const items = [...menu.querySelectorAll('button:not(:disabled)')], i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); canvas.focus({ preventScroll: true }); }
    else if (e.key === 'ArrowDown') items[(i + 1) % items.length].focus();
    else if (e.key === 'ArrowUp') items[(i - 1 + items.length) % items.length].focus();
    else if (e.key === 'Home') items[0].focus();
    else if (e.key === 'End') items[items.length - 1].focus();
    else if (e.key === 'Tab') close();
    else return;
    e.preventDefault(); e.stopPropagation();
  }, true);
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-i]'); if (!b || b.disabled) return;
    const it = ctx.items[+b.dataset.i];
    close();
    canvas.focus({ preventScroll: true });
    it.run();
  });
  menu.addEventListener('contextmenu', (e) => e.preventDefault());
}

function close() { if (menu && !menu.hidden) { menu.hidden = true; ctx = null; } }

function coordText(s) {
  return `RA ${fmtRA(s.raJ, 1)}, Dec ${fmtDMS(s.decJ, { dp: 0 })} (J2000); Az ${s.az.toFixed(3)}°, Alt ${s.alt >= 0 ? '+' : '−'}${Math.abs(s.alt).toFixed(3)}°`;
}
function copy(text, what) {
  const ok = () => toast(`Copied ${what}: ${text}`, { ms: 3600 });
  const fallback = () => {
    const ta = el('textarea'); ta.value = text; ta.style.cssText = 'position:fixed;left:-999px;top:0'; document.body.appendChild(ta); ta.select();
    let done = false; try { done = document.execCommand('copy'); } catch (e) { done = false; }
    ta.remove();
    if (done) ok(); else toast('The browser did not allow copying. ' + text, { ms: 9000, kind: 'warn' });
  };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(ok, fallback); else fallback();
}

function openAt(x, y, clientX, clientY) {
  swallowUntil = performance.now() + 450;
  if (deps.quizActive()) { toast('The sky menu is off during a quiz.', { ms: 2000 }); return; }
  const ref = pickAt(x, y, 14);
  const s = skyAt(x, y);
  const name = ref ? refName(ref) : '';
  const obj = ref && ref.kind !== 'con' ? ref : null;                   // a real object (constellation labels are regions)
  const d = ref && ref.kind === 'dso' ? dso.rows[ref.idx] : null;
  const markTarget = obj ? { ref: obj, name } : { vec: s.eqj };
  const marked = isMarked(markTarget);
  const items = [];
  const add = (label, run, { key = '', disabled = false, note = '' } = {}) => items.push({ label, run, key, disabled, note });
  const sep = () => { if (items.length && !items[items.length - 1].sep) items.push({ sep: true }); };

  if (ref) {
    add(`Center on ${name}`, () => { select(ref); centerOn(ref); }, { key: 'Space' });
    if (obj) {
      const tracking = state.tracking && sameRef(state.trackRef, ref);
      add(tracking ? `Stop tracking ${name}` : `Track ${name}`, () => { select(ref); toggleTracking(!tracking); }, { key: 'T' });
    }
    add(`Zoom to ${name}`, () => { select(ref); centerOn(ref, true); });
    add('More info', () => select(ref));
  } else {
    add('Center here', () => flyTo(s.app));
  }
  sep();
  add(obj ? `Measure angle from ${name}` : 'Measure angle from here', () => { toggleMeasure(true); measureClick(x, y, obj); }, { key: 'R' });
  add(marked ? (obj ? `Unmark ${name}` : 'Remove this mark') : (obj ? `Mark ${name}` : 'Mark this point'), () => toggleMark(markTarget));
  if (marks.length > (marked ? 1 : 0)) add(`Clear all marks (${marks.length})`, clearMarks);
  // trails are the labs module's (Sun, Moon and planets only); the menu just starts or stops one
  if (obj && obj.kind === 'body' && canTrail(obj.id)) {
    const running = trail.on && trail.body === obj.id;
    add(running ? `Stop the trail of ${name}` : `Start trail of ${name}`, () => {
      if (running) { stopTrail(); return; }
      // through the labs handle when it exists, so the "Path of an object" card opens with the trail's controls
      const L = window.planetarium && window.planetarium.labs;
      if (!(L && L.startTrailFor && L.startTrailFor(obj.id))) startTrail({ ...trailDefaults(obj.id), body: obj.id });
    });
  } else add(obj ? `Start trail of ${name}` : 'Start trail here', () => {}, { disabled: true, note: 'Sun, Moon and planets only' });
  sep();
  add('Copy coordinates', () => {
    // on an object: the object's own coordinates (as in its info panel), not those of the pixel that was clicked
    let c = s;
    if (obj) { const f = getFrame(), b = getBodies(f), u = refEqj(obj, f, b), h = refHorApparent(obj, f, b); if (u && h) { const j = toSph(u), a = horToAzAlt(h); c = { raJ: j.lon, decJ: j.lat, az: a.az, alt: a.alt }; } }
    copy((name ? name + ': ' : '') + coordText(c), 'coordinates');
  });
  if (ref) {
    const ls = rowHidden('Parallax') ? [] : linksFor(ref);
    if (ls.length) sep();
    for (const l of ls) add(`Look up: ${l.label}`, () => window.open(l.url, '_blank', 'noopener'));
  }
  if (d) {
    sep();
    add('Show in Deep-sky list', () => deps.dsoList.reveal(ref.idx));
    if (GAL.has(d.type)) {
      const inTable = deps.hubble.has(d.idx);
      if (d.z == null) add('Add to Hubble table', () => {}, { disabled: true, note: 'no redshift in the catalog' });
      else add(inTable ? 'Remove from Hubble table' : 'Add to Hubble table', () => { if (inTable) deps.hubble.remove(d.idx); else deps.hubble.add(d.idx, true); });
    }
  }
  ctx = { items };
  const head = `<div class="xctx-head"><b>${esc(name || 'Sky point')}</b><span>${esc(fmtRA(s.raJ, 0))}  ${esc(fmtDMS(s.decJ, { dp: 0 }))}</span>` +
    `<span>${esc(conLabel(s.con))}${s.alt < 0 ? ' · below the horizon' : ''}</span></div>`;
  menu.innerHTML = head + items.map((it, i) => (it.sep ? '<div class="xctx-sep" role="separator"></div>'
    : `<button type="button" role="menuitem" data-i="${i}"${it.disabled ? ' disabled' : ''}><span>${esc(it.label)}</span>${it.note ? `<em>${esc(it.note)}</em>` : ''}${it.key ? `<kbd>${esc(it.key)}</kbd>` : ''}</button>`)).join('');
  menu.hidden = false;
  const w = menu.offsetWidth, h = menu.offsetHeight;
  menu.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, clientX + 2)) + 'px';
  menu.style.top = Math.max(6, Math.min(window.innerHeight - h - 6, clientY + 2)) + 'px';
  emit('render');
}
