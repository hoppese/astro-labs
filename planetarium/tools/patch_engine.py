#!/usr/bin/env python3
"""Makes vendor/astronomy.js from astronomy-engine 2.1.19's astronomy.browser.js (npm tarball, MIT), with these changes, each marked 'planetarium:' there:
  - every position of the Sun, Moon and planets can come from outside (SetEphemeris: js/jpl.js, JPL DE440 / DE441); without it, or where it has no data yet, the library's own series
  - UT1: the Earth's rotation uses UT1 = TT - DeltaT (SetDeltaT), while the clock stays UTC (js/deltat.js)
  - nutation: all 77 terms of IAU 2000B (the library kept 5)
  - the ICRS -> mean J2000 frame bias is part of the precession matrix, so 'EQJ' is the ICRS axes that Gaia, Hipparcos and JPL use
  - refraction below -1 deg as in js/astro.js (no break of slope)
Usage: patch_engine.py astronomy.browser.js nut00b.c ../vendor/astronomy.js      (nut00b.c: liberfa, BSD licence; only its table of coefficients is read)"""
import re, sys
src, nut, out = sys.argv[1:4]
s = open(src).read()
def sub(a, b, n=1):
    global s
    assert s.count(a) == n, (s.count(a), a)
    s = s.replace(a, b)
rows = re.search(r'\} x\[\] = \{(.*?)\n   \};', open(nut).read(), re.S).group(1)
rows = re.sub(r'/\*.*?\*/', '', rows, flags=re.S)
R = [[float(x) for x in re.split(r'[,\s]+', m.strip().strip(',')) if x] for m in re.findall(r'\{(.*?)\}', rows, re.S)]
assert len(R) == 77 and all(len(r) == 11 for r in R), len(R)
tab = '[' + ','.join('[' + ','.join('%g' % v if abs(v) < 1e5 else repr(int(v)) for v in r) + ']' for r in R) + ']'
# nutation
i = s.index('function iau2000b(time) {'); j = s.index('function mean_obliq(time)')
s = s[:i] + '''// planetarium: all 77 luni-solar terms (the library kept 5, good to about 0.03 arcsec; this is good to 0.001)
const NUT00B = ''' + tab + ''';
function iau2000b(time) {
    const t = time.tt / 36525, R = Math.PI / 648000;
    const el = ((485868.249036 + 1717915923.2178 * t) % 1296000) * R, elp = ((1287104.79305 + 129596581.0481 * t) % 1296000) * R;
    const f = ((335779.526232 + 1739527262.8478 * t) % 1296000) * R, d = ((1072260.70369 + 1602961601.2090 * t) % 1296000) * R, om = ((450160.398036 - 6962890.5431 * t) % 1296000) * R;
    let dp = 0, de = 0;
    for (let i = NUT00B.length - 1; i >= 0; i--) {
        const x = NUT00B[i], a = x[0] * el + x[1] * elp + x[2] * f + x[3] * d + x[4] * om, sa = Math.sin(a), ca = Math.cos(a);
        dp += (x[5] + x[6] * t) * sa + x[7] * ca;
        de += (x[8] + x[9] * t) * ca + x[10] * sa;
    }
    return { dpsi: -0.000135 + dp * 1.0e-7, deps: 0.000388 + de * 1.0e-7 };
}
''' + s[j:]
# UT1
sub('function era(time) {', '''// planetarium: the Earth turns by UT1; time.ut is the civil clock (UTC)
let UT1_OF_TT = null;
function SetUt1Function(func) { UT1_OF_TT = func; sidereal_time_cache = null; }
exports.SetUt1Function = SetUt1Function;
function era(time) {
    const ut1 = UT1_OF_TT ? UT1_OF_TT(time.tt) : time.ut;''')
