// labs/presets.js: the classic measurements as presets. Each sets the date, place, target, zoom and
// the needed toggles (see setup.js for the fields) and gives the student a short prompt of what to
// measure. NO ANSWERS here: the values the instructor should expect are in planetarium/LABS.md.

import * as V from '../variables.js';
import { sb2Elements } from '../spectro.js';
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
const RADIANS = HELP('A small angle, in <b>radians</b>, is <span class="frac"><span>size</span><span>distance</span></span>. From degrees: <span class="frac"><span>radians</span><span>π</span></span> = <span class="frac"><span>degrees</span><span>180</span></span>. 1° = 60′ = 3600″.');
const YEAR0 = (bc) => HELP(`The clock shows −${String(bc - 1).padStart(4, '0')} for ${bc} BC: astronomers count a year 0 (1 BC), so the two differ by one.`);
const ANGLE = 'the angle tool (<kbd>R</kbd>)';
const SWAP = '<button class="btn" data-do="swap">Swap observers</button>';
const SQUARE = (from) => `<button class="btn" data-do="square" data-from="${from}">Earth seen square-on</button>`;
const LIGHT = '<button class="btn" data-do="light">Light-travel time on / off</button>';
const GOTO = (t, text) => `<button class="btn" data-do="goto" data-t="${t}">${text}</button>`;
// the four contacts of a transit, in pictures: the planet (black) and the top edge of the Sun
const CONTACTS = (() => {
  const one = (x, y, dir, t) => `<svg x="${x}" y="0" width="66" height="46" viewBox="0 0 66 46"><rect width="66" height="46" rx="5" fill="#0a111c"/><circle cx="33" cy="92" r="66" fill="#f0c766"/><circle cx="33" cy="${y}" r="7.500" fill="#111823" stroke="#8fa2b8" stroke-width="1"/><path d="M52 ${dir > 0 ? '8v14m-3.500-4.500l3.500 4.500l3.500-4.500' : '22V8m-3.500 4.500l3.500-4.500l3.500 4.500'}" stroke="#9fc2ff" stroke-width="1.500" fill="none"/></svg><text x="${x + 33}" y="59" text-anchor="middle" font-size="11" fill="#c3cfdc" font-family="Source Sans 3, system-ui, sans-serif">${t}</text>`;
  return '<svg class="lab-fig" viewBox="0 0 282 64" role="img" aria-label="First contact: the planet touches the edge of the Sun from outside. Second: it is just completely inside. Third: it touches the edge again from inside, on its way out. Fourth: it leaves the edge.">' + one(0, 18.5, 1, '1st') + one(72, 33.5, 1, '2nd') + one(144, 33.5, -1, '3rd') + one(216, 18.5, -1, '4th') + '</svg>';
})();

// ---- the standard-candle labs (js/variables.js, js/photometer.js): brightness from a photometer, by comparison with a steady star ----
// truth(): what THIS student's sky holds (their seed shifts the models), shown on the lab card only with instructor=1
const f2 = (x) => x.toFixed(2), f3 = (x) => x.toFixed(3), pcOf = (mu) => Math.pow(10, mu / 5 + 1), BEN = (P) => -2.43 * (Math.log10(P) - 1) - 4.05;
const dateOf = (jd) => new Date((jd - 2440587.5) * DAY).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
const CAL = [110991, 97804, 34088, 26069, 47854, 87072, 89968, 102949];
const TRUTH = {
  'cepheid-distance': () => { const t = V.varTruth(110991), M = BEN(t.P); return `δ Cep: P ${f3(t.P)} d, mean V ${f2(t.mean)} (range ${f2(t.max)}–${f2(t.min)}); Benedict M ${f2(M)}; distance ${pcOf(t.mean - M).toFixed(0)} pc.`; },
  'rr-lyrae': () => { const t = V.varTruth(95497); return `RR Lyr: P ${(t.P * 24).toFixed(2)} h, mean V ${f2(t.mean)} (range ${f2(t.max)}–${f2(t.min)}); with M = +0.6, ${pcOf(t.mean - 0.6).toFixed(0)} pc.`; },
  'cepheid-calibrate': () => CAL.map((h) => { const t = V.varTruth(h); return `${t.name}: P ${f3(t.P)} d, mean ${f2(t.mean)}`; }).join('; ') + `. M31 V1: P ${f2(V.transientTruth('M31-V1').P)} d, mean ${f2(V.transientTruth('M31-V1').mean)}.`,
  'sn-ia': () => { const a = V.transientTruth('SN2011fe'), b = V.transientTruth('SN2014J'), M = a.peak - 29.19; return `SN 2011fe: peak V ${f2(a.peak)} on ${dateOf(a.tPeak)}, so M ${f2(M)}. SN 2014J: peak ${f2(b.peak)} on ${dateOf(b.tPeak)}; M82 at ${(pcOf(b.peak - M) / 1e6).toFixed(1)} Mpc.`; },
  'sn-types': () => { const a = V.transientTruth('SN2011fe'), b = V.transientTruth('SN2023ixf'); return `SN 2011fe (Ia): peak ${f2(a.peak)} on ${dateOf(a.tPeak)}. SN 2023ixf (II): peak ${f2(b.peak)} on ${dateOf(b.tPeak)}. Ratio of peak luminosities ${Math.pow(10, 0.4 * (b.peak - a.peak)).toFixed(2)}.`; },
};
TRUTH.hubble = () => 'Velocities ≈ c × the catalogue z (OpenNGC): M101 +243, M82 +219, M31 −300 km/s; NGC 4254 2,428; 5987 3,010; 5908 3,348; 5533 3,875; 3646 4,263; 2998 4,770; 4921 5,471; 3891 6,290; 2955 7,094; 4662 6,975; 6195 8,991 km/s (pinning the K line to ±0.1 nm is ±80 km/s). M101: 6.85 Mpc × 23.99′ gives D ≈ 47.8 kpc; then d = 32.6, 42.8, 48.8, 57.5, 53.2, 67.3, 83.8, 95.5, 103.4, 89.8, 114.1 Mpc in that order, and the line through the origin has H0 ≈ 72 km/s/Mpc, 1/H0 ≈ 13.6 billion years. Calibrated on M31 instead (0.78 Mpc × 177.8′, D ≈ 40.3 kpc): H0 ≈ 85, 11.5 billion years.';
TRUTH['star-colors'] = () => 'Model, no noise (each exposure ~0.5%, so a ratio ±0.01): temperature from the Hipparcos type, as the Spectrograph. Alnitak O9.5 Ib 31,650 K, B/R 1.76; Bellatrix B2 III 20,600 K, 1.56; Rigel B8 Ia 12,500 K, 1.22; Sirius A0 9,700 K, 1.00; Castor A2 V 8,840 K, 0.92; Procyon F5 IV-V 6,510 K, 0.63; Polaris F7 Ib 6,280 K, 0.60; Capella G8 III 4,800 K, 0.38; Pollux K0 III 4,660 K, 0.35; Aldebaran K5 III 4,050 K, 0.26; Betelgeuse M2 Ib 3,690 K, 0.21. Step 5: a 1% ratio error is about ±13 K near 3,500 K but about ±1,300 K near 30,000 K.';
TRUTH['star-spectra'] = () => 'Model types and temperatures (peak = 2.898e6 / T): Alnitak O9.5 Ib 31,650 K (92 nm, UV); Bellatrix B2 III 20,600 K (141 nm); Rigel B8 Ia 12,500 K (232 nm); Sirius A0 V 9,700 K (299 nm, just off the left end of the wide view); Castor A2 V 8,840 K (328 nm); Procyon F5 IV-V 6,510 K (445 nm); Polaris F7 Ib 6,280 K (461 nm); Capella G8 III 4,800 K (604 nm); Aldebaran K5 III 4,050 K (715 nm); Betelgeuse M2 Ib 3,690 K (785 nm). Peaks read off the curve sit a little off these where lines or bands crowd them (M stars most). Rules in the model (depth below the continuum): Hδ / G band: Procyon 0.15 / 0.11, Polaris 0.11 / 0.16, Capella 0.05 / 0.42; Ca I 422.7 / G band: Capella 0.17 / 0.42, Aldebaran 0.44 / 0.29.';
TRUTH['hr-diagram'] = () => 'Model, no noise (comparison Alhena V 1.93; T from the formula 9410 / (0.98 − ln B/R), which reads low above 10,000 K; L is the V-band luminosity). Star: T (type T) · M · L/L☉ · R/R☉. Main sequence: σ Ori 22,660 K (31,650) · −3.82 · 2,870 · 3.5; Regulus 13,230 (14,000) · −0.57 · 144 · 2.3; Sirius 9,600 · 1.45 · 22 · 1.7; Castor 8,800 · 0.61 · 49 · 3.0; Procyon 6,530 · 2.67 · 7.3 · 2.1; π³ Ori 6,410 · 3.66 · 3.0 · 1.4; χ¹ Ori 5,930 · 4.70 · 1.13 · 1.00; ε Eri 5,040 · 6.18 · 0.29 · 0.70; Groombridge 1618 3,980 · 8.16 · 0.047 · 0.45; Lalande 21185 3,550 · 10.46 · 0.0056 · 0.20. Giants: Mirzam 20,370 (26,000) · −3.92 · 3,150 · 4.5; Bellatrix 17,620 (20,600) · −2.80 · 1,130 · 3.6; Capella 4,800 · −0.51 · 137 · 17; Pollux 4,660 · 1.08 · 32 · 8.6; Aldebaran 4,040 · −0.68 · 160 · 26. Supergiants: Rigel 12,040 (12,500) · −6.93 · 50,700 · 52; Polaris 6,300 · −3.62 · 2,390 · 41; Wezen 6,190 · −6.63 · 38,500 · 171; Betelgeuse 3,680 · −5.47 · 13,200 · 282. White dwarf: Van Maanen’s Star 6,170 · 14.22 · 0.00018 · 0.0116 (1.3 Earths). Expect a few % scatter from noise; the hot stars’ T and R are the least certain.';
TRUTH['kepler-earth'] = () => 'Without the 1′ reading errors: Earth’s circle off center by 0.0166 of its radius toward longitude 283° (true e = 0.0167, aphelion at 283°); Sun–Mars at λ0 = 1.622 au. With the errors, expect ±0.003 in the offset and ±20° in its direction.';
TRUTH['kepler-orbit'] = () => 'Without the reading errors (Earth circle c = 0.0166, φ = 283°): 10 of the 12 pairs pass the 0.15 cut; r from 1.383 to 1.665 au, a = 1.524 au, e = 0.092 (true 1.5237, 0.0934); a fitted circle’s center 0.143 au from the Sun. Angle per day varies by about ±18%, swept area per day by about 1%.';
TRUTH.binaries = () => {
  const a = V.varTruth(14576), b = sb2Elements(65474, V.getModelSeed()), lost = 1 - Math.pow(10, -0.4 * (a.min - a.max));
  const start = 2461700.97917, n = Math.ceil((start - a.epoch) / a.P), m1 = a.epoch + n * a.P, m2 = m1 + a.P;
  const msin = 1.0361e-7 * (b.K1 + b.K2) ** 3 * b.P, s3 = Math.sin(b.inc * Math.PI / 180) ** 3, M = msin / s3;
  const vs = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => { const jd = 2461703.5 + k / 2, s = Math.sin(2 * Math.PI * (jd - b.T0) / b.P); return `${((jd - start) * 24).toFixed(1)} h: ${(b.gamma + b.K1 * s).toFixed(0)}/${(b.gamma - b.K2 * s).toFixed(0)}`; });
  return `Algol (model): minima at ${dateOf(m1)} (${((m1 - start) * 24).toFixed(2)} h after the start) and ${dateOf(m2)} (${((m2 - start) * 24).toFixed(2)} h); P ${a.P.toFixed(4)} d = ${(a.P * 24).toFixed(2)} h; V ${f2(a.max)} out of eclipse, ${f2(a.min)} at minimum: ${(100 * lost).toFixed(0)}% of the light lost; eclipse ${(a.dur * 24).toFixed(1)} h from first to last contact; secondary 0.06 mag half a period later. `
    + `Spica (circular model): velocities star 1 / star 2 (km/s) at the eight times: ${vs.join('; ')}. K1 ${b.K1.toFixed(1)}, K2 ${b.K2.toFixed(1)} km/s, P ${b.P.toFixed(4)} d; M1/M2 = ${(b.K2 / b.K1).toFixed(2)}; (M1+M2) sin³i = ${msin.toFixed(1)} M☉; with i = ${b.inc}° (sin³i ${s3.toFixed(3)}): M1+M2 = ${M.toFixed(1)}, M1 ${(M * b.K2 / (b.K1 + b.K2)).toFixed(1)}, M2 ${(M * b.K1 / (b.K1 + b.K2)).toFixed(1)} M☉ (published 11.43 and 7.21). Pins good to ±0.01 nm (±5 km/s) give the masses to about 10%.`;
};
export const truthFor = (id) => (TRUTH[id] ? TRUTH[id]() : null);
const PHOTO_TEMPLATE = { cols: [
  { key: 'jd', kind: 'data', name: 'date', unit: 'd', sig: 0, raw: 'jd', rawLabel: 'Julian Date' },
  { key: 'n', kind: 'data', name: 'counts', unit: 'counts', sig: 0, raw: 'counts', rawLabel: 'Counts in one exposure' },
  { key: 'obj', kind: 'text', name: 'star', raw: 'obj', rawLabel: 'Name' }] };
