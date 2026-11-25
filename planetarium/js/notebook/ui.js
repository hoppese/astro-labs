// notebook/ui.js: the lab notebook on screen: a general spreadsheet (the student names every column and gives it a
// unit), conversion / relation / calculated columns with their rule in the header and the chain drawn above the table,
// a graph that starts empty (the student chooses the axes and writes the labels), and generic model curves fitted BY
// HAND with sliders. Used inside the planetarium (js/notebook/host.js supplies `host`: Record and observing
// conditions) and on its own page (notebook.html, host = null). Nothing here knows about any particular lab.

import { fmtNum, parseNum, colLetter, whyNotNumber } from './format.js';
import { UNIT, unitGroups, compatible, convertRule, predictReason, RELATIONS, RELATION, CONSTANTS, unitSym, withUnit, UNITS, DIM_LABEL } from './units.js';
import { parse, analyse, pretty, letterTrap, unitParts, partsUnitId, FormulaError } from './formula.js';
import { MODELS, MODEL, variant, switchPhase, extent, anchors, residuals, bestFit } from './models.js';
import * as S from './store.js';
import { drawChart } from './chart.js';
import { openAbout, closeAbout } from './about.js';
import { PRACTICE, practiceData } from './practice.js';

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
  let tab = 'table', wide = false, saveT = 0, layout = null, statusT = 0, past = [], future = [], snap = '';
  if (!nb.seed) nb.seed = 1 + Math.floor(Math.random() * 999998);

  root.classList.add('nb');
  root.setAttribute('role', 'group'); root.setAttribute('aria-label', 'Notebook');
  root.innerHTML = `
    <div class="nb-bar">
      <input class="nb-title" type="text" placeholder="Title of this notebook (yours to write)" aria-label="Notebook title" maxlength="120">
      <div class="nb-btns">
        ${host ? '<button class="nb-btn primary tb" data-act="record" title="Copy the readings now on screen into a new row">Record</button>' : ''}
        <button class="nb-btn t tb" data-act="addrow">Add Row</button>
        <button class="nb-btn t tb" data-act="addcol" aria-haspopup="true">Add Column</button>
        <button class="nb-btn g" data-act="labels">Edit Chart Labels</button>
        <button class="nb-btn g" data-act="png">Save Graph</button>
        <button class="nb-btn" data-act="more" aria-haspopup="true" aria-label="More: export, import, settings" title="Export, import, settings">&#8943;</button>
      </div>
    </div>
    <div class="nb-tabs" role="tablist"><button role="tab" data-tab="table">Table</button><button role="tab" data-tab="graph">Graph and model</button></div>
    <div class="nb-main">
      <div class="nb-left"><div class="nb-pbar"><h4>Table</h4><div class="nb-btns" data-slot="t"></div></div><div class="nb-tablewrap" tabindex="-1"></div><div class="nb-bad" role="status" hidden></div></div>
      <div class="nb-split" role="separator" aria-orientation="vertical" aria-label="Divider between the table and the graph" tabindex="0" title="Drag to give the table or the graph more room (double-click: back to the usual widths)"></div>
      <div class="nb-right">
        <div class="nb-pbar nb-gbar"><h4>Graph</h4><div class="nb-axes"></div><div class="nb-btns" data-slot="g"></div></div>
        <div class="nb-stick"><div class="nb-chartwrap"><canvas class="nb-chart" role="img" aria-label="Your graph"></canvas><div class="nb-tip" hidden></div></div><div class="nb-fit" hidden></div></div>
        <div class="nb-slot-model2"></div>
      </div>
    </div>
    <div class="nb-foot"><button class="nb-fb" data-act="undo" title="Undo (Ctrl/Cmd + Z)" >Undo</button><button class="nb-fb" data-act="redo" title="Redo (Ctrl/Cmd + Shift + Z)" >Redo</button>
      <span class="nb-practice" hidden title="These numbers were made up by the notebook, to practise on">practice data</span><div class="nb-status" role="status" aria-live="polite"></div></div>
    <div class="nb-pop" hidden></div>
    <div class="nb-modal" hidden><div class="nb-dialog" role="dialog" aria-modal="true"></div></div>
    <input type="file" class="nb-file" accept=".csv,.tsv,.txt,text/csv" hidden>`;
  const $ = (sel) => root.querySelector(sel);
  const modelBox = h('div', { class: 'nb-model' }, '<div class="nb-part" data-part="0"><div class="nb-mhead"></div><div class="nb-mbody"></div></div><div class="nb-part nb-m2" data-part="1"><div class="nb-mhead"></div><div class="nb-mbody"></div></div>');
  const titleIn = $('.nb-title'), tableWrap = $('.nb-tablewrap'), axesBox = $('.nb-axes'), fitBox = $('.nb-fit'), badBox = $('.nb-bad'), canvas = $('.nb-chart'), tip = $('.nb-tip');
  const modal = $('.nb-modal'), dialog = $('.nb-dialog'), pop = $('.nb-pop'), statusBox = $('.nb-status');

  // ---- small services ---------------------------------------------------------------------------------------------------
  // Undo: every step is a copy of what the student made (not the seed or the observing conditions). Moving one slider is one step.
  const KEEP = ['title', 'student', 'practice', 'cols', 'rows', 'graph', 'model', 'model2', 'recordMap', 'recordClear', 'predict', 'nextId'];
  const copy = () => JSON.stringify(Object.fromEntries(KEEP.map((k) => [k, nb[k]])));
  function remember() {
    const now = copy(); if (now === snap) return;
    if (snap) { past.push(snap); if (past.length > 120 || past.reduce((a, s) => a + s.length, 0) > 8e6) past.shift(); future = []; status(''); }
    snap = now; footState();
  }
  function resetHistory() { past = []; future = []; snap = copy(); footState(); }
  function travel(from, to, word) {
    if (!from.length) { status(`Nothing to ${word}.`); return; }
    to.push(snap); snap = from.pop();
    Object.assign(nb, JSON.parse(snap)); S.touch(nb); closePop();
    clearTimeout(saveT); saveT = 0; S.save(nb); titleIn.value = titleIn.defaultValue = nb.title || '';
    renderTable(); renderAxes(); renderModel(); drawGraph(); footState();
    if (!root.contains(document.activeElement)) tableWrap.focus({ preventScroll: true });
    if (opts.onChange) opts.onChange(nb);
    status(word === 'undo' ? 'Undone.' : 'Done again.');
  }
  const undo = () => travel(past, future, 'undo'), redo = () => travel(future, past, 'redo');
  function footState() { root.querySelector('[data-act=undo]').disabled = !past.length; root.querySelector('[data-act=redo]').disabled = !future.length; root.querySelector('.nb-practice').hidden = !nb.practice; }
  /** Ctrl/Cmd + Z and friends. True when the key was used. A text box with unfinished typing keeps the browser's own undo. */
  function undoKey(e) {
    if (!(e.metaKey || e.ctrlKey) || e.altKey || !modal.hidden || root.querySelector('.nb-about')) return false;
    const k = e.key.toLowerCase(), re = k === 'y' || (k === 'z' && e.shiftKey);
    if (k !== 'z' && k !== 'y') return false;
    const a = document.activeElement;
    if (a && root.contains(a) && a.matches('input[type=text]') && a.value !== a.defaultValue && !(re && future.length && !a.matches('td.in input'))) return false;
    e.preventDefault(); if (re) redo(); else undo(); return true;
  }
  function changed({ structure = false } = {}) {
    S.touch(nb); remember();
    clearTimeout(saveT); saveT = setTimeout(() => { saveT = 0; S.save(nb); }, 250);
    followData();
    if (structure) renderTable(); else refreshComputed();
    renderAxes(); renderModel(); drawGraph();
    if (opts.onChange) opts.onChange(nb);
  }
  /** One line at the foot of the notebook, over nothing. `undoable` adds an Undo button. */
  function status(text, kind = '', undoable = false) {
    statusBox.innerHTML = esc(text) + (undoable ? ' <button class="nb-link" data-act="undo">Undo</button>' : ''); statusBox.className = 'nb-status' + (kind ? ' ' + kind : ''); statusBox.title = text;
    clearTimeout(statusT); if (text) statusT = setTimeout(() => status(''), kind === 'warn' ? 12000 : 6000);
  }
  function openDialog(title, bodyHtml, { wideDlg = false } = {}) {
    dialog.className = 'nb-dialog' + (wideDlg ? ' wide' : '');
    dialog.innerHTML = `<h3>${esc(title)}<button class="nb-x" data-close aria-label="Close">&times;</button></h3><div class="nb-dbody">${bodyHtml}</div>`;
    modal.hidden = false; closePop();
    // a field called "name" is the student's column name, not a log-in: keep browsers' and password managers' autofill out of it
    dialog.querySelectorAll('input').forEach((i) => { i.autocomplete = 'off'; i.setAttribute('data-lpignore', 'true'); i.setAttribute('data-1p-ignore', ''); i.setAttribute('data-form-type', 'other'); });
    // focus the first field now, and again after the menu that opened this dialog has gone (its button would keep the focus)
    const foc = () => { const f = dialog.querySelector('.nb-dbody input:not([type=hidden]):not([type=checkbox]), .nb-dbody select, .nb-dbody textarea, .nb-dbody button.primary'); if (f && !dialog.contains(document.activeElement)) f.focus({ preventScroll: true }); };
    modal.scrollTop = 0;
    foc(); setTimeout(foc, 30); setTimeout(foc, 120);
    return dialog.querySelector('.nb-dbody');
  }
  function closeDialog() { modal.hidden = true; dialog.innerHTML = ''; if (!root.contains(document.activeElement)) tableWrap.focus({ preventScroll: true }); }
  // Enter presses the dialog's main button (a list, a button or a tick-box keeps its own use of the key); Tab stays inside the dialog
  dialog.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) {
      const el = e.target; if (el.matches('button, textarea, summary, a, .nb-fnum')) return;
      const ok = dialog.querySelector('.nb-dbody [data-ok]:not(:disabled), .nb-dbody .nb-answer:not([hidden]) button'); if (ok) { e.preventDefault(); ok.click(); }
    } else if (e.key === 'Tab') {
      const f = [...dialog.querySelectorAll('input, select, button, a[href], textarea, summary')].filter((x) => !x.disabled && x.offsetParent !== null); if (!f.length) return;
      const i = f.indexOf(document.activeElement);
      if (e.shiftKey ? i <= 0 : i === f.length - 1 || i < 0) { e.preventDefault(); f[e.shiftKey ? f.length - 1 : 0].focus(); }
    }
  });
  modal.addEventListener('click', (e) => { if (e.target === modal || e.target.closest('[data-close]')) closeDialog(); });
  function openPop(anchor, items) {
    pop.innerHTML = items.map((it, i) => (it ? `<button data-i="${i}"${it.disabled ? ' disabled' : ''}><b>${esc(it.label)}</b>${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</button>` : '<hr>')).join('');
    pop.hidden = false;
    const r = anchor.getBoundingClientRect(), R = root.getBoundingClientRect();
    pop.style.top = (r.bottom - R.top + 4) + 'px';
    pop.style.left = Math.max(6, Math.min(R.width - pop.offsetWidth - 6, r.left - R.left)) + 'px';
    pop.style.maxHeight = Math.max(140, R.bottom - r.bottom - 12) + 'px';
    const first = pop.querySelector('button:not(:disabled)'); if (first) first.focus({ preventScroll: true });
    pop.onclick = (e) => { const b = e.target.closest('button[data-i]'); if (!b) return; closePop(); items[+b.dataset.i].run(); };
  }
  function closePop() { pop.hidden = true; }
  root.addEventListener('pointerdown', (e) => { if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('[aria-haspopup]')) closePop(); });
  pop.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const f = [...pop.querySelectorAll('button:not(:disabled)')], i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.key === 'ArrowDown' ? 1 : f.length - 1)) % f.length].focus();
  });
  root.addEventListener('keydown', (e) => {
    if (undoKey(e)) { e.stopPropagation(); return; }
    if (e.key === 'Escape') { if (!modal.hidden) { closeDialog(); e.stopPropagation(); } else if (!pop.hidden) { closePop(); e.stopPropagation(); } return; }
    if (e.target.matches('input, select, textarea')) e.stopPropagation();          // typing here must not drive the sky
  });
  const colName = (c) => `${S.letterOf(nb, c.id)}${c.name ? ' · ' + c.name : ''}`;
  const colFull = (c) => { const u = S.unitInfo(nb, c).label; return colName(c) + (u ? ` (${u})` : ''); };
  const numericCols = () => nb.cols.filter((c) => c.kind !== 'text');
  /** A name every column needs, so that its graph, its formula and its table can be read: '' when fine, else what to say. */
  function nameTrouble(name, unit = null, self = null) {
    if (!name) return 'Give the column a name, in your own words: what is in it?';
    const twin = nb.cols.find((c) => c !== self && c.name.trim().toLowerCase() === name.toLowerCase() && (unit == null || c.kind === 'text' || (UNIT[unit] ? UNIT[unit].sym : unit) === S.unitInfo(nb, c).label));
    return twin ? `Column ${S.letterOf(nb, twin.id)} is already called “${twin.name}”. Choose a name that tells the two apart.` : '';
  }
  const complain = (b, why, sel = '[name=name]') => { let e = b.querySelector('[data-err]'); if (!e) { e = h('p', { class: 'nb-err', 'data-err': true, role: 'alert' }); b.querySelector('.nb-row').before(e); } e.textContent = why; e.hidden = !why; const f = why && sel && b.querySelector(sel); if (f) f.focus(); return !!why; };

  // ---- table --------------------------------------------------------------------------------------------------------------
  function headHtml(c, i) {
    const ui = S.unitInfo(nb, c), r = S.ruleOf(nb, c);
    const waiting = c.kind === 'convert' && c.shown === false;
    return `<th data-col="${c.id}" class="k-${c.kind}${r.error ? ' bad' : ''}" tabindex="0" title="Click to change this column: its name, its unit or rule, its figures">` +
      `<div class="nb-h1"><span class="L">${colLetter(i)}</span><span class="nm">${esc(c.name) || '<i>unnamed</i>'}</span>${ui.label ? `<span class="u">(${esc(ui.label)})</span>` : ''}</div>` +
      (c.kind === 'const' ? `<div class="nb-h2">= <b>${esc(fmtNum(+c.value, c.sig))}</b></div><div class="nb-h3">${esc(c.from || '')}</div>` : '') + (r.head ? `<div class="nb-h2">${esc(r.head)}${r.rule && !waiting ? ` <b>${esc(r.rule)}</b>` : ''}</div>` : r.kind === 'recorded' ? `<div class="nb-h2 rec">${esc(r.text)}</div>` : '') +
      (r.error ? `<div class="nb-h3 err">${esc(r.error)}</div>` : waiting ? '<div class="nb-h3"><button class="nb-link" data-predict="' + c.id + '">bigger or smaller? tap to fill</button></div>' : r.why ? `<div class="nb-h3${r.warn ? ' err' : ''}">${esc(r.why)}</div>` : '') + '</th>';
  }
  function renderTable() {
    if (!nb.cols.length) {
      tableWrap.innerHTML = `<div class="nb-empty"><p><b>This table is empty.</b> Set it up yourself: add a column for each thing you will measure or type in, give it a name and a unit.</p>
        <p><button class="nb-btn primary" data-act="addcol" aria-haspopup="true">Add Column</button>${host ? ' <button class="nb-btn" data-act="recsetup">Choose what Record copies</button>' : ''} <button class="nb-btn" data-act="import">Open a CSV file</button></p>
        <p class="nb-hint">You can also paste a block of cells here. To try the graph and the sliders first: <button class="nb-link" data-act="practice" aria-haspopup="true">practice data</button> (made up).</p>
        <p class="nb-hint">Later you can add columns that convert units (arcseconds → degrees → radians) or calculate from other columns; the notebook shows the rule it uses.</p></div>`;
      return;
    }
    let html = '<table class="nb-table"><thead><tr><th class="rn"></th>' + nb.cols.map(headHtml).join('') + '<th class="rx"></th></tr></thead><tbody>';
    nb.rows.forEach((row, i) => {
      html += `<tr data-r="${i}"><td class="rn">${i + 1}</td>` + nb.cols.map((c) => (c.kind === 'data' || c.kind === 'text'
        ? `<td class="in"><input type="text" ${c.kind === 'data' ? 'inputmode="decimal"' : ''} data-r="${i}" data-c="${c.id}" value="${esc(cellShown(c, i))}" aria-label="${esc(c.name || 'column')} row ${i + 1}"></td>`
        : `<td class="calc" data-c="${c.id}">${esc(S.cellText(nb, c, i))}</td>`)).join('') +
        `<td class="rx"><button data-delrow="${i}" tabindex="-1" title="Delete row ${i + 1}" aria-label="Delete row ${i + 1}">&times;</button></td></tr>`;
    });
    if (nb.cols.some((c) => c.foot && (c.foot.mean || c.foot.count))) html += '<tfoot><tr><td class="rn"></td>' + nb.cols.map((c) => `<td data-foot="${c.id}"></td>`).join('') + '<td class="rx"></td></tr></tfoot>';
    html += '</tbody></table>' + (nb.rows.length ? '' : '<div class="nb-hint pad">No rows yet. Press <b>Add Row</b> and type' + (host ? ', or <b>Record</b> to copy a reading from the sky' : '') + '. You can also paste a block of cells.</div>');
    const was = [tableWrap.scrollLeft, tableWrap.scrollTop];
    tableWrap.innerHTML = html; tableWrap.scrollLeft = was[0]; tableWrap.scrollTop = was[1];
    refreshComputed();
  }
  // a typed cell keeps exactly what was typed; a recorded number is shown with the column's figures
  const cellShown = (c, i) => { const v = nb.rows[i][c.id]; return v == null ? '' : typeof v === 'number' ? (c.kind === 'data' ? fmtNum(v, c.sig) : String(v)) : String(v); };
  function refreshComputed() {
    for (const c of nb.cols) {
      if (c.kind === 'data' || c.kind === 'text') continue;
      tableWrap.querySelectorAll(`td.calc[data-c="${c.id}"]`).forEach((td, i) => { td.textContent = S.cellText(nb, c, i); });
    }
    for (const c of nb.cols) { const td = tableWrap.querySelector(`td[data-foot="${c.id}"]`); if (!td || !c.foot || c.kind === 'text') continue; const f = S.footOf(nb, c); td.innerHTML = [c.foot.mean && `mean <b>${esc(f.n ? fmtNum(f.mean, c.sig || 5) : 'none')}</b>`, c.foot.count && `count <b>${f.n}</b>`].filter(Boolean).join('<br>'); }
    const bad = [];
    tableWrap.querySelectorAll('td.in input').forEach((inp) => {
      const c = S.colById(nb, inp.dataset.c), why = c.kind === 'data' && inp !== document.activeElement ? whyNotNumber(inp.value) : c.kind === 'data' && inp.value === inp.defaultValue ? whyNotNumber(inp.value) : '';
      inp.classList.toggle('bad', !!why); inp.title = why; if (why) { inp.setAttribute('aria-invalid', 'true'); bad.push(`Row ${+inp.dataset.r + 1}, column ${S.letterOf(nb, c.id)}: ${why}.`); } else inp.removeAttribute('aria-invalid');
    });
    badBox.hidden = !bad.length; badBox.textContent = bad.slice(0, 2).join(' ') + (bad.length > 2 ? ` And ${bad.length - 2} more cell${bad.length > 3 ? 's' : ''} underlined.` : '') + (bad.length ? ' Left out of the graph until corrected.' : '');
  }
  /** Where a column comes from and what is made from it, as the arrow chain shown in that column's own dialog. */
  function chainHtml(id) {
    const node = (nid, full = true) => { const c = S.colById(nb, nid), u = S.unitInfo(nb, c).label; return `<button type="button" class="nb-node k-${c.kind}${nid === id ? ' me' : ''}" data-col="${nid}"><b>${S.letterOf(nb, nid)}</b>${full ? ` ${esc(c.name)}${u ? ` <i>(${esc(u)})</i>` : ''}` : ''}</button>`; };
    const kid = (k) => { const kc = S.colById(nb, k.id), r = S.ruleOf(nb, kc); return `<span class="nb-kid"><span class="nb-arrow"><i>${esc(kc.kind === 'convert' && kc.shown === false ? '?' : r.kind === 'convert' ? r.rule : r.kind === 'physics' ? r.rule.replace('uses ', '') : 'formula')}</i></span>${node(k.id)}${k.kids.length ? `<span class="nb-kids">${k.kids.map(kid).join('')}</span>` : ''}</span>`; };
    const has = (k) => k.id === id || k.kids.some(has);
    const rows = S.flow(nb).filter((t) => t.from.includes(id) || t.kids.some(has));
    return rows.length ? `<div class="nb-chain">${rows.map((t) => `<div class="nb-chainrow">${t.from.map((x) => node(x, t.from.length === 1)).join(' ')}<span class="nb-kids">${t.kids.map(kid).join('')}</span></div>`).join('')}</div>` : '';
  }
  /** Pointing at a column's header marks the columns it is made from (solid) and the ones made from it (dashed). */
  function showLinks(th) {
    const id = th && th.dataset.col, c = id && S.colById(nb, id), from = c ? S.depsOf(nb, c) : [], to = c ? S.dependents(nb, id).map((x) => x.id) : [];
    tableWrap.querySelectorAll('th[data-col]').forEach((t) => { t.classList.toggle('src', from.includes(t.dataset.col)); t.classList.toggle('made', to.includes(t.dataset.col)); });
  }
  const overTh = (e) => showLinks(e.target.closest && e.target.closest('th[data-col]'));
  tableWrap.addEventListener('pointerover', overTh); tableWrap.addEventListener('focusin', overTh);
  tableWrap.addEventListener('pointerleave', () => showLinks(null)); tableWrap.addEventListener('focusout', () => showLinks(null));
  tableWrap.addEventListener('change', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    S.setCell(nb, +inp.dataset.r, inp.dataset.c, inp.value.trim() === '' ? undefined : inp.value.trim());
    inp.defaultValue = inp.value;
    changed();
  });
  tableWrap.addEventListener('keydown', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    const r = +inp.dataset.r, go = (rr) => { const t = tableWrap.querySelector(`input[data-r="${rr}"][data-c="${inp.dataset.c}"]`); if (t) { t.focus(); t.select(); } };
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); inp.dispatchEvent(new Event('change', { bubbles: true })); if (r + 1 >= nb.rows.length && e.key === 'Enter') { S.addRow(nb); changed({ structure: true }); } go(r + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); go(r - 1); }
    else if (e.key === 'Escape') { if (inp.value !== inp.defaultValue) { inp.value = inp.defaultValue; e.stopPropagation(); } }
    else if (e.key === 'Tab' && !e.shiftKey) {
      // Tab goes along the row and then to the start of the next one, adding a row at the end of the table (unless this last row is empty)
      const typed = nb.cols.filter((c) => c.kind === 'data' || c.kind === 'text');
      if (inp.dataset.c !== typed[typed.length - 1].id) return;
      inp.blur();                                          // what was typed is entered (its change event) before any row is added
      if (r + 1 >= nb.rows.length) { if (!typed.some((c) => nb.rows[r][c.id] != null && nb.rows[r][c.id] !== '')) { inp.focus(); return; } S.addRow(nb); changed({ structure: true }); }
      e.preventDefault();
      const next = tableWrap.querySelector(`input[data-r="${r + 1}"][data-c="${typed[0].id}"]`); if (next) { next.focus(); next.select(); }
    }
  });
  tableWrap.addEventListener('paste', (e) => {
    const inp = e.target; if (!inp.matches('td.in input')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text');
    if (!/[\t\n]/.test(text.trim())) return;                         // a single value: let the browser paste it
    e.preventDefault(); e.stopPropagation(); askDelimiter(text, (d) => pasteBlock(text, +inp.dataset.r, inp.dataset.c, d));
  });
  /** Commas that could be thousands or could separate columns: the student says which. */
  function askDelimiter(text, then) {
    const d = S.delimiterOf(text); if (d !== 'ask') { then(d); return; }
    const ex = (/[-+−]?\d{1,3}(,\d{3})+(\.\d+)?/.exec(text) || ['1,249'])[0];
    const b = openDialog('What are the commas for?', `<p class="nb-lead">These cells look like <b>${esc(ex)}</b>. Is that one number, or numbers in separate columns?</p><div class="nb-row big"><button class="nb-btn primary" data-d="">One number: ${esc(ex.replace(/,/g, ''))}</button><button class="nb-btn" data-d=",">Separate columns: ${esc(ex.split(',').join(' and '))}</button></div>`);
    b.addEventListener('click', (e) => { const g = e.target.closest('[data-d]'); if (g) { closeDialog(); then(g.dataset.d); } });
  }
  /** Paste a block of cells starting at a cell: fills typed columns to the right, adding columns when the block is wider. A
   *  first row of words over numbers is taken as headings: it names columns that have no name, and is never data. */
  function pasteBlock(text, r0, colId, delim) {
    let rows = S.parseCSV(text.trim(), delim);
    const typed = nb.cols.filter((c) => c.kind === 'data' || c.kind === 'text'), k0 = Math.max(0, typed.findIndex((c) => c.id === colId));
    const isNum = (v) => v != null && v.trim() !== '' && !Number.isNaN(parseNum(v));
    const head = rows.length > 1 && !rows[0].some(isNum) && rows[0].some((v, k) => v.trim() && rows.slice(1).some((r) => isNum(r[k]))) ? rows[0] : null;
    if (head) rows = rows.slice(1);
    const wide = Math.max(...rows.map((r) => r.length)); let added = 0;
    while (typed.length - k0 < wide) { const k = typed.length - k0; typed.push(S.addColumn(nb, { kind: rows.some((r) => isNum(r[k])) ? 'data' : 'text', name: head && head[k] ? head[k].trim() : '', unit: '', sig: 0 })); added++; }
    rows.forEach((cells, i) => cells.forEach((v, k) => { const c = typed[k0 + k]; if (c && v.trim() !== '') S.setCell(nb, r0 + i, c.id, v.trim()); }));
    changed({ structure: true });
    status(`Pasted ${rows.length} row${rows.length > 1 ? 's' : ''}.` + (head ? ' The first row was headings, not data.' : '') + (added ? ` ${added} new column${added > 1 ? 's' : ''}: name ${added > 1 ? 'them' : 'it'} by clicking the heading.` : ''), '', true);
  }
  // an empty notebook takes a pasted table whole
  document.addEventListener('paste', (e) => {
    if (nb.cols.length || !root.clientWidth || !modal.hidden || !(opts.standalone || root.contains(e.target) || root.contains(document.activeElement) || e.target.contains(root) && e.target !== document.body)) return;
    if (e.target.matches && e.target.matches('input, textarea')) return;
    const text = (e.clipboardData || window.clipboardData).getData('text'); if (!text.trim()) return;
    e.preventDefault(); askDelimiter(text, (d) => { try { importText(text, d); status(`Pasted ${nb.rows.length} row${nb.rows.length === 1 ? '' : 's'}. Click a heading to name the column and give its unit.`, '', true); } catch (err) { status('That text has no table in it.', 'warn'); } });
  });
  tableWrap.addEventListener('click', (e) => {
    const d = e.target.closest('[data-delrow]'); if (d) { S.removeRow(nb, +d.dataset.delrow); changed({ structure: true }); status(`Row ${+d.dataset.delrow + 1} deleted.`, '', true); return; }
    const pr = e.target.closest('[data-predict]'); if (pr) { e.stopPropagation(); askPrediction(S.colById(nb, pr.dataset.predict)); return; }
    const th = e.target.closest('th[data-col]'); if (th) { columnDialog(S.colById(nb, th.dataset.col)); return; }
    const a = e.target.closest('[data-act]'); if (a) act(a.dataset.act, a);
  });
  tableWrap.addEventListener('keydown', (e) => { const th = e.target.closest && e.target.closest('th[data-col]'); if (th && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); columnDialog(S.colById(nb, th.dataset.col)); } });
  // the last change is still waiting for its timer when the page is left
  window.addEventListener('pagehide', () => { if (saveT) { clearTimeout(saveT); saveT = 0; S.save(nb); } });


  // ---- column dialogs ---------------------------------------------------------------------------------------------------------
  const sigSelect = (v) => `<label class="nb-f">Figures shown <select name="sig">${SIGS.map(([n, t]) => `<option value="${n}"${n === v ? ' selected' : ''}>${t}</option>`).join('')}</select></label>`;
  function addColumnMenu(anchor) {
    openPop(anchor, [
      { label: 'Data column', sub: 'numbers you type, paste or record; you choose the name and the unit', run: () => dataColumnDialog() },
      { label: 'Text column', sub: 'words: names of objects, notes', run: textColumnDialog },
      null,
      { label: 'Convert units…', sub: 'a column in another unit: you pick the column and the unit, the notebook shows the rule', run: convertDialog, disabled: !nb.cols.some((c) => S.unitInfo(nb, c).id && compatible(S.unitInfo(nb, c).id).length) },
      { label: 'Use a relation (physics)…', sub: 'distance from parallax, size from distance and angle', run: relationDialog, disabled: !numericCols().length },
      { label: 'Calculate from other columns…', sub: 'build a formula with buttons, or type it', run: () => calcDialog(null), disabled: !numericCols().length },
    ]);
  }
  function textColumnDialog() {
    const b = openDialog('New text column', '<label class="nb-f">Name: what is in this column? <input name="name" type="text" maxlength="60" placeholder="your own words"></label><div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>');
    b.querySelector('[data-ok]').addEventListener('click', () => { const name = b.querySelector('[name=name]').value.trim(); if (complain(b, nameTrouble(name))) return; S.addColumn(nb, { kind: 'text', name }); if (!nb.rows.length) S.addRow(nb); closeDialog(); changed({ structure: true }); });
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
      const name = b.querySelector('[name=name]').value.trim(); if (complain(b, nameTrouble(name, u))) return;
      S.addColumn(nb, { kind: 'data', name, unit: u, sig: +b.querySelector('[name=sig]').value });
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
      <p class="nb-def" data-words></p><div data-ins></div><p class="nb-def nb-caution" data-caution hidden></p>
      <label class="nb-f">Name of the new column <input name="name" type="text" maxlength="60" placeholder="your own words"></label>
      <p class="nb-err" data-err hidden></p>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>`);
    const rel = b.querySelector('[name=rel]'), ins = b.querySelector('[data-ins]'), err = b.querySelector('[data-err]');
    const fill = () => {
      const R = RELATION[rel.value]; b.querySelector('[data-words]').textContent = `uses ${R.uses}: ${R.words}.`; b.querySelector('[data-caution]').textContent = R.caution || ''; b.querySelector('[data-caution]').hidden = !R.caution;
      ins.innerHTML = R.inputs.map((i) => { const ok = nb.cols.filter((c) => { const u = S.unitInfo(nb, c).id; return u && UNIT[u].dim === i.dim; }); return `<label class="nb-f">Column for the ${esc(i.label)} <select name="in-${i.key}">${ok.length ? '<option value="">choose the column…</option>' + ok.map((c) => `<option value="${c.id}">${esc(colFull(c))}</option>`).join('') : `<option value="">no column has ${i.dim === 'angle' ? 'an angle' : 'a ' + i.dim} unit yet</option>`}</select></label>`; }).join('');
    };
    rel.addEventListener('change', fill); fill();
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const R = RELATION[rel.value], inp = {};
      const name = b.querySelector('[name=name]').value.trim();
      for (const i of R.inputs) { inp[i.key] = b.querySelector(`[name="in-${i.key}"]`).value; if (!inp[i.key]) { err.textContent = `Choose the column that holds the ${i.label} (it needs ${i.dim === 'angle' ? 'an angle' : 'a ' + i.dim} unit).`; err.hidden = false; return; } }
      if (complain(b, nameTrouble(name))) return;
      S.addColumn(nb, { kind: 'relation', name, rel: R.id, in: inp, sig: 4 });
      closeDialog(); changed({ structure: true });
    });
  }
  /** Guided formula builder. Buttons add pieces; the text box underneath can also be typed in. Units are checked live. */
  function calcDialog(col) {
    const cols = numericCols().filter((c) => !col || c.id !== col.id);
    const b = openDialog(col ? `Column ${S.letterOf(nb, col.id)}: formula` : 'Calculate a new column', `
      <p class="nb-lead">Build the formula from the buttons (or type it). Columns go in by their letter. The notebook works out the unit of the answer and refuses a formula that mixes unlike things.</p>
      <div class="nb-fpretty" data-pretty aria-live="polite"></div>
      <input class="nb-ftext" name="formula" type="text" spellcheck="false" autocomplete="off" placeholder="press the buttons, or type letters, numbers and + − × ÷" value="${esc(col ? col.formula : '')}" aria-label="Formula">
      <div class="nb-fgroup"><span>Columns</span>${cols.map((c) => { const u = S.unitInfo(nb, c).label, L = S.letterOf(nb, c.id); return `<button class="nb-chip col" data-ins="${L === 'G' || L === 'AU' ? '[' + L + ']' : L}"><b>${L}</b> ${esc(c.name)}${u ? ` <i>(${esc(u)})</i>` : ''}</button>`; }).join('')}</div>
      <div class="nb-fgroup"><span>Operations</span>${[['+', ' + '], ['−', ' - '], ['×', ' * '], ['÷', ' / '], ['x²', '^2'], ['x³', '^3'], ['xⁿ', '^'], ['(', '('], [')', ')'], ['√', 'sqrt('], ['sin', 'sin('], ['cos', 'cos('], ['tan', 'tan('], ['log₁₀', 'log(']].map(([t, v]) => `<button class="nb-chip" data-ins="${v}">${t}</button>`).join('')}</div>
      <div class="nb-fgroup"><span>Constants</span>${[['π', 'pi'], ['G', 'G'], ['c (light)', 'c_light'], ['AU in km', 'AU']].map(([t, v]) => `<button class="nb-chip" data-ins="${v}" title="${esc(CONSTANTS[v === 'G' ? 'Gconst' : v === 'AU' ? 'AUkm' : v === 'c_light' ? 'c' : v].def)}">${t}</button>`).join('')}
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
        const trap = letterTrap(text.value, (L) => !!S.colByLetter(nb, L)); if (trap) throw new FormulaError(trap);
        const a = analyse(tree, (L) => { const c = S.colByLetter(nb, L), ui = S.unitInfo(nb, c); if (ui.text) throw new FormulaError(`Column ${L} holds words, not numbers.`); if (ui.error) throw new FormulaError(`Column ${L} has a problem of its own: ${ui.error}`); return ui.id || ui.parts; });
        pre.textContent = '= ' + pretty(tree);
        res.className = 'nb-fresult ok' + (a.warn ? ' warn' : '');
        res.innerHTML = `Unit of the answer: <b>${a.label ? esc(a.label) : 'none (a pure number)'}</b>` + (a.warn ? `<br>${esc(a.warn)}` : '') + (a.note ? `<br>${esc(a.note)}` : '');
        ok.disabled = false; return tree;
      } catch (e) {
        pre.textContent = '= ' + text.value; res.className = 'nb-fresult bad'; res.textContent = (e instanceof FormulaError ? e.message : 'That formula cannot be read.') + (/is not a column letter/.test(e.message) ? ' Columns go in by their letter (A, B, …).' : ''); ok.disabled = true; return null;
      }
    };
    b.addEventListener('click', (e) => {
      const t = e.target.closest('button'); if (!t) return;
      if (t.dataset.ins != null) { const v = t.dataset.ins; text.value = (text.value + (/^[A-Za-z[(]/.test(v) && /[A-Za-z0-9)\]]$/.test(text.value.trim()) && !/^[(^]/.test(v) ? ' ' : '') + v); check(); }
      else if (t.dataset.num != null) { const n = parseNum(b.querySelector('.nb-fnum').value); if (!Number.isNaN(n)) { text.value += String(n); b.querySelector('.nb-fnum').value = ''; check(); } }
      else if (t.dataset.back != null) { text.value = text.value.replace(/\s*(sqrt\(|sin\(|cos\(|tan\(|log\(|ln\(|abs\(|\[[A-Z]+\]|[A-Za-z_]+|\d+\.?\d*(e[-+]?\d+)?|\^\d?|.)\s*$/i, ''); check(); }
      else if (t.dataset.clear != null) { text.value = ''; check(); }
      else if (t.dataset.ok != null) {
        if (!check()) return;
        const name = b.querySelector('[name=name]').value.trim(); if (complain(b, nameTrouble(name, null, col))) return;
        if (col) { col.formula = text.value.trim(); col.name = name; }
        else S.addColumn(nb, { kind: 'calc', name, formula: text.value.trim(), sig: 4 });
        closeDialog(); changed({ structure: true });
      }
    });
    b.querySelector('.nb-fnum').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); b.querySelector('[data-num]').click(); } });
    text.addEventListener('input', check); check();
  }
  /** The columns a conversion may start from: those with a unit, except itself and anything made from it. */
  function convertSources(col) {
    const below = new Set([col.id]); for (let grew = true; grew;) { grew = false; for (const c of nb.cols) if (!below.has(c.id) && S.depsOf(nb, c).some((d) => below.has(d))) { below.add(c.id); grew = true; } }
    return nb.cols.filter((c) => { const u = S.unitInfo(nb, c).id; return c.id === col.src || (!below.has(c.id) && u && compatible(u).length); });
  }
  function columnDialog(col) {
    if (!col) return;
    const r = S.ruleOf(nb, col), L = S.letterOf(nb, col.id);
    const b = openDialog(`Column ${L}`, `
      <label class="nb-f">Name <input name="name" type="text" maxlength="60" value="${esc(col.name)}" placeholder="your own words"></label>
      ${col.kind === 'data' ? `<label class="nb-f">Unit <select name="unit">${unitOptions(col.unit, { blank: 'no unit (a pure number)' })}${col.unit && !UNIT[col.unit] ? `<option value="${esc(col.unit)}" selected>${esc(col.unit)}</option>` : ''}</select></label>` : ''}
      ${col.kind !== 'text' ? sigSelect(col.sig) + `<div class="nb-f">Under the table: &ensp;<label class="nb-check"><input type="checkbox" name="mean"${col.foot && col.foot.mean ? ' checked' : ''}> the mean</label> &ensp;<label class="nb-check"><input type="checkbox" name="count"${col.foot && col.foot.count ? ' checked' : ''}> how many numbers</label></div>` : ''}
      ${col.kind === 'convert' ? `<label class="nb-f">Convert which column? <select name="csrc">${convertSources(col).map((c) => `<option value="${c.id}"${c.id === col.src ? ' selected' : ''}>${esc(colFull(c))}</option>`).join('')}</select></label>
      <label class="nb-f">Into which unit? <select name="cto"></select></label><p class="nb-def" data-cdef></p>` : ''}
      ${chainHtml(col.id)}
      <p class="nb-def" data-rule>${esc(r.text)}${r.error ? ` — <span class="nb-err">${esc(r.error)}</span>` : ''}</p>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Save</button>${col.kind === 'calc' ? '<button class="nb-btn" data-formula>Edit formula…</button>' : ''}<button class="nb-btn" data-move="-1" title="Move this column one place left"${nb.cols[0] === col ? ' disabled' : ''}>&#8592; Move</button><button class="nb-btn" data-move="1" title="Move this column one place right"${nb.cols[nb.cols.length - 1] === col ? ' disabled' : ''}>Move &#8594;</button><button class="nb-btn danger" data-del>Delete column</button><button class="nb-btn" data-close>Cancel</button></div>
      <p class="nb-err" data-err hidden></p>`);
    const cs = b.querySelector('[name=csrc]'), ct = b.querySelector('[name=cto]');
    if (cs) {
      const say = () => { const moved = cs.value !== col.src || ct.value !== col.unit; b.querySelector('[data-cdef]').textContent = UNIT[ct.value] ? `${UNIT[ct.value].name}: ${UNIT[ct.value].def}` : ''; b.querySelector('[data-rule]').hidden = moved; };
      const fill = () => { ct.innerHTML = unitOptions(ct.value || col.unit, { blank: '', only: compatible(S.unitInfo(nb, S.colById(nb, cs.value)).id).map((x) => x.id) }); say(); };
      cs.addEventListener('change', fill); ct.addEventListener('change', say); fill();
    }
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const u = b.querySelector('[name=unit]') || ct, name = b.querySelector('[name=name]').value.trim();
      if (complain(b, nameTrouble(name, u ? u.value : S.unitInfo(nb, col).label, col))) return;
      const redo = cs && (cs.value !== col.src || ct.value !== col.unit);
      col.name = name; if (u) col.unit = u.value; if (redo) { col.src = cs.value; col.shown = !nb.predict; delete col.guess; }
      const mean = b.querySelector('[name=mean]'); if (mean) col.foot = { mean: mean.checked, count: b.querySelector('[name=count]').checked };
      const s = b.querySelector('[name=sig]'); if (s) col.sig = +s.value;
      closeDialog(); changed({ structure: true });
      if (redo && nb.predict) askPrediction(col);
    });
    b.addEventListener('click', (e) => { const m = e.target.closest('[data-move]'); const n = e.target.closest('.nb-node[data-col]'); if (n && n.dataset.col !== col.id) { columnDialog(S.colById(nb, n.dataset.col)); return; } if (m && S.moveColumn(nb, col.id, +m.dataset.move)) { changed({ structure: true }); columnDialog(col); } });
    const f = b.querySelector('[data-formula]'); if (f) f.addEventListener('click', () => calcDialog(col));
    b.querySelector('[data-del]').addEventListener('click', () => {
      const why = S.removeColumn(nb, col.id);
      if (why) { const e = b.querySelector('[data-err]'); e.textContent = why; e.hidden = false; return; }
      closeDialog(); changed({ structure: true }); status(`Column ${L}${col.name ? ' (' + col.name + ')' : ''} deleted.`, '', true);
    });
  }

  // ---- Record (inside the planetarium only) ----------------------------------------------------------------------------------------
  function recordSetup() {
    const R = host.readings();
    const map = Object.fromEntries(nb.recordMap.map((m) => [m.raw, m.col]));
    const groups = [...new Set(R.map((r) => r.group))];
    const b = openDialog('What should Record copy?', `
      <p class="nb-lead">Record copies <b>raw readings only</b>: what the clock, the angle tool, the stopwatch and the object panel show at that moment. Tick the readings you want. Anything worked out from them is yours to add as a column.</p>
      ${groups.map((g) => `<div class="nb-rgroup">${esc(g)}</div>` + R.filter((r) => r.group === g).map((r) => {
        return `<div class="nb-rrow"><label><input type="checkbox" data-raw="${r.key}"${map[r.key] ? ' checked' : ''}> ${esc(r.label)}${r.unit ? ` <i>(${esc(unitSym(r.unit))})</i>` : ''}</label>
          <span class="now">${r.value == null ? 'nothing to read now' : 'now: ' + esc(typeof r.value === 'string' ? r.value : fmtNum(r.value, r.sig || 0))}</span></div>`;
      }).join('')).join('')}
      <label class="nb-check"><input type="checkbox" name="clear"${nb.recordClear !== false ? ' checked' : ''}> Clear the angle tool after each Record, ready for the next measurement</label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Next: name the columns</button><button class="nb-btn" data-close>Cancel</button></div>`, { wideDlg: true });
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const picked = R.filter((r) => b.querySelector(`[data-raw="${r.key}"]`).checked), clear = b.querySelector('[name=clear]') ? b.querySelector('[name=clear]').checked : nb.recordClear;
      if (!picked.length) { complain(b, 'Nothing is ticked: tick at least one reading.', null); return; }
      recordNames(picked, map, clear);
    });
  }
  /** Second page: which column each ticked reading goes into, and the student's name for a new one. */
  function recordNames(R, map, clear) {
    const b = openDialog('Where does each reading go?', '<p class="nb-lead">A new column needs a name of your own.</p>' + R.map((r) => {
      const fits = nb.cols.filter((c) => (r.kind === 'text' ? c.kind === 'text' : c.kind === 'data' && (c.unit || '') === (r.unit || '')));
      return `<div class="nb-rname"><b>${esc(r.label)}${r.unit ? ` (${esc(unitSym(r.unit))})` : ''}</b><select data-col="${r.key}" aria-label="Column for ${esc(r.label)}"><option value="">a new column</option>${fits.map((c) => `<option value="${c.id}"${map[r.key] === c.id ? ' selected' : ''}>${esc(colName(c))}</option>`).join('')}</select><input type="text" data-name="${r.key}" maxlength="60" placeholder="name for the new column" aria-label="Name of the new column for ${esc(r.label)}"></div>`;
    }).join('') + '<div class="nb-row"><button class="nb-btn primary" data-ok>Save</button><button class="nb-btn" data-close>Cancel</button></div>', { wideDlg: true });
    const sync = () => b.querySelectorAll('.nb-rname').forEach((row) => { const nm = row.querySelector('input'); nm.style.visibility = row.querySelector('select').value ? 'hidden' : ''; nm.disabled = !!row.querySelector('select').value; });
    b.addEventListener('change', sync); sync();
    const f = b.querySelector('input:not(:disabled)'); if (f) { f.focus(); setTimeout(() => f.isConnected && f.focus(), 130); }
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const out = [], seen = new Set();
      for (const r of R) {          // checked before anything is made
        const id = b.querySelector(`[data-col="${r.key}"]`).value, name = b.querySelector(`[data-name="${r.key}"]`).value.trim(), key = id || 'n:' + name.toLowerCase();
        const why = !id && !name ? `Give a name to the new column for “${r.label}”.` : seen.has(key) ? `Two readings cannot share ${id ? 'one column' : 'one name'}.` : id ? '' : nameTrouble(name, r.unit || null);
        if (complain(b, why, `[data-name="${r.key}"]`)) return; seen.add(key);
      }
      for (const r of R) {
        let id = b.querySelector(`[data-col="${r.key}"]`).value; const name = b.querySelector(`[data-name="${r.key}"]`).value.trim();
        if (!id) id = S.addColumn(nb, r.kind === 'text' ? { kind: 'text', name, raw: r.key, rawLabel: r.label } : { kind: 'data', name, unit: r.unit || '', sig: r.sig || 0, raw: r.key, rawLabel: r.label }).id;
        else { const c = S.colById(nb, id); c.raw = r.key; c.rawLabel = r.label; }
        out.push({ raw: r.key, col: id });
      }
      nb.recordMap = out; nb.recordClear = clear;
      closeDialog(); changed({ structure: true });
      status(`Record will fill ${out.length} column${out.length > 1 ? 's' : ''}. Measure, then press Record.`);
    });
  }
  /** Append one row of raw readings. Returns true when a row was added. */
  function record() {
    if (!host) return false;
    nb.recordMap = nb.recordMap.filter((m) => S.colById(nb, m.col));
    if (!nb.recordMap.length) { recordSetup(); return false; }
    const R = Object.fromEntries(host.readings().map((r) => [r.key, r]));
    const missing = nb.recordMap.filter((m) => !R[m.raw] || R[m.raw].value == null);
    if (missing.length) { status(`Nothing recorded: ${[...new Set(missing.map((m) => (R[m.raw] ? R[m.raw].why || R[m.raw].label + ' has no reading' : m.raw)))].join('; ')}.`, 'warn'); if (host.afterMiss) host.afterMiss(); return false; }
    const cells = {}; for (const m of nb.recordMap) cells[m.col] = R[m.raw].value;
    const i = S.addRow(nb, cells);
    changed({ structure: true });
    const tr = tableWrap.querySelector(`tr[data-r="${i}"]`); if (tr) { tr.classList.add('flash'); tr.scrollIntoView({ block: 'nearest' }); setTimeout(() => tr.classList.remove('flash'), 1200); }
    status(`Row ${i + 1} recorded.`);
    if (host.afterRecord) host.afterRecord({ clear: nb.recordClear !== false });
    return true;
  }

  // ---- graph ------------------------------------------------------------------------------------------------------------------------
  let axesHtml = '';
  function renderAxes() {
    const g = nb.graph, nums = numericCols();
    const sel = (key, none) => `<select data-g="${key}" aria-label="${{ x: 'Horizontal axis', y: 'Vertical axis', y2: 'Second series', err: 'Error bars' }[key]}"><option value="">${none}</option>${nums.map((c) => `<option value="${c.id}">${esc(colFull(c))}</option>`).join('')}</select>`;
    const chk = (key, label) => `<label class="nb-check"><input type="checkbox" data-g="${key}"> ${label}</label>`;
    const html = `<label class="nb-ax"><span>Horizontal axis</span> ${sel('x', 'choose a column')}</label><label class="nb-ax"><span>Vertical axis</span> ${sel('y', 'choose a column')}</label>
      <details class="nb-gopt"><summary>Graph options</summary><div class="nb-goptbody">
        ${chk('logX', 'Log scale, horizontal')}${chk('logY', 'Log scale, vertical')}${chk('flipX', 'Flip horizontal axis')}${chk('flipY', 'Flip vertical axis')}
        ${chk('connect', 'Connect the points')}${chk('equal', 'Same scale on both axes')}${chk('resid', 'Show residuals under the graph')}${chk('mark', 'Mark the origin (0, 0)')}
        <label class="nb-ax">What is at the origin? <input type="text" data-g="markLabel" maxlength="30" placeholder="your own words"></label>
        <label class="nb-ax">Second series (same vertical axis) ${sel('y2', 'none')}</label>
        <label class="nb-ax">Error bars from ${sel('err', 'none')}</label>
      </div></details>`;
    // redrawn only when the columns changed: a list being used from the keyboard is never replaced under the student's fingers
    if (html !== axesHtml) { const open = axesBox.querySelector('details') && axesBox.querySelector('details').open; axesHtml = html; axesBox.innerHTML = html; if (open) axesBox.querySelector('details').open = true; }
    axesBox.querySelectorAll('[data-g]').forEach((el) => { if (el.type === 'checkbox') el.checked = !!g[el.dataset.g]; else if (el !== document.activeElement || el.tagName === 'SELECT') el.value = g[el.dataset.g] || ''; });
  }
  axesBox.addEventListener('change', (e) => {
    const k = e.target.dataset.g; if (!k) return;
    nb.graph[k] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'text' ? e.target.value.trim() : (e.target.value || null);
    if (k === 'markLabel' && e.target.value.trim()) nb.graph.mark = true;
    changed();
  });
  root.addEventListener('pointerdown', (e) => { const d = axesBox.querySelector('details'); if (d && d.open && !d.contains(e.target)) d.open = false; });
  function modelData(m) {
    const pts = S.points(nb, 'y'), M = variant(MODEL[m.type], m);
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
    const spec = { series: [{ pts: s1, name: cy.name || S.letterOf(nb, cy.id) }], xLabel: g.xLabel, yLabel: g.yLabel, title: g.title, logX: g.logX, logY: g.logY, flipX: g.flipX, flipY: g.flipY, connect: g.connect, equal: g.equal, placeholders: !forExport, curves: [], resid: null, mark: g.mark ? g.markLabel || '' : null };
    if (g.y2 && S.colById(nb, g.y2)) spec.series.push({ pts: S.points(nb, 'y2'), name: S.colById(nb, g.y2).name || S.letterOf(nb, g.y2) });
    [nb.model, nb.model2].forEach((m, k) => {
      const md = m.type && modelData(m); if (!md || !md.pts.length) return;
      const { M, pts, d, c } = md, curve = [];
      if (M.closed) { spec.curves.push({ pts: M.path(m.p), name: M.name }); return; }
      if (M.needsT) {
        if (!g.t) return;
        const pad = (d.tmax - d.tmin) * 0.04 || 1, n = 720;
        for (let i = 0; i <= n; i++) curve.push(M.xy(d.tmin - pad + (d.tmax - d.tmin + 2 * pad) * i / n, m.p, c));
        spec.curves.push({ pts: curve, name: M.name, ties: pts.map((p) => [p.x, p.y, ...M.xy(p.t, m.p, c)]) });
      } else {
        const xs = s1.map((p) => p.x).filter((x) => !g.logX || x > 0), lo = Math.min(...xs), hi = Math.max(...xs), n = Math.round(Math.max(400, Math.min(6000, M.wave && m.p.P ? 40 * (hi - lo) / Math.abs(m.p.P) : 0))), pad = (hi - lo) * 0.08 || 1;
        if (g.logX) for (let i = 0; i <= n; i++) { const x = lo / 1.3 * Math.pow(hi * 1.3 * 1.3 / lo, i / n); curve.push([x, M.f(x, m.p, c)]); }
        else { for (let i = 0; i <= n; i++) { const x = lo - pad + (hi - lo + 2 * pad) * i / n; curve.push([x, M.f(x, m.p, c)]); } }
        if (M.knots) { for (const x of M.knots(m.p, c, lo - pad, hi + pad)) curve.push([x, M.f(x, m.p, c)]); curve.sort((a, b2) => a[0] - b2[0]); }
        spec.curves.push({ pts: curve, name: M.name });
      }
      if (k === 0 && g.resid) {
        const r = residuals(M, m.p, pts, c), uy = S.unitInfo(nb, cy).label;
        spec.resid = M.needsT ? { ownX: true, pts: pts.map((p, i) => ({ x: p.t, r: r.dx[i], r2: r.dy[i] })), label: 'residual' + (uy ? ` (${uy})` : ''), xLabel: (S.colById(nb, g.t) || {}).name, note: '● horizontal  □ vertical, against the time column' }
          : { pts: pts.map((p, i) => ({ x: p.x, r: r.res[i] })), label: 'residual' + (uy ? ` (${uy})` : '') };
      }
    });
    return spec;
  }
  function drawGraph() {
    const wrap = canvas.parentElement, w = Math.max(200, wrap.clientWidth), hh = Math.max(120, wrap.clientHeight);
    if (!wrap.clientWidth) return;
    canvas.style.width = w + 'px'; canvas.style.height = hh + 'px';
    layout = drawChart(canvas, chartSpec(false), { theme: 'dark', w, h: hh, dpr: Math.min(window.devicePixelRatio || 1, 2) });
    showFit();
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
      <label class="nb-f">Your name <small>(written on the saved graph and the CSV)</small> <input name="student" type="text" maxlength="60" value="${esc(nb.student || '')}"></label>
      <label class="nb-f">Title <input name="title" type="text" maxlength="120" value="${esc(g.title)}"></label>
      <label class="nb-f">Horizontal axis label${cx ? ` <small>(you put column ${esc(colFull(cx))} here)</small>` : ''} <input name="xLabel" type="text" maxlength="140" value="${esc(g.xLabel)}"></label>
      <label class="nb-f">Vertical axis label${cy ? ` <small>(you put column ${esc(colFull(cy))} here)</small>` : ''} <input name="yLabel" type="text" maxlength="140" value="${esc(g.yLabel)}"></label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Save</button><button class="nb-btn" data-close>Cancel</button></div>`);
    b.querySelector('[data-ok]').addEventListener('click', () => { for (const k of ['title', 'xLabel', 'yLabel']) g[k] = b.querySelector(`[name=${k}]`).value.trim(); nb.student = b.querySelector('[name=student]').value.trim(); closeDialog(); changed(); });
  }
  /** The lines under a saved graph: whose it is, and what was fitted by hand. */
  function pngFoot() {
    const out = []; if (nb.practice) out.push('PRACTICE DATA (made up by the notebook): not a measurement');
    if (nb.student || nb.title) out.push([nb.student, nb.title].filter(Boolean).join(' · '));
    [nb.model, nb.model2].forEach((m) => { const md = m.type && modelData(m); if (!md || !md.pts.length) return; const r = residuals(md.M, m.p, md.pts, md.c); out.push(`Fitted by hand, ${md.M.name.replace(/ \(.*/, '').toLowerCase()}: ` + md.M.params.map((p) => `${p.sym.replace(/<[^>]+>/g, '')} = ${withUnit(fmtNum(m.p[p.key], 5), parUnit(p.unit))}`).join(', ') + (r.n === md.pts.length ? `; sum of squared residuals ${fmtNum(r.ss, 4)}, rms ${withUnit(fmtNum(r.rms, 3), parUnit('y'))}` : '')); });
    return out;
  }
  function savePng() {
    const spec = chartSpec(true);
    if (spec.empty) { status('There is no graph to save yet.', 'warn'); return; }
    const c = document.createElement('canvas');
    spec.foot = pngFoot();
    drawChart(c, spec, { theme: 'light', w: 1000, h: 640 + spec.foot.length * 18, dpr: 2 });
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
    m.ext = extKey(md.d); if (!keepValues) { m.moved = {}; m.zoom = {}; }
  }
  const extKey = (d) => [d.xmin, d.xmax, d.ymin, d.ymax, d.tmin, d.tmax].map((v) => +v.toPrecision(6)).join();
  /** New or other data under a model: every slider the student has not narrowed or widened covers it again, and one not touched
   *  yet starts over. The values the student set stay. */
  function followData() {
    for (const m of [nb.model, nb.model2]) {
      const md = m.type && modelData(m); if (!md || !md.pts.length || m.ext === extKey(md.d)) continue;
      const r = md.M.ranges(md.d), moved = m.moved || {}, zoom = m.zoom || {};
      for (const p of md.M.params) {
        const [lo, hi, start] = r[p.key], v = m.p[p.key];
        if (zoom[p.key] && m.r[p.key]) continue;
        const keep = Number.isFinite(v) && (moved[p.key] || m.ext == null);
        if (!keep) m.p[p.key] = start;
        m.r[p.key] = [Math.min(lo, m.p[p.key]), Math.max(hi, m.p[p.key])];
      }
      m.ext = extKey(md.d); snap = copy();
    }
  }
  const heads = ['', ''], bodies = ['', ''];
  function renderModel() {
    const g = nb.graph, ready = g.x && g.y && S.points(nb, 'y').length > 0;
    [nb.model, nb.model2].forEach((m, k) => {
      const box = modelBox.querySelector(`[data-part="${k}"]`), M = variant(MODEL[m.type], m);
      box.hidden = !!k && !nb.model.type;
      const head = `<label><span>${k ? 'Second curve<span class="long">, to compare</span>' : 'Model<span class="long">: a curve to lay over your points</span>'}</span> <select data-m="${k}"><option value="">${k ? 'none' : 'none yet: choose a shape'}</option>${MODELS.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}</select></label><button class="nb-btn sm" data-about="${k}" aria-label="About this model">About<span class="long"> this model</span></button>`;
      const hd = box.querySelector('.nb-mhead'); if (head !== heads[k]) { heads[k] = head; hd.innerHTML = head; }          // the list stays in place, so typing in it works
      const sel = hd.querySelector('select'); sel.value = m.type || ''; sel.disabled = !ready && !m.type; hd.querySelector('button').hidden = !M;
      const body = box.querySelector('.nb-mbody'), a = body.contains(document.activeElement) ? document.activeElement : null, key = a && Object.entries(a.dataset)[0];
      const html = M ? partHtml(m, k, M) : k || ready ? '' : '<p class="nb-hint">Put two columns on the graph first.</p>';
      if (html !== bodies[k] || body.querySelector('[data-p]')) { body.innerHTML = html; bodies[k] = html; }
      if (key) { const attr = 'data-' + key[0].replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()), again = body.querySelector(`[${attr}="${key[1]}"]`); if (again) again.focus({ preventScroll: true }); }
    });
    showFit();
  }
  function partHtml(m, k, M) {
    const g = nb.graph; let html = `<div class="nb-eq">${M.eq(axisVars())}</div>`;
    if (M.needsT) html += `<label class="nb-ax">Time of each point: column <select data-g2="t"><option value="">choose a column</option>${numericCols().map((c) => `<option value="${c.id}"${g.t === c.id ? ' selected' : ''}>${esc(colFull(c))}</option>`).join('')}</select></label> `;
    const md = modelData(m);
    if (M.needsT && !g.t) return html + '<p class="nb-hint">This shape is traced out in time, so it needs to know when each point was measured.</p>';
    if (!md || !md.pts.length) return html + '<p class="nb-hint">No points to lay it over yet.</p>';
    if (!M.params.every((p) => Number.isFinite(m.p[p.key]) && m.r[p.key])) setRanges(m, true);
    const tools = [];
    if (M.needsT || M.closed) tools.push(`<label class="nb-check"><input type="checkbox" data-eq="1"${g.equal ? ' checked' : ''}> Same scale on both axes</label>`);
    if (M.wave) tools.push(`<label class="nb-ax">Phase given as <select data-phase="${k}"><option value="angle"${m.phase === 'angle' ? ' selected' : ''}>an angle</option><option value="moment"${m.phase === 'angle' ? '' : ' selected'}>a moment</option></select></label>`);
    if (opts.instructor) tools.push(`<button class="nb-btn sm" data-best="${k}" title="Instructor only: least-squares fit from the current sliders">Best fit (instructor)</button>`);
    if (tools.length) html += `<div class="nb-mtools">${tools.join(' ')}</div>`;
    html += `<div class="nb-pars${M.params.length > 5 ? ' many' : ''}">` + M.params.map((p) => {
      const [lo, hi] = m.r[p.key], v = m.p[p.key], u = parUnit(p.unit);
      return `<div class="nb-par"><span class="desc" title="${esc(p.label)}"><b class="sym">${p.sym}</b> ${esc(p.label)}</span>
        <input type="range" data-p="${k}:${p.key}" min="${lo}" max="${hi}" step="${(hi - lo) / 2000 || 1e-9}" value="${v}" aria-label="${esc(p.label)}">
        <input type="text" inputmode="decimal" autocomplete="off" data-n="${k}:${p.key}" value="${parText(v, m.r[p.key])}" aria-label="${esc(p.label)}, number"><span class="un">${esc(u)}</span><span class="zoom"><button data-z="${k}:${p.key}:in" title="Finer: narrow this slider around its value" aria-label="Finer slider for ${esc(p.label)}">&#8853;</button><button data-z="${k}:${p.key}:out" title="Wider slider range" aria-label="Wider slider for ${esc(p.label)}">&#8854;</button><button data-use="${k}:${p.key}" title="Use this value: put it in the table as a column of its own, to calculate or convert with" aria-label="Use the value of ${esc(p.label)} in the table">use</button></span></div>`;
    }).join('') + '</div>';
    return html;
  }
  /** The strip under the graph, always in sight: how well the curve follows the points, and what the graph leaves out. */
  let fitHtml = '';
  function showFit() {
    const g = nb.graph, out = [];
    [nb.model, nb.model2].forEach((m, k) => {
      const md = m.type && modelData(m); if (!md || !md.pts.length || (md.M.needsT && !g.t) || !md.M.params.every((p) => Number.isFinite(m.p[p.key]))) return;
      const r = residuals(md.M, m.p, md.pts, md.c), u = parUnit('y'), all = S.points(nb, 'y').length;
      const what = k ? '2nd curve: ' : '', u2 = u && (/[/·]/.test(u) ? `(${u})²` : u + '²'), each = md.M.closed ? 'distance from the circle' : 'residual';
      out.push(`<span data-rms="${k}">${what} ${r.n < md.pts.length ? `<b>none</b>: the curve does not exist at ${md.pts.length - r.n} of your ${md.pts.length} points` : `<span class="ss" title="Square every ${each} and add them up. The smaller this is, the closer the curve lies to your points. (R² is 1 minus this, divided by the same sum for a flat line at the mean: it is largest when this is smallest.)">Sum of squared ${md.M.closed ? 'distances<span class="long"> from the circle</span>' : 'residuals'} <b>${esc(withUnit(fmtNum(r.ss, 4), u2))}</b></span> <span class="rms" title="The root of the mean square: a typical ${each}">rms ${esc(withUnit(fmtNum(r.rms, 3), u))}</span><span class="long"> · largest ${esc(withUnit(fmtNum(r.max, 3), u))}</span> · ${r.n} point${r.n === 1 ? '' : 's'}`}${md.pts.length < all ? ` (${all - md.pts.length} without a time left out)` : ''}</span><button class="nb-btn sm" data-reset="${k}" title="Put the sliders back to a neutral start that covers your data (not a fit)">Reset sliders</button>`);
    });
    const pts = S.points(nb, 'y').concat(g.y2 ? S.points(nb, 'y2') : []), lost = pts.filter((p) => (g.logX && p.x <= 0) || (g.logY && p.y <= 0)).length;
    if (lost) out.push(`<span class="warn">${lost} point${lost > 1 ? 's are' : ' is'} not shown: zero and negative values have no place on a log scale.</span>`);
    if (layout && layout.residLeftOut) out.push('<span class="dim">Residual plot left out: make the notebook taller or wider to see it.</span>');
    if (host && host.big && !wide && root.classList.contains('nb-short')) out.push('<button class="nb-btn sm" data-big title="The whole window for the notebook: graph and sliders side by side">Big notebook</button>');
    const html = out.join('');
    if (fitHtml !== html) { const f = fitBox.contains(document.activeElement); fitBox.innerHTML = fitHtml = html; if (f) { const b = fitBox.querySelector('button'); if (b) b.focus(); } }
    if (fitBox.hidden !== !html) { fitBox.hidden = !html; }
  }
  fitBox.addEventListener('click', (e) => { if (e.target.closest('[data-big]')) { host.big(); return; } const b = e.target.closest('[data-reset]'); if (!b) return; const m = mOf(b.dataset.reset); m.p = {}; m.r = {}; setRanges(m, false); changed(); status('Sliders put back to a neutral start.', '', true); });
  /** "Use this value": a fitted parameter becomes a labelled column (the same number in every row). What to do with it is the student's. */
  function useDialog(k, key) {
    const m = mOf(k), md = modelData(m), P = md.M.params.find((p) => p.key === key), v = m.p[key], u = parUnit(P.unit), sym = P.sym.replace(/<[^>]+>/g, '');
    const b = openDialog('Use this value', `<p class="nb-lead">${sym} = <b>${esc(withUnit(fmtNum(v, 4), u))}</b> (${esc(P.label)}) will go into the table as a column: the same number in every row, as your sliders stand now. You can then convert it, calculate with it, or feed it to a relation. Moving the slider later does not change it.</p>
      <label class="nb-f">Name: what is this number? <input name="name" type="text" maxlength="60" placeholder="your own words"></label>
      <label class="nb-f">Figures worth keeping <select name="sig">${[2, 3, 4, 5].map((n) => `<option${n === 3 ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="nb-row"><button class="nb-btn primary" data-ok>Add column</button><button class="nb-btn" data-close>Cancel</button></div>`);
    b.querySelector('[data-ok]').addEventListener('click', () => {
      const name = b.querySelector('[name=name]').value.trim(), sig = +b.querySelector('[name=sig]').value; if (complain(b, nameTrouble(name))) return;
      const parts = parParts(P.unit), id = P.unit === 'deg' ? 'deg' : partsUnitId(parts) || (P.unit === 'x' || P.unit === 'y' || P.unit === 't' ? parUnitId(P.unit) : null);
      const col = S.addColumn(nb, { kind: 'const', name, sig, value: +v.toPrecision(sig), from: `${sym} of “${md.M.name.replace(/ \(.*/, '')}”, fitted by hand` });
      if (id) col.unit = id; else col.parts = parts;
      if (!nb.rows.length) S.addRow(nb);
      closeDialog(); changed({ structure: true }); if (!wide) setTab('table');
      const th = tableWrap.querySelector(`th[data-col="${col.id}"]`); if (th) { th.scrollIntoView({ block: 'nearest', inline: 'nearest' }); th.classList.add('flash'); }
      status(`Column ${S.letterOf(nb, col.id)} holds ${sym}.`, '', true);
    });
  }
  const parUnitId = (w) => { const c = S.colById(nb, nb.graph[w]); return c ? S.unitInfo(nb, c).id : null; };
  function parParts(kind) {
    const of = (w) => { const c = S.colById(nb, nb.graph[w]); return c ? S.unitInfo(nb, c).parts || {} : {}; }, sum = (a, b2, n) => { const o = { ...a }; for (const q of Object.keys(b2)) { o[q] = (o[q] || 0) - n * b2[q]; if (Math.abs(o[q]) < 1e-12) delete o[q]; } return o; };
    if (kind === 'deg') return unitParts('deg');
    const [a, d] = kind.split('/'); if (!a) return {};
    return d ? sum(of(a), of(d[0]), d[1] === '2' ? 2 : 1) : of(a);
  }
  const mOf = (k) => (+k ? nb.model2 : nb.model);
  modelBox.addEventListener('input', (e) => {
    const t = e.target, id = t.dataset.p || t.dataset.n; if (!id) return;
    const [k, key] = id.split(':'), m = mOf(k), v = t.dataset.p ? +t.value : parseNum(t.value);
    if (t.dataset.n) t.classList.toggle('bad', t.value.trim() !== '' && !Number.isFinite(v));
    if (!Number.isFinite(v)) return;
    m.p[key] = v; (m.moved = m.moved || {})[key] = true;
    if (t.dataset.p) { const nbx = modelBox.querySelector(`[data-n="${id}"]`); if (nbx) { nbx.value = parText(v, m.r[key]); nbx.classList.remove('bad'); } }
    else { const sl = modelBox.querySelector(`[data-p="${id}"]`); if (sl) sl.value = v; }          // the slider's range grows only when the typed number is finished (change, below): "2" on the way to "2026.2" must not stretch it
    S.touch(nb); clearTimeout(saveT); saveT = setTimeout(() => { saveT = 0; S.save(nb); }, 400);
    drawGraph();
  });
  modelBox.addEventListener('focusin', (e) => { const t = e.target; if (t.dataset.n) { const [k, key] = t.dataset.n.split(':'); t._was = mOf(k).p[key]; } });
  modelBox.addEventListener('keydown', (e) => {
    const t = e.target; if (!t.dataset.n || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'Enter')) return;
    e.preventDefault();
    if (e.key === 'Enter') { t.dispatchEvent(new Event('change', { bubbles: true })); t.select(); return; }
    const [k, key] = t.dataset.n.split(':'), m = mOf(k), [lo, hi] = m.r[key];
    t.value = parText(m.p[key] + (e.key === 'ArrowUp' ? 1 : -1) * (hi - lo) / 2000, m.r[key]); t.dispatchEvent(new Event('input', { bubbles: true }));
  });
  modelBox.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset.n) {
      const [k, key] = t.dataset.n.split(':'), m = mOf(k), sl = modelBox.querySelector(`[data-p="${t.dataset.n}"]`);
      if (Number.isNaN(parseNum(t.value))) { if (t.value.trim()) status(`“${t.value.trim()}” is not a number: type the number only (its unit is beside the box).`, 'warn'); if (Number.isFinite(t._was)) { m.p[key] = t._was; drawGraph(); } }
      t._was = m.p[key];
      const v = m.p[key]; t.value = t.defaultValue = parText(v, m.r[key]); t.classList.remove('bad');
      if (sl && Number.isFinite(v)) { if (v < +sl.min) { sl.min = v; m.r[key][0] = v; } if (v > +sl.max) { sl.max = v; m.r[key][1] = v; } sl.step = (sl.max - sl.min) / 2000; sl.value = v; }
      remember(); S.save(nb); return;
    }
    if (t.dataset.p) { remember(); S.save(nb); return; }
    if (t.dataset.eq) { nb.graph.equal = t.checked; changed(); }
    else if (t.dataset.phase != null) { const m = mOf(t.dataset.phase), md = modelData(m); switchPhase(MODEL[m.type], m, md.c, t.value); setRanges(m, true); changed(); }
    else if (t.dataset.m != null) {
      // each shape keeps its own sliders: looking at another shape (or typing past it in the list) loses nothing
      const m = mOf(t.dataset.m); m.mem = m.mem || {};
      if (m.type) m.mem[m.type] = { p: m.p, r: m.r, phase: m.phase, moved: m.moved, zoom: m.zoom, ext: m.ext };
      m.type = t.value || null; const back = m.type && m.mem[m.type]; delete m.mem[m.type];
      Object.assign(m, back || { p: {}, r: {}, phase: 'angle', moved: {}, zoom: {}, ext: null });
      if (m.type && !back) setRanges(m, false);
      if (m.type === 'circle' && !back) nb.graph.equal = true;
      changed();
    } else if (t.dataset.g2) { nb.graph.t = t.value || null; for (const m of [nb.model, nb.model2]) if (m.type && MODEL[m.type].needsT) { m.p = {}; m.r = {}; setRanges(m, false); } changed(); }
  });
  modelBox.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.about) openAbout(root, mOf(b.dataset.about).type, axisVars(), mOf(b.dataset.about));
    else if (b.dataset.use) { const [k, key] = b.dataset.use.split(':'); useDialog(k, key); }
    else if (b.dataset.z) { const [k, key, dir] = b.dataset.z.split(':'), m = mOf(k), [lo, hi] = m.r[key], v = m.p[key], half = (hi - lo) / 2 * (dir === 'in' ? 0.25 : 2); m.r[key] = [v - half, v + half]; (m.zoom = m.zoom || {})[key] = true; if (lo >= 0 && m.r[key][0] < 0 && ['A', 'a', 'P', 'D'].includes(key)) m.r[key] = [0, 2 * half]; changed(); }
    else if (b.dataset.best != null && opts.instructor) { const m = mOf(b.dataset.best), md = modelData(m); if (md) { const scale = {}; for (const p of md.M.params) scale[p.key] = (m.r[p.key][1] - m.r[p.key][0]) / 20; let f = bestFit(md.M, m.p, md.pts, md.c, { scale }); f = bestFit(md.M, f.p, md.pts, md.c); m.p = f.p; setRanges(m, true); changed(); } }
  });

  // ---- menu, import / export ------------------------------------------------------------------------------------------------------------
  function moreMenu(anchor) {
    openPop(anchor, [
      { label: 'Export CSV', sub: 'every column with its unit and the rule it came from', run: exportCsv },
      { label: 'Open a CSV file…', sub: 'one exported here comes back whole; any other table becomes plain columns', run: () => $('.nb-file').click() },
      { label: 'Practice data…', sub: 'a made-up table to try the graph and the sliders on', run: () => practiceMenu(anchor) },
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
    const b = openDialog('Clear this notebook?', '<p class="nb-lead">Every column, every row, the graph and the model will be removed. Undo brings them back until you leave this page; export a CSV to keep them.</p><div class="nb-row"><button class="nb-btn danger" data-ok>Clear everything</button><button class="nb-btn" data-close>Cancel</button></div>');
    b.querySelector('[data-ok]').addEventListener('click', () => { const keep = { seed: nb.seed, obs: nb.obs, predict: nb.predict, slot: nb.slot }; nb = Object.assign(S.newNotebook(nb.slot), keep); titleIn.value = ''; closeDialog(); changed({ structure: true }); status('Notebook cleared.', '', true); });
  }
  $('.nb-file').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const text = await f.text(), go = () => askDelimiter(text, (d) => { try { importText(text, d); status(`Opened ${f.name}: ${nb.cols.length} columns, ${nb.rows.length} rows.`, '', true); } catch (err) { status('Could not read that file: ' + err.message, 'warn'); } });
    replaceOr(`Open ${f.name}?`, go);
  });
  /** Anything that replaces the whole table asks first when there is one. */
  function replaceOr(title, go) {
    if (!nb.rows.length && !nb.cols.length) { go(); return; }
    const b = openDialog(title, `<p class="nb-lead">This notebook has ${nb.cols.length} column${nb.cols.length === 1 ? '' : 's'} and ${nb.rows.length} row${nb.rows.length === 1 ? '' : 's'}. They will be <b>replaced</b>. (Undo brings them back until you leave this page.)</p><div class="nb-row"><button class="nb-btn primary" data-ok>Replace</button><button class="nb-btn" data-exp>Export mine first</button><button class="nb-btn" data-close>Cancel</button></div>`);
    b.querySelector('[data-ok]').addEventListener('click', () => { closeDialog(); go(); });
    b.querySelector('[data-exp]').addEventListener('click', exportCsv);
  }
  function exportCsv() { download((nb.title || 'notebook').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') + '.csv', S.toCSV(nb), 'text/csv'); status('Table saved as a CSV file.'); }
  function importText(text, delim = null) {
    const got = S.fromCSV(text, nb.slot, delim), keep = { seed: nb.seed, obs: nb.obs };
    nb = got; if (!nb.seed) nb.seed = keep.seed; if (!nb.obs) nb.obs = keep.obs;
    titleIn.value = titleIn.defaultValue = nb.title || ''; changed({ structure: true });
  }
  function practiceMenu(anchor) {
    openPop(anchor, PRACTICE.map((P) => ({ label: P.name, sub: P.sub, run: () => replaceOr('Open practice data?', () => {
      const D = practiceData(P.id, nb.seed), keep = { seed: nb.seed, obs: nb.obs, predict: nb.predict, student: nb.student };
      nb = Object.assign(S.newNotebook(nb.slot), keep, { title: D.title, practice: true });
      const ids = D.cols.map(([name, unit]) => S.addColumn(nb, { kind: 'data', name, unit, sig: 0 }).id);
      for (const row of D.rows) S.addRow(nb, Object.fromEntries(row.map((v, i) => [ids[i], String(v)])));
      titleIn.value = titleIn.defaultValue = nb.title; changed({ structure: true }); status('Practice data: made up, not a measurement.', '', true);
    }) })));
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
    else if (name === 'undo') undo();
    else if (name === 'redo') redo();
    else if (name === 'practice') practiceMenu(anchor);
  }
  root.querySelectorAll('.nb-bar, .nb-pbar').forEach((bar) => bar.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); }));
  $('.nb-foot').addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) act(b.dataset.act, b); });
  titleIn.addEventListener('change', () => { nb.title = titleIn.value.trim(); titleIn.defaultValue = titleIn.value; changed(); });
  $('.nb-tabs').addEventListener('click', (e) => { const b = e.target.closest('[data-tab]'); if (b) setTab(b.dataset.tab); });
  function setTab(t) { tab = t; root.dataset.tab = t; root.querySelectorAll('.nb-tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === t))); requestAnimationFrame(() => { drawGraph(); if (t === 'graph' && root.classList.contains('nb-short') && nb.graph.x && nb.graph.y) $('.nb-right').scrollTop = axesBox.offsetHeight; }); }
  // ---- the divider between the table and the graph (side by side only); where it stands is remembered in this browser ----
  const split = $('.nb-split'), SPLIT = 'astro-labs.notebook.split';
  let frac = 0; try { frac = +localStorage.getItem(SPLIT) || 0; } catch (e) { /* fine */ }
  function setSplit() {
    const w = $('.nb-main').clientWidth, lo = 220, hi = Math.max(lo, w - 340), px = Math.round(Math.max(lo, Math.min(hi, (frac || 0.4) * w)));
    root.style.setProperty('--nb-left', px + 'px'); split.setAttribute('aria-valuenow', Math.round(px / w * 100)); split.setAttribute('aria-valuemin', Math.round(lo / w * 100)); split.setAttribute('aria-valuemax', Math.round(hi / w * 100));
  }
  const moveSplit = (px) => { const w = $('.nb-main').clientWidth; frac = Math.max(220, Math.min(w - 340, px)) / w; setSplit(); };
  const keepSplit = () => { try { if (frac) localStorage.setItem(SPLIT, frac.toFixed(4)); else localStorage.removeItem(SPLIT); } catch (e) { /* fine */ } };
  split.addEventListener('pointerdown', (e) => { if (e.button) return; e.preventDefault(); split.setPointerCapture(e.pointerId); split.classList.add('on'); });
  split.addEventListener('pointermove', (e) => { if (split.classList.contains('on')) moveSplit(e.clientX - $('.nb-main').getBoundingClientRect().left); });
  for (const t of ['pointerup', 'pointercancel']) split.addEventListener(t, () => { if (split.classList.contains('on')) { split.classList.remove('on'); keepSplit(); } });
  split.addEventListener('mousedown', (e) => e.preventDefault());          // no text selection while dragging
  split.addEventListener('dblclick', () => { frac = 0; setSplit(); keepSplit(); });
  split.addEventListener('keydown', (e) => { const d = e.key === 'ArrowLeft' ? -24 : e.key === 'ArrowRight' ? 24 : 0; if (!d) return; e.preventDefault(); e.stopPropagation(); moveSplit($('.nb-left').offsetWidth + d); keepSplit(); });
  function place() {
    const w = root.clientWidth, hh = root.clientHeight; if (!w) return;
    const nowWide = w >= 700;
    if (nowWide !== wide || !modelBox.parentElement) { wide = nowWide; root.classList.toggle('nb-wide', wide); $('.nb-slot-model2').appendChild(modelBox);
      // side by side, each half has its own buttons over it; one above the other, all are in the bar at the top
      const bar = $('.nb-bar .nb-btns'), more = bar.querySelector('[data-act=more]') || root.querySelector('[data-act=more]');
      root.querySelectorAll('.nb-btn.tb, .nb-btn.g').forEach((x) => (wide ? $(`[data-slot=${x.classList.contains('g') ? 'g' : 't'}]`).append(x) : bar.insertBefore(x, more)));
    }
    if (wide) setSplit();
    root.classList.toggle('nb-short', hh < 520);
    // narrow: the graph keeps a height at which it can be fitted by eye; what does not fit under it scrolls under it
    root.style.setProperty('--nb-ch', Math.round(Math.max(250, Math.min(430, hh * 0.5))) + 'px');
    drawGraph();
  }
  new ResizeObserver(place).observe(root);
  new ResizeObserver(drawGraph).observe(canvas.parentElement);

  function renderAll() { closeAbout(root); resetHistory(); titleIn.value = titleIn.defaultValue = nb.title || ''; renderTable(); renderAxes(); place(); renderModel(); drawGraph(); if (opts.onChange) opts.onChange(nb); }
  const api = {
    el: root, get nb() { return nb; }, record, recordSetup, status, undo, redo, undoKey, get wide() { return wide; }, changed, setTab, importText, csv: () => S.toCSV(nb), dialog: openDialog, closeDialog,
    /** Switch to another saved notebook (one per lab). */
    open(slot) { clearTimeout(saveT); saveT = 0; S.save(nb); nb = S.load(slot) || S.touch(S.newNotebook(slot)); if (!nb.seed) nb.seed = 1 + Math.floor(Math.random() * 999998); renderAll(); return nb; },
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
  if (opts.standalone) document.addEventListener('keydown', (e) => { if (!root.contains(e.target)) undoKey(e); });
  setTab('table'); renderAll();
  return api;
}
export { UNITS, DIM_LABEL };
