# Planetarium labs: instructor key

Every lab is a preset: `…/planetarium/?lab=<id>` sets the date, place, target, zoom and toggles, opens the
tools it needs, and shows the student a prompt (what to measure, never the answer). The same list is in the
app under **Labs → Labs: classic measurements…**. Add `&instructor=1` to a link to make the Events finder
show times and contact times.

This file gives, for each lab, what the student does, **the value measured in the app** (by the build agent,
in Chrome, on 2026-11-23), the result derived from it, and the true value. Entries marked "integration pass" were
measured the same day by the fourth agent, after the faint-star tiles and the snapping fixes went in; that pass also
re-ran `moonrise` (23:06:18 and 23:08:21 again, 123 s), `lunar-parallax` (1.3402° again), `half-moon` (50.00% at 04:35,
Moon → Sun 89.847°), `romer` (Io gone between 15:05:40 and 15:05:50) and `analemma` from their links.

How the measurements were made, honestly stated:
- **Clicks**: angle-tool end points, the Mark button / `X` key, Swap observers, the Events list, the
  Corrections boxes, the date editor's step buttons and the Labs menu were operated with real mouse clicks and
  key presses.
- **Clock**: the clock was mostly set by script to candidate instants (the same thing as typing a time in the
  date editor) and the picture was then judged by eye from a screenshot. `Shift + ←/→` (±1 s) was used for real
  in the moonrise lab.
- **Read-outs repeated many times** (hour angle to zero, phase to 50.00%, monthly coordinates) were read from
  the info panel by script, stepping the clock the way a student would.
- Io's disappearance was judged by eye once (gone between 15:05:45 and 15:05:55) and then found by script as
  "the moment the app stops drawing Io", which is the same criterion.
