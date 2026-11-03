// EXPEDITION #4 67P ANCHOR（試作）。仕様: 01_docs/EXPEDITION_MISSIONS.md
// 彗星の核は二つの塊がくびれでつながった形。ほぼ無重力。タップで開始（右上から左下へ流れながら降りる）。
// 塊の壁の噴出口から周期的にガスが横向きに噴き出して機体を押す（前触れに霜が舞う）。くびれの底の目標に 10 px/s 以下で触れると
// 自動で錨（銛）が刺さって成功。速すぎ・傾きすぎは大きく跳ね返る（実際の着陸機が錨に失敗して跳ねた話の再現）。
// 接触の規則は #3 と同じ:「10 px/s 以下ならどこに触れても壊れない」（目標 = 錨 / 壁・岩 = 押し返される / 平地 = 接地）。
// 共通部分（メニュー・ライフ・スコア・★・結果）は 00_harness/shell.js。
import { createLab, W, H, C, footSlopeDeg } from '../00_harness/harness.js?v=b436b67e4f';
import { txt, rgba } from '../../../02_src/art.js?v=0f569522c3';
import { P } from '../../../02_src/core/palette.js?v=a36de9d9c3';
import { createShell, LIFE_LOST_S, mmss } from '../00_harness/shell.js?v=812922afc6';

const sh = createShell({ id: 'anchor', expLabel: 'EXPEDITION 04', title: 'COMET 67P ANCHOR',
  brief: { title: 'COMET 67P — ANCHOR', sub: '彗星に錨を打つ', goals: ['・二つの塊のくびれの底にある目標へ降りる', '・10 px/s 以下で触れると錨が刺さって成功', '・速すぎると跳ね返る。横からのガスに注意'], stars: ['クリア', '一度も跳ね返らずに錨', 'PERFECT タッチ（3 以下・直立）'], tip: 'コツ：霜が舞うとガスが来る。押されたら逆へ噴く', fact: ['67P はチュリュモフ・ゲラシメンコ彗星の番号。', '2014 年、着陸機フィラエは銛が作動せず、', '跳ねて日陰に止まった。'] } });
const sess = sh.sess;
const OUT = { x0: -10, x1: 370, y0: -30 };
const GY = 524;                               // くびれの底の高さ（目標はここで平ら）
const TGT = { x: 199, r: 20, c: 5 };          // 目標: 中心 x / 錨が刺さる半径 / ★ 中心の半径（記録のみ）
const CLEAR = { x0: 173, x1: 225 };           // 目標の空き地（平ら）
const TOUCH_TILT = 20;                        // 錨が刺さる傾きの上限
const PERFECT = { sp: 3, ang: 5, om: 6 };     // ★3
const ANCHOR_S = 1.8;                         // 錨が刺さってから結果までの演出（秒）
const ENTRY = { x: 284, y: 150, vx: -7, vy: 13 };   // 右上から左下へ流れながら降りる（右上の表示と太陽に重ならない高さ）
const HULL = 13;                              // 機体の半幅（壁との当たり）
// 二つの塊（大きい頭 = 左、小さい体 = 右）。中心 x / 半径 r / 高さ h。断面は丸い（くびれ側の壁はほぼ垂直）
const LOBES = [{ x: -10, r: 165, h: 130 }, { x: 372, r: 128, h: 92 }];
const BOULDERS = [{ x: 163, r: 8, h: 9 }, { x: 236, r: 7, h: 8 }, { x: 74, r: 10, h: 7 }, { x: 318, r: 9, h: 6 }];
// ガスの噴出口（塊の壁。くびれへ向けて横に噴く）。x / 向き / 周期 P / 最初の噴出 O
const JETS = [{ x: 128, dir: 1, P: 10, O: 4.0 }, { x: 268, dir: -1, P: 10, O: 9.0 }];
const JET = { tele: 1.2, rise: 0.3, hold: 1.6, fade: 0.8, len: 150 };   // 前触れ / 立ち上がり / 最大 / 消える（秒）/ 届く長さ px
const JET_S = JET.rise + JET.hold + JET.fade;

