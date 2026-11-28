"""Figures for guide/eclipse-timing.html (and eclipse-shape): the Earth's shadow from the side, and as seen from the Earth.
Geometry is computed, not drawn by eye: tangent lines to the Sun and the Earth, umbra/penumbra widths at the Moon's distance in the
real proportions (umbra about 2.7 Moon diameters, penumbra about 4.6), the Sun shrunk and brought close so it fits (not to scale)."""
import math
def f(x): return f"{x:.1f}"

def side():
    """Side view. The Sun is drawn big and near with a break (≈) in its rays; past the break the rays have the slope that gives the
    real proportions at the Moon: each shadow edge moves by one Moon RADIUS between the Earth and the Moon, so the umbra there is
    (Earth − 1) and the penumbra (Earth + 1) Moon diameters, with the Earth 3.67 Moon diameters across."""
    W, H, cy = 760, 330, 165
    xs, R = 52, 60            # the Sun, drawn (not to scale)
    xb = 190                  # the break in the rays
    xe, r = 430, 26           # Earth
    xm = 590                  # where the Moon's orbit crosses
    rm = r / 3.67
    sl = rm / (xm - xe)       # slope of every shadow edge past the break
    rd = r / 3.0              # the Moon as DRAWN: too big on purpose, so that the picture does not hand over the ratio the lab measures
    xr = 745
    def outer(x): return r - sl * (x - xe)          # half-height of the umbra boundary (converging)
    def inner(x): return r + sl * (x - xe)          # half-height of the penumbra boundary (diverging)
    hu, hp = outer(xm), inner(xm)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs1t fs1d"><title id="fs1t">The Earth\'s shadow seen from the side</title>'
         f'<desc id="fs1d">Light from the top and bottom edges of the Sun passes the Earth. The umbra is a cone that narrows behind the Earth; the penumbra spreads around it. The Moon\'s path crosses both. The Sun is drawn much too near and too small.</desc>']
    s.append(f'<path class="pen" d="M{xe},{f(cy-r)} L{xr},{f(cy-inner(xr))} L{xr},{f(cy+inner(xr))} L{xe},{f(cy+r)} Z"/>')
    s.append(f'<path class="umb" d="M{xe},{f(cy-r)} L{xr},{f(cy-outer(xr))} L{xr},{f(cy+outer(xr))} L{xe},{f(cy+r)} Z"/>')
    for sg in (-1, 1):
        # outer ray: Sun's top edge -> Earth's top edge (umbra boundary); inner ray: Sun's top edge -> Earth's bottom edge (penumbra boundary)
        yo_b = cy + sg * (r + sl * (xe - xb)); yi_b = cy - sg * (r - sl * (xe - xb))
        s.append(f'<path class="ray u" d="M{xs},{f(cy+sg*R*0.98)} L{xb-8},{f(yo_b)} M{xb+8},{f(yo_b)} L{xr},{f(cy + sg*outer(xr))}"/>')
        s.append(f'<path class="ray p" d="M{xs},{f(cy+sg*R*0.98)} L{xb-8},{f(yi_b)} M{xb+8},{f(yi_b)} L{xr},{f(cy - sg*inner(xr))}"/>')
    s.append(f'<text class="lbl sm" x="{xb}" y="{H-14}" text-anchor="middle">≈ distance shortened · not to scale</text>')
    s.append(f'<circle class="sun" cx="{xs}" cy="{cy}" r="{R}"/><text class="lbl" x="{xs}" y="{cy+5}" text-anchor="middle" style="fill:#5a3b00">Sun</text>')
    s.append(f'<circle class="earth" cx="{xe}" cy="{cy}" r="{r}"/><text class="lbl" x="{xe}" y="{cy+r+20}" text-anchor="middle">Earth</text>')
    s.append(f'<line class="orbit" x1="{xm}" y1="22" x2="{xm}" y2="{H-22}"/><text class="lbl sm" x="{xm+8}" y="32">the Moon’s path</text>')
    for y, c in ((cy - 98, 'moon'), (cy, 'moon dim'), (cy + 98, 'moon')):
        s.append(f'<circle class="{c}" cx="{xm}" cy="{y}" r="{f(rd)}"/>')
    s.append(f'<text class="lbl u" x="{xe+48}" y="{cy+5}">umbra</text>')
    s.append(f'<text class="lbl p" x="{xm+26}" y="{f(cy-hp-8)}">penumbra</text><text class="lbl p" x="{xe+90}" y="{f(cy+inner(xe+90)+18)}">penumbra</text>')
    s.append(f'<path class="dim" d="M{xm+3},{f(cy+rd+2)} L{xm+40},{f(cy+hp+46)}"/><text class="lbl sm" x="{xm+44}" y="{f(cy+hp+58)}">the Moon in the umbra: eclipsed</text>')
    s.append('</svg>')
    return '\n'.join(s), hu / rd, hp / rd

