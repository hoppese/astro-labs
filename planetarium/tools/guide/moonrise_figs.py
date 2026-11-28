"""Figures for guide/moonrise.html: the Moon rising straight up on the equator and at a slant farther north; why the lunar day is
longer than 24 hours (from above); from angular size to distance. Sizes are not to scale (the diagrams must not hand over the angle)."""
import math, os
def f(x): return f"{x:.1f}"
HERE = os.path.dirname(os.path.abspath(__file__))

def rise():
    """Two panels: on the equator the Moon rises straight up and clears the horizon after moving one diameter; at latitude 40 degrees
    it rises at a slant (50 degrees to the horizon) and must travel farther along its path. The Moon at mark 1 is below the horizon:
    drawn as a dashed outline through the ground."""
    W, H = 760, 290
    rm = 28
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="mr1t mr1d"><title id="mr1t">The Moon rising on the equator and farther north</title>'
         '<desc id="mr1d">Left: on the equator the rising Moon moves straight up; from the moment its top edge touches the horizon to the moment its bottom edge clears it, it moves one diameter. Right: at latitude 40 degrees north it rises at a slant, and to clear the horizon it must move farther along its slanted path.</desc>']
    def panel(x0, title, tilt_deg):
        hy = 150; cx = x0 + 175; gw = 320; gx = x0 + 20
        s.append(f'<text class="lbl" x="{cx}" y="26" text-anchor="middle">{title}</text>')
        t = math.radians(tilt_deg); dx, dy = math.cos(t), -math.sin(t)
        L = 2 * rm / math.sin(t)
        c1 = (cx - dx * L / 2, hy + rm); c2 = (cx + dx * L / 2, hy - rm)
        s.append(f'<line class="path" x1="{f(c1[0] - dx*70)}" y1="{f(c1[1] - dy*70)}" x2="{f(c2[0] + dx*60)}" y2="{f(c2[1] + dy*60)}"/>')
        s.append(f'<rect class="ground" x="{gx}" y="{hy}" width="{gw}" height="78"/><line class="horizon" x1="{gx}" y1="{hy}" x2="{gx+gw}" y2="{hy}"/>')
        s.append(f'<circle class="moon hidden" cx="{f(c1[0])}" cy="{f(c1[1])}" r="{rm}"/><circle class="moon" cx="{f(c2[0])}" cy="{f(c2[1])}" r="{rm}"/>')
        s.append(f'<path class="arrow light" d="M{f(c1[0])},{f(c1[1])} L{f(c2[0])},{f(c2[1])}"/>')
        s.append(f'<circle cx="{f(c1[0])}" cy="{f(c1[1])}" r="2.5" class="dotl"/><circle cx="{f(c2[0])}" cy="{f(c2[1])}" r="2.5" class="dotc2"/>')
        s.append(f'<text class="lbl sm" x="{f(c2[0] + rm + 8)}" y="{f(c2[1] - 6)}">mark 2: the bottom</text><text class="lbl sm" x="{f(c2[0] + rm + 8)}" y="{f(c2[1] + 10)}">edge clears</text>')
        s.append(f'<text class="lbl sm onground" x="{gx + 10}" y="{hy + 24}">mark 1 (dashed):</text><text class="lbl sm onground" x="{gx + 10}" y="{hy + 41}">top edge on</text><text class="lbl sm onground" x="{gx + 10}" y="{hy + 58}">the horizon</text>')
        s.append(f'<text class="lbl sm" x="{cx}" y="{hy + 100}" text-anchor="middle">{"the path goes straight up: one diameter" if tilt_deg == 90 else "the path is tilted: farther to go"}</text>')
    panel(0, 'On the equator', 90)
    panel(390, 'At 40° north', 50)
    s.append('</svg>')
    return '\n'.join(s)

