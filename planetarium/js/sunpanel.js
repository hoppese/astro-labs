// sunpanel.js: the sunspot cycle panel. Top: the butterfly diagram made from the recorded groups (Greenwich, USAF/NOAA; data/sun/butterfly.png, tools/build_sunspots.py).
// Below: sunspot number (SILSO). A line marks the date on the clock; a click sets the clock.

import { makePanel } from './xui.js';
import { on, state, emit } from './state.js';
import { setTime, stepTime, setRate } from './clock.js';
import { sun, initSun, sunspotNumber, cycleFacts, kindAt, yearOf } from './sunspots.js';
import { rowHidden } from './labs/hidden.js';

let panel = null, cv = null, img = null, whole = true, last = 0;
const T0 = -45900, ROT = 27.2753;               // the picture's first column: 1 May 1874
const MSY = 365.2425 * 86400000, yearMs = (y) => Date.UTC(2000, 0, 1) + (y - 2000) * MSY;
const nowYear = () => 2000 + (state.timeMs - Date.UTC(2000, 0, 1)) / MSY;
function load() {
  if (img) return; initSun().then(draw);
  const im = new Image(); im.src = new URL('../data/sun/butterfly.png', import.meta.url).href;
  img = { im, cv: null };
  im.onload = () => {
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height);
    for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i] / 255, a = v < 0.02 ? 0 : 0.25 + 0.75 * v; d.data[i] = 255; d.data[i + 1] = 235 - 150 * v; d.data[i + 2] = 150 - 120 * v; d.data[i + 3] = 255 * Math.min(1, a); }
    x.putImageData(d, 0, 0); img.cv = c; draw();
  };
}
function range() { const y = nowYear(); return whole ? [1870, 2032] : [y - 14, y + 14]; }
function draw() {
  if (!panel || !panel.isOpen()) return;
  const dpr = Math.min(3, window.devicePixelRatio || 1), w = cv.clientWidth, h = cv.clientHeight; if (!w) return;
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const [a, b] = range(), L = 30, R = w - 8, X = (y) => L + (y - a) / (b - a) * (R - L), top = 8, H1 = 150, y2 = top + H1 + 30, H2 = h - y2 - 22;
  x.font = '10.5px "Source Sans 3", sans-serif'; x.textBaseline = 'middle';
  const mx = 45, Y = (la) => top + H1 / 2 - Math.sin(la * Math.PI / 180) / Math.sin(mx * Math.PI / 180) * H1 / 2;
  x.fillStyle = '#0a111b'; x.fillRect(L, top, R - L, H1); x.fillRect(L, y2, R - L, H2);
  x.save(); x.beginPath(); x.rect(L, top, R - L, H1); x.clip();
  if (img && img.cv) {
    const ya = 2000 + T0 / 365.2425, yb = ya + img.cv.width * ROT / 365.2425, y90 = Y(90), y90b = Y(-90); x.imageSmoothingEnabled = !whole ? false : true;
    x.drawImage(img.cv, X(ya), y90, X(yb) - X(ya), y90b - y90);
  }
  x.restore();
  x.fillStyle = '#94a3b5'; x.textAlign = 'right'; for (const la of [-30, 0, 30]) { x.fillText((la > 0 ? '+' : la < 0 ? '−' : '') + Math.abs(la) + '°', L - 4, Y(la)); x.strokeStyle = 'rgba(255,255,255,0.10)'; x.beginPath(); x.moveTo(L, Y(la) + 0.5); x.lineTo(R, Y(la) + 0.5); x.stroke(); }
  // sunspot number
  const YS = (v) => y2 + H2 - Math.min(1, v / 320) * H2; x.strokeStyle = '#6fb0ff'; x.lineWidth = 1; x.beginPath(); let first = true;
  for (let p = L; p <= R; p += 1) { const yr = a + (p - L) / (R - L) * (b - a), v = sunspotNumber(yr).sn; if (first) x.moveTo(p, YS(v)); else x.lineTo(p, YS(v)); first = false; } x.stroke();
  x.fillText('200', L - 4, YS(200)); x.fillText('0', L - 4, YS(0));
  x.textAlign = 'center'; const st = whole ? 20 : 5; for (let y = Math.ceil(a / st) * st; y <= b; y += st) { x.fillText(String(y), X(y), top + H1 + 11); }
  x.textAlign = 'left'; x.fillText('Latitude of spots (recorded)', L + 4, top + 9); x.fillText('Sunspot number', L + 4, y2 + 9);
  const m = X(Math.max(a, Math.min(b, nowYear()))); x.strokeStyle = '#e8b86a'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(m, top); x.lineTo(m, top + H1); x.moveTo(m, y2); x.lineTo(m, y2 + H2); x.stroke();
  const f = cycleFacts((state.timeMs - Date.UTC(2000, 0, 1)) / 86400000 - 0.5), k = kindAt((state.timeMs - Date.UTC(2000, 0, 1)) / 86400000 - 0.5);
  const t = `${f.number ? 'Cycle ' + f.number + ', ' : ''}${f.phase}, ${f.since.toFixed(1)} years after minimum. Sunspot number about ${Math.round(f.sn)}. ` + ({ recorded: 'Spots: recorded groups.', statistical: 'Spots: statistical, from the sunspot number.', typical: 'Spots: typical cycle, no record.' }[k]);
  const e = panel.body.querySelector('.sun-facts'); if (e.textContent !== t) e.textContent = t;
}
export function openSunPanel() {
  if (!panel) {
    panel = makePanel({ id: 'sunPanel', title: 'The sunspot cycle', onOpen() { load(); requestAnimationFrame(draw); } });
    panel.body.innerHTML = '<canvas class="sun-cv" style="display:block;width:100%;height:300px;cursor:crosshair" aria-label="Butterfly diagram and sunspot number"></canvas>' +
      '<p class="sun-facts" style="margin:8px 0;font-size:13px"></p><div class="row" style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" data-s="range">Around the date</button><button class="btn" data-s="-1">−1 month</button><button class="btn" data-s="1">+1 month</button><button class="btn" data-s="-12">−1 year</button><button class="btn" data-s="12">+1 year</button><button class="btn" data-s="run">Run 35 days a second</button></div>' +
      '<p style="font-size:12px;color:var(--muted);margin:8px 0 0">New cycles begin at about 30° from the equator and work their way down to about 8°. Click a diagram to go to that year. Recorded groups: Royal Greenwich Observatory 1874–1976, USAF/NOAA since 1977 (compiled by D. Hathaway). Sunspot number: WDC-SILSO, Royal Observatory of Belgium, Brussels (CC BY-NC 4.0).</p>';
    cv = panel.body.querySelector('canvas');
    cv.addEventListener('click', (e) => { const r = cv.getBoundingClientRect(), [a, b] = range(), y = a + (e.clientX - r.left - 30) / (r.width - 38) * (b - a); if (y >= a && y <= b) setTime(yearMs(y)); });
    panel.body.addEventListener('click', (e) => {
      const s = e.target.dataset && e.target.dataset.s; if (!s) return;
      if (s === 'range') { whole = !whole; e.target.textContent = whole ? 'Around the date' : 'Whole record'; draw(); }
      else if (s === 'run') setRate(3e6); else stepTime(+s * 30.4369 * 86400000);
    });
    on('frame', () => { const n = performance.now(); if (n - last > 100) { last = n; draw(); } });
    on('time', draw); new ResizeObserver(draw).observe(cv);
  }
  panel.open();
}
export { emit, rowHidden, yearOf };
