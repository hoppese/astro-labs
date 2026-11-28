"""Figures for guide/lunar-parallax.html: two observers see the Moon against different stars; only the square-on part of the
baseline makes the shift; the thin triangle from the baseline to the Moon. Nothing is to scale: the Earth is drawn far too
big and the Moon far too close, and no picture carries the measured angle or baseline."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))
MARK = ('<defs><marker id="lph" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker></defs>')

def sight():
    """Side view: Berlin (north) and Cape Town (south) on a big Earth, both looking at the Moon. Their lines of sight cross at the
    Moon and land on different background stars: the parallax shift, and the angle p between the lines at the Moon."""
    W, H = 760, 330
    ex, ey, re = 130, 165, 78
    mx, my, rm = 470, 165, 20
    sx = 700                                  # the background stars, "infinitely" far: drawn as a strip
    lat_b, lat_c = 52.5, -33.9
    B = (ex + re * math.cos(math.radians(lat_b)), ey - re * math.sin(math.radians(lat_b)))
    C = (ex + re * math.cos(math.radians(lat_c)), ey - re * math.sin(math.radians(lat_c)))
    def hit(P):                               # the line from P through the Moon's center, to the star strip
        t = (sx - P[0]) / (mx - P[0]); return (sx, P[1] + (my - P[1]) * t)
    hb, hc = hit(B), hit(C)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="lp1t lp1d"><title id="lp1t">Two observers see the Moon against different stars</title>'
         '<desc id="lp1d">Side view, not to scale. Observers in Berlin, in the north, and in Cape Town, in the south, look at the Moon at the same instant. Their lines of sight cross at the Moon and continue to the distant stars, where they land in different places: Berlin sees the Moon lower among the stars, Cape Town higher. The angle between the two lines at the Moon is the parallax.</desc>', MARK]
    # star strip
    s.append(f'<rect x="{sx - 6}" y="20" width="44" height="{H - 60}" rx="6" style="fill:color-mix(in srgb, var(--f-muted) 10%, transparent)"/>')
    for i, (dx, y) in enumerate(((4, 40), (22, 70), (10, 104), (28, 140), (6, 178), (20, 212), (30, 246), (8, 262))):
        s.append(f'<circle cx="{sx + dx}" cy="{y}" r="{1.8 if i % 2 else 2.4}" style="fill:var(--f-muted)"/>')
    s.append(f'<text class="lbl sm" x="{sx + 16}" y="{H - 22}" text-anchor="middle">distant stars</text>')
    # lines of sight
    for P, h in ((B, hb), (C, hc)):
        s.append(f'<line class="sight" x1="{f(P[0])}" y1="{f(P[1])}" x2="{f(h[0])}" y2="{f(h[1])}"/>')
    # the Earth and the two observers
    s.append(f'<circle class="earth" cx="{ex}" cy="{ey}" r="{re}"/><text class="lbl" x="{ex}" y="{ey + 5}" text-anchor="middle" style="fill:#fff">Earth</text>')
    for P, name, dy in ((B, 'Berlin', -10), (C, 'Cape Town', 20)):
        s.append(f'<circle cx="{f(P[0])}" cy="{f(P[1])}" r="4" class="dotc2"/><text class="lbl sm" x="{f(P[0] + 6)}" y="{f(P[1] + dy)}">{name}</text>')
    # the Moon, and the parallax angle at it
    s.append(f'<circle class="moon" cx="{mx}" cy="{my}" r="{rm}"/><text class="lbl" x="{mx}" y="{my - rm - 12}" text-anchor="middle">Moon</text>')
    a_b = math.atan2(hb[1] - my, hb[0] - mx); a_c = math.atan2(hc[1] - my, hc[0] - mx); ra = 92
    s.append(f'<path class="dim strong" d="M{f(mx + ra*math.cos(a_c))},{f(my + ra*math.sin(a_c))} A{ra},{ra} 0 0,1 {f(mx + ra*math.cos(a_b))},{f(my + ra*math.sin(a_b))}"/>')
    s.append(f'<text class="lbl" x="{mx + ra + 6}" y="{my + 5}">p</text>')
    # where each one sees the Moon among the stars
    for h, who in ((hb, 'Berlin sees the Moon here'), (hc, 'Cape Town sees it here')):
        s.append(f'<circle cx="{f(h[0])}" cy="{f(h[1])}" r="9" style="fill:none;stroke:var(--f-moon-line);stroke-width:1.6;stroke-dasharray:3 2"/>')
        s.append(f'<text class="lbl sm" x="{f(h[0] - 14)}" y="{f(h[1] + 4)}" text-anchor="end">{who}</text>')
    s.append(f'<text class="lbl sm" x="10" y="{H - 8}">side view · the Earth hugely too big and the Moon far too close · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def baseline():
    """Side view of the Earth with the Moon far off to the right. The straight line Berlin to Cape Town (the chord) is slanted to the
    Moon's direction; only its square-on part, across the line of sight, makes the shift. That part is what the app's
    'Earth seen square-on' picture shows."""
    W, H = 760, 330
    ex, ey, re = 250, 165, 115
    lat_b, lat_c, tilt = 52.5, -33.9, -26         # the Moon's direction tilted well away from square to the chord, so the square-on part is visibly shorter
    B = (ex + re * math.cos(math.radians(lat_b)), ey - re * math.sin(math.radians(lat_b)))
    C = (ex + re * math.cos(math.radians(lat_c)), ey - re * math.sin(math.radians(lat_c)))
    t = math.radians(tilt); d = (math.cos(t), -math.sin(t)); n = (math.sin(t), math.cos(t))       # toward the Moon; square-on (down)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="lp2t lp2d"><title id="lp2t">Only the square-on part of the baseline counts</title>'
         '<desc id="lp2d">Side view of the Earth with the Moon far away to the right. The straight line between Berlin and Cape Town is slanted to the direction of the Moon. Dotted lines from each city toward the Moon mark off the part of that line that lies square-on, across the line of sight: that part, shorter than the straight line, is the baseline that makes the shift.</desc>', MARK]
    s.append(f'<circle class="earth" cx="{ex}" cy="{ey}" r="{re}"/><text class="lbl" x="{ex - 30}" y="{ey + 5}" text-anchor="middle" style="fill:#fff">Earth</text>')
    s.append(f'<line class="chord" x1="{f(B[0])}" y1="{f(B[1])}" x2="{f(C[0])}" y2="{f(C[1])}"/>')
    # a reference line square-on to the Moon's direction, to the right of the Earth
    ox = ex + re + 120
    def proj(P):          # where P's line toward the Moon meets the square-on reference line through (ox, ey)
        k = ((ox - P[0]) * d[0] + (ey - P[1]) * d[1]); return (P[0] + d[0] * k, P[1] + d[1] * k)
    pb, pc = proj(B), proj(C)
    for P, q in ((B, pb), (C, pc)):
        s.append(f'<line class="guide-l" x1="{f(P[0])}" y1="{f(P[1])}" x2="{f(q[0])}" y2="{f(q[1])}"/>')
    s.append(f'<line class="lead" x1="{f(pb[0])}" y1="{f(pb[1])}" x2="{f(pc[0])}" y2="{f(pc[1])}"/>')
    # tick marks, and the label
    for q in (pb, pc):
        s.append(f'<line class="dim" x1="{f(q[0] - d[0]*7)}" y1="{f(q[1] - d[1]*7)}" x2="{f(q[0] + d[0]*7)}" y2="{f(q[1] + d[1]*7)}"/>')
    mid = ((pb[0] + pc[0]) / 2, (pb[1] + pc[1]) / 2)
    s.append(f'<text class="lbl" x="{f(mid[0] + 16)}" y="{f(mid[1] - 8)}" style="fill:#d2691e">the square-on part:</text><text class="lbl" x="{f(mid[0] + 16)}" y="{f(mid[1] + 10)}" style="fill:#d2691e">the baseline that counts</text>')
    # the Moon's direction
    ax0 = (ox + 40, ey - 120)
    s.append(f'<path class="arrow" marker-end="url(#lph)" d="M{f(ax0[0])},{f(ax0[1])} L{f(ax0[0] + d[0]*170)},{f(ax0[1] + d[1]*170)}"/>')
    s.append(f'<text class="lbl sm" x="{f(ax0[0] + d[0]*170 + 6)}" y="{f(ax0[1] + d[1]*170 + 18)}" text-anchor="end">to the Moon, far away</text>')
    for P, name, dx, anc in ((B, 'Berlin', 10, 'start'), (C, 'Cape Town', 10, 'start')):
        s.append(f'<circle cx="{f(P[0])}" cy="{f(P[1])}" r="4.5" class="dotc2"/><text class="lbl sm" x="{f(P[0] + dx)}" y="{f(P[1] + (-8 if name == "Berlin" else 20))}" text-anchor="{anc}">{name}</text>')
    s.append(f'<text class="lbl sm" x="{f(ex - re + 40)}" y="{ey + re + 34}">yellow: the straight line between the cities, through the Earth</text>')
    s.append(f'<text class="lbl sm" x="{W - 10}" y="{H - 8}" text-anchor="end">side view · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def triangle():
    """The long thin triangle: the square-on baseline b at one end, the Moon at the other, the angle p at the Moon; p = b / d."""
    W, H = 760, 220
    bx, cy, hb = 80, 105, 52
    mx = 650
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="lp3t lp3d"><title id="lp3t">A long thin triangle</title>'
         '<desc id="lp3d">The square-on baseline b on the left, between the two observers, and the Moon at distance d on the right. Lines from the two ends of the baseline meet at the Moon at the small angle p. In radians, p is very nearly b divided by d.</desc>']
    s.append(f'<path class="wedge" d="M{bx},{cy - hb} L{mx},{cy} L{bx},{cy + hb} Z"/>')
    s.append(f'<line class="sight" x1="{bx}" y1="{cy - hb}" x2="{mx}" y2="{cy}"/><line class="sight" x1="{bx}" y1="{cy + hb}" x2="{mx}" y2="{cy}"/>')
    s.append(f'<line class="lead" x1="{bx}" y1="{cy - hb}" x2="{bx}" y2="{cy + hb}"/>')
    s.append(f'<circle cx="{bx}" cy="{cy - hb}" r="4.5" class="dotc2"/><circle cx="{bx}" cy="{cy + hb}" r="4.5" class="dotc2"/>')
    s.append(f'<text class="lbl sm" x="{bx - 10}" y="{cy - hb + 5}" text-anchor="end">Berlin</text><text class="lbl sm" x="{bx - 10}" y="{cy + hb + 5}" text-anchor="end">Cape Town</text>')
    s.append(f'<text class="lbl" x="{bx + 10}" y="{cy + 5}" style="fill:#d2691e">b</text>')
    s.append(f'<circle class="moon" cx="{mx}" cy="{cy}" r="16"/><text class="lbl sm" x="{mx + 24}" y="{cy + 5}">Moon</text>')
    ra = 170; a = math.atan2(hb, mx - bx)
    s.append(f'<path class="dim" d="M{f(mx - ra*math.cos(a))},{f(cy - ra*math.sin(a))} A{ra},{ra} 0 0,0 {f(mx - ra*math.cos(a))},{f(cy + ra*math.sin(a))}"/>')
    s.append(f'<text class="lbl" x="{mx - ra - 16}" y="{cy + 5}">p</text>')
    s.append(f'<path class="dim" d="M{bx},{cy + hb + 34} H{mx}"/><path class="dim" d="M{bx},{cy + hb + 28} v12 M{mx},{cy + hb + 28} v12"/><text class="lbl" x="{(bx + mx) / 2}" y="{cy + hb + 26}" text-anchor="middle">d</text>')
    s.append(f'<text class="lbl sm" x="{W - 10}" y="{H - 8}" text-anchor="end">the angle hugely exaggerated</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('lp_sight', sight), ('lp_baseline', baseline), ('lp_triangle', triangle)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('lunar parallax figures written')
