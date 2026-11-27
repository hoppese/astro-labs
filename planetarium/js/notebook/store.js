// notebook/store.js: the lab notebook's data: columns, rows, graph settings, the hand-fitted model, and how they are
// saved, exported and read back. No DOM (localStorage is touched only inside try/catch), so tools/check.mjs can test it.
//
// A notebook:
//   { v: 1, slot, title, cols: [column], rows: [{<colId>: text | number}], graph: {...}, model: {...}, model2: {...},
//     student, practice, foot per column ({mean, count}),
//     seed, obs: {seeing, noise}, predict: bool, recordMap: [{raw, col}], nextId }
// A column is one of
//   { id, kind: 'data', name, unit, sig, raw? }             typed, pasted or recorded numbers
//   { id, kind: 'text', name, raw? }                        words (object names, dates as text)
//   { id, kind: 'convert', name, src, unit, sig, guess?, shown }   the source column in another unit (units.js rule)
//   { id, kind: 'relation', name, rel, in: {key: colId}, sig }     physics: d = 1/p, s = d·θ ... (units.js RELATIONS)
//   { id, kind: 'const', name, unit | parts, value, from }  one number in every row: a fitted value the student chose to use
//   { id, kind: 'calc', name, formula, sig }                a formula of other columns, written with their letters
// Columns are lettered A, B, C ... in order; computed columns may only use columns that exist (no cycles).

import { fmtNum, fmtColumn, parseNum, plainNum, colLetter } from './format.js';
import { UNIT, convertRule, RELATION, unitSym } from './units.js';
import { parse, analyse, evaluate, pretty, columnsUsed, serialize, partsLabel, partsUnitId, unitParts, FormulaError } from './formula.js';
import { MODEL, variant } from './models.js';

const KEY = 'astro-labs.planetarium.notebook.v1:';
export const blankGraph = () => ({ x: null, y: null, y2: null, err: null, t: null, xLabel: '', yLabel: '', title: '', logX: false, logY: false, flipX: false, flipY: false, connect: false, equal: false, resid: true, mark: false, markLabel: '' });
export const blankModel = () => ({ type: null, p: {}, r: {}, phase: 'angle' });

export function newNotebook(slot = 'free') {
  return { v: 1, slot, title: '', student: '', practice: false, cols: [], rows: [], graph: blankGraph(), model: blankModel(), model2: blankModel(), seed: 0, obs: null, predict: true, recordMap: [], nextId: 1 };
}
let rev = 0;
/** Call after any change: drops the cached column values. */
export function touch(nb) { nb._rev = ++rev; nb._cache = null; return nb; }

