# Planetarium (beta): working notes

A Stellarium-inspired web planetarium for astro-labs. Static files, no build step, ES modules.
Spec: the lead's `SPEC.md` (Tiers 1-3) and `SPEC-LABS.md` (Tier 4, classic measurements). This file is the
hand-over: architecture, data provenance, what is done, what is left, known issues. Keep it current.

Last updated 2026-11-23: four sections, one per agent; the last ("Integration pass") is the most recent and overrides earlier statements about star limits and known issues.

## Run / test
- Served at `http://127.0.0.1:8111/planetarium/` (repo root is served). Relative URLs only, so it also
  works under the GitHub Pages subpath and from an iframe.
- `node tools/check.mjs` runs the correctness checks against the same modules the page loads
  (it loads `vendor/astronomy.browser.min.js` into `globalThis.Astronomy` and serves `fetch()` from disk).
- `node tools/fit_saturn_moons.mjs` re-derives the Saturn-moon table and prints its error vs JPL Horizons.
- `tools/frame-test.html?sizes=390x700,700x400` shows the app in same-origin iframes (phone / embed sizes)
  so layouts can be tested without resizing the browser window.
- `window.planetarium` exposes `{state, cam, perf, stars, dso, constellations, getFrame, getBodies, emit, A}`
  for the console and automated checks. E.g. `planetarium.state.timeMs = Date.UTC(2024,3,8,19,9,55); planetarium.emit('time')`.
- **Module caching while developing:** the dev server sends no Cache-Control, so Chrome may serve stale
  modules after an edit (`?v=N` only busts index.html). Before reloading run in the page:
  `await Promise.all([...files].map(f => fetch(f, {cache: 'reload'})))` then `location.reload()`.
  On GitHub Pages (max-age 10 min) a deploy can briefly mix old and new modules; if that ever matters,
  add a version query to the `main.js` script tag and to imports, or bundle.

## Architecture (js/)
State and time
- `state.js`      the one shared `state` object (timeMs, rate, playing, loc, mount, bortle, show.*, lightTime,
                  selected, tracking), `on/emit` event bus, `toggle/set`, localStorage persistence (settings only).
                  Events: time, tick (clock running), rate, loc, show, mount, bortle, lightTime, selection,
                  catalog, measure, frame (after each draw), render. Every event except frame/tick/render
                  also requests a redraw.
- `clock.js`      simulation clock (rate ladder ±1…±1e6, pause, now, step). Range −3000…+3000.
- `timeutil.js`   wall-clock <-> UTC ms in an IANA zone or fixed "UTC+h" zone, exact to the second (old
                  dates fall on local mean time, e.g. UTC−5:39:30); labels.
- `skyframe.js`   `makeFrame(timeMs, loc)` -> everything that depends only on instant+site: AstroTime,
                  Observer, rotation matrices EQJ<->EQD<->HOR (from astronomy-engine, so precession and
                  nutation are rigorous), aberration vector, sidereal time. `getFrame()` caches it for `state`.
                  Pure function of (time, place): a second observer is just another `makeFrame` call.
- `ephem.js`      `compute(frame, lightTime)` -> Sun, Moon, planets, Galilean moons, Saturn's moons:
                  topocentric vectors (seen = light-time + aberration; geo = geometric), distance, magnitude,
                  phase, angular radius, light time, pole direction / ring tilt. Also pure; `getBodies(frame)` caches.
- `catalog.js`    loads data/: star tiers (typed arrays, proper motion applied for the current epoch),
                  constellations (boundaries densified along B1875 RA/Dec lines), DSOs, cities.
- `objects.js`    object references `{kind:'star',k,i} | {kind:'body',id} | {kind:'dso',idx} | {kind:'con',id}`
                  and "where is it now" helpers.
View
- `camera.js`     stereographic projection, alt-az / equatorial mount, project/unproject, grab-pan
                  (`bringUnder`), zoom about a point, mount switch. `cam.fov` is the VERTICAL field (0.0005°–180°).
- `nav.js`        animated fly-to, tracking, selection (`select`, `centerOn`, `toggleTracking`).
- `input.js`      pointer (mouse/touch/pinch), wheel, keyboard pan/zoom; click -> `picks.js`.
- `picks.js`      every drawn object registers its screen position each frame; clicks resolve against that.
- `renderer.js`   owns the canvas (Canvas 2D, DPR-aware), frame loop, draw order:
                  sky background -> grids -> constellations -> stars -> DSOs -> bodies -> ground ->
                  selection marker -> overlays (`addOverlay(fn)`: measure tool; use this for quiz, shadow,
                  trails…) -> labels.
- `render/proj.js`   per-frame context `R` + projection helpers (refraction, great-arc subdivision).
- `render/sky.js`    limiting magnitude model (Bortle, zoom, twilight, moonlight, eclipse dimming) and the
                     low-resolution sky-colour image. A visual model, not physics.
- `render/stars.js`  hot loop (typed arrays, no allocation), B−V colour sprites, labels.
- `render/grids.js`  alt-az + equatorial grids with adaptive spacing and edge labels; meridian, equator, ecliptic.
- `render/constellations.js`, `render/dso.js`, `render/planets.js` (phase discs, Saturn's rings, Jupiter's
  belts, moons, transit dot, eclipse), `render/ground.js` (horizon as an exact circle), `render/labels.js`
  (priority-based, non-overlapping, haloed).
UI
- `ui.js` (toolbar, time bar + date editor, settings drawer incl. location, menu/modals, shortcuts, read-out),
  `info.js` (object panel), `search.js` (index + box + brightest-stars list), `measure.js` (angle tool),
  `icons.js`, `about.js` (Info and Credits text).

Frames: EQJ (J2000 equatorial), EQD (equator of date), HOR (x north, y WEST, z up: astronomy-engine's
convention; azimuth = atan2(−y, x)). Everything is unit vectors `[x,y,z]`; 3×3 matrices are flat row-major.
Pipeline for a catalogue star: J2000 vector (+ proper motion) + aberration -> `Mjh` -> HOR -> refraction ->
view matrix -> stereographic. Bodies: astronomy-engine `Equator(body, time, observer, ofdate=false, aberration=true)`
vector, then the same matrices. Result agrees with astronomy-engine's own `Horizon()` to < 1″ (see checks).

