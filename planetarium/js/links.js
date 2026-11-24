// links.js: "Look it up": where to read more about an object. Addresses are built from the identifiers the app already has
// (Hipparcos, HD, Gaia DR3 source number, NGC / IC / Messier, JPL body numbers). Wikipedia appears only where
// data/links.json has a title, and every title there was checked through Wikidata (tools/build_links.mjs): no link is
// better than a wrong one.

import { emit } from './state.js';
import { toSph } from './astro.js';
import { starRecord, dso, constellations } from './catalog.js';
import { deepRecord } from './deepstars.js';
import { MOON_PARENT } from './ephem.js';

export const links = { data: null };
export function loadLinks() {
  return fetch(new URL('../data/links.json', import.meta.url)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then((j) => { links.data = j; emit('links'); }).catch((e) => console.warn('links.json', e));
}
const enc = (s) => encodeURIComponent(s).replace(/%20/g, '+');
// The CDS in Strasbourg runs SIMBAD; the Center for Astrophysics (Harvard & Smithsonian) keeps a copy of it, which answers when Strasbourg does not.
const simbad = (query) => [{ label: 'SIMBAD', url: 'https://simbad.cds.unistra.fr/simbad/' + query, title: 'SIMBAD astronomical database (CDS, Strasbourg)' },
  { label: 'SIMBAD (US copy)', url: 'https://simbad.cfa.harvard.edu/simbad/' + query, title: 'The copy of SIMBAD at the Center for Astrophysics, for when Strasbourg is not answering' }];
const simId = (id) => simbad('sim-id?Ident=' + enc(id));
const simCoo = (ra, dec, r, unit) => simbad(`sim-coo?Coord=${enc(`${ra.toFixed(5)}d${dec < 0 ? '-' : '+'}${Math.abs(dec).toFixed(5)}d`)}&CooFrame=ICRS&Radius=${r}&Radius.unit=${unit}`);
const ned = (name) => ({ label: 'NED', url: 'https://ned.ipac.caltech.edu/byname?objname=' + enc(name), title: 'NASA/IPAC Extragalactic Database' });
const wiki = (t) => ({ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(t.replace(/ /g, '_')), title: 'Wikipedia: ' + t });
const HORIZONS = { Sun: 10, Moon: 301, Mercury: 199, Venus: 299, Mars: 499, Jupiter: 599, Saturn: 699, Uranus: 799, Neptune: 899, Io: 501, Europa: 502, Ganymede: 503, Callisto: 504,
  Mimas: 601, Enceladus: 602, Tethys: 603, Dione: 604, Rhea: 605, Titan: 606, Iapetus: 608 };
const GALAXY = new Set(['G', 'GPair', 'GTrpl', 'GGroup']);

/** [{label, url, title}] for an object reference; Wikipedia first. */
export function linksFor(ref) {
  if (!ref) return [];
  const out = [], W = (g, k) => { const t = links.data && links.data[g][k]; if (t) out.push(wiki(t)); };
  if (ref.kind === 'star') {
    const s = starRecord(ref.k, ref.i);
    if (s.name) W('star', s.name);
    out.push(...(s.hip ? simId('HIP ' + s.hip) : s.hd ? simId('HD ' + s.hd) : simCoo(s.ra, s.dec, 30, 'arcsec')));
  } else if (ref.kind === 'gaia') {
    const s = deepRecord(ref);
    if (s.id) out.push(...simId('Gaia DR3 ' + s.id));
    // SIMBAD does not list every Gaia star: also what it has at this place
    const p = toSph([ref.t.vec[3 * ref.i], ref.t.vec[3 * ref.i + 1], ref.t.vec[3 * ref.i + 2]]), near = simCoo(p.lon, p.lat, 10, 'arcsec');
    out.push(...(s.id ? [{ ...near[0], label: 'SIMBAD, around it', title: 'What SIMBAD lists within 10 arcseconds' }] : near));
  } else if (ref.kind === 'dso') {
    const o = dso.rows[ref.idx], id = o.m ? 'M ' + o.m : /^(NGC|IC) \d+$/.test(o.id) ? o.id : null;
    W('dso', o.id);
    out.push(...(id ? simId(id) : simCoo(o.ra, o.dec, 5, 'arcmin')));
    if (GALAXY.has(o.type)) { const n = /^(NGC|IC) \d+$/.test(o.id) ? o.id : o.m ? 'M ' + o.m : null; if (n) out.push(ned(n)); }
  } else if (ref.kind === 'body') {
    const id = ref.id, p = MOON_PARENT[id], lc = id.toLowerCase();
    W('body', id);
    out.push({ label: 'NASA', title: 'NASA Science: ' + id, url: 'https://science.nasa.gov/' + (p === 'Jupiter' ? `jupiter/jupiter-moons/${lc}/` : p === 'Saturn' ? `saturn/moons/${lc}/` : lc + '/') });
    if (HORIZONS[id]) out.push({ label: 'JPL', title: 'JPL Horizons: physical data sheet', url: `https://ssd.jpl.nasa.gov/api/horizons.api?format=text&COMMAND=%27${HORIZONS[id]}%27&OBJ_DATA=%27YES%27&MAKE_EPHEM=%27NO%27` });
  } else if (ref.kind === 'con') {
    if (constellations.some((c) => c.id === ref.id)) { W('con', ref.id); out.push({ label: 'IAU', title: 'The International Astronomical Union’s page on the 88 constellations', url: 'https://www.iau.org/Iau/Science/What-we-do/The-Constellations.aspx' }); }
  }
  return out;
}
