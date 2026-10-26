// LANDER BETA v1.1 L3 — 太陽系マップ（CHOOSE START の置き換え）。07_lab/solar_map の D 案（B の計器表示 + C のキャラの動きを弱めたもの）を移植。
// 入力・描画・状態はすべてこのクラスの中。タイトル（title.js）は list/summary を渡し、input() の戻り値 {start}/{close} だけを見る。
// バンドルは1つのスコープなので、トップレベルの名前はすべて SM_ / SolarMap で始める。
import { P } from './core/palette.js';
import { drawShip, drawAstronaut, drawFlag, rgba, mixHex } from './art.js';
import { BODIES, BODY_COUNT, STAGES_PER_BODY, stageInfo } from './bodies.js';
import { drawMissionPatch, patchCount } from './patches.js';

const SM_W = 360, SM_H = 640, SM_TAU = Math.PI * 2;
const SM_MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const SM_PER_LOOP = STAGES_PER_BODY * BODY_COUNT;

// ---- データ（見た目）----
const SM_BCOL = { mercury: '#a39a8e', venus: '#e2b878', earth: '#5b8fd0', mars: '#c1583a', jupiter: '#cfa77c', saturn: '#dcc592',
  moon: '#b9bfcb', io: '#e0bb3c', europa: '#d6e6ee', titan: '#e0a03e' };
// 着陸天体（カード単位）。hub=true は惑星そのものに着陸
const SM_LB = {
  mercury: { sys: 'mercury', hub: true }, venus: { sys: 'venus', hub: true }, moon: { sys: 'earth' },
  mars: { sys: 'mars', hub: true }, io: { sys: 'jupiter' }, europa: { sys: 'jupiter' }, titan: { sys: 'saturn' },
};
const SM_SYS = {
  mercury: { name: 'MERCURY', ab: 'MER', bodies: ['mercury'], hubR: 44, soon: null, bonus: false },
  venus:   { name: 'VENUS', ab: 'VEN', bodies: ['venus'], hubR: 50, soon: null, bonus: false },
  earth:   { name: 'EARTH', ab: 'EAR', bodies: ['moon'], hubR: 44, soon: null, bonus: true },
  mars:    { name: 'MARS', ab: 'MAR', bodies: ['mars'], hubR: 44, soon: 'PHOBOS', bonus: false },
  jupiter: { name: 'JUPITER', ab: 'JUP', bodies: ['io', 'europa'], hubR: 52, soon: null, bonus: false },
  saturn:  { name: 'SATURN', ab: 'SAT', bodies: ['titan'], hubR: 32, soon: 'ENCELADUS', bonus: false },
};
const SM_SYS_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const SM_PL = {
  mercury: { r: 24, sz: 4.2, w: SM_TAU / 46, ph: 0.5 }, venus: { r: 46, sz: 6.2, w: SM_TAU / 80, ph: 3.2 },
  earth: { r: 70, sz: 6.8, w: SM_TAU / 120, ph: 4.9 }, mars: { r: 94, sz: 5.2, w: SM_TAU / 180, ph: 1.9 },
  jupiter: { r: 126, sz: 11, w: SM_TAU / 300, ph: 5.7 }, saturn: { r: 158, sz: 8, w: SM_TAU / 420, ph: 2.6 },
};
const SM_OV = { cx: 180, cy: 262 };
const SM_MOONS = {
  moon:   { sys: 'earth', ovR: 12, ovW: SM_TAU / 7, ph: 1.0, zx: 118, zy: 36, zW: SM_TAU / 22, zr: 12 },
  io:     { sys: 'jupiter', ovR: 16, ovW: SM_TAU / 5, ph: 0.2, zx: 92, zy: 30, zW: SM_TAU / 14, zr: 12 },
  europa: { sys: 'jupiter', ovR: 22, ovW: SM_TAU / 9, ph: 2.4, zx: 140, zy: 44, zW: SM_TAU / 24, zr: 11 },
  titan:  { sys: 'saturn', ovR: 17, ovW: SM_TAU / 8, ph: 1.3, zx: 138, zy: 40, zW: SM_TAU / 26, zr: 14 },
};
const SM_SOON = ['PHOBOS', 'RYUGU', '67P', 'ENCELADUS', 'TRITON', 'PLUTO'];
const SM_ZH = { x: 180, y: 166 };
const SM_KZ = 3.2;
const SM_HALO = { titan: ['224,160,62', 1.42, 0.42], venus: ['255,200,120', 1.3, 0.28], mars: ['230,140,90', 1.22, 0.2], earth: ['120,180,255', 1.22, 0.22] };

// ---- 補助 ----
const SM_clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const SM_ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const SM_outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const SM_outCubic = (t) => 1 - Math.pow(1 - t, 3);
const SM_rnd = (() => { let s = 7; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
const SM_hit = (r, x, y) => !!r && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
function SM_T(c, s, x, y, size, col, align, wt, ls) {
  c.font = (wt || 500) + ' ' + size + 'px ' + SM_MONO;
  if ('letterSpacing' in c) c.letterSpacing = (ls || 0) + 'px';
  c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = col;
  const adj = (align === 'center') ? (ls || 0) / 2 : (align === 'right' ? (ls || 0) : 0);
  c.fillText(s, x + adj, y);
}
function SM_rrect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function SM_starPath(c, x, y, R, ri) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? ri : R; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); }
function SM_sparkle(c, x, y, s, a, col) {
  if (a <= 0 || s <= 0) return;
  c.save(); c.globalAlpha *= a; c.fillStyle = col;
  c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.restore();
}
function SM_lock(c, x, y, s, col) {
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.2; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y - s * 0.28, s * 0.32, Math.PI, 0); c.stroke();
  SM_rrect(c, x - s * 0.45, y - s * 0.1, s * 0.9, s * 0.7, 1.5); c.fill(); c.restore();
}
// グラデーションは ctx ごと・キーごとに1回だけ作る（原点・単位半径で作り、translate+scale で使い回す）
const SM_gc = new WeakMap();
function SM_grad(c, key, make) {
  let m = SM_gc.get(c);
  if (!m) { m = Object.create(null); SM_gc.set(c, m); }
  return m[key] || (m[key] = make());
}
const SM_mixMemo = Object.create(null);
function SM_dark(col) { return SM_mixMemo[col] || (SM_mixMemo[col] = mixHex(col, '#06080E', 0.74)); }

