// EXPEDITION #3 RYUGU TOUCH-AND-GO（試作）。仕様: 01_docs/EXPEDITION_MISSIONS.md
// 左上の母艦に係留した状態で開始 → タップで切り離し（右下へ流れながら降りる）。ほぼ無重力。岩の間の目標円に 8 px/s 以下でそっと触れると自動で採取（弾丸発射の演出）→ 小さく弾んでほぼ静止（自動）→
// LIFT OFF の合図から 9 秒以内に安全高度の線（104px 上）より上へ → CLEAR、母艦まで自動で帰還してから結果。
// 接触の規則は一つ:「8 px/s 以下ならどこに触れても壊れない」（目標円 = 採取 / 岩 = 押し返される / 平地 = 接地）。
// 共通部分（メニュー・ライフ・スコア・★・結果）は 00_harness/shell.js。
import { createLab, W, H, C, footSlopeDeg } from '../00_harness/harness.js?v=b436b67e4f';
import { txt, rgba, rr } from '../../../02_src/art.js?v=0f569522c3';
import { P } from '../../../02_src/core/palette.js?v=a36de9d9c3';
import { createShell, LIFE_LOST_S, mmss } from '../00_harness/shell.js?v=8c171d55ee';

const sh = createShell({ id: 'touch_and_go', expLabel: 'EXPEDITION 03', title: 'RYUGU TOUCH-AND-GO',
  brief: { title: 'RYUGU — TOUCH-AND-GO', sub: 'タッチ・アンド・ゴー', goals: ['・タップで母艦から切り離す', '・着陸ではない。目標の円にそっと触れる', '　（8 px/s 以下）と自動で採取して止まる', '・LIFT OFF の合図で点線の上へ'], stars: ['クリア', '円の中心に触れる', 'PERFECT タッチ（3 以下・直立）'], tip: 'コツ：進む向きと逆に機首を向けて噴くと止まる' } });
const sess = sh.sess;
const STRAND_S = 2.0;
const OUT = { x0: -10, x1: 370, y0: -30 };
const GY = 524;                               // 地表の基準高さ（目標の空き地はこの高さで平ら）
const TGT = { x: 187, r: 18, c: 5 };          // 目標円: 中心 x / 触れて採取できる半径 / ★2 の中心半径
const CLEAR = { x0: 163, x1: 211 };           // 目標の空き地（平ら）
const TOUCH_TILT = 20;                        // 採取できる傾きの上限（サンプラーの筒が地面に向く）
const PERFECT = { sp: 3, ang: 5, om: 6 };     // ★3
const REBOUND = 14;                           // 採取の瞬間の上向き速度（小さく弾む。すぐ自動で止まる）
const SETTLE = { s: 0.9, free: 0.3, k: 6 };   // 採取後の自動静止: 合計秒 / 最初は減衰なし（弾みが見える）/ 減衰の速さ。この間は操作なし
const HOME = { s: 3.0, fly0: 0.4, fly1: 2.4 }; // 線を越えた後の自動帰還の演出（秒）: 機体が母艦へ飛んで収容 → 結果
const MS = { x: 72, y: 150 };                 // 母艦（左上に停泊。開始時はこの下に係留、最後はここへ自動で帰還）
const ENTRY = { x: MS.x, y: MS.y + 22, vx: 8, vy: 16 };   // 切り離しの位置と初速: 右下へ流れながら降りる（横の流れを止めるのが課題）
const RELEASE_LOCK = 0.6;                     // 切り離し直後の操作できない秒数（母艦から離れる間）
// 岩（半円に近いこぶ。側面は急 = 傾斜 >10°）。x, 半径 r, 高さ h
const ROCKS = [
  { x: 22, r: 24, h: 28 }, { x: 104, r: 30, h: 44 }, { x: 141, r: 12, h: 15 },
  { x: 252, r: 36, h: 62 }, { x: 301, r: 13, h: 15 }, { x: 340, r: 24, h: 30 },
];

// ---- 地形 ----------------------------------------------------------------------------------------
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const baseY = (x) => GY + 3 * Math.sin(x * 0.05 + 1.1) + 1.5 * Math.sin(x * 0.13 + 0.4);
function terrainFn(x) {
  let y = baseY(x);
  const wc = Math.min(sstep(CLEAR.x0 - 12, CLEAR.x0, x), 1 - sstep(CLEAR.x1, CLEAR.x1 + 12, x));
  y += (GY - y) * wc;
  for (const r of ROCKS) { const d = (x - r.x) / r.r; if (Math.abs(d) < 1) y = Math.min(y, baseY(x) - r.h * Math.pow(1 - d * d, 0.55)); }
  return y;
}
const terrain = [];
for (let x = 0; x <= W; x += 3) terrain.push({ x, y: terrainFn(x) });

// 装飾（固定乱数）
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * 480, r: 0.4 + rnd() * 0.9, a: 0.25 + rnd() * 0.6 }));
const PEBBLES = Array.from({ length: 90 }, () => { const x = rnd() * W; return { x, dy: 3 + rnd() * 40, r: 0.8 + rnd() * 2.6, s: rnd() }; });