// ---- 地形 ----------------------------------------------------------------------------------------
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const baseY = (x) => GY + 1.5 * Math.sin(x * 0.11 + 0.4);
function lobeY(L, x) { const d = (x - L.x) / L.r; return Math.abs(d) < 1 ? GY - L.h * Math.sqrt(1 - d * d) : Infinity; }
const rough = (x) => 2.2 * Math.sin(x * 0.19 + 1.3) + 1.2 * Math.sin(x * 0.47 + 0.2);
function terrainFn(x) {
  let y = baseY(x);
  const wc = Math.min(sstep(CLEAR.x0 - 10, CLEAR.x0, x), 1 - sstep(CLEAR.x1, CLEAR.x1 + 10, x));
  y += (GY - y) * wc;
  for (const L of LOBES) { const ly = lobeY(L, x); if (ly < y) y = Math.min(y, ly + rough(x) * Math.min(1, (GY - ly) / 30)); }
  for (const r of BOULDERS) { const d = (x - r.x) / r.r; if (Math.abs(d) < 1) y = Math.min(y, terrainBase(x) - r.h * Math.pow(1 - d * d, 0.55)); }
  return y;
}
function terrainBase(x) { let y = baseY(x); for (const L of LOBES) y = Math.min(y, lobeY(L, x)); return y; }
const terrain = [];
for (let x = 0; x <= W; x += 2) terrain.push({ x, y: terrainFn(x) });
for (const j of JETS) j.y = terrainFn(j.x) - 2;

// 装飾（固定乱数）
let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * 470, r: 0.4 + rnd() * 0.9, a: 0.25 + rnd() * 0.6 }));
const ICE = Array.from({ length: 70 }, () => { const x = rnd() * W; return { x, dy: 4 + rnd() * 70, r: 0.5 + rnd() * 1.3, a: 0.25 + rnd() * 0.5 }; });
const MOTES = Array.from({ length: 34 }, () => ({ x: rnd() * W, y: rnd() * 520, s: 4 + rnd() * 10, r: 0.5 + rnd() * 1.1, ph: rnd() * 7 }));

// ---- ガスの時間関係（T = 開始からの秒）----------------------------------------------------------
function jetAt(j, T) {
  let a = -1, toNext;
  if (T < j.O) toNext = j.O - T;
  else { const u = (T - j.O) % j.P; if (u < JET_S) a = u; toNext = j.P - u; }
  const tele = a < 0 && toNext < JET.tele ? 1 - toNext / JET.tele : 0;
  const env = a < 0 ? 0 : a < JET.rise ? a / JET.rise : a < JET.rise + JET.hold ? 1 : Math.max(0, 1 - (a - JET.rise - JET.hold) / JET.fade);
  return { a, tele, env, toNext };
}
// 位置 (x, y) での横向き加速度 px/s²（噴出口から離れるほど弱く、縦は噴流の幅で減る）
function jetForce(j, x, y, T, f) {
  const e = jetAt(j, T).env; if (!e) return 0;
  const d = (x - j.x) * j.dir; if (d < -4 || d > JET.len) return 0;
  const hw = 7 + 0.22 * Math.max(0, d), dy = y - j.y;
  return j.dir * f * e * (1 - 0.5 * Math.max(0, d) / JET.len) * Math.exp(-(dy * dy) / (hw * hw));
}

const lab = createLab({
  canvas: document.getElementById('c'),
  title: 'COMET 67P ANCHOR',
  defaults: { g: 0.03, thrust: 5.2, ang: 28, damp: 0.82, drag: 0, fuel: 100, rcs: 2.5, vec: 1 },
  extraParams: [
    { key: 'vtouch', label: 'anchor speed limit px/s', min: 4, max: 16, step: 0.5, def: 10 },
    { key: 'jet',    label: 'gas jet push px/s²',      min: 0, max: 10, step: 0.5, def: 5 },
  ],
  world: { terrain, pads: [] },
  start, onUpdate, onTouchdown, onLiftoff, onCrash, onTap, forces,
  onDrawBack, onDrawMid, onDrawFront, drawTerrain, hud: false,
  telemetryExtra: (l) => `anchored ${l.m.phase === 'anchor' || l.m.result === 'win' ? 'yes' : 'no'}  bounces ${l.m.bounces}  bumps ${l.m.bumps}\njet ${JETS.map((j) => jetAt(j, l.m.flyT).env.toFixed(2)).join(' / ')}  push ${l.m.push.toFixed(2)}`,
});
const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;
const speedOf = (s) => Math.hypot(s.vx, s.vy);

