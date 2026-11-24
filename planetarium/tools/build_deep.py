#!/usr/bin/env python3
"""build_deep.py: the self-hosted deep-star tile set: Gaia DR3, 12 <= G < 17 (154.6 million sources), downloaded from
the ESA Gaia archive without an account and cut into static HEALPix tiles for js/deepstars.js.

    python3 tools/build_deep.py OUT_DIR WORK_DIR [--gmax 17] [--workers 4]
    python3 tools/build_deep.py OUT_DIR WORK_DIR --status          # where the job stands; nothing is downloaded
    python3 tools/build_deep.py OUT_DIR WORK_DIR --verify          # every tile file present, right size, right star count
    python3 tools/build_deep.py OUT_DIR WORK_DIR --exclude hyg_gaia_ids.csv     # the stars the app already draws from HYG (see below)
    python3 tools/build_deep.py OUT_DIR WORK_DIR --list            # OUT_DIR/files.tsv: path, bytes, md5 of every file to upload

OUT_DIR is the versioned folder that is uploaded as it is (.../astro-labs-stars/gaia/v1). WORK_DIR holds the raw CSV
of the chunks in hand (a few hundred MB at most: each chunk is deleted as soon as its tiles are written) and the count
tables. The job can be stopped at any time and run again: OUT_DIR/progress.json lists the finished chunks (rows,
bytes, the archive's COUNT(*) they were checked against) and those are skipped.

Download. Anonymous synchronous TAP queries (MAXREC 3,000,000). First the exact number of sources per HEALPix order-4
cell and half magnitude (five GROUP BY queries: WORK_DIR/counts_<m>.csv). A chunk = one half-magnitude level and a run
of whole order-3 pixels holding about 500,000 sources: a range of source_id (a Gaia source_id starts with the source's
order-12 nested pixel) plus a magnitude range. Every chunk's row count is checked twice: against the count table and
against a COUNT(*) query of the same WHERE. A cut-off or failed chunk is retried with back-off (20 s ... 10 min) and
then split in two. Levels are done brightest first, so what is finished is always all-sky complete to some magnitude:
OUT_DIR/manifest.json lists only the complete levels. Nothing identifying is sent: a generic User-Agent, no cookies.

Tiles. Per level a quadtree over the 768 order-3 pixels: a pixel holding more than MAX_STARS sources is split in four
(down to order 11). Leaves are the tiles: OUT_DIR/<level>/<order>/<ipix>.bin. A tile = exactly the Gaia sources whose
source_id lies in that pixel and whose G lies in the level, so the same tile can be asked of any Gaia DR3 TAP service
(js/deepstars.js does that at GAVO when the hosted set is unreachable).

Tile file (little-endian), stars sorted by G:
  header 20 bytes: 'GDT1', u32 n, u32 nx, u32 ipix, u8 order, u8 level, u8 version (1), u8 0
  columns:  u16 xlo[n], u16 ylo[n], u8 xyhi[n] (x >> 16 | (y >> 16) << 4), u8 g[n], u8 col[n], i8 pmra[n], i8 pmdec[n], u8 plx[n]
  exceptions: nx records of 16 bytes: u32 index, f32 pmra, f32 pmdec, f32 parallax (NaN = Gaia has none)
  x, y   20 bits each: the star's place at epoch 2000.0 (Gaia's 2016.0 place moved back 16 years with Gaia's own proper
         motion; no motion in Gaia = the 2016 place) in the tangent plane at the pixel's centre c, with east e =
         unit(z x c) and north n = c x e:  xi = s.e / s.c, eta = s.n / s.c,  x = round(xi / T * 2^19) + 2^19,
         T = tan(1.15 * sqrt(pi / 3) / 2^order + 0.002). Worst rounding 0.03 arcsec an axis (order 3), 0.004 at order 6.
  g      (G - level's m0) / 0.002, rounded: 0 .. 250
  col    (BP-RP + 1) / 0.02, 0 .. 254 (clamped: -1 .. 4.08);  255 = no colour in Gaia DR3
  pm     q = -126 .. 126:  pm = sign(q) |q| (0.2 + 0.016 |q|) mas/yr (steps of 0.2 near zero, range 279);
         -128 in both = no proper motion in Gaia DR3;  127 in both = in the exception table
  plx    q = 0 .. 253:  parallax = q (0.04 + 0.002 q) mas (0 = below 0.02 mas or negative; range 138 mas);
         255 = no parallax in Gaia DR3;  254 = in the exception table
Stars the app already has. tools/build_stars.py gives about 100,000 HYG stars Gaia's astrometry and lists their Gaia source_id
(hyg_gaia_ids.csv, not in the repo). The few hundred of them with G >= 12 are in these tiles too and would be drawn twice at the
same spot. The tiles are left as the archive has them (a tile stays one source_id range, counts stay equal to COUNT(*), files
stay immutable); --exclude asks the archive for those sources, finds each one's tile and its index in it, and writes
OUT_DIR/skip.json, which goes into manifest.json as `skip` ({"level/order/ipix": [index, ...]}) and `skipIds` (the source_ids, for
the online service's rows). The app drops them when it decodes a tile. Run it again whenever hyg_gaia_ids.csv changes: only
manifest.json changes.

No source_id (8 bytes a star = 1.2 GB more): a clicked star is looked up online by position, like the bundled stars.
"""
import sys, os, io, json, math, time, threading, urllib.request, urllib.parse, argparse, datetime
import numpy as np
import pandas as pd

