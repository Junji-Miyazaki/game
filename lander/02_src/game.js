// LANDER: Control attitude with RCS thrusters and soft-land on the lunar surface.
// Reaction-thruster convention (physically correct):
//   LEFT  button (x < 120): right-side thruster fires RIGHT -> reaction pushes nose LEFT  -> craft rotates CW  (omega +)
//   RIGHT button (x > 240): left-side thruster fires LEFT  -> reaction pushes nose RIGHT -> craft rotates CCW (omega -)
//   THRUST button (center): main engine fires along craft's up-axis.
// Safe landing on the pad = STAGE CLEAR. Crash = GAME OVER.
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, saveRanking, recordEntry, qualifies, createRankTabs, rankTabsTap, drawRankPanel, getPlayerName, getActiveProfile, newRunId, loadCheckpoint, saveCheckpoint, clearCheckpoint } from './ranking.js';
import { isDebug } from './debug.js';
import { autopilotKeys } from './autopilot.js';
import { GRAVITY_BASE, STAGES_PER_BODY, stageInfo, bodyGravity, padWidth, obstacleCount, obstacleSpeed, makeWindSpec, windAt, bodyHasWind, introText, celebrationPose, TERRA, BONUS_ALT, missionOf, bonusBody, bonusScoreFor } from './bodies.js';
import { MODULE_DEFS, moduleDef, newModules, rollOffers, fuelMulFor, angDampFor, SAFE_VY_PER_LEVEL, BOUNCE_VY_PER_LEVEL } from './modules.js';
import { relayEnabled, submitScore, adminList, adminDelete } from './net.js';
import { musicOf, toggleMute, isMuted, hideNameOverlay, showNameOverlay } from './title.js';
import { drawBackdrop, drawTerrain, drawPad, drawBeacon, drawParticles, drawShieldRing, drawRadar, drawShip, drawHatch, drawLadder, drawAstronaut, drawFlag, drawCelebFx, drawObstacles, drawGuide, drawOnCourse, drawOnCourseLabel, drawHaze, drawFog, drawHUD, drawHudTip, drawControls, drawIntro, drawBonusBanner, drawTouchdown, drawClearPanel, drawCrashPanel, drawBonusFailedPanel, drawModuleCards, drawBonusCards, drawGameOverFrame, drawGameOverFooter, drawDebugPanel, drawDebugTag, drawSpeaker, drawHoldButton, drawHoldPanel, drawAdminPanel, drawNote } from './art.js';

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
// GRAVITY_BASE は bodies.js（天体ごとの重力 = BASE*sqrt(realG/1.62)*(1+0.15*loop)）
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
const RESULT_STATES = ['landing', 'cleared', 'crashed', 'bonusfailed', 'bonusselect', 'module', 'gameover', 'ranking'];   // 結果画面（長押し解除・キーリピートで進めない）
const INPUT_LOCK_S      = 0.5;   // 結果画面に入った直後の入力無視（押しっぱなしの指を離した際の誤タップ対策）
const BONUS_EVERY       = 3;     // sステージクリア後 (s % 3 === 0) にボーナス
const PERFECT_VY = 8, PERFECT_VX = 3, PERFECT_ANGLE = 5, PERFECT_OMEGA = 6;   // PERFECT着陸の閾値
const HOLD_GRACE_S      = 0.5;   // RESUME直後は操縦入力を無視する秒数
const HUD_TIP_S        = 4;     // 初回ヒントの表示秒数
const HUD_TIP_LOCK_S   = 0.3;   // 表示直後のタップ無視
const HOLD_LOCK_S       = 0.3;   // HOLDパネル表示/切替直後のボタン無視（誤タップ防止）
const ADMIN_PER_PAGE    = 5;
let _adminKeyMem = '';   // 管理キー（セッション中のみ・メモリ上。保存しない）
const DBG_STATES = ['play', 'landing', 'cleared', 'crashed', 'bonusfailed'];
const INTRO_S           = 2.0;   // 天体の最初のステージの紹介バナー秒数
const RADAR_DT          = 1 / 30;
const RADAR_MAX_T       = 120;
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
// 天体・重力・パッド幅・障害物は bodies.js（stageInfo / bodyGravity / padWidth / obstacleCount / obstacleSpeed）。
function stageParams(stage) {
  const info = stageInfo(stage);
  return {
    info,
    gravity:       bodyGravity(info.body, info.loop),
    padW:          padWidth(stage),
    stageBonus:    Math.min(stage, 8) * 50,
    obstacleCount: obstacleCount(stage),
    obstacleSpeed: obstacleSpeed(stage),
  };
}

// ---- Terrain generation ----
// opts.plateau: 台地の区間数(>0) -> 移動パッド用（ROVER DOCK / STORM LANDING）。その区間ぶんの平坦台地を作り、pad に移動範囲 minX/maxX と周期 period を持たせる。
function buildTerrain(padW, opts) {
  const plateau = (opts && opts.plateau) | 0;   // 台地の区間数。0 = 固定パッド
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
    i0 = 1 + Math.floor(Math.random() * (TERRAIN_SEGS - plateau - 1)); // 1 .. TERRAIN_SEGS-SEGS-1
    i1 = i0 + plateau;
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

  const pad = { x: (flatX0 + flatX1) / 2 - padW / 2, y: flatY, w: padW, moving: plateau > 0 };
  if (plateau) { pad.period = (opts && opts.period) || 8; pad.minX = flatX0; pad.maxX = flatX1 - padW; pad.x = pad.minX; }   // t=0 の往復位相(余弦)は左端
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
function buildObstacles(count, speed, style) {
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
      style: style || 'rock',   // P2: 'rock' | 'ice' | 'lava'（挙動は同一）
    });
  }
  return obs;
}

// '#rrggbb' + alpha -> 'rgba(...)'
function hexA(hex, a) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex));
  if (!m) return 'rgba(0,0,0,' + a + ')';
  return 'rgba(' + parseInt(m[1], 16) + ',' + parseInt(m[2], 16) + ',' + parseInt(m[3], 16) + ',' + a + ')';
}

export class Game extends Scene {

  enter() {
    hideNameOverlay();   // 名前入力DOMがゲーム画面に残らないように
    this.high       = (this.engine.storage.getHigh(meta.id) || 0);
    this.totalScore = 0;
    this.stage      = 1;
    this.continues  = CONTINUES_MAX;
    this.bonus      = null;          // 進行中のボーナス {type, afterStage}。type は CALM / ROVER / CROSSWIND / STORM
    this.bonusCount = 0;             // これまでに発生したボーナスの機会数（★★ を ROVER / CROSSWIND で交互にする）
    this.bonusOffers = [];           // 選択画面の3枚（type の配列）
    this._inputLock = 0;
    this.modules    = newModules();   // 新規ランでリセット（Continueでは維持）
    this.offers     = [];
    this._dbgTainted = false;
    this._clock = 0;
    this._holdPrev = null; this._holdConfirm = false; this._holdGrace = 0;
    this._duck(false);
    this.runId      = newRunId();
    this._worldNote = '';
    // タイトルの CONTINUE MISSION: 保存したステージの「開始」から再開（地形は新規）
    const cp = this.engine.resumeCheckpoint; this.engine.resumeCheckpoint = null;
    if (cp && cp.v === 1) {
      this.stage = cp.stage; this.totalScore = cp.totalScore; this.continues = cp.continues; this.runId = cp.runId;
      for (const k of Object.keys(this.modules)) { const d = moduleDef(k); this.modules[k] = Math.max(0, Math.min(d ? d.max : 0, (cp.modules && cp.modules[k]) | 0)); }
      this.bonusCount = Math.floor((cp.stage - 1) / BONUS_EVERY);
    }
    this._initStage();
    this._maybeShowTip();
  }

