// point/eye.js: the back camera, only while something is being sighted. The picture goes to a <video> on this page and nowhere else.

let stream = null, want = 0;
/** Show the back camera in `video`. Resolves 'ok' | 'denied' | 'none' | 'front' | 'gone' (closed meanwhile). Call in a tap. */
export async function openEye(video) {
  closeEye(); const me = ++want;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return 'none';
  let s;
  try { s = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: 'environment' } } }); }
  catch (e) { return e && (e.name === 'NotAllowedError' || e.name === 'SecurityError') ? 'denied' : 'none'; }
  if (me !== want) { for (const t of s.getTracks()) t.stop(); return 'gone'; }
  const t = s.getVideoTracks()[0], set = t && t.getSettings ? t.getSettings() : {};
  if (set.facingMode === 'user') { for (const x of s.getTracks()) x.stop(); return 'front'; }
  stream = s; video.muted = true; video.setAttribute('playsinline', ''); video.srcObject = s;
  try { await video.play(); } catch (e) { /* the first frame comes anyway */ }
  return 'ok';
}
/** Every track stopped at once, the picture gone. */
export function closeEye(video) {
  want++;
  if (stream) { for (const t of stream.getTracks()) t.stop(); stream = null; }
  if (video) { video.pause(); video.srcObject = null; }
}
