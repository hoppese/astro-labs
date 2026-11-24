#!/usr/bin/env python3
"""Convert the HYG v4.1 star database (CC BY-SA 4.0) into compact binary tiers.

usage: python3 -I build_stars.py <raw/hyg/hygdata_v41.csv> <planetarium/data>

Output
  stars-<k>.bin   little-endian Float32, row-major, FIELDS per star, sorted by magnitude
                  fields: ra(deg, J2000) dec(deg) mag bv hip hd dist(pc) pmra(mas/yr) pmdec(mas/yr)
                  (missing bv = 99, missing hip/hd/dist = 0)
  stars.json      manifest: tiers [{file, n, magMax}], fields
  starnames.json  for tier 0 only: {"name": {index: proper}, "bayer": {index: "α CMa"}, "flam": {index: "9 CMa"}}
Positions are HYG's J2000 / epoch 2000.0; proper motion is applied in the app.
"""
import csv, json, struct, sys, os

FIELDS = ['ra', 'dec', 'mag', 'bv', 'hip', 'hd', 'dist', 'pmra', 'pmdec']
TIERS = [6.5, 7.5, 8.5, 9.5, 99]     # upper magnitude bound of each tier
GREEK = dict(Alp='α', Bet='β', Gam='γ', Del='δ', Eps='ε', Zet='ζ', Eta='η', The='θ', Iot='ι', Kap='κ',
             Lam='λ', Mu='μ', Nu='ν', Xi='ξ', Omi='ο', Pi='π', Rho='ρ', Sig='σ', Tau='τ', Ups='υ',
             Phi='φ', Chi='χ', Psi='ψ', Ome='ω')
SUP = str.maketrans('0123456789', '⁰¹²³⁴⁵⁶⁷⁸⁹')

def num(s, default=0.0):
    try: return float(s)
    except ValueError: return default

def main(src, out):
    rows = []
    for r in csv.DictReader(open(src, newline='')):
        if r['id'] == '0': continue                      # the Sun
        mag = num(r['mag'], 99)
        if mag > 20: continue
        dist = num(r['dist'])
        if dist >= 100000: dist = 0                      # HYG's "unknown distance" flag
        rows.append(dict(ra=num(r['ra']) * 15, dec=num(r['dec']), mag=mag,
                         bv=num(r['ci'], 99) if r['ci'] != '' else 99,
                         hip=num(r['hip']), hd=num(r['hd']), dist=dist,
                         pmra=num(r['pmra']), pmdec=num(r['pmdec']),
                         proper=r['proper'].strip(), bayer=r['bayer'].strip(), flam=r['flam'].strip(),
                         con=r['con'].strip()))
    # HYG's pmdec column overflows at 9999.99 mas/yr. Only Barnard's star (HIP 87937) moves that fast;
    # restore its value from the Hipparcos catalogue (ESA 1997), which HYG's other proper motions come from.
    for s in rows:
        if s['hip'] == 87937 and abs(s['pmdec'] - 9999.99) < 0.01:
            s['pmdec'] = 10326.93
    assert not [s for s in rows if abs(abs(s['pmdec']) - 9999.99) < 0.01 or abs(abs(s['pmra']) - 9999.99) < 0.01], 'another clipped proper motion'
    rows.sort(key=lambda s: s['mag'])
    manifest = dict(fields=FIELDS, source='HYG v4.1 (astronexus), CC BY-SA 4.0', tiers=[])
    names = dict(name={}, bayer={}, flam={})
    lo = -99
    for k, hi in enumerate(TIERS):
        tier = [s for s in rows if lo < s['mag'] <= hi]
        lo = hi
        buf = bytearray()
        for i, s in enumerate(tier):
            buf += struct.pack('<%df' % len(FIELDS), *[s[f] for f in FIELDS])
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
        print(fn, len(tier), len(buf))
    json.dump(manifest, open(os.path.join(out, 'stars.json'), 'w'), separators=(',', ':'))
    json.dump(names, open(os.path.join(out, 'starnames.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    print('names', {k: len(v) for k, v in names.items()})

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
