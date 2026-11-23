# Planetarium labs: instructor key

Every lab is a preset: `…/planetarium/?lab=<id>` sets the date, place, target, zoom and toggles, opens the
tools it needs, and shows the student a prompt (what to measure, never the answer). The same list is in the
app under **Labs → Labs: classic measurements…**. Add `&instructor=1` to a link to make the Events finder
show times and contact times.

This file gives, for each lab, what the student does, **the value measured in the app** (by the build agent,
in Chrome, on 2026-11-23), the result derived from it, and the true value.

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
- "Truth" is astronomy-engine (`tools/check.mjs` sections 12–16), JPL Horizons for Io, or the published value.

Tools used below: **angle tool** (`R`; snaps to centres, to limbs when you click near the edge of a disc, to
the shadow outline, to the second observer's ghosts and to trail ticks; rows keep following the objects as time
runs), **stopwatch** (`X` marks the clock; differences are listed), **Events finder**, **Two observers**,
**Path of an object**, **Corrections**. Time steps: `Shift + ←/→` 1 s, `Shift + ↓/↑` 1 min, and the clock button
(1 s … 100 yr, synodic and sidereal month, Mars year).

One rule for limb contacts: **refraction off**. The Sun and Moon are drawn as true circles even when refraction
lifts and squashes things near the horizon, so with refraction on a planet near the limb of a low Sun is
drawn a few arcseconds from where the contact geometry says. All contact labs start with refraction off.

---

## Earth and Moon

### `eclipse-timing` Size of the Moon from a lunar eclipse (Aristarchus)
Preset: 2018-07-27 17:50 UTC, Nairobi, Moon tracked, FOV 2.4°, stopwatch. (Zoom to about 0.8° to judge contacts.)
Student marks the four umbral contacts.

| Contact | Measured (UTC) | astronomy-engine |
|---|---|---|
| U1 umbra first touches | 18:24:04 | 18:24:05 (drawn from Nairobi with light time: 18:24:08) |
| U2 totality begins | 19:29:55 | 19:29:52 |
| U3 totality ends | 21:13:38 | 21:13:32 |
| U4 Moon clear | 22:19:22 | 22:19:19 |

