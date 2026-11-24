#!/usr/bin/env python3
"""Makes the deep-sky pictures of data/img/ (and the list data/img/index.json): the glow of nebulae and galaxies, without the sky
background, without the stars (the app draws its own) and without an edge, to be laid over the app's sky with "screen".

Source: the colour DSS2 HiPS ("DSS colored", composed from the red and blue plates by the CDS, Strasbourg), read tile by tile
from ESA's public mirror https://skies.esac.esa.int/DSSColor/ . Licence of the DSS (MAST, archive.stsci.edu/publishing/data-use):
CC BY-NC-SA, "these data and derived products may be used freely for all scientific, educational, and non-profit purposes".
The middles of seven showpieces are burnt out on the plates and come from public pictures of ESO (licence CC BY 4.0;
eso.org/public/outreach/copyright: "may on a non-exclusive basis be reproduced without fee provided the credit is clear and
visible") and ESA/Hubble (CC BY 4.0; esahubble.org/copyright).

For each picture: gnomonic projection about the object's catalogue place, J2000 north up, east left, so that size, angle and
alignment follow from the numbers alone; a plane is fitted to the sky round the edge (per colour) and subtracted; the ESO / Hubble
middle is blended in; stars are found (bright ones from the app's own catalogue, the rest by their compact shape), cut out and
filled from around; faint residue is pressed to zero; highlights and colour are tamed; and everything fades to exactly 0 well
inside the frame (an ellipse at the galaxy's own angle for galaxies). Globular clusters keep only their unresolved glow; open
clusters without nebulosity have no picture at all. Every file is read back and its border checked to be 0.

    python3 -I tools/build_images.py CACHE_DIR [object id ...]      (needs numpy, scipy and Pillow)
"""
import sys, os, json, re, subprocess, time, multiprocessing as mp
import concurrent.futures as cf
import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'data')
CACHE = sys.argv[1]
os.makedirs(CACHE, exist_ok=True)
HIPS = 'https://skies.esac.esa.int/DSSColor/'

def spread(v):
    v = v.astype(np.int64); r = np.zeros_like(v)
    for b in range(20): r |= ((v >> b) & 1) << (2 * b)
    return r

def face_xy(order, v):
    """HEALPix base face and the continuous (x, y) on it, 0 .. nside (x towards the north-east corner, y north-west)."""
    ns = 1 << order; x, y, z = v; za = np.abs(z); tt = (np.arctan2(y, x) / (np.pi / 2)) % 4
    t1 = 0.5 + tt; t2 = z * 0.75; jp = t1 - t2; jm = t1 + t2; a = np.floor(jp).astype(int); b = np.floor(jm).astype(int)
    f = np.where(a == b, (a & 3) + 4, np.where(a < b, a & 3, (b & 3) + 8)); gx = jm - b; gy = 1 - (jp - a)
    nt = np.minimum(3, np.floor(tt)).astype(int); tp = tt - nt; tmp = np.sqrt(np.maximum(0, 3 * (1 - za)))
    p1 = tp * tmp; p2 = (1 - tp) * tmp; eq = za <= 2 / 3
    return np.where(eq, f, np.where(z >= 0, nt, nt + 8)), np.where(eq, gx, np.where(z >= 0, 1 - p2, p1)) * ns, np.where(eq, gy, np.where(z >= 0, 1 - p1, p2)) * ns

def tile(order, ipix):
    p = f'{CACHE}/{order}_{ipix}.jpg'
    if not os.path.exists(p) or os.path.getsize(p) < 500:
        for k in range(5):
            if subprocess.run(['/usr/bin/curl', '-sf', '-m', '60', '-o', p, f'{HIPS}Norder{order}/Dir{ipix // 10000 * 10000}/Npix{ipix}.jpg']).returncode == 0: break
            time.sleep(2 * (k + 1))
        else: raise SystemExit(f'tile {order}/{ipix} could not be read')
    return np.asarray(Image.open(p).convert('RGB')).astype(np.float32)

