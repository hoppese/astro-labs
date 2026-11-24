# Planetarium (beta): working notes

A Stellarium-inspired web planetarium for astro-labs. Static files, no build step, ES modules.
Spec: the lead's `SPEC.md` (Tiers 1-3) and `SPEC-LABS.md` (Tier 4, classic measurements). This file is the
hand-over: architecture, data provenance, what is done, what is left, known issues. Keep it current.

Last updated 2026-11-23: five sections, one per agent; the last ("Deep stars: Gaia DR3") is the most recent and overrides earlier statements about faint stars, star limits and the Tycho-2 tiles. 2026-11-24: "Bright-star astrometry" (near the end) overrides what is said here about the HYG star files, their record and their proper motion.

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

---

# Deep stars: Gaia DR3, bundled to G = 12 and online to G = 21 (fifth agent, 2026-11-23)

Goal (Seth): about 1.3 stars per cm² of screen at EVERY zoom, not only down to 3°. That needs Gaia (1.8 billion stars),
so: a bundled layer in the repo to G = 12, and below that the stars of the field on screen fetched from a public service.

## What replaced what
- `data/tycho/` is no longer read by any code (the Gaia bundle replaces it fully). It was NOT deleted: remove it when convenient.
  `tools/build_tycho.py` is likewise unused now.
- New: `js/healpix.js`, `tools/fetch_gaia.py`, `tools/build_gaia.py`, `data/gaia/`. Rewritten: `js/deepstars.js`, `js/render/density.js`.
  Edited: `render/sky.js` (limit: see below), `renderer.js` (feedback call), `objects.js` / `nav.js` / `info.js` / `labs/setup.js`
  (reference kind `'tyc'` is now `'gaia'`), `ui.js` (read-out), `state.js` (`show.netStars`), `main.js`, `about.js`, `index.html`
  (Settings → Faint stars), `css/app.css` (`.ro-note`), `tools/check.mjs` (section 17).
- Module caching while developing: same workaround as before (`fetch(f, {cache: 'reload'})` for each changed file, then reload).

## Licence: read this first
The brief assumed "Gaia data: free to use with the ESA/Gaia/DPAC acknowledgement". ESA says two things:
- Gaia DR3 "Credit and citation instructions" (gea.esac.esa.int/archive/documentation/GDR3/Miscellaneous/sec_credit_and_citation_instructions/):
  "The Gaia data are open and free to use, provided credit is given to 'ESA/Gaia/DPAC'." and the acknowledgement text
  "This work has made use of data from the European Space Agency (ESA) mission Gaia (https://www.cosmos.esa.int/gaia), processed by
  the Gaia Data Processing and Analysis Consortium (DPAC, https://www.cosmos.esa.int/web/gaia/dpac/consortium). Funding for the DPAC
  has been provided by national institutions, in particular the institutions participating in the Gaia Multilateral Agreement."
- The Gaia Data License page (www.cosmos.esa.int/web/gaia-users/license), read 2026-11-23: "Gaia data are distributed under the
  CC BY-NC 3.0 IGO license."
So Gaia carries the SAME licence as Tycho-2 (CC BY-NC 3.0 IGO): the licence question does not go away by switching. Non-commercial
redistribution with attribution is what that licence allows, and Credits now carries the credit, the full acknowledgement and the
licence. Whether `data/gaia/` goes into the public repo is Seth's call (see "For Seth"). `data/gaia/` is NOT in `.git/info/exclude`
(`data/tycho/` is), so a plain `git add` WILL pick it up.

## Bundled layer: `data/gaia/` (30.9 MB, 3,678 files)
- Source: ESA Gaia archive (gea.esac.esa.int), anonymous synchronous TAP with MAXREC, `gaiadr3.gaia_source` with G < 12 in 12 chunks
  (HEALPix base pixels by source_id range), 3,087,821 rows (each chunk's row count checked against the archive's COUNT(*)), plus
  `gaiadr3.hipparcos2_best_neighbour` (99,525 pairs). An anonymous ASYNC job silently stops at 50,000 rows: do not use it.
  404 MB of CSV, 6 minutes. `fetch_gaia.py RAW` then `build_gaia.py RAW hygdata_v41.csv data/` (75 s).
- Kept: 2,967,176 stars = everything not already in HYG. Left out: 99,208 sources that ESA's cross-match pairs with a Hipparcos
  number in HYG, and 21,437 matched by position (3″ at epoch 2016 with |ΔV| < 1.5, V estimated from G and BP−RP with the Gaia DR3
  documentation's polynomial; within 1.5″ any magnitude (variables: η Car, R Leo); HYG's fast stars without a Hipparcos number
  searched to 15″ with tighter tests). What remains near bright HYG stars are real companions (Mizar B, Acamar B, Almach B ...).
- **A finding about HYG while cross-matching:** HYG's epoch-2000 right ascensions were propagated from the Hipparcos epoch
  without dividing the proper motion by cos(dec), so fast stars far from the equator are off in RA by pmra × 8.75 yr × (1/cos δ − 1):
  θ UMa 3.2″, η Cas 5″, χ Dra 11″. Also HYG's non-Hipparcos (Gliese) entries can be 10″+ out. Both are in the app's HYG stars today
  (not fixed here; a fix belongs in `build_stars.py`).
- Layout: the same declination zones as before. `a/` 7 ≤ G < 9 and `b/` 9 ≤ G < 10 in 15° zones, 12-byte records;
  `c/` 10 ≤ G < 11 and `d/` 11 ≤ G < 12 in 5° zones, 10-byte records (a 1.0 MB, b 3.4, c 7.6, d 18.4; largest tile 61 kB).
  Record: u16 RA, u16 Dec within the cell, u16 G (mmag), u8 BP−RP (0.02), i8 pmRA, i8 pmDec (2 mas/yr), u8 parallax (0.2 mas)
  [+ u8, u8: eight more bits of RA and Dec in a/b]. `index.json` (317 kB, 147 kB gzipped, loaded at start, non-blocking): manifest,
  all-sky counts, and 3,777 stars at full precision WITH source_id: G < 7 (1,374), proper motion > 250 mas/yr (2,253), parallax
  > 50 mas (150). `counts.bin` (172 kB): star counts per HEALPix order-4 cell (3,072 cells) at G = 8, 8.5 … 21.5.
- **Positions are stored at epoch 2000.0** (Gaia's 2016.0 place moved back with Gaia's own proper motion), like HYG; the app applies
  the stored proper motion for the date on screen (the Labs proper-motion switch works on them) and Gaia's parallax when the
  parallax switch is on and FOV < 5°. 24,106 sources without a Gaia proper motion sit at their 2016 place with zero motion.
- **No source_id in the tiles** (8 bytes a star would have meant 54 MB). A clicked bundled star is looked up online (3″ cone, same G):
  title, exact G, BP−RP, parallax ± error, proper motion, radial velocity. Offline the panel shows the tile's rounded values and says so.
- Magnitudes are Gaia G, not V (the panel says "Gaia G"); HYG stars stay V. G is brighter than V by up to 1–2 mag for very red
  stars, which is why 12,000 Gaia stars of G 7–8 are not in HYG (V 8–9).

## Online layer: which service, and the evidence
Tested 2026-11-23 from the page itself (`fetch` with `mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer'`):
| Service | From http://127.0.0.1:8111 | Note |
|---|---|---|
| **GAVO Data Center TAP** `https://dc.g-vo.org/tap/sync`, table `gaia.dr3lite` | **200, type cors**, 1.1 s | echoes the Origin in ACAO; gzip; no key |
| CDS HiPS catalogue tiles `hipscat.cds.unistra.fr` (first choice) | timeout (20 s) | CDS Strasbourg was down all session: VizieR answered "Page unavailable", TAPVizieR and hipscat timed out |
| VizieR mirror at CfA `vizier.cfa.harvard.edu` (asu-tsv) | 200 after 9.2 s | CORS `*`, but 45 s for a 30′ cone and "Postgres connect error" on other tries |
| ESA Gaia archive, ARI Heidelberg, NOIRLab Data Lab, MAST, IRSA (TAP) | blocked | no Access-Control-Allow-Origin (ESA/ARI/NOIRLab/MAST answer curl in 0.5–2 s) |
From `https://hoppese.github.io` (same test on the live page): GAVO 200 / cors, 2.1 s (first request, TLS), 0.67 s, 0.37 s.
So the app uses GAVO. `PROVIDER` in `deepstars.js` is the one place to change; CDS HiPS tiles (static files, magnitude-ordered) would
be faster and lighter on the server and are worth a second provider when CDS is reachable again (not written: could not be tested).

How it asks. Tiles are HEALPix nested pixels; a tile's request is `source_id BETWEEN a AND b` (a Gaia id begins with the source's
order-12 pixel) plus a half-magnitude range, `ORDER BY G`, `TOP 2000`, columns rounded in ADQL (48 bytes a row). 19 levels,
G 12–21.5; each level uses, per order-4 cell, the pixel order that puts 100–400 stars in a tile (from `counts.bin`). Which tiles: a
17 × 10 grid of points over the window (below-horizon points skipped) → true J2000 direction → pixel; so only tiles the window
touches are asked for. Measured cost at GAVO: **0.4 s + 4.4 ms per row returned** (the size of the patch hardly matters), about
350 rows/s with 4 requests in parallel. That is why levels are thin and tiles small: the first design (1.5-mag levels, cone test)
asked for 14,000 rows to draw 800 stars.
Manners: nothing is asked until the view has been still 350 ms (moving = more than 12 % of the field per second); 4 requests in
flight; 40 tiles wanted per view; requests for tiles that left the view are dropped; memory LRU (300,000 stars); browser Cache
storage `planetarium-gaia-dr3-v1` (2,500 answers, about 35 MB at the measured 14 kB each, oldest dropped first; Gaia DR3 is frozen so nothing expires):
a field is fetched once per browser. No timer ever asks for anything. No cookies, no referrer, no custom headers.
A browser cannot hide the page's origin from a cross-origin request: GAVO sees `Origin: https://hoppese.github.io` and the IP.