// ---- columns ----------------------------------------------------------------------------------------------------------
export const letterOf = (nb, id) => { const i = nb.cols.findIndex((c) => c.id === id); return i < 0 ? '?' : colLetter(i); };
export const colByLetter = (nb, L) => nb.cols.find((c, i) => colLetter(i) === L) || null;
export const colById = (nb, id) => nb.cols.find((c) => c.id === id) || null;
export function addColumn(nb, def, at = nb.cols.length) {
  const col = { sig: 4, name: '', ...def, id: 'c' + nb.nextId++ };
  nb.cols.splice(at, 0, col); touch(nb);
  return col;
}
/** Columns this one is computed from (ids). */
export function depsOf(nb, col) {
  if (col.kind === 'convert') return [col.src];
  if (col.kind === 'relation') return Object.values(col.in || {});
  if (col.kind === 'calc') { try { return [...columnsUsed(parse(col.formula, (L) => !!colByLetter(nb, L)))].map((L) => colByLetter(nb, L).id); } catch (e) { return []; } }
  return [];
}
/** Move a column one place left (-1) or right (+1). Formulas keep meaning the same columns: their letters are rewritten. */
export function moveColumn(nb, id, dir) {
  const i = nb.cols.findIndex((c) => c.id === id), k = i + dir;
  if (i < 0 || k < 0 || k >= nb.cols.length) return false;
  const trees = new Map(nb.cols.filter((c) => c.kind === 'calc').map((c) => { try { return [c, parse(c.formula, (L) => !!colByLetter(nb, L))]; } catch (e) { return [c, null]; } }));
  const was = nb.cols.map((c) => c.id);
  [nb.cols[i], nb.cols[k]] = [nb.cols[k], nb.cols[i]];
  const map = Object.fromEntries(was.map((cid, j) => [colLetter(j), colLetter(nb.cols.findIndex((c) => c.id === cid))]));
  for (const [c, t] of trees) if (t) c.formula = serialize(t, (L) => map[L] || L);
  touch(nb); return true;
}
export const dependents = (nb, id) => nb.cols.filter((c) => depsOf(nb, c).includes(id));
/** Remove a column. Refused (returns the reason) while another column is computed from it. */
export function removeColumn(nb, id) {
  const users = dependents(nb, id);
  if (users.length) return `Column ${letterOf(nb, id)} is used by column ${users.map((c) => letterOf(nb, c.id)).join(' and ')}. Delete ${users.length > 1 ? 'those' : 'that one'} first.`;
  // formulas name columns by letter, and the letters after this one are about to shift
  const before = nb.cols.map((c, i) => [c.id, colLetter(i)]);
  const trees = nb.cols.map((c) => { if (c.kind !== 'calc') return null; try { return parse(c.formula, (L) => !!colByLetter(nb, L)); } catch (e) { return null; } });
  const idx = nb.cols.findIndex((c) => c.id === id);
  nb.cols.splice(idx, 1); trees.splice(idx, 1);
  const now = Object.fromEntries(nb.cols.map((c, i) => [c.id, colLetter(i)]));
  const map = Object.fromEntries(before.filter(([cid]) => now[cid]).map(([cid, L]) => [L, now[cid]]));
  nb.cols.forEach((c, i) => { if (trees[i]) c.formula = serialize(trees[i], (L) => map[L] || L); });
  for (const r of nb.rows) delete r[id];
  for (const k of ['x', 'y', 'y2', 'err', 't']) if (nb.graph[k] === id) nb.graph[k] = null;
  nb.recordMap = nb.recordMap.filter((m) => m.col !== id);
  touch(nb);
  return '';
}

/** What a column's numbers are measured in: {id: table unit or null, label: text for the header, parts, error, warn}. */
export function unitInfo(nb, col, seen = new Set()) {
  if (!col) return { id: null, label: '', parts: {}, error: 'missing column' };
  if (seen.has(col.id)) return { id: null, label: '', parts: {}, error: 'This column depends on itself.' };
  seen = new Set(seen).add(col.id);
  if (col.kind === 'text') return { id: null, label: '', parts: {}, text: true };
  if (col.kind === 'data' || col.kind === 'convert') return { id: UNIT[col.unit] ? col.unit : null, label: unitSym(col.unit), parts: unitParts(col.unit) };
  if (col.kind === 'const') { const parts = col.parts || unitParts(col.unit), id = partsUnitId(parts) || (UNIT[col.unit] ? col.unit : null); return { id, label: id ? unitSym(id) : partsLabel(parts), parts }; }
  if (col.kind === 'relation') {
    const R = RELATION[col.rel], u = {};
    for (const inp of R.inputs) { const c = colById(nb, col.in[inp.key]); const ui = unitInfo(nb, c, seen); if (!ui.id || UNIT[ui.id].dim !== inp.dim) return { id: null, label: '', parts: {}, error: `${inp.label} must be a column with ${inp.dim === 'angle' ? 'an angle' : 'a ' + inp.dim} unit.` }; u[inp.key] = ui.id; }
    const id = R.out(u);
    return { id, label: unitSym(id), parts: unitParts(id), inUnits: u };
  }
  try {
    const tree = parse(col.formula, (L) => !!colByLetter(nb, L));
    const a = analyse(tree, (L) => { const c = colByLetter(nb, L); const ui = unitInfo(nb, c, seen); if (ui.error) throw new FormulaError(`Column ${L}: ${ui.error}`); if (ui.text) throw new FormulaError(`Column ${L} holds words, not numbers.`); return ui.id || ui.parts; });
    return { id: a.unitId, label: a.label, parts: a.parts, warn: a.warn, tree };
  } catch (e) { return { id: null, label: '', parts: {}, error: e instanceof FormulaError ? e.message : String(e.message || e) }; }
}

