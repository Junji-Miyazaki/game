// LANDER: Control attitude with RCS thrusters and soft-land on the lunar surface.
// Reaction-thruster convention (physically correct):
//   LEFT  button (x < 120): right-side thruster fires RIGHT -> reaction pushes nose LEFT  -> craft rotates CW  (omega +)
//   RIGHT button (x > 240): left-side thruster fires LEFT  -> reaction pushes nose RIGHT -> craft rotates CCW (omega -)
//   THRUST button (center): main engine fires along craft's up-axis.
// Safe landing on the pad = STAGE CLEAR. Crash = GAME OVER.
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, saveRanking, recordEntry, qualifies, createRankTabs, rankTabsTap, drawRankPanel, getPlayerName, getActiveProfile, newRunId, recordStageReached, loadCheckpoint, saveCheckpoint, clearCheckpoint, WorldNet, top1FromList, loadWorld } from './ranking.js';
import { isDebug } from './debug.js';
import { autopilotKeys } from './autopilot.js';
import { GRAVITY_BASE, ICE_FRICTION, STAGES_PER_BODY, stageInfo, bodyGravity, padWidth, obstacleCount, obstacleSpeed, goalKey, goalText, makeWindSpec, windAt, bodyHasWind, introText, celebrationPose, TERRA, BONUS_ALT, missionOf, bonusBody, bonusScoreFor } from './bodies.js';
import { buildRings, newRingState, ringStep, allRingsGot, POWER_DEFS, POWER_FUEL_FRAC, SLOWMO_S, SLOWMO_FACTOR, SIDE_S, SIDE_ACCEL, segDist } from './rings.js';
import { recordStage, STAR_LANDED, STAR_RINGS, STAR_PERFECT } from './stars.js';
import { patchesSummary, patchIsNew, drawPatchAward, PATCH_AWARD_S, PATCH_CHIME_S } from './patches.js';
import { MODULE_DEFS, moduleDef, newModules, rollOffers, fuelMulFor, angDampFor, SAFE_VY_PER_LEVEL, BOUNCE_VY_PER_LEVEL } from './modules.js';
import { relayEnabled, adminList, adminDelete, adminResetPin } from './net.js';
import { musicOf, toggleMute, isMuted, hideNameOverlay, showNameOverlay, openChampionEntry, championEntryOpen, hideChampionEntry } from './title.js';
import { i18nBind, i18nLang, i18nInverted } from './core/i18n.js';
import { HtCard, htSkipGet } from './howto.js';
import { veil, drawBackdrop, drawTerrain, drawPad, drawBeacon, drawParticles, drawShieldRing, drawRadar, drawShip, drawHatch, drawLadder, drawAstronaut, drawFlag, drawCelebFx, drawObstacles, drawGuide, drawOnCourse, drawOnCourseLabel, drawHaze, drawFog, drawHUD, drawHudTip, drawControls, drawIntro, drawBonusBanner, drawTouchdown, drawClearPanel, drawCrashPanel, drawBonusFailedPanel, drawModuleCards, drawBonusCards, drawGameOverFrame, drawGameOverFooter, drawDebugPanel, drawDebugTag, drawSpeaker, drawHoldButton, drawHoldPanel, drawAdminPanel, drawNote, drawLandableSpots, drawGroundShadow, drawGroundedBanner, drawTouchHint, mixHex, drawRing, drawPowerRing, drawFloat, drawPowerBanner, drawHorizonGlare, drawLandableLabels, drawShieldBubble, drawShieldButton, drawShieldBanner, drawDimTint, drawWaypoint, drawPadLocked, drawSlidingCue, drawWaypointBanner, drawGoalLine } from './art.js';

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

// ---- L1: どこでも接地 / 着陸グレード ----
export const LAND_SLOPE_DEG = 10;   // 接地できる地面の傾斜上限(度)。左右の脚の下の地表2点から求める
export const FOOT_HALF      = 18;   // 脚の左右オフセット(px)
export const FLAT_MIN_W     = 44;   // 「平地」として数える連続平坦区間の最小幅(px)
const SHADOW_ALT        = 220;   // この高度(px)未満で機体下に地面マーカーを出す
const TOUCH_HINT_DIST   = 160;   // 着陸可能な平地にこの距離まで近づいたら初回ヒント
const TOUCH_HINT_S      = 3.5;
const STRANDED_S        = 1.5;   // 燃料切れで接地したままこの秒数たつと失敗
const LIFTOFF_VY        = -7;    // 離陸時の上向きの初速(px/s)
const LIFTOFF_MIN_S     = 0.2;   // 接地直後にこの秒数は離陸しない（押しっぱなしでそのまま跳ねないように）
const SHAKE_S = 0.25, SHAKE_PX = 3;
export const SLIDE_CAP_DIST = 12;   // 冥王星: 氷上でこれ以上滑ると（パッド上で止まっても）グレードは A まで
const SLIDE_EPS = 0.05;           // この速さ(px/s)未満で「止まった」とみなす
const WP_FUEL_MUL = 1.35;           // 冥王星 2つめ（中継地点つき）の燃料倍率
const WP_W = 44;                  // 中継地点の幅(px)
const SLIDE_MARGIN = 14;          // 画面端（水平クランプと同じ）
const CLEAR_SLOT_S = 0.2;        // クリア画面の集計：1行あたりの秒数
const CLEAR_STAMP_S = 0.18;      // グレードのスタンプが押される秒数
const STAR_POP_DELAY = 0.12, STAR_POP_STEP = 0.24, STAR_POP_S = 0.2;   // クリア画面: 新しく取った★が順に押される（グレードのスタンプの後）
const PATCH_ROOM = 46, PATCH_GAP = 0.25;   // クリア画面: PATCH EARNED の行の高さ / ★の後の間（秒）
const POWER_BANNER_S = 2.4;      // 特典取得のバナー秒数
const SIDE_LEVEL_K = 8;          // SIDE THRUST: 機体を水平に保つ強さ（角度が指数的に 0 へ。1/K 秒の時定数。角速度は 0 に固定）
const LABEL_ALT = 150;           // LANDABLE の文字を出す、平地の上の高度(px)未満
const LABEL_FADE = 6;            // LANDABLE のフェード速度(1/秒)
const THREAT_T = 1.5, THREAT_STEPS = 15, THREAT_PAD = 6, SHIP_R = 14;   // 衝突コース警告: 先読み秒数・分割数・余白・機体の半径（当たり判定と同じ 14）
// SHIELD ゲージ: 稼働中の時間（play / grounded）で SH_FULL_S 秒かけて満タン。発動で SH_DUR_S 秒、機体のまわりに隕石だけを弾く泡（地面の衝撃は従来どおり）
export const SH_FULL_S = 20, SH_DUR_S = 5, SH_BUBBLE_R = 28, SH_BANNER_S = 1.6;
export const SH_BTN = { x: 138, y: 500, w: 84, h: 56 };          // 画面下の SHIELD ボタン（メイン噴射ボタンの真上。3つの操作ボタン y>=570 とは重ならない）
export const SH_HIT = { x: 130, y: 492, w: 100, h: 67 };         // 当たり判定（見た目より少し広い。下端 y=559 は操作帯 y>=560 の手前）
const SH_CTL_Y = 560;                                      // これより下は操作ボタン帯（マウスの「どこでもクリック」では発動しない）
// グレード表（上から評価。接地の瞬間の vy/vx(px/s)・傾き(度)・角速度(度/s)・パッド中心からの距離(パッド半幅=1)がすべて以下なら該当）。どれも満たさなければ C。
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
export function gradeRank(g) { return GRADE_ORDER.indexOf(g); }

// 地表の高さ（折れ線の線形補間。x は 0..W に丸める）
export function terrainYOn(pts, x) {
  if (!pts || pts.length < 2) return H;
  x = Math.max(0, Math.min(W, x));
  for (let i = 0; i < pts.length - 1; i++) {
    if (x >= pts[i].x && x <= pts[i + 1].x) {
      const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
      return pts[i].y + t * (pts[i + 1].y - pts[i].y);
    }
  }
  return H;
}
// 機体中心 x での接地面の傾斜(度)：左右の脚(±FOOT_HALF)の下の地表2点を結ぶ線
export function footSlopeDeg(pts, x) {
  const xl = Math.max(0, x - FOOT_HALF), xr = Math.min(W, x + FOOT_HALF);
  if (xr - xl < 1) return 0;
  return Math.abs(Math.atan2(terrainYOn(pts, xr) - terrainYOn(pts, xl), xr - xl)) * 180 / Math.PI;
}
// 連続して傾斜 <= LAND_SLOPE_DEG の地表区間のうち幅 >= FLAT_MIN_W のもの [{x0,x1,y}]
export function flatRuns(pts) {
  const out = [];
  if (!pts || pts.length < 2) return out;
  const tanMax = Math.tan(LAND_SLOPE_DEG * Math.PI / 180);
  let start = -1;
  const flush = (endIdx) => {
    if (start < 0) return;
    const x0 = pts[start].x, x1 = pts[endIdx].x;
    if (x1 - x0 >= FLAT_MIN_W) out.push({ x0, x1, y: terrainYOn(pts, (x0 + x1) / 2) });
    start = -1;
  };
  for (let i = 0; i < pts.length - 1; i++) {
    const flat = Math.abs(pts[i + 1].y - pts[i].y) <= tanMax * (pts[i + 1].x - pts[i].x) + 1e-9;
    if (flat) { if (start < 0) start = i; } else flush(i);
  }
  flush(pts.length - 1);
  return out;
}
// パッド（移動パッドは台地全体）と重なる平地を除いた、パッド以外の着陸可能な平地
export function landableSpots(pts, pad) {
  const z0 = pad ? (pad.moving ? pad.minX : pad.x) : 0;
  const z1 = pad ? (pad.moving ? pad.maxX + pad.w : pad.x + pad.w) : 0;
  return flatRuns(pts).filter(r => !pad || r.x1 <= z0 + 1e-6 || r.x0 >= z1 - 1e-6);
}
// ---- 見やすさ（純粋関数。描画と試験で共有）----
// 機体が平地の真上（水平位置が区間内）かつ平地面からの高度が LABEL_ALT 未満・面より上にいる平地の番号。無ければ -1
export function landableLabelIndex(spots, x, y) {
  if (!spots) return -1;
  const fy = y + 16;
  for (let i = 0; i < spots.length; i++) {
    const sp = spots[i];
    if (x >= sp.x0 && x <= sp.x1) { const alt = sp.y - fy; if (alt > -10 && alt < LABEL_ALT) return i; }
  }
  return -1;
}
// 衝突コース予測: 機体（現在の速度+重力）と各障害物（速度+壁の反射。slowT>0 の間は factor 倍）を THREAT_T 秒先まで進め、
// 最接近距離が 障害物の半径+機体の半径+THREAT_PAD 未満なら true。サンプル間は相対運動を線分で結んで最接近を求める（すり抜けを見逃さない）。
// ship: {x,y,vx,vy}、戻り値: obs と同じ並びの bool 配列。spent（シールドで無効化済み）の障害物は常に false。
export function obstacleThreats(ship, obs, gravity, wallW, slowT, factor) {
  const out = [];
  if (!obs || !obs.length) return out;
  const n = THREAT_STEPS, dt = THREAT_T / n;
  for (let k = 0; k < obs.length; k++) {
    const ob = obs[k];
    if (ob.spent) { out.push(false); continue; }
    let ox = ob.x, ovx = ob.vx;
    let px = ox - ship.x, py = ob.y - ship.y;   // 相対位置（障害物 - 機体）
    const lim = ob.r + SHIP_R + THREAT_PAD;
    let hit = Math.hypot(px, py) < lim;
    for (let i = 1; i <= n && !hit; i++) {
      const t0 = (i - 1) * dt, t1 = i * dt;
      const f = (slowT > t0 + dt / 2) ? factor : 1;   // SLOW-MO の残り時間を反映
      ox += ovx * dt * f;
      if (ox - ob.r < 0) { ox = ob.r; ovx = Math.abs(ovx); }
      if (ox + ob.r > wallW) { ox = wallW - ob.r; ovx = -Math.abs(ovx); }
      const sx = ship.x + ship.vx * t1, sy = ship.y + ship.vy * t1 + 0.5 * gravity * t1 * t1;
      const qx = ox - sx, qy = ob.y - sy;
      if (segDist(px, py, qx, qy, 0, 0) < lim) hit = true;
      px = qx; py = qy;
    }
    out.push(hit);
  }
  return out;
}