Failure behaviour (tested by making `fetch` reject for the service, and by faking `navigator.onLine`):
- 3 failures in a row → the layer is marked down: 6 failed requests in all, within 1 s, then silence. One probe tile after 15 s,
  30 s, 60 s … 5 min, only while a view still wants deep stars. Recovery seen: service back at 20 s, probe at 46 s, 1,100 stars by 60 s.
- Read-out (amber): "deep stars unavailable (the star service is not answering | offline | switched off in Settings): showing stars
  to mag 12.0". The limit glides back to 13.5 (the old cap) and everything else works. No console noise.
- No `data/gaia/` on the server (HTTP 404 for `index.json`, tested by renaming the folder): HYG only, exactly as the live site is
  today, one console info line, no retries, no online requests; the read-out says "the star catalogue ends here" past mag 9.5.
- Settings → Faint stars → "Fetch faint stars online (Gaia DR3)" (`state.show.netStars`, on by default, saved with the other
  switches; `off=netStars` in a URL or `show: {netStars: false}` in a lab setup turns it off for that view).

## Limiting magnitude now (`render/sky.js`, `render/density.js`, `deepstars.js`)
`limWant = min(physical, crowd, depth cap, planet glare)`; `limMag` (what is drawn) = `limWant`, held back while tiles arrive.
- `physical`: night gain is now 7.5 log10(60°/fov) (was 5), cap 24, so `crowd` binds at night at every zoom.
- `crowd`: solved from 0.9 log N(local) + 0.1 log N(all sky) (was 0.65 / 0.35 with 8 latitude bands). N(local) = mean of the count
  map over 19 directions across the view (never less than a 2.5° circle). All-sky table: exact HYG + Gaia counts to 21.5.
- **Field correction** (`fieldFeedback`): the map is 13 sq deg a cell and the sky is patchier (a 10′ field in the Cygnus rift held
  0.59 stars/cm² instead of 1.3). When a zoomed frame (< 20°) is a fair sample (view still, all tiles in, crowding limit in force,
  window all sky and above 40° when the atmosphere is on, catalogue not exhausted) the stars drawn are compared with the target and
  the difference kept as a correction (clamped −0.9…+0.6 dex, glides 0.5 dex/s, never past G 20.9). It is dropped on zooming out
  past 1.5× or panning most of a field away, so it can only make the app ask for less, not more, in a new view.
- **Depth cap**: 1.5 mag past the faintest star that can be supplied now: 22.5 online, 13.5 otherwise (glides 8 mag/s on change).
- **Shown limit**: while a window's online tiles are arriving the drawn limit stays 1.2 mag past the depth to which at least half
  the window is covered, and glides (3 mag/s) as they come. Without this the bright stars swelled first and the field looked empty.
- **Planet glare** (new): with a planet in the window no star more than 14 mag fainter than it is drawn (Jupiter 11.8, Saturn 14.5,
  Venus 10; Uranus/Neptune unaffected; the Moon deliberately not: occultations). Zoomed on Jupiter the deep field stars were discs
  as large as the moons (disc size saturates 12.5 mag above the limit) and Io was lost among them. Side effect: a Jupiter or Venus
  field makes no online requests at all. Read-out: "fainter stars are lost in the planet's glare".