i = s.index('function era(time) {'); j = s.index('return theta', i)
s = s[:i] + s[i:j].replace('* time.ut;', '* ut1;').replace('time.ut % 1', 'ut1 % 1') + s[j:]
sub("if (!sidereal_time_cache || sidereal_time_cache.tt !== time.tt) {", "if (!sidereal_time_cache || sidereal_time_cache.tt !== time.tt) {")
# frame bias
sub('''    const xx = cd * cb - sb * sd * cc;
    const yx =''', '''    const xx = cd * cb - sb * sd * cc;
    const yx =''')
i = s.index('function precession_rot(time, dir) {'); j = s.index('    if (dir === PrecessDirection.Into2000) {', i); k = s.index("    throw 'Invalid precess direction';", j)
s = s[:j] + '''    // planetarium: P (mean J2000 -> mean of date) times B (ICRS -> mean J2000; IERS 2010: dalpha0 -14.6, xi0 -16.617, eta0 -6.819 mas)
    const da = -0.0146 * ASEC2RAD, xi = -0.016617 * ASEC2RAD, et = -0.006819 * ASEC2RAD;
    const P = [[xx, yx, zx], [xy, yy, zy], [xz, yz, zz]], B = [[1, da, -xi], [-da, 1, -et], [xi, et, 1]], M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (let r = 0; r < 3; ++r) for (let c = 0; c < 3; ++c) M[r][c] = P[r][0] * B[0][c] + P[r][1] * B[1][c] + P[r][2] * B[2][c];
    if (dir === PrecessDirection.Into2000)
        return new RotationMatrix([[M[0][0], M[0][1], M[0][2]], [M[1][0], M[1][1], M[1][2]], [M[2][0], M[2][1], M[2][2]]]);
    if (dir === PrecessDirection.From2000)
        return new RotationMatrix([[M[0][0], M[1][0], M[2][0]], [M[0][1], M[1][1], M[2][1]], [M[0][2], M[1][2], M[2][2]]]);
''' + s[k:]
# positions
sub('function CalcVsop(model, time) {', '''// planetarium: positions from outside (js/jpl.js)
let EPH = null;
function SetEphemeris(e) { EPH = e; }
exports.SetEphemeris = SetEphemeris;
/** Mean ecliptic and equinox of date -> EQJ (au in, au out). */
function EclipticOfDateToEqj(v, tt) { const t = { tt: tt, ut: tt }; return precession(ecl2equ_vec(t, v), t, PrecessDirection.Into2000); }
exports.EclipticOfDateToEqj = EclipticOfDateToEqj;
function extHelio(model, tt, vel) { return EPH ? EPH.helio(VSOP_NAME.get(model), tt, vel) : null; }
let VSOP_NAME = null;
function CalcVsop(model, time) {
    if (!VSOP_NAME) VSOP_NAME = new Map(Object.keys(vsop).map(k => [vsop[k], k]));
    const ext = extHelio(model, time.tt, false);
    if (ext) return new Vector(ext[0], ext[1], ext[2], time);''')
sub('function CalcVsopPosVel(model, tt) {', '''function CalcVsopPosVel(model, tt) {
    if (!VSOP_NAME) VSOP_NAME = new Map(Object.keys(vsop).map(k => [vsop[k], k]));
    const ext = extHelio(model, tt, true);
    if (ext) return new body_state_t(tt, new TerseVector(ext[0], ext[1], ext[2]), new TerseVector(ext[3], ext[4], ext[5]));''')
sub('''        const planet = CalcVsopPosVel(vsop[body], tt);
    ssb''', '', 0)
sub('''    if (body in vsop)
        return VsopFormula(vsop[body][RAD_INDEX]''', '''    if (body in vsop && EPH) return HelioVector(body, time).Length();
    if (body in vsop)
        return VsopFormula(vsop[body][RAD_INDEX]''')
sub('''    constructor(tt) {
        // Accumulate the Solar System Barycenter position.''', '''    constructor(tt) {
        const es = EPH && EPH.sunBary(tt, true);
        if (es) {      // planetarium: barycentric states straight from the ephemeris
            this.Sun = new body_state_t(tt, new TerseVector(es[0], es[1], es[2]), new TerseVector(es[3], es[4], es[5]));
            for (const b of ['Jupiter', 'Saturn', 'Uranus', 'Neptune']) { const h = CalcVsopPosVel(vsop[b], tt); h.r.incr(this.Sun.r); h.v.incr(this.Sun.v); this[b] = h; }
            return;
        }
        // Accumulate the Solar System Barycenter position.''')
