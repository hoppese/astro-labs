// labs/dock.js: the stack of small cards at the top right that hold the measurement tools
// (lab prompt, stopwatch, events, second observer, trails, corrections). Cards can be minimised.

import { el } from './util.js';

let dock = null;
const cards = {};
export function getDock() {
  if (!dock) { dock = el('div', { class: 'labsdock', id: 'labsDock' }); document.body.appendChild(dock); }
  return dock;
}
/** Create a card. Returns {root, body, open(), close(), toggle(), isOpen()}. */
export function makeCard(id, title, { onOpen, onClose, cls = '' } = {}) {
  const root = el('section', { class: 'lcard ' + cls, id: 'card-' + id, hidden: true, 'aria-label': title });
  const head = el('div', { class: 'lcard-head' });
  const ttl = el('span', { class: 'ttl' }); ttl.textContent = title;
  const minB = el('button', { class: 'mini', type: 'button', title: 'Minimise', 'aria-label': 'Minimise ' + title }, '&#8211;');
  const closeB = el('button', { class: 'mini', type: 'button', title: 'Close', 'aria-label': 'Close ' + title }, '&times;');
  head.append(ttl, minB, closeB);
  const body = el('div', { class: 'lcard-body' });
  root.append(head, body);
  getDock().appendChild(root);
  const card = {
    id, root, body, title: ttl,
    isOpen: () => !root.hidden,
    open() { const was = root.hidden; root.hidden = false; root.classList.remove('min'); if (was && onOpen) onOpen(); root.scrollIntoView({ block: 'nearest' }); document.dispatchEvent(new CustomEvent('labs-cards')); },
    close() { if (root.hidden) return; root.hidden = true; if (onClose) onClose(); document.dispatchEvent(new CustomEvent('labs-cards')); },
    toggle() { if (root.hidden) card.open(); else card.close(); },
  };
  minB.addEventListener('click', () => root.classList.toggle('min'));
  ttl.addEventListener('click', () => { if (root.classList.contains('min')) root.classList.remove('min'); });
  closeB.addEventListener('click', () => card.close());
  // typing in a card must not trigger the sky's keyboard shortcuts
  root.addEventListener('keydown', (e) => { if (e.target.matches('input, select, textarea') && e.key !== 'Escape') e.stopPropagation(); });
  cards[id] = card;
  return card;
}
export const getCard = (id) => cards[id];
export const openCards = () => Object.values(cards).filter((c) => c.isOpen()).map((c) => c.id);