- Read-out names the source: "faintest: HYG" (limit ≤ 7), "faintest: Gaia DR3" (to 12), "faintest: Gaia DR3, online (GAVO) [· loading]",
  "Gaia DR3 ends here" (limit past 21).

## Measured (Chrome, 1512 × 828 CSS px window = 876 cm², Bortle 4, no Moon, cold cache)
Stars drawn per cm². Cygnus = RA 305.5° Dec +41° (l 79, b +2; 2026-08-12 05:30 UT); pole = north galactic pole (2026-04-17 05:30 UT).
"req / kB / s" = online requests, decoded kilobytes and seconds until the view was complete, jumping straight to that field of view.
| FOV | Cygnus: limit, stars, **/cm²**, req / kB / s | Pole: limit, stars, **/cm²**, req / kB / s | Online off: Cygnus / pole per cm² | Before (Tycho-2): Cyg / pole |
|---|---|---|---|---|
| 180° | 5.01, 558, **0.64** | 5.14, 560, **0.64** | same | 0.68 / 0.47 |
| 90° | 5.73, 963, **1.10** | 6.15, 1108, **1.26** | same | 1.14 / 0.98 |
| 30° | 7.10, 1191, **1.36** | 8.01, 1111, **1.27** | same | 1.66 / 1.02 |
| 10° | 8.57, 1170, **1.34** | 10.31, 1099, **1.25** | same | 2.26 / 0.93 |
| 5° | 9.75, 1223, **1.40** | 12.20, 1162, **1.33**, 10 / 92 / 7.9 | 1.35 / 1.14 | 2.55 / 0.83 |
| 2° | 11.71, 1115, **1.27** | 14.93, 1109, **1.27**, 26 / 353 / 17.8 | 1.25 / 0.18 | 1.52 / 0.21 |
| 1° | 13.62, 1094, **1.25**, 24 / 340 / 23.3 | 17.61, 1047, **1.19**, 13 / 231 / 3.8 | 0.36 / 0.05 | 0.38 / 0.07 |
| 30′ | 16.15, 1108, **1.26**, 27 / 275 / 9.4 | 20.86, 1058, **1.21**, 24 / 439 / 7.1 | 0.10 / 0.02 | 0.09 / 0.02 |
| 10′ | 20.28, 1177, **1.34**, 23 / 357 / 7.9 | Gaia ends: 131 stars, **0.15**, 2 / 24 / 0.8 | 0.02 / 0.00 | |
| 3′ | Gaia ends: 168 stars, **0.19**, 8 / 64 / 3.6 | Gaia ends: 12 stars, **0.01** | 0 / 0 | |
| 1′ | Gaia ends: 21 stars, **0.02** | Gaia ends: 1 star | 0 / 0 | |
- The density holds (1.1–1.4) from 90° down to 10′ in the Milky Way and to 30′ at the galactic pole. Below that there are no more
  stars in Gaia: every Gaia source in the window is on screen (a 10′ × 18′ window at the pole holds 131). 180° is 0.64 because half
  the window is ground or beyond the sky's edge (unchanged).
- The whole table, both fields: 157 requests, 2.17 MB decoded (about 47 % of that on the wire: gzip, measured with curl on one tile, 10.1 kB → 4.8 kB), 0 failures. Request latency:
  median 1.5 s, 90 % under 3.6 s, worst 6.1 s. Warm (Cache storage): the 1° Cygnus view is complete in 1.4 s with 0 requests.
- A real session (wheel and keys, Cygnus, cold): zoom 60° → 7′ in steps with pauses, then three drags at 7′: 72 online requests,
  990 kB decoded, 0 failures, plus 25 bundled tiles (458 kB). Each stop filled in over 2–9 s (e.g. at 14′: 121 → 1,203 stars in 9 s).
  Frames (2,252 of them): JS per frame median 3.9 ms, p95 4.4, max 18.3; while tiles were arriving median 3.7, max 7.0;
  frame interval median 8.5 ms, p95 9.0, one frame over 50 ms (70 ms).
- Jupiter at FOV 12′ (2026-11-24 09:00 UT): limit 11.8 (glare), 2 field stars, four moons clear, 0 online requests.
- Clicked stars: an online one → "Gaia DR3 2068321215983716224", G 19.414, BP−RP 3.671, parallax −0.207 ± 0.221 mas ("parallax
  too uncertain"), proper motion 7.61 mas/yr; a bundled G 10.55 star → rounded values at once, then (0.5–1.5 s) source_id,
  0.936 ± 0.015 mas, "3,480 ly (1,070 pc), from 1 / parallax".

## Known weak spots (this layer)
- **Speed.** A cold deep field in the Milky Way takes 5–25 s to fill (GAVO returns about 350 rows a second). Fine for exploring,
  slow for a class of 30 doing it at once, and 30 browsers are 30 times the load on a small academic server: see "For Seth".
- One service, one point of failure (it degrades to mag 12 cleanly, but then deep zoom is empty again).
- Mixed photometry: HYG stars are V, Gaia stars G. A red star just fainter than HYG's limit can look 1 mag "too bright".
- Row cap: a tile holding more than 2,000 stars in half a magnitude (would need a count map wrong by 5×) is cut at its 2,000 brightest
  (`t.full`); nothing is done about it. Never seen.
- The field correction makes the limit move a second or two after a view settles (stars fade in or out a little). In a field with
  ground in it, or below 40° altitude with the atmosphere on, it does not run and the density is the map's (±2× in patchy fields).
- Deep stars have no labels and cannot be searched; "Copy link" carries the direction, not the star.
- Bundled c/d tiles store positions to 0.27″: at arcminute fields a bundled star can sit a few pixels from where Gaia has it
  (the online record shown on click is exact, the drawn place is not).
- Galaxies and nebulae: Gaia is a star catalogue; deep fields show no faint galaxies (DSOs remain OpenNGC).
- Not tested: Safari, Firefox, a phone; Cache storage eviction (2,500 entries never reached: 157 were stored, 2.2 MB); memory LRU
  eviction of online tiles (peak 13,500 stars of 300,000); a whole class at once; the service's behaviour under real throttling
  (HTTP 429/503 are treated like any failure).
- `tools/check.mjs` section 17 checks the HEALPix code against six real Gaia rows, the tile request's id range, and (when
  `data/gaia/` is present) the manifest and two tiles. It does not exercise the network.

## For Seth
1. **Licence**: Gaia is CC BY-NC 3.0 IGO, the same as Tycho-2 (see above). Commit `data/gaia/` (30.9 MB) to the public repo or not?
   Without it the live site stays HYG-only and the online layer does not start (it begins at G 12 and needs `counts.bin`).
