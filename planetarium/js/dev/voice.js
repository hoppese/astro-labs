// dev/voice.js: DEVELOPMENT ONLY. "Hey Claude, ..." while using the planetarium on this laptop: what is said after the wake words, with
// what is on screen, goes to the local dev-voice server (tools/devvoice/server.mjs), which has Claude make the change and commits it
// locally. Loaded by main.js only on 127.0.0.1 / localhost with ?dev=<token> in the address (the server prints that link); inert anywhere else.
// Speech recognition is Chrome's built-in one (it sends the audio to Google to be transcribed).

import { state } from '../state.js';
import { refName } from '../objects.js';
import { describeView } from '../labs/setup.js';
import { lab, labStep } from '../labs/labs.js';

const API = 'http://127.0.0.1:8112';
const WAKE = /\b(?:hey|hi|ok(?:ay)?|a)[\s,.]+(?:claude|cloud|clyde|clod|claud)\b[\s,.!]*/i;
const CANCEL = /^\s*(?:cancel|never ?mind|stop)\b/i;
const SILENCE_MS = 1600;

export function initDevVoice(token) {
  // ---- what went wrong lately (sent with each request) ----
  const errors = [];
  const keep = (s) => { errors.push(String(s).slice(0, 300)); if (errors.length > 8) errors.shift(); };
  window.addEventListener('error', (e) => keep(e.message + (e.filename ? ' @ ' + e.filename.split('/').pop() + ':' + e.lineno : '')));
  window.addEventListener('unhandledrejection', (e) => keep('unhandled: ' + (e.reason && e.reason.message || e.reason)));
  const ce = console.error; console.error = (...a) => { keep(a.map(String).join(' ')); ce.apply(console, a); };

  // ---- the panel ----
  const box = document.createElement('div');
  box.id = 'devVoice';
  box.innerHTML = `<style>
    #devVoice{position:fixed;right:12px;bottom:64px;z-index:9999;width:340px;max-width:calc(100vw - 24px);font:13px/1.4 system-ui,sans-serif;color:#e8eef5}
    #devVoice .dv-bar{display:flex;gap:6px;align-items:center;background:#16202c;border:1px solid #3a4b5f;border-radius:8px;padding:6px 8px}
    #devVoice .dv-dot{width:10px;height:10px;border-radius:50%;background:#666;flex:none}
    #devVoice .dv-dot.on{background:#3fcf6a;box-shadow:0 0 6px #3fcf6a}#devVoice .dv-dot.hot{background:#ff6b5a;box-shadow:0 0 8px #ff6b5a}
    #devVoice .dv-live{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#9fb0c2}
    #devVoice button{background:#24344a;color:#e8eef5;border:1px solid #3a4b5f;border-radius:5px;padding:2px 7px;font:inherit;cursor:pointer}
    #devVoice .dv-msgs{display:flex;flex-direction:column;gap:6px;margin-bottom:6px;max-height:50vh;overflow:auto}
    #devVoice .dv-msg{background:#1c2836;border:1px solid #3a4b5f;border-radius:8px;padding:7px 9px}
    #devVoice .dv-msg b{color:#f0c46a}#devVoice .dv-msg .dv-x{float:right;padding:0 5px;margin:-2px -4px 0 6px}
    #devVoice .dv-msg.err{border-color:#a5473d}</style>
    <div class="dv-msgs"></div>
    <div class="dv-bar"><span class="dv-dot"></span><span class="dv-live">Dev voice: say “Hey Claude, …”</span><button data-a="type" title="Type a request instead">⌨</button><button data-a="undo" title="Undo the last change">Undo</button><button data-a="mic">Start</button></div>`;
  document.body.appendChild(box);
  const dot = box.querySelector('.dv-dot'), live = box.querySelector('.dv-live'), msgs = box.querySelector('.dv-msgs'), micBtn = box.querySelector('[data-a=mic]');
  function note(html, { cls = '', ms = 0 } = {}) {
    const m = document.createElement('div'); m.className = 'dv-msg ' + cls; m.innerHTML = '<button class="dv-x" aria-label="Close">×</button>' + html;
    m.querySelector('.dv-x').onclick = () => m.remove(); msgs.appendChild(m); msgs.scrollTop = 1e6;
    if (ms) setTimeout(() => m.remove(), ms);
    return m;
  }
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  function chime(f = 880) { try { const a = new AudioContext(), o = a.createOscillator(), g = a.createGain(); o.frequency.value = f; g.gain.value = 0.06; o.connect(g).connect(a.destination); o.start(); g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.25); o.stop(a.currentTime + 0.3); } catch (e) { /* no sound: fine */ } }

  // ---- what is on screen ----
  function context() {
    const q = describeView(); q.set('dev', token);
    if (lab.current) { q.set('lab', lab.current.id); }
    const panels = [...document.querySelectorAll('.infopanel, .lab-card, .lcard:not([hidden]), .modal-backdrop.show .modal')]
      .filter((e) => e.offsetParent).map((e) => e.innerText.replace(/\s+\n/g, '\n').trim()).join('\n---\n');
    return { link: location.origin + location.pathname + '?' + q.toString(), lab: lab.current ? lab.current.id : null, step: lab.current ? labStep() : null,
      selected: state.selected ? refName(state.selected) : null, panels, errors: errors.slice() };
  }
  function shot() { try { const c = document.getElementById('sky'); const s = document.createElement('canvas'), k = Math.min(1, 1400 / c.width); s.width = c.width * k; s.height = c.height * k; s.getContext('2d').drawImage(c, 0, 0, s.width, s.height); return s.toDataURL('image/jpeg', 0.7); } catch (e) { return null; } }

  // ---- talking to the server ----
  const post = (p, body) => fetch(API + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-dev-token': token }, body: JSON.stringify(body || {}) }).then((r) => r.json());
  async function ask(text) {
    const ctx = context();
    let r;
    try { r = await post('/ask', { text, context: ctx, shot: shot() }); } catch (e) { note('Could not reach the dev-voice server. Is <code>node tools/devvoice/server.mjs</code> running?', { cls: 'err' }); return; }
    if (!r.id) { note('The server refused: ' + esc(r.error || '?'), { cls: 'err' }); return; }
    const m = note(`<b>Working</b>${r.ahead ? ` (after ${r.ahead} more)` : ''}: “${esc(text)}”`);
    const poll = async () => {
      let j; try { j = await fetch(API + '/job?id=' + r.id, { headers: { 'x-dev-token': token } }).then((x) => x.json()); } catch (e) { setTimeout(poll, 3000); return; }
      if (j.state !== 'done') { setTimeout(poll, 2000); return; }
      m.classList.toggle('err', !j.ok);
      m.innerHTML = `<button class="dv-x" aria-label="Close">×</button><b>${j.commit ? 'Changed' : j.ok ? 'Answer' : 'Problem'}</b>: ${esc(j.reply)}` + (j.commit ? `<br><small>commit ${esc(j.commit.hash)} · ${esc(j.commit.files.join(', '))} · reloading…</small>` : '');
      m.querySelector('.dv-x').onclick = () => m.remove();
      chime(j.ok ? 1175 : 330);
      if (j.commit) reloadTo(ctx.link, j.reply);
    };
    setTimeout(poll, 2500);
  }
  function reloadTo(link, reply) {
    try { sessionStorage.setItem('devVoice.last', reply); sessionStorage.setItem('devVoice.listen', listening ? '1' : ''); } catch (e) { /* fine */ }
    setTimeout(() => { location.href = link; }, 2500);
  }
  box.addEventListener('click', async (e) => {
    const a = e.target.closest('[data-a]'); if (!a) return;
    if (a.dataset.a === 'mic') { listening ? stop() : start(); }
    else if (a.dataset.a === 'type') { const t = prompt('Request for Claude:'); if (t && t.trim()) ask(t.trim()); }
    else if (a.dataset.a === 'undo') {
      let r; try { r = await post('/undo'); } catch (err) { note('Could not reach the dev-voice server.', { cls: 'err' }); return; }
      note(`<b>${r.ok ? 'Undone' : 'Not undone'}</b>: ${esc(r.reply)}`, { cls: r.ok ? '' : 'err' });
      if (r.ok) reloadTo(context().link, r.reply);
    }
  });

  // ---- listening ----
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null, listening = false, capturing = false, said = '', timer = null;
  function finish() {
    clearTimeout(timer); timer = null;
    const text = said.trim(); capturing = false; said = ''; dot.classList.remove('hot');
    if (!text) { live.textContent = 'Heard “Hey Claude” but no request.'; return; }
    if (CANCEL.test(text)) { live.textContent = 'Cancelled.'; chime(330); return; }
    live.textContent = 'Sent: ' + text; ask(text);
  }
  function onResult(ev) {
    let interim = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i], t = r[0].transcript;
      if (!r.isFinal) { interim += t; continue; }
      if (capturing) said += ' ' + t;
      else { const m = WAKE.exec(t); if (m) { capturing = true; said = t.slice(m.index + m[0].length); chime(); dot.classList.add('hot'); } }
      if (capturing) { clearTimeout(timer); timer = setTimeout(finish, SILENCE_MS); }
    }
    if (!capturing && WAKE.test(interim)) { capturing = true; said = ''; chime(); dot.classList.add('hot'); }      // the wake words heard before the rest
    if (capturing) { clearTimeout(timer); timer = setTimeout(finish, SILENCE_MS + 800); live.textContent = '🎙 ' + (said + ' ' + interim.replace(WAKE, '')).trim(); }
    else if (interim) live.textContent = interim;
  }
  function start() {
    if (!SR) { note('This browser has no speech recognition (use Chrome). The ⌨ button still works.', { cls: 'err' }); return; }
    rec = new SR(); rec.continuous = true; rec.interimResults = true; rec.lang = 'en-US';
    rec.onresult = onResult;
    rec.onerror = (e) => { if (e.error === 'not-allowed' || e.error === 'service-not-allowed') { note('Microphone not allowed: allow it for this page, then press Start.', { cls: 'err' }); stop(); } };
    rec.onend = () => { if (listening) try { rec.start(); } catch (e) { /* already running */ } };      // Chrome stops after a while: keep going
    try { rec.start(); } catch (e) { /* fine */ }
    listening = true; dot.classList.add('on'); micBtn.textContent = 'Stop'; live.textContent = 'Listening: say “Hey Claude, …”';
  }
  function stop() { listening = false; capturing = false; if (rec) try { rec.stop(); } catch (e) { /* fine */ } dot.classList.remove('on', 'hot'); micBtn.textContent = 'Start'; live.textContent = 'Not listening.'; }

  // after a reload made by a change: say what changed, and listen again if it was listening
  try {
    const last = sessionStorage.getItem('devVoice.last'); if (last) { note('<b>Changed</b>: ' + esc(last), { ms: 15000 }); sessionStorage.removeItem('devVoice.last'); }
    if (sessionStorage.getItem('devVoice.listen')) start();
  } catch (e) { /* fine */ }
}
