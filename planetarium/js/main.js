// main.js: start-up. Loads the catalogues, then wires the modules together.

import './focus.js';           // first: its key listener must run before everyone else's
import { A } from './astro.js';
import { state, load, on, emit } from './state.js';
import { loadCore, stars, dso, constellations } from './catalog.js';
import { cam } from './camera.js';
import { initRenderer, perf, addOverlay } from './renderer.js';
import { initInput } from './input.js';
import { initUI } from './ui.js';
import { initInfo } from './info.js';
import { initSearch } from './search.js';
import { getFrame } from './skyframe.js';
import { getBodies } from './ephem.js';
import { allPicks } from './picks.js';
import { setLabelInset } from './render/grids.js';
import { initMeasure, drawMeasures, measureClick } from './measure.js';
import { initExtras, extrasClick } from './extras.js';
import { ensure as ensureEphem } from './jpl.js';
import { loadSmallBodies } from './moons.js';
import { globesWork } from './render/globe.js';
import { initDiag } from './diag.js';
import { initSteady } from './steady.js';
import { initLabsSuite } from './labs/index.js';
import { initDeepStars, deep } from './deepstars.js';
import { fieldAdjust } from './render/density.js';

async function start() {
  const loading = document.getElementById('loading');
  if (!A) { loading.textContent = 'The ephemeris library did not load. Check the connection and reload.'; loading.classList.add('err'); return; }
  load();
  try {
    // the planets' positions for the date on the clock (and for a date in the address) come with the first picture
    const t = Date.parse(new URLSearchParams(location.search).get('t') || '');
    await Promise.all([loadCore(), ensureEphem((t || state.timeMs) / 86400000 - 10957.5)]);
  } catch (e) {
    console.error(e);
    loading.textContent = 'Could not load the star catalogue (' + e.message + '). Reload to try again.';
    loading.classList.add('err');
    return;
  }
  loadSmallBodies();            // asteroids, dwarf planets, Phoebe, Halley: the app runs without them
  initDeepStars();              // faint stars (Gaia DR3): manifest and count map now, tiles on demand; the app runs without them
  const canvas = document.getElementById('sky');
  const search = initSearch(document.getElementById('search'));
  initInfo(document.getElementById('infoPanel'));
  initUI({ search });
  initMeasure(canvas, document.getElementById('measurePanel'));
  addOverlay(drawMeasures);
  initInput(canvas, { onClickSky: (x, y, ref) => extrasClick(x, y, ref) || measureClick(x, y, ref) });
  // keep grid labels clear of the top bar and the bottom bar
  const bar = document.querySelector('.bottombar');
  const inset = () => {
    const h = bar.offsetHeight;
    document.documentElement.style.setProperty('--bar-h', h + 'px');      // panels sit just above the bar, however it wraps
    setLabelInset(4, 50, 4, h + 4);
  };
  inset(); new ResizeObserver(inset).observe(bar);
  initRenderer(canvas);
  loading.classList.add('done');
  setTimeout(() => loading.remove(), 600);
  // handle for the console and for automated checks
  window.planetarium = { state, cam, perf, stars, deep, dso, constellations, getFrame, getBodies, allPicks, emit, A, fieldAdjust };
  initExtras({ canvas });       // teaching panels, pointer read-out, right-click menu, Milky Way, night mode (js/extras.js)
  initSteady();
  initDiag(canvas);
  setTimeout(() => globesWork(), 400);      // compile the shader before it is needed, not at the first moonrise (0.1 - 0.7 s)
  initLabsSuite();              // measuring tools, labs menu, URL parameters (js/labs/index.js)
}
start();
