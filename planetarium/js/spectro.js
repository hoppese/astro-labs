// spectro.js: the spectrograph's MODEL spectra. No DOM: the card is js/labs/spectrograph.js, the checks tools/check-spectro.mjs.
//
// HONESTY: these are not observed spectra. Each is built from two catalogued facts about the star, its MK spectral type
// (Hipparcos Catalogue, ESA 1997, CDS I/239, data/sptype.txt; tools/build_sptype.py) and its radial velocity (the star
// catalogue's, js/catalog.js), by the textbook recipe:
//   continuum   a blackbody (Planck) at the effective temperature of that type: TEFF below, after Pecaut & Mamajek (2013,
//               ApJS 208, 9; their updated online table) for dwarfs and Alonso et al. (1999) / Gray (2005) for giants and
//               supergiants of G to M. A star with no catalogued type gets one from its B−V colour by Ballesteros (2012,
//               EPL 97, 34009): T = 4600 K (1 / (0.92 (B−V) + 1.7) + 1 / (0.92 (B−V) + 0.62)), and is labelled so.
//   lines       absorption lines and molecular bands at their laboratory (air) wavelengths, each with a depth that is a smooth
//               function of the spectral class: hydrogen (Balmer) strongest at A0, neutral helium in B, ionized helium in O,
//               ionized calcium H and K growing from A to K, the CH G band, iron, magnesium b and sodium D in F to K, neutral
//               calcium 422.7 in K and M, titanium oxide bands in M. Luminosity class narrows the hydrogen lines (lower surface
//               gravity in giants and supergiants), as on Morgan and Keenan's plates.
//   Doppler     every wavelength times (1 + v / c), v the radial velocity (0 when the catalogue has none).
//   noise       about 1% per point, a fixed function of (the student's seed, the star, the wavelength to 0.01 nm), so the same
//               star always shows the same spectrum to one student and a slightly different one to the next.
// Depths and widths are schematic, tuned so the classes look as they do in a teaching atlas; they are not fits to real spectra.

export const C_KMS = 299792.458;
export const WIEN = 2.897771955e6;        // nm K

// ---- spectral types ----
const CLASSES = 'OBAFGKM';
/** Parse an MK type ("B8Ia", "K2IIIp", "A0Vvar", "M1Ib + B2.5V", "WC8 + O9I", "G8III") to {x, lum, cls, text} or null.
 *  x: the class as a number, O0 = 0, B0 = 10, A0 = 20, F0 = 30, G0 = 40, K0 = 50, M0 = 60 (decimals allowed).
 *  lum: 1 (supergiant, Ia/Ib/I), 2, 3 (giant), 4, 5 (dwarf, the default). Only the first (brightest) component is read. */
export function parseType(text) {
  if (!text) return null;
  let s = String(text).trim();
  s = s.replace(/^(sd|d|g|c)(?=[OBAFGKM])/, '');                 // old prefixes: d = dwarf, g = giant, c = supergiant, sd = subdwarf
  let m = /^(W[CNR]?)/.exec(s);
  if (m) return { x: 3, lum: 1, cls: 'O', text, wr: true };      // Wolf–Rayet: treated as a very hot O star
  m = /^([OBAFGKM])\s*(\d+(?:\.\d+)?)?/.exec(s);
  if (!m) { const c = /^([CSNR])/.exec(s); return c ? { x: 66, lum: 3, cls: 'M', text } : null; }      // carbon and S stars: as a cool giant
  const cls = m[1], sub = m[2] != null ? Math.min(9.5, +m[2]) : 5;
  const rest = s.slice(m[0].length);
  const L = /^[\s:/-]*(Ia\+?|Iab|Ib|III|II|IV|V|I)(?![a-z])/i.exec(rest) || /(Ia|Iab|Ib|III|II|IV|V|I)/.exec(rest.split('+')[0]);
  const lumOf = { I: 1, IA: 1, 'IA+': 1, IAB: 1, IB: 1, II: 2, III: 3, IV: 4, V: 5 };
  const lum = L ? lumOf[L[1].toUpperCase()] || 5 : 5;
  return { x: CLASSES.indexOf(cls) * 10 + sub, lum, cls, text };
}

