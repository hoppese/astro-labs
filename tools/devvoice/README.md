# Dev voice: talk to Claude while using the planetarium (this laptop only)

1. Serve the site as usual: `python3 -m http.server 8111 --bind 127.0.0.1` in `astro-labs/`.
2. Start the voice server: `node tools/devvoice/server.mjs`.
3. Open http://127.0.0.1:8111/planetarium/ in Chrome, switch on **☰ → Dev voice** (the item appears only when the page is served from
   this laptop, never on the live site), press **Start** on the small panel at the bottom right, and allow the microphone.
   The panel's **Changes** list shows every request: waiting, working, changed, answered, undone, and the commits not yet pushed.
4. Use the app. Say **“Hey Claude, …”** and what should change (“…the photometer row should be bold”); pause to send.
   “Hey Claude, cancel” drops it. **Undo** reverts the last change.
   Chrome’s recognizer often mishears the name (common slips such as “a slot” or “hey cloud” are accepted). For better accuracy press
   **`** (backtick) or ⌨: a request box opens, focused, so any dictation tool you prefer can fill it; Enter sends, Esc closes.

Each request goes, with the view link, the open panels, recent console errors and a screenshot of the sky, to headless Claude Code
running in this folder (one request at a time, one continuing session). Claude may edit files and run `node planetarium/tools/check.mjs`,
nothing else. The server then makes **one local commit per change** (“dev voice: …”) and the page reloads to the same view.
**Nothing is pushed**: review and push later from a normal Claude Code session.

Speech recognition is Chrome's built-in one, which sends the audio to Google to transcribe. The server listens on 127.0.0.1 only, gives its token
(kept in `tools/devvoice/.token`, gitignored) only to the local planetarium page, and answers only requests carrying it. Screenshots are kept in `tools/devvoice/shots/` (gitignored).
