#!/usr/bin/env python3
"""Convert the Tycho-2 catalogue (CDS I/259; Hog et al. 2000) into on-demand sky tiles of the stars
that the base catalogue (HYG, data/stars-*.bin) does not already hold.

usage: python3 -I build_tycho.py <raw/tycho2 dir> <raw/hyg/hygdata_v41.csv> <planetarium/data>

Input (not in the repo): tyc2.dat.00.gz ... tyc2.dat.19.gz and suppl_1.dat.gz exactly as served in
  https://vizier.cfa.harvard.edu/ftp/cats/I/259/   (the CDS VizieR mirror at CfA; the same files as
  https://cdsarc.cds.unistra.fr/ftp/I/259/). Licence stated in the catalogue's ReadMe: CC BY-NC 3.0 IGO.

Output: <data>/tycho/index.json and <data>/tycho/<level>/<band>_<cell>.bin

Tiles. Two levels, each a set of declination bands of fixed height split into cells of about the same
width on the sky:   band j = floor((dec + 90) / h),   n_j = max(1, round(360 cos(dec_mid) / h)),
cell c = floor(ra / (360 / n_j)).
  level "a": h = 15 deg, stars with 8 <= V < 10   (needed from a field of view of about 25 deg)
  level "b": h = 5 deg,  stars with V >= 10       (needed below about 7 deg)
A tile file is a sequence of 11-byte little-endian records, sorted by V (brightest first):
  u16 x     RA  within the cell:  ra  = (c + x / 65536) * 360 / n_j
  u16 y     Dec within the band:  dec = -90 + (j + y / 65536) * h         (0.27 arcsec steps at h = 5)
  u16 v     Johnson V in millimagnitudes above -2:  V = v / 1000 - 2
  u8  c     B-V in steps of 0.02 above -1:  B-V = c * 0.02 - 1;  255 = no colour (only one Tycho band)
  u32 id    TYC1 << 18 | TYC2 << 4 | TYC3     ->  "TYC TYC1-TYC2-TYC3"

The few thousand stars brighter than V = 8 that HYG lacks (Hipparcos missed some, mostly close to brighter
stars, e.g. gamma-1 Velorum) are listed at full precision in index.json ("bright": [ra, dec, V, B-V | null, id]),
which the app loads at start, so that no tile is needed for a wide view.

Magnitudes: V = VT - 0.090 (BT - VT), B-V = 0.850 (BT - VT)   (the catalogue ReadMe's own formulae).
A star with VT only is stored with V = VT and no colour; a star with BT only is left out (no V).
Positions: mean position, ICRS, epoch J2000 (the catalogue's pmRA/pmDE already applied to 2000.0); for the
few entries with no mean position (pflag X) and for supplement-1 stars the observed position (epoch about
1991). No proper motion is stored: the app draws these stars at their J2000 places.

Overlap with HYG. Left out: every entry that carries a Hipparcos number present in HYG (HYG contains the whole
Hipparcos catalogue), and every entry within 6 arcsec of an HYG star whose V differs by less than 1.5 mag.
So no star is drawn twice; the fainter member of a pair that Tycho-2 resolves but Hipparcos lists under one
number is not drawn at all.
"""
import csv, gzip, json, math, os, struct, sys

BRIGHT = 8.0                              # kept stars brighter than this go into index.json itself (see below)
LEVELS = [dict(id='a', band=15.0, lo=BRIGHT, hi=10.0), dict(id='b', band=5.0, lo=10.0, hi=99)]
HSTEP, HM0, HN = 0.25, -1.5, 70          # histogram of V: bins of 0.25 mag from -1.5
NGAL = 8                                 # the same histogram in 8 equal-area bands of |sin(galactic latitude)|
GPOLE = (-0.8676661490, -0.1980763734, 0.4559837762)     # north galactic pole, J2000 unit vector


def galband(x, y, z):
    return min(NGAL - 1, int(abs(x * GPOLE[0] + y * GPOLE[1] + z * GPOLE[2]) * NGAL))


