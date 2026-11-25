// notebook/standalone.js: the lab notebook on its own page (notebook.html), for data typed in from anywhere:
// real telescope measurements, another sim, a textbook table. No planetarium, so no Record button.
// URL: ?slot=<name> keeps separate notebooks apart; ?instructor=1 shows the least-squares button; ?predict=0 starts
// with the "bigger or smaller?" prediction off.
import '../viewport.js';
import { createNotebook } from './ui.js';

const q = new URLSearchParams(location.search);
const api = createNotebook(document.getElementById('nbRoot'), { slot: 'page:' + (q.get('slot') || 'default'), host: null, standalone: true, instructor: q.get('instructor') === '1' });
if (q.get('predict') === '0') { api.nb.predict = false; api.changed(); }
window.notebook = api;