  exit() { this._admin = null; this._duck(false); hideNameOverlay(); const m = musicOf(this.engine); m.stopJingle(0.3); m.stopAll(0.6); this._bgmOn = false; }   // タイトルへ戻る/シーン終了で音楽をフェード

  // 名前入力中は BACK を無効化（誤タップで入力が消えるのを防ぐ）
  // ---- 初回の計器ヒント（'hudTipSeen' が無い端末で、プレイ開始時に1度だけ）。表示中は物理を凍結（state 'tip'）----
  _maybeShowTip() {
    const st = this.engine.storage;
    if (this.state !== 'play') return;
    let seen = null; try { seen = st.get('hudTipSeen', null); } catch (_) { /* ignore */ }
    if (seen) return;
    try { st.set('hudTipSeen', '1'); } catch (_) { /* ignore */ }
    this._tipT = HUD_TIP_S;
    this._tipPrev = this.state;
    this.state = 'tip';
    this._inputLock = HUD_TIP_LOCK_S;
    this._overlayAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }
  _endTip() {
    if (this.state !== 'tip') return;
    this.state = this._tipPrev || 'play';
    this._tipPrev = null; this._tipT = 0;
    this._holdGrace = HOLD_GRACE_S;   // 押しっぱなしの指で推力が出ないように（RESUME と同じ規則）
    if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
  }
  blocksBack() { return this.state === 'module' || this.state === 'bonusselect' || this.state === 'hold'; }

  // ---- モジュール効果（レベルから都度計算。取得直後に反映される）----
  _lvl(id) { return (this.modules && this.modules[id]) || 0; }
  _fuelMax() { return FUEL_MAX * fuelMulFor(this._lvl('fuel')); }
  _angDamp() { return angDampFor(this._lvl('stab')); }
  _safeVy() { return SAFE_VY + SAFE_VY_PER_LEVEL * this._lvl('shock'); }
  _bounceVy() { return BOUNCE_VY + BOUNCE_VY_PER_LEVEL * this._lvl('shock'); }

  // ---- Initialize one stage ----
  // this.stage / this.bonus から再構築する。Continue 時も同じステージ番号（＝同じパラメータ）で呼ぶ。
  _initStage() {
    this.state    = 'play';
    this.fuel     = this._fuelMax();
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
    const mission  = this.bonus ? missionOf(this.bonus.type) : null;
    const btype    = mission ? mission.id : null;
    this._mission  = mission;
    this._info     = sp.info;   // 周回(loop)はボーナス中もステージs のもの
    this._body     = mission ? bonusBody(mission.id) : sp.info.body;   // ボーナスは TERRA（ミッションごとに風・抗力）
    // 天体が変わった／成功・クラッシュでBGMを止めていた場合は曲を（再）開始。ジングルは止める
    if (this._body.id !== this._musBodyId || !this._bgmOn) {
      this._musBodyId = this._body.id; this._bgmOn = true;
      const mu = musicOf(this.engine); mu.stopJingle(0.3); mu.playBody(this._body.id);
    }
    this._gravity  = mission ? bodyGravity(TERRA, sp.info.loop) : sp.gravity;
    this._windSpec = makeWindSpec(this._body, sp.info.loop);   // 真空の天体は null（風なし）
    this._windT    = 0;
    this._windAccel = 0;
    this._shieldCharges = this._lvl('shield');          // SHIELD: レベル＝このステージで吸収できる被弾回数
    this._shieldReady = this._shieldCharges > 0;
    this._shieldFlash = 0;
    this._introT   = (sp.info.firstOfBody && !btype) ? INTRO_S : 0;
    this._padW     = mission ? mission.padW : sp.padW;

    const terrain     = buildTerrain(this._padW, mission && mission.moving ? { plateau: mission.plateauSegs, period: mission.padPeriod } : null);
    this.terrainPts   = terrain.pts;
    this.pad          = terrain.pad;
    this._padT        = 0;
    this._apEnd = undefined; this._apTE = undefined;   // 自動操縦の移動パッド用メモ（新しいステージで初期化）
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
    this._auto          = false;
    this._perfect       = false;
    this._bannerT       = btype ? 2.8 : 0;   // ボーナス開始バナーの残り秒
    this.particles      = [];

    // バウンス状態フラグ（マージナル着地後に弾んでいる最中）と累積時間 (B1')
    this._bouncing = false;
    this._bounceTime = 0;

    // ON COURSEポップインジケーター用タイマー
    this._onCourseTime = 0;   // ON COURSE状態の累積時間(秒)
    this._onCoursePulse = 0;  // 点滅アニメーション用位相(秒)

    // Floating obstacles (stage 2+)。ボーナスミッションは障害物なし（穏やかな特別ステージ。難度は重力・パッド・風・抗力で作る）
    this.obstacles = mission ? [] : buildObstacles(sp.obstacleCount, sp.obstacleSpeed, this._body.obstacleStyle);

    this._keys = this._keys || { left: false, right: false, up: false };
    this._saveCheckpoint();
  }

