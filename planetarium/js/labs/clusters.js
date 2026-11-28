// labs/clusters.js: the star-clusters lab (presets.js id 'clusters'). While it runs:
//  - the chosen members of the Hyades, the Pleiades and Praesepe (data/clusters.json, tools/build_clusters.py) are ringed on the
//    sky, one colour per cluster;
//  - the photometer measures a ringed star from ITS OWN Gaia DR2 photometry (phot.override, js/photometer.js): the magnitude is
//    G less the extinction in front of its cluster, and the filters' temperature comes from the dereddened BP−RP (turned into
//    B−V, then into a temperature with the same colour relation the filters use for any star without a spectral type). So all
//    the members of a cluster are measured on one footing, whichever catalogue the planetarium draws them from;
//  - Record offers the star's cluster and, in one column per cluster, its last G exposure (blank for the other two clusters),
//    so that one table gives a colour–magnitude diagram with a series per cluster.
// A star not in a ring is measured as usual.

import { on, emit, state } from '../state.js';
import { getFrame } from '../skyframe.js';
import { getBodies } from '../ephem.js';
import { refEqj, refKey } from '../objects.js';
import { starRecord } from '../catalog.js';
import { projEqj } from '../render/proj.js';
import { cam, projectHor, centerHor } from '../camera.js';
import { flyTo, select, isAnimating } from '../nav.js';
import { allPicks } from '../picks.js';
import { phot, lastExp } from '../photometer.js';
import { starTemp } from '../spectro.js';
import { running } from './hidden.js';

export const CL = { data: null, loading: null, on: false };
const DEG = Math.PI / 180, MATCH = Math.cos(40 / 3600 * DEG);      // a catalogue star within 40″ (aberration is up to 20″) …
const bprpToBv = (x) => { x = x < -0.5 ? -0.5 : x > 4 ? 4 : x; return -0.04152 + x * (0.70164 + x * (0.1448 + x * (-0.05292 + x * 0.006061))); };
const vec = (ra, dec) => { const a = ra * DEG, d = dec * DEG; return [Math.cos(d) * Math.cos(a), Math.cos(d) * Math.sin(a), Math.sin(d)]; };

/** The members, with what the photometer needs: {cl, vec, g, g0, c0, T}. */
export function prepare(json) {
  const out = { clusters: json.clusters.map((c) => ({ ...c })), members: [] };
  for (const c of out.clusters) {
    c.members = c.members.map(([ra, dec, g, bprp, src]) => {
      const c0 = bprp - json.eBPRP * c.ebv, t = starTemp(null, bprpToBv(c0));
      const m = { cl: c, src, vec: vec(ra, dec), g, g0: g - json.aG * c.ebv, c0, T: t ? t.T : null };
      out.members.push(m); return m;
    });
    const s = [0, 0, 0]; for (const m of c.members) for (let k = 0; k < 3; k++) s[k] += m.vec[k];
    const n = Math.hypot(...s); c.centre = s.map((x) => x / n);
  }
  return out;
}
export function loadClusters() {
  if (CL.data) return Promise.resolve(CL.data);
  if (!CL.loading) CL.loading = fetch(new URL('../../data/clusters.json', import.meta.url)).then((r) => r.json()).then((j) => { CL.data = prepare(j); emit('render'); emit('selection'); return CL.data; });
  return CL.loading;
}

const cache = new Map();
/** The ringed member this catalogue star is, or null. */
export function memberOf(ref) {
  if (!CL.on || !CL.data || !ref || (ref.kind !== 'star' && ref.kind !== 'gaia')) return null;
  const k = refKey(ref);
  if (cache.has(k)) return cache.get(k);
  const frame = getFrame(), u = refEqj(ref, frame, getBodies(frame));
  if (!u) return null;
  const v = [u[0] - frame.beta[0], u[1] - frame.beta[1], u[2] - frame.beta[2]], n = Math.hypot(...v);
  const mag = ref.kind === 'star' ? starRecord(ref.k, ref.i).mag : ref.t.mag[ref.i];
  let best = null, bd = MATCH;
  for (const m of CL.data.members) {
    const d = (v[0] * m.vec[0] + v[1] * m.vec[1] + v[2] * m.vec[2]) / n;
    if (d > bd && Math.abs(mag - m.g) < 1.5) { bd = d; best = m; }      // … of about the same brightness (V or G)
  }
  cache.set(k, best);
  return best;
}

function readings(ref) {
  const m = memberOf(ref), why = ref ? 'not one of the ringed cluster stars: click a star inside a coloured ring' : 'no object is selected';
  const out = [{ key: 'cluster', group: 'Cluster (this lab)', label: 'Cluster the star belongs to', kind: 'text', value: m ? m.cl.name : null, why }];
  const e = lastExp.G, ok = m && e && e.key === refKey(ref);
  for (const c of (CL.data ? CL.data.clusters : [])) {
    out.push({ key: 'countsG_' + c.id, group: 'Cluster (this lab)', label: `Last G exposure, if a ${c.name} star (blank otherwise)`, unit: 'counts', kind: 'data', sig: 0, optional: true,
      value: ok && m.cl === c ? e.n : null, why: !m ? why : m.cl !== c ? `a ${m.cl.name} star` : 'no G exposure of this star yet: choose G in its panel’s Photometer row' });
  }
  return out;
}

