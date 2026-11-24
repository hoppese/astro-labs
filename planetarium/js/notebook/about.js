// notebook/about.js: "About this model". For each generic shape: the formula again in the student's own variables,
// what each slider means, where the shape turns up, and a small live diagram. The ellipse panel carries the
// argument Seth asked for: why a nearby star's yearly parallax path is an ELLIPSE with semi-axes p (along ecliptic
// longitude) and p·sin β (along latitude), not the back-and-forth line of the usual sketch, and what proper motion adds.

import { MODEL } from './models.js';

const TAU = 2 * Math.PI, DEG = Math.PI / 180;
const INK = '#e4ebf3', MUTED = '#94a3b5', GRID = 'rgba(255,255,255,0.14)', BLUE = '#3987e5', ORANGE = '#d95926', GOLD = '#e8b86a';

const TEXT = {
  line0: (v) => `<p>The simplest relation there is: double ${v.x} and ${v.y} doubles. The slope <i>m</i> is how much ${v.y} you get per unit of ${v.x}, so <b>its unit is (unit of ${v.y}) ÷ (unit of ${v.x})</b>. The line is pinned to the origin: if a straight line fits your points but misses zero, use the plain straight line.</p>
    <p>Where it turns up: speed against distance for galaxies (the slope is the Hubble constant), distance against time at steady speed, size against distance at a fixed angle.</p>`,
  line: (v) => `<p>Slope <i>m</i>: the change in ${v.y} for each unit of ${v.x} (unit of ${v.y} ÷ unit of ${v.x}). Intercept <i>b</i>: the value of ${v.y} where ${v.x} is zero, which may be far outside your data.</p>
    <p>Reading a slope off a graph: pick two well-separated points <b>on the line</b> (not data points) and divide the rise by the run.</p>`,
  quad: (v) => `<p>Three parts added together: a constant <i>a</i>, a part <i>b</i> · ${v.x} that grows steadily, and a part <i>c</i> · ${v.x}² that grows faster and faster. <i>c</i> sets how sharply the curve bends (and which way: negative <i>c</i> bends downward); its unit is (unit of ${v.y}) ÷ (unit of ${v.x})².</p>
    <p>Where it turns up: position against time under a steady acceleration, x = x₀ + v₀ t + ½ a t². Fitted to that, <i>b</i> is the starting velocity and <i>c</i> is <b>half</b> the acceleration.</p>`,
  power: (v) => `<p>${v.y} = A · ${v.x}<sup>n</sup>. The question a power law answers is “what is the exponent?”: does ${v.y} go as ${v.x}, as ${v.x}², as 1/${v.x}² …? With <b>both axes on a log scale</b> (Graph options) a power law is a straight line whose slope is <i>n</i>, so the exponent can be read straight off the graph: slide <i>n</i> until the line is parallel to your points, then <i>A</i> to lay it on them. <i>A</i> is the value of ${v.y} where ${v.x} = 1.</p>
    <p>The offsets x₀ and y₀ are for data whose zero is shifted (a clock started late, a ruler not at zero). Leave them at 0 for a pure power law; with an offset the log–log graph is no longer straight.</p>
    <p>Where it turns up: distance fallen against time (the 2 in t²), Kepler’s third law (period ∝ size<sup>3/2</sup>), brightness against distance (∝ distance<sup>−2</sup>).</p>`,
  sine: (v) => `<p>Anything going round a circle at a steady rate, seen from the side, moves in a sine wave. <i>A</i> is the radius of the circle (half the full swing), <i>P</i> the time for once round, <i>x₀</i> a moment it passes the middle going up, <i>y₀</i> the middle.</p>
    <p>Where it turns up: a moon of Jupiter seen edge-on. Its offset from the planet is a · sin(2π(t − t₀)/P); the greatest offset <i>a</i> is the orbit’s radius. Kepler’s third law in Newton’s form then weighs the planet: <b>M = 4π² a³ / (G P²)</b>, with <i>a</i> in metres (angle in radians × distance) and <i>P</i> in seconds. Converting the units is your job; the conversion columns help.</p>`,
  sineline: (v) => `<p>A straight line (slope <i>m</i>, value <i>b</i> at your first point) with a sine wave of amplitude <i>A</i> and period <i>P</i> riding on it. Fit the line first, through the middle of the wiggle; then the wave.</p>
    <p>Where it turns up: one coordinate of a nearby star against time. The line is its proper motion; the yearly wave is parallax (see “Ellipse with a steady drift” for the two-dimensional picture and why the wave’s size depends on direction).</p>`,
  tilt: (v) => `<p>The separation between a body and the thing it orbits, for a circular orbit of radius <i>A</i> tipped by the angle <i>tilt</i> toward us. Edge-on (tilt 0°) the separation falls to zero twice each orbit, when the body passes in front and behind. Tipped up, it only closes to A · sin(tilt). Face-on (90°) the separation never changes.</p>
    <p>A separation is never negative, so this curve bounces where a sine wave would cross zero: use it when you measured distances, not signed offsets.</p>`,
  ellipse: (v) => `<p>A point going round an ellipse (half-axes <i>a</i> and <i>b</i>, long axis turned by θ from your horizontal axis) once every <i>P</i>, while the whole ellipse slides at the steady rate (v<sub>x</sub>, v<sub>y</sub>). It needs three columns: horizontal, vertical, and the <b>time</b> of each point, because the curve is traced in time.</p>
    <h4>Where it turns up: a nearby star against distant ones</h4>
    <p>As the Earth goes round the Sun we look at a nearby star from a slightly different place each month, so it appears to shift against the far background. The star always appears displaced toward the Sun’s side of the sky, by an angle set by how far sideways the Earth has moved, as seen from the star. With the star at ecliptic longitude λ and latitude β, and the Sun at longitude λ<sub>☉</sub>:</p>
    <div class="nb-math">shift along the ecliptic:&emsp; Δλ · cos β = p · sin(λ<sub>☉</sub> − λ)<br>shift toward the ecliptic pole:&emsp; Δβ = − p · sin β · cos(λ<sub>☉</sub> − λ)</div>
    <p>One is a sine, the other a cosine, with <b>different sizes</b>. Square and add:</p>
    <div class="nb-math">( Δλ cos β / p )² + ( Δβ / (p sin β) )² = 1</div>
    <p>That is an ellipse with half-axes <b>p</b> (along the ecliptic) and <b>p · sin β</b> (toward the pole). The reason is in the picture below: from the star’s direction the Earth’s orbit is a circle seen at a slant. Its width across the line of sight is the full 2 AU, but its depth is foreshortened by sin β. Only a star exactly in the plane of the Earth’s orbit (β = 0) swings back and forth along a line, which is the usual textbook sketch; a star at the ecliptic pole (β = 90°) traces a circle.</p>
    <p>On top of that the star itself moves through space: a steady drift across the sky, its <b>proper motion</b> μ. Ellipse plus drift gives the looping, wavy track.</p>
    <h4>Reading the sliders as physics</h4>
    <p><i>a</i> is the parallax <i>p</i>; <i>b</i> is p · sin β (so b ÷ a tells you β: check it against the star’s ecliptic latitude); <i>P</i> is one year; θ is the direction of the ecliptic at the star on your graph; (v<sub>x</sub>, v<sub>y</sub>) is the proper motion, of size μ = √(v<sub>x</sub>² + v<sub>y</sub>²). Then distance in parsecs = 1 ÷ (p in arcseconds). Points a whole year apart sit at the same place on the ellipse, so the line between them is pure drift.</p>
    <p>See the <a href="../stellar-parallax/" target="_blank" rel="noopener">Stellar Parallax sim</a> for the geometry of p and d.</p>`,
};

