// deepstars.js: the faint stars. The base catalogue (HYG, catalog.js) is complete only to about magnitude
// 7.3-9; this module adds the rest of Tycho-2 (2.43 million stars to V of about 11.5-12) as sky tiles that
// are fetched only for the part of the sky on screen, and only when the limiting magnitude needs them.
//
// Files (tools/build_tycho.py): data/tycho/index.json  manifest + all-sky star counts + the 4,513 stars
//   brighter than V = 8 that HYG lacks (kept in memory always);
//   data/tycho/a/<band>_<cell>.bin  8 <= V < 10 in 15-degree tiles;   data/tycho/b/...  V >= 10 in 5-degree tiles.
// No star is in both catalogues (cross-matched when the tiles were built), so nothing is drawn twice.
//
// A selected tile star is referred to as {kind: 'tyc', t: tile, i}: the reference holds the tile itself,
// so it stays valid after the tile has been dropped from the cache.

import { DEG, RAD } from './astro.js';
import { emit, state } from './state.js';
import { cam } from './camera.js';
import { addPick } from './picks.js';
import { R } from './render/proj.js';
import { starAtlas, ALPHA_N } from './render/stars.js';

const BASE = new URL('../data/tycho/', import.meta.url);
const REC = 11;                         // bytes per star in a tile file
const MAX_PARALLEL = 6;                 // tile requests in flight
const CACHE_STARS = 450000;             // stars kept in memory (about 9 MB); least-recently-seen tiles go first
const MAX_WANTED = 90;                  // never ask for more tiles than this for one view
const FADE_MS = 450;                    // a tile's stars fade in when it arrives
const NB = 14, BV0 = -0.4, BV_STEP = 0.2, SPR = 64;      // sprite atlas of render/stars.js

export const deep = {
  ready: false, failed: false,
  levels: [],                            // [{id, band, magMin, tiles: [tile]}]
  bright: null,                          // pseudo-tile of the bright stars from the manifest
  counts: null,                          // {m0, step, cum, peakMag}: all-sky N(< m) of HYG + Tycho-2
  magEnd: 9,                             // where the catalogue thins out (peak of the differential counts; 9 = HYG alone)
  stats: { drawn: 0, tiles: 0, loading: 0, wanted: 0, stars: 0, failed: 0, bytes: 0, requests: 0 },
};
let inFlight = 0, cachedStars = 0, indexTries = 0;
const queue = [];

const spriteIndex = (bv) => (bv === null ? 5 : bv < BV0 ? 0 : bv > 2.1 ? NB - 1 : Math.round((bv - BV0) / BV_STEP));

function ncell(j, h) { return Math.max(1, Math.round(360 * Math.cos((-90 + (j + 0.5) * h) * DEG) / h)); }
const vecOf = (ra, dec) => { const a = ra * DEG, d = dec * DEG, c = Math.cos(d); return [c * Math.cos(a), c * Math.sin(a), Math.sin(d)]; };

