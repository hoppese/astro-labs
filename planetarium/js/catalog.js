// catalog.js: loads the processed data files in data/ and keeps them in typed arrays.
// See tools/build_*.py for how each file is made and NOTES.md for sources and licences.

import { VAR_BY_HIP } from './variables.js';
import { A, DEG, fromRot, transpose, mulMV, sph, toSph, mod } from './astro.js';
import { emit, state } from './state.js';

const BASE = new URL('../data/', import.meta.url);
let NF = 13;                                      // floats per star = stars.json "fields".length (9 in files built before 2026-11-24)
// ra, dec: ICRS at epoch 2000.0, degrees, as the nearest Float32; dra, ddec: what that rounding lost (degrees), so that
// ra + dra is good to a microarcsecond. pmra (times cos dec), pmdec: mas/yr at epoch 2000.0. rv: km/s (0 = unknown).
// src: where position and proper motion come from (ASTROMETRY below). See tools/build_stars.py.
export const F = { ra: 0, dec: 1, mag: 2, bv: 3, hip: 4, hd: 5, dist: 6, pmra: 7, pmdec: 8, dra: 9, ddec: 10, rv: 11, src: 12 };
export const ASTROMETRY = ['HYG catalog (no cross-identification: place may be several arcseconds out)', 'Hipparcos, the new reduction (van Leeuwen 2007)',
  'Gaia DR3', 'Gaia DR3 (identified by position and brightness)'];

/** Star tiers, brightest first. tier = {file, n, magMin, magMax, data, vec, loaded, loading}. */
export const stars = { tiers: [], names: { name: {}, bayer: {}, flam: {} }, epochYears: null, NF, astrometry: null };
export const constellations = [];                 // [{id, name, gen, rank, label, lines, bounds, lineVecs, boundVecs, labelVec}]
export const dso = { rows: [], deepLoaded: false, deepLoading: false };
export let cities = [];

const getJSON = (f) => fetch(new URL(f, BASE)).then((r) => { if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return r.json(); });

export async function loadCore() {
  const [manifest, names, cons, dsoMain, cityRows] = await Promise.all([
    getJSON('stars.json'), getJSON('starnames.json'), getJSON('constellations.json'), getJSON('dso.json'), getJSON('cities.json'),
  ]);
  let lo = -99;
  NF = stars.NF = manifest.fields.length;
  stars.astrometry = manifest.astrometry || null;
  stars.tiers = manifest.tiers.map((t, k) => { const o = { ...t, k, magMin: lo, data: null, vec: null, loaded: false, loading: null }; lo = t.magMax; return o; });
  stars.names = names;
  await loadTier(0);
  for (const c of cons) {
    c.lineVecs = c.lines.map(toVecs);
    c.boundVecs = c.bounds.map(boundaryVecs);
    c.labelVec = toVecs(c.label);
    constellations.push(c);
  }
  addDsoRows(dsoMain);
  cities = cityRows.map(([name, region, lat, lon, tz]) => ({ name, region, lat, lon, tz }));
}

// IAU constellation boundaries run along lines of constant RA / Dec of epoch B1875. The file holds
// only the corners (in J2000), so: rotate the corners to B1875, fill each edge in (RA, Dec) there,
// and rotate back. Result: a dense closed loop of J2000 unit vectors.
let M1875 = null;
function boundaryVecs(flat) {
  if (!M1875) M1875 = fromRot(A.Rotation_EQJ_EQD(A.MakeTime(new Date(Date.UTC(1875, 0, 1)))));
  const Mb = transpose(M1875);
  const n = flat.length / 2, corners = [];
  for (let i = 0; i < n; i++) corners.push(toSph(mulMV(M1875, sph(flat[2 * i], flat[2 * i + 1]))));
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    const dl = mod(b.lon - a.lon + 180, 360) - 180, db = b.lat - a.lat;
    const k = Math.max(1, Math.ceil(Math.max(Math.abs(dl), Math.abs(db)) / 1.5));
    for (let j = 0; j < k; j++) out.push(...mulMV(Mb, sph(a.lon + dl * j / k, a.lat + db * j / k)));
  }
  out.push(out[0], out[1], out[2]);
  return Float64Array.from(out);
}

