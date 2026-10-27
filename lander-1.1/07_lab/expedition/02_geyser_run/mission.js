// EXPEDITION #2 ENCELADUS GEYSER RUN（試作）。仕様: 01_docs/EXPEDITION_MISSIONS.md
// 氷の割れ目から周期的に噴気。噴気の頂上を通って試料を集め（最低1つ）、噴気の間のパッドに着地する。
// 共通部分（メニュー・ライフ・スコア・★・結果）は 00_harness/shell.js。
import { createLab, W, H, C } from '../00_harness/harness.js?v=ff32a905ee';
import { txt, rgba, rr } from '../../../02_src/art.js?v=86285db95f';
import { P } from '../../../02_src/core/palette.js?v=a36de9d9c3';
import { createShell, LIFE_LOST_S, mmss, drawLandability, HINT_Y } from '../00_harness/shell.js?v=55d64ddce0';

const sh = createShell({ id: 'geyser_run', expLabel: 'EXPEDITION 02', title: 'ENCELADUS GEYSER RUN' });
const sess = sh.sess;
const STRAND_S = 2.0;
const OUT = { x0: -10, x1: 370, y0: -30 };
const GY = 520;                        // 地表の基準高さ
const PAD = { x: 200, y: 518, w: 60, id: 'pad' };
const VENT_W = 11;                     // 噴出口の半幅（接触でバウンス）
// 噴気: x, 周期 P（6〜9秒）, 最初の噴出時刻 O, 強さの係数 f
const VENTS = [
  { x: 52,  P: 6.5, O: 3.4, f: 0.92 },
  { x: 150, P: 7.5, O: 5.6, f: 1.08 },
  { x: 308, P: 8.5, O: 2.2, f: 1.0 },
];
const TELE_S = 1.2;                    // 前触れ（霜・ヒス音）
const RISE = 0.4, PEAK = 0.3, FADE = 2.5, ERUPT_S = RISE + PEAK + FADE;   // 噴出: 立ち上がり → ピーク → 2.5 秒で消える
const F_TOP = 3.0;                     // 噴気の頂上での上向き加速度（口で push、頂上で F_TOP へ直線的に減る）
const SAMPLE_R = 14, SAMPLE_Q = 0.86;  // 試料の取得半径 / 頂上に近い位置（高さ比）
const ENTRY = { x: 180, y: 96, vy: 14 };   // 上から進入

// ---- 地形（ゆるい起伏 + 噴出口・パッドは平ら） -----------------------------------------------
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const baseY = (x) => GY + 3.2 * Math.sin(x * 0.021 + 0.7) + 1.3 * Math.sin(x * 0.07 + 2.0);
function terrainFn(x) {
  let y = baseY(x);
  for (const v of VENTS) { const w = 1 - sstep(16, 34, Math.abs(x - v.x)); y += (baseY(v.x) - y) * w; v.y = baseY(v.x); }
  const wp = Math.min(sstep(PAD.x - 26, PAD.x, x), 1 - sstep(PAD.x + PAD.w, PAD.x + PAD.w + 26, x));
  return y + (PAD.y - y) * wp;
}
const terrain = [];
for (let x = 0; x <= W; x += 6) terrain.push({ x, y: terrainFn(x) });
for (const v of VENTS) v.y = terrainFn(v.x);

// 装飾（固定乱数）
let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 70 }, () => ({ x: rnd() * W, y: rnd() * 470, r: 0.4 + rnd() * 0.9, a: 0.25 + rnd() * 0.6 }));
// 虎縞（tiger stripes）: 地表の暗い割れ目。地形の少し下に斜めに走る折れ線
const STRIPES = Array.from({ length: 7 }, (_, i) => {
  const x0 = -10 + i * 56 + rnd() * 18, pts = [[x0, 0]]; let x = x0, d = 0;
  for (let k = 0; k < 4; k++) { x += 10 + rnd() * 18; d += 8 + rnd() * 18; pts.push([x, d]); }
  return { pts, w: 1.2 + rnd() * 1.4 };
});

