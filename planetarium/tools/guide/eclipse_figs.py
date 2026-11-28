"""Figures for guide/eclipse-timing.html (and eclipse-shape): the Earth's shadow from the side, and as seen from the Earth.
Geometry is computed, not drawn by eye: tangent lines to the Sun and the Earth, umbra/penumbra widths at the Moon's distance in the
real proportions (umbra about 2.7 Moon diameters, penumbra about 4.6), the Sun shrunk and brought close so it fits (not to scale)."""
import math
def f(x): return f"{x:.1f}"

def side():
    """Side view, two panels from ONE geometry (true tangent lines to the Sun and the Earth): above, the whole line-up with a box round
    the region behind the Earth; below, that box magnified, where the umbra, the penumbra, the Moon and the two nearly parallel lines
    from the Sun's top edge (an Earth width apart) can be read."""
    W = 1000
    xs, R = 84, 72; xe, r = 830, 22; xm = 948; xr = 992; cy = 120
    D = xe - xs
    # the Moon drawn exactly as wide as the umbra narrows between the Earth and the Moon, so that the picture shows
    # Earth = umbra + one Moon (the ratio itself is not the real one: the Earth here is 2.8 Moons across, not 3.7)
    rd = (R - r) / D * (xm - xe)
    def tangent(inner, sg):
        nx = (R + r) / D if inner else (R - r) / D
        n = (nx, sg * math.sqrt(1 - nx * nx))
        p1 = (xs + R * n[0], cy + R * n[1]); p2 = (xe - r * n[0], cy - r * n[1]) if inner else (xe + r * n[0], cy + r * n[1])
        return p1, p2
    def y_at(ln, x): (x1, y1), (x2, y2) = ln; return y1 + (y2 - y1) * (x - x1) / (x2 - x1)
    ot, ob, it_, ib = tangent(False, -1), tangent(False, 1), tangent(True, -1), tangent(True, 1)
    # the box, and the magnified panel's mapping
    bx0, bx1, bh = xe - 64, xr, 48
    k = 3.5; X0 = (W - (bx1 - bx0) * k) / 2; Y0 = 250 + bh * k + 30
    def Z(x, y): return X0 + (x - bx0) * k, Y0 + (y - cy) * k
    H = int(Y0 + bh * k + 40)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs1t fs1d"><title id="fs1t">The Earth\'s shadow seen from the side</title>'
         '<desc id="fs1d">Above: the Sun, the Earth and the lines that graze both. Below, magnified: the umbra narrowing behind the Earth, the penumbra widening around it, the Moon\'s path crossing both, and at the Moon the umbra pulled in by half a Moon from the Earth\'s top and bottom.</desc>'
         f'<defs><clipPath id="zc"><rect x="{f(X0)}" y="{f(Y0 - bh*k)}" width="{f((bx1-bx0)*k)}" height="{f(2*bh*k)}"/></clipPath></defs>']
    # ---- overview ----
    def poly(pts, cls, T=lambda x, y: (x, y)): return f'<path class="{cls}" d="M' + ' L'.join(f'{f(T(x, y)[0])},{f(T(x, y)[1])}' for x, y in pts) + ' Z"/>'
    def shadow(T, xend):
        out = [poly([ot[1], ib[1], (xend, y_at(ib, xend)), (xend, y_at(it_, xend)), it_[1], ob[1]], 'pen', T),
               poly([ot[1], (xend, y_at(ot, xend)), (xend, y_at(ob, xend)), ob[1]], 'umb', T)]
        for ln, cls in ((ot, 'u'), (ob, 'u'), (it_, 'p'), (ib, 'p')):
            x1, y1 = T(*ln[0]); x2, y2 = T(xend, y_at(ln, xend))
            out.append(f'<line class="ray {cls}" x1="{f(x1)}" y1="{f(y1)}" x2="{f(x2)}" y2="{f(y2)}"/>')
        return out
    s += shadow(lambda x, y: (x, y), xr)
    s.append(f'<circle class="sun" cx="{xs}" cy="{cy}" r="{R}"/><text class="lbl" x="{xs}" y="{cy+5}" text-anchor="middle" style="fill:#5a3b00">Sun</text>')
    s.append(f'<circle class="earth" cx="{xe}" cy="{cy}" r="{r}"/><text class="lbl" x="{xe-30}" y="{cy+r+20}" text-anchor="middle">Earth</text>')
    s.append(f'<line class="orbit" x1="{xm}" y1="{cy-60}" x2="{xm}" y2="{cy+60}"/>')
    s.append(f'<rect class="zoombox" x="{bx0}" y="{cy-bh}" width="{bx1-bx0}" height="{2*bh}"/>')
    s.append(f'<text class="lbl sm" x="20" y="{cy+100}">not to scale: the real Sun is 109 times the Earth’s width and 23,000 Earth widths away</text>')
    # ---- the magnified panel ----
    zx0, zy0 = Z(bx0, cy - bh); zx1, zy1 = Z(bx1, cy + bh)
    s.append(f'<line class="zoomlink" x1="{bx0}" y1="{cy+bh}" x2="{f(zx0)}" y2="{f(zy0)}"/><line class="zoomlink" x1="{bx1}" y1="{cy+bh}" x2="{f(zx1)}" y2="{f(zy0)}"/>')
    s.append(f'<rect class="zoompanel" x="{f(zx0)}" y="{f(zy0)}" width="{f(zx1-zx0)}" height="{f(zy1-zy0)}"/>')
    s.append('<g clip-path="url(#zc)">')
    s += shadow(Z, xr)
    ex, ey = Z(xe, cy); s.append(f'<circle class="earth" cx="{f(ex)}" cy="{f(ey)}" r="{f(r*k)}"/><text class="lbl" x="{f(ex)}" y="{f(ey+5)}" text-anchor="middle" style="fill:#fff">Earth</text>')
    mx, _ = Z(xm, cy); s.append(f'<line class="orbit" x1="{f(mx)}" y1="{f(zy0)}" x2="{f(mx)}" y2="{f(zy1)}"/>')
    for dy, c in ((-34, 'moon'), (0, 'moon dim'), (34, 'moon')):
        _, my = Z(xm, cy + dy); s.append(f'<circle class="{c}" cx="{f(mx)}" cy="{f(my)}" r="{f(rd*k)}"/>')
    s.append('</g>')
    ux, uy = Z(xe + 40, cy); s.append(f'<text class="lbl u" x="{f(ux)}" y="{f(uy+5)}">umbra</text>')
    px_, py_ = Z(xe + 40, cy - 30); s.append(f'<text class="lbl p" x="{f(px_)}" y="{f(py_)}">penumbra</text>')
    px_, py_ = Z(xe + 40, cy + 34); s.append(f'<text class="lbl p" x="{f(px_)}" y="{f(py_)}">penumbra</text>')
    s.append(f'<text class="lbl u" x="{f(mx-rd*k-8)}" y="{f(Z(xm, cy)[1]+5)}" text-anchor="end" style="font-size:13.5px">eclipsed</text><text class="lbl sm" x="{f(mx-6)}" y="{f(zy0+18)}" text-anchor="end">the Moon’s path</text>')
    # the two lines from the Sun's top edge: Earth width apart at the Earth, about the same at the Moon
    # Earth = umbra + one Moon: dotted lines level with the Earth's top and bottom, and the two half-Moon gaps at the Moon
    for yy in (cy - r, cy + r):
        a1 = Z(xe, yy); a2 = Z(xm + 18, yy); s.append(f'<line class="guide-l" x1="{f(a1[0])}" y1="{f(a1[1])}" x2="{f(a2[0])}" y2="{f(a2[1])}"/>')
    gx = Z(xm + 14, cy)[0]
    for y0, y1 in ((cy - r, y_at(ot, xm)), (y_at(ob, xm), cy + r)):
        _, ga = Z(xm, y0); _, gb = Z(xm, y1)
        s.append(f'<path class="dim" d="M{f(gx)},{f(ga)} h7 V{f(gb)} h-7"/><text class="lbl sm" x="{f(gx+12)}" y="{f((ga+gb)/2+4)}">½ Moon</text>')
    s.append('</svg>')
    return '\n'.join(s), (y_at(ob, xm) - y_at(ot, xm)) / 2 / rd, (y_at(it_, xm) - y_at(ib, xm)) / 2 / rd

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
    s.append(f'<circle class="pen face" cx="{cx}" cy="{cy}" r="{f(rp)}"/><circle class="umb face" cx="{cx}" cy="{cy}" r="{f(ru)}"/>')
    s.append(f'<line class="orbit" x1="{f(cx+rp+60)}" y1="{my}" x2="{f(cx-rp-60)}" y2="{my}"/>')
    for x in (u1, u2, u3, u4): s.append(f'<circle class="moon ring" cx="{f(x)}" cy="{my}" r="{rm}"/>')
    top, bot = cy - rp - 18, cy + rp + 30
    for x, lab, up in ((u1, 'U1', True), (u3, 'U3', True), (u2, 'U2', False), (u4, 'U4', False)):
        y = top if up else bot
        s.append(f'<line class="guide-l" x1="{f(x)}" y1="{my}" x2="{f(x)}" y2="{f(y + (6 if up else -16))}"/><circle cx="{f(x)}" cy="{my}" r="2.5" style="fill:var(--f-ink)"/>')
        s.append(f'<text class="lbl" x="{f(x)}" y="{f(y)}" text-anchor="middle">{lab}</text>')
    ax = min(cx - rp, u4 - rm) - 14
    s.append(f'<path class="arrow" d="M{f(ax)},{my} h-46 m8,-6 l-8,6 l8,6"/><text class="lbl sm" x="{f(ax-23)}" y="{my-rm-10}" text-anchor="middle">the Moon moves</text>')
    s.append(f'<text class="lbl uf" x="{cx}" y="{f(cy-ru+22)}" text-anchor="middle">umbra</text><text class="lbl pf" x="{f(cx+rp*0.62)}" y="{f(cy-rp*0.8)}" text-anchor="start">penumbra</text>')
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
    s.append(f'<text class="lbl u" x="{(xe+xm)/2}" y="{cy+5}" text-anchor="middle">umbra</text>')
    # the two gaps at the Moon's distance, and one Moon beside them of the same total size
    for y0, y1 in ((top0, top1), (bot1, bot0)):
        s.append(f'<path class="dim" d="M{xm+14},{f(y0)} h8 V{f(y1)} h-8"/>')
    s.append(f'<text class="lbl sm" x="{xm+30}" y="{f((top0+top1)/2+4)}">gap</text><text class="lbl sm" x="{xm+30}" y="{f((bot0+bot1)/2+4)}">gap</text>')
    # the Moon itself, at the end of the distance (in the umbra: eclipsed), and its width beside it: the two gaps together
    rM = gap
    s.append(f'<circle class="moon eclipsed" cx="{f(xm - rM - 4)}" cy="{cy}" r="{f(rM)}"/>')
    s.append(f'<path class="dim" d="M{xm+62},{f(cy-rM)} h8 V{f(cy+rM)} h-8"/><path class="guide-l" d="M{f(xm-rM-4)},{f(cy-rM)} H{xm+62} M{f(xm-rM-4)},{f(cy+rM)} H{xm+62}"/>')
    s.append(f'<text class="lbl sm" x="{xm+78}" y="{cy-4}">the Moon’s width</text><text class="lbl sm" x="{xm+78}" y="{cy+14}">= gap + gap</text>')
    s.append(f'<path class="dim" d="M{xe},{H-20} H{xm}"/><path class="dim" d="M{xe},{H-26} v12 M{xm},{H-26} v12"/><text class="lbl sm" x="{(xe+xm)/2}" y="{H-28}" text-anchor="middle">the distance from the Earth to the Moon</text>')
    s.append(f'<text class="lbl sm" x="{xe+86}" y="{top0-10}">each edge closes in at half the angle the Sun covers</text>')
    s.append('</svg>')
    return '\n'.join(s)

