// tools/devvoice/server.mjs: "talk to Claude while using the planetarium" (development only, this laptop only).
//
// The planetarium opened as http://127.0.0.1:8111/planetarium/?dev=<token> shows a small panel (planetarium/js/dev/voice.js) that listens
// for "Hey Claude, ..." and sends what was said, with what is on screen, here. This server runs headless Claude Code in the astro-labs
// folder, one request at a time and in one continuing session (so "no, bigger" knows what "it" is), lets it edit files and run the
// check suite, and then makes ONE LOCAL COMMIT per change. It never pushes: that is done later, by hand, from a normal session.
//
//   node tools/devvoice/server.mjs            prints the link to open; Ctrl-C stops it
//
// Safety: listens on 127.0.0.1 only; every request needs the token (a fresh random one each start, in the link); CORS allows only the
// local planetarium; Claude gets file tools and `node tools/check.mjs` only (no other shell, no git, no network tools).

import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..');                 // astro-labs
const SHOTS = path.join(HERE, 'shots');                      // screenshots sent with requests (gitignored)
const PORT = 8112, ORIGINS = ['http://127.0.0.1:8111', 'http://localhost:8111'];
// the token is kept in tools/devvoice/.token (gitignored), so a restart keeps the same link; delete the file for a new one
const TOKEN_FILE = path.join(HERE, '.token');
const TOKEN = (() => { try { const t = readFileSync(TOKEN_FILE, 'utf8').trim(); if (/^[0-9a-f]{24}$/.test(t)) return t; } catch (e) { /* none yet */ } const t = randomBytes(12).toString('hex'); writeFileSync(TOKEN_FILE, t + '\n', { mode: 0o600 }); return t; })();
mkdirSync(SHOTS, { recursive: true });

const RULES = `You are making live changes to the astro-labs planetarium (folder planetarium/) while its author, Seth, uses it in the browser
and speaks requests aloud. Each request arrives transcribed by speech recognition (expect misheard words; infer the intent), with what was
on his screen: the view link, the lab and step, the selected object, text of the open panels, console errors, and a screenshot path you
can Read.
- Make the change he asked for, as small and focused as possible, in the style of the surrounding code (read planetarium/NOTES.md for how
  things fit together when you need to).
- The server runs the check suite (node planetarium/tools/check.mjs) after you finish and tells you if it fails; you may run it
  yourself too, exactly as written, with no cd, pipes or redirection.
- Do NOT run git, do not commit or push: the server commits each change. Never touch data licences, credentials or anything outside
  astro-labs.
- If the request is unclear, make your best reasonable guess and say what you assumed. If it is not a change request (a question, a
  thought), answer it without editing.
- Finish with a reply of 1 to 3 plain sentences saying what you changed (or why not). It is shown to him as a pop-up.`;

let session = null, busy = false, seq = 0;
const jobs = new Map(), queue = [];

const gitRaw = (...a) => execFileSync('git', a, { cwd: REPO, encoding: 'utf8' });
const git = (...a) => gitRaw(...a).trim();
/** Files changed under planetarium/ (not trimmed: porcelain lines start with a space). */
const changed = () => gitRaw('status', '--porcelain', '--', 'planetarium').split('\n').filter(Boolean).map((l) => l.slice(3));
/** The check suite, run by the server itself after every change (so it never depends on what Claude chose to run): {ok, tail}. */
function check() {
  try { execFileSync('node', ['planetarium/tools/check.mjs'], { cwd: REPO, encoding: 'utf8', stdio: 'pipe', timeout: 600000 }); return { ok: true, tail: '' }; }
  catch (e) { return { ok: false, tail: String((e.stdout || '') + (e.stderr || '')).split('\n').slice(-25).join('\n') }; }
}
const untracked = () => new Set(gitRaw('status', '--porcelain', '--untracked-files=all', '--', 'planetarium').split('\n').filter((l) => l.startsWith('??')).map((l) => l.slice(3)));
/** Throw away a change whose checks still fail: edits to tracked files, and only the new files THIS change created. */
function discard(before) { git('checkout', '--', 'planetarium'); for (const f of untracked()) if (!before.has(f)) rmSync(path.join(REPO, f), { force: true }); }
function commitIfChanged(text) {
  const files = changed();
  if (!files.length) return null;
  git('add', '-A', '--', 'planetarium');
  git('commit', '-q', '-m', 'dev voice: ' + text.slice(0, 120).replace(/\s+/g, ' '), '-m', 'Made live from a spoken request (tools/devvoice). Not pushed.');
  return { hash: git('rev-parse', '--short', 'HEAD'), files };
}

function runClaude(prompt) {
  return new Promise((resolve) => {
    const args = ['-p', prompt, '--output-format', 'json', '--permission-mode', 'acceptEdits',
      '--allowedTools', 'Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node planetarium/tools/check.mjs)', 'Bash(node planetarium/tools/check.mjs:*)',
      '--append-system-prompt', RULES];
    if (session) args.push('--resume', session);
    const p = spawn('claude', args, { cwd: REPO, env: process.env });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => {
      try { const j = JSON.parse(out); if (j.session_id) session = j.session_id; resolve({ ok: !j.is_error, text: String(j.result || '').trim() }); }
      catch (e) { resolve({ ok: false, text: 'Claude did not answer (exit ' + code + '). ' + (err || out).slice(-400) }); }
    });
  });
}

