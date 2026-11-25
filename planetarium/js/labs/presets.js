// labs/presets.js: the classic measurements as presets. Each sets the date, place, target, zoom and
// the needed toggles (see setup.js for the fields) and gives the student a short prompt of what to
// measure. NO ANSWERS here: the values the instructor should expect are in planetarium/LABS.md.

const DAY = 86400000;
const TAO = 'https://terrytao.wordpress.com/2025/02/13/cosmic-distance-ladder-video-with-grant-sanderson-3blue1brown-commentary-and-corrections/';
const tao = `<a href="${TAO}" target="_blank" rel="noopener">Terence Tao’s notes on the cosmic distance ladder</a>`;

export const PLACES = {
  richmond: { name: 'Richmond', region: 'Indiana, USA', lat: 39.83, lon: -84.89, elev: 300, tz: 'America/Indiana/Indianapolis' },
  nairobi: { name: 'Nairobi', region: 'Kenya', lat: -1.29, lon: 36.82, tz: 'Africa/Nairobi' },
  quito: { name: 'Quito', region: 'Ecuador', lat: -0.18, lon: -78.47, tz: 'America/Guayaquil' },
  berlin: { name: 'Berlin', region: 'Germany', lat: 52.52, lon: 13.40, tz: 'Europe/Berlin' },
  capetown: { name: 'Cape Town', region: 'South Africa', lat: -33.92, lon: 18.42, tz: 'Africa/Johannesburg' },
  atlanta: { name: 'Atlanta', region: 'Georgia, USA', lat: 33.75, lon: -84.39, tz: 'America/New_York' },
  tokyo: { name: 'Tokyo', region: 'Japan', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo' },
  syene: { name: 'Syene (Aswan)', region: 'Egypt', lat: 24.09, lon: 32.90, tz: 'Africa/Cairo' },
  alexandria: { name: 'Alexandria', region: 'Egypt', lat: 31.20, lon: 29.92, tz: 'Africa/Cairo' },
  rhodes: { name: 'Rhodes', region: 'Greece', lat: 36.43, lon: 28.22, tz: 'Europe/Athens' },
  tahiti: { name: 'Point Venus, Tahiti', region: 'French Polynesia', lat: -17.50, lon: -149.50, tz: 'Pacific/Tahiti' },
  vardo: { name: 'Vardø', region: 'Norway', lat: 70.37, lon: 31.11, tz: 'Europe/Oslo' },
  honolulu: { name: 'Honolulu', region: 'Hawaii, USA', lat: 21.31, lon: -157.86, tz: 'Pacific/Honolulu' },
  sydney: { name: 'Sydney', region: 'Australia', lat: -33.87, lon: 151.21, tz: 'Australia/Sydney' },
  paris: { name: 'Paris', region: 'France', lat: 48.85, lon: 2.35, tz: 'Europe/Paris' },
  cayenne: { name: 'Cayenne', region: 'French Guiana', lat: 4.94, lon: -52.33, tz: 'America/Cayenne' },
  greenwich: { name: 'Greenwich', region: 'England', lat: 51.48, lon: 0, tz: 'Europe/London' },
};
const P = PLACES;
// no sky glow, no ground, and no refraction (the Sun and Moon are drawn as true circles, so limb contacts near the horizon are only right without it)
const DARK = { atmosphere: false, ground: false, refraction: false };
const STEPKEYS = 'Shift + ← / → steps the clock 1 second, Shift + ↓ / ↑ 1 minute; a click on the date and time has more.';
// pieces of the prompts that several labs share
const HELP = (t) => `<span class="help">${t}</span>`;
const RUN = 'run the clock (<kbd>L</kbd> faster, <kbd>J</kbd> slower, <kbd>7</kbd> stop)';
const FINE = HELP('To the second: <kbd>Shift</kbd> + <kbd>←</kbd> <kbd>→</kbd> steps 1 second, <kbd>Shift</kbd> + <kbd>↓</kbd> <kbd>↑</kbd> 1 minute. <kbd>X</kbd> marks the time.');
const RADIANS = HELP('A small angle is (size) ÷ (distance) when it is in <b>radians</b>. Degrees to radians: × π ÷ 180. 1° = 60′ = 3600″.');
const YEAR0 = (bc) => HELP(`The clock shows −${String(bc - 1).padStart(4, '0')} for ${bc} BC: astronomers count a year 0 (1 BC), so the two differ by one.`);
const ANGLE = 'the angle tool (<kbd>R</kbd>)';
const SWAP = '<button class="btn" data-do="swap">Swap observers</button>';
const LIGHT = '<button class="btn" data-do="light">Light-travel time on / off</button>';
const GOTO = (t, text) => `<button class="btn" data-do="goto" data-t="${t}">${text}</button>`;
// the four contacts of a transit, in pictures: the planet (black) and the top edge of the Sun
const CONTACTS = (() => {
  const one = (x, y, dir, t) => `<svg x="${x}" y="0" width="66" height="46" viewBox="0 0 66 46"><rect width="66" height="46" rx="5" fill="#0a111c"/><circle cx="33" cy="92" r="66" fill="#f0c766"/><circle cx="33" cy="${y}" r="7.500" fill="#111823" stroke="#8fa2b8" stroke-width="1"/><path d="M52 ${dir > 0 ? '8v14m-3.500-4.500l3.500 4.500l3.500-4.500' : '22V8m-3.500 4.500l3.500-4.500l3.500 4.500'}" stroke="#9fc2ff" stroke-width="1.500" fill="none"/></svg><text x="${x + 33}" y="59" text-anchor="middle" font-size="11" fill="#c3cfdc" font-family="Source Sans 3, system-ui, sans-serif">${t}</text>`;
  return '<svg class="lab-fig" viewBox="0 0 282 64" role="img" aria-label="First contact: the planet touches the edge of the Sun from outside. Second: it is just completely inside. Third: it touches the edge again from inside, on its way out. Fourth: it leaves the edge.">' + one(0, 18.5, 1, '1st') + one(72, 33.5, 1, '2nd') + one(144, 33.5, -1, '3rd') + one(216, 18.5, -1, '4th') + '</svg>';
})();

// ---- the two notebook astrometry labs share their wording (what to measure; the analysis is the student's) ----
// where a star is from its reference star: the two sides of the triangle, no formula (east is to the left on the sky)
const SPLIT_DIAGRAM = '<svg class="lab-diagram" viewBox="0 0 250 150" role="img" aria-label="A right-angled triangle on the sky: the separation runs from the reference star to the star, the position angle is measured from north toward east, and the two short sides are the north part and the east part">'
  + '<g fill="none" stroke="#94a3b5" stroke-width="1.2"><path d="M190 128V14M190 128H30" stroke-dasharray="3 4"/><path d="M186 20l4-7 4 7M36 124l-7 4 7 4"/></g>'
  + '<path d="M190 128V42" stroke="#6fb0ff" stroke-width="3"/><path d="M190 42H84" stroke="#e8b86a" stroke-width="3"/><path d="M190 128L84 42" stroke="#e4ebf3" stroke-width="2"/><path d="M190 92A36 36 0 0 0 162 105" fill="none" stroke="#e4ebf3" stroke-width="1.2"/>'
  + '<circle cx="190" cy="128" r="4.500" fill="#94a3b5"/><circle cx="84" cy="42" r="5" fill="#ff9c7a"/>'
  + '<g font-family="Source Sans 3, system-ui, sans-serif" font-size="11.500"><g fill="#b9c6d6"><text x="190" y="10" text-anchor="middle">N</text><text x="20" y="132" text-anchor="middle">E</text><text x="200" y="132">reference</text><text x="84" y="32" text-anchor="middle">your star</text></g><text x="196" y="88" fill="#6fb0ff">north part</text><text x="140" y="36" fill="#e8b86a" text-anchor="middle">east part</text><text x="118" y="98" fill="#e4ebf3" text-anchor="middle">separation</text><text x="168" y="88" fill="#e4ebf3" font-size="10.500" text-anchor="middle">angle</text></g></svg>';
const ASTROMETRY_STEPS = (what) => [
  `The star in the middle is ${what}. The sky is shown the way a telescope records it: every star is a small blurred disc, and each exposure (each clock second) comes out slightly different. The ground and the daylight are switched off, so any date and hour will do. Faint stars can take a few seconds to appear.`,
  'Choose one of the faint stars near it as your <b>reference star</b>: your own choice. It is far in the background and hardly moves. Make a note of which one it is, so that you can find it again.',
  'With the angle tool (open at the bottom left; <kbd>R</kbd> puts it away and brings it back) measure <b>from your reference star to the star in the middle</b>: click near each star in turn, and in the magnifier that opens place the cross on the center of its image. You get a separation and a position angle.',
  'Set up your notebook: columns of your own, with names and units, and <b>Choose what Record copies</b>. Then press <b>Record</b> (in the notebook, or on the angle tool’s panel).',
  'Change the date: click the <b>date and time</b> at the bottom of the sky (the words, not the small clock picture, which jumps to today), step it on by days, weeks or months, and measure again. Follow the star for at least a year and a half, on dates of your own choosing. More dates, better answer.',
  'A separation by itself does not say where the star is: every point of a circle round your reference star is at the same distance from it. The position angle says in which direction. Together they make a right-angled triangle: the separation is the long side, and the other two sides are how far <b>east</b> and how far <b>north</b> of the reference star you find it.' + SPLIT_DIAGRAM + 'Work out those two sides for every date, as two new columns. What would each be if the position angle were 0°? If it were 90°? That tells you whether you have them the right way round.',
  'Graph each part against the date (one at a time, on the <b>Big notebook</b> if you like). Which part of the motion is steady, and which repeats every year? Fit the steady and the repeating part together by hand, and use what you find: how far away is the star, and how fast does it cross the sky?',
];
const ASTROMETRY_ABOUT = (name) => `${name} is one of the Sun’s nearest neighbors, so it does two things a distant star does not. It drifts steadily across the sky (its <b>proper motion</b>, because it really is moving through space relative to the Sun), and once a year it swings round a small ellipse (its <b>parallax</b>, because we look at it from a moving Earth). The half-length of that ellipse’s long axis is the parallax <i>p</i>, and the distance in parsecs is 1 ÷ <i>p</i> in arcseconds. The ellipse, and why it is not a line, is explained in the notebook under <b>About this model</b> for “Ellipse with a steady drift”. `
  + 'The angle tool gives a separation and a position angle (from north, through east). The separation is the long side of a right-angled triangle whose other sides lie along north and along east; which of the two is the side next to the angle and which is opposite it tells you whether to use its sine or its cosine. '
  + 'A real astrometrist measures against several background stars, because each one has a small parallax and proper motion of its own; two people who choose different reference stars and different dates will not get exactly the same answer, and should not. '
  + 'Two things are switched off here, as they are removed in real astrometry before anything is measured: atmospheric refraction, and annual aberration (which would stretch and shrink the whole field by one part in ten thousand over the year). '
  + 'The small random shift of each star image from one exposure to the next is <b>simulated measurement error</b>, not data: it stands in for the photon noise and seeing of a real detector, and it comes from the seed shown in your notebook.';
const ASTROMETRY_TEMPLATE = { cols: [
  { key: 'yr', kind: 'data', name: 'date', unit: 'yr', sig: 0, raw: 'year', rawLabel: 'Date as a decimal year' },
  { key: 'sep', kind: 'data', name: 'separation', unit: 'arcsec', sig: 0, raw: 'sep', rawLabel: 'Separation' },
  { key: 'pa', kind: 'data', name: 'position angle', unit: 'deg', sig: 0, raw: 'pa', rawLabel: 'Position angle (north through east)' },
  { key: 'ref', kind: 'text', name: 'reference star', raw: 'from', rawLabel: 'Measured from (name)' }] };

export const GROUPS = ['Earth and Moon', 'The Sun', 'The planets', 'The astronomical unit', 'Light', 'The stars', 'Time and the calendar'];

export const LABS = [
  // ------------------------------------------------------------------ Earth and Moon
  { id: 'eclipse-timing', group: 'Earth and Moon', title: 'Size of the Moon from a lunar eclipse', who: 'Aristarchus, about 270 BC',
    blurb: 'Time the Moon crossing the Earth’s shadow.',
    setup: { t: '2018-07-27T17:50:00Z', loc: P.nairobi, target: 'Moon', track: true, fov: 2.4, show: { refraction: false }, fx: { earthShadow: false }, tools: ['stopwatch'] },
    steps: [
      `The Moon is about to enter the Earth’s dark inner shadow (the umbra). Zoom in on it, ${RUN} until the dark edge first touches the Moon, step to the moment and press <b>Mark time</b>.${FINE}`,
      `Mark the instant the Moon is completely inside the umbra (totality begins).`,
      `Mark the instant the Moon’s leading edge first comes out again (totality ends).`,
      `Mark the instant the Moon is completely clear of the umbra. You now have four marks.`,
      `From mark 1 to mark 2 the Moon moved by its own diameter. From mark 1 to mark 3 its leading edge crossed the whole shadow. Press two mark numbers to see the time between them. What is the shadow’s diameter in Moon diameters?`,
      `Check: <button class="btn" data-do="shadow">Outline of the Earth’s shadow</button>, zoom out until you see all of it, and with ${ANGLE} measure the umbra and the Moon, each from edge to edge. Why might this not agree exactly with your timing?`,
    ],
    about: `The Moon passes almost through the center of the shadow in this eclipse. The Sun is not a point, so the Earth’s shadow tapers: at the Moon it is narrower than the Earth by about one Moon diameter (because the Sun and Moon look the same size). Earth’s diameter ≈ (shadow + 1) Moon diameters. The model enlarges the shadow by 1.4% for the Earth’s atmosphere, as eclipse predictions do. ${STEPKEYS} See ${tao}.` },
  { id: 'eclipse-shape', group: 'Earth and Moon', title: 'The Earth’s round shadow', who: 'Aristotle, about 350 BC',
    blurb: 'The edge of the shadow on the Moon is always an arc of a circle.',
    setup: { t: '2019-01-21T04:05:00Z', loc: P.richmond, target: 'Moon', track: true, fov: 1.5, show: { refraction: false }, fx: { earthShadow: false } },
    steps: [
      `Look at the edge of the shadow on the Moon. Step the clock through the partial phase (<kbd>Shift</kbd> + <kbd>↑</kbd> is 1 minute): is the edge ever straight, or curved the other way?`,
      `Estimate by eye how many times bigger than the Moon the circle is that this arc belongs to.`,
      `<button class="btn" data-do="shadow">Outline of the Earth’s shadow</button>, zoom out, and measure the circle’s diameter and the Moon’s with ${ANGLE}: click near an edge to snap to it, away from the place where the two edges cross.`,
    ],
    about: `Only a sphere casts a round shadow from every direction, which was Aristotle’s argument that the Earth is a ball. See ${tao}.` },
  { id: 'moonrise', group: 'Earth and Moon', title: 'Angular size of the Moon from the time it takes to rise', who: 'Aristarchus',
    blurb: 'How long does the Moon take to climb over the horizon?',
    setup: { t: '2027-09-15T23:04:30Z', loc: P.quito, look: { az: 89.65, alt: 0.25 }, target: 'Moon', fov: 1.6, show: { refraction: false, atmosphere: false, azGrid: false, conLines: false, conNames: false }, tools: ['stopwatch'] },
    steps: [
      `You are on the equator looking due east; the full Moon is about to rise straight up. Refraction is off. Step the clock to the instant the Moon’s top edge reaches the horizon and press <b>Mark time</b>.${FINE}`,
      `Step on to the instant the bottom edge clears the horizon and mark again. How long did the Moon take to rise by its own diameter?`,
      `The Moon goes once round the sky (360°) in one lunar day. Measure it: switch on the <b>meridian</b> (<kbd>;</kbd>, the green line from north to south overhead), press <kbd>T</kbd> with the Moon selected to follow it, run on to the instant the line cuts the Moon in half, mark; and again the next day.`,
      `Angular diameter = 360° × (rise time) ÷ (lunar day), both in the same unit. Now go back to mark 2 (its ↩ button), measure the Moon from edge to edge with ${ANGLE}, and compare.`,
    ],
    about: `With the angular size and the true size of the Moon (from the eclipse lab) you get its distance: diameter / angle in radians. Away from the equator, or when the Moon is far from the celestial equator, it rises at a slant and takes longer. ${STEPKEYS} See ${tao}.` },
  { id: 'lunar-parallax', group: 'Earth and Moon', title: 'Distance of the Moon from two observers', who: 'Lalande and Lacaille, 1751 (Berlin and the Cape)',
    blurb: 'The Moon sits in a different place among the stars for two observers.',
    setup: { t: '2026-11-24T22:40:00Z', loc: P.berlin, obs2: P.capetown, align: 'stars', target: 'Moon', track: true, fov: 5, tools: ['compare'], show: { atmosphere: false } },
    steps: [
      `The solid Moon is what Berlin sees; the dashed circle is where Cape Town sees it at the same instant, against the same stars.`,
      `With ${ANGLE}, measure from the center of the Moon to the center of the dashed Moon.`,
      `The two cities are almost on the same meridian, 86.4° of latitude apart. Seen square-on from the Moon, they are 8,350 km (1.311 Earth radii) apart tonight. How far away is the Moon, in km and in Earth radii?${RADIANS}`,
    ],
    about: `The straight line between the cities is 8,735 km long, but it is a little slanted to the Moon; only the square-on part, 8,350 km, makes the shift. This is ordinary surveying with the Earth as the baseline. Hipparchus used the same idea with the solar eclipse of 129 BC. See ${tao}.` },
  { id: 'eclipse-two-sites', group: 'Earth and Moon', title: 'Total here, partial there', who: 'Hipparchus (eclipse of 129 BC), with the eclipse of 8 April 2024',
    blurb: 'A solar eclipse that is total in one town is only partial a few hundred km away.',
    setup: { t: '2024-04-08T19:09:50Z', loc: P.richmond, obs2: P.atlanta, align: 'stars', target: 'Sun', track: true, fov: 1.6, show: { refraction: false, atmosphere: false }, tools: ['compare'] },
    steps: [
      `In Richmond the eclipse is total. The dashed circles are the Sun (yellow) and the Moon (blue) as seen from Atlanta at the same instant. Is the Sun covered there?`,
      `With ${ANGLE} measure how far the Moon is shifted between the two towns: from the center of the Moon to the center of the dashed Moon.`,
      `Measure the Sun’s diameter on the dashed yellow circle, edge to edge (in Richmond the real Sun is behind the Moon). What fraction of the Sun’s width is the shift? That fraction is all Hipparchus knew.`,
      `Seen square-on from the Moon, Atlanta is 614 km from Richmond. Estimate the Moon’s distance from the shift.${RADIANS}`,
    ],
    about: `In a straight line the towns are 677 km apart, but that line is slanted to the Moon. Using its full length overestimates the distance: the same difficulty Hipparchus had. See ${tao}.` },
  { id: 'moon-apsides', group: 'Earth and Moon', title: 'The Moon’s oval orbit', who: 'Hipparchus; Ptolemy',
    blurb: 'The Moon looks bigger at perigee than at apogee.',
    setup: { t: '2026-11-25T21:02:00Z', loc: P.richmond, target: 'Moon', track: true, fov: 1.2, show: DARK, tools: ['events'], events: 'apsis' },
    steps: [
      `The Events finder lists the Moon’s closest (perigee) and farthest (apogee) points. Click one of each. (“Below your horizon” does not matter here: the ground is switched off.)`,
      `Each time, measure the Moon’s diameter from edge to edge with ${ANGLE}. The row follows the Moon, so one measurement is enough: read it at each date.`,
      `Distance is inversely proportional to angular size. From the two sizes find the ratio of the distances and the eccentricity e = (big − small) ÷ (big + small).`,
      `Extra: measure the Moon when it is rising and again when it is highest on the same night. Why does it differ?`,
    ],
    about: 'Angular sizes here are as seen from your place on the Earth’s surface, not from its center, so an observer with the Moon overhead is one Earth radius closer to it.' },
  { id: 'months', group: 'Earth and Moon', title: 'Two kinds of month, and the lunar day', who: 'Babylonian and Greek astronomy',
    blurb: 'Star to star, phase to phase, and meridian to meridian.',
    setup: { t: '2026-11-24T14:54:00Z', loc: P.richmond, target: 'Moon', track: true, fov: 30, show: DARK, tools: ['stopwatch', 'events'], events: 'phases' },
    steps: [
      `Synodic month (phase to phase): the Events finder lists the Moon’s phases. Write down the dates of several full Moons. What is the average interval, in days?`,
      `Sidereal month (star to star): note which stars the Moon is beside now, then step forward with the date box (<b>+1 day</b>, then <b>+1 h</b>) until it is back beside the same stars. How long did that take?`,
      `Lunar day: switch on the meridian (<kbd>;</kbd>, the green line from north to south) and zoom in on the Moon. Run on to the instant the line cuts the Moon in half, mark it, and do it again the next day.${FINE}`,
      `Why is the synodic month about two days longer than the sidereal month?`,
    ],
    about: `Tao’s corrections point out that the Moon goes round the sky in 24 h 50 min, and that the month from phase to phase is 29½ days, not 28. See ${tao}.` },

  // ------------------------------------------------------------------ The Sun
  { id: 'half-moon', group: 'The Sun', title: 'Distance of the Sun from the half Moon', who: 'Aristarchus',
    blurb: 'When the Moon is exactly half lit, how far is it from the Sun in the sky?',
    setup: { t: '2026-12-17T02:00:00Z', loc: P.tokyo, target: 'Moon', track: true, fov: 1.3, show: DARK, tools: ['stopwatch'] },
    steps: [
      `The Moon is selected. Step the clock until its panel says <b>Illuminated 50.00%</b> exactly. Mark the time.${FINE}`,
      `At that instant Sun, Moon and you make a right angle at the Moon. Zoom out until the Sun is in view too and measure the angle from the Moon to the Sun with ${ANGLE}, center to center, to 0.01°.`,
      `Distance to the Sun ÷ distance to the Moon = 1 ÷ cos(angle). What do you get? Aristarchus used 87°.`,
      `Aristarchus’s own version: the row in the angle tool follows Moon and Sun as you step. Find the instant the angle is exactly 90° and mark it. How long after the half Moon is it?`,
    ],
    about: `The angle is so close to 90° that a tiny error changes the answer enormously, and judging the instant of exact half phase by eye is hopeless: that, not the geometry, is why Aristarchus was out by a factor of 20. See ${tao}.` },
  { id: 'sun-moon-size', group: 'The Sun', title: 'Sun and Moon: the same size in the sky', who: 'Aristarchus',
    blurb: 'Compare their angular diameters during a solar eclipse.',
    setup: { t: '2024-04-08T18:25:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 1.5, show: { refraction: false, atmosphere: false }, tools: [] },
    steps: [
      `The atmosphere is switched off, so that the dark Moon can be seen outside the Sun (in a real sky it has the color of the sky there). With ${ANGLE} measure the Sun’s diameter and the Moon’s, edge to edge: click near each edge, where the other body is not in the way.`,
      `Their distances are in the ratio you found with the half Moon. What is the ratio of their true diameters?`,
      `Run the clock on to totality. Which of the two is slightly bigger today?`,
      `An annular eclipse leaves a ring of Sun. Open the Events finder (Labs menu) and find one: the list says what is seen of each at your place. Go to one, wherever it is seen: you can measure both diameters even where the Moon misses the Sun. Which is bigger then, and why does it change?`,
    ],
    about: `Equal angular size means size is proportional to distance, so the Sun is as many times bigger than the Moon as it is farther away. See ${tao}.` },
  { id: 'eratosthenes', group: 'The Sun', title: 'Size of the Earth from the noon Sun', who: 'Eratosthenes, about 240 BC',
    blurb: 'Noon altitude of the Sun at Syene and at Alexandria on the solstice.',
    setup: { t: '-000240-06-22T09:40:00Z', loc: P.syene, obs2: P.alexandria, align: 'stars', target: 'Sun', track: true, fov: 30, show: { meridian: true, azGrid: true, refraction: false, atmosphere: false }, tools: ['compare'] },
    steps: [
      `It is the summer solstice of 241 BC at Syene. Step the clock until the Sun is on the meridian, the green line (local noon). Read its altitude in its panel (<b>Az / Alt</b>). How far is it from straight overhead?${YEAR0(241)}`,
      `${SWAP} to stand in Alexandria. Find local noon there and read the altitude again.`,
      `The difference is the angle between the two cities at the center of the Earth. They are 5000 stadia apart: what is the Earth’s circumference?`,
    ],
    about: `This needs the Sun to be far enough away for its rays to be parallel, which Eratosthenes could take from Aristarchus. Syene is not exactly on the tropic and not exactly south of Alexandria. Dates before 1582 are proleptic Gregorian. See ${tao}.` },
  { id: 'sun-apsides', group: 'The Sun', title: 'The Earth’s oval orbit', who: 'Hipparchus',
    blurb: 'The Sun is slightly bigger in January than in July.',
    setup: { t: '2027-01-03T02:08:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 1.2, show: DARK, tools: ['events'], events: 'earthApsis' },
    steps: [
      `Use the Events finder to go to perihelion and to aphelion. Each time measure the Sun’s diameter from edge to edge with ${ANGLE}. (The row follows the Sun: one measurement is enough.)`,
      `Find the eccentricity of the Earth’s orbit: e = (big − small) ÷ (big + small).`,
    ],
    about: 'The seasons have nothing to do with it: the Earth is closest to the Sun in early January.' },
  { id: 'obliquity', group: 'The Sun', title: 'Tilt of the Earth’s axis', who: 'Eratosthenes; Ptolemy',
    blurb: 'Noon altitude of the Sun at the two solstices.',
    setup: { t: '2026-06-20T17:30:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 60, show: { meridian: true, azGrid: true, refraction: false }, tools: ['events'], events: 'seasons' },
    steps: [
      `In the Events finder click the June solstice. Step the clock until the Sun is on the meridian (the green line) and read its altitude (<b>Az / Alt</b> in its panel).`,
      `Do the same at the December solstice.`,
      `Half the difference is the tilt of the Earth’s axis. What is the average of the two, and what does it tell you about where you are?`,
    ],
    about: 'The Sun’s noon altitude swings by twice the obliquity over the year; its mean is 90° minus your latitude.' },

  // ------------------------------------------------------------------ The planets
  { id: 'zodiac', group: 'The planets', title: 'The planets keep to one band', who: 'Antiquity',
    blurb: 'How far do the Moon and planets stray from the ecliptic?',
    setup: { t: '2026-11-24T02:00:00Z', loc: P.richmond, look: { az: 180, alt: 45 }, target: '', fov: 150, show: { ecliptic: true, atmosphere: false, ground: false, conNames: false }, tools: [] },
    steps: [
      `The yellow line is the ecliptic, the Sun’s yearly path. Find every planet and the Moon (type a name in the search box, <kbd>/</kbd>).`,
      `Click each one and read its ecliptic latitude in its panel (<b>Ecliptic lon / lat</b>: the second number). Step forward a month at a time for a year (click the date and time: <b>+1 month</b>; the panel stays open and follows). What is the largest latitude you see for each?`,
      `What does that say about the shape of the solar system?`,
    ],
    about: `That the planets stay within a few degrees of the ecliptic means their orbits lie nearly in one plane. See ${tao}.` },
  { id: 'elongation', group: 'The planets', title: 'Sizes of the orbits of Venus and Mercury', who: 'Copernicus, 1543',
    blurb: 'The greatest angle each gets from the Sun.',
    setup: { t: '2026-12-20T12:00:00Z', loc: P.richmond, target: 'Venus', track: false, look: { az: 135, alt: 25 }, fov: 110, show: { ...DARK, ecliptic: true }, tools: [] },
    steps: [
      `With ${ANGLE} measure from the Sun to Venus. The row follows both as the date changes.`,
      `Step forward a few days at a time (<kbd>]</kbd> is one day): the angle grows, stops, and shrinks. What is the largest value, and on what date?`,
      `At that moment the line from you to Venus just grazes its orbit. Orbit radius = sin(greatest angle), in units of the Earth’s orbit.`,
      `Repeat for Mercury from January 2027 on: it reaches a greatest angle about every two months, first on one side of the Sun, then on the other. Do three or four: why are they not all the same?`,
    ],
    about: 'An inner planet can never be seen opposite the Sun. Mercury’s orbit is noticeably eccentric, so its greatest elongation ranges from 18° to 28°.' },
  { id: 'synodic', group: 'The planets', title: 'Periods of the planets', who: 'Copernicus, 1543',
    blurb: 'From opposition to opposition, then round the Sun.',
    setup: { t: '2020-01-01T00:00:00Z', loc: P.richmond, target: 'Mars', track: true, fov: 60, show: DARK, tools: ['events'], events: 'oppo' },
    steps: [
      `The Events finder is on <b>Oppositions and conjunctions</b>. Choose a planet and write down the dates of a run of oppositions (<b>Later ▶</b> shows more).`,
      `The average interval is the synodic period S. The Earth laps the planet once in that time, so 1/P = 1/365.25 − 1/S gives the planet’s own period P (all in days).`,
      `Do Mars, Jupiter and Saturn. For Venus use inferior conjunctions and 1/P = 1/365.25 + 1/S.`,
      `Why do the intervals between oppositions of Mars vary so much?`,
    ],
    about: `Copernicus got 687 days for Mars from a synodic period of 780 days. See ${tao}.` },
  { id: 'retrograde', group: 'The planets', title: 'The retrograde loop of Mars', who: 'Ptolemy; Copernicus; Kepler',
    blurb: 'Draw the path of Mars against the stars around opposition.',
    setup: { t: '2027-02-19T03:00:00Z', loc: P.richmond, target: 'Mars', track: true, fov: 50, show: { ...DARK, ecliptic: true }, trail: { body: 'Mars', step: 5 * DAY, before: 30, after: 30, frame: 'stars' }, tools: ['trails'] },
    steps: [
      `The pink line is the path of Mars over 300 days, one tick every 5 days. On what dates does Mars stop and turn round? (Zoom in: some ticks carry their date, and the angle tool names any tick you click.)`,
      `Measure the length of the backward (retrograde) part with ${ANGLE}: it snaps to the ticks.`,
      `Compare the middle of the loop with the date of opposition (Labs menu, <b>Events finder</b>, Oppositions and conjunctions). Explain the loop with the Earth overtaking Mars.`,
    ],
    about: `The Earth moves at 30 km/s and Mars at 24 km/s, so around opposition Mars falls behind against the stars. See ${tao}.` },
  { id: 'kepler-mars', group: 'The planets', title: 'Kepler’s triangulation of Mars', who: 'Kepler, 1609, with Tycho Brahe’s observations',
    blurb: 'Mars is back in the same place after 687 days; the Earth is not.',
    setup: { t: '2027-04-06T12:00:00Z', loc: P.richmond, target: 'Mars', look: { ra: 77, dec: 22.8 }, fov: 150, show: { ...DARK, ecliptic: true, conLines: false, conNames: false, starNames: false, dso: false }, trail: { body: 'Sun', step: 686.98 * DAY, before: 0, after: 1, frame: 'stars' }, tools: [] },
    steps: [
      `Date 1 is on the clock. The Sun is the bright one on the yellow line; Mars is labeled. With ${ANGLE} click the Sun, then Mars. Write the angle down, and note on which side of the Sun Mars is, along the yellow line (left is east, right is west).`,
      `The two pink dots with dates are the Sun’s place among the stars today (on the Sun itself) and one Mars year, 686.98 days, later (drag the sky to the left until you see it). Measure from the Sun to the other dot and write the angle down: that is how far short of two full laps the Earth is.`,
      `Step the clock forward one Mars year (click the date and time: <b>+1 Mars yr</b>). Mars is back at the same point of its orbit. Read the Sun–Mars angle again (the row follows the objects), and note the side: drag the sky until you see both, or search (<kbd>/</kbd>) for Mars.`,
      `Draw the Sun, the Earth’s two places (1 au from the Sun, separated by the angle from step 2) and the two sight lines to Mars, each at its angle from the Sun. Where they cross is Mars: how far is it from the Sun?`,
    ],
    about: `Repeating this for many pairs of dates gave Kepler the shape of both orbits. It fails when Mars is near opposition or conjunction, where the sight lines are nearly parallel. See ${tao}.` },
  { id: 'jupiter-mass', group: 'The planets', title: 'Weighing Jupiter', who: 'Galileo, 1610; Newton, 1687',
    blurb: 'Periods and orbit sizes of the four big moons.',
    setup: { t: '2026-11-24T09:00:00Z', loc: P.richmond, target: 'Jupiter', track: true, fov: 0.3, show: DARK, tools: ['stopwatch'] },
    notebook: true, obs: { seeing: 0.8, noise: 0 },
    template: { cols: [{ key: 'jd', kind: 'data', name: 'Julian Date', unit: 'd', sig: 0, raw: 'jd', rawLabel: 'Julian Date' }, { key: 'sep', kind: 'data', name: 'separation', unit: 'arcsec', sig: 0, raw: 'sep', rawLabel: 'Separation' }, { key: 'pa', kind: 'data', name: 'position angle', unit: 'deg', sig: 0, raw: 'pa', rawLabel: 'Position angle (north through east)' }] },
    steps: [
      'Pick a moon (click one to see its name). Step the clock by hours (<kbd>&gt;</kbd> is one hour) and measure its angle from Jupiter, center to center, with the angle tool (<kbd>R</kbd>) each time, until you have its greatest distance on one side. (With the lab notebook open, a click on Jupiter’s disc snaps to its center; a moon is placed by eye in the magnifier. <b>Record</b> copies each reading into your table.)',
      'Mark that time, carry on until it is back at greatest distance on the same side, and mark again: that is its period T.',
      'Orbit radius a = (greatest angle in radians: arcseconds ÷ 3600 × π ÷ 180) × (distance to Jupiter, from the info panel).',
      'Kepler’s third law: M = 4π² a³ / (G T²). Do all four moons: is a³/T² the same for each?',
    ],
    about: 'Galileo’s moons were the first clear case of things going round something other than the Earth; Newton used them to weigh Jupiter.' },
  { id: 'venus-phases', group: 'The planets', title: 'The phases of Venus', who: 'Galileo, 1610',
    blurb: 'Venus is small when full and large when a thin crescent.',
    setup: { t: '2026-06-01T01:30:00Z', loc: P.richmond, target: 'Venus', track: true, fov: 0.03, show: DARK, tools: [] },
    steps: [
      `Write down the date, the fraction of Venus that is lit (its panel: <b>Illuminated</b>) and its angular diameter, edge to edge with ${ANGLE}. The row follows Venus, so one measurement is enough.`,
      `Step forward a month at a time (click the date and time: <b>+1 month</b>) until Venus has passed between us and the Sun. Tabulate phase against size.`,
      `Can an Earth-centered system in which Venus always stays between us and the Sun produce a nearly full Venus?`,
    ],
    about: 'A full, small Venus means it is beyond the Sun; a large crescent means it is on our side. Venus goes round the Sun.' },

  // ------------------------------------------------------------------ The astronomical unit
  { id: 'venus-transit-1769', group: 'The astronomical unit', title: 'The transit of Venus, 1769', who: 'Halley’s method; Cook at Tahiti, Hell at Vardø',
    blurb: 'Time the transit from the Pacific and from the Arctic.',
    setup: { t: '1769-06-03T19:15:00Z', loc: P.tahiti, obs2: P.vardo, align: 'sun', target: 'Sun', track: true, fov: 0.8, show: DARK, tools: ['stopwatch', 'compare'] },
    steps: [
      `Venus will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `You are at Point Venus, Tahiti. ${RUN.replace("run", "Run")} until Venus bites into the Sun’s edge. Click Venus, press <kbd>T</kbd> to follow it and zoom far in. Mark <b>second contact</b>.${FINE}`,
      `Run on, and mark <b>third contact</b>. (<kbd>Space</kbd> brings Venus back to the middle.) The time between the two marks is the duration of the transit at Tahiti.`,
      `${SWAP} and time the same two contacts from Vardø, in the Arctic. The stopwatch keeps the two places apart.`,
      `Go to mid-transit, half-way between the contacts, and zoom until Venus is a disc. The dashed circle is Venus as the other observer sees it at that instant (the two Suns are drawn on top of each other). Measure from Venus to the other Venus, center to center, with ${ANGLE}.`,
      `Seen square-on from the Sun, Tahiti and Vardø are 10,470 km apart. Venus was 0.289 au from us and the Sun 1.015 au, so the shift in radians is baseline × (1/0.289 − 1/1.015) ÷ (1 au). How many km is an astronomical unit?${RADIANS}`,
    ],
    about: `The straight line between the two places is 11,410 km long; only the part square-on to the Sun counts. Seen from two latitudes Venus crosses the Sun on two slightly different chords of different lengths, so the durations differ by minutes: Halley’s way to turn clocks into a parallax. From Kepler’s third law the shift of Venus against the Sun is (1/0.289 − 1/1.015) times the baseline in au. See ${tao}.` },
  { id: 'venus-transit-2012', group: 'The astronomical unit', title: 'The transit of Venus, 2012', who: 'The last one until 2117',
    blurb: 'The same measurement with modern places.',
    setup: { t: '2012-06-05T22:00:00Z', loc: P.honolulu, obs2: P.sydney, align: 'sun', target: 'Sun', track: true, fov: 0.8, show: DARK, tools: ['stopwatch', 'compare'] },
    steps: [
      `Venus will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `You are in Honolulu. Click Venus, press <kbd>T</kbd> to follow it and zoom far in. ${RUN.replace("run", "Run")} and mark <b>second contact</b> and <b>third contact</b>.${FINE}`,
      `${SWAP} and time the same two contacts from Sydney. How do the durations compare?`,
      `At mid-transit zoom until Venus is a disc. With ${ANGLE} measure from Venus to the other observer’s Venus (dashed), center to center, and Venus’s own diameter, edge to edge.`,
      `Seen square-on from the Sun, Honolulu and Sydney are 7,490 km apart. The shift of Venus against the Sun, in radians, is baseline × (1/0.2887 − 1/1.0147) ÷ (1 au). Estimate the astronomical unit.${RADIANS}`,
    ],
    about: 'In a straight line the two places are 7,620 km apart. Both places saw the whole transit. Venus was 0.2887 au from the Earth and the Sun 1.0147 au.' },
  { id: 'mercury-transit', group: 'The astronomical unit', title: 'A transit of Mercury', who: 'Gassendi, 1631; Halley, 1677',
    blurb: 'Mercury crosses the Sun about 13 times a century.',
    setup: { t: '2019-11-11T12:30:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 0.8, show: DARK, tools: ['stopwatch'] },
    steps: [
      `Mercury will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `Click Mercury (or find it with the search box, <kbd>/</kbd>), press <kbd>T</kbd> to follow it and zoom far in. ${RUN.replace("run", "Run")}, then step, and mark all four contacts.${FINE}`,
      `With ${ANGLE} measure Mercury’s diameter, edge to edge, and its distance from the center of the Sun (zoom out and click well inside the Sun). The row follows them: run on to the least distance.`,
      `Compare Mercury’s size with that of Venus in the 2012 transit. Why did Halley prefer Venus for finding the Sun’s distance?`,
    ],
    about: 'Mercury is small and far from us during a transit, so its parallax against the Sun is too small to time well.' },
  { id: 'mars-parallax', group: 'The astronomical unit', title: 'Parallax of Mars, 1672', who: 'Cassini in Paris and Richer in Cayenne',
    blurb: 'Mars at a close opposition, from two continents.',
    setup: { t: '1672-09-05T01:00:00Z', loc: P.paris, obs2: P.cayenne, align: 'stars', target: 'Mars', track: true, fov: 0.04, show: DARK, tools: ['compare'] },
    steps: [
      `Mars is near a very close opposition. The dashed circle is Mars as seen from Cayenne at the same instant. Measure the shift, center to center, in arcseconds, with ${ANGLE}.`,
      `Seen square-on from Mars, Paris and Cayenne are 6,610 km apart. Estimate the distance to Mars in km.${RADIANS}`,
      `From Kepler’s laws Mars was 0.381 au from the Earth that night. How long is an astronomical unit?`,
    ],
    about: 'In a straight line the two places are 6,720 km apart; the part square-on to Mars is 6,610 km. This gave the first decent value of the Sun’s distance, about 140 million km. Not in Tao’s account, but the same idea as the transit of Venus.' },

  // ------------------------------------------------------------------ Light
  { id: 'romer', group: 'Light', title: 'The speed of light from Io', who: 'Rømer, 1676',
    blurb: 'Io’s eclipses run late when Jupiter is far away.',
    setup: { t: '2025-08-04T05:10:00Z', loc: P.richmond, target: 'Jupiter', track: true, fov: 0.07, show: DARK, lightTime: true, tools: ['stopwatch', 'corrections'] },
    steps: [
      `Light takes time to cross the solar system, so you see Jupiter and its moons as they <b>were</b>. Io is about to go into Jupiter’s shadow, just beside the planet: it fades over about 3½ minutes. ${RUN.replace("run", "Run")}, step to the instant Io is completely gone, and mark it.${FINE}`,
      `Click Jupiter and write down its distance from you now (its panel, in au).`,
      `Switch the light’s journey off: ${LIGHT} (also in <b>Corrections</b>). The sky now shows where things really are at each instant. Io is already gone, so step back an hour (<kbd>&lt;</kbd>). Run on and mark the same moment, Io completely gone.`,
      `The time between the two marks is how late you see it happen: the delay. Write it beside the distance.`,
      `Switch it on again: ${LIGHT}. Now a date when Jupiter is much nearer: ${GOTO("2025-12-11T09:50:00Z", "Go to 11 December 2025")}. Do the same again: mark Io gone, read the distance, switch light-travel time off, step back an hour, mark Io gone.`,
      `Between the two dates the light’s journey to you became shorter by so many au, and the delay shorter by so many seconds. Speed of light = (difference of the distances) ÷ (difference of the delays). 1 au = 149.6 million km.`,
      `Rømer had no switch. With light-travel time on, time several eclipses of Io as Jupiter comes nearer (one every 42.5 hours). Predict the last one from the first with a steady period: how far off is it?`,
    ],
    about: `Rømer found the eclipses about 10 minutes late or early compared with a steady schedule, and Huygens turned that into a speed. At opposition the shadow is straight behind the planet, and Io goes behind Jupiter’s edge before it can fade; that is why the two dates are a month before opposition and six weeks after Jupiter passed behind the Sun. See ${tao}.` },
  { id: 'aberration', group: 'Light', title: 'Aberration of starlight', who: 'Bradley, 1727',
    blurb: 'Every star traces a small yearly ellipse.',
    setup: { t: '2026-03-21T00:00:00Z', loc: P.greenwich, target: 'Eltanin', track: true, fov: 0.03, show: DARK, tools: ['corrections'] },
    steps: [
      `This is γ Draconis, the star Bradley watched pass overhead in London. Zoomed in this far its panel gives its coordinates (J2000) to 0.01″.`,
      `Write down its declination now (<b>RA / Dec (J2000)</b>, the second value), then step forward a month at a time for a year (click the date and time: <b>+1 month</b>).`,
      `Plot declination against date. What is the half-range, in arcseconds? In which months are the extremes?`,
      `Switch <b>Annual aberration</b> off in Corrections and step through the year again. What is left?`,
      `The full effect is 20.5″ = (Earth’s speed) ÷ (speed of light), as an angle in radians. The Earth’s orbital speed is the length of its orbit (2π × 1 au) divided by a year. Find the speed of light.${RADIANS}`,
    ],
    about: 'Bradley was looking for parallax. He found a shift 40 times too big and three months out of step: the direction light seems to come from tilts toward the Earth’s motion, like rain seen from a moving car.' },

  // ------------------------------------------------------------------ The stars
  { id: 'parallax', group: 'The stars', title: 'Distance of a star by parallax', who: 'Bessel, 1838',
    blurb: '61 Cygni shifts as the Earth goes round the Sun.',
    setup: { t: '2026-06-01T00:00:00Z', loc: P.richmond, target: { hip: 104214 }, track: true, fov: 0.004, show: DARK, fx: { aberration: false, properMotion: false, parallax: true }, tools: ['corrections'] },
    steps: [
      `This is 61 Cygni A. Aberration and proper motion are switched off so that only parallax moves the star. Its panel gives its coordinates (J2000) to 0.01″.`,
      `Write down RA and Dec, then step a month at a time for a year (click the date and time: <b>+1 month</b>).`,
      `Turn the RA changes into arcseconds (1 s of RA = 15″ × cos Dec) and plot the yearly loop. Half its length is the parallax p.`,
      `Distance in parsecs = 1 ÷ p (in arcseconds). 1 parsec is 3.26 light-years: how many light-years is that?`,
      `Switch proper motion and aberration back on: what would Bessel actually have had to untangle?`,
    ],
    about: `The parallax here comes from the distance in the HYG star catalog, so this recovers a catalog value; it is the size and timing of the loop that the lab shows. The Greeks’ failure to see any parallax was their best argument against a moving Earth. See ${tao}.` },
  { id: 'barnard-parallax', group: 'The stars', title: 'Barnard’s star: parallax and proper motion', who: 'Barnard, 1916; a notebook lab',
    blurb: 'Follow the fastest star in the sky against faint background stars for a year or two.',
    setup: { t: '2026-03-01T04:00:00Z', loc: P.richmond, target: { hip: 87937 }, track: true, fov: 0.03, mount: 'eq',
      show: { ...DARK, conLines: false, conNames: false, dso: false }, fx: { aberration: false, parallax: true, properMotion: true }, tools: ['measure'] },
    notebook: true, obs: { seeing: 0.8, noise: 0.02 }, template: ASTROMETRY_TEMPLATE,
    steps: ASTROMETRY_STEPS('Barnard’s star, a faint red dwarf'),
    about: ASTROMETRY_ABOUT('Barnard’s star') },
  { id: 'proxima-parallax', group: 'The stars', title: 'Proxima Centauri: the nearest star', who: 'Innes, 1915; a notebook lab',
    blurb: 'Measure the parallax of the Sun’s nearest neighbor from the southern sky.',
    setup: { t: '2026-01-15T02:00:00Z', loc: P.capetown, target: { hip: 70890 }, track: true, fov: 0.03, mount: 'eq',
      show: { ...DARK, conLines: false, conNames: false, dso: false }, fx: { aberration: false, parallax: true, properMotion: true }, tools: ['measure'] },
    notebook: true, obs: { seeing: 0.8, noise: 0.02 }, template: ASTROMETRY_TEMPLATE,
    steps: ASTROMETRY_STEPS('Proxima Centauri, a dim red dwarf that never rises for most of Europe and North America (you are at Cape Town)'),
    about: ASTROMETRY_ABOUT('Proxima Centauri') },
  { id: 'proper-motion', group: 'The stars', title: 'A star that moves', who: 'Halley, 1718; Barnard, 1916',
    blurb: 'Barnard’s star crosses the sky faster than any other.',
    setup: { t: '2026-06-01T00:00:00Z', loc: P.richmond, target: { hip: 87937 }, track: false, fov: 0.12, show: DARK, fx: { aberration: false, parallax: false, properMotion: true }, tools: ['corrections'] },
    steps: [
      `This is Barnard’s star. Open ${ANGLE} and switch <b>Snap</b> off, so that your clicks mark places on the sky and not the star itself. Click the star once.`,
      `Step the clock forward 10 years (click the date and time: <b>+1 year</b>): the star walks away from your mark. Click the star again. How far did it move, and so how many arcseconds per year?`,
      `What speed across the line of sight is that, in km/s? Use the distance you measured in the Barnard’s star parallax lab, or the one your instructor gives you. (1″ per year at 1 pc is 4.74 km/s.)`,
    ],
    about: 'Proper motions are from the HYG catalog and are applied as straight-line drifts.' },
  { id: 'canopus', group: 'The stars', title: 'A star you cannot see from Greece', who: 'Aristotle; Posidonius, about 100 BC',
    blurb: 'Canopus skims the horizon at Rhodes and stands higher at Alexandria.',
    setup: { t: '-000099-01-20T19:30:00Z', loc: P.rhodes, obs2: P.alexandria, align: 'stars', target: 'Canopus', track: true, fov: 40, show: { meridian: true, azGrid: true, refraction: false, atmosphere: false }, tools: ['compare'] },
    steps: [
      `You are in Rhodes about 100 BC, looking south. Step the clock forward until Canopus is on the meridian, the green line (<kbd>Shift</kbd> + <kbd>↑</kbd> is 1 minute), and read its altitude (<b>Az / Alt</b>).${YEAR0(100)}`,
      `${SWAP} to stand in Alexandria. Step (back, this time) until Canopus is on the meridian there, and read its altitude.`,
      `The difference is the difference in latitude. Posidonius took it to be 1/48 of a circle and the distance to be 5000 stadia: what circumference does that give? What does your measurement give?`,
      `Back in Rhodes (${SWAP}), switch refraction on (<kbd>F</kbd>). What does it do to a star this low?`,
    ],
    about: `Aristotle noted that travellers going south see stars that never rise in Greece, so the Earth is curved and not very big. See ${tao}.` },

  // ------------------------------------------------------------------ Time and the calendar
  { id: 'sidereal-day', group: 'Time and the calendar', title: 'The sidereal day', who: 'Antiquity',
    blurb: 'A star returns to the meridian a little early each night.',
    setup: { t: '2026-11-24T03:30:00Z', loc: P.richmond, look: { az: 180, alt: 45 }, target: '', fov: 60, show: { meridian: true, atmosphere: false }, tools: ['stopwatch'] },
    steps: [
      `Click a bright star just left (east) of the green meridian line. Step the clock until its <b>Hour angle</b> in its panel is +00h 00m 00s. Mark the time.${FINE}`,
      `Step forward one day (<kbd>]</kbd>), then adjust until the same star is on the meridian again. Mark. How long is the star’s day?`,
      `Do the same for the Sun (noon to noon) at a few dates in the year. Is the solar day always 24 h 00 m 00 s?`,
      `How many more times does the Earth turn in a year than there are days?`,
    ],
    about: 'The difference, about 4 minutes a day, adds up to exactly one extra turn in a year because the Earth also goes once round the Sun.' },
  { id: 'analemma', group: 'Time and the calendar', title: 'The analemma', who: 'The equation of time',
    blurb: 'Where the Sun is at clock noon through the year.',
    setup: { t: '2026-01-01T17:00:00Z', loc: P.richmond, look: { az: 180, alt: 48 }, target: '', fov: 85, show: { atmosphere: false, meridian: true, conLines: false, conNames: false, starNames: false, dso: false }, trail: { body: 'Sun', step: 10 * DAY, before: 0, after: 36, frame: 'horizon' }, tools: ['trails'] },
    steps: [
      `Each tick is the Sun at 12:00 Eastern Standard Time, ten days apart, for a year. Which dates are at the top and bottom of the figure 8? (Some ticks carry their date; the angle tool names any tick you click.)`,
      `Measure the height of the figure with ${ANGLE} (it snaps to the ticks). Half of it is the tilt of the Earth’s axis.`,
      `Measure its greatest width east–west. The sky turns 1° in 4 minutes: how many minutes does that make, from the fastest to the slowest sundial?`,
      `Why is the figure not centered on the meridian line here?`,
    ],
    about: 'The height comes from the tilt of the axis; the width from the tilt and from the Earth’s oval orbit together. Richmond is west of the middle of its time zone, so the whole figure sits east of the meridian at clock noon.' },
  { id: 'polaris-latitude', group: 'Time and the calendar', title: 'Latitude from the pole star', who: 'Navigators',
    blurb: 'Polaris is not quite at the pole.',
    setup: { t: '2026-11-24T02:00:00Z', loc: P.richmond, target: 'Polaris', track: true, fov: 8, show: { azGrid: true, meridian: true, refraction: false, atmosphere: false }, tools: ['stopwatch'] },
    steps: [
      `Polaris is selected. Step the clock by hours (<kbd>&gt;</kbd>) over a whole day and find its greatest and least altitude (<b>Az / Alt</b> in its panel).`,
      `The mean of the two is the altitude of the celestial pole, which is your latitude. How far is Polaris from the pole?`,
      `Switch refraction on (<kbd>F</kbd>): how much does it change the answer?`,
    ],
    about: 'A navigator who simply took the altitude of Polaris could be most of a degree out.' },
  { id: 'precession-pole', group: 'Time and the calendar', title: 'The wandering pole', who: 'Hipparchus, about 130 BC',
    blurb: 'Which star marked the pole when the pyramids were built?',
    setup: { t: '-002700-03-01T20:00:00Z', loc: { name: 'Giza', region: 'Egypt', lat: 29.98, lon: 31.13, tz: 'Africa/Cairo' }, target: 'Thuban', track: true, fov: 25, show: { eqGrid: true, atmosphere: false } },
    steps: [
      `It is 2701 BC. The blue grid is the equatorial grid of that date; its center is the celestial pole. Thuban is selected: read its declination <b>of date</b> in its panel. How far is it from the pole (declination +90°)?${YEAR0(2701)}`,
      `Find Polaris (search box, <kbd>/</kbd>) and read how far it was from the pole then.`,
      `Step forward a century at a time (click the date and time: <b>+100 yr</b>) to the present and a little beyond. In which century is Polaris closest to the pole?`,
      `The pole goes round a circle of radius 23.4° once in about 25,800 years. How far does it move in your lifetime?`,
    ],
    about: 'The app covers the years −3000 to +3000, so Vega as pole star (about AD 14000) is out of range. Dates this old are proleptic Gregorian.' },
  { id: 'precession-equinox', group: 'Time and the calendar', title: 'Precession of the equinoxes', who: 'Hipparchus, about 130 BC',
    blurb: 'Spica’s distance from the equinox changed between two observers.',
    setup: { t: '-000293-09-25T18:00:00Z', loc: P.alexandria, target: 'Spica', track: true, fov: 40, show: { ecliptic: true, equator: true, atmosphere: false, ground: false } },
    steps: [
      `It is 294 BC, the time of Timocharis in Alexandria. The equator (blue) and ecliptic (yellow) cross at the autumn equinox point, ecliptic longitude 180°. Spica is selected: read its ecliptic longitude of date (<b>Ecliptic lon / lat</b>, the first number).${YEAR0(294)}`,
      `Go to 129 BC, the time of Hipparchus (type −128 in the date box’s Year), and read it again.`,
      `How many degrees per century is that? How long for the equinox to go once round the sky?`,
      `Do the same between 129 BC and today.`,
    ],
    about: 'Hipparchus found that Spica was 6° from the equinox where Timocharis had found 8°, and concluded the equinox moves at least 1° a century. Precession here is the full IAU model in astronomy-engine.' },
];

export const labById = (id) => LABS.find((l) => l.id === id);
