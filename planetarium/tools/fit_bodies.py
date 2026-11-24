#!/usr/bin/env python3
"""Horizons downloads (fetch_horizons.py) -> js/moon-data.js (orbits fitted 1950-2100) and data/smallbodies.json (osculating elements, interpolated).
Usage: fit_bodies.py RAW_HORIZONS small all   Prints each body's error against Horizons."""
import sys, os, json, math, re
import numpy as np
from scipy.optimize import least_squares
from fetch_horizons import MOONS
RAW = sys.argv[1]; HERE = os.path.dirname(os.path.abspath(__file__)); T0 = 2461041.5 - 2451545.0     # 2026-01-01 TDB, days from J2000
def rows(f):
    t = open(f'{RAW}/{f}.txt').read(); t = t[t.index('$$SOE') + 5:t.index('$$EOE')]
    return [l.split(',') for l in t.strip().splitlines()]
def vecs(f):
    r = rows(f); return np.array([float(x[0]) - 2451545.0 for x in r]), np.array([[float(v) for v in x[2:5]] for x in r])
def unit(v): return v / np.linalg.norm(v)
def basis(z):
    x = unit(np.cross([0, 0, 1.0], z)); return np.array([x, np.cross(z, x), z])
def model(p, t, per):
    """p: pole ra, dec (rad), a, i, Om0, dOm, e, pi0, dpi, L0, n, q (quadratic), then (A, B) pairs for the periods in `per` on the mean longitude, then the same on ecc. none."""
    ra, de, a, inc, O0, dO, e, w0, dw, L0, n, q = p[:12]; dt = t - T0
    B = basis(np.array([math.cos(de) * math.cos(ra), math.cos(de) * math.sin(ra), math.sin(de)]))
    L = L0 + n * dt + q * (dt / 36525) ** 2
    for k, f in enumerate(per): L = L + p[12 + 2 * k] * np.sin(f * dt) + p[13 + 2 * k] * np.cos(f * dt)
    Om = O0 + dO * dt; pi = w0 + dw * dt; M = L - pi; E = M.copy()
    for _ in range(8): E = M + e * np.sin(E)
    x = a * (np.cos(E) - e); y = a * math.sqrt(1 - e * e) * np.sin(E); nu = np.arctan2(y, x); r = np.hypot(x, y); u = nu + pi - Om
    cu, su, cO, sO, ci, si = np.cos(u), np.sin(u), np.cos(Om), np.sin(Om), math.cos(inc), math.sin(inc)
    X = np.stack([r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si], 1)
    return X @ B