const lab = createLab({
  canvas: document.getElementById('c'),
  title: 'RYUGU TOUCH-AND-GO',
  defaults: { g: 0.03, thrust: 5.2, ang: 28, damp: 0.82, drag: 0, fuel: 100, rcs: 2.5, vec: 1 },
  extraParams: [
    { key: 'vtouch', label: 'touch speed limit px/s', min: 4, max: 14, step: 0.5, def: 8 },
    { key: 'leave',  label: 'time to leave s (from LIFT OFF)', min: 3, max: 14, step: 0.5, def: 9 },
    { key: 'alt',    label: 'safe altitude px',       min: 30, max: 160, step: 2, def: 104 },
  ],
  world: { terrain, pads: [] },
  start, onUpdate, onTouchdown, onLiftoff, onCrash, onTap, forces,
  onDrawBack, onDrawMid, onDrawFront, drawTerrain, hud: false,
  telemetryExtra: (l) => `sampled ${l.m.sampled ? 'yes' : 'no'}  leave ${l.m.sampled ? l.m.leaveT.toFixed(1) : '-'}\ntouch  ${l.m.touch ? l.m.touch.sp.toFixed(1) + ' px/s dx ' + l.m.touch.dx.toFixed(1) : '-'}\nbumps  ${l.m.bumps}`,
});
const LINE_Y = () => GY - lab.params.alt;   // 安全高度の線（足元がこれより上で離脱完了）
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;
const speedOf = (s) => Math.hypot(s.vx, s.vy);

// ---------------------------------------------------------------- 状態
function start(l) {
  sh.onStart(l.m);
  l.resetShip({ x: ENTRY.x, y: ENTRY.y, vx: 0, vy: 0, angle: 0 });
  l.frozen = true; l.controlsEnabled = false;   // 開始待ち
  l.m = { menu: sess.mode === 'menu', waiting: true, started: false, flyT: 0, relT: 0, sampled: false, relLock: 0, phase: null, settleT: 0, homeT: 0, promptT: 0, home0: null, touch: null, leaveT: 0, touchX: TGT.x,
    strandT: 0, result: null, resultT: 0, final: null, failed: false, lifeLost: false, toast: '', toastT: 0, toastBad: false, bumpT: 0, shakeT: 0, shotT: 0, bumps: 0, noSampleT: 0 };
  if (l.m.menu) l.hideShip = true;
}
const begin = (l, mode, opt) => sh.begin(l, mode, opt);
const toast = (l, s, sec = 2, bad = false) => { l.m.toast = s; l.m.toastT = sec; l.m.toastBad = bad; };
function go(l) {   // 係留 → 切り離し: 右下へ流れながら降りる。少しの間は操作できない
  const m = l.m; if (!m.waiting || m.menu || m.result) return;
  m.waiting = false; m.started = true; m.relLock = RELEASE_LOCK; l.frozen = false; l.controlsEnabled = false; l.ship.vx = ENTRY.vx; l.ship.vy = ENTRY.vy; toast(l, 'RELEASED', 1.4); audioWake();
}
function onTap(l, x, y) {
  const m = l.m;
  if (m.menu || sess.brief) { sh.tap(l, x, y); return; }
  if (m.waiting) { go(l); return; }
  sh.tap(l, x, y);
}
window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'ArrowUp') && lab.m && lab.m.waiting && !lab.m.menu && !e.repeat) { go(lab); e.preventDefault(); } }, true);
sh.hookR(lab, (m) => m.started, (l, r, d) => { if (l.m.phase !== 'home') l.crash(r, d); });   // 帰還演出中の R は無視（クリア済み）

function onTouchdown(l, info) { if (l.m.result) return; }   // 平地への接地（採取なし・失敗でもない。推力で離陸）
function onLiftoff() {}
function onCrash(l, reason, detail) {
  const m = l.m; if (m.result) return;
  m.result = 'lose'; m.resultT = 0; m.reason = reason; m.detail = detail; l.controlsEnabled = false; sh.onLoss(m);
}
function clearLine(l) {   // 線を越えた = クリア確定（時間・燃料はここで決まる）→ 自動帰還の演出へ
  const m = l.m, s = l.ship; if (m.result || m.phase === 'home') return;
  const fp = l.fuelPct(), t = m.touch;
  m.final = { t: m.flyT, base: 1000 + Math.round(fp) * 10 + (t.perfect ? 300 : 100), fuel: fp, sp: t.sp, dx: t.dx, s2: t.center, s3: t.perfect, leaveT: m.leaveT };
  m.phase = 'home'; m.homeT = 0; m.home0 = { x: s.x, y: s.y, a: s.angle }; l.frozen = true; l.controlsEnabled = false;
  chime();
}
function win(l) {   // 帰還の演出が終わったら結果
  const m = l.m; if (m.result) return;
  m.result = 'win'; m.resultT = 0; l.frozen = true; l.controlsEnabled = false; l.hideShip = true;
  sh.complete(m.final, [true, m.final.s2, m.final.s3]);
}
const easeIO = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
function updateHome(l, dt) {   // 機体が機首を母艦へ向けて飛び、母艦の下に収容
  const m = l.m, s = l.ship, h = m.home0; m.homeT += dt;
  const k = Math.max(0, Math.min(1, (m.homeT - HOME.fly0) / (HOME.fly1 - HOME.fly0))), e = easeIO(k), ty = MS.y + 20;
  s.x = h.x + (MS.x - h.x) * e; s.y = h.y + (ty - h.y) * e;
  const aim = Math.atan2(MS.x - s.x, -(ty - s.y + 1e-6)) * 180 / Math.PI * (1 - e);   // 進む向きへ機首、最後は直立
  s.angle = h.a + (aim - h.a) * Math.min(1, m.homeT / 0.5);
  l.thr = { main: k > 0 && k < 0.92, left: false, right: false };
  if (m.homeT >= HOME.fly1) l.hideShip = true;
  if (m.homeT >= HOME.s) win(l);
}

