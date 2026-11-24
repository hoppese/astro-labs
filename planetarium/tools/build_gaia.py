#!/usr/bin/env python3
"""Convert the bright end of Gaia DR3 (G < 12; downloaded by tools/fetch_gaia.py) into the bundled faint-star
layer: sky tiles of the stars that the base catalogue (HYG, data/stars-*.bin) does not already hold, and the
all-sky star-count map that sets the limiting magnitude at every zoom, down to G = 21.5.

usage: python3 -I tools/build_gaia.py <raw gaia dir> <raw hip dir>/hyg_gaia_ids.csv <planetarium/data>
       (run tools/build_stars.py first: it writes data/stars-*.bin, read here as "HYG", and hyg_gaia_ids.csv)

Input (not in the repo): gaia_g12_<0..11>.csv, hip_xmatch.csv, counts_*.csv exactly as fetch_gaia.py saves them
  (ESA Gaia archive, gaiadr3.gaia_source and gaiadr3.hipparcos2_best_neighbour).
Output: <data>/gaia/index.json, <data>/gaia/counts.bin, <data>/gaia/<level>/<band>_<cell>.bin

Tiles (the same zones as the Tycho-2 tiles they replace): declination bands of height h, each cut into cells of
about the same width on the sky:  band j = floor((dec + 90) / h),  n_j = max(1, floor(360 cos(dec_mid) / h + 0.5)),
cell c = floor(ra / (360 / n_j)).
  level "a": h = 15 deg,  7 <= G < 9       level "b": h = 15 deg,  9 <= G < 10
  level "c": h = 5 deg,  10 <= G < 11      level "d": h = 5 deg,  11 <= G < 12
A tile file is a sequence of little-endian records, sorted by G (brightest first). Levels c and d, 10 bytes:
  u16 x     RA  within the cell:  ra  = (c + x / 65536) * 360 / n_j
  u16 y     Dec within the band:  dec = -90 + (j + y / 65536) * h          (0.27 arcsec steps at h = 5)
  u16 g     Gaia G in millimagnitudes above -2:  G = g / 1000 - 2
  u8  c     Gaia colour BP-RP in steps of 0.02 above -1:  BP-RP = c * 0.02 - 1;  255 = no colour in Gaia DR3
  i8  pmra  proper motion in RA (mu_alpha*, i.e. times cos dec), units of 2 mas/yr
  i8  pmdec proper motion in Dec, units of 2 mas/yr
  u8  plx   parallax in units of 0.2 mas (0 = below 0.1 mas or negative);  255 = no parallax in Gaia DR3
Levels a and b (15-degree zones, where 16 bits would mean 0.8 arcsec steps), 12 bytes: the same, then
  u8  xl, u8 yl   eight more bits of x and y:  ra = (c + (x + xl / 256) / 65536) * 360 / n_j, likewise dec (0.003 arcsec)
No source_id is stored (8 more bytes a star would double the download): the app asks the online service for
it when a star is clicked. Stars that the record cannot hold go at full precision, WITH their source_id, into
index.json ("special": [ra, dec, G, BP-RP | null, pmra, pmdec, parallax | null, "source_id"]), loaded at start:
  every kept star brighter than G = 7 (so that no tile is needed for a wide view), and every star with a
  proper motion above 250 mas/yr or a parallax above 50 mas.

Positions. Gaia DR3 positions are ICRS at epoch 2016.0. They are stored here at EPOCH 2000.0 (moved back 16
years with Gaia's own proper motion, linearly in RA cos(dec) and Dec), which is the convention of the HYG
tiers; the app then applies the stored proper motion for the date on screen. A star with no proper motion
in Gaia DR3 (2-parameter solution) is stored at its 2016.0 place with zero motion.

Overlap with HYG, so that no star is drawn twice. "HYG" here means the base catalogue as build_stars.py wrote it
(data/stars-*.bin): HYG's stars at their corrected places (Hipparcos-2 or Gaia DR3; see build_stars.py). Left out:
  1. every source that ESA's own cross-match (gaiadr3.hipparcos2_best_neighbour) pairs with a Hipparcos number
     present in HYG, and every source that build_stars.py itself identified with an HYG star (src 3 in
     hyg_gaia_ids.csv);
  2. every source within 3 arcsec of an HYG star (compared at Gaia's epoch, 2016.0: the star's place moved forward
     16 years with its proper motion, because the brightest Gaia sources have no proper motion of their own
     to move them back with) whose V is within 1.5 mag of the source's estimated V; within 1.5 arcsec
     the magnitudes need not agree (variable stars: eta Car, R Leo); the fast stars that build_stars.py could
     not identify (src = 0: HYG's own rough place) are searched to 15 arcsec, with tighter tests (see load_hyg).   V - G from BP-RP: Gaia DR3 documentation, table 5.9 (Johnson-Cousins relationships):
     G - V = -0.02704 + 0.01424 x - 0.2156 x^2 + 0.01426 x^3,  x = BP-RP  (sigma 0.03; valid -0.5 < x < 5).
     A source with no colour is compared in G directly.
Gaia is incomplete for the very brightest stars (G < 3 has many missing); those are all in HYG.

Star counts (for js/render/density.js). counts.bin: Uint16, [3072 HEALPix order-4 nested cells] x [28 magnitudes
8.0, 8.5, ... 21.5]: round(8000 log10(1 + N)), N = number of drawable stars in the cell brighter than that
magnitude (HYG by V + the tiles by G to 12; all Gaia DR3 sources beyond: exact to G = 17, a 2 % random sample
times 50 from there on). The cell of a Gaia source is source_id >> 51 (the id begins with the level-12 nested
HEALPix index of the source); ang2pix_nest() below (needed for the HYG stars) is checked against that on every
16th row read: 99.7 % agree, the rest fall in a neighbouring order-12 pixel (the ids date from rougher positions).
"""
import csv, glob, json, math, os, struct, sys

