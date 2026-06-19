// METEOR : ミサイルコマンド風迎撃ゲーム
// 隕石をタップで迎撃ミサイルを発射し、爆風で破壊して街を守れ。
// 全都市が破壊されたらゲームオーバー。時間が経つほど隕石が増え続ける。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'meteor',
  title: 'METEOR',
  desc: '降る隕石を迎撃して街を守れ',
  glyph: '*',
};

// ---- 定数 ----
const CITY_COUNT    = 5;           // 街の数
const CITY_W        = 28;          // 街ブロック幅
const CITY_H        = 18;          // 街ブロック高さ
const GROUND_Y      = H - 40;      // 地面ライン Y座標
const BATTERY_X     = W / 2;       // 発射台 X
const BATTERY_Y     = GROUND_Y - 4;// 発射台 Y（地面直上）
const MISSILE_SPD   = 160;         // ミサイル速度 px/s
const BLAST_GROW    = 40;          // 通常爆発最大半径（小さめ）
const BLAST_GROW_BIG= 110;         // ビッグ爆発最大半径
const BLAST_RATE    = 70;          // 爆発拡大速度 px/s
const BLAST_SHRINK  = 45;          // 爆発縮小速度 px/s
const MAX_MISSILES  = 5;           // 同時発射可能数
const METEOR_SCORE_BASE = 10;      // 隕石1機あたりのベーススコア（サイズ倍率あり）

// ビッグブラスト（特殊爆発）の初期残弾数と補充間隔
const BIG_CHARGES_MAX = 3;         // 最大残弾数
const BIG_RECHARGE_SEC = 12;       // 1発補充に必要な秒数

// 隕石スポーン間隔の初期値と最小値（連続スポーン・徐々に短縮）
const SPAWN_DELAY_START = 3.2;     // ゲーム開始時のスポーン間隔（秒）
const SPAWN_DELAY_MIN   = 0.55;    // 最も速くなった時のスポーン間隔（秒）
const SPAWN_RAMP_TIME   = 180;     // この秒数かけてSPAWN_DELAY_MINまで短縮

// ---- 隕石速度（もっともっと遅く：通常はゆったりとした落下感） ----
const METEOR_SPD_MIN    = 12;      // 通常の最低速度 px/s（非常に遅い）
const METEOR_SPD_MAX    = 22;      // 通常の最大速度 px/s（序盤〜終盤の通常隕石）
// 時間経過で少し速くなる上限（最終的な通常最大速度）
const METEOR_SPD_MAX_LATE = 32;    // ゲーム後半の通常上限 px/s

// ---- 高速隕石（レアな緊張感要素） ----
// スポーン時に FAST_CHANCE の確率で高速隕石を出す
const FAST_CHANCE       = 0.15;    // 高速隕石のスポーン確率（約15%）
const FAST_SPD_MIN      = 65;      // 高速隕石の最低速度 px/s
const FAST_SPD_MAX      = 100;     // 高速隕石の最大速度 px/s

// 隕石サイズレンジ
const METEOR_R_MIN      = 5;       // 最小半径
const METEOR_R_MAX      = 18;      // 最大半径

// ---- HPの閾値（半径に基づく）----
// r < SMALL_R_THRESH  → 小 (HP=1)
// r < LARGE_R_THRESH  → 中 (HP=2)
// r >= LARGE_R_THRESH → 大 (HP=3)
const SMALL_R_THRESH  = 9;   // これ未満は小隕石（HP=1）
const LARGE_R_THRESH  = 14;  // これ以上は大隕石（HP=3）

// ビッグブラストのダメージ量（通常=1, ビッグ=2）
const BLAST_DAMAGE_NORMAL = 1;
const BLAST_DAMAGE_BIG    = 2;

// ---- 都市X座標を均等に配置 ----
const CITY_SPACING = (W - CITY_W * CITY_COUNT) / (CITY_COUNT + 1);
const CITY_XS = Array.from({ length: CITY_COUNT }, (_, i) =>
  Math.floor(CITY_SPACING + i * (CITY_W + CITY_SPACING))
);

// ---- ヘルパー：数値クランプ ----
function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// 隕石の半径からHPを計算
function calcMeteorHP(r) {
  if (r < SMALL_R_THRESH) return 1;   // 小：1発で破壊
  if (r < LARGE_R_THRESH) return 2;   // 中：2発で破壊
  return 3;                            // 大：3発で破壊
}

// ---- ユニークID（ブラストに付与して重複ダメージを防ぐ） ----
let _nextBlastId = 1;

