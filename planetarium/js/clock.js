// clock.js: the simulation clock. state.timeMs advances by `rate` simulated seconds per real second.

import { state, emit } from './state.js';

export const SIDEREAL_DAY_MS = 86164090.5;
export const RATES = [-1e8, -3e7, -1e7, -3e6, -1e6, -1e5, -1e4, -1000, -100, -10, -1, 1, 10, 100, 1000, 1e4, 1e5, 1e6, 3e6, 1e7, 3e7, 1e8];
// keep the clock inside the span where the ephemeris and Date arithmetic are trustworthy
const T_MIN = Date.UTC(-3000, 0, 1), T_MAX = Date.UTC(3001, 0, 1);

let lastReal = null;
/** The fastest useful rate while something with a short cycle is followed: at least 12 pictures a turn (60 a second). Without this a moon's phase,
 *  or a satellite's place, would flicker between unrelated pictures. */
const CYCLE = { Moon: 27.3, Mercury: 88 };
export function rateCap() {
  if (!state.tracking || !state.trackRef || state.trackRef.kind !== 'body') return 1e8;
  const id = state.trackRef.id, P = CYCLE[id];
  if (P) return Math.max(1e6, P * 86400 * 5);
  return clockInfo.isMoon && clockInfo.isMoon(id) ? 1e6 : 1e8;
}
export const clockInfo = { isMoon: null };      // ephem.js fills it in
/** A rate in plain words: "about 12 days per second". */
export function rateWords(r = state.rate) {
  const a = Math.min(Math.abs(r), rateCap()), u = [[31557600, 'year'], [86400, 'day'], [3600, 'hour'], [60, 'minute'], [1, 'second']].find(([s]) => a >= 0.95 * s);
  if (a <= 1) return 'real time';
  const n = a / u[0], t = n >= 9.5 ? Math.round(n) : Number(n.toPrecision(2));
  return `about ${t} ${u[1]}${t === 1 ? '' : 's'} per second` + (r < 0 ? ', backwards' : '');
}
/** Advance the clock; returns true when simulated time changed. */
export function advance(nowReal) {
  const dt = lastReal === null ? 0 : Math.min(250, nowReal - lastReal);    // a hidden tab does not jump ahead
  lastReal = nowReal;
  if (!state.playing || dt === 0) return false;
  const t = state.timeMs + dt * Math.sign(state.rate) * Math.min(Math.abs(state.rate), rateCap());
  setTime(t, true);
  if (t < T_MIN || t > T_MAX) { state.playing = false; emit('rate'); emit('clock-end'); }      // the ends of the span: stop there
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
