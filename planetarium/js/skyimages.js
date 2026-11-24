// skyimages.js: pictures of the sky behind the stars.
//   1. Deep-sky pictures (data/img/, tools/build_images.py): nebulae and galaxies, made from the colour Digitized Sky Survey
//      (sky, stars and edges removed) and shipped with the app. Each is a tangent-plane picture about the object's catalogue place, J2000 north up, so its size, angle
//      and place on screen follow from geometry alone. Fades in as the object grows on screen.
//   2. Sky survey (off by default): the same survey for the whole sky, fetched tile by tile (HiPS) from ESA's public mirror.
// Both go under the grids and the stars, which stay on top. Nothing here can be picked: the object itself is.

import { see } from './notebook/seeing.js';
import { emit } from './state.js';
import { mulMV, smooth, clamp, DEG, unrefractHor } from './astro.js';
import { cam, unproject } from './camera.js';
import { R } from './render/proj.js';
import { refractHor } from './astro.js';
import { vec2pix } from './healpix.js';
import { dso } from './catalog.js';
import { xs } from './xui.js';

const DIR = new URL('../data/img/', import.meta.url);
export const pics = { items: null, status: 'idle', shown: new Set(), survey: '' };
let loading = false;

function loadIndex() {
  if (loading || pics.items) return;
  loading = true;
  fetch(new URL('index.json', DIR)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }).then((j) => {
    const byId = new Map(dso.rows.map((o) => [o.id, o])), list = [];
    for (const [key, [file, size, n, ra, dec, by]] of Object.entries(j.items)) {
      const id = key.split('|')[0], o = byId.get(id); if (!o) continue;       // "|core": the ESO picture of a showpiece's middle, with its own centre
      const vec = ra == null ? o.vec : [Math.cos(dec * DEG) * Math.cos(ra * DEG), Math.cos(dec * DEG) * Math.sin(ra * DEG), Math.sin(dec * DEG)];
      list.push({ id, idx: o.idx, file, size, n, vec, by: by || '', base: null, img: null, state: 0, mesh: null, at: 0 });
    }
    for (const it of list) if (it.by) it.base = list.find((b) => b.idx === it.idx && !b.by) || null;
    list.sort((a, b) => b.size - a.size);
    pics.items = list; pics.status = 'ready'; emit('render');
  }).catch((e) => { pics.status = 'error'; console.warn('deep-sky pictures', e); setTimeout(() => { loading = false; }, 20000); });
}
function loadPic(it) {
  it.state = 1;
  const im = new Image();
  im.decoding = 'async';
  im.onload = () => { it.img = im; it.state = 2; it.at = performance.now(); emit('render'); };
  im.onerror = () => { it.state = 3; setTimeout(() => { it.state = 0; }, 20000); };
  im.src = new URL(it.file, DIR).href;
}

/** How much of a faint glow this sky lets through: 0 in daylight, weak over a city, 1 with no atmosphere. */
export function glowVisibility(sky) {
  if (!sky.atmo) return 1;
  return smooth(0.5, 3.5, sky.base) * (0.22 + 0.78 * smooth(3.6, 6.6, sky.base));
}
function extinction(h, sky) {
  if (!sky.atmo) return 1;
  const a = Math.max(0, Math.asin(clamp(h[2], -1, 1)) / DEG);
  const X = 1 / (Math.sin(a * DEG) + 0.50572 * Math.pow(a + 6.07995, -1.6364));      // Kasten & Young air mass
  return Math.pow(10, -0.1 * (X - 1));                                                // 0.25 mag per air mass
}

