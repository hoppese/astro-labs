// state.js: the single shared application state, a tiny event bus, and persistence.
// Modules read `state` directly and call `set()` / `emit()` so everything else can react.

const listeners = new Map();
const QUIET = new Set(['render', 'frame', 'tick']);     // events that do not by themselves need a redraw
export function on(evt, fn) {
  if (!listeners.has(evt)) listeners.set(evt, []);
  listeners.get(evt).push(fn);
}
export function emit(evt, arg) {
  for (const fn of listeners.get(evt) || []) fn(arg);
  if (!QUIET.has(evt)) for (const fn of listeners.get('render') || []) fn();
}

export const DEFAULT_LOCATION = { name: 'Richmond', region: 'Indiana, USA', lat: 39.83, lon: -84.89, elev: 300, tz: 'America/Indiana/Indianapolis' };

export const state = {
  // --- time ---
  timeMs: Date.now(),      // simulation instant, UTC milliseconds
  rate: 1,                 // simulated seconds per real second (negative = backwards)
  playing: true,
  // --- place ---
  loc: { ...DEFAULT_LOCATION },
  homeLoc: null,           // the place the user chose, while pointing borrows the phone's own (js/point/): that one is never stored
  // --- view ---
  mount: 'altaz',          // 'altaz' | 'eq'
  bortle: 4,               // 1 (pristine) .. 9 (inner city)
  show: {
    atmosphere: true,        // sky glow, daylight, extinction, light pollution
    refraction: true,        // bending of light near the horizon; independent of the glow so limb timings can be done without it
    ground: true, cardinal: true,
    starNames: true, planetNames: true,
    conLines: true, conNames: true, conBounds: false,
    azGrid: false, eqGrid: false,
    meridian: false, ecliptic: false, equator: false,
    dso: true,
    steady: true,            // when time runs fast: hold the sky's light (and, while following something, ground, refraction, orientation); steady.js
    sunspots: true,          // sunspots of the date (js/sunspots.js); off = a spotless Sun (labs always get the spotless disc)
    netStars: true,          // fetch stars fainter than the bundled catalog (G > 12) for the field on screen from the online Gaia service
  },
  lightTime: true,         // true = positions as seen (light-time corrected); false = geometric
  // physical effects that the measurement labs switch on and off (not saved between visits)
  fx: { aberration: true, parallax: true, properMotion: true, earthShadow: false },
  // --- selection ---
  selected: null,          // object reference, see objects.js
  tracking: false,         // following trackRef (nav.js: track / stopTracking); independent of what is selected
  keepTracked: false,      // notebook labs: closing the object panel only puts it away (nav.js select)
  trackRef: null,
};

/** The display switches as they are for a new visitor (labs/setup.js, "Reset display" in ui.js). */
export const SHOW_DEFAULTS = { ...state.show };

/** What is in force NOW: the user's switches, less what steady.js holds off while time runs fast. Read these, not state.show, when drawing or projecting. */
export const eff = {
  steady: '',              // '' | 'sky' | 'full'
  pointing: false,         // a phone is being pointed at the sky (js/point/): its own attitude is the view, apparent places, no steady sky
  get atmosphere() { return state.show.atmosphere && !this.steady; },
  get refraction() { return this.pointing || (state.show.refraction && this.steady !== 'full'); },
  get ground() { return state.show.ground && this.steady !== 'full'; },
  get mount() { return this.pointing ? 'altaz' : this.steady === 'full' ? 'eq' : state.mount; },
};

/** Toggle one of the state.show flags. */
export function toggle(key, value) {
  state.show[key] = value === undefined ? !state.show[key] : !!value;
  save();
  emit('show', key);
}
export function set(key, value) {
  state[key] = value;
  save();
  emit(key, value);
}

// ---- persistence (per-viewer convenience only; the app works without it) ----
const KEY = 'astro-labs.planetarium.v1';
export function save() {
  if (state.ephemeral || state.holdSave) return;      // (holdSave: a quiz has switched things off for the time being)
  // a lab preset or a shared link is showing: do not overwrite the viewer's own settings
  try {
    localStorage.setItem(KEY, JSON.stringify({ loc: state.homeLoc || state.loc, mount: state.mount, bortle: state.bortle, show: state.show, lightTime: state.lightTime }));
  } catch (e) { /* storage unavailable: fine */ }
}
export function load() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!o) return;
    if (o.loc && isFinite(o.loc.lat) && isFinite(o.loc.lon)) state.loc = { ...DEFAULT_LOCATION, ...o.loc };
    if (o.mount === 'eq' || o.mount === 'altaz') state.mount = o.mount;
    if (o.bortle >= 1 && o.bortle <= 9) state.bortle = Math.round(o.bortle);
    if (typeof o.lightTime === 'boolean') state.lightTime = o.lightTime;
    if (o.show) for (const k of Object.keys(state.show)) if (typeof o.show[k] === 'boolean') state.show[k] = o.show[k];
  } catch (e) { /* ignore */ }
}
