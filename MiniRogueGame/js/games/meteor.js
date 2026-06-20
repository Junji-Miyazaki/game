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
const MISSILE_SPD  = 110;    // px/s（旧160から削減）
const MAX_MISSILES = 2;      // 同時に飛ばせるミサイル数（少なく＝戦略的）
const FIRE_COOLDOWN = 0.55;  // 発射間隔（秒）

// 爆発
const BLAST_GROW     = 38;   // 通常爆発最大半径
const BLAST_GROW_BIG = 115;  // ビッグ爆発最大半径
const BLAST_RATE     = 65;   // 拡大速度 px/s
const BLAST_SHRINK   = 40;   // 縮小速度 px/s

// ビッグブラスト残弾
const BIG_CHARGES_MAX  = 3;
const BIG_RECHARGE_SEC = 14;

// ブラストダメージ量
const BLAST_DAMAGE_NORMAL = 1;
const BLAST_DAMAGE_BIG    = 2;

// ---- 隕石速度（ゆっくり：約1/3） ----
const METEOR_SPD_MIN       = 2;   // 通常の最低速度 px/s
const METEOR_SPD_MAX       = 5;   // 通常の最大速度 px/s
const METEOR_SPD_MAX_LATE  = 7;   // ステージ後半の最大速度 px/s

// 高速隕石（約10%のスポーン）
const FAST_CHANCE  = 0.10;
const FAST_SPD_MIN = 14;
const FAST_SPD_MAX = 24;

// 隕石サイズ
const METEOR_R_MIN   = 7;
const METEOR_R_MAX   = 34;    // 通常最大（旧より大きめ）
const GIANT_R_THRESH = 22;
const SMALL_R_THRESH = 10;
const LARGE_R_THRESH = 16;

// ボス隕石
const BOSS_R_MIN    = 48;    // ボス半径の最小
const BOSS_R_MAX    = 70;    // ボス半径の最大
const BOSS_SPD_MIN  = 1.5;  // ボス落下速度の最小 px/s
const BOSS_SPD_MAX  = 2.5;  // ボス落下速度の最大 px/s
const BOSS_HP_BASE  = 10;   // ボス基本HP（ステージ毎に+2）

// スコア
const METEOR_SCORE_BASE = 10;
const BOSS_SCORE_BASE   = 150;

// ---- HP計算（半径に基づく） ----
function calcMeteorHP(r) {
  if (r < SMALL_R_THRESH)  return 1;
  if (r < LARGE_R_THRESH)  return 2;
  if (r < GIANT_R_THRESH)  return 3;
  return 4;
}

// ---- ステージ定義 ----
// 各ステージはスクリプト形式のスポーンイベント列（tSec=ステージ開始からの秒数）
// type: 'meteor' | 'boss'
// count: 同時スポーン数（通常のみ）
// giant: trueで大きめサイズを強制
function makeStageScript(stage) {
  // stage: 0-indexed
  // 基本的なスクリプト：序盤は1個ずつ、徐々に増える
  // stage が上がるとイベント密度が高くなる
  const events = [];
  const baseDelay = Math.max(3.5 - stage * 0.3, 1.2); // ステージが上がると間隔が縮む
  const bossT = 70 + stage * 5; // ボス登場時刻（秒）

  // 序盤フェーズ：1個ずつ
  let t = 0;
  // 最初のウェーブ：1個（小さめ）
  events.push({ t, type: 'meteor', count: 1, giant: false });
  t += baseDelay * 2.0;
  events.push({ t, type: 'meteor', count: 1, giant: false });
  t += baseDelay * 1.8;

  // 中盤フェーズ：徐々に大きく/複数
  events.push({ t, type: 'meteor', count: 1, giant: true });
  t += baseDelay * 1.5;
  events.push({ t, type: 'meteor', count: Math.min(1 + Math.floor(stage / 2), 2), giant: false });
  t += baseDelay * 1.4;
  events.push({ t, type: 'meteor', count: 1, giant: false });
  t += baseDelay * 1.3;
  events.push({ t, type: 'meteor', count: Math.min(1 + Math.floor(stage / 1.5), 3), giant: false });
  t += baseDelay * 1.2;

  // 後半フェーズ：密度上昇
  let numLate = Math.min(2 + stage, 5);
  while (t < bossT - 10) {
    const cnt = Math.min(1 + Math.floor(Math.random() * numLate), numLate);
    events.push({ t, type: 'meteor', count: cnt, giant: Math.random() < 0.2 });
    t += Math.max(baseDelay * (0.9 - stage * 0.05), 1.0);
  }

  // ボス登場
  events.push({ t: bossT, type: 'boss' });
  return events;
}