TAP = 'https://gea.esac.esa.int/tap-server/tap'
UA = {'User-Agent': 'Mozilla/5.0 (catalogue download script)'}
GMIN = 12.0
ROOT = 3                    # order of the quadtree roots
MAX_ORDER = 11
MAX_STARS = 4096            # a pixel with more stars than this is split in four
CHUNK_ROWS = 500000         # target rows of one download
YEARS = 16.0                # Gaia DR3 epoch 2016.0 -> 2000.0
PM_A, PM_B = 0.2, 0.016
PX_A, PX_B = 0.04, 0.002
G_STEP, C_STEP, C_MIN = 0.002, 0.02, -1.0
COLS = ('GAIA_HEALPIX_INDEX(12, source_id) AS hp, ROUND(ra,8) AS ra, ROUND(dec,8) AS dec, ROUND(phot_g_mean_mag,4) AS g, '
        'ROUND(bp_rp,3) AS c, ROUND(pmra,2) AS pmra, ROUND(pmdec,2) AS pmdec, ROUND(parallax,2) AS plx')
CREDIT = 'Gaia DR3 (Gaia Collaboration 2016, 2023). Credit: ESA/Gaia/DPAC.'
ACK = ('This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), '
       'processed by the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). '
       'Funding for the DPAC has been provided by national institutions, in particular the institutions participating in the '
       'Gaia Multilateral Agreement.')
LICENCE = 'CC BY-NC 3.0 IGO (https://www.cosmos.esa.int/web/gaia-users/license): non-commercial use, with attribution.'

lock = threading.Lock()
stop = threading.Event()


def log(*a):
    print(datetime.datetime.now().strftime('%H:%M:%S'), *a, flush=True)


# ---- the archive -------------------------------------------------------------------------------------------
def http(q, maxrec=3000000, timeout=900):
    data = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'MAXREC': str(maxrec), 'QUERY': q}).encode()
    return urllib.request.urlopen(urllib.request.Request(TAP + '/sync', data=data, headers=UA), timeout=timeout)


def where(level, a, b):
    """WHERE clause of order-4 cells a .. b-1 in half-magnitude level `level` (0 = 12.0-12.5)."""
    m0 = GMIN + 0.5 * level
    lo, hi = a << 51, (b << 51) - 1                    # order-4 cell = source_id >> (35 + 2 * 8)
    return f'gaiadr3.gaia_source WHERE source_id BETWEEN {lo} AND {hi} AND phot_g_mean_mag >= {m0} AND phot_g_mean_mag < {m0 + 0.5}'


def archive_count(level, a, b):
    with http('SELECT COUNT(*) FROM ' + where(level, a, b)) as r:
        return int(r.read().decode().split()[1])


def load_counts(work, gmax):
    """counts[level][order-4 cell]: the archive's own number of sources (exact)."""
    nl = int(round((gmax - GMIN) * 2))
    out = np.zeros((nl, 3072), dtype=np.int64)
    for m in range(int(GMIN), int(math.ceil(gmax))):
        f = os.path.join(work, f'counts_{m}.csv')
        if not (os.path.exists(f) and os.path.getsize(f) > 0):
            q = ('SELECT hp, mb, COUNT(*) AS n FROM (SELECT GAIA_HEALPIX_INDEX(4, source_id) AS hp, FLOOR(phot_g_mean_mag*2) AS mb '
                 f'FROM gaiadr3.gaia_source WHERE phot_g_mean_mag >= {m} AND phot_g_mean_mag < {m + 1}) AS s GROUP BY hp, mb')
            with http(q) as r, open(f + '.part', 'wb') as o:
                o.write(r.read())
            os.rename(f + '.part', f)
            log('wrote', f)
            time.sleep(1)
        d = pd.read_csv(f)
        for hp, mb, n in zip(d.hp.values, d.mb.values, d.n.values):
            L = int(round(mb)) - int(GMIN * 2)
            if 0 <= L < nl: out[L, int(hp)] = n
    return out