  // ステージ開始ごとに保存（ボーナス中は「ボーナスの次のステージ」を保存＝再開がボーナスの途中にならない）。デバッグ中/デバッグ操作ランは保存しない
  _saveCheckpoint() {
    if (this._isDebugRun()) return;
    const prof = getActiveProfile(this.engine.storage);
    saveCheckpoint(this.engine.storage, {
      runId: this.runId, stage: this.bonus ? this.stage + 1 : this.stage, totalScore: this.totalScore,
      continues: this.continues, modules: Object.assign({}, this.modules), name: prof ? prof.name : getPlayerName(this.engine.storage),
    });
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
    if (RESULT_STATES.indexOf(this.state) >= 0) {
      if (data && data.repeat) return;                                            // キーのオートリピートは進行に使わない
      if (action === 'tap' && data && data.t0 < this._overlayAt) return;          // この画面に入る前から押していた指の解除は無視
    }

    if (this.state === 'tip') {   // ヒント表示中: タップで閉じる（出現前から押していた指の解除や直後0.3秒は無視）。操縦には使わない
      if (action === 'tap' && data && !data.repeat && data.t0 >= this._overlayAt && this._inputLock <= 0) this._endTip();
      return;
    }
    if (this.state === 'hold') { this._holdInput(action, data); return; }
    if (this.state === 'debug') { this._debugInput(action, data); return; }
    if (action === 'tap' && data && this._inRect(this._muteRect(), data)) { toggleMute(this.engine); if (!isMuted(this.engine)) musicOf(this.engine).sfx.uiTap(); return; }
    if (action === 'tap' && data && this.state === 'play' && this._inRect(this._holdRect(), data)) { this._enterHold(); return; }
    if (isDebug() && action === 'tap' && data && DBG_STATES.indexOf(this.state) >= 0 && this._inRect(this._dbgBtnRect(), data)) {
      this._dbgPrev = this.state;
      this.state = 'debug';
      return;
    }

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
    if (this.state === 'module') {
      if (this._inputLock <= 0) {
        if (action === 'tap' && data) {
          for (let i = 0; i < this.offers.length; i++) {
            const r = this._moduleCardRect(i);
            if (data.x >= r.x && data.x <= r.x + r.w && data.y >= r.y && data.y <= r.y + r.h) { this._pickModule(i); break; }
          }
        } else if (action === 'left' && this.offers.length > 0) this._pickModule(0);
        else if (action === 'right' && this.offers.length > 1) this._pickModule(1);
      }
      return;   // BACKは無効（選択中）
    }
    if (this.state === 'bonusselect') {
      if (this._inputLock <= 0) {
        if (action === 'tap' && data) {
          for (let i = 0; i < this.bonusOffers.length; i++) { if (this._inRect(this._bonusCardRect(i), data)) { this._pickBonus(i); return; } }
          if (this._inRect(this._bonusSkipRect(), data)) this._skipBonus();
        } else if (action === 'left') this._pickBonus(0);
        else if (action === 'up') this._pickBonus(1);
        else if (action === 'right') this._pickBonus(2);
      }
      return;   // BACKは無効（選択中）
    }
    if (this.state === 'bonusfailed') {
      if (confirm && this._inputLock <= 0) this._nextAfterBonus();
      if (action === 'back') this.engine.toMenu();
      return;
    }
    if (this.state === 'crashed') {
      if (confirm && this._inputLock <= 0) {
        musicOf(this.engine).sfx.uiTap();
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
      if (action === 'tap' && data && this._inputLock <= 0 && rankTabsTap(this.rankTabs, 32, 146, data.x, data.y, W - 64)) return;
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

  // ---- MISSION HOLD（一時停止）/ ABORT MISSION（自発的な終了）----
  // 操作: タップのみ。Escape/Backspace は既に BACK（メニューへ退出）で、P キー用のエンジン動作は無いため割り当てない。
  //       HOLD 中は BACK ボタンを無効化（blocksBack）し、Escape(=back)は RESUME / 確認の CANCEL に割り当てる。
  _holdRect() { return { x: 184, y: 18, w: 38, h: 32 }; }
  _duck(on) { try { const m = musicOf(this.engine); if (m && typeof m.duck === 'function') m.duck(on); } catch (_) { /* 音の失敗はゲームに影響させない */ } }
  _uiTap() { try { if (!isMuted(this.engine)) musicOf(this.engine).sfx.uiTap(); } catch (_) { /* ignore */ } }
  _enterHold() {
    if (this.state !== 'play') return;
    this._holdPrev = this.state;
    this._holdConfirm = false;
    this.state = 'hold';
    this._inputLock = HOLD_LOCK_S;
    this._overlayAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    this._thrustMain = false; this._thrustRcsL = false; this._thrustRcsR = false;   // 凍結画面に炎を残さない
    if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
    this._duck(true);
    this._uiTap();
  }
  // ページ非表示/ブラー: プレイ中のみ自動で HOLD（自動再開はしない）
  onHidden() { if (this.state === 'play') this._enterHold(); }
  _resume() {
    if (this.state !== 'hold') return;
    this.state = this._holdPrev || 'play';
    this._holdPrev = null; this._holdConfirm = false;
    this._holdGrace = HOLD_GRACE_S;
    if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
    this._duck(false);
    this._uiTap();
  }
  _abortConfirmed() {
    if (this.state !== 'hold') return;
    this._holdPrev = null; this._holdConfirm = false; this._holdGrace = 0;
    this._duck(false);
    this._uiTap();
    this._saveCheckpoint();   // ABORT してもタイトルの CONTINUE MISSION で再開できる
    this._gameOver(false, true);   // 残機に関係なく即終了。燃料ボーナスなし・通常のゲームオーバーと同じ記録/送信
  }
  _holdButtons() {
    const x = 70, w = W - 140;
    return this._holdConfirm
      ? [{ id: 'cancel', label: 'CANCEL', kind: 'main', x, y: 320, w, h: 48 }, { id: 'confirm', label: 'CONFIRM ABORT', kind: 'danger', x, y: 384, w, h: 48 }]
      : [{ id: 'resume', label: 'RESUME', kind: 'main', x, y: 320, w, h: 48 }, { id: 'abort', label: 'ABORT MISSION', kind: 'danger', x, y: 384, w, h: 48 }];
  }
  _holdInput(action, data) {
    if (data && data.repeat) return;
    if (action === 'back') { if (this._inputLock <= 0) { if (this._holdConfirm) { this._holdConfirm = false; this._inputLock = HOLD_LOCK_S; } else this._resume(); } return; }
    if (action !== 'tap' || !data) return;
    if (data.t0 < this._overlayAt) return;      // HOLD に入る前から押していた指の解除はタップにしない
    if (this._inputLock > 0) return;
    for (const b of this._holdButtons()) {
      if (!this._inRect(b, data)) continue;
      if (b.id === 'resume') this._resume();
      else if (b.id === 'abort') { this._holdConfirm = true; this._inputLock = HOLD_LOCK_S; this._uiTap(); }
      else if (b.id === 'cancel') { this._holdConfirm = false; this._inputLock = HOLD_LOCK_S; this._uiTap(); }
      else if (b.id === 'confirm') this._abortConfirmed();
      return;
    }
  }

  // ---- デバッグパネル ----
  _dbgButtons() {
    const labels = ['AUTO LAND', 'WIN NOW', 'CRASH', 'STAGE -', 'STAGE +', 'NEXT BODY', 'BONUS \u25b6', 'MODULE', 'FUEL FULL', '+3 CONTINUES', 'CLOSE'];
    return labels.map((label, i) => ({ label, x: 30 + (i % 2) * 150, y: 112 + Math.floor(i / 2) * 44, w: 140, h: 36 }));
  }
  _debugInput(action, data) {
    if (this._admin) { this._adminInput(action, data); return; }
    if (action === 'back') { this._dbgClose(); return; }
    if (action !== 'tap' || !data) return;
    const btns = this._dbgButtons();
    for (let i = 0; i < btns.length; i++) if (this._inRect(btns[i], data)) { this._debugAction(i); return; }
    if (this._inRect(this._adminBtnRect(), data)) this._adminOpen();
  }
  _adminBtnRect() { return { x: 180, y: 112 + 5 * 44, w: 140, h: 36, label: 'WORLD ADMIN' }; }

  // ---- DEBUG: WORLD ADMIN（管理キーはメモリのみ。localStorage/sessionStorage には保存しない）----
  _askAdminKey(cb) {
    const shown = showNameOverlay('', (v) => { cb(String(v == null ? '' : v).trim()); return null; }, { label: 'ADMIN KEY', password: true, max: 128 });
    if (!shown) cb('');
  }
  _adminOpen() {
    this._admin = { phase: 'loading', msg: 'LOADING\u2026', names: [], page: 0, confirm: null };
    this._adminTok = (this._adminTok || 0) + 1;
    if (_adminKeyMem) { this._adminLoad(); return; }
    this._askAdminKey((k) => { if (!this._admin) return; if (!k) { this._admin = null; return; } _adminKeyMem = k; this._adminLoad(); });
  }
  _adminErr(r) {
    const e = String((r && r.error) || '').toLowerCase();
    if (e === 'unauthorized' || e === 'forbidden') { _adminKeyMem = ''; return 'UNAUTHORIZED'; }
    if (e === 'disabled') return 'ADMIN DISABLED';
    return 'OFFLINE';
  }
  async _adminLoad() {
    const a = this._admin; if (!a) return;
    const tok = ++this._adminTok;
    a.phase = 'loading'; a.msg = 'LOADING\u2026';
    let r; try { r = await adminList(_adminKeyMem); } catch (_) { r = { ok: false }; }
    if (tok !== this._adminTok || this._admin !== a) return;
    if (r && r.ok) { a.phase = 'list'; a.msg = ''; a.names = Array.isArray(r.names) ? r.names : []; a.page = Math.min(a.page, Math.max(0, Math.ceil(a.names.length / ADMIN_PER_PAGE) - 1)); if (!a.names.length) a.msg = 'NO NAMES'; }
    else { a.phase = 'error'; a.msg = this._adminErr(r); }
  }
  _adminRects() {
    const a = this._admin, rows = [];
    const from = a.page * ADMIN_PER_PAGE;
    for (let i = 0; i < ADMIN_PER_PAGE && from + i < a.names.length; i++) {
      const n = a.names[from + i] || {};
      const b = n.best;
      rows.push({ name: String(n.name == null ? '' : n.name), label: String(n.name == null ? '' : n.name).slice(0, 14),
        sub: (b ? 'BEST ' + b.score + '  ST.' + b.stage : 'NO SCORE') + (n.first ? '  FIRST ' + String(n.first).slice(0, 10) : ''),
        del: { x: W - 36 - 56, y: 128 + i * 72, w: 56, h: 40 } });
    }
    const pages = Math.max(1, Math.ceil(a.names.length / ADMIN_PER_PAGE));
    return { rows, pages,
      prev: a.page > 0 ? { x: 30, y: 496, w: 80, h: 36, label: 'PREV' } : null,
      next: a.page < pages - 1 ? { x: W - 110, y: 496, w: 80, h: 36, label: 'NEXT' } : null,
      close: { x: W / 2 - 40, y: 496, w: 80, h: 36, label: 'CLOSE' } };
  }
  _adminConfirmRects() { return { yes: { x: 60, y: 300, w: W - 120, h: 44, label: 'CONFIRM DELETE' }, no: { x: 60, y: 360, w: W - 120, h: 44, label: 'CANCEL' } }; }
  _adminInput(action, data) {
    const a = this._admin;
    if (action === 'back') { if (a.confirm) a.confirm = null; else { this._admin = null; this._adminTok++; } return; }
    if (action !== 'tap' || !data) return;
    if (a.confirm) {
      const c = this._adminConfirmRects();
      if (this._inRect(c.no, data)) a.confirm = null;
      else if (this._inRect(c.yes, data)) this._adminDelete(a.confirm);
      return;
    }
    const R = this._adminRects();
    if (this._inRect(R.close, data)) { this._admin = null; this._adminTok++; return; }
    if (R.prev && this._inRect(R.prev, data)) { a.page--; return; }
    if (R.next && this._inRect(R.next, data)) { a.page++; return; }
    for (const r of R.rows) if (this._inRect(r.del, data)) { a.confirm = r.name; return; }
  }
  async _adminDelete(name) {
    const a = this._admin; if (!a) return;
    a.confirm = null; a.msg = 'DELETING\u2026';
    let r; try { r = await adminDelete(_adminKeyMem, name); } catch (_) { r = { ok: false }; }
    if (this._admin !== a) return;
    if (r && r.ok) await this._adminLoad(); else { a.phase = 'list'; a.msg = this._adminErr(r); }
  }
  _drawAdmin(ctx) {
    const a = this._admin, R = this._adminRects(), c = this._adminConfirmRects();
    drawAdminPanel(ctx, { phase: a.phase, msg: a.msg, rows: a.phase === 'error' ? [] : R.rows, prev: R.prev, next: R.next, close: R.close, page: a.page, pages: R.pages,
      confirm: a.confirm ? { text: 'DELETE ' + String(a.confirm).slice(0, 14) + '?', yes: c.yes, no: c.no } : null });
  }
  _dbgClose() { this.state = this._dbgPrev || 'play'; }
  // 状態を作り直して 'play' から始める（デバッグ操作の共通前処理）
  _dbgRestart() { this._auto = false; this._initStage(); }
  _debugAction(i) {
    this._dbgTainted = true;
    const wasPrev = this._dbgPrev || 'play';
    switch (i) {
      case 0: // AUTO LAND
        this.state = wasPrev;
        if (wasPrev !== 'play') this._dbgRestart();
        this._auto = true;
        break;
      case 1: { // WIN NOW: 完璧な着陸として着陸シーケンスへ
        this.state = 'play';
        if (wasPrev !== 'play') this._initStage();
        this.x = this.pad.x + this.pad.w / 2; this.y = this._terrainYAt(this.x) - 16;
        this.vx = 0; this.vy = 0.5; this.angle = 0; this.omega = 0;
        this._doSuccess(0, 0);
        break; }
      case 2: // CRASH
        this.state = 'play';
        if (wasPrev !== 'play') this._initStage();
        this._doCrash('DEBUG CRASH');
        break;
      case 3: this.bonus = null; this.stage = Math.max(1, this.stage - 1); this._dbgRestart(); break;
      case 4: this.bonus = null; this.stage += 1; this._dbgRestart(); break;
      case 5: this.bonus = null; this.stage = (Math.floor((this.stage - 1) / STAGES_PER_BODY) + 1) * STAGES_PER_BODY + 1; this._dbgRestart(); break;
      case 6: // BONUS: ミッション選択画面を開く
        this.bonus = null; this._auto = false;
        this._enterBonusSelect();
        break;
      case 7: { // MODULE
        this.bonus = null;
        const offers = rollOffers(this.modules);
        if (offers.length) { this.offers = offers; this._setOverlayState('module'); } else this.state = wasPrev;
        break; }
      case 8: // FUEL FULL
        this.fuel = this._fuelMax(); this.state = wasPrev; break;
      case 9: // +3 CONTINUES
        this.continues = (this.continues || 0) + 3; this.state = wasPrev; break;
      default: this._dbgClose(); break;
    }
  }

  _inRect(r, d) { return d.x >= r.x && d.x <= r.x + r.w && d.y >= r.y && d.y <= r.y + r.h; }
  // ミュートボタン: 上部ストリップ(y<52は操作入力が無効)の BACK/スコア/DEBUG タグのどれとも重ならない位置
  _muteRect() { return { x: 140, y: 18, w: 38, h: 32 }; }
  _dbgBtnRect() { return { x: W - 44, y: 100, w: 36, h: 16 }; }

  _giveUpRect() { return { x: W / 2 - 50, y: H / 2 + 60, w: 100, h: 32 }; }

  // ---- 状態遷移 ----
  _setOverlayState(state) {
    this.state = state;
    this._inputLock = INPUT_LOCK_S;
    this._overlayAt = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  _finishLanding() {
    if (this.landingSeq) this.landingSeq.t = Math.max(this.landingSeq.t, LANDING_SEQ_S);   // 祝福ループへ（シーンは残す）
    this._setOverlayState('cleared');
    this._inputLock = 0.3;
  }

  // クリア画面からの遷移: s%3===0 の通常ステージ後はボーナスミッションの選択画面を挟む
  _nextAfterClear() {
    if (this.bonus) { this._nextAfterBonus(); return; }
    if (this.stage % BONUS_EVERY === 0) { this._enterBonusSelect(); return; }
    this.stage += 1;
    this._initStage();
  }

  // ---- ボーナスミッションの選択（3枚 + SKIP BONUS）----
  // ★ CALM APPROACH / ★★ ROVER DOCK か CROSSWIND（機会ごとに交互）/ ★★★ STORM LANDING。
  _enterBonusSelect() {
    const mid = BONUS_ALT[this.bonusCount % BONUS_ALT.length];
    this.bonusCount += 1;
    this.bonusOffers = ['CALM', mid, 'STORM'];
    this._selTerrain = buildTerrain(48, null);   // 背景に見せる TERRA の丘（直前の天体の地形は使わない）
    this._setOverlayState('bonusselect');
  }
  _bonusCardRect(i) { return { x: 24, y: 112 + i * 122, w: W - 48, h: 112 }; }
  _bonusSkipRect() { return { x: W / 2 - 70, y: 488, w: 140, h: 30 }; }
  _pickBonus(i) {
    if (this.state !== 'bonusselect') return;
    const type = this.bonusOffers[i];
    if (!type) return;
    this._uiTap();
    this.bonusOffers = [];
    this.bonus = { type, afterStage: this.stage };
    this._initStage();
  }
  // SKIP BONUS: ボーナス無し・得点無し。通常どおりモジュール選択 -> 次のステージへ
  _skipBonus() {
    if (this.state !== 'bonusselect') return;
    this._uiTap();
    this.bonusOffers = [];
    this.bonus = null;
    this._nextAfterBonus();
  }

  // ボーナス終了（成功・失敗とも）-> 次の通常ステージ
  // ボーナス結果画面の後、次ステージの前にモジュール2択（選べるものが無ければスキップ）
  _nextAfterBonus() {
    this.bonus = null;
    const offers = rollOffers(this.modules);
    if (offers.length === 0) { this.stage += 1; this._initStage(); return; }
    this.offers = offers;
    this._setOverlayState('module');
  }

  _moduleCardRect(i) { return { x: 24, y: 150 + i * 170, w: W - 48, h: 150 }; }

  _pickModule(i) {
    if (this.state !== 'module') return;
    const id = this.offers[i];
    const d = moduleDef(id);
    if (!d) return;
    this.modules[id] = Math.min(d.max, (this.modules[id] || 0) + 1);
    this.offers = [];
    musicOf(this.engine).sfx.module();
    this.stage += 1;
    this._initStage();
  }

  _continue() {
    this.continues = Math.max(0, this.continues - 1);
    this._initStage(); // 同一ステージ(同一パラメータ)を新しい地形で再開。totalScore はそのまま
  }

  // デバッグ中/デバッグ操作を使ったランは記録しない（ローカル・世界ランキングとも）
  _isDebugRun() { return isDebug() || this._dbgTainted; }

  _gameOver(applyFuelScore, keepCheckpoint) {
    if (applyFuelScore) this.totalScore += Math.round((this.fuel || 0) * 2);
    const dbgRun = this._isDebugRun();
    if (!dbgRun && this.totalScore > this.high) {
      this.high = this.totalScore;
      this.engine.storage.setHigh(meta.id, this.high);
    }
    this._setOverlayState('gameover');
    if (!dbgRun && !keepCheckpoint) clearCheckpoint(this.engine.storage);   // 本当のゲームオーバー（残機切れ/GIVE UP）で破棄
    this.rankList = loadRanking(this.engine.storage);
    this.rankTabs = createRankTabs();
    this.newIdx = -1;
    this.goPhase = 'ranking';
    const prof = dbgRun ? null : getActiveProfile(this.engine.storage);
    const nm = (prof && prof.name) || getPlayerName(this.engine.storage) || 'PILOT';
    // 1ラン=1行。再開したランは自分の行を更新する（高い時だけ）。名前はプレイ前にタイトルで入力済み（無ければ PILOT）
    if (!dbgRun) {
      const ex = this.rankList.find((e) => e.runId === this.runId);
      if (ex ? this.totalScore > ex.score : qualifies(this.rankList, this.totalScore)) {
        const entry = { name: nm, score: this.totalScore, stage: this.stage, date: new Date().toISOString(), runId: this.runId };
        const list = recordEntry(this.rankList, entry);
        saveRanking(this.engine.storage, list);
        this.rankList = list;
        this.newIdx = list.indexOf(entry);
      } else if (ex) this.newIdx = -1;
    }
    if (!dbgRun && relayEnabled() && this.totalScore > 0) {
      try {
        Promise.resolve(submitScore({ name: nm, score: this.totalScore, stage: this.stage, key: prof ? prof.key : undefined })).then((r) => {
          if (r && r.ok === false && (r.status === 403 || r.status === 409)) this._worldNote = 'WORLD: NAME OWNED BY ANOTHER DEVICE';
        }, () => {});
      } catch (_) { /* 送信失敗はゲームに影響させない */ }
    }
  }

  // ---- Control inputs: 全タッチをゾーンごとに評価（同時押し可）----
  _readPointerControls() {
    const eng = this.engine;
    const pts = Array.isArray(eng.touches) ? eng.touches
      : (eng.pointer && eng.pointer.down ? [eng.pointer] : []);
    for (const pt of pts) {
      if (!(pt.y > CONTROL_Y_MIN)) continue;
      if (isDebug() && this._inRect(this._dbgBtnRect(), pt)) continue;
      if (pt.x < ZONE_L_MAX)      this._thrustRcsL = true;
      else if (pt.x > ZONE_R_MIN) this._thrustRcsR = true;
      else                        this._thrustMain = true;
    }
  }

  // ---- Per-frame logic ----
  update(dt) {
    if (typeof dt !== 'number' || dt <= 0 || dt > 0.1) dt = 0.016;
    musicOf(this.engine).tick(dt);
    if (this.state === 'debug') return;   // デバッグパネル表示中は一時停止
    if (this.state === 'tip') {   // 初回ヒント: 物理・タイマー凍結。時間経過で自動的に閉じる
      if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt);
      this._tipT -= dt; if (this._tipT <= 0) this._endTip();
      return;
    }
    if (this.state === 'hold') { if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt); return; }   // MISSION HOLD: 全て凍結
    this._clock = (this._clock || 0) + dt;

    if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt);

    if (this.state !== 'play') {
      this._updateParticles(dt);
      if (this.state === 'landing' && this.landingSeq) {
        this.landingSeq.t += dt;
        this.angle *= Math.pow(0.02, dt);   // 着地後、機体を起こして立たせる（宇宙飛行士の絵と整合）
        if (this.landingSeq.t >= LANDING_SEQ_S) this._finishLanding();
      } else if (this.state === 'cleared' && this.landingSeq) {
        this.landingSeq.t += dt;            // クリア画面中も祝福を続ける
        this.angle *= Math.pow(0.02, dt);
      }
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      return;
    }

    if (this._bannerT > 0) this._bannerT = Math.max(0, this._bannerT - dt);
    if (this._introT > 0) this._introT = Math.max(0, this._introT - dt);
    if (this._shieldFlash > 0) this._shieldFlash = Math.max(0, this._shieldFlash - dt);

    // ---- Moving pad (ROVER DOCK / STORM): パッドは台地上を往復。着地判定は常に現在位置を使う ----
    if (this.pad && this.pad.moving) {
      this._padT += dt;
      const k = 0.5 - 0.5 * Math.cos(2 * Math.PI * this._padT / (this.pad.period || 8));
      this.pad.x = this.pad.minX + (this.pad.maxX - this.pad.minX) * k;
      this.guidePts = buildGuide(this.guidePts[0].x, this.guidePts[0].y, this.pad, GUIDE_PTS);
    }

    // ---- Read control inputs ----
    // Pointer press-and-hold (any active touch with y > CONTROL_Y_MIN) maps by x-zone.
    // Top strip y < CONTROL_Y_MIN is ignored to avoid conflicting with the BACK button.
    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;
    if (this._auto && this._keys) {   // デバッグ AUTO LAND: PDオートパイロットが操縦
      const k = autopilotKeys(this);
      this._keys.left = k.left; this._keys.right = k.right; this._keys.up = k.up;
    }
    this._readPointerControls();
    if (this._holdGrace > 0) {   // RESUME 直後は操縦入力を無視（キーのパルスも捨てる）
      this._holdGrace = Math.max(0, this._holdGrace - dt);
      this._thrustMain = false; this._thrustRcsL = false; this._thrustRcsR = false;
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
    }

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
    this.omega *= Math.pow(this._angDamp(), dt);

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
      this.fuel = Math.max(0, this.fuel - FUEL_RATE_MAIN * ((this._body.heat && this._body.heat.mainFuelMul) || 1) * dt);
    }

    // ---- Heat (VENUS): 受動的な燃料消費 ----
    if (this._body.heat && this.fuel > 0) this.fuel = Math.max(0, this.fuel - this._body.heat.fuelDrain * dt);

    // ---- Gravity (straight down = +Y in canvas) ----
    // NO translational damping. Purely Newtonian: only gravity and engine thrust change velocity.
    this.vy += this._gravity * dt;

    // ---- Atmosphere: wind (horizontal accel) and drag. 真空の天体では _windSpec=null, drag=0 で何も起きない ----
    this._windT += dt;
    this._windAccel = windAt(this._windSpec, this._windT);
    this.vx += this._windAccel * dt;
    if (this._body.drag) {
      this.vx -= this.vx * this._body.drag * dt;
      this.vy -= this.vy * (this._body.dragY !== undefined ? this._body.dragY : this._body.drag) * dt;
    }

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
        if (ob.spent || this._auto) continue;   // AUTO LAND中は障害物を無視（デバッグ専用）
        const dx = this.x - ob.x;
        const dy = this.y - ob.y;
        if (Math.sqrt(dx * dx + dy * dy) < craftR + ob.r) {
          if (this._shieldCharges > 0) {    // SHIELD: 残り回数があれば被弾を吸収（その障害物はこのステージ中は無効）
            this._shieldCharges -= 1;
            this._shieldReady = this._shieldCharges > 0;
            this._shieldFlash = 0.5;
            ob.spent = true;
            this.engine.audio.beep && this.engine.audio.beep(660, 0.08, 'triangle', 0.10);
            continue;
          }
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
      if (absVy > this._bounceVy() || absVx > BOUNCE_VX || absAngle > BOUNCE_ANGLE) {
        this._bouncing = false;
        this._doCrash(this._crashReasonFor(absVy, absVx, absAngle, absOmega));
        return;
      }
      // まだ接触中だがゆっくりと落ち着いている -> もう一度バウンス処理
    }

    // ---- 即成功ウィンドウ（SAFE_* 以内）----
    const safeLand = absVy <= this._safeVy() &&
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
    const canBounce = absVy <= this._bounceVy() &&
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
    if (absVy > this._bounceVy()) return 'TOO FAST';
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
      // ボーナスミッション: round((600 + 残燃料*10) * 倍率)。通常のステージ得点・誘導線ボーナスは付かない。
      const sc = bonusScoreFor(this.bonus.type, this.fuel);
      this._bonusScore = sc;
      this._stageScore = sc;
      this._guideBonus = 0;
      this._bonusGrant = false;
      if (missionOf(this.bonus.type).grantContinue && this.continues < CONTINUES_MAX) {
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
    // PERFECT: とても柔らかく直立した着陸（祝福に星のバーストが付く）
    this._perfect = landVy <= PERFECT_VY && landVx <= PERFECT_VX && (absAngle || 0) <= PERFECT_ANGLE && (absOmega || 0) <= PERFECT_OMEGA;

    if (!this._isDebugRun() && this.totalScore > this.high) {
      this.high = this.totalScore;
      this.engine.storage.setHigh(meta.id, this.high);
    }

    // 成功: BGMを止めて7/8拍子のジングル（着陸チャイム sfx.landing はジングルと衝突するため廃止）
    { const mu = musicOf(this.engine); mu.stopAll(0.3); this._bgmOn = false;
      mu.playJingle({ tier: this.bonus ? Math.min(2, this._body.celebTier) : Math.min(2, this._body.celebTier + (this._info.loop > 0 ? 1 : 0)), perfect: !!this._perfect }); }
    this.landingSeq = { t: 0 };
    this._setOverlayState('landing');
  }

  // ---- クラッシュ処理 ----
  // ボーナス中: Continue を消費せず BONUS FAILED。通常: Continue が残っていれば 'crashed'、無ければ GAME OVER。
  _doCrash(reason) {
    this._explode();
    // 失敗音はユーザー指定で旧来の素朴な低いビープ（120Hz・ノコギリ波）に戻す。ミュート時は engine.audio.enabled=false で無音
    this.engine.audio.bad();
    musicOf(this.engine).stopAll(0.4); this._bgmOn = false;   // クラッシュ: BGM無音（再開は _initStage で）
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
    if (this.state === 'debug') {
      const real = this.state;
      this.state = this._dbgPrev || 'play';
      try { this._renderScene(ctx); } finally { this.state = real; }
      if (this._admin) this._drawAdmin(ctx); else this._drawDebugPanel(ctx);
      return;
    }
    if (this.state === 'tip') {
      const real = this.state;
      this.state = this._tipPrev || 'play';
      this._tipOn = true;
      try { this._renderScene(ctx); } finally { this.state = real; this._tipOn = false; }
      drawHudTip(ctx, Math.min(1, (HUD_TIP_S - this._tipT) / 0.25, this._tipT / 0.3));
      return;
    }
    if (this.state === 'hold') {
      const real = this.state;
      this.state = this._holdPrev || 'play';
      try { this._renderScene(ctx); } finally { this.state = real; }
      drawHoldPanel(ctx, { confirm: this._holdConfirm, stage: this.stage, body: this._body ? this._body.name : '', clock: this._clock, score: this.totalScore, buttons: this._holdButtons() });
      return;
    }
    this._renderScene(ctx);
  }

  _drawDebugPanel(ctx) {
    drawDebugPanel(ctx, 'DEBUG', 'ST.' + this.stage + '  ' + (this._body ? this._body.name : '') + (this.bonus ? '  BONUS' : ''), this._dbgButtons().concat([this._adminBtnRect()]));
  }

  // ---- シーン描画（見た目は art.js。ここは「何をどの順で描くか」だけ）----
  _renderScene(ctx) {
    const t = this._clock || 0;
    const body = this.state === 'bonusselect' ? TERRA : this._body;   // 選択画面の背景は TERRA の昼空（これから行く先を見せる）

    if (body) drawBackdrop(ctx, body, t, this.stars);

    const sel = this.state === 'bonusselect' && this._selTerrain;
    // Floating obstacles (stages 2+)
    if (!sel) this._drawObstacles(ctx);

    // Terrain + landing pad
    if (sel) drawTerrain(ctx, TERRA, this._selTerrain.pts, null, t);
    else {
      if (body && this.terrainPts && this.terrainPts.length > 0) drawTerrain(ctx, body, this.terrainPts, this.pad, t);
      if (this.pad) drawPad(ctx, this.pad, t);
    }

    // Descent trajectory guide（常に描画）— 地形・パッドより手前に描き、山に隠れずパッドまで繋がって見えるようにする
    if (!sel) this._drawGuide(ctx);

    // Explosion particles
    drawParticles(ctx, this.particles);

    // RADAR: 予測着地点と速度ベクトル
    if (this.state === 'play' && this._lvl('radar') > 0) this._drawRadar(ctx);

    // Lander craft
    if (this.state === 'play' || this.state === 'landing' || this.state === 'cleared') {
      this._drawLander(ctx, this.x, this.y, this.angle);
    }

    // SHIELD: 準備完了のリング / 吸収時のフラッシュ
    if (this.state === 'play' && this._lvl('shield') > 0 && (this._shieldReady || this._shieldFlash > 0)) {
      drawShieldRing(ctx, this.x, this.y, this._shieldFlash, this._shieldReady, this._shieldCharges);
    }

    // Landing sequence (astronaut scene)。クリア画面中も祝福を続けるため、シーンは cleared でも描く（パネルは重ならない位置）
    if ((this.state === 'landing' || this.state === 'cleared') && this.landingSeq) this._drawLandingScene(ctx);

    // 大気の見た目: 火星の砂塵(視覚のみ) / タイタン・金星の視界制限
    if (this.state === 'play') this._drawAtmosphere(ctx);

    // 着陸パッドのビーコン（霧の上に常に描く）
    this._drawBeacon(ctx);

    // HUD
    this._drawHUD(ctx);

    // 天体の紹介バナー（天体の最初のステージ）
    if (this.state === 'play' && !this._tipOn && this._introT > 0 && body) {
      const parts = introText(body).split(' · ');
      drawIntro(ctx, parts[0], parts.slice(1, 3).join('  ·  '), parts.slice(3).join('  ·  '), this._introT * 2);
    }

    // Bonus mission banner
    if (this.state === 'play' && this.bonus && this._bannerT > 0) drawBonusBanner(ctx, (this._mission || missionOf(this.bonus.type)).name, this._bannerT, (this._mission || missionOf(this.bonus.type)).stars);

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
    } else if (this.state === 'module') {
      this._drawModuleSelect(ctx);
    } else if (this.state === 'bonusselect') {
      this._drawBonusSelect(ctx);
    }

    // デバッグ: DBGボタン
    if (isDebug() && DBG_STATES.indexOf(this.state) >= 0) drawDebugTag(ctx, this._dbgBtnRect());

    if (this.state === 'play') drawHoldButton(ctx, this._holdRect());
    // ミュート（小さなスピーカー）
    { const m = this._muteRect(); drawSpeaker(ctx, m.x + m.w / 2, m.y + m.h / 2 + 1, 0.8, 'rgba(236,230,216,0.6)', isMuted(this.engine)); }
  }

