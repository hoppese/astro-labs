// sunspots.js: which sunspot groups are on the Sun at a given instant, and what is known about the cycle then.
//   'recorded'    May 1874 to the last day in data/sun/: the daily group records of the Royal Greenwich Observatory (to 1976) and USAF/NOAA (since 1977), as
//                 compiled by D. Hathaway; places and areas interpolated between the days. Real groups, at their recorded place and area.
//   'statistical' 1610-1874 (and, from published forecasts, up to the end of 2030): only the sunspot number is known. Groups are made up so that their number, areas,
//                 latitudes (Sporer's law), tilt, lifetimes and drift follow the published statistics. The same date always gives the same Sun. Not real groups.
//   'typical'     before 1610 and after 2030: the same, from an average 11-year cycle. Nothing at all is known about those dates.
// The pictures of groups are cut from SDO/HMI photographs (data/sun/spots.webp): a recorded group is drawn with a photograph of ANOTHER group of similar area.
// Method and sources: NOTES.md "Sunspots"; data: tools/build_sunspots.py; checks: tools/check-sun.mjs.

import { DEG, mod } from './astro.js';
import { emit } from './state.js';

const base = new URL('../data/sun/', import.meta.url);
export const sun = { numbers: null, tiles: null, failed: false, version: 0 };
const decades = new Map();
let starting = null;
export function initSun() {
  if (starting) return starting;
  const j = (f) => fetch(new URL(f, base)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); });
  starting = Promise.all([j('numbers.json'), j('spots.json')]).then(([n, t]) => { n.missSet = new Set(n.missing); sun.numbers = n; sun.tiles = t; sun.version++; emit('catalog', 'sun'); })
    .catch((e) => { sun.failed = true; console.warn('sunspot data', e.message); });
  return starting;
}
export const yearOf = (tt) => 2000 + tt / 365.2425;
const ttOf = (y) => (y - 2000) * 365.2425;
const CAL2000 = Date.UTC(2000, 0, 1);

