// notebook/loupe.js: the magnifier of the angle tool in lab / notebook mode. Point sources are not snapped to: the
// student clicks near a star, this magnifier opens on that spot (the pixels of the sky, 10 times larger), and a second
// click inside it places the end of the measurement on the centre of the image, by eye, to a tenth of a screen pixel.

const MAG = 10;
let box = null, hint = null, cv = null, raf = 0, state = null;

function close() {
  cancelAnimationFrame(raf);
  if (box) { box.remove(); hint.remove(); box = hint = cv = null; }
  window.removeEventListener('keydown', onKey, true);
  document.removeEventListener('pointerdown', onOutside, true);
  state = null;
}
function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } }
function onOutside(e) { if (box && !box.contains(e.target)) close(); }
export const loupeOpen = () => !!state;
export const closeLoupe = close;

/** Open the magnifier on canvas point (x, y) (CSS pixels of the sky canvas). onPick(fx, fy) gets the refined point. */
export function openLoupe(sky, x, y, onPick) {
  close();
  const size = Math.min(280, Math.max(180, Math.min(sky.clientWidth, sky.clientHeight) - 40));
  const host = sky.parentElement, dpr = Math.min(window.devicePixelRatio || 1, 2);
  box = document.createElement('div'); box.className = 'nb-loupe';
  cv = document.createElement('canvas'); cv.width = cv.height = Math.round(size * dpr); box.appendChild(cv);
  hint = document.createElement('div'); hint.className = 'nb-loupe-hint'; hint.textContent = 'Click the center of the image · Esc cancels';
  const left = Math.max(4, Math.min(sky.clientWidth - size - 4, x - size / 2)), top = Math.max(4, Math.min(sky.clientHeight - size - 4, y - size / 2));
  Object.assign(box.style, { left: left + 'px', top: top + 'px', width: size + 'px', height: size + 'px' });
  Object.assign(hint.style, { left: (left + size / 2) + 'px', top: (top + size + 8 > sky.clientHeight - 30 ? top - 30 : top + size + 8) + 'px' });
  host.appendChild(box); host.appendChild(hint);
  state = { x, y, size, px: x - left, py: y - top, ox: x - left, oy: y - top };
  // the sky point (x, y) is shown at (ox, oy) inside the magnifier: at its centre unless the magnifier was pushed in from an edge
  const c = cv.getContext('2d');
  const draw = () => {
    if (!state) return;
    const k = sky.width / sky.clientWidth, sw = size / MAG;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.fillStyle = '#000'; c.fillRect(0, 0, size, size);
    c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
    c.drawImage(sky, (x - state.ox / MAG) * k, (y - state.oy / MAG) * k, sw * k, sw * k, 0, 0, size, size);
    // crosshair that follows the pointer, open in the middle so it never hides the image's core
    const px = state.px, py = state.py, gap = 7;
    c.strokeStyle = 'rgba(255,214,107,0.95)'; c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, py + 0.5); c.lineTo(px - gap, py + 0.5); c.moveTo(px + gap, py + 0.5); c.lineTo(size, py + 0.5);
    c.moveTo(px + 0.5, 0); c.lineTo(px + 0.5, py - gap); c.moveTo(px + 0.5, py + gap); c.lineTo(px + 0.5, size);
    c.stroke();
    c.strokeStyle = 'rgba(255,214,107,0.55)'; c.beginPath(); c.arc(px + 0.5, py + 0.5, 22, 0, 7); c.stroke();
    raf = requestAnimationFrame(draw);
  };
  const at = (e) => { const r = box.getBoundingClientRect(); state.px = e.clientX - r.left; state.py = e.clientY - r.top; };
  box.addEventListener('pointermove', at);
  box.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); at(e); });
  box.addEventListener('pointerup', (e) => {
    e.preventDefault(); e.stopPropagation(); at(e);
    const fx = x + (state.px - state.ox) / MAG, fy = y + (state.py - state.oy) / MAG;
    close(); onPick(fx, fy);
  });
  window.addEventListener('keydown', onKey, true);
  setTimeout(() => document.addEventListener('pointerdown', onOutside, true), 0);
  draw();
}
export const LOUPE_MAG = MAG;
