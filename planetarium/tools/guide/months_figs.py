"""Figures for guide/months.html: why the month from full Moon to full Moon (synodic) is longer than the month from star to star
(sidereal), seen from above the North Pole; and the 'lapping' picture that ties the synodic month and the lunar day together.
Sizes and angles are not to scale (the Earth's step round the Sun is exaggerated); no figure gives a measured value."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))

DEFS = ('<defs><marker id="moh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--f-ink)"/></marker>'
        '<marker id="moho" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" style="fill:#d2691e"/></marker>'
        '<marker id="mohs" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
        '<path d="M0,0 L10,5 L0,10 z" style="fill:var(--f-sun-line)"/></marker></defs>')

def arc(cx, cy, r, a0, a1, n=40):
    """Points of a counterclockwise arc (math angles, radians; screen y down)."""
    return 'M' + ' L'.join(f'{f(cx + r*math.cos(a0 + (a1-a0)*i/n))},{f(cy - r*math.sin(a0 + (a1-a0)*i/n))}' for i in range(n + 1))

def earth(s, x, y, r=17):
    s.append(f'<circle class="earth" cx="{f(x)}" cy="{f(y)}" r="{r}"/><text x="{f(x)}" y="{f(y+4)}" text-anchor="middle" '
             f'style="font: 600 10.5px var(--sans); fill:#fff">NP</text>')

def months():
    """The Sun on the left, the Earth at two places on its orbit one sidereal month apart (the step exaggerated). At the start the
    Moon is full (opposite the Sun) and lined up with a far-off star. One sidereal month later the Moon is lined up with the same
    star again, but it is not yet opposite the Sun: it must go a little farther (orange) to be full again."""
    W, H = 760, 525
    sx, sy, RO = 100, 370, 440
    step = math.radians(30)                        # the Earth's step in a month, exaggerated (really about 27 degrees)
    rm = 84                                        # the Moon's orbit round the Earth, hugely exaggerated
    A = (sx + RO, sy)
    B = (sx + RO*math.cos(step), sy - RO*math.sin(step))
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="mo1t mo1d"><title id="mo1t">Sidereal month and synodic month</title>'
         '<desc id="mo1d">Seen from above the North Pole. The Sun is on the left; the Earth moves counterclockwise round it. At the start the Moon is full, on the far side of the Earth from the Sun, and lined up with a far-off star. One sidereal month later the Earth has moved on round the Sun. The Moon is lined up with the same far-off star again, but it is not yet opposite the Sun, so it must go a little farther round the Earth before it is full again: that is the synodic month.</desc>', DEFS]
    # the Earth's orbit, and the angle it moves through
    s.append(f'<path class="orbitc" d="{arc(sx, sy, RO, math.radians(-14), math.radians(44), 80)}"/>')
    s.append(f'<path class="arrow" marker-end="url(#moh)" d="{arc(sx, sy, RO - 50, math.radians(9), step - math.radians(9), 30)}"/>')
    lx, ly = sx + (RO - 62)*math.cos(step/2), sy - (RO - 62)*math.sin(step/2)
    s.append(f'<text class="lbl sm" x="{f(lx)}" y="{f(ly)}" text-anchor="end">the Earth moves on round the Sun</text>')
    s.append(f'<path class="dim" d="{arc(sx, sy, 58, 0, step, 20)}"/><text class="lbl" x="{f(sx + 66)}" y="{f(sy - 14)}" style="fill:#d2691e">α</text>')
    s.append(f'<line class="path" x1="{sx}" y1="{sy}" x2="{f(A[0])}" y2="{f(A[1])}"/><line class="path" x1="{sx}" y1="{sy}" x2="{f(B[0])}" y2="{f(B[1])}"/>')
    s.append(f'<circle class="sun" cx="{sx}" cy="{sy}" r="34"/><text class="lbl" x="{sx}" y="{sy + 56}" text-anchor="middle">Sun</text>')
    for (ex, ey), when in ((A, 'today'), (B, '1 sidereal month later')):
        s.append(f'<circle class="orbitc" cx="{f(ex)}" cy="{f(ey)}" r="{rm}"/>')
        # the direction of a far-off star: the same direction from both places
        s.append(f'<line class="sight" x1="{f(ex + 20)}" y1="{f(ey)}" x2="{W - 40}" y2="{f(ey)}" style="stroke-dasharray:6 4"/>'
                 f'<text x="{W - 30}" y="{f(ey + 6)}" text-anchor="middle" style="font: 18px var(--sans); fill:var(--f-ray-u)">★</text>')
        earth(s, ex, ey)
    s.append(f'<text class="lbl sm" x="{f(A[0])}" y="{f(A[1] + rm + 22)}" text-anchor="middle">the Earth today</text>')
    s.append(f'<text class="lbl sm" x="{f(B[0] - rm - 10)}" y="{f(B[1] - 18)}" text-anchor="end">the Earth</text>'
             f'<text class="lbl sm" x="{f(B[0] - rm - 10)}" y="{f(B[1] - 2)}" text-anchor="end">1 sidereal month later</text>')
    s.append(f'<text class="lbl sm" x="{W - 48}" y="{f(A[1] - 10)}" text-anchor="end">to a far-off star</text>')
    s.append(f'<text class="lbl sm" x="{W - 48}" y="{f(B[1] - 10)}" text-anchor="end">to the same star</text>')
    # the Moon: full today (opposite the Sun, lined up with the star)
    s.append(f'<circle class="moon" cx="{f(A[0] + rm)}" cy="{f(A[1])}" r="10"/>')
    s.append(f'<text class="lbl sm" x="{f(A[0] + rm + 4)}" y="{f(A[1] + 28)}">full Moon</text>')
    # one sidereal month later: lined up with the star again, not yet opposite the Sun
    m1 = (B[0] + rm, B[1])
    s.append(f'<circle class="moon faint" cx="{f(m1[0])}" cy="{f(m1[1])}" r="10"/>')
    s.append(f'<text class="lbl sm" x="{f(m1[0] + 4)}" y="{f(m1[1] + 28)}">back by the same star,</text>'
             f'<text class="lbl sm" x="{f(m1[0] + 4)}" y="{f(m1[1] + 44)}">but not yet full</text>')
    # the line from the Sun through the Earth, out to where the Moon is full again
    m2 = (B[0] + rm*math.cos(step), B[1] - rm*math.sin(step))
    ox, oy = B[0] + (rm + 40)*math.cos(step), B[1] - (rm + 40)*math.sin(step)
    s.append(f'<line class="path" x1="{f(B[0])}" y1="{f(B[1])}" x2="{f(ox)}" y2="{f(oy)}"/>')
    s.append(f'<path class="extra" marker-end="url(#moho)" d="{arc(B[0], B[1], rm + 16, math.radians(3), step - math.radians(2), 16)}"/>')
    s.append(f'<circle class="moon" cx="{f(m2[0])}" cy="{f(m2[1])}" r="10"/>')
    s.append(f'<text class="lbl sm" x="{f(m2[0] + 30)}" y="{f(m2[1] - 22)}">full again: 1 synodic month</text>')
    s.append(f'<path class="dim" d="{arc(B[0], B[1], 44, 0, step, 12)}"/><text class="lbl" x="{f(B[0] + 50)}" y="{f(B[1] - 8)}" style="fill:#d2691e">α</text>')
    # the Moon's motion round the Earth
    s.append(f'<path class="arrow" marker-end="url(#moh)" d="{arc(A[0], A[1], rm + 12, math.radians(30), math.radians(80), 16)}"/>')
    s.append(f'<text class="lbl sm" x="{f(A[0] + 30)}" y="{f(A[1] - rm - 22)}">the Moon goes round the Earth</text>')
    s.append(f'<text class="lbl sm" x="{W - 10}" y="{H - 10}" text-anchor="end">looking down on the North Pole (NP) · the Earth’s step and the Moon’s orbit exaggerated · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def laps():
    """Two panels, both from above the North Pole with the Earth in the middle. Left: the Sun and the Moon start together; both move
    counterclockwise against the stars, the Moon much faster; the Moon catches the Sun again after one full lap and a bit more
    (one synodic month). Right: your meridian and the Moon start together; the turning Earth carries the meridian round much faster
    than the Moon moves; it catches the Moon again after one full turn and a bit more (one lunar day)."""
    W, H = 760, 405
    d = math.radians(42)                            # the slow one's step, exaggerated
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="mo2t mo2d"><title id="mo2t">A fast runner lapping a slow one</title>'
         '<desc id="mo2d">Two panels seen from above the North Pole. Left: the Moon and the Sun start in the same direction; the Moon runs once round the sky and a bit more to catch the Sun, which has moved on a little: one synodic month. Right: your meridian and the Moon start in the same direction; the turning Earth carries your meridian once round and a bit more to catch the Moon again: one lunar day.</desc>', DEFS]
    def panel(cx, title, fast, slow, fast_lab, slow_lab, catch, person):
        cy, R = 200, 112
        a0 = math.radians(90)
        s.append(f'<text class="lbl" x="{cx}" y="24" text-anchor="middle">{title}</text>')
        s.append(f'<circle class="orbitc" cx="{cx}" cy="{cy}" r="{R}"/>')
        # the slow one: a short arc along the ring
        s.append(f'<path class="arrow" marker-end="url(#mohs)" style="stroke:var(--f-sun-line); stroke-width:2.4" d="{arc(cx, cy, R + 14, a0 + 0.05, a0 + d - 0.05, 16)}"/>')
        # the fast one: a spiral, one full lap then the bit more (orange)
        r0, r1 = 44, 92
        tot = 2*math.pi + d
        def sp(t0, t1, n): return 'M' + ' L'.join(
            f'{f(cx + (r0 + (r1-r0)*(t0 + (t1-t0)*i/n)/tot)*math.cos(a0 + t0 + (t1-t0)*i/n))},'
            f'{f(cy - (r0 + (r1-r0)*(t0 + (t1-t0)*i/n)/tot)*math.sin(a0 + t0 + (t1-t0)*i/n))}' for i in range(n + 1))
        s.append(f'<path class="arrow" style="stroke-width:1.8" d="{sp(0.08, 2*math.pi, 120)}"/>')
        s.append(f'<path class="extra" marker-end="url(#moho)" d="{sp(2*math.pi, tot - 0.03, 14)}"/>')
        earth(s, cx, cy, 22)
        if person:          # the person standing at the top of the Earth, the meridian overhead
            s.append(f'<g transform="translate({cx},{cy - 22}) scale(1.3)" style="fill:none; stroke:var(--f-ink); stroke-width:1.6; stroke-linecap:round">'
                     '<path d="M-4,0 L0,-8 L4,0 M0,-8 V-16 M-5,-13 H5"/><circle cx="0" cy="-19.5" r="3.2" style="fill:var(--f-ink); stroke:none"/></g>')
        # start: both together at the top; finish: the slow one's new place
        bx, by = cx + R*math.cos(a0), cy - R*math.sin(a0)
        fx, fy = cx + R*math.cos(a0 + d), cy - R*math.sin(a0 + d)
        s.append(f'<line class="path" x1="{cx}" y1="{cy}" x2="{f(bx)}" y2="{f(by)}"/><line class="path" x1="{cx}" y1="{cy}" x2="{f(fx)}" y2="{f(fy)}"/>')
        s.append(slow(bx, by, True) + slow(fx, fy, False))
        s.append(f'<text class="lbl sm" x="{f(bx + 16)}" y="{f(by - 8)}">start: together</text>')
        s.append(f'<text class="lbl sm" x="{f(fx - 16)}" y="{f(fy - 8)}" text-anchor="end">{slow_lab}</text>')
        s.append(f'<text class="lbl sm" x="{cx}" y="{cy + R + 30}" text-anchor="middle">{fast_lab}</text>')
        s.append(f'<text class="lbl sm" x="{cx}" y="{cy + R + 47}" text-anchor="middle" style="fill:#d2691e">{catch}</text>')
    sun = lambda x, y, first: f'<circle class="sun" cx="{f(x)}" cy="{f(y)}" r="{11 if first else 11}" style="{"opacity:.5" if first else ""}"/>'
    moon = lambda x, y, first: f'<circle class="moon{" faint" if first else ""}" cx="{f(x)}" cy="{f(y)}" r="9"/>'
    panel(190, 'The Moon catches the Sun', None, sun, 'the Moon: one full lap and a bit more', 'the Sun has moved on',
          'caught again after 1 synodic month', False)
    panel(570, 'Your meridian catches the Moon', None, moon, 'your meridian: one full turn and a bit more', 'the Moon has moved on',
          'caught again after 1 lunar day', True)
    s.append(f'<text class="lbl sm" x="{W - 10}" y="{H - 10}" text-anchor="end">looking down on the North Pole (NP) · steps exaggerated · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('mo_months', months), ('mo_laps', laps)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('months figures written')