def plan(counts):
    """Chunks: [(level, a, b, rows)] with a, b order-4 cells on order-3 boundaries; brightest level first."""
    jobs = []
    for L in range(counts.shape[0]):
        root = counts[L].reshape(768, 4).sum(axis=1)
        a = 0; acc = 0
        for r in range(768):
            if acc and acc + root[r] > CHUNK_ROWS * 1.3:
                jobs.append((L, 4 * a, 4 * r, int(acc))); a = r; acc = 0
            acc += root[r]
        jobs.append((L, 4 * a, 4 * 768, int(acc)))
    return jobs


def download(level, a, b, rows, path, counts):
    """Fetch order-4 cells a .. b-1 of a level into CSV file(s); returns the list of files. Retries, then splits."""
    for attempt in range(4):
        if stop.is_set(): raise KeyboardInterrupt
        try:
            got = -1
            with http(f'SELECT {COLS} FROM ' + where(level, a, b)) as r, open(path, 'wb') as f:
                while True:
                    buf = r.read(1 << 20)
                    if not buf: break
                    got += buf.count(b'\n'); f.write(buf)
            if got == rows: return [path]
            log(f'  L{level} {a}-{b}: {got} rows, expected {rows} (attempt {attempt + 1})')
            if b - a > 1 and attempt >= 1: break                 # cut off twice: smaller pieces
        except KeyboardInterrupt:
            raise
        except Exception as e:
            log(f'  L{level} {a}-{b}: {type(e).__name__} {e} (attempt {attempt + 1})')
        stop.wait(min(600, 20 * 3 ** attempt))
    if b - a <= 1: raise RuntimeError(f'L{level} cell {a}: cannot be downloaded complete')
    mid = (a + b) // 2
    if os.path.exists(path): os.remove(path)
    return (download(level, a, mid, int(counts[level, a:mid].sum()), path + 'a', counts) +
            download(level, mid, b, int(counts[level, mid:b].sum()), path + 'b', counts))


# ---- HEALPix (nested): centre of a pixel, the same arithmetic as js/healpix.js ------------------------------
JRLL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4]; JPLL = [1, 3, 5, 7, 0, 2, 4, 6, 1, 3, 5, 7]


def squeeze(v):
    r = 0
    for b in range(13): r |= ((v >> (2 * b)) & 1) << b
    return r


def pix2vec(order, ipix):
    ns = 1 << order; npf = ns * ns; face = ipix // npf; ipf = ipix - face * npf
    ix = squeeze(ipf); iy = squeeze(ipf >> 1)
    jr = JRLL[face] * ns - ix - iy - 1
    if jr < ns: nr = jr; z = 1 - nr * nr / (3 * npf); kshift = 0
    elif jr > 3 * ns: nr = 4 * ns - jr; z = nr * nr / (3 * npf) - 1; kshift = 0
    else: nr = ns; z = (2 * ns - jr) * 2 / (3 * ns); kshift = (jr - ns) & 1
    jp = (JPLL[face] * nr + ix - iy + 1 + kshift) >> 1
    if jp > 4 * ns: jp -= 4 * ns
    if jp < 1: jp += 4 * ns
    phi = (jp - (kshift + 1) * 0.5) * (math.pi / 2) / nr; s = math.sqrt(max(0.0, 1 - z * z))
    return np.array([s * math.cos(phi), s * math.sin(phi), z])


def tan_radius(order):
    return math.tan(1.15 * math.sqrt(math.pi / 3) / (1 << order) + 0.002)


def tile_frame(order, ipix):
    c = pix2vec(order, ipix)
    e = np.array([-c[1], c[0], 0.0]); e /= np.linalg.norm(e)
    return c, e, np.cross(c, e)


# ---- tiles ---------------------------------------------------------------------------------------------------
def compand(v, a, b):
    """q >= 0 with v ~ q (a + b q)."""
    return np.rint((-a + np.sqrt(a * a + 4 * b * v)) / (2 * b))


