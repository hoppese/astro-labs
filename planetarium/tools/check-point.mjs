// Section 29 of tools/check.mjs: pointing a phone at the sky (js/point/). A failure throws. Alone: node tools/check-point.mjs
import { readFileSync } from 'node:fs';
import './check-env.mjs';

export async function checkPoint({ line }) {
  const M = await import('../js/point/math.js'), W = await import('../js/point/wmm.js'), { Fusion } = await import('../js/point/fusion.js'), K = await import('../js/camera.js'), S = await import('../js/state.js');
  const { qRot, qMul, qAxis, qConj, qAngle, wrap } = M;
  const need = (ok, t) => { if (!ok) throw new Error('point: ' + t); };
  const near = (a, b, tol, t) => need(Math.abs(wrap(a - b)) <= tol, `${t}: ${a} instead of ${b}`);
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  const enu = (az, alt) => { const c = Math.cos(alt * M.DEG); return [c * Math.sin(az * M.DEG), c * Math.cos(az * M.DEG), Math.sin(alt * M.DEG)]; };
  const ang = (a, b) => Math.atan2(Math.hypot(a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]), a[0] * b[0] + a[1] * b[1] + a[2] * b[2]) * M.RAD;
  /** A phone whose back points at (az, alt), turned `roll` counterclockwise (as its holder sees it) from portrait. */
  const hold = (az, alt, roll = 0) => qMul(qMul(qAxis([0, 0, 1], -az), qAxis([1, 0, 0], 90 + alt)), qAxis([0, 0, 1], roll));

  // --- known attitudes (W3C spec's own examples and the hand) ---
  const top = (a, b, g) => qRot(M.fromAngles(a, b, g), M.TOP), back = (a, b, g) => qRot(M.fromAngles(a, b, g), M.BACK);
  need(ang(top(0, 0, 0), [0, 1, 0]) < 1e-9 && ang(back(0, 0, 0), [0, 0, -1]) < 1e-9, 'flat, top to the north');
  need(ang(top(270, 0, 0), [1, 0, 0]) < 1e-9, 'alpha 270: the top faces east');
  need(ang(back(0, 90, 0), [0, 1, 0]) < 1e-9 && ang(top(0, 90, 0), [0, 0, 1]) < 1e-9, 'upright: the back faces north');
  need(ang(back(0, 135, 0), enu(0, 45)) < 1e-9, 'tipped back by 45 degrees: the back looks 45 degrees up in the north');
  let worst = 0, n = 0;
  for (let az = 0; az < 360; az += 30) for (const alt of [-89, -45, 0, 30, 60, 89, 89.999]) for (const roll of [0, 35, 90, 180, 270]) {
    const q = hold(az, alt, roll); n++;
    worst = Math.max(worst, ang(qRot(q, M.BACK), enu(az, alt)));
    const t = M.toAngles(q); need(t.beta >= -180 && t.beta < 180.0001 && t.gamma >= -90.0001 && t.gamma < 90.0001, 'angles in the W3C ranges');
    worst = Math.max(worst, qAngle(q, M.fromAngles(t.alpha, t.beta, t.gamma)));
  }
  need(worst < 2e-5, 'round trip ' + worst);
  line(`  ${n} attitudes: angles -> attitude -> angles, back axis: worst ${worst.toExponential(1)} deg`);

  // --- the four ways up: the same direction, horizon level, zenith up ---
  for (const [angle, roll] of [[0, 0], [90, 90], [180, 180], [270, 270]]) {
    const V = M.viewMatrix(hold(137, 25, roll), angle), f = V.slice(6);
    near(Math.atan2(-f[1], f[0]) * M.RAD, 137, 1e-6, 'azimuth, screen at ' + angle); near(Math.asin(f[2]) * M.RAD, 25, 1e-6, 'altitude');
    need(Math.abs(V[2]) < 1e-9 && V[5] > 0.9, `screen at ${angle}: right is level, up is up`);
    const det = V[0] * (V[4] * V[8] - V[5] * V[7]) - V[1] * (V[3] * V[8] - V[5] * V[6]) + V[2] * (V[3] * V[7] - V[4] * V[6]); need(Math.abs(det + 1) < 1e-9, 'handed like the app (right, up, forward)');
  }
  // the phone rolls 20 degrees: the picture turns 20 the other way, so the horizon stays put in the world; the direction does not change
  { const V = M.viewMatrix(hold(137, 25, 20), 0); near(Math.atan2(V[2], V[5]) * M.RAD, 20, 1e-6, 'roll'); }
  // the camera of the app takes that matrix and gives it back, at the zenith and the nadir too
  { const frame = {}; S.eff.pointing = true; K.resize(390, 760); let w = 0; for (const [a, h, r] of [[10, 20, 0], [200, 89.9999, 40], [0, 90, 0], [77, -90, 13], [300, -60, 90]]) { const V = M.viewMatrix(hold(a, h, r), 0); K.update(frame); K.setAxes(V, frame); for (let k = 0; k < 9; k++) w = Math.max(w, Math.abs(K.cam.V[k] - V[k])); } S.eff.pointing = false; K.cam.roll = 0; need(w < 1e-6, 'camera ' + w); line(`  view matrix through the camera, zenith and nadir included: worst ${w.toExponential(1)}`); }

  // --- through the zenith: no jump. Euler angles jump by 180 there; the picture must not ---
  { const fu = new Fusion(); let prev = null, big = 0, euler = 0, pa = null, t = 0; fu.comp = 40;
    for (let alt = 60; alt <= 120; alt += 0.25) { t += 16.7; const q = hold(100, alt, 3); const a = M.toAngles(q); if (pa !== null) euler = Math.max(euler, Math.abs(wrap(a.alpha - pa))); pa = a.alpha;
      fu.addRelative(M.fromAngles(a.alpha, a.beta, a.gamma), t); const V = M.viewMatrix(fu.attitude(), 0); if (prev) big = Math.max(big, ang(V.slice(6), prev.slice(6)), ang(V.slice(3, 6), prev.slice(3, 6))); prev = V; }
    need(big < 0.5, 'zenith jump ' + big); line(`  through the zenith at 15 deg/s: largest step of the view ${big.toFixed(3)} deg a sample`); }

  // --- compass ---
  for (const alt of [-80, -60, -30, -19]) need(Math.abs(wrap(M.headingOffset(hold(50, alt), 63) - 13)) < 1e-6, 'heading at altitude ' + alt);
  for (const [alt, roll] of [[-5, 0], [10, 0], [45, 0], [85, 0], [-40, 20], [-10, 90]]) need(M.headingOffset(hold(50, alt, roll), 63) === null, `a heading is not used at altitude ${alt}, roll ${roll}`);
  need(M.headingOffset(hold(50, -75, 90), 10) !== null, 'flat on the hand in landscape: the top edge is good');
  for (const [a, h, r] of [[10, 0, 0], [10, 89.9, 40], [200, -70, 90]]) { const q = hold(a, h, r); near(M.absoluteOffset(q, M.yawed(q, -73)), 73, 1e-6, 'absolute offset'); }
  // iOS: arbitrary zero, magnetic heading, declination added; the compass is not touched while the phone looks up
  { const fu = new Fusion(), zero = -71; fu.decl = -5.5; let t = 0;
    const feed = (az, alt, secs, err = 0, acc = 10) => { for (let k = 0; k < secs * 60; k++) { t += 16.67; const q = hold(az, alt); fu.addRelative(M.yawed(q, zero), t); fu.addHeading(M.azOf(qRot(q, M.TOP)) + 5.5 + err, acc, t); } };
    feed(150, -40, 1.5); near(fu.pointing(M.BACK).az, 150, 0.2, 'compass start'); need(fu.status(t) === 'rough', 'rough');
    feed(210, 50, 5, 0); near(fu.pointing(M.BACK).az, 210, 0.2, 'after looking up'); feed(210, 50, 10, 170); near(fu.pointing(M.BACK).az, 210, 0.2, 'a wrong heading while looking up is not used');
    feed(210, -40, 2, 60, 45); near(fu.pointing(M.BACK).az, 210, 0.2, 'a compass that says it is poor is not used'); feed(210, -40, 2, 60); near(fu.pointing(M.BACK).az, 210, 0.2, 'a short disturbance is not believed'); feed(210, -40, 5, 60); near(fu.pointing(M.BACK).az, 270, 1, 'a lasting one is');
  }
  { const fu = new Fusion(); let t = 0; for (let k = 0; k < 120; k++) { t += 16.7; fu.addRelative(hold(20, 30), t); fu.addHeading(0, -1, t); } need(fu.status(t) === 'nocompass' && fu.yaw === null && fu.attitude() === null, 'no compass: no direction claimed'); }

  // --- calibration: injected errors come back, both axes, all ways up ---
  let resid = 0, resid2 = 0, m = 0;
  for (const axis of [M.BACK, M.TOP]) for (const roll of [0, 90, 180, 270, 25]) for (const [az, alt] of [[10, 12], [140, 35], [260, 68]]) for (const tilt of [-3, 0, 2.5]) {
    // true attitude puts `axis` on the target; the phone reports it with a yaw error and a tilt error fixed in the phone
    const base = axis === M.BACK ? hold(az, alt, roll) : qMul(qMul(qAxis([0, 0, 1], -az), qAxis([1, 0, 0], alt)), qAxis([0, 1, 0], roll));
    need(ang(qRot(base, axis), enu(az, alt)) < 1e-9, 'aim');
    const e = qRot(qConj(base), [enu(az, alt)[1], -enu(az, alt)[0], 0]), seen = (q) => M.yawed(qMul(q, qAxis(e, tilt)), 63);
    const fu = new Fusion(); let t = 0; for (let k = 0; k < 90; k++) { t += 16.67; fu.addRelative(qMul(qAxis([gauss(), gauss(), gauss()], 0.1 * gauss()), seen(base)), t); }
    const r = fu.calibrate(axis, enu(az, alt), t); need(r.ok, 'fix ' + JSON.stringify(r)); m++;
    near(r.yaw, -63, 0.35, 'yaw'); near(r.pitch, -tilt, 0.1, 'tilt');
    const clean = M.corrected(seen(base), r.yaw, r.pitch, fu.cal.about); resid = Math.max(resid, ang(qRot(clean, axis), enu(az, alt)));
    // elsewhere in the sky, after moving: the error left
    const other = qMul(qAxis([0, 0, 1], 70), base); resid2 = Math.max(resid2, ang(qRot(M.corrected(seen(other), r.yaw, r.pitch, fu.cal.about), M.BACK), qRot(other, M.BACK)));
  }
  need(resid < 0.15 && resid2 < 0.25, `residuals ${resid} ${resid2}`);
  line(`  ${m} one-target fixes (camera axis and long edge, 5 rolls, 63 deg of azimuth error, up to 3 deg of tilt error, 0.1 deg noise): at the target within ${resid.toFixed(3)} deg, 70 deg away within ${resid2.toFixed(3)}`);
  { const go = (fn) => { const fu = new Fusion(); let t = 0; for (let k = 0; k < 90; k++) { t += 16.67; fu.addRelative(fn(k), t); } return fu.calibrate(M.BACK, enu(100, 30), t); };
    need(go((k) => hold(100 + k * 0.1, 30)).err === 'moving', 'refused while moving at 6 deg/s'); need(go(() => hold(100, 37)).err === 'pitch', 'refused at 7 degrees of tilt'); need(go(() => hold(100, 35)).ok, '5 degrees accepted');
    const fu = new Fusion(); let t = 0; const run = (secs, q) => { for (let k = 0; k < secs * 60; k++) { t += 16.67; fu.addRelative(q, t); fu.addAbsolute(M.yawed(q, 80), t); } };
    run(3, hold(100, 30)); const r = fu.calibrate(M.BACK, enu(185, 31), t); near(r.change, 5, 0.1, 'compass correction'); need(fu.status(t) === 'calibrated', 'calibrated'); need(!fu.tired(t + 9 * 60000) && fu.tired(t + 11 * 60000), 'age');
    t += 10000; run(0.1, hold(100, 30)); need(fu.status(t) !== 'calibrated', 'sensors restarted: not calibrated any more'); run(2, M.yawed(hold(100, 30), -50)); /* new zero */ need(fu.status(t) === 'stale' && fu.tired(t), 'stale'); near(fu.pointing(M.BACK).az, 100 - 50 + 80 + 5, 0.3, 'compass + last correction'); }
  // an object 2 degrees from the one meant: nothing can tell; the error is just that. Stated in the Help.

  // --- noise against lag ---
  { const still = [], raw = []; const f = new M.OneEuro(); let t = 0; const q0 = hold(120, 40);
    for (let k = 0; k < 1800; k++) { t += 16.67; const q = qMul(qAxis([gauss(), gauss(), gauss()], 0.15 * Math.sqrt(3) * gauss()), q0), o = f.push(q, t); if (k > 120) { still.push(qAngle(o, q0) ** 2); raw.push(qAngle(q, q0) ** 2); } }
    const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v, 0) / a.length), out = [];
    for (const w of [2, 10, 30, 90]) { const g = new M.OneEuro(); let lag = 0; t = 0; for (let k = 0; k < 180; k++) { t += 16.67; const q = hold(w * t / 1000, 20); lag = qAngle(g.push(q, t), q); } out.push([w, lag, lag / w * 1000]); }
    const quiet = (() => { const e = new M.OneEuro(); let u = 0, v = 0, c = 0, tt = 0; for (let k = 0; k < 1800; k++) { tt += 16.67; const q = qMul(qAxis([gauss(), gauss(), gauss()], 0.03 * Math.sqrt(3) * gauss()), q0), o = e.push(q, tt); if (k > 120) { u += qAngle(q, q0) ** 2; v += qAngle(o, q0) ** 2; c++; } } return [Math.sqrt(u / c), Math.sqrt(v / c)]; })();
    const g = new M.OneEuro(); t = 0; let settle = 0; for (let k = 0; k < 60; k++) { t += 16.67; g.push(hold(0, 20), t); } for (let k = 0; k < 120; k++) { t += 16.67; const tgt = hold(Math.min(20, k * 1.5), 20); if (qAngle(g.push(tgt, t), tgt) > 0.2) settle = k; }
    line(`  smoothing: at rest ${rms(raw).toFixed(3)} deg rms of sensor noise -> ${rms(still).toFixed(3)}, ${quiet[0].toFixed(3)} -> ${quiet[1].toFixed(3)}; lag at ${out.map(([w, l, ms]) => `${w} deg/s ${l.toFixed(2)} deg (${ms.toFixed(0)} ms)`).join(', ')}; a 20 degree flick at 90 deg/s is within 0.2 deg ${Math.max(0, (settle - 13) * 16.67).toFixed(0)} ms after it stops`);
    need(rms(still) < rms(raw) * 0.45, 'noise'); need(out[2][2] < 40 && out[3][2] < 25 && out[1][2] < 90, 'lag'); }

  // --- World Magnetic Model against NOAA's own table ---
  { const T = JSON.parse(readFileSync(new URL('./wmm-truth.json', import.meta.url))).rows; let dD = 0, dB = 0;
    for (const [y, h, la, lo, D, I, H, X, Y, Z, F] of T) { const f = W.field(la, lo, h, y); dD = Math.max(dD, Math.abs(wrap(f.D - D)), Math.abs(f.I - I)); dB = Math.max(dB, Math.abs(f.X - X), Math.abs(f.Y - Y), Math.abs(f.Z - Z), Math.abs(f.H - H), Math.abs(f.F - F)); }
    need(T.length === 100 && dD <= 0.00501 && dB < 0.001, `WMM ${dD} ${dB}`);
    const r = W.declination(39.83, -84.89, Date.UTC(2026, 10, 25)); line(`  WMM2025 against NOAA's ${T.length} test values: angles within ${dD.toFixed(4)} deg (the table has two decimals), components within ${dB.toFixed(6)} nT. Richmond, Indiana, 2026-11-25: ${r.deg.toFixed(2)} deg`);
    need(W.declination(0, 0, Date.UTC(2031, 0, 1)).expired && !r.expired && W.declination(86, 160, Date.UTC(2026, 0, 1)).weak === 'blackout', 'validity, weak field'); }

  // --- targets: the Sun never, nothing near it, altitude limits ---
  { const { state } = S, { getFrame } = await import('../js/skyframe.js'), { getBodies } = await import('../js/ephem.js'), C = await import('../js/catalog.js'), T = await import('../js/point/targets.js');
    if (!C.stars.tiers[0] || !C.stars.tiers[0].n) { const real = globalThis.fetch; globalThis.fetch = async (u) => { const b = readFileSync(new URL(u)); return { ok: true, status: 200, json: async () => JSON.parse(b.toString()), arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) }; }; await C.loadCore(); globalThis.fetch = real; }
    const keep = { t: state.timeMs, loc: state.loc }; let seen = 0, sunNear = 0, min = 999; const ids = new Set();
    for (const lat of [39.83, -33.9, 65]) for (let k = 0; k < 240; k++) { state.loc = { name: '', lat, lon: -84.89, elev: 0, tz: 'UTC' }; state.timeMs = Date.UTC(2026, 0, 1) + k * 36.7 * 3600000; const f = getFrame(), b = getBodies(f);
      need(T.judge({ kind: 'body', id: 'Sun' }, f, b).ok === false, 'the Sun'); const mo = T.judge({ kind: 'body', id: 'Moon' }, f, b), ve = T.judge({ kind: 'body', id: 'Mercury' }, f, b); for (const j of [mo, ve]) if (j.sun < 15) { sunNear++; need(!j.ok && /Sun/.test(j.why), 'near the Sun'); }
      for (const s of T.suggest(f, b)) { seen++; ids.add(s.name); min = Math.min(min, s.sun); need(s.alt >= 10 && s.alt <= 70 && s.name !== 'Sun', 'altitude of ' + s.name); if (s.sunAlt > -1) need(s.name === 'Moon', 'by day only the Moon'); } }
    need(min >= 15 && sunNear > 20, 'sun distance');
    state.loc = { name: '', lat: 39.83, lon: -84.89, elev: 0, tz: 'UTC' }; state.timeMs = Date.UTC(2026, 10, 25, 3); const f = getFrame(); line(`  targets at 720 moments: ${seen} suggestions, ${ids.size} different objects, never the Sun, nearest to it ${min.toFixed(1)} deg; ${sunNear} Moon/Mercury refusals. Richmond tonight 22:00: ${T.suggest(f, getBodies(f)).map((s) => `${s.name} (${T.wind(s.az)} ${Math.round(s.alt)})`).join(', ')}`);
    state.timeMs = keep.t; state.loc = keep.loc; }
}
if (process.argv[1] && process.argv[1].endsWith('check-point.mjs')) { await checkPoint({ line: (s = '') => console.log(s) }); }
