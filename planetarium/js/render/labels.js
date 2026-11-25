// render/labels.js: collects text labels during a frame and draws the ones that fit,
// highest priority first, so labels never overlap each other.

const FONT_UI = "'Source Sans 3', system-ui, sans-serif";
export const STYLES = {
  star:    { font: `500 12.5px ${FONT_UI}`, color: '#d5deea', h: 13 },
  starDim: { font: `400 11.5px ${FONT_UI}`, color: '#a9b7c8', h: 12 },
  planet:  { font: `600 13px ${FONT_UI}`, color: '#ffd9a0', h: 14 },
  moon:    { font: `500 11.5px ${FONT_UI}`, color: '#e6cfa6', h: 12 },
  con:     { font: `600 11.5px ${FONT_UI}`, color: '#7fa8d6', h: 12, spacing: '0.12em', upper: true },
  dso:     { font: `400 11.5px ${FONT_UI}`, color: '#8fd0bd', h: 12 },
  grid:    { font: `400 10.5px 'JetBrains Mono', ui-monospace, monospace`, color: '#8a9bb0', h: 11 },
  cardinal:{ font: `700 15px ${FONT_UI}`, color: '#e8b86a', h: 16 },
  cardinalMinor: { font: `600 11.5px ${FONT_UI}`, color: '#b8935a', h: 12 },
};

const widthCache = new Map();

export class LabelLayer {
  constructor() { this.items = []; }
  begin() { this.items.length = 0; }
  /** prio: larger wins. anchor: 'right' (text to the right of the point), 'center', 'below'. */
  add(x, y, text, style, prio, { anchor = 'right', gap = 6, color = null } = {}) {
    this.items.push({ x, y, text, style, prio, anchor, gap, color });
  }
  /** Reserve a rectangle so no label is drawn over it (bright discs, UI panels). */
  block(x0, y0, x1, y1) { this.items.push({ block: [x0, y0, x1, y1], prio: Infinity }); }
  /** Keep labels of the given styles (e.g. 'star', 'starDim', 'dso') off a disc; other labels may still use it. */
  blockDisc(x, y, r, styles) { this.items.push({ block: [x, y, r], only: styles, prio: Infinity }); }

  flush(ctx, w, h, haloColor = 'rgba(2,6,14,0.85)') {
    const placed = [], soft = [];
    this.items.sort((a, b) => b.prio - a.prio);
    ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    for (const it of this.items) {
      if (it.block) { if (it.only) soft.push(it); else placed.push(it.block); continue; }
      const st = STYLES[it.style];
      const text = st.upper ? it.text.toUpperCase() : it.text;
      const key = it.style + '|' + text;
      let tw = widthCache.get(key);
      if (tw === undefined) {
        ctx.font = st.font;
        if ('letterSpacing' in ctx) ctx.letterSpacing = st.spacing || '0px';
        tw = ctx.measureText(text).width;
        if (widthCache.size > 6000) widthCache.clear();
        widthCache.set(key, tw);
      }
      let x0, yc = it.y;
      if (it.anchor === 'center') x0 = it.x - tw / 2;
      else if (it.anchor === 'below') { x0 = it.x - tw / 2; yc = it.y + it.gap + st.h / 2; }
      else if (it.anchor === 'left') x0 = it.x - it.gap - tw;
      else x0 = it.x + it.gap;
      const r = [x0 - 3, yc - st.h / 2 - 2, x0 + tw + 3, yc + st.h / 2 + 2];
      if (r[2] < 0 || r[0] > w || r[3] < 0 || r[1] > h) continue;
      let hit = false;
      for (const p of placed) { if (r[0] < p[2] && r[2] > p[0] && r[1] < p[3] && r[3] > p[1]) { hit = true; break; } }
      if (!hit) for (const sb of soft) {
        if (!sb.only.includes(it.style)) continue;
        const [cx, cy, cr] = sb.block, nx = Math.max(r[0], Math.min(cx, r[2])), ny = Math.max(r[1], Math.min(cy, r[3]));
        if ((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < cr * cr) { hit = true; break; }
      }
      if (hit) continue;
      placed.push(r);
      ctx.font = st.font;
      if ('letterSpacing' in ctx) ctx.letterSpacing = st.spacing || '0px';
      // on the face of the Sun or the Moon a halo is not enough: a dark plate behind the words
      if (soft.some((sb) => sb.block.length === 3 && Math.hypot((r[0] + r[2]) / 2 - sb.block[0], yc - sb.block[1]) < sb.block[2] + (r[2] - r[0]) / 4)) { ctx.fillStyle = 'rgba(8,13,22,0.8)'; ctx.beginPath(); ctx.roundRect(r[0] - 1, r[1] - 1, r[2] - r[0] + 2, r[3] - r[1] + 2, 4); ctx.fill(); }
      ctx.strokeStyle = haloColor; ctx.lineWidth = 3;
      ctx.strokeText(text, x0, yc);
      ctx.fillStyle = it.color || st.color;
      ctx.fillText(text, x0, yc);
    }
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }
}
