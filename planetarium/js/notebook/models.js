// notebook/models.js: the short library of generic curve shapes a student can lay over their graph and fit BY HAND
// with sliders. Pure (no DOM): tools/check.mjs tests the functions. No model is named after a lab, nothing here
// knows what is being measured, and nothing fits automatically (bestFit() exists for the instructor switch only).
//
// A model: { id, name, blurb, params: [{key, sym, label, unit}], eq(v) -> HTML of the formula in the student's own
// variable names, f(x, p, c) -> y   or, for a curve traced in time, xy(t, p, c) -> [x, y] with needsT = true,
// closed: path(p) -> the outline, gap(x, y, p) -> signed distance from it (the circle); wave: variant() can give its phase as an angle;
// ranges(d) -> {key: [min, max, start]} from the extent of the data (so the sliders cover the plot; never a fit) }.
// c = {x1, t1}: the smallest x (or t) in the table, used as the zero of "time since the first point".
// param.unit: how the parameter's unit follows from the axes: 'y', 'x', 't', 'y/x', 'y/x2', 'y/t', 'x/t', 'deg', ''.

const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const span = (lo, hi) => (hi > lo ? hi - lo : Math.abs(hi) || 1);
const it = (s) => `<i>${s}</i>`;

export const MODELS = [
  { id: 'line0', name: 'Straight line through the origin', blurb: 'One number: the slope. Use it when zero of one thing must mean zero of the other.',
    params: [{ key: 'm', sym: 'm', label: 'slope', unit: 'y/x' }],
    eq: (v) => `${it(v.y)} = m · ${it(v.x)}`,
    f: (x, p) => p.m * x,
    ranges: (d) => { const s = Math.max(Math.abs(d.ymin), Math.abs(d.ymax)) / (Math.max(Math.abs(d.xmin), Math.abs(d.xmax)) || 1); return { m: [d.ymin < 0 !== d.xmin < 0 ? -3 * s : 0, 3 * s, 0] }; } },
  { id: 'line', name: 'Straight line', blurb: 'Slope and intercept.',
    params: [{ key: 'm', sym: 'm', label: 'slope', unit: 'y/x' }, { key: 'b', sym: 'b', label: 'value where the horizontal quantity is zero', unit: 'y' }],
    eq: (v) => `${it(v.y)} = m · ${it(v.x)} + b`,
    f: (x, p) => p.m * x + p.b,
    ranges: (d) => { const s = span(d.ymin, d.ymax) / span(d.xmin, d.xmax), m = (d.ymin + d.ymax) / 2, far = Math.max(Math.abs(d.xmin), Math.abs(d.xmax)) * s * 3 + span(d.ymin, d.ymax); return { m: [-3 * s, 3 * s, 0], b: [m - far, m + far, m] }; } },
  { id: 'quad', name: 'Quadratic (parabola)', blurb: 'A constant, a part that grows in step with the horizontal quantity, and a part that grows as its square.',
    params: [{ key: 'a', sym: 'a', label: 'value where the horizontal quantity is zero', unit: 'y' }, { key: 'b', sym: 'b', label: 'slope where the horizontal quantity is zero', unit: 'y/x' }, { key: 'c', sym: 'c', label: 'coefficient of the squared term (the curvature)', unit: 'y/x2' }],
    eq: (v) => `${it(v.y)} = a + b · ${it(v.x)} + c · ${it(v.x)}<sup>2</sup>`,
    f: (x, p) => p.a + p.b * x + p.c * x * x,
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax), far = Math.max(Math.abs(d.xmin), Math.abs(d.xmax)) || 1, m = (d.ymin + d.ymax) / 2;
      return { a: [m - 3 * yr, m + 3 * yr, m], b: [-4 * yr / xr, 4 * yr / xr, 0], c: [-4 * yr / (xr * far), 4 * yr / (xr * far), 0] }; } },
  { id: 'power', name: 'Power law', blurb: 'A straight line on log–log axes; the power n is its slope there. The two offsets are zero unless your zero points are shifted.',
    params: [{ key: 'A', sym: 'A', label: 'value where the horizontal quantity (less x₀) is 1', unit: '' }, { key: 'n', sym: 'n', label: 'power (the exponent)', unit: '' },
      { key: 'x0', sym: 'x₀', label: 'horizontal offset (leave at 0 for a pure power law)', unit: 'x' }, { key: 'y0', sym: 'y₀', label: 'vertical offset (leave at 0 for a pure power law)', unit: 'y' }],
    eq: (v) => `${it(v.y)} = y₀ + A · (${it(v.x)} − x₀)<sup>n</sup>`,
    f: (x, p) => (p.y0 || 0) + p.A * Math.pow(x - (p.x0 || 0), p.n),
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax); return { A: [0, 2 * Math.max(Math.abs(d.ymax), Math.abs(d.ymin)), Math.abs(d.ymax) / 2], n: [-3, 4, 1], x0: [-xr, xr, 0], y0: [-yr, yr, 0] }; } },
  { id: 'sine', name: 'Sine wave', wave: true, phase0: 'crossing the middle, going up', blurb: 'Something that repeats: amplitude, period, when it crosses the middle going up, and the middle value.',
    params: [{ key: 'A', sym: 'A', label: 'amplitude (half the full swing)', unit: 'y' }, { key: 'P', sym: 'P', label: 'period', unit: 'x' },
      { key: 'x0', sym: 'x₀', label: 'a moment it crosses the middle, going up', unit: 'x' }, { key: 'y0', sym: 'y₀', label: 'middle value', unit: 'y' }],
    eq: (v) => `${it(v.y)} = y₀ + A · sin( 2π (${it(v.x)} − x₀) / P )`,
    f: (x, p) => p.y0 + p.A * Math.sin(TAU * (x - p.x0) / p.P),
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax); return { A: [0, yr, yr / 4], P: [xr / 40, 2 * xr, xr / 2], x0: [d.xmin - xr / 2, d.xmax, d.xmin], y0: [d.ymin - yr / 2, d.ymax + yr / 2, (d.ymin + d.ymax) / 2] }; } },
  { id: 'sineline', name: 'Sine wave on a sloping line', wave: true, phase0: 'the wobble crossing zero, going up', blurb: 'A steady drift with a repeating wobble on top of it.',
    params: [{ key: 'A', sym: 'A', label: 'amplitude of the wobble', unit: 'y' }, { key: 'P', sym: 'P', label: 'period of the wobble', unit: 'x' },
      { key: 'x0', sym: 'x₀', label: 'a moment the wobble crosses zero, going up', unit: 'x' }, { key: 'm', sym: 'm', label: 'slope of the line (drift rate)', unit: 'y/x' },
      { key: 'b', sym: 'b', label: 'value of the line at the first point', unit: 'y' }],
    eq: (v) => `${it(v.y)} = b + m · (${it(v.x)} − x₁) + A · sin( 2π (${it(v.x)} − x₀) / P )<span class="nb-eqnote">x₁ = your smallest ${it(v.x)}</span>`,
    f: (x, p, c) => p.b + p.m * (x - c.x1) + p.A * Math.sin(TAU * (x - p.x0) / p.P),
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax), s = yr / xr; return { A: [0, yr / 2, yr / 10], P: [xr / 40, 2 * xr, xr / 2], x0: [d.xmin - xr / 2, d.xmax, d.xmin], m: [-3 * s, 3 * s, 0], b: [d.ymin - yr / 2, d.ymax + yr / 2, (d.ymin + d.ymax) / 2] }; } },
  { id: 'tilt', name: 'Sine wave with tilt (separation of something on a tilted circular orbit)', wave: true, phase0: 'closest approach on the sky', blurb: 'The distance between a body and what it circles, seen from the side: it swings out to A, and closes to A·sin(tilt) instead of zero when the orbit is tipped toward us.',
    params: [{ key: 'A', sym: 'A', label: 'greatest separation (the orbit’s radius)', unit: 'y' }, { key: 'P', sym: 'P', label: 'period of the orbit', unit: 'x' },
      { key: 'x0', sym: 'x₀', label: 'a moment of closest approach on the sky', unit: 'x' }, { key: 'i', sym: 'tilt', label: 'tilt of the orbit toward us (0° = edge-on, 90° = face-on)', unit: 'deg' }],
    eq: (v) => `${it(v.y)} = A · √( sin²α + cos²α · sin²(tilt) ),&ensp; α = 2π (${it(v.x)} − x₀) / P`,
    knots: (p, c, lo, hi) => { const out = [], h = p.P / 2; if (!(h > 0) || (hi - lo) / h > 4000) return out; for (let k = Math.ceil((lo - p.x0) / h); p.x0 + k * h <= hi; k++) out.push(p.x0 + k * h); return out; },
    f: (x, p) => { const ph = TAU * (x - p.x0) / p.P, s = Math.sin(ph), c = Math.cos(ph) * Math.sin(p.i * DEG); return p.A * Math.sqrt(s * s + c * c); },
    ranges: (d) => { const xr = span(d.xmin, d.xmax); return { A: [0, 2 * Math.max(Math.abs(d.ymax), Math.abs(d.ymin)), Math.abs(d.ymax) * 0.8], P: [xr / 40, 2 * xr, xr / 2], x0: [d.xmin - xr / 2, d.xmax, d.xmin], i: [0, 90, 0] }; } },
  { id: 'circle', name: 'Circle', closed: true, blurb: 'A circle drawn on the graph: where its center is and how wide it is. No time column. Both axes must be the same kind of quantity, on the same scale.',
    params: [{ key: 'x0', sym: 'x<sub>c</sub>', label: 'center, horizontal', unit: 'x' }, { key: 'y0', sym: 'y<sub>c</sub>', label: 'center, vertical', unit: 'y' }, { key: 'D', sym: '⌀', label: 'diameter (twice the radius)', unit: 'y' }],
    eq: (v) => `(${it(v.x)} − x<sub>c</sub>)<sup>2</sup> + (${it(v.y)} − y<sub>c</sub>)<sup>2</sup> = (⌀ / 2)<sup>2</sup>`,
    path: (p) => Array.from({ length: 241 }, (_, i) => [p.x0 + p.D / 2 * Math.cos(TAU * i / 240), p.y0 + p.D / 2 * Math.sin(TAU * i / 240)]),
    gap: (x, y, p) => Math.hypot(x - p.x0, y - p.y0) - p.D / 2,
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax), R = Math.max(xr, yr); return { x0: [d.xmin - xr / 2, d.xmax + xr / 2, (d.xmin + d.xmax) / 2], y0: [d.ymin - yr / 2, d.ymax + yr / 2, (d.ymin + d.ymax) / 2], D: [0, 3 * R, R] }; } },      // (D starts as wide as the points spread: R / 2 drew it at half size)
  { id: 'ellipse', name: 'Ellipse with a steady drift', needsT: true, blurb: 'A point that goes round an ellipse once every period while the whole ellipse slides along at a steady rate. Needs a third column: the time of each point.',
    params: [{ key: 'a', sym: 'a', label: 'half the long axis of the ellipse', unit: 'y' }, { key: 'b', sym: 'b', label: 'half the short axis (negative = going round the other way)', unit: 'y' },
      { key: 'th', sym: 'θ', label: 'direction of the long axis, anticlockwise from the horizontal axis', unit: 'deg' },
      { key: 'P', sym: 'P', label: 'period: time for once round', unit: 't' }, { key: 't0', sym: 't₀', label: 'a time when the point is at the end of the long axis', unit: 't' },
      { key: 'vx', sym: 'v<sub>x</sub>', label: 'drift rate along the horizontal axis', unit: 'x/t' }, { key: 'vy', sym: 'v<sub>y</sub>', label: 'drift rate along the vertical axis', unit: 'y/t' },
      { key: 'x0', sym: 'x<sub>c</sub>', label: 'center of the ellipse at the first time, horizontal', unit: 'x' }, { key: 'y0', sym: 'y<sub>c</sub>', label: 'center of the ellipse at the first time, vertical', unit: 'y' }],
    eq: (v) => `${it(v.x)} = x<sub>c</sub> + v<sub>x</sub> · (${it(v.t)} − t₁) + a · cos φ · cos θ − b · sin φ · sin θ<br>${it(v.y)} = y<sub>c</sub> + v<sub>y</sub> · (${it(v.t)} − t₁) + a · cos φ · sin θ + b · sin φ · cos θ<br>φ = 2π (${it(v.t)} − t₀) / P<span class="nb-eqnote">t₁ = your smallest ${it(v.t)}</span>`,
    xy: (t, p, c) => {
      const ph = TAU * (t - p.t0) / p.P, cp = Math.cos(ph), sp = Math.sin(ph), ct = Math.cos(p.th * DEG), st = Math.sin(p.th * DEG), dt = t - c.t1;
      return [p.x0 + p.vx * dt + p.a * cp * ct - p.b * sp * st, p.y0 + p.vy * dt + p.a * cp * st + p.b * sp * ct];
    },
    ranges: (d) => { const xr = span(d.xmin, d.xmax), yr = span(d.ymin, d.ymax), tr = span(d.tmin, d.tmax), R = Math.max(xr, yr);
      return { a: [0, R / 2, R / 10], b: [-R / 2, R / 2, R / 20], th: [-90, 90, 0], P: [tr / 40, 2 * tr, tr / 2], t0: [d.tmin - tr / 2, d.tmax, d.tmin], vx: [-2 * xr / tr, 2 * xr / tr, 0], vy: [-2 * yr / tr, 2 * yr / tr, 0],
        x0: [d.xmin - xr / 2, d.xmax + xr / 2, (d.xmin + d.xmax) / 2], y0: [d.ymin - yr / 2, d.ymax + yr / 2, (d.ymin + d.ymax) / 2] }; } },
];
export const MODEL = Object.fromEntries(MODELS.map((m) => [m.id, m]));

