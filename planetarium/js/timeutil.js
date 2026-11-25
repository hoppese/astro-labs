// timeutil.js: civil-time helpers. The simulation clock is always a UTC millisecond count;
// these convert to and from wall-clock time in the observing site's time zone.
//
// A zone is either an IANA name ("America/Indiana/Indianapolis") or a fixed offset
// written "UTC+5.5" (used for hand-typed coordinates, where we only know the longitude).

const fmtCache = new Map();
function partsFormatter(tz) {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit',
      day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'short', era: 'short' });
    fmtCache.set(tz, f);
  }
  return f;
}
const fixedOffset = (tz) => { const m = /^UTC([+-]\d+(?:\.\d+)?)?$/.exec(tz); return m ? parseFloat(m[1] || '0') : null; };

export function isValidZone(tz) {
  if (fixedOffset(tz) !== null) return true;
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch (e) { return false; }
}
export const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } };
/** Zone to assume when only a longitude is known: whole hours, 15 degrees each. */
export const zoneFromLongitude = (lon) => { const h = Math.round(lon / 15); return 'UTC' + (h >= 0 ? '+' : '') + h; };

/** Offset from UTC in minutes for `tz` at instant `ms`. */
export function zoneOffsetMin(ms, tz) {
  const fo = fixedOffset(tz);
  if (fo !== null) return fo * 60;
  const p = wallParts(ms, tz, true);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // Date.UTC treats years 0..99 as 1900+; fix by setting the full year explicitly.
  const d = new Date(asUtc); d.setUTCFullYear(p.year);
  // exact to the second: before standard time, zones run on local mean time (e.g. UTC-5:39:30)
  return (d.getTime() - Math.floor(ms / 1000) * 1000) / 60000;
}

/** Wall-clock fields of instant `ms` in zone `tz`. */
export function wallParts(ms, tz, raw = false) {
  const fo = fixedOffset(tz);
  if (fo !== null) {
    const d = new Date(ms + fo * 3600000);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(),
      minute: d.getUTCMinutes(), second: d.getUTCSeconds(), weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()] };
  }
  const o = {};
  for (const p of partsFormatter(tz).formatToParts(new Date(ms))) o[p.type] = p.value;
  let year = +o.year;
  if (o.era && /B/i.test(o.era)) year = 1 - year;      // 1 BC = astronomical year 0
  return { year, month: +o.month, day: +o.day, hour: +o.hour, minute: +o.minute, second: +o.second, weekday: o.weekday };
}

/** Instant (ms) for a wall-clock time in zone `tz`. Ambiguous/skipped DST hours resolve to the later offset. */
export function wallToMs(y, mo, d, h, mi, s, tz) {
  const u = new Date(Date.UTC(2000, mo - 1, d, h, mi, s)); u.setUTCFullYear(y);
  const guess = u.getTime();
  let ms = guess - zoneOffsetMin(guess, tz) * 60000;
  ms = guess - zoneOffsetMin(ms, tz) * 60000;
  return ms;
}

/** Short label such as "EST (UTC−5)" or "UTC+9". */
export function zoneLabel(ms, tz) {
  const off = zoneOffsetMin(ms, tz);
  const sign = off < 0 ? '−' : '+';
  const sec = Math.round(Math.abs(off) * 60), hh = Math.floor(sec / 3600), mm = Math.floor((sec % 3600) / 60), ss = sec % 60;
  const p2 = (n) => String(n).padStart(2, '0');
  const utc = 'UTC' + (sec === 0 ? '' : sign + hh + (mm || ss ? ':' + p2(mm) : '') + (ss ? ':' + p2(ss) : ''));
  if (ss) return utc + ' (local mean time)';
  if (fixedOffset(tz) !== null) return utc;
  let abbr = '';
  try {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms));
    abbr = (p.find((x) => x.type === 'timeZoneName') || {}).value || '';
  } catch (e) { /* ignore */ }
  return abbr && !/^(GMT|UTC)/.test(abbr) ? `${abbr} (${utc})` : utc;
}

const p2 = (n) => String(n).padStart(2, '0');
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function daysInMonth(y, mo) { const d = new Date(Date.UTC(2000, mo, 0)); d.setUTCFullYear(y, mo, 0); return d.getUTCDate(); }
/** What is wrong with a date somebody typed, in words, or ''. */
export function dateProblem(y, mo, d) {
  if (!Number.isInteger(y) || y < -3000 || y > 3000) return 'The year must be a whole number from −3000 to 3000 (the span the positions are computed for).';
  if (!Number.isInteger(mo) || mo < 1 || mo > 12) return 'The month must be a number from 1 to 12.';
  const n = daysInMonth(y, mo);
  if (!Number.isInteger(d) || d < 1 || d > n) return `${MONTHS[mo - 1]} ${y < 0 ? '−' + -y : y} has ${n} days: the day must be from 1 to ${n}.`;
  return '';
}
export const fmtDate = (p) => `${p.year < 0 ? '\u2212' : ''}${String(Math.abs(p.year)).padStart(4, '0')}-${p2(p.month)}-${p2(p.day)}`;
export const fmtTime = (p, secs = true) => `${p2(p.hour)}:${p2(p.minute)}` + (secs ? `:${p2(p.second)}` : '');
/** "14:03" style clock time of an instant, for rise/set tables. */
export function fmtClock(ms, tz) { return fmtTime(wallParts(ms, tz), false); }