// ---- 噴気の時間関係 -----------------------------------------------------------------------------
// T = 開始（タップ）からの秒。ph0 = 全噴気の位相ずらし（秒）。a = 噴出からの経過秒（噴出中のみ 0..ERUPT_S、他は -1）
const ease = (t) => 1 - (1 - t) * (1 - t);
function ventAt(v, T, ph0) {
  const u = (((T - v.O - ph0) % v.P) + v.P) % v.P;
  const a = u < ERUPT_S ? u : -1, toNext = a >= 0 ? v.P - u : v.P - u;
  const tele = a < 0 && toNext < TELE_S ? 1 - toNext / TELE_S : 0;
  const env = a < 0 ? 0 : a < RISE + PEAK ? 1 : Math.max(0, 1 - (a - RISE - PEAK) / FADE);
  return { a, tele, env, toNext, cycle: Math.floor((T - v.O - ph0) / v.P) };
}

const lab = createLab({
  canvas: document.getElementById('c'),
  title: 'ENCELADUS GEYSER RUN',
  defaults: { g: 0.066, thrust: 5.2, ang: 28, damp: 0.82, drag: 0, fuel: 100, rcs: 2.5, vec: 1 },
  extraParams: [
    { key: 'push', label: 'plume push at vent px/s²', min: 4, max: 20, step: 0.5, def: 13 },
    { key: 'hp',   label: 'plume height px',          min: 150, max: 380, step: 10, def: 290 },
    { key: 'ph0',  label: 'vent phase shift s',       min: -10, max: 10, step: 0.1, def: 0 },
  ],
  world: { terrain, pads: [PAD] },
  start, onUpdate, onTouchdown, onLiftoff, onCrash, onTap, forces,
  onDrawBack, onDrawMid, onDrawFront, drawTerrain,
  telemetryExtra: (l) => `samples ${l.m.got.filter(Boolean).length}/3\n` + VENTS.map((v, i) => { const s = l.m.vs[i]; return `vent${i}  ${s ? (s.a >= 0 ? 'ERUPT ' + s.a.toFixed(1) : 'next ' + s.toNext.toFixed(1)) : '-'}`; }).join('\n') + `\ntouch  ${l.m.touchGrade || '-'}`,
});
const HP = () => lab.params.hp;
const plumeHalf = (q) => 11 + 9 * q;   // 高さ比 q での半幅

// ---------------------------------------------------------------- 状態
function start(l) {
  sh.onStart(l.m);
  l.showHud = sess.mode !== 'menu';
  l.resetShip({ x: ENTRY.x, y: ENTRY.y, vx: 0, vy: 0, angle: 0 });
  l.frozen = true; l.controlsEnabled = false;   // 開始待ち
  l.m = { menu: sess.mode === 'menu', waiting: true, started: false, flyT: 0, relT: 0, got: [false, false, false], sampleGrade: null, touchGrade: null, strandT: 0, result: null, resultT: 0, final: null, failed: false, lifeLost: false, toast: '', toastT: 0, bumpT: 0, shakeT: 0, vs: VENTS.map(() => null), nz1: 0, nz2: 0, inPlume: 0, rng: 12345, hissed: {}, erupted: {}, lockedT: 0 };
  if (l.m.menu) l.hideShip = true;
}
const begin = (l, mode, opt) => sh.begin(l, mode, opt);
const toast = (l, s, sec = 2) => { l.m.toast = s; l.m.toastT = sec; };
const samples = (m) => m.got.filter(Boolean).length;
const mrand = (m) => (m.rng = (m.rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
function go(l) {   // 開始待ち → 進入（タップ / 推力）
  const m = l.m; if (!m.waiting || m.menu || m.result) return;
  m.waiting = false; m.started = true; l.frozen = false; l.controlsEnabled = true; l.ship.vy = ENTRY.vy; toast(l, 'GO', 1.0); audioWake();
}
function onTap(l, x, y) {
  const m = l.m;
  if (m.menu) { sh.tap(l, x, y); return; }
  if (m.waiting) { go(l); return; }
  sh.tap(l, x, y);
}
window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'ArrowUp') && lab.m && lab.m.waiting && !lab.m.menu && !e.repeat) { go(lab); e.preventDefault(); } }, true);
sh.hookR(lab, (m) => m.started, (l, r, d) => l.crash(r, d));

