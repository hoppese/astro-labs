// input.js: mouse, trackpad, touch and keyboard navigation on the sky canvas.
// Drag pans (the sky point under the pointer stays under it), wheel / two-finger scroll / pinch
// zooms about the pointer, a click selects the nearest object.

import { state, emit } from './state.js';
import { cam, mountAt, bringUnder, zoomAt, update } from './camera.js';
import { getFrame } from './skyframe.js';
import { pickAt } from './picks.js';
import { select, centerOn, cancelAnim, zoomAnim } from './nav.js';

const CLICK_SLOP = 5;

export function initInput(canvas, { onClickSky } = {}) {
  const pointers = new Map();
  let grab = null, moved = 0, downAt = null, pinch = null;

  const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const userMoves = () => { cancelAnim(); if (state.tracking) { state.tracking = false; emit('selection'); } };

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button !== 0 && e.pointerType === 'mouse') return;
    canvas.setPointerCapture(e.pointerId);
    const p = pos(e);
    pointers.set(e.pointerId, p);
    update(getFrame());
    if (pointers.size === 1) { grab = mountAt(p[0], p[1]); moved = 0; downAt = p; }
    else if (pointers.size === 2) startPinch();
    canvas.focus({ preventScroll: true });
  });
  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]) || 1, fov: cam.fov, g: mountAt(mx, my) };
    moved = 99;
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
      moved += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
      if (moved > CLICK_SLOP) {
        if (!canvas.classList.contains('dragging')) { canvas.classList.add('dragging'); userMoves(); }
        bringUnder(grab, p[0], p[1], frame);
        emit('render');
      }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, d = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      userMoves();
      cam.fov = pinch.fov * pinch.d / d;
      update(frame);
      bringUnder(pinch.g, mx, my, frame);
      emit('render');
    }
  });
  const end = (e) => {
    if (!pointers.has(e.pointerId)) return;
    const p = pointers.get(e.pointerId);
    pointers.delete(e.pointerId);
    canvas.classList.remove('dragging');
    if (pointers.size === 0) {
      if (e.type === 'pointerup' && moved <= CLICK_SLOP && downAt) {
        const ref = pickAt(p[0], p[1], e.pointerType === 'touch' ? 20 : 12);
        if (!(onClickSky && onClickSky(p[0], p[1], ref))) select(ref);
      }
      grab = null; pinch = null; downAt = null;
    } else if (pointers.size === 1) {
      // one finger lifted after a pinch: keep panning with the other
      const q = [...pointers.values()][0];
      grab = mountAt(q[0], q[1]); pinch = null; moved = 99;
    }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);

  canvas.addEventListener('dblclick', (e) => {
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
    cancelAnim();
    zoomAt(Math.exp(dy * k), p[0], p[1], getFrame(), state.tracking);
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
    cancelAnim(); if (state.tracking) { state.tracking = false; emit('selection'); }
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
