#!/usr/bin/env python3
"""fetch_gaia.py: download the bright end of Gaia DR3 (G < 12, about 3.09 million sources) from the ESA Gaia
archive, without an account (anonymous synchronous TAP queries with MAXREC), plus ESA's Hipparcos-2
cross-match table.

    python3 tools/fetch_gaia.py RAW_DIR            # then:  python3 tools/build_gaia.py RAW_DIR HYG_CSV data/

Writes RAW_DIR/gaia_g12_<k>.csv for the 12 HEALPix base pixels (a Gaia source_id starts with the source's
level-12 nested HEALPix index, so `source_id BETWEEN k * 2^59 AND (k + 1) * 2^59 - 1` is one base pixel and
is an indexed range) and RAW_DIR/hip_xmatch.csv. Each chunk is about 260,000 rows (33 MB of CSV, a few
seconds); every file's row count is checked against the archive's own COUNT(*). Files already present are
skipped, so the script can be re-run.

Also writes the star-count map that the app's limiting-magnitude rule needs for the stars it does NOT bundle:
RAW_DIR/counts_<a>_<b>.csv = number of sources per HEALPix order-4 cell (3,072 cells of 13.4 square degrees) and
half-magnitude bin of G. Exact for 12 <= G < 17 (one query per magnitude); for G >= 17 a 2 % random sample
(Gaia's own `random_index` column, in eight slices of 0.25 %), which build_gaia.py scales by 50.
Nothing identifying is sent: a generic User-Agent, no cookies.
"""
import sys, os, time, urllib.request, urllib.parse

TAP = 'https://gea.esac.esa.int/tap-server/tap'
UA = {'User-Agent': 'Mozilla/5.0 (catalogue download script)'}
GMAX = 12.0
COLS = 'source_id, ra, dec, phot_g_mean_mag, bp_rp, parallax, pmra, pmdec'


def http(url, data=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers=UA)
    return urllib.request.urlopen(req, timeout=600)


def query(q, maxrec=3000000):
    return http(TAP + '/sync', {'REQUEST': 'doQuery', 'LANG': 'ADQL', 'FORMAT': 'csv', 'MAXREC': str(maxrec), 'QUERY': q})


def fetch_plain(q, out):
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print('have', out); return
    tmp = out + '.part'
    with query(q) as r, open(tmp, 'wb') as f:
        f.write(r.read())
    os.rename(tmp, out)
    print('wrote', out, os.path.getsize(out), 'bytes')
    time.sleep(1)


def fetch(select, where, out):
    """Run `SELECT select FROM where` and save it; then check the row count against COUNT(*), because a job
    that hits a row limit is cut off without an error (an asynchronous anonymous job stops at 50,000 rows)."""
    if os.path.exists(out) and os.path.getsize(out) > 0:
        print('have', out); return
    tmp = out + '.part'
    with query(f'SELECT {select} FROM {where}') as r, open(tmp, 'wb') as f:
        while True:
            b = r.read(1 << 20)
            if not b: break
            f.write(b)
    rows = sum(1 for _ in open(tmp, 'rb')) - 1
    want = int(query(f'SELECT COUNT(*) FROM {where}').read().decode().split()[1])
    if rows != want:
        raise SystemExit(f'{out}: got {rows} rows, the archive counts {want}')
    os.rename(tmp, out)
    print('wrote', out, rows, 'rows')
    time.sleep(1)


def main():
    raw = sys.argv[1]
    os.makedirs(raw, exist_ok=True)
    for k in range(12):
        lo, hi = k << 59, ((k + 1) << 59) - 1
        fetch(COLS, f'gaiadr3.gaia_source WHERE source_id BETWEEN {lo} AND {hi} AND phot_g_mean_mag < {GMAX}',
              os.path.join(raw, f'gaia_g12_{k}.csv'))
    # ESA's own cross-match of Gaia DR3 with the Hipparcos-2 catalogue (best neighbour): which Gaia source IS which HIP star
    fetch('source_id, original_ext_source_id, angular_distance', 'gaiadr3.hipparcos2_best_neighbour',
          os.path.join(raw, 'hip_xmatch.csv'))
    # star counts per order-4 cell and half magnitude (see the top of the file)
    grp = ('SELECT hp, mb, COUNT(*) AS n FROM (SELECT GAIA_HEALPIX_INDEX(4, source_id) AS hp, FLOOR(phot_g_mean_mag*2) AS mb '
           'FROM gaiadr3.gaia_source WHERE %s) AS s GROUP BY hp, mb')
    for m in range(12, 17):
        fetch_plain(grp % f'phot_g_mean_mag >= {m} AND phot_g_mean_mag < {m + 1}', os.path.join(raw, f'counts_{m}_{m + 1}.csv'))
    NSRC = 1811709771                                    # rows in gaiadr3.gaia_source; random_index runs 0 .. NSRC - 1
    step = NSRC // 400                                   # 0.25 %
    for k in range(8):
        fetch_plain(grp % f'random_index >= {k * step} AND random_index < {(k + 1) * step} AND phot_g_mean_mag >= 17',
                    os.path.join(raw, f'counts_sample_{k}.csv'))


if __name__ == '__main__':
    main()
