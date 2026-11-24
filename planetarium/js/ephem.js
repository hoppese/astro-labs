// ephem.js: Sun, Moon, planets and their moons for the current frame.
// Positions come from astronomy-engine. Saturn's moons are NOT in astronomy-engine: they are
// propagated from JPL's published mean orbital elements (see SATURN_MOONS) and are approximate.

import { A, DEG, RAD, AU_KM, C_AU_PER_DAY, vecOf, unit, len, sub, add, scale, dot, cross, sph, mulMV, mod } from './astro.js';
import { state } from './state.js';

export const BODIES = [
  { id: 'Sun', name: 'Sun', kind: 'sun', radiusKm: 695700, color: '#fff3c4' },
  { id: 'Moon', name: 'Moon', kind: 'moon', radiusKm: 1737.4, color: '#e8e6df' },
  { id: 'Mercury', name: 'Mercury', kind: 'planet', radiusKm: 2439.7, color: '#c9b8a0' },
  { id: 'Venus', name: 'Venus', kind: 'planet', radiusKm: 6051.8, color: '#fff6d8' },
  { id: 'Mars', name: 'Mars', kind: 'planet', radiusKm: 3396.2, color: '#ff9a6a' },
  { id: 'Jupiter', name: 'Jupiter', kind: 'planet', radiusKm: 71492, polarKm: 66854, color: '#f3dfc0' },
  { id: 'Saturn', name: 'Saturn', kind: 'planet', radiusKm: 60268, polarKm: 54364, color: '#f0dca8' },
  { id: 'Uranus', name: 'Uranus', kind: 'planet', radiusKm: 25559, color: '#b5ecf0' },
  { id: 'Neptune', name: 'Neptune', kind: 'planet', radiusKm: 24764, color: '#8fb0ff' },
];

// Galilean moons: positions from astronomy-engine's JupiterMoons(). V(1,0) magnitudes and radii
// are the standard published values (Astronomical Almanac).
const JUPITER_MOONS = [
  { id: 'Io', key: 'io', radiusKm: 1821.6, v10: -1.68, color: '#f5e7a0' },
  { id: 'Europa', key: 'europa', radiusKm: 1560.8, v10: -1.41, color: '#eee6d6' },
  { id: 'Ganymede', key: 'ganymede', radiusKm: 2634.1, v10: -2.09, color: '#d9cdbb' },
  { id: 'Callisto', key: 'callisto', radiusKm: 2410.3, v10: -1.05, color: '#b0a596' },
];

// Saturn's moons are not in astronomy-engine. Each orbit is anchored to the moon's Saturn-centred
// position on 2026-11-24 (JPL Horizons, SAT441) and advanced at the mean sidereal rate 360/P from
// JPL's "Planetary Satellite Mean Elements" table. The inner five move on circles in Saturn's
// equatorial plane; Titan and Iapetus on ellipses in the plane of their 2026 orbit, with the
// periapsis advancing at the published rate. tools/fit_saturn_moons.mjs derives this table and
// prints its error against Horizons 9 years either side (about 1 degree of orbital longitude or
// better, except Mimas, whose 70-year libration is not modelled).
//   a km, P days (sidereal), L = mean longitude at T0 (deg, from the ascending node of the orbit
//   plane on the ICRF equator), e, peri = longitude of periapsis at T0, Pw = apsidal period (yr),
//   normal = orbit-plane pole in EQJ (absent = Saturn's pole).
const SAT_T0 = 9823.5;          // 2026-11-24 00:00 TDB, days from J2000
export const SATURN_MOON_ELEMENTS = [
  { id: 'Mimas', a: 186000, P: 0.942422, e: 0, L: 3.19 },
  { id: 'Enceladus', a: 238400, P: 1.370218, e: 0, L: 289.03 },
  { id: 'Tethys', a: 295000, P: 1.887802, e: 0, L: 71.37 },
  { id: 'Dione', a: 377700, P: 2.736916, e: 0, L: 270.16 },
  { id: 'Rhea', a: 527200, P: 4.517503, e: 0, L: 247.43 },
  { id: 'Titan', a: 1221900, P: 15.945448, e: 0.0287, peri: 221.5, L: 35.93, Pw: 346.68, normal: [0.088064, 0.066658, 0.993882] },
  { id: 'Iapetus', a: 3561700, P: 79.331002, e: 0.0281, peri: 327.27, L: 111.15, Pw: 1662.9, normal: [0.192077, -0.178668, 0.964979] },
];
const SAT_PHYS = {
  Mimas: { radiusKm: 198.2, v10: 3.3, color: '#d8d8d8' }, Enceladus: { radiusKm: 252.1, v10: 2.1, color: '#ffffff' },
  Tethys: { radiusKm: 531.1, v10: 0.6, color: '#e8e8e8' }, Dione: { radiusKm: 561.4, v10: 0.8, color: '#e0e0e0' },
  Rhea: { radiusKm: 763.8, v10: 0.1, color: '#dcdcdc' }, Titan: { radiusKm: 2574.7, v10: -1.28, color: '#f0c070' },
  Iapetus: { radiusKm: 734.5, v10: 1.5, color: '#c8b8a0' },
};
const SATURN_MOONS = SATURN_MOON_ELEMENTS.map((m) => ({ ...m, ...SAT_PHYS[m.id] }));
export const MOON_PARENT = {};
JUPITER_MOONS.forEach((m) => { MOON_PARENT[m.id] = 'Jupiter'; });
SATURN_MOONS.forEach((m) => { MOON_PARENT[m.id] = 'Saturn'; });

