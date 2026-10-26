// EXPEDITION #1 PHOBOS SAMPLE RETURN（試作）。仕様: 01_docs/EXPEDITION_MISSIONS.md
// 着陸 → その場で2秒静止して採取 → 離陸 → 母船のドッキング枠に低速で入る。
import { createLab, W, H, C } from '../00_harness/harness.js';
import { txt, rgba, rr } from '../../../02_src/art.js';
import { P } from '../../../02_src/core/palette.js';

const SITE = { x: 190, y: 512, w: 64, id: 'site' };
const SAMPLE_S = 2.0;          // 採取に必要な静止秒数
const STRAND_S = 2.0;          // 燃料 0 のまま放置してよい秒数
const MS_Y = 130, MS_AMP = 90;              // 母船の高さ
const RING_DY = 31, RING_R = 17;   // ドッキング枠: 母船の中心からの下方向オフセットと半径（円形判定の半径）
const DOCK_REL = 10, DOCK_TILT = 20;
const STAR2_FUEL = 30;
const REL_AT = 1.2, DRIFT_S = 1.0, DRIFT_VY = 18;   // 発進: 係留 1.2s → 解放 → 1.0s は自動で漂う（操作不可）
const DOCK_CONFIRM = 0.25;   // 条件を満たし続ける秒数（ゴースト点灯 → 成功）
const KEY_A = 'lander11.exp.sample_return.attempts', KEY_B = 'lander11.exp.sample_return.best';
const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 保存できなくても続行 */ } };
const loadAttempts = () => Math.max(0, parseInt(lsGet(KEY_A), 10) || 0);
const loadBest = () => { try { const b = JSON.parse(lsGet(KEY_B)); if (b && Array.isArray(b.stars)) return { score: +b.score || 0, stars: [!!b.stars[0], !!b.stars[1], !!b.stars[2]] }; } catch (e) { /* 無効 */ } return { score: 0, stars: [false, false, false] }; };
export const attemptMult = (n) => Math.max(0.10, Math.pow(0.8, n - 1));
export const baseScore = (fuelPct, grade) => 1000 + Math.round(fuelPct) * 10 + (grade === 'PERFECT' ? 300 : grade ? 100 : 0);
export const missionScore = (fuelPct, grade, n) => Math.round(baseScore(fuelPct, grade) * attemptMult(n));
const OUT = { x0: -10, x1: 370, y0: -30 };

// ---- 地形（ゆるい起伏 + 採取地点だけ平ら） ---------------------------------------------------
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function terrainFn(x) {
  const base = 506 + 4 * Math.sin(x * 0.018 + 0.6) + 1.3 * Math.sin(x * 0.05 + 2.1);
  const wgt = Math.min(sstep(SITE.x - 30, SITE.x, x), 1 - sstep(SITE.x + SITE.w, SITE.x + SITE.w + 30, x));
  return base + (SITE.y - base) * wgt;
}
const terrain = [];
for (let x = 0; x <= W; x += 6) terrain.push({ x, y: terrainFn(x) });

// 装飾（衝突しない）: 星・クレーター・小石は固定乱数
let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const STARS = Array.from({ length: 80 }, () => ({ x: rnd() * W, y: rnd() * 470, r: 0.4 + rnd() * 0.9, a: 0.25 + rnd() * 0.6 }));
const CRATERS = Array.from({ length: 9 }, () => ({ x: rnd() * W, d: 14 + rnd() * 34, r: 5 + rnd() * 16 }));
const PEBBLES = Array.from({ length: 36 }, () => ({ x: rnd() * W, d: 4 + rnd() * 100, r: 0.8 + rnd() * 1.8 }));

const lab = createLab({
  canvas: document.getElementById('c'),
  title: 'PHOBOS SAMPLE RETURN',
  defaults: { g: 0.04, thrust: 5.2, ang: 28, damp: 0.82, drag: 0, fuel: 100, rcs: 2.5, vec: 1 },
  extraParams: [
    { key: 'ms',   label: 'mothership peak speed px/s', min: 3, max: 40, step: 1, def: 9 },
    { key: 'ph0',  label: 'mothership start phase rad', min: -3.14, max: 3.14, step: 0.05, def: -1.2 },
    { key: 'hold', label: 'sample hold s',         min: 0.5, max: 5, step: 0.1, def: SAMPLE_S },
    { key: 'ring', label: 'dock ring radius px',   min: 8, max: 40, step: 1,   def: RING_R },
  ],
  world: { terrain, pads: [SITE] },
  start, onUpdate, onTouchdown, onLiftoff, onCrash, onTap,
  onDrawBack, onDrawMid, onDrawFront, drawTerrain,
  velRef: (l) => (l.m.sampled && !l.m.result ? { vx: l.m.mvx, vy: 0 } : null),
  telemetryExtra: (l) => `phase  ${phaseName(l.m)}\ngauge  ${(l.m.gauge * 100).toFixed(0)}%\nsample ${l.m.sampled}\ntouch  ${l.m.touchGrade || '-'}\nmship  x${l.m.mx.toFixed(0)} v${l.m.mvx.toFixed(1)}\nrel    ${l.m.rel == null ? '-' : l.m.rel.toFixed(1)}`,
});

