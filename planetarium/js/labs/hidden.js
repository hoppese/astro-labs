// labs/hidden.js: while a lab is running, the rows of the object panel (and the notebook's Record readings) that ARE what the
// lab asks the student to find are not shown. Rows the prompt tells the student to read stay. The page opened with
// instructor=1 shows everything; closing the lab brings everything back. The list, lab by lab, with reasons, is in LABS.md.

export const running = { id: null };
export const INSTRUCTOR = typeof location !== 'undefined' && new URLSearchParams(location.search).get('instructor') === '1';

// keys: the start of the row's label in info.js, lower case
const DIST = ['distance', 'light time'], SIZE = ['angular diameter'], TRANSIT = ['rise / set', 'transit'], STAR = ['distance', 'parallax', 'proper motion'];
export const HIDDEN = {
  'eclipse-timing': [...DIST, ...SIZE], 'eclipse-shape': SIZE, moonrise: [...SIZE, ...TRANSIT], 'lunar-parallax': [...DIST, ...SIZE],
  'eclipse-two-sites': [...DIST, ...SIZE], 'moon-apsides': [...DIST, ...SIZE], months: TRANSIT,
  'half-moon': [...DIST, 'elongation'], 'sun-moon-size': [...DIST, ...SIZE], eratosthenes: TRANSIT, 'sun-apsides': [...DIST, ...SIZE],
  obliquity: [...TRANSIT, 'ra / dec'], zodiac: [], elongation: ['elongation'], synodic: [], retrograde: [],
  'kepler-mars': [...DIST, 'elongation'], 'jupiter-mass': ['from '], 'venus-phases': SIZE,
  'venus-transit-1769': ['light time', ...SIZE], 'venus-transit-2012': ['light time', ...SIZE], 'mercury-transit': ['light time', ...SIZE], 'mars-parallax': ['light time'],
  romer: ['light time', 'seen vs. actual'], aberration: [], parallax: STAR, 'barnard-parallax': STAR, 'proxima-parallax': STAR, 'proper-motion': ['proper motion'],
  canopus: TRANSIT, 'sidereal-day': TRANSIT, analemma: TRANSIT, 'polaris-latitude': [...TRANSIT, 'ra / dec'], 'precession-pole': [], 'precession-equinox': [],
};
/** Is the row with this label (may contain HTML) hidden now? */
export function rowHidden(label) {
  if (!running.id || INSTRUCTOR) return false;
  const l = String(label).replace(/<[^>]*>/g, '').toLowerCase();
  return (HIDDEN[running.id] || []).some((k) => l.startsWith(k));
}
/** True while the running lab asks for the latitude: the place shows its name only (ui.js, the screenshot caption). */
export const latitudeHidden = () => running.id === 'polaris-latitude' && !INSTRUCTOR;