// ---- recorded groups -----------------------------------------------------------------------------
function decode(buf, d) {
  const dv = new DataView(buf), t00 = (Date.UTC(d, 0, 1) - CAL2000) / 864e5 - 0.5, out = []; let o = 0;
  while (o < buf.byteLength) {
    const n = dv.getUint8(o + 2), g = { t0: t00 + dv.getUint16(o, true) / 10, cls: dv.getUint8(o + 3), n, t: new Float64Array(n), lat: new Float32Array(n), lon: new Float32Array(n), area: new Float32Array(n), seed: 0 };
    const lat0 = dv.getInt16(o + 4, true) / 10, lon0 = dv.getUint16(o + 6, true) / 10; o += 8; let t = g.t0;
    for (let i = 0; i < n; i++) { t += dv.getUint8(o) / 10; g.t[i] = t; g.lat[i] = lat0 + dv.getInt8(o + 1) / 10; g.lon[i] = lon0 + dv.getInt8(o + 2) / 5; g.area[i] = Math.exp(dv.getUint8(o + 3) / 28) - 1; o += 4; }
    g.seed = Math.round(g.t0 * 10) * 31 + Math.round(lat0 * 10) * 7 + Math.round(lon0 * 10); g.end = t; g.max = Math.max(...g.area); out.push(g);
  }
  return out;
}
function decade(d) {
  let h = decades.get(d);
  if (!h) { h = { state: 0, list: null }; decades.set(d, h); h.promise = fetch(new URL(`g${d}.bin`, base)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then((b) => { h.list = decode(b, d); h.state = 1; sun.version++; emit('catalog', 'sun'); }).catch(() => { h.state = -1; }); }
  return h;
}
export const loadDecade = (d) => decade(d).promise;
/** Carrington longitude of the disc centre, degrees (good to a few hundredths; used only to tell which limb a group is at). */
const L0 = (tt) => mod(carr(tt), 360);
function carr(tt) {      // Meeus ch. 29, as in tools/build_bodies.py
  const jd = tt + 2451545, T = tt / 36525, L = 280.46646 + 36000.76983 * T, M = (357.52911 + 35999.05029 * T) * DEG;
  const C = (1.914602 - 0.004817 * T) * Math.sin(M) + 0.019993 * Math.sin(2 * M), lam = (L + C - 0.00569) * DEG, th = (jd - 2398220) * 360 / 25.38 * DEG, I = 7.25 * DEG, K = (73.6667 + 1.3958333 * (jd - 2396758) / 36525) * DEG;
  const eta = Math.atan2(-Math.sin(lam - K) * Math.cos(I), -Math.cos(lam - K));
  return (eta - th) / DEG;
}
export const centralMeridian = (tt) => L0(tt);
const GROW = 0.8;
function recorded(tt, hold = 0) {
  const y = Math.floor(yearOf(tt)), a = Math.floor(y / 10) * 10, out = []; let ready = true;
  for (const d of [a - 10, a, a + 10]) {
    if (d < 1870 || d > 2020) continue;
    if (d === a - 10 && tt > (Date.UTC(a, 0, 1) - CAL2000) / 864e5 + 25) continue;
    if (d === a + 10 && tt < (Date.UTC(a + 10, 0, 1) - CAL2000) / 864e5 - 5) continue;
    const h = decade(d); if (h.state !== 1) { ready = false; continue; }
    const L = h.list; let lo = 0, hi = L.length; while (lo < hi) { const m = (lo + hi) >> 1; if (L[m].t0 < tt - 22) lo = m + 1; else hi = m; }
    for (let i = lo; i < L.length && L[i].t0 < tt + 4; i++) {
      const g = L[i]; let lat, lon, area, f = 1;
      if (tt < g.t[0] || tt > g.end) {
        const k = tt < g.t[0] ? 0 : g.n - 1, dt = Math.abs(tt - g.t[k]), cmd = mod(g.lon[k] - L0(g.t[k]) + 180, 360) - 180;
        // first seen near the east limb, or last seen near the west limb: it was there before, or stays; otherwise it grew or faded in between
        const limb = k === 0 ? cmd < -52 : cmd > 52;
        if (dt > (hold || (limb ? 3.5 : GROW))) continue;
        if (!limb && !hold) f = 1 - dt / GROW;
        lat = g.lat[k]; lon = g.lon[k]; area = g.area[k];
      } else {
        let k = 0; while (k < g.n - 2 && g.t[k + 1] < tt) k++;
        if (g.n === 1) { lat = g.lat[0]; lon = g.lon[0]; area = g.area[0]; } else { const u = Math.max(0, Math.min(1, (tt - g.t[k]) / (g.t[k + 1] - g.t[k] || 1))); lat = g.lat[k] + u * (g.lat[k + 1] - g.lat[k]); lon = g.lon[k] + u * (g.lon[k + 1] - g.lon[k]); area = g.area[k] + u * (g.area[k + 1] - g.area[k]); }
      }
      out.push({ lat, lon: mod(lon, 360), area: area * f, rec: area, cls: g.cls, seed: g.seed, max: g.max });
    }
  }
  return ready ? out : null;
}
/** USAF/NOAA areas are too small by this factor beside Greenwich's (Hathaway 2015; the same ratio brings area per sunspot number into line, see NOTES.md). */
const scaleOf = (tt) => (tt > ttOf(1977) ? 1.4 : 1);

// ---- sunspot numbers and cycles ------------------------------------------------------------------
// minima (decimal years): SILSO / NOAA tables; cycle 1 begins 1755.2. Before 1755 the conventional dates from Waldmeier's table.
export const MINIMA = [1610.8, 1619.0, 1634.0, 1645.0, 1655.0, 1666.0, 1679.5, 1689.5, 1698.0, 1712.0, 1723.5, 1734.0, 1745.0, 1755.2, 1766.5, 1775.5, 1784.8, 1798.3, 1810.6, 1823.3, 1833.9, 1843.5, 1855.9, 1867.2, 1878.9, 1890.2, 1902.0, 1913.5, 1923.6, 1933.8, 1944.2, 1954.3, 1964.9, 1976.2, 1986.7, 1996.6, 2008.9, 2019.96, 2030.9];
const MAXIMA = { 1: 1761.5, 2: 1769.8, 3: 1778.4, 4: 1788.2, 5: 1805.1, 6: 1816.4, 7: 1829.9, 8: 1837.2, 9: 1848.2, 10: 1860.1, 11: 1870.7, 12: 1884.0, 13: 1894.0, 14: 1906.1, 15: 1917.6, 16: 1928.3, 17: 1937.3, 18: 1947.4, 19: 1958.2, 20: 1968.9, 21: 1979.9, 22: 1989.9, 23: 2001.9, 24: 2014.3, 25: 2024.8 };
const FIRST_NUM = -12, LEN = 11.0;      // number of the cycle that begins in 1610.8
/** {start, end, number} of the cycle containing year y (an average 11.0-year cycle outside the list). */
export function cycleAt(y) {
  const n = MINIMA.length;
  if (y < MINIMA[0]) { const k = Math.ceil((MINIMA[0] - y) / LEN); return { start: MINIMA[0] - k * LEN, end: MINIMA[0] - (k - 1) * LEN, number: null }; }
  if (y >= MINIMA[n - 1]) { const k = Math.floor((y - MINIMA[n - 1]) / LEN); return { start: MINIMA[n - 1] + k * LEN, end: MINIMA[n - 1] + (k + 1) * LEN, number: null }; }
  let i = 0; while (MINIMA[i + 1] <= y) i++;
  return { start: MINIMA[i], end: MINIMA[i + 1], number: i + FIRST_NUM };
}
/** Hathaway, Wilson and Reichmann's (1994) shape of a cycle, with a peak of 160 (the mean of cycles 1-24 on the version-2 scale is 179; about 115 smoothed minimum-to-maximum cycles count for less before 1750). */
const shape = (m, b = 52) => { if (m <= 0) return 0; const x = m / b; return x * x * x / (Math.exp(x * x) - 0.71); };
const PEAK = 0.5557;
function typical(y) { let v = 2; for (const s of [cycleAt(y), cycleAt(cycleAt(y).start - 0.1)]) v += 165 * shape((y - s.start) * 12) / PEAK * (y - s.start < 14 ? 1 : 0); return v; }
const table = (a, x) => { const i = Math.floor(x), f = x - i; if (i < 0) return a[0]; if (i >= a.length - 1) return a[a.length - 1]; return a[i] + f * (a[i + 1] - a[i]); };
let smooth = null;
/** {sn, basis}: the sunspot number (SILSO version 2 scale) that rules the number of made-up groups, and where it comes from. */
export function sunspotNumber(y) {
  const N = sun.numbers; if (!N) return { sn: typical(y), basis: 'typical' };
  const m = (y - N.monthly0) * 12 - 0.5, nm = N.monthly.length;
  if (m >= 0 && m < nm - 1) {
    if (!smooth) smooth = N.monthly.map((v, i, a) => (a[Math.max(0, i - 1)] + 2 * v + a[Math.min(nm - 1, i + 1)]) / 4);
    return { sn: table(smooth, m), basis: 'monthly', month: N.monthly[Math.min(nm - 1, Math.floor((y - N.monthly0) * 12))] };
  }
  if (m >= nm - 1) {
    const np = N.predicted.length, x = m - nm; if (x < np) { const v = table(N.predicted, x); return { sn: Math.max(1, x > np - 12 ? v + (typical(y) - v) * Math.max(0, (x - np + 12) / 12) : v), basis: 'forecast' }; }
    return { sn: typical(y), basis: 'typical' };
  }
  if (y >= 1715) return { sn: table(N.yearly, y - N.yearly0 - 0.5), basis: 'yearly' };
  if (y >= N.group0) {
    // in the Maunder Minimum (1645-1715) the yearly group numbers rest on a few drawings of the days on which something was there: the share of days with any spot
    // was of the order of a tenth to a fifth (Vaquero et al. 2015), so they count for a third
    const mm = y > 1645 && y < 1715 ? 0.3 : 1;
    return { sn: 19.1 * mm * table(N.group, y - N.group0 - 0.5), basis: 'group' };
  }      // 19.1: SILSO yearly number per group number, 1750-2013
  return { sn: typical(y), basis: 'typical' };
}
export function kindAt(tt) {
  const N = sun.numbers, y = yearOf(tt);
  if (N && tt >= N.first && tt <= N.last + 0.6) return 'recorded';
  const b = sunspotNumber(y).basis;
  return b === 'typical' ? 'typical' : 'statistical';
}

// ---- made-up groups ------------------------------------------------------------------------------
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r() * 0.999999)) * Math.cos(2 * Math.PI * r());
// constants fitted so that the groups seen on the disc match Greenwich 1874-1976: 0.054 groups and 10.7 millionths of area per unit of sunspot number (tools/check-sun.mjs)
const BIRTHS = 0.0098, LN_MEAN = 3.85, LN_SD = 1.42;
const bornOn = new Map();
function births(day) {
  let L = bornOn.get(day); if (L) return L;
  if (bornOn.size > 4000) bornOn.clear();
  L = []; bornOn.set(day, L);
  const r = rng(Math.imul(day | 0, 2654435761) ^ 0x5bd1e995), y = yearOf(day), lam = BIRTHS * Math.max(0, sunspotNumber(y).sn);
  let n = 0, p = Math.exp(-lam), c = p, u = r(); while (u > c && n < 60) { n++; p *= lam / n; c += p; }
  const cur = cycleAt(y), next = { start: cur.end }, prev = cycleAt(cur.start - 0.1);
  // cycles overlap: the new one's first spots come about a year and a half before the minimum, the old one's last as long after
  const wNew = (t) => 1 / (1 + Math.exp(-t / 0.42));
  for (let i = 0; i < n; i++) {
    const q = r(); let c0 = cur;
    if (y - cur.start < 2.5) { if (q > wNew(y - cur.start)) c0 = prev; } else if (cur.end - y < 2.5) { if (q < wNew(y - cur.end)) c0 = next; }
    const ph = y - c0.start, mean = 28 * Math.exp(-ph * 12 / 90), sd = 4.4 + 2.6 * Math.exp(-(((ph - 3.9) / 2.6) ** 2));      // Hathaway 2011 / 2015 eq. 22; spread measured on the Greenwich groups
    let la = Math.abs(mean + sd * gauss(r)); if (la > 45) la = 45 * r();
    const south = y > 1671 && y < 1711;      // the Paris observers saw spots almost only south of the equator, within 20 degrees (Ribes and Nesme-Ribes 1993)
    if (south) la = Math.min(la, 6 + 13 * r());
    const lat = (r() < (south ? 0.95 : 0.5) ? -1 : 1) * la, lon = 360 * r(), max = Math.min(4500, Math.exp(LN_MEAN + LN_SD * gauss(r)));
    const life = Math.max(1.2, Math.min(60, max / 10 * (0.7 + 0.6 * r()) + 1.5));                        // Gnevyshev-Waldmeier: area = 10 millionths x days
    L.push({ t0: day + r(), life, lat, lon, max, seed: Math.floor(r() * 1e9), cls: 0 });
  }
  return L;
}
function made(tt) {
  const out = [], d1 = Math.floor(tt);
  for (let d = d1 - 62; d <= d1; d++) for (const g of births(d)) {
    const x = (tt - g.t0) / g.life; if (x <= 0 || x >= 1) continue;
    const up = Math.min(0.35, 4 / g.life), a = x < up ? Math.sin(Math.PI / 2 * x / up) : ((1 - x) / (1 - up)) ** 1.1;      // quick growth, slow decay
    const s = Math.sin(g.lat * DEG) ** 2;
    out.push({ lat: g.lat, lon: mod(g.lon + (14.38 - 2.77 * s - 14.1844) * (tt - g.t0), 360), area: g.max * a, rec: g.max * a, cls: 0, seed: g.seed, max: g.max });      // rotation of recurrent spots: Newton and Nunn 1951
  }
  return out;
}

