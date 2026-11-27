// notebook/formula.js: the small formula language of "calculated columns", with units carried through.
// Pure (no DOM). A formula refers to other columns by their letter (A, B, ...), uses + − × ÷ ^ ( ), the functions
// sqrt sin cos tan asin acos atan log ln abs, and the constants pi, c, Gconst, AUkm (units.js CONSTANTS).
// next( … ) and prev( … ): the same expression worked out on the row below / above (blank on the last / first row), for data recorded
// in pairs of rows (the Kepler labs: a date, then the same point of Mars's orbit a Mars year later) or for differences between rows.
// A typed number can carry a unit: 100 km, 300 min, 30°, or in braces for any unit symbol, 2.5 {light-min}.
// Units are checked the way a careful person checks them: only like things may be added; multiplying and dividing
// build compound units (km/s, AU³/yr²); sin() of a column in degrees is the sine of that many degrees.

import { UNIT, CONSTANTS, DIM_NAME, UNITS, withUnit } from './units.js';
import { sup } from './format.js';

export class FormulaError extends Error {}
const FUNCS = ['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'log', 'ln', 'abs'];

/** The unit id a typed unit names: its id or its symbol (km, min, h, d, yr, AU, light-min, °, ″, ...). Plain time beats right ascension. */
export function unitFor(text) {
  if (!text) return null;
  if (UNIT[text]) return text;
  const hits = UNITS.filter((u) => u.sym === text || u.name === text);
  return (hits.find((u) => u.dim !== 'angle' || !/RA/.test(u.id)) || hits[0] || {}).id || null;
}

/** A unit written after a number, at the start of `r`: names joined by / or · with powers, as in km, m/s^2, AU³/yr², 30°.
 *  Each name is the longest known unit there ("km/s" is one unit; in "km/300" only "km" is). Returns {parts, len} or null. */
function unitExpr(r) {
  let k = 0, parts = {}, sign = 1, any = false;
  const add = (id, p) => { for (const [u, n] of Object.entries(unitParts(id))) parts[u] = (parts[u] || 0) + sign * p * n; };
  for (;;) {
    let id = null, L = 0;
    if (/^[°′″]/.test(r.slice(k))) { id = unitFor(r[k]); L = 1; }
    else {
      const w = /^[A-Za-z%][A-Za-z\-/%⊕☉_ ]*/.exec(r.slice(k)) || [''];
      for (let n = w[0].length; n > 0 && !id; n--) { const x = r.slice(k, k + n); if (/[\/ \-]$/.test(x)) continue; const after = r[k + n] || ''; if (/[A-Za-z_0-9(]/.test(after) || (x.includes('/') && /^\s*(\^|²|³)/.test(r.slice(k + n)))) continue; if (unitFor(x)) { id = unitFor(x); L = n; } }
    }
    if (!id) break;
    k += L; let p = 1;
    const pw = /^\s*(\^\s*(-?\d+)|²|³)/.exec(r.slice(k)); if (pw) { p = pw[2] ? +pw[2] : pw[1] === '²' ? 2 : 3; k += pw[0].length; }
    add(id, p); any = true;
    const op = /^\s*([/·*])\s*/.exec(r.slice(k)); if (!op) break;
    const nextUnit = unitExpr(r.slice(k + op[0].length));
    if (!nextUnit) break;                                          // "/ 300": the slash is division, not part of the unit
    sign = op[1] === '/' ? -sign : sign; k += op[0].length;
  }
  return any ? { parts: clean(parts), len: k } : null;
}

// ---- tokens ---------------------------------------------------------------------------------------------------------
function tokenize(src) {
  const s = String(src).replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/π/g, ' pi ').replace(/²/g, '^2').replace(/³/g, '^3');
  const out = []; let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9.]/.test(ch)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(s.slice(i));
      if (!m) throw new FormulaError(`“${s.slice(i, i + 6)}” is not a number.`);
      i += m[0].length;
      // a unit right after the number: {anything}, a degree/minute/second sign, or a known unit word (a formula never puts two things side by side otherwise)
      const rest = s.slice(i), sp = /^\s*/.exec(rest)[0].length, r = rest.slice(sp);
      let used = 0, parts = null, text = '';
      if (r[0] === '{') {
        const e = r.indexOf('}'); if (e < 0) throw new FormulaError('A unit in braces needs its closing brace, like {km}.');
        const inner = r.slice(1, e).trim(), got = unitFor(inner) ? { parts: unitParts(unitFor(inner)), len: inner.length } : unitExpr(inner);
        if (!got || got.len !== inner.length) throw new FormulaError(`“${inner}” is not a unit the notebook knows (see ⋯ → Units and constants).`);
        parts = got.parts; text = inner; used = sp + e + 1;
      } else { const got = unitExpr(r); if (got) { parts = got.parts; text = r.slice(0, got.len).trim(); used = sp + got.len; } }
      out.push(parts ? { t: 'num', v: Number(m[0]), u: text, parts } : { t: 'num', v: Number(m[0]) }); i += used; continue;
    }
    if (/[A-Za-z_]/.test(ch)) { const m = /^[A-Za-z_][A-Za-z_0-9]*/.exec(s.slice(i)); out.push({ t: 'id', v: m[0] }); i += m[0].length; continue; }
    if ('+-*/^(),'.includes(ch)) { out.push({ t: ch }); i++; continue; }
    if (ch === '[') { const m = /^\[\s*([A-Za-z]{1,2})\s*\]/.exec(s.slice(i)); if (!m) throw new FormulaError('Square brackets hold one column letter, like [A].'); out.push({ t: 'id', v: m[1].toUpperCase(), col: true }); i += m[0].length; continue; }
    throw new FormulaError(`The character “${ch}” is not something a formula can use.`);
  }
  return out;
}

