// render/globe.js: draws a planet, moon or the Sun from its published map, per pixel, on its true (triaxial) figure, in a WebGL canvas that is then
// copied onto the sky. The silhouette is the exact outline of the figure and is anti-aliased by its analytic distance, so limbs stay where the
// measuring tools expect them. One draw call per body; textures are fetched when a body is large enough to need them (a small one first), decoded off
// the main thread and sent to the graphics card in strips, one a frame, so loading never stalls the picture.

import { emit } from '../state.js';
import { repaintSky } from './sky.js';

const VS = `#version 300 es
in vec2 p; uniform vec4 uBox; out vec2 s;
void main(){ s = uBox.xy + (p*0.5+0.5)*uBox.zw; gl_Position = vec4(p,0.,1.); }`;
const FS = `#version 300 es
precision highp float; precision highp int;
in vec2 s; out vec4 O;
uniform vec3 uR, uU, uV, uS, uAx;         // body-frame axes: screen right, screen up, toward us, toward the Sun; figure radii / equatorial radius
uniform vec3 uQ;                          // silhouette quadratic form: xx, 2xy, yy
uniform float uPx;                        // pixels per equatorial radius
uniform sampler2D uT0, uT1, uN, uRing;
uniform float uMix, uHas, uRelief, uLonOff, uGraphic, uGain, uDay, uSpin, uLimbU;
uniform int uLight, uKind, uNSh, uRings;
uniform vec3 uTint, uAmb, uBody;
uniform vec4 uSh[8];                      // shadows of moons: position (equatorial radii, body frame), radius
uniform float uAlphaSun, uEclDim, uMinSh;
uniform sampler2D uSpot; uniform int uNSp; uniform vec4 uSp[160]; uniform vec2 uSpSize;      // sunspot groups: 4 vec4 each (direction + strength; tile x, y, w, h; centre x, y, px per radius, flip; cos, sin)
const float PI = 3.14159265359;
vec3 toLin(vec3 c){ return pow(c, vec3(2.2)); }
float ringTau(float r){ float u = (r*60268. - 74000.)/63000.; if(u<0.||u>1.) return 0.; float t = texture(uRing, vec2(u,0.75)).r; return t*t*3.5; }
vec3 ringCol(float r, float row){ float u = (r*60268. - 74000.)/63000.; if(u<0.||u>1.) return vec3(0.); return texture(uRing, vec2(u,row)).rgb; }
vec3 tex2(sampler2D t, vec2 uv, vec2 dx, vec2 dy){ return textureGrad(t, uv, dx, dy).rgb; }
// sunlight left at P beside one moon's shadow. Umbra, penumbra and, where the shadow's point falls short of the surface (Phobos), the pale antumbra.
// A shadow too small for the screen is drawn uMinSh device pixels in radius, never darker than it is.
float shadowAt(vec4 m, vec3 P){
  vec3 d = m.xyz - P; float h = dot(d,uS); if (h < 0.) return 1.;
  float r = length(d - h*uS), k = h*uAlphaSun, w = max(m.w, uMinSh/uPx), dep = min(1., m.w*m.w/max(k*k, 1e-12));
  return 1. - dep*(1. - smoothstep(-1., 1., (r - max(w, k))/max(min(w, k), 0.75/uPx)));
}
void main(){
  float e = uQ.x*s.x*s.x + uQ.y*s.x*s.y + uQ.z*s.y*s.y;                    // < 1 inside the outline
  vec2 g = vec2(2.*uQ.x*s.x + uQ.y*s.y, 2.*uQ.z*s.y + uQ.y*s.x);
  float dist = (1. - e)/max(length(g), 1e-6)*uPx;                          // pixels inside the limb
  float cov = clamp(dist + 0.5, 0., 1.);
  vec4 globe = vec4(0.); float zg = -1e9;
  vec3 M = 1./(uAx*uAx);
  if (cov > 0.) {
    vec2 q = e > 0.9995 ? s*sqrt(0.9995/e) : s;                            // pixels on the very edge use the surface just inside it
    vec3 p0 = q.x*uR + q.y*uU;
    float a = dot(uV*M,uV), b = dot(p0*M,uV), c = dot(p0*M,p0) - 1.;
    float t = (-b + sqrt(max(b*b - a*c, 0.)))/a;
    vec3 P = p0 + t*uV; zg = t;
    vec3 n = normalize(P*M);
    float mu = max(dot(n,uV), 0.001), mu0 = dot(n,uS);
    vec3 col = uBody;
    if (uHas > 0.) {
      if (uKind == 0) {
        float lon = atan(P.y,P.x), lat = uGraphic > 0.5 ? asin(clamp(n.z,-1.,1.)) : atan(P.z, length(P.xy));
        vec2 uv = vec2(fract(lon/(2.*PI) + 0.5 + uLonOff), 0.5 - lat/PI);
        // derivatives without the jump at the date line
        vec2 uvb = vec2(fract(uv.x + 0.5), uv.y);
        vec2 dx = dFdx(uv), dy = dFdy(uv); float dxb = dFdx(uvb.x), dyb = dFdy(uvb.x);
        if (abs(dxb) < abs(dx.x)) dx.x = dxb; if (abs(dyb) < abs(dy.x)) dy.x = dyb;
        dx = clamp(dx, -0.2, 0.2); dy = clamp(dy, -0.2, 0.2);
        if (uSpin > 0.02) {
          vec3 acc = vec3(0.); vec2 ex = dx + vec2(uSpin/12., 0.);
          for (int i=0;i<12;i++) acc += tex2(uT0, vec2(uv.x + uSpin*((float(i)+0.5)/12. - 0.5), uv.y), ex, dy);
          col = acc/12.;
        } else { col = tex2(uT0, uv, dx, dy); if (uMix > 0.) col = mix(col, tex2(uT1, uv, dx, dy), uMix); }
        if (uRelief > 0.) {
          vec3 nm = textureGrad(uN, uv, dx, dy).rgb*2. - 1.;
          vec2 sl = sign(nm.xy)*nm.xy*nm.xy*0.3*uRelief;
          vec3 E = normalize(vec3(-P.y, P.x, 0.)), N = cross(n, E);
          vec3 n2 = normalize(n - sl.x*E - sl.y*N);
          float m2 = dot(n2,uS);
          // the slope shades the surface; the smooth sphere decides day and night, with the terminator roughened by the relief
          mu0 = mu0 > 0.12 ? m2 : mix(mu0, m2, smoothstep(-0.05, 0.06, mu0)) ;
          mu = max(mix(mu, dot(n2,uV), 0.6), 0.02);
        }
      } else col = texture(uT0, vec2(0.5 + 0.5*P.x, 0.5 - 0.5*P.z)).rgb;
    }
    vec3 lin = toLin(col); float L = 0.;
    float term = max(1.5*fwidth(mu0), 0.004);
    if (uLight == 3) {                                                     // the Sun: photosphere limb darkening, V band (Pierce & Slaughter form)
      // the power is the contrast of a solar picture (as for the spots below): a screen's own gamma would flatten the measured law almost to nothing
      float I = pow(0.30 + 0.93*mu - 0.23*mu*mu, 1.45);
      lin = uBody*I*mix(1., 1. + (col.r - 0.502)*1.42*uHas, 1.); L = 1.;
      vec3 Px = dFdx(P), Py = dFdy(P);
      for (int i=0;i<uNSp;i++) {                                           // spots: photographs of groups laid on the sphere, multiplied
        vec4 a0 = uSp[4*i]; if (dot(P, a0.xyz) < 0.96) continue;
        vec4 b0 = uSp[4*i+1], c0 = uSp[4*i+2], d0 = uSp[4*i+3];
        vec3 eW = normalize(vec3(-a0.y, a0.x, 0.)), eN = cross(a0.xyz, eW);
        mat2 rot = mat2(d0.x, d0.y, -d0.y, d0.x);
        vec2 q = vec2(dot(P,eW), dot(P,eN)*c0.w); q = rot*q*c0.z; vec2 t = c0.xy + vec2(q.x, -q.y);
        if (t.x < 0. || t.y < 0. || t.x > b0.z || t.y > b0.w) continue;
        vec2 gx = rot*vec2(dot(Px,eW), dot(Px,eN)*c0.w)*c0.z, gy = rot*vec2(dot(Py,eW), dot(Py,eN)*c0.w)*c0.z;
        float T = textureGrad(uSpot, (b0.xy + t)/uSpSize, vec2(gx.x,-gx.y)/uSpSize, vec2(gy.x,-gy.y)/uSpSize).r;
        T = mix(1., T, a0.w);
        lin *= pow(vec3(T), vec3(1.40, 1.5, 1.68));                        // a spot is cooler (redder); the power gives the contrast of the published pictures on a disc that fills the screen's range
      }
      lin = max(lin, 0.);
      // redder toward the limb
      lin *= vec3(1., 1. - 0.22*(1.-mu)*(1.-mu), 1. - 0.50*(1.-mu)*(1.-mu));
    } else {
      float lit = smoothstep(-term, term, mu0), m = max(mu0, 0.);
      if (uLight == 0) L = 2.*m/(m + mu)*lit;                              // Lommel-Seeliger (dark, rough surfaces: the full disc is flat)
      else if (uLight == 1) L = pow(m, 0.94)*pow(mu, -0.06)*lit;           // Minnaert (clouds)
      else if (uLight == 4) L = mix(2.*m/(m+mu), m, 0.55)*lit;             // Mars: dust and thin air
      else L = mix(2.*m/(m + mu), m, 0.6)*lit;                             // bright ice
      L = min(L, 1.7);
      for (int i=0;i<uNSh;i++) {                                           // moons' shadows
        L *= shadowAt(uSh[i], P);
      }
      if (uRings > 0 && abs(uS.z) > 1e-4) { float t2 = -P.z/uS.z; if (t2 > 0.) { float r = length((P + t2*uS).xy), w = min(fwidth(r), 0.3), T = 0.; for (int i=0;i<15;i++) T += exp(-ringTau(r + w*1.4*((float(i)+0.5)/15. - 0.5))/max(abs(uS.z), 0.02)); L *= T/15.; } }
      lin *= L*uGain*uEclDim; lin += toLin(col)*uAmb;
    }
    vec3 outc = pow(max(lin,0.), vec3(1./2.2))*uTint;
    outc = min(outc, vec3(1.)); 
    outc *= mix(1., 0.6, uDay);                                            // against a bright sky the exposure is shorter
    globe = vec4(outc, 1.)*cov;
  }
  if (uRings > 0) {
    vec4 ring = vec4(0.); float zr = -1e9;
    if (abs(uV.z) > 2e-4) {
      vec3 p0 = s.x*uR + s.y*uU; zr = -p0.z/uV.z; vec3 P = p0 + zr*uV; float r = length(P.xy);
      if (r > 1.225 && r < 2.275) {
        float w = fwidth(r); float tau = 0.; vec3 c = vec3(0.);
        int N = w > 0.004 ? 9 : 3;
        bool lit = uV.z*uS.z > 0.;                                         // which face of the rings the Sun is on: Cassini photographed both
        for (int i=0;i<N;i++) { float rr = r + w*((float(i)+0.5)/float(N) - 0.5); tau += 1. - exp(-ringTau(rr)/max(abs(uV.z), 0.02)); c += toLin(ringCol(rr, lit ? 0.125 : 0.375)); }
        float al = tau/float(N); c /= float(N);
        if (!lit) c *= 0.35;                                               // (that photograph was exposed for the dark side)
        // planet's shadow on the rings
        vec3 Q = P; float a2 = dot(uS*M,uS), b2 = dot(Q*M,uS), c2 = dot(Q*M,Q) - 1.; 
        float sh = 1.; if (b2 < 0.) { float d2 = c2 - b2*b2/a2; sh = smoothstep(-0.006, 0.006, d2); }
        for (int i=0;i<uNSh;i++) sh *= shadowAt(uSh[i], P);                // moons' shadows on the rings
        c *= sh*uGain*1.25*min(1., abs(uS.z)*30.);
        ring = vec4(min(pow(c, vec3(1./2.2))*uTint, vec3(1.)), al*mix(1., 0.4, uDay)); ring.rgb *= mix(1., 0.6, uDay);
        ring.rgb = min(ring.rgb, vec3(1.));
      }
    }
    if (zr > zg) globe = ring + globe*(1. - ring.a); else globe = globe + ring*(1. - globe.a);
  }
  O = globe;
}`;

