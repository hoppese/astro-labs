// healpix.js: the HEALPix NESTED pixelisation (Gorski et al. 2005), as much of it as the online faint-star
// layer needs. Gaia numbers its sources by it: source_id / 2^35 is the source's nested pixel at order 12
// (equatorial ICRS), so "all sources in pixel p of order k" is one range of source_id, which is what the
// tile requests of js/deepstars.js ask for. Checked against real Gaia rows in tools/check.mjs (section 17).

const JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4], JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7];
const spread = (v) => { let r = 0; for (let b = 0; b < 13; b++) r |= ((v >> b) & 1) << (2 * b); return r; };
const squeeze = (v) => { let r = 0; for (let b = 0; b < 13; b++) r |= ((v >> (2 * b)) & 1) << b; return r; };

/** Nested pixel (0 .. 12 * 4^order - 1) that holds the unit vector (x, y, z). order <= 12. */
export function vec2pix(order, x, y, z) {
  const ns = 1 << order, za = Math.abs(z);
  let tt = Math.atan2(y, x) / (Math.PI / 2); if (tt < 0) tt += 4; if (tt >= 4) tt -= 4;
  let face, ix, iy;
  if (za <= 2 / 3) {
    const t1 = ns * (0.5 + tt), t2 = ns * z * 0.75;
    const jp = Math.floor(t1 - t2), jm = Math.floor(t1 + t2);
    const ifp = jp >> order, ifm = jm >> order;
    face = ifp === ifm ? (ifp & 3) + 4 : ifp < ifm ? ifp & 3 : (ifm & 3) + 8;
    ix = jm & (ns - 1); iy = ns - (jp & (ns - 1)) - 1;
  } else {
    const ntt = Math.min(3, Math.floor(tt)), tp = tt - ntt, tmp = ns * Math.sqrt(3 * (1 - za));
    const jp = Math.min(ns - 1, Math.floor(tp * tmp)), jm = Math.min(ns - 1, Math.floor((1 - tp) * tmp));
    if (z >= 0) { face = ntt; ix = ns - jm - 1; iy = ns - jp - 1; } else { face = ntt + 8; ix = jp; iy = jm; }
  }
  return face * ns * ns + spread(ix) + 2 * spread(iy);
}

/** Centre of nested pixel `ipix` at `order`, as a unit vector written into out[0..2]. */
export function pix2vec(order, ipix, out) {
  const ns = 1 << order, npf = ns * ns, face = Math.floor(ipix / npf), ipf = ipix - face * npf;
  const ix = squeeze(ipf), iy = squeeze(ipf >> 1);
  const jr = JRLL[face] * ns - ix - iy - 1;
  let nr, z, kshift;
  if (jr < ns) { nr = jr; z = 1 - nr * nr / (3 * npf); kshift = 0; }
  else if (jr > 3 * ns) { nr = 4 * ns - jr; z = nr * nr / (3 * npf) - 1; kshift = 0; }
  else { nr = ns; z = (2 * ns - jr) * 2 / (3 * ns); kshift = (jr - ns) & 1; }
  let jp = (JPLL[face] * nr + ix - iy + 1 + kshift) >> 1;
  if (jp > 4 * ns) jp -= 4 * ns;
  if (jp < 1) jp += 4 * ns;
  const phi = (jp - (kshift + 1) * 0.5) * (Math.PI / 2) / nr, s = Math.sqrt(Math.max(0, 1 - z * z));
  out[0] = s * Math.cos(phi); out[1] = s * Math.sin(phi); out[2] = z;
  return out;
}

/** An upper bound on the angle (radians) from a pixel's centre to any point of it. The farthest corner is at
 *  most PIX_REACH times the pixel's mean side, sqrt(4 pi / (12 * 4^order)) (measured with 3 million random points an order). */
export const PIX_REACH = 1.15;        // measured: 0.82 (order 0), 0.94 (1), 1.01 (3), 1.02 (5)
export const pixRadius = (order) => PIX_REACH * Math.sqrt(Math.PI / 3) / (1 << order);
