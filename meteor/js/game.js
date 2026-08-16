// METEOR : ゆっくり迫る隕石をミサイルで迎撃するストラテジー防衛ゲーム。
// ステージ制：序盤は1個ずつ読んで破壊、徐々に密度が上がりステージ末にボス隕石登場。
// 全都市が破壊されたらゲームオーバー。
// 各都市が発射台。MULTI/POWER/WIDE/SCATTER/RAPIDアイテムで戦力強化。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';

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

// ミサイル（P1: ペース+50% — 速く・軽快に）
const MISSILE_SPD    = 210;  // px/s（P5: 170→210、発射感をより速く）
const FIRE_COOLDOWN  = 0.36; // 発射間隔（秒、P5: 0.45→0.36）

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

// ---- 隕石速度（P1: ペース+50% — 全ティア×1.5、遅速の比率は維持）----
const METEOR_SPD_MIN      = 3;     // 旧2
const METEOR_SPD_MAX      = 7.5;   // 旧5
const METEOR_SPD_MAX_LATE = 10.5;  // 旧7

const FAST_CHANCE  = 0.10;
const FAST_SPD_MIN = 21;  // 旧14
const FAST_SPD_MAX = 36;  // 旧24

// 隕石サイズ
const METEOR_R_MIN   = 7;
const METEOR_R_MAX   = 34;
const GIANT_R_THRESH = 22;
const SMALL_R_THRESH = 10;
const LARGE_R_THRESH = 16;

// ボス隕石 — 1.2倍スケール（r≒150-185）、画面幅に収まりつつ迫力を保つ
const BOSS_R_MIN   = 150;  // 縮小（旧230→150）
const BOSS_R_MAX   = 185;  // 縮小（旧255→185）
const BOSS_SPD_MIN = 3.8;  // P1ペース+50%（旧2.5）
const BOSS_SPD_MAX = 5.7;  // P1ペース+50%（旧3.8）
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
// ---- P4 追加ドロップ ----
// 'SHOCK'  : shockLevel +1（衝撃波の発生源。フロート 'SHOCK+'）
// 'HOMING' : 誘導弾 +3
// 'BARRIER': 全生存都市に+1シールドチャージ（上限2）
// 'ZAP'    : 即時無料ZAPバースト（対象なしなら$フォールバック）
// 重みはほぼ均等（配列から一様抽選）。
const ITEM_TYPES = ['MULTI', 'POWER', 'WIDE', 'SCATTER', 'RAPID', 'SHOCK', 'HOMING', 'BARRIER', 'ZAP'];
// アイテム隕石上のラベル（1〜2文字。SCATTERとSHOCKの'S'衝突を避ける）
const ITEM_LABELS = { SHOCK: 'SK', HOMING: 'H', BARRIER: 'B', ZAP: 'Z' };

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
  { id: 'shock',  name: 'SHOCKWAVE',    icon: '◉', rarity: 'RARE',   descPlain: '衝撃波を有効化 半径 ', descKey: '+20' },
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
const SHOCK_BASE_R         = 100;   // 衝撃波の基本半径（P4: 140→100、ローカルな爆風に）
const SHOCK_R_PER_STACK    = 20;

// ---- SHOCKWAVE 再設計（P4: 強すぎ・無限連鎖・画面外キルのユーザーフィードバック対応）----
// 発生は確率制＋世代減衰：spawnChance = BASE × DECAY^gen（gen0=55%, gen1≒19%, gen2≒6.7%…）
// 幾何減衰で伝播は自然に窒息するが、安全のため gen<=SHOCK_GEN_CAP を超えては絶対に発生しない。
const SHOCK_SPAWN_BASE  = 0.55;
const SHOCK_GEN_DECAY   = 0.35;
const SHOCK_GEN_CAP     = 4;
// ★フリーズ対策（P5）：衝撃波の同時存在上限／処理落ち検知しきい値／全爆発の同時上限
const SHOCK_MAX_ACTIVE  = 3;     // 同時に存在できる衝撃波爆発
const HEAVY_FRAME_DT    = 0.05;  // これより長いフレーム(=20fps未満)では新規連鎖/衝撃波を抑制
const MAX_ACTIVE_BLASTS = 24;    // 全爆発の同時上限（超えた分は最古からフェードへ）
// 影響も確率制：shock爆発が隕石に重なった時のみ確率で1ダメージ。
// ロールは blast×meteor ごとに1回だけ（失敗してもヒット済み扱い＝毎フレーム再ロールしない）。
const SHOCK_AFFECT_BASE = 0.30;
const SHOCK_AFFECT_PER_LEVEL = 0.08;
const SHOCK_AFFECT_MAX  = 0.80;

// ---- 画面外ガード（P4: すべての爆発は「画面に入った」隕石しか傷つけない）----
// y がこの値以下の隕石（アイテム隕石含む）はどの種類の爆発でもダメージ/取得の対象外。
const OFFSCREEN_SAFE_Y  = -6;

// ---- CHAIN抑制（P1: 連鎖が盤面を全消ししないためのハードリミット）----
// ・chainDepth>=2 の爆発によるキルは以後連鎖しない（最大カスケード深度2）
// ・半径は深度ごとに×0.65で減衰（ダメージは1のまま）
// ・1つのルート爆発から派生する連鎖爆発は合計3個まで（共有カウンタで管理）
const CHAIN_MAX_DEPTH    = 2;
const CHAIN_R_DECAY      = 0.65;
const CHAIN_MAX_PER_ROOT = 3;

// ---- $ エコノミー（P1: スコアと独立した通貨。ラン内のみ、保存しない）----
const MONEY_SMALL  = 1;   // 小型隕石（HP1-2）
const MONEY_MEDIUM = 2;   // 中型隕石（HP3）
const MONEY_GIANT  = 4;   // 巨大隕石（HP4）
const MONEY_BOSS   = 25;  // ボス
const MONEY_ITEM   = 3;   // アイテム取得
// ステージクリア: +10 + stage*2 $（使用箇所で計算）

// ---- 自動タレット（P1: セミオート化の核。$で購入、ラン内のみ）----
const TURRET_MAX           = 3;
const TURRET_XS            = [70, 180, 290];
const TURRET_Y             = GROUND_Y - CITY_H - 14; // 都市ラインの~14px上に浮くポッド
const TURRET_CD_BASE       = 1.7;   // 秒
const TURRET_CD_LEVEL_MULT = 0.88;  // レベルごと-12%
const TURRET_CD_MIN        = 0.8;   // 下限
const TURRET_MISSILE_SPD   = 200;
const TURRET_BLAST_R       = BLAST_GROW * 0.8; // 固定小半径（WIDE/ラン補正なし）
const TURRET_AIM_NOISE     = 18;    // 迎撃点の照準ノイズ±px（P4: 12→18、少し漏らす＝手動の価値）
// タレットキル: $は満額 / スコア半減 / コンボ・REROLL加算なし（精密操作の経済は手動専用）

// ---- ライブショップ（P1: The Tower式、プレイ中に開く下部ドロワー。P4: 3列×4行=12項目）----
const SHOP_PANEL_H       = 210;  // P4: 180→210（4行分）
const SHOP_COLS          = 3;
const SHOP_TAB_W         = 130;
const SHOP_TAB_H         = 18;
const SHOP_TURRET_PRICES = [60, 140, 300];
const SHOP_TLV_BASE      = 45;   // ×(1+0.6×購入回数)
const SHOP_RELOAD_BASE   = 35;   // ×1.6^n、効果: 手動CD×0.9
const SHOP_RADIUS_BASE   = 40;   // ×1.6^n、効果: 手動爆発半径×1.1
const SHOP_BIG_PRICE     = 50;   // フラット
const SHOP_REPAIR_BASE   = 120;  // ×1.8^n（即時復旧＝プレミアム。REBUILDは安価な時間払い）
// ---- P4 新ショップ項目 ----
const SHOP_SHOCK_BASE    = 55;   // ×1.6^n、効果: shockLevel +1
const SHOP_HOMING_PRICE  = 45;   // フラット（消耗品: 誘導弾×3）
const SHOP_ZAP_PRICE     = 70;   // フラット（即時: チェーンライトニング）
const SHOP_DRONE_PRICE   = 90;   // フラット（同時1機まで、30秒）
const SHOP_BARRIER_BASE  = 85;   // ×1.5^n、効果: 全生存都市に+1シールドチャージ
const SHOP_REBUILD_PRICE = 70;   // フラット（20秒かけて都市1つを段階的復元）

// ---- HOMING（誘導弾: 消耗品。手動ミサイルのみ消費、タレット/ドローン弾は対象外）----
const HOMING_PER_PURCHASE = 3;
const HOMING_TURN_RATE    = 2.2;  // rad/s（緩やかな旋回、速度は不変）

// ---- ZAP（電気ショック: 画面内の隕石 最大5体に即時1ダメージ）----
const ZAP_MAX_TARGETS = 5;
const ZAP_BOLT_SEC    = 0.35; // 稲妻ポリラインの表示時間

// ---- DRONE（味方機: y~140を巡回、ミニタレット射撃、30秒で離脱）----
const DRONE_DURATION = 30;
const DRONE_CD       = 1.4;
const DRONE_DMG      = 1;
const DRONE_Y        = 140;

// ---- BARRIER（都市バリア: 都市ごとのシールドチャージ、上限2）----
const CITY_SHIELD_CAP = 2;

// ---- REBUILD（段階的復元: 20秒で都市1つを復活。再建中に被弾すると進捗0にリセット）----
const REBUILD_SEC = 20;

// ---- ボス死亡＝破片の雨（P4: 終末感。ボス撃破で実体の破片隕石が降る）----
// P5: 破片の「量・大きさ・速さ」を難易度（ステージ）に合わせて上げる。
// 個数 = BASE + stage*PER_STAGE（上限CAP）、半径上限は stage で伸び、速度倍率も上がる。
const BOSS_FRAG_BASE       = 6;
const BOSS_FRAG_PER_STAGE  = 1.5;  // ステージごとの追加個数
const BOSS_FRAG_CAP        = 16;   // 上限（旧10）
const BOSS_FRAG_R_MIN      = 6;
const BOSS_FRAG_R_MAX      = 13;   // ステージ0の上限半径。+1/stage で最大22（＝巨大級）まで
const BOSS_FRAG_R_MAX_CAP  = 22;
const BOSS_FRAG_SPD_MIN    = 1.1;  // 通常速×（stageで+0.08ずつ、上限2.2）
const BOSS_FRAG_SPD_RANGE  = 0.4;
const BOSS_FRAG_Y_MAX = 180;  // 破片の出現Y上限（死亡位置がこれより下ならそのまま）

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
  // P1ペース+50%: 波の間隔を~×0.75に圧縮（ボス到達も少し早く）
  // P4: さらに全体密度+15%（×0.87）。無操作放置で8.9分生存できた受動性を潰す。
  let baseDelay  = Math.max(3.5 - stage * 0.25, 1.1) * 0.75 * 0.87;
  let bossT      = 58 + stage * 3;
  let itemChance = Math.min(0.08 + stage * 0.025, 0.22);

  if (stageType === 'SWARM') { baseDelay *= 0.5; bossT = 44 + stage * 2.5; }
  if (stageType === 'FAST')  { bossT = 48 + stage * 2.5; }
  if (stageType === 'CHAOS') { baseDelay *= 0.65; bossT = 46 + stage * 2.5; }

  // P4: ステージ0の序盤の長い間延びをカット（最初の波は~2.5秒以内、ボスは~45秒）
  if (stage === 0) { baseDelay *= 0.7; bossT = 45; }

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
    const minGap = stageType === 'SWARM' ? 0.4 : 0.7; // P1: ×~0.75
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