def write_tile(out, level, order, ipix, d, st):
    """d: dict of arrays for the stars of this pixel (any order). Writes the tile; returns bytes."""
    n = len(d['g'])
    o = np.lexsort((d['hp'], d['g']))
    g = d['g'][o]; col = d['c'][o]; pa = d['pmra'][o]; pd_ = d['pmdec'][o]; px = d['plx'][o]; vec = d['vec'][o]
    c, e, nn = tile_frame(order, ipix)
    T = tan_radius(order)
    sc = vec @ c
    xi = (vec @ e) / sc; eta = (vec @ nn) / sc
    x = np.rint(xi / T * 524288).astype(np.int64) + 524288; y = np.rint(eta / T * 524288).astype(np.int64) + 524288
    if x.min() < 0 or x.max() > 1048575 or y.min() < 0 or y.max() > 1048575 or sc.min() <= 0:
        raise RuntimeError(f'tile {level}/{order}/{ipix}: a star falls outside the tile frame')
    # rounding error of the stored place (arcsec), kept for the audit
    back = c + np.outer((x - 524288) * (T / 524288), e) + np.outer((y - 524288) * (T / 524288), nn)
    back /= np.linalg.norm(back, axis=1)[:, None]
    err = np.degrees(np.arccos(np.clip(np.einsum('ij,ij->i', back, vec), -1, 1))).max() * 3600
    gq = np.clip(np.rint((g - (GMIN + 0.5 * level)) / G_STEP), 0, 250).astype(np.uint8)
    cq = np.where(np.isnan(col), 255, np.clip(np.rint((np.nan_to_num(col) - C_MIN) / C_STEP), 0, 254)).astype(np.uint8)
    nopm = np.isnan(pa) | np.isnan(pd_)
    qa = compand(np.abs(np.nan_to_num(pa)), PM_A, PM_B); qd = compand(np.abs(np.nan_to_num(pd_)), PM_A, PM_B)
    pmx = ~nopm & ((qa > 126) | (qd > 126))
    qa = np.where(nopm, -128, np.where(pmx, 127, np.sign(np.nan_to_num(pa)) * qa)).astype(np.int8)
    qd = np.where(nopm, -128, np.where(pmx, 127, np.sign(np.nan_to_num(pd_)) * qd)).astype(np.int8)
    nopx = np.isnan(px)
    qp = compand(np.clip(np.nan_to_num(px), 0, None), PX_A, PX_B)
    pxx = ~nopx & (qp > 253)
    qp = np.where(nopx, 255, np.where(pxx, 254, qp)).astype(np.uint8)
    ex = np.nonzero(pmx | pxx)[0]
    buf = io.BytesIO()
    buf.write(b'GDT1' + np.array([n, len(ex), ipix], dtype='<u4').tobytes() + bytes([order, level, 1, 0]))
    buf.write((x & 0xFFFF).astype('<u2').tobytes()); buf.write((y & 0xFFFF).astype('<u2').tobytes())
    buf.write(((x >> 16) | ((y >> 16) << 4)).astype(np.uint8).tobytes())
    for arr in (gq, cq, qa, qd, qp): buf.write(arr.tobytes())
    if len(ex):
        rec = np.zeros(len(ex), dtype=[('i', '<u4'), ('a', '<f4'), ('d', '<f4'), ('p', '<f4')])
        rec['i'] = ex; rec['a'] = pa[ex]; rec['d'] = pd_[ex]; rec['p'] = px[ex]
        buf.write(rec.tobytes())
    data = buf.getvalue()
    assert len(data) == 20 + 10 * n + 16 * len(ex)
    folder = os.path.join(out, str(level), str(order))
    os.makedirs(folder, exist_ok=True)
    path = os.path.join(folder, f'{ipix}.bin')
    with open(path + '.tmp', 'wb') as f: f.write(data)
    os.rename(path + '.tmp', path)
    st['tiles'] += 1; st['bytes'] += len(data); st['stars'] += n; st['exceptions'] += len(ex)
    st['no_pm'] += int(nopm.sum()); st['no_colour'] += int((cq == 255).sum()); st['no_plx'] += int(nopx.sum())
    st['max_err'] = max(st['max_err'], float(err)); st['max_tile'] = max(st['max_tile'], n); st['max_order'] = max(st['max_order'], order)
    return len(data)


