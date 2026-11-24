#!/usr/bin/env python3
"""fetch_hipparcos.py: download the astrometry that tools/build_stars.py uses to replace HYG's positions and
proper motions.

    python3 tools/fetch_hipparcos.py RAW_HIP_DIR [--with-1997]

Writes into RAW_HIP_DIR (never into the repo):
  hip2.dat.gz, ReadMe.I311   Hipparcos, the New Reduction (van Leeuwen 2007, A&A 474, 653), CDS catalogue I/311:
                             117,955 stars, ICRS, epoch 1991.25, with parallaxes and proper motions.
  hip_main.dat, ReadMe.I239  only with --with-1997: The Hipparcos Catalogue (ESA 1997, SP-1200), CDS catalogue I/239
                             (53 MB; its ReadMe states the licence CC BY-NC 3.0 IGO). NOT used by the build: it is
                             what HYG's own positions were derived from, and was used once to prove how (NOTES.md).
  hip_gaia.csv               ESA's cross-match of Gaia DR3 with Hipparcos-2 (gaiadr3.hipparcos2_best_neighbour)
                             joined with the Gaia DR3 astrometry of each matched source (99,525 rows).
  gaia_bright.csv            Gaia DR3 sources brighter than G = 7 (21,329) with RUWE: candidates for the bright
                             Hipparcos stars that ESA's cross-match leaves unpaired (theta UMa, eta Cas ...).
  gcns_gaia.csv              The Gaia Catalogue of Nearby Stars (Gaia Collaboration, Smart et al. 2021;
                             external.gaiaedr3_gcns_main_1, 331,312 sources within 100 pc; Gaia EDR3 astrometry,
                             which is DR3's):
                             the candidates for HYG's stars that have no Hipparcos number (Gliese catalogue).

CDS files come from the VizieR mirror at CfA (the Strasbourg server is tried second); the Gaia tables from the
ESA Gaia archive by anonymous synchronous TAP (an anonymous ASYNC job stops at 50,000 rows: see fetch_gaia.py).
Files already present are skipped. Nothing identifying is sent: a generic User-Agent, no cookies.
"""
import sys, os, time, urllib.request, urllib.parse

UA = {'User-Agent': 'Mozilla/5.0 (catalogue download script)'}
CDS = ['https://vizier.cfa.harvard.edu/ftp/cats/', 'https://cdsarc.cds.unistra.fr/ftp/']
TAP = 'https://gea.esac.esa.int/tap-server/tap'
GCOLS = ('g.source_id, g.ra, g.dec, g.parallax, g.pmra, g.pmdec, g.ra_error, g.dec_error, g.pmra_error, g.pmdec_error, '
         'g.ruwe, g.astrometric_params_solved, g.duplicated_source, g.phot_g_mean_mag, g.bp_rp, g.radial_velocity')


def http(url, data=None, timeout=600):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers=UA)
    return urllib.request.urlopen(req, timeout=timeout)


def save(resp, out):
    tmp = out + '.part'
    with resp as r, open(tmp, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    os.rename(tmp, out)


def cds(path, out, min_bytes):
    if os.path.exists(out) and os.path.getsize(out) >= min_bytes:
        print('have', out); return
    err = None
    for base in CDS:
        try:
            save(http(base + path, timeout=120), out)
            if os.path.getsize(out) < min_bytes: raise IOError('only %d bytes' % os.path.getsize(out))
            print('wrote', out, os.path.getsize(out), 'bytes, from', base); return
        except Exception as e:                       # try the next mirror
            err = e; print('  failed at', base, repr(e))
    raise SystemExit('could not download %s: %r' % (path, err))


def tap(select, frm, out, count_from, chunks):
    """SELECT ... FROM <frm> WHERE <chunk>, one query per chunk, saved together as one CSV. The row count is checked
    against COUNT(*) of `count_from`, the table that sets the number of rows: a join that runs long is cut off
    WITHOUT an error (one query for all 99,525 Hipparcos pairs came back with 32,769 rows), and COUNT(*) over the
    join itself times out (HTTP 408). Hence the chunks."""
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print('have', out); return
    q = lambda s: http(TAP + '/sync', {'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'MAXREC': '3000000', 'QUERY': s})
    tmp = out + '.tmp'
    rows = 0
    with open(tmp, 'wb') as f:
        for k, where in enumerate(chunks):
            lines = q('SELECT %s FROM %s WHERE %s' % (select, frm, where)).read().splitlines(keepends=True)
            f.writelines(lines if k == 0 else lines[1:])
            rows += len(lines) - 1
            print('  chunk %d/%d: %d rows' % (k + 1, len(chunks), len(lines) - 1))
            time.sleep(1)
    want = int(q('SELECT COUNT(*) FROM %s' % count_from).read().decode().split()[1])
    if rows != want: raise SystemExit('%s: got %d rows, the archive counts %d' % (out, rows, want))
    os.rename(tmp, out)
    print('wrote', out, rows, 'rows')


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    j = lambda f: os.path.join(raw, f)
    cds('I/311/ReadMe', j('ReadMe.I311'), 5000)
    cds('I/311/hip2.dat.gz', j('hip2.dat.gz'), 8 << 20)
    if '--with-1997' in sys.argv:
        cds('I/239/ReadMe', j('ReadMe.I239'), 5000)
        cds('I/239/hip_main.dat', j('hip_main.dat'), 50 << 20)
    tap('x.original_ext_source_id AS hip, x.angular_distance, x.number_of_neighbours, ' + GCOLS,
        'gaiadr3.hipparcos2_best_neighbour AS x JOIN gaiadr3.gaia_source AS g ON g.source_id = x.source_id', j('hip_gaia.csv'),
        'gaiadr3.hipparcos2_best_neighbour',
        ['x.original_ext_source_id BETWEEN %d AND %d' % (a, a + 9999) for a in range(0, 130000, 10000)])
    # The nearby-star catalogue carries the Gaia EDR3 astrometry itself (identical to DR3), so no join: joined to
    # gaia_source, most chunks came back cut at exactly 8,192 rows, again without an error.
    tap('source_id, ra, dec, parallax, pmra, pmdec, ruwe, phot_g_mean_mag, phot_bp_mean_mag - phot_rp_mean_mag AS bp_rp',
        'external.gaiaedr3_gcns_main_1', j('gcns_gaia.csv'), 'external.gaiaedr3_gcns_main_1',
        ['source_id BETWEEN %d AND %d' % (k << 59, ((k + 1) << 59) - 1) for k in range(12)])

    # every Gaia DR3 source brighter than G = 7, with RUWE: for the bright Hipparcos stars that ESA's table does not pair
    tap(GCOLS.replace('g.', ''), 'gaiadr3.gaia_source', j('gaia_bright.csv'), 'gaiadr3.gaia_source WHERE phot_g_mean_mag < 7',
        ['phot_g_mean_mag < 7'])


if __name__ == '__main__':
    main()
