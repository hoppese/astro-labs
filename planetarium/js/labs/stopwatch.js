// labs/stopwatch.js: "mark time". Each press of Mark records the simulation clock to the second; the
// card lists the marks with the time elapsed since the previous mark, so durations (eclipse contacts,
// a moonrise, a transit) are measured by the student instead of being read from a table.

import { state, on } from '../state.js';
import { setTime } from '../clock.js';
import { wallParts, fmtDate, fmtTime } from '../timeutil.js';
import { makeCard } from './dock.js';
import { esc, fmtDuration } from './util.js';

export const marks = [];              // [{t: ms (whole seconds), label}]
let card = null;

export function mark(label = '') {
  const t = Math.round(state.timeMs / 1000) * 1000;
  marks.push({ t, label });
  if (marks.length > 40) marks.shift();
  if (card) { card.open(); render(); }
}
export function clearMarks() { marks.length = 0; render(); }

const utcStr = (t) => { const p = wallParts(t, 'UTC'); return fmtDate(p) + ' ' + fmtTime(p); };
function render() {
  if (!card || !card.isOpen()) return;
  const tz = state.loc.tz;
  let html = `<div class="row"><button class="btn primary" data-act="mark" title="Record the clock now (X)">Mark time <kbd>X</kbd></button>` +
    `<button class="btn" data-act="copy" ${marks.length ? '' : 'disabled'} title="Copy the marks as a table">Copy</button>` +
    `<button class="btn" data-act="clear" ${marks.length ? '' : 'disabled'}>Clear</button></div>`;
  if (!marks.length) html += '<p class="hint">Step or run the clock to the moment you want (the date box has ±1 s buttons), then press Mark. The time between marks is shown.</p>';
  else {
    html += '<ol class="sw-list">';
    marks.forEach((m, i) => {
      const p = wallParts(m.t, tz);
      html += `<li><span class="n">${i + 1}</span><span class="t">${fmtTime(p)}<small>${fmtDate(p)} local · ${utcStr(m.t).slice(-8)} UTC</small></span>` +
        `<span class="acts"><button data-go="${i}" title="Set the clock to this mark" aria-label="Go to mark ${i + 1}">&#8617;</button><button data-del="${i}" title="Delete this mark" aria-label="Delete mark ${i + 1}">&times;</button></span>` +
        `<span class="lab"><input type="text" data-lab="${i}" value="${esc(m.label)}" placeholder="label (e.g. first contact)" aria-label="Label for mark ${i + 1}"></span>` +
        (i ? `<span class="d">+ ${fmtDuration(m.t - marks[i - 1].t)} since mark ${i}</span>` : '') + '</li>';
    });
    html += '</ol>';
    if (marks.length > 2) html += `<div class="sw-total">first → last: <b>${fmtDuration(marks[marks.length - 1].t - marks[0].t)}</b></div>`;
  }
  card.body.innerHTML = html;
}
function copyText() {
  const rows = ['#\tUTC\tlabel\tsince previous (s)'];
  marks.forEach((m, i) => rows.push(`${i + 1}\t${utcStr(m.t)}\t${m.label}\t${i ? (m.t - marks[i - 1].t) / 1000 : ''}`));
  return rows.join('\n');
}

export function initStopwatch() {
  card = makeCard('stopwatch', 'Stopwatch · mark time', { onOpen: render });
  card.body.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.act === 'mark') mark();
    else if (b.dataset.act === 'clear') clearMarks();
    else if (b.dataset.act === 'copy') { const t = copyText(); if (navigator.clipboard) navigator.clipboard.writeText(t).then(() => { b.textContent = 'Copied'; }, () => {}); }
    else if (b.dataset.go != null) setTime(marks[+b.dataset.go].t);
    else if (b.dataset.del != null) { marks.splice(+b.dataset.del, 1); render(); }
  });
  card.body.addEventListener('change', (e) => { const i = e.target.dataset.lab; if (i != null && marks[+i]) marks[+i].label = e.target.value; });
  on('loc', render);
  return card;
}
