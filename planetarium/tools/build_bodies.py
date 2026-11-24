#!/usr/bin/env python3
"""Published maps and photographs of solar-system bodies -> data/bodies/*.webp. Usage: python3 -I tools/build_bodies.py RAW_MAPS data/bodies [name ...]
Every output map is simple cylindrical, longitude -180..180 east positive, left to right. No surface is invented: gaps are filled with the mean
brightness of the map's edge and the app's panel says so. NOTES.md ("Solar-system bodies") lists every source with its licence."""
import sys, os, glob, math, datetime
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
RAW, OUT, ONLY = sys.argv[1], sys.argv[2], set(sys.argv[3:])
os.makedirs(OUT, exist_ok=True)
def load(f, size=None, mode='RGB'):
    im = Image.open(os.path.join(RAW, f))
    if im.mode not in (mode, 'I;16', 'I'): im = im.convert(mode)
    if size: im = im.resize(size, Image.LANCZOS)
    return np.asarray(im, np.float64)
def roll(a, deg): return np.roll(a, int(round(deg / 360 * a.shape[1])), 1)
def lum(a): return a if a.shape[-1] != 3 else a @ [0.299, 0.587, 0.114]
def save(name, a, q=82, small=512):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)); im.save(f'{OUT}/{name}.webp', quality=q, method=6)
    if small and im.width > small: im.resize((small, small * im.height // im.width), Image.LANCZOS).save(f'{OUT}/{name}-s.webp', quality=80, method=6)
    s = sum(os.path.getsize(f) for f in glob.glob(f'{OUT}/{name}.webp') + glob.glob(f'{OUT}/{name}-s.webp'))
    print(f'{name:12s} {im.size} {s/1000:.0f} kB')
def blur(a, sx, sy):
    """Gaussian-ish blur that wraps in longitude and reflects in latitude (three box passes)."""
    for _ in range(3):
        n = max(1, int(sx)); k = 2 * n + 1
        p = np.concatenate([a[:, -n-1:], a, a[:, :n]], 1); c = np.cumsum(p, 1); a = (c[:, k:] - c[:, :-k]) / k
        n = max(1, int(sy)); k = 2 * n + 1
        p = np.concatenate([a[n:0:-1], a[:1]*0 + a[:1], a, a[-2:-n-2:-1]], 0)[:]; p = np.concatenate([a[n::-1], a, a[-2:-n-2:-1]], 0); c = np.cumsum(p, 0); c = np.concatenate([np.zeros_like(c[:1]), c], 0); a = (c[k:] - c[:-k])[:a.shape[0]] / k
    return a
def tint(g, rgb, spread=None):
    """Grey map -> colour with the mean chroma of a published colour photograph."""
    c = np.array(rgb, float); c = c / (c @ [0.299, 0.587, 0.114]); return g[..., None] * c
def photo_chroma(f, box=None, floor=60):
    a = load(f); 
    if box: a = a[box[1]:box[3], box[0]:box[2]]
    m = lum(a) > floor; return a[m].mean(0)
def stretch(g, mean, contrast=1.0):
    m = g.mean(); return (g - m) * contrast + m + (mean - m)
def fill_gap(a, mask, soft=12):
    """mask True = no data. Neutral fill (mean of the valid map near the same latitude band's edge = the map's mean), feathered over `soft` px."""
    v = ~mask; mean = a[v].mean(0)
    w = blur(v.astype(float), soft, soft); w = np.clip((w - 0.5) * 2, 0, 1); w[mask] = 0
    b = a.copy(); b[mask] = mean
    ww = w if a.ndim == 2 else w[..., None]
    return b * ww + mean * (1 - ww)
def want(n): return not ONLY or n in ONLY

# ---------------------------------------------------------------- Moon (NASA SVS CGI Moon Kit: LRO WAC colour, LOLA elevation)
if want('moon'):
    a = load('lroc_color_poles_4k.tif', (4096, 2048)); save('moon', a, 80, 1024)
    h = np.asarray(Image.open(os.path.join(RAW, 'ldem_16_uint.tif')), np.float64) * 0.5       # uint16, half-metres
    n = h.shape[1] // 2048; w = n * 2048; h = h if h.shape[1] == 2048 else np.asarray(Image.fromarray(h.astype(np.float32)).resize((2048, 1024), Image.BOX), np.float64)
    R = 1737400.0; lat = (90 - (np.arange(1024) + 0.5) * 180 / 1024) * math.pi / 180
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / (2 * R * (2 * math.pi / 2048) * np.maximum(np.cos(lat), 0.05))[:, None]
    dy = np.zeros_like(h); dy[1:-1] = (h[:-2] - h[2:]) / (2 * R * math.pi / 1024)      # northward
    enc = lambda g: 127.5 + 127.5 * np.sign(g) * np.sqrt(np.minimum(np.abs(g) / 0.3, 1))
    save('moon-n', np.dstack([enc(dx), enc(dy), 127 + 0 * h]), 88, 0)
# ---------------------------------------------------------------- Mercury (MESSENGER MDIS), Mars (Viking MDIM 2.1 colour)
if want('mercury'):
    g = lum(load('mercury_bw.png')); g[g < 4] = np.median(g); g = stretch(g, 120, 2.4); save('mercury', tint(g, [1.04, 1.0, 0.94]), 80)
if want('mars'): 
    a = load('mars_color.png', (3072, 1536)); ref = load('PIA00407.jpg'); ref = ref[lum(ref) > 60].mean(0); cur = a[300:1236].mean((0, 1)); print('mars mean colour', cur, '->', ref)
    a = a * ((ref / lum(ref)) / (cur / lum(cur))) ** 0.35 * 122 / lum(cur); g = lum(a)[..., None]; a = g + 0.78 * (a - g); lo = np.stack([blur(a[..., c], 60, 60) for c in range(3)], 2); a = lo + 0.8 * (a - lo); save('mars', a, 78)      # part-way: the Viking orbiter colours are stronger than the eye's
# ---------------------------------------------------------------- Venus: one Mariner 10 photograph (PIA23791 left, natural-contrast version), a disc
def disc_photo(name, f, box=None, out=512, thresh=12, pad=1.02, red=False):
    """Crop a photograph to the body's silhouette, put it on transparent black (RGBA) with a feathered edge."""
    a = load(f)
    if box: a = a[box[1]:box[3], box[0]:box[2]]
    if red: a = a[..., :1].repeat(3, 2)          # drop the collage's blue background
    g = blur(lum(a), 1, 1); m = g > thresh
    ys, xs = np.where(m); x0, x1, y0, y1 = np.percentile(xs, 0.1), np.percentile(xs, 99.9), np.percentile(ys, 0.1), np.percentile(ys, 99.9)
    s = max(x1 - x0, y1 - y0) * pad; cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    im = Image.fromarray(a.astype(np.uint8)).transform((out, out), Image.AFFINE, (s / out, 0, cx - s / 2, 0, s / out, cy - s / 2), Image.BICUBIC)
    al = Image.fromarray((np.clip((g - thresh * 0.5) / (thresh * 0.9), 0, 1) * 255).astype(np.uint8)).transform((out, out), Image.AFFINE, (s / out, 0, cx - s / 2, 0, s / out, cy - s / 2), Image.BICUBIC)
    im.putalpha(al); im.save(f'{OUT}/{name}.webp', quality=84, method=6)
    print(f'{name:12s} photo {im.size} {os.path.getsize(f"{OUT}/{name}.webp")/1000:.0f} kB  aspect {(x1-x0)/(y1-y0):.3f}')
def front_photo(name, f, box, thresh, out, mean, gain):
    """A near-full-phase photograph with its own shading divided out (broad brightness), as a front-facing disc: cloud texture and mean colour are the photograph's."""
    a = load(f)
    if box: a = a[box[1]:box[3], box[0]:box[2]]
    g = blur(lum(a), 1, 1); m = g > thresh; ys, xs = np.where(m); y0, y1 = np.percentile(ys, 0.05), np.percentile(ys, 99.95); x0 = np.percentile(xs, 0.05)
    R = (y1 - y0) / 2; cx, cy = x0 + R, (y0 + y1) / 2           # the lit limb is on the left; the terminator side is cut short by the phase
    im = np.stack([np.asarray(Image.fromarray(a[..., c].astype(np.float32)).transform((out, out), Image.AFFINE, (2 * R / out, 0, cx - R, 0, 2 * R / out, cy - R), Image.BICUBIC)) for c in range(3)], 2).astype(float)
    gg = lum(im); y, x = np.mgrid[0:out, 0:out]; rr = np.hypot(x - out / 2 + .5, y - out / 2 + .5) / (out / 2)
    ok = (blur((gg > 70).astype(float), 6, 6) > 0.97) & (rr < 0.86); w = ok.astype(float); sx = out / 16
    lo = blur(gg * w, sx, sx) / np.maximum(blur(w, sx, sx), 1e-3); t = np.where(ok, gg / np.maximum(lo, 1), 1)
    f2 = np.clip(blur(w, out / 16, out / 16) * 2 - 1, 0, 1); t = 1 + (t - 1) * f2 * gain
    col = im[ok].mean(0); col = col / lum(col)
    chroma = np.where(ok[..., None], im / np.maximum(gg, 1)[..., None], col); chroma = col + (chroma - col) * f2[..., None]
    chroma = np.stack([blur(chroma[..., c], out / 24, out / 24) for c in range(3)], 2)
    save(name, t[..., None] * chroma * mean, 88, 0)
if want('venus'): front_photo('venus', 'PIA23791.jpg', (0, 0, 1080, 1096), 24, 1024, 205, 1.0)
if want('titan'): front_photo('titan', 'PIA11603.jpg', None, 24, 256, 170, 0.3)
if want('hyperion'): disc_photo('hyperion', 'PIA07740.jpg', None, 256, 14)
if want('amalthea'): disc_photo('amalthea', 'PIA02532.jpg', (0, 0, 400, 410), 128, 20)
if want('proteus'): disc_photo('proteus', 'PIA00062.jpg', None, 128, 16)
# VLT/SPHERE photographs (ESO eso2114a, CC BY 4.0, ESO/M. Kornmesser/Vernazza et al./MISTRAL algorithm (ONERA/CNRS))
for n, (cx, cy, h) in {'pallas': (597, 126, 46), 'hygiea': (775, 127, 41), 'juno': (775, 317, 34)}.items():
    if want(n): disc_photo(n, 'eso2114.jpg', tuple(int(v * 6083 / 1400) for v in (cx - h, cy - h, cx + h, cy + h)), 256, 60, red=True)
if want('corona'):      # NASA/Aubrey Gemignani, 21 August 2017, Madras, Oregon (NHQ201708210100)
    a = load('ecl_NHQ201708210100.jpg'); g = lum(a); bgc = np.percentile(a[:200, :400].reshape(-1, 3), 30, 0)
    m = blur((g < 40).astype(float), 8, 8); ys, xs = np.where((g < 45) & (np.hypot(*(np.mgrid[0:a.shape[0], 0:a.shape[1]] - np.array([770, 955])[:, None, None])) < 420))
    cx, cy, R = (xs.min() + xs.max()) / 2, (ys.min() + ys.max()) / 2, (xs.max() - xs.min() + ys.max() - ys.min()) / 4; print('corona: Moon', cx, cy, R)
    N = 1024; W = 4.4; ix = (np.arange(N) + .5) / N * W - W / 2; X, Y = np.meshgrid(ix, ix); rr = np.hypot(X, Y)
    px, py = np.clip(cx + X * R, 0, a.shape[1] - 2), np.clip(cy + Y * R, 0, a.shape[0] - 2); o = a[py.astype(int), px.astype(int)] - bgc
    f = np.clip((2.18 - rr) / 0.85, 0, 1); f = f * f * (3 - 2 * f); save('corona', np.clip(o, 0, 255) * f[..., None] * (rr > 0.97)[..., None], 82, 0)
# ---------------------------------------------------------------- giants (Hubble OPAL: CC BY 4.0, NASA, ESA, A.A. Simon, M.H. Wong)
def opal(f, size):  # west longitude 360 -> 0 left to right = east longitude 0 -> 360
    return roll(load(f, size), 180)
def fill_lat(a, bad):
    """Fill missing latitude samples column by column from the nearest valid ones (linear across the ring gap, constant at the poles), then
    let the zonal mean take over near the poles, where the map has only a few pixels of data."""
    a = a.copy(); H = a.shape[0]; y = np.arange(H)
    for x in range(a.shape[1]):
        b = bad[:, x]
        if b.any() and not b.all():
            for c in range(3): a[b, x, c] = np.interp(y[b], y[~b], a[~b, x, c])
    return a
H8 = 'hlsp_opal_hst_wfc3-uvis_'
if want('jupiter'):
    a = opal(H8 + 'jupiter-2025b_f395n-f502n-f631n_v1_globalmap.tif', (3600, 1800))
    bad = lum(a) < 45; bad = blur(bad.astype(float), 4, 4) > 0.08; lat = 90 - (np.arange(1800) + .5) / 10
    bad |= (np.abs(lat) > 76)[:, None]
    a = fill_lat(a, bad); z = np.repeat(blur(a.mean(1, keepdims=True).repeat(8, 1), 1, 12)[:, :1], 3600, 1)
    w = np.clip((np.abs(lat) - 70) / 8, 0, 1)[:, None, None]; a = a * (1 - w) + z * w
    print('jupiter seam step (mean |col0-col-1|):', np.abs(a[300:1500, 0] - a[300:1500, -1]).mean(), 'typical:', np.abs(a[300:1500, 900] - a[300:1500, 901]).mean())
    g = lum(a)[..., None]; a = g + 0.82 * (a - g); save('jupiter', a, 84)
if want('saturn'):
    a = opal(H8 + 'saturn-2025b_f395n-f502n-f631n_v1_globalmap.tif', (1800, 900)); lat = 90 - (np.arange(900) + .5) / 5
    bad = (lum(a) < 60) | (np.abs(lat) > 72)[:, None]; bad |= ((lat < 5.5) & (lat > -6.5))[:, None]
    bad = blur(bad.astype(float), 5, 5) > 0.05
    a = fill_lat(a, bad)
    # remove the stitching steps between the six exposures: divide by the longitude profile of low-pass brightness (keeps real zonal structure)
    col = blur(a.mean(0, keepdims=True).repeat(12, 0), 30, 1)[:1]; a = a / col * col.mean(1, keepdims=True)
    z = blur(a.mean(1, keepdims=True).repeat(8, 1), 1, 2)[:, :1]; w = np.clip((np.abs(lat) - 64) / 8, 0, 1)[:, None, None]; a = a * (1 - w) + z * w
    # colour: OPAL's f395n/f502n/f631n composite is cooler than the eye's; match the mean colour to Cassini's natural-colour Saturn (PIA11141)
    ref = load('PIA11141.jpg')[1300:1600, 2000:2500]; ref = ref[lum(ref) > 120].mean(0)
    g = lum(a); c = a / g[..., None]; c = c / c.mean((0, 1)); c = 1 + 0.35 * (c - 1)          # a third of the composite's colour contrast, on the photograph's mean colour
    g = (g / g.mean() - 1) * 0.9 + 1
    ref = 0.6 * ref + 0.4 * lum(ref); a = g[..., None] * c * ref / lum(ref) * 185
    save('saturn', a, 86)
def icegiant(name, f, colour, contrast, mean):
    a = opal(f, (721, 361)); H = a.shape[0]
    g = lum(a); sat = a.max(2) - a.min(2)
    v = (g > 100) & (g < 254); 
    for _ in range(2): v &= blur(v.astype(float), 6, 6) > 0.93
    rows = v.mean(1) > 0.55
    ok = np.where(rows)[0]; print(name, 'valid rows', ok.min(), ok.max())
    lo, hi = ok.min() + 2, ok.max() - 2
    z = g[lo:hi]; g2 = np.empty_like(g); g2[lo:hi] = z; g2[:lo] = z[:6].mean(); g2[hi:] = z[-6:].mean()
    bad = ~v; 
    for x in range(g.shape[1]):
        b = bad[:, x]; b[:lo] = False; b[hi:] = False
        if b.any(): g2[b, x] = np.interp(np.where(b)[0], np.where(~b)[0], g2[~b, x])
    g2[:lo + 8] = blur(g2, 20, 4)[:lo + 8]; g2[hi - 8:] = blur(g2, 20, 4)[hi - 8:]
    g2 = blur(g2, 1, 1); g2 = (g2 / g2.mean() - 1) * contrast + 1
    save(name, np.clip(g2, 0.6, 1.5)[..., None] * mean * np.array(colour) / lum(np.array(colour, float)), 88)
if want('uranus'):
    ref = photo_chroma('PIA00032.jpg', (0, 0, 1000, 1000), 120); print('Uranus natural colour (PIA00032)', ref)
    icegiant('uranus', H8 + 'uranus-2025b_f657n-f547m-f467m_v1_globalmap.tif', ref, 0.55, 190)
if want('neptune'):
    # Voyager's published blue is over-enhanced; Irwin et al. 2024 (MNRAS 527, 11521) show Neptune only slightly bluer than Uranus. Colour: Uranus's, shifted slightly to blue.
    ref = photo_chroma('PIA00032.jpg', (0, 0, 1000, 1000), 120) * np.array([0.90, 0.985, 1.06])
    icegiant('neptune', H8 + 'neptune-2026a_f467m-f547m-f657n_v1_globalmap.tif', ref, 1.0, 175)
# ---------------------------------------------------------------- Galilean moons (USGS; colour of the grey maps from Galileo natural-colour photographs)
if want('io'): save('io', load('io.png'), 80)
def flatten_seams(g, sx, sy, mask=None, keep=0.0):
    """Divide out very broad brightness steps between mosaicked missions, keeping `keep` of the broad variation."""
    lo = blur(g, sx, sy); return g * (lo.mean() / np.maximum(lo, 1)) ** (1 - keep)
if want('europa'):
    g = lum(load('europa.png')); g = fill_gap(g, g < 8, 14); save('europa', tint(stretch(flatten_seams(g, 220, 120, keep=0.6), 175, 1.15), 0.55 * photo_chroma('PIA00502.jpg', (0, 0, 950, 1000)) + 0.45 * lum(photo_chroma('PIA00502.jpg', (0, 0, 950, 1000)))), 80)
if want('ganymede'):
    g = lum(load('ganymede.png')); g = fill_gap(g, g < 8, 14); save('ganymede', tint(stretch(flatten_seams(g, 260, 130, keep=0.65), 130, 1.25), photo_chroma('PIA00716.jpg')), 80)
if want('callisto'):
    g = lum(load('callisto.png')); g = fill_gap(g, g < 6, 14); save('callisto', tint(stretch(flatten_seams(g, 200, 130, keep=0.5), 92, 1.3), photo_chroma('PIA03456.jpg')), 80)
# ---------------------------------------------------------------- Saturn's icy moons (Schenk global colour maps: brightness, a trace of the enhanced colour)
def schenk(name, f, shift, mean, size=(1024, 512), contrast=1.0):
    a = roll(load(f, size), shift); g = lum(a)
    c = (a + 1) / (g[..., None] + 1); c = 1 + 0.08 * (c - c.mean((0, 1)))
    save(name, stretch(g, mean, contrast)[..., None] * c * np.array([1.015, 1.0, 0.975]), 80)
# these maps run 0..360 E (cross-correlated with the USGS WMS maps, which run -180..180: shift 180 for Tethys, Dione, Rhea, Iapetus)
for n, f, m, k in (('mimas', 'PIA18437', 165, 0.9), ('enceladus', 'PIA18435', 205, 0.9), ('tethys', 'PIA18439', 185, 1.0), ('dione', 'PIA18434', 170, 1.0), ('rhea', 'PIA18438', 170, 1.0), ('iapetus', 'PIA18436', 120, 1.0)):
    if want(n): schenk(n, f + '.jpg', 180, m, contrast=k)
if want('phoebe'):
    g = lum(load('phoebe.png')); m = g < 8; save('phoebe', tint(fill_gap(stretch(g, 100, 0.8), m, 8), [1, 1, 1]), 80, 0)
# ---------------------------------------------------------------- Uranus's moons (Voyager 2, USGS mosaics as served by JPL; grey; unseen north left neutral)
SH = {'miranda': ('ura5.jpg', 120), 'ariel': ('ura1.jpg', 150), 'umbriel': ('ura2.jpg', 85), 'titania': ('ura3.jpg', 115), 'oberon': ('ura4.jpg', 105)}
for n, (f, mean) in SH.items():
    if want(n):
        g = lum(load(f, (1024, 512))); m = g < 10; m = blur(m.astype(float), 2, 2) > 0.4
        v = g[~m]; g = np.where(m, g, (g - v.mean()) * 0.75 + mean); save(n, tint(np.clip(fill_gap(g, m, 10), 0, 255), [1.02, 1.0, 0.97]), 80, 0)
# ---------------------------------------------------------------- Triton, Pluto, Charon, Ceres, Vesta, Phobos, Deimos
if want('triton'):
    a = load('triton.png'); m = lum(a) > 250; m = blur(m.astype(float), 2, 2) > 0.3
    g = lum(a); c = photo_chroma('PIA00317.jpg'); a = tint(g, c) * 0.75 + a * 0.25 * (tint(g, c).mean((0, 1)) / a[~m].mean(0)); v = a[~m]; a = (a - v.mean(0)) * 1.0 + v.mean(0) * (175 / lum(v).mean())
    save('triton', fill_gap(a, m, 12), 82, 0)
if want('pluto'):
    a = roll(load('PIA11707.jpg', (2048, 1024)), 180); m = lum(a) < 12; m = blur(m.astype(float), 2, 2) > 0.3; save('pluto', fill_gap(a, m, 16), 80)
if want('charon'):
    g = lum(load('charon.png')); m = (g > 250); m = blur(m.astype(float), 3, 3) > 0.3; m[256 + 40:] |= g[256 + 40:] > 245
    save('charon', tint(fill_gap(stretch(g, 120, 0.75), m, 12), [1.03, 1.0, 0.97]), 80, 0)
if want('ceres'):
    g = lum(load('PIA20354.jpg', (2048, 1024))); c = photo_chroma('PIA21079.jpg', None, 80); c = 1 + 0.5 * (c / c.mean() - 1); save('ceres', tint(stretch(flatten_seams(g, 60, 60), 105, 0.8), c), 78)
if want('vesta'):
    g = lum(load('vesta.png')); m = g < 8; save('vesta', tint(fill_gap(stretch(flatten_seams(g, 260, 160, keep=0.5), 150, 1.7), m & (np.abs(np.arange(1024) - 512) > 400)[:, None], 12), [1.03, 1.0, 0.95]), 78)
if want('phobos'):
    g = lum(load('st_phobos_cyl_dlr_control.jpg', (1024, 512))); save('phobos', tint(stretch(g, 105, 0.8), photo_chroma('PIA10368.jpg') * 0.5 + 0.5 * lum(photo_chroma('PIA10368.jpg'))), 80, 0)
if want('deimos'):
    g = roll(lum(load('st_deimos_cyl_viking_mro.jpg', (1024, 512))), 180); save('deimos', tint(stretch(g, 120, 0.8), photo_chroma('PIA11826.jpg') * 0.5 + 0.5 * lum(photo_chroma('PIA11826.jpg'))), 80, 0)
# ---------------------------------------------------------------- Saturn's rings: colour strip (PIA08389: Cassini natural colour, 74,565-136,780 km) + optical depth (Voyager 2 PPS, PDS VG_2801)
if want('rings'):
    N = 2048; r0, r1 = 74000.0, 137000.0; r = r0 + (np.arange(N) + .5) / N * (r1 - r0)
    # lit face: PIA11142 (Cassini, natural colour, 10 deg below the illuminated side). Its scale varies slightly: pinned at the known edges, each found as the steepest brightness step nearby
    a = load('PIA11142.jpg')[690:730].mean(0); g = np.convolve(lum(a), np.ones(9) / 9, 'same'); px, km = [], []
    for guess, rad, sign in ((1170, 74658, 1), (3800, 92000, 1), (8085, 117580, -1), (8465, 119980, 0), (10575, 133589, 0), (11050, 136775, -1)):
        h = 40 if guess == 8465 else 110; w = np.arange(guess - h, guess + h); d = np.roll(g, -12)[w] - np.roll(g, 12)[w]; k = w[np.argmin(g[w])] if sign == 0 else w[np.argmax(d * sign)]; px.append(k); km.append(rad)
    print('ring edges at px', px)
    coef = np.polyfit(px, km, 3); print('residuals km', np.round(np.polyval(coef, px) - km)); rs = np.polyval(coef, np.arange(len(g))); sel = (np.arange(len(g)) > 1050) & (np.arange(len(g)) < 11120)
    lit = np.stack([np.interp(r, rs[sel], np.convolve(a[:, c], np.ones(5) / 5, 'same')[sel], 0, 0) for c in range(3)], 1)
    b = load('PIA08389.jpg')[300:680].mean(0); rb = np.linspace(74565, 136780, b.shape[0]); k = max(1, len(rb) // N)
    unlit = np.stack([np.interp(r, rb, np.convolve(b[:, c], np.ones(k) / k, 'same'), 0, 0) for c in range(3)], 1)
    t = np.array([[float(x) for x in l.split(',')[:4]] for l in open(os.path.join(RAW, 'ps1.tab')) if l.strip()])
    tau = np.clip(np.interp(r, t[:, 0], np.convolve(np.clip(t[:, 3], -0.02, 3.5), np.ones(3) / 3, 'same')), 0, 3.5); tau[r < 74600] = 0; tau[r > 136780] = 0
    out = np.zeros((4, N, 3)); out[0] = lit; out[1] = unlit; out[2] = out[3] = (np.sqrt(tau / 3.5) * 255)[:, None]
    Image.fromarray(np.clip(out.repeat(2, 0), 0, 255).astype(np.uint8)).save(f'{OUT}/rings.png', optimize=True)
    print('rings', os.path.getsize(f'{OUT}/rings.png'), 'lit C/B/Cassini/A', [np.round(np.interp(x, r, lit[:, 0])) for x in (80000, 105000, 119000, 130000)], 'tau', [round(float(np.interp(x, r, tau)), 2) for x in (80000, 105000, 119000, 130000)])
# ---------------------------------------------------------------- the Sun: one Carrington rotation assembled from 30 daily SDO/HMI photographs (intensity, limb darkening removed: the HMIIF browse images)
def sun_angles(jd):      # Meeus, Astronomical Algorithms ch. 29: P, B0, L0 in degrees
    T = (jd - 2451545.0) / 36525; d2r = math.pi / 180
    L = 280.46646 + 36000.76983 * T; M = (357.52911 + 35999.05029 * T) * d2r
    C = (1.914602 - 0.004817 * T) * math.sin(M) + 0.019993 * math.sin(2 * M) + 0.000289 * math.sin(3 * M)
    lam = (L + C - 0.00569 - 0.00478 * math.sin((125.04 - 1934.136 * T) * d2r)) * d2r
    th = (jd - 2398220) * 360 / 25.38 * d2r; I = 7.25 * d2r; K = (73.6667 + 1.3958333 * (jd - 2396758) / 36525) * d2r; eps = 23.4393 * d2r
    x = math.atan(-math.cos(lam) * math.tan(eps)); y = math.atan(-math.cos(lam - K) * math.tan(I))
    B0 = math.asin(math.sin(lam - K) * math.sin(I)); eta = math.atan2(-math.sin(lam - K) * math.cos(I), -math.cos(lam - K))
    return (x + y) / d2r, B0 / d2r, ((eta - th) / d2r) % 360
def sun_map(name, first, n):
    W, H = 4096, 2048; acc = np.zeros((H, W)); wt = np.zeros((H, W))
    lon = ((np.arange(W) + .5) / W * 360 - 180) * math.pi / 180; lat = ((np.arange(H)[::-1] + .5) / H * 180 - 90) * math.pi / 180
    clat, slat = np.cos(lat)[:, None], np.sin(lat)[:, None]
    for k in range(n):
        day = first + datetime.timedelta(k); f = f'sun/{day:%Y%m%d}_120000.jpg'
        if not os.path.exists(os.path.join(RAW, f)): continue
        a = load(f, None, 'L'); jd = day.toordinal() + 1721425.0; P, B0, L0 = sun_angles(jd)
        on = a > 60; ys, xs = np.where(on); cx, cy = (np.percentile(xs, .01) + np.percentile(xs, 99.99)) / 2, (np.percentile(ys, .01) + np.percentile(ys, 99.99)) / 2
        c = np.where(on[int(cy)])[0]; R = (c[-1] - c[0] + 1) / 2; cx = (c[-1] + c[0]) / 2; c = np.where(on[:, int(cx)])[0]; cy = (c[-1] + c[0]) / 2
        b0 = B0 * math.pi / 180; dl = lon[None] - L0 * math.pi / 180           # longitude from the central meridian, west (right) positive
        mu = math.sin(b0) * slat + math.cos(b0) * clat * np.cos(dl)
        x = clat * np.sin(dl); y = math.cos(b0) * slat - math.sin(b0) * clat * np.cos(dl)
        dd = (dl + math.pi) % (2 * math.pi) - math.pi; w = np.where(np.abs(dd) < 0.30, np.cos(dd / 0.30 * math.pi / 2) ** 6, 0) * (mu > 0.15)
        px = cx + R * x; py = cy - R * y; sel = w > 1e-4
        X, Y = px[sel], py[sel]; xi, yi = X.astype(int), Y.astype(int); fx, fy = X - xi, Y - yi
        v = a[yi, xi] * (1 - fx) * (1 - fy) + a[yi, xi + 1] * fx * (1 - fy) + a[yi + 1, xi] * (1 - fx) * fy + a[yi + 1, xi + 1] * fx * fy
        acc[sel] += w[sel] * (v / np.median(a[on])); wt[sel] += w[sel]
    g = np.where(wt > 0, acc / np.maximum(wt, 1e-9), 1); print(name, 'covered', (wt > 0).mean().round(3), 'P,B0,L0 last', [round(v, 2) for v in (P, B0, L0)], 'centre', cx, cy, R)
    lo = np.where((g < 0.97) | (g > 1.03), 1, g); lo = blur(lo, 60, 60); g = g / lo; save(name, np.clip(128 + (g - 1) * 180, 0, 255), 82, 0)
if want('sun'): sun_map('sun', datetime.date(2026, 10, 25), 30)
if want('sun-quiet'): sun_map('sun-quiet', datetime.date(2019, 11, 18), 30)
