// clock.js: the simulation clock. state.timeMs advances by `rate` simulated seconds per real second.

import { state, emit } from './state.js';

export const SIDEREAL_DAY_MS = 86164090.5;
export const RATES = [-1e6, -1e5, -1e4, -1000, -100, -10, -1, 1, 10, 100, 1000, 1e4, 1e5, 1e6];
// keep the clock inside the span where the ephemeris and Date arithmetic are trustworthy
const T_MIN = Date.UTC(-3000, 0, 1), T_MAX = Date.UTC(3001, 0, 1);

let lastReal = null;
/** Advance the clock; returns true when simulated time changed. */
export function advance(nowReal) {
  const dt = lastReal === null ? 0 : Math.min(250, nowReal - lastReal);    // a hidden tab does not jump ahead
  lastReal = nowReal;
  if (!state.playing || dt === 0) return false;
  setTime(state.timeMs + dt * state.rate, true);
  return true;
}
export function setTime(ms, quiet = false) {
  state.timeMs = Math.min(T_MAX, Math.max(T_MIN, ms));
  emit(quiet ? 'tick' : 'time');
}
export const stepTime = (deltaMs) => setTime(state.timeMs + deltaMs);
export function setNow() { state.rate = 1; state.playing = true; setTime(Date.now()); emit('rate'); }
export function togglePlay() { state.playing = !state.playing; emit('rate'); }
export function setRate(r) { state.rate = r; state.playing = true; emit('rate'); }
/** Stellarium's L / J: step through the rate ladder (…, -10, -1, 1, 10, …). */
export function faster() { const i = nearestRate(); setRate(RATES[Math.min(RATES.length - 1, i + 1)]); }
export function slower() { const i = nearestRate(); setRate(RATES[Math.max(0, i - 1)]); }
function nearestRate() {
  let best = 0;
  RATES.forEach((r, i) => { if (Math.abs(r - state.rate) < Math.abs(RATES[best] - state.rate)) best = i; });
  return best;
}
export function rateLabel() {
  if (!state.playing) return 'paused';
  const r = state.rate, a = Math.abs(r);
  const s = a >= 1e6 ? (a / 1e6) + 'M' : a >= 1e4 ? (a / 1000) + 'k' : String(a);
  return (r < 0 ? '−' : '') + '×' + s;
}