- **2026-11-24, later: the Sun, Moon and planets now come from JPL DE440/441 (NOTES.md, "Planets to JPL").** Every lab value that could move was
  recomputed with the app's own code before and after. Rows marked "now" replace the measured ones where the difference is larger than a reading
  error; the by-eye measurements themselves were not repeated. Moved: transit contacts (2012: 13-25 s earlier; 1769: about 55 s earlier; Mercury 2019: 51-58 s later,
  least distance 76.9″ → 73.6″), Eratosthenes' altitudes (+1.5′ both, difference unchanged), Io (6 s), lunar-eclipse contacts (1-2 s), half Moon (9 s).
  Unchanged to the digits given: all angles in the other labs (elongations, oppositions, Kepler, Venus's phases to 0.03″, months, apsides, aberration, parallaxes).
- "Truth" is astronomy-engine (`tools/check.mjs` sections 12–16), JPL Horizons for Io, or the published value.

**2026-11-25 (after a student pass):** every lab now shows one step at a time (“All steps at once” is under *About this measurement*), opens with
the angle tool OFF (press `R`; the two parallax notebook labs excepted) and with the clock stopped at ×1 (so `L` `L` `L` is ×1000). Buttons inside a step
(Swap observers, Outline of the Earth’s shadow, Light-travel time, Go to a date) press the tool’s own control. Stopwatch marks carry the place and the UTC date, are grouped by
place, and give no differences until the student presses the numbers of two marks. An edge of one body to a point of another is labeled as not a diameter.
Changed presets: `romer` (both dates), `canopus` (starts 19 min before the meridian), `kepler-mars` (looks between the Sun and Mars, fewer labels), `elongation` (no Events finder).
Changed prompts: one baseline only (the square-on one) in `lunar-parallax`, `eclipse-two-sites`, the transits and `mars-parallax`. Values re-measured with real clicks and keys that day are marked “25 Nov”; the contact times were stepped to with the model’s values known, and only confirmed by eye (not found blind).

Tools used below: **angle tool** (`R`; snaps to centers, to limbs when you click near the edge of a disc, to
the shadow outline, to the second observer's ghosts and to trail ticks; rows keep following the objects as time
runs), **stopwatch** (`X` marks the clock; differences are listed), **Events finder**, **Two observers**,
**Path of an object**, **Corrections**. Time steps: `Shift + ←/→` 1 s, `Shift + ↓/↑` 1 min, and the clock button
(1 s … 100 yr, synodic and sidereal month, Mars year).

One rule for limb contacts: **refraction off**. With refraction on, discs and gaps are now pressed flat together near
the horizon (since 2026-11-24), so contacts look right, but limb-to-limb sizes of a low Sun or Moon are those of a squashed disc. All contact labs start with refraction off.

---

## Earth and Moon

### `eclipse-timing` Size of the Moon from a lunar eclipse (Aristarchus)
Preset: 2018-07-27 17:50 UTC, Nairobi, Moon tracked, FOV 2.4°, stopwatch. (Zoom to about 0.8° to judge contacts.)
Student marks the four umbral contacts.

| Contact | Measured (UTC) | astronomy-engine |
|---|---|---|
| U1 umbra first touches | 18:24:04 | 18:24:07 (drawn from Nairobi: 18:24:09) |
| U2 totality begins | 19:29:55 | 19:29:53 |
| U3 totality ends | 21:13:38 | 21:13:33 |
| U4 Moon clear | 22:19:22 | 22:19:20 |

- Moon moves its own diameter in U2 − U1 = 65 min 51 s; leading limb crosses the umbra in U3 − U1 = 2 h 49 min 34 s.
- **Umbra / Moon = 2.575** from the timings (from astronomy-engine's contact times: 2.576).
- With the outline on, the angle tool gave umbra limb to limb **1.3213°** and Moon limb to limb **29.836′**:
  ratio **2.657** (model: 2.657). The timing ratio is lower because the Moon's path misses the center of the
  shadow by 6.4′ (also measured with the tool: Moon center to umbra center 6.39′).
- Earth ≈ (2.6 + 1) = **3.6 Moon diameters** (true 3.67). The "+1" is the taper of the shadow.
- The shadow uses the eclipse-prediction model: Earth's radius 6371 + 88 km of atmosphere (1.4% enlargement).
- Other central eclipses: 2000-07-16, 2029-06-26 (umbra/Moon 2.66 and 2.74).

- **Shape (merged in from `eclipse-shape`, 2026-11-28):** step 2 now asks for the edge's shape during the partial phase and a by-eye
  estimate of the circle's size. Measured in the old lab (2019-01-21, Richmond): the edge is a circular arc throughout; umbra / Moon
  limb to limb = 2.754 (model 2.75). Old links `?lab=eclipse-shape` open this lab.

### `moonrise` Angular size of the Moon from its rising time (Aristarchus)
Preset: 2027-09-15 23:04:30 UTC, Quito (on the equator), looking east, full Moon at declination +0.4°,
refraction off, stopwatch.
- Upper limb on the horizon **23:06:18**, lower limb clear **23:08:21** (truth 23:06:17 and 23:08:20): **123 s**.
- 360° × 123 s / (24 h 50 min) = **29.7′**. Angle tool, limb to limb: **29.897′** (info panel 29.9′).
- Distance = 3475 km / 0.00865 rad ≈ **402,000 km** (that evening: 399,300 km from Quito).
- The lunar day, 25 Nov, with the meridian line and the stopwatch: crossings at 05:13:44 and (17 Sept) 05:55:26 UTC, **24 h 41 min 42 s** (model 24 h 41 min 41 s): 360° × 123 s / 88,902 s = **29.9′**.
  The angle tool must be used at mark 2 (a day later the Moon overhead is 30.7′). The "24 h 50 min" is an average, and `months` (another week, the Moon at perigee) gets 25 h 07 min. Away from the equator, or with the Moon far from the celestial equator, the rise is slanted
  and takes longer (other dates in the app: 121–139 s).

### `lunar-parallax` Distance of the Moon from two observers (Lalande and Lacaille)
Preset: 2026-11-24 22:40 UTC, Berlin, second observer Cape Town, ghosts lined up on the stars.
- Moon center to dashed Moon centre: **1.3402°**.
- Baseline square-on to the Moon, measured on *Earth seen square-on*: 8,330 km = 1.307 Earth radii (8,350 used for the figures here): **356,900 km = 56.0 R**. True geocentric distance that night: 360,100 km = 56.5 R.
  (The full chord, 8,735 km = 1.371 R, is only in *About*: 58.6 R.)

### `eclipse-two-sites` Total here, partial there (Hipparchus)
Preset: 2024-04-08 19:09:50 UTC, Richmond (total), second observer Atlanta (partial), atmosphere off.
- The yellow dashed circle is Atlanta's Sun (the real one is behind the Moon, and cannot be snapped to). 25 Nov: Moon center to Atlanta's Moon **5.958′**; Sun's diameter on the dashed circle **31.93′**: the shift is 0.19 of the Sun's width
  (Hipparchus had "a fifth").
- 677 km / 0.001733 rad = **390,700 km**; with the square-on baseline (614 km, measured on *Earth seen square-on*) **354,400 km**. True 359,900 km.

### `moon-apsides` The Moon's oval orbit
Preset: 2026-11-25 21:02 UTC (perigee), Richmond, Events finder on "Moon: perigee and apogee".
- Limb to limb at perigee **33.085′**, at the next apogee (2026-12-11, reached by clicking the event) **28.956′**.
- Ratio of distances 1.143; e = (33.085 − 28.956) / (33.085 + 28.956) = **0.067**.
- True for these two apsides, center to centre: 359,335 and 406,407 km, e = 0.061. The measured value is larger
  because sizes are topocentric and the Moon was below Richmond's horizon both times (the observer is up to one
  Earth radius farther away than the Earth's center). That is the lab's "extra" question.

### `months` Two kinds of month, and the lunar day
Preset: 2026-11-24 14:54 UTC (full Moon), Richmond.
- Full Moons from the Events finder: 2026-11-24, 12-24, 2027-01-22, 02-20, 03-22, 04-20: 147 days / 5 =
  **29.4 d** (dates only; true mean 29.53 d).
- Moon back at the same ecliptic longitude (info panel): **27.40 d** (mean sidereal month 27.32 d; a single month
  differs, and the read-out is topocentric).
- Two meridian crossings (hour angle 0): 2026-11-25 06:01:12 and 11-26 07:08:07 UTC: **25 h 07 min**
  (average 24 h 50 min; the Moon was at perigee and moving fast).

## The Sun

### `half-moon` Distance of the Sun from the half Moon (Aristarchus)
Preset: 2026-12-17 02:00 UTC, Tokyo, Moon tracked.
- The info panel reads **Illuminated 50.00%** from about 04:34:40 to 04:37:00 UTC (it shows 0.01% steps, each about
  1.6 minutes). Exact dichotomy from the model: 04:35:29.
- Sun–Moon angle then (angle tool, center to center): **89.849°** (model 89.8492°).
- 1 / cos(89.849°) = **379**: the Sun is 379 times farther than the Moon (true ratio that day 379.8).
  One 0.01% step of phase is ±0.008° of angle, which is ±5% in the ratio: the lab's point about sensitivity.
- The Sun–Moon angle reaches 90.000° at **04:58:41**, 23 minutes after dichotomy (Tao: "about 18 minutes", an average).
  Aristarchus's 87° would put it 6 hours earlier.
- The phase shown is as seen from the site (not geocentric), so it is consistent with the measured angle.

### `sun-moon-size` Sun and Moon the same size in the sky
Preset: 2024-04-08 18:25 UTC, Richmond (partial phase), atmosphere off since 2026-11-24 (with it on, the Moon's limb outside the Sun is sky-colored and cannot be seen, as in reality). Limb to limb: Sun **31.927′**, Moon **33.698′**
(true 31.93′ and 33.70′). The Moon is 5.5% larger, hence total.

### `eratosthenes` Size of the Earth from the noon Sun
Preset: June solstice of 241 BC (−240-06-22), Syene, second observer Alexandria, refraction off.
- Syene: Sun on the meridian at 09:45:21 UTC, altitude **89° 37′ 59″** (0.37° from the zenith; 89° 36′ 31″ before the JPL positions).
- After Swap observers, Alexandria: meridian at 09:57:16 UTC, altitude **82° 31′ 22″** (was 82° 29′ 54″).
- Difference **7.110°** (latitude difference 7.11°; Eratosthenes used 7.2°). 360 / 7.110 × 5000 = **253,200 stadia**.
- The clock shows local mean time (UTC+2:05:09), because no time zone existed; the date is proleptic Gregorian.

### `sun-apsides` The Earth's oval orbit
Preset: 2027-01-03 02:08 UTC (perihelion). Sun limb to limb **32.515′**; at aphelion (2027-07-05, from the Events
finder) **31.448′**. e = 1.067 / 63.963 = **0.0167** (true 0.0167).

### `obliquity` Tilt of the Earth's axis
Preset: 2026-06-20, Richmond, refraction off.
- Sun on the meridian 2026-06-21: altitude **73° 36′ 25″**; 2026-12-21: **26° 43′ 49″**.
- Half the difference **23.438°** (true obliquity 23.436°); the mean, 50.169°, is 90° − latitude (39.831°).

## The planets

### `zodiac` The planets keep to one band
Preset: 2026-11-24 02:00 UTC, whole sky, ecliptic on. Ecliptic latitude (of date) from the info panel on the 24th of
each month for a year (13 dates; read by script, selecting each body in turn as a student would):

| | Moon | Mercury | Venus | Mars | Jupiter | Saturn |
|---|---|---|---|---|---|---|
| 2026-11-24 | +4.52° | +2.20° | +0.39° | +2.13° | +0.77° | −2.61° |
| largest north | +4.52° | +3.34° (Feb) | +3.24° (Dec) | +4.42° (Feb) | +1.07° (Feb) | −2.24° (Mar–Apr) |
| largest south | −5.00° (Apr) | −4.12° (Jun) | −1.59° (Apr) | −0.52° (Sep) | +0.77° | −2.76° (Sep) |

Largest |latitude| in the year: Moon **5.0°**, Mercury **4.1°**, Venus **3.2°**, Mars **4.4°**, Jupiter **1.1°**, Saturn
**2.8°**. Everything stays within about 5° of the ecliptic. (Monthly sampling misses the extremes of the fast movers:
Mercury can reach about 7° and the Moon 5.3°; these are topocentric, as seen from Richmond.)

### `elongation` Sizes of the orbits of Venus and Mercury (Copernicus)
Preset: 2026-12-20, Richmond. The Events finder's list of greatest elongations is not offered in this lab (it is the answer); Mercury is followed by stepping a day at a time.
- Sun → Venus, stepping a day at a time: maximum **46.950°** on **2027-01-03** (astronomy-engine: 46.95°, 2027-01-03).
- sin 46.950° = **0.731 au** (Venus's distance from the Sun that day 0.72 au; mean 0.723).
- Mercury (integration pass; each date then reached by clicking it in the Events finder, now by stepping; angle tool Sun → Mercury, the row
  follows the two bodies as the date changes):

  | Greatest elongation | Angle | sin = distance from the Sun |
  |---|---|---|
  | 2027-02-03 evening | **18.315°** | 0.314 au |
  | 2027-03-17 morning | **27.629°** | 0.464 au |
  | 2027-05-28 evening | **22.918°** | 0.389 au |

  Mercury's distance from the Sun runs from 0.307 au (perihelion) to 0.467 au (aphelion), which is why the three
  differ: the lab's last question. Clicking an event sets the clock to the instant of greatest elongation.

### `synodic` Periods of the planets (Copernicus)
Preset: Events finder on "Oppositions and conjunctions", starting 2020. Dates listed by the app:
- Mars oppositions 2020-10-13, 2022-12-08, 2025-01-16, 2027-02-19, 2029-03-25, 2031-05-04, 2033-06-28, 2035-09-15:
  5450 d / 7 = **778.6 d** → P = **688 d** (true 687.0).
- Jupiter 2020-07-14 … 2028-03-12 (8 dates): **399.7 d** → P = **11.6 yr** (true 11.86; 7 intervals do not average out
  Jupiter's eccentricity. A full 12-year run does better).
- Saturn 2020-07-20 … 2027-10-18: **378.0 d** → P = **29.6 yr** (true 29.46).
- Venus inferior conjunctions 2020-06-03 … 2031-08-11: **583.7 d** → P = **224.7 d** (true 224.70).

### `retrograde` The retrograde loop of Mars
Preset: 2027-02-19, Mars trail ±150 days in 5-day ticks.
- Stationary ticks (clicking a tick names its date): **2027-01-14** and **2027-03-30**; arc between them **19.33°**.
- Opposition (Events finder): 2027-02-19, midway (true stations about 10 Jan and 1 Apr; 5-day ticks).

### `kepler-mars` Kepler's triangulation of Mars
Preset: 2027-04-06 12:00 UTC, Sun trail with one tick a Mars year later.
- Date 1: Sun → Mars **124.550°** (Mars east of the Sun).
- Angle between the Sun's two places: **43.369°**.
- After +1 Mars year (2029-02-21): Sun → Mars **139.409°** (Mars now west of the Sun).
- 25 Nov, all three again with clicks: 124.550°, 43.369°, 139.408°.
- With the Earth on a circle of 1 au, the two sight lines cross **1.664 au** from the Sun. True 1.661 au.
- The first version of this preset (2026-12-06) had the two sight lines only 4° apart and gave 1.74 for 1.63 au:
  Tao's warning about nearly parallel lines. Pairs between late February and late April 2027 all give within 1%.

### `kepler-earth` Advanced: Kepler I, the Earth's orbit seen from Mars
Preset: 2014-04-08 20:57 UTC (opposition), Mars tracked. Notebook readings: J2000 ecliptic longitudes of the Sun and the selected object,
each with 1′ (1σ) of simulated error from the seed (`lonErr: 1`); the panel's coordinates, distances, sizes, elongation and phase are hidden.
Student records λ0, then 9 returns at +1 Mars yr (2016-02-24 … 2031-03-13); r = sin(λ0 − λM)/sin(λM − λS) in units of Sun–Mars.
Without errors (tools/check-labs.mjs): r from 0.607 to 0.627; circle radius 0.617 → **Sun–Mars at λ0 = 1.622 au** (true 1.622);
**center off by 0.0166 of the radius toward 283°** (Earth's e = 0.0167, aphelion near 283°). With 1′ errors: offset ±0.003, direction ±20°.

### `kepler-orbit` Advanced: Kepler II, Mars's orbit and the law of areas
Preset: 2026-01-01. First dates every two months for two years, each with a partner +1 Mars yr later; Earth from Kepler I's circle.
Without errors: 10 of 12 pairs pass |sin(λ2 − λ1)| ≥ 0.15; **r from 1.383 to 1.665 au, a = 1.524, e = 0.092** (true 1.5237, 0.0934);
circle fit center 0.143 au from the Sun. In a 40-day version of the simulation the angle per day ran 0.44–0.63°/day while r1·r2·Δθ/Δt
stayed at 1.21 ± 1%: equal areas. An ellipse cannot be told from an off-center circle with 1′ data (b/a = 0.9956), and the prompt says so.

**Student pass, 2026-11-26** (fresh agents, clicks and keys only): `kepler-earth` (seed 8458) found λ0 = 198.749°, circle off center by
0.016 of its radius toward 293°, Sun–Mars 1.62 au (about 105 actions). `kepler-orbit` (given c = 0.017, φ = 285°; 10 of 12 pairs kept)
found a = 1.523 au, e = 0.092, circle center 0.142 au from the Sun, angle per two months 25.9° to 37.3° while the swept area held to ±3%
(about 140 actions). Fixed after it: the Circle model started at half size and its diameter was called D like a column (now ⌀); the
opposition row is now said to be the reference, not an Earth point; "9 more dates, to 2031"; the direction asked for is the center seen
from the Sun; the steps say where the date steps and "Same scale on both axes" are; and the notebook has `next( … )` / `prev( … )`, so a
pair recorded on two consecutive rows is worked out without retyping (Kepler II now uses it, with a typed `first` column of 1s).

### `jupiter-mass` Weighing Jupiter
Preset: 2026-11-24 09:00 UTC, Jupiter tracked, angle tool. Measured for Ganymede, reading the angle hourly:
- Greatest elongation on one side **293.6″** (Jupiter at 5.030 au), and again 172 h later: T = **7.17 d** (true 7.155).
- a = 293.6″ × 5.030 au = **1,071,100 km** (true 1,070,400).
- M = 4π²a³ / (G T²) = **1.896 × 10²⁷ kg** (true 1.898 × 10²⁷).

With the notebook (2026-11-24, real clicks on Jupiter and Ganymede, 13 readings 14 h apart; the model was picked by script, its
sliders set by hand): "Sine wave with tilt" through separation against Julian Date gives **A = 291″, P = 7.18 d, tilt 0°**, rms
1.7″. With Jupiter at 5.08 au (the panel's 5.136 au on 24 Nov falling 0.015 au a day), a = 1.07 × 10⁹ m and **M = 1.89 × 10²⁷ kg**
(true 1.898 × 10²⁷; that close is partly luck, 1% in A is 3% in M). The residuals drift by a few arcseconds because
Jupiter came 2% nearer during the week.

### `venus-phases` The phases of Venus
Preset: 2026-06-01 01:30 UTC, Venus tracked, FOV 1.8′. Integration pass: one limb-to-limb measurement with the angle
tool (two clicks on the limb), then the date box's **+1 month** button six times; the measured row follows Venus, so
the diameter can be read each month. Lit fraction and distance from the info panel.

| Date (UTC) | Lit | Diameter, angle tool | Diameter, info panel | Distance |
|---|---|---|---|---|
| 2026-06-01 | 79.5% | **13.29″** | 13.3″ | 1.2557 au |
| 2026-07-02 | 68.7% | **16.12″** | 16.1″ | 1.0350 au |
| 2026-08-02 | 55.4% | **21.08″** | 21.1″ | 0.7917 au |
| 2026-09-02 | 38.1% | **30.55″** | 30.6″ | 0.5462 au |
| 2026-10-02 | 14.1% | **48.81″** | 48.8″ | 0.3418 au |
| 2026-11-02 | 3.1% | **59.13″** | 59.1″ | 0.2822 au |
| 2026-12-02 | 28.7% | **38.44″** | 38.4″ | 0.4340 au |

Diameter × distance is constant (16.69″ au on every row): small and nearly full when far, large and a thin crescent when
near. Inferior conjunction falls between the November and December rows (the crescent flips sides).
("+1 month" from 31 May lands on 1 July local time, hence the dates.)

## The astronomical unit

### `venus-transit-1769` The transit of Venus, 1769 (Halley's method)
Preset: 1769-06-03 19:15 UTC, Point Venus (Tahiti), second observer Vardø, ghosts lined up on the Sun's disc.
Contacts judged with Venus tracked at FOV 0.06°.

| | II (inside) | III (touches limb) | Duration |
|---|---|---|---|
| Tahiti, measured | 19:41:00 | 01:10:33 | 5 h 29 min 33 s |
| Tahiti, model now | 19:40:02 | 01:09:43 | 19,781 s |
| Vardø, measured | 19:28:43 | 01:21:38 | 5 h 52 min 55 s |
| Vardø, model now | 19:27:44 | 01:20:46 | 21,182 s |

- **Difference in duration 23 min 22 s** (model now 23 min 21 s; the measured contacts are from before the JPL positions, when everything came about 55 s later).
- At mid-transit (22:25:30 UTC) Venus to the other observer's Venus: **35.78″**.
- AU = baseline × (1/0.289 − 1/1.015) / shift: with the square-on baseline 10,470 km (*Earth seen square-on* from the Sun at mid-transit, 22:26 UTC), **149.3 million km**;
  with the full 11,410 km chord, 162.8 million km. True 149.6.
- Vardø's first timing was done with refraction on and was visibly wrong (Sun 7° up): hence the rule above.

### `venus-transit-2012`
Preset: 2012-06-05 22:00 UTC, Honolulu and Sydney. At 01:28 UTC: Venus to Sydney's Venus **25.59″**, Venus's diameter
**57.81″**. AU = 7,490 km (*Earth seen square-on* from the Sun at mid-transit, 01:27 UTC) × 2.478 / 25.59″ = **149.6 million km** (full chord 7,620 km: 152.2).

Contacts (integration pass): Venus selected and tracked (`T`), FOV 0.0225° (Venus fills most of the screen), clock stepped
with `Shift + ←/→/↑/↓`, the thread of sunlight between Venus and the limb judged by eye on screenshots 8–10 s either
side of each instant. Venus takes 17.5 minutes to cross the limb, so the eye is good to about ±8 s here.

| | II (just inside) | III (touches limb again) | II → III |
|---|---|---|---|
| Honolulu, by eye | **22:28:05** ± 8 s | **04:27:00** ± 8 s | 5 h 58 min 55 s |
| Honolulu, 25 Nov (stepped to within 2 s of the model, touching confirmed by eye) | **22:27:52** | **04:26:34** | 5 h 58 min 42 s |
| Honolulu, model now | 22:27:50 | 04:26:35 | 5 h 58 min 45 s |
| Sydney (after Swap observers), by eye | **22:34:25** ± 8 s | not judged by eye | |
| Sydney, 25 Nov (stepped to the model's seconds, touching confirmed by eye) | **22:34:12** | **04:26:15** | 5 h 52 min 03 s |
| Sydney, model now | 22:34:12 | 04:26:15 | 5 h 52 min 03 s |

(By eye: before the JPL positions, 13-25 s later than now.) Model first and last contacts now: Honolulu I 22:10:19, IV 04:44:26; Sydney I 22:16:16, IV 04:44:07. The durations differ
by **6 min 42 s** (model). NASA’s geocentric greatest transit is 01:29:36 and 554.4″; the app has exactly that. "Model" = the instant the app's own topocentric Sun–Venus separation equals R_Sun ∓ R_Venus.

### `mercury-transit`
Preset: 2019-11-11 12:30 UTC, Richmond. At 15:19:48 UTC: Mercury to Sun's center **73.6″** (76.9″ before the JPL positions; geocentric least distance
75.9″, as NASA gives; Richmond sees Mercury about 2″ closer to the center), diameter **9.95″**.

Contacts (integration pass): Mercury selected and tracked, FOV 0.0225°, clock stepped with `Shift + arrows`; each contact
bracketed by eye on three screenshots 10 s apart (gap, touching, overlapping).

| Contact | By eye (UTC, before the JPL positions) | Model now, Richmond | Geocentric (astronomy-engine) |
|---|---|---|---|
| I first touch | **12:35:19** ± 5 s | 12:36:10 | 12:35:32 |
| II fully inside | **12:37:00** ± 5 s | 12:37:51 | |
| III touches limb again | **18:01:43** ± 5 s | 18:02:41 | |
| IV last touch | **18:03:24** ± 5 s | 18:04:22 | 18:04:09 |

Mercury crosses the limb in 101 s (Venus in 2012: 17.5 min) and is 9.95″ across against Venus's 57.8″. Richmond's first
contact is 38 s later than the geocentric one because the Sun was only 2° above its horizon: parallax in action.

### `mars-parallax` Parallax of Mars, 1672 (Cassini and Richer)
Preset: 1672-09-05 01:00 UTC, Paris, second observer Cayenne. Mars to Cayenne's Mars: **23.94″** (23.90″ before).
- 6,720 km / 23.94″ = **57.9 million km**; Mars was 0.3812 au away, so AU = **152 million km**
  (square-on baseline 6,610 km: 149.6).

## Light

### `romer` The speed of light from Io
Preset: 2025-08-04 05:10 UTC (six weeks after conjunction), Jupiter tracked, FOV 0.07°; a button in step 5 goes to 2025-12-11 09:50 UTC (a month before opposition). On both dates Io fades
1.5 Jupiter radii from the center, well clear of the limb. (At opposition itself the limb hides Io before the shadow does: that is why not.) The delay of the old preset, 2025-10-01, is 2658 s at 5.326 au.

| | Io gone, light time on | light time off | Delay | Jupiter |
|---|---|---|---|---|
| 2025-08-04 (25 Nov) | 05:25:39 | 04:35:38 | 3001 s | 6.014 au |
| 2025-12-11 (25 Nov) | 10:04:43 | 09:28:28 | 2175 s | 4.360 au |

- c = (6.014 − 4.360) au / (3001 − 2175) s = **299,600 km/s** (to the millisecond: 299,792).
- Rømer's way: the two eclipses are 73 orbits apart; seen with light time on, the interval is 826 s shorter than
  the real one, because the Earth has come 1.65 au closer: the schedule slips by about 11 s per eclipse.
- Check against JPL Horizons (geocentric): Io's partial-umbral phase 15:02:05–15:05:35 on 2025-10-01 and
  03:46:15–03:49:55 on 2026-03-01; the app's half-light instants are 15:03:42 and 03:48:28, and Io is drawn until
  about 12 s after Horizons' "totally eclipsed".
- Do not use a fixed 42.5 h schedule over months with light time **off** and expect zero drift: Jupiter's own
  eccentric orbit shifts the shadow by minutes. Comparing on and off isolates light.

### `aberration` Aberration of starlight (Bradley)
Preset: 2026-03-21, Greenwich, γ Draconis tracked at FOV 0.03° (the info panel then shows 0.01″).
- Declination (J2000) monthly: minimum **+51° 28′ 59.55″** (21 March), maximum **+51° 29′ 39.11″** (21 September):
  half-range **19.78″**, extremes at the equinoxes as Bradley found. (20.5″ × sin 74.9° ecliptic latitude = 19.79″.)
- RA swings ±2.19 s = 20.5″ on the sky, extremes in June and December.
- Aberration off: 19.39″–19.43″ all year (what is left is parallax 0.02″ and proper motion).
- c = 29.78 km/s / 20.5″ = **299,600 km/s**.

## The stars

### `parallax` Distance of a star by parallax (Bessel)
Preset: 61 Cygni A (HIP 104214), aberration and proper motion off, FOV 0.004°.
- Monthly J2000 coordinates trace an ellipse: RA 21h 06m 53.239s–53.285s (0.54″ on the sky), Dec 57.67″–58.14″.
  Semi-major axis **0.287″** → **3.48 pc = 11.4 ly** (catalog 3.49 pc; published parallax 0.286″).
- This recovers the catalog distance by construction; what the lab shows is the size and phase of the loop.

### `barnard-parallax` and `proxima-parallax` (notebook labs)
Presets: Barnard's star from Richmond, 2026-03-01; Proxima Centauri from Cape Town, 2026-01-15. FOV 0.03° (1.8′), star
tracked, ground / atmosphere / refraction / aberration off, parallax and proper motion on. The lab notebook opens with
seeing 0.8″ and simulated measurement noise 0.02″ per star image. Student: separation and position angle from a
background star of their choice, on 12 or so dates over 1.7 years or more; two calculated columns (east = ρ sin θ,
north = ρ cos θ); the "Ellipse with a steady drift" model by hand with the period held at 1 yr; d = 1/p by the student.

Measured 2026-11-24 in Chrome, each lab done twice as two students (new random seed, other reference star, other dates).

| | Barnard, student 1 | Barnard, student 2 | Proxima, student 1 | Proxima, student 2 |
|---|---|---|---|---|
| Seed | 823967 | 860936 | 960894 | 168019 |
| Reference star (Gaia DR3 …) | …061248 | …176256 | …093952 | …533760 |
| Dates | 12, every 55 d, 2026.16-2027.82 | 14, every 47 d, 2026.44-2028.12 | 12, every 61 d, 2026.04-2027.88 | 13, every 57 d, 2026.26-2028.13 |
| **p by hand with the sliders** | **0.54″** | **0.56″** | **0.77″** | **0.78″** |
| distance 1/p | 1.85 pc | 1.79 pc | 1.30 pc | 1.28 pc |
| proper motion | 10.43″/yr | 10.42″/yr | 3.85″/yr | 3.84″/yr |
| rms of residuals (hand fit) | 0.044″ | 0.041″ | 0.033″ | 0.045″ |
| b/a (sin β: 0.473; 0.704) | 0.52 | 0.46 | 0.71 | 0.72 |
| least squares on the same points (check only) | 0.539″, 10.42″/yr | 0.555″, 10.42″/yr | 0.773″, 3.84″/yr | 0.787″, 3.86″/yr |
| truth | 0.547″, 1.83 pc, 10.36″/yr | same | 0.768″, 1.30 pc, 3.86″/yr | same |

The two students differ by **3.6%** (Barnard) and **1.3%** (Proxima) in p by hand; 2.9% and 1.8% by least squares; by 0.1%
and 0.3% in proper motion. Every answer is within 2.4% of the truth. Monte Carlo (`tools/check.mjs` 21, 12 dates, click
error 0.035″): p ± 3.7-4.1%, so two students typically differ by 5-6%.

How it was done, honestly: every end point was a real mouse click near the star and a real click in the magnifier, with the
place of the star's center judged by eye from a screenshot; Record, the date keys (`]`), the column dialogs, the axis and model
menus and the typed slider values were real input. **Scripted:** reading the finished table back; copying a finished notebook
aside and deleting it so that the next "student" started with a fresh random seed; reloading changed source files. Barnard's
first student (an earlier agent) chose the Record columns in the dialog; the other three used `&template=1` for the four
columns. The offline least-squares fit was run only after the hand fit, except for Barnard student 1, where an earlier agent had
run it first (the hand fit then started from the table's own numbers). Proxima student 2 kept a careless second reading (0.1″
off), as a student would. Proxima's field is crowded: in spring 2027 a faint star runs under its image for two readings. The
field's stars take up to about 10 s to arrive (Gaia, online or hosted).

Zooming in to a 40″ field, as three of the students did, makes centering easier.
(These runs were made before the object panel was folded and the Distance row hidden; the panel then showed the distance.)

### `proper-motion` A star that moves
Preset: Barnard's star (HIP 87937; shown under that number, HYG has no names below magnitude 6.5).
- Info panel, 2026-06-01 → 2036-06-01: Dec +4° 46′ 08.97″ → 47′ 52.25″, RA 47.091s → 46.557s: **103.6″ in 10 yr =
  10.36″/yr** (Hipparcos 10.358). 10.36 × 1.82 pc × 4.74 = **89 km/s**.
- Angle tool with Snap off, same 10 years, before the data fix: 100.3″. HYG lists this star's pmdec as 9999.99
  mas/yr (a clipped field); `tools/build_stars.py` now restores the Hipparcos value 10326.93 for this one star.

### `star-colors` The colors of the stars, and their temperatures (color photometry)
Preset: 2027-02-10 02:30 UTC (21:30 local), Richmond, Rigel selected, the notebook open; the same night and the same eleven stars as
`star-spectra`, so the two temperatures can be compared. Draft: one student-agent pass (fixes made).
The filter counts are a model (js/photometer.js): a blackbody at the star's temperature from its Hipparcos type (js/spectro.js starTemp,
the Spectrograph's own; B−V by Ballesteros only for stars with no type), photons counted through Gaussian bands (B 440 nm σ 40,
G 550 σ 36, R 640 σ 64), scaled so G = the clear V counts and an A0 V star (9,700 K) gives B = G = R. data/sptype.txt loads on the
first filter click ("measuring…" until then). Key, no noise (each exposure ~0.5%, so a ratio ±0.01):
- Alnitak O9.5 Ib 31,650 K, B/R 1.76 · Bellatrix B2 III 20,600 K, 1.56 · Rigel B8 Ia 12,500 K, 1.22 · Sirius A0 9,700 K, 1.00
- Castor A2 V 8,840 K, 0.92 · Procyon F5 IV-V 6,510 K, 0.63 · Polaris F7 Ib 6,280 K, 0.60 · Capella G8 III 4,800 K, 0.38
- Pollux K0 III 4,660 K, 0.35 · Aldebaran K5 III 4,050 K, 0.26 · Betelgeuse M2 Ib 3,690 K, 0.21
- Step 5: 3,000 → 4,000 K moves the ratio 0.12 → 0.25; 15,000 → 30,000 K only 1.36 → 1.74. A 1% ratio error is about ±13 K near
  3,500 K and about ±1,300 K near 30,000 K: color temperatures of the hottest stars are uncertain.
- Notebook columns as step 2 names them: A star, B B counts, C R counts; the ratio is the formula `B / C`.

### `star-spectra` Spectra: sorting the stars, and their temperatures (Cannon, Wien)
Preset: 2027-02-10 02:30 UTC (21:30 local), Richmond, Rigel selected, the Spectrograph card open. Draft: not yet run by student agents.
The spectra are models (js/spectro.js): a blackbody at the temperature of the Hipparcos type, with schematic lines. Key (type, model T,
peak 2.898e6 / T):
- Alnitak O9.5 Ib, 31,650 K, 92 nm · Bellatrix B2 III, 20,600 K, 141 nm · Rigel B8 Ia, 12,500 K, 232 nm · Sirius A0 V, 9,700 K, 299 nm
- Castor A2 V, 8,840 K, 328 nm · Procyon F5 IV-V, 6,510 K, 445 nm · Polaris F7 Ib, 6,280 K, 461 nm
- Capella G8 III, 4,800 K, 604 nm · Aldebaran K5 III, 4,050 K, 715 nm · Betelgeuse M2 Ib, 3,690 K, 785 nm
- The six hottest peak at or beyond the left end of the 300–1000 nm view: only a lower limit on T. Peaks read by eye on the M star sit
  off the continuum's because the TiO bands cut into the top of the curve.
- Line markers: He II 468.6 only in Alnitak (weak); He I 447/588 strongest in Bellatrix; Hβ deepest in Sirius and Castor; Ca II K
  deep from Procyon on; Na D and the G band in Capella and Aldebaran; TiO only in Betelgeuse.
- The cool-end rules, model depths below the continuum: Hδ 410 vs G band 430: Procyon 0.15 vs 0.11, Polaris 0.11 vs 0.16 (F: Hδ at least
  half the G band), Capella 0.05 vs 0.42 (G). Ca I 422.7 vs G band: Capella 0.17 vs 0.42 (G), Aldebaran 0.44 vs 0.29 (K). Pollux (K0 III) was
  dropped after the first student run: at the G/K boundary it fails the rule (0.25 vs 0.41).

### `binaries` Weighing stars: an eclipsing and a spectroscopic binary (Goodricke, Vogel)
Preset: 2027-10-22 11:30 UTC, Richmond, Algol (HIP 14576) selected, equatorial mount, ground and air off, the Spectrograph card open,
the notebook (template: hours since the lab's start, counts). Built to fit one 50-minute class (Part A ~20 min, Part B ~25), write-up
after. After one student-agent pass (which took far longer than a class) it was cut down: one eclipse at half-hour steps, a button to
the next one, eight button times for Spica, its period given. Both stars are models (js/variables.js Algol; js/spectro.js SB2).
- Part A, Algol (GCVS 5.1 elements, seed 0): V 2.12 out of eclipse, 3.39 at primary minimum, so 69% of the light lost; the eclipse lasts
  0.14 P = 9.6 h first to last contact; minima 2027-10-22 18:50 UTC (7.3 h after the start, so the drop begins ~2.5 h in) and
  10-25 15:39 UTC (76.2 h; the "Jump to Oct 25, 12:00" button lands ~3.7 h before it); P 2.8673 d = 68.82 h. A student's seed moves the
  minima by at most about ±1.5 h (σ ~30 min) and P by ~1e-5. A 0.06 mag secondary eclipse half a period later (optional).
- Part B, Spica (circular model; Tkachenko et al. 2016: P 4.0146 d, M 11.43 + 7.21 M☉, i 63.1°, so K1 123, K2 196 km/s; seed 0):
  velocities star 1 / star 2 at the eight button times (h after the start): 60.5: 110/−173 · 72.5: 118/−186 · 84.5: 58/−91 ·
  96.5: −35/58 · 108.5: −107/174 · 120.5: −117/189 · 132.5: −58/95 · 144.5: 36/−54 (the closest pair is 89 km/s, 0.17 nm, apart).
  He I 587.56 swings ±0.241 nm (deep line) and ±0.384 nm (shallow); M1/M2 = K2/K1 = 1.59; (M1+M2) sin³i = 13.5 M☉; sin³ 63.1° = 0.709;
  M1 + M2 = 19.0, M1 11.7, M2 7.3 M☉ (the published 11.43 and 7.21 differ because the real orbit is eccentric, e = 0.12). A student's
  seed moves K by ~2%, the phase by ~0.02 cycle. Pins to ±0.01 nm give masses good to ~10%. The model draws Spica's lines at 0.3 of a
  single star's width and with 0.4% noise so the second star's dip (about 0.045 deep) is clear; the card's y-axis starts just below
  the deepest dip when dividing by the continuum.
- Last step: an eclipse means i ≈ 90°, so sin³ i ≈ 1 and the masses need no outside measurement of the tilt.

### `hr-diagram` Build the H–R diagram, and find the sizes of stars (Hertzsprung, Russell)
Preset: 2027-02-10 02:30 UTC (21:30 local), Richmond, Alhena (the comparison, V 1.93, given in step 2) selected, the notebook open, ground
and air off (any star at any hour). Twenty stars: ten main sequence (σ Ori O9.5 V to Lalande 21185 M2 V), five giants (Mirzam, Bellatrix,
Capella, Pollux, Aldebaran), four supergiants (Rigel, Polaris, Wezen, Betelgeuse) and the catalogue's only white dwarf, Van Maanen's
Star (V 12.4; Sirius B and Procyon B are not in it). Saiph was left out: a hot supergiant whose V-band radius comes out dwarf-sized
(T too low from its color, L too low without a bolometric correction) would muddle step 6. Draft: not yet run by student agents.
Chain, all notebook formula columns, typed as the card gives them (A star, B B, C G, D R counts, E distance (Record's "Distance of a
star, from its parallax", pc), F "T in K" (no unit: the parser has no kelvin, and a K unit would leave K⁻² on R), G m `1.93 - 2.5 *
log(C / <Alhena's G>)`, H "abs M" `[G] - 5 * log(E / 10)` (bare G is the gravitational constant), I L `10^((4.83 - H) / 2.5)`, J R
`sqrt(I) / (F / 5772)^2`). The card names the stars as Record writes them (Tabit = π³ Ori, Ran = ε Eri); all twenty are found by
search (Groombridge 1618 added to the faint-name list, with Gmb 1618 / GJ 380). The Sun is measured too: B, G, R, Record, and its
distance typed (1 AU = 0.000004848 pc): T 5,780 K, M 4.83, L 1.
- T = 9410 / (0.98 − ln(B/R)): a least-squares fit of ln(B/R) = A − C/T to the photometer model on 3,000–10,000 K (A 0.9785,
  C 9412); within 1% there, 9,880 at 10,000 K, 11,620 at 12,000, 13,980 at 15,000, 17,270 at 20,000, 22,040 at 30,000.
- m = 1.93 − 2.5 log(G / G_Alhena), M = m − 5 log(d / 10 pc), L/L☉ = 10^((4.83 − M)/2.5) (V band only), R/R☉ = √L / (T/5772)².
Key, no noise (T from the formula, the type's T in parentheses where they differ; M; L; R):
- Main sequence: σ Ori 22,660 (31,650), −3.82, 2,870, 3.5 · Regulus 13,230 (14,000), −0.57, 144, 2.3 · Sirius 9,600, 1.45, 22, 1.7 ·
  Castor 8,800, 0.61, 49, 3.0 · Procyon 6,530, 2.67, 7.3, 2.1 · π³ Ori 6,410, 3.66, 3.0, 1.4 · χ¹ Ori 5,930, 4.70, 1.13, 1.00 ·
  ε Eri 5,040, 6.18, 0.29, 0.70 · Groombridge 1618 3,980, 8.16, 0.047, 0.45 · Lalande 21185 3,550, 10.46, 0.0056, 0.20
- Giants: Mirzam 20,370 (26,000), −3.92, 3,150, 4.5 · Bellatrix 17,620 (20,600), −2.80, 1,130, 3.6 · Capella 4,800, −0.51, 137, 17 ·
  Pollux 4,660, 1.08, 32, 8.6 · Aldebaran 4,040, −0.68, 160, 26
- Supergiants: Rigel 12,040 (12,500), −6.93, 50,700, 52 · Polaris 6,300, −3.62, 2,390, 41 · Wezen 6,190, −6.63, 38,500, 171 ·
  Betelgeuse 3,680, −5.47, 13,200, 282 (about 282 Suns across)
- White dwarf: Van Maanen's Star 6,170, 14.22, 0.00018, 0.0116 (about 1.3 Earths across)
- Step 6: stars the Sun's size lie on a diagonal through the Sun (L ∝ T⁴ at fixed R): bigger stars up and to the right.

### `canopus` A star you cannot see from Greece (Aristotle, Posidonius)
Preset: 100 BC, Rhodes, second observer Alexandria, refraction off.
- Canopus on the meridian: Rhodes **0° 53′ 57″**, Alexandria **6° 07′ 45″**: difference **5.230°** (latitudes differ by 5.23°).
- 25 Nov, with keys: meridian at 19:49:25 (Rhodes) and, after Swap, 19:42:55 UTC (Alexandria; step back).
- 360 / 5.23 × 5000 = 344,000 stadia; Posidonius's 7.5° gives 240,000.
- With refraction on, Canopus at Rhodes stands at 1° 16′.

### `clusters` Star clusters: main-sequence fitting and the turnoff (Hyades, Pleiades, Praesepe)
Preset: 2027-02-10 02:30 UTC (21:30 local), Richmond, looking at the Pleiades (fov 40°: Hyades and Pleiades together; Praesepe low in
the east), the notebook open. Draft: not yet run by student agents. js/labs/clusters.js rings 52 members (data/clusters.json from
tools/build_clusters.py: Gaia Collaboration 2018, A&A 616 A10 members, G and BP−RP from Gaia DR2 via GAVO; G < 12; up to 6 of the
brightest per cluster, then one star per 0.1 mag of BP−RP from the middle of the main sequence), and while the lab runs the photometer
measures a ringed star from its own Gaia photometry (phot.override): G − A_G and a temperature from the dereddened BP−RP (→ B−V →
Ballesteros, as any star without a type), so bright HYG members and faint Gaia-tile members are on one footing. Record offers the
star's cluster and its last G exposure in that cluster's own column (optional readings: blank for the other two).
Key, no noise (m = 25 − 2.5 log G counts):
- Color R/B: Hyades 1.05 (bluest) to 4.66, giants 2.45, 2.59 (m 3.4, 3.3); Pleiades 0.83 to 2.05; Praesepe 0.92 (a blue straggler),
  then 1.05, giants 1.82, 2.27, 2.33.
- Fit over R/B 1.4–2.1 (the Hyades' bluer stars have evolved): Pleiades Δm ≈ 2.24, d ≈ 133 pc (Gaia parallax 136); Praesepe Δm ≈ 3.07,
  d ≈ 195 pc (186). The Hyades' higher metallicity shifts the fit by about 0.1–0.2 mag in the full member lists; accept 120–155 pc.
- Turnoff (table in step 6): the bluest main-sequence point of the MIST v1.2 isochrones (Choi et al. 2016, ApJ 823, 102), [Fe/H] = 0,
  in Gaia DR2 BP−RP (tools/build_clusters.py --turnoff), turned into this photometer's R/B. Pleiades 0.83 → ~160 Myr (Gaia Collaboration
  2018: 98 Myr; lithium depletion 112–125 Myr); Hyades 1.05 → ~0.8 Gyr (790 Myr); Praesepe 1.05 → ~0.8 Gyr (710 Myr), its 0.92 star a blue
  straggler. Chamukuy (R/B 1.32, m 3.3) is well above the band: an evolved star, not the turnoff.
- Notebook columns as step 2 names them: A star, B cluster, C B counts, D R counts, E/F/G Hyades/Pleiades/Praesepe G; then H = D / C,
  I/J/K = 25 − 2.5 log10(E/F/G).

## Standard candles

All five are notebook labs with a simulated **photometer**: the panel of the selected object shows the counts collected in one
exposure, 10^(−0.4 (m − 25)), with photon noise and a 0.5% wobble seeded by the notebook seed and the clock second. Students turn counts
into magnitudes against a comparison star of their choice: m = m_c − 2.5 log(N / N_c). Every light curve is a **model** (js/variables.js):
for the variables a smooth curve through GCVS 5.1's range, period, epoch of maximum and rise time; for the supernovae, published explosion
dates and peaks with a typical shape between. The keys below are the models' values. **Each student's model is shifted** by their
notebook seed (js/variables.js `jitterOf`, 1σ, capped at 2.5σ): variables' mean ±0.05 mag, amplitude ±4%, phase ±0.03 cycle,
period ±0.01%; M31 V1 mean ±0.08 mag, period ±0.1 d; supernovae peak ±0.05 mag, peak date ±0.5 d. So a careful student lands within
about ±2–4% of the distances below (more with sparse sampling), and no two students agree exactly. Hidden in all five: Magnitude now (and Variable, the catalog's period, in the Cepheid labs).

**Student pass, 2026-11-26** (three fresh agents with the lab link only, clicks and keys, no scripts): `cepheid-distance` got P 5.36 d,
mean 3.93, 291 pc from 24 readings over 21 days (about 140 actions); `sn-types` called 2011fe Ia and 2023ixf II and found the Ia 2.83 times
more luminous (45 readings); `cepheid-calibrate` (three stars measured, five given as classmates' values) fitted slope −2.67 and −3.59
at log P = 1, and put Andromeda at 720 kpc. Fixed after it: answer leaks (search showed the Cepheids' magnitudes; M31 V1's note gave its
mean), `log10(` and the unit `counts` in formulas, the comparison-star direction for δ Cep, "average a few readings" now says to step a
second between them, `]` / `>` step keys in the prompts, `sn-types` asks for fewer points and separate graphs, ℓ Car and other
variables without a proper name are named. Left: Record closes the date box (use the keys), and an intro student will spend 1–2 hours
on the calibration lab even when shared in a group.

### `cepheid-distance` δ Cephei with the period–luminosity law
Preset: 2026-09-01, δ Cep tracked, FOV 12°, ground and air off. Also hidden: Distance.
Model: P = 5.366208 d, V 3.48 to 4.37, mean 3.925. Benedict et al. (2007): M_V = −2.43 (log P − 1) − 4.05 = **−3.39**; m − M = 7.32,
**d ≈ 291 pc**. Catalog (Hipparcos) distance 265 pc; HST parallax 273 pc. (The difference: no dust correction, A_V ≈ 0.2.)

### `rr-lyrae` RR Lyrae in one night
Preset: 2026-07-15, RR Lyr tracked, FOV 3°. Also hidden: Distance.
Model: P = 0.5668678 d (13.6 h), V 7.06 to 8.12, mean 7.59, rise 19% of the cycle (2.6 h). With M_V = +0.6: m − M = 6.99, **d ≈ 250 pc**.
Catalog distance 289 pc.

### `cepheid-calibrate` Calibrate the law, then Andromeda
Eight calibrators with their catalog (Hipparcos) distances and model mean V (log P; M = m − 5 log(d/10 pc)):

| Star | P (d) | log P | mean V | d (pc, catalog) | M |
|---|---|---|---|---|---|
| δ Cep | 5.366 | 0.730 | 3.93 | 265 | −3.19 |
| η Aql | 7.177 | 0.856 | 3.91 | 424 | −4.23 |
| ζ Gem | 10.151 | 1.007 | 3.90 | 422 | −4.23 |
| β Dor | 9.843 | 0.993 | 3.77 | 309 | −3.68 |
| ℓ Car | 35.556 | 1.551 | 3.71 | 479 | −4.69 |
| X Sgr | 7.013 | 0.846 | 4.55 | 302 | −2.85 |
| Y Sgr | 5.773 | 0.761 | 5.75 | 379 | −2.15 |
| T Vul | 4.435 | 0.647 | 5.75 | 369 | −2.09 |

Least-squares line: **M = −2.68 (log P − 1) − 3.59** (Benedict: slope −2.43, −4.05 at log P = 1). The zero point is about 0.45 mag
too faint, mostly dust (Y Sgr, T Vul, X Sgr sit behind 0.5–0.8 mag). M31 V1: P = 31.4 d (log P 1.497), mean V 19.40; with the
least-squares law M = −4.93, m − M = 24.33, **d ≈ 735 kpc**; with Benedict's law 855 kpc. Today's value: about 765 kpc.
Hubble (1925): 285 kpc; his calibration was about 2 mag too faint (two kinds of Cepheid were not yet told apart).

### `sn-ia` A Type Ia as a standard candle
Preset: 2011-08-25 03:00 UTC, SN 2011fe tracked, FOV 0.6°.
SN 2011fe model: explosion JD 2455796.687, **V peak 9.99 on JD 2455817.0** (2011 September 12), 0.62 mag down 15 days later.
With M101 at m − M = 29.19: **M_peak = −19.20**. SN 2014J (M82): peak V 10.44 on JD 2456692.2 (2014 February 2); with
M = −19.20, m − M = 29.64, **d ≈ 8.5 Mpc**, against M82's TRGB distance of 3.5 Mpc: about 1.9 mag of dust in M82 dims it.

### `sn-types` Two supernovae in M101
SN 2011fe (Ia): rises 20 days to V 9.99, fades about 2.6 mag in the next 60 days, then 0.025 mag/day.
SN 2023ixf (II): first light MJD 60082.788, V peak 11.11 about 6 days later, slides about 1 mag over a 65-day plateau, drops about
2.2 mag between 75 and 95 days after the peak, then 0.0098 mag/day. Peaks: M = −19.20 and −18.08, so the Ia is **2.8 times** more luminous.

### `hubble` The Hubble law (Slipher, Hubble)
Preset: 2027-04-15 02:00 UTC (10 pm in Richmond), M101 tracked, FOV 1.2°, the Spectrograph open. Velocities are measured with the
Spectrograph on a **model** galaxy spectrum (`js/spectro.js` `makeGalaxy`: old-star continuum, Ca II H and K, G band, Mg b, Fe, Na D,
weak Balmer absorption; spirals add Hα, [N II], [O II] emission), every line at (1 + z) with z OpenNGC's. Distances come from the
angular size with a true diameter the student calibrates on M101 (6.85 Mpc, the sn-ia lab's Cepheid distance). Key, from the catalogue:
- Velocities (cz): M101 +243, M82 +219, M31 −300 km/s (blueshifted: the discussion point). The eleven: NGC 4254 (M 99) 2,428;
  NGC 5987 3,010; NGC 5908 3,348; NGC 5533 3,875; NGC 3646 4,263; NGC 2998 4,770; NGC 4921 5,471; NGC 3891 6,290; NGC 2955 7,094;
  NGC 4662 6,975; NGC 6195 8,991 km/s. Pinning the K line to ±0.1 nm is about ±80 km/s.
- M101: 23.99′ at 6.85 Mpc, so D ≈ 47.8 kpc. Distances from d = D / θ: 32.6, 42.8, 48.8, 57.5, 53.2, 67.3, 83.8, 95.5, 103.4, 89.8,
  114.1 Mpc (same order). Fit through the origin: **H0 ≈ 72 km/s/Mpc**, 1/H0 ≈ **13.6 billion years**.
- Calibrated on M31 instead (177.8′ at 0.78 Mpc, D ≈ 40.3 kpc): H0 ≈ 85, 11.5 billion years: the assumption sets the answer.
The galaxies were chosen as spirals of cz 2,400–9,000 km/s whose catalogue sizes give a sensible H0 with M101's diameter: a random set
of spirals of all sizes would give a much lower H0, because a sample picked by apparent size favors big galaxies.

## Time and the calendar

### `sidereal-day`
Preset: 2026-11-24, Richmond, meridian on. Aldebaran at hour angle 0: 2026-11-24 06:04:11 and 11-25 06:00:15 UTC:
**23 h 56 min 04 s**. Sun, noon to noon: **24 h 00 min 01 s** on 3–4 November, **24 h 00 min 29 s** on 24–25 December.

### `analemma`
Preset: 2026-01-01 12:00 EST, Richmond, Sun trail of 37 ticks 10 days apart, "in the sky here".
- Top tick 2026-06-20, bottom tick 2026-12-17; angle between them **46.83°**; half is **23.4°**.
- Widest pair of ticks (2026-02-10 and 2026-11-07): **7.68°**, about 31 minutes of time in all (true extremes of the
  equation of time −14.2 and +16.4 min).
- The figure sits east of the meridian because Richmond is 9.9° west of the center of its time zone.

### `polaris-latitude`
Preset: 2026-11-24, Richmond, refraction off. Polaris hourly over a day: altitude **39.213°** to **40.448°**.
Mean **39.830°** (latitude 39.83°); Polaris is **0.62°** from the pole.

### `precession-pole`
Preset: 2701 BC, Giza. Declination of date: Thuban **+89° 26′ 06″** (0.57° from the pole), Polaris +64° 04′.
Polaris by century: +88° 47′ (1900), +89° 16′ (2000), **+89° 33′ (2100, closest)**, +89° 17′ (2200), +84° 57′ (3000).
The app stops at the year 3000, so Vega as pole star cannot be shown.

### `precession-equinox` (Hipparchus)
Preset: 294 BC, Alexandria, Spica. Ecliptic longitude of date: **172.00°** (294 BC), **174.29°** (129 BC),
**204.21°** (2026). So Spica was 8.0° and then 5.7° short of the autumn equinox, as Timocharis and Hipparchus
recorded (8° and 6°). Rate 2.29° in 165 years = **1.39° per century = 50.0″/yr**; period 25,900 years.

---

## Rungs of Tao's ladder and where they are

| Rung (Tao) | Lab |
|---|---|
| Aristotle: round shadow in lunar eclipses | `eclipse-timing` (merged 2026-11-28) |
| Aristotle: stars seen in Egypt but not Greece | `canopus` |
| Eratosthenes | `eratosthenes` |
| Aristarchus: eclipse duration → Moon's distance and size | `eclipse-timing` |
| Aristarchus: the Moon takes 2 minutes to set | `moonrise` |
| Sun and Moon the same angular size | `sun-moon-size` |
| Half Moon (angle, and Aristarchus's timing version) | `half-moon` |
| Lunar day 24 h 50 min; synodic vs sidereal month (Tao's corrections) | `months` |
| Planets stay in the zodiac | `zodiac` |
| Copernicus: synodic → sidereal periods; orbit sizes | `synodic`, `elongation`, `retrograde` |
| Kepler: Mars 687 days apart | `kepler-mars` |
| Transit of Venus, 1761/1769 | `venus-transit-1769` (also 2012, Mercury) |
| Rømer / Huygens: Io | `romer` |
| Parallax of nearby stars (Bessel) | `parallax` |
| Hubble's law | the Hubble's-law panel (other module) |
| Not in Tao, added: Hipparchus's eclipse, lunar parallax, Mars 1672, Bradley, proper motion, precession, sidereal day, analemma, obliquity, apsides, Jupiter's mass, phases of Venus | see above |

Not reproducible in a planetarium, and why:
- **Main-sequence fitting** (Tao's rung 7): it needs cluster color–magnitude data with membership, which the star
  catalog does not have. (Cepheids and Type Ia supernovae, rung 8, are now labs: see Standard candles, with light curves that are
  models built on catalog and published numbers.)
- **Al-Biruni's horizon dip from a mountain**, ships hull-down: not sky observations; the app has no terrain or
  observer height effects on the horizon.
- **Vega as pole star (AD 14000)**: outside the ±3000-year range in which the ephemeris is trusted.
- **Wendelen's telescopic half-Moon timing**: same as `half-moon`; the app has no way to model the eye's
  difficulty in judging a straight terminator, which was the real limit.

---

## What the object panel does not show during a lab

While a lab runs, rows that are its result read "hidden during this lab" (`js/labs/hidden.js`), and the notebook's Record does not
offer them. Rows the prompt tells the student to read stay. `&instructor=1` on the link shows everything; closing the lab restores
it. The "Look it up" links are left. Checked by starting every lab and reading the panel (2026-11-24).

| Lab | Hidden | Why; what stays on purpose |
|---|---|---|
| `eclipse-timing`, `eclipse-two-sites` | Distance, Light time, Angular diameter; `eclipse-timing` also Magnitude | sizes are measured, the Moon's distance is the result; the magnitude would show the contacts |
| `moonrise` | Angular diameter, Rise / Set, Transit, Hour angle | the result; the lunar day is timed (Hour angle reads 0 at the answer). No “Hide the ground” button |
| `lunar-parallax`, `moon-apsides`, `sun-apsides`, `sun-moon-size` | Distance, Light time, Angular diameter | the results |
| `months` | Rise / Set, Transit, Hour angle | crossings are timed at the meridian line |
| `sidereal-day`, `analemma` | Rise / Set, Transit | crossings are timed; Hour angle stays (the prompt uses it) |
| `half-moon` | Elongation, Distance, Light time | Illuminated stays: the prompt uses it |
| `eratosthenes`, `canopus` | Rise / Set, Transit | Transit gives the noon altitude; Az / Alt stays |
| `obliquity`, `polaris-latitude` | Rise / Set, Transit, both RA / Dec rows | the declination is the tilt, or Polaris's distance from the pole |
| `elongation` | Elongation | the result |
| `cepheid-distance`, `rr-lyrae` | Magnitude now, Variable, Distance | the light curve and the distance are the results; comparison stars' Magnitude stays |
| `cepheid-calibrate` | Magnitude now, Variable | Distance stays: it is the calibration |
| `sn-ia` | Magnitude now | the peak is measured |
| `sn-types` | Magnitude now, Type | the type is the result |
| `hubble` | Redshift z, c × z, Radial velocity (object panel); z and cz columns and the cz filter in the Hubble's-law panel; the redshift in the Spectrograph | the velocity is measured; Size stays (the distances use it) |
| `kepler-mars` | Elongation, Distance, Light time | the angle is measured, Mars's place is the result |
| `jupiter-mass` | From Jupiter (moons) | the separation; Jupiter's Distance stays: the prompt uses it |
| `venus-phases` | Angular diameter | measured; Illuminated stays |
| `venus-transit-*`, `mercury-transit` | Angular diameter, Light time | minutes × c gives the AU; the distances in au are given in the prompt |
| `mars-parallax` | Light time | the same; Distance in au is given |
| `romer` | Light time, Seen vs. actual, Spot crosses center | the delay is the result (the Red Spot’s times shift by exactly it); Distance stays |
| `parallax`, `barnard-parallax`, `proxima-parallax` | Distance, Parallax, Proper motion (every star) | the results; RA / Dec to 0.01″ stays for 61 Cygni only |
| `proper-motion` | Proper motion, Distance, Parallax | the distance is the student’s own, from the Barnard lab, or the instructor’s |
| `star-colors` | Color index, spectral type, temperature | the color is what the lab measures |
| `star-spectra` | Color index | B−V gives the temperature; the spectrograph also prints no type and offers no line labels |
| `clusters` | Magnitude, Color index, Distance, Parallax, Proper motion, Radial velocity, Variable | the brightness and color are measured; a member's parallax would give the cluster's distance |
| `binaries` | Variable, Magnitude (and Magnitude now), Radial velocity; the Spectrograph prints no type and no “double-lined” | Algol's period and depth are what Part A measures; Spica's catalogued velocity is the pair's; the types would name the answer |
| `hr-diagram` | Color index, spectral type, temperature, Magnitude (and Magnitude now, Variable) | measured: the comparison's V is in the prompt. Distance stays: it is given (the parallax labs measure it) |
| `zodiac`, `synodic`, `retrograde`, `aberration`, `precession-pole`, `precession-equinox` | nothing | their rows are the raw readings |

Also not offered: date-box steps that are the answer (`months` and `moonrise`: synodic and sidereal month; `moonrise`, `sidereal-day`: sidereal day, and the keys `{` `}` there; `synodic`, `retrograde`: Mars year),
and the greatest-elongation list in `elongation`. `&instructor=1` brings them back.