def chord(hu_m, hp_m):
    """An ordinary eclipse, in the style of the eclipse maps: the Moon's path passes off the shadow's center, with the Moon drawn at
    even intervals along it; the one wholly inside the umbra is coppery (eclipsed)."""
    W, H = 760, 270
    cx, cy, rm = 380, 138, 27
    ru, rp = hu_m * rm, hp_m * rm
    b = 0.42 * ru                              # the path passes this far above the center
    my = cy - b
    step = 2.3 * rm                            # a little over a Moon diameter between copies: gaps, as on eclipse maps
    xs = [cx + k * step for k in range(-3, 4)]; reach = 3 * step
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs4t fs4d"><title id="fs4t">An off-center eclipse</title>'
         '<desc id="fs4d">The Moon\'s path passes above the center of the Earth\'s shadow. The Moon is drawn seven times along it; only the middle one is wholly inside the umbra, coppery. Along this path the umbra is narrower than its full diameter.</desc>']
    s.append(f'<circle class="pen face" cx="{cx}" cy="{cy}" r="{f(rp)}"/><circle class="umb face" cx="{cx}" cy="{cy}" r="{f(ru)}"/>')
    s.append(f'<line class="orbit" x1="{f(cx-reach-rm-30)}" y1="{f(my)}" x2="{f(cx+reach+rm+30)}" y2="{f(my)}"/>')
    for x in xs:
        inside = math.hypot(x - cx, my - cy) <= ru - rm
        s.append(f'<circle class="{"moon eclipsed" if inside else "moon"}" cx="{f(x)}" cy="{f(my)}" r="{rm}"/>')
    s.append(f'<path class="arrow" d="M{f(cx-reach-rm-14)},{f(my-rm-14)} h-46 m8,-6 l-8,6 l8,6"/><text class="lbl sm" x="{f(cx-reach-rm-37)}" y="{f(my-rm-24)}" text-anchor="middle">the Moon moves</text>')
    s.append(f'<text class="lbl uf" x="{cx}" y="{f(cy+ru*0.62)}" text-anchor="middle">umbra</text>')
    s.append(f'<text class="lbl pf" x="{cx}" y="{f(cy+rp-18)}" text-anchor="middle">penumbra</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def penradius():
    """Going further: umbra radius + penumbra radius = about one Earth diameter. The two lines from the Sun's top edge (one past the top
    of the Earth, one past the bottom) are drawn bold; at the Moon's distance the umbra's radius (axis up to the first) and the
    penumbra's radius (axis down to the second) together span about the Earth's diameter."""
    W, H = 760, 340
    xe, cy, r = 150, 165, 62
    xm = 520; xr = 522
    s1, s2 = 0.062, 0.072                      # slopes: the line past the Earth's top, the line past its bottom (both from the Sun's top edge)
    def up_u(x): return cy - r + s1 * (x - xe)      # umbra, top edge
    def lo_u(x): return cy + r - s1 * (x - xe)      # umbra, bottom edge (mirror: from the Sun's bottom edge)
    def lo_p(x): return cy + r + s2 * (x - xe)      # penumbra, bottom edge
    def up_p(x): return cy - r - s2 * (x - xe)      # penumbra, top edge (mirror)
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs5t fs5d"><title id="fs5t">Umbra radius plus penumbra radius</title>'
         '<desc id="fs5d">Behind the Earth, two lines from the top edge of the Sun: one past the top of the Earth bounds the umbra, one past the bottom bounds the penumbra. At the Moon\'s distance the umbra\'s radius and the penumbra\'s radius together span about one Earth diameter.</desc>']
    s.append(f'<path class="pen" d="M{xe},{cy-r} L{xr},{f(up_p(xr))} L{xr},{f(lo_p(xr))} L{xe},{cy+r} Z"/>')
    s.append(f'<path class="umb" d="M{xe},{cy-r} L{xr},{f(up_u(xr))} L{xr},{f(lo_u(xr))} L{xe},{cy+r} Z"/>')
    # the mirror lines faint, the two from the Sun's top edge bold, coming in from the left
    s.append(f'<line class="ray p" x1="{xe-90}" y1="{f(up_p(xe-90))}" x2="{xr}" y2="{f(up_p(xr))}" style="opacity:.45"/><line class="ray u" x1="{xe-90}" y1="{f(lo_u(xe-90))}" x2="{xr}" y2="{f(lo_u(xr))}" style="opacity:.45"/>')
    s.append(f'<line class="ray key" x1="{xe-110}" y1="{f(up_u(xe-110))}" x2="{xr}" y2="{f(up_u(xr))}"/><line class="ray key" x1="{xe-110}" y1="{f(lo_p(xe-110))}" x2="{xr}" y2="{f(lo_p(xr))}"/>')
    s.append(f'<text class="lbl sm" x="{xe-112}" y="{f(up_u(xe-112)-26)}">both from the</text><text class="lbl sm" x="{xe-112}" y="{f(up_u(xe-112)-10)}">Sun’s top edge</text>')
    s.append(f'<circle class="earth" cx="{xe}" cy="{cy}" r="{r}"/><text class="lbl" x="{xe}" y="{cy+5}" text-anchor="middle" style="fill:#fff">Earth</text>')
    s.append(f'<line class="orbit" x1="{xe}" y1="{cy}" x2="{xr+20}" y2="{cy}"/><line class="orbit" x1="{xm}" y1="20" x2="{xm}" y2="{H-24}"/><text class="lbl sm" x="{xm-6}" y="30" text-anchor="end">the Moon’s distance</text>')
    s.append(f'<text class="lbl u" x="{(xe+xm)/2+10}" y="{cy-6}" text-anchor="middle">umbra</text><text class="lbl p" x="{(xe+xm)/2+10}" y="{f(lo_p((xe+xm)/2)-14)}" text-anchor="middle">penumbra</text>')
    # the Earth's diameter, where the two lines pass it
    s.append(f'<path class="dim" d="M{xe-r-14},{cy-r} h-8 V{cy+r} h8"/><text class="lbl sm" x="{xe-r-26}" y="{cy+4}" text-anchor="end">Earth’s</text><text class="lbl sm" x="{xe-r-26}" y="{cy+20}" text-anchor="end">diameter</text>')
    # at the Moon: the two radii, and together
    a, b = up_u(xm), lo_p(xm)
    s.append(f'<path class="dim" d="M{xm+10},{f(a)} h8 V{cy} h-8"/><text class="lbl sm" x="{xm+24}" y="{f((a+cy)/2+4)}">umbra radius</text>')
    s.append(f'<path class="dim" d="M{xm+10},{cy} h8 V{f(b)} h-8"/><text class="lbl sm" x="{xm+24}" y="{f((cy+b)/2+4)}">penumbra radius</text>')
    s.append(f'<path class="dim strong" d="M{xm+150},{f(a)} h8 V{f(b)} h-8"/><text class="lbl" x="{xm+166}" y="{f((a+b)/2-4)}">together:</text><text class="lbl" x="{xm+166}" y="{f((a+b)/2+14)}">≈ Earth’s</text><text class="lbl" x="{xm+166}" y="{f((a+b)/2+32)}">diameter</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

def p1u3(hu_m, hp_m):
    """Face-on: from P1 to U3 the Moon's leading edge goes from the near edge of the penumbra to the far edge of the umbra, one penumbra
    radius plus one umbra radius: about one Earth diameter."""
    W, H = 760, 420
    cx, cy, rm = 330, 214, 38
    ru, rp = hu_m * rm, hp_m * rm
    s = [f'<svg class="fig" viewBox="0 0 {W} {H}" role="img" aria-labelledby="fs6t fs6d"><title id="fs6t">From P1 to U3</title>'
         '<desc id="fs6d">The Moon moving left through the center of the shadow, outlined at P1 (touching the penumbra) and at U3 (its leading edge at the far edge of the umbra). Its leading edge travels one penumbra radius plus one umbra radius.</desc>']
    s.append(f'<circle class="pen face" cx="{cx}" cy="{cy}" r="{f(rp)}"/><circle class="umb face" cx="{cx}" cy="{cy}" r="{f(ru)}"/>')
    s.append(f'<line class="orbit" x1="{f(cx+rp+2*rm+10)}" y1="{cy}" x2="{f(cx-rp-30)}" y2="{cy}"/>')
    p1, u3 = cx + rp + rm, cx - ru + rm
    s.append(f'<circle class="moon ring" cx="{f(p1)}" cy="{cy}" r="{rm}"/><circle class="moon ring" cx="{f(u3)}" cy="{cy}" r="{rm}"/>')
    s.append(f'<text class="lbl" x="{f(p1)}" y="{f(cy-rm-10)}" text-anchor="middle">P1</text><text class="lbl uf" x="{f(u3)}" y="{f(cy-rm-10)}" text-anchor="middle">U3</text>')
    # leading edges
    for x in (p1 - rm, u3 - rm): s.append(f'<line class="lead" x1="{f(x)}" y1="{f(cy-rm-4)}" x2="{f(x)}" y2="{f(cy+rm+4)}"/>')
    s.append(f'<path class="arrow" d="M{f(p1+rm+84)},{cy} h-56 m8,-6 l-8,6 l8,6"/><text class="lbl sm" x="{f(p1+rm+56)}" y="{cy-12}" text-anchor="middle">the Moon moves</text>')
    # the two radii, either side of the center, below the path
    yb = cy + rp + 22
    s.append(f'<circle cx="{cx}" cy="{cy}" r="3" class="dotc2"/><line class="guide-l" x1="{cx}" y1="{cy}" x2="{cx}" y2="{yb+6}"/>')
    s.append(f'<line class="guide-l" x1="{f(cx+rp)}" y1="{cy}" x2="{f(cx+rp)}" y2="{yb+6}"/><line class="guide-l" x1="{f(cx-ru)}" y1="{cy}" x2="{f(cx-ru)}" y2="{yb+6}"/>')
    s.append(f'<path class="dim" d="M{cx},{yb-6} v6 H{f(cx+rp)} v-6"/><text class="lbl sm" x="{f(cx+rp/2)}" y="{yb+18}" text-anchor="middle">penumbra radius</text>')
    s.append(f'<path class="dim" d="M{f(cx-ru)},{yb-6} v6 H{cx} v-6"/><text class="lbl sm" x="{f(cx-ru/2)}" y="{yb+18}" text-anchor="middle">umbra radius</text>')
    yt = 26
    s.append(f'<path class="dim strong" d="M{f(p1-rm)},{yt+8} v-8 H{f(u3-rm)} v8"/><text class="lbl" x="{f((p1+u3)/2-rm)}" y="{yt-8}" text-anchor="middle">P1 → U3: the leading edge travels a penumbra radius + an umbra radius</text>')
    s.append(f'<text class="lbl uf" x="{cx}" y="{f(cy+ru*0.62)}" text-anchor="middle">umbra</text><text class="lbl pf" x="{f(cx-rp*0.55)}" y="{f(cy-rp*0.72)}" text-anchor="middle">penumbra</text>')
    s.append(f'<text class="lbl sm" x="{W-10}" y="{H-8}" text-anchor="end">not to scale</text>')
    s.append('</svg>')
    return '\n'.join(s)

a, hu, hp = side()
open(__file__.replace('eclipse_figs.py', 'fig_side.svg.html'), 'w').write(a)
FACE = (2.2, 3.9)     # umbra and penumbra in Moon diameters as DRAWN face-on: deliberately not the real ratio (the lab measures it)
open(__file__.replace('eclipse_figs.py', 'fig_face.svg.html'), 'w').write(face(*FACE))
open(__file__.replace('eclipse_figs.py', 'fig_taper.svg.html'), 'w').write(taper())
open(__file__.replace('eclipse_figs.py', 'fig_chord.svg.html'), 'w').write(chord(*FACE))
open(__file__.replace('eclipse_figs.py', 'fig_penradius.svg.html'), 'w').write(penradius())
open(__file__.replace('eclipse_figs.py', 'fig_p1u3.svg.html'), 'w').write(p1u3(*FACE))
print('umbra half-height / Moon radius', round(hu, 2), 'penumbra', round(hp, 2))