- Moon moves its own diameter in U2 − U1 = 65 min 51 s; leading limb crosses the umbra in U3 − U1 = 2 h 49 min 34 s.
- **Umbra / Moon = 2.575** from the timings (from astronomy-engine's contact times: 2.576).
- With the outline on, the angle tool gave umbra limb to limb **1.3213°** and Moon limb to limb **29.836′**:
  ratio **2.657** (model: 2.657). The timing ratio is lower because the Moon's path misses the centre of the
  shadow by 6.4′ (also measured with the tool: Moon centre to umbra centre 6.39′).
- Earth ≈ (2.6 + 1) = **3.6 Moon diameters** (true 3.67). The "+1" is the taper of the shadow.
- The shadow uses the eclipse-prediction model: Earth's radius 6371 + 88 km of atmosphere (1.4% enlargement).
- Other central eclipses: 2000-07-16, 2029-06-26 (umbra/Moon 2.66 and 2.74).

### `eclipse-shape` The Earth's round shadow (Aristotle)
Preset: 2019-01-21 04:05 UTC, Richmond, partial phase. The edge of the umbra on the Moon is visibly a circular
arc (checked by eye). Turning on the outline shows the full circle; umbra/Moon for this eclipse is 2.75.
Not measured further.

### `moonrise` Angular size of the Moon from its rising time (Aristarchus)
Preset: 2027-09-15 23:04:30 UTC, Quito (on the equator), looking east, full Moon at declination +0.4°,
refraction off, stopwatch.
- Upper limb on the horizon **23:06:18**, lower limb clear **23:08:21** (truth 23:06:17 and 23:08:20): **123 s**.
- 360° × 123 s / (24 h 50 min) = **29.7′**. Angle tool, limb to limb: **29.897′** (info panel 29.9′).
- Distance = 3475 km / 0.00865 rad ≈ **402,000 km** (that evening: 399,300 km from Quito).
- The lunar day that week, measured in the `months` lab, was 25 h 07 min, which would give 29.4′: the "24 h 50 min"
  is an average. Away from the equator, or with the Moon far from the celestial equator, the rise is slanted
  and takes longer (other dates in the app: 121–139 s).

### `lunar-parallax` Distance of the Moon from two observers (Lalande and Lacaille)
Preset: 2026-11-24 22:40 UTC, Berlin, second observer Cape Town, ghosts lined up on the stars.
- Moon centre to dashed Moon centre: **1.3402°**.
- Baseline 1.371 Earth radii (8,735 km chord): distance = 1.371 / tan 1.3402° = **58.6 Earth radii** (373,400 km).
- True geocentric distance that night: 360,100 km = 56.5 R. Using the part of the baseline square-on to the Moon
  (8,350 km, given in the prompt) gives 356,900 km.

### `eclipse-two-sites` Total here, partial there (Hipparchus)
Preset: 2024-04-08 19:09:50 UTC, Richmond (total), second observer Atlanta (partial).
- Moon centre to Atlanta's Moon: **5.959′**; Sun's diameter **31.9′**: the shift is 0.19 of the Sun's width
  (Hipparchus had "a fifth").
- 677 km / 0.001733 rad = **390,700 km**; with the square-on baseline (614 km) **354,400 km**. True 359,900 km.

### `moon-apsides` The Moon's oval orbit
Preset: 2026-11-25 21:02 UTC (perigee), Richmond, Events finder on "Moon: perigee and apogee".
- Limb to limb at perigee **33.085′**, at the next apogee (2026-12-11, reached by clicking the event) **28.956′**.
- Ratio of distances 1.143; e = (33.085 − 28.956) / (33.085 + 28.956) = **0.067**.
- True for these two apsides, centre to centre: 359,335 and 406,407 km, e = 0.061. The measured value is larger
  because sizes are topocentric and the Moon was below Richmond's horizon both times (the observer is up to one
  Earth radius farther away than the Earth's centre). That is the lab's "extra" question.

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
  1.6 minutes). Exact dichotomy from the model: 04:35:21.
- Sun–Moon angle then (angle tool, centre to centre): **89.849°** (model 89.8492°).
- 1 / cos(89.849°) = **379**: the Sun is 379 times farther than the Moon (true ratio that day 379.8).
  One 0.01% step of phase is ±0.008° of angle, which is ±5% in the ratio: the lab's point about sensitivity.
- The Sun–Moon angle reaches 90.000° at **04:58:32**, 23 minutes after dichotomy (Tao: "about 18 minutes", an average).
  Aristarchus's 87° would put it 6 hours earlier.
- The phase shown is as seen from the site (not geocentric), so it is consistent with the measured angle.

### `sun-moon-size` Sun and Moon the same size in the sky
Preset: 2024-04-08 18:25 UTC, Richmond (partial phase). Limb to limb: Sun **31.927′**, Moon **33.698′**
(true 31.93′ and 33.70′). The Moon is 5.5% larger, hence total.

### `eratosthenes` Size of the Earth from the noon Sun
Preset: June solstice of 241 BC (−240-06-22), Syene, second observer Alexandria, refraction off.
- Syene: Sun on the meridian at 09:45:21 UTC, altitude **89° 36′ 31″** (0.39° from the zenith).
- After Swap observers, Alexandria: meridian at 09:57:16 UTC, altitude **82° 29′ 54″**.
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
Preset: 2026-11-24 02:00 UTC, whole sky, ecliptic on. Ecliptic latitudes read from the info panel that night:
Moon +4.52°, Mercury +2.20°, Venus +0.39°, Mars +2.13°, Jupiter +0.77°, Saturn −2.61°. (Only one date was read;
over a year students should find Mercury up to about 7°, the Moon 5°.)

