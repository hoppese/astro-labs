"""Figures for guide/sun-moon-size.html: why two bodies that look the same size have size in proportion to distance (two similar
triangles from the eye), and where to click the edges during a partial eclipse so that the other body is not in the way.
Not to scale on purpose: drawn to scale the Sun would be far off the page, and the drawing would hand over the ratio."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
LIGHT = '#e9e4d6'

def triangles():
    """Eye on the left; the Moon near, the Sun far. The two lines from the eye that graze the Moon's top and bottom also graze the
    Sun's: the same angle, so each diameter is in proportion to its distance."""
    W, H = 760, 340
    ex, ey = 60, 135
    a = math.radians(9.5)                    # half the angle at the eye (hugely exaggerated)
    dm, ds = 170, 560                       # drawn distances (not the real ratio)
    rm, rs = dm * math.tan(a), ds * math.tan(a)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="sm1t sm1d"><title id="sm1t">Same angle, so size in proportion to distance</title>'
         '<desc id="sm1d">An eye on the left. Two lines from the eye just graze the top and bottom of the near, small Moon and carry on to graze the top and bottom of the far, big Sun. The Moon and the Sun fill the same angle at the eye, so the Sun is as many times bigger as it is farther away.</desc>']
    s.append(f'<path class="wedge" d="M{ex},{ey} L{f(ex+ds)},{f(ey-rs)} L{f(ex+ds)},{f(ey+rs)} Z"/>')
    s.append(f'<line class="sight" x1="{ex}" y1="{ey}" x2="{f(ex+ds)}" y2="{f(ey-rs)}"/><line class="sight" x1="{ex}" y1="{ey}" x2="{f(ex+ds)}" y2="{f(ey+rs)}"/>')
    s.append(f'<circle class="sun" cx="{f(ex+ds)}" cy="{ey}" r="{f(rs)}"/>')
    s.append(f'<circle class="moon" cx="{f(ex+dm)}" cy="{ey}" r="{f(rm)}"/>')
    s.append(f'<circle cx="{ex}" cy="{ey}" r="5" class="dotc2"/><text class="lbl sm" x="{ex}" y="{ey+24}" text-anchor="middle">you</text>')
    s.append(f'<path class="dim" d="M{ex+44},{f(ey-44*math.tan(a))} A44,44 0 0,1 {ex+44},{f(ey+44*math.tan(a))}"/><text class="lbl" x="{ex+52}" y="{ey+5}">α</text>')
    # the diameters
    s.append(f'<path class="dim" d="M{f(ex+dm-6)},{f(ey-rm)} h-8 V{f(ey+rm)} h8"/><text class="lbl sm" x="{f(ex+dm-20)}" y="{f(ey-rm-10)}" text-anchor="middle">Moon’s diameter</text>')
    s.append(f'<path class="dim" d="M{f(ex+ds+rs+10)},{f(ey-rs)} h8 V{f(ey+rs)} h-8"/><text class="lbl sm" x="{f(ex+ds+rs+24)}" y="{ey+5}">Sun’s</text><text class="lbl sm" x="{f(ex+ds+rs+24)}" y="{ey+21}">diameter</text>')
    # the distances
    yb = ey + rs + 30
    s.append(f'<path class="dim" d="M{ex},{f(yb-16)} V{f(yb+16)} M{f(ex+dm)},{f(yb-10)} V{f(yb+2)} M{f(ex+ds)},{f(yb-2)} V{f(yb+16)}"/>')
    s.append(f'<path class="dim" d="M{ex},{f(yb-6)} H{f(ex+dm)}"/><text class="lbl sm" x="{f(ex+dm/2)}" y="{f(yb-12)}" text-anchor="middle">Moon’s distance</text>')
    s.append(f'<path class="dim" d="M{ex},{f(yb+10)} H{f(ex+ds)}"/><text class="lbl sm" x="{f(ex+ds/2)}" y="{f(yb+26)}" text-anchor="middle">Sun’s distance</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-6}" text-anchor="end">not to scale: the angle α hugely exaggerated, the Sun really much farther and much bigger</text>')
    s.append('</svg>')
    return '\n'.join(s)

