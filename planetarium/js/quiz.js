// quiz.js: constellation and bright-star quiz (where this app began).
//   Find it        "Click on Orion": click anywhere inside its region (IAU boundary) or on its figure.
//   Name it        a figure is highlighted: pick its name from four, or type it.
//   Find the star  "Click on Vega".
// Options: what is above the horizon now or the whole sky; lines on or off (harder); which set.
// While a quiz runs the name labels are hidden and clicks answer the question instead of selecting.
// After each answer the right one is shown on the sky. Display settings are put back at the end.

import { A, DEG, RAD, mod, mulMV, toSph, angleBetween, unrefractHor } from './astro.js';
import { state, on, emit, save as saveState } from './state.js';
import { cam, unproject, update, centerHor } from './camera.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { constellations, stars, starRecord } from './catalog.js';
import { select, flyTo } from './nav.js';
import { projEqj } from './render/proj.js';
import { clipToSky } from './render/groundshade.js';
import { makePanel, esc, loadJSON, saveJSON } from './xui.js';
import { strokeConstellation } from './skymarks.js';

const ZODIAC = ['Ari', 'Tau', 'Gem', 'Cnc', 'Leo', 'Vir', 'Lib', 'Sco', 'Sgr', 'Cap', 'Aqr', 'Psc'];
const CON_SETS = [['famous', 'Best-known'], ['zodiac', 'Zodiac (12)'], ['north', 'Northern sky'], ['south', 'Southern sky'], ['all', 'All 88']];
const STAR_SETS = [['20', '20 brightest stars'], ['40', '40 brightest'], ['80', '80 brightest named']];
const MODES = [['find', 'Find it'], ['name', 'Name it'], ['star', 'Find the star']];
const OPT_KEY = 'astro-labs.planetarium.quiz.v1';
const SHOW_KEYS = ['conNames', 'starNames', 'dso', 'conLines', 'conBounds', 'ground', 'atmosphere', 'planetNames'];

const opt = { mode: 'find', set: 'famous', starSet: '20', scope: 'up', lines: true, answer: 'choice' };
const q = { running: false, pool: [], i: 0, cur: null, phase: 'setup', right: 0, asked: 0, streak: 0, best: 0, result: null, choices: [], click: null, savedShow: null, note: '' };
let panel;

const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
function editDistance(a, b) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > 2) return 9;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[n];
}

// ---- geometry helpers -------------------------------------------------------------------------
const altOf = (vec, frame) => Math.asin(Math.max(-1, Math.min(1, frame.starHor(vec)[2]))) * RAD;
/** Angular radius (deg) of a figure about its label point. */
function figureRadius(c) {
  let r = 4;
  for (const l of c.lineVecs) for (let i = 0; i < l.length; i += 3) r = Math.max(r, angleBetween(c.labelVec, [l[i], l[i + 1], l[i + 2]]));
  return r;
}
/** How much of the figure is above the horizon (0..1). */
function figureUp(c, frame) {
  let n = 0, up = 0;
  for (const l of c.lineVecs) for (let i = 0; i < l.length; i += 3) { n++; if (altOf([l[i], l[i + 1], l[i + 2]], frame) > 4) up++; }
  return n ? up / n : 0;
}
/** J2000 direction under a screen point. */
function eqjAt(x, y) {
  const frame = getFrame(); update(frame);
  let h = unproject(x, y);
  if (state.show.refraction) h = unrefractHor(h);
  return mulMV(frame.Mhj, h);
}
function constellationAt(v) {
  const s = toSph(v);
  try { return A.Constellation(mod(s.lon, 360) / 15, s.lat).symbol; } catch (e) { return null; }
}
function nearFigure(c, v, tolDeg) {
  for (const l of c.lineVecs) for (let i = 0; i < l.length; i += 3) if (angleBetween(v, [l[i], l[i + 1], l[i + 2]]) < tolDeg) return true;
  return false;
}
const conOf = (id) => constellations.find((c) => c.id.toLowerCase() === String(id).toLowerCase());