function toVecs(flat) {
  const out = new Float64Array(flat.length / 2 * 3);
  for (let i = 0, j = 0; i < flat.length; i += 2, j += 3) {
    const a = flat[i] * DEG, d = flat[i + 1] * DEG, c = Math.cos(d);
    out[j] = c * Math.cos(a); out[j + 1] = c * Math.sin(a); out[j + 2] = Math.sin(d);
  }
  return out;
}

/** Load a star tier (idempotent). Returns a promise that resolves when it is usable. */
export function loadTier(k) {
  const t = stars.tiers[k];
  if (!t) return Promise.resolve();
  if (t.loaded) return Promise.resolve(t);
  if (!t.loading) {
    t.loading = fetch(new URL(t.file, BASE)).then((r) => { if (!r.ok) throw new Error(t.file + ': HTTP ' + r.status); return r.arrayBuffer(); })
      .then((buf) => {
        t.data = new Float32Array(buf);
        t.n = t.data.length / NF;
        t.vec = new Float64Array(t.n * 3);
        computeVecs(t, stars.epochYears || 0);
        t.loaded = true; t.failed = false;
        emit('catalog', 'stars');
        return t;
      }).catch((e) => {
        // do not ask again on the very next frame: wait, then let wantMagnitude() retry
        console.warn('star tier failed', e); t.failed = true; emit('catalog', 'stars-error');
        setTimeout(() => { t.loading = null; }, 15000);
      });
  }
  return t.loading;
}
export const loadAllTiers = () => Promise.all(stars.tiers.map((t) => loadTier(t.k)));

/** Ask for every tier needed to reach `limMag` (non-blocking). */
export function wantMagnitude(limMag) {
  for (const t of stars.tiers) if (!t.loaded && !t.loading && t.magMin < limMag) loadTier(t.k);
}

// Where a star is `years` after epoch 2000.0, as a J2000 unit vector written to out[j..j+2]. Uniform motion in a
// straight line through space (ESA 1997, The Hipparcos and Tycho Catalogues, vol. 1, section 1.5.5): with r the
// direction at 2000.0, p and q the unit vectors toward increasing RA and Dec there,
//   b = r (1 + zeta t) + (pmra p + pmdec q) t,   direction = b / |b|,   zeta = rv * parallax / 4.740470446
// (proper motions and zeta in radians per year, rv in km/s, parallax in the proper motion's unit; 4.74... km/s is
// 1 au/yr). The zeta term is the foreshortening of the path of a star that is approaching or receding
// ("perspective acceleration": 0.46 arcsec for Barnard's star between 2000 and 2027); the parallax is 1 / the
// catalogue distance. No light-time term (as in Hipparcos and Gaia, whose proper motions are apparent ones).
const MAS = Math.PI / 648000000;                  // radians per milliarcsecond
const KMS_PER_AU_YR = 4.740470446;
function starPlace(d, o, years, out, j) {
  const ext = NF >= 12;
  const ra = (ext ? d[o] + d[o + 9] : d[o]) * DEG, dec = (ext ? d[o + 1] + d[o + 10] : d[o + 1]) * DEG;
  const ca = Math.cos(ra), sa = Math.sin(ra), cd = Math.cos(dec), sd = Math.sin(dec);
  if (!years) { out[j] = cd * ca; out[j + 1] = cd * sa; out[j + 2] = sd; return; }
  const k = years * MAS, ma = d[o + 7] * k, md = d[o + 8] * k;
  const g = 1 + (ext && d[o + 6] > 0 && d[o + 11] ? d[o + 11] * (1000 / d[o + 6]) / KMS_PER_AU_YR * k : 0);
  const x = cd * ca * g - sa * ma - sd * ca * md, y = cd * sa * g + ca * ma - sd * sa * md, z = sd * g + cd * md;
  const f = 1 / Math.sqrt(x * x + y * y + z * z);
  out[j] = x * f; out[j + 1] = y * f; out[j + 2] = z * f;
}
function computeVecs(t, years) {
  const d = t.data, v = t.vec;
  for (let i = 0; i < t.n; i++) starPlace(d, i * NF, years, v, 3 * i);
}
/** How stale (years) the drawing arrays' proper motion may be at a vertical field of `fov` degrees: under a hundredth of a
 *  pixel for the fastest star. The renderer sets stars.epochTol from this BEFORE each frame (it used to be set after the frame,
 *  so the first frame after a jump in zoom, and every frame of a paused view, kept the wide-field tolerance of a year). */