def sample(order, vec):
    face, fx, fy = face_xy(order, vec); ns = 1 << order
    ix = np.clip(fx.astype(np.int64), 0, ns - 1); iy = np.clip(fy.astype(np.int64), 0, ns - 1)
    t = face * ns * ns + spread(ix) + 2 * spread(iy); out = np.zeros(vec.shape[1:] + (3,), np.float32); ts = np.unique(t)
    with cf.ThreadPoolExecutor(4) as ex: ims = dict(zip(ts, ex.map(lambda q: tile(order, int(q)), ts)))
    for q in ts:
        m = t == q; im = ims[q]
        # HiPS JPEG tiles: row = x, column = y of the HEALPix cell (checked against catalogue stars in all eight orientations)
        r = np.clip((fx[m] - ix[m]) * 512 - 0.5, 0, 511); c = np.clip((fy[m] - iy[m]) * 512 - 0.5, 0, 511)
        r0 = r.astype(int); c0 = c.astype(int); r1 = np.minimum(r0 + 1, 511); c1 = np.minimum(c0 + 1, 511); fr = (r - r0)[:, None]; fc = (c - c0)[:, None]
        out[m] = (im[r0, c0] * (1 - fc) + im[r0, c1] * fc) * (1 - fr) + (im[r1, c0] * (1 - fc) + im[r1, c1] * fc) * fr
    return out

# object -> ESO picture, credit, centre of the PICTURE (deg), field (arcmin). Credit, field and "north up" (0.0 deg) are from
# https://www.eso.org/public/images/<id>/ ; the position given there is the object's, up to 15 arcmin from the middle of the picture,
# so the centre was found by laying catalogue stars over it (HYG; for M 42, 211 Gaia DR3 stars, G < 14): scale 1.00. The last two numbers:
# degrees north lies left of vertical, width of the blend.  heic...: https://esahubble.org/images/<id>/ , also CC BY 4.0.
CORES = {'NGC 6514': ('eso0930a', 'ESO', 270.57722, -22.94269, 13.89, 22.82, 0.0, 0.4),
         'NGC 1976': ('eso1103a', 'ESO/Igor Chekalin', 83.74942, -5.44777, 35.49, 34.1, 0.0, 0.4),
         'NGC 6523': ('eso0936a', 'ESO', 270.95032, -24.13919, 93.49, 62.61, 0.0, 0.6),
         'NGC 5139': ('eso0844a', 'ESO', 201.68459, -47.49403, 31.88, 29.99, 0.0, 0.4),
         'NGC 6611': ('eso0926a', 'ESO', 274.70555, -13.76435, 32.08, 32.08, 0.0, 0.6),
         'NGC 6720': ('heic1310a', 'NASA, ESA, and C. Robert O’Dell (Vanderbilt University)', 283.39663, 33.02892, 2.1, 2.1, 11.7, 0.25),
         'NGC 6853': ('eso9846a', 'ESO/I. Appenzeller, W. Seifert, O. Stahl, M. Zamani', 299.89952, 22.71772, 6.76, 6.82, 0.2, 0.12),
         'NGC 1952': ('heic0515a', 'NASA, ESA and Allison Loll/Jeff Hester (Arizona State University). Acknowledgement: Davide De Martin (ESA/Hubble)', 83.63554, 22.01513, 6.41, 6.41, 0.0, 0.25)}
# how far the survey's burnt-out surroundings are toned down so that they meet the ESO picture (fraction)
TONE = {'NGC 6514': 0.5, 'NGC 1976': 0.3, 'NGC 6523': 0.5, 'NGC 5139': 0.8, 'NGC 6611': 0.6, 'NGC 6720': 0.5, 'NGC 6853': 0.12, 'NGC 1952': 0.5}
def core_size(c): t = np.radians(abs(c[6])); return min(c[4], c[5]) * 0.97 / (np.cos(t) + np.sin(t)) / 60      # the north-up square that fits inside
def basis(ra, dec):
    r, d = np.radians([ra, dec])
    return np.array([np.cos(d) * np.cos(r), np.cos(d) * np.sin(r), np.sin(d)]), np.array([-np.sin(r), np.cos(r), 0]), np.array([-np.sin(d) * np.cos(r), -np.sin(d) * np.sin(r), np.cos(d)])
