// deepstars.js: the faint stars, in two layers below the base catalogue (HYG, catalog.js: complete to about V = 7.3-9).
//
// 1. BUNDLED: Gaia DR3 to G = 12 (the 2.97 million stars that HYG does not hold) as static sky tiles in data/gaia/
//    (tools/fetch_gaia.py + tools/build_gaia.py). index.json = manifest + all-sky counts + the stars that the
//    tile record cannot hold (G < 7, proper motion > 250 mas/yr, parallax > 50 mas), kept in memory always;
//    counts.bin = star counts per HEALPix order-4 cell to G = 21.5 (render/density.js sets the limiting magnitude
//    from it);  a/ 7 <= G < 9 and b/ 9 <= G < 10 in 15-degree zones (12-byte records);  c/ 10 <= G < 11 and
//    d/ 11 <= G < 12 in 5-degree zones (10-byte records).
//    No star is in both HYG and these tiles (cross-matched when they were built).
// 2. ONLINE: below G = 12 the stars of the field on screen are asked for from a public Gaia DR3 service (see PROVIDER),
//    one request per sky tile: tiles are HEALPix nested pixels, and a tile's request is a range of Gaia source_id
//    (the id begins with the source's order-12 pixel number) plus a magnitude range. 19 half-magnitude levels, 12 to
//    21.5; each level uses, in each part of the sky, the pixel order that puts about 100-400 stars in a tile (from
//    counts.bin), so a view needs a handful of requests whether it is in the Milky Way or at a galactic pole.
//    Being a guest on someone else's server: nothing is asked for until the view has stopped moving, at most 4
//    requests at a time, at most 40 tiles wanted per view, 2,000 rows per request, every answer kept in memory
//    (LRU) and in the browser's Cache storage (so a field is fetched once per browser, not once per visit), failures
//    back off (per tile, and for the whole service after three in a row), nothing is ever asked for on a timer.
//    No cookies, no referrer, no custom headers: the request holds the sky tile and nothing else.
//    Without the service (offline, switched off in Settings, or failing) the bundled layer carries on to G = 12.
//
// 3. HOSTED (between the two): Gaia DR3 from G = 12 to 17 (154.6 million stars) as static tiles on our own storage
//    (DEEP_TILE_BASE; built by tools/build_deep.py, format in its header and in the tile set's manifest.json).
//    The same HEALPix pixels and half-magnitude levels as the online layer, so a tile is the same set of stars
//    whoever supplies it: the levels the manifest lists come from our files (no waiting for the view to settle,
//    8 at a time, requests for tiles that left the view are cancelled), the levels beyond it from the service, and
//    all of them from the service when our files cannot be reached.
//
// A selected star of either layer is referred to as {kind: 'gaia', t: tile, i}: the reference holds the tile
// itself, so it stays valid after the tile has been dropped from the cache.

import { DEG, RAD, unrefractHor, refractionDeg } from './astro.js';
import { emit, on, state } from './state.js';
import { cam, unproject } from './camera.js';
import { addPick } from './picks.js';
import { see, seeStar } from './notebook/seeing.js';
import { stars } from './catalog.js';
import { R } from './render/proj.js';
import { starAtlas, ALPHA_N } from './render/stars.js';
import { pix2vec, vec2pix, pixRadius } from './healpix.js';

const BASE = new URL('../data/gaia/', import.meta.url);
const MAX_PARALLEL = 6;                 // bundled-tile requests in flight (our own static files)
const CACHE_STARS = 450000;             // bundled stars kept in memory (about 10 MB); least-recently-seen tiles go first
const MAX_WANTED = 90;                  // never ask for more bundled tiles than this for one view
const FADE_MS = 450;                    // a tile's stars fade in when it arrives
const NB = 14, BV0 = -0.4, BV_STEP = 0.2, SPR = 64;      // sprite atlas of render/stars.js

// ---- the online service ---------------------------------------------------------------------------------
// GAVO Data Center (Zentrum fuer Astronomie Heidelberg): TAP service, table gaia.dr3lite = all 1.81 billion
// Gaia DR3 sources with the main columns. Chosen because it is the one public Gaia DR3 service found (2026-11-23)
// that answers browser requests from another origin (it echoes the Origin in Access-Control-Allow-Origin), needs
// no key, and has an index on source_id. See NOTES.md for the others that were tried.
export const PROVIDER = {
  name: 'GAVO Data Center, Heidelberg', short: 'GAVO', host: 'dc.g-vo.org',
  url: 'https://dc.g-vo.org/tap/sync', table: 'gaia.dr3lite',
};
// Levels are thin (half a magnitude) because what costs the service time is the number of rows it returns (measured:
// 0.4 s + 4.4 ms a row; the size of the patch hardly matters), so a level should hold little that the view does not need yet.
export const NET_LEVELS = [];
for (let m = 12; m < 21.5; m += 0.5) NET_LEVELS.push([m, m + 0.5]);
export const NET_END = 21;              // Gaia DR3 is essentially complete to about G = 20.5 and stops near 21
const NET_PARALLEL = 4;                 // requests in flight to the service
const NET_MAX_WANTED = 40;              // tiles wanted for one view
const NET_ROWS = 2000;                  // row cap of one request (brightest first)
const NET_TARGET = 400;                 // a level's tiles are the largest pixels expected to hold no more stars than this
const NET_SETTLE_MS = 350;              // the view must have been still this long before anything is asked for
const NET_TIMEOUT_MS = 25000;
const NET_CACHE_STARS = 600000;         // online and hosted stars kept in memory (about 50 bytes a star)
const STORE = 'planetarium-gaia-dr3-v1';      // Cache storage name
const STORE_MAX = 2500, STORE_KEEP = 2000;    // entries kept in Cache storage (measured 14 kB each: about 35 MB), oldest dropped first
const GAIA_EPOCH = 16;                  // Gaia DR3 positions are for 2016.0 = J2000 + 16 years

// ---- our own deep tiles ---------------------------------------------------------------------------------
// Where the hosted tile set lives (the folder that holds manifest.json; it must end with a slash). The folder name
// carries the version, and its tiles never change, so they can be cached for ever. `?stars=<url>` in the page's
// address reads another copy (for testing: ?stars=http://127.0.0.1:8123/gaia/v1/), `?stars=off` none at all.
export const DEEP_TILE_BASE = 'https://stars.sethhopper.com/gaia/v1/';
const HOST_PARALLEL = 8;                // requests in flight to our own files
const HOST_MAX_WANTED = 80;             // tiles wanted for one view
const HOST_TIMEOUT_MS = 15000;
const HOST_MANIFEST_MS = 6000;          // how long the first view waits to learn whether the hosted set is there
const HOST_STALE_MS = 250;              // a request whose tile has been out of view this long is cancelled
const HOST_STORE = 'planetarium-gaia-tiles-v1';       // Cache storage name
const HOST_STORE_MAX = 3000, HOST_STORE_KEEP = 2400;  // tiles kept there (about 20 kB each: 60 MB), oldest dropped first
function tileBase() {
  if (baseOverride) return baseOverride;
  let b = DEEP_TILE_BASE;
  try { const q = new URLSearchParams(location.search).get('stars'); if (q) b = /^(off|none|0)$/i.test(q) ? '' : q; } catch (e) { /* no page (Node) */ }
  return b && !b.endsWith('/') ? b + '/' : b;
}

