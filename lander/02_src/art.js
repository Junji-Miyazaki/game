// LANDER 描画モジュール（P2a）。ゲームロジックは持たない。すべて ctx と素のデータを受け取る純粋な描画関数。
// デザイン方針: レトロフューチャー × 2001 × Solaris × Blade Runner × Akira + 現代的ピクトグラム + Appleの抑制。
//   静かな余白 / ゆっくりしたフェード / 1画面2アクセントまで / スキャンライン・強いネオン・過剰なグロー無し。
// 性能: 静的な背景・地形は画面外キャンバス(layer)へ1回だけ描いてキャッシュ。グラデーションもキーでキャッシュ。
import { P } from './core/palette.js';

export const ART_VERSION = 1;
const AW = 360;
const AH = 640;
const ART_BTN_Y = AH - 80;     // game.js と同じ値（操作ゾーンのジオメトリは不変）
const TAU = Math.PI * 2;

export const FONT = '-apple-system, "SF Pro Display", "Helvetica Neue", "Rajdhani", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", "Noto Sans JP", "Noto Sans CJK JP", sans-serif';

// ---------------------------------------------------------------- 色ユーティリティ
function hexRGB(h) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(h));
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [0, 0, 0];
}
const _rgbaMemo = new Map();
export function rgba(hex, a) {
  a = Math.max(0, Math.min(1, a));
  const k = hex + '|' + a.toFixed(2);
  let v = _rgbaMemo.get(k);
  if (!v) { const c = hexRGB(hex); v = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a.toFixed(2) + ')'; _rgbaMemo.set(k, v); }
  return v;
}
const _mixMemo = new Map();
export function mixHex(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const k = a + b + t.toFixed(2);
  let v = _mixMemo.get(k);
  if (!v) {
    const x = hexRGB(a), y = hexRGB(b);
    const h = (i) => ('0' + Math.round(x[i] + (y[i] - x[i]) * t).toString(16)).slice(-2);
    v = '#' + h(0) + h(1) + h(2); _mixMemo.set(k, v);
  }
  return v;
}
// amt>0: 白へ / amt<0: 黒へ
export function shade(hex, amt) { return amt >= 0 ? mixHex(hex, '#ffffff', amt) : mixHex(hex, '#000000', -amt); }
const artRnd = (seed) => { let s = (seed * 9301 + 49297) % 233280; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); };

// ---------------------------------------------------------------- グラデーションのキャッシュ
const NOGRAD = { addColorStop() {} };
function mkL(c, a, b, d, e) { return c.createLinearGradient(a, b, d, e) || NOGRAD; }
function mkR(c, a, b, d, e, f, g) { return c.createRadialGradient(a, b, d, e, f, g) || NOGRAD; }
const _gc = new Map();
function gLin(ctx, key, x0, y0, x1, y1, stops) {
  let g = _gc.get(key);
  if (!g) { g = mkL(ctx, x0, y0, x1, y1); for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); _gc.set(key, g); }
  return g;
}
function gRad(ctx, key, x0, y0, r0, x1, y1, r1, stops) {
  let g = _gc.get(key);
  if (!g) { g = mkR(ctx, x0, y0, r0, x1, y1, r1); for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]); _gc.set(key, g); }
  return g;
}

// ---------------------------------------------------------------- 画面外レイヤー（静的な背景/地形のキャッシュ）
const LAYER_SCALE = 2;
const _layers = new Map();
function makeCanvas(w, h) {
  try {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    if (typeof document !== 'undefined') { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  } catch (_) { /* fall through */ }
  return null;
}
// slot ごとに1枚のキャンバスを使い回し、key が変わった時だけ再描画する
function cachedLayer(ctx, slot, key, paint) {
  let L = _layers.get(slot);
  if (L === undefined) {
    const cv = makeCanvas(AW * LAYER_SCALE, AH * LAYER_SCALE);
    L = cv ? { cv, key: null } : null;
    _layers.set(slot, L);
  }
  if (!L) { paint(ctx); return; }
  if (L.key !== key) {
    const c = L.cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, L.cv.width, L.cv.height);
    c.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, 0, 0);
    paint(c);
    L.key = key;
  }
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  try { ctx.imageSmoothingQuality = 'high'; } catch (_) { /* noop */ }
  ctx.drawImage(L.cv, 0, 0, AW, AH);
  ctx.restore();
}

// ---------------------------------------------------------------- テキスト
const ART_LS = (typeof CanvasRenderingContext2D !== 'undefined') && ('letterSpacing' in CanvasRenderingContext2D.prototype);
const _fontMemo = new Map();
function fontStr(w, size) {
  const k = w * 1000 + size;
  let f = _fontMemo.get(k);
  if (!f) { f = w + ' ' + size + 'px ' + FONT; _fontMemo.set(k, f); }
  return f;
}
const _wMemo = new Map();
function charW(ctx, font, ch) {
  const k = font + ch;
  let w = _wMemo.get(k);
  if (w === undefined) { w = ctx.measureText(ch).width; if (!(w >= 0)) w = 6; _wMemo.set(k, w); }
  return w;
}
// 幅 maxW に収まるよう末尾を省略記号にする（書記素単位）。sp=字間。テスト用ctxでも例外を出さない
export function ellipsize(ctx, s, size, wt, sp, maxW) {
  s = String(s == null ? '' : s);
  try {
    const font = fontStr(wt || 400, size);
    const wOf = (str) => { ctx.save(); ctx.font = font; const w = ctx.measureText(str).width; ctx.restore(); return (w >= 0 ? w : 0) + (sp || 0) * Math.max(0, Array.from(str).length - 1); };
    if (wOf(s) <= maxW) return s;
    const seg = (typeof Intl !== 'undefined' && Intl.Segmenter) ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment) : Array.from(s);
    let lo = 0, hi = seg.length;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (wOf(seg.slice(0, mid).join('') + '\u2026') <= maxW) lo = mid; else hi = mid - 1; }
    return lo > 0 ? seg.slice(0, lo).join('') + '\u2026' : '\u2026';
  } catch (_) { return s.slice(0, 8); }
}
// y は文字の上端（engine.text と同じ）。o: { w:太さ, sp:字間px, a:不透明度, sh:影 }
export function txt(ctx, s, x, y, size, color, align, o) {
  s = String(s == null ? '' : s);
  const wt = (o && o.w) || 400, sp = (o && o.sp) || 0;
  const font = fontStr(wt, size);
  ctx.save();
  if (o && o.a !== undefined) ctx.globalAlpha = Math.max(0, Math.min(1, (typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1) * o.a));
  ctx.font = font;
  ctx.fillStyle = color || P().fg;
  ctx.textBaseline = 'top';
  if (o && o.sh) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 8; }
  align = align || 'left';
  if (!sp) {
    ctx.textAlign = align;
    ctx.fillText(s, x, y);
  } else if (ART_LS) {
    ctx.letterSpacing = sp + 'px';
    ctx.textAlign = align;
    ctx.fillText(s, align === 'center' ? x + sp / 2 : align === 'right' ? x + sp : x, y);
  } else {
    // 字間の手動シミュレーション
    let total = 0;
    for (let i = 0; i < s.length; i++) total += charW(ctx, font, s[i]) + (i < s.length - 1 ? sp : 0);
    let cx = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x;
    ctx.textAlign = 'left';
    for (let i = 0; i < s.length; i++) { ctx.fillText(s[i], cx, y); cx += charW(ctx, font, s[i]) + sp; }
  }
  ctx.restore();
}
// 等幅スロットの数値（桁が動いてもジッターしない）。xRight=右端
export function num(ctx, s, xRight, y, size, color, o) {
  s = String(s);
  const slot = size * 0.6;
  const wt = (o && o.w) || 300;
  ctx.save();
  ctx.font = fontStr(wt, size);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  if (ART_LS) ctx.letterSpacing = '0px';
  for (let i = s.length - 1, k = 0; i >= 0; i--, k++) ctx.fillText(s[i], xRight - slot * (k + 0.5), y);
  ctx.restore();
}
export function numWidth(s, size) { return String(s).length * size * 0.6; }

// ---------------------------------------------------------------- 図形
export function rr(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}
// すりガラス風の暗い半透明パネル + ヘアライン枠
export function panel(ctx, x, y, w, h, o) {
  const p = P();
  const r = (o && o.r !== undefined) ? o.r : 14;
  const a = (o && o.a !== undefined) ? o.a : 0.74;
  ctx.save();
  rr(ctx, x, y, w, h, r);
  ctx.fillStyle = rgba('#080b14', a); ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = rgba((o && o.border) || p.fg, (o && o.ba !== undefined) ? o.ba : 0.16); ctx.stroke();
  // 上端のごく薄いハイライト
  ctx.beginPath();
  ctx.moveTo(x + r, y + 0.5); ctx.lineTo(x + w - r, y + 0.5);
  ctx.strokeStyle = rgba('#ffffff', 0.10); ctx.stroke();
  ctx.restore();
}
export function pill(ctx, x, y, w, h, fill, stroke, lw) {
  ctx.save();
  rr(ctx, x, y, w, h, h / 2);
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.lineWidth = lw || 1; ctx.strokeStyle = stroke; ctx.stroke(); }
  ctx.restore();
}
export function hair(ctx, x0, y0, x1, y1, color, a) {
  ctx.save(); ctx.strokeStyle = rgba(color || P().fg, a === undefined ? 0.14 : a); ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
}

// ================================================================ ピクトグラム（ベクトル線画）
function strokeStyleSet(ctx, color, lw) { ctx.strokeStyle = color; ctx.lineWidth = lw || 1.3; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; }
export function icoFuel(ctx, cx, cy, s, color) {      // しずく
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.bezierCurveTo(cx + s * 0.2, cy - s * 0.5, cx + s * 0.75, cy - s * 0.05, cx + s * 0.75, cy + s * 0.32);
  ctx.arc(cx, cy + s * 0.32, s * 0.75, 0, Math.PI, false);
  ctx.bezierCurveTo(cx - s * 0.75, cy - s * 0.05, cx - s * 0.2, cy - s * 0.5, cx, cy - s);
  ctx.stroke(); ctx.restore();
}
export function icoDown(ctx, cx, cy, s, color) {      // 垂直速度: 下向き矢印
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy + s);
  ctx.moveTo(cx - s * 0.6, cy + s * 0.4); ctx.lineTo(cx, cy + s); ctx.lineTo(cx + s * 0.6, cy + s * 0.4);
  ctx.stroke(); ctx.restore();
}
export function icoSide(ctx, cx, cy, s, color) {      // 水平速度: 左右矢印
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.beginPath(); ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy);
  ctx.moveTo(cx + s * 0.4, cy - s * 0.6); ctx.lineTo(cx + s, cy); ctx.lineTo(cx + s * 0.4, cy + s * 0.6);
  ctx.moveTo(cx - s * 0.4, cy - s * 0.6); ctx.lineTo(cx - s, cy); ctx.lineTo(cx - s * 0.4, cy + s * 0.6);
  ctx.stroke(); ctx.restore();
}
export function icoAngle(ctx, cx, cy, s, color, angDeg) {   // 傾き: 実角度で傾くバー + 基準の水平ティック
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.globalAlpha *= 0.35;
  ctx.beginPath(); ctx.moveTo(cx - s, cy + s * 0.9); ctx.lineTo(cx + s, cy + s * 0.9); ctx.stroke();
  ctx.globalAlpha /= 0.35;
  const a = Math.max(-70, Math.min(70, angDeg || 0)) * Math.PI / 180;
  ctx.translate(cx, cy); ctx.rotate(a);
  ctx.lineWidth = 2.2;
  ctx.beginPath(); ctx.moveTo(0, -s * 0.85); ctx.lineTo(0, s * 0.45); ctx.stroke();
  ctx.restore();
}
export function icoSpin(ctx, cx, cy, s, color) {      // 角速度: 円弧矢印
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.beginPath(); ctx.arc(cx, cy, s * 0.85, -2.4, 0.8, false); ctx.stroke();
  const ex = cx + Math.cos(0.8) * s * 0.85, ey = cy + Math.sin(0.8) * s * 0.85;
  ctx.beginPath(); ctx.moveTo(ex + 3.2, ey - 1.2); ctx.lineTo(ex, ey); ctx.lineTo(ex - 0.6, ey - 3.6); ctx.stroke();
  ctx.restore();
}
export function icoWind(ctx, cx, cy, len, dir, color) {   // 風: 矢印 + 流線
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  const h = len / 2;
  ctx.beginPath(); ctx.moveTo(cx - dir * h, cy); ctx.lineTo(cx + dir * h, cy);
  ctx.moveTo(cx + dir * (h - 4.5), cy - 3.4); ctx.lineTo(cx + dir * h, cy); ctx.lineTo(cx + dir * (h - 4.5), cy + 3.4);
  ctx.stroke();
  ctx.globalAlpha *= 0.5; ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - dir * (h - 2), cy - 4.5); ctx.lineTo(cx - dir * (h - 2) + dir * Math.min(10, len * 0.4), cy - 4.5);
  ctx.moveTo(cx - dir * (h - 2), cy + 4.5); ctx.lineTo(cx - dir * (h - 2) + dir * Math.min(14, len * 0.5), cy + 4.5);
  ctx.stroke();
  ctx.restore();
}
export function icoShipMini(ctx, cx, cy, s, color) {  // 残機: 小さな船のシルエット
  ctx.save();
  ctx.fillStyle = color;
  rr(ctx, cx - 3 * s, cy - 4.5 * s, 6 * s, 8 * s, 3 * s); ctx.fill();
  ctx.fillStyle = rgba('#06080E', 0.85);
  ctx.beginPath(); ctx.arc(cx, cy - 1.5 * s, 1.6 * s, 0, TAU); ctx.fill();
  strokeStyleSet(ctx, color, 1);
  ctx.beginPath(); ctx.moveTo(cx - 2.6 * s, cy + 3 * s); ctx.lineTo(cx - 4.6 * s, cy + 5.6 * s);
  ctx.moveTo(cx + 2.6 * s, cy + 3 * s); ctx.lineTo(cx + 4.6 * s, cy + 5.6 * s); ctx.stroke();
  ctx.restore();
}
// モジュールの小グリフ（id: fuel/stab/shock/radar/shield）
export function drawModuleGlyph(ctx, id, cx, cy, s, color) {
  ctx.save(); strokeStyleSet(ctx, color, 1.3);
  ctx.beginPath();
  if (id === 'fuel') {
    ctx.moveTo(cx, cy - s); ctx.bezierCurveTo(cx + s * 0.1, cy - s * 0.5, cx + s * 0.7, cy - s * 0.1, cx + s * 0.7, cy + s * 0.3);
    ctx.arc(cx, cy + s * 0.3, s * 0.7, 0, Math.PI, false);
    ctx.bezierCurveTo(cx - s * 0.7, cy - s * 0.1, cx - s * 0.1, cy - s * 0.5, cx, cy - s);
    ctx.moveTo(cx - s * 0.25, cy + s * 0.3); ctx.lineTo(cx + s * 0.25, cy + s * 0.3);
    ctx.moveTo(cx, cy + s * 0.05); ctx.lineTo(cx, cy + s * 0.55);
  } else if (id === 'stab') {
    ctx.arc(cx, cy, s * 0.8, 0, TAU);
    ctx.moveTo(cx - s * 1.0, cy); ctx.lineTo(cx + s * 1.0, cy);
    ctx.moveTo(cx, cy - s * 0.8); ctx.lineTo(cx, cy + s * 0.8);
  } else if (id === 'shock') {
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx, cy - s * 0.6);
    ctx.lineTo(cx - s * 0.6, cy - s * 0.3); ctx.lineTo(cx + s * 0.6, cy + 0.0); ctx.lineTo(cx - s * 0.6, cy + s * 0.3);
    ctx.lineTo(cx, cy + s * 0.6); ctx.lineTo(cx, cy + s);
  } else if (id === 'radar') {
    ctx.arc(cx, cy + s * 0.5, s * 1.0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(cx + s * 0.62, cy + s * 0.5 - s * 0.2); ctx.arc(cx, cy + s * 0.5, s * 0.55, Math.PI * 1.1, Math.PI * 1.9);
    ctx.moveTo(cx + 0.1, cy + s * 0.5); ctx.arc(cx, cy + s * 0.5, 0.6, 0, TAU);
  } else if (id === 'shield') {
    ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s * 0.8, cy - s * 0.55); ctx.lineTo(cx + s * 0.7, cy + s * 0.2);
    ctx.quadraticCurveTo(cx + s * 0.4, cy + s * 0.75, cx, cy + s); ctx.quadraticCurveTo(cx - s * 0.4, cy + s * 0.75, cx - s * 0.7, cy + s * 0.2);
    ctx.lineTo(cx - s * 0.8, cy - s * 0.55); ctx.closePath();
  } else {
    ctx.arc(cx, cy, s * 0.6, 0, TAU);
  }
  ctx.stroke(); ctx.restore();
}