2. **Reliance on GAVO in class.** Each student's browser makes roughly 70–150 small requests in a session of deep zooming; the
   service is run by a university group with no stated limits and no SLA, and CDS (the usual alternative) was down all day today.
   Options: (a) accept it, and tell students deep stars may be slow or absent; (b) write to gavo@ari.uni-heidelberg.de saying a class
   will use it (also the polite thing); (c) pre-warm: Cache storage is per browser, so a lab's fields load instantly the second time
   on the same machine; (d) host deeper tiles yourself (to G 15: 37 million stars, about 260 MB, e.g. Cloudflare R2), which would
   make everything down to FOV 30′–1° independent of anyone else; (e) add CDS HiPS catalogue tiles as a second provider once CDS is up.
3. **Planet glare** is a new visual rule (no star more than 14 mag fainter than a planet in the field). It keeps Jupiter's and
   Saturn's moons readable; it also means no faint field stars beside a planet. OK?
4. **Gaia G vs V**: fine to show Gaia stars with their G magnitude, or convert to an estimated V (formula exists, σ 0.03–0.05 mag)?
5. `data/tycho/` (29 MB, local only) and `tools/build_tycho.py` can be deleted.

---

# Deep stars on our own storage: Gaia DR3, G 12 to 17, as static tiles (sixth agent, 2026-11-24)

Seth's decision: the stars from G = 12 to 17 are served as static files from a Cloudflare R2 bucket of their own; GAVO stays for
G > 17 and as the fallback. This pass built the tile set, the loader and the checks. **The tiles are NOT in the repo**: they are in
`~/Documents/GitHub/astro-labs-stars/gaia/v1/` (a plain folder, no git). Nothing was uploaded: no Cloudflare command was run.

## What is where
- `tools/build_deep.py`: download + tiles in one resumable job (its header holds the full format). New.
- `tools/check-deep.mjs`: section 19 of `node tools/check.mjs` (two small edits there: `netFetch` at the top, the call at the end). New.
- `js/deepstars.js`: hosted layer added (search for "hosted"); `js/ui.js` (read-out source, three lines), `js/info.js` (one note string).
- `~/Documents/GitHub/astro-labs-stars/gaia/v1/`: `manifest.json`, `progress.json` (audit trail, not needed online),
  `<level 0-9>/<order 3-11>/<ipix>.bin`.

## Tile set (version 1)
- Source: ESA Gaia archive, `gaiadr3.gaia_source`, 12 <= G < 17, anonymous synchronous TAP (as `fetch_gaia.py`), 263 chunks of about
  600,000 rows (one half-magnitude level x a run of whole HEALPix order-3 pixels = a source_id range), five at a time, about
  50,000 rows a second (each connection gives about 10,000 rows/s whatever the chunk). Columns rounded in the query to what the
  tile can hold (66 bytes a row instead of 127). Every chunk's row count was checked against the archive's per-cell count table
  AND a `COUNT(*)` of the same WHERE; raw CSV is deleted as soon as its tiles are written (never more than 250 MB on disk).
- Ten half-magnitude levels (0 = 12.0-12.5 ... 9 = 16.5-17.0), the same as the online layer's first ten. Per level a quadtree over
  the 768 order-3 HEALPix (nested, ICRS) pixels: a pixel with more than 4,096 stars is split in four. A tile = the Gaia sources
  whose source_id lies in the pixel and whose G lies in the level: exactly what `tileQuery()` asks of GAVO for the same pixel, so
  the two suppliers are interchangeable tile for tile (checked: section 19 compares one tile with GAVO's answer).
- Record: 10 bytes a star, column by column (x, y: 20 bits each in the tile's tangent plane, epoch 2000.0; G to 0.002 mag;
  BP-RP to 0.02; proper motion in a square-root code, 0.2 mas/yr steps near zero, range 279 mas/yr; parallax likewise, 0.04 mas
  steps, range 138 mas, 0 = not positive) + a 20-byte header + 16 bytes for each star whose motion or parallax does not fit the code
  (exact Float32 values). Missing colour / motion / parallax stay missing. No source_id (a click looks the star up at GAVO by place,
  like the bundled stars). Worst position rounding 0.042" (order-3 tiles), typically under 0.01".
- `manifest.json`: format, version, credit / acknowledgement / licence (CC BY-NC 3.0 IGO, see "Licence" above: the same question
  as for `data/gaia/`), the record's constants, and per level: m0, m1, stars, tiles, bytes and `tree` (the quadtree, depth first:
  2 = split, 1 = tile, 0 = no stars, no file). It lists only levels that are complete over the whole sky.
- Result (2026-11-24, 61 minutes of download): **154,643,438 stars, 82,869 tiles, 1,548,273,504 bytes of tiles** (10.01 bytes a
  star; with `manifest.json` 82,870 files, 1,548,412,877 bytes to upload). All ten levels complete; every level equal to the
  archive's COUNT(*) (1,706,784 / 2,575,022 / 3,823,640 / 5,650,889 / 8,223,733 / 11,841,446 / 16,951,372 / 24,091,612 /
  33,612,859 / 46,166,081). Tiles are order 3 to 9, at most 4,096 stars = 40,980 bytes, mean 18.7 kB. One chunk arrived
  cut short (1,146,213 of 1,159,604 rows, no error from the server); the row check caught it and the retry was complete.
  1,190,714 sources have no proper motion in Gaia, 1,577,922 no colour; 11,359 use the exception table.
- That is above the 1 GB aim (the aim assumed 7 bytes a star; 154.6 million is also more than the 150 estimated). What would
  shrink it: storing the tiles brotli-compressed with `Content-Encoding: br` saves 19 % (1.25 GB; gzip only 7 %: the
  positions are incompressible); an 8-byte record (18-bit positions = 0.1-0.2" in the coarsest tiles, colour to 0.1 mag, proper
  motion and parallax in 5 and 3 bits) would save 310 MB and is not worth what it loses. R2's free tier is 10 GB; what matters
  for speed is bytes per view (150-600 kB cold), not the total.
- **Stars the app already has** (`manifest.skip`, `manifest.skipIds`): 780 of the 101,652 HYG stars that `build_stars.py` ties to
  a Gaia source have G >= 12 and are in these tiles as well. The tiles keep them (counts stay equal to the archive, files stay
  immutable, the list can change with HYG without touching a tile); `--exclude` finds each one's tile and index (all 780 found,
  677 tiles) and the manifest carries them: the loader drops them while decoding, and drops the same source_ids from GAVO's rows
  whenever the manifest has loaded. Checked on screen: Gaia DR3 at RA 34.124 Dec +13.587 (G 13.56, 664 mas/yr): one object under
  the cursor, the HYG star. Not covered: with the hosted set unreachable there is no list, so GAVO's rows for G 12-17 double
  those 780 (as before this pass); and about 200 HYG stars fainter than V 10 that carry no Gaia id still have a tile star within
  2" (perhaps 40 by chance): they need a source_id from `build_stars.py` to be skipped.
