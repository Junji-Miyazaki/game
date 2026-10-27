// EXPEDITION 共通試作台（07_lab / v1.2 R&D）。使い方は README.md。
// game.js の Game クラスには依存しない。物理定数だけ game.js から写している（値を変えたら下の「定数」を合わせる）。
// 描画（機体・操作ボタン・文字）は 02_src/art.js を読み取り専用で import する。
import { P } from '../../../02_src/core/palette.js?v=a36de9d9c3';
import { drawShip, drawControls, txt, rgba } from '../../../02_src/art.js?v=86285db95f';

export const W = 360, H = 640;

// ---- 定数（game.js v1.1 beta.4 から複製） ----------------------------------------------------
export const C = {
  FUEL_RATE_MAIN: 5, FUEL_RATE_RCS: 1.5,
  SAFE:   { vy: 22, vx: 13, ang: 28, om: 20 },     // この内側 = 即成功
  BOUNCE: { vy: 45, vx: 26, ang: 55, om: 40 },     // この外側 = 即クラッシュ。間 = バウンス
  BOUNCE_RESTITUTION: 0.28, BOUNCE_FRICTION: 0.55, BOUNCE_ANG_DAMP: 0.45, BOUNCE_SETTLE_VY: 6,
  LAND_SLOPE_DEG: 10, FOOT_HALF: 18, LEG_Y: 16,    // 足元 = 機体中心 + 16
  LIFTOFF_MIN_S: 0.2, LIFTOFF_VY: -7,
  CONTROL_Y_MIN: 52, ZONE_L_MAX: 120, ZONE_R_MIN: 240,
};
export const GRADE_TABLE = [
  { g: 'PERFECT', vy: 8,  vx: 3,  ang: 5,  om: 6,  dist: 0.25 },
  { g: 'S',       vy: 12, vx: 6,  ang: 10, om: 10, dist: 0.5 },
  { g: 'A',       vy: 16, vx: 9,  ang: 17, om: 14, dist: 0.75 },
  { g: 'B',       vy: 20, vx: 11, ang: 24, om: 17, dist: 1.0 },
];
export const GRADE_ORDER = ['C', 'B', 'A', 'S', 'PERFECT'];
export function gradeFor(m) {
  for (const r of GRADE_TABLE) if (m.vy <= r.vy && m.vx <= r.vx && m.ang <= r.ang && m.om <= r.om && m.dist <= r.dist) return r.g;
  return 'C';
}
export const gradeRank = (g) => GRADE_ORDER.indexOf(g);

// ---- 調整できる値（URL パラメータ名 = key） --------------------------------------------------
export const PARAM_DEFS = [
  { key: 'g',      label: 'gravity px/s²',     min: 0,   max: 1,    step: 0.005, def: 0.25 },
  { key: 'thrust', label: 'main thrust px/s²', min: 0,   max: 12,   step: 0.1,   def: 5.2 },
  { key: 'ang',    label: 'angular accel °/s²', min: 5,  max: 90,   step: 1,     def: 28 },
  { key: 'damp',   label: 'ang damping ×/s',   min: 0.3, max: 1,    step: 0.01,  def: 0.82 },
  { key: 'drag',   label: 'drag 1/s',          min: 0,   max: 1,    step: 0.01,  def: 0 },
  { key: 'fuel',   label: 'fuel max',          min: 20,  max: 300,  step: 5,     def: 100 },
  { key: 'rcs',    label: 'RCS drift px/s²',   min: 0,   max: 6,    step: 0.1,   def: 2.5 },
];

const wrap180 = (a) => ((a + 180) % 360 + 360) % 360 - 180;

export function terrainYOn(pts, x) {
  x = Math.max(0, Math.min(W, x));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x <= b.x) { const t = b.x === a.x ? 0 : (x - a.x) / (b.x - a.x); return a.y + (b.y - a.y) * t; }
  }
  return pts[pts.length - 1].y;
}
export function footSlopeDeg(pts, x) {
  const xl = Math.max(0, x - C.FOOT_HALF), xr = Math.min(W, x + C.FOOT_HALF);
  if (xr - xl < 1) return 0;
  return Math.abs(Math.atan2(terrainYOn(pts, xr) - terrainYOn(pts, xl), xr - xl)) * 180 / Math.PI;
}

