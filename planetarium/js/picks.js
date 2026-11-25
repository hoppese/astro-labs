// picks.js: every drawn object registers its screen position here each frame, so a click can be
// resolved to "the thing the user meant" without re-projecting the catalogs.

const items = [];
export function beginPicks() { items.length = 0; }
/** r = drawn radius in px (bigger things are easier to hit), mag = brightness for tie-breaking. */
export function addPick(x, y, r, mag, ref) { items.push({ x, y, r, mag, ref }); }

/** Nearest registered object to (x, y), or null. Bright objects win over faint neighbours. */
export function pickAt(x, y, slop = 12) {
  let best = null, bestScore = Infinity;
  // a star or deep-sky object behind the disc of the Sun, the Moon or a resolved planet cannot be seen, so it cannot be picked
  const discs = items.filter((it) => it.ref && it.ref.kind === 'body' && it.r >= 9);
  for (const it of items) {
    const d = Math.hypot(it.x - x, it.y - y);
    if (discs.length && it.ref.kind !== 'body') { let hidden = false; for (const b of discs) if (Math.hypot(it.x - b.x, it.y - b.y) < b.r - 0.5) { hidden = true; break; } if (hidden) continue; }
    const reach = Math.max(slop, it.r + 4);
    if (d > reach) continue;
    // distance in units of reach, nudged so that of two overlapping candidates the brighter wins
    const score = d / reach + 0.04 * (it.mag ?? 10) + (d <= it.r ? -0.5 : 0);
    if (score < bestScore) { bestScore = score; best = it; }
  }
  // a moon in front of the disc: the small thing under the pointer, not the big one behind it
  if (best && best.ref.kind === 'body' && best.r >= 9) {
    let bd = Math.max(8, slop * 0.6);
    for (const it of items) if (it.ref && it.ref.kind === 'body' && it.r < best.r / 3) { const d = Math.hypot(it.x - x, it.y - y); if (d <= Math.max(bd, it.r)) { bd = d; best = it; } }
  }
  return best ? best.ref : null;
}
export const allPicks = () => items;
