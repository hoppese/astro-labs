// point/sim.js: a pretend phone for testing (?pointsim=1). Sliders -> synthetic device-orientation events on window, as iOS, Android or a phone without a compass sends them. Not linked from the app.

import { qMul, qAxis, qRot, toAngles, yawed, azOf, TOP } from './math.js';

export const sim = { az: 180, alt: -35, roll: 0, err: 0, tilt: 0, noise: 0.05, zero: -73, decl: 0, acc: 12, kind: 'ios', run: true, angle: 0 };
const hold = (az, alt, roll) => qMul(qMul(qAxis([0, 0, 1], -az), qAxis([1, 0, 0], 90 + alt)), qAxis([0, 0, 1], roll));
const gauss = () => Math.sqrt(-2 * Math.log(Math.random() + 1e-12)) * Math.cos(2 * Math.PI * Math.random());
const event = (type, q, absolute, more) => { const a = toAngles(q), e = new DeviceOrientationEvent(type, { ...a, absolute }); if (more) for (const [k, v] of Object.entries(more)) Object.defineProperty(e, k, { value: v }); window.dispatchEvent(e); };
/** One reading. */
export function tick() {
  const s = sim; let q = qMul(hold(s.az, s.alt, s.roll), qAxis([1, 0, 0], s.tilt));
  q = qMul(qAxis([gauss(), gauss(), gauss()], s.noise * gauss()), q);
  const rel = yawed(q, s.zero);
  if (s.kind === 'ios') event('deviceorientation', rel, false, { webkitCompassHeading: (azOf(qRot(q, TOP)) - s.decl + s.err + 720) % 360, webkitCompassAccuracy: s.acc });
  else if (s.kind === 'android') { event('deviceorientation', rel, false); event('deviceorientationabsolute', yawed(q, s.err - s.decl), true); }
  else event('deviceorientation', rel, false);
}
export function initSim() {
  const box = document.createElement('details'); box.className = 'ptsim'; box.open = false;
  const row = (k, min, max, step) => `<label>${k} <input type="range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${sim[k]}"><output>${sim[k]}</output></label>`;
  box.innerHTML = '<summary>sim</summary>' + row('az', 0, 360, 1) + row('alt', -90, 90, 1) + row('roll', -180, 180, 1) + row('err', -90, 90, 1) + row('tilt', -10, 10, 0.5) + row('noise', 0, 1, 0.01) + row('acc', -1, 60, 1) +
    `<label>kind <select data-k="kind"><option>ios</option><option>android</option><option>nocompass</option></select></label><label>screen <select data-k="angle"><option>0</option><option>90</option><option>180</option><option>270</option></select></label><label><input type="checkbox" data-k="run" checked> run</label>`;
  box.addEventListener('input', (e) => { const k = e.target.dataset.k; sim[k] = e.target.type === 'checkbox' ? e.target.checked : k === 'kind' ? e.target.value : +e.target.value; if (k === 'angle') window.__pointAngle = sim.angle; const o = e.target.parentNode.querySelector('output'); if (o) o.textContent = sim[k]; });
  box.addEventListener('keydown', (e) => e.stopPropagation());
  document.body.appendChild(box);
  setInterval(() => { if (sim.run) tick(); }, 16);
  window.__pointsim = sim;
}