// ---- drawing a patch of sky from a picture ------------------------------------------------------
const tmp = [0, 0];
/** Direction (J2000, as catalogued) -> screen, without the "is it in view" test; false only when nearly behind the camera. */
function toScreen(v, out) {
  let h = R.frame.starHor(v);
  if (R.refr) h = refractHor(h);
  const V = cam.V, z = V[6] * h[0] + V[7] * h[1] + V[8] * h[2];
  if (z < -0.6) return false;
  const k = 2 * cam.s / (1 + z);
  out[0] = cam.cx + k * (V[0] * h[0] + V[1] * h[1] + V[2] * h[2]);
  out[1] = cam.cy - k * (V[3] * h[0] + V[4] * h[1] + V[5] * h[2]);
  return true;
}
/** Draw img as an (n x n)-cell mesh. vecs: (n+1)^2 directions, row by row from the picture's top left. */
let PX = new Float64Array(0), OK = new Uint8Array(0);
function drawMesh(ctx, img, w, vecs, n) {
  const m = n + 1, N = m * m;
  if (PX.length < 2 * N) { PX = new Float64Array(2 * N); OK = new Uint8Array(N); }
  for (let i = 0; i < N; i++) { OK[i] = toScreen([vecs[3 * i], vecs[3 * i + 1], vecs[3 * i + 2]], tmp) ? 1 : 0; PX[2 * i] = tmp[0]; PX[2 * i + 1] = tmp[1]; }
  const c = w / n;
  if (n === 1) {                                          // small picture: one affine map is exact to a few hundredths of an arcsecond
    if (!OK[0] || !OK[1] || !OK[2]) return;
    ctx.save(); ctx.transform((PX[2] - PX[0]) / w, (PX[3] - PX[1]) / w, (PX[4] - PX[0]) / w, (PX[5] - PX[1]) / w, PX[0], PX[1]); ctx.drawImage(img, 0, 0); ctx.restore();
    return;
  }
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = j * m + i, b = a + 1, d = a + m, e = d + 1;
    if (!OK[a] || !OK[b] || !OK[d] || !OK[e]) continue;
    const x0 = Math.min(PX[2 * a], PX[2 * b], PX[2 * d], PX[2 * e]), x1 = Math.max(PX[2 * a], PX[2 * b], PX[2 * d], PX[2 * e]);
    const y0 = Math.min(PX[2 * a + 1], PX[2 * b + 1], PX[2 * d + 1], PX[2 * e + 1]), y1 = Math.max(PX[2 * a + 1], PX[2 * b + 1], PX[2 * d + 1], PX[2 * e + 1]);
    if (x1 < 0 || y1 < 0 || x0 > cam.w || y0 > cam.h) continue;
    // each half of the cell with the affine map of its own three corners
    tri(ctx, img, a, b, d, i * c, j * c, c, 1);
    tri(ctx, img, e, d, b, (i + 1) * c, (j + 1) * c, c, -1);
  }
}
/** Triangle with corner p at picture (u, v); q lies along +-u and r along +-v, one cell away. */
function tri(ctx, img, p, q, r, u, v, c, s) {
  const x = PX[2 * p], y = PX[2 * p + 1], ax = (PX[2 * q] - x) / (s * c), ay = (PX[2 * q + 1] - y) / (s * c), bx = (PX[2 * r] - x) / (s * c), by = (PX[2 * r + 1] - y) / (s * c);
  const det = ax * by - ay * bx;
  if (!(Math.abs(det) > 1e-12)) return;
  // grow the clip outwards by a pixel so that neighbouring triangles leave no hairline
  const mx = (x + PX[2 * q] + PX[2 * r]) / 3, my = (y + PX[2 * q + 1] + PX[2 * r + 1]) / 3;
  ctx.save(); ctx.beginPath();
  for (const [k, i] of [[0, p], [1, q], [2, r]]) {
    const dx = PX[2 * i] - mx, dy = PX[2 * i + 1] - my, L = Math.hypot(dx, dy) || 1, g = 1 + 1.2 / L;
    if (k) ctx.lineTo(mx + dx * g, my + dy * g); else ctx.moveTo(mx + dx * g, my + dy * g);
  }
  ctx.closePath(); ctx.clip();
  ctx.transform(ax, ay, bx, by, x - ax * u - bx * v, y - ay * u - by * v);
  // only the part of the picture under this triangle (plus a margin for the smoothing)
  const pad = 2, W = img.width, H = img.height;
  const su = clamp(Math.min(u, u + s * c) - pad, 0, W), sv = clamp(Math.min(v, v + s * c) - pad, 0, H), eu = clamp(Math.max(u, u + s * c) + pad, 0, W), ev = clamp(Math.max(v, v + s * c) + pad, 0, H);
  ctx.drawImage(img, su, sv, eu - su, ev - sv, su, sv, eu - su, ev - sv);
  ctx.restore();
}
// Everything is first put together on a canvas of its own, black to begin with, with "lighten": overlapping pictures (and the hair's
// breadth by which neighbouring triangles overlap) then do not add up. That canvas is laid over the sky once, with "screen":
// black adds nothing, and a faint glow dissolves into whatever sky is there (Bortle glow, twilight, Milky Way).
let off = null, octx = null, used = false;
function layer(ctx) {
  const d = ctx.getTransform().a, W = Math.round(cam.w * d / 1.5), H = Math.round(cam.h * d / 1.5);
  if (!off) { off = document.createElement('canvas'); octx = off.getContext('2d', { alpha: false }); }
  if (off.width !== W || off.height !== H) { off.width = W; off.height = H; used = true; }
  octx.setTransform(1, 0, 0, 1, 0, 0); octx.globalCompositeOperation = 'source-over'; octx.globalAlpha = 1;
  if (used) { octx.fillStyle = '#000'; octx.fillRect(0, 0, W, H); }
  octx.setTransform(W / cam.w, 0, 0, H / cam.h, 0, 0); octx.globalCompositeOperation = 'lighten'; octx.imageSmoothingEnabled = true; octx.imageSmoothingQuality = 'high';
  used = false;
  return octx;
}
function tangentMesh(it) {
  const n = clamp(Math.ceil(it.size / 0.7), 1, 14), h = Math.tan(it.size / 2 * DEG), C = it.vec;
  const cd = Math.hypot(C[0], C[1]), E = [-C[1] / cd, C[0] / cd, 0], U = [-C[2] * C[0] / cd, -C[2] * C[1] / cd, cd];
  const out = new Float64Array(3 * (n + 1) * (n + 1));
  let k = 0;
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
    const xi = -(2 * i / n - 1) * h, et = -(2 * j / n - 1) * h;           // east is left, north is up
    const x = C[0] + xi * E[0] + et * U[0], y = C[1] + xi * E[1] + et * U[1], z = C[2] + xi * E[2] + et * U[2], f = 1 / Math.hypot(x, y, z);
    out[k++] = x * f; out[k++] = y * f; out[k++] = z * f;
  }
  it.mesh = { n, vecs: out };
}

