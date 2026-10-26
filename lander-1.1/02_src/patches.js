// LANDER BETA v1.1 — ミッションパッチ。天体ごとに1枚、その天体のどのステージ（どの周回でも）でも PERFECT で着陸すると手に入る。
// 取得状況は保存せず、'stageBest'（stars.js が正）から毎回導く。デバッグ・ボーナスは記録されないので対象外（★と同じ）。パイロット別。
// 絵は全部コードで描くベクター（NASA のミッションパッチ風：丸い紋章・細い縁・天体ごとの小さな絵・縁の名前）。
// バンドルは1つのスコープなので、非公開のトップレベル名は PT_ で始める。
import { P } from './core/palette.js';
import { BODIES } from './bodies.js';
import { starsSummary, STAR_PERFECT } from './stars.js';
import { txt, rgba, mixHex, FONT } from './art.js';

const PT_TAU = Math.PI * 2;
export const PATCH_COUNT = BODIES.length;
export const PATCH_AWARD_S = 1.3;       // クリア画面でパッチが飛んでくる演出の長さ
export const PATCH_CHIME_S = 0.7;       // 飛来が終わって枠に収まる瞬間（チャイム）
const PT_FLY_S = PATCH_CHIME_S;         // 飛来（回転しながら）の長さ。そのあと一瞬フラッシュして文字が出る
const PT_INK = '#06080E';

// パイロットの全パッチ [{ id, name, earned }]（天体の順）。earned = その天体のどれかのステージで PERFECT の記録がある。
// firstAt（初取得の時刻）は保存していないので付けない（v1.2 で天体が増えても同じ関数で足りる）。
export function patchesSummary(storage, name) {
  const sum = starsSummary(storage, name);
  return sum.bodies.map((b) => ({ id: b.id, name: b.name, earned: b.stages.some((s) => s.grade === 'PERFECT' || (s.mask & STAR_PERFECT) !== 0) }));
}
export function patchCount(list) { let n = 0; for (const x of list || []) if (x && x.earned) n++; return n; }
// 今回の着陸で新しく手に入る（その天体で初めての PERFECT）か。before = 記録前の patchesSummary
export function patchIsNew(before, bodyId, grade) {
  if (grade !== 'PERFECT') return false;
  const e = (before || []).find((x) => x.id === bodyId);
  return !!e && !e.earned;
}
// 演出の位相。pt = 開始からの秒数 → { fly:0..1, flash:0..1, text:0..1, done }
export function patchAwardView(pt) {
  const c = (v) => Math.max(0, Math.min(1, v));
  const t = pt == null ? 99 : pt;
  return { fly: c(t / PT_FLY_S), flash: c((t - PT_FLY_S) / 0.4), text: c((t - PT_FLY_S) / 0.45), done: t >= PATCH_AWARD_S };
}