/** All groups at tt: {kind, list: [{lat, lon (Carrington), area (millionths of a hemisphere, Greenwich scale), rec, cls, seed, max}]}. list is null while data load. */
let memo = null, memoKey = '';
export function groupsAt(tt) {
  const key = tt.toFixed(4) + '|' + sun.version; if (key === memoKey) return memo;
  const kind = kindAt(tt); let list = null;
  const N = sun.numbers, rec = (hold, w) => { const L = recorded(tt, hold); if (L) { const k = scaleOf(tt); for (const g of L) { g.area *= k * w; g.max *= k; } } return L; };
  if (kind === 'recorded') list = rec(0, 1);
  else if (N || sun.failed) {
    list = made(tt);
    // the seam with the records: over three days the last recorded groups fade out as the made-up ones fade in
    const gap = N ? Math.min(Math.abs(tt - N.last - 0.6), Math.abs(tt - N.first)) : 9;
    if (gap < 3) { const u = gap / 3, w = u * u * (3 - 2 * u); for (const g of list) g.area *= w; const R = rec(3.6, 1 - w); if (R) list = list.concat(R); }
  }
  memoKey = key; memo = { kind, list }; return memo;
}
/** Groups on the disc: those within 90 deg of the disc centre (lon0, lat0). */
export function onDisc(list, lon0, lat0, tt) {
  return list.filter((g) => Math.sin(g.lat * DEG) * Math.sin(lat0 * DEG) + Math.cos(g.lat * DEG) * Math.cos(lat0 * DEG) * Math.cos((g.lon - lon0) * DEG) > 0.02);
}
/** Cycle facts for the panel. */
export function cycleFacts(tt) {
  const y = yearOf(tt), c = cycleAt(y), s = sunspotNumber(y), mx = c.number != null ? MAXIMA[c.number] : null, since = y - c.start, top = mx || c.start + 4.3;
  const phase = since < 1 || c.end - y < 1 ? 'near minimum' : Math.abs(y - top) < 1 ? 'near maximum' : y < top ? 'rising' : 'declining';
  return { ...s, number: c.number, start: c.start, end: c.end, since, phase, year: y, maunder: y >= 1645 && y <= 1715 };
}

