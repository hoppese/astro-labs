"""Figures for guide/parallax.html (two parts: the Parallax Lab on a field, then the planetarium).
px_field: the peg-and-string circle on the field, the month marks, two cones, the far trees (top view).
px_orbit: the same picture in the sky: the Sun, the Earth's orbit, a nearby star, the far stars (top view).
px_triangle: the thin triangle with the parallax angle p at the star (or cone).
px_ellipse: what you see: the nearby star's yearly ellipse against the far stars, and Barnard's star's wavy track.
None is to scale, and none shows a measured angle: the diagrams must not hand over an answer."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
NEAR, FAR = '#ff9f4a', '#e7c22b'
MARK = ('<defs><marker id="pxh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker></defs>')

def cone(x, y, col, s=1.0):
    return (f'<path d="M{f(x)},{f(y - 13 * s)} L{f(x + 8 * s)},{f(y + 9 * s)} L{f(x - 8 * s)},{f(y + 9 * s)} Z" style="fill:{col};stroke:#7a4a12;stroke-width:1"/>'
            f'<rect x="{f(x - 10 * s)}" y="{f(y + 8 * s)}" width="{f(20 * s)}" height="{f(3 * s)}" style="fill:{col};stroke:#7a4a12;stroke-width:.8"/>')

def tree(x, y, r=9):
    return f'<circle cx="{f(x)}" cy="{f(y)}" r="{r}" style="fill:#4f7a45;stroke:#2f4a2a;stroke-width:1"/>'

def field():
    W, H = 760, 330
    cx, cy, R = 120, 165, 72
    xn, xf = 395, 560            # the cones (not to scale: really 10 and 20 m against a 3–4 m circle)
    yn, yf = cy - 12, cy + 12    # half a meter to either side of the center line
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pxf1t pxf1d"><title id="pxf1t">The field: a circle for the Earth\'s orbit, two cones, far trees</title>'
         '<desc id="pxf1d">Seen from above. A peg with a string marks the middle of a circle a few meters across: the Earth\'s orbit. The January and July marks are at the two ends of the diameter square-on to the cones; April is the point nearest the cones. Two cones, a near one and one about twice as far, stand beyond the circle, and a row of trees much farther away is the background. From January and July, lines of sight run past each cone to different places among the trees.</desc>' + MARK]
    s.append(f'<circle class="orbitc" cx="{cx}" cy="{cy}" r="{R}"/>')
    s.append(f'<line class="dim" x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy - R}"/><circle cx="{cx}" cy="{cy}" r="3.5" class="dotc2"/>')
    s.append(f'<text class="lbl sm" x="{cx - 6}" y="{cy - R / 2 + 4}" text-anchor="end">string</text><text class="lbl sm" x="{cx + 8}" y="{cy + 16}">peg</text>')
    for lab, (x, y), anc, dy in (('January', (cx, cy - R), 'middle', -12), ('April', (cx + R, cy), 'start', 0), ('July', (cx, cy + R), 'middle', 22), ('October', (cx - R, cy), 'end', 0)):
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="5" style="fill:var(--f-ink)"/>')
        dx = 9 if anc == 'start' else (-9 if anc == 'end' else 0)
        s.append(f'<text class="lbl sm" x="{f(x + dx)}" y="{f(y + dy + (5 if dy == 0 else 0))}" text-anchor="{anc}">{lab}</text>')
    # far trees (the background)
    for i in range(9):
        s.append(tree(712 + (i % 2) * 14, 28 + i * 34, 8 + (i % 3)))
    s.append(f'<text class="lbl sm" x="{W - 8}" y="{H - 8}" text-anchor="end">far trees: the background</text>')
    # lines of sight from January and July past the near cone to the trees
    for (ox, oy), col in (((cx, cy - R), NEAR), ((cx, cy + R), NEAR)):
        tx = 700; ty = oy + (yn - oy) * (tx - ox) / (xn - ox)
        s.append(f'<line x1="{f(ox)}" y1="{f(oy)}" x2="{f(tx)}" y2="{f(ty)}" style="stroke:{col};stroke-width:1.3;stroke-dasharray:5 4"/>')
    for (ox, oy) in ((cx, cy - R), (cx, cy + R)):
        tx = 700; ty = oy + (yf - oy) * (tx - ox) / (xf - ox)
        s.append(f'<line x1="{f(ox)}" y1="{f(oy)}" x2="{f(tx)}" y2="{f(ty)}" style="stroke:{FAR};stroke-width:1.3;stroke-dasharray:2 4"/>')
    s.append(cone(xn, yn, NEAR) + cone(xf, yf, FAR))
    s.append(f'<text class="lbl sm" x="{xn}" y="{yn - 20}" text-anchor="middle">near cone</text><text class="lbl sm" x="{xf}" y="{yf + 30}" text-anchor="middle">far cone</text>')
    s.append(f'<text class="lbl sm" x="8" y="{H - 8}">seen from above · not to scale (the cones are really 10 and 20 m away, the string 3 to 4 m long)</text>')
    s.append('</svg>')
    return '\n'.join(s)

def orbit():
    W, H = 760, 330
    cx, cy, R = 130, 165, 78
    xs, ys = 470, 165
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pxf2t pxf2d"><title id="pxf2t">The same picture in the sky</title>'
         '<desc id="pxf2d">Seen from above the North Pole. The Sun in the middle of the Earth\'s orbit, the Earth at two places six months apart, square-on to a nearby star. Lines of sight from the two Earths run past the star to different places among the far stars. The angle at the star between the line to the Sun and the line to the Earth is the parallax p.</desc>' + MARK]
    s.append(f'<circle class="orbitc" cx="{cx}" cy="{cy}" r="{R}"/><circle class="sun" cx="{cx}" cy="{cy}" r="17"/>')
    s.append(f'<text class="lbl sm" x="{cx}" y="{cy + 33}" text-anchor="middle">Sun</text>')
    s.append(f'<line class="dim" x1="{cx}" y1="{cy}" x2="{cx}" y2="{cy - R}"/><text class="lbl sm" x="{cx - 6}" y="{cy - R / 2 + 4}" text-anchor="end">1 AU</text>')
    # far stars
    for i, (x, y) in enumerate([(700, 30), (735, 70), (690, 112), (728, 150), (705, 196), (740, 236), (690, 276), (725, 306)]):
        s.append(f'<circle cx="{x}" cy="{y}" r="2.6" style="fill:var(--f-ink)"/>')
    s.append(f'<text class="lbl sm" x="{W - 8}" y="{H - 8}" text-anchor="end">far stars: the background</text>')
    for (ox, oy) in ((cx, cy - R), (cx, cy + R)):
        tx = 715; ty = oy + (ys - oy) * (tx - ox) / (xs - ox)
        s.append(f'<line class="sight" x1="{f(ox)}" y1="{f(oy)}" x2="{f(tx)}" y2="{f(ty)}" style="stroke-dasharray:5 4"/>')
    s.append(f'<line class="dim" x1="{cx}" y1="{cy}" x2="{xs}" y2="{ys}" style="stroke-dasharray:2 4"/>')
    # the angle p at the star, between the line to the Sun and the line to the January Earth
    a0 = math.atan2(cy - ys, cx - xs); a1 = math.atan2(cy - R - ys, cx - xs); r = 70
    s.append(f'<path class="dim strong" d="M{f(xs + r * math.cos(a0))},{f(ys + r * math.sin(a0))} A{r},{r} 0 0,1 {f(xs + r * math.cos(a1))},{f(ys + r * math.sin(a1))}"/>')
    s.append(f'<text class="lbl" x="{f(xs - r - 16)}" y="{f(ys - 9)}" text-anchor="middle">p</text>')
    for (ex, ey), lab, dy in (((cx, cy - R), 'the Earth in January', -16), ((cx, cy + R), 'the Earth in July', 28)):
        s.append(f'<circle class="earth" cx="{f(ex)}" cy="{f(ey)}" r="11"/><text class="lbl sm" x="{f(ex)}" y="{f(ey + 3.5)}" text-anchor="middle" style="fill:#fff;font-size:9px">NP</text>')
        s.append(f'<text class="lbl sm" x="{f(ex)}" y="{f(ey + dy)}" text-anchor="middle">{lab}</text>')
    # the Earth's motion: anticlockwise seen from above the North Pole
    q0, q1 = math.radians(200), math.radians(235)
    s.append(f'<path class="arrow" marker-end="url(#pxh)" d="M{f(cx + (R + 12) * math.cos(q0))},{f(cy - (R + 12) * math.sin(q0))} A{R + 12},{R + 12} 0 0,0 {f(cx + (R + 12) * math.cos(q1))},{f(cy - (R + 12) * math.sin(q1))}"/>')
    s.append(f'<circle cx="{xs}" cy="{ys}" r="6" style="fill:#ffd27a;stroke:#9a6a10;stroke-width:1"/><text class="lbl sm" x="{xs}" y="{ys + 22}" text-anchor="middle">nearby star</text>')
    s.append(f'<text class="lbl sm" x="8" y="{H - 8}">looking down on the North Pole (NP) · not to scale: the star is really hundreds of thousands of AU away</text>')
    s.append('</svg>')
    return '\n'.join(s)

def triangle():
    W, H = 760, 200
    x0, y0, y1, xs = 70, 150, 60, 640
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pxf3t pxf3d"><title id="pxf3t">The thin triangle</title>'
         '<desc id="pxf3d">A long thin right triangle. The short side is the baseline: one field AU, the radius of the circle, or 1 AU. The long side is the distance d to the cone or the star. The small angle at the far corner is the parallax p.</desc>']
    s.append(f'<path class="wedge" d="M{x0},{y0} L{x0},{y1} L{xs},{y0} Z"/>')
    s.append(f'<path class="tri" style="stroke:var(--f-ink)" d="M{x0},{y0} L{x0},{y1} L{xs},{y0} Z"/>')
    s.append(f'<path class="dim" d="M{x0 + 12},{y0} v-12 h-12"/>')
    s.append(f'<text class="lbl" x="{x0 - 10}" y="{(y0 + y1) / 2 + 5}" text-anchor="end">R</text>')
    s.append(f'<text class="lbl sm" x="{x0 + 8}" y="{y1 - 10}">January (or the Earth)</text><text class="lbl sm" x="{x0 + 8}" y="{y0 + 22}">the peg (or the Sun)</text>')
    s.append(f'<text class="lbl" x="{(x0 + xs) / 2}" y="{y0 + 22}" text-anchor="middle">d</text>')
    a1 = math.atan2(y1 - y0, x0 - xs); r = 120
    s.append(f'<path class="dim strong" d="M{xs - r},{y0} A{r},{r} 0 0,1 {f(xs + r * math.cos(a1))},{f(y0 + r * math.sin(a1))}"/>')
    s.append(f'<text class="lbl" x="{xs - r - 14}" y="{y0 - 8}">p</text>')
    s.append(f'<circle cx="{xs}" cy="{y0}" r="5" style="fill:#ffd27a;stroke:#9a6a10"/><text class="lbl sm" x="{xs + 10}" y="{y0 + 4}">cone (or star)</text>')
    s.append(f'<text class="lbl sm" x="{W - 8}" y="{H - 6}" text-anchor="end">the angle drawn far wider than it really is</text>')
    s.append('</svg>')
    return '\n'.join(s)

def ellipse():
    W, H = 760, 290
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="pxf4t pxf4d"><title id="pxf4t">What you see through the year</title>'
         '<desc id="pxf4d">Left: a small patch of sky. Faint background stars stay put; the nearby star goes once round a small ellipse in a year. Half the long axis of the ellipse is the parallax p. Right: Barnard\'s star also drifts steadily across the sky, so its yearly ellipse is pulled out into a wavy, looping track.</desc>' + MARK]
    for x0, title in ((20, 'a nearby star, one year'), (400, 'Barnard’s star: the ellipse and a steady drift')):
        s.append(f'<rect x="{x0}" y="30" width="340" height="230" rx="8" style="fill:#0d1420"/>')
        s.append(f'<text class="lbl sm" x="{x0 + 170}" y="20" text-anchor="middle">{title}</text>')
        for (dx, dy) in ((30, 40), (290, 60), (60, 200), (250, 210), (160, 34), (310, 160), (40, 120), (200, 240)):
            s.append(f'<circle cx="{x0 + dx}" cy="{30 + dy}" r="1.8" style="fill:#c9d3e0"/>')
    # left: the ellipse with month dots
    cx, cy, a, b = 190, 150, 95, 42
    s.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{a}" ry="{b}" style="fill:none;stroke:#6f86a3;stroke-width:1.2;stroke-dasharray:4 4"/>')
    for k, m in enumerate(['Jan', 'Mar', 'May', 'Jul', 'Sep', 'Nov']):
        t = math.radians(90 + 60 * k)
        x, y = cx + a * math.cos(t), cy - b * math.sin(t)
        s.append(f'<circle cx="{f(x)}" cy="{f(y)}" r="4" style="fill:#ffd27a"/><text class="lbl sm" x="{f(x + (10 if math.cos(t) >= 0 else -10))}" y="{f(y + (-6 if math.sin(t) > 0 else 14))}" text-anchor="{"start" if math.cos(t) >= 0 else "end"}" style="fill:#c9d3e0">{m}</text>')
    s.append(f'<line x1="{cx}" y1="{cy}" x2="{cx + a}" y2="{cy}" style="stroke:#ffd27a;stroke-width:1.6"/><circle cx="{cx}" cy="{cy}" r="2" style="fill:#ffd27a"/>')
    s.append(f'<text class="lbl" x="{cx + a / 2}" y="{cy + 18}" text-anchor="middle" style="fill:#ffd27a">p</text>')
    # right: ellipse plus drift
    pts = []
    for i in range(241):
        t = i / 240 * 2.2                     # years
        ph = 2 * math.pi * t
        pts.append((440 + 120 * t + 34 * math.cos(ph), 190 - 45 * t - 18 * math.sin(ph)))
    s.append('<path d="M' + ' L'.join(f'{f(x)},{f(y)}' for x, y in pts) + '" style="fill:none;stroke:#ffd27a;stroke-width:1.6"/>')
    s.append(f'<path class="arrow light" marker-end="url(#pxh)" d="M450,250 L700,155" style="stroke:#6f86a3;stroke-dasharray:4 4"/>')
    s.append(f'<text class="lbl sm" x="640" y="226" text-anchor="middle" style="fill:#c9d3e0">the steady drift</text>')
    s.append(f'<text class="lbl sm" x="{W - 8}" y="{H - 6}" text-anchor="end">sizes hugely exaggerated · not real dates or angles</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('px_field', field), ('px_orbit', orbit), ('px_triangle', triangle), ('px_ellipse', ellipse)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('parallax figures written')
