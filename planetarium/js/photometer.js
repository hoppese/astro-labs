// photometer.js: a simulated photometer for the standard-candle labs. It reports the COUNTS a detector would collect from the selected
// star in one exposure, never a magnitude: the student turns counts into a magnitude against a comparison star of known magnitude,
//   m = m_comparison − 2.5 log10( counts / counts_comparison ),
// as differential photometry is done. Counts = 10^(−0.4 (m − 25)) for a star of V magnitude m (an instrument for which a 25th-magnitude
// star gives one count per exposure), with photon noise (√N) and a 0.5% exposure-to-exposure wobble (scintillation, flat field).
// The noise is SIMULATED, a fixed function of (the notebook seed, the clock second, the star): the same exposure read twice gives the
// same counts, the next second a new exposure.

import { state } from './state.js';
import { starRecord } from './catalog.js';
import { refKey } from './objects.js';
import { see, noisePair } from './notebook/seeing.js';
import { VAR_BY_HIP, varMag, jdOf, TRANSIENT, transientMag } from './variables.js';

export const ZP = 25;
/** The V magnitude the photometer sees for a reference now (variables and transients from their models), or null. */
export function trueMag(ref, bodies, timeMs = state.timeMs) {
  if (!ref) return null;
  if (ref.kind === 'star') { const s = starRecord(ref.k, ref.i), v = VAR_BY_HIP.get(s.hip); return v ? varMag(v, jdOf(timeMs)) : s.mag; }
  if (ref.kind === 'gaia') return ref.t.mag[ref.i];      // the tile's value: it does not change when the full record arrives (the panel and Record then agree)
  if (ref.kind === 'tr') return TRANSIENT[ref.id] ? transientMag(TRANSIENT[ref.id], jdOf(timeMs)) : null;
  if (ref.kind === 'body') { const b = bodies && bodies.byId[ref.id]; return b && b.mag < 90 ? b.mag : null; }
  return null;
}
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h | 0; };
const g = [0, 0];
/** Counts in one exposure (whole number), or null when there is nothing to measure. */
export function counts(ref, bodies, timeMs = state.timeMs) {
  const m = trueMag(ref, bodies, timeMs);
  if (m == null) return null;
  const N = Math.pow(10, -0.4 * (m - ZP)), t = Math.floor(timeMs / 1000);
  noisePair(see.seed || 1, t | 0, Math.floor(t / 4294967296) | 0, hash(refKey(ref)), 0x5ca1ab1e, g);
  return Math.max(0, Math.round(N + g[0] * Math.sqrt(N + (0.005 * N) ** 2)));
}