- Immutable: nothing under `gaia/v1/` ever changes except `manifest.json` (which only ever gains levels). A rebuild with other
  settings (MAX_STARS, record) must go to `gaia/v2/` and `DEEP_TILE_BASE` with it.

## Rebuild / resume / audit
    python3 tools/build_deep.py ~/Documents/GitHub/astro-labs-stars/gaia/v1 WORK_DIR --status     # chunks done per level
    python3 tools/build_deep.py ~/Documents/GitHub/astro-labs-stars/gaia/v1 WORK_DIR              # (re)start: finished chunks are skipped
    python3 tools/build_deep.py ~/Documents/GitHub/astro-labs-stars/gaia/v1 WORK_DIR --verify     # every file present, right size and count
    python3 tools/build_deep.py ~/Documents/GitHub/astro-labs-stars/gaia/v1 WORK_DIR --exclude RAW_HIP/hyg_gaia_ids.csv   # skip list (below)
    python3 tools/build_deep.py ~/Documents/GitHub/astro-labs-stars/gaia/v1 WORK_DIR --list       # files.tsv: path, bytes, md5 (run last)
    node tools/check.mjs            # section 19, offline, 6 s in all: manifest, every 50th tile's header, four tiles decoded
    node tools/check.mjs --net      # + all 82,869 headers, three tiles against ESA, one against GAVO, level counts against COUNT(*): 3 min
