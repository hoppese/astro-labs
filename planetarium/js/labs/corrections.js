// labs/corrections.js: switches for the small physical effects the classic measurements are about:
// annual aberration (Bradley), annual parallax (Bessel), proper motion, plus shortcuts to refraction,
// light-travel time and the outline of the Earth's shadow. The flags live in state.fx and are not saved.

import { state, on, emit, toggle, set } from '../state.js';
import { cam } from '../camera.js';
import { stars } from '../catalog.js';
import { makeCard } from './dock.js';

const ROWS = [
  ['fx', 'aberration', 'Annual aberration', 'Starlight seems to come from slightly ahead of the moving Earth: every star traces a yearly ellipse 20.5″ in half-width.'],
  ['fx', 'parallax', 'Annual parallax', 'Nearby stars shift against distant ones as the Earth goes round the Sun (from the catalogue distances; under 1″).'],
  ['fx', 'properMotion', 'Proper motion', 'Each star drifts at its catalogued rate. Off = stars stay at their J2000 places.'],
  ['show', 'refraction', 'Atmospheric refraction', 'Lifts everything near the horizon (about 0.5° at the horizon). Turn off to time risings and settings cleanly.'],
  ['lt', 'lightTime', 'Light-travel time', 'On = planets and moons where we see them. Off = where they are at this instant.'],
  ['fx', 'earthShadow', "Outline of the Earth's shadow", 'Umbra and penumbra at the Moon’s distance (opposite the Sun), so they can be measured.'],
];
let card = null;
export function setFx(key, value) { state.fx[key] = !!value; emit('fx', key); sync(); }
const get = ([kind, key]) => (kind === 'fx' ? state.fx[key] : kind === 'show' ? state.show[key] : state.lightTime);
function sync() {
  if (!card) return;
  card.body.querySelectorAll('input[data-i]').forEach((c) => { c.checked = !!get(ROWS[+c.dataset.i]); });
}
export function initCorrections() {
  card = makeCard('corrections', 'Corrections · effects', { onOpen: sync });
  card.body.innerHTML = ROWS.map((r, i) => `<label class="chk"><input type="checkbox" data-i="${i}"><span>${r[2]}<small>${r[3]}</small></span></label>`).join('');
  card.body.addEventListener('change', (e) => {
    const c = e.target; if (c.dataset.i == null) return;
    const [kind, key] = ROWS[+c.dataset.i];
    if (kind === 'fx') setFx(key, c.checked); else if (kind === 'show') toggle(key, c.checked); else set('lightTime', c.checked);
  });
  on('show', sync); on('lightTime', sync); on('fx', sync);
  // zoomed far in, re-apply proper motion almost continuously so a fast star (Barnard's: 10″ a year) moves smoothly
  // (under 0.2 deg, where the notebook labs measure to hundredths of an arcsecond, every 10 minutes: 0.0002 arcsec for Barnard's star)
  // (the tolerance itself is now set by renderer.js before each frame is drawn: stars.epochTol)
  return card;
}
