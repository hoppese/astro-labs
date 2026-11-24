#!/usr/bin/env python3
"""JPL Horizons observer quantities used by check-bodies.mjs, from the geocentre: 1 astrometric RA/Dec, 14 sub-observer, 15 sub-solar lon/lat, 17 north-pole PA,
9 magnitude. Usage: fetch_orient_truth.py RAW ../tools/orient-truth.json"""
import sys, json, os, subprocess, urllib.parse
from fetch_horizons import get, RAW
B = {'Sun': '10', 'Moon': '301', 'Mercury': '199', 'Venus': '299', 'Mars': '499', 'Phobos': '401', 'Deimos': '402', 'Jupiter': '599', 'Io': '501', 'Europa': '502', 'Ganymede': '503', 'Callisto': '504', 'Saturn': '699', 'Mimas': '601',
  'Enceladus': '602', 'Tethys': '603', 'Dione': '604', 'Rhea': '605', 'Titan': '606', 'Hyperion': '607', 'Iapetus': '608', 'Phoebe': '609', 'Uranus': '799', 'Ariel': '701', 'Umbriel': '702', 'Titania': '703', 'Oberon': '704', 'Miranda': '705',
  'Neptune': '899', 'Triton': '801', 'Proteus': '808', 'Pluto': '999', 'Charon': '901', 'Ceres': '1;', 'Pallas': '2;', 'Juno': '3;', 'Vesta': '4;', 'Hygiea': '10;', 'Eris': '136199;', 'Haumea': '136108;', 'Makemake': '136472;', 'Gonggong': '225088;',
  'Quaoar': '50000;', 'Sedna': '90377;', 'Orcus': '90482;', 'Halley': '90000030', 'Amalthea': '505'}
DATES = ["2000-06-15 00:00", "2015-03-10 06:00", "2026-11-24 10:00", "2031-08-02 18:30"]
out = {}
for n, c in B.items():
    rowsv = []
    for k, d in enumerate(DATES):
        t = get(f'ot_{n}_{k}', COMMAND=c, CENTER='500@399', EPHEM_TYPE='OBSERVER', QUANTITIES='1,9,14,15,17', ANG_FORMAT='DEG', EXTRA_PREC='YES', START_TIME=d, STOP_TIME=d[:-2] + '59' if not d.endswith('59') else d, STEP_SIZE='1 h', TIME_TYPE='UT')
        if '$$SOE' not in t: rowsv.append(None); continue
        h = [x.strip() for x in t[:t.index('$$SOE')].strip().splitlines()[-2].split(',')]; r = [x.strip() for x in t[t.index('$$SOE') + 5:].strip().splitlines()[0].split(',')]
        f = lambda key: next((float(r[i]) for i, x in enumerate(h) if x.startswith(key) and r[i] not in ('n.a.', '')), None)
        rowsv.append(dict(ra=f('R.A.'), dec=f('DEC'), mag=f('APmag') if f('APmag') is not None else f('T-mag'), lon=f('ObsSub-LON'), lat=f('ObsSub-LAT'), slon=f('SunSub-LON'), slat=f('SunSub-LAT'), pa=f('NP.ang')))
    out[n] = rowsv
json.dump(dict(dates=DATES, bodies=out), open(sys.argv[2], 'w'), separators=(',', ':'))