const HUD_TIP_S        = 4;     // 初回ヒントの表示秒数
const HUD_TIP_LOCK_S   = 0.3;   // 表示直後のタップ無視
const HOLD_LOCK_S       = 0.3;   // HOLDパネル表示/切替直後のボタン無視（誤タップ防止）
const ADMIN_PER_PAGE    = 5;
let _adminKeyMem = '';   // 管理キー（セッション中のみ・メモリ上。保存しない）
const DBG_STATES = ['play', 'landing', 'cleared', 'crashed', 'bonusfailed'];
const GOAL_S            = 2.5;   // ステージ開始時の「やること」1文の表示秒数（非停止）
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

// パッド領域（点 i0..i1、その両隣はなだらかに繋ぐ点 i0-1 / i1+1）を避けて、幅 wPts 点の平地を2つ置ける配置を返す。無ければ null。
function planSpots(i0, i1) {
  const lo = 1, hi = TERRAIN_SEGS - 1;   // 両端の点（床）は触らない
  const ranges = [[lo, i0 - 2], [i1 + 2, hi]];
  for (const w of [5, 4]) {              // 幅広(5点=80px)を優先、無理なら4点(60px)
    const starts = [];
    for (const [a, b] of ranges) for (let st = a; st + w - 1 <= b; st++) starts.push(st);
    const pairs = [];
    for (let m = 0; m < starts.length; m++) for (let n = m + 1; n < starts.length; n++) {
      if (starts[n] >= starts[m] + w) pairs.push([starts[m], starts[n]]);   // 隣接可（間の1区間が段差になる）
    }
    if (!pairs.length) continue;
    const far = pairs.filter(([a, b]) => (b - a) * (W / TERRAIN_SEGS) >= 100);   // できるだけ離す
    const pool = far.length ? far : pairs;
    const pr = pool[Math.floor(Math.random() * pool.length)];
    return { w, starts: pr };
  }
  return null;
}

