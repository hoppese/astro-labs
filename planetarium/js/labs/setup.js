// labs/setup.js: put the whole app into a described situation in one call (time, place, target, zoom,
// toggles, tools). Used by the lab presets and by the URL parameters; `describeView()` is the inverse,
// used for "Copy link to this view".
//
// A setup object (every field optional):
//   t: ISO UTC string or ms          loc: {name, region, lat, lon, elev, tz}
//   target: body id | star/DSO name | {hip: n}      track: bool      toff: [x, y, roll] degrees (where the followed object is)      fov: degrees (vertical)
//   look: {az, alt} or {ra, dec} in degrees (used when there is no target)
//   mount: 'altaz' | 'eq'            show: {key: bool}  (state.show)   fx: {key: bool} (state.fx)
//   lightTime: bool                  rate: number        play: bool
//   tools: ['stopwatch', 'events', 'compare', 'trails', 'corrections', 'measure']
//   obs2: {name, lat, lon, tz}       align: 'stars' | 'sun'
//   trail: {body, step, before, after, frame}       events: category id

import { DEG, RAD, sph, mulMV, azAltToHor, horToAzAlt, toSph, refractHor } from '../astro.js';
import { state, emit, eff } from '../state.js';
import { cam, update, lookAtHor, centerHor, setMount } from '../camera.js';
import { getFrame } from '../skyframe.js';
import { getBodies } from '../ephem.js';
import { setTime } from '../clock.js';
import { select, cancelAnim, track, stopTracking, setOffset, getOffset } from '../nav.js';
import { refHorApparent, refName } from '../objects.js';
import { stars, loadAllTiers, starRecord } from '../catalog.js';
import { search } from '../search.js';
import { measure, toggleMeasure, clearMeasures } from '../measure.js';
import { zoneFromLongitude, isValidZone } from '../timeutil.js';
import { getCard, openCards } from './dock.js';
import { setFx } from './corrections.js';
import { cmp, setObserver2, setAlign } from './compare.js';
import { trail, startTrail, stopTrail } from './trails.js';
import { ev } from './events.js';

export const SHOW_DEFAULTS = { ...state.show };          // captured before the viewer's saved settings load
export const FX_DEFAULTS = { ...state.fx };

async function resolveTarget(target) {
  if (!target) return null;
  if (typeof target === 'object' && target.hip) {
    await loadAllTiers();
    for (const t of stars.tiers) { if (!t.loaded) continue; for (let i = 0; i < t.n; i++) if (t.data[i * stars.NF + 4] === target.hip) return { kind: 'star', k: t.k, i }; }
    return null;
  }
  const name = String(target);
  if (getBodies(getFrame()).byId[name]) return { kind: 'body', id: name };
  const m = /^hip\s*(\d+)$/i.exec(name);
  if (m) return resolveTarget({ hip: +m[1] });
  const hit = search(name, 1)[0];
  return hit && hit.ref ? hit.ref : null;
}

