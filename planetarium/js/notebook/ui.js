// notebook/ui.js: the lab notebook on screen: a general spreadsheet (the student names every column and gives it a
// unit), conversion / relation / calculated columns with their rule in the header and the chain drawn above the table,
// a graph that starts empty (the student chooses the axes and writes the labels), and generic model curves fitted BY
// HAND with sliders. Used inside the planetarium (js/notebook/host.js supplies `host`: Record and observing
// conditions) and on its own page (notebook.html, host = null). Nothing here knows about any particular lab.

import { fmtNum, parseNum, colLetter } from './format.js';
import { UNIT, unitGroups, compatible, convertRule, predictReason, RELATIONS, RELATION, CONSTANTS, unitSym, withUnit, UNITS, DIM_LABEL } from './units.js';
import { parse, analyse, pretty, FormulaError } from './formula.js';
import { MODELS, MODEL, extent, anchors, residuals, bestFit } from './models.js';
import * as S from './store.js';
import { drawChart } from './chart.js';
import { openAbout } from './about.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function h(tag, attrs = {}, html = '') {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (v === true) e.setAttribute(k, ''); else if (v !== false && v != null) e.setAttribute(k, v); }
  if (html) e.innerHTML = html;
  return e;
}
const SIGS = [[2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [8, '8'], [0, 'all']];
const unitOptions = (sel, { blank = 'no unit', only = null } = {}) =>
  (blank ? `<option value="">${blank}</option>` : '') +
  unitGroups().map(([g, us]) => { const l = us.filter((u) => !only || only.includes(u.id)); return l.length ? `<optgroup label="${g}">${l.map((u) => `<option value="${u.id}"${u.id === sel ? ' selected' : ''}>${esc(u.name)} (${esc(u.sym)})</option>`).join('')}</optgroup>` : ''; }).join('');

// a parameter in its number box: six significant figures, and always as many decimals as one step of its slider (a date
// such as 2026.135 or a Julian Date is a big number with a small range)
const parText = (v, r) => { const d = Math.max(v ? 5 - Math.floor(Math.log10(Math.abs(v))) : 0, r && r[1] > r[0] ? Math.ceil(-Math.log10((r[1] - r[0]) / 2000)) : 0); return +v.toFixed(Math.max(0, Math.min(12, d))); };

/** Build a notebook inside `root`. opts: {slot, host, instructor, standalone, onChange}. */
export function createNotebook(root, opts = {}) {
  const host = opts.host || null;
  let nb = S.load(opts.slot || 'free') || S.touch(S.newNotebook(opts.slot || 'free'));
  let tab = 'table', wide = false, saveT = 0, layout = null, statusT = 0;
  if (!nb.seed) nb.seed = 1 + Math.floor(Math.random() * 999998);

  root.classList.add('nb');
  root.innerHTML = `
    <div class="nb-bar">
      <input class="nb-title" type="text" placeholder="Title of this notebook (yours to write)" aria-label="Notebook title" maxlength="120">
      <div class="nb-btns">
        ${host ? '<button class="nb-btn primary" data-act="record" title="Copy the readings now on screen into a new row">Record</button>' : ''}
        <button class="nb-btn" data-act="addrow">Add Row</button>
        <button class="nb-btn" data-act="addcol" aria-haspopup="true">Add Column</button>
        <button class="nb-btn" data-act="labels">Edit Chart Labels</button>
        <button class="nb-btn" data-act="png">Save Graph</button>
        <button class="nb-btn" data-act="more" aria-haspopup="true" aria-label="More: export, import, settings" title="Export, import, settings">&#8943;</button>
      </div>
    </div>
    <div class="nb-status" role="status" aria-live="polite" hidden></div>
    <div class="nb-tabs" role="tablist"><button role="tab" data-tab="table">Table</button><button role="tab" data-tab="graph">Graph and model</button></div>
    <div class="nb-main">
      <div class="nb-left"><div class="nb-slot-model"></div><div class="nb-chain" hidden></div><div class="nb-tablewrap"></div></div>
      <div class="nb-right">
        <div class="nb-axes"></div>
        <div class="nb-chartwrap"><canvas class="nb-chart" role="img" aria-label="Your graph"></canvas><div class="nb-tip" hidden></div></div>
        <div class="nb-slot-model2"></div>
      </div>
    </div>
    <div class="nb-pop" hidden></div>
    <div class="nb-modal" hidden><div class="nb-dialog" role="dialog" aria-modal="true"></div></div>
    <input type="file" class="nb-file" accept=".csv,.tsv,.txt,text/csv" hidden>`;
  const $ = (sel) => root.querySelector(sel);
  const modelBox = h('div', { class: 'nb-model' });
  const titleIn = $('.nb-title'), tableWrap = $('.nb-tablewrap'), chainBox = $('.nb-chain'), axesBox = $('.nb-axes'), canvas = $('.nb-chart'), tip = $('.nb-tip');
  const modal = $('.nb-modal'), dialog = $('.nb-dialog'), pop = $('.nb-pop'), statusBox = $('.nb-status');

  // ---- small services ---------------------------------------------------------------------------------------------------
  function changed({ structure = false } = {}) {
    S.touch(nb);
    clearTimeout(saveT); saveT = setTimeout(() => S.save(nb), 250);
    if (structure) renderTable(); else refreshComputed();
    renderAxes(); renderModel(); drawGraph();
    if (opts.onChange) opts.onChange(nb);
  }
  function status(text, kind = '') { statusBox.textContent = text; statusBox.className = 'nb-status' + (kind ? ' ' + kind : ''); statusBox.hidden = !text; clearTimeout(statusT); if (text) statusT = setTimeout(() => { statusBox.hidden = true; }, 7000); }
  function openDialog(title, bodyHtml, { wideDlg = false } = {}) {
    dialog.className = 'nb-dialog' + (wideDlg ? ' wide' : '');
    dialog.innerHTML = `<h3>${esc(title)}<button class="nb-x" data-close aria-label="Close">&times;</button></h3><div class="nb-dbody">${bodyHtml}</div>`;
    modal.hidden = false; closePop();
    // a field called "name" is the student's column name, not a log-in: keep browsers' and password managers' autofill out of it
    dialog.querySelectorAll('input').forEach((i) => { i.autocomplete = 'off'; i.setAttribute('data-lpignore', 'true'); i.setAttribute('data-1p-ignore', ''); i.setAttribute('data-form-type', 'other'); });
    // focus the first field now, and again after the menu that opened this dialog has gone (its button would keep the focus)
    const foc = () => { const f = dialog.querySelector('.nb-dbody input:not([type=hidden]):not([type=checkbox]), .nb-dbody select, .nb-dbody textarea, .nb-dbody button.primary'); if (f && !dialog.contains(document.activeElement)) f.focus(); };
    foc(); setTimeout(foc, 30); setTimeout(foc, 120);
    return dialog.querySelector('.nb-dbody');
  }
  function closeDialog() { modal.hidden = true; dialog.innerHTML = ''; }
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeDialog(); });
  function openPop(anchor, items) {
    pop.innerHTML = items.map((it, i) => (it ? `<button data-i="${i}"${it.disabled ? ' disabled' : ''}><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>` : '<hr>')).join('');
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), R = root.getBoundingClientRect();
    pop.style.top = (r.bottom - R.top + 4) + 'px';
    pop.style.left = Math.max(6, Math.min(R.width - pop.offsetWidth - 6, r.left - R.left)) + 'px';
    pop.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; closePop(); items[+b.dataset.i].run(); };
  }
  function closePop() { pop.hidden = true; }
  root.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[aria-haspopup]')) closePop(); });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!modal.hidden) { closeDialog(); e.stopPropagation(); } else if (!pop.hidden) { closePop(); e.stopPropagation(); } return; }
    if (e.target.matches('input, select, textarea')) e.stopPropagation();          // typing here must not drive the sky
  });
  const colName = (c) => `${S.letterOf(nb, c.id)}${c.name ? ' · ' + c.name : ''}`;
  const colFull = (c) => { const u = S.unitInfo(nb, c).label; return colName(c) + (u ? ` (${u})` : ''); };
  const numericCols = () => nb.cols.filter((c) => c.kind !== 'text');

  // ---- table --------------------------------------------------------------------------------------------------------------
  function headHtml(c, i) {
    const ui = S.unitInfo(nb, c), r = S.ruleOf(nb, c);
    const waiting = c.kind === 'convert' && c.shown === false;
    return `<th data-col="${c.id}" class="k-${c.kind}${r.error ? ' bad' : ''}" tabindex="0" title="Click to rename, change the format, or delete this column">` +
      `<div class="nb-h1"><span class="L">${colLetter(i)}</span><span class="nm">${esc(c.name) || '<i>unnamed</i>'}</span>${ui.label ? `<span class="u">(${esc(ui.label)})</span>` : ''}</div>` +
      (r.head ? `<div class="nb-h2">${esc(r.head)}${r.rule && !waiting ? ` <b>${esc(r.rule)}</b>` : ''}</div>` : r.kind === 'recorded' ? `<div class="nb-h2 rec">${esc(r.text)}</div>` : '') +
      (r.error ? `<div class="nb-h3 err">${esc(r.error)}</div>` : waiting ? '<div class="nb-h3"><button class="nb-link" data-predict="' + c.id + '">bigger or smaller? tap to fill</button></div>' : r.why ? `<div class="nb-h3${r.warn ? ' err' : ''}">${esc(r.why)}</div>` : '') + '</th>';
  }
  function renderTable() {
    if (!nb.cols.length) {
      tableWrap.innerHTML = `<div class="nb-empty"><p><b>This table is empty.</b> Set it up yourself: add a column for each thing you will measure or type in, give it a name and a unit.</p>
        <p><button class="nb-btn primary" data-act="addcol" aria-haspopup="true">Add Column</button>${host ? ' <button class="nb-btn" data-act="recsetup">Choose what Record copies</button>' : ''} <button class="nb-btn" data-act="import">Open a CSV file</button></p>
        <p class="nb-hint">Later you can add columns that convert units (arcseconds → degrees → radians) or calculate from other columns; the notebook shows the rule it uses.</p></div>`;
      chainBox.hidden = true; return;
    }
    let html = '<table class="nb-table"><thead><tr><th class="rn"></th>' + nb.cols.map(headHtml).join('') + '<th class="rx"></th></tr></thead><tbody>';
    nb.rows.forEach((row, i) => {
      html += `<tr data-r="${i}"><td class="rn">${i + 1}</td>` + nb.cols.map((c) => (c.kind === 'data' || c.kind === 'text'
        ? `<td class="in"><input type="text" ${c.kind === 'data' ? 'inputmode="decimal"' : ''} data-r="${i}" data-c="${c.id}" value="${esc(cellShown(c, i))}" aria-label="${esc(c.name || 'column')} row ${i + 1}"></td>`
        : `<td class="calc" data-c="${c.id}">${esc(S.cellText(nb, c, i))}</td>`)).join('') +
        `<td class="rx"><button data-delrow="${i}" title="Delete row ${i + 1}" aria-label="Delete row ${i + 1}">&times;</button></td></tr>`;
    });
    html += '</tbody></table>' + (nb.rows.length ? '' : '<div class="nb-hint pad">No rows yet. Press <b>Add Row</b> and type' + (host ? ', or <b>Record</b> to copy a reading from the sky' : '') + '. You can also paste a block of cells.</div>');
    tableWrap.innerHTML = html;
    renderChain();
  }
  // a typed cell keeps exactly what was typed; a recorded number is shown with the column's figures
  const cellShown = (c, i) => { const v = nb.rows[i][c.id]; return v == null ? '' : typeof v === 'number' ? (c.kind === 'data' ? fmtNum(v, c.sig) : String(v)) : String(v); };
  function refreshComputed() {
    for (const c of nb.cols) {
      if (c.kind === 'data' || c.kind === 'text') continue;
      tableWrap.querySelectorAll(`td.calc[data-c="${c.id}"]`).forEach((td, i) => { td.textContent = S.cellText(nb, c, i); });
    }
    tableWrap.querySelectorAll('td.in input').forEach((inp) => { const c = S.colById(nb, inp.dataset.c); inp.classList.toggle('bad', c.kind === 'data' && inp.value.trim() !== '' && Number.isNaN(parseNum(inp.value))); });
  }
  function renderChain() {
    const trees = S.chains(nb);
    if (!trees.length) { chainBox.hidden = true; return; }
    const node = (id) => { const c = S.colById(nb, id), u = S.unitInfo(nb, c).label; return `<span class="nb-node k-${c.kind}" data-col="${id}"><b>${S.letterOf(nb, id)}</b> ${esc(c.name)}${u ? ` <i>(${esc(u)})</i>` : ''}</span>`; };
    const sub = (t) => node(t.id) + (t.kids.length ? `<span class="nb-kids">${t.kids.map((k) => { const kc = S.colById(nb, k.id), r = S.ruleOf(nb, kc); return `<span class="nb-kid"><span class="nb-arrow"><i>${esc(kc.kind === 'convert' && kc.shown === false ? '?' : r.kind === 'convert' ? r.rule : r.kind === 'physics' ? r.rule.replace('uses ', '') : 'formula')}</i></span>${sub(k)}</span>`; }).join('')}</span>` : '');
    chainBox.innerHTML = '<span class="nb-chain-ttl">How the columns follow from each other</span>' + trees.map((t) => `<div class="nb-chainrow">${sub(t)}</div>`).join('');
    chainBox.hidden = false;
  }
  tableWrap.addEventListener('change', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    S.setCell(nb, +inp.dataset.r, inp.dataset.c, inp.value.trim() === '' ? undefined : inp.value.trim());
    changed();
  });
  tableWrap.addEventListener('keydown', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    const r = +inp.dataset.r, go = (rr) => { const t = tableWrap.querySelector(`input[data-r="${rr}"][data-c="${inp.dataset.c}"]`); if (t) { t.focus(); t.select(); } };
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inp.dispatchEvent(new Event('change', { bubbles: true })); if (r + 1 >= nb.rows.length && e.key === 'Enter') { S.addRow(nb); changed({ structure: true }); } go(r + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(r - 1); }
  });
  tableWrap.addEventListener('paste', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;                         // a single value: let the browser paste it
    e.preventDefault(); pasteBlock(text, +inp.dataset.r, inp.dataset.c);
  });
  /** Paste a block of cells (tabs / commas, one line per row) starting at a cell: fills typed columns to the right. */
  function pasteBlock(text, r0, colId) {
    const rows = S.parseCSV(text.trim()), typed = nb.cols.filter((c) => c.kind === 'data' || c.kind === 'text'), k0 = typed.findIndex((c) => c.id === colId);
    rows.forEach((cells, i) => cells.forEach((v, k) => { const c = typed[k0 + k]; if (c && v.trim() !== '') S.setCell(nb, r0 + i, c.id, v.trim()); }));
    changed({ structure: true }); status(`Pasted ${rows.length} row${rows.length > 1 ? 's' : ''}.`);
  }
  tableWrap.addEventListener('click', (e) => {
    const d = e.target.closest('[data-delrow]'); if (d) { S.removeRow(nb, +d.dataset.delrow); changed({ structure: true }); return; }
    const pr = e.target.closest('[data-predict]'); if (pr) { e.stopPropagation(); askPrediction(S.colById(nb, pr.dataset.predict)); return; }
    const th = e.target.closest('th[data-col]'); if (th) { columnDialog(S.colById(nb, th.dataset.col)); return; }
    const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act, a);
  });
  tableWrap.addEventListener('keydown', (e) => { const th = e.target.closest && e.target.closest('th[data-col]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); columnDialog(S.colById(nb, th.dataset.col)); } });
  chainBox.addEventListener('click', (e) => { const n = e.target.closest('[data-col]'); if (n) { const th = tableWrap.querySelector(`th[data-col="${n.dataset.col}"]`); if (th) { th.scrollIntoView({ block: 'nearest', inline: 'center' }); th.classList.add('flash'); setTimeout(() => th.classList.remove('flash'), 900); } } });

  // ---- column dialogs ---------------------------------------------------------------------------------------------------------
  const sigSelect = (v) => `<label class="nb-f">Figures shown <select name="sig">${SIGS.map(([n, t]) => `<option value="${n}"${n === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  function addColumnMenu(anchor) {
    openPop(anchor, [
      { label: 'Data column', sub: 'numbers you type, paste or record; you choose the name and the unit', run: () => dataColumnDialog() },
      { label: 'Text column', sub: 'words: names of objects, notes', run: () => { S.addColumn(nb, { kind: 'text', name: '' }); changed({ structure: true }); columnDialog(nb.cols[nb.cols.length - 1]); } },
      null,
      { label: 'Convert units…', sub: 'a column in another unit: you pick the column and the unit, the notebook shows the rule', run: convertDialog, disabled: !nb.cols.some((c) => S.unitInfo(nb, c).id && compatible(S.unitInfo(nb, c).id).length) },
      { label: 'Use a relation (physics)…', sub: 'distance from parallax, size from distance and angle', run: relationDialog, disabled: !numericCols().length },
      { label: 'Calculate from other columns…', sub: 'build a formula with buttons, or type it', run: () => calcDialog(null), disabled: !numericCols().length },
    ]);
  }
  function dataColumnDialog() {
    const b = openDialog('New data column', `
      <label class="nb-f">Name: what is in this column? <input name="name" type="text" maxlength="60" placeholder="your own words"></label>
      <label class="nb-f">Unit <select name="unit">${unitOptions('', { blank: 'no unit (a pure number)' })}<option value="__other">another unit (type it)…</option></select></label>
      <label class="nb-f" hidden data-other>Unit, as you write it <input name="other" type="text" maxlength="16" placeholder="e.g. counts"></label>
      <p class="nb-def" data-def></p>
      ${sigSelect(4)}
      <div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>`);
    const unit = b.querySelector('[name=unit]');
    unit.addEventListener('change', () => { b.querySelector('[data-other]').hidden = unit.value !== '__other'; b.querySelector('[data-def]').textContent = UNIT[unit.value] ? UNIT[unit.value].def : ''; });
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const u = unit.value === '__other' ? b.querySelector('[name=other]').value.trim() : unit.value;
      S.addColumn(nb, { kind: 'data', name: b.querySelector('[name=name]').value.trim(), unit: u, sig: +b.querySelector('[name=sig]').value });
      if (!nb.rows.length) S.addRow(nb);
      closeDialog(); changed({ structure: true });
    });
  }
  function convertDialog() {
    const srcs = nb.cols.filter((c) => { const u = S.unitInfo(nb, c).id; return u && compatible(u).length; });
    const b = openDialog('Convert units: a new column', `
      <p class="nb-lead">A conversion column holds the <b>same quantity</b> as another column, written in a different unit. You choose which column and which unit; the notebook writes the rule at the top of the new column.</p>
      <label class="nb-f">Convert which column? <select name="src">${srcs.map((c) => `<option value="${c.id}">${esc(colFull(c))}</option>`).join('')}</select></label>
      <label class="nb-f">Into which unit? <select name="to"></select></label>
      <p class="nb-def" data-def></p>
      <div class="nb-chainprev" data-prev></div>
      <div class="nb-predict" data-predict hidden></div>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>`);
    const src = b.querySelector('[name=src]'), to = b.querySelector('[name=to]');
    const fill = () => { const u = S.unitInfo(nb, S.colById(nb, src.value)).id; to.innerHTML = unitOptions('', { blank: '', only: compatible(u).map((x) => x.id) }); prev(); };
    const prev = () => {
      const c = S.colById(nb, src.value), from = S.unitInfo(nb, c).id;
      b.querySelector('[data-def]').textContent = UNIT[to.value] ? `${UNIT[to.value].name}: ${UNIT[to.value].def}` : '';
      b.querySelector('[data-prev]').innerHTML = `<span class="nb-node"><b>${S.letterOf(nb, c.id)}</b> ${esc(c.name)} <i>(${esc(unitSym(from))})</i></span><span class="nb-arrow"><i>${nb.predict ? '?' : esc(convertRule(from, to.value).text)}</i></span><span class="nb-node k-convert"><b>${colLetter(nb.cols.length)}</b> ${esc(c.name)} <i>(${esc(unitSym(to.value))})</i></span>`;
    };
    src.addEventListener('change', fill); to.addEventListener('change', prev); fill();
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const c = S.colById(nb, src.value);
      const col = S.addColumn(nb, { kind: 'convert', name: c.name, src: c.id, unit: to.value, sig: Math.max(c.sig || 4, 4), shown: !nb.predict });
      changed({ structure: true });
      if (nb.predict) askPrediction(col); else closeDialog();
    });
  }
  /** The one-tap prediction before a conversion column fills in. A wrong guess is not blocked: the answer and the reason are shown. */
  function askPrediction(col) {
    const from = S.unitInfo(nb, S.colById(nb, col.src)).id, r = convertRule(from, col.unit);
    const b = openDialog('Before it fills in: predict', `
      <p class="nb-lead">Column <b>${S.letterOf(nb, col.src)}</b> is in <b>${esc(r.from.name)}</b> (${esc(r.from.sym)}). The new column <b>${S.letterOf(nb, col.id)}</b> will hold the same thing in <b>${esc(r.to.name)}</b> (${esc(r.to.sym)}).</p>
      <p class="nb-q">Will the numbers get bigger or smaller?</p>
      <div class="nb-row big"><button class="nb-btn" data-g="bigger">Bigger</button><button class="nb-btn" data-g="smaller">Smaller</button>${r.factor === 1 ? '<button class="nb-btn" data-g="same">The same</button>' : ''}</div>
      <div class="nb-answer" data-ans hidden></div>`);
    b.addEventListener('click', (e) => {
      const g = e.target.closest('[data-g]'); if (!g) return;
      const truth = r.factor === 1 ? 'same' : r.bigger ? 'bigger' : 'smaller', right = g.dataset.g === truth;
      col.guess = g.dataset.g; col.shown = true; changed({ structure: true });
      const ex = S.values(nb, col.src).find(Number.isFinite), exText = ex === undefined ? '' : `<p class="nb-ex">For example ${esc(withUnit(fmtNum(ex, 4), from))} ${esc(r.text)} = <b>${esc(withUnit(fmtNum(ex * r.factor, 4), col.unit))}</b></p>`;
      b.querySelector('.nb-row.big').hidden = true; b.querySelector('.nb-q').hidden = true;
      const a = b.querySelector('[data-ans]'); a.hidden = false;
      a.innerHTML = `<p class="${right ? 'ok' : 'no'}">${right ? 'Yes.' : 'Not this time.'} ${esc(predictReason(from, col.unit))}</p><p class="nb-rule">Rule used: <b>${esc(r.text)}</b>${r.why ? ` &ensp;(${esc(r.why)})` : ''}</p>${exText}<div class="nb-row"><button class="nb-btn primary" data-close>Done</button></div>`;
      a.querySelector('button').focus();
    });
  }
  function relationDialog() {
    const b = openDialog('Use a relation: a new column from physics', `
      <p class="nb-lead">These are not unit conversions: each one uses a piece of geometry. You choose the relation and the columns that feed it.</p>
      <label class="nb-f">Relation <select name="rel">${RELATIONS.map((r) => `<option value="${r.id}">${esc(r.name)}: ${esc(r.uses)}</option>`).join('')}</select></label>
      <p class="nb-def" data-words></p><div data-ins></div>
      <label class="nb-f">Name of the new column <input name="name" type="text" maxlength="60" placeholder="your own words"></label>
      <p class="nb-err" data-err hidden></p>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>`);
    const rel = b.querySelector('[name=rel]'), ins = b.querySelector('[data-ins]'), err = b.querySelector('[data-err]');
    const fill = () => {
      const R = RELATION[rel.value]; b.querySelector('[data-words]').textContent = `uses ${R.uses}: ${R.words}.`;
      ins.innerHTML = R.inputs.map((i) => { const ok = nb.cols.filter((c) => { const u = S.unitInfo(nb, c).id; return u && UNIT[u].dim === i.dim; }); return `<label class="nb-f">Column for the ${esc(i.label)} <select name="in-${i.key}">${ok.length ? ok.map((c) => `<option value="${c.id}">${esc(colFull(c))}</option>`).join('') : `<option value="">no column has ${i.dim === 'angle' ? 'an angle' : 'a ' + i.dim} unit yet</option>`}</select></label>`; }).join('');
    };
    rel.addEventListener('change', fill); fill();
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const R = RELATION[rel.value], inp = {};
      for (const i of R.inputs) { inp[i.key] = b.querySelector(`[name="in-${i.key}"]`).value; if (!inp[i.key]) { err.textContent = `This relation needs a column with ${i.dim === 'angle' ? 'an angle' : 'a ' + i.dim} unit for the ${i.label}.`; err.hidden = false; return; } }
      S.addColumn(nb, { kind: 'relation', name: b.querySelector('[name=name]').value.trim(), rel: R.id, in: inp, sig: 4 });
      closeDialog(); changed({ structure: true });
    });
  }
  /** Guided formula builder. Buttons add pieces; the text box underneath can also be typed in. Units are checked live. */
  function calcDialog(col) {
    const cols = numericCols().filter((c) => !col || c.id !== col.id);
    const b = openDialog(col ? `Column ${S.letterOf(nb, col.id)}: formula` : 'Calculate a new column', `
      <p class="nb-lead">Build the formula from the buttons (or type it). Columns go in by their letter. The notebook works out the unit of the answer and refuses a formula that mixes unlike things.</p>
      <div class="nb-fpretty" data-pretty aria-live="polite"></div>
      <input class="nb-ftext" name="formula" type="text" spellcheck="false" autocomplete="off" placeholder="e.g. B * sin(C)" value="${esc(col ? col.formula : '')}" aria-label="Formula">
      <div class="nb-fgroup"><span>Columns</span>${cols.map((c) => { const u = S.unitInfo(nb, c).label, L = S.letterOf(nb, c.id); return `<button class="nb-chip col" data-ins="${L === 'G' || L === 'AU' ? '[' + L + ']' : L}"><b>${L}</b> ${esc(c.name)}${u ? ` <i>(${esc(u)})</i>` : ''}</button>`; }).join('')}</div>
      <div class="nb-fgroup"><span>Operations</span>${[['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['x²', '^2'], ['x³', '^3'], ['xⁿ', '^'], ['(', '('], [')', ')'], ['√', 'sqrt('], ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['log₁₀', 'log(']].map(([t, v]) => `<button class="nb-chip" data-ins="${v}">${t}</button>`).join('')}</div>
      <div class="nb-fgroup"><span>Constants</span>${[['π', 'pi'], ['G', 'G'], ['c', 'c'], ['AU in km', 'AU']].map(([t, v]) => `<button class="nb-chip" data-ins="${v}" title="${esc(CONSTANTS[v === 'G' ? 'Gconst' : v === 'AU' ? 'AUkm' : v].def)}">${t}</button>`).join('')}
        <input class="nb-fnum" type="text" inputmode="decimal" placeholder="a number" aria-label="A number to insert"><button class="nb-chip" data-num>insert number</button>
        <button class="nb-chip warn" data-back title="Remove the last piece">⌫</button><button class="nb-chip warn" data-clear>clear</button></div>
      <div class="nb-fresult" data-res></div>
      <label class="nb-f">Name of the column <input name="name" type="text" maxlength="60" placeholder="your own words" value="${esc(col ? col.name : '')}"></label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>${col ? 'Save' : 'Add column'}</button><button class="nb-btn" data-close>Cancel</button></div>`, { wideDlg: true });
    const text = b.querySelector('[name=formula]'), res = b.querySelector('[data-res]'), pre = b.querySelector('[data-pretty]'), ok = b.querySelector('[data-ok]');
    const check = () => {
      if (!text.value.trim()) { pre.innerHTML = '<i>the formula will appear here</i>'; res.className = 'nb-fresult'; res.textContent = 'Nothing yet.'; ok.disabled = true; return null; }
      try {
        const tree = parse(text.value, (L) => { const c = S.colByLetter(nb, L); return !!c && (!col || c.id !== col.id); });
        const a = analyse(tree, (L) => { const c = S.colByLetter(nb, L), ui = S.unitInfo(nb, c); if (ui.text) throw new FormulaError(`Column ${L} holds words, not numbers.`); if (ui.error) throw new FormulaError(`Column ${L} has a problem of its own: ${ui.error}`); return ui.id || ui.parts; });
        pre.textContent = '= ' + pretty(tree);
        res.className = 'nb-fresult ok' + (a.warn ? ' warn' : '');
        res.innerHTML = `Unit of the answer: <b>${a.label ? esc(a.label) : 'none (a pure number)'}</b>` + (a.warn ? `<br>${esc(a.warn)}` : '');
        ok.disabled = false; return tree;
      } catch (e) {
        pre.textContent = '= ' + text.value; res.className = 'nb-fresult bad'; res.textContent = e instanceof FormulaError ? e.message : 'That formula cannot be read.'; ok.disabled = true; return null;
      }
    };
    b.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.ins != null) { const v = t.dataset.ins; text.value = (text.value + (/^[A-Za-z[(]/.test(v) && /[A-Za-z0-9)\]]$/.test(text.value.trim()) && !/^[(^]/.test(v) ? ' ' : '') + v); check(); }
      else if (t.dataset.num != null) { const n = parseNum(b.querySelector('.nb-fnum').value); if (!Number.isNaN(n)) { text.value += String(n); b.querySelector('.nb-fnum').value = ''; check(); } }
      else if (t.dataset.back != null) { text.value = text.value.replace(/\s*(sqrt\(|sin\(|cos\(|tan\(|log\(|ln\(|abs\(|\[[A-Z]+\]|[A-Za-z]+|\d+\.?\d*(e[-+]?\d+)?|\^\d?|.)\s*$/i, ''); check(); }
      else if (t.dataset.clear != null) { text.value = ''; check(); }
      else if (t.dataset.ok != null) {
        if (!check()) return;
        if (col) { col.formula = text.value.trim(); col.name = b.querySelector('[name=name]').value.trim(); }
        else S.addColumn(nb, { kind: 'calc', name: b.querySelector('[name=name]').value.trim(), formula: text.value.trim(), sig: 4 });
        closeDialog(); changed({ structure: true });
      }
    });
    text.addEventListener('input', check); check();
  }
  function columnDialog(col) {
    if (!col) return;
    const r = S.ruleOf(nb, col), L = S.letterOf(nb, col.id);
    const b = openDialog(`Column ${L}`, `
      <label class="nb-f">Name <input name="name" type="text" maxlength="60" value="${esc(col.name)}" placeholder="your own words"></label>
      ${col.kind === 'data' ? `<label class="nb-f">Unit <select name="unit">${unitOptions(col.unit, { blank: 'no unit (a pure number)' })}${col.unit && !UNIT[col.unit] ? `<option value="${esc(col.unit)}" selected>${esc(col.unit)}</option>` : ''}</select></label>` : ''}
      ${col.kind !== 'text' ? sigSelect(col.sig) : ''}
      <p class="nb-def">${esc(r.text)}${r.error ? ` — <span class="nb-err">${esc(r.error)}</span>` : ''}</p>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Save</button>${col.kind === 'calc' ? '<button class="nb-btn" data-formula>Edit formula…</button>' : ''}<button class="nb-btn danger" data-del>Delete column</button><button class="nb-btn" data-close>Cancel</button></div>
      <p class="nb-err" data-err hidden></p>`);
    b.querySelector('[data-ok]').addEventListener('click', () => {
      col.name = b.querySelector('[name=name]').value.trim();
      const u = b.querySelector('[name=unit]'); if (u) col.unit = u.value;
      const s = b.querySelector('[name=sig]'); if (s) col.sig = +s.value;
      closeDialog(); changed({ structure: true });
    });
    const f = b.querySelector('[data-formula]'); if (f) f.addEventListener('click', () => calcDialog(col));
    b.querySelector('[data-del]').addEventListener('click', () => {
      const why = S.removeColumn(nb, col.id);
      if (why) { const e = b.querySelector('[data-err]'); e.textContent = why; e.hidden = false; return; }
      closeDialog(); changed({ structure: true });
    });
  }

  // ---- Record (inside the planetarium only) ----------------------------------------------------------------------------------------
  function recordSetup() {
    const R = host.readings();
    const map = Object.fromEntries(nb.recordMap.map((m) => [m.raw, m.col]));
    const groups = [...new Set(R.map((r) => r.group))];
    const b = openDialog('What should Record copy?', `
      <p class="nb-lead">Record copies <b>raw readings only</b>: what the clock, the angle tool, the stopwatch and the object panel show at that moment. Tick the readings you want and say which column each goes into. Anything worked out from them is yours to add as a column.</p>
      ${groups.map((g) => `<div class="nb-rgroup">${esc(g)}</div>` + R.filter((r) => r.group === g).map((r) => {
        const fits = nb.cols.filter((c) => (r.kind === 'text' ? c.kind === 'text' : c.kind === 'data' && (c.unit || '') === (r.unit || '')));
        return `<div class="nb-rrow"><label><input type="checkbox" data-raw="${r.key}"${map[r.key] ? ' checked' : ''}> ${esc(r.label)}${r.unit ? ` <i>(${esc(unitSym(r.unit))})</i>` : ''}</label>
          <span class="now">${r.value == null ? 'nothing to read now' : 'now: ' + esc(typeof r.value === 'string' ? r.value : fmtNum(r.value, r.sig || 0))}</span>
          <select data-col="${r.key}" aria-label="Column for ${esc(r.label)}"><option value="">a new column</option>${fits.map((c) => `<option value="${c.id}"${map[r.key] === c.id ? ' selected' : ''}>${esc(colName(c))}</option>`).join('')}</select>
          <input type="text" data-name="${r.key}" maxlength="60" placeholder="name for the new column" aria-label="Name of the new column for ${esc(r.label)}"></div>`;
      }).join('')).join('')}
      <label class="nb-check"><input type="checkbox" name="clear"${nb.recordClear !== false ? ' checked' : ''}> Clear the angle tool after each Record, ready for the next measurement</label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Save</button><button class="nb-btn" data-close>Cancel</button></div>`, { wideDlg: true });
    const sync = () => b.querySelectorAll('.nb-rrow').forEach((row) => { const on = row.querySelector('[data-raw]').checked, sel = row.querySelector('select'); sel.disabled = !on; const nm = row.querySelector('[data-name]'); nm.hidden = !on || sel.value !== ''; });
    b.addEventListener('change', sync); sync();
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const out = [];
      for (const r of R) {
        if (!b.querySelector(`[data-raw="${r.key}"]`).checked) continue;
        let id = b.querySelector(`[data-col="${r.key}"]`).value;
        if (!id) id = S.addColumn(nb, r.kind === 'text' ? { kind: 'text', name: b.querySelector(`[data-name="${r.key}"]`).value.trim(), raw: r.key, rawLabel: r.label } : { kind: 'data', name: b.querySelector(`[data-name="${r.key}"]`).value.trim(), unit: r.unit || '', sig: r.sig || 0, raw: r.key, rawLabel: r.label }).id;
        else { const c = S.colById(nb, id); c.raw = r.key; c.rawLabel = r.label; }
        out.push({ raw: r.key, col: id });
      }
      nb.recordMap = out; nb.recordClear = b.querySelector('[name=clear]').checked;
      closeDialog(); changed({ structure: true });
      status(out.length ? `Record will fill ${out.length} column${out.length > 1 ? 's' : ''}. Measure, then press Record.` : 'Record is not set up: nothing is ticked.');
    });
  }
  /** Append one row of raw readings. Returns true when a row was added. */
  function record() {
    if (!host) return false;
    nb.recordMap = nb.recordMap.filter((m) => S.colById(nb, m.col));
    if (!nb.recordMap.length) { recordSetup(); return false; }
    const R = Object.fromEntries(host.readings().map((r) => [r.key, r]));
    const missing = nb.recordMap.filter((m) => !R[m.raw] || R[m.raw].value == null);
    if (missing.length) { status(`Nothing recorded: ${missing.map((m) => (R[m.raw] ? R[m.raw].why || R[m.raw].label + ' has no reading' : m.raw)).join('; ')}.`, 'warn'); return false; }
    const cells = {}; for (const m of nb.recordMap) cells[m.col] = R[m.raw].value;
    const i = S.addRow(nb, cells);
    changed({ structure: true });
    const tr = tableWrap.querySelector(`tr[data-r="${i}"]`); if (tr) { tr.classList.add('flash'); tr.scrollIntoView({ block: 'nearest' }); setTimeout(() => tr.classList.remove('flash'), 1200); }
    status(`Row ${i + 1} recorded.`);
    if (host.afterRecord) host.afterRecord({ clear: nb.recordClear !== false });
    return true;
  }

  // ---- graph ------------------------------------------------------------------------------------------------------------------------
  function renderAxes() {
    const g = nb.graph, nums = numericCols();
    const sel = (key, none) => `<select data-g="${key}" aria-label="${none}"><option value="">${none}</option>${nums.map((c) => `<option value="${c.id}"${g[key] === c.id ? ' selected' : ''}>${esc(colFull(c))}</option>`).join('')}</select>`;
    const chk = (key, label) => `<label class="nb-check"><input type="checkbox" data-g="${key}"${g[key] ? ' checked' : ''}> ${label}</label>`;
    const open = axesBox.querySelector('details') ? axesBox.querySelector('details').open : false;
    axesBox.innerHTML = `<label class="nb-ax">Horizontal axis ${sel('x', 'choose a column')}</label><label class="nb-ax">Vertical axis ${sel('y', 'choose a column')}</label>
      <details class="nb-gopt"${open ? ' open' : ''}><summary>Graph options</summary><div class="nb-goptbody">
        ${chk('logX', 'Log scale, horizontal')}${chk('logY', 'Log scale, vertical')}${chk('flipX', 'Flip horizontal axis')}${chk('flipY', 'Flip vertical axis')}
        ${chk('connect', 'Connect the points')}${chk('equal', 'Same scale on both axes')}${chk('resid', 'Show residuals under the graph')}
        <label class="nb-ax">Second series (same vertical axis) ${sel('y2', 'none')}</label>
        <label class="nb-ax">Error bars from ${sel('err', 'none')}</label>
      </div></details>`;
  }
  axesBox.addEventListener('change', (e) => {
    const k = e.target.dataset.g; if (!k) return;
    nb.graph[k] = e.target.type === 'checkbox' ? e.target.checked : (e.target.value || null);
    if ((k === 'x' || k === 'y') && nb.model.type) { /* the sliders keep their values: the student decides when to reset them */ }
    changed();
    refocus(axesBox, `[data-g="${e.target.dataset.g}"]`);
  });
  function modelData(m) {
    const pts = S.points(nb, 'y'), M = MODEL[m.type];
    if (!M) return null;
    const use = M.needsT ? pts.filter((p) => Number.isFinite(p.t)) : pts;
    const d = extent(use);
    return { M, pts: use, d, c: anchors(d) };
  }
  function chartSpec(forExport) {
    const g = nb.graph, cx = S.colById(nb, g.x), cy = S.colById(nb, g.y);
    if (!cx || !cy) return { empty: nb.cols.length ? 'This graph is empty. Choose which column goes on the horizontal axis and which on the vertical axis.' : 'This graph is empty. Make a table first; then choose which column goes on each axis.' };
    const s1 = S.points(nb, 'y');
    if (!s1.length) return { empty: 'No row has a number in both of those columns yet.' };
    const spec = { series: [{ pts: s1, name: cy.name || S.letterOf(nb, cy.id) }], xLabel: g.xLabel, yLabel: g.yLabel, title: g.title, logX: g.logX, logY: g.logY, flipX: g.flipX, flipY: g.flipY, connect: g.connect, equal: g.equal, placeholders: !forExport, curves: [], resid: null };
    if (g.y2 && S.colById(nb, g.y2)) spec.series.push({ pts: S.points(nb, 'y2'), name: S.colById(nb, g.y2).name || S.letterOf(nb, g.y2) });
    [nb.model, nb.model2].forEach((m, k) => {
      const md = m.type && modelData(m); if (!md || !md.pts.length) return;
      const { M, pts, d, c } = md, curve = [];
      if (M.needsT) {
        if (!g.t) return;
        const pad = (d.tmax - d.tmin) * 0.04 || 1, n = 720;
        for (let i = 0; i <= n; i++) curve.push(M.xy(d.tmin - pad + (d.tmax - d.tmin + 2 * pad) * i / n, m.p, c));
        spec.curves.push({ pts: curve, name: M.name, ties: pts.map((p) => [p.x, p.y, ...M.xy(p.t, m.p, c)]) });
      } else {
        const xs = s1.map((p) => p.x).filter((x) => !g.logX || x > 0), lo = Math.min(...xs), hi = Math.max(...xs), n = 400;
        if (g.logX) for (let i = 0; i <= n; i++) { const x = lo / 1.3 * Math.pow(hi * 1.3 * 1.3 / lo, i / n); curve.push([x, M.f(x, m.p, c)]); }
        else { const pad = (hi - lo) * 0.08 || 1; for (let i = 0; i <= n; i++) { const x = lo - pad + (hi - lo + 2 * pad) * i / n; curve.push([x, M.f(x, m.p, c)]); } }
        spec.curves.push({ pts: curve, name: M.name });
      }
      if (k === 0 && g.resid) {
        const r = residuals(M, m.p, pts, c), uy = S.unitInfo(nb, cy).label;
        spec.resid = M.needsT ? { ownX: true, pts: pts.map((p, i) => ({ x: p.t, r: r.dx[i], r2: r.dy[i] })), label: 'residual' + (uy ? ` (${uy})` : ''), note: '● horizontal  □ vertical, against the time column' }
          : { pts: pts.map((p, i) => ({ x: p.x, r: r.res[i] })), label: 'residual' + (uy ? ` (${uy})` : '') };
      }
    });
    return spec;
  }
  function drawGraph() {
    const wrap = canvas.parentElement, w = Math.max(200, wrap.clientWidth), hh = Math.max(180, wrap.clientHeight);
    if (!wrap.clientWidth) return;
    canvas.style.width = w + 'px'; canvas.style.height = hh + 'px';
    layout = drawChart(canvas, chartSpec(false), { theme: 'dark', w, h: hh, dpr: Math.min(window.devicePixelRatio || 1, 2) });
  }
  canvas.addEventListener('pointermove', (e) => {
    if (!layout || !layout.hit.length) { tip.hidden = true; return; }
    const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    let best = null, bd = 18;
    for (const p of layout.hit) { const d = Math.hypot(p.px - x, p.py - y); if (d < bd) { bd = d; best = p; } }
    if (!best) { tip.hidden = true; return; }
    const g = nb.graph, cx = S.colById(nb, g.x), cy = S.colById(nb, best.s ? g.y2 : g.y);
    tip.innerHTML = `<b>row ${best.i + 1}</b><br>${esc(cx.name || S.letterOf(nb, cx.id))}: ${esc(withUnit(fmtNum(best.x, cx.sig || 5), S.unitInfo(nb, cx).label))}<br>${esc(cy.name || S.letterOf(nb, cy.id))}: ${esc(withUnit(fmtNum(best.y, cy.sig || 5), S.unitInfo(nb, cy).label))}`;
    tip.hidden = false;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 4, Math.max(4, best.px + 12)) + 'px'; tip.style.top = Math.max(4, best.py - tip.offsetHeight - 8) + 'px';
  });
  canvas.addEventListener('pointerleave', () => { tip.hidden = true; });
  function labelsDialog() {
    const g = nb.graph, cx = S.colById(nb, g.x), cy = S.colById(nb, g.y);
    const b = openDialog('Edit chart labels', `
      <p class="nb-lead">A graph someone else can read says what is on each axis <b>and in what unit</b>, and has a title that says what it shows. These are yours to write.</p>
      <label class="nb-f">Title <input name="title" type="text" maxlength="120" value="${esc(g.title)}"></label>
      <label class="nb-f">Horizontal axis label${cx ? ` <small>(you put column ${esc(colFull(cx))} here)</small>` : ''} <input name="xLabel" type="text" maxlength="80" value="${esc(g.xLabel)}"></label>
      <label class="nb-f">Vertical axis label${cy ? ` <small>(you put column ${esc(colFull(cy))} here)</small>` : ''} <input name="yLabel" type="text" maxlength="80" value="${esc(g.yLabel)}"></label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Save</button><button class="nb-btn" data-close>Cancel</button></div>`);
    b.querySelector('[data-ok]').addEventListener('click', () => { for (const k of ['title', 'xLabel', 'yLabel']) g[k] = b.querySelector(`[name=${k}]`).value.trim(); closeDialog(); changed(); });
  }
  function savePng() {
    const spec = chartSpec(true);
    if (spec.empty) { status('There is no graph to save yet.', 'warn'); return; }
    const c = document.createElement('canvas');
    drawChart(c, spec, { theme: 'light', w: 1000, h: 640, dpr: 2 });
    c.toBlob((blob) => download((nb.title || 'graph').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.png', blob));
    if (!nb.graph.xLabel || !nb.graph.yLabel || !nb.graph.title) status('Graph saved, but it has ' + [!nb.graph.title && 'no title', !nb.graph.xLabel && 'no horizontal label', !nb.graph.yLabel && 'no vertical label'].filter(Boolean).join(', ') + '.', 'warn');
    else status('Graph saved as a PNG.');
  }
  function download(name, data, type = 'text/plain') {
    const blob = data instanceof Blob ? data : new Blob([data], { type });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none'; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---- model: shape, sliders, residuals -----------------------------------------------------------------------------------------------
  const axisVars = () => { const g = nb.graph, nm = (id, d) => { const c = S.colById(nb, id); return c ? esc(c.name || S.letterOf(nb, id)) : d; }; return { x: nm(g.x, 'horizontal'), y: nm(g.y, 'vertical'), t: nm(g.t, 'time') }; };
  function parUnit(kind) {
    const g = nb.graph, u = (id) => { const c = S.colById(nb, id); return c ? S.unitInfo(nb, c).label : ''; };
    const ux = u(g.x), uy = u(g.y), ut = u(g.t), per = (a, b2) => (a || b2 ? `${a || '1'}/${b2 || '1'}`.replace(/\/1$/, '') : '');
    return kind === 'x' ? ux : kind === 'y' ? uy : kind === 't' ? ut : kind === 'y/x' ? per(uy, ux) : kind === 'y/x2' ? per(uy, ux ? ux + '²' : '') : kind === 'y/t' ? per(uy, ut) : kind === 'x/t' ? per(ux, ut) : kind === 'deg' ? '°' : '';
  }
  function setRanges(m, keepValues) {
    const md = modelData(m); if (!md) return;
    const r = md.M.ranges(md.d);
    for (const p of md.M.params) {
      const [lo, hi, start] = r[p.key];
      m.r[p.key] = [lo, hi];
      if (!keepValues || !Number.isFinite(m.p[p.key])) m.p[p.key] = start;
      else { if (m.p[p.key] < lo) m.r[p.key][0] = m.p[p.key]; if (m.p[p.key] > hi) m.r[p.key][1] = m.p[p.key]; }
    }
  }
  function renderModel() {
    const g = nb.graph, ready = g.x && g.y && S.points(nb, 'y').length > 0;
    const part = (m, k) => {
      const M = MODEL[m.type];
      let html = `<div class="nb-mhead"><label>${k ? 'Second curve, to compare' : 'Model: a curve to lay over your points'} <select data-m="${k}"${ready ? '' : ' disabled'}><option value="">${k ? 'none' : 'none yet: choose a shape'}</option>${MODELS.map((x) => `<option value="${x.id}"${x.id === m.type ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` +
        (M ? `<button class="nb-btn sm" data-about="${M.id}">About this model</button>` : '') + '</div>';
      if (!M) return html + (k || ready ? '' : '<p class="nb-hint">Put two columns on the graph first.</p>');
      html += `<div class="nb-eq">${M.eq(axisVars())}</div>`;
      if (M.needsT) html += `<label class="nb-ax">Time of each point: column <select data-g2="t"><option value="">choose a column</option>${numericCols().map((c) => `<option value="${c.id}"${g.t === c.id ? ' selected' : ''}>${esc(colFull(c))}</option>`).join('')}</select></label>`;
      const md = modelData(m);
      if (M.needsT && !g.t) return html + '<p class="nb-hint">This shape is traced out in time, so it needs to know when each point was measured.</p>';
      if (!md || !md.pts.length) return html;
      if (!M.params.every((p) => Number.isFinite(m.p[p.key]) && m.r[p.key])) setRanges(m, true);
      html += '<div class="nb-pars">' + M.params.map((p) => {
        const [lo, hi] = m.r[p.key], v = m.p[p.key], u = parUnit(p.unit);
        return `<div class="nb-par" title="${esc(p.label)}"><span class="sym">${p.sym}</span><span class="desc">${esc(p.label)}</span>
          <input type="range" data-p="${k}:${p.key}" min="${lo}" max="${hi}" step="${(hi - lo) / 2000 || 1e-9}" value="${v}" aria-label="${esc(p.label)}">
          <input type="number" data-n="${k}:${p.key}" step="any" value="${parText(v, m.r[p.key])}" aria-label="${esc(p.label)}, number">
          <span class="un">${esc(u)}</span>
          <span class="zoom"><button data-z="${k}:${p.key}:in" title="Finer: narrow this slider around its value" aria-label="Finer slider for ${esc(p.label)}">&#8853;</button><button data-z="${k}:${p.key}:out" title="Wider slider range" aria-label="Wider slider for ${esc(p.label)}">&#8854;</button></span></div>`;
      }).join('') + '</div>';
      html += `<div class="nb-rms" data-rms="${k}"></div><div class="nb-row sm"><button class="nb-btn sm" data-reset="${k}" title="Put the sliders back to a neutral start that covers your data (not a fit)">Reset sliders</button>${opts.instructor ? `<button class="nb-btn sm" data-best="${k}" title="Instructor only: least-squares fit from the current sliders">Best fit (instructor)</button>` : ''}</div>`;
      return html;
    };
    const active = document.activeElement && modelBox.contains(document.activeElement) ? document.activeElement : null;
    const key = active && (active.dataset.p || active.dataset.n) ? [active.dataset.p ? 'p' : 'n', active.dataset.p || active.dataset.n] : null;
    modelBox.innerHTML = part(nb.model, 0) + (nb.model.type ? '<div class="nb-m2">' + part(nb.model2, 1) + '</div>' : '') +
      (nb.model.type ? '<p class="nb-hint">Move the sliders (or type) until the curve follows your points. The residuals are the gaps between each point and the curve: make their rms small. Nothing here fits for you.</p>' : '');
    if (key) { const again = modelBox.querySelector(`[data-${key[0]}="${key[1]}"]`); if (again) again.focus(); }
    showRms();
  }
  function showRms() {
    [nb.model, nb.model2].forEach((m, k) => {
      const box = modelBox.querySelector(`[data-rms="${k}"]`); if (!box) return;
      const md = modelData(m); if (!md) return;
      const r = residuals(md.M, m.p, md.pts, md.c), u = parUnit('y');
      box.innerHTML = `rms of residuals <b>${esc(withUnit(fmtNum(r.rms, 3), u))}</b> · largest ${esc(withUnit(fmtNum(r.max, 3), u))} · ${r.n} point${r.n === 1 ? '' : 's'}`;
    });
  }
  const mOf = (k) => (+k ? nb.model2 : nb.model);
  // a redraw replaces the menu just used: give its successor the focus, so that a keyboard user can go on choosing
  const refocus = (box, sel) => { const el = box.querySelector(sel); if (el) el.focus({ preventScroll: true }); };
  modelBox.addEventListener('input', (e) => {
    const t = e.target, id = t.dataset.p || t.dataset.n; if (!id) return;
    const [k, key] = id.split(':'), m = mOf(k), v = t.dataset.p ? +t.value : parseNum(t.value);
    if (!Number.isFinite(v)) return;
    m.p[key] = v;
    if (t.dataset.p) { const nbx = modelBox.querySelector(`[data-n="${id}"]`); if (nbx) nbx.value = parText(v, m.r[key]); }
    else { const sl = modelBox.querySelector(`[data-p="${id}"]`); if (sl) sl.value = v; }          // the slider's range grows only when the typed number is finished (change, below): "2" on the way to "2026.2" must not stretch it
    S.touch(nb); clearTimeout(saveT); saveT = setTimeout(() => S.save(nb), 400);
    showRms(); drawGraph();
  });
  modelBox.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.n) { const [k, key] = t.dataset.n.split(':'), m = mOf(k), v = m.p[key], sl = modelBox.querySelector(`[data-p="${t.dataset.n}"]`); if (sl && Number.isFinite(v)) { if (v < +sl.min) { sl.min = v; m.r[key][0] = v; } if (v > +sl.max) { sl.max = v; m.r[key][1] = v; } sl.step = (sl.max - sl.min) / 2000; sl.value = v; S.save(nb); } return; }
    if (t.dataset.m != null) { const m = mOf(t.dataset.m); m.type = t.value || null; m.p = {}; m.r = {}; if (m.type) setRanges(m, false); changed(); refocus(modelBox, `[data-m="${t.dataset.m}"]`); }
    else if (t.dataset.g2) { nb.graph.t = t.value || null; for (const m of [nb.model, nb.model2]) if (m.type && MODEL[m.type].needsT) { m.p = {}; m.r = {}; setRanges(m, false); } changed();  refocus(modelBox, '[data-g2]'); }
  });
  modelBox.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.about) openAbout(root, b.dataset.about, axisVars());
    else if (b.dataset.reset != null) { const m = mOf(b.dataset.reset); m.p = {}; m.r = {}; setRanges(m, false); changed(); }
    else if (b.dataset.z) { const [k, key, dir] = b.dataset.z.split(':'), m = mOf(k), [lo, hi] = m.r[key], v = m.p[key], half = (hi - lo) / 2 * (dir === 'in' ? 0.25 : 2); m.r[key] = [v - half, v + half]; if (lo >= 0 && m.r[key][0] < 0 && ['A', 'a', 'P'].includes(key)) m.r[key] = [0, 2 * half]; changed(); }
    else if (b.dataset.best != null && opts.instructor) { const m = mOf(b.dataset.best), md = modelData(m); if (md) { const scale = {}; for (const p of md.M.params) scale[p.key] = (m.r[p.key][1] - m.r[p.key][0]) / 20; let f = bestFit(md.M, m.p, md.pts, md.c, { scale }); f = bestFit(md.M, f.p, md.pts, md.c); m.p = f.p; setRanges(m, true); changed(); } }
  });

  // ---- menu, import / export ------------------------------------------------------------------------------------------------------------
  function moreMenu(anchor) {
    openPop(anchor, [
      { label: 'Export CSV', sub: 'every column with its unit and the rule it came from', run: () => { download((nb.title || 'notebook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.csv', S.toCSV(nb), 'text/csv'); status('Table saved as a CSV file.'); } },
      { label: 'Open a CSV file…', sub: 'one exported here comes back whole; any other table becomes plain columns', run: () => $('.nb-file').click() },
      { label: 'Copy as table', sub: 'for pasting into a lab report or a spreadsheet', run: copyTable },
      null,
      host ? { label: 'Choose what Record copies…', sub: 'which raw readings go into which columns', run: recordSetup } : null,
      host && host.conditions ? { label: 'Observing conditions…', sub: 'seeing, simulated measurement noise, your seed', run: () => host.conditions(api) } : null,
      { label: nb.predict ? 'Turn off “bigger or smaller?”' : 'Turn on “bigger or smaller?”', sub: 'the one-tap prediction before a conversion column fills in', run: () => { nb.predict = !nb.predict; changed(); } },
      { label: 'Units and constants', sub: 'every unit the notebook knows, with its definition', run: unitsDialog },
      null,
      { label: 'Clear this notebook…', sub: 'removes every column, row and the graph', run: clearDialog },
    ].filter((x, i, a) => x !== null || (i > 0 && a[i - 1] !== null)));
  }
  function copyTable() {
    const t = S.toTSV(nb);
    const done = (ok) => status(ok ? 'Table copied.' : 'Could not copy: the browser refused. Use Export CSV instead.', ok ? '' : 'warn');
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => done(true), () => done(false)); else done(false);
  }
  function unitsDialog() {
    openDialog('Units and constants', unitGroups().filter(([, us]) => us.length).map(([g, us]) => `<div class="nb-rgroup">${esc(g)}</div><table class="nb-units">${us.map((u) => `<tr><td><b>${esc(u.sym)}</b></td><td>${esc(u.name)}</td><td>${esc(u.def)}</td></tr>`).join('')}</table>`).join('') +
      `<div class="nb-rgroup">Constants (for calculated columns)</div><table class="nb-units">${Object.values(CONSTANTS).map((c) => `<tr><td><b>${esc(c.sym)}</b></td><td>${esc(c.name)}</td><td>${esc(c.def)}</td></tr>`).join('')}</table>` +
      '<p class="nb-hint">Exact by definition: AU, parsec, light-year, c, day, Julian year. Nominal values (IAU 2015): R⊕, R☉ and the GM of the Earth, Jupiter and the Sun; the masses are GM ÷ G with G from CODATA 2018.</p>', { wideDlg: true });
  }
  function clearDialog() {
    const b = openDialog('Clear this notebook?', '<p class="nb-lead">Every column, every row, the graph and the model will be removed. Export a CSV first if you may want them back.</p><div class="nb-row"><button class="nb-btn danger" data-ok>Clear everything</button><button class="nb-btn" data-close>Cancel</button></div>');
    b.querySelector('[data-ok]').addEventListener('click', () => { const keep = { seed: nb.seed, obs: nb.obs, predict: nb.predict, slot: nb.slot }; nb = Object.assign(S.newNotebook(nb.slot), keep); titleIn.value = ''; closeDialog(); changed({ structure: true }); });
  }
  $('.nb-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { importText(await f.text()); status(`Opened ${f.name}: ${nb.cols.length} columns, ${nb.rows.length} rows.`); } catch (err) { status('Could not read that file: ' + err.message, 'warn'); }
  });
  function importText(text) {
    const got = S.fromCSV(text, nb.slot), keep = { seed: nb.seed, obs: nb.obs };
    nb = got; if (!nb.seed) nb.seed = keep.seed; if (!nb.obs) nb.obs = keep.obs;
    titleIn.value = nb.title || ''; changed({ structure: true });
  }

  // ---- wiring ---------------------------------------------------------------------------------------------------------------------------------
  function act(name, anchor) {
    if (name === 'record') record();
    else if (name === 'recsetup') recordSetup();
    else if (name === 'addrow') { if (!nb.cols.length) { addColumnMenu(anchor); return; } const i = S.addRow(nb); changed({ structure: true }); const f = tableWrap.querySelector(`tr[data-r="${i}"] input`); if (f) f.focus(); }
    else if (name === 'addcol') addColumnMenu(anchor);
    else if (name === 'labels') labelsDialog();
    else if (name === 'png') savePng();
    else if (name === 'more') moreMenu(anchor);
    else if (name === 'import') $('.nb-file').click();
  }
  $('.nb-bar').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
  titleIn.addEventListener('change', () => { nb.title = titleIn.value.trim(); changed(); });
  $('.nb-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  function setTab(t) { tab = t; root.dataset.tab = t; root.querySelectorAll('.nb-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t))); requestAnimationFrame(drawGraph); }
  function place() {
    const w = root.clientWidth; if (!w) return;
    const nowWide = w >= 880;
    if (nowWide !== wide || !modelBox.parentElement) { wide = nowWide; root.classList.toggle('nb-wide', wide); (wide ? $('.nb-slot-model') : $('.nb-slot-model2')).appendChild(modelBox); }
    drawGraph();
  }
  new ResizeObserver(place).observe(root);
  new ResizeObserver(drawGraph).observe(canvas.parentElement);

  function renderAll() { titleIn.value = nb.title || ''; renderTable(); renderAxes(); place(); renderModel(); drawGraph(); if (opts.onChange) opts.onChange(nb); }
  const api = {
    el: root, get nb() { return nb; }, record, recordSetup, status, changed, setTab, importText, csv: () => S.toCSV(nb), dialog: openDialog, closeDialog,
    /** Switch to another saved notebook (one per lab). */
    open(slot) { clearTimeout(saveT); S.save(nb); nb = S.load(slot) || S.touch(S.newNotebook(slot)); if (!nb.seed) nb.seed = 1 + Math.floor(Math.random() * 999998); renderAll(); return nb; },
    /** Columns and Record mapping from a template (the instructor URL switch): only into an empty notebook. */
    template(tpl) {
      if (nb.cols.length || !tpl) return false;
      const ids = {};
      for (const c of tpl.cols || []) { const def = { ...c }; delete def.key; if (def.src) def.src = ids[def.src]; if (def.in) def.in = Object.fromEntries(Object.entries(def.in).map(([k, v]) => [k, ids[v]])); ids[c.key] = S.addColumn(nb, def).id; }
      nb.recordMap = (tpl.cols || []).filter((c) => c.raw).map((c) => ({ raw: c.raw, col: ids[c.key] }));
      if (tpl.graph) Object.assign(nb.graph, Object.fromEntries(Object.entries(tpl.graph).map(([k, v]) => [k, ids[v] || v])));
      if (tpl.model) { nb.model.type = tpl.model; }
      changed({ structure: true }); return true;
    },
  };
  setTab('table'); renderAll();
  return api;
}
export { UNITS, DIM_LABEL };