// ---- building the question pool -----------------------------------------------------------------
function conPool() {
  const frame = getFrame();
  let list = constellations.filter((c) => c.lineVecs.length);
  if (opt.set === 'famous') list = list.filter((c) => c.rank === 1);
  else if (opt.set === 'zodiac') list = list.filter((c) => ZODIAC.includes(c.id));
  else if (opt.set === 'north') list = list.filter((c) => toSph(c.labelVec).lat >= 0);
  else if (opt.set === 'south') list = list.filter((c) => toSph(c.labelVec).lat < 0);
  const all = list.length;
  if (opt.scope === 'up') list = list.filter((c) => figureUp(c, frame) >= 0.85 && altOf(c.labelVec, frame) > 12);
  return { list: list.map((c) => ({ kind: 'con', c })), all };
}
function starPool() {
  const frame = getFrame(), want = +opt.starSet, list = [];
  const t = stars.tiers[0];
  for (let i = 0; i < t.n && list.length < want; i++) { const nm = stars.names.name[i]; if (nm) list.push({ kind: 'star', i, name: nm, s: starRecord(0, i) }); }
  const all = list.length;
  return { list: opt.scope === 'up' ? list.filter((e) => altOf(e.s.vec, frame) > 8) : list, all };
}
const pool = () => (opt.mode === 'star' ? starPool() : conPool());

// ---- flow ----------------------------------------------------------------------------------------
function start() {
  const p = pool();
  if (p.list.length < 4) { q.note = 'Too few to make a quiz right now. Choose a bigger set, or “Whole sky”.'; renderPanel(); return; }
  saveJSON(OPT_KEY, opt);
  Object.assign(q, { running: true, pool: shuffle(p.list.slice()), i: 0, right: 0, asked: 0, streak: 0, best: 0, result: null, click: null, note: '' });
  // hide everything that gives the answer away; remember how things were
  const sh = state.show; q.savedShow = {}; for (const k of SHOW_KEYS) q.savedShow[k] = sh[k];
  sh.conNames = false; sh.starNames = false; sh.dso = false; sh.conBounds = false;
  sh.conLines = opt.mode === 'star' ? true : opt.lines;          // finding a star: the figures stay as a map, the names go
  const sunAlt = Math.asin(getBodies(getFrame()).sun.hor[2]) * RAD;
  if (opt.scope === 'all') sh.ground = false;
  if (opt.scope === 'all' || sunAlt > -12) {
    sh.atmosphere = false; q.note = sunAlt > -12 ? 'Daylight is switched off for the quiz.' : '';
    state.starScale = 0.5;            // an airless sky shows too many stars to pick figures out: thin them (read by render/sky.js)
  }
  select(null);
  document.documentElement.classList.add('quizzing');      // the pointer read-out stops naming constellations
  emit('show');
  // "find" quizzes need room to look around: if the view is zoomed in or pointed at the ground (e.g. left there by
  // a deep-sky "go to"), open it out to a wide field at a comfortable height first
  if (opt.mode !== 'name') {
    const c = centerHor(), alt = Math.asin(Math.max(-1, Math.min(1, c[2]))) * RAD;
    if (cam.fov < 60 || (state.show.ground && alt < 15)) {
      const a2 = Math.max(alt, 35) / RAD, h = Math.hypot(c[0], c[1]) || 1;
      flyTo([c[0] / h * Math.cos(a2), c[1] / h * Math.cos(a2), Math.sin(a2)], { fov: Math.max(cam.fov, 100), dur: 700 });
    }
  }
  ask();
}
function end(summary = false) {
  if (!q.running && q.phase !== 'done') { q.phase = 'setup'; renderPanel(); return; }
  if (q.savedShow) { for (const k of SHOW_KEYS) state.show[k] = q.savedShow[k]; q.savedShow = null; saveState(); emit('show'); }
  q.running = false; q.cur = null; q.result = null; q.click = null;
  document.documentElement.classList.remove('quizzing'); state.starScale = 1;
  q.phase = summary ? 'done' : 'setup';
  emit('render'); renderPanel();
}
function ask() {
  q.cur = q.pool[q.i]; q.phase = 'ask'; q.result = null; q.click = null; q.typed = '';
  if (opt.mode === 'name') {
    const c = q.cur.c;
    flyTo(getFrame().starHor(c.labelVec), { fov: Math.max(28, Math.min(95, figureRadius(c) * 3.4)), dur: 800 });
    if (opt.answer === 'choice') {
      const others = shuffle(q.pool.filter((e) => e !== q.cur).map((e) => e.c));
      q.choices = shuffle([c, ...others.slice(0, 3)]);
    }
  }
  renderPanel(); emit('render');
}
function answer(ok, detail = '') {
  if (q.phase !== 'ask') return;
  q.phase = 'feedback'; q.asked++;
  if (ok) { q.right++; q.streak++; q.best = Math.max(q.best, q.streak); } else q.streak = 0;
  q.result = { ok, detail };
  // show the right answer on the sky: always for a miss, and when it is off screen
  if (opt.mode !== 'name') {
    const vec = q.cur.kind === 'star' ? q.cur.s.vec : q.cur.c.labelVec, sp = [0, 0];
    const vis = projEqj(vec, sp) && sp[0] > 60 && sp[0] < cam.w - 60 && sp[1] > 70 && sp[1] < cam.h - 90;
    if (!ok || !vis) flyTo(getFrame().starHor(vec), { fov: q.cur.kind === 'star' ? Math.min(cam.fov, 60) : Math.max(30, Math.min(cam.fov, 100, figureRadius(q.cur.c) * 4)), dur: 900 });
  }
  renderPanel(); emit('render');
}
function next() {
  if (q.phase !== 'feedback') return;
  q.i++;
  if (q.i >= q.pool.length) end(true); else ask();
}

