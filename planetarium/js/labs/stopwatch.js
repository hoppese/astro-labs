// labs/stopwatch.js: "mark time". Each press of Mark records the simulation clock to the second, with the place it was
// seen from; the card lists the marks place by place, and the student picks any two to see the time between them, so
// durations (eclipse contacts, a moonrise, a transit) are measured by the student instead of being read from a table.

import { state, on } from '../state.js';
import { setTime } from '../clock.js';
import { wallParts, fmtDate, fmtTime } from '../timeutil.js';
import { toast } from '../xui.js';
import { makeCard } from './dock.js';
import { esc, fmtDuration } from './util.js';

export const marks = [];              // [{t: ms (whole seconds), label, loc: {name, lat, lon, tz}}]
let card = null, picked = [];         // the marks (objects) chosen for the gap

/** The whole second the clock shows: it changes when the second is complete (as the clock does), not half-way through it. */
export const wholeSecond = (ms) => Math.floor(ms / 1000) * 1000;
/** "21:24:26" and the two lines under it, local date and UTC for a mark. */
export function markText(m) {
  const p = wallParts(m.t, m.loc.tz);
  return { time: fmtTime(p), sub: [`${fmtDate(p)} local`, `${utcStr(m.t)} UTC`] };
}
/** Marks in the order they were made, grouped by place (places in the order of their first mark): [{name, items: [{m, n}]}]. */
export function bySite(list) {
  const out = [];
  list.forEach((m, i) => {
    let g = out.find((x) => x.loc.lat === m.loc.lat && x.loc.lon === m.loc.lon);
    if (!g) out.push(g = { name: m.loc.name, loc: m.loc, items: [] });
    g.items.push({ m, n: i + 1 });
  });
  return out;
}
/** The time between two marks, whichever came first. */
export const gapText = (a, b) => { const d = Math.abs(a.t - b.t); return fmtDuration(d) + (d >= 60000 ? ` = ${Math.round(d / 1000).toLocaleString('en-US')} s` : ''); };

export function mark(label = '') {
  const t = wholeSecond(state.timeMs), l = state.loc;
  marks.push({ t, label, loc: { name: l.name, lat: l.lat, lon: l.lon, tz: l.tz } });
  if (marks.length > 40) marks.shift();
  if (!card) return;
  card.open(); render();
  const li = card.body.querySelector(`[data-mark="${marks.length - 1}"]`);
  if (li) { li.classList.add('new'); li.scrollIntoView({ block: 'nearest' }); }
  const x = markText(marks[marks.length - 1]);
  toast(`Mark ${marks.length}: ${x.time} at ${l.name}`, { ms: 2600 });
}
export function clearMarks() { marks.length = 0; picked = []; render(); }

const utcStr = (t) => { const p = wallParts(t, 'UTC'); return fmtDate(p) + ' ' + fmtTime(p); };
const KEYS = '<p class="sw-keys"><kbd>Shift</kbd> + <kbd>&larr;</kbd> <kbd>&rarr;</kbd> 1 second &ensp;<kbd>Shift</kbd> + <kbd>&darr;</kbd> <kbd>&uarr;</kbd> 1 minute<br><kbd>L</kbd> faster <kbd>J</kbd> slower <kbd>7</kbd> run / stop</p>';
function render() {
  if (!card || !card.isOpen()) return;
  picked = picked.filter((m) => marks.includes(m));
  let html = `<div class="row"><button class="btn primary" data-act="mark" title="Record the clock now (X)">Mark time <kbd>X</kbd></button>` +
    `<button class="btn" data-act="copy" ${marks.length ? '' : 'disabled'} title="Copy the marks as a table">Copy</button>` +
    `<button class="btn" data-act="clear" ${marks.length ? '' : 'disabled'}>Clear</button></div>` + KEYS;
  if (marks.length) {
    html += `<div class="sw-total" role="status">${picked.length === 2 ? `mark ${marks.indexOf(picked[0]) + 1} to mark ${marks.indexOf(picked[1]) + 1}${picked[0].loc.name !== picked[1].loc.name ? ' (two different places)' : ''}:<br><b>${gapText(picked[0], picked[1])}</b>`
      : marks.length < 2 ? 'Mark again to have something to compare.' : picked.length ? 'Now press the number of another mark.' : 'Press the numbers of any two marks to see the time between them.'}</div>`;
    const groups = bySite(marks);
    for (const g of groups) {
      html += `<div class="sw-site">${esc(g.name)}</div><ol class="sw-list">`;
      for (const { m, n } of g.items) {
        const x = markText(m), i = n - 1, on = picked.includes(m);
        html += `<li data-mark="${i}"><button class="n${on ? ' on' : ''}" data-pick="${i}" aria-pressed="${on}" title="Use mark ${n} for the time between two marks">${n}</button><span class="t">${x.time}</span>` +
          `<span class="lab"><input type="text" data-lab="${i}" value="${esc(m.label)}" placeholder="what it is" aria-label="Label for mark ${n}"></span>` +
          `<span class="acts"><button data-go="${i}" title="Set the clock to this mark" aria-label="Go to mark ${n}">&#8617;</button><button data-del="${i}" title="Delete this mark" aria-label="Delete mark ${n}">&times;</button></span><small><span>${x.sub[0]}</span><span>${x.sub[1]}</span></small></li>`;
      }
      html += '</ol>';
    }
  }
  card.body.innerHTML = html;
}
function copyText() {
  const rows = ['#\tplace\tUTC\tlabel'];
  marks.forEach((m, i) => rows.push(`${i + 1}\t${m.loc.name}\t${utcStr(m.t)}\t${m.label}`));
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
    else if (b.dataset.pick != null) { const m = marks[+b.dataset.pick]; picked = picked.includes(m) ? picked.filter((x) => x !== m) : [...picked.slice(-1), m].sort((p, q) => marks.indexOf(p) - marks.indexOf(q)); render(); }
    else if (b.dataset.del != null) { marks.splice(+b.dataset.del, 1); render(); }
  });
  card.body.addEventListener('change', (e) => { const i = e.target.dataset.lab; if (i != null && marks[+i]) marks[+i].label = e.target.value; });
  on('loc', render);
  return card;
}
