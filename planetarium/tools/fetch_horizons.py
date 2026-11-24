#!/usr/bin/env python3
"""JPL Horizons downloads for the moons and small bodies (cached as text). Usage: fetch_horizons.py RAW_DIR     (about 60 polite requests)"""
import sys, os, subprocess, urllib.parse, time
RAW = sys.argv[1]; os.makedirs(RAW, exist_ok=True)
def get(name, **kw):
    f = f'{RAW}/{name}.txt'
    if os.path.exists(f) and '$$SOE' in open(f).read(): return open(f).read()
    p = {'format': 'text', 'OBJ_DATA': 'NO', 'MAKE_EPHEM': 'YES', 'CSV_FORMAT': 'YES', 'REF_PLANE': 'FRAME', 'REF_SYSTEM': 'ICRF', 'TIME_TYPE': 'TDB'}
    p.update(kw); q = '&'.join(k + '=' + urllib.parse.quote(("'" + v + "'") if k not in ('format',) else v) for k, v in p.items())
    t = subprocess.run(['/usr/bin/curl', '-s', '-m', '180', 'https://ssd.jpl.nasa.gov/api/horizons.api?' + q], capture_output=True, text=True).stdout
    open(f, 'w').write(t); time.sleep(0.6)
    print(name, 'ok' if '$$SOE' in t else 'FAILED ' + t[-300:].replace('\n', ' '), flush=True); return t
MOONS = {'Phobos': ('401', '499', .319), 'Deimos': ('402', '499', 1.262), 'Amalthea': ('505', '599', .498), 'Mimas': ('601', '699', .942), 'Enceladus': ('602', '699', 1.37), 'Tethys': ('603', '699', 1.888),
  'Dione': ('604', '699', 2.737), 'Rhea': ('605', '699', 4.518), 'Titan': ('606', '699', 15.945), 'Hyperion': ('607', '699', 21.277), 'Iapetus': ('608', '699', 79.33), 'Phoebe': ('609', '699', 550.5),
  'Ariel': ('701', '799', 2.52), 'Umbriel': ('702', '799', 4.144), 'Titania': ('703', '799', 8.706), 'Oberon': ('704', '799', 13.463), 'Miranda': ('705', '799', 1.413), 'Triton': ('801', '899', 5.877),
  'Proteus': ('808', '899', 1.122), 'Charon': ('901', '999', 6.387)}
if __name__ == '__main__':
    for m, (c, p, P) in MOONS.items():
        V = dict(COMMAND=c, CENTER='500@' + p, EPHEM_TYPE='VECTORS', VEC_TABLE='1', OUT_UNITS='KM-S')
        # 30 orbits, 25 points each, from 2026; then 1950-2100 in 1600 steps (irregular against every period)
        mins = max(1, round(P * 1440 / 25))
        import datetime
        stop = datetime.date(2026, 1, 1) + datetime.timedelta(days=int(30 * P) + 2)
        get(f'{m}_dense', START_TIME='2026-01-01', STOP_TIME=str(stop), STEP_SIZE=f'{mins} m', **V)
        if m not in ('Phobos', 'Deimos', 'Amalthea', 'Triton', 'Charon', 'Proteus', 'Phoebe'):
            for y in (1956, 1978, 2004, 2052, 2085):
                get(f'{m}_d{y}', START_TIME=f'{y}-01-01', STOP_TIME=str(datetime.date(y, 1, 1) + datetime.timedelta(days=int(30 * P) + 2)), STEP_SIZE=f'{mins * 2} m', **V)
        a, z = ('1950-01-02', '2099-12-30')
        get(f'{m}_long', START_TIME=a, STOP_TIME=z, STEP_SIZE='1787', **V)
    get('Phoebe_elem', COMMAND='609', CENTER='500@699', EPHEM_TYPE='ELEMENTS', OUT_UNITS='AU-D', START_TIME='1949-06-01', STOP_TIME='2100-06-01', STEP_SIZE='30 d')
    for n, c, ctr, step in [('Ceres', '1;', '10', 50), ('Pallas', '2;', '10', 50), ('Juno', '3;', '10', 50), ('Vesta', '4;', '10', 50), ('Hygiea', '10;', '10', 50), ('Eris', '136199;', '0', 1000), ('Haumea', '136108;', '0', 1000),
        ('Makemake', '136472;', '0', 1000), ('Gonggong', '225088;', '0', 1000), ('Quaoar', '50000;', '0', 1000), ('Sedna', '90377;', '0', 1000), ('Orcus', '90482;', '0', 1000), ('Halley', '90000030', '10', 50)]:
        get(f'{n}_elem' if step > 100 else f'{n}_el50', COMMAND=c, CENTER='500@' + ctr, EPHEM_TYPE='ELEMENTS', OUT_UNITS='AU-D', START_TIME='1899-06-01' if step > 100 else '1949-06-01', STOP_TIME='2101-06-01', STEP_SIZE=f'{step} d')
        get(f'{n}_test', COMMAND=c, CENTER='500@10', EPHEM_TYPE='VECTORS', VEC_TABLE='1', OUT_UNITS='AU-D', START_TIME='1901-01-07', STOP_TIME='2099-12-20', STEP_SIZE='311')
