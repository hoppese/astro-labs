"""PHYS 115 (Encounters with the Cosmos), two semesters: the day-by-day schedule. tools/guide/build.py turns it into
guide/course/ (an overview, a schedule page per semester, a lesson-plan page per class day).

A day:  (type, title, readings, decks, labs, note)
  type     L lecture, A activity (a planetarium lab, the course's activities), Q quiz day (quiz + a short lesson),
           T test, R review, P project
  readings OpenStax Astronomy 2e sections ('4.5', '3.1-3.3', 'App. C')
  decks    Seth's Keynote decks in ~/Teaching/PHYS 115 - Astronomy/Slides (names without .key)
  labs     planetarium lab ids (js/labs/presets.js); 'new:...' marks a lab still to be built
  note     one line shown on the schedule (an aside, a flag)
The full lesson plan for a day, when written, is tools/guide/course/<semester>-<nn>.html (an HTML fragment, sections
like the lab guides). Days without one show the schedule information only.

Dates come from the calendars (verified 2026-11-28 against earlham.edu): Spring 2027 classes Jan 25 - May 7, spring
break Mar 6-14, Earlham Day Apr 21 (the web page says Apr 14: to confirm); Fall 2027 classes Aug 25 - Dec 10, EPIC EXPO
Oct 8 (tentative), early-semester break Oct 14-17, Thanksgiving Nov 20-28.
"""
import datetime as _D

def _mwf(a, b, off):
    d, out = a, []
    while d <= b:
        if d.weekday() in (0, 2, 4) and d.isoformat() not in off: out.append(d)
        d += _D.timedelta(1)
    return out