let veil = null, gl = null, cv = null, prog = null, loc = null, failed = false;
const U = ['uBox', 'uR', 'uU', 'uV', 'uS', 'uAx', 'uQ', 'uPx', 'uT0', 'uT1', 'uN', 'uRing', 'uMix', 'uHas', 'uRelief', 'uLonOff', 'uGraphic', 'uGain', 'uDay', 'uSpin', 'uLight', 'uKind', 'uNSh', 'uRings', 'uTint', 'uAmb', 'uBody', 'uSh', 'uAlphaSun', 'uEclDim', 'uMinSh', 'uSpot', 'uNSp', 'uSp', 'uSpSize'];
function init() {
  if (gl || failed) return !!gl;
  if (typeof WebGL2RenderingContext === 'undefined') { failed = true; return false; }      // (also the Node checks)
  try {
    cv = document.createElement('canvas'); cv.width = cv.height = 16;
    gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no WebGL2');
    const sh = (t, src) => { const o = gl.createShader(t); gl.shaderSource(o, src); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    prog = gl.createProgram(); gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.bindAttribLocation(prog, 0, 'p'); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    loc = {}; for (const u of U) loc[u] = gl.getUniformLocation(prog, u);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(prog); gl.disable(gl.BLEND);
    cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); emit('gl-lost'); gl = null; texs.clear(); failed = false; emit('render'); });
  } catch (e) { console.warn('Body pictures are off:', e.message); gl = null; failed = true; }
  return !!gl;
}
export const globesWork = () => init();