export const deep = {
  ready: false, failed: false,
  levels: [],                            // bundled: [{id, band, magMin, tiles: [tile]}]
  special: null,                         // pseudo-tile of the stars listed in the manifest
  counts: null,                          // {m0, step, cum}: all-sky N(< m) of HYG + bundled Gaia, to 12
  map: null,                             // {order, m0, step, n, scale, allsky, data: Uint16Array | null}: counts per order-4 cell
  magEnd: 9.5,                           // where the bundled stars end (9.5 = HYG alone)
  net: { status: 'ok', fails: 0, downUntil: 0, downCount: 0, lastError: '', wanted: false, settled: true, probing: false, complete: Infinity },
  // hosted tiles: status 'none' (no address) | 'wait' (manifest on its way) | 'ok' | 'down'; levels: [{dir, m0, leaves: Map, maxOrder}]
  host: { base: '', status: 'none', levels: [], magEnd: 12, rec: null, skip: new Map(), skipIds: new Set(), fails: 0, downUntil: 0, downCount: 0, everOk: false, lastError: '', askedAt: 0 },
  stats: { hostRequests: 0, hostBytes: 0, hostCacheHits: 0, hostFailed: 0, hostAborted: 0, hostMs: [], drawn: 0, tiles: 0, loading: 0, wanted: 0, stars: 0, failed: 0, bytes: 0, requests: 0,
    netDrawn: 0, netTiles: 0, netLoading: 0, netRequests: 0, netBytes: 0, netCacheHits: 0, netFailed: 0, netStars: 0, netMs: [], lookups: 0 },
};
let inFlight = 0, cachedStars = 0, indexTries = 0;
const queue = [];

/** Color sprite for a Gaia BP-RP color. The atlas is indexed by B-V, so BP-RP is turned into an approximate
 *  B-V with the two polynomials of the Gaia DR3 documentation (table 5.9, Johnson-Cousins): B-V = (G-V) - (G-B).
 *  Used for the tint of the disc only; the info panel shows Gaia's own BP-RP. */
export function bprpToBv(x) {
  x = x < -0.5 ? -0.5 : x > 4 ? 4 : x;
  return -0.04152 + x * (0.70164 + x * (0.1448 + x * (-0.05292 + x * 0.006061)));
}
const spriteIndex = (c) => {
  if (c === null || c !== c) return 5;
  const bv = bprpToBv(c);
  return bv < BV0 ? 0 : bv > 2.1 ? NB - 1 : Math.round((bv - BV0) / BV_STEP);
};

function ncell(j, h) { return Math.max(1, Math.floor(360 * Math.cos((-90 + (j + 0.5) * h) * DEG) / h + 0.5)); }
const vecOf = (ra, dec) => { const a = ra * DEG, d = dec * DEG, c = Math.cos(d); return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)]; };
const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;

/** May the online layer be used right now? (bundle loaded, switch on, browser online, service not marked as failing) */
export function netUsable() {
  return deep.ready && !!deep.map && !!deep.map.data && state.show.netStars !== false && !offline() && deep.net.status !== 'down';
}
/** May our own deep tiles be used right now? */
export function hostUsable() {
  return deep.ready && deep.host.status === 'ok' && state.show.netStars !== false && !offline();
}
/** Faintest magnitude that can be supplied at the moment: 21 online, 17 from our own deep tiles alone, 12 from the bundle. */
export function depthNow() { return netUsable() ? NET_END : hostUsable() ? deep.host.magEnd : 12; }
/** Where the stars at limiting magnitude `lim` (past 12) come from, for the read-out. */
export function deepSource(lim) {
  return hostUsable() && lim <= deep.host.magEnd + 0.1 ? 'Gaia DR3, deep tiles' : `Gaia DR3, online (${PROVIDER.short})`;
}
/** The limit to draw with, given the limit the view should reach: held 1.2 mag past the depth to which the online
 *  stars of this window have arrived, and gliding (3 mag a second) as they do. */
let shown = null, shownAt = 0, held = false;
export function shownLimit(want) {
  const c = deep.net.complete, now = typeof performance !== 'undefined' ? performance.now() : 0;
  if (c !== Infinity) held = true;
  if (!held || shown === null || !now) { shown = want; shownAt = now; return shown; }      // nothing missing: the limit itself
  const target = Math.min(want, c + 1.2);
  if (shown !== target) {
    const step = 3 * Math.min(0.1, Math.max(0.001, (now - shownAt) / 1000));
    shown = Math.abs(target - shown) <= step ? target : shown + Math.sign(target - shown) * step;
    if (shown > want) shown = want;
    if (shown !== target) emit('render');
  }
  if (c === Infinity && shown >= want) held = false;       // caught up
  shownAt = now;
  return shown;
}
/** Why the online layer is not in use ('' when it is). */
export function netWhy() {
  if (!deep.ready || !deep.map || !deep.map.data) return 'not loaded';
  if (state.show.netStars === false) return 'switched off in Settings';
  if (offline()) return 'offline';
  if (deep.net.status === 'down') return 'the star service is not answering';
  return '';
}

