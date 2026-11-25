// point/targets.js: what to calibrate on. Never the Sun, nothing near it, nothing too high (azimuth means little there) or too low.

import { stars } from '../catalog.js';
import { refHorTrue, refName } from '../objects.js';
import { refractHor, horToAzAlt, angleBetween } from '../astro.js';

export const SUN_MIN = 15, ALT_MIN = 10, ALT_MAX = 70;      // degrees
const PLANETS = ['Moon', 'Venus', 'Jupiter', 'Mars', 'Saturn'];
const WIND = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
export const wind = (az) => WIND[Math.round(az / 45) % 8];
export const WIDE = { N: 'north', NE: 'northeast', E: 'east', SE: 'southeast', S: 'south', SW: 'southwest', W: 'west', NW: 'northwest' };

/** Apparent direction (HOR), refraction always in: this is the real sky. */
export function apparent(ref, frame, bodies) { const h = refHorTrue(ref, frame, bodies); return h ? refractHor(h) : null; }
/** {ok, h, az, alt, sun} or {ok: false, why} for one object. */
export function judge(ref, frame, bodies) {
  if (!ref || ref.kind === 'con') return { ok: false, why: 'A constellation is too large to sight on.' };
  if (ref.kind === 'body' && ref.id === 'Sun') return { ok: false, why: 'Never the Sun. Do not point the phone or your eyes at it.' };
  const h = apparent(ref, frame, bodies);
  if (!h) return { ok: false, why: 'Its place is not known.' };
  const { az, alt } = horToAzAlt(h), s = apparent({ kind: 'body', id: 'Sun' }, frame, bodies), sun = angleBetween(h, s);
  const o = { h, az, alt, sun, sunAlt: horToAzAlt(s).alt };
  if (sun < SUN_MIN) return { ...o, ok: false, why: `Only ${Math.round(sun)}° from the Sun: too close. Do not point the phone or your eyes there.` };
  if (alt < ALT_MIN) return { ...o, ok: false, why: alt < 0 ? 'It is below the horizon.' : 'It is too low.' };
  if (alt > ALT_MAX) return { ...o, ok: false, why: 'It is too nearly overhead to give a direction.' };
  return { ...o, ok: true };
}
/** Good targets, best first: [{ref, name, mag, az, alt, h}]. By day only the Moon (stars and planets cannot be seen in the picture). */
export function suggest(frame, bodies, max = 7) {
  const out = [], s = apparent({ kind: 'body', id: 'Sun' }, frame, bodies), sunAlt = horToAzAlt(s).alt;
  const limit = sunAlt > -1 ? -9 : sunAlt > -6 ? -2 : sunAlt > -10 ? 0.5 : 1.7;
  const take = (ref, mag) => { if (mag > limit) return; const j = judge(ref, frame, bodies); if (j.ok) out.push({ ref, name: ref.kind === 'body' ? ref.id : refName(ref), mag, ...j }); };
  for (const id of PLANETS) { const b = bodies.byId[id]; if (b) take({ kind: 'body', id }, id === 'Moon' ? Math.min(-9.5, b.mag ?? -12) : b.mag ?? 1); }
  // a day-old Moon is a thread in the twilight: by day it must be well away from the Sun
  const t = stars.tiers[0];
  if (t && t.n) for (let i = 0; i < t.n; i++) { if (t.data[i * stars.NF + 2] > limit) break; if (stars.names.name[i]) take({ kind: 'star', k: 0, i }, t.data[i * stars.NF + 2]); }
  const score = (o) => o.mag + (o.alt > 60 ? 1.5 : 0) + (o.alt < 15 ? 1 : 0);
  return out.filter((o) => !(o.ref.id === 'Moon' && sunAlt > -6 && o.sun < 30)).sort((a, b) => score(a) - score(b)).slice(0, max);
}