let surveyAl = 1;
let sharp = 0;                // best resolution on screen: picture pixels per screen pixel of the finest picture near the middle
function drawPics(ctx) {
  if (!pics.items) { loadIndex(); return; }
  const now = performance.now(), V = cam.V, viewR = Math.acos(clamp(cam.zMin, -1, 1));
  for (const it of pics.items) {
    const px = it.size * cam.pxPerDeg, pxFade = (it.base || it).size * cam.pxPerDeg;      // a core fades in with the picture round it
    if (px < 8) break;
    if (pxFade < 20) continue;                                   // sorted by size: the rest are smaller still
    const h = R.frame.starHor(it.vec);
    if (R.ground && h[2] < -0.04 - it.size * DEG / 2) continue;
    if (Math.acos(clamp(V[6] * h[0] + V[7] * h[1] + V[8] * h[2], -1, 1)) > viewR + it.size * DEG * 0.75 + 0.02) continue;
    if (it.state === 0) loadPic(it);
    if (it.state !== 2) continue;
    // fades in with size on screen, and out again when one picture pixel covers more than a dozen on screen (nothing left to see but blur)
    // Only the fading-in is done picture by picture; everything that dims the whole view (sky, extinction, over-zoom) is applied
    // once, to the finished layer (drawSkyImages), because half-transparent triangles would show their overlaps as lines.
    const a = smooth(18, 130, pxFade) * smooth(0, 1200, now - it.at) * (it.base && it.base.state < 2 ? 0 : 1) * (cam.fov > 20 ? extinction(it.base ? R.frame.starHor(it.base.vec) : h, R.sky) : 1);
    if (now - it.at < 1200) emit('render');
    if (a < 0.02) continue;
    if (!it.mesh) tangentMesh(it);
    ctx.globalAlpha = a; used = true;
    // small on screen: the three corners are enough (no triangles, so no overlaps while it fades in)
    if (pxFade < 320 && it.mesh.n > 1) { const m = it.mesh.n; if (!it.mini) { it.mini = new Float64Array(12); [0, m, m * (m + 1), m * (m + 2)].forEach((v, q) => it.mini.set(it.mesh.vecs.subarray(3 * v, 3 * v + 3), 3 * q)); } drawMesh(ctx, it.img, it.n, it.mini, 1); }
    else drawMesh(ctx, it.img, it.n, it.mesh.vecs, it.mesh.n);
    if (Math.acos(clamp(V[6] * h[0] + V[7] * h[1] + V[8] * h[2], -1, 1)) < it.size * DEG * 0.4) sharp = Math.max(sharp, it.n / px);
    if (px > 60) {
      pics.shown.add(it.idx);
      // smaller galaxies and nebulae that lie in this picture and have none of their own (M 32, M 110, M 43 ...): seen here too
      if (!it.kids || it.nRows !== dso.rows.length) {
        const own = new Set(pics.items.map((q) => q.idx)), c = Math.cos(it.size * 0.42 * DEG), small = it.size * 30; it.nRows = dso.rows.length;
        it.kids = dso.rows.filter((o) => !own.has(o.idx) && /^(G|GPair|Neb|HII|RfN|EmN|Cl\+N|SNR|DrkN)$/.test(o.type) && (o.maj || 0) < small && o.vec[0] * it.vec[0] + o.vec[1] * it.vec[1] + o.vec[2] * it.vec[2] > c).map((o) => o.idx);
      }
      for (const k of it.kids) pics.shown.add(k);
    }
    if (it.by) pics.by = it.by;
  }
}