## How the Tier 4 (labs) requirements are handled in the core
1. **Topocentric:** all solar-system vectors are observer-centred (`A.Equator(..., observer, ...)`; the Moon is
   `GeoMoon − ObserverVector`, with its 1.3 s light time applied). Angular sizes in the info panel use the
   topocentric distance. Moon from Richmond vs Cape Town differs by 1.64° at the test instant.
   **Refraction is its own switch** (`state.show.refraction`, key F, drawer checkbox), independent of
   `atmosphere` (glow, daylight, extinction, light pollution).
2. **Time:** held as UTC ms, shown to the second, editable (year / month / day number fields + time with
   seconds), steps ±1 s, min, h, day, sidereal day, week, month, year. Years −3000…+3000; dates before
   1582-10-15 are proleptic Gregorian and the editor says so (year 0 = 1 BC). Not done: synodic-month step,
   stopwatch / "mark time".
3. **Zoom:** down to 0.0005° (1.8″) vertical field. A planet in front of the Sun is drawn as a black dot of
   its true size (min 0.9 px). CAVEAT: when the Sun or Moon would be under 5 px radius it is drawn enlarged
   to 5 px so the phase shows; limb/contact timings must be done zoomed in (disc > 10 px), where it is to scale.
4. **Plain state:** observer = `state.loc {name, region, lat, lon, elev, tz}`, clock = `state.timeMs/rate/playing`.
   `makeFrame` and `ephem.compute` take them as arguments, so a second observer / compare view / URL presets
   need no refactoring. URL parameters are NOT read yet.
5. **Of date:** `Rotation_EQJ_EQD` (precession + nutation) drives RA/Dec of date and the equatorial grid.
   Thuban is 0.56° from the pole in −2700; Polaris 0.63° in 2026.

## Data (data/) and provenance
Raw downloads are NOT in the repo. Re-create with the scripts in `tools/` (each takes the raw dir and `data/`).
| File | Source | Licence | Script |
|---|---|---|---|
| `stars-0…4.bin`, `stars.json`, `starnames.json` | HYG database v4.1, github.com/astronexus/HYG-Database `hyg/CURRENT/hygdata_v41.csv` | CC BY-SA 4.0 | `build_stars.py` |
| `constellations.json` | d3-celestial `data/constellations.json`, `.lines.json`, `.bounds.json` (github.com/ofrohn/d3-celestial) | BSD-3-Clause | `build_constellations.py` |
| `dso.json`, `dso-deep.json` | OpenNGC `database_files/NGC.csv` + `addendum.csv` (github.com/mattiaverga/OpenNGC) | CC BY-SA 4.0 | `build_dso.py` |
| `cities.json` | hand-entered (130 places: name, region, lat, lon, IANA zone) | facts | `build_cities.py` |
| `vendor/astronomy.browser.min.js` | astronomy-engine 2.1.19, npm tarball `astronomy.browser.min.js` | MIT (`vendor/astronomy-engine.LICENSE`) | copied unchanged |
| Saturn-moon table in `js/ephem.js` | JPL Horizons state vectors (SAT441) + JPL "Planetary Satellite Mean Elements" periods | public domain | `fit_saturn_moons.mjs` |

- Stars: Float32, 9 fields/star (ra, dec, mag, bv, hip, hd, dist pc, pmra, pmdec), sorted by magnitude.
  Tiers: ≤6.5 (8,920 stars, 321 kB, loaded at start), ≤7.5 (16,871), ≤8.5 (36,025), ≤9.5 (37,233), rest (20,574);
  deeper tiers load when the limiting magnitude needs them. HYG is complete to about mag 9; the read-out says so.
  Names only for tier 0 (358 proper, 1,517 Bayer, 2,495 Flamsteed).
- DSOs: `dso.json` = all Messier (109; OpenNGC assigns nothing to M102), all 109 Caldwell (cross-reference is
  Patrick Moore's list, typed into `build_dso.py`, checked against Wikipedia), every named object, everything
  ≤ mag 10.5: 771 rows, 643 with redshift. `dso-deep.json` (4,125 rows; ≤ mag 12.5 plus galaxies with z ≤ mag 14)
  loads on demand (zoom < 25° or an NGC/IC search miss). **Every number is OpenNGC's; missing stays null and the
  UI prints "no data". No distances are in OpenNGC.**
- Initial load ≈ 0.85 MB uncompressed (JS+CSS ≈ 190 kB, astronomy-engine 116 kB, data ≈ 530 kB). `data/` is 4.8 MB in all.
- Not used yet: d3-celestial `mw.json` (Milky Way outlines, BSD-3) for item 16.

## Status by feature number
Tier 1
1. Sky for any time/place: DONE. Default Richmond IN, now. City search (130), lat/long entry (zone from the
   nearest city within 1.5° else whole-hour from longitude), "Use my location" (only on click; browser zone).
   Time bar: slower/pause/faster/now, rate label, clock; date editor with steps.
2. Navigation: DONE. Drag (grab), wheel / two-finger scroll / ctrl-wheel pinch / touch pinch about the pointer,
   arrows, +/−, double-click centres. FOV + limiting-magnitude read-out. Touch tested only with synthetic
   pointer events (drag and pinch work); not on a real phone.
3. Mounts: DONE (M, toolbar, drawer). Equatorial holds RA/Dec, so the horizon turns.
4. Grids: DONE. Alt-az, equatorial (of date), meridian, equator, ecliptic (mean J2000), horizon, cardinals.
5. Ground, atmosphere, light pollution: DONE. Bortle 1-9 slider + 4 presets. Refraction separate.
6. Star names (density by magnitude and zoom: proper -> Bayer -> Flamsteed -> HIP), constellation lines /
   names / boundaries: DONE.
7. Sun, Moon (phase, limb orientation, to scale when zoomed), planets: DONE. Solar eclipses darken the sky.
   No lunar surface detail, no earthshine model beyond a dark disc, no Earth-shadow (lunar eclipses do nothing yet).
Tier 2
8. Info panel + Center (Space) + Track (T) + Zoom to: DONE. Rise/transit/set via astronomy-engine.
9. Search (/ or F3): DONE. Stars (proper, Bayer incl. "alpha lyr"/"alpha lyrae", Flamsteed, HIP, HD),
   bodies, moons, constellations, M / NGC / IC / Caldwell / common names; empty box = solar system +
   30 brightest stars with up/down markers.
10. Jupiter's moons (astronomy-engine; near/far side, hidden behind the disc), Saturn's rings (real pole) and
    7 moons, flattened discs, phases: DONE. Not done: eclipses of moons by the planet's SHADOW (needed for the
    Rømer lab), moon shadows on Jupiter, ring shadow.
