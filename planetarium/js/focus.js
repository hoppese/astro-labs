// focus.js: who gets Space and Enter. After a button is clicked with the mouse or a finger it would keep the keyboard
// focus, and the browser would press it again on the next Space; but Space means "centre on the selected object". So:
//   - a button, link or tick-box that was clicked gives the focus up again;
//   - Space / Enter never press one that was not reached with the keyboard (Tab, or the arrows in a menu);
//   - one that WAS reached with the keyboard is pressed by Space / Enter as usual.
// Text boxes, drop-down lists, sliders, dialogs and the lab notebook are left alone.

const WIN = typeof window === 'undefined' ? { addEventListener() {} } : window;      // (imported by the Node checks too)
const PRESSABLE = 'button, a, summary, input[type=checkbox], input[type=radio], input[type=button], input[type=submit], [role=button]';
const OWN = '.nbpanel, .modal-backdrop, [role=dialog][aria-modal], .nb-dialog';      // places with their own rules for keys
let byKeys = false;              // was the focus last moved with the keyboard?
let reached = null;              // the element the keyboard put the focus on

const pressable = (el) => !!(el && el.matches && el.matches(PRESSABLE));
/** True when `el` was reached with Tab (or arrows), so Space / Enter belong to it. */
export const keyReached = (el) => pressable(el) && el === reached;
/** Real text entry (and other things that use Space or letters themselves). */
export function takesKeys(el, e) {
  if (!el || !el.tagName) return false;
  if (el.isContentEditable || el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'SELECT') return !(e && (e.key === '/' || e.key === 'F3'));      // letters choose in the list; no list is searched with a slash
  if (el.tagName !== 'INPUT') return false;
  const t = (el.type || '').toLowerCase();
  if (t === 'range') return !e || e.key.length > 1 || e.key === ' ';      // arrows, Page, Home, End move the slider; letters are shortcuts
  return !(pressable(el));
}

// ---- keys typed into something must never turn into shortcuts because it went away under the typist ----
/** Rebuild the inside of `root` with fn() and give the focus back to the same control (by id, or by its data- attributes). */
export function keepFocus(root, fn) {
  const a = document.activeElement, had = a && a !== root && root.contains(a);
  let sel = null, pos = null;
  if (had) {
    const attrs = [...a.attributes].filter((t) => t.name.startsWith('data-') && !/^data-(tip|sure)/.test(t.name)).map((t) => `[${t.name}="${CSS.escape(t.value)}"]`).join('');
    sel = a.id ? '#' + CSS.escape(a.id) : attrs ? a.tagName.toLowerCase() + attrs : null;
    try { pos = [a.selectionStart, a.selectionEnd]; } catch (e) { pos = null; }
  }
  const r = fn();
  if (had && !root.contains(document.activeElement)) {
    const b = sel && root.querySelector(sel);
    if (b && !b.disabled) { const k = byKeys; b.focus({ preventScroll: true }); byKeys = k; if (pos && pos[0] != null) try { b.setSelectionRange(pos[0], pos[1]); } catch (e) { /* not a text box */ } }
  }
  return r;
}
let typingIn = null, typedAt = -1e9, listKey = -1e9;
WIN.addEventListener('focusin', (e) => { if (e.target !== document.body) typingIn = takesKeys(e.target) ? e.target : null; }, true);
WIN.addEventListener('pointerdown', () => { typingIn = null; }, true);
WIN.addEventListener('keydown', (e) => {
  const now = performance.now(), a = document.activeElement;
  if (takesKeys(e.target)) { typedAt = now; if (e.target.tagName === 'SELECT') listKey = now; return; }
  // the safety net: the box was removed while somebody was typing in it. The rest of the word is dropped, not obeyed.
  if (typingIn && !typingIn.isConnected && (!a || a === document.body) && now - typedAt < 1500 && e.key.length === 1 && !e.metaKey && !e.ctrlKey) { typedAt = now; e.preventDefault(); e.stopImmediatePropagation(); }
  else if (typingIn && !typingIn.isConnected) typingIn = null;
}, true);
// a list from which something was chosen with the mouse gives the keys back after a moment without typing (letters choose in it until then)
WIN.addEventListener('change', (e) => {
  const s = e.target; if (!s || s.tagName !== 'SELECT' || s.closest(OWN) || performance.now() - listKey < 400) return;
  const t = performance.now();
  setTimeout(() => { if (document.activeElement === s && listKey < t) s.blur(); }, 1200);
}, true);

WIN.addEventListener('pointerdown', () => { byKeys = false; reached = null; }, true);
WIN.addEventListener('focusin', (e) => { reached = byKeys && pressable(e.target) ? e.target : null; }, true);
WIN.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || (e.key.startsWith('Arrow') && e.target && e.target.closest && e.target.closest('[role=menu], [role=toolbar], [role=radiogroup]'))) { byKeys = true; return; }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const el = e.target;
  if (!pressable(el) || keyReached(el) || el.closest(OWN)) return;
  el.blur();                     // and then the key goes on to the sky's own handlers
  e.preventDefault();
}, true);
WIN.addEventListener('click', (e) => {
  if (byKeys) return;                                     // pressed from the keyboard
  const hit = e.target && e.target.closest ? e.target.closest(PRESSABLE + ', label') : null;
  if (!hit) return;
  const ctl = hit.tagName === 'LABEL' ? hit.control : hit;
  setTimeout(() => { const a = document.activeElement; if (a && a === ctl && pressable(a)) a.blur(); }, 0);
}, true);
