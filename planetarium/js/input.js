// input.js: mouse, trackpad, touch and keyboard navigation on the sky canvas.
// Drag pans (the sky point under the pointer stays under it), wheel / two-finger scroll / pinch
// zooms about the pointer, a click selects the nearest object. While something is followed a drag keeps following it with an offset
// (nav.js); a zoom is about the pointer once there is an offset, about the object while it is in the middle.

import { state, emit } from './state.js';
import { cam, mountAt, bringUnder, zoomAt, update, unproject } from './camera.js';
import { sameRef } from './objects.js';
import { getFrame } from './skyframe.js';
import { pickAt } from './picks.js';
import { takeEaten } from './clickguard.js';
import { select, centerOn, flyTo, cancelAnim, zoomAnim, takeView, moveSky, zoomTracked, skyUnder, hasOffset, holdCentre, driven, releaseDriver } from './nav.js';

const CLICK_SLOP = 5, TAP_SLOP = 12;      // px a mouse / a finger may wander and still have clicked
const DOUBLE_MS = 320, DOUBLE_PX = 34;     // two taps this close are a double tap

export function initInput(canvas, { onClickSky } = {}) {
  const pointers = new Map();
  let grab = null, moved = 0, downAt = null, pinch = null, lastTap = null, lastType = 'mouse';

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const userMoves = () => { releaseDriver('drag'); if (state.tracking) takeView(); else cancelAnim(); };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    lastType = e.pointerType; holdCentre(true);
    pointers.set(e.pointerId, p);
    update(getFrame());
    if (pointers.size === 1) { grab = mountAt(p[0], p[1]); moved = 0; downAt = p; }
    else if (pointers.size === 2) startPinch();
    canvas.focus({ preventScroll: true });
  });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, fov: cam.fov, g: mountAt(mx, my), mx, my, last: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, began: false, scratch: {} };
    moved = 99; lastTap = null;
  }
  canvas.addEventListener('pointermove', (e) => {
    const p = pos(e);
    if (!pointers.has(e.pointerId)) {
      // hover feedback: a pointer cursor over anything selectable
      if (e.pointerType === 'mouse') canvas.classList.toggle('pointing', !!pickAt(p[0], p[1], 9));
      return;
    }
    const prev = pointers.get(e.pointerId);
    pointers.set(e.pointerId, p);
    const frame = getFrame();
    if (pointers.size === 1 && grab) {
      moved = Math.max(moved, Math.hypot(p[0] - downAt[0], p[1] - downAt[1]));
      if (moved > (e.pointerType === 'mouse' ? CLICK_SLOP : TAP_SLOP)) {
        if (!canvas.classList.contains('dragging')) {
          canvas.classList.add('dragging'); userMoves();
          if (e.pointerType !== 'mouse' && !state.tracking) { update(frame); grab = mountAt(prev[0], prev[1]); }      // no jump by the 12 px it took to be sure
        }
        if (state.tracking) moveSky(skyUnder(prev[0], prev[1]), p[0], p[1], grab);
        else bringUnder(grab, p[0], p[1], frame);
        emit('render');
      }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      if (driven()) { pinch.mx = mx; pinch.my = my; cam.fov = driven().clampFov(cam.fov * pinch.last / d); pinch.last = d; emit('render'); return; }      // pointing: the phone holds the view, two fingers only zoom
      if (!pinch.began) { pinch.began = true; pinch.offset = hasOffset() || grabbedAway(); if (!state.tracking || pinch.offset) userMoves(); else cancelAnim(); pinch.fov = cam.fov; }
      if (state.tracking && !pinch.offset) zoomAt(pinch.last / d, cam.cx, cam.cy, frame, true);       // the followed object stays in the middle
      else if (state.tracking) zoomTracked(pinch.last / d, pinch.mx, pinch.my, mx, my, pinch.scratch);
      else {
        cam.fov = pinch.fov * pinch.d / d;
        update(frame);
        bringUnder(pinch.g, mx, my, frame);
      }
      pinch.mx = mx; pinch.my = my; pinch.last = d;
      emit('render');
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size === 0) {
      holdCentre(false);
      const touch = e.pointerType === 'touch';
      if (e.type === 'pointerup' && moved <= (e.pointerType === 'mouse' ? CLICK_SLOP : TAP_SLOP) && downAt) {
        // with the object sheet open on a small screen a tap is first of all a way to put it away: only a tap right on something else selects that
        const open = touch && panelOpen();
        let ref = pickAt(downAt[0], downAt[1], open ? 11 : 20);
        if (!touch) ref = pickAt(p[0], p[1], 12);
        const now = performance.now(), twice = touch && lastTap && now - lastTap.t < DOUBLE_MS && Math.hypot(p[0] - lastTap.x, p[1] - lastTap.y) < DOUBLE_PX;
        if (takeEaten()) lastTap = null;                  // it closed a panel, or was meant for one
        else if (onClickSky && onClickSky(p[0], p[1], ref)) lastTap = null;
        else if (twice) doubleTap(p, lastTap.ref);
        else {
          lastTap = touch ? { t: now, x: p[0], y: p[1], ref } : null;
          select(open && sameRef(ref, state.selected) ? null : ref);
        }
      }
      grab = null; pinch = null; downAt = null;
    } else if (pointers.size === 1) {
      // one finger lifted after a pinch: keep panning with the other
      const q = [...pointers.values()][0];
      grab = mountAt(q[0], q[1]); pinch = null; moved = 99; downAt = q;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  const panelOpen = () => { const el = document.querySelector('.infopanel'); return !!el && el.offsetHeight > 0 && el.classList.contains('small'); };
  /** A finger already moved a followed object off the middle in this gesture? */
  const grabbedAway = () => canvas.classList.contains('dragging');
  /** Two taps: center what the first one was on; on empty sky, zoom in about the place. */
  function doubleTap(p, ref) {
    lastTap = null;
    if (driven()) { if (ref) select(ref); return; }
    if (ref) { select(ref); centerOn(ref); return; }
    if (state.tracking) { if (hasOffset()) zoomTracked(0.5, p[0], p[1]); else zoomAt(0.5, p[0], p[1], getFrame(), true); emit('render'); }
    else { update(getFrame()); flyTo(unproject(cam.cx + (p[0] - cam.cx) / 2, cam.cy + (p[1] - cam.cy) / 2), { fov: cam.fov / 2, dur: 260 }); }
  }
  canvas.addEventListener('dblclick', (e) => {
    if (lastType === 'touch') return;      // the taps have been dealt with already
    const p = pos(e); const ref = pickAt(p[0], p[1]);
    if (ref) { select(ref); centerOn(ref); }
  });

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const p = pos(e);
    // ctrlKey = trackpad pinch (small deltas); otherwise wheel / two-finger scroll
    let dy = e.deltaY * (e.deltaMode === 1 ? 32 : 1);
    const k = e.ctrlKey ? 0.012 : 0.0022;
    dy = Math.max(-240, Math.min(240, dy));
    const f = Math.exp(dy * k);
    if (state.tracking) { if (!zoomAnim(f)) { if (hasOffset()) zoomTracked(f, p[0], p[1]); else zoomAt(f, p[0], p[1], getFrame(), true); } }
    else { cancelAnim(); zoomAt(f, p[0], p[1], getFrame()); }
    emit('render');
  }, { passive: false });
  // Safari's own pinch gesture would zoom the page
  for (const t of ['gesturestart', 'gesturechange']) canvas.addEventListener(t, (e) => e.preventDefault());
}

