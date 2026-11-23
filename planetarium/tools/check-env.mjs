// Shared setup for the Node check scripts: loads the vendored astronomy-engine browser build
// into globalThis.Astronomy (exactly the file the page loads) and stubs localStorage.
import { readFileSync } from 'node:fs';
const src = readFileSync(new URL('../vendor/astronomy.browser.min.js', import.meta.url), 'utf8');
const win = {};
new Function('window', 'self', 'module', 'exports', 'define', src)(win, win, undefined, undefined, undefined);
globalThis.Astronomy = win.Astronomy;
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
export const A = globalThis.Astronomy;