/** Load the manifest and the count map (tiny next to the tiles; retried with back-off: 2 s, 4 s, ... up to a minute). */
export function initDeepStars() {
  fetch(new URL('index.json', BASE)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((m) => {
    deep.counts = m.counts; deep.magEnd = m.magEnd;
    deep.map = { ...m.map, data: null };
    deep.rec = m.record;
    deep.levels = m.levels.map((lv) => {
      const h = lv.band, tiles = [];
      lv.counts.forEach((row, j) => {
        const n = ncell(j, h), w = 360 / n, d0 = -90 + j * h;
        row.forEach((count, c) => {
          if (!count) return;
          const ctr = vecOf((c + 0.5) * w, d0 + h / 2);
          // angular radius: the farthest of the corners, the edge mid-points and (for a polar cell) the pole; plus the
          // most a star can have moved between 2000 and the date shown (250 mas/yr for 3,000 years = 0.21 deg)
          let rad = 0;
          const pts = [[c * w, d0], [(c + 1) * w, d0], [c * w, d0 + h], [(c + 1) * w, d0 + h], [(c + 0.5) * w, d0], [(c + 0.5) * w, d0 + h]];
          for (const [a, d] of pts) { const v = vecOf(a, d); rad = Math.max(rad, Math.acos(Math.min(1, ctr[0] * v[0] + ctr[1] * v[1] + ctr[2] * v[2]))); }
          tiles.push({ kind: 'zone', key: lv.id + '/' + j + '_' + c, lv: lv.id, rec: lv.rec, j, c, h, w, n: count, magMin: lv.magMin, cx: ctr[0], cy: ctr[1], cz: ctr[2], rad: rad + 0.004,
            status: 0, fails: 0, retryAt: 0, lastUsed: 0, loadedAt: 0, epoch: null, raw: null, vec: null, mag: null, spr: null, plx: null });
        });
      });
      return { id: lv.id, band: h, magMin: lv.magMin, tiles };
    });
    // the manifest's own stars as one always-loaded tile: [ra, dec, G, BP-RP | null, pmra | null, pmdec | null, parallax | null, source_id]
    const b = m.special, n = b.length;
    const t = { kind: 'list', key: 'special', lv: 'special', n, magMin: n ? b[0][2] : 99, status: 2, loadedAt: -1e9, epoch: null,
      vec: new Float32Array(3 * n), mag: new Float32Array(n), spr: new Uint8Array(n), plx: new Float32Array(n), col: new Float32Array(n),
      ra0: new Float64Array(n), dec0: new Float64Array(n), pmr: new Float32Array(n), pmd: new Float32Array(n), ids: new Array(n) };
    for (let i = 0; i < n; i++) {
      const [ra, dec, g, c, pa, pd, px, id] = b[i];
      t.ra0[i] = ra; t.dec0[i] = dec; t.mag[i] = g; t.col[i] = c === null ? NaN : c; t.spr[i] = spriteIndex(c);
      t.pmr[i] = pa === null ? NaN : pa; t.pmd[i] = pd === null ? NaN : pd; t.plx[i] = px === null ? NaN : px; t.ids[i] = id;
    }
    deep.special = t;
    deep.ready = true; deep.failed = false;
    emit('catalog', 'deep');
    initHost();
    return fetch(new URL(m.map.file, BASE)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then((buf) => {
      deep.map.data = new Uint16Array(buf);
      emit('catalog', 'deep-map');
    });
  }).catch((e) => {
    if (!deep.ready) { deep.failed = true; emit('catalog', 'deep-error'); }
    // "not found" means this copy of the site was published without data/gaia/: the app runs on HYG alone, and asking
    // again would only fill the console. Anything else (a dropped connection) is retried with back-off.
    if (/HTTP 404/.test(String(e && e.message))) { console.info('No Gaia star tiles here (data/gaia/): stars from HYG only.'); return; }
    console.warn('faint-star index failed', e);
    if (!deep.ready || !deep.map.data) setTimeout(initDeepStars, Math.min(60000, 2000 * Math.pow(2, indexTries++)));
  });
  if (typeof window !== 'undefined' && !initDeepStars.wired) {
    initDeepStars.wired = true;
    // back online: forget the failures and look again (once: this is an event, not a timer)
    window.addEventListener('online', () => { resetNet(); emit('render'); });
    window.addEventListener('offline', () => emit('render'));
    on('show', (key) => { if (key === 'netStars') resetNet(); });
    on('selection', () => { const ref = state.selected; if (ref && ref.kind === 'gaia') lookupStar(ref); });
  }
}
function resetNet() {
  const n = deep.net; n.status = 'ok'; n.fails = 0; n.downUntil = 0; n.downCount = 0; n.probing = false;
  if (deep.host.status === 'down') initHost();              // back online, or switched on again: look for our tiles once more
}

// ---- positions: proper motion from epoch 2000 to the date on screen ----------------------------------------
/** (Re)compute a tile's unit vectors for `years` after J2000 (0 when the proper-motion switch is off). */
function computeVecs(t, years) {
  const n = t.n, v = t.vec;
  if (t.kind === 'zone') {
    const dv = t.raw, REC = t.rec, fine = REC === 12, d0 = -90 + t.j * t.h, pu = deep.rec.pmUnit / 3.6e6 * years;
    for (let i = 0, o = 0; i < n; i++, o += REC) {
      const xq = dv.getUint16(o, true) + (fine ? dv.getUint8(o + 10) / 256 : 0), yq = dv.getUint16(o + 2, true) + (fine ? dv.getUint8(o + 11) / 256 : 0);
      const dec = (d0 + yq / 65536 * t.h + dv.getInt8(o + 8) * pu) * DEG, cd = Math.cos(dec);
      const ra = ((t.c + xq / 65536) * t.w + dv.getInt8(o + 7) * pu / (cd > 1e-6 ? cd : 1e-6)) * DEG;
      v[3 * i] = cd * Math.cos(ra); v[3 * i + 1] = cd * Math.sin(ra); v[3 * i + 2] = Math.sin(dec);
    }
  } else {
    const k = years / 3.6e6;
    for (let i = 0; i < n; i++) {
      const pa = t.pmr[i], pd = t.pmd[i];
      const dec = (t.dec0[i] + (pd === pd ? pd * k : 0)) * DEG, cd = Math.cos(dec);
      const ra = (t.ra0[i] + (pa === pa ? pa * k / (cd > 1e-6 ? cd : 1e-6) : 0)) * DEG;
      v[3 * i] = cd * Math.cos(ra); v[3 * i + 1] = cd * Math.sin(ra); v[3 * i + 2] = Math.sin(dec);
    }
  }
  t.epoch = years;
}

function parseTile(t, buf) {
  const REC = t.rec, dv = new DataView(buf), n = Math.floor(buf.byteLength / REC);
  const mag = new Float32Array(n), spr = new Uint8Array(n), plx = new Float32Array(n);
  for (let i = 0, o = 0; i < n; i++, o += REC) {
    mag[i] = dv.getUint16(o + 4, true) / 1000 - 2;
    const c = dv.getUint8(o + 6);
    spr[i] = spriteIndex(c === 255 ? null : c * 0.02 - 1);
    const p = dv.getUint8(o + 9);
    plx[i] = p === 255 ? NaN : p * deep.rec.plxUnit;
  }
  t.n = n; t.raw = dv; t.vec = new Float32Array(3 * n); t.mag = mag; t.spr = spr; t.plx = plx; t.epoch = null;
}

function pump() {
  while (inFlight < MAX_PARALLEL && queue.length) {
    const t = queue.shift();
    if (t.status !== 1) continue;
    inFlight++; deep.stats.requests++;
    fetch(new URL(t.lv + '/' + t.j + '_' + t.c + '.bin', BASE)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.arrayBuffer(); }).then((buf) => {
      parseTile(t, buf);
      t.status = 2; t.fails = 0; t.loadedAt = performance.now(); t.lastUsed = t.loadedAt;
      cachedStars += t.n; deep.stats.bytes += buf.byteLength;
      evict();
      emit('render');
    }).catch(() => {
      // back off: 2 s, 4 s, 8 s ... 60 s; the tile is asked for again only while it is still on screen
      t.status = 0; t.fails++; t.retryAt = performance.now() + Math.min(60000, 1000 * Math.pow(2, t.fails));
      deep.stats.failed++;
      setTimeout(() => emit('render'), t.retryAt - performance.now() + 20);
    }).finally(() => { inFlight--; pump(); });
  }
}
function evict() {
  if (cachedStars <= CACHE_STARS) return;
  const loaded = [];
  for (const lv of deep.levels) for (const t of lv.tiles) if (t.status === 2) loaded.push(t);
  loaded.sort((a, b) => a.lastUsed - b.lastUsed);
  const now = performance.now();
  for (const t of loaded) {
    if (cachedStars <= CACHE_STARS * 0.8) break;
    if (now - t.lastUsed < 1500) break;                 // on screen (or just was): keep
    if ((state.selected && state.selected.t === t) || (state.tracking && state.trackRef && state.trackRef.t === t)) continue;        // the selected star lives in it
    cachedStars -= t.n; t.status = 0; t.raw = t.vec = t.mag = t.spr = t.plx = null;
  }
}

// ---- the online layer: which tiles, and fetching them ---------------------------------------------------------
const MAP_ORDER = 4, NC4 = 12 * 4 ** MAP_ORDER;
let levelOrder = null;                         // pixel order of each level in each order-4 cell
const netTiles = new Map();                    // key -> tile
const netQueue = [];
let netInFlight = 0, netStars = 0, storePuts = 0, renderTimer = 0;
const tmp3 = [0, 0, 0];

function prepareNet() {
  const m = deep.map, d = m.data;
  levelOrder = NET_LEVELS.map(([m0, m1]) => {
    const a = Math.round((m0 - m.m0) / m.step), b = Math.round((m1 - m.m0) / m.step), out = new Uint8Array(NC4);
    for (let c = 0; c < NC4; c++) {
      const rows = Math.pow(10, d[c * m.n + b] / m.scale) - Math.pow(10, d[c * m.n + a] / m.scale);
      out[c] = MAP_ORDER + Math.min(8, Math.max(0, Math.ceil(Math.log(Math.max(rows, 1) / NET_TARGET) / Math.log(4))));
    }
    return out;
  });
}
function netTile(L, order, ipix) {
  const key = (L * 16 + order) * 268435456 + ipix;       // L < 32, order < 16, ipix < 2^28: an exact integer
  let t = netTiles.get(key);
  if (!t) {
    pix2vec(order, ipix, tmp3);
    t = { kind: 'net', key, L, order, ipix, magMin: NET_LEVELS[L][0], cx: tmp3[0], cy: tmp3[1], cz: tmp3[2], rad: pixRadius(order) + 0.0005,
      status: 0, fails: 0, retryAt: 0, lastUsed: 0, loadedAt: 0, epoch: null, n: 0, vec: null, mag: null, spr: null, plx: null };
    netTiles.set(key, t);
  }
  return t;
}
/** The request for one tile: every Gaia DR3 source of that HEALPix pixel in the level's magnitude range, brightest first. */
export function tileQuery(t) {
  const shift = BigInt(35 + 2 * (12 - t.order)), lo = BigInt(t.ipix) << shift, hi = ((BigInt(t.ipix) + 1n) << shift) - 1n;
  const [m0, m1] = NET_LEVELS[t.L];
  return `SELECT TOP ${NET_ROWS} source_id, ROUND(ra,7) AS ra, ROUND(dec,7) AS dec, ROUND(phot_g_mean_mag,3) AS g, ` +
    'ROUND(phot_bp_mean_mag-phot_rp_mean_mag,3) AS c, ROUND(parallax,3) AS plx, ROUND(pmra,2) AS pmra, ROUND(pmdec,2) AS pmdec ' +
    `FROM ${PROVIDER.table} WHERE source_id BETWEEN ${lo} AND ${hi} AND phot_g_mean_mag >= ${m0} AND phot_g_mean_mag < ${m1} ORDER BY phot_g_mean_mag`;
}
const queryUrl = (q) => PROVIDER.url + '?REQUEST=doQuery&LANG=ADQL&FORMAT=csv&QUERY=' + encodeURIComponent(q);

let storeP = null;
function store() {
  if (storeP === null) storeP = (typeof caches !== 'undefined' ? caches.open(STORE) : Promise.reject(new Error('no Cache storage'))).catch(() => null);
  return storeP;
}
/** Text of a query: from Cache storage when it has been asked before in this browser, else from the service
 *  (and then stored). Gaia DR3 is a frozen release, so a stored answer never goes stale. */
async function fetchQuery(q) {
  const url = queryUrl(q), st = deep.stats;
  const c = await store();
  if (c) {
    const hit = await c.match(url).catch(() => null);
    if (hit) { st.netCacheHits++; return hit.text(); }
  }
  const t0 = performance.now();
  st.netRequests++;
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), NET_TIMEOUT_MS);
  let text;
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    text = await r.text();
  } finally { clearTimeout(timer); }
  if (!/^source_id,/.test(text)) throw new Error('unexpected answer');
  st.netBytes += text.length;
  if (st.netMs.length < 400) st.netMs.push(Math.round(performance.now() - t0));
  if (c) {
    c.put(url, new Response(text, { headers: { 'content-type': 'text/csv' } })).then(() => { if (++storePuts % 100 === 1) trimStore(c); }).catch(() => {});
  }
  return text;
}
async function trimStore(c, max = STORE_MAX, keep = STORE_KEEP) {
  try {
    const keys = await c.keys();                 // in the order they were stored
    if (keys.length > max) for (const k of keys.slice(0, keys.length - keep)) await c.delete(k);
  } catch (e) { /* storage unavailable: fine */ }
}