// effective temperature (K) by class number x; dwarfs (V, IV), and giants and supergiants from G5 on (cooler at the same type)
const T_DWARF = [[0, 50000], [3, 44900], [5, 41400], [7, 36500], [9, 31900], [10, 31400], [11, 26000], [12, 20600], [13, 17000], [15, 15700], [17, 14000], [18, 12500],
  [19, 10700], [20, 9700], [22, 8840], [25, 8080], [27, 7650], [30, 7220], [32, 6810], [35, 6510], [38, 6170], [40, 5920], [42, 5770], [45, 5660], [48, 5490],
  [50, 5280], [52, 5040], [55, 4450], [57, 4050], [60, 3850], [62, 3560], [64, 3210], [66, 2810], [69, 2400]];
const T_GIANT = [[45, 5050], [48, 4800], [50, 4660], [52, 4390], [53, 4250], [55, 4050], [57, 3950], [60, 3850], [62, 3690], [63, 3600], [65, 3380], [67, 3200], [69, 3000]];
const interp = (tab, x) => {
  if (x <= tab[0][0]) return tab[0][1];
  for (let i = 1; i < tab.length; i++) if (x <= tab[i][0]) { const [x0, y0] = tab[i - 1], [x1, y1] = tab[i]; return y0 + (y1 - y0) * (x - x0) / (x1 - x0); }
  return tab[tab.length - 1][1];
};
/** Effective temperature (K) of a parsed type. */
export function teffOf(p) {
  const d = interp(T_DWARF, p.x);
  if (p.lum >= 4 || p.x < 45) return d;
  const g = interp(T_GIANT, p.x), w = Math.min(1, (p.x - 40) / 5);      // blend in from G0 to G5
  return d + (g - d) * w;
}
/** Temperature from B−V (Ballesteros 2012), for stars with no catalogued type. */
export const teffFromBV = (bv) => 4600 * (1 / (0.92 * bv + 1.7) + 1 / (0.92 * bv + 0.62));
/** The class number x of a dwarf of temperature T (the inverse of the dwarf table). */
export function xOfTeff(T) {
  for (let i = 1; i < T_DWARF.length; i++) {
    const [x0, t0] = T_DWARF[i - 1], [x1, t1] = T_DWARF[i];
    if (T <= t0 && T >= t1) return x0 + (x1 - x0) * (t0 - T) / (t0 - t1);
  }
  return T > T_DWARF[0][1] ? 0 : 69;
}
/** "A0", "K5.5" for a class number. */
export const classText = (x) => { const c = Math.min(6, Math.max(0, Math.floor(x / 10))), sub = Math.round((x - c * 10) * 2) / 2; return CLASSES[c] + (sub >= 10 ? 9.5 : sub); };

// ---- the catalogue of types (lazy) ----
let types = null, loading = null;
/** Load data/sptype.txt once (only when the spectrograph is opened). Resolves to a Map hip -> type text. */
export function loadTypes(url = new URL('../data/sptype.txt', import.meta.url)) {
  if (types) return Promise.resolve(types);
  if (!loading) loading = fetch(url).then((r) => r.text()).then((txt) => {
    const m = new Map(); let hip = 0;
    for (const line of txt.split('\n')) { if (!line) continue; const sp = line.indexOf(' '); hip += sp > 0 ? +line.slice(0, sp) : 1; m.set(hip, line.slice(sp + 1)); }
    return (types = m);
  }).catch((e) => { loading = null; throw e; });
  return loading;
}
export const typeOfHip = (hip) => (types && hip ? types.get(hip) || null : null);
export const typesLoaded = () => !!types;
/** For the node checks (no fetch of files there): use this Map hip -> type text. */
export function useTypes(m) { types = m; }
/** THE temperature a star is given, by the spectrograph and by the photometer's filters (js/photometer.js), so the two labs agree:
 *  from its MK type (teffOf), or from its B−V (Ballesteros) when it has no type. {T, p, fromColour} or null. */