def build(out, level, a, b, files):
    """Tiles of order-4 cells a .. b-1 from the chunk's CSV file(s). Returns (stats, {root: tree string})."""
    df = pd.concat([pd.read_csv(f) for f in files], ignore_index=True) if len(files) > 1 else pd.read_csv(files[0])
    assert list(df.columns) == ['hp', 'ra', 'dec', 'g', 'c', 'pmra', 'pmdec', 'plx'], list(df.columns)
    df = df.sort_values('hp', kind='stable')
    hp = df.hp.values.astype(np.int64)
    assert len(hp) == 0 or (hp[0] >> 16 >= a and hp[-1] >> 16 < b)
    ra = df.ra.values; dec = df.dec.values; pa = df.pmra.values.astype(np.float64); pd_ = df.pmdec.values.astype(np.float64)
    # epoch 2000.0: the same straight step in RA and Dec that the app takes forward again
    dec0 = dec - np.nan_to_num(pd_) * YEARS / 3.6e6
    ra0 = ra - np.nan_to_num(pa) * YEARS / 3.6e6 / np.maximum(1e-6, np.cos(np.radians(dec)))
    cd = np.cos(np.radians(dec0))
    vec = np.stack([cd * np.cos(np.radians(ra0)), cd * np.sin(np.radians(ra0)), np.sin(np.radians(dec0))], axis=1)
    cols = dict(hp=hp, g=df.g.values.astype(np.float64), c=df.c.values.astype(np.float64), pmra=pa, pmdec=pd_, plx=df.plx.values.astype(np.float64), vec=vec)
    st = dict(rows=len(hp), tiles=0, bytes=0, stars=0, exceptions=0, no_pm=0, no_colour=0, no_plx=0, max_err=0.0, max_tile=0, max_order=0)

    def node(order, ipix, i0, i1):
        if i1 == i0: return '0'
        if i1 - i0 > MAX_STARS and order < MAX_ORDER:
            sh = 2 * (12 - order - 1)
            cut = [i0 + int(np.searchsorted(hp[i0:i1], (4 * ipix + k) << sh)) for k in range(1, 4)]
            edges = [i0] + cut + [i1]
            return '2' + ''.join(node(order + 1, 4 * ipix + k, edges[k], edges[k + 1]) for k in range(4))
        write_tile(out, level, order, ipix, {k: v[i0:i1] for k, v in cols.items()}, st)
        return '1'

    trees = {}
    sh = 2 * (12 - ROOT)
    for r in range(a // 4, b // 4):
        i0 = int(np.searchsorted(hp, r << sh)); i1 = int(np.searchsorted(hp, (r + 1) << sh))
        trees[str(r)] = node(ROOT, r, i0, i1)
    assert st['stars'] == len(hp)
    return st, trees


# ---- progress and manifest -------------------------------------------------------------------------------------
def read_progress(out):
    f = os.path.join(out, 'progress.json')
    return json.load(open(f)) if os.path.exists(f) else {'jobs': {}}


def save_progress(out, prog):
    f = os.path.join(out, 'progress.json')
    with open(f + '.tmp', 'w') as o: json.dump(prog, o, separators=(',', ':'))
    os.replace(f + '.tmp', f)


def write_manifest(out, prog, jobs, nl):
    """manifest.json: the levels whose every chunk is done, counted from the brightest (no gaps, never patchy)."""
    levels = []
    for L in range(nl):
        mine = [j for j in jobs if j[0] == L]
        if not all(f'{j[0]}:{j[1]}-{j[2]}' in prog['jobs'] for j in mine): break
        recs = [prog['jobs'][f'{j[0]}:{j[1]}-{j[2]}'] for j in mine]
        trees = {}
        for r in recs: trees.update(r['trees'])
        levels.append(dict(dir=str(L), m0=GMIN + 0.5 * L, m1=GMIN + 0.5 * L + 0.5,
                           stars=sum(r['stars'] for r in recs), tiles=sum(r['tiles'] for r in recs), bytes=sum(r['bytes'] for r in recs),
                           maxOrder=max(r['max_order'] for r in recs), maxTile=max(r['max_tile'] for r in recs),
                           tree=''.join(trees[str(r)] for r in range(768))))
    m = dict(
        format='gaia-deep-tiles', version=1, catalogue='Gaia DR3 (gaiadr3.gaia_source, ESA Gaia archive)',
        credit=CREDIT, acknowledgement=ACK, licence=LICENCE, built=datetime.date.today().isoformat(),
        epoch=2000.0, magStart=GMIN, magEnd=GMIN + 0.5 * len(levels),
        scheme='HEALPix nested, ICRS. A tile is <dir>/<order>/<ipix>.bin = the Gaia sources whose source_id lies in that pixel '
               '(source_id >> (35 + 2 * (12 - order)) = ipix) and whose G lies in [m0, m1). tree = per level, for the 768 order-3 '
               'pixels in turn, depth first: 2 = split in four, 1 = a tile, 0 = no stars (no file).',
        rootOrder=ROOT, maxStars=MAX_STARS,
        record=dict(header=20, bytes=10, exception=16, posBits=20, posMargin=0.002, reach=1.15, gStep=G_STEP, colStep=C_STEP, colMin=C_MIN,
                    pm=[PM_A, PM_B], plx=[PX_A, PX_B],
                    layout="header: 'GDT1', u32 n, u32 nx, u32 ipix, u8 order, u8 level, u8 version, u8 0; columns: u16 xlo[n], u16 ylo[n], "
                           'u8 xyhi[n], u8 g[n], u8 col[n], i8 pmra[n], i8 pmdec[n], u8 plx[n]; then nx x (u32 index, f32 pmra, f32 pmdec, f32 plx)'),
        stars=sum(l['stars'] for l in levels), tiles=sum(l['tiles'] for l in levels), bytes=sum(l['bytes'] for l in levels),
        levels=levels)
    sk = os.path.join(out, 'skip.json')
    if os.path.exists(sk):
        k = json.load(open(sk))
        m['skip'] = {key: v for key, v in k['skip'].items() if int(key.split('/')[0]) < len(levels)}
        m['skipIds'] = k['ids']; m['skipNote'] = k['note']
    f = os.path.join(out, 'manifest.json')
    with open(f + '.tmp', 'w') as o: json.dump(m, o, separators=(',', ':'))
    os.replace(f + '.tmp', f)
    return m


def status(out, prog, jobs, nl):
    for L in range(nl):
        mine = [j for j in jobs if j[0] == L]
        done = [prog['jobs'][k] for k in (f'{j[0]}:{j[1]}-{j[2]}' for j in mine) if k in prog['jobs']]
        print(f'level {L} (G {GMIN + 0.5 * L:.1f}-{GMIN + 0.5 * L + 0.5:.1f}): {len(done)}/{len(mine)} chunks, '
              f'{sum(r["stars"] for r in done):,} of {sum(j[3] for j in mine):,} stars, {sum(r["tiles"] for r in done):,} tiles, '
              f'{sum(r["bytes"] for r in done) / 1e6:.1f} MB' + ('  COMPLETE' if len(done) == len(mine) else ''))
    d = list(prog['jobs'].values())
    print(f'total: {len(d)}/{len(jobs)} chunks, {sum(r["stars"] for r in d):,} of {sum(j[3] for j in jobs):,} stars, '
          f'{sum(r["tiles"] for r in d):,} tiles, {sum(r["bytes"] for r in d) / 1e6:.1f} MB')


def verify(out, m):
    bad = 0
    for lv in m['levels']:
        L = int(lv['dir']); n = files = size = 0
        pos = 0; tree = lv['tree']

        def walk(order, ipix):
            nonlocal pos, n, files, size, bad
            ch = tree[pos]; pos += 1
            if ch == '2':
                for k in range(4): walk(order + 1, 4 * ipix + k)
            elif ch == '1':
                p = os.path.join(out, str(L), str(order), f'{ipix}.bin')
                try:
                    with open(p, 'rb') as f: h = f.read(20)
                    nn, nx, ip = np.frombuffer(h[4:16], dtype='<u4')
                    ok = h[:4] == b'GDT1' and ip == ipix and h[16] == order and h[17] == L and os.path.getsize(p) == 20 + 10 * nn + 16 * nx
                except OSError:
                    ok = False; nn = 0
                if not ok: bad += 1; print('BAD', p)
                else: n += int(nn); files += 1; size += os.path.getsize(p)
        for r in range(768): walk(ROOT, r)
        assert pos == len(tree)
        on_disk = sum(len(fs) for _, _, fs in os.walk(os.path.join(out, str(L))))
        flag = 'ok' if (n == lv['stars'] and files == lv['tiles'] and size == lv['bytes'] and on_disk == files) else 'MISMATCH'
        if flag != 'ok': bad += 1
        print(f'level {L}: {files} files ({on_disk} on disk), {n:,} stars, {size:,} bytes: {flag}')
    print('verify:', 'all good' if not bad else f'{bad} problems')
    return bad


def leaf_of(tree_by_root, hp12):
    """(order, ipix) of the tile holding order-12 pixel hp12, from the level's {root: tree string}; None if no stars there."""
    tree = tree_by_root[str(hp12 >> 18)]; pos = 0; order = ROOT; ipix = hp12 >> 18
    while True:
        ch = tree[pos]
        if ch == '1': return order, ipix
        if ch == '0': return None
        child = (hp12 >> (2 * (12 - order - 1))) & 3
        pos += 1
        for _ in range(child):                         # step over the earlier children's subtrees
            depth = 1
            while depth:
                c = tree[pos]; pos += 1; depth += 3 if c == '2' else -1
        order += 1; ipix = 4 * ipix + child


def exclude(out, prog, ids_csv, nl):
    """skip.json: where in the tiles the sources listed in ids_csv (column source_id) are."""
    ids = [int(x) for x in pd.read_csv(ids_csv).source_id.values]
    gmax = GMIN + 0.5 * nl
    rows = []
    for i in range(0, len(ids), 2000):
        q = ('SELECT source_id, ROUND(ra,8) AS ra, ROUND(dec,8) AS dec, ROUND(phot_g_mean_mag,4) AS g, ROUND(pmra,2) AS pmra, ROUND(pmdec,2) AS pmdec '
             f'FROM gaiadr3.gaia_source WHERE source_id IN ({",".join(map(str, ids[i:i + 2000]))}) AND phot_g_mean_mag >= {GMIN} AND phot_g_mean_mag < {gmax}')
        with http(q) as r: d = pd.read_csv(r, dtype={'source_id': str})
        rows.append(d); log(f'  ids {i}-{i + 2000}: {len(d)} in G {GMIN}-{gmax}'); time.sleep(0.5)
    d = pd.concat(rows, ignore_index=True)
    trees = [{} for _ in range(nl)]
    for key, j in prog['jobs'].items(): trees[int(key.split(':')[0])].update(j['trees'])
    skip = {}; found = []; missing = []
    for sid, ra, dec, g, pa, pd_ in zip(d.source_id, d.ra, d.dec, d.g, d.pmra, d.pmdec):
        L = min(nl - 1, int((g - GMIN) * 2)); hp = int(sid) >> 35
        leaf = leaf_of(trees[L], hp) if str(hp >> 18) in trees[L] else None
        hit = None
        if leaf:
            order, ipix = leaf
            b = open(os.path.join(out, str(L), str(order), f'{ipix}.bin'), 'rb').read(); n = int(np.frombuffer(b[4:8], '<u4')[0])
            x = np.frombuffer(b, '<u2', n, 20).astype(np.int64); y = np.frombuffer(b, '<u2', n, 20 + 2 * n).astype(np.int64); hi = np.frombuffer(b, 'u1', n, 20 + 4 * n).astype(np.int64)
            gq = np.frombuffer(b, 'u1', n, 20 + 5 * n).astype(np.int64)
            x |= (hi & 15) << 16; y |= (hi >> 4) << 16
            c, e, nn = tile_frame(order, ipix); T = tan_radius(order) / 524288
            v = c + np.outer((x - 524288) * T, e) + np.outer((y - 524288) * T, nn); v /= np.linalg.norm(v, axis=1)[:, None]
            pa0 = 0.0 if pa != pa else pa; pd0 = 0.0 if pd_ != pd_ else pd_
            de = math.radians(dec - pd0 * YEARS / 3.6e6); al = math.radians(ra - pa0 * YEARS / 3.6e6 / max(1e-6, math.cos(math.radians(dec))))
            s = np.array([math.cos(de) * math.cos(al), math.cos(de) * math.sin(al), math.sin(de)])
            sep = np.degrees(np.arccos(np.clip(v @ s, -1, 1))) * 3600
            want = int(np.clip(np.rint((g - (GMIN + 0.5 * L)) / G_STEP), 0, 250))
            cand = np.nonzero((sep < 0.1) & (np.abs(gq - want) <= 1))[0]
            if len(cand) == 1: hit = int(cand[0])
        if hit is None: missing.append(sid)
        else: skip.setdefault(f'{L}/{order}/{ipix}', []).append(hit); found.append(sid)
    for v in skip.values(): v.sort()
    note = (f'{len(found)} Gaia DR3 sources that the app draws from its bright-star catalogue (HYG with Gaia astrometry, tools/build_stars.py): '
            'index of each within its tile (skip) and source_id (skipIds). Written by build_deep.py --exclude.')
    with open(os.path.join(out, 'skip.json'), 'w') as o: json.dump(dict(note=note, ids=sorted(found, key=int), skip=skip), o, separators=(',', ':'))
    log(f'exclude: {len(ids)} ids listed, {len(d)} of them in G {GMIN}-{gmax}, {len(found)} found in {len(skip)} tiles, {len(missing)} not found {missing[:5]}')


def file_list(out):
    import hashlib
    rows = []
    for base, dirs, files in os.walk(out):
        dirs.sort()
        for f in sorted(files):
            p = os.path.join(base, f); rel = os.path.relpath(p, out)
            if rel in ('progress.json', 'skip.json', 'files.tsv') or f.endswith('.tmp') or f.startswith('.'): continue
            rows.append((rel, os.path.getsize(p), hashlib.md5(open(p, 'rb').read()).hexdigest()))
    with open(os.path.join(out, 'files.tsv'), 'w') as o:
        o.write('path\tbytes\tmd5\n')
        for r in rows: o.write('%s\t%d\t%s\n' % r)
    log(f'files.tsv: {len(rows):,} files, {sum(r[1] for r in rows):,} bytes')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('work')
    ap.add_argument('--gmax', type=float, default=17.0)
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--status', action='store_true'); ap.add_argument('--verify', action='store_true')
    ap.add_argument('--exclude', metavar='IDS_CSV'); ap.add_argument('--list', action='store_true')
    args = ap.parse_args()
    out, work = args.out, args.work
    os.makedirs(out, exist_ok=True); os.makedirs(work, exist_ok=True)
    counts = load_counts(work, args.gmax)
    nl = counts.shape[0]
    jobs = plan(counts)
    prog = read_progress(out)
    if args.status: status(out, prog, jobs, nl); return
    if args.exclude:
        exclude(out, prog, args.exclude, sum(1 for L in range(nl) if all(f'{j[0]}:{j[1]}-{j[2]}' in prog['jobs'] for j in jobs if j[0] == L)))
        m = write_manifest(out, prog, jobs, nl); log(f'manifest: {sum(len(v) for v in m.get("skip", {}).values())} stars to skip'); return
    if args.list: write_manifest(out, prog, jobs, nl); file_list(out); return
    if args.verify: sys.exit(1 if verify(out, write_manifest(out, prog, jobs, nl)) else 0)
    todo = [j for j in jobs if f'{j[0]}:{j[1]}-{j[2]}' not in prog['jobs']]
    log(f'{len(jobs)} chunks, {len(todo)} to do, {sum(j[3] for j in todo):,} rows')
    for f in os.listdir(work):                                   # raw chunks of an interrupted run
        if f.startswith('chunk_'): os.remove(os.path.join(work, f))
    queue = list(todo); tries = {}
    t0 = time.time(); done_rows = [0]; failed = []

    def worker():
        while not stop.is_set():
            with lock:
                job = queue.pop(0) if queue else None
            if job is None: return
            L, a, b, rows = job
            key = f'{L}:{a}-{b}'
            path = os.path.join(work, f'chunk_{L}_{a}_{b}.csv')
            files = []
            try:
                t1 = time.time()
                files = download(L, a, b, rows, path, counts)
                raw = sum(os.path.getsize(f) for f in files)
                cnt = archive_count(L, a, b)
                if cnt != rows: raise RuntimeError(f'COUNT(*) says {cnt}, the count table {rows}')
                t2 = time.time()
                st, trees = build(out, L, a, b, files)
                if st['rows'] != cnt: raise RuntimeError(f'built {st["rows"]} rows, COUNT(*) {cnt}')
                st.update(count=cnt, raw_bytes=raw, trees=trees, seconds=round(time.time() - t1, 1), done=datetime.datetime.now().isoformat(timespec='seconds'))
                with lock:
                    prog['jobs'][key] = st
                    save_progress(out, prog)
                    done_rows[0] += rows
                    rate = done_rows[0] / (time.time() - t0)
                    left = sum(j[3] for j in todo) - done_rows[0]
                    log(f'{key}: {rows:,} rows, {st["tiles"]} tiles, {st["bytes"] / 1e6:.1f} MB, dl {t2 - t1:.0f} s, build {time.time() - t2:.0f} s; '
                        f'{rate:,.0f} rows/s, about {left / max(rate, 1) / 60:.0f} min left')
                    if all(f'{j[0]}:{j[1]}-{j[2]}' in prog['jobs'] for j in jobs if j[0] == L):
                        m = write_manifest(out, prog, jobs, nl)
                        log(f'level {L} complete; manifest now to G = {m["magEnd"]}')
            except KeyboardInterrupt:
                return
            except Exception as e:
                log(f'{key}: FAILED: {type(e).__name__} {e}')
                with lock:
                    tries[key] = tries.get(key, 0) + 1
                    if tries[key] < 3: queue.append(job)             # again later, after the others
                    else: failed.append(key)
                stop.wait(60)
            finally:
                for f in files + [path]:
                    if os.path.exists(f): os.remove(f)
            stop.wait(1)

    threads = [threading.Thread(target=worker, daemon=True) for _ in range(args.workers)]
    for t in threads: t.start()
    try:
        while any(t.is_alive() for t in threads): time.sleep(0.5)
    except KeyboardInterrupt:
        stop.set(); log('stopping (run again to resume)')
        for t in threads: t.join(5)
    m = write_manifest(out, prog, jobs, nl)
    log(f'manifest: complete to G = {m["magEnd"]}: {m["stars"]:,} stars, {m["tiles"]:,} tiles, {m["bytes"]:,} bytes'
        + (f'; {len(failed)} chunks failed (run again): {failed}' if failed else ''))


if __name__ == '__main__':
    main()