let raf = 0;
/** Open the panel over the notebook `root`. vars = {x, y, t}: the student's names for the plotted columns. */
export function openAbout(root, id, vars) {
  const M = MODEL[id]; if (!M) return;
  closeAbout(root);
  const box = document.createElement('div'); box.className = 'nb-about';
  box.innerHTML = `<div class="nb-about-in"><h3>About this model: ${M.name}<button class="nb-x" data-close aria-label="Close">&times;</button></h3>
    <div class="nb-eq">${M.eq({ x: vars.x, y: vars.y, t: vars.t })}</div>
    <table class="nb-units">${M.params.map((p) => `<tr><td><b>${p.sym}</b></td><td>${p.label}</td></tr>`).join('')}</table>
    <div class="nb-diagram"><canvas width="10" height="10" aria-label="Live diagram"></canvas><div class="nb-dctl"></div></div>
    ${TEXT[id]({ x: `<i>${vars.x}</i>`, y: `<i>${vars.y}</i>`, t: `<i>${vars.t}</i>` })}
    <p class="nb-hint">The sliders do not fit for you, and the notebook does not tell you the answer: a good fit is one where the residuals are small and scattered evenly above and below zero.</p></div>`;
  root.appendChild(box);
  box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('[data-close]')) closeAbout(root); });
  box.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAbout(root); e.stopPropagation(); } });
  box.tabIndex = -1; box.focus();
  diagram(id, box.querySelector('canvas'), box.querySelector('.nb-dctl'));
}
export function closeAbout(root) { cancelAnimationFrame(raf); const b = root.querySelector('.nb-about'); if (b) b.remove(); }