def gridvec(ra, dec, size, n):
    C, E, U = basis(ra, dec); h = np.tan(np.radians(size / 2)); a = (np.arange(n) + 0.5) / n * 2 - 1
    v = C[:, None, None] + (-a[None, :] * h * np.ones((n, 1))) * E[:, None, None] + (-a[:, None] * h * np.ones((1, n))) * U[:, None, None]
    return v / np.sqrt((v ** 2).sum(0))

def take_picture(c):
    f = f'{CACHE}/{c[0]}.jpg'
    if not os.path.exists(f): subprocess.run(['/usr/bin/curl', '-sf', '-o', f, (f'https://cdn.esahubble.org/archives/images/large/{c[0]}.jpg' if c[0].startswith('heic') else f'https://cdn.eso.org/images/publicationjpg/{c[0]}.jpg')], check=True)
    Image.MAX_IMAGE_PIXELS = None
    return Image.open(f).convert('RGB')

def core_layer(c, v, scale):
    """The ESO / Hubble picture on the grid v (3, n, n): colours with its own sky taken off, and its blending weight."""
    im = take_picture(c); W0 = im.size[0]
    native = c[4] * 60 / W0
    if scale > 1.5 * native: k = native / scale; im = im.resize((max(8, int(W0 * k)), max(8, int(im.size[1] * k))), Image.LANCZOS)
    src = np.asarray(im).astype(np.float32); H, W = src.shape[:2]
    src = src - np.percentile(src.reshape(-1, 3), 1.0, axis=0)
    C, E, U = basis(c[2], c[3]); z = np.tensordot(C, v, 1); ok = z > 0.5; z = np.where(ok, z, 1)
    X, Y = np.tensordot(E, v, 1) / z, np.tensordot(U, v, 1) / z; px = W / 2 / np.tan(np.radians(c[4] / 120)); t = np.radians(c[6])
    x = W / 2 + px * (-X * np.cos(t) - Y * np.sin(t)) - 0.5; y = H / 2 - px * (-X * np.sin(t) + Y * np.cos(t)) - 0.5
    out = np.stack([ndi.map_coordinates(src[:, :, k], [y, x], order=1, mode='nearest') for k in range(3)], -1)
    e = np.hypot((x - W / 2) / (W / 2), (y - H / 2) / (H / 2))                  # an ellipse inside the frame: no straight edges
    w = np.clip((0.985 - e) / c[7], 0, 1); w = w * w * (3 - 2 * w) * ok
    if c[0] == 'eso9846a': out[:, :, 2] = np.maximum(out[:, :, 2], 0.9 * out[:, :, 1]); out[:, :, 1] *= 0.85      # its [O III] is shown as pure green: nearer its real blue-green
    return np.clip(out, 0, 255), w

STARS = None
def catalogue():
    """The app's own bright stars (HYG tiers): RA, Dec, V."""
    global STARS
    if STARS is None:
        man = json.load(open(os.path.join(ROOT, 'stars.json'))); NF = len(man['fields'])
        S = np.concatenate([np.fromfile(os.path.join(ROOT, t['file']), '<f4').reshape(-1, NF) for t in man['tiers']]).astype(float)
        ra, de = np.radians(S[:, 0] + S[:, 9]), np.radians(S[:, 1] + S[:, 10])
        STARS = np.array([np.cos(de) * np.cos(ra), np.cos(de) * np.sin(ra), np.sin(de)]), S[:, 2]
    return STARS

def smooth01(x): x = np.clip(x, 0, 1); return x * x * (3 - 2 * x)

def fill(im, mask):
    """Replace masked pixels by what surrounds them: Gaussian-weighted means of the unmasked ones, the finest that reaches."""
    w = (~mask).astype(np.float32); out = im.copy(); todo = mask.copy()
    for sg in (1.5, 3, 6, 12, 24, 48, 96):
        if not todo.any(): break
        W = ndi.gaussian_filter(w, sg, truncate=2.5); ok = todo & (W > 0.12)
        if ok.any():
            for k in range(3): out[:, :, k][ok] = (ndi.gaussian_filter(im[:, :, k] * w, sg, truncate=2.5)[ok] / W[ok])
        todo &= ~ok
    sm = np.stack([ndi.gaussian_filter(out[:, :, k], 1.5) for k in range(3)], -1)      # no hard rims round the patches
    soft = ndi.gaussian_filter(mask.astype(np.float32), 1.0)[:, :, None]
    return out * (1 - soft) + sm * soft