11. DSOs: symbols by type, labels, magnitude limit tied to zoom, deep list on demand: DONE.
    NOT done: a DSO list / filter panel.
12. Angular-distance tool (R): DONE. Snaps to objects, free points otherwise, great-circle arc, separation +
    position angle, keeps the last 12 until cleared. Not done: snapping to limbs, 0.1″ read-out mode.
13. Light-travel time toggle (drawer): DONE. Info panel shows light time and the seen-vs-geometric shift.
    Note for Seth: the shift is small (Sun 20.6″, Jupiter ~5-30″), not "where the Sun was 8 minutes ago
    along its daily path"; worth a sentence in any lab text.
Tier 3: NOT STARTED (14 Hubble lab, 15 quiz, 16 Milky Way / radiants / red mode / share URL / screenshot).
Tier 4 (labs): NOT STARTED beyond the core requirements above.

## Correctness numbers (tools/check.mjs, 2026-11-23)
- Polaris: mean altitude over a sidereal day 39.829° at latitude 39.830° (range 39.21–40.45).
- Sirius, Vega, Betelgeuse, Polaris, Capella at 2026-11-24 04:00 UTC: app vs `Horizon()` differ by 0.0″ in az and alt.
  Jupiter, Saturn, Mars 0.0″; Moon 0.7″ / 0.2″ (the app applies the Moon's 1.3 s light time, the library does not).
- Sunrise/sunset Richmond: 2026-06-21 06:11:36 / 21:11:14 EDT; 2026-12-21 07:57:27 / 17:18:00 EST. At that
  sunrise the app's refracted upper limb is +3.9′ (library uses a fixed 34′ horizon refraction, the app's
  formula gives 38′ there).
- Moon: full 2026-11-24 14:53 UTC -> elongation 179.99°, 99.81% lit; first quarter 2026-11-17 11:48 -> 50.13%.
- Eclipse 2024-04-08 at 39.83 N 84.89 W: Moon fully covers the Sun 19:07:58–19:11:50 UTC (library: 19:07:55–19:11:48),
  closest 15.4″ at 19:09:55.
- Jupiter's moons 2026-11-24 09:00 UTC, west -> east: Europa, Io, Callisto, Ganymede; offsets match an
  independent geocentric computation to 0.1″.