  // ---- 大気: 砂塵 / 霧 ----
  _drawAtmosphere(ctx) {
    const b = this._body; if (!b) return;
    const v = b.visual || {};
    if (v.haze) drawHaze(ctx, v.haze.color, v.haze.alpha);
    if (b.visibility) drawFog(ctx, v.fog || '#000000', this.x, this.y, b.visibility);
  }

  _drawBeacon(ctx) {
    if (!this.pad || this.state === 'module' || this.state === 'bonusselect') return;
    drawBeacon(ctx, this.pad, this._clock || 0);
  }

  // ---- RADAR ----
  // 現在の速度のまま推力なしで進んだ場合の着地点（重力・風・抗力を update と同じ順序で積分）
  predictLanding(dt = RADAR_DT, maxT = RADAR_MAX_T) {
    let x = this.x, y = this.y, vx = this.vx, vy = this.vy;
    const drag = (this._body && this._body.drag) || 0;
    const dragY = (this._body && this._body.dragY !== undefined) ? this._body.dragY : drag;
    for (let t = 0, step = 1; t < maxT; t += dt, step++) {
      vy += this._gravity * dt;
      vx += windAt(this._windSpec, this._windT + step * dt) * dt;
      if (drag) { vx -= vx * drag * dt; vy -= vy * dragY * dt; }
      x += vx * dt; y += vy * dt;
      if (x < 14)     { x = 14;     vx =  Math.abs(vx) * 0.3; }
      if (x > W - 14) { x = W - 14; vx = -Math.abs(vx) * 0.3; }
      if (y < 60) { y = 60; vy = Math.max(0, vy); }
      const ty = this._terrainYAt(x);
      if (y + 16 >= ty) return { x, y: ty, t: t + dt, hit: true };
    }
    return { x, y, t: maxT, hit: false };
  }

