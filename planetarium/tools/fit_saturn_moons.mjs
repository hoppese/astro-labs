// SUPERSEDED 2026-11-24 by tools/fit_bodies.py (its table is no longer in js/ephem.js): kept for the record, does not run.
// Derive the Saturn-moon orbit table used in js/ephem.js, and measure how good it is.
//   node tools/fit_saturn_moons.mjs
//
// Source data, all NASA/JPL (public domain):
//   * Saturn-centred state vectors (ICRF, km and km/s) from JPL Horizons, ephemeris SAT441, at
//     2017-11-24, 2026-11-24 and 2035-11-24 00:00 TDB. Query used for each moon (COMMAND 601..608):
//       https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND='606'&OBJ_DATA='NO'&MAKE_EPHEM='YES'
//         &EPHEM_TYPE='VECTORS'&CENTER='500@699'&START_TIME='2017-11-24'&STOP_TIME='2035-11-24'
//         &STEP_SIZE='9 y'&REF_PLANE='FRAME'&VEC_TABLE='2'&OUT_UNITS='KM-S'
//   * Sidereal periods P, semi-major axes a and apsidal periods from JPL's "Planetary Satellite
//     Mean Elements" table (https://ssd.jpl.nasa.gov/sats/elem/).
//
// Model: each moon's orbit is anchored to its 2026-11-24 position and advanced at the published
// mean sidereal rate 360/P. The five inner moons move on circles in Saturn's equatorial plane;
// Titan and Iapetus on ellipses in the orbital plane they had on 2026-11-24. The 2017 and 2035
// vectors are NOT used in the fit: they measure the error 9 years either side.
import { A } from './check-env.mjs';
const X = await import('../js/astro.js');

const T0 = 9823.5;                                  // 2026-11-24 00:00 TDB, days from J2000
const GM = 3.79405848e7;                            // Saturn system, km^3/s^2
const STATE = {   // [2017, 2026, 2035] each [x, y, z, vx, vy, vz]
  Mimas: [[-1.740944646980126E+05, -6.956758676829684E+04, 1.621653538226844E+04, 5.466402059732370E+00, -1.299130715506026E+01, 7.483657066040394E-01],
          [-1.293073524510608E+05, 1.342786986127219E+05, -3.656762230132406E+03, -1.039426470755044E+01, -9.589580609510628E+00, 1.719418220219216E+00],
          [1.981335383860079E+04, 1.796915683688241E+05, -1.985463435619401E+04, -1.444689730278660E+01, 1.750012330325036E+00, 1.208919438118382E+00]],
  Enceladus: [[-4.283100846491692E+04, 2.341565315988250E+05, -1.359009321253657E+04, -1.237064843104969E+01, -2.133928774627762E+00, 1.220118006435953E+00],
          [1.189079410889872E+05, 2.036520112395739E+05, -2.520240783361724E+04, -1.089871849432810E+01, 6.463435788179714E+00, 4.609905970151669E-01],
          [2.227009202665005E+05, 7.753616306771884E+04, -2.488252706156404E+04, -4.247985327806675E+00, 1.193840051385149E+01, -5.119885806591222E-01]],
  Tethys: [[-2.175698694021741E+05, 1.987813219832185E+05, 4.778595089990725E+02, -7.592664833596341E+00, -8.314128240761043E+00, 1.433341491644444E+00],
          [-2.722452100765557E+05, -1.092455729141846E+05, 2.748810645966055E+04, 4.272301035056985E+00, -1.050357026119933E+01, 5.604709961879979E-01],
          [-2.379467315529954E+04, -2.931126453006332E+05, 1.923061677703715E+04, 1.128306572308141E+01, -9.674518355170174E-01, -7.638884015704205E-01]],
  Dione: [[2.634585953725644E+05, 2.676339883655795E+05, -4.231358234021366E+04, -7.140039615892733E+00, 7.021603129406415E+00, 9.326177232863453E-02],
          [2.837534916663106E+05, 2.443893779574921E+05, -4.223893276433290E+04, -6.565715785188246E+00, 7.599406850873678E+00, 6.022131744742367E-03],
          [3.016278554352189E+05, 2.215366932544645E+05, -4.232912807237451E+04, -5.946644770425961E+00, 8.100430979319473E+00, -7.908416475054417E-02]],
  Rhea: [[-4.837005129341898E+05, 2.090462768047571E+05, 2.463956189955072E+04, -3.313655589550248E+00, -7.760594141535747E+00, 8.121966308965558E-01],
          [4.985248725110365E+05, 1.608447420487140E+05, -5.403444834830007E+04, -2.639290352688705E+00, 8.061041845478064E+00, -4.109557931681707E-01],
          [-2.689050545182253E+05, -4.497953454247318E+05, 5.882585335234409E+04, 7.258092444832964E+00, -4.373539542853949E+00, -3.303736171387368E-01]],
  Titan: [[-5.278839716249048E+05, 1.126493072633229E+06, -2.866410740927338E+04, -4.980476712577748E+00, -2.186490534441614E+00, 5.868690915972284E-01],
          [-1.200583799333992E+06, 3.625513287984048E+05, 8.206368765940426E+04, -1.543016616934245E+00, -5.168295311495553E+00, 4.833511659773474E-01],
          [-1.058739022777440E+06, -6.479448143722474E+05, 1.378164008655897E+05, 2.934179324233127E+00, -4.593200128618255E+00, 4.344714524179807E-02]],
  Iapetus: [[3.397583047296688E+06, 1.396937016372533E+05, -6.544008113260868E+05, -3.710140747118599E-02, 3.297848863179014E+00, 6.133374816251370E-01],
          [-3.341345405600479E+06, 1.162857358790086E+06, 8.803932052169412E+05, -1.166159822311733E+00, -2.951147094315846E+00, -3.142884975377651E-01],
          [2.237082427071206E+06, -2.542842217437210E+06, -9.268809324694547E+05, 2.417237095628093E+00, 2.260036321875723E+00, -6.062401990735508E-02]],
};
// JPL mean elements table: a (km), sidereal period P (days), apsidal period (years; used for the two eccentric moons)
const TABLE = { Mimas: [186000, 0.942422], Enceladus: [238400, 1.370218], Tethys: [295000, 1.887802], Dione: [377700, 2.736916],
  Rhea: [527200, 4.517503], Titan: [1221900, 15.945448, 346.680], Iapetus: [3561700, 79.331002, 1662.900] };
