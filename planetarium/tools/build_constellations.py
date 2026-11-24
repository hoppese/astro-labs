#!/usr/bin/env python3
"""Convert d3-celestial (BSD-3-Clause) constellation data into one compact JSON.

usage: python3 -I build_constellations.py <raw/d3c> <planetarium/data>

Output constellations.json: [{id, name, gen, rank, label:[ra,dec], lines:[[ra,dec,ra,dec,...],...],
                              bounds:[[ra,dec,...],...]}]  (degrees, J2000, RA 0..360)
Serpens is kept as d3-celestial has it: one entry "Ser" whose lines/bounds hold both halves.
"""
import json, sys, os

def ra(lon): return round(lon % 360, 3)
def flat(pts): 
    o = []
    for p in pts: o += [ra(p[0]), round(p[1], 3)]
    return o

def main(src, out):
    L = lambda f: json.load(open(os.path.join(src, f), encoding='utf-8'))['features']
    cons = {}
    for f in L('constellations.json'):
        p = f['properties']
        if f['id'] == 'Ser' and 'Ser' in cons: continue   # Serpens Caput + Cauda: keep one entry
        if f['id'] == 'Ser': p = dict(p, name='Serpens')
        cons[f['id']] = dict(id=f['id'], name=p['name'], gen=p['gen'], rank=int(p['rank']),
                             label=[ra(f['geometry']['coordinates'][0]), f['geometry']['coordinates'][1]],
                             lines=[], bounds=[])
    for f in L('constellations.lines.json'):
        g = f['geometry']
        segs = g['coordinates'] if g['type'] == 'MultiLineString' else [g['coordinates']]
        cons[f['id']]['lines'] += [flat(s) for s in segs]
    for f in L('constellations.bounds.json'):
        g = f['geometry']
        polys = g['coordinates'] if g['type'] == 'Polygon' else [r for p in g['coordinates'] for r in p]
        cons[f['id']]['bounds'] += [flat(r) for r in polys]
    lst = sorted(cons.values(), key=lambda c: c['name'])
    json.dump(lst, open(os.path.join(out, 'constellations.json'), 'w'), ensure_ascii=False, separators=(',', ':'))
    for c in lst:
        if not c['lines'] or not c['bounds']: print('warning: incomplete', c['id'], len(c['lines']), len(c['bounds']))
    print(len(lst), 'constellations', os.path.getsize(os.path.join(out, 'constellations.json')), 'bytes')

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