function onTouchdown(l, info) {
  const m = l.m; m.touchGrade = info.kind === 'pad' ? info.grade : null;
  if (info.kind !== 'pad' || m.result) return;
  if (samples(m) < 1) { m.lockedT = 2.4; toast(l, 'PAD LOCKED · NO SAMPLE', 2.4); return; }   // 試料なし: grounded のみ（得点なし・失敗でもない）
  m.result = 'win'; m.resultT = 0; l.frozen = true; l.controlsEnabled = false;
  const fp = l.fuelPct(), n = samples(m), grade = info.grade;
  m.final = { t: m.flyT, base: 1000 + Math.round(fp) * 10 + (grade === 'PERFECT' ? 300 : 100), fuel: fp, grade, n, s2: n >= 3, s3: grade === 'PERFECT' };
  sh.complete(m.final, [true, m.final.s2, m.final.s3]);
}
function onLiftoff() {}
function onCrash(l, reason, detail) {
  const m = l.m; if (m.result) return;
  m.result = 'lose'; m.resultT = 0; m.reason = reason; m.detail = detail; l.controlsEnabled = false; sh.onLoss(m);
}
const lose = (l, r, d) => l.crash(r, d);

// ---------------------------------------------------------------- 噴気の外力（物理サブステップごと）
function forces(l, dt) {
  const m = l.m, s = l.ship, pr = l.params; if (!m.started || m.result) return;
  const T = m.flyT, hp = pr.hp;
  m.nz1 += ((mrand(m) * 2 - 1) - m.nz1) * Math.min(1, dt * 5); m.nz2 += ((mrand(m) * 2 - 1) - m.nz2) * Math.min(1, dt * 3);
  let inside = 0;
  for (let i = 0; i < VENTS.length; i++) {
    const v = VENTS[i], st = ventAt(v, T, pr.ph0); if (st.a < 0 || st.env <= 0) continue;
    const hf = ease(Math.min(1, st.a / RISE)), top = hp * hf, h = v.y - s.y, dx = s.x - v.x;
    // 噴出口への接触: 墜落にせず押し返す（バウンス）
    if (Math.abs(dx) <= VENT_W + 4 && s.y + C.LEG_Y >= v.y - 5 && s.vy > 0) {
      s.vy = -(0.4 * s.vy + 14); s.vx += (dx >= 0 ? 1 : -1) * 9; s.omega += (dx >= 0 ? 1 : -1) * 10; m.bumpT = 0.9; m.shakeT = 0.25; clang(0.5);
    }
    if (h < 0 || h > top) continue;
    const q = h / hp, w = plumeHalf(q); if (Math.abs(dx) > w) continue;
    const lat = 1 - 0.4 * (dx / w) * (dx / w), F0 = pr.push * v.f;
    s.vy -= (F0 + (F_TOP - F0) * q) * lat * st.env * dt;                                // 強い上向きの押し
    s.vx += 4.0 * m.nz1 * st.env * (1 - 0.5 * q) * dt;                                 // 横ゆれ
    s.omega += 5.0 * m.nz2 * st.env * dt;                                               // スピンの乱れ（°/s²。ゆるく減衰するので ±数十°/s 程度）
    inside = Math.max(inside, st.env);
  }
  m.inPlume = inside;
}