// ---- textures ------------------------------------------------------------------------------------
const texs = new Map();            // file -> {state: 0 loading, 1 ready, -1 failed, tex, at}
export const globeStats = { draws: 0, ms: 0, texBytes: 0 };
function blank() { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255])); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); return t; }
let blankTex = null;
/** Ask for a picture in data/bodies/. Returns its record (maybe still loading). */
function texture(file, opts = {}) {
  let t = texs.get(file); if (t) { if (t.state === -1 && performance.now() - t.at > 20000) texs.delete(file); else return t; }
  t = { state: 0, tex: null, at: performance.now(), jobs: [] }; texs.set(file, t);
  fetch(new URL((file.includes('/') ? '../../data/' : '../../data/bodies/') + file, import.meta.url)).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.blob(); }).then(async (blob) => {
    const full = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
    t.w = full.width; t.h = full.height;
    const n = Math.max(1, Math.ceil(full.width * full.height / 600000)), hh = Math.ceil(full.height / n);
    for (let k = 0; k < n; k++) { const y = k * hh, h = Math.min(hh, full.height - y); if (h > 0) t.jobs.push({ y, bmp: n === 1 ? full : await createImageBitmap(full, 0, y, full.width, h, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }) }); }
    if (n > 1) full.close();
    queue.push({ t, opts }); emit('render');
  }).catch((e) => { t.state = -1; t.at = performance.now(); console.warn('body picture', file, e.message); });
  return t;
}
const queue = [];
/** Once a frame: send one strip of one picture to the graphics card. */
export function pumpTextures() {
  if (!queue.length || !init()) return;
  const { t, opts } = queue[0];
  if (!t.tex) {
    t.tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t.tex);
    const levels = opts.nomip ? 1 : 1 + Math.floor(Math.log2(Math.max(t.w, t.h)));
    gl.texStorage2D(gl.TEXTURE_2D, levels, gl.RGBA8, t.w, t.h);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, opts.wrap === false ? gl.CLAMP_TO_EDGE : gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, opts.nomip ? gl.LINEAR : gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    const an = gl.getExtension('EXT_texture_filter_anisotropic'); if (an && !opts.nomip) gl.texParameterf(gl.TEXTURE_2D, an.TEXTURE_MAX_ANISOTROPY_EXT, 8);
    globeStats.texBytes += t.w * t.h * 4 * (opts.nomip ? 1 : 1.33);
  }
  gl.bindTexture(gl.TEXTURE_2D, t.tex);
  const j = t.jobs.shift();
  if (j) { gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, j.y, gl.RGBA, gl.UNSIGNED_BYTE, j.bmp); j.bmp.close(); }
  if (!t.jobs.length) { if (!opts.nomip) gl.generateMipmap(gl.TEXTURE_2D); t.state = 1; t.at = performance.now(); queue.shift(); }
  emit('render');
}
/** The best picture available for a map drawn `px` device pixels in radius: {t0, t1, mix} or null. Asks for what is missing. */
export function pickMap(art, px) {
  if (!init()) return null;
  const small = art.small === false || art.kind !== 'map' ? null : texture(art.tex + '-s.webp');
  const needBig = !small || px > 75;
  const big = needBig ? texture(art.tex + '.webp', { wrap: art.kind === 'map' }) : texs.get(art.tex + '.webp');
  const bigOk = big && big.state === 1, smOk = small && small.state === 1;
  if (bigOk) {
    const m = small && smOk ? Math.min(1, (performance.now() - big.at) / 400) : 1;
    if (m < 1) { emit('render'); return { t0: small.tex, t1: big.tex, mix: m, big: false }; }
    return { t0: big.tex, t1: null, mix: 0, big: true };
  }
  return smOk ? { t0: small.tex, t1: null, mix: 0, big: false } : null;
}
export function getTex(file, opts) { if (!init()) return null; const t = texture(file, opts); return t.state === 1 ? t.tex : null; }

