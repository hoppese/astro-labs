// steady.js: "steady sky". When time runs fast while an object is being followed, day and night, the Moon's glow, the ground and
// refraction pass over the view many times a second, and an alt-az view spins with them: a strobe. Every one of those changes is
// real, but nothing can be seen through it. So above a threshold rate the view is drawn as from above the atmosphere: night sky,
// no ground, no refraction, celestial north held up. Switchable (Settings, "Steady sky when time runs fast"), never in a lab.
// The user's own switches (state.show, state.mount) are not touched: every module asks `eff` (state.js) what is in force now.

import { state, eff, emit, on, toggle } from './state.js';
import { cam, update, lookAtHor, centerHor } from './camera.js';
import { running } from './labs/hidden.js';
import { see } from './notebook/seeing.js';

export const FOLLOW_RATE = 5000;      // following something: a day passes in 17 s or less
export const FREE_RATE = 50000;       // not following: only the light of the sky is held, a day passes in 1.7 s or less

/** Which kind of steadiness the present state asks for: '' | 'sky' (light only) | 'full' (also ground, refraction, orientation). */
function wanted() {
  if (!state.show.steady || running.id || see.on) return '';
  const r = Math.abs(state.rate);
  if (state.tracking && state.selected) {
    if (state.playing && r >= FOLLOW_RATE) return 'full';
    // paused after running fast: keep the view as it was, so that what was being watched does not vanish into daylight or the ground
    if (!state.playing && eff.steady === 'full') return 'full';
  }
  if (state.playing && r >= FREE_RATE) return 'sky';
  return '';
}

let snap = null, fadeAt = -1e9;
const FADE_MS = 450;

/** Once per animation frame, before the view is computed. Returns true when the picture must be redrawn. */
export function stepSteady(now, frame, canvas) {
  const w = wanted();
  if (w !== eff.steady) {
    // cross-fade from the last picture
    try {
      if (!snap) snap = document.createElement('canvas');
      snap.width = canvas.width; snap.height = canvas.height;
      snap.getContext('2d').drawImage(canvas, 0, 0);
      fadeAt = now;
    } catch (e) { fadeAt = -1e9; }
    update(frame);
    const h = centerHor(), before = eff.mount;
    eff.steady = w;
    if (eff.mount !== before) { update(frame); lookAtHor(h); update(frame); }
    emit('steady');
  }
  return now - fadeAt < FADE_MS + 40;
}
/** The outgoing picture, fading, on top of the new one. */
export function drawSteadyFade(ctx, now) {
  const t = (now - fadeAt) / FADE_MS;
  if (t >= 1 || !snap) return;
  ctx.save(); ctx.globalAlpha = 1 - t * t * (3 - 2 * t); ctx.drawImage(snap, 0, 0, cam.w, cam.h); ctx.restore();
}

// ---- the notice --------------------------------------------------------------------------------
export function initSteady() {
  const el = document.createElement('div');
  el.className = 'steady-note'; el.hidden = true; el.setAttribute('role', 'status');
  el.innerHTML = '<span></span><button class="btn" type="button">Show them</button>';
  document.body.appendChild(el);
  el.querySelector('button').addEventListener('click', () => toggle('steady', false));
  const sync = () => {
    el.hidden = !eff.steady;
    el.querySelector('span').textContent = eff.steady === 'full' ? 'Steady sky: day and night, the ground and refraction are not drawn at this speed' : 'Steady sky: day and night are not drawn at this speed';
  };
  on('steady', sync); sync();
}