OUTM = {}
PER = {}
def fit(m):
    P = MOONS[m][2]
    if m == 'Phoebe': return
    td, vd = vecs(m + '_dense'); tl, vl = vecs(m + '_long')
    extra = [vecs(f'{m}_d{y}') for y in (1956, 1978, 2004, 2052, 2085) if os.path.exists(f'{RAW}/{m}_d{y}.txt')]
    ta = np.concatenate([tl, td] + [x[0] for x in extra]); va = np.concatenate([vl, vd] + [x[1] for x in extra])
    # start: pole of the dense orbit, mean radius, mean motion by unwrapping
    z = unit(np.cross(vd[:-1], vd[1:]).sum(0)); B = basis(z); q = vd @ B.T; lam = np.unwrap(np.arctan2(q[:, 1], q[:, 0])); n0 = np.polyfit(td - T0, lam, 1); a0 = np.linalg.norm(vd, axis=1).mean()
    rr = np.linalg.norm(vd, axis=1); e0 = max((rr.max() - rr.min()) / (rr.max() + rr.min()), 1e-4); tp = td[rr.argmin()]; w = np.polyval(n0, tp - T0)
    ra, de = math.atan2(z[1], z[0]), math.asin(z[2])
    p = np.array([ra, de, a0, 0.003, 0.1, 0.0, e0, w, 0.0, n0[1], n0[0], 0.0]); sc = a0
    full = lambda p, t, v, per: ((model(p, t, per) - v) / sc).ravel()
    def go(p, t, v, per, free):
        f = lambda x: full(np.concatenate([np.where(free[:12], 0, p[:12]) + 0, p[12:]]) * 0 + put(p, x, free), t, v, per)
        s = least_squares(lambda x: full(put(p, x, free), t, v, per), p[free], x_scale=np.maximum(np.abs(p[free]), 1e-3) * 0.01, max_nfev=400); return put(p, s.x, free)
    def put(p, x, free): o = p.copy(); o[free] = x; return o
    free = np.zeros(12, bool); free[[2, 6, 7, 9, 10]] = True; p = go(p, td, vd, [], free); free[[0, 1]] = True; p = go(p, td, vd, [], free)
    # widen the span step by step, refining the mean motion before anything can wrap; try several node/apse rates
    best = None
    J2rate = {'499': 1, '599': 1, '699': 1, '799': 1, '899': 1, '999': 0}[MOONS[m][1]]
    cands = []
    R = {'499': (3396, 1.96e-3), '599': (71492, 1.47e-2), '699': (60330, 1.63e-2), '799': (25559, 3.51e-3), '899': (24764, 3.41e-3), '999': (1188, 0)}[MOONS[m][1]]
    g = 1.5 * R[1] * (R[0] / a0) ** 2 * abs(n0[0])
    for k in ((1, 1.2, 0.8) if g else (0,)): cands.append(g * k)
    retro = -1 if False else 1
    for c in cands:
        for inc0, O in ((0.0005, 0.0), (0.01, 1.5), (0.06, 3.0), (0.06, 5.0)):
            q0 = p.copy(); q0[3] = inc0; q0[4] = O; q0[5] = -c; q0[8] = c if c else 1e-9
            try:
                for span in (4, 15, 40, 80):
                    s = np.abs(tl - T0) < span * 365.25; t = np.concatenate([td[::3], tl[s]]); v = np.concatenate([vd[::3], vl[s]])
                    fr = np.ones(12, bool); fr[11] = span >= 40; q0 = go(q0, t, v, [], fr)
                err = np.sqrt((full(q0, tl, vl, []) ** 2).mean())
                if best is None or err < best[0]: best = (err, q0)
            except Exception as ex: pass
        if best and best[0] < 2e-4: break
    p = best[1]; per = []
    if m == 'Mimas':
        # 43.6 deg libration (70.6 years): put it in before anything else
        f = 2 * math.pi / 70.56 / 365.25; bb = None
        for ph in np.arange(0, 2 * math.pi, 0.3):
            q1 = np.concatenate([p, [0.76 * math.cos(ph), 0.76 * math.sin(ph)]]); q1[10] = 2 * math.pi / 0.942421952; 
            fr = np.ones(14, bool); fr[[10, 11]] = False
            s1 = least_squares(lambda x: full(x, tl, vl, [f]), q1, x_scale=np.maximum(np.abs(q1), 1e-3) * 0.01, max_nfev=60)
            if bb is None or s1.cost < bb.cost: bb = s1
        p, per = bb.x, [f]
    # periodic terms in longitude: strongest line of the residual, refit, repeat
    seeds = {'Mimas': 70.56, 'Tethys': 70.56, 'Enceladus': 11.1, 'Dione': 11.1, 'Hyperion': 640.0 / 365.25}
    for k in range(12):
        B = basis(np.array([math.cos(p[1]) * math.cos(p[0]), math.cos(p[1]) * math.sin(p[0]), math.sin(p[1])]))
        a, b = model(p, ta, per) @ B.T, va @ B.T
        dl = (np.arctan2(b[:, 1], b[:, 0]) - np.arctan2(a[:, 1], a[:, 0]) + math.pi) % (2 * math.pi) - math.pi
        if dl.std() < 6e-5 or k == 12: break
        fs = np.concatenate([2 * math.pi / np.linspace(60, 300, 120) / 365.25, 2 * math.pi / np.exp(np.linspace(math.log(0.15), math.log(60), 9000)) / 365.25]); pw = np.abs(np.exp(-1j * np.outer(fs, ta - T0)) @ (dl - dl.mean()))
        f = fs[pw.argmax()]
        if k == 0 and m in seeds: f = 2 * math.pi / seeds[m] / 365.25; pw = np.abs(np.exp(-1j * f * (ta - T0)) @ (dl - dl.mean()))[None]
        per2 = per + [f]; p2 = np.concatenate([p, [0, 0]]); amp = 2 * pw.max() / len(dl); ph = np.angle((np.exp(-1j * f * (ta - T0)) * (dl - dl.mean())).sum())
        p2[-2], p2[-1] = -amp * math.sin(ph), amp * math.cos(ph)
        nb = len(per2)
        def F(x): return full(x[:12 + 2 * nb], ta, va, list(x[12 + 2 * nb:]))
        x0 = np.concatenate([p2, per2]); xs = np.concatenate([np.maximum(np.abs(p2), 1e-3) * 0.01, np.full(nb, 1e-6)])
        s = least_squares(F, x0, x_scale=xs, max_nfev=200)
        if (s.fun ** 2).mean() < (full(p, ta, va, per) ** 2).mean() * 0.97: p, per = s.x[:12 + 2 * nb], list(s.x[12 + 2 * nb:])
        else: break
    d = np.linalg.norm(model(p, tl, per) - vl, axis=1); dd = np.linalg.norm(model(p, td, per) - vd, axis=1)
    OUTM[m] = dict(p=[float(f'{x:.12g}') for x in p[:12]], h=[[float(f'{per[k]:.10g}'), float(f'{p[12+2*k]:.7g}'), float(f'{p[13+2*k]:.7g}')] for k in range(len(per))], rms=round(float(np.sqrt((d**2).mean()))), max=round(float(d.max())), now=round(float(dd.max())))
    DK = {'499': .6, '599': 4.3, '699': 8.6, '799': 18.5, '899': 29, '999': 33}[MOONS[m][1]] * 1.496e8
    print(f'{m:10s} a {p[2]:10.0f} km  terms {len(per)}  error 1950-2100: rms {OUTM[m]["rms"]:6d} max {OUTM[m]["max"]:6d} km = {OUTM[m]["max"]/DK*206265:.2f} arcsec at its closest ({d.max()/p[2]*57.3:.2f} deg of orbit); 2026: max {OUTM[m]["now"]} km', flush=True)