/**
 * createLab(opts) -> lab
 *  canvas      : <canvas>
 *  title       : パネル見出し
 *  defaults    : { g, thrust, ang, damp, drag, fuel, rcs, vec, ...extra } ミッション既定（URL が優先）
 *  extraParams : [{key,label,min,max,step,def}] ミッション固有のスライダー（lab.params[key] / URL ?key=）
 *  world       : { terrain:[{x,y}...] (x=0..360 昇順), pads:[{x,y,w,id}] }
 *  start(lab)  : リセット時に lab.ship を初期化（lab.resetShip({x,y,vx,vy,angle})）。ミッション状態もここで初期化
 *  onUpdate(lab, dt)               : 物理の後に毎フレーム
 *  onTouchdown(lab, info)          : 接地成功。info={kind:'pad'|'ground', pad, m:{vy,vx,ang,om,dist}, grade}
 *  onCrash(lab, reason, detail)    : harness 由来のクラッシュ（lab.crash() でも呼べる）
 *  onLiftoff(lab)                  : 接地 → 離陸
 *  onDrawBack(ctx, lab) / onDrawFront(ctx, lab) : 機体の背面 / 前面（HUD はこちら）
 *  onTap(lab, x, y)                : lab.controlsEnabled=false のときの画面タップ（RETRY など）
 *  forces(lab, dt)                 : （任意）play 中の物理サブステップ(1/120s)ごとの外力。推力の後・重力の前に呼ばれる
 *  velRef(lab) -> {vx,vy}|null     : 速度ベクトル矢印の基準系（例 母船に対する相対速度）
 *  telemetryExtra(lab) -> string   : パネルのテレメトリ末尾に足す
 */