function parseNet(t, text) {
  const lines = text.split(/\r?\n/);            // the service ends its lines with CR LF
  let n = 0;
  // not the stars the bright-star catalogue already draws (their source_ids come with the hosted tiles' manifest, when that is reachable)
  const skipIds = deep.host.skipIds;
  if (skipIds.size) for (let k = 1; k < lines.length; k++) if (lines[k].length > 10 && skipIds.has(lines[k].slice(0, lines[k].indexOf(',')))) lines[k] = '';
  for (let k = 1; k < lines.length; k++) if (lines[k].length > 10) n++;
  const mag = new Float32Array(n), spr = new Uint8Array(n), plx = new Float32Array(n), col = new Float32Array(n);
  const ra0 = new Float64Array(n), dec0 = new Float64Array(n), pmr = new Float32Array(n), pmd = new Float32Array(n), ids = new Array(n);
  const f = (s) => (s === '' || s === undefined ? NaN : +s);
  let i = 0;
  for (let k = 1; k < lines.length; k++) {
    if (lines[k].length <= 10) continue;
    const p = lines[k].split(',');
    const ra = +p[1], dec = +p[2], pa = f(p[6]), pd = f(p[7]);
    ids[i] = p[0]; mag[i] = +p[3]; col[i] = f(p[4]); spr[i] = spriteIndex(col[i]); plx[i] = f(p[5]); pmr[i] = pa; pmd[i] = pd;
    // Gaia's place is for 2016.0: carry it back to 2000.0 with the star's own motion, like every other catalogue here
    dec0[i] = dec - (pd === pd ? pd * GAIA_EPOCH / 3.6e6 : 0);
    ra0[i] = ra - (pa === pa ? pa * GAIA_EPOCH / 3.6e6 / Math.max(1e-6, Math.cos(dec * DEG)) : 0);
    i++;
  }
  t.n = n; t.vec = new Float32Array(3 * n); t.mag = mag; t.spr = spr; t.plx = plx; t.col = col; t.ra0 = ra0; t.dec0 = dec0; t.pmr = pmr; t.pmd = pmd; t.ids = ids;
  t.epoch = null; t.full = n >= NET_ROWS;        // full = the row cap cut it off: complete only to its last star's magnitude
}

function netFailed(e, probe) {
  const n = deep.net;
  n.fails++; n.lastError = String((e && e.message) || e);
  deep.stats.netFailed++;
  if (n.status === 'down' && !probe) return;          // a straggler of the batch that tripped the breaker: already counted
  if (n.fails >= 3 || n.status === 'down') {
    // three requests in a row have failed: stop asking altogether, and try ONE tile again after 15 s, 30 s, ... 5 min
    const was = n.status;
    n.status = 'down'; n.downUntil = performance.now() + Math.min(300000, 15000 * Math.pow(2, n.downCount++));
    for (const t of netQueue) t.status = 0;
    netQueue.length = 0;
    if (was !== 'down') emit('catalog', 'net-down');
  }
}
function netPump() {
  while (netInFlight < NET_PARALLEL && netQueue.length) {
    const t = netQueue.shift();
    if (t.status !== 1) continue;
    netInFlight++;
    fetchQuery(tileQuery(t)).then((text) => {
      parseNet(t, text);
      t.status = 2; t.fails = 0; t.loadedAt = performance.now(); t.lastUsed = t.loadedAt;
      netStars += t.n;
      const n = deep.net, was = n.status;
      n.status = 'ok'; n.fails = 0; n.downCount = 0; n.probing = false;
      if (was === 'down') emit('catalog', 'net-up');
      netEvict();
      emit('render');
    }).catch((e) => {
      t.status = 0; t.fails++; t.retryAt = performance.now() + Math.min(300000, 4000 * Math.pow(2, t.fails));
      const probe = deep.net.probing;
      deep.net.probing = false;
      netFailed(e, probe);
      emit('render');
    }).finally(() => { netInFlight--; netPump(); });
  }
}
function netEvict() {
  const now = performance.now();
  if (netTiles.size > 6000) for (const [k, t] of netTiles) if (t.status === 0 && now - t.lastUsed > 5000) netTiles.delete(k);
  if (netStars <= NET_CACHE_STARS) return;
  const loaded = [...netTiles.values()].filter((t) => t.status === 2).sort((a, b) => a.lastUsed - b.lastUsed);
  for (const t of loaded) {
    if (netStars <= NET_CACHE_STARS * 0.8) break;
    if (now - t.lastUsed < 1500) break;
    netStars -= t.n; netTiles.delete(t.key);       // a selected star keeps its tile alive through the reference
  }
}
function renderIn(ms) {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = 0; emit('render'); }, ms);
}

// ---- our own deep tiles: manifest, which tile, fetching, decoding ------------------------------------------------
const hostQueue = [], hostFlying = new Set();
let hostStoreP = null, hostPuts = 0, hostGen = 0;
function hostStore() {
  if (hostStoreP === null) hostStoreP = (typeof caches !== 'undefined' ? caches.open(HOST_STORE) : Promise.reject(new Error('no Cache storage'))).catch(() => null);
  return hostStoreP;
}
/** The levels of a tile-set manifest: for each, the quadtree's leaves as a Map (order * 2^28 + ipix -> 1 a tile, 0 no stars).
 *  Throws when the manifest is not one this code can read. */