export class Game extends Scene {
  enter() {
    this.score      = 0;
    this.high       = this.engine.storage.getHigh(meta.id);
    this.dead       = false;

    // 経過時間（スポーンレート・速度計算に使う）
    this._elapsed   = 0;

    // 都市の生存状態 [true=生存, false=破壊]
    this.cities     = Array(CITY_COUNT).fill(true);

    // 隕石リスト
    // { x, y, tx, ty, spd, r, hp, maxHp, fast, trail: [{x,y},...], hitBlastIds: Set }
    // hitBlastIds: このフレームまでにダメージを与えたblast.idのSet（重複ダメージ防止）
    this.meteors    = [];
    // 発射済みミサイル { x, y, tx, ty, vx, vy, done, big }
    this.missiles   = [];
    // 爆発リスト { x, y, r, maxR, growing, big, id, damage }
    // id: ユニークID（各隕石はこのIDを記録して同一ブラストで2度被弾しない）
    // damage: このブラストが与えるHP減少量（通常=1, ビッグ=2）
    this.blasts     = [];
    // 爆発エフェクト（被弾都市） { x, y, r, t }
    this.cityBlasts = [];

    // スポーンタイマ
    this._spawnTimer = 0;

    // ビッグブラスト残弾 & 補充タイマ
    this._bigCharges  = BIG_CHARGES_MAX;
    this._bigRecharge = 0; // 0〜BIG_RECHARGE_SEC で1発補充
    this._bigArmed    = false; // ビッグ照準モード（ONで次のタップが広範囲攻撃）
  }

  // ビッグ残弾HUDのタップ判定領域
  _bigBtnRect() { return { x: W / 2 - 48, y: 44, w: 112, h: 28 }; }

  // 現在の経過時間からスポーン間隔を計算
  _spawnDelay() {
    const t = clamp(this._elapsed, 0, SPAWN_RAMP_TIME);
    const frac = t / SPAWN_RAMP_TIME;
    return SPAWN_DELAY_START - (SPAWN_DELAY_START - SPAWN_DELAY_MIN) * frac;
  }

  // 通常隕石の速度（時間とともに少しだけ速くなる、依然ゆっくり）
  _calcNormalSpd() {
    const t = clamp(this._elapsed, 0, SPAWN_RAMP_TIME);
    const frac = t / SPAWN_RAMP_TIME;
    // 時間経過で最大値だけ上昇（最小値は変えない）
    const spdMax = METEOR_SPD_MAX + (METEOR_SPD_MAX_LATE - METEOR_SPD_MAX) * frac;
    return METEOR_SPD_MIN + Math.random() * (spdMax - METEOR_SPD_MIN);
  }

