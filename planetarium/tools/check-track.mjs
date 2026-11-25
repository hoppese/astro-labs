// Section 25 of tools/check.mjs: following with an offset (js/nav.js), the middle of the free sky (js/layout.js), links. A failure throws.
export async function checkTrack({ line }) {
  const { state } = await import('../js/state.js');
  const { getFrame } = await import('../js/skyframe.js');
  const { getBodies } = await import('../js/ephem.js');
  const C = await import('../js/catalog.js');
  const K = await import('../js/camera.js');
  const { refHorApparent } = await import('../js/objects.js');
  const nav = await import('../js/nav.js');
  const { freeSky } = await import('../js/layout.js');
  const { cam } = K, need = (ok, t) => { if (!ok) throw new Error('tracking: ' + t); };
  const saved = JSON.stringify({ t: state.timeMs, loc: state.loc, show: state.show, mount: state.mount, playing: state.playing });
  const star = (nm) => { for (const i of Object.keys(C.stars.names.name)) if (C.stars.names.name[i] === nm) return { kind: 'star', k: 0, i: +i }; throw new Error(nm); };
  const body = (id) => ({ kind: 'body', id });
  K.setCentre(0, 0); K.resize(1512, 772);
  let now = performance.now();
  const at = (ref) => { const f = getFrame(); K.update(f); const p = [0, 0]; return K.projectHor(refHorApparent(ref, f, getBodies(f)), p) ? p : [NaN, NaN]; };
  const step = (ms = 16.7, rate = 0) => { now += ms; state.timeMs += ms * rate; nav.stepNav(now, getFrame()); };
  const settle = () => { for (let k = 0; k < 120; k++) step(); };
  const centre = (ref, fov) => { nav.stopTracking(); nav.cancelAnim(); cam.roll = 0; cam.fov = fov; nav.select(ref); nav.centerOn(ref); now = performance.now() + 2000; step(); settle(); };
  const drag = (dx, dy, x0 = 756, y0 = 386) => { nav.takeView(); const g = {}; for (let k = 1; k <= 20; k++) nav.moveSky(nav.skyUnder(x0 + dx * (k - 1) / 20, y0 + dy * (k - 1) / 20), x0 + dx * k / 20, y0 + dy * k / 20, g); };
  let worst = 0, worstAt = '', n = 0, grab = 0;
  const places = { Richmond: 39.83, pole: 89.99, equator: 0.01, south: -33.9 };
  for (const [pl, lat] of Object.entries(places)) for (const mount of ['altaz', 'eq']) for (const [ref, t, fov] of [
    [body('Jupiter'), '2026-11-25T09:30:00Z', 0.3], [body('Jupiter'), '2026-11-25T09:30:00Z', 40], [body('Moon'), '2026-11-25T05:00:00Z', 2], [star('Betelgeuse'), '2026-11-25T06:00:00Z', 1],
    [star('Polaris'), '2026-11-25T06:00:00Z', 2], [star('Polaris'), '2026-11-25T06:00:00Z', 30], [star('Vega'), '2026-06-25T05:00:00Z', 5], [body('Sun'), '2026-11-25T21:30:00Z', 10]]) for (const rate of [1, 100, 1000, 30000]) {
    state.loc = { name: pl, lat, lon: -84.89, elev: 0, tz: 'UTC' }; state.mount = mount; state.timeMs = Date.parse(t); state.playing = true; state.rate = rate;
    centre(ref, fov);
    const p0 = at(ref); drag(230, -120); const p1 = at(ref);
    const free = Math.hypot(p1[0] - p0[0] - 230, p1[1] - p0[1] + 120); if (fov <= 2 && mount === 'altaz' && pl === 'Richmond' && ref.id) grab = Math.max(grab, free);
        for (let k = 0; k < 240; k++) { step(16.7, rate); const p = at(ref), d = Math.hypot(p[0] - p1[0], p[1] - p1[1]); if (!(d <= worst)) { worst = d; worstAt = `${pl} ${mount} ${ref.id || 'star'} fov ${fov} x${rate}`; } }
    n++;
    need(state.tracking, 'a drag ended it');
  }
  line(`  object dragged 230 px aside, then 4 s at x1, x100, x1000, x30,000 (alt-az and equatorial, fields 0.3 to 40 deg, Jupiter, Moon, Sun, Betelgeuse, Vega, Polaris; latitudes 39.8, 89.99, 0, -33.9): ${n} cases`);
  line(`  drift of the followed object on screen: at most ${worst.toExponential(1)} px (${worstAt}); it left the pointer by at most ${grab.toFixed(3)} px during the drag`);
  need(worst < 0.1, 'drift ' + worst + ' ' + worstAt); need(grab < 1.5, 'object left the pointer ' + grab);

  // through the zenith in alt-az, narrow field, dragged sideways: no swing. A star's neighbour must stay put too.
  { const ref = star('Vega'); state.loc = { name: 'z', lat: 38.79, lon: -84.89, elev: 0, tz: 'UTC' }; state.mount = 'altaz'; state.timeMs = Date.parse('2026-06-25T05:00:00Z');
    // to the transit
    let best = 0, bt = 0; for (let k = -720; k < 720; k++) { state.timeMs = Date.parse('2026-06-25T05:00:00Z') + k * 60000; const h = refHorApparent(ref, getFrame(), getBodies(getFrame())); if (h[2] > best) { best = h[2]; bt = state.timeMs; } }
    for (const [fov, rate] of [[1, 100], [1, 1000], [20, 100]]) {
      state.timeMs = bt - 600000; state.rate = rate; centre(ref, fov); drag(300, 40); const p1 = at(ref);
      const f0 = getFrame(), A0 = [cam.V.slice(), f0.Mjh.slice()]; let d = 0, sp = 0;
      const steps = Math.ceil(1200000 / (16.7 * rate));
      const rel = (V, M) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(V[3 * i] * M[j] + V[3 * i + 1] * M[3 + j] + V[3 * i + 2] * M[6 + j]); return r; };
      const R0 = rel(...A0);
      for (let k = 0; k < steps; k++) { step(16.7, rate); const p = at(ref); d = Math.max(d, Math.hypot(p[0] - p1[0], p[1] - p1[1])); const R1 = rel(cam.V, getFrame().Mjh); let tr = 0; for (let i = 0; i < 9; i++) tr += R0[i] * R1[i]; sp = Math.max(sp, Math.acos(Math.min(1, (tr - 1) / 2)) * 180 / Math.PI); }
      line(`  Vega through the zenith (best altitude ${(Math.asin(best) * 180 / Math.PI).toFixed(2)} deg), alt-az, field ${fov} deg, x${rate}, 20 min of sky: drift ${d.toExponential(1)} px, the picture turned against the stars by ${(sp).toExponential(1)} deg (refraction)`);
      need(d < 0.1 && sp < 0.1, 'zenith ' + d + ' ' + sp);
    } }

  // selection, empty click, Space, T, another object, going elsewhere
  { const J = body('Jupiter'), Io = body('Io'); state.loc = { name: 'Richmond', lat: 39.83, lon: -84.89, elev: 0, tz: 'UTC' }; state.timeMs = Date.parse('2026-11-25T09:30:00Z'); state.rate = 1000;
    centre(J, 0.3); drag(200, 0); const p = at(J);
    nav.select(null); need(state.tracking && state.trackRef.id === 'Jupiter' && !state.selected, 'empty click');
    nav.select(Io); step(); need(state.tracking && state.trackRef.id === 'Jupiter', 'selecting Io');
    const q = at(J); need(Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01, 'selection moved it');
    // zoom about a point: the sky there and the follow both stay
    const m = [900, 300], a0 = nav.skyUnder(...m); nav.zoomTracked(0.5, ...m); const b = [0, 0]; K.projectHor(a0, b); need(Math.hypot(b[0] - m[0], b[1] - m[1]) < 0.01, 'zoom point ' + b);
    const z = at(J); for (let k = 0; k < 60; k++) step(16.7, 1000); const z2 = at(J); need(Math.hypot(z[0] - z2[0], z[1] - z2[1]) < 0.01, 'after zoom');
    nav.select(J); nav.centerOn(J); let far = 0, t0 = performance.now(); now = t0; for (let k = 0; k < 60; k++) { step(16.7, 1000); far = Math.max(far, Math.abs(at(J)[0] - 756)); } const c = at(J); need(Math.hypot(c[0] - 756, c[1] - 386) < 0.01, 'Space ' + c); need(far <= Math.abs(z2[0] - 756) + 1, 'Space swung out ' + far);
    nav.select(Io); nav.toggleTracking(); need(state.tracking && state.trackRef.id === 'Io', 'T on Io'); nav.toggleTracking(); need(!state.tracking, 'T again');
    nav.select(null); centre(J, 1); nav.select(null); nav.toggleTracking(); need(!state.tracking, 'T with nothing selected');
    centre(J, 1); nav.select(Io); nav.flyTo([0, 0, 1]); need(!state.tracking, 'going elsewhere ends it');
    // pinch: no jump at the start, follows to the end
    centre(J, 1); drag(60, 20); const s0 = at(J); nav.zoomTracked(1, 700, 400, 700, 400); const s1 = at(J); need(Math.hypot(s0[0] - s1[0], s0[1] - s1[1]) < 1e-6, 'pinch jump');
    // a far drag: still followed
    for (let k = 0; k < 12; k++) drag(600, 0); for (let k = 0; k < 30; k++) step(16.7, 1000); need(state.tracking, 'out of view'); nav.centerOn(J); now = performance.now() + 900; step(); const e = at(J); need(Math.hypot(e[0] - 756, e[1] - 386) < 0.01, 'return ' + e);
    // offset as a link
    drag(150, 90); for (let k = 0; k < 60; k++) step(); const o = nav.getOffset(), w = at(J), vv = cam.V.slice(); nav.stopTracking(); nav.track(J); cam.roll = 0; nav.setOffset(o.map((x) => +x.toPrecision(6))); step(); const w2 = at(J); let dv = 0; for (let i = 0; i < 9; i++) dv = Math.max(dv, Math.abs(vv[i] - cam.V[i]));
    line(`  link: offset ${o.map((x) => x.toPrecision(6)).join(', ')} gives the object back ${Math.hypot(w[0] - w2[0], w[1] - w2[1]).toExponential(1)} px from its place`); need(Math.hypot(w[0] - w2[0], w[1] - w2[1]) < 0.1, 'link');
    // the moved centre
    nav.stopTracking(); centre(J, 1); nav.aimCentre(-80, -120); for (let k = 0; k < 120; k++) step(16.7, 1000); const c2 = at(J); need(Math.hypot(c2[0] - 676, c2[1] - 266) < 0.01, 'moved centre ' + c2); nav.aimCentre(0, 0, true); settle(); }
  const f = freeSky(390, 760, [{ x0: 6, x1: 384, y0: 470, y1: 658 }], 52, 96); need(f && f.b === 470 && f.t === 52, 'sheet'); need(freeSky(1512, 772, [], 52, 52) === null, 'nothing covers');
  const s = JSON.parse(saved); nav.stopTracking(); nav.select(null); cam.roll = 0; state.timeMs = s.t; state.loc = s.loc; state.mount = s.mount; state.playing = s.playing; state.rate = 1; Object.assign(state.show, s.show);
}