export function starTemp(type, bv) {
  const p = parseType(type);
  if (p) return { T: teffOf(p), p, fromColour: false };
  if (bv == null || !isFinite(bv)) return null;
  const T = teffFromBV(bv);
  return { T, p: { x: xOfTeff(T), lum: 5, cls: '', text: null }, fromColour: true };
}

// ---- lines ----
const g = (x, c, w) => Math.exp(-0.5 * ((x - c) / w) ** 2);
const rise = (x, c, w) => 1 / (1 + Math.exp(-(x - c) / w));
// [name, air wavelength nm, depth(x), width nm (dwarf)]; 'H' lines also narrow with luminosity class
const LINES = [
  ['Hα', 656.28, (x) => 0.06 + 0.55 * g(x, 20, 8), 1.0, 'H'],
  ['Hβ', 486.13, (x) => 0.06 + 0.62 * g(x, 20, 8), 1.3, 'H'],
  ['Hγ', 434.05, (x) => 0.05 + 0.62 * g(x, 20, 8), 1.4, 'H'],
  ['Hδ', 410.17, (x) => 0.05 + 0.60 * g(x, 20, 8), 1.4, 'H'],
  ['Hε', 397.01, (x) => 0.04 + 0.50 * g(x, 20, 8), 1.3, 'H'],
  ['He I', 447.15, (x) => 0.32 * g(x, 12, 4.5), 0.35],
  ['He I', 587.56, (x) => 0.26 * g(x, 12, 4.5), 0.35],
  ['He I', 402.62, (x) => 0.22 * g(x, 12, 4.5), 0.3],
  ['He I', 667.82, (x) => 0.16 * g(x, 12, 4.5), 0.35],
  ['He II', 468.57, (x) => 0.30 * g(x, 3, 3.5), 0.4],
  ['He II', 454.16, (x) => 0.20 * g(x, 3, 3.5), 0.35],
  ['Ca II K', 393.37, (x) => 0.85 * rise(x, 27, 3.5), 0.55],
  ['Ca II H', 396.85, (x) => 0.80 * rise(x, 27, 3.5), 0.55],
  ['Ca I', 422.67, (x) => 0.65 * rise(x, 52, 4), 0.35],
  ['G band (CH)', 430.5, (x) => 0.42 * g(x, 48, 8), 0.9],
  ['Fe I', 438.35, (x) => 0.34 * rise(x, 34, 4), 0.25],
  ['Fe I', 404.58, (x) => 0.32 * rise(x, 34, 4), 0.25],
  ['Fe I', 527.04, (x) => 0.28 * rise(x, 36, 4), 0.2],
  ['Fe I', 495.76, (x) => 0.26 * rise(x, 36, 4), 0.2],
  ['Fe I', 532.80, (x) => 0.22 * rise(x, 36, 4), 0.2],
  ['Mg b', 516.73, (x) => 0.40 * rise(x, 36, 4), 0.3],
  ['Mg b', 517.27, (x) => 0.45 * rise(x, 36, 4), 0.3],
  ['Mg b', 518.36, (x) => 0.48 * rise(x, 36, 4), 0.3],
  ['Na D2', 588.99, (x) => 0.55 * rise(x, 44, 5), 0.3],
  ['Na D1', 589.59, (x) => 0.50 * rise(x, 44, 5), 0.3],
];
// molecular bands: [name, band head nm, depth(x), length nm]; sharp on the blue side, fading redward
const BANDS = [
  ['TiO', 476.1, (x) => 0.45 * rise(x, 61, 1.5), 14], ['TiO', 495.4, (x) => 0.55 * rise(x, 60.5, 1.5), 16], ['TiO', 516.7, (x) => 0.55 * rise(x, 60.5, 1.5), 16],
  ['TiO', 544.8, (x) => 0.6 * rise(x, 60, 1.5), 18], ['TiO', 586.2, (x) => 0.5 * rise(x, 61, 1.5), 16], ['TiO', 615.9, (x) => 0.6 * rise(x, 60, 1.5), 20],
  ['TiO', 670.5, (x) => 0.55 * rise(x, 60.5, 1.5), 22], ['TiO', 705.4, (x) => 0.65 * rise(x, 60, 1.5), 25], ['TiO', 759.0, (x) => 0.5 * rise(x, 61, 1.5), 25],
];
/** The lines as data (for labels and the checks): [{name, lab, depth, width, band}] for the star. */
export function linesFor(star) {
  const out = [];
  const hw = [0, 0.4, 0.5, 0.65, 0.85, 1][star.lum] || 1;
  for (const [name, lab, d, w, kind] of LINES) { const depth = Math.min(0.92, d(star.x)); if (depth > 0.01) out.push({ name, lab, depth, width: w * (kind === 'H' ? hw : 1), band: false }); }
  for (const [name, lab, d, len] of BANDS) { const depth = d(star.x); if (depth > 0.01) out.push({ name, lab, depth, width: len, band: true }); }
  return out;
}

