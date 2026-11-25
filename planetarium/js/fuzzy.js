// fuzzy.js: forgiving look-ups by name (search box, city lists). Distances count a swap of two neighbouring letters as one slip.

export function slips(a, b, max = 3) {
  const m = a.length, n = b.length; if (Math.abs(m - n) > max) return 99;
  let p2 = null, p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i]; let low = i;
    for (let j = 1; j <= n; j++) {
      let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
      c[j] = v; if (v < low) low = v;
    }
    if (low > max) return 99;
    p2 = p; p = c;
  }
  return p[n];
}
/** How many slips a word of this length may have and still be taken for another. */
export const allowed = (len) => (len < 4 ? 0 : len < 6 ? 1 : len < 10 ? 2 : 3);
/** The entries whose key(entry) is nearest to `q` (both already normalised), nearest first; none when nothing is near enough. */
export function nearest(q, list, key, n = 5) {
  const max = allowed(q.length), out = [];
  if (max) for (const e of list) { const k = key(e); if (!k || allowed(k.length) === 0) continue; const d = slips(q, k, Math.min(max, allowed(k.length))); if (d <= Math.min(max, allowed(k.length))) out.push({ e, d }); }
  out.sort((x, y) => x.d - y.d);
  return out.slice(0, n).map((x) => x.e);
}
/** Cities for what was typed: those that contain it, else those spelled nearly so. Entries {c, i}; `near` is set on a guess. */
export function findCities(cities, text) {
  const norm = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim(), q = norm(text);
  const all = cities.map((c, i) => ({ c, i }));
  if (!q) return all;
  const hit = all.filter(({ c }) => norm(c.name + ' ' + c.region).includes(q)).sort((a, b) => norm(b.c.name).startsWith(q) - norm(a.c.name).startsWith(q));
  return hit.length ? hit : nearest(q, all, ({ c }) => norm(c.name)).map((x) => ({ ...x, near: true }));
}