// ---- 天体ごとの絵（単位円：半径1。pictogram は半径 0.76 の内側に収める）----
const PT_ART = {
  moon(c, u, k) {   // 三日月 + 足跡（地平線の下）
    c.fillStyle = '#4a4d58'; c.fillRect(-1, 0.2, 2, 1);
    c.strokeStyle = rgba('#b4bac8', 0.8); c.lineWidth = u; c.beginPath(); c.moveTo(-1, 0.2); c.lineTo(1, 0.2); c.stroke();
    c.save(); c.beginPath(); c.arc(-0.12, -0.28, 0.36, 0, PT_TAU); c.clip();
    c.fillStyle = '#e4eaf4'; c.fillRect(-1, -1, 2, 2);
    c.fillStyle = k.sky; c.beginPath(); c.arc(0.02, -0.38, 0.31, 0, PT_TAU); c.fill(); c.restore();
    c.fillStyle = '#d8dce6'; for (const [x, y, r] of [[0.42, -0.5, 0.025], [0.55, -0.22, 0.018], [-0.5, -0.6, 0.02]]) { c.beginPath(); c.arc(x, y, r, 0, PT_TAU); c.fill(); }
    c.fillStyle = '#272a32';
    c.beginPath(); c.ellipse(0.12, 0.46, 0.1, 0.15, -0.12, 0, PT_TAU); c.fill();   // 靴底
    c.beginPath(); c.ellipse(0.1, 0.66, 0.07, 0.06, -0.12, 0, PT_TAU); c.fill();   // かかと
  },
  europa(c, u, k) {   // 氷の球とひび割れ
    c.save(); c.beginPath(); c.arc(0, 0, 0.52, 0, PT_TAU); c.clip();
    c.fillStyle = '#d6e8f2'; c.fillRect(-1, -1, 2, 2);
    c.strokeStyle = '#5f98b8'; c.lineWidth = 1.3 * u; c.lineJoin = 'round'; c.lineCap = 'round';
    const L = [[[-0.55, 0.06], [-0.3, -0.06], [-0.1, 0.08], [0.14, -0.1], [0.55, 0.0]], [[-0.1, 0.08], [-0.2, 0.3], [-0.08, 0.55]], [[0.14, -0.1], [0.22, -0.3], [0.1, -0.55]], [[0.04, 0.0], [0.3, 0.2], [0.42, 0.38]], [[-0.3, -0.06], [-0.4, -0.25]]];
    for (const pl of L) { c.beginPath(); pl.forEach((q, i) => { if (i) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); }); c.stroke(); }
    c.fillStyle = 'rgba(8,14,28,0.35)'; c.beginPath(); c.arc(0.2, 0.18, 0.56, 0, PT_TAU); c.arc(0, 0, 0.52, 0, PT_TAU, true); c.fill();   // 欠け（影）
    c.restore();
    c.strokeStyle = rgba('#f2fbff', 0.8); c.lineWidth = 1.2 * u; c.beginPath(); c.arc(0, 0, 0.52, 0, PT_TAU); c.stroke();
  },
  io(c, u, k) {   // 火山の噴煙
    c.fillStyle = '#a98424'; c.fillRect(-1, 0.36, 2, 1);
    c.fillStyle = '#6f4e14'; c.beginPath(); c.moveTo(-0.5, 0.4); c.lineTo(-0.09, -0.02); c.lineTo(0.09, -0.02); c.lineTo(0.5, 0.4); c.closePath(); c.fill();
    c.fillStyle = k.accent; c.beginPath(); c.ellipse(0, -0.02, 0.09, 0.03, 0, 0, PT_TAU); c.fill();
    c.strokeStyle = '#ffd96a'; c.lineWidth = 2 * u; c.lineCap = 'round';
    c.beginPath(); c.moveTo(0, -0.04); c.lineTo(0, -0.34); c.stroke();
    c.beginPath(); c.moveTo(0, -0.34); c.quadraticCurveTo(-0.3, -0.36, -0.36, -0.12); c.moveTo(0, -0.34); c.quadraticCurveTo(0.3, -0.36, 0.36, -0.12); c.stroke();
    c.beginPath(); c.moveTo(0, -0.34); c.quadraticCurveTo(-0.16, -0.58, -0.3, -0.5); c.moveTo(0, -0.34); c.quadraticCurveTo(0.16, -0.58, 0.3, -0.5); c.stroke();
    c.fillStyle = k.accent; for (const [x, y] of [[-0.42, 0.0], [0.42, 0.0], [-0.2, -0.64], [0.2, -0.64]]) { c.beginPath(); c.arc(x, y, 0.028, 0, PT_TAU); c.fill(); }
  },
  mars(c, u, k) {   // つむじ風とフォボス
    c.fillStyle = '#8a3b1e'; c.fillRect(-1, 0.34, 2, 1);
    c.strokeStyle = rgba('#eaa070', 0.7); c.lineWidth = u; c.beginPath(); c.moveTo(-1, 0.34); c.lineTo(1, 0.34); c.stroke();
    c.strokeStyle = '#f2c79a'; c.lineWidth = 1.6 * u; c.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const y = 0.34 - i * 0.14, rx = 0.05 + i * 0.045, ox = Math.sin(i * 1.3) * 0.05; c.beginPath(); c.ellipse(ox, y, rx, rx * 0.28, 0, 0, PT_TAU); c.stroke(); }
    c.fillStyle = '#6d5648'; c.beginPath(); c.ellipse(0.42, -0.44, 0.13, 0.095, -0.4, 0, PT_TAU); c.fill();
    c.fillStyle = '#4b3a30'; c.beginPath(); c.arc(0.44, -0.46, 0.03, 0, PT_TAU); c.fill();
  },
  titan(c, u, k) {   // もやの層と土星
    c.fillStyle = '#4a3519'; c.fillRect(-1, 0.42, 2, 1);
    c.lineCap = 'round'; c.lineWidth = 3.2 * u;
    for (let i = 0; i < 3; i++) {
      const y = -0.06 + i * 0.17; c.strokeStyle = rgba('#ffc04a', 0.85 - i * 0.22);
      c.beginPath(); c.moveTo(-0.8, y); c.quadraticCurveTo(-0.4, y - 0.07, 0, y); c.quadraticCurveTo(0.4, y + 0.07, 0.8, y); c.stroke();
    }
    c.fillStyle = '#e3c88a'; c.beginPath(); c.arc(0.3, -0.4, 0.15, 0, PT_TAU); c.fill();
    c.strokeStyle = '#f4e2b4'; c.lineWidth = 1.5 * u; c.beginPath(); c.ellipse(0.3, -0.4, 0.3, 0.075, -0.35, 0, PT_TAU); c.stroke();
  },
  venus(c, u, k) {   // 雲の渦と熱のゆらぎ
    c.strokeStyle = '#ffd09a'; c.lineWidth = 2 * u; c.lineCap = 'round'; c.beginPath();
    for (let a = 0; a <= 4.6 * Math.PI; a += 0.2) { const r = 0.03 + 0.06 * a / 1.3; const x = Math.cos(a) * r, y = -0.14 + Math.sin(a) * r * 0.9; if (a === 0) c.moveTo(x, y); else c.lineTo(x, y); }
    c.stroke();
    c.strokeStyle = rgba('#ff5a1a', 0.85); c.lineWidth = 1.5 * u;
    for (let i = -1; i <= 1; i++) { const x = i * 0.26; c.beginPath(); c.moveTo(x, 0.7); c.bezierCurveTo(x - 0.1, 0.56, x + 0.1, 0.44, x, 0.32); c.stroke(); }
  },
  pluto(c, u, k) {   // ハート形の氷原（スプートニク平原）とカロン
    c.fillStyle = '#7a4a34'; c.beginPath(); c.ellipse(0, 0.62, 0.95, 0.34, 0, Math.PI, PT_TAU); c.fill();   // 赤褐色の高地
    c.fillStyle = '#f0e6d2'; c.beginPath();
    c.moveTo(0, 0.62); c.bezierCurveTo(-0.62, 0.3, -0.5, -0.18, -0.2, -0.14); c.bezierCurveTo(-0.08, -0.12, 0, -0.02, 0, 0.06);
    c.bezierCurveTo(0, -0.02, 0.08, -0.12, 0.2, -0.14); c.bezierCurveTo(0.5, -0.18, 0.62, 0.3, 0, 0.62); c.fill();   // ハート
    c.strokeStyle = 'rgba(150,134,110,0.55)'; c.lineWidth = 0.8 * u; c.beginPath(); c.moveTo(-0.28, 0.08); c.lineTo(-0.06, 0.2); c.lineTo(0.14, 0.1); c.lineTo(0.3, 0.2); c.stroke();
    const g = c.createRadialGradient(0.38, -0.46, 0.02, 0.38, -0.46, 0.2); g.addColorStop(0, '#d2cdc6'); g.addColorStop(1, '#6a6660');
    c.fillStyle = g; c.beginPath(); c.arc(0.38, -0.46, 0.2, 0, PT_TAU); c.fill();   // カロン
    c.fillStyle = 'rgba(122,64,44,0.8)'; c.beginPath(); c.ellipse(0.38, -0.62, 0.1, 0.04, 0, 0, PT_TAU); c.fill();
  },
  mercury(c, u, k) {   // 影のクレーターと巨大な太陽
    c.fillStyle = rgba('#ffb878', 0.12); c.beginPath(); c.arc(0.05, 0.2, 0.7, 0, PT_TAU); c.fill();
    c.fillStyle = rgba('#ffb878', 0.22); c.beginPath(); c.arc(0.05, 0.2, 0.55, 0, PT_TAU); c.fill();
    c.fillStyle = '#ffd29a'; c.beginPath(); c.arc(0.05, 0.2, 0.42, 0, PT_TAU); c.fill();
    c.fillStyle = '#141214'; c.fillRect(-1, 0.2, 2, 1);
    c.strokeStyle = rgba('#ffd29a', 0.7); c.lineWidth = u; c.beginPath(); c.moveTo(-1, 0.2); c.lineTo(1, 0.2); c.stroke();
    c.fillStyle = '#000'; c.beginPath(); c.ellipse(-0.02, 0.5, 0.5, 0.15, 0, 0, PT_TAU); c.fill();
    c.strokeStyle = rgba('#ffb878', 0.85); c.lineWidth = 1.4 * u; c.beginPath(); c.ellipse(-0.02, 0.5, 0.5, 0.15, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
  },
};
const PT_SKY = { pluto: '#080a16', moon: '#0b0f1a', europa: '#0b1426', io: '#2a1208', mars: '#b4683c', titan: '#8a5c1a', venus: '#a8501a', mercury: '#050405' };