// ---- the spectrum ----
const H = 6.62607015e-34, CL = 2.99792458e8, KB = 1.380649e-23;
/** Planck B_λ (any scale), λ in nm. */
export const planck = (lam, T) => { const l = lam * 1e-9; return 1 / (l ** 5 * Math.expm1(H * CL / (l * KB * T))); };
const mix32 = (h, k) => { k = Math.imul(k, 0xcc9e2d51); k = (k << 15) | (k >>> 17); k = Math.imul(k, 0x1b873593); h ^= k; h = (h << 13) | (h >>> 19); return (Math.imul(h, 5) + 0xe6546b64) | 0; };
const fin = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
function gauss(seed, key, i) { const h = mix32(mix32(seed | 0, key | 0), i | 0); const u1 = (fin(h) + 1) / 4294967297, u2 = fin(mix32(h, 0x9e3779b9)) / 4294967296; return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2); }

/**
 * A model star for the spectrograph.
 * info: {type?: MK text, bv?: B−V, rv?: km/s, key?: integer (the Hipparcos number), seed?: the student's seed, noise?: 0.01}
 * Returns {T, x, lum, typeText, fromColour, rv, lines, flux(λ), continuum(λ), peak} or null when there is nothing to build from.
 * flux and continuum are on one scale: the continuum's maximum is 1.
 */
export function makeStar(info) {
  const st = starTemp(info.type, info.bv);
  if (!st) return null;
  const { T, p, fromColour } = st;
  const rv = isFinite(info.rv) ? +info.rv : 0, z = 1 + rv / C_KMS;
  const lamMax = WIEN / T, norm = 1 / planck(lamMax, T);
  const continuum = (lam) => planck(lam, T) * norm;
  const lines = linesFor(p).map((l) => ({ ...l, obs: l.lab * z }));
  const seed = info.seed || 1, key = info.key || 0, sig = info.noise == null ? 0.01 : info.noise;
  const transmission = (lam) => {
    let t = 1;
    for (const l of lines) {
      if (l.band) { const d = lam - l.obs; if (d > -0.6 && d < l.width * 4) t *= 1 - l.depth * (d < 0 ? Math.exp(-0.5 * (d / 0.2) ** 2) : Math.exp(-d / l.width)); }
      else { const d = lam - l.obs; if (Math.abs(d) < l.width * 6) t *= 1 - l.depth * Math.exp(-0.5 * (d / l.width) ** 2); }
    }
    return t;
  };
  const flux = (lam, withNoise = true) => {
    const f = continuum(lam) * transmission(lam);
    return withNoise && sig ? f * (1 + sig * gauss(seed, key, Math.round(lam * 100))) : f;
  };
  return { T, x: p.x, lum: p.lum, typeText: p.text, fromColour, rv, lines, flux, transmission, continuum, peak: lamMax };
}

