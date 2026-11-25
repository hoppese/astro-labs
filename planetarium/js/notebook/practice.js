// notebook/practice.js: made-up tables to learn the notebook on (the graph, the sliders, the residuals), always labelled
// as practice data on screen, in the CSV and on the saved graph. The numbers behind each set are drawn from the
// student's own seed, so they cannot be looked up. No model, axis or label is chosen for the student. Pure (no DOM).

const gen = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export const PRACTICE = [
  { id: 'line', name: 'Something steady', sub: 'two quantities that go up together', cols: [['time', 's'], ['distance', 'm']], make: (r, g) => { const m = 2 + 6 * r(), b = 5 * r(); return row(12, (k) => { const t = k * 0.5; return [t, b + m * t + 0.4 * g()]; }); } },
  { id: 'curve', name: 'Something that speeds up', sub: 'a curve: which power?', cols: [['time', 's'], ['distance', 'm']], make: (r, g) => { const a = 1 + 3 * r(); return row(12, (k) => { const t = 0.3 + k * 0.25; return [t, a * t * t + 0.03 * g()]; }); } },
  { id: 'wave', name: 'Something that repeats', sub: 'a wave to fit by hand', cols: [['time', 'd'], ['offset', 'arcsec']], make: (r, g) => { const A = 40 + 80 * r(), P = 3 + 5 * r(), f = r(); return row(24, (k) => { const t = k * 0.7 + 0.3 * r(); return [t, A * Math.sin(2 * Math.PI * (t / P + f)) + 0.04 * A * g()]; }); } },
  { id: 'tilted', name: 'A distance that swings in and out', sub: 'something going round, never negative', cols: [['time', 'd'], ['separation', 'arcsec']], make: (r, g) => { const A = 60 + 60 * r(), P = 5 + 6 * r(), f = r(), s = Math.sin((5 + 35 * r()) * Math.PI / 180); return row(26, (k) => { const t = k * 0.6 + 0.2 * r(), q = 2 * Math.PI * (t / P + f); return [t, Math.abs(A * Math.hypot(Math.sin(q), s * Math.cos(q)) + 0.03 * A * g())]; }); } },
  { id: 'ring', name: 'Points round a center', sub: 'where is the center, and how wide?', cols: [['across', 'km'], ['up', 'km']], make: (r, g) => { const x = 20 * r() - 10, y = 20 * r() - 10, R = 6 + 8 * r(); return row(30, () => { const q = 2 * Math.PI * r(); return [x + R * Math.cos(q) + 0.5 * g(), y + R * Math.sin(q) + 0.5 * g()]; }); } },
];
const row = (n, f) => Array.from({ length: n }, (_, k) => f(k));
/** {title, cols: [[name, unit], ...], rows: [[...], ...]} of one set, as numbers rounded to what one would write down. */
export function practiceData(id, seed) {
  const P = PRACTICE.find((p) => p.id === id), r = gen(seed + 7919 * PRACTICE.indexOf(P)), g = () => Math.sqrt(-2 * Math.log(r() + 1e-12)) * Math.cos(2 * Math.PI * r());
  return { title: 'PRACTICE DATA (made up): ' + P.name.toLowerCase(), cols: P.cols, rows: P.make(r, g).map((c) => c.map((v) => +v.toPrecision(4))) };
}