/** Saturn-centred EQJ position (au) of one of Saturn's moons at TT days since J2000. */
export function saturnMoonVector(m, tt, saturnPole) {
  const Z = m.normal || saturnPole;
  const X = unit(cross([0, 0, 1], Z));            // ascending node of the orbit plane on the ICRF equator
  const Y = cross(Z, X);
  const dt = tt - SAT_T0;
  const L = m.L + 360 / m.P * dt;                 // mean longitude
  let lon = L, r = m.a;
  if (m.e) {
    const peri = m.peri + (m.Pw ? 360 / (m.Pw * 365.25) * dt : 0);
    const Mr = mod(L - peri, 360) * DEG;
    let E = Mr;
    for (let k = 0; k < 6; k++) E = Mr + m.e * Math.sin(E);
    const nu = 2 * Math.atan2(Math.sqrt(1 + m.e) * Math.sin(E / 2), Math.sqrt(1 - m.e) * Math.cos(E / 2));
    lon = peri + nu * RAD; r = m.a * (1 - m.e * Math.cos(E));
  }
  const c = Math.cos(lon * DEG) * r / AU_KM, s = Math.sin(lon * DEG) * r / AU_KM;
  return [c * X[0] + s * Y[0], c * X[1] + s * Y[1], c * X[2] + s * Y[2]];
}

let cache = null, cacheKey = '';

/** All solar-system bodies for this frame: {list, byId}. Cached per instant, site and light-time setting. */
export function getBodies(frame) {
  const key = frame.timeMs + '|' + frame.loc.lat + '|' + frame.loc.lon + '|' + state.lightTime + '|' + frame.aberration;
  if (key === cacheKey) return cache;
  cacheKey = key;
  cache = compute(frame, state.lightTime, frame.aberration !== false);
  return cache;
}

/** How much of a moon's disc is still sunlit / still visible beside its (flattened) planet.
 *  rel = moon from planet (au, EQJ), axis = unit vector along the shadow (away from the Sun) or along the line
 *  of sight (away from the observer), pole = planet's north pole, taper = cone half-angle terms in km per km.
 *  Returns {depth km (> 0: behind), frac 0..1 (1 = fully clear)}. The flattened globe is handled by stretching
 *  space along the pole until the planet is a sphere of its equatorial radius: lines stay lines, so the test
 *  becomes a point against a cylinder. */
export function hiddenFraction(rel, axis, pole, parent, moonKm, inner = 0, outer = 0) {
  const f = parent.polarKm ? parent.radiusKm / parent.polarKm : 1;
  const st = (w) => { const k = (f - 1) * dot(w, pole); return [w[0] + k * pole[0], w[1] + k * pole[1], w[2] + k * pole[2]]; };
  const r = scale(st(rel), AU_KM), a = unit(st(axis));
  const depth = dot(r, a);
  const perp = len(sub(r, scale(a, depth)));
  if (depth <= 0) return { depth, frac: 1, perp };
  const lo = parent.radiusKm - inner * depth - moonKm, hi = parent.radiusKm + outer * depth + moonKm;
  return { depth, perp, frac: Math.max(0, Math.min(1, (perp - lo) / (hi - lo))) };
}

