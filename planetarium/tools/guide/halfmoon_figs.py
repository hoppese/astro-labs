"""Figures for guide/half-moon.html: the Sun-Earth-Moon right triangle at the exact half Moon (from above); the same angle as seen in
the sky (what the angle tool measures); and how the answer 1 / cos(angle) runs away as the angle nears 90 degrees.
Not to scale on purpose: drawn to scale the triangle is a sliver, and it would hand over the angle."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
LIGHT = '#e9e4d6'

def halfmoon(cx, cy, r, ux, uy, dark='#5a564d'):
    """A Moon disc lit on the half that faces the direction (ux, uy) (screen coordinates)."""
    phi0 = math.atan2(uy, ux)
    pts = [(cx + r * math.cos(phi0 + math.radians(t)), cy + r * math.sin(phi0 + math.radians(t))) for t in range(-90, 91, 6)]
    lit = 'M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + ' Z'
    return (f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{r}" style="fill:{dark};stroke:var(--f-moon-line);stroke-width:1.2"/>'
            f'<path d="{lit}" style="fill:var(--f-moon)"/>')

def triangle():
    W, H = 760, 300
    ex, ey = 90, 245
    th = math.radians(68)                         # drawn angle (the real one is far closer to 90 degrees)
    dM = 175; dS = dM / math.cos(th)
    mx, my = ex + dM * math.cos(th), ey - dM * math.sin(th)
    sx, sy = ex + dS, ey
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="hm1t hm1d"><title id="hm1t">The right triangle at the half Moon</title>'
         '<desc id="hm1d">Seen from above: the Earth, the Moon and the Sun. When the Moon is exactly half lit, the line from the Moon to the Earth and the line from the Moon to the Sun meet at a right angle. The angle at the Earth, between the Moon and the Sun, is theta.</desc>']
    s.append(f'<line class="dim" x1="{ex}" y1="{ey}" x2="{f(mx)}" y2="{f(my)}"/>')
    s.append(f'<line class="dim" x1="{ex}" y1="{ey}" x2="{f(sx)}" y2="{f(sy)}"/>')
    s.append(f'<line class="sight" x1="{f(mx)}" y1="{f(my)}" x2="{f(sx)}" y2="{f(sy)}" style="stroke-dasharray:6 4"/>')
    # the right angle at the Moon
    ax, ay = (ex - mx) / dM, (ey - my) / dM
    L = math.hypot(sx - mx, sy - my); bx, by = (sx - mx) / L, (sy - my) / L
    q = 26
    s.append(f'<path class="dim" d="M{f(mx+q*ax)},{f(my+q*ay)} L{f(mx+q*ax+q*bx)},{f(my+q*ay+q*by)} L{f(mx+q*bx)},{f(my+q*by)}"/>')
    # the angle at the Earth
    ra = 46
    s.append(f'<path class="dim strong" d="M{ex+ra},{ey} A{ra},{ra} 0 0,0 {f(ex+ra*math.cos(th))},{f(ey-ra*math.sin(th))}"/>')
    s.append(f'<text class="lbl" x="{f(ex+ra*math.cos(th/2)+8)}" y="{f(ey-ra*math.sin(th/2)+4)}">θ</text>')
    # bodies
    s.append(f'<circle class="earth" cx="{ex}" cy="{ey}" r="16"/><text class="lbl" x="{ex}" y="{ey+38}" text-anchor="middle">Earth</text>')
    s.append(halfmoon(mx, my, 17, bx, by))
    s.append(f'<text class="lbl" x="{f(mx-26)}" y="{f(my-6)}" text-anchor="end">Moon,</text><text class="lbl sm" x="{f(mx-26)}" y="{f(my+11)}" text-anchor="end">exactly half lit</text>')
    s.append(f'<circle class="sun" cx="{f(sx)}" cy="{f(sy)}" r="38"/><text class="lbl" x="{f(sx)}" y="{f(sy+5)}" text-anchor="middle">Sun</text>')
    # side labels
    s.append(f'<text class="lbl sm" transform="translate({f((ex+mx)/2-12)},{f((ey+my)/2)}) rotate({f(-math.degrees(th))})" text-anchor="middle">Moon’s distance</text>')
    s.append(f'<text class="lbl sm" x="{f((ex+sx)/2)}" y="{ey+22}" text-anchor="middle">Sun’s distance</text>')
    s.append(f'<text class="lbl sm" x="{f((mx+sx)/2+14)}" y="{f((my+sy)/2-10)}">sunlight: the Moon’s half facing the Sun is lit</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">seen from above · not to scale: the real θ is much closer to 90°</text>')
    s.append('</svg>')
    return '\n'.join(s)

def sky():
    W, H = 760, 210
    cy, r = 100, 34
    mx, sx = 170, 590
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="hm2t hm2d"><title id="hm2t">The angle in the sky</title>'
         '<desc id="hm2d">In the sky: the half Moon on the left, its lit half facing the Sun on the right. The angle tool measures from the center of the Moon to the center of the Sun; that angle is theta.</desc>']
    s.append(f'<rect x="0" y="0" width="{W}" height="{H-28}" rx="10" style="fill:#1b2230"/>')
    s.append(halfmoon(mx, cy, r, 1, 0, dark='#3a3a3a'))
    s.append(f'<circle class="sun" cx="{sx}" cy="{cy}" r="{r}"/>')
    s.append(f'<line x1="{mx}" y1="{cy}" x2="{sx}" y2="{cy}" style="stroke:{LIGHT};stroke-width:1.4;stroke-dasharray:5 4"/>')
    s.append(f'<circle cx="{mx}" cy="{cy}" r="3" class="dotl"/><circle cx="{sx}" cy="{cy}" r="3" style="fill:#5a4300"/>')
    s.append(f'<text class="lbl" x="{(mx+sx)/2}" y="{cy-12}" text-anchor="middle" style="fill:{LIGHT}">θ, center to center</text>')
    s.append(f'<text class="lbl sm" x="{mx}" y="{cy+r+24}" text-anchor="middle" style="fill:{LIGHT}">half Moon: a straight edge,</text>'
             f'<text class="lbl sm" x="{mx}" y="{cy+r+40}" text-anchor="middle" style="fill:{LIGHT}">lit side toward the Sun</text>')
    s.append(f'<text class="lbl sm" x="{sx}" y="{cy+r+24}" text-anchor="middle" style="fill:{LIGHT}">Sun</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">not to scale: in the sky the two are about a quarter of the way round the sky apart</text>')
    s.append('</svg>')
    return '\n'.join(s)

def runaway():
    W, H = 760, 320
    x0, x1, y0, y1 = 90, 690, 260, 30            # plot box: x from 80 to 90 degrees, y from 0 to 100
    X = lambda a: x0 + (a - 80) / 10 * (x1 - x0)
    Y = lambda v: y0 - v / 100 * (y0 - y1)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="hm3t hm3d"><title id="hm3t">How the answer runs away near 90 degrees</title>'
         '<desc id="hm3d">A graph of the Sun\'s distance divided by the Moon\'s, which is one over the cosine of theta, for theta from 80 to 90 degrees. It rises slowly at first and then shoots up without limit as theta approaches 90 degrees. Aristarchus\'s 87 degrees gives about 19.</desc>']
    s.append(f'<rect x="{f(X(89))}" y="{y1}" width="{f(X(90)-X(89))}" height="{y0-y1}" style="fill:color-mix(in srgb, #d2691e 12%, transparent)"/>')
    for v in range(0, 101, 20):
        s.append(f'<line x1="{x0}" y1="{f(Y(v))}" x2="{x1}" y2="{f(Y(v))}" style="stroke:var(--rule);stroke-width:1"/>'
                 f'<text class="lbl sm" x="{x0-8}" y="{f(Y(v)+4)}" text-anchor="end">{v}</text>')
    for a in range(80, 91, 2):
        s.append(f'<line x1="{f(X(a))}" y1="{y0}" x2="{f(X(a))}" y2="{y0+5}" style="stroke:var(--f-ink)"/>'
                 f'<text class="lbl sm" x="{f(X(a))}" y="{y0+20}" text-anchor="middle">{a}°</text>')
    s.append(f'<line class="dim" x1="{x0}" y1="{y0}" x2="{x1}" y2="{y0}"/><line class="dim" x1="{x0}" y1="{y0}" x2="{x0}" y2="{y1}"/>')
    pts = []
    a = 80.0
    while True:
        v = 1 / math.cos(math.radians(a))
        if v > 100: break
        pts.append((X(a), Y(v))); a += 0.02
    s.append('<path style="fill:none;stroke:var(--f-ink);stroke-width:2.4" d="M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + '"/>')
    s.append(f'<path class="arrow" marker-end="url(#hmh)" d="M{f(pts[-1][0])},{f(pts[-1][1]+2)} L{f(pts[-1][0]+2)},{y1-14}"/>')
    s.append('<defs><marker id="hmh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker></defs>')
    s.append(f'<text class="lbl sm" x="{f(pts[-1][0]-10)}" y="{y1-4}" text-anchor="end">off the chart, and without limit, as θ nears 90°</text>')
    va = 1 / math.cos(math.radians(87))
    s.append(f'<circle cx="{f(X(87))}" cy="{f(Y(va))}" r="5" class="dotc2"/>'
             f'<text class="lbl" x="{f(X(87)-10)}" y="{f(Y(va)-10)}" text-anchor="end">Aristarchus: 87° gives about 19</text>')
    s.append(f'<text class="lbl sm" x="{f((X(89)+X(90))/2)}" y="{y0-10}" text-anchor="middle" style="fill:#b4532a">the last degree</text>')
    s.append(f'<text class="lbl sm" x="{(x0+x1)/2}" y="{H-6}" text-anchor="middle">θ, the angle from the Moon to the Sun</text>')
    s.append(f'<text class="lbl sm" transform="translate(22,{(y0+y1)/2}) rotate(-90)" text-anchor="middle">Sun’s distance over the Moon’s</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('hm_triangle', triangle), ('hm_sky', sky), ('hm_runaway', runaway)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('half-moon figures written')
