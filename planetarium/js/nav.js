// nav.js: animated moves of the camera (centre on an object, zoom to a field of view) and tracking.

import { mulMV, unit, clamp, toSph } from './astro.js';
import { state, emit } from './state.js';
import { cam, update, centerHor, lookAtHor, FOV_MIN } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { refHorApparent, sameRef } from './objects.js';

let anim = null;       // {t0, dur, fromFov, toFov, fromHor, target: ref | null, toHor}

/** Glide to an object (ref) or a fixed apparent HOR direction. */
export function flyTo(target, { fov = null, dur = 700 } = {}) {
  const frame = getFrame();
  update(frame);
  anim = { t0: performance.now(), dur, fromFov: cam.fov, toFov: fov || cam.fov, fromHor: centerHor(),
    ref: Array.isArray(target) ? null : target, toHor: Array.isArray(target) ? target : null };
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
  if (anim) {
    const bodies = getBodies(frame);
    const to = anim.ref ? refHorApparent(anim.ref, frame, bodies) : anim.toHor;
    if (!to) { anim = null; return false; }
    let t = clamp((now - anim.t0) / anim.dur, 0, 1);
    const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;      // ease in-out
    const a = anim.fromHor;
    const d = Math.acos(clamp(a[0] * to[0] + a[1] * to[1] + a[2] * to[2], -1, 1));
    let h = to;
    if (d > 1e-9 && e < 1) {
      const sa = Math.sin((1 - e) * d) / Math.sin(d), sb = Math.sin(e * d) / Math.sin(d);
      h = unit([a[0] * sa + to[0] * sb, a[1] * sa + to[1] * sb, a[2] * sa + to[2] * sb]);
    }
    update(frame); lookAtHor(h);
    cam.fov = Math.exp(Math.log(anim.fromFov) + (Math.log(anim.toFov) - Math.log(anim.fromFov)) * e);
    if (t >= 1) anim = null;
    return true;
  }
  const held = state.keepTracked && state.trackRef ? state.trackRef : state.selected;
  if (state.tracking && held) {
    const h = refHorApparent(held, frame, getBodies(frame));
    if (h) { update(frame); lookAtHor(h); }
  }
  return false;
}
export { mulMV, toSph };

// ---- selection ---------------------------------------------------------------
export function select(ref) {
  // a notebook lab (js/notebook/host.js) goes on following its star whatever is clicked: closing the object panel only puts the
  // panel away, and looking at a field star does not let go of the lab's star
  if (state.keepTracked && state.tracking) {
    if (!ref) { emit('dismiss'); return; }
    state.selected = ref; emit('selection'); return;
  }
  // tracking belongs to one object: choosing another (or none) ends it, so that "select it, then press T" always starts
  // following the new object (it used to carry over silently, and T then switched it off)
  if (!ref || !sameRef(ref, state.selected)) state.tracking = false;
  state.selected = ref || null;
  emit('selection');
}
/** A field of view that frames the object nicely. */
export function niceFov(ref) {
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
  if (ref.kind === 'star') return 20;
  if (ref.kind === 'gaia') { const m = ref.t.mag[ref.i]; return m <= 12 ? 2 : m <= 15 ? 0.6 : m <= 18 ? 0.2 : 0.08; }      // a field in which the star is well above the limit
  return 6;
}
export function centerOn(ref, zoom = false) {
  if (!ref) return;
  state.trackRef = ref;
  // Centring HOLDS the object (as Stellarium's Space does): with the clock running the sky turns 15 arcsec a second, so a
  // one-off centring was already 19 arcsec stale when the glide ended, and the star left a zoomed-in field within a second.
  // Dragging or the arrow keys let go again (input.js); T toggles.
  if (sameRef(ref, state.selected) && !state.tracking) { state.tracking = true; emit('selection'); }
  flyTo(ref, { fov: zoom ? Math.min(cam.fov, niceFov(ref)) : null });
}
export function toggleTracking(on) {
  if (!state.selected) return;
  const other = state.keepTracked && state.tracking && state.trackRef && !sameRef(state.trackRef, state.selected);      // T on another object: follow that one
  state.tracking = on === undefined ? other || !state.tracking : on;
  if (state.tracking) { state.trackRef = state.selected; flyTo(state.selected); }
  emit('selection');
}
