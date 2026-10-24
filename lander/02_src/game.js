// LANDER: Control attitude with RCS thrusters and soft-land on the lunar surface.
// Reaction-thruster convention (physically correct):
//   LEFT  button (x < 120): right-side thruster fires RIGHT -> reaction pushes nose LEFT  -> craft rotates CW  (omega +)
//   RIGHT button (x > 240): left-side thruster fires LEFT  -> reaction pushes nose RIGHT -> craft rotates CCW (omega -)
//   THRUST button (center): main engine fires along craft's up-axis.
// Safe landing on the pad = STAGE CLEAR. Crash = GAME OVER.
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, saveRanking, insertEntry, qualifies, drawRankingRows } from './ranking.js';

export const meta = {
  id: 'lander',
  title: 'LANDER',
  desc: 'Attitude control: soft-land on the lunar surface',
  glyph: '^',
};

// ---- Physics tuning constants ----
// GRAVITY_BASE: Stage-1 gravity in px/s^2. ゆっくりとした降下で余裕のある操作感。
// THRUST_ACCEL: メインエンジン加速度。明確に降下を止められる適度な推力。
// ANG_ACCEL: RCS回転加速度。慎重な姿勢制御のため抑え目。
// ANG_DAMP: 角速度の減衰。パイロットが姿勢を安定させやすくする。
// RCS_DRIFT: サイドジェットの横方向ドリフト量（px/s^2）。ジェット排気の反作用。
const GRAVITY_BASE      = 0.25;  // px/s^2 — ステージ1はさらにゆっくりとした降下（旧値0.35）
const THRUST_ACCEL      = 5.2;   // px/s^2 — 明確に降下を止められる推力（旧値3.5）。保持すれば確実に上昇。
const ANG_ACCEL         = 28.0;  // deg/s^2 — 慎重な姿勢変更（旧値40.0）
const ANG_DAMP          = 0.82;  // 角速度減衰（旧値0.88、より強い減衰で安定しやすく）
const RCS_DRIFT         = 2.5;   // px/s^2 — サイドジェット横ドリフト（排気反作用）
// NO VEL_DAMP — 並進運動はニュートン力学（減衰なし）
const FUEL_MAX          = 100;
const FUEL_RATE_MAIN    = 5;     // 燃料消費（主エンジン）
const FUEL_RATE_RCS     = 1.5;   // 燃料消費（RCS）

// ---- Landing tolerance constants ----
// 成功着陸の許容値（緩め）。ここを下回れば即成功。
const SAFE_VY           = 22;    // px/s 垂直速度上限（旧値14）
const SAFE_VX           = 13;    // px/s 水平速度上限（旧値8）
const SAFE_ANGLE        = 28;    // deg  傾き上限（旧値18）
const SAFE_OMEGA        = 20;    // deg/s 角速度上限（旧値12）

// バウンス許容値（SAFE_*を超えてもここを下回ればバウンスで再チャンス）。
// BOUNCE_*はSAFE_*より大きな値。接触速度が低ければ「弾んで落ち着く」挙動。
const BOUNCE_VY         = 45;    // px/s 垂直速度上限（これ以上は即クラッシュ）
const BOUNCE_VX         = 26;    // px/s 水平速度上限（これ以上は即クラッシュ）
const BOUNCE_ANGLE      = 55;    // deg  傾き上限（これ以上は即クラッシュ）
const BOUNCE_OMEGA      = 40;    // deg/s 角速度上限（これ以上は即クラッシュ）

// バウンス後の速度反発係数（着地面との反射）
const BOUNCE_RESTITUTION = 0.28; // 垂直速度の残存率（0=完全吸収, 1=完全弾性）
const BOUNCE_FRICTION    = 0.55; // 水平速度の残存率（摩擦）
const BOUNCE_ANG_DAMP    = 0.45; // バウンス後の角速度残存率
// バウンスで着陸成功とみなす速度しきい値（バウンス後にこれ以下になったら成功）
const BOUNCE_SETTLE_VY   = 6;    // px/s
const PAD_W_BASE        = 54;
const TERRAIN_SEGS      = 18;
const LANDER_START_Y    = 90;
const GUIDE_THRESHOLD   = 30;    // ON COURSEとみなす誘導線からの距離(px)
const GUIDE_PTS         = 32;

// Control zones (logical coordinates 0..360)
const ZONE_L_MAX  = 120;  // left button: x < ZONE_L_MAX
const ZONE_R_MIN  = 240;  // right button: x > ZONE_R_MIN
const CONTROL_Y_MIN = 52; // ignore pointer input above this Y (BACK button zone)

// Bottom button bar geometry
const BTN_Y   = H - 80;  // top of button bar
const BTN_H   = 80;       // height of button bar

// ---- Terrain band (B2: pad must stay clear of the button bar) ----
// パッド(脚10px含む)の下端が常に BTN_Y-12 以上上に来るよう、地形帯をボタン帯より上に置く。
const FLOOR_Y     = 540;  // 地形の左右端の高さ（ボタン帯の背後へ塗りは続く）
const FLOOR_MIN   = 440;  // 地形の最も高い点
const PAD_Y_MIN   = 455;  // パッド面の取りうる最小Y
const PAD_Y_RANGE = 60;   // パッド面Y = PAD_Y_MIN .. PAD_Y_MIN+60 (=515)。脚込み下端 <= 525 <= BTN_Y-12

// ---- Continues / bonus / landing sequence ----
const CONTINUES_MAX     = 3;
const BOUNCE_RESOLVE_S  = 1.5;   // バウンス状態がこの累積秒数を超えたら決着 (B1')
const BOUNCE_RESOLVE_DEG = 33;   // 決着時の成功傾き上限
const BOUNCE_AIRBORNE_PX = 30;   // 地面からこれ以上離れたら「離陸」とみなしバウンス状態を解除
const INPUT_LOCK_S      = 0.5;   // 結果画面に入った直後の入力無視（押しっぱなしの指を離した際の誤タップ対策）
const BONUS_EVERY       = 3;     // sステージクリア後 (s % 3 === 0) にボーナス
const BONUS_TYPES       = ['MOVING_PAD', 'PRECISION', 'FUEL_RUN'];
const PRECISION_PAD_W   = 22;
const FUEL_RUN_FUEL     = 45;    // FUEL_MAX の45%
const MOVING_PLATEAU_SEGS = 8;   // 160px の平坦台地
const MOVING_PAD_PERIOD = 6;     // 秒
const LANDING_SEQ_S     = 2.6;

// 着陸シーケンスのフェーズ（データ駆動）。t(秒) -> {name, p(0..1: フェーズ内進行)}
export const LANDING_PHASES = [
  { name: 'hatch',   t0: 0.0, t1: 0.4 },
  { name: 'descend', t0: 0.4, t1: 1.2 },
  { name: 'walk',    t0: 1.2, t1: 1.6 },
  { name: 'flag',    t0: 1.6, t1: 2.0 },
  { name: 'wave',    t0: 2.0, t1: LANDING_SEQ_S },
];
export function landingPhase(t) {
  for (const ph of LANDING_PHASES) {
    if (t < ph.t1) return { name: ph.name, p: Math.max(0, Math.min(1, (t - ph.t0) / (ph.t1 - ph.t0))) };
  }
  return { name: 'done', p: 1 };
}

// ---- Stage difficulty scaling ----
// Stage 1: low gravity, no obstacles.
// Stage 2+: gravity increases per stage; floating obstacles added and multiplied.
function stageParams(stage) {
  const s = Math.min(stage, 8);
  return {
    // gravity increases ~15% per stage beyond stage 1
    gravity:      GRAVITY_BASE * (1 + (s - 1) * 0.15),
    padW:         Math.max(24, PAD_W_BASE - (s - 1) * 4),
    stageBonus:   s * 50,
    // obstacles: 0 in stage 1, then 2 + (s-2) extras per stage
    obstacleCount: s <= 1 ? 0 : 2 + (s - 2),
    // obstacle drift speed scales with stage
    obstacleSpeed: 12 + (s - 1) * 4,
  };
}