// ---------------------------------------------------------------- 毎フレーム
function onUpdate(l, dt) {
  const m = l.m, s = l.ship, pr = l.params;
  if (m.menu) { m.T = l.clock; for (let i = 0; i < VENTS.length; i++) m.vs[i] = ventAt(VENTS[i], l.clock, 0); return; }
  if (m.toastT > 0) m.toastT -= dt;
  if (m.lockedT > 0) m.lockedT -= dt;
  m.relT += dt;
  if (m.waiting) { for (let i = 0; i < VENTS.length; i++) m.vs[i] = null; return; }
  if (!m.result) m.flyT += dt;
  for (let i = 0; i < VENTS.length; i++) m.vs[i] = ventAt(VENTS[i], m.flyT, pr.ph0);
  if (m.result) {
    m.resultT += dt;
    if (m.lifeLost && m.resultT >= LIFE_LOST_S) l.reset();
    return;
  }
  // 範囲外
  if (s.x < OUT.x0 || s.x > OUT.x1 || s.y < OUT.y0) return l.crash('LEFT THE AREA', 'You drifted out of range');
  // 燃料切れ
  if (s.fuel <= 0.0001) { m.strandT += dt; if (m.strandT >= STRAND_S) return l.crash('STRANDED', 'Out of fuel'); } else m.strandT = 0;
  // 噴出の音・接地中に噴出口が噴いたら押し上げる
  for (let i = 0; i < VENTS.length; i++) {
    const v = VENTS[i], st = m.vs[i];
    if (st.tele > 0 && !m.hissed[i + ':' + st.cycle]) { m.hissed[i + ':' + st.cycle] = 1; hiss(0.55); }
    if (st.a >= 0 && !m.erupted[i + ':' + st.cycle]) { m.erupted[i + ':' + st.cycle] = 1; hiss(1.0); }
    if (st.a >= 0 && st.env > 0.2 && l.state === 'grounded' && Math.abs(s.x - v.x) <= VENT_W + 4) {
      l.state = 'play'; s.vy = -22; s.vx += (s.x >= v.x ? 1 : -1) * 9; s.omega += 10; m.bumpT = 0.9; m.shakeT = 0.25; clang(0.5); toast(l, 'VENT ERUPTED', 1.2);
    }
    // 試料: 噴出中だけ頂上付近に出現（噴出ごとに1回、各噴気の試料は1度だけ取れる）
    if (st.a >= RISE && !m.got[i]) {
      const p = samplePos(i, l.clock);
      if (Math.hypot(s.x - p.x, s.y - p.y) <= SAMPLE_R) { m.got[i] = true; chime(samples(m)); toast(l, 'SAMPLE ' + samples(m) + '/3', 1.6); l.burst(p.x, p.y, 16, '#9FF3E6'); }
    }
  }
  if (m.bumpT > 0) m.bumpT -= dt;
  if (m.shakeT > 0) m.shakeT -= dt;
  lab.canvas.style.transform = m.shakeT > 0 ? 'translate(' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px,' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px)' : '';
}
function samplePos(i, clock) {
  const v = VENTS[i], hp = lab.params.hp;
  return { x: v.x + 4 * Math.sin(clock * 2.1 + i), y: v.y - hp * SAMPLE_Q + 3 * Math.sin(clock * 2.7 + i * 2) };
}

