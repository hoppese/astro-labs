#!/usr/bin/env python3
"""Build the bright-star tiers: HYG v4.1 (CC BY-SA 4.0) for names, designations, magnitudes, colours, distances and
radial velocities; positions and proper motions from Hipparcos-2 and Gaia DR3.

usage: python3 -I tools/build_stars.py <raw/hyg/hygdata_v41.csv> <raw hip dir> <raw gaia dir> <planetarium/data>
       (raw hip dir: what tools/fetch_hipparcos.py saves; raw gaia dir: what tools/fetch_gaia.py saves)
       then re-run tools/build_gaia.py, which leaves out of the Gaia tiles the stars that are here.

Output
  stars-<k>.bin   little-endian Float32, row-major, 13 fields per star, sorted by magnitude:
                    ra dec        ICRS at EPOCH 2000.0, degrees, rounded to Float32 (steps of up to 0.11 arcsec)
                    mag bv        V and B-V (HYG);  missing bv = 99
                    hip hd        catalogue numbers (HYG);  missing = 0
                    dist          parsecs (HYG);  missing = 0
                    pmra pmdec    proper motion at epoch 2000.0, mas/yr; pmra is mu_alpha* (includes cos dec)
                    dra ddec      degrees to ADD to ra, dec: what the Float32 rounding lost (ra + dra is exact to 1e-9 deg)
                    rv            radial velocity, km/s (HYG); 0 = unknown. Used for the perspective term of the motion.
                    src           where ra, dec, pmra, pmdec come from:
                                    0  HYG as published (no cross-identification found; can be several arcsec out)
                                    1  Hipparcos, the new reduction (van Leeuwen 2007), CDS I/311
                                    2  Gaia DR3, the source ESA's cross-match pairs with the star's Hipparcos number
                                    3  Gaia DR3, identified here: by position and magnitude (bright Hipparcos stars ESA's table leaves
                                       unpaired) or by position, proper motion and magnitude (stars without a HIP number)
                  The first nine fields are the file format used before 2026-11-24; the loader reads the field count
                  from stars.json.
  stars.json      manifest: tiers [{file, n, magMax}], fields, astrometry (counts by src)
  starnames.json  for tier 0 only: {"name": {index: proper}, "bayer": {index: "α CMa"}, "flam": {index: "9 CMa"}}
  <raw hip dir>/hyg_gaia_ids.csv   (not in the repo) the Gaia source_id of every star given src 2 or 3, for build_gaia.py

Why HYG's own positions are not used: see NOTES.md, "Bright-star astrometry". In short, HYG carried each Hipparcos
(1997) position from epoch 1991.25 to 2000.0 by adding pmRA * 8.75 yr to the right ascension; pmRA is
mu_alpha* = (d alpha/dt) cos(dec), so the step must be divided by cos(dec) and was not. And HYG's stars without a
Hipparcos number (Gliese catalogue) have places that are several arcseconds, sometimes an arcminute, out.

What is used instead, per star:
  * Gaia DR3 (ICRS, epoch 2016.0) when ESA's cross-match (gaiadr3.hipparcos2_best_neighbour) pairs the Hipparcos number
    with exactly one Gaia source, that source has a 5- or 6-parameter solution and G >= 3 (Gaia's astrometry of
    the very brightest stars is unreliable), AND, moved back to 1991.25 with its own proper motion, it falls within
    1 arcsec of the Hipparcos-2 position (a check of identity; 99 % agree to 0.09 arcsec). This is also SIMBAD's
    practice (Gaia DR3 where there is a solution, else Hipparcos-2). No cut on RUWE: it is high for most stars
    brighter than G = 4 (theta UMa 3.7) and for unresolved doubles, where the two missions' proper motions differ
    (61 Cyg A: by 20 mas/yr) and neither straight line is right for long; Gaia's is the one measured nearest to
    today, so it gives the better place for dates near the present. The build prints how many stars this affects.
  * ESA's table pairs only 99,525 of the 117,955 Hipparcos stars; theta UMa, eta Cas and many other bright stars
    are not in it. A star brighter than V = 7.5 without a pair gets the Gaia source (G < 7, same rules) that
    is the only one within 1 arcsec of its Hipparcos-2 place carried to 2016.0 and whose V estimated from G and
    BP-RP is within 0.5 mag of HYG's V (src = 3).
  * otherwise Hipparcos-2 (ICRS, epoch 1991.25): every star with a Hipparcos number is in it.
  * stars without a Hipparcos number: the Gaia DR3 source (from the Gaia Catalogue of Nearby Stars, or from the
    G < 12 download) that agrees in position, in proper motion and in V magnitude, if there is exactly one such
    source and no other HYG star claims it (see match_nohip). The rest keep HYG's numbers and are flagged src = 0.
Each position is carried to epoch 2000.0, and its proper motion re-expressed there, with the rigorous formulae for
uniform space motion (ESA 1997, The Hipparcos and Tycho Catalogues, vol. 1, section 1.5.5), using the source
catalogue's parallax and HYG's radial velocity. The app moves the stars from 2000.0 with the same model
(js/catalog.js, starPlace). Nothing is fitted or invented: a number is either the source catalogue's (propagated)
or HYG's.
"""
import csv, glob, gzip, json, math, struct, sys, os

