// glossary.js: the harder words in a lab's prompt and the angle tool's panel get a dotted underline.
// Hovering shows a one-line definition; a click (or Enter) opens it in a small pop-up beside the word.
// linkTerms(root) is called after a panel is filled; it only touches text, never buttons, keys or links.

const TERMS = [
  ['penumbra', /\bpenumbra[ls]?\b/i, 'Penumbra: the pale outer part of a shadow, where only part of the Sun is hidden. The Moon dims only a little there.'],
  ['umbra', /\bumbra[ls]?\b/i, 'Umbra: the dark inner part of a shadow, where all of the Sun is hidden. In a lunar eclipse the Moon turns red inside it.'],
  ['totality', /\btotality\b/i, 'Totality: the part of an eclipse when the Moon (or Sun) is completely covered or completely inside the umbra.'],
  ['arcmin', /\barc ?min(?:ute)?s?\b/i, 'Arcminute (′): 1/60 of a degree. The full Moon is about 30′ (half a degree) across.'],
  ['arcsec', /\barc ?sec(?:ond)?s?\b/i, 'Arcsecond (″): 1/60 of an arcminute, 1/3600 of a degree. A coin seen from 4 km away.'],
  ['radian', /\bradians?\b/i, 'Radian: the angle at which an arc is as long as its radius, about 57.3°. For small angles, angle in radians = size ÷ distance.'],
  ['limb', /\blimbs?\b/i, 'Limb: the edge of the disc of the Sun, the Moon or a planet as we see it.'],
  ['pa', /\bposition angle\b/i, 'Position angle: the direction from one point to another on the sky, counted from north (0°) through east (90°).'],
  ['parallax', /\bparallax(?:es)?\b/i, 'Parallax: the shift in an object’s direction when seen from two places. The nearer the object, the bigger the shift.'],
  ['elongation', /\belongation\b/i, 'Elongation: the angle on the sky between a planet (or the Moon) and the Sun.'],
  ['opposition', /\bopposition\b/i, 'Opposition: when a planet is opposite the Sun in our sky, highest at midnight and nearest to us.'],
  ['ha', /\bhour angle\b/i, 'Hour angle: how long ago an object crossed the meridian (its highest point), in hours, minutes and seconds.'],
  ['meridian', /\bmeridian\b/i, 'Meridian: the line across the sky from north to south through the point overhead. Things are highest when they cross it.'],
  ['parsec', /\bparsecs?\b/i, 'Parsec: the distance at which a star has a parallax of 1″: 3.26 light-years, 206,265 au.'],
  ['au', /\bastronomical unit\b/i, 'Astronomical unit (au): the average distance from the Earth to the Sun, about 150 million km.'],
  ['aberration', /\baberration\b/i, 'Aberration: the small tilt of starlight toward the direction the Earth is moving, up to 20.5″.'],
  ['pm', /\bproper motion\b/i, 'Proper motion: a star’s own slow drift across the sky, in arcseconds per year.'],
  ['absmag', /\babsolute magnitude\b/i, 'Absolute magnitude (M): how bright a star would look from 10 parsecs away. Smaller numbers are brighter.'],
];

/** Wrap the first use of each term under root (a panel's body) in a hoverable, clickable span. */
export function linkTerms(root) {
  if (!root || typeof document.createTreeWalker !== 'function') return;
  const done = new Set();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.parentElement.closest('button, kbd, a, summary, .term, .btn, h3') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const nodes = []; for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
  for (let node of nodes) {
    for (const [key, re, def] of TERMS) {
      if (done.has(key)) continue;
      const m = re.exec(node.nodeValue); if (!m) continue;
      done.add(key);
      const word = node.splitText(m.index); const rest = word.splitText(m[0].length);
      const s = document.createElement('span');
      s.className = 'term'; s.tabIndex = 0; s.setAttribute('role', 'button'); s.title = def; s.dataset.def = def; s.textContent = m[0];
      word.replaceWith(s);
      node = rest;          // later terms are looked for in what follows (earlier text keeps its own terms: rare, and harmless)
    }
  }
}

let pop = null;
function show(t) {
  if (!pop) { pop = document.createElement('div'); pop.className = 'term-pop'; pop.setAttribute('role', 'tooltip'); document.body.appendChild(pop); }
  pop.textContent = t.dataset.def; pop.hidden = false;
  const r = t.getBoundingClientRect(), w = Math.min(300, window.innerWidth - 16);
  pop.style.maxWidth = w + 'px';
  pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8)) + 'px';
  const h = pop.offsetHeight;
  pop.style.top = (r.bottom + 6 + h < window.innerHeight ? r.bottom + 6 : Math.max(8, r.top - h - 6)) + 'px';
}
const hide = () => { if (pop) pop.hidden = true; };

if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {      // not in the checks' stand-in document
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('.term');
    if (t) { e.stopPropagation(); if (pop && !pop.hidden && pop.textContent === t.dataset.def) hide(); else show(t); } else hide();
  }, true);
  document.addEventListener('keydown', (e) => {
    const t = e.target.closest && e.target.closest('.term');
    if (t && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopPropagation(); show(t); } else if (e.key === 'Escape') hide();
  }, true);
}