sub('''function CalcSolarSystemBarycenter(time) {''', '''function CalcSolarSystemBarycenter(time) {
    const es = EPH && EPH.sunBary(time.tt, false);
    if (es) return new Vector(-es[0], -es[1], -es[2], time);''')
sub('function CalcPluto(time, helio) {', '''function CalcPluto(time, helio) {
    const ext = EPH && EPH.helio('Pluto', time.tt, true);
    if (ext) {
        const S = helio ? [0, 0, 0, 0, 0, 0] : EPH.sunBary(time.tt, true);
        return new StateVector(ext[0] + S[0], ext[1] + S[1], ext[2] + S[2], ext[3] + S[3], ext[4] + S[4], ext[5] + S[5], time);
    }''')
# Moon: the outside vector is EQJ; CalcMoon callers want mean ecliptic of date coordinates
sub('function CalcMoon(time) {', '''function CalcMoon(time) {
    const ext = EPH && EPH.moon(time.tt, false);
    if (ext) {
        const q = precession(ext, time, PrecessDirection.From2000), e = mean_obliq(time) * exports.DEG2RAD, c = Math.cos(e), n = Math.sin(e);
        const x = q[0], y = q[1] * c + q[2] * n, z = q[2] * c - q[1] * n, r = Math.sqrt(x * x + y * y + z * z);
        let lon = Math.atan2(y, x); if (lon < 0) lon += 2 * Math.PI;
        return { geo_eclip_lon: lon, geo_eclip_lat: Math.asin(z / r), distance_au: r };
    }''')
sub('''function GeoMoon(date) {
    const time = MakeTime(date);''', '''function GeoMoon(date) {
    const time = MakeTime(date);
    const ext = EPH && EPH.moon(time.tt, false);
    if (ext) return new Vector(ext[0], ext[1], ext[2], time);''')
# Earth inside AE's SunPosition etc. go through CalcVsop already; the light-time solver stops at 10 iterations: fine
m = re.search(r'function Refraction\(refraction, altitude\) \{.*?\n\}', s, re.S); r = m.group(0)
assert 'hd = altitude' in r or 'hd' in r
a = r.index('if (refraction === "normal"') if 'if (refraction === "normal"' in r else r.index("refraction === 'normal'") if "refraction === 'normal'" in r else -1
r2 = re.sub(r"(refr = \(1\.02 / Math\.tan\(\(hd \+ 10\.3 / \(hd \+ 5\.11\)\) \* exports\.DEG2RAD\)\) / 60\.0;)", r"\1\n        if (refraction === 'normal' && altitude < -1) { const f = (x) => 1.02 / Math.tan((x + 10.3 / (x + 5.11)) * exports.DEG2RAD) / 60, r1 = f(-1), k = (r1 - f(-0.999)) / 0.001 + r1 / 89; return (r1 + k * 2 * (1 - Math.exp((altitude + 1) / 2))) * (altitude + 90) / 89; }      // planetarium", r)
assert r2 != r; s = s.replace(r, r2)
# strip the documentation comments (the originals are on GitHub)
head = s[:s.index('*/') + 2]; body = s[s.index('*/') + 2:]
body = re.sub(r'^[ \t]*/\*\*.*?\*/[ \t]*\n', '', body, flags=re.S | re.M)
body = re.sub(r'^[ \t]*//(?! planetarium).*\n', '', body, flags=re.M)
body = re.sub(r'\n{2,}', '\n', body)
body = re.sub(r'^( +)', lambda m: ' ' * (len(m.group(1)) // 4), body, flags=re.M)
open(out, 'w').write(head + '\n/* Modified for the astro-labs planetarium by tools/patch_engine.py: see that file for the list of changes. */' + body)
print(len(head + body))