/** The model as the student has set it up. A wave's place along the horizontal axis can be given as a moment (x₀) or as
 *  a phase angle φ at the first point (the plain "phase" slider); m.phase says which. Everything else is unchanged. */
export function variant(M, m) {
  if (!M || !M.wave || !m || m.phase !== 'angle') return M;
  const at = (p, c) => ({ ...p, x0: c.x1 - (p.phi || 0) / 360 * p.P });
  return { ...M,
    params: M.params.map((q) => (q.key === 'x0' ? { key: 'phi', sym: 'φ', label: `phase at your first point (0° = ${M.phase0})`, unit: 'deg' } : q)),
    eq: (v) => M.eq(v).replace(/2π \((.*?) − x₀\) \/ P/, (s, x) => `2π (${x} − x₁) / P + φ`) + (/class="nb-eqnote"/.test(M.eq(v)) ? '' : `<span class="nb-eqnote">x₁ = your smallest ${it(v.x)}</span>`),
    f: (x, p, c) => M.f(x, at(p, c), c),
    knots: M.knots && ((p, c, lo, hi) => M.knots(at(p, c), c, lo, hi)),
    ranges: (d) => { const r = { ...M.ranges(d) }; delete r.x0; r.phi = [0, 360, 0]; return r; } };
}
/** Change a wave between moment and angle without moving the curve. */
export function switchPhase(M, m, c, to) {
  const p = m.p;
  if (to === 'angle') { if (Number.isFinite(p.x0) && p.P) p.phi = ((c.x1 - p.x0) / p.P % 1 + 1) % 1 * 360; delete p.x0; delete m.r.x0; }
  else { if (Number.isFinite(p.phi) && p.P) p.x0 = c.x1 - p.phi / 360 * p.P; delete p.phi; delete m.r.phi; }
  m.phase = to;
}