export function readDeepManifest(m) {
  if (!m || m.format !== 'gaia-deep-tiles' || m.version !== 1 || m.magStart !== NET_LEVELS[0][0] || !Array.isArray(m.levels)) throw new Error('not a deep-tile manifest (version 1)');
  const levels = m.levels.map((lv, L) => {
    if (!NET_LEVELS[L] || lv.m0 !== NET_LEVELS[L][0] || lv.m1 !== NET_LEVELS[L][1]) throw new Error('manifest levels do not match');
    const leaves = new Map(), tree = lv.tree;
    let pos = 0, maxOrder = m.rootOrder;
    const walk = (order, ipix) => {
      const ch = tree.charCodeAt(pos++);
      if (ch === 50) { for (let k = 0; k < 4; k++) walk(order + 1, 4 * ipix + k); }           // '2'
      else if (ch === 49 || ch === 48) { leaves.set(order * 268435456 + ipix, ch - 48); if (order > maxOrder) maxOrder = order; }
      else throw new Error('manifest tree is damaged');
    };
    for (let r = 0; r < 12 * 4 ** m.rootOrder; r++) walk(m.rootOrder, r);
    if (pos !== tree.length) throw new Error('manifest tree is damaged');
    return { dir: lv.dir, m0: lv.m0, m1: lv.m1, stars: lv.stars, tiles: lv.tiles, leaves, minOrder: m.rootOrder, maxOrder };
  });
  // stars the app already draws from its bright-star catalogue: by index within a tile, and by source_id for the service's rows
  const skip = new Map();
  for (const key of Object.keys(m.skip || {})) { const [L, o, p] = key.split('/').map(Number); skip.set((L * 16 + o) * 268435456 + p, m.skip[key]); }
  return { levels, magEnd: levels.length ? levels[levels.length - 1].m1 : m.magStart, rec: m.record, skip, skipIds: new Set(m.skipIds || []) };
}
/** Fetch the hosted set's manifest. One request; a set that has never answered is not asked again (until the browser
 *  comes back online or the page is reloaded), one that worked and then failed is looked for again with back-off. */
function initHost() {
  const host = deep.host, gen = ++hostGen;
  host.base = tileBase();
  if (!host.base || typeof performance === 'undefined') { host.status = 'none'; return; }
  host.status = host.everOk ? 'down' : 'wait'; host.askedAt = performance.now();
  host.downUntil = host.askedAt + Math.min(300000, 30000 * Math.pow(2, host.downCount++));
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), HOST_MANIFEST_MS);
  fetch(host.base + 'manifest.json', { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal })
    .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((m) => {
      if (gen !== hostGen) return;
      const h = readDeepManifest(m);
      host.levels = h.levels; host.magEnd = h.magEnd; host.rec = h.rec; host.skip = h.skip; host.skipIds = h.skipIds;
      host.status = 'ok'; host.everOk = true; host.fails = 0;             // downCount is cleared by the first tile that arrives
      emit('catalog', 'host-up');
    })
    .catch((e) => {
      if (gen !== hostGen) return;
      host.status = 'down'; host.lastError = String((e && e.message) || e);
      if (!host.everOk) console.info('Deep-star tiles not reachable at ' + host.base + ' (' + host.lastError + '): faint stars from ' + PROVIDER.short + ' instead.');
      emit('catalog', 'host-down');
    })
    .finally(() => { clearTimeout(timer); emit('render'); });
}
/** The hosted tile of level L that holds order-12 pixel p12 (null: the manifest says there are no stars there). */
function hostTile(L, p12) {
  const lv = deep.host.levels[L], leaves = lv.leaves;
  for (let o = lv.minOrder; o <= lv.maxOrder; o++) {
    const ipix = p12 >>> (2 * (12 - o)), v = leaves.get(o * 268435456 + ipix);
    if (v === 1) return netTile(L, o, ipix);
    if (v === 0) return null;
  }
  return null;
}
/** Decode a hosted tile (format: tools/build_deep.py) into the same arrays an online tile has. */
export function parseHosted(t, buf, rec, m0, skip) {
  const dv = new DataView(buf);
  if (buf.byteLength < rec.header || dv.getUint32(0, false) !== 0x47445431) throw new Error('not a deep tile');         // 'GDT1'
  const n = dv.getUint32(4, true), nx = dv.getUint32(8, true);
  if (buf.byteLength !== rec.header + rec.bytes * n + rec.exception * nx || dv.getUint32(12, true) !== t.ipix || dv.getUint8(16) !== t.order || dv.getUint8(17) !== t.L) throw new Error('deep tile does not match its name');
  const u8 = new Uint8Array(buf), H = rec.header, o = H + 4 * n;
  const mag = new Float32Array(n), spr = new Uint8Array(n), plx = new Float32Array(n), col = new Float32Array(n);
  const ra0 = new Float64Array(n), dec0 = new Float64Array(n), pmr = new Float32Array(n), pmd = new Float32Array(n);
  // the tile's tangent plane: centre c, east e = unit(z x c), north = c x e
  const c0 = t.cx, c1 = t.cy, c2 = t.cz, h = Math.hypot(c0, c1), e0 = -c1 / h, e1 = c0 / h;
  const n0 = -c2 * e1, n1 = c2 * e0, n2 = c0 * e1 - c1 * e0;
  const half = 1 << (rec.posBits - 1), k = Math.tan(rec.reach * Math.sqrt(Math.PI / 3) / (1 << t.order) + rec.posMargin) / half;
  const [pa, pb] = rec.pm, [xa, xb] = rec.plx;
  for (let i = 0; i < n; i++) {
    const hi = u8[o + i];
    const xi = ((u8[H + 2 * i] | u8[H + 2 * i + 1] << 8 | (hi & 15) << 16) - half) * k, eta = ((u8[H + 2 * n + 2 * i] | u8[H + 2 * n + 2 * i + 1] << 8 | (hi >> 4) << 16) - half) * k;
    const x = c0 + xi * e0 + eta * n0, y = c1 + xi * e1 + eta * n1, z = c2 + eta * n2;
    let ra = Math.atan2(y, x) * RAD; if (ra < 0) ra += 360;
    ra0[i] = ra; dec0[i] = Math.atan2(z, Math.hypot(x, y)) * RAD;
    mag[i] = m0 + u8[o + n + i] * rec.gStep;
    const cq = u8[o + 2 * n + i];
    col[i] = cq === 255 ? NaN : rec.colMin + cq * rec.colStep; spr[i] = spriteIndex(col[i]);
    const qa = dv.getInt8(o + 3 * n + i), qd = dv.getInt8(o + 4 * n + i), qp = u8[o + 5 * n + i];
    pmr[i] = qa === -128 || qa === 127 ? NaN : (qa < 0 ? -1 : 1) * Math.abs(qa) * (pa + pb * Math.abs(qa));
    pmd[i] = qd === -128 || qd === 127 ? NaN : (qd < 0 ? -1 : 1) * Math.abs(qd) * (pa + pb * Math.abs(qd));
    plx[i] = qp >= 254 ? NaN : qp * (xa + xb * qp);
  }
  // the few stars whose motion or parallax the one-byte codes cannot hold: their exact values
  for (let j = 0, q = H + rec.bytes * n; j < nx; j++, q += rec.exception) {
    const i = dv.getUint32(q, true);
    if (i >= n) throw new Error('deep tile is damaged');
    pmr[i] = dv.getFloat32(q + 4, true); pmd[i] = dv.getFloat32(q + 8, true); plx[i] = dv.getFloat32(q + 12, true);
  }
  let m = n;
  if (skip && skip.length) {
    // leave out the stars the bright-star catalogue already draws (indices from the manifest, ascending)
    m = 0;
    for (let i = 0, k = 0; i < n; i++) {
      while (k < skip.length && skip[k] < i) k++;
      if (skip[k] === i) continue;
      mag[m] = mag[i]; spr[m] = spr[i]; plx[m] = plx[i]; col[m] = col[i]; ra0[m] = ra0[i]; dec0[m] = dec0[i]; pmr[m] = pmr[i]; pmd[m] = pmd[i]; m++;
    }
  }
  t.n = m; t.vec = new Float32Array(3 * m); t.mag = mag; t.spr = spr; t.plx = plx; t.col = col; t.ra0 = ra0; t.dec0 = dec0; t.pmr = pmr; t.pmd = pmd; t.ids = null;
  t.epoch = null; t.full = false; t.hosted = true;
}
async function fetchHosted(t) {
  const host = deep.host, st = deep.stats, url = host.base + host.levels[t.L].dir + '/' + t.order + '/' + t.ipix + '.bin';
  const c = await hostStore();
  if (c) {
    const hit = await c.match(url).catch(() => null);
    if (hit) { st.hostCacheHits++; return hit.arrayBuffer(); }
  }
  const t0 = performance.now();
  st.hostRequests++;
  const ctl = t.ctl = new AbortController(), timer = setTimeout(() => { t.timedOut = true; ctl.abort(); }, HOST_TIMEOUT_MS);
  let buf;
  try {
    const r = await fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    buf = await r.arrayBuffer();
  } finally { clearTimeout(timer); t.ctl = null; }
  st.hostBytes += buf.byteLength;
  if (st.hostMs.length < 2000) st.hostMs.push(Math.round(performance.now() - t0));
  if (c) {
    c.put(url, new Response(buf.slice(0), { headers: { 'content-type': 'application/octet-stream' } }))
      .then(() => { if (++hostPuts % 100 === 1) trimStore(c, HOST_STORE_MAX, HOST_STORE_KEEP); }).catch(() => {});
  }
  return buf;
}
function hostPump() {
  const host = deep.host;
  while (hostFlying.size < HOST_PARALLEL && hostQueue.length) {
    const t = hostQueue.shift();
    if (t.status !== 1) continue;
    hostFlying.add(t); t.timedOut = false;
    fetchHosted(t).then((buf) => {
      parseHosted(t, buf, host.rec, host.levels[t.L].m0, host.skip.get(t.key));
      t.status = 2; t.fails = 0; t.loadedAt = performance.now(); t.lastUsed = t.loadedAt;
      netStars += t.n; host.fails = 0; host.downCount = 0;
      netEvict();
    }).catch((e) => {
      t.status = 0;
      if (e && e.name === 'AbortError' && !t.timedOut) { deep.stats.hostAborted++; return; }       // we cancelled it: the view moved on
      t.fails++; t.retryAt = performance.now() + Math.min(300000, 4000 * Math.pow(2, t.fails));
      deep.stats.hostFailed++; host.lastError = String((e && e.message) || e);
      if (++host.fails >= 3 && host.status === 'ok') {
        // three in a row: stop using our files (the service takes over in the next frame); look for them again after 30 s, 60 s ... 5 min
        host.status = 'down'; host.downUntil = performance.now() + Math.min(300000, 30000 * Math.pow(2, host.downCount++));
        for (const q of hostQueue) q.status = 0;
        hostQueue.length = 0;
        for (const q of hostFlying) if (q.ctl) q.ctl.abort();
        emit('catalog', 'host-down');
      }
    }).finally(() => { hostFlying.delete(t); hostPump(); emit('render'); });
  }
}