export const epochTolFor = (fov) => (fov < 0.2 ? 2e-5 : fov < 3 ? 0.002 : fov < 30 ? 0.05 : 1);
/** Apply proper motion for the given epoch (years since J2000). Cheap; redone when the date moves by > stars.epochTol years. */
export function setStarEpoch(years) {
  if (!state.fx.properMotion) years = 0;                  // labs: freeze the stars at their J2000 places
  // stars.epochTol (years) is tightened by js/labs/corrections.js when zoomed far in, so a fast star moves smoothly
  if (stars.epochYears !== null && Math.abs(years - stars.epochYears) < (stars.epochTol || 1)) return;
  stars.epochYears = years;
  for (const t of stars.tiers) if (t.loaded) computeVecs(t, years);
}

/** Plain-object view of one star. */
/** Proper names of faint stars, which the name list (bright stars only) does not reach: by Hipparcos number. */
export const FAINT_NAMES = { 87937: 'Barnard’s Star', 70890: 'Proxima Centauri', 24186: 'Kapteyn’s Star', 54035: 'Lalande 21185', 57548: 'Ross 128', 3829: 'Van Maanen’s Star', 36208: 'Luyten’s Star', 92403: 'Ross 154', 114046: 'Lacaille 9352', 1475: 'Groombridge 34', 110893: 'Kruger 60' };
export function starRecord(k, i) {
  const t = stars.tiers[k], d = t.data, o = i * NF;
  const ext = NF >= 13;
  const s = { k, i, ra: ext ? d[o] + d[o + 9] : d[o], dec: ext ? d[o + 1] + d[o + 10] : d[o + 1], mag: d[o + 2], bv: d[o + 3] > 50 ? null : d[o + 3], hip: d[o + 4] || null,
    hd: d[o + 5] || null, dist: d[o + 6] || null, pmra: d[o + 7], pmdec: d[o + 8], rv: ext ? d[o + 11] : 0, src: ext ? d[o + 12] : null,
    vec: [t.vec[3 * i], t.vec[3 * i + 1], t.vec[3 * i + 2]] };
  if (k === 0) { s.name = stars.names.name[i] || null; s.bayer = stars.names.bayer[i] || null; s.flam = stars.names.flam[i] || null; }
  if (!s.name && FAINT_NAMES[s.hip]) s.name = FAINT_NAMES[s.hip];
  if (!s.name && !s.bayer && VAR_BY_HIP.has(s.hip)) s.name = VAR_BY_HIP.get(s.hip).name;      // ℓ Carinae, X Sagittarii, RR Lyrae
  return s;
}
/** Best short label for a star. */
export function starLabel(s) {
  return s.name || s.bayer || s.flam || (s.hip ? 'HIP ' + s.hip : s.hd ? 'HD ' + s.hd : 'Star');
}

