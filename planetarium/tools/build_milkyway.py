#!/usr/bin/env python3
"""Bake d3-celestial's Milky Way outlines (mw.json, BSD-3-Clause, Olaf Frohn) into a small brightness map.

usage: python3 -I build_milkyway.py <raw/d3c> <planetarium/data>

mw.json holds five nested sets of outline polygons (ol1 = faintest and widest ... ol5 = brightest
cores) in J2000 RA/Dec. They are isophote outlines, not photometry, so the map made here is a
picture of where the Milky Way is and roughly how bright, nothing more.

Steps: rotate every vertex to galactic coordinates (the band then runs along b = 0 and never wraps
over a pole), fill each level by even-odd parity along vertical rays from the south galactic pole
(which also handles the two outlines that run all the way round the sky), add the five levels
(each adds one step of brightness), soften with a small blur, and write
  milkyway.bin   W x H bytes, row 0 = southernmost latitude, column 0 = galactic longitude 0
  milkyway.json  {w, h, bMin, bMax, source, licence}
"""
import json, math, os, sys

W_DEG = 0.5            # degrees per output pixel
SS = 3                 # supersampling per axis
B_LIM = 30.0           # galactic latitude range kept: -B_LIM .. +B_LIM (checked below)
# J2000 equatorial -> galactic (IAU 1958 system, Hipparcos Vol. 1 eq. 1.5.11)
G = ((-0.0548755604, -0.8734370902, -0.4838350155),
     (0.4941094279, -0.4448296300, 0.7469822445),
     (-0.8676661490, -0.1980763734, 0.4559837762))

def to_gal(lon, lat):
    a, d = math.radians(lon), math.radians(lat)
    v = (math.cos(d) * math.cos(a), math.cos(d) * math.sin(a), math.sin(d))
    g = [sum(G[i][k] * v[k] for k in range(3)) for i in range(3)]
    return math.degrees(math.atan2(g[1], g[0])) % 360.0, math.degrees(math.asin(max(-1.0, min(1.0, g[2]))))

def main(src, out):
    mw = json.load(open(os.path.join(src, 'mw.json')))
    W, H = int(round(360 / W_DEG)), int(round(2 * B_LIM / W_DEG))
    w, h = W * SS, H * SS
    acc = [[0.0] * W for _ in range(H)]
    bmin, bmax = 90.0, -90.0
    for feat in mw['features']:
        cols = [[] for _ in range(w)]                       # y-crossings of each vertical ray
        nring = 0
        for poly in feat['geometry']['coordinates']:
            for ring in poly:
                pts = [to_gal(p[0], p[1]) for p in ring]
                if pts[0] != pts[-1]: pts.append(pts[0])
                # unwrap longitude so the ring is continuous
                ux = [pts[0][0]]
                for i in range(1, len(pts)):
                    d = (pts[i][0] - pts[i - 1][0] + 180.0) % 360.0 - 180.0
                    ux.append(ux[-1] + d)
                for p in pts: bmin, bmax = min(bmin, p[1]), max(bmax, p[1])
                nring += 1
                for i in range(len(pts) - 1):
                    x0, y0, x1, y1 = ux[i], pts[i][1], ux[i + 1], pts[i + 1][1]
                    if x0 == x1: continue
                    if x0 > x1: x0, y0, x1, y1 = x1, y1, x0, y0
                    # sample columns whose centre lies in [x0, x1)
                    c0 = math.ceil(x0 / 360.0 * w - 0.5); c1 = math.ceil(x1 / 360.0 * w - 0.5)
                    for c in range(c0, c1):
                        xc = (c + 0.5) * 360.0 / w
                        cols[c % w].append(y0 + (y1 - y0) * (xc - x0) / (x1 - x0))
        cover = [[0] * w for _ in range(h)]
        for c in range(w):
            ys = sorted(cols[c])
            # parity from the south pole upward; an odd count means the last span runs to the north pole
            for k in range(0, len(ys) - 1, 2):
                r0 = max(0, math.ceil((ys[k] + B_LIM) / (2 * B_LIM) * h - 0.5))
                r1 = min(h, math.ceil((ys[k + 1] + B_LIM) / (2 * B_LIM) * h - 0.5))
                for r in range(r0, r1): cover[r][c] = 1
            if len(ys) % 2: raise SystemExit('odd crossing count in ' + feat['id'])
        area = 0
        for r in range(H):
            for c in range(W):
                s = 0
                for dr in range(SS):
                    row = cover[r * SS + dr]
                    for dc in range(SS): s += row[c * SS + dc]
                acc[r][c] += s / (SS * SS)
                area += s / (SS * SS) * math.cos(math.radians(-B_LIM + (r + 0.5) * W_DEG))
        print(feat['id'], 'rings', nring, 'area %.0f sq deg' % (area * W_DEG * W_DEG))
    print('latitude range of the outlines: %.1f .. %.1f' % (bmin, bmax))
    if bmin < -B_LIM or bmax > B_LIM: raise SystemExit('B_LIM too small')
    # blur: two passes of a 3x3 binomial kernel (wraps in longitude), about 0.7 deg
    for _ in range(2):
        nxt = [[0.0] * W for _ in range(H)]
        for r in range(H):
            ra, rb, rc = acc[max(r - 1, 0)], acc[r], acc[min(r + 1, H - 1)]
            for c in range(W):
                l, m = (c - 1) % W, (c + 1) % W
                nxt[r][c] = (ra[l] + 2 * ra[c] + ra[m] + 2 * rb[l] + 4 * rb[c] + 2 * rb[m] + rc[l] + 2 * rc[c] + rc[m]) / 16.0
        acc = nxt
    data = bytes(min(255, int(round(v / 5.0 * 255))) for row in acc for v in row)
    open(os.path.join(out, 'milkyway.bin'), 'wb').write(data)
    json.dump(dict(w=W, h=H, bMin=-B_LIM, bMax=B_LIM, levels=5,
                   source='d3-celestial data/mw.json (Olaf Frohn), outlines baked to a brightness map in galactic coordinates',
                   licence='BSD-3-Clause'), open(os.path.join(out, 'milkyway.json'), 'w'), separators=(',', ':'))
    print('milkyway.bin', len(data), 'bytes', W, 'x', H)

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