FIELDS = ['ra', 'dec', 'mag', 'bv', 'hip', 'hd', 'dist', 'pmra', 'pmdec', 'dra', 'ddec', 'rv', 'src']
SRC_NAMES = ['HYG v4.1 as published (no cross-identification)', 'Hipparcos, the new reduction (van Leeuwen 2007), CDS I/311',
             'Gaia DR3 via ESA Hipparcos-2 best-neighbour cross-match', 'Gaia DR3, identified by position, magnitude and (stars without a Hipparcos number) proper motion']
TIERS = [6.5, 7.5, 8.5, 9.5, 99]     # upper magnitude bound of each tier
GREEK = dict(Alp='α', Bet='β', Gam='γ', Del='δ', Eps='ε', Zet='ζ', Eta='η', The='θ', Iot='ι', Kap='κ',
             Lam='λ', Mu='μ', Nu='ν', Xi='ξ', Omi='ο', Pi='π', Rho='ρ', Sig='σ', Tau='τ', Ups='υ',
             Phi='φ', Chi='χ', Psi='ψ', Ome='ω')
SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')
MAS = math.pi / 648000000            # radians per milliarcsecond
KMS_PER_AU_YR = 4.740470446
T_HIP = 2000.0 - 1991.25             # years from the Hipparcos epoch to 2000.0
T_GAIA = 2000.0 - 2016.0             # years from the Gaia DR3 epoch to 2000.0
GAIA_RUWE_MAX, GAIA_G_MIN, GAIA_HIP_AGREE_MAS = 1.4, 3.0, 1000.0     # RUWE is only counted, not used (see below)
BRIGHT_V_MAX, BRIGHT_RADIUS, BRIGHT_DMAG = 7.5, 1.0, 0.5     # own match of bright Hipparcos stars without an ESA pair


def num(s, default=0.0):
    try: return float(s)
    except ValueError: return default


def fnum(s):
    return float(s) if s not in ('', 'null', 'NaN') else None


def f32(x):
    return struct.unpack('<f', struct.pack('<f', x))[0]


