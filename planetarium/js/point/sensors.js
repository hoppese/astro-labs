// point/sensors.js: device orientation events -> fusion.js. Which event means what (checked 2026-11-25; sources in NOTES.md):
//  iOS, iPadOS  deviceorientation: attitude with an ARBITRARY zero of azimuth (CMMotionManager's default frame), plus webkitCompassHeading = CLHeading.magneticHeading
//               (magnetic, of the top edge in portrait) and webkitCompassAccuracy (degrees, negative = not valid). Asks: requestPermission() inside the tap.
//  Chrome on Android  deviceorientation: relative (game rotation vector, no magnetometer); deviceorientationabsolute: rotation vector, y toward magnetic north.
//  Others       deviceorientation with absolute = true: north is in it already.

import { fromAngles } from './math.js';

const good = (e) => typeof e.alpha === 'number' && typeof e.beta === 'number' && typeof e.gamma === 'number' && isFinite(e.alpha + e.beta + e.gamma);
const quat = (e) => fromAngles(e.alpha, e.beta, e.gamma);

export class Sensors {
  constructor(fusion) {
    this.f = fusion; this.on = false; this.last = 0; this.lastRel = -1e9; this.onFirst = null;
    this.rel = (e) => {
      if (!good(e)) return;
      const t = performance.now(), q = quat(e);
      this.saw(t);
      if (typeof e.webkitCompassHeading === 'number') { this.lastRel = t; this.f.addRelative(q, t); this.f.addHeading(e.webkitCompassHeading, typeof e.webkitCompassAccuracy === 'number' ? e.webkitCompassAccuracy : -1, t); return; }
      this.lastRel = t; this.f.addRelative(q, t);
      if (e.absolute === true) this.f.addAbsolute(q, t);
    };
    this.abs = (e) => {
      if (!good(e)) return;
      const t = performance.now(), q = quat(e);
      this.saw(t);
      if (t - this.lastRel > 600) this.f.addRelative(q, t);      // nothing but this one: motion comes from it too
      this.f.addAbsolute(q, t);
    };
  }
  saw(t) { this.last = t; if (this.onFirst) { const fn = this.onFirst; this.onFirst = null; fn(); } }
  start() { if (this.on) return; this.on = true; window.addEventListener('deviceorientation', this.rel); window.addEventListener('deviceorientationabsolute', this.abs); }
  stop() { if (!this.on) return; this.on = false; window.removeEventListener('deviceorientation', this.rel); window.removeEventListener('deviceorientationabsolute', this.abs); }
}

const framed = () => { try { return window.self !== window.top; } catch (e) { return true; } };
/** 'no' (nothing to offer here) | 'ask' (must be asked for in a tap) | 'probe' (listen and see) | 'blocked' (this frame may not use the sensors) */
export function capability() {
  if (!('DeviceOrientationEvent' in window) || !window.isSecureContext) return 'no';
  if (!(navigator.maxTouchPoints > 0) || !window.matchMedia('(pointer: coarse)').matches) return 'no';
  const p = document.permissionsPolicy || document.featurePolicy;
  if (framed() && p && p.allowsFeature) { try { for (const f of ['accelerometer', 'gyroscope']) if (p.features && p.features().includes(f) && !p.allowsFeature(f)) return 'blocked'; } catch (e) { /* ask the sensors themselves */ } }
  return typeof window.DeviceOrientationEvent.requestPermission === 'function' ? 'ask' : 'probe';
}
/** Resolves true when a real reading arrives within ms. */
export function probe(ms = 3000) {
  return new Promise((done) => {
    const fn = (e) => { if (good(e)) end(true); }, end = (v) => { window.removeEventListener('deviceorientation', fn); window.removeEventListener('deviceorientationabsolute', fn); clearTimeout(tm); done(v); };
    const tm = setTimeout(() => end(false), ms);
    window.addEventListener('deviceorientation', fn); window.addEventListener('deviceorientationabsolute', fn);
  });
}
/** To be called in the tap itself (no await before it). 'granted' | 'denied' */
export function askMotion() {
  const D = window.DeviceOrientationEvent;
  if (!D || typeof D.requestPermission !== 'function') return Promise.resolve('granted');
  let p; try { p = D.requestPermission(true); } catch (e) { return Promise.resolve('denied'); }      // (true: with the compass; Safari ignores it)
  const webkit = 'webkitCompassHeading' in D.prototype;
  return Promise.resolve(p).then((r) => (r === 'granted' || !webkit ? 'granted' : 'denied'), () => 'denied');      // (elsewhere a refusal of the compass alone also reads "denied": listen and see)
}
export const inFrame = framed;
export function screenAngle() {
  if (window.__pointAngle != null) return window.__pointAngle;      // the simulator
  const o = window.screen && window.screen.orientation;
  return o && typeof o.angle === 'number' ? o.angle : typeof window.orientation === 'number' ? (window.orientation + 360) % 360 : 0;
}
