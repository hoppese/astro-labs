"""Figures for guide/eclipse-two-sites.html: the Moon's shadow on the Earth (Richmond in the umbra, Atlanta in the penumbra);
the sky from the two towns (the Moon shifted against the Sun); the thin triangle from the baseline to the Moon. Nothing is to
scale: the Sun is far too close, the Moon far too big, and the shift is not drawn at its real size."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
MARK = ('<defs><marker id="esh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker></defs>')

def cone():
    """Side view: Sun, Moon, and a piece of the Earth's surface. The umbra cone (from the outer tangents) just reaches the
    surface at Richmond; Atlanta, a little farther along the surface, is inside the penumbra only."""
    W, H = 760, 320
    cy = 150
    xs, R = 80, 42           # the Sun
    xm, r = 360, 16          # the Moon
    D = xm - xs
    xa = xm + r * D / (R - r)                    # the umbra's apex
    ec, ER = xa + 135, 135                       # the Earth: its surface just touches the apex at Richmond
    def surf(y):                                  # x of the Earth's surface at height y
        return ec - math.sqrt(ER * ER - (y - cy) ** 2)
    pw = lambda x: r + (R + r) * (x - xm) / D     # half-width of the penumbra at x
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="es1t es1d"><title id="es1t">The Moon’s shadow on the Earth</title>'
         '<desc id="es1d">Side view, not to scale. Lines touching the edges of the Sun and of the Moon outline the Moon’s shadow. The dark umbra narrows to a point that just reaches the Earth’s surface at Richmond, where the eclipse is total. Around it the pale penumbra spreads out; Atlanta, a few hundred kilometres away, is inside the penumbra, where only part of the Sun is covered.</desc>', MARK]
    # the penumbra (inner tangents) and the umbra (outer tangents)
    xe = surf(cy) + 70                            # run the penumbra into the Earth; the Earth is drawn over it
    yb = pw(xe)
    s.append(f'<path class="pen" d="M{xm},{cy - r} L{f(xe)},{f(cy - yb)} L{f(xe)},{f(cy + yb)} L{xm},{cy + r} Z"/>')
    s.append(f'<path class="umb" d="M{xm},{cy - r} L{f(xa)},{cy} L{xm},{cy + r} Z"/>')
    for (y1, y2) in ((cy - R, cy - r), (cy + R, cy + r)):                      # outer tangents: Sun edge to Moon edge, same side
        x_end = xa; y_end = cy
        s.append(f'<line class="ray u" x1="{xs}" y1="{y1}" x2="{f(x_end)}" y2="{y_end}"/>')
    for (y1, y2, sg) in ((cy - R, cy + r, 1), (cy + R, cy - r, -1)):            # inner tangents cross between Sun and Moon
        s.append(f'<line class="ray p" x1="{xs}" y1="{y1}" x2="{f(xe)}" y2="{f(cy + sg * yb)}"/>')
    # the Earth's surface
    s.append(f'<clipPath id="esclip"><rect x="0" y="0" width="{W - 6}" height="{H}"/></clipPath>')
    s.append(f'<circle class="earth" cx="{f(ec)}" cy="{cy}" r="{ER}" clip-path="url(#esclip)"/>')
    s.append(f'<text class="lbl" x="{W - 20}" y="{cy + 80}" text-anchor="end" style="fill:#fff">Earth</text>')
    s.append(f'<circle class="sun" cx="{xs}" cy="{cy}" r="{R}"/><text class="lbl" x="{xs}" y="{cy + R + 22}" text-anchor="middle">Sun</text>')
    s.append(f'<circle class="moon dim" cx="{xm}" cy="{cy}" r="{r}"/><text class="lbl" x="{xm}" y="{cy - r - 12}" text-anchor="middle">Moon</text>')
    # the two towns
    ya = cy + 0.6 * pw(surf(cy))
    for (x, y, name, dy) in ((surf(cy), cy, 'Richmond: total', -12), (surf(ya), ya, 'Atlanta: partial', 22)):
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="4.5" class="dotc2"/>')
        s.append(f'<text class="lbl sm" x="{f(x + 12)}" y="{f(y + 5)}" style="fill:#fff">{name}</text>')
    s.append(f'<text class="lbl sm u" x="{f((xm + xa) / 2 + 6)}" y="{cy - 22}" text-anchor="middle">umbra</text>')
    s.append(f'<text class="lbl sm p" x="{f(xa - 20)}" y="{f(cy - pw(xa - 20) - 8)}" text-anchor="middle">penumbra</text>')
    s.append(f'<text class="lbl sm" x="10" y="{H - 8}">side view · the Sun far too close, the Moon far too big · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def sky():
    """What the lab shows: the Sun and Moon as Richmond sees them (the Moon right over the Sun), and dashed, the Sun (yellow) and
    the Moon (blue) as Atlanta sees them at the same instant. The Sun hardly moves; the Moon is shifted. The shift is drawn far
    larger than it is."""
    W, H = 760, 320
    cx, cy, R = 300, 170, 80
    shift = 0.55 * 2 * R                         # deliberately not the real fraction
    a = math.radians(-28)                        # direction of the shift on the picture
    mx2, my2 = cx + shift * math.cos(a), cy - shift * math.sin(a)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="es2t es2d"><title id="es2t">The Moon shifted against the Sun</title>'
         '<desc id="es2d">A dark sky. From Richmond the Moon, a dark disc, covers the Sun exactly. The dashed yellow circle is the Sun as seen from Atlanta at the same instant, in practically the same place. The dashed blue circle is the Moon as seen from Atlanta, shifted, so that part of the Sun shows. The shift between the two Moons is marked, and the Sun’s width across the dashed yellow circle.</desc>', MARK]
    s.append(f'<rect x="0" y="0" width="{W}" height="{H}" rx="10" style="fill:#0d1422"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{R + 6}" style="fill:none;stroke:#f5e6b8;stroke-opacity:.35;stroke-width:8"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" style="fill:#1b1f27;stroke:#55606f;stroke-width:1.2"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="{R}" style="fill:none;stroke:#f2c94c;stroke-width:1.8;stroke-dasharray:6 4"/>')
    s.append(f'<circle cx="{f(mx2)}" cy="{f(my2)}" r="{R}" style="fill:none;stroke:#7fb2ff;stroke-width:1.8;stroke-dasharray:6 4"/>')
    s.append(f'<circle cx="{cx}" cy="{cy}" r="3" style="fill:#e9e4d6"/><circle cx="{f(mx2)}" cy="{f(my2)}" r="3" style="fill:#7fb2ff"/>')
    s.append(f'<path class="arrow" marker-end="url(#esh)" style="stroke:#f0a35e;stroke-width:2" d="M{cx},{cy} L{f(mx2 - 6*math.cos(a))},{f(my2 + 6*math.sin(a))}"/>')
    s.append(f'<text class="lbl" x="{f((cx + mx2) / 2 + 12)}" y="{f((cy + my2) / 2 - 14)}" style="fill:#f0a35e">the shift</text>')
    # the Sun's width across the dashed yellow circle
    yb = cy - R - 24
    s.append(f'<path class="dim" style="stroke:#f2c94c" d="M{cx - R},{yb} H{cx + R} M{cx - R},{yb - 6} v12 M{cx + R},{yb - 6} v12"/>')
    s.append(f'<text class="lbl sm" x="{cx}" y="{yb + 20}" text-anchor="middle" style="fill:#f2c94c">the Sun’s width (dashed yellow)</text>'.replace(f'y="{yb + 20}"', f'y="{yb - 10}"'))
    kx = 560
    for i, (col, dash, txt) in enumerate((('#55606f', '', 'the Moon from Richmond'), ('#f2c94c', '6 4', 'the Sun from Atlanta'), ('#7fb2ff', '6 4', 'the Moon from Atlanta'))):
        y = 60 + i * 28
        s.append(f'<circle cx="{kx}" cy="{y}" r="9" style="fill:{"#1b1f27" if not dash else "none"};stroke:{col};stroke-width:1.8;stroke-dasharray:{dash or "none"}"/>')
        s.append(f'<text class="lbl sm" x="{kx + 18}" y="{y + 5}" style="fill:#d8dde6">{txt}</text>')
    s.append(f'<text class="lbl sm" x="{W - 12}" y="{H - 10}" text-anchor="end" style="fill:#aab4c4">the shift drawn far bigger than it is</text>')
    s.append('</svg>')
    return '\n'.join(s)

def triangle():
    """The thin triangle: the square-on baseline b between Richmond and Atlanta, the Moon at distance d, the angle p."""
    W, H = 760, 210
    bx, cy, hb = 90, 100, 44
    mx = 650
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="es3t es3d"><title id="es3t">A long thin triangle</title>'
         '<desc id="es3d">The square-on baseline b between Richmond and Atlanta on the left, and the Moon at distance d on the right. Lines from the two towns meet at the Moon at the small angle p, the shift. In radians, p is very nearly b divided by d.</desc>']
    s.append(f'<path class="wedge" d="M{bx},{cy - hb} L{mx},{cy} L{bx},{cy + hb} Z"/>')
    s.append(f'<line class="sight" x1="{bx}" y1="{cy - hb}" x2="{mx}" y2="{cy}"/><line class="sight" x1="{bx}" y1="{cy + hb}" x2="{mx}" y2="{cy}"/>')
    s.append(f'<line class="lead" x1="{bx}" y1="{cy - hb}" x2="{bx}" y2="{cy + hb}"/>')
    s.append(f'<circle cx="{bx}" cy="{cy - hb}" r="4.5" class="dotc2"/><circle cx="{bx}" cy="{cy + hb}" r="4.5" class="dotc2"/>')
    s.append(f'<text class="lbl sm" x="{bx - 10}" y="{cy - hb + 5}" text-anchor="end">Richmond</text><text class="lbl sm" x="{bx - 10}" y="{cy + hb + 5}" text-anchor="end">Atlanta</text>')
    s.append(f'<text class="lbl" x="{bx + 10}" y="{cy + 5}" style="fill:#d2691e">b</text>')
    s.append(f'<circle class="moon" cx="{mx}" cy="{cy}" r="15"/><text class="lbl sm" x="{mx + 22}" y="{cy + 5}">Moon</text>')
    ra = 170; a = math.atan2(hb, mx - bx)
    s.append(f'<path class="dim" d="M{f(mx - ra*math.cos(a))},{f(cy - ra*math.sin(a))} A{ra},{ra} 0 0,0 {f(mx - ra*math.cos(a))},{f(cy + ra*math.sin(a))}"/>')
    s.append(f'<text class="lbl" x="{mx - ra - 16}" y="{cy + 5}">p</text>')
    s.append(f'<path class="dim" d="M{bx},{cy + hb + 32} H{mx}"/><path class="dim" d="M{bx},{cy + hb + 26} v12 M{mx},{cy + hb + 26} v12"/><text class="lbl" x="{(bx + mx) / 2}" y="{cy + hb + 24}" text-anchor="middle">d</text>')
    s.append(f'<text class="lbl sm" x="{W - 10}" y="{H - 8}" text-anchor="end">the angle hugely exaggerated</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('es_cone', cone), ('es_sky', sky), ('es_triangle', triangle)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('eclipse-two-sites figures written')
