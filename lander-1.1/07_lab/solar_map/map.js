// LANDER BETA v1.1 — SOLAR SYSTEM MAP: アニメーション方向性の比較用プロトタイプ（ゲーム本体には未統合）。
// 読み取りのみで 02_src の art.js / palette.js / bodies.js を import（編集しない）。
// 論理座標 360x640 を canvas に DPR 倍でスケール。3スタイル（A/B/C）は同じレイアウト・データで描画と動きの強さだけ変える。
import { drawShip, drawAstronaut, drawFlag, FONT, rgba, mixHex } from '../../02_src/art.js';
import { P } from '../../02_src/core/palette.js';
import { BODIES } from '../../02_src/bodies.js';

const W = 360, H = 640, TAU = Math.PI * 2;
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
const qs = new URLSearchParams(location.search);
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');

// ------------------------------------------------------------------ データ
const BCOL = { mercury: '#a39a8e', venus: '#e2b878', earth: '#5b8fd0', mars: '#c1583a', jupiter: '#cfa77c', saturn: '#dcc592',
  moon: '#b9bfcb', io: '#e0bb3c', europa: '#d6e6ee', titan: '#e0a03e', terra: '#5b8fd0' };
const bodyDef = (id) => BODIES.find((b) => b.id === id);
// 着陸天体（カード単位）。hub=true は惑星そのものに着陸（水星・金星・火星・TERRA）
const LB = {
  mercury: { sys: 'mercury', name: 'MERCURY', tag: 'AIRLESS · HOT', hub: true },
  venus:   { sys: 'venus', name: 'VENUS', tag: 'EXTREME 460°C', hub: true },
  moon:    { sys: 'earth', name: 'MOON', tag: 'NONE' },
  terra:   { sys: 'earth', name: 'TERRA', tag: 'N₂/O₂ · BONUS', hub: true, bonus: true },
  mars:    { sys: 'mars', name: 'MARS', tag: 'THIN CO₂', hub: true },
  io:      { sys: 'jupiter', name: 'IO', tag: 'TRACE SO₂' },
  europa:  { sys: 'jupiter', name: 'EUROPA', tag: 'NONE' },
  titan:   { sys: 'saturn', name: 'TITAN', tag: 'THICK N₂' },
};
for (const id of Object.keys(LB)) { const d = bodyDef(id); if (d && id !== 'terra') { LB[id].name = d.name; LB[id].tag = d.atmoTag.replace('°C', '°C'); } }
const SYS = {
  mercury: { name: 'MERCURY', ab: 'MER', bodies: ['mercury'], hubR: 44, soon: null },
  venus:   { name: 'VENUS', ab: 'VEN', bodies: ['venus'], hubR: 50, soon: null },
  earth:   { name: 'EARTH', ab: 'EAR', bodies: ['moon', 'terra'], hubR: 44, soon: null },
  mars:    { name: 'MARS', ab: 'MAR', bodies: ['mars'], hubR: 44, soon: 'PHOBOS' },
  jupiter: { name: 'JUPITER', ab: 'JUP', bodies: ['io', 'europa'], hubR: 52, soon: null },
  saturn:  { name: 'SATURN', ab: 'SAT', bodies: ['titan'], hubR: 32, soon: 'ENCELADUS' },
};
const SYS_ORDER = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
// 俯瞰の軌道（圧縮した対数風スケール）。w=ambient 角速度, ph=初期位相
const PL = {
  mercury: { r: 24, sz: 4.2, w: TAU / 46, ph: 0.5 },
  venus:   { r: 46, sz: 6.2, w: TAU / 80, ph: 3.2 },
  earth:   { r: 70, sz: 6.8, w: TAU / 120, ph: 4.9 },
  mars:    { r: 94, sz: 5.2, w: TAU / 180, ph: 1.9 },
  jupiter: { r: 126, sz: 11, w: TAU / 300, ph: 5.7 },
  saturn:  { r: 158, sz: 8, w: TAU / 420, ph: 2.6 },
};
const OV = { cx: 180, cy: 262 };
// 衛星（俯瞰では惑星まわりの小円、ズームでは楕円軌道）
const MOONS = {
  moon:   { sys: 'earth', ovR: 12, ovW: TAU / 7, ph: 1.0, zx: 118, zy: 36, zW: TAU / 22, zr: 12 },
  io:     { sys: 'jupiter', ovR: 16, ovW: TAU / 5, ph: 0.2, zx: 92, zy: 30, zW: TAU / 14, zr: 12 },
  europa: { sys: 'jupiter', ovR: 22, ovW: TAU / 9, ph: 2.4, zx: 140, zy: 44, zW: TAU / 24, zr: 11 },
  titan:  { sys: 'saturn', ovR: 17, ovW: TAU / 8, ph: 1.3, zx: 138, zy: 40, zW: TAU / 26, zr: 14 },
};
const SOON = ['PHOBOS', 'RYUGU', '67P', 'ENCELADUS', 'TRITON', 'PLUTO'];
const GRADES = ['C', 'B', 'A', 'S', 'PERFECT'];
const ZH = { x: 180, y: 166 };            // ズーム時の主天体の位置
const K_ZOOM = 3.2;

const DEMO = () => ({
  moon:    [{ s: 'done', n: 3, g: 'PERFECT' }, { s: 'done', n: 3, g: 'S' }],
  terra:   [{ s: 'done', n: 2, g: 'B' }, { s: 'open', n: 0, g: null }],
  europa:  [{ s: 'done', n: 3, g: 'A' }, { s: 'done', n: 2, g: 'B' }],
  io:      [{ s: 'done', n: 1, g: 'B' }, { s: 'done', n: 2, g: 'A' }],
  mars:    [{ s: 'open', n: 0, g: null }, { s: 'locked', n: 0, g: null }],
  titan:   [{ s: 'locked', n: 0, g: null }, { s: 'locked', n: 0, g: null }],
  venus:   [{ s: 'locked', n: 0, g: null }, { s: 'locked', n: 0, g: null }],
  mercury: [{ s: 'locked', n: 0, g: null }, { s: 'locked', n: 0, g: null }],
});
let data = DEMO();

// ------------------------------------------------------------------ スタイル（描画と動きの強さのみ差し替え）
const STY = {
  A: { id: 'A', name: 'Minimal orrery', font: FONT, planet: 'flat', size: 1, orbitW: 0.7, orbitA: 0.2, dotted: false, scan: false, ticks: false,
       sun: 0.55, mascot: 'calm', amb: 0.8, labelA: 0.5, cardR: 14 },
  B: { id: 'B', name: 'Retro-future instrument', font: MONO, planet: 'wire', size: 1, orbitW: 0.8, orbitA: 0.3, dotted: false, scan: true, ticks: true,
       sun: 0.4, mascot: 'still', amb: 1, labelA: 0.75, cardR: 3 },
  C: { id: 'C', name: 'Cute toybox', font: FONT, planet: 'toy', size: 1.28, orbitW: 1.7, orbitA: 0.32, dotted: true, scan: false, ticks: false,
       sun: 0.9, mascot: 'cheery', amb: 1.25, labelA: 0.9, cardR: 22 },
};
let S = STY[(qs.get('style') || 'A').toUpperCase()] || STY.A;
let reduce = qs.get('reduce') === '1';
let faces = qs.get('faces') === '1';
let sound = false;

// ------------------------------------------------------------------ 状態
let NOW = 0;              // 実時間（UI演出）
let T = 6;                // ambient 時間（reduce motion で停止）
let introT = 0;
let view = 'over', camSys = 'jupiter', zProg = 0, zTarget = 0;
let zDone = false;
const ship = { at: 'europa', fl: null };
const mascot = { mode: 'idle', t0: -9, n: 0 };
let hover = null, selected = null, toast = null, pending = null;
const stAt = {};          // `${id}:${i}` -> ★ポップ開始時刻
const shown = {};
const plantT = {};        // body id -> 旗を立て始めた時刻（未設定=設立済み）
const parts = [];
let comet = null, cometNext = 6;
let pointer = { x: 0.5, y: 0.5 };
const ovP = {};           // 俯瞰での惑星位置キャッシュ
let shipScr = null;
let selTime = 0;

// ------------------------------------------------------------------ 補助
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const outBack = (t) => { const c = 1.9; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const outCubic = (t) => 1 - Math.pow(1 - t, 3);
const rnd = (() => { let s = 7; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
function setFont(c, size, wt, font) { c.font = `${wt || 500} ${size}px ${font || S.font}`; }
function T_(c, s, x, y, size, col, align, wt, ls, font) {
  setFont(c, size, wt, font);
  if ('letterSpacing' in c) c.letterSpacing = (ls || 0) + 'px';
  c.textAlign = align || 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = col;
  // letterSpacing は末尾にも空白が付くので中央/右寄せ時は補正
  const adj = (align === 'center') ? (ls || 0) / 2 : (align === 'right' ? (ls || 0) : 0);
  c.fillText(s, x + adj, y);
}
function rrect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function starPath(c, x, y, R, ri) { c.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, q = i % 2 ? ri : R; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * q, y + Math.sin(a) * q); } c.closePath(); }
function sparkle(c, x, y, s, a, col) {
  if (a <= 0 || s <= 0) return;
  c.save(); c.globalAlpha *= a; c.fillStyle = col;
  c.beginPath(); c.moveTo(x, y - s); c.quadraticCurveTo(x, y, x + s, y); c.quadraticCurveTo(x, y, x, y + s); c.quadraticCurveTo(x, y, x - s, y); c.quadraticCurveTo(x, y, x, y - s); c.fill(); c.restore();
}
function lockGlyph(c, x, y, s, col) {
  c.save(); c.strokeStyle = col; c.fillStyle = col; c.lineWidth = 1.2; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y - s * 0.28, s * 0.32, Math.PI, 0); c.stroke();
  rrect(c, x - s * 0.45, y - s * 0.1, s * 0.9, s * 0.7, 1.5); c.fill(); c.restore();
}
function tick(freq) {
  if (!sound) return;
  try {
    const ac = tick.ac || (tick.ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), g = ac.createGain();
    o.frequency.value = freq || 880; o.type = 'sine'; g.gain.value = 0.03;
    g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.06);
    o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.07);
  } catch (_) { /* noop */ }
}
function say(text) { toast = { text, t0: NOW }; }