// ---------------------------------------------------------------- 音（WebAudio。失敗しても続行。テスト自動操縦中は鳴らさない）
let actx = null;
const audioWake = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* 音なし */ } };
const audioOn = () => actx && !lab.script;
let noiseBuf = null;
function hiss(k) {   // 霜のヒス音 / 噴出の吹き出し音（フィルタ付きノイズ）
  if (!audioOn()) return;
  try {
    const t = actx.currentTime;
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = actx.createBufferSource(); src.buffer = noiseBuf;
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = k < 0.8 ? 5200 : 1400; f.Q.value = 0.7;
    const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05 * k, t + (k < 0.8 ? 0.9 : 0.12)); g.gain.exponentialRampToValueAtTime(0.0001, t + (k < 0.8 ? 1.3 : 1.6));
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t); src.stop(t + 1.7);
  } catch (e) { /* 音なしでも続行 */ }
}
function chime(n) {
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    [880, 1318 + n * 110].forEach((fr, i) => { const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(g); o.start(t + i * 0.09); o.stop(t + 0.75); });
  } catch (e) { /* 音なしでも続行 */ }
}
function clang(k) {
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    g.gain.setValueAtTime(0.1 + 0.1 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    for (const f of [260, 410]) { const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.32); }
  } catch (e) { /* 音なしでも続行 */ }
}

// ---------------------------------------------------------------- 描画
function onDrawBack(ctx, l) {
  const g = ctx.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, '#02030a'); g.addColorStop(1, '#101a2e');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of STARS) { ctx.fillStyle = rgba('#ffffff', s.a); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  drawSaturn(ctx);
}
function drawSaturn(ctx) {
  const cx = 258, cy = 218, r = 92, tilt = -0.28;
  const ring = (back) => {   // 環: 傾いた楕円。back=惑星の裏側（上半分）
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(tilt);
    for (const [rx, ry, col, lw] of [[196, 34, 'rgba(206,190,150,0.55)', 9], [168, 29, 'rgba(160,144,112,0.5)', 6], [146, 25, 'rgba(226,212,176,0.45)', 4]]) {
      ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, back ? Math.PI : 0, back ? 2 * Math.PI : Math.PI); ctx.stroke();
    }
    ctx.restore();
  };
  ring(true);
  ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
  const g = ctx.createLinearGradient(0, cy - r, 0, cy + r);
  g.addColorStop(0, '#c9b585'); g.addColorStop(0.3, '#e2d3a6'); g.addColorStop(0.5, '#bba274'); g.addColorStop(0.7, '#d8c697'); g.addColorStop(1, '#8c7752');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(120,96,60,0.22)'; for (const [y, h] of [[-52, 8], [-20, 12], [14, 7], [40, 10]]) ctx.fillRect(cx - r, cy + y, r * 2, h);
  const sh2 = ctx.createRadialGradient(cx + 46, cy - 40, r * 0.4, cx + 46, cy - 40, r * 2.0); sh2.addColorStop(0, 'rgba(0,0,0,0)'); sh2.addColorStop(1, 'rgba(0,0,0,0.72)');
  ctx.fillStyle = sh2; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ring(false);
}

