// METEOR : ゆっくり迫る隕石をミサイルで迎撃するストラテジー防衛ゲーム。
// ステージ制：序盤は1個ずつ読んで破壊、徐々に密度が上がりステージ末にボス隕石登場。
// 全都市が破壊されたらゲームオーバー。
// 各都市が発射台。MULTI/POWER/WIDE/SCATTER/RAPIDアイテムで戦力強化。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'meteor',
  title: 'METEOR',
  desc: '降る隕石を迎撃して街を守れ',
  glyph: '*',
};

// ---- 定数 ----
const CITY_COUNT  = 5;
const CITY_W      = 28;
const CITY_H      = 22;  // 少し高くして山シルエットに
const GROUND_Y    = H - 40;

// ミサイル
const MISSILE_SPD    = 115;  // px/s
const FIRE_COOLDOWN  = 0.55; // 発射間隔（秒）

// 同時飛翔上限（通常）
const MISSILES_CAP_NORMAL = 4;
// RAPID中の同時飛翔上限 = min(launcherSlots * shotsPerCity, 10)
const MISSILES_CAP_RAPID  = 10;

// 爆発 — grow then FADE OUT (alpha, no shrink)
const BLAST_GROW      = 38;   // 通常爆発最大半径
const BLAST_GROW_BIG  = 115;  // ビッグ爆発最大半径
const BLAST_GROW_RATE = 50;   // 拡大速度 px/s
const BLAST_FADE_SEC  = 1.2;  // フェードアウト時間（秒）

// ビッグブラスト残弾
const BIG_CHARGES_MAX  = 3;
const BIG_RECHARGE_SEC = 14;

// 通常ブラストダメージ（パワーアップで増加）
const BLAST_DAMAGE_NORMAL_BASE = 1;
const BLAST_DAMAGE_BIG         = 3;

// ---- 隕石速度 ----
const METEOR_SPD_MIN      = 2;
const METEOR_SPD_MAX      = 5;
const METEOR_SPD_MAX_LATE = 7;

const FAST_CHANCE  = 0.10;
const FAST_SPD_MIN = 14;
const FAST_SPD_MAX = 24;

// 隕石サイズ
const METEOR_R_MIN   = 7;
const METEOR_R_MAX   = 34;
const GIANT_R_THRESH = 22;
const SMALL_R_THRESH = 10;
const LARGE_R_THRESH = 16;

// ボス隕石 — 1.2倍スケール（r≒150-185）、画面幅に収まりつつ迫力を保つ
const BOSS_R_MIN   = 150;  // 縮小（旧230→150）
const BOSS_R_MAX   = 185;  // 縮小（旧255→185）
const BOSS_SPD_MIN = 2.5;  // 速度を大幅増（旧0.7）→ ぐんぐん迫る
const BOSS_SPD_MAX = 3.8;  // 速度を大幅増（旧1.2）
const BOSS_HP_BASE = 16;   // HP削減（旧30→16）
const BOSS_HP_PER_STAGE = 3; // HP増加（旧6→3）

// スコア
const METEOR_SCORE_BASE = 10;
const BOSS_SCORE_BASE   = 250;

// スキャッター特殊弾 弾数上限
const SCATTER_AMMO_PER_PICKUP = 3;

// バフタイマー（秒）— POWER/WIDE/SPEEDバフは有限時間後に消える（FIFOスタック）
const BUFF_DURATION = 18;

// RAPIDバフ（時間制限）
const RAPID_DURATION    = 10; // 秒
const RAPID_SHOTS_CITY  = 2;  // 1都市あたりの同時発射数
const RAPID_COOLDOWN    = 0.28; // RAPIDバフ中の発射間隔短縮

// ---- ステージタイプ ----
const STAGE_TYPES = [
  'NORMAL',
  'FAST',
  'SWARM',
  'TINY',
  'GIANT',
  'CHAOS',
];

// ---- アイテム種別 ----
// 'MULTI'  : launcherSlots +1（最大5）— 持続効果
// 'POWER'  : 撃った都市の通常ダメージ+1 — 一時バフ（有限タイマー）
// 'WIDE'   : 撃った都市の爆発半径+12 — 一時バフ
// 'SCATTER': 3発のスキャッター特殊弾を付与（グローバル弾薬）
// 'RAPID'  : 時間限定 連射強化（1都市2発・上限10、RAPID_DURATIONs）
const ITEM_TYPES = ['MULTI', 'POWER', 'WIDE', 'SCATTER', 'RAPID'];

// ---- HP計算 ----
function calcMeteorHP(r) {
  if (r < SMALL_R_THRESH)  return 1;
  if (r < LARGE_R_THRESH)  return 2;
  if (r < GIANT_R_THRESH)  return 3;
  return 4;
}