// ---- the survey layer (HiPS tiles) -----------------------------------------------------------------
const HIPS = 'https://skies.esac.esa.int/DSSColor/', MAXTILES = 320;
const tiles = new Map();                                  // 'order/ipix' -> {img, state, used, mesh}
let inFlight = 0, fails = 0, retryAt = 0, useNo = 0;
const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4], JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
/** A point (x, y in 0..1) of HEALPix base face f, as a unit vector. */
function faceVec(f, x, y, out, o) {
  const jr = JRLL[f] - x - y;
  let nr, z;
  if (jr < 1) { nr = jr; z = 1 - nr * nr / 3; } else if (jr > 3) { nr = 4 - jr; z = nr * nr / 3 - 1; } else { nr = 1; z = (2 - jr) * 2 / 3; }
  const ph = nr > 1e-12 ? Math.PI / 4 * (JPLL[f] * nr + x - y) / nr : 0, s = Math.sqrt(Math.max(0, 1 - z * z));
  out[o] = s * Math.cos(ph); out[o + 1] = s * Math.sin(ph); out[o + 2] = z;
}
function tileMesh(order, ipix) {
  const ns = 1 << order, f = Math.floor(ipix / (ns * ns)); let p = ipix - f * ns * ns, ix = 0, iy = 0;
  for (let b = 0; b < order; b++) { ix |= (p & 1) << b; p >>= 1; iy |= (p & 1) << b; p >>= 1; }
  const n = order <= 3 ? 8 : order === 4 ? 6 : order === 5 ? 4 : order === 6 ? 2 : 1, vecs = new Float64Array(3 * (n + 1) * (n + 1));
  let k = 0;
  // the tile's JPEG: rows along the cell's x, columns along its y (tools/build_images.py, checked against catalogue stars)
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++, k += 3) faceVec(f, (ix + j / n) / ns, (iy + i / n) / ns, vecs, k);
  return { n, vecs };
}
function wantTile(order, ipix) {
  const key = order + '/' + ipix; let t = tiles.get(key);
  if (!t) tiles.set(key, t = { img: null, state: 0, used: 0, at: 0, again: 0, mesh: tileMesh(order, ipix) });
  t.used = useNo;
  if (t.state === 0 && inFlight < 6 && performance.now() > Math.max(retryAt, t.again)) {
    t.state = 1; inFlight++;
    const im = new Image(); im.crossOrigin = 'anonymous'; im.decoding = 'async';
    const done = () => { inFlight--; emit('render'); };
    im.onload = () => { t.img = im; t.state = 2; t.at = performance.now(); fails = 0; pics.survey = ''; done(); };
    im.onerror = () => { t.state = 0; t.again = performance.now() + 15000; if (++fails >= 4) { retryAt = performance.now() + 30000; pics.survey = 'not answering'; setTimeout(() => emit('render'), 30100); } done(); };
    im.src = `${HIPS}Norder${order}/Dir${Math.floor(ipix / 10000) * 10000}/Npix${ipix}.jpg`;
  }
  return t;
}
function tilesInView(order) {
  const set = new Set(), step = Math.max(24, Math.min(90, 58.63 / (1 << order) * cam.pxPerDeg / 4)), b = R.frame.beta;
  for (let y = -step; y <= cam.h + step; y += step) for (let x = -step; x <= cam.w + step; x += step) {
    let h = unproject(x, y); if (R.ground && h[2] < -0.02) continue;
    if (R.refr) h = unrefractHor(h);
    const v = mulMV(R.frame.Mhj, h), p = [v[0] - b[0], v[1] - b[1], v[2] - b[2]], f = 1 / Math.hypot(p[0], p[1], p[2]);
    set.add(vec2pix(order, p[0] * f, p[1] * f, p[2] * f));
  }
  return set;
}
function drawSurvey(ctx, vis) {
  const strength = vis * (1 - smooth(45, 65, cam.fov));
  if (strength < 0.02) return false;
  useNo++;
  const order = clamp(Math.ceil(Math.log2(58.63 * cam.pxPerDeg / 640)), 3, 9);
  const h = unproject(cam.cx, cam.cy), al = strength * extinction(h, R.sky) * (1 - smooth(14, 40, cam.pxPerDeg * 58.63 / 512 / 512));
  if (al < 0.02) return false;
  const want = [...tilesInView(order)], lower = Math.max(3, order - 2);
  let missing = false, any = false;
  const sharp = [];
  for (const p of want) { const t = wantTile(order, p); if (t.state === 2) sharp.push(t); else missing = true; }
  const put = [];
  // until the sharp tiles have arrived, the coarse ones stand in
  if (missing && lower < order) for (const p of new Set(want.map((q) => Math.floor(q / 4 ** (order - lower))))) { const t = wantTile(lower, p); if (t.state === 2) put.push(t); }
  put.push(...sharp); any = put.length > 0;
  ctx.globalAlpha = 1; surveyAl = al;
  for (const t of put) { used = true; drawMesh(ctx, t.img, t.img.width, t.mesh.vecs, t.mesh.n); }
  if (tiles.size > MAXTILES) for (const [k, t] of [...tiles].sort((a, b) => a[1].used - b[1].used).slice(0, tiles.size - MAXTILES)) if (t.used < useNo && t.state !== 1) tiles.delete(k);
  return any;
}

