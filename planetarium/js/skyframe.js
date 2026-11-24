// skyframe.js: everything that depends only on (time, place): rotation matrices between the
// frames, sidereal time, the aberration vector. Recomputed when the instant or the site changes.

import { A, fromRot, transpose, mulMV, vecOf, C_AU_PER_DAY, mod } from './astro.js';
import { state } from './state.js';
import './deltat.js';            // the clocks: UTC, TT, UT1
import { jpl, init as initJpl } from './jpl.js';

let cache = null, cacheKey = '';

/** The frame for the current state (cached per instant and site). */
export function getFrame() {
  const loc = state.loc;
  const fx = state.fx;
  const key = jpl.version + '|' + state.timeMs + '|' + loc.lat + '|' + loc.lon + '|' + (loc.elev || 0) + '|' + fx.aberration + fx.parallax;
  if (key === cacheKey) return cache;
  cacheKey = key;
  cache = makeFrame(state.timeMs, loc);
  // the labs can switch annual aberration and annual parallax off (see js/labs/corrections.js)
  if (!fx.aberration) { cache.beta[0] = 0; cache.beta[1] = 0; cache.beta[2] = 0; cache.aberration = false; }
  cache.parallax = fx.parallax;
  return cache;
}

export function makeFrame(timeMs, loc) {
  const time = A.MakeTime(new Date(timeMs));
  const obs = new A.Observer(loc.lat, loc.lon, loc.elev || 0);
  const Mjh = fromRot(A.Rotation_EQJ_HOR(time, obs));      // J2000 equatorial -> horizontal
  const Mjd = fromRot(A.Rotation_EQJ_EQD(time));           // J2000 -> equator of date
  const Mdh = fromRot(A.Rotation_EQD_HOR(time, obs));      // equator of date -> horizontal
  const ev = A.BaryState(A.Body.Earth, time);              // for annual aberration of the stars
  // annual aberration plus the observer's own share of the Earth's rotation (diurnal, up to 0.32 arcsec)
  const ov = A.ObserverState(time, obs, false);
  const beta = [(ev.vx + ov.vx) / C_AU_PER_DAY, (ev.vy + ov.vy) / C_AU_PER_DAY, (ev.vz + ov.vz) / C_AU_PER_DAY];
  const gast = A.SiderealTime(time);                       // Greenwich apparent sidereal time, hours
  return {
    timeMs, time, obs, loc, oposB: [ev.x + ov.x, ev.y + ov.y, ev.z + ov.z], opos: [ov.x, ov.y, ov.z],      // observer from the solar-system barycentre / from the Earth's centre, au
    aberration: true, parallax: false,                    // getFrame() sets these from state.fx
    epos: [ev.x, ev.y, ev.z],                              // Earth from the solar-system barycentre, au (annual parallax)
    betaTrue: beta.slice(), betaDay: [ov.vx / C_AU_PER_DAY, ov.vy / C_AU_PER_DAY, ov.vz / C_AU_PER_DAY],                                // observer's velocity / c even when aberration is switched off
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
