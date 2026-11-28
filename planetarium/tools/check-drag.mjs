// Section 31 of tools/check.mjs: dragging the free sky (js/camera.js bringUnder / trackBall, js/nav.js). A failure throws.
// The grabbed point must stay under the finger everywhere, across the zenith (alt-az) and the celestial pole (equatorial)
// included, in every direction; and once the finger lifts the tilt the drag may have given the picture must level out.
export async function checkDrag({ line }) {
  const { state } = await import('../js/state.js');
  const { getFrame } = await import('../js/skyframe.js');
  const K = await import('../js/camera.js');
  const nav = await import('../js/nav.js');
  const { mulMV } = await import('../js/astro.js');
  const { cam } = K, need = (ok, t) => { if (!ok) throw new Error('drag: ' + t); };
  const saved = JSON.stringify({ t: state.timeMs, loc: state.loc, mount: state.mount, playing: state.playing });
  K.setCentre(0, 0); K.resize(390, 760);                                    // a phone held upright
  state.loc = { name: 'Richmond', lat: 39.83, lon: -84.89, elev: 0, tz: 'UTC' }; state.timeMs = Date.parse('2026-06-25T03:00:00Z'); state.playing = false;
  nav.stopTracking(); nav.cancelAnim();
  const dir = (g) => { const l = g.lon * Math.PI / 180, b = g.lat * Math.PI / 180; return mulMV(cam.M, [Math.cos(b) * Math.cos(l), Math.cos(b) * Math.sin(l), Math.sin(b)]); };
  let worst = 0, worstAt = '', n = 0, crossed = 0;
  for (const mount of ['altaz', 'eq']) for (const fov of [30, 70, 120]) for (const [lat0, path] of [
    [70, [[195, 60], [195, 700]]],            // a star high in the top of the screen pulled all the way down: over the pole
    [80, [[60, 380], [330, 380]]],            // across the screen beside the pole
    [85, [[195, 200], [330, 600], [60, 600], [195, 120]]],      // round and round near it
    [40, [[195, 100], [195, 740]]],           // an ordinary pull
  ]) {
    state.mount = mount; const f = getFrame(); cam.fov = fov; cam.roll = 0; cam.lon = -90; cam.lat = lat0; K.update(f);
    let [x, y] = path[0]; const g = K.mountAt(x, y); const lat1 = cam.lat;
    for (let s = 1; s < path.length; s++) {
      const [x0, y0] = path[s - 1], [x1, y1] = path[s];
      for (let k = 1; k <= 60; k++) {
        x = x0 + (x1 - x0) * k / 60; y = y0 + (y1 - y0) * k / 60;
        K.bringUnder(g, x, y, f);
        const p = [0, 0], on = K.projectHor(dir(g), p), d = on ? Math.hypot(p[0] - x, p[1] - y) : Infinity;
        if (!(d <= worst)) { worst = d; worstAt = `${mount} fov ${fov} from ${lat0}: at (${x.toFixed(0)}, ${y.toFixed(0)})`; }
      }
    }
    if (Math.abs(cam.roll) > 90 || Math.sign(cam.lat) !== Math.sign(lat1) || Math.abs(cam.lon - -90) > 90) crossed++;
    // let go: the picture levels itself
    let now = performance.now(); nav.holdCentre(false);
    for (let k = 0; k < 180; k++) { now += 16.7; nav.stepNav(now, f); }
    need(Math.abs(cam.roll) < 0.01, `still tilted ${cam.roll.toFixed(2)} deg 3 s after letting go (${mount} fov ${fov})`);
    n++;
  }
  line(`  ${n} drags on a phone-shaped screen (alt-az and equatorial, fields 30 to 120 deg, over the mount's pole and round it): the grabbed point stayed within ${worst.toFixed(3)} px of the finger (worst: ${worstAt}); ${crossed} went over the pole`);
  line('  3 s after the finger lifts the picture is level again (roll < 0.01 deg) in every case');
  need(worst < 0.5, 'the sky slipped from the finger by ' + worst.toFixed(2) + ' px, ' + worstAt);
  need(crossed > 0, 'no drag went over the pole');
  const s = JSON.parse(saved); state.timeMs = s.t; state.loc = s.loc; state.mount = s.mount; state.playing = s.playing; cam.roll = 0;
}