// 地形: 氷の白青 + 暗い虎縞 + 噴出口の割れ目
function drawTerrain(ctx, l) {
  const p = P(), m = l.m;
  ctx.beginPath(); ctx.moveTo(0, H);
  for (const q of terrain) ctx.lineTo(q.x, q.y);
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 500, 0, 600); g.addColorStop(0, '#e6f1fb'); g.addColorStop(0.45, '#b4cbe2'); g.addColorStop(1, '#5d7391');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const s of STRIPES) {   // 虎縞
    const top = terrainFn(s.pts[0][0]) + 4;
    ctx.strokeStyle = 'rgba(28,46,76,0.7)'; ctx.lineWidth = s.w; ctx.beginPath();
    s.pts.forEach((q, i) => (i ? ctx.lineTo(q[0], top + q[1]) : ctx.moveTo(q[0], top + q[1]))); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.7; ctx.beginPath();
    s.pts.forEach((q, i) => (i ? ctx.lineTo(q[0] + 1.2, top + q[1] - 1) : ctx.moveTo(q[0] + 1.2, top + q[1] - 1))); ctx.stroke();
  }
  for (const v of VENTS) {   // 噴出口の割れ目（暗い楕円 + 下へ走る亀裂）
    const st = m.vs[VENTS.indexOf(v)], hot = st && st.a >= 0 ? st.env : st ? st.tele * 0.6 : 0;
    ctx.fillStyle = '#16233c'; ctx.beginPath(); ctx.ellipse(v.x, v.y + 2, VENT_W + 2, 4, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(22,35,60,0.85)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(v.x - 10, v.y + 3); ctx.lineTo(v.x - 24, v.y + 14); ctx.lineTo(v.x - 40, v.y + 20); ctx.moveTo(v.x + 10, v.y + 3); ctx.lineTo(v.x + 22, v.y + 16); ctx.lineTo(v.x + 44, v.y + 22); ctx.stroke();
    if (hot > 0.02) { ctx.fillStyle = rgba('#cfeaff', 0.35 * hot); ctx.beginPath(); ctx.ellipse(v.x, v.y + 1, VENT_W, 3, 0, 0, 7); ctx.fill(); }
  }
  ctx.restore();
  ctx.beginPath(); for (const q of terrain) (q === terrain[0] ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y));
  ctx.strokeStyle = '#f4faff'; ctx.lineWidth = 1.3; ctx.stroke();
  drawPad(ctx, l);
  drawLandability(ctx, l, terrain);
}
function drawPad(ctx, l) {
  const p = P(), m = l.m, t = l.clock, open = samples(m) >= 1, col = open ? p.green : p.bad, x0 = PAD.x, x1 = PAD.x + PAD.w, y = PAD.y;
  ctx.save();
  ctx.fillStyle = rgba(col, (open ? 0.2 : 0.14) + 0.08 * Math.sin(t * 4)); ctx.fillRect(x0, y - 1, PAD.w, 5);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y - 9); ctx.lineTo(x0, y - 1); ctx.lineTo(x0 + 7, y - 1); ctx.moveTo(x1, y - 9); ctx.lineTo(x1, y - 1); ctx.lineTo(x1 - 7, y - 1); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(PAD.x + PAD.w / 2 - 4, y - 1.5, 8, 2);
  if (!m.menu && !m.result && (l.state !== 'grounded' || !open)) {
    const by = open ? Math.sin(t * 4) * 3 : 0;
    txt(ctx, open ? 'LANDING PAD' : 'PAD LOCKED', PAD.x + PAD.w / 2, y - 44 + by, 8, col, 'center', { w: 700, sp: 1.2 });
    if (open) { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(PAD.x + PAD.w / 2 - 5, y - 32 + by); ctx.lineTo(PAD.x + PAD.w / 2 + 5, y - 32 + by); ctx.lineTo(PAD.x + PAD.w / 2, y - 25 + by); ctx.closePath(); ctx.fill(); }
    else {   // 鍵アイコン
      const kx = PAD.x + PAD.w / 2, ky = y - 28; ctx.strokeStyle = col; ctx.lineWidth = 1.6; rr(ctx, kx - 5, ky, 10, 8, 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(kx, ky, 3.4, Math.PI, 0); ctx.stroke();
    }
  }
  ctx.restore();
}