def propagate(ra, dec, plx, pmra, pmdec, rv, t):
    """Uniform space motion over t years. ra, dec in degrees; plx mas; pmra (= mu_alpha*), pmdec mas/yr; rv km/s.
    Returns (ra, dec, pmra, pmdec) at the new epoch. ESA SP-1200 vol. 1 eq. 1.5.24-1.5.27."""
    a, d = math.radians(ra), math.radians(dec)
    ca, sa, cd, sd = math.cos(a), math.sin(a), math.cos(d), math.sin(d)
    r = (cd * ca, cd * sa, sd); p = (-sa, ca, 0.0); q = (-sd * ca, -sd * sa, cd)
    mu = [(pmra * p[i] + pmdec * q[i]) * MAS for i in range(3)]              # rad/yr
    zeta = rv * plx / KMS_PER_AU_YR * MAS if plx and plx > 0 else 0.0     # rad/yr
    mu2 = mu[0] ** 2 + mu[1] ** 2 + mu[2] ** 2
    b = [r[i] * (1 + zeta * t) + mu[i] * t for i in range(3)]
    f = 1 / math.sqrt(b[0] ** 2 + b[1] ** 2 + b[2] ** 2)
    u = [x * f for x in b]
    mu_t = [(mu[i] * (1 + zeta * t) - r[i] * mu2 * t) * f ** 3 for i in range(3)]
    a1, d1 = math.atan2(u[1], u[0]), math.asin(max(-1.0, min(1.0, u[2])))
    ca, sa, cd, sd = math.cos(a1), math.sin(a1), math.cos(d1), math.sin(d1)
    p = (-sa, ca, 0.0); q = (-sd * ca, -sd * sa, cd)
    return (math.degrees(a1) % 360.0, math.degrees(d1),
            sum(mu_t[i] * p[i] for i in range(3)) / MAS, sum(mu_t[i] * q[i] for i in range(3)) / MAS)


def unit(ra, dec):
    a, d = math.radians(ra), math.radians(dec)
    return (math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d))


def sep_arcsec(u, v):
    return math.degrees(2 * math.asin(min(1.0, 0.5 * math.sqrt(sum((x - y) ** 2 for x, y in zip(u, v)))))) * 3600


def g_minus_v(x):
    """Gaia DR3 documentation, table 5.9 (Johnson-Cousins relationships): G - V from BP-RP; sigma 0.03, valid -0.5 < x < 5."""
    x = min(5.0, max(-0.5, x))
    return -0.02704 + 0.01424 * x - 0.2156 * x * x + 0.01426 * x ** 3


def load_hip2(path):
    out = {}
    with gzip.open(path, 'rt') as f:
        for l in f:
            out[int(l[0:6])] = dict(ra=math.degrees(float(l[15:28])), dec=math.degrees(float(l[29:42])), plx=float(l[43:50]),
                                    pmra=float(l[51:59]), pmdec=float(l[60:68]), sn=int(l[7:10]))
    assert len(out) == 117955, len(out)
    return out


def load_hip_gaia(path):
    out = {}
    for r in csv.DictReader(open(path, newline='')):
        out[int(r['hip'])] = r
    return out


# ---- stars without a Hipparcos number -------------------------------------------------------------------
NOHIP_RADIUS = 120.0      # arcsec: how far from HYG's place a Gaia source may be (Gliese-catalogue places are rough)
NOHIP_DMAG = 0.6          # |V estimated from Gaia - HYG's V|
NOHIP_PM_FRAC, NOHIP_PM_ABS = 0.25, 40.0   # proper motions agree to this fraction of HYG's, or this many mas/yr
NOHIP_PM_MIN = 80.0       # HYG proper motion below which agreement in motion proves nothing: then the place must agree
NOHIP_SLOW_RADIUS = 5.0   # ... to this many arcsec