// ---------------------------------------------------------------- 接触（物理サブステップごと。harness の着地判定より先に、次の位置で接地するかを見る）
function forces(l, dt) {
  const m = l.m, s = l.ship, pr = l.params; if (!m.started || m.result) return;
  if (m.phase === 'settle') {   // 採取後の自動静止: 弾んだあと速度・回転・傾きを消して、その場にほぼ止まる（重力も打ち消す）
    s.vy -= pr.g * dt;
    if (m.settleT >= SETTLE.free) { const k = Math.exp(-SETTLE.k * dt); s.vx *= k; s.vy *= k; s.omega *= k; s.angle *= Math.exp(-5 * dt); }
  }
  const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, ty = l.terrainY(nx);
  if (ny + C.LEG_Y + 0.05 < ty) return;
  const sp = speedOf(s), tilt = Math.abs(wrap180(s.angle)), om = Math.abs(s.omega), dx = s.x - TGT.x;
  if (Math.abs(dx) <= TGT.r) {   // 目標円（平ら）
    if (!m.sampled && sp <= pr.vtouch && tilt <= TOUCH_TILT) return touchSample(l, { sp, tilt, om, dx });
    const B = C.BOUNCE;
    if (sp <= pr.vtouch || (Math.abs(s.vy) <= B.vy && Math.abs(s.vx) <= B.vx && tilt <= B.ang && om <= B.om)) {   // 速すぎ・傾きすぎ・採取済み: 跳ね返る（墜落ではない）
      s.vy = -Math.max(3, 0.45 * Math.abs(s.vy)); s.vx *= 0.6; s.omega += (dx >= 0 ? 1 : -1) * 6; s.y = Math.min(s.y, GY - C.LEG_Y - 0.5);
      m.bumpT = 0.9; m.shakeT = 0.18; m.bumps++; clang(0.35);
      if (!m.sampled) { m.noSampleT = 2.2; toast(l, sp > pr.vtouch ? 'TOO FAST · NO SAMPLE (' + sp.toFixed(0) + ' > ' + pr.vtouch + ')' : 'TILTED · NO SAMPLE', 2.2, true); }
    }
    return;   // それ以上は harness の判定（HARD IMPACT / TIPPED OVER）
  }
  if (footSlopeDeg(terrain, nx) > C.LAND_SLOPE_DEG && sp <= pr.vtouch) rockBump(l, nx);   // 岩にそっと触れた: 押し返す。速ければ harness で墜落（STEEP GROUND など）
}
function touchSample(l, t) {
  const m = l.m, s = l.ship;
  t.center = Math.abs(t.dx) <= TGT.c; t.perfect = t.sp <= PERFECT.sp && t.tilt <= PERFECT.ang && t.om <= PERFECT.om;
  m.sampled = true; m.touch = t; m.leaveT = 0; m.touchX = s.x; m.shotT = 1; m.phase = 'settle'; m.settleT = 0;
  s.vy = -REBOUND; s.vx *= 0.3; s.omega *= 0.5; s.y = Math.min(s.y, GY - C.LEG_Y - 0.5);
  l.controlsEnabled = false;   // 静止するまで自動（合図の前に噴いても効かない）
  l.burst(s.x, GY - 1, 26, '#8d8378'); l.burst(s.x, GY - 2, 8, '#FFE9A8');
  toast(l, 'SAMPLE ACQUIRED', 1.0); shot();
}
function rockBump(l, nx) {
  const m = l.m, s = l.ship, ty = l.terrainY;
  const k = (ty(nx + 2) - ty(nx - 2)) / 4, n = Math.hypot(k, 1), ex = k / n, ey = -1 / n;   // 外向きの法線（上向き側）
  const vn = s.vx * ex + s.vy * ey;
  if (vn < 0) { s.vx -= 1.5 * vn * ex; s.vy -= 1.5 * vn * ey; }
  const out = s.vx * ex + s.vy * ey; if (out < 3) { s.vx += (3 - out) * ex; s.vy += (3 - out) * ey; }
  s.omega += (ex >= 0 ? 1 : -1) * 8; s.y = Math.min(s.y, ty(s.x) - C.LEG_Y - 0.3);
  m.bumpT = 0.9; m.shakeT = 0.2; m.bumps++; clang(0.4);
}

