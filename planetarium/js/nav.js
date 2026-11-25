// nav.js: animated moves of the camera (centre on an object, zoom to a field of view) and tracking.

import { mulMV, mulMM, transpose, unit, clamp, toSph } from './astro.js';
import { state, eff, emit } from './state.js';
import { cam, update, centerHor, lookAtHor, setAxes, placeAt, setCentre, bringUnder, unproject, FOV_MIN } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { refHorApparent, sameRef } from './objects.js';
import { dso } from './catalog.js';

let anim = null;       // {t0, dur, fromFov, toFov, fromHor, ref | null, toHor, v0 (a followed object gliding back to the middle)}

// ---- following -----------------------------------------------------------------
// state.trackRef is followed while state.tracking is on, whatever is selected. Without an offset it is in the middle of the view.
// A drag, the arrow keys or a zoom about the pointer give it an offset: `hold` then says how the camera stands against the object.
//   hold.v   where the object is, as a direction in view space (so a pan, a zoom or a moved centre never shifts it)
//   hold.Q   the whole orientation: view-space images of the object's own axes (to it, north from it, across).
// Every frame the camera is put so that the axes of NOW have those images. So nothing on screen moves, at any rate and also through
// the zenith or beside the pole, where a mount would swing. The mount's own up is kept as well (camera.roll eased to 0) whenever that can be
// done without moving the object and means something: always in the equatorial mount, in alt-az while the horizon is in the picture.
let hold = null, lastNow = 0, levelNow = false;

