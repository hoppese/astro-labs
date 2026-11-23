// picks.js: every drawn object registers its screen position here each frame, so a click can be
// resolved to "the thing the user meant" without re-projecting the catalogs.

const items = [];
export function beginPicks() { items.length = 0; }
/** r = drawn radius in px (bigger things are easier to hit), mag = brightness for tie-breaking. */
export function addPick(x, y, r, mag, ref) { items.push({ x, y, r, mag, ref }); }

/** Nearest registered object to (x, y), or null. Bright objects win over faint neighbours. */
export function pickAt(x, y, slop = 12) {
  let best = null, bestScore = Infinity;
  for (const it of items) {
    const d = Math.hypot(it.x - x, it.y - y);
    const reach = Math.max(slop, it.r + 4);
    if (d > reach) continue;
    // distance in units of reach, nudged so that of two overlapping candidates the brighter wins
    const score = d / reach + 0.04 * (it.mag ?? 10) + (d <= it.r ? -0.5 : 0);
    if (score < bestScore) { bestScore = score; best = it; }
  }
  return best ? best.ref : null;
}
export const allPicks = () => items;