// ---- Terrain generation ----
// opts.plateau: 台地の区間数(>0) -> 移動パッド用（ROVER DOCK / STORM LANDING）。その区間ぶんの平坦台地を作り、pad に移動範囲 minX/maxX と周期 period を持たせる。
// L1: パッド以外にも、着陸可能な平地（>=44px、実際は60〜80px）を必ず2つ以上、パッドと重ならない位置に作る。
export function buildTerrain(padW, opts) {
  const plateau = (opts && opts.plateau) | 0;   // 台地の区間数。0 = 固定パッド
  const segW    = W / TERRAIN_SEGS;
  const pts     = [];

  for (let i = 0; i <= TERRAIN_SEGS; i++) {
    const x = i * segW;
    const y = (i === 0 || i === TERRAIN_SEGS) ? FLOOR_Y : FLOOR_MIN + Math.random() * (FLOOR_Y - FLOOR_MIN);
    pts.push({ x, y });
  }

  const flatY = PAD_Y_MIN + Math.random() * PAD_Y_RANGE;
  let flatX0, flatX1, i0, i1, plan = null;
  // パッド位置を選ぶ。平地2つを置けない配置（パッドが広い・端寄りで余白が足りない等）は引き直す。50回で諦めて固定配置（必ず置ける）にする
  for (let attempt = 0; attempt < 60; attempt++) {
    const fixed = attempt >= 50;
    if (plateau) {
      i0 = fixed ? 1 : 1 + Math.floor(Math.random() * (TERRAIN_SEGS - plateau - 1)); // 1 .. TERRAIN_SEGS-SEGS-1
      i1 = i0 + plateau;
      flatX0 = i0 * segW; flatX1 = i1 * segW;
    } else {
      // パッドを置く区間（従来どおり i=2..TERRAIN_SEGS-4 から選ぶ）
      const padSeg = fixed ? 2 : 2 + Math.floor(Math.random() * (TERRAIN_SEGS - 5));
      const midX = (padSeg + 0.5) * segW;
      flatX0 = midX - padW / 2; flatX1 = midX + padW / 2;
      i0 = Math.floor(flatX0 / segW);
      i1 = Math.ceil(flatX1 / segW);
    }
    plan = planSpots(i0, i1);
    if (plan) break;
  }
  // パッドの下の地形はパッド面と同じ高さに平坦化（パッド端で地形がパッドと食い違わないように）
  for (let i = i0; i <= i1; i++) pts[i].y = flatY;
  if (i0 > 0)                pts[i0 - 1].y = (pts[i0 - 1].y + flatY) / 2;
  if (i1 + 1 <= TERRAIN_SEGS) pts[i1 + 1].y = (pts[i1 + 1].y + flatY) / 2;

  // 平地の高さ: パッド面・隣の平地と12px以上ずらす（段差で別の平地として分かれる）。コントロールバーより十分上（<=520）
  if (plan) {
    const ys = [];
    for (let k = 0; k < 2; k++) {
      const ok = (y) => Math.abs(y - flatY) >= 12 && (k === 0 || Math.abs(y - ys[0]) >= 12);
      let y = 0, found = false;
      for (let n = 0; n < 30 && !found; n++) { y = 450 + Math.random() * 65; found = ok(y); }
      for (let c = 450; c <= 520 && !found; c += 5) { if (ok(c)) { y = c; found = true; } }
      ys.push(y);
      for (let q = 0; q < plan.w; q++) pts[plan.starts[k] + q].y = y;
    }
  }

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
    if (this._champ) this._champ.close();
    this._champTok = (this._champTok || 0) + 1; this._champ = null;
    hideNameOverlay(); hideChampionEntry();   // 名前入力DOMがゲーム画面に残らないように
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
    this.startStage = 1;             // このランの開始ステージ（到達済み天体から開始した場合は >1）
    this._introNext = true;          // ランの最初のステージでは（天体の途中からでも）天体紹介を出す
    this._worldNote = '';
    this._touchHintDone = undefined;   // 'touchHintSeen' は初回判定時に読む
    // タイトルの CHOOSE START: 到達済み天体の最初のステージから、スコア0・残機3・モジュールなしで開始
    const ss = this.engine.startStage; this.engine.startStage = null;
    if (Number.isInteger(ss) && ss > 1 && ss <= 9999 && !this.engine.resumeCheckpoint) {
      this.stage = ss; this.startStage = ss;
      this.bonusCount = Math.floor((ss - 1) / BONUS_EVERY);
    }
    // タイトルの CONTINUE MISSION: 保存したステージの「開始」から再開（地形は新規）
    const cp = this.engine.resumeCheckpoint; this.engine.resumeCheckpoint = null;
    if (cp && cp.v === 1) {
      this.stage = cp.stage; this.totalScore = cp.totalScore; this.continues = cp.continues; this.runId = cp.runId;
      this.startStage = Number.isInteger(cp.startStage) && cp.startStage >= 1 ? cp.startStage : 1;
      for (const k of Object.keys(this.modules)) { const d = moduleDef(k); this.modules[k] = Math.max(0, Math.min(d ? d.max : 0, (cp.modules && cp.modules[k]) | 0)); }
      this.bonusCount = Math.floor((cp.stage - 1) / BONUS_EVERY);
    }
    i18nBind(this.engine.storage);
    this._ht = null;
    this._gauge = 0;   // 新しいラン（CONTINUE・MAP 開始を含む）は SHIELD ゲージ 0 から
    this._initStage();
    if (!this._maybeShowHowto()) this._maybeShowTip();
  }

  exit() { this._admin = null; this._champTok = (this._champTok || 0) + 1; if (this._champ) this._champ.close(); hideChampionEntry(); this._duck(false); hideNameOverlay(); const m = musicOf(this.engine); m.stopJingle(0.3); m.stopAll(0.6); this._bgmOn = false; }   // タイトルへ戻る/シーン終了で音楽をフェード

  // 名前入力中は BACK を無効化（誤タップで入力が消えるのを防ぐ）
  // ---- 初回の計器ヒント（'hudTipSeen' が無い端末で、プレイ開始時に1度だけ）。表示中は物理を凍結（state 'tip'）----
  // ---- HOW TO PLAY: ラン開始のたびに表示（new run / CONTINUE / MAP。ステージ間は出さない）。カードの「次回から表示しない」('howtoSkip') で止める。物理は凍結 ----
  _maybeShowHowto() {
    if (this.state !== 'play') return false;
    if (htSkipGet(this.engine.storage)) return false;
    this._openHowto(true);
    return true;
  }
  // first=true: ラン開始前の自動表示（閉じたら計器ヒントへ）。false: MISSION HOLD から（閉じたら HOLD に戻る）
  _openHowto(first) {
    this._thrustMain = false; this._thrustRcsL = false; this._thrustRcsR = false;
    if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
    this._ht = new HtCard({ storage: this.engine.storage, onTap: () => this._uiTap(), onClose: () => {
      this._ht = null;
      this._holdGrace = HOLD_GRACE_S;
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      if (first) this._maybeShowTip();
    } });
  }
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
  blocksBack() { return !!this._ht || championEntryOpen(this._champ) || this.state === 'module' || this.state === 'bonusselect' || this.state === 'hold'; }

  // ---- モジュール効果（レベルから都度計算。取得直後に反映される）----
  _lvl(id) { return (this.modules && this.modules[id]) || 0; }
  _fuelMax() { return FUEL_MAX * fuelMulFor(this._lvl('fuel')) * (this._wp ? WP_FUEL_MUL : 1); }   // 中継地点つきステージは燃料 +35%
  _angDamp() { return angDampFor(this._lvl('stab')); }
  _safeVy() { return SAFE_VY + SAFE_VY_PER_LEVEL * this._lvl('shock'); }
  _bounceVy() { return BOUNCE_VY + BOUNCE_VY_PER_LEVEL * this._lvl('shock'); }
  _hasRadar() { return this._lvl('radar') > 0 || !!this._powerRadar; }   // RADAR モジュール、または特典の輪の RADAR（そのステージ中）

  // ---- SHIELD ゲージ（時間で満タン→発動で泡）----
  _shieldFull() { return (this._gauge || 0) >= SH_FULL_S; }
  _shieldBtnShown() { return this._live() && !this._ht && this._shieldFull() && !(this._shT > 0); }
  _tryShield() {
    if (!this._live() || this._ht || !this._shieldFull() || this._shT > 0) return false;
    this._gauge = 0; this._shT = SH_DUR_S; this._shBannerT = SH_BANNER_S; this._shHitT = 0;
    try { const m = musicOf(this.engine); if (!isMuted(this.engine) && m.sfx && m.sfx.shield) m.sfx.shield(); } catch (_) { /* 音の失敗はゲームに影響させない */ }
    return true;
  }

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
    this._shT = 0; this._shBannerT = 0; this._shHitT = 0;   // SHIELD ゲージの泡はステージをまたがない（ゲージ本体 _gauge はラン内で持ち越す）
    this._shieldReady = this._shieldCharges > 0;
    this._shieldFlash = 0;
    // 天体の最初のステージ、またはランの開始ステージ（天体の途中から始めた場合も）で天体紹介を出す
    this._introT   = ((sp.info.firstOfBody || this._introNext) && !btype) ? INTRO_S : 0;
    this._introNext = false;
    this._goalT = GOAL_S;
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
    this._crashDetail   = null;   // { text } 失敗理由の下に出す「実測値 / 上限」。無い理由は null
    this.landingSeq     = null;
    this._auto          = false;
    this._perfect       = false;
    this._bannerT       = btype ? 2.8 : 0;   // ボーナス開始バナーの残り秒
    this.particles      = [];
    this._spots         = landableSpots(this.terrainPts, this.pad);   // パッド以外の着陸可能な平地（目印とヒント用）
    // 冥王星の2つめ（HOP）: パッドから最も遠い平地に中継地点 1 を置く。着地するまでパッドは LOCKED。誘導線と輪は中継地点へ（着いたら誘導線はパッドへ）
    this._wp = null; this._wpBonus = 0; this._wpBannerT = 0; this._wpGradeNow = ''; this._slide = null; this._slideDist = 0;
    if (!mission && this._body.iceSlide && !sp.info.firstOfBody && this._spots.length) {
      const pcx = this.pad.x + this.pad.w / 2; let best = null, bd = -1;
      for (const sp2 of this._spots) { const cx = (sp2.x0 + sp2.x1) / 2, d = Math.abs(cx - pcx); if (d > bd) { bd = d; best = sp2; } }
      const w = Math.min(WP_W, best.x1 - best.x0 - 4), cx = (best.x0 + best.x1) / 2;
      this._wp = { x: cx, y: this._terrainYAt(cx), w, done: false, t: 0 };
      this.fuel = this._fuelMax();
      this.guidePts = buildGuide(this.x, this.y, { x: cx - w / 2, y: this._wp.y, w }, GUIDE_PTS);
    }
    this._contact0      = null;    // 最初の接触時の速度・姿勢（グレード用。バウンスしても最初の衝撃で評価する）
    this._groundedT = 0; this._strandT = 0;
    this._touchHintT    = 0;
    this._shakeT        = 0;
    this._grade = ''; this._lastGrade = ''; this._breakdown = null; this._clearT = null; this._clearSnd = 0;

    // バウンス状態フラグ（マージナル着地後に弾んでいる最中）と累積時間 (B1')
    this._bouncing = false;
    this._bounceTime = 0;

    // ON COURSEポップインジケーター用タイマー
    this._onCourseTime = 0;   // ON COURSE状態の累積時間(秒)
    this._onCoursePulse = 0;  // 点滅アニメーション用位相(秒)

    // Floating obstacles (stage 2+)。ボーナスミッションは障害物なし（穏やかな特別ステージ。難度は重力・パッド・風・抗力で作る）
    this.obstacles = mission ? [] : buildObstacles(sp.obstacleCount, sp.obstacleSpeed, this._body.obstacleStyle);

    // L2: 降下ルート（誘導線）に沿った輪。通常ステージのみ（ボーナスは輪なし）。特典（SLOW-MO/SIDE THRUST/RADAR）の状態もここで初期化
    this._floats = []; this._slowT = 0; this._sideT = 0; this._lblA = []; this._threats = []; this._powerRadar = false; this._pbT = 0; this._pbKind = ''; this._starsInfo = null; this._patchInfo = null; this._starT = 0; this._starSnd = 0;
    this._rg = mission ? null : newRingState(buildRings({ stage: this.stage, startX: this.x, startY: this.y, pad: this._wp ? { x: this._wp.x - this._wp.w / 2, y: this._wp.y, w: this._wp.w } : this.pad, terrainPts: this.terrainPts, obstacles: this.obstacles, radarOwned: this._lvl('radar') > 0 }));

    // 到達記録（パイロット別）。通常ステージの開始のみ、デバッグランは除外
    if (!this.bonus && !this._isDebugRun()) {
      const pr = getActiveProfile(this.engine.storage);
      if (pr && pr.name) recordStageReached(this.engine.storage, pr.name, this.stage);
    }

    this._keys = this._keys || { left: false, right: false, up: false };
    this._saveCheckpoint();
  }

  // ステージ開始ごとに保存（ボーナス中は「ボーナスの次のステージ」を保存＝再開がボーナスの途中にならない）。デバッグ中/デバッグ操作ランは保存しない
  _saveCheckpoint() {
    if (this._isDebugRun()) return;
    const prof = getActiveProfile(this.engine.storage);
    saveCheckpoint(this.engine.storage, {
      runId: this.runId, startStage: this.startStage, stage: this.bonus ? this.stage + 1 : this.stage, totalScore: this.totalScore,
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
    if (championEntryOpen(this._champ)) return;   // 称号入力中は全入力を消費（タイトルへ戻らない・下の画面に貫通しない）
    if (this._ht) { this._ht.input(action, data); return; }   // HOW TO PLAY 表示中は全入力を消費
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
    if (action === 'tap' && data && this._live() && this._inRect(this._holdRect(), data)) { this._enterHold(); return; }
    // SHIELD ゲージ: ↓ / S（スワイプの下はキー扱いにしない）、SHIELD ボタンのタップ、マウスのクリック（操作ボタン帯以外）で発動
    if (this._live()) {
      if (action === 'down' && !(data && data.swipe)) { this._tryShield(); return; }
      if (action === 'tap' && data && !(data.t0 < this._overlayAt)) {
        if (this._shieldBtnShown() && this._inRect(SH_HIT, data)) { this._tryShield(); return; }
        if (data.mouse && data.y < SH_CTL_Y && !(isDebug() && this._inRect(this._dbgBtnRect(), data))) { this._tryShield(); return; }
      }
    }
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
      if (confirm && this._inputLock <= 0) { if (this._clearT != null && this._clearT < this._clearEnd()) this._skipClear(); else if (this._patchBusy()) this._starT = 99; else this._nextAfterClear(); }   // 集計中・パッチ演出中のタップは最後まで進めるだけ
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
  _live() { return this.state === 'play' || this.state === 'grounded'; }   // 機体が操縦できる状態（接地中も含む）
  _enterHold() {
    if (!this._live()) return;
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
  onHidden() { if (this._live() && !this._ht) this._enterHold(); }
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
      : [{ id: 'resume', label: 'RESUME', kind: 'main', x, y: 320, w, h: 48 }, { id: 'abort', label: 'ABORT MISSION', kind: 'danger', x, y: 384, w, h: 48 }, { id: 'howto', label: 'HOW TO PLAY', kind: 'sub', x, y: 448, w, h: 44 }];
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
      else if (b.id === 'howto') { this._uiTap(); this._openHowto(false); }
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
        del: { x: W - 36 - 56, y: 128 + i * 72, w: 56, h: 40 }, pin: { x: W - 36 - 56 - 8 - 76, y: 128 + i * 72, w: 76, h: 40 }, hasPin: n.hasPin === true });
    }
    const pages = Math.max(1, Math.ceil(a.names.length / ADMIN_PER_PAGE));
    return { rows, pages,
      prev: a.page > 0 ? { x: 30, y: 496, w: 80, h: 36, label: 'PREV' } : null,
      next: a.page < pages - 1 ? { x: W - 110, y: 496, w: 80, h: 36, label: 'NEXT' } : null,
      close: { x: W / 2 - 40, y: 496, w: 80, h: 36, label: 'CLOSE' } };
  }
  _adminConfirmRects() { const pin = this._admin && this._admin.confirmKind === 'pin'; return { yes: { x: 60, y: 300, w: W - 120, h: 44, label: pin ? 'CONFIRM RESET' : 'CONFIRM DELETE' }, no: { x: 60, y: 360, w: W - 120, h: 44, label: 'CANCEL' } }; }
  _adminInput(action, data) {
    const a = this._admin;
    if (action === 'back') { if (a.confirm) a.confirm = null; else { this._admin = null; this._adminTok++; } return; }
    if (action !== 'tap' || !data) return;
    if (a.confirm) {
      const c = this._adminConfirmRects();
      if (this._inRect(c.no, data)) a.confirm = null;
      else if (this._inRect(c.yes, data)) { if (a.confirmKind === 'pin') this._adminPinReset(a.confirm); else this._adminDelete(a.confirm); }
      return;
    }
    const R = this._adminRects();
    if (this._inRect(R.close, data)) { this._admin = null; this._adminTok++; return; }
    if (R.prev && this._inRect(R.prev, data)) { a.page--; return; }
    if (R.next && this._inRect(R.next, data)) { a.page++; return; }
    for (const r of R.rows) {
      if (this._inRect(r.del, data)) { a.confirm = r.name; a.confirmKind = 'delete'; return; }
      if (r.hasPin && this._inRect(r.pin, data)) { a.confirm = r.name; a.confirmKind = 'pin'; return; }
    }
  }
  async _adminDelete(name) {
    const a = this._admin; if (!a) return;
    a.confirm = null; a.msg = 'DELETING\u2026';
    let r; try { r = await adminDelete(_adminKeyMem, name); } catch (_) { r = { ok: false }; }
    if (this._admin !== a) return;
    if (r && r.ok) await this._adminLoad(); else { a.phase = 'list'; a.msg = this._adminErr(r); }
  }
  async _adminPinReset(name) {
    const a = this._admin; if (!a) return;
    a.confirm = null; a.msg = 'RESETTING PIN\u2026';
    let r; try { r = await adminResetPin(_adminKeyMem, name); } catch (_) { r = { ok: false }; }
    if (this._admin !== a) return;
    if (r && r.ok) { a.msg = 'PIN RESET: ' + String(name).slice(0, 14); await this._adminLoad(); if (this._admin === a && a.phase === 'list') a.msg = 'PIN RESET: ' + String(name).slice(0, 14); }
    else { a.phase = 'list'; a.msg = this._adminErr(r); }
  }
  _drawAdmin(ctx) {
    const a = this._admin, R = this._adminRects(), c = this._adminConfirmRects();
    drawAdminPanel(ctx, { phase: a.phase, msg: a.msg, rows: a.phase === 'error' ? [] : R.rows, prev: R.prev, next: R.next, close: R.close, page: a.page, pages: R.pages,
      confirm: a.confirm ? { text: (a.confirmKind === 'pin' ? 'RESET PIN OF ' : 'DELETE ') + String(a.confirm).slice(0, 14) + '?', yes: c.yes, no: c.no } : null });
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
        const entry = { name: nm, score: this.totalScore, stage: this.stage, startStage: this.startStage, date: new Date().toISOString(), runId: this.runId };
        const list = recordEntry(this.rankList, entry);
        saveRanking(this.engine.storage, list);
        this.rankList = list;
        this.newIdx = list.indexOf(entry);
      } else if (ex) this.newIdx = -1;
    }
    if (!dbgRun && relayEnabled() && this.totalScore > 0) {
      const score = this.totalScore, tok = this._champTok = (this._champTok || 0) + 1;
      try {
        Promise.resolve(WorldNet.submit({ name: nm, score, stage: this.stage, startStage: this.startStage, key: prof ? prof.key : undefined })).then((r) => {
          if (r && r.ok === false && r.error === 'updating') this._worldNote = 'WORLD: UPDATING';
          else if (r && r.ok === false && (r.status === 403 || r.status === 409)) this._worldNote = 'WORLD: NAME OWNED BY ANOTHER DEVICE';
          if (r && r.ok === true && prof && prof.key) return this._maybeChampion(nm, prof.key, score, tok);
        }, () => {}).catch(() => {});
      } catch (_) { /* 送信失敗はゲームに影響させない */ }
    }
  }

  // 送信成功後に WORLD を再取得。自分が #1 で、この記録のスコアなら称号入力（NEW WORLD RECORD）を出す。失敗・遅延しても何もしない
  async _maybeChampion(nm, key, score, tok) {
    let top = null;
    try { top = await WorldNet.fetchTop(); } catch (_) { top = null; }
    if (!Array.isArray(top)) return;
    const row = top1FromList(this.engine.storage, top);
    if (tok !== this._champTok || this.state !== 'gameover' || this._isDebugRun() || championEntryOpen(this._champ)) return;
    if (this.rankTabs && this.rankTabs.mode === 'world' && this.rankTabs.status === 'ok') { try { loadWorld(this.rankTabs); } catch (_) { /* ignore */ } }
    if (!row || row.name !== nm || row.score !== score) return;
    this._champ = openChampionEntry({ name: nm, key, initial: row.title || '', heading: 'NEW WORLD RECORD!', storage: this.engine.storage,
      onClose: () => {
        this._champ = null;
        if (this.state === 'gameover' && this.rankTabs && (this.rankTabs.mode === 'world') && this.rankTabs.status !== 'loading') { try { loadWorld(this.rankTabs); } catch (_) { /* ignore */ } }
      } });
  }

  // ---- Control inputs: 全タッチをゾーンごとに評価（同時押し可）----
  _readPointerControls() {
    const eng = this.engine;
    const pts = Array.isArray(eng.touches) ? eng.touches
      : (eng.pointer && eng.pointer.down ? [eng.pointer] : []);
    for (const pt of pts) {
      if (!(pt.y > CONTROL_Y_MIN)) continue;
      if (isDebug() && this._inRect(this._dbgBtnRect(), pt)) continue;
      if (this._shieldBtnShown() && this._inRect(SH_HIT, pt)) continue;   // SHIELD ボタンは噴射にしない
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
    if (this._ht) return;                 // HOW TO PLAY 表示中: 物理・タイマー凍結
    if (this.state === 'tip') {   // 初回ヒント: 物理・タイマー凍結。時間経過で自動的に閉じる
      if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt);
      this._tipT -= dt; if (this._tipT <= 0) this._endTip();
      return;
    }
    if (this.state === 'hold') { if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt); return; }   // MISSION HOLD: 全て凍結
    this._clock = (this._clock || 0) + dt;
    if (this._shakeT > 0) this._shakeT = Math.max(0, this._shakeT - dt);

    if (this._inputLock > 0) this._inputLock = Math.max(0, this._inputLock - dt);

    if (!this._live()) {
      this._updateParticles(dt);
      if (this.state === 'landing' && this.landingSeq) {
        this.landingSeq.t += dt;
        this.angle *= Math.pow(0.02, dt);   // 着地後、機体を起こして立たせる（宇宙飛行士の絵と整合）
        if (this.landingSeq.t >= LANDING_SEQ_S) this._finishLanding();
      } else if (this.state === 'cleared' && this.landingSeq) {
        this.landingSeq.t += dt;            // クリア画面中も祝福を続ける
        this.angle *= Math.pow(0.02, dt);
        this._tickClear(dt);
      }
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      return;
    }
    this._updateParticles(dt);   // 接地の砂塵など
    if (this._touchHintT > 0) this._touchHintT = Math.max(0, this._touchHintT - dt);

    if (this._bannerT > 0) this._bannerT = Math.max(0, this._bannerT - dt);
    if (this._introT > 0) this._introT = Math.max(0, this._introT - dt);
    if (this._goalT > 0) this._goalT = Math.max(0, this._goalT - dt);
    if (this._shieldFlash > 0) this._shieldFlash = Math.max(0, this._shieldFlash - dt);
    if (this._slowT > 0) this._slowT = Math.max(0, this._slowT - dt);
    if (this._sideT > 0) this._sideT = Math.max(0, this._sideT - dt);
    // SHIELD ゲージ: 操縦できる状態（play / grounded）の時間だけ貯まる。HOLD・HOW TO PLAY・ヒント・結果・選択画面は上で return 済み
    this._gauge = Math.min(SH_FULL_S, (this._gauge || 0) + dt);
    if (this._shT > 0) this._shT = Math.max(0, this._shT - dt);
    if (this._shBannerT > 0) this._shBannerT = Math.max(0, this._shBannerT - dt);
    if (this._shHitT > 0) this._shHitT = Math.max(0, this._shHitT - dt);
    if (this._wpBannerT > 0) this._wpBannerT = Math.max(0, this._wpBannerT - dt);
    if (this._wp) this._wp.t += dt;
    if (this._pbT > 0) this._pbT = Math.max(0, this._pbT - dt);
    const ringPx = this.x, ringPy = this.y;   // 輪の通過判定用に、このフレームの移動の始点

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

    if (this.state === 'grounded') {
      this._stepGrounded(dt);   // 接地中: 物理は止まる（燃料も減らない）。推力で離陸。障害物とパッドの移動は下で続く
    } else {
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
      const inv = i18nInverted() && !this._auto;       // 操作の向き INVERTED（自動操縦は物理の向きで出力するので反転しない）
      const sgn = inv ? -1 : 1;
      const sideOn = this._sideT > 0 && !this._auto;   // SIDE THRUST（自動操縦は従来の回転制御のまま）
      if (sideOn) {
        // 左右ボタン = 真横に移動（左ボタン→左、右ボタン→右）。回転入力は無効、機体は強く水平に保たれる。燃料は通常のRCSと同じ率
        // STANDARD: 左ボタン→右へ（反作用ドリフトと同じ向き）。INVERTED: 左ボタン→左へ
        const dir = ((this._thrustRcsR ? 1 : 0) - (this._thrustRcsL ? 1 : 0)) * (inv ? 1 : -1);
        if (dir !== 0 && this.fuel > 0) {
          this.vx   += dir * SIDE_ACCEL * dt;
          this.fuel  = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
        }
        this.omega = 0;                                   // 終了時にガクッと回らないよう角速度は常に 0
        this.angle *= Math.exp(-SIDE_LEVEL_K * dt);       // 水平へ（指数減衰）
      } else {
        if (this._thrustRcsL && this.fuel > 0) {
          this.omega += sgn * ANG_ACCEL * dt;   // STANDARD CW: nose tilts RIGHT（INVERTED は逆）
          this.vx    += sgn * RCS_DRIFT * dt;   // 左ノズル排気反作用 -> 右ドリフト（INVERTED は逆）
          this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
        }
        if (this._thrustRcsR && this.fuel > 0) {
          this.omega -= sgn * ANG_ACCEL * dt;   // STANDARD CCW: nose tilts LEFT（INVERTED は逆）
          this.vx    -= sgn * RCS_DRIFT * dt;   // 右ノズル排気反作用 -> 左ドリフト（INVERTED は逆）
          this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
        }
      }

      // ---- Angular damping (mild drag so craft can be stabilized) ----
      if (!sideOn) this.omega *= Math.pow(this._angDamp(), dt);

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
    }

    // ---- Guide deviation tracking (upper half only) ----
    // 誘導線からの偏差を累積。スコアリングに使用。
    const guideDist = this._distToGuide(this.x, this.y);
    if (this.y < 420 && this.state === 'play') {
      this._guideDevTotal += guideDist;
      this._guideDevCount += 1;
    }

    // ---- L2: 輪の通過 ----
    if (this.state === 'play' && this._rg) this._stepRings(ringPx, ringPy);

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
        ob.x += ob.vx * dt * (this._slowT > 0 ? SLOWMO_FACTOR : 1);   // SLOW-MO: 隕石は半分の速さ
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
        if (Math.sqrt(dx * dx + dy * dy) < (this._shT > 0 ? SH_BUBBLE_R : craftR) + ob.r) {
          if (this._shT > 0) {              // SHIELD ゲージの泡: 隕石を弾く（墜落なし・モジュールの回数も減らさない）
            const R = SH_BUBBLE_R + ob.r, dy2 = Math.min(Math.abs(dy), R - 1);
            const side = dx === 0 ? (ob.vx >= 0 ? -1 : 1) : (dx > 0 ? 1 : -1);   // 機体が隕石の右(+1)か左(-1)か
            ob.x = this.x - side * Math.sqrt(R * R - dy2 * dy2);
            ob.vx = -side * Math.max(Math.abs(ob.vx), 40);
            this._shHitT = 0.25;
            continue;
          }
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

    // ---- 見やすさ: LANDABLE ラベルのフェード / 隕石の衝突コース警告（描画用の状態。物理には影響しない）----
    this._updateReadability(dt);

    // ---- Terrain collision ----
    if (this.state === 'play') this._checkCollision();
    if (this.state === 'play') this._maybeTouchHint();

    // ---- B1': バウンス状態が長引いたら決着（低速・傾きの小刻みホップで永遠に終わらないのを防ぐ）----
    if (this.state === 'play' && this._bouncing) {
      const gap = this._terrainYAt(this.x) - (this.y + 16);
      if (gap > BOUNCE_AIRBORNE_PX) {            // 明確に離陸した -> バウンス状態を解除
        this._bouncing = false;
        this._bounceTime = 0;
        this._contact0 = null;
      } else {
        this._bounceTime += dt;
        if (this._bounceTime > BOUNCE_RESOLVE_S) this._resolveBounce();
      }
    }
  }

  _updateReadability(dt) {
    const sp = this._spots, n = sp ? sp.length : 0;
    const A = this._lblA || (this._lblA = []);
    const cur = this.state === 'play' ? landableLabelIndex(sp, this.x, this.y) : -1;
    for (let i = 0; i < n; i++) {
      const tgt = i === cur ? 1 : 0, a = A[i] || 0;
      A[i] = tgt > a ? Math.min(1, a + dt * LABEL_FADE) : Math.max(0, a - dt * LABEL_FADE);
    }
    this._threats = (this._live() && !this._auto && this.obstacles && this.obstacles.length)
      ? obstacleThreats({ x: this.x, y: this.y, vx: this.vx, vy: this.state === 'grounded' ? 0 : this.vy }, this.obstacles, this.state === 'grounded' ? 0 : this._gravity, W, this._slowT, SLOWMO_FACTOR)
      : [];
  }

  // ---- L2: 輪 ----
  _stepRings(px, py) {
    const r = ringStep(this._rg, px, py, this.x, this.y);
    for (const h of r.hits) {
      this._ringBurst(h.x, h.y, h.combo, false);
      this._floats.push({ x: h.x, y: h.y, text: '+50 \u00d7' + h.combo, age: 0, life: 1.1, big: h.combo >= 4 });
      this._sfx('ring', h.combo);
    }
    if (r.power) this._collectPower(r.power);
  }
  _ringBurst(x, y, combo, gold) {
    const parts = this.particles || (this.particles = []);
    const col = gold ? '#FFB547' : '#63D8C9';
    const n = gold ? 18 : 10 + Math.min(8, combo * 2);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.3, sp = 22 + Math.random() * 30;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, life: 0.45 + Math.random() * 0.35, max: 0.8, col, r: 1.4 + Math.random() * 1.2 });
    }
    if (parts.length > 160) parts.splice(0, parts.length - 160);
  }
  // 特典の輪を取った: 種類ごとの効果（自動操縦は出さない。短時間・1ステージ1個まで）
  _collectPower(p) {
    const kind = p.kind, def = POWER_DEFS[kind]; if (!def) return;
    if (kind === 'slowmo') this._slowT = SLOWMO_S;
    else if (kind === 'side') this._sideT = SIDE_S;
    else if (kind === 'radar') this._powerRadar = true;
    else if (kind === 'fuel') this.fuel = Math.min(this._fuelMax(), this.fuel + POWER_FUEL_FRAC * this._fuelMax());
    this._pbT = POWER_BANNER_S; this._pbKind = kind;
    this._ringBurst(p.x, p.y, 1, true);
    this._floats.push({ x: p.x, y: p.y, text: def.name, age: 0, life: 1.4, big: true });
    this._sfx('power');
  }
  // HUD 用: 有効な特典（時間制限つきは残り秒）
  _activePower() {
    if (this._slowT > 0) return { kind: 'slowmo', name: POWER_DEFS.slowmo.name, remain: this._slowT };
    if (this._sideT > 0) return { kind: 'side', name: POWER_DEFS.side.name, remain: this._sideT };
    if (this._powerRadar) return { kind: 'radar', name: POWER_DEFS.radar.name, remain: null };
    return null;
  }

  _resolveBounce() {
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const onPad = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    this._bouncing = false;
    this._bounceTime = 0;
    if (!onPad) {   // パッド外: 平地なら接地（得点なし）、急斜面や大きな傾きは失敗
      const sl0 = footSlopeDeg(this.terrainPts, this.x);
      if (sl0 > LAND_SLOPE_DEG) { this._doCrash('STEEP GROUND', this._detailText(sl0, LAND_SLOPE_DEG, '°')); return; }
      if (absAngle <= BOUNCE_RESOLVE_DEG) this._touchdown(false, absAngle, Math.abs(this.omega));
      else this._doCrash('TIPPED OVER', this._detailText(absAngle, BOUNCE_RESOLVE_DEG, '°'));
      return;
    }
    if (absAngle <= BOUNCE_RESOLVE_DEG) this._touchdown(true, absAngle, Math.abs(this.omega));
    else this._doCrash('TIPPED OVER', this._detailText(absAngle, BOUNCE_RESOLVE_DEG, '°'));
  }

  // ---- Collision & landing check ----
  // 着地判定の優先順位（L1: パッド外でも平地なら接地できる）:
  //   0. パッド外: 傾き>BOUNCE_ANGLE -> TIPPED OVER / 速度・角速度>BOUNCE_* -> HARD IMPACT / 接地面の傾斜>LAND_SLOPE_DEG -> STEEP GROUND（即クラッシュ）
  //   1. SAFE_* 以内 -> 成功（パッド上=得点つきクリア / パッド外の平地=state 'grounded'・得点なし）
  //   2. BOUNCE_* 以内 (マージナル) -> バウンス。次フレームで再判定。バウンス後に vy <= BOUNCE_SETTLE_VY になれば成功として処理。
  //   3. パッド上 + BOUNCE_*超え (高速/大傾き) -> 即クラッシュ
  _checkCollision() {
    const terrainY = this._terrainYAt(this.x);
    const footY    = this.y + 16;

    if (footY < terrainY) return;

    const onPad    = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    const absVy    = Math.abs(this.vy);
    const absVx    = Math.abs(this.vx);
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const absOmega = Math.abs(this.omega);
    if (!this._bouncing && !this._contact0) this._contact0 = { vy: absVy, vx: absVx, ang: absAngle, om: absOmega };

    if (!onPad) {
      if (absAngle > BOUNCE_ANGLE) { this._bouncing = false; this._doCrash('TIPPED OVER', this._detailText(absAngle, BOUNCE_ANGLE, '°')); return; }
      if (absVy > this._bounceVy() || absVx > BOUNCE_VX || absOmega > BOUNCE_OMEGA) { this._bouncing = false; this._doCrash('HARD IMPACT', this._worstDetail(absVy, absVx, absAngle, absOmega, true)); return; }
      const sl1 = footSlopeDeg(this.terrainPts, this.x);
      if (sl1 > LAND_SLOPE_DEG) { this._bouncing = false; this._doCrash('STEEP GROUND', this._detailText(sl1, LAND_SLOPE_DEG, '°')); return; }
    }
    const succeed = (a, o) => this._touchdown(onPad, a, o);

    // バウンス中の「静定チェック」: 前フレームのバウンスで速度が十分落ちていれば成功
    if (this._bouncing) {
      // vy が低ければ着地成功として扱う
      if (absVy <= BOUNCE_SETTLE_VY && absVx <= SAFE_VX && absAngle <= SAFE_ANGLE) {
        this._bouncing = false;
        succeed(absAngle, absOmega);
        return;
      }
      // バウンス後もまだ速すぎる/傾きすぎ -> クラッシュ
      if (absVy > this._bounceVy() || absVx > BOUNCE_VX || absAngle > BOUNCE_ANGLE) {
        this._bouncing = false;
        this._doCrash(this._crashReasonFor(absVy, absVx, absAngle, absOmega), this._crashDetailFor(absVy, absVx, absAngle, absOmega));
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
      succeed(absAngle, absOmega);
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

    // ---- BOUNCE_* 超え -> 即クラッシュ（パッド上のみここに来る）----
    this._bouncing = false;
    this._doCrash(this._crashReasonFor(absVy, absVx, absAngle, absOmega), this._crashDetailFor(absVy, absVx, absAngle, absOmega));
  }

  _crashReasonFor(absVy, absVx, absAngle, absOmega) {
    if (absAngle > BOUNCE_ANGLE) return 'TIPPED OVER';
    if (absVy > this._bounceVy()) return 'TOO FAST';
    if (absVx > BOUNCE_VX) return 'TOO MUCH SIDEWAYS SPEED';
    if (absOmega > BOUNCE_OMEGA) return 'SPINNING TOO FAST';
    return 'HARD LANDING';
  }

  // 失敗理由の下の小さな行: '52 / 45 px/s'（整数。実測値 / 使った上限）
  _detailText(v, lim, unit) { return { text: Math.round(v) + ' / ' + Math.round(lim) + ' ' + unit.trim() }; }
  _metrics(vy, vx, ang, om) {
    return [
      { v: vy, lim: this._bounceVy(), unit: 'px/s' },
      { v: vx, lim: BOUNCE_VX, unit: 'px/s' },
      { v: ang, lim: BOUNCE_ANGLE, unit: '°' },
      { v: om, lim: BOUNCE_OMEGA, unit: '°/s' },
    ];
  }
  // 上限比が最大の指標。onlyOver なら上限超過のものだけ（HARD IMPACT）。HARD LANDING は全指標から
  _worstDetail(vy, vx, ang, om, onlyOver) {
    let best = null;
    for (const m of this._metrics(vy, vx, ang, om)) {
      if (onlyOver && !(m.v > m.lim)) continue;
      if (!best || m.v / m.lim > best.v / best.lim) best = m;
    }
    return best ? this._detailText(best.v, best.lim, best.unit) : null;
  }
  _crashDetailFor(vy, vx, ang, om) {
    const reason = this._crashReasonFor(vy, vx, ang, om);
    if (reason === 'TIPPED OVER') return this._detailText(ang, BOUNCE_ANGLE, '°');
    if (reason === 'TOO FAST') return this._detailText(vy, this._bounceVy(), 'px/s');
    if (reason === 'TOO MUCH SIDEWAYS SPEED') return this._detailText(vx, BOUNCE_VX, 'px/s');
    if (reason === 'SPINNING TOO FAST') return this._detailText(om, BOUNCE_OMEGA, '°/s');
    return this._worstDetail(vy, vx, ang, om, false);
  }

  // 接地が成立した（速度・姿勢が許容内）。通常は即決着（パッド=成功 / 平地=接地）。氷の天体（冥王星）は水平速度を残して滑り、止まった所で決着する
  _touchdown(onPad, a, o) {
    if (this._body && this._body.iceSlide && !this.bonus) this._startSlide(a, o);
    else if (onPad && !this._padLocked()) this._doSuccess(a, o);
    else this._doGrounded();
  }
  // 中継地点つきステージ（冥王星の2つめ）: 中継地点に着くまでパッドは LOCKED
  _padLocked() { return !!(this._wp && !this._wp.done); }
  _onWaypoint() { const w = this._wp; return !!w && this.x >= w.x - w.w / 2 && this.x <= w.x + w.w / 2; }
  _wpDone() {
    const w = this._wp; if (!w || w.done) return;
    w.done = true; w.t = 0; this._wpBannerT = 2.2;
    this._wpBonus = 100 + 50 * Math.max(0, gradeRank(this._wpGradeNow || 'C'));
    this._sfx('ring', 5);
    this.guidePts = buildGuide(this.x, this.y, this.pad, GUIDE_PTS);
  }

  // ---- 冥王星: ICE SLIDE ----
  // 接地した機体は水平速度を保ったまま水平を保って滑り、ICE_FRICTION で減速する。止まったとき: パッド上=成功 / 平地=接地 / 滑走中に斜面・縁=クラッシュ。推力で離陸できる
  _startSlide(a, o) {
    this.y = this._terrainYAt(this.x) - 16;
    this.vy = 0; this.omega = 0;
    this._bouncing = false; this._bounceTime = 0;
    this._groundedT = 0; this._strandT = 0;
    this._slide = { x0: this.x, ang: a || 0, om: o || 0, sprayT: 0 };
    this.state = 'grounded';
    this._touchdownFx(1);
  }
  _slideStep(dt) {
    const sl = this._slide;
    this.vy = 0; this.omega = 0;
    this.angle *= Math.pow(0.02, dt);
    const sp0 = Math.abs(this.vx);
    const sgn = this.vx < 0 ? -1 : 1;
    const sp = Math.max(0, sp0 - ICE_FRICTION * dt);
    this.vx = sgn * sp;
    this.x += sgn * (sp0 + sp) * 0.5 * dt;   // 台形則。解析解 v0^2/(2*mu) と一致する
    let wall = false;
    if (this.x < SLIDE_MARGIN) { this.x = SLIDE_MARGIN; wall = true; }
    if (this.x > W - SLIDE_MARGIN) { this.x = W - SLIDE_MARGIN; wall = true; }
    this.y = this._terrainYAt(this.x) - 16;
    const slope = footSlopeDeg(this.terrainPts, this.x);
    if (slope > LAND_SLOPE_DEG) { this._slide = null; this._contact0 = null; this._doCrash('SLID OFF THE EDGE', { text: 'SLIDING AT ' + Math.round(sp0) + ' px/s' }); return; }
    if (sp > 1 && this.particles) {   // 氷の飛沫（進行方向と逆へ小さく）
      sl.sprayT += dt;
      while (sl.sprayT >= 0.05) {
        sl.sprayT -= 0.05;
        const ty = this._terrainYAt(this.x);
        this.particles.push({ x: this.x - sgn * (8 + Math.random() * 8), y: ty - 1, vx: -sgn * (4 + Math.random() * 10) + (Math.random() - 0.5) * 6, vy: -(2 + Math.random() * 7),
          life: 0.35 + Math.random() * 0.35, max: 0.7, col: '#e8f1ff', r: 0.9 + Math.random() * 1.1 });
      }
      if (this.particles.length > 120) this.particles.splice(0, this.particles.length - 120);
    }
    if (sp < SLIDE_EPS || wall) { this.vx = 0; this._resolveSlide(); }
  }
  _resolveSlide() {
    const sl = this._slide; if (!sl) return;
    const onPad = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);
    const c0 = this._contact0 || { vy: 0, vx: 0, ang: sl.ang, om: sl.om };
    this._slide = null; this.vx = 0; this.vy = 0; this.omega = 0;
    if (this._wp && !this._wp.done && this._onWaypoint()) {   // 中継地点に着いた（SAFE 内の接地）
      this._wpGradeNow = gradeFor({ vy: c0.vy, vx: c0.vx, ang: c0.ang, om: c0.om, dist: Math.min(9, Math.abs(this.x - this._wp.x) / (this._wp.w / 2)) });
      this._wpDone();
    }
    if (onPad && !this._padLocked()) {
      this._slideDist = Math.abs(this.x - sl.x0);
      this.vx = c0.vx; this.vy = c0.vy;   // 着地精度ボーナスは最初の接触の速さで数える（グレードと同じ）
      this._doSuccess(c0.ang, c0.om);
    } else {
      this._contact0 = null; this._groundedT = 0; this._strandT = 0;   // 平らな氷の上で停止（ロック中のパッド含む）= 接地（得点なし）
    }
  }

  // ---- L1: 接地（パッド外の平地）。得点なし。推力で離陸できる ----
  _doGrounded() {
    const terrainY = this._terrainYAt(this.x);
    this.y = terrainY - 16;
    this.vx = 0; this.vy = 0; this.omega = 0;
    this._bouncing = false; this._bounceTime = 0; this._contact0 = null;
    this._groundedT = 0; this._strandT = 0; this._slide = null;
    this.state = 'grounded';
    this._touchdownFx(0.6);
  }
  // 接地中の1フレーム: 機体を起こし、推力で離陸、燃料切れのまま1.5秒で失敗
  _stepGrounded(dt) {
    const sliding = !!this._slide;
    if (!sliding) {
      this.vx = 0; this.vy = 0; this.omega = 0;
      this.angle *= Math.pow(0.02, dt);
      this.y = this._terrainYAt(this.x) - 16;
    }
    this._groundedT += dt;
    this._thrustRcsL = false; this._thrustRcsR = false;   // 接地中は姿勢制御しない（燃料も使わない）
    if (this.fuel > 0) {
      this._strandT = 0;
      if (this._thrustMain && this._groundedT >= LIFTOFF_MIN_S) {
        this.state = 'play';
        this.vy = LIFTOFF_VY; this.y -= 2;   // 少し持ち上げて即再接触しないように（滑走中なら水平速度は保つ）
        this._slide = null;
        this._contact0 = null; this._bouncing = false; this._bounceTime = 0;
        return;
      }
    } else if (!sliding) {
      this._thrustMain = false;
      this._strandT += dt;
      if (this._strandT >= STRANDED_S) this._doCrash('STRANDED — OUT OF FUEL');
    } else this._thrustMain = false;   // 滑走中の燃料切れ: 止まるまで待つ
    if (this._slide) this._slideStep(dt);
  }
  // 接地の演出: 脚元の砂塵（天体色）、小さな画面揺れ、鈍い音。strength 1=パッド着陸 / 0.6=パッド外
  _touchdownFx(strength) {
    const body = this._body;
    const ground = (body && body.visual && body.visual.ground) || '#8a8a8a';
    const col = mixHex(ground, '#ffffff', 0.3);
    const ty = this._terrainYAt(this.x);
    const parts = this.particles || (this.particles = []);
    for (let side = -1; side <= 1; side += 2) {
      for (let i = 0; i < 7; i++) {
        parts.push({ x: this.x + side * (9 + Math.random() * 8), y: ty - 1, vx: side * (8 + Math.random() * 26) * strength,
          vy: -(3 + Math.random() * 11) * strength, life: 0.45 + Math.random() * 0.5, max: 1.0, col, r: 1.3 + Math.random() * 1.5 });
      }
    }
    if (parts.length > 120) parts.splice(0, parts.length - 120);
    this._shakeT = SHAKE_S; this._shakeAmp = SHAKE_PX * strength;
    this._sfx('thud', strength);
  }
  _sfx(name, a) {
    try { if (isMuted(this.engine)) return; const m = musicOf(this.engine); if (m && m.sfx && typeof m.sfx[name] === 'function') m.sfx[name](a); } catch (_) { /* 音の失敗はゲームに影響させない */ }
  }

  // パッド以外の着陸可能な平地の目印への距離がTOUCH_HINT_DIST以内になったら、初回だけ非停止のトーストを出す
  _maybeTouchHint() {
    if (this._touchHintDone === undefined) {
      let seen = null; try { seen = this.engine.storage.get('touchHintSeen', null); } catch (_) { /* ignore */ }
      this._touchHintDone = !!seen;
    }
    if (this._touchHintDone || !this._spots || !this._spots.length || this._introT > 0) return;
    const fy = this.y + 16;
    for (const sp of this._spots) {
      const dx = Math.max(sp.x0, Math.min(sp.x1, this.x)) - this.x, dy = sp.y - fy;
      if (dx * dx + dy * dy <= TOUCH_HINT_DIST * TOUCH_HINT_DIST) {
        this._touchHintDone = true; this._touchHintT = TOUCH_HINT_S;
        try { this.engine.storage.set('touchHintSeen', '1'); } catch (_) { /* ignore */ }
        return;
      }
    }
  }
  // 機体下の地面マーカーの判定: null(高度が高い/パッド上/操縦中でない) か { kind: 'ok'|'caution'|'bad', alt, x, y, slope }
  _groundIndicator() {
    if (this.state !== 'play') return null;
    const ty = this._terrainYAt(this.x), alt = ty - (this.y + 16);
    if (!(alt < SHADOW_ALT)) return null;
    if (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w) return null;   // パッドは従来どおり専用の誘導灯とビーコンが目標
    const slope = footSlopeDeg(this.terrainPts, this.x);
    let kind = 'ok';
    if (slope > LAND_SLOPE_DEG) kind = 'bad';
    else {
      const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
      if (Math.max(0, this.vy) > this._safeVy() || Math.abs(this.vx) > SAFE_VX || absAngle > SAFE_ANGLE || Math.abs(this.omega) > SAFE_OMEGA) kind = 'caution';
    }
    return { kind, alt, x: this.x, y: ty, slope };
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
      const fb = Math.round(this.fuel * 10);
      this._breakdown = [['MISSION BASE', 600], ['FUEL BONUS', fb], ['MULTIPLIER \u00d7' + missionOf(this.bonus.type).mult.toFixed(1), sc - 600 - fb]];
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
      const ringScore = this._rg ? this._rg.score : 0;   // L2: 輪の得点（50×コンボ）は着陸した時に加算（墜落して Continue しても稼げない）
      const wpScore = this._wp && this._wp.done ? this._wpBonus : 0;   // 中継地点ボーナス: 100 + 50×(着地グレードの順位) = 100〜300
      this._stageScore  = fuelBonus + softBonus + horzBonus + uprBonus + omgBonus + guideBonus + sp.stageBonus + ringScore + wpScore;
      this._breakdown = [['FUEL BONUS', fuelBonus], ['LANDING', softBonus + horzBonus + uprBonus + omgBonus], ['GUIDE BONUS', guideBonus], ['STAGE BONUS', sp.stageBonus]];
      if (ringScore > 0) this._breakdown.push(['RINGS', ringScore]);
      if (wpScore > 0) this._breakdown.push(['WAYPOINT', wpScore]);
    }
    this.totalScore  += this._stageScore;
    // グレード: 最初の接触の速度・姿勢（バウンスしても最初の衝撃で評価）とパッド中心からの距離。PERFECT は祝福に星のバーストが付く
    const c0 = this._contact0 || { vy: landVy, vx: landVx, ang: absAngle || 0, om: absOmega || 0 };
    this._contact0 = null;
    const halfW = Math.max(1, this.pad.w / 2);
    const dist = Math.min(9, Math.abs(this.x - (this.pad.x + halfW)) / halfW);
    this._grade = gradeFor({ vy: c0.vy, vx: c0.vx, ang: c0.ang, om: c0.om, dist });
    if (this._slideDist > SLIDE_CAP_DIST && gradeRank(this._grade) > gradeRank('A')) this._grade = 'A';   // 冥王星: 大きく滑ったら A まで
    this._slideDist = 0;
    this._lastGrade = this._grade;
    this._perfect = this._grade === 'PERFECT';
    this._clearT = 0; this._clearSnd = 0;
    this._recordStageBest(this._grade);
    this._touchdownFx(1);

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

  // 通常ステージの最良グレードと★（stars.js）をパイロット別に保存（'stageBest'）。デバッグ操作のランとボーナスは対象外（★も出さない）
  _recordStageBest(grade) {
    this._starsInfo = null; this._patchInfo = null; this._starT = 0; this._starSnd = 0;
    if (this.bonus || this._isDebugRun()) return;
    const mask = STAR_LANDED | (allRingsGot(this._rg) ? STAR_RINGS : 0) | (grade === 'PERFECT' ? STAR_PERFECT : 0);
    const pr = getActiveProfile(this.engine.storage);
    const before = (pr && pr.name) ? patchesSummary(this.engine.storage, pr.name) : null;   // 記録の前に確かめる（新しいパッチか）
    const rec = recordStage(this.engine.storage, pr && pr.name, this.stage, grade, mask);
    this._starsInfo = { mask: rec.stars, fresh: rec.fresh, run: mask };
    const bd = this._info.body;
    if (before && patchIsNew(before, bd.id, grade)) {
      const nf = [1, 2, 4].filter((b) => rec.fresh & b).length;
      this._patchInfo = { id: bd.id, name: bd.name, t0: (nf ? STAR_POP_DELAY + STAR_POP_STEP * (nf - 1) + STAR_POP_S : 0) + PATCH_GAP };
    }
  }
  _patchBusy() { return !!(this._patchInfo && this._starT < this._patchInfo.t0 + PATCH_AWARD_S); }

  // ---- クリア画面の集計（行が順に数え上がり、最後にグレードのスタンプ）----
  _clearEnd() { return ((this._breakdown ? this._breakdown.length : 0) + 1) * CLEAR_SLOT_S + 0.05 + CLEAR_STAMP_S; }
  _tickClear(dt) {
    if (this._clearT == null) return;
    const n = this._breakdown ? this._breakdown.length : 0, end = this._clearEnd();
    if (this._clearT >= end) {   // 集計が終わったら、新しく取った★が順に押される
      if (this._starsInfo && (this._starsInfo.fresh || this._patchInfo)) {
        const prevS = this._starT; this._starT += dt;
        let j = 0;
        for (let i = 0; i < 3; i++) if (this._starsInfo.fresh & (1 << i)) {
          const t0 = STAR_POP_DELAY + STAR_POP_STEP * j; j++;
          if (prevS <= t0 && this._starT > t0) this._sfx('ring', 3 + j);
        }
        if (this._patchInfo) {   // パッチが枠に収まる瞬間（飛来が終わるとき）にチャイム
          const tc = this._patchInfo.t0 + PATCH_CHIME_S;
          if (prevS <= tc && this._starT > tc) this._sfx('patch');
        }
      }
      return;
    }
    const prev = this._clearT, cur = Math.min(end, prev + dt);
    this._clearT = cur;
    for (let i = 0; i <= n; i++) {   // 各行の開始と合計の開始で「カチ」
      const t0 = i * CLEAR_SLOT_S;
      if (prev <= t0 && cur > t0) this._sfx('tick', i);
    }
    const ts = (n + 1) * CLEAR_SLOT_S + 0.05;
    if (prev <= ts && cur > ts) this._sfx('thud', 0.8);
  }
  _skipClear() { if (this._clearT != null) { this._clearT = this._clearEnd(); this._starT = 99; } }
  _clearView() {
    const n = this._breakdown ? this._breakdown.length : 0;
    const t = this._clearT == null ? Infinity : this._clearT;
    const c01 = (v) => Math.max(0, Math.min(1, v));
    const prog = []; for (let i = 0; i < n; i++) prog.push(c01((t - i * CLEAR_SLOT_S) / CLEAR_SLOT_S));
    const ts = (n + 1) * CLEAR_SLOT_S + 0.05;
    let stars = null;
    if (this._starsInfo) {
      const k = [0, 0, 0]; let j = 0;
      for (let i = 0; i < 3; i++) if (this._starsInfo.fresh & (1 << i)) { k[i] = c01((this._starT - STAR_POP_DELAY - STAR_POP_STEP * j) / STAR_POP_S); j++; }
      stars = { mask: this._starsInfo.mask, fresh: this._starsInfo.fresh, k };
    }
    const patch = this._patchInfo ? { id: this._patchInfo.id, name: this._patchInfo.name, pt: this._starT - this._patchInfo.t0 } : null;
    return { patch, prog, tot: c01((t - n * CLEAR_SLOT_S) / CLEAR_SLOT_S), stamp: t >= ts ? Math.max(0.001, c01((t - ts) / CLEAR_STAMP_S)) : 0, stars };
  }

  // ---- クラッシュ処理 ----
  // ボーナス中: Continue を消費せず BONUS FAILED。通常: Continue が残っていれば 'crashed'、無ければ GAME OVER。
  _doCrash(reason, detail) {
    this._explode();
    // 失敗音はユーザー指定で旧来の素朴な低いビープ（120Hz・ノコギリ波）に戻す。ミュート時は engine.audio.enabled=false で無音
    this.engine.audio.bad();
    musicOf(this.engine).stopAll(0.4); this._bgmOn = false;   // クラッシュ: BGM無音（再開は _initStage で）
    this._crashReason = reason || 'CRASHED';
    this._crashDetail = detail || null;
    this._contact0 = null;
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
    if (this._floats && this._floats.length) { for (const f of this._floats) f.age += dt; this._floats = this._floats.filter((f) => f.age < f.life); }
    if (!this.particles) return;
    for (const pt of this.particles) {
      pt.x    += pt.vx * dt;
      pt.y    += pt.vy * dt;
      if (pt.col) { const d = Math.pow(0.25, dt); pt.vx *= d; pt.vy *= d; }   // 砂塵は空気抵抗のようにすぐ減速
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
    this._renderMain(ctx);
    if (this._ht) this._ht.render(ctx);
  }
  _renderMain(ctx) {
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
    if (this._shakeT > 0) {   // 接地の小さな画面揺れ（描画オフセットだけ。物理には影響しない）
      const k = this._shakeT / SHAKE_S, a = Math.min(SHAKE_PX, this._shakeAmp || 0) * k, ph = this._shakeT * 110;
      ctx.save(); ctx.translate(Math.sin(ph) * a, Math.cos(ph * 1.3) * a * 0.7);
      try { this._renderScene(ctx); } finally { ctx.restore(); }
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
      if (this._spots && this._spots.length && this.state !== 'module') { drawLandableSpots(ctx, this._spots, t); drawLandableLabels(ctx, this._spots, this._lblA); }   // 着陸可能な平地の目印（地形の手前）＋ 真上にいる間だけ LANDABLE
    }

    // 冥王星: 全体を薄暗く沈める（地形・パッドまで。誘導線・機体・HUD は明るいまま）。中継地点と LOCKED のパッド
    if (body && body.dim && !sel) { drawDimTint(ctx, body.dim); if (this._wp) drawWaypoint(ctx, this._wp, t); if (this._padLocked() && this.pad) drawPadLocked(ctx, this.pad, t); }

    // Descent trajectory guide（常に描画）— 地形・パッドより手前に描き、山に隠れずパッドまで繋がって見えるようにする
    if (!sel) this._drawGuide(ctx, false);

    // 機体下の地面マーカー（teal=着地可 / amber=平地だが速い・傾き / red=急斜面）
    { const gi = this._groundIndicator(); if (gi) drawGroundShadow(ctx, gi.x, gi.y, gi.kind, Math.min(1, (SHADOW_ALT - gi.alt) / 100) * 0.9, 9 + 9 * (1 - gi.alt / SHADOW_ALT)); }

    // Explosion / dust particles
    drawParticles(ctx, this.particles);

    // RADAR: 予測着地点と速度ベクトル
    if (this.state === 'play' && this._hasRadar()) this._drawRadar(ctx);

    // Lander craft
    if (this._live() || this.state === 'landing' || this.state === 'cleared') {
      this._drawLander(ctx, this.x, this.y, this.angle);
    }

    // SHIELD ゲージの泡（残り時間のリング）
    if (this._live() && this._shT > 0) drawShieldBubble(ctx, this.x, this.y, SH_BUBBLE_R, this._shT / SH_DUR_S, this._clock || 0, this._shHitT);

    // SHIELD: 準備完了のリング / 吸収時のフラッシュ
    if (this._live() && (this._shieldReady || this._shieldFlash > 0)) {
      drawShieldRing(ctx, this.x, this.y, this._shieldFlash, this._shieldReady, this._shieldCharges);
    }

    // Landing sequence (astronaut scene)。クリア画面中も祝福を続けるため、シーンは cleared でも描く（パネルは重ならない位置）
    if ((this.state === 'landing' || this.state === 'cleared') && this.landingSeq) this._drawLandingScene(ctx);

    // 大気の見た目: 火星の砂塵(視覚のみ) / タイタン・金星の視界制限
    if (this._live()) this._drawAtmosphere(ctx);
    if (!sel) this._drawGuide(ctx, true);   // 暗闇の天体(水星)は誘導線を暗闇の上に描く（フェアにする）
    if (body && body.id === 'mercury') drawHorizonGlare(ctx);
    if (!sel && this._rg && (this.state === 'play' || this.state === 'grounded')) this._drawRings(ctx);

    // 着陸パッドのビーコン（霧の上に常に描く）
    this._drawBeacon(ctx);

    // HUD
    this._drawHUD(ctx);

    // 天体の紹介バナー（天体の最初のステージ）
    if (this.state === 'play' && !this._tipOn && this._introT > 0 && body) {
      const parts = introText(body).split(' · ');
      if (body.tagline) drawIntro(ctx, parts[0], parts[1], parts.slice(2).join('  ·  '), this._introT * 2);
      else drawIntro(ctx, parts[0], parts.slice(1, 3).join('  ·  '), parts.slice(3).join('  ·  '), this._introT * 2);
    }

    // ステージ開始時の「やること」1文（案内のみ・非停止）
    if (this.state === 'play' && !this._tipOn && this._goalT > 0 && !this._ht) drawGoalLine(ctx, goalText(this._goalKey(), i18nLang()), Math.min(1, this._goalT / 0.4, (GOAL_S - this._goalT) / 0.4));

    // 接地中のバナー / 初回ヒント（非停止のトースト）
    if (this.state === 'grounded' && !this._tipOn && !(this._wpBannerT > 0)) {   // 中継地点のバナー中は重ねない
      if (this._slide) drawSlidingCue(ctx, Math.abs(this.vx));
      else drawGroundedBanner(ctx, !(this.fuel > 0), Math.min(1, (this._groundedT || 0) / 0.25));
    }
    if (this._wpBannerT > 0 && !this._tipOn) drawWaypointBanner(ctx, Math.min(1, this._wpBannerT / 0.4, (2.2 - this._wpBannerT) / 0.25));
    if (this._live() && !this._tipOn && this._touchHintT > 0) drawTouchHint(ctx, Math.min(1, this._touchHintT / 0.4, (TOUCH_HINT_S - this._touchHintT) / 0.3));

    // 特典の輪のバナー
    if (this.state === 'play' && !this._tipOn && this._pbT > 0 && this._pbKind && POWER_DEFS[this._pbKind]) drawPowerBanner(ctx, this._pbKind, POWER_DEFS[this._pbKind], Math.min(1, this._pbT / 0.4, (POWER_BANNER_S - this._pbT) / 0.25));

    // 緊急シールドのバナー
    if (this._live() && !this._tipOn && this._shBannerT > 0) drawShieldBanner(ctx, Math.min(1, this._shBannerT / 0.3, (SH_BANNER_S - this._shBannerT) / 0.2));

    // Bonus mission banner
    if (this.state === 'play' && this.bonus && this._bannerT > 0) drawBonusBanner(ctx, (this._mission || missionOf(this.bonus.type)).name, this._bannerT, (this._mission || missionOf(this.bonus.type)).stars);

    // Bottom button controls
    this._drawButtons(ctx);
    if (this._shieldBtnShown() && !this._tipOn) drawShieldButton(ctx, SH_BTN, this._clock || 0);

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

    if (championEntryOpen(this._champ)) veil(ctx, 0.5);

    // デバッグ: DBGボタン
    if (isDebug() && DBG_STATES.indexOf(this.state) >= 0) drawDebugTag(ctx, this._dbgBtnRect());

    if (this._live()) drawHoldButton(ctx, this._holdRect());
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

  _drawRings(ctx) {
    const t = this._clock || 0, rg = this._rg;
    let nextIdx = -1;
    for (const r of rg.rings) if (!r.got && !r.missed) { nextIdx = r.i; break; }
    for (const r of rg.rings) if (!r.got) drawRing(ctx, r.x, r.y, r.r, t, r.missed ? 'missed' : (r.i === nextIdx ? 'next' : 'idle'));
    if (rg.power && !rg.power.got) drawPowerRing(ctx, rg.power.x, rg.power.y, rg.power.r, t, rg.power.kind);
    if (this._floats) for (const f of this._floats) drawFloat(ctx, f);
  }

  _drawBeacon(ctx) {
    if (!this.pad || this.state === 'module' || this.state === 'bonusselect') return;
    if (this._wp && !this._wp.done) { drawBeacon(ctx, { x: this._wp.x - this._wp.w / 2, y: this._wp.y, w: this._wp.w }, this._clock || 0); return; }   // 中継地点が先
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
    drawObstacles(ctx, this.obstacles, this._clock || 0, this._body, { speedMul: this._slowT > 0 ? SLOWMO_FACTOR : 1, threats: this._threats });
  }

  // ---- Descent trajectory guide ----
  // 常に描画（OFF COURSE は薄く、ON COURSE は明るく脈動）。
  _drawGuide(ctx, late) {
    if (!!(this._body && this._body.guideAboveFog) !== !!late) return;   // 通常は地形の手前(霧の下)、guideAboveFog の天体は霧の上
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
  // このステージで最も関係の深い特徴 → GOAL_LINES のキー（優先順は bodies.js goalKey）
  _goalKey() {
    const b = this._body || {};
    return goalKey({ bonusType: this.bonus ? this.bonus.type : null, waypoint: !!this._wp, ice: !!b.iceSlide, visibility: b.visibility == null ? null : b.visibility,
      dark: !!b.guideAboveFog, moving: !!(this.pad && this.pad.moving), wind: !!this._windSpec, meteors: !!(this.obstacles && this.obstacles.length) });
  }

  _drawLander(ctx, x, y, angleDeg) {
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const fuelOk = this.fuel > 0;
    // INVERTED: 左ボタン=機首/機体が左へ＝排気は右ノズルから出る（SIDE THRUST も同様）。炎を左右入れ替えて描く
    const sw = i18nInverted() && !this._auto;
    drawShip(ctx, x, y, angleDeg, !!(this._thrustMain && fuelOk), !!((sw ? this._thrustRcsR : this._thrustRcsL) && fuelOk), !!((sw ? this._thrustRcsL : this._thrustRcsR) && fuelOk), this._clock || 0);
  }

  // ---- HUD（データを集めて art.drawHUD に渡す。x>=52 は BACK ボタンを避ける）----
  _drawHUD(ctx) {
    const h = this._hud || (this._hud = {});
    const b = this._body;
    h.stage = this.stage; h.bodyName = this.state === 'bonusselect' ? TERRA.name : (b ? b.name : ''); h.bonus = !!this.bonus;
    h.mission = (this.bonus && this._mission) ? this._mission.name : '';
    h.total = this.totalScore; h.high = this.high || 0;
    h.fuel = (this.fuel || 0) / this._fuelMax();
    h.shield = Math.min(1, (this._gauge || 0) / SH_FULL_S); h.shieldOn = this._shT > 0;
    h.continues = this.continues || 0;
    h.modDefs = MODULE_DEFS; h.mods = this.modules || {};
    h.debug = isDebug(); h.play = this._live();
    h.t = this._clock || 0;
    h.realG = b ? b.realG : null; h.atmoTag = b ? b.atmoTag : '';
    if (this._pilotFor !== this.runId) { this._pilotFor = this.runId; const pr = getActiveProfile(this.engine.storage); this._pilotName = (pr && pr.name) || ''; }
    h.pilot = this._pilotName || '';
    h.rings = (this._rg && !this.bonus) ? { got: this._rg.collected, total: this._rg.rings.length, score: this._rg.score } : null;
    h.power = this._activePower();
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
    drawControls(ctx, this._thrustRcsL, this._thrustMain, this._thrustRcsR, (this._sideT > 0 && !this._auto && this._live()) ? this._sideT : 0, this._clock || 0, i18nInverted() && !this._auto);
  }

  // ---- Stage Clear overlay ----
  // パネルは y 128..344 に固定（パッド面は y>=455 なので下端は111px以上上。宇宙飛行士・旗・機体に重ならない）
  _clearPanelRect() { return { x: 20, y: 128, w: W - 40, h: 216 + ((this._breakdown && this._breakdown.length > 4) ? 10 : 0) + (this._starsInfo ? 42 : 0) + (this._patchInfo ? PATCH_ROOM : 0) }; }

  _drawClearScreen(ctx) {
    const b = this.bonus;
    let next;
    if (b) next = 'TAP  ·  STAGE ' + (this.stage + 1);
    else if (this.stage % BONUS_EVERY === 0) next = 'TAP  ·  BONUS MISSION';
    else next = 'TAP  ·  STAGE ' + (this.stage + 1);
    const cols = b
      ? [['CONTINUE', this._bonusGrant ? '+1' : '\u2013', this._bonusGrant ? P().mid : P().dim], ['TOTAL', String(this.totalScore)], ['BEST', String(this.high || 0)]]
      : [['TOTAL', String(this.totalScore)], ['BEST', String(this.high || 0)]];
    const cv = this._clearView();
    const slot = drawClearPanel(ctx, this._clearPanelRect(), {
      patchRoom: this._patchInfo ? PATCH_ROOM : 0,
      bonus: !!b, perfect: !!this._perfect,
      sub: b ? missionOf(b.type).name + '  ·  \u00d7' + missionOf(b.type).mult : 'STAGE ' + this.stage + ' COMPLETE' + (this._perfect ? '  ·  PERFECT' : ''),
      score: (b ? this._bonusScore : this._stageScore) || 0, cols, next, t: this._clock || 0,
      lines: this._breakdown || [], prog: cv.prog, tot: cv.tot, stamp: cv.stamp, grade: this._grade || '', stars: cv.stars,
    });
    if (slot && cv.patch) drawPatchAward(ctx, slot, cv.patch.id, cv.patch.name, cv.patch.pt);
  }

  // ---- Crashed (continue available) ----
  _drawCrashed(ctx) {
    drawCrashPanel(ctx, { reason: this._crashReason || '', detail: this._crashDetail, score: this.totalScore, left: this.continues, giveUp: this._giveUpRect() });
  }

  // ---- ボーナスミッション選択 ----
  _drawBonusSelect(ctx) {
    const cards = this.bonusOffers.map((type, i) => { const m = missionOf(type); return { rect: this._bonusCardRect(i), stars: m.stars, name: m.name, line: m.line, mult: m.mult, extra: m.grantContinue ? '+1 CONTINUE ON SUCCESS' : '' }; });
    drawBonusCards(ctx, { sub: 'TERRA  \u00b7  g 9.81 m/s\u00b2', cards, skip: this._bonusSkipRect(), t: this._clock || 0 });
  }

  // ---- Bonus failed (no continue consumed) ----
  _drawBonusFailed(ctx) {
    drawBonusFailedPanel(ctx, { reason: this._crashReason || '', detail: this._crashDetail, next: this.stage + 1 });
  }

  // ---- Game Over: ranking（名前はプレイ前に入力済み）----
  _drawGameOver(ctx) {
    drawGameOverFrame(ctx, { score: this.totalScore, stage: this.stage, debugRun: this._isDebugRun(), newRecord: this.newIdx >= 0 });
    drawRankPanel(this.engine, ctx, this.rankTabs || createRankTabs(), this.rankList || [], 32, 146, W - 64, this.newIdx);
    if (this._worldNote) drawNote(ctx, this._worldNote);
    drawGameOverFooter(ctx);
  }
}