// ---- called by the renderer, after the Milky Way and before the grids -------------------------------
let credit = null, creditText = '';
/** The credit line now on screen ('' when no imagery is), for screenshots. */
export const imageryCredit = () => creditText;
export function drawSkyImages(ctx) {
  pics.shown.clear(); pics.by = '';
  let survey = false;
  if ((xs.images || xs.survey) && !see.enabled) {          // never under the lab notebook's simulated exposures: a photograph shows the stars where they were decades ago
    const vis = glowVisibility(R.sky);
    if (vis > 0.02) {
      const g = layer(ctx);
      if (xs.survey) survey = drawSurvey(g, vis);
      sharp = 0;
      if (xs.images && !survey) drawPics(g);
      const mid = unproject(cam.cx, cam.cy), over = sharp ? 1 / sharp : 0;      // screen pixels per picture pixel
      ctx.save();
      if (used) { ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = survey ? surveyAl : vis * (cam.fov > 20 ? 1 : extinction(mid, R.sky)) * (1 - 0.8 * smooth(5, 26, over)) * (1 - smooth(26, 70, over)); ctx.imageSmoothingEnabled = true; ctx.drawImage(off, 0, 0, off.width, off.height, 0, 0, cam.w, cam.h); }
      ctx.restore();
    }
  }
  // say whose picture it is whenever one is on screen
  const txt = survey ? 'Imagery: Digitized Sky Survey (STScI), colour CDS, via ESASky' : pics.shown.size ? 'Imagery: Digitized Sky Survey (STScI), colour CDS' + (pics.by ? '; ' + pics.by + ' (CC BY 4.0)' : '') : xs.survey && pics.survey ? 'Sky survey images: the server is not answering' : '';
  if (txt !== creditText) {
    creditText = txt;
    if (!credit) { credit = document.createElement('div'); credit.className = 'imgcredit'; document.body.appendChild(credit); }
    credit.textContent = txt; credit.hidden = !txt;
  }
}