// ---- parser: expr := term (('+'|'-') term)* ; term := unary (('*'|'/') unary)* ; unary := '-' unary | power ;
//              power := atom ('^' unary)? ; atom := number | column | constant | func '(' expr ')' | '(' expr ')'
/** Parse to a tree. `isColumn(letter)` says whether a column with that letter exists. */
export function parse(src, isColumn = () => true) {
  const tk = tokenize(src); let p = 0;
  if (!tk.length) throw new FormulaError('The formula is empty.');
  const peek = () => tk[p], next = () => tk[p++];
  const expect = (t) => { if (!peek() || peek().t !== t) throw new FormulaError(t === ')' ? 'A bracket is not closed.' : `Expected “${t}”.`); p++; };
  function expr() { let a = term(); while (peek() && (peek().t === '+' || peek().t === '-')) { const op = next().t; a = { t: 'bin', op, a, b: term() }; } return a; }
  function term() { let a = unary(); while (peek() && (peek().t === '*' || peek().t === '/')) { const op = next().t; a = { t: 'bin', op, a, b: unary() }; } return a; }
  function unary() { if (peek() && peek().t === '-') { next(); return { t: 'neg', a: unary() }; } if (peek() && peek().t === '+') { next(); return unary(); } return power(); }
  function power() { const a = atom(); if (peek() && peek().t === '^') { next(); return { t: 'bin', op: '^', a, b: unary() }; } return a; }
  function atom() {
    const k = next();
    if (!k) throw new FormulaError('The formula stops too soon: something is missing at the end.');
    if (k.t === 'num') return k.parts ? { t: 'num', v: k.v, u: k.u, parts: k.parts } : { t: 'num', v: k.v };
    if (k.t === '(') { const e = expr(); expect(')'); return { t: 'par', a: e }; }
    if (k.t === 'id') {
      const low = k.v.toLowerCase();
      if (k.col) { if (!isColumn(k.v)) throw new FormulaError(`There is no column ${k.v}.`); return { t: 'col', id: k.v }; }
      // G and AU written bare are the constants; a column that happens to have that letter is written [G]
      if (k.v === 'G') return { t: 'const', id: 'Gconst' };
      if (k.v === 'AU') return { t: 'const', id: 'AUkm' };
      if (low === 'next' || low === 'prev') { expect('('); const e = expr(); expect(')'); return { t: 'shift', name: low, d: low === 'next' ? 1 : -1, a: e }; }
      if (low === 'log10') { expect('('); const e = expr(); expect(')'); return { t: 'fn', name: 'log', a: e }; }      // what the log₁₀ button looks like
      if (FUNCS.includes(low)) { expect('('); const e = expr(); expect(')'); return { t: 'fn', name: low, a: e }; }
      if (/^[A-Z]{1,2}$/.test(k.v) && isColumn(k.v)) return { t: 'col', id: k.v };
      if (k.v === 'c_light') return { t: 'const', id: 'c' };
      if (/^[a-z]$/.test(k.v) && !CONSTANTS[k.v] && isColumn(k.v.toUpperCase())) return { t: 'col', id: k.v.toUpperCase() };          // a small letter means the column
      if (CONSTANTS[k.v]) return { t: 'const', id: k.v };
      if (low === 'pi') return { t: 'const', id: 'pi' };
      if (/^[A-Z]{1,2}$/.test(k.v)) throw new FormulaError(`There is no column ${k.v}.`);
      throw new FormulaError(`“${k.v}” is not a column letter, a function or a constant.`);
    }
    throw new FormulaError(`“${k.t}” is in the wrong place.`);
  }
  const tree = expr();
  if (p < tk.length) throw new FormulaError(tk[p].t === ')' ? 'There is a closing bracket without an opening one.' : 'Two things stand next to each other with no operation between them.');
  return tree;
}

