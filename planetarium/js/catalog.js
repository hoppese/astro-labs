// catalog.js: loads the processed data files in data/ and keeps them in typed arrays.
// See tools/build_*.py for how each file is made and NOTES.md for sources and licences.

import { A, DEG, fromRot, transpose, mulMV, sph, toSph, mod } from './astro.js';
import { emit, state } from './state.js';

const BASE = new URL('../data/', import.meta.url);
const NF = 9;                                     // floats per star, see stars.json "fields"
export const F = { ra: 0, dec: 1, mag: 2, bv: 3, hip: 4, hd: 5, dist: 6, pmra: 7, pmdec: 8 };

/** Star tiers, brightest first. tier = {file, n, magMin, magMax, data, vec, loaded, loading}. */
export const stars = { tiers: [], names: { name: {}, bayer: {}, flam: {} }, epochYears: null, NF };
export const constellations = [];                 // [{id, name, gen, rank, label, lines, bounds, lineVecs, boundVecs, labelVec}]
export const dso = { rows: [], deepLoaded: false, deepLoading: false };
export let cities = [];

const getJSON = (f) => fetch(new URL(f, BASE)).then((r) => { if (!r.ok) throw new Error(f + ': HTTP ' + r.status); return r.json(); });

export async function loadCore() {
  const [manifest, names, cons, dsoMain, cityRows] = await Promise.all([
    getJSON('stars.json'), getJSON('starnames.json'), getJSON('constellations.json'), getJSON('dso.json'), getJSON('cities.json'),
  ]);
  let lo = -99;
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
        t.vec = new Float32Array(t.n * 3);
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

function computeVecs(t, years) {
  const d = t.data, v = t.vec;
  for (let i = 0; i < t.n; i++) {
    const o = i * NF;
    const dec = (d[o + 1] + d[o + 8] / 3.6e6 * years) * DEG;
    const cd = Math.cos(dec);
    const ra = (d[o] + d[o + 7] / 3.6e6 * years / Math.max(cd, 1e-6)) * DEG;
    v[3 * i] = cd * Math.cos(ra); v[3 * i + 1] = cd * Math.sin(ra); v[3 * i + 2] = Math.sin(dec);
  }
}
/** Apply proper motion for the given epoch (years since J2000). Cheap; redone when the date moves by > 1 year. */
export function setStarEpoch(years) {
  if (!state.fx.properMotion) years = 0;                  // labs: freeze the stars at their J2000 places
  // stars.epochTol (years) is tightened by js/labs/corrections.js when zoomed far in, so a fast star moves smoothly
  if (stars.epochYears !== null && Math.abs(years - stars.epochYears) < (stars.epochTol || 1)) return;
  stars.epochYears = years;
  for (const t of stars.tiers) if (t.loaded) computeVecs(t, years);
}

/** Plain-object view of one star. */
export function starRecord(k, i) {
  const t = stars.tiers[k], d = t.data, o = i * NF;
  const s = { k, i, ra: d[o], dec: d[o + 1], mag: d[o + 2], bv: d[o + 3] > 50 ? null : d[o + 3], hip: d[o + 4] || null,
    hd: d[o + 5] || null, dist: d[o + 6] || null, pmra: d[o + 7], pmdec: d[o + 8],
    vec: [t.vec[3 * i], t.vec[3 * i + 1], t.vec[3 * i + 2]] };
  if (k === 0) { s.name = stars.names.name[i] || null; s.bayer = stars.names.bayer[i] || null; s.flam = stars.names.flam[i] || null; }
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
/** J2000 unit vector of star (k, i) as seen at `frame`: proper motion to the exact instant (not the
 *  1-year steps of the drawing arrays), annual parallax from the catalogue distance when frame.parallax
 *  is on, annual aberration when it is on (frame.beta is zero otherwise). Double precision throughout. */
export function starApparentEqj(k, i, frame) {
  const t = stars.tiers[k]; if (!t || !t.loaded) return null;
  const d = t.data, o = i * NF;
  const years = state.fx.properMotion ? frame.years : 0;
  const dec = (d[o + 1] + d[o + 8] / 3.6e6 * years) * DEG, cd = Math.cos(dec);
  const ra = (d[o] + d[o + 7] / 3.6e6 * years / Math.max(cd, 1e-6)) * DEG;
  let x = cd * Math.cos(ra), y = cd * Math.sin(ra), z = Math.sin(dec);
  if (frame.parallax && d[o + 6] > 0) {
    const w = RAD_PER_ARCSEC / d[o + 6];                  // parallax in radians = 1 arcsec / distance in pc
    x -= frame.epos[0] * w; y -= frame.epos[1] * w; z -= frame.epos[2] * w;
  }
  x += frame.beta[0]; y += frame.beta[1]; z += frame.beta[2];
  const r = Math.hypot(x, y, z);
  return [x / r, y / r, z / r];
}
