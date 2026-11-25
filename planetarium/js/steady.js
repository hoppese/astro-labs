// steady.js: "steady sky". When time runs fast while an object is being followed, day and night, the Moon's glow, the ground and
// refraction pass over the view many times a second, and an alt-az view spins with them: a strobe. Every one of those changes is
// real, but nothing can be seen through it. So above a threshold rate the view is drawn as from above the atmosphere: night sky,
// no ground, no refraction, celestial north held up. Switchable (Settings, "Steady sky when time runs fast"), never in a lab.
// The user's own switches (state.show, state.mount) are not touched: every module asks `eff` (state.js) what is in force now.

import { state, eff, emit, on, toggle } from './state.js';
import { cam, update, lookAtHor, centerHor, setAxes } from './camera.js';
import { refractHor, unrefractHor } from './astro.js';
import { rateWords, rateCap } from './clock.js';
import { running } from './labs/hidden.js';
import { see } from './notebook/seeing.js';

export const FOLLOW_RATE = 5000;      // following something: a day passes in 17 s or less
export const CLOSE_RATE = 300;         // following something in a field under 5 deg: at x1000 the horizon, dawn and dusk each crossed the whole window in one frame
export const FREE_RATE = 50000;       // not following: only the light of the sky is held, a day passes in 1.7 s or less

/** Which kind of steadiness the present state asks for: '' | 'sky' (light only) | 'full' (also ground, refraction, orientation). */
function wanted() {
  if (!state.show.steady || running.id || see.on) return '';
  const r = Math.abs(state.rate);
  if (state.tracking && state.trackRef) {
    const close = cam.fov < (eff.steady === 'full' ? 8 : 5);
    if (state.playing && r >= (close ? CLOSE_RATE : FOLLOW_RATE)) return 'full';
    // paused after running fast: keep the view as it was, so that what was being watched does not vanish into daylight or the ground
    if (!state.playing && eff.steady === 'full') return 'full';
  }
  // not following: in the equatorial mount the horizon itself would go round the view many times a second, so it is left out too
  if (state.playing && r >= FREE_RATE) return state.mount === 'eq' ? 'full' : 'sky';
  return '';
}

/** 1 = draw a moon as usual, 0 = it goes round so fast that single pictures of it mean nothing (more than 0.35 of a turn a frame). */
export function moonFade(periodDays, frameMs = 16.7) {
  if (!state.playing || !periodDays) return 1;
  const turn = Math.min(Math.abs(state.rate), rateCap()) * frameMs / 86400000 / periodDays;
  return Math.max(0, Math.min(1, (0.35 - turn) / 0.2));
}
const moonsFading = () => state.playing && state.tracking && state.trackRef && state.trackRef.kind === 'body' && moonFade({ Jupiter: 16.7, Saturn: 79, Uranus: 13.5, Neptune: 5.9, Mars: 1.26, Pluto: 6.4, Earth: 27 }[state.trackRef.id]) < 1;
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
    // what is in the middle stays there, and the picture stays the same way up: refraction coming or going would move it (half a degree near the
    // horizon: 115 px of a 9 arcminute field), and the other mount's up is reached by easing the roll (nav.js), not by a jump
    const h = centerHor(), V = cam.V.slice(), refr = eff.refraction, before = eff.mount;
    eff.steady = w;
    if (eff.mount !== before) { update(frame); setAxes(V, frame); }
    if (eff.refraction !== refr) { lookAtHor(eff.refraction ? refractHor(h) : unrefractHor(h)); update(frame); }
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
    const w = rateWords(), capped = Math.abs(state.rate) > rateCap();
    el.querySelector('span').textContent = w[0].toUpperCase() + w.slice(1) + (capped ? ' (held there: any faster and what you follow would only flicker)' : '') + (eff.steady === 'full' ? '. Steady sky: no day and night, ground or refraction' : '. Steady sky: no day and night') + (moonsFading() ? '. Moons too fast to follow are faded' : '');
  };
  on('steady', sync); on('rate', sync); on('selection', sync); sync();
}
