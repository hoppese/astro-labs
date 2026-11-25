// viewport.js: the app fills exactly the part of the page that can be seen, and the page itself never scrolls or zooms.
// A phone's browser moves the page under the app: Safari zooms in on a text field whose letters are under 16 px and stays zoomed, shifts the page to clear the keyboard and
// (as a Home Screen app) may leave it shifted, and resizes as its bars come and go. A control that lands outside the screen is then out of reach.
//  - <body> is the safe rectangle of the visual viewport (--vv-x, --vv-y, --app-w, --app-h, less the safe-area insets; css/app.css), whatever its size, shift or zoom;
//    the sky (#sky) reaches past it to the real edges. Positions measured in the sky's own coordinates must use the canvas rectangle, not the window's.
//  - no pinch, double tap or rubber band moves the page; while the keyboard is up <html> has the class `kb` (bars away, the sky keeps its size).
// In an iframe the frame is the screen: nothing here is measured, the fallbacks of the stylesheet hold.

const root = document.documentElement, vv = window.visualViewport;
const framed = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const isField = (el) => !!el && (el.isContentEditable || el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|color|file)$/.test(el.type)));
let last = '', base = 0, baseW = 0;

function sync() {
  if (framed || !vv) return;
  const zoomed = Math.abs(vv.scale - 1) > 0.02, field = isField(document.activeElement);
  if (!zoomed && (!field || vv.width !== baseW)) { base = vv.height; baseW = vv.width; }
  const kb = field && !zoomed && base - vv.height > 110;
  if (!zoomed && field && vv.height > base) base = vv.height;
  const key = [vv.offsetLeft, vv.offsetTop, vv.width, vv.height, kb, base].map((v) => (typeof v === 'number' ? Math.round(v * 2) / 2 : v)).join();
  if (key === last) return;
  last = key;
  const set = (k, v) => root.style.setProperty(k, v);
  set('--vv-x', vv.offsetLeft + 'px'); set('--vv-y', vv.offsetTop + 'px'); set('--app-w', vv.width + 'px'); set('--app-h', vv.height + 'px');
  set('--sky-h', (kb ? base : vv.height) + 'px');
  root.classList.toggle('kb', kb);
  window.dispatchEvent(new Event('app-viewport'));
}
/** The page goes back to its place: after the keyboard, a rotation, or whenever something managed to scroll it. */
function home() {
  if (framed) return;
  if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
  for (const el of [root, document.body]) if (el.scrollTop || el.scrollLeft) { el.scrollTop = 0; el.scrollLeft = 0; }
}
/** A zoom that got through (an old iOS, an accessibility gesture): stating the viewport again makes Safari return to 1. */
function unzoom() {
  if (framed || !vv || vv.scale < 1.02 || isField(document.activeElement)) return;
  const m = document.querySelector('meta[name=viewport]'); if (!m) return;
  const c = m.content; m.content = c + ', minimum-scale=1'; setTimeout(() => { m.content = c; sync(); }, 60);
}
const settle = () => { for (const ms of [0, 60, 250, 600, 1200]) setTimeout(() => { if (!isField(document.activeElement)) home(); sync(); if (ms === 600) unzoom(); }, ms); };

/** Something between `el` and the page that the finger can scroll? */
function scrollable(el) {
  for (; el && el !== document.body && el !== root; el = el.parentElement) {
    if (el.tagName === 'INPUT' && el.type === 'range' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') return true;
    const s = getComputedStyle(el);
    if ((/auto|scroll/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1) || (/auto|scroll/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1)) return true;
  }
  return false;
}
let inner = false;
document.addEventListener('touchstart', (e) => { inner = scrollable(e.target); }, { passive: true, capture: true });
document.addEventListener('touchmove', (e) => { if (e.cancelable && (e.touches.length > 1 || !inner)) e.preventDefault(); }, { passive: false });
for (const t of ['gesturestart', 'gesturechange']) document.addEventListener(t, (e) => e.preventDefault(), { passive: false });
document.addEventListener('wheel', (e) => { if (e.ctrlKey && e.cancelable) e.preventDefault(); }, { passive: false });      // a trackpad pinch on a panel
let tapAt = 0;
document.addEventListener('touchend', (e) => {      // double tap on the chrome: a second press, not a zoom
  const now = performance.now(), b = e.target.closest && e.target.closest('button, a, label, input, select, textarea, summary');
  if (now - tapAt < 320 && !b && e.target.id !== 'sky' && e.cancelable) e.preventDefault();
  tapAt = now;
}, { passive: false });

if (vv) { vv.addEventListener('resize', () => { sync(); if (!isField(document.activeElement)) settle(); }); vv.addEventListener('scroll', () => { sync(); if (!isField(document.activeElement)) settle(); }); }
window.addEventListener('scroll', () => { if (!isField(document.activeElement)) home(); sync(); }, { passive: true });
window.addEventListener('resize', settle); window.addEventListener('orientationchange', settle); window.addEventListener('pageshow', settle);
document.addEventListener('focusin', () => setTimeout(sync, 0)); document.addEventListener('focusout', settle);
document.addEventListener('visibilitychange', () => { if (!document.hidden) settle(); });
sync(); settle();