/** Extent of the plotted data: {n, xmin, xmax, ymin, ymax, tmin, tmax}. pts = [{x, y, t?}] (finite values only). */
export function extent(pts) {
  const d = { n: pts.length, xmin: Infinity, xmax: -Infinity, ymin: Infinity, ymax: -Infinity, tmin: Infinity, tmax: -Infinity };
  for (const q of pts) { d.xmin = Math.min(d.xmin, q.x); d.xmax = Math.max(d.xmax, q.x); d.ymin = Math.min(d.ymin, q.y); d.ymax = Math.max(d.ymax, q.y); if (Number.isFinite(q.t)) { d.tmin = Math.min(d.tmin, q.t); d.tmax = Math.max(d.tmax, q.t); } }
  if (!pts.length) { d.xmin = d.ymin = 0; d.xmax = d.ymax = 1; }
  if (!Number.isFinite(d.tmin)) { d.tmin = 0; d.tmax = 1; }
  return d;
}
/** The constants a model may use: the smallest x and t of the data. */
export const anchors = (d) => ({ x1: d.xmin, t1: d.tmin });

/** Residuals of the points from the model: {res: [...], ss (sum of squares), rms, max, n}. For a curve traced in time, each residual is
 *  the distance on the graph between the point and where the model is at that point's time (dx, dy are kept too). */