function phaseName(m) { return m.result ? m.result : m.sampled ? 'RETURN' : m.gauge > 0 ? 'SAMPLING' : 'DESCENT'; }

// ---------------------------------------------------------------- 状態
function start(l) {
  const ph0 = l.params.ph0, mx0 = 180 + MS_AMP * Math.sin(ph0), mvx0 = l.params.ms * Math.cos(ph0);
  l.resetShip({ x: mx0, y: MS_Y + RING_DY, vx: mvx0, vy: 0, angle: 0 });
  l.frozen = true; l.controlsEnabled = false;   // 係留中
  l.m = { docked: true, relT: 0, driftT: 0, dockT: 0, ph: l.params.ph0, mx: 180 + MS_AMP * Math.sin(l.params.ph0), mvx: l.params.ms * Math.cos(l.params.ph0), gauge: 0, sampled: false, sampleGrade: null, touchGrade: null, strandT: 0, result: null, resultT: 0, final: null, toast: '', toastT: 0, rel: null, fb: '', dockOk: false, inZone: false, bumps: 0, attempt: loadAttempts(), bumpT: 0, shakeT: 0, pvx: null, pvy: null };
}
function toast(l, s, sec = 2) { l.m.toast = s; l.m.toastT = sec; }

function onTouchdown(l, info) { l.m.touchGrade = info.kind === 'pad' ? info.grade : null; }
function onLiftoff(l) { if (!l.m.sampled) l.m.gauge = 0; }
function onCrash(l, reason, detail) {
  const m = l.m; if (m.result) return;
  m.result = 'lose'; m.resultT = 0; m.reason = reason; m.detail = detail; l.controlsEnabled = false;
}
function lose(l, reason, detail) { l.crash(reason, detail); }
const retryY = (m) => (m.result === 'win' ? 478 : 330);
function onTap(l, x, y) {
  const m = l.m; if (!m.result || m.resultT < 0.4) return;
  if (x > 90 && x < 270 && y > retryY(m) && y < retryY(m) + 52) l.reset();
}