// 進捗
const stageVis = (id, i) => { const t = stAt[id + ':' + i]; return t === undefined || NOW >= t + 0.55; };
const isDone = (id, i) => data[id][i].s === 'done' && stageVis(id, i);
const bodyCleared = (id) => isDone(id, 0) && isDone(id, 1);
const bodyLocked = (id) => data[id][0].s === 'locked' && data[id][1].s === 'locked';
function bodyBest(id) { let b = -1; for (let i = 0; i < 2; i++) if (isDone(id, i)) b = Math.max(b, GRADES.indexOf(data[id][i].g)); return b < 0 ? null : GRADES[b]; }
function sysProgress(sys) { let d = 0, n = 0, st = 0, mx = 0; for (const id of SYS[sys].bodies) for (let i = 0; i < 2; i++) { n++; mx += 3; if (isDone(id, i)) { d++; st += data[id][i].n; } } return { d, n, st, mx, full: d === n }; }
function sysLocked(sys) { return SYS[sys].bodies.every(bodyLocked); }
function totals() { let st = 0, mx = 0, cl = 0, bn = 0; for (const id of Object.keys(LB)) { bn++; if (bodyCleared(id)) cl++; for (let i = 0; i < 2; i++) { mx += 3; if (isDone(id, i)) st += data[id][i].n; } } return { st, mx, cl, bn }; }
const sysOf = (id) => (SYS[id] ? id : (LB[id] ? LB[id].sys : null));
function plantProg(id) { const t = plantT[id]; return t === undefined ? 1 : clamp((NOW - t) / 0.9); }

// ------------------------------------------------------------------ 位置
const introK = (i) => ({ orbit: clamp((introT - 0.05 * i) / 0.6), planet: clamp((introT - 0.35 - 0.09 * i) / 0.55) });
function updateOv() {
  SYS_ORDER.forEach((id, i) => {
    const p = PL[id], k = introK(i), e = ease(k.planet), a = p.ph + p.w * T * S.amb - (1 - e) * 1.4;
    ovP[id] = { x: OV.cx + Math.cos(a) * p.r, y: OV.cy + Math.sin(a) * p.r, s: S.size * outCubic(k.planet), a };
  });
}
function ovMoon(id) { const m = MOONS[id], h = ovP[m.sys], a = m.ph + m.ovW * T * S.amb; const rr = m.ovR * (0.8 + 0.2 * S.size); return { x: h.x + Math.cos(a) * rr, y: h.y + Math.sin(a) * rr * 0.8 }; }
function ovPos(id) { if (ovP[id]) return ovP[id]; if (id === 'terra') return ovP.earth; if (MOONS[id]) return ovMoon(id); return ovP.earth; }
function zmMoon(id) { const m = MOONS[id], a = m.ph + m.zW * T * S.amb; return { x: ZH.x + Math.cos(a) * m.zx, y: ZH.y + Math.sin(a) * m.zy, depth: Math.sin(a), r: m.zr * (1 + 0.1 * Math.sin(a)) * (S.size > 1 ? 1.1 : 1) }; }
function zmPos(id, sys) {
  if (sysOf(id) !== sys) return null;
  if (MOONS[id]) { const m = zmMoon(id); return { x: m.x, y: m.y, r: m.r }; }
  return { x: ZH.x, y: ZH.y, r: SYS[sys].hubR * (S.size > 1 ? 1.06 : 1) };
}
function dockPos(world, id) {
  if (world === 'ov') { const p = ovPos(id); const s = S.size > 1 ? 1.1 : 1; return { x: clamp(p.x + 11 * s, 14, W - 14), y: p.y - 14 * s }; }
  const p = zmPos(id, camSys); if (!p) return null;
  const hub = !MOONS[id];
  return { x: clamp(p.x + (hub ? p.r * 1.0 + 14 : p.r + 16), 20, W - 20), y: p.y - (hub ? p.r * 0.62 : p.r + 6) };
}

// ------------------------------------------------------------------ 背景（星・彗星）
const STARS = Array.from({ length: 150 }, () => ({ x: rnd() * W, y: rnd() * H, d: 0.2 + rnd() * 0.8, s: 0.4 + rnd() * 0.9, ph: rnd() * 6 }));
function drawBg(c) {
  const p = P();
  c.fillStyle = p.bg; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(OV.cx, OV.cy, 0, OV.cx, OV.cy, 260);
  const tint = S.id === 'C' ? '120,90,200' : (S.id === 'B' ? '40,120,120' : '70,80,120');
  g.addColorStop(0, `rgba(${tint},${S.id === 'C' ? 0.2 : 0.1})`); g.addColorStop(1, `rgba(${tint},0)`);
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  const z = ease(zProg), px = (pointer.x - 0.5), py = (pointer.y - 0.5);
  for (const s of STARS) {
    const x = (((s.x + T * 1.2 * s.d - px * 14 * s.d - z * 30 * s.d) % W) + W) % W, y = (((s.y - py * 10 * s.d + z * 18 * s.d) % H) + H) % H;
    const tw = reduce ? 1 : 0.7 + 0.3 * Math.sin(T * (1 + s.d) + s.ph);
    c.globalAlpha = (0.18 + 0.4 * s.d) * tw * (S.id === 'C' ? 1.15 : 1);
    c.fillStyle = S.id === 'C' ? (s.ph > 3 ? '#ffd6e8' : '#cfe8ff') : '#d8dff0';
    const r = s.s * (S.id === 'C' ? 1.25 : 0.9);
    c.fillRect(x, y, r, r);
  }
  c.globalAlpha = 1;
  if (comet) {
    const a = comet; const k = a.t / a.life, x = a.x + a.vx * a.t, y = a.y + a.vy * a.t, al = Math.sin(clamp(k) * Math.PI);
    const L = 54, nx = a.vx / Math.hypot(a.vx, a.vy), ny = a.vy / Math.hypot(a.vx, a.vy);
    const gr = c.createLinearGradient(x, y, x - nx * L, y - ny * L);
    gr.addColorStop(0, `rgba(236,240,255,${0.8 * al})`); gr.addColorStop(1, 'rgba(236,240,255,0)');
    c.strokeStyle = gr; c.lineWidth = S.id === 'C' ? 2.2 : 1; c.lineCap = 'round'; c.beginPath(); c.moveTo(x, y); c.lineTo(x - nx * L, y - ny * L); c.stroke();
    c.fillStyle = `rgba(255,255,255,${al})`; c.beginPath(); c.arc(x, y, S.id === 'C' ? 1.8 : 1.1, 0, TAU); c.fill();
    if (S.id === 'C') sparkle(c, x, y, 4, al * 0.8, '#fff');
  }
  if (S.id === 'C' && !reduce) {
    for (let i = 0; i < 7; i++) { const x = (i * 53 + 20) % W, y = (i * 97 + 90) % 520, a = Math.max(0, Math.sin(T * 0.9 + i * 1.7)); sparkle(c, x, y, 2.4 + a * 1.6, a * 0.7, i % 2 ? '#ffd6e8' : '#bfe6ff'); }
  }
}