// ---- 天体スプライト ----
function SM_halo(c, id, x, y, r) {
  const h = SM_HALO[id]; if (!h) return;
  const R = r * h[1];
  const g = SM_grad(c, 'halo' + id, () => { const gr = c.createRadialGradient(0, 0, 0.9 / h[1], 0, 0, 1); gr.addColorStop(0, 'rgba(' + h[0] + ',' + h[2] + ')'); gr.addColorStop(1, 'rgba(' + h[0] + ',0)'); return gr; });
  c.save(); c.translate(x, y); c.scale(R, R); c.fillStyle = g; c.beginPath(); c.arc(0, 0, 1, 0, SM_TAU); c.fill(); c.restore();
}
function SM_pers(c, id, r, t) {            // clip 内（中心=原点）の表面モチーフ
  const lw = r * 0.09;
  c.lineCap = 'round';
  switch (id) {
    case 'venus': for (let k = 0; k < 4; k++) { const a = t * 0.25 + k * 1.7; c.strokeStyle = 'rgba(255,244,220,0.2)'; c.lineWidth = lw; c.beginPath(); c.arc(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18, r * (0.25 + 0.21 * k), a, a + 2.3); c.stroke(); } break;
    case 'mars': {
      c.fillStyle = 'rgba(255,240,230,0.5)'; c.beginPath(); c.ellipse(0, -r * 0.95, r * 0.45, r * 0.18, 0, 0, SM_TAU); c.fill();
      c.fillStyle = 'rgba(80,25,15,0.35)'; c.beginPath(); c.ellipse(-r * 0.25, r * 0.1, r * 0.35, r * 0.16, 0.3, 0, SM_TAU); c.fill();
      const u = (t * 0.07) % 1, dx = -r * 0.8 + u * r * 1.6, base = r * 0.42;
      c.fillStyle = 'rgba(60,20,10,0.3)'; c.beginPath(); c.ellipse(dx, base + 1, r * 0.1, r * 0.04, 0, 0, SM_TAU); c.fill();
      for (let i = 0; i < 7; i++) { const f = i / 6, w = r * 0.04 + f * r * 0.1; c.fillStyle = 'rgba(255,214,170,' + (0.7 * (1 - f * 0.6)) + ')'; c.beginPath(); c.ellipse(dx + Math.sin(t * 5 + f * 4) * r * 0.025 + f * r * 0.06, base - f * r * 0.42, w, w * 0.5, 0, 0, SM_TAU); c.fill(); }
      break;
    }
    case 'mercury': {
      c.strokeStyle = 'rgba(40,36,32,0.3)'; c.lineWidth = Math.max(0.6, r * 0.035);
      [[-0.35, -0.25, 0.22], [0.3, 0.2, 0.28], [0.05, -0.55, 0.14], [-0.2, 0.5, 0.16]].forEach(([a, b, d]) => { c.beginPath(); c.arc(a * r, b * r, d * r, 0, SM_TAU); c.stroke(); });
      c.fillStyle = 'rgba(255,170,70,0.12)'; c.beginPath(); c.moveTo(-r, -r); c.lineTo(r, -r); c.lineTo(-r, r); c.closePath(); c.fill();   // 日照側（グラデーションを毎フレーム作らない近似）
      break;
    }
    case 'earth': {
      const off = ((t * 0.035) % 1) * 2 * r;
      for (let rep = -1; rep <= 1; rep++) {
        const ox = off + rep * 2 * r - r;
        c.fillStyle = 'rgba(111,166,90,0.9)';
        c.beginPath(); c.ellipse(ox - r * 0.25, -r * 0.1, r * 0.4, r * 0.28, 0.4, 0, SM_TAU); c.fill();
        c.beginPath(); c.ellipse(ox + r * 0.45, r * 0.3, r * 0.3, r * 0.2, -0.3, 0, SM_TAU); c.fill();
      }
      const off2 = ((t * 0.06) % 1) * 2 * r;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (let rep = -1; rep <= 1; rep++) { const ox = off2 + rep * 2 * r - r; c.beginPath(); c.ellipse(ox, -r * 0.45, r * 0.5, r * 0.07, 0, 0, SM_TAU); c.fill(); c.beginPath(); c.ellipse(ox - r * 0.3, r * 0.5, r * 0.4, r * 0.06, 0, 0, SM_TAU); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(0, -r * 0.98, r * 0.5, r * 0.15, 0, 0, SM_TAU); c.fill();
      break;
    }
    case 'jupiter': {
      const cols = ['rgba(150,100,60,0.4)', 'rgba(255,240,215,0.28)'];
      for (let k = 0; k < 7; k++) { const y = -r + (k + 0.5) * 2 * r / 7; c.strokeStyle = cols[k % 2]; c.lineWidth = r * 0.17; c.beginPath(); for (let x = -r; x <= r; x += r / 6) c[x === -r ? 'moveTo' : 'lineTo'](x, y + Math.sin(x * 0.1 + t * 0.4 + k) * r * 0.025); c.stroke(); }
      c.fillStyle = 'rgba(176,80,52,0.85)'; c.beginPath(); c.ellipse(r * 0.3, r * 0.28, r * 0.17, r * 0.1, 0, 0, SM_TAU); c.fill();
      break;
    }
    case 'saturn': for (let k = 0; k < 5; k++) { const y = -r + (k + 0.5) * 2 * r / 5; c.strokeStyle = k % 2 ? 'rgba(255,245,220,0.2)' : 'rgba(150,115,60,0.25)'; c.lineWidth = r * 0.2; c.beginPath(); c.moveTo(-r, y); c.lineTo(r, y); c.stroke(); } break;
    case 'moon':
      [[-0.3, -0.2, 0.22], [0.35, 0.15, 0.17], [0, 0.5, 0.12], [0.1, -0.55, 0.1]].forEach(([a, b, d]) => { c.fillStyle = 'rgba(60,64,78,0.28)'; c.beginPath(); c.arc(a * r, b * r, d * r, 0, SM_TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.6; c.beginPath(); c.arc(a * r, b * r, d * r, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); });
      break;
    case 'io':
      [[-0.3, 0.1, 0.14, '120,50,20'], [0.3, -0.25, 0.1, '150,60,20'], [0.1, 0.45, 0.12, '110,70,20'], [-0.05, -0.4, 0.08, '120,50,20']].forEach(([a, b, d, col], i) => { c.fillStyle = 'rgba(' + col + ',0.5)'; c.beginPath(); c.arc(a * r, b * r, d * r, 0, SM_TAU); c.fill(); if (i < 2) { c.fillStyle = 'rgba(255,120,40,' + (0.55 + 0.3 * Math.sin(t * 3 + i)) + ')'; c.beginPath(); c.arc(a * r, b * r, d * r * 0.4, 0, SM_TAU); c.fill(); } });
      break;
    case 'europa':
      c.strokeStyle = 'rgba(70,95,120,0.45)'; c.lineWidth = Math.max(0.5, r * 0.04);
      [[-1, -0.3, -0.2, -0.1, 0.5, 0.2, 1, 0.4], [-0.6, -0.9, -0.2, -0.3, 0.1, 0.1, 0.5, 0.8], [-0.9, 0.4, -0.3, 0.3, 0.3, 0.5, 0.9, 0.2]].forEach((p) => { c.beginPath(); c.moveTo(p[0] * r, p[1] * r); c.lineTo(p[2] * r, p[3] * r); c.lineTo(p[4] * r, p[5] * r); c.lineTo(p[6] * r, p[7] * r); c.stroke(); });
      c.strokeStyle = 'rgba(160,100,70,0.28)'; c.beginPath(); c.moveTo(-r * 0.7, r * 0.7); c.lineTo(r * 0.1, r * 0.2); c.lineTo(r * 0.6, -r * 0.2); c.stroke();
      break;
    case 'titan': for (let k = 0; k < 3; k++) { const a = t * 0.35 * (k % 2 ? -1 : 1) + k * 2.1; c.strokeStyle = 'rgba(255,214,140,' + (0.26 - k * 0.04) + ')'; c.lineWidth = r * 0.12; c.beginPath(); c.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * (0.3 + 0.24 * k), a, a + 2.0); c.stroke(); } break;
    default: break;
  }
}
function SM_outerFx(c, id, x, y, r, t) {    // clip 外（輪郭の外へはみ出す）
  c.save(); c.translate(x, y);
  if (id === 'mercury') {
    for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(255,190,100,' + (0.28 - i * 0.07) + ')'; c.lineWidth = Math.max(0.7, r * 0.03); c.beginPath(); for (let k = -r * 0.7; k <= r * 0.7; k += 2) { const yy = -r * 1.08 - i * r * 0.1 + Math.sin(k * 0.3 + t * 3 + i * 1.3) * r * 0.025; c[k === -r * 0.7 ? 'moveTo' : 'lineTo'](k, yy); } c.stroke(); }
  } else if (id === 'io') {
    const u = (t / 3.4) % 1, a = -1.0, bx = Math.cos(a) * r, by = Math.sin(a) * r, dx = Math.cos(a), dy = Math.sin(a);
    if (u < 0.85) { const h = SM_outCubic(u / 0.85) * r * 0.9, al = 1 - u / 0.85; for (let i = 0; i < 6; i++) { const f = i / 5, hh = h * f; const sp = Math.sin(f * 3 + t * 2) * r * 0.04; const rr_ = r * (0.06 + 0.08 * f) * (0.5 + u); c.fillStyle = 'rgba(' + (i < 3 ? '255,214,110' : '255,150,60') + ',' + (0.7 * al * (1 - f * 0.4)) + ')'; c.beginPath(); c.arc(bx + dx * hh - dy * sp, by + dy * hh + dx * sp, rr_, 0, SM_TAU); c.fill(); } }
  } else if (id === 'europa') {
    const u = (t / 4.2) % 1;
    if (u < 0.4) { const p = u / 0.4; SM_sparkle(c, -r * 0.45 + p * r * 0.9, r * 0.35 - p * r * 0.75, Math.sin(p * Math.PI) * r * 0.3, 0.95, '#ffffff'); }
  }
  c.restore();
}
function SM_rings(c, x, y, r, t, half, red) {
  const tilt = -0.32 + (red ? 0 : Math.sin(t * 0.22) * 0.1), ry = 0.3, p = P();
  c.save(); c.translate(x, y); c.rotate(tilt);
  const a0 = half === 'back' ? Math.PI : 0, a1 = half === 'back' ? SM_TAU : Math.PI;
  [[1.55, 0.2, 0.55], [1.78, 0.28, 0.75], [2.02, 0.18, 0.4]].forEach(([k, w, al], i) => {
    c.strokeStyle = rgba(i === 1 ? p.warn : p.mid, 0.55 * al + 0.2);
    c.lineWidth = Math.max(0.8, r * w * 0.5) * 0.4; c.beginPath(); c.ellipse(0, 0, r * k, r * k * ry, 0, a0, a1); c.stroke();
  });
  c.restore();
}
// 計器風（ワイヤ）の天体。o: { alpha, pers(=false で表面モチーフなし), halo(=false で光暈なし) }
function SM_body(c, id, x, y, r, t, red, o) {
  o = o || {};
  const col = SM_BCOL[id] || '#999', al = o.alpha === undefined ? 1 : o.alpha, p = P();
  c.save(); c.globalAlpha *= al;
  if (o.halo !== false && r >= 5) SM_halo(c, id, x, y, r);
  if (id === 'saturn') SM_rings(c, x, y, r, t, 'back', red);
  c.save(); c.beginPath(); c.arc(x, y, r, 0, SM_TAU); c.clip();
  c.fillStyle = SM_dark(col); c.fillRect(x - r, y - r, 2 * r, 2 * r);
  if (o.pers !== false && r >= 8) { c.save(); c.translate(x, y); c.globalAlpha *= 0.7; SM_pers(c, id, r, t); c.restore(); }
  c.fillStyle = 'rgba(6,8,14,0.5)';
  c.beginPath(); c.rect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4); c.arc(x - r * 0.38, y - r * 0.34, r * 1.05, 0, SM_TAU, true); c.fill('evenodd');
  if (r >= 5) {
    c.strokeStyle = rgba(p.mid, 0.22); c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(x, y, r * 0.42, r, 0, 0, SM_TAU); c.ellipse(x, y, r, r * 0.3, 0, 0, SM_TAU); c.moveTo(x - r, y); c.lineTo(x + r, y); c.stroke();
  }
  c.restore();
  c.lineWidth = 0.9; c.strokeStyle = rgba(mixHex(col, p.mid, 0.4), 0.9); c.beginPath(); c.arc(x, y, r, 0, SM_TAU); c.stroke();
  if (id === 'saturn') SM_rings(c, x, y, r, t, 'front', red);
  if (o.pers !== false && r >= 8) SM_outerFx(c, id, x, y, r, t);
  c.restore();
}
function SM_silhouette(c, nm, x, y, s) {
  const k = s || 1, p = P(); c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = 'rgba(28,34,50,0.9)'; c.strokeStyle = rgba(p.dim, 0.9); c.lineWidth = 0.8; c.setLineDash([2, 2]);
  c.beginPath();
  if (nm === 'PHOBOS') c.ellipse(0, 0, 11, 8, -0.3, 0, SM_TAU);
  else if (nm === 'RYUGU') { c.moveTo(0, -11); c.lineTo(9, -3); c.lineTo(10, 3); c.lineTo(0, 11); c.lineTo(-10, 3); c.lineTo(-9, -3); c.closePath(); }
  else if (nm === '67P') { c.ellipse(-4.5, 1, 6, 5, 0.2, 0, SM_TAU); c.moveTo(11, -2); c.ellipse(6, -3, 5, 4.5, 0, 0, SM_TAU); }
  else if (nm === 'ENCELADUS') c.arc(0, 0, 9, 0, SM_TAU);
  else if (nm === 'TRITON') c.arc(0, 0, 9.5, 0, SM_TAU);
  else c.arc(0, 0, 8.5, 0, SM_TAU);
  c.fill(); c.stroke(); c.setLineDash([]);
  if (nm === 'ENCELADUS') { c.fillStyle = rgba(p.dim, 0.8); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-3 + i * 3, 14 + (i % 2) * 2, 0.9, 0, SM_TAU); c.fill(); } }
  if (nm === 'PLUTO') { c.strokeStyle = rgba(p.dim, 0.5); c.beginPath(); c.arc(-2, 1, 4, 0.3, 4.4); c.stroke(); }
  if (nm === 'TRITON') { c.strokeStyle = rgba(p.dim, 0.5); c.beginPath(); c.moveTo(-7, 3); c.quadraticCurveTo(0, 6, 7, 2); c.stroke(); }
  c.restore();
}
const SM_STARS = Array.from({ length: 150 }, () => ({ x: SM_rnd() * SM_W, y: SM_rnd() * SM_H, d: 0.2 + SM_rnd() * 0.8, s: 0.4 + SM_rnd() * 0.9, ph: SM_rnd() * 6 }));