// ---------------------------------------------------------------- 毎フレーム
function onUpdate(l, dt) {
  const m = l.m, s = l.ship, pr = l.params;
  // 母船は左右にゆっくり往復（正弦波）。ms = 中央での最大速度。端ほど遅いので、端で待って合わせてもよい
  const w = pr.ms / MS_AMP;
  m.ph += w * dt; m.mx = 180 + MS_AMP * Math.sin(m.ph); m.mvx = pr.ms * Math.cos(m.ph);
  if (m.toastT > 0) m.toastT -= dt;
  if (m.docked) {   // 係留: 母船に固定。1.2s で解放 → 母船の水平速度を引き継いで、下へゆっくり離れる
    m.relT += dt; s.x = m.mx; s.y = MS_Y + RING_DY; s.vx = m.mvx; s.vy = 0; s.angle = 0; s.omega = 0;
    if (m.relT >= REL_AT) { m.docked = false; l.frozen = false; m.attempt = loadAttempts() + 1; lsSet(KEY_A, String(m.attempt)); s.vx = m.mvx; s.vy = DRIFT_VY; toast(l, 'RELEASED', 1.6); }
    return;
  }
  if (m.driftT < DRIFT_S) { m.driftT += dt; if (m.driftT >= DRIFT_S) l.controlsEnabled = true; }   // 自動で漂う間は入力なし
  if (m.result) {
    m.resultT += dt;
    if (m.result === 'win') {   // 吸い込まれる
      const k = 1 - Math.exp(-dt * 7), tx = m.mx, ty = MS_Y + RING_DY;
      s.x += (tx - s.x) * k; s.y += (ty - s.y) * k; s.angle *= Math.exp(-dt * 8); s.vx = m.mvx; s.vy = 0;
    }
    return;
  }
  // 範囲外
  if (s.x < OUT.x0 || s.x > OUT.x1 || s.y < OUT.y0) return lose(l, 'LEFT THE AREA', 'You drifted out of range');
  // 燃料切れ（ドッキング前）
  if (s.fuel <= 0.0001) { m.strandT += dt; if (m.strandT >= STRAND_S) return lose(l, 'STRANDED', 'Out of fuel before docking'); } else m.strandT = 0;
  // 採取
  const onSite = l.state === 'grounded' && l.padAt(s.x) === SITE;
  if (onSite && !m.sampled) {
    if (l.input.main) m.gauge = 0;                     // 推力で取り消し
    else {
      m.gauge = Math.min(1, m.gauge + dt / pr.hold);
      if (m.gauge >= 1) { m.sampled = true; m.sampleGrade = m.touchGrade; toast(l, 'SAMPLE ACQUIRED  ·  NOW DOCK', 2.6); }
    }
  } else if (!m.sampled && l.state !== 'grounded') m.gauge = 0;
  // 母船
  const dx = s.x - m.mx, dy = s.y - (MS_Y + RING_DY);
  const relSpeed = Math.hypot(s.vx - m.mvx, s.vy), tilt = Math.abs(s.angle);
  m.rel = relSpeed;
  const inZone = dx * dx + dy * dy <= pr.ring * pr.ring;
  m.inZone = inZone; m.dockOk = relSpeed <= DOCK_REL && tilt <= DOCK_TILT;
  m.fb = inZone && m.sampled && !m.dockOk ? (relSpeed > DOCK_REL ? 'TOO FAST  REL ' + relSpeed.toFixed(0) + ' > ' + DOCK_REL : 'TOO TILTED  ' + tilt.toFixed(0) + '° > ' + DOCK_TILT + '°') : '';
  m.dockT = (l.state === 'play' && m.sampled && inZone && m.dockOk) ? m.dockT + dt : 0;
  if (m.dockT >= DOCK_CONFIRM) {
    m.result = 'win'; m.resultT = 0; l.frozen = true; l.controlsEnabled = false;
    const fp = l.fuelPct();
    m.final = { t: l.t, fuel: fp, grade: m.sampleGrade, s2: fp >= STAR2_FUEL, s3: m.sampleGrade === 'PERFECT', attempt: m.attempt, mult: attemptMult(m.attempt), score: missionScore(fp, m.sampleGrade, m.attempt) };
    const prev = loadBest(), f = m.final, got = [true, f.s2, f.s3];
    f.newStars = got.map((g, i) => g && !prev.stars[i]); f.newBest = f.score > prev.score;
    f.best = { score: Math.max(prev.score, f.score), stars: got.map((g, i) => g || prev.stars[i]) };
    lsSet(KEY_B, JSON.stringify(f.best));
    return;
  }
  // 母船の船体・ドッキング枠への接触: 墜落にしない。物理的に跳ね返す（スイープ判定でトンネリング防止）
  if (l.state === 'play') bumpCheck(l);
  m.pvx = s.x - m.mx; m.pvy = s.y - MS_Y;   // 次フレームのスイープ用（母船座標の前回位置）
  if (m.shakeT > 0) m.shakeT -= dt;
  if (m.bumpT > 0) m.bumpT -= dt;
  lab.canvas.style.transform = m.shakeT > 0 ? 'translate(' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px,' + ((Math.random() - 0.5) * 6 * m.shakeT / 0.3).toFixed(1) + 'px)' : '';
}