// ---- 岩石ポリゴン頂点の生成 ----
// 中心(0,0)を基準とした頂点配列 [{dx, dy}, ...] を返す
// 角張った小惑星風（8〜11頂点、半径は0.6r〜1.1r でランダム）
function makeRockVerts(r, seed) {
  const count = 8 + Math.floor((seed % 4));  // 8〜11頂点
  const verts = [];
  for (let i = 0; i < count; i++) {
    // 均等角度に少し揺らぎを加える
    const baseAngle = (i / count) * Math.PI * 2;
    // seededRandom：同じ隕石は毎フレーム同じ形にする（seedで決定論的に）
    const s1 = Math.sin(seed * 31.7 + i * 12.3);
    const s2 = Math.sin(seed * 17.1 + i * 7.9);
    const angleJitter = (s1 * 0.5) / count; // 少しだけ角度をずらす
    const angle = baseAngle + angleJitter;
    // 半径は 0.6r〜1.1r でランダム（angular asteroid feel）
    const rFrac = 0.60 + 0.50 * ((s2 + 1) / 2);
    verts.push({ dx: Math.cos(angle) * r * rFrac, dy: Math.sin(angle) * r * rFrac });
  }
  return verts;
}

// ---- ユニークID ----
let _nextBlastId = 1;
let _nextMeteorSeed = 1;

// ---- ヘルパー ----
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

export class Game extends Scene {
  enter() {
    this.score      = 0;
    this.high       = this.engine.storage.getHigh(meta.id);
    this.dead       = false;

    this._elapsed   = 0;  // ステージ内経過時間

    // ステージ
    this._stage     = 0;  // 0-indexed
    this._stageScript = makeStageScript(this._stage);
    this._scriptIdx   = 0;  // 次に処理するスクリプトイベントのインデックス
    this._bossPending = false; // ボスイベントを処理したか
    this._bossAlive   = false; // ボス隕石が生存しているか
    this._bossIdx     = -1;    // meteor配列内でのボスインデックス
    this._stageClearing = false; // ステージクリア演出中
    this._stageClearTimer = 0;

    this.cities     = Array(CITY_COUNT).fill(true);
    this.meteors    = [];
    this.missiles   = [];
    this.blasts     = [];
    this.cityBlasts = [];

    this._spawnTimer  = 0;  // 未使用（スクリプト制御に移行）
    this._fireCooldown = 0; // 発射クールダウンタイマ

    this._bigCharges  = BIG_CHARGES_MAX;
    this._bigRecharge = 0;
    this._bigArmed    = false;
  }

  _bigBtnRect() { return { x: W / 2 - 48, y: 44, w: 112, h: 28 }; }

  // 通常隕石の速度（ステージが上がると少し速くなる）
  _calcNormalSpd() {
    const frac = clamp(this._stage / 6, 0, 1);
    const spdMax = METEOR_SPD_MAX + (METEOR_SPD_MAX_LATE - METEOR_SPD_MAX) * frac;
    return METEOR_SPD_MIN + Math.random() * (spdMax - METEOR_SPD_MIN);
  }

  _calcFastSpd() {
    return FAST_SPD_MIN + Math.random() * (FAST_SPD_MAX - FAST_SPD_MIN);
  }