/** For timing tests from the console (planetarium.deep.debug): forget the deep stars in memory, optionally the browser's
 *  stored copies too, and optionally read the hosted tiles from another address ('' = none: the service for everything). */
deep.debug = async ({ storage = false, base } = {}) => {
  for (const t of hostFlying) if (t.ctl) t.ctl.abort();
  for (const t of hostQueue) t.status = 0;
  for (const t of netQueue) t.status = 0;
  hostQueue.length = 0; netQueue.length = 0; netTiles.clear(); netStars = 0;
  if (storage && typeof caches !== 'undefined') { await caches.delete(STORE); await caches.delete(HOST_STORE); storeP = null; hostStoreP = null; }
  if (base !== undefined) {
    const host = deep.host;
    hostGen++; host.base = base; host.levels = []; host.everOk = false; host.fails = 0; host.downCount = 0; host.status = 'none';
    if (base) { baseOverride = base; initHost(); }
  }
  emit('render');
};
let baseOverride = '';

// is the view moving? (drag, zoom, fly-to): nothing is asked of the service until it has been still for a moment
const last = { f0: 0, f1: 0, f2: 1, fov: 0, t: 0, movedAt: 0 };
function viewSettled(f0, f1, f2, now) {
  const dt = Math.max(1, now - last.t) / 1000;
  const move = Math.acos(Math.min(1, f0 * last.f0 + f1 * last.f1 + f2 * last.f2)) * RAD / cam.fov, zoom = Math.abs(Math.log(cam.fov / (last.fov || cam.fov)));
  // moving = more than 12 % of the field per second, or the zoom changing by more than 12 % per second
  if (dt < 1.5 ? (move / dt > 0.12 || zoom / dt > 0.12) : (move > 0.3 || zoom > 0.3)) last.movedAt = now;
  last.f0 = f0; last.f1 = f1; last.f2 = f2; last.fov = cam.fov; last.t = now;
  return now - last.movedAt >= NET_SETTLE_MS;
}

const hostWant = [];
const want = [], GX = 17, GY = 10, nPts = new Uint16Array(NET_LEVELS.length), nGot = new Uint16Array(NET_LEVELS.length);
/** Collect the online tiles that overlap the view cone into `visible`, and queue the missing ones. */
function netCollect(lim, f0, f1, f2, now, visible) {
  const st = deep.stats, net = deep.net;
  st.netLoading = netInFlight + netQueue.length + hostFlying.size + hostQueue.length;
  net.wanted = false; net.complete = Infinity;
  const settled = viewSettled(f0, f1, f2, now);
  net.settled = settled;
  if (lim <= NET_LEVELS[0][0] + 0.1 || !deep.map || !deep.map.data) return false;
  if (state.show.netStars === false) return false;      // switched off: the built-in catalog only, even if online stars are still in memory
  if (!levelOrder) prepareNet();
  const off = offline(), host = deep.host;
  // our own tiles: until their manifest has answered (or failed) nobody is asked for anything
  if (host.status === 'wait') { if (now - host.askedAt < HOST_MANIFEST_MS + 500) { net.wanted = true; net.complete = NET_LEVELS[0][0]; renderIn(120); return false; } host.status = 'down'; }
  if (host.status === 'down' && host.everOk && !off && now >= host.downUntil) initHost();     // they were there before: look again (back-off)
  const HL = hostUsable() ? host.levels.length : 0;
  let fading = false, pending = 0, hostPending = 0;
  want.length = 0; hostWant.length = 0;
  // Which tiles does the window touch? Every tile asked for costs the service work, so not "every tile near the view
  // cone" but exactly those under a grid of points across the window (17 x 10, a little beyond its edges, skipping
  // points below the horizon): each point is turned back into a true J2000 direction and looked up in the pixelisation.
  // A tile is never much smaller than a third of the window when its level comes into use, so the grid cannot step over one.
  const { frame, refr, ground } = R, Mhj = frame.Mhj, W = cam.w, H = cam.h, PAD = 14;
  const nL = NET_LEVELS.length;
  let Lmax = 0;
  nPts.fill(0); nGot.fill(0);
  // a level is asked for once the limit is 0.1 mag into it: the first tenth of a magnitude would be drawn at under a quarter opacity
  while (Lmax < nL && NET_LEVELS[Lmax][0] + 0.1 < lim) Lmax++;
  for (let j = 0; j < GY; j++) for (let i = 0; i < GX; i++) {
    let h = unproject(-PAD + (W + 2 * PAD) * i / (GX - 1), -PAD + (H + 2 * PAD) * j / (GY - 1));
    if (ground && h[2] < -0.005) continue;
    if (refr) h = unrefractHor(h);
    const p12 = vec2pix(12, Mhj[0] * h[0] + Mhj[1] * h[1] + Mhj[2] * h[2], Mhj[3] * h[0] + Mhj[4] * h[1] + Mhj[5] * h[2], Mhj[6] * h[0] + Mhj[7] * h[1] + Mhj[8] * h[2]);
    const c4 = p12 >>> 16;
    for (let L = 0; L < Lmax; L++) {
      // one supplier per level in any one frame (ours for the levels its manifest lists, else the service), so no star is drawn twice
      const t = L < HL ? hostTile(L, p12) : netTile(L, levelOrder[L][c4], p12 >>> (2 * (12 - levelOrder[L][c4])));
      nPts[L]++;
      if (t === null) { nGot[L]++; continue; }          // our manifest says: no stars in this pixel at this level
      if (t.status === 2) nGot[L]++;
      if (t.lastUsed === now) continue;                 // already met at another grid point
      t.lastUsed = now;
      if (t.status === 2) { visible.push(t); if (now - t.loadedAt < FADE_MS) fading = true; }
      else if (t.status === 1) { if (t.via === 'host') hostPending++; else pending++; }
      else if (now >= t.retryAt) (L < HL ? hostWant : want).push(t);
    }
  }
  // our own files: asked for at once (no settling: they cost nobody anything), brighter levels first, then nearest the centre;
  // what has left the view is dropped from the queue, and cancelled if already on its way
  for (let k = hostQueue.length - 1; k >= 0; k--) if (hostQueue[k].lastUsed !== now) { hostQueue[k].status = 0; hostQueue.splice(k, 1); }
  for (const t of hostFlying) if (t.lastUsed !== now && now - t.lastUsed > HOST_STALE_MS && t.ctl) t.ctl.abort();
  if (hostWant.length && !off) {
    net.wanted = true;
    hostWant.sort((a, b) => a.L - b.L || (f0 * b.cx + f1 * b.cy + f2 * b.cz) - (f0 * a.cx + f1 * a.cy + f2 * a.cz));
    for (const t of hostWant.slice(0, Math.max(0, HOST_MAX_WANTED - hostPending))) { t.status = 1; t.via = 'host'; hostQueue.push(t); }
  }
  if (hostQueue.length) hostPump();
  // How deep is the window actually covered? The first level with stars on less than half of it: sky.js holds the
  // limit shown near that magnitude until the tiles arrive, so the stars already there do not swell while the
  // fainter ones are still on their way.
  for (let L = 0; L < Lmax; L++) if (nGot[L] < 0.5 * nPts[L]) { net.complete = NET_LEVELS[L][0]; break; }
  // drop requests for tiles that scrolled out of view before their turn came
  for (let k = netQueue.length - 1; k >= 0; k--) if (netQueue[k].lastUsed !== now) { netQueue[k].status = 0; netQueue.splice(k, 1); }
  if (want.length && !off) {
    net.wanted = true;
    if (net.status === 'down') {
      // the service was failing: one tile, once the back-off has run out, to see whether it is back
      if (now >= net.downUntil && settled && !net.probing && netInFlight === 0) { const t = want[0]; net.probing = true; t.status = 1; netQueue.push(t); }
      else if (!net.probing) renderIn(Math.max(400, net.downUntil - now + 50));
    } else if (!settled) renderIn(NET_SETTLE_MS + 30);
    else {
      // brighter levels first, then nearest the centre of the view; a view that would need a flood of tiles gets the nearest ones only
      want.sort((a, b) => a.L - b.L || (f0 * b.cx + f1 * b.cy + f2 * b.cz) - (f0 * a.cx + f1 * a.cy + f2 * a.cz));
      for (const t of want.slice(0, Math.max(0, NET_MAX_WANTED - pending - netQueue.length))) { t.status = 1; t.via = 'net'; netQueue.push(t); }
    }
  }
  if (netQueue.length) netPump();
  st.netLoading = netInFlight + netQueue.length + hostFlying.size + hostQueue.length;
  return fading;
}