// ---- 母船の衝突形状（母船中心座標）: 船体 = カプセル、ドッキング枠の腕 = 折れ線（入口は開けておく）
const SR = 8, BUMP_E = 0.35, BUMP_SPIN = 15;
const HULL = [[-24, 0.5, 24, 0.5, 10.5]];
const ARMS = [];
for (const sx of [-1, 1]) {
  let px = sx * 20, py = 8;
  for (let i = 1; i <= 6; i++) {   // 受け台の曲線 t=0..0.75（先端は開ける）
    const t = i / 8, u = 1 - t, x = sx * (u * u * 20 + 2 * t * u * 24 + t * t * 10), y = u * u * 8 + 2 * t * u * (RING_DY + 4) + t * t * (RING_DY + 18);
    ARMS.push([px, py, x, y, 1.5]); px = x; py = y;
  }
}
const SEGS = HULL.concat(ARMS);
function nearest(x, y) {   // 最も深く食い込んでいる形状 → {nx, ny, pen}
  let best = null;
  for (const [ax, ay, bx, by, r] of SEGS) {
    const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey)));
    const cx = ax + ex * t, cy = ay + ey * t; let dx = x - cx, dy = y - cy; const d = Math.hypot(dx, dy), pen = r + SR - d;
    if (pen > 0 && (!best || pen > best.pen)) { if (d < 1e-6) { dx = 0; dy = 1; } else { dx /= d; dy /= d; } best = { nx: dx, ny: dy, pen }; }
  }
  return best;
}
function bumpCheck(l) {
  const m = l.m, s = l.ship;
  const cx = s.x - m.mx, cy = s.y - MS_Y, px = m.pvx == null ? cx : m.pvx, py = m.pvy == null ? cy : m.pvy;
  const n = Math.max(1, Math.ceil(Math.hypot(cx - px, cy - py) / 2));   // 2px 刻みで前回位置→現在位置を走査
  for (let i = 1; i <= n; i++) {
    const x = px + (cx - px) * i / n, y = py + (cy - py) * i / n, h = nearest(x, y);
    if (!h) continue;
    const rvx = s.vx - m.mvx, rvy = s.vy, vn = rvx * h.nx + rvy * h.ny;
    if (vn < 0) {
      const sp = Math.hypot(rvx, rvy), nvx = rvx - (1 + BUMP_E) * vn * h.nx, nvy = rvy - (1 + BUMP_E) * vn * h.ny;
      s.vx = nvx + m.mvx; s.vy = nvy;
      if (sp > DOCK_REL) {   // 強い接触のみ演出
        s.omega += (h.nx >= 0 ? 1 : -1) * BUMP_SPIN; m.bumps++; m.shakeT = 0.3; m.bumpT = 0.9; clang(Math.min(1, sp / 60));
      }
    }
    s.x = m.mx + x + h.nx * (h.pen + 0.5); s.y = MS_Y + y + h.ny * (h.pen + 0.5);   // 船体の外へ押し出す
    m.pvx = s.x - m.mx; m.pvy = s.y - MS_Y;
    return;
  }
}
let actx = null;
function clang(k) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t = actx.currentTime, g = actx.createGain(); g.connect(actx.destination);
    g.gain.setValueAtTime(0.12 + 0.12 * k, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    for (const f of [310, 487, 811]) { const o = actx.createOscillator(); o.type = 'square'; o.frequency.value = f; o.connect(g); o.start(t); o.stop(t + 0.36); }
  } catch (e) { /* 音なしでも続行 */ }
}

// ---------------------------------------------------------------- 描画
function onDrawBack(ctx, l) {
  const p = P();
  const g = ctx.createLinearGradient(0, 0, 0, 520); g.addColorStop(0, '#03040a'); g.addColorStop(1, '#0d1220');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  for (const s of STARS) { ctx.fillStyle = rgba('#ffffff', s.a); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill(); }
  drawMars(ctx);
  drawMothership(ctx, l);
}

function drawMars(ctx) {
  const cx = 62, cy = 262, r = 150;
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 7); ctx.clip();
  const g = ctx.createRadialGradient(cx + 55, cy - 60, 10, cx + 20, cy - 20, r * 1.15);
  g.addColorStop(0, '#e08a55'); g.addColorStop(0.5, '#b4583a'); g.addColorStop(0.85, '#6a2c24'); g.addColorStop(1, '#2a1216');
  ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.fillStyle = 'rgba(70,28,24,0.45)';                       // 暗い模様（大シルチス風）
  [[cx + 30, cy - 10, 46, 22, 0.5], [cx - 10, cy + 40, 36, 15, -0.3], [cx + 70, cy + 30, 24, 12, 0.9], [cx - 50, cy - 40, 30, 12, 0.2]].forEach((e) => { ctx.beginPath(); ctx.ellipse(e[0], e[1], e[2], e[3], e[4], 0, 7); ctx.fill(); });
  ctx.fillStyle = 'rgba(255,240,230,0.55)'; ctx.beginPath(); ctx.ellipse(cx + 8, cy - r + 6, 44, 11, 0, 0, 7); ctx.fill();   // 極冠
  const sh = ctx.createRadialGradient(cx + 70, cy - 70, r * 0.5, cx + 70, cy - 70, r * 2.0);   // 左下の影（右上から光が当たる）
  sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = sh; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,170,120,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 1, -2.4, 0.2); ctx.stroke();   // 大気の縁
}