// ---- 背景の星（明滅ツインクル用の事前生成配列）----
// enter() で1回だけ生成（毎フレーム生成しない）。alphaは render 側で sin 振動させる。
const STAR_COUNT = 46;
function makeStarfield() {
  const stars = [];
  for (let i = 0; i < STAR_COUNT; i++) {
    stars.push({
      x: Math.random() * W,
      y: Math.random() * (GROUND_Y - 4),
      r: 0.6 + Math.random() * 1.5,
      phase: Math.random() * Math.PI * 2,
      speed: 0.6 + Math.random() * 1.4,
      baseA: 0.35 + Math.random() * 0.45,
    });
  }
  return stars;
}

// ---- 都市のシルエット生成（ネオン・シティスカイライン）----
// 都市ごとに固定シードでビル矩形クラスタ＋点灯窓を生成。毎フレーム生成しないよう
// 事前作成する（都市ローカル座標、左上=0,0、右下=CITY_W,CITY_H）。
function makeCityProfile(idx) {
  const seed = idx * 137 + 29;
  const n    = 3 + (seed % 2); // 3〜4棟のビルクラスタ
  const pad  = 2;
  const totalW = CITY_W - pad * 2;
  const bw = totalW / n;
  const buildings = [];
  for (let i = 0; i < n; i++) {
    const hSeed = (seed * 7 + i * 13 + i * i * 5) % (CITY_H - 6);
    const h = 7 + hSeed;
    buildings.push({
      x: pad + i * bw,
      y: CITY_H - h,
      w: Math.max(3, bw - 2),
      h,
    });
  }
  // 点灯窓：1〜2棟の頂部近くに小さな輝点
  const windows = [];
  const wCount = 1 + (seed % 2);
  for (let i = 0; i < wCount; i++) {
    const b = buildings[(seed + i * 5) % buildings.length];
    windows.push({ x: b.x + b.w * 0.5, y: b.y + Math.min(5, b.h * 0.35) });
  }
  return { buildings, windows };
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

// ---- レトロ・ピクセルスペックル爆発（Missile Command 風、P4で復活）----
// P2のネオンリング＋パーティクル爆発は迫力不足のフィードバックを受けて廃止し、
// MICRO ARCADE版の「コース8pxセル全面フラッシュ」方式を移植した。
// ・爆発の現在半径をラフなジッター縁の8pxセル塊で塗りつぶす
// ・塊全体が1〜2フレームごとに1色でビビッドに明滅（白多め＝ストロボ白に見える）
// ・blast.kind ごとにベースの色ミックスをバイアス（manual/big/chain/shock/turret）
// RADIUS/DAMAGE等の判定は既存の blast.r / maxR / growing / fadeTimer をそのまま
// 使うため不変（描画だけが変わる）。

// 高速シードPRNG（xorshift32相当の整数ハッシュ）。セルジッター・色サイクルを
// 配列を持たず毎フレーム決定論的に算出するために使う（GC負荷なし）。
function _speckleRand(cx, cy, blastId, tick) {
  let h = (cx * 2246822519) ^ (cy * 3266489917) ^ (blastId * 668265263) ^ (tick * 374761393);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return (h & 0xffff) / 0x10000; // 0〜0.9999...
}

// セルサイズ（論理px）— 大きいほどブロッキーでレトロらしい
const _CELL = 8;

// スペックル色セット（各14色）。白3＋黒3で高コントラストのストロボ、残りをkindごとにバイアス。
// manual: 中立ビビッドミックス（オリジナル準拠）
const _SPECKLE_MANUAL = [
  '#ffffff', '#ffffff', '#ffffff',
  '#00ff88', '#ff00ff', '#00ffff', '#ffff00', '#ff4400', '#ff9900', '#4466ff',
  '#000000', '#000000', '#000000',
  '#ffffff',
];
// big: 琥珀/白バイアス（緑・青・マゼンタを琥珀系に差し替え）
const _SPECKLE_BIG = [
  '#ffffff', '#ffffff', '#ffffff',
  '#ffcc44', '#ffffff', '#ffe08a', '#ffff00', '#ff4400', '#ff9900', '#ffaa22',
  '#000000', '#000000', '#000000',
  '#ffffff',
];
// chain: ピンク/マゼンタバイアス
const _SPECKLE_CHAIN = [
  '#ffffff', '#ffffff', '#ffffff',
  '#ff5cd0', '#ff00ff', '#ff88ee', '#ffff00', '#ff4400', '#ff5cd0', '#4466ff',
  '#000000', '#000000', '#000000',
  '#ffffff',
];
// shock: 紫/青バイアス
const _SPECKLE_SHOCK = [
  '#ffffff', '#ffffff', '#ffffff',
  '#b06bff', '#8866ff', '#00ffff', '#4466ff', '#b06bff', '#6644ff', '#4466ff',
  '#000000', '#000000', '#000000',
  '#ffffff',
];
// turret: 暗めのミックス（純白を落とし、暗色を足す＝自動砲は控えめ）
const _SPECKLE_TURRET = [
  '#9fb8cc', '#9fb8cc', '#556677',
  '#00cc77', '#cc00cc', '#00cccc', '#cccc00', '#cc4400', '#cc7700', '#3355cc',
  '#000000', '#000000', '#000000',
  '#556677',
];
const _SPECKLE_COLOR_COUNT = _SPECKLE_MANUAL.length; // 14（全kind共通）

// blast.kind → 色配列
function _speckleColorsFor(kind) {
  switch (kind) {
    case 'big':    return _SPECKLE_BIG;
    case 'chain':  return _SPECKLE_CHAIN;
    case 'shock':  return _SPECKLE_SHOCK;
    case 'turret': return _SPECKLE_TURRET;
    default:       return _SPECKLE_MANUAL;
  }
}

// 全爆発をスペックルで描画（source-over のみ、XOR合成なし）
// mainCtx: メインCanvas2Dコンテキスト（論理座標系）
// blasts: アクティブ爆発オブジェクト配列
// frameCount: インクリメントカウンタ（色フリッカー用）
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
    const colors  = _speckleColorsFor(b.kind);
    const cidx    = (_speckleRand(id, 7, 13, frameCount) * _SPECKLE_COLOR_COUNT) | 0;
    const fillCol = colors[cidx];

    // ★負荷対策：セルサイズを半径に応じて粗くし、fillRect回数を半径によらずほぼ一定に保つ
    //   （r<=48: 8px / r<=96: 12px / それ以上: 16px）。大爆発ほど粗いドット＝迫力も出る。
    const CELL = r <= 48 ? _CELL : (r <= 96 ? 12 : 16);
    // グリッドをブラスト中心から±r の矩形に限定し、さらに画面内セルへクランプ
    //（完全に画面外のセルはスキップ）
    const x0 = Math.max(0, Math.floor((bx - r) / CELL));
    const x1 = Math.min(Math.ceil((bx + r) / CELL), Math.ceil(W / CELL));
    const y0 = Math.max(0, Math.floor((by - r) / CELL));
    const y1 = Math.min(Math.ceil((by + r) / CELL), Math.ceil(H / CELL));

    mainCtx.save();
    mainCtx.globalCompositeOperation = 'source-over';
    mainCtx.globalAlpha = clamp(alpha, 0, 1);
    mainCtx.fillStyle = fillCol;

    const r2 = r * r;
    for (let gy = y0; gy <= y1; gy++) {
      const cy = gy * CELL + CELL * 0.5;
      const dy = cy - by;
      const dy2 = dy * dy;
      if (dy2 > r2 * 1.21) continue; // 行ごと早期打ち切り

      for (let gx = x0; gx <= x1; gx++) {
        const cx = gx * CELL + CELL * 0.5;
        const dx = cx - bx;
        const d2 = dx * dx + dy2;
        if (d2 > r2 * 1.21) continue;            // 明らかな外側は即スキップ（ハッシュ計算しない）
        if (d2 > r2 * 0.77) {                    // 縁の帯だけジッター判定（内側は無条件で塗る）
          const jitter = 0.88 + 0.22 * _speckleRand(gx * 7 + 3, gy * 5 + 1, id, 0);
          const effectiveR = r * jitter;
          if (d2 > effectiveR * effectiveR) continue;
        }

        mainCtx.fillRect(gx * CELL, gy * CELL, CELL, CELL);
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

    // 背景の明滅する星（事前生成、毎フレーム生成しない）
    this._stars = makeStarfield();

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

    // 都市: alive flag + バフスタック + バリアチャージ（P4: BARRIER購入/ドロップで+1、上限2）
    this.cities = Array.from({ length: CITY_COUNT }, () => ({
      alive: true,
      buffs: makeCityBuffs(),
      shield: 0,
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

    // ---- $ エコノミー（P1: スコアと独立。ラン内のみ）----
    this.money = 0;

    // ---- 自動タレット（P1: $で購入、最大3。ラン内のみ・保存しない）----
    this.turrets = []; // [{x,y,cooldown,level,flash,lastTx,lastTy}]

    // ---- ライブショップ（P1: プレイ中に開ける下部ドロワー）----
    this.shopOpen   = false;
    this._shopSlide = 0; // 0..1 スライドアニメーション
    this.shop = {
      lv: 0,      // TURRET LV+ 購入回数（価格計算用）
      reload: 0,  // RELOAD- 購入回数
      radius: 0,  // RADIUS+ 購入回数
      repair: 0,  // REPAIR CITY 購入回数
      shock: 0,   // SHOCK+ 購入回数（P4）
      barrier: 0, // BARRIER 購入回数（P4）
    };
    this._shopCdMult     = 1; // RELOAD- の累積（手動CDに乗算）
    this._shopRadiusMult = 1; // RADIUS+ の累積（手動爆発半径に乗算）

    // ---- P4 新システムの状態（すべてラン内のみ・保存しない）----
    this.shockLevel  = 0;    // 衝撃波レベル（SHOCK+購入/SHOCKドロップで+1。>0で衝撃波が有効）
    this.homingAmmo  = 0;    // 誘導弾残数（手動ミサイルのみ消費）
    this.drone       = null; // 味方ドローン（同時1機）{x,y,t,cooldown,phase,flash}
    this._zapBolts   = [];   // ZAP稲妻の描画データ [{pts:[{x,y}...], t}]
    this._rebuild    = null; // 段階的復元の進行状態 {cityIdx, t} | null
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
    // ショップの RADIUS+（×1.1/購入）も手動爆発半径に乗算（タレット爆発は固定半径で対象外）
    return (1 + RUN_RADIUS_PER_STACK * n) * (this._shopRadiusMult || 1);
  }

  _runMissileSpd() {
    const n = this.run ? (this.run.mspd | 0) : 0;
    return MISSILE_SPD * (1 + RUN_MSPD_PER_STACK * n);
  }

  _runCooldown(base) {
    const n = this.run ? (this.run.cd | 0) : 0;
    // ショップの RELOAD-（×0.9/購入）も乗算。下限 RUN_CD_MIN は据え置き。
    return Math.max(RUN_CD_MIN, base * Math.pow(RUN_CD_MULT, n) * (this._shopCdMult || 1));
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
      // ---- ショップタブ（開閉トグル。閉時は最下端、開時はパネル上端に張り付く）----
      const tr = this._shopTabRect();
      if (data.x >= tr.x && data.x <= tr.x + tr.w && data.y >= tr.y && data.y <= tr.y + tr.h) {
        this.shopOpen = !this.shopOpen;
        this.engine.audio.select();
        return;
      }

      // ---- ショップ：可視パネル領域のタップを吸収（開閉アニメ中含む）----
      // P3レビューD1対策: 描画は _shopSlide でスライドするがヒット矩形は全開位置基準のため、
      // 全開（slide>0.98）時のみ購入を受け付ける。スライド途中の誤購入と、
      // 閉じアニメ中にパネルを突き抜けてミサイル発射される事故を防ぐ。
      {
        const shopSlide = this._shopSlide || 0;
        if (this.shopOpen || shopSlide > 0.02) {
          const visibleTop = H - SHOP_PANEL_H * shopSlide;
          if (data.y >= visibleTop) {
            if (this.shopOpen && shopSlide > 0.98) this._shopTap(data.x, data.y);
            return; // パネル上のタップは常に吸収（発射しない）
          }
          if (this.shopOpen) {
            this.shopOpen = false; // 外タップで閉じる（発射しない）
            return;
          }
          // 閉じアニメ中の上部タップは通常入力へフォールスルー
        }
      }

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
    // タレットの自動ミサイルは手動の同時飛翔上限を消費しない
    const activeCount = this.missiles.filter(m => !m.done && !m.auto).length;
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

    // P4 HOMING: 残弾がある間、手動ミサイルは1発ごとに1消費して誘導弾になる
    //（タレット/ドローンの自動弾はこの関数を通らないため絶対に消費しない）
    const useHoming = this.homingAmmo > 0;
    if (useHoming) this.homingAmmo = Math.max(0, this.homingAmmo - 1);

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
      homing: useHoming, // 誘導弾フラグ（P4）
      aimX: tx, aimY: ty, // 元の照準点（誘導ターゲット選択の基準）
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
    this._lastDt = dt; // 処理落ち検知用（衝撃波/連鎖の抑制判定に使う）

    // ★フリーズ対策：全爆発の同時上限。超過分は最古の爆発を即フェード（成長を止める）
    if (this.blasts && this.blasts.length > MAX_ACTIVE_BLASTS) {
      let over = this.blasts.length - MAX_ACTIVE_BLASTS;
      for (let i = 0; i < this.blasts.length && over > 0; i++) {
        const b = this.blasts[i];
        if (b && b.growing) { b.growing = false; over--; }
      }
    }

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
      // ZAP稲妻の残像も凍結中に消化する（描画装飾のみ、ゲームロジックには無関係）
      this._updateZapBolts(dt);
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

    // ショップドロワーのスライド（dtベース、0..1へ収束）
    {
      const target = this.shopOpen ? 1 : 0;
      const step   = clamp(target - this._shopSlide, -dt * 6, dt * 6);
      this._shopSlide = clamp(this._shopSlide + step, 0, 1);
    }

    // ---- 自動タレット（ゲームは止まらない＝ショップ開放中も発射する）----
    this._updateTurrets(dt);

    // ---- P4: ドローン／段階的復元／ZAP稲妻 ----
    this._updateDrone(dt);
    this._updateRebuild(dt);
    this._updateZapBolts(dt);

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
      // P1修正: filter(Boolean)は常に5を返すバグだったため alive を数える
      //（REPAIR CITYで生存数が変わる経済と正しく連動させる）
      const aliveCities = this.cities.filter(c => c && c.alive).length;
      const cityBonus   = CITY_CLEAR_BONUS * aliveCities;
      // OVERDRIVE（残り1都市）で耐え切ってクリアした時だけの一括報酬＝逆転設計
      const odBonus     = this.overdrive ? OVERDRIVE_CLEAR_BONUS : 0;
      const bonus = 100 + clearedStage * 50 + cityBonus + odBonus;
      this.score += bonus;
      if (cityBonus > 0) this._float(W / 2, H / 2 + 44, 'CITIES +' + cityBonus, p.mid, 12);
      if (odBonus > 0)   this._float(W / 2, H / 2 + 24, 'OVERDRIVE +' + odBonus, p.warn, 14);

      // ---- $ ステージクリアボーナス（+10 + stage*2）----
      const moneyBonus = 10 + clearedStage * 2;
      this.money += moneyBonus;
      this._float(W / 2, H / 2 + 84, '+' + moneyBonus + '$', p.green, 12);

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
      // カード中はショップを閉じる（凍結中に開いたままにしない）
      this.shopOpen   = false;
      this._shopSlide = 0;
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
      // P4: オプションの水平ドリフト vx（ボス破片用。無指定は0＝従来通り）
      m.x += dx * ratio * dt + (m.vx || 0) * dt;
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

      // ---- P4 HOMING: 照準点に最も近い画面内隕石へ緩やかに旋回（速度は不変）----
      if (ms.homing && !ms.auto) {
        let best = null, bestD = Infinity;
        const ax = ms.aimX != null ? ms.aimX : ms.tx;
        const ay = ms.aimY != null ? ms.aimY : ms.ty;
        for (const m of this.meteors) {
          if (!m || m.y <= OFFSCREEN_SAFE_Y) continue; // 画面外は狙わない
          const d = Math.hypot(m.x - ax, m.y - ay);
          if (d < bestD) { bestD = d; best = m; }
        }
        if (best) {
          const spd  = ms.spd || MISSILE_SPD;
          const cur  = Math.atan2(ms.vy, ms.vx);
          const want = Math.atan2(best.y - ms.y, best.x - ms.x);
          let dA = want - cur;
          while (dA >  Math.PI) dA -= Math.PI * 2;
          while (dA < -Math.PI) dA += Math.PI * 2;
          dA = clamp(dA, -HOMING_TURN_RATE * dt, HOMING_TURN_RATE * dt);
          const na = cur + dA;
          ms.vx = Math.cos(na) * spd;
          ms.vy = Math.sin(na) * spd;
          // 起爆点をターゲット現在位置に追従させる（到達判定と爆心が一致する）
          ms.tx = best.x;
          ms.ty = best.y;
        }
      }

      ms.x += ms.vx * dt;
      ms.y += ms.vy * dt;
      const ddx = ms.tx - ms.x;
      const ddy = ms.ty - ms.y;
      if (Math.hypot(ddx, ddy) < (ms.spd || MISSILE_SPD) * dt * 1.5 + 4) {
        if (ms.auto) {
          // タレット弾：固定小半径・バフ非適用・auto印付き爆発
          this._spawnTurretBlast(ms.tx, ms.ty, ms.dmg || 1);
        } else {
          this._spawnBlast(ms.tx, ms.ty, ms.big, false, ms.scatter, ms.cityIdx);
        }
        ms.done = true;
      }
    }

    // 爆発更新 — grow then FADE
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (!b) { this.blasts.splice(i, 1); continue; }
      // 描画専用：発生からの経過秒（ネオンポップのパーティクル/コアフラッシュ寿命に使用。
      // ダメージ・半径・タイミング判定には一切使わない）
      b.age = (b.age || 0) + dt;

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
        // ---- P4 画面外ガード：まだ画面に入っていない隕石（y<=-6）はどの爆発でも
        //      傷つけない（アイテム隕石含む）。ヒット記録もしない＝入場後に改めて判定できる。
        if (m.y <= OFFSCREEN_SAFE_Y) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + m.r) continue;
        if (m.hitBlastIds.has(b.id)) continue;
        m.hitBlastIds.add(b.id);

        // ---- P4 SHOCKWAVE 影響ロール：shock爆発は確率でのみダメージを与える ----
        // 失敗してもヒット済み（hitBlastIds登録済み）＝この blast×meteor で再ロールしない。
        if (b.kind === 'shock') {
          const chance = clamp(
            SHOCK_AFFECT_BASE + SHOCK_AFFECT_PER_LEVEL * (this.shockLevel | 0),
            0, SHOCK_AFFECT_MAX
          );
          if (Math.random() >= chance) continue;
        }

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
          // ---- タレットキル判定（コンボ/REROLLは手動専用、スコア半減、$は満額）----
          const isAuto = !!b.auto;

          // ---- コンボ更新（2秒ウィンドウ内の連続撃破。このキル自身も1カウント）----
          // タレットキルはコンボを加算しない＝コンボ倍率も乗らない（手動精密の経済を守る）
          let comboMult = 1;
          if (!isAuto) {
            this._comboTimer = COMBO_WINDOW;
            this.combo = (this.combo | 0) + 1;
            comboMult = Math.min(1 + COMBO_SCORE_STEP * this.combo, COMBO_MULT_CAP);

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
          }

          if (m.boss) {
            this._handleBossDeath(m, { isAuto, comboMult });
          } else {
            this._handleMeteorDeath(m, { isAuto, comboMult, sourceBlast: b });
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

  // ---- 現在のコンボ倍率（コンボ値は変更しない。ZAPキルのスコア計算用）----
  _currentComboMult() {
    return Math.min(1 + COMBO_SCORE_STEP * (this.combo | 0), COMBO_MULT_CAP);
  }

  // ---- ボス死亡処理（爆発ループ/ZAPの両方から呼ぶ。meteors からの splice は呼び出し側）----
  // スコア/$/フラグ/シャッター演出/破片の雨/音。P4: ボス死からの衝撃波は発生させない
  //（破片の雨が置き換える＝発生させると破片が即座に全滅するため）。
  _handleBossDeath(m, opts) {
    const o = opts || {};
    const isAuto    = !!o.isAuto;
    const comboMult = o.comboMult != null ? o.comboMult : 1;
    const p = P();
    let gain = BOSS_SCORE_BASE * (this._stage + 1);
    // COIN: 撃破ボーナススコア
    if (this.run && this.run.coin > 0) gain += RUN_COIN_PER_STACK * this.run.coin;
    gain = Math.round(gain * comboMult * (isAuto ? 0.5 : 1));
    this.score += gain;
    this._addMoney(MONEY_BOSS, m.x + 20, m.y + 16);
    this._bossAlive = false;
    this._bossIdx   = -1;
    // ボス破壊演出＋実体破片の雨（P4）
    this._spawnBossShatter(m.x, m.y, m.r);
    this._spawnBossFragments(m);
    m.flashTimer = 0; // 破壊時はフラッシュ不要
    // 撃破フロート（ボス死は大きく表示）
    this._float(m.x, m.y, '+' + gain, p.warn, 22);
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
  }

  // ---- 通常隕石の死亡処理（爆発ループ/ZAPの両方から呼ぶ。splice は呼び出し側）----
  // opts: { isAuto, comboMult, sourceBlast } — sourceBlast=null（ZAP等）は連鎖爆発なし。
  _handleMeteorDeath(m, opts) {
    const o = opts || {};
    const isAuto    = !!o.isAuto;
    const comboMult = o.comboMult != null ? o.comboMult : 1;
    const b = o.sourceBlast || null;
    const p = P();

    const sizeBonus = Math.ceil(m.maxHp);
    let gain = METEOR_SCORE_BASE * sizeBonus;
    // COIN: 撃破ごとにボーナススコア（+5/枚）
    if (this.run && this.run.coin > 0) gain += RUN_COIN_PER_STACK * this.run.coin;
    gain = Math.round(gain * comboMult * (isAuto ? 0.5 : 1));
    this.score += gain;
    // 隕石の役割色（通常=赤/高速=明色/巨大=警告色）で撃破フロート
    const floatColor = m.fast ? p.hi : (m.r >= GIANT_R_THRESH ? p.warn : p.bad);
    this._float(m.x, m.y, '+' + gain, floatColor, 12);
    // ---- $ 獲得（小=1/中=2/巨大=4。タレットキルでも満額）----
    const moneyGain = m.r >= GIANT_R_THRESH ? MONEY_GIANT
      : (m.r >= LARGE_R_THRESH ? MONEY_MEDIUM : MONEY_SMALL);
    this._addMoney(moneyGain, m.x + 16, m.y + 12);
    // CHAIN: 撃破地点に小さな連鎖爆発（ダメージ1）— P1ハード抑制付き
    // ・深度>=2の爆発によるキルは連鎖しない
    // ・半径は深度ごとに×0.65減衰
    // ・1ルート爆発あたり連鎖は合計3個まで（共有カウンタ b.chainBudget）
    // 新しい爆発は配列末尾に push され、下方向ループでは今フレーム再訪しない（安全）
    // ★処理落ち中は新規連鎖も抑制（衝撃波と同じ負荷スパイク対策）
    if (b && this.run && this.run.chain > 0 && (this._lastDt || 0) <= HEAVY_FRAME_DT) {
      const depth = b.chainDepth | 0;
      if (depth < CHAIN_MAX_DEPTH) {
        const budget = b.chainBudget || (b.chainBudget = { left: CHAIN_MAX_PER_ROOT });
        if (budget.left > 0) {
          budget.left--;
          const baseR = CHAIN_BASE_R + CHAIN_R_PER_STACK * this.run.chain;
          const r     = baseR * Math.pow(CHAIN_R_DECAY, depth);
          this._spawnExtraBlast(m.x, m.y, r, 1, false, {
            chainDepth: depth + 1,
            chainBudget: budget,
            auto: isAuto,
          });
        }
      }
    }
    // SHOCKWAVE: 巨大隕石（GIANT閾値以上）撃破で確率発生（P4: 世代減衰付き）
    if (m.r >= GIANT_R_THRESH) {
      this._maybeSpawnShockwave(m.x, m.y, b, isAuto);
    }
    this.engine.audio.good();
  }

  // ---- P4 衝撃波の確率スポーン（世代減衰）----
  // sourceBlast が shock 爆発なら次世代（gen+1）として引き継ぐ。gen>SHOCK_GEN_CAP は絶対に発生しない。
  // run.shock===0 でも shockLevel>0 なら基本半径で発生する（shockLevel 単独で有効化）。
  _maybeSpawnShockwave(x, y, sourceBlast, isAuto) {
    const stacks   = this.run ? (this.run.shock | 0) : 0;
    const hasShock = stacks > 0 || (this.shockLevel | 0) > 0;
    if (!hasShock) return false;
    const gen = (sourceBlast && sourceBlast.kind === 'shock')
      ? ((sourceBlast.shockGen | 0) + 1)
      : 0;
    if (gen > SHOCK_GEN_CAP) return false; // 安全キャップ（幾何減衰で実際はここまで届かない）
    // ★フリーズ対策：同時に存在できる衝撃波は SHOCK_MAX_ACTIVE 個まで（描画・判定コストの暴走を物理的に封じる）
    let activeShock = 0;
    for (const b of this.blasts) if (b && b.kind === 'shock') activeShock++;
    if (activeShock >= SHOCK_MAX_ACTIVE) return false;
    // ★処理落ち中（前フレームが長い）は新規衝撃波を発生させない＝負荷スパイクの正帰還を切る
    if ((this._lastDt || 0) > HEAVY_FRAME_DT) return false;
    const chance = SHOCK_SPAWN_BASE * Math.pow(SHOCK_GEN_DECAY, gen);
    if (Math.random() >= chance) return false;
    const r = SHOCK_BASE_R + SHOCK_R_PER_STACK * stacks;
    this._spawnExtraBlast(x, y, r, 1, true, { auto: isAuto, kind: 'shock', shockGen: gen });
    return true;
  }

  // ---- P4 ボス死亡＝破片の雨 ----
  // 6+stage（上限10）個の r6..13 破片をボスの横幅に散らして実体隕石として降らせる。
  // 速度は通常速の×1.1〜1.5、わずかな水平ドリフト vx 付き。通常隕石なので撃破可能・
  // $ドロップあり・都市を直撃しうる。ステージクリアは全破片の処理を自然に待つ。
  _spawnBossFragments(m) {
    // 難易度スケーリング：個数・最大半径・速度がステージで上昇（終末感が段階的に増す）
    const st    = Math.max(0, this._stage | 0);
    const count = Math.min(Math.round(BOSS_FRAG_BASE + st * BOSS_FRAG_PER_STAGE), BOSS_FRAG_CAP);
    const rMax  = Math.min(BOSS_FRAG_R_MAX + st, BOSS_FRAG_R_MAX_CAP);
    const spdLo = Math.min(BOSS_FRAG_SPD_MIN + st * 0.08, 2.2);
    const fy    = Math.min(m.y, BOSS_FRAG_Y_MAX);
    for (let i = 0; i < count; i++) {
      const fr   = BOSS_FRAG_R_MIN + Math.random() * (rMax - BOSS_FRAG_R_MIN);
      const fx   = clamp(
        m.x - m.r * 0.85 + ((i + 0.5) / count) * m.r * 1.7 + (Math.random() * 2 - 1) * 8,
        8, W - 8
      );
      const spd  = this._calcNormalSpd() * (spdLo + Math.random() * BOSS_FRAG_SPD_RANGE);
      const seed = _nextMeteorSeed++;
      const hp   = calcMeteorHP(fr);
      this.meteors.push({
        x: fx, y: fy + (Math.random() * 2 - 1) * 10,
        tx: 18 + Math.random() * (W - 36), ty: GROUND_Y,
        spd, r: fr,
        vx: (Math.random() * 2 - 1) * 18, // わずかな水平ドリフト
        hp, maxHp: hp,
        fast: false,
        boss: false,
        isItem: false,
        itemType: null,
        trail: [],
        rot: Math.random() * Math.PI * 2,
        verts: makeRockVerts(fr, seed),
        seed,
        hitBlastIds: new Set(),
        flashTimer: 0,
      });
    }
  }

  // ---- P4 ZAP（電気ショック）：画面内の隕石 最大5体に即時1ダメージ ----
  // キルは「手動スコア満額・コンボ変化なし・$満額」（フリーコンボ防止のためコンボ非加算）。
  // 稲妻はランダムな画面上端の点からターゲットを貫くギザギザポリラインで~0.35秒表示。
  // 戻り値: ヒットした隕石数（0=対象なし）。
  _doZap() {
    const ox = 30 + Math.random() * (W - 60);
    const oy = 0;
    // 画面内（y>-6）の隕石を稲妻起点からの距離でソートし、近い順に最大5体
    const cands = [];
    for (const m of this.meteors) {
      if (!m || m.y <= OFFSCREEN_SAFE_Y) continue;
      cands.push({ m, d: Math.hypot(m.x - ox, m.y - oy) });
    }
    cands.sort((a, b) => a.d - b.d);
    const picks = cands.slice(0, ZAP_MAX_TARGETS).map(c => c.m);
    if (picks.length === 0) return 0;

    // 稲妻ポリライン（中間点をジッターさせて生成、描画は _drawZapBolts）
    const pts = [{ x: ox, y: oy }];
    for (const m of picks) pts.push({ x: m.x, y: m.y });
    const jag = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
      const a = jag[jag.length - 1];
      const c = pts[i];
      jag.push({
        x: (a.x + c.x) / 2 + (Math.random() * 2 - 1) * 14,
        y: (a.y + c.y) / 2 + (Math.random() * 2 - 1) * 14,
      });
      jag.push(c);
    }
    if (!this._zapBolts) this._zapBolts = [];
    this._zapBolts.push({ pts: jag, t: ZAP_BOLT_SEC });

    // ダメージ適用（コンボは読み取りのみ＝現在の倍率でスコア満額、コンボ値は不変）
    const comboMult = this._currentComboMult();
    for (const m of picks) {
      m.hp -= 1;
      m.flashTimer = 0.13;
      if (m.hp > 0) continue;
      const j = this.meteors.indexOf(m);
      if (j < 0) continue;
      if (m.isItem) {
        this._collectItem(m, -1);
      } else if (m.boss) {
        this._handleBossDeath(m, { isAuto: false, comboMult });
      } else {
        this._handleMeteorDeath(m, { isAuto: false, comboMult, sourceBlast: null });
      }
      if (this._bossIdx === j)     { this._bossAlive = false; this._bossIdx = -1; }
      else if (this._bossIdx > j)  { this._bossIdx--; }
      this.meteors.splice(j, 1);
    }

    // ZAP音（高音の短いジッパー）
    this.engine.audio.sequence([
      { freq: 1760, dur: 0.04, type: 'square', vol: 0.16 },
      { freq: 1320, dur: 0.04, type: 'square', vol: 0.14 },
      { freq: 1980, dur: 0.06, type: 'square', vol: 0.16 },
    ]);
    return picks.length;
  }

  // ---- P4 ZAP稲妻の寿命更新（通常時・カード凍結中の両方から呼ぶ＝描画装飾のみ）----
  _updateZapBolts(dt) {
    if (!this._zapBolts) { this._zapBolts = []; return; }
    for (let i = this._zapBolts.length - 1; i >= 0; i--) {
      const z = this._zapBolts[i];
      if (!z) { this._zapBolts.splice(i, 1); continue; }
      z.t -= dt;
      if (z.t <= 0) this._zapBolts.splice(i, 1);
    }
  }

  // ---- P4 ドローン更新（巡回＋ミニタレット射撃＋30秒で離脱）----
  // キル経済はタレットと同一（弾に auto:true → スコア半減・コンボなし・$満額）。
  _updateDrone(dt) {
    const d = this.drone;
    if (!d) return;
    d.t -= dt;
    if (d.t <= 0) {
      this._float(d.x, d.y, 'DRONE OUT', P().dim, 9);
      this.drone = null;
      return;
    }
    d.phase += dt;
    d.x = W / 2 + Math.sin(d.phase * 0.7) * 120;  // 水平サインドリフト
    d.y = DRONE_Y + Math.sin(d.phase * 1.7) * 6;
    if (d.flash > 0) d.flash = Math.max(0, d.flash - dt);
    d.cooldown -= dt;
    if (d.cooldown > 0) return;
    const target = this._turretPickTarget();
    if (!target) { d.cooldown = 0.12; return; } // 標的なし：少し待って再走査
    // タレットと同じ1次近似リード射撃（照準ノイズなし＝短命な分だけ素直に働く）
    const dm  = Math.hypot(target.tx - target.x, target.ty - target.y);
    const mvx = dm > 0 ? (target.tx - target.x) / dm * target.spd : 0;
    const mvy = dm > 0 ? (target.ty - target.y) / dm * target.spd : 0;
    const ft  = Math.hypot(target.x - d.x, target.y - d.y) / TURRET_MISSILE_SPD;
    const ix  = clamp(target.x + mvx * ft, 4, W - 4);
    const iy  = clamp(target.y + mvy * ft, 8, GROUND_Y - 8);
    const dx = ix - d.x, dy = iy - d.y;
    const dd = Math.hypot(dx, dy);
    if (dd >= 1) {
      this.missiles.push({
        x: d.x, y: d.y,
        tx: ix, ty: iy,
        vx: dx / dd * TURRET_MISSILE_SPD,
        vy: dy / dd * TURRET_MISSILE_SPD,
        spd: TURRET_MISSILE_SPD,
        done: false,
        big: false,
        scatter: false,
        cityIdx: -1,
        auto: true,          // ドローン弾＝タレット経済（爆発kindも'turret'）
        ox: d.x, oy: d.y,
        dmg: DRONE_DMG,
        targetSeed: target.seed,
      });
      d.flash = 0.08;
    }
    d.cooldown = DRONE_CD;
  }

  // ---- P4 段階的復元（REBUILD）の進行 ----
  // 完了で都市が復活（バフ/シールドは初期化）。再建中の被弾リセットは _impactCity 側。
  _updateRebuild(dt) {
    const rb = this._rebuild;
    if (!rb) return;
    const c = this.cities[rb.cityIdx];
    if (!c || c.alive) { this._rebuild = null; return; } // REPAIR等で先に復活したら破棄
    rb.t += dt;
    if (rb.t >= REBUILD_SEC) {
      c.alive  = true;
      c.buffs  = makeCityBuffs();
      c.shield = 0;
      const p = P();
      this.cityBlasts.push({
        x: CITY_XS[rb.cityIdx] + CITY_W / 2,
        y: GROUND_Y - CITY_H / 2,
        r: 4, t: 0.55,
        color: p.green,
      });
      this._float(CITY_XS[rb.cityIdx] + CITY_W / 2, GROUND_Y - CITY_H - 12, 'REBUILT', p.green, 12);
      this.engine.audio.good();
      this._rebuild = null;
    }
  }

  // ---- 通常隕石スポーン ----
  _spawnMeteor(forceSize, itemChance) {
    const x = 18 + Math.random() * (W - 36);
    const alive = this.cities.map((c, i) => c.alive ? i : -1).filter(i => i >= 0);
    let tx;
    // P4: 都市狙い率 0.7→0.85、散布 ±14（放置プレイで都市が着実に削られる圧を作る）
    if (alive.length > 0 && Math.random() < 0.85) {
      const idx = alive[Math.floor(Math.random() * alive.length)];
      tx = CITY_XS[idx] + CITY_W / 2 + (Math.random() * 28 - 14);
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
    } else if (type === 'SHOCK') {
      // P4: 衝撃波レベル+1（run.shock が0でも shockLevel 単独で衝撃波が有効になる）
      this.shockLevel = (this.shockLevel | 0) + 1;
      this._float(m.x, m.y - 14, 'SHOCK+', P().violet, 12);
    } else if (type === 'HOMING') {
      // P4: 誘導弾+3
      this.homingAmmo = (this.homingAmmo | 0) + HOMING_PER_PURCHASE;
      this._float(m.x, m.y - 14, 'HOMING +3', P().hi, 12);
    } else if (type === 'BARRIER') {
      // P4: 全生存都市に+1シールドチャージ（上限2）。全都市が上限なら$フォールバック
      let gained = 0;
      for (const c of this.cities) {
        if (!c || !c.alive) continue;
        if ((c.shield | 0) < CITY_SHIELD_CAP) { c.shield = (c.shield | 0) + 1; gained++; }
      }
      if (gained > 0) this._float(m.x, m.y - 14, 'BARRIER', P().mid, 12);
      else this._addMoney(MONEY_ITEM, m.x, m.y - 14); // フォールバック
    } else if (type === 'ZAP') {
      // P4: 即時無料ZAPバースト。対象なしなら$フォールバック
      const hits = this._doZap();
      if (hits > 0) this._float(m.x, m.y - 14, 'ZAP', P().violet, 12);
      else this._addMoney(MONEY_ITEM, m.x, m.y - 14); // フォールバック
    }

    // ---- $ アイテム取得ボーナス ----
    this._addMoney(MONEY_ITEM, m.x + 16, m.y + 12);

    // 取得音
    this.engine.audio.sequence([
      { freq: 880, dur: 0.06, type: 'square', vol: 0.16 },
      { freq: 1320, dur: 0.08, type: 'square', vol: 0.18 },
      { freq: 1760, dur: 0.10, type: 'square', vol: 0.20 },
    ]);
  }

  // ---- 連鎖・衝撃波用の追加爆発（既存の爆発システムを再利用、音・散弾なし）----
  // maxR/damage をカスタム指定。都市バフやランのDMG+は適用しない（意図的に弱い）。
  // opts: { chainDepth, chainBudget, auto } — CHAIN抑制の深度/共有カウンタと
  // タレット由来フラグ（連鎖キルでもコンボ非加算・スコア半減を伝播させる）。
  _spawnExtraBlast(x, y, maxR, damage, big, opts) {
    const o = opts || {};
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
      auto: !!o.auto,
      chainDepth: o.chainDepth | 0,
      chainBudget: o.chainBudget || null,
      // P4: 衝撃波の世代（0=衝撃波以外が原因。衝撃波によるキルは gen+1 を引き継ぐ）
      shockGen: o.shockGen | 0,
      // 描画専用：CHAIN=マゼンタ／SHOCKWAVE=紫（big=trueで呼ばれるのはSHOCKWAVEのみ）
      kind: o.kind || (big ? 'shock' : 'chain'),
      age: 0,
    });
  }

  // ---- タレット爆発（固定小半径・WIDE/ラン半径補正なし・auto印）----
  _spawnTurretBlast(x, y, dmg) {
    this.blasts.push({
      x: clamp(x, 0, W),
      y: clamp(y, 0, GROUND_Y - 2),
      r: 3,
      maxR: TURRET_BLAST_R,
      growing: true,
      fadeTimer: BLAST_FADE_SEC,
      big: false,
      id: _nextBlastId++,
      damage: Math.max(1, dmg | 0),
      isScatter: false,
      cityIdx: -1,
      auto: true,
      kind: 'turret', // 描画専用：控えめなシアン
      age: 0,
    });
  }

  // ---- $ 加算＋緑フロート（スコアフロートとずらした位置に出す）----
  _addMoney(amount, fx, fy) {
    const a = Math.max(0, amount | 0);
    if (a <= 0) return;
    this.money = (this.money | 0) + a;
    if (fx != null && fy != null) {
      this._float(clamp(fx, 10, W - 10), clamp(fy, 12, H - 12), '+' + a + '$', P().green, 10);
    }
  }

  // ---- タレット：クールダウン（レベルごと-12%、下限0.8s）----
  _turretCd(level) {
    return Math.max(TURRET_CD_MIN, TURRET_CD_BASE * Math.pow(TURRET_CD_LEVEL_MULT, Math.max(0, (level | 0) - 1)));
  }

  // ---- タレット：ダメージ（1 + floor(level/3)）----
  _turretDmg(level) {
    return 1 + Math.floor((level | 0) / 3);
  }

  // ---- タレットAI：残り着地時間が最短の隕石を狙う ----
  // 他タレットの飛翔中ミサイルが既に狙っている隕石は避ける（可能なら）。
  // アイテム隕石は狙わない（取得判断はプレイヤーに残す）。
  _turretPickTarget() {
    const targeted = new Set();
    for (const ms of this.missiles) {
      if (ms && !ms.done && ms.auto && ms.targetSeed != null) targeted.add(ms.targetSeed);
    }
    let best = null,  bestT = Infinity;   // 全体の最短着地
    let bestU = null, bestUT = Infinity;  // 未ターゲットの最短着地
    for (const m of this.meteors) {
      if (!m || m.isItem) continue;
      const dist = Math.hypot(m.tx - m.x, m.ty - m.y);
      const tta  = dist / Math.max(m.spd, 0.001); // time-to-ground
      if (tta < bestT) { bestT = tta; best = m; }
      if (!targeted.has(m.seed) && tta < bestUT) { bestUT = tta; bestU = m; }
    }
    return bestU || best;
  }

  // ---- タレット発射：線形リード＋照準ノイズ±12px ----
  _turretFire(t, m) {
    // 隕石の速度ベクトル（tx,tyへ向かって等速）
    const dm  = Math.hypot(m.tx - m.x, m.ty - m.y);
    const mvx = dm > 0 ? (m.tx - m.x) / dm * m.spd : 0;
    const mvy = dm > 0 ? (m.ty - m.y) / dm * m.spd : 0;
    // 飛翔時間の1次近似で迎撃点を推定
    const ft = Math.hypot(m.x - t.x, m.y - t.y) / TURRET_MISSILE_SPD;
    let ix = m.x + mvx * ft + (Math.random() * 2 - 1) * TURRET_AIM_NOISE;
    let iy = m.y + mvy * ft + (Math.random() * 2 - 1) * TURRET_AIM_NOISE;
    ix = clamp(ix, 4, W - 4);
    iy = clamp(iy, 8, GROUND_Y - 8);
    const dx = ix - t.x, dy = iy - t.y;
    const d  = Math.hypot(dx, dy);
    if (d < 1) return false;
    this.missiles.push({
      x: t.x, y: t.y,
      tx: ix, ty: iy,
      vx: dx / d * TURRET_MISSILE_SPD,
      vy: dy / d * TURRET_MISSILE_SPD,
      spd: TURRET_MISSILE_SPD,
      done: false,
      big: false,
      scatter: false,
      cityIdx: -1,
      auto: true,             // タレット弾（手動上限を消費しない・爆発にauto伝播）
      ox: t.x, oy: t.y,       // 描画用の発射元
      dmg: this._turretDmg(t.level),
      targetSeed: m.seed,     // 二重ターゲット回避用
    });
    t.flash  = 0.08;
    t.lastTx = ix;
    t.lastTy = iy;
    return true;
  }

  // ---- タレット更新（自動発射）----
  _updateTurrets(dt) {
    if (!this.turrets || this.turrets.length === 0) return;
    for (const t of this.turrets) {
      if (!t) continue;
      if (t.flash > 0) t.flash = Math.max(0, t.flash - dt);
      t.cooldown -= dt;
      if (t.cooldown > 0) continue;
      const target = this._turretPickTarget();
      if (!target) { t.cooldown = 0.12; continue; } // 標的なし：少し待って再走査
      this._turretFire(t, target);
      t.cooldown = this._turretCd(t.level);
    }
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
      kind: big ? 'big' : 'manual', // 描画専用：手動=シアン／BIG=琥珀二重リング
      age: 0,
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

    // ---- P4 REBUILD: 再建中の都市サイトへの着弾は進捗を0にリセット ----
    // まだ生存していないので「破壊」はされない。生存都市より近い場合のみサイトが被弾を吸う。
    if (this._rebuild) {
      const rc = CITY_XS[this._rebuild.cityIdx] + CITY_W / 2;
      const rd = Math.abs(rc - ix);
      if (rd < CITY_W * 2.5 && rd < bestDist) {
        if (this._rebuild.t > 0) {
          this._rebuild.t = 0;
          this._float(rc, GROUND_Y - CITY_H - 6, 'REBUILD RESET', P().bad, 10);
          this.engine.audio.bad();
        }
        return;
      }
    }

    if (bestIdx >= 0 && bestDist < CITY_W * 2.5) {
      const floatX = CITY_XS[bestIdx] + CITY_W / 2;
      const floatY = GROUND_Y - CITY_H - 6;
      // ---- P4 BARRIER: 都市個別のシールドチャージを最優先で消費（カードSHIELDより先）----
      const hitCity = this.cities[bestIdx];
      if ((hitCity.shield | 0) > 0) {
        hitCity.shield--;
        this.engine.audio.select();
        this._float(floatX, floatY, 'SHIELD', P().mid, 11);
        this.cityBlasts.push({
          x: floatX,
          y: GROUND_Y - CITY_H / 2,
          r: 6, t: 0.3,
          color: P().mid,
        });
        return;
      }
      // SHIELD アップグレード：被弾を1回無効化（スタック消費）
      if (this.run && this.run.shield > 0) {
        this.run.shield--;
        this.engine.audio.select();
        this._float(floatX, floatY, 'SHIELD', P().mid, 11);
        // シールド発動の小フラッシュ（都市爆発エフェクトを弱く流用、色はシアン）
        this.cityBlasts.push({
          x: CITY_XS[bestIdx] + CITY_W / 2,
          y: GROUND_Y - CITY_H / 2,
          r: 6, t: 0.3,
          color: P().mid,
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

  // ================= ライブショップ（P1）=================

  // ---- ショップタブ矩形（閉時=最下端、開閉アニメに追従してパネル上端に張り付く）----
  _shopTabRect() {
    const slide = this._shopSlide || 0;
    return {
      x: Math.floor(W / 2 - SHOP_TAB_W / 2),
      y: Math.floor(H - SHOP_TAB_H - SHOP_PANEL_H * slide),
      w: SHOP_TAB_W,
      h: SHOP_TAB_H,
    };
  }

  // ---- ショップ価格（購入回数でエスカレーション。買えない状態は null で示さず enabled で判定）----
  _shopPrice(id) {
    const s = this.shop || { lv: 0, reload: 0, radius: 0, repair: 0, shock: 0, barrier: 0 };
    switch (id) {
      case 'turret': {
        const n = this.turrets ? this.turrets.length : 0;
        return SHOP_TURRET_PRICES[Math.min(n, SHOP_TURRET_PRICES.length - 1)];
      }
      case 'tlv':     return Math.round(SHOP_TLV_BASE * (1 + 0.6 * s.lv));
      case 'reload':  return Math.round(SHOP_RELOAD_BASE * Math.pow(1.6, s.reload));
      case 'radius':  return Math.round(SHOP_RADIUS_BASE * Math.pow(1.6, s.radius));
      case 'big':     return SHOP_BIG_PRICE;
      case 'repair':  return Math.round(SHOP_REPAIR_BASE * Math.pow(1.8, s.repair));
      // ---- P4 ----
      case 'shock':   return Math.round(SHOP_SHOCK_BASE * Math.pow(1.6, s.shock | 0));
      case 'homing':  return SHOP_HOMING_PRICE;
      case 'zap':     return SHOP_ZAP_PRICE;
      case 'drone':   return SHOP_DRONE_PRICE;
      case 'barrier': return Math.round(SHOP_BARRIER_BASE * Math.pow(1.5, s.barrier | 0));
      case 'rebuild': return SHOP_REBUILD_PRICE;
    }
    return 999999;
  }

  // ---- ショップ項目一覧（P4: 3列×4行=12項目。enabled=前提条件、afford=残金）----
  _shopItems() {
    const deadCity   = this.cities.some(c => c && !c.alive);
    const zapTargets = this.meteors.some(m => m && m.y > OFFSCREEN_SAFE_Y);
    const barrierOK  = this.cities.some(c => c && c.alive && (c.shield | 0) < CITY_SHIELD_CAP);
    const defs = [
      { id: 'turret',  name: 'TURRET',  enabled: this.turrets.length < TURRET_MAX },
      { id: 'tlv',     name: 'LV+',     enabled: this.turrets.length > 0 },
      { id: 'reload',  name: 'RELOAD-', enabled: true },
      { id: 'radius',  name: 'RADIUS+', enabled: true },
      { id: 'big',     name: 'BIG+',    enabled: this._bigCharges < BIG_CHARGES_MAX },
      { id: 'repair',  name: 'REPAIR',  enabled: deadCity },
      { id: 'shock',   name: 'SHOCK+',  enabled: true },
      { id: 'homing',  name: 'HOMING',  enabled: true },
      { id: 'zap',     name: 'ZAP',     enabled: zapTargets },
      { id: 'drone',   name: 'DRONE',   enabled: !this.drone },
      { id: 'barrier', name: 'BARRIER', enabled: barrierOK },
      { id: 'rebuild', name: 'REBUILD', enabled: deadCity && !this._rebuild },
    ];
    for (const d of defs) {
      d.price  = this._shopPrice(d.id);
      d.afford = d.enabled && this.money >= d.price;
    }
    return defs;
  }

  // ---- ショップボタン矩形（パネル全開位置基準。col:0-2, row:0-3）----
  _shopBtnRect(col, row) {
    const panelY = H - SHOP_PANEL_H;
    const bw = Math.floor((W - 8 * (SHOP_COLS + 1)) / SHOP_COLS); // 8pxガター×4 → 109px
    const bh = 40;
    return {
      x: 8 + col * (bw + 8),
      y: panelY + 26 + row * (bh + 6),
      w: bw,
      h: bh,
    };
  }

  // ---- ショップパネル内タップ処理（ボタン外のパネル領域は何もしない＝閉じない）----
  _shopTap(x, y) {
    const items = this._shopItems();
    for (let i = 0; i < items.length; i++) {
      const r = this._shopBtnRect(i % SHOP_COLS, Math.floor(i / SHOP_COLS));
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) {
        this._shopBuy(items[i], r);
        return;
      }
    }
  }

  // ---- 購入適用（即時反映）----
  _shopBuy(item, btnRect) {
    if (!item || !item.enabled) return;
    if (this.money < item.price) {
      // 買えない：無反応（dim表示が既にヒントになっている）
      return;
    }
    const fx = btnRect ? btnRect.x + btnRect.w / 2 : W / 2;
    const fy = btnRect ? btnRect.y - 4 : H - SHOP_PANEL_H - 10;
    const p  = P();

    switch (item.id) {
      case 'turret': {
        if (this.turrets.length >= TURRET_MAX) return;
        const idx = this.turrets.length;
        this.money -= item.price;
        this.turrets.push({
          x: TURRET_XS[idx], y: TURRET_Y,
          // P3レビューD2対策: 購入済みのTURRET LV+を新設砲座にも継承する
          cooldown: 0.5, level: 1 + ((this.shop && this.shop.lv) | 0),
          flash: 0, lastTx: TURRET_XS[idx], lastTy: TURRET_Y - 30,
        });
        this._float(TURRET_XS[idx], TURRET_Y - 16, 'TURRET ONLINE', p.mid, 11);
        this.engine.audio.good();
        return;
      }
      case 'tlv': {
        if (this.turrets.length === 0) return;
        this.money -= item.price;
        this.shop.lv++;
        for (const t of this.turrets) if (t) t.level++;
        this._float(fx, fy, 'TURRET LV+', p.mid, 11);
        this.engine.audio.good();
        return;
      }
      case 'reload': {
        this.money -= item.price;
        this.shop.reload++;
        this._shopCdMult *= 0.9;
        this._float(fx, fy, 'RELOAD-', p.mid, 11);
        this.engine.audio.select();
        return;
      }
      case 'radius': {
        this.money -= item.price;
        this.shop.radius++;
        this._shopRadiusMult *= 1.1;
        this._float(fx, fy, 'RADIUS+', p.mid, 11);
        this.engine.audio.select();
        return;
      }
      case 'big': {
        if (this._bigCharges >= BIG_CHARGES_MAX) return;
        this.money -= item.price;
        this._bigCharges = Math.min(BIG_CHARGES_MAX, this._bigCharges + 1);
        this._float(fx, fy, 'BIG +1', p.warn, 11);
        this.engine.audio.select();
        return;
      }
      case 'repair': {
        // 最初の破壊都市を復旧（価格は共通なので左から＝最安と同義）
        let idx = -1;
        for (let i = 0; i < CITY_COUNT; i++) {
          if (this.cities[i] && !this.cities[i].alive) { idx = i; break; }
        }
        if (idx < 0) return;
        this.money -= item.price;
        this.shop.repair++;
        this.cities[idx].alive = true;
        this.cities[idx].buffs = makeCityBuffs();
        // 復旧フラッシュ（緑の小爆発リング＋フロート）
        this.cityBlasts.push({
          x: CITY_XS[idx] + CITY_W / 2,
          y: GROUND_Y - CITY_H / 2,
          r: 4, t: 0.55,
          color: p.green,
        });
        this._float(CITY_XS[idx] + CITY_W / 2, GROUND_Y - CITY_H - 12, 'REBUILT', p.green, 12);
        // OVERDRIVE中に復旧すると生存数2で自然に解除される（update内で毎フレーム再計算）
        this.engine.audio.good();
        return;
      }
      // ---- P4 新項目 ----
      case 'shock': {
        this.money -= item.price;
        this.shop.shock = (this.shop.shock | 0) + 1;
        this.shockLevel = (this.shockLevel | 0) + 1;
        this._float(fx, fy, 'SHOCK+ Lv' + this.shockLevel, p.violet, 11);
        this.engine.audio.select();
        return;
      }
      case 'homing': {
        this.money -= item.price;
        this.homingAmmo = (this.homingAmmo | 0) + HOMING_PER_PURCHASE;
        this._float(fx, fy, 'HOMING +3', p.hi, 11);
        this.engine.audio.select();
        return;
      }
      case 'zap': {
        // 即時発動。対象なしは購入不可（enabledで弾いているが二重ガード）
        if (!this.meteors.some(m => m && m.y > OFFSCREEN_SAFE_Y)) return;
        this.money -= item.price;
        this._doZap();
        this._float(fx, fy, 'ZAP', p.violet, 11);
        return;
      }
      case 'drone': {
        if (this.drone) return; // 同時1機まで
        this.money -= item.price;
        this.drone = {
          x: W / 2, y: DRONE_Y,
          t: DRONE_DURATION,
          cooldown: 0.6,
          phase: Math.random() * 10,
          flash: 0,
        };
        this._float(W / 2, DRONE_Y - 18, 'DRONE ONLINE', p.mid, 11);
        this.engine.audio.good();
        return;
      }
      case 'barrier': {
        let gained = 0;
        for (const c of this.cities) {
          if (!c || !c.alive) continue;
          if ((c.shield | 0) < CITY_SHIELD_CAP) { c.shield = (c.shield | 0) + 1; gained++; }
        }
        if (gained === 0) return; // 全都市が上限（enabledで弾いているが二重ガード）
        this.money -= item.price;
        this.shop.barrier = (this.shop.barrier | 0) + 1;
        this._float(fx, fy, 'BARRIER +' + gained, p.mid, 11);
        this.engine.audio.good();
        return;
      }
      case 'rebuild': {
        if (this._rebuild) return; // 同時1件まで
        // 最小インデックスの破壊都市を対象にする
        let idx = -1;
        for (let i = 0; i < CITY_COUNT; i++) {
          if (this.cities[i] && !this.cities[i].alive) { idx = i; break; }
        }
        if (idx < 0) return;
        this.money -= item.price;
        this._rebuild = { cityIdx: idx, t: 0 };
        this._float(CITY_XS[idx] + CITY_W / 2, GROUND_Y - CITY_H - 12, 'REBUILDING', p.green, 11);
        this.engine.audio.select();
        return;
      }
    }
  }

  // ---- ショップ描画（タブ＋スライドパネル。カード選択中と死亡時は呼ばれない）----
  _drawShop(ctx, p) {
    const slide = this._shopSlide || 0;
    const tr = this._shopTabRect();

    // ---- パネル（slide>0で下からスライドイン）----
    if (slide > 0.01) {
      const offset = SHOP_PANEL_H * (1 - slide); // 全開時0
      ctx.save();
      ctx.translate(0, offset);
      const panelY = H - SHOP_PANEL_H;

      // 背景
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, panelY, W, SHOP_PANEL_H);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = p.dim;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, panelY);
      ctx.lineTo(W, panelY);
      ctx.stroke();

      // ヘッダ：SHOP + 残金
      this.engine.text('SHOP', 10, panelY + 6, 13, p.mid, 'left');
      this.engine.text('$' + this.money, W - 10, panelY + 6, 13, p.green, 'right');

      // ボタン 3列×4行（P4）
      const items = this._shopItems();
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        const r  = this._shopBtnRect(i % SHOP_COLS, Math.floor(i / SHOP_COLS));
        const usable = it.afford;
        const col = usable ? p.mid : p.dim;
        const cut = 5;

        ctx.save();
        ctx.globalAlpha = it.enabled ? (usable ? 1 : 0.6) : 0.3;
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
        ctx.lineWidth = 1.2;
        if (usable) { ctx.shadowBlur = 5; ctx.shadowColor = col; } // 購入可能な項目は淡く発光
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 名前＋価格（価格は緑。P4: 3列化に合わせてフォント縮小）
        this.engine.text(it.name, r.x + 6, r.y + 4, 10, usable ? p.fg : p.dim, 'left');
        this.engine.text('$' + it.price, r.x + 6, r.y + 20, 10, usable ? p.green : p.dim, 'left');

        // 補助表示（所持数・状態）
        let sub = '';
        if (it.id === 'turret') sub = this.turrets.length + '/' + TURRET_MAX;
        else if (it.id === 'tlv' && this.turrets.length > 0) sub = 'Lv' + (1 + ((this.shop && this.shop.lv) | 0));
        else if (it.id === 'big') sub = this._bigCharges + '/' + BIG_CHARGES_MAX;
        else if (it.id === 'shock' && this.shockLevel > 0) sub = 'Lv' + this.shockLevel;
        else if (it.id === 'homing' && this.homingAmmo > 0) sub = 'x' + this.homingAmmo;
        else if (it.id === 'drone' && this.drone) sub = Math.ceil(this.drone.t) + 's';
        else if (it.id === 'rebuild' && this._rebuild) {
          sub = Math.floor(clamp(this._rebuild.t / REBUILD_SEC, 0, 1) * 100) + '%';
        }
        if (sub) this.engine.text(sub, r.x + r.w - 6, r.y + 20, 9, p.dim, 'right');
        ctx.restore();
      }
      ctx.restore();
    }

    // ---- タブ（常時表示。'▲/▼ SHOP $n'）----
    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = p.dark;
    ctx.fillRect(tr.x, tr.y, tr.w, tr.h);
    ctx.strokeStyle = this.shopOpen ? p.mid : p.dim;
    ctx.lineWidth = 1;
    ctx.strokeRect(tr.x, tr.y, tr.w, tr.h);
    ctx.restore();
    const arrow = this.shopOpen ? '▼' : '▲';
    this.engine.text(arrow + ' SHOP ', tr.x + tr.w / 2 - 18, tr.y + 3, 11, this.shopOpen ? p.mid : p.fg, 'center');
    this.engine.text('$' + this.money, tr.x + tr.w / 2 + 26, tr.y + 3, 11, p.green, 'center');
  }

  // ---- タレットポッド描画（ネオンアウトライン六角＋CDアーク＋マズルフラッシュ）----
  _drawTurrets(ctx, p) {
    if (!this.turrets || this.turrets.length === 0) return;
    for (const t of this.turrets) {
      if (!t) continue;
      ctx.save();

      // 六角ポッド（アウトライン＋淡いネオングロー）
      const r = 7;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
        const hx = t.x + Math.cos(a) * r;
        const hy = t.y + Math.sin(a) * r;
        if (i === 0) ctx.moveTo(hx, hy); else ctx.lineTo(hx, hy);
      }
      ctx.closePath();
      ctx.strokeStyle = p.mid;
      ctx.lineWidth = 1.4;
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.mid;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // 中心の銃身ドット
      ctx.beginPath();
      ctx.arc(t.x, t.y, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = p.mid;
      ctx.fill();

      // 照準バレルライン（直前の狙点方向へ、控えめな発光の常設線）
      if (t.lastTx != null) {
        const bdx = t.lastTx - t.x, bdy = t.lastTy - t.y;
        const bd  = Math.hypot(bdx, bdy) || 1;
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = p.mid;
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(t.x + bdx / bd * (r + 1), t.y + bdy / bd * (r + 1));
        ctx.lineTo(t.x + bdx / bd * (r + 6), t.y + bdy / bd * (r + 6));
        ctx.stroke();
        ctx.restore();
      }

      // クールダウンアーク（リロード進行。満充填時は非表示、シアンで統一）
      const cdMax = this._turretCd(t.level);
      const frac  = clamp(1 - t.cooldown / cdMax, 0, 1);
      if (frac < 1) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, r + 3.5, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
        ctx.strokeStyle = p.mid;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // マズルフラッシュ（発射直後の短く明るい線）
      if (t.flash > 0 && t.lastTx != null) {
        const fa = clamp(t.flash / 0.08, 0, 1);
        const dx = t.lastTx - t.x, dy = t.lastTy - t.y;
        const d  = Math.hypot(dx, dy) || 1;
        ctx.globalAlpha = fa;
        ctx.strokeStyle = p.hi;
        ctx.lineWidth = 2.2;
        ctx.shadowBlur = 8;
        ctx.shadowColor = p.hi;
        ctx.beginPath();
        ctx.moveTo(t.x + dx / d * (r + 1), t.y + dy / d * (r + 1));
        ctx.lineTo(t.x + dx / d * (r + 15), t.y + dy / d * (r + 15));
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }

      // レベル表示（Lv2以上のみ小さく）
      if (t.level > 1) {
        this.engine.text('L' + t.level, t.x, t.y + r + 3, 8, p.dim, 'center');
      }
      ctx.restore();
    }
  }

  // ---- P4 ドローン描画（小型ウィング＋残り時間バー＋マズルフラッシュ）----
  _drawDrone(ctx, p) {
    const d = this.drone;
    if (!d) return;
    ctx.save();
    // 機体（シアンのワイヤーウィング）
    ctx.strokeStyle = p.mid;
    ctx.lineWidth = 1.4;
    ctx.shadowBlur = 6;
    ctx.shadowColor = p.mid;
    ctx.beginPath();
    ctx.moveTo(d.x - 7, d.y + 3);
    ctx.lineTo(d.x, d.y - 5);
    ctx.lineTo(d.x + 7, d.y + 3);
    ctx.lineTo(d.x, d.y + 1);
    ctx.closePath();
    ctx.stroke();
    ctx.shadowBlur = 0;
    // コアドット
    ctx.beginPath();
    ctx.arc(d.x, d.y - 1, 1.4, 0, Math.PI * 2);
    ctx.fillStyle = p.mid;
    ctx.fill();
    // マズルフラッシュ（発射直後）
    if (d.flash > 0) {
      ctx.globalAlpha = clamp(d.flash / 0.08, 0, 1);
      ctx.beginPath();
      ctx.arc(d.x, d.y - 1, 4, 0, Math.PI * 2);
      ctx.strokeStyle = p.hi;
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 残り時間バー（機体の上）
    const frac = clamp(d.t / DRONE_DURATION, 0, 1);
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = p.dark;
    ctx.fillRect(d.x - 10, d.y - 13, 20, 3);
    ctx.fillStyle = p.mid;
    ctx.fillRect(d.x - 10, d.y - 13, Math.max(0, 20 * frac), 3);
    ctx.restore();
  }

  // ---- P4 ZAP稲妻描画（紫の外光＋白コアの二重ポリライン、~0.35秒でフェード）----
  _drawZapBolts(ctx, p) {
    if (!this._zapBolts || this._zapBolts.length === 0) return;
    for (const z of this._zapBolts) {
      if (!z || !z.pts || z.pts.length < 2) continue;
      const a = clamp(z.t / ZAP_BOLT_SEC, 0, 1);
      if (a <= 0) continue;
      ctx.save();
      // 外光（紫、太め）
      ctx.globalAlpha = clamp(a * 0.9, 0, 1);
      ctx.strokeStyle = p.violet;
      ctx.lineWidth = 3;
      ctx.shadowBlur = 8;
      ctx.shadowColor = p.violet;
      ctx.beginPath();
      ctx.moveTo(z.pts[0].x, z.pts[0].y);
      for (let i = 1; i < z.pts.length; i++) ctx.lineTo(z.pts[i].x, z.pts[i].y);
      ctx.stroke();
      ctx.shadowBlur = 0;
      // コア（白、細め）
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(z.pts[0].x, z.pts[0].y);
      for (let i = 1; i < z.pts.length; i++) ctx.lineTo(z.pts[i].x, z.pts[i].y);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ---- render ----
  render(ctx) {
    const p = P();

    // ---- 背景（縦グラデーション＋惑星＋明滅する星。最初に描いて他要素の下に敷く）----
    this._drawBackground(ctx, p);

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

    // ---- 地面 ----
    this.engine.rect(0, GROUND_Y, W, H - GROUND_Y, p.dark);
    this.engine.rect(0, GROUND_Y, W, 2, p.dim);

    // ---- 都市（山シルエット+街並み） ----
    for (let i = 0; i < CITY_COUNT; i++) {
      this._drawCity(ctx, p, i);
    }

    // ---- 自動タレットポッド ----
    this._drawTurrets(ctx, p);

    // ---- P4 ドローン（味方機・タイマーバー付き）----
    this._drawDrone(ctx, p);

    // ---- 都市爆発エフェクト（REPAIR復旧フラッシュは緑、SHIELDはシアン）----
    for (const cb of this.cityBlasts) {
      if (!cb) continue;
      ctx.save();
      ctx.globalAlpha = clamp(cb.t / 0.7, 0, 1) * 0.9;
      ctx.shadowBlur = 10;
      ctx.shadowColor = cb.color || p.bad;
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, Math.max(1, cb.r), 0, Math.PI * 2);
      ctx.fillStyle = cb.color || p.bad;
      ctx.fill();
      ctx.restore();
    }

    // ---- ミサイル ----
    for (const ms of this.missiles) {
      if (!ms || ms.done) continue;
      // タレット弾は発射元ポッド座標・細く暗い描画（手動弾との視覚差別化）
      const launchX = ms.auto ? ms.ox : CITY_XS[ms.cityIdx] + CITY_W / 2;
      const launchY = ms.auto ? ms.oy : GROUND_Y - CITY_H;
      ctx.save();
      if (ms.auto) {
        ctx.strokeStyle = p.dim;
        ctx.lineWidth   = 1;
      } else {
        // P4: 誘導弾（homing）は少し明るく・わずかに太く（白＋淡いグロー）
        ctx.strokeStyle = ms.big ? p.warn : (ms.scatter ? p.hi : (ms.homing ? p.hi : p.fg));
        ctx.lineWidth   = ms.big ? 2.5 : (ms.homing ? 1.8 : 1.5);
        if (ms.homing) { ctx.shadowBlur = 5; ctx.shadowColor = p.hi; }
      }
      ctx.setLineDash(ms.big ? [6, 3] : (ms.scatter ? [3, 2] : []));
      ctx.beginPath();
      ctx.moveTo(launchX, launchY);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, ms.auto ? 2 : (ms.big ? 4 : ((ms.scatter || ms.homing) ? 3 : 2.5)), 0, Math.PI * 2);
      ctx.fillStyle = ms.auto ? p.mid : (ms.big ? p.warn : ((ms.scatter || ms.homing) ? p.hi : p.fg));
      ctx.fill();
      ctx.restore();
    }

    // ---- 隕石（役割色ネオンワイヤーフレーム：白=通常/紫=高速/琥珀=巨大/赤桃=ボス）----
    // Falltopia式：色=役割。グローは負荷対策で画面内の隕石数が多いときは省略する。
    const meteorGlowOK = this.meteors.length <= 30;
    for (const m of this.meteors) {
      if (!m) continue;

      if (m.isItem) {
        this._drawItemMeteor(ctx, p, m);
        continue;
      }

      const damageFrac = m.maxHp > 1 ? clamp(1 - m.hp / m.maxHp, 0, 1) : 0;
      const isGiant    = !m.boss && m.r >= GIANT_R_THRESH;
      const bodyColor  = m.boss ? p.bad : (m.fast ? p.violet : (isGiant ? p.warn : p.hi));

      // 軌跡のリング描画は廃止（隕石中央に輪が見える原因だったため）。
      // 高速隕石だけ、短いグローする尾を薄い線で表現する（中央に輪は出さない）。
      if (m.fast && m.trail.length >= 2) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = 1.2;
        if (meteorGlowOK) { ctx.shadowBlur = 5; ctx.shadowColor = bodyColor; }
        ctx.beginPath();
        ctx.moveTo(m.trail[0].x, m.trail[0].y);
        for (let t = 1; t < m.trail.length; t++) {
          if (m.trail[t]) ctx.lineTo(m.trail[t].x, m.trail[t].y);
        }
        ctx.stroke();
        ctx.restore();
      }

      // ネオンワイヤーフレーム本体（塗りはボスのみ質量感の薄いフィル、他はアウトラインのみ）
      if (m.verts && m.verts.length >= 3) {
        const lineW    = clamp((isGiant ? 2.2 : 1.8) - damageFrac * 0.8, 0.5, 2.6);
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
          // フラッシュ中はボスの塗りも少し白くなる（質量感のための薄いフィルのみ維持）
          ctx.fillStyle = flashing ? '#ffffff' : p.dark;
          ctx.globalAlpha = flashing
            ? clamp(flashStrength * 0.55, 0, 1)
            : clamp(0.5 - damageFrac * 0.15, 0, 1);
          ctx.fill();
          ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        }

        // ネオングロー（隕石数が多い/フラッシュ中は負荷・視認性のためスキップ）
        if (meteorGlowOK && !flashing) {
          ctx.shadowBlur  = m.boss ? 12 : (isGiant ? 9 : 7);
          ctx.shadowColor = bodyColor;
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
        ctx.shadowBlur = 0;

        // 関節の輝点（2〜3頂点。ネオンワイヤーの質感付け。ボスはクラックが主役なので省略）
        if (!m.boss && !flashing) {
          const n = m.verts.length;
          const jointIdx = [0, Math.floor(n / 3), Math.floor(n * 2 / 3)];
          ctx.fillStyle = bodyColor;
          for (const ji of jointIdx) {
            const v = m.verts[ji];
            if (!v) continue;
            ctx.beginPath();
            ctx.arc(v.dx, v.dy, isGiant ? 1.8 : 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }

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

    // ---- P4 ZAP稲妻（爆発の上に描く）----
    this._drawZapBolts(ctx, p);

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

    // ---- ライブショップ（タブ＋ドロワー。死亡時・カード選択中は非表示）----
    if (!this.dead && !this._cardChoice) {
      this._drawShop(ctx, p);
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

    // 外枠（細線、レアリティ色＋柔らかい外側グロー）
    ctx.globalAlpha = 1;
    chamferPath(x, y, w, h, cut);
    ctx.strokeStyle = rarityColor;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 8;
    ctx.shadowColor = rarityColor;
    ctx.stroke();
    ctx.shadowBlur = 0;

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
    ctx.font = '12px "Rajdhani", monospace';
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
    if (filled) { ctx.shadowBlur = 6; ctx.shadowColor = color; } // 充填時のみ淡く発光
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ---- TOP HUD：ピクトグラフ圧縮ストリップ（Falltopia式・一列圧縮） ----
  // x:52..W-8（BACKボタンを避ける）、y<=48 に収める。左→右：ステージ／都市／スコア＋BEST。
  _drawTopHud(ctx, p) {
    const hudX0 = 52;
    const hudX1 = W - 8;
    const rowY  = 8;

    // ---- 左：ステージ（旗アイコン＋S番号／非NORMALはタイプ名を小さく下に）----
    this._drawIconFlag(ctx, hudX0 + 2, rowY + 1, 12, p.mid);
    this.engine.text('S' + (this._stage + 1), hudX0 + 18, rowY - 1, 16, p.mid, 'left');
    if (this._stage >= 1 && this._stageType !== 'NORMAL') {
      this.engine.text(this._stageType, hudX0 + 2, rowY + 19, 9, p.warn, 'left');
    }

    // 薄い縦セパレータ（区切りの視認性向上）
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(hudX0 + 90, rowY);
    ctx.lineTo(hudX0 + 90, rowY + 20);
    ctx.stroke();
    ctx.restore();

    // ---- 中央：都市（家アイコン＋生存数）----
    const cityX = hudX0 + 96;
    const aliveCount = this.cities.filter(c => c.alive).length;
    this._drawIconHouse(ctx, cityX, rowY + 13, 11, p.warn);
    this.engine.text(String(aliveCount), cityX + 16, rowY + 2, 14, p.warn, 'left');

    // ---- 中央右：$（緑ダイヤ＋残金）----
    const moneyX = cityX + 42;
    this._drawIconDiamond(ctx, moneyX, rowY + 9, 5, p.green);
    this.engine.text('$' + (this.money | 0), moneyX + 10, rowY + 2, 13, p.green, 'left');

    // ---- 右：スコア（ダイヤアイコン＋スコア、右寄せ）／その下に小さくBEST ----
    const scoreStr = 'SCORE ' + this.score;
    ctx.save();
    ctx.font = '13px "Rajdhani", monospace';
    const scoreW = ctx.measureText(scoreStr).width;
    ctx.restore();
    const diamondX = hudX1 - scoreW - 12;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.dim;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(diamondX - 10, rowY);
    ctx.lineTo(diamondX - 10, rowY + 20);
    ctx.stroke();
    ctx.restore();
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
    const bossBarCol = damageFrac > 0.6 ? p.bad : p.warn;
    ctx.fillStyle = bossBarCol;
    ctx.shadowBlur = 5;
    ctx.shadowColor = bossBarCol;
    ctx.fillRect(barX + 1, barY + 1, Math.max(0, (barW - 2) * hpFrac), Math.max(0, barH - 2));
    ctx.shadowBlur = 0;
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
    if (this.homingAmmo > 0) visibleRows++;   // P4
    if (this.shockLevel > 0) visibleRows++;   // P4
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

    // ---- P4 HOMING残弾（ドット表示）----
    if (this.homingAmmo > 0) {
      ctx.save();
      this.engine.text('HOMG', labelX, rowY, 8, p.hi, 'left');
      for (let i = 0; i < Math.min(this.homingAmmo, 9); i++) {
        ctx.beginPath();
        ctx.arc(panelX + 28 + i * 5, rowY + 4, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.hi;
        ctx.fill();
      }
      ctx.restore();
      rowY += rowH;
    }

    // ---- P4 SHOCKレベル（静的表示）----
    if (this.shockLevel > 0) {
      ctx.save();
      this.engine.text('SHOCK', labelX, rowY, 8, p.violet, 'left');
      this.engine.text('Lv' + this.shockLevel, panelX + 32, rowY, 8, p.violet, 'left');
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

  // ---- アイテム隕石の描画（緑のパルスするネオンカプセル＋アイコン） ----
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
    ctx.strokeStyle = p.green;
    ctx.lineWidth = 2.5;
    ctx.shadowBlur = 9;
    ctx.shadowColor = p.green;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.green;
    ctx.globalAlpha = clamp(pulse * 0.14, 0, 1);
    ctx.fill();

    ctx.restore();

    ctx.save();
    ctx.globalAlpha = clamp(pulse, 0, 1);
    // P4: SCATTERとSHOCKの'S'衝突回避のため、新ドロップはITEM_LABELSの1〜2文字を使う
    const label = m.itemType ? (ITEM_LABELS[m.itemType] || m.itemType[0]) : '?';
    this.engine.text(label, m.x, m.y - 6, 13, p.hi, 'center');
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

  // ---- 背景：縦グラデーション＋淡い惑星2つ＋明滅する星（深宇宙、Falltopia式） ----
  // 毎フレーム呼ばれるが軽量（グラデーション1回＋円2つ＋星N個、shadowBlurは使わない）。
  _drawBackground(ctx, p) {
    // 縦グラデーション：上=深宇宙の黒に近い紺 → 中=基準bg → 下=わずかにインディゴ
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0,    '#070a16');
    grad.addColorStop(0.55, p.bg);
    grad.addColorStop(1,    '#141031');
    ctx.save();
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();

    // 淡い惑星シルエット（固定2個、低アルファ）
    ctx.save();
    ctx.fillStyle = p.violet;
    ctx.globalAlpha = 0.16;
    ctx.beginPath();
    ctx.arc(52, 128, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = p.mid;
    ctx.globalAlpha = 0.13;
    ctx.beginPath();
    ctx.arc(W - 40, GROUND_Y - 90, 108, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 明滅する星（enter()で事前生成した配列。alphaをsinで振動させるだけの軽量処理）
    if (!this._stars) this._stars = makeStarfield();
    ctx.save();
    ctx.fillStyle = p.fg;
    for (const s of this._stars) {
      const tw = 0.5 + 0.5 * Math.sin(this._elapsed * s.speed + s.phase);
      ctx.globalAlpha = clamp(s.baseA * (0.5 + 0.5 * tw), 0, 1);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
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
      // 破壊済み：薄暗い破断アウトライン（塗りなし、瓦礫ブロック）＋煙の×印
      ctx.save();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = p.dim;
      ctx.lineWidth = 1;
      const rubble = [
        [0, CITY_H - 4, 8, 4],
        [10, CITY_H - 6, 10, 6],
        [22, CITY_H - 3, 6, 3],
        [4, CITY_H - 8, 6, 3],
        [16, CITY_H - 9, 8, 4],
      ];
      for (const [rx, ry, rw, rh] of rubble) {
        ctx.strokeRect(ox + rx, oy + ry, rw, rh);
      }
      ctx.restore();
      // 煙（小さな×印）
      ctx.save();
      ctx.strokeStyle = p.bad;
      ctx.globalAlpha = 0.75;
      ctx.lineWidth = 1.5;
      const mx = ox + CITY_W / 2, my = oy + CITY_H / 2 - 4;
      ctx.beginPath(); ctx.moveTo(mx - 5, my - 5); ctx.lineTo(mx + 5, my + 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx + 5, my - 5); ctx.lineTo(mx - 5, my + 5); ctx.stroke();
      ctx.restore();

      // ---- P4 REBUILD: 再建中の足場（下から進捗分だけ緑の破線アウトラインが立ち上がる）----
      if (this._rebuild && this._rebuild.cityIdx === idx) {
        const frac    = clamp(this._rebuild.t / REBUILD_SEC, 0, 1);
        const profile = CITY_PROFILES[idx];
        if (profile && profile.buildings && frac > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(ox - 2, oy + CITY_H * (1 - frac) - 1, CITY_W + 4, CITY_H * frac + 2);
          ctx.clip();
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = p.green;
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          for (const b of profile.buildings) {
            ctx.strokeRect(ox + b.x, oy + b.y, b.w, b.h);
          }
          ctx.setLineDash([]);
          ctx.restore();
        }
        // 進捗バー（都市上部）
        ctx.save();
        ctx.globalAlpha = 0.9;
        ctx.fillStyle = p.dark;
        ctx.fillRect(ox, oy - 8, CITY_W, 3);
        ctx.fillStyle = p.green;
        ctx.fillRect(ox, oy - 8, Math.max(0, CITY_W * frac), 3);
        ctx.restore();
      }
      return;
    }

    // 選択ハイライト（グロー枠）
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = p.hi;
      ctx.lineWidth = 2;
      ctx.shadowBlur = 6;
      ctx.shadowColor = p.hi;
      ctx.setLineDash([4, 2]);
      ctx.strokeRect(ox - 3, oy - 3, CITY_W + 6, CITY_H + 3);
      ctx.setLineDash([]);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    // ネオン・シティスカイライン：ビル矩形アウトライン＋点灯窓（1〜2）
    const profile = CITY_PROFILES[idx];
    if (profile && profile.buildings) {
      const col = isSelected ? p.hi : p.mid;
      ctx.save();
      ctx.translate(ox, oy);
      ctx.strokeStyle = col;
      ctx.lineWidth = isSelected ? 1.6 : 1.2;
      ctx.shadowBlur = 5;
      ctx.shadowColor = col;
      for (const b of profile.buildings) {
        ctx.strokeRect(b.x, b.y, b.w, b.h);
      }
      ctx.shadowBlur = 0;
      // 点灯窓（明るい小さな輝点）
      ctx.fillStyle = p.hi;
      for (const w of profile.windows) {
        ctx.beginPath();
        ctx.arc(w.x, w.y, 1.1, 0, Math.PI * 2);
        ctx.fill();
      }
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

    // ---- P4 BARRIER: シールドチャージ分の半透明ドームアーク（上限2、外側ほど薄く）----
    const shieldCharges = Math.min(city.shield | 0, CITY_SHIELD_CAP);
    if (shieldCharges > 0) {
      ctx.save();
      const dcx = ox + CITY_W / 2;
      const dcy = oy + CITY_H; // 地面基準
      for (let s = 0; s < shieldCharges; s++) {
        ctx.globalAlpha = clamp(0.4 - s * 0.12, 0, 1);
        ctx.strokeStyle = p.mid;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.arc(dcx, dcy, CITY_W * 0.78 + s * 4, Math.PI, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
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
