"""Figures for guide/polaris-latitude.html: why the altitude of the celestial pole equals your latitude (a cut through the Earth);
the pole star circling the pole once a day, highest and lowest on the meridian (looking north). The latitude and the pole star's
distance from the pole are drawn much bigger than they are, and not at Richmond's latitude (the diagrams must not hand over the
answers)."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))

MARK = ('<defs><marker id="plh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker>'
        '<marker id="plo" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="aheado"/></marker></defs>')

def earth():
    """The Earth cut through its axis, north up. An observer at latitude phi (drawn at 55 degrees). The horizon is the tangent at the
    observer; the celestial pole is so far away that the direction to it is parallel to the axis everywhere. The angle between the
    northern horizon and that direction (the pole's altitude) equals phi, the angle at the centre between the equator and the observer."""
    W, H = 760, 500
    cx, cy, R = 250, 310, 150
    phi = math.radians(55)
    P = lambda r, a: (cx + r * math.cos(a), cy - r * math.sin(a))
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pl1t pl1d"><title id="pl1t">Why the pole’s altitude is your latitude</title>'
         '<desc id="pl1d">A cut through the Earth with north at the top. An observer stands at latitude phi: the angle at the centre between the equator and the observer. The horizon there is the line touching the Earth at the observer. The celestial pole is so far away that the direction to it, seen from anywhere, is parallel to the Earth\'s axis, straight up the page. The angle between the northern horizon and that direction, the pole\'s altitude, is the same angle phi.</desc>' + MARK]
    # the axis, extended up to the celestial pole
    s.append(f'<line x1="{cx}" y1="{cy + R + 24}" x2="{cx}" y2="{cy - R - 10}" class="guide-l"/>')
    s.append(f'<path class="arrow" marker-end="url(#plh)" d="M{cx},{cy - R} V{40}"/>')
    s.append(f'<text class="lbl sm" x="{cx - 8}" y="{52}" text-anchor="end">the Earth’s axis,</text><text class="lbl sm" x="{cx - 8}" y="{69}" text-anchor="end">pointing at the celestial pole</text>')
    s.append(f'<circle class="earth" cx="{cx}" cy="{cy}" r="{R}"/>')
    s.append(f'<text class="lbl sm" x="{cx - 4}" y="{cy - R + 18}" text-anchor="end" style="fill:#fff">North Pole</text>')
    # equator and the radius to the observer, with the latitude angle at the centre
    s.append(f'<line x1="{cx - R}" y1="{cy}" x2="{cx + R}" y2="{cy}" style="stroke:#fff;stroke-width:1.2;stroke-dasharray:5 4"/>')
    s.append(f'<text class="lbl sm" x="{cx - R + 10}" y="{cy + 18}" style="fill:#fff">equator</text>')
    ox, oy = P(R, phi)
    s.append(f'<line x1="{cx}" y1="{cy}" x2="{f(ox)}" y2="{f(oy)}" style="stroke:#fff;stroke-width:1.4;stroke-dasharray:5 4"/>')
    r1 = 44
    s.append(f'<path d="M{cx + r1},{cy} A{r1},{r1} 0 0,0 {f(P(r1, phi)[0])},{f(P(r1, phi)[1])}" style="fill:none;stroke:#fde5cf;stroke-width:2"/>')
    xm, ym = P(r1 + 14, phi / 2)
    s.append(f'<text class="lbl" x="{f(xm)}" y="{f(ym + 5)}" style="fill:#fde5cf">φ</text>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="3" style="fill:#fff"/>')
    s.append(f'<text class="lbl sm" x="{cx - 8}" y="{cy - 10}" text-anchor="end" style="fill:#fff">centre</text>')
    # the observer: zenith (radius extended), the horizon (tangent)
    zx, zy = P(R + 130, phi)
    s.append(f'<line x1="{f(ox)}" y1="{f(oy)}" x2="{f(zx)}" y2="{f(zy)}" class="guide-l"/>')
    s.append(f'<text class="lbl sm" x="{f(zx + 6)}" y="{f(zy + 4)}">straight up (the zenith)</text>')
    tn = (-math.sin(phi), -math.cos(phi))       # along the surface, toward the north
    L = 150
    s.append(f'<line x1="{f(ox - tn[0]*L*0.8)}" y1="{f(oy - tn[1]*L*0.8)}" x2="{f(ox + tn[0]*L)}" y2="{f(oy + tn[1]*L)}" style="stroke:#2e9e4f;stroke-width:2.4"/>')
    hx, hy = ox + tn[0] * L, oy + tn[1] * L
    s.append(f'<text class="lbl sm" x="{f(hx - 6)}" y="{f(hy - 8)}" text-anchor="end" style="fill:#2e9e4f">your horizon, looking north</text>')
    sx, sy = ox - tn[0] * L * 0.8, oy - tn[1] * L * 0.8
    s.append(f'<text class="lbl sm" x="{f(sx + 4)}" y="{f(sy + 16)}" style="fill:#2e9e4f">south</text>')
    # the direction to the celestial pole from the observer: parallel to the axis
    s.append(f'<path class="extra" marker-end="url(#plo)" d="M{f(ox)},{f(oy)} V{f(oy - 150)}"/>')
    s.append(f'<text class="lbl sm" x="{f(ox + 8)}" y="{f(oy - 136)}" style="fill:#d2691e">to the celestial pole:</text>'
             f'<text class="lbl sm" x="{f(ox + 8)}" y="{f(oy - 119)}" style="fill:#d2691e">parallel to the axis</text>')
    # the pole's altitude: from the northern horizon up to the pole direction (an angle phi)
    r2 = 62
    a0 = math.atan2(-tn[1], tn[0])               # direction of the northern horizon, in math angles
    x1, y1 = ox + r2 * math.cos(a0), oy - r2 * math.sin(a0)
    x2, y2 = ox, oy - r2
    s.append(f'<path d="M{f(x1)},{f(y1)} A{r2},{r2} 0 0,1 {f(x2)},{f(y2)}" style="fill:none;stroke:var(--f-ink);stroke-width:1.8"/>')
    am = (a0 + math.pi / 2) / 2
    s.append(f'<text class="lbl" x="{f(ox + (r2 + 10) * math.cos(am) - 14)}" y="{f(oy - (r2 + 10) * math.sin(am))}">φ</text>')
    s.append(f'<circle cx="{f(ox)}" cy="{f(oy)}" r="4" class="dotc2"/><text class="lbl" x="{f(ox - 30)}" y="{f(oy + 26)}" style="fill:#fff">you</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">cut through the Earth, north up · latitude drawn at a made-up value · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def circle():
    """Looking north: the pole star goes round the celestial pole once a (sidereal) day on a small circle. It is highest and lowest
    when it crosses the meridian, above and below the pole; the pole is halfway between. The circle is drawn far too big."""
    W, H = 760, 380
    px, hy = 380, 330
    pa = 190            # the pole's height above the horizon on the page
    r = 78              # the pole star's circle, hugely exaggerated
    py = hy - pa
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pl2t pl2d"><title id="pl2t">The pole star circles the pole</title>'
         '<desc id="pl2d">Looking north. The celestial pole is a point above the northern horizon. The pole star is not exactly at the pole: once a day it goes round it, counterclockwise, on a small circle. On the meridian above the pole it is at its highest; twelve hours later, on the meridian below the pole, it is at its lowest. The pole is halfway between the two.</desc>' + MARK]
    s.append(f'<rect class="ground" x="30" y="{hy}" width="{W-60}" height="40"/><line class="horizon" x1="30" y1="{hy}" x2="{W-30}" y2="{hy}"/>')
    s.append(f'<text class="lbl sm onground" x="{px}" y="{hy + 25}" text-anchor="middle">N</text>')
    # the meridian, through the pole
    s.append(f'<line x1="{px}" y1="{hy}" x2="{px}" y2="18" style="stroke:#2e9e4f;stroke-width:1.6"/>')
    s.append(f'<text class="lbl sm" x="{px + 8}" y="26" style="fill:#2e9e4f">the meridian (green line)</text>')
    # the circle and the motion
    s.append(f'<circle cx="{px}" cy="{py}" r="{r}" class="orbitc"/>')
    a1, a2 = math.radians(150), math.radians(205)
    rr = r + 14
    s.append(f'<path class="arrow" marker-end="url(#plh)" d="M{f(px + rr*math.cos(a1))},{f(py - rr*math.sin(a1))} A{rr},{rr} 0 0,1 {f(px + rr*math.cos(a2))},{f(py - rr*math.sin(a2))}"/>'.replace(' 0 0,1 ', ' 0 0,0 '))
    s.append(f'<text class="lbl sm" x="{f(px - rr - 8)}" y="{f(py + 36)}" text-anchor="end">once a day</text>')
    # the pole, and the star at its two meridian crossings and in between
    s.append(f'<path d="M{px-7},{py} h14 M{px},{py-7} v14" style="stroke:#d2691e;stroke-width:2.2"/>')
    s.append(f'<text class="lbl" x="{px + 12}" y="{py + 5}" style="fill:#d2691e">the celestial pole</text>')
    for y, lab in ((py - r, 'highest: on the meridian above the pole'), (py + r, 'lowest: on the meridian below the pole, 12 hours later')):
        s.append(f'<circle cx="{px}" cy="{y}" r="6" style="fill:#fff6c8;stroke:#c9a227;stroke-width:1.5"/>')
        s.append(f'<text class="lbl sm" x="{px + 14}" y="{y + 4}">{lab}</text>')
    for a in (math.radians(160), math.radians(20)):
        s.append(f'<circle cx="{f(px + r*math.cos(a))}" cy="{f(py - r*math.sin(a))}" r="4" style="fill:#fff6c8;stroke:#c9a227;stroke-width:1;opacity:.6"/>')
    # altitudes measured up from the horizon
    for x, y, lab in ((90, py - r, 'greatest altitude'), (140, py, 'the pole’s altitude'), (190, py + r, 'least altitude')):
        s.append(f'<path class="dim" marker-end="url(#plh)" d="M{x},{hy} V{y + 2}"/>')
        s.append(f'<line x1="{x}" y1="{y}" x2="{px - 8}" y2="{y}" class="guide-l"/>')
        s.append(f'<text class="lbl sm" x="{x + 6}" y="{y - 6}">{lab}</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{hy - 10}" text-anchor="end">looking north · the circle drawn many times too big</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('pl_earth', earth), ('pl_circle', circle)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('polaris figures written')