export function compute(frame, lightTime, aberration = true) {
  const { time, obs } = frame;
  const obsVec = vecOf(A.ObserverVector(time, obs, false));       // geocentre -> observer, EQJ, au
  const earth = vecOf(A.HelioVector(A.Body.Earth, time));
  const list = [], byId = {};
  for (const def of BODIES) {
    const b = { ...def, moons: [] };
    // --- as seen: light-time corrected, with aberration (what astronomy-engine's Equator returns) ---
    let seen;
    if (def.id === 'Moon') {
      // astronomy-engine ignores the Moon's 1.3 s light time; apply it here so the toggle is honest.
      const d0 = len(sub(vecOf(A.GeoMoon(time)), obsVec));
      seen = sub(vecOf(A.GeoMoon(time.AddDays(-d0 / C_AU_PER_DAY))), obsVec);
    } else {
      seen = vecOf(A.Equator(def.id, time, obs, false, aberration).vec);
    }
    // --- geometric: where the body is at this instant, no light time, no aberration ---
    let geo;
    if (def.id === 'Moon') geo = sub(vecOf(A.GeoMoon(time)), obsVec);
    else if (def.id === 'Sun') geo = sub(scale(earth, -1), obsVec);
    else geo = sub(sub(vecOf(A.HelioVector(def.id, time)), earth), obsVec);

    b.vecSeen = seen; b.vecGeo = geo;
    b.vec = lightTime ? seen : geo;
    b.dist = len(b.vec);
    b.u = unit(b.vec);
    b.lightMin = len(seen) / C_AU_PER_DAY * 1440;
    b.shiftDeg = Math.atan2(len(cross(seen, geo)), dot(seen, geo)) * RAD;      // seen vs geometric direction
    b.hor = mulMV(frame.Mjh, b.u);                                             // true (unrefracted) HOR direction
    b.angRadius = Math.asin(Math.min(1, def.radiusKm / AU_KM / b.dist)) * RAD;
    if (def.id === 'Sun') { b.mag = -26.74 + 5 * Math.log10(b.dist); b.phaseAngle = 0; b.phaseFrac = 1; b.helioDist = 0; }
    else {
      const ill = A.Illumination(def.id, time);
      b.mag = ill.mag; b.phaseAngle = ill.phase_angle; b.phaseFrac = ill.phase_fraction; b.helioDist = ill.helio_dist;
    }
    list.push(b); byId[b.id] = b;
  }
  const sun = byId.Sun;
  for (const b of list) b.elong = b === sun ? 0 : Math.acos(Math.max(-1, Math.min(1, dot(b.u, sun.u)))) * RAD;
  {
    // The Moon's phase as seen from the SITE (astronomy-engine's is geocentric; the two differ by up to
    // the Moon's parallax, about 1 degree of phase angle, which matters for the half-Moon measurement).
    const m = byId.Moon, toSun = sub(sun.vec, m.vec), toObs = scale(m.vec, -1);
    m.phaseAngle = Math.atan2(len(cross(toSun, toObs)), dot(toSun, toObs)) * RAD;
    m.phaseFrac = (1 + Math.cos(m.phaseAngle * DEG)) / 2;
  }

  // --- pole directions (for ring tilt, disc flattening, moon planes) ---
  for (const id of ['Jupiter', 'Saturn']) {
    const b = byId[id];
    const tSeen = lightTime ? time.AddDays(-b.lightMin / 1440) : time;
    b.pole = vecOf(A.RotationAxis(id, tSeen).north);
    b.subEarthLat = Math.asin(-dot(b.pole, b.u)) * RAD;      // > 0: north face tilted toward us
    b.tSeen = tSeen;
    b.helioVec = vecOf(A.HelioVector(id, tSeen));            // Sun -> planet at the instant the light left it
  }
  byId.Saturn.ringTilt = byId.Saturn.subEarthLat;

  // --- moons ---
  const addMoon = (parent, def, rel) => {
    const v = add(parent.vec, rel);
    const d = len(v), u = unit(v);
    const depth = dot(rel, parent.u);                        // > 0: farther than the planet
    const sep = Math.atan2(len(cross(v, parent.vec)), dot(v, parent.vec)) * RAD;
    const m = {
      id: def.id, name: def.id, kind: 'satellite', parent: parent.id, color: def.color, radiusKm: def.radiusKm,
      vec: v, u, dist: d, rel, hor: mulMV(frame.Mjh, u), sepDeg: sep, behind: depth > 0,
      angRadius: Math.asin(def.radiusKm / AU_KM / d) * RAD,
      mag: def.v10 + 5 * Math.log10(parent.helioDist * d),
      lightMin: d / C_AU_PER_DAY * 1440, phaseAngle: parent.phaseAngle, phaseFrac: parent.phaseFrac,
      orbitKm: len(rel) * AU_KM,
    };
    const pole = parent.pole || [0, 0, 1];
    // behind the (flattened) disc: the moon's centre is covered / how much of its disc still shows
    const occ = hiddenFraction(rel, parent.u, pole, parent, def.radiusKm);
    m.occulted = occ.depth > 0 && occ.frac < 0.5;
    m.occFrac = occ.frac;
    m.transit = !m.behind && sep < parent.angRadius;
    // in the planet's shadow: umbra narrows and penumbra widens with distance behind the planet
    const dSun = len(parent.helioVec) * AU_KM;
    const ecl = hiddenFraction(rel, unit(parent.helioVec), pole, parent, def.radiusKm, (695700 - parent.radiusKm) / dSun, (695700 + parent.radiusKm) / dSun);
    m.light = ecl.frac;                                      // 1 = full sunlight, 0 = totally eclipsed
    m.eclipsed = ecl.frac < 0.5;
    if (m.light < 1) m.mag += m.light > 1e-4 ? -2.5 * Math.log10(m.light) : 30;
    parent.moons.push(m); byId[m.id] = m;
  };
  const jup = byId.Jupiter;
  const jm = A.JupiterMoons(jup.tSeen);
  for (const def of JUPITER_MOONS) addMoon(jup, def, vecOf(jm[def.key]));
  const sat = byId.Saturn;
  for (const def of SATURN_MOONS) addMoon(sat, def, saturnMoonVector(def, sat.tSeen.tt, sat.pole));
  return { list, byId, sun, moon: byId.Moon };
}