/** Keyboard navigation (arrows pan, + / - zoom). Returns true if the key was used. */
export function navKey(e) {
  const frame = getFrame();
  const step = cam.fov * 0.12;
  const pan = (dl, db) => {
    if (state.tracking) {
      takeView();
      const px = 0.12 * cam.h, a = skyUnder(cam.cx, cam.cy);
      moveSky(a, cam.cx + px * Math.sign(dl), cam.cy + px * Math.sign(db), {});
      return;
    }
    releaseDriver('drag'); cancelAnim();
    cam.lon += dl / Math.max(Math.cos(cam.lat * Math.PI / 180), 0.15); cam.lat += db; update(frame); emit('render');
  };
  // on screen, +lon is to the left in both mounts (east is left of north when looking up at the sky)
  switch (e.key) {
    case 'ArrowLeft': pan(step, 0); return true;
    case 'ArrowRight': pan(-step, 0); return true;
    case 'ArrowUp': pan(0, step); return true;
    case 'ArrowDown': pan(0, -step); return true;
    case '+': case '=': case 'PageUp': if (!zoomAnim(1 / 1.25)) zoomAt(1 / 1.25, cam.cx, cam.cy, frame, true); emit('render'); return true;
    case '-': case '_': case 'PageDown': if (!zoomAnim(1.25)) zoomAt(1.25, cam.cx, cam.cy, frame, true); emit('render'); return true;
  }
  return false;
}