export function residuals(model, p, pts, c) {
  const res = [], dx = [], dy = []; let ss = 0, mx = 0, n = 0;
  for (const q of pts) {
    let r;
    if (model.needsT) {
      if (!Number.isFinite(q.t)) { res.push(NaN); dx.push(NaN); dy.push(NaN); continue; }
      const m = model.xy(q.t, p, c); dx.push(q.x - m[0]); dy.push(q.y - m[1]); r = Math.hypot(q.x - m[0], q.y - m[1]);
    } else if (model.closed) r = model.gap(q.x, q.y, p);
    else r = q.y - model.f(q.x, p, c);
    res.push(r);
    if (Number.isFinite(r)) { ss += r * r; mx = Math.max(mx, Math.abs(r)); n++; }
  }
  return { res, dx, dy, ss: n ? ss : NaN, rms: n ? Math.sqrt(ss / n) : NaN, max: n ? mx : NaN, n };
}

/** Least-squares parameters by Nelder–Mead from a starting guess. For the instructor switch and the checks ONLY:
 *  the student's interface has no automatic fit. */
export function bestFit(model, p0, pts, c, { iters = 4000, scale = null } = {}) {
  const keys = model.params.map((q) => q.key), n = keys.length;
  const cost = (v) => { const p = {}; keys.forEach((k, i) => { p[k] = v[i]; }); const r = residuals(model, p, pts, c); return Number.isFinite(r.rms) ? r.rms : 1e300; };
  const x0 = keys.map((k) => p0[k]);
  let S = [x0.slice()];
  for (let i = 0; i < n; i++) { const v = x0.slice(); v[i] += scale && scale[keys[i]] ? scale[keys[i]] : (Math.abs(v[i]) > 1e-9 ? 0.05 * Math.abs(v[i]) : 0.01); S.push(v); }
  let F = S.map(cost);
  for (let it2 = 0; it2 < iters; it2++) {
    const o = F.map((f, i) => i).sort((a, b) => F[a] - F[b]); S = o.map((i) => S[i]); F = o.map((i) => F[i]);
    if (Math.abs(F[n] - F[0]) < 1e-13 * (Math.abs(F[0]) + 1e-300)) break;
    const cen = new Array(n).fill(0); for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cen[j] += S[i][j] / n;
    const at = (k) => cen.map((cj, j) => cj + k * (S[n][j] - cj));
    const xr = at(-1), fr = cost(xr);
    if (fr < F[0]) { const xe = at(-2), fe = cost(xe); if (fe < fr) { S[n] = xe; F[n] = fe; } else { S[n] = xr; F[n] = fr; } }
    else if (fr < F[n - 1]) { S[n] = xr; F[n] = fr; }
    else { const xc = at(0.5), fc = cost(xc); if (fc < F[n]) { S[n] = xc; F[n] = fc; } else { for (let i = 1; i <= n; i++) { S[i] = S[i].map((v, j) => S[0][j] + 0.5 * (v - S[0][j])); F[i] = cost(S[i]); } } }
  }
  const best = F.indexOf(Math.min(...F)), p = {}; keys.forEach((k, i) => { p[k] = S[best][i]; });
  return { p, rms: F[best] };
}