  // 高速隕石の速度
  _calcFastSpd() {
    return FAST_SPD_MIN + Math.random() * (FAST_SPD_MAX - FAST_SPD_MIN);
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
      // BIGボタンをタップ → 照準モードをトグル（残弾がある時のみON）
      const b = this._bigBtnRect();
      if (data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h) {
        this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
        this.engine.audio.select();
        return;
      }
      // 空をタップ → 照準モードなら広範囲ブラスト、通常なら通常ブラスト（タップ位置を狙える）
      const big = this._bigArmed;
      this._fireMissile(data.x, data.y, big);
      if (big) this._bigArmed = false; // 撃ったら解除（1タップ1発）
    }
    if (action === 'confirm') {
      // キーボード（PC）：ビッグ照準モードのトグル
      this._bigArmed = this._bigArmed ? false : (this._bigCharges > 0);
    }
  }

  // ミサイル発射
  // big=true のときビッグブラスト（残弾消費）、false のとき通常
  _fireMissile(tx, ty, big) {
    // 地面より下へは撃てない
    if (ty >= GROUND_Y) return;
    if (this.missiles.filter(m => !m.done).length >= MAX_MISSILES) return;

    if (big) {
      if (this._bigCharges <= 0) {
        // 残弾なし：何もしない
        return;
      }
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
    this.engine.audio.move();
  }

  // ---- update ----
  update(dt) {
    if (this.dead) return;

    // 経過時間更新
    this._elapsed += dt;

    // ビッグブラスト補充（満タン未満のとき）
    if (this._bigCharges < BIG_CHARGES_MAX) {
      this._bigRecharge += dt;
      if (this._bigRecharge >= BIG_RECHARGE_SEC) {
        this._bigRecharge -= BIG_RECHARGE_SEC;
        this._bigCharges++;
      }
    } else {
      // 満タンのときはタイマをリセット
      this._bigRecharge = 0;
    }

    // 隕石スポーン（連続・徐々に増加）
    this._spawnTimer += dt;
    const delay = this._spawnDelay();
    if (this._spawnTimer >= delay) {
      this._spawnTimer -= delay;
      if (this._spawnTimer < 0) this._spawnTimer = 0;
      this._spawnMeteor();
    }

    // 隕石移動 + 地面到達判定
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      if (!m || m.x == null) { this.meteors.splice(i, 1); continue; } // 防御
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);

      if (dist < m.spd * dt + 1) {
        // 地面到達 → 最寄り都市を破壊
        this._impactCity(m.tx, m.ty);
        this.meteors.splice(i, 1);
        continue;
      }
      const ratio = m.spd / dist;
      const nx = m.x + dx * ratio * dt;
      const ny = m.y + dy * ratio * dt;

      // 軌跡を更新（最大5点；高速隕石は長め）
      const trailMax = m.fast ? 8 : 5;
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > trailMax) m.trail.shift();
      m.x = nx;
      m.y = ny;
    }

    // ミサイル移動
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      if (!ms) { this.missiles.splice(i, 1); continue; } // 防御
      if (ms.done) { this.missiles.splice(i, 1); continue; }

      ms.x += ms.vx * dt;
      ms.y += ms.vy * dt;

      // 目標に到達したら爆発
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
      if (!b) { this.blasts.splice(i, 1); continue; } // 防御
      if (b.growing) {
        b.r += BLAST_RATE * dt;
        if (b.r >= b.maxR) { b.r = b.maxR; b.growing = false; }
      } else {
        b.r -= BLAST_SHRINK * dt;
        if (b.r <= 0) { this.blasts.splice(i, 1); continue; }
      }

      // ---- 爆発半径内の隕石へダメージを与える ----
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (!m) continue; // 防御

        // 接触判定
        if (Math.hypot(m.x - b.x, m.y - b.y) > b.r + m.r) continue;

        // 同一ブラストによる重複ダメージを防ぐ（1ブラスト1接触まで）
        if (m.hitBlastIds.has(b.id)) continue;
        m.hitBlastIds.add(b.id);

        // HPを減らす
        m.hp -= b.damage;

        if (m.hp <= 0) {
          // 撃墜：サイズに応じてスコア加算（大きいほど高得点）
          const sizeBonus = Math.ceil(m.maxHp);
          this.score += METEOR_SCORE_BASE * sizeBonus;
          this.meteors.splice(j, 1);
          this.engine.audio.good();
        }
        // HP>0 の場合は隕石を残したまま（見た目のダメージ表示はrender側で処理）
      }
    }

    // 都市爆発エフェクト更新
    for (let i = this.cityBlasts.length - 1; i >= 0; i--) {
      const cb = this.cityBlasts[i];
      if (!cb) { this.cityBlasts.splice(i, 1); continue; } // 防御
      cb.t -= dt;
      cb.r += 60 * dt;
      if (cb.t <= 0) this.cityBlasts.splice(i, 1);
    }

    // ゲームオーバー判定（全都市破壊）
    if (this.cities.every(c => !c)) {
      this.dead = true;
      this.engine.audio.bad();
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // 隕石をランダムにスポーン（上端から都市/地面を狙う）
  _spawnMeteor() {
    const x = 18 + Math.random() * (W - 36);

    // 生き残っている都市をターゲットにする（70%の確率）、残り30%はランダム地点
    const alive = this.cities.map((c, i) => c ? i : -1).filter(i => i >= 0);
    let tx;
    if (alive.length > 0 && Math.random() < 0.7) {
      const idx = alive[Math.floor(Math.random() * alive.length)];
      tx = CITY_XS[idx] + CITY_W / 2 + (Math.random() * 24 - 12);
    } else {
      tx = 18 + Math.random() * (W - 36);
    }
    const ty = GROUND_Y;

    // サイズをランダムに（小さめが多め）
    const r = Math.max(METEOR_R_MIN,
      METEOR_R_MIN + Math.random() * Math.random() * (METEOR_R_MAX - METEOR_R_MIN)
    );

    // ---- 高速隕石判定（FAST_CHANCE の確率） ----
    const isFast = Math.random() < FAST_CHANCE;
    const spd = isFast ? this._calcFastSpd() : this._calcNormalSpd();

    // HP計算（サイズに応じて）
    const maxHp = calcMeteorHP(r);

    this.meteors.push({
      x, y: -METEOR_R_MAX - 4,
      tx, ty,
      spd,
      r,
      hp: maxHp,     // 現在HP
      maxHp,         // 最大HP（ダメージ表示に使う）
      fast: isFast,  // 高速フラグ（描画分岐に使う）
      trail: [],
      hitBlastIds: new Set(), // 既にダメージを受けたブラストのID集合
    });
  }

  // 爆発スポーン（big=trueでビッグ爆発）
  _spawnBlast(x, y, big) {
    const maxR  = big ? BLAST_GROW_BIG : BLAST_GROW;
    const dmg   = big ? BLAST_DAMAGE_BIG : BLAST_DAMAGE_NORMAL;
    const id    = _nextBlastId++;
    this.blasts.push({ x, y, r: 4, maxR, growing: true, big: !!big, id, damage: dmg });
    this.engine.audio.pick();
    if (big) {
      // ビッグブラストは派手な音
      this.engine.audio.sequence([
        { freq: 330, dur: 0.06, type: 'square', vol: 0.18 },
        { freq: 220, dur: 0.12, type: 'sawtooth', vol: 0.16 },
      ]);
    }
  }

  // 地面到達した隕石が最寄りの生存都市を破壊
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

    // ---- HUD（左上はBACKボタンがx:6..48を占有するためx>=52から描く） ----
    const lvl = Math.floor(this._elapsed / 30) + 1;
    this.engine.text('LV ' + lvl, 52, 8, 15, p.mid, 'left');
    this.engine.text('SCORE ' + this.score, W - 12, 8, 15, p.fg, 'right');
    this.engine.text('BEST  ' + this.high, W - 12, 28, 12, p.dim, 'right');

    // 都市数インジケータ
    const aliveCount = this.cities.filter(Boolean).length;
    this.engine.text('CITY ' + aliveCount, 52, 28, 12, p.warn, 'left');

    // ビッグブラスト残弾 HUD
    this._drawBigChargeHUD(ctx, p);

    // ---- 星空（固定の装飾） ----
    this._drawStarfield(ctx, p);

    // ---- 地面ライン ----
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
      // 先端の輝点
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, ms.big ? 4 : 2.5, 0, Math.PI * 2);
      ctx.fillStyle = ms.big ? p.warn : p.hi;
      ctx.fill();
      ctx.restore();
    }

    // ---- 隕石（ワイヤーフレーム＋軌跡＋HPダメージ表示） ----
    for (const m of this.meteors) {
      if (!m) continue;

      // ---- ダメージ割合（0=無傷, 1=瀕死） ----
      // maxHp が 1 の場合、hp は 1 しかあり得ないので ratio=0 固定
      const damageFrac = m.maxHp > 1
        ? clamp(1 - m.hp / m.maxHp, 0, 1)
        : 0;

      // ---- 軌跡（フェードアウト）----
      // 高速隕石は明るい p.hi 色の長い軌跡で識別しやすくする
      const trailColor = m.fast ? p.hi : p.bad;
      for (let t = 0; t < m.trail.length; t++) {
        const pt = m.trail[t];
        if (!pt) continue;
        const alpha = ((t + 1) / (m.trail.length + 1)) * (m.fast ? 0.65 : 0.45);
        ctx.save();
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, Math.max(1, m.r * (m.fast ? 0.45 : 0.5)), 0, Math.PI * 2);
        ctx.strokeStyle = trailColor;
        ctx.lineWidth = m.fast ? 1.5 : 1;
        ctx.stroke();
        ctx.restore();
      }

      // ---- 本体：ワイヤーフレーム円 ----
      // 高速隕石 → p.hi（明るい白緑）で識別
      // ダメージを受けた隕石 → アウトラインが少し暗く/細くなる（ひび割れ感）
      const bodyColor = m.fast ? p.hi : p.bad;
      // ダメージを受けるほど lineWidth が細くなり、透明度が下がる（くたびれた感）
      const lineW = clamp(1.5 - damageFrac * 0.7, 0.5, 2.0);
      const bodyAlpha = clamp(1 - damageFrac * 0.35, 0.3, 1);

      ctx.save();
      ctx.globalAlpha = bodyAlpha;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r, 0, Math.PI * 2);
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = lineW;
      ctx.stroke();

      // 内側ハイライト点（高速隕石はより明るく）
      ctx.beginPath();
      ctx.arc(m.x - m.r * 0.25, m.y - m.r * 0.25, Math.max(1, m.r * 0.22), 0, Math.PI * 2);
      ctx.fillStyle = m.fast ? p.fg : p.warn;
      ctx.globalAlpha = clamp((m.fast ? 0.9 : 0.7) - damageFrac * 0.4, 0, 1);
      ctx.fill();
      ctx.restore();

      // ---- HP ピップ表示（maxHp >= 2 の隕石のみ） ----
      // 隕石の下に小さな四角いドットでHP残量を表示（残数分が明るく光る）
      if (m.maxHp >= 2) {
        const pipR  = 3;
        const pipGap = 8;
        const totalW = m.maxHp * pipR * 2 + (m.maxHp - 1) * (pipGap - pipR * 2);
        const startX = m.x - totalW / 2;
        const pipY   = m.y + m.r + 6;

        for (let k = 0; k < m.maxHp; k++) {
          const px = startX + k * pipGap + pipR;
          const alive = k < m.hp; // まだ残っているHP
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

    // ---- 爆発 ----
    for (const b of this.blasts) {
      if (!b) continue;
      const alpha = b.growing ? 0.85 : clamp(b.r / b.maxR, 0, 1) * 0.7;
      ctx.save();
      ctx.globalAlpha = clamp(alpha, 0, 1);
      // 外リング
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r), 0, Math.PI * 2);
      ctx.strokeStyle = b.big ? p.warn : p.mid;
      ctx.lineWidth = b.growing ? (b.big ? 3.5 : 2.5) : (b.big ? 2.5 : 1.5);
      ctx.stroke();
      // ビッグブラストは二重リング
      if (b.big && b.r > 10) {
        ctx.beginPath();
        ctx.arc(b.x, b.y, Math.max(1, b.r * 0.65), 0, Math.PI * 2);
        ctx.strokeStyle = p.hi;
        ctx.lineWidth = 1;
        ctx.globalAlpha = clamp(alpha * 0.5, 0, 1);
        ctx.stroke();
      }
      // 内側の淡い塗り
      ctx.beginPath();
      ctx.arc(b.x, b.y, Math.max(1, b.r * 0.55), 0, Math.PI * 2);
      ctx.fillStyle = b.big ? p.warn : p.mid;
      ctx.globalAlpha = clamp(alpha * 0.18, 0, 1);
      ctx.fill();
      ctx.restore();
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
  }

  // ビッグブラスト残弾 HUD
  _drawBigChargeHUD(ctx, p) {
    const baseX = W / 2 - 40;
    const baseY = 52;
    // 照準モード中はボタン枠を強調＋ヒント表示
    const b = this._bigBtnRect();
    if (this._bigArmed) {
      this.engine.stroke(b.x, b.y, b.w, b.h, p.hi, 2);
      this.engine.text('TAP SKY', b.x + b.w + 6, baseY, 11, p.hi, 'left');
    }
    this.engine.text('BIG:', baseX, baseY, 13, this._bigArmed ? p.hi : p.dim, 'left');
    // 残弾アイコン（●=あり、○=なし）
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
    // 補充ゲージ（満タン未満のときのみ表示）
    if (this._bigCharges < BIG_CHARGES_MAX) {
      const gaugeX = baseX;
      const gaugeY = baseY + 18;
      const gaugeW = 96;
      const frac = clamp(this._bigRecharge / BIG_RECHARGE_SEC, 0, 1);
      this.engine.rect(gaugeX, gaugeY, gaugeW, 4, p.dark);
      this.engine.rect(gaugeX, gaugeY, Math.floor(gaugeW * frac), 4, p.warn);
    }
  }

  // 星空（シードなし、固定の擬似乱数的配置）
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

  // 発射台（中央底）
  _drawBattery(ctx, p) {
    const bx = BATTERY_X;
    const by = BATTERY_Y;
    // 台座
    this.engine.rect(bx - 14, by - 2, 28, 8, p.mid);
    // 砲身（上向き三角形）
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

  // 都市ブロック描画
  _drawCity(ctx, p, idx) {
    const x = CITY_XS[idx];
    const y = GROUND_Y - CITY_H;
    if (!this.cities[idx]) {
      // 廃墟の残骸
      this.engine.rect(x + 2, y + CITY_H - 5, CITY_W - 4, 5, p.dim);
      this.engine.text('x', x + CITY_W / 2, y + CITY_H - 14, 11, p.bad, 'center');
      return;
    }
    // 建物本体
    this.engine.rect(x, y, CITY_W, CITY_H, p.mid);
    // 屋上ライン
    this.engine.rect(x, y, CITY_W, 3, p.fg);
    // 窓
    this.engine.rect(x + 4, y + 6, 6, 6, p.bg);
    this.engine.rect(x + 14, y + 6, 6, 6, p.bg);
    // 窓の明かり（緑＝生存）
    this.engine.rect(x + 5, y + 7, 4, 4, p.hi);
    this.engine.rect(x + 15, y + 7, 4, 4, p.hi);
  }
}