### `elongation` Sizes of the orbits of Venus and Mercury (Copernicus)
Preset: 2026-12-20, Richmond, angle tool, Events finder on greatest elongations.
- Sun → Venus, stepping a day at a time: maximum **46.950°** on **2027-01-03** (astronomy-engine: 46.95°, 2027-01-03).
- sin 46.950° = **0.731 au** (Venus's distance from the Sun that day 0.72 au; mean 0.723).
- Mercury was not measured; its greatest elongations are in the same Events list.

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
- With the Earth on a circle of 1 au, the two sight lines cross **1.664 au** from the Sun. True 1.661 au.
- The first version of this preset (2026-12-06) had the two sight lines only 4° apart and gave 1.74 for 1.63 au:
  Tao's warning about nearly parallel lines. Pairs between late February and late April 2027 all give within 1%.

### `jupiter-mass` Weighing Jupiter
Preset: 2026-11-24 09:00 UTC, Jupiter tracked, angle tool. Measured for Ganymede, reading the angle hourly:
- Greatest elongation on one side **293.6″** (Jupiter at 5.030 au), and again 172 h later: T = **7.17 d** (true 7.155).
- a = 293.6″ × 5.030 au = **1,071,100 km** (true 1,070,400).
- M = 4π²a³ / (G T²) = **1.896 × 10²⁷ kg** (true 1.898 × 10²⁷).

### `venus-phases` The phases of Venus
Preset: 2026-06-01, Venus tracked. Info panel, monthly:

| Date | Lit | Diameter | Distance |
|---|---|---|---|
| 2026-06-01 | 79.5% | 13.3″ | 1.256 au |
| 2026-07-01 | 69.1% | 16.0″ | 1.043 au |
| 2026-08-01 | 55.9% | 20.9″ | 0.800 au |
| 2026-09-01 | 38.7% | 30.1″ | 0.554 au |
| 2026-10-01 | 15.0% | 48.1″ | 0.347 au |
| 2026-11-01 | 2.6% | 59.6″ | 0.280 au |

## The astronomical unit

### `venus-transit-1769` The transit of Venus, 1769 (Halley's method)
Preset: 1769-06-03 19:15 UTC, Point Venus (Tahiti), second observer Vardø, ghosts lined up on the Sun's disc.
Contacts judged with Venus tracked at FOV 0.06°.

| | II (inside) | III (touches limb) | Duration |
|---|---|---|---|
| Tahiti, measured | 19:41:00 | 01:10:33 | 5 h 29 min 33 s |
| Tahiti, model | 19:41:02 | 01:10:34 | 19,772 s |
| Vardø, measured | 19:28:43 | 01:21:38 | 5 h 52 min 55 s |
| Vardø, model | 19:28:44 | 01:21:39 | 21,175 s |

- **Difference in duration 23 min 22 s** (model 23 min 23 s).
- At mid-transit (22:25:30 UTC) Venus to the other observer's Venus: **35.78″**.
- AU = baseline × (1/0.289 − 1/1.015) / shift: with the square-on baseline 10,470 km, **149.3 million km**;
  with the full 11,410 km chord, 162.8 million km. True 149.6.
- Vardø's first timing was done with refraction on and was visibly wrong (Sun 7° up): hence the rule above.

### `venus-transit-2012`
Preset: 2012-06-05 22:00 UTC, Honolulu and Sydney. At 01:28 UTC: Venus to Sydney's Venus **25.59″**, Venus's diameter
**57.81″**. AU = 7,490 km × 2.478 / 25.59″ = **149.6 million km** (full chord 7,620 km: 152.2). Contacts were not
re-timed here (same mechanism as 1769; model: Honolulu I 22:10:40, Sydney I 22:16:30).

### `mercury-transit`
Preset: 2019-11-11 12:30 UTC, Richmond. At 15:19:48 UTC: Mercury to Sun's centre **76.9″** (geocentric least distance
79.2″; Richmond sees Mercury about 2″ closer to the centre), diameter **9.95″**. Contacts not timed
(geocentric I 12:34:41, IV 18:03:11).

### `mars-parallax` Parallax of Mars, 1672 (Cassini and Richer)
Preset: 1672-09-05 01:00 UTC, Paris, second observer Cayenne. Mars to Cayenne's Mars: **23.90″**.
- 6,720 km / 23.90″ = **58.0 million km**; Mars was 0.3812 au away, so AU = **152 million km**
  (square-on baseline 6,610 km: 149.6).

## Light

