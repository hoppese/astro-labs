#!/usr/bin/env python3
"""Mimas (70-year libration) and Hyperion (640-day libration, forced eccentricity): their own fits; same output as fit_bodies.py plus terms in e and the apse. Usage: fit_hard.py RAW"""
import sys, os, json, math, numpy as np
from scipy.optimize import least_squares
sys.argv = [sys.argv[0], sys.argv[1]]
import fit_bodies as F
from fit_bodies import vecs, basis, RAW, T0
def model(p, t, nf):
    ra, de, a, inc, O0, dO, e0, w0, dw, L0, n, q = p[:12]; dt = t - T0; B = basis(np.array([math.cos(de) * math.cos(ra), math.cos(de) * math.sin(ra), math.sin(de)]))
    L = L0 + n * dt + q * (dt / 36525) ** 2; e = e0 + 0 * dt; pi = w0 + dw * dt; a = a + 0 * dt
    for k in range(nf):
        f, sL, cL, se, ce, sw, cw, sa, ca = p[12 + 9 * k:21 + 9 * k]; S, C = np.sin(f * dt), np.cos(f * dt); L = L + sL * S + cL * C; e = e + se * S + ce * C; pi = pi + sw * S + cw * C; a = a * (1 + sa * S + ca * C)
    M = L - pi; E = M.copy(); e = np.clip(e, 0, .5)
    for _ in range(10): E = M + e * np.sin(E)
    x, y = a * (np.cos(E) - e), a * np.sqrt(1 - e * e) * np.sin(E); Om = O0 + dO * dt; r = np.hypot(x, y); u = np.arctan2(y, x) + pi - Om
    cu, su, cO, sO, ci, si = np.cos(u), np.sin(u), np.cos(Om), np.sin(Om), math.cos(inc), math.sin(inc)
    return np.stack([r * (cO * cu - sO * su * ci), r * (sO * cu + cO * su * ci), r * su * si], 1) @ B
D = math.pi / 180; Y = 365.25
for m, P, pole, st, seeds in (('Mimas', 0.942421952, (40.589, 83.537), dict(a=185539, i=1.574, dO=-365.07, e=.0196, dw=365.0), [70.56 * Y, 70.56 * Y / 3, 70.56 * Y / 5]),
                       ('Hyperion', 21.276658, (40.589, 83.537), dict(a=1481500, i=.6, dO=-1.9, e=.105, dw=-19.3), [640.1, 18.8 * Y, 1 / (1 / 640.1 - 1 / (18.8 * Y)), 1 / (1 / 640.1 + 1 / (18.8 * Y)), 320.0, 21.2767, 10.6, 31.9, 63.6, 28.3 * Y, 2 * 640])):
    td, vd = vecs(m + '_dense'); tl, vl = vecs(m + '_long'); ex = [vecs(f'{m}_d{y}') for y in (1956, 1978, 2004, 2052, 2085)]
    t = np.concatenate([tl, td[::2]] + [x[0] for x in ex]); v = np.concatenate([vl, vd[::2]] + [x[1] for x in ex]); o = np.argsort(t); t, v = t[o], v[o]
    ra, de = pole[0] * D, pole[1] * D; B = basis(np.array([math.cos(de) * math.cos(ra), math.cos(de) * math.sin(ra), math.sin(de)])); q = v @ B.T; lam = np.arctan2(q[:, 1], q[:, 0]); n = 2 * math.pi / P
    dl = np.unwrap(((lam - n * (t - T0) + math.pi) % (2 * math.pi)) - math.pi) if m == 'Mimas' else np.unwrap(lam - n * (t - T0))
    # linear + the seeds' sines + (for eccentricity) sin/cos of the anomaly with the apse rate
    dt = t - T0; w1 = n - st['dw'] * D / Y
    cols = [np.ones_like(dt), dt / 1e4]; 
    for s in seeds: cols += [np.sin(2 * math.pi / s * dt), np.cos(2 * math.pi / s * dt)]
    cols += [np.sin(w1 * dt), np.cos(w1 * dt)]
    c, *_ = np.linalg.lstsq(np.array(cols).T, dl, rcond=None); res = dl - np.array(cols).T @ c; print(m, 'longitude residual deg', res.std() / D, 'libration deg', np.hypot(c[2], c[3]) / D, 'e', np.hypot(c[-1], c[-2]) / 2)
    # 2e sin(M): M = n dt + L0 - w0 - dw dt -> phase of the apse
    phi = math.atan2(c[-1], c[-2]); L0 = c[0]; w0 = L0 - phi
    best = None
    for Om0 in np.arange(0, 2 * math.pi, 1.05):
        p = [ra, de, st['a'], st['i'] * D, Om0, st['dO'] * D / Y, st['e'], w0, st['dw'] * D / Y, L0, n + c[1] / 1e4, 0]
        nf = len(seeds)
        for k, s in enumerate(seeds): p += [2 * math.pi / s, c[2 + 2 * k], c[3 + 2 * k], 0, 0, 0, 0, 0, 0]
        p = np.array(p); xs = np.maximum(np.abs(p), 1e-4) * 0.02; xs[[0, 1, 7, 9, 4]] = 0.02; xs[10] = 1e-7
        for k in range(nf): xs[12 + 9 * k] = 1e-7; xs[13 + 9 * k:21 + 9 * k] = 2e-3
        f = lambda x: ((model(x, t, nf) - v) / st['a']).ravel()
        s1 = least_squares(f, p, x_scale=xs, max_nfev=25 if best else 40)
        if best is None or s1.cost < best.cost: best = s1
    s1 = least_squares(f, best.x, x_scale=xs, max_nfev=150); p = s1.x
    d = np.linalg.norm(model(p, t, nf) - v, axis=1); dd = np.linalg.norm(model(p, td, nf) - vd, axis=1)
    print(m, 'rms', d.mean(), 'max', d.max(), '2026 max', dd.max(), 'arcsec', d.max() / 8.6 / 1.496e8 * 206265)
    json.dump(dict(p=[float(f'{x:.12g}') for x in p[:12]], h=[], k=[[float(f'{x:.10g}') for x in p[12 + 9 * k:21 + 9 * k]] for k in range(nf)], rms=round(float(np.sqrt((d ** 2).mean()))), max=round(float(d.max())), now=round(float(dd.max()))), open(f'{RAW}/fit_{m}.json', 'w'))