def edges():
    """A partial eclipse in the sky (atmosphere off, so the dark Moon shows outside the Sun). To measure a diameter, click two
    opposite edges that are both free: across the line joining the centers, not along it."""
    W, H = 760, 320
    sx, sy, rs = 330, 150, 80
    mx, my, rm = 440, 120, 80
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="sm2t sm2d"><title id="sm2t">Where to click the edges</title>'
         '<desc id="sm2d">A partial eclipse: the dark Moon overlaps part of the bright Sun. A dashed line joins their centers. To measure the Sun, click two opposite edges of the Sun on a line through its center at right angles to the dashed line, where the Moon does not cover either edge. Do the same for the Moon. Along the dashed line one edge of each lies where the two overlap.</desc>']
    s.append(f'<rect x="0" y="0" width="{W}" height="{H-30}" rx="10" style="fill:#1b2230"/>')
    s.append(f'<circle class="sun" cx="{sx}" cy="{sy}" r="{rs}"/>')
    s.append(f'<circle cx="{mx}" cy="{my}" r="{rm}" style="fill:#2c2f36;fill-opacity:.92;stroke:#6b7280;stroke-width:1.2"/>')
    dx, dy = mx - sx, my - sy; L = math.hypot(dx, dy); ux, uy = dx / L, dy / L
    px, py = -uy, ux                                  # at right angles to the line of centers
    s.append(f'<line x1="{f(sx - ux*(rs+24))}" y1="{f(sy - uy*(rs+24))}" x2="{f(mx + ux*(rm+24))}" y2="{f(my + uy*(rm+24))}" style="stroke:{LIGHT};stroke-width:1.2;stroke-dasharray:5 4;opacity:.75"/>')
    def diam(cx, cy_, r, col):
        a = (cx + px*r, cy_ + py*r); b = (cx - px*r, cy_ - py*r)
        s.append(f'<line x1="{f(a[0])}" y1="{f(a[1])}" x2="{f(b[0])}" y2="{f(b[1])}" style="stroke:{col};stroke-width:2.2"/>')
        for x, y in (a, b):
            s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="6" style="fill:#1b2230;stroke:{col};stroke-width:2.2"/>')
        return a, b
    (sa, sb) = diam(sx, sy, rs, '#8a5a00')
    (ma, mb) = diam(mx, my, rm, '#9fc2ff')
    # labels, outside the discs
    s.append(f'<text class="lbl sm" x="{f(sb[0] - 14)}" y="{f(sb[1] + 4)}" text-anchor="end" style="fill:#f5c542">Sun: click this edge …</text>')
    s.append(f'<text class="lbl sm" x="{f(sa[0])}" y="{f(sa[1] + 24)}" text-anchor="middle" style="fill:#f5c542">… and this one</text>')
    s.append(f'<text class="lbl sm" x="{f(mb[0])}" y="{f(mb[1] - 14)}" text-anchor="middle" style="fill:#9fc2ff">Moon: click this edge …</text>')
    s.append(f'<text class="lbl sm" x="{f(ma[0] + 14)}" y="{f(ma[1] + 4)}" style="fill:#9fc2ff">… and this one</text>')
    ex_, ey_ = mx + ux*(rm+24), my + uy*(rm+24)
    s.append(f'<text class="lbl sm" x="{f(ex_ + 8)}" y="{f(ey_ - 8)}" style="fill:{LIGHT}">the line of centers:</text><text class="lbl sm" x="{f(ex_ + 8)}" y="{f(ey_ + 8)}" style="fill:{LIGHT}">not along it, one edge is hidden</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">as in the lab, with the atmosphere off so the dark Moon shows outside the Sun · sizes not the real ones</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('sm_triangles', triangles), ('sm_edges', edges)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('sun-moon-size figures written')