// ---- Terrain generation ----
// opts.plateau: true -> MOVING_PAD用。MOVING_PLATEAU_SEGS 区間ぶんの平坦台地を作り、pad に移動範囲 minX/maxX を持たせる。
function buildTerrain(padW, opts) {
  const plateau = !!(opts && opts.plateau);
  const segW    = W / TERRAIN_SEGS;
  const pts     = [];

  for (let i = 0; i <= TERRAIN_SEGS; i++) {
    const x = i * segW;
    const y = (i === 0 || i === TERRAIN_SEGS) ? FLOOR_Y : FLOOR_MIN + Math.random() * (FLOOR_Y - FLOOR_MIN);
    pts.push({ x, y });
  }

  const flatY = PAD_Y_MIN + Math.random() * PAD_Y_RANGE;
  let flatX0, flatX1, i0, i1;
  if (plateau) {
    i0 = 1 + Math.floor(Math.random() * (TERRAIN_SEGS - MOVING_PLATEAU_SEGS - 1)); // 1 .. TERRAIN_SEGS-SEGS-1
    i1 = i0 + MOVING_PLATEAU_SEGS;
    flatX0 = i0 * segW; flatX1 = i1 * segW;
  } else {
    // パッドを置く区間（従来どおり i=2..TERRAIN_SEGS-4 から選ぶ）
    const padSeg = 2 + Math.floor(Math.random() * (TERRAIN_SEGS - 5));
    const midX = (padSeg + 0.5) * segW;
    flatX0 = midX - padW / 2; flatX1 = midX + padW / 2;
    i0 = Math.floor(flatX0 / segW);
    i1 = Math.ceil(flatX1 / segW);
  }
  // パッドの下の地形はパッド面と同じ高さに平坦化（パッド端で地形がパッドと食い違わないように）
  for (let i = i0; i <= i1; i++) pts[i].y = flatY;
  if (i0 > 0)                pts[i0 - 1].y = (pts[i0 - 1].y + flatY) / 2;
  if (i1 + 1 <= TERRAIN_SEGS) pts[i1 + 1].y = (pts[i1 + 1].y + flatY) / 2;

  const pad = { x: (flatX0 + flatX1) / 2 - padW / 2, y: flatY, w: padW, moving: plateau };
  if (plateau) { pad.minX = flatX0; pad.maxX = flatX1 - padW; pad.x = (pad.minX + pad.maxX) / 2; }
  return { pts, pad };
}

// ---- Stars (background) ----
function buildStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({
      x: Math.random() * W,
      y: 20 + Math.random() * 460,
      r: Math.random() < 0.2 ? 2 : 1,
    });
  }
  return stars;
}

// ---- Descent trajectory guide (parabolic from start to pad center) ----
function buildGuide(startX, startY, pad, numPts) {
  const targetX = pad.x + pad.w / 2;
  const targetY = pad.y;
  const pts     = [];
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    pts.push({
      x: startX + (targetX - startX) * t,
      y: startY + (targetY - startY) * (t * t),
    });
  }
  return pts;
}

// ---- Floating obstacles (stages 2+) ----
// Obstacles drift horizontally. They appear in the mid-descent zone (y 150-480)
// and bounce off the left/right walls. Touching one = crash.
function buildObstacles(count, speed) {
  const obs = [];
  if (count <= 0) return obs;
  for (let i = 0; i < count; i++) {
    // Spread evenly through descent zone, avoid spawning right at the start
    const yBand   = 150 + (i / count) * 250 + Math.random() * 50;
    const vxSign  = Math.random() < 0.5 ? 1 : -1;
    const r       = 10 + Math.floor(Math.random() * 8); // radius 10-17
    obs.push({
      x:  30 + Math.random() * (W - 60),
      y:  Math.max(150, Math.min(410, yBand)), // 地形帯(440〜)の上に収める
      vx: (speed * 0.6 + Math.random() * speed * 0.8) * vxSign,
      r,
    });
  }
  return obs;
}

export class Game extends Scene {

  enter() {
    this.high       = (this.engine.storage.getHigh(meta.id) || 0);
    this.totalScore = 0;
    this.stage      = 1;
    this.continues  = CONTINUES_MAX;
    this.bonus      = null;          // 進行中のボーナス {type, afterStage}
    this.bonusCount = 0;             // これまでに発生したボーナス数（種類のローテーション用）
    this._inputLock = 0;
    this._removeNameDom();
    this._initStage();
  }

  exit() { this._removeNameDom(); }

  // 名前入力中は BACK を無効化（誤タップで入力が消えるのを防ぐ）
  blocksBack() { return this.state === 'gameover' && this.goPhase === 'name'; }

  // ---- Initialize one stage ----
  // this.stage / this.bonus から再構築する。Continue 時も同じステージ番号（＝同じパラメータ）で呼ぶ。
  _initStage() {
    this.state    = 'play';
    this.fuel     = FUEL_MAX;
    this.angle    = (Math.random() - 0.5) * 8;  // tiny initial tilt (degrees)
    this.omega    = 0;                           // angular velocity (deg/s)
    this.x        = W / 2 + (Math.random() - 0.5) * 50;
    this.y        = LANDER_START_Y;
    this.vx       = (Math.random() - 0.5) * 4;  // near-zero initial horizontal speed
    this.vy       = 2;                           // slow initial downward speed

    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;

    const sp       = stageParams(this.stage);
    const btype    = this.bonus ? this.bonus.type : null;
    this._gravity  = sp.gravity;
    this._padW     = btype === 'PRECISION' ? PRECISION_PAD_W : sp.padW;
    if (btype === 'FUEL_RUN') this.fuel = FUEL_RUN_FUEL;

    const terrain     = buildTerrain(this._padW, { plateau: btype === 'MOVING_PAD' });
    this.terrainPts   = terrain.pts;
    this.pad          = terrain.pad;
    this._padT        = 0;
    this.stars        = this.stars || buildStars(40);

    this.guidePts = buildGuide(this.x, this.y, this.pad, GUIDE_PTS);

    this._guideDevTotal = 0;
    this._guideDevCount = 0;
    this._stageScore    = 0;
    this._guideBonus    = 0;
    this._bonusScore    = 0;
    this._bonusGrant    = false;
    this._crashReason   = '';
    this.landingSeq     = null;
    this._bannerT       = btype ? 2.8 : 0;   // ボーナス開始バナーの残り秒
    this.particles      = [];

    // バウンス状態フラグ（マージナル着地後に弾んでいる最中）と累積時間 (B1')
    this._bouncing = false;
    this._bounceTime = 0;

    // ON COURSEポップインジケーター用タイマー
    this._onCourseTime = 0;   // ON COURSE状態の累積時間(秒)
    this._onCoursePulse = 0;  // 点滅アニメーション用位相(秒)

    // Floating obstacles (stage 2+)。ボーナス中もステージs のパラメータを使う
    this.obstacles = buildObstacles(sp.obstacleCount, sp.obstacleSpeed);

    this._keys = this._keys || { left: false, right: false, up: false };
  }