const EPOCH_TT = [T0 - 3287, T0, T0 + 3287];
const pole = X.vecOf(A.RotationAxis('Saturn', A.MakeTime(new Date(Date.UTC(2026, 10, 24)))).north);
const basis = (Z) => { const Xa = X.unit(X.cross([0, 0, 1], Z)); return [Xa, X.cross(Z, Xa), Z]; };
const lonIn = (v, [Xa, Y]) => X.mod(Math.atan2(X.dot(v, Y), X.dot(v, Xa)) * X.RAD, 360);

const { saturnMoonVector } = await import('../js/ephem.js');
const rows = [];
for (const id of Object.keys(STATE)) {
  const s = STATE[id][1], r = s.slice(0, 3), v = s.slice(3);
  const [a, P, Pw] = TABLE[id];
  const m = { id, a, P };
  if (Pw) {
    const h = X.cross(r, v), n = X.unit(h), B = basis(n);
    const ev = X.sub(X.scale(X.cross(v, h), 1 / GM), X.unit(r));
    const e = X.len(ev), peri = lonIn(ev, B), lon = lonIn(r, B);
    const nu = (lon - peri) * X.DEG;
    const Ecc = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
    const M = X.mod((Ecc - e * Math.sin(Ecc)) * X.RAD, 360);
    Object.assign(m, { e: +e.toFixed(4), peri: +peri.toFixed(2), L: +X.mod(peri + M, 360).toFixed(2), Pw, normal: n.map((x) => +x.toFixed(6)) });
  } else {
    Object.assign(m, { e: 0, L: +lonIn(r, basis(pole)).toFixed(2) });
  }
  rows.push(m);
}
console.log('// paste into js/ephem.js (epoch T0 = ' + T0 + ' TT days from J2000):');
for (const m of rows) console.log('  ' + JSON.stringify(m).replace(/"(\w+)":/g, '$1: ').replace(/,(\w)/g, ', $1') + ',');

console.log('\n// error of the app model against Horizons (angle at Saturn between model and true position; and as seen from Earth at 9 au)');
const { SATURN_MOON_ELEMENTS } = await import('../js/ephem.js');
for (const def of SATURN_MOON_ELEMENTS) {
  const out = [];
  STATE[def.id].forEach((s, k) => {
    const p = A.RotationAxis('Saturn', A.MakeTime(new Date(Date.UTC(2017 + 9 * k, 10, 24)))).north;
    const vkm = saturnMoonVector(def, EPOCH_TT[k], [p.x, p.y, p.z]).map((x) => x * X.AU_KM);
    const d = X.len(X.sub(vkm, s.slice(0, 3)));
    out.push(`${2017 + 9 * k}: ${X.angleBetween(vkm, s.slice(0, 3)).toFixed(2)} deg (${(d / (9 * X.AU_KM) * X.RAD * 3600).toFixed(1)}" on the sky)`);
  });
  console.log('  ' + def.id.padEnd(10) + out.join('   '));
}