// ---------------------------------------------------------------- 状態
function start(l) {
  sh.onStart(l.m);
  l.resetShip({ x: ENTRY.x, y: ENTRY.y, vx: 0, vy: 0, angle: 0 });
  l.frozen = true; l.controlsEnabled = false;   // 開始待ち
  l.m = { menu: sess.mode === 'menu', waiting: true, started: false, flyT: 0, relT: 0, phase: null, anchorT: 0, touch: null, touchX: TGT.x, push: 0,
    strandT: 0, result: null, resultT: 0, final: null, failed: false, lifeLost: false, toast: '', toastT: 0, toastBad: false, bumpT: 0, shakeT: 0, bumps: 0, bounces: 0, bounceT: 0, hissed: [-1, -1] };
  if (l.m.menu) l.hideShip = true;
}
const begin = (l, mode, opt) => sh.begin(l, mode, opt);
const toast = (l, s, sec = 2, bad = false) => { l.m.toast = s; l.m.toastT = sec; l.m.toastBad = bad; };
function go(l) {   // 開始待ち → 進入: 左下へ流れながら降りる
  const m = l.m; if (!m.waiting || m.menu || m.result) return;
  m.waiting = false; m.started = true; l.frozen = false; l.controlsEnabled = true; l.ship.vx = ENTRY.vx; l.ship.vy = ENTRY.vy; toast(l, 'GO', 1.0); audioWake();
}
function onTap(l, x, y) {
  const m = l.m;
  if (m.menu || sess.brief) { sh.tap(l, x, y); return; }
  if (m.waiting) { go(l); return; }
  sh.tap(l, x, y);
}
window.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'ArrowUp') && lab.m && lab.m.waiting && !lab.m.menu && !e.repeat) { go(lab); e.preventDefault(); } }, true);
sh.hookR(lab, (m) => m.started, (l, r, d) => { if (l.m.phase !== 'anchor') l.crash(r, d); });   // 錨の演出中の R は無視（成功済み）

function onTouchdown(l) { if (l.m.result) return; }   // 平地への接地（失敗ではない。推力で離陸）
function onLiftoff() {}
function onCrash(l, reason, detail) {
  const m = l.m; if (m.result) return;
  m.result = 'lose'; m.resultT = 0; m.reason = reason; m.detail = detail; l.controlsEnabled = false; sh.onLoss(m);
}
function anchor(l, t) {   // 錨が刺さった = 成功確定（時間・燃料はここで決まる）→ 演出の後に結果
  const m = l.m, s = l.ship;
  t.center = Math.abs(t.dx) <= TGT.c; t.perfect = t.sp <= PERFECT.sp && t.tilt <= PERFECT.ang && t.om <= PERFECT.om;
  const fp = l.fuelPct(), clean = m.bounces + m.bumps === 0;
  m.touch = t; m.touchX = s.x; m.phase = 'anchor'; m.anchorT = 0; m.a0 = s.angle;
  m.final = { t: m.flyT, base: 1000 + Math.round(fp) * 10 + (t.perfect ? 300 : 100), fuel: fp, sp: t.sp, dx: t.dx, bounces: m.bounces + m.bumps, s2: clean, s3: t.perfect };
  s.vx = 0; s.vy = 0; s.omega = 0; s.y = GY - C.LEG_Y; l.frozen = true; l.controlsEnabled = false;
  l.burst(s.x, GY - 1, 18, '#6e655c'); thunk();
}
function win(l) {
  const m = l.m; if (m.result) return;
  m.result = 'win'; m.resultT = 0; l.frozen = true; l.controlsEnabled = false;
  sh.complete(m.final, [true, m.final.s2, m.final.s3]);
}

