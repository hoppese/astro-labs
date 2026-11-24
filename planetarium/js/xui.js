// xui.js: small UI pieces shared by the teaching features (deep-sky list, Hubble lab, quiz):
// side panels that become bottom sheets on a phone, toasts, tooltips, and a few per-viewer settings.

import { emit } from './state.js';

// ---- per-viewer settings for the extras (kept apart from state.js's own store) ----
const KEY = 'astro-labs.planetarium.extras.v1';
export const xs = { milkyWay: true, night: false, hintSeen: false, images: true, survey: false };
export function loadXs() {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (o) for (const k of Object.keys(xs)) if (typeof o[k] === typeof xs[k]) xs[k] = o[k];
  } catch (e) { /* storage unavailable: defaults */ }
}
export function saveXs() { try { localStorage.setItem(KEY, JSON.stringify(xs)); } catch (e) { /* fine */ } }
/** A small JSON value of its own (e.g. the student's Hubble table). */
export function loadJSON(key, fallback) { try { const v = JSON.parse(localStorage.getItem(key) || 'null'); return v == null ? fallback : v; } catch (e) { return fallback; } }
export function saveJSON(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* fine */ } }

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const isNarrow = () => window.matchMedia('(max-width: 560px)').matches;
export const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };

// ---- panels ---------------------------------------------------------------------------
const panels = [];
const CHEV = '<svg class="line" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9.500l6 6 6-6"/></svg>';

/** A docked panel: right side on a laptop, bottom sheet on a phone. Only one is open at a time. */
export function makePanel({ id, title, cls = '', onOpen, onClose }) {
  const root = el('section', 'xpanel ' + cls);
  root.id = id; root.hidden = true; root.setAttribute('aria-label', title);
  root.innerHTML = `<header class="xp-head"><button class="xp-grip" type="button" aria-label="Collapse or expand this panel" aria-expanded="true">${CHEV}</button>` +
    `<h2>${esc(title)}</h2><span class="xp-sub"></span><button class="close" type="button" data-x="close" aria-label="Close ${esc(title)}">&times;</button></header><div class="xp-body"></div>`;
  document.body.appendChild(root);
  const grip = root.querySelector('.xp-grip');
  const p = {
    el: root, body: root.querySelector('.xp-body'), sub: root.querySelector('.xp-sub'),
    isOpen: () => !root.hidden,
    open() {
      if (!root.hidden) { p.peek(false); return; }
      for (const q of panels) if (q !== p) q.close();
      const d = document.getElementById('drawer'); if (d) d.hidden = true;
      root.hidden = false; p.peek(false);
      if (onOpen) onOpen();
      emit('render');
    },
    close() {
      if (root.hidden) return;
      root.hidden = true;
      if (onClose) onClose();
      emit('render');
      const sky = document.getElementById('sky'); if (sky && root.contains(document.activeElement)) sky.focus({ preventScroll: true });
    },
    toggle() { if (root.hidden) p.open(); else p.close(); },
    /** Collapse to just the header (used on a phone so the sky shows after "go to"). */
    peek(on) { root.classList.toggle('peek', !!on); grip.setAttribute('aria-expanded', String(!on)); },
    peeked: () => root.classList.contains('peek'),
  };
  grip.addEventListener('click', () => p.peek(!p.peeked()));
  root.querySelector('[data-x="close"]').addEventListener('click', () => p.close());
  // typing in a panel must not trigger the sky's keyboard shortcuts
  root.addEventListener('keydown', (e) => {
    const t = e.target;
    if (e.key !== 'Escape' && t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) e.stopPropagation();
  });
  panels.push(p);
  return p;
}
export const openPanel = () => panels.find((p) => p.isOpen()) || null;
export function closePanels() { for (const p of panels) p.close(); }

// ---- toast ------------------------------------------------------------------------------
let toastEl = null, toastTimer = 0;
/** A short message near the top of the sky. kind: '' | 'warn' | 'err'. */
export function toast(text, { ms = 4200, kind = '' } = {}) {
  if (!toastEl) { toastEl = el('div', 'xtoast'); toastEl.setAttribute('role', 'status'); toastEl.setAttribute('aria-live', 'polite'); toastEl.hidden = true; document.body.appendChild(toastEl); }
  toastEl.className = 'xtoast' + (kind ? ' ' + kind : '');
  toastEl.textContent = text; toastEl.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { toastEl.hidden = true; }, ms);
}
export function hideToast() { if (toastEl) toastEl.hidden = true; }

// ---- tooltips: the same bubble the toolbar uses, for any element with data-tip ----------
let tipEl = null;
function tipBox() {
  if (!tipEl) { tipEl = el('div', 'tip xtip'); tipEl.hidden = true; document.body.appendChild(tipEl); }
  return tipEl;
}
/** Give `node` a tooltip (text, optional shortcut key). Replaces a native title so the two never double up. */
export function addTip(node, text, key = '') {
  node.removeAttribute('title');
  node.dataset.tip = text; if (key) node.dataset.tipKey = key;
  if (!node.getAttribute('aria-label')) node.setAttribute('aria-label', key ? `${text} (${key})` : text);
  if (node.dataset.tipBound) return;
  node.dataset.tipBound = '1';
  const show = () => {
    const t = tipBox();
    t.innerHTML = esc(node.dataset.tip) + (node.dataset.tipKey ? `<kbd>${esc(node.dataset.tipKey)}</kbd>` : '');
    t.hidden = false;
    const r = node.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
    const below = r.top < window.innerHeight / 2;
    t.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px';
    t.style.top = (below ? r.bottom + 8 : r.top - h - 8) + 'px';
  };
  const hide = () => { if (tipEl) tipEl.hidden = true; };
  node.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') show(); });
  node.addEventListener('focus', () => { if (node.matches(':focus-visible')) show(); });
  node.addEventListener('pointerleave', hide);
  node.addEventListener('blur', hide);
  node.addEventListener('click', hide);
}

/** Start a download of text or a Blob under the given file name. */
export function download(name, data, type = 'text/plain') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.style.display = 'none';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
