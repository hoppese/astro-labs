"""build_earth.py: Natural Earth 1:50m land polygons -> data/earth-land.json (for the square-on Earth view, js/labs/squareon.js).

Source: ne_50m_land.geojson from https://github.com/nvkelso/natural-earth-vector (geojson/), public domain.
Usage: python3 tools/build_earth.py path/to/ne_50m_land.geojson
Output: {"q": 50, "rings": [[lon0, lat0, dlon1, dlat1, ...], ...]}: the first point of a ring, then differences from the
previous point, all integers in units of 1/q degree (0.02 deg, about 2 km); consecutive repeats after rounding are dropped, rings shorter than 4 points are dropped.
"""
import json, sys, os

Q = 50
src = json.load(open(sys.argv[1]))
rings = []
for f in src['features']:
    g = f['geometry']
    polys = g['coordinates'] if g['type'] == 'MultiPolygon' else [g['coordinates']]
    for poly in polys:
        for ring in poly:                       # outer ring and holes (lakes are not in this file; holes are rare)
            out, last = [], None
            for lon, lat in ring:
                p = (round(lon * Q), round(lat * Q))
                if p != last: out.extend(p if last is None else (p[0] - last[0], p[1] - last[1])); last = p
            if len(out) >= 8: rings.append(out)
dst = os.path.join(os.path.dirname(__file__), '..', 'data', 'earth-land.json')
with open(dst, 'w') as fh: json.dump({'q': Q, 'rings': rings}, fh, separators=(',', ':'))
print(len(rings), 'rings', sum(len(r) for r in rings) // 2, 'points', os.path.getsize(dst), 'bytes')