SEMESTERS = [
  dict(id='s1', name='Semester 1: The sky and the solar system', term='Spring 2027',
       dates=_mwf(_D.date(2027, 1, 25), _D.date(2027, 5, 7), {'2027-03-08', '2027-03-10', '2027-03-12', '2027-04-21'}),
       breaks={'2027-03-08': 'Spring break (Mar 6-14)', '2027-04-21': 'Earlham Day (no class; date to confirm: the calendar page says Apr 14)'},
       final='Final exam in exam week (May 10, 12 or 13)',
       blurb='From the sky overhead to the size of the solar system: the motions of the Sun, Moon and planets, then the '
             'ancient distance ladder (the Earth, the Moon, the Sun), Kepler and Newton, and the astronomical unit.',
       days=[
    ('L', 'Welcome: how far away is everything?', ['1.1-1.7'], ['Syllabus'], [], ''),
    ('L', 'The celestial sphere', ['2.1', '4.1'], ['CelestialTerminology'], [], ''),
    ('A', 'Lab: Where on Earth are you? Latitude and a round Earth', ['2.1'], [], ['polaris-latitude', 'canopus'], 'First lab: learn the planetarium and the angle tool'),
    ('L', 'Races across the sky: the solar and the sidereal day', ['4.3'], ['Races across the sky'], ['sidereal-day'], ''),
    ('L', 'Math tools: powers of ten, ratios and ratio graphs', ['1.5', 'App. C'], ['ScientificNotation', 'Graphs'], [], 'Use F_ratio, not F_new (Ideas.txt)'),
    ('L', 'Phases of the Moon', ['4.5'], ['MoonPhases'], [], 'Drawing day'),
    ('A', 'Lab: The Moon’s motion: two months, the lunar day and the Moon’s size', ['4.5'], [], ['months', 'moonrise', 'moon-apsides'], ''),
    ('L', 'Seasons and the Sun’s path', ['4.2'], ['Seasons'], [], ''),
    ('L', 'Eclipses', ['4.7'], ['Eclipses'], [], 'Lunar Eclipse Activity (heliocentric drawing)'),
    ('Q', 'Quiz 1. Then: the wandering pole (precession)', ['2.2'], ['PrecessionOfEarth'], [], 'Quiz 1: the sky, the Moon, seasons, eclipses'),
    ('L', 'Measuring what you cannot reach: the ancient distance ladder', ['2.2'], ['EclipseHistory'], [], 'Aristarchus, Eratosthenes, Hipparchus'),
    ('A', 'Lab: How big is the Earth? (Eratosthenes)', ['2.2'], [], ['eratosthenes'], ''),
    ('A', 'Lab: The Earth’s shadow on the Moon: the Moon’s size', ['4.7'], [], ['eclipse-timing'], ''),
    ('L', 'Angles and parallax: the small-angle rule', ['19.2'], ['Parallax'], [], 'The parallax part of Distance.key'),
    ('A', 'Lab: How far is the Moon? Two observers, and Hipparchus’s eclipse', ['19.2'], [], ['lunar-parallax', 'eclipse-two-sites'], ''),
    ('A', 'Lab: How far and how big is the Sun? (Aristarchus)', ['2.2'], [], ['half-moon', 'sun-moon-size'], ''),
    ('Q', 'Quiz 2. Then: the year, the tilt and the Earth’s oval orbit', ['4.2', '4.3'], ['Seasons'], [], 'Quiz 2: the ancient distance ladder'),
    ('A', 'Lab: Seasons and the year: the tilt, the oval orbit, the analemma', ['4.2', '4.3'], [], ['obliquity', 'sun-apsides', 'analemma'], ''),
    ('L', 'The wanderers: planets in the sky, Ptolemy and Copernicus', ['2.3', '2.4'], ['Planets'], [], 'Retrograde motion'),
    ('A', 'Lab: How the planets move: the zodiac, synodic periods, retrograde loops', ['2.3'], [], ['zodiac', 'synodic', 'retrograde'], ''),
    ('L', 'Inner and outer planets, the phases of Venus, Galileo', ['2.4', '3.1'], ['Planets'], [], ''),
    ('A', 'Lab: The orbits of Venus and Mercury, and the phases of Venus', ['3.1'], [], ['elongation', 'venus-phases'], ''),
    ('L', 'Kepler’s laws', ['3.1'], ['KeplersLaws'], [], ''),
    ('A', 'Lab: Kepler’s triangulation of Mars', ['3.1'], [], ['kepler-mars', 'kepler-earth', 'kepler-orbit'], 'Kepler I and II are Advanced'),
    ('L', 'Newton’s law of gravity, and the ratio method', ['3.2', '3.3'], ['LawOfGravity'], [], 'More 1/r² practice (Ideas.txt)'),
    ('L', 'Gravity and orbits: Kepler’s third law weighs the Sun', ['3.3', '3.6'], ['LawOfGravity'], [], ''),
    ('R', 'Midterm review', [], ['Reviews'], [], ''),
    ('T', 'Midterm exam', [], [], [], 'The sky, the ancient ladder, planetary motion, Kepler, gravity'),
    ('L', 'Matter in motion: momentum, energy, angular momentum', ['3.2', '3.4'], ['Matter In Motion'], [], ''),
    ('A', 'Lab: Weighing Jupiter', ['3.3'], [], ['jupiter-mass'], ''),
    ('L', 'Tides', ['4.6'], ['Planets'], [], 'The tides part of Planets.key'),
    ('L', 'How big is the solar system? The astronomical unit', ['3.6', '19.1'], ['Distance'], [], 'Transits and radar'),
    ('A', 'Lab: The transit of Venus: the astronomical unit in km', ['19.1'], [], ['venus-transit-1769', 'venus-transit-2012', 'mercury-transit', 'mars-parallax'], 'Mars 1672 is Advanced'),
    ('Q', 'Quiz 3. Then: a tour of the solar system', ['7.1-7.2'], ['Solar System'], [], 'Quiz 3: planetary motion, Kepler, gravity, the AU'),
    ('L', 'How the solar system formed', ['7.4', '14.3-14.4'], ['Solar System'], [], 'Fix the "supernova remnant" claim (Ideas.txt)'),
    ('L', 'The terrestrial planets', ['9.1-9.5', '10.1-10.6'], ['Planets'], [], ''),
    ('L', 'The giant planets and their moons', ['11.1-11.6', '12.1-12.5'], ['Planets'], [], ''),
    ('L', 'Comets, asteroids, meteors', ['13.1-13.4', '14.1-14.2'], [], [], 'No deck yet'),
    ('L', 'Other solar systems: exoplanets', ['21.4-21.6'], [], [], 'No deck yet; the exoplanet-transit sim'),
    ('A', 'Lab: The sky changes over centuries: the pole and the equinoxes', ['2.2'], [], ['precession-pole', 'precession-equinox'], 'Optional; could be a review day'),
    ('R', 'Review for the final', [], ['Reviews'], [], ''),
  ]),
  dict(id='s2', name='Semester 2: Stars, galaxies and the universe', term='Fall 2027',
       dates=_mwf(_D.date(2027, 8, 25), _D.date(2027, 12, 10), {'2027-10-08', '2027-10-15', '2027-11-22', '2027-11-24', '2027-11-26'}),
       breaks={'2027-10-08': 'EPIC EXPO day (no class; tentative)', '2027-10-15': 'Early-semester break (Oct 14-17)', '2027-11-22': 'Thanksgiving break (Nov 20-28)'},
       final='Final exam in exam week (Dec 13, 15 or 16)',
       blurb='What light tells us, and the rest of the distance ladder: the Sun, the distances, sizes and masses of stars, '
             'how stars live and die, relativity and black holes, galaxies, and the expanding universe.',
       days=[
    ('L', 'Welcome back: everything we know about the stars comes in as light', ['5.1'], ['Light'], [], ''),
    ('L', 'Light as a wave: the electromagnetic spectrum', ['5.1-5.2'], ['Light', 'ScientificNotation'], [], ''),
    ('A', 'Lab: The speed of light from Io, and the aberration of starlight', ['5.1'], [], ['romer', 'aberration'], 'Uses the AU from semester 1'),
    ('L', 'Blackbodies: color and temperature (Wien)', ['5.2', '17.2'], ['Blackbodies'], [], 'blackbody-spectrum sim'),
    ('L', 'Blackbodies: luminosity (Stefan-Boltzmann) and photons', ['5.2', '17.2'], ['Blackbodies'], [], ''),
    ('A', 'Lab: The colors of the stars and their temperatures', ['17.2'], [], ['star-colors'], ''),
    ('L', 'Spectroscopy: atoms and spectral lines', ['5.3-5.5'], ['Spectroscopy'], [], 'atomic-spectra sim'),
    ('L', 'The Doppler effect, and telescopes', ['5.6', '6.1-6.5'], ['Spectroscopy', 'FamousTelescopes'], [], 'Cut most of the telescopes lecture (Ideas.txt)'),
    ('A', 'Lab: Star spectra: sorting the stars', ['17.3', '17.4'], [], ['star-spectra'], ''),
    ('Q', 'Quiz 1. Then: telescopes old and new', ['6.1-6.5'], ['FamousTelescopes'], [], 'Quiz 1: light, blackbodies, spectra'),
    ('L', 'The Sun’s surface', ['15.1-15.3'], ['SolarSurface'], [], ''),
    ('L', 'Inside the Sun: pressure and balance', ['16.1-16.2'], ['SolarInterior', 'Gases'], [], ''),
    ('L', 'What powers the Sun: fusion and neutrinos', ['16.1', '16.3-16.4'], ['SolarInterior', 'Neutrinos'], [], ''),
    ('L', 'How far are the stars? Parallax', ['19.1-19.2'], ['Parallax', 'ParallaxActivity'], [], ''),
    ('A', 'Lab, part 1: Parallax in the field (the outdoor Parallax Lab)', ['19.2'], [], ['parallax'], 'Outdoors: have a rain date'),
    ('A', 'Lab, part 2: Parallax of real stars in the planetarium', ['19.2'], [], ['parallax', 'proxima-parallax', 'barnard-parallax'], ''),
    ('L', 'Brightness: magnitudes, luminosity and the inverse square law', ['17.1', '19.3'], ['Distance'], [], 'inverse-square-brightness sim'),
    ('L', 'The H-R diagram (Annie Jump Cannon)', ['17.3', '18.4'], ['HRDiagram'], [], ''),
    ('L', 'How big are the stars? The Sun, Sirius and Betelgeuse', ['18.3'], ['SunSiriusBetelgeuse'], [], ''),
    ('A', 'Lab: Build the H-R diagram and find the sizes of stars', ['18.3-18.4'], [], ['new:hr-diagram'], 'Lab to build (filters + parallax distances)'),
    ('R', 'Midterm review', [], ['Reviews'], [], ''),
    ('T', 'Midterm exam', [], [], [], 'Light, the Sun, distances, brightness, the H-R diagram'),
    ('L', 'Binary stars and the masses of stars', ['18.2'], ['BinarySystems'], [], ''),
    ('A', 'Lab: Weighing stars: an eclipsing and a spectroscopic binary', ['18.2'], [], ['new:binaries'], 'Lab to build (photometer + spectrograph)'),
    ('L', 'Star birth: protostars', ['20.1-20.3', '21.1-21.2'], ['Protostars'], [], ''),
    ('L', 'Life on the main sequence; red dwarfs', ['22.1'], ['MainSequence', 'RedDwarfs'], [], ''),
    ('L', 'Star clusters and their ages', ['22.2-22.3'], ['Clusters'], [], ''),
    ('A', 'Lab: Clusters: main-sequence fitting and the turnoff', ['22.2-22.3'], [], ['new:clusters'], 'Lab to build'),
    ('L', 'Stellar evolution: giants and white dwarfs', ['22.1-22.4'], ['Stellar Evolution'], [], ''),
    ('L', 'Stellar evolution: supernovae, neutron stars and pulsars', ['23.1-23.5'], ['Stellar Evolution', 'NeutronStars'], [], ''),
    ('A', 'Lab: Cepheids and RR Lyrae: standard candles', ['19.3'], [], ['cepheid-distance', 'rr-lyrae', 'cepheid-calibrate'], 'Make-the-law-yourself is Advanced'),
    ('Q', 'Quiz 2. Then: the project', [], ['Projects'], [], 'Quiz 2: binaries, stellar lives, standard candles'),
    ('L', 'Special relativity', ['24.1'], ['SpecialRelativity'], [], 'OpenStax barely covers it'),
    ('L', 'General relativity', ['24.1-24.4'], ['GeneralRelativity'], [], ''),
    ('L', 'Black holes and gravitational waves', ['24.5-24.7'], ['BlackHoles'], [], ''),
    ('A', 'Lab: Supernovae as standard candles', ['26.5'], [], ['sn-ia', 'sn-types'], ''),
    ('Q', 'Quiz 3. Then: the Milky Way', ['25.1-25.2'], ['MilkyWay'], [], 'Quiz 3: relativity, black holes, supernovae'),
    ('L', 'Galaxies and dark matter', ['26.1-26.4'], ['Galaxies'], [], ''),
    ('A', 'Lab: The Hubble law', ['26.5', '29.1'], [], ['new:hubble'], 'From the planetarium’s Hubble module (hubble.js)'),
    ('L', 'Cosmology: the Big Bang, the CMB, dark energy', ['29.1-29.5'], ['Cosmology'], [], ''),
    ('P', 'Project presentations', [], [], [], ''),
    ('P', 'Project presentations; looking back', [], [], [], ''),
  ]),
]
for _s in SEMESTERS:
    assert len(_s['days']) == len(_s['dates']), (_s['id'], len(_s['days']), len(_s['dates']))
