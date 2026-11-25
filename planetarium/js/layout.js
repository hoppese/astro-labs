// layout.js: what the floating panels leave of the sky.
//  - the middle of the free sky becomes the middle of the view (nav.js aimCentre): on a small screen the object panel, the lab cards, the
//    angle tool and the side panels all count; on a wide one only the panels that cover a large part of the window;
//  - an object that was tapped (not followed) and now lies under the sheet is brought out from under it;
//  - the "Tracking …" chip, and on a phone the lines of things at the top of the sky, get places clear of each other.

import { state, on } from './state.js';
import { cam, projectHor, unproject, update } from './camera.js';
import { aimCentre, centerOn, flyTo, select, stopTracking, isAnimating } from './nav.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { refHorApparent, refName, refKey } from './objects.js';

/** A window where the object panel would cover much of the sky: it opens in its short form (info.js). */
export const smallWindow = (w = window.innerWidth, h = window.innerHeight) => w <= 860 || h <= 600;

/** The free rectangle of a w x h sky, given the panels on it ({x0, y0, x1, y1} each); null when nothing covers it. `top`, `bottom`: the bars. */
export function freeSky(w, h, panels, top = 52, bottom = 52) {
  let l = 0, r = w, t = top, b = h - bottom, any = false;
  for (const p of panels) {
    const x0 = Math.max(0, p.x0), x1 = Math.min(w, p.x1), y0 = Math.max(0, p.y0), y1 = Math.min(h, p.y1);
    if (x1 - x0 < 20 || y1 - y0 < 20) continue;
    if (x1 - x0 > 0.6 * w) { if ((y0 + y1) / 2 > h / 2) { if (y0 < b) { b = y0; any = true; } } else if (y1 > t) { t = y1; any = true; } }
    else if (y1 - y0 > 0.4 * (h - top - bottom)) { if ((x0 + x1) / 2 > w / 2) { if (x0 < r) { r = x0; any = true; } } else if (x1 > l) { l = x1; any = true; } }
  }
  if (!any || r - l < 110 || b - t < 70) return null;
  return { l, r, t, b };
}

let canvas, chip, chipName, seen = '', lastKey = '';
const shown = (el) => el && !el.hidden && el.offsetHeight > 0;
function panels() {
  const c = canvas.getBoundingClientRect(), out = [], small = window.innerWidth <= 900 || window.innerHeight <= 600;
  if (document.documentElement.classList.contains('nb-over') && window.innerWidth <= 560) return out;       // the notebook fills the screen
  const add = (sel, ok = () => true) => { for (const el of document.querySelectorAll(sel)) if (shown(el) && ok(el)) { const q = el.getBoundingClientRect(); out.push({ x0: q.left - c.left, y0: q.top - c.top, x1: q.right - c.left, y1: q.bottom - c.top }); } };
  add('.xpanel', (el) => !el.classList.contains('peek') && (small || !el.classList.contains('card')));
  if (document.documentElement.classList.contains('nb-over') && window.innerWidth > 560) add('.nbpanel');
  if (small) { add('.infopanel'); add('.labsdock', (el) => !!el.querySelector('.lcard:not([hidden])')); add('.measurepanel'); }
  return out;
}
function measure(atOnce) {
  if (!canvas || !canvas.clientWidth) return;
  const bar = document.querySelector('.bottombar').offsetHeight, free = freeSky(canvas.clientWidth, canvas.clientHeight, panels(), 52, bar);
  // beside a tall panel the view moves sideways only: the bars have never counted
  const x = free ? (free.l + free.r) / 2 - canvas.clientWidth / 2 : 0, banded = free && (free.t > 52 || free.b < canvas.clientHeight - bar);
  const y = banded ? (free.t + free.b) / 2 - canvas.clientHeight / 2 : 0;
  const key = Math.round(x) + ',' + Math.round(y);
  if (key !== lastKey) { lastKey = key; aimCentre(Math.round(x), Math.round(y), atOnce); }
  uncover(free);
  stack();
}
/** The object just selected by hand lies under a panel: move the view so that it does not. (What is followed is not moved.) */
function uncover(free) {
  const key = refKey(state.selected);
  if (key === seen || Math.hypot(cam.ox, cam.oy) === 0 && lastKey !== '0,0') return;
  seen = key;
  if (!state.selected || state.tracking || !free || isAnimating() || (window.innerWidth > 900 && window.innerHeight > 600)) return;
  const frame = getFrame(), h = refHorApparent(state.selected, frame, getBodies(frame)), p = [0, 0];
  update(frame);
  const [ax, ay] = lastKey.split(',').map(Number), ddx = cam.w / 2 + ax - cam.cx, ddy = cam.h / 2 + ay - cam.cy;      // where the sky is sliding to
  if (!h || !projectHor(h, p)) return;
  const m = 34, X = p[0] + ddx, Y = p[1] + ddy, nx = Math.min(free.r - m, Math.max(free.l + m, X)), ny = Math.min(free.b - m, Math.max(free.t + m, Y));
  if (Math.hypot(nx - X, ny - Y) > 1) flyTo(unproject(cam.cx - (nx - X), cam.cy - (ny - Y)), { dur: 320 });
}
/** Places for the chip and, on a phone, for what hangs from the top bar: notice, angle tool, read-out, chip, one below the other. */
function stack() {
  const set = (k, v) => { if (document.documentElement.style.getPropertyValue(k) !== v) document.documentElement.style.setProperty(k, v); };
  const ro = document.getElementById('readout'), note = document.querySelector('.steady-note'), mp = document.getElementById('measurePanel');
  set('--ro-h', (shown(ro) ? ro.offsetHeight : 0) + 'px');
  set('--ro-w', (shown(ro) ? ro.offsetWidth : 0) + 'px');
  set('--chip-w', (shown(chip) ? chip.offsetWidth : 0) + 'px');
  let y = 56;
  set('--sn-top', y + 'px'); if (shown(note)) y += note.offsetHeight + 6;
  set('--mpt', y + 'px'); if (shown(mp)) y += mp.offsetHeight + 6;
  set('--ro-top', y + 'px');
}

export function initLayout(el) {
  canvas = el;
  chip = document.createElement('div'); chip.className = 'trackchip'; chip.hidden = true; chip.setAttribute('role', 'status');
  chip.innerHTML = '<button type="button" class="tc-go"><span class="tc-w">Tracking </span><b></b></button><button type="button" class="tc-x" aria-label="Stop tracking">&times;</button>';
  document.body.appendChild(chip); chipName = chip.querySelector('b');
  chip.querySelector('.tc-go').addEventListener('click', () => { const ref = state.trackRef; if (ref) { select(ref); centerOn(ref); } });
  chip.querySelector('.tc-x').addEventListener('click', stopTracking);
  const sync = () => {
    chip.hidden = !(state.tracking && state.trackRef);
    if (chip.hidden) return;
    const nm = refName(state.trackRef); chipName.textContent = nm;
    chip.querySelector('.tc-go').title = `Bring ${nm} back to the middle`; chip.querySelector('.tc-x').title = `Stop tracking ${nm} (T)`;
  };
  on('selection', sync); sync();
  on('selection', () => setTimeout(() => measure(), 0)); on('measure', () => setTimeout(() => measure(), 0));
  for (const ev of ['labs-cards']) document.addEventListener(ev, () => setTimeout(() => measure(), 0));
  window.addEventListener('resize', () => setTimeout(() => measure(true), 0));
  setInterval(() => measure(), 200);
  measure(true);
}