GMAX = 12.0
BRIGHT = 7.0
LEVELS = [dict(id='a', band=15.0, lo=BRIGHT, hi=9.0, rec=12), dict(id='b', band=15.0, lo=9.0, hi=10.0, rec=12),
          dict(id='c', band=5.0, lo=10.0, hi=11.0, rec=10), dict(id='d', band=5.0, lo=11.0, hi=GMAX, rec=10)]
PM_UNIT, PM_MAX = 2.0, 250.0             # mas/yr per step; above PM_MAX the star goes into the full-precision list
PLX_UNIT, PLX_MAX = 0.2, 50.0            # mas per step
TIGHT2 = (1.5 / 206264.806) ** 2
EPOCH_BACK = 16.0                        # years from Gaia's 2016.0 back to 2000.0
HSTEP, HM0, HN = 0.25, -1.5, 54          # all-sky histogram: bins of 0.25 mag from -1.5 to 12.0
MAP_ORDER, MAP_M0, MAP_STEP, MAP_N, MAP_SCALE = 4, 8.0, 0.5, 28, 8000
NCELL = 12 * 4 ** MAP_ORDER


def ncell(j, h):
    mid = -90 + (j + 0.5) * h
    return max(1, int(math.floor(360 * math.cos(math.radians(mid)) / h + 0.5)))


def g_minus_v(x):
    x = min(5.0, max(-0.5, x))
    return -0.02704 + 0.01424 * x - 0.2156 * x * x + 0.01426 * x ** 3


# ---- HEALPix, nested scheme (Gorski et al. 2005), equatorial ICRS as Gaia uses it -----------------------
def _spread(v):
    r = 0
    for b in range(13):
        r |= ((v >> b) & 1) << (2 * b)
    return r