// the drawing buffer grows in big steps: every reallocation costs a frame
const grow = (n) => { let s = 512; while (s < n) s *= 1.5; return Math.ceil(s); };
/** Draw one body. o: {x, y (css px, centre), r (css px, equatorial radius), R, U, V, S (body-frame unit vectors), ax [1, b/a, c/a], map, relief, lonOff, graphic,
 *  light, kind, gain, tint, amb, body, day, spin (turns), shadows [[x, y, z, r]...], alphaSun, rings (texture), reach (in r), eclDim}. Returns false if it could not. */
export function drawGlobe(ctx, o, dpr, W, H) {
  if (!init()) return false;
  const t0 = performance.now();
  const reach = (o.reach || 1) * o.r + 1.5;
  // the part of the body's box that is on screen, in whole device pixels
  const x0 = Math.max(0, Math.floor((o.x - reach) * dpr)), y0 = Math.max(0, Math.floor((o.y - reach) * dpr)), x1 = Math.min(Math.ceil(W * dpr), Math.ceil((o.x + reach) * dpr)), y1 = Math.min(Math.ceil(H * dpr), Math.ceil((o.y + reach) * dpr));
  const w = x1 - x0, h = y1 - y0; if (w <= 0 || h <= 0) return true;
  if (cv.width < w || cv.height < h) { cv.width = Math.max(cv.width, grow(w)); cv.height = Math.max(cv.height, grow(h)); }
  gl.viewport(0, 0, w, h); gl.enable(gl.SCISSOR_TEST); gl.scissor(0, 0, w, h); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
  const k = 1 / (o.r * dpr), set3 = (u, v) => gl.uniform3f(loc[u], v[0], v[1], v[2]);
  // s = (right, up) in equatorial radii. uBox = lower left corner and size of the box
  gl.uniform4f(loc.uBox, (x0 - o.x * dpr) * k, (o.y * dpr - y1) * k, w * k, h * k);
  set3('uR', o.R); set3('uU', o.U); set3('uV', o.V); set3('uS', o.S); set3('uAx', o.ax);
  const M = [1 / o.ax[0] ** 2, 1 / o.ax[1] ** 2, 1 / o.ax[2] ** 2], md = (a, b) => a[0] * b[0] * M[0] + a[1] * b[1] * M[1] + a[2] * b[2] * M[2];
  const vv = md(o.V, o.V), rv = md(o.R, o.V), uv = md(o.U, o.V);
  const M2 = [md(o.R, o.R) - rv * rv / vv, 2 * (md(o.R, o.U) - rv * uv / vv), md(o.U, o.U) - uv * uv / vv];
  gl.uniform3f(loc.uQ, M2[0], M2[1], M2[2]);
  gl.uniform1f(loc.uPx, o.r * dpr);
  if (!blankTex) blankTex = blank();
  const bind = (i, t, u) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t || blankTex); gl.uniform1i(loc[u], i); };
  bind(0, o.map && o.map.t0, 'uT0'); bind(1, o.map && o.map.t1, 'uT1'); bind(2, o.relief, 'uN'); bind(3, o.rings, 'uRing'); bind(4, o.spots && o.spots.tex, 'uSpot'); gl.activeTexture(gl.TEXTURE0);
  gl.uniform1f(loc.uMix, o.map ? o.map.mix : 0); gl.uniform1f(loc.uHas, o.map ? 1 : 0); gl.uniform1f(loc.uRelief, o.relief ? 1 : 0);
  gl.uniform1f(loc.uLonOff, o.lonOff || 0); gl.uniform1f(loc.uGraphic, o.graphic ? 1 : 0); gl.uniform1f(loc.uGain, o.gain ?? 1); gl.uniform1f(loc.uDay, o.day || 0); gl.uniform1f(loc.uSpin, Math.min(1, o.spin || 0));
  gl.uniform1i(loc.uLight, { lunar: 0, gas: 1, icy: 2, sun: 3, mars: 4 }[o.light] ?? 0); gl.uniform1i(loc.uKind, o.kind === 'front' ? 1 : 0);
  set3('uTint', o.tint || [1, 1, 1]); set3('uAmb', o.amb || [0, 0, 0]); set3('uBody', o.body || [0.6, 0.6, 0.6]);
  const sh = o.shadows || [], n = Math.min(8, sh.length), a = new Float32Array(32); for (let i = 0; i < n; i++) a.set(sh[i], 4 * i);
  gl.uniform1i(loc.uNSh, n); gl.uniform4fv(loc.uSh, a); gl.uniform1f(loc.uAlphaSun, o.alphaSun || 0); gl.uniform1f(loc.uEclDim, o.eclDim ?? 1); gl.uniform1f(loc.uMinSh, (o.minShadow || 0) * dpr);
  gl.uniform1i(loc.uNSp, o.spots ? o.spots.n : 0); if (o.spots) { gl.uniform4fv(loc.uSp, o.spots.data); gl.uniform2f(loc.uSpSize, o.spots.w, o.spots.h); }
  gl.uniform1i(loc.uRings, o.rings ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  if (o.rings) {      // translucent: what is behind (stars, moons) is dimmed by the rings' own opacity, pixel by pixel, and the sky's light in front is put back
    if (!veil) veil = document.createElement('canvas');
    if (veil.width < w || veil.height < h) { veil.width = Math.max(veil.width, grow(w)); veil.height = Math.max(veil.height, grow(h)); }
    const v = veil.getContext('2d');
    v.setTransform(1, 0, 0, 1, 0, 0); v.globalCompositeOperation = 'source-over'; v.clearRect(0, 0, w + 2, h + 2); v.imageSmoothingEnabled = false;
    v.drawImage(cv, 0, cv.height - h, w, h, 0, 0, w, h);
    v.globalCompositeOperation = 'source-in'; v.setTransform(dpr, 0, 0, dpr, -x0, -y0); repaintSky(v, o.sky); v.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false; ctx.drawImage(veil, 0, 0, w, h, x0 / dpr, y0 / dpr, w / dpr, h / dpr);
  } else if (o.light !== 'sun') {      // hide what is behind: the sky again, inside the outline (an ellipse from the same quadratic form)
    const A = M2[0], B = M2[1] / 2, C = M2[2], th = 0.5 * Math.atan2(2 * B, A - C), l1 = A * Math.cos(th) ** 2 + 2 * B * Math.sin(th) * Math.cos(th) + C * Math.sin(th) ** 2, l2 = A + C - l1;
    ctx.save(); ctx.beginPath(); ctx.ellipse(o.x, o.y, o.r / Math.sqrt(l1), o.r / Math.sqrt(l2), -th, 0, 2 * Math.PI); ctx.clip(); repaintSky(ctx, o.sky); ctx.restore();
  }
  ctx.imageSmoothingEnabled = false;
  // its light is ADDED to the sky in front of it ('lighter'); the Sun's disc, dazzling, is laid over instead
  const op = ctx.globalCompositeOperation; if (o.light !== 'sun') ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(cv, 0, cv.height - h, w, h, x0 / dpr, y0 / dpr, w / dpr, h / dpr);
  ctx.globalCompositeOperation = op;
  ctx.imageSmoothingEnabled = true;
  globeStats.draws++; globeStats.ms += performance.now() - t0;
  return true;
}

// photographs drawn as they are (irregular bodies without a usable global map)
const photos = new Map();
export function photo(name) {
  if (typeof Image === 'undefined') return null;
  let p = photos.get(name); if (!p) { p = new Image(); p.src = new URL('../../data/bodies/' + name + '.webp', import.meta.url).href; p.onload = () => emit('render'); photos.set(name, p); }
  return p.complete && p.naturalWidth ? p : null;
}