async function work() {
  if (busy || !queue.length) return;
  busy = true;
  const job = queue.shift(); job.state = 'working'; job.startedAt = Date.now();
  const c = job.context || {};
  let shot = '';
  if (job.shot && /^data:image\/jpeg;base64,/.test(job.shot)) { shot = path.join(SHOTS, `${job.id}.jpg`); writeFileSync(shot, Buffer.from(job.shot.split(',')[1], 'base64')); }
  const prompt = `Spoken request: "${job.text}"

On screen when he said it:
- view link: ${c.link || '?'}
- lab: ${c.lab || 'none'}${c.step != null ? ', step ' + (c.step + 1) : ''}
- selected object: ${c.selected || 'none'}
- open panels (text): ${(c.panels || '').slice(0, 3000) || 'none'}
- recent console errors: ${(c.errors || []).join(' | ') || 'none'}
${shot ? '- screenshot of the sky: ' + shot : ''}`;
  const before = untracked();
  const r = await runClaude(prompt);
  // the server runs the checks; one chance to fix a failure, then the change is thrown away
  if (changed().length) {
    let c = check();
    if (!c.ok) {
      console.log(`[${job.id}] checks failed; asking for a fix`);
      const f = await runClaude('The check suite (node planetarium/tools/check.mjs) fails after your change. Its last lines:\n' + c.tail + '\nFix it, keeping the change he asked for. Reply in 1 to 3 sentences.');
      if (f.text) r.text = f.text;
      c = check();
      if (!c.ok) { discard(before); r.ok = false; r.text = 'I made the change but the checks still failed, so it was thrown away. ' + c.tail.split('\n').filter((l) => /Error|fail/i.test(l)).slice(-2).join(' '); }
    }
  }
  let commit = null;
  try { commit = commitIfChanged(job.text); } catch (e) { r.text += ' (The commit failed: ' + e.message.slice(0, 200) + ')'; }
  Object.assign(job, { state: 'done', ok: r.ok, reply: r.text || '(no reply)', commit, doneAt: Date.now() });
  console.log(`[${job.id}] ${job.text}\n   -> ${commit ? commit.hash + ' ' + commit.files.join(', ') : 'no change'}\n   ${job.reply}\n`);
  busy = false;
  work();
}

function undo() {
  const msg = git('log', '-1', '--format=%s');
  if (!msg.startsWith('dev voice: ')) return { ok: false, reply: 'The last commit is not a dev-voice change, so nothing was undone.' };
  if (git('status', '--porcelain', '--', 'planetarium')) return { ok: false, reply: 'There are uncommitted changes; nothing was undone.' };
  const gone = git('rev-parse', '--short', 'HEAD');
  git('revert', '--no-edit', 'HEAD');
  for (const j of jobs.values()) if (j.commit && j.commit.hash === gone) j.undone = true;
  return { ok: true, reply: 'Undone: ' + msg.slice(11), commit: { hash: git('rev-parse', '--short', 'HEAD'), files: [] } };
}

const server = http.createServer((req, res) => {
  const origin = req.headers.origin;
  if (ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Access-Control-Allow-Headers', 'content-type, x-dev-token'); res.setHeader('Access-Control-Allow-Methods', 'GET, POST'); }
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
  if (req.headers['x-dev-token'] !== TOKEN) { send(403, { error: 'bad token' }); return; }
  const url = new URL(req.url, 'http://x');
  if (req.method === 'GET' && url.pathname === '/job') { const j = jobs.get(+url.searchParams.get('id')); send(j ? 200 : 404, j ? { ...j, shot: undefined, context: undefined, ahead: queue.indexOf(j) } : { error: 'no such job' }); return; }
  if (req.method === 'GET' && url.pathname === '/jobs') {      // the panel's list: every request since the server started, newest first, and what is not pushed yet
    let unpushed = [];
    try { unpushed = git('log', '--format=%h %s', '@{upstream}..HEAD').split('\n').filter(Boolean).map((l) => ({ hash: l.slice(0, l.indexOf(' ')), subject: l.slice(l.indexOf(' ') + 1) })); } catch (e) { /* no upstream: fine */ }
    send(200, { busy, jobs: [...jobs.values()].reverse().map((j) => ({ id: j.id, text: j.text, state: j.state, ok: j.ok, reply: j.reply, commit: j.commit, undone: !!j.undone, at: j.at, startedAt: j.startedAt, doneAt: j.doneAt, ahead: queue.indexOf(j) })), unpushed });
    return;
  }
  if (req.method === 'POST' && url.pathname === '/undo') { if (busy || queue.length) { send(409, { ok: false, reply: 'Wait until the current request is done.' }); return; } try { send(200, undo()); } catch (e) { send(500, { ok: false, reply: e.message }); } return; }
  if (req.method === 'POST' && url.pathname === '/ask') {
    let body = '';
    req.on('data', (d) => { body += d; if (body.length > 8e6) req.destroy(); });
    req.on('end', () => {
      let o; try { o = JSON.parse(body); } catch (e) { send(400, { error: 'bad json' }); return; }
      if (!o.text || typeof o.text !== 'string') { send(400, { error: 'no text' }); return; }
      const job = { id: ++seq, text: o.text.slice(0, 2000), context: o.context, shot: o.shot, state: 'queued', at: Date.now() };
      jobs.set(job.id, job); queue.push(job); work();
      send(200, { id: job.id, ahead: queue.length - 1 + (busy ? 1 : 0) });
    });
    return;
  }
  send(404, { error: 'not found' });
});
server.listen(PORT, '127.0.0.1', () => {
  console.log(`Dev voice server on 127.0.0.1:${PORT}. Each change becomes a local commit in ${REPO}; nothing is pushed.\n`);
  console.log(`Open:  http://127.0.0.1:8111/planetarium/?dev=${TOKEN}\n`);
});