/** Apply a setup. Returns a promise (a faint star may need its catalogue tier first). */
export async function applySetup(s, { ephemeral = true } = {}) {
  if (ephemeral) state.ephemeral = true;
  cancelAnim();
  if (s.loc && isFinite(s.loc.lat) && isFinite(s.loc.lon)) {
    const l = s.loc;
    state.loc = { name: l.name || `${l.lat.toFixed(2)}°, ${l.lon.toFixed(2)}°`, region: l.region || '', lat: +l.lat, lon: +l.lon, elev: +l.elev || 0,
      tz: l.tz && isValidZone(l.tz) ? l.tz : zoneFromLongitude(+l.lon) };
    emit('loc');
  }
  if (s.rate != null && isFinite(s.rate) && s.rate !== 0) state.rate = +s.rate;
  if (s.play != null) state.playing = !!s.play;
  if (s.t != null) { const ms = typeof s.t === 'number' ? s.t : Date.parse(s.t); if (isFinite(ms)) { if (s.play == null) state.playing = false; setTime(ms); } }
  emit('rate');
  if (s.show) for (const k of Object.keys(s.show)) if (k in state.show) { state.show[k] = !!s.show[k]; emit('show', k); }
  if (s.fx) for (const k of Object.keys(s.fx)) if (k in state.fx) setFx(k, s.fx[k]);
  if (s.lightTime != null) { state.lightTime = !!s.lightTime; emit('lightTime', state.lightTime); const c = document.getElementById('lightTimeChk'); if (c) c.checked = state.lightTime; }
  if (s.mount === 'eq' || s.mount === 'altaz') { setMount(s.mount, getFrame()); emit('mount'); }
  if ('obs2' in s) setObserver2(s.obs2 ? { region: '', elev: 0, tz: zoneFromLongitude(s.obs2.lon), ...s.obs2 } : null);
  if (s.align) setAlign(s.align);
  if (s.events) ev.cat = s.events;
  if (s.tools) {
    for (const id of ['stopwatch', 'events', 'compare', 'trails', 'corrections']) { const c = getCard(id); if (!c) continue; if (s.tools.includes(id)) c.open(); else if (s.closeOthers) c.close(); }
    if (s.tools.includes('measure') !== measure.active) toggleMeasure(s.tools.includes('measure'));
  }
  if (s.clearMeasures) clearMeasures();
  // --- view ---
  const frame = getFrame(); update(frame);
  if (s.fov) cam.fov = +s.fov;
  let ref = null;
  if (s.target) ref = await resolveTarget(s.target);
  if (ref) {
    select(ref);
    const f2 = getFrame(), h = refHorApparent(ref, f2, getBodies(f2));
    if (h && !s.look) { update(f2); lookAtHor(h); }
    if (s.track && !s.look) { stopTracking(); track(ref); if (s.toff) setOffset(s.toff); } else stopTracking();
  } else if ('target' in s && !s.target) { select(null); stopTracking(); }
  if (s.look) {
    stopTracking(); cam.roll = 0;
    const f2 = getFrame(); update(f2);
    if (s.look.az != null) lookAtHor(azAltToHor(+s.look.az, +s.look.alt));
    else if (s.look.ra != null) { const h = mulMV(f2.Mjh, sph(+s.look.ra, +s.look.dec)); lookAtHor(eff.refraction ? refractHor(h) : h); }
  }
  if ('trail' in s) { if (s.trail) startTrail({ ...s.trail, t0: s.trail.t0 != null ? (typeof s.trail.t0 === 'number' ? s.trail.t0 : Date.parse(s.trail.t0)) : state.timeMs }); else stopTrail(); }
  emit('render');
  return ref;
}

/** The current situation as a flat list of URL parameters. */
export function describeView() {
  const q = new URLSearchParams();
  q.set('t', new Date(Math.round(state.timeMs / 1000) * 1000).toISOString().replace('.000Z', 'Z'));
  const l = state.loc;
  q.set('lat', String(+l.lat.toFixed(4))); q.set('lon', String(+l.lon.toFixed(4)));
  if (l.name) q.set('place', l.name);
  if (l.tz) q.set('tz', l.tz);
  q.set('fov', String(+cam.fov.toPrecision(4)));
  const what = state.tracking ? state.trackRef : state.selected;
  const tyc = what && what.kind === 'gaia';     // a faint tile star cannot be looked up by name: the link carries the direction only
  if (what && what.kind !== 'con' && !tyc) {
    const s = what;
    let nm = refName(s);
    if (s.kind === 'star') { const r = starRecord(s.k, s.i); nm = r.hip ? 'HIP ' + r.hip : nm; }
    q.set('target', nm);
    if (state.tracking) { q.set('track', '1'); const o = getOffset(); if (o) q.set('toff', o.map((x) => +x.toPrecision(6)).join(',')); }
  }
  if (!state.tracking || tyc || what.kind === 'con') { const a = horToAzAlt(centerHor()); q.set('az', a.az.toFixed(3)); q.set('alt', a.alt.toFixed(3)); }
  if (state.mount === 'eq') q.set('mount', 'eq');
  const onL = [], offL = [];
  for (const k of Object.keys(SHOW_DEFAULTS)) if (state.show[k] !== SHOW_DEFAULTS[k]) (state.show[k] ? onL : offL).push(k);
  for (const k of Object.keys(FX_DEFAULTS)) if (state.fx[k] !== FX_DEFAULTS[k]) (state.fx[k] ? onL : offL).push(k);
  if (!state.lightTime) offL.push('lightTime');
  if (onL.length) q.set('on', onL.join(','));
  if (offL.length) q.set('off', offL.join(','));
  if (state.playing) { q.set('play', '1'); if (state.rate !== 1) q.set('rate', String(state.rate)); }
  if (cmp.obs2) { q.set('obs2', [cmp.obs2.lat, cmp.obs2.lon, cmp.obs2.name].join(',')); if (cmp.align === 'sun') q.set('align', 'sun'); }
  if (trail.on) q.set('trail', [trail.body, trail.step / 86400000, trail.before, trail.after, trail.frame, new Date(trail.t0).toISOString().slice(0, 19) + 'Z'].join(','));
  const tools = openCards().filter((id) => id !== 'lab'); if (measure.active) tools.push('measure');
  if (tools.length) q.set('tools', tools.join(','));
  return q;
}