WORK_DIR = any scratch folder (raw chunks in hand + five small count tables; needs under 1 GB). `--gmax 18` would add two levels
(G 17-18: about 147 million more stars by the count map's 2 % sample, 1.5 GB) with no other change: the loader takes the depth from the manifest.

---

# Bright-star astrometry: HYG's places replaced by Hipparcos-2 and Gaia DR3 (seventh agent, 2026-11-24)

Overrides every earlier statement that the star tiers are "HYG, no values changed", the 9-field record, and "proper motion is linear
in RA/Dec; no radial velocity". Names, designations, V, B−V, distance and radial velocity are still HYG's.

## The defect, and its cause (proved, not guessed)
HYG v4.1 took each Hipparcos (ESA 1997, CDS I/239) position at epoch 1991.25 and carried it to 2000.0 with
`RA += pmRA × 8.75 yr`. pmRA is μα* = (dα/dt) cos δ, so the step must be divided by cos δ; it was not. Declinations are right.
- "Hipparcos 1997 + pmRA × 8.75, no cos δ" reproduces HYG for 117,950 of its 117,951 Hipparcos stars to under 0.1″ (median
  0.0095″, 99 % under 0.026″: rounding). The one left is Barnard's star (HYG clips pmDec at 9999.99). The correct formula leaves
  18,368 stars over 0.1″; "no motion at all" 81,821. So it is neither mixed epochs nor rounding.
- Error on the sky = μα* × 8.75 yr × (1 − cos δ); correlation of the measured RA error with that prediction: 0.993.
- HYG against Hipparcos-2 carried properly to 2000.0, all 117,951 stars: median 0.027″, 90 % under 0.16″, 99 % under 0.90″,
  largest 17.9″ (Proxima). **Over 0.1″: 19,280 (16 %); over 1″: 980; over 5″: 48.** Histogram (″): <0.01 18,402 · 0.01–0.03
  45,505 · 0.03–0.1 34,764 · 0.1–0.3 13,517 · 0.3–1 4,783 · 1–3 876 · 3–5 56 · 5–10 34 · >10 14. Naked-eye tier (V ≤ 6.5):
  1,937 over 0.1″, 108 over 1″, 16 over 5″. Worst: Proxima 17.9, Kapteyn's star 16.7, α Cen A 16.5 / B 16.2, ε Ind 15.7, β Hyi 15.1,
  μ Cas 12.7, 61 Cyg 8.1 / 7.9, Groombridge 1830 7.3; θ UMa 3.2, η Cas 4.4, χ Dra 3.3 (the "11″" in the section above was wrong).
- HYG's 1,672 stars WITHOUT a Hipparcos number (Gliese catalogue) are worse: against their Gaia identifications the median
  error is 8.1″, 90 % under 31″, largest 116″; 893 of the 1,188 identified are over 5″.

## The fix (`tools/fetch_hipparcos.py`, `tools/build_stars.py`, then `tools/build_gaia.py`)
    python3 tools/fetch_hipparcos.py RAW/hip                                  # 1 min; add --with-1997 only to redo the proof above
    python3 -I tools/build_stars.py RAW/hyg/hygdata_v41.csv RAW/hip RAW_GAIA data/      # 30 s; RAW_GAIA = fetch_gaia.py's folder
    python3 -I tools/build_gaia.py RAW_GAIA RAW/hip/hyg_gaia_ids.csv data/              # 2 min; ARGUMENTS CHANGED (was the HYG csv)
Position + proper motion of each star, by `src` (new field; shown in the info panel as "Position and proper motion: …"):
| src | n | from |
|---|---|---|
| 2 | 97,518 | Gaia DR3, the source ESA's `gaiadr3.hipparcos2_best_neighbour` pairs with the Hipparcos number |
| 3 | 4,134 | Gaia DR3, identified here: 2,946 Hipparcos stars brighter than V 7.5 that ESA's table leaves unpaired (θ UMa, η Cas …: the only G < 7 source within 1″ of the Hipparcos-2 place at 2016.0, V within 0.5 mag), and 1,188 stars without a Hipparcos number (Gaia Catalogue of Nearby Stars + the G < 12 download: within 2′, proper motion within 25 % or 40 mas/yr, V within 0.6 mag, exactly one candidate, claimed by no other star) |
| 1 | 17,487 | Hipparcos, the New Reduction (van Leeuwen 2007, CDS I/311): no Gaia pair 15,268; pair has no proper motion in Gaia 1,624; ambiguous pair 483; G < 3 102; pair more than 1″ from the Hipparcos place 10 |
| 0 | 484 | **uncorrected: HYG's own numbers, flagged.** No Hipparcos number and no single Gaia source that fits (159 nothing near, 259 nothing acceptable, 58 two candidates, 8 contested). 390 are fainter than V 9.5; the 39 brighter than V 6.5 are nearly all components of bright pairs that HYG lists separately (Castor B, ξ UMa A and B, ξ Sco, γ CrA B …), for which Gaia has no full solution or no unique source, plus a few HD stars (η Car) |
- Rule: Gaia where it has a 5- or 6-parameter solution, G ≥ 3, and (moved back to 1991.25) lies within 1″ of the Hipparcos-2 place;
  else Hipparcos-2. This is SIMBAD's practice too. **No RUWE cut, on purpose** (first version had RUWE < 1.4, G ≥ 6 and a 30 mas
  agreement test: it put θ UMa, η Cas and 61 Cyg on Hipparcos-2, 0.16–0.70″ from Gaia's place for today). RUWE is high for most
  stars brighter than G 4 and for unresolved doubles (10,386 of the Gaia-sourced stars); there the two missions' proper motions
  differ and neither straight line holds for long, but Gaia's is measured 25 years nearer to now. How much the choice matters:
  for 13,035 of the 100,464 Gaia-sourced Hipparcos stars the two catalogues' places for 2027 differ by over 0.1″ (643 by over 0.5″),
  for 1,633 they differ by over 0.1″ at 2000.0. Nothing is fitted or averaged: every number is one catalogue's, propagated.
- Each place is carried to epoch 2000.0 with the rigorous space-motion formulae (ESA SP-1200 vol. 1 §1.5.5: source parallax, HYG
  radial velocity) and the proper motion re-expressed there. The app (`catalog.js` `starPlace`) now moves stars the same way:
  straight line in space including the radial ("perspective") term, instead of linearly in RA and Dec.
- Record: 13 Float32 (was 9): the old nine, then `dra`, `ddec` (what Float32 rounding of ra/dec lost: up to 0.055″ before),
  `rv`, `src`. The loader takes the field count from `stars.json`, so old 9-field files still load. Drawing vectors are Float64 now.
- Sizes: stars-0 321 → 464 kB (the file loaded at start: +143 kB), stars-1 607 → 877 kB, stars-2 1,297 → 1,873 kB, stars-3
  1,340 → 1,936 kB, stars-4 741 → 1,070 kB; all five 4.31 → 6.22 MB. Star order and `starnames.json` are unchanged.
- Gaia bundle re-built against the corrected stars: 2,967,176 → 2,967,006 stars (index.json 317 → 305 kB; tiles 30.4 MB; the tile
  layout is unchanged). Left out: 99,208 by ESA's Hipparcos pairing, 3,538 by `hyg_gaia_ids.csv`, 18,069 by position. The position
  test is now made at 2016.0 AND at 2000.0, and the allowance for HYG's RA error is gone. Gaia stars within 3″ of a base star with
  V within 1 mag (= would look double): 21 before, 2 now (2.94″ and 2.98″, real neighbours); within 1.5″ at any magnitude 63 → 40.

## Also fixed while verifying (rendering, not data)
`render/stars.js` and `deepstars.js` added the aberration vector to a star's unit vector and then took `asin(hz)` for refraction
without normalising, so with refraction on every drawn star sat (r·β) tan(alt) too high or low: 10.7″ for 61 Cyg at altitude 40°
(measured: drawn 61.7 px from its own selection marker at FOV 2.4′), an arcminute near the zenith. HYG and Gaia stars shared the
error, so they agreed with each other but not with the marker, the angle tool, or the planets. One line each: normalise first.

## Sources and terms
| Data | Source | Terms |
|---|---|---|
| Hipparcos-2 | van Leeuwen 2007, A&A 474, 653; CDS I/311 `hip2.dat.gz`, from the VizieR mirror at CfA (`vizier.cfa.harvard.edu/ftp/cats/I/311/`; CDS Strasbourg answered "Page unavailable" again on 2026-11-24) | The catalogue's ReadMe states no licence. CDS's "Rules of usage of VizieR data" (read from the Internet Archive copy, the site being down): free "in a scientific context" provided the authors and publication are cited; "commercial usage … subject to rules depending of the origin"; A&A tables "free for a scientific usage". So: cite, non-commercial. |
| Hipparcos 1997 (diagnosis only, not in the build) | ESA SP-1200; CDS I/239 `hip_main.dat` | its ReadMe: "License: CC-BY-NC-3.0 IGO" |
| Gaia DR3 astrometry of the paired stars; Gaia Catalogue of Nearby Stars (`external.gaiaedr3_gcns_main_1`); G < 7 sources | ESA Gaia archive, anonymous sync TAP | CC BY-NC 3.0 IGO, credit ESA/Gaia/DPAC (as for the tiles) |
| Reference places in check.mjs §18 | SIMBAD TAP at `simbad.cfa.harvard.edu` (CDS mirror), 21 rows typed in | facts, cited |
Credits panel: new "Star positions" row, and the closing paragraph now says the star files are for non-commercial use.
Archive quirk worth knowing: a join that runs long is cut off WITHOUT an error at 8,192 or 32,769 rows (and COUNT(*) over the join
times out, HTTP 408). `fetch_hipparcos.py` chunks the one join it needs and checks every count against the driving table.

## Verification (2026-11-24)
- `node tools/check.mjs` runs clean; new section 18. Against SIMBAD's J2000 places, 21 stars: **before 17.9″ worst (18 of 21 over
  0.1″); now 19 of 21 within 0.04″.** The two over 0.1″ are Barnard's star 0.165″ and Kapteyn's star 0.141″, and that is SIMBAD:
  its J2000 place is Gaia's moved back 16 years without the radial-velocity term (reproduced to 1e-12°), which for those two is
  0.164″ and 0.141″. Against Gaia itself at 2016.0 the app is within 0.0007″ for all eight Gaia-sourced rows. On 2026-11-24 with
  proper motion applied: worst 0.070″ (α Cen A, the same radial term over 27 years; SIMBAD's α Cen is Hipparcos-2, as here).
  Before → now at J2000: θ UMa 3.200 → 0.000″, η Cas 4.463 → 0.000, χ Dra 3.256 → 0.000, 61 Cyg A 7.930 → 0.026, B 7.914 → 0.025,
  α Cen A 16.510 → 0.006, B 16.204 → 0.006, Proxima 17.896 → 0.012, Sirius 0.210 → 0.000, Vega 0.410 → 0.000, Polaris 0.384 → 0.000,
  Arcturus 0.513 → 0.000.
- Dubhe–Merak 5.37405° → 5.37404° (SIMBAD 5.37403°; today 5.37346°). Pollux–Castor 4.50570° → 4.50563° (SIMBAD 4.50563°; today
  4.50339°). 61 Cyg A–B today 32.83″ → 32.22″ (Gaia's places carried forward: 32.22″). α Cen A–B 19.06″ → 16.47″ at J2000, 9.54″ today as two straight
  lines (their real orbit is ignored, as before).
- Barnard's star: 10.413″/yr averaged over 2026–2036 (Gaia 10.393 in 2016 + 1.3 mas/yr² of perspective acceleration).
- In Chrome at FOV 2.4′, 2026-11-24: 61 Cyg A and B (333 Gaia stars in the field, nearest to A is G 18.0 at 3.9″), θ UMa, η Cas
  (its companion η Cas B, an HYG star, 13.7″ away), χ Dra, Barnard's star: each drawn exactly on its selection marker (0.00 px
  after the refraction fix), no second image. Proper-motion and parallax switches still act (check §15 unchanged in form).

## Left undone / for Seth
1. **Licence of the star files.** `data/stars-*.bin` are needed by the live site and now contain Gaia DR3 (CC BY-NC 3.0 IGO) and
   Hipparcos-2 (cite; scientific use) positions. They can no longer be described as plain CC BY-SA 4.0 (Credits says so). Fine for
   a free teaching site; a decision if the repo's licence statement matters. (Hipparcos 1997, HYG's own source, is CC BY-NC too.)