def ang2pix_nest(order, ra_deg, dec_deg):
    ns = 1 << order
    z = math.sin(math.radians(dec_deg)); za = abs(z)
    tt = (ra_deg % 360.0) / 90.0
    if za <= 2.0 / 3.0:
        t1 = ns * (0.5 + tt); t2 = ns * z * 0.75
        jp = int(math.floor(t1 - t2)); jm = int(math.floor(t1 + t2))
        ifp = jp >> order; ifm = jm >> order
        if ifp == ifm: face = (ifp & 3) + 4
        elif ifp < ifm: face = ifp & 3
        else: face = (ifm & 3) + 8
        ix = jm & (ns - 1); iy = ns - (jp & (ns - 1)) - 1
    else:
        ntt = min(3, int(tt)); tp = tt - ntt
        tmp = ns * math.sqrt(3.0 * (1.0 - za))
        jp = min(ns - 1, int(tp * tmp)); jm = min(ns - 1, int((1.0 - tp) * tmp))
        if z >= 0: face = ntt; ix = ns - jm - 1; iy = ns - jp - 1
        else: face = ntt + 8; ix = jp; iy = jm
    return face * ns * ns + _spread(ix) + 2 * _spread(iy)


def fnum(s):
    return float(s) if s not in ('', 'null', 'NaN') else None


def load_hyg(data):
    """The base catalogue as the app loads it: <data>/stars.json and its tiers (13 Float32 fields a star, see build_stars.py)."""
    man = json.load(open(os.path.join(data, 'stars.json')))
    F = {f: i for i, f in enumerate(man['fields'])}
    assert 'dra' in F and 'src' in F, 'data/stars-*.bin are in the old format: run tools/build_stars.py first'
    nf = len(man['fields'])
    hips, grid, grid0 = set(), {}, {}
    hist = [0] * HN
    cells = [[0] * MAP_N for _ in range(NCELL)]         # differential, per map bin: stars with edge[b-1] <= m < edge[b] (bin 0: m < 8)
    cell = 1e-4                                         # 20.6 arcsec
    n = 0
    k = math.pi / 648000000 * EPOCH_BACK                # mas/yr -> radians moved in 16 years
    for t in man['tiers']:
        buf = open(os.path.join(data, t['file']), 'rb').read()
        assert len(buf) == t['n'] * nf * 4, t['file']
        for i in range(t['n']):
            r = struct.unpack_from('<%df' % nf, buf, i * nf * 4)
            n += 1
            mag = r[F['mag']]
            if r[F['hip']]: hips.add(int(r[F['hip']]))
            ra_d, dec_d = r[F['ra']] + r[F['dra']], r[F['dec']] + r[F['ddec']]
            pmra, pmdec = r[F['pmra']], r[F['pmdec']]
            # where the star is at Gaia's epoch, for the cross-match: straight-line motion from epoch 2000.0, as in the app
            # (js/catalog.js starPlace; g is the radial term, rv x parallax)
            a, d = math.radians(ra_d), math.radians(dec_d)
            ca, sa, cd, sd = math.cos(a), math.sin(a), math.cos(d), math.sin(d)
            g = 1 + (r[F['rv']] * (1000 / r[F['dist']]) / 4.740470446 * k if r[F['dist']] > 0 else 0)
            x = cd * ca * g + (-sa * pmra - sd * ca * pmdec) * k
            y = cd * sa * g + (ca * pmra - sd * sa * pmdec) * k
            z = sd * g + cd * pmdec * k
            f = 1 / math.sqrt(x * x + y * y + z * z); x *= f; y *= f; z *= f
            tol = 3.0
            # The stars build_stars.py could not identify in Gaia (src = 0; nearly all from the Gliese catalogue) still have
            # HYG's rough places, up to about 13 arcsec out and more: for the fast ones the search goes to 15 arcsec, and the
            # source must then also agree in brightness to 0.7 mag and (where Gaia has one) in proper motion.
            loose = r[F['src']] == 0 and math.hypot(pmra, pmdec) > 100
            if loose: tol = 15.0
            grid.setdefault((int(x / cell), int(y / cell), int(z / cell)), []).append((x, y, z, mag, (tol / 206264.806) ** 2, loose, pmra, pmdec))
            # the same star at epoch 2000.0, for the second comparison (see main)
            grid0.setdefault((int(cd * ca / cell), int(cd * sa / cell), int(sd / cell)), []).append((cd * ca, cd * sa, sd, mag, (3.0 / 206264.806) ** 2, False, pmra, pmdec))
            b = int((mag - HM0) / HSTEP)
            if 0 <= b < HN: hist[b] += 1
            cells[ang2pix_nest(MAP_ORDER, ra_d, dec_d)][mapbin(mag)] += 1
    return hips, grid, grid0, hist, cells, cell, n