  // ---- Distance to nearest guide point ----
  _distToGuide(x, y) {
    let minDist = Infinity;
    const pts = this.guidePts;
    if (!pts) return Infinity;
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x;
      const dy = y - pts[i].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  // ---- Discrete input (keyboard / tap) ----
  onInput(action, data) {
    const confirm = (action === 'tap' || action === 'confirm');

    if (this.state === 'landing') {
      // 着陸シーケンスはタップ/決定でスキップ
      if (confirm && this._inputLock <= 0) this._finishLanding();
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (this.state === 'cleared') {
      if (confirm && this._inputLock <= 0) this._nextAfterClear();
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (this.state === 'bonusfailed') {
      if (confirm && this._inputLock <= 0) this._nextAfterBonus();
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (this.state === 'crashed') {
      if (confirm && this._inputLock <= 0) {
        const g = this._giveUpRect();
        if (action === 'tap' && data && data.x >= g.x && data.x <= g.x + g.w && data.y >= g.y && data.y <= g.y + g.h) {
          this._gameOver();
        } else {
          this._continue();
        }
      }
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (this.state === 'gameover') {
      if (this.goPhase === 'name') return; // 名前入力は HTML <input> が担当
      if (confirm && this._inputLock <= 0) this.engine.toMenu();
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (this._keys) {
      if (action === 'left')    this._keys.left  = true;
      if (action === 'right')   this._keys.right = true;
      if (action === 'up')      this._keys.up    = true;
      if (action === 'confirm') this._keys.up    = true;
    }
  }

  _giveUpRect() { return { x: W / 2 - 50, y: H / 2 + 60, w: 100, h: 32 }; }

  // ---- 状態遷移 ----
  _setOverlayState(state) {
    this.state = state;
    this._inputLock = INPUT_LOCK_S;
  }

  _finishLanding() {
    this.landingSeq = null;
    this._setOverlayState('cleared');
    this._inputLock = 0.3;
  }

  // クリア画面からの遷移: s%3===0 の通常ステージ後はボーナスを挟む
  _nextAfterClear() {
    if (this.bonus) { this._nextAfterBonus(); return; }
    if (this.stage % BONUS_EVERY === 0) {
      this.bonus = { type: BONUS_TYPES[this.bonusCount % BONUS_TYPES.length], afterStage: this.stage };
      this.bonusCount += 1;
      this._initStage();
      return;
    }
    this.stage += 1;
    this._initStage();
  }

  // ボーナス終了（成功・失敗とも）-> 次の通常ステージ
  _nextAfterBonus() {
    this.bonus = null;
    this.stage += 1;
    this._initStage();
  }

  _continue() {
    this.continues = Math.max(0, this.continues - 1);
    this._initStage(); // 同一ステージ(同一パラメータ)を新しい地形で再開。totalScore はそのまま
  }

  _gameOver(applyFuelScore) {
    if (applyFuelScore) this.totalScore += Math.round((this.fuel || 0) * 2);
    if (this.totalScore > this.high) {
      this.high = this.totalScore;
      this.engine.storage.setHigh(meta.id, this.high);
    }
    this._setOverlayState('gameover');
    this.rankList = loadRanking(this.engine.storage);
    this.newIdx = -1;
    if (qualifies(this.rankList, this.totalScore)) {
      this.goPhase = 'name';
      this._showNameDom();
    } else {
      this.goPhase = 'ranking';
    }
  }

  // 名前確定（HTML入力・OKボタン・テストフックから呼ぶ）
  _submitName(name) {
    if (this.state !== 'gameover' || this.goPhase !== 'name') return;
    let nm = Array.from(String(name == null ? '' : name).trim()).slice(0, 10).join('').trim();
    if (!nm) nm = 'PILOT';
    try { this.engine.storage.set('lastName', nm); } catch (_) { /* 保存不可でも続行 */ }
    const entry = { name: nm, score: this.totalScore, stage: this.stage, date: new Date().toISOString() };
    const list = insertEntry(this.rankList, entry);
    saveRanking(this.engine.storage, list);
    this.rankList = list;
    this.newIdx = list.indexOf(entry);
    this._removeNameDom();
    this.goPhase = 'ranking';
    this._inputLock = INPUT_LOCK_S;
  }

  // ---- 名前入力 DOM（document が無いヘッドレス環境では何もしない）----
  _showNameDom() {
    if (typeof document === 'undefined') return;
    this._removeNameDom();
    let last = '';
    try { last = this.engine.storage.get('lastName', '') || ''; } catch (_) { /* ignore */ }
    const wrap = document.createElement('div');
    wrap.id = 'lander-name-entry';
    wrap.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;' +
      'background:#151b32;border:2px solid #3ee6ff;border-radius:6px;padding:16px;width:min(300px,86vw);' +
      'box-sizing:border-box;text-align:center;color:#c9ecff;font-family:"Rajdhani",sans-serif;';
    const label = document.createElement('div');
    label.textContent = 'ENTER YOUR NAME';
    label.style.cssText = 'font-size:18px;margin-bottom:10px;';
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 10;
    input.value = last;
    input.autocomplete = 'off';
    input.autofocus = true;
    input.setAttribute('autocapitalize', 'off');
    input.style.cssText = 'width:100%;box-sizing:border-box;font-size:20px;padding:8px;text-align:center;' + // 16px以上: iOSの自動ズーム回避
      'background:#0a0e1c;color:#fff;border:1px solid #33406b;border-radius:4px;outline:none;';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'OK';
    btn.style.cssText = 'margin-top:12px;width:100%;font-size:20px;padding:10px;background:#3ee6ff;color:#0a0e1c;' +
      'border:0;border-radius:4px;font-weight:700;font-family:inherit;';
    const submit = () => this._submitName(input.value);
    btn.addEventListener('click', submit);
    input.addEventListener('keydown', (e) => {
      if (e.isComposing || e.keyCode === 229) return; // IME変換確定のEnterは送信しない
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(btn);
    document.body.appendChild(wrap);
    this._nameDom = wrap;
    try { input.focus(); input.select(); } catch (_) { /* ignore */ }
  }

  _removeNameDom() {
    if (this._nameDom && this._nameDom.parentNode) this._nameDom.parentNode.removeChild(this._nameDom);
    this._nameDom = null;
  }

  // ---- Control inputs: 全タッチをゾーンごとに評価（同時押し可）----
  _readPointerControls() {
    const eng = this.engine;
    const pts = Array.isArray(eng.touches) ? eng.touches
      : (eng.pointer && eng.pointer.down ? [eng.pointer] : []);
    for (const pt of pts) {
      if (!(pt.y > CONTROL_Y_MIN)) continue;
      if (pt.x < ZONE_L_MAX)      this._thrustRcsL = true;
      else if (pt.x > ZONE_R_MIN) this._thrustRcsR = true;
      else                        this._thrustMain = true;
    }
  }

  // ---- Per-frame logic ----
  update(dt) {
    if (typeof dt !== 'number' || dt <= 0 || dt > 0.1) dt = 0.016;

    if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt);

    if (this.state !== 'play') {
      this._updateParticles(dt);
      if (this.state === 'landing' && this.landingSeq) {
        this.landingSeq.t += dt;
        this.angle *= Math.pow(0.02, dt);   // 着地後、機体を起こして立たせる（宇宙飛行士の絵と整合）
        if (this.landingSeq.t >= LANDING_SEQ_S) this._finishLanding();
      }
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      return;
    }

    if (this._bannerT > 0) this._bannerT = Math.max(0, this._bannerT - dt);

    // ---- Moving pad (bonus): パッドは台地上を往復。着地判定は常に現在位置を使う ----
    if (this.pad && this.pad.moving) {
      this._padT += dt;
      const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * this._padT / MOVING_PAD_PERIOD);
      this.pad.x = this.pad.minX + (this.pad.maxX - this.pad.minX) * k;
      this.guidePts = buildGuide(this.guidePts[0].x, this.guidePts[0].y, this.pad, GUIDE_PTS);
    }

    // ---- Read control inputs ----
    // Pointer press-and-hold (any active touch with y > CONTROL_Y_MIN) maps by x-zone.
    // Top strip y < CONTROL_Y_MIN is ignored to avoid conflicting with the BACK button.
    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;
    this._readPointerControls();

    // Keyboard (one-shot pulse per frame)
    if (this._keys) {
      if (this._keys.left)  this._thrustRcsL = true;
      if (this._keys.right) this._thrustRcsR = true;
      if (this._keys.up)    this._thrustMain  = true;
      this._keys.left  = false;
      this._keys.right = false;
      this._keys.up    = false;
    }

    // ---- RCS attitude jets — reaction-thruster convention ----
    // Physical convention: the nozzle FIRES toward the button side; Newton's 3rd law
    // pushes the craft nose the OPPOSITE way.
    //
    // LEFT button  -> left-side nozzle fires leftward -> nose pushed RIGHT -> CW rotation
    //   omega += ANG_ACCEL * dt  (positive omega -> angle increases -> ctx.rotate(+rad) -> CW on screen)
    //
    // RIGHT button -> right-side nozzle fires rightward -> nose pushed LEFT -> CCW rotation
    //   omega -= ANG_ACCEL * dt  (negative omega -> angle decreases -> ctx.rotate(-rad) -> CCW on screen)
    //
    // サイドジェット横ドリフト（排気反作用）:
    //   LEFT  button -> 左ノズルが左に排気 -> 機体が右にドリフト (vx += RCS_DRIFT * dt)
    //   RIGHT button -> 右ノズルが右に排気 -> 機体が左にドリフト (vx -= RCS_DRIFT * dt)
    //
    // Keyboard: ArrowLeft maps to _thrustRcsL (same CW convention).
    //           ArrowRight maps to _thrustRcsR (same CCW convention).
    if (this._thrustRcsL && this.fuel > 0) {
      this.omega += ANG_ACCEL * dt;         // CW: nose tilts RIGHT
      this.vx    += RCS_DRIFT * dt;         // 左ノズル排気反作用 -> 右ドリフト
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }
    if (this._thrustRcsR && this.fuel > 0) {
      this.omega -= ANG_ACCEL * dt;         // CCW: nose tilts LEFT
      this.vx    -= RCS_DRIFT * dt;         // 右ノズル排気反作用 -> 左ドリフト
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }

    // ---- Angular damping (mild drag so craft can be stabilized) ----
    this.omega *= Math.pow(ANG_DAMP, dt);

    // ---- Integrate omega -> angle ----
    this.angle += this.omega * dt;
    // Normalize to -180..180
    this.angle  = ((this.angle + 180) % 360 + 360) % 360 - 180;

    // ---- Main engine: thrust along craft's NOSE (up-axis), i.e. opposite the exhaust ----
    // 描画は ctx.translate(x,y); ctx.rotate(rad) で機体ローカルの上(0,-1)を回す。
    // 回転後のワールド上方向(機首) = (sin(rad), -cos(rad))。推進はこの機首方向に働く。
    //   angle=0   -> (0,-1)  : まっすぐ上昇
    //   angle=+90 -> (1, 0)  : 機首が3時 -> 3時方向へ移動（排気は9時）
    //   angle=-90 -> (-1,0)  : 機首が9時 -> 9時方向へ移動
    // ※以前は vx の符号が逆で、傾くと排気側（逆方向）へ押していた不具合を修正。
    if (this._thrustMain && this.fuel > 0) {
      const rad = this.angle * Math.PI / 180;
      this.vx  += ( Math.sin(rad)) * THRUST_ACCEL * dt;
      this.vy  += (-Math.cos(rad)) * THRUST_ACCEL * dt;
      this.fuel = Math.max(0, this.fuel - FUEL_RATE_MAIN * dt);
    }

    // ---- Gravity (straight down = +Y in canvas) ----
    // NO translational damping. Purely Newtonian: only gravity and engine thrust change velocity.
    this.vy += this._gravity * dt;

    // ---- Position update ----
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ---- Horizontal clamp (weak bounce at edges) ----
    const PAD = 14;
    if (this.x < PAD)     { this.x = PAD;     this.vx =  Math.abs(this.vx) * 0.3; }
    if (this.x > W - PAD) { this.x = W - PAD; this.vx = -Math.abs(this.vx) * 0.3; }
    // Top clamp
    if (this.y < 60) { this.y = 60; this.vy = Math.max(0, this.vy); }

    // ---- Guide deviation tracking (upper half only) ----
    // 誘導線からの偏差を累積。スコアリングに使用。
    const guideDist = this._distToGuide(this.x, this.y);
    if (this.y < 420) {
      this._guideDevTotal += guideDist;
      this._guideDevCount += 1;
    }

    // ---- ON COURSE pulse timer update ----
    if (guideDist <= GUIDE_THRESHOLD && this.state === 'play') {
      this._onCourseTime  += dt;
      this._onCoursePulse += dt;
    } else {
      // 誘導線を外れたらタイマーリセット（点滅は停止）
      this._onCourseTime  = 0;
      this._onCoursePulse = 0;
    }

    // ---- Update floating obstacles (stages 2+) ----
    if (this.obstacles && this.obstacles.length > 0) {
      for (const ob of this.obstacles) {
        ob.x += ob.vx * dt;
        // Bounce off walls
        if (ob.x - ob.r < 0)     { ob.x = ob.r;     ob.vx = Math.abs(ob.vx); }
        if (ob.x + ob.r > W)     { ob.x = W - ob.r; ob.vx = -Math.abs(ob.vx); }
      }
      // Check collision with lander (circle vs. point, craft body ~16x18 -> use 14px radius)
      const craftR = 14;
      for (const ob of this.obstacles) {
        const dx = this.x - ob.x;
        const dy = this.y - ob.y;
        if (Math.sqrt(dx * dx + dy * dy) < craftR + ob.r) {
          // Hit an obstacle — crash
          this._doCrash('HIT AN OBSTACLE');
          return;
        }
      }
    }

    // ---- Terrain collision ----
    this._checkCollision();

    // ---- B1': バウンス状態が長引いたら決着（低速・傾きの小刻みホップで永遠に終わらないのを防ぐ）----
    if (this.state === 'play' && this._bouncing) {
      const gap = this._terrainYAt(this.x) - (this.y + 16);
      if (gap > BOUNCE_AIRBORNE_PX) {            // 明確に離陸した -> バウンス状態を解除
        this._bouncing = false;
        this._bounceTime = 0;
      } else {
        this._bounceTime += dt;
        if (this._bounceTime > BOUNCE_RESOLVE_S) this._resolveBounce();
      }
    }
  }

  _resolveBounce() {
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const onPad = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    this._bouncing = false;
    this._bounceTime = 0;
    if (!onPad) { this._doCrash('MISSED THE PAD'); return; }
    if (absAngle <= BOUNCE_RESOLVE_DEG) this._doSuccess(absAngle, Math.abs(this.omega));
    else this._doCrash('TIPPED OVER');
  }

  // ---- Collision & landing check ----
  // 着地判定の優先順位:
  //   1. パッドの外に接触 -> 即クラッシュ
  //   2. パッド上 + SAFE_*以内 -> 即成功
  //   3. パッド上 + BOUNCE_*以内 (マージナル) -> バウンス。次フレームで再判定。
  //      バウンス後にvy <= BOUNCE_SETTLE_VYになれば成功として処理。
  //   4. パッド上 + BOUNCE_*超え (高速/大傾き) -> 即クラッシュ
  _checkCollision() {
    const terrainY = this._terrainYAt(this.x);
    const footY    = this.y + 16;

    if (footY < terrainY) return;

    const onPad    = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    const absVy    = Math.abs(this.vy);
    const absVx    = Math.abs(this.vx);
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const absOmega = Math.abs(this.omega);

    // パッド外接触 -> クラッシュ（地形 or 障害物）
    if (!onPad) {
      this._doCrash('MISSED THE PAD');
      return;
    }

    // バウンス中の「静定チェック」: 前フレームのバウンスで速度が十分落ちていれば成功
    if (this._bouncing) {
      // vy が低ければ着地成功として扱う
      if (absVy <= BOUNCE_SETTLE_VY && absVx <= SAFE_VX && absAngle <= SAFE_ANGLE) {
        this._bouncing = false;
        this._doSuccess(absAngle, absOmega);
        return;
      }
      // バウンス後もまだ速すぎる/傾きすぎ -> クラッシュ
      if (absVy > BOUNCE_VY || absVx > BOUNCE_VX || absAngle > BOUNCE_ANGLE) {
        this._bouncing = false;
        this._doCrash(this._crashReasonFor(absVy, absVx, absAngle, absOmega));
        return;
      }
      // まだ接触中だがゆっくりと落ち着いている -> もう一度バウンス処理
    }

    // ---- 即成功ウィンドウ（SAFE_* 以内）----
    const safeLand = absVy <= SAFE_VY &&
                     absVx <= SAFE_VX &&
                     absAngle <= SAFE_ANGLE &&
                     absOmega <= SAFE_OMEGA;

    if (safeLand) {
      this._bouncing = false;
      this._doSuccess(absAngle, absOmega);
      return;
    }

    // ---- マージナル着地ウィンドウ（BOUNCE_* 以内）-> バウンス ----
    // 速度・角度が「そこそこ許容範囲」なら物理的に弾ませる。
    // 機体が大きく傾いていると、倒れた側のレッグが食い込んでより強く弾む。
    const canBounce = absVy <= BOUNCE_VY &&
                      absVx <= BOUNCE_VX &&
                      absAngle <= BOUNCE_ANGLE &&
                      absOmega <= BOUNCE_OMEGA;

    if (canBounce) {
      // クラフトを地面面上に押し戻す
      this.y = terrainY - 16;

      // 傾きが大きいほどバウンス反発が強くなる（物理的: 傾いた着地は不均一な接触）
      const tiltFactor = 1.0 + (absAngle / BOUNCE_ANGLE) * 0.5;  // 1.0 〜 1.5 倍
      this.vy    = -Math.abs(this.vy) * BOUNCE_RESTITUTION * tiltFactor;
      this.vx   *= BOUNCE_FRICTION;
      this.omega *= BOUNCE_ANG_DAMP;

      // 傾いた着地は機体を少し起き直させる（着地衝撃で揺れが収まる方向）
      const tipCorrection = -this.angle * 0.15;
      this.omega += tipCorrection;

      this._bouncing = true;
      // バウンス音（軽いクリック）
      this.engine.audio.beep && this.engine.audio.beep(200, 0.07, 'square', 0.10);
      return;
    }

    // ---- BOUNCE_* 超え -> 即クラッシュ ----
    this._bouncing = false;
    this._doCrash(this._crashReasonFor(absVy, absVx, absAngle, absOmega));
  }

  _crashReasonFor(absVy, absVx, absAngle, absOmega) {
    if (absAngle > BOUNCE_ANGLE) return 'TIPPED OVER';
    if (absVy > BOUNCE_VY) return 'TOO FAST';
    if (absVx > BOUNCE_VX) return 'TOO MUCH SIDEWAYS SPEED';
    if (absOmega > BOUNCE_OMEGA) return 'SPINNING TOO FAST';
    return 'HARD LANDING';
  }

  // ---- 着地成功処理 ----
  _doSuccess(absAngle, absOmega) {
    const terrainY = this._terrainYAt(this.x);
    // 速度ゼロにする前にボーナス計算用の値を保存
    const landVy = Math.abs(this.vy || 0);
    const landVx = Math.abs(this.vx || 0);
    this.y  = terrainY - 16;
    this.vx = 0; this.vy = 0; this.omega = 0;
    this._bouncing = false;
    this._bounceTime = 0;

    const sp        = stageParams(this.stage);
    const fuelBonus = Math.round((this.fuel || 0) * 10);

    if (this.bonus) {
      // ボーナスミッション: 600 + 燃料*10（PRECISIONは3倍）。通常のステージ得点は付かない。
      let sc = 600 + fuelBonus;
      if (this.bonus.type === 'PRECISION') sc *= 3;
      this._bonusScore = sc;
      this._stageScore = sc;
      this._guideBonus = 0;
      this._bonusGrant = false;
      if (this.bonus.type === 'PRECISION' && this.continues < CONTINUES_MAX) {
        this.continues += 1;
        this._bonusGrant = true;
      }
    } else {
      // 着地精度ボーナス: 速度・姿勢が安全値を下回るほど高得点（landing時の実速度を使用）
      const softBonus = Math.round(Math.max(0, SAFE_VY - landVy) * 8);
      const horzBonus = Math.round(Math.max(0, SAFE_VX - landVx) * 6);
      const uprBonus  = Math.round(Math.max(0, SAFE_ANGLE - (absAngle || 0)) * 5);
      const omgBonus  = Math.round(Math.max(0, SAFE_OMEGA - (absOmega || 0)) * 4);

      // 軌道追従ボーナス: 誘導線を忠実にたどるほど高得点（最大400点）
      let guideBonus = 0;
      if (this._guideDevCount > 0) {
        const avgDev = this._guideDevTotal / this._guideDevCount;
        guideBonus = Math.round(Math.max(0, 400 - avgDev * (400 / 60)));
      }
      this._guideBonus  = guideBonus;
      this._stageScore  = fuelBonus + softBonus + horzBonus + uprBonus + omgBonus + guideBonus + sp.stageBonus;
    }
    this.totalScore  += this._stageScore;

    if (this.totalScore > this.high) {
      this.high = this.totalScore;
      this.engine.storage.setHigh(meta.id, this.high);
    }

    this.engine.audio.good();
    this.landingSeq = { t: 0 };
    this._setOverlayState('landing');
  }

  // ---- クラッシュ処理 ----
  // ボーナス中: Continue を消費せず BONUS FAILED。通常: Continue が残っていれば 'crashed'、無ければ GAME OVER。
  _doCrash(reason) {
    this._explode();
    this.engine.audio.bad();
    this._crashReason = reason || 'CRASHED';
    this._bouncing = false;
    this._bounceTime = 0;

    if (this.bonus) { this._setOverlayState('bonusfailed'); return; }
    if (this.continues > 0) { this._setOverlayState('crashed'); return; }
    this._gameOver(true);
  }

  // ---- Explosion particles ----
  _explode() {
    this.particles = [];
    for (let i = 0; i < 28; i++) {
      const spd = 20 + Math.random() * 60;
      const dir = Math.random() * Math.PI * 2;
      this.particles.push({
        x:    this.x,
        y:    this.y,
        vx:   Math.cos(dir) * spd,
        vy:   Math.sin(dir) * spd - 25,
        life: 0.7 + Math.random() * 1.0,
        max:  1.7,
      });
    }
  }

  _updateParticles(dt) {
    if (!this.particles) return;
    for (const pt of this.particles) {
      pt.x    += pt.vx * dt;
      pt.y    += pt.vy * dt;
      pt.vy   += (this._gravity || GRAVITY_BASE) * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter(pt => pt.life > 0);
  }

  // ---- Linear interpolation of terrain Y at given X ----
  _terrainYAt(x) {
    const pts = this.terrainPts;
    if (!pts || pts.length < 2) return H;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return H;
  }

  // ---- Main render ----
  render(ctx) {
    const p = P();

    // Stars
    if (this.stars) {
      for (const s of this.stars) {
        ctx.fillStyle = s.r > 1 ? p.dim : p.dark;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }

    // Descent trajectory guide (常に描画)
    this._drawGuide(ctx);

    // Floating obstacles (stages 2+)
    this._drawObstacles(ctx);

    // Terrain
    if (this.terrainPts && this.terrainPts.length > 0) {
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const pt of this.terrainPts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = p.dim;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let i = 0; i < this.terrainPts.length; i++) {
        const pt = this.terrainPts[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else         ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // Landing pad
    if (this.pad) {
      const pd = this.pad;
      ctx.fillStyle = p.fg;
      ctx.fillRect(pd.x, pd.y, pd.w, 4);
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x,            pd.y, 4, 10);
      ctx.fillRect(pd.x + pd.w - 4, pd.y, 4, 10);
      // Flag pole
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x + pd.w / 2 - 1, pd.y - 22, 2, 22);
      ctx.fillStyle = p.warn;
      ctx.fillRect(pd.x + pd.w / 2 + 1, pd.y - 20, 12, 9);
      this.engine.text('PAD', pd.x + pd.w / 2, pd.y - 38, 10, p.mid, 'center');
    }

    // Explosion particles
    if (this.particles) {
      for (const pt of this.particles) {
        const t = Math.max(0, Math.min(1, pt.life / (pt.max || 1.7)));
        ctx.fillStyle = t > 0.5 ? p.warn : p.bad;
        const r = Math.max(1, Math.round(t * 4));
        ctx.fillRect(pt.x - r / 2, pt.y - r / 2, r, r);
      }
    }

    // Lander craft
    if (this.state === 'play' || this.state === 'landing' || this.state === 'cleared') {
      this._drawLander(ctx, this.x, this.y, this.angle);
    }

    // Landing sequence (astronaut scene)。クリア画面はシーケンス終了後にのみ重なる
    if (this.state === 'landing' && this.landingSeq) this._drawLandingScene(ctx);

    // HUD
    this._drawHUD(ctx);

    // Bonus mission banner
    if (this.state === 'play' && this.bonus && this._bannerT > 0) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this._bannerT));
      this.engine.text('BONUS MISSION: ' + this.bonus.type.replace('_', ' '), W / 2, 150, 16, p.warn, 'center');
      ctx.restore();
    }

    // Bottom button controls
    this._drawButtons(ctx);

    // Result overlays
    if (this.state === 'cleared') {
      this._drawClearScreen(ctx);
    } else if (this.state === 'crashed') {
      this._drawCrashed(ctx);
    } else if (this.state === 'bonusfailed') {
      this._drawBonusFailed(ctx);
    } else if (this.state === 'gameover') {
      this._drawGameOver(ctx);
    }
  }

  // ---- Landing sequence (placeholder art; P2 replaces _drawAstronaut / _drawLandingFlag) ----
  // 機体は upright(角度は update で0へ)・足元 y+16 が地面。ハッチは機体右側、ハシゴは機体右脚の内側。
  _landingGeometry() {
    const t  = this.landingSeq ? this.landingSeq.t : 0;
    const ph = landingPhase(t);
    const hatchX = this.x + 9, hatchY = this.y - 2;   // ハッチ位置
    const ladderX = this.x + 11;
    const groundAt = (x) => this._terrainYAt(Math.max(1, Math.min(W - 1, x)));
    let ax = ladderX, ay = hatchY + 8, walkX = ladderX;
    if (ph.name === 'descend') {
      ay = hatchY + 8 + (groundAt(ladderX) - (hatchY + 8)) * ph.p;
    } else if (ph.name === 'walk' || ph.name === 'flag' || ph.name === 'wave' || ph.name === 'done') {
      const wp = ph.name === 'walk' ? ph.p : 1;
      walkX = ladderX + 12 * wp;
      ax = walkX;
      ay = groundAt(walkX);
    }
    return { t, ph, hatchX, hatchY, ladderX, ax, ay, groundAt };
  }

  _drawLandingScene(ctx) {
    const p = P();
    const g = this._landingGeometry();
    const { ph } = g;
    // ハッチ（開閉）
    const open = ph.name === 'hatch' ? ph.p : 1;
    ctx.fillStyle = p.dark;
    ctx.fillRect(g.hatchX - 1, g.hatchY - 5, 3, 10);
    ctx.strokeStyle = p.hi; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(g.hatchX + 2, g.hatchY - 5);
    ctx.lineTo(g.hatchX + 2 + 6 * open, g.hatchY - 5 + 5 * (1 - open) - 2 * open);
    ctx.stroke();
    // ハシゴ（ハッチ開放後）
    if (ph.name !== 'hatch') {
      const gy = g.groundAt(g.ladderX);
      ctx.strokeStyle = p.mid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(g.ladderX - 2, g.hatchY + 6); ctx.lineTo(g.ladderX - 2, gy);
      ctx.moveTo(g.ladderX + 2, g.hatchY + 6); ctx.lineTo(g.ladderX + 2, gy); ctx.stroke();
      for (let y = g.hatchY + 9; y < gy; y += 4) { ctx.beginPath(); ctx.moveTo(g.ladderX - 2, y); ctx.lineTo(g.ladderX + 2, y); ctx.stroke(); }
    }
    // 旗（planting 中〜）
    if (ph.name === 'flag' || ph.name === 'wave' || ph.name === 'done') {
      const ft = ph.name === 'flag' ? ph.p : 1;
      this._drawLandingFlag(ctx, g.ax + 8, g.groundAt(g.ax + 8), ft);
    }
    // 宇宙飛行士（ハッチ開放後）
    if (ph.name !== 'hatch') this._drawAstronaut(ctx, g.ax, g.ay, ph.name, g.t);
    this.engine.text('TOUCHDOWN!', W / 2, 100, 16, p.hi, 'center');
  }

  // 宇宙飛行士（仮の簡易図形）。(x,y)=足元。phase: 'descend'|'walk'|'flag'|'wave'|'done'
  _drawAstronaut(ctx, x, y, phase, t) {
    const p = P();
    const bob = phase === 'walk' ? Math.sin(t * 24) * 1 : 0;
    ctx.save();
    ctx.translate(x, y + bob);
    ctx.fillStyle = p.fg;
    ctx.fillRect(-3, -8, 6, 6);            // 胴
    ctx.fillRect(-3, -2, 2, 2); ctx.fillRect(1, -2, 2, 2); // 脚
    ctx.beginPath(); ctx.arc(0, -11, 3.5, 0, Math.PI * 2); ctx.fill(); // ヘルメット
    ctx.fillStyle = p.mid; ctx.fillRect(-1.5, -12, 3, 2);               // バイザー
    ctx.strokeStyle = p.fg; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (phase === 'wave') {
      const s = Math.sin(t * 12);
      ctx.moveTo(3, -7); ctx.lineTo(6, -13 + s * 2);   // 手を振る
    } else {
      ctx.moveTo(3, -7); ctx.lineTo(5, -4);
    }
    ctx.stroke();
    ctx.restore();
  }

  // 旗（仮）。(x,y)=地面の根元。t: 0..1 立てる進行
  _drawLandingFlag(ctx, x, y, t) {
    const p = P();
    const h = 20 * Math.max(0, Math.min(1, t));
    ctx.fillStyle = p.fg;
    ctx.fillRect(x - 0.5, y - h, 1.5, h);
    if (t > 0.6) {
      ctx.fillStyle = p.warn;
      ctx.fillRect(x + 1, y - h, 10, 7);
    }
  }

  // ---- Floating obstacles ----
  _drawObstacles(ctx) {
    if (!this.obstacles || this.obstacles.length === 0) return;
    const p = P();
    for (const ob of this.obstacles) {
      // Draw as a jagged rock/asteroid (octagon-ish)
      ctx.save();
      ctx.translate(ob.x, ob.y);
      ctx.fillStyle   = p.dark;
      ctx.strokeStyle = p.bad;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      const sides = 7;
      for (let i = 0; i < sides; i++) {
        // Slightly irregular radius for rock feel
        const jitter = 0.75 + (((i * 37 + 13) % 7) / 7) * 0.5;
        const angle  = (i / sides) * Math.PI * 2;
        const rx     = Math.cos(angle) * ob.r * jitter;
        const ry     = Math.sin(angle) * ob.r * jitter;
        if (i === 0) ctx.moveTo(rx, ry);
        else         ctx.lineTo(rx, ry);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Small warning highlight
      ctx.fillStyle   = p.warn;
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.55));
      ctx.fillRect(-2, -2, 4, 4);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  // ---- Descent trajectory guide ----
  // 常に描画: 誘導線は常にはっきり見えるようにする。
  // ON COURSE時: 明るく太く、機体周辺に円形マーカー＋上部テキスト表示＋パルス点滅。
  // OFF COURSE時: dim色で細いが消えない（0.55 alpha）。
  _drawGuide(ctx) {
    const p   = P();
    const pts = this.guidePts;
    if (!pts || pts.length < 2) return;

    const dist     = (this.state === 'play')
      ? this._distToGuide(this.x, this.y)
      : Infinity;
    const onCourse = (dist <= GUIDE_THRESHOLD);

    // ON COURSEパルス: sin波で輝度を変調（1Hzで点滅）
    // _onCoursePulseはupdateで加算され、sin計算で[0..1]の輝度係数に変換
    const pulse = onCourse
      ? (0.7 + 0.3 * Math.sin(((this._onCoursePulse || 0) * Math.PI * 2) * 1.5))
      : 1.0;

    // ガイドライン描画（常に表示）
    ctx.save();
    if (onCourse) {
      // ON COURSE: 明るく太い実線
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.85 * pulse));
      ctx.strokeStyle = p.hi;
      ctx.lineWidth   = 2.5;
      ctx.setLineDash([6, 4]);
    } else {
      // OFF COURSE: 常に見える薄い点線（消えない）
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.55));
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 8]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // Diamond marker at target
    const last = pts[pts.length - 1];
    ctx.fillStyle   = onCourse ? p.hi : p.warn;
    ctx.globalAlpha = Math.max(0, Math.min(1, onCourse ? 0.9 * pulse : 0.5));
    ctx.beginPath();
    ctx.moveTo(last.x,     last.y - 8);
    ctx.lineTo(last.x + 7, last.y);
    ctx.lineTo(last.x,     last.y + 8);
    ctx.lineTo(last.x - 7, last.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ON COURSEポップインジケーター（機体周辺＋テキスト）
    if (onCourse && this.state === 'play') {
      this._drawOnCourseIndicator(ctx, pulse);
    }
  }

  // ---- ON COURSE pop indicator ----
  // 機体周辺の明るいリング＋上部のテキストバナー。
  // パルス点滅で「今乗っている」ことを明確に伝える。
  _drawOnCourseIndicator(ctx, pulse) {
    if (typeof pulse !== 'number') pulse = 1;
    const p = P();

    // 機体周囲のハローリング（スケールパルス）
    const ringR = 22 + 4 * Math.sin(((this._onCoursePulse || 0) * Math.PI * 2) * 1.5);
    ctx.save();
    ctx.globalAlpha  = Math.max(0, Math.min(1, 0.6 * pulse));
    ctx.strokeStyle  = p.hi;
    ctx.lineWidth    = 2.5;
    ctx.beginPath();
    ctx.arc(this.x, this.y, ringR, 0, Math.PI * 2);
    ctx.stroke();

    // 内側の小さなドット（中心確認マーカー）
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.8 * pulse));
    ctx.fillStyle   = p.hi;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 上部テキストバナー（HUDエリアの直下）
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, pulse));
    this.engine.text('ON COURSE', W / 2, 72, 13, p.hi, 'center');
    ctx.restore();
  }

  // ---- Lander craft with 4 RCS nozzles ----
  // Rotation math (ctx.rotate convention):
  //   ctx.rotate(+rad) = clockwise (CW) on screen
  //   ctx.rotate(-rad) = counter-clockwise (CCW) on screen
  //
  //   omega > 0 -> angle increases -> ctx.rotate(+rad) -> CW on screen (nose tilts RIGHT)
  //   omega < 0 -> angle decreases -> ctx.rotate(-rad) -> CCW on screen (nose tilts LEFT)
  //
  //   LEFT  button -> omega += -> CW  (nose tilts right)   LEFT nozzle fires left -> reaction right
  //   RIGHT button -> omega -= -> CCW (nose tilts left)   RIGHT nozzle fires right -> reaction left
  //
  // The FLAME is drawn on the FIRING nozzle side, consistent with actual exhaust direction.
  _drawLander(ctx, x, y, angleDeg) {
    const p   = P();
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const rad = ((angleDeg || 0) * Math.PI / 180);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);  // positive rad = CW on canvas; negative = CCW

    // Main engine flame (bottom nozzle, fires downward in body space)
    if (this._thrustMain && this.fuel > 0) {
      const fl = 10 + Math.random() * 10;
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.lineTo(0,  9 + fl);
      ctx.lineTo(6,  9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(-3, 9);
      ctx.lineTo(0,  9 + fl * 0.5);
      ctx.lineTo(3,  9);
      ctx.closePath();
      ctx.fill();
    }

    // Body
    ctx.fillStyle   = p.mid;
    ctx.fillRect(-8, -10, 16, 18);
    ctx.strokeStyle = p.fg;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(-8, -10, 16, 18);

    // Cabin window
    ctx.fillStyle = p.hi;
    ctx.fillRect(-4, -8, 8, 7);

    // Left landing leg
    ctx.strokeStyle = p.mid;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(-7, 8);   ctx.lineTo(-14, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(-18, 16); ctx.stroke();

    // Right landing leg
    ctx.beginPath(); ctx.moveTo(7, 8);    ctx.lineTo(14, 16);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16);  ctx.lineTo(18, 16);  ctx.stroke();

    // Main engine nozzle (bottom center)
    ctx.fillStyle = p.dark;
    ctx.fillRect(-5, 9, 10, 5);
    ctx.strokeStyle = (this._thrustMain && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 1;
    ctx.strokeRect(-5, 9, 10, 5);

    // LEFT RCS nozzle (body left side, upper area)
    // LEFT button fires LEFT nozzle to the LEFT. Reaction: nose goes RIGHT = CW = omega +.
    // Flame jets LEFT from left nozzle.
    ctx.fillStyle = p.dark;
    ctx.fillRect(-12, -6, 4, 4);
    if (this._thrustRcsL && this.fuel > 0) {
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-12 - (5 + Math.random() * 5), -2);
      ctx.lineTo(-12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = (this._thrustRcsL && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-12, -6, 4, 4);

    // RIGHT RCS nozzle (body right side, upper area)
    // RIGHT button fires RIGHT nozzle to the RIGHT. Reaction: nose goes LEFT = CCW = omega -.
    // Flame jets RIGHT from right nozzle.
    ctx.fillStyle = p.dark;
    ctx.fillRect(8, -6, 4, 4);
    if (this._thrustRcsR && this.fuel > 0) {
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(12 + (5 + Math.random() * 5), -2);
      ctx.lineTo(12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = (this._thrustRcsR && this.fuel > 0) ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(8, -6, 4, 4);

    // Top attitude nozzle (visual reference)
    ctx.fillStyle   = p.dark;
    ctx.fillRect(-3, -14, 6, 4);
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-3, -14, 6, 4);

    ctx.restore();
  }

  // ---- HUD (top area, x >= 52 to clear the BACK button) ----
  _drawHUD(ctx) {
    const p = P();

    this.engine.text('LANDER', 52, 8, 16, p.fg, 'left');
    this.engine.text('ST.' + this.stage + (this.bonus ? ' BONUS' : ''), 52, 26, 12, this.bonus ? p.warn : p.mid, 'left');
    // 残り Continue（小さな機体アイコン）
    for (let i = 0; i < (this.continues || 0); i++) {
      const ix = 206 + i * 14;
      this.engine.rect(ix, 45, 8, 9, p.mid);
      this.engine.rect(ix + 2, 47, 4, 3, p.hi);
      this.engine.rect(ix - 1, 54, 2, 2, p.mid); this.engine.rect(ix + 7, 54, 2, 2, p.mid);
    }
    this.engine.text('HI ' + (this.high || 0),      W - 8, 8,  12, p.dim, 'right');
    this.engine.text('TOT ' + this.totalScore,       W - 8, 22, 12, p.mid, 'right');

    // Fuel bar
    const bx = 52, by = 44, bw = 110, bh = 10;
    this.engine.rect(bx, by, bw, bh, p.dark);
    const fr   = Math.max(0, Math.min(1, (this.fuel || 0) / FUEL_MAX));
    const fclr = fr > 0.4 ? p.mid : fr > 0.15 ? p.warn : p.bad;
    if (fr > 0) this.engine.rect(bx, by, Math.round(bw * fr), bh, fclr);
    this.engine.stroke(bx, by, bw, bh, p.dim, 1);
    this.engine.text('FUEL', bx + bw + 4, by, 10, p.dim, 'left');

    if (this.state !== 'play') return;

    // Vertical speed
    const vy    = this.vy || 0;
    const vyclr = Math.abs(vy) <= SAFE_VY ? p.mid : Math.abs(vy) <= SAFE_VY * 1.6 ? p.warn : p.bad;
    this.engine.text('VY ' + Math.round(vy), W - 8, 38, 11, vyclr, 'right');

    // Horizontal speed
    const vx    = this.vx || 0;
    const vxclr = Math.abs(vx) <= SAFE_VX ? p.mid : Math.abs(vx) <= SAFE_VX * 2 ? p.warn : p.bad;
    this.engine.text('VX ' + Math.round(vx), W - 8, 52, 11, vxclr, 'right');

    // Angle
    const ang    = this.angle || 0;
    const absAng = Math.abs(((ang + 180) % 360 + 360) % 360 - 180);
    const aclr   = absAng <= SAFE_ANGLE ? p.mid : absAng <= SAFE_ANGLE * 2 ? p.warn : p.bad;
    this.engine.text('A ' + Math.round(ang) + '°', 52, 58, 11, aclr, 'left');

    // Angular velocity
    const om    = this.omega || 0;
    const omclr = Math.abs(om) <= SAFE_OMEGA ? p.mid : Math.abs(om) <= SAFE_OMEGA * 2 ? p.warn : p.bad;
    this.engine.text('ω ' + Math.round(om), W - 8, 66, 11, omclr, 'right');
  }

  // ---- Bottom button bar ----
  // Label convention (reaction-thruster):
  //   LEFT  button -> fires left nozzle -> nose tilts RIGHT (CW)
  //   RIGHT button -> fires right nozzle -> nose tilts LEFT (CCW)
  // Labels reflect the NOSE direction for clarity to the player.
  _drawButtons(ctx) {
    const p = P();

    const BW = 120;
    const bY = BTN_Y;
    const bH = BTN_H;

    const drawBtn = (bx, label, sublabel, active) => {
      ctx.fillStyle = active ? p.dim : p.dark;
      ctx.fillRect(bx, bY, BW, bH);

      ctx.strokeStyle = active ? p.hi : p.dim;
      ctx.lineWidth   = active ? 2.5 : 1.5;
      ctx.strokeRect(bx + 1, bY + 1, BW - 2, bH - 2);

      if (active) {
        ctx.fillStyle = p.hi;
        ctx.globalAlpha = Math.max(0, Math.min(1, 0.25));
        ctx.fillRect(bx + 2, bY + 2, BW - 4, 6);
        ctx.globalAlpha = 1;
      }

      const labelColor = active ? p.hi : p.fg;
      this.engine.text(label,    bx + BW / 2, bY + bH / 2 - 14, 13, labelColor, 'center');
      if (sublabel) {
        this.engine.text(sublabel, bx + BW / 2, bY + bH / 2 + 2,  10, active ? p.warn : p.dim, 'center');
      }
    };

    // LEFT button: nose tilts right (CW)    RIGHT button: nose tilts left (CCW)
    drawBtn(0,   '◄ TILT R',  'NOSE RIGHT', this._thrustRcsL);
    drawBtn(120, 'THRUST',    null,          this._thrustMain);
    drawBtn(240, 'TILT L ►', 'NOSE LEFT',  this._thrustRcsR);

    // Dividers
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(120, bY); ctx.lineTo(120, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(240, bY); ctx.lineTo(240, H); ctx.stroke();
  }

  // ---- Stage Clear overlay ----
  _drawClearScreen(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;
    const b  = this.bonus;

    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.92));
    this.engine.rect(20, cy - 130, W - 40, 270, p.dark);
    this.engine.stroke(20, cy - 130, W - 40, 270, p.mid, 2);
    ctx.restore();

    if (b) {
      this.engine.text('BONUS CLEAR!',                cx, cy - 116, 24, p.warn, 'center');
      this.engine.text(b.type.replace('_', ' '),      cx, cy - 86, 13, p.mid, 'center');
      this.engine.text('BONUS SCORE',                 cx, cy - 62,  12, p.dim,  'center');
      this.engine.text('+' + (this._bonusScore || 0), cx, cy - 46,  20, p.fg,   'center');
      if (this._bonusGrant) this.engine.text('+1 CONTINUE!', cx, cy - 22, 12, p.hi, 'center');
    } else {
      this.engine.text('STAGE CLEAR!',                cx, cy - 116, 24, p.hi,   'center');
      this.engine.text('ST.' + this.stage + ' COMPLETE', cx, cy - 86, 13, p.mid, 'center');
      this.engine.text('STAGE SCORE',                 cx, cy - 62,  12, p.dim,  'center');
      this.engine.text('+' + (this._stageScore || 0), cx, cy - 46,  20, p.fg,   'center');
      this.engine.text('GUIDE BONUS +' + (this._guideBonus || 0), cx, cy - 22, 11, p.warn, 'center');
    }

    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(40, cy + 4); ctx.lineTo(W - 40, cy + 4); ctx.stroke();

    this.engine.text('TOTAL SCORE',                 cx, cy + 14,  12, p.dim,  'center');
    this.engine.text('' + this.totalScore,          cx, cy + 30,  24, p.hi,   'center');
    this.engine.text('BEST ' + (this.high || 0),    cx, cy + 60,  14, p.mid,  'center');

    let next;
    if (b) next = 'TAP → STAGE ' + (this.stage + 1);
    else if (this.stage % BONUS_EVERY === 0) next = 'TAP → BONUS MISSION';
    else next = 'TAP → STAGE ' + (this.stage + 1);
    this.engine.text(next, cx, cy + 90, 14, p.fg,  'center');
    this.engine.text('BACK → MENU', cx, cy + 110, 11, p.dim, 'center');
  }

  // ---- Crashed (continue available) ----
  _drawCrashed(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.92));
    this.engine.rect(20, cy - 100, W - 40, 190, p.dark);
    this.engine.stroke(20, cy - 100, W - 40, 190, p.bad, 2);
    ctx.restore();
    this.engine.text('CRASHED',                       cx, cy - 86, 28, p.bad,  'center');
    this.engine.text(this._crashReason || '',         cx, cy - 50, 13, p.warn, 'center');
    this.engine.text('SCORE ' + this.totalScore,      cx, cy - 26, 14, p.fg,   'center');
    this.engine.text('TAP: CONTINUE (' + this.continues + ' left)', cx, cy + 8, 15, p.hi, 'center');
    const g = this._giveUpRect();
    this.engine.stroke(g.x, g.y, g.w, g.h, p.dim, 1.5);
    this.engine.text('GIVE UP', cx, g.y + 8, 13, p.dim, 'center');
  }

  // ---- Bonus failed (no continue consumed) ----
  _drawBonusFailed(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, 0.92));
    this.engine.rect(20, cy - 90, W - 40, 170, p.dark);
    this.engine.stroke(20, cy - 90, W - 40, 170, p.warn, 2);
    ctx.restore();
    this.engine.text('BONUS FAILED',                  cx, cy - 76, 26, p.warn, 'center');
    this.engine.text(this._crashReason || '',         cx, cy - 42, 13, p.fg,   'center');
    this.engine.text('NO CONTINUE USED',              cx, cy - 18, 12, p.dim,  'center');
    this.engine.text('TAP → STAGE ' + (this.stage + 1), cx, cy + 20, 15, p.hi, 'center');
  }

  // ---- Game Over: name entry (DOM) -> ranking ----
  _drawGameOver(ctx) {
    const p  = P();
    const cx = W / 2;
    const cy = H / 2;

    if (this.goPhase === 'name') {
      ctx.save();
      ctx.globalAlpha = 0.92;
      this.engine.rect(20, 70, W - 40, 90, p.dark);
      this.engine.stroke(20, 70, W - 40, 90, p.bad, 2);
      ctx.restore();
      this.engine.text('GAME OVER',                cx, 78, 26, p.bad, 'center');
      this.engine.text('SCORE ' + this.totalScore + '  ST.' + this.stage, cx, 114, 15, p.fg, 'center');
      this.engine.text('NEW RECORD!',              cx, 136, 12, p.warn, 'center');
      return;
    }

    ctx.save();
    ctx.globalAlpha = 0.95;
    this.engine.rect(20, 60, W - 40, 520, p.dark);
    this.engine.stroke(20, 60, W - 40, 520, p.mid, 2);
    ctx.restore();
    this.engine.text('GAME OVER',  cx, 70, 24, p.bad, 'center');
    this.engine.text('SCORE ' + this.totalScore + '  ST.' + this.stage, cx, 102, 14, p.fg, 'center');
    this.engine.text('RANKING',    cx, 128, 16, p.hi, 'center');
    drawRankingRows(this.engine, ctx, this.rankList || [], 32, 160, W - 64, this.newIdx);
    this.engine.text('TAP → TITLE', cx, 540, 14, p.fg, 'center');
  }
}
