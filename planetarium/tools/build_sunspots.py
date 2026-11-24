#!/usr/bin/env python3
"""data/sun/: the recorded sunspot groups and the sunspot numbers.
  groups: Royal Greenwich Observatory 1874-1976 and USAF/NOAA 1977-, daily, as compiled by D. Hathaway (solarcyclescience.com/AR_Database/gYYYY.txt); the last
          days from NOAA SWPC's Solar Region Summaries (ftp.swpc.noaa.gov/pub/warehouse/YYYY/SRS). One file per decade, one track per group.
  numbers: SILSO (Royal Observatory of Belgium) monthly 1749-, yearly 1700-, group number 1610-; 12-month forecast; NOAA/SWPC predicted cycle to 2030.
Usage: build_sunspots.py RAW_SUN_DIR ../data/sun"""
import sys, os, glob, re, json, math, datetime, struct
import numpy as np
RAW, OUT = sys.argv[1:3]; os.makedirs(OUT, exist_ok=True)
J2000 = datetime.date(2000, 1, 1)
def daynum(y, m, d, f): return (datetime.date(y, m, d) - J2000).days - 0.5 + f        # days from J2000.0 (12h)
CLS = 'ABCDEFH'
def parse():
    rows = []; missing = set()
    for fn in sorted(glob.glob(RAW + '/g[12]*.txt')):
        for l in open(fn, errors='replace'):
            l = l.rstrip('\n').ljust(76)
            try: y, m, d, f = int(l[0:4]), int(l[4:6]), int(l[6:8]), float(l[8:12] or 0)
            except ValueError: continue
            num = l[12:20].strip()
            try: lon, lat, area, cmd = float(l[57:62]), float(l[63:68]), float(l[40:44] or 0), float(l[69:74])
            except ValueError: missing.add((y, m, d)); continue
            if not num or num == '0' or (lon == 0 and lat == 0 and area == 0): missing.add((y, m, d)); continue
            t = daynum(y, m, d, f)
            c = 0
            if y >= 1982:
                z = l[25:29].strip()
                if z and z[0] in CLS: c = CLS.index(z[0]) + 1 + (8 if len(z) > 2 and (z[2] == 'c' or z[1] == 'k') else 0)
            rows.append((num + (l[20].strip() if y >= 1982 else ''), t, lat, lon, max(1., area), c, cmd, y))
    for fn in sorted(glob.glob(RAW + '/srs/*SRS.txt')):
        y, m, d = int(os.path.basename(fn)[:4]), int(os.path.basename(fn)[4:6]), int(os.path.basename(fn)[6:8]); on = False
        for l in open(fn):
            if l.startswith('I.  Regions'): on = True; continue
            if l.startswith('IA.'): break
            q = re.match(r'(\d{4}) ([NS])(\d\d)([EW])(\d\d) +(\d+) +(\d+) +(\w{3}) ', l)
            if on and q:
                z = q.group(8); c = (CLS.index(z[0]) + 1 if z[0] in CLS else 0) + (8 if z[2] == 'c' or z[1] == 'k' else 0)
                rows.append(('1' + q.group(1), daynum(y, m, d, 0.0), (1 if q.group(2) == 'N' else -1) * float(q.group(3)), float(q.group(6)), max(1., float(q.group(7))), c, (1 if q.group(4) == 'W' else -1) * float(q.group(5)), y))
    return rows, missing
def tracks(rows):
    by = {}
    for r in rows: by.setdefault(r[0], []).append(r)
    out = []
    for k, v in by.items():
        v.sort(key=lambda r: r[1]); cur = []
        for r in v:
            if cur and (r[1] - cur[-1][1] > 4.5): out.append(cur); cur = []
            if cur and r[1] - cur[-1][1] < 0.05: continue
            cur.append(r)
        out.append(cur)
    return [t for t in out if t]