/** The numbers of a column, one per row (NaN = blank or not a number). Computed columns are worked out here. */
export function values(nb, id, seen = new Set()) {
  if (!nb._cache) nb._cache = {};
  if (nb._cache[id]) return nb._cache[id];
  const col = colById(nb, id), n = nb.rows.length, out = new Array(n).fill(NaN);
  if (!col || seen.has(id) || col.kind === 'text') return out;
  seen = new Set(seen).add(id);
  if (col.kind === 'data') { for (let i = 0; i < n; i++) out[i] = parseNum(nb.rows[i][id]); }
  else if (col.kind === 'const') out.fill(+col.value);
  else if (col.kind === 'convert') {
    const su = unitInfo(nb, colById(nb, col.src));
    if (su.id && UNIT[col.unit] && UNIT[su.id].dim === UNIT[col.unit].dim && col.shown !== false) { const f = convertRule(su.id, col.unit).factor, s = values(nb, col.src, seen); for (let i = 0; i < n; i++) out[i] = s[i] * f; }
  } else if (col.kind === 'relation') {
    const ui = unitInfo(nb, col);
    if (!ui.error) { const R = RELATION[col.rel], ins = {}; for (const inp of R.inputs) ins[inp.key] = values(nb, col.in[inp.key], seen); for (let i = 0; i < n; i++) { const v = {}; for (const k of Object.keys(ins)) v[k] = ins[k][i]; out[i] = R.f(v, ui.inUnits); } }
  } else if (col.kind === 'calc') {
    const ui = unitInfo(nb, col);
    if (!ui.error) { const cache = {}; const get = (L) => cache[L] || (cache[L] = values(nb, colByLetter(nb, L).id, seen)); for (let i = 0; i < n; i++) out[i] = evaluate(ui.tree, (L, off = 0) => { const v = get(L)[i + off]; return v === undefined ? NaN : v; }); }      // off: next() / prev()
  }
  for (let i = 0; i < n; i++) if (!Number.isFinite(out[i])) out[i] = NaN;
  nb._cache[id] = out;
  return out;
}

/** How a column came to be, for its header and for the export:
 *    {head: 'A → °', rule: '÷ 3600', why: '1° = 3600″', kind: 'convert' | 'physics' | 'formula' | 'recorded' | 'typed', text: one line} */
export function ruleOf(nb, col) {
  const L = (id) => letterOf(nb, id);
  if (col.kind === 'convert') {
    const su = unitInfo(nb, colById(nb, col.src));
    try { const r = convertRule(su.id, col.unit); return { kind: 'convert', head: `${L(col.src)} → ${/^[a-z]{1,2}$/i.test(r.to.sym) ? r.to.name : r.to.sym}`, rule: r.text, why: r.why, text: `convert ${L(col.src)} from ${r.from.sym} to ${r.to.sym}: ${r.text}${r.why ? ' (' + r.why + ')' : ''}` }; }
    catch (e) { return { kind: 'convert', head: `${L(col.src)} → ${unitSym(col.unit)}`, rule: '', why: '', error: su.id ? e.message : `Column ${L(col.src)} has no unit to convert from.`, text: 'convert (not possible)' }; }
  }
  if (col.kind === 'relation') {
    const R = RELATION[col.rel], ui = unitInfo(nb, col);
    const ins = R.inputs.map((i) => `${i.key === 'th' ? 'θ' : i.key} = ${L(col.in[i.key])}`).join(', ');
    return { kind: 'physics', head: `${R.inputs.map((i) => L(col.in[i.key])).join(', ')} → ${ui.label || '?'}`, rule: `uses ${R.uses}`, why: `${ins}` + (!ui.error && R.note(ui.inUnits) ? '; ' + R.note(ui.inUnits) : ''), error: ui.error, text: `physics: ${R.uses} with ${ins} (${R.words})` };
  }
  if (col.kind === 'calc') {
    const ui = unitInfo(nb, col);
    const p = ui.tree ? pretty(ui.tree) : col.formula;
    return { kind: 'formula', head: '= ' + p, rule: '', why: ui.warn || '', error: ui.error, warn: ui.warn, text: `calculated: ${p}` };
  }
  if (col.kind === 'const') return { kind: 'const', head: '', rule: '', why: '', text: `fixed value: ${col.from || 'typed in'}` };
  if (col.raw) return { kind: 'recorded', head: '', rule: '', why: '', text: `recorded: ${col.rawLabel || col.raw}` };
  return { kind: 'typed', head: '', rule: '', why: '', text: 'typed in' };
}
/** The conversion / calculation chains as trees, for the strip above the table: [{id, kids: [...]}] for every column
 *  that feeds at least one other. A column fed by two others appears under each. */