// ---- which picture -------------------------------------------------------------------------------
/** The tile for a group, its size, turn and handedness: {i, scale, rot (radians), flip}. Chosen once by its greatest area (so it does not change while it grows), from the few nearest in area. */
export function tileFor(g) {
  const T = sun.tiles.tiles, want = Math.max(6, g.max); let a = 0; while (a < T.length - 1 && T[a][6] < want) a++;
  const span = T.length > 8 ? 2 : 1, lo = Math.max(0, a - span), hi = Math.min(T.length - 1, a + span - 1), r = rng(g.seed ^ 0x1234567);
  let i = lo + Math.floor(r() * (hi - lo + 1));
  if (g.cls && (g.cls & 7) === 7) { let best = -1, bd = 9; for (let k = 0; k < T.length; k++) { const q = Math.abs(Math.log(T[k][6] / want)); if (ROUND.has(T[k][9]) && q < bd) { bd = q; best = k; } } if (best >= 0 && bd < 1.2) i = best; }      // McIntosh class H: one round spot
  const t = T[i], joy = 0.5 * Math.abs(g.lat);                                          // Joy's law: the leading (western) end nearer the equator by about half the latitude
  let rot = t[8] > 2.2 && Math.abs(t[7]) < 45 ? joy - t[7] : 0; rot = Math.max(-14, Math.min(14, rot));
  return { i, scale: Math.sqrt(Math.max(1, g.area) / t[6]), rot: rot * DEG, flip: g.lat < 0 ? -1 : 1 };
}
const ROUND = new Set(['13736', '13111', '13238', '13989', '13831', '14579', '13433']);