// ---- deep sky -----------------------------------------------------------------
function addDsoRows(file) {
  const f = file.fields;
  for (const r of file.rows) {
    const o = {};
    f.forEach((name, j) => { o[name] = r[j]; });
    o.mag = o.vmag != null ? o.vmag : o.bmag;            // may stay null: "no data"
    const a = o.ra * DEG, d = o.dec * DEG, c = Math.cos(d);
    o.vec = [c * Math.cos(a), c * Math.sin(a), Math.sin(d)];
    o.label = o.m ? 'M ' + o.m : (o.names && o.names[0] && !/^(NGC|IC)/.test(o.id) ? o.names[0] : o.id);
    o.idx = dso.rows.length;
    dso.rows.push(o);
  }
}
/** Why a galaxy's catalog magnitude should not be trusted, in words, or ''. The value itself is never changed: IC 127 is listed in OpenNGC's own file
 *  with V 9.20 beside B 14.83, J 10.94 (V comes from its source 2). Tests: B − V outside what galaxies have, or too bright for the size listed. */
export function dsoDoubt(o) {
  if (!/^G/.test(o.type) || o.mag == null) return '';
  if (o.vmag != null && o.bmag != null) { const d = o.bmag - o.vmag; if (d > 2.5 || d < -1.3) return `OpenNGC gives V ${o.vmag.toFixed(2)} but B ${o.bmag.toFixed(2)}; galaxies have B − V of about 0.3 to 1.2, so at least one of the two is wrong.`; }
  if (o.maj > 0) { const sb = o.mag + 2.5 * Math.log10(Math.PI / 4 * o.maj * (o.min || o.maj) * 3600); if (sb < 18) return `magnitude ${o.mag.toFixed(1)} spread over the size listed would be ${sb.toFixed(1)} mag/arcsec² on average, brighter than galaxies are.`; }
  return '';
}
export function loadDeepDso() {
  if (dso.deepLoaded) return Promise.resolve();
  if (!dso.deepLoading) {
    dso.deepLoading = getJSON('dso-deep.json').then((file) => { addDsoRows(file); dso.deepLoaded = true; emit('catalog', 'dso'); })
      .catch((e) => { dso.deepLoading = null; console.warn('deep DSO failed', e); });
  }
  return dso.deepLoading;
}
export const DSO_TYPES = {
  G: 'Galaxy', GPair: 'Galaxy pair', GTrpl: 'Galaxy triplet', GGroup: 'Galaxy group', OCl: 'Open cluster', GCl: 'Globular cluster',
  PN: 'Planetary nebula', Neb: 'Nebula', HII: 'H II region', 'Cl+N': 'Cluster with nebulosity', '*Ass': 'Stellar association',
  RfN: 'Reflection nebula', SNR: 'Supernova remnant', EmN: 'Emission nebula', DrkN: 'Dark nebula', '**': 'Double star',
  '*': 'Star', Other: 'Other', Nova: 'Nova',
};

// ---- exact apparent place of one star (labs: aberration, parallax, proper motion) ----------------
const RAD_PER_ARCSEC = Math.PI / 648000;
const PLACE = [0, 0, 0];
/** J2000 unit vector of star (k, i) as seen at `frame`: space motion to the exact instant (not the
 *  1-year steps of the drawing arrays; see starPlace), annual parallax from the catalogue distance when frame.parallax
 *  is on, annual aberration when it is on (frame.beta is zero otherwise). Double precision throughout. */
export function starApparentEqj(k, i, frame) {
  const t = stars.tiers[k]; if (!t || !t.loaded) return null;
  const d = t.data, o = i * NF;
  const years = state.fx.properMotion ? frame.years : 0;
  starPlace(d, o, years, PLACE, 0);
  let x = PLACE[0], y = PLACE[1], z = PLACE[2];
  if (frame.parallax && d[o + 6] > 0) {
    const w = RAD_PER_ARCSEC / d[o + 6];                  // parallax in radians = 1 arcsec / distance in pc
    x -= frame.epos[0] * w; y -= frame.epos[1] * w; z -= frame.epos[2] * w;
  }
  x += frame.beta[0]; y += frame.beta[1]; z += frame.beta[2];
  const r = Math.hypot(x, y, z);
  return [x / r, y / r, z / r];
}