export function chains(nb) {
  const kids = (id, depth) => (depth > 12 ? [] : dependents(nb, id).map((c) => ({ id: c.id, kids: kids(c.id, depth + 1) })));
  return nb.cols.filter((c) => !depsOf(nb, c).length && dependents(nb, c.id).length).map((c) => ({ id: c.id, kids: kids(c.id, 0) }));
}

/** The same, with every computed column shown once: [{from: [ids], to: id, kids: [...]}]. A column fed by two others is
 *  listed under both of its inputs together instead of once under each. */
export function flow(nb) {
  const computed = nb.cols.filter((c) => depsOf(nb, c).length), one = (c) => new Set(depsOf(nb, c)).size === 1;
  const kids = (id, depth) => (depth > 12 ? [] : computed.filter((c) => one(c) && depsOf(nb, c)[0] === id).map((c) => ({ id: c.id, kids: kids(c.id, depth + 1) })));
  const out = nb.cols.filter((c) => !depsOf(nb, c).length).map((c) => ({ from: [c.id], kids: kids(c.id, 0) })).filter((t) => t.kids.length);
  for (const c of computed) if (!one(c)) out.push({ from: [...new Set(depsOf(nb, c))], kids: [{ id: c.id, kids: kids(c.id, 0) }] });
  return out;
}

// ---- rows -------------------------------------------------------------------------------------------------------------
export function addRow(nb, cells = {}) { nb.rows.push({ ...cells }); touch(nb); return nb.rows.length - 1; }
export function removeRow(nb, i) { nb.rows.splice(i, 1); touch(nb); }
export function setCell(nb, i, id, text) { while (nb.rows.length <= i) nb.rows.push({}); nb.rows[i][id] = text; touch(nb); }
/** Text shown in a cell. */
export function cellText(nb, col, i) {
  if (col.kind === 'data' || col.kind === 'text') { const v = nb.rows[i][col.id]; return v == null ? '' : typeof v === 'number' ? fmtNum(v, col.sig) : String(v); }
  if (col.kind === 'convert' && col.shown === false) return '?';
  if (col.kind === 'const') return fmtNum(+col.value, col.sig);
  if (!nb._cache) nb._cache = {};
  const k = 'fmt:' + col.id + ':' + col.sig;
  return (nb._cache[k] || (nb._cache[k] = fmtColumn(values(nb, col.id), col.sig)))(values(nb, col.id)[i]);
}
/** {n, mean} of the numbers in a column: for the row under the table that the student can switch on per column. */
export function footOf(nb, col) { const v = values(nb, col.id).filter(Number.isFinite); return { n: v.length, mean: v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN }; }

// ---- the points on the graph ---------------------------------------------------------------------------------------------
/** [{x, y, t, e, i}] for the rows where both plotted columns hold a number. which = 'y' | 'y2'. */
export function points(nb, which = 'y') {
  const g = nb.graph; if (!g.x || !g[which]) return [];
  const X = values(nb, g.x), Y = values(nb, g[which]), T = g.t ? values(nb, g.t) : null, E = g.err && which === 'y' ? values(nb, g.err) : null;
  const out = [];
  for (let i = 0; i < nb.rows.length; i++) if (Number.isFinite(X[i]) && Number.isFinite(Y[i])) out.push({ x: X[i], y: Y[i], t: T ? T[i] : NaN, e: E ? E[i] : NaN, i });
  return out;
}

// ---- save / load ---------------------------------------------------------------------------------------------------------
const strip = (nb) => { const o = {}; for (const k of Object.keys(nb)) if (k[0] !== '_') o[k] = nb[k]; return o; };
export function save(nb) { try { localStorage.setItem(KEY + nb.slot, JSON.stringify(strip(nb))); return true; } catch (e) { return false; } }
export function load(slot) {
  try { const o = JSON.parse(localStorage.getItem(KEY + slot) || 'null'); if (o && o.v === 1 && Array.isArray(o.cols)) return touch(repair(o, slot)); } catch (e) { /* no storage: a fresh notebook */ }
  return null;
}
export function forget(slot) { try { localStorage.removeItem(KEY + slot); } catch (e) { /* fine */ } }
function repair(o, slot) {
  const nb = { ...newNotebook(slot), ...o, slot };
  nb.graph = { ...blankGraph(), ...(o.graph || {}) };
  nb.model = { ...blankModel(), ...(o.model || {}) }; nb.model2 = { ...blankModel(), ...(o.model2 || {}) };
  if (nb.model.type && !MODEL[nb.model.type]) nb.model = blankModel();
  if (nb.model2.type && !MODEL[nb.model2.type]) nb.model2 = blankModel();
  for (const [m, was] of [[nb.model, o.model], [nb.model2, o.model2]]) if (was && was.type && !was.phase) m.phase = 'moment';       // saved before phases could be angles
  nb.rows = Array.isArray(o.rows) ? o.rows : []; nb.recordMap = Array.isArray(o.recordMap) ? o.recordMap : [];
  nb.nextId = Math.max(nb.nextId || 1, 1 + Math.max(0, ...nb.cols.map((c) => +String(c.id).slice(1) || 0)));
  return nb;
}

