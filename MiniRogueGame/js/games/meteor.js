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

// コンボ（連続撃破）— 撃破ごとにウィンドウをリセット、切れたらコンボ0に戻る
// スコア倍率 = 1 + COMBO_SCORE_STEP * combo（四捨五入して加算）
const COMBO_WINDOW     = 2.0;  // 秒
const COMBO_SCORE_STEP = 0.10; // コンボ1につき+10%
// P4実測: 無上限だと通常プレイで40〜80倍に達し他のスコア源が誤差になるため上限を設ける。
// 表示上の生コンボ数は伸び続けてよい（伸ばす快感は残す）。
const COMBO_MULT_CAP   = 4;    // スコア倍率の上限（コンボ30で到達）

// ---- REROLL / BANISH（腕前で稼ぐ選択権。広告リワードは採らない方針）----
// REROLL: コンボが10に「到達」するたびに+1（上限3）。BANISH: 都市ノーダメでステージ
// クリアすると+1（上限3）。banned に入れたアップグレードidはラン中二度と抽選されない。
const REROLL_CAP          = 3;
const BANISH_CAP          = 3;
const REROLL_COMBO_THRESH = 10;
// P4 X4対策: 3だとCOMMON全BAN→RARE固定3枚画面が作れてしまうため5に引き上げ
//（最大BAN数が実質4回になり、抽選の多様性が常に残る）
const MIN_DRAWABLE_POOL   = 5;  // BANISHでドロー可能idを5未満にしない（POOL LIMIT）

// ---- OVERDRIVE（残り1都市の背水モード）----
// 発射クールダウン×0.5（下限は通常のRUN_CD_MINより深い0.12sまで許可＝劇的に）。
// P4実測で「恒久スコア×2」は都市を開幕で捨てる支配戦略を生んだため廃止し、
// 代わりに (a) ステージクリア時の生存都市ボーナス（都市＝資産化）と
// (b) OVERDRIVE状態で耐え切ってクリアした時の一括ボーナス（逆転設計に忠実）に変更。
const OVERDRIVE_CD_MULT      = 0.5;
const OVERDRIVE_CD_FLOOR     = 0.12;
const CITY_CLEAR_BONUS       = 150;  // ステージクリア時 生存都市1つあたり
const OVERDRIVE_CLEAR_BONUS  = 300;  // OVERDRIVE状態でクリアした時の一括加算

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

// ---- ランアップグレード（ステージクリア時の3択カード / Falltopia式）----
// ラン内永続。this.run[id] がスタック数。定数は変更せず、使用箇所で補正を掛ける。
// rarity: COMMON は RARE の3倍出やすい。
// descPlain + descKey の2セグメント描画（キーワードのみ着色）。
const UPGRADES = [
  { id: 'dmg',    name: 'DAMAGE+',      icon: '+', rarity: 'COMMON', descPlain: '爆発ダメージ ',     descKey: '+1' },
  { id: 'radius', name: 'RADIUS+',      icon: '◎', rarity: 'COMMON', descPlain: '爆発半径 ',         descKey: '+18%' },
  { id: 'mspd',   name: 'MISSILE SPD+', icon: '»', rarity: 'COMMON', descPlain: 'ミサイル速度 ',     descKey: '+22%' },
  { id: 'cd',     name: 'COOLDOWN-',    icon: '-', rarity: 'COMMON', descPlain: '発射クールダウン ', descKey: '-15%' },
  { id: 'multi',  name: 'CAP+',         icon: '≡', rarity: 'COMMON', descPlain: '同時飛翔ミサイル ', descKey: '+1' },
  { id: 'coin',   name: 'COIN',         icon: '$', rarity: 'COMMON', descPlain: '撃破ごとにスコア ', descKey: '+5' },
  { id: 'slots',  name: 'SLOTS+',       icon: '⬡', rarity: 'RARE',   descPlain: '発射台都市 ',       descKey: '+1' },
  { id: 'chain',  name: 'CHAIN',        icon: 'ϟ', rarity: 'RARE',   descPlain: '隕石撃破で ',       descKey: '連鎖爆発' },
  { id: 'shock',  name: 'SHOCKWAVE',    icon: '◉', rarity: 'RARE',   descPlain: '巨大隕石撃破で ',   descKey: '衝撃波' },
  { id: 'shield', name: 'SHIELD',       icon: '□', rarity: 'RARE',   descPlain: '都市被弾を1回 ',    descKey: '無効化' },
];

// カードUIレイアウト（W=360, H=640 に収まる縦3枚スタック）
const CARD_W   = 330;
const CARD_H   = 92;
const CARD_GAP = 12;
const CARD_X   = Math.floor((W - CARD_W) / 2);
const CARD_Y0  = 190;

// カード3枚の下に並ぶ REROLL / BANISH 小ボタン（横並び2個）
const CARD_BTN_W   = 150;
const CARD_BTN_H   = 34;
const CARD_BTN_Y   = 505;
const CARD_BTN_GAP = 14;

// 効果チューニング
const RUN_RADIUS_PER_STACK = 0.18;  // 爆発半径 +18%/枚
const RUN_MSPD_PER_STACK   = 0.22;  // ミサイル速度 +22%/枚
const RUN_CD_MULT          = 0.85;  // クールダウン ×0.85/枚（下限 0.2s）
const RUN_CD_MIN           = 0.2;
const RUN_COIN_PER_STACK   = 5;     // 撃破ボーナススコア/枚
const CHAIN_BASE_R         = 26;    // 連鎖爆発の基本半径
const CHAIN_R_PER_STACK    = 8;
const SHOCK_BASE_R         = 140;   // 衝撃波の基本半径
const SHOCK_R_PER_STACK    = 20;

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

// ---- コース・ピクセルスペックル爆発（Missile Command 風）----
// フラットな赤雲・XOR合成・月輪リムを廃止し、
// 大きな正方形セル（~8px）を高速カラーサイクルで埋めるスペックルで置換。
// セル色は毎1〜2フレームごとにランダム化されフラッシュ白に見える。
// 円境界は大セルのブロックエッジで自然にガタガタになる（狙い通り）。

// スペックル色セット：ビビッド多色 + 約28%をブラック（ネガティブ）
const _SPECKLE_COLORS = [
  '#ffffff', // 白（最も多く出ることで「フラッシュ白」に見える）
  '#ffffff',
  '#ffffff',
  '#00ff88', // 輝くグリーン
  '#ff00ff', // マゼンタ
  '#00ffff', // シアン
  '#ffff00', // 黄
  '#ff4400', // 赤オレンジ
  '#ff9900', // オレンジ
  '#4466ff', // ブルー
  '#000000', // ブラック（ネガティブ）
  '#000000', // ブラック
  '#000000', // ブラック（全14色中3色 ≒ 21%、白3+ブラック3=43%でコントラスト）
  '#ffffff',
];
const _SPECKLE_COLOR_COUNT = _SPECKLE_COLORS.length; // 14

// セルサイズ（論理px）— 大きいほどブロッキーでレトロらしい
const _CELL = 8;