if __name__ == '__main__':
    rows, missing = parse(); tr = tracks(rows); print(len(rows), 'rows', len(tr), 'tracks', len(missing), 'days without a usable record', rows and max(r[1] for r in rows))
    dec = {}
    for t in tr:
        y = 2000 + t[0][1] / 365.2425; dec.setdefault(int(y // 10) * 10, []).append(t)
    tot = 0; first = min(r[1] for r in rows); last = max(r[1] for r in rows)
    for d, ts in sorted(dec.items()):
        t00 = (datetime.date(d, 1, 1) - J2000).days - 0.5; b = bytearray()
        ts.sort(key=lambda t: t[0][1])
        for t in ts:
            # a track that keeps to a place; longitudes unwrapped about the first
            lon0 = t[0][3]; lat0 = t[0][2]; mx = max(t, key=lambda r: r[4])
            obs = []; prev = t[0][1]
            for r in t:
                dl = (r[3] - lon0 + 180) % 360 - 180
                obs.append((min(255, round((r[1] - prev) * 10)), max(-127, min(127, round((r[2] - lat0) * 10))), max(-127, min(127, round(dl * 5))), min(255, round(28 * math.log(r[4] + 1)))))
                prev += round((r[1] - prev) * 10) / 10
            b += struct.pack('<HBBhH', round((t[0][1] - t00) * 10), len(obs), mx[5], round(lat0 * 10), round((lon0 % 360) * 10))
            for o in obs: b += struct.pack('<Bbbb', o[0], o[1], o[2], 0)[:3] + struct.pack('<B', o[3])
        open(f'{OUT}/g{d}.bin', 'wb').write(b); tot += len(b)
    print('bytes', tot)
    # ---- numbers
    mon = []
    for l in open(RAW + '/SN_m_tot_V2.0.txt'):
        f = l.split(); mon.append(round(float(f[3]), 1))
    yr = [round(float(l.split()[1]), 1) for l in open(RAW + '/SN_y_tot_V2.0.txt')]
    gn = [round(float(l.split()[1]), 2) for l in open(RAW + '/GNbb2_y.txt')]
    n0 = 1749 * 12 + len(mon)                                   # first month not in SILSO's table
    fc = {}
    for l in open(RAW + '/KFprediML.txt'):
        f = l.replace(':', ' ').split()
        if len(f) >= 4 and f[0].isdigit(): fc[int(f[0]) * 12 + int(f[1]) - 1] = float(f[3])
    for p in json.load(open(RAW + '/pred.json')):
        y, m = map(int, p['time-tag'].split('-')); k = y * 12 + m - 1
        if k not in fc: fc[k] = p['predicted_ssn']
    pred = []; k = n0
    while k in fc: pred.append(round(fc[k], 1)); k += 1
    # smoothed (13 month) minima and maxima for the cycle table
    m = np.array(mon); w = np.array([.5] + [1] * 11 + [.5]) / 12; sm = np.convolve(m, w, 'same')
    json.dump(dict(monthly0=1749, monthly=mon, predicted=pred, yearly0=1700, yearly=yr, group0=1610, group=gn, first=round(first, 2), last=round(last, 2), missing=sorted(int((datetime.date(*x) - J2000).days) for x in missing), ), open(OUT + '/numbers.json', 'w'), separators=(',', ':'))
    # ---- butterfly picture: area per Carrington rotation and 50 strips of equal width in sine latitude (recorded groups; USAF/NOAA areas x 1.4 as Hathaway does)
    T0 = (datetime.date(1874, 5, 1) - J2000).days; nrot = int((last - T0) / 27.2753) + 1; H = np.zeros((50, nrot)); days = {}
    for r in rows:
        x = int((r[1] - T0) / 27.2753); s = int((math.sin(math.radians(r[2])) + 1) * 25)
        if 0 <= x < nrot: H[min(49, s), x] += r[4] * (1.4 if r[7] >= 1977 else 1)
    H /= 27.2753; strip = H / (2 * math.pi * 1e6 * 0 + 1) ; frac = H / 1e6 * 25                     # fraction of the strip (visible half) covered
    img = np.clip(np.sqrt(frac / 0.01) * 255, 0, 255).astype(np.uint8)[::-1]
    from PIL import Image
    Image.fromarray(img).save(OUT + '/butterfly.png', optimize=True); print('butterfly', img.shape, os.path.getsize(OUT + '/butterfly.png'), 'rotations from', T0)
