// render/transients.js: draws the objects of js/variables.js TRANSIENTS (a Cepheid in another galaxy, supernovae) as stars of their
// model brightness at the current instant, and makes them clickable ({kind: 'tr', id}). Nothing is drawn before a supernova explodes.

import { mulMV } from '../astro.js';
import { state } from '../state.js';
import { projectHor } from '../camera.js';
import { addPick } from '../picks.js';
import { R } from './proj.js';
import { drawStarPoint } from './stars.js';
import { TRANSIENTS, transientMag, transientEqj, jdOf } from '../variables.js';

const p = [0, 0];
export function drawTransients(ctx) {
  const { frame, sky, labels } = R, jd = jdOf(state.timeMs);
  for (const o of TRANSIENTS) {
    const m = transientMag(o, jd);
    if (m == null) continue;
    const h = mulMV(frame.Mjh, transientEqj(o.id, frame));
    if (R.ground && h[2] < 0) continue;
    if (!projectHor(h, p)) continue;
    // not held to the depth of the star tiles loaded (M31 V1 is 19th magnitude, and needs no online Gaia stars to be seen): the sky's own limit
    const dm = Math.max(sky.limMag, Math.min(sky.physical, sky.glare)) - m;
    if (dm <= 0) continue;
    const r = drawStarPoint(ctx, p[0], p[1], dm, o.kind === 'sn' ? 0.2 : 0.7);
    addPick(p[0], p[1], Math.max(r, 3), m, { kind: 'tr', id: o.id });
    if (state.show.starNames && dm > 1) labels.add(p[0], p[1], o.name, 'starDim', 50, { gap: r + 4 });
  }
}
