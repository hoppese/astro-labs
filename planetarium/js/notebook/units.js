// notebook/units.js: the unit table of the lab notebook, conversions between units, and the "relation" columns
// (parallax <-> distance, small-angle size <-> distance). Pure (no DOM): tools/check.mjs tests it.
//
// Every factor is an exact definition, an IAU nominal value or a CODATA value, and the definition travels with the
// unit so the notebook can SHOW it ("1 pc = 206,264.806 AU"). Sources:
//   IAU 2012 Resolution B2   au = 149 597 870 700 m exactly
//   IAU 2015 Resolution B2   parsec = 648 000 / pi au exactly
//   IAU 2015 Resolution B3   nominal R_sun 6.957e8 m, equatorial R_earth 6.3781e6 m, GM_sun 1.327 124 4e20,
//                            GM_earth 3.986 004e14, GM_jupiter 1.266 865 3e17 m^3 s^-2
//   SI                       c = 299 792 458 m/s exactly; day = 86 400 s; Julian year = 365.25 d (IAU)
//   CODATA 2018              G = 6.674 30e-11 m^3 kg^-1 s^-2 (masses below = nominal GM / G)
//   IERS                     mean sidereal day = 86 164.0905 s

import { fmtNum } from './format.js';

export const C_M_S = 299792458;
export const AU_M = 149597870700;
export const G_SI = 6.67430e-11;
export const JULIAN_YEAR_S = 31557600;
export const PC_M = AU_M * 648000 / Math.PI;
export const LY_M = C_M_S * JULIAN_YEAR_S;
const PI = Math.PI;