// ---- galaxies (the Hubble-law lab) ----
// HONESTY: a MODEL integrated spectrum, built from two catalogued facts about the galaxy, its redshift z and its Hubble type
// (OpenNGC): the light of many old stars (a blend of blackbodies at 4,300 K, 5,500 K and, for spirals, 9,000 K from young
// stars), the absorption lines that dominate such light (ionized calcium H and K, the CH G band, magnesium b, iron, sodium D,
// weak hydrogen), broadened by the stars' motions inside the galaxy; spirals add emission from their gas (hydrogen α, [N II],
// [O II]). Every wavelength is times (1 + z). Depths and widths are schematic, as in a textbook figure, not fits to the galaxy.
const GAL_LINES = [      // [name, air nm, depth (absorption > 0, emission < 0) for an elliptical, for a spiral, width nm]
  ['[O II]', 372.7, 0, -0.45, 0.45], ['Ca II K', 393.37, 0.55, 0.45, 0.95], ['Ca II H', 396.85, 0.5, 0.42, 0.95],
  ['Hδ', 410.17, 0.08, 0.1, 0.8], ['G band (CH)', 430.5, 0.3, 0.24, 1.3], ['Hγ', 434.05, 0.06, 0.08, 0.8],
  ['Hβ', 486.13, 0.1, -0.12, 0.7], ['Mg b', 517.5, 0.3, 0.22, 1.1], ['Fe I', 527.0, 0.14, 0.1, 0.8],
  ['Fe I', 533.5, 0.1, 0.07, 0.8], ['Na D', 589.3, 0.22, 0.16, 0.9], ['Hα', 656.28, 0.08, -0.6, 0.55], ['[N II]', 658.35, 0, -0.2, 0.5],
];
/** Is this Hubble type a spiral or irregular (gas, young stars, emission lines)? */
const gassy = (h) => !!h && /^(S|I)/.test(h) && !/^S0/.test(h);
/** A model galaxy for the spectrograph: info {z, hubble?: type text, key?, seed?, noise?}. Same shape as makeStar's result. */
export function makeGalaxy(info) {
  if (info.z == null || !isFinite(info.z)) return null;
  const sp = gassy(info.hubble), z = 1 + info.z;
  const mixT = sp ? [[4300, 0.45], [5500, 0.4], [9000, 0.15]] : [[4300, 0.6], [5500, 0.4]];
  const raw = (lam) => { let s = 0; for (const [T, w] of mixT) s += w * planck(lam, T) / planck(WIEN / T, T); return s; };
  let top = 0, peak = 0; for (let l = 300; l <= 1000; l += 1) { const v = raw(l); if (v > top) { top = v; peak = l; } }
  const continuum = (lam) => raw(lam / z) / top;          // the whole spectrum is stretched by (1 + z)
  const lines = GAL_LINES.map(([name, lab, dE, dS, w]) => ({ name, lab, depth: sp ? dS : dE, width: w * z, obs: lab * z, band: false, emission: (sp ? dS : dE) < 0 })).filter((l) => l.depth !== 0);
  const seed = info.seed || 1, key = info.key || 0, sig = info.noise == null ? 0.01 : info.noise;
  const transmission = (lam) => { let t = 1; for (const l of lines) { const d = lam - l.obs; if (Math.abs(d) < l.width * 6) t *= 1 - l.depth * Math.exp(-0.5 * (d / l.width) ** 2); } return t; };
  const flux = (lam, withNoise = true) => { const f = continuum(lam) * transmission(lam); return withNoise && sig ? f * (1 + sig * gauss(seed, key, Math.round(lam * 100))) : f; };
  return { galaxy: true, z: info.z, spiral: sp, T: null, x: null, lum: null, typeText: info.hubble || null, fromColour: false, rv: info.z * C_KMS, lines, flux, transmission, continuum, peak: peak * z };
}

