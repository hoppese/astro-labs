// clickguard.js: a click that puts something away, or that follows a panel's button so closely that it was meant for it, is not also a click on the
// sky. (It used to select an object, or to become one end of a measurement.) A drag is still a drag. input.js asks takeEaten() before it uses a click.

const OPEN = '#timePop, #menu, #labsMenu, .search-list, .xctx, .nbp-menu';       // closed by a click anywhere else
let eaten = false, last = null;
const shown = (el) => !el.hidden && el.offsetHeight > 0;
/** Pure part: is a press on the sky at (x, y, t ms) really the second press of one on a panel ({x, y, t})? */
export const fallsThrough = (prev, x, y, t) => !!prev && t - prev.t < 450 && Math.hypot(x - prev.x, y - prev.y) < 14;
/** Was the press that has just ended used up? (Asked once per press.) */
export const takeEaten = () => { const e = eaten; eaten = false; return e; };
if (typeof document !== 'undefined' && document.addEventListener) {
  document.addEventListener('pointerdown', (e) => {
    if (!e.target || e.target.id !== 'sky') { last = { x: e.clientX, y: e.clientY, t: e.timeStamp }; return; }
    eaten = [...document.querySelectorAll(OPEN)].some(shown) || fallsThrough(last, e.clientX, e.clientY, e.timeStamp);
    if (!eaten) last = null;
  }, true);
}