def starmask(im, scale, ra, dec, size, protect, cap, cores=()):
    n = im.shape[0]; lum = im.mean(2); yy, xx = np.mgrid[0:n, 0:n]
    mask = np.zeros((n, n), bool)
    V, mag = catalogue(); C, E, U = basis(ra, dec); z = C @ V; sel = np.where(z > np.cos(np.radians(size)))[0]; h = np.tan(np.radians(size / 2))
    for i in sel:
        X, Y = (E @ V[:, i]) / z[i] / h, (U @ V[:, i]) / z[i] / h; x, y = (1 - X) * n / 2 - 0.5, (1 - Y) * n / 2 - 0.5
        r = min(cap, 55 * 10 ** (-0.17 * (mag[i] - 8))) / scale
        for c, rad in cores:                       # ESO / Hubble pictures are not burnt out: their stars are small
            if basis(c[2], c[3])[0] @ V[:, i] > np.cos(np.radians(rad)): r = min(r, (14 if c[4] > 10 else 5) / scale)
        if r < 0.7 or not (-r < x < n + r and -r < y < n + r): continue
        x0, x1, y0, y1 = max(0, int(x - r - 1)), min(n, int(x + r + 2)), max(0, int(y - r - 1)), min(n, int(y + r + 2))
        mask[y0:y1, x0:x1] |= (xx[y0:y1, x0:x1] - x) ** 2 + (yy[y0:y1, x0:x1] - y) ** 2 < r * r
    guard = np.zeros((n, n), bool)
    for x, y, r in protect: guard |= (xx - x) ** 2 + (yy - y) ** 2 < r * r
    for as_, lo, hi in ((14, 5, 11), (45, 13, 31)):
        k = int(np.clip(as_ / scale, lo, hi)) | 1
        step = 3 if k > 11 else 1
        if step > 1: med = ndi.zoom(ndi.median_filter(lum[::step, ::step], k // step | 1), n / len(lum[::step]), order=1)[:n, :n]
        else: med = ndi.median_filter(lum, k)
        if med.shape != lum.shape: med = np.pad(med, ((0, n - med.shape[0]), (0, n - med.shape[1])), mode='edge')
        res = lum - med; sg = 1.48 * np.median(np.abs(res - np.median(res)))
        hit = (res > np.maximum(4 * sg, 5) + 0.05 * med) & ~mask
        lab, m = ndi.label(hit)
        if not m: continue
        area = ndi.sum(hit, lab, np.arange(1, m + 1)); good = np.zeros(m + 1, bool); rad = np.zeros(m + 1)
        for q, sl in enumerate(ndi.find_objects(lab), 1):
            hh, ww = sl[0].stop - sl[0].start, sl[1].stop - sl[1].start
            if max(hh, ww) <= 1.3 * k and max(hh, ww) <= 2.3 * min(hh, ww) + 1 and area[q - 1] > 0.38 * hh * ww: good[q] = True; rad[q] = 1.5 + 0.35 * np.sqrt(area[q - 1])
        for r in (2, 3, 5, 8):
            pick = good[lab] & (rad[lab] > (0 if r == 2 else [2, 3, 5, 8][[2, 3, 5, 8].index(r) - 1]))
            if pick.any(): mask |= (ndi.distance_transform_edt(~pick) <= r) & ~guard
    return mask & ~(guard & ~mask)

EMISSION = {'HII', 'Neb', 'EmN', 'Cl+N', 'SNR'}
# looked at and found wanting, or better seen in a neighbour's picture: these keep their symbol only
NO_PICTURE = {'NGC 1977': 'burnt out; seen in M 42\'s picture', 'NGC 1982': 'M 43: in M 42\'s picture', 'NGC 6995': 'in NGC 6992\'s picture', 'NGC 221': 'M 32: in M 31\'s picture', 'NGC 205': 'M 110: in M 31\'s picture',
              'NGC 1432': 'in the Pleiades\' picture', 'NGC 1435': 'in the Pleiades\' picture', 'IC 4703': 'in M 16\'s picture', 'IC 4715': 'a star cloud: only stars', 'NGC 2238': 'in the Rosette\'s picture', 'NGC 2246': 'in the Rosette\'s picture',
              'NGC 3132': 'burnt out on the plates: a white blob', 'NGC 3195': 'burnt out on the plates: a white blob', 'NGC 2867': 'burnt out on the plates: a white blob', 'NGC 3918': 'burnt out on the plates: a white blob', 'NGC 6302': 'burnt out on the plates: a white blob', 'NGC 6309': 'burnt out on the plates: a white blob', 'NGC 6369': 'burnt out on the plates: a white blob', 'NGC 6445': 'burnt out on the plates: a white blob', 'NGC 6543': 'burnt out on the plates: a white blob', 'NGC 6741': 'burnt out on the plates: a white blob', 'NGC 6818': 'burnt out on the plates: a white blob', 'NGC 6826': 'burnt out on the plates: a white blob', 'NGC 6905': 'burnt out on the plates: a white blob', 'NGC 7009': 'burnt out on the plates: a white blob', 'NGC 7662': 'burnt out on the plates: a white blob', 'NGC 3242': 'burnt out on the plates: a white blob', 'NGC 2068': 'burnt out on the plates: a white blob', 'NGC 6618': 'burnt out on the plates: a white blob', 'IC 2944': 'a bright star\'s halo or leftover stars spoil it', 'NGC 1980': 'a bright star\'s halo or leftover stars spoil it', 'NGC 1981': 'a bright star\'s halo or leftover stars spoil it', 'NGC 2239': 'a bright star\'s halo or leftover stars spoil it', 'NGC 2264': 'a bright star\'s halo or leftover stars spoil it', 'IC 2220': 'a bright star\'s halo or leftover stars spoil it', 'IC 348': 'a bright star\'s halo or leftover stars spoil it', 'NGC 2736': 'a bright star\'s halo or leftover stars spoil it', 'IC 443': 'a bright star\'s halo or leftover stars spoil it', 'UGC05470': 'a bright star\'s halo or leftover stars spoil it', 'NGC 3587': 'a satellite trail on the plate', 'ESO351-030': 'too faint to show', 'ESO356-004': 'too faint to show', 'PGC088608': 'too faint to show', 'NGC 1909': 'too faint to show', 'IC 2431 NED02': 'too faint to show', 'IC 434': 'in the Horsehead\'s picture', 'IC 349': 'in the Pleiades\' picture', 'NGC 4039': 'in NGC 4038\'s picture', 'NGC 4568': 'in NGC 4567\'s picture'}
def plan(o):
    t, maj = o['type'], o['maj']
    if t in ('**', '*', 'OCl', '*Ass', 'Other', 'Nova') and o['m'] not in (45,): return None      # nothing there but stars
    if maj is None or o['id'] in NO_PICTURE: return None
    s = {'PN': max(4.5 * maj, 4), 'GCl': max(1.6 * maj, 8), 'OCl': 2 * maj}.get(t, max(2.2 * maj, 6))
    s = {'Mel022': 190, 'NGC 1976': 150, 'NGC 6611': 80, 'NGC 6720': 5, 'NGC 224': 330, 'NGC 598': 130, 'B033': 80, 'NGC 6960': 120, 'NGC 6992': 120, 'NGC 6995': 90}.get(o['id'], s)
    s = min(s, 720) / 60
    if o['id'] in ('NGC 6960', 'NGC 6992', 'NGC 224', 'Mel022', 'NGC 1976'): return round(s, 4), 1400
    n = 256 if t == 'GCl' else 256 if s < 0.09 else 384 if s < 0.25 else 512 if s < 0.8 else 768 if s < 1.6 else 1024
    return round(s, 4), n

ALL = None
def rows():
    global ALL
    if ALL is None:
        ALL = []
        for f in ('dso.json', 'dso-deep.json'):
            d = json.load(open(os.path.join(ROOT, f))); ALL += [dict(zip(d['fields'], r)) for r in d['rows']]
    return ALL

def make(o, size, n, ra=None, dec=None, isCore=False, wobj=None):
    """One finished picture, n x n x 3 uint8. For a core: centred on (ra, dec), masked square-round, same content as its base."""
    cra, cdec = (o['ra'], o['dec']) if ra is None else (ra, dec)
    N = 2 * n; v = gridvec(cra, cdec, size, N); scale = size * 3600 / n
    order = int(np.clip(np.ceil(np.log2(58.63 / 512 / (size / n)) - 0.3), 3, 9))
    im = sample(order, v).reshape(n, 2, n, 2, 3).mean((1, 3)); v = gridvec(cra, cdec, size, n)
    q = (np.arange(n) + 0.5) / n * 2 - 1; QX, QY = np.meshgrid(q, q); R = np.hypot(QX, QY)
    # --- sky: a plane per colour through the (star-free) edge; a core uses its base's, handed over in wobj
    if wobj is None:
        sky = []
        ring = (R > 0.80) & (R < 1.1)
        A = np.stack([QX[ring], QY[ring], np.ones(ring.sum())], 1)
        for k in range(3):
            y = im[:, :, k][ring]; keep = np.ones(len(y), bool)
            for it in range(6):
                co = np.linalg.lstsq(A[keep], y[keep], rcond=None)[0]; r = y - A @ co; sg = 1.48 * np.median(np.abs(r[keep] - np.median(r[keep]))) + 0.3
                keep = (r < 1.0 * sg) & (r > -3 * sg)
            sky.append(co)
    else: sky = wobj
    C0, E0, U0 = basis(o['ra'], o['dec']); z = np.tensordot(C0, v, 1)
    if isCore:
        h0 = np.tan(np.radians(isCore / 2)); bx, by = -np.tensordot(E0, v, 1) / z / h0, -np.tensordot(U0, v, 1) / z / h0
    else: bx, by = QX, QY
    im = np.clip(im - np.stack([c[0] * bx + c[1] * by + c[2] for c in sky], -1), 0, 255)
    if o['type'] in EMISSION: im[:, :, 1] = 0.5 * im[:, :, 1] + 0.5 * np.minimum(im[:, :, 1], im[:, :, 2] + 0.3 * np.clip(im[:, :, 0] - im[:, :, 2], 0, None))
    # --- the middles that are burnt out on the plates
    for key, c in CORES.items():
        Cc, Ec, Uc = basis(c[2], c[3]); zc = np.tensordot(Cc, v, 1); hc = np.tan(np.radians(core_size(c) / 2))
        if zc.max() < np.cos(np.radians(2)): continue
        rr = np.where(zc > 0.5, np.hypot(np.tensordot(Ec, v, 1), np.tensordot(Uc, v, 1)) / np.maximum(zc, 0.5) / hc, 99)
        far = smooth01((rr - 1.2) / 2.2)[:, :, None]; Lm = im.mean(2, keepdims=True)
        im = (Lm + (im - Lm) * (0.45 + 0.55 * far)) * (TONE[key] + (1 - TONE[key]) * far)
        ci, w = core_layer(c, v, scale)
        im = im * (1 - w[:, :, None]) + ci * w[:, :, None]
    # --- burnt-out plateaus (nuclei of galaxies, ...): a rounded top in the colour of their rim instead of a flat white patch
    sat = im.max(2) > 215
    if sat.any() and o['type'] in ('G', 'GPair', 'GTrpl', 'GGroup'):
        dist = ndi.gaussian_filter(np.minimum(ndi.distance_transform_edt(sat), 60), 1.5); near = ndi.binary_dilation(sat, iterations=4) & ~sat
        lab, m = ndi.label(ndi.binary_dilation(sat, iterations=4))
        for q, sl in enumerate(ndi.find_objects(lab), 1):
            me = (lab[sl] == q); rim = me & near[sl]
            if rim.sum() < 8 or sat[sl][me].sum() < 4: continue
            col = np.median(im[sl][rim], 0); col = col / max(col.mean(), 1); w = np.clip(dist[sl] / 2.5, 0, 1)[:, :, None] * me[:, :, None]
            Lq = im[sl].mean(2, keepdims=True) * (1 + 0.04 * dist[sl][:, :, None])
            im[sl] = im[sl] * (1 - w) + Lq * col * w
    # --- stars out
    protect = []
    h = np.tan(np.radians(size / 2)); Cc, Ec, Uc = basis(cra, cdec)
    for p in rows():
        if p['type'] not in ('G', 'GPair', 'GTrpl', 'GGroup', 'PN') or p['maj'] is None: continue
        C1 = basis(p['ra'], p['dec'])[0]; zz = Cc @ C1
        if zz < np.cos(np.radians(size)): continue
        x, y = (1 - (Ec @ C1) / zz / h) * n / 2, (1 - (Uc @ C1) / zz / h) * n / 2; r = (0.16 if p['type'] != 'PN' else 0.5) * p['maj'] * 60 / scale
        if p['type'] != 'PN': r = min(r, 40)
        if r > 0.8: protect.append((x, y, max(r, 2)))
    cap = 110 if o['id'] in ('Mel022', 'NGC 6960') else 60 if o['type'] == 'PN' else 400
    if o['type'] != 'GCl':
        im = fill(im, starmask(im, scale, cra, cdec, size, protect, cap, [(c, core_size(c) / 2) for c in CORES.values() if basis(c[2], c[3])[0] @ Cc > np.cos(np.radians(size))]))
        im = np.stack([ndi.gaussian_filter(ndi.median_filter(im[:, :, k], 3), 0.6) for k in range(3)], -1)
        if o['id'] in ('Mel022', 'NGC 6960', 'B033'):  # the plates show ghost rings round the brightest stars: blur them away
            V, mag = catalogue(); zz = C0 @ V; h0 = np.tan(np.radians(size / 2)); sm = np.stack([ndi.gaussian_filter(im[:, :, k], 75 / scale) for k in range(3)], -1)
            for i in np.where((zz > np.cos(np.radians(1.5))) & (mag < 4.6))[0]:
                x, y = (1 - (E0 @ V[:, i]) / zz[i] / h0), (1 - (U0 @ V[:, i]) / zz[i] / h0); d = np.hypot(QX - (x - 1), QY - (y - 1)) * size * 30; w = smooth01((7 - d) / 3)[:, :, None]
                im = im * (1 - w) + sm * w
    else:                                  # a globular: only the glow of the stars that cannot be told apart
        im = np.stack([ndi.gaussian_filter(ndi.percentile_filter(im[:, :, k], 35, max(3, n // 40)), n / 60) for k in range(3)], -1)
        L = im.mean(2, keepdims=True); im = im / np.maximum(L, 1) * 95 * (L / max(L.max(), 1)) ** 1.8      # the plates are burnt out in the middle: give the glow a peak again
    # --- faint residue to nothing, highlights and colour tamed
    L = im.mean(2, keepdims=True); t = 14.0 if o['id'] in ('NGC 6960', 'NGC 6992') else 7.0
    im = im * (L / (L + t)) * smooth01((L - 0.2 * t) / t)
    if o['type'] in EMISSION | {'DrkN'}:      # the survey's two plates turn the red of hydrogen into brown: give it back some of its hue
        L = im.mean(2, keepdims=True); red = np.clip((im[:, :, :1] - im[:, :, 2:]) / np.maximum(L, 1), 0, 1) * 0.6
        im = im * (1 - red) + L * np.array([1.42, 0.76, 0.82]) * red
    L = im.mean(2, keepdims=True); gain = np.where(L > 1e-3, 190 * (1 - np.exp(-L / 140)) / np.maximum(L, 1e-3), 1)
    im = im * gain; L = im.mean(2, keepdims=True); im = L + (im - L) * (0.6 if o['id'] in ('NGC 6720', 'NGC 6853') else 0.78)
    # --- and an edge that cannot be seen
    if isCore:
        m = smooth01((0.94 - R) / 0.3)
        rb = np.hypot(bx, by); m = m * smooth01((0.93 - rb) / 0.5)
    else:
        a, b = 1.0, 1.0; c, d = QX, QY
        if o['type'] in ('G', 'GPair') and o['maj'] and o['min'] and o['pa'] is not None:
            th = np.radians(o['pa']); along = -QX * np.sin(th) - QY * np.cos(th); across = -QX * np.cos(th) + QY * np.sin(th)      # north up, east left; angle from north through east
            b = float(np.clip(1.35 * o['min'] / o['maj'], 0.45, 1)); c, d = along, across / b
        m = smooth01((0.93 - np.hypot(c, d)) / 0.5)
    out = np.clip(im * m[:, :, None], 0, 255)
    return np.where(out < 0.75, 0, out + 0.5).astype(np.uint8), sky, order

def save(name, im):
    q = os.path.join(ROOT, 'img', name); n = im.shape[0]; ok = ndi.binary_dilation(im.max(2) > 0, iterations=2)                # fully transparent wherever there is nothing: nothing at all is added there
    Image.fromarray(np.dstack([im, np.where(ok, 255, 0).astype(np.uint8)])).save(q, quality=93, method=6)
    back = np.asarray(Image.open(q).convert('RGBA')).astype(int); back = back[:, :, :3] * back[:, :, 3:] // 255; e = max(back[0].max(), back[-1].max(), back[:, 0].max(), back[:, -1].max())
    n = im.shape[0]; qq = np.abs((np.arange(n) + 0.5) / n * 2 - 1); R = np.hypot(*np.meshgrid(qq, qq))
    return os.path.getsize(q), int(e), int(back[R > 0.96].max())

def job(o):
    size, n = plan(o); f = re.sub(r'[^a-z0-9]+', '-', o['id'].lower()) + '.webp'
    im, sky, order = make(o, size, n); b, e, r = save(f, im); out = [(o['id'], [f, size, n], b, e, r, order, int(im.max()))]
    if o['id'] in CORES:
        c = CORES[o['id']]; s2 = round(core_size(c), 5); f2 = f.replace('.webp', '-core.webp')
        im2, _, order = make(o, s2, 1400 if o['id'] == 'NGC 1976' else 1024 if s2 > 0.15 else 700, c[2], c[3], isCore=size, wobj=sky); b, e, r = save(f2, im2)
        out.append((o['id'] + '|core', [f2, s2, im2.shape[0], c[2], c[3], c[1]], b, e, r, order, int(im2.max())))
    return out

if __name__ == '__main__':
    os.makedirs(os.path.join(ROOT, 'img'), exist_ok=True)
    only = sys.argv[2:]; d = json.load(open(os.path.join(ROOT, 'dso.json')))
    objs = [o for o in (dict(zip(d['fields'], r)) for r in d['rows']) if (o['m'] or o['c'] or o['names']) and plan(o) and (not only or o['id'] in only)]
    idx = os.path.join(ROOT, 'img', 'index.json'); items = json.load(open(idx))['items'] if only and os.path.exists(idx) else {}
    total, bad = 0, []
    if not only:
        for f in os.listdir(os.path.join(ROOT, 'img')):
            if f.endswith('.webp'): os.remove(os.path.join(ROOT, 'img', f))
    with mp.Pool(6) as pool:
        for res in pool.imap_unordered(job, objs):
            for key, item, b, e, r, order, top in res:
                items[key] = item; total += b
                print(f'{key:16s} {item[1] * 60:7.1f} arcmin {item[2]:5d} px order {order} {b / 1000:7.1f} kB  border max {e}  outside the fade {r}  peak {top}', flush=True)
                if e or r: bad.append(key)
    json.dump({'date': time.strftime('%Y-%m-%d'), 'source': 'Digitized Sky Survey 2 in colour (STScI; colour composition CDS), tiles from ESA skies.esac.esa.int, CC BY-NC-SA 4.0; sky and stars removed',
               'projection': 'gnomonic about the catalogue place, J2000 north up, east left; [file, size in degrees, pixels]; "|core" items: [file, size, pixels, centre RA, Dec, credit]', 'items': dict(sorted(items.items()))}, open(idx, 'w'), indent=0)
    print(len(items), 'pictures', round(total / 1e6, 2), 'MB; border not zero:', bad)