2. 484 stars keep HYG's place (`src = 0`); the info panel says so. Most of the 39 bright ones are companions whose primaries are right.
3. The deeper Gaia layers (hosted tiles G 12–17, online) do not remove stars that are also in HYG. About 600 of the red dwarfs
   identified here have G ≥ 12, so they are drawn twice at the same spot (before: twice, 8″ apart). `hyg_gaia_ids.csv` has the
   source ids if `build_deep.py` should skip them.
4. Bundled Gaia tile stars are still moved linearly in RA/Dec by `deepstars.js` (stars over 250 mas/yr are in the full-precision
   list). Not measured here. Only the HYG stars got the rigorous motion.
5. Orbital motion of doubles is still ignored (α Cen, 61 Cyg, Sirius, η Cas: straight lines).

## Loader (`js/deepstars.js`)
- `DEEP_TILE_BASE = 'https://stars.sethhopper.com/gaia/v1/'` is the one constant. `?stars=<url>` reads another copy
  (`?stars=http://127.0.0.1:8123/gaia/v1/`), `?stars=off` none (GAVO for everything, as before this pass).
- At start (after `data/gaia/index.json`): ONE request for `manifest.json` (6 s limit). While it is on its way nobody is asked for
  deep stars. Answer -> hosted tiles for every level it lists (to G 17), GAVO for the levels beyond, in the same frame, never both
  for one level (so nothing is drawn twice). No answer -> GAVO for everything exactly as before, one `console.info` line, and no
  second try until the browser comes back online, the Settings switch is flipped, or the page is reloaded. (The browser itself
  prints one network-error line for the failed request; that cannot be suppressed.) Today the address answers 404 with CORS
  headers, so this is the path the app takes until the upload: checked, GAVO behaviour unchanged.
- Hosted tiles: no settling delay (they cost nobody anything), 8 in flight, 80 wanted per view, brighter levels first then nearest
  the centre, queued requests for tiles that left the view dropped and requests in flight cancelled (AbortController) after
  250 ms out of view. Memory LRU shared with the online tiles (now 600,000 stars, about 30 MB). Cache storage
  `planetarium-gaia-tiles-v1` (3,000 tiles, about 60 MB, oldest dropped first) on top of the HTTP cache. Same fade-in (450 ms).
- Three hosted tiles failing in a row (404, timeout 15 s, bad header) -> hosted marked down, GAVO takes over in the next frame; the
  manifest is asked for again after 30 s, 60 s ... 5 min while a view wants deep stars, and the delay only resets when a tile
  actually arrives. Tested with a copy that had the manifest and no tiles: 6 requests, then GAVO. With GAVO down and hosted up the
  depth is 17 (`depthNow()`), read-out "deep stars unavailable ...: showing stars to mag 17.0".
- The Settings switch "Fetch faint stars online" turns hosted tiles off too (they are online). Read-out: "faintest: Gaia DR3,
  deep tiles" to G 17, "Gaia DR3, online (GAVO)" beyond. Info panel: "from the deep star tiles (G 12 to 17)", values rounded as
  the tile stores them until the GAVO look-up answers (by position, as for bundled stars).
