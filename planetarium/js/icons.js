// icons.js: inline SVG icons (24x24, stroked with currentColor).
const S = (body) => `<svg class="line" viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;
const dot = (x, y, r = 1.5) => `<circle cx="${x}" cy="${y}" r="${r}" fill="currentColor" stroke="none"/>`;
export const ICON = {
  conLines: S(`<path d="M4 17 9 8l6 5 5-8"/>${dot(4, 17)}${dot(9, 8)}${dot(15, 13)}${dot(20, 5)}`),
  conNames: S(`<path d="M3 9 7 4l5 3"/>${dot(3, 9, 1.3)}${dot(7, 4, 1.3)}${dot(12, 7, 1.3)}<path d="M5 20l3.5-8 3.5 8M6.3 17.2h4.4M15 20v-5.5M15 16.5c.6-1.3 4.5-1.6 4.5 1V20"/>`),
  conBounds: S(`<path stroke-dasharray="2.6 2.6" d="M4 5h9v4h7v10H9v-5H4z"/>`),
  starNames: S(`<path d="M8 3.5l1.5 3.3 3.6.4-2.7 2.4.8 3.5L8 11.3l-3.2 1.8.8-3.5L2.900 7.2l3.6-.4z"/><path d="M14 16h7M14 20h5"/>`),
  planetNames: S(`<circle cx="10" cy="10" r="4.6"/><path d="M3.2 13.6c-1.6 1.500 2.300.9 7.500-1.6s8.300-5.900 7-7.200"/><path d="M14 20h7"/>`),
  dso: S(`<ellipse cx="12" cy="12" rx="9" ry="4.2" transform="rotate(-28 12 12)"/><ellipse cx="12" cy="12" rx="3.4" ry="1.7" transform="rotate(-28 12 12)"/>`),
  eqGrid: S(`<circle cx="12" cy="12" r="8.500"/><ellipse cx="12" cy="12" rx="8.500" ry="3.2" transform="rotate(-23 12 12)"/><ellipse cx="12" cy="12" rx="3.400" ry="8.500" transform="rotate(-23 12 12)"/><path d="M15.300 4.200 8.700 19.800"/>`),
  azGrid: S(`<path d="M2.500 18a9.500 9.500 0 0 1 19 0z"/><path d="M12 8.500V18M6 18c0-4 2.500-8 6-9.500M18 18c0-4-2.500-8-6-9.500M4.500 13.500c4.500-1.800 10.500-1.800 15 0"/>`),
  meridian: S(`<path d="M2.500 19h19"/><path d="M12 19V3.500"/><path d="M4.500 19a7.500 7.500 0 0 1 15 0" stroke-dasharray="2 2.600"/>`),
  ecliptic: S(`<circle cx="12" cy="12" r="2.600"/><ellipse cx="12" cy="12" rx="9.500" ry="4.200" transform="rotate(-20 12 12)"/>${dot(20.2, 8.2, 1.4)}`),
  equator: S(`<circle cx="12" cy="12" r="8.500"/><ellipse cx="12" cy="12" rx="8.500" ry="2.800"/><path d="M12 2v2.500M12 19.500V22"/>`),
  atmosphere: S(`<path d="M2.500 18.500h19"/><path d="M6.500 18.500a5.500 5.500 0 0 1 11 0"/><path d="M12 9V6.500M5.300 11.800 3.500 10M18.700 11.800 20.500 10M8.300 9.700 7.300 7.500M15.700 9.700l1-2.200"/>`),
  auGrid: S(`<path d="M3 8h18M3 16h18M8 3v18M16 3v18"/><circle cx="12" cy="12" r="1.800"/>`),
  orbits: S(`<ellipse cx="12" cy="12" rx="9.500" ry="5"/><circle cx="12" cy="12" r="1.800"/><circle cx="19.200" cy="8.800" r="1.300"/>`),
  ground: S(`<path d="M2.500 17.500 8 10l3.500 4.500 3-3.500 7 6.500z"/><path d="M2.500 20.500h19"/>`),
  cardinal: S(`<circle cx="12" cy="12" r="9"/><path d="M9.500 15.500V8.500l5 7V8.500"/>`),
  mount: S(`<path d="M5 20h10M10 20v-6"/><path d="M4.500 11.500 17 5.500l1.800 3.800-12.500 6z"/><path d="M17.700 5.200l2-1 2 4.200-2 1"/>`),
  measure: S(`<path d="M4 19 19 4"/>${dot(4, 19, 1.8)}${dot(19, 4, 1.8)}<path d="M9 19a5 5 0 0 0-1.500-3.500" />`),
  settings: S(`<path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h11M19 17h1"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17" r="2"/>`),
  pin: S(`<path d="M12 21s-6.500-6-6.500-11a6.500 6.500 0 0 1 13 0c0 5-6.500 11-6.500 11z"/><circle cx="12" cy="10" r="2.300"/>`),
};
const F = (d) => `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg>`;
export const TICON = {
  slower: F('M8 3v10L1.500 8zM14.500 3v10L8 8z'),
  faster: F('M8 3v10l6.500-5zM1.500 3v10L8 8z'),
  play: F('M4 2.500v11l9-5.500z'),
  pause: F('M3.500 2.500h3.200v11H3.500zM9.300 2.500h3.200v11H9.300z'),
  now: `<svg class="line" viewBox="0 0 16 16" aria-hidden="true" style="fill:none"><circle cx="8" cy="8" r="5.700"/><path d="M8 4.700V8l2.200 1.500"/></svg>`,
};