// 名前を下側の縁に沿って1字ずつ描く（縁の帯の中。小さいパッチでは描かない）
function PT_rimText(c, name, rad, px, color) {
  const font = '700 ' + px + 'px ' + FONT;
  c.save(); c.font = font; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
  const gap = px * 0.18, ws = Array.from(name).map((ch) => { const w = c.measureText(ch).width; return (w >= 0 ? w : px * 0.6) + gap; });
  const total = ws.reduce((a, b) => a + b, 0);
  let cum = 0;
  Array.from(name).forEach((ch, i) => {
    const mid = cum + ws[i] / 2; cum += ws[i];
    const a = Math.PI / 2 + (total / 2 - mid) / rad;
    c.save(); c.translate(Math.cos(a) * rad, Math.sin(a) * rad); c.rotate(a - Math.PI / 2); c.fillText(ch, 0, 0); c.restore();
  });
  c.restore();
}

// パッチを描く。(cx,cy)=中心、r=半径px。o: { earned=true, rim=false(縁に名前), q=true(未取得に「?」), a=1 }
export function drawMissionPatch(ctx, id, cx, cy, r, o) {
  o = o || {};
  const earned = o.earned !== false, p = P();
  const body = BODIES.find((b) => b.id === id) || BODIES[0], acc = body.visual.accent;
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(r, r);
  if (o.a != null) ctx.globalAlpha = (typeof ctx.globalAlpha === 'number' ? ctx.globalAlpha : 1) * Math.max(0, Math.min(1, o.a));
  const u = 1 / r;   // 1px
  if (!earned) {   // 未取得: 暗い輪郭だけ（縁・内側の輪・?）
    ctx.fillStyle = rgba(p.dim, 0.07); ctx.beginPath(); ctx.arc(0, 0, 1, 0, PT_TAU); ctx.fill();
    ctx.strokeStyle = rgba(p.dim, 0.55); ctx.lineWidth = 1.4 * u; ctx.beginPath(); ctx.arc(0, 0, 0.97, 0, PT_TAU); ctx.stroke();
    ctx.strokeStyle = rgba(p.dim, 0.3); ctx.lineWidth = 0.8 * u; ctx.setLineDash([2 * u, 2.4 * u]); ctx.beginPath(); ctx.arc(0, 0, 0.74, 0, PT_TAU); ctx.stroke(); ctx.setLineDash([]);
    if (o.q !== false) { ctx.fillStyle = rgba(p.dim, 0.85); ctx.font = '500 ' + (r * 0.75) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.save(); ctx.scale(1 / r, 1 / r); ctx.fillText('?', 0, 0); ctx.restore(); }
    ctx.restore(); return;
  }
  const sky = PT_SKY[id] || '#0b0f1a';
  ctx.fillStyle = mixHex(acc, PT_INK, 0.82); ctx.beginPath(); ctx.arc(0, 0, 1, 0, PT_TAU); ctx.fill();   // 縁の帯
  ctx.save(); ctx.beginPath(); ctx.arc(0, 0, 0.76, 0, PT_TAU); ctx.clip();
  ctx.fillStyle = sky; ctx.fillRect(-1, -1, 2, 2);
  if (PT_ART[id]) PT_ART[id](ctx, u, { sky, accent: acc });
  ctx.restore();
  ctx.strokeStyle = rgba(acc, 0.9); ctx.lineWidth = 2 * u + 0.02; ctx.beginPath(); ctx.arc(0, 0, 0.96, 0, PT_TAU); ctx.stroke();   // 外の縁
  ctx.strokeStyle = rgba(acc, 0.5); ctx.lineWidth = 1 * u; ctx.beginPath(); ctx.arc(0, 0, 0.76, 0, PT_TAU); ctx.stroke();   // 内の細い輪
  if (o.rim && r >= 18) { ctx.save(); ctx.scale(u, u); PT_rimText(ctx, body.name, 0.87 * r, Math.max(3.6, r * 0.15), rgba(acc, 0.95)); ctx.restore(); }
  ctx.restore();
}

