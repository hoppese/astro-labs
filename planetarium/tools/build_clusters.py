"""tools/build_clusters.py: data/clusters.json, the members of the Hyades, the Pleiades and Praesepe that the clusters lab
(js/labs/clusters.js) rings on the sky and measures.

  python3 tools/build_clusters.py

Sources
- Membership, positions (ICRS, epoch 2015.5) and the clusters' parallaxes, reddening and ages: Gaia Collaboration, Babusiaux
  et al. 2018, "Gaia Data Release 2: Observational Hertzsprung-Russell diagrams", A&A 616, A10 (CDS J/A+A/616/A10, table A1a
  for the members; table 2 of the paper for the cluster parameters, copied below).
- G and BP-RP of each member: Gaia DR2 (gaiadr2 gaia_source, as gaia.dr2light at the GAVO data centre, dc.g-vo.org; the ESA
  archive serves the same columns). Licence: CC BY-NC 3.0 IGO, credit ESA/Gaia/DPAC (as for the planetarium's other Gaia data).
Selection (so that a student can measure every ringed star in a class period): members with G < 12 (the planetarium's bundled
stars reach G = 12; a brighter cut would leave only the brightest, so the most luminous, stars at the red end of the far clusters
and bias the fit); up to 6 of those brighter than absolute G = 1 (the top of the main sequence and the giants: the turnoff),
spread in colour; then along the main sequence one star per 0.10 mag of dereddened BP-RP, the one nearest that bin's median
absolute magnitude (which leaves out most unresolved binaries: an idealisation, said so in the lab's About).
"""
import csv, io, json, math, os, statistics, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'data', 'clusters.json')
UA = {'User-Agent': 'astro-labs-build (planetarium data)'}
VIZ = ['https://vizier.cfa.harvard.edu/viz-bin/asu-tsv', 'https://vizier.cds.unistra.fr/viz-bin/asu-tsv']
TAP = 'https://dc.g-vo.org/tap/sync'

# Gaia Collaboration 2018 (A&A 616 A10), table 2: mean parallax (mas), E(B-V), log10 age (yr)
CLUSTERS = [
    dict(id='hyades', name='Hyades', plx=21.052, ebv=0.001, logage=8.90, color='#f2a65a'),
    dict(id='pleiades', name='Pleiades', plx=7.364, ebv=0.045, logage=7.99, color='#7fb7ff'),
    dict(id='praesepe', name='Praesepe', plx=5.371, ebv=0.027, logage=8.85, color='#8fdc9a'),
]
A_G, E_BPRP = 2.67, 1.339          # A_G / E(B-V) and E(BP-RP) / E(B-V) for a solar-type star (Gaia DR2 documentation, approximately)


def viz_members():
    q = urllib.parse.urlencode({'-source': 'J/A+A/616/A10/tablea1a', '-out': 'Source,Cluster,RAdeg,DEdeg,Gmag', 'Gmag': '<12', '-out.max': 'unlimited'})
    for base in VIZ:
        try:
            txt = urllib.request.urlopen(urllib.request.Request(base + '?' + q, headers=UA), timeout=120).read().decode()
        except Exception as e:
            print('  ', base, e); continue
        rows = [l.split('\t') for l in txt.splitlines() if l and not l.startswith('#')]
        rows = [r for r in rows if r[0].strip().isdigit()]
        if rows: return [dict(src=r[0].strip(), cl=r[1].strip(), ra=float(r[2]), dec=float(r[3]), g=float(r[4])) for r in rows]
    raise SystemExit('no member list from VizieR')