// ---------------------------------------------------------------- 毎フレーム
function onUpdate(l, dt) {
  const m = l.m, s = l.ship, pr = l.params;
  if (m.menu) return;
  if (m.toastT > 0) m.toastT -= dt;
  if (m.noSampleT > 0) m.noSampleT -= dt;
  if (m.shotT > 0) m.shotT -= dt * 1.6;
  m.relT += dt;
  if (m.waiting) return;
  if (!m.result && m.phase !== 'home') m.flyT += dt;
  if (m.phase === 'home' && !m.result) { updateHome(l, dt); return; }
  if (m.result) {
    m.resultT += dt;
    if (m.lifeLost && m.resultT >= LIFE_LOST_S) l.reset();
    return;
  }
  if (s.x < OUT.x0 || s.x > OUT.x1 || s.y < OUT.y0) return l.crash('LEFT THE AREA', 'You drifted out of range');
  if (s.fuel <= 0.0001) { m.strandT += dt; if (m.strandT >= STRAND_S) return l.crash('STRANDED', 'Out of fuel'); } else m.strandT = 0;
  if (m.relLock > 0) { m.relLock -= dt; if (m.relLock <= 0 && !m.phase) l.controlsEnabled = true; }
  if (m.phase === 'settle') {
    m.settleT += dt;
    if (m.settleT >= SETTLE.s) { m.phase = 'leave'; m.promptT = 0; l.controlsEnabled = true; alarm(); }
  } else if (m.phase === 'leave') {
    m.promptT += dt;
    if (s.y + C.LEG_Y <= LINE_Y()) return clearLine(l);
    m.leaveT += dt;
    if (m.leaveT >= pr.leave) return l.crash('CAUGHT IN DEBRIS', 'Climb above the line within ' + pr.leave + ' s of LIFT OFF');
  }
  if (m.bumpT > 0) m.bumpT -= dt;
  if (m.shakeT > 0) m.shakeT -= dt;
  lab.canvas.style.transform = m.shakeT > 0 ? 'translate(' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px,' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px)' : '';
}

// ---------------------------------------------------------------- 音（WebAudio。失敗しても続行。テスト自動操縦中は鳴らさない）
let actx = null;
const audioWake = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* 音なし */ } };
const audioOn = () => actx && !lab.script;
let noiseBuf = null;
function shot() {   // サンプラーの弾丸: 低い「ドン」+ 砂のはじけるノイズ
  if (!audioOn()) return;
  try {
    const t = actx.currentTime;
    const o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.25);
    g.gain.setValueAtTime(0.32, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.36);
    if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
    const src = actx.createBufferSource(); src.buffer = noiseBuf; const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 0.6;
    const g2 = actx.createGain(); g2.gain.setValueAtTime(0.12, t + 0.02); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(f); f.connect(g2); g2.connect(actx.destination); src.start(t + 0.02); src.stop(t + 0.62);
  } catch (e) { /* 音なしでも続行 */ }
}
function alarm() {   // LIFT OFF の合図: 高い短音 3 回
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination); g.gain.value = 0;
    for (let i = 0; i < 3; i++) { const t0 = t + i * 0.13; g.gain.setValueAtTime(0.11, t0); g.gain.setValueAtTime(0, t0 + 0.08); }
    const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = 1046; o.connect(g); o.start(t); o.stop(t + 0.4);
  } catch (e) { /* 音なしでも続行 */ }
}
function chime() {
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.14, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    [784, 1175, 1568].forEach((fr, i) => { const o = actx.createOscillator(); o.type = 'sine'; o.frequency.value = fr; o.connect(g); o.start(t + i * 0.08); o.stop(t + 0.95); });
  } catch (e) { /* 音なしでも続行 */ }
}
function clang(k) {
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    g.gain.setValueAtTime(0.08 + 0.1 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    for (const f of [190, 310]) { const o = actx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.27); }
  } catch (e) { /* 音なしでも続行 */ }
}

// ---------------------------------------------------------------- 描画
function onDrawBack(ctx) {
  const g = ctx.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, '#010207'); g.addColorStop(1, '#0b0d16');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of STARS) { ctx.fillStyle = rgba('#ffffff', s.a); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  const sun = ctx.createRadialGradient(28, 60, 2, 28, 60, 120); sun.addColorStop(0, 'rgba(255,244,214,0.9)'); sun.addColorStop(0.08, 'rgba(255,230,180,0.35)'); sun.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = sun; ctx.fillRect(0, 0, 160, 190);
  ctx.fillStyle = '#7fb4ff'; ctx.beginPath(); ctx.arc(300, 150, 1.8, 0, 7); ctx.fill();   // 地球（遠い青い点）
  txt(ctx, 'EARTH', 306, 146, 6, '#7fb4ff', 'left', { w: 600, sp: 1, a: 0.55 });
}