/** The followed object's axes in HOR, as columns: direction, north tangent (equator of date), across. */
function axes(h, frame) {
  const M = frame.Mdh, P = [M[2], M[5], M[8]], c = P[0] * h[0] + P[1] * h[1] + P[2] * h[2];
  const n = unit([P[0] - c * h[0], P[1] - c * h[1], P[2] - c * h[2]]);
  return [h[0], n[0], n[1] * h[2] - n[2] * h[1], h[1], n[1], n[2] * h[0] - n[0] * h[2], h[2], n[2], n[0] * h[1] - n[1] * h[0]];
}
const trackedHor = (frame) => (state.tracking && state.trackRef ? refHorApparent(state.trackRef, frame, getBodies(frame)) : null);
/** Remember where the followed object is now, as the offset to keep. */
function capture(frame) {
  const h = trackedHor(frame);
  if (!h) { hold = null; return; }
  update(frame);
  const v = unit(mulMV(cam.V, h));
  hold = v[2] > 0 && Math.hypot(v[0], v[1]) < 1e-13 ? null : { v, Q: mulMM(cam.V, axes(h, frame)) };
}
/** The rotation that takes unit vector a to b by the shortest way. */
function turn(a, b) {
  const k = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], c = a[0] * b[0] + a[1] * b[1] + a[2] * b[2], f = 1 / Math.max(1e-9, 1 + c);
  return [1 - f * (k[1] * k[1] + k[2] * k[2]), f * k[0] * k[1] - k[2], f * k[0] * k[2] + k[1], f * k[0] * k[1] + k[2], 1 - f * (k[0] * k[0] + k[2] * k[2]), f * k[1] * k[2] - k[0], f * k[0] * k[2] - k[1], f * k[1] * k[2] + k[0], 1 - f * (k[0] * k[0] + k[1] * k[1])];
}
/** Should (and can) the mount's up be kept, with the object where it is? */
function wantLevel(h) {
  const mz = mulMV(cam.Mt, h)[2], a = cam.roll * Math.PI / 180, side = hold.v[0] * Math.cos(a) - hold.v[1] * Math.sin(a);
  if (side * side > (levelNow ? 0.5 : 0.35) * (1 - mz * mz)) return false;            // beside the mount's pole: up there swings round
  if (eff.mount === 'eq') return true;
  const alt = Math.asin(clamp(cam.V[8], -1, 1)), r = Math.acos(clamp(cam.zMin, -1, 1));
  return Math.abs(alt) - r < (levelNow ? 0.04 * r : 0);
}
const easeRoll = (dt) => { const r = Math.abs(cam.roll) < 0.003 ? 0 : cam.roll * Math.exp(-dt / 180); const was = cam.roll; cam.roll = r; return was !== 0; };
/** Put the camera where the offset says. Returns true while it is still turning upright. */
function placeHeld(frame, h, dt) {
  const A = axes(h, frame), V = mulMM(hold.Q, transpose(A));
  update(frame); setAxes(V, frame);
  levelNow = wantLevel(h);
  if (!levelNow || !dt) return false;
  const f = centerHor(), reach = Math.atan2(Math.hypot(hold.v[0], hold.v[1]), hold.v[2]), r0 = cam.roll, r = Math.abs(r0) < 0.003 ? 0 : r0 * Math.exp(-dt / 180);
  const ok = placeAt(h, hold.v, r, frame), g = centerHor();
  if (!ok || Math.hypot(f[0] - g[0], f[1] - g[1], f[2] - g[2]) > 0.5 * reach + 1e-9) { setAxes(V, frame); return false; }
  hold.Q = mulMM(cam.V, A);
  return r !== 0;
}
/** Begin to follow (in the middle, unless it is being followed already). */
export function track(ref) {
  if (!state.tracking || !sameRef(ref, state.trackRef)) hold = null;
  state.tracking = true; state.trackRef = ref;
  emit('selection');
}
export function stopTracking() {
  hold = null;
  if (!state.tracking) return;
  state.tracking = false;
  if (anim && anim.ref) anim = null;
  emit('selection');
}
export const hasOffset = () => !!hold;
/** [x, y, roll] in degrees (right, up) of the followed object, or null when it is in the middle. */
export function getOffset() {
  if (!state.tracking || !hold) return null;
  const v = hold.v, t = Math.atan2(Math.hypot(v[0], v[1]), v[2]) * 180 / Math.PI, q = Math.hypot(v[0], v[1]) || 1;
  return [t * v[0] / q, t * v[1] / q, cam.roll];
}
export function setOffset([x, y, roll]) {
  const frame = getFrame(), h = trackedHor(frame), t = Math.hypot(x, y) * Math.PI / 180;
  if (!h || !t) return;
  update(frame);
  if (placeAt(h, unit([Math.sin(t) * x / Math.hypot(x, y), Math.sin(t) * y / Math.hypot(x, y), Math.cos(t)]), roll, frame)) { capture(frame); return; }
  // a place the mount alone cannot give: turn the view there directly, keeping the roll at the object
  cam.roll = roll; lookAtHor(h); update(frame);
  const q = Math.hypot(x, y), v = [Math.sin(t) * x / q, Math.sin(t) * y / q, Math.cos(t)];
  setAxes(mulMM(turn([0, 0, 1], v), cam.V), frame); capture(frame);
}

// ---- moves by hand while something is followed (input.js) -----------------------
/** A hand takes hold of the view: whatever glide is under way stops where it is, and the followed object stays followed from there. */
export function takeView() {
  const gliding = !!anim; anim = null;
  if (state.tracking && (gliding || !hold)) capture(getFrame());
}
/** Bring the sky direction a (HOR) under the screen point (x, y); the offset changes to match. `g`: one scratch object per gesture. */
export function moveSky(a, x, y, g) {
  const frame = getFrame();
  if (levelNow || !hold) { Object.assign(g, toSph(mulMV(cam.Mt, a))); bringUnder(g, x, y, frame); }
  else setAxes(mulMM(cam.V, turn(a, unproject(x, y))), frame);
  capture(frame); emit('render');
}
/** Zoom while following: the sky under (x0, y0) goes to (x, y) (a pinch also moves; a wheel does not). */
export function zoomTracked(factor, x0, y0, x = x0, y = y0, g = {}) {
  const a = skyUnder(x0, y0);
  cam.fov = clamp(cam.fov * factor, FOV_MIN, 180); update(getFrame());
  moveSky(a, x, y, g);
}
/** The sky direction under a screen point with the view brought up to date (the clock may have run since the last picture). */
export function skyUnder(x, y) {
  const frame = getFrame(), h = trackedHor(frame);
  if (h && !anim) { if (hold) placeHeld(frame, h, 0); else { update(frame); lookAtHor(h); } }
  update(frame);
  return unproject(x, y);
}

