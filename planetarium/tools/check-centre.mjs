// Section 22 of tools/check.mjs: whatever is selected, marked or centred must coincide with what is drawn.
// Runs the page's own drawing loops (render/stars.js, render/dso.js, render/planets.js) against a canvas context that
// ignores every call, reads back where each object registered itself (picks.js = where it was drawn), and compares with
// the place the selection marker and the fly-to use (objects.js refHorApparent), for every combination of the Corrections
// switches. Then: after "centre" the object must stay in the middle of the view as the clock runs (nav.js).
// A failure throws.
export async function checkCentre({ line, f2 }) {
  const noop = new Proxy(function () {}, { get: (t, k) => (k === 'canvas' ? { width: 64, height: 64 } : noop), set: () => true, apply: () => noop });
  const hadDoc = globalThis.document;           // check.mjs leaves a stub without getContext behind
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => noop }) };
  const { state, emit } = await import('../js/state.js');
  const { getFrame } = await import('../js/skyframe.js');
  const { getBodies } = await import('../js/ephem.js');
  const C = await import('../js/catalog.js');
  const { cam, resize, update, lookAtHor, projectHor } = await import('../js/camera.js');
  const { refHorApparent, refKey, refName } = await import('../js/objects.js');
  const { R } = await import('../js/render/proj.js');
  const { beginPicks, allPicks } = await import('../js/picks.js');
  const { drawStars } = await import('../js/render/stars.js');
  const { drawDso } = await import('../js/render/dso.js');
  const { drawBodies } = await import('../js/render/planets.js');
  const { LabelLayer } = await import('../js/render/labels.js');
  const nav = await import('../js/nav.js');

  await C.loadAllTiers(); await C.loadDeepDso();
  const saved = JSON.stringify({ t: state.timeMs, loc: state.loc, show: state.show, fx: state.fx, lt: state.lightTime, playing: state.playing });
  state.loc = { name: 'Richmond', lat: 39.83, lon: -84.89, elev: 300, tz: 'UTC' };
  state.timeMs = Date.parse('2026-11-25T08:00:00Z'); state.playing = false;
  state.show.ground = false; state.show.atmosphere = false; state.show.dso = true; state.show.starNames = false;
  resize(1512, 772);

  const starByName = (nm) => { for (const i of Object.keys(C.stars.names.name)) if (C.stars.names.name[i] === nm) return { kind: 'star', k: 0, i: +i }; throw new Error(nm); };
  const starByHip = (hip) => { for (const t of C.stars.tiers) for (let i = 0; i < t.n; i++) if (t.data[i * C.stars.NF + C.F.hip] === hip) return { kind: 'star', k: t.k, i }; throw new Error('HIP ' + hip); };
  const dsoBy = (f) => { const o = C.dso.rows.find(f); if (!o) throw new Error('dso'); return { kind: 'dso', idx: o.idx }; };
  const body = (id) => ({ kind: 'body', id });
  const objs = [starByName('Betelgeuse'), starByName('Sirius'), starByHip(87937), starByHip(104214), starByName('Polaris'), body('Jupiter'), body('Io'),
    body('Moon'), body('Saturn'), body('Titan'), body('Sun'), body('Venus'), dsoBy((o) => o.m === 57), dsoBy((o) => o.m === 31), dsoBy((o) => o.m === 42),
    dsoBy((o) => o.m === 13), dsoBy((o) => o.id === 'NGC 7000')];
  // a star 1-3 degrees above the horizon, where refraction is a third of a degree
  { const fr = getFrame(), b = getBodies(fr); state.show.refraction = true;
    for (let i = 0; i < 4000; i++) { const h = refHorApparent({ kind: 'star', k: 0, i }, fr, b), alt = Math.asin(h[2]) * 180 / Math.PI; if (alt > 1 && alt < 3) { objs.push({ kind: 'star', k: 0, i }); break; } } }

  const sp = [0, 0], labels = new LabelLayer();
  function drawnVsMarker(ref, fov) {
    const frame = getFrame(), bodies = getBodies(frame);
    const h = refHorApparent(ref, frame, bodies);
    cam.fov = fov; update(frame); lookAtHor(h); cam.lon += 0.31 * fov; cam.lat += 0.17 * fov; update(frame);      // off-centre on purpose
    C.stars.epochTol = C.epochTolFor(cam.fov); C.setStarEpoch(frame.years);
    Object.assign(R, { ctx: noop, frame, bodies, sky: { limMag: 16, day: 0, sunAlt: -40, base: 6, twilight: 0 }, labels, atmo: state.show.atmosphere, refr: state.show.refraction, ground: state.show.ground });
    state.selected = ref;
    labels.begin(); beginPicks();
    drawStars(noop); drawDso(noop); drawBodies(noop);
    const key = refKey(ref), it = allPicks().find((p) => p.ref && refKey(p.ref) === key);
    if (!it) return NaN;
    if (!projectHor(h, sp)) return NaN;
    return Math.hypot(it.x - sp[0], it.y - sp[1]) * 3600 / cam.pxPerDeg;
  }
  let worst = 0, worstAt = '', n = 0, missing = [];
  for (let m = 0; m < 32; m++) {
    state.fx.aberration = !!(m & 1); state.fx.parallax = !!(m & 2); state.fx.properMotion = !!(m & 4); state.show.refraction = !!(m & 8); state.lightTime = !!(m & 16);
    emit('fx', 'aberration'); emit('lightTime', state.lightTime);
    for (const ref of objs) for (const fov of [2, 0.05, 0.001]) {
      if (fov > 1 && (ref.id === 'Titan' || ref.id === 'Io')) continue;          // moons are not drawn apart from their planet at wide fields
      const d = drawnVsMarker(ref, fov); n++;
      const tag = `${refName(ref)} at field ${fov} deg, switches ${m.toString(2).padStart(5, '0')}`;
      if (!(d >= 0)) { missing.push(tag); continue; }
      if (d > worst) { worst = d; worstAt = tag; }
    }
  }
  line(`  ${objs.length} objects (${objs.map((r) => refName(r)).join(', ')})`);
  line(`  x 32 combinations of aberration / parallax / proper motion / refraction / light time x fields of 2 deg, 3 arcmin, 3.6 arcsec: ${n} cases`);
  line(`  drawn place vs selection marker: largest difference ${worst.toExponential(2)}" ${worstAt ? '(' + worstAt + ')' : ''}; not drawn at all: ${missing.length}`);
  if (missing.length) throw new Error('selected object not drawn: ' + missing.slice(0, 5).join(' | '));
  if (worst > 0.01) throw new Error(`drawn place and marker differ by ${worst}" (${worstAt})`);

  // every J2000 direction turned into a horizon one must be a unit vector (refraction and the view-cone test assume it)
  { const fr = getFrame(); state.fx.aberration = true; const f2r = getFrame(); let w = 0;
    for (const o of C.dso.rows.slice(0, 500)) { const h = f2r.starHor(o.vec); w = Math.max(w, Math.abs(Math.hypot(h[0], h[1], h[2]) - 1)); }
    line(`  frame.starHor(): |h| - 1 at most ${w.toExponential(1)} over 500 deep-sky objects (was up to 1e-4 = 20" x tan(altitude) of error after refraction)`);
    if (w > 1e-12) throw new Error('starHor is not a unit vector'); void fr; }

  // centre = hold: after centerOn the object stays at the middle of the view while the clock runs
  state.fx.aberration = state.fx.parallax = state.fx.properMotion = true; state.show.refraction = true; state.lightTime = true; emit('fx', 'aberration');
  let worstC = 0, worstFree = 0;
  for (const ref of objs.slice(0, 13)) {
    state.timeMs = Date.parse('2026-11-25T03:00:00Z'); cam.fov = 60;
    nav.select(ref); nav.centerOn(ref);
    if (!state.tracking) throw new Error('centerOn did not hold ' + refName(ref));
    let now = performance.now();
    for (let k = 0; k < 40; k++) { now += 25; state.timeMs += 25; nav.stepNav(now, getFrame()); }         // the 700 ms glide, clock running
    cam.fov = 0.004;
    for (let k = 0; k < 20; k++) { now += 500; state.timeMs += 500; nav.stepNav(now, getFrame()); }        // ten more seconds
    const fr = getFrame(); update(fr);
    const h = refHorApparent(ref, fr, getBodies(fr)); projectHor(h, sp);
    worstC = Math.max(worstC, Math.hypot(sp[0] - cam.cx, sp[1] - cam.cy) * 3600 / cam.pxPerDeg);
    // and what a one-off centring gives after the same ten seconds (the complaint): tracking off, sky turning
    state.tracking = false; state.timeMs += 10000; const fr2 = getFrame(); update(fr2);
    const h2 = refHorApparent(ref, fr2, getBodies(fr2)); if (projectHor(h2, sp)) worstFree = Math.max(worstFree, Math.hypot(sp[0] - cam.cx, sp[1] - cam.cy) * 3600 / cam.pxPerDeg); else worstFree = Infinity;
  }
  line(`  after "centre" (search, Space, double-click), clock running, 10 s later: object to view centre at most ${worstC.toExponential(2)}" (13 objects);`);
  line(`  the same view left alone for 10 s more (what centring used to do): up to ${Number.isFinite(worstFree) ? f2(worstFree, 0) + '"' : 'out of the field'}`);
  if (worstC > 0.01) throw new Error(`centred object is ${worstC}" from the centre`);

  const s = JSON.parse(saved);
  state.timeMs = s.t; state.loc = s.loc; Object.assign(state.show, s.show); Object.assign(state.fx, s.fx); state.lightTime = s.lt; state.playing = s.playing;
  state.selected = null; state.tracking = false; nav.cancelAnim(); emit('fx', 'aberration');
  if (hadDoc) globalThis.document = hadDoc; else delete globalThis.document;
}
