// labs/targets.js: extra things the angle tool can snap to, besides the stars and bodies in picks.js.
// Overlays (the second observer's ghosts, the Earth's shadow) publish their on-screen discs here each
// frame and register a resolver that turns a stored target id back into a direction at any later instant,
// so a measurement keeps following its end points as time runs.

const lists = new Map();        // owner -> [{x, y, r, type, id, name, centreOnly}]
const resolvers = {};           // type -> fn(id, frame, bodies) -> {u: EQJ unit vector, angRadius: deg, name} | null

/** Replace the snap targets of one owner for this frame. r = drawn radius in px (0 for a point). */
export function setTargets(owner, list) { lists.set(owner, list); }
export function registerResolver(type, fn) { resolvers[type] = fn; }
export function resolveCustom(c, frame, bodies) {
  const fn = resolvers[c.type];
  return fn ? fn(c.id, frame, bodies) : null;
}
export function allTargets() {
  const out = [];
  for (const l of lists.values()) for (const t of l) out.push(t);
  return out;
}