- Hosted stars use the same drawing loop as the others (the aberration re-normalisation fix of the astrometry pass applies) and,
  like the bundled and online Gaia stars, move in a straight line in RA and Dec from 2000 (not along a great circle: under
  0.04" in 30 years for the fastest stars away from the poles).
- `planetarium.deep.debug({storage: true, base: '...'})` (console): forget deep stars in memory / Cache storage, switch the
  address: for timing tests.
- **Text not changed** (wording is Seth's): About ("How many stars", "Faint stars, online") and the Settings hint still say the
  stars below 12 come from GAVO. After the switch-over they should say: to 17 from this site's own star tiles
  (stars.sethhopper.com), beyond that from GAVO.

## Upload (the lead does this; nothing here ran a Cloudflare command)
- Upload the CONTENTS of `~/Documents/GitHub/astro-labs-stars/gaia/v1/` to bucket `astro-stars` under the key prefix `gaia/v1/`,
  so that `https://stars.sethhopper.com/gaia/v1/manifest.json` and `.../gaia/v1/0/3/0.bin` exist. Leave out `progress.json`,
  `skip.json`, `files.tsv` (harmless if uploaded). `files.tsv` lists the 82,870 files with bytes and md5 (an R2 ETag of a
  single-part upload is the md5): 82,870 files, 1,548,412,877 bytes.
- `*.bin`: `Content-Type: application/octet-stream`, `Cache-Control: public, max-age=31536000, immutable`, no Content-Encoding (raw).
- `manifest.json`: `Content-Type: application/json`, `Cache-Control: public, max-age=300` (it is the one file that changes: new
  levels, a new skip list). Upload it LAST: the app trusts it, and a manifest ahead of its tiles means failed requests (it would
  fall back to GAVO, but why).
- CORS on the bucket: `Access-Control-Allow-Origin: *`, methods GET and HEAD (already so). The requests are plain GETs without
  custom headers: no preflight.
- Tool: `rclone` (not installed here; `brew install rclone`) with an R2 S3 token:
  `rclone copy ~/Documents/GitHub/astro-labs-stars/gaia/v1 r2:astro-stars/gaia/v1 --exclude manifest.json --exclude progress.json
  --exclude skip.json --exclude files.tsv --transfers 32 --checkers 32 --s3-no-check-bucket --header-upload "Cache-Control: public,
  max-age=31536000, immutable"`, then the manifest alone with `--header-upload "Cache-Control: public, max-age=300"`; then
  `rclone check` (or compare `rclone lsf -R --format ps` with `files.tsv`). 82,870 class-A operations (free tier: 1 million a month).
  `wrangler r2 object put` is one file per call: far too slow for this.
- Raw or pre-compressed: raw. Brotli (`Content-Encoding: br`, measured on tiles: -19 %; gzip -7 %) would save 0.3 GB and 30-100 kB
  a view, at the price of a compress step, a per-object header that must never be wrong, and Cloudflare re-encoding for clients
  that do not accept br. Not worth it at these sizes. Cloudflare does not compress `application/octet-stream` by itself;
  `manifest.json` (139 kB, 21 kB gzipped) is compressed on the fly as JSON.
- Local test before or after: any static server with a CORS header on the parent folder, e.g.
  `python3 -c "import http.server,functools as f;H=http.server.SimpleHTTPRequestHandler;H.end_headers=lambda s,e=H.end_headers:(s.send_header('Access-Control-Allow-Origin','*'),e(s))[1];http.server.ThreadingHTTPServer(('127.0.0.1',8123),f.partial(H,directory='$HOME/Documents/GitHub/astro-labs-stars')).serve_forever()"`
  and `?stars=http://127.0.0.1:8123/gaia/v1/`.
- Backblaze started backing the 1.5 GB of tiles up as they were written; exclude `astro-labs-stars` there if that is not wanted.

## Measured (Chrome 157, 1512 x 828 CSS px = 876 cm², Bortle 4, no Moon; 2026-11-24)
The bucket was empty, so "hosted" = the same files from a local server: (a) plain localhost, (b) localhost with 80 ms added to
every request and 24 Mbit/s shared by all of them (a stand-in for an ordinary connection; 6 connections, where R2 over HTTP/2
allows the 8 the loader uses). GAVO was slow today: median answer 3.5-4 s (1.5 s yesterday), several 25 s time-outs.
Jump from FOV 60° straight to the field; "t90" = seconds until 90 % of the final star count is on screen; "all" = until nothing
is loading and the limit has stopped moving (includes the 450 ms fade and the field correction of density.js, which costs
0.3-0.6 s even with every tile in memory). Cold = memory and Cache storage emptied; warm = memory emptied only.
Cygnus = RA 305.5 Dec +41 (2026-08-12 05:30 UT); pole = north galactic pole (2026-04-17 05:30 UT).
| Field | limit, stars, /cm² | hosted (b) cold: t90 / all, requests, kB | hosted (a) cold | hosted warm (b) | GAVO cold: t90 / all, requests, kB | GAVO warm |
|---|---|---|---|---|---|---|
| Cygnus 5° | 9.72, 1185, 1.35 | no deep stars needed (bundled only) | | | same | |
| Cygnus 2° | 11.77, 1158, 1.32 | no deep stars needed | | | same | |
| Cygnus 1° | 13.83, 1236, 1.41 | **0.66 / 0.58 s**, 9, 185 | 0.62 / 0.53 | 0.91 / 0.78 | **48 s / not complete in 60 s**, 26, 303, 2 failed | 18.6 / 44 (not really warm) |
| Cygnus 40′ | 14.9, 1046-1072, 1.19-1.22 | **0.55 / 0.41 s**, 13, 273 | 0.47 | 0.56 | **38 s to 586 stars, not complete in 60 s**, 23, 250, 4 failed | 6.6 |
| Pole 5° | 12.2, 1166, 1.33 | **0.97 / 0.91 s**, 6, 30 (+36 bundled tiles) | 0.59 / 0.53 | 0.52 | **12.9 / 17.7 s**, 10, 92 | 0.54 |
| Pole 2° | 14.95, 1112, 1.27 | **0.56 / 0.53 s**, 12, 141 | 0.44 | 0.47 | **51 s to 798 stars, not complete in 60 s**, 34, 299, 4 failed | 24 |
| Pole 1° | 18.0, 1224, 1.40 | hosted to 17 in 0.6 s, then GAVO for 17-18: **6.5 s** (11 + 5 GAVO, 188 + 99) | 12.5 | 0.64 | **33.7 / 58 s**, 25, 412 | 1.4 |
| Pole 40′ | 19.65, 1087-1118, 1.24-1.28 | hosted to 17 in 0.6 s, then GAVO for 17-19.5: **36 s** (11 + 24 GAVO, 188 + 354) | 35 | 1.1 | **59 s to 748 stars, not complete**, 39, 503, 3 failed | 3.0 |
- So: everything that ends at G <= 17 fills in 0.5-1 s cold; the density target (1.2-1.4 stars/cm²) is met as before.
  **At the galactic pole the limit passes 17 at a field of about 1.3°**, so pole fields of 1° and less still wait for GAVO for their
  faintest one to five levels (the bright 80 % of the field is there in 0.6 s, and the limit shown holds 1.2 mag past it while
  the rest arrives). In the Milky Way the hosted set covers fields down to about 20′ (the limit was 16.4 at 24′ in Cygnus). By interpolation
  between the pole rows, `--gmax 18` would move the pole's boundary to about 1° for 1.5 GB more, and 19 (2.7 GB on top) to about 45′.
- A session, real wheel and drags (Cygnus, cold, hosted (b)): 60° -> 31′ in nine wheel bursts, then three drags of 500-700 px:
  **20-28 hosted requests, 382-569 kB, 0 failed, 0 cancelled** (+ 41 bundled tiles, 728 kB); request time median 112-118 ms, 90 %
  under 154 ms (80 of that is the added delay). Every stop was 90 % full within 0.05-0.64 s of the wheel stopping and the drags
  showed no empty sky. The same session on GAVO: 15 requests, 182 kB, and the 31′ field held 308 of about 1,100 stars after 43 s.
- Frames. The machine was busy (Steam and a backup at 100 % of a core each), so two samples: quiet, JS per frame median 4.8 ms,
  p95 6.1, max 10.2, frame interval median 8.3, p95 9.8, max 36, none over 50 ms (303 frames, 28 tiles arriving); loaded, median
  8.7, p95 36, max 79, 20 frames over 50 ms. GAVO session: median 3.1, p95 5.0, max 13 (it drew a third of the stars). Steady view
  at 31′ with 21,000 hosted and 31,000 bundled stars in memory for the window: frame 5.5 ms, of which the deep layer 3.4 ms for
  1,104 stars drawn. Not measured on a quiet machine end to end, nor on a slow laptop.
- Not tested: the real bucket (latency, HTTP/2, Cloudflare caching of `.bin`), Safari, Firefox, a phone, a class of 30 at once,
  Cache-storage trimming (3,000 tiles never reached).
