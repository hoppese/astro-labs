// about.js: text of the Info and Credits dialogs.

const K = (label, keys) => `<div><span>${label}</span><span>${keys.map((k) => `<kbd>${k}</kbd>`).join(' ')}</span></div>`;

export const INFO_HTML = `
<p>The sky as seen from any place on Earth at any date and time. Drag to look around, scroll (or pinch) to zoom,
click anything for its details. Zooming in shows fainter stars, the discs and phases of the planets, Jupiter's
and Saturn's moons and Saturn's rings.</p>

<h3>Mouse and touch</h3>
<ul>
  <li><b>Drag</b> to pan. <b>Scroll</b>, two-finger scroll or <b>pinch</b> to zoom about the pointer.</li>
  <li><b>Click</b> an object to select it; <b>double-click</b> to centre it. <b>Track</b> keeps it centred while time runs.</li>
  <li>The bottom bar has the display toggles, the time controls and the clock (click it to set a date and time).</li>
  <li><b>Move the mouse</b> over the sky to read the right ascension, declination, altitude, azimuth and constellation under it (bottom of the sky; Settings can move it to the pointer or turn it off).</li>
  <li><b>Right-click</b> (or press and hold on a touch screen) for a menu: centre, track, zoom, measure an angle from there, mark, copy coordinates, and for galaxies “add to the Hubble table”.</li>
</ul>

<h3>Keyboard</h3>
<div class="keys">
  ${K('Search', ['/', 'F3'])}
  ${K('Pan', ['←', '↑', '↓', '→'])}
  ${K('Zoom in / out', ['+', '−'])}
  ${K('Centre the selection', ['Space'])}
  ${K('Track the selection', ['T'])}
  ${K('Deselect / close panels', ['Esc'])}
  ${K('Slower · real time · faster', ['J', 'K', 'L'])}
  ${K('Pause / resume', ['7'])}
  ${K('Now', ['8'])}
  ${K('Back / forward one day', ['[', ']'])}
  ${K('Back / forward one sidereal day', ['{', '}'])}
  ${K('Back / forward one hour', ['<', '>'])}
  ${K('Back / forward one second', ['Shift ←', 'Shift →'])}
  ${K('Back / forward one minute', ['Shift ↓', 'Shift ↑'])}
  ${K('Mark the time (stopwatch)', ['X'])}
  ${K('Measure an angle', ['R'])}
  ${K('Constellation lines', ['C'])}
  ${K('Constellation names', ['V'])}
  ${K('Constellation boundaries', ['B'])}
  ${K('Star names', ['S'])}
  ${K('Planet names', ['P'])}
  ${K('Deep-sky objects', ['D'])}
  ${K('Equatorial grid', ['E'])}
  ${K('Alt-az grid', ['Z'])}
  ${K('Meridian · equator · ecliptic', [';', '.', ','])}
  ${K('Atmosphere', ['A'])}
  ${K('Refraction', ['F'])}
  ${K('Ground', ['G'])}
  ${K('Cardinal points', ['Q'])}
  ${K('Alt-az / equatorial mount', ['M'])}
  ${K('Milky Way', ['W'])}
  ${K('Night mode (red)', ['N'])}
  ${K('Deep-sky list', ['O'])}
  ${K('Hubble’s-law lab', ['H'])}
  ${K('Save a screenshot', ['Ctrl S'])}
</div>

<h3>What is exact and what is approximate</h3>
<ul>
  <li><b>Sun, Moon, planets, Jupiter's four big moons:</b> computed with the astronomy-engine library, accurate to about an arcminute or better. Positions are topocentric (as seen from your site), with precession, nutation, aberration and, when the atmosphere is on, refraction.</li>
  <li><b>Stars:</b> catalogue positions with proper motion, annual aberration and annual parallax (from the catalogue distance) applied; each can be switched off under Labs → Corrections. The orbital motion of double stars is ignored.</li>
  <li><b>Labs and measuring tools</b> (the Labs button): a stopwatch, an events finder, a second observer, object paths, the outline of the Earth's shadow, and presets for classic measurements. The Earth's shadow uses the same model as eclipse predictions (Earth's radius enlarged by 1.4% for the atmosphere). Moons of Jupiter and Saturn fade as they enter the planet's shadow and vanish behind its flattened disc. With refraction on, the Sun and Moon are still drawn as true circles, so time limb contacts near the horizon with refraction off.</li>
  <li><b>Saturn's rings:</b> tilt and orientation come from Saturn's real pole direction, so they open and close correctly over the years.</li>
  <li><b>Saturn's moons:</b> not in the ephemeris library. Each orbit is anchored to the moon's position on 24 November 2026 from NASA/JPL Horizons and advanced at its published mean rate. Checked against Horizons nine years either side they stay within about 1° of orbital longitude (roughly 1″ on the sky); Mimas, which librates, can be 10° or more out. They are <i>approximate</i>: fine for seeing which side of the planet a moon is on, not for timing events.</li>
  <li><b>Atmosphere:</b> sky colour, twilight, extinction and the limiting magnitude are a visual model tuned to look plausible, not a measurement. The light-pollution slider follows the Bortle scale.</li>
  <li><b>Moon and planet discs</b> are drawn to scale with the correct phase and orientation of the lit limb, but without surface detail. When the Moon or Sun would be smaller than a few pixels they are drawn slightly enlarged so the phase stays visible.</li>
  <li><b>Deep-sky objects:</b> every magnitude, size, redshift and radial velocity is read from the OpenNGC catalogue. Where the catalogue has no value the panel says “no data”.</li>
</ul>
<h3>Teaching tools</h3>
<ul>
  <li><b>Deep-sky list</b> (top right, or the menu): Messier, Caldwell and NGC/IC objects by type, magnitude, constellation and whether they are up now. Click a row to go there.</li>
  <li><b>Hubble’s-law lab:</b> galaxies with catalogue redshifts; tick some, enter distances, read the slope. The catalogue has no distances and the app invents none.</li>
  <li><b>Sky quiz:</b> find a constellation, name a highlighted one, or find a bright star.</li>
  <li><b>How many stars:</b> the faintest star drawn is set so the screen holds about the same number of stars per square centimetre at any zoom, never fainter than the sky allows (light pollution, Moon, twilight). Zooming in goes deeper, like a telescope, until the catalogue runs out near magnitude 9.</li>
</ul>
<p style="color:#9fb0bf">This is a beta. Please use <b>Submit bug</b> in the menu if something looks wrong.</p>`;