// クリア画面の「PATCH EARNED」行。slot = drawClearPanel が返す { x, y, w, h }、pt = 開始からの秒数（null/大きい値=完了後）
export function drawPatchAward(ctx, slot, id, name, pt) {
  const p = P(), v = patchAwardView(pt);
  const R = 17, cx = slot.x + 58, cy = slot.y + slot.h / 2 - 1;
  // 飛来: 画面上方から回転しながら、小さな過ぎ越し（1.45倍→1倍）で収まる
  const e = 1 - Math.pow(1 - v.fly, 3), fx = cx + (1 - e) * 70, fy = cy - (1 - e) * 120, sc = 1 + 0.45 * (1 - e) * (1 - e);
  drawMissionPatch(ctx, id, cx, cy, R, { earned: false, q: false, a: 0.9 * (1 - v.fly) });   // 空の枠（飛んでくる前の置き場）
  ctx.save(); ctx.translate(fx, fy); ctx.rotate((1 - e) * PT_TAU * 2); ctx.scale(sc, sc);
  drawMissionPatch(ctx, id, 0, 0, R, { rim: false, a: Math.min(1, v.fly * 2.5) });
  ctx.restore();
  if (v.flash > 0 && v.flash < 1) {   // 着地の小さな閃光（輪が広がって消える）
    ctx.save(); ctx.strokeStyle = rgba(p.hi, 0.8 * (1 - v.flash)); ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(cx, cy, R + 2 + v.flash * 14, 0, PT_TAU); ctx.stroke();
    ctx.fillStyle = rgba('#ffffff', 0.35 * (1 - v.flash)); ctx.beginPath(); ctx.arc(cx, cy, R, 0, PT_TAU); ctx.fill(); ctx.restore();
  }
  if (v.text > 0) {
    txt(ctx, 'PATCH EARNED — ' + String(name).toUpperCase(), slot.x + 86, cy - 11, 9, p.warn, 'left', { sp: 1.5, w: 600, a: v.text });
    txt(ctx, 'FIRST PERFECT LANDING ON ' + String(name).toUpperCase(), slot.x + 86, cy + 4, 6.5, p.dim, 'left', { sp: 1.2, w: 500, a: v.text * 0.9 });
  }
}