def match_nohip(rows, cands, taken):
    """rows: HYG stars without a Hipparcos number. cands: {source_id: Gaia row} (5- or 6-parameter sources only).
    taken: source_ids that ESA pairs with a Hipparcos star (never given to another star).
    A candidate is ACCEPTABLE for a star if, at epoch 2000.0, it lies within NOHIP_RADIUS of HYG's place, its proper
    motion differs from HYG's by less than max(NOHIP_PM_ABS, NOHIP_PM_FRAC x HYG's), and its V (from G and BP-RP) is
    within NOHIP_DMAG of HYG's. For a slow star (HYG motion < NOHIP_PM_MIN) the place must agree to NOHIP_SLOW_RADIUS.
    The star is matched only if exactly one candidate is acceptable and no other HYG star finds the same source
    acceptable. Returns {row index: (source_id, gaia row, separation arcsec)} and a dict of counts."""
    cell = math.radians(NOHIP_RADIUS / 3600)
    grid = {}
    for sid, c in cands.items():
        if sid in taken: continue
        pa, pd, g, col = fnum(c['pmra']), fnum(c['pmdec']), fnum(c['phot_g_mean_mag']), fnum(c['bp_rp'])
        if pa is None or pd is None or g is None or col is None: continue
        ra0, dec0, _, _ = propagate(float(c['ra']), float(c['dec']), fnum(c['parallax']) or 0.0, pa, pd, 0.0, T_GAIA)
        u = unit(ra0, dec0)
        grid.setdefault(tuple(int(math.floor(x / cell)) for x in u), []).append((sid, u, pa, pd, g - g_minus_v(col)))
    st = dict(none_near=0, none_acceptable=0, ambiguous=0, contested=0, matched=0)
    acc = {}
    for i, s in enumerate(rows):
        u = unit(s['ra'], s['dec'])
        pm = math.hypot(s['pmra'], s['pmdec'])
        k = tuple(int(math.floor(x / cell)) for x in u)
        near, ok = 0, []
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for c in (-1, 0, 1):
                    for (sid, v, pa, pd, vest) in grid.get((k[0] + a, k[1] + b, k[2] + c), ()):
                        d = sep_arcsec(u, v)
                        if d > NOHIP_RADIUS: continue
                        near += 1
                        if pm < NOHIP_PM_MIN and d > NOHIP_SLOW_RADIUS: continue
                        if math.hypot(pa - s['pmra'], pd - s['pmdec']) > max(NOHIP_PM_ABS, NOHIP_PM_FRAC * pm): continue
                        if abs(vest - s['mag']) > NOHIP_DMAG: continue
                        ok.append((sid, d))
        if not near: st['none_near'] += 1
        elif not ok: st['none_acceptable'] += 1
        elif len(ok) > 1: st['ambiguous'] += 1
        else: acc[i] = ok[0]
    claims = {}
    for i, (sid, d) in acc.items(): claims.setdefault(sid, []).append(i)
    out = {}
    for sid, idx in claims.items():
        if len(idx) > 1: st['contested'] += len(idx); continue
        out[idx[0]] = (sid, cands[sid], acc[idx[0]][1])
    st['matched'] = len(out)
    return out, st


def load_candidates(hip_dir, gaia_dir, rows):
    """Gaia DR3 sources that could be HYG's non-Hipparcos stars: the Gaia Catalogue of Nearby Stars, plus every
    G < 12 source within a few arcminutes of one of those stars (for the few that are not within 100 pc)."""
    cands = {}
    for r in csv.DictReader(open(os.path.join(hip_dir, 'gcns_gaia.csv'), newline='')):
        cands[int(r['source_id'])] = r
    ngcns = len(cands)
    cell = math.radians(4 / 60)
    grid = set()
    for s in rows:
        u = unit(s['ra'], s['dec'])
        k = [int(math.floor(x / cell)) for x in u]
        for a in (-1, 0, 1):
            for b in (-1, 0, 1):
                for c in (-1, 0, 1): grid.add((k[0] + a, k[1] + b, k[2] + c))
    files = sorted(glob.glob(os.path.join(gaia_dir, 'gaia_g12_*.csv')))
    assert len(files) == 12, 'expected the 12 gaia_g12_<k>.csv files of fetch_gaia.py in ' + gaia_dir
    for fn in files:
        with open(fn, newline='') as f:
            rd = csv.reader(f); head = next(rd)
            assert head == ['source_id', 'ra', 'dec', 'phot_g_mean_mag', 'bp_rp', 'parallax', 'pmra', 'pmdec'], head
            for row in rd:
                u = unit(float(row[1]), float(row[2]))
                if tuple(int(math.floor(x / cell)) for x in u) in grid:
                    cands.setdefault(int(row[0]), dict(zip(head, row)))
    return cands, ngcns