export const CREDITS_HTML = `
<table class="cred">
  <tr><td>Ephemerides</td><td><a href="https://github.com/cosinekitty/astronomy" target="_blank" rel="noopener">astronomy-engine</a> 2.1.19 by Don Cross. MIT licence. Sun, Moon, planets, Jupiter's moons, rise and set, sidereal time, constellations of a point.</td></tr>
  <tr><td>Stars</td><td><a href="https://github.com/astronexus/HYG-Database" target="_blank" rel="noopener">HYG database</a> v4.1 by David Nash (Hipparcos, Yale Bright Star and Gliese catalogues combined). CC BY-SA 4.0. Converted to binary magnitude tiers; no values changed.</td></tr>
  <tr><td>Constellations</td><td>Lines, names and IAU boundaries from <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener">d3-celestial</a> by Olaf Frohn. BSD 3-Clause licence.</td></tr>
  <tr><td>Deep sky</td><td><a href="https://github.com/mattiaverga/OpenNGC" target="_blank" rel="noopener">OpenNGC</a> by Mattia Verga. CC BY-SA 4.0. Messier, Caldwell, named and bright NGC/IC objects, with catalogue magnitudes, sizes, redshifts and radial velocities. Caldwell numbers cross-referenced from Patrick Moore's list.</td></tr>
  <tr><td>Saturn's moons</td><td>Orbits fitted to state vectors from NASA/JPL <a href="https://ssd.jpl.nasa.gov/horizons/" target="_blank" rel="noopener">Horizons</a> (SAT441), with periods from JPL's <a href="https://ssd.jpl.nasa.gov/sats/elem/" target="_blank" rel="noopener">Planetary Satellite Mean Elements</a>. Public domain.</td></tr>
  <tr><td>Fonts</td><td>Source Sans 3 and Source Serif 4 (Adobe) and JetBrains Mono, SIL Open Font Licence, served by Google Fonts.</td></tr>
  <tr><td>Milky Way</td><td>Outline polygons from <a href="https://github.com/ofrohn/d3-celestial" target="_blank" rel="noopener">d3-celestial</a> (<code>mw.json</code>) by Olaf Frohn, BSD 3-Clause licence, baked into a small brightness map. It shows where the band lies and roughly how bright it is; it is not photometry.</td></tr>
  <tr><td>Inspiration</td><td>The layout and keyboard shortcuts follow <a href="https://stellarium.org" target="_blank" rel="noopener">Stellarium</a> and Stellarium Web. No Stellarium code or data is used.</td></tr>
</table>
<p style="color:#9fb0bf;margin-top:12px">The processed data files in this app that derive from HYG and OpenNGC are shared under the same CC BY-SA 4.0 licence. Conversion scripts are in the <code>tools/</code> folder of the source.</p>`;