/** Glide to an object (ref) or a fixed apparent HOR direction. Going anywhere but the followed object ends following. */
export function flyTo(target, { fov = null, dur = 700 } = {}) {
  const frame = getFrame();
  const ref = Array.isArray(target) ? null : target;
  if (state.tracking && !(ref && sameRef(ref, state.trackRef))) stopTracking();
  update(frame);
  anim = { t0: performance.now(), dur, fromFov: cam.fov, toFov: fov || cam.fov, fromHor: centerHor(), ref, toHor: ref ? null : target,
    v0: ref && state.tracking && hold && sameRef(ref, state.trackRef) ? hold.v.slice() : null };
  emit('render');
}
export const isAnimating = () => !!anim;
export function cancelAnim() { anim = null; }
/** A zoom step asked for while a glide is under way changes where the glide ends (it used to be thrown away). */
export function zoomAnim(factor) {
  if (!anim) return false;
  anim.toFov = clamp(anim.toFov * factor, FOV_MIN, 180);
  return true;
}

/** Called once per frame before drawing: applies an animation step or tracking. Returns true while moving. */
export function stepNav(now, frame) {
  const dt = clamp(now - lastNow, 1, 100); lastNow = now;
  const sliding = stepCentre(dt);
  if (anim) {
    const bodies = getBodies(frame);
    const to = anim.ref ? refHorApparent(anim.ref, frame, bodies) : anim.toHor;
    if (!to) { anim = null; return false; }
    const t = clamp((now - anim.t0) / anim.dur, 0, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;      // ease in-out
    cam.fov = Math.exp(Math.log(anim.fromFov) + (Math.log(anim.toFov) - Math.log(anim.fromFov)) * e);
    if (anim.v0 && hold && state.tracking) {
      // the followed object glides back to the middle: its offset shrinks to nothing, whatever the sky is doing
      const v0 = anim.v0, th = Math.atan2(Math.hypot(v0[0], v0[1]), v0[2]) * (1 - e), q = Math.hypot(v0[0], v0[1]) || 1;
      const v = [Math.sin(th) * v0[0] / q, Math.sin(th) * v0[1] / q, Math.cos(th)];
      hold.Q = mulMM(turn(hold.v, v), hold.Q); hold.v = v;
      placeHeld(frame, to, dt);
      if (t >= 1) { anim = null; hold = null; update(frame); lookAtHor(to); update(frame); }
      return true;
    }
    const a = anim.fromHor;
    const d = Math.acos(clamp(a[0] * to[0] + a[1] * to[1] + a[2] * to[2], -1, 1));
    let h = to;
    if (d > 1e-9 && e < 1) {
      const sa = Math.sin((1 - e) * d) / Math.sin(d), sb = Math.sin(e * d) / Math.sin(d);
      h = unit([a[0] * sa + to[0] * sb, a[1] * sa + to[1] * sb, a[2] * sa + to[2] * sb]);
    }
    easeRoll(dt);
    update(frame); lookAtHor(h);
    if (t >= 1) anim = null;
    return true;
  }
  const h = trackedHor(frame);
  if (h && hold) return placeHeld(frame, h, dt) || sliding;
  const rolling = easeRoll(dt);
  if (h) { update(frame); lookAtHor(h); }
  return rolling || sliding;
}
// the middle of the free sky (layout.js) is approached smoothly, and not while a finger holds the sky
const aim = { x: 0, y: 0, set: false, held: false };
export function aimCentre(x, y, atOnce = false) { aim.x = x; aim.y = y; if (atOnce) { setCentre(x, y); } emit('render'); }
export function holdCentre(on) { aim.held = on; }
function stepCentre(dt) {
  const dx = aim.x - cam.ox, dy = aim.y - cam.oy;
  if ((!dx && !dy) || aim.held) return false;
  if (Math.hypot(dx, dy) < 0.4) setCentre(aim.x, aim.y);
  else { const k = 1 - Math.exp(-dt / 70); setCentre(cam.ox + dx * k, cam.oy + dy * k); }
  return true;
}
export { mulMV, toSph };

// ---- selection ---------------------------------------------------------------
/** Select (or, with null, deselect). What is followed goes on being followed. */
export function select(ref) {
  // a notebook lab (js/notebook/host.js): closing the object panel only puts the panel away, Record still reads the object
  if (!ref && state.keepTracked && state.tracking) { emit('dismiss'); return; }
  state.selected = ref || null;
  emit('selection');
}
/** Fields (degrees) that other modules want in the picture with an object: functions of the ref (labs/compare.js: the second observer's image). */
export const alsoFrame = [];
/** A field of view that frames the object nicely. */
export function niceFov(ref) {
  let f = baseFov(ref);
  for (const fn of alsoFrame) f = Math.max(f, Math.min(60, fn(ref) || 0));
  return f;
}
/** For a search: the field to arrive with. The one in use, unless so narrow that the object would not fit or nothing would be recognised. */
export function arriveFov(ref) {
  const near = { body: 0, con: 30, star: 0.25, dso: 0.1, gaia: 0 }[ref.kind];
  let size = 0;
  if (ref.kind === 'body') { const b = getBodies(getFrame()).byId[ref.id]; size = b ? 3 * b.angRadius * (b.id === 'Saturn' ? 2.3 : 1) : 0; }
  else if (ref.kind === 'dso') { const o = dso.rows[ref.idx]; size = o && o.maj ? o.maj / 60 : 0; }
  if (cam.fov >= Math.max(near, size)) return null;
  return ref.kind === 'star' ? 2 : niceFov(ref);
}
function baseFov(ref) {
  const bodies = getBodies(getFrame());
  if (ref.kind === 'body') {
    const b = bodies.byId[ref.id];
    if (!b) return 10;
    if (b.kind === 'sun' || b.kind === 'moon') return 2.2;
    if (b.kind === 'satellite') return clamp(b.angRadius * 9, 0.00004, 0.5);
    if (b.kind === 'asteroid' || b.kind === 'dwarf' || b.kind === 'comet') return clamp(b.angRadius * 9, 0.00004, 0.5);
    if (b.moons && b.moons.length) return clamp(b.angRadius * 2 * 14, 0.08, 0.4);
    return clamp(b.angRadius * 2 * 30, 0.02, 0.3);
  }
  if (ref.kind === 'con') return 50;
  if (ref.kind === 'star') return cam.fov > 25 ? 20 : 2;                // a second press goes closer; from a field with nothing else in it, back out
  if (ref.kind === 'dso') { const o = dso.rows[ref.idx]; return clamp((o && o.maj ? o.maj / 60 : 0.1) * 7, 0.25, 8); }
  if (ref.kind === 'gaia') { const m = ref.t.mag[ref.i]; return m <= 12 ? 2 : m <= 15 ? 0.6 : m <= 18 ? 0.2 : 0.08; }      // a field in which the star is well above the limit
  return 6;
}
/** Centre on an object, and HOLD it there (as Stellarium's Space does): with the clock running the sky turns 15 arcsec a second, so a
 *  one-off centring was already 19 arcsec stale when the glide ended. A drag afterwards keeps following, with an offset.
 *  zoom: true = to the field that frames it, in or out; 'arrive' = only out, when the present field is too narrow for it (search). */
export function centerOn(ref, zoom = false) {
  if (!ref) return;
  const same = state.tracking && sameRef(ref, state.trackRef);
  track(ref);
  flyTo(ref, { fov: zoom === 'arrive' ? (same ? null : arriveFov(ref)) : zoom ? niceFov(ref) : null });
}
/** T and the Track button: follow the selected object; if it is the one followed (or nothing is selected), stop. */
export function toggleTracking(on) {
  const sel = state.selected, same = state.tracking && (!sel || sameRef(sel, state.trackRef));
  const want = on === undefined ? !same : on;
  if (!want) { if (same) stopTracking(); return; }
  if (!sel) return;
  track(sel); flyTo(sel);
}
