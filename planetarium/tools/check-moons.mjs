// Section 26 of check.mjs: moons in front of, behind, shadowing and shadowed by their planets, against windows derived from JPL Horizons
// (tools/moon-events-truth.json), and that what is drawn is on the right side. A failure throws. Alone: node tools/check-moons.mjs
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import './check-env.mjs';
export async function checkMoons(line = console.log) {
  const J = await import('../js/labs/jovian.js'), E = await import('../js/ephem.js'), { makeFrame } = await import('../js/skyframe.js'), X = await import('../js/astro.js');
  const T = JSON.parse(readFileSync(new URL('./moon-events-truth.json', import.meta.url))), GEO = { lat: 0, lon: 0, elev: -6378137 };
  const bad = [], worst = {}; let n = 0;
  for (const [planet, moon, kind, s, e] of T.events) {
    const a = Date.parse(s.replace(' ', 'T') + 'Z'), b = Date.parse(e.replace(' ', 'T') + 'Z');
    const h = J.jovianEvents(a - 3 * 3600e3, 1e9, { planet, kinds: [kind], span: 6 * 3600e3 }).filter((x) => x.moon === moon).sort((x, y) => Math.abs(x.t - a) - Math.abs(y.t - a))[0];
    const d = h ? Math.max(Math.abs(h.t - a), Math.abs(h.end - b)) / 1000 : Infinity, k = planet + ' ' + moon; n++;
    worst[k] = Math.max(worst[k] || 0, d);
    if (d > (moon === 'Titan' || planet === 'Uranus' ? 150 : 60)) bad.push(`${k} ${kind} ${s}: ${d.toFixed(0)} s`);
    // what is drawn (ephem.compute is all the renderer knows): half way, and 10 % of the length before and after
    const at = (t) => E.compute(makeFrame(t, GEO), true, false).byId[moon], mid = at((a + b) / 2), out = [at(a - 0.1 * (b - a)), at(b + 0.1 * (b - a))];
    const inFront = X.dot(mid.rel, mid.u) < 0;
    const ok = kind === 'transit' ? inFront && mid.transit && mid.inLimb > 0 && !mid.occulted && out.every((m) => !m.transit && m.inLimb < 0 && !m.occulted)
      : kind === 'occultation' ? !inFront && mid.behind && mid.occulted && !mid.transit && out.every((m) => !m.occulted)
      : kind === 'eclipse' ? mid.behind && mid.light < 0.5 && out.every((m) => m.light > 0.5)
      : X.dot(mid.rel, mid.toSun) > 0;
    if (!ok) bad.push(`${k} ${kind} ${s}: drawn on the wrong side or not at all`);
  }
  // and the renderer draws it: every transit of Saturn by an inner moon at a scale where the moon is a fraction of a pixel (planets.js; the bug of 24 Nov 2026)
  const P = await import('../js/render/planets.js'), { R } = await import('../js/render/proj.js'), K = await import('../js/camera.js'), { beginPicks, allPicks } = await import('../js/picks.js'), { LabelLayer } = await import('../js/render/labels.js'), { state } = await import('../js/state.js');
  const grad = { addColorStop() {} }, noop = new Proxy({}, { get: (t, k) => (k in t ? t[k] : k === 'getTransform' ? () => ({ a: 1 }) : k === 'measureText' ? () => ({ width: 10 }) : /Gradient/.test(String(k)) ? () => grad : () => {}), set: (t, k, v) => ((t[k] = v), true) });
  const was = { ...state.show }; Object.assign(state.show, { ground: false, atmosphere: false, refraction: false });
  let seen = 0;
  if (typeof document === 'undefined') globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  for (const [planet, moon, kind, s, e] of T.events) {
    if (kind !== 'transit' && kind !== 'occultation') continue;
    const a = Date.parse(s.replace(' ', 'T') + 'Z'), b = Date.parse(e.replace(' ', 'T') + 'Z');
    for (const q of [0.1, 0.5, 0.9]) {
      const f = makeFrame(a + q * (b - a), GEO), B = E.compute(f, true); K.resize(900, 700); K.update(f); K.lookAtHor(B.byId[planet].hor); K.cam.fov = (planet === 'Pluto' ? 2e-4 : planet === 'Uranus' ? 0.003 : 0.02); K.update(f);
      Object.assign(R, { ctx: noop, frame: f, bodies: B, sky: { limMag: 14, day: 0, sunAlt: -40, sunFrac: 1 }, labels: new LabelLayer(), atmo: false, refr: false, ground: false });
      R.labels.begin(); beginPicks(); P.drawBodies(noop);
      const drawn = allPicks().some((x) => x.ref.id === moon);
      if (drawn !== (kind === 'transit')) bad.push(`${moon} ${kind} ${s}: ${drawn ? 'drawn' : 'not drawn'} at ${q}`); else seen++;
    }
  }
  Object.assign(state.show, was);
  line(`  the renderer, 3 instants in each of the transits and occultations: ${seen} right`);
  line(`  ${n} events; largest difference of a start or end (s): ` + Object.entries(worst).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
  for (const [planet, day, days] of T.none) { const c = J.jovianEvents(Date.parse(day), 99, { planet, span: days * 864e5, kinds: ['transit', 'shadow', 'occultation', 'eclipse'] }).length; if (c) bad.push(`${planet} ${day}: ${c} events where Horizons has none`); }
  const r = J.jovianEvents(Date.parse('2026-11-01'), 1e9, { planet: 'Saturn', span: 61 * 864e5, kinds: ['transit', 'shadow'] }), c = {}; for (const x of r) { const k = x.moon + ' ' + x.kind; c[k] = (c[k] || 0) + 1; }
  line('  Saturn, Nov-Dec 2026: ' + Object.entries(c).map(([k, v]) => `${k} ${v}`).join(', ') + '; wide open (June 2017, June 2032): none');
  for (const m of T.neverNovDec2026) if (r.some((x) => x.moon === m)) bad.push(m + ' does not cross Saturn in Nov-Dec 2026');
  if (bad.length) throw new Error('moons: ' + bad.join('; '));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  globalThis.fetch = async (url) => { const buf = readFileSync(new URL(url)); return { ok: true, status: 200, json: async () => JSON.parse(buf.toString('utf8')), arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) }; };
  await (await import('../js/jpl.js')).loadAll(); await checkMoons();
}
