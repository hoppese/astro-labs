"""Figures for guide/moon-apsides.html: the Moon's oval orbit from above the North Pole (the oval hugely exaggerated), why a nearer
Moon looks bigger (angular size inversely proportional to distance), and why the place on the Earth you look from matters.
No figure gives a measured value."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
ORANGE = '#d2691e'

def earth(s, x, y, r=18):
    s.append(f'<circle class="earth" cx="{f(x)}" cy="{f(y)}" r="{r}"/><text x="{f(x)}" y="{f(y+4)}" text-anchor="middle" '
             f'style="font: 600 10.5px var(--sans); fill:#fff">NP</text>')

def orbit():
    """An ellipse with e = 0.6 (the real one is far rounder), the Earth at one focus. Perigee on the left, apogee on the right,
    the two distances marked, and the half long axis a."""
    a, e = 250, 0.6
    b = a * math.sqrt(1 - e*e)
    W, H = 760, int(2*b + 120)
    cx, cy = 380, int(b + 50)
    fx = cx - a*e                       # the Earth at the left focus, so perigee is on the left
    peri, apo = (cx - a, cy), (cx + a, cy)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="ap1t ap1d"><title id="ap1t">The Moon’s oval orbit</title>'
         '<desc id="ap1d">Seen from above the North Pole: the Moon’s orbit is an oval with the Earth not at its middle but at a focus, off to one side. The nearest point is perigee, the farthest apogee. The perigee distance is a times one minus e, the apogee distance a times one plus e. The oval is drawn far more squashed than it really is.</desc>']
    s.append(f'<ellipse class="orbitc" cx="{cx}" cy="{cy}" rx="{a}" ry="{f(b)}"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="2.5" class="dotc2"/><text class="lbl sm" x="{cx}" y="{cy - 10}" text-anchor="middle">middle of the oval</text>')
    earth(s, fx, cy)
    s.append(f'<text class="lbl" x="{f(fx)}" y="{cy - 28}" text-anchor="middle">Earth</text>')
    for (x, y), name, sub in ((peri, 'perigee', 'nearest'), (apo, 'apogee', 'farthest')):
        s.append(f'<circle class="moon" cx="{f(x)}" cy="{f(y)}" r="11"/>')
        anchor, dx = ('end', -18) if x < cx else ('start', 18)
        s.append(f'<text class="lbl" x="{f(x + dx)}" y="{f(y - 2)}" text-anchor="{anchor}">{name}</text><text class="lbl sm" x="{f(x + dx)}" y="{f(y + 15)}" text-anchor="{anchor}">{sub}</text>')
    # the two distances, below the long axis
    y1 = cy + b + 26
    for x0, x1, lab, col in ((peri[0], fx, '<tspan font-style="italic">a</tspan>(1 − <tspan font-style="italic">e</tspan>)', ORANGE),
                             (fx, apo[0], '<tspan font-style="italic">a</tspan>(1 + <tspan font-style="italic">e</tspan>)', 'var(--f-ink)')):
        s.append(f'<path d="M{f(x0)},{f(y1)} H{f(x1)} M{f(x0)},{f(y1-6)} v12 M{f(x1)},{f(y1-6)} v12" style="fill:none;stroke:{col};stroke-width:1.6"/>')
        s.append(f'<text class="lbl" x="{f((x0+x1)/2)}" y="{f(y1 - 8)}" text-anchor="middle" style="fill:{col}">{lab}</text>')
    for x in (peri[0], fx, apo[0]):
        s.append(f'<line class="guide-l" x1="{f(x)}" y1="{cy}" x2="{f(x)}" y2="{f(y1)}"/>')
    # the half long axis a, above
    y2 = cy - b - 14
    s.append(f'<path class="dim" d="M{f(cx)},{f(y2)} H{f(apo[0])} M{f(cx)},{f(y2-6)} v12 M{f(apo[0])},{f(y2-6)} v12"/>'
             f'<text class="lbl" x="{f((cx+apo[0])/2)}" y="{f(y2 - 8)}" text-anchor="middle"><tspan font-style="italic">a</tspan>: half the long axis</text>')
    s.append(f'<line class="guide-l" x1="{cx}" y1="{f(y2)}" x2="{cx}" y2="{cy}"/><line class="guide-l" x1="{f(apo[0])}" y1="{f(y2)}" x2="{f(apo[0])}" y2="{cy}"/>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-6}" text-anchor="end">looking down on the North Pole (NP) · the oval hugely exaggerated · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def sizes():
    """The same Moon near and far: the wedge from the eye is wider when it is nearer. Right: how the two look in the sky."""
    W, H = 760, 260
    ex = 40
    rm = 30
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="ap2t ap2d"><title id="ap2t">Nearer looks bigger</title>'
         '<desc id="ap2t2">Two thin wedges from an eye to the same Moon, once near and once far. The nearer Moon covers the wider angle. On the right, the two Moons as they look in the sky: one a little bigger than the other.</desc>']
    for cy, mx, lab, col in ((70, 330, 'at perigee', ORANGE), (190, 470, 'at apogee', 'var(--f-ink)')):
        s.append(f'<path class="wedge" d="M{ex},{cy} L{mx},{cy-rm} L{mx},{cy+rm} Z"/>')
        s.append(f'<line class="sight" x1="{ex}" y1="{cy}" x2="{mx}" y2="{cy-rm}"/><line class="sight" x1="{ex}" y1="{cy}" x2="{mx}" y2="{cy+rm}"/>')
        s.append(f'<circle class="moon" cx="{mx}" cy="{cy}" r="{rm}"/><circle cx="{ex}" cy="{cy}" r="4" class="dotc2"/>')
        s.append(f'<text class="lbl" x="{mx + rm + 10}" y="{cy + 5}" style="fill:{col}">{lab}</text>')
        r = 60
        t = math.atan(rm / (mx - ex))
        s.append(f'<path d="M{f(ex + r*math.cos(t))},{f(cy - r*math.sin(t))} A{r},{r} 0 0,1 {f(ex + r*math.cos(t))},{f(cy + r*math.sin(t))}" style="fill:none;stroke:{col};stroke-width:1.6"/>')
    s.append(f'<text class="lbl sm" x="{ex}" y="{H - 30}">you</text>')
    # the two discs as seen in the sky
    px = 670
    s.append(f'<rect x="{px - 62}" y="30" width="124" height="190" rx="8" style="fill:#0d1424"/>')
    s.append(f'<text class="lbl sm" x="{px}" y="22" text-anchor="middle">in the sky</text>')
    s.append(f'<circle class="moon" cx="{px}" cy="85" r="36"/><circle class="moon" cx="{px}" cy="170" r="31"/>')
    s.append(f'<text class="lbl sm" x="{px}" y="{H - 14}" text-anchor="middle">difference exaggerated</text>')
    s.append('</svg>')
    return '\n'.join(s).replace('ap2t2', 'ap2d')

def surface():
    """The Earth with you on its surface: the Moon on your horizon is about as far as from the Earth's center, the Moon overhead is
    one Earth radius nearer. Side view, Earth hugely enlarged against the Moon's distance."""
    W, H = 760, 280
    cx, cy, re = 150, 140, 70
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="ap3t ap3d"><title id="ap3t">Overhead is nearer</title>'
         '<desc id="ap3d">You stand on the Earth. When the Moon is overhead it is one Earth radius nearer to you than to the Earth’s center; when it is on your horizon it is about as far from you as from the center. So it looks a little bigger high in the sky.</desc>']
    s.append(f'<circle class="earth" cx="{cx}" cy="{cy}" r="{re}"/><circle cx="{cx}" cy="{cy}" r="2.5" style="fill:#fff"/>')
    s.append(f'<text x="{cx - 8}" y="{cy + 20}" text-anchor="end" style="font: 600 12px var(--sans); fill:#fff">center</text>')
    yx, yy = cx + re, cy                                     # you, on the right-hand side of the Earth
    s.append(f'<g transform="translate({yx},{yy}) rotate(90) scale(1.4)"><g class="person"><path d="M-4,0 L0,-8 L4,0 M0,-8 V-16 M-5,-13 H5"/><circle cx="0" cy="-19.5" r="3.5"/></g></g>')
    s.append(f'<text class="lbl sm" x="{yx + 6}" y="{yy + 26}">you</text>')
    # Moon overhead: straight out to the right
    mx = 690
    s.append(f'<line class="sight" x1="{yx + 30}" y1="{yy}" x2="{mx - 22}" y2="{yy}"/><circle class="moon" cx="{mx}" cy="{yy}" r="20"/>')
    s.append(f'<text class="lbl sm" x="{mx}" y="{yy - 30}" text-anchor="middle">Moon overhead</text>')
    # distances under it: from the center, from you
    y1 = yy + 52
    s.append(f'<path class="dim" d="M{cx},{y1} H{mx} M{cx},{y1-6} v12 M{mx},{y1-6} v12"/><text class="lbl sm" x="{(cx+mx)/2}" y="{y1 + 18}" text-anchor="middle">from the Earth’s center</text>')
    y2 = yy + 92
    s.append(f'<path d="M{yx},{y2} H{mx} M{yx},{y2-6} v12 M{mx},{y2-6} v12" style="fill:none;stroke:{ORANGE};stroke-width:1.6"/><text class="lbl sm" x="{(yx+mx)/2}" y="{y2 + 18}" text-anchor="middle" style="fill:{ORANGE}">from you: one Earth radius less</text>')
    s.append(f'<line class="guide-l" x1="{yx}" y1="{yy}" x2="{yx}" y2="{y2}"/>')
    # Moon on the horizon: straight up from you
    hx, hy = yx, 22
    s.append(f'<line class="sight" x1="{yx}" y1="{yy - 30}" x2="{hx - 2}" y2="{hy + 14}" style="stroke-dasharray:4 4"/><circle class="moon faint" cx="{hx + 6}" cy="{hy}" r="14"/>')
    s.append(f'<text class="lbl sm" x="{hx + 28}" y="{hy + 5}">Moon on your horizon: about as far from you as from the center</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-6}" text-anchor="end">side view · the Earth hugely enlarged · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('ap_orbit', orbit), ('ap_sizes', sizes), ('ap_surface', surface)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('apsides figures written')