function slider(ctl, label, min, max, value, unit = '') {
  const w = document.createElement('label'); w.className = 'nb-dslider';
  w.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${(max - min) / 200}" value="${value}"><output>${value}${unit}</output>`;
  ctl.appendChild(w);
  const inp = w.querySelector('input'), out = w.querySelector('output');
  inp.addEventListener('input', () => { out.textContent = (+inp.value).toFixed(max - min > 20 ? 0 : 2) + unit; });
  return () => +inp.value;
}
function check(ctl, label, on) {
  const w = document.createElement('label'); w.className = 'nb-check'; w.innerHTML = `<input type="checkbox"${on ? ' checked' : ''}> ${label}`; ctl.appendChild(w);
  return () => w.querySelector('input').checked;
}
function diagram(id, canvas, ctl) {
  const wrap = canvas.parentElement, dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(280, Math.min(640, wrap.clientWidth || 480)), H = id === 'ellipse' ? Math.round(W * 0.5) : Math.round(W * 0.42);
  canvas.width = W * dpr; canvas.height = H * dpr; canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const c = canvas.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const text = (s, x, y, col = MUTED, align = 'center', size = 11.5) => { c.fillStyle = col; c.font = `400 ${size}px 'Source Sans 3', system-ui, sans-serif`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(s, x, y); };
  const dot = (x, y, r, col) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); };
  const line = (x0, y0, x1, y1, col, w = 1, dash = []) => { c.strokeStyle = col; c.lineWidth = w; c.setLineDash(dash); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.setLineDash([]); };
  let get = {}, draw;
  if (id === 'ellipse') {
    get.beta = slider(ctl, 'Ecliptic latitude of the star, β', 0, 90, 30, '°');
    get.drift = check(ctl, 'Add a steady drift (proper motion)', false);
    draw = (ph) => {
      const beta = get.beta() * DEG, sb = Math.sin(beta), half = W / 2;
      // left: the Earth's orbit, drawn as seen from the star's direction (a circle foreshortened by sin beta)
      const cx = half / 2, cy = H * 0.54, R = Math.min(half * 0.36, H * 0.34);
      text('The Earth’s orbit as seen from the star', cx, 13, INK, 'center', 12);
      c.strokeStyle = GRID; c.lineWidth = 1.2; c.beginPath(); c.ellipse(cx, cy, R, Math.max(R * sb, 0.6), 0, 0, TAU); c.stroke();
      dot(cx, cy, 5, GOLD); text('Sun', cx, cy + 13);
      const ex = cx + R * Math.cos(ph), ey = cy + R * sb * Math.sin(ph);
      dot(ex, ey, 4, BLUE); text('Earth', ex, ey - 11, BLUE);
      line(cx - R, cy + R * Math.max(sb, 0.12) + 22, cx + R, cy + R * Math.max(sb, 0.12) + 22, MUTED); text('full width: 2 AU', cx, cy + R * Math.max(sb, 0.12) + 33);
      if (sb > 0.12) { line(cx + R + 14, cy - R * sb, cx + R + 14, cy + R * sb, MUTED); c.save(); c.translate(cx + R + 26, cy); c.rotate(-Math.PI / 2); text('depth × sin β', 0, 0); c.restore(); }
      // right: the star's apparent path on the sky: the same shape, turned half a turn (it is displaced opposite to the Earth)
      const sx = half + half / 2, sy = cy, a = R;
      text('The star’s path against the background', sx, 13, INK, 'center', 12);
      line(sx - a - 16, sy, sx + a + 16, sy, GRID); line(sx, sy - a - 6, sx, sy + a + 6, GRID);
      text('along the ecliptic', sx + a - 4, sy + a * Math.max(sb, 0.3) + 24, MUTED, 'right'); c.save(); c.translate(sx - a - 24, sy); c.rotate(-Math.PI / 2); text('toward the ecliptic pole', 0, 0); c.restore();
      const drift = get.drift(), n = 240, turns = drift ? 2.2 : 1, vx = drift ? a * 0.85 : 0, vy = drift ? -a * 0.28 : 0;
      const pos = (q) => { const k = (q - ph) / TAU; return [sx - a * Math.cos(q) + vx * (k + (drift ? 0.9 : 0)) * 0.5, sy - a * sb * Math.sin(q) + vy * (k + (drift ? 0.9 : 0)) * 0.5]; };
      c.strokeStyle = ORANGE; c.lineWidth = 2; c.beginPath();
      for (let i = 0; i <= n; i++) { const q = ph - turns * TAU * (1 - i / n); const [x, y] = pos(q); if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
      const [px, py] = pos(ph); dot(px, py, 4.5, '#fff');
      if (!drift) {
        line(sx, sy, sx + a, sy, INK, 1.5); text('p', sx + a / 2, sy - 9, INK, 'center', 13);
        if (sb > 0.1) { line(sx, sy, sx, sy - a * sb, INK, 1.5); text('p · sin β', sx + 6, sy - a * sb / 2, INK, 'left', 13); }
      }
      text(get.beta() < 2 ? 'β = 0: a line (the textbook sketch)' : get.beta() > 88 ? 'β = 90°: a circle' : `short axis = ${sb.toFixed(2)} × long axis`, sx, H - 10, GOLD, 'center', 12);
    };
  } else if (id === 'sine' || id === 'sineline' || id === 'tilt') {
    if (id === 'tilt') get.tilt = slider(ctl, 'Tilt of the orbit toward us', 0, 90, 20, '°');
    if (id === 'sineline') get.slope = slider(ctl, 'Slope of the line', -1, 1, 0.4);
    draw = (ph) => {
      const cx = W * 0.2, cy = H * 0.52, R = Math.min(W * 0.14, H * 0.36), gx0 = W * 0.42, gx1 = W - 14, st = id === 'tilt' ? Math.sin(get.tilt() * DEG) : 0, m = id === 'sineline' ? get.slope() : 0;
      text(id === 'tilt' ? 'The orbit as we see it' : 'Round a circle at a steady rate', cx, 13, INK, 'center', 12);
      c.strokeStyle = GRID; c.lineWidth = 1.2; c.beginPath(); if (id === 'tilt') c.ellipse(cx, cy, R, Math.max(R * st, 0.6), 0, 0, TAU); else c.arc(cx, cy, R, 0, TAU); c.stroke();
      const bx = id === 'tilt' ? cx + R * Math.sin(ph) : cx + R * Math.cos(ph), by = id === 'tilt' ? cy + R * st * Math.cos(ph) : cy - R * Math.sin(ph);
      dot(cx, cy, 5, GOLD); dot(bx, by, 4, BLUE);
      if (id === 'tilt') line(cx, cy, bx, by, INK, 1.5); else { line(bx, by, gx0, by, GRID, 1, [3, 3]); line(cx, cy, bx, by, MUTED); }
      text(id === 'tilt' ? 'What you measure: the separation' : 'Seen from the side: a sine wave', (gx0 + gx1) / 2, 13, INK, 'center', 12);
      line(gx0, cy, gx1, cy, GRID); line(gx0, cy - R - 6, gx0, cy + R + 6, GRID);
      const f = (q) => (id === 'tilt' ? Math.hypot(Math.sin(q), st * Math.cos(q)) * R : Math.sin(q) * R) ;
      c.strokeStyle = ORANGE; c.lineWidth = 2; c.beginPath();
      const n = 200, span = 2.2 * TAU;
      for (let i = 0; i <= n; i++) { const q = ph - span * (1 - i / n), x = gx0 + (gx1 - gx0) * i / n, y = cy - f(q) - m * R * (i / n - 0.5) * 2; if (i) c.lineTo(x, y); else c.moveTo(x, y); }
      c.stroke();
      dot(gx1, cy - f(ph) - m * R, 4.5, '#fff');
      if (id !== 'tilt') { line(gx0 + 8, cy, gx0 + 8, cy - R, INK, 1.5); text('A', gx0 + 17, cy - R / 2, INK, 'left', 13); } else text(st < 0.03 ? 'edge-on: touches zero' : `closest = ${st.toFixed(2)} × A`, (gx0 + gx1) / 2, H - 10, GOLD, 'center', 12);
    };
  } else {
    get.m = id === 'power' ? slider(ctl, 'Power n', -2, 3, 2) : id === 'quad' ? slider(ctl, 'Curvature c', -2, 2, 1) : slider(ctl, 'Slope m', -2, 2, 0.8);
    draw = () => {
      const m = get.m(), panels = id === 'power' ? [[40, 'ordinary axes', false], [W / 2 + 30, 'log–log axes: slope = n', true]] : [[44, '', false]];
      for (const [x0, ttl, log] of panels) {
        const y0 = H - 22, w = (id === 'power' ? W / 2 : W) - 64, hh = H - 50;
        line(x0, y0, x0 + w, y0, GRID); line(x0, y0, x0, y0 - hh, GRID);
        c.save(); c.beginPath(); c.rect(x0, y0 - hh, w, hh); c.clip();
        c.strokeStyle = ORANGE; c.lineWidth = 2; c.beginPath();
        for (let i = 1; i <= 120; i++) {
          const u = i / 120; let v;
          if (id === 'power') { const x = log ? Math.pow(10, -1 + 2 * u) : 0.05 + 2 * u, y = Math.pow(x, m); v = log ? (Math.log10(y) + 2.2) / 4.4 : y / 4; }
          else if (id === 'quad') v = 0.45 + 0.1 * (2 * u - 1) + m * 0.4 * (2 * u - 1) ** 2 * 0.5;
          else v = (id === 'line' ? 0.5 : m < 0 ? 1 : 0) + m * u * (id === 'line' ? 0.4 : 0.5);
          const X = x0 + u * w, Y = y0 - v * hh; if (i > 1) c.lineTo(X, Y); else c.moveTo(X, Y);
        }
        c.stroke(); c.restore();
        if (ttl) text(ttl, x0 + w / 2, 12, INK, 'center', 12);
      }
      if (id !== 'power') text(id === 'quad' ? `c = ${m.toFixed(2)}: ${m > 0.02 ? 'bends upward' : m < -0.02 ? 'bends downward' : 'no bend: a straight line'}` : id === 'line' ? `slope ${m.toFixed(2)}: rise ÷ run` : `slope ${m.toFixed(2)}: through the origin`, W / 2, 12, INK, 'center', 12);
      else text(`n = ${m.toFixed(2)}`, W / 2, H - 8, GOLD, 'center', 12);
    };
  }
  let t0 = performance.now();
  const loop = (now) => { c.clearRect(0, 0, W, H); draw(still ? 1.1 : (now - t0) / 1000 * 0.9); if (canvas.isConnected) raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
}