// ---- CSV ------------------------------------------------------------------------------------------------------------------
const q = (s) => { s = s == null ? '' : String(s); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
/** The table as CSV: comment lines (title, seed, graph, model, and the whole notebook as one JSON line so it can be
 *  read back exactly), then four header rows (column letter, name, unit, rule) and the data. Numbers are written in
 *  full machine form (1.5e8) so any spreadsheet reads them; the rule row keeps the conversion chain. */
export function toCSV(nb, { when = new Date() } = {}) {
  const L = [];
  L.push('# Lab notebook (Astro Labs planetarium)');
  if (nb.title) L.push('# title,' + q(nb.title));
  if (nb.student) L.push('# name,' + q(nb.student));
  if (nb.practice) L.push('# PRACTICE DATA,made up by the notebook: not a measurement');
  L.push('# exported,' + when.toISOString());
  if (nb.obs) L.push('# observing conditions,' + q(`seeing ${nb.obs.seeing} arcsec; simulated measurement noise ${nb.obs.noise} arcsec per star image (not real data); seed ${nb.seed}`));
  const g = nb.graph, nm = (id) => { const c = colById(nb, id); return c ? `${letterOf(nb, id)} ${c.name}` : ''; };
  if (g.x && g.y) L.push('# graph,' + q(`horizontal: ${nm(g.x)}; vertical: ${nm(g.y)}${g.y2 ? '; second series: ' + nm(g.y2) : ''}${g.t ? '; time of each point: ' + nm(g.t) : ''}; title: ${g.title}; axis labels: ${g.xLabel} | ${g.yLabel}`));
  for (const [m, tag] of [[nb.model, 'model'], [nb.model2, 'second curve']]) if (m.type && MODEL[m.type]) L.push(`# ${tag} (fitted by hand),` + q(MODEL[m.type].name + ': ' + variant(MODEL[m.type], m).params.map((p) => `${p.sym.replace(/<[^>]+>/g, '')} = ${plainNum(m.p[p.key])}`).join('; ')));
  L.push('# notebook-json,' + q(JSON.stringify(strip(nb))));
  L.push(['column', ...nb.cols.map((c, i) => colLetter(i))].join(','));
  L.push(['name', ...nb.cols.map((c) => q(c.name))].join(','));
  L.push(['unit', ...nb.cols.map((c) => q(unitInfo(nb, c).label))].join(','));
  L.push(['rule', ...nb.cols.map((c) => q(ruleOf(nb, c).text))].join(','));
  const vals = nb.cols.map((c) => (c.kind === 'text' ? null : values(nb, c.id)));
  nb.rows.forEach((r, i) => L.push([i + 1, ...nb.cols.map((c, k) => (vals[k] ? plainNum(vals[k][i]) : q(r[c.id])))].join(',')));
  return L.join('\n') + '\n';
}
/** Tab-separated table as shown (formatted numbers, one header row "name (unit)"): for pasting into a report. */
export function toTSV(nb) {
  const head = nb.cols.map((c) => { const u = unitInfo(nb, c).label; return (c.name || letterOf(nb, c.id)) + (u ? ` (${u})` : ''); });
  return [head.join('\t'), ...nb.rows.map((r, i) => nb.cols.map((c) => cellText(nb, c, i)).join('\t'))].join('\n');
}
/** How a block of text is cut into cells: tabs win (a spreadsheet's copy: the commas in it are part of the numbers), then
 *  semicolons, then commas; with none of them, runs of spaces when every line has the same number of numbers.
 *  'ask' = commas that could be thousands (1,249) as well as two columns: only the student knows. */
export function delimiterOf(text) {
  const bare = String(text).replace(/"[^"]*"/g, ''), lines = bare.split(/[\r\n]+/).filter((l) => l.trim() && l[0] !== '#');
  if (bare.includes('\t')) return '\t';
  if (lines.length && lines.every((l) => l.includes(';'))) return ';';
  if (bare.includes(',')) { const body = lines.filter((l) => /^[\s\d.,+−-]+$/.test(l)), th = /^\s*[-+−]?\d{1,3}(,\d{3})+(\.\d+)?\s*$/; return body.length && body.every((l) => th.test(l) || !l.includes(',')) && body.some((l) => th.test(l)) ? 'ask' : ','; }
  const n = lines.map((l) => l.trim().split(/\s+/)), th = /^\s*[-+−]?\d{1,3}( \d{3})+(\.\d+)?\s*$/;
  if (n.length && n[0].length > 1 && n.every((c) => c.length === n[0].length) && n.some((c) => c.every((x) => !Number.isNaN(parseNum(x)))) && !lines.every((l) => th.test(l))) return ' ';
  return '';
}
/** Cells of a text. delim: ',' (commas and tabs, as before), or what delimiterOf() found. */
export function parseCSV(text, delim = ',') {
  if (delim === ' ') return String(text).split(/[\r\n]+/).filter((l) => l.trim()).map((l) => l.trim().split(/\s+/));
  const cut = (ch) => (delim === ',' ? ch === ',' || ch === '\t' : delim !== '' && ch === delim);
  const rows = []; let row = [], cell = '', inQ = false;
  const s = String(text).replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inQ) { if (ch === '"') { if (s[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += ch; }
    else if (ch === '"' && cell === '') inQ = true;
    else if (cut(ch)) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cell); cell = ''; if (row.length > 1 || row[0] !== '') rows.push(row); row = []; }
    else cell += ch;
  }
  row.push(cell); if (row.length > 1 || row[0] !== '') rows.push(row);
  return rows;
}
/** Read a CSV back. One of ours (it carries its notebook-json line) comes back exactly; any other table becomes
 *  plain data columns: first row = names, "name (unit)" understood, a column with words in it becomes a text column. */