export class SolarMap {
  // o: { list(= title の _startOptions()), summary(= starsSummary), sfx(), reduce }
  constructor(o) {
    o = o || {};
    this.list = Array.isArray(o.list) ? o.list : [];
    this.sum = o.summary || { totalStars: 0, maxStars: 0, bodies: [] };
    this.sfx = typeof o.sfx === 'function' ? o.sfx : () => {};
    this.reduce = !!o.reduce;
    this.patches = Array.isArray(o.patches) ? o.patches : [];   // patchesSummary(): [{ id, name, earned }]
    this.PT = Object.create(null); for (const x of this.patches) if (x && x.id) this.PT[x.id] = !!x.earned;
    this.viewOnly = !!o.viewOnly;   // MAP ボタンからの閲覧専用（START バーなし・開始しない）
    let mx = 1; for (const e of this.list) if (e.stage > mx) mx = e.stage;
    this.maxStage = mx;
    this.opt = new Map(); for (const e of this.list) this.opt.set(e.stage, e);
    this.rec = new Map(); for (const B of this.sum.bodies) for (const s of B.stages) this.rec.set(s.stage, { mask: s.mask | 0, grade: s.grade || '' });
    // 天体ごとの状態（リング／旗／ロック）
    this.B = Object.create(null);
    BODIES.forEach((b, bi) => {
      const first = bi * STAGES_PER_BODY + 1, sb = this.sum.bodies[bi] || { stars: 0, max: 0, grade: '', stages: [] };
      const loops = this.maxStage >= first ? Math.floor((this.maxStage - first) / SM_PER_LOOP) : -1;   // 解放済みの最大周回（-1=ロック）
      const l0 = []; for (let p = 0; p < STAGES_PER_BODY; p++) l0.push(this._rec(first + p));
      this.B[b.id] = { id: b.id, bi, name: b.name, tag: b.atmoTag, first, loops, locked: loops < 0, loop: Math.max(0, loops),
        ring: l0.every((r) => r.mask > 0), gold: l0.every((r) => r.mask === 7), any: sb.stages.some((s) => s.mask > 0),
        stars: sb.stars, max: sb.max, best: sb.grade || '' };
    });
    // 時刻・状態
    this.NOW = 0; this.T = 6; this.introT = this.reduce ? 1.6 : 0;
    this.zProg = 0; this.zTarget = 0; this.zDone = false;
    const top = this.list.length ? stageInfo(this.maxStage).body.id : 'moon';
    this.camSys = SM_LB[top].sys; this.ship = { at: top, fl: null };
    this.mascot = { mode: 'idle', t0: -9, n: 0 };
    this.selected = null; this.sel = null; this.selTime = 0; this.toast = null;
    this.stAt = Object.create(null); this.shown = Object.create(null);
    this.parts = []; this.comet = null; this.cometNext = 6;
    this.ovP = Object.create(null); this.shipScr = null;
    this.kbOn = false; this.focus = Math.max(0, SM_SYS_ORDER.indexOf(this.camSys));
    this._upd();
  }
  _rec(stage) { return this.rec.get(stage) || { mask: 0, grade: '' }; }

  // ---- 公開: 状態・当たり判定（テストでも使う）----
  get view() { return this.zTarget === 1 ? 'zoom' : 'over'; }
  reachable() {   // マップから開始できるステージ（天体×周回×ステージ）。_startOptions() と一致するはず
    const out = [];
    for (const id of Object.keys(this.B)) { const B = this.B[id]; for (let L = 0; L <= B.loops; L++) for (let p = 0; p < STAGES_PER_BODY; p++) { const st = L * SM_PER_LOOP + B.first + p; if (st <= this.maxStage) out.push(st); } }
    return out.sort((a, b) => a - b);
  }
  pips(id) {   // 表示中の周回の2ステージ
    const B = this.B[id], out = [];
    for (let p = 0; p < STAGES_PER_BODY; p++) {
      const stage = B.loop * SM_PER_LOOP + B.first + p, r = this._rec(stage);
      out.push({ stage, part: p + 1, state: stage > this.maxStage ? 'locked' : (r.mask > 0 ? 'done' : 'open'), mask: r.mask, grade: r.grade });
    }
    return out;
  }
  ringState(id) {   // 着陸天体 or 惑星系: 'none' | 'ring'(全ステージ着陸) | 'gold'(全★)
    const ids = SM_SYS[id] ? SM_SYS[id].bodies : [id];
    const bs = ids.map((i) => this.B[i]);
    if (!bs.length || bs.some((b) => !b.ring)) return 'none';
    return bs.every((b) => b.gold) ? 'gold' : 'ring';
  }
  hasPatch(id) { return this.PT[id] === true; }
  patchTotal() { return { n: patchCount(this.patches), of: this.patches.length || BODY_COUNT }; }
  flagged(id) { const ids = SM_SYS[id] ? SM_SYS[id].bodies : [id]; return ids.some((i) => this.B[i].any); }
  sysLocked(sys) { return SM_SYS[sys].bodies.every((i) => this.B[i].locked); }
  sysStars(sys) { let st = 0, mx = 0; for (const i of SM_SYS[sys].bodies) { st += this.B[i].stars; mx += this.B[i].max; } return { st, mx }; }
  backRect() { return { x: 4, y: 4, w: 86, h: 50 }; }
  startRect() { return { x: 16, y: 536, w: 328, h: 52 }; }
  chipRects() { const w = 54, g = 5, x0 = (SM_W - 6 * w - 5 * g) / 2; return SM_SYS_ORDER.map((id, i) => ({ x: x0 + i * (w + g), y: 500, w, h: 44, sys: id })); }
  soonRects() { return SM_SOON.map((nm, i) => ({ x: 2 + i * 60, y: 572, w: 56, h: 56, soon: nm })); }
  cards(sys) {
    const out = []; let y = 300;
    for (const id of SM_SYS[sys].bodies) { out.push({ kind: 'body', id, y, h: 70 }); y += 76; }
    if (SM_SYS[sys].bonus) { out.push({ kind: 'bonus', y, h: 48 }); y += 54; }
    if (SM_SYS[sys].soon) out.push({ kind: 'soon', soon: SM_SYS[sys].soon, y, h: 48 });
    return out;
  }
  pipRect(card, i) { return { x: 168 + i * 54, y: card.y + 35 - 26, w: 48, h: 52 }; }
  stepRects(card) { const cy = card.y + 35; return { prev: { x: 62, y: cy - 9, w: 48, h: 44 }, next: { x: 112, y: cy - 9, w: 48, h: 44 } }; }
  selectableAt(sys) {   // 惑星系の表示中の周回で選べるステージ（解放済みのみ）
    const out = [];
    for (const c of this.cards(sys)) if (c.kind === 'body') for (const pp of this.pips(c.id)) if (pp.state !== 'locked') out.push({ id: c.id, stage: pp.stage });
    return out;
  }
  stateInfo() { return { view: this.view, camSys: this.camSys, zProg: this.zProg, ship: this.ship.at, fl: !!this.ship.fl, introT: this.introT, sel: this.sel, selected: this.selected }; }