/** A click on the sky during a quiz. Always consumed, so nothing gets selected (that would show the name). */
function click(x, y) {
  if (!q.running) return false;
  if (q.phase !== 'ask' || opt.mode === 'name') return true;
  const v = eqjAt(x, y);
  q.click = v;
  if (opt.mode === 'find') {
    const c = q.cur.c, hit = constellationAt(v);
    const ok = (hit && hit.toLowerCase() === c.id.toLowerCase()) || nearFigure(c, v, Math.max(1.5, 14 / cam.pxPerDeg));
    const got = hit ? conOf(hit) : null;
    answer(ok, ok ? '' : got ? `You clicked in ${got.name}.` : '');
  } else {
    // the named star nearest the click must be the target, and close enough
    const tol = Math.max(2, 26 / cam.pxPerDeg);
    let best = null, bd = 1e9;
    const t = stars.tiers[0];
    for (let i = 0; i < t.n; i++) {
      if (t.data[i * stars.NF + 2] > 3.2) break;
      const d = angleBetween(v, [t.vec[3 * i], t.vec[3 * i + 1], t.vec[3 * i + 2]]);
      if (d < bd) { bd = d; best = i; }
    }
    const ok = best === q.cur.i && bd < tol;
    const nm = best != null && bd < tol ? stars.names.name[best] : null;
    answer(ok, ok ? '' : nm ? `That is ${nm}.` : 'No bright star just there.');
  }
  return true;
}
function typedAnswer(text) {
  const c = q.cur.c, t = norm(text);
  if (!t) return;
  const target = norm(c.name);
  const d = editDistance(t, target);
  const ok = t === target || t === c.id.toLowerCase() || (target.length >= 5 && d <= 1) || (target.length >= 9 && d <= 2);
  const other = !ok ? constellations.find((x) => norm(x.name) === t) : null;
  answer(ok, ok ? (t === target ? '' : `Close enough: it is spelled ${c.name}.`) : other ? `You typed ${other.name}.` : `You typed “${text.trim()}”.`);
}
function key(e) {
  if (!q.running) return false;
  if (q.phase === 'feedback' && (e.key === 'Enter' || e.key === ' ')) { if (e.target && e.target.tagName === 'BUTTON') return false; next(); return true; }
  if (q.phase === 'ask' && opt.mode === 'name' && opt.answer === 'choice' && /^[1-4]$/.test(e.key)) { const c = q.choices[+e.key - 1]; if (c) answer(c === q.cur.c, c === q.cur.c ? '' : `You chose ${c.name}.`); return true; }
  // the name toggles would give the game away
  if (['c', 'v', 'b', 's', 'd', 'p'].includes(e.key.toLowerCase())) return true;
  return false;
}