  // ---- onInput ----
  onInput(action, data) {
    if (this._stageClearing) return; // ステージクリア演出中は操作無効
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
    if (this._fireCooldown > 0) return; // クールダウン中は撃てない
    if (this.missiles.filter(m => !m.done).length >= MAX_MISSILES) return;

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

    // 発射クールダウン更新
    if (this._fireCooldown > 0) {
      this._fireCooldown = Math.max(0, this._fireCooldown - dt);
    }

    // ステージクリア演出
    if (this._stageClearing) {
      this._stageClearTimer -= dt;
      if (this._stageClearTimer <= 0) {
        // 次のステージへ
        this._stage++;
        this._elapsed = 0;
        this._stageScript = makeStageScript(this._stage);
        this._scriptIdx = 0;
        this._bossPending = false;
        this._bossAlive = false;
        this._bossIdx = -1;
        this._stageClearing = false;
        // 残隕石を掃除
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
    // ボス生存中は次のスクリプトを進めない（ボス破壊が先決）
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
            this._spawnMeteor(ev.giant || false);
          }
        }
      }
    }

    // 隕石移動（ボス含む）
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (!m || m.x == null) { this.meteors.splice(i, 1); continue; }
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);

      if (dist < m.spd * dt + 1) {
        // 地面到達
        if (m.boss) {
          // ボスが地面到達 → 都市への最大ダメージ（2都市破壊）
          this._impactCity(m.tx, m.ty);
          this._impactCity(m.tx, m.ty);
          this._bossAlive = false;
          this._bossIdx = -1;
        } else {
          this._impactCity(m.tx, m.ty);
        }
        this.meteors.splice(i, 1);
        // 破壊されたボスのインデックスを無効化
        if (this._bossIdx === i) { this._bossAlive = false; this._bossIdx = -1; }
        else if (this._bossIdx > i) this._bossIdx--;
        continue;
      }
      const ratio = m.spd / dist;
      const nx = m.x + dx * ratio * dt;
      const ny = m.y + dy * ratio * dt;

      // 軌跡
      const trailMax = m.fast ? 8 : (m.boss ? 4 : 5);
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > trailMax) m.trail.shift();

      // 岩のゆっくり回転
      m.rot += (m.fast ? 0.8 : (m.boss ? 0.15 : 0.4)) * dt;

      m.x = nx;
      m.y = ny;
    }

    // ミサイル移動
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      if (!ms) { this.missiles.splice(i, 1); continue; }
      if (ms.done) { this.missiles.splice(i, 1); continue; }
      ms.x += ms.vx * dt;
      ms.y += ms.vy * dt;
      const dx = ms.tx - ms.x;
      const dy = ms.ty - ms.y;
      if (Math.hypot(dx, dy) < MISSILE_SPD * dt * 1.5 + 4) {
        this._spawnBlast(ms.tx, ms.ty, ms.big);
        ms.done = true;
      }
    }

    // 爆発更新
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (!b) { this.blasts.splice(i, 1); continue; }
      if (b.growing) {
        b.r += BLAST_RATE * dt;
        if (b.r >= b.maxR) { b.r = b.maxR; b.growing = false; }
      } else {
        b.r -= BLAST_SHRINK * dt;
        if (b.r <= 0) { this.blasts.splice(i, 1); continue; }
      }

      // 爆発ヒット判定
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (!m) continue;
        if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + m.r) continue;
        if (m.hitBlastIds.has(b.id)) continue;
        m.hitBlastIds.add(b.id);
        m.hp -= b.damage;

        if (m.hp <= 0) {
          // 撃墜
          if (m.boss) {
            this.score += BOSS_SCORE_BASE * (this._stage + 1);
            this._bossAlive = false;
            this._bossIdx = -1;
            // ステージクリア！
            this._stageClearing = true;
            this._stageClearTimer = 2.0;
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
  _spawnMeteor(forceGiant) {
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

    let r;
    if (forceGiant || Math.random() < 0.12) {
      r = GIANT_R_THRESH + Math.random() * (METEOR_R_MAX - GIANT_R_THRESH);
    } else {
      r = Math.max(METEOR_R_MIN,
        METEOR_R_MIN + Math.random() * Math.random() * (GIANT_R_THRESH - METEOR_R_MIN)
      );
    }

    const isFast = Math.random() < FAST_CHANCE;
    const spd = isFast ? this._calcFastSpd() : this._calcNormalSpd();
    const maxHp = calcMeteorHP(r);
    const seed = _nextMeteorSeed++;

    this.meteors.push({
      x, y: -METEOR_R_MAX - 4,
      tx, ty, spd, r,
      hp: maxHp, maxHp,
      fast: isFast,
      boss: false,
      trail: [],
      rot: Math.random() * Math.PI * 2, // 初期回転角
      verts: makeRockVerts(r, seed),    // 岩石ポリゴン頂点（固定）
      seed,
      hitBlastIds: new Set(),
    });
  }

  // ---- ボス隕石スポーン ----
  _spawnBoss() {
    const r = BOSS_R_MIN + Math.random() * (BOSS_R_MAX - BOSS_R_MIN);
    const x = 60 + Math.random() * (W - 120);
    const tx = 60 + Math.random() * (W - 120);
    const ty = GROUND_Y;
    const spd = BOSS_SPD_MIN + Math.random() * (BOSS_SPD_MAX - BOSS_SPD_MIN);
    const maxHp = BOSS_HP_BASE + this._stage * 2;
    const seed = _nextMeteorSeed++;

    const bossEntry = {
      x, y: -r - 4,
      tx, ty, spd, r,
      hp: maxHp, maxHp,
      fast: false,
      boss: true,
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

  // 爆発スポーン
  _spawnBlast(x, y, big) {
    const maxR  = big ? BLAST_GROW_BIG : BLAST_GROW;
    const dmg   = big ? BLAST_DAMAGE_BIG : BLAST_DAMAGE_NORMAL;
    const id    = _nextBlastId++;
    this.blasts.push({ x, y, r: 4, maxR, growing: true, big: !!big, id, damage: dmg });
    this.engine.audio.pick();
    if (big) {
      this.engine.audio.sequence([
        { freq: 330, dur: 0.06, type: 'square', vol: 0.18 },
        { freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.16 },
      ]);
    }
  }

  // 都市ダメージ
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
    const stageLabel = 'ST ' + (this._stage + 1);
    this.engine.text(stageLabel, 52, 8, 15, p.mid, 'left');
    this.engine.text('SCORE ' + this.score, W - 12, 8, 15, p.fg, 'right');
    this.engine.text('BEST  ' + this.high, W - 12, 28, 12, p.dim, 'right');
    const aliveCount = this.cities.filter(Boolean).length;
    this.engine.text('CITY ' + aliveCount, 52, 28, 12, p.warn, 'left');

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
      const damageFrac = m.maxHp > 1 ? clamp(1 - m.hp / m.maxHp, 0, 1) : 0;
      const bodyColor = m.boss ? p.warn : (m.fast ? p.hi : p.bad);

      // 軌跡
      const trailColor = m.boss ? p.warn : (m.fast ? p.hi : p.bad);
      for (let t = 0; t < m.trail.length; t++) {
        const pt = m.trail[t];
        if (!pt) continue;
        const alpha = ((t + 1) / (m.trail.length + 1)) * (m.fast ? 0.55 : (m.boss ? 0.50 : 0.35));
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        // 軌跡はシンプルな小円
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, m.r * 0.35), 0, Math.PI * 2);
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.restore();
      }

      // ---- 岩石ポリゴン本体 ----
      if (m.verts && m.verts.length >= 3) {
        const lineW = clamp(1.8 - damageFrac * 0.8, 0.5, 2.5);
        const bodyAlpha = clamp(1 - damageFrac * 0.4, 0.3, 1);

        ctx.save();
        ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        ctx.translate(m.x, m.y);
        ctx.rotate(m.rot);

        // ボス：薄いフィル
        if (m.boss) {
          ctx.beginPath();
          ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
          for (let vi = 1; vi < m.verts.length; vi++) {
            ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
          }
          ctx.closePath();
          ctx.fillStyle = p.dark;
          ctx.globalAlpha = clamp(0.5 - damageFrac * 0.2, 0, 1);
          ctx.fill();
          ctx.globalAlpha = clamp(bodyAlpha, 0, 1);
        }

        // アウトライン（ダメージを受けるほど暗くなる）
        ctx.beginPath();
        ctx.moveTo(m.verts[0].dx, m.verts[0].dy);
        for (let vi = 1; vi < m.verts.length; vi++) {
          ctx.lineTo(m.verts[vi].dx, m.verts[vi].dy);
        }
        ctx.closePath();
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = lineW;
        ctx.stroke();

        // ダメージ亀裂感：hp/maxHpが下がったら内側に追加の折れ線
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

        // ---- ボスのHP バー ----
        if (m.boss) {
          const barW  = Math.min(m.r * 2.2, W - 20);
          const barX  = m.x - barW / 2;
          const barY  = m.y + m.r + 8;
          const barH  = 5;
          const hpFrac = clamp(m.hp / m.maxHp, 0, 1);
          // 背景
          ctx.save();
          ctx.fillStyle = p.dark;
          ctx.fillRect(barX, barY, barW, barH);
          // HP量
          ctx.fillStyle = damageFrac > 0.6 ? p.bad : p.warn;
          ctx.fillRect(barX, barY, Math.max(0, barW * hpFrac), barH);
          // 枠
          ctx.strokeStyle = p.mid;
          ctx.lineWidth = 1;
          ctx.strokeRect(barX, barY, barW, barH);
          ctx.restore();
          // BOSSラベル
          this.engine.text('BOSS', m.x, m.y - m.r - 18, 13, p.warn, 'center');
        } else {
          // ---- 通常隕石のHP ピップ ----
          if (m.maxHp >= 2) {
            const pipR  = 3;
            const pipGap = 8;
            const totalW = m.maxHp * pipR * 2 + (m.maxHp - 1) * (pipGap - pipR * 2);
            const startX = m.x - totalW / 2;
            const pipY   = m.y + m.r + 6;
            for (let k = 0; k < m.maxHp; k++) {
              const px = startX + k * pipGap + pipR;
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

    // ---- 爆発 ----
    for (const b of this.blasts) {
      if (!b) continue;
      const alpha = b.growing ? 0.85 : clamp(b.r / b.maxR, 0, 1) * 0.7;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
      ctx.strokeStyle = b.big ? p.warn : p.mid;
      ctx.lineWidth = b.growing ? (b.big ? 3.5 : 2.5) : (b.big ? 2.5 : 1.5);
      ctx.stroke();
      if (b.big && b.r > 10) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.r * 0.65), 0, Math.PI * 2);
        ctx.strokeStyle = p.hi;
        ctx.lineWidth = 1;
        ctx.globalAlpha = clamp(alpha * 0.5, 0, 1);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r * 0.55), 0, Math.PI * 2);
      ctx.fillStyle = b.big ? p.warn : p.mid;
      ctx.globalAlpha = clamp(alpha * 0.18, 0, 1);
      ctx.fill();
      ctx.restore();
    }

    // ---- ステージクリアオーバーレイ ----
    if (this._stageClearing) {
      const alpha = clamp(this._stageClearTimer / 2.0, 0, 1);
      ctx.save();
      ctx.globalAlpha = clamp(alpha * 0.85, 0, 1);
      ctx.fillStyle = p.dark;
      ctx.fillRect(0, H / 2 - 60, W, 120);
      ctx.restore();
      this.engine.text('STAGE ' + (this._stage + 1) + ' CLEAR!', W / 2, H / 2 - 42, 28, p.warn, 'center');
      this.engine.text('NEXT STAGE', W / 2, H / 2 + 4, 16, p.fg, 'center');
    }

    // ---- ゲームオーバーオーバーレイ ----
    if (this.dead) {
      this.engine.rect(0, H / 2 - 90, W, 180, p.dark);
      this.engine.stroke(0, H / 2 - 90, W, 180, p.bad, 2);
      this.engine.text('GAME OVER', W / 2, H / 2 - 72, 32, p.bad, 'center');
      this.engine.text('SCORE  ' + this.score, W / 2, H / 2 - 28, 20, p.fg, 'center');
      this.engine.text('BEST   ' + this.high,  W / 2, H / 2 + 2,  16, p.dim, 'center');
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 42, 16, p.mid, 'center');
    }

    // ---- クールダウン残量インジケータ（砲台の上に小さくバー表示） ----
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
      const frac = clamp(this._bigRecharge / BIG_RECHARGE_SEC, 0, 1);
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