  // ---- 位置 ----
  _introK(i) { return { orbit: SM_clamp((this.introT - 0.05 * i) / 0.6), planet: SM_clamp((this.introT - 0.35 - 0.09 * i) / 0.55) }; }
  _updOv() {
    SM_SYS_ORDER.forEach((id, i) => {
      const p = SM_PL[id], e = SM_ease(this._introK(i).planet), a = p.ph + p.w * this.T - (1 - e) * 1.4;
      this.ovP[id] = { x: SM_OV.cx + Math.cos(a) * p.r, y: SM_OV.cy + Math.sin(a) * p.r, s: SM_outCubic(this._introK(i).planet), a };
    });
  }
  _ovMoon(id) { const m = SM_MOONS[id], h = this.ovP[m.sys], a = m.ph + m.ovW * this.T; return { x: h.x + Math.cos(a) * m.ovR, y: h.y + Math.sin(a) * m.ovR * 0.8 }; }
  _ovPos(id) { if (this.ovP[id]) return this.ovP[id]; if (SM_MOONS[id]) return this._ovMoon(id); return this.ovP.earth; }
  _zmMoon(id) { const m = SM_MOONS[id], a = m.ph + m.zW * this.T; return { x: SM_ZH.x + Math.cos(a) * m.zx, y: SM_ZH.y + Math.sin(a) * m.zy, depth: Math.sin(a), r: m.zr * (1 + 0.1 * Math.sin(a)) }; }
  _zmPos(id, sys) {
    const s = SM_SYS[id] ? id : (SM_LB[id] ? SM_LB[id].sys : null);
    if (s !== sys) return null;
    if (SM_MOONS[id]) { const m = this._zmMoon(id); return { x: m.x, y: m.y, r: m.r }; }
    return { x: SM_ZH.x, y: SM_ZH.y, r: SM_SYS[sys].hubR };
  }
  _sysOf(id) { return SM_SYS[id] ? id : (SM_LB[id] ? SM_LB[id].sys : null); }
  _dock(world, id) {
    if (world === 'ov') { const p = this._ovPos(id); return { x: SM_clamp(p.x + 11, 14, SM_W - 14), y: p.y - 14 }; }
    const p = this._zmPos(id, this.camSys); if (!p) return null;
    const hub = !SM_MOONS[id];
    return { x: SM_clamp(p.x + (hub ? p.r * 1.0 + 14 : p.r + 16), 20, SM_W - 20), y: p.y - (hub ? p.r * 0.62 : p.r + 6) };
  }
  _bob() { return this.reduce ? 0 : Math.sin(this.NOW * 1.6) * 1.14; }
  _upd() {
    this._updOv();
    const world = this.zProg === 0 ? 'ov' : (this.zProg === 1 ? 'zm' : null);
    this.shipScr = null;
    if (!world || this.ship.fl) return;
    if (world === 'zm' && this._sysOf(this.ship.at) !== this.camSys) return;
    const d = this._dock(world, this.ship.at); if (!d) return;
    const k = world === 'ov' ? 0.52 : 0.92;
    this.shipScr = { world, x: d.x, y: d.y + this._bob() * k, k };
  }

