// skyframe.js: everything that depends only on (time, place): rotation matrices between the
// frames, sidereal time, the aberration vector. Recomputed when the instant or the site changes.

import { A, fromRot, transpose, mulMV, mulMM, vecOf, C_AU_PER_DAY, mod } from './astro.js';
import { state } from './state.js';
import './deltat.js';            // the clocks: UTC, TT, UT1
import { jpl, init as initJpl } from './jpl.js';
import { vantageHelio } from './ephem.js';

let cache = null, cacheKey = '';

/** The frame for the current state (cached per instant and site). */
export function getFrame() {
  const loc = state.loc;
  const fx = state.fx;
  const key = jpl.version + '|' + (state.vantage || '') + (state.vantage === 'Above' ? state.aboveAU : '') + '|' + state.timeMs + '|' + loc.lat + '|' + loc.lon + '|' + (loc.elev || 0) + '|' + fx.aberration + fx.parallax;
  if (key === cacheKey) return cache;
  cacheKey = key;
  cache = makeFrame(state.timeMs, loc, state.vantage);
  // the labs can switch annual aberration and annual parallax off (see js/labs/corrections.js)
  if (!fx.aberration) { cache.beta[0] = 0; cache.beta[1] = 0; cache.beta[2] = 0; cache.aberration = false; }
  cache.parallax = fx.parallax;
  return cache;
}

/** vantage: null (on the Earth at loc), or the id of a body the observer floats at the center of (js/ephem.js VANTAGES). In space
 *  "horizontal" is the ecliptic of date (its north pole is the zenith): there is no ground, and nothing else in the app needs to know. */
export function makeFrame(timeMs, loc, vantage = null) {
  const time = A.MakeTime(new Date(timeMs));
  const obs = new A.Observer(loc.lat, loc.lon, loc.elev || 0);
  let Mjh = fromRot(A.Rotation_EQJ_HOR(time, obs));        // J2000 equatorial -> horizontal
  const Mjd = fromRot(A.Rotation_EQJ_EQD(time));           // J2000 -> equator of date
  let Mdh = fromRot(A.Rotation_EQD_HOR(time, obs));        // equator of date -> horizontal
  const ev = A.BaryState(A.Body.Earth, time);              // for annual aberration of the stars
  // annual aberration plus the observer's own share of the Earth's rotation (diurnal, up to 0.32 arcsec)
  let ov = A.ObserverState(time, obs, false);
  let beta = [(ev.vx + ov.vx) / C_AU_PER_DAY, (ev.vy + ov.vy) / C_AU_PER_DAY, (ev.vz + ov.vz) / C_AU_PER_DAY];
  let betaDay = [ov.vx / C_AU_PER_DAY, ov.vy / C_AU_PER_DAY, ov.vz / C_AU_PER_DAY];
  const gast = A.SiderealTime(time);                       // Greenwich apparent sidereal time, hours
  const P = vantage ? vantageHelio(vantage, time) : null;
  if (P) {
    // the observer at the body's center: ov becomes the offset from the Earth's center, its velocity the body's (the Sun's own
    // 13 m/s about the barycenter is left out: 0.01 arcsec of aberration)
    const E = vecOf(A.HelioVector(A.Body.Earth, time)), dt = 1 / 1440;
    const p1 = vantageHelio(vantage, time.AddDays(dt)), p0 = vantageHelio(vantage, time.AddDays(-dt)) || P;
    const vel = p1 ? [0, 1, 2].map((i) => (p1[i] - p0[i]) / (2 * dt) / C_AU_PER_DAY) : [0, 0, 0];
    ov = { x: P[0] - E[0], y: P[1] - E[1], z: P[2] - E[2] };
    beta = vel; betaDay = [0, 0, 0];
    Mjh = fromRot(A.Rotation_EQJ_ECT(time)); Mdh = mulMM(Mjh, transpose(Mjd));
  }
  return {
    timeMs, time, obs, loc, vantage: P ? vantage : null,
    oposB: [ev.x + ov.x, ev.y + ov.y, ev.z + ov.z], opos: [ov.x, ov.y, ov.z],      // observer from the solar-system barycenter / from the Earth's center, au
    aberration: true, parallax: false,                    // getFrame() sets these from state.fx
    epos: P ? [ev.x + ov.x, ev.y + ov.y, ev.z + ov.z] : [ev.x, ev.y, ev.z],      // the observer's Earth (or body) from the solar-system barycenter, au (annual parallax)
    betaTrue: beta.slice(), betaDay,                                // observer's velocity / c even when aberration is switched off
    Mjh, Mhj: transpose(Mjh), Mjd, Mdj: transpose(Mjd), Mdh, Mhd: transpose(Mdh),
    beta,
    lst: mod(gast + loc.lon / 15, 24),                     // local apparent sidereal time, hours
    years: time.tt / 365.25,                               // Julian years since J2000 (for proper motion)
    Mej: fromRot(A.Rotation_ECL_EQJ()),                    // mean ecliptic J2000 -> EQJ
    Mtj: fromRot(A.Rotation_ECT_EQJ(time)),                // true ecliptic OF DATE -> EQJ
    Mjt: fromRot(A.Rotation_EQJ_ECT(time)),                // EQJ -> true ecliptic of date
    /** Apparent HOR direction (no refraction) of a J2000 unit vector that has no aberration applied yet. */
    starHor(v) {
      // back to unit length: v + beta is up to 1e-4 short or long, and everything downstream (refraction's asin, the view-cone
      // test) assumes a unit vector: a deep-sky symbol sat up to an arcminute from its own marker and vanished when zoomed in
      const x = v[0] + beta[0], y = v[1] + beta[1], z = v[2] + beta[2], f = 1 / Math.sqrt(x * x + y * y + z * z);
      return mulMV(Mjh, [x * f, y * f, z * f]);
    },
  };
}
export { vecOf, initJpl };
