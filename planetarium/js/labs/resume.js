// labs/resume.js: where a student was in a lab (step, date, view), so that a reload brings the sky back as it brings the
// notebook back. A reload of the same tab goes straight there; opening the lab again later offers it (labs.js).
// Saved as the same flat list of parameters as "Copy link to this view". Nothing else uses it.

import { describeView, setupFromQuery } from './setup.js';
import { lab, labStep, offerOpen } from './labs.js';
import { labById } from './presets.js';
import { fmtDate, wallParts } from '../timeutil.js';

const KEY = 'astro-labs.planetarium.lab.v1:', TAB = 'astro-labs.planetarium.lab.tab';
let timer = 0;
const read = (store, k) => { try { return JSON.parse(store.getItem(k) || 'null'); } catch (e) { return null; } };
export function rememberLab(id = lab.current && lab.current.id, step = labStep()) {
  if (!id || !lab.current || !lab.current.notebook) return;
  try { const s = JSON.stringify({ id, step, view: describeView().toString() }); sessionStorage.setItem(TAB, s); if (!offerOpen()) localStorage.setItem(KEY + id, s); } catch (e) { /* no storage: nothing to come back to */ }
}
export function forgetLab() { try { sessionStorage.removeItem(TAB); } catch (e) { /* fine */ } }
const whole = (o) => { if (!o || !o.id || !o.view) return null; const setup = setupFromQuery(new URLSearchParams(o.view)); const L = labById(o.id);
  return setup && L && { ...o, setup: { ...setup, play: false }, atStart: !o.step && Math.abs(setup.t - Date.parse(L.setup.t)) < 1000 }; };
export const savedLab = (id) => { const o = whole(read(localStorage, KEY + id)); return o && !o.atStart ? o : null; };
/** The lab this tab was in, when this page load is a reload (or back / forward). */
export function reloadedLab() {
  const n = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
  return n && (n.type === 'reload' || n.type === 'back_forward') ? whole(read(sessionStorage, TAB)) : null;
}
export const resumeText = (o) => `step ${o.step + 1}, ${fmtDate(wallParts(o.setup.t, (o.setup.loc && o.setup.loc.tz) || 'UTC'))}`;
export function initResume() {
  window.addEventListener('pagehide', () => rememberLab());
  document.addEventListener('visibilitychange', () => { if (document.hidden) rememberLab(); });
  timer = timer || setInterval(() => rememberLab(), 4000);
}
