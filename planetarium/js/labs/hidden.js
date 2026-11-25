// labs/hidden.js: while a lab is running, the rows of the object panel (and the notebook's Record readings) that ARE what the
// lab asks the student to find are not shown. Rows the prompt tells the student to read stay. The page opened with
// instructor=1 shows everything; closing the lab brings everything back. The list, lab by lab, with reasons, is in LABS.md.

export const running = { id: null };
export const INSTRUCTOR = typeof location !== 'undefined' && new URLSearchParams(location.search).get('instructor') === '1';

// keys: the start of the row's label in info.js, lower case
// 'hour angle' is hidden where the student times a crossing of the meridian by eye (it reads 0 at the answer)
const DIST = ['distance', 'light time'], SIZE = ['angular diameter'], TRANSIT = ['rise / set', 'transit'], STAR = ['distance', 'parallax', 'proper motion'];
export const HIDDEN = {
  'eclipse-timing': [...DIST, ...SIZE, 'magnitude'], 'eclipse-shape': SIZE, moonrise: [...SIZE, ...TRANSIT, 'hour angle'], 'lunar-parallax': [...DIST, ...SIZE],
  'eclipse-two-sites': [...DIST, ...SIZE], 'moon-apsides': [...DIST, ...SIZE], months: [...TRANSIT, 'hour angle'],
  'half-moon': [...DIST, 'elongation'], 'sun-moon-size': [...DIST, ...SIZE], eratosthenes: TRANSIT, 'sun-apsides': [...DIST, ...SIZE],
  obliquity: [...TRANSIT, 'ra / dec'], zodiac: [], elongation: ['elongation'], synodic: [], retrograde: [],
  'kepler-mars': [...DIST, 'elongation'], 'jupiter-mass': ['from '], 'venus-phases': SIZE,
  'venus-transit-1769': ['light time', ...SIZE], 'venus-transit-2012': ['light time', ...SIZE], 'mercury-transit': ['light time', ...SIZE], 'mars-parallax': ['light time'],
  romer: ['light time', 'seen vs. actual', 'spot crosses'], aberration: [], parallax: STAR, 'barnard-parallax': STAR, 'proxima-parallax': STAR, 'proper-motion': STAR,
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

// ---- other things that would give a lab's answer away ----
// steps of the date box (ui.js) whose size IS what the lab measures: the label without its sign, as in ui.js STEPS
const STEPS_HIDDEN = { months: ['syn. mo', 'sid. mo'], moonrise: ['syn. mo', 'sid. mo', 'sid. d'], 'sidereal-day': ['sid. d'], synodic: ['Mars yr'], retrograde: ['Mars yr'] };
export const stepHidden = (label) => !!running.id && !INSTRUCTOR && (STEPS_HIDDEN[running.id] || []).some((k) => label.endsWith(' ' + k));
// lists of the Events finder that answer the question
const EVENTS_HIDDEN = { elongation: ['elong'] };
export const eventsHidden = (cat) => !!running.id && !INSTRUCTOR && (EVENTS_HIDDEN[running.id] || []).includes(cat);
// labs whose subject is the horizon: no "Hide the ground" beside the prompt
export const groundStays = () => running.id === 'moonrise' || running.id === 'canopus';