- Saturn's ring tilt: 2017-10-15 +26.97°, 2025-03-23 +0.02°, 2026-11-24 −6.15°, 2032-05-01 −26.93°.
- Dubhe–Merak 5.374°, Pollux–Castor 4.506°, Betelgeuse–Rigel 18.606°.
- Light time: Jupiter 35.2–52.4 min; Sun 8.21 min; Moon 1.19 s (at that date).
- Saturn's moons vs Horizons, 9 years either side of the 2026 anchor (degrees of orbital longitude):
  Enceladus 0.40/0.09, Tethys 0.72/1.25, Dione 0.07/0.34, Rhea 0.19/0.32, Titan 0.17/0.21, Iapetus 0.09/0.17,
  Mimas 4.1/13.9. (First attempt, propagating JPL's mean elements from J2000 directly, was ~157° out: the
  table's longitude origin is not what it appears. Do not go back to that.)
- Venus transit 2012 from Honolulu: contact I 22:10:40, IV 04:44:50 UTC (10 s sampling); Venus 57.8″.

## Performance (Chrome, 3840×1746 backing store, DPR 2)
JS per frame 2.4 ms (1,000 stars, FOV 90°, Bortle 4) to 7–10 ms (6,000 stars, grids, boundaries); frame
interval while panning 8.5–15 ms. The sky image must be drawn with `imageSmoothingQuality = 'low'`:
'high' cost ~20 ms a frame at this size.

## Known issues / weak spots
- Daytime ground is a flat olive; no landscape.
- DSO labels are busy in the Milky Way at wide fields (many genuinely bright NGC clusters).
- Grid labels can be dense at arcminute fields.
- At wide fields Sun and Moon are drawn enlarged (see above); two enlarged discs can look more eclipsed than they are.
- Moon magnitude loss, twilight curve, extinction 0.2 mag/air mass are eyeballed constants in `render/sky.js`.
- The ecliptic line is the mean ecliptic of J2000, not of date (matters for precession labs: fix before item 11 of Tier 4).
- Star positions ignore parallax; aberration is always on (no toggle yet; Bradley lab needs one).
- Old-date time zones use the tz database's local mean time; nothing warns that "EST" did not exist.
- Extension noise in the console ("Could not establish connection") is Chrome's, not the app's.
- Bug form: wired to the shared endpoint with `sim: 'planetarium'`; never submitted in testing.

## Next steps, in order
1. Item 11 list/filter panel; then Tier 3: Hubble lab (data is ready: `dso.rows[].z/rv/mag/maj/hubble`,
   call `loadDeepDso()`), quiz, Milky Way (`mw.json`), share-a-view URL (also needed for lab presets).
2. Tier 4 core tools: stopwatch / mark time, Earth's umbra + penumbra overlay, moon eclipses by Jupiter's
   shadow, event finder (astronomy-engine `Search*`), second observer, trails, limb snapping.

---

# Teaching features, interaction and polish (second build agent, 2026-11-23)

Everything here lives in NEW modules; shared files got small, marked edits (listed at the end).

## New modules
- `js/extras.js`     wiring: top-bar action buttons + menu entries (Deep-sky list O, Hubble lab H, Sky quiz, Night mode N,
                     Screenshot Ctrl/Cmd+S), Milky Way toolbar button + drawer checkbox (W), phone "More" sheet, tooltips for the
                     core buttons, first-run hint, load-error toasts. `initExtras({canvas})` and `extrasClick()` are called from main.js.
- `js/xui.js`        shared bits: `makePanel()` (right-docked panel; bottom sheet with a collapse grip at <= 560 px; one open at a
                     time), `toast()`, `addTip()`, `download()`, the extras' own localStorage (`astro-labs.planetarium.extras.v1`).
- `js/dsolist.js`    deep-sky browser (Messier / Caldwell / NGC-IC / All; type, constellation, magnitude, "above the horizon now",
                     name filter; sort by number, brightness, altitude, size). `goToDso(o)` selects + flies + warns if below the horizon.
- `js/hubble.js`     Hubble's-law lab (see below). Student table persists in `astro-labs.planetarium.hubble.v1`.
- `js/quiz.js`       sky quiz: Find it / Name it (four choices or typed, spelling-tolerant) / Find the star; sets Best-known (rank 1),
                     Zodiac, Northern, Southern, All 88; 20/40/80 brightest named stars; above-horizon-now or whole sky; lines shown/hidden.
                     While running: names + DSOs hidden, selection suppressed, clicks answer; settings restored at the end (also on pagehide).
                     Daylight -> atmosphere off for the quiz (says so); whole sky -> ground + atmosphere off; `state.starScale = 0.5` then.
- `js/milkyway.js`   Milky Way glow: samples `data/milkyway.bin` on an 8 px grid, added with 'lighter' right after the sky background.
                     Strength = smooth(4.7, 7.3, sky.base), so Bortle, moonlight and twilight dim it exactly as they dim faint stars.
- `js/cursor.js`     pointer read-out (RA/Dec J2000 or of date, Az/Alt, constellation from astronomy-engine's IAU boundaries). Docked at
                     the bottom centre by default; Settings > Pointer read-out: at the pointer / off. Precision follows the zoom; at a pole
                     the undefined angle (Az at the zenith, RA at the celestial pole) shows dashes. `skyAt(x, y)` is the reusable lookup.
- `js/ctxmenu.js`    right-click / long-press (550 ms) menu: Centre, Track, Zoom, More info, Measure angle from here, Mark, Clear marks,
                     Start/Stop trail (calls `labs/trails.js` `startTrail({body})`; Sun, Moon, planets only), Copy coordinates,
                     Show in Deep-sky list, Add to / Remove from Hubble table. Off during a quiz.
- `js/skymarks.js`   the reader's marks, and the highlighted constellation region (hovered one while boundaries are on; a selected
                     constellation's outline + figure). `strokeConstellation()` is reused by the quiz.
- `js/render/density.js`      star-count table N(<m) from the catalogue and `densityLimit(perCm2)`.
- `js/render/groundshade.js`  ground gradient (haze at the horizon, darker toward the feet, warm wash under a low Sun) as ~45 nested
                     exact circles; `clipToSky(ctx)` for overlays that must not draw on the ground.
- `css/extras.css`   all styles for the above + touch sizes + phone layout + night mode. Loaded after app.css.
- `tools/build_milkyway.py`  bakes d3-celestial `mw.json` -> `data/milkyway.bin` (720 x 120 bytes, galactic l x b in +-30 deg, 0.5 deg/px)
                     + `milkyway.json`. Pure Python, 3 s.

## Data added
| File | Source | Licence | Script |
|---|---|---|---|
| `milkyway.bin`, `milkyway.json` (86 kB, 20 kB gzipped) | d3-celestial `data/mw.json` (5 nested outline levels) | BSD-3-Clause | `build_milkyway.py` |
Outlines are isophote sketches, not photometry: the Credits panel says so. No Magellanic Clouds in that file.

## Star limiting magnitude (changed: read this before touching sky.js)
`limMag = min(physical, crowd)`.
- `physical = base + zoomGain(fov)` as before (base = Bortle NELM - daylight - moonlight).
- `crowd = densityLimit(perCm2)`: the magnitude at which the all-sky mean star density times the screen's square degrees per
  cm^2 (37.8 CSS px = 1 cm; averaged over the window because stereographic scale grows toward the edge) equals the target.
  Target `STARS_PER_CM2 = 1.3` at Bortle 4, x1.5 per magnitude of `base` (capped at x1.22), x `state.starScale` (quiz).
- Stars within 1.5 mag of the limit fade in (alpha 0.08 -> 1), so nothing pops while zooming.
- DSOs follow `limMag + 0.6`, so the wide-field label clutter in the Milky Way went away with this; the selected DSO is always drawn.
Measured (1512 x 772 window, Bortle 4, no Moon; stars drawn / window cm^2):
| FOV | limit | Milky Way field (Cygnus) | galactic-pole field (Coma) |
|---|---|---|---|
| 180 deg | 4.97 (crowd) | 0.64 | 0.54 |
| 90 deg | 5.72 (crowd) | 1.12 | 0.88 |
| 30 deg | 7.03 (physical) | 1.18 | 0.56 |
| 5 deg | 8.98 (physical) | 0.26 | 0.10 |
| 1 deg | 10.7 (physical) | 0.02 | 0.01 |
| 10 arcmin | 12.7 (physical) | 0 | 0 |
Constant from 180 deg to about 20 deg; below that the HYG catalogue (complete to about mag 9, 117 k stars = 2.8 per sq deg) cannot
supply the stars. A deeper catalogue (Tycho-2, 2.5 M stars) in sky tiles would be needed to hold the density at narrow fields.

## Grids (render/grids.js) after hands-on QA
Before: spacing was `fov / 6` (12-16 lines across a wide laptop window, both grids on = a net), labels all the same grey and placed at
the nearest polyline VERTEX to the edge (so they sat up to 60 px inside the view and hopped as vertices slid by), Alt and Dec labels
indistinguishable, 72-spoke fan at the zenith/pole.
After: spacing is the smallest "nice" step whose lines are at least max(w, h) / 11 px (100-190 px) apart, i.e. at most about 11 lines
across the long side and 3-5 across the short one (30, 20, 15, 10, 5, 2, 1 deg ... 1 arcsec; RA 2 h ... 1 s); labels sit exactly where
a line leaves the labelled area, meridians preferring the bottom/top edges and parallels the left/right, clamped so text is never cut
off; equatorial labels blue, alt-az labels green; a parallel that closes on screen is labelled at its lowest point; meridians thin
toward the pole in stages (each family ends on a parallel) and the fan is held to about 24 spokes.
Checked at 153, 90, 53, 31, 18, 11, 6.4, 3.8, 2.2, 1.3 deg, 47, 27, 16, 9.6, 5.6 arcmin in both mounts. Labels re-flow around the
pointer read-out and panels (renderer `uiBlocks`).

## Camera at the poles (camera.js `bringUnder`)
The grab-pan was a 4-step Newton iteration that assumed "tilt up moves the sky point's latitude up", which is false for a point on the
far side of the mount's pole: dragging from the zenith stuck or oscillated. It is now solved in closed form (see the comment there).
The camera cannot tip over the pole (no roll), so when a drag would need that, it holds the pole and turns the sky by the pointer's
swing about the screen centre (damped near the centre); a solution that would flip the view by half a turn in one step is refused.
Synthetic 60-step drags (largest change of lon + lat per step): through the zenith 0.7 deg; again from the zenith 0.09; diagonal 3.0;
zoomed to 12 arcmin at the zenith 2.1 / 11.9 / 0.2; through the nadir (ground off) 1.2; through the NCP 1.1, SCP 1.2 (equatorial
mount); SCP at 6 arcmin 1.7. A sideways drag that carries the grabbed point right past the pole still swings fast (20-80 deg in a
step): inherent to keeping the point under the pointer. No NaNs at latitude +90, -90, 0, -33.9; tracking Polaris at x10,000 and Vega
through 89.0 deg altitude at x100 is smooth (azimuth up to 29 deg per 100 ms at the closest point, as it must).

## Hubble's-law lab: data facts
- OpenNGC (NGC.csv + addendum.csv, downloaded 2026-11-23): 10,792 objects of type G/GPair/GTrpl/GGroup; 10,249 have a redshift (95%).
- In the app (dso.json + dso-deep.json): 4,081 galaxies, 4,074 with z; 3,204 with cz > 1,500 km/s; 26 blueshifted; max z 0.062;
  574 are brighter than mag 12 with cz > 1,500 (the default list).
- OpenNGC's RadVel column is the RELATIVISTIC velocity for its z (574 km/s below cz at z = 0.062). The lab uses cz = c z and says so.
- No distances anywhere. The distance column is typed by the student, or filled by "d = D / theta" with a D the student types (rows
  then carry a theta badge and the CSV says "angular size with assumed diameter D kpc"). Fit: v = H0 d through the origin,
  H0 = sum(v d) / sum(d^2), +- = sqrt(sum(res^2) / (n - 1) / sum(d^2)); needs >= 3 distances.

## Shared-file edits (all small)
index.html (extras.css link) · main.js (import + `initExtras`, click chain `extrasClick || measureClick`) · renderer.js (`drawMilkyWay`
after the background; three selectors added to `uiBlocks`) · render/ground.js (`drawGroundShade` call) · render/grids.js (spacing,
labels, pole thinning: see above) · render/sky.js (`limMag`, `STARS_PER_CM2`, `state.starScale`) · render/stars.js (fade curve) ·
render/dso.js (selected object always drawn) · render/constellations.js (boundary alpha 0.38 -> 0.5) · camera.js (`bringUnder`) ·
catalog.js (a failed star tier waits 15 s before retrying instead of refetching every frame; emits `catalog` 'stars-error') ·
about.js (shortcuts, teaching tools, Milky Way credit).

## Known weak spots (this layer)
- Phone layout was tested in a 390 x 760 same-origin iframe with mouse clicks, not on a phone; long-press was not exercised by a real finger.
- Night mode is one SVG colour-matrix filter on <body>: fine in Chrome; not checked in Safari (if it is slow there, swap for a
  multiply overlay). The screenshot is always the unfiltered sky.
- Copy-to-clipboard paths (coordinates, Hubble table) show their toast; the clipboard contents were not read back (the browser prompt
  blocks automation). `planetarium.hubble.csv()` returns the same text for checks.
- Quiz "Find the star" targets can start under the quiz panel on a laptop; the student has to drag. Whole-sky quizzes turn the
  atmosphere off, so they show an airless sky.
- Pointer read-out and the quiz/hubble/list keys (W N O H) are not yet in the Labs agent's URL-parameter scheme.
- The crowding limit uses the all-sky MEAN star density, so Milky Way fields are about twice as full as polar ones (by design: that is
  the sky), and with the atmosphere off the limit is about 0.2 mag deeper.

# Tier 4: measuring tools and classic-measurement labs (third agent, 2026-11-23)

Everything here lives in `js/labs/` and `css/labs.css` (the stylesheet is injected by `labs/index.js`; `index.html`
is untouched). Instructor key with measured-vs-true values: `LABS.md`. `main.js` calls `initLabsSuite()` after
`initExtras()`.

## Modules (js/labs/)
- `index.js`       start-up: "Labs" button + menu in the top bar, overlays, keys (`X` = mark time, `Shift + arrows` =
                   ±1 s / ±1 min), URL parameters, and the `window.planetarium.labs` handle.
- `dock.js`        the stack of cards at the top right (lab prompt, stopwatch, events, two observers, path, corrections).
- `setup.js`       `applySetup(obj)` puts the whole app into a described state (time, place, target, FOV, look
                   direction, mount, show/fx flags, light time, rate, tools, second observer, trail); `describeView()`
                   is the inverse (Copy link); `setupFromQuery()` reads the URL. Sets `state.ephemeral`, so a lab or
                   a shared link never overwrites the viewer's saved place and toggles.
- `presets.js`     the 33 labs: setup + prompt (no answers) + "about". `labs.js` = list dialog and lab card.
- `stopwatch.js`   marks (whole seconds), differences, labels, copy as table.
- `events.js`      Events finder on astronomy-engine `Search*`. Shows DATES only; times and contact times only with the
                   Instructor box or `?instructor=1`.
- `shadow.js`      `earthShadow(frame, lightTime)`: umbra/penumbra at the Moon's distance, same model as
                   `SearchLunarEclipse` (Sun 695,700 km; Earth 6371 + 88 km = 1.4% enlargement, not 2%; axis from the
                   apparent Sun). Overlay darkens the Moon inside the shadow (always) and outlines both circles when
                   `state.fx.earthShadow` is on. More than 60° from the anti-solar point nothing is darkened (new Moon!).
- `compare.js`     second observer: ghost Sun/Moon/planets for `cmp.obs2`, lined up on the stars or on the Sun's disc.
- `trails.js`      path of Sun/Moon/planet with dated ticks, against the stars or as alt-az at the same clock time (analemma).
- `corrections.js` switches for `state.fx` (aberration, parallax, properMotion, earthShadow) + refraction + light time;
                   also tightens `stars.epochTol` when FOV < 3° so proper motion is applied continuously.
- `targets.js`     registry of extra snap targets for the angle tool (`setTargets(owner, list)`, `registerResolver(type, fn)`).
- `util.js`        `placeEqj()` (projection without the view-cone test), DOM helpers, `fmtDuration`.

## Hooks for other modules
- Start a trail: `emit('trail-request', { ref | body, step?, before?, after?, frame? })` or
  `planetarium.labs.startTrailFor(refOrBodyId, opts)` (returns false for anything but Sun/Moon/planets;
  `planetarium.labs.canTrail(id)` tells in advance). `stopTrail()` removes it.
- `planetarium.labs.startLab(id)`, `.applySetup(obj)`, `.viewLink()`, `.labLink(id)`, `.allTargets()`, `.marks`.
- New events: `fx` (a state.fx flag changed), `compare`, `trail`.

## URL parameters (all optional)
`lab=<id>` · `t=<ISO UTC, e.g. 2018-07-27T18:20:00Z or -000240-06-22T09:40:00Z>` · `lat` `lon` `elev` `place` `tz` ·
`target=<body | star or DSO name | HIP n>` `track=1` · `fov=<deg>` · `az`+`alt` or `ra`+`dec` (deg) · `mount=eq|altaz` ·
`on=` / `off=` comma lists of `state.show` keys, `state.fx` keys and `lightTime` · `play=1` `rate=<n>` ·
`obs2=<lat>,<lon>,<name>` `align=sun|stars` · `trail=<body>,<step days>,<before>,<after>,<stars|horizon>[,<t0>]` ·
`tools=stopwatch,events,compare,trails,corrections,measure` · `instructor=1`. Lab + extra parameters combine
(the lab is applied first). Not covered: the other agent's panels (quiz, Hubble, list) and night mode.

## Changes to shared / core files (each small; search for "labs")
- `state.js`: `state.fx`, `state.ephemeral` guard in `save()`.
- `skyframe.js`: `getFrame()` applies the aberration/parallax flags; frames carry `epos`, `betaTrue`, `Mtj`/`Mjt`
  (true ecliptic of date). `render/grids.js`: the ecliptic line is now OF DATE.
- `ephem.js`: `compute(frame, lightTime, aberration)`; the Moon's phase is TOPOCENTRIC (needed for the half-Moon lab;
  check.mjs section 4 numbers moved by up to 0.05%); moons get `light` (0–1, planet's shadow with umbra/penumbra
  taper), `eclipsed`, `occFrac`, and occultation/eclipse tests use the planet's FLATTENED figure (`hiddenFraction`).
- `render/planets.js`: `place()` no longer rejects a disc whose centre is outside the view cone (the Sun vanished
  when zoomed onto its limb: this made contact timing impossible); eclipsed moons fade; resolved moons behind the
  planet are covered by the disc instead of being cut off 1.5 px early.
- `catalog.js`: `starApparentEqj(k, i, frame)` (exact proper motion, parallax, aberration in double precision),
  `stars.epochTol`, proper-motion switch. `objects.js` uses it for stars. `render/stars.js`: parallax in the hot
  loop when FOV < 5°.
- `measure.js`: limb snapping (discs ≥ 9 px: click within ~10% of the edge), labs targets, Snap on/off button,
  0.0001° / 0.1″ / 0.01″ read-out, five rows shown. Rows follow their objects as time runs.
- `info.js`: stale-panel fix (a single time step could leave old numbers: now a trailing refresh), RA to 0.001 s and
  Dec to 0.01″ when FOV < 0.5°, ecliptic longitude/latitude of date, Moon's phase to 0.01%, "in the planet's shadow".
- `ui.js`: time steps ±1 synodic month, ±1 sidereal month, ±1 Mars year, ±100 years. `about.js`: keys + notes.
- `tools/build_stars.py` + `data/stars-4.bin`: HYG clips pmdec at 9999.99 mas/yr; Barnard's star (the only one)
  gets the Hipparcos value 10326.93. Only that one float changed.
- `tools/check.mjs`: sections 12–16.

## Correctness numbers (tools/check.mjs 12–16)
- Lunar eclipse contacts vs `SearchLunarEclipse` for 2018-07-27, 2019-01-21, 2000-07-16, 2029-06-26, 2025-03-14:
  all U1–U4 within 1 s. As drawn from Nairobi with the Moon's light time: U1 2 s later.
- Transit contacts (criterion: centre distance = R_sun ± R_planet) vs `SearchTransit`, geocentric: Venus 2012, 1769,
  1639 and Mercury 2019 within 2 s. Venus 1769 II–III: Tahiti 19,772 s, Vardø 21,175 s (23 min 23 s apart).
- Io: half-light at 2025-10-01 15:03:36 and 2026-03-01 03:48:21 UTC; JPL Horizons partial-umbral phases
  15:02:05–15:05:35 and 03:46:15–03:49:55 (queried 2026-11-23, geocentric, 10 s steps). Light time on vs off: 2658 s
  = Jupiter's light time at 5.3266 au (c = 299,790 km/s).
- Aberration of γ Dra 19.68″–20.81″ over a year; parallax 61 Cyg 0.287″, α Cen 0.755″, Barnard 0.548″ (= 1 / catalogue
  distance); Barnard's proper motion 10.358″/yr.
- Dichotomy at Tokyo 2026-12-17 04:35:21: Sun–Moon 89.8492° = 90° − asin(d_M / d_S). Sun at the 2026 March equinox in
  the app's ecliptic of date: longitude 0.00002°, latitude 0.25″. Spica: 172.01°, 174.29°, 204.22° (50.0″/yr).

## Known weak spots (this layer)
- With refraction ON the Sun and Moon are still true circles, so limb contacts of a low Sun/Moon are a few arcseconds
  out; every contact lab starts with refraction off and the Info text says so. A squashed disc would fix it properly.
- Jupiter's/Saturn's limb for snapping is the EQUATORIAL radius (the globe is drawn flattened).
- Moon shadows on Jupiter, and Jupiter's shadow drawn as a shape, are not done (moons simply fade). Saturn's moons use
  the same eclipse code but their positions are only approximate, so their eclipse times are not to be trusted.
- The Moon keeps its soft glow in totality, and the sky's limiting magnitude does not deepen during a lunar eclipse.
- Phone / small embed: the dock becomes a strip above the bottom bar and the lab card starts folded; it can overlap
  the other agent's bottom sheets. Checked in 390 × 700 and 760 × 430 iframes only.
- Trails are for Sun, Moon and planets (not moons of planets, stars or DSOs); one trail at a time.
- Events finder searches forward only ("Earlier" jumps the anchor back by eight typical intervals).
- Parallax recovers the HYG catalogue distance by construction; proper motion is linear in RA/Dec; no radial velocity.
- Chrome throttles a background window's animation frames: when scripting tests, wait about 1 s after a time step
  before reading the info panel.

---

# Integration pass: faint-star tiles and hands-on QA (fourth agent, 2026-11-23)

## Faint stars: Tycho-2 in sky tiles (`js/deepstars.js`, `tools/build_tycho.py`, `data/tycho/`)
- **Source.** The Tycho-2 Catalogue (Høg et al. 2000, A&A 355, L27), CDS catalogue I/259: `tyc2.dat.00.gz` … `.19.gz` and
  `suppl_1.dat.gz`, downloaded 2026-11-23 from `https://vizier.cfa.harvard.edu/ftp/cats/I/259/` (the CDS VizieR mirror at
  CfA; `cdsarc.cds.unistra.fr` itself answered "page unavailable" that day). **Licence as stated in the catalogue's ReadMe:
  CC BY-NC 3.0 IGO** (non-commercial, attribution). This is NOT the "free with acknowledgement" the brief assumed: see
  "For Seth". The tiles are a separate data set in their own folder; the app runs without them (HYG only).
- **What is in the tiles.** 2,433,138 stars = Tycho-2 (2,539,913) + supplement-1 "T" rows, minus everything already in HYG:
  119,739 entries carrying a Hipparcos number that HYG has, and 94 more within 6″ and 1.5 mag of an HYG star. So nothing is
  drawn twice; the fainter member of a pair that Tycho-2 resolves under one HIP number is not drawn. 24 stars with no V_T are
  left out; 349 with V_T only are stored with V = V_T and no colour. V = V_T − 0.090 (B_T − V_T), B−V = 0.850 (B_T − V_T)
  (the ReadMe's formulae). Positions: mean J2000 position (for 109,445 entries without one, and supplement-1, the observed
  position, epoch about 1991). No proper motion or parallax for tile stars.
- **Layout.** `index.json` (214 kB, fetched at start, non-blocking): manifest, all-sky and per-galactic-latitude star counts,
  and the 4,513 stars brighter than V = 8 that HYG lacks (Hipparcos is not complete; e.g. γ¹ Vel), at full precision.
  `a/<band>_<cell>.bin`: 8 ≤ V < 10 in 15° declination bands (184 tiles, 242,610 stars, 2.7 MB). `b/…`: V ≥ 10 in 5° bands
  (1,654 tiles, 2,186,015 stars, 24.0 MB; largest tile 75 kB). Cells are RA slices of about equal width on the sky.
  Record = 11 bytes: u16 RA and u16 Dec within the cell (0.27″ steps in level b), u16 V in millimag, u8 B−V in 0.02 steps,
  u32 TYC id. Sorted by V so the draw loop stops early. Total 26.9 MB in 1,839 files (zones rather than HEALPix: no library,
  trivially reproducible; 11 bytes rather than 6 so a clicked star shows its real TYC number and V to 0.001).
- **Run time.** Level a is asked for when the limit passes 8.0 (field about 25°), level b when it passes 10 (about 7°); only
  tiles that intersect the view cone, nearest the centre first, 6 requests at a time, at most 90 wanted per view; requests for
  tiles that scrolled away are dropped. A failed tile is retried after 2, 4, 8 … 60 s while it is still on screen (tested by
  making `fetch` reject: 12 tiles × 3 tries in 7.5 s, all loaded once fetch worked again; no console spam). Cache: 450,000
  stars (about 9 MB), least-recently-seen first; **the eviction branch was never reached in my tests** (peak 233,000 stars).
  A tile's stars fade in over 450 ms, on top of the existing fade within 1.5 mag of the limit.
- **Selecting one.** Reference `{kind: 'tyc', t: tile, i}` (holds the tile, so it survives eviction). Info panel: TYC number,
  V, B−V, "no distance". Not searchable by TYC number (no index from number to tile), and "Copy link to this view" carries
  the direction, not the star.

## Limiting magnitude (changed again: `render/sky.js`, `render/density.js`)
- `limMag = min(physical, crowd, 13.5)`. At night `physical` now gains 5 log10(60° / fov) (it was 2.5), so the crowding
  limit is the one that binds and the screen density holds; against a bright sky (day, twilight) the old 2.5 slope stays.
  13.5 = just past the end of the catalogue: without it every field star kept swelling as the limit ran on (a mag-11 star
  outshone Io at FOV 0.07°).
- `crowd` uses the manifest's counts of HYG + Tycho-2 (up to the turnover at V = 11.75, then × 2.5 per mag), and is now
  solved from 0.65 log N(local) + 0.35 log N(all sky), N(local) from 8 bands of |sin b| sampled over the screen. With the
  all-sky mean alone a 5° field in Cygnus held 8× the stars of one at the galactic pole; now 3×, and the limit differs by
  about 1 mag between the two.
- Read-out: past mag 12 it says "stars to mag 12.0 / the star catalogue ends here" instead of a magnitude nothing has.

Stars drawn per cm² of screen (1512 × 828 window, Bortle 4, no Moon, all tiles loaded):
| FOV | Cygnus (l 79, b +2): limit, stars, per cm² | Galactic pole (Coma): limit, stars, per cm² | before (Cyg / pole) |
|---|---|---|---|
| 180° | 5.07, 593, **0.68** | 4.95, 414, **0.47** | 0.64 / 0.54 |
| 90° | 5.78, 1001, **1.14** | 5.93, 863, **0.98** | 1.12 / 0.88 |
| 30° | 7.38, 1454, **1.66** | 7.81, 897, **1.02** | 1.18 / 0.56 |
| 10° | 9.31, 1978, **2.26** | 10.16, 816, **0.93** | |
| 5° | 10.63, 2237, **2.55** | 11.70, 729, **0.83** | 0.26 / 0.10 |
| 2° | 12.60, 1331, **1.52** | 13.5, 183, **0.21** | |
| 1° | 13.5, 330, **0.38** | 13.5, 60, **0.07** | 0.02 / 0.01 |
| 30′ | 13.5, 77, **0.09** | 13.5, 15, **0.02** | 0 / 0 |
The density now holds from 180° to about 3° (it was 20°); below that Tycho-2 has no more stars to give (25–150 per square
degree). Holding it to 1° needs about mag 15 (Gaia, roughly 30 million stars), to 30′ about mag 16.5: far outside 40 MB.

## Performance (same machine, 3024 × 1656 backing store)
- Stars are drawn from one sprite atlas (14 colours × 10 opacities) with no `globalAlpha` changes; Milky Way sampled every
  10 px with a lookup table instead of `pow` (6.8 → 3.5 ms). `perf.stage` has per-stage milliseconds.
- Under continuous scripted panning (worst case, every frame redrawn): 11 ms (90°) to 18 ms (3–8°, 1,700 stars) of JS a frame;
  the base-catalogue loop still walks all 120,000 HYG stars at narrow fields (about 4.5 ms: a sky-cell index would remove it).
- Real use: zooming by wheel/keys 90° → 2″ → 180° through tile loads: JS median 4.8 ms, p95 6.3, max 9.6 ms, no NaN.
  Tracking the Moon at FOV 4° with time at ×3000 for 20 s (2,370 frames, 21 tile loads): frame interval median 8.5 ms,
  p99 10.4, max 10.9 ms. 95 s at ×10,000, FOV 60°, grids on: 11,107 frames, max interval 17 ms, heap 94 → 72 MB (no growth).

## Bugs found by hand and fixed
Snapping and picking (all made worse, or exposed, by having a faint star behind everything):
- Angle tool: a star hidden BEHIND the Moon's disc stole a limb snap ("TYC … → Moon limb", 34.39′ for 33.9′). Stars inside the
  disc of the Sun, Moon or a resolved planet are no longer targets (`measure.js`), nor pickable (`picks.js`); beside a limb or
  outline a neighbouring star wins only when the click is right on it; a click on a bright star's disc means that star
  (clicking Alpheratz 4 px off gave "HIP 544").
- Star and DSO labels were drawn on the face of the Sun and Moon (`labels.blockDisc`).
- Right-click → Copy coordinates gave the clicked pixel's coordinates under the object's name (12′ off for Alpheratz).
- Right-click → Start trail did not open the Path card, so there was no visible way to stop the trail.
Navigation and time:
- Selecting another object silently kept tracking on, so the lab text "click Venus, press T" switched tracking OFF.
  Tracking now ends when a different object is selected (`nav.select`).
- `+` / `−` pressed during a glide (e.g. straight after a search) were thrown away; they now move the glide's end FOV.
- Bottom toolbar: with a long zone label ("UTC+11:39:04 (local mean time)", any date before standard time) the centred
  toolbar overflowed and its first button was unreachable. `safe center`, and the bar shows "… LMT".
- Date editor: "08:10:22 AM" and a two-digit day were clipped.
- Events finder "Earlier" jumped back 6.6 years in the Mercury + Venus list; it now goes back one page.
Panels:
- A teaching panel (deep-sky list, Hubble lab, quiz) covered the lab cards; the cards now sit beside it. Toasts no longer
  cover the panel's title.
- Phone: the object-info sheet lay UNDER the lab cards; it now stacks above them (`--dock-h`). Small embeds (≤ 900 px wide):
  narrower info panel and cards, so the tracked object shows between them.
- Hubble lab: opening "Estimate distances from angular size" squeezed the student's table to one row.
- Quiz "Find it" started from wherever the view was (I got a blank patch of ground at FOV 43′ after a Hubble go-to); it now
  opens out to 100° above the horizon first. Menu said "Constellation quiz", panel "Sky quiz".
- Settings: light-travel-time box did not follow Labs → Corrections; Enter in the lat/long boxes did nothing; the city
  filter stayed filled after a choice. Second-observer longitude box clipped "-157.86".
Text: Info said refraction depends on the atmosphere switch (it has its own, F); faint-star paragraphs and the Tycho-2
credit with its licence added; quiz and ⌘S keys listed.

## Keyboard shortcuts (complete; checked by pressing each one)
No two modules claim the same key. Core (`ui.js`): `C` lines · `V` constellation names · `B` boundaries · `S` star names ·
`P` planet names · `D` deep sky · `E` equatorial grid · `Z` alt-az grid · `;` meridian · `.` equator · `,` ecliptic ·
`A` atmosphere · `F` refraction · `G` ground · `Q` cardinal points · `M` mount · `R` angle tool · `Space` centre · `T` track ·
`J` / `K` / `L` slower / ×1 / faster · `7` pause · `8` now · `[` `]` ±1 day · `{` `}` ±1 sidereal day · `<` `>` ±1 hour ·
`/` or `F3` search · `Esc` close / deselect · arrows pan · `+` `=` `PageUp` zoom in · `−` `_` `PageDown` zoom out.
Extras (`extras.js`): `W` Milky Way · `N` night mode · `O` deep-sky list · `H` Hubble lab · `Ctrl/⌘ S` screenshot.
Labs (`labs/index.js`): `X` mark time · `Shift ←/→` ±1 s · `Shift ↓/↑` ±1 min.
Quiz (only while one runs): `1`–`4` answer · `Enter` / `Space` next; `C V B S D P` are swallowed.
Menus: `↑ ↓ Home End Esc` in the right-click menu; `↑ ↓ Enter Esc` in search. Free letters: `I U Y`.

## Not tested, or not done
- Sydney's third contact (2012) was not judged by eye; only one Sydney contact was. Sub-labs not re-run: the 28 others.
- "Use my location" (browser permission prompt), long-press on a real touch screen, a real phone, Safari, Firefox.
- Clipboard contents (the toasts "copied" appeared; the text was compared through `viewLink()` / `hubble.csv()`).
- Cache eviction (see above). Memory was watched for 95 s, not several minutes.
- Deep-sky list: opened, "Show in Deep-sky list" works; its filters and sort were not exercised. Constellation-boundary hover
  highlight: boundaries toggled, hover not looked at. Grid labels were looked at 180° → 2″ in passing, not scale by scale.
- One unexplained miss: in "Find the star" a click on Capella, taken from a screenshot a moment earlier, was scored "no bright
  star there"; the next question (Aldebaran, position read from the page) was scored correctly. Could not reproduce.
- Known and left: grid labels show faintly under the pointer read-out; a DSO label can sit just below the horizon line; on a
  phone a tracked object is hidden behind the info sheet until it is closed; the Events finder sets the clock to the exact
  instant of an event even when it lists dates only.
- Downloads: the CSV and one screenshot were saved to ~/Downloads by the tests and deleted afterwards.

## Shared-file edits in this pass
New: `js/deepstars.js`, `tools/build_tycho.py`, `data/tycho/`. Edited: renderer.js (deep stars, `perf.stage`), main.js,
objects.js, info.js, nav.js, input.js, picks.js, measure.js, ctxmenu.js, quiz.js, ui.js, extras.js, about.js, milkyway.js,
render/{sky,density,stars,labels,planets}.js, labs/{setup,dock,events}.js, css/{app,extras,labs}.css,
tools/frame-test.html (`app=` passes parameters to the frames, `bare=1`), LABS.md.