/** Load the manifest (tiny next to the tiles; retried with back-off: 2 s, 4 s, ... up to a minute). */
export function initDeepStars() {
  fetch(new URL('index.json', BASE)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((m) => {
    deep.counts = m.counts; deep.magEnd = m.counts.peakMag;
    deep.levels = m.levels.map((lv) => {
      const h = lv.band, tiles = [];
      lv.counts.forEach((row, j) => {
        const n = ncell(j, h), w = 360 / n, d0 = -90 + j * h;
        row.forEach((count, c) => {
          if (!count) return;
          const ctr = vecOf((c + 0.5) * w, d0 + h / 2);
          // angular radius: the farthest of the corners, the edge mid-points and (for a polar cell) the pole
          let rad = 0;
          const pts = [[c * w, d0], [(c + 1) * w, d0], [c * w, d0 + h], [(c + 1) * w, d0 + h], [(c + 0.5) * w, d0], [(c + 0.5) * w, d0 + h]];
          for (const [a, d] of pts) { const v = vecOf(a, d); rad = Math.max(rad, Math.acos(Math.min(1, ctr[0] * v[0] + ctr[1] * v[1] + ctr[2] * v[2]))); }
          tiles.push({ key: lv.id + '/' + j + '_' + c, lv: lv.id, j, c, h, w, n: count, magMin: lv.magMin, cx: ctr[0], cy: ctr[1], cz: ctr[2], rad,
            status: 0, fails: 0, retryAt: 0, lastUsed: 0, loadedAt: 0, vec: null, mag: null, spr: null, bvq: null, ids: null });
        });
      });
      return { id: lv.id, band: h, magMin: lv.magMin, tiles };
    });
    // the bright list as one always-loaded tile
    const b = m.bright, n = b.length;
    const t = { key: 'bright', lv: 'bright', n, magMin: n ? b[0][2] : 99, status: 2, loadedAt: -1e9, vec: new Float32Array(3 * n), mag: new Float32Array(n),
      spr: new Uint8Array(n), bvq: new Uint8Array(n), ids: new Uint32Array(n), radec: new Float64Array(2 * n) };
    for (let i = 0; i < n; i++) {
      const [ra, dec, v, bv, id] = b[i], u = vecOf(ra, dec);
      t.vec[3 * i] = u[0]; t.vec[3 * i + 1] = u[1]; t.vec[3 * i + 2] = u[2];
      t.mag[i] = v; t.spr[i] = spriteIndex(bv); t.bvq[i] = bv === null ? 255 : Math.round((bv + 1) / 0.02); t.ids[i] = id;
      t.radec[2 * i] = ra; t.radec[2 * i + 1] = dec;
    }
    deep.bright = t;
    deep.ready = true; deep.failed = false;
    emit('catalog', 'deep');
  }).catch((e) => {
    console.warn('faint-star index failed', e);
    deep.failed = true; emit('catalog', 'deep-error');
    setTimeout(initDeepStars, Math.min(60000, 2000 * Math.pow(2, indexTries++)));
  });
}

function parseTile(t, buf) {
  const dv = new DataView(buf), n = Math.floor(buf.byteLength / REC);
  const vec = new Float32Array(3 * n), mag = new Float32Array(n), spr = new Uint8Array(n), bvq = new Uint8Array(n), ids = new Uint32Array(n);
  const d0 = -90 + t.j * t.h;
  for (let i = 0, o = 0; i < n; i++, o += REC) {
    const ra = (t.c + dv.getUint16(o, true) / 65536) * t.w * DEG, dec = (d0 + dv.getUint16(o + 2, true) / 65536 * t.h) * DEG, cd = Math.cos(dec);
    vec[3 * i] = cd * Math.cos(ra); vec[3 * i + 1] = cd * Math.sin(ra); vec[3 * i + 2] = Math.sin(dec);
    mag[i] = dv.getUint16(o + 4, true) / 1000 - 2;
    const c = dv.getUint8(o + 6);
    bvq[i] = c; spr[i] = spriteIndex(c === 255 ? null : c * 0.02 - 1);
    ids[i] = dv.getUint32(o + 7, true);
  }
  t.n = n; t.vec = vec; t.mag = mag; t.spr = spr; t.bvq = bvq; t.ids = ids;
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
    cachedStars -= t.n; t.status = 0; t.vec = t.mag = t.spr = t.bvq = t.ids = null;
  }
}

/** Plain-object view of one tile star (every number is the catalogue's; the tile stores V to 0.001 mag,
 *  B-V to 0.02 and the position to a fraction of an arcsecond). */
export function tycRecord(ref) {
  const t = ref.t, i = ref.i, id = t.ids[i];
  const x = t.vec[3 * i], y = t.vec[3 * i + 1], z = t.vec[3 * i + 2];
  const s = { tyc: `TYC ${id >>> 18}-${(id >>> 4) & 0x3fff}-${id & 15}`, mag: t.mag[i], bv: t.bvq[i] === 255 ? null : t.bvq[i] * 0.02 - 1, vec: [x, y, z] };
  if (t.radec) { s.ra = t.radec[2 * i]; s.dec = t.radec[2 * i + 1]; }
  else { s.ra = (Math.atan2(y, x) * RAD + 360) % 360; s.dec = Math.asin(z) * RAD; }
  return s;
}
export const tycKey = (ref) => 'y' + ref.t.key + ':' + ref.i;

