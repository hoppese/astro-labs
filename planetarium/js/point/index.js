// point/index.js: "Point at the sky" on a phone: the button, the questions, the bar, calibration. The maths is in math.js and fusion.js.

import { state, eff, on, emit, save } from '../state.js';
import { cam, update, setAxes } from '../camera.js';
import { getFrame } from '../skyframe.js';
import { getBodies } from '../ephem.js';
import { setNow, setTime } from '../clock.js';
import { browserZone, wallParts, fmtTime } from '../timeutil.js';
import { setDriver, stopTracking, track, getOffset, setOffset } from '../nav.js';
import { addOverlay, perf } from '../renderer.js';
import { allPicks } from '../picks.js';
import { refName } from '../objects.js';
import { angleBetween, fmtLat, fmtLon } from '../astro.js';
import { el, esc, toast, hideToast, closePanels } from '../xui.js';
import { running } from '../labs/hidden.js';
import { viewMatrix, horToEnu, BACK, TOP } from './math.js';
import { Fusion } from './fusion.js';
import { Sensors, capability, probe, askMotion, screenAngle, inFrame } from './sensors.js';
import { declination } from './wmm.js';
import { suggest, judge, apparent, wind, WIDE } from './targets.js';
import { openEye, closeEye } from './eye.js';

export const FOV_LO = 20, FOV_HI = 100;
const ICO = '<svg class="line" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="9" width="8" height="12.500" rx="1.600" transform="rotate(14 9 15)"/><path d="M15.500 8.500 21 3M17.500 13l4-1M12 5.500l1-3.500"/></svg>';
const SUN = '<p class="pt-sun"><b>Never point the phone or your eyes at the Sun.</b></p>';
const fusion = new Fusion(), sensors = new Sensors(fusion);
/** mode: 'off' | 'starting' | 'on' | 'free' (let go by a drag; the sensors still run) */
const pt = { mode: 'off', can: 'no', saved: null, here: null, where: 'ask', mine: false, lock: null, problem: '', dec: null, since: 0 };
let pill, item, bar, card, eye, video;

const quizzing = () => document.documentElement.classList.contains('quizzing');
const why = () => (running.id ? 'Not while a lab is running: it would change the place and the time of the lab.' : quizzing() ? 'Not during the quiz.' : '');
const deg = (v) => Math.round(Math.abs(v)) + '°';
const mine = (fn) => { pt.mine = true; try { fn(); } finally { pt.mine = false; } };