def main(src, hip_dir, gaia_dir, out):
    rows = []
    for r in csv.DictReader(open(src, newline='')):
        if r['id'] == '0': continue                      # the Sun
        mag = num(r['mag'], 99)
        if mag > 20: continue
        dist = num(r['dist'])
        if dist >= 100000: dist = 0                      # HYG's "unknown distance" flag
        rows.append(dict(ra=num(r['ra']) * 15, dec=num(r['dec']), mag=mag,
                         bv=num(r['ci'], 99) if r['ci'] != '' else 99,
                         hip=int(num(r['hip'])), hd=num(r['hd']), dist=dist,
                         pmra=num(r['pmra']), pmdec=num(r['pmdec']), rv=num(r['rv']), src=0,
                         proper=r['proper'].strip(), bayer=r['bayer'].strip(), flam=r['flam'].strip(),
                         con=r['con'].strip(), gl=r['gl'].strip()))
    hip2 = load_hip2(os.path.join(hip_dir, 'hip2.dat.gz'))
    hg = load_hip_gaia(os.path.join(hip_dir, 'hip_gaia.csv'))
    print('HYG: %d stars, %d with a Hipparcos number; Hipparcos-2: %d; ESA Gaia DR3 x Hipparcos-2 pairs: %d'
          % (len(rows), sum(1 for s in rows if s['hip']), len(hip2), len(hg)))

    # ---- stars with a Hipparcos number --------------------------------------------------------------------
    why = dict(no_pair=0, several_neighbours=0, no_proper_motion=0, bright=0, disagrees_with_hipparcos=0)
    differ = dict(n=0, ruwe_high=0, j2000_over_50mas=0, j2000_over_100mas=0, y2027_over_100mas=0, y2027_over_500mas=0)   # Gaia's place against Hipparcos-2's, for the stars given Gaia's
    taken = set(int(g['source_id']) for g in hg.values())
    # bright Gaia sources (G < 7) that ESA pairs with no Hipparcos star, on a 20 arcsec grid at their 2016.0 places
    bcell = math.radians(20 / 3600); bgrid = {}
    for r in csv.DictReader(open(os.path.join(hip_dir, 'gaia_bright.csv'), newline='')):
        if int(r['source_id']) in taken or r['phot_g_mean_mag'] == '': continue
        u = unit(float(r['ra']), float(r['dec']))
        bgrid.setdefault(tuple(int(math.floor(x / bcell)) for x in u), []).append((u, r))
    own = dict(tried=0, none_within_1arcsec=0, several=0, magnitude_differs=0, found=0)
    shift = []                                           # how far each star moved from HYG's place, arcsec
    gaia_ids = []
    for s in rows:
        if not s['hip']: continue
        h = hip2[s['hip']]                               # KeyError = a Hipparcos number HYG has and Hipparcos-2 lacks (none in v4.1)
        old = unit(s['ra'], s['dec'])
        g = hg.get(s['hip'])
        use = None; src = 2
        if g is None and s['mag'] <= BRIGHT_V_MAX:
            own['tried'] += 1
            at16 = propagate(h['ra'], h['dec'], h['plx'], h['pmra'], h['pmdec'], s['rv'], 2016.0 - 1991.25)
            u = unit(at16[0], at16[1]); k = [int(math.floor(x / bcell)) for x in u]
            near = [r for a in (-1, 0, 1) for b in (-1, 0, 1) for c in (-1, 0, 1)
                    for (v, r) in bgrid.get((k[0] + a, k[1] + b, k[2] + c), ()) if sep_arcsec(u, v) <= BRIGHT_RADIUS]
            if not near: own['none_within_1arcsec'] += 1
            elif len(near) > 1: own['several'] += 1
            else:
                r = near[0]; col = fnum(r['bp_rp'])
                if col is None or abs(float(r['phot_g_mean_mag']) - g_minus_v(col) - s['mag']) > BRIGHT_DMAG: own['magnitude_differs'] += 1
                else: g = dict(r, number_of_neighbours='1'); src = 3; own['found'] += 1
        if g is None: why['no_pair'] += 1
        elif g['number_of_neighbours'] != '1': why['several_neighbours'] += 1
        elif g['astrometric_params_solved'] not in ('31', '95'): why['no_proper_motion'] += 1
        elif float(g['phot_g_mean_mag']) < GAIA_G_MIN: why['bright'] += 1
        else:
            gra, gdec, gplx, gpa, gpd = float(g['ra']), float(g['dec']), float(g['parallax']), float(g['pmra']), float(g['pmdec'])
            back = propagate(gra, gdec, gplx, gpa, gpd, s['rv'], 1991.25 - 2016.0)
            if sep_arcsec(unit(back[0], back[1]), unit(h['ra'], h['dec'])) * 1000 > GAIA_HIP_AGREE_MAS: why['disagrees_with_hipparcos'] += 1
            else:
                use = propagate(gra, gdec, gplx, gpa, gpd, s['rv'], T_GAIA)
                # how much the choice matters: the two catalogues' places for this star at 2000.0 and at 2027.0
                d0 = sep_arcsec(unit(use[0], use[1]), unit(*propagate(h['ra'], h['dec'], h['plx'], h['pmra'], h['pmdec'], s['rv'], T_HIP)[:2]))
                d27 = sep_arcsec(unit(*propagate(gra, gdec, gplx, gpa, gpd, s['rv'], 11.0)[:2]),
                                 unit(*propagate(h['ra'], h['dec'], h['plx'], h['pmra'], h['pmdec'], s['rv'], 2027.0 - 1991.25)[:2]))
                differ['n'] += 1; differ['ruwe_high'] += float(g['ruwe'] or 99) >= GAIA_RUWE_MAX
                differ['j2000_over_50mas'] += d0 > 0.05; differ['j2000_over_100mas'] += d0 > 0.1
                differ['y2027_over_100mas'] += d27 > 0.1; differ['y2027_over_500mas'] += d27 > 0.5
        if use: s['src'] = src; gaia_ids.append((int(g['source_id']), s['hip'], src))
        else: use = propagate(h['ra'], h['dec'], h['plx'], h['pmra'], h['pmdec'], s['rv'], T_HIP); s['src'] = 1
        s['ra'], s['dec'], s['pmra'], s['pmdec'] = use
        shift.append(sep_arcsec(old, unit(s['ra'], s['dec'])))
    print('Hipparcos stars: Gaia DR3 astrometry for %d (%d of them identified here), Hipparcos-2 for %d' %
          (sum(1 for s in rows if s['src'] in (2, 3)), sum(1 for s in rows if s['src'] == 3), sum(1 for s in rows if s['src'] == 1)))
    print('  bright stars without an ESA pair:', own)
    print('  Hipparcos-2 kept because:', why)
    print('  Gaia-based place against the Hipparcos-2-based place of the same star:', differ)
    print('  moved from HYG\'s place by > 0.1": %d, > 1": %d, > 5": %d; largest %.2f"' %
          (sum(d > 0.1 for d in shift), sum(d > 1 for d in shift), sum(d > 5 for d in shift), max(shift)))

    # ---- stars without one ----------------------------------------------------------------------------------
    nohip = [s for s in rows if not s['hip']]
    cands, ngcns = load_candidates(hip_dir, gaia_dir, nohip)
    taken |= set(sid for sid, _, _ in gaia_ids)
    matched, st = match_nohip(nohip, cands, taken)
    nshift = []
    for i, (sid, c, d) in matched.items():
        s = nohip[i]
        old = unit(s['ra'], s['dec'])
        s['ra'], s['dec'], s['pmra'], s['pmdec'] = propagate(float(c['ra']), float(c['dec']), fnum(c['parallax']) or 0.0,
                                                             float(c['pmra']), float(c['pmdec']), s['rv'], T_GAIA)
        s['src'] = 3; gaia_ids.append((sid, 0, 3))
        nshift.append(sep_arcsec(old, unit(s['ra'], s['dec'])))
    nshift.sort()
    print('stars without a Hipparcos number: %d; candidates: %d Gaia sources (%d from the nearby-star catalogue)' % (len(nohip), len(cands), ngcns))
    print('  ', st)
    if nshift:
        print('   matched stars moved from HYG\'s place by: median %.1f", 90%% under %.1f", largest %.1f"; > 1": %d, > 5": %d, > 10": %d' %
              (nshift[len(nshift) // 2], nshift[int(len(nshift) * 0.9)], nshift[-1], sum(d > 1 for d in nshift), sum(d > 5 for d in nshift), sum(d > 10 for d in nshift)))
    left = [s for s in rows if s['src'] == 0]
    print('   left with HYG\'s own place (src 0): %d, of which brighter than V 6.5: %d, V 9.5: %d' %
          (len(left), sum(s['mag'] <= 6.5 for s in left), sum(s['mag'] <= 9.5 for s in left)))
    assert not [s for s in rows if abs(abs(s['pmdec']) - 9999.99) < 0.01 or abs(abs(s['pmra']) - 9999.99) < 0.01], 'a proper motion clipped by HYG'

    with open(os.path.join(hip_dir, 'hyg_gaia_ids.csv'), 'w', newline='') as f:
        w = csv.writer(f); w.writerow(['source_id', 'hip', 'src'])
        w.writerows(sorted(gaia_ids))

    rows.sort(key=lambda s: s['mag'])
    counts = [sum(1 for s in rows if s['src'] == k) for k in range(4)]
    manifest = dict(fields=FIELDS,
                    source='HYG v4.1 (astronexus), CC BY-SA 4.0: names, designations, V, B-V, distance, radial velocity. '
                           'Positions and proper motions (ICRS, epoch 2000.0): see astrometry.',
                    astrometry=[dict(src=k, source=SRC_NAMES[k], n=counts[k]) for k in range(4)], tiers=[])
    names = dict(name={}, bayer={}, flam={})
    lo = -99
    for k, hi in enumerate(TIERS):
        tier = [s for s in rows if lo < s['mag'] <= hi]
        lo = hi
        buf = bytearray()
        for i, s in enumerate(tier):
            ra, dec = f32(s['ra']), f32(s['dec'])
            buf += struct.pack('<13f', ra, dec, s['mag'], s['bv'], s['hip'], s['hd'], s['dist'], s['pmra'], s['pmdec'],
                               s['ra'] - ra, s['dec'] - dec, s['rv'], s['src'])
            if k == 0:
                if s['proper']: names['name'][i] = s['proper']
                if s['bayer'] and s['con']:
                    b = s['bayer'].split('-')
                    g = GREEK.get(b[0], b[0]) + (b[1].translate(SUP) if len(b) > 1 else '')
                    names['bayer'][i] = g + ' ' + s['con']
                if s['flam'] and s['con']: names['flam'][i] = s['flam'] + ' ' + s['con']
        fn = 'stars-%d.bin' % k
        open(os.path.join(out, fn), 'wb').write(buf)
        manifest['tiers'].append(dict(file=fn, n=len(tier), magMax=hi if hi < 99 else round(tier[-1]['mag'], 2)))
        print(fn, len(tier), len(buf), 'bytes; src 0/1/2/3:', [sum(1 for s in tier if s['src'] == j) for j in range(4)])
    json.dump(manifest, open(os.path.join(out, 'stars.json'), 'w'), separators=(',', ':'))
    json.dump(names, open(os.path.join(out, 'starnames.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('names', {k: len(v) for k, v in names.items()})


if __name__ == '__main__':
    main(*sys.argv[1:5])