### `romer` The speed of light from Io
Preset: 2025-10-01 14:50 UTC, Jupiter tracked, FOV 0.07°.

| | Io gone, light time on | light time off | Delay | Jupiter |
|---|---|---|---|---|
| 2025-10-01 | 15:05:47 | 14:21:29 | 2658 s | 5.327 au |
| 2025-12-11 | 10:04:37 | 09:28:22 | 2175 s | 4.360 au |

- c = (5.327 − 4.360) au / (2658 − 2175) s = **299,500 km/s**.
- Rømer's way: the two eclipses are 40 orbits apart; seen with light time on, the interval is 483 s shorter than
  the real one, because the Earth has come 0.97 au closer: the schedule slips by about 12 s per eclipse.
- Check against JPL Horizons (geocentric): Io's partial-umbral phase 15:02:05–15:05:35 on 2025-10-01 and
  03:46:15–03:49:55 on 2026-03-01; the app's half-light instants are 15:03:36 and 03:48:21, and Io is drawn until
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
  Semi-major axis **0.287″** → **3.48 pc = 11.4 ly** (catalogue 3.49 pc; published parallax 0.286″).
- This recovers the catalogue distance by construction; what the lab shows is the size and phase of the loop.

### `proper-motion` A star that moves
Preset: Barnard's star (HIP 87937; shown under that number, HYG has no names below magnitude 6.5).
- Info panel, 2026-06-01 → 2036-06-01: Dec +4° 46′ 08.97″ → 47′ 52.25″, RA 47.091s → 46.557s: **103.6″ in 10 yr =
  10.36″/yr** (Hipparcos 10.358). 10.36 × 1.82 pc × 4.74 = **89 km/s**.
- Angle tool with Snap off, same 10 years, before the data fix: 100.3″. HYG lists this star's pmdec as 9999.99
  mas/yr (a clipped field); `tools/build_stars.py` now restores the Hipparcos value 10326.93 for this one star.

### `canopus` A star you cannot see from Greece (Aristotle, Posidonius)
Preset: 100 BC, Rhodes, second observer Alexandria, refraction off.
- Canopus on the meridian: Rhodes **0° 53′ 57″**, Alexandria **6° 07′ 45″**: difference **5.230°** (latitudes differ by 5.23°).
- 360 / 5.23 × 5000 = 344,000 stadia; Posidonius's 7.5° gives 240,000.
- With refraction on, Canopus at Rhodes stands at 1° 16′.

## Time and the calendar

### `sidereal-day`
Preset: 2026-11-24, Richmond, meridian on. Aldebaran at hour angle 0: 2026-11-24 06:04:11 and 11-25 06:00:15 UTC:
**23 h 56 min 04 s**. Sun, noon to noon: **24 h 00 min 01 s** on 3–4 November, **24 h 00 min 29 s** on 24–25 December.

### `analemma`
Preset: 2026-01-01 12:00 EST, Richmond, Sun trail of 37 ticks 10 days apart, "in the sky here".
- Top tick 2026-06-20, bottom tick 2026-12-17; angle between them **46.83°**; half is **23.4°**.
- Widest pair of ticks (2026-02-10 and 2026-11-07): **7.68°**, about 31 minutes of time in all (true extremes of the
  equation of time −14.2 and +16.4 min).
- The figure sits east of the meridian because Richmond is 9.9° west of the centre of its time zone.

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
| Aristotle: round shadow in lunar eclipses | `eclipse-shape` |
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
- **Main-sequence fitting, Cepheids, Type Ia supernovae** (Tao's rungs 7 and 8): they need photometry over time
  and cluster colour–magnitude data. The star catalogue has V and B−V for single stars only, no variable-star light
  curves and no cluster membership; nothing was invented to fill the gap.
- **Al-Biruni's horizon dip from a mountain**, ships hull-down: not sky observations; the app has no terrain or
  observer height effects on the horizon.
- **Vega as pole star (AD 14000)**: outside the ±3000-year range in which the ephemeris is trusted.
- **Wendelen's telescopic half-Moon timing**: same as `half-moon`; the app has no way to model the eye's
  difficulty in judging a straight terminator, which was the real limit.
