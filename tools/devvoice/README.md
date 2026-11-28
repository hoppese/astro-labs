# Dev voice: talk to Claude while using the planetarium (this laptop only)

1. Serve the site as usual: `python3 -m http.server 8111 --bind 127.0.0.1` in `astro-labs/`.
2. Start the voice server: `node tools/devvoice/server.mjs`.
3. Open http://127.0.0.1:8111/planetarium/ in Chrome, switch on **☰ → Dev voice** (the item appears only when the page is served from
   this laptop, never on the live site), press **Start** on the small panel at the bottom right, and allow the microphone.
   The panel's **Changes** list shows every request: waiting, working, changed, answered, undone, and the commits not yet pushed.
4. Use the app and talk. With Whisper the panel listens all the time: every utterance goes into a running transcript, and after about
   2.5 s of quiet a fast model (Claude Haiku, through the same `claude` command, no tools) reads the new part, with the earlier part as
   context, and picks out what you asked for: pieces split by pauses are joined, follow-ups (“also make it bigger”) understood, musing
   ignored. If you stopped mid-thought it waits (up to about 12 s of quiet). Each request shows as **About to do: …** for 3 s with
   **Cancel**, then goes to the queue. No wake word is needed (with Chrome's recognizer, the fallback, “Hey Claude, …” still is).
   “Hey Claude, cancel” drops it. **Undo** reverts the last change.
   Chrome’s recognizer often mishears the name (common slips such as “a slot” or “hey cloud” are accepted). For better accuracy press
   **`** (backtick) or ⌨: a request box opens, focused, so any dictation tool you prefer can fill it; Enter sends, Esc closes.

Each request goes, with the view link, the open panels, recent console errors and a screenshot of the sky, to headless Claude Code
running in this folder (one request at a time, one continuing session). Claude may edit files and run `node planetarium/tools/check.mjs`,
nothing else. The server then makes **one local commit per change** (“dev voice: …”) and the page reloads to the same view.
**Nothing is pushed**: review and push later from a normal Claude Code session.

Speech: **Whisper on this laptop** (`brew install whisper-cpp`, model `tools/devvoice/models/ggml-base.en.bin` from
huggingface.co/ggerganov/whisper.cpp, gitignored; SHA-1 137c4040…). The panel cuts the microphone into utterances at the pauses and
sends each to the server as 16 kHz WAV; Whisper takes about half a second each and nothing leaves the laptop. Without Whisper the panel
falls back to Chrome's recognizer, which sends the audio to Google and often mishears the name. The server listens on 127.0.0.1 only, gives its token
(kept in `tools/devvoice/.token`, gitignored) only to the local planetarium page, and answers only requests carrying it. Screenshots are kept in `tools/devvoice/shots/` (gitignored).