// dim: what kind of quantity. si: size of one unit in the SI unit of that kind (rad, s, m, m/s, kg).
// piFrac (angles only): the unit is pi / piFrac radians, so rules can be written "× π/180" exactly.
const U = (id, sym, name, dim, si, def, extra = {}) => ({ id, sym, name, dim, si, def, ...extra });
export const UNITS = [
  U('arcsec', '″', 'arcseconds', 'angle', PI / 648000, '1° = 3600″', { piFrac: 648000 }),
  U('mas', 'mas', 'milliarcseconds', 'angle', PI / 648000000, '1″ = 1000 mas', { piFrac: 648000000 }),
  U('arcmin', '′', 'arcminutes', 'angle', PI / 10800, '1° = 60′ and 1′ = 60″', { piFrac: 10800 }),
  U('deg', '°', 'degrees', 'angle', PI / 180, '360° = one full turn = 2π rad', { piFrac: 180 }),
  U('rad', 'rad', 'radians', 'angle', 1, 'π rad = 180°: the angle whose arc is as long as the radius', { piFrac: null }),
  U('hRA', 'h', 'RA hours (right ascension)', 'angle', PI / 12, '24 h of RA = 360°, so 1 h = 15°', { piFrac: 12 }),
  U('mRA', 'm (RA)', 'RA minutes (right ascension)', 'angle', PI / 720, '1 h of RA = 60 m, so 1 m = 15′', { piFrac: 720 }),
  U('sRA', 's (RA)', 'RA seconds (right ascension)', 'angle', PI / 43200, '1 m of RA = 60 s, so 1 s = 15″ (on the celestial equator)', { piFrac: 43200 }),

  U('s', 's', 'seconds', 'time', 1, 'the SI second'),
  U('min', 'min', 'minutes', 'time', 60, '1 min = 60 s'),
  U('hr', 'h', 'hours', 'time', 3600, '1 h = 3600 s'),
  U('d', 'd', 'days', 'time', 86400, '1 d = 24 h = 86,400 s'),
  U('sidday', 'sidereal d', 'sidereal days', 'time', 86164.0905, '1 sidereal day = 86,164.0905 s = 23 h 56 min 4.09 s (one turn of the Earth against the stars)'),
  U('yr', 'yr', 'years (Julian)', 'time', JULIAN_YEAR_S, '1 Julian year = 365.25 d exactly = 31,557,600 s'),

  U('nm', 'nm', 'nanometers', 'length', 1e-9, '1 m = 10⁹ nm (wavelengths of light)'),
  U('cm', 'cm', 'centimeters', 'length', 0.01, '1 m = 100 cm'),
  U('m', 'm', 'meters', 'length', 1, 'the SI meter'),
  U('km', 'km', 'kilometers', 'length', 1000, '1 km = 1000 m'),
  U('Rearth', 'R⊕', 'Earth radii', 'length', 6.3781e6, '1 R⊕ = 6378.1 km (IAU 2015 nominal equatorial radius)', { sig: 5 }),
  U('Rsun', 'R☉', 'solar radii', 'length', 6.957e8, '1 R☉ = 695,700 km (IAU 2015 nominal)', { sig: 5 }),
  U('ls', 'light-s', 'light-seconds', 'length', C_M_S, '1 light-second = 299,792.458 km exactly (c × 1 s)'),
  U('lmin', 'light-min', 'light-minutes', 'length', C_M_S * 60, '1 light-minute = 60 light-seconds = 17,987,547.48 km'),
  U('AU', 'AU', 'astronomical units', 'length', AU_M, '1 AU = 149,597,870.7 km exactly (IAU 2012)'),
  U('ly', 'ly', 'light-years', 'length', LY_M, '1 ly = c × 1 Julian year = 9.4607 × 10¹² km'),
  U('pc', 'pc', 'parsecs', 'length', PC_M, '1 pc = 648,000/π AU = 206,264.806 AU (IAU 2015): where 1 AU spans 1″'),
  U('kpc', 'kpc', 'kiloparsecs', 'length', PC_M * 1e3, '1 kpc = 1000 pc'),
  U('Mpc', 'Mpc', 'megaparsecs', 'length', PC_M * 1e6, '1 Mpc = 1,000,000 pc'),

  U('m/s', 'm/s', 'meters per second', 'speed', 1, 'SI', { parts: { m: 1, s: -1 } }),
  U('km/s', 'km/s', 'kilometers per second', 'speed', 1000, '1 km/s = 1000 m/s', { parts: { km: 1, s: -1 } }),
  U('AU/yr', 'AU/yr', 'astronomical units per year', 'speed', AU_M / JULIAN_YEAR_S, '1 AU/yr = 4.740470 km/s', { parts: { AU: 1, yr: -1 } }),
  U('c', 'c', 'speeds of light', 'speed', C_M_S, 'c = 299,792.458 km/s exactly'),

  U('kg', 'kg', 'kilograms', 'mass', 1, 'the SI kilogram'),
  U('Mearth', 'M⊕', 'Earth masses', 'mass', 3.986004e14 / G_SI, '1 M⊕ = 5.9722 × 10²⁴ kg (IAU 2015 nominal GM⊕ ÷ CODATA 2018 G)', { sig: 5 }),
  U('Mjup', 'M_J', 'Jupiter masses', 'mass', 1.2668653e17 / G_SI, '1 M_J = 1.8981 × 10²⁷ kg (IAU 2015 nominal GM_J ÷ CODATA 2018 G)', { sig: 5 }),
  U('Msun', 'M☉', 'solar masses', 'mass', 1.3271244e20 / G_SI, '1 M☉ = 1.9884 × 10³⁰ kg (IAU 2015 nominal GM☉ ÷ CODATA 2018 G)', { sig: 5 }),

  // counted things: listed so a column can carry them, but there is nothing to convert them to
  U('%', '%', 'percent', 'ratio', 0.01, '1% = 1/100'),
  U('counts', 'counts', 'counts (from a detector)', 'count', 1, 'photons or electrons counted by a detector in one exposure: nothing to convert them to'),
  U('mag', 'mag', 'magnitudes', 'magnitude', 1, 'astronomical magnitude (a logarithmic scale: no unit conversion)'),
];
export const UNIT = Object.fromEntries(UNITS.map((u) => [u.id, u]));
export const DIM_NAME = { angle: 'an angle', time: 'a time', length: 'a length', speed: 'a speed', mass: 'a mass', ratio: 'a ratio', magnitude: 'a magnitude', count: 'a number of counts' };
export const DIM_LABEL = { angle: 'Angle', time: 'Time', length: 'Length / distance', speed: 'Speed', mass: 'Mass', ratio: 'Ratio', magnitude: 'Brightness', count: 'Counts' };
/** Units a column may be given, grouped for a menu: [[label, [unit, ...]], ...]. */
export function unitGroups() {
  const out = [];
  for (const dim of Object.keys(DIM_LABEL)) out.push([DIM_LABEL[dim], UNITS.filter((u) => u.dim === dim)]);
  return out;
}
const gap = (u) => (/^[°′″]$/.test(u.sym) ? '' : ' ');
/** "3600″", "1.5 km": a number with its unit. */
export const withUnit = (text, id) => (UNIT[id] ? text + gap(UNIT[id]) + UNIT[id].sym : text + (id ? (/^[°′″]/.test(id) ? '' : ' ') + id : ''));
export const unitSym = (id) => (UNIT[id] ? UNIT[id].sym : id || '');
/** Units the given unit can be converted to. */
export function compatible(id) {
  const u = UNIT[id];
  if (!u || u.dim === 'magnitude') return [];
  return UNITS.filter((v) => v.dim === u.dim && v.id !== id);
}

const gcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a; };
/** The rule that turns a number in unit `from` into unit `to`:
 *    { factor, op: '×' | '÷', by: text of the number, text: '÷ 3600', why: '1° = 3600″', bigger: bool }
 *  value_to = value_from × factor. Throws for unlike kinds. */
export function convertRule(from, to) {
  const a = UNIT[from], b = UNIT[to];
  if (!a || !b) throw new Error('Unknown unit.');
  if (a.dim !== b.dim) throw new Error(`${a.sym} is ${DIM_NAME[a.dim]} and ${b.sym} is ${DIM_NAME[b.dim]}: one cannot be converted to the other.`);
  if (a.dim === 'magnitude') throw new Error('Magnitudes are a logarithmic scale: there is no unit to convert them to.');
  let factor = a.si / b.si, op, by;
  const big = factor >= 1 ? a : b, small = factor >= 1 ? b : a;         // "1 big = N small"
  if (a.dim === 'angle' && (a.id === 'rad') !== (b.id === 'rad')) {
    // exactly one side is radians: write the factor with pi, as a student would
    const n = (a.id === 'rad' ? b : a).piFrac;
    if (a.id === 'rad') { op = '×'; by = `${fmtNum(n, 0)}/π`; factor = n / PI; } else { op = '×'; by = `π/${fmtNum(n, 0)}`; factor = PI / n; }
  } else if (a.dim === 'angle') {
    // both are fractions of pi: the ratio is an exact rational number
    const g = gcd(a.piFrac, b.piFrac), num = b.piFrac / g, den = a.piFrac / g;
    factor = num / den;
    if (den === 1) { op = '×'; by = fmtNum(num, 0); } else if (num === 1) { op = '÷'; by = fmtNum(den, 0); } else { op = '×'; by = `${fmtNum(num, 0)}/${fmtNum(den, 0)}`; }
  } else if (factor >= 1) { op = '×'; by = fmtNum(factor, niceSig(factor, a, b)); } else { op = '÷'; by = fmtNum(1 / factor, niceSig(1 / factor, a, b)); }
  const n = big.si / small.si;
  const why = big.id === small.id ? '' : (a.dim === 'angle' && (big.id === 'rad' || small.id === 'rad')) ? 'π rad = 180°' + (small.id !== 'deg' && big.id !== 'deg' ? `, ${(big.id === 'rad' ? small : big).def}` : '') : `1${gap(big)}${big.sym} = ${fmtNum(n, niceSig(n, a, b))}${gap(small)}${small.sym}`;
  return { factor, op, by, text: `${op} ${by}`, why, bigger: factor > 1, from: a, to: b, ratio: n };
}
/** Exact-looking numbers keep all their digits; the rest get ten significant figures at most (trailing zeros dropped). */
function niceSig(x, a, b) {
  if ((a && a.sig) || (b && b.sig)) return Math.abs(x - Math.round(x)) < 1e-9 * Math.abs(x) && Math.abs(x) < 1e5 ? 0 : 5;
  if (x >= 1e12 || x < 1e-3) return 5;
  return Math.abs(Number(x.toPrecision(10)) - x) <= 1e-13 * Math.abs(x) ? 0 : 9;      // a short exact decimal keeps all its digits
}
export function convert(value, from, to) { return value * convertRule(from, to).factor; }