// ------------------------------------------------------------------ 天体スプライト
function halo(c, id, x, y, r) {
  let col = null, k = 1.3, a = 0.3;
  if (id === 'titan') { col = '224,160,62'; k = 1.42; a = 0.42; } else if (id === 'venus') { col = '255,200,120'; a = 0.28; } else if (id === 'mars') { col = '230,140,90'; k = 1.22; a = 0.2; } else if (id === 'earth' || id === 'terra') { col = '120,180,255'; k = 1.22; a = 0.22; }
  if (S.planet === 'toy' && !col) { col = '255,240,220'; a = 0.12; k = 1.45; }
  if (S.planet === 'toy' && col) { a *= 1.4; k += 0.1; }
  if (!col) return;
  const g = c.createRadialGradient(x, y, r * 0.9, x, y, r * k);
  g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`);
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r * k, 0, TAU); c.fill();
}
function pers(c, id, r, t) {            // clip 内（中心=原点）の表面モチーフ
  const lw = r * 0.09;
  c.lineCap = 'round';
  switch (id) {
    case 'venus': for (let k = 0; k < 4; k++) { const a = t * 0.25 + k * 1.7; c.strokeStyle = 'rgba(255,244,220,0.2)'; c.lineWidth = lw; c.beginPath(); c.arc(Math.cos(a) * r * 0.18, Math.sin(a) * r * 0.18, r * (0.25 + 0.21 * k), a, a + 2.3); c.stroke(); } break;
    case 'mars': {
      c.fillStyle = 'rgba(255,240,230,0.5)'; c.beginPath(); c.ellipse(0, -r * 0.95, r * 0.45, r * 0.18, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(80,25,15,0.35)'; c.beginPath(); c.ellipse(-r * 0.25, r * 0.1, r * 0.35, r * 0.16, 0.3, 0, TAU); c.fill();
      const u = (t * 0.07) % 1, dx = -r * 0.8 + u * r * 1.6, base = r * 0.42;
      c.fillStyle = 'rgba(60,20,10,0.3)'; c.beginPath(); c.ellipse(dx, base + 1, r * 0.1, r * 0.04, 0, 0, TAU); c.fill();
      for (let i = 0; i < 7; i++) { const f = i / 6, w = r * 0.04 + f * r * 0.1; c.fillStyle = `rgba(255,214,170,${0.7 * (1 - f * 0.6)})`; c.beginPath(); c.ellipse(dx + Math.sin(t * 5 + f * 4) * r * 0.025 + f * r * 0.06, base - f * r * 0.42, w, w * 0.5, 0, 0, TAU); c.fill(); }
      break;
    }
    case 'mercury': {
      c.strokeStyle = 'rgba(40,36,32,0.3)'; c.lineWidth = Math.max(0.6, r * 0.035);
      [[-0.35, -0.25, 0.22], [0.3, 0.2, 0.28], [0.05, -0.55, 0.14], [-0.2, 0.5, 0.16]].forEach(([a, b, d]) => { c.beginPath(); c.arc(a * r, b * r, d * r, 0, TAU); c.stroke(); });
      const g = c.createLinearGradient(-r, -r, r, r); g.addColorStop(0, 'rgba(255,170,70,0.28)'); g.addColorStop(0.6, 'rgba(255,170,70,0)'); c.fillStyle = g; c.fillRect(-r, -r, 2 * r, 2 * r);
      break;
    }
    case 'earth': case 'terra': {
      const off = ((t * 0.035) % 1) * 2 * r;
      for (let rep = -1; rep <= 1; rep++) {
        const ox = off + rep * 2 * r - r;
        c.fillStyle = 'rgba(111,166,90,0.9)';
        c.beginPath(); c.ellipse(ox - r * 0.25, -r * 0.1, r * 0.4, r * 0.28, 0.4, 0, TAU); c.fill();
        c.beginPath(); c.ellipse(ox + r * 0.45, r * 0.3, r * 0.3, r * 0.2, -0.3, 0, TAU); c.fill();
      }
      const off2 = ((t * 0.06) % 1) * 2 * r;
      c.fillStyle = 'rgba(255,255,255,0.55)';
      for (let rep = -1; rep <= 1; rep++) { const ox = off2 + rep * 2 * r - r; c.beginPath(); c.ellipse(ox, -r * 0.45, r * 0.5, r * 0.07, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(ox - r * 0.3, r * 0.5, r * 0.4, r * 0.06, 0, 0, TAU); c.fill(); }
      c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(0, -r * 0.98, r * 0.5, r * 0.15, 0, 0, TAU); c.fill();
      break;
    }
    case 'jupiter': {
      const cols = ['rgba(150,100,60,0.4)', 'rgba(255,240,215,0.28)'];
      for (let k = 0; k < 7; k++) { const y = -r + (k + 0.5) * 2 * r / 7; c.strokeStyle = cols[k % 2]; c.lineWidth = r * 0.17; c.beginPath(); for (let x = -r; x <= r; x += r / 6) c[x === -r ? 'moveTo' : 'lineTo'](x, y + Math.sin(x * 0.1 + t * 0.4 + k) * r * 0.025); c.stroke(); }
      c.fillStyle = 'rgba(176,80,52,0.85)'; c.beginPath(); c.ellipse(r * 0.3, r * 0.28, r * 0.17, r * 0.1, 0, 0, TAU); c.fill();
      break;
    }
    case 'saturn': for (let k = 0; k < 5; k++) { const y = -r + (k + 0.5) * 2 * r / 5; c.strokeStyle = k % 2 ? 'rgba(255,245,220,0.2)' : 'rgba(150,115,60,0.25)'; c.lineWidth = r * 0.2; c.beginPath(); c.moveTo(-r, y); c.lineTo(r, y); c.stroke(); } break;
    case 'moon':
      [[-0.3, -0.2, 0.22], [0.35, 0.15, 0.17], [0, 0.5, 0.12], [0.1, -0.55, 0.1]].forEach(([a, b, d]) => { c.fillStyle = 'rgba(60,64,78,0.28)'; c.beginPath(); c.arc(a * r, b * r, d * r, 0, TAU); c.fill(); c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 0.6; c.beginPath(); c.arc(a * r, b * r, d * r, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); });
      break;
    case 'io':
      [[-0.3, 0.1, 0.14, '120,50,20'], [0.3, -0.25, 0.1, '150,60,20'], [0.1, 0.45, 0.12, '110,70,20'], [-0.05, -0.4, 0.08, '120,50,20']].forEach(([a, b, d, col], i) => { c.fillStyle = `rgba(${col},0.5)`; c.beginPath(); c.arc(a * r, b * r, d * r, 0, TAU); c.fill(); if (i < 2) { c.fillStyle = `rgba(255,120,40,${0.55 + 0.3 * Math.sin(t * 3 + i)})`; c.beginPath(); c.arc(a * r, b * r, d * r * 0.4, 0, TAU); c.fill(); } });
      break;
    case 'europa':
      c.strokeStyle = 'rgba(70,95,120,0.45)'; c.lineWidth = Math.max(0.5, r * 0.04);
      [[-1, -0.3, -0.2, -0.1, 0.5, 0.2, 1, 0.4], [-0.6, -0.9, -0.2, -0.3, 0.1, 0.1, 0.5, 0.8], [-0.9, 0.4, -0.3, 0.3, 0.3, 0.5, 0.9, 0.2]].forEach((p) => { c.beginPath(); c.moveTo(p[0] * r, p[1] * r); c.lineTo(p[2] * r, p[3] * r); c.lineTo(p[4] * r, p[5] * r); c.lineTo(p[6] * r, p[7] * r); c.stroke(); });
      c.strokeStyle = 'rgba(160,100,70,0.28)'; c.beginPath(); c.moveTo(-r * 0.7, r * 0.7); c.lineTo(r * 0.1, r * 0.2); c.lineTo(r * 0.6, -r * 0.2); c.stroke();
      break;
    case 'titan': for (let k = 0; k < 3; k++) { const a = t * 0.35 * (k % 2 ? -1 : 1) + k * 2.1; c.strokeStyle = `rgba(255,214,140,${0.26 - k * 0.04})`; c.lineWidth = r * 0.12; c.beginPath(); c.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * (0.3 + 0.24 * k), a, a + 2.0); c.stroke(); } break;
    default: break;
  }
}
function outerFx(c, id, x, y, r, t) {    // clip 外の演出（りんかく外へはみ出す）
  c.save(); c.translate(x, y);
  if (id === 'mercury') {                // 熱ゆらぎ
    for (let i = 0; i < 3; i++) { c.strokeStyle = `rgba(255,190,100,${0.28 - i * 0.07})`; c.lineWidth = Math.max(0.7, r * 0.03); c.beginPath(); for (let k = -r * 0.7; k <= r * 0.7; k += 2) { const yy = -r * 1.08 - i * r * 0.1 + Math.sin(k * 0.3 + t * 3 + i * 1.3) * r * 0.025; c[k === -r * 0.7 ? 'moveTo' : 'lineTo'](k, yy); } c.stroke(); }
  } else if (id === 'io') {              // 火山の噴煙
    const u = (t / 3.4) % 1, a = -1.0, bx = Math.cos(a) * r, by = Math.sin(a) * r, dx = Math.cos(a), dy = Math.sin(a);
    if (u < 0.85) { const h = outCubic(u / 0.85) * r * 0.9, al = 1 - u / 0.85; for (let i = 0; i < 6; i++) { const f = i / 5, hh = h * f; const sp = Math.sin(f * 3 + t * 2) * r * 0.04; const rr_ = r * (0.06 + 0.08 * f) * (0.5 + u); c.fillStyle = `rgba(${i < 3 ? '255,214,110' : '255,150,60'},${0.7 * al * (1 - f * 0.4)})`; c.beginPath(); c.arc(bx + dx * hh - dy * sp, by + dy * hh + dx * sp, rr_, 0, TAU); c.fill(); } }
  } else if (id === 'europa') {          // 氷のきらめき
    const u = (t / 4.2) % 1;
    if (u < 0.4) { const p = u / 0.4; sparkle(c, -r * 0.45 + p * r * 0.9, r * 0.35 - p * r * 0.75, Math.sin(p * Math.PI) * r * 0.3, 0.95, '#ffffff'); }
  }
  c.restore();
}
function drawBody(c, id, x, y, r, t, o) {
  o = o || {};
  const col = BCOL[id] || '#999', mode = S.planet, al = o.alpha === undefined ? 1 : o.alpha;
  c.save(); c.globalAlpha *= al;
  if (o.halo !== false && r >= 5) halo(c, id, x, y, r);
  if (id === 'saturn') drawRings(c, x, y, r, t, 'back');
  c.save(); c.beginPath(); c.arc(x, y, r, 0, TAU); c.clip();
  if (mode === 'wire') { c.fillStyle = mixHex(col, '#06080E', 0.74); c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  else if (mode === 'toy') { const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.05); g.addColorStop(0, mixHex(col, '#ffffff', 0.45)); g.addColorStop(0.6, col); g.addColorStop(1, mixHex(col, '#2a1a4a', 0.35)); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  else { c.fillStyle = col; c.fillRect(x - r, y - r, 2 * r, 2 * r); }
  if (o.pers !== false && r >= 8) { c.save(); c.translate(x, y); if (mode === 'wire') c.globalAlpha *= 0.7; pers(c, id, r, t); c.restore(); }
  c.fillStyle = mode === 'toy' ? 'rgba(40,20,80,0.28)' : 'rgba(6,8,14,0.5)';
  c.beginPath(); c.rect(x - r - 2, y - r - 2, 2 * r + 4, 2 * r + 4); c.arc(x - r * 0.38, y - r * 0.34, r * 1.05, 0, TAU, true); c.fill('evenodd');
  if (mode === 'wire' && r >= 5) {
    c.strokeStyle = rgba(P().mid, 0.22); c.lineWidth = 0.6;
    c.beginPath(); c.ellipse(x, y, r * 0.42, r, 0, 0, TAU); c.stroke(); c.beginPath(); c.ellipse(x, y, r, r * 0.3, 0, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.stroke();
  }
  if (mode === 'toy' && r >= 5) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(x - r * 0.42, y - r * 0.5, r * 0.22, r * 0.12, -0.7, 0, TAU); c.fill(); }
  c.restore();
  if (mode !== 'toy') { c.lineWidth = mode === 'wire' ? 0.9 : 0.6; c.strokeStyle = mode === 'wire' ? rgba(mixHex(col, P().mid, 0.4), 0.9) : 'rgba(236,230,216,0.28)'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  if (id === 'saturn') drawRings(c, x, y, r, t, 'front');
  if (o.pers !== false && r >= 8) outerFx(c, id, x, y, r, t);
  if (faces && r >= 9 && o.pers !== false) {
    c.fillStyle = 'rgba(20,18,30,0.85)'; c.beginPath(); c.arc(x - r * 0.26, y - r * 0.02, r * 0.075, 0, TAU); c.arc(x + r * 0.26, y - r * 0.02, r * 0.075, 0, TAU); c.fill();
    c.strokeStyle = 'rgba(20,18,30,0.85)'; c.lineWidth = Math.max(0.8, r * 0.04); c.beginPath(); c.arc(x, y + r * 0.06, r * 0.2, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke();
    if (mode === 'toy') { c.fillStyle = 'rgba(255,130,150,0.45)'; c.beginPath(); c.arc(x - r * 0.46, y + r * 0.16, r * 0.1, 0, TAU); c.arc(x + r * 0.46, y + r * 0.16, r * 0.1, 0, TAU); c.fill(); }
  }
  c.restore();
}
function drawRings(c, x, y, r, t, half) {
  const tilt = -0.32 + (reduce ? 0 : Math.sin(t * 0.22) * 0.1) * S.amb, ry = 0.3;
  c.save(); c.translate(x, y); c.rotate(tilt);
  const a0 = half === 'back' ? Math.PI : 0, a1 = half === 'back' ? TAU : Math.PI;
  const bands = [[1.55, 0.2, 0.55], [1.78, 0.28, 0.75], [2.02, 0.18, 0.4]];
  const toy = S.planet === 'toy', wire = S.planet === 'wire';
  bands.forEach(([k, w, al], i) => {
    c.strokeStyle = wire ? rgba(i === 1 ? P().warn : P().mid, 0.55 * al + 0.2) : (toy ? (i === 1 ? 'rgba(255,214,232,' : 'rgba(190,224,255,') + (0.8 * al + 0.1) + ')' : `rgba(226,208,160,${al * 0.8})`);
    c.lineWidth = Math.max(0.8, r * w * 0.5) * (wire ? 0.4 : 1); c.beginPath(); c.ellipse(0, 0, r * k, r * k * ry, 0, a0, a1); c.stroke();
  });
  c.restore();
}

// ------------------------------------------------------------------ 船・宇宙飛行士
function mascotPose() {
  const dt = NOW - mascot.t0, calm = S.mascot === 'calm', cheery = S.mascot === 'cheery';
  let dy = 0, rot = 0, mode;
  if (dt >= 0 && dt < 1.7) {
    const kind = mascot.mode;
    if (kind === 'jump') { const u = clamp(dt / 0.75); dy = Math.sin(u * Math.PI) * 15; if (u >= 1) mode = 'wave'; }
    else if (kind === 'spin') { const u = clamp(dt / 0.9); dy = Math.sin(u * Math.PI) * 11; rot = reduce ? 0 : ease(u) * TAU; }
    else mode = 'wave';
    return { dy, rot, mode };
  }
  if (reduce || S.mascot === 'still') return { dy: 0, rot: 0, mode: undefined };
  const ph = NOW % (calm ? 9 : cheery ? 3.4 : 12);
  if (cheery) { if (ph < 2.2) mode = 'wave'; const hop = NOW % 5; if (hop < 0.5) dy = Math.sin(hop / 0.5 * Math.PI) * 5; return { dy, rot: 0, mode }; }
  if (ph < 1.3) mode = 'wave';
  return { dy: 0, rot: 0, mode };
}
function drawShipFull(c, x, y, k, ang, flying) {
  let bob = 0, wob = 0;
  if (!flying && !reduce) { bob = Math.sin(NOW * 1.6) * (S.id === 'C' ? 1.9 : S.id === 'A' ? 0.8 : 0.3) * k; wob = S.id === 'C' ? Math.sin(NOW * 1.3) * 5 : 0; }
  c.save(); c.translate(x, y + bob); c.scale(k, k);
  drawShip(c, 0, 0, ang + wob, flying, false, false, T);
  if (!flying) {
    const m = mascotPose();
    c.save(); c.translate(-3, -12 - m.dy); if (m.rot) { c.translate(0, -7); c.rotate(m.rot); c.translate(0, 7); }
    drawAstronaut(c, 0, 0, m.mode, NOW);
    c.restore();
  }
  c.restore();
  return { x, y: y + bob };
}
function spawnPuff(world, x, y, vx, vy, big) {
  parts.push({ w: world, x, y, vx, vy, t: 0, life: 0.5 + Math.random() * 0.3, r: big ? 2.4 : 1.6 });
}
function drawParts(c, world) {
  for (const p of parts) {
    if (p.w !== world) continue;
    const k = p.t / p.life, a = 1 - k;
    c.fillStyle = k < 0.35 ? `rgba(255,236,190,${a})` : (S.id === 'C' ? `rgba(255,190,220,${a * 0.8})` : `rgba(255,181,71,${a * 0.7})`);
    c.beginPath(); c.arc(p.x, p.y, p.r * (1 + k * 0.8), 0, TAU); c.fill();
  }
}
function flightPoint(fl, world, tt) {
  const to = dockPos(world, fl.toId) || fl.from, a = fl.from;
  const mx = (a.x + to.x) / 2, my = (a.y + to.y) / 2, dx = to.x - a.x, dy = to.y - a.y, L = Math.hypot(dx, dy) || 1;
  const bulge = Math.min(46, L * 0.28) * (fl.sign || 1);
  const cx = mx + (-dy / L) * bulge, cy = my + (dx / L) * bulge;
  const u = 1 - tt;
  return { x: u * u * a.x + 2 * u * tt * cx + tt * tt * to.x, y: u * u * a.y + 2 * u * tt * cy + tt * tt * to.y, to };
}
function drawFlightArc(c, world) {
  const fl = ship.fl; if (!fl || fl.world !== world) return;
  const e = ease(clamp(fl.t)), end = flightPoint(fl, world, e).to;
  c.save();
  c.strokeStyle = S.id === 'B' ? rgba(P().warn, 0.8) : (S.id === 'C' ? 'rgba(255,200,230,0.9)' : rgba(P().mid, 0.75));
  c.lineWidth = S.id === 'C' ? 1.8 : 1; c.lineCap = 'round';
  c.setLineDash(S.id === 'C' ? [0.1, 5] : [2, 4]); c.lineDashOffset = -NOW * 14;
  c.beginPath();
  const N = 24;
  for (let i = 0; i <= N; i++) { const q = flightPoint(fl, world, e + (1 - e) * i / N); c[i ? 'lineTo' : 'moveTo'](q.x, q.y); }
  c.stroke(); c.setLineDash([]);
  const rr = 4 + 1.5 * Math.sin(NOW * 6);
  c.strokeStyle = S.id === 'B' ? rgba(P().warn, 0.9) : rgba(P().fg, 0.6); c.lineWidth = 0.8;
  if (S.id === 'B') { c.beginPath(); c.moveTo(end.x - rr - 2, end.y); c.lineTo(end.x - 2, end.y); c.moveTo(end.x + 2, end.y); c.lineTo(end.x + rr + 2, end.y); c.moveTo(end.x, end.y - rr - 2); c.lineTo(end.x, end.y - 2); c.moveTo(end.x, end.y + 2); c.lineTo(end.x, end.y + rr + 2); c.stroke(); }
  else { c.beginPath(); c.arc(end.x, end.y, rr, 0, TAU); c.stroke(); }
  c.restore();
}
function drawShipIn(c, world) {
  const k = world === 'ov' ? 0.52 : 0.92;
  if (ship.fl && ship.fl.world === world) {
    drawFlightArc(c, world);
    const fl = ship.fl, e = ease(clamp(fl.t));
    const a = flightPoint(fl, world, e), b = flightPoint(fl, world, Math.min(1, e + 0.02));
    let ang = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI + 90;
    if (e >= 0.99) ang = 0;
    drawShipFull(c, a.x, a.y, k, ang, true);
    shipScr = null;
    return;
  }
  if (world === 'zm' && sysOf(ship.at) !== camSys) { shipScr = null; return; }
  const d = dockPos(world, ship.at); if (!d) return;
  const r = drawShipFull(c, d.x, d.y, k, 0, false);
  shipScr = { world, x: r.x, y: r.y, k };
}

// ------------------------------------------------------------------ 俯瞰
function ovIntroAlpha() { return clamp((introT - 0.9) / 0.6); }
function selSys() { return selected ? sysOf(selected) : null; }
function drawOverviewWorld(c) {
  const p = P(), cx = OV.cx, cy = OV.cy, st = S;
  SYS_ORDER.forEach((id, i) => {
    const o = PL[id], pr = ease(introK(i).orbit); if (pr <= 0) return;
    const hl = hover && hover.sys === id;
    c.save();
    c.strokeStyle = st.id === 'B' ? rgba(p.mid, hl ? 0.6 : st.orbitA) : (st.id === 'C' ? `rgba(200,190,255,${hl ? 0.6 : st.orbitA})` : rgba(p.fg, hl ? 0.4 : st.orbitA));
    c.lineWidth = st.orbitW; c.lineCap = 'round';
    if (st.dotted) c.setLineDash([0.1, 5.5]); else if (st.id === 'B' && i % 2) c.setLineDash([1, 3]);
    c.beginPath(); c.arc(cx, cy, o.r, -Math.PI / 2, -Math.PI / 2 + TAU * pr); c.stroke(); c.restore();
  });
  const uiA = ovIntroAlpha();
  if (st.ticks) {     // B: 外周の目盛りとスイープ
    c.save(); c.translate(cx, cy);
    const R = 176, ia = clamp(introT / 1.0);
    c.strokeStyle = rgba(p.mid, 0.4 * ia); c.lineWidth = 0.6;
    for (let a = 0; a < 72; a++) { const th = a / 72 * TAU, L = a % 6 === 0 ? 7 : 3.5; c.beginPath(); c.moveTo(Math.cos(th) * R, Math.sin(th) * R); c.lineTo(Math.cos(th) * (R + L), Math.sin(th) * (R + L)); c.stroke(); }
    c.strokeStyle = rgba(p.mid, 0.14 * ia); c.beginPath(); c.moveTo(-R, 0); c.lineTo(R, 0); c.moveTo(0, -R); c.lineTo(0, R); c.stroke();
    const sw = reduce ? 0.8 : T * 0.5;
    for (let i = 0; i < 14; i++) { const th = sw - i * 0.035; c.strokeStyle = rgba(p.mid, (0.2 - i * 0.014) * ia); c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(th) * R, Math.sin(th) * R); c.stroke(); }
    c.restore();
  }
  // 太陽（呼吸するグロー）
  const br = reduce ? 1 : 1 + 0.07 * Math.sin(T * 1.4) * st.amb, sr = (st.id === 'C' ? 11 : 8.5) * clamp(introT / 0.5);
  const gk = st.id === 'C' ? 1.2 : 1;
  const gl = c.createRadialGradient(cx, cy, 0, cx, cy, 34 * br * gk);
  const sc = st.id === 'B' ? '255,181,71' : (st.id === 'C' ? '255,200,120' : '255,226,170');
  gl.addColorStop(0, `rgba(${sc},${0.55 * st.sun + 0.15})`); gl.addColorStop(0.35, `rgba(${sc},${0.16 * st.sun})`); gl.addColorStop(1, `rgba(${sc},0)`);
  c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, 36 * br * gk, 0, TAU); c.fill();
  if (st.id === 'B') { c.strokeStyle = rgba(p.warn, 0.9); c.lineWidth = 0.9; c.beginPath(); c.arc(cx, cy, sr, 0, TAU); c.stroke(); c.fillStyle = rgba(p.warn, 0.35); c.fill(); c.beginPath(); c.moveTo(cx - sr - 4, cy); c.lineTo(cx + sr + 4, cy); c.moveTo(cx, cy - sr - 4); c.lineTo(cx, cy + sr + 4); c.stroke(); }
  else { c.fillStyle = st.id === 'C' ? '#ffe9b0' : '#fff2d6'; c.beginPath(); c.arc(cx, cy, sr, 0, TAU); c.fill(); if (st.id === 'C') { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(cx - 3, cy - 4, 3, 1.8, -0.6, 0, TAU); c.fill(); } }
  if (faces && st.id !== 'B') { c.fillStyle = 'rgba(80,50,20,.8)'; c.beginPath(); c.arc(cx - 3, cy - 1, 1, 0, TAU); c.arc(cx + 3, cy - 1, 1, 0, TAU); c.fill(); c.strokeStyle = 'rgba(80,50,20,.8)'; c.lineWidth = 0.9; c.beginPath(); c.arc(cx, cy + 1, 3, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); }
  // 惑星
  SYS_ORDER.forEach((id) => {
    const o = PL[id], q = ovP[id]; if (q.s <= 0.01) return;
    const hl = hover && hover.sys === id, sel = selSys() === id;
    let bounce = 1;
    if (st.id === 'C' && hl && !reduce) bounce = 1 + 0.12 * Math.sin(NOW * 9);
    const r = o.sz * q.s * bounce, locked = sysLocked(id), pg = sysProgress(id);
    c.save(); c.globalAlpha *= locked ? 0.55 : 1;
    if (id === 'earth') {   // TERRA ボーナスの印
      const bx = q.x - 10 * q.s * st.size, by = q.y - 10 * q.s * st.size, d = 2.6 + (reduce ? 0 : 0.5 * Math.sin(T * 3));
      c.strokeStyle = rgba(p.warn, 0.9 * uiA); c.lineWidth = 0.9; c.beginPath(); c.moveTo(bx, by - d); c.lineTo(bx + d, by); c.lineTo(bx, by + d); c.lineTo(bx - d, by); c.closePath(); c.stroke();
      if (bodyCleared('terra')) { c.fillStyle = rgba(p.warn, 0.8); c.fill(); }
    }
    drawBody(c, id, q.x, q.y, r, T, { pers: r >= 9 ? undefined : false, halo: r >= 5 });
    c.restore();
    for (const mid of Object.keys(MOONS)) {
      if (MOONS[mid].sys !== id) continue;
      const m = ovMoon(mid), mr = (st.id === 'C' ? 2.3 : 1.6) * q.s, cl = bodyCleared(mid), lk = bodyLocked(mid);
      c.strokeStyle = rgba(p.fg, 0.1); c.lineWidth = 0.5; c.beginPath(); c.arc(q.x, q.y, MOONS[mid].ovR * (0.8 + 0.2 * st.size), 0, TAU); c.stroke();
      c.fillStyle = lk ? rgba(p.dim, 0.9) : BCOL[mid]; c.beginPath(); c.arc(m.x, m.y, mr, 0, TAU); c.fill();
      if (cl) { c.strokeStyle = rgba(p.warn, 0.9 * uiA); c.lineWidth = 0.8; c.beginPath(); c.arc(m.x, m.y, mr + 2.3, 0, TAU); c.stroke(); }
    }
    if (uiA > 0 && !locked) {   // 進捗リング／制覇リング
      const rr = r + (id === 'saturn' ? 10 : 5) * (st.id === 'C' ? 1.1 : 1);
      if (pg.full) {
        const rp = plantProg(SYS[id].bodies.find((b) => plantT[b] !== undefined) || SYS[id].bodies[0]);
        c.strokeStyle = rgba(p.warn, 0.9 * uiA); c.lineWidth = st.id === 'C' ? 1.6 : 0.9; c.lineCap = 'round';
        c.beginPath(); c.arc(q.x, q.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.01, rp)); c.stroke();
        if (rp > 0.99 && !reduce && st.id === 'C') sparkle(c, q.x + rr * 0.7, q.y - rr * 0.7, 3 + Math.sin(T * 4) * 1.2, 0.9, '#fff');
      } else if (pg.d > 0) {
        c.strokeStyle = rgba(p.mid, 0.65 * uiA); c.lineWidth = st.id === 'C' ? 1.6 : 0.9; c.lineCap = 'round';
        c.beginPath(); c.arc(q.x, q.y, rr, -Math.PI / 2, -Math.PI / 2 + TAU * pg.d / pg.n); c.stroke();
      }
    }
    const hubB = SYS[id].bodies.find((b) => LB[b].hub);   // 旗（惑星そのものに着陸して制覇）
    if (hubB && bodyCleared(hubB) && uiA > 0) { c.save(); c.translate(q.x + r * 0.55, q.y - r * 0.78); c.scale(0.5, 0.5); drawFlag(c, 0, 0, plantProg(hubB), reduce ? 0 : Math.sin(T * 3)); c.restore(); }
    if (uiA > 0) {
      c.save(); c.globalAlpha *= uiA * (hl || sel ? 1 : 0.9);
      const ly = q.y + r + (id === 'saturn' ? 14 : 10) + (st.id === 'C' ? 2 : 0);
      T_(c, SYS[id].name, clamp(q.x, 24, W - 24), clamp(ly, 20, 470), st.id === 'C' ? 9 : 8, hl || sel ? (st.id === 'B' ? p.warn : p.hi) : rgba(p.fg, st.labelA), 'center', st.id === 'C' ? 700 : 500, st.id === 'B' ? 1.2 : 0.8);
      c.restore();
    }
    if (st.id === 'B' && hl) {
      const b = r + 8, L = 4; c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 0.9;
      [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { c.beginPath(); c.moveTo(q.x + sx * b, q.y + sy * (b - L)); c.lineTo(q.x + sx * b, q.y + sy * b); c.lineTo(q.x + sx * (b - L), q.y + sy * b); c.stroke(); });
      T_(c, `${(o.r / 158 * 9.5).toFixed(2)} AU`, q.x + b + 3, q.y + 3, 7.5, rgba(p.warn, 0.9), 'left', 500, 0.8);
    }
  });
}
function chipRects() { const w = 54, g = 5, x0 = (W - 6 * w - 5 * g) / 2; return SYS_ORDER.map((id, i) => ({ x: x0 + i * (w + g), y: 500, w, h: 44, sys: id })); }
function drawOverviewUI(c, a) {
  const p = P(), tot = totals();
  c.save(); c.globalAlpha *= a;
  T_(c, 'SOLAR SYSTEM', 16, 28, 13, p.fg, 'left', S.id === 'C' ? 800 : 600, 3);
  T_(c, 'BETA v1.1', W - 16, 28, 9, p.warn, 'right', 700, 1.5);
  T_(c, S.id === 'B' ? 'SELECT DESTINATION' : 'Choose where to land', 16, 45, 9.5, p.dim, 'left', 500, S.id === 'B' ? 1.5 : 0.3);
  T_(c, `★ ${tot.st}/${tot.mx}   ${tot.cl}/${tot.bn} CLEARED`, W - 16, 45, 9.5, rgba(p.fg, 0.7), 'right', 500, 0.6);
  if (S.id === 'B') { const mm = Math.floor(T / 60) % 60, ss = Math.floor(T) % 60; T_(c, `T+ 00:${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`, 16, 58, 8, rgba(p.mid, 0.7), 'left', 500, 1); c.strokeStyle = rgba(p.mid, 0.3); c.lineWidth = 0.6; c.beginPath(); c.moveTo(16, 64); c.lineTo(W - 16, 64); c.stroke(); }
  chipRects().forEach((r, i) => {
    const id = SYS_ORDER[i], pg = sysProgress(id), lk = sysLocked(id), hl = hover && hover.kind === 'chip' && hover.sys === id;
    c.save();
    if (S.id === 'B') { c.strokeStyle = rgba(hl ? p.warn : p.mid, hl ? 0.9 : 0.35); c.lineWidth = 0.8; c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1); }
    else { rrect(c, r.x, r.y, r.w, r.h, S.id === 'C' ? 14 : 10); c.fillStyle = S.id === 'C' ? `rgba(255,255,255,${hl ? 0.14 : 0.07})` : (hl ? 'rgba(255,255,255,.07)' : 'rgba(255,255,255,.03)'); c.fill(); c.strokeStyle = rgba(p.fg, hl ? 0.35 : 0.12); c.lineWidth = 0.7; c.stroke(); }
    T_(c, SYS[id].ab, r.x + r.w / 2, r.y + 17, 10, lk ? p.dim : p.fg, 'center', S.id === 'C' ? 800 : 600, 1.2);
    if (lk) lockGlyph(c, r.x + r.w / 2, r.y + 32, 8, p.dim);
    else T_(c, `★${pg.st}/${pg.mx}`, r.x + r.w / 2, r.y + 34, 8.5, pg.full ? p.warn : rgba(p.fg, 0.7), 'center', 500, 0.3);
    c.restore();
  });
  T_(c, 'COMING SOON · v1.2', W / 2, 566, 8.5, rgba(p.dim, 1), 'center', 600, 2.2);
  SOON.forEach((nm, i) => { const x = 30 + i * 60, y = 593; drawSilhouette(c, nm, x, y); T_(c, nm, x, y + 22, 7, rgba(p.dim, 0.9), 'center', 500, 0.5); });
  c.restore();
}
function drawSilhouette(c, nm, x, y, s) {
  const k = s || 1, p = P(); c.save(); c.translate(x, y); c.scale(k, k);
  c.fillStyle = 'rgba(28,34,50,0.9)'; c.strokeStyle = rgba(p.dim, S.id === 'B' ? 0.9 : 0.6); c.lineWidth = 0.8;
  if (S.id === 'B') c.setLineDash([2, 2]);
  c.beginPath();
  if (nm === 'PHOBOS') c.ellipse(0, 0, 11, 8, -0.3, 0, TAU);
  else if (nm === 'RYUGU') { c.moveTo(0, -11); c.lineTo(9, -3); c.lineTo(10, 3); c.lineTo(0, 11); c.lineTo(-10, 3); c.lineTo(-9, -3); c.closePath(); }
  else if (nm === '67P') { c.ellipse(-4.5, 1, 6, 5, 0.2, 0, TAU); c.moveTo(11, -2); c.ellipse(6, -3, 5, 4.5, 0, 0, TAU); }
  else if (nm === 'ENCELADUS') c.arc(0, 0, 9, 0, TAU);
  else if (nm === 'TRITON') c.arc(0, 0, 9.5, 0, TAU);
  else c.arc(0, 0, 8.5, 0, TAU);
  c.fill(); c.stroke(); c.setLineDash([]);
  if (nm === 'ENCELADUS') { c.fillStyle = rgba(p.dim, 0.8); for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-3 + i * 3, 14 + (i % 2) * 2, 0.9, 0, TAU); c.fill(); } }
  if (nm === 'PLUTO') { c.strokeStyle = rgba(p.dim, 0.5); c.beginPath(); c.arc(-2, 1, 4, 0.3, 4.4); c.stroke(); }
  if (nm === 'TRITON') { c.strokeStyle = rgba(p.dim, 0.5); c.beginPath(); c.moveTo(-7, 3); c.quadraticCurveTo(0, 6, 7, 2); c.stroke(); }
  c.restore();
}

// ------------------------------------------------------------------ ズーム
function drawZoomWorld(c, a) {
  const p = P(), sys = camSys, hr = SYS[sys].hubR * (S.size > 1 ? 1.06 : 1);
  c.save(); c.globalAlpha *= a;
  for (const mid of SYS[sys].bodies) {
    const m = MOONS[mid]; if (!m) continue;
    c.save(); c.strokeStyle = S.id === 'B' ? rgba(p.mid, 0.3) : (S.id === 'C' ? 'rgba(200,190,255,0.32)' : rgba(p.fg, 0.16)); c.lineWidth = S.orbitW; c.lineCap = 'round';
    if (S.dotted) c.setLineDash([0.1, 5.5]); else if (S.id === 'B') c.setLineDash([1, 3]);
    c.beginPath(); c.ellipse(ZH.x, ZH.y, m.zx, m.zy, 0, 0, TAU); c.stroke(); c.restore();
  }
  const moons = SYS[sys].bodies.filter((b) => MOONS[b]).map((id) => ({ id, ...zmMoon(id) }));
  const drawMoon = (m) => {
    const hl = hover && (hover.id === m.id), sc = selected === m.id;
    let r = m.r; if (S.id === 'C' && (hl || sc) && !reduce) r *= 1 + 0.1 * Math.sin(NOW * 9);
    c.save(); c.globalAlpha *= bodyLocked(m.id) ? 0.55 : 1;
    drawBody(c, m.id, m.x, m.y, r, T, { halo: true }); c.restore();
    bodyDeco(c, m.id, m.x, m.y, r, hl);
  };
  moons.filter((m) => m.depth < 0).forEach(drawMoon);
  const hubLb = SYS[sys].bodies.find((b) => LB[b].hub);
  let hrr = hr; const hhl = hover && hubLb && hover.id === hubLb;
  if (S.id === 'C' && hhl && !reduce) hrr *= 1 + 0.05 * Math.sin(NOW * 9);
  c.save(); c.globalAlpha *= (hubLb && bodyLocked(hubLb)) ? 0.6 : 1;
  drawBody(c, sys, ZH.x, ZH.y, hrr, T, {}); c.restore();
  if (hubLb) bodyDeco(c, hubLb, ZH.x, ZH.y, hrr, hhl);
  moons.filter((m) => m.depth >= 0).forEach(drawMoon);
  drawShipIn(c, 'zm'); drawParts(c, 'zm');
  c.restore();
}
function bodyDeco(c, id, x, y, r, hl) {       // 制覇リング・旗・BONUS印・照準
  const p = P(), cl = bodyCleared(id), pp = plantProg(id);
  if (cl) {
    c.strokeStyle = rgba(p.warn, 0.85); c.lineWidth = S.id === 'C' ? 1.8 : 1; c.lineCap = 'round';
    c.beginPath(); c.arc(x, y, r + 5, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.01, pp)); c.stroke();
    const fs = clamp(r / 46, 0.42, 1);
    c.save(); c.translate(x + r * 0.34, y - r * 0.93); c.scale(fs, fs); drawFlag(c, 0, 0, pp, reduce ? 0 : Math.sin(T * 3)); c.restore();
    if (pp < 1 && !reduce) { sparkle(c, x + r * 0.34 + 6 * fs, y - r * 0.93 - 20 * fs * pp, 4 * (1 - pp) + 1, 1 - pp, p.hi); }
  }
  if (LB[id] && LB[id].bonus) {
    const bx = x - r - 14, by = y - r * 0.7, d = 4; c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 1; c.beginPath(); c.moveTo(bx, by - d); c.lineTo(bx + d, by); c.lineTo(bx, by + d); c.lineTo(bx - d, by); c.closePath(); c.stroke();
    T_(c, 'BONUS', bx + 7, by + 3, 7.5, rgba(p.warn, 0.95), 'left', 600, 1);
  }
  if (hl && S.id === 'B') { const b = r + 9, L = 6; c.strokeStyle = rgba(p.warn, 0.95); c.lineWidth = 1; [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([sx, sy]) => { c.beginPath(); c.moveTo(x + sx * b, y + sy * (b - L)); c.lineTo(x + sx * b, y + sy * b); c.lineTo(x + sx * (b - L), y + sy * b); c.stroke(); }); }
  if (selected === id && NOW - selTime < 1.2) { const k = (NOW - selTime) / 1.2; c.strokeStyle = rgba(p.hi, 0.6 * (1 - k)); c.lineWidth = 1; c.beginPath(); c.arc(x, y, r + 6 + k * 14, 0, TAU); c.stroke(); }
}
function cardRects(sys) {
  const ids = SYS[sys].bodies.slice(), out = ids.map((id, i) => ({ id, y: 302 + i * 70, h: 62 }));
  if (SYS[sys].soon) out.push({ soon: SYS[sys].soon, y: 302 + ids.length * 70, h: 48 });
  return out;
}
function drawStarSlot(c, x, y, id, i, k, R) {
  const d = data[id][i], p = P();
  starPath(c, x, y, R, R * 0.45);
  c.strokeStyle = rgba(p.dim, 0.7); c.lineWidth = 0.7; c.stroke();
  if (d.s !== 'done' || k >= d.n) return;
  const t0 = stAt[id + ':' + i], st = t0 === undefined ? -9 : t0 + k * 0.17;
  if (NOW < st) return;
  const u = clamp((NOW - st) / 0.36), sc = reduce ? 1 : outBack(u);
  c.save(); c.translate(x, y); c.scale(sc, sc); starPath(c, 0, 0, R * 1.08, R * 0.5);
  c.fillStyle = S.id === 'B' ? p.warn : (S.id === 'C' ? '#ffcf5a' : '#f5d58a'); c.fill();
  if (S.id === 'C') { c.lineJoin = 'round'; c.strokeStyle = '#ffcf5a'; c.lineWidth = 1.4; c.stroke(); }
  c.restore();
  if (t0 !== undefined && !reduce && NOW - st < 0.6) { const v = (NOW - st) / 0.6; sparkle(c, x + R * 0.9, y - R * 0.9, R * (1.3 + v) * (1 - v * 0.4), 1 - v, '#fff'); sparkle(c, x - R, y + R * 0.4, R * 0.7 * (1 - v), 1 - v, p.warn); }
}
function drawGrade(c, g, cx, cy) {
  const p = P();
  if (!g) { T_(c, '—', cx, cy + 4, 12, rgba(p.dim, 0.8), 'center', 500, 0); return; }
  const col = g === 'PERFECT' || g === 'S' ? p.warn : g === 'A' ? p.mid : g === 'B' ? p.fg : p.dim;
  if (g === 'PERFECT') {
    T_(c, 'PERFECT', cx, cy + 3, 9.5, col, 'center', 700, 1.4);
    const a = reduce ? 0.8 : 0.5 + 0.5 * Math.sin(NOW * 3); sparkle(c, cx + 29, cy - 8, 3.5, a, '#fff');
    c.strokeStyle = rgba(col, 0.55); c.lineWidth = 0.8; c.beginPath(); c.moveTo(cx - 26, cy + 8); c.lineTo(cx + 26, cy + 8); c.stroke();
  } else {
    c.strokeStyle = rgba(col, 0.85); c.lineWidth = S.id === 'C' ? 1.8 : 1; c.beginPath(); if (S.id === 'B') c.rect(cx - 13, cy - 13, 26, 26); else c.arc(cx, cy, 13, 0, TAU); c.stroke();
    T_(c, g, cx, cy + 5.5, 15, col, 'center', S.id === 'C' ? 800 : 600, 0);
  }
  T_(c, 'BEST', cx, cy + 25, 6.5, rgba(p.dim, 0.9), 'center', 600, 1.2);
}
function drawCard(c, r) {
  const p = P(), x = 16, w = 328, h = r.h, y = r.y, cy = y + h / 2, round = S.cardR;
  if (r.soon) {
    c.save(); c.globalAlpha *= 0.7;
    rrect(c, x, y, w, h, round); c.strokeStyle = rgba(p.dim, 0.5); c.lineWidth = 0.8; c.setLineDash([3, 3]); c.stroke(); c.setLineDash([]);
    drawSilhouette(c, r.soon, x + 28, cy, 1.1);
    T_(c, r.soon, x + 56, cy - 2, 12, rgba(p.dim, 1), 'left', 600, 1.5); T_(c, 'COMING SOON · v1.2', x + 56, cy + 12, 8.5, rgba(p.dim, 0.9), 'left', 500, 1.2);
    c.restore(); return;
  }
  const id = r.id, lb = LB[id], lk = bodyLocked(id), cl = bodyCleared(id), hl = hover && hover.id === id, sel = selected === id;
  c.save();
  const accent = BCOL[id];
  if (S.id === 'B') {
    c.fillStyle = hl || sel ? 'rgba(255,181,71,0.07)' : 'rgba(99,216,201,0.04)'; c.fillRect(x, y, w, h);
    c.strokeStyle = rgba(sel || hl ? p.warn : p.mid, sel || hl ? 0.9 : 0.3); c.lineWidth = 0.8; const L = 7;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x + w, y + h, -1, -1], [x, y + h, 1, -1]].forEach(([bx, by, sx, sy]) => { c.beginPath(); c.moveTo(bx + sx * L, by); c.lineTo(bx, by); c.lineTo(bx, by + sy * L); c.stroke(); });
  } else {
    rrect(c, x, y, w, h, round); c.fillStyle = S.id === 'C' ? rgba(mixHex(accent, '#14182a', 0.88), hl ? 1 : 0.92) : (hl || sel ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.035)'); c.fill();
    c.strokeStyle = S.id === 'C' ? rgba(accent, sel || hl ? 0.9 : 0.4) : rgba(sel || hl ? p.mid : p.fg, sel || hl ? 0.7 : 0.13); c.lineWidth = S.id === 'C' ? 1.4 : 0.8; c.stroke();
  }
  c.globalAlpha *= lk ? 0.62 : 1;
  const bob = (S.id === 'C' && !reduce && !lk) ? Math.sin(NOW * 2 + y) * 1.2 : 0;
  drawBody(c, id, x + 30, cy + bob, 15, T, { pers: false, halo: false });
  if (cl) { c.strokeStyle = rgba(p.warn, 0.9); c.lineWidth = 1; c.beginPath(); c.arc(x + 30, cy + bob, 19, 0, TAU); c.stroke(); }
  T_(c, lb.name, x + 58, cy - 6, 13, lk ? rgba(p.fg, 0.7) : p.fg, 'left', S.id === 'C' ? 800 : 600, S.id === 'B' ? 1.6 : 1);
  T_(c, lb.tag, x + 58, cy + 10, 8.5, rgba(p.dim, 1), 'left', 500, 0.6);
  for (let i = 0; i < 2; i++) {
    const px = 178 + i * 46, py = cy - 21, d = data[id][i], done = d.s === 'done' && (stAt[id + ':' + i] === undefined || NOW >= stAt[id + ':' + i]);
    if (S.id === 'B') { c.strokeStyle = d.s === 'open' ? rgba(p.warn, 0.5 + (reduce ? 0.3 : 0.3 * Math.sin(NOW * 3))) : rgba(done ? p.mid : p.dim, done ? 0.7 : 0.5); c.lineWidth = 0.8; c.strokeRect(px + 0.5, py + 0.5, 40, 41); }
    else { rrect(c, px, py, 40, 42, S.id === 'C' ? 14 : 9); c.fillStyle = done ? (S.id === 'C' ? rgba(accent, 0.22) : rgba(p.mid, 0.1)) : 'rgba(255,255,255,0.02)'; c.fill(); c.strokeStyle = d.s === 'open' ? rgba(p.warn, 0.6 + (reduce ? 0.2 : 0.3 * Math.sin(NOW * 3))) : rgba(done ? (S.id === 'C' ? accent : p.mid) : p.dim, done ? 0.7 : 0.5); c.lineWidth = d.s === 'open' ? 1.2 : 0.8; c.stroke(); }
    T_(c, 'S' + (i + 1), px + 5, py + 11, 7.5, rgba(p.dim, 1), 'left', 600, 0.6);
    if (d.s === 'locked') lockGlyph(c, px + 20, py + 25, 10, rgba(p.dim, 0.9));
    else {
      if (d.s === 'open') { c.fillStyle = rgba(p.warn, 0.9); c.beginPath(); c.moveTo(px + 16, py + 12); c.lineTo(px + 26, py + 18); c.lineTo(px + 16, py + 24); c.closePath(); c.fill(); }
      const sr = S.id === 'C' ? 4.6 : 4;
      for (let k = 0; k < 3; k++) drawStarSlot(c, px + 10 + k * 10, py + 33, id, i, k, sr);
    }
  }
  drawGrade(c, bodyBest(id), 304, cy - 4);
  c.restore();
}
function drawZoomUI(c, a) {
  const p = P(), sys = camSys, pg = sysProgress(sys);
  c.save(); c.globalAlpha *= a;
  const hb = hover && hover.kind === 'back';
  if (S.id === 'B') { c.strokeStyle = rgba(hb ? p.warn : p.mid, 0.7); c.lineWidth = 0.8; c.strokeRect(10.5, 10.5, 72, 36); }
  else { rrect(c, 10, 10, 72, 36, S.id === 'C' ? 18 : 10); c.fillStyle = hb ? 'rgba(255,255,255,.12)' : 'rgba(255,255,255,.05)'; c.fill(); c.strokeStyle = rgba(p.fg, 0.18); c.lineWidth = 0.7; c.stroke(); }
  c.strokeStyle = p.fg; c.lineWidth = 1.5; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); c.moveTo(30, 20); c.lineTo(23, 28); c.lineTo(30, 36); c.stroke();
  T_(c, 'BACK', 38, 32, 10.5, p.fg, 'left', 600, 1.4);
  T_(c, SYS[sys].name, W - 16, 28, 13, p.fg, 'right', S.id === 'C' ? 800 : 600, 3);
  T_(c, `★ ${pg.st}/${pg.mx}   ${SYS[sys].bodies.length} SITE${SYS[sys].bodies.length > 1 ? 'S' : ''}`, W - 16, 44, 9, rgba(p.fg, 0.65), 'right', 500, 0.6);
  cardRects(sys).forEach((r) => drawCard(c, r));
  T_(c, S.id === 'B' ? 'SELECT SITE  /  TAP BODY OR CARD' : 'Tap a site to set course', W / 2, 628, 8.5, rgba(p.dim, 1), 'center', 500, S.id === 'B' ? 1.5 : 0.4);
  c.restore();
}

// ------------------------------------------------------------------ 描画本体
function render() {
  const c = ctx, z = ease(zProg), p = P();
  c.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  c.save(); c.beginPath(); c.rect(0, 0, W, H); c.clip();
  drawBg(c);
  if (z < 0.999) {
    c.save();
    const A = ovP[camSys] || ovP.jupiter;
    if (z > 0.001) { const Sx = 1 + (K_ZOOM - 1) * z, tx = A.x + (ZH.x - A.x) * z, ty = A.y + (ZH.y - A.y) * z; c.globalAlpha *= 1 - clamp((z - 0.2) / 0.55); c.translate(tx, ty); c.scale(Sx, Sx); c.translate(-A.x, -A.y); }
    drawOverviewWorld(c);
    if (z < 0.5) { drawShipIn(c, 'ov'); drawParts(c, 'ov'); }
    c.restore();
  }
  if (z > 0.001) {
    c.save();
    const A = ovP[camSys] || ovP.jupiter, Sx = 1 / K_ZOOM + (1 - 1 / K_ZOOM) * z, tx = A.x + (ZH.x - A.x) * z, ty = A.y + (ZH.y - A.y) * z;
    c.translate(tx, ty); c.scale(Sx, Sx); c.translate(-ZH.x, -ZH.y);
    drawZoomWorld(c, clamp((z - 0.2) / 0.6));
    c.restore();
  }
  if (z < 0.999) drawOverviewUI(c, (1 - clamp(z / 0.5)) * ovIntroAlpha());
  if (z > 0.001) drawZoomUI(c, clamp((z - 0.4) / 0.6));
  if (toast) {
    const age = NOW - toast.t0;
    if (age < 2.6) { const al = clamp(Math.min(age / 0.2, (2.6 - age) / 0.5)), ty = z > 0.5 ? 586 : 482; c.save(); c.globalAlpha = al; setFont(c, 10, 600); const tw = c.measureText(toast.text).width + 30; rrect(c, W / 2 - tw / 2, ty - 16, tw, 26, S.id === 'B' ? 3 : 13); c.fillStyle = 'rgba(13,17,27,0.95)'; c.fill(); c.strokeStyle = rgba(S.id === 'B' ? p.warn : p.mid, 0.7); c.lineWidth = 0.8; c.stroke(); T_(c, toast.text, W / 2, ty + 1, 10, p.fg, 'center', 600, 1); c.restore(); } else toast = null;
  }
  if (S.scan) {   // B: 走査線 + ゆっくり流れる明暗帯
    c.fillStyle = 'rgba(99,216,201,0.035)'; c.beginPath(); for (let y = 0; y < H; y += 3) c.rect(0, y, W, 1); c.fill();
    if (!reduce) { const by = (NOW * 40) % (H + 80) - 40; const g = c.createLinearGradient(0, by - 40, 0, by + 40); g.addColorStop(0, 'rgba(99,216,201,0)'); g.addColorStop(0.5, 'rgba(99,216,201,0.045)'); g.addColorStop(1, 'rgba(99,216,201,0)'); c.fillStyle = g; c.fillRect(0, by - 40, W, 80); }
  }
  const vg = c.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 420); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)'); c.fillStyle = vg; c.fillRect(0, 0, W, H);
  c.restore();
}

// ------------------------------------------------------------------ 更新
function update(dt) {
  NOW += dt; if (!reduce) T += dt;
  if (reduce) introT = 1.6; else introT = Math.min(1.6, introT + dt);
  const zdur = reduce ? 0.22 : 0.5;
  if (zProg !== zTarget) { zProg += Math.sign(zTarget - zProg) * dt / zdur; if (Math.abs(zProg - zTarget) < dt / zdur) zProg = zTarget; zProg = clamp(zProg); }
  view = zTarget === 1 ? 'zoom' : 'over';
  updateOv();
  if (zProg === 1 && !zDone) { zDone = true; tick(660); }
  if (zProg < 1) zDone = false;
  const fl = ship.fl;
  if (fl) {
    fl.t += dt / fl.dur;
    const e = ease(clamp(fl.t)), pt = flightPoint(fl, fl.world, e);
    if (Math.random() < dt * 60 * 0.8) { const tg = flightPoint(fl, fl.world, Math.min(1, e + 0.02)); const dx = pt.x - tg.x, dy = pt.y - tg.y, L = Math.hypot(dx, dy) || 1; spawnPuff(fl.world, pt.x + dx / L * 6, pt.y + dy / L * 6, dx / L * 14 + (Math.random() - 0.5) * 10, dy / L * 14 + (Math.random() - 0.5) * 10); }
    if (fl.t >= 1) { const a = fl.after; ship.at = fl.toId; const d = dockPos(fl.world, fl.toId); if (d && !reduce) for (let i = 0; i < 7; i++) { const an = Math.random() * TAU; spawnPuff(fl.world, d.x, d.y + 4, Math.cos(an) * 18, Math.sin(an) * 18, true); } ship.fl = null; poke('jump'); tick(990); if (a) a(); }
  }
  for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt; if (q.t > q.life) parts.splice(i, 1); }
  if (!reduce) { cometNext -= dt; if (cometNext <= 0 && !comet) { comet = { x: -20 + rnd() * 140, y: -10 + rnd() * 90, vx: 150, vy: 95, t: 0, life: 1.7 }; cometNext = 8 + rnd() * 7; } if (comet) { comet.t += dt; if (comet.t > comet.life) comet = null; } } else comet = null;
  if (pending) {
    if (pending.phase === 'wait' && zProg === 1 && camSys === 'earth') { pending.phase = 'run'; pending.t0 = NOW + 0.5; }
    if (pending.phase === 'run' && NOW >= pending.t0) {
      data.terra[1] = { s: 'done', n: 3, g: 'A' }; stAt['terra:1'] = NOW; plantT.terra = NOW + 0.9; tick(1180); say('TERRA · STAGE 2 CLEARED'); pending = null;
    }
  }
}
function poke(kind) { mascot.mode = kind; mascot.t0 = NOW; }

// ------------------------------------------------------------------ 操作
function hitTest(x, y) {
  const z = zProg;
  if (z === 0 && shipScr && !ship.fl && Math.hypot(x - shipScr.x, y - (shipScr.y - 10 * shipScr.k - 2)) < 14) return { kind: 'astro' };
  if (z === 1 && shipScr && !ship.fl && Math.hypot(x - shipScr.x, y - (shipScr.y - 11 * shipScr.k)) < 22) return { kind: 'astro' };
  if (z === 0) {
    let best = null, bd = 1e9;
    SYS_ORDER.forEach((id) => { const q = ovP[id]; let d = Math.hypot(x - q.x, y - q.y); for (const m of Object.keys(MOONS)) if (MOONS[m].sys === id) d = Math.min(d, Math.hypot(x - ovMoon(m).x, y - ovMoon(m).y) - 6); if (d < 26 && d < bd) { bd = d; best = id; } });
    if (best) return { kind: 'sys', sys: best };
    for (const r of chipRects()) if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return { kind: 'chip', sys: r.sys };
    return null;
  }
  if (z === 1) {
    if (x >= 4 && x <= 90 && y >= 4 && y <= 54) return { kind: 'back' };
    for (const r of cardRects(camSys)) if (r.id && x >= 16 && x <= 344 && y >= r.y && y <= r.y + r.h) return { kind: 'card', id: r.id };
    for (const id of SYS[camSys].bodies) { const q = zmPos(id, camSys); if (!q) continue; if (!MOONS[id] && !LB[id].hub) continue; if (Math.hypot(x - q.x, y - q.y) < Math.max(q.r + 6, 24)) return { kind: 'body', id }; }
  }
  return null;
}
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
function gotoSys(sys) {
  if (ship.fl || zTarget === 1 || zProg > 0) return;
  camSys = sys; tick(520);
  const go = () => zoomTo(sys);
  if (sysOf(ship.at) === sys) go(); else flyTo(sys, 'ov', go, 0.9);
}
function zoomTo(sys) {
  camSys = sys; zTarget = 1; hover = null; selected = null;
  if (!shown[sys]) { shown[sys] = true; let i = 0; for (const id of SYS[sys].bodies) for (let s = 0; s < 2; s++) if (data[id][s].s === 'done') stAt[id + ':' + s] = NOW + 0.45 + 0.34 * (i++); }
}
function flyTo(id, world, after, dur) {
  const from = dockPos(world, ship.at) || dockPos(world, id), to = dockPos(world, id);
  ship.fl = { from: { x: from.x, y: from.y }, toId: id, world, t: 0, dur: reduce ? 0.3 : (dur || 0.9), after, sign: from.x < to.x ? -1 : 1 };
  hover = null;
}
function selectBody(id) {
  if (ship.fl) return;
  if (bodyLocked(id)) { selected = null; const need = { titan: 'MARS', venus: 'TITAN', mercury: 'VENUS' }[id]; say(need ? `LOCKED · CLEAR ${need} FIRST` : 'LOCKED'); tick(200); return; }
  selected = id; selTime = NOW; tick(760);
  const open = data[id].findIndex((d) => d.s === 'open'), stage = open >= 0 ? open + 1 : 2;
  const msg = `PROTOTYPE · START ${LB[id].name} S${stage}`;
  if (ship.at === id) { say(msg); return; }
  flyTo(id, 'zm', () => say(msg), 0.8);
}
function onTap(x, y) {
  if (introT < 1.5) { introT = 1.6; return; }                 // イントロは1タップでスキップ
  if (ship.fl) { ship.fl.t = 1; return; }                       // 飛行も1タップでスキップ
  if (zProg > 0 && zProg < 1) return;
  const h = hitTest(x, y); if (!h) return;
  if (h.kind === 'astro') { const modes = reduce ? ['wave'] : ['jump', 'spin', 'wave']; poke(modes[mascot.n++ % modes.length]); tick(1040); return; }
  if (h.kind === 'sys' || h.kind === 'chip') gotoSys(h.sys);
  else if (h.kind === 'back') { zTarget = 0; selected = null; hover = null; tick(440); }
  else if (h.kind === 'card' || h.kind === 'body') selectBody(h.id);
}
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); const q = toLogical(e); onTap(q.x, q.y); });
cv.addEventListener('pointermove', (e) => {
  const q = toLogical(e); pointer.x = q.x / W; pointer.y = q.y / H;
  if (e.pointerType === 'touch') return;
  const h = zProg === 0 || zProg === 1 ? hitTest(q.x, q.y) : null;
  hover = h ? { ...h, sys: h.sys || (h.id ? sysOf(h.id) : null) } : null;
  cv.style.cursor = h ? 'pointer' : 'default';
});
cv.addEventListener('pointerleave', () => { hover = null; });

// ------------------------------------------------------------------ コントロール
function setStyle(k) { S = STY[k]; document.querySelectorAll('[data-style]').forEach((b) => b.classList.toggle('on', b.dataset.style === k)); }
document.querySelectorAll('[data-style]').forEach((b) => b.addEventListener('click', () => setStyle(b.dataset.style)));
const elRm = document.getElementById('rm'), elFaces = document.getElementById('faces'), elSnd = document.getElementById('snd');
elRm.checked = reduce; elFaces.checked = faces;
elRm.addEventListener('change', () => { reduce = elRm.checked; if (reduce) ship.fl = null; });
elFaces.addEventListener('change', () => { faces = elFaces.checked; });
elSnd.addEventListener('change', () => { sound = elSnd.checked; tick(880); });
document.getElementById('intro').addEventListener('click', () => { introT = 0; zTarget = 0; zProg = 0; });
document.getElementById('reset').addEventListener('click', () => { data = DEMO(); for (const k of Object.keys(stAt)) delete stAt[k]; for (const k of Object.keys(shown)) delete shown[k]; for (const k of Object.keys(plantT)) delete plantT[k]; ship.at = 'europa'; ship.fl = null; zTarget = 0; zProg = 0; selected = null; pending = null; });
document.getElementById('replay').addEventListener('click', () => {
  data.terra[1] = { s: 'open', n: 0, g: null }; plantT.terra = Infinity; delete stAt['terra:1']; shown.earth = true;
  pending = { phase: 'wait' }; selected = null; ship.fl = null;
  if (zTarget === 1 && camSys === 'earth') { /* そのまま */ }
  else if (zProg > 0) { camSys = 'earth'; zProg = 1; zTarget = 1; }
  else { camSys = 'earth'; zoomTo('earth'); }
  if (sysOf(ship.at) !== 'earth') ship.at = 'moon';
});
setStyle(S.id);

// ------------------------------------------------------------------ リサイズ・ループ
function resize() {
  const ctl = document.getElementById('ctl').offsetHeight;
  const sc = innerWidth < 600 ? innerWidth / W : clamp((innerHeight - ctl - 24) / H, 0.8, 1.7);
  const cssW = Math.round(W * sc), cssH = Math.round(H * sc), dpr = Math.min(3, window.devicePixelRatio || 1);
  cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
}
addEventListener('resize', resize); resize();
// 診断・スクリーンショット用 URL パラメータ: ?style=B&view=jupiter&skip=1&reduce=1&faces=1
if (qs.get('skip') === '1') introT = 1.6;
const v0 = qs.get('view'); if (v0 && SYS[v0]) { camSys = v0; zProg = zTarget = 1; shown[v0] = true; introT = 1.6; if (sysOf(ship.at) !== v0) ship.at = SYS[v0].bodies[0]; }
window.__lab = { get S() { return S; }, setStyle, gotoSys, zoomTo, selectBody, onTap, get state() { return { view, camSys, zProg, ship: ship.at, fl: !!ship.fl, introT }; } };
let last = performance.now();
function frame(ts) { const dt = Math.min(0.05, (ts - last) / 1000); last = ts; try { update(dt); render(); } catch (e) { console.error(e); } requestAnimationFrame(frame); }
requestAnimationFrame(frame);