// ---- ステージスクリプト生成 ----
function makeStageScript(stage, stageType) {
  const events = [];
  let baseDelay  = Math.max(3.5 - stage * 0.25, 1.1);
  let bossT      = 72 + stage * 4;
  let itemChance = Math.min(0.08 + stage * 0.025, 0.22);

  if (stageType === 'SWARM') { baseDelay *= 0.5; bossT = 55 + stage * 3; }
  if (stageType === 'FAST')  { bossT = 60 + stage * 3; }
  if (stageType === 'CHAOS') { baseDelay *= 0.65; bossT = 58 + stage * 3; }

  let t = 0;
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 2.0;
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 1.8;

  const midGiant = (stageType === 'GIANT');
  const midTiny  = (stageType === 'TINY');
  events.push({ t, type: 'meteor', count: 1, forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.5;

  let waveMax = 2;
  if (stageType === 'SWARM')       waveMax = 5;
  else if (stageType === 'CHAOS')  waveMax = 4;
  else                             waveMax = Math.min(1 + Math.floor(stage / 2), 3);

  events.push({ t, type: 'meteor', count: waveMax, forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.4;
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 1.3;
  events.push({ t, type: 'meteor', count: Math.min(1 + Math.floor(stage / 1.5), 4), forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.2;

  let numLate = Math.min(2 + stage, 6);
  if (stageType === 'SWARM') numLate = Math.min(numLate + 3, 9);
  if (stageType === 'CHAOS') numLate = Math.min(numLate + 2, 7);

  while (t < bossT - 10) {
    const cnt  = Math.min(1 + Math.floor(Math.random() * numLate), numLate);
    const giant = (stageType === 'GIANT') || (stageType === 'CHAOS' && Math.random() < 0.3) || Math.random() < 0.15;
    const tiny  = (stageType === 'TINY') || (Math.random() < 0.05);
    events.push({
      t, type: 'meteor', count: cnt,
      forceSize: giant ? 'giant' : (tiny ? 'tiny' : null),
      itemChance,
    });
    const minGap = stageType === 'SWARM' ? 0.5 : 0.9;
    t += Math.max(baseDelay * (0.85 - stage * 0.04), minGap);
  }

  events.push({ t: bossT, type: 'boss' });
  return events;
}

// ---- 岩石ポリゴン頂点 ----
function makeRockVerts(r, seed) {
  const count = 8 + Math.floor((seed % 4));
  const verts = [];
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2;
    const s1 = Math.sin(seed * 31.7 + i * 12.3);
    const s2 = Math.sin(seed * 17.1 + i * 7.9);
    const angleJitter = (s1 * 0.5) / count;
    const angle = baseAngle + angleJitter;
    const rFrac = 0.60 + 0.50 * ((s2 + 1) / 2);
    verts.push({ dx: Math.cos(angle) * r * rFrac, dy: Math.sin(angle) * r * rFrac });
  }
  return verts;
}

// ---- ユニークID ----
let _nextBlastId    = 1;
let _nextMeteorSeed = 1;

// ---- ヘルパー ----
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

function stageSpeedMult(stageType) {
  if (stageType === 'FAST')  return 2.8;
  if (stageType === 'SWARM') return 1.4;
  if (stageType === 'TINY')  return 2.2;
  if (stageType === 'CHAOS') return 2.0;
  return 1.0;
}

// ---- 都市X座標（均等配置）----
const CITY_SPACING = (W - CITY_W * CITY_COUNT) / (CITY_COUNT + 1);
const CITY_XS = Array.from({ length: CITY_COUNT }, (_, i) =>
  Math.floor(CITY_SPACING + i * (CITY_W + CITY_SPACING))
);

// ---- 都市のシルエットポリゴン生成（山と街並み）----
// 都市ごとに固定シードで生成、毎フレーム生成しないよう事前作成
function makeCityProfile(idx) {
  // 山のシルエット + 街並みの屋根ライン（W=CITY_W, H=CITY_H）
  // 返り値: [{x,y}] のポリゴン（都市ローカル座標、左下=0,CITY_H、右下=CITY_W,CITY_H）
  const seed = idx * 137 + 29;
  const pts  = [];

  // 地面の左端
  pts.push({ x: 0, y: CITY_H });

  // 左の山稜
  const mh1 = 10 + (seed % 5);       // 山の高さ
  pts.push({ x: 0, y: CITY_H - mh1 });
  pts.push({ x: 4 + (seed % 3), y: CITY_H - mh1 - 3 });

  // 中央ビルA（背の高い）
  const bw1 = 5; const bh1 = 14 + ((seed * 7) % 5);
  const bx1 = 5 + (seed % 3);
  pts.push({ x: bx1, y: CITY_H - mh1 });
  pts.push({ x: bx1, y: CITY_H - bh1 });
  pts.push({ x: bx1 + bw1, y: CITY_H - bh1 });

  // アンテナ塔（細い）
  const tx = bx1 + Math.floor(bw1 / 2);
  pts.push({ x: tx, y: CITY_H - bh1 - 4 });
  pts.push({ x: tx, y: CITY_H - bh1 });

  // 隣の小さいビルB
  const bx2 = bx1 + bw1 + 1;
  const bh2 = 8 + ((seed * 3) % 4);
  pts.push({ x: bx2, y: CITY_H - bh2 });
  pts.push({ x: bx2 + 4, y: CITY_H - bh2 });

  // 右寄りの山稜
  const mh2 = 7 + ((seed * 11) % 5);
  pts.push({ x: CITY_W - 5, y: CITY_H - mh2 });
  pts.push({ x: CITY_W - 2, y: CITY_H - mh2 - 5 });
  pts.push({ x: CITY_W, y: CITY_H - mh2 });

  // 地面右端
  pts.push({ x: CITY_W, y: CITY_H });

  return pts;
}

// 都市プロファイルを事前生成
const CITY_PROFILES = Array.from({ length: CITY_COUNT }, (_, i) => makeCityProfile(i));

// ---- バフスタック管理（FIFOタイマー）----
// city.buffs = { power: [{timer},...], wide: [{timer},...] }
function makeCityBuffs() {
  return { power: [], wide: [] };
}

function updateCityBuffs(buffs, dt) {
  for (const key of ['power', 'wide']) {
    for (let i = buffs[key].length - 1; i >= 0; i--) {
      buffs[key][i].timer -= dt;
      if (buffs[key][i].timer <= 0) buffs[key].splice(i, 1);
    }
  }
}

function cityBuffPower(buffs) {
  return BLAST_DAMAGE_NORMAL_BASE + buffs.power.length;
}

function cityBuffRadiusAdd(buffs) {
  return buffs.wide.length * 12;
}

// ---- ソリッド塗り爆発雲（レトロフラットスタイル）----
// グラデーション/グローなし。赤系ソリッドカラーの粗い手描き風円形ポリゴンで描く。
// 重なる爆発は XOR合成でブラックアウトし、日食/クレセント効果を演出する。
// オフスクリーンキャンバスに全爆発をXORで描いてから mainCtx に合成する。

// オフスクリーンキャンバス（遅延初期化、W×Hサイズ）
let _blastOffscreen = null;
let _blastOffCtx    = null;

function _getBlastOffscreen() {
  if (_blastOffscreen && _blastOffCtx) return _blastOffCtx;
  try {
    _blastOffscreen = document.createElement('canvas');
    _blastOffscreen.width  = W;
    _blastOffscreen.height = H;
    _blastOffCtx = _blastOffscreen.getContext('2d');
    if (!_blastOffCtx) { _blastOffscreen = null; _blastOffCtx = null; }
  } catch (_) {
    _blastOffscreen = null; _blastOffCtx = null;
  }
  return _blastOffCtx;
}

// 赤系フリッカーカラー（3色を frameCount でサイクル）
const _BLAST_COLORS = ['#ff2200', '#ff5500', '#cc0000'];

// 爆発雲の粗い手描き風円ポリゴン頂点列を生成する
// r: 半径, seed: 爆発ID（形状安定のため）, shimmerPhase: 0..2π（per-frame微変化）
function _makeBlastPoly(r, seed, shimmerPhase) {
  const VCOUNT = 30; // 頂点数（多めで丸く見える）
  const verts = [];
  for (let i = 0; i < VCOUNT; i++) {
    const angle = (i / VCOUNT) * Math.PI * 2;
    // 小さなジッター（0.85〜1.00r）で粒状・手描き感を出す
    // shimmerPhase でわずかに毎フレーム揺れる（エッジのちらつき）
    const s1 = Math.sin(seed * 13.7 + i * 9.1);
    const s2 = Math.sin(seed * 7.3  + i * 4.3 + shimmerPhase);
    const jitter = 0.875 + 0.075 * s1 + 0.05 * s2; // 0.85〜1.00
    const pr = Math.max(1, r * clamp(jitter, 0.85, 1.0));
    verts.push({ x: Math.cos(angle) * pr, y: Math.sin(angle) * pr });
  }
  return verts;
}

// 全爆発をオフスクリーンに XOR で描いてから mainCtx に source-over で合成
// 重なり部分はXORで透明（黒抜き）になり日食のような効果が出る
function drawAllBlastsSolidXOR(mainCtx, blasts, frameCount) {
  const offCtx = _getBlastOffscreen();
  if (!offCtx || !_blastOffscreen) {
    // フォールバック：オフスクリーンが使えない場合は source-over で塗る
    mainCtx.globalCompositeOperation = 'source-over';
    for (const b of blasts) {
      if (!b) continue;
      const alpha = b.growing ? 1.0 : clamp(b.fadeTimer / BLAST_FADE_SEC, 0, 1);
      const r = Math.max(1, b.r);
      mainCtx.save();
      mainCtx.globalAlpha = clamp(alpha, 0, 1);
      mainCtx.fillStyle = _BLAST_COLORS[frameCount % _BLAST_COLORS.length];
      mainCtx.beginPath();
      mainCtx.arc(b.x, b.y, r, 0, Math.PI * 2);
      mainCtx.fill();
      mainCtx.restore();
    }
    mainCtx.globalCompositeOperation = 'source-over';
    return;
  }

  // オフスクリーンをクリア（透明）
  offCtx.clearRect(0, 0, W, H);

  // XOR合成で全爆発を描く（重なり部分が透明になる）
  offCtx.globalCompositeOperation = 'xor';

  for (const b of blasts) {
    if (!b) continue;
    const alpha = b.growing ? 1.0 : clamp(b.fadeTimer / BLAST_FADE_SEC, 0, 1);
    if (alpha <= 0) continue;

    const r = Math.max(1, b.r);
    // フレームとIDで色をフリッカー
    const colorIdx = (frameCount + b.id) % _BLAST_COLORS.length;
    const shimmerPhase = (frameCount * 0.22) + b.id * 1.3;

    const verts = _makeBlastPoly(r, b.id, shimmerPhase);
    if (!verts || verts.length < 3) continue;

    offCtx.save();
    offCtx.globalAlpha = clamp(alpha, 0, 1);
    offCtx.fillStyle   = _BLAST_COLORS[colorIdx];
    offCtx.translate(b.x, b.y);
    offCtx.beginPath();
    offCtx.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
      offCtx.lineTo(verts[i].x, verts[i].y);
    }
    offCtx.closePath();
    offCtx.fill();
    offCtx.restore();
  }

  // オフスクリーンを mainCtx に source-over で合成
  mainCtx.globalCompositeOperation = 'source-over';
  try {
    mainCtx.drawImage(_blastOffscreen, 0, 0);
  } catch (_) {}
  // 必ず source-over に戻す
  mainCtx.globalCompositeOperation = 'source-over';
}

export class Game extends Scene {
  enter() {
    this.score = 0;
    this.high  = this.engine.storage.getHigh(meta.id);
    this.dead  = false;

    this._elapsed    = 0;
    this._frameCount = 0; // フリッカー・アニメーション用フレームカウンタ

    // ステージ
    this._stage         = 0;
    this._stageType     = 'NORMAL';
    this._stageScript   = makeStageScript(this._stage, this._stageType);
    this._scriptIdx     = 0;
    this._bossAlive     = false;
    this._bossIdx       = -1;

    // ステージクリア演出（非停止：フロート表示のみ）
    this._clearOverlay  = null; // { timer, stage, bonus } | null

    // 都市: alive flag + バフスタック
    this.cities = Array.from({ length: CITY_COUNT }, () => ({
      alive: true,
      buffs: makeCityBuffs(),
    }));

    this.meteors    = [];
    this.missiles   = [];
    this.blasts     = [];
    this.cityBlasts = [];
    this.debris     = [];  // ボス破壊デブリパーティクル

    this._fireCooldown = 0;

    this._bigCharges  = BIG_CHARGES_MAX;
    this._bigRecharge = 0;
    this._bigArmed    = false;

    // ランチャーシステム
    this._launcherSlots  = 2; // 同時発射上限（MULTIで増える、最大5）
    this._selectedCity   = -1; // 手動選択都市インデックス（-1=未選択）

    // スキャッター特殊弾（グローバル残弾数）
    this._scatterAmmo = 0;

    // RAPIDバフ（時間制限、グローバル）
    this._rapidTimer = 0; // >0 = アクティブ（秒カウントダウン）
  }

  _bigBtnRect() { return { x: W / 2 - 48, y: 44, w: 112, h: 28 }; }

  _calcNormalSpd() {
    const frac   = clamp(this._stage / 6, 0, 1);
    const spdMax = METEOR_SPD_MAX + (METEOR_SPD_MAX_LATE - METEOR_SPD_MAX) * frac;
    const base   = METEOR_SPD_MIN + Math.random() * (spdMax - METEOR_SPD_MIN);
    return base * stageSpeedMult(this._stageType);
  }

  _calcFastSpd() {
    const base = FAST_SPD_MIN + Math.random() * (FAST_SPD_MAX - FAST_SPD_MIN);
    return clamp(base * stageSpeedMult(this._stageType) * 0.7, 1, 99);
  }

  // ---- 都市フットプリント当たり判定 ----
  _cityHitTest(x, y) {
    for (let i = 0; i < CITY_COUNT; i++) {
      if (!this.cities[i].alive) continue;
      const cx = CITY_XS[i];
      const cy = GROUND_Y - CITY_H;
      if (x >= cx - 4 && x <= cx + CITY_W + 4 && y >= cy - 4 && y <= cy + CITY_H + 4) {
        return i;
      }
    }
    return -1;
  }

  // ---- 最寄りの生存都市を返す（targetXに対して最も近い発射台）----
  _nearestAliveCity(targetX) {
    let bestIdx  = -1;
    let bestDist = Infinity;
    for (let i = 0; i < CITY_COUNT; i++) {
      if (!this.cities[i].alive) continue;
      const cx = CITY_XS[i] + CITY_W / 2;
      const d  = Math.abs(cx - targetX);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    return bestIdx;
  }

  // ---- onInput ----
  onInput(action, data) {
    if (this.dead) {
      if (action === 'back') { this.engine.toMenu(); return; }
      if (action === 'tap' || action === 'confirm') { this.enter(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (action === 'tap' && data) {
      // BIGボタン
      const b = this._bigBtnRect();
      if (data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h) {
        this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
        this.engine.audio.select();
        return;
      }

      // 都市フットプリントのタップ → 選択
      const cityIdx = this._cityHitTest(data.x, data.y);
      if (cityIdx >= 0) {
        this._selectedCity = (this._selectedCity === cityIdx) ? -1 : cityIdx;
        this.engine.audio.select();
        return;
      }

      // 空へのタップ → 発射
      const big = this._bigArmed;
      this._fireMissile(data.x, data.y, big);
      if (big) this._bigArmed = false;
    }
    if (action === 'confirm') {
      this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
    }
  }

  // ---- 同時飛翔上限計算 ----
  _getMissileCap() {
    const isRapid = this._rapidTimer > 0;
    if (isRapid) {
      return Math.min(this._launcherSlots * RAPID_SHOTS_CITY, MISSILES_CAP_RAPID);
    }
    return Math.min(this._launcherSlots, MISSILES_CAP_NORMAL);
  }

  // ---- 発射（クールダウン＋上限チェック） ----
  _fireMissile(tx, ty, big) {
    if (ty >= GROUND_Y) return;
    if (this._fireCooldown > 0) return;
    const activeCount = this.missiles.filter(m => !m.done).length;
    const cap = this._getMissileCap();
    if (activeCount >= cap) return;

    // 発射元都市の決定 — 手動選択があればそれ、なければタップ先に最も近い都市
    let cityIdx = -1;
    if (this._selectedCity >= 0 && this.cities[this._selectedCity] && this.cities[this._selectedCity].alive) {
      cityIdx = this._selectedCity;
      // 手動選択は1発撃ったら解除（次は再選択 or 自動）
      this._selectedCity = -1;
    } else {
      cityIdx = this._nearestAliveCity(tx);
    }
    if (cityIdx < 0) return; // 全都市消滅時は撃てない

    if (big) {
      if (this._bigCharges <= 0) return;
      this._bigCharges--;
    }

    const launchX = CITY_XS[cityIdx] + CITY_W / 2;
    const launchY = GROUND_Y - CITY_H;

    const dx = tx - launchX;
    const dy = ty - launchY;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    // スキャッター弾かどうか
    const useScatter = !big && this._scatterAmmo > 0;
    if (useScatter) this._scatterAmmo = Math.max(0, this._scatterAmmo - 1);

    this.missiles.push({
      x: launchX, y: launchY,
      tx, ty,
      vx: (dx / dist) * MISSILE_SPD,
      vy: (dy / dist) * MISSILE_SPD,
      done: false,
      big: !!big,
      scatter: useScatter,
      cityIdx,   // 発射元都市（バフ参照用）
    });

    // RAPIDバフ中はクールダウン短縮
    this._fireCooldown = this._rapidTimer > 0 ? RAPID_COOLDOWN : FIRE_COOLDOWN;
    this.engine.audio.move();
  }

  // ---- update ----
  update(dt) {
    if (this.dead) return;

    if (this._fireCooldown > 0) {
      this._fireCooldown = Math.max(0, this._fireCooldown - dt);
    }

    // RAPIDタイマー更新
    if (this._rapidTimer > 0) {
      this._rapidTimer = Math.max(0, this._rapidTimer - dt);
    }

    // ステージクリアオーバーレイのタイマー（ゲームは止まらない）
    if (this._clearOverlay) {
      this._clearOverlay.timer -= dt;
      if (this._clearOverlay.timer <= 0) this._clearOverlay = null;
    }

    this._elapsed += dt;

    // ビッグブラスト補充
    if (this._bigCharges < BIG_CHARGES_MAX) {
      this._bigRecharge += dt;
      if (this._bigRecharge >= BIG_RECHARGE_SEC) {
        this._bigRecharge -= BIG_RECHARGE_SEC;
        this._bigCharges++;
      }
    } else {
      this._bigRecharge = 0;
    }

    // 都市バフ更新
    for (const city of this.cities) {
      if (city.alive) updateCityBuffs(city.buffs, dt);
    }

    // ---- スクリプト式スポーン ----
    if (!this._bossAlive) {
      while (
        this._scriptIdx < this._stageScript.length &&
        this._stageScript[this._scriptIdx].t <= this._elapsed
      ) {
        const ev = this._stageScript[this._scriptIdx];
        this._scriptIdx++;
        if (ev.type === 'boss') {
          this._spawnBoss();
        } else if (ev.type === 'meteor') {
          const cnt = ev.count || 1;
          for (let c = 0; c < cnt; c++) {
            this._spawnMeteor(ev.forceSize, ev.itemChance || 0);
          }
        }
      }
    }

    // ---- ステージクリア判定 ----
    // ボスが倒されて script が終了したら次ステージへ（非停止）
    if (
      !this._bossAlive &&
      this._scriptIdx >= this._stageScript.length &&
      this.meteors.length === 0 &&
      !this._clearOverlay
    ) {
      // 次ステージ開始
      const clearedStage = this._stage;
      const bonus = 100 + clearedStage * 50;
      this.score += bonus;

      this._stage++;
      this._elapsed = 0;
      if (this._stage === 0) {
        this._stageType = 'NORMAL';
      } else {
        const types = STAGE_TYPES.filter(t => t !== 'NORMAL');
        this._stageType = types[(this._stage - 1) % types.length];
      }
      this._stageScript = makeStageScript(this._stage, this._stageType);
      this._scriptIdx   = 0;
      this._bossAlive   = false;
      this._bossIdx     = -1;
      // ミサイル/爆発は引き継ぎ（シームレス）

      // クリアオーバーレイ表示（ゲームは止まらない）
      this._clearOverlay = { timer: 2.8, stage: clearedStage + 1, bonus };

      // クリア音
      this.engine.audio.sequence([
        { freq: 440, dur: 0.08, type: 'square', vol: 0.15 },
        { freq: 660, dur: 0.08, type: 'square', vol: 0.15 },
        { freq: 880, dur: 0.10, type: 'square', vol: 0.18 },
        { freq: 1320, dur: 0.16, type: 'square', vol: 0.18 },
      ]);
    }

    // 隕石移動
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (!m || m.x == null) { this.meteors.splice(i, 1); continue; }
      const dx   = m.tx - m.x;
      const dy   = m.ty - m.y;
      const dist = Math.hypot(dx, dy);

      if (dist < m.spd * dt + 1) {
        // 地面到達
        if (m.boss) {
          this._impactCity(m.tx, m.ty);
          this._impactCity(m.tx, m.ty);
          this._bossAlive = false;
          this._bossIdx   = -1;
        } else if (!m.isItem) {
          this._impactCity(m.tx, m.ty);
        }
        this.meteors.splice(i, 1);
        if (this._bossIdx === i) { this._bossAlive = false; this._bossIdx = -1; }
        else if (this._bossIdx > i) this._bossIdx--;
        continue;
      }
      const ratio = m.spd / dist;
      m.x += dx * ratio * dt;
      m.y += dy * ratio * dt;

      const trailMax = m.fast ? 8 : (m.boss ? 4 : 5);
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > trailMax) m.trail.shift();

      m.rot += (m.fast ? 0.8 : (m.boss ? 0.12 : 0.4)) * dt;

      // ボス入場フェーズ：上半分が画面に入り終わるまで
      // わずかに横揺れを加えて「舞い降りる」演出（ゆったり浮遊感）
      if (m.boss && m.y < m.r * 0.8) {
        const swayAmp   = 3.5;  // 最大振れ幅 px
        const swayFreq  = 1.1;  // Hz
        // _elapsed を使って時間を参照
        const swayX = swayAmp * Math.sin(this._elapsed * swayFreq * Math.PI * 2);
        m.x = clamp(m.x + swayX * dt, m.r * 0.5, W - m.r * 0.5);
      }
    }

    // ミサイル移動
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      if (!ms) { this.missiles.splice(i, 1); continue; }
      if (ms.done) { this.missiles.splice(i, 1); continue; }
      ms.x += ms.vx * dt;
      ms.y += ms.vy * dt;
      const ddx = ms.tx - ms.x;
      const ddy = ms.ty - ms.y;
      if (Math.hypot(ddx, ddy) < MISSILE_SPD * dt * 1.5 + 4) {
        this._spawnBlast(ms.tx, ms.ty, ms.big, false, ms.scatter, ms.cityIdx);
        ms.done = true;
      }
    }

    // 爆発更新 — grow then FADE
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (!b) { this.blasts.splice(i, 1); continue; }

      if (b.growing) {
        b.r += BLAST_GROW_RATE * dt;
        if (b.r >= b.maxR) {
          b.r        = b.maxR;
          b.growing  = false;
          b.fadeTimer = BLAST_FADE_SEC;
        }
      } else {
        b.fadeTimer -= dt;
        b.r = Math.min(b.maxR * 1.05, b.r + 4 * dt);
        if (b.fadeTimer <= 0) {
          this.blasts.splice(i, 1);
          continue;
        }
      }

      // 爆発ヒット判定
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (!m) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + m.r) continue;
        if (m.hitBlastIds.has(b.id)) continue;
        m.hitBlastIds.add(b.id);

        if (m.isItem) {
          this._collectItem(m, b.cityIdx);
          if (this._bossIdx > j) this._bossIdx--;
          this.meteors.splice(j, 1);
          continue;
        }

        m.hp -= b.damage;
        if (m.hp <= 0) {
          if (m.boss) {
            this.score += BOSS_SCORE_BASE * (this._stage + 1);
            this._bossAlive = false;
            this._bossIdx   = -1;
            // ボス破壊演出
            this._spawnBossShatter(m.x, m.y, m.r);
            // ボス破壊音（壮大な降下音）
            this.engine.audio.sequence([
              { freq: 880, dur: 0.09, type: 'sawtooth', vol: 0.20 },
              { freq: 660, dur: 0.09, type: 'sawtooth', vol: 0.20 },
              { freq: 440, dur: 0.12, type: 'sawtooth', vol: 0.22 },
              { freq: 280, dur: 0.14, type: 'sawtooth', vol: 0.24 },
              { freq: 160, dur: 0.20, type: 'sawtooth', vol: 0.26 },
              { freq: 80,  dur: 0.30, type: 'sawtooth', vol: 0.28 },
            ]);
            this.engine.audio.bad();
          } else {
            const sizeBonus = Math.ceil(m.maxHp);
            this.score += METEOR_SCORE_BASE * sizeBonus;
            this.engine.audio.good();
          }
          if (this._bossIdx > j) this._bossIdx--;
          this.meteors.splice(j, 1);
        }
      }
    }

    // 都市爆発エフェクト更新
    for (let i = this.cityBlasts.length - 1; i >= 0; i--) {
      const cb = this.cityBlasts[i];
      if (!cb) { this.cityBlasts.splice(i, 1); continue; }
      cb.t -= dt;
      cb.r += 60 * dt;
      if (cb.t <= 0) this.cityBlasts.splice(i, 1);
    }

    // デブリ更新
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      if (!d) { this.debris.splice(i, 1); continue; }
      d.x    += d.vx * dt;
      d.y    += d.vy * dt;
      d.vy   += 60 * dt;  // 重力
      d.rot  += d.rotSpd * dt;
      d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); }
    }

    // ゲームオーバー判定
    if (this.cities.every(c => !c.alive)) {
      this.dead = true;
      this.engine.audio.bad();
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // ---- ボス破壊シャッター（デブリ噴射）----
  _spawnBossShatter(cx, cy, r) {
    const debrisCount = 24;
    for (let i = 0; i < debrisCount; i++) {
      const angle = (i / debrisCount) * Math.PI * 2 + Math.random() * 0.4;
      const spd   = 60 + Math.random() * 160;
      const size  = 3 + Math.random() * (r * 0.15);
      const sides = 3 + Math.floor(Math.random() * 4); // 3〜6角形
      this.debris.push({
        x: cx + Math.cos(angle) * r * (0.1 + Math.random() * 0.6),
        y: cy + Math.sin(angle) * r * (0.1 + Math.random() * 0.6),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 30,
        rot: Math.random() * Math.PI * 2,
        rotSpd: (Math.random() - 0.5) * 8,
        size: Math.max(2, size),
        sides,
        life: 0.8 + Math.random() * 1.4,
        maxLife: 0.8 + Math.random() * 1.4,
        isBoss: true,
      });
    }
    // 追加の火花（小さな）
    for (let i = 0; i < 32; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd   = 80 + Math.random() * 220;
      const ml    = 0.4 + Math.random() * 0.8;
      this.debris.push({
        x: cx, y: cy,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 20,
        rot: 0, rotSpd: 0,
        size: 1.5 + Math.random() * 2.5,
        sides: 0, // 0 = 円パーティクル
        life: ml, maxLife: ml,
        isBoss: false,
      });
    }
  }

  // ---- 通常隕石スポーン ----
  _spawnMeteor(forceSize, itemChance) {
    const x = 18 + Math.random() * (W - 36);
    const alive = this.cities.map((c, i) => c.alive ? i : -1).filter(i => i >= 0);
    let tx;
    if (alive.length > 0 && Math.random() < 0.7) {
      const idx = alive[Math.floor(Math.random() * alive.length)];
      tx = CITY_XS[idx] + CITY_W / 2 + (Math.random() * 24 - 12);
    } else {
      tx = 18 + Math.random() * (W - 36);
    }
    const ty = GROUND_Y;

    const spawnItem = this._stage >= 1 && Math.random() < (itemChance || 0);

    let r;
    if (forceSize === 'tiny') {
      r = METEOR_R_MIN + Math.random() * (SMALL_R_THRESH - METEOR_R_MIN + 2);
    } else if (forceSize === 'giant') {
      r = GIANT_R_THRESH + Math.random() * (METEOR_R_MAX - GIANT_R_THRESH);
    } else if (Math.random() < 0.12) {
      r = GIANT_R_THRESH + Math.random() * (METEOR_R_MAX - GIANT_R_THRESH);
    } else {
      r = Math.max(METEOR_R_MIN,
        METEOR_R_MIN + Math.random() * Math.random() * (GIANT_R_THRESH - METEOR_R_MIN)
      );
    }

    if (spawnItem) r = 14 + Math.random() * 6;

    const isFast  = !spawnItem && Math.random() < FAST_CHANCE;
    const spd     = isFast ? this._calcFastSpd() : this._calcNormalSpd();
    const maxHp   = spawnItem ? 1 : calcMeteorHP(r);
    const seed    = _nextMeteorSeed++;
    const itemType = spawnItem ? ITEM_TYPES[Math.floor(Math.random() * ITEM_TYPES.length)] : null;

    this.meteors.push({
      x, y: -METEOR_R_MAX - 4,
      tx, ty, spd, r,
      hp: maxHp, maxHp,
      fast: isFast,
      boss: false,
      isItem: spawnItem,
      itemType,
      trail: [],
      rot: Math.random() * Math.PI * 2,
      verts: makeRockVerts(r, seed),
      seed,
      hitBlastIds: new Set(),
    });
  }

  // ---- ボス隕石スポーン ----
  _spawnBoss() {
    const r = BOSS_R_MIN + Math.random() * (BOSS_R_MAX - BOSS_R_MIN);
    // ボスは画面中央に配置 — 巨大なので左右にはみ出す（意図的）
    const x  = W / 2;
    const tx = W / 2 + (Math.random() - 0.5) * 40; // 少しランダムな着地点
    const ty = GROUND_Y;
    const spd   = BOSS_SPD_MIN + Math.random() * (BOSS_SPD_MAX - BOSS_SPD_MIN);
    const maxHp = BOSS_HP_BASE + this._stage * BOSS_HP_PER_STAGE;
    const seed  = _nextMeteorSeed++;

    // ボスは画面外上端からスタート（中心が画面上端より r だけ上）
    // → プレイヤーはボスが上からゆっくり舞い降りるのを目撃できる
    const bossEntry = {
      x, y: -r,  // 完全に画面外上端（ y=-r で円全体がオフスクリーン）
      tx, ty, spd, r,
      hp: maxHp, maxHp,
      fast: false,
      boss: true,
      isItem: false,
      itemType: null,
      trail: [],
      rot: Math.random() * Math.PI * 2,
      verts: makeRockVerts(r, seed),
      seed,
      hitBlastIds: new Set(),
    };
    this.meteors.push(bossEntry);
    this._bossIdx  = this.meteors.length - 1;
    this._bossAlive = true;

    // ボス登場音
    this.engine.audio.sequence([
      { freq: 200, dur: 0.14, type: 'sawtooth', vol: 0.18 },
      { freq: 160, dur: 0.18, type: 'sawtooth', vol: 0.18 },
      { freq: 120, dur: 0.22, type: 'sawtooth', vol: 0.18 },
    ]);
  }

  // ---- アイテム取得 ----
  // cityIdx: 撃ち落とした爆発の発射元都市
  _collectItem(m, cityIdx) {
    const type = m.itemType;

    if (type === 'MULTI') {
      // ランチャースロット増加（永続、最大5）
      this._launcherSlots = Math.min(this._launcherSlots + 1, 5);
    } else if (type === 'POWER') {
      // 発射元都市のパワーバフを1スタック追加
      const ci = cityIdx >= 0 && this.cities[cityIdx] ? cityIdx : this._nearestAliveCity(m.x);
      if (ci >= 0 && this.cities[ci] && this.cities[ci].alive) {
        this.cities[ci].buffs.power.push({ timer: BUFF_DURATION });
      }
    } else if (type === 'WIDE') {
      // 発射元都市のワイドバフを1スタック追加
      const ci = cityIdx >= 0 && this.cities[cityIdx] ? cityIdx : this._nearestAliveCity(m.x);
      if (ci >= 0 && this.cities[ci] && this.cities[ci].alive) {
        this.cities[ci].buffs.wide.push({ timer: BUFF_DURATION });
      }
    } else if (type === 'SCATTER') {
      // スキャッター特殊弾3発付与（グローバル弾薬）
      this._scatterAmmo += SCATTER_AMMO_PER_PICKUP;
    } else if (type === 'RAPID') {
      // RAPIDバフ：時間制限で連射強化
      this._rapidTimer = RAPID_DURATION;
    }

    // 取得音
    this.engine.audio.sequence([
      { freq: 880, dur: 0.06, type: 'square', vol: 0.16 },
      { freq: 1320, dur: 0.08, type: 'square', vol: 0.18 },
      { freq: 1760, dur: 0.10, type: 'square', vol: 0.20 },
    ]);
  }

  // ---- 爆発スポーン ----
  // cityIdx: 発射元都市インデックス（バフ参照、-1=不明）
  _spawnBlast(x, y, big, isScatter, isScatterShot, cityIdx) {
    // 発射元都市のバフを参照
    const city   = (cityIdx >= 0 && this.cities[cityIdx]) ? this.cities[cityIdx] : null;
    const buffs  = city ? city.buffs : makeCityBuffs();

    const baseR = big
      ? BLAST_GROW_BIG
      : (BLAST_GROW + cityBuffRadiusAdd(buffs));
    const maxR  = Math.max(6, baseR);
    const dmg   = big ? BLAST_DAMAGE_BIG : cityBuffPower(buffs);
    const id    = _nextBlastId++;

    this.blasts.push({
      x, y,
      r: 4,
      maxR,
      growing: true,
      fadeTimer: BLAST_FADE_SEC,
      big: !!big,
      id,
      damage: dmg,
      isScatter: !!isScatter,
      cityIdx: cityIdx >= 0 ? cityIdx : -1,
    });

    if (!isScatter) {
      this.engine.audio.pick();
      if (big) {
        this.engine.audio.sequence([
          { freq: 330, dur: 0.06, type: 'square', vol: 0.18 },
          { freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.16 },
        ]);
      }
      // スキャッター特殊弾：爆発周囲に6個の小爆発を散布
      if (!big && isScatterShot) {
        const count = 6;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const dist  = 28 + Math.random() * 18;
          const sx = x + Math.cos(angle) * dist;
          const sy = y + Math.sin(angle) * dist;
          if (sy > GROUND_Y - 4) continue;
          this._spawnBlast(sx, sy, false, true, false, cityIdx);
        }
      }
    }
  }

  // ---- 都市ダメージ ----
  _impactCity(ix, iy) {
    let bestDist = Infinity, bestIdx = -1;
    for (let i = 0; i < CITY_COUNT; i++) {
      if (!this.cities[i].alive) continue;
      const cx = CITY_XS[i] + CITY_W / 2;
      const d  = Math.abs(cx - ix);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDist < CITY_W * 2.5) {
      this.cities[bestIdx].alive = false;
      // 選択都市が破壊されたらリセット
      if (this._selectedCity === bestIdx) this._selectedCity = -1;
      this.engine.audio.bad();
      this.cityBlasts.push({
        x: CITY_XS[bestIdx] + CITY_W / 2,
        y: GROUND_Y - CITY_H / 2,
        r: 8, t: 0.7,
      });
    }
  }

  // ---- render ----
  render(ctx) {
    const p = P();

    // ---- HUD（x>=52 でBACKボタンを避ける） ----
    const stageLabel = 'ST' + (this._stage + 1);
    this.engine.text(stageLabel, 52, 8, 14, p.mid, 'left');

    if (this._stage >= 1 && this._stageType !== 'NORMAL') {
      this.engine.text(this._stageType, 52, 24, 11, p.warn, 'left');
    }

    this.engine.text('SCORE ' + this.score, W - 12, 8, 14, p.fg, 'right');
    this.engine.text('BEST  ' + this.high,  W - 12, 26, 11, p.dim, 'right');

    const aliveCount = this.cities.filter(c => c.alive).length;
    this.engine.text('CITY ' + aliveCount, 52, 38, 11, p.warn, 'left');

    // ボスHPバー（トップHUDストリップ内、ボスが画面内に入ったときのみ表示）
    this._drawBossHPHud(ctx, p);

    // ビッグブラスト HUD
    this._drawBigChargeHUD(ctx, p);

    // ---- 星空 ----
    this._drawStarfield(ctx, p);

    // ---- 地面 ----
    this.engine.rect(0, GROUND_Y, W, H - GROUND_Y, p.dark);
    this.engine.rect(0, GROUND_Y, W, 2, p.dim);

    // ---- 都市（山シルエット+街並み） ----
    for (let i = 0; i < CITY_COUNT; i++) {
      this._drawCity(ctx, p, i);
    }

    // ---- 都市爆発エフェクト ----
    for (const cb of this.cityBlasts) {
      if (!cb) continue;
      ctx.save();
      ctx.globalAlpha = clamp(cb.t / 0.7, 0, 1) * 0.9;
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, Math.max(1, cb.r), 0, Math.PI * 2);
      ctx.fillStyle = p.bad;
      ctx.fill();
      ctx.restore();
    }

    // ---- ミサイル ----
    for (const ms of this.missiles) {
      if (!ms || ms.done) continue;
      const launchX = CITY_XS[ms.cityIdx] + CITY_W / 2;
      const launchY = GROUND_Y - CITY_H;
      ctx.save();
      ctx.strokeStyle = ms.big ? p.warn : (ms.scatter ? p.hi : p.fg);
      ctx.lineWidth   = ms.big ? 2.5 : 1.5;
      ctx.setLineDash(ms.big ? [6, 3] : (ms.scatter ? [3, 2] : []));
      ctx.beginPath();
      ctx.moveTo(launchX, launchY);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, ms.big ? 4 : (ms.scatter ? 3 : 2.5), 0, Math.PI * 2);
      ctx.fillStyle = ms.big ? p.warn : (ms.scatter ? p.hi : p.fg);
      ctx.fill();
      ctx.restore();
    }

    // ---- 隕石（岩石ポリゴン） ----
    for (const m of this.meteors) {
      if (!m) continue;

      if (m.isItem) {
        this._drawItemMeteor(ctx, p, m);
        continue;
      }

      const damageFrac = m.maxHp > 1 ? clamp(1 - m.hp / m.maxHp, 0, 1) : 0;
      const bodyColor  = m.boss ? p.warn : (m.fast ? p.hi : p.bad);

      // 軌跡
      const trailColor = bodyColor;
      for (let t = 0; t < m.trail.length; t++) {
        const pt = m.trail[t];
        if (!pt) continue;
        const alpha = ((t + 1) / (m.trail.length + 1)) * (m.fast ? 0.55 : (m.boss ? 0.55 : 0.35));
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, m.r * 0.35), 0, Math.PI * 2);
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // 岩石ポリゴン本体
      if (m.verts && m.verts.length >= 3) {
        const lineW    = clamp(1.8 - damageFrac * 0.8, 0.5, 2.5);
        const bodyAlpha = clamp(1 - damageFrac * 0.4, 0.3, 1);

        ctx.save();
        ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot);

        if (m.boss) {
          ctx.beginPath();
          ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
          for (let vi = 1; vi < m.verts.length; vi++) {
            ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
          }
          ctx.closePath();
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = clamp(0.65 - damageFrac * 0.2, 0, 1);
          ctx.fill();
          ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        }

        ctx.beginPath();
        ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
        for (let vi = 1; vi < m.verts.length; vi++) {
          ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
        }
        ctx.closePath();
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = m.boss ? clamp(lineW * 2, 1, 4) : lineW;
        ctx.stroke();

        // ---- ボスのダメージクラック表示 ----
        if (m.boss && damageFrac > 0 && m.verts.length >= 6) {
          this._drawBossCracks(ctx, p, m, damageFrac);
        } else if (!m.boss && damageFrac > 0.3 && m.verts.length >= 6) {
          // 通常隕石の簡易クラック
          ctx.globalAlpha = clamp(damageFrac * 0.5, 0, 1);
          ctx.beginPath();
          const v0 = m.verts[0];
          const v2 = m.verts[2];
          const v4 = m.verts[4];
          ctx.moveTo(v0.dx * 0.5, v0.dy * 0.5);
          ctx.lineTo(v2.dx * 0.5, v2.dy * 0.5);
          ctx.lineTo(v4.dx * 0.5, v4.dy * 0.5);
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth = 0.7;
          ctx.stroke();
        }

        ctx.restore();

        // 通常隕石のHP ピップ
        if (!m.boss && m.maxHp >= 2) {
          const pipR   = 3;
          const pipGap = 8;
          const totalW = m.maxHp * pipR * 2 + (m.maxHp - 1) * (pipGap - pipR * 2);
          const startX = m.x - totalW / 2;
          const pipY   = m.y + m.r + 6;
          for (let k = 0; k < m.maxHp; k++) {
            const px    = startX + k * pipGap + pipR;
            const alive = k < m.hp;
            ctx.save();
            ctx.globalAlpha = alive ? 0.9 : 0.25;
            ctx.beginPath();
            ctx.arc(px, pipY, pipR, 0, Math.PI * 2);
            ctx.fillStyle = alive ? (m.fast ? p.hi : p.bad) : p.dim;
            ctx.fill();
            ctx.restore();
          }
        }
      }
    }

    // ---- デブリ（ボス破壊断片）----
    for (const d of this.debris) {
      if (!d) continue;
      const alpha = clamp(d.life / d.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(alpha * 0.95, 0, 1);
      if (d.sides === 0) {
        // 円パーティクル（火花）
        ctx.beginPath();
        ctx.arc(d.x, d.y, Math.max(1, d.size), 0, Math.PI * 2);
        ctx.fillStyle = d.isBoss ? p.warn : p.bad;
        ctx.fill();
      } else {
        // ポリゴン断片
        ctx.translate(d.x, d.y);
        ctx.rotate(d.rot);
        ctx.beginPath();
        for (let vi = 0; vi < d.sides; vi++) {
          const a = (vi / d.sides) * Math.PI * 2;
          const sr = d.size * (0.6 + 0.4 * Math.sin(vi * 2.3 + d.rot));
          if (vi === 0) ctx.moveTo(Math.cos(a) * sr, Math.sin(a) * sr);
          else          ctx.lineTo(Math.cos(a) * sr, Math.sin(a) * sr);
        }
        ctx.closePath();
        ctx.strokeStyle = p.warn;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = p.bad;
        ctx.globalAlpha = clamp(alpha * 0.3, 0, 1);
        ctx.fill();
      }
      ctx.restore();
    }

    // ---- 爆発（ソリッド赤雲：XOR重なり黒抜き）----
    // フレームカウンタをインクリメント（render は毎フレーム呼ばれる）
    this._frameCount = (this._frameCount + 1) | 0;

    if (this.blasts.length > 0) {
      // 成長中/フェード中の爆発のみ対象
      const activeBlasts = this.blasts.filter(b => b != null);

      if (activeBlasts.length > 0) {
        ctx.save();
        drawAllBlastsSolidXOR(ctx, activeBlasts, this._frameCount);
        ctx.restore();
      }
    }

    // ---- 左端アクティブアイテムパネル ----
    this._drawActiveItemsPanel(ctx, p);

    // ---- ステージクリアオーバーレイ（非停止：フロート表示のみ）----
    if (this._clearOverlay) {
      const frac  = clamp(this._clearOverlay.timer / 2.8, 0, 1);
      // フェードイン/アウト
      const alpha = frac < 0.2
        ? frac / 0.2
        : frac > 0.8 ? (1 - frac) / 0.2
        : 1;
      ctx.save();
      ctx.globalAlpha = clamp(alpha * 0.88, 0, 1);
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, H / 2 - 70, W, 140);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      this.engine.text('STAGE ' + this._clearOverlay.stage + ' CLEAR!', W / 2, H / 2 - 52, 26, p.warn, 'center');
      this.engine.text('BONUS +' + this._clearOverlay.bonus, W / 2, H / 2 - 16, 18, p.hi,   'center');
      this.engine.text('STAGE ' + (this._stage + 1) + ': ' + this._stageType, W / 2, H / 2 + 18, 14, p.mid, 'center');
      ctx.restore();
    }

    // ---- ゲームオーバーオーバーレイ ----
    if (this.dead) {
      this.engine.rect(0, H / 2 - 90, W, 200, p.dark);
      this.engine.stroke(0, H / 2 - 90, W, 200, p.bad, 2);
      this.engine.text('GAME OVER', W / 2, H / 2 - 78, 32, p.bad, 'center');
      this.engine.text('SCORE  ' + this.score, W / 2, H / 2 - 32, 20, p.fg, 'center');
      this.engine.text('BEST   ' + this.high,  W / 2, H / 2 - 4,  16, p.dim, 'center');
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 38, 16, p.mid, 'center');
      this.engine.text('BACK: MENU',   W / 2, H / 2 + 62, 13, p.dim, 'center');
    }

    // ---- クールダウンインジケータ（選択都市付近に表示）----
    if (this._fireCooldown > 0 && !this.dead) {
      const coolRef = this._rapidTimer > 0 ? RAPID_COOLDOWN : FIRE_COOLDOWN;
      const frac    = clamp(1 - this._fireCooldown / coolRef, 0, 1);
      const barW    = 28;
      // 選択都市がある場合はその上、なければ画面中央下
      let barX, barY;
      if (this._selectedCity >= 0 && this.cities[this._selectedCity] && this.cities[this._selectedCity].alive) {
        barX = CITY_XS[this._selectedCity] + (CITY_W - barW) / 2;
        barY = GROUND_Y - CITY_H - 10;
      } else {
        barX = W / 2 - barW / 2;
        barY = GROUND_Y - CITY_H - 10;
      }
      ctx.save();
      ctx.fillStyle = p.dark;
      ctx.fillRect(barX, barY, barW, 3);
      ctx.fillStyle = p.mid;
      ctx.fillRect(barX, barY, Math.max(0, barW * frac), 3);
      ctx.restore();
    }
  }

  // ---- ボスHPバー（トップHUDストリップ内） ----
  // ボスが画面内に入ったとき（boss.y + boss.r > 0）のみ表示
  _drawBossHPHud(ctx, p) {
    if (!this._bossAlive || this._bossIdx < 0) return;
    const boss = this.meteors[this._bossIdx];
    if (!boss) return;

    // ボスが画面内に入っていなければ表示しない（バグ修正）
    if (boss.y + boss.r <= 0) return;

    const hpFrac     = clamp(boss.hp / boss.maxHp, 0, 1);
    const damageFrac = 1 - hpFrac;

    // トップHUDストリップ内に細いバーを引く（y=52〜58 あたり）
    const barX = 52;
    const barY = 52;
    const barW = W - barX - 8;
    const barH = 5;

    ctx.save();
    // 背景
    ctx.fillStyle = p.dark;
    ctx.fillRect(barX, barY, barW, barH);
    // HP残量
    const fillColor = damageFrac > 0.6 ? p.bad : p.warn;
    ctx.fillStyle = fillColor;
    ctx.fillRect(barX, barY, Math.max(0, barW * hpFrac), barH);
    // 枠
    ctx.strokeStyle = p.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.restore();

    // "BOSS" ラベル + HP数値
    this.engine.text('BOSS', barX, barY - 14, 11, p.warn, 'left');
    this.engine.text(boss.hp + '/' + boss.maxHp, barX + barW, barY - 14, 11, p.dim, 'right');
  }

  // ---- ボスクラック描画（ダメージ可視化） ----
  // ctx はボス中心に translate + rotate 済みの状態で呼ばれる
  _drawBossCracks(ctx, p, m, damageFrac) {
    if (!m.verts || m.verts.length < 6) return;
    const verts = m.verts;
    const n     = verts.length;
    const r     = m.r;

    ctx.save();
    ctx.strokeStyle = p.dim;

    // HP残量に応じてクラックの本数と長さが増える（閾値3段階）
    const phase1 = damageFrac > 0.25; // 25%ダメージ
    const phase2 = damageFrac > 0.50; // 50%ダメージ
    const phase3 = damageFrac > 0.75; // 75%ダメージ

    if (phase1) {
      // クラック1: 中心から頂点0と頂点2を結ぶ線
      ctx.globalAlpha = clamp(damageFrac * 0.65, 0, 1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(verts[0].dx * 0.1, verts[0].dy * 0.1);
      ctx.lineTo(verts[0].dx * 0.85, verts[0].dy * 0.85);
      ctx.moveTo(verts[Math.floor(n / 3)].dx * 0.15, verts[Math.floor(n / 3)].dy * 0.15);
      ctx.lineTo(verts[Math.floor(n / 3)].dx * 0.80, verts[Math.floor(n / 3)].dy * 0.80);
      ctx.strokeStyle = p.warn;
      ctx.stroke();
    }

    if (phase2) {
      // クラック2: 頂点同士を繋ぐ斜め線（ひびが広がる）
      ctx.globalAlpha = clamp((damageFrac - 0.5) * 2 * 0.7, 0, 1);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = p.bad;
      ctx.beginPath();
      const v1 = verts[1];
      const v4 = verts[Math.min(4, n - 1)];
      const v6 = verts[Math.min(6, n - 1)];
      ctx.moveTo(v1.dx * 0.9, v1.dy * 0.9);
      ctx.lineTo(v4.dx * 0.6, v4.dy * 0.6);
      ctx.lineTo(v6.dx * 0.85, v6.dy * 0.85);
      ctx.stroke();
      // 内部亀裂
      ctx.globalAlpha = clamp((damageFrac - 0.5) * 1.4 * 0.5, 0, 1);
      ctx.lineWidth = 1;
      ctx.strokeStyle = p.dim;
      ctx.beginPath();
      ctx.moveTo(-r * 0.25, -r * 0.1);
      ctx.lineTo(r * 0.4, r * 0.35);
      ctx.moveTo(r * 0.1, -r * 0.3);
      ctx.lineTo(-r * 0.35, r * 0.2);
      ctx.stroke();
    }

    if (phase3) {
      // クラック3: 大きな分裂線（ほぼ崩壊状態）
      ctx.globalAlpha = clamp((damageFrac - 0.75) * 4 * 0.85, 0, 1);
      ctx.lineWidth = 3;
      ctx.strokeStyle = p.bad;
      ctx.beginPath();
      ctx.moveTo(-r * 0.8, -r * 0.2);
      ctx.lineTo(r * 0.6, r * 0.5);
      ctx.moveTo(r * 0.7, -r * 0.5);
      ctx.lineTo(-r * 0.5, r * 0.6);
      ctx.stroke();
      // 欠けたチャンクの輪郭（崩れたエッジ）
      ctx.globalAlpha = clamp((damageFrac - 0.75) * 3 * 0.5, 0, 1);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.warn;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      const cv = verts[Math.floor(n * 0.6)];
      ctx.arc(cv.dx * 0.7, cv.dy * 0.7, r * 0.18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    ctx.restore();
  }

  // ---- 左端アクティブアイテムパネル ----
  // BACKボタン（y:8..44）を避けて y=52 から下へ縦並び
  _drawActiveItemsPanel(ctx, p) {
    const panelX  = 2;   // 左端から
    const barW    = 36;  // カウントダウンバーの幅
    const barH    = 4;
    const rowH    = 18;  // 1行の高さ
    let   rowY    = 58;  // 開始Y（BACKボタン下 + 少し余白）

    const labelX  = panelX;
    const barX    = panelX;

    // ---- SCATTERの残弾 ----
    if (this._scatterAmmo > 0) {
      ctx.save();
      // ラベル（短い全単語）
      this.engine.text('SCAT', labelX, rowY, 8, p.hi, 'left');
      // ドット状の残弾表示
      for (let i = 0; i < Math.min(this._scatterAmmo, 9); i++) {
        ctx.beginPath();
        ctx.arc(panelX + 28 + i * 5, rowY + 4, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.hi;
        ctx.fill();
      }
      ctx.restore();
      rowY += rowH;
    }

    // ---- ランチャースロット数（MULTIで増加） ----
    if (this._launcherSlots > 2) {
      ctx.save();
      this.engine.text('SLOTS', labelX, rowY, 8, p.mid, 'left');
      for (let i = 0; i < this._launcherSlots; i++) {
        ctx.beginPath();
        ctx.arc(panelX + 32 + i * 5, rowY + 4, 2, 0, Math.PI * 2);
        ctx.fillStyle = i < this._launcherSlots ? p.mid : p.dark;
        ctx.fill();
      }
      ctx.restore();
      rowY += rowH;
    }

    // ---- RAPIDバフ（タイマー）----
    if (this._rapidTimer > 0) {
      const frac = clamp(this._rapidTimer / RAPID_DURATION, 0, 1);
      ctx.save();
      this.engine.text('RAPID', labelX, rowY, 8, p.warn, 'left');
      // カウントダウンバー
      ctx.fillStyle = p.dark;
      ctx.fillRect(barX + 32, rowY + 4, barW, barH);
      ctx.fillStyle = p.warn;
      ctx.fillRect(barX + 32, rowY + 4, Math.max(0, barW * frac), barH);
      // 秒数
      this.engine.text(Math.ceil(this._rapidTimer) + 's', barX + 32 + barW + 2, rowY, 8, p.warn, 'left');
      ctx.restore();
      rowY += rowH;
    }

    // ---- POWERバフ（都市別タイマー）----
    for (let ci = 0; ci < CITY_COUNT; ci++) {
      const city = this.cities[ci];
      if (!city || !city.alive || !city.buffs.power.length) continue;
      // 最大タイマー（最も長いもの）を代表として表示
      const maxT = Math.max(...city.buffs.power.map(b => b.timer));
      const frac = clamp(maxT / BUFF_DURATION, 0, 1);
      ctx.save();
      this.engine.text('PWR' + (ci + 1), labelX, rowY, 8, p.warn, 'left');
      ctx.fillStyle = p.dark;
      ctx.fillRect(barX + 28, rowY + 4, barW - 4, barH);
      ctx.fillStyle = p.warn;
      ctx.fillRect(barX + 28, rowY + 4, Math.max(0, (barW - 4) * frac), barH);
      ctx.restore();
      rowY += rowH;
      if (rowY > GROUND_Y - 30) break;
    }

    // ---- WIDEバフ（都市別タイマー）----
    for (let ci = 0; ci < CITY_COUNT; ci++) {
      const city = this.cities[ci];
      if (!city || !city.alive || !city.buffs.wide.length) continue;
      const maxT = Math.max(...city.buffs.wide.map(b => b.timer));
      const frac = clamp(maxT / BUFF_DURATION, 0, 1);
      ctx.save();
      this.engine.text('WIDE' + (ci + 1), labelX, rowY, 8, p.hi, 'left');
      ctx.fillStyle = p.dark;
      ctx.fillRect(barX + 28, rowY + 4, barW - 4, barH);
      ctx.fillStyle = p.hi;
      ctx.fillRect(barX + 28, rowY + 4, Math.max(0, (barW - 4) * frac), barH);
      ctx.restore();
      rowY += rowH;
      if (rowY > GROUND_Y - 30) break;
    }
  }

  // ---- アイテム隕石の描画 ----
  _drawItemMeteor(ctx, p, m) {
    if (!m.verts || m.verts.length < 3) return;
    const pulse = 0.75 + 0.25 * Math.sin(this._elapsed * 5.0);

    ctx.save();
    ctx.globalAlpha = clamp(pulse, 0, 1);
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);

    ctx.beginPath();
    ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
    for (let vi = 1; vi < m.verts.length; vi++) {
      ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
    }
    ctx.closePath();
    ctx.strokeStyle = p.hi;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = p.hi;
    ctx.globalAlpha = clamp(pulse * 0.12, 0, 1);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = clamp(pulse, 0, 1);
    const label = m.itemType ? m.itemType[0] : '?';
    this.engine.text(label, m.x, m.y - 6, 13, p.warn, 'center');
    ctx.restore();
  }

  // ---- ビッグブラスト HUD ----
  _drawBigChargeHUD(ctx, p) {
    const baseX = W / 2 - 40;
    const baseY = 60;
    const b = this._bigBtnRect();
    if (this._bigArmed) {
      this.engine.stroke(b.x, b.y, b.w, b.h, p.hi, 2);
      this.engine.text('TAP SKY', b.x + b.w + 6, baseY, 11, p.hi, 'left');
    }
    this.engine.text('BIG:', baseX, baseY, 13, this._bigArmed ? p.hi : p.dim, 'left');
    for (let i = 0; i < BIG_CHARGES_MAX; i++) {
      const cx = baseX + 44 + i * 18;
      const cy = baseY + 6;
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, 6, 0, Math.PI * 2);
      if (i < this._bigCharges) {
        ctx.fillStyle = p.warn;
        ctx.fill();
      } else {
        ctx.strokeStyle = p.dim;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this._bigCharges < BIG_CHARGES_MAX) {
      const gaugeX = baseX;
      const gaugeY = baseY + 16;
      const gaugeW = 96;
      const frac   = clamp(this._bigRecharge / BIG_RECHARGE_SEC, 0, 1);
      this.engine.rect(gaugeX, gaugeY, gaugeW, 4, p.dark);
      this.engine.rect(gaugeX, gaugeY, Math.floor(gaugeW * frac), 4, p.warn);
    }
  }

  // ---- 星空 ----
  _drawStarfield(ctx, p) {
    ctx.save();
    ctx.fillStyle = p.dim;
    const stars = [
      [30,80],[90,55],[150,100],[220,60],[280,90],[340,70],
      [60,140],[130,170],[200,130],[260,155],[320,120],
      [45,210],[110,240],[180,200],[250,220],[315,180],
      [70,300],[160,280],[230,310],[300,290],
    ];
    for (const [sx, sy] of stars) {
      ctx.beginPath();
      ctx.arc(sx, sy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---- 都市（山シルエット＋ワイヤーフレーム街並み）----
  _drawCity(ctx, p, idx) {
    const ox = CITY_XS[idx];
    const oy = GROUND_Y - CITY_H;
    const city = this.cities[idx];
    const isSelected = (this._selectedCity === idx && city.alive);

    if (!city.alive) {
      // 瓦礫（ランダムな小石ブロック）
      ctx.save();
      ctx.strokeStyle = p.dim;
      ctx.lineWidth = 1;
      // 瓦礫を簡易描画（固定パターン）
      const rubble = [
        [0, CITY_H - 4, 8, 4],
        [10, CITY_H - 6, 10, 6],
        [22, CITY_H - 3, 6, 3],
        [4, CITY_H - 8, 6, 3],
        [16, CITY_H - 9, 8, 4],
      ];
      ctx.fillStyle = p.dark;
      for (const [rx, ry, rw, rh] of rubble) {
        ctx.fillRect(ox + rx, oy + ry, rw, rh);
        ctx.strokeRect(ox + rx, oy + ry, rw, rh);
      }
      // 煙（小さな×印）
      ctx.strokeStyle = p.bad;
      ctx.lineWidth = 1.5;
      const mx = ox + CITY_W / 2, my = oy + CITY_H / 2 - 4;
      ctx.beginPath(); ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5); ctx.stroke();
      ctx.restore();
      return;
    }

    // 選択ハイライト（グロー枠）
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = p.hi;
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(ox - 3, oy - 3, CITY_W + 6, CITY_H + 3);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // 山と街並みシルエット（ワイヤーフレーム）
    const profile = CITY_PROFILES[idx];
    if (profile && profile.length >= 3) {
      ctx.save();
      ctx.translate(ox, oy);

      // フィル（薄暗く）
      ctx.beginPath();
      ctx.moveTo(profile[0].x, profile[0].y);
      for (let i = 1; i < profile.length; i++) {
        ctx.lineTo(profile[i].x, profile[i].y);
      }
      ctx.closePath();
      ctx.fillStyle = p.dark;
      ctx.globalAlpha = 0.85;
      ctx.fill();

      // アウトライン
      ctx.globalAlpha = 1.0;
      ctx.beginPath();
      ctx.moveTo(profile[0].x, profile[0].y);
      for (let i = 1; i < profile.length; i++) {
        ctx.lineTo(profile[i].x, profile[i].y);
      }
      ctx.closePath();
      ctx.strokeStyle = isSelected ? p.hi : p.mid;
      ctx.lineWidth   = isSelected ? 1.8 : 1.2;
      ctx.stroke();

      ctx.restore();
    }

    // バフ状態（上部に小ドット）
    const buffs = city.buffs;
    let dotX = ox;
    const dotY = oy - 6;
    for (let k = 0; k < buffs.power.length; k++) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(dotX + 3, dotY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.warn;
      ctx.fill();
      ctx.restore();
      dotX += 7;
    }
    for (let k = 0; k < buffs.wide.length; k++) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(dotX + 3, dotY, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = p.hi;
      ctx.fill();
      ctx.restore();
      dotX += 7;
    }

    // 発射位置マーカー（小三角形）
    ctx.save();
    const mx  = ox + CITY_W / 2;
    const mby = oy - 1;
    ctx.fillStyle = isSelected ? p.hi : p.fg;
    ctx.globalAlpha = isSelected ? 1.0 : 0.5;
    ctx.beginPath();
    ctx.moveTo(mx, mby - 6);
    ctx.lineTo(mx - 3, mby);
    ctx.lineTo(mx + 3, mby);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
}