// 噴気（地形の後・機体の前）。柱 = ぼんやりした柱状グラデーション + 上へ広がる粒の連なり。前触れ = 霜が舞う
function onDrawMid(ctx, l) {
  const m = l.m, hp = l.params.hp, t = l.clock;
  VENTS.forEach((v, i) => {
    const st = m.vs[i]; if (!st) { frostIdle(ctx, v, t, 0.15); return; }
    if (st.tele > 0) frostIdle(ctx, v, t, 0.15 + 0.85 * st.tele);
    else if (st.a < 0) frostIdle(ctx, v, t, 0.12);
    if (st.a < 0) return;
    const hf = ease(Math.min(1, st.a / RISE)), top = hp * hf, env = st.env, N = 34;
    // 柱の発光（口が明るく、頂上へ薄く）
    const g = ctx.createLinearGradient(0, v.y, 0, v.y - top); g.addColorStop(0, rgba('#e8f6ff', 0.5 * env)); g.addColorStop(1, rgba('#bfe0ff', 0.04 * env));
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(v.x - plumeHalf(0), v.y); ctx.lineTo(v.x - plumeHalf(hf), v.y - top); ctx.lineTo(v.x + plumeHalf(hf), v.y - top); ctx.lineTo(v.x + plumeHalf(0), v.y); ctx.closePath(); ctx.fill();
    for (let k = 0; k < N; k++) {   // 粒
      const q = (k + 0.5) / N, h = q * top, ph = (t * 1.4 + k * 0.37) % 1, sway = Math.sin(t * 3 + k * 1.7 + i) * (2 + 8 * q);
      const r = 5 + 11 * q + 2 * Math.sin(t * 4 + k), a = 0.5 * env * (1 - 0.55 * q) * (0.65 + 0.35 * ph);
      ctx.fillStyle = rgba(k % 3 ? '#f2f9ff' : '#cfe6ff', a); ctx.beginPath(); ctx.arc(v.x + sway, v.y - h, r, 0, 7); ctx.fill();
    }
    for (let k = 0; k < 14; k++) {   // 氷の粒（上へ飛ぶ）
      const ph = (t * (0.7 + (k % 3) * 0.25) + k * 0.31) % 1, h = ph * top, x = v.x + Math.sin(k * 12.9 + i) * plumeHalf(ph) * 0.9;
      ctx.fillStyle = rgba('#ffffff', 0.8 * env * (1 - ph)); ctx.fillRect(x, v.y - h, 1.4, 1.4);
    }
    // 試料（頂上付近）
    if (st.a >= RISE && !m.got[i]) drawSample(ctx, samplePos(i, t), t, st);
  });
}
function frostIdle(ctx, v, t, k) {   // 噴出口から霜がふわっと立ちのぼる（前触れで濃く・大きく）
  for (let j = 0; j < 12; j++) {
    const ph = (t * (0.5 + 0.9 * k) + j / 12) % 1, h = ph * (14 + 40 * k), x = v.x + Math.sin(j * 5.1 + t * 2) * (3 + 8 * ph * k);
    ctx.fillStyle = rgba('#f4faff', 0.5 * k * (1 - ph)); ctx.beginPath(); ctx.arc(x, v.y - 2 - h, 1.2 + 2.6 * ph * k + 0.6, 0, 7); ctx.fill();
  }
}
function drawSample(ctx, p, t, st) {
  const blink = st.a > ERUPT_S - 0.6 ? 0.5 + 0.5 * Math.sin(t * 24) : 1, pulse = 0.7 + 0.3 * Math.sin(t * 6);
  ctx.save(); ctx.globalAlpha = blink;
  const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, 17 + 3 * pulse); g.addColorStop(0, 'rgba(210,255,248,0.95)'); g.addColorStop(0.35, 'rgba(120,240,222,0.5)'); g.addColorStop(1, 'rgba(120,240,222,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, 17 + 3 * pulse, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, 7); ctx.fill();
  ctx.strokeStyle = '#63D8C9'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(p.x, p.y, SAMPLE_R * 0.6 + pulse, 0, 7); ctx.stroke();
  ctx.restore();
}