// 高速シードPRNG（xorshift32相当の整数ハッシュ）
// 引数はすべて整数化済みと仮定。戻り値 0〜1 の float。
function _speckleRand(cx, cy, blastId, tick) {
  // Wang hash 風のビット混合
  let h = (cx * 2246822519) ^ (cy * 3266489917) ^ (blastId * 668265263) ^ (tick * 374761393);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffff) / 0x10000; // 0〜0.9999...
}

// 全爆発をスペックルで描画（source-over のみ、XOR合成なし）
// mainCtx: メインCanvas2Dコンテキスト（論理座標系）
// blasts: アクティブ爆発オブジェクト配列
// frameCount: インクリメントカウンタ（色フリッカー用、1フレームおきに更新）
function drawAllBlastsSpeckle(mainCtx, blasts, frameCount) {
  for (const b of blasts) {
    if (!b) continue;
    const r = Math.max(1, b.r);
    // フェードアウト用アルファ（成長中は1.0、フェード中は線形減衰）
    const alpha = b.growing
      ? 1.0
      : clamp(b.fadeTimer / BLAST_FADE_SEC, 0, 1);
    if (alpha <= 0) continue;

    const bx = b.x;
    const by = b.y;
    const id = b.id | 0;

    // ★全面を1色で塗る。フレームごとに色を高速サイクルさせ、爆発の「全面」が
    //   白・カラフル・黒(ネガ)と明滅する。ドット単位ではなく面全体が点滅する。
    const cidx = (_speckleRand(id, 7, 13, frameCount) * _SPECKLE_COLOR_COUNT) | 0;
    const fillCol = _SPECKLE_COLORS[cidx];

    // グリッドをブラスト中心から±r の矩形に限定（粗いセルで縁をガタガタに）
    const x0 = Math.floor((bx - r) / _CELL);
    const x1 = Math.ceil ((bx + r) / _CELL);
    const y0 = Math.floor((by - r) / _CELL);
    const y1 = Math.ceil ((by + r) / _CELL);

    mainCtx.save();
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.globalAlpha = clamp(alpha, 0, 1);
    mainCtx.fillStyle = fillCol;

    for (let gy = y0; gy <= y1; gy++) {
      const cy = gy * _CELL + _CELL * 0.5;
      const dy = cy - by;

      for (let gx = x0; gx <= x1; gx++) {
        const cx = gx * _CELL + _CELL * 0.5;
        const dx = cx - bx;

        // セルごとに半径ジッターでエッジを粗く（綺麗な円にしない）
        const jitter = 0.88 + 0.22 * _speckleRand(gx * 7 + 3, gy * 5 + 1, id, 0);
        const effectiveR = r * jitter;
        if (dx * dx + dy * dy > effectiveR * effectiveR) continue;

        mainCtx.fillRect(gx * _CELL, gy * _CELL, _CELL, _CELL);
      }
    }

    mainCtx.restore();
  }

  // 安全のため compositeOperation / alpha をデフォルトに戻す
  mainCtx.globalCompositeOperation = 'source-over';
  mainCtx.globalAlpha = 1;
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

    // ---- 浮遊数値（撃破スコア/コンボ/CITY LOST等）----
    this.floaters = []; // [{x,y,txt,color,size,t,dur}]

    // ---- コンボ（2秒ウィンドウ内の連続撃破）----
    this.combo       = 0;
    this._comboTimer = 0;

    // ---- REROLL / BANISH（腕前で獲得する選択権。ラン内のみ、保存しない）----
    this.rerolls  = 1;         // カード引き直し残数（初期1、上限3）
    this.banishes = 0;         // カード永久除外残数（上限3）
    this.banned   = new Set(); // 以後の抽選から除外するアップグレードid（ラン内永続）
    this._comboRewarded     = false; // コンボ10到達報酬の付与済みフラグ（コンボ0でリセット）
    this._cityLostThisStage = false; // このステージ中に都市を失ったか（BANISH獲得条件）
    this._banishShake       = 0;     // POOL LIMIT 拒否時のシェイクタイマー（秒）

    // ---- OVERDRIVE（残り1都市の背水モード）----
    this.overdrive = false;

    // ---- ラン内永続アップグレード（3択カードで獲得、値=スタック数）----
    this.run = {
      dmg: 0,     // 爆発ダメージ +1/枚
      radius: 0,  // 爆発半径 +18%/枚
      mspd: 0,    // ミサイル速度 +22%/枚
      cd: 0,      // クールダウン -15%/枚（下限0.2s）
      multi: 0,   // 同時飛翔ミサイル +1/枚（全体上限10）
      slots: 0,   // 発射台都市 +1/枚（上限5）
      chain: 0,   // 撃破時に連鎖小爆発
      shock: 0,   // 巨大隕石撃破で画面規模の弱衝撃波
      coin: 0,    // 撃破ごとにスコア +5/枚
      shield: 0,  // 都市被弾を1回無効化（消費型、枚数分）
    };

    // 3択カード画面（open中はゲームプレイ凍結）
    this._cardChoice = null; // { cards:[...], t, stage } | null

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

  // カード選択中はエンジンのBACKボタンを無効化（誤タップでメニューに戻らない）
  blocksBack() { return !!this._cardChoice; }

  // ---- ランアップグレード補正（定数は不変、使用箇所でこれらを掛ける）----
  _runDmgBonus() {
    return this.run ? (this.run.dmg | 0) : 0;
  }

  _runRadiusMult() {
    const n = this.run ? (this.run.radius | 0) : 0;
    return 1 + RUN_RADIUS_PER_STACK * n;
  }

  _runMissileSpd() {
    const n = this.run ? (this.run.mspd | 0) : 0;
    return MISSILE_SPD * (1 + RUN_MSPD_PER_STACK * n);
  }

  _runCooldown(base) {
    const n = this.run ? (this.run.cd | 0) : 0;
    return Math.max(RUN_CD_MIN, base * Math.pow(RUN_CD_MULT, n));
  }

  // ---- 実効クールダウン：RAPID/ランCD補正の後に OVERDRIVE 半減を適用 ----
  // OVERDRIVE中は通常の下限(0.2s)を超えて0.12sまで下がる（背水の劇的さを優先）。
  _effectiveCooldown() {
    let cd = this._runCooldown(this._rapidTimer > 0 ? RAPID_COOLDOWN : FIRE_COOLDOWN);
    if (this.overdrive) cd = Math.max(OVERDRIVE_CD_FLOOR, cd * OVERDRIVE_CD_MULT);
    return cd;
  }

  // ---- 3択カード：重み付きサンプリング（COMMON=3, RARE=1、重複なし3枚）----
  // BANISH済みのid（this.banned）は候補から永久除外。
  _pick3Upgrades() {
    const banned = this.banned || null;
    // 発射台が既に最大ならSLOTS+は候補から外す（死にカード防止）
    const avail = UPGRADES.filter(u =>
      !(u.id === 'slots' && this._launcherSlots >= 5) &&
      !(banned && banned.has(u.id))
    );
    const picked = [];
    while (picked.length < 3 && avail.length > 0) {
      let total = 0;
      for (const u of avail) total += (u.rarity === 'RARE' ? 1 : 3);
      let r = Math.random() * total;
      let idx = avail.length - 1;
      for (let i = 0; i < avail.length; i++) {
        r -= (avail[i].rarity === 'RARE' ? 1 : 3);
        if (r <= 0) { idx = i; break; }
      }
      picked.push(avail[idx]);
      avail.splice(idx, 1);
    }
    return picked;
  }

  // ---- カード適用：run スタック加算（SLOTS+ は即時に発射台を増やす）----
  _applyUpgrade(card) {
    if (!card || !this.run) return;
    if (this.run[card.id] == null) this.run[card.id] = 0;
    this.run[card.id]++;
    if (card.id === 'slots') {
      this._launcherSlots = Math.min(this._launcherSlots + 1, 5);
    }
  }

  // ---- REROLL/BANISH ボタン矩形（ヒットテストと描画で共用）----
  _rerollBtnRect() {
    return { x: W / 2 - CARD_BTN_GAP / 2 - CARD_BTN_W, y: CARD_BTN_Y, w: CARD_BTN_W, h: CARD_BTN_H };
  }

  _banishBtnRect() {
    return { x: W / 2 + CARD_BTN_GAP / 2, y: CARD_BTN_Y, w: CARD_BTN_W, h: CARD_BTN_H };
  }

  // ---- BANISH実行：カードidxのアップグレードidを以後の抽選から永久除外し、
  //      その1枚だけを新しいカード（他2枚と重複せず・banned外）に差し替える。----
  // ガード：BAN後にドロー可能なidが MIN_DRAWABLE_POOL(3) 未満になるなら拒否
  //（シェイク＋'POOL LIMIT'フロート、banishesは消費しない）。
  _banishCard(idx) {
    const cc = this._cardChoice;
    if (!cc || !cc.cards || !cc.cards[idx]) return;
    if (this.banishes <= 0) { cc.banishing = false; return; }
    const target = cc.cards[idx];

    // ドロー可能プール（BAN対象を除外した後）を数える。
    // M2対策: slotsは「後で最大化してプールから消える」可能性があるため、現在の
    // _launcherSlots に関わらず常に除外して保守的に数える（不変条件を厳密に守る）。
    const drawableAfter = UPGRADES.filter(u =>
      u.id !== target.id &&
      !this.banned.has(u.id) &&
      u.id !== 'slots'
    );
    if (drawableAfter.length < MIN_DRAWABLE_POOL) {
      this._banishShake = 0.3;
      this._float(W / 2, CARD_BTN_Y - 10, 'POOL LIMIT', P().bad, 12);
      this.engine.audio.bad();
      cc.banishing = false;
      return;
    }

    this.banned.add(target.id);
    this.banishes = Math.max(0, this.banishes - 1);

    // 差し替え候補：banned外・他2枚と重複しない・SLOTS+最大なら除外
    const otherIds = cc.cards.filter((c, i) => i !== idx && c).map(c => c.id);
    const pool = drawableAfter.filter(u => !otherIds.includes(u.id));
    if (pool.length > 0) {
      // 重み付き抽選（COMMON=3 : RARE=1）
      let total = 0;
      for (const u of pool) total += (u.rarity === 'RARE' ? 1 : 3);
      let r = Math.random() * total;
      let pickIdx = pool.length - 1;
      for (let i = 0; i < pool.length; i++) {
        r -= (pool[i].rarity === 'RARE' ? 1 : 3);
        if (r <= 0) { pickIdx = i; break; }
      }
      cc.cards[idx] = pool[pickIdx];
    } else {
      // 理論上のフォールバック：差し替え候補が無ければその枠を落とす（2枚でも選択可能）
      cc.cards.splice(idx, 1);
    }
    cc.banishing = false;
    this.engine.audio.select();
  }

  // ---- カードのタップ判定（当たれば 0..2、外れは -1）----
  _cardHitTest(x, y) {
    if (!this._cardChoice || !this._cardChoice.cards) return -1;
    for (let i = 0; i < this._cardChoice.cards.length && i < 3; i++) {
      const cy = CARD_Y0 + i * (CARD_H + CARD_GAP);
      if (x >= CARD_X && x <= CARD_X + CARD_W && y >= cy && y <= cy + CARD_H) return i;
    }
    return -1;
  }

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
    // ---- 3択カード選択中：入力はカード/ボタンのみが受ける（backも無効＝誤脱出防止）----
    if (this._cardChoice) {
      if (action === 'tap' && data) {
        // 開いた直後の誤タップ（撃ち漏らし連打）を無視
        if (this._cardChoice.t < 0.25) return;

        const inRect = (r) =>
          data.x >= r.x && data.x <= r.x + r.w && data.y >= r.y && data.y <= r.y + r.h;

        // REROLLボタン：3枚まるごと引き直し（banned除外の抽選を再実行）
        const rb = this._rerollBtnRect();
        if (inRect(rb)) {
          if (this.rerolls > 0) {
            this.rerolls--;
            this._cardChoice.banishing = false;
            this._cardChoice.cards = this._pick3Upgrades();
            this.engine.audio.select();
          }
          return; // 残数0は無反応（ボタンはdim表示）
        }

        // BANISHボタン：バニッシュモードのトグル（再タップでキャンセル）
        const bb = this._banishBtnRect();
        if (inRect(bb)) {
          if (this._cardChoice.banishing) {
            this._cardChoice.banishing = false;
            this.engine.audio.select();
          } else if (this.banishes > 0) {
            this._cardChoice.banishing = true;
            this.engine.audio.select();
          }
          return;
        }

        const idx = this._cardHitTest(data.x, data.y);
        if (idx >= 0 && this._cardChoice.cards[idx]) {
          if (this._cardChoice.banishing) {
            // バニッシュモード中のカードタップ＝そのidを永久除外して1枚差し替え
            this._banishCard(idx);
            return;
          }
          this._applyUpgrade(this._cardChoice.cards[idx]);
          this.engine.audio.good();
          this._cardChoice = null; // 閉じて再開
        }
      }
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
    // CAP+ アップグレード：同時飛翔上限 +1/枚（全体上限10は維持）
    const extra   = this.run ? (this.run.multi | 0) : 0;
    const isRapid = this._rapidTimer > 0;
    if (isRapid) {
      return Math.min(Math.min(this._launcherSlots * RAPID_SHOTS_CITY, MISSILES_CAP_RAPID) + extra, 10);
    }
    return Math.min(Math.min(this._launcherSlots, MISSILES_CAP_NORMAL) + extra, 10);
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

    // MISSILE SPD+ アップグレード適用（+22%/枚）
    const spd = this._runMissileSpd();
    this.missiles.push({
      x: launchX, y: launchY,
      tx, ty,
      vx: (dx / dist) * spd,
      vy: (dy / dist) * spd,
      spd, // 到達判定用に実速度を保持
      done: false,
      big: !!big,
      scatter: useScatter,
      cityIdx,   // 発射元都市（バフ参照用）
    });

    // RAPIDバフ中はクールダウン短縮、COOLDOWN- アップグレード適用（-15%/枚、下限0.2s）、
    // OVERDRIVE中はさらに×0.5（下限0.12s）— _effectiveCooldown に集約
    this._fireCooldown = this._effectiveCooldown();
    this.engine.audio.move();
  }

  // ---- update ----
  update(dt) {
    if (this.dead) return;
    const p = P(); // 撃破フロート・コンボ表示の色参照用

    // ---- 3択カード選択中：ゲームプレイ凍結（演出タイマー・パーティクルのみ進行）----
    // スポーン・隕石・ミサイル・爆発・バフ・_elapsed はすべて停止。
    // _frameCount は render 側で毎フレーム進むためフリッカーは継続する。
    if (this._cardChoice) {
      this._cardChoice.t += dt;
      if (this._clearOverlay) {
        this._clearOverlay.timer -= dt;
        if (this._clearOverlay.timer <= 0) this._clearOverlay = null;
      }
      // POOL LIMIT 拒否シェイクの減衰
      if (this._banishShake > 0) this._banishShake = Math.max(0, this._banishShake - dt);
      this._updateCityBlasts(dt);
      this._updateDebris(dt);
      // カード画面上のフロート（POOL LIMIT / BANISH +1）を進行させる
      this._updateFloaters(dt);
      return;
    }

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
      // 都市＝資産：生存都市1つごとにボーナス（開幕で都市を捨てる戦略を無効化・P4 D1対策）
      const aliveCities = this.cities.filter(Boolean).length;
      const cityBonus   = CITY_CLEAR_BONUS * aliveCities;
      // OVERDRIVE（残り1都市）で耐え切ってクリアした時だけの一括報酬＝逆転設計
      const odBonus     = this.overdrive ? OVERDRIVE_CLEAR_BONUS : 0;
      const bonus = 100 + clearedStage * 50 + cityBonus + odBonus;
      this.score += bonus;
      if (cityBonus > 0) this._float(W / 2, H / 2 + 44, 'CITIES +' + cityBonus, p.mid, 12);
      if (odBonus > 0)   this._float(W / 2, H / 2 + 24, 'OVERDRIVE +' + odBonus, p.warn, 14);

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

      // クリアオーバーレイ表示（フロート演出はカード背後で継続）
      this._clearOverlay = { timer: 2.8, stage: clearedStage + 1, bonus };

      // ---- BANISH獲得：このステージ中に都市を1つも失っていなければ+1（上限3）----
      let banishEarned = false;
      if (!this._cityLostThisStage && this.banishes < BANISH_CAP) {
        this.banishes++;
        banishEarned = true;
        this._float(W / 2, H / 2 + 64, 'BANISH +1', p.hi, 14);
      }
      this._cityLostThisStage = false; // 次ステージ用にリセット

      // ---- 3択アップグレードカードを開く（開いている間ゲームプレイは凍結）----
      const cards = this._pick3Upgrades();
      if (cards.length > 0) {
        this._cardChoice = { cards, t: 0, stage: clearedStage + 1, banishing: false, banishEarned };
      }

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
      if (!m || m.x == null) {
        // 防御的splice（現状の生成経路では到達不能）。他のsplice箇所と同様に _bossIdx を補正する。
        this.meteors.splice(i, 1);
        if (this._bossIdx === i) { this._bossAlive = false; this._bossIdx = -1; }
        else if (this._bossIdx > i) this._bossIdx--;
        continue;
      }
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

      // ヒットフラッシュタイマーのカウントダウン
      if (m.flashTimer > 0) m.flashTimer = Math.max(0, m.flashTimer - dt);

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

    // ---- OVERDRIVE 判定（残り1都市でアクティブ）----
    // 隕石の着弾処理（都市破壊）後・爆発スコア処理前に評価するので、
    // 「最後の1都市になったフレーム」からCT半減とスコア×2が効く。
    {
      const aliveCities = this.cities.reduce((n, c) => n + (c.alive ? 1 : 0), 0);
      const odNow = (aliveCities === 1);
      if (odNow && !this.overdrive) {
        // 発動エッジ：中央に大きくポップ＋短い上昇シーケンス
        this._float(W / 2, H / 2 - 60, 'OVERDRIVE', p.warn, 24);
        this.engine.audio.sequence([
          { freq: 220, dur: 0.08, type: 'square', vol: 0.20 },
          { freq: 330, dur: 0.08, type: 'square', vol: 0.20 },
          { freq: 550, dur: 0.18, type: 'square', vol: 0.22 },
        ]);
      }
      this.overdrive = odNow;
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
      if (Math.hypot(ddx, ddy) < (ms.spd || MISSILE_SPD) * dt * 1.5 + 4) {
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
        // ダメージを受けたが破壊されない場合はヒットフラッシュを起動
        if (m.hp > 0) {
          m.flashTimer = 0.13; // ~0.13秒間白くフラッシュ
          // ボス「チャンク」フロート：撃破に至らない被弾でも被ダメージを小さくポップ
          if (m.boss) {
            this._float(b.x, b.y, '-' + b.damage, p.warn, 15);
          }
        }
        if (m.hp <= 0) {
          // ---- コンボ更新（2秒ウィンドウ内の連続撃破。このキル自身も1カウント）----
          this._comboTimer = COMBO_WINDOW;
          this.combo = (this.combo | 0) + 1;
          const comboMult = Math.min(1 + COMBO_SCORE_STEP * this.combo, COMBO_MULT_CAP);

          // ---- REROLL獲得：コンボが10に「到達」した瞬間に+1（上限3）----
          // ≥10 の間は再付与しない（_comboRewarded、コンボが0に戻るとリセット）。
          // ボスのチャンク被弾はキルではないためコンボに乗らず、ここには来ない（仕様）。
          if (this.combo >= REROLL_COMBO_THRESH && !this._comboRewarded) {
            this._comboRewarded = true;
            if (this.rerolls < REROLL_CAP) {
              this.rerolls++;
              this._float(W / 2, 78, 'REROLL +1', p.mid, 12);
              this.engine.audio.select();
            }
          }

          if (m.boss) {
            let gain = BOSS_SCORE_BASE * (this._stage + 1);
            // COIN: 撃破ボーナススコア
            if (this.run && this.run.coin > 0) gain += RUN_COIN_PER_STACK * this.run.coin;
            gain = Math.round(gain * comboMult);
            this.score += gain;
            this._bossAlive = false;
            this._bossIdx   = -1;
            // ボス破壊演出
            this._spawnBossShatter(m.x, m.y, m.r);
            m.flashTimer = 0; // 破壊時はフラッシュ不要
            // 撃破フロート（ボス死は大きく表示）
            this._float(m.x, m.y, '+' + gain, p.warn, 22);
            // SHOCKWAVE: ボス撃破でも広域弱衝撃波（ダメージ1）
            if (this.run && this.run.shock > 0) {
              this._spawnExtraBlast(m.x, m.y, SHOCK_BASE_R + SHOCK_R_PER_STACK * this.run.shock, 1, true);
            }
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
            let gain = METEOR_SCORE_BASE * sizeBonus;
            // COIN: 撃破ごとにボーナススコア（+5/枚）
            if (this.run && this.run.coin > 0) gain += RUN_COIN_PER_STACK * this.run.coin;
            gain = Math.round(gain * comboMult);
            this.score += gain;
            // 隕石の役割色（通常=赤/高速=明色/巨大=警告色）で撃破フロート
            const floatColor = m.fast ? p.hi : (m.r >= GIANT_R_THRESH ? p.warn : p.bad);
            this._float(m.x, m.y, '+' + gain, floatColor, 12);
            // CHAIN: 撃破地点に小さな連鎖爆発（ダメージ1）
            // 新しい爆発は配列末尾に push され、この下方向ループでは今フレーム再訪しない（安全）
            if (this.run && this.run.chain > 0) {
              this._spawnExtraBlast(m.x, m.y, CHAIN_BASE_R + CHAIN_R_PER_STACK * this.run.chain, 1, false);
            }
            // SHOCKWAVE: 巨大隕石（GIANT閾値以上）撃破で広域弱衝撃波（ダメージ1）
            if (this.run && this.run.shock > 0 && m.r >= GIANT_R_THRESH) {
              this._spawnExtraBlast(m.x, m.y, SHOCK_BASE_R + SHOCK_R_PER_STACK * this.run.shock, 1, true);
            }
            this.engine.audio.good();
          }
          if (this._bossIdx > j) this._bossIdx--;
          this.meteors.splice(j, 1);
        }
      }
    }

    // 都市爆発エフェクト更新
    this._updateCityBlasts(dt);

    // デブリ更新
    this._updateDebris(dt);

    // ---- コンボウィンドウ更新（切れたら0に戻す）----
    if (this.combo > 0) {
      this._comboTimer -= dt;
      if (this._comboTimer <= 0) {
        this.combo       = 0;
        this._comboTimer = 0;
        // コンボが切れたら次の「10到達」でまたREROLLを獲得できる
        this._comboRewarded = false;
      }
    }

    // ---- 浮遊数値の更新 ----
    this._updateFloaters(dt);

    // ゲームオーバー判定
    if (this.cities.every(c => !c.alive)) {
      this.dead = true;
      this.engine.audio.bad();
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // ---- 浮遊数値（フロート）----
  // 撃破スコア・コンボ・CITY LOST/SHIELD/REROLL +1/POOL LIMIT等を対象色でポップさせて
  // 消すための軽量パーティクル。カード選択中も凍結ブランチ側で_updateFloatersを呼ぶため
  // カード画面上のフロート（POOL LIMIT / BANISH +1）は進行する。
  _float(x, y, txt, color, size = 12) {
    if (!this.floaters) this.floaters = [];
    this.floaters.push({
      x, y,
      txt: String(txt),
      color: color || P().fg,
      size,
      t: 0,
      dur: 0.8,
    });
  }

  _updateFloaters(dt) {
    if (!this.floaters) { this.floaters = []; return; }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      if (!f) { this.floaters.splice(i, 1); continue; }
      f.t += dt;
      if (f.t >= f.dur) { this.floaters.splice(i, 1); continue; }
      // 寿命中に約26px上へドリフト（フレームレート非依存）
      f.y -= (26 / f.dur) * dt;
    }
  }

  // ---- 都市爆発エフェクト更新（通常時・カード選択中の両方から呼ぶ）----
  _updateCityBlasts(dt) {
    for (let i = this.cityBlasts.length - 1; i >= 0; i--) {
      const cb = this.cityBlasts[i];
      if (!cb) { this.cityBlasts.splice(i, 1); continue; }
      cb.t -= dt;
      cb.r += 60 * dt;
      if (cb.t <= 0) this.cityBlasts.splice(i, 1);
    }
  }

  // ---- デブリ更新（通常時・カード選択中の両方から呼ぶ）----
  _updateDebris(dt) {
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
      flashTimer: 0, // ヒットフラッシュタイマー（秒）
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
      flashTimer: 0, // ヒットフラッシュタイマー（秒）
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

  // ---- 連鎖・衝撃波用の追加爆発（既存の爆発システムを再利用、音・散弾なし）----
  // maxR/damage をカスタム指定。都市バフやランのDMG+は適用しない（意図的に弱い）。
  _spawnExtraBlast(x, y, maxR, damage, big) {
    this.blasts.push({
      x: clamp(x, 0, W),
      y: clamp(y, 0, GROUND_Y - 2),
      r: 4,
      maxR: Math.max(6, maxR || 6),
      growing: true,
      fadeTimer: BLAST_FADE_SEC,
      big: !!big,
      id: _nextBlastId++,
      damage: Math.max(1, damage | 0),
      isScatter: false,
      cityIdx: -1,
    });
  }

  // ---- 爆発スポーン ----
  // cityIdx: 発射元都市インデックス（バフ参照、-1=不明）
  _spawnBlast(x, y, big, isScatter, isScatterShot, cityIdx) {
    // 発射元都市のバフを参照
    const city   = (cityIdx >= 0 && this.cities[cityIdx]) ? this.cities[cityIdx] : null;
    const buffs  = city ? city.buffs : makeCityBuffs();

    // RADIUS+ アップグレード（+18%/枚）— 基本半径に乗算、WIDEバフの加算はその後
    const radMult = this._runRadiusMult();
    const baseR = big
      ? BLAST_GROW_BIG * radMult
      : (BLAST_GROW * radMult + cityBuffRadiusAdd(buffs));
    const maxR  = Math.max(6, baseR);
    // DAMAGE+ アップグレード（+1/枚）— 通常もビッグも加算
    const dmg   = (big ? BLAST_DAMAGE_BIG : cityBuffPower(buffs)) + this._runDmgBonus();
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
      const floatX = CITY_XS[bestIdx] + CITY_W / 2;
      const floatY = GROUND_Y - CITY_H - 6;
      // SHIELD アップグレード：被弾を1回無効化（スタック消費）
      if (this.run && this.run.shield > 0) {
        this.run.shield--;
        this.engine.audio.select();
        this._float(floatX, floatY, 'SHIELD', P().mid, 11);
        // シールド発動の小フラッシュ（都市爆発エフェクトを弱く流用）
        this.cityBlasts.push({
          x: CITY_XS[bestIdx] + CITY_W / 2,
          y: GROUND_Y - CITY_H / 2,
          r: 6, t: 0.3,
        });
        return;
      }
      this.cities[bestIdx].alive = false;
      // BANISH獲得条件の追跡：このステージ中に都市を実際に失った
      //（SHIELDで防いだ被弾は上のreturnで抜けるためカウントされない＝仕様）
      this._cityLostThisStage = true;
      // 選択都市が破壊されたらリセット
      if (this._selectedCity === bestIdx) this._selectedCity = -1;
      this.engine.audio.bad();
      this._float(floatX, floatY, 'CITY LOST', P().bad, 11);
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

    // ---- OVERDRIVE：脈動する画面縁ビネット（最初に描く＝フィールドの上に見え、HUDテキストの下）----
    this._drawOverdriveVignette(ctx, p);

    // ---- TOP HUD：ピクトグラフ圧縮ストリップ（x:52..W-8, y:8..44, BACKボタンを避ける） ----
    this._drawTopHud(ctx, p);

    // コンボ表示（combo>=3 のときのみ、HUDストリップ上部中央）
    this._drawComboHud(ctx, p);

    // OVERDRIVE中はコンボ表示エリア直下に小さなタグ
    if (this.overdrive && !this.dead) {
      this.engine.text('OVERDRIVE', W / 2, 30, 9, p.warn, 'center');
    }

    // ボスHPバー（トップHUDストリップ下のスリムな第2行、ボスが画面内に入ったときのみ表示）
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

      // 軌跡のリング描画は廃止（隕石中央に輪が見える原因だったため）。
      // 高速隕石だけ、細い尾を薄い線で表現する（中央に輪は出さない）。
      if (m.fast && m.trail.length >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(m.trail[0].x, m.trail[0].y);
        for (let t = 1; t < m.trail.length; t++) {
          if (m.trail[t]) ctx.lineTo(m.trail[t].x, m.trail[t].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // 岩石ポリゴン本体
      if (m.verts && m.verts.length >= 3) {
        const lineW    = clamp(1.8 - damageFrac * 0.8, 0.5, 2.5);
        const bodyAlpha = clamp(1 - damageFrac * 0.4, 0.3, 1);

        // ヒットフラッシュ：ダメージを受けたがまだ生きている場合、白く光らせる
        const flashing = m.flashTimer > 0;
        // フラッシュ強度（0→1でフェードアウト）
        const flashStrength = flashing ? clamp(m.flashTimer / 0.13, 0, 1) : 0;

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
          // フラッシュ中はボスの塗りも少し白くなる
          ctx.fillStyle = flashing ? '#ffffff' : p.dark;
          ctx.globalAlpha = flashing
            ? clamp(flashStrength * 0.55, 0, 1)
            : clamp(0.65 - damageFrac * 0.2, 0, 1);
          ctx.fill();
          ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        }

        ctx.beginPath();
        ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
        for (let vi = 1; vi < m.verts.length; vi++) {
          ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
        }
        ctx.closePath();

        // フラッシュ中はアウトラインを白/明るい色に切り替え
        if (flashing) {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth   = m.boss
            ? clamp(lineW * 2 + flashStrength * 2, 1, 6)
            : clamp(lineW + flashStrength * 1.5, 0.5, 4);
          ctx.globalAlpha = clamp(bodyAlpha * (0.5 + flashStrength * 0.5), 0, 1);
        } else {
          ctx.strokeStyle = bodyColor;
          ctx.lineWidth   = m.boss ? clamp(lineW * 2, 1, 4) : lineW;
        }
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
        // HP ピップは削除。代わりにヒットフラッシュで被弾を表現する。
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

    // ---- 爆発（コースピクセルスペックル：Missile Command 風）----
    // フレームカウンタをインクリメント（render は毎フレーム呼ばれる）
    this._frameCount = (this._frameCount + 1) | 0;

    if (this.blasts.length > 0) {
      // 成長中/フェード中の爆発のみ対象
      const activeBlasts = this.blasts.filter(b => b != null);

      if (activeBlasts.length > 0) {
        drawAllBlastsSpeckle(ctx, activeBlasts, this._frameCount);
      }
    }

    // ---- 浮遊数値（撃破スコア/コンボ/CITY LOST等。爆発の上・パネルの下）----
    this._drawFloaters(ctx, p);

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
      // OVERDRIVE込みの実効クールダウンを基準にする（バーの進行率が正しくなる）
      const coolRef = this._effectiveCooldown();
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

    // ---- 3択アップグレードカード（最前面）----
    if (this._cardChoice && !this.dead) {
      this._drawCardChoice(ctx, p);
    }
  }

  // ---- OVERDRIVE ビネット：画面縁のインセット矩形が~2Hzで脈動（alpha 0.15..0.45）----
  _drawOverdriveVignette(ctx, p) {
    if (!this.overdrive || this.dead) return;
    // _elapsed基準の2Hz振動（カード凍結中は_elapsedが止まるので脈動も静止＝許容）
    const osc   = 0.5 + 0.5 * Math.sin(this._elapsed * Math.PI * 2 * 2);
    const alpha = 0.15 + 0.30 * osc; // 0.15..0.45
    ctx.save();
    ctx.strokeStyle = p.warn;
    ctx.globalAlpha = clamp(alpha, 0, 1);
    ctx.lineWidth = 5;
    ctx.strokeRect(3, 3, W - 6, H - 6);
    // 内側にもう1本、薄く太い線で「にじみ」を作る
    ctx.globalAlpha = clamp(alpha * 0.45, 0, 1);
    ctx.lineWidth = 10;
    ctx.strokeRect(9, 9, W - 18, H - 18);
    ctx.restore();
  }

  // ---- 3択アップグレードカード画面（Falltopia式）----
  _drawCardChoice(ctx, p) {
    const cc = this._cardChoice;
    if (!cc || !cc.cards || cc.cards.length === 0) return;
    const fadeIn = clamp(cc.t / 0.25, 0, 1);

    // フィールドを暗く（クリア演出のフロートは背後で継続して見える）
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = clamp(0.75 * fadeIn, 0, 1);
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = clamp(fadeIn, 0, 1);

    // POOL LIMIT 拒否時の小シェイク（減衰する水平オフセット）
    if (this._banishShake > 0) {
      const shakeX = Math.sin(this._banishShake * 55) * 4 * clamp(this._banishShake / 0.3, 0, 1);
      ctx.translate(shakeX, 0);
    }

    // タイトル＋ステージラベル（バニッシュモード中はヒントに差し替え）
    this.engine.text('CHOOSE UPGRADE', W / 2, 132, 22, p.hi, 'center');
    if (cc.banishing) {
      this.engine.text('TAP CARD TO BANISH', W / 2, 162, 11, p.bad, 'center');
    } else {
      this.engine.text('STAGE ' + (cc.stage || 1) + ' CLEAR - REWARD x1', W / 2, 162, 11, p.mid, 'center');
    }

    for (let i = 0; i < cc.cards.length && i < 3; i++) {
      const card = cc.cards[i];
      if (!card) continue;
      this._drawUpgradeCard(ctx, p, card, CARD_X, CARD_Y0 + i * (CARD_H + CARD_GAP), !!cc.banishing);
    }

    // ---- カード下の REROLL / BANISH 小ボタン（残数0はdim＋無反応）----
    this._drawCardBtn(ctx, p, this._rerollBtnRect(), 'reroll', this.rerolls, false);
    this._drawCardBtn(ctx, p, this._banishBtnRect(), 'banish', this.banishes, !!cc.banishing);

    // BANISH獲得ラベル（都市ノーダメクリア報酬。開いて最初の~1.6秒だけ表示）
    if (cc.banishEarned && cc.t < 1.6) {
      const la = clamp((1.6 - cc.t) / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(fadeIn * la, 0, 1);
      this.engine.text('BANISH +1 (NO CITY LOST)', W / 2, CARD_BTN_Y + CARD_BTN_H + 10, 10, p.hi, 'center');
      ctx.restore();
    }

    ctx.restore();
    ctx.globalAlpha = 1;

    // M1対策: フロート（'POOL LIMIT'/'BANISH +1'等）は render() 冒頭で暗転の下に
    // 描かれてしまうため、カード画面の最前面にもう一度描いてフィードバックを見せる。
    this._drawFloaters(ctx, p);
    ctx.globalAlpha = 1;
  }

  // ---- カード画面の小ボタン描画（角落としフレーム＋ストロークグリフ＋残数）----
  // kind: 'reroll'（円弧矢印グリフ）| 'banish'（✕グリフ）。active=バニッシュモード中の強調。
  _drawCardBtn(ctx, p, r, kind, count, active) {
    const enabled = count > 0;
    const col = active ? p.bad : (enabled ? p.mid : p.dim);
    const cut = 6;

    ctx.save();
    ctx.globalAlpha = enabled ? 1 : 0.4; // 残数0はdim表示

    // 角落としフレーム
    ctx.beginPath();
    ctx.moveTo(r.x + cut, r.y);
    ctx.lineTo(r.x + r.w - cut, r.y);
    ctx.lineTo(r.x + r.w, r.y + cut);
    ctx.lineTo(r.x + r.w, r.y + r.h - cut);
    ctx.lineTo(r.x + r.w - cut, r.y + r.h);
    ctx.lineTo(r.x + cut, r.y + r.h);
    ctx.lineTo(r.x, r.y + r.h - cut);
    ctx.lineTo(r.x, r.y + cut);
    ctx.closePath();
    ctx.fillStyle = p.bg;
    ctx.fill();
    ctx.strokeStyle = col;
    ctx.lineWidth = active ? 2 : 1.3;
    ctx.stroke();

    // ストロークグリフ（フォント任せにせず線で描く）
    const gx = r.x + 19;
    const gy = r.y + r.h / 2;
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    if (kind === 'reroll') {
      // ⟳ 相当：3/4円弧＋矢じり
      ctx.beginPath();
      ctx.arc(gx, gy, 6, -Math.PI * 0.35, Math.PI * 1.15);
      ctx.stroke();
      const ax = gx + Math.cos(-Math.PI * 0.35) * 6;
      const ay = gy + Math.sin(-Math.PI * 0.35) * 6;
      ctx.beginPath();
      ctx.moveTo(ax - 4.5, ay - 1);
      ctx.lineTo(ax, ay);
      ctx.lineTo(ax - 1, ay + 4.5);
      ctx.stroke();
    } else {
      // ✕ 相当：2本のクロス線
      ctx.beginPath();
      ctx.moveTo(gx - 5, gy - 5); ctx.lineTo(gx + 5, gy + 5);
      ctx.moveTo(gx + 5, gy - 5); ctx.lineTo(gx - 5, gy + 5);
      ctx.stroke();
    }

    // ラベル（engine.textは現在のglobalAlphaを尊重する）
    const label = (kind === 'reroll' ? 'REROLL x' : 'BANISH x') + count;
    this.engine.text(label, r.x + 34, r.y + Math.floor(r.h / 2) - 7, 13, col, 'left');
    ctx.restore();
  }

  // ---- カード1枚の描画：角落としフレーム＋内側グロー＋六角バッジ＋2セグメント説明 ----
  // banishing=true（バニッシュモード中）はフレーム/バッジを p.bad にティントして
  // 「タップ＝除外」であることを視覚的に示す。
  _drawUpgradeCard(ctx, p, card, x, y, banishing) {
    const w = CARD_W, h = CARD_H;
    const cut = 9; // 角落とし量
    const rare = card.rarity === 'RARE';
    const rarityColor = banishing ? p.bad : (rare ? p.warn : p.mid);

    // 8点の角落としポリゴンパス
    const chamferPath = (ox, oy, ww, hh, cc2) => {
      ctx.beginPath();
      ctx.moveTo(ox + cc2, oy);
      ctx.lineTo(ox + ww - cc2, oy);
      ctx.lineTo(ox + ww, oy + cc2);
      ctx.lineTo(ox + ww, oy + hh - cc2);
      ctx.lineTo(ox + ww - cc2, oy + hh);
      ctx.lineTo(ox + cc2, oy + hh);
      ctx.lineTo(ox, oy + hh - cc2);
      ctx.lineTo(ox, oy + cc2);
      ctx.closePath();
    };

    ctx.save();
    // ベース塗り（背景色でフィールドを遮る）
    chamferPath(x, y, w, h, cut);
    ctx.fillStyle = p.bg;
    ctx.globalAlpha = 0.92;
    ctx.fill();

    // 外枠（細線、レアリティ色）
    ctx.globalAlpha = 1;
    chamferPath(x, y, w, h, cut);
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // 内側グロー（インセットした太い低アルファ線）
    chamferPath(x + 3, y + 3, w - 6, h - 6, Math.max(2, cut - 3));
    ctx.strokeStyle = rarityColor;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.globalAlpha = 1;

    // 左：六角バッジ（アウトラインのみ）
    const bx = x + 34, by = y + h / 2, br = 19;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
      const hx = bx + Math.cos(a) * br;
      const hy = by + Math.sin(a) * br;
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.restore();

    // バッジ内アイコングリフ
    this.engine.text(card.icon || '?', bx, by - 9, 18, p.fg, 'center');

    // 左上レアリティタグ／右上 NEW!（未取得）または Lv.n（取得済み）
    this.engine.text(card.rarity || 'COMMON', x + 62, y + 8, 9, rarityColor, 'left');
    const stacks = (this.run && this.run[card.id]) ? this.run[card.id] : 0;
    if (stacks === 0) {
      this.engine.text('NEW!', x + w - 12, y + 8, 9, p.warn, 'right');
    } else {
      this.engine.text('Lv.' + stacks, x + w - 12, y + 8, 9, p.dim, 'right');
    }

    // 名前（明るく）
    this.engine.text(card.name || '?', x + 62, y + 24, 16, p.hi, 'left');

    // 説明（2セグメント：地の文=fg、キーワード=レアリティ色）
    ctx.save();
    ctx.font = '12px "DotGothic16", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const dx0 = x + 62, dy0 = y + 52;
    const plain = card.descPlain || '';
    const key   = card.descKey || '';
    ctx.fillStyle = p.fg;
    ctx.fillText(plain, dx0, dy0);
    const plainW = ctx.measureText(plain).width;
    ctx.fillStyle = rare ? p.warn : p.mid;
    ctx.fillText(key, dx0 + plainW, dy0);
    ctx.restore();
  }

  // ---- ピクトグラム：旗（ステージ）----
  // (x,y) = ポール下端基準、s = サイズ。ポール+ペナントの2ストローク。
  _drawIconFlag(ctx, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y + s);
    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + s * 0.9, y + s * 0.28);
    ctx.lineTo(x, y + s * 0.56);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ---- ピクトグラム：家（都市）----
  // (x,y) = 地面基準の左下、s = サイズ。屋根三角+壁+地面線。
  _drawIconHouse(ctx, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - s * 0.5);
    ctx.lineTo(x + s * 0.5, y - s);
    ctx.lineTo(x + s, y - s * 0.5);
    ctx.lineTo(x + s, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - s * 0.15, y);
    ctx.lineTo(x + s * 1.15, y);
    ctx.stroke();
    ctx.restore();
  }

  // ---- ピクトグラム：ダイヤ（スコア）----
  // (x,y) = 中心、s = 半径。4辺の菱形アウトライン。
  _drawIconDiamond(ctx, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.lineTo(x, y + s);
    ctx.lineTo(x - s, y);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  }

  // ---- ヘキサピップ（BIG充填/未充填表示用。円塗りの代わりに細線ヘキサ）----
  _drawHexPip(ctx, cx, cy, r, color, filled) {
    ctx.save();
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
      const hx = cx + Math.cos(a) * r;
      const hy = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
    }
    ctx.closePath();
    if (filled) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.restore();
  }

  // ---- TOP HUD：ピクトグラフ圧縮ストリップ（Falltopia式・一列圧縮） ----
  // x:52..W-8（BACKボタンを避ける）、y<=48 に収める。左→右：ステージ／都市／スコア＋BEST。
  _drawTopHud(ctx, p) {
    const hudX0 = 52;
    const hudX1 = W - 8;
    const rowY  = 8;

    // ---- 左：ステージ（旗アイコン＋S番号／非NORMALはタイプ名を小さく下に）----
    this._drawIconFlag(ctx, hudX0 + 2, rowY + 2, 11, p.mid);
    this.engine.text('S' + (this._stage + 1), hudX0 + 17, rowY, 14, p.mid, 'left');
    if (this._stage >= 1 && this._stageType !== 'NORMAL') {
      this.engine.text(this._stageType, hudX0 + 2, rowY + 19, 9, p.warn, 'left');
    }

    // ---- 中央：都市（家アイコン＋生存数）----
    const cityX = hudX0 + 96;
    const aliveCount = this.cities.filter(c => c.alive).length;
    this._drawIconHouse(ctx, cityX, rowY + 13, 11, p.warn);
    this.engine.text(String(aliveCount), cityX + 16, rowY + 2, 14, p.warn, 'left');

    // ---- 右：スコア（ダイヤアイコン＋スコア、右寄せ）／その下に小さくBEST ----
    const scoreStr = 'SCORE ' + this.score;
    ctx.save();
    ctx.font = '13px "DotGothic16", monospace';
    const scoreW = ctx.measureText(scoreStr).width;
    ctx.restore();
    const diamondX = hudX1 - scoreW - 12;
    this._drawIconDiamond(ctx, diamondX, rowY + 7, 5, p.fg);
    this.engine.text(scoreStr, hudX1, rowY, 13, p.fg, 'right');
    this.engine.text('BEST ' + this.high, hudX1, rowY + 17, 9, p.dim, 'right');
  }

  // ---- コンボ表示（combo>=3 のときのみ、HUDストリップ上部中央）----
  // "xN" ＋ 残りウィンドウ時間を示す細い横バー。
  _drawComboHud(ctx, p) {
    if (!this.combo || this.combo < 3) return;
    const frac = clamp(this._comboTimer / COMBO_WINDOW, 0, 1);
    const cx   = W / 2;

    this.engine.text('x' + this.combo, cx, 8, 13, p.hi, 'center');

    const barW = 30, barH = 3;
    const barX = cx - barW / 2;
    const barY = 24;
    ctx.save();
    ctx.fillStyle = p.dark;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = p.hi;
    ctx.fillRect(barX, barY, Math.max(0, barW * frac), barH);
    ctx.restore();
  }

  // ---- 浮遊数値の描画（撃破スコア/コンボ/CITY LOST等。凍結中も描画は継続） ----
  _drawFloaters(ctx, p) {
    if (!this.floaters || this.floaters.length === 0) return;
    for (const f of this.floaters) {
      if (!f) continue;
      const alpha = clamp(1 - f.t / f.dur, 0, 1);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      this.engine.text(f.txt, f.x, f.y, f.size || 12, f.color || p.fg, 'center');
      ctx.restore();
    }
  }

  // ---- ボスHPバー（トップHUDストリップ下のスリムな第2行） ----
  // ボスが画面内に入ったとき（boss.y + boss.r > 0）のみ表示。細線アウトラインのみ、太字なし。
  _drawBossHPHud(ctx, p) {
    if (!this._bossAlive || this._bossIdx < 0) return;
    const boss = this.meteors[this._bossIdx];
    if (!boss) return;

    // ボスが画面内に入っていなければ表示しない（バグ修正）
    if (boss.y + boss.r <= 0) return;

    const hpFrac     = clamp(boss.hp / boss.maxHp, 0, 1);
    const damageFrac = 1 - hpFrac;

    // トップHUDストリップ下の第2行（y=51〜55）に細線バーのみ
    const barX = 52;
    const barY = 51;
    const barW = W - barX - 8;
    const barH = 4;

    ctx.save();
    ctx.strokeStyle = p.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);
    ctx.fillStyle = damageFrac > 0.6 ? p.bad : p.warn;
    ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * hpFrac), Math.max(0, barH - 2));
    ctx.restore();

    // 小さな1行ラベル（太字なし）
    this.engine.text('BOSS ' + boss.hp + '/' + boss.maxHp, barX, barY - 9, 8, p.dim, 'left');
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

    // ---- 背景の細線アウトラインパネル（情報内容は変更せず、見た目だけ薄く囲む）----
    let visibleRows = 0;
    if (this._scatterAmmo > 0) visibleRows++;
    if (this._launcherSlots > 2) visibleRows++;
    if (this._rapidTimer > 0) visibleRows++;
    for (let ci = 0; ci < CITY_COUNT; ci++) {
      const c = this.cities[ci];
      if (c && c.alive && c.buffs.power.length) visibleRows++;
    }
    for (let ci = 0; ci < CITY_COUNT; ci++) {
      const c = this.cities[ci];
      if (c && c.alive && c.buffs.wide.length) visibleRows++;
    }
    if (visibleRows > 0) {
      const panelH = Math.min(visibleRows, 10) * rowH + 6;
      ctx.save();
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = p.dim;
      ctx.lineWidth = 1;
      ctx.strokeRect(panelX - 2, rowY - 6, 92, panelH);
      ctx.restore();
    }

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
    // 充填=細線ヘキサ+薄塗り／未充填=細線ヘキサのみ（塗り円から差し替え）
    for (let i = 0; i < BIG_CHARGES_MAX; i++) {
      const cx = baseX + 44 + i * 18;
      const cy = baseY + 6;
      const charged = i < this._bigCharges;
      this._drawHexPip(ctx, cx, cy, 6, charged ? p.warn : p.dim, charged);
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

    // SHIELDアップグレード有効中：都市上に小さなシールドグリフ
    if (this.run && this.run.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.85;
      this.engine.text('□', ox + CITY_W - 1, oy - 16, 9, p.hi, 'right');
      ctx.restore();
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