def ncell(j, h):
    mid = -90 + (j + 0.5) * h
    return max(1, round(360 * math.cos(math.radians(mid)) / h))


def fnum(s):
    s = s.strip()
    return float(s) if s else None


def load_hyg(path):
    hips, grid = set(), {}
    hist = [[0] * HN for _ in range(NGAL)]
    cell = 1e-4                               # 20.6 arcsec
    for r in csv.DictReader(open(path, newline='')):
        if r['id'] == '0': continue
        try: mag = float(r['mag'])
        except ValueError: continue
        if mag > 20: continue
        if r['hip']: hips.add(int(float(r['hip'])))
        ra, dec = math.radians(float(r['ra']) * 15), math.radians(float(r['dec']))
        x, y, z = math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)
        grid.setdefault((int(x / cell), int(y / cell), int(z / cell)), []).append((x, y, z, mag))
        b = int((mag - HM0) / HSTEP)
        if 0 <= b < HN: hist[galband(x, y, z)][b] += 1
    return hips, grid, hist, cell


def main(raw, hyg_csv, out):
    hips, grid, hist_hyg, cell = load_hyg(hyg_csv)
    print('HYG: %d Hipparcos numbers, %d stars' % (len(hips), sum(map(sum, hist_hyg))))
    tol2 = (6 / 206264.806) ** 2
    tiles = {lv['id']: {} for lv in LEVELS}
    bright = []
    hist = [[0] * HN for _ in range(NGAL)]
    st = dict(read=0, hip=0, hip_not_in_hyg=0, near_hyg=0, no_vt=0, no_bt=0, kept=0, no_mean=0, suppl_kept=0)
    brightest = {lv['id']: 99 for lv in LEVELS}

    def consider(tyc, ra, dec, bt, vt, hip):
        if hip is not None:
            if hip in hips: st['hip'] += 1; return False
            st['hip_not_in_hyg'] += 1
        if vt is None: st['no_vt'] += 1; return False
        if bt is None: v, bv = vt, None; st['no_bt'] += 1
        else: v, bv = vt - 0.090 * (bt - vt), 0.850 * (bt - vt)
        ra_r, dec_r = math.radians(ra), math.radians(dec)
        cd = math.cos(dec_r)
        x, y, z = cd * math.cos(ra_r), cd * math.sin(ra_r), math.sin(dec_r)
        ix, iy, iz = int(x / cell), int(y / cell), int(z / cell)
        for a in (ix - 1, ix, ix + 1):
            for b in (iy - 1, iy, iy + 1):
                for c in (iz - 1, iz, iz + 1):
                    for (hx, hy, hz, hm) in grid.get((a, b, c), ()):
                        if (hx - x) ** 2 + (hy - y) ** 2 + (hz - z) ** 2 < tol2 and abs(hm - v) < 1.5:
                            st['near_hyg'] += 1; return False
        b = int((v - HM0) / HSTEP)
        if 0 <= b < HN: hist[galband(x, y, z)][b] += 1
        st['kept'] += 1
        if v < BRIGHT:
            bright.append([round(ra % 360, 6), round(dec, 6), round(v, 3), None if bv is None else round(bv, 3), tyc])
            return True
        lv = LEVELS[0] if v < LEVELS[0]['hi'] else LEVELS[1]
        h = lv['band']
        j = min(int((dec + 90) / h), int(180 / h) - 1)
        n = ncell(j, h)
        w = 360 / n
        ci = min(int((ra % 360) / w), n - 1)
        xq = min(65535, int(((ra % 360) / w - ci) * 65536))
        yq = min(65535, int(((dec + 90) / h - j) * 65536))
        vq = max(0, min(65535, round((v + 2) * 1000)))
        cq = 255 if bv is None else max(0, min(254, round((bv + 1) / 0.02)))
        tiles[lv['id']].setdefault((j, ci), []).append((vq, xq, yq, cq, tyc))
        brightest[lv['id']] = min(brightest[lv['id']], v)
        return True

    for k in range(20):
        with gzip.open(os.path.join(raw, 'tyc2.dat.%02d.gz' % k), 'rt', encoding='ascii') as f:
            for line in f:
                st['read'] += 1
                tyc = (int(line[0:4]) << 18) | (int(line[5:10]) << 4) | int(line[11])
                ra, dec = fnum(line[15:27]), fnum(line[28:40])
                if ra is None or dec is None:
                    st['no_mean'] += 1
                    ra, dec = float(line[152:164]), float(line[165:177])
                hip = line[142:148].strip()
                consider(tyc, ra, dec, fnum(line[110:116]), fnum(line[123:129]), int(hip) if hip else None)
        print('part %02d: read %d kept %d' % (k, st['read'], st['kept']))
    with gzip.open(os.path.join(raw, 'suppl_1.dat.gz'), 'rt', encoding='ascii') as f:
        for line in f:
            if line[13] != 'T': continue               # 'H' rows are Hipparcos stars (all in HYG); their "VT" may be Hp
            hip = line[115:121].strip()
            tyc = (int(line[0:4]) << 18) | (int(line[5:10]) << 4) | int(line[11])
            if consider(tyc, float(line[15:27]), float(line[28:40]), fnum(line[83:89]), fnum(line[96:102]), int(hip) if hip else None):
                st['suppl_kept'] += 1

    root = os.path.join(out, 'tycho')
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
                for (vq, xq, yq, cq, tyc) in rows: buf += struct.pack('<HHHBI', xq, yq, vq, cq, tyc)
                open(os.path.join(d, '%d_%d.bin' % (j, ci)), 'wb').write(buf)
                total_bytes += len(buf); nstars += len(rows); biggest = max(biggest, len(rows))
            bands.append(counts)
        levels.append(dict(id=lv['id'], band=h, magMin=round(brightest[lv['id']] - 0.005, 2), magSplit=lv['hi'] if lv['hi'] < 99 else None,
                           n=nstars, counts=bands))
        print('level %s: %d stars in %d tiles, largest %d stars, brightest V %.2f' % (lv['id'], nstars, sum(1 for b in bands for c in b if c), biggest, brightest[lv['id']]))
    # all-sky cumulative counts of everything the app can draw (HYG + these tiles), for the screen-density rule
    diff = [sum(hist_hyg[g][b] + hist[g][b] for g in range(NGAL)) for b in range(HN)]
    cum, run = [], 0
    for b in range(HN):
        run += diff[b]
        cum.append(run)
    bands = []                               # per galactic-latitude band (each 1/8 of the sky), cumulative
    for g in range(NGAL):
        row, run = [], 0
        for b in range(HN):
            run += hist_hyg[g][b] + hist[g][b]
            row.append(run)
        bands.append(row)
    peak = max(range(HN), key=lambda b: diff[b])
    manifest = dict(
        source='Tycho-2 (Hog et al. 2000, A&A 355, L27), CDS I/259; stars already in HYG removed',
        licence='CC BY-NC 3.0 IGO (as stated in the CDS ReadMe of I/259)',
        record=dict(bytes=11, fields=['x:u16', 'y:u16', 'v:u16', 'bv:u8', 'tyc:u32']),
        levels=levels,
        bright=sorted(bright, key=lambda r: r[2]),
        counts=dict(m0=HM0, step=HSTEP, cum=cum, peakMag=round(HM0 + (peak + 1) * HSTEP, 2), bands=bands),
        stats=st)
    json.dump(manifest, open(os.path.join(root, 'index.json'), 'w'), separators=(',', ':'))
    print(st)
    print('bright list (V < %g): %d stars' % (BRIGHT, len(bright)))
    print('bytes', total_bytes, 'differential counts peak in the bin ending at V =', manifest['counts']['peakMag'])
    for b in range(28, 62, 2): print('  V < %5.2f : %8d  (bin %d)' % (HM0 + (b + 1) * HSTEP, cum[b], diff[b]))


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