// ---- panel -----------------------------------------------------------------------------------------
const seg = (name, items, cur) => `<div class="seg qz-seg" role="radiogroup" aria-label="${name}">${items.map(([v, t]) => `<button type="button" role="radio" data-opt="${name}" data-v="${v}" aria-checked="${String(v) === String(cur)}">${t}</button>`).join('')}</div>`;
function setupHtml() {
  const p = pool(), star = opt.mode === 'star';
  const sets = star ? STAR_SETS : CON_SETS, cur = star ? opt.starSet : opt.set;
  const what = star ? 'stars' : 'constellations';
  return `<div class="qz-setup">
    ${seg('mode', MODES, opt.mode)}
    <p class="qz-desc">${opt.mode === 'find' ? 'You are given a name; click the constellation on the sky.' : opt.mode === 'name' ? 'A constellation is highlighted; say which one it is.' : 'You are given a star’s name; click the star.'}</p>
    <label class="qz-row">Which ${what}<select class="field" data-opt="${star ? 'starSet' : 'set'}">${sets.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
    <div class="qz-row"><span>Where</span>${seg('scope', [['up', 'Above the horizon now'], ['all', 'Whole sky']], opt.scope)}</div>
    ${star ? '' : `<div class="qz-row"><span>Constellation lines</span>${seg('lines', [['true', 'Shown'], ['false', 'Hidden (harder)']], String(opt.lines))}</div>`}
    ${opt.mode === 'name' ? `<div class="qz-row"><span>Answer by</span>${seg('answer', [['choice', 'Choosing from four'], ['type', 'Typing the name']], opt.answer)}</div>` : ''}
    <div class="qz-start"><button type="button" class="btn primary" data-act="start"${p.list.length < 4 ? ' disabled' : ''}>Start · ${p.list.length} question${p.list.length === 1 ? '' : 's'}</button>
      <span class="qz-avail">${opt.scope === 'up' ? `${p.list.length} of ${p.all} ${what} are up at this time and place` : `${p.all} ${what}, ground hidden`}</span></div>
    ${q.note ? `<p class="qz-note">${esc(q.note)}</p>` : ''}
    <p class="xp-foot">Names are hidden while the quiz runs, and your display settings come back when it ends.</p>
  </div>`;
}
function scoreHtml() {
  return `<div class="qz-score"><span><b>${q.right}</b> / ${q.asked} right</span><span>streak <b>${q.streak}</b>${q.best > q.streak ? ` (best ${q.best})` : ''}</span><span class="qz-prog">question ${Math.min(q.i + 1, q.pool.length)} of ${q.pool.length}</span></div>`;
}
function runHtml() {
  const name = q.cur.kind === 'star' ? q.cur.name : q.cur.c.name;
  let main;
  if (q.phase === 'ask') {
    if (opt.mode === 'find') main = `<div class="qz-prompt"><span>Click on</span><b>${esc(name)}</b></div><p class="qz-hint">Drag to look around. Anywhere inside the constellation counts.</p>`;
    else if (opt.mode === 'star') main = `<div class="qz-prompt"><span>Click on the star</span><b>${esc(name)}</b></div><p class="qz-hint">Drag to look around, scroll to zoom.</p>`;
    else if (opt.answer === 'choice') main = `<div class="qz-prompt"><span>Which constellation is highlighted?</span></div><div class="qz-choices">${q.choices.map((c, i) => `<button type="button" class="btn" data-choice="${i}"><kbd>${i + 1}</kbd>${esc(c.name)}</button>`).join('')}</div>`;
    else main = `<div class="qz-prompt"><span>Which constellation is highlighted?</span></div><form class="qz-type"><input class="field" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type its name" aria-label="Constellation name"><button type="submit" class="btn primary">Check</button></form>`;
    main += `<div class="qz-acts"><button type="button" class="btn quiet" data-act="skip">Show me</button><button type="button" class="btn quiet" data-act="end">End quiz</button></div>`;
  } else {
    const r = q.result, last = q.i + 1 >= q.pool.length;
    const where = opt.mode === 'name' ? '' : ' It is marked on the sky.';
    main = `<div class="qz-feedback ${r.ok ? 'ok' : 'no'}"><b>${r.ok ? (q.streak >= 3 ? `Yes, ${q.streak} in a row.` : 'Yes.') : r.skipped ? 'Here it is.' : 'Not quite.'}</b> ` +
      `${r.ok ? `That is ${esc(name)}.` : `${esc(r.detail)} ${r.skipped ? '' : 'This is'} <b>${esc(name)}</b>${r.skipped ? '' : '.'}${where}`}${r.ok && r.detail ? ' ' + esc(r.detail) : ''}</div>` +
      `<div class="qz-acts"><button type="button" class="btn primary" data-act="next">${last ? 'See my score' : 'Next'} <kbd>Enter</kbd></button><button type="button" class="btn quiet" data-act="end">End quiz</button></div>`;
  }
  return `<div class="qz-run">${scoreHtml()}${main}${q.note ? `<p class="qz-note">${esc(q.note)}</p>` : ''}</div>`;
}
function doneHtml() {
  const pct = q.asked ? Math.round(100 * q.right / q.asked) : 0;
  return `<div class="qz-done"><div class="qz-big">${q.right} / ${q.asked}</div><p>${pct}% right${q.best > 1 ? `, best streak ${q.best}` : ''}. ${pct === 100 ? 'A clean sheet.' : pct >= 70 ? 'Good work.' : 'The sky takes practice; try again.'}</p>
    <div class="qz-acts"><button type="button" class="btn primary" data-act="again">Play again</button><button type="button" class="btn" data-act="setup">Change options</button></div></div>`;
}
function renderPanel() {
  if (!panel || !panel.isOpen()) return;
  panel.body.innerHTML = q.running ? runHtml() : q.phase === 'done' ? doneHtml() : setupHtml();
  const inp = panel.body.querySelector('.qz-type input'); if (inp) setTimeout(() => inp.focus(), 60);
  if (q.phase === 'feedback') { const nb = panel.body.querySelector('[data-act="next"]'); if (nb && !window.matchMedia('(pointer: coarse)').matches) nb.focus({ preventScroll: true }); }
}
function bind() {
  panel.body.addEventListener('click', (e) => {
    const t = e.target;
    const o = t.closest('[data-opt][data-v]');
    if (o) { const k = o.dataset.opt; opt[k] = k === 'lines' ? o.dataset.v === 'true' : o.dataset.v; q.note = ''; renderPanel(); return; }
    const ch = t.closest('[data-choice]');
    if (ch) { const c = q.choices[+ch.dataset.choice]; answer(c === q.cur.c, c === q.cur.c ? '' : `You chose ${c.name}.`); return; }
    const a = t.closest('[data-act]'); if (!a) return;
    const act = a.dataset.act;
    if (act === 'start' || act === 'again') start();
    else if (act === 'next') next();
    else if (act === 'end') end(q.asked > 0);
    else if (act === 'setup') { q.phase = 'setup'; renderPanel(); }
    else if (act === 'skip') { answer(false, ''); q.result.skipped = true; renderPanel(); }
  });
  panel.body.addEventListener('change', (e) => { const t = e.target; if (t.dataset.opt && t.tagName === 'SELECT') { opt[t.dataset.opt] = t.value; q.note = ''; renderPanel(); } });
  panel.body.addEventListener('submit', (e) => { e.preventDefault(); const inp = e.target.querySelector('input'); if (inp) typedAnswer(inp.value); });
}