def dr2_colours(ids):
    out = {}
    for k in range(0, len(ids), 300):
        q = ('SELECT source_id, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag FROM gaia.dr2light WHERE source_id IN ('
             + ','.join(ids[k:k + 300]) + ')')
        data = urllib.parse.urlencode({'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'QUERY': q}).encode()
        txt = urllib.request.urlopen(urllib.request.Request(TAP, data=data, headers=UA), timeout=300).read().decode()
        for r in csv.DictReader(io.StringIO(txt)):
            if r['phot_bp_mean_mag'] and r['phot_rp_mean_mag']:
                out[r['source_id']] = (float(r['phot_g_mean_mag']), float(r['phot_bp_mean_mag']) - float(r['phot_rp_mean_mag']))
    return out


def mist_turnoffs():
    """The ages table of the lab's turnoff step: for each log age, the bluest point of the main sequence (MIST phase 0) in Gaia DR2
    BP-RP, from the MIST v1.2 isochrones (Choi et al. 2016, ApJ 823, 102; Dotter 2016, ApJS 222, 8), [Fe/H] = 0, v/vcrit = 0.4,
    no extinction, UBVRIplus photometry (Gaia_BP_DR2Rev - Gaia_RP_DR2Rev), from the MIST web interpolator at mist.science.
    Result on 2026-11-28 (log age: BP-RP0): 7.6 -0.336, 8.0 -0.224, 8.2 -0.170, 8.4 -0.114, 8.6 -0.052, 8.8 0.061, 9.0 0.246,
    9.2 0.420, 9.4 0.541, 9.6 0.631, 9.8 0.726, 10.0 0.805. The lab turns each into this photometer's R/B (presets.js, check-labs)."""
    import re, zipfile
    ages = '7.6 8.0 8.2 8.4 8.6 8.8 9.0 9.2 9.4 9.6 9.8 10.0'
    form = urllib.parse.urlencode(dict(version='MIST1', v_div_vcrit='vvcrit0.4', age_scale='log10', age_type='list', age_list=ages, FeH_value='0',
                                       alpha_value='p0', output_option='photometry', output='UBVRIplus', Av_value='0')).encode()
    page = urllib.request.urlopen(urllib.request.Request('https://mist.science/iso_form.php', data=form, headers=UA), timeout=600).read().decode()
    url = 'https://mist.science/' + re.search(r'href="([^"]+\.zip)"', page).group(1)
    z = zipfile.ZipFile(io.BytesIO(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=600).read()))
    best = {}
    for l in z.read([n for n in z.namelist() if n.endswith('UBVRIplus')][0]).decode().splitlines():
        if l.startswith('#') or not l.strip(): continue
        v = l.split()
        if float(v[-1]) != 0: continue
        a, c = float(v[1]), float(v[24]) - float(v[25])
        if a not in best or c < best[a]: best[a] = c
    for a in sorted(best): print(f'log age {a:.1f}: turnoff BP-RP0 {best[a]:.3f}')


def main():
    mem = [m for m in viz_members() if m['cl'] in ('Hyades', 'Pleiades', 'Praesepe')]
    col = dr2_colours([m['src'] for m in mem])
    out = dict(
        source='Members: Gaia Collaboration, Babusiaux et al. 2018, A&A 616, A10 (CDS J/A+A/616/A10). G and BP-RP: Gaia DR2 (ESA/Gaia/DPAC), via GAVO gaia.dr2light.',
        licence='CC BY-NC 3.0 IGO (https://www.cosmos.esa.int/web/gaia-users/license); credit ESA/Gaia/DPAC',
        note='Positions ICRS, epoch 2015.5. g, bprp: as observed (the lab removes the reddening with ebv, A_G = 2.67 E(B-V), E(BP-RP) = 1.339 E(B-V)).',
        aG=A_G, eBPRP=E_BPRP, clusters=[])
    for c in CLUSTERS:
        d = 1000 / c['plx']
        rows = []
        for m in mem:
            if m['cl'] != c['name'] or m['src'] not in col: continue
            g, bprp = col[m['src']]
            c0, M = bprp - E_BPRP * c['ebv'], g - A_G * c['ebv'] - 5 * math.log10(d / 10)
            rows.append(dict(m, g=g, bprp=bprp, c0=c0, M=M))
        top = [r for r in rows if r['M'] < 1.0]
        ms = [r for r in rows if r['M'] >= 1.0]
        top.sort(key=lambda r: r['c0'])
        pick = [top[round(i * (len(top) - 1) / 5)] for i in range(6)] if len(top) > 6 else list(top)
        lo = min(r['c0'] for r in ms)
        b = lo
        while b < max(r['c0'] for r in ms) + 1e-9:
            inb = [r for r in ms if b <= r['c0'] < b + 0.10]
            mlim = 12 - A_G * c['ebv'] - 5 * math.log10(d / 10)          # absolute G of the G = 12 cut
            if inb and statistics.median(r['M'] for r in inb) < mlim - 0.7:      # (a bin near the cut holds only its brightest stars)
                med = statistics.median(r['M'] for r in inb)
                pick.append(min(inb, key=lambda r: abs(r['M'] - med)))
            b += 0.10
        pick.sort(key=lambda r: r['g'])
        out['clusters'].append(dict(id=c['id'], name=c['name'], plx=c['plx'], dist=round(d, 2), ebv=c['ebv'], logAge=c['logage'], color=c['color'],
                                    members=[[round(r['ra'], 5), round(r['dec'], 5), round(r['g'], 3), round(r['bprp'], 3), r['src']] for r in pick]))
        print(f"{c['name']}: {len(rows)} members with G < 12 and a colour, {len(pick)} picked ({len(top)} brighter than M_G = 1)")
    json.dump(out, open(OUT, 'w'), separators=(',', ':'))
    print('wrote', OUT, os.path.getsize(OUT), 'bytes')


if __name__ == '__main__':
    import sys
    mist_turnoffs() if '--turnoff' in sys.argv else main()
