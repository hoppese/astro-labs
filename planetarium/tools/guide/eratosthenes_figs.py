"""Figures for guide/eratosthenes.html: parallel sunlight on two cities and the angle at the Earth's centre (side view, cut through
the Earth); the Sun's noon altitude and its distance from the zenith as seen in one city. Angles are exaggerated (the diagrams
must not hand over the measured angle)."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))

MARK = ('<defs><marker id="erh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" style="fill:#d9a400"/></marker></defs>')

def sunlight():
    """The Earth cut through the two cities. Sunlight comes from the right in parallel rays. At Syene the Sun is (nearly) overhead:
    its ray points at the centre. At Alexandria, farther north, the ray meets the vertical (the line to the centre) at an angle.
    Because the rays are parallel, that angle equals the angle between the two cities at the centre (alternate angles)."""
    W, H = 760, 440
    cx, cy, R = 250, 250, 160
    aS, aA = math.radians(0), math.radians(34)          # Syene on the sunward point; Alexandria 28 degrees north (exaggerated)
    P = lambda r, a: (cx + r * math.cos(a), cy - r * math.sin(a))
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="er1t er1d"><title id="er1t">Parallel sunlight on Syene and Alexandria</title>'
         '<desc id="er1d">A cut through the Earth. Sunlight arrives from the right in parallel rays. At Syene the Sun is overhead, so its ray points straight at the Earth\'s centre. At Alexandria, farther north, the vertical (the line to the centre) makes an angle with the sunlight. Because the rays are parallel, that angle is the same as the angle between the two cities measured at the centre of the Earth.</desc>' + MARK]
    # sunlight
    for y in range(40, 420, 34):
        x0 = W - 20
        # stop the ray where it meets the Earth (on the right half) or at the left edge of the drawing if it misses
        dy = y - cy
        if abs(dy) < R:
            xe = cx + math.sqrt(R * R - dy * dy)
        else:
            continue
        s.append(f'<line x1="{x0}" y1="{y}" x2="{f(xe)}" y2="{y}" style="stroke:#e8b400;stroke-width:1.2;opacity:.55" marker-end="url(#erh)"/>')
    s.append(f'<text class="lbl" x="{W-20}" y="26" text-anchor="end">sunlight: parallel rays from the far-away Sun</text>')
    s.append(f'<circle class="earth" cx="{cx}" cy="{cy}" r="{R}"/>')
    # the two radii and the angle at the centre
    for a in (aS, aA):
        x, y = P(R, a)
        s.append(f'<line x1="{cx}" y1="{cy}" x2="{f(x)}" y2="{f(y)}" style="stroke:#fff;stroke-width:1.4;stroke-dasharray:5 4"/>')
    r1 = 46
    x1, y1 = P(r1, aS); x2, y2 = P(r1, aA)
    s.append(f'<path d="M{f(x1)},{f(y1)} A{r1},{r1} 0 0,0 {f(x2)},{f(y2)}" style="fill:none;stroke:#fde5cf;stroke-width:2"/>')
    xm, ym = P(r1 + 14, (aS + aA) / 2)
    s.append(f'<text class="lbl" x="{f(xm)}" y="{f(ym + 5)}" style="fill:#fde5cf">θ</text>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="3" style="fill:#fff"/><text class="lbl sm" x="{cx - 8}" y="{cy + 20}" text-anchor="end" style="fill:#fff">centre of the Earth</text>')
    # the arc between the cities on the surface
    ra = R + 10
    x1, y1 = P(ra, aS); x2, y2 = P(ra, aA)
    s.append(f'<path d="M{f(x1)},{f(y1)} A{ra},{ra} 0 0,0 {f(x2)},{f(y2)}" style="fill:none;stroke:#d2691e;stroke-width:3"/>')
    # cities: a stick (gnomon) standing straight up at each, and its shadow at Alexandria
    for a, name, dx, dy in ((aS, 'Syene', -40, 26), (aA, 'Alexandria', -96, -30)):
        x, y = P(R, a); xt, yt = P(R + 56, a)
        s.append(f'<line x1="{f(x)}" y1="{f(y)}" x2="{f(xt)}" y2="{f(yt)}" style="stroke:var(--f-ink);stroke-width:3;stroke-linecap:round"/>')
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="4" class="dotc2"/>')
        s.append(f'<text class="lbl" x="{f(xt + dx)}" y="{f(yt + dy)}">{name}</text>')
    # the angle at Alexandria between the vertical (extended upward) and the incoming ray
    xA, yA = P(R + 56, aA)
    xv, yv = P(R + 170, aA)
    s.append(f'<line x1="{f(xA)}" y1="{f(yA)}" x2="{f(xv)}" y2="{f(yv)}" class="guide-l"/>')
    s.append(f'<text class="lbl sm" x="{f(xv + 6)}" y="{f(yv - 4)}">straight up (the zenith)</text>')
    s.append(f'<line x1="{f(xA)}" y1="{f(yA)}" x2="{f(xA + 170)}" y2="{f(yA)}" style="stroke:#d9a400;stroke-width:2.4"/>')
    s.append(f'<text class="lbl sm" x="{f(xA + 172)}" y="{f(yA + 18)}" text-anchor="end">the sunlight at Alexandria</text>')
    r2 = 70
    s.append(f'<path d="M{f(xA + r2)},{f(yA)} A{r2},{r2} 0 0,0 {f(xA + r2*math.cos(aA))},{f(yA - r2*math.sin(aA))}" style="fill:none;stroke:var(--f-ink);stroke-width:1.6"/>')
    s.append(f'<text class="lbl" x="{f(xA + (r2 + 12)*math.cos(aA/2))}" y="{f(yA - (r2 + 12)*math.sin(aA/2) + 5)}">θ</text>')
    xl, yl = P(ra + 2, 0.36)
    s.append(f'<line x1="{f(xl)}" y1="{f(yl)}" x2="{f(cx + R + 90)}" y2="{f(cy - 30)}" class="guide-l"/>')
    s.append(f'<text class="lbl sm" x="{f(cx + R + 94)}" y="{f(cy - 34)}">the arc between the cities:</text><text class="lbl sm" x="{f(cx + R + 94)}" y="{f(cy - 17)}">5000 stadia</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">cut through the Earth, north up · the angle θ hugely exaggerated · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def altitude():
    """One city at noon: the horizon, the meridian line from south up through the zenith, the Sun on it. Altitude is measured up from
    the horizon; the angle from the zenith is 90 degrees minus the altitude."""
    W, H = 760, 300
    ox, oy, r = 330, 250, 190
    alt = math.radians(62)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="er2t er2d"><title id="er2t">The Sun\'s altitude at noon</title>'
         '<desc id="er2d">Looking at the sky from one city at local noon. The Sun stands on the meridian, the line from the south point on the horizon up through the zenith. Its altitude is its angle above the horizon; its distance from the zenith is 90 degrees minus the altitude.</desc>' + MARK]
    s.append(f'<rect class="ground" x="40" y="{oy}" width="{W-80}" height="40"/><line class="horizon" x1="40" y1="{oy}" x2="{W-40}" y2="{oy}"/>')
    s.append(f'<path d="M{ox - r},{oy} A{r},{r} 0 0,1 {ox + r},{oy}" style="fill:none;stroke:#2e9e4f;stroke-width:2"/>')
    s.append(f'<text class="lbl sm" x="{ox - r - 6}" y="{oy - 8}" text-anchor="end" style="fill:#2e9e4f">the meridian</text>')
    sx, sy = ox + r * math.cos(alt), oy - r * math.sin(alt)
    s.append(f'<line x1="{ox}" y1="{oy}" x2="{f(sx)}" y2="{f(sy)}" class="dim"/>')
    s.append(f'<line x1="{ox}" y1="{oy}" x2="{ox}" y2="{oy - r - 18}" class="guide-l"/><text class="lbl sm" x="{ox}" y="{oy - r - 24}" text-anchor="middle">zenith (straight up)</text>')
    s.append(f'<circle class="sun" cx="{f(sx)}" cy="{f(sy)}" r="15"/><text class="lbl" x="{f(sx + 22)}" y="{f(sy + 5)}">the Sun at local noon</text>')
    a1 = 80
    s.append(f'<path d="M{ox + a1},{oy} A{a1},{a1} 0 0,0 {f(ox + a1*math.cos(alt))},{f(oy - a1*math.sin(alt))}" class="dim"/>')
    xm, ym = ox + (a1 + 12) * math.cos(alt / 2), oy - (a1 + 12) * math.sin(alt / 2)
    s.append(f'<text class="lbl" x="{f(xm)}" y="{f(ym + 4)}">altitude</text>')
    a2 = 120
    s.append(f'<path d="M{f(ox + a2*math.cos(alt))},{f(oy - a2*math.sin(alt))} A{a2},{a2} 0 0,0 {ox},{oy - a2}" style="fill:none;stroke:#d2691e;stroke-width:2.4"/>')
    am = (alt + math.pi / 2) / 2
    s.append(f'<text class="lbl" x="{ox - 10}" y="{oy - a2 - 6}" text-anchor="end" style="fill:#d2691e">distance</text><text class="lbl" x="{ox - 10}" y="{oy - a2 + 12}" text-anchor="end" style="fill:#d2691e">from the zenith</text>')
    s.append(f'<circle cx="{ox}" cy="{oy}" r="5" class="dotc2"/><text class="lbl sm" x="{ox}" y="{oy + 22}" text-anchor="middle" style="fill:#e9e4d6">you</text>')
    s.append(f'<text class="lbl sm" x="{ox + r + 8}" y="{oy - 8}">south</text><text class="lbl sm" x="{ox - r + 8}" y="{oy + 22}" style="fill:#e9e4d6">north</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('er_sunlight', sunlight), ('er_altitude', altitude)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('eratosthenes figures written')
