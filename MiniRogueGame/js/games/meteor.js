// METEOR : ゆっくり迫る隕石をミサイルで迎撃するストラテジー防衛ゲーム。
// ステージ制：序盤は1個ずつ読んで破壊、徐々に密度が上がりステージ末にボス隕石登場。
// 全都市が破壊されたらゲームオーバー。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'meteor',
  title: 'METEOR',
  desc: '降る隕石を迎撃して街を守れ',
  glyph: '*',
};

// ---- 定数 ----
const CITY_COUNT   = 5;
const CITY_W       = 28;
const CITY_H       = 18;
const GROUND_Y     = H - 40;
const BATTERY_X    = W / 2;
const BATTERY_Y    = GROUND_Y - 4;

// ミサイル（遅め＝狙いを要求する）
const MISSILE_SPD   = 110;   // px/s
const BASE_MAX_MISSILES = 2; // 初期同時ミサイル数
const FIRE_COOLDOWN = 0.55;  // 発射間隔（秒）

// 爆発 — grow then FADE OUT (alpha, no shrink)
const BLAST_GROW     = 38;   // 通常爆発最大半径
const BLAST_GROW_BIG = 115;  // ビッグ爆発最大半径
const BLAST_GROW_RATE = 50;  // 拡大速度 px/s（遅め）
const BLAST_FADE_SEC  = 1.2; // フェードアウト時間（秒）— 合計アニメを長く

// ビッグブラスト残弾
const BIG_CHARGES_MAX  = 3;
const BIG_RECHARGE_SEC = 14;

// 通常ブラストダメージ（パワーアップで増加）
const BLAST_DAMAGE_NORMAL_BASE = 1;
const BLAST_DAMAGE_BIG         = 3; // ビッグは常に3

// ---- 隕石速度 ----
const METEOR_SPD_MIN       = 2;
const METEOR_SPD_MAX       = 5;
const METEOR_SPD_MAX_LATE  = 7;

const FAST_CHANCE  = 0.10;
const FAST_SPD_MIN = 14;
const FAST_SPD_MAX = 24;

// 隕石サイズ
const METEOR_R_MIN   = 7;
const METEOR_R_MAX   = 34;
const GIANT_R_THRESH = 22;
const SMALL_R_THRESH = 10;
const LARGE_R_THRESH = 16;

// ボス隕石 — 大型化！画面の半分近くを覆う威圧感
const BOSS_R_MIN    = 95;    // 旧48から大幅増
const BOSS_R_MAX    = 125;   // 旧70から大幅増（最大でW=360の1/3を超える）
const BOSS_SPD_MIN  = 1.0;   // 大きい分ゆっくり
const BOSS_SPD_MAX  = 1.8;
const BOSS_HP_BASE  = 24;    // 旧10から大幅増
const BOSS_HP_PER_STAGE = 5; // ステージ毎に+5（旧+2）

// スコア
const METEOR_SCORE_BASE = 10;
const BOSS_SCORE_BASE   = 250;

// ---- ステージタイプ（ステージ2以降でサイクル） ----
// STAGE_TYPES[i % STAGE_TYPES.length] で決定
const STAGE_TYPES = [
  'NORMAL', // 未使用（ステージ1固定）
  'FAST',   // 全速度上昇
  'SWARM',  // 密集スポーン
  'TINY',   // 小型多数
  'GIANT',  // 大型高HP
  'CHAOS',  // 速度＋密度＋混合
];

// ---- アイテム隕石のパワーアップ種別 ----
// 'MULTI'  : 同時ミサイル数+1（上限5）
// 'POWER'  : 通常爆発ダメージ+1（上限3）
// 'WIDE'   : 通常爆発半径+12（上限+36）
// 'SCATTER': 爆発時に小さな破片ブラストを撒く
const ITEM_TYPES = ['MULTI', 'POWER', 'WIDE', 'SCATTER'];

// ---- HP計算（半径に基づく） ----
function calcMeteorHP(r) {
  if (r < SMALL_R_THRESH)  return 1;
  if (r < LARGE_R_THRESH)  return 2;
  if (r < GIANT_R_THRESH)  return 3;
  return 4;
}