const CANDLE_SHOW = { ...DARK, conLines: true, conNames: true, dso: true };
const PHOTOMETRY = (comp) => [
  `The star in the middle changes in brightness. Click it (if its panel shrinks to a name at the top left, click the name): the panel has a <b>Photometer</b> row, the counts a detector collects from it in one exposure. The ground and the daylight are switched off, so any date and hour will do.`,
  `Pick a <b>comparison star</b> near it that does not vary, with a magnitude given in its panel${comp ? ` (${comp} will do)` : ''}. Write down its magnitude, and read its counts several times (step the clock a second between readings, with <kbd>Shift</kbd> + <kbd>→</kbd> or <b>+1 s</b> in the date box at the bottom: each second is a new exposure). Average them.`,
  `Set up your notebook: columns of your own, with names and units. <b>Choose what Record copies</b> (the Julian Date and the counts are among the readings). Then record the variable star’s counts, select it first.`,
  `A magnitude from counts: <i>m</i> = <i>m</i><sub>comparison</sub> − 2.5 log <span class="frac"><span>counts</span><span>counts<sub>comparison</sub></span></span>. Add it as a formula column.` + HELP('Brighter means more counts and a SMALLER magnitude. Five magnitudes is a factor of 100 in counts.'),
];
const CANDLE_ABOUT = 'The variable stars’ brightness is a <b>model</b>, not a record of what the star did: a smooth curve through the period, the range, a date of maximum and the rise time listed in the General Catalogue of Variable Stars. Real light curves have bumps this one lacks, and the phase today can be off by part of a cycle, because periods drift and some catalog dates are decades old. '
  + 'The counts are simulated too: photon noise and a half-percent wobble from exposure to exposure, a fixed function of your notebook seed and the clock second. ' + 'Each student’s sky is also a slightly different version of the model, set by the notebook seed: the stars’ and supernovae’s brightness is shifted by about the uncertainty in the published numbers (a few hundredths of a magnitude). Your answer should agree with your classmates’ within your uncertainties, not to the last digit.';

// the Kepler labs: dates and two ecliptic longitudes (with simulated 1′ errors, running.lonErr) per row
const KEPLER_TEMPLATE = { cols: [
  { key: 'jd', kind: 'data', name: 'date', unit: 'd', sig: 0, raw: 'jd', rawLabel: 'Julian Date' },
  { key: 'ls', kind: 'data', name: 'Sun longitude', unit: 'deg', sig: 0, raw: 'sunlon', rawLabel: 'The Sun' },
  { key: 'lm', kind: 'data', name: 'Mars longitude', unit: 'deg', sig: 0, raw: 'elon', rawLabel: 'The selected object' }] };

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
const ASTROMETRY_ABOUT = (name) => `${name} is one of the Sun’s nearest neighbors, so it does two things a distant star does not. It drifts steadily across the sky (its <b>proper motion</b>, because it really is moving through space relative to the Sun), and once a year it swings round a small ellipse (its <b>parallax</b>, because we look at it from a moving Earth). The half-length of that ellipse’s long axis is the parallax <i>p</i>, and the distance in parsecs is <span class="frac"><span>1</span><span><i>p</i></span></span>, with <i>p</i> in arcseconds. The ellipse, and why it is not a line, is explained in the notebook under <b>About this model</b> for “Ellipse with a steady drift”. `
  + 'The angle tool gives a separation and a position angle (from north, through east). The separation is the long side of a right-angled triangle whose other sides lie along north and along east; which of the two is the side next to the angle and which is opposite it tells you whether to use its sine or its cosine. '
  + 'A real astrometrist measures against several background stars, because each one has a small parallax and proper motion of its own; two people who choose different reference stars and different dates will not get exactly the same answer, and should not. '
  + 'Two things are switched off here, as they are removed in real astrometry before anything is measured: atmospheric refraction, and annual aberration (which would stretch and shrink the whole field by one part in ten thousand over the year). '
  + 'The small random shift of each star image from one exposure to the next is <b>simulated measurement error</b>, not data: it stands in for the photon noise and seeing of a real detector, and it comes from the seed shown in your notebook.';
const ASTROMETRY_TEMPLATE = { cols: [
  { key: 'yr', kind: 'data', name: 'date', unit: 'yr', sig: 0, raw: 'year', rawLabel: 'Date as a decimal year' },
  { key: 'sep', kind: 'data', name: 'separation', unit: 'arcsec', sig: 0, raw: 'sep', rawLabel: 'Separation' },
  { key: 'pa', kind: 'data', name: 'position angle', unit: 'deg', sig: 0, raw: 'pa', rawLabel: 'Position angle (north through east)' },
  { key: 'ref', kind: 'text', name: 'reference star', raw: 'from', rawLabel: 'Measured from (name)' }] };

export const GROUPS = ['Earth and Moon', 'The Sun', 'The planets', 'The astronomical unit', 'Light', 'The stars', 'Standard candles', 'Time and the calendar'];