// ---- units as {unitId: power}; radians count as a pure number --------------------------------------------------------
export function unitParts(unit) {
  if (!unit) return {};
  if (typeof unit === 'object') return { ...unit };
  if (unit === 'rad') return {};
  const u = UNIT[unit];
  return u ? (u.parts ? { ...u.parts } : { [unit]: 1 }) : { [unit]: 1 };      // an unknown (typed) unit is carried as itself
}
const clean = (p) => { const o = {}; for (const k of Object.keys(p)) if (Math.abs(p[k]) > 1e-12) o[k] = p[k]; return o; };
const mulParts = (a, b, s) => { const o = { ...a }; for (const k of Object.keys(b)) o[k] = (o[k] || 0) + s * b[k]; return clean(o); };
const powParts = (a, n) => { const o = {}; for (const k of Object.keys(a)) o[k] = a[k] * n; return clean(o); };
const sameParts = (a, b) => { const ka = Object.keys(a), kb = Object.keys(b); return ka.length === kb.length && ka.every((k) => Math.abs(a[k] - (b[k] || 0)) < 1e-12); };
const dimsOf = (p) => { const o = {}; for (const k of Object.keys(p)) { const d = UNIT[k] ? UNIT[k].dim : 'unit:' + k; o[d] = (o[d] || 0) + p[k]; } return clean(o); };
const symOf = (id) => (UNIT[id] ? UNIT[id].sym : id);
const powText = (n) => (n === 1 ? '' : Number.isInteger(n) ? sup(n) : '^' + +n.toFixed(3));
/** "km/s", "AU³/yr²", "″·AU", "" for a pure number. */
export function partsLabel(parts) {
  const id = partsUnitId(parts);
  if (id) return symOf(id);
  const pos = Object.keys(parts).filter((k) => parts[k] > 0), neg = Object.keys(parts).filter((k) => parts[k] < 0);
  const f = (k, n) => symOf(k) + powText(n);
  if (!pos.length && !neg.length) return '';
  if (!pos.length) return neg.map((k) => f(k, parts[k])).join('·');
  return pos.map((k) => f(k, parts[k])).join('·') + (neg.length ? '/' + (neg.length > 1 ? '(' : '') + neg.map((k) => f(k, -parts[k])).join('·') + (neg.length > 1 ? ')' : '') : '');
}
/** The table unit these parts amount to (so the column can be converted further), or null. */
export function partsUnitId(parts) {
  const ks = Object.keys(parts);
  if (ks.length === 1 && parts[ks[0]] === 1 && UNIT[ks[0]]) return ks[0];
  for (const u of UNITS) if (u.parts && sameParts(u.parts, parts)) return u.id;
  return null;
}
/** A warning when two different units of the same kind are left in a result (km and m, yr and s): they should have cancelled. */
export function mixedWarning(parts) {
  const seen = {};
  for (const k of Object.keys(parts)) { const d = UNIT[k] && UNIT[k].dim; if (!d) continue; if (seen[d]) return `This mixes ${symOf(seen[d])} and ${symOf(k)}, which are both ${DIM_NAME[d].replace(/^an? /, '')}s: convert one of them first so that they combine.`; seen[d] = k; }
  return '';
}
const isPureNumber = (n) => (n.t === 'num' && !n.parts) || (n.t === 'neg' && isPureNumber(n.a)) || (n.t === 'par' && isPureNumber(n.a)) || (n.t === 'bin' && isPureNumber(n.a) && isPureNumber(n.b));
const describe = (p) => { const l = partsLabel(p); return l ? l : 'a pure number'; };
const kindOf = (p) => {
  const d = dimsOf(p), ks = Object.keys(d);
  if (!ks.length) return 'a pure number';
  if (ks.length === 1 && d[ks[0]] === 1 && DIM_NAME[ks[0]]) return DIM_NAME[ks[0]];
  return 'a compound quantity';
};