function drawMothership(ctx, l) {
  const m = l.m, p = P(), t = l.clock, my = MS_Y;
  const armed = m.sampled && !m.result;
  const ringCol = !armed ? rgba(p.mid, 0.35) : (m.inZone ? (m.dockOk ? p.green : p.bad) : p.warn);
  ctx.save(); ctx.translate(m.mx, my);
  // 太陽電池パネル（上に2枚）
  ctx.strokeStyle = '#8d93a6'; ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(-12, -9); ctx.lineTo(-14, -16); ctx.moveTo(12, -9); ctx.lineTo(14, -16); ctx.stroke();
  for (const sx of [-1, 1]) {
    ctx.save(); ctx.translate(sx * 24, -19); ctx.rotate(sx * 0.12);
    rr(ctx, -13, -4.5, 26, 9, 1.8); ctx.fillStyle = '#27407a'; ctx.fill(); ctx.strokeStyle = '#9fb4e8'; ctx.lineWidth = 0.7; ctx.stroke();
    ctx.strokeStyle = 'rgba(190,210,255,0.4)'; ctx.beginPath(); for (let i = -6; i <= 6; i += 6.5) { ctx.moveTo(i, -4.5); ctx.lineTo(i, 4.5); } ctx.moveTo(-13, 0); ctx.lineTo(13, 0); ctx.stroke();
    ctx.restore();
  }
  // 受け台（ドッキングベイの腕）
  ctx.strokeStyle = '#b9b2a0'; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20, 8); ctx.quadraticCurveTo(-24, RING_DY + 4, -10, RING_DY + 18); ctx.moveTo(20, 8); ctx.quadraticCurveTo(24, RING_DY + 4, 10, RING_DY + 18); ctx.stroke();
  // 船体（丸いカプセル）
  rr(ctx, -34, -10, 68, 21, 10);
  const hg = ctx.createLinearGradient(0, -10, 0, 11); hg.addColorStop(0, '#FBF7EC'); hg.addColorStop(0.6, '#E2DAC6'); hg.addColorStop(1, '#BDB5A0');
  ctx.fillStyle = hg; ctx.fill(); ctx.strokeStyle = 'rgba(20,24,34,0.5)'; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = rgba(p.warn, 0.85); ctx.fillRect(-34 + 14, -10, 5, 21); ctx.fillStyle = rgba(p.mid, 0.8); ctx.fillRect(-34 + 21, -10, 2, 21);   // 帯
  // 窓（目）。進行方向（右）を向く
  const blink = (Math.floor(t * 0.7) % 6) === 0 && (t % 1) < 0.12;
  ctx.fillStyle = '#16314a'; rr(ctx, 6, -6, 22, 11, 5.5); ctx.fill();
  ctx.fillStyle = '#9ee8ff';
  if (!blink) { ctx.beginPath(); ctx.arc(13, -0.5, 2.2, 0, 7); ctx.arc(22, -0.5, 2.2, 0, 7); ctx.fill(); } else { ctx.fillRect(10.8, -0.9, 4.4, 1); ctx.fillRect(19.8, -0.9, 4.4, 1); }
  // アンテナ
  ctx.strokeStyle = '#bdb6a4'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-26, -10); ctx.lineTo(-30, -19); ctx.stroke();
  ctx.fillStyle = (Math.floor(t * 1.3) % 2) ? p.warn : rgba(p.warn, 0.25); ctx.beginPath(); ctx.arc(-30, -20, 1.6, 0, 7); ctx.fill();
  // ゴースト: 戻るべき姿勢（直立）の破線アウトライン。母船と一緒に動く。条件成立で青緑に点灯
  if (!m.docked) {
    const lit = m.dockT > 0 || m.result === 'win', gc = lit ? '#63D8C9' : rgba(p.fg, armed ? 1 : 0.85), gy = RING_DY;
    ctx.save(); ctx.translate(0, gy); ctx.lineWidth = lit ? 2.2 : 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = gc;
    if (lit) { ctx.shadowColor = '#63D8C9'; ctx.shadowBlur = 12; }
    ctx.setLineDash([3, 2.5]);
    ctx.beginPath(); ctx.moveTo(-9, -4); ctx.arc(0, -4, 9, Math.PI, 0, false); ctx.lineTo(9, 5); ctx.quadraticCurveTo(9, 9, 5, 9); ctx.lineTo(-5, 9); ctx.quadraticCurveTo(-9, 9, -9, 5); ctx.closePath(); ctx.stroke();   // 船体
    ctx.beginPath(); ctx.moveTo(-6, 6.5); ctx.lineTo(-12.2, 14.4); ctx.moveTo(6, 6.5); ctx.lineTo(12.2, 14.4); ctx.moveTo(-2.7, 8.5); ctx.lineTo(-3.7, 12.2); ctx.lineTo(3.7, 12.2); ctx.lineTo(2.7, 8.5); ctx.stroke();   // 脚・ノズル
    ctx.beginPath(); ctx.ellipse(-14.4, 15, 3.8, 1.35, 0, 0, 7); ctx.moveTo(18.2, 15); ctx.ellipse(14.4, 15, 3.8, 1.35, 0, 0, 7); ctx.stroke();
    if (lit) { ctx.fillStyle = rgba('#63D8C9', 0.18); ctx.beginPath(); ctx.arc(0, 0, 14, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // ドッキング枠
  const pulse = 0.65 + 0.35 * Math.sin(t * 5), R = l.params.ring;
  const cy = RING_DY;
  ctx.shadowColor = ringCol; ctx.shadowBlur = armed ? 10 * pulse : 0;
  ctx.strokeStyle = ringCol; ctx.lineWidth = armed ? 2.2 : 1.4; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -t * 14;
  ctx.beginPath(); ctx.arc(0, cy, R, 0, 7); ctx.stroke(); ctx.setLineDash([]); ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(ringCol, armed ? 0.1 + 0.06 * pulse : 0.05); ctx.beginPath(); ctx.arc(0, cy, R, 0, 7); ctx.fill();
  ctx.strokeStyle = rgba(ringCol, 0.8); ctx.lineWidth = 1.6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';   // 上向きシェブロン
  for (let i = 0; i < 2; i++) { const yy = cy + 5 - i * 7; ctx.beginPath(); ctx.moveTo(-5, yy + 3); ctx.lineTo(0, yy - 2); ctx.lineTo(5, yy + 3); ctx.stroke(); }
  if (!armed && !m.result) txt(ctx, 'DOCK', 0, cy + R + 4, 6.5, rgba(p.mid, 0.6), 'center', { w: 600, sp: 1.5 });
  ctx.restore();
}

function drawTerrain(ctx, l) {
  const p = P();
  ctx.beginPath(); ctx.moveTo(0, H);
  for (const q of terrain) ctx.lineTo(q.x, q.y);
  ctx.lineTo(W, H); ctx.closePath();
  const g = ctx.createLinearGradient(0, 490, 0, 600); g.addColorStop(0, '#4a4a52'); g.addColorStop(1, '#25262c');
  ctx.fillStyle = g; ctx.fill();
  ctx.save(); ctx.clip();
  for (const c of CRATERS) {            // クレーター: 暗い楕円 + 明るい縁
    const y = l.terrainY(c.x) + c.d * 0.5 + 4;
    ctx.fillStyle = 'rgba(15,16,20,0.45)'; ctx.beginPath(); ctx.ellipse(c.x, y, c.r, c.r * 0.28, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(140,142,154,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(c.x, y, c.r, c.r * 0.28, 0, Math.PI, 2 * Math.PI); ctx.stroke();
  }
  for (const k of PEBBLES) { ctx.fillStyle = 'rgba(110,112,124,0.7)'; ctx.beginPath(); ctx.ellipse(k.x, l.terrainY(k.x) + k.d * 0.5 + 3, k.r * 1.4, k.r, 0, 0, 7); ctx.fill(); }
  ctx.restore();
  ctx.beginPath(); for (const q of terrain) (q === terrain[0] ? ctx.moveTo(q.x, q.y) : ctx.lineTo(q.x, q.y));
  ctx.strokeStyle = '#9a9eae'; ctx.lineWidth = 1.2; ctx.stroke();
  drawSite(ctx, l);
}

function drawSite(ctx, l) {
  const p = P(), m = l.m, t = l.clock, done = m.sampled;
  const col = done ? p.green : p.warn, x0 = SITE.x, x1 = SITE.x + SITE.w, y = SITE.y;
  ctx.save();
  // 地面の発光ストリップ + 角のブラケット
  ctx.fillStyle = rgba(col, 0.16 + 0.08 * Math.sin(t * 4)); ctx.fillRect(x0, y - 1, SITE.w, 5);
  ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x0, y - 9); ctx.lineTo(x0, y - 1); ctx.lineTo(x0 + 7, y - 1); ctx.moveTo(x1, y - 9); ctx.lineTo(x1, y - 1); ctx.lineTo(x1 - 7, y - 1); ctx.stroke();
  ctx.fillStyle = col; ctx.fillRect(SITE.x + SITE.w / 2 - 4, y - 1.5, 8, 2);
  // 採取ゲージ（地面の帯）
  ctx.fillStyle = rgba(p.fg, 0.1); ctx.fillRect(x0 + 6, y + 6, SITE.w - 12, 3);
  ctx.fillStyle = p.green; ctx.fillRect(x0 + 6, y + 6, (SITE.w - 12) * (done ? 1 : m.gauge), 3);
  // 呼び出しラベル（採取前のみ）
  if (!done && l.state !== 'grounded') {
    const by = Math.sin(t * 4) * 3;
    txt(ctx, 'SAMPLE SITE', SITE.x + SITE.w / 2, y - 44 + by, 8, col, 'center', { w: 700, sp: 1.2 });
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(SITE.x + SITE.w / 2 - 5, y - 32 + by); ctx.lineTo(SITE.x + SITE.w / 2 + 5, y - 32 + by); ctx.lineTo(SITE.x + SITE.w / 2, y - 25 + by); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function onDrawMid() {}

function star(ctx, cx, cy, r, on) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.42 : r; ctx.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
  ctx.closePath(); ctx.fillStyle = on ? '#FFC94D' : 'rgba(255,255,255,0.1)'; ctx.fill(); ctx.strokeStyle = on ? '#FFE9A8' : 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
}
const mmss = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };

function onDrawFront(ctx, l) {
  const p = P(), m = l.m, s = l.ship;
  // 採取中: 機体の周りに円ゲージ
  if (!m.sampled && m.gauge > 0 && !m.result) {
    ctx.save(); ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.strokeStyle = rgba(p.fg, 0.15); ctx.beginPath(); ctx.arc(s.x, s.y, 26, 0, 7); ctx.stroke();
    ctx.strokeStyle = p.green; ctx.beginPath(); ctx.arc(s.x, s.y, 26, -Math.PI / 2, -Math.PI / 2 + m.gauge * Math.PI * 2); ctx.stroke(); ctx.restore();
    txt(ctx, 'SAMPLING ' + Math.round(m.gauge * 100) + '%', s.x, s.y - 46, 8, p.green, 'center', { w: 700, sp: 1 });
  }
  // タイマー + 進行チェック（右上。DEBUG ボタンの下）
  const tm = m.result === 'win' ? m.final.t : l.t;
  txt(ctx, mmss(tm), W - 12, 38, 13, p.fg, 'right', { w: 700 });
  txt(ctx, (m.sampled ? '✓ ' : '○ ') + 'SAMPLE   ' + (m.result === 'win' ? '✓ ' : '○ ') + 'DOCK', W - 12, 56, 7.5, m.sampled ? p.green : p.dim, 'right', { w: 700, sp: 1 });
  txt(ctx, 'ATTEMPT ' + Math.max(1, m.attempt), W - 12, 68, 6.5, p.dim, 'right', { w: 600, sp: 1 });
  // ヒント
  let hint = '';
  if (!m.result) {
    if (l.t < 9 && !m.sampled && l.state !== 'grounded') hint = 'UNDOCK · LAND ON THE SITE · HOLD 2s · RETURN TO THE DOCK';
    else if (!m.sampled && l.state === 'grounded') hint = m.gauge > 0 ? 'HOLD STILL...' : (l.padAt(s.x) ? 'DON’T TOUCH THRUST' : 'MOVE ONTO THE SITE: LIFT OFF AND LAND');
    else if (m.sampled) hint = m.fb || (m.dockOk || !m.inZone ? 'FILL THE OUTLINE · UPRIGHT · MATCH SPEED (REL ≤ ' + DOCK_REL + ')' : '');
    if (hint) txt(ctx, hint, 180, 66, 7.5, m.fb ? p.bad : p.fg, 'center', { w: 600, sp: 0.4, a: 0.95 });
  }
  if (m.bumpT > 0 && !m.result) txt(ctx, 'BUMP', s.x, s.y - 30 - (0.9 - m.bumpT) * 14, 10, p.warn, 'center', { w: 800, sp: 1.5, a: Math.min(1, m.bumpT * 2) });
  if (m.toastT > 0) txt(ctx, m.toast, 180, 236, 10, p.green, 'center', { w: 700, sp: 1.2, a: Math.min(1, m.toastT) });
  // 燃料切れの警告 / 範囲外の警告
  if (!m.result && s.fuel <= 0.0001) txt(ctx, 'OUT OF FUEL  ' + Math.max(0, STRAND_S - m.strandT).toFixed(1), 180, 256, 11, p.bad, 'center', { w: 800, sp: 1.2 });
  if (!m.result) {
    const e = Math.min(s.x - OUT.x0, OUT.x1 - s.x, s.y - OUT.y0), danger = e < 46 && ((s.x < 40 && s.vx < 2) || (s.x > 320 && s.vx > -2) || (s.y < 16 && s.vy < 2));
    if (danger) { ctx.fillStyle = rgba(p.bad, 0.1 + 0.08 * Math.sin(l.clock * 12)); ctx.fillRect(0, 0, W, 540); txt(ctx, 'OUT OF RANGE', 180, 276, 10, p.bad, 'center', { w: 800, sp: 1.5 }); }
  }
  // 結果
  if (m.result && m.resultT > (m.result === 'win' ? 0.7 : 0.5)) drawResult(ctx, l);
}

function drawResult(ctx, l) {
  const p = P(), m = l.m, win = m.result === 'win';
  const k = Math.min(1, (m.resultT - (win ? 0.7 : 0.5)) / 0.3);
  ctx.save(); ctx.globalAlpha = k;
  ctx.fillStyle = 'rgba(4,6,12,0.72)'; ctx.fillRect(0, 0, W, 560);
  const x = 30, y = 100, w = 300, h = win ? 360 : 190, RY = retryY(m);
  ctx.fillStyle = 'rgba(13,17,27,0.96)'; rr(ctx, x, y, w, h, 16); ctx.fill(); ctx.strokeStyle = rgba(win ? p.green : p.bad, 0.7); ctx.lineWidth = 1.4; ctx.stroke();
  if (win) {
    const f = m.final;
    txt(ctx, 'CLEARED ON ATTEMPT ' + f.attempt, 180, y + 18, 13, p.green, 'center', { w: 800, sp: 1.4 });
    txt(ctx, 'PHOBOS SAMPLE RETURN', 180, y + 40, 8, p.dim, 'center', { w: 600, sp: 1.5 });
    const rows = [[true, 'SAMPLE RETURNED', mmss(f.t)], [f.s2, 'FUEL ≥ ' + STAR2_FUEL + '% LEFT', f.fuel.toFixed(0) + '%'], [f.s3, 'PERFECT TOUCHDOWN AT SITE', f.grade || '-']];
    rows.forEach((r, i) => {
      const ry = y + 72 + i * 50, pop = Math.min(1, Math.max(0, (m.resultT - 0.9 - i * 0.3) / 0.2));
      ctx.save(); ctx.translate(x + 38, ry + 14); ctx.scale(0.4 + 0.6 * pop, 0.4 + 0.6 * pop); ctx.globalAlpha = k * pop; star(ctx, 0, 0, 14, r[0]); ctx.restore();
      txt(ctx, r[1], x + 66, ry + 3, 9, r[0] ? p.fg : p.dim, 'left', { w: 700, sp: 0.6 });
      txt(ctx, r[2], x + 66, ry + 18, 11, r[0] ? p.warn : p.dim, 'left', { w: 700 });
      if (f.newStars[i]) txt(ctx, 'NEW', x + w - 18, ry + 10, 9, '#FFC94D', 'right', { w: 800, sp: 1.2, a: 0.6 + 0.4 * Math.sin(l.clock * 8) });
    });
    txt(ctx, 'SCORE ' + f.score, 180, y + 226, 16, '#FFC94D', 'center', { w: 800, sp: 1 });
    txt(ctx, 'ATTEMPT ' + f.attempt + ' · ×' + f.mult.toFixed(2), 180, y + 252, 9, p.warn, 'center', { w: 700, sp: 0.8 });
    txt(ctx, 'BEST ' + f.best.score + (f.newBest ? '  NEW' : '') + '   ·   ★ ' + f.best.stars.filter(Boolean).length + ' / 3 TOTAL', 180, y + 274, 8, f.newBest ? '#FFC94D' : p.dim, 'center', { w: 700, sp: 0.8 });
    txt(ctx, 'TIME ' + mmss(f.t) + '   ·   FUEL ' + f.fuel.toFixed(0) + '%', 180, y + 300, 8, p.dim, 'center', { w: 600, sp: 0.8 });
  } else {
    txt(ctx, 'MISSION FAILED', 180, y + 22, 15, p.bad, 'center', { w: 800, sp: 1.8 });
    txt(ctx, m.reason || '', 180, y + 62, 12, p.fg, 'center', { w: 700, sp: 1 });
    txt(ctx, m.detail || '', 180, y + 86, 9, p.warn, 'center', { w: 600, sp: 0.6 });
    txt(ctx, m.sampled ? 'The sample was lost.' : 'No sample collected yet.', 180, y + 118, 8, p.dim, 'center', { w: 600, sp: 0.6 });
    txt(ctx, 'TIME ' + mmss(l.t), 180, y + 142, 8, p.dim, 'center', { w: 600, sp: 0.8 });
  }
  // RETRY
  const hot = Math.floor(l.clock * 2) % 2;
  rr(ctx, 90, RY, 180, 52, 20); ctx.fillStyle = '#0D111B'; ctx.fill(); ctx.fillStyle = rgba(p.mid, 0.16 + 0.06 * hot); ctx.fill(); ctx.strokeStyle = rgba(p.mid, 0.85); ctx.lineWidth = 1.4; ctx.stroke();
  txt(ctx, 'RETRY', 180, RY + 17, 14, p.mid, 'center', { w: 800, sp: 2.5 });
  txt(ctx, 'or press R', 180, RY + 38, 7, p.dim, 'center', { w: 500, sp: 0.8 });
  ctx.restore();
}

{ const box = document.getElementById('dbg'); if (box) { const b = document.createElement('button'); b.textContent = 'RESET RECORD'; b.style.cssText = 'margin-top:8px;font:9px monospace;opacity:.6;padding:2px 6px';
  b.onclick = () => { lsSet(KEY_A, '0'); lsSet(KEY_B, ''); if (lab.m) lab.m.attempt = 0; }; box.appendChild(b); } }
if (new URLSearchParams(location.search).get('test') === '1') import('./autotest.js').then((m) => m.install(lab));
window.__score = { mult: attemptMult, score: missionScore, KEY_A, KEY_B };
lab.start();