// ================================================================ 背景（空・天体・星）
const SKYOBJ = {
  earth:    { x: 270, y: 178, r: 19 },
  jupiter:  { x: 252, y: 226, r: 78 },
  jupiterIo: { x: 84, y: 214, r: 58 },
  phobos:   { x: 268, y: 160, r: 9 },
  saturn:   { x: 248, y: 182, r: 22 },
  'sun-glow': { x: 208, y: 168, r: 150 },
};
function skyObjFor(body) {
  const k = body.visual.skyObject;
  return (body.id === 'io' && k === 'jupiter') ? SKYOBJ.jupiterIo : SKYOBJ[k];
}
export function isVacuum(body) { return body.atmoType === 'none' || body.atmoType === 'trace'; }

function paintEarth(c, o) {
  const { x, y, r } = o;
  const g0 = mkR(c, x, y, r * 0.9, x, y, r * 1.5);
  g0.addColorStop(0, 'rgba(130,185,255,0.30)'); g0.addColorStop(1, 'rgba(130,185,255,0)');
  c.fillStyle = g0; c.fillRect(x - r * 1.6, y - r * 1.6, r * 3.2, r * 3.2);
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  const og = mkL(c, x - r, y - r, x + r, y + r);
  og.addColorStop(0, '#2a68a8'); og.addColorStop(1, '#0f2f5a');
  c.fillStyle = og; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = 'rgba(86,140,96,0.85)';                      // 大陸
  c.beginPath(); c.moveTo(x - r * 0.5, y - r * 0.5); c.quadraticCurveTo(x - r * 0.1, y - r * 0.8, x + r * 0.15, y - r * 0.3);
  c.quadraticCurveTo(x - r * 0.1, y + r * 0.05, x - r * 0.25, y + r * 0.45); c.quadraticCurveTo(x - r * 0.6, y + r * 0.2, x - r * 0.5, y - r * 0.5); c.fill();
  c.beginPath(); c.moveTo(x + r * 0.3, y + r * 0.1); c.quadraticCurveTo(x + r * 0.7, y + r * 0.0, x + r * 0.62, y + r * 0.5);
  c.quadraticCurveTo(x + r * 0.4, y + r * 0.6, x + r * 0.3, y + r * 0.1); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.40)';                    // 雲
  c.beginPath(); c.ellipse(x + r * 0.05, y - r * 0.15, r * 0.7, r * 0.1, -0.3, 0, TAU); c.fill();
  c.beginPath(); c.ellipse(x - r * 0.2, y + r * 0.5, r * 0.55, r * 0.09, 0.2, 0, TAU); c.fill();
  const tg = mkR(c, x - r * 0.45, y - r * 0.25, r * 0.4, x - r * 0.45, y - r * 0.25, r * 1.7);   // 明暗境界
  tg.addColorStop(0, 'rgba(0,0,12,0)'); tg.addColorStop(0.6, 'rgba(0,0,12,0.35)'); tg.addColorStop(1, 'rgba(0,0,12,0.85)');
  c.fillStyle = tg; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.restore();
  c.strokeStyle = 'rgba(170,210,255,0.45)'; c.lineWidth = 0.8;
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
}
const JUP_BANDS = [
  [-0.95, 0.2, '#b79067'], [-0.75, 0.14, '#d9bd96'], [-0.58, 0.18, '#9c7350'], [-0.38, 0.12, '#dcc3a0'], [-0.22, 0.2, '#a97d58'],
  [0.0, 0.1, '#e2c9a5'], [0.1, 0.2, '#9a6d49'], [0.32, 0.12, '#d8bb94'], [0.46, 0.18, '#b48962'], [0.66, 0.14, '#d3b48e'], [0.82, 0.2, '#9d7652'],
];
function paintJupiter(c, o, dimA) {
  const { x, y, r } = o;
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  c.fillStyle = '#c9a57c'; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.translate(x, y); c.rotate(-0.05);
  for (let b = 0; b < JUP_BANDS.length; b++) {
    const bd = JUP_BANDS[b];
    c.fillStyle = bd[2];
    c.beginPath();
    for (let px = -r; px <= r; px += 8) { const yy = r * bd[0] + 1.6 * Math.sin(px * 0.07 + bd[0] * 9); if (px === -r) c.moveTo(px, yy); else c.lineTo(px, yy); }
    for (let px = r; px >= -r; px -= 8) c.lineTo(px, r * (bd[0] + bd[1]) + 1.6 * Math.sin(px * 0.07 + bd[0] * 9 + 1));
    c.closePath(); c.fill();
  }
  c.fillStyle = 'rgba(176,84,58,0.85)';                       // 大赤斑のヒント
  c.beginPath(); c.ellipse(-r * 0.28, r * 0.34, r * 0.15, r * 0.085, 0, 0, TAU); c.fill();
  c.strokeStyle = 'rgba(230,200,170,0.4)'; c.lineWidth = 0.8;
  c.beginPath(); c.ellipse(-r * 0.28, r * 0.34, r * 0.19, r * 0.11, 0, 0, TAU); c.stroke();
  c.restore();
  c.save();
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  const lg = mkR(c, x - r * 0.25, y - r * 0.2, r * 0.3, x - r * 0.25, y - r * 0.2, r * 1.25);   // 周縁減光
  lg.addColorStop(0, 'rgba(4,6,14,0)'); lg.addColorStop(0.55, 'rgba(4,6,14,0.2)'); lg.addColorStop(1, 'rgba(4,6,14,0.8)');
  c.fillStyle = lg; c.fillRect(x - r, y - r, r * 2, r * 2);
  c.fillStyle = 'rgba(4,6,14,' + dimA + ')'; c.fillRect(x - r, y - r, r * 2, r * 2);     // 全体を沈めてHUDの可読性を確保
  c.restore();
}
function paintSaturn(c, o) {
  const { x, y, r } = o;
  c.save(); c.globalAlpha = 0.5;                              // 霞の向こう
  const ring = (a0, a1, wd, col) => { c.strokeStyle = col; c.lineWidth = wd; c.beginPath(); c.ellipse(x, y, r * 2.3, r * 0.62, -0.32, a0, a1); c.stroke(); };
  ring(Math.PI, TAU, 4, 'rgba(226,200,150,0.55)');
  const g = mkR(c, x - r * 0.3, y - r * 0.3, r * 0.2, x, y, r);
  g.addColorStop(0, '#ead2a0'); g.addColorStop(1, '#8c6a36');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.fillStyle = 'rgba(120,80,30,0.25)'; c.fillRect(x - r, y - r * 0.15, r * 2, r * 0.25);
  ring(0, Math.PI, 4, 'rgba(236,212,164,0.7)'); ring(0, Math.PI, 1, 'rgba(80,50,20,0.5)');
  c.restore();
}
function paintPhobos(c, o) {
  const { x, y, r } = o;
  c.save(); c.translate(x, y); c.rotate(-0.3);
  const g = mkR(c, -r * 0.3, -r * 0.3, 1, 0, 0, r * 1.3);
  g.addColorStop(0, '#9a8a7a'); g.addColorStop(1, '#4a3c34');
  c.fillStyle = g;
  c.beginPath();
  const pts = [[1.2, 0.0], [0.9, 0.55], [0.2, 0.8], [-0.6, 0.65], [-1.15, 0.1], [-0.9, -0.55], [-0.1, -0.8], [0.7, -0.55]];
  for (let i = 0; i < pts.length; i++) { const px = pts[i][0] * r, py = pts[i][1] * r * 0.85; if (i === 0) c.moveTo(px, py); else c.lineTo(px, py); }
  c.closePath(); c.fill();
  c.fillStyle = 'rgba(30,20,16,0.35)';
  c.beginPath(); c.arc(r * 0.25, -r * 0.05, r * 0.28, 0, TAU); c.fill();
  c.beginPath(); c.arc(-r * 0.4, r * 0.2, r * 0.16, 0, TAU); c.fill();
  c.restore();
  c.fillStyle = 'rgba(255,230,200,0.7)'; c.fillRect(x - 70, y - 38, 1.5, 1.5);   // Deimos
}
function paintSunGlow(c, o) {
  const { x, y, r } = o;
  const g = mkR(c, x, y, 0, x, y, r);
  g.addColorStop(0, 'rgba(255,236,176,0.62)'); g.addColorStop(0.25, 'rgba(255,196,110,0.34)'); g.addColorStop(1, 'rgba(255,150,60,0)');
  c.fillStyle = g; c.fillRect(0, 0, AW, AH);
  c.fillStyle = 'rgba(70,24,6,0.16)';                         // 雲の筋
  for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(60 + i * 58, 70 + (i % 3) * 80, 120, 7 + (i % 2) * 4, 0.04, 0, TAU); c.fill(); }
}
// TERRA（ボーナス専用）の昼空: 柔らかい青のグラデーション + やさしい太陽光 + 遠い海の水平線。雲は drawBackdrop が毎フレーム流す。
function paintDaySky(c, body) {
  const v = body.visual;
  const g = mkL(c, 0, 0, 0, 400);
  g.addColorStop(0, v.sky[0]); g.addColorStop(1, v.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, AW, AH);
  const sun = mkR(c, 262, 168, 4, 262, 168, 190);                 // 太陽の光（やわらかく、まぶしくしない）
  sun.addColorStop(0, 'rgba(255,250,225,0.80)'); sun.addColorStop(0.12, 'rgba(255,244,200,0.40)'); sun.addColorStop(1, 'rgba(255,240,190,0)');
  c.fillStyle = sun; c.fillRect(0, 0, AW, 420);
  c.fillStyle = 'rgba(255,252,236,0.85)'; c.beginPath(); c.arc(262, 168, 11, 0, TAU); c.fill();
  const hz = mkL(c, 0, 330, 0, 396);                              // 水平線の霞
  hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, 'rgba(235,246,252,0.55)');
  c.fillStyle = hz; c.fillRect(0, 330, AW, 66);
  const oc = mkL(c, 0, 396, 0, 520);                              // 遠い海
  oc.addColorStop(0, '#7fb6dc'); oc.addColorStop(1, '#2d6ca4');
  c.fillStyle = oc; c.fillRect(0, 396, AW, AH - 396);
  c.fillStyle = 'rgba(255,248,215,0.30)';                        // 太陽の反射
  for (let i = 0; i < 6; i++) c.fillRect(262 - 22 + i * 7 - (i % 2) * 6, 398 + i * 8, 26 - i * 2, 1.4);
  c.strokeStyle = 'rgba(240,250,255,0.55)'; c.lineWidth = 1;     // 水平線
  c.beginPath(); c.moveTo(0, 396.5); c.lineTo(AW, 396.5); c.stroke();
  const top = mkL(c, 0, 0, 0, 150);                              // 上部HUDの可読性のため上端を沈める
  top.addColorStop(0, 'rgba(10,32,64,0.58)'); top.addColorStop(0.7, 'rgba(10,32,64,0.2)'); top.addColorStop(1, 'rgba(10,32,64,0)');
  c.fillStyle = top; c.fillRect(0, 0, AW, 150);
}
function drawClouds(ctx, t) {
  const defs = [[40, 150, 1.0, 5], [190, 214, 1.3, 3.5], [300, 128, 0.8, 4.5], [110, 290, 1.1, 2.8], [250, 340, 0.9, 3.2]];
  ctx.save();
  for (let i = 0; i < defs.length; i++) {
    const d = defs[i], span = AW + 180;
    const x = ((d[0] + 90 + t * d[3]) % span + span) % span - 90;
    const y = d[1] + Math.sin(t * 0.07 + i * 2) * 2, s = d[2];
    ctx.fillStyle = 'rgba(255,255,255,0.20)';                      // 影側
    for (const e of [[0, 4, 26, 7], [-18, 1, 17, 6], [16, 2, 19, 6]]) { ctx.beginPath(); ctx.ellipse(x + e[0] * s, y + e[1] * s + 2, e[2] * s, e[3] * s, 0, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(255,255,255,0.62)';
    for (const e of [[0, 2, 24, 6.5], [-14, -3, 14, 7], [10, -5, 16, 8], [24, 3, 12, 4.5]]) { ctx.beginPath(); ctx.ellipse(x + e[0] * s, y + e[1] * s, e[2] * s, e[3] * s, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
}
function paintSky(c, body) {
  const v = body.visual;
  if (v.skyObject === 'day') { paintDaySky(c, body); return; }
  const g = mkL(c, 0, 0, 0, AH * 0.82);
  g.addColorStop(0, v.sky[0]); g.addColorStop(1, v.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, AW, AH);
  if (!isVacuum(body)) {                                      // 大気のある天体は地平に淡い光
    const hg = mkR(c, AW / 2, 470, 10, AW / 2, 470, 260);
    hg.addColorStop(0, rgba(v.accent, 0.20)); hg.addColorStop(1, rgba(v.accent, 0));
    c.fillStyle = hg; c.fillRect(0, 200, AW, 400);
  }
  const o = skyObjFor(body);
  switch (v.skyObject) {
    case 'earth': paintEarth(c, o); break;
    case 'jupiter': paintJupiter(c, o, body.id === 'io' ? 0.46 : 0.42); break;
    case 'saturn': paintSaturn(c, o); break;
    case 'phobos': paintPhobos(c, o); break;
    case 'sun-glow': paintSunGlow(c, o); break;
    default: break;
  }
}
export function drawBackdrop(ctx, body, t, stars) {
  cachedLayer(ctx, 'sky', body.id, (c) => paintSky(c, body));
  if (body.visual.skyObject === 'day') { drawClouds(ctx, t); return; }
  if (!isVacuum(body) || !stars) return;
  const o = skyObjFor(body);
  ctx.save();
  ctx.fillStyle = P().hi;
  const n = Math.min(30, stars.length);
  for (let i = 0; i < n; i++) {
    const s = stars[i];
    if (o) { const dx = s.x - o.x, dy = s.y - o.y; if (dx * dx + dy * dy < (o.r + 6) * (o.r + 6)) continue; }
    const tw = 0.62 + 0.38 * Math.sin(t * 0.5 + i * 1.7);
    ctx.globalAlpha = (s.r > 1 ? 0.62 : 0.4) * tw;
    const sz = s.r > 1 ? 1.5 : 1;
    ctx.fillRect(s.x, s.y, sz, sz);
  }
  ctx.restore();
}

// ================================================================ 地形（3層のシルエット + リムライト）
function ridge(c, y0, amp1, amp2, ph1, ph2, fillStyle, rim, rimA) {
  c.beginPath();
  c.moveTo(0, AH);
  for (let x = 0; x <= AW; x += 12) c.lineTo(x, y0 + amp1 * Math.sin(x * 0.021 + ph1) + amp2 * Math.sin(x * 0.057 + ph2));
  c.lineTo(AW, AH); c.closePath();
  c.fillStyle = fillStyle; c.fill();
  c.beginPath();
  for (let x = 0; x <= AW; x += 12) { const y = y0 + amp1 * Math.sin(x * 0.021 + ph1) + amp2 * Math.sin(x * 0.057 + ph2); if (x === 0) c.moveTo(x, y); else c.lineTo(x, y); }
  c.strokeStyle = rgba(rim, rimA); c.lineWidth = 0.8; c.stroke();
}
function paintTerrain(c, body, pts) {
  const v = body.visual;
  const R = artRnd(Math.floor(pts[3].y * 97 + pts[8].y * 31 + pts[12].y * 7));
  const ph1 = R() * 6, ph2 = R() * 6, ph3 = R() * 6, ph4 = R() * 6;
  const sky1 = v.sky[1];
  // 奥の層（空気遠近: 空色に寄せる）
  ridge(c, 408, 20, 9, ph1, ph2, mixHex(v.ground, sky1, 0.74), v.rim, 0.20);
  ridge(c, 448, 16, 8, ph3, ph4, mixHex(v.ground, sky1, 0.42), v.rim, 0.32);
  // 手前（実際の地形ポリライン）
  const gTop = shade(v.ground, 0.10), gBot = shade(v.ground, -0.55);
  const fg = mkL(c, 0, 430, 0, AH);
  fg.addColorStop(0, gTop); fg.addColorStop(1, gBot);
  c.beginPath(); c.moveTo(0, AH);
  for (let i = 0; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
  c.lineTo(AW, AH); c.closePath();
  c.fillStyle = fg; c.fill();
  // 質感（天体ごと）
  c.save();
  c.beginPath(); c.moveTo(0, AH); for (let i = 0; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.lineTo(AW, AH); c.closePath(); c.clip();
  const T = artRnd(Math.floor(pts[5].y * 13 + 5));
  if (body.id === 'europa') {                                   // ひび割れ
    c.strokeStyle = 'rgba(40,70,92,0.45)'; c.lineWidth = 0.8;
    for (let k = 0; k < 7; k++) {
      let x = T() * AW, y = 470 + T() * 140; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 6; s++) { x += (T() - 0.3) * 38; y += (T() - 0.5) * 20; c.lineTo(x, y); }
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.28)';
    for (let k = 0; k < 4; k++) { let x = T() * AW, y = 480 + T() * 120; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 20 + T() * 30, y + (T() - 0.5) * 10); c.stroke(); }
  } else if (body.id === 'io') {                                 // 溶岩の筋
    c.strokeStyle = 'rgba(255,106,26,0.45)'; c.lineWidth = 0.9;
    for (let k = 0; k < 5; k++) {
      let x = T() * AW, y = 490 + T() * 110; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 5; s++) { x += (T() - 0.4) * 30; y += (T() - 0.5) * 14; c.lineTo(x, y); }
      c.stroke();
    }
  } else if (body.id === 'venus') {                              // 灼熱の亀裂
    c.strokeStyle = 'rgba(255,120,30,0.38)'; c.lineWidth = 0.9;
    for (let k = 0; k < 6; k++) {
      let x = T() * AW, y = 480 + T() * 120; c.beginPath(); c.moveTo(x, y);
      for (let s = 0; s < 4; s++) { x += (T() - 0.5) * 34; y += (T() - 0.3) * 16; c.lineTo(x, y); }
      c.stroke();
    }
  } else if (body.id === 'moon') {                               // クレーター
    for (let k = 0; k < 9; k++) {
      const x = T() * AW, y = 470 + T() * 130, rx = 7 + T() * 18;
      c.fillStyle = 'rgba(0,0,0,0.20)'; c.beginPath(); c.ellipse(x, y, rx, rx * 0.28, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.10)'; c.lineWidth = 0.8; c.beginPath(); c.ellipse(x, y + 0.6, rx, rx * 0.28, 0, 0.1, Math.PI - 0.1); c.stroke();
    }
  } else if (body.id === 'terra') {                              // TERRA: 畑の帯と木々
    for (let k = 0; k < 8; k++) {
      c.fillStyle = k % 2 ? 'rgba(255,238,150,0.12)' : 'rgba(18,70,34,0.16)';
      c.beginPath(); c.ellipse(T() * AW, 480 + T() * 120, 30 + T() * 50, 4 + T() * 5, 0, 0, TAU); c.fill();
    }
    for (let k = 0; k < 16; k++) {
      const x = T() * AW, y = 468 + T() * 140, r = 2.4 + T() * 2.2;
      c.fillStyle = 'rgba(20,64,34,0.55)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
      c.fillStyle = 'rgba(180,230,120,0.22)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.5, 0, TAU); c.fill();
    }
  } else {                                                       // 火星・タイタン: 緩い地層
    c.strokeStyle = 'rgba(0,0,0,0.20)'; c.lineWidth = 1;
    for (let k = 0; k < 5; k++) { const y = 480 + k * 26 + T() * 8; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= AW; x += 30) c.lineTo(x, y + Math.sin(x * 0.03 + k) * 4); c.stroke(); }
  }
  c.fillStyle = 'rgba(0,0,0,0.16)';                              // 小石
  for (let k = 0; k < 16; k++) { const x = T() * AW, y = 465 + T() * 160; c.beginPath(); c.ellipse(x, y, 1.5 + T() * 2.5, 0.8 + T(), 0, 0, TAU); c.fill(); }
  c.restore();
  // リムライト（稜線）
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath();
  for (let i = 0; i < pts.length; i++) { if (i === 0) c.moveTo(pts[i].x, pts[i].y); else c.lineTo(pts[i].x, pts[i].y); }
  c.strokeStyle = rgba(v.rim, 0.14); c.lineWidth = 4; c.stroke();
  c.strokeStyle = rgba(v.rim, 0.6); c.lineWidth = 1.1; c.stroke();
}
export function drawTerrain(ctx, body, pts, pad, t) {
  if (!pts || pts.length < 2) return;
  cachedLayer(ctx, 'terrain', pts, (c) => paintTerrain(c, body, pts));
  if (body.id === 'io') {                                        // 火山の噴出口（ゆっくり脈動）
    const idxs = [2, 14];
    for (let k = 0; k < idxs.length; k++) {
      let i = idxs[k]; const p0 = pts[i];
      if (pad && Math.abs(p0.x - (pad.x + pad.w / 2)) < 50) i = (i + 6) % (pts.length - 2) + 1;
      const q = pts[i]; if (!q) continue;
      const a = 0.55 + 0.45 * Math.sin(t * 0.9 + k * 2);
      ctx.save();
      const g = mkR(ctx, q.x, q.y - 2, 0, q.x, q.y - 2, 16);
      g.addColorStop(0, 'rgba(255,140,40,' + (0.5 * a).toFixed(2) + ')'); g.addColorStop(1, 'rgba(255,100,20,0)');
      ctx.fillStyle = g; ctx.fillRect(q.x - 16, q.y - 18, 32, 32);
      ctx.fillStyle = 'rgba(255,200,120,' + (0.7 * a).toFixed(2) + ')'; ctx.beginPath(); ctx.ellipse(q.x, q.y - 1, 3.5, 1.2, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- 着陸パッド
export function drawPad(ctx, pad, t) {
  if (!pad) return;
  const p = P();
  const cx = pad.w / 2;
  ctx.save();
  ctx.translate(pad.x, pad.y);
  // 支柱
  ctx.fillStyle = '#6f6a5f';
  ctx.beginPath(); ctx.moveTo(3, 3); ctx.lineTo(7, 3); ctx.lineTo(6, 8); ctx.lineTo(2.5, 8); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(pad.w - 7, 3); ctx.lineTo(pad.w - 3, 3); ctx.lineTo(pad.w - 2.5, 8); ctx.lineTo(pad.w - 6, 8); ctx.closePath(); ctx.fill();
  // 天板
  rr(ctx, 0, -1.6, pad.w, 5, 2.4);
  ctx.fillStyle = gLin(ctx, 'pad', 0, -1.6, 0, 3.4, [[0, '#F6F1E4'], [1, '#B9B2A0']]); ctx.fill();
  ctx.lineWidth = 0.7; ctx.strokeStyle = 'rgba(20,24,34,0.45)'; ctx.stroke();
  // 中央の着陸マーク
  ctx.fillStyle = rgba(p.mid, 0.55); ctx.fillRect(cx - 4, -0.6, 8, 1);
  // 誘導灯（交互に点滅）
  const ph = Math.floor(t * 1.6) % 2;
  for (let k = 0; k < 2; k++) {
    const lx = k === 0 ? 3.6 : pad.w - 3.6, on = ph === k;
    if (on) {
      ctx.fillStyle = gRad(ctx, 'padGlow', 0, 0, 0, 0, 0, 8, [[0, 'rgba(99,216,201,0.55)'], [1, 'rgba(99,216,201,0)']]);
      ctx.save(); ctx.translate(lx, -2); ctx.fillRect(-8, -8, 16, 16); ctx.restore();
    }
    ctx.fillStyle = on ? p.mid : rgba(p.mid, 0.28);
    ctx.beginPath(); ctx.arc(lx, -2.4, 1.5, 0, TAU); ctx.fill();
  }
  // マスト
  ctx.strokeStyle = rgba(p.fg, 0.7); ctx.lineWidth = 1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, -1.6); ctx.lineTo(cx, -13); ctx.stroke();
  ctx.restore();
}
// 霧の上に重ねるビーコン（琥珀・ゆっくり脈動）
export function drawBeacon(ctx, pad, t) {
  if (!pad) return;
  const bx = pad.x + pad.w / 2, by = pad.y - 14.5;
  const a = 0.5 + 0.5 * Math.sin(t * 2.6);
  ctx.save();
  ctx.fillStyle = gRad(ctx, 'beacon', 0, 0, 0, 0, 0, 14, [[0, 'rgba(255,181,71,0.55)'], [1, 'rgba(255,181,71,0)']]);
  ctx.globalAlpha = 0.35 + 0.65 * a;
  ctx.translate(bx, by); ctx.fillRect(-14, -14, 28, 28); ctx.translate(-bx, -by);
  ctx.globalAlpha = 0.65 + 0.35 * a;
  ctx.fillStyle = P().warn;
  ctx.beginPath(); ctx.arc(bx, by, 2.1, 0, TAU); ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------- 誘導線 / オンコース表示
const DASH_OFF = [2, 7], DASH_ON = [5, 5], DASH_NONE = [];
export function drawGuide(ctx, pts, onCourse, pulse) {
  if (!pts || pts.length < 2) return;
  const p = P();
  ctx.save();
  ctx.lineCap = 'round';
  if (onCourse) { ctx.globalAlpha = Math.max(0, Math.min(1, 0.55 * pulse)); ctx.strokeStyle = p.fg; ctx.lineWidth = 1.4; ctx.setLineDash(DASH_ON); }
  else { ctx.globalAlpha = 0.28; ctx.strokeStyle = p.mid; ctx.lineWidth = 1; ctx.setLineDash(DASH_OFF); }
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.stroke();
  ctx.setLineDash(DASH_NONE);
  const last = pts[pts.length - 1];       // 目標のひし形（ヘアライン）
  ctx.globalAlpha = onCourse ? 0.8 : 0.45; ctx.strokeStyle = onCourse ? p.fg : p.mid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(last.x, last.y - 7); ctx.lineTo(last.x + 5, last.y - 2.5); ctx.lineTo(last.x, last.y + 2); ctx.lineTo(last.x - 5, last.y - 2.5); ctx.closePath(); ctx.stroke();
  ctx.restore();
}
export function drawOnCourse(ctx, x, y, ringPhase, pulse) {
  const p = P();
  const ringR = 23 + 2.5 * Math.sin(ringPhase * Math.PI * 2 * 1.5);
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, 0.32 * pulse));
  ctx.strokeStyle = p.mid; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(x, y, ringR, 0, TAU); ctx.stroke();
  ctx.restore();
}

export function drawOnCourseLabel(ctx, pulse) {
  txt(ctx, 'ON COURSE', AW - 12, 90, 8, P().mid, 'right', { sp: 2.5, w: 500, a: Math.max(0, Math.min(1, pulse)) * 0.9 });
}

// ---------------------------------------------------------------- 大気（霧・砂塵）
export function drawHaze(ctx, color, alpha) {
  const g = gLin(ctx, 'haze' + color, 0, 0, 0, ART_BTN_Y, [[0, rgba(color, 0.04)], [0.6, rgba(color, 0.5)], [1, rgba(color, 1)]]);
  ctx.save(); ctx.globalAlpha = Math.max(0, Math.min(1, alpha * 1.25)); ctx.fillStyle = g; ctx.fillRect(0, 0, AW, ART_BTN_Y); ctx.restore();
}
export function drawFog(ctx, fogHex, x, y, r) {
  const g = mkR(ctx, x, y, r * 0.5, x, y, r);
  // ease-out の多段ストップで帯が出ないようにする
  for (let i = 0; i <= 8; i++) { const u = i / 8, e = u * u * (3 - 2 * u); g.addColorStop(u, rgba(fogHex, 0.94 * e)); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, AW, ART_BTN_Y);
}

// ================================================================ 障害物（rock / ice / lava）
function polyVerts(n, r, seed, rot, lo) {
  const out = [];
  const R = artRnd(seed);
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot, rr_ = r * (lo + (1 - lo) * R()); out.push(Math.cos(a) * rr_, Math.sin(a) * rr_, a); }
  return out;
}
export function drawObstacles(ctx, obs, t, body) {
  if (!obs || !obs.length) return;
  const v = (body && body.visual) || { ground: '#4a4d58' };
  for (let k = 0; k < obs.length; k++) {
    const ob = obs[k];
    const seed = Math.floor(ob.r * 131 + k * 17);
    const dir = ob.vx >= 0 ? 1 : -1;
    const rot = t * 0.22 * dir + seed;
    ctx.save();
    ctx.translate(ob.x, ob.y);
    if (ob.style === 'ice') paintIce(ctx, ob.r, rot, seed);
    else if (ob.style === 'lava') paintLava(ctx, ob.r, rot, seed, t);
    else paintRock(ctx, ob.r, rot, seed, v.ground);
    ctx.restore();
  }
}
function paintRock(ctx, r, rot, seed, ground) {
  const base = mixHex('#8a90a0', ground, 0.45);
  const n = 8, vs = polyVerts(n, r, seed, rot, 0.8);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const am = vs[i * 3 + 2] + Math.PI / n;                         // 面の向き
    const lit = Math.cos(am - (-2.2));                                // 左上からの光
    ctx.fillStyle = shade(base, lit * 0.32 - 0.12);
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(vs[i * 3], vs[i * 3 + 1]); ctx.lineTo(vs[j * 3], vs[j * 3 + 1]); ctx.closePath(); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(8,10,16,0.55)'; ctx.lineWidth = 0.9; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) ctx.moveTo(vs[0], vs[1]); else ctx.lineTo(vs[i * 3], vs[i * 3 + 1]); } ctx.closePath(); ctx.stroke();
}
function paintIce(ctx, r, rot, seed) {
  const n = 6, vs = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * TAU + rot, rr_ = i % 2 ? r * 0.72 : r; vs.push(Math.cos(a) * rr_, Math.sin(a) * rr_); }
  ctx.fillStyle = 'rgba(140,222,255,0.20)';
  ctx.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) ctx.moveTo(vs[0], vs[1]); else ctx.lineTo(vs[i * 2], vs[i * 2 + 1]); } ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(210,244,255,0.5)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); for (let i = 0; i < n; i += 2) { ctx.moveTo(0, 0); ctx.lineTo(vs[i * 2], vs[i * 2 + 1]); } ctx.stroke();
  ctx.fillStyle = 'rgba(190,236,255,0.22)';                           // 内側の欠片
  ctx.beginPath(); ctx.moveTo(vs[0] * 0.55, vs[1] * 0.55); ctx.lineTo(vs[2] * 0.5, vs[3] * 0.5); ctx.lineTo(vs[4] * 0.55, vs[5] * 0.55); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(190,236,255,0.9)'; ctx.lineWidth = 1; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) ctx.moveTo(vs[0], vs[1]); else ctx.lineTo(vs[i * 2], vs[i * 2 + 1]); } ctx.closePath(); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(vs[10] * 0.55, vs[11] * 0.55, 1, 0, TAU); ctx.fill();
}
function paintLava(ctx, r, rot, seed, t) {
  ctx.fillStyle = 'rgba(255,100,30,0.10)'; ctx.beginPath(); ctx.arc(0, 0, r * 1.3, 0, TAU); ctx.fill();
  const n = 9, vs = polyVerts(n, r, seed, rot, 0.82);
  ctx.fillStyle = '#25171a';
  ctx.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) ctx.moveTo(vs[0], vs[1]); else ctx.lineTo(vs[i * 3], vs[i * 3 + 1]); } ctx.closePath(); ctx.fill();
  const pulse = 0.55 + 0.35 * Math.sin(t * 2 + seed);
  ctx.strokeStyle = 'rgba(255,128,40,' + pulse.toFixed(2) + ')'; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
  ctx.beginPath();
  for (let i = 0; i < n; i += 2) { ctx.moveTo(vs[i * 3] * 0.18, vs[i * 3 + 1] * 0.18); ctx.lineTo(vs[i * 3] * 0.55, vs[i * 3 + 1] * 0.5); ctx.lineTo(vs[i * 3] * 0.92, vs[i * 3 + 1] * 0.92); }
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,160,70,' + (pulse * 0.5).toFixed(2) + ')'; ctx.beginPath(); ctx.arc(0, 0, r * 0.2, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,120,40,0.45)'; ctx.lineWidth = 0.8; ctx.lineJoin = 'round';
  ctx.beginPath(); for (let i = 0; i < n; i++) { if (i === 0) ctx.moveTo(vs[0], vs[1]); else ctx.lineTo(vs[i * 3], vs[i * 3 + 1]); } ctx.closePath(); ctx.stroke();
}