// ---------------------------------------------------------------- 外力と接触（物理サブステップごと）
function forces(l, dt) {
  const m = l.m, s = l.ship, pr = l.params; if (!m.started || m.result || m.phase) return;
  let push = 0; for (const j of JETS) push += jetForce(j, s.x, s.y, m.flyT, pr.jet);
  s.vx += push * dt; m.push = push;
  const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt, sp = speedOf(s);
  // 壁（塊の側面）に機体の横がぶつかる: そっとなら押し返す、速ければ墜落
  for (const sx of [-1, 1]) {
    const wy = l.terrainY(nx + sx * HULL);
    if (ny + 6 > wy && s.vx * sx > 0) {
      if (sp > pr.vtouch) return l.crash('HIT THE CLIFF', 'Hit the wall at ' + sp.toFixed(0) + ' px/s (limit ' + pr.vtouch + ')');
      s.vx = -sx * Math.max(3, 0.5 * Math.abs(s.vx)); s.omega += -sx * 6; m.bumpT = 0.9; m.shakeT = 0.18; m.bumps++; clang(0.35);
      return;
    }
  }
  const ty = l.terrainY(nx);
  if (ny + C.LEG_Y + 0.05 < ty) return;
  const tilt = Math.abs(wrap180(s.angle)), om = Math.abs(s.omega), dx = s.x - TGT.x;
  if (Math.abs(dx) <= TGT.r) {   // 目標（平ら）
    if (sp <= pr.vtouch && tilt <= TOUCH_TILT) return anchor(l, { sp, tilt, om, dx });
    const B = C.BOUNCE;
    if (Math.abs(s.vy) <= B.vy && Math.abs(s.vx) <= B.vx && tilt <= B.ang && om <= B.om) {   // 錨が刺さらず大きく跳ね返る（墜落ではない）
      s.vy = -Math.max(4, 0.6 * Math.abs(s.vy)); s.vx = s.vx * 0.7 + (dx >= 0 ? 1 : -1) * 2; s.omega += (dx >= 0 ? 1 : -1) * 12; s.y = Math.min(s.y, GY - C.LEG_Y - 0.5);
      m.bounces++; m.bounceT = 1.2; m.shakeT = 0.25; clang(0.6);
      toast(l, sp > pr.vtouch ? 'TOO FAST · ANCHOR FAILED (' + sp.toFixed(0) + ' > ' + pr.vtouch + ')' : 'TILTED · ANCHOR FAILED', 2.4, true);
    }
    return;   // それ以上は harness の判定（HARD IMPACT / TIPPED OVER）
  }
  if (footSlopeDeg(terrain, nx) > C.LAND_SLOPE_DEG && sp <= pr.vtouch) rockBump(l, nx);   // 岩・塊の斜面にそっと触れた: 押し返す
}
function rockBump(l, nx) {
  const m = l.m, s = l.ship, ty = l.terrainY;
  const k = (ty(nx + 2) - ty(nx - 2)) / 4, n = Math.hypot(k, 1), ex = k / n, ey = -1 / n;   // 外向きの法線
  const vn = s.vx * ex + s.vy * ey;
  if (vn < 0) { s.vx -= 1.5 * vn * ex; s.vy -= 1.5 * vn * ey; }
  const out = s.vx * ex + s.vy * ey; if (out < 3) { s.vx += (3 - out) * ex; s.vy += (3 - out) * ey; }
  s.omega += (ex >= 0 ? 1 : -1) * 8; s.y = Math.min(s.y, ty(s.x) - C.LEG_Y - 0.3);
  m.bumpT = 0.9; m.shakeT = 0.2; m.bumps++; clang(0.4);
}

// ---------------------------------------------------------------- 毎フレーム
function onUpdate(l, dt) {
  const m = l.m, s = l.ship;
  if (m.menu) return;
  if (m.toastT > 0) m.toastT -= dt;
  if (m.bounceT > 0) m.bounceT -= dt;
  m.relT += dt;
  if (m.waiting) return;
  if (m.phase === 'anchor' && !m.result) {
    m.anchorT += dt; s.angle = m.a0 * Math.max(0, 1 - m.anchorT / 0.4);
    if (m.anchorT >= 0.35 && !m.chimed) { m.chimed = true; chime(); }
    if (m.anchorT >= ANCHOR_S) win(l);
    return;
  }
  if (m.result) {
    m.resultT += dt;
    if (m.lifeLost && m.resultT >= LIFE_LOST_S) l.reset();
    return;
  }
  m.flyT += dt;
  JETS.forEach((j, i) => { const a = jetAt(j, m.flyT); if (a.a >= 0 && m.hissed[i] !== Math.floor((m.flyT - j.O) / j.P)) { m.hissed[i] = Math.floor((m.flyT - j.O) / j.P); hiss(); } });
  if (s.x < OUT.x0 || s.x > OUT.x1 || s.y < OUT.y0) return l.crash('LEFT THE AREA', 'You drifted out of range');
  if (sh.fuelOut(l, dt, onCrash)) return;   // 燃料切れ: 流れて DRIFT_S 秒で LOST CONTROL
  if (m.bumpT > 0) m.bumpT -= dt;
  if (m.shakeT > 0) m.shakeT -= dt;
  lab.canvas.style.transform = m.shakeT > 0 ? 'translate(' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px,' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px)' : '';
}