// ---- drawing --------------------------------------------------------------------------------------
const visible = [];
export function drawDeepStars(ctx) {
  const st = deep.stats;
  st.drawn = 0; st.wanted = 0;
  if (!deep.ready) return;
  const { frame, sky, atmo, refr, ground, labels } = R;
  const lim = sky.limMag;
  const M = frame.Mjh, V = cam.V;
  const m0 = M[0], m1 = M[1], m2 = M[2], m3 = M[3], m4 = M[4], m5 = M[5], m6 = M[6], m7 = M[7], m8 = M[8];
  // forward axis of the view in J2000, and the angular radius of the view (as in render/stars.js)
  const f0 = V[6] * m0 + V[7] * m3 + V[8] * m6, f1 = V[6] * m1 + V[7] * m4 + V[8] * m7, f2 = V[6] * m2 + V[7] * m5 + V[8] * m8;
  const viewR = Math.min(Math.PI, Math.acos(cam.zMin < -1 ? -1 : cam.zMin) + 0.02);
  const now = performance.now();
  visible.length = 0;
  if (deep.bright.n && deep.bright.magMin < lim) visible.push(deep.bright);
  let fading = false;
  for (const lv of deep.levels) {
    if (lv.magMin >= lim) continue;
    const want = [];
    for (const t of lv.tiles) {
      const dot = f0 * t.cx + f1 * t.cy + f2 * t.cz;
      const reach = viewR + t.rad;
      if (reach < Math.PI && dot < Math.cos(reach)) continue;
      t.lastUsed = now;
      if (t.status === 2) { visible.push(t); if (now - t.loadedAt < FADE_MS) fading = true; }
      else if (t.status === 0 && now >= t.retryAt) want.push([dot, t]);
      else if (t.status === 1) st.wanted++;
    }
    if (want.length) {
      // nearest the centre of the view first; a view that would need a flood of tiles gets the nearest ones only
      want.sort((a, b) => b[0] - a[0]);
      for (const [, t] of want.slice(0, Math.max(0, MAX_WANTED - st.wanted))) { t.status = 1; queue.push(t); st.wanted++; }
    }
  }
  // drop requests for tiles that scrolled out of view before their turn came
  for (let k = queue.length - 1; k >= 0; k--) if (queue[k].lastUsed !== now) { queue[k].status = 0; queue.splice(k, 1); }
  if (queue.length) pump();
  st.loading = inFlight + queue.length;
  if (!visible.length) { st.tiles = 0; return; }

  const atlas = starAtlas();
  const bx = frame.beta[0], by = frame.beta[1], bz = frame.beta[2];
  const zMin = cam.zMin, s2 = 2 * cam.s, cx = cam.cx, cy = cam.cy, W = cam.w, H = cam.h;
  const zLoose = Math.cos(viewR);
  const minZ = ground ? -0.03 : -2;
  // names only for the brighter tile stars, and never more of them as the limit runs on past the end of the catalogue
  const tycLim = state.show.starNames && cam.fov < 1.2 ? Math.min(lim, 12.5) - 3.5 : -99;
  let drawn = 0;
  for (const t of visible) {
    const v = t.vec, mg = t.mag, sp = t.spr, n = t.n;
    const fade = Math.min(1, (now - t.loadedAt) / FADE_MS);
    for (let i = 0; i < n; i++) {
      let mag = mg[i];
      if (mag > lim) break;
      const x = v[3 * i] + bx, y = v[3 * i + 1] + by, z = v[3 * i + 2] + bz;
      if (f0 * x + f1 * y + f2 * z < zLoose) continue;
      let hz = m6 * x + m7 * y + m8 * z;
      if (hz < minZ) continue;
      let hx = m0 * x + m1 * y + m2 * z, hy = m3 * x + m4 * y + m5 * z;
      if (refr || atmo) {
        let alt = Math.asin(hz > 1 ? 1 : hz) * RAD;
        if (refr) {
          const hd = alt < -1 ? -1 : alt;
          let rf = 0.017 / Math.tan((hd + 10.3 / (hd + 5.11)) * DEG);
          if (alt < -1) rf *= (alt + 90) / 89;
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
      ctx.drawImage(atlas, sp[i] * SPR, al * SPR, SPR, SPR, sx - half, sy - half, 2 * half, 2 * half);
      drawn++;
      addPick(sx, sy, r, mag, { kind: 'tyc', t, i });
      if (mg[i] < tycLim) { const id = t.ids[i]; labels.add(sx, sy, `TYC ${id >>> 18}-${(id >>> 4) & 0x3fff}-${id & 15}`, 'starDim', 12 - mg[i], { gap: r + 4 }); }
    }
  }
  st.drawn = drawn; st.tiles = visible.length; st.stars = cachedStars;
  if (fading) emit('render');
}