  // ---- 更新 ----
  update(dt) {
    dt = dt > 0 ? Math.min(dt, 0.1) : 0.016;
    this.NOW += dt; if (!this.reduce) this.T += dt;
    this.introT = this.reduce ? 1.6 : Math.min(1.6, this.introT + dt);
    const zdur = this.reduce ? 0.22 : 0.5;
    if (this.zProg !== this.zTarget) {
      this.zProg += Math.sign(this.zTarget - this.zProg) * dt / zdur;
      if (Math.abs(this.zProg - this.zTarget) < dt / zdur) this.zProg = this.zTarget;
      this.zProg = SM_clamp(this.zProg);
    }
    this._upd();
    const fl = this.ship.fl;
    if (fl) {
      fl.t += dt / fl.dur;
      const e = SM_ease(SM_clamp(fl.t)), pt = this._fpt(fl, fl.world, e);
      if (!this.reduce && this.parts.length < 40 && Math.random() < dt * 60 * 0.8) {
        const tg = this._fpt(fl, fl.world, Math.min(1, e + 0.02)); const dx = pt.x - tg.x, dy = pt.y - tg.y, L = Math.hypot(dx, dy) || 1;
        this._puff(fl.world, pt.x + dx / L * 6, pt.y + dy / L * 6, dx / L * 14 + (Math.random() - 0.5) * 10, dy / L * 14 + (Math.random() - 0.5) * 10, false);
      }
      if (fl.t >= 1) {
        const after = fl.after; this.ship.at = fl.toId; const d = this._dock(fl.world, fl.toId);
        if (d && !this.reduce) for (let i = 0; i < 7; i++) { const an = Math.random() * SM_TAU; this._puff(fl.world, d.x, d.y + 4, Math.cos(an) * 18, Math.sin(an) * 18, true); }
        this.ship.fl = null; this._poke('jump'); this._upd(); if (after) after();
      }
    }
    for (let i = this.parts.length - 1; i >= 0; i--) { const q = this.parts[i]; q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.t > q.life) this.parts.splice(i, 1); }
    if (!this.reduce) {
      this.cometNext -= dt;
      if (this.cometNext <= 0 && !this.comet) { this.comet = { x: -20 + SM_rnd() * 140, y: -10 + SM_rnd() * 90, vx: 150, vy: 95, t: 0, life: 1.7 }; this.cometNext = 8 + SM_rnd() * 7; }
      if (this.comet) { this.comet.t += dt; if (this.comet.t > this.comet.life) this.comet = null; }
    } else this.comet = null;
  }
  _puff(world, x, y, vx, vy, big) { this.parts.push({ w: world, x, y, vx, vy, t: 0, life: 0.5 + Math.random() * 0.3, r: big ? 2.4 : 1.6 }); }
  _land() { const fl = this.ship.fl; if (!fl) return; this.ship.at = fl.toId; this.ship.fl = null; this._poke('jump'); this._upd(); }
  // 飛行中の入力: 拡大中の選択移動（後続処理なし）はその場で着陸させて入力をそのまま処理、惑星間の飛行は1タップでスキップして入力は消費
  _settle() {
    const fl = this.ship.fl; if (!fl) return false;
    if (fl.world === 'zm' && !fl.after) { this._land(); return false; }
    fl.t = 1; return true;
  }
  _poke(kind) { this.mascot.mode = kind; this.mascot.t0 = this.NOW; }
  _say(text) { this.toast = { text, t0: this.NOW }; }
  _fpt(fl, world, tt) {
    const to = this._dock(world, fl.toId) || fl.from, a = fl.from;
    const mx = (a.x + to.x) / 2, my = (a.y + to.y) / 2, dx = to.x - a.x, dy = to.y - a.y, L = Math.hypot(dx, dy) || 1;
    const bulge = Math.min(46, L * 0.28) * (fl.sign || 1);
    const cx = mx + (-dy / L) * bulge, cy = my + (dx / L) * bulge, u = 1 - tt;
    return { x: u * u * a.x + 2 * u * tt * cx + tt * tt * to.x, y: u * u * a.y + 2 * u * tt * cy + tt * tt * to.y, to };
  }
  _flyTo(id, world, after, dur) {
    const to = this._dock(world, id), from = this._dock(world, this.ship.at) || to;
    if (!to) { if (after) after(); return; }
    this.ship.fl = { from: { x: from.x, y: from.y }, toId: id, world, t: 0, dur: this.reduce ? 0.3 : (dur || 0.9), after, sign: from.x < to.x ? -1 : 1 };
  }
  _gotoSys(sys) {
    if (this.ship.fl || this.zTarget === 1 || this.zProg > 0) return;
    this.camSys = sys;
    const go = () => this._zoomTo(sys);
    if (this._sysOf(this.ship.at) === sys) go(); else this._flyTo(sys, 'ov', go, 0.9);
  }
  _zoomTo(sys) {
    this.camSys = sys; this.zTarget = 1; this.selected = null; this.sel = null;
    this.focus = Math.max(0, SM_SYS_ORDER.indexOf(sys));
    if (!this.shown[sys]) { this.shown[sys] = true; this._popStars(sys); }
  }
  _popStars(sys, only) {
    let i = 0;
    for (const id of SM_SYS[sys].bodies) {
      if (only && only !== id) continue;
      for (const pp of this.pips(id)) if (pp.mask) this.stAt[pp.stage] = this.NOW + 0.45 + 0.34 * (i++);
    }
  }

  // ---- 入力 ----
  hitTest(x, y) {
    const z = this.zProg, sc = this.shipScr;
    if (sc && !this.ship.fl) {
      if (z === 0 && Math.hypot(x - sc.x, y - (sc.y - 10 * sc.k - 2)) < 14) return { kind: 'astro' };
      if (z === 1 && Math.hypot(x - sc.x, y - (sc.y - 11 * sc.k)) < 22) return { kind: 'astro' };
    }
    if (z === 0) {
      if (SM_hit(this.backRect(), x, y)) return { kind: 'back' };
      let best = null, bd = 1e9;
      SM_SYS_ORDER.forEach((id) => {
        const q = this.ovP[id]; let d = Math.hypot(x - q.x, y - q.y);
        for (const m of Object.keys(SM_MOONS)) if (SM_MOONS[m].sys === id) { const mp = this._ovMoon(m); d = Math.min(d, Math.hypot(x - mp.x, y - mp.y) - 6); }
        if (d < 26 && d < bd) { bd = d; best = id; }
      });
      if (best) return { kind: 'sys', sys: best };
      for (const r of this.chipRects()) if (SM_hit(r, x, y)) return { kind: 'sys', sys: r.sys };
      for (const r of this.soonRects()) if (SM_hit(r, x, y)) return { kind: 'soon', soon: r.soon };
      return null;
    }
    if (z === 1) {
      if (SM_hit(this.backRect(), x, y)) return { kind: 'back' };
      if (!this.viewOnly && this.sel !== null && SM_hit(this.startRect(), x, y)) return { kind: 'start' };
      const cards = this.cards(this.camSys);
      for (const c of cards) if (c.kind === 'body') {
        const B = this.B[c.id], st = this.stepRects(c);
        if (B.loops > 0) { if (SM_hit(st.prev, x, y)) return { kind: 'orbit', id: c.id, d: -1 }; if (SM_hit(st.next, x, y)) return { kind: 'orbit', id: c.id, d: 1 }; }
        const ps = this.pips(c.id);
        for (let i = 0; i < ps.length; i++) if (SM_hit(this.pipRect(c, i), x, y)) return { kind: 'pip', id: c.id, stage: ps[i].stage, state: ps[i].state };
      }
      for (const c of cards) if (x >= 16 && x <= 344 && y >= c.y && y <= c.y + c.h) return c.kind === 'body' ? { kind: 'card', id: c.id } : { kind: c.kind, soon: c.soon };
      for (const id of SM_SYS[this.camSys].bodies) {
        const q = this._zmPos(id, this.camSys); if (!q) continue;
        if (Math.hypot(x - q.x, y - q.y) < Math.max(q.r + 6, 24)) return { kind: 'body', id };
      }
      const q = this._zmPos(this.camSys, this.camSys);
      if (q && this.camSys === 'earth' && Math.hypot(x - q.x, y - q.y) < Math.max(q.r + 6, 24)) return { kind: 'hub' };
    }
    return null;
  }
  // 戻り値: null | { start: stage } | { close: true }
  input(action, data) {
    if (action === 'tap') return data ? this._tap(data.x, data.y) : null;
    if (action === 'back') {
      if (this.introT < 1.5) { this.introT = 1.6; return null; }
      if (this._settle()) return null;
      if (this.zProg > 0 && this.zProg < 1) return null;
      return this._back();
    }
    this.kbOn = true;
    if (this.introT < 1.5) { this.introT = 1.6; return null; }
    if (this._settle()) return null;
    if (this.zProg > 0 && this.zProg < 1) return null;
    if (this.zTarget === 0) {   // 俯瞰: 矢印で惑星、決定で拡大
      if (action === 'left' || action === 'up') this.focus = (this.focus + SM_SYS_ORDER.length - 1) % SM_SYS_ORDER.length;
      else if (action === 'right' || action === 'down') this.focus = (this.focus + 1) % SM_SYS_ORDER.length;
      else if (action === 'confirm') { this.sfx(); this._gotoSys(SM_SYS_ORDER[this.focus]); }
      return null;
    }
    const sp = this.selectableAt(this.camSys);   // 拡大: 左右でステージ、上下で周回、決定で選択→開始
    const idx = sp.findIndex((s) => s.stage === this.sel);
    if (action === 'left' || action === 'right') {
      if (!sp.length) return null;
      const n = idx < 0 ? (action === 'right' ? 0 : sp.length - 1) : SM_clamp(idx + (action === 'right' ? 1 : -1), 0, sp.length - 1);
      this._selectStage(sp[n].id, sp[n].stage); return null;
    }
    if (action === 'up' || action === 'down') {
      const cur = idx >= 0 ? sp[idx].id : (sp.length ? sp[0].id : null);
      if (cur && this.B[cur].loops > 0) this._orbit(cur, action === 'up' ? 1 : -1);
      return null;
    }
    if (action === 'confirm') {
      if (this.sel !== null) return this._start();
      if (sp.length) { const f = sp.reduce((a, b) => (b.stage > a.stage ? b : a)); this._selectStage(f.id, f.stage); }
    }
    return null;
  }
  _back() {
    this.sfx();
    if (this.zTarget === 1) { this.zTarget = 0; this.selected = null; this.sel = null; return null; }
    return { close: true };
  }
  _start() {
    if (this.viewOnly || this.sel === null || !this.opt.has(this.sel)) return null;
    this.sfx();
    return { start: this.sel };
  }
  _orbit(id, d) {
    const B = this.B[id], n = SM_clamp(B.loop + d, 0, B.loops);
    if (n === B.loop) return;
    B.loop = n; this.sfx();
    if (this.sel !== null && this.selected === id) { this.sel = null; this.selected = null; }
    this._popStars(this.camSys, id);
  }
  _selectStage(id, stage) {
    if (this.ship.fl) this._land();
    this.sel = stage; this.selected = id; this.selTime = this.NOW; this.sfx();
    if (this.ship.at !== id) this._flyTo(id, 'zm', null, 0.8);
  }
  _lockedMsg(stage) { this._say('LOCKED · REACH STAGE ' + stage); }
  _tap(x, y) {
    if (this.introT < 1.5) { this.introT = 1.6; return null; }          // イントロは1タップでスキップ（そのタップは他に使わない）
    if (this._settle()) return null;
    if (this.zProg > 0 && this.zProg < 1) return null;
    const h = this.hitTest(x, y); if (!h) return null;
    switch (h.kind) {
      case 'astro': { const modes = this.reduce ? ['wave'] : ['jump', 'spin', 'wave']; this._poke(modes[this.mascot.n++ % modes.length]); this.sfx(); return null; }
      case 'back': return this._back();
      case 'sys': this.sfx(); this._gotoSys(h.sys); return null;
      case 'soon': this.sfx(); this._say(h.soon + ' · COMING SOON v1.2'); return null;
      case 'bonus': case 'hub': this._say('TERRA · BONUS MISSIONS APPEAR DURING A RUN'); return null;
      case 'start': return this._start();
      case 'orbit': this._orbit(h.id, h.d); return null;
      case 'pip':
        if (h.state === 'locked') { this._lockedMsg(h.stage); return null; }
        this._selectStage(h.id, h.stage); return null;
      case 'card': case 'body': {
        const B = this.B[h.id];
        if (B.locked) { this._lockedMsg(B.first); return null; }
        const ps = this.pips(h.id).filter((q) => q.state !== 'locked');
        if (ps.length) this._selectStage(h.id, ps[ps.length - 1].stage);
        return null;
      }
      default: return null;
    }
  }

  // ---- 描画 ----
  _mascotPose() {
    const dt = this.NOW - this.mascot.t0;
    let dy = 0, rot = 0, mode;
    if (dt >= 0 && dt < 1.7) {
      const kind = this.mascot.mode;
      if (kind === 'jump') { const u = SM_clamp(dt / 0.75); dy = Math.sin(u * Math.PI) * 15; if (u >= 1) mode = 'wave'; }
      else if (kind === 'spin') { const u = SM_clamp(dt / 0.9); dy = Math.sin(u * Math.PI) * 11; rot = this.reduce ? 0 : SM_ease(u) * SM_TAU; }
      else mode = 'wave';
      return { dy, rot, mode };
    }
    if (this.reduce) return { dy: 0, rot: 0, mode: undefined };
    if (this.NOW % 3.4 < 2.2) mode = 'wave';
    const hop = this.NOW % 5; if (hop < 0.5) dy = Math.sin(hop / 0.5 * Math.PI) * 5;
    return { dy, rot: 0, mode };
  }
  _drawShipFull(c, x, y, k, ang, flying) {
    let bob = 0, wob = 0;
    if (!flying && !this.reduce) { bob = Math.sin(this.NOW * 1.6) * 1.14 * k; wob = Math.sin(this.NOW * 1.3) * 3; }
    c.save(); c.translate(x, y + bob); c.scale(k, k);
    drawShip(c, 0, 0, ang + wob, flying, false, false, this.T);
    if (!flying) {
      const m = this._mascotPose();
      c.save(); c.translate(-3, -12 - m.dy); if (m.rot) { c.translate(0, -7); c.rotate(m.rot); c.translate(0, 7); }
      drawAstronaut(c, 0, 0, m.mode, this.NOW);
      c.restore();
    }
    c.restore();
  }
  _drawParts(c, world) {
    for (const p of this.parts) {
      if (p.w !== world) continue;
      const k = p.t / p.life, a = 1 - k;
      c.fillStyle = k < 0.35 ? 'rgba(255,236,190,' + a + ')' : 'rgba(255,181,71,' + (a * 0.7) + ')';
      c.beginPath(); c.arc(p.x, p.y, p.r * (1 + k * 0.8), 0, SM_TAU); c.fill();
    }
  }
  _drawShipIn(c, world) {
    const k = world === 'ov' ? 0.52 : 0.92, fl = this.ship.fl;
    if (fl && fl.world === world) {
      const e = SM_ease(SM_clamp(fl.t)), end = this._fpt(fl, world, e).to, p = P();
      c.save();
      c.strokeStyle = rgba(p.warn, 0.8); c.lineWidth = 1; c.lineCap = 'round';
      c.setLineDash([2, 4]); c.lineDashOffset = -this.NOW * 14;
      c.beginPath();
      for (let i = 0; i <= 24; i++) { const q = this._fpt(fl, world, e + (1 - e) * i / 24); c[i ? 'lineTo' : 'moveTo'](q.x, q.y); }
      c.stroke(); c.setLineDash([]);
      const rr = 4 + 1.5 * Math.sin(this.NOW * 6);
      c.strokeStyle = rgba(p.warn, 0.9); c.lineWidth = 0.8;
      c.beginPath(); c.moveTo(end.x - rr - 2, end.y); c.lineTo(end.x - 2, end.y); c.moveTo(end.x + 2, end.y); c.lineTo(end.x + rr + 2, end.y); c.moveTo(end.x, end.y - rr - 2); c.lineTo(end.x, end.y - 2); c.moveTo(end.x, end.y + 2); c.lineTo(end.x, end.y + rr + 2); c.stroke();
      c.restore();
      const a = this._fpt(fl, world, e), b = this._fpt(fl, world, Math.min(1, e + 0.02));
      let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
      if (e >= 0.99) ang = 0;
      this._drawShipFull(c, a.x, a.y, k, ang, true);
      return;
    }
    if (world === 'zm' && this._sysOf(this.ship.at) !== this.camSys) return;
    const d = this._dock(world, this.ship.at); if (!d) return;
    this._drawShipFull(c, d.x, d.y, k, 0, false);
  }
  _drawBg(c) {
    const p = P(), z = SM_ease(this.zProg), T = this.T;
    c.fillStyle = p.bg; c.fillRect(0, 0, SM_W, SM_H);
    c.fillStyle = SM_grad(c, 'tint', () => { const g = c.createRadialGradient(SM_OV.cx, SM_OV.cy, 0, SM_OV.cx, SM_OV.cy, 260); g.addColorStop(0, 'rgba(40,120,120,0.1)'); g.addColorStop(1, 'rgba(40,120,120,0)'); return g; });
    c.fillRect(0, 0, SM_W, SM_H);
    c.fillStyle = '#d8dff0';
    for (const s of SM_STARS) {
      const x = (((s.x + T * 1.2 * s.d - z * 30 * s.d) % SM_W) + SM_W) % SM_W, y = (((s.y + z * 18 * s.d) % SM_H) + SM_H) % SM_H;
      const tw = this.reduce ? 1 : 0.7 + 0.3 * Math.sin(T * (1 + s.d) + s.ph);
      c.globalAlpha = (0.18 + 0.4 * s.d) * tw;
      const r = s.s * 0.9; c.fillRect(x, y, r, r);
    }
    c.globalAlpha = 1;
    const cm = this.comet;
    if (cm) {
      const k = cm.t / cm.life, x = cm.x + cm.vx * cm.t, y = cm.y + cm.vy * cm.t, al = Math.sin(SM_clamp(k) * Math.PI), L = 54;
      const n = Math.hypot(cm.vx, cm.vy), nx = cm.vx / n, ny = cm.vy / n;
      const gr = c.createLinearGradient(x, y, x - nx * L, y - ny * L);
      gr.addColorStop(0, 'rgba(236,240,255,' + (0.8 * al) + ')'); gr.addColorStop(1, 'rgba(236,240,255,0)');
      c.strokeStyle = gr; c.lineWidth = 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x - nx * L, y - ny * L); c.stroke();
      c.fillStyle = 'rgba(255,255,255,' + al + ')'; c.beginPath(); c.arc(x, y, 1.1, 0, SM_TAU); c.fill();
    }
    if (!this.reduce) for (let i = 0; i < 7; i++) { const x = (i * 53 + 20) % SM_W, y = (i * 97 + 90) % 520, a = Math.max(0, Math.sin(T * 0.9 + i * 1.7)); SM_sparkle(c, x, y, 2.4 + a * 1.6, a * 0.5, i % 2 ? '#FFB547' : '#63D8C9'); }
  }
  _ring(c, x, y, r, state, uiA) {   // 完了リング（全ステージ着陸=ティール／全★=金）
    if (state === 'none') return;
    const p = P();
    c.strokeStyle = rgba(state === 'gold' ? p.warn : p.mid, (state === 'gold' ? 0.9 : 0.7) * uiA); c.lineWidth = state === 'gold' ? 1.1 : 0.8;
    c.beginPath(); c.arc(x, y, r, 0, SM_TAU); c.stroke();
  }
  _drawOverviewWorld(c) {
    const p = P(), cx = SM_OV.cx, cy = SM_OV.cy, T = this.T, introT = this.introT;
    SM_SYS_ORDER.forEach((id, i) => {
      const o = SM_PL[id], pr = SM_ease(this._introK(i).orbit); if (pr <= 0) return;
      const hl = this.kbOn && this.focus === i;
      c.save(); c.strokeStyle = rgba(p.mid, hl ? 0.6 : 0.3); c.lineWidth = 0.8; c.lineCap = 'round';
      if (i % 2) c.setLineDash([1, 3]);
      c.beginPath(); c.arc(cx, cy, o.r, -Math.PI / 2, -Math.PI / 2 + SM_TAU * pr); c.stroke(); c.restore();
    });
    const uiA = SM_clamp((introT - 0.9) / 0.6);
    {   // 外周の目盛りと走査線（目盛りは1パスにまとめる）
      c.save(); c.translate(cx, cy);
      const R = 176, ia = SM_clamp(introT / 1.0);
      c.strokeStyle = rgba(p.mid, 0.4 * ia); c.lineWidth = 0.6; c.beginPath();
      for (let a = 0; a < 72; a++) { const th = a / 72 * SM_TAU, L = a % 6 === 0 ? 7 : 3.5, cs = Math.cos(th), sn = Math.sin(th); c.moveTo(cs * R, sn * R); c.lineTo(cs * (R + L), sn * (R + L)); }
      c.stroke();
      c.strokeStyle = rgba(p.mid, 0.14 * ia); c.beginPath(); c.moveTo(-R, 0); c.lineTo(R, 0); c.moveTo(0, -R); c.lineTo(0, R); c.stroke();
      const sw = this.reduce ? 0.8 : T * 0.5;
      for (let i = 0; i < 14; i++) { const th = sw - i * 0.035; c.strokeStyle = rgba(p.mid, (0.2 - i * 0.014) * ia); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(th) * R, Math.sin(th) * R); c.stroke(); }
      c.restore();
    }
    // 太陽（呼吸するグロー）
    const br = this.reduce ? 1 : 1 + 0.07 * Math.sin(T * 1.4), sr = 8.5 * SM_clamp(introT / 0.5), Rg = 34 * br;
    c.save(); c.translate(cx, cy); c.scale(Rg, Rg);
    c.fillStyle = SM_grad(c, 'sun', () => { const g = c.createRadialGradient(0, 0, 0, 0, 0, 1); g.addColorStop(0, 'rgba(255,181,71,0.37)'); g.addColorStop(0.35, 'rgba(255,181,71,0.064)'); g.addColorStop(1, 'rgba(255,181,71,0)'); return g; });
    c.beginPath(); c.arc(0, 0, 36 / 34, 0, SM_TAU); c.fill(); c.restore();
    c.strokeStyle = rgba(p.warn, 0.9); c.lineWidth = 0.9; c.beginPath(); c.arc(cx, cy, sr, 0, SM_TAU); c.stroke(); c.fillStyle = rgba(p.warn, 0.35); c.fill();
    c.beginPath(); c.moveTo(cx - sr - 4, cy); c.lineTo(cx + sr + 4, cy); c.moveTo(cx, cy - sr - 4); c.lineTo(cx, cy + sr + 4); c.stroke();
    // 惑星
    const selSys = this.selected ? this._sysOf(this.selected) : null;
    SM_SYS_ORDER.forEach((id, i) => {
      const o = SM_PL[id], q = this.ovP[id]; if (q.s <= 0.01) return;
      const kf = this.kbOn && this.focus === i, locked = this.sysLocked(id);
      const r = o.sz * q.s;
      c.save(); c.globalAlpha *= locked ? 0.55 : 1;
      if (SM_SYS[id].bonus) {   // TERRA ボーナスの印
        const bx = q.x - 10 * q.s, by = q.y - 10 * q.s, d = 2.6 + (this.reduce ? 0 : 0.5 * Math.sin(T * 3));
        c.strokeStyle = rgba(p.warn, 0.9 * uiA); c.lineWidth = 0.9; c.beginPath(); c.moveTo(bx, by - d); c.lineTo(bx + d, by); c.lineTo(bx, by + d); c.lineTo(bx - d, by); c.closePath(); c.stroke();
      }
      SM_body(c, id, q.x, q.y, r, T, this.reduce, { pers: r >= 9 ? undefined : false, halo: r >= 5 });
      c.restore();
      for (const mid of Object.keys(SM_MOONS)) {
        if (SM_MOONS[mid].sys !== id) continue;
        const m = this._ovMoon(mid), mr = 1.6 * q.s, MB = this.B[mid];
        c.strokeStyle = rgba(p.fg, 0.1); c.lineWidth = 0.5; c.beginPath(); c.arc(q.x, q.y, SM_MOONS[mid].ovR, 0, SM_TAU); c.stroke();
        c.fillStyle = MB.locked ? rgba(p.dim, 0.9) : SM_BCOL[mid]; c.beginPath(); c.arc(m.x, m.y, mr, 0, SM_TAU); c.fill();
        this._ring(c, m.x, m.y, mr + 2.3, this.ringState(mid), uiA);
      }
      if (uiA > 0 && !locked) this._ring(c, q.x, q.y, r + (id === 'saturn' ? 10 : 5), this.ringState(id), uiA);
      if (uiA > 0 && this.flagged(id) && !locked) { c.save(); c.translate(q.x + r * 0.55, q.y - r * 0.78); c.scale(0.5, 0.5); drawFlag(c, 0, 0, 1, this.reduce ? 0 : Math.sin(T * 3)); c.restore(); }
      if (uiA > 0) {
        const ly = q.y + r + (id === 'saturn' ? 14 : 10), hl = kf || selSys === id;
        c.save(); c.globalAlpha *= uiA * (hl ? 1 : 0.9);
        SM_T(c, SM_SYS[id].name, SM_clamp(q.x, 24, SM_W - 24), SM_clamp(ly, 20, 470), 8, hl ? p.warn : rgba(p.fg, 0.75), 'center', 500, 1.2);
        const got = SM_SYS[id].bodies.filter((b) => this.hasPatch(b));   // 取得済みパッチを名前の下に小さく並べる
        got.forEach((b, j) => drawMissionPatch(c, b, SM_clamp(q.x, 24, SM_W - 24) + (j - (got.length - 1) / 2) * 11, SM_clamp(ly, 20, 470) + 17, 4.6, {}));
        c.restore();
      }
      if (kf) {
        const b = r + 8, L = 4; c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 0.9;
        [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { c.beginPath(); c.moveTo(q.x + sx * b, q.y + sy * (b - L)); c.lineTo(q.x + sx * b, q.y + sy * b); c.lineTo(q.x + sx * (b - L), q.y + sy * b); c.stroke(); });
      }
    });
  }
  _drawBack(c, a) {
    const p = P(), r = this.backRect();
    c.save(); c.globalAlpha *= a;
    c.strokeStyle = rgba(p.mid, 0.7); c.lineWidth = 0.8; c.strokeRect(10.5, 10.5, 72, 36);
    c.strokeStyle = p.fg; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(30, 20); c.lineTo(23, 28); c.lineTo(30, 36); c.stroke();
    SM_T(c, 'BACK', 38, 32, 10.5, p.fg, 'left', 600, 1.4);
    c.restore(); return r;
  }
  _drawOverviewUI(c, a) {
    const p = P(), sum = this.sum;
    c.save(); c.globalAlpha *= a;
    this._drawBack(c, 1);
    SM_T(c, 'SOLAR SYSTEM', 96, 28, 13, p.fg, 'left', 600, 3);
    SM_T(c, 'BETA v1.1', SM_W - 16, 28, 9, p.warn, 'right', 700, 1.5);
    SM_T(c, 'SELECT DESTINATION', 96, 45, 9.5, p.dim, 'left', 500, 1.5);
    SM_T(c, '★ ' + sum.totalStars + ' / ' + sum.maxStars, SM_W - 16, 45, 9.5, rgba(p.fg, 0.7), 'right', 500, 0.6);
    { const pt = this.patchTotal(); SM_T(c, 'PATCH ' + pt.n + '/' + pt.of, SM_W - 16, 62, 8, pt.n >= pt.of && pt.of > 0 ? p.warn : rgba(p.fg, 0.6), 'right', 500, 0.8); }
    const mm = Math.floor(this.T / 60) % 60, ss = Math.floor(this.T) % 60;
    SM_T(c, 'T+ 00:' + String(mm).padStart(2, '0') + ':' + String(ss).padStart(2, '0'), 16, 62, 8, rgba(p.mid, 0.7), 'left', 500, 1);
    c.strokeStyle = rgba(p.mid, 0.3); c.lineWidth = 0.6; c.beginPath(); c.moveTo(16, 68); c.lineTo(SM_W - 16, 68); c.stroke();
    this.chipRects().forEach((r, i) => {
      const id = SM_SYS_ORDER[i], lk = this.sysLocked(id), ss2 = this.sysStars(id), hl = this.kbOn && this.focus === i;
      c.save();
      c.strokeStyle = rgba(hl ? p.warn : p.mid, hl ? 0.9 : 0.35); c.lineWidth = 0.8; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      SM_T(c, SM_SYS[id].ab, r.x + r.w / 2, r.y + 17, 10, lk ? p.dim : p.fg, 'center', 600, 1.2);
      if (lk) SM_lock(c, r.x + r.w / 2, r.y + 32, 8, p.dim);
      else SM_T(c, '★' + ss2.st + '/' + ss2.mx, r.x + r.w / 2, r.y + 34, 8.5, this.ringState(id) === 'gold' ? p.warn : rgba(p.fg, 0.7), 'center', 500, 0.3);
      c.restore();
    });
    SM_T(c, 'COMING SOON · v1.2', SM_W / 2, 566, 8.5, p.dim, 'center', 600, 2.2);
    SM_SOON.forEach((nm, i) => { const x = 30 + i * 60, y = 593; SM_silhouette(c, nm, x, y); SM_T(c, nm, x, y + 22, 7, rgba(p.dim, 0.9), 'center', 500, 0.5); });
    c.restore();
  }
  _bodyDeco(c, id, x, y, r) {   // 完了リング・旗・選択パルス
    const p = P(), B = this.B[id];
    if (B) {
      this._ring(c, x, y, r + 5, this.ringState(id), 1);
      if (B.any) { const fs = SM_clamp(r / 46, 0.42, 1); c.save(); c.translate(x + r * 0.34, y - r * 0.93); c.scale(fs, fs); drawFlag(c, 0, 0, 1, this.reduce ? 0 : Math.sin(this.T * 3)); c.restore(); }
    }
    if (this.selected === id && this.NOW - this.selTime < 1.2) { const k = (this.NOW - this.selTime) / 1.2; c.strokeStyle = rgba(p.hi, 0.6 * (1 - k)); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 6 + k * 14, 0, SM_TAU); c.stroke(); }
  }
  _drawBonusMark(c, x, y, r) {
    const p = P(), bx = x - r - 14, by = y - r * 0.7, d = 4;
    c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by - d); c.lineTo(bx + d, by); c.lineTo(bx, by + d); c.lineTo(bx - d, by); c.closePath(); c.stroke();
    SM_T(c, 'BONUS', bx + 7, by + 3, 7.5, rgba(p.warn, 0.95), 'left', 600, 1);
  }
  _drawZoomWorld(c, a) {
    const p = P(), sys = this.camSys, T = this.T;
    c.save(); c.globalAlpha *= a;
    for (const mid of SM_SYS[sys].bodies) {
      const m = SM_MOONS[mid]; if (!m) continue;
      c.save(); c.strokeStyle = rgba(p.mid, 0.3); c.lineWidth = 0.8; c.lineCap = 'round'; c.setLineDash([1, 3]);
      c.beginPath(); c.ellipse(SM_ZH.x, SM_ZH.y, m.zx, m.zy, 0, 0, SM_TAU); c.stroke(); c.restore();
    }
    const moons = SM_SYS[sys].bodies.filter((b) => SM_MOONS[b]).map((id) => Object.assign({ id }, this._zmMoon(id)));
    const drawMoon = (m) => {
      const sc = this.selected === m.id; let r = m.r; if (sc && !this.reduce) r *= 1 + 0.05 * Math.sin(this.NOW * 9);
      c.save(); c.globalAlpha *= this.B[m.id].locked ? 0.55 : 1;
      SM_body(c, m.id, m.x, m.y, r, T, this.reduce, { halo: true }); c.restore();
      this._bodyDeco(c, m.id, m.x, m.y, r);
    };
    moons.filter((m) => m.depth < 0).forEach(drawMoon);
    const hubLb = SM_SYS[sys].bodies.find((b) => SM_LB[b].hub), hr = SM_SYS[sys].hubR;
    let hrr = hr; if (hubLb && this.selected === hubLb && !this.reduce) hrr *= 1 + 0.025 * Math.sin(this.NOW * 9);
    c.save(); c.globalAlpha *= (hubLb && this.B[hubLb].locked) ? 0.6 : 1;
    SM_body(c, sys, SM_ZH.x, SM_ZH.y, hrr, T, this.reduce, {}); c.restore();
    if (hubLb) this._bodyDeco(c, hubLb, SM_ZH.x, SM_ZH.y, hrr);
    if (SM_SYS[sys].bonus) this._drawBonusMark(c, SM_ZH.x, SM_ZH.y, hrr);
    moons.filter((m) => m.depth >= 0).forEach(drawMoon);
    this._drawShipIn(c, 'zm'); this._drawParts(c, 'zm');
    c.restore();
  }
  _drawStarSlot(c, x, y, stage, k, R, mask) {
    const p = P();
    SM_starPath(c, x, y, R, R * 0.45);
    c.strokeStyle = rgba(p.dim, 0.7); c.lineWidth = 0.7; c.stroke();
    if (!(mask & (1 << k))) return;
    const t0 = this.stAt[stage], st = t0 === undefined ? -9 : t0 + k * 0.17;
    if (this.NOW < st) return;
    const u = SM_clamp((this.NOW - st) / 0.36), sc = this.reduce ? 1 : SM_outBack(u);
    c.save(); c.translate(x, y); c.scale(sc, sc); SM_starPath(c, 0, 0, R * 1.08, R * 0.5);
    c.fillStyle = p.warn; c.fill(); c.restore();
    if (t0 !== undefined && !this.reduce && this.NOW - st < 0.6) { const v = (this.NOW - st) / 0.6; SM_sparkle(c, x + R * 0.9, y - R * 0.9, R * (1.3 + v) * (1 - v * 0.4), 1 - v, p.warn); SM_sparkle(c, x - R, y + R * 0.4, R * 0.7 * (1 - v), 1 - v, p.mid); }
  }
  _drawGrade(c, g, cx, cy) {
    const p = P();
    if (!g) { SM_T(c, '—', cx, cy + 4, 12, rgba(p.dim, 0.8), 'center', 500, 0); return; }
    const col = g === 'PERFECT' || g === 'S' ? p.warn : g === 'A' ? p.mid : g === 'B' ? p.fg : p.dim;
    if (g === 'PERFECT') {
      SM_T(c, 'PERFECT', cx, cy + 3, 9.5, col, 'center', 700, 1.4);
      const a = this.reduce ? 0.8 : 0.5 + 0.5 * Math.sin(this.NOW * 3); SM_sparkle(c, cx + 29, cy - 8, 3.5, a, '#fff');
      c.strokeStyle = rgba(col, 0.55); c.lineWidth = 0.8; c.beginPath(); c.moveTo(cx - 26, cy + 8); c.lineTo(cx + 26, cy + 8); c.stroke();
    } else {
      c.strokeStyle = rgba(col, 0.85); c.lineWidth = 1; c.beginPath(); c.rect(cx - 13, cy - 13, 26, 26); c.stroke();
      SM_T(c, g, cx, cy + 5.5, 15, col, 'center', 600, 0);
    }
    SM_T(c, 'BEST', cx, cy + 25, 6.5, rgba(p.dim, 0.9), 'center', 600, 1.2);
  }
  _drawCard(c, card) {
    const p = P(), x = 16, w = 328, h = card.h, y = card.y, cy = y + h / 2;
    if (card.kind === 'soon' || card.kind === 'bonus') {
      c.save(); c.globalAlpha *= 0.7;
      SM_rrect(c, x, y, w, h, 3); c.strokeStyle = rgba(p.dim, 0.5); c.lineWidth = 0.8; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
      if (card.kind === 'soon') {
        SM_silhouette(c, card.soon, x + 28, cy, 1.1);
        SM_T(c, card.soon, x + 56, cy - 2, 12, p.dim, 'left', 600, 1.5); SM_T(c, 'COMING SOON · v1.2', x + 56, cy + 12, 8.5, rgba(p.dim, 0.9), 'left', 500, 1.2);
      } else {
        const d = 7; c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 1; c.beginPath(); c.moveTo(x + 28, cy - d); c.lineTo(x + 28 + d, cy); c.lineTo(x + 28, cy + d); c.lineTo(x + 28 - d, cy); c.closePath(); c.stroke();
        SM_T(c, 'TERRA', x + 56, cy - 2, 12, p.fg, 'left', 600, 1.5); SM_T(c, 'BONUS MISSIONS · APPEAR DURING A RUN', x + 56, cy + 12, 8, rgba(p.dim, 0.95), 'left', 500, 0.6);
      }
      c.restore(); return;
    }
    const id = card.id, B = this.B[id], lk = B.locked, sel = this.selected === id;
    c.save();
    c.fillStyle = sel ? 'rgba(255,181,71,0.07)' : 'rgba(99,216,201,0.04)'; c.fillRect(x, y, w, h);
    c.strokeStyle = rgba(sel ? p.warn : p.mid, sel ? 0.9 : 0.3); c.lineWidth = 0.8; const L = 7;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]].forEach(([bx, by, sx, sy]) => { c.beginPath(); c.moveTo(bx + sx * L, by); c.lineTo(bx, by); c.lineTo(bx, by + sy * L); c.stroke(); });
    c.globalAlpha *= lk ? 0.62 : 1;
    const bob = (!this.reduce && !lk) ? Math.sin(this.NOW * 2 + y) * 0.7 : 0;
    SM_body(c, id, x + 30, cy + bob, 15, this.T, this.reduce, { pers: false, halo: false });
    this._ring(c, x + 30, cy + bob, 19, this.ringState(id), 1);
    drawMissionPatch(c, id, x + 138, cy - 17, 9, { earned: this.hasPatch(id), q: false, a: lk ? 0.5 : 1 });
    SM_T(c, B.name, x + 58, cy - 6, 13, lk ? rgba(p.fg, 0.7) : p.fg, 'left', 600, 1.6);
    if (B.loops > 0) {   // 周回の切り替え（2周目以降が解放されたとき）
      const st = this.stepRects(card);
      SM_T(c, '‹', st.prev.x + 12, cy + 12, 16, B.loop > 0 ? p.fg : p.dim, 'center', 600, 0);
      SM_T(c, 'ORBIT ' + (B.loop + 1), 111, cy + 10, 8.5, p.warn, 'center', 600, 0.6);
      SM_T(c, '›', st.next.x + st.next.w - 12, cy + 12, 16, B.loop < B.loops ? p.fg : p.dim, 'center', 600, 0);
    } else SM_T(c, B.tag, x + 58, cy + 10, 8.5, p.dim, 'left', 500, 0.6);
    const ps = this.pips(id);
    for (let i = 0; i < ps.length; i++) {
      const pp = ps[i], r = this.pipRect(card, i), px = r.x, py = r.y, done = pp.state === 'done', cur = this.sel === pp.stage;
      c.strokeStyle = cur ? rgba(p.warn, 1) : (pp.state === 'open' ? rgba(p.warn, 0.5 + (this.reduce ? 0.3 : 0.3 * Math.sin(this.NOW * 3))) : rgba(done ? p.mid : p.dim, done ? 0.7 : 0.5));
      c.lineWidth = cur ? 1.6 : 0.8; c.strokeRect(px + 0.5, py + 0.5, r.w - 1, r.h - 1);
      if (cur) { c.fillStyle = rgba(p.warn, 0.12); c.fillRect(px + 1, py + 1, r.w - 2, r.h - 2); }
      SM_T(c, 'S' + pp.part, px + 5, py + 11, 7.5, p.dim, 'left', 600, 0.6);
      if (pp.state === 'locked') SM_lock(c, px + r.w / 2, py + 28, 10, rgba(p.dim, 0.9));
      else {
        if (pp.grade) SM_T(c, pp.grade === 'PERFECT' ? 'P' : pp.grade, px + r.w - 5, py + 11, 8, pp.grade === 'PERFECT' || pp.grade === 'S' ? p.warn : (pp.grade === 'A' ? p.mid : p.fg), 'right', 600, 0);
        if (pp.state === 'open') { c.fillStyle = rgba(p.warn, 0.9); c.beginPath(); c.moveTo(px + 19, py + 15); c.lineTo(px + 29, py + 21); c.lineTo(px + 19, py + 27); c.closePath(); c.fill(); }
        for (let k = 0; k < 3; k++) this._drawStarSlot(c, px + 11 + k * 13, py + 41, pp.stage, k, 4, pp.mask);
      }
    }
    this._drawGrade(c, B.best, 305, cy - 4);
    c.restore();
  }
  _drawZoomUI(c, a) {
    const p = P(), sys = this.camSys, ss = this.sysStars(sys), n = SM_SYS[sys].bodies.length;
    c.save(); c.globalAlpha *= a;
    this._drawBack(c, 1);
    SM_T(c, SM_SYS[sys].name, SM_W - 16, 28, 13, p.fg, 'right', 600, 3);
    SM_T(c, '★ ' + ss.st + '/' + ss.mx + '   ' + n + ' SITE' + (n > 1 ? 'S' : ''), SM_W - 16, 44, 9, rgba(p.fg, 0.65), 'right', 500, 0.6);
    this.cards(sys).forEach((cd) => this._drawCard(c, cd));
    if (!this.viewOnly && this.sel !== null && this.opt.has(this.sel)) {
      const r = this.startRect(), o = this.opt.get(this.sel), k = SM_clamp((this.NOW - this.selTime) / 0.2);
      c.save(); c.globalAlpha *= 0.4 + 0.6 * k;
      c.fillStyle = 'rgba(255,181,71,0.12)'; c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 1.2; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      c.fillStyle = rgba(p.warn, 0.95); c.beginPath(); c.moveTo(r.x + 18, r.y + 18); c.lineTo(r.x + 34, r.y + 26); c.lineTo(r.x + 18, r.y + 34); c.closePath(); c.fill();
      SM_T(c, 'START', r.x + 48, r.y + 25, 14, p.hi, 'left', 700, 3);
      SM_T(c, o.label, r.x + 48, r.y + 41, 8.5, p.dim, 'left', 500, 1);
      SM_T(c, 'ST.' + o.stage, r.x + r.w - 16, r.y + 32, 12, p.warn, 'right', 600, 1);
      c.restore();
    } else if (this.viewOnly) SM_T(c, 'LAND TO UNLOCK MORE STARTS', SM_W / 2, 628, 8.5, p.dim, 'center', 500, 1.5);
    else SM_T(c, 'SELECT SITE  /  TAP A STAGE', SM_W / 2, 628, 8.5, p.dim, 'center', 500, 1.5);
    c.restore();
  }
  render(c) {
    const z = SM_ease(this.zProg), p = P();
    c.setLineDash([]);
    c.save(); c.beginPath(); c.rect(0, 0, SM_W, SM_H); c.clip();
    this._drawBg(c);
    const A = this.ovP[this.camSys] || this.ovP.jupiter;
    if (z < 0.999) {
      c.save();
      if (z > 0.001) { const Sx = 1 + (SM_KZ - 1) * z, tx = A.x + (SM_ZH.x - A.x) * z, ty = A.y + (SM_ZH.y - A.y) * z; c.globalAlpha *= 1 - SM_clamp((z - 0.2) / 0.55); c.translate(tx, ty); c.scale(Sx, Sx); c.translate(-A.x, -A.y); }
      this._drawOverviewWorld(c);
      if (z < 0.5) { this._drawShipIn(c, 'ov'); this._drawParts(c, 'ov'); }
      c.restore();
    }
    if (z > 0.001) {
      c.save();
      const Sx = 1 / SM_KZ + (1 - 1 / SM_KZ) * z, tx = A.x + (SM_ZH.x - A.x) * z, ty = A.y + (SM_ZH.y - A.y) * z;
      c.translate(tx, ty); c.scale(Sx, Sx); c.translate(-SM_ZH.x, -SM_ZH.y);
      this._drawZoomWorld(c, SM_clamp((z - 0.2) / 0.6));
      c.restore();
    }
    if (z < 0.999) this._drawOverviewUI(c, (1 - SM_clamp(z / 0.5)) * SM_clamp((this.introT - 0.9) / 0.6));
    if (z > 0.001) this._drawZoomUI(c, SM_clamp((z - 0.4) / 0.6));
    const tt = this.toast;
    if (tt) {
      const age = this.NOW - tt.t0;
      if (age < 2.6) {
        const al = SM_clamp(Math.min(age / 0.2, (2.6 - age) / 0.5)), ty = 484;
        c.save(); c.globalAlpha = al; c.font = '600 10px ' + SM_MONO; const tw = c.measureText(tt.text).width + 30;
        SM_rrect(c, SM_W / 2 - tw / 2, ty - 16, tw, 26, 3); c.fillStyle = 'rgba(13,17,27,0.95)'; c.fill(); c.strokeStyle = rgba(p.warn, 0.7); c.lineWidth = 0.8; c.stroke();
        SM_T(c, tt.text, SM_W / 2, ty + 1, 10, p.fg, 'center', 600, 1); c.restore();
      } else this.toast = null;
    }
    // 走査線と流れる明暗帯
    c.fillStyle = 'rgba(99,216,201,0.035)'; c.beginPath(); for (let y = 0; y < SM_H; y += 3) c.rect(0, y, SM_W, 1); c.fill();
    if (!this.reduce) {
      const by = (this.NOW * 40) % (SM_H + 80) - 40;
      c.save(); c.translate(0, by);
      c.fillStyle = SM_grad(c, 'sweep', () => { const g = c.createLinearGradient(0, -40, 0, 40); g.addColorStop(0, 'rgba(99,216,201,0)'); g.addColorStop(0.5, 'rgba(99,216,201,0.045)'); g.addColorStop(1, 'rgba(99,216,201,0)'); return g; });
      c.fillRect(0, -40, SM_W, 80); c.restore();
    }
    c.fillStyle = SM_grad(c, 'vig', () => { const g = c.createRadialGradient(SM_W / 2, SM_H / 2, 200, SM_W / 2, SM_H / 2, 420); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.35)'); return g; });
    c.fillRect(0, 0, SM_W, SM_H);
    c.restore();
  }
}
