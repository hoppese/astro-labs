// cursor.js: the pointer read-out. As the mouse moves over the sky it shows the right ascension and
// declination (J2000, or of date), the altitude and azimuth, and the constellation under the pointer
// (from the IAU boundaries, via astronomy-engine). Docked at the bottom centre by default so it never
// covers what is being pointed at; it can follow the pointer instead, or be switched off (Settings).
// It also keeps `pointer.con` up to date so the hovered constellation's region can be highlighted.
// Cost: one unprojection and one boundary lookup per animation frame at most, and only while the
// pointer moves or the sky does.

import { A, RAD, mod, mulMV, toSph, horToAzAlt, unrefractHor } from './astro.js';
import { state, on, emit, eff } from './state.js';
import { cam, unproject, update } from './camera.js';
import { getFrame } from './skyframe.js';
import { constellations } from './catalog.js';
import { xs, saveXs, el, loadJSON, saveJSON } from './xui.js';

export const pointer = { inside: false, x: 0, y: 0, con: null, eqj: null };
const opt = { mode: 'dock', ofDate: false };            // mode: dock | follow | off
const OPT_KEY = 'astro-labs.planetarium.cursor.v1';
let box = null, pending = false, lastText = '', lastCon = null, canvasEl = null;
const conName = new Map();

const p2 = (n) => String(n).padStart(2, '0');
/** RA with a precision that suits the field of view; fixed width so the digits do not dance. */
function raText(deg, fov) {
  const tenths = fov < 0.2;
  const unit = fov > 20 ? 60 : tenths ? 0.1 : 1;                  // seconds of time per step
  let t = Math.round(mod(deg, 360) / 15 * 3600 / unit) * unit;
  if (t >= 86400) t -= 86400;
  const h = Math.floor(t / 3600), m = Math.floor((t - h * 3600) / 60), s = t - h * 3600 - m * 60;
  if (fov > 20) return `${p2(h)}h ${p2(m)}m`;
  return `${p2(h)}h ${p2(m)}m ${tenths ? s.toFixed(1).padStart(4, '0') : p2(Math.round(s))}s`;
}
function decText(deg, fov) {
  const unit = fov > 20 ? 60 : 1;                                 // arcseconds per step
  const t = Math.round(Math.abs(deg) * 3600 / unit) * unit;
  const d = Math.floor(t / 3600), m = Math.floor((t - d * 3600) / 60), s = t - d * 3600 - m * 60;
  const sg = deg < 0 && t > 0 ? '−' : '+';
  return `${sg}${p2(d)}° ${p2(m)}′` + (fov > 20 ? '' : ` ${p2(s)}″`);
}
const degText = (v, fov, signed) => {
  const dp = fov > 20 ? 1 : fov > 1 ? 2 : fov > 0.05 ? 3 : 4;
  const s = Math.abs(v).toFixed(dp).padStart(dp + (signed ? 3 : 4), '0');
  return (signed ? (v < 0 && +s !== 0 ? '−' : '+') : '') + s + '°';
};

/** Everything about the sky point under a screen position. */
export function skyAt(x, y, frame = getFrame()) {
  update(frame);
  const app = unproject(x, y);                                   // apparent direction as drawn
  const hor = eff.refraction ? unrefractHor(app) : app;   // true direction
  const eqj = mulMV(frame.Mhj, hor);
  // take the aberration back out, so the J2000 read-out matches catalogue positions
  const b = frame.beta, n = Math.hypot(eqj[0] - b[0], eqj[1] - b[1], eqj[2] - b[2]);
  const cat = [(eqj[0] - b[0]) / n, (eqj[1] - b[1]) / n, (eqj[2] - b[2]) / n];
  const j = toSph(cat), d = toSph(mulMV(frame.Mjd, eqj)), aa = horToAzAlt(app);
  let con = null;
  try { con = A.Constellation(mod(j.lon, 360) / 15, j.lat).symbol; } catch (e) { con = null; }
  return { app, eqj: cat, raJ: mod(j.lon, 360), decJ: j.lat, raD: mod(d.lon, 360), decD: d.lat, az: aa.az, alt: aa.alt, con };
}
export function conLabel(sym) {
  if (!conName.size) for (const c of constellations) conName.set(c.id.toLowerCase(), c);
  const c = sym ? conName.get(sym.toLowerCase()) : null;
  return c ? c.name : (sym || '');
}
export function conById(sym) { conLabel(sym); return sym ? conName.get(sym.toLowerCase()) || null : null; }

