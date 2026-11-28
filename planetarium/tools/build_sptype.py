#!/usr/bin/env python3
"""build_sptype.py: the spectral types the spectrograph (js/spectro.js) builds its model spectra from.

    python3 tools/build_sptype.py [hip_sp.tsv]

Source: The Hipparcos Catalogue (ESA 1997, SP-1200), CDS catalogue I/239, file hip_main, field SpType, with three corrections listed in OVERRIDES (the MK type as
the catalogue gives it: "A0V", "K5III", "B8Ia", "G8III+..."), for every Hipparcos star that has one (115,184 of 118,218).
Licence: CC BY-NC 3.0 IGO (stated in the catalogue's ReadMe), credited in js/about.js. The table is downloaded from the
VizieR mirror at CfA (the Strasbourg server second) with a generic User-Agent; give a saved copy as the argument to skip it.

Writes data/sptype.txt: one line per star in order of Hipparcos number, "<gap> <type>", where <gap> is the difference from
the previous star's number, left out when it is 1 (634 kB, 172 kB gzipped).
"""
import os, sys, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
UA = {'User-Agent': 'Mozilla/5.0 (catalogue download script)'}
URLS = ['https://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=I/239/hip_main&-out=HIP,SpType&-out.max=unlimited',
        'https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I/239/hip_main&-out=HIP,SpType&-out.max=unlimited']


# Where the 1997 catalogue's type contradicts the star's own colour (B-V) because it describes a companion or a blend, the
# type SIMBAD gives for the bright component (checked by hand, November 2026). Keep this list short and cited.
OVERRIDES = {
    24608: 'G8III',     # Capella: I/239 "M1: comp" (B-V 0.80); Capella Aa is G8III, Ab G0III
    54061: 'K0III',     # Dubhe: I/239 "F7V comp" (B-V 1.06); the primary is K0IIIa, the F7V star is its faint companion
    9640: 'K3II',       # Almach: I/239 "B8V" (B-V 1.37); gamma1 And is K3-IIb, the B8V star is gamma2
}


def fetch():
    for u in URLS:
        try:
            with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=600) as r:
                return r.read().decode('latin-1')
        except Exception as e:
            print('failed:', u, e, file=sys.stderr)
    raise SystemExit('no VizieR server answered')


def main():
    text = open(sys.argv[1], encoding='latin-1').read() if len(sys.argv) > 1 else fetch()
    types = {}
    for line in text.splitlines():
        p = line.split('\t')
        if not p or not p[0].strip().isdigit():
            continue
        sp = p[-1].strip()
        if sp:
            types[int(p[0])] = sp
    types.update(OVERRIDES)
    out, prev = [], 0
    for hip in sorted(types):
        out.append(('' if hip - prev == 1 else str(hip - prev)) + ' ' + types[hip])
        prev = hip
    path = os.path.join(ROOT, 'data', 'sptype.txt')
    with open(path, 'w') as f:
        f.write('\n'.join(out) + '\n')
    print(f'{len(types)} spectral types -> {path} ({os.path.getsize(path)} bytes)')


if __name__ == '__main__':
    main()
