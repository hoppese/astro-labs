// orbitcam.js: the solar-system view (vantage 'Above') as a 3D space to move about in. The observer sits state.aboveAU from a target
// point (the Sun, or wherever it has been panned to: state.abovePan, Sun-centered EQJ au), in the direction given by an ecliptic
// longitude and latitude (state.aboveLon, state.aboveLat), and always looks at the target.
//   drag            turn round the target (orbit)
//   shift-drag      move the target across the view (pan); also right- or ctrl-drag, or two fingers moving together
//   wheel / pinch   move nearer or farther (the field of view stays the same: perspective, not magnification)
// "Up" on screen is the ecliptic's north (the alt-az mount with the ecliptic as horizon, js/skyframe.js), as in a model of the solar system.

import { DEG, mulMV, unit, sub, add, scale, clamp, mod } from './astro.js';
import { state, emit } from './state.js';
import { cam, lookAtHor } from './camera.js';
import { getFrame } from './skyframe.js';
import { vantageHelio, BODIES, EARTH_DEF, MOON_DEFS } from './ephem.js';

export const orbitMode = () => state.vantage === 'Above';
export const ABOVE_HOME = { lat: 89.5, lon: 270 };      // all but straight down, the vernal equinox direction toward the top of the screen

/** Turn the camera to the target. Call after anything that moves the observer. */
const target = (time) => (state.aboveTarget && vantageHelio(state.aboveTarget, time)) || state.abovePan;
export function aimAbove() {
  const f = getFrame(), P = vantageHelio('Above', f.time);
  lookAtHor(mulMV(f.Mjh, unit(sub(target(f.time), P))));
  emit('render');
}
/** Orbit by a drag of dx, dy pixels: a full turn per two screen widths or so. */
export function orbitBy(dx, dy) {
  const k = 200 / Math.max(300, Math.min(cam.w, cam.h));      // degrees per pixel
  state.aboveLon = mod(state.aboveLon - dx * k, 360);
  state.aboveLat = clamp(state.aboveLat + dy * k, -89.5, 89.5);
  emit('loc'); aimAbove();
}
/** Pan by a drag of dx, dy pixels: the point under the pointer (at the target's distance) moves with it. */
export function panBy(dx, dy) {
  const f = getFrame(), V = cam.V, k = state.aboveAU * DEG / cam.pxPerDeg;
  const right = mulMV(f.Mhj, [V[0], V[1], V[2]]), up = mulMV(f.Mhj, [V[3], V[4], V[5]]);
  state.abovePan = add(target(f.time), add(scale(right, -dx * k), scale(up, dy * k))); state.aboveTarget = null;
  emit('loc'); aimAbove();
}
const RADIUS = Object.fromEntries([...BODIES, EARTH_DEF, ...MOON_DEFS].filter((b) => b.radiusKm).map((b) => [b.id, b.radiusKm / 149597870.7]));
/** Nearer (f < 1) or farther: no nearer than three radii of the body circled (or 0.01 au of empty space, or of the Sun). */
export function zoomDistance(f) {
  const near = Math.max(state.aboveTarget ? 3 * (RADIUS[state.aboveTarget] || 0) : 0.01, 0.00015);
  state.aboveAU = clamp(state.aboveAU * f, near, 2000);
  emit('loc'); aimAbove();
}
/** Back to the view from straight above the Sun, at `au` (default: the present distance). */
export function homeAbove(au) {
  state.aboveLat = ABOVE_HOME.lat; state.aboveLon = ABOVE_HOME.lon; state.abovePan = [0, 0, 0]; state.aboveTarget = null;
  if (au) state.aboveAU = au;
  emit('loc'); aimAbove();
}
/** Circle a body from now on (it stays in the middle as time runs), keeping distance and direction. */
export function targetBody(id) {
  if (id === 'Sun') { state.aboveTarget = null; state.abovePan = [0, 0, 0]; }
  else if (vantageHelio(id, getFrame().time)) state.aboveTarget = id;
  else return false;
  zoomDistance(1); return true;
}
