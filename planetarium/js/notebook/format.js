// notebook/format.js: how numbers are written in the lab notebook. Pure (no DOM): also used by tools/check.mjs.
// Rule (Seth): powers of ten are written 1.50 × 10⁸, never 1.5e8; a sensible number of significant figures;
// never a wall of digits.

const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '.': '·', '/': '⸍' };
/** "-12" -> "⁻¹²" */
export const sup = (n) => String(n).replace(/[-0-9]/g, (c) => SUP[c]);
const group = (intPart) => (intPart.length > 4 ? intPart.replace(/\B(?=(\d{3})+$)/g, ',') : intPart);

/** A number with `sig` significant figures (sig = 0: as many as it has, up to 10). Scientific notation with a real
 *  superscript when the exponent is 6 or more, or −4 or less. Minus is a real minus sign. */
export function fmtNum(x, sig = 4) {
  if (x === null || x === undefined || x === '') return '';
  if (typeof x !== 'number') x = Number(x);
  if (Number.isNaN(x)) return '';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '−∞';
  if (x === 0) return '0';
  const neg = x < 0, a = Math.abs(x);
  const full = !sig;
  const p = full ? (Number.isInteger(a) && a < 1e15 ? Math.max(10, String(a).length) : 10) : Math.max(1, Math.min(15, sig));      // a whole number (photometer counts) keeps every digit
  let [m, e] = a.toExponential(p - 1).split('e'); e = +e;
  if (full) m = String(+m);
  let out;
  if (e >= (full ? 12 : 6) || e <= -4) out = (m === '1' && full ? '' : m + ' × ') + '10' + sup(e);
  else {
    let s = full ? String(+a.toPrecision(p)) : a.toPrecision(p);
    if (s.includes('e')) s = String(+s);
    const [i, f] = s.split('.');
    out = group(i) + (f !== undefined ? '.' + f : '');
  }
  return (neg ? '−' : '') + out;
}
/** Plain machine form for CSV: shortest text that reads back as the same number. */
export const plainNum = (x) => (typeof x === 'number' && Number.isFinite(x) ? String(+x.toPrecision(14)) : '');      // 14 figures: never 35.550000000000004

/** Read what a student may type or paste: 1.5e8, 1.5E8, "1.5 x 10^8", "1.50 × 10⁸", "−3", "1,234.5". NaN if not a number. */
export function parseNum(s) {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  let t = String(s).trim();
  if (!t) return NaN;
  t = t.replace(/[−–]/g, '-').replace(/[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (r) => '^' + [...r].map((c) => '-0123456789'['⁻⁰¹²³⁴⁵⁶⁷⁸⁹'.indexOf(c)]).join(''));
  t = t.replace(/\s+/g, '');
  const m = /^([-+]?[\d.,]*?)[x×*·]?10\^?\(?([-+]?\d+)\)?$/i.exec(t);
  if (m && /\^|[x×*·]/.test(t)) { const mant = m[1] === '' || m[1] === '+' ? 1 : m[1] === '-' ? -1 : Number(m[1].replace(/,/g, '')); return mant * Math.pow(10, +m[2]); }
  if (/^[-+]?(\d{1,3}(,\d{3})+)(\.\d*)?$/.test(t)) t = t.replace(/,/g, '');
  if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return NaN;
  return Number(t);
}
/** In words, why what was typed is not a number ('' when it is one, or blank). */
export function whyNotNumber(s) {
  const t = String(s == null ? '' : s).trim();
  if (!t || !Number.isNaN(parseNum(t))) return '';
  if (/^[-+−]?\d+,\d+$/.test(t)) return `“${t}”: write the decimal point as a point, ${t.replace(',', '.')}`;
  if (t[0] === '=') return `“${t}”: a cell holds a number; for a formula use Add Column, Calculate`;
  if (/^\d+\s*\/\s*\d+$/.test(t)) return `“${t}”: type the decimal value instead of a fraction`;
  if (/^\d+:\d+/.test(t)) return `“${t}”: a clock time is not one number; change it to decimal hours or days`;
  if (/^[-+−]?[\d.,]+\s*[^\d\s].*$/.test(t)) return `“${t}”: type the number only; the unit belongs in the column’s heading`;
  return `“${t}” is not a number`;
}
/** A column of numbers with the same number of decimals down the column (so that the points line up): `sig` figures for the
 *  largest, and any value that would lose its last figure that way is written out on its own. Falls back to fmtNum. */
export function fmtColumn(vals, sig) {
  const fin = vals.filter((v) => Number.isFinite(v) && v !== 0).map(Math.abs);
  if (!sig || fin.length < 2) return (v) => fmtNum(v, sig);
  const hi = Math.max(...fin), e = Math.floor(Math.log10(hi)), d = sig - 1 - e;
  if (e >= 6 || e <= -4 || d <= 0 || hi / Math.min(...fin) > 1000 || fin.filter((v) => v < 10 ** (1 - d)).length > fin.length / 3) return (v) => fmtNum(v, sig);      // (a column spanning many powers of ten, star radii say: significant figures throughout)
  return (v) => { if (!Number.isFinite(v)) return ''; const a = Math.abs(v); if (a !== 0 && a < 0.5 * 10 ** -d) return fmtNum(v, 2); const [i, f] = a.toFixed(d).split('.'); return (v < 0 ? '−' : '') + group(i) + (f ? '.' + f : ''); };
}
/** Spreadsheet column letter: 0 -> A, 25 -> Z, 26 -> AA. */
export function colLetter(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