  _drawRadar(ctx) {
    const pr = this.predictLanding();
    drawRadar(ctx, pr.hit, pr.x, pr.y, this.x, this.y, this.vx, this.vy);
  }

  // ---- モジュール選択 ----
  _drawModuleSelect(ctx) {
    const cards = [];
    for (let i = 0; i < this.offers.length; i++) {
      const d = moduleDef(this.offers[i]);
      const lv = this._lvl(d.id);
      cards.push({ id: d.id, name: d.name, desc: d.desc, rect: this._moduleCardRect(i),
        level: d.max > 1 ? 'LV ' + lv + ' → ' + (lv + 1) + ' / ' + d.max : 'NEW' });
    }
    drawModuleCards(ctx, { sub: 'STAGE ' + this.stage + ' COMPLETE', cards });
  }

  // ---- Landing sequence ----
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
    const g = this._landingGeometry();
    const { ph } = g;
    // ハッチ（開閉）とハシゴ（ハッチ開放後）
    drawHatch(ctx, g.hatchX, g.hatchY, ph.name === 'hatch' ? ph.p : 1);
    if (ph.name !== 'hatch') drawLadder(ctx, g.ladderX, g.hatchY + 6, g.groundAt(g.ladderX));
    // 旗（planting 中〜）
    if (ph.name === 'flag' || ph.name === 'wave' || ph.name === 'done') {
      const ft = ph.name === 'flag' ? ph.p : 1;
      const pose0 = ph.name === 'done' ? celebrationPose(this._body, this._info.loop, g.t - LANDING_SEQ_S, this._perfect) : null;
      this._drawLandingFlag(ctx, g.ax + 8, g.groundAt(g.ax + 8), ft, pose0 ? pose0.flagWave : 0);
    }
    // 宇宙飛行士（ハッチ開放後）。シーケンス終了後は天体ごとの祝福ポーズ（ジャンプ/回転/腕）を渡す
    if (ph.name !== 'hatch') {
      const pose = ph.name === 'done' ? celebrationPose(this._body, this._info.loop, g.t - LANDING_SEQ_S, this._perfect) : null;
      this._drawAstronaut(ctx, g.ax, g.ay, ph.name, g.t, pose);
      if (pose && pose.fx) this._drawCelebFx(ctx, g.ax + pose.dx, g.ay - pose.dy - 8, pose.fx);
    }
    if (this.state === 'landing') drawTouchdown(ctx);
  }

  // 宇宙飛行士。(x,y)=足元。phase: 'descend'|'walk'|'flag'|'wave'|'done'。pose: celebrationPose の戻り値（任意）
  _drawAstronaut(ctx, x, y, phase, t, pose) { drawAstronaut(ctx, x, y, phase, t, pose); }
  // PERFECT着陸の祝福エフェクト（星とハート）
  _drawCelebFx(ctx, x, y, fx) { drawCelebFx(ctx, x, y, fx); }
  _drawLandingFlag(ctx, x, y, t, wave) { drawFlag(ctx, x, y, t, wave); }

  // ---- Floating obstacles ----
  _drawObstacles(ctx) {
    if (!this.obstacles || this.obstacles.length === 0) return;
    drawObstacles(ctx, this.obstacles, this._clock || 0, this._body);
  }

  // ---- Descent trajectory guide ----
  // 常に描画（OFF COURSE は薄く、ON COURSE は明るく脈動）。
  _drawGuide(ctx) {
    const pts = this.guidePts;
    if (!pts || pts.length < 2) return;
    const dist     = (this.state === 'play') ? this._distToGuide(this.x, this.y) : Infinity;
    const onCourse = (dist <= GUIDE_THRESHOLD);
    const pulse = onCourse ? (0.7 + 0.3 * Math.sin(((this._onCoursePulse || 0) * Math.PI * 2) * 1.5)) : 1.0;
    drawGuide(ctx, pts, onCourse, pulse);
    this._ocPulse = (onCourse && this.state === 'play') ? pulse : 0;   // ラベルはHUD層（霧の上）で描く
    if (onCourse && this.state === 'play') this._drawOnCourseIndicator(ctx, pulse);
  }

  _drawOnCourseIndicator(ctx, pulse) {
    if (typeof pulse !== 'number') pulse = 1;
    drawOnCourse(ctx, this.x, this.y, this._onCoursePulse || 0, pulse);
  }

  // ---- Lander craft ----
  // Rotation math (ctx.rotate convention): +rad = CW on screen. omega>0 -> angle増 -> 機首が右へ。
  // 炎は発射側ノズルに描く（LEFTボタン=左ノズルが左へ噴射、RIGHTボタン=右ノズルが右へ噴射）。
  _drawLander(ctx, x, y, angleDeg) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const fuelOk = this.fuel > 0;
    drawShip(ctx, x, y, angleDeg, !!(this._thrustMain && fuelOk), !!(this._thrustRcsL && fuelOk), !!(this._thrustRcsR && fuelOk), this._clock || 0);
  }

  // ---- HUD（データを集めて art.drawHUD に渡す。x>=52 は BACK ボタンを避ける）----
  _drawHUD(ctx) {
    const h = this._hud || (this._hud = {});
    const b = this._body;
    h.stage = this.stage; h.bodyName = this.state === 'bonusselect' ? TERRA.name : (b ? b.name : ''); h.bonus = !!this.bonus;
    h.mission = (this.bonus && this._mission) ? this._mission.name : '';
    h.total = this.totalScore; h.high = this.high || 0;
    h.fuel = (this.fuel || 0) / this._fuelMax();
    h.continues = this.continues || 0;
    h.modDefs = MODULE_DEFS; h.mods = this.modules || {};
    h.debug = isDebug(); h.play = this.state === 'play';
    h.t = this._clock || 0;
    h.realG = b ? b.realG : null; h.atmoTag = b ? b.atmoTag : '';
    if (this._pilotFor !== this.runId) { this._pilotFor = this.runId; const pr = getActiveProfile(this.engine.storage); this._pilotName = (pr && pr.name) || ''; }
    h.pilot = this._pilotName || '';
    h.wind = !!this._windSpec; h.windAccel = this._windAccel || 0;
    const vy = this.vy || 0, vx = this.vx || 0, ang = this.angle || 0, om = this.omega || 0;
    const absAng = Math.abs(((ang + 180) % 360 + 360) % 360 - 180);
    h.vy = vy; h.vx = vx; h.ang = ang; h.om = om;
    h.sVy  = Math.abs(vy) <= this._safeVy() ? 0 : Math.abs(vy) <= this._safeVy() * 1.6 ? 1 : 2;
    h.sVx  = Math.abs(vx) <= SAFE_VX ? 0 : Math.abs(vx) <= SAFE_VX * 2 ? 1 : 2;
    h.sAng = absAng <= SAFE_ANGLE ? 0 : absAng <= SAFE_ANGLE * 2 ? 1 : 2;
    h.sOm  = Math.abs(om) <= SAFE_OMEGA ? 0 : Math.abs(om) <= SAFE_OMEGA * 2 ? 1 : 2;
    drawHUD(ctx, h);
    if (this._ocPulse > 0 && this.state === 'play') drawOnCourseLabel(ctx, this._ocPulse);
  }

  // ---- Bottom button bar（入力ゾーンは update 側の ZONE_* のまま）----
  // 左ボタン=機首が右へ(時計回り)、右ボタン=機首が左へ(反時計回り)。見た目は機首の回転方向を示す。
  _drawButtons(ctx) {
    drawControls(ctx, this._thrustRcsL, this._thrustMain, this._thrustRcsR);
  }

  // ---- Stage Clear overlay ----
  // パネルは y 128..344 に固定（パッド面は y>=455 なので下端は111px以上上。宇宙飛行士・旗・機体に重ならない）
  _clearPanelRect() { return { x: 20, y: 128, w: W - 40, h: 216 }; }

  _drawClearScreen(ctx) {
    const b = this.bonus;
    let next;
    if (b) next = 'TAP  ·  STAGE ' + (this.stage + 1);
    else if (this.stage % BONUS_EVERY === 0) next = 'TAP  ·  BONUS MISSION';
    else next = 'TAP  ·  STAGE ' + (this.stage + 1);
    const cols = b
      ? [['CONTINUE', this._bonusGrant ? '+1' : '–', this._bonusGrant ? P().mid : P().dim], ['TOTAL', String(this.totalScore)], ['BEST', String(this.high || 0)]]
      : [['GUIDE BONUS', '+' + (this._guideBonus || 0)], ['TOTAL', String(this.totalScore)], ['BEST', String(this.high || 0)]];
    drawClearPanel(ctx, this._clearPanelRect(), {
      bonus: !!b, perfect: !!this._perfect,
      sub: b ? missionOf(b.type).name + '  ·  \u00d7' + missionOf(b.type).mult : 'STAGE ' + this.stage + ' COMPLETE' + (this._perfect ? '  ·  PERFECT' : ''),
      score: (b ? this._bonusScore : this._stageScore) || 0, cols, next, t: this._clock || 0,
    });
  }

  // ---- Crashed (continue available) ----
  _drawCrashed(ctx) {
    drawCrashPanel(ctx, { reason: this._crashReason || '', score: this.totalScore, left: this.continues, giveUp: this._giveUpRect() });
  }

  // ---- ボーナスミッション選択 ----
  _drawBonusSelect(ctx) {
    const cards = this.bonusOffers.map((type, i) => { const m = missionOf(type); return { rect: this._bonusCardRect(i), stars: m.stars, name: m.name, line: m.line, mult: m.mult, extra: m.grantContinue ? '+1 CONTINUE ON SUCCESS' : '' }; });
    drawBonusCards(ctx, { sub: 'TERRA  \u00b7  g 9.81 m/s\u00b2', cards, skip: this._bonusSkipRect(), t: this._clock || 0 });
  }

  // ---- Bonus failed (no continue consumed) ----
  _drawBonusFailed(ctx) {
    drawBonusFailedPanel(ctx, { reason: this._crashReason || '', next: this.stage + 1 });
  }

  // ---- Game Over: ranking（名前はプレイ前に入力済み）----
  _drawGameOver(ctx) {
    drawGameOverFrame(ctx, { score: this.totalScore, stage: this.stage, debugRun: this._isDebugRun(), newRecord: this.newIdx >= 0 });
    drawRankPanel(this.engine, ctx, this.rankTabs || createRankTabs(), this.rankList || [], 32, 146, W - 64, this.newIdx);
    if (this._worldNote) drawNote(ctx, this._worldNote);
    drawGameOverFooter(ctx);
  }
}
