// point/fusion.js: what the sensors say -> where the phone points. Pure (times are passed in), tested in tools/check-point.mjs.
// Motion comes from the RELATIVE attitude (gyroscope and gravity; its zero of azimuth is arbitrary and it knows nothing of north).
// North is one slowly changing number, the azimuth offset: from a calibration if there is one, else from the compass.

import { OneEuro, qRot, qMean, qAngle, wrap, corrected, headingOffset, absoluteOffset, fix, altOf, azOf, RAD, DEG } from './math.js';

export const GAP_MS = 3000;                // no data for so long: the relative frame may have started afresh
export const MAX_ACC = 30;                 // degrees: a compass that says it is worse than this is not used
export const MAX_PITCH = 6;                // degrees: more tilt error than that means another object was sighted
export const AGE_MS = 10 * 60000;          // then a quiet "recalibrate"

export class Fusion {
  constructor() { this.filter = new OneEuro(); this.decl = 0; this.reset(); this.cal = null; }
  /** The relative frame has begun again (sensors restarted): north must be found again. A calibration lives on only as a correction to the compass. */
  reset() {
    this.filter.reset(); this.q = null; this.raw = null; this.t = 0; this.ring = [];
    this.comp = null; this.acc = null; this.seed = []; this.seedAt = 0; this.compAt = 0; this.odd = 0; this.sawCompass = false;
    if (this.cal) { this.cal.stale = true; this.cal.drift = 0; }
  }
  addRelative(q, t) {
    if (this.raw && t - this.t > GAP_MS) this.reset();
    if (this.raw && t <= this.t) return;
    this.t = t; this.raw = q; this.q = this.filter.push(q, t);
    this.ring.push({ q, t }); while (this.ring.length && t - this.ring[0].t > 1500) this.ring.shift();
  }
  get speed() { return this.filter.speed || 0; }
  /** iOS: magnetic heading of the top edge, with the accuracy it states (negative = not valid). */
  addHeading(magnetic, acc, t) {
    this.sawCompass = acc >= 0 || this.sawCompass;
    if (!this.raw) return;
    this.acc = acc;
    if (!(acc >= 0) || acc > MAX_ACC || this.speed > 40) return;
    const o = headingOffset(this.raw, magnetic + this.decl);
    if (o !== null) this.offset(o, t);
  }
  /** Android: an attitude whose north is magnetic north. No accuracy is stated. */
  addAbsolute(qAbs, t) {
    if (!this.raw) return;
    this.sawCompass = true;
    if (this.speed > 20) return;
    this.offset(absoluteOffset(qAbs, this.raw) + this.decl, t);
  }
  offset(o, t) {
    o = wrap(o);
    if (this.comp === null) {
      this.seed.push(o); if (this.seed.length === 1) this.seedAt = t;
      if (this.seed.length >= 12 && t - this.seedAt >= 350) { let s = 0, c = 0; for (const a of this.seed) { s += Math.sin(a * DEG); c += Math.cos(a * DEG); } this.comp = Math.atan2(s, c) * RAD; this.compFrom = t; this.compAt = t; this.seed = []; }
      return;
    }
    const d = wrap(o - this.comp), dt = Math.min(0.2, Math.max(0, (t - this.compAt) / 1000)); this.compAt = t;
    // a jump: a magnet, a car, a compass that has just been put right. Believe it only when it has lasted
    if (Math.abs(d) > 25) { if (!this.odd) this.odd = t; if (t - this.odd > 4000) { this.comp = null; this.seed = []; this.odd = 0; } return; }
    this.odd = 0;
    const tau = t - this.compFrom < 4000 ? 1.5 : 8;
    this.comp = wrap(this.comp + d * (1 - Math.exp(-dt / tau)));
    if (this.cal && !this.cal.stale && this.cal.comp !== null) this.cal.drift = wrap(this.comp - this.cal.comp);
  }
  /** Azimuth offset in force, or null: direction not known. */
  get yaw() {
    const c = this.cal;
    if (c && !c.stale) return c.yaw;
    if (this.comp === null) return null;
    return c && c.bias !== null ? wrap(this.comp + c.bias) : this.comp;
  }
  /** 'none' no data · 'searching' compass not settled · 'nocompass' · 'rough' · 'calibrated' · 'stale' (calibrated before the sensors restarted) */
  status(now) {
    if (!this.raw) return 'none';
    if (this.cal && !this.cal.stale) return 'calibrated';
    if (this.comp === null) return this.sawCompass ? 'searching' : 'nocompass';
    return this.cal && this.cal.bias !== null ? 'stale' : 'rough';
  }
  /** Time to calibrate again? (old, or the compass has wandered from what it was at the fix) */
  tired(now) { const c = this.cal; return !!c && (c.stale || now - c.t > AGE_MS || Math.abs(c.drift || 0) > 12); }
  /** Attitude device -> ENU with everything applied, or null. */
  attitude() {
    const y = this.yaw;
    if (!this.q || y === null) return null;
    const c = this.cal;
    return c ? corrected(this.q, y, c.pitch, c.about) : corrected(this.q, y, 0, null);
  }
  /** The half second before a tap (the tap itself shakes the phone): {q} or {err}. */
  still(tap) {
    const w = this.ring.filter((s) => s.t >= tap - 620 && s.t <= tap - 90);
    if (w.length < 6 || w[w.length - 1].t - w[0].t < 300) return { err: 'nodata' };
    const q = qMean(w.map((s) => s.q)); let worst = 0;
    for (const s of w) worst = Math.max(worst, qAngle(q, s.q));
    return worst > 1.2 ? { err: 'moving', worst } : { q, worst, n: w.length };
  }
  /** The object at ENU direction `target` was on the phone axis `axis` just before `tap`. {ok, yaw, pitch, change} or {err, pitch}. */
  calibrate(axis, target, tap) {
    const s = this.still(tap);
    if (s.err) return s;
    const f = fix(s.q, axis, target);
    if (Math.abs(f.pitch) > MAX_PITCH) return { err: 'pitch', pitch: f.pitch };
    const change = this.comp === null ? null : wrap(f.yaw - this.comp), was = this.yaw;
    this.cal = { yaw: f.yaw, pitch: f.pitch, about: f.about, t: tap, stale: false, comp: this.comp, bias: change, drift: 0 };
    return { ok: true, yaw: f.yaw, pitch: f.pitch, change, moved: was === null ? null : wrap(f.yaw - was), scatter: s.worst };
  }
  /** Where the phone's axis points now: {az, alt} (true north). */
  pointing(axis) { const q = this.attitude(); if (!q) return null; const v = qRot(q, axis); return { az: azOf(v), alt: altOf(v) }; }
}