def mapbin(m):
    """Index of the first map magnitude (8.0, 8.5, ...) that is > m; stars fainter than the last edge are not counted."""
    if m < MAP_M0: return 0
    return int((m - MAP_M0) / MAP_STEP) + 1


def main(raw, ids_csv, out):
    hips, grid, grid0, hist_hyg, cells, cell, nhyg = load_hyg(out)
    # Gaia sources that build_stars.py itself identified with an HYG star (src 3: not in ESA's Hipparcos table)
    named = set(int(r['source_id']) for r in csv.DictReader(open(ids_csv, newline='')) if r['src'] == '3')
    print('identified by build_stars.py (src 3): %d sources' % len(named))
    print('HYG: %d stars, %d Hipparcos numbers' % (nhyg, len(hips)))
    xm = {}
    for r in csv.DictReader(open(os.path.join(raw, 'hip_xmatch.csv'), newline='')):
        xm[int(r['source_id'])] = int(r['original_ext_source_id'])
    print('Hipparcos-2 best-neighbour table: %d pairs' % len(xm))

    tiles = {lv['id']: {} for lv in LEVELS}
    special = []
    hist = [0] * HN
    st = dict(read=0, hip=0, identified=0, near_hyg=0, kept=0, no_colour=0, no_pm=0, no_plx=0, special_bright=0, special_fast=0, special_near=0,
              healpix_checked=0, healpix_differs=0)
    brightest = {lv['id']: 99 for lv in LEVELS}
    files = sorted(glob.glob(os.path.join(raw, 'gaia_g12_*.csv')))
    assert len(files) == 12, 'expected the 12 base-pixel files'
    for fn in files:
        with open(fn, newline='') as f:
            rd = csv.reader(f); head = next(rd)
            assert head == ['source_id', 'ra', 'dec', 'phot_g_mean_mag', 'bp_rp', 'parallax', 'pmra', 'pmdec'], head
            for row in rd:
                st['read'] += 1
                sid = int(row[0]); ra = float(row[1]); dec = float(row[2]); g = float(row[3])
                col, plx, pmra, pmdec = fnum(row[4]), fnum(row[5]), fnum(row[6]), fnum(row[7])
                # the HEALPix code against Gaia's own index (every 16th row: enough to prove it, cheap enough to keep)
                if st['read'] % 16 == 0:
                    st['healpix_checked'] += 1
                    if ang2pix_nest(12, ra, dec) != sid >> 35: st['healpix_differs'] += 1
                if xm.get(sid) in hips: st['hip'] += 1; continue
                if sid in named: st['identified'] += 1; continue
                if pmra is None or pmdec is None: st['no_pm'] += 1; pmra = pmdec = 0.0; has_pm = False
                else: has_pm = True
                dec0 = dec - pmdec * EPOCH_BACK / 3.6e6
                ra0 = (ra - pmra * EPOCH_BACK / 3.6e6 / max(1e-6, math.cos(math.radians(dec)))) % 360.0
                ra_r, dec_r = math.radians(ra), math.radians(dec)            # the cross-match is done at 2016.0
                cd = math.cos(dec_r)
                x, y, z = cd * math.cos(ra_r), cd * math.sin(ra_r), math.sin(dec_r)
                vest = g - g_minus_v(col) if col is not None else g
                ix, iy, iz = int(x / cell), int(y / cell), int(z / cell)
                dup = False
                # Compared twice: at 2016.0 (the source where Gaia saw it, the HYG star moved forward), and, when the source
                # has a proper motion, at 2000.0 (the source moved back, the HYG star at its catalogue place). The second
                # catches the few sources whose own proper motion is far from the Hipparcos one for the same star.
                where = [(grid, x, y, z)]
                if has_pm:
                    a0, d0 = math.radians(ra0), math.radians(dec0)
                    where.append((grid0, math.cos(d0) * math.cos(a0), math.cos(d0) * math.sin(a0), math.sin(d0)))
                for (gr, x, y, z) in where:
                  ix, iy, iz = int(x / cell), int(y / cell), int(z / cell)
                  for a in (ix - 1, ix, ix + 1):
                    for b in (iy - 1, iy, iy + 1):
                        for c in (iz - 1, iz, iz + 1):
                            for (hx, hy, hz, hm, tol2, loose, hpa, hpd) in gr.get((a, b, c), ()):
                                d2 = (hx - x) ** 2 + (hy - y) ** 2 + (hz - z) ** 2
                                if d2 >= tol2: continue
                                if d2 < TIGHT2: dup = True                    # the same place to 1.5 arcsec: the same star, whatever its magnitude (variables)
                                elif loose:
                                    if abs(hm - vest) < 0.7 and (not has_pm or math.hypot(pmra - hpa, pmdec - hpd) < 0.25 * math.hypot(hpa, hpd)): dup = True
                                elif abs(hm - vest) < 1.5: dup = True
                if dup: st['near_hyg'] += 1; continue
                st['kept'] += 1
                if col is None: st['no_colour'] += 1
                if plx is None: st['no_plx'] += 1
                b = int((g - HM0) / HSTEP)
                if 0 <= b < HN: hist[b] += 1
                cells[sid >> 51][mapbin(g)] += 1
                fast = math.hypot(pmra, pmdec) > PM_MAX
                near = plx is not None and plx > PLX_MAX
                if g < BRIGHT or fast or near:
                    st['special_bright' if g < BRIGHT else 'special_fast' if fast else 'special_near'] += 1
                    special.append([round(ra0, 7), round(dec0, 7), round(g, 3), None if col is None else round(col, 3),
                                    round(pmra, 2) if has_pm else None, round(pmdec, 2) if has_pm else None,
                                    None if plx is None else round(plx, 3), str(sid)])
                    continue
                lv = next(l for l in LEVELS if g < l['hi'])
                h = lv['band']
                j = min(int((dec0 + 90) / h), int(180 / h) - 1)
                n = ncell(j, h); w = 360 / n
                ci = min(int(ra0 / w), n - 1)
                xq = min(16777215, int((ra0 / w - ci) * 16777216))             # 24 bits; the 10-byte record keeps the top 16
                yq = min(16777215, int(((dec0 + 90) / h - j) * 16777216))
                gq = max(0, min(65535, int(round((g + 2) * 1000))))
                cq = 255 if col is None else max(0, min(254, int(round((col + 1) / 0.02))))
                pa = max(-127, min(127, int(round(pmra / PM_UNIT)))); pd = max(-127, min(127, int(round(pmdec / PM_UNIT))))
                pq = 255 if plx is None else max(0, min(254, int(round(plx / PLX_UNIT))))
                tiles[lv['id']].setdefault((j, ci), []).append((gq, xq, yq, cq, pa, pd, pq))
                brightest[lv['id']] = min(brightest[lv['id']], g)
        print('%s: read %d kept %d' % (os.path.basename(fn), st['read'], st['kept']))
    # About 0.3 % differ, always by a neighbouring pixel: the ids were given from the sources' first, rougher positions,
    # and an order-12 pixel is only 52 arcsec across. Anything like 1 % would mean the code is wrong.
    assert st['healpix_differs'] < 0.01 * st['healpix_checked'], 'ang2pix_nest disagrees with Gaia source_ids'

    root = os.path.join(out, 'gaia')
    total_bytes, levels = 0, []
    for lv in LEVELS:
        d = os.path.join(root, lv['id'])
        os.makedirs(d, exist_ok=True)
        for fn in os.listdir(d):
            if fn.endswith('.bin'): os.remove(os.path.join(d, fn))
        h = lv['band']
        bands, nstars, biggest = [], 0, 0
        for j in range(int(180 / h)):
            counts = []
            for ci in range(ncell(j, h)):
                rows = tiles[lv['id']].get((j, ci), [])
                rows.sort()
                counts.append(len(rows))
                if not rows: continue
                buf = bytearray()
                for (gq, xq, yq, cq, pa, pd, pq) in rows:
                    buf += struct.pack('<HHHBbbB', xq >> 8, yq >> 8, gq, cq, pa, pd, pq)
                    if lv['rec'] == 12: buf += struct.pack('<BB', xq & 255, yq & 255)
                open(os.path.join(d, '%d_%d.bin' % (j, ci)), 'wb').write(buf)
                total_bytes += len(buf); nstars += len(rows); biggest = max(biggest, len(rows))
            bands.append(counts)
        levels.append(dict(id=lv['id'], band=h, magMin=lv['lo'], magMax=lv['hi'], rec=lv['rec'], n=nstars, counts=bands))
        print('level %s: %d stars in %d tiles, largest %d stars (%d bytes), brightest G %.3f' %
              (lv['id'], nstars, sum(1 for b in bands for c in b if c), biggest, biggest * lv['rec'], brightest[lv['id']]))

    # ---- star counts ------------------------------------------------------------------------------------
    # deep counts from the archive: exact files hold [m, m + 1), sample files G >= 17 at 2 %
    deep_total = 0
    for fn in sorted(glob.glob(os.path.join(raw, 'counts_*.csv'))):
        scale = 50 if 'sample' in fn else 1
        for r in csv.DictReader(open(fn, newline='')):
            if r['mb'] in ('', 'null', 'NaN'): continue           # sources with no G magnitude
            g_lo = float(r['mb']) / 2
            b = mapbin(g_lo)
            if b >= MAP_N: continue                               # fainter than 21.5
            assert g_lo >= GMAX
            cells[int(r['hp'])][b] += int(r['n']) * scale
            deep_total += int(r['n']) * scale
    print('deep counts (G >= 12, to 21.5): %d sources' % deep_total)
    buf = bytearray(); allsky = [0] * MAP_N
    for c in range(NCELL):
        run = 0
        for b in range(MAP_N):
            run += cells[c][b]; allsky[b] += run
            buf += struct.pack('<H', min(65535, int(round(MAP_SCALE * math.log10(1 + run)))))
    open(os.path.join(root, 'counts.bin'), 'wb').write(buf)
    cum, run = [], 0
    for b in range(HN):
        run += hist_hyg[b] + hist[b]; cum.append(run)

    special.sort(key=lambda r: r[2])
    manifest = dict(
        source='Gaia DR3 (ESA/Gaia/DPAC), gaiadr3.gaia_source with G < 12, from the ESA Gaia archive; stars already in HYG removed',
        licence='CC BY-NC 3.0 IGO (https://www.cosmos.esa.int/web/gaia-users/license); credit ESA/Gaia/DPAC',
        epoch='positions ICRS at epoch 2000.0 (Gaia 2016.0 positions moved back with Gaia proper motions)',
        magEnd=GMAX,
        record=dict(fields=['x:u16', 'y:u16', 'g:u16', 'bprp:u8', 'pmra:i8', 'pmdec:i8', 'plx:u8', '(rec 12:) xl:u8', 'yl:u8'], pmUnit=PM_UNIT, plxUnit=PLX_UNIT),
        levels=levels,
        special=special,
        counts=dict(m0=HM0, step=HSTEP, cum=cum),
        map=dict(file='counts.bin', order=MAP_ORDER, m0=MAP_M0, step=MAP_STEP, n=MAP_N, scale=MAP_SCALE, allsky=allsky,
                 note='exact to G = 17; 2 % sample x 50 beyond'),
        stats=st)
    json.dump(manifest, open(os.path.join(root, 'index.json'), 'w'), separators=(',', ':'))
    print(st)
    print('special list: %d stars; index.json %d bytes; tiles %d bytes; counts.bin %d bytes' %
          (len(special), os.path.getsize(os.path.join(root, 'index.json')), total_bytes, len(buf)))
    for b in range(34, HN, 2): print('  m < %5.2f : %9d' % (HM0 + (b + 1) * HSTEP, cum[b]))
    for b in range(MAP_N): print('  map m < %5.2f : %11d' % (MAP_M0 + b * MAP_STEP, allsky[b]))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