// ---- start -------------------------------------------------------------------------------------------------
function showStart() {
  const w = why(); if (w) { toast(w, { kind: 'warn' }); return; }
  closePanels(); const menu = document.getElementById('menu'); if (menu) menu.hidden = true;
  if (pt.can === 'blocked') {
    openCard('Point at the sky', `<p>This page is shown inside another one, which does not let it use the phone’s motion sensors.</p><p><a class="btn pt-main" target="_blank" rel="noopener" href="${esc(location.href)}">Open it in its own page</a></p>`);
    return;
  }
  const l = state.loc, known = !!pt.here, name = esc(l.name);
  openCard('Point at the sky', `<p>Hold the phone up: the screen shows the sky behind it, now. It is for finding things, not for measuring. By the compass alone it can be 10° or more off; one calibration on an object you know does much better.</p>${SUN}
    <fieldset class="pt-place"><legend>The sky of which place?</legend>
    <label><input type="radio" name="ptw" value="here"${pt.where !== 'keep' ? ' checked' : ''}> Where I am${known ? '' : ' <small>The phone asks you. Rounded to 0.1°, used on this page only, forgotten afterward. (On some phones a service of the phone’s maker works it out.)</small>'}</label>
    <label><input type="radio" name="ptw" value="keep"${pt.where === 'keep' ? ' checked' : ''}> ${name}${/^My location/.test(l.name) ? '' : ' <small>as chosen now</small>'}</label></fieldset>
    <p class="pt-acts"><button class="btn pt-main" type="button" data-do="begin">Start</button></p><p class="pt-small">The phone may ask to use motion and orientation. The time is set to now. When you leave, your place, time and view come back.</p>`);
}
/** The tap on Start: the motion question must be asked right here. */
function begin() {
  const asked = askMotion(), r = card.querySelector('input[name=ptw]:checked');
  pt.where = r ? r.value : 'keep'; pt.mode = 'starting';
  const b = card.querySelector('[data-do=begin]'); if (b) { b.disabled = true; b.textContent = 'Starting…'; }
  asked.then((a) => {
    if (pt.mode !== 'starting') return;
    if (a !== 'granted') { pt.mode = 'off'; problem('denied'); return; }
    fusion.reset(); fusion.cal = null;
    const tm = setTimeout(() => { if (pt.mode === 'starting') { stopSensors(); pt.mode = 'off'; problem('none'); } }, 2200);
    sensors.onFirst = () => { clearTimeout(tm); if (pt.mode === 'starting') enter(); };
    sensors.start();
  });
}
function problem(kind) {
  const out = inFrame() ? `<p><a class="btn" target="_blank" rel="noopener" href="${esc(location.href)}">Open it in its own page</a> <span class="pt-small">(inside another page the sensors may be blocked)</span></p>` : '';
  const T = {
    denied: ['Motion access was refused', '<p>The phone will not say how it is held, so there is nothing to point with.</p><p>An iPhone or iPad remembers the answer until the browser is closed. To be asked again: close Safari completely (swipe it away in the app switcher), or the planetarium if it is on the Home Screen, open it again, tap <b>Point at the sky</b> and choose <b>Allow</b>.</p><p>In Chrome on Android: the icon left of the address, Permissions, Motion sensors.</p>'],
    none: ['No motion readings', '<p>The sensors sent nothing for 2 seconds. Some tablets and laptops have none. If this is a phone: check that motion sensors are allowed for this site (Chrome: the icon left of the address, Permissions), and close and reopen the page.</p>'],
  }[kind];
  pt.problem = kind; openCard(T[0], T[1] + out + '<p class="pt-acts"><button class="btn" type="button" data-do="close">Close</button></p>'); syncAll();
}
function enter() {
  const frame = getFrame(), off = state.tracking ? getOffset() : null, live = state.playing && state.rate === 1 && Math.abs(state.timeMs - Date.now()) < 5000;
  pt.saved = { live, timeMs: state.timeMs, rate: state.rate, playing: state.playing, mount: state.mount, lon: cam.lon, lat: cam.lat, fov: cam.fov, roll: cam.roll, ref: state.tracking ? state.trackRef : null, off, restoreLoc: false };
  const was = state.tracking && state.trackRef ? refName(state.trackRef) : '';
  if (was) stopTracking();
  closeCard(); update(frame); pt.since = performance.now();
  hold();
  if (was) toast(`Tracking ${was} is off while you point. It comes back when you stop.`, { ms: 4500 });
  if (pt.where === 'here') locate();
  wake(true);
}
/** Take the view (first time, or "Point again"). */
function hold() {
  if (state.tracking) stopTracking();
  const s = eff.steady; pt.mode = 'on'; eff.pointing = true; if (s) eff.steady = '';
  mine(setNow); pt.V = null;
  if (!pt.zoomed) { cam.fov = cam.fov < FOV_LO ? 60 : Math.min(cam.fov, 70); pt.zoomed = true; }
  cam.fov = clampFov(cam.fov); fusion.decl = setDecl();
  setDriver({ step, release, clampFov });
  document.documentElement.classList.add('pointing');
  mine(() => { emit('mount'); emit('steady'); emit('loc'); }); syncAll();
}
function setDecl() { const l = state.loc; pt.dec = declination(l.lat, l.lon, Date.now(), (l.elev || 0) / 1000); return pt.dec.deg; }
function locate() {
  const put = (p) => { pt.here = p; if (pt.mode !== 'on' && pt.mode !== 'free') return; if (!state.homeLoc) state.homeLoc = state.loc; pt.saved.restoreLoc = true; state.loc = { ...p }; mine(() => emit('loc')); fusion.decl = setDecl(); };
  if (pt.here) { put(pt.here); return; }
  const keep = (t) => toast(`${t} The sky is drawn for ${state.loc.name}.`, { kind: 'warn', ms: 6000 });
  if (!navigator.geolocation) { keep('This browser cannot give a location.'); return; }
  navigator.geolocation.getCurrentPosition((g) => {
    const lat = Math.round(g.coords.latitude * 10) / 10, lon = Math.round(g.coords.longitude * 10) / 10;
    put({ name: 'My location', region: `near ${fmtLat(lat)}, ${fmtLon(lon)}`, lat, lon, elev: 0, tz: browserZone() });
  }, (e) => keep(e.code === 1 ? 'Location was not allowed.' : 'No location could be found.'), { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
}

// ---- the view follows the phone ----------------------------------------------------------------------------
const clampFov = (f) => Math.max(FOV_LO, Math.min(FOV_HI, f));
let drawn = 0, synced = 0;
function step(now, frame) {
  cam.fov = clampFov(cam.fov);
  // a slow phone or a short sleep leaves the app's clock behind (clock.js caps its steps): put right quietly
  if (now - synced > 1000) { synced = now; if (Math.abs(state.timeMs - Date.now()) > 400) mine(() => setTime(Date.now(), true)); }
  const q = fusion.attitude();
  if (!q) { update(frame); return false; }
  if (pt.V && perf.avgMs > 9 && now - drawn < 30) { setIf(pt.V, frame); return false; }      // a picture that costs this much: 30 a second are enough
  const V = viewMatrix(q, screenAngle()), o = pt.V;
  const d = o ? Math.max(Math.hypot(V[6] - o[6], V[7] - o[7], V[8] - o[8]) * cam.s, Math.hypot(V[3] - o[3], V[4] - o[4], V[5] - o[5]) * cam.h / 2) : 99;
  if (d < 0.35) { setIf(o, frame); return false; }      // under a third of a pixel: nothing to draw
  pt.V = V; drawn = now; setIf(V, frame);
  return true;
}
function setIf(V, frame) { update(frame); setAxes(V, frame); }
/** Something else wants the view (a drag, a search, a change of the clock): let go, keeping the picture as it is. */
function release(reason) {
  if (pt.mode !== 'on') return;
  pt.mode = 'free'; setDriver(null);
  const frame = getFrame(); update(frame); const V = cam.V.slice();
  eff.pointing = false; update(frame); setAxes(V, frame);
  document.documentElement.classList.remove('pointing');
  mine(() => emit('mount'));
  if (reason === 'time') toast('The clock is no longer at now, so the view has let go of the phone.', { ms: 4500 });
  syncAll();
}
function stopSensors() { sensors.stop(); sensors.onFirst = null; }
/** Leave: place, time, mount and view as they were. */
function leave() {
  if (pt.mode === 'off') return;
  endSight(); closeCard(); stopSensors(); wake(false);
  const s = pt.saved;
  pt.mode = 'off'; pt.saved = null; pt.here = null; pt.zoomed = false; setDriver(null); eff.pointing = false;
  fusion.reset(); fusion.cal = null;
  document.documentElement.classList.remove('pointing');
  if (s) mine(() => {
    stopTracking();
    if (s.restoreLoc && state.homeLoc) state.loc = state.homeLoc;
    state.homeLoc = null;
    state.mount = s.mount;
    if (s.live) setNow(); else { state.rate = s.rate; state.playing = s.playing; setTime(s.timeMs); emit('rate'); }
    Object.assign(cam, { lon: s.lon, lat: s.lat, fov: s.fov, roll: s.roll }); update(getFrame());
    emit('loc'); emit('mount'); emit('steady');
    if (s.ref) { track(s.ref); if (s.off) setOffset(s.off); }
  });
  syncAll(); emit('render');
}
async function wake(v) {
  try {
    if (!v) { const l = pt.lock; pt.lock = null; if (l) await l.release(); return; }
    if (navigator.wakeLock && !document.hidden && !pt.lock) { pt.lock = await navigator.wakeLock.request('screen'); pt.lock.addEventListener('release', () => { pt.lock = null; }); if (pt.mode === 'off') wake(false); }
  } catch (e) { pt.lock = null; }
}
function onVisible() {
  if (pt.mode === 'off') return;
  if (document.hidden) { endSight(); sensors.stop(); fusion.reset(); pt.V = null; return; }
  if (pt.mode === 'starting') { sensors.start(); return; }
  sensors.start(); wake(true); pt.since = performance.now();
  if (pt.mode === 'on') mine(setNow);
}

// ---- the bar -----------------------------------------------------------------------------------------------
function status() {
  const now = performance.now(), s = fusion.status(now), c = fusion.cal, min = c ? Math.floor((now - c.t) / 60000) : 0, ago = min < 1 ? 'just now' : `${min} min ago`;
  const quiet = sensors.last && now - sensors.last > 3000 && !document.hidden;
  if (quiet) return { cls: 'bad', text: 'No sensor readings' };
  if (pt.mode === 'free') return { cls: '', text: 'Not following the phone' };
  if (s === 'none') return { cls: 'wait', text: 'Waiting for the sensors…' };
  if (s === 'calibrated') return fusion.tired(now) ? { cls: 'old', text: `Calibrated ${ago}: recalibrate` } : { cls: 'good', text: `Calibrated ${ago}` };
  const poor = fusion.acc !== null && (fusion.acc < 0 || fusion.acc > 30);
  if (s === 'searching' || (s === 'nocompass' && now - pt.since < 1500)) return now - pt.since > 6000 ? { cls: 'bad', text: poor ? 'Compass poor: calibrate' : 'Tip the top away, or calibrate' } : { cls: 'wait', text: 'Finding north: hold the phone as if reading it' };
  if (s === 'nocompass') return { cls: 'bad', text: 'No compass: calibrate first' };
  const weak = pt.dec && pt.dec.weak, about = fusion.acc !== null && fusion.acc >= 0 ? ` ±${Math.max(5, Math.round(fusion.acc))}°` : '';
  if (s === 'stale') return { cls: 'old', text: 'Rough again: recalibrate' };
  return { cls: weak || poor ? 'bad' : 'rough', text: weak ? 'Compass weak here: calibrate' : poor ? 'Compass poor: calibrate' : `Compass only, rough${about}` };
}
const known = () => fusion.attitude() !== null;
function syncBar() {
  const onIt = pt.mode === 'on' || pt.mode === 'free';
  bar.hidden = !onIt || !eye.hidden;
  if (!onIt) return;
  const s = status();
  bar.className = 'ptbar ' + s.cls; const t = bar.querySelector('.pb-text'); if (t.textContent !== s.text) t.textContent = s.text;
  bar.querySelector('[data-do=again]').hidden = pt.mode !== 'free'; bar.querySelector('[data-do=targets]').hidden = pt.mode !== 'on';
}
function syncAll() {
  const w = why(), off = pt.mode === 'off', can = pt.can !== 'no';
  pill.hidden = !off || !can || !!w || (card && !card.hidden);
  item.hidden = !can; item.disabled = !!w; item.querySelector('.pt-why').textContent = w ? w.split(':')[0].replace(/\.$/, '') : off ? '' : 'on';
  syncBar();
}
function showStatus() {
  if (pt.mode !== 'on' && pt.mode !== 'free') return;
  const c = fusion.cal, l = state.loc, d = pt.dec;
  openCard('How good is this?', `<p>${c && !c.stale ? `Calibrated on ${esc(the(c.name || 'an object'))} at ${esc(c.clock || '')}.${c.bias === null ? '' : ` The compass was ${deg(c.bias)} off.`} The tilt correction is ${Math.abs(c.pitch).toFixed(1)}°. The phone drifts slowly: calibrate again after about 10 minutes, or if things are off.` : fusion.yaw === null ? 'The direction is not known yet.' : 'Direction from the phone’s compass. Metal, cars, magnets and cases pull it, often by 10° or more. Moving the phone in a figure of eight may help; calibrating on an object helps more.'}</p>
    <p class="pt-small">For finding things, not for measuring. Compass readings are turned into true north with the World Magnetic Model (declination here ${d ? (d.deg >= 0 ? Math.abs(d.deg).toFixed(1) + '° east' : Math.abs(d.deg).toFixed(1) + '° west') : '…'}${d && d.expired ? '; the model is past its years, 2025 to 2030' : ''}${d && d.weak ? '; so near the magnetic pole a compass is of little use' : ''}). Place: ${esc(l.name)}, ${fmtLat(l.lat)} ${fmtLon(l.lon)}. Time: now. The mount is alt-az, and tracking and the steady sky are off, while the phone holds the view.</p>
    <p class="pt-acts"><button class="btn pt-main" type="button" data-do="targets">Calibrate</button><button class="btn" type="button" data-do="place">Use my location</button><button class="btn" type="button" data-do="close">Close</button></p>`);
  card.querySelector('[data-do=place]').hidden = l.name === 'My location';
}

// ---- calibration -------------------------------------------------------------------------------------------
let aim = null;      // {ref, name, axis}
let list = [];
const the = (n) => (n === 'Moon' ? 'the Moon' : n);
const whereIs = (o) => `${WIDE[wind(o.az)]}, ${Math.round(o.alt)}° up`;
function showTargets() {
  if (pt.mode !== 'on') return;
  const f = getFrame(), b = getBodies(f), sel = state.selected; list = suggest(f, b); let note = '';
  if (sel) { const j = judge(sel, f, b), nm = refName(sel); if (j.ok) { list = [{ ref: sel, name: nm, ...j }, ...list.filter((o) => o.name !== nm)]; } else note = `<p class="pt-small">${esc(nm)}: ${esc(j.why)}</p>`; }
  openCard('Calibrate', `<p>Choose something you can see and are sure of.</p>${SUN}${note}<div class="pt-list">${list.map((o, i) => `<button class="btn" type="button" data-t="${i}"><b>${esc(o.name)}</b><span>${whereIs(o)}</span></button>`).join('')}</div>` +
    (list.length ? '' : '<p>Nothing suitable is up: by day only the Moon will do, and it must be well away from the Sun. Try again after sunset.</p>') + '<p class="pt-acts"><button class="btn" type="button" data-do="close">Close</button></p>');
}
function showWays(o) {
  aim = { ref: o.ref, name: o.name };
  openCard(`Calibrate on ${the(o.name)}`, `<p>It is in the ${whereIs(o)}.</p>${SUN}<p class="pt-acts wide"><button class="btn pt-main" type="button" data-do="camera">Use the camera</button><button class="btn" type="button" data-do="edge">No camera: sight along the edge</button><button class="btn" type="button" data-do="targets">Choose another</button></p>
    <p class="pt-small">The camera shows a live picture to aim with. Nothing is recorded, kept or sent, and it goes off as soon as you have tapped.</p>`);
}
async function startCamera() {
  if (!aim) return;
  aim.axis = BACK; openSight(true);
  const r = await openEye(video);
  if (r === 'ok' || r === 'gone') return;
  endSight();
  openCard('No camera picture', `<p>${{ denied: 'The camera was not allowed. The browser’s site settings can change that (Safari: the button at the left of the address, Website Settings, Camera).', front: 'Only the front camera answered, and it looks the wrong way.', none: 'No camera could be opened.' }[r]}</p><p class="pt-acts"><button class="btn pt-main" type="button" data-do="edge">Sight along the edge instead</button><button class="btn" type="button" data-do="close">Close</button></p>`);
}
function startEdge() { if (!aim) return; aim.axis = TOP; openSight(false); }
function openSight(cameraOn) {
  closeCard(); hideToast(); eye.hidden = false; eye.classList.toggle('edge', !cameraOn); say('');
  eye.querySelector('.pe-what').innerHTML = cameraOn ? `Put <b>${esc(the(aim.name))}</b> on the cross, hold still, then tap.` : `Hold the phone flat near your eye, like a ruler. Look along its long edge, with the top end toward <b>${esc(the(aim.name))}</b>. Hold still, then tap anywhere.`;
  eye.querySelector('[data-do=sight]').textContent = cameraOn ? 'It is on the cross' : 'It is in line';
  syncBar();
}
function say(t) { const m = eye.querySelector('.pe-msg'); m.textContent = t; m.hidden = !t; }
function endSight() { closeEye(video); if (eye) eye.hidden = true; if (bar) syncBar(); }
function sight() {
  const tap = performance.now(); if (!aim || eye.hidden) return;
  if (aim.axis === BACK && !video.srcObject) { say('Waiting for the camera…'); return; }
  const f = getFrame(), b = getBodies(f), j = judge(aim.ref, f, b);
  if (!j.ok) { endSight(); openCard('Not this one', `<p>${esc(j.why)}</p><p class="pt-acts"><button class="btn pt-main" type="button" data-do="targets">Choose another</button></p>`); return; }
  const r = fusion.calibrate(aim.axis, horToEnu(apparent(aim.ref, f, b)), tap);
  if (r.err === 'moving') { say('The phone was moving. Hold it still for a second, then tap.'); return; }
  if (r.err === 'nodata') { say('Not enough readings yet. Hold still a moment, then tap.'); return; }
  if (r.err === 'pitch') { say(`That would put the phone’s tilt ${deg(r.pitch)} wrong, more than a phone is. It is probably not ${the(aim.name)}. Check and tap again, or cancel.`); return; }
  endSight(); const p = wallParts(Date.now(), browserZone());
  Object.assign(fusion.cal, { name: aim.name, clock: fmtTime(p).slice(0, 5) }); pt.V = null;
  toast(r.change === null ? `Calibrated on ${the(aim.name)}. Tilt correction ${Math.abs(r.pitch).toFixed(1)}°.` : `Calibrated on ${the(aim.name)}. The compass was ${deg(r.change)} off.${Math.abs(r.change) > 45 ? ' That is a lot: if it looks wrong, calibrate on another object.' : ''}`, { ms: 6000 });
  aim = null; syncAll(); emit('render');
}

// ---- card --------------------------------------------------------------------------------------------------
function openCard(title, html) { card.querySelector('h2').textContent = title; card.querySelector('.pc-body').innerHTML = html; card.hidden = false; card.querySelector('.pc-body').scrollTop = 0; syncAll(); }
function closeCard() { if (card) card.hidden = true; if (pill) syncAll(); }
const DO = { begin, close: () => { if (pt.mode === 'starting') { stopSensors(); pt.mode = 'off'; } closeCard(); }, targets: showTargets, camera: startCamera, edge: startEdge, sight, cancel: () => { endSight(); }, stop: leave, again: () => { closeCard(); hold(); }, status: showStatus, place: () => { closeCard(); locate(); } };
function act(e) {
  const b = e.target.closest('[data-do],[data-t]'); if (!b) return;
  if (b.dataset.t !== undefined) showWays(list[+b.dataset.t]); else if (DO[b.dataset.do]) DO[b.dataset.do](e);
}

// ---- on the sky ----------------------------------------------------------------------------------------------
/** The bright thing nearest the middle (px from it), or null. */
export function nearestBright(items, x, y, reach, limit) {
  let best = null, bs = Infinity;
  for (const it of items) {
    if (!it.ref || !(it.ref.kind === 'body' || it.ref.kind === 'star') || (it.mag ?? 99) > limit) continue;
    const d = Math.max(0, Math.hypot(it.x - x, it.y - y) - (it.r || 0)); if (d > reach) continue;
    const s = d / reach + 0.09 * it.mag; if (s < bs) { bs = s; best = it; }
  }
  return best;
}
function draw(ctx, R) {
  if (pt.mode !== 'on') return;
  const x = cam.cx, y = cam.cy, r = 24;
  ctx.save(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,214,140,0.9)';
  ctx.beginPath(); ctx.arc(x, y, r, 0, 2 * Math.PI);
  for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.moveTo(x + a * (r - 6), y + b * (r - 6)); ctx.lineTo(x + a * (r + 6), y + b * (r + 6)); }
  ctx.stroke();
  let text = '', sub = '', warn = false;
  if (!known()) { text = fusion.status(performance.now()) === 'nocompass' ? 'Direction not known' : 'Finding north…'; sub = 'Tap Calibrate if this stays'; }
  else {
    const sun = apparent({ kind: 'body', id: 'Sun' }, R.frame, R.bodies), c = [cam.V[6], cam.V[7], cam.V[8]], alt = Math.asin(Math.max(-1, Math.min(1, c[2]))) * 180 / Math.PI;
    if (sun && sun[2] > -0.02 && angleBetween(sun, c) < 15) { text = 'The Sun is here'; sub = 'Do not look at it'; warn = true; }
    else {
      const it = nearestBright(allPicks(), x, y, Math.max(46, 0.13 * Math.min(cam.w, cam.h)), 3.2);
      if (it) text = refName(it.ref);
      if (alt < -1) sub = 'below the horizon';
    }
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(2,6,14,0.85)'; ctx.lineWidth = 3.5;
  const put = (t, dy, font, col) => { ctx.font = font; ctx.strokeText(t, x, y + dy); ctx.fillStyle = col; ctx.fillText(t, x, y + dy); const w = ctx.measureText(t).width / 2; R.labels.block(x - w, y + dy, x + w, y + dy + 18); };
  if (text) put(text, r + 10, "600 16px 'Source Sans 3', system-ui, sans-serif", warn ? '#ff9a7a' : '#ffe2a8');
  if (sub) put(sub, r + (text ? 30 : 10), "500 13px 'Source Sans 3', system-ui, sans-serif", '#c8d3e0');
  ctx.restore();
}

export async function initPoint() {
  const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = new URL('../../css/point.css', import.meta.url).href; document.head.appendChild(link);
  pill = el('button', 'ptgo', ICO + '<span>Point at the sky</span>'); pill.type = 'button'; pill.id = 'ptGo'; pill.hidden = true;
  bar = el('div', 'ptbar', '<button type="button" class="pb-status" data-do="status"><i></i><span class="pb-text" role="status"></span></button><button type="button" data-do="again">Point again</button><button type="button" data-do="targets">Calibrate</button><button type="button" class="pb-x" data-do="stop" aria-label="Stop pointing">&times;</button>'); bar.hidden = true;
  card = el('section', 'ptcard', '<header><h2></h2><button class="close" type="button" data-do="close" aria-label="Close">&times;</button></header><div class="pc-body"></div>'); card.hidden = true; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'Point at the sky');
  eye = el('section', 'pteye', '<video playsinline muted aria-label="Live camera picture"></video><div class="pe-cross" aria-hidden="true"></div><div class="pe-ruler" aria-hidden="true"></div><div class="pe-top"><p class="pe-what"></p><p class="pt-sun"><b>Not toward the Sun.</b></p><p class="pe-msg" role="alert" hidden></p></div><div class="pe-acts"><button class="btn" type="button" data-do="cancel">Cancel</button><button class="btn pt-main" type="button" data-do="sight"></button></div>'); eye.hidden = true;
  video = eye.querySelector('video');
  document.body.append(pill, bar, card, eye);
  for (const n of [bar, card, eye]) n.addEventListener('click', act);
  eye.addEventListener('click', (e) => { if (eye.classList.contains('edge') && !e.target.closest('button')) sight(); });
  for (const n of [card, eye, bar]) n.addEventListener('keydown', (e) => { if (e.key !== 'Escape') e.stopPropagation(); });
  window.addEventListener('keydown', (e) => { if (e.key !== 'Escape') return; if (!eye.hidden) endSight(); else if (!card.hidden) DO.close(); else return; e.stopPropagation(); }, true);
  pill.addEventListener('click', showStart);
  item = el('button', 'xmenu-item ptitem', `<span class="ico">${ICO}</span><span>Point at the sky</span><small class="pt-why"></small>`); item.type = 'button'; item.hidden = true;
  item.addEventListener('click', () => { document.getElementById('menu').hidden = true; if (pt.mode === 'off') showStart(); else showStatus(); });
  const menu = document.getElementById('menu'); menu.insertBefore(item, menu.children[1] || null);
  addOverlay(draw);
  document.addEventListener('visibilitychange', onVisible); window.addEventListener('pagehide', () => endSight());
  on('lab-start', () => { if (pt.mode !== 'off') { leave(); toast('Pointing has stopped: a lab has its own place and time.', { kind: 'warn' }); } closeCard(); });
  on('quiz-start', () => { leave(); closeCard(); }); on('lab', syncAll);
  on('time', () => { if (!pt.mine) release('time'); }); on('rate', () => { if (!pt.mine && (state.rate !== 1 || !state.playing)) release('time'); });
  on('loc', () => { if (pt.mine || !pt.saved) return; state.homeLoc = null; pt.saved.restoreLoc = false; save(); fusion.decl = setDecl(); });      // another place chosen by hand: that one stays
  on('mount', () => { if (!pt.mine && pt.mode === 'on' && state.mount !== pt.saved.mount) toast('The equatorial mount comes back when you stop pointing.', { ms: 3500 }); });
  setInterval(syncAll, 500);
  if (window.planetarium) window.planetarium.point = { pt, fusion, sensors, leave, showStart, FOV_LO, FOV_HI };
  if (new URLSearchParams(location.search).get('pointsim') === '1') { (await import('./sim.js')).initSim(); pt.can = 'sim'; }
  else { pt.can = capability(); if (pt.can === 'probe') { pt.can = 'no'; for (let k = 0; k < 2 && pt.can === 'no'; k++) if (await probe()) pt.can = 'yes'; } }
  syncAll();
}