// ---- ステージ定義 ----
function makeStageScript(stage, stageType) {
  const events = [];
  // ステージタイプに応じてパラメータを調整
  let baseDelay  = Math.max(3.5 - stage * 0.25, 1.1);
  let bossT      = 72 + stage * 4;
  let itemChance = Math.min(0.08 + stage * 0.025, 0.22); // アイテム隕石出現確率

  // タイプ別にbossT/baseDelayを調整
  if (stageType === 'SWARM') { baseDelay *= 0.5; bossT = 55 + stage * 3; }
  if (stageType === 'FAST')  { bossT = 60 + stage * 3; }
  if (stageType === 'CHAOS') { baseDelay *= 0.65; bossT = 58 + stage * 3; }

  let t = 0;
  // 序盤
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 2.0;
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 1.8;

  // 中盤
  const midGiant = (stageType === 'GIANT');
  const midTiny  = (stageType === 'TINY');
  events.push({ t, type: 'meteor', count: 1, forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.5;

  let waveMax = 2;
  if (stageType === 'SWARM') waveMax = 5;
  else if (stageType === 'CHAOS') waveMax = 4;
  else waveMax = Math.min(1 + Math.floor(stage / 2), 3);

  events.push({ t, type: 'meteor', count: waveMax, forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.4;
  events.push({ t, type: 'meteor', count: 1, forceSize: null, itemChance });
  t += baseDelay * 1.3;
  events.push({ t, type: 'meteor', count: Math.min(1 + Math.floor(stage / 1.5), 4), forceSize: midGiant ? 'giant' : (midTiny ? 'tiny' : null), itemChance });
  t += baseDelay * 1.2;

  // 後半
  let numLate = Math.min(2 + stage, 6);
  if (stageType === 'SWARM') numLate = Math.min(numLate + 3, 9);
  if (stageType === 'CHAOS') numLate = Math.min(numLate + 2, 7);

  while (t < bossT - 10) {
    const cnt = Math.min(1 + Math.floor(Math.random() * numLate), numLate);
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

  // ボス登場
  events.push({ t: bossT, type: 'boss' });
  return events;
}

// ---- 岩石ポリゴン頂点の生成 ----
function makeRockVerts(r, seed) {
  const count = 8 + Math.floor((seed % 4));  // 8〜11頂点
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
let _nextBlastId  = 1;
let _nextMeteorSeed = 1;

// ---- ヘルパー ----
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// ステージタイプの速度倍率
function stageSpeedMult(stageType) {
  if (stageType === 'FAST')  return 2.8;
  if (stageType === 'SWARM') return 1.4;
  if (stageType === 'TINY')  return 2.2;
  if (stageType === 'CHAOS') return 2.0;
  return 1.0;
}

export class Game extends Scene {
  enter() {
    this.score      = 0;
    this.high       = this.engine.storage.getHigh(meta.id);
    this.dead       = false;

    this._elapsed   = 0;

    // ステージ
    this._stage     = 0;
    this._stageType = 'NORMAL';
    this._stageScript = makeStageScript(this._stage, this._stageType);
    this._scriptIdx   = 0;
    this._bossPending = false;
    this._bossAlive   = false;
    this._bossIdx     = -1;
    this._stageClearing = false;
    this._stageClearTimer = 0;

    this.cities     = Array(CITY_COUNT).fill(true);
    this.meteors    = [];
    this.missiles   = [];
    this.blasts     = [];
    this.cityBlasts = [];

    this._fireCooldown = 0;

    this._bigCharges  = BIG_CHARGES_MAX;
    this._bigRecharge = 0;
    this._bigArmed    = false;

    // パワーアップ状態
    this._powerups = {
      missileMax:    BASE_MAX_MISSILES, // MULTI
      blastDamage:   BLAST_DAMAGE_NORMAL_BASE, // POWER
      blastRadiusAdd: 0,  // WIDE（ピクセル加算）
      scatter:       false, // SCATTER
    };
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
    return base * clamp(stageSpeedMult(this._stageType) * 0.7, 1, 3);
  }

  // ---- onInput ----
  onInput(action, data) {
    if (this._stageClearing) return;
    if (this.dead) {
      if (action === 'back') { this.engine.toMenu(); return; }
      if (action === 'tap' || action === 'confirm') { this.enter(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    if (action === 'tap' && data) {
      const b = this._bigBtnRect();
      if (data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h) {
        this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
        this.engine.audio.select();
        return;
      }
      const big = this._bigArmed;
      this._fireMissile(data.x, data.y, big);
      if (big) this._bigArmed = false;
    }
    if (action === 'confirm') {
      this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
    }
  }

  // ---- 発射（クールダウン＋上限チェック） ----
  _fireMissile(tx, ty, big) {
    if (ty >= GROUND_Y) return;
    if (this._fireCooldown > 0) return;
    const activeCount = this.missiles.filter(m => !m.done).length;
    if (activeCount >= this._powerups.missileMax) return;

    if (big) {
      if (this._bigCharges <= 0) return;
      this._bigCharges--;
    }

    const dx = tx - BATTERY_X;
    const dy = ty - BATTERY_Y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;

    this.missiles.push({
      x: BATTERY_X, y: BATTERY_Y,
      tx, ty,
      vx: (dx / dist) * MISSILE_SPD,
      vy: (dy / dist) * MISSILE_SPD,
      done: false,
      big: !!big,
    });
    this._fireCooldown = FIRE_COOLDOWN;
    this.engine.audio.move();
  }

  // ---- update ----
  update(dt) {
    if (this.dead) return;

    if (this._fireCooldown > 0) {
      this._fireCooldown = Math.max(0, this._fireCooldown - dt);
    }

    // ステージクリア演出
    if (this._stageClearing) {
      this._stageClearTimer -= dt;
      if (this._stageClearTimer <= 0) {
        this._stage++;
        this._elapsed = 0;
        // ステージ2以降でタイプ決定（1-indexed で0はNORMAL）
        if (this._stage === 0) {
          this._stageType = 'NORMAL';
        } else {
          const types = STAGE_TYPES.filter(t => t !== 'NORMAL');
          this._stageType = types[(this._stage - 1) % types.length];
        }
        this._stageScript = makeStageScript(this._stage, this._stageType);
        this._scriptIdx = 0;
        this._bossPending = false;
        this._bossAlive = false;
        this._bossIdx = -1;
        this._stageClearing = false;
        this.meteors = [];
        this.missiles = [];
        this.blasts = [];
      }
      return;
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

    // 隕石移動
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (!m || m.x == null) { this.meteors.splice(i, 1); continue; }
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);

      if (dist < m.spd * dt + 1) {
        // 地面到達
        if (m.boss) {
          this._impactCity(m.tx, m.ty);
          this._impactCity(m.tx, m.ty);
          this._bossAlive = false;
          this._bossIdx = -1;
        } else if (m.isItem) {
          // アイテム隕石が地面に落下しても何も得られない
        } else {
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

      // 軌跡
      const trailMax = m.fast ? 8 : (m.boss ? 4 : 5);
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > trailMax) m.trail.shift();

      m.rot += (m.fast ? 0.8 : (m.boss ? 0.12 : 0.4)) * dt;
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
        this._spawnBlast(ms.tx, ms.ty, ms.big);
        ms.done = true;
      }
    }

    // 爆発更新 — grow then FADE (alpha decreases, radius stays at maxR)
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (!b) { this.blasts.splice(i, 1); continue; }

      if (b.growing) {
        b.r += BLAST_GROW_RATE * dt;
        if (b.r >= b.maxR) {
          b.r = b.maxR;
          b.growing = false;
          b.fadeTimer = BLAST_FADE_SEC; // フェード開始
        }
      } else {
        // フェードアウト（半径は変えない or わずかに拡大して壮大に見せる）
        b.fadeTimer -= dt;
        b.r = Math.min(b.maxR * 1.05, b.r + 4 * dt); // わずかに膨らむ
        if (b.fadeTimer <= 0) {
          this.blasts.splice(i, 1);
          continue;
        }
      }

      // 爆発ヒット判定（成長中＋フェード中も有効）
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (!m) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + m.r) continue;
        if (m.hitBlastIds.has(b.id)) continue;
        m.hitBlastIds.add(b.id);

        if (m.isItem) {
          // アイテム隕石を撃ち落とした！
          this._collectItem(m);
          if (this._bossIdx > j) this._bossIdx--;
          this.meteors.splice(j, 1);
          continue;
        }

        m.hp -= b.damage;
        if (m.hp <= 0) {
          if (m.boss) {
            this.score += BOSS_SCORE_BASE * (this._stage + 1);
            this._bossAlive = false;
            this._bossIdx = -1;
            this._stageClearing = true;
            this._stageClearTimer = 2.2;
            this.engine.audio.sequence([
              { freq: 440, dur: 0.08, type: 'square', vol: 0.15 },
              { freq: 660, dur: 0.08, type: 'square', vol: 0.15 },
              { freq: 880, dur: 0.10, type: 'square', vol: 0.18 },
              { freq: 1320, dur: 0.16, type: 'square', vol: 0.18 },
            ]);
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

    // ゲームオーバー判定
    if (this.cities.every(c => !c)) {
      this.dead = true;
      this.engine.audio.bad();
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // ---- 通常隕石スポーン ----
  // forceSize: null | 'giant' | 'tiny'
  _spawnMeteor(forceSize, itemChance) {
    const x = 18 + Math.random() * (W - 36);
    const alive = this.cities.map((c, i) => c ? i : -1).filter(i => i >= 0);
    let tx;
    if (alive.length > 0 && Math.random() < 0.7) {
      const idx = alive[Math.floor(Math.random() * alive.length)];
      tx = CITY_XS[idx] + CITY_W / 2 + (Math.random() * 24 - 12);
    } else {
      tx = 18 + Math.random() * (W - 36);
    }
    const ty = GROUND_Y;

    // アイテム隕石判定（ステージ1は出ない）
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

    // アイテム隕石は固定サイズ（中くらい）
    if (spawnItem) r = 14 + Math.random() * 6;

    const isFast = !spawnItem && Math.random() < FAST_CHANCE;
    const spd = isFast ? this._calcFastSpd() : this._calcNormalSpd();
    const maxHp = spawnItem ? 1 : calcMeteorHP(r);
    const seed = _nextMeteorSeed++;
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
    // 半径が大きいため、画面内に収めるようにx範囲を制限
    const margin = r + 8;
    const xMin = clamp(margin, 20, W - 20);
    const xMax = clamp(W - margin, 20, W - 20);
    const x  = xMin + Math.random() * Math.max(0, xMax - xMin);
    const tx = xMin + Math.random() * Math.max(0, xMax - xMin);
    const ty = GROUND_Y;
    const spd = BOSS_SPD_MIN + Math.random() * (BOSS_SPD_MAX - BOSS_SPD_MIN);
    const maxHp = BOSS_HP_BASE + this._stage * BOSS_HP_PER_STAGE;
    const seed = _nextMeteorSeed++;

    const bossEntry = {
      x, y: -r - 4,
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
    this._bossIdx = this.meteors.length - 1;
    this._bossAlive = true;

    // ボス登場効果音
    this.engine.audio.sequence([
      { freq: 200, dur: 0.14, type: 'sawtooth', vol: 0.18 },
      { freq: 160, dur: 0.18, type: 'sawtooth', vol: 0.18 },
      { freq: 120, dur: 0.22, type: 'sawtooth', vol: 0.18 },
    ]);
  }

  // ---- アイテム取得 ----
  _collectItem(m) {
    const type = m.itemType;
    const pu = this._powerups;

    if (type === 'MULTI') {
      pu.missileMax = Math.min(pu.missileMax + 1, 5);
    } else if (type === 'POWER') {
      pu.blastDamage = Math.min(pu.blastDamage + 1, 3);
    } else if (type === 'WIDE') {
      pu.blastRadiusAdd = Math.min(pu.blastRadiusAdd + 12, 36);
    } else if (type === 'SCATTER') {
      pu.scatter = true;
    }

    // 取得音
    this.engine.audio.sequence([
      { freq: 880, dur: 0.06, type: 'square', vol: 0.16 },
      { freq: 1320, dur: 0.08, type: 'square', vol: 0.18 },
      { freq: 1760, dur: 0.10, type: 'square', vol: 0.20 },
    ]);
  }

  // ---- 爆発スポーン ----
  _spawnBlast(x, y, big, isScatter) {
    const baseR   = big ? BLAST_GROW_BIG : (BLAST_GROW + this._powerups.blastRadiusAdd);
    const maxR    = Math.max(6, baseR);
    const dmg     = big ? BLAST_DAMAGE_BIG : this._powerups.blastDamage;
    const id      = _nextBlastId++;
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
    });
    if (!isScatter) {
      this.engine.audio.pick();
      if (big) {
        this.engine.audio.sequence([
          { freq: 330, dur: 0.06, type: 'square', vol: 0.18 },
          { freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.16 },
        ]);
      }
      // SCATTERパワーアップ：通常爆発の周囲に小型爆発を6つ散布
      if (!big && this._powerups.scatter) {
        const count = 6;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2;
          const dist  = 28 + Math.random() * 18;
          const sx = x + Math.cos(angle) * dist;
          const sy = y + Math.sin(angle) * dist;
          // 画面外に出ないようにクランプ
          if (sy > GROUND_Y - 4) continue;
          this._spawnBlast(sx, sy, false, true);
        }
      }
    }
  }

  // ---- 都市ダメージ ----
  _impactCity(ix, iy) {
    let bestDist = Infinity, bestIdx = -1;
    for (let i = 0; i < CITY_COUNT; i++) {
      if (!this.cities[i]) continue;
      const cx = CITY_XS[i] + CITY_W / 2;
      const d = Math.abs(cx - ix);
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    if (bestIdx >= 0 && bestDist < CITY_W * 2.5) {
      this.cities[bestIdx] = false;
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

    // ステージタイプラベル（ステージ2以降）
    if (this._stage >= 1 && this._stageType !== 'NORMAL') {
      this.engine.text(this._stageType, 52, 24, 11, p.warn, 'left');
    }

    this.engine.text('SCORE ' + this.score, W - 12, 8, 14, p.fg, 'right');
    this.engine.text('BEST  ' + this.high,  W - 12, 26, 11, p.dim, 'right');
    const aliveCount = this.cities.filter(Boolean).length;
    this.engine.text('CITY ' + aliveCount, 52, 38, 11, p.warn, 'left');

    // パワーアップHUD（コンパクト表示）
    this._drawPowerupHUD(ctx, p);

    // ビッグブラスト HUD
    this._drawBigChargeHUD(ctx, p);

    // ---- 星空 ----
    this._drawStarfield(ctx, p);

    // ---- 地面 ----
    this.engine.rect(0, GROUND_Y, W, H - GROUND_Y, p.dark);
    this.engine.rect(0, GROUND_Y, W, 2, p.dim);

    // ---- 発射台 ----
    this._drawBattery(ctx, p);

    // ---- 都市 ----
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
      ctx.save();
      ctx.strokeStyle = ms.big ? p.warn : p.fg;
      ctx.lineWidth = ms.big ? 2.5 : 1.5;
      ctx.setLineDash(ms.big ? [6, 3] : []);
      ctx.beginPath();
      ctx.moveTo(BATTERY_X, BATTERY_Y);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, ms.big ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = ms.big ? p.warn : p.hi;
      ctx.fill();
      ctx.restore();
    }

    // ---- 隕石（岩石ポリゴン） ----
    for (const m of this.meteors) {
      if (!m) continue;

      // アイテム隕石
      if (m.isItem) {
        this._drawItemMeteor(ctx, p, m);
        continue;
      }

      const damageFrac = m.maxHp > 1 ? clamp(1 - m.hp / m.maxHp, 0, 1) : 0;
      const bodyColor  = m.boss ? p.warn : (m.fast ? p.hi : p.bad);

      // 軌跡
      const trailColor = m.boss ? p.warn : (m.fast ? p.hi : p.bad);
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

        // ボス：薄いフィル（暗く重厚な雰囲気）
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

        // アウトライン
        ctx.beginPath();
        ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
        for (let vi = 1; vi < m.verts.length; vi++) {
          ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
        }
        ctx.closePath();
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = m.boss ? clamp(lineW * 2, 1, 4) : lineW;
        ctx.stroke();

        // ダメージ亀裂感
        if (damageFrac > 0.3 && m.verts.length >= 6) {
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

        // ボスのHP バー（大きいので常に表示）
        if (m.boss) {
          const barW  = clamp(m.r * 2.0, 80, W - 20);
          const barX  = clamp(m.x - barW / 2, 6, W - barW - 6);
          const barY  = clamp(m.y + m.r + 10, m.r + 10, GROUND_Y - 14);
          const barH  = 7;
          const hpFrac = clamp(m.hp / m.maxHp, 0, 1);
          ctx.save();
          ctx.fillStyle = p.dark;
          ctx.fillRect(barX, barY, barW, barH);
          ctx.fillStyle = damageFrac > 0.6 ? p.bad : p.warn;
          ctx.fillRect(barX, barY, Math.max(0, barW * hpFrac), barH);
          ctx.strokeStyle = p.mid;
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);
          ctx.restore();
          this.engine.text('BOSS', m.x, clamp(m.y - m.r - 20, 52, GROUND_Y - 40), 14, p.warn, 'center');
          // HP数値表示
          this.engine.text(m.hp + '/' + m.maxHp, m.x, clamp(m.y - m.r - 36, 52, GROUND_Y - 56), 11, p.dim, 'center');
        } else {
          // 通常隕石のHP ピップ
          if (m.maxHp >= 2) {
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
    }

    // ---- 爆発（grow then FADE OUT） ----
    for (const b of this.blasts) {
      if (!b) continue;

      let alpha;
      if (b.growing) {
        // 成長中：徐々に鮮明に
        alpha = clamp(b.r / b.maxR, 0, 1) * 0.9;
      } else {
        // フェードアウト（半径はキープ、アルファだけ落とす）
        alpha = clamp(b.fadeTimer / BLAST_FADE_SEC, 0, 1) * 0.85;
      }
      alpha = clamp(alpha, 0, 1);

      ctx.save();
      ctx.globalAlpha = alpha;

      // 外輪
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
      ctx.strokeStyle = b.big ? p.warn : (b.isScatter ? p.hi : p.mid);
      ctx.lineWidth = b.big ? 3.5 : (b.isScatter ? 1.0 : 2.5);
      ctx.stroke();

      // ビッグ爆発：内輪
      if (b.big && b.r > 10) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.r * 0.65), 0, Math.PI * 2);
        ctx.strokeStyle = p.hi;
        ctx.lineWidth = 1;
        ctx.globalAlpha = clamp(alpha * 0.6, 0, 1);
        ctx.stroke();
      }

      // 内部フィル（薄く）
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r * 0.55), 0, Math.PI * 2);
      ctx.fillStyle = b.big ? p.warn : (b.isScatter ? p.hi : p.mid);
      ctx.globalAlpha = clamp(alpha * 0.15, 0, 1);
      ctx.fill();

      ctx.restore();
    }

    // ---- ステージクリアオーバーレイ ----
    if (this._stageClearing) {
      const alpha = clamp(this._stageClearTimer / 2.2, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(alpha * 0.88, 0, 1);
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.restore();
      this.engine.text('STAGE ' + (this._stage + 1) + ' CLEAR!', W / 2, H / 2 - 42, 28, p.warn, 'center');
      // 次ステージのタイプを予告
      const nextStage = this._stage + 1;
      const nextTypes = STAGE_TYPES.filter(t => t !== 'NORMAL');
      const nextType  = nextTypes[nextStage % nextTypes.length];
      this.engine.text('NEXT: ' + nextType, W / 2, H / 2 + 4, 16, p.mid, 'center');
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

    // ---- クールダウンインジケータ ----
    if (this._fireCooldown > 0 && !this.dead) {
      const frac = clamp(1 - this._fireCooldown / FIRE_COOLDOWN, 0, 1);
      const barW = 28;
      const barX = BATTERY_X - barW / 2;
      const barY = BATTERY_Y - 24;
      ctx.save();
      ctx.fillStyle = p.dark;
      ctx.fillRect(barX, barY, barW, 3);
      ctx.fillStyle = p.mid;
      ctx.fillRect(barX, barY, Math.max(0, barW * frac), 3);
      ctx.restore();
    }
  }

  // ---- アイテム隕石の描画 ----
  _drawItemMeteor(ctx, p, m) {
    if (!m.verts || m.verts.length < 3) return;
    // パルス（点滅アニメ）
    const pulse = 0.75 + 0.25 * Math.sin(this._elapsed * 5.0);

    ctx.save();
    ctx.globalAlpha = clamp(pulse, 0, 1);
    ctx.translate(m.x, m.y);
    ctx.rotate(m.rot);

    // 外周ポリゴン（シアン色で目立たせる）
    ctx.beginPath();
    ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
    for (let vi = 1; vi < m.verts.length; vi++) {
      ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
    }
    ctx.closePath();
    ctx.strokeStyle = p.hi;
    ctx.lineWidth = 2.5;
    ctx.stroke();
    // 内部うっすらフィル
    ctx.fillStyle = p.hi;
    ctx.globalAlpha = clamp(pulse * 0.12, 0, 1);
    ctx.fill();

    ctx.restore();

    // 中心アイコン（ラベル）
    ctx.save();
    ctx.globalAlpha = clamp(pulse, 0, 1);
    const label = m.itemType ? m.itemType[0] : '?'; // 頭文字1文字
    this.engine.text(label, m.x, m.y - 6, 13, p.warn, 'center');
    ctx.restore();
  }

  // ---- パワーアップHUD ----
  _drawPowerupHUD(ctx, p) {
    // 右下のHUDエリアに小さく表示
    const pu = this._powerups;
    const parts = [];
    if (pu.missileMax > BASE_MAX_MISSILES) parts.push('ML' + pu.missileMax);
    if (pu.blastDamage > BLAST_DAMAGE_NORMAL_BASE) parts.push('PW' + pu.blastDamage);
    if (pu.blastRadiusAdd > 0) parts.push('WD' + (pu.blastRadiusAdd / 12 | 0));
    if (pu.scatter) parts.push('SC');

    if (parts.length === 0) return;
    const label = parts.join(' ');
    // 右上エリアの下（スコアの下）
    this.engine.text(label, W - 12, 44, 10, p.hi, 'right');
  }

  // ---- ビッグブラスト HUD ----
  _drawBigChargeHUD(ctx, p) {
    const baseX = W / 2 - 40;
    const baseY = 52;
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
      const gaugeY = baseY + 18;
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

  // ---- 発射台 ----
  _drawBattery(ctx, p) {
    const bx = BATTERY_X;
    const by = BATTERY_Y;
    this.engine.rect(bx - 14, by - 2, 28, 8, p.mid);
    ctx.save();
    ctx.fillStyle = p.fg;
    ctx.beginPath();
    ctx.moveTo(bx, by - 16);
    ctx.lineTo(bx - 5, by - 2);
    ctx.lineTo(bx + 5, by - 2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- 都市 ----
  _drawCity(ctx, p, idx) {
    const x = CITY_XS[idx];
    const y = GROUND_Y - CITY_H;
    if (!this.cities[idx]) {
      this.engine.rect(x + 2, y + CITY_H - 5, CITY_W - 4, 5, p.dim);
      this.engine.text('x', x + CITY_W / 2, y + CITY_H - 14, 11, p.bad, 'center');
      return;
    }
    this.engine.rect(x, y, CITY_W, CITY_H, p.mid);
    this.engine.rect(x, y, CITY_W, 3, p.fg);
    this.engine.rect(x + 4, y + 6, 6, 6, p.bg);
    this.engine.rect(x + 14, y + 6, 6, 6, p.bg);
    this.engine.rect(x + 5, y + 7, 4, 4, p.hi);
    this.engine.rect(x + 15, y + 7, 4, 4, p.hi);
  }
}

// ---- 都市X座標（均等配置）----
const CITY_SPACING = (W - CITY_W * CITY_COUNT) / (CITY_COUNT + 1);
const CITY_XS = Array.from({ length: CITY_COUNT }, (_, i) =>
  Math.floor(CITY_SPACING + i * (CITY_W + CITY_SPACING))
);