function setOn(on) {
  CL.on = on; cache.clear();
  if (on) {
    loadClusters();
    phot.override = (ref) => { const m = memberOf(ref); return m && m.T ? { mag: m.g0, T: m.T } : null; };
    running.readings = readings;
  } else {
    if (phot.override) phot.override = null;
    if (running.readings === readings) running.readings = null;
  }
  emit('render');
}

const p = [0, 0];
/** The rings (an overlay, js/renderer.js). */
export function drawClusters(ctx) {
  if (!CL.on || !CL.data) return;
  const r = cam.fov > 30 ? 4.5 : cam.fov > 8 ? 6.5 : 9;
  ctx.save();
  ctx.lineWidth = 1.4;
  ctx.font = "600 12px 'Source Sans 3', system-ui, sans-serif"; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const c of CL.data.clusters) {
    ctx.strokeStyle = c.color;
    for (const m of c.members) {
      if (!projEqj(m.vec, p) || p[0] < -20 || p[1] < -20 || p[0] > cam.w + 20 || p[1] > cam.h + 20) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], r, 0, 2 * Math.PI); ctx.stroke();
    }
    if (cam.fov > 3 && projEqj(c.centre, p)) {
      const y = p[1] + (c.id === 'hyades' ? 0 : -r - 30 / Math.max(1, cam.fov / 20));
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(2,6,14,0.85)'; ctx.strokeText(c.name, p[0], y);
      ctx.fillStyle = c.color; ctx.fillText(c.name, p[0], y); ctx.lineWidth = 1.4;
    }
  }
  ctx.restore();
}

/** The catalogue object of member m among the things drawn this frame, or null (too faint to be drawn at this zoom, or off screen). */
const drawnRef = (m) => { for (const it of allPicks()) if (it.ref && (it.ref.kind === 'star' || it.ref.kind === 'gaia') && memberOf(it.ref) === m) return it.ref; return null; };
let busy = null;
/** Select member m. If its star is drawn now, select it and leave the view alone; if not (the sky shows fewer stars the wider
 *  the view), glide in until it is drawn, select it, and glide back to the view the student had (or, if the star was not on
 *  that screen, to a view of it at the same width). */
export function selectMember(m) {
  const now = drawnRef(m);
  if (now) { select(now); return; }
  const frame = getFrame(), back = { h: centerHor(), fov: cam.fov }, onScreen = projectHor(frame.starHor(m.vec), p) && p[0] > 0 && p[1] > 0 && p[0] < cam.w && p[1] < cam.h;
  const token = busy = {};
  flyTo(frame.starHor(m.vec), { fov: Math.min(cam.fov, 2.5), dur: 450 });
  let tries = 0;
  const grab = () => {
    if (busy !== token) return;
    if (isAnimating()) { setTimeout(grab, 100); return; }
    const q = drawnRef(m);
    if (q) { select(q); busy = null; flyTo(onScreen ? back.h : getFrame().starHor(m.vec), { fov: back.fov, dur: 450 }); return; }
    if (++tries < 50) setTimeout(grab, 200);      // the faint stars' tiles may still be loading
    else busy = null;
  };
  setTimeout(grab, 500);
}
/** A click on a ring: its member wins over any neighbour (js/main.js, after the angle tool). Returns true when it took the click. */
export function clustersClick(x, y, ref) {
  if (!CL.on || !CL.data) return false;
  const r = cam.fov > 30 ? 4.5 : cam.fov > 8 ? 6.5 : 9;
  let best = null, bd = r + 3;
  const frame = getFrame();      // (outside a frame: no projEqj; refraction left out, a pixel or two near the horizon)
  for (const m of CL.data.members) { if (!projectHor(frame.starHor(m.vec), p)) continue; const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = m; } }
  if (!best || (ref && memberOf(ref) === best)) return false;      // nothing ringed there, or its star was picked: the usual select
  selectMember(best);
  return true;
}
/** "Next ringed star" (a button in the lab's step: data-do="nextring" data-cl="hyades"): the cluster's members in turn. */
const nextIx = {};
function nextRing(cl) {
  if (!CL.on || !CL.data) return;
  const c = CL.data.clusters.find((x) => x.id === cl); if (!c) return;
  const cur = state.selected ? memberOf(state.selected) : null;
  let i = cur && cur.cl === c ? c.members.indexOf(cur) + 1 : (nextIx[cl] || 0);
  i %= c.members.length; nextIx[cl] = i + 1;
  selectMember(c.members[i]);
}

export function initClusters() {
  on('lab', (L) => setOn(!!L && L.id === 'clusters'));
  on('lab-start', (L) => { if (!L || L.id !== 'clusters') setOn(false); });
  on('nextring', nextRing);
}