/** One-line reason for the "bigger or smaller?" prediction. */
export function predictReason(from, to) {
  const r = convertRule(from, to), a = r.from, b = r.to;
  const whole = Math.abs(r.ratio - Math.round(r.ratio)) < 1e-9 * r.ratio;
  const n = whole && r.ratio < 1e9 ? fmtNum(Math.round(r.ratio), 0) : 'about ' + (r.ratio >= 1000 && r.ratio < 1e6 ? fmtNum(Math.round(r.ratio), 0) : fmtNum(r.ratio, r.ratio < 10 ? 4 : 3));
  const one = (u) => { const w = singular(u.name); return (/^([aeiou]|hour|RA )/i.test(w) ? 'an ' : 'a ') + w; };
  if (r.factor === 1) return 'The same: these two units are the same size.';
  return r.bigger
    ? `Bigger: ${one(b)} is ${n} times smaller than ${one(a)}, so it takes more of them.`
    : `Smaller: ${one(b)} is ${n} times bigger than ${one(a)}, so it takes fewer of them.`;
}
function singular(name) {
  return name.replace(/^(\S+?)s( \(|$| of | per )/, (m, w, rest) => (w === 'radian' ? 'radian' : w.endsWith('ie') ? w.slice(0, -2) + 'y' : w) + rest)
    
    .replace(/^RA (hour|minute|second)s.*/, 'RA $1').replace(/^sidereal days/, 'sidereal day').replace(/^Earth radii/, 'Earth radius').replace(/^solar radii/, 'solar radius').replace(/^meters per/, 'meter per').replace(/^kilometers per/, 'kilometer per')
    .replace(/^astronomical units/, 'astronomical unit').replace(/^speeds of light/, 'speed of light').replace(/masses$/, 'mass');
}

// ---- relation columns: physics, not unit conversion --------------------------------------------------------------
// Each takes named input columns (with a required kind of unit) and gives a result in a stated unit.
export const RELATIONS = [
  { id: 'parallax-distance', name: 'Distance from parallax', uses: 'd = 1 / p', words: 'distance in parsecs = 1 ÷ (parallax in arcseconds)',
    caution: 'The parallax p is the size of the star’s own yearly swing (half of its full width), found from a fit. A separation between two stars is not a parallax.',
    inputs: [{ key: 'p', label: 'parallax p', dim: 'angle' }], out: () => 'pc',
    f: (v, u) => 1 / convert(v.p, u.p, 'arcsec'), note: (u) => (u.p === 'arcsec' ? '' : `p is first converted from ${unitSym(u.p)} to ″`) },
  { id: 'distance-parallax', name: 'Parallax from distance', uses: 'p = 1 / d', words: 'parallax in arcseconds = 1 ÷ (distance in parsecs)',
    inputs: [{ key: 'd', label: 'distance d', dim: 'length' }], out: () => 'arcsec',
    f: (v, u) => 1 / convert(v.d, u.d, 'pc'), note: (u) => (u.d === 'pc' ? '' : `d is first converted from ${unitSym(u.d)} to pc`) },
  { id: 'small-angle-size', name: 'Size from distance and angle', uses: 's = d · θ', words: 'true size = distance × (angle in radians); the size comes out in the distance’s unit',
    inputs: [{ key: 'd', label: 'distance d', dim: 'length' }, { key: 'th', label: 'angle θ', dim: 'angle' }], out: (u) => u.d,
    f: (v, u) => v.d * convert(v.th, u.th, 'rad'), note: (u) => (u.th === 'rad' ? '' : `θ is first converted from ${unitSym(u.th)} to rad`) },
  { id: 'small-angle-distance', name: 'Distance from size and angle', uses: 'd = s / θ', words: 'distance = true size ÷ (angle in radians); the distance comes out in the size’s unit',
    inputs: [{ key: 's', label: 'true size s', dim: 'length' }, { key: 'th', label: 'angle θ', dim: 'angle' }], out: (u) => u.s,
    f: (v, u) => v.s / convert(v.th, u.th, 'rad'), note: (u) => (u.th === 'rad' ? '' : `θ is first converted from ${unitSym(u.th)} to rad`) },
  { id: 'small-angle-angle', name: 'Angle from size and distance', uses: 'θ = s / d', words: 'angle in radians = true size ÷ distance (both in the same unit)',
    inputs: [{ key: 's', label: 'true size s', dim: 'length' }, { key: 'd', label: 'distance d', dim: 'length' }], out: () => 'rad',
    f: (v, u) => convert(v.s, u.s, 'm') / convert(v.d, u.d, 'm'), note: (u) => (u.s === u.d ? '' : `s and d are first put in the same unit`) },
];
export const RELATION = Object.fromEntries(RELATIONS.map((r) => [r.id, r]));

// ---- constants for calculated columns -------------------------------------------------------------------------------
// value + units as {unitId: power}
export const CONSTANTS = {
  pi: { sym: 'π', name: 'pi', value: Math.PI, parts: {}, def: 'π = 3.14159265…' },
  Gconst: { sym: 'G', name: 'gravitational constant', value: G_SI, parts: { m: 3, kg: -1, s: -2 }, def: 'G = 6.67430 × 10⁻¹¹ m³ kg⁻¹ s⁻² (CODATA 2018)' },
  c: { sym: 'c', name: 'speed of light', value: 299792.458, parts: { km: 1, s: -1 }, def: 'c = 299,792.458 km/s exactly' },
  AUkm: { sym: 'AU', name: 'astronomical unit in km', value: 149597870.7, parts: { km: 1 }, def: '1 AU = 149,597,870.7 km exactly' },
};