// ---- double-lined spectroscopic binaries ----
// The spectrum of such a star is the sum of its two stars' spectra, each Doppler-shifted by its own velocity round the pair's centre of
// mass, so its lines split and merge as the stars go round. A MODEL like the rest, from published elements:
//   Spica (α Vir, HIP 65474): period 4.0145898 d (Tkachenko et al. 2016, MNRAS 458, 1964); masses 11.43 and 7.21 M☉ and inclination
//   63.1° from the same paper, which give the velocity amplitudes K1 = 123 and K2 = 196 km/s used here (K1 + K2 from Kepler's third law,
//   K1 / K2 = M2 / M1). The real orbit is slightly eccentric (e = 0.12) and turns (apsidal motion); here it is a circle, and the zero of
//   its phase (T0) is ours: the phase on a real date is not a prediction. Types B1 III-IV and B2 V; the second star gives a fifth of the
//   light at 550 nm. Spica's lines are broadened by rotation; here they are much narrower than in a single star of the type (0.3 of the
//   width), and the noise smaller (0.4%), so that the two stars' lines split clearly: a teaching choice, said on the lab card.
export const SB2 = {
  65474: { name: 'Spica', P: 4.0145898, T0: 2461000.25, K1: 123, K2: 196, gamma: 1.0, types: ['B1III-IV', 'B2V'], ratio: 0.2, widths: 0.3, noise: 0.004, inc: 63.1, M1: 11.43, M2: 7.21 },
};
/** This student's version of a binary's elements: amplitudes within 2%, the period within 1 part in 10^5, the phase within 0.02 cycle
 *  (seed 0: the published values). */
export function sb2Elements(hip, seed = 0) {
  const b = SB2[hip]; if (!b) return null;
  if (!seed) return { ...b };
  const n = (i) => Math.max(-2.5, Math.min(2.5, gauss(seed, hip, 900 + i)));
  return { ...b, K1: b.K1 * (1 + 0.02 * n(0)), K2: b.K2 * (1 + 0.02 * n(1)), P: b.P * (1 + 1e-5 * n(2)), T0: b.T0 + 0.02 * n(3) * b.P };
}
/** The two stars' radial velocities (km/s) at Julian Date jd: circular orbits, star 1 receding fastest a quarter period after T0. */
export function sb2Velocities(el, jd) {
  const s = Math.sin(2 * Math.PI * (jd - el.T0) / el.P);
  return [el.gamma + el.K1 * s, el.gamma - el.K2 * s];
}
/** The pair as one star for the spectrograph (the same shape as makeStar's), at Julian Date jd. */
export function makeBinary(hip, jd, seed = 0, noise) {
  const el = sb2Elements(hip, seed); if (!el) return null;
  if (noise == null) noise = el.noise;      // a quieter spectrum than a single star's 1%, so that the faint second star's lines show
  const [v1, v2] = sb2Velocities(el, jd);
  const a = makeStar({ type: el.types[0], rv: v1, noise: 0 }), b = makeStar({ type: el.types[1], rv: v2, noise: 0 });
  for (const st of [a, b]) for (const l of st.lines) if (!l.band) l.width *= el.widths;
  const wb = el.ratio * a.continuum(550) / b.continuum(550), k = 1 / (1 + wb);
  const continuum = (lam) => k * (a.continuum(lam) + wb * b.continuum(lam));
  const clean = (lam) => k * (a.continuum(lam) * a.transmission(lam) + wb * b.continuum(lam) * b.transmission(lam));
  const transmission = (lam) => clean(lam) / continuum(lam);
  const flux = (lam, withNoise = true) => (withNoise && noise ? clean(lam) * (1 + noise * gauss(seed || 1, hip, Math.round(lam * 100))) : clean(lam));
  const lines = [...a.lines.map((l) => ({ ...l, star: 1 })), ...b.lines.map((l) => ({ ...l, star: 2, name: l.name + ' (2)' }))];
  return { T: a.T, x: a.x, lum: a.lum, typeText: el.types.join(' + '), fromColour: false, rv: v1, rv2: v2, binary: el, lines, flux, transmission, continuum, peak: a.peak };
}