function onDrawFront(ctx, l) {
  const p = P(), m = l.m, s = l.ship;
  if (m.menu) { sh.drawMenu(ctx, l); return; }
  const n = samples(m);
  sh.drawCorner(ctx, l, { time: m.started ? (m.result === 'win' ? m.final.t : m.flyT) : null, check: 'SAMPLES ' + m.got.map((g) => (g ? '●' : '○')).join('') + '   PAD ' + (m.result === 'win' ? '✓' : n ? '○' : '✕'), checkOk: n >= 1 });
  // ヒント
  if (!m.result) {
    let hint = '', bad = false;
    if (m.waiting || m.relT < 9) hint = 'FLY THROUGH THE PLUMES · GRAB A SAMPLE · LAND ON THE PAD';
    else if (l.state === 'grounded' && l.padAt(s.x) && n < 1) { hint = 'PAD LOCKED · GRAB A SAMPLE FIRST · THRUST TO LIFT OFF'; bad = true; }
    else if (l.state === 'grounded' && !l.padAt(s.x)) hint = 'OFF PAD · THRUST TO LIFT OFF';
    else if (n < 1) hint = 'GRAB A GLOWING SAMPLE AT A PLUME TOP';
    else if (n < 3) hint = 'LAND ON THE PAD  ·  OR GRAB MORE FOR ★2';
    else hint = 'ALL 3 SAMPLES · LAND ON THE PAD';
    sh.drawHint(ctx, hint, bad);
  }
  if (m.inPlume > 0.05 && !m.result) txt(ctx, 'PLUME', s.x, s.y - 30, 7.5, '#bfe6ff', 'center', { w: 700, sp: 1.2, a: 0.5 + 0.5 * m.inPlume });
  if (m.bumpT > 0 && !m.result) txt(ctx, 'BUMP', s.x, s.y - 30 - (0.9 - m.bumpT) * 14, 10, p.warn, 'center', { w: 800, sp: 1.5, a: Math.min(1, m.bumpT * 2) });
  if (m.waiting && !m.result) txt(ctx, 'TAP TO START', 180, 236, 13, p.green, 'center', { w: 800, sp: 2, a: 0.55 + 0.45 * Math.sin(l.clock * 4.5) });
  if (m.toastT > 0 && !m.waiting) txt(ctx, m.toast, 180, 236, 10, m.lockedT > 0 ? p.bad : p.green, 'center', { w: 700, sp: 1.2, a: Math.min(1, m.toastT) });
  if (!m.result && s.fuel <= 0.0001) txt(ctx, 'OUT OF FUEL  ' + Math.max(0, STRAND_S - m.strandT).toFixed(1), 180, 256, 11, p.bad, 'center', { w: 800, sp: 1.2 });
  if (!m.result && m.started) {
    const e = Math.min(s.x - OUT.x0, OUT.x1 - s.x, s.y - OUT.y0), danger = e < 46 && ((s.x < 40 && s.vx < 2) || (s.x > 320 && s.vx > -2) || (s.y < 30 && s.vy < 4));
    if (danger) { ctx.fillStyle = rgba(p.bad, 0.1 + 0.08 * Math.sin(l.clock * 12)); ctx.fillRect(0, 0, W, 540); txt(ctx, 'OUT OF RANGE', 180, 276, 10, p.bad, 'center', { w: 800, sp: 1.5 }); }
  }
  if (m.result) {
    const f = m.final;
    sh.drawResult(ctx, l, { rows: m.result === 'win' ? [[true, 'SAMPLE LANDED', mmss(f.t)], [f.s2, 'ALL 3 SAMPLES', f.n + ' / 3'], [f.s3, 'PERFECT PAD LANDING', f.grade || '-']] : [], failNote: samples(m) ? samples(m) + ' sample(s) collected · lost.' : 'No sample collected yet.', failTime: m.flyT });
  }
}

sh.addResetButton();
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=04cb132cc2').then((mod) => mod.install(lab));
window.__score = { mult: sh.lifeMult, timeBonus: sh.timeBonus, KEY_B: sh.KEY_B, KEY_T: sh.KEY_T };
window.__flow = { sess, begin: (mode, opt) => begin(lab, mode, opt), tap: (x, y) => onTap(lab, x, y), BTN: sh.BTN, LIFE_LOST_S };
window.__geyser = { VENTS, PAD, ventAt, samplePos, ERUPT_S, RISE, PEAK, FADE, TELE_S, SAMPLE_R, VENT_W, HP, plumeHalf, F_TOP };
lab.start();