def lunarday():
    """From above the north pole: the Earth turns once against the stars, but meanwhile the Moon has moved on along its orbit, so the
    Earth must turn a little farther before the Moon is back in the same place in your sky."""
    W, H = 760, 380
    cx, cy, re = 260, 190, 52
    R = 165
    a1, a2 = math.radians(-8), math.radians(-8 + 22)       # the Moon's two places (its daily motion exaggerated: really about 13 degrees)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="mr2t mr2d"><title id="mr2t">Why the lunar day is longer than 24 hours</title>'
         '<desc id="mr2d">Seen from above the north pole: the Earth turns, and the Moon moves along its orbit in the same direction. When the Earth has turned once, the Moon has moved on, so the Earth must turn a little farther to bring the Moon back overhead.</desc>'
         '<defs><marker id="mrh" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="ahead"/></marker></defs>']
    s.append(f'<circle class="orbitc" cx="{cx}" cy="{cy}" r="{R}"/>')
    s.append(f'<circle class="earth" cx="{cx}" cy="{cy}" r="{re}"/><text class="lbl" x="{cx}" y="{cy+5}" text-anchor="middle" style="fill:#fff">Earth</text>')
    for a, lab, cls in ((a1, 'the Moon today', 'moon faint'), (a2, 'the Moon one day later', 'moon')):
        mx, my = cx + R * math.cos(a), cy - R * math.sin(a)
        s.append(f'<circle class="{cls}" cx="{f(mx)}" cy="{f(my)}" r="16"/><text class="lbl sm" x="{f(mx+24)}" y="{f(my+4)}">{lab}</text>')
        ox, oy = cx + re * math.cos(a), cy - re * math.sin(a)
        s.append(f'<line class="sight" x1="{f(ox)}" y1="{f(oy)}" x2="{f(mx - 16*math.cos(a))}" y2="{f(my + 16*math.sin(a))}"/>')
    # the observer on the Earth, the extra turn
    r2 = re + 34
    s.append(f'<path class="extra" d="M{f(cx + r2*math.cos(a1))},{f(cy - r2*math.sin(a1))} A{r2},{r2} 0 0,0 {f(cx + r2*math.cos(a2))},{f(cy - r2*math.sin(a2))}"/>')
    am = (a1 + a2) / 2
    s.append(f'<text class="lbl sm" x="{f(cx + (r2+10)*math.cos(am))}" y="{f(cy - (r2+10)*math.sin(am))}">the extra turn</text>')
    # the direction of the Earth's spin and of the Moon's motion
    s.append(f'<path class="arrow" marker-end="url(#mrh)" d="M{f(cx + (re+8)*math.cos(math.radians(200)))},{f(cy - (re+8)*math.sin(math.radians(200)))} A{re+8},{re+8} 0 0,0 {f(cx + (re+8)*math.cos(math.radians(250)))},{f(cy - (re+8)*math.sin(math.radians(250)))}"/>')
    s.append(f'<text class="lbl sm" x="{f(cx - re - 70)}" y="{f(cy + re + 30)}">the Earth spins</text>')
    s.append(f'<path class="arrow" marker-end="url(#mrh)" d="M{f(cx + (R+16)*math.cos(math.radians(40)))},{f(cy - (R+16)*math.sin(math.radians(40)))} A{R+16},{R+16} 0 0,0 {f(cx + (R+16)*math.cos(math.radians(62)))},{f(cy - (R+16)*math.sin(math.radians(62)))}"/>')
    s.append(f'<text class="lbl sm" x="{f(cx + (R+22)*math.cos(math.radians(58)))}" y="{f(cy - (R+22)*math.sin(math.radians(58)) - 6)}">the Moon moves along its orbit</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-10}" text-anchor="end">seen from above the North Pole · the Moon’s daily step exaggerated · not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def distance():
    """Small angle: an object of diameter D at distance d covers the angle D / d radians."""
    W, H = 760, 220
    ex, cy = 70, 110
    mx, rm = 640, 46
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="mr3t mr3d"><title id="mr3t">From angular size to distance</title>'
         '<desc id="mr3d">An eye on the left, the Moon on the right. Lines from the eye to the top and bottom of the Moon make a thin wedge; its angle in radians is the Moon\'s diameter divided by its distance.</desc>']
    s.append(f'<path class="wedge" d="M{ex},{cy} L{mx},{cy-rm} L{mx},{cy+rm} Z"/>')
    s.append(f'<line class="sight" x1="{ex}" y1="{cy}" x2="{mx}" y2="{cy-rm}"/><line class="sight" x1="{ex}" y1="{cy}" x2="{mx}" y2="{cy+rm}"/>')
    s.append(f'<circle class="moon" cx="{mx}" cy="{cy}" r="{rm}"/><circle cx="{ex}" cy="{cy}" r="5" class="dotc2"/><text class="lbl sm" x="{ex}" y="{cy+24}" text-anchor="middle">you</text>')
    s.append(f'<path class="dim" d="M{mx+rm+14},{cy-rm} h8 V{cy+rm} h-8"/><text class="lbl" x="{mx+rm+30}" y="{cy+5}">D</text>')
    s.append(f'<path class="dim" d="M{ex},{cy+rm+40} H{mx}"/><path class="dim" d="M{ex},{cy+rm+34} v12 M{mx},{cy+rm+34} v12"/><text class="lbl" x="{(ex+mx)/2}" y="{cy+rm+32}" text-anchor="middle">d</text>')
    s.append(f'<path class="dim" d="M{ex+70},{f(cy-70*rm/(mx-ex))} A70,70 0 0,1 {ex+70},{f(cy+70*rm/(mx-ex))}"/><text class="lbl" x="{ex+82}" y="{cy+5}">θ</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">the angle hugely exaggerated</text>')
    s.append('</svg>')
    return '\n'.join(s)

for name, fn in (('mr_rise', rise), ('mr_lunarday', lunarday), ('mr_distance', distance)):
    open(os.path.join(HERE, name + '.svg.html'), 'w').write(fn())
print('moonrise figures written')