export function fromCSV(text, slot = 'free', delim = null) {
  const found = /^# notebook-json/m.test(text) ? ',' : delim == null ? delimiterOf(text) : delim;
  const rows = parseCSV(text, found === 'ask' ? ',' : found);
  const j = rows.find((r) => r[0] === '# notebook-json');
  if (j) { const o = JSON.parse(j[1]); if (o && o.v === 1 && Array.isArray(o.cols)) return touch(repair(o, slot)); }
  const body = rows.filter((r) => !/^#/.test(r[0]));
  if (!body.length) throw new Error('That file has no table in it.');
  const nb = newNotebook(slot), head = body[0], data = body.slice(1);
  const headIsNames = head.some((h) => Number.isNaN(parseNum(h)) && h.trim() !== '');
  const src = headIsNames ? data : body;
  const nCol = Math.max(...body.map((r) => r.length));
  const symToId = Object.fromEntries(Object.values(UNIT).map((u) => [u.sym, u.id]));
  for (let k = 0; k < nCol; k++) {
    let name = headIsNames ? (head[k] || '').trim() : '', unit = '';
    const m = /^(.*?)\s*[([]\s*([^()[\]]+)\s*[)\]]\s*$/.exec(name);
    if (m) { name = m[1]; unit = UNIT[m[2]] ? m[2] : symToId[m[2]] || { '"': 'arcsec', arcsec: 'arcsec', "'": 'arcmin', arcmin: 'arcmin', deg: 'deg', days: 'd', day: 'd', years: 'yr', year: 'yr', sec: 's', au: 'AU' }[m[2].toLowerCase()] || m[2]; }
    const cells = src.map((r) => (r[k] == null ? '' : r[k].trim()));
    const isText = cells.some((c) => c !== '' && Number.isNaN(parseNum(c)));
    const col = addColumn(nb, isText ? { kind: 'text', name } : { kind: 'data', name, unit, sig: 0 });
    cells.forEach((c, i) => { while (nb.rows.length <= i) nb.rows.push({}); if (c !== '') nb.rows[i][col.id] = c; });
  }
  return touch(nb);
}