export const LABS = [
  // ------------------------------------------------------------------ Earth and Moon
  { id: 'eclipse-timing', group: 'Earth and Moon', title: 'The Earth’s shadow on the Moon: its shape, and the Moon’s size', who: 'Aristotle, about 350 BC; Aristarchus, about 270 BC',
    blurb: 'Watch the round edge of the shadow, then time the Moon crossing it.',
    setup: { t: '2018-07-27T17:50:00Z', loc: P.nairobi, target: 'Moon', track: true, fov: 2.4, mount: 'eq', show: { refraction: false }, fx: { earthShadow: false }, tools: ['stopwatch'] },
    steps: [
      `The Moon is about to enter the Earth’s dark inner shadow (the umbra). Zoom in on it, ${RUN} until the dark edge first touches the Moon, step to the moment and press <b>Mark time</b>.${FINE}`,
      `The shape of the shadow. As the Moon slides in, look at the edge of the shadow on it, stepping a few minutes at a time (<kbd>Shift</kbd> + <kbd>↑</kbd> is 1 minute). Is the edge ever straight, or curved the other way? Estimate by eye how many times bigger than the Moon the circle is that this arc belongs to, and write it down.`,
      `Mark the instant the Moon is completely inside the umbra (totality begins).`,
      `Mark the instant the Moon’s leading edge first comes out again (totality ends).`,
      `Mark the instant the Moon is completely clear of the umbra. You now have four marks.`,
      `From mark 1 to mark 2 the Moon moved by its own diameter. From mark 1 to mark 3 its leading edge crossed the whole shadow. Press two mark numbers to see the time between them. Because the Moon moves at a steady rate, the ratio of the times is the ratio of the distances: <span class="frac"><span>shadow diameter</span><span>Moon diameter</span></span> = <span class="frac"><span>time from mark 1 to 3</span><span>time from mark 1 to 2</span></span>. What is the shadow’s diameter in Moon diameters?`,
      `Check: click <button class="btn" data-do="shadow">Outline of the Earth’s shadow</button> to draw the shadow, zoom out until you see all of it, and with ${ANGLE} measure the umbra and the Moon, each from edge to edge (click near an edge to snap to it, away from where the two edges cross). How do the timing, the measurement and your estimate by eye compare? Why might they not agree exactly?`,
    ],
    about: `Only a sphere casts a round shadow from every direction: Aristotle’s argument that the Earth is a ball. The Moon passes almost through the center of the shadow in this eclipse. The Sun is not a point, so the Earth’s shadow tapers: at the Moon it is narrower than the Earth by about one Moon diameter (because the Sun and Moon look the same size). Earth’s diameter ≈ (shadow + 1) Moon diameters. The model enlarges the shadow by 1.4% for the Earth’s atmosphere, as eclipse predictions do. ${STEPKEYS} See ${tao}.` },
  { id: 'moonrise', group: 'Earth and Moon', title: 'Angular size of the Moon from the time it takes to rise', who: 'Aristarchus',
    blurb: 'How long does the Moon take to climb over the horizon?',
    setup: { t: '2027-09-15T23:04:30Z', loc: P.quito, look: { az: 89.65, alt: 0.25 }, target: 'Moon', fov: 1.6, show: { refraction: false, atmosphere: false, azGrid: false, conLines: false, conNames: false }, tools: ['stopwatch'] },
    steps: [
      `You are on the equator looking due east; the full Moon is about to rise straight up. Refraction is off. Step the clock to the instant the Moon’s top edge reaches the horizon and press <b>Mark time</b>.${FINE}`,
      `Step on to the instant the bottom edge clears the horizon and mark again. How long did the Moon take to rise by its own diameter?`,
      `The Moon goes once round the sky (360°) in one lunar day. Measure it: switch on the <b>meridian</b> (<kbd>;</kbd>, the green line from north to south overhead), press <kbd>T</kbd> with the Moon selected to follow it, run on to the instant the line cuts the Moon in half, mark; and again the next day.`,
      `<span class="frac"><span>angular diameter</span><span>360°</span></span> = <span class="frac"><span>rise time</span><span>1 lunar day</span></span>, both times in the same unit. Now go back to mark 2 (its ↩ button), measure the Moon from edge to edge with ${ANGLE}, and compare.`,
    ],
    about: `With the angular size and the true size of the Moon (from the eclipse lab) you get its distance: diameter / angle in radians. Away from the equator, or when the Moon is far from the celestial equator, it rises at a slant and takes longer. ${STEPKEYS} See ${tao}.` },
  { id: 'lunar-parallax', group: 'Earth and Moon', title: 'Distance of the Moon from two observers', who: 'Lalande and Lacaille, 1751 (Berlin and the Cape)',
    blurb: 'The Moon sits in a different place among the stars for two observers.',
    setup: { t: '2026-11-24T22:40:00Z', loc: P.berlin, obs2: P.capetown, align: 'stars', target: 'Moon', track: true, fov: 5, tools: ['compare'], show: { atmosphere: false } },
    steps: [
      `The solid Moon is what Berlin sees; the dashed circle is where Cape Town sees it at the same instant, against the same stars.`,
      `With ${ANGLE}, measure from the center of the Moon to the center of the dashed Moon.`,
      `Only the part of the baseline that is square-on to the Moon makes the shift. Open ${SQUARE('Moon')}: the Earth as the Moon sees it now. Drag the ruler from Berlin to Cape Town. How far away is the Moon, in km and in Earth radii (6,371 km)?${RADIANS}`,
    ],
    about: `The straight line between the cities is a little slanted to the Moon; only the part of it that is square-on to the Moon makes the shift, and that is what you measure. This is ordinary surveying with the Earth as the baseline. Hipparchus used the same idea with the solar eclipse of 129 BC. See ${tao}.` },
  { id: 'eclipse-two-sites', group: 'Earth and Moon', title: 'Total here, partial there', who: 'Hipparchus (eclipse of 129 BC), with the eclipse of 8 April 2024',
    blurb: 'A solar eclipse that is total in one town is only partial a few hundred km away.',
    setup: { t: '2024-04-08T19:09:50Z', loc: P.richmond, obs2: P.atlanta, align: 'stars', target: 'Sun', track: true, fov: 1.6, mount: 'eq', show: { refraction: false, atmosphere: false }, tools: ['compare'] },
    steps: [
      `In Richmond the eclipse is total. The dashed circles are the Sun (yellow) and the Moon (blue) as seen from Atlanta at the same instant. Is the Sun covered there?`,
      `With ${ANGLE} measure how far the Moon is shifted between the two towns: from the center of the Moon to the center of the dashed Moon.`,
      `Measure the Sun’s diameter on the dashed yellow circle, edge to edge (in Richmond the real Sun is behind the Moon). What fraction of the Sun’s width is the shift? That fraction is all Hipparchus knew.`,
      `Open ${SQUARE('Moon')} and measure how far Atlanta is from Richmond as the Moon sees them (<b>Zoom to the places</b> first). Estimate the Moon’s distance from the shift.${RADIANS}`,
    ],
    about: `The straight line between the towns is slanted to the Moon. Using its full length overestimates the distance: the same difficulty Hipparchus had. See ${tao}.` },
  { id: 'moon-apsides', group: 'Earth and Moon', title: 'The Moon’s oval orbit', who: 'Hipparchus; Ptolemy',
    blurb: 'The Moon looks bigger at perigee than at apogee.',
    setup: { t: '2026-11-25T21:02:00Z', loc: P.richmond, target: 'Moon', track: true, fov: 1.2, mount: 'eq', show: DARK, tools: ['events'], events: 'apsis' },
    steps: [
      `The Events finder lists the Moon’s closest (perigee) and farthest (apogee) points. Click one of each. (“Below your horizon” does not matter here: the ground is switched off.)`,
      `Each time, measure the Moon’s diameter from edge to edge with ${ANGLE}. The row follows the Moon, so one measurement is enough: read it at each date.`,
      `Distance is inversely proportional to angular size. From the two sizes find the ratio of the distances and the eccentricity e = <span class="frac"><span>big − small</span><span>big + small</span></span>.`,
      `Extra: measure the Moon when it is rising and again when it is highest on the same night. Why does it differ?`,
    ],
    about: 'Angular sizes here are as seen from your place on the Earth’s surface, not from its center, so an observer with the Moon overhead is one Earth radius closer to it.' },
  { id: 'months', group: 'Earth and Moon', title: 'Two kinds of month, and the lunar day', who: 'Babylonian and Greek astronomy',
    blurb: 'Star to star, phase to phase, and meridian to meridian.',
    setup: { t: '2026-11-24T14:54:00Z', loc: P.richmond, target: 'Moon', track: true, fov: 30, show: DARK, tools: ['stopwatch', 'events'], events: 'phases' },
    steps: [
      `Synodic month (phase to phase): the Events finder lists the Moon’s phases. Write down the dates and times of several full Moons. One month can differ from the next by several hours, so use the average interval, in days.`,
      `Sidereal month (star to star): read the Moon’s position among the stars in its panel (<b>Ecliptic lon / lat</b>, the first number), then step forward with the date box (<b>+1 day</b>, then <b>+1 h</b>) until it is back at the same ecliptic longitude. How long did that take? (The position is as seen from Richmond, so it shifts a little over a day; compare readings at the same time of day.)`,
      `Lunar day: switch on the meridian (<kbd>;</kbd>, the green line from north to south) and zoom in on the Moon. Run on to the instant the line cuts the Moon in half, mark it, and do it again the next day.${FINE}`,
      `Why is the synodic month about two days longer than the sidereal month?`,
    ],
    about: `Tao’s corrections point out that the Moon goes round the sky in 24 h 50 min, and that the month from phase to phase is 29½ days, not 28. See ${tao}.` },

  // ------------------------------------------------------------------ The Sun
  { id: 'half-moon', group: 'The Sun', title: 'Distance of the Sun from the half Moon', who: 'Aristarchus',
    blurb: 'When the Moon is exactly half lit, how far is it from the Sun in the sky?',
    setup: { t: '2026-12-17T02:00:00Z', loc: P.tokyo, target: 'Moon', track: true, fov: 1.3, mount: 'eq', show: DARK, tools: ['stopwatch'] },
    steps: [
      `The Moon is selected. Step the clock until its panel says <b>Illuminated 50.00%</b>. It reads 50.00% for a couple of minutes, so mark the time it first reads 50.00% and the time it first reads 50.01%, and use the instant halfway between: go there.${FINE}`,
      `At that instant Sun, Moon and you make a right angle at the Moon. Zoom out only as far as you need to have the Sun in view too, and measure the angle from the Moon to the Sun with ${ANGLE}, center to center, to 0.01°. The whole result hangs on the last fraction of a degree, and a click can be off by a few hundredths of a degree at that zoom: measure three times and average.`,
      `<span class="frac"><span>distance to the Moon</span><span>distance to the Sun</span></span> = cos(angle), so the Sun is <span class="frac"><span>1</span><span>cos(angle)</span></span> times as far away as the Moon. What do you get? Aristarchus used 87°.`,
      `Aristarchus’s own version: the row in the angle tool follows Moon and Sun as you step. Find the instant the angle is exactly 90° and mark it. How long after the half Moon is it?`,
    ],
    about: `The angle is so close to 90° that a tiny error changes the answer enormously, and judging the instant of exact half phase by eye is hopeless: that, not the geometry, is why Aristarchus was out by a factor of 20. See ${tao}.` },
  { id: 'sun-moon-size', group: 'The Sun', title: 'Sun and Moon: the same size in the sky', who: 'Aristarchus',
    blurb: 'Compare their angular diameters during a solar eclipse.',
    setup: { t: '2024-04-08T18:25:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 1.5, mount: 'eq', show: { refraction: false, atmosphere: false }, tools: [] },
    steps: [
      `The atmosphere is switched off, so that the dark Moon can be seen outside the Sun (in a real sky it has the color of the sky there). With ${ANGLE} measure the Sun’s diameter and the Moon’s, edge to edge: click near each edge, where the other body is not in the way.`,
      `Their distances are in the ratio you found with the half Moon. The two angular sizes are close but not quite equal, so use both: <span class="frac"><span>Sun’s diameter</span><span>Moon’s diameter</span></span> = <span class="frac"><span>Sun’s angular size</span><span>Moon’s angular size</span></span> × <span class="frac"><span>Sun’s distance</span><span>Moon’s distance</span></span>. What is the ratio of their true diameters?`,
      `Run the clock on to totality. Which of the two is slightly bigger today?`,
      `An annular eclipse leaves a ring of Sun. Open the Events finder (Labs menu) and find one: the list says what is seen of each at your place. Go to one, wherever it is seen: you can measure both diameters even where the Moon misses the Sun. Which is bigger then, and why does it change?`,
    ],
    about: `Equal angular size means size is proportional to distance, so the Sun is as many times bigger than the Moon as it is farther away. See ${tao}.` },
  { id: 'eratosthenes', group: 'The Sun', title: 'Size of the Earth from the noon Sun', who: 'Eratosthenes, about 240 BC',
    blurb: 'Noon altitude of the Sun at Syene and at Alexandria on the solstice.',
    setup: { t: '-000240-06-22T09:40:00Z', loc: P.syene, obs2: P.alexandria, align: 'stars', target: 'Sun', track: true, fov: 30, show: { meridian: true, azGrid: true, refraction: false, atmosphere: false }, tools: ['compare'] },
    steps: [
      `It is the summer solstice of 241 BC at Syene. Step the clock until the Sun is on the meridian, the green line (local noon). Read its altitude in its panel (<b>Az / Alt</b>). Syene was chosen because on this day the noon Sun there is almost straight overhead, but not exactly: how far is it from straight overhead (90° minus the altitude)?${YEAR0(241)}`,
      `${SWAP} to stand in Alexandria. Find local noon there and read the altitude again.`,
      `The difference is the angle θ between the two cities at the center of the Earth. They are 5000 stadia apart, so <span class="frac"><span>θ</span><span>360°</span></span> = <span class="frac"><span>5000 stadia</span><span>circumference</span></span>: what is the Earth’s circumference in stadia? (Alexandria is not due north of Syene but a few degrees west, so 5000 stadia is a little more than the north–south distance. And nobody knows exactly how long Eratosthenes’s stadion was: somewhere from about 157 to 185 m. That is the biggest uncertainty when you turn the answer into km.)`,
    ],
    about: `This needs the Sun to be far enough away for its rays to be parallel, which Eratosthenes could take from Aristarchus. Syene is not exactly on the tropic and not exactly south of Alexandria. Dates before 1582 are proleptic Gregorian. See ${tao}.` },
  { id: 'sun-apsides', group: 'The Sun', title: 'The Earth’s oval orbit', who: 'Hipparchus',
    blurb: 'The Sun is slightly bigger in January than in July.',
    setup: { t: '2027-01-03T02:08:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 1.2, mount: 'eq', show: DARK, tools: ['events'], events: 'earthApsis' },
    steps: [
      `Use the Events finder to go to perihelion and to aphelion. Each time measure the Sun’s diameter from edge to edge with ${ANGLE}. (The row follows the Sun: one measurement is enough.)`,
      `Find the eccentricity of the Earth’s orbit: e = <span class="frac"><span>big − small</span><span>big + small</span></span>.`,
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
  { id: 'kepler-earth', group: 'The planets', title: 'Advanced: Kepler I. The Earth’s orbit, seen from Mars', who: 'Kepler, Astronomia Nova, 1609, with Tycho Brahe’s observations; a notebook lab',
    blurb: 'Mars comes back to the same point every 687 days: a fixed lighthouse from which to survey the Earth’s own orbit.',
    setup: { t: '2014-04-08T20:57:00Z', loc: P.richmond, target: 'Mars', track: true, fov: 60, mount: 'eq', show: { ...DARK, ecliptic: true, conLines: true, conNames: true, dso: false }, tools: [] },
    notebook: true, lonErr: 1, obs: { seeing: 0, noise: 0 }, template: KEPLER_TEMPLATE,
    steps: [
      'Kepler could not find Mars’s orbit without first knowing the Earth’s, and he could not know the Earth’s without a fixed point to measure from. His trick: Mars itself. Every 687 days (one Mars year) Mars is back at the same point of its orbit, while the Earth is somewhere else in its own.',
      'The clock shows 8 April 2014, when Mars was at <b>opposition</b>: Sun, Earth and Mars in a line, so Mars’s direction from the Earth is also its direction from the Sun. Select Mars, open the notebook’s <b>Choose what Record copies</b>, and record the date and the <b>ecliptic longitudes</b> of the Sun and of the selected object. Mars’s longitude now is <i>λ</i><sub>0</sub>, where Mars sits in its orbit. This first row is your reference, not a place of the Earth: leave it out of the graph (on this date the triangle is flat).',
      'Step one Mars year (click the date and time at the bottom of the sky; the box has <b>+1 Mars yr</b>) and record again, with Mars still selected. Repeat for 9 more dates, to 2031. Each reading carries about 1′ of error, as Tycho’s did.',
      'For each date, a triangle: Sun, Earth, Mars. With the Sun–Mars distance as the unit, the Earth’s distance from the Sun is <i>r</i> = <span class="frac"><span>sin( <i>λ</i><sub>0</sub> − <i>λ</i><sub>Mars</sub> )</span><span>sin( <i>λ</i><sub>Mars</sub> − <i>λ</i><sub>Sun</sub> )</span></span>, and its direction from the Sun is <i>λ</i><sub>Sun</sub> + 180°. Add these as formula columns. (Draw one triangle to see why: the law of sines.)',
      'Add <i>x</i> = <i>r</i> cos( <i>λ</i><sub>Sun</sub> + 180° ) and <i>y</i> = <i>r</i> sin( <i>λ</i><sub>Sun</sub> + 180° ). Graph <i>y</i> against <i>x</i> (tick <b>Same scale on both axes</b> in the graph’s options) and lay a <b>Circle</b> over the points. Where is its center? Is the Sun, at (0, 0), in the middle?',
      'The Earth’s orbit has a radius of 1 au by definition. How far is Mars from the Sun at <i>λ</i><sub>0</sub>, in au? How far off center is the Sun, as a fraction of the radius? In which direction, seen from the Sun, does the circle’s center lie (a longitude: atan of y over x, plus 180° if x is negative)? Keep these: Kepler II needs them.',
    ],
    about: 'This is the first half of Kepler’s construction as Terence Tao tells it (' + tao + '). A circle that is not centered on the Sun is how the eccentric Earth orbit first showed itself; Kepler found it by exactly this route. Mars’s period of 686.98 days is assumed known (from many centuries of its returns to the same stars). The longitudes are on the J2000 axes, so that the slow precession of the equinoxes over these 17 years does not need to be removed. Each reading has about 1′ of <b>simulated</b> error, drawn from your notebook seed, about as good as Tycho Brahe’s naked-eye instruments: no two students get exactly the same orbit.' },
  { id: 'kepler-orbit', group: 'The planets', title: 'Advanced: Kepler II. The shape of Mars’s orbit and the law of areas', who: 'Kepler, Astronomia Nova, 1609; a notebook lab',
    blurb: 'Triangulate Mars from pairs of dates a Mars year apart, map its orbit, and find the law of equal areas.',
    setup: { t: '2026-01-01T00:00:00Z', loc: P.richmond, target: 'Mars', track: true, fov: 60, mount: 'eq', show: { ...DARK, ecliptic: true, conLines: true, conNames: true, dso: false }, tools: [] },
    notebook: true, lonErr: 1, obs: { seeing: 0, noise: 0 }, template: KEPLER_TEMPLATE,
    steps: [
      'You need the Earth’s orbit from Kepler I: a circle of radius 1 au whose center is <i>c</i> au from the Sun toward ecliptic longitude <i>φ</i>. (No Kepler I? Ask your instructor for <i>c</i> and <i>φ</i>.)',
      'Select Mars and record the date and the ecliptic longitudes of the Sun and of Mars. Then step <b>+1 Mars yr</b> and record again: Mars is back at the same point, seen from a different Earth. Step back a Mars year and on two months (<b>−1 Mars yr</b>, then <b>+1 month</b> twice; all in the date box at the bottom of the sky), and repeat, for two years of first dates: 12 pairs, each on two rows one after the other.',
      'A formula can reach the row below: <code>next( … )</code> works out what is inside it on the next row. So each first date can use its partner. Add a typed column <b>first</b> with 1 on every first-date row and nothing on the partner rows: multiplying by it leaves the partner rows blank. (A spreadsheet works too: ⋯ → Export CSV.) For every row, the Earth’s place: direction <i>λ</i><sub>E</sub> = <i>λ</i><sub>Sun</sub> + 180°; with <i>k</i> = <i>c</i> cos( <i>λ</i><sub>E</sub> − <i>φ</i> ), distance <i>r</i><sub>E</sub> = <i>k</i> + √( 1 − <i>c</i>² + <i>k</i>² ); then <i>x</i> = <i>r</i><sub>E</sub> cos <i>λ</i><sub>E</sub>, <i>y</i> = <i>r</i><sub>E</sub> sin <i>λ</i><sub>E</sub>.',
      'Mars is where the two sight lines cross. On a first-date row, <i>λ</i><sub>1</sub> and (<i>x</i><sub>1</sub>, <i>y</i><sub>1</sub>) are that row’s Mars longitude and Earth place, and <i>λ</i><sub>2</sub>, (<i>x</i><sub>2</sub>, <i>y</i><sub>2</sub>) are the same columns inside <code>next( )</code>: <i>s</i> = <span class="frac"><span>(<i>x</i><sub>2</sub> − <i>x</i><sub>1</sub>) sin <i>λ</i><sub>2</sub> − (<i>y</i><sub>2</sub> − <i>y</i><sub>1</sub>) cos <i>λ</i><sub>2</sub></span><span>sin( <i>λ</i><sub>2</sub> − <i>λ</i><sub>1</sub> )</span></span>, and Mars is at ( <i>x</i><sub>1</sub> + <i>s</i> cos <i>λ</i><sub>1</sub>, <i>y</i><sub>1</sub> + <i>s</i> sin <i>λ</i><sub>1</sub> ), times <b>first</b>. Leave out any pair whose sin( <i>λ</i><sub>2</sub> − <i>λ</i><sub>1</sub> ) is smaller than 0.15: its sight lines are nearly parallel, and a small error moves the crossing a long way.',
      'Graph Mars’s places (tick <b>Same scale on both axes</b>) and lay a <b>Circle</b> over them. Where is its center, and how far from the Sun? From the nearest and farthest points, Mars’s distances <i>r</i><sub>min</sub> and <i>r</i><sub>max</sub>: the size of the orbit <i>a</i> = <span class="frac"><span><i>r</i><sub>max</sub> + <i>r</i><sub>min</sub></span><span>2</span></span> and its eccentricity <i>e</i> = <span class="frac"><span><i>r</i><sub>max</sub> − <i>r</i><sub>min</sub></span><span><i>r</i><sub>max</sub> + <i>r</i><sub>min</sub></span></span>.',
      'The law of areas. For each two consecutive first dates (two months apart, so two rows apart: <code>next(next( … ))</code>): the angle Mars moved round the Sun, Δθ (from cos Δθ = <span class="frac"><span><i>x</i><sub>1</sub><i>x</i><sub>2</sub> + <i>y</i><sub>1</sub><i>y</i><sub>2</sub></span><span><i>r</i><sub>1</sub><i>r</i><sub>2</sub></span></span>; acos gives radians, × <span class="frac"><span>180</span><span>π</span></span> for degrees; skip a step where a discarded pair leaves a gap), and the area it swept, about ½ <i>r</i><sub>1</sub> <i>r</i><sub>2</sub> sin Δθ. Does Mars move through equal angles in equal times? Through equal areas?',
    ],
    about: 'The second half of Kepler’s construction (' + tao + '). Mars’s orbit is so nearly round that its width is 99.6% of its length: telling an ellipse from an off-center circle by shape alone takes measurements better than 1′, which is why Kepler’s famous 8′ discrepancy mattered so much. The off-center Sun and the law of equal areas show plainly in these data. Each longitude has about 1′ of <b>simulated</b> error from your notebook seed, and your Earth orbit is your own, so no two students get exactly the same Mars.' },
  { id: 'jupiter-mass', group: 'The planets', title: 'Weighing Jupiter', who: 'Galileo, 1610; Newton, 1687',
    blurb: 'Periods and orbit sizes of the four big moons.',
    setup: { t: '2026-11-24T09:00:00Z', loc: P.richmond, target: 'Jupiter', track: true, fov: 0.3, mount: 'eq', show: DARK, tools: ['stopwatch'] },
    notebook: true, obs: { seeing: 0.8, noise: 0 },
    template: { cols: [{ key: 'jd', kind: 'data', name: 'Julian Date', unit: 'd', sig: 0, raw: 'jd', rawLabel: 'Julian Date' }, { key: 'sep', kind: 'data', name: 'separation', unit: 'arcsec', sig: 0, raw: 'sep', rawLabel: 'Separation' }, { key: 'pa', kind: 'data', name: 'position angle', unit: 'deg', sig: 0, raw: 'pa', rawLabel: 'Position angle (north through east)' }] },
    steps: [
      'Pick a moon (click one to see its name). Step the clock by hours (<kbd>&gt;</kbd> is one hour) and measure its angle from Jupiter, center to center, with the angle tool (<kbd>R</kbd>) each time, until you have its greatest distance on one side. (With the lab notebook open, a click on Jupiter’s disc snaps to its center; a moon is placed by eye in the magnifier. <b>Record</b> copies each reading into your table.)',
      'Mark that time, carry on until it is back at greatest distance on the same side, and mark again: that is its period T.',
      'Orbit radius a = (the greatest angle in radians: <span class="frac"><span>arcseconds</span><span>3600</span></span> × <span class="frac"><span>π</span><span>180</span></span>) × (distance to Jupiter, from the info panel).',
      'Kepler’s third law: M = 4π² a³ / (G T²). Do all four moons: is a³/T² the same for each?',
    ],
    about: 'Galileo’s moons were the first clear case of things going round something other than the Earth; Newton used them to weigh Jupiter.' },
  { id: 'venus-phases', group: 'The planets', title: 'The phases of Venus', who: 'Galileo, 1610',
    blurb: 'Venus is small when full and large when a thin crescent.',
    setup: { t: '2026-06-01T01:30:00Z', loc: P.richmond, target: 'Venus', track: true, fov: 0.03, mount: 'eq', show: DARK, tools: [] },
    steps: [
      `Write down the date, the fraction of Venus that is lit (its panel: <b>Illuminated</b>) and its angular diameter, edge to edge with ${ANGLE}. The row follows Venus, so one measurement is enough.`,
      `Step forward a month at a time (click the date and time: <b>+1 month</b>) until Venus has passed between us and the Sun. Tabulate phase against size.`,
      `Can an Earth-centered system in which Venus always stays between us and the Sun produce a nearly full Venus?`,
    ],
    about: 'A full, small Venus means it is beyond the Sun; a large crescent means it is on our side. Venus goes round the Sun.' },

  // ------------------------------------------------------------------ The astronomical unit
  { id: 'venus-transit-1769', group: 'The astronomical unit', title: 'The transit of Venus, 1769', who: 'Halley’s method; Cook at Tahiti, Hell at Vardø',
    blurb: 'Time the transit from the Pacific and from the Arctic.',
    setup: { t: '1769-06-03T19:15:00Z', loc: P.tahiti, obs2: P.vardo, align: 'sun', target: 'Sun', track: true, fov: 0.8, mount: 'eq', show: DARK, tools: ['stopwatch', 'compare'] },
    steps: [
      `Venus will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `You are at Point Venus, Tahiti. ${RUN.replace("run", "Run")} until Venus bites into the Sun’s edge. Click Venus, press <kbd>T</kbd> to follow it and zoom far in. Mark <b>second contact</b>.${FINE}`,
      `Run on, and mark <b>third contact</b>. (<kbd>Space</kbd> brings Venus back to the middle.) The time between the two marks is the duration of the transit at Tahiti.`,
      `${SWAP} and time the same two contacts from Vardø, in the Arctic. The stopwatch keeps the two places apart.`,
      `Go to mid-transit, half-way between the contacts, and zoom until Venus is a disc. The dashed circle is Venus as the other observer sees it at that instant (the two Suns are drawn on top of each other). Measure from Venus to the other Venus, center to center, with ${ANGLE}.`,
      `Still at mid-transit, open ${SQUARE('Sun')} and measure how far apart Tahiti and Vardø are as the Sun sees them: that is the baseline. Venus was 0.289 au from us and the Sun 1.015 au, so the shift in radians is <span class="frac"><span>baseline</span><span>1 au</span></span> × ( <span class="frac"><span>1</span><span>0.289</span></span> − <span class="frac"><span>1</span><span>1.015</span></span> ). How many km is an astronomical unit?${RADIANS}`,
    ],
    about: `The straight line between the two places is 11,410 km long; only the part square-on to the Sun counts (about 10,470 km at mid-transit; it changes as the Earth turns). Seen from two latitudes Venus crosses the Sun on two slightly different chords of different lengths, so the durations differ by minutes: Halley’s way to turn clocks into a parallax. From Kepler’s third law the shift of Venus against the Sun is (1/0.289 − 1/1.015) times the baseline in au. See ${tao}.` },
  { id: 'venus-transit-2012', group: 'The astronomical unit', title: 'The transit of Venus, 2012', who: 'The last one until 2117',
    blurb: 'The same measurement with modern places.',
    setup: { t: '2012-06-05T22:00:00Z', loc: P.honolulu, obs2: P.sydney, align: 'sun', target: 'Sun', track: true, fov: 0.8, mount: 'eq', show: DARK, tools: ['stopwatch', 'compare'] },
    steps: [
      `Venus will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `You are in Honolulu. Click Venus, press <kbd>T</kbd> to follow it and zoom far in. ${RUN.replace("run", "Run")} and mark <b>second contact</b> and <b>third contact</b>.${FINE}`,
      `${SWAP} and time the same two contacts from Sydney. How do the durations compare?`,
      `At mid-transit zoom until Venus is a disc. With ${ANGLE} measure from Venus to the other observer’s Venus (dashed), center to center, and Venus’s own diameter, edge to edge.`,
      `Still at mid-transit, open ${SQUARE('Sun')} and measure Honolulu to Sydney as the Sun sees them: that is the baseline. The shift of Venus against the Sun, in radians, is <span class="frac"><span>baseline</span><span>1 au</span></span> × ( <span class="frac"><span>1</span><span>0.2887</span></span> − <span class="frac"><span>1</span><span>1.0147</span></span> ). Estimate the astronomical unit.${RADIANS}`,
    ],
    about: 'In a straight line the two places are 7,620 km apart; square-on to the Sun at mid-transit, about 7,490 km. Both places saw the whole transit. Venus was 0.2887 au from the Earth and the Sun 1.0147 au.' },
  { id: 'mercury-transit', group: 'The astronomical unit', title: 'A transit of Mercury', who: 'Gassendi, 1631; Halley, 1677',
    blurb: 'Mercury crosses the Sun about 13 times a century.',
    setup: { t: '2019-11-11T12:30:00Z', loc: P.richmond, target: 'Sun', track: true, fov: 0.8, mount: 'eq', show: DARK, tools: ['stopwatch'] },
    steps: [
      `Mercury will cross the face of the Sun. Four moments have names:${CONTACTS}`,
      `Click Mercury (or find it with the search box, <kbd>/</kbd>), press <kbd>T</kbd> to follow it and zoom far in. ${RUN.replace("run", "Run")}, then step, and mark all four contacts.${FINE}`,
      `With ${ANGLE} measure Mercury’s diameter, edge to edge, and its distance from the center of the Sun (zoom out and click well inside the Sun). The row follows them: run on to the least distance.`,
      `Compare Mercury’s size with that of Venus in the 2012 transit. Why did Halley prefer Venus for finding the Sun’s distance?`,
    ],
    about: 'Mercury is small and far from us during a transit, so its parallax against the Sun is too small to time well.' },
  { id: 'mars-parallax', group: 'The astronomical unit', title: 'Parallax of Mars, 1672', who: 'Cassini in Paris and Richer in Cayenne',
    blurb: 'Mars at a close opposition, from two continents.',
    setup: { t: '1672-09-05T01:00:00Z', loc: P.paris, obs2: P.cayenne, align: 'stars', target: 'Mars', track: true, fov: 0.04, mount: 'eq', show: DARK, tools: ['compare'] },
    steps: [
      `Mars is near a very close opposition. The dashed circle is Mars as seen from Cayenne at the same instant. Measure the shift, center to center, in arcseconds, with ${ANGLE}.`,
      `Seen square-on from Mars, Paris and Cayenne are 6,610 km apart. Estimate the distance to Mars in km.${RADIANS}`,
      `From Kepler’s laws Mars was 0.381 au from the Earth that night. How long is an astronomical unit?`,
    ],
    about: 'In a straight line the two places are 6,720 km apart; the part square-on to Mars is 6,610 km. This gave the first decent value of the Sun’s distance, about 140 million km. Not in Tao’s account, but the same idea as the transit of Venus.' },

  // ------------------------------------------------------------------ Light
  { id: 'romer', group: 'Light', title: 'The speed of light from Io', who: 'Rømer, 1676',
    blurb: 'Io’s eclipses run late when Jupiter is far away.',
    setup: { t: '2025-08-04T05:10:00Z', loc: P.richmond, target: 'Jupiter', track: true, fov: 0.07, mount: 'eq', show: DARK, lightTime: true, tools: ['stopwatch', 'corrections'] },
    steps: [
      `Light takes time to cross the solar system, so you see Jupiter and its moons as they <b>were</b>. Io is about to go into Jupiter’s shadow, just beside the planet: it fades over about 3½ minutes. ${RUN.replace("run", "Run")}, step to the instant Io is completely gone, and mark it.${FINE}`,
      `Click Jupiter and write down its distance from you now (its panel, in au).`,
      `Switch the light’s journey off: ${LIGHT} (also in <b>Corrections</b>). The sky now shows where things really are at each instant. Io is already gone, so step back an hour (<kbd>&lt;</kbd>). Run on and mark the same moment, Io completely gone.`,
      `The time between the two marks is how late you see it happen: the delay. Write it beside the distance.`,
      `Switch it on again: ${LIGHT}. Now a date when Jupiter is much nearer: ${GOTO("2025-12-11T09:50:00Z", "Go to 11 December 2025")}. Do the same again: mark Io gone, read the distance, switch light-travel time off, step back an hour, mark Io gone.`,
      `Between the two dates the light’s journey to you became shorter by so many au, and the delay shorter by so many seconds. Speed of light = <span class="frac"><span>difference of the distances</span><span>difference of the delays</span></span>. 1 au = 149.6 million km.`,
      `Rømer had no switch. With light-travel time on, time several eclipses of Io as Jupiter comes nearer (one every 42.5 hours). Predict the last one from the first with a steady period: how far off is it?`,
    ],
    about: `Rømer found the eclipses about 10 minutes late or early compared with a steady schedule, and Huygens turned that into a speed. At opposition the shadow is straight behind the planet, and Io goes behind Jupiter’s edge before it can fade; that is why the two dates are a month before opposition and six weeks after Jupiter passed behind the Sun. See ${tao}.` },
  { id: 'aberration', group: 'Light', title: 'Aberration of starlight', who: 'Bradley, 1727',
    blurb: 'Every star traces a small yearly ellipse.',
    setup: { t: '2026-03-21T00:00:00Z', loc: P.greenwich, target: 'Eltanin', track: true, fov: 0.03, mount: 'eq', show: DARK, tools: ['corrections'] },
    steps: [
      `This is γ Draconis, the star Bradley watched pass overhead in London. Zoomed in this far its panel gives its coordinates (J2000) to 0.01″.`,
      `Write down its declination now (<b>RA / Dec (J2000)</b>, the second value), then step forward a month at a time for a year (click the date and time: <b>+1 month</b>).`,
      `Plot declination against date. What is the half-range, in arcseconds? In which months are the extremes?`,
      `Switch <b>Annual aberration</b> off in Corrections and step through the year again. What is left?`,
      `The full effect is 20.5″ = <span class="frac"><span>Earth’s speed</span><span>speed of light</span></span>, as an angle in radians. The Earth’s orbital speed is the length of its orbit (2π × 1 au) divided by a year. Find the speed of light.${RADIANS}`,
    ],
    about: 'Bradley was looking for parallax. He found a shift 40 times too big and three months out of step: the direction light seems to come from tilts toward the Earth’s motion, like rain seen from a moving car.' },

  // ------------------------------------------------------------------ The stars
  { id: 'parallax', group: 'The stars', title: 'Distance of a star by parallax', who: 'Bessel, 1838',
    blurb: '61 Cygni shifts as the Earth goes round the Sun.',
    setup: { t: '2026-06-01T00:00:00Z', loc: P.richmond, target: { hip: 104214 }, track: true, fov: 0.004, mount: 'eq', show: DARK, fx: { aberration: false, properMotion: false, parallax: true }, tools: ['corrections'] },
    steps: [
      `This is 61 Cygni A. Aberration and proper motion are switched off so that only parallax moves the star. Its panel gives its coordinates (J2000) to 0.01″.`,
      `Write down RA and Dec, then step a month at a time for a year (click the date and time: <b>+1 month</b>).`,
      `Turn the RA changes into arcseconds (1 s of RA = 15″ × cos Dec) and plot the yearly loop. Half its length is the parallax p.`,
      `Distance in parsecs = <span class="frac"><span>1</span><span><i>p</i></span></span>, with <i>p</i> in arcseconds. 1 parsec is 3.26 light-years: how many light-years is that?`,
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
    setup: { t: '2026-06-01T00:00:00Z', loc: P.richmond, target: { hip: 87937 }, track: false, fov: 0.12, mount: 'eq', show: DARK, fx: { aberration: false, parallax: false, properMotion: true }, tools: ['corrections'] },
    steps: [
      `This is Barnard’s star. Open ${ANGLE} and switch <b>Snap</b> off, so that your clicks mark places on the sky and not the star itself. Click the star once.`,
      `Step the clock forward 10 years (click the date and time: <b>+1 year</b>): the star walks away from your mark. Click the star again. How far did it move, and so how many arcseconds per year?`,
      `What speed across the line of sight is that, in km/s? Use the distance you measured in the Barnard’s star parallax lab, or the one your instructor gives you. (1″ per year at 1 pc is 4.74 km/s.)`,
    ],
    about: 'Proper motions are from the HYG catalog and are applied as straight-line drifts.' },
  { id: 'star-colors', group: 'The stars', title: 'The colors of the stars, and their temperatures', who: 'Stebbins and Whitford, 1940s: photoelectric color photometry; a notebook lab',
    blurb: 'Measure eleven stars through a blue and a red filter: the hotter the star, the more of its light is blue.',
    setup: { t: '2027-02-10T02:30:00Z', loc: P.richmond, target: 'Rigel', track: true, fov: 50, show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: { cols: [
      { key: 'obj', kind: 'text', name: 'star', raw: 'obj', rawLabel: 'Name' },
      { key: 'b', kind: 'data', name: 'B counts', unit: 'counts', sig: 0, raw: 'countsB', rawLabel: 'Last exposure through the B (blue) filter' },
      { key: 'r', kind: 'data', name: 'R counts', unit: 'counts', sig: 0, raw: 'countsR', rawLabel: 'Last exposure through the R (red) filter' }] },
    steps: [
      `Rigel is selected (if its panel shrinks to a name at the top left, click the name). Its panel has a <b>Photometer</b> row: the counts one exposure collects, and four buttons for what is in front of the detector: <b>Clear</b> (no filter), <b>B</b> (blue, about 440 nm), <b>G</b> (green, 550 nm) and <b>R</b> (red, 640 nm). The filters are scaled so that G reads the same as Clear, so compare B with R, not with Clear. Click B, then R. Which lets through more of Rigel’s light? Now click Betelgeuse (upper left of Orion) and do the same.`,
      `Measure these eleven stars, all up tonight: Alnitak, Bellatrix, Rigel, Sirius, Castor, Procyon, Polaris, Capella, Pollux, Aldebaran, Betelgeuse (the search box finds each one). First set up the notebook: <b>Choose what Record copies</b>, and send the star’s <b>Name</b> into a new column called <i>star</i>, the <b>Last exposure through the B (blue) filter</b> into one called <i>B counts</i>, and the <b>… R (red) filter</b> into one called <i>R counts</i>. They become columns A, B and C. Then for each star: select it, click <b>B</b>, then <b>R</b>, then <b>Record</b>: one row with the name and both counts.`,
      `Add a column for the color ratio, <span class="frac"><span>B counts</span><span>R counts</span></span>: <b>Add Column</b>, Calculate, and the formula <code>B / C</code> (a formula names columns by their letters). A star whose light is mostly blue has a big ratio, a red one a small ratio. Put the eleven stars in order of their ratio.`,
      `A star shines roughly like a <b>blackbody</b>, a glowing object whose color depends only on its temperature. For this photometer and its filters, the ratio a blackbody gives is:` + HELP('<table class="lab-tab"><tr><th><span class="frac"><span>B</span><span>R</span></span></th><th>temperature</th></tr><tr><td>0.12</td><td>3,000 K</td></tr><tr><td>0.18</td><td>3,500 K</td></tr><tr><td>0.25</td><td>4,000 K</td></tr><tr><td>0.33</td><td>4,500 K</td></tr><tr><td>0.41</td><td>5,000 K</td></tr><tr><td>0.56</td><td>6,000 K</td></tr><tr><td>0.70</td><td>7,000 K</td></tr><tr><td>0.82</td><td>8,000 K</td></tr><tr><td>1.03</td><td>10,000 K</td></tr><tr><td>1.19</td><td>12,000 K</td></tr><tr><td>1.36</td><td>15,000 K</td></tr><tr><td>1.55</td><td>20,000 K</td></tr><tr><td>1.66</td><td>25,000 K</td></tr><tr><td>1.74</td><td>30,000 K</td></tr><tr><td>1.84</td><td>40,000 K</td></tr></table>Read each star’s temperature from the table, going between rows in proportion.'),
      `Which star is hottest, and which coolest? Compare the two ends of the table:` + HELP('<table class="lab-tab"><tr><th><span class="frac"><span>B</span><span>R</span></span></th><th>temperature</th></tr><tr><td>0.12</td><td>3,000 K</td></tr><tr><td>0.25</td><td>4,000 K</td></tr><tr><td>1.36</td><td>15,000 K</td></tr><tr><td>1.74</td><td>30,000 K</td></tr></table>') + `From 3,000 to 4,000 K the ratio more than doubles; from 15,000 to 30,000 K, fifteen times as many degrees, it changes by about a quarter. Your ratios are good to about 1%: how many kelvin is that near 3,500 K, and near 30,000 K? What does that say about temperatures of the hottest stars from their color? (The next lab, <b>Spectra</b>, finds temperatures a second way: compare.)`,
    ],
    about: 'The counts through each filter are a <b>model</b>, not a measurement of these stars’ light: each star is treated as a blackbody at the temperature of its catalogued spectral type (Hipparcos; the same temperature the Spectrograph uses, from Pecaut and Mamajek 2013 and, for cool giants, Gray 2005; a star with no type gets one from its B−V color), its photons are counted through a smooth band around each filter’s center, and the scale is set so that the G counts are the clear (V) counts and an A0 star like Vega gives the same counts in all three filters. Real stars are not perfect blackbodies (their absorption lines and the Balmer jump take light out of the blue), so a color temperature is an estimate. Each exposure carries photon noise drawn from your seed: reading the same star through the same filter at the same clock second gives the same exposure again; step the clock a second (<kbd>Shift</kbd> + <kbd>→</kbd>) for a new one.' },
  { id: 'star-spectra', group: 'The stars', title: 'Spectra: sorting the stars, and their temperatures', who: 'Annie Jump Cannon and the Harvard classification, 1901; Wien’s law, 1893',
    blurb: 'Read the dark lines in ten stars’ spectra, put them in order, and find their temperatures from the peak.',
    setup: { t: '2027-02-10T02:30:00Z', loc: P.richmond, target: 'Rigel', track: true, fov: 50, show: DARK, tools: ['spectro'] },
    steps: [
      `The <b>Spectrograph</b> card shows the spectrum of the selected star: its brightness at each wavelength, and under it the colours with their dark <b>absorption lines</b>. Rigel is selected. Click Sirius, then Betelgeuse (or find them with the search box), and watch the lines change. Point at the plot to read a wavelength; click to pin one.`,
      `Look at these ten stars: Alnitak, Bellatrix, Rigel, Sirius, Castor, Procyon, Polaris, Capella, Aldebaran, Betelgeuse. Tick <b>Divide by the continuum</b> (the lines against a flat 1: the readout then gives each dip’s depth as 1 minus the reading). For each star note which of these it shows, and how deep: the hydrogen (Balmer) lines at 656, 486, 434 and 410 nm; neutral helium at 447 and 588 nm; ionized helium at 468.6 nm (only in the hottest stars); the calcium pair at 393 and 397 nm; sodium at 589 nm; the broad saw-tooth bands of titanium oxide (from 476 nm on). Cooler stars also show the G band near 430 nm (iron and the CH molecule), neutral calcium at 422.7 nm, magnesium near 517 nm and iron at 527 nm.`,
      `Sort the ten into one sequence in which the lines change gradually: helium first (ionized helium only at the very start), then the strongest hydrogen, then calcium growing, sodium and the G band appearing, and the molecular bands last. Cannon’s letters for that sequence are O, B, A, F, G, K, M; two stars can share a letter. Two measurable rules for the cool end: an <b>F</b> star’s hydrogen line at 410 nm is still at least half as deep as its G band at 430 nm, a <b>G</b> star’s much less; and in a <b>K</b> star the calcium line at 422.7 nm is deeper than the G band, in a G star shallower. Which letter is each star?`,
      `Now the temperatures. <b>Untick “Divide by the continuum”</b> (with it on the curve is flat) and choose <b>Wide</b>. Find the wavelength where each spectrum is brightest (trace the top of the curve, over the dips). Wien’s law: λ<sub>peak</sub> <i>T</i> = 2.898 × 10<sup>6</sup> nm K, so <i>T</i> = <span class="frac"><span>2.898 × 10<sup>6</sup> nm K</span><span>λ<sub>peak</sub></span></span>. For some stars the curve is still rising at the left end, 300 nm: the peak is in the ultraviolet, so all you can say is <i>T</i> &gt; <span class="frac"><span>2.898 × 10<sup>6</sup> nm K</span><span>300 nm</span></span>. Which stars are those? To put them in order anyway, compare how bright each is at 300 nm against its brightness at 700 nm: the hotter the star, the bigger that ratio.`,
      `List your stars in your letter order with their peak wavelengths and temperatures. Is the order of the lines the order of temperature? Which way does it run?`,
    ],
    about: `Cannon sorted hundreds of thousands of photographic spectra by their lines alone, before anyone knew why the lines changed; Cecilia Payne showed in 1925 that the sequence is one of temperature, not of composition. The spectra here are <b>models</b> built from each star’s catalogued type (Hipparcos) and radial velocity: a blackbody at the type’s temperature with the lines of that type, not observed spectra. Real stars are not perfect blackbodies, so a temperature from the peak is a rough one.` },
  { id: 'hr-diagram', group: 'The stars', title: 'Build the H–R diagram, and find the sizes of stars', who: 'Hertzsprung, 1911, and Russell, 1913; a notebook lab',
    blurb: 'Measure twenty stars’ colors, brightness and distances, work out how luminous and how big each one is, and plot them.',
    setup: { t: '2027-02-10T02:30:00Z', loc: P.richmond, target: 'Alhena', track: true, fov: 50, show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: { cols: [
      { key: 'obj', kind: 'text', name: 'star', raw: 'obj', rawLabel: 'Name' },
      { key: 'b', kind: 'data', name: 'B counts', unit: 'counts', sig: 0, raw: 'countsB', rawLabel: 'Last exposure through the B (blue) filter' },
      { key: 'g', kind: 'data', name: 'G counts', unit: 'counts', sig: 0, raw: 'countsG', rawLabel: 'Last exposure through the G (green) filter' },
      { key: 'r', kind: 'data', name: 'R counts', unit: 'counts', sig: 0, raw: 'countsR', rawLabel: 'Last exposure through the R (red) filter' },
      { key: 'd', kind: 'data', name: 'distance', unit: 'pc', sig: 0, raw: 'pc', rawLabel: 'Distance of a star, from its parallax' }] },
    steps: [
      `Every star gets two numbers on the Hertzsprung–Russell diagram: how hot it is, and how much light it gives out. You will get both from the photometer (as in the <b>Colors</b> lab) and from the star’s distance (as in the <b>Parallax</b> labs; here the distance from its parallax is in its panel). The ground and the daylight are off, so any star will do at any hour. Set up the notebook first: <b>Choose what Record copies</b>, and send the star’s <b>Name</b> into a column called <i>star</i>, the <b>Last exposure through the B (blue) filter</b> into <i>B counts</i>, the <b>… G (green) filter</b> into <i>G counts</i>, the <b>… R (red) filter</b> into <i>R counts</i>, and the <b>Distance of a star, from its parallax</b> into <i>distance</i>. They become columns A to E.`,
      `Your <b>comparison star</b> is Alhena (selected now), whose magnitude is <i>V</i> = 1.93. Click <b>G</b> in its Photometer row a few times, stepping the clock a second between readings (<kbd>Shift</kbd> + <kbd>→</kbd>: each second is a new exposure), and write down the average G counts. Then for each of these twenty stars: select it (the search box finds each one by these names), click <b>B</b>, <b>G</b> and <b>R</b>, and <b>Record</b>. The stars: σ Ori, Regulus, Sirius, Castor, Procyon, Tabit (π³ Orionis), χ¹ Ori, Ran (ε Eridani), Groombridge 1618, Lalande 21185, Mirzam, Bellatrix, Capella, Pollux, Aldebaran, Rigel, Polaris, Wezen, Betelgeuse and Van Maanen’s Star. Last, the <b>Sun</b> (search “Sun”): B, G, R and Record as for a star; its distance is not a catalogue one, so type it in its <i>distance</i> cell: 1 AU is 0.000004848 pc.`,
      `<b>Temperature.</b> As in the Colors lab, the bluer the star, the bigger <span class="frac"><span>B counts</span><span>R counts</span></span>. For this photometer a blackbody at temperature <i>T</i> gives, to within about 1% from 3,000 to 10,000 K, <i>T</i> = <span class="frac"><span>9410 K</span><span>0.98 − ln <span class="frac"><span>B counts</span><span>R counts</span></span></span></span>. <b>Add Column</b> (Calculate), call it <i>T in K</i>, leave its unit empty, and type <code>9410 / (0.98 - ln(B / D))</code> (a formula names columns by their letters; <code>log</code> is the base-10 log and <code>ln</code> the natural one, both typed with a bracket; a column whose letter is G is written <code>[G]</code>, because <code>G</code> alone is the gravitational constant). It becomes column F. Above 10,000 K it reads too cool, and more so the hotter the star: mark those stars (the <b>Spectra</b> lab says which they are).`,
      `<b>Brightness and luminosity.</b> Three more formula columns, G, H and I (two column names cannot differ only by a capital letter, hence <i>abs M</i>). The apparent magnitude <i>m</i>, from the G counts and your comparison: <i>m</i> = 1.93 − 2.5 log <span class="frac"><span>G counts</span><span>G counts<sub>Alhena</sub></span></span>, typed <code>1.93 - 2.5 * log(C / 1690000000)</code> with your Alhena average in place of 1690000000. The absolute magnitude <i>abs M</i>, how bright the star would look from 10 pc: <i>M</i> = <i>m</i> − 5 log <span class="frac"><span>distance</span><span>10 pc</span></span>, typed <code>[G] - 5 * log(E / 10)</code>. And the luminosity <i>L</i> compared with the Sun’s, whose absolute magnitude is 4.83: <span class="frac"><span><i>L</i></span><span><i>L</i><sub>☉</sub></span></span> = 10<sup>(4.83 − <i>M</i>) / 2.5</sup>, typed <code>10^((4.83 - H) / 2.5)</code>. (If your letters differ, use yours.) Check the Sun’s row: about 5,800 K, and <i>L</i> about 1.`,
      `<b>The diagram.</b> Graph the luminosity (up) against the temperature (across). In <b>Graph options</b> put both axes on a log scale and flip the horizontal one, so that the hot stars are on the left, as Hertzsprung and Russell drew it. Most of your stars lie on one band from upper left to lower right: the <b>main sequence</b>. Where is the Sun? Which stars are off the band, and where?`,
      `<b>How big are they?</b> A star’s luminosity goes as its surface area times <i>T</i><sup>4</sup>, so <span class="frac"><span><i>L</i></span><span><i>L</i><sub>☉</sub></span></span> = <span class="frac"><span><i>R</i></span><span><i>R</i><sub>☉</sub></span></span><sup>2</sup> <span class="frac"><span><i>T</i></span><span>5772 K</span></span><sup>4</sup>, and <span class="frac"><span><i>R</i></span><span><i>R</i><sub>☉</sub></span></span> = <span class="frac"><span>√(<i>L</i> / <i>L</i><sub>☉</sub>)</span><span>(<i>T</i> / 5772 K)<sup>2</sup></span></span>. Add it as column J, typed <code>sqrt(I) / (F / 5772)^2</code>. Which are the biggest stars, and where are they on the diagram? How many Suns across is Betelgeuse? How many Earths across is Van Maanen’s Star (the Sun is 109 Earths across)? Where on the diagram are the stars of the same size as the Sun?`,
    ],
    about: 'The counts are a <b>model</b>, as in the Colors lab: each star is a blackbody at the temperature of its catalogued spectral type (Hipparcos), its brightness is its catalogued V magnitude (Betelgeuse and Polaris, which vary, follow their variable-star models), and the photometer adds photon noise from your seed. The distances are the catalogue’s, from the Hipparcos parallaxes. The luminosity here is the light in the green band only: the hottest stars give out most of their light in the ultraviolet and the coolest in the infrared, so their total luminosities, and their sizes, are bigger than this lab finds (astronomers add a <i>bolometric correction</i>). White dwarfs are faint: Van Maanen’s Star (<i>V</i> 12.4) is the only one in the catalogue, Sirius B and Procyon B being lost in their companions’ glare.' },
  { id: 'binaries', group: 'The stars', title: 'Weighing stars: an eclipsing and a spectroscopic binary', who: 'Goodricke, 1783 (Algol’s eclipses); Vogel, 1890 (Spica’s velocities); a notebook lab',
    blurb: 'Time one of Algol’s eclipses with the photometer, then watch Spica’s spectrum split in two and weigh its stars with Kepler’s third law.',
    setup: { t: '2027-10-22T11:30:00Z', loc: P.richmond, target: { hip: 14576 }, track: true, fov: 12, mount: 'eq', show: CANDLE_SHOW, tools: ['spectro'] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: { cols: [
      { key: 'h', kind: 'data', name: 'time', unit: 'hr', sig: 0, raw: 'hrs', rawLabel: 'Hours since the lab’s start' },
      { key: 'n', kind: 'data', name: 'counts', unit: 'counts', sig: 0, raw: 'counts', rawLabel: 'Counts in one exposure' }] },
    steps: [
      `<b>Part A: Algol</b> (about 20 minutes). The star in the middle is Algol, “the Demon Star”. Click it: its panel has a <b>Photometer</b> row, the counts a detector collects from it in one exposure. (If the panel shrinks to a name at the top left, click the name; if you lose Algol, type its name in the search box.) The ground and the daylight are switched off. Within the next few hours Algol is eclipsed: one of its two stars passes in front of the other.`,
      `Set up the notebook: <b>Choose what Record copies</b>, and send <b>Hours since the lab’s start</b> and <b>Counts in one exposure</b> into two columns. Record now. Then step the clock by half an hour (<b>+30 min</b> in the date box at the bottom of the sky) and record again, and again, until the counts have dropped and come all the way back up: about 20 readings. Graph counts against time.`,
      `From your graph: how long does the eclipse last, from the first drop to full light again? At the bottom, what share of the light is gone? (1 − <span class="frac"><span>counts at the bottom</span><span>counts outside the eclipse</span></span>.) The middle of the eclipse, the <b>minimum</b>: find two times, one on each side of the dip, with the same counts; the minimum is halfway between them. Do it with a second pair and average.`,
      `The next eclipse comes about 2.9 days later. ${GOTO('2027-10-25T12:00:00Z', 'Jump to October 25, 12:00 UTC')}, step by half an hour, record, and find its minimum the same way. Algol’s <b>period</b> is the time between the two minima (in hours; divide by 24 for days). If you have time: half a period after a minimum there is a second, much shallower dip. Which of Algol’s two stars gives most of its light?`,
      `<b>Part B: Spica</b> (about 25 minutes). Type Spica in the search box. In the <b>Spectrograph</b> card choose <b>Zoom</b>, type 586 to 589.5 nm, and tick <b>Divide by the continuum</b>. That is helium’s line at 587.56 nm, and next to the deep dip there is a shallow one. Spica is two stars going round each other: each star’s lines are Doppler-shifted by its own velocity, so the two dips move apart and together as the stars go round.`,
      `Measure at these eight times. At each: click the button, pin the bottom of the <b>deep</b> dip first and then the bottom of the <b>shallow</b> one (click each; the arrow keys nudge a pin), and <b>Record</b>. In <b>Choose what Record copies</b>, add <b>Pin 1</b> and <b>Pin 2</b> (the pinned wavelengths) to the hours. If you cannot see two separate bottoms, skip that time. Use the hours column for time, not the clock’s local time.<br>${['2027-10-25T00:00:00Z', '2027-10-25T12:00:00Z', '2027-10-26T00:00:00Z', '2027-10-26T12:00:00Z', '2027-10-27T00:00:00Z', '2027-10-27T12:00:00Z', '2027-10-28T00:00:00Z', '2027-10-28T12:00:00Z'].map((t, i) => GOTO(t, `${i + 1}: Oct ${t.slice(8, 10)}, ${t.slice(11, 13)}:00`)).join(' ')}`,
      `Turn each wavelength into a velocity with a formula column: <i>v</i> = <i>c</i> × <span class="frac"><span>λ − 587.56 nm</span><span>587.56 nm</span></span>, with <i>c</i> = 3.00 × 10<sup>5</sup> km/s (positive: moving away from us). Graph both velocities against time. Spica’s period is 4.01 days (96.3 hours): lay a <b>Sine wave</b> model with that period over each set of points, and read its <b>amplitude</b>: <i>K</i><sub>1</sub> for the deep-lined star, <i>K</i><sub>2</sub> for the other. Which star moves faster?`,
      `The heavier star moves on the smaller circle, so <span class="frac"><span><i>M</i><sub>1</sub></span><span><i>M</i><sub>2</sub></span></span> = <span class="frac"><span><i>K</i><sub>2</sub></span><span><i>K</i><sub>1</sub></span></span>. Kepler’s third law gives their total, in solar masses (<i>K</i> in km/s, <i>P</i> in days): <i>M</i><sub>1</sub> + <i>M</i><sub>2</sub> = <span class="frac"><span>1.036 × 10<sup>−7</sup> (<i>K</i><sub>1</sub> + <i>K</i><sub>2</sub>)<sup>3</sup> <i>P</i></span><span>sin<sup>3</sup> <i>i</i></span></span><br>Here <i>i</i> is how far the orbit is tilted from face-on (90° is edge-on). Spica does not eclipse, but its two stars have been seen apart with an interferometer: <i>i</i> = 63°. How massive is each star, in Suns?`,
      `Why would astronomers rather have a binary that is double-lined <i>and</i> eclipsing, like Algol? (What does an eclipse tell you about <i>i</i>?)`,
    ],
    about: 'Both stars are <b>models</b> built from published numbers, not records. Algol’s light curve: the General Catalogue of Variable Stars (period, depth, date of a minimum, eclipse length), with an eclipse shape of our own; the real star’s minima wander by hours. Spica: the period, masses and tilt of Tkachenko et al. (2016), from which the velocity amplitudes follow; the real orbit is slightly oval and its phase on a given date is not predicted here. Its second star gives about a fifth of the light, and its lines are drawn much narrower and quieter than Spica’s fast spin and a real spectrograph would show them, so that the two stars’ lines split clearly. Each student’s two stars are a slightly different version (by your notebook seed), so classmates agree within their errors, not to the last digit.' },
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

  { id: 'clusters', group: 'The stars', title: 'Star clusters: main-sequence fitting and the turnoff', who: 'Hertzsprung, 1911 (the Hyades and the Pleiades); Trumpler, 1930; a notebook lab',
    blurb: 'Measure the colors and brightnesses of the stars in three clusters: the near Hyades give the far ones their distances, and the bluest stars left give their ages.',
    setup: { t: '2027-02-10T02:30:00Z', loc: P.richmond, target: 'Alcyone', track: false, fov: 40, show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: { cols: [
      { key: 'obj', kind: 'text', name: 'star', raw: 'obj', rawLabel: 'Name' },
      { key: 'cl', kind: 'text', name: 'cluster', raw: 'cluster', rawLabel: 'Cluster the star belongs to' },
      { key: 'b', kind: 'data', name: 'B counts', unit: 'counts', sig: 0, raw: 'countsB', rawLabel: 'Last exposure through the B (blue) filter' },
      { key: 'r', kind: 'data', name: 'R counts', unit: 'counts', sig: 0, raw: 'countsR', rawLabel: 'Last exposure through the R (red) filter' },
      { key: 'gh', kind: 'data', name: 'Hyades G', unit: 'counts', sig: 0, raw: 'countsG_hyades', rawLabel: 'Last G exposure, if a Hyades star' },
      { key: 'gp', kind: 'data', name: 'Pleiades G', unit: 'counts', sig: 0, raw: 'countsG_pleiades', rawLabel: 'Last G exposure, if a Pleiades star' },
      { key: 'gq', kind: 'data', name: 'Praesepe G', unit: 'counts', sig: 0, raw: 'countsG_praesepe', rawLabel: 'Last G exposure, if a Praesepe star' }] },
    steps: [
      `Three star clusters are up tonight, their measured stars ringed: the <b>Hyades</b> (the V of Taurus; bright Aldebaran sits in front of it and is not a member), the <b>Pleiades</b> just to the right, and <b>Praesepe</b> low in the east (in Cancer). The stars of a cluster were born together and are all at about the same distance, so a cluster shows how stars of one age differ by mass alone. Click a ringed Hyades star: its panel has a <b>Photometer</b> row with filters <b>B</b> (blue), <b>G</b> (green) and <b>R</b> (red).`,
      `Set up the notebook: <b>Choose what Record copies</b>, and send the <b>Name</b> into a column <i>star</i>, <b>Cluster the star belongs to</b> into <i>cluster</i>, the last <b>B</b> and <b>R</b> exposures into <i>B counts</i> and <i>R counts</i>, and the three <b>Last G exposure, if a … star</b> readings into <i>Hyades G</i>, <i>Pleiades G</i> and <i>Praesepe G</i>: columns A to G. Then for each ringed star: select it, click <b>B</b>, <b>G</b>, <b>R</b>, then <b>Record</b> (its G lands in its own cluster's column; the other two stay blank). Clicking inside a ring selects its star even when it is too faint to be drawn at this zoom (the view dips in and comes back); where rings overlap, as in the V of the Hyades, zoom in first. Or step through a cluster: <button class="btn" data-do="nextring" data-cl="hyades">Next Hyades star</button> <button class="btn" data-do="nextring" data-cl="pleiades">Next Pleiades star</button> <button class="btn" data-do="nextring" data-cl="praesepe">Next Praesepe star</button>. Do every ringed star of the Hyades and the Pleiades; Praesepe if you have time.`,
      `Add the columns to plot. The color: <b>Add Column</b>, Calculate, <span class="frac"><span>R counts</span><span>B counts</span></span>, the formula <code>D / C</code> (red stars have a big ratio, blue ones a small one). The brightness, as a magnitude: this photometer collects one count from a star of magnitude 25, so a star's <b>instrumental magnitude</b> is <i>m</i> = 25 − 2.5 log<sub>10</sub>(counts). Add one magnitude column per cluster: <code>25 - 2.5 * log10(E)</code>, then the same with F and with G. (Blank cells stay blank: each star has a magnitude only in its own cluster's column.)`,
      `Graph: horizontal, the color column; vertical, the Hyades magnitudes; the Pleiades magnitudes as the second series. Tick <b>Log scale, horizontal</b>, and <b>Flip vertical axis</b> (a smaller magnitude is a brighter star: brighter goes up). This is a <b>color–magnitude diagram</b>. Most stars lie on one band from bright and blue to faint and red, the <b>main sequence</b>; a few bright red stars sit above it on their own (giants). The two clusters' main sequences have the same shape. Why is the Pleiades' lower?`,
      `<b>Main-sequence fitting.</b> Stars of the same color on the main sequence give out the same light, so the vertical gap between the two sequences is how much fainter the Pleiades look: their extra distance. Add a column that subtracts a guess from your Pleiades magnitude column (if that column is J, the formula is <code>J - 2</code>) and plot it as the second series instead. To change the guess, click that column's header → <b>Edit formula…</b>. Adjust it until the Pleiades' sequence lies on the Hyades' for colors from about 1.4 to 2.1 (bluer than that, the Hyades' brightest stars have aged off the main sequence). Call the number you subtracted Δ<i>m</i>. A star 10 times farther looks 5 magnitudes fainter, so <span class="frac"><span><i>d</i><sub>Pleiades</sub></span><span><i>d</i><sub>Hyades</sub></span></span> = 10<sup>Δ<i>m</i> / 5</sup>, so <i>d</i><sub>Pleiades</sub> = <i>d</i><sub>Hyades</sub> × 10<sup>Δ<i>m</i> / 5</sup>. The Hyades are 47.5 pc away (from their parallaxes). How far are the Pleiades?`,
      `<b>The turnoff.</b> The hottest stars burn out first, so the older a cluster, the redder the color at which its main sequence ends. Among the ringed stars of each cluster, find the bluest one still on the main-sequence band. A star well above the band, like Chamukuy in the Hyades, has already left it, even if it is not red. Then:` + HELP('<table class="lab-tab"><tr><th><span class="frac"><span>R</span><span>B</span></span> of the bluest</th><th>age, years</th></tr><tr><td>0.73</td><td>40 million</td></tr><tr><td>0.79</td><td>100 million</td></tr><tr><td>0.82</td><td>160 million</td></tr><tr><td>0.85</td><td>250 million</td></tr><tr><td>0.89</td><td>400 million</td></tr><tr><td>0.96</td><td>630 million</td></tr><tr><td>1.12</td><td>1 billion</td></tr><tr><td>1.43</td><td>2.5 billion</td></tr><tr><td>1.80</td><td>10 billion</td></tr></table>Between rows, go in proportion. From the MIST stellar models (Choi et al. 2016), through this photometer.') + ` Which cluster is younger, and by about how much?`,
      `If you measured Praesepe: fit its main sequence to the Hyades' the same way. How far is it, and how old? Is it more like the Hyades or the Pleiades?`,
    ],
    about: `The members and their brightnesses and colors are real Gaia DR2 data (ESA/Gaia/DPAC): the members chosen by the Gaia Collaboration (Babusiaux et al. 2018, A&A 616, A10), G and BP−RP from Gaia DR2. To keep the clicking to one class period only some members are ringed: a few of the brightest, then about one star per step in color along each main sequence, picked from the middle of the band (which leaves out most double stars: real clusters are messier). The counts are a <b>model</b> built from those numbers, as in the colors lab: the G counts from the star’s G magnitude, the B and R counts from a blackbody at the temperature its color gives. Both are corrected for the thin dust in front of each cluster (E(B−V) = 0.001, 0.045 and 0.027). The Hyades are a little richer in metals than the Pleiades, which makes their main sequence a little brighter at a given color: main-sequence fitting then puts the Pleiades a few percent too near or far. Compare with their parallax distance (136 pc) once you are done.` },

  // ------------------------------------------------------------------ Standard candles
  { id: 'cepheid-distance', group: 'Standard candles', title: 'How far is δ Cephei? A Cepheid as a standard candle', who: 'Leavitt, 1912; a notebook lab',
    blurb: 'Measure a Cepheid’s period and average brightness, and let the period–luminosity law give its distance.',
    setup: { t: '2026-09-01T03:00:00Z', loc: P.richmond, target: { hip: 110991 }, track: true, fov: 12, mount: 'eq', show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: PHOTO_TEMPLATE,
    steps: [
      ...PHOTOMETRY('ε Cephei, about 2° to the southwest, or ζ Cephei'),
      'Step the date by a day at a time (the <kbd>]</kbd> key steps one day, <kbd>&gt;</kbd> one hour; the date box has the same steps) and record its counts every night for at least three weeks. Some nights, take two readings a few hours apart.',
      'Graph magnitude against date. Upside down is the astronomers’ custom (brighter higher): you may flip the axis. How long is one cycle, from one maximum to the next? Use as many cycles as you can, or lay a <b>Sine wave</b> model over your points. What is its average magnitude?',
      'Henrietta Leavitt found that the longer a Cepheid’s period, the more luminous it is. Calibrated today on Cepheids with measured parallaxes, the law is <i>M</i><sub>V</sub> = −2.43 ( log <i>P</i> − 1 ) − 4.05, with the period <i>P</i> in days (Benedict et al. 2007). What is δ Cephei’s absolute magnitude <i>M</i>?',
      'The distance modulus gives the distance: <i>m</i> − <i>M</i> = 5 log <span class="frac"><span><i>d</i></span><span>10 pc</span></span>. How many parsecs, and light-years, away is δ Cephei? When you have finished, close the lab and compare with the distance in its panel, from its parallax.',
    ],
    about: 'The period–luminosity law used here is Benedict et al. (2007), calibrated on ten Cepheids whose parallaxes the Hubble Space Telescope measured. The lab next door makes the law yourself instead. Dust between us and the star dims it a little, and is ignored here. ' + CANDLE_ABOUT },
  { id: 'rr-lyrae', group: 'Standard candles', title: 'RR Lyrae: a standard candle in one night', who: 'Fleming, 1901; a notebook lab',
    blurb: 'A star that brightens by a factor of two in an hour and repeats in half a day.',
    setup: { t: '2026-07-15T04:00:00Z', loc: P.richmond, target: { hip: 95497 }, track: true, fov: 3, mount: 'eq', show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: PHOTO_TEMPLATE,
    steps: [
      ...PHOTOMETRY(''),
      'This star changes fast: record its counts every 20 to 30 minutes (<kbd>&gt;</kbd> steps one hour, <kbd>Shift</kbd> + <kbd>↑</kbd> one minute) for a day and a half.',
      'Graph magnitude against time. How long is one cycle? How long does the star take to brighten, and to fade? What is its average magnitude?',
      'RR Lyrae stars are old stars burning helium in their cores, and all of them have nearly the same luminosity: an absolute magnitude of about <i>M</i><sub>V</sub> = +0.6. How far away is RR Lyrae? (<i>m</i> − <i>M</i> = 5 log <span class="frac"><span><i>d</i></span><span>10 pc</span></span>.) Close the lab afterward and compare with its parallax distance.',
      'Why can an RR Lyrae star, a hundred times fainter than a Cepheid, still measure the distances to the globular clusters and the center of our Galaxy?',
    ],
    about: 'RR Lyrae stars’ absolute magnitudes depend a little on how much metal the star has; +0.6 is a typical value. ' + CANDLE_ABOUT },
  { id: 'cepheid-calibrate', group: 'Standard candles', title: 'Make the period–luminosity law yourself, then measure Andromeda', who: 'Hertzsprung, 1913; Hubble, 1925; a notebook lab',
    blurb: 'Climb the distance ladder: parallaxes calibrate the Cepheids, and the Cepheids reach another galaxy.',
    setup: { t: '2026-09-01T03:00:00Z', loc: P.richmond, target: { hip: 110991 }, track: true, fov: 12, mount: 'eq', show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: PHOTO_TEMPLATE,
    steps: [
      'Rung one: Cepheids close enough for a parallax. Here are eight: <b>δ Cephei</b>, <b>η Aquilae</b>, <b>ζ Geminorum</b>, <b>β Doradus</b>, <b>ℓ Carinae</b>, <b>X Sagittarii</b>, <b>Y Sagittarii</b> and <b>T Vulpeculae</b> (search for each by name). Each one’s panel gives its distance, from its parallax (Hipparcos), and a <b>Photometer</b> row. The ground is switched off, so the southern ones can be seen too. Share them out in your group.',
      'For each Cepheid: choose a steady comparison star near it with a magnitude in its panel (not a planet or another variable), average a few of its readings (step the clock a second between them, <kbd>Shift</kbd> + <kbd>→</kbd>: each second is a new exposure), then record the Cepheid’s counts night after night (<kbd>]</kbd> steps one day) until you have at least two cycles. ℓ Carinae is slow: give it two months. Turn counts into magnitudes: <i>m</i> = <i>m</i><sub>comparison</sub> − 2.5 log <span class="frac"><span>counts</span><span>counts<sub>comparison</sub></span></span>.',
      'From each light curve: the period <i>P</i> (days) and the average magnitude <i>m</i>. From its distance <i>d</i>: its absolute magnitude, <i>M</i> = <i>m</i> − 5 log <span class="frac"><span><i>d</i></span><span>10 pc</span></span>.',
      'Make a new table, one row per Cepheid: log <i>P</i> and <i>M</i>. Graph <i>M</i> against log <i>P</i> and fit a <b>Straight line</b> by hand. That line is your own period–luminosity law. How much do the stars scatter about it, and why might they?',
      'Rung two: another galaxy. Search for <b>M31 V1</b>, the star in the Andromeda Galaxy in which Edwin Hubble recognized a Cepheid in 1923. It is about 19th magnitude: zoom in, and use a comparison star in the same field. Faint stars’ panels give a Gaia G magnitude; for a comparison star of ordinary color that is close enough to V. (If the field is dark at first, wait a few seconds for the faint stars to load.) Measure its light curve over two or three months.',
      'With your own law: V1’s absolute magnitude, then the distance to Andromeda. Hubble found about 285,000 parsecs in 1925; today’s value is about 765,000. Which way is yours off, and what in your calibration could push it that way? (Think about dust, and about the parallaxes.)',
    ],
    about: 'This is the real ladder in miniature: every rung is calibrated on the one below, and every error is carried upward. The parallax distances are Hipparcos’s, as the star catalog has them; some of these stars sit behind a magnitude of dust, which is not removed here, and two of the brightest Cepheids are binaries. The light of M31 V1 is a model built on Templeton et al. (2011): position, period, date of maximum and mean magnitude; its amplitude is our estimate. ' + CANDLE_ABOUT },
  { id: 'sn-ia', group: 'Standard candles', title: 'A Type Ia supernova as a standard candle', who: 'Phillips, 1993; the 1998 discovery of the accelerating universe; a notebook lab',
    blurb: 'Follow SN 2011fe in the Pinwheel Galaxy to its peak, calibrate it, and use it on another galaxy.',
    setup: { t: '2011-08-25T03:00:00Z', loc: P.richmond, target: 'SN 2011fe', track: true, fov: 0.6, mount: 'eq', show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: PHOTO_TEMPLATE,
    steps: [
      'On 24 August 2011 a new star appeared in the Pinwheel Galaxy (M101): SN 2011fe, the nearest Type Ia supernova in decades. It is the star in the middle. Click it: its panel has a <b>Photometer</b> row.',
      'Choose a steady comparison star in the same field with a magnitude in its panel. Average a few readings of its counts, stepping the clock a second between them (<kbd>Shift</kbd> + <kbd>→</kbd>): each second is a new exposure.',
      'Record the supernova’s counts once a night (<kbd>]</kbd> steps one day) for about two months, and turn them into magnitudes: <i>m</i> = <i>m</i><sub>comparison</sub> − 2.5 log <span class="frac"><span>counts</span><span>counts<sub>comparison</sub></span></span>.',
      'Graph magnitude against date. When did it peak, and how bright was it at peak? How many magnitudes did it fade in the 15 days after the peak?',
      'Calibrate. Cepheids in M101, measured with the Hubble Space Telescope, put it 6.85 million parsecs away (distance modulus 29.19). What was the supernova’s absolute magnitude at peak?',
      'Use it. SN 2014J went off in the Cigar Galaxy (M82) in January 2014 (search for it, and step to the end of January). Find its peak magnitude the same way, and with your calibration, the distance to M82.',
      'Red giants put M82 about 3.5 million parsecs away. Does your answer agree? What could make a supernova look fainter than it should, and what would that do to the distance you work out? (Its spectrum showed it to be unusually red.)',
    ],
    about: 'Type Ia supernovae are not all exactly alike: the brighter ones fade more slowly (the Phillips relation), and real work corrects for that and for dust. Both supernovae’s brightness here is a <b>model</b> built on published numbers (the date of explosion, the date and magnitude of the peak, the late fading rate), with the typical shape of a Type Ia between them, not the measurements themselves. The counts are simulated, with photon noise. Each student’s sky is also a slightly different version of the model, set by the notebook seed: the stars’ and supernovae’s brightness is shifted by about the uncertainty in the published numbers (a few hundredths of a magnitude). Your answer should agree with your classmates’ within your uncertainties, not to the last digit.' },
  { id: 'sn-types', group: 'Standard candles', title: 'Two supernovae in one galaxy: Type Ia or Type II?', who: 'Minkowski, 1941; a notebook lab',
    blurb: 'M101 had a supernova in 2011 and another in 2023. Tell them apart by their light curves.',
    setup: { t: '2011-08-25T03:00:00Z', loc: P.richmond, target: 'M 101', track: true, fov: 0.6, mount: 'eq', show: CANDLE_SHOW, tools: [] },
    notebook: true, photometer: true, obs: { seeing: 0, noise: 0 }, template: PHOTO_TEMPLATE,
    steps: [
      'The Pinwheel Galaxy, M101, had two bright supernovae twelve years apart: <b>SN 2011fe</b> (found 24 August 2011) and <b>SN 2023ixf</b> (found 19 May 2023). Each appears in this field on its own date. Neither panel will tell you its type.',
      'Pick a steady comparison star in the field with a magnitude in its panel (the <b>Photometer</b> row gives its counts), and average a few readings, stepping the clock a second between them (<kbd>Shift</kbd> + <kbd>→</kbd>): each second is a new exposure.',
      'For each supernova: set the date to the day it was found (click the date and time), then record its counts every few days for three months (<kbd>]</kbd> steps one day): about 20 to 25 readings each, closer together in the first two weeks. Turn counts into magnitudes: <i>m</i> = <i>m</i><sub>comparison</sub> − 2.5 log <span class="frac"><span>counts</span><span>counts<sub>comparison</sub></span></span>.',
      'Add a column of <b>days since discovery</b> (the date minus the discovery date) and graph each supernova’s magnitude against it, one at a time; brighter is a smaller magnitude, so flip the vertical axis in the graph’s options. Sketch both curves on one set of axes on paper. How fast does each rise? What does each do in the month after its peak, and in the month after that?',
      'A <b>Type Ia</b> is a white dwarf blown apart: no hydrogen, a rise of two to three weeks, then a steady fade (about three magnitudes in two months, then a slow tail). A <b>Type II</b> is the collapse of a massive star’s core inside its hydrogen envelope: a rise of days, then a <i>plateau</i> while the envelope cools, then a sudden drop. Which is which?',
      'Both are in the same galaxy, so at the same distance. Which was more luminous at its peak, and by how many times? Which kind would you trust as a standard candle?',
    ],
    about: 'Both light curves are <b>models</b> built on published numbers (dates of explosion and peak, peak magnitude), with the typical shape of each type between them, not the measurements. SN 2023ixf faded off its plateau sooner than most Type II supernovae. For a third, stranger kind, search for SN 1987A in the Large Magellanic Cloud (February 1987). The counts are simulated, with photon noise. Each student’s sky is also a slightly different version of the model, set by the notebook seed: the stars’ and supernovae’s brightness is shifted by about the uncertainty in the published numbers (a few hundredths of a magnitude). Your answer should agree with your classmates’ within your uncertainties, not to the last digit.' },
  { id: 'hubble', group: 'Standard candles', title: 'The Hubble law: the faster, the farther', who: 'Slipher, 1912–1917; Hubble, 1929',
    blurb: 'Measure galaxies’ velocities from their spectra, their distances from their sizes, and the expansion rate of the universe.',
    setup: { t: '2027-04-15T02:00:00Z', loc: P.richmond, target: 'M 101', track: true, fov: 1.2, mount: 'eq', show: { atmosphere: false }, tools: ['spectro'] },
    steps: [
      `M101, the Pinwheel Galaxy, is selected, and the <b>Spectrograph</b> shows its light: the light of all its stars together, and of its glowing gas. A galaxy’s spectrum has lines you know from the stars: calcium K and H (393.37 and 396.85 nm in a laboratory), the deepest pair at the blue end, and in a spiral hydrogen α shining at 656.28 nm. Choose <b>Zoom</b> and look at 385–410 nm.`,
      `Pin the middle of the K line. Its shift Δλ from 393.37 nm gives the velocity: <span class="frac"><span><i>v</i></span><span><i>c</i></span></span> = <span class="frac"><span>Δλ</span><span>λ<sub>lab</sub></span></span>, so <i>v</i> = <i>c</i> × <span class="frac"><span>Δλ</span><span>λ<sub>lab</sub></span></span>, with <i>c</i> = 3.00 × 10<sup>5</sup> km/s. Check with H, or with hydrogen α. For M101, M 82 and M 31 the shift is tiny: zoom in to about 392–395 nm, and nudge a pin with <kbd>←</kbd> and <kbd>→</kbd> (click the plot first). Then search for M 82 and M 31 (Andromeda is low on the horizon tonight; the spectrograph works anyway). What is odd about M 31?`,
      `Open the <b>Hubble’s-law lab</b> (<kbd>H</kbd>, or the menu). In <b>1 · Choose galaxies</b>, set <b>Brighter than</b> to Any and add these eleven by name: NGC 4254 (M 99), NGC 5987, NGC 5908, NGC 5533, NGC 3646, NGC 2998, NGC 4921, NGC 3891, NGC 2955, NGC 4662, NGC 6195. For each: click its name to select it, measure its velocity as for M101, and type it into <b>2 · My table</b>.`,
      `Distances. No catalogue lists them, so calibrate. M101 is 6.85 million parsecs away (the Cepheids of the supernova lab); its angular size θ is in its panel (<b>Size</b>, the first number, in arcminutes). For a small angle in radians, θ = <span class="frac"><span><i>D</i></span><span><i>d</i></span></span>, so its true diameter is <i>D</i> = θ × <i>d</i> (θ in arcminutes, divided by 60, times <span class="frac"><span>π</span><span>180</span></span> for radians). <b>Assume</b> the other spirals are as big, and use <b>Estimate distances from angular size</b> under the table, which works out <i>d</i> = <span class="frac"><span><i>D</i></span><span>θ</span></span> for each.`,
      `The plot: velocity against distance, with a line through the origin. Its slope is the Hubble constant, H<sub>0</sub> = <span class="frac"><span><i>v</i></span><span><i>d</i></span></span>, in km/s per megaparsec. What do you get?`,
      `Run the film backwards: a galaxy at distance <i>d</i>, moving away at <i>v</i>, was here a time <i>t</i> = <span class="frac"><span><i>d</i></span><span><i>v</i></span></span> = <span class="frac"><span>1</span><span>H<sub>0</sub></span></span> ago. Turn it into years: 1 Mpc = 3.086 × 10<sup>19</sup> km and 1 year = 3.156 × 10<sup>7</sup> s. How old does that make the universe?`,
      `Two things to think about. Recall what you found for M 31 in step 2, and where M101 and M 82, at a few million parsecs, would sit on your plot: why do nearby galaxies not follow the law? And your distances rest on one assumption, that all spirals are as big as M101: if they were really 20% smaller, what would that do to your H<sub>0</sub>? (Try it: M31’s distance from the Cepheid lab, 0.78 Mpc, and its size give a second calibration.)`,
    ],
    about: 'Hubble’s 1929 diagram used distances that were too small by a factor of seven, so his H<sub>0</sub> was about 500 km/s per Mpc. Today’s values are near 70 (and the two best methods disagree slightly: the “Hubble tension”). <b>The spectra are models</b>: each galaxy’s light is built from its Hubble type and its catalogued redshift (OpenNGC), with the lines a galaxy’s stars and gas show, all shifted by (1 + <i>z</i>); the depths are schematic. The catalogue’s redshifts are hidden during the lab: close it afterward and compare yours with them. The sizes are the catalogue’s (OpenNGC’s major axes), and real spirals differ in size by a factor of several, which is the main scatter in your plot. Distances in megaparsecs: 1 Mpc = 3.26 million light-years.' },
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

/** Labs that were merged into another keep working from old links. */
const MERGED = { 'eclipse-shape': 'eclipse-timing' };
export const labById = (id) => LABS.find((l) => l.id === (MERGED[id] || id));