// ---- a clicked star: the full Gaia DR3 record ------------------------------------------------------------------
/** Ask the service for the complete record of a selected star (source_id, exact G, parallax with its error, proper
 *  motion). One small request per click, cached like the tiles; without the service the panel shows what the tile holds. */
function lookupStar(ref) {
  const t = ref.t, i = ref.i;
  if (!t.extra) t.extra = new Map();
  if (t.extra.has(i) || !netUsable()) return;
  const s = deepRecord(ref);
  const cols = 'source_id, ra, dec, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag, parallax, parallax_error, pmra, pmdec, radial_velocity';
  let q;
  if (s.id) q = `SELECT ${cols} FROM ${PROVIDER.table} WHERE source_id = ${s.id}`;
  else {
    // a bundled star has no id: look within 3 arcsec of where it was in 2016 (the tile stores the place to 0.3 arcsec)
    const k = GAIA_EPOCH / 3.6e6, dec = s.dec0 + (s.pmdec || 0) * k, ra = s.ra0 + (s.pmra || 0) * k / Math.max(1e-6, Math.cos(dec * DEG));
    q = `SELECT TOP 8 ${cols} FROM ${PROVIDER.table} WHERE 1=CONTAINS(POINT('ICRS', ra, dec), CIRCLE('ICRS', ${ra.toFixed(6)}, ${dec.toFixed(6)}, 0.00084))`;
  }
  t.extra.set(i, { state: 'pending' });
  deep.stats.lookups++;
  fetchQuery(q).then((text) => {
    const rows = text.split(/\r?\n/).slice(1).filter((l) => l.length > 10).map((l) => l.split(','));
    // the row whose G matches the tile's (to the tile's rounding); a neighbour of another brightness is not it
    let best = null;
    for (const p of rows) { const dg = Math.abs(+p[3] - s.mag); if (dg < 0.02 && (!best || dg < best.dg)) best = { dg, p }; }
    if (!best) { t.extra.set(i, { state: 'none' }); return; }
    const p = best.p, f = (x) => (x === '' || x === undefined ? null : +x);
    t.extra.set(i, { state: 'done', id: p[0], ra: +p[1], dec: +p[2], g: +p[3], bp: f(p[4]), rp: f(p[5]), plx: f(p[6]), plxErr: f(p[7]), pmra: f(p[8]), pmdec: f(p[9]), rv: f(p[10]) });
  }).catch(() => { t.extra.set(i, { state: 'failed' }); }).finally(() => emit('gaia-info'));
}

/** Plain-object view of one deep star. Every number is Gaia DR3's: from the full record when the online look-up has
 *  answered (`exact`), else from the tile (bundled tiles round G to 0.001, BP-RP to 0.02, proper motion to 2 mas/yr,
 *  parallax to 0.2 mas, the place to 0.3 arcsec; hosted tiles G to 0.002, BP-RP to 0.02, proper motion to 0.2-4 mas/yr,
 *  parallax to 0.04 mas and up, the place to 0.03 arcsec, and like the bundled ones they hold no source_id). */
export function deepRecord(ref) {
  const t = ref.t, i = ref.i;
  const s = { mag: t.mag[i], vec: [t.vec[3 * i], t.vec[3 * i + 1], t.vec[3 * i + 2]], src: t.hosted ? 'hosted' : t.kind === 'net' ? 'online' : 'bundled', id: null, exact: null, lookup: '', rounded: false };
  if (t.kind === 'zone') {
    const dv = t.raw, o = i * t.rec, c = dv.getUint8(o + 6), p = dv.getUint8(o + 9), fine = t.rec === 12;
    s.ra0 = (t.c + (dv.getUint16(o, true) + (fine ? dv.getUint8(o + 10) / 256 : 0)) / 65536) * t.w;
    s.dec0 = -90 + t.j * t.h + (dv.getUint16(o + 2, true) + (fine ? dv.getUint8(o + 11) / 256 : 0)) / 65536 * t.h;
    s.col = c === 255 ? null : c * 0.02 - 1; s.pmra = dv.getInt8(o + 7) * deep.rec.pmUnit; s.pmdec = dv.getInt8(o + 8) * deep.rec.pmUnit;
    s.plx = p === 255 ? null : p * deep.rec.plxUnit; s.rounded = true;
  } else {
    const nn = (v) => (v === v ? v : null);
    s.ra0 = t.ra0[i]; s.dec0 = t.dec0[i]; s.col = nn(t.col[i]); s.pmra = nn(t.pmr[i]); s.pmdec = nn(t.pmd[i]); s.plx = nn(t.plx[i]); s.id = t.ids ? t.ids[i] : null; s.rounded = !!t.hosted;
  }
  s.plxErr = null; s.rv = null;
  const x = t.extra && t.extra.get(i);
  if (x && x.state === 'done') {
    s.exact = x; s.id = x.id; s.mag = x.g; s.plx = x.plx; s.plxErr = x.plxErr; s.pmra = x.pmra; s.pmdec = x.pmdec; s.rv = x.rv; s.rounded = false;
    s.col = x.bp !== null && x.rp !== null ? x.bp - x.rp : null;
  }
  s.lookup = x ? x.state : !netUsable() ? 'off' : '';
  return s;
}
export const deepName = (ref) => { const s = deepRecord(ref); return s.id ? 'Gaia DR3 ' + s.id : 'Gaia DR3 star, G ' + s.mag.toFixed(2); };
export const deepKey = (ref) => 'g' + ref.t.key + ':' + ref.i;
/** Apparent parallax (mas) of a deep star for objects.js (0 when Gaia has none or it is negative). */
export const deepParallax = (ref) => { const w = ref.t.plx[ref.i]; return w > 0 ? w : 0; };