function refresh() {
  pending = false;
  if (!box) return;
  if (!pointer.inside) { if (!box.hidden) { box.hidden = true; setTimeout(() => emit('render'), 430); } if (lastCon !== null) { lastCon = null; pointer.con = null; emit('render'); } return; }
  const s = skyAt(pointer.x, pointer.y);
  pointer.eqj = s.eqj;
  if (s.con !== lastCon) { lastCon = s.con; pointer.con = s.con; if (state.show.conBounds) emit('render'); }
  if (opt.mode === 'off') { box.hidden = true; return; }
  const fov = cam.fov;
  const ra = opt.ofDate ? s.raD : s.raJ, dec = opt.ofDate ? s.decD : s.decJ;
  // at a pole of the coordinates the longitude-like angle means nothing: say so instead of showing noise
  const tol = Math.min(0.02, fov / 2000);
  const raT = Math.abs(dec) > 90 - tol ? raText(0, fov).replace(/\d/g, '–') : raText(ra, fov);
  const azT = Math.abs(s.alt) > 90 - tol ? degText(0, fov, false).replace(/\d/g, '–') : degText(s.az, fov, false);
  const text = `<span class="g"><i>RA</i>${raT}</span><span class="g"><i>Dec</i>${decText(dec, fov)}</span>` +
    `<span class="ep">${opt.ofDate ? 'of date' : 'J2000'}</span>` +
    `<span class="g az"><i>Az</i>${azT}</span><span class="g"><i>Alt</i>${degText(s.alt, fov, true)}</span>` +
    `<span class="con">${conLabel(s.con)}</span>`;
  if (text !== lastText) { box.innerHTML = text; lastText = text; }
  if (box.hidden) { box.hidden = false; setTimeout(() => emit('render'), 430); }      // sky labels then make room for it
  if (opt.mode === 'follow') {
    const r = canvasEl.getBoundingClientRect(), w = box.offsetWidth, h = box.offsetHeight;
    let x = pointer.x + 18, y = pointer.y + 22;
    if (x + w > r.width - 8) x = pointer.x - w - 14;
    if (y + h > r.height - 8) y = pointer.y - h - 14;
    box.style.transform = `translate(${Math.round(r.left - document.body.offsetLeft + Math.max(6, x))}px, ${Math.round(r.top - document.body.offsetTop + Math.max(6, y))}px)`;
  }
}
const schedule = () => { if (!pending) { pending = true; requestAnimationFrame(refresh); } };

function setMode(mode) {
  opt.mode = mode;
  box.classList.toggle('follow', mode === 'follow');
  if (mode !== 'follow') box.style.transform = '';
  lastText = ''; schedule();
}

export function initCursor(canvas) {
  canvasEl = canvas;
  const saved = loadJSON(OPT_KEY, null);
  if (saved) { if (['dock', 'follow', 'off'].includes(saved.mode)) opt.mode = saved.mode; opt.ofDate = !!saved.ofDate; }
  box = el('div', 'xcursor'); box.hidden = true; box.setAttribute('aria-hidden', 'true');
  document.body.appendChild(box);
  setMode(opt.mode);
  canvas.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    const r = canvas.getBoundingClientRect();
    pointer.inside = true; pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    schedule();
  });
  const leave = () => { if (pointer.inside) { pointer.inside = false; schedule(); } };
  canvas.addEventListener('pointerleave', leave);
  canvas.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') leave(); });
  window.addEventListener('blur', leave);
  // the sky moves under a still pointer when time runs or the view animates
  on('frame', () => { if (pointer.inside) schedule(); });

  // settings: a small section in the drawer
  const body = document.querySelector('.drawer-body');
  if (body) {
    const sec = el('section', '', `<h3>Pointer read-out</h3>
      <div class="seg" id="xCurSeg" role="radiogroup" aria-label="Pointer read-out">
        <button type="button" role="radio" data-mode="dock">Bottom of the sky</button><button type="button" role="radio" data-mode="follow">At the pointer</button><button type="button" role="radio" data-mode="off">Off</button>
      </div>
      <label class="check" style="margin-top:8px"><input type="checkbox" id="xCurDate"> RA / Dec of date (default: J2000)</label>
      <div class="hint">Move the mouse over the sky to read the coordinates and the constellation under it. Right-click (or press and hold on a touch screen) for more.</div>`);
    const anchor = [...body.children].find((s) => s.querySelector('#mountSeg'));
    body.insertBefore(sec, anchor ? anchor.nextSibling : null);
    const sync = () => { sec.querySelectorAll('#xCurSeg button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === opt.mode))); sec.querySelector('#xCurDate').checked = opt.ofDate; };
    sec.querySelectorAll('#xCurSeg button').forEach((b) => b.addEventListener('click', () => { setMode(b.dataset.mode); saveJSON(OPT_KEY, opt); sync(); }));
    sec.querySelector('#xCurDate').addEventListener('change', (e) => { opt.ofDate = e.target.checked; saveJSON(OPT_KEY, opt); lastText = ''; schedule(); });
    sync();
  }
}
export { xs, saveXs, RAD };