/** Read URL parameters into a setup object (null when there are none). */
export function setupFromQuery(q) {
  const s = {}; let any = false;
  const num = (k) => { const v = parseFloat(q.get(k)); return isFinite(v) ? v : null; };
  if (q.get('t')) { const ms = Date.parse(q.get('t')); if (isFinite(ms)) { s.t = ms; any = true; } }
  if (num('lat') != null && num('lon') != null) { s.loc = { lat: num('lat'), lon: num('lon'), elev: num('elev') || 0, name: q.get('place') || '', tz: q.get('tz') || '' }; any = true; }
  if (q.get('target')) { s.target = q.get('target'); s.track = q.get('track') === '1'; any = true; const o = (q.get('toff') || '').split(',').map(Number); if (o.length === 3 && o.every(isFinite)) s.toff = o; }
  if (num('fov') != null) { s.fov = Math.min(180, Math.max(0.0005, num('fov'))); any = true; }
  if (num('az') != null && num('alt') != null) { s.look = { az: num('az'), alt: num('alt') }; any = true; }
  else if (num('ra') != null && num('dec') != null) { s.look = { ra: num('ra'), dec: num('dec') }; any = true; }
  if (q.get('mount')) { s.mount = q.get('mount'); any = true; }
  const flags = (list, val) => {
    for (const k of (list || '').split(',').map((x) => x.trim()).filter(Boolean)) {
      any = true;
      if (k === 'lightTime') s.lightTime = val;
      else if (k in FX_DEFAULTS) (s.fx = s.fx || {})[k] = val;
      else if (k in SHOW_DEFAULTS) (s.show = s.show || {})[k] = val;
    }
  };
  flags(q.get('on'), true); flags(q.get('off'), false);
  if (q.get('play') != null) { s.play = q.get('play') === '1'; any = true; }
  if (num('rate') != null) { s.rate = num('rate'); any = true; }
  if (q.get('obs2')) { const [la, lo, ...nm] = q.get('obs2').split(','); if (isFinite(+la) && isFinite(+lo)) { s.obs2 = { lat: +la, lon: +lo, name: nm.join(',') || 'Observer 2' }; any = true; } }
  if (q.get('align')) { s.align = q.get('align'); any = true; }
  if (q.get('trail')) { const [body, step, before, after, frame, t0] = q.get('trail').split(','); s.trail = { body, step: (+step || 1) * 86400000, before: +before || 0, after: +after || 0, frame: frame === 'horizon' ? 'horizon' : 'stars' }; if (t0) s.trail.t0 = t0; any = true; }
  if (q.get('tools')) { s.tools = q.get('tools').split(','); any = true; }
  return any ? s : null;
}
export { DEG, RAD, toSph };