// ---- drawing --------------------------------------------------------------------------------------
const visible = [];
export function drawDeepStars(ctx) {
  const st = deep.stats;
  st.drawn = 0; st.wanted = 0; st.netDrawn = 0; st.netTiles = 0;
  if (!deep.ready) return;
  const { frame, sky, atmo, refr, ground } = R;
  const lim = sky.limMag;
  const M = frame.Mjh, V = cam.V;
  const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
  // forward axis of the view in J2000, and the angular radius of the view (as in render/stars.js)
  const f0 = V[6] * m0 + V[7] * m3 + V[8] * m6, f1 = V[6] * m1 + V[7] * m4 + V[8] * m7, f2 = V[6] * m2 + V[7] * m5 + V[8] * m8;
  const viewR = Math.min(Math.PI, Math.acos(cam.zMin < -1 ? -1 : cam.zMin) + 0.02);
  const now = performance.now();
  visible.length = 0;
  if (deep.special.n && deep.special.magMin < lim) visible.push(deep.special);
  let fading = false;
  for (const lv of deep.levels) {
    if (lv.magMin >= lim) continue;
    const wanted = [];
    for (const t of lv.tiles) {
      const dot = f0 * t.cx + f1 * t.cy + f2 * t.cz;
      const reach = viewR + t.rad;
      if (reach < Math.PI && dot < Math.cos(reach)) continue;
      t.lastUsed = now;
      if (t.status === 2) { visible.push(t); if (now - t.loadedAt < FADE_MS) fading = true; }
      else if (t.status === 0 && now >= t.retryAt) wanted.push([dot, t]);
      else if (t.status === 1) st.wanted++;
    }
    if (wanted.length) {
      // nearest the centre of the view first; a view that would need a flood of tiles gets the nearest ones only
      wanted.sort((a, b) => b[0] - a[0]);
      for (const [, t] of wanted.slice(0, Math.max(0, MAX_WANTED - st.wanted))) { t.status = 1; queue.push(t); st.wanted++; }
    }
  }
  // drop requests for tiles that scrolled out of view before their turn came
  for (let k = queue.length - 1; k >= 0; k--) if (queue[k].lastUsed !== now) { queue[k].status = 0; queue.splice(k, 1); }
  if (queue.length) pump();
  st.loading = inFlight + queue.length;
  const nBundled = visible.length;
  if (netCollect(sky.limWant, f0, f1, f2, now, visible)) fading = true;       // asks for what the view should reach, not what is shown yet
  st.netTiles = visible.length - nBundled; st.netStars = netStars; st.tiles = nBundled; st.stars = cachedStars;
  if (!visible.length) return;

  const atlas = starAtlas();
  const bx = frame.beta[0], by = frame.beta[1], bz = frame.beta[2];
  const zMin = cam.zMin, s2 = 2 * cam.s, cx = cam.cx, cy = cam.cy, W = cam.w, H = cam.h;
  const zLoose = Math.cos(viewR);
  const minZ = ground ? -0.03 : -2;
  // proper motion for the date on screen (catalog.js keeps the epoch; 0 when the switch is off), and annual parallax
  // (labs) when zoomed in: each star shifts opposite to the Earth's place by its Gaia parallax
  const years = stars.epochYears || 0;
  const par = frame.parallax && cam.fov < 5, PW = Math.PI / 648000 / 1000;
  const ex = par ? frame.epos[0] * PW : 0, ey = par ? frame.epos[1] * PW : 0, ez = par ? frame.epos[2] * PW : 0;
  let drawn = 0, netDrawn = 0;
  for (let q = 0; q < visible.length; q++) {
    const t = visible[q];
    if (t.epoch !== years) computeVecs(t, years);
    const v = t.vec, mg = t.mag, sp = t.spr, px = t.plx, n = t.n;
    const fade = Math.min(1, (now - t.loadedAt) / FADE_MS);
    const before = drawn;
    for (let i = 0; i < n; i++) {
      let mag = mg[i];
      if (mag > lim) break;
      let x = v[3 * i] + bx, y = v[3 * i + 1] + by, z = v[3 * i + 2] + bz;
      if (f0 * x + f1 * y + f2 * z < zLoose) continue;
      if (par) { const w = px[i]; if (w > 0) { x -= ex * w; y -= ey * w; z -= ez * w; } }
      // back to unit length: adding the aberration vector changes it by up to 1e-4, and the refraction step below takes asin(hz),
      // which turned that into an altitude error of (1e-4 x tan alt): 10 arcsec at 40 deg, an arcminute near the zenith
      { const f = 1 / Math.sqrt(x * x + y * y + z * z); x *= f; y *= f; z *= f; }
      let hz = m6 * x + m7 * y + m8 * z;
      if (hz < minZ) continue;
      let hx = m0 * x + m1 * y + m2 * z, hy = m3 * x + m4 * y + m5 * z;
      if (refr || atmo) {
        let alt = Math.asin(hz > 1 ? 1 : hz) * RAD;
        if (refr) {
          const rf = refractionDeg(alt);
          const a2 = (alt + rf) * DEG, c = Math.sqrt(hx * hx + hy * hy);
          if (c > 1e-9) { const k = Math.cos(a2) / c; hx *= k; hy *= k; hz = Math.sin(a2); }
          alt += rf;
        }
        if (atmo && alt < 40) {
          const am = 1 / (Math.sin((alt < 0 ? 0 : alt) * DEG) + 0.50572 * Math.pow((alt < 0 ? 0 : alt) + 6.07995, -1.6364));
          mag += 0.2 * (am - 1);
          if (mag > lim) continue;
        }
      }
      if (ground && hz < 0) continue;
      const vz = V[6] * hx + V[7] * hy + V[8] * hz;
      if (vz < zMin) continue;
      const k = s2 / (1 + vz);
      const sx = cx + k * (V[0] * hx + V[1] * hy + V[2] * hz);
      if (sx < -12 || sx > W + 12) continue;
      const sy = cy - k * (V[3] * hx + V[4] * hy + V[5] * hz);
      if (sy < -12 || sy > H + 12) continue;
      const dm = lim - mag;
      const r = Math.min(10, 0.85 + 0.48 * Math.pow(dm, 1.1));
      const half = r / 0.34;
      const al = Math.round((dm < 1.5 ? 0.08 + 0.92 * Math.pow(dm / 1.5, 0.6) : 1) * fade * ALPHA_N) - 1;
      if (al < 0) continue;
      drawn++;
      if (see.on) { seeStar(ctx, atlas, sp[i], al, sx, sy, dm, v[3 * i], v[3 * i + 1], half, mag, { kind: 'gaia', t, i }); continue; }      // lab notebook: seeing disc + simulated noise
      ctx.drawImage(atlas, sp[i] * SPR, al * SPR, SPR, SPR, sx - half, sy - half, 2 * half, 2 * half);
      addPick(sx, sy, r, mag, { kind: 'gaia', t, i });
    }
    if (t.kind === 'net') netDrawn += drawn - before;
  }
  st.drawn = drawn; st.netDrawn = netDrawn;
  if (fading) emit('render');
}