/** Work out the unit of the result and check the formula makes sense. unitOfCol(letter) -> unit id | parts | ''.
 *  Returns {parts, label, unitId, warn}. Throws FormulaError with a plain explanation. Annotates trig nodes. */
export function analyse(tree, unitOfCol) {
  let note = '';
  function go(n) {
    switch (n.t) {
      case 'num': return n.parts ? { ...n.parts } : {};
      case 'col': return unitParts(unitOfCol(n.id));
      case 'const': return { ...CONSTANTS[n.id].parts };
      case 'neg': case 'par': case 'shift': return go(n.a);
      case 'fn': {
        const a = go(n.a);
        if (n.name === 'sin' || n.name === 'cos' || n.name === 'tan') {
          const ks = Object.keys(a);
          if (!ks.length) { n.k = 1; return {}; }                 // a pure number is taken as radians
          if (ks.length === 1 && a[ks[0]] === 1 && UNIT[ks[0]] && UNIT[ks[0]].dim === 'angle') { n.k = UNIT[ks[0]].si; return {}; }
          throw new FormulaError(`${n.name}( ) needs an angle, but it was given ${describe(a)} (${kindOf(a)}).`);
        }
        if (n.name === 'asin' || n.name === 'acos' || n.name === 'atan') {
          if (Object.keys(a).length) throw new FormulaError(`${n.name}( ) needs a pure number (a ratio), but it was given ${describe(a)}. The answer is an angle in radians.`);
          return {};
        }
        if (n.name === 'sqrt') return powParts(a, 0.5);
        if (n.name === 'abs') return a;
        return {};                                                // log, ln: the number as it stands
      }
      case 'bin': {
        if (n.op === '^') {
          const a = go(n.a);
          if (!isPureNumber(n.b)) { if (Object.keys(go(n.b)).length || Object.keys(a).length) throw new FormulaError('A power must be a plain number (like ^2 or ^3) when units are involved.'); return {}; }
          return powParts(a, evaluate(n.b, () => NaN));
        }
        const a = go(n.a), b = go(n.b);
        if (n.op === '*') return mulParts(a, b, 1);
        if (n.op === '/') return mulParts(a, b, -1);
        // + and −: like with like. A bare number takes the unit of what it is added to (A − 2451545).
        if (sameParts(a, b)) return a;
        for (const [num, other] of [[n.a, b], [n.b, a]]) if (isPureNumber(num)) { if (partsLabel(other)) note = `The bare number ${pretty(num)} is taken to be in ${partsLabel(other)}.`; return other; }
        const verb = n.op === '+' ? ['add', 'to'] : ['subtract', 'from'];
        const [x, y] = n.op === '+' ? [a, b] : [b, a];
        const da = dimsOf(a), db = dimsOf(b);
        if (sameParts(da, db)) throw new FormulaError(`You cannot ${verb[0]} ${describe(x)} ${verb[1]} ${describe(y)} directly: they are the same kind of quantity but in different units. Convert one of them first (Add column → Convert units), then use the converted column.`);
        throw new FormulaError(`You cannot ${verb[0]} ${describe(x)} ${verb[1]} ${describe(y)}: one is ${kindOf(x)} and the other is ${kindOf(y)}. Only like quantities can be added or subtracted.`);
      }
    }
    return {};
  }
  const parts = go(tree);
  return { parts, label: partsLabel(parts), unitId: partsUnitId(parts), warn: mixedWarning(parts), note };
}

