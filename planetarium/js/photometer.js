// photometer.js: a simulated photometer for the standard-candle labs. It reports the COUNTS a detector would collect from the selected
// star in one exposure, never a magnitude: the student turns counts into a magnitude against a comparison star of known magnitude,
//   m = m_comparison − 2.5 log10( counts / counts_comparison ),
// as differential photometry is done. Counts = 10^(−0.4 (m − 25)) for a star of V magnitude m (an instrument for which a 25th-magnitude
// star gives one count per exposure), with photon noise (√N) and a 0.5% exposure-to-exposure wobble (scintillation, flat field).
// The noise is SIMULATED, a fixed function of (the notebook seed, the clock second, the star): the same exposure read twice gives the
// same counts, the next second a new exposure.
//
// FILTERS (phot.filter): 'clear' is the photometer as above (V counts). 'B', 'G' and 'R' put a blue, green or red filter in front of it.
// The counts through a filter are a MODEL, not a measured spectrum: the star is taken to shine as a blackbody at the temperature the
// spectrograph gives it (js/spectro.js starTemp: from its catalogued MK type, Hipparcos, data/sptype.txt, loaded on the first filter
// click; from its B−V by Ballesteros 2012 when it has no type), the photons it sends are counted through a Gaussian band (B 440 nm,
// G 550 nm, R 640 nm), and the result is scaled so that
//   G counts = the clear (V) counts, and an A0 V star (9,700 K, like Vega) gives equal counts in all three filters (as magnitudes are defined).
// Gaia stars use their BP−RP turned into B−V; the Sun, the Moon and the planets shine by sunlight (5,772 K).
// Each filter is its own exposure: its own noise draw, with the same photon noise and 0.5% wobble.

import { state } from './state.js';
import { starRecord } from './catalog.js';
import { refKey } from './objects.js';
import { see, noisePair } from './notebook/seeing.js';
import { VAR_BY_HIP, varMag, jdOf, TRANSIENT, transientMag } from './variables.js';
import { starTemp, typeOfHip, typesLoaded, loadTypes } from './spectro.js';

export const ZP = 25;
/** The V magnitude the photometer sees for a reference now (variables and transients from their models), or null. */
export function trueMag(ref, bodies, timeMs = state.timeMs) {
  if (!ref) return null;
  if (phot.override) { const o = phot.override(ref); if (o) return o.mag; }
  if (ref.kind === 'star') { const s = starRecord(ref.k, ref.i), v = VAR_BY_HIP.get(s.hip); return v ? varMag(v, jdOf(timeMs)) : s.mag; }
  if (ref.kind === 'gaia') return ref.t.mag[ref.i];      // the tile's value: it does not change when the full record arrives (the panel and Record then agree)
  if (ref.kind === 'tr') return TRANSIENT[ref.id] ? transientMag(TRANSIENT[ref.id], jdOf(timeMs)) : null;
  if (ref.kind === 'body') { const b = bodies && bodies.byId[ref.id]; return b && b.mag < 90 ? b.mag : null; }
  return null;
}
// ---- filters ----
// Gaia BP−RP to B−V (the same polynomial as deepstars.js bprpToBv, Gaia DR3 documentation table 5.9; copied so that this module stays free of the renderer)
const bprpToBv = (x) => { x = x < -0.5 ? -0.5 : x > 4 ? 4 : x; return -0.04152 + x * (0.70164 + x * (0.1448 + x * (-0.05292 + x * 0.006061))); };
export const FILTERS = { B: { c: 440, w: 40 }, G: { c: 550, w: 36 }, R: { c: 640, w: 64 } };      // centre and Gaussian sigma, nm
export const phot = { filter: 'clear', override: null };      // override(ref) -> {mag, T} | null: a lab's own photometry for some stars (js/labs/clusters.js)
export const T_SUN = 5772, T_A0V = 9700;
/** Photons per second per unit area through filter f from a blackbody at T, up to a constant. */
function band(f, T) {
  const F = FILTERS[f]; let sum = 0;
  for (let l = 300; l <= 1000; l += 2) {
    const x = l * 1e-9, e = 0.0143877735 / (x * T);
    if (e > 700) continue;
    sum += Math.exp(-0.5 * ((l - F.c) / F.w) ** 2) / (x ** 4 * Math.expm1(e));      // B_λ × λ (photons, not energy)
  }
  return sum;
}
const K = { B: band('G', T_A0V) / band('B', T_A0V), G: 1, R: band('G', T_A0V) / band('R', T_A0V) };
/** Expected counts through filter f, as a multiple of the V (clear) counts, for a blackbody at T. */
export function filterFactor(f, T) { if (f === 'clear' || f === 'G') return 1; return K[f] * band(f, T) / band('G', T); }
/** The model's B/R count ratio at temperature T (the calibration a lab gives its students). */
export function ratioBR(T) { return K.B * band('B', T) / (K.R * band('R', T)); }
/** The temperature (K) the filters use for a reference (js/spectro.js starTemp), null when there is none, or undefined while the
 *  catalogue of types is still loading (call loadTypes()). */
export function tempOf(ref) {
  if (!ref) return null;
  if (phot.override) { const o = phot.override(ref); if (o) return o.T; }
  if (ref.kind === 'star') { if (!typesLoaded()) return undefined; const s = starRecord(ref.k, ref.i), t = starTemp(typeOfHip(s.hip), s.bv); return t ? t.T : null; }
  if (ref.kind === 'gaia') { const c = ref.t.col[ref.i], t = c === c ? starTemp(null, bprpToBv(c)) : null; return t ? t.T : null; }
  if (ref.kind === 'body') return T_SUN;
  return null;
}
/** Waiting for the catalogue of types: the filters cannot measure this one yet. */
export const filterWaiting = (ref) => !!ref && ref.kind === 'star' && !typesLoaded() && !(phot.override && phot.override(ref));
export { loadTypes };
// the last exposure through each filter (Record offers them together: select a star, take B, then R, then Record)
export const lastExp = { B: null, G: null, R: null };

const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
const g = [0, 0];
/** Counts in one exposure (whole number), or null when there is nothing to measure. */
export function counts(ref, bodies, timeMs = state.timeMs, filter = phot.filter) {
  const t = Math.floor(timeMs / 1000), m = trueMag(ref, bodies, t * 1000);      // one exposure, one instant: the start of its clock second
  if (m == null) return null;
  let N = Math.pow(10, -0.4 * (m - ZP));
  if (filter !== 'clear') { const T = tempOf(ref); if (T == null) return null; N *= filterFactor(filter, T); }
  const salt = filter === 'clear' ? 0x5ca1ab1e : 0x5ca1ab1e ^ filter.charCodeAt(0) * 2654435761;      // each filter its own exposure
  noisePair(see.seed || 1, t | 0, Math.floor(t / 4294967296) | 0, hash(refKey(ref)), salt | 0, g);
  const n = Math.max(0, Math.round(N + g[0] * Math.sqrt(N + (0.005 * N) ** 2)));
  if (filter !== 'clear') lastExp[filter] = { key: refKey(ref), n, t };
  return n;
}