def face(hu_m, hp_m):
    """As seen from the Earth: the shadow's cross-section at the Moon, the Moon at the four contacts, labels outside."""
    W, H = 760, 400
    cx, cy, rm = 380, 200, 32
    ru, rp = hu_m * rm, hp_m * rm
    yoff = 12                                  # the Moon passes a little off center
    my = cy + yoff
    half = math.sqrt(ru**2 - yoff**2)
    u1 = cx + half + rm; u2 = cx + half - rm; u3 = cx - half + rm; u4 = cx - half - rm
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs2t fs2d"><title id="fs2t">The four contacts of the Moon with the umbra</title>'
         '<desc id="fs2d">Looking from the Earth: the round umbra inside the paler penumbra. The Moon moves from right to left; four outlines mark first contact, the start of totality, the end of totality and last contact.</desc>']
    s.append(f'<circle class="pen" cx="{cx}" cy="{cy}" r="{f(rp)}"/><circle class="umb" cx="{cx}" cy="{cy}" r="{f(ru)}"/>')
    s.append(f'<line class="orbit" x1="{f(cx+rp+60)}" y1="{my}" x2="{f(cx-rp-60)}" y2="{my}"/>')
    for x in (u1, u2, u3, u4): s.append(f'<circle class="moon ring" cx="{f(x)}" cy="{my}" r="{rm}"/>')
    top, bot = cy - rp - 18, cy + rp + 30
    for x, lab, up in ((u1, 'U1', True), (u3, 'U3', True), (u2, 'U2', False), (u4, 'U4', False)):
        y = top if up else bot
        s.append(f'<line class="guide-l" x1="{f(x)}" y1="{my}" x2="{f(x)}" y2="{f(y + (6 if up else -16))}"/><circle cx="{f(x)}" cy="{my}" r="2.5" style="fill:var(--f-ink)"/>')
        s.append(f'<text class="lbl" x="{f(x)}" y="{f(y)}" text-anchor="middle">{lab}</text>')
    ax = min(cx - rp, u4 - rm) - 14
    s.append(f'<path class="arrow" d="M{f(ax)},{my} h-46 m8,-6 l-8,6 l8,6"/><text class="lbl sm" x="{f(ax-23)}" y="{my-14}" text-anchor="middle">the Moon moves</text>')
    s.append(f'<text class="lbl u" x="{cx}" y="{f(cy-ru+22)}" text-anchor="middle">umbra</text><text class="lbl p" x="{f(cx+rp*0.62)}" y="{f(cy-rp*0.8)}" text-anchor="start">penumbra</text>')
    yb = bot + 26
    s.append(f'<path class="dim" d="M{f(u1-rm)},{yb-8} v8 H{f(u2-rm)} v-8"/><text class="lbl sm" x="{f((u1+u2)/2-rm)}" y="{yb+18}" text-anchor="middle">U1 → U2: the leading edge moves one Moon diameter</text>')
    yt = top - 30
    s.append(f'<path class="dim" d="M{f(u1-rm)},{yt+8} v-8 H{f(u3-rm)} v8"/><text class="lbl sm" x="{f((u1+u3)/2-rm)}" y="{yt-8}" text-anchor="middle">U1 → U3: the leading edge crosses the whole umbra</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def taper():
    """Why the shadow at the Moon is one Moon diameter narrower than the Earth."""
    W, H = 760, 290
    xe, cy, re = 120, 140, 74
    xm = 560; ang = math.radians(6.5)          # exaggerated: the Sun's angular diameter is really 0.53 degrees
    gap = (xm - xe) * math.tan(ang) / 2         # each edge moves in by this much
    top0, bot0 = cy - re, cy + re
    top1, bot1 = top0 + gap, bot0 - gap
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs3t fs3d"><title id="fs3t">Why the shadow narrows by one Moon diameter</title>'
         '<desc id="fs3d">The edges of the umbra close in at the angle the Sun covers in the sky. At the Moon\'s distance the two gaps together are as wide as the Moon, because the Moon covers the same angle as the Sun.</desc>']
    s.append(f'<path class="umb" d="M{xe},{top0} L{xm},{f(top1)} L{xm},{f(bot1)} L{xe},{bot0} Z"/>')
    s.append(f'<line class="guide-l" x1="{xe}" y1="{top0}" x2="{xm+10}" y2="{top0}"/><line class="guide-l" x1="{xe}" y1="{bot0}" x2="{xm+10}" y2="{bot0}"/>')
    s.append(f'<line class="ray u" x1="{xe}" y1="{top0}" x2="{xm}" y2="{f(top1)}"/><line class="ray u" x1="{xe}" y1="{bot0}" x2="{xm}" y2="{f(bot1)}"/>')
    s.append(f'<circle class="earth" cx="{xe}" cy="{cy}" r="{re}"/><text class="lbl" x="{xe}" y="{cy+5}" text-anchor="middle" style="fill:#fff">Earth</text>')
    s.append(f'<text class="lbl u" x="{(xe+xm)/2+30}" y="{cy+5}" text-anchor="middle">umbra</text>')
    # the two gaps at the Moon's distance, and one Moon beside them of the same total size
    for y0, y1 in ((top0, top1), (bot1, bot0)):
        s.append(f'<path class="dim" d="M{xm+14},{f(y0)} h8 V{f(y1)} h-8"/>')
    s.append(f'<text class="lbl sm" x="{xm+30}" y="{f((top0+top1)/2+4)}">gap</text><text class="lbl sm" x="{xm+30}" y="{f((bot0+bot1)/2+4)}">gap</text>')
    rM = gap                                    # a Moon whose diameter is the two gaps together
    mx = xm + 120
    s.append(f'<circle class="moon" cx="{mx}" cy="{cy}" r="{f(rM)}"/><path class="dim" d="M{mx+rM+10},{f(cy-rM)} h8 V{f(cy+rM)} h-8"/>')
    s.append(f'<text class="lbl sm" x="{mx}" y="{f(cy+rM+22)}" text-anchor="middle">the Moon:</text><text class="lbl sm" x="{mx}" y="{f(cy+rM+38)}" text-anchor="middle">gap + gap</text>')
    s.append(f'<path class="dim" d="M{xe},{H-20} H{xm}"/><path class="dim" d="M{xe},{H-26} v12 M{xm},{H-26} v12"/><text class="lbl sm" x="{(xe+xm)/2}" y="{H-28}" text-anchor="middle">the distance to the Moon</text>')
    s.append(f'<text class="lbl sm" x="{xe+86}" y="{top0-10}">each edge closes in at half the angle the Sun covers</text>')
    s.append('</svg>')
    return '\n'.join(s)

a, hu, hp = side()
open(__file__.replace('eclipse_figs.py', 'fig_side.svg.html'), 'w').write(a)
open(__file__.replace('eclipse_figs.py', 'fig_face.svg.html'), 'w').write(face(hu, hp))
open(__file__.replace('eclipse_figs.py', 'fig_taper.svg.html'), 'w').write(taper())
print('umbra half-height / Moon radius', round(hu, 2), 'penumbra', round(hp, 2))
