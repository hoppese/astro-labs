#!/usr/bin/env python3
"""Convert OpenNGC (Mattia Verga, CC BY-SA 4.0) into compact deep-sky JSON files.

usage: python3 -I build_dso.py <raw/ongc> <planetarium/data>

Every number written comes straight from OpenNGC's columns; a missing value stays missing (null).
Nothing is estimated or filled in.

  dso.json       the "showpiece" set loaded at start: all Messier and Caldwell objects, every object
                 with a common name, and everything with V (or B) magnitude <= 10.5
  dso-deep.json  loaded on demand: remaining objects with magnitude <= 12.5, plus every galaxy
                 that has a catalogued redshift and magnitude <= 14 (for the Hubble's-law lab)

Row format (arrays, see "fields" in the file):
  id, type, ra(deg J2000), dec(deg), con, maj(arcmin), min(arcmin), pa(deg), bmag, vmag, sb,
  hubble, rv(km/s), z, m, c, names
The Caldwell numbers are not in OpenNGC; the cross-reference below is Patrick Moore's published list
(checked against the Wikipedia "Caldwell catalogue" table). C37 = NGC 6885 and C50 = NGC 2244 are
listed by OpenNGC as duplicates of NGC 6882 and NGC 2239, so they map to those rows. OpenNGC assigns
no object to M102, so it is absent.
"""
import csv, json, sys, os

CALDWELL = {1:'NGC188',2:'NGC40',3:'NGC4236',4:'NGC7023',5:'IC342',6:'NGC6543',7:'NGC2403',8:'NGC559',
 9:'C009',10:'NGC663',11:'NGC7635',12:'NGC6946',13:'NGC457',14:'C014',15:'NGC6826',16:'NGC7243',
 17:'NGC147',18:'NGC185',19:'IC5146',20:'NGC7000',21:'NGC4449',22:'NGC7662',23:'NGC891',24:'NGC1275',
 25:'NGC2419',26:'NGC4244',27:'NGC6888',28:'NGC752',29:'NGC5005',30:'NGC7331',31:'IC405',32:'NGC4631',
 33:'NGC6992',34:'NGC6960',35:'NGC4889',36:'NGC4559',37:'NGC6882',38:'NGC4565',39:'NGC2392',
 40:'NGC3626',41:'C041',42:'NGC7006',43:'NGC7814',44:'NGC7479',45:'NGC5248',46:'NGC2261',47:'NGC6934',
 48:'NGC2775',49:'NGC2237',50:'NGC2239',51:'IC1613',52:'NGC4697',53:'NGC3115',54:'NGC2506',
 55:'NGC7009',56:'NGC246',57:'NGC6822',58:'NGC2360',59:'NGC3242',60:'NGC4038',61:'NGC4039',
 62:'NGC247',63:'NGC7293',64:'NGC2362',65:'NGC253',66:'NGC5694',67:'NGC1097',68:'NGC6729',
 69:'NGC6302',70:'NGC300',71:'NGC2477',72:'NGC55',73:'NGC1851',74:'NGC3132',75:'NGC6124',
 76:'NGC6231',77:'NGC5128',78:'NGC6541',79:'NGC3201',80:'NGC5139',81:'NGC6352',82:'NGC6193',
 83:'NGC4945',84:'NGC5286',85:'IC2391',86:'NGC6397',87:'NGC1261',88:'NGC5823',89:'NGC6087',
 90:'NGC2867',91:'NGC3532',92:'NGC3372',93:'NGC6752',94:'NGC4755',95:'NGC6025',96:'NGC2516',
 97:'NGC3766',98:'NGC4609',99:'C099',100:'IC2944',101:'NGC6744',102:'IC2602',103:'NGC2070',
 104:'NGC362',105:'NGC4833',106:'NGC104',107:'NGC6101',108:'NGC4372',109:'NGC3195'}
FIELDS = ['id','type','ra','dec','con','maj','min','pa','bmag','vmag','sb','hubble','rv','z','m','c','names']
GAL = ('G', 'GPair', 'GTrpl', 'GGroup')

def norm(name):
    """'NGC0224' -> 'NGC224', 'IC0342' -> 'IC342', 'NGC 4038 NED01' untouched otherwise."""
    for p in ('NGC', 'IC'):
        if name.startswith(p) and name[len(p):len(p)+4].isdigit():
            return p + str(int(name[len(p):len(p)+4])) + name[len(p)+4:]
    return name

def pretty(name):
    for p in ('NGC', 'IC'):
        if name.startswith(p) and name[len(p):len(p)+1].isdigit(): return p + ' ' + name[len(p):]
    return name

def f(s, nd=None):
    if s is None or s == '': return None
    v = float(s)
    return round(v, nd) if nd is not None else v

def hms(s):
    h, m, sec = s.split(':'); return round((int(h) + int(m)/60 + float(sec)/3600) * 15, 4)
def dms(s):
    sign = -1 if s[0] == '-' else 1
    d, m, sec = s.lstrip('+-').split(':'); return round(sign * (int(d) + int(m)/60 + float(sec)/3600), 4)

def main(src, out):
    cald = {v: k for k, v in CALDWELL.items()}
    main_set, deep = [], []
    seen_m = set()
    for fn in ('NGC.csv', 'addendum.csv'):
        for r in csv.DictReader(open(os.path.join(src, fn), newline='', encoding='utf-8'), delimiter=';'):
            if r['Type'] in ('Dup', 'NonEx', '*', '**', 'Nova') and not r['M']: continue
            if not r['RA'] or not r['Dec']: continue
            key = norm(r['Name'])
            m = int(r['M']) if r['M'] else None
            if m in seen_m: m = None          # e.g. M102 listed twice
            if m: seen_m.add(m)
            c = cald.get(key)
            vm, bm = f(r['V-Mag'], 2), f(r['B-Mag'], 2)
            mag = vm if vm is not None else bm
            names = [n.strip() for n in r['Common names'].split(',') if n.strip()]
            row = [pretty(key), r['Type'], hms(r['RA']), dms(r['Dec']), r['Const'], f(r['MajAx'], 2), f(r['MinAx'], 2),
                   f(r['PosAng'], 0), bm, vm, f(r['SurfBr'], 2), r['Hubble'] or None, f(r['RadVel'], 0),
                   f(r['Redshift'], 6), m, c, names or None]
            if m or c or names or (mag is not None and mag <= 10.5):
                main_set.append(row)
            elif mag is not None and (mag <= 12.5 or (r['Type'] in GAL and r['Redshift'] and mag <= 14)):
                deep.append(row)
    def key(r):
        mag = r[9] if r[9] is not None else r[8]
        return mag if mag is not None else 99
    for name, rows in (('dso.json', main_set), ('dso-deep.json', deep)):
        rows.sort(key=key)
        p = os.path.join(out, name)
        json.dump(dict(fields=FIELDS, source='OpenNGC (CC BY-SA 4.0)', rows=rows), open(p, 'w'),
                  ensure_ascii=False, separators=(',', ':'))
        print(name, len(rows), os.path.getsize(p), 'bytes')
    print('Messier', len(seen_m), 'missing', sorted(set(range(1, 111)) - seen_m))
    got_c = {r[15] for r in main_set if r[15]}
    print('Caldwell', len(got_c), 'missing', sorted(set(range(1, 110)) - got_c))
    print('with z in main', sum(1 for r in main_set if r[13] is not None), 'deep', sum(1 for r in deep if r[13] is not None))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
