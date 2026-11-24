// focus.js: who gets Space and Enter. After a button is clicked with the mouse or a finger it would keep the keyboard
// focus, and the browser would press it again on the next Space; but Space means "centre on the selected object". So:
//   - a button, link or tick-box that was clicked gives the focus up again;
//   - Space / Enter never press one that was not reached with the keyboard (Tab, or the arrows in a menu);
//   - one that WAS reached with the keyboard is pressed by Space / Enter as usual.
// Text boxes, drop-down lists, sliders, dialogs and the lab notebook are left alone.

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
  if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
  if (el.tagName !== 'INPUT') return false;
  const t = (el.type || '').toLowerCase();
  if (t === 'range') return !e || e.key.length > 1 || e.key === ' ';      // arrows, Page, Home, End move the slider; letters are shortcuts
  return !(pressable(el));
}

window.addEventListener('pointerdown', () => { byKeys = false; reached = null; }, true);
window.addEventListener('focusin', (e) => { reached = byKeys && pressable(e.target) ? e.target : null; }, true);
window.addEventListener('keydown', (e) => {
  if (e.key === 'Tab' || (e.key.startsWith('Arrow') && e.target && e.target.closest && e.target.closest('[role=menu], [role=toolbar], [role=radiogroup]'))) { byKeys = true; return; }
  if (e.key !== ' ' && e.key !== 'Enter') return;
  const el = e.target;
  if (!pressable(el) || keyReached(el) || el.closest(OWN)) return;
  el.blur();                     // and then the key goes on to the sky's own handlers
  e.preventDefault();
}, true);
window.addEventListener('click', (e) => {
  if (byKeys) return;                                     // pressed from the keyboard
  const hit = e.target && e.target.closest ? e.target.closest(PRESSABLE + ', label') : null;
  if (!hit) return;
  const ctl = hit.tagName === 'LABEL' ? hit.control : hit;
  setTimeout(() => { const a = document.activeElement; if (a && a === ctl && pressable(a)) a.blur(); }, 0);
}, true);