// ---- drawing ---------------------------------------------------------------------------------------
const sp = [0, 0];
function label(ctx, text, x, y, color) {
  ctx.font = "600 14px 'Source Sans 3', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
  ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(2,6,14,0.9)'; ctx.strokeText(text, x, y);
  ctx.fillStyle = color; ctx.fillText(text, x, y); ctx.textAlign = 'left';
}
function draw(ctx, R) {
  if (!q.running || !q.cur) return;
  const fb = q.phase === 'feedback', ok = fb && q.result.ok;
  const col = !fb ? 'rgba(255,214,107,0.95)' : ok ? 'rgba(126,224,150,0.95)' : 'rgba(255,196,110,0.95)';
  ctx.save();
  if (R.ground) clipToSky(ctx);
  if (q.cur.kind === 'con' && (fb || opt.mode === 'name')) {
    const c = q.cur.c;
    // asking with the lines hidden: only the region's outline, so the stars must do the work
    const figure = fb || opt.lines;
    strokeConstellation(ctx, c, { bounds: fb || !opt.lines, lines: figure, color: col, width: 1.5, dash: [6, 5] });
    if (fb && projEqj(c.labelVec, sp)) label(ctx, c.name, sp[0], sp[1], ok ? '#9ff0b4' : '#ffd98a');
  }
  if (q.cur.kind === 'star' && fb && projEqj(q.cur.s.vec, sp)) {
    ctx.strokeStyle = col; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(sp[0], sp[1], 15, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); for (let k = 0; k < 4; k++) { const a = k * Math.PI / 2; ctx.moveTo(sp[0] + 19 * Math.cos(a), sp[1] + 19 * Math.sin(a)); ctx.lineTo(sp[0] + 27 * Math.cos(a), sp[1] + 27 * Math.sin(a)); } ctx.stroke();
    label(ctx, q.cur.name, sp[0], sp[1] - 38, ok ? '#9ff0b4' : '#ffd98a');
  }
  // where a wrong click landed
  if (fb && !ok && q.click && projEqj(q.click, sp)) {
    ctx.strokeStyle = 'rgba(240,150,130,0.95)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(sp[0] - 6, sp[1] - 6); ctx.lineTo(sp[0] + 6, sp[1] + 6); ctx.moveTo(sp[0] + 6, sp[1] - 6); ctx.lineTo(sp[0] - 6, sp[1] + 6); ctx.stroke();
  }
  ctx.restore();
}

export function initQuiz() {
  const saved = loadJSON(OPT_KEY, null);
  if (saved) for (const k of Object.keys(opt)) if (typeof saved[k] === typeof opt[k]) opt[k] = saved[k];
  let bound = false;
  panel = makePanel({
    id: 'quizPanel', title: 'Sky quiz', cls: 'card',
    onOpen() { if (!bound) { bind(); bound = true; } q.note = ''; renderPanel(); },
    onClose() { if (q.running) end(false); q.phase = 'setup'; },
  });
  // nothing may be selected during a quiz (the info panel would name it)
  on('selection', () => { if (q.running && state.selected) select(null); });
  on('time', () => { if (panel.isOpen() && !q.running && q.phase === 'setup') renderPanel(); });
  on('loc', () => { if (panel.isOpen() && !q.running && q.phase === 'setup') renderPanel(); });
  window.addEventListener('pagehide', () => { if (q.running) end(false); });
  return { panel, draw, click, key, active: () => q.running, state: q, opt, start, next, answer };
}
export { DEG };