def small():
    out = {}; k = 0.01720209895
    for f in sorted(os.listdir(RAW)):
        if not f.endswith('_elem.txt'): continue
        n = f[:-9]; src = n + ('_el50' if os.path.exists(f'{RAW}/{n}_el50.txt') else '_elem'); r = rows(src); t = np.array([float(x[0]) - 2451545.0 for x in r])
        # EC, QR, IN, OM, W, Tp, N, MA, TA, A, AD, PR
        E = np.array([[float(v) for v in x[2:13]] for x in r]); ec, inc, Om, w, N, MA, A = E[:, 0], *(np.radians(E[:, j]) for j in (2, 3, 4)), np.radians(E[:, 6]), np.radians(E[:, 7]), E[:, 9]
        out[n] = dict(c='Saturn' if n == 'Phoebe' else 'sun' if '(10)' in open(f'{RAW}/{src}.txt').read().split('Center body name')[1][:60] else 'bary', t0=float(t[0]), dt=float(t[1] - t[0]))
        lam = np.unwrap(Om + w + MA); nn = np.polyfit(t - t[0], lam, 1)
        # unwrap safely with the mean motion
        base = Om + w + MA; pred = np.concatenate([[base[0]], base[0] + np.cumsum((N[:-1] + N[1:]) / 2 * np.diff(t))]); lam = base + 2 * np.pi * np.round((pred - base) / (2 * np.pi))
        for j in range(1, len(lam)):
            pr = lam[j - 1] + (N[j - 1] + N[j]) / 2 * (t[j] - t[j - 1]); lam[j] = base[j] + 2 * np.pi * np.round((pr - base[j]) / (2 * np.pi))
        nm = np.polyfit(t - t[0], lam, 1)[0]
        hh, kk, pp, qq = ec * np.sin(w + Om), ec * np.cos(w + Om), np.tan(inc / 2) * np.sin(Om), np.tan(inc / 2) * np.cos(Om)
        out[n]['n'] = float(nm); out[n]['e'] = [[round(float(v), 7) for v in arr] for arr in (A, lam - nm * (t - t[0]), hh, kk, pp, qq)]
    json.dump(out, open(HERE + '/../data/smallbodies.json', 'w'), separators=(',', ':')); print('small bodies', list(out), os.path.getsize(HERE + '/../data/smallbodies.json'), {n: o['c'] for n, o in out.items()})
only = sys.argv[2:]
if 'small' in only: small()
for m in MOONS:
    if m in only or 'all' in only:
        fit(m); json.dump(OUTM.get(m), open(f'{RAW}/fit_{m}.json', 'w'))
if 'write' in only or 'all' in only:
    for m in MOONS:
        if m != 'Phoebe': OUTM[m] = json.load(open(f'{RAW}/fit_{m}.json'))
    open(HERE + '/../js/moon-data.js', 'w').write('// moon-data.js: generated by tools/fit_bodies.py from JPL Horizons, 1950-2100. Precessing ellipses on a fixed pole (EQJ) plus periodic terms in longitude; km, radians, days from T0.\n' +
      f'export const MOON_T0 = {T0};\nexport const MOON_ORBITS = ' + json.dumps({m: dict(parent={'4': 'Mars', '5': 'Jupiter', '6': 'Saturn', '7': 'Uranus', '8': 'Neptune', '9': 'Pluto'}[MOONS[m][0][0]], **o) for m, o in OUTM.items()}, separators=(',', ':')) + ';\n')