// ================================================================ 機体（キュート）
// 原点=当たり判定の中心。足元 y=+16。angleDeg はCW正（game.js と同じ）。
export function drawShip(ctx, x, y, angleDeg, main, rcsL, rcsR, t) {
  const p = P();
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate((angleDeg || 0) * Math.PI / 180);
  // --- 主エンジンの炎
  if (main) {
    const L = 11 + Math.random() * 8;
    ctx.fillStyle = gRad(ctx, 'flameGlow', 0, 0, 0, 0, 0, 18, [[0, 'rgba(255,181,71,0.42)'], [1, 'rgba(255,181,71,0)']]);
    ctx.save(); ctx.translate(0, 15); ctx.fillRect(-18, -12, 36, 36); ctx.restore();
    ctx.save(); ctx.translate(0, 12); ctx.scale(1, L);
    ctx.fillStyle = gLin(ctx, 'flameOuter', 0, 0, 0, 1, [[0, 'rgba(255,244,214,0.95)'], [0.35, 'rgba(255,181,71,0.85)'], [1, 'rgba(255,150,40,0)']]);
    ctx.beginPath(); ctx.moveTo(-3.6, 0); ctx.quadraticCurveTo(-3.2, 0.5, 0, 1); ctx.quadraticCurveTo(3.2, 0.5, 3.6, 0); ctx.closePath(); ctx.fill();
    ctx.scale(1, 0.55);
    ctx.fillStyle = gLin(ctx, 'flameCore', 0, 0, 0, 1, [[0, 'rgba(255,255,255,0.95)'], [1, 'rgba(255,255,255,0)']]);
    ctx.beginPath(); ctx.moveTo(-1.8, 0); ctx.quadraticCurveTo(-1.5, 0.5, 0, 1); ctx.quadraticCurveTo(1.5, 0.5, 1.8, 0); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // --- RCS（白い小さな噴射）。左ノズルは左へ、右ノズルは右へ
  if (rcsL) rcsPuff(ctx, -11.8, -3.4, -1);
  if (rcsR) rcsPuff(ctx, 11.8, -3.4, 1);
  // --- 脚と足パッド
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#a39c8a'; ctx.lineWidth = 1.9;
  ctx.beginPath(); ctx.moveTo(-6, 6.5); ctx.lineTo(-12.2, 14.4); ctx.moveTo(6, 6.5); ctx.lineTo(12.2, 14.4); ctx.stroke();
  ctx.fillStyle = '#d3ccba'; ctx.strokeStyle = 'rgba(20,24,34,0.55)'; ctx.lineWidth = 0.6;
  ctx.beginPath(); ctx.ellipse(-14.4, 15.0, 3.8, 1.35, 0, 0, TAU); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(14.4, 15.0, 3.8, 1.35, 0, 0, TAU); ctx.fill(); ctx.stroke();
  // --- ノズル
  ctx.fillStyle = '#585c6a';
  ctx.beginPath(); ctx.moveTo(-2.7, 8.5); ctx.lineTo(2.7, 8.5); ctx.lineTo(3.7, 12.2); ctx.lineTo(-3.7, 12.2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = main ? p.warn : '#3a3d48'; ctx.fillRect(-2.4, 11.4, 4.8, 0.8);
  // --- RCSノズル
  ctx.fillStyle = '#6d7280';
  rr(ctx, -12, -5.2, 3.2, 3.6, 1.2); ctx.fill();
  rr(ctx, 8.8, -5.2, 3.2, 3.6, 1.2); ctx.fill();
  // --- アンテナ（ゆっくり点滅）
  ctx.strokeStyle = '#bdb6a4'; ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(3.6, -11.6); ctx.lineTo(5.8, -17); ctx.stroke();
  const blink = (Math.floor((t || 0) * 0.9) % 2) === 0;
  ctx.fillStyle = blink ? p.warn : rgba(p.warn, 0.25);
  ctx.beginPath(); ctx.arc(5.9, -17.6, 1.3, 0, TAU); ctx.fill();
  // --- 船体（カプセル）
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.arc(0, -4, 9, Math.PI, 0, false);
  ctx.lineTo(9, 5); ctx.quadraticCurveTo(9, 9, 5, 9); ctx.lineTo(-5, 9); ctx.quadraticCurveTo(-9, 9, -9, 5); ctx.closePath();
  ctx.fillStyle = gLin(ctx, 'hull', -9, -13, 9, 9, [[0, '#FBF7EC'], [0.55, '#E6DFCD'], [1, '#C4BCA8']]);
  ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = 'rgba(90,76,50,0.10)'; ctx.fillRect(-9, 4, 18, 6);     // 下部パネル
  ctx.strokeStyle = 'rgba(60,54,44,0.32)'; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.moveTo(-9, 4); ctx.lineTo(9, 4); ctx.stroke();       // パネルライン
  ctx.fillStyle = rgba(p.mid, 0.9); ctx.beginPath(); ctx.arc(5.4, 6.6, 0.8, 0, TAU); ctx.fill();   // 小さな表示灯
  ctx.restore();
  ctx.strokeStyle = 'rgba(24,28,40,0.55)'; ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-9, -4); ctx.arc(0, -4, 9, Math.PI, 0, false);
  ctx.lineTo(9, 5); ctx.quadraticCurveTo(9, 9, 5, 9); ctx.lineTo(-5, 9); ctx.quadraticCurveTo(-9, 9, -9, 5); ctx.closePath(); ctx.stroke();
  // --- 大きな丸窓（目のように）
  ctx.fillStyle = gLin(ctx, 'portRing', -6, -9, 6, 3, [[0, '#c7ccd6'], [1, '#6e7482']]);
  ctx.beginPath(); ctx.arc(0, -3.4, 6.2, 0, TAU); ctx.fill();
  ctx.fillStyle = gRad(ctx, 'portGlass', -1.5, -5.2, 0.5, 0, -3.4, 5.2, [[0, '#2b4262'], [0.6, '#0f1a2c'], [1, '#050810']]);
  ctx.beginPath(); ctx.arc(0, -3.4, 5.0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(99,216,201,0.55)'; ctx.lineWidth = 0.7;                // 下側の反射リム
  ctx.beginPath(); ctx.arc(0, -3.4, 4.3, 0.25, 1.35, false); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';                                         // ハイライト
  ctx.beginPath(); ctx.ellipse(-1.9, -5.5, 1.9, 1.25, -0.55, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(2.0, -1.6, 0.7, 0, TAU); ctx.fill();
  ctx.restore();
}
function rcsPuff(ctx, ox, oy, dir) {
  const L = 6 + Math.random() * 5;
  ctx.save(); ctx.translate(ox, oy);
  const g = mkL(ctx, 0, 0, dir * L, 0);          // 長さが毎フレーム変わるので使い捨て（最大2個/フレーム）
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.5, 'rgba(235,245,255,0.45)'); g.addColorStop(1, 'rgba(235,245,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(0, -1.5); ctx.quadraticCurveTo(dir * L * 0.5, -1.3, dir * L, 0); ctx.quadraticCurveTo(dir * L * 0.5, 1.3, 0, 1.5); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// 着陸シーケンスの小物
export function drawHatch(ctx, hx, hy, open) {
  open = Math.max(0, Math.min(1, open));
  ctx.save();
  rr(ctx, hx - 2.4, hy - 5, 3.8, 10, 1.6); ctx.fillStyle = '#171d2a'; ctx.fill();
  ctx.strokeStyle = 'rgba(236,230,216,0.45)'; ctx.lineWidth = 0.7; ctx.stroke();
  ctx.lineCap = 'round';
  const ex = hx + 1.4 + 6 * open, ey = hy - 5 + 5 * (1 - open) - 2 * open;
  ctx.strokeStyle = 'rgba(40,40,50,0.7)'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(hx + 1.4, hy - 5); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.strokeStyle = '#E6DFCD'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(hx + 1.4, hy - 5); ctx.lineTo(ex, ey); ctx.stroke();
  ctx.restore();
}
export function drawLadder(ctx, lx, topY, gy) {
  ctx.save();
  ctx.strokeStyle = 'rgba(236,230,216,0.8)'; ctx.lineWidth = 1; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(lx - 2.2, topY); ctx.lineTo(lx - 2.2, gy); ctx.moveTo(lx + 2.2, topY); ctx.lineTo(lx + 2.2, gy); ctx.stroke();
  ctx.globalAlpha = 0.6; ctx.lineWidth = 0.8;
  ctx.beginPath();
  for (let yy = topY + 3; yy < gy; yy += 4) { ctx.moveTo(lx - 2.2, yy); ctx.lineTo(lx + 2.2, yy); }
  ctx.stroke();
  ctx.restore();
}

// ================================================================ 宇宙飛行士（2頭身）
// (x,y)=足元。mode: 'descend'|'walk'|'flag'|'wave'|'done'。pose: celebrationPose の戻り値
export function drawAstronaut(ctx, x, y, mode, t, pose) {
  let armL = 0.3, armR = 0.3, bob = 0, swing = 0, climb = 0, rot = 0, ox = 0, oy = 0;
  if (pose) {
    armL = pose.armL; armR = pose.armR; rot = pose.rot || 0; ox = pose.dx || 0;
    oy = Math.max(40, y - (pose.dy || 0)) - y;
  } else if (mode === 'descend') {
    const s = Math.sin(t * 11); climb = s; armL = 2.3 + s * 0.45; armR = 2.3 - s * 0.45;
  } else if (mode === 'walk') {
    const s = Math.sin(t * 15); swing = s; bob = -Math.abs(s) * 0.8; armL = 0.3 + s * 0.5; armR = 0.3 - s * 0.5;
  } else if (mode === 'flag') {
    armR = 2.2 + 0.25 * Math.sin(t * 9); armL = 0.5;
  } else if (mode === 'wave') {
    armR = 2.4 + 0.5 * Math.sin(t * 12); armL = 0.3;
  }
  ctx.save();
  ctx.translate(x + ox, y + oy + bob);
  if (rot) { ctx.translate(0, -7); ctx.rotate(rot); ctx.translate(0, 7); }
  const SUIT = '#F3EFE4', EDGE = 'rgba(70,66,58,0.55)';
  // バックパック
  rr(ctx, -6.9, -9.6, 3.4, 6.6, 1.5); ctx.fillStyle = '#c7c0ae'; ctx.fill();
  // ブーツ
  ctx.fillStyle = '#d9d3c1'; ctx.strokeStyle = EDGE; ctx.lineWidth = 0.5;
  rr(ctx, -4 + swing * 1.5, -4.3 - Math.max(0, climb) * 1.2, 3.6, 4.3, 1.5); ctx.fill(); ctx.stroke();
  rr(ctx, 0.4 - swing * 1.5, -4.3 - Math.max(0, -climb) * 1.2, 3.6, 4.3, 1.5); ctx.fill(); ctx.stroke();
  // 腕（奥→手前）
  const arm = (sx, a, dirSign) => {
    const L = 5.4, ex = sx + dirSign * L * Math.sin(a), ey = -8.2 + L * Math.cos(a);
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(70,66,58,0.6)'; ctx.lineWidth = 3.1; ctx.beginPath(); ctx.moveTo(sx, -8.2); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = SUIT; ctx.lineWidth = 2.3; ctx.beginPath(); ctx.moveTo(sx, -8.2); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.fillStyle = '#cfc9b8'; ctx.beginPath(); ctx.arc(ex, ey, 1.25, 0, TAU); ctx.fill();
  };
  arm(-3.4, armL, -1);
  // 胴体
  rr(ctx, -4.2, -10.4, 8.4, 7.4, 3); ctx.fillStyle = SUIT; ctx.fill(); ctx.strokeStyle = EDGE; ctx.lineWidth = 0.6; ctx.stroke();
  rr(ctx, -1.9, -8.2, 3.8, 1.7, 0.8); ctx.fillStyle = 'rgba(99,216,201,0.85)'; ctx.fill();   // 胸の計器
  arm(3.4, armR, 1);
  // ヘルメット
  ctx.fillStyle = '#F8F5EC'; ctx.strokeStyle = EDGE; ctx.lineWidth = 0.7;
  ctx.beginPath(); ctx.arc(0, -14.6, 5.5, 0, TAU); ctx.fill(); ctx.stroke();
  // バイザー
  ctx.fillStyle = gLin(ctx, 'visor', 0, -18, 0, -11, [[0, '#2c5568'], [0.55, '#10222f'], [1, '#070d16']]);
  ctx.beginPath(); ctx.ellipse(0.9, -14.7, 4.0, 3.3, 0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(99,216,201,0.45)'; ctx.lineWidth = 0.5; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.ellipse(-0.5, -16.2, 1.5, 0.85, -0.5, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(2.6, -12.9, 0.55, 0, TAU); ctx.fill();
  ctx.restore();
}
// 旗。(x,y)=地面の根元。t: 0..1 立てる進行
export function drawFlag(ctx, x, y, t, wave) {
  t = Math.max(0, Math.min(1, t));
  const h = 21 * t;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(236,230,216,0.9)'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y - h); ctx.stroke();
  if (t > 0.6) {
    ctx.fillStyle = '#F8F4EA'; ctx.beginPath(); ctx.arc(x, y - h - 0.6, 1.1, 0, TAU); ctx.fill();
    const w = 11, s = (wave || 0) * 1.3;
    ctx.fillStyle = P().warn;
    ctx.beginPath();
    ctx.moveTo(x + 0.6, y - h + 0.5);
    ctx.quadraticCurveTo(x + w * 0.5, y - h + 0.5 - s, x + w, y - h + 0.5 + s * 0.5);
    ctx.lineTo(x + w, y - h + 7.5 + s * 0.5);
    ctx.quadraticCurveTo(x + w * 0.5, y - h + 7.5 - s, x + 0.6, y - h + 7.5);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.beginPath(); ctx.arc(x + 3.2, y - h + 4, 1, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
// 祝福エフェクト: 小さな星とハート（象牙/琥珀）
export function drawCelebFx(ctx, x, y, fx) {
  if (!fx) return;
  const p = P();
  const u = Math.max(0, Math.min(1, fx.u));
  const n = Math.max(1, fx.n | 0);
  ctx.save();
  ctx.globalAlpha = Math.pow(1 - u, 1.3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + 0.4;
    const r = 9 + 30 * u;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r - 12 * u;
    if (i % 3 === 2) {                       // ハート
      const s = 2.6;
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(px, py + s * 0.9);
      ctx.bezierCurveTo(px - s * 1.6, py - s * 0.2, px - s * 0.7, py - s * 1.3, px, py - s * 0.45);
      ctx.bezierCurveTo(px + s * 0.7, py - s * 1.3, px + s * 1.6, py - s * 0.2, px, py + s * 0.9);
      ctx.fill();
    } else {                                 // 4点の星
      const s = (i % 2 ? 3.4 : 2.6) * (1 - 0.3 * u);
      ctx.fillStyle = i % 2 ? p.fg : p.hi;
      ctx.beginPath();
      ctx.moveTo(px, py - s); ctx.quadraticCurveTo(px, py, px + s, py);
      ctx.quadraticCurveTo(px, py, px, py + s); ctx.quadraticCurveTo(px, py, px - s, py);
      ctx.quadraticCurveTo(px, py, px, py - s); ctx.fill();
    }
  }
  ctx.restore();
}
// 爆発の粒子: 象牙→琥珀→赤（危険）へ減衰
export function drawParticles(ctx, parts) {
  if (!parts || !parts.length) return;
  const p = P();
  ctx.save();
  for (let i = 0; i < parts.length; i++) {
    const q = parts[i];
    const u = Math.max(0, Math.min(1, q.life / (q.max || 1.7)));
    ctx.globalAlpha = Math.min(1, u * 1.6);
    ctx.fillStyle = u > 0.62 ? p.hi : u > 0.3 ? p.warn : p.bad;
    ctx.beginPath(); ctx.arc(q.x, q.y, 0.8 + u * 2.6, 0, TAU); ctx.fill();
  }
  ctx.restore();
}
export function drawShieldRing(ctx, x, y, flash, ready, charges = 1) {
  const p = P();
  const n = Math.max(1, Math.min(2, charges | 0));   // 残り回数ぶんの同心円（吸収直後で0でもフラッシュ用に1本）
  ctx.save();
  ctx.globalAlpha = flash > 0 ? Math.min(1, flash * 2) : 0.32;
  ctx.strokeStyle = flash > 0 ? p.hi : p.mid;
  ctx.lineWidth = flash > 0 ? 2.5 : 1;
  for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(x, y, 23 + i * 5, 0, TAU); ctx.stroke(); }
  ctx.restore();
}
export function drawRadar(ctx, hit, px, py, x, y, vx, vy) {
  const p = P();
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineWidth = 1;
  if (hit) {
    ctx.globalAlpha = 0.85; ctx.strokeStyle = p.fg;
    ctx.beginPath(); ctx.moveTo(px - 5, py - 5); ctx.lineTo(px + 5, py + 5); ctx.moveTo(px + 5, py - 5); ctx.lineTo(px - 5, py + 5); ctx.stroke();
  }
  ctx.globalAlpha = 0.7; ctx.strokeStyle = p.warn; ctx.setLineDash([3, 3]);
  ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + vx * 1.5, y + vy * 1.5); ctx.stroke();
  ctx.setLineDash(DASH_NONE);
  ctx.restore();
}

// ================================================================ HUD
// h: { stage, bodyName, atmoTag, realG, bonus, total, high, fuel(0..1), continues, modDefs, mods, debug, play,
//      wind(bool), windAccel, vy, vx, ang, om, sVy, sVx, sAng, sOm (0|1|2), t, pilot(string|''), atmoLabel }
function sevColor(s) { const p = P(); return s === 2 ? p.bad : s === 1 ? p.warn : null; }

// 文字列の描画幅（txt と同じ字間・フォントで合算）。日本語など全角はブラウザの実測に従う
export function textW(ctx, s, size, sp, wt) {
  s = String(s == null ? '' : s);
  const font = fontStr(wt || 400, size);
  ctx.save(); ctx.font = font;
  let total = 0;
  for (let i = 0; i < s.length; i++) total += charW(ctx, font, s[i]) + (i < s.length - 1 ? (sp || 0) : 0);
  ctx.restore();
  return total;
}
// maxW に収まるように末尾を省略（…）。サロゲートペアは崩さない
export function fitText(ctx, s, maxW, size, sp, wt) {
  s = String(s == null ? '' : s);
  if (textW(ctx, s, size, sp, wt) <= maxW) return s;
  const chars = Array.from(s);
  while (chars.length > 0 && textW(ctx, chars.join('') + '…', size, sp, wt) > maxW) chars.pop();
  return chars.length ? chars.join('') + '…' : '';
}
// HUD の新規テキスト/計測行の配置（game のテストが重なり検査に使う。幅は上限=最大幅で保守的に見積もる）
export const HUD_LAYOUT = {
  row: { x: 8, y: 64, w: AW - 16, h: 26 },
  labelY: 67, labelSize: 7,
  info: { x: 14, y: 94, maxW: 176, size: 7 },
  wind: { x: 200, y: 94 },
  pilot: { right: AW - 12, y: 40, maxW: 112, size: 7 },
  tip: { x: 20, y: 124, w: AW - 40, h: 84 },
};
export const HUD_LABELS = ['DESCENT', 'DRIFT', 'TILT', 'SPIN'];
export function hudInfoText(h) {
  const g = (h.realG != null) ? 'g ' + Number(h.realG).toFixed(2) + ' m/s²' : '';
  if (h.mission) return g ? g + '  ·  ' + h.mission : String(h.mission);   // ボーナス中: 重力 · ミッション名
  const tag = String(h.atmoTag || '');
  const a = (!tag || tag === 'NONE') ? 'NO ATMOSPHERE' : tag;
  return g ? g + '  ·  ' + a : a;
}
export function drawHUD(ctx, h) {
  const p = P();
  const t = h.t || 0;
  const L = HUD_LAYOUT;
  // 行A: ステージ/天体名 と スコア
  txt(ctx, (h.bonus ? 'BONUS  ·  ' : '') + 'STAGE ' + h.stage, 52, 8, 8, h.bonus ? p.warn : p.dim, 'left', { sp: 2.5, w: 500 });
  txt(ctx, h.bodyName, 52, 19, 15, p.fg, 'left', { sp: 4, w: 300 });
  num(ctx, h.total, AW - 12, 7, 20, p.fg, { w: 200 });
  txt(ctx, 'BEST ' + (h.high || 0), AW - 12, 31, 8, p.dim, 'right', { sp: 2, w: 500 });
  // パイロット名（BEST の下。ラベルは dim、名前は少し明るく。長い名前は省略）
  if (h.pilot) {
    const lab = 'PILOT', lw = textW(ctx, lab, L.pilot.size, 1.5, 500), gap = 5;
    const nm = fitText(ctx, h.pilot, L.pilot.maxW - lw - gap, L.pilot.size + 1, 0.5, 500);
    if (nm) {
      txt(ctx, nm, L.pilot.right, L.pilot.y - 0.5, L.pilot.size + 1, rgba(p.fg, 0.82), 'right', { sp: 0.5, w: 500 });
      const nw = textW(ctx, nm, L.pilot.size + 1, 0.5, 500);
      txt(ctx, lab, L.pilot.right - nw - gap, L.pilot.y, L.pilot.size, p.dim, 'right', { sp: 1.5, w: 500 });
    }
  }
  // 行B: 燃料 / 残機 / モジュール
  const fr = Math.max(0, Math.min(1, h.fuel));
  const fcol = fr > 0.4 ? p.mid : fr > 0.15 ? p.warn : p.bad;
  const lowPulse = fr <= 0.15 && fr > 0 ? 0.65 + 0.35 * Math.sin(t * 7) : 1;
  icoFuel(ctx, 59, 52, 5.2, fcol);
  ctx.save();
  rr(ctx, 72, 50.5, 100, 3, 1.5); ctx.fillStyle = rgba(p.fg, 0.14); ctx.fill();
  if (fr > 0) { ctx.globalAlpha = lowPulse; rr(ctx, 72, 50.5, Math.max(3, 100 * fr), 3, 1.5); ctx.fillStyle = fcol; ctx.fill(); }
  ctx.restore();
  const nIcons = Math.min(h.continues || 0, 3);
  for (let i = 0; i < nIcons; i++) icoShipMini(ctx, 192 + i * 14, 52, 0.9, p.fg);
  if ((h.continues || 0) > 3) txt(ctx, '×' + h.continues, 192 + 3 * 14 - 4, 47, 9, p.fg, 'left', { w: 500 });
  let mk = 0;
  for (let i = 0; i < h.modDefs.length; i++) {
    const d = h.modDefs[i], lv = h.mods[d.id] || 0;
    if (!lv) continue;
    const cx = AW - 20 - 20 * mk;
    drawModuleGlyph(ctx, d.id, cx, 53, 5.6, p.warn);
    if (d.max > 1) for (let k = 0; k < lv; k++) { ctx.fillStyle = p.warn; ctx.fillRect(cx - 3.5 + k * 4, 61, 3, 1.4); }
    mk++;
  }
  if (h.debug) txt(ctx, 'DEBUG', 178, 8, 8, p.warn, 'left', { sp: 2.5, w: 500 });
  if (!h.play) return;
  // 行C: 計測（ヘアライン枠。各セルに小さなラベル）
  ctx.save();
  rr(ctx, L.row.x, L.row.y, L.row.w, L.row.h, 13); ctx.strokeStyle = rgba(p.fg, 0.13); ctx.lineWidth = 1; ctx.stroke();
  ctx.restore();
  const cells = 4, cw = L.row.w / cells;
  for (let i = 1; i < cells; i++) hair(ctx, 8 + cw * i, 70, 8 + cw * i, 84, p.fg, 0.10);
  const cell = (i, ico, sev, value) => {
    const x0 = 8 + cw * i, c = sevColor(sev);
    txt(ctx, HUD_LABELS[i], x0 + cw / 2, L.labelY, L.labelSize, rgba(p.fg, 0.64), 'center', { sp: 1.6, w: 500 });
    ico(ctx, x0 + 17, 82, 5, c || p.mid);
    num(ctx, value, x0 + cw - 20, 75, 12, c || p.fg, { w: 300 });
  };
  cell(0, icoDown, h.sVy, Math.round(h.vy));
  cell(1, icoSide, h.sVx, Math.round(h.vx));
  cell(2, (c, x, y, s, col) => icoAngle(c, x, y, s, col, h.ang), h.sAng, Math.round(h.ang) + '°');
  cell(3, icoSpin, h.sOm, Math.round(h.om));
  // 行D: 天体情報（重力 · 大気）と、風のある天体では風の矢印
  const info = fitText(ctx, hudInfoText(h), L.info.maxW, L.info.size, 1.2, 500);
  if (info) txt(ctx, info, L.info.x, L.info.y, L.info.size, rgba(p.fg, 0.64), 'left', { sp: 1.2, w: 500 });
  if (h.wind) {
    const wa = h.windAccel || 0, dir = wa >= 0 ? 1 : -1;
    const len = Math.min(34, 8 + Math.abs(wa) * 60);
    txt(ctx, 'WIND', L.wind.x, L.wind.y, 7, p.dim, 'left', { sp: 1.6, w: 500 });
    icoWind(ctx, L.wind.x + 62, L.wind.y + 4, len, dir, p.mid);
  }
}
// 初回のみ表示する計器ヒント。行C を指す小さなキャレット付きの静かなパネル。k: 0..1（フェード）
export function drawHudTip(ctx, k) {
  const p = P(), L = HUD_LAYOUT.tip;
  const a = Math.max(0, Math.min(1, k));
  ctx.save();
  ctx.globalAlpha = a;
  panel(ctx, L.x, L.y, L.w, L.h, { a: 0.88, border: p.mid, ba: 0.28 });
  // キャレット（パネル上辺から計測行へ）
  ctx.beginPath(); ctx.moveTo(L.x + 40 - 7, L.y + 0.5); ctx.lineTo(L.x + 40, L.y - 8); ctx.lineTo(L.x + 40 + 7, L.y + 0.5);
  ctx.strokeStyle = rgba(p.mid, 0.55); ctx.lineWidth = 1; ctx.stroke();
  const cx = AW / 2;
  txt(ctx, 'DESCENT ↓   DRIFT ↔   TILT   SPIN', cx, L.y + 14, 9, p.hi, 'center', { sp: 1.6, w: 500 });
  txt(ctx, 'KEEP THEM WHITE TO LAND SAFELY', cx, L.y + 34, 9, p.fg, 'center', { sp: 2, w: 400 });
  txt(ctx, 'AMBER = CAUTION    RED = TOO FAST', cx, L.y + 50, 8, p.warn, 'center', { sp: 1.8, w: 500 });
  txt(ctx, 'TAP TO START', cx, L.y + 68, 7, p.dim, 'center', { sp: 3, w: 500 });
  ctx.restore();
}

// ================================================================ 操作ボタン（下部バー）
// 入力ゾーンは game.js の定数（x<120 / 120..240 / >240）のまま。見た目だけピルに。
function rotArrow(ctx, cx, cy, r, cw) {
  ctx.save();
  ctx.translate(cx, cy);
  if (!cw) ctx.scale(-1, 1);
  ctx.beginPath(); ctx.arc(0, 0, r, -2.5, 0.85, false); ctx.stroke();
  const e = 0.85, ex = Math.cos(e) * r, ey = Math.sin(e) * r;
  const tx = -Math.sin(e), ty = Math.cos(e), nx = Math.cos(e), ny = Math.sin(e);
  ctx.beginPath();
  ctx.moveTo(ex - tx * 4.2 + nx * 3.4, ey - ty * 4.2 + ny * 3.4); ctx.lineTo(ex + tx * 0.8, ey + ty * 0.8); ctx.lineTo(ex - tx * 4.2 - nx * 3.4, ey - ty * 4.2 - ny * 3.4);
  ctx.stroke();
  ctx.restore();
}
export function drawControls(ctx, left, mid, right) {
  const p = P();
  ctx.save();
  // 下部の薄いベール（地形の上でもボタンを読めるように）
  ctx.fillStyle = gLin(ctx, 'ctlVeil', 0, ART_BTN_Y - 20, 0, AH, [[0, 'rgba(6,8,14,0)'], [0.3, 'rgba(6,8,14,0.55)'], [1, 'rgba(6,8,14,0.9)']]);
  ctx.fillRect(0, ART_BTN_Y - 20, AW, 100);
  const flags = [left, mid, right];
  for (let i = 0; i < 3; i++) {
    const on = flags[i];
    const bx = i * 120 + 12, by = ART_BTN_Y + 10, bw = 96, bh = 56;
    const accent = i === 1 ? p.warn : p.fg;
    rr(ctx, bx, by, bw, bh, 22);
    ctx.fillStyle = on ? rgba(accent, i === 1 ? 0.20 : 0.15) : rgba(p.fg, 0.045);
    ctx.fill();
    ctx.lineWidth = on ? 1.4 : 1;
    ctx.strokeStyle = on ? rgba(accent, 0.8) : rgba(p.fg, 0.2);
    ctx.stroke();
    const cx = bx + bw / 2, cy = by + bh / 2;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = 2;
    ctx.strokeStyle = on ? accent : rgba(p.fg, 0.62);
    if (i === 1) {
      ctx.beginPath(); ctx.moveTo(cx, cy + 9); ctx.lineTo(cx, cy - 9);
      ctx.moveTo(cx - 7, cy - 2); ctx.lineTo(cx, cy - 9); ctx.lineTo(cx + 7, cy - 2); ctx.stroke();
      ctx.globalAlpha = on ? 0.9 : 0.4; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(cx - 4, cy + 13); ctx.lineTo(cx - 4, cy + 11); ctx.moveTo(cx + 4, cy + 13); ctx.lineTo(cx + 4, cy + 11); ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      rotArrow(ctx, cx, cy, 11, i === 0);   // 左ボタン=機首が右へ(時計回り)、右ボタン=機首が左へ(反時計回り)
    }
  }
  ctx.restore();
}

// BACKボタン（engine から呼ぶ）: ヘアラインの円 + シェブロン
export function drawBackButton(ctx, b) {
  const p = P();
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 15, 0, TAU);
  ctx.fillStyle = rgba('#06080E', 0.45); ctx.fill();
  ctx.strokeStyle = rgba(p.fg, 0.32); ctx.lineWidth = 1; ctx.stroke();
  ctx.strokeStyle = rgba(p.fg, 0.85); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(cx + 2.5, cy - 5.5); ctx.lineTo(cx - 2.5, cy); ctx.lineTo(cx + 2.5, cy + 5.5); ctx.stroke();
  ctx.restore();
}

// ================================================================ バナー
export function drawIntro(ctx, name, line1, line2, alpha) {
  const p = P();
  const a = Math.max(0, Math.min(1, alpha));
  txt(ctx, name, AW / 2, 112, 26, p.hi, 'center', { sp: 10, w: 200, a, sh: 1 });
  txt(ctx, line1, AW / 2, 148, 9, p.fg, 'center', { sp: 3, w: 400, a: a * 0.85, sh: 1 });
  if (line2) txt(ctx, line2, AW / 2, 163, 9, p.warn, 'center', { sp: 3, w: 500, a: a * 0.85, sh: 1 });
}
function star(ctx, cx, cy, r, fill) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr_ = i % 2 ? r * 0.42 : r; const x = cx + Math.cos(a) * rr_, y = cy + Math.sin(a) * rr_; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
}
export function drawStars(ctx, cx, cy, n, r, fill, gap) {   // cx = 中央
  const step = r * 2 + (gap == null ? 3 : gap), x0 = cx - (n - 1) * step / 2;
  for (let i = 0; i < n; i++) star(ctx, x0 + i * step, cy, r, fill);
}
export function drawBonusBanner(ctx, kind, alpha, stars) {
  const p = P();
  const a = Math.max(0, Math.min(1, alpha));
  txt(ctx, 'BONUS MISSION', AW / 2, 122, 9, p.warn, 'center', { sp: 5, w: 500, a, sh: 1 });
  txt(ctx, kind, AW / 2, 138, 20, p.hi, 'center', { sp: 6, w: 200, a, sh: 1 });
  if (stars > 0) { ctx.save(); ctx.globalAlpha = a; drawStars(ctx, AW / 2, 172, Math.min(3, stars), 5, p.warn); ctx.restore(); }
}
export function drawTouchdown(ctx) {
  txt(ctx, 'TOUCHDOWN', AW / 2, 100, 12, P().fg, 'center', { sp: 6, w: 300, sh: 1 });
}

// ================================================================ オーバーレイ
export function veil(ctx, a) { ctx.save(); ctx.fillStyle = rgba('#06080E', a); ctx.fillRect(0, 0, AW, AH); ctx.restore(); }

// ステージクリア（パネル位置は game.js の _clearPanelRect: 着陸シーンと重ならない）
export function drawClearPanel(ctx, r, d) {
  const p = P();
  const cx = r.x + r.w / 2;
  panel(ctx, r.x, r.y, r.w, r.h, { a: 0.88 });
  const accent = d.bonus ? p.warn : p.mid;
  txt(ctx, d.bonus ? 'BONUS CLEAR' : 'STAGE CLEAR', cx, r.y + 16, 10, accent, 'center', { sp: 5, w: 500 });
  txt(ctx, d.sub, cx, r.y + 33, 10, d.perfect ? p.warn : p.dim, 'center', { sp: 2.5, w: 400 });
  txt(ctx, d.bonus ? 'BONUS SCORE' : 'STAGE SCORE', cx, r.y + 56, 8, p.dim, 'center', { sp: 3, w: 500 });
  txt(ctx, '+' + d.score, cx, r.y + 68, 38, p.hi, 'center', { w: 200 });
  hair(ctx, r.x + 24, r.y + 118, r.x + r.w - 24, r.y + 118, p.fg, 0.14);
  const cols = d.cols, cwid = (r.w - 48) / cols.length;
  for (let i = 0; i < cols.length; i++) {
    const x = r.x + 24 + cwid * (i + 0.5);
    txt(ctx, cols[i][0], x, r.y + 130, 8, p.dim, 'center', { sp: 2.5, w: 500 });
    txt(ctx, cols[i][1], x, r.y + 144, 17, cols[i][2] || p.fg, 'center', { w: 300 });
  }
  hair(ctx, r.x + 24, r.y + 176, r.x + r.w - 24, r.y + 176, p.fg, 0.14);
  txt(ctx, d.next, cx, r.y + 190, 10, p.fg, 'center', { sp: 3, w: 500, a: 0.7 + 0.3 * Math.sin((d.t || 0) * 3) });
}
export function drawCrashPanel(ctx, d) {
  const p = P();
  const cx = AW / 2, cy = AH / 2;
  panel(ctx, 20, cy - 100, AW - 40, 196, { a: 0.9, border: p.bad, ba: 0.30 });
  txt(ctx, 'CRASHED', cx, cy - 84, 24, p.bad, 'center', { sp: 8, w: 300 });
  txt(ctx, d.reason, cx, cy - 48, 10, p.warn, 'center', { sp: 3, w: 500 });
  txt(ctx, 'SCORE', cx, cy - 26, 8, p.dim, 'center', { sp: 3, w: 500 });
  num(ctx, d.score, cx + numWidth(d.score, 18) / 2, cy - 14, 18, p.fg, { w: 300 });
  pill(ctx, cx - 112, cy + 14, 224, 32, rgba(p.fg, 0.10), rgba(p.fg, 0.28));
  txt(ctx, 'TAP TO CONTINUE  ·  ' + d.left + ' LEFT', cx, cy + 24, 10, p.hi, 'center', { sp: 2, w: 500 });
  const g = d.giveUp;
  pill(ctx, g.x, g.y, g.w, g.h, null, rgba(p.fg, 0.2));
  txt(ctx, 'GIVE UP', g.x + g.w / 2, g.y + 11, 9, p.dim, 'center', { sp: 3, w: 500 });
}
export function drawBonusFailedPanel(ctx, d) {
  const p = P();
  const cx = AW / 2, cy = AH / 2;
  panel(ctx, 20, cy - 90, AW - 40, 170, { a: 0.9, border: p.warn, ba: 0.28 });
  txt(ctx, 'BONUS FAILED', cx, cy - 72, 20, p.warn, 'center', { sp: 6, w: 300 });
  txt(ctx, d.reason, cx, cy - 36, 10, p.fg, 'center', { sp: 3, w: 500 });
  txt(ctx, 'NO CONTINUE USED', cx, cy - 16, 8, p.dim, 'center', { sp: 3, w: 500 });
  pill(ctx, cx - 100, cy + 16, 200, 32, rgba(p.fg, 0.10), rgba(p.fg, 0.28));
  txt(ctx, 'TAP  ·  STAGE ' + d.next, cx, cy + 26, 10, p.hi, 'center', { sp: 3, w: 500 });
}
export function drawModuleCards(ctx, d) {
  const p = P();
  veil(ctx, 0.8);
  txt(ctx, 'CHOOSE A MODULE', AW / 2, 92, 16, p.hi, 'center', { sp: 6, w: 300 });
  txt(ctx, d.sub, AW / 2, 122, 8, p.dim, 'center', { sp: 3, w: 500 });
  for (let i = 0; i < d.cards.length; i++) {
    const c = d.cards[i], r = c.rect;
    panel(ctx, r.x, r.y, r.w, r.h, { a: 0.78, border: p.mid, ba: 0.22 });
    ctx.save();
    ctx.beginPath(); ctx.arc(r.x + 40, r.y + 38, 22, 0, TAU);
    ctx.strokeStyle = rgba(p.warn, 0.5); ctx.lineWidth = 1; ctx.stroke();
    ctx.restore();
    drawModuleGlyph(ctx, c.id, r.x + 40, r.y + 38, 10, p.warn);
    txt(ctx, c.name, r.x + 76, r.y + 22, 14, p.hi, 'left', { sp: 3, w: 400 });
    txt(ctx, c.level, r.x + 76, r.y + 44, 9, p.mid, 'left', { sp: 2.5, w: 500 });
    hair(ctx, r.x + 20, r.y + 76, r.x + r.w - 20, r.y + 76, p.fg, 0.12);
    txt(ctx, c.desc, r.x + 20, r.y + 90, 10, p.fg, 'left', { sp: 1.2, w: 400, a: 0.85 });
    txt(ctx, 'TAP TO TAKE', r.x + r.w / 2, r.y + r.h - 28, 8, p.dim, 'center', { sp: 4, w: 500 });
  }
}
// ボーナスミッション選択: 3枚のカード（星・名前・条件・倍率）と控えめな SKIP BONUS。背景は TERRA の昼空なので薄めの幕。
export function drawBonusCards(ctx, d) {
  const p = P();
  veil(ctx, 0.3);
  txt(ctx, 'BONUS MISSION', AW / 2, 62, 16, p.hi, 'center', { sp: 6, w: 300 });
  txt(ctx, d.sub, AW / 2, 88, 8, p.fg, 'center', { sp: 3, w: 500, sh: 1 });
  for (let i = 0; i < d.cards.length; i++) {
    const c = d.cards[i], r = c.rect;
    panel(ctx, r.x, r.y, r.w, r.h, { a: 0.8, border: p.warn, ba: 0.2 + 0.05 * c.stars });
    drawStars(ctx, r.x + 20 + (c.stars - 1) * 6.5, r.y + 20, c.stars, 5, p.warn);
    txt(ctx, c.name, r.x + 20, r.y + 36, 15, p.hi, 'left', { sp: 3, w: 400 });
    txt(ctx, c.line, r.x + 20, r.y + 62, 8, p.fg, 'left', { sp: 2, w: 500, a: 0.85 });
    if (c.extra) txt(ctx, c.extra, r.x + 20, r.y + 80, 8, p.warn, 'left', { sp: 2, w: 500 });
    txt(ctx, 'SCORE', r.x + r.w - 20, r.y + 14, 7, p.dim, 'right', { sp: 2.5, w: 500 });
    txt(ctx, '\u00d7' + c.mult.toFixed(1), r.x + r.w - 20, r.y + 28, 24, p.hi, 'right', { w: 300 });
  }
  const k = d.skip;
  pill(ctx, k.x, k.y, k.w, k.h, rgba('#06080E', 0.6), rgba(p.fg, 0.32));
  txt(ctx, 'SKIP BONUS', k.x + k.w / 2, k.y + k.h / 2 - 5, 9, p.fg, 'center', { sp: 3, w: 500, a: 0.85 });
}
export function drawGameOverFrame(ctx, d) {
  const p = P();
  const cx = AW / 2;
  veil(ctx, 0.55);
  panel(ctx, 20, 60, AW - 40, 520, { a: 0.84 });
  txt(ctx, 'GAME OVER', cx, 76, 22, p.fg, 'center', { sp: 8, w: 300 });
  txt(ctx, 'SCORE  ' + d.score + '   ·   STAGE ' + d.stage, cx, 108, 10, p.fg, 'center', { sp: 2.5, w: 400 });
  if (d.debugRun) txt(ctx, 'DEBUG RUN  ·  NOT RECORDED', cx, 126, 9, p.warn, 'center', { sp: 3, w: 500 });
  else txt(ctx, d.newRecord ? 'NEW RECORD' : 'RANKING', cx, 126, 9, d.newRecord ? p.warn : p.mid, 'center', { sp: 5, w: 500 });
}
export function drawGameOverFooter(ctx) {
  txt(ctx, 'TAP  ·  TITLE', AW / 2, 546, 10, P().fg, 'center', { sp: 4, w: 500, a: 0.8 });
}
export function drawDebugPanel(ctx, title, subtitle, buttons) {
  const p = P();
  panel(ctx, 20, 70, AW - 40, 470, { a: 0.88, border: p.warn, ba: 0.3 });
  txt(ctx, title, AW / 2, 80, 14, p.warn, 'center', { sp: 6, w: 500 });
  txt(ctx, subtitle, AW / 2, 98, 9, p.mid, 'center', { sp: 2.5, w: 400 });
  for (let i = 0; i < buttons.length; i++) {
    const b = buttons[i];
    pill(ctx, b.x, b.y, b.w, b.h, rgba(p.fg, 0.05), rgba(p.fg, 0.22));
    txt(ctx, b.label, b.x + b.w / 2, b.y + 12, 10, p.fg, 'center', { sp: 1.5, w: 400 });
  }
}
export function drawDebugTag(ctx, b) {
  const p = P();
  pill(ctx, b.x, b.y, b.w, b.h, rgba('#06080E', 0.5), rgba(p.warn, 0.55));
  txt(ctx, 'DBG', b.x + b.w / 2, b.y + 3.5, 8, p.warn, 'center', { sp: 1.5, w: 500 });
}

// ================================================================ P2b: タイトル（地球の発射場）と発射シーケンス
// 世界座標は論理画面(360x640)と同じ。発射中はカメラ(camY)で世界を下へずらす。
// 機体は汎用の白い再使用型ブースター（ロゴ・ブランド・既存機体のリバリーは使わない）。
export const SITE = { groundY: 396, rocketX: 200, towerX: 111, armY: 262, upperArmY: 214, towerTop: 176, rocketH: 232, hw: 15 };

// 宇宙飛行士の1サイクル(22秒): タワーから歩く → 手を振る → 搭乗 → 内部 → ハッチで手を振る → 引っ込む → 無人
export function astronautCycle(t) {
  const C = 22, u = ((t % C) + C) % C;
  const x0 = 114, x1 = 174, x2 = 180;
  const sm = (a) => a * a * (3 - 2 * a);
  if (u < 0.5) return { x: x0, mode: 'walk', a: sm(u / 0.5), glow: 0 };
  if (u < 4.5) return { x: x0 + (x1 - x0) * (u - 0.5) / 4, mode: 'walk', a: 1, glow: 0 };
  if (u < 7) return { x: x1, mode: 'wave', a: 1, glow: 0.25 };
  if (u < 7.8) { const k = (u - 7) / 0.8; return { x: x1 + (x2 - x1) * k, mode: 'walk', a: 1 - sm(k), glow: 0.25 + 0.75 * k }; }
  if (u < 14) return { x: x2, mode: 'hidden', a: 0, glow: 1 };
  if (u < 14.6) return { x: x2, mode: 'wave', a: sm((u - 14) / 0.6), glow: 1 };
  if (u < 17) return { x: x2, mode: 'wave', a: 1, glow: 1 };
  if (u < 17.6) return { x: x2, mode: 'wave', a: 1 - sm((u - 17) / 0.6), glow: 1 };
  if (u < 19.5) return { x: x2, mode: 'hidden', a: 0, glow: 1 - (u - 17.6) / 1.9 };
  return { x: x0, mode: 'hidden', a: 0, glow: 0 };
}

export function drawTitleSky(ctx, o) {
  const k = Math.max(0, Math.min(1, o.space || 0)), gY = SITE.groundY, camY = o.camY || 0;
  const hy = gY + camY;
  const c = (hex) => mixHex(hex, '#06080E', k);
  const g = mkL(ctx, 0, 0, 0, Math.max(200, hy));
  g.addColorStop(0, c('#04060f')); g.addColorStop(0.5, c('#0a142b')); g.addColorStop(0.8, c('#16294a'));
  g.addColorStop(0.94, c('#2c4466')); g.addColorStop(1, c('#8f6a66'));
  ctx.fillStyle = g; ctx.fillRect(0, 0, AW, AH);
  // 地平線のほのかな暁光
  if (k < 0.98) {
    ctx.save(); ctx.translate(120, hy); ctx.scale(280, 96);
    ctx.globalAlpha = 0.20 * (1 - k);
    ctx.fillStyle = gRad(ctx, 'tsGlow', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,164,108,0.9)'], [0.45, 'rgba(255,140,96,0.35)'], [1, 'rgba(255,120,90,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill();
    ctx.restore();
  }
  // 星（まばら・ゆっくり瞬く。深い星は宇宙に近づくほど現れる）
  const stars = o.stars || [], t = o.t || 0, fg = P().fg;
  ctx.save();
  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    const y = s.y + camY * 0.35;
    const fh = Math.max(0, Math.min(1, (hy - 26 - y) / 150));
    if (fh <= 0 || y < -2) continue;
    let a = (0.28 + 0.5 * Math.abs(Math.sin(t * 0.7 + s.tw))) * fh * (0.7 + 0.8 * k);
    if (s.deep) a *= k;
    if (a < 0.02) continue;
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.arc(s.x, y, s.r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function avLight(ctx, x, y, t, ph) {
  const u = (t + ph) % 2.6;
  const a = u < 0.5 ? 1 - u / 0.5 : 0;
  ctx.fillStyle = rgba('#ff4a3d', 0.28 + 0.72 * a);
  ctx.beginPath(); ctx.arc(x, y, 1.5, 0, TAU); ctx.fill();
  if (a > 0.02) {
    ctx.save(); ctx.translate(x, y); ctx.scale(9, 9); ctx.globalAlpha = 0.6 * a;
    ctx.fillStyle = gRad(ctx, 'tsRed', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,74,61,0.9)'], [1, 'rgba(255,74,61,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  }
}

// 地面・遠景・パッド（世界座標）
export function drawLaunchSite(ctx, o) {
  const gY = SITE.groundY, rx = SITE.rocketX, t = (o && o.t) || 0;
  ctx.save();
  // 遠景の丘と灯り
  ctx.beginPath(); ctx.moveTo(-10, gY + 2);
  for (let x = -10; x <= AW + 10; x += 10) ctx.lineTo(x, gY - 7 - 5 * Math.sin(x * 0.031 + 1) - 4 * Math.sin(x * 0.073 + 2));
  ctx.lineTo(AW + 10, gY + 2); ctx.closePath();
  ctx.fillStyle = '#0a111d'; ctx.fill();
  for (let i = 0; i < 6; i++) {
    const x = 18 + i * 61 + (i % 2) * 14, y = gY - 9 - 5 * Math.sin(x * 0.031 + 1) - 4 * Math.sin(x * 0.073 + 2);
    ctx.fillStyle = rgba('#ffc878', 0.30 + 0.2 * Math.sin(t * 0.9 + i * 2));
    ctx.fillRect(x, y, 1.4, 1.4);
  }
  // 地面
  ctx.fillStyle = gLin(ctx, 'tsGround', 0, gY, 0, gY + 130, [[0, '#101826'], [0.35, '#0a0f19'], [1, '#06080E']]);
  ctx.fillRect(-20, gY, AW + 40, 900);
  ctx.fillStyle = rgba('#9db4d6', 0.16); ctx.fillRect(-20, gY, AW + 40, 1);
  // パッドの床照明
  ctx.save(); ctx.translate(rx, gY + 2); ctx.scale(130, 14); ctx.globalAlpha = 0.5;
  ctx.fillStyle = gRad(ctx, 'tsPadLight', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,214,160,0.28)'], [1, 'rgba(255,214,160,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  // パッド（スラブ）
  ctx.beginPath(); ctx.moveTo(rx - 88, gY); ctx.lineTo(rx + 88, gY); ctx.lineTo(rx + 102, gY + 10); ctx.lineTo(rx - 102, gY + 10); ctx.closePath();
  ctx.fillStyle = '#1b2433'; ctx.fill();
  ctx.fillStyle = '#2d3a4f'; ctx.fillRect(rx - 88, gY, 176, 2);
  ctx.fillStyle = '#0a0e16'; ctx.fillRect(rx - 20, gY + 2, 40, 8);        // 炎導坑
  // 照明柱
  for (const lx of [rx - 74, rx + 78]) {
    ctx.strokeStyle = '#3a475c'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(lx, gY); ctx.lineTo(lx, gY - 17); ctx.stroke();
    ctx.fillStyle = '#ffd9a0'; ctx.fillRect(lx - 2.5, gY - 18.5, 5, 1.6);
    ctx.save(); ctx.translate(lx, gY - 18); ctx.scale(15, 15); ctx.globalAlpha = 0.7;
    ctx.fillStyle = gRad(ctx, 'tsLamp', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,214,160,0.55)'], [1, 'rgba(255,214,160,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// サービスタワー（格子・デッキ・クルーアクセスアーム・航空障害灯）。o.arm: 0=接続 → 1=退避
export function drawTower(ctx, o) {
  const x = SITE.towerX, gY = SITE.groundY, top = SITE.towerTop, t = (o && o.t) || 0;
  const k = Math.max(0, Math.min(1, (o && o.arm) || 0));
  const STEEL = '#3b485d', LIT = '#6a7d99';
  const rEdge = SITE.rocketX - SITE.hw;
  ctx.save();
  ctx.lineCap = 'butt';
  // 脚
  ctx.strokeStyle = STEEL; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x - 9, gY); ctx.lineTo(x - 9, top); ctx.moveTo(x + 9, gY); ctx.lineTo(x + 9, top); ctx.stroke();
  ctx.strokeStyle = rgba(LIT, 0.75); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(x + 9.9, gY); ctx.lineTo(x + 9.9, top); ctx.stroke();
  // ブレース
  ctx.strokeStyle = rgba(STEEL, 0.95); ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0, y = gY; y - 22 >= top; i++, y -= 22) {
    if (i % 2) { ctx.moveTo(x + 9, y); ctx.lineTo(x - 9, y - 22); } else { ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y - 22); }
    ctx.moveTo(x - 9, y - 22); ctx.lineTo(x + 9, y - 22);
  }
  ctx.stroke();
  // キャップとマスト
  ctx.fillStyle = STEEL; ctx.fillRect(x - 11, top - 3, 22, 4);
  ctx.strokeStyle = LIT; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, top - 3); ctx.lineTo(x, top - 26); ctx.stroke();
  // アーム（ヒンジ=タワー側。退避は奥へ回る表現として横幅を縮める）
  const sx = Math.max(0.04, 1 - k * 0.96);
  const arm = (y, tipX, withRail) => {
    ctx.save(); ctx.translate(x + 9, y); ctx.scale(sx, 1);
    const len = tipX - (x + 9);
    ctx.fillStyle = '#566782'; ctx.fillRect(0, 0, len, 3);
    ctx.fillStyle = '#2b3445'; ctx.fillRect(0, 3, len, 1.5);
    if (withRail) {
      ctx.strokeStyle = rgba(LIT, 0.7); ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(len, -9);
      for (let px = 0; px <= len; px += 13) { ctx.moveTo(px, 0); ctx.lineTo(px, -9); }
      ctx.stroke();
    }
    ctx.restore();
  };
  ctx.fillStyle = STEEL; ctx.fillRect(x - 12, SITE.armY - 1, 8, 4); ctx.fillRect(x - 12, SITE.upperArmY - 1, 8, 4);
  arm(SITE.upperArmY, rEdge - 1, false);
  arm(SITE.armY, rEdge - 0.5, true);
  // アンビリカル（アーム退避で外れる）
  if (k < 0.35) {
    ctx.globalAlpha = 1 - k / 0.35;
    ctx.strokeStyle = '#1a212e'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x + 9, 318); ctx.quadraticCurveTo((x + rEdge) / 2, 330, rEdge, 316); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  // 航空障害灯（ゆっくり点滅）
  avLight(ctx, x, top - 26, t, 0);
  avLight(ctx, x + 9, top + 70, t, 1.3);
  ctx.restore();
}

// 汎用の白い再使用型ブースター。(x, y) = エンジン下端の中央。
export function drawRocket(ctx, x, y, o) {
  const hw = SITE.hw, glow = (o && o.glow) || 0;
  ctx.save();
  ctx.translate(x, y);
  // エンジン・脚（折りたたみ）
  ctx.fillStyle = '#2a303b'; ctx.fillRect(-12, -9, 24, 9);
  ctx.fillStyle = '#3a342f';
  for (const bx of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(bx - 3, 0); ctx.lineTo(bx + 3, 0); ctx.lineTo(bx + 2, 3.5); ctx.lineTo(bx - 2, 3.5); ctx.closePath(); ctx.fill(); }
  ctx.strokeStyle = '#c9d2de'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-hw, -38); ctx.lineTo(-hw - 3.5, -3); ctx.moveTo(hw, -38); ctx.lineTo(hw + 3.5, -3); ctx.stroke();
  ctx.strokeStyle = '#8b97aa'; ctx.lineWidth = 1.4;
  ctx.beginPath(); ctx.moveTo(-hw - 6, -2.5); ctx.lineTo(-hw - 1, -2.5); ctx.moveTo(hw + 1, -2.5); ctx.lineTo(hw + 6, -2.5); ctx.stroke();
  // グリッドフィン
  ctx.fillStyle = '#39424f'; ctx.fillRect(-hw - 5, -119, 5, 10); ctx.fillRect(hw, -119, 5, 10);
  ctx.strokeStyle = 'rgba(190,200,215,0.35)'; ctx.lineWidth = 0.5;
  ctx.beginPath(); ctx.moveTo(-hw - 5, -114); ctx.lineTo(-hw, -114); ctx.moveTo(hw, -114); ctx.lineTo(hw + 5, -114); ctx.stroke();
  // 本体（横方向のグラデ: 左=暁光の暖色、右=夜側の青）
  const body = gLin(ctx, 'rkBody', -hw, 0, hw, 0, [[0, '#e8dccd'], [0.28, '#fbf8f2'], [0.62, '#dbe2ec'], [1, '#8e9cb3']]);
  ctx.fillStyle = body;
  ctx.fillRect(-hw, -126, hw * 2, 117);                       // 1段目
  ctx.fillRect(-hw, -192, hw * 2, 64);                        // 2段目
  ctx.beginPath(); ctx.moveTo(-hw, -192); ctx.quadraticCurveTo(-hw, -220, 0, -SITE.rocketH); ctx.quadraticCurveTo(hw, -220, hw, -192); ctx.closePath(); ctx.fill();   // フェアリング
  // 段間
  ctx.fillStyle = '#9aa7ba'; ctx.fillRect(-hw, -130, hw * 2, 4);
  ctx.fillStyle = rgba(P().mid, 0.75); ctx.fillRect(-hw, -126, hw * 2, 1.2);
  // パネルの継ぎ目
  ctx.strokeStyle = 'rgba(120,135,160,0.28)'; ctx.lineWidth = 0.6;
  ctx.beginPath();
  for (const yy of [-34, -62, -92, -158, -190]) { ctx.moveTo(-hw, yy); ctx.lineTo(hw, yy); }
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.7;      // ハイライトの縦線
  ctx.beginPath(); ctx.moveTo(-hw + 4.5, -126); ctx.lineTo(-hw + 4.5, -12); ctx.moveTo(-hw + 4.5, -190); ctx.lineTo(-hw + 4.5, -132); ctx.stroke();
  // クルーハッチ（アーム高さ）
  const hy = -(SITE.groundY - SITE.armY);
  rr(ctx, -hw + 1.5, hy - 24, 7, 24, 3);
  ctx.fillStyle = rgba('#202a3a', 0.78); ctx.fill();
  if (glow > 0.01) {
    ctx.fillStyle = rgba('#ffcf8a', 0.85 * glow);
    rr(ctx, -hw + 2.5, hy - 22, 5, 20, 2); ctx.fill();
    ctx.save(); ctx.translate(-hw + 5, hy - 12); ctx.scale(14, 18); ctx.globalAlpha = 0.5 * glow;
    ctx.fillStyle = gRad(ctx, 'rkHatch', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,200,130,0.7)'], [1, 'rgba(255,200,130,0)']]);
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  }
  ctx.restore();
}

// 噴射炎（ノズルは (x,y)）。k: 0..1。clipY: これより下は描かない（パッド上では炎導坑の中に収める）
export function drawLaunchFlame(ctx, x, y, k, t, clipY) {
  if (k <= 0.01) return;
  ctx.save();
  if (clipY !== undefined && clipY !== null) { ctx.beginPath(); ctx.rect(x - 160, y - 400, 320, clipY - (y - 400)); ctx.clip(); }
  const fl = 0.92 + 0.08 * Math.sin(t * 47) + 0.05 * Math.sin(t * 29);
  const L = (26 + 92 * k) * fl;
  // 外炎（琥珀）
  ctx.save(); ctx.translate(x, y + 2); ctx.scale(1, L); ctx.globalAlpha = Math.min(1, 0.6 + k);
  ctx.fillStyle = gLin(ctx, 'flOut', 0, 0, 0, 1, [[0, 'rgba(255,248,230,1)'], [0.25, 'rgba(255,200,112,0.95)'], [0.7, 'rgba(255,156,64,0.5)'], [1, 'rgba(255,120,40,0)']]);
  ctx.beginPath(); ctx.moveTo(-12, 0); ctx.quadraticCurveTo(-11, 0.45, 0, 1); ctx.quadraticCurveTo(11, 0.45, 12, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 白い芯
  ctx.save(); ctx.translate(x, y + 2); ctx.scale(1, L * 0.62); ctx.globalAlpha = Math.min(1, 0.5 + k);
  ctx.fillStyle = gLin(ctx, 'flCore', 0, 0, 0, 1, [[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,248,230,0.8)'], [1, 'rgba(255,230,180,0)']]);
  ctx.beginPath(); ctx.moveTo(-6, 0); ctx.quadraticCurveTo(-5, 0.5, 0, 1); ctx.quadraticCurveTo(5, 0.5, 6, 0); ctx.closePath(); ctx.fill();
  ctx.restore();
  // 根元のグロー
  ctx.save(); ctx.translate(x, y + 4); ctx.scale(34 + 26 * k, 22 + 14 * k); ctx.globalAlpha = 0.55 * k;
  ctx.fillStyle = gRad(ctx, 'flGlow', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,230,180,0.95)'], [0.4, 'rgba(255,170,90,0.45)'], [1, 'rgba(255,140,60,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  ctx.restore();
}

// 地面を横に走る炎の照り返し
export function drawGroundBlast(ctx, x, gY, k) {
  if (k <= 0.01) return;
  ctx.save(); ctx.translate(x, gY + 1); ctx.scale(60 + 90 * k, 12 + 10 * k); ctx.globalAlpha = 0.55 * k;
  ctx.fillStyle = gRad(ctx, 'flGround', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,196,120,0.9)'], [0.5, 'rgba(255,140,70,0.35)'], [1, 'rgba(255,120,60,0)']]);
  ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
}

// 煙・蒸気。粒子 {x,y,r,age,life,ph,spin,peak,kind(0=煙,1=蒸気),warm}。1粒 = 複数の柔らかい円(ローブ)＋下側の陰
export function drawSmoke(ctx, parts) {
  if (!parts || !parts.length) return;
  const cool = gRad(ctx, 'smC', 0, 0, 0, 0, 0, 1, [[0, 'rgba(246,247,251,0.98)'], [0.58, 'rgba(228,233,243,0.86)'], [0.84, 'rgba(208,216,234,0.34)'], [1, 'rgba(200,208,228,0)']]);
  const shd = gRad(ctx, 'smS', 0, 0, 0, 0, 0, 1, [[0, 'rgba(66,78,108,0.95)'], [0.6, 'rgba(76,88,118,0.6)'], [0.9, 'rgba(80,92,120,0.2)'], [1, 'rgba(80,92,120,0)']]);
  const wrm = gRad(ctx, 'smW', 0, 0, 0, 0, 0, 1, [[0, 'rgba(255,226,176,0.95)'], [0.5, 'rgba(255,172,98,0.45)'], [1, 'rgba(255,140,70,0)']]);
  const blob = (g, cx, cy, rad, al) => {
    if (!(rad > 0.5) || al < 0.01) return;
    ctx.save(); ctx.translate(cx, cy); ctx.scale(rad, rad); ctx.globalAlpha = Math.min(1, al); ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, TAU); ctx.fill(); ctx.restore();
  };
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    const u = p.age / p.life;
    const a = p.peak * Math.min(1, p.age / 0.2) * Math.pow(Math.max(0, 1 - u), 1.0);
    if (a < 0.01) continue;
    if (p.kind === 1) { blob(cool, p.x, p.y, p.r, a); blob(cool, p.x + p.r * 0.35, p.y - p.r * 0.25, p.r * 0.7, a * 0.7); continue; }
    blob(shd, p.x + p.r * 0.08, p.y + p.r * 0.3, p.r * 0.92, a * 0.62);
    if (p.warm > 0 && p.age < 1.2) blob(wrm, p.x, p.y + p.r * 0.3, p.r * 0.9, a * 0.6 * (1 - p.age / 1.2));
    for (let j = 0; j < 4; j++) {
      const ang = p.ph + p.spin * p.age + j * 1.571;
      blob(cool, p.x + Math.cos(ang) * p.r * 0.5, p.y + Math.sin(ang) * p.r * 0.34 - p.r * 0.06, p.r * (0.5 + 0.07 * j), a * 0.78);
    }
  }
}

// スピーカーのピクトグラム（ミュート時は×）。s=1 で約14px
export function drawSpeaker(ctx, cx, cy, s, color, muted) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.fillStyle = color; ctx.strokeStyle = color; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-6, -2.6); ctx.lineTo(-3, -2.6); ctx.lineTo(1, -6); ctx.lineTo(1, 6); ctx.lineTo(-3, 2.6); ctx.lineTo(-6, 2.6); ctx.closePath(); ctx.fill();
  if (!muted) {
    ctx.beginPath(); ctx.arc(1.5, 0, 4.2, -0.95, 0.95); ctx.stroke();
    ctx.beginPath(); ctx.arc(1.5, 0, 7.6, -0.9, 0.9); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.moveTo(4, -3); ctx.lineTo(9, 3); ctx.moveTo(9, -3); ctx.lineTo(4, 3); ctx.stroke();
  }
  ctx.restore();
}

// ================================================================ MISSION HOLD / ABORT
// HUDのHOLDボタン: ヘアラインの円 + 縦2本線（ミュートのスピーカーと同じ静かなトーン）
export function drawHoldButton(ctx, r) {
  const p = P();
  const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, 12, 0, TAU);
  ctx.fillStyle = rgba('#06080E', 0.4); ctx.fill();
  ctx.strokeStyle = rgba(p.fg, 0.32); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = rgba(p.fg, 0.8);
  ctx.fillRect(cx - 4, cy - 5, 2.6, 10);
  ctx.fillRect(cx + 1.4, cy - 5, 2.6, 10);
  ctx.restore();
}
// d: { confirm, stage, body, clock(秒), score, buttons:[{label,x,y,w,h,kind:'main'|'danger'}] }
export function drawHoldPanel(ctx, d) {
  const p = P();
  const cx = AW / 2;
  veil(ctx, 0.55);
  const conf = !!d.confirm;
  const edge = conf ? p.bad : p.mid;
  panel(ctx, 40, 184, AW - 80, 272, { a: 0.9, border: edge, ba: conf ? 0.32 : 0.22 });
  if (!conf) {
    txt(ctx, 'MISSION HOLD', cx, 208, 18, p.hi, 'center', { sp: 6, w: 300 });
    txt(ctx, 'STAGE ' + d.stage + (d.body ? '  ·  ' + String(d.body).toUpperCase() : ''), cx, 248, 9, p.fg, 'center', { sp: 3, w: 500 });
    const s = Math.max(0, Math.floor(d.clock || 0));
    const mm = Math.floor(s / 60), ss = s % 60;
    txt(ctx, 'T+ ' + (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss, cx, 268, 9, p.dim, 'center', { sp: 3, w: 500 });
  } else {
    txt(ctx, 'ABORT MISSION?', cx, 208, 18, p.bad, 'center', { sp: 5, w: 300 });
    txt(ctx, 'YOUR SCORE WILL BE RECORDED', cx, 248, 9, p.fg, 'center', { sp: 3, w: 500 });
    txt(ctx, 'SCORE  ' + (d.score || 0), cx, 268, 9, p.dim, 'center', { sp: 3, w: 500 });
  }
  hair(ctx, 64, 296, AW - 64, 296, p.fg, 0.12);
  for (let i = 0; i < d.buttons.length; i++) {
    const b = d.buttons[i];
    const danger = b.kind === 'danger';
    pill(ctx, b.x, b.y, b.w, b.h, danger ? rgba(p.bad, 0.10) : rgba(p.fg, 0.10), danger ? rgba(p.bad, 0.55) : rgba(p.fg, 0.28));
    txt(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - 5, 10, danger ? p.bad : p.hi, 'center', { sp: 3, w: 500 });
  }
}

// 小さな非ブロッキングの注記（y: 既定はランキング枠の下）
export function drawNote(ctx, text, y) {
  txt(ctx, text, AW / 2, y === undefined ? 556 : y, 8, P().warn, 'center', { sp: 2, w: 500, a: 0.9 });
}
// DEBUG: WORLD ADMIN の一覧。d = { phase:'loading'|'list'|'error', msg, rows:[{label,sub,del:{x,y,w,h}}], prev, next, close, page, pages, confirm:{text,yes,no}|null }
export function drawAdminPanel(ctx, d) {
  const p = P();
  panel(ctx, 20, 70, AW - 40, 520, { a: 0.9, border: p.warn, ba: 0.3 });
  txt(ctx, 'WORLD ADMIN', AW / 2, 80, 14, p.warn, 'center', { sp: 6, w: 500 });
  if (d.msg) txt(ctx, d.msg, AW / 2, 102, 9, d.phase === 'error' ? p.bad : p.mid, 'center', { sp: 2.5, w: 500 });
  if (d.confirm) {
    txt(ctx, d.confirm.text, AW / 2, 240, 11, p.fg, 'center', { sp: 2, w: 500 });
    for (const b of [d.confirm.yes, d.confirm.no]) {
      pill(ctx, b.x, b.y, b.w, b.h, rgba(b === d.confirm.yes ? p.bad : p.fg, 0.10), rgba(b === d.confirm.yes ? p.bad : p.fg, 0.4));
      txt(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - 5, 10, b === d.confirm.yes ? p.bad : p.hi, 'center', { sp: 3, w: 500 });
    }
    return;
  }
  for (const r of d.rows) {
    hair(ctx, 36, r.del.y - 4, AW - 36, r.del.y - 4, p.fg, 0.08);
    txt(ctx, r.label, 36, r.del.y + 4, 11, p.fg, 'left', { sp: 1.5, w: 500 });
    txt(ctx, r.sub, 36, r.del.y + 22, 8, p.dim, 'left', { sp: 1.5, w: 400 });
    pill(ctx, r.del.x, r.del.y, r.del.w, r.del.h, rgba(p.bad, 0.08), rgba(p.bad, 0.4));
    txt(ctx, 'DEL', r.del.x + r.del.w / 2, r.del.y + r.del.h / 2 - 4, 9, p.bad, 'center', { sp: 2, w: 500 });
  }
  for (const k of ['prev', 'next', 'close']) {
    const b = d[k]; if (!b) continue;
    pill(ctx, b.x, b.y, b.w, b.h, null, rgba(p.fg, 0.25));
    txt(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - 4, 9, p.fg, 'center', { sp: 2, w: 500 });
  }
  if (d.pages > 1) txt(ctx, (d.page + 1) + ' / ' + d.pages, AW / 2, 548, 9, p.dim, 'center', { sp: 3, w: 500 });
}
// タイトル: PILOTS パネル / PUBLIC BETA。d = { mode:'list'|'confirm', rows:[{name,active,sel,del}], add, close, msg, confirm:{text,yes,no} }
export function drawProfilePanel(ctx, d) {
  const p = P();
  veil(ctx, 0.6);
  panel(ctx, 20, 110, AW - 40, 360, { a: 0.92, border: p.mid, ba: 0.25 });
  txt(ctx, 'PILOTS', AW / 2, 126, 16, p.hi, 'center', { sp: 8, w: 300 });
  if (d.mode === 'confirm') {
    txt(ctx, d.confirm.l1, AW / 2, 196, 12, p.fg, 'center', { sp: 2, w: 500 });
    txt(ctx, d.confirm.l2, AW / 2, 220, 8, p.warn, 'center', { sp: 2, w: 500 });
    for (const b of [d.confirm.yes, d.confirm.no]) {
      const danger = b === d.confirm.yes;
      pill(ctx, b.x, b.y, b.w, b.h, rgba(danger ? p.bad : p.fg, 0.10), rgba(danger ? p.bad : p.fg, 0.45));
      txt(ctx, b.label, b.x + b.w / 2, b.y + b.h / 2 - 5, 10, danger ? p.bad : p.hi, 'center', { sp: 3, w: 500 });
    }
    if (d.msg) txt(ctx, d.msg, AW / 2, 420, 8, p.bad, 'center', { sp: 2, w: 500 });
    return;
  }
  for (const r of d.rows) {
    pill(ctx, r.sel.x, r.sel.y, r.sel.w, r.sel.h, r.active ? rgba(p.mid, 0.10) : null, rgba(r.active ? p.mid : p.fg, r.active ? 0.6 : 0.2));
    txt(ctx, r.name, r.sel.x + 18, r.sel.y + r.sel.h / 2 - 7, 13, r.active ? p.hi : p.fg, 'left', { sp: 3, w: 500 });
    pill(ctx, r.del.x, r.del.y, r.del.w, r.del.h, null, rgba(p.bad, 0.4));
    txt(ctx, 'DEL', r.del.x + r.del.w / 2, r.del.y + r.del.h / 2 - 4, 9, p.bad, 'center', { sp: 2, w: 500 });
  }
  if (!d.rows.length) txt(ctx, 'NO PILOTS YET', AW / 2, 190, 9, p.dim, 'center', { sp: 4, w: 500 });
  const a = d.add;
  pill(ctx, a.x, a.y, a.w, a.h, a.off ? null : rgba(p.mid, 0.08), rgba(p.mid, a.off ? 0.18 : 0.5));
  txt(ctx, a.off ? 'MAX 3 PILOTS' : 'ADD PILOT', a.x + a.w / 2, a.y + a.h / 2 - 5, 10, a.off ? p.dim : p.hi, 'center', { sp: 4, w: 500 });
  const c = d.close;
  pill(ctx, c.x, c.y, c.w, c.h, null, rgba(p.fg, 0.22));
  txt(ctx, 'CLOSE', c.x + c.w / 2, c.y + c.h / 2 - 4, 9, p.fg, 'center', { sp: 4, w: 500 });
  if (d.msg) txt(ctx, d.msg, AW / 2, 440, 8, p.bad, 'center', { sp: 2, w: 500 });
}
// CHOOSE START パネル（PILOTS と同じ言語）。d = { title, rows:[{rect,label,stage,g,cursor,best}], page, pages, prev, next, cancel, hint }
export function drawStartPanel(ctx, d) {
  const p = P();
  veil(ctx, 0.6);
  panel(ctx, 20, 70, AW - 40, 500, { a: 0.92, border: p.mid, ba: 0.25 });
  txt(ctx, d.title || 'CHOOSE START', AW / 2, 86, 16, p.hi, 'center', { sp: 6, w: 300 });
  txt(ctx, d.hint || 'SCORE STARTS AT 0', AW / 2, 108, 7, p.dim, 'center', { sp: 3, w: 500 });
  for (const r of d.rows) {
    const b = r.rect;
    pill(ctx, b.x, b.y, b.w, b.h, r.cursor ? rgba(p.mid, 0.10) : null, rgba(r.cursor ? p.mid : p.fg, r.cursor ? 0.6 : 0.2));
    txt(ctx, r.label, b.x + 16, b.y + 9, 12, r.cursor ? p.hi : p.fg, 'left', { sp: 3, w: 500 });
    txt(ctx, 'g ' + r.g, b.x + 16, b.y + 28, 8, p.dim, 'left', { sp: 2, w: 500 });
    txt(ctx, 'ST.' + r.stage, b.x + b.w - 14, b.y + 10, 11, r.cursor ? p.hi : p.mid, 'right', { sp: 2, w: 500 });
    if (r.best) txt(ctx, 'FURTHEST', b.x + b.w - 14, b.y + 28, 7, p.warn, 'right', { sp: 3, w: 500 });
  }
  if (d.pages > 1) {
    for (const [b, lab, on] of [[d.prev, '\u2039', d.page > 0], [d.next, '\u203a', d.page < d.pages - 1]]) {
      pill(ctx, b.x, b.y, b.w, b.h, null, rgba(p.fg, on ? 0.3 : 0.1));
      txt(ctx, lab, b.x + b.w / 2, b.y + b.h / 2 - 8, 16, on ? p.hi : p.dim, 'center', { w: 400 });
    }
    txt(ctx, (d.page + 1) + ' / ' + d.pages, AW / 2, d.prev.y + d.prev.h / 2 - 5, 9, p.mid, 'center', { sp: 3, w: 500 });
  }
  const c = d.cancel;
  pill(ctx, c.x, c.y, c.w, c.h, null, rgba(p.fg, 0.22));
  txt(ctx, 'CANCEL', c.x + c.w / 2, c.y + c.h / 2 - 4, 9, p.fg, 'center', { sp: 4, w: 500 });
}
export function drawBetaTag(ctx, r, a) {
  const p = P();
  pill(ctx, r.x, r.y, r.w, r.h, null, rgba(p.fg, 0.16 * a));
  txt(ctx, 'PUBLIC BETA', r.x + r.w / 2, r.y + 4, 7, p.dim, 'center', { sp: 3, w: 500, a });
}

// タイトルの WORLD #1 バナー。box={x,y,w,h}（2行: y+0 と y+14）。d={name,score,title}。maxW1=1行目の最大幅
export function drawWorldBanner(ctx, box, d, a, maxW1) {
  const p = P();
  const cx = box.x + box.w / 2;
  const lim = Math.min(maxW1 || box.w, box.w);
  const SZ = 10, SP = 2;
  const lab = 'WORLD #1', sc = String(d.score);
  const wOf = (str, size, sp) => { ctx.save(); ctx.font = fontStr(400, size); const w = ctx.measureText(str).width; ctx.restore(); return (w >= 0 ? w : 0) + sp * Math.max(0, Array.from(str).length - 1); };
  const gap = 10;
  const wl = wOf(lab, 8, 3), ws = wOf(sc, SZ, 1);
  const name = ellipsize(ctx, d.name, SZ, 400, SP, Math.max(24, lim - wl - ws - gap * 2));
  const wn = wOf(name, SZ, SP);
  const total = wl + gap + wn + gap + ws;
  let x = cx - total / 2;
  txt(ctx, lab, x, box.y + 2, 8, p.dim, 'left', { sp: 3, w: 500, a });
  x += wl + gap;
  txt(ctx, name, x, box.y, SZ, p.fg, 'left', { sp: SP, w: 400, a });
  x += wn + gap;
  txt(ctx, sc, x, box.y, SZ, p.warn, 'left', { sp: 1, w: 500, a });
  if (d.title) txt(ctx, '\u300c' + ellipsize(ctx, d.title, 8, 400, 1, lim - 20) + '\u300d', cx, box.y + 16, 8, p.mid, 'center', { sp: 1, w: 400, a: a * 0.95 });
}