// 地形: 暗い炭色の礫だらけの地表（Ryugu は太陽系で最も暗い部類）+ 岩の陰影 + 小石
function drawTerrain(ctx, l) {
  ctx.beginPath(); ctx.moveTo(0, H);
  for (const q of terrain) ctx.lineTo(q.x, q.y);
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 450, 0, 600); g.addColorStop(0, '#5a524b'); g.addColorStop(0.35, '#3a3531'); g.addColorStop(1, '#1c1a18');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (const r of ROCKS) {   // 岩のハイライト（左上から日が当たる）と影
    const top = baseY(r.x) - r.h;
    const hg = ctx.createRadialGradient(r.x - r.r * 0.35, top + r.h * 0.3, 1, r.x - r.r * 0.2, top + r.h * 0.5, r.r * 1.1);
    hg.addColorStop(0, 'rgba(170,158,144,0.55)'); hg.addColorStop(1, 'rgba(60,54,48,0)');
    ctx.fillStyle = hg; ctx.fillRect(r.x - r.r, top - 2, r.r * 2, r.h + 6);
    ctx.strokeStyle = 'rgba(20,18,16,0.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(r.x - r.r * 0.3, top + r.h * 0.35); ctx.lineTo(r.x + r.r * 0.1, top + r.h * 0.55); ctx.lineTo(r.x + r.r * 0.05, top + r.h * 0.8); ctx.stroke();
  }
  for (const p of PEBBLES) {
    const y = terrainFn(p.x) + p.dy; ctx.fillStyle = p.s > 0.5 ? 'rgba(120,110,100,0.5)' : 'rgba(18,16,14,0.55)';
    ctx.beginPath(); ctx.ellipse(p.x, y, p.r, p.r * 0.65, 0, 0, 7); ctx.fill();
  }
  ctx.restore();
  ctx.beginPath(); for (const q of terrain) (q === terrain[0] ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y));
  ctx.strokeStyle = '#a69a8c'; ctx.lineWidth = 1.2; ctx.stroke();
  drawTarget(ctx, l);
  drawFootMarker(ctx, l);
}
// 足元の傾斜マーカー（shell の drawLandability と同じ。ただし目標円の中は常に青緑 = 触れてよい場所）
function drawFootMarker(ctx, l) {
  const s = l.ship, p = P(), m = l.m; if (!s || l.hideShip || l.state === 'crashed' || m.menu || m.waiting) return;
  const alt = l.terrainY(s.x) - (s.y + C.LEG_Y), a = Math.max(0, Math.min(1, (130 - alt) / 90)) * 0.85; if (a <= 0.02) return;
  ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'butt';
  for (let x = Math.max(0, Math.floor((s.x - 42) / 6) * 6); x < Math.min(W, s.x + 42); x += 6) {
    const xc = x + 3, inT = Math.abs(xc - TGT.x) <= TGT.r, sl = footSlopeDeg(terrain, xc), col = inT || sl <= 5 ? '#63D8C9' : sl <= C.LAND_SLOPE_DEG ? p.warn : p.bad;
    ctx.globalAlpha = a * (1 - Math.min(1, Math.abs(xc - s.x) / 48) * 0.7); ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(x, l.terrainY(x) + 1.5); ctx.lineTo(x + 6.2, l.terrainY(x + 6) + 1.5); ctx.stroke();
  }
  ctx.restore();
}
function drawTarget(ctx, l) {
  const p = P(), m = l.m, t = l.clock, col = m.sampled ? p.dim : '#63D8C9';
  ctx.save();
  if (!m.sampled && !m.menu) {   // 目標への縦の案内（うっすら）
    const bg = ctx.createLinearGradient(0, GY, 0, GY - 200); bg.addColorStop(0, rgba('#63D8C9', 0.12)); bg.addColorStop(1, rgba('#63D8C9', 0));
    ctx.fillStyle = bg; ctx.fillRect(TGT.x - TGT.r, GY - 200, TGT.r * 2, 200);
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(TGT.x, GY + 1, TGT.r, 4.5, 0, 0, 7); ctx.stroke();
  ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(TGT.x, GY + 1, TGT.c, 1.6, 0, 0, 7); ctx.stroke();
  if (!m.sampled) { ctx.globalAlpha = 0.25 + 0.2 * Math.sin(t * 4); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(TGT.x, GY + 1, TGT.r, 4.5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  // ターゲットマーカー（白い小球。目標の横に置かれている）
  const mx = TGT.x + TGT.r + 5, mg = ctx.createRadialGradient(mx - 1, GY - 4, 0.5, mx, GY - 3, 7);
  mg.addColorStop(0, 'rgba(255,255,255,1)'); mg.addColorStop(0.4, 'rgba(230,240,255,0.7)'); mg.addColorStop(1, 'rgba(200,230,255,0)');
  ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(mx, GY - 3, 7, 0, 7); ctx.fill();
  if (m.sampled) {   // 採取痕（小さなくぼみ）
    ctx.fillStyle = 'rgba(10,9,8,0.8)'; ctx.beginPath(); ctx.ellipse(m.touchX, GY + 1, 4, 1.4, 0, 0, 7); ctx.fill();
  }
  if (!m.menu && !m.result && !m.sampled) {
    const by = Math.sin(t * 4) * 3, s = l.ship, near = Math.abs(s.x - TGT.x) < 60 && s.y > GY - 110 && !l.hideShip;   // 機体が近いと文字を薄く（機体と重ならない）
    ctx.globalAlpha = near ? 0.25 : 1;
    txt(ctx, 'TARGET  ≤ ' + l.params.vtouch + ' px/s', TGT.x, GY - 50 + by, 8, col, 'center', { w: 700, sp: 1.2 });
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(TGT.x - 5, GY - 37 + by); ctx.lineTo(TGT.x + 5, GY - 37 + by); ctx.lineTo(TGT.x, GY - 30 + by); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// 安全高度の線 + 採取後の砂ぼこり（離脱の制限時間で線まで昇る = 残り時間が目で分かる）
function onDrawMid(ctx, l) {
  const p = P(), m = l.m, t = l.clock, ly = LINE_Y(), pr = l.params;
  if (m.menu) return;
  drawMothership(ctx, l);
  if (m.sampled) {
    const k = Math.min(1, m.leaveT / pr.leave), top = GY - (GY - ly) * k, cx = m.touchX, fade = m.phase === 'home' ? Math.max(0, 1 - m.homeT) : m.result === 'win' ? 0 : 1;
    for (let i = 0; i < 26; i++) {
      const q = i / 25, y = GY - (GY - top) * q, r = 8 + 26 * q * (0.4 + 0.6 * k) + 3 * Math.sin(t * 3 + i);
      ctx.fillStyle = rgba(i % 3 ? '#6f665d' : '#8d8378', 0.22 * (1 - 0.4 * q) * fade);
      ctx.beginPath(); ctx.arc(cx + Math.sin(i * 2.3 + t) * (6 + 14 * q), y, r, 0, 7); ctx.fill();
    }
  }
  // 線 = ゴール。採取後は線の上に緑の帯（ここまで上がる）。越えた瞬間に白く光る
  const hot = (m.phase === 'settle' || m.phase === 'leave') && !m.result, done = m.phase === 'home';
  if (hot) {
    const bg = ctx.createLinearGradient(0, ly, 0, ly - 34); bg.addColorStop(0, rgba(p.green, 0.28 + 0.1 * Math.sin(t * 6))); bg.addColorStop(1, rgba(p.green, 0));
    ctx.fillStyle = bg; ctx.fillRect(0, ly - 34, W, 34);
  }
  if (done && m.homeT < 0.6) { ctx.fillStyle = rgba('#ffffff', 0.35 * (1 - m.homeT / 0.6)); ctx.fillRect(0, ly - 3, W, 6); }
  const a = hot ? 0.95 : done ? Math.max(0.32, 1 - m.homeT) : 0.32, lc = hot || done ? p.green : p.fg;
  ctx.save(); ctx.setLineDash([5, 5]); ctx.strokeStyle = rgba(lc, a); ctx.lineWidth = hot ? 1.8 : 1;
  ctx.beginPath(); ctx.moveTo(0, ly); ctx.lineTo(W, ly); ctx.stroke(); ctx.restore();
  if (hot) txt(ctx, 'GOAL ↑ CLIMB ABOVE THIS LINE', 8, ly - 11, 7, p.green, 'left', { w: 800, sp: 1.1 });
  else txt(ctx, 'SAFE ALTITUDE · GOAL', 8, ly - 11, 6.5, done ? p.green : p.dim, 'left', { w: 700, sp: 1.2, a: done ? 1 : 0.7 });
}

// 母艦（左上に停泊。開始時は機体を下に係留、最後は収容する）
function drawMothership(ctx, l) {
  const m = l.m, p = P(), t = l.clock, y = MS.y;
  ctx.save(); ctx.translate(MS.x, y);
  for (const sx of [-1, 1]) {   // 太陽電池パネル
    ctx.save(); ctx.translate(sx * 46, -2);
    rr(ctx, -15, -5, 30, 10, 1.8); ctx.fillStyle = '#27407a'; ctx.fill(); ctx.strokeStyle = '#9fb4e8'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = 'rgba(190,210,255,0.4)'; ctx.beginPath(); for (let i = -7.5; i <= 7.5; i += 7.5) { ctx.moveTo(i, -5); ctx.lineTo(i, 5); } ctx.stroke();
    ctx.restore();
  }
  ctx.strokeStyle = '#8d93a6'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-31, -2); ctx.lineTo(31, -2); ctx.stroke();
  rr(ctx, -30, -11, 60, 22, 9);
  const hg = ctx.createLinearGradient(0, -11, 0, 11); hg.addColorStop(0, '#FBF7EC'); hg.addColorStop(0.6, '#E2DAC6'); hg.addColorStop(1, '#BDB5A0');
  ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = 'rgba(20,24,34,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = rgba(p.warn, 0.85); ctx.fillRect(-16, -11, 5, 22);
  ctx.fillStyle = '#16314a'; rr(ctx, 4, -6, 20, 10, 5); ctx.fill();
  ctx.fillStyle = '#9ee8ff'; ctx.beginPath(); ctx.arc(10, -1, 2, 0, 7); ctx.arc(18, -1, 2, 0, 7); ctx.fill();
  // 収容口（下）: 機体が近づくと光る
  const near = (m.phase === 'home' && m.homeT > HOME.fly0 + 1.2) || m.waiting;
  ctx.fillStyle = near ? rgba(p.green, 0.6 + 0.4 * Math.sin(t * 12)) : rgba(p.fg, 0.35); ctx.fillRect(-9, 10, 18, 3);
  if (m.phase === 'home' && m.homeT >= HOME.fly1) {   // 収容の閃光
    const k = Math.min(1, (m.homeT - HOME.fly1) / 0.5), fg = ctx.createRadialGradient(0, 12, 1, 0, 12, 50);
    fg.addColorStop(0, rgba('#ffffff', 0.9 * (1 - k))); fg.addColorStop(1, rgba('#ffffff', 0)); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(0, 12, 50, 0, 7); ctx.fill();
  }
  ctx.restore();
}

// HUD（左上）: 燃料 + SPEED（合成速度。≤vtouch で緑）/ TILT（≤20 で緑）/ SPIN / ALT
function drawHud(ctx, l) {
  const s = l.ship, p = P(), fp = Math.max(0, l.fuelPct()), x = 12, y = 12, vt = l.params.vtouch;
  txt(ctx, 'FUEL', x, y, 7, p.dim, 'left', { w: 600, sp: 1.2 });
  ctx.fillStyle = rgba(p.fg, 0.12); ctx.fillRect(x + 28, y + 2, 84, 5);
  ctx.fillStyle = fp < 20 ? p.bad : p.warn; ctx.fillRect(x + 28, y + 2, 84 * fp / 100, 5);
  txt(ctx, fp.toFixed(0) + '%', x + 118, y, 8, fp < 20 ? p.bad : p.fg, 'left', { w: 600 });
  const sp = speedOf(s), tilt = Math.abs(wrap180(s.angle)), alt = Math.max(0, l.terrainY(s.x) - (s.y + C.LEG_Y));
  const items = [['SPEED', sp, vt, 1], ['TILT', tilt, TOUCH_TILT, 0, '°'], ['SPIN', Math.abs(s.omega), C.SAFE.om, 0], ['ALT', alt, 1e9, 0]];
  items.forEach((it, i) => {
    const bx = x + i * 52, v = it[1], col = i === 3 ? p.fg : v <= it[2] ? p.green : (v <= it[2] * 1.9 ? p.warn : p.bad);
    txt(ctx, it[0], bx, y + 14, 6.5, p.dim, 'left', { w: 600, sp: 1 });
    txt(ctx, v.toFixed(it[3]) + (it[4] || ''), bx, y + 22, 11, col, 'left', { w: 700 });
  });
}

function onDrawFront(ctx, l) {
  const p = P(), m = l.m, s = l.ship;
  if (m.menu) { sh.drawMenu(ctx, l); return; }
  if (m.phase !== 'home' && m.result !== 'win') drawHud(ctx, l);   // 帰還の演出中は計器を隠す（自動操縦の速度は意味がない）
  sh.drawCorner(ctx, l, { time: m.started ? (m.final ? m.final.t : m.flyT) : null, check: 'SAMPLE ' + (m.sampled ? '●' : '○') + '   LEAVE ' + (m.final ? '✓' : '○'), checkOk: m.sampled });
  const sp = speedOf(s), alt = l.terrainY(s.x) - (s.y + C.LEG_Y);
  if (!m.result && m.phase !== 'home') {
    let hint = '', bad = false;
    if (m.phase === 'settle') hint = 'SAMPLING… HOLDING POSITION';
    else if (m.phase === 'leave') { hint = 'THRUST UP · CLIMB ABOVE THE GREEN LINE'; bad = true; }
    else if (m.waiting) hint = 'TAP TO RELEASE FROM THE MOTHERSHIP';
    else if (m.relT < 8) hint = 'NOT A LANDING · TOUCH THE TARGET, THEN LIFT OFF';
    else if (l.state === 'grounded') hint = 'OFF TARGET · THRUST TO LIFT OFF';
    else if (alt < 150 && sp > l.params.vtouch) { hint = 'TOO FAST · SPEED ≤ ' + l.params.vtouch + ' TO SAMPLE'; bad = true; }
    else hint = 'POINT THE NOSE AGAINST YOUR DRIFT AND THRUST TO STOP';
    sh.drawHint(ctx, hint, bad);
  }
  // 機体の下の速度の読み（目標に近いとき）: 触れたらどうなるかが分かる
  if (!m.result && m.started && !m.sampled && l.state === 'play' && alt < 140) {
    const ok = sp <= l.params.vtouch, perf = sp <= PERFECT.sp && Math.abs(wrap180(s.angle)) <= PERFECT.ang;
    const rx = s.x > W - 70 ? s.x - 22 : s.x + 22;   // 機体の横（目標の文字と重ならない）
    txt(ctx, sp.toFixed(1), rx, s.y - 6, 10, perf ? '#FFC94D' : ok ? p.green : p.bad, rx < s.x ? 'right' : 'left', { w: 800, sp: 0.8 });
    if (perf) txt(ctx, 'PERFECT', rx, s.y + 6, 6.5, '#FFC94D', rx < s.x ? 'right' : 'left', { w: 700, sp: 1 });
  }
  // 採取の直後: 大きな合図（中央）+ 機体の上の上向き矢印 + 機体の横の残り秒
  if (m.phase === 'settle' && !m.result) txt(ctx, 'SAMPLE OK', 180, 366, 16, p.green, 'center', { w: 800, sp: 2, a: Math.min(1, m.settleT * 4) });
  if (m.phase === 'leave' && !m.result) {
    const pop = 1 + 0.25 * Math.max(0, 1 - m.promptT / 0.25), blink = m.promptT < 1.5 || Math.sin(l.clock * 9) > -0.3;
    txt(ctx, 'SAMPLE OK', 180, 344, 9, p.green, 'center', { w: 800, sp: 2 });
    if (blink) txt(ctx, 'LIFT OFF!', 180, 368, 22 * pop, p.warn, 'center', { w: 900, sp: 3 });
    for (let i = 0; i < 3; i++) {   // 上向きの山形（下から順に点灯）
      const ph = (l.clock * 2.2 - i * 0.28) % 1, ay = s.y - 26 - i * 9;
      ctx.save(); ctx.globalAlpha = Math.max(0, 1 - ph) * 0.95; ctx.strokeStyle = p.warn; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(s.x - 7, ay + 4); ctx.lineTo(s.x, ay - 3); ctx.lineTo(s.x + 7, ay + 4); ctx.stroke(); ctx.restore();
    }
    const left = Math.max(0, l.params.leave - m.leaveT), rx = s.x > W - 70 ? s.x - 22 : s.x + 22;
    txt(ctx, left.toFixed(1), rx, s.y - 4, 13, left < 2.5 ? p.bad : p.warn, rx < s.x ? 'right' : 'left', { w: 900, sp: 0.8 });
  }
  if (m.phase === 'home' && !m.result) {
    txt(ctx, 'CLEAR!', 250, 290, 20, p.green, 'center', { w: 900, sp: 3, a: Math.min(1, m.homeT * 5) });
    txt(ctx, m.homeT >= HOME.fly1 ? 'SAMPLE SECURED' : 'RETURNING TO MOTHERSHIP…', 250, 314, 8, m.homeT >= HOME.fly1 ? '#FFC94D' : p.fg, 'center', { w: 700, sp: 1.5, a: Math.min(1, m.homeT * 3) });
  }
  if (m.bumpT > 0 && !m.result) txt(ctx, 'BUMP', s.x, s.y - 30 - (0.9 - m.bumpT) * 14, 10, p.warn, 'center', { w: 800, sp: 1.5, a: Math.min(1, m.bumpT * 2) });
  if (m.shotT > 0) {   // 弾丸発射の閃光
    ctx.save(); ctx.globalAlpha = Math.min(1, m.shotT); const fg = ctx.createRadialGradient(m.touchX, GY, 1, m.touchX, GY, 40 * (1.3 - m.shotT * 0.3));
    fg.addColorStop(0, 'rgba(255,240,200,0.95)'); fg.addColorStop(1, 'rgba(255,200,120,0)'); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(m.touchX, GY, 40, 0, 7); ctx.fill(); ctx.restore();
  }
  if (m.waiting && !m.result) txt(ctx, 'TAP TO RELEASE', 180, 236, 13, p.green, 'center', { w: 800, sp: 2, a: 0.55 + 0.45 * Math.sin(l.clock * 4.5) });
  if (m.toastT > 0 && !m.waiting && !m.phase) txt(ctx, m.toast, 180, 236, 10, m.toastBad ? p.bad : p.green, 'center', { w: 700, sp: 1.2, a: Math.min(1, m.toastT) });
  if (!m.result && s.fuel <= 0.0001) txt(ctx, 'OUT OF FUEL  ' + Math.max(0, STRAND_S - m.strandT).toFixed(1), 180, 256, 11, p.bad, 'center', { w: 800, sp: 1.2 });
  if (!m.result && m.started) {
    const e = Math.min(s.x - OUT.x0, OUT.x1 - s.x, s.y - OUT.y0), danger = e < 46 && ((s.x < 40 && s.vx < 2) || (s.x > 320 && s.vx > -2) || (s.y < 30 && s.vy < 4));
    if (danger) { ctx.fillStyle = rgba(p.bad, 0.1 + 0.08 * Math.sin(l.clock * 12)); ctx.fillRect(0, 0, W, 540); txt(ctx, 'OUT OF RANGE', 180, 276, 10, p.bad, 'center', { w: 800, sp: 1.5 }); }
  }
  if (m.result) {
    const f = m.final;
    sh.drawResult(ctx, l, { rows: m.result === 'win' ? [[true, 'TOUCH-AND-GO', mmss(f.t)], [f.s2, 'TARGET CENTER', 'OFFSET ' + Math.abs(f.dx).toFixed(1) + ' px'], [f.s3, 'PERFECT TOUCH', f.sp.toFixed(1) + ' px/s']] : [],
      failNote: m.sampled ? 'Sample taken, but you did not get away.' : 'No sample taken yet.', failTime: m.flyT });
  }
  sh.drawBrief(ctx, l);
}

sh.bindLab(lab);
sh.addResetButton();
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=8f50df4329').then((mod) => mod.install(lab));
window.__score = { mult: sh.lifeMult, timeBonus: sh.timeBonus, KEY_B: sh.KEY_B, KEY_T: sh.KEY_T, KEY_S: sh.KEY_S };
window.__flow = { sess, begin: (mode, opt) => begin(lab, mode, opt), tap: (x, y) => onTap(lab, x, y), BTN: sh.BTN, LIFE_LOST_S };
window.__tag = { GY, TGT, CLEAR, ROCKS, ENTRY, MS, RELEASE_LOCK, REBOUND, SETTLE, HOME, PERFECT, TOUCH_TILT, LINE_Y, terrain, footSlopeDeg };
lab.start();