// ---------------------------------------------------------------- 音（WebAudio。失敗しても続行。テスト自動操縦中は鳴らさない）
let actx = null, noiseBuf = null;
const audioWake = () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* 音なし */ } };
const audioOn = () => actx && !lab.script;
const noise = () => { if (!noiseBuf) { noiseBuf = actx.createBuffer(1, actx.sampleRate * 2, actx.sampleRate); const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } return noiseBuf; };
function hiss() {   // ガスの噴出: 低めのシューという音（噴出の長さ）
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, src = actx.createBufferSource(); src.buffer = noise();
    const f = actx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 0.5;
    const g = actx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.07, t + JET.rise); g.gain.setValueAtTime(0.07, t + JET.rise + JET.hold); g.gain.exponentialRampToValueAtTime(0.0001, t + JET_S);
    src.connect(f); f.connect(g); g.connect(actx.destination); src.start(t); src.stop(t + JET_S + 0.05);
  } catch (e) { /* 音なしでも続行 */ }
}
function thunk() {   // 錨の発射: 低い「ドン」+ 金属音
  if (!audioOn()) return;
  try {
    const t = actx.currentTime, o = actx.createOscillator(), g = actx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    g.gain.setValueAtTime(0.34, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + 0.42);
    const g2 = actx.createGain(); g2.connect(actx.destination); g2.gain.setValueAtTime(0.06, t + 0.05); g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    for (const fr of [620, 931]) { const o2 = actx.createOscillator(); o2.type = 'triangle'; o2.frequency.value = fr; o2.connect(g2); o2.start(t + 0.05); o2.stop(t + 0.52); }
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
function onDrawBack(ctx, l) {
  const g = ctx.createLinearGradient(0, 0, 0, 540); g.addColorStop(0, '#02030a'); g.addColorStop(1, '#0c0f18');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of STARS) { ctx.fillStyle = rgba('#ffffff', s.a); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  const coma = ctx.createRadialGradient(180, 560, 40, 180, 560, 460); coma.addColorStop(0, 'rgba(170,200,230,0.13)'); coma.addColorStop(1, 'rgba(170,200,230,0)');   // 核を包むうすいガスの雲（コマ）
  ctx.fillStyle = coma; ctx.fillRect(0, 0, W, H);
  const sun = ctx.createRadialGradient(332, 58, 2, 332, 58, 120); sun.addColorStop(0, 'rgba(255,244,214,0.9)'); sun.addColorStop(0.08, 'rgba(255,230,180,0.35)'); sun.addColorStop(1, 'rgba(255,220,160,0)');
  ctx.fillStyle = sun; ctx.fillRect(200, 0, 160, 190);
  const t = l.clock;   // 核から離れていく細かな塵（ゆっくり上へ）
  for (const d of MOTES) { const y = ((d.y - t * d.s) % 520 + 520) % 520, x = d.x + 6 * Math.sin(t * 0.4 + d.ph); ctx.fillStyle = rgba('#cfd8e6', 0.25 + 0.15 * Math.sin(t + d.ph)); ctx.beginPath(); ctx.arc(x, y, d.r, 0, 7); ctx.fill(); }
}

// 地形: ほとんど黒い核（彗星の核は非常に暗い）+ 層の筋 + 氷の白い点 + 日の当たる縁
function drawTerrain(ctx, l) {
  ctx.beginPath(); ctx.moveTo(0, H);
  for (const q of terrain) ctx.lineTo(q.x, q.y);
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 380, 0, 600); g.addColorStop(0, '#4a4440'); g.addColorStop(0.4, '#2c2825'); g.addColorStop(1, '#141210');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.strokeStyle = 'rgba(16,14,12,0.55)'; ctx.lineWidth = 1;   // 塊の層（断面に平行な筋）
  for (const L of LOBES) for (let k = 0.88; k > 0.3; k -= 0.14) {
    ctx.beginPath(); let first = true;
    for (let x = Math.max(0, L.x - L.r * k); x <= Math.min(W, L.x + L.r * k); x += 4) { const d = (x - L.x) / (L.r * k); const y = GY + 6 - L.h * k * Math.sqrt(Math.max(0, 1 - d * d)) + 1.5 * Math.sin(x * 0.3); if (first) { ctx.moveTo(x, y); first = false; } else ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (const p of ICE) { const y = terrainFn(p.x) + p.dy; ctx.fillStyle = rgba('#dff2ff', p.a); ctx.beginPath(); ctx.arc(p.x, y, p.r, 0, 7); ctx.fill(); }
  const lg = ctx.createLinearGradient(0, 0, W, 0);   // 日は右上: 左ほど暗い
  lg.addColorStop(0, 'rgba(0,0,0,0.38)'); lg.addColorStop(0.55, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(255,240,210,0.05)');
  ctx.fillStyle = lg; ctx.fillRect(0, 380, W, H - 380);
  ctx.restore();
  ctx.beginPath(); for (const q of terrain) (q === terrain[0] ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y));
  ctx.save(); ctx.strokeStyle = 'rgba(214,200,180,0.12)'; ctx.lineWidth = 5; ctx.stroke(); ctx.restore();
  ctx.strokeStyle = '#9a8f84'; ctx.lineWidth = 1.2; ctx.stroke();
  drawTarget(ctx, l);
  drawFootMarker(ctx, l);
}
function drawFootMarker(ctx, l) {   // 足元の傾斜マーカー（目標の中は常に水色 = 触れてよい場所）
  const s = l.ship, p = P(), m = l.m; if (!s || l.hideShip || l.state === 'crashed' || m.menu || m.waiting || m.phase) return;
  const alt = l.terrainY(s.x) - (s.y + C.LEG_Y), a = Math.max(0, Math.min(1, (130 - alt) / 90)) * 0.85; if (a <= 0.02) return;
  ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'butt';
  for (let x = Math.max(0, Math.floor((s.x - 42) / 6) * 6); x < Math.min(W, s.x + 42); x += 6) {
    const xc = x + 3, inT = Math.abs(xc - TGT.x) <= TGT.r, sl = footSlopeDeg(terrain, xc), col = inT ? '#7FD1FF' : sl <= 5 ? '#63D8C9' : sl <= C.LAND_SLOPE_DEG ? p.warn : p.bad;
    ctx.globalAlpha = a * (1 - Math.min(1, Math.abs(xc - s.x) / 48) * 0.7); ctx.strokeStyle = col;
    ctx.beginPath(); ctx.moveTo(x, l.terrainY(x) + 1.5); ctx.lineTo(x + 6.2, l.terrainY(x + 6) + 1.5); ctx.stroke();
  }
  ctx.restore();
}
function drawTarget(ctx, l) {
  const p = P(), m = l.m, t = l.clock, done = m.phase === 'anchor' || m.result === 'win', col = done ? p.green : '#7FD1FF';
  ctx.save();
  if (!done && !m.menu) {   // 目標への縦の案内（うっすら）
    const bg = ctx.createLinearGradient(0, GY, 0, GY - 220); bg.addColorStop(0, rgba(col, 0.12)); bg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = bg; ctx.fillRect(TGT.x - TGT.r, GY - 220, TGT.r * 2, 220);
  }
  ctx.strokeStyle = col; ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.ellipse(TGT.x, GY + 1, TGT.r, 4.5, 0, 0, 7); ctx.stroke();
  ctx.lineWidth = 1; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(TGT.x + sx * 4, GY + 1); ctx.lineTo(TGT.x + sx * 9, GY + 1); ctx.stroke(); }   // 十字の目印
  if (!done) { ctx.globalAlpha = 0.22 + 0.18 * Math.sin(t * 4); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(TGT.x, GY + 1, TGT.r, 4.5, 0, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
  if (!m.menu && !m.result && !done) {
    const by = Math.sin(t * 4) * 3, s = l.ship, near = Math.abs(s.x - TGT.x) < 60 && s.y > GY - 110 && !l.hideShip;
    ctx.globalAlpha = near ? 0.25 : 1;
    txt(ctx, 'ANCHOR  ≤ ' + l.params.vtouch + ' px/s', TGT.x, GY - 50 + by, 8, col, 'center', { w: 700, sp: 1.2 });
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(TGT.x - 5, GY - 37 + by); ctx.lineTo(TGT.x + 5, GY - 37 + by); ctx.lineTo(TGT.x, GY - 30 + by); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ガスの噴出（前触れ = 噴出口の霜と届く範囲の点線、噴出中 = 横に流れる白いガス）
function onDrawMid(ctx, l) {
  const p = P(), m = l.m, t = l.clock; if (m.menu) return;
  const T = m.flyT;
  for (const j of JETS) {
    const st = m.started ? jetAt(j, T) : { tele: 0, env: 0, a: -1 };
    ctx.save();
    ctx.fillStyle = '#0a0908'; ctx.beginPath(); ctx.ellipse(j.x, j.y + 1, 3, 5, 0, 0, 7); ctx.fill();   // 噴出口
    ctx.fillStyle = rgba('#bfe6ff', 0.25 + 0.6 * Math.max(st.tele, st.env)); ctx.beginPath(); ctx.arc(j.x + j.dir * 2, j.y, 2, 0, 7); ctx.fill();
    if (st.tele > 0) {   // 前触れ: 霜が舞う + 届く範囲の点線 + 「GAS」
      for (let i = 0; i < 10; i++) { const q = (t * 1.7 + i / 10) % 1; ctx.fillStyle = rgba('#e8f6ff', (1 - q) * 0.8 * st.tele); ctx.beginPath(); ctx.arc(j.x + j.dir * (3 + q * 16), j.y - 4 + Math.sin(i * 3.1) * 7 * q, 1.1, 0, 7); ctx.fill(); }
      ctx.setLineDash([3, 4]); ctx.strokeStyle = rgba('#bfe6ff', 0.45 * st.tele); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(j.x, j.y - 7); ctx.lineTo(j.x + j.dir * JET.len, j.y - 7 - 0.22 * JET.len); ctx.moveTo(j.x, j.y + 7); ctx.lineTo(j.x + j.dir * JET.len, j.y + 7 + 0.22 * JET.len); ctx.stroke(); ctx.setLineDash([]);
      txt(ctx, 'GAS', j.x + j.dir * 22, j.y - 20, 7.5, p.warn, 'center', { w: 800, sp: 1.5, a: 0.5 + 0.5 * Math.sin(t * 14) });
    }
    if (st.env > 0) {   // 噴出中
      const cg = ctx.createLinearGradient(j.x, 0, j.x + j.dir * JET.len, 0); cg.addColorStop(0, rgba('#e6f4ff', 0.32 * st.env)); cg.addColorStop(1, rgba('#e6f4ff', 0));
      ctx.fillStyle = cg; ctx.beginPath(); ctx.moveTo(j.x, j.y - 6); ctx.lineTo(j.x + j.dir * JET.len, j.y - 6 - 0.22 * JET.len); ctx.lineTo(j.x + j.dir * JET.len, j.y + 6 + 0.22 * JET.len); ctx.lineTo(j.x, j.y + 6); ctx.closePath(); ctx.fill();
      for (let i = 0; i < 40; i++) {
        const q = (t * 1.3 + i / 40) % 1, d = q * JET.len, hw = 7 + 0.22 * d;
        ctx.fillStyle = rgba('#f2f9ff', 0.5 * st.env * (1 - q)); ctx.beginPath(); ctx.arc(j.x + j.dir * d, j.y + Math.sin(i * 7.3) * hw * 0.8, 1 + 3 * q, 0, 7); ctx.fill();
      }
    }
    ctx.restore();
  }
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
  if (!m.phase && m.result !== 'win') drawHud(ctx, l);
  sh.drawCorner(ctx, l, { time: m.started ? (m.final ? m.final.t : m.flyT) : null, check: 'ANCHOR ' + (m.final ? '●' : '○') + '   BOUNCE ' + (m.bounces + m.bumps), checkOk: !!m.final });
  const sp = speedOf(s), alt = l.terrainY(s.x) - (s.y + C.LEG_Y);
  if (!m.result && !m.phase) {
    let hint = '', bad = false;
    const gas = m.started && JETS.some((j) => { const a = jetAt(j, m.flyT); return (a.tele > 0 || a.env > 0) && Math.abs(s.y - j.y) < 45 && (s.x - j.x) * j.dir > -4 && (s.x - j.x) * j.dir < JET.len; });
    if (m.waiting || m.relT < 8) hint = 'DESCEND INTO THE NECK · TOUCH THE TARGET GENTLY';
    else if (gas) { hint = 'GAS JET! THRUST AGAINST THE PUSH'; bad = true; }
    else if (l.state === 'grounded') hint = 'OFF TARGET · THRUST TO LIFT OFF';
    else if (alt < 150 && sp > l.params.vtouch) { hint = 'TOO FAST · SPEED ≤ ' + l.params.vtouch + ' TO ANCHOR'; bad = true; }
    else hint = 'POINT THE NOSE AGAINST YOUR DRIFT AND THRUST TO STOP';
    sh.drawHint(ctx, hint, bad);
  }
  if (!m.result && m.started && !m.phase && l.state === 'play' && alt < 140) {   // 機体の横の速度の読み
    const ok = sp <= l.params.vtouch, perf = sp <= PERFECT.sp && Math.abs(wrap180(s.angle)) <= PERFECT.ang;
    const rx = s.x > W - 70 ? s.x - 22 : s.x + 22;
    txt(ctx, sp.toFixed(1), rx, s.y - 6, 10, perf ? '#FFC94D' : ok ? p.green : p.bad, rx < s.x ? 'right' : 'left', { w: 800, sp: 0.8 });
    if (perf) txt(ctx, 'PERFECT', rx, s.y + 6, 6.5, '#FFC94D', rx < s.x ? 'right' : 'left', { w: 700, sp: 1 });
  }
  if (m.phase === 'anchor' && !m.result) {   // 銛が両脚から地面へ刺さり、綱が張る
    const k = Math.min(1, m.anchorT / 0.18), x0 = m.touchX;
    ctx.save(); ctx.strokeStyle = '#d9dee8'; ctx.lineWidth = 1.2;
    for (const sx of [-1, 1]) { const fx = x0 + sx * 9, fy = GY - 2, tx = fx + sx * 7, ty = GY + 16; ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + (tx - fx) * k, fy + (ty - fy) * k); ctx.stroke(); }
    if (m.anchorT < 0.5) { const fg = ctx.createRadialGradient(x0, GY, 1, x0, GY, 30); fg.addColorStop(0, rgba('#fff2d0', 0.8 * (1 - m.anchorT / 0.5))); fg.addColorStop(1, rgba('#fff2d0', 0)); ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(x0, GY, 30, 0, 7); ctx.fill(); }
    ctx.restore();
    const tx = x0 < 180 ? 262 : 98;
    txt(ctx, 'ANCHORED!', tx, 300, 18, p.green, 'center', { w: 900, sp: 3, a: Math.min(1, m.anchorT * 4) });
    txt(ctx, m.final.s2 ? 'FIRST CONTACT · NO BOUNCE' : 'SECURED ON 67P', tx, 322, 8, m.final.s2 ? '#FFC94D' : p.fg, 'center', { w: 700, sp: 1.5, a: Math.min(1, m.anchorT * 3) });
  }
  if (m.bumpT > 0 && !m.result && !m.phase) txt(ctx, 'BUMP', s.x, s.y - 30 - (0.9 - m.bumpT) * 14, 10, p.warn, 'center', { w: 800, sp: 1.5, a: Math.min(1, m.bumpT * 2) });
  if (m.bounceT > 0 && !m.result && !m.phase) txt(ctx, 'BOUNCED!', s.x, s.y - 34 - (1.2 - m.bounceT) * 16, 12, p.bad, 'center', { w: 900, sp: 1.5, a: Math.min(1, m.bounceT * 2) });
  if (m.waiting && !m.result) txt(ctx, 'TAP TO START', 180, 236, 13, p.green, 'center', { w: 800, sp: 2, a: 0.55 + 0.45 * Math.sin(l.clock * 4.5) });
  if (m.toastT > 0 && !m.waiting && !m.phase) txt(ctx, m.toast, 180, 236, 10, m.toastBad ? p.bad : p.green, 'center', { w: 700, sp: 1.2, a: Math.min(1, m.toastT) });
  sh.drawFuelOut(ctx, l);
  if (!m.result && m.started && !m.phase) {
    const e = Math.min(s.x - OUT.x0, OUT.x1 - s.x, s.y - OUT.y0), danger = e < 46 && ((s.x < 40 && s.vx < 2) || (s.x > 320 && s.vx > -2) || (s.y < 30 && s.vy < 4));
    if (danger) { ctx.fillStyle = rgba(p.bad, 0.1 + 0.08 * Math.sin(l.clock * 12)); ctx.fillRect(0, 0, W, 540); txt(ctx, 'OUT OF RANGE', 180, 276, 10, p.bad, 'center', { w: 800, sp: 1.5 }); }
  }
  if (m.result) {
    const f = m.final;
    sh.drawResult(ctx, l, { rows: m.result === 'win' ? [[true, 'ANCHOR', mmss(f.t)], [f.s2, 'NO BOUNCE', f.bounces ? f.bounces + ' BOUNCE' + (f.bounces > 1 ? 'S' : '') : 'FIRST CONTACT'], [f.s3, 'PERFECT TOUCH', f.sp.toFixed(1) + ' px/s']] : [],
      failNote: m.bounces ? 'The anchor did not hold. Slow down before contact.' : 'Not anchored yet.', failTime: m.flyT });
  }
  sh.drawBrief(ctx, l);
}

sh.bindLab(lab);
sh.addResetButton();
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js?v=24a7fba2c8').then((mod) => mod.install(lab));
window.__score = { mult: sh.lifeMult, timeBonus: sh.timeBonus, KEY_B: sh.KEY_B, KEY_T: sh.KEY_T, KEY_S: sh.KEY_S };
window.__flow = { sess, begin: (mode, opt) => begin(lab, mode, opt), tap: (x, y) => onTap(lab, x, y), BTN: sh.BTN, LIFE_LOST_S };
window.__tag = { GY, TGT, CLEAR, LOBES, BOULDERS, JETS, JET, ENTRY, PERFECT, TOUCH_TILT, ANCHOR_S, HULL, jetAt, jetForce, terrain, terrainFn, footSlopeDeg };
lab.start();