/** Numeric value for one row. valueOfCol(letter) -> number (NaN when blank). Run analyse() first (trig needs it). */
export function evaluate(n, valueOfCol) {
  switch (n.t) {
    case 'num': return n.v;
    case 'col': return valueOfCol(n.id);
    case 'const': return CONSTANTS[n.id].value;
    case 'neg': return -evaluate(n.a, valueOfCol);
    case 'par': return evaluate(n.a, valueOfCol);
    case 'shift': return evaluate(n.a, (L, off = 0) => valueOfCol(L, off + n.d));
    case 'fn': {
      const a = evaluate(n.a, valueOfCol);
      switch (n.name) {
        case 'sqrt': return Math.sqrt(a);
        case 'sin': return Math.sin(a * (n.k || 1));
        case 'cos': return Math.cos(a * (n.k || 1));
        case 'tan': return Math.tan(a * (n.k || 1));
        case 'asin': return Math.asin(a);
        case 'acos': return Math.acos(a);
        case 'atan': return Math.atan(a);
        case 'log': return Math.log10(a);
        case 'ln': return Math.log(a);
        case 'abs': return Math.abs(a);
      }
      return NaN;
    }
    case 'bin': {
      const a = evaluate(n.a, valueOfCol), b = evaluate(n.b, valueOfCol);
      return n.op === '+' ? a + b : n.op === '-' ? a - b : n.op === '*' ? a * b : n.op === '/' ? a / b : Math.pow(a, b);
    }
  }
  return NaN;
}
/** The formula as a person would write it: B × sin(C), 4π²A³ ÷ (G·T²) style with real signs and superscripts. */
export function pretty(n) {
  switch (n.t) {
    case 'num': { const t = String(n.v).replace(/e\+?(-?\d+)/, (m, e) => ' × 10' + sup(e)).replace('-', '−'); return n.parts ? withUnit(t, partsLabel(n.parts) || n.u) : t; }
    case 'col': return n.id === 'G' || n.id === 'AU' ? '[' + n.id + ']' : n.id;
    case 'const': return CONSTANTS[n.id].sym;
    case 'neg': return '−' + pretty(n.a);
    case 'par': return '(' + pretty(n.a) + ')';
    case 'fn': case 'shift': return n.name + '(' + pretty(n.a) + ')';
    case 'bin':
      if (n.op === '^') return pretty(n.a) + (n.b.t === 'num' && Number.isInteger(n.b.v) && n.b.v >= 0 ? sup(n.b.v) : '^' + pretty(n.b));
      return pretty(n.a) + ({ '+': ' + ', '-': ' − ', '*': ' × ', '/': ' ÷ ' })[n.op] + pretty(n.b);
  }
  return '';
}
/** Column letters a formula uses. */
export function columnsUsed(n, out = new Set()) {
  if (!n) return out;
  if (n.t === 'col') out.add(n.id);
  if (n.a) columnsUsed(n.a, out);
  if (n.b) columnsUsed(n.b, out);
  return out;
}
/** The formula back as text that parse() reads, with column letters passed through `map` (used when columns are removed). */
export function serialize(n, map = (l) => l) {
  switch (n.t) {
    case 'num': return n.parts ? `${n.v} {${n.u}}` : String(n.v);
    case 'col': { const l = map(n.id); return l === 'G' || l === 'AU' ? '[' + l + ']' : l; }
    case 'const': return n.id === 'Gconst' ? 'G' : n.id === 'AUkm' ? 'AU' : n.id === 'c' ? 'c_light' : n.id;
    case 'neg': return '-' + serialize(n.a, map);
    case 'par': return '(' + serialize(n.a, map) + ')';
    case 'fn': case 'shift': return n.name + '(' + serialize(n.a, map) + ')';
    case 'bin': return serialize(n.a, map) + (n.op === '^' ? '^' : ' ' + n.op + ' ') + serialize(n.b, map);
  }
  return '';
}
/** What a typed letter was taken to be, when it could be mistaken: small c and capital G are constants, and may be meant as columns. */
export function letterTrap(src, isColumn) {
  const ids = tokenize(src).filter((k) => k.t === 'id' && !k.col).map((k) => k.v);
  if (ids.includes('c') && isColumn('C')) return '“c” could be column C or the speed of light. For the column write a capital C; for the speed of light press its button (it writes c_light).';
  if (ids.includes('G') && isColumn('G')) return 'A bare G is the gravitational constant. For column G press its button (it writes [G]).';
  return '';
}