export function createLab(opts) {
  const canvas = opts.canvas;
  const ctx = canvas.getContext('2d');
  const q = new URLSearchParams(location.search);
  const defs = PARAM_DEFS.concat(opts.extraParams || []).map((d) => {
    const def = (opts.defaults && opts.defaults[d.key] != null) ? opts.defaults[d.key] : d.def;
    return Object.assign({}, d, { def });
  });
  const params = {};
  for (const d of defs) {
    const v = q.has(d.key) ? parseFloat(q.get(d.key)) : d.def;
    params[d.key] = Number.isFinite(v) ? v : d.def;
  }
  params.vec = q.has('vec') ? q.get('vec') !== '0' : ((opts.defaults && opts.defaults.vec != null) ? !!opts.defaults.vec : true);

  const lab = {
    ctx, canvas, params, defs, opts, world: opts.world,
    ship: null, input: { left: false, main: false, right: false },
    state: 'play',           // 'play' | 'grounded' | 'crashed'
    t: 0, clock: 0,          // t=リセットからの経過(シミュレーション秒) / clock=ページ通算(演出用)
    frozen: false,           // true の間は機体の物理を止める（ドッキング後など）
    controlsEnabled: true,   // false の間は入力を機体に渡さず、タップを onTap に渡す
    hideShip: false, showHud: opts.hud !== false,
    groundedT: 0, lastTouch: null, crashInfo: null,
    particles: [],
    script: null,            // テスト用: (lab)=>({left,main,right})。設定すると実入力の代わりに使う
    scale: 1,
  };

  // ---------------------------------------------------------------- 状態
  lab.resetShip = (s) => {
    lab.ship = Object.assign({ x: 180, y: 100, vx: 0, vy: 0, angle: 0, omega: 0, fuel: params.fuel }, s || {});
    if (s && s.fuel == null) lab.ship.fuel = params.fuel;
    lab.state = 'play'; lab.groundedT = 0; lab._bouncing = false; lab._contact0 = null;
    lab.thr = { main: false, left: false, right: false };
  };
  lab.reset = () => {
    lab.t = 0; lab.frozen = false; lab.controlsEnabled = true; lab.hideShip = false;
    lab.lastTouch = null; lab.crashInfo = null; lab.particles.length = 0; lab._bouncing = false;
    lab.resetShip();
    if (opts.start) opts.start(lab);
  };
  lab.crash = (reason, detail) => {
    if (lab.state === 'crashed') return;
    lab.state = 'crashed'; lab.crashInfo = { reason, detail: detail || '' };
    lab.thr = { main: false, left: false, right: false };
    burst(lab.ship.x, lab.ship.y, 26, '#FFB547');
    if (opts.onCrash) opts.onCrash(lab, reason, detail || '');
  };
  const burst = (x, y, n, col) => {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 10 + Math.random() * 50;
      lab.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.7, col, r: 1 + Math.random() * 1.6 });
    }
  };
  const dust = (x, y, strength) => {
    for (let side = -1; side <= 1; side += 2) for (let i = 0; i < 6; i++)
      lab.particles.push({ x: x + side * (9 + Math.random() * 8), y: y - 1, vx: side * (6 + Math.random() * 22) * strength, vy: -(2 + Math.random() * 9) * strength, life: 0.5 + Math.random() * 0.5, col: '#9a9aa4', r: 1.2 + Math.random() * 1.2 });
  };
  lab.burst = burst;

  // ---------------------------------------------------------------- 入力
  const keys = { left: false, main: false, right: false };
  const pointers = new Map();
  const keyMap = (e, v) => {
    const k = e.key;
    if (k === 'ArrowLeft' || k === 'a') keys.left = v;
    else if (k === 'ArrowRight' || k === 'd') keys.right = v;
    else if (k === 'ArrowUp' || k === 'w' || k === ' ') keys.main = v;
    else return false;
    return true;
  };
  window.addEventListener('keydown', (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') { lab.reset(); e.preventDefault(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (keyMap(e, true)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { if (keyMap(e, false)) e.preventDefault(); });
  window.addEventListener('blur', () => { keys.left = keys.main = keys.right = false; pointers.clear(); });
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / lab.scale, y: (e.clientY - r.top) / lab.scale }; };
  canvas.addEventListener('pointerdown', (e) => {
    const p = toLogical(e); pointers.set(e.pointerId, p);
    try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
    if (!lab.controlsEnabled && opts.onTap) opts.onTap(lab, p.x, p.y);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => { if (pointers.has(e.pointerId)) pointers.set(e.pointerId, toLogical(e)); });
  const up = (e) => { pointers.delete(e.pointerId); };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  const readInput = () => {
    let l = keys.left, m = keys.main, r = keys.right;
    for (const p of pointers.values()) {
      if (!(p.y > C.CONTROL_Y_MIN)) continue;
      if (p.x < C.ZONE_L_MAX) l = true; else if (p.x > C.ZONE_R_MIN) r = true; else m = true;
    }
    if (lab.script) { const s = lab.script(lab) || {}; l = !!s.left; m = !!s.main; r = !!s.right; }
    if (!lab.controlsEnabled) { l = m = r = false; }
    lab.input = { left: l, main: m, right: r };
  };

  // ---------------------------------------------------------------- 物理
  const terrainY = (x) => terrainYOn(lab.world.terrain, x);
  lab.terrainY = terrainY;
  lab.padAt = (x) => (lab.world.pads || []).find((p) => x >= p.x && x <= p.x + p.w) || null;

  const stepPhysics = (dt) => {
    const s = lab.ship, pr = params, inp = lab.input;
    if (lab.state === 'crashed' || lab.frozen) { lab.thr = { main: false, left: false, right: false }; return; }
    if (lab.state === 'grounded') {
      s.vx = 0; s.vy = 0; s.omega = 0;
      s.angle *= Math.pow(0.02, dt);
      s.y = terrainY(s.x) - C.LEG_Y;
      lab.groundedT += dt;
      lab.thr = { main: false, left: false, right: false };
      if (s.fuel > 0 && inp.main && lab.groundedT >= C.LIFTOFF_MIN_S) {
        lab.state = 'play'; s.vy = C.LIFTOFF_VY; s.y -= 2; lab._contact0 = null; lab._bouncing = false;
        if (opts.onLiftoff) opts.onLiftoff(lab);
      }
      return;
    }
    const fuelOk = s.fuel > 0;
    lab.thr = { main: inp.main && fuelOk, left: inp.left && fuelOk, right: inp.right && fuelOk };
    // RCS（左ボタン = 時計回り + 右ドリフト。game.js と同じ向き）
    if (inp.left && s.fuel > 0)  { s.omega += pr.ang * dt; s.vx += pr.rcs * dt;  s.fuel = Math.max(0, s.fuel - C.FUEL_RATE_RCS * dt); }
    if (inp.right && s.fuel > 0) { s.omega -= pr.ang * dt; s.vx -= pr.rcs * dt;  s.fuel = Math.max(0, s.fuel - C.FUEL_RATE_RCS * dt); }
    s.omega *= Math.pow(pr.damp, dt);
    s.angle = wrap180(s.angle + s.omega * dt);
    if (inp.main && s.fuel > 0) {
      const rad = s.angle * Math.PI / 180;
      s.vx += Math.sin(rad) * pr.thrust * dt;
      s.vy += -Math.cos(rad) * pr.thrust * dt;
      s.fuel = Math.max(0, s.fuel - C.FUEL_RATE_MAIN * dt);
    }
    if (opts.forces) opts.forces(lab, dt);   // ミッション固有の外力（噴気など）。s.vx/vy/omega を直接変えてよい。play 中の物理サブステップごと
    s.vy += pr.g * dt;
    if (pr.drag > 0) { s.vx -= s.vx * pr.drag * dt; s.vy -= s.vy * pr.drag * dt; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    checkCollision();
  };

  const worst = (m, lim, keys2) => {   // 限界に対する超過率が最大の項目
    let best = null, r = 0;
    for (const k of keys2) { const q2 = m[k] / lim[k]; if (q2 > r) { r = q2; best = k; } }
    const nm = { vy: 'DESCENT', vx: 'DRIFT', ang: 'TILT', om: 'SPIN' }, un = { vy: 'px/s', vx: 'px/s', ang: '°', om: '°/s' };
    return best ? `${nm[best]} ${m[best].toFixed(0)}${un[best]} (limit ${lim[best]})` : '';
  };

  const checkCollision = () => {
    const s = lab.ship, pts = lab.world.terrain;
    const ty = terrainY(s.x);
    if (s.y + C.LEG_Y < ty) return;
    const pad = lab.padAt(s.x);
    const m = { vy: Math.abs(s.vy), vx: Math.abs(s.vx), ang: Math.abs(wrap180(s.angle)), om: Math.abs(s.omega) };
    if (!lab._bouncing && !lab._contact0) lab._contact0 = Object.assign({}, m);
    const B = C.BOUNCE, S = C.SAFE;
    if (!pad) {
      if (m.ang > B.ang) return lab.crash('TIPPED OVER', `TILT ${m.ang.toFixed(0)}° (limit ${B.ang})`);
      if (m.vy > B.vy || m.vx > B.vx || m.om > B.om) return lab.crash('HARD IMPACT', worst(m, B, ['vy', 'vx', 'om']));
      const sl = footSlopeDeg(pts, s.x);
      if (sl > C.LAND_SLOPE_DEG) return lab.crash('STEEP GROUND', `SLOPE ${sl.toFixed(0)}° (limit ${C.LAND_SLOPE_DEG})`);
    }
    const land = () => {
      const c0 = lab._contact0 || m;
      const dist = pad ? Math.abs(s.x - (pad.x + pad.w / 2)) / (pad.w / 2) : 9;
      const mm = { vy: c0.vy, vx: c0.vx, ang: c0.ang, om: c0.om, dist };
      lab.state = 'grounded'; lab.groundedT = 0; lab._bouncing = false; lab._contact0 = null;
      s.vx = 0; s.vy = 0; s.omega = 0; s.y = terrainY(s.x) - C.LEG_Y;
      dust(s.x, ty, pad ? 1 : 0.6);
      const info = { kind: pad ? 'pad' : 'ground', pad, m: mm, grade: pad ? gradeFor(mm) : null };
      lab.lastTouch = info;
      if (opts.onTouchdown) opts.onTouchdown(lab, info);
    };
    if (lab._bouncing) {
      if (m.vy <= C.BOUNCE_SETTLE_VY && m.vx <= S.vx && m.ang <= S.ang) return land();
      if (m.vy > B.vy || m.vx > B.vx || m.ang > B.ang) return lab.crash('HARD IMPACT', worst(m, B, ['vy', 'vx', 'ang']));
    }
    if (m.vy <= S.vy && m.vx <= S.vx && m.ang <= S.ang && m.om <= S.om) return land();
    if (m.vy <= B.vy && m.vx <= B.vx && m.ang <= B.ang && m.om <= B.om) {   // バウンス
      s.y = ty - C.LEG_Y;
      const tilt = 1 + (m.ang / B.ang) * 0.5;
      s.vy = -Math.abs(s.vy) * C.BOUNCE_RESTITUTION * tilt; s.vx *= C.BOUNCE_FRICTION; s.omega *= C.BOUNCE_ANG_DAMP;
      s.omega += -s.angle * 0.15;
      lab._bouncing = true; dust(s.x, ty, 0.5);
      return;
    }
    lab.crash('HARD IMPACT', worst(m, B, ['vy', 'vx', 'ang', 'om']));
  };

  const SUB = 1 / 120;
  lab.step = (dt) => {   // 1フレーム分（描画なし）。テストの simulate() もこれを使う
    lab.clock += dt;
    readInput();
    let left = dt;
    while (left > 1e-9) { const h = Math.min(SUB, left); stepPhysics(h); left -= h; lab.t += (lab.state === 'crashed' ? 0 : h); }
    for (const p of lab.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    lab.particles = lab.particles.filter((p) => p.life > 0);
    if (opts.onUpdate) opts.onUpdate(lab, dt);
  };
  // テスト用: controller(lab)->{left,main,right} で seconds 秒進める（untilFn が真になったら止める）
  lab.simulate = (seconds, controller, untilFn) => {
    const old = lab.script; if (controller) lab.script = controller;
    const n = Math.round(seconds * 60);
    for (let i = 0; i < n; i++) { lab.step(1 / 60); if (untilFn && untilFn(lab)) break; }
    lab.script = old;
  };

  // ---------------------------------------------------------------- 描画
  const fuelPct = () => 100 * lab.ship.fuel / params.fuel;
  lab.fuelPct = fuelPct;

  function drawVector() {
    const s = lab.ship, ref = opts.velRef ? opts.velRef(lab) : null;
    const vx = s.vx - (ref ? ref.vx : 0), vy = s.vy - (ref ? ref.vy : 0);
    const sp = Math.hypot(vx, vy), p = P();
    ctx.save();
    // 機首方向の細い点線（逆噴射の向き合わせ用）
    const rad = s.angle * Math.PI / 180;
    ctx.setLineDash([2, 3]); ctx.strokeStyle = rgba(p.fg, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(s.x + Math.sin(rad) * 18, s.y - Math.cos(rad) * 18); ctx.lineTo(s.x + Math.sin(rad) * 44, s.y - Math.cos(rad) * 44); ctx.stroke();
    ctx.setLineDash([]);
    if (sp > 1.5) {
      const len = Math.min(64, 6 + sp * 1.6), ux = vx / sp, uy = vy / sp;
      const x0 = s.x + ux * 20, y0 = s.y + uy * 20, x1 = s.x + ux * (20 + len), y1 = s.y + uy * (20 + len);
      ctx.strokeStyle = p.mid; ctx.fillStyle = p.mid; ctx.lineWidth = 2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      const ax = -uy, ay = ux;
      ctx.beginPath(); ctx.moveTo(x1 + ux * 6, y1 + uy * 6); ctx.lineTo(x1 + ax * 4, y1 + ay * 4); ctx.lineTo(x1 - ax * 4, y1 - ay * 4); ctx.closePath(); ctx.fill();
      if (ref) txt(ctx, 'REL ' + sp.toFixed(0), x1 + ux * 8 - 12, y1 + uy * 8 - 4, 7, p.mid, 'left', { w: 600 });
    }
    ctx.restore();
  }

  // 標準の小さな HUD: 燃料バー + 速度(DESCENT/DRIFT/TILT/SPIN)。安全範囲を超えると琥珀/赤
  lab.drawHud = (x = 12, y = 12) => {
    const s = lab.ship, p = P(), fp = Math.max(0, fuelPct());
    txt(ctx, 'FUEL', x, y, 7, p.dim, 'left', { w: 600, sp: 1.2 });
    ctx.fillStyle = rgba(p.fg, 0.12); ctx.fillRect(x + 28, y + 2, 84, 5);
    ctx.fillStyle = fp < 20 ? p.bad : p.warn; ctx.fillRect(x + 28, y + 2, 84 * fp / 100, 5);
    txt(ctx, fp.toFixed(0) + '%', x + 118, y, 8, fp < 20 ? p.bad : p.fg, 'left', { w: 600 });
    const items = [['DESC', Math.abs(s.vy), C.SAFE.vy, ''], ['DRIFT', Math.abs(s.vx), C.SAFE.vx, ''], ['TILT', Math.abs(wrap180(s.angle)), C.SAFE.ang, '°'], ['SPIN', Math.abs(s.omega), C.SAFE.om, '']];
    items.forEach((it, i) => {
      const bx = x + i * 52, v = it[1], col = v <= it[2] ? p.green : (v <= it[2] * 1.9 ? p.warn : p.bad);
      txt(ctx, it[0], bx, y + 14, 6.5, p.dim, 'left', { w: 600, sp: 1 });
      txt(ctx, v.toFixed(0) + it[3], bx, y + 22, 11, col, 'left', { w: 700 });
    });
  };

  lab.draw = () => {
    const p = P(), s = lab.ship;
    ctx.save();
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    if (opts.onDrawBack) opts.onDrawBack(ctx, lab);
    drawGround();
    if (opts.onDrawMid) opts.onDrawMid(ctx, lab);
    if (!lab.hideShip && lab.state !== 'crashed') {
      drawShip(ctx, s.x, s.y, s.angle, lab.thr.main, lab.thr.left, lab.thr.right, lab.clock);
      if (params.vec && lab.state === 'play' && !lab.frozen) drawVector();
    }
    for (const q2 of lab.particles) { ctx.globalAlpha = Math.max(0, Math.min(1, q2.life * 1.6)); ctx.fillStyle = q2.col; ctx.beginPath(); ctx.arc(q2.x, q2.y, q2.r, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    if (opts.onDrawFront) opts.onDrawFront(ctx, lab);
    if (lab.showHud) lab.drawHud();
    drawControls(ctx, lab.input.left, lab.input.main, lab.input.right, 0, lab.clock);
    ctx.restore();
  };

  function drawGround() {
    const pts = lab.world.terrain;
    if (opts.drawTerrain) { opts.drawTerrain(ctx, lab); return; }
    ctx.beginPath(); ctx.moveTo(0, H);
    for (const q2 of pts) ctx.lineTo(q2.x, q2.y);
    ctx.lineTo(W, H); ctx.closePath();
    ctx.fillStyle = '#3a3c46'; ctx.fill();
    ctx.strokeStyle = '#8a90a0'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  // ---------------------------------------------------------------- 画面サイズ（engine.js と同じ「見た目 360x640 を中央にフィット」）
  const resize = () => {
    const dpr = window.devicePixelRatio || 1, vw = window.innerWidth, vh = window.innerHeight;
    lab.scale = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * lab.scale), ch = Math.floor(H * lab.scale);
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas.width = Math.floor(cw * dpr); canvas.height = Math.floor(ch * dpr);
    ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = true;
  };
  window.addEventListener('resize', resize); resize();

  // ---------------------------------------------------------------- デバッグパネル（HTML）
  buildPanel(lab, defs, opts);

  // ---------------------------------------------------------------- ループ
  let last = performance.now();
  const loop = (now) => {
    let dt = (now - last) / 1000; last = now;
    if (dt > 0.1) dt = 0.1;
    lab.step(dt); lab.draw();
    requestAnimationFrame(loop);
  };
  lab.start = () => { lab.reset(); last = performance.now(); requestAnimationFrame(loop); };
  window.__lab = lab;
  return lab;
}

// =====================================================================================
function buildPanel(lab, defs, opts) {
  const st = document.createElement('style');
  st.textContent = `
  html,body{margin:0;height:100%;background:#020306;overflow:hidden;touch-action:none;-webkit-user-select:none;user-select:none}
  body{display:flex;align-items:center;justify-content:center}
  canvas{display:block;touch-action:none;background:#06080E}
  #dbgBtn{position:fixed;top:6px;right:6px;z-index:20;background:#0D111Bcc;color:#9aa4b8;border:1px solid #2a3348;border-radius:12px;padding:5px 10px;font:11px -apple-system,sans-serif}
  #dbg{position:fixed;top:34px;right:6px;z-index:19;width:236px;max-height:calc(100vh - 44px);overflow:auto;background:#0D111Bee;color:#c9d2e3;border:1px solid #2a3348;border-radius:10px;padding:8px 10px;font:11px -apple-system,"Hiragino Sans",sans-serif;display:none;touch-action:pan-y}
  #dbg.open{display:block}
  #dbg h4{margin:0 0 6px;font-size:11px;color:#63D8C9;letter-spacing:.08em}
  #dbg label{display:block;margin:5px 0 0;color:#8f9ab0}
  #dbg label b{float:right;color:#ECE6D8;font-weight:600}
  #dbg input[type=range]{width:100%;margin:2px 0 0;touch-action:pan-y}
  #dbg .row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
  #dbg button{background:#162033;color:#ECE6D8;border:1px solid #2a3348;border-radius:8px;padding:5px 9px;font:inherit}
  #dbg pre{margin:8px 0 0;padding:6px;background:#06080E;border-radius:6px;color:#7FE3B0;font:10.5px ui-monospace,Menlo,monospace;white-space:pre;line-height:1.35}`;
  document.head.appendChild(st);
  const btn = document.createElement('button'); btn.id = 'dbgBtn'; btn.textContent = 'DEBUG'; document.body.appendChild(btn);
  const box = document.createElement('div'); box.id = 'dbg'; document.body.appendChild(box);
  btn.addEventListener('click', () => box.classList.toggle('open'));
  if (window.innerWidth >= 760 || new URLSearchParams(location.search).get('dbg') === '1') box.classList.add('open');

  const h = document.createElement('h4'); h.textContent = (opts.title || 'LAB') + ' · TUNING'; box.appendChild(h);
  const sync = () => {   // URL に既定と違う値だけ書く
    const q = new URLSearchParams(location.search);
    for (const d of defs) { if (Math.abs(lab.params[d.key] - d.def) > 1e-9) q.set(d.key, String(+lab.params[d.key].toFixed(4))); else q.delete(d.key); }
    const vdef = (opts.defaults && opts.defaults.vec != null) ? !!opts.defaults.vec : true;
    if (lab.params.vec !== vdef) q.set('vec', lab.params.vec ? '1' : '0'); else q.delete('vec');
    history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : ''));
  };
  const fmt = (v, step) => (+v).toFixed(step < 0.01 ? 3 : step < 0.1 ? 2 : step < 1 ? 1 : 0);
  const inputs = {};
  for (const d of defs) {
    const lb = document.createElement('label'); const val = document.createElement('b'); val.textContent = fmt(lab.params[d.key], d.step);
    lb.textContent = d.label; lb.appendChild(val);
    const r = document.createElement('input'); r.type = 'range'; r.min = d.min; r.max = d.max; r.step = d.step; r.value = lab.params[d.key];
    r.addEventListener('input', () => {
      lab.params[d.key] = parseFloat(r.value); val.textContent = fmt(r.value, d.step); sync();
      if (d.key === 'fuel') lab.ship.fuel = Math.min(lab.ship.fuel, lab.params.fuel);   // 現在値は上限に丸めるだけ（リセットで満タン）
    });
    r.addEventListener('keydown', (e) => e.stopPropagation());
    box.appendChild(lb); box.appendChild(r); inputs[d.key] = { r, val, d };
  }
  const vl = document.createElement('label'); const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = lab.params.vec;
  cb.addEventListener('change', () => { lab.params.vec = cb.checked; sync(); });
  vl.appendChild(cb); vl.appendChild(document.createTextNode(' velocity vector + nose line')); box.appendChild(vl);
  const row = document.createElement('div'); row.className = 'row';
  const mk = (t, fn) => { const b = document.createElement('button'); b.textContent = t; b.addEventListener('click', (e) => { fn(); b.blur(); }); row.appendChild(b); };
  mk('RESET (R)', () => lab.reset());
  mk('DEFAULTS', () => {
    for (const d of defs) { lab.params[d.key] = d.def; inputs[d.key].r.value = d.def; inputs[d.key].val.textContent = fmt(d.def, d.step); }
    lab.params.vec = (opts.defaults && opts.defaults.vec != null) ? !!opts.defaults.vec : true; cb.checked = lab.params.vec; sync(); lab.reset();
  });
  mk('COPY LINK', () => { sync(); const u = location.href; (navigator.clipboard ? navigator.clipboard.writeText(u) : Promise.reject()).catch(() => prompt('URL', u)); });
  box.appendChild(row);
  const pre = document.createElement('pre'); box.appendChild(pre);
  setInterval(() => {
    if (!box.classList.contains('open') || !lab.ship) return;
    const s = lab.ship, alt = lab.terrainY(s.x) - (s.y + C.LEG_Y);
    let o = `state ${lab.state}${lab.frozen ? ' (frozen)' : ''}\nt     ${lab.t.toFixed(1)} s\nvx    ${s.vx.toFixed(1)}\nvy    ${s.vy.toFixed(1)}\nangle ${s.angle.toFixed(1)}°\nomega ${s.omega.toFixed(1)}\nfuel  ${s.fuel.toFixed(1)} (${lab.fuelPct().toFixed(0)}%)\nalt   ${alt.toFixed(0)} px`;
    if (opts.telemetryExtra) o += '\n' + opts.telemetryExtra(lab);
    pre.textContent = o;
  }, 100);
}
