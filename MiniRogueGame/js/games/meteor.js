// METEOR : ミサイルコマンド風迎撃ゲーム
// 隕石をタップで迎撃ミサイルを発射し、爆風で破壊して街を守れ。
// 全都市が破壊されたらゲームオーバー。波が進むほど隕石が増える。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'meteor',
  title: 'METEOR',
  desc: '降る隕石を迎撃して街を守れ',
  glyph: '*',
};

// ---- 定数 ----
const CITY_COUNT   = 5;           // 街の数
const CITY_W       = 28;          // 街ブロック幅
const CITY_H       = 18;          // 街ブロック高さ
const GROUND_Y     = H - 40;      // 地面ライン Y座標
const BATTERY_X    = W / 2;       // 発射台 X
const BATTERY_Y    = GROUND_Y - 4;// 発射台 Y（地面直上）
const MISSILE_SPD  = 340;         // ミサイル速度 px/s
const BLAST_GROW   = 80;          // 爆発最大半径
const BLAST_RATE   = 110;         // 爆発拡大速度 px/s
const BLAST_SHRINK = 60;          // 爆発縮小速度 px/s
const MAX_MISSILES = 4;           // 同時発射可能数
const METEOR_SCORE = 10;          // 隕石1機撃墜スコア

// ---- 都市X座標を均等に配置 ----
const CITY_SPACING = (W - CITY_W * CITY_COUNT) / (CITY_COUNT + 1);
const CITY_XS = Array.from({ length: CITY_COUNT }, (_, i) =>
  Math.floor(CITY_SPACING + i * (CITY_W + CITY_SPACING))
);

export class Game extends Scene {
  enter() {
    this.score    = 0;
    this.high     = this.engine.storage.getHigh(meta.id);
    this.wave     = 1;
    this.dead     = false;

    // 都市の生存状態 [true=生存, false=破壊]
    this.cities   = Array(CITY_COUNT).fill(true);

    // 隕石リスト { x, y, tx, ty, spd, trail: [{x,y},...] }
    this.meteors  = [];
    // 発射済みミサイル { x, y, tx, ty, vx, vy, done }
    this.missiles = [];
    // 爆発リスト { x, y, r, growing }
    this.blasts   = [];
    // 爆発エフェクト（被弾都市） { x, y, r, t }
    this.cityBlasts = [];

    // 波ごとの隕石スポーンタイマ
    this._spawnTimer  = 0;
    this._spawnDelay  = this._calcSpawnDelay();
    this._meteorCount = 0; // 今の波で出した隕石数
    this._waveQuota   = this._calcWaveQuota(); // 今の波の合計隕石数

    // 波クリア後の休憩タイマ
    this._waveBreak   = 0;
    this._waveActive  = true;
  }

  // 波が進むほどスポーン間隔が短くなる
  _calcSpawnDelay() {
    return Math.max(0.5, 2.2 - (this.wave - 1) * 0.18);
  }

  // 波ごとの隕石総数
  _calcWaveQuota() {
    return 4 + (this.wave - 1) * 2;
  }

  // 隕石の落下速度
  _calcMeteorSpd() {
    const base = 50 + (this.wave - 1) * 12;
    return base + Math.random() * 30;
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
      this._fireMissile(data.x, data.y);
    }
  }

  // ミサイル発射（発射台から指定座標へ）
  _fireMissile(tx, ty) {
    // 地面より下へは撃てない。BACKボタン領域も除外。
    if (ty >= GROUND_Y) return;
    if (this.missiles.filter(m => !m.done).length >= MAX_MISSILES) return;

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
    });
    this.engine.audio.move();
  }

  // ---- update ----
  update(dt) {
    if (this.dead) return;

    // 波休憩中
    if (this._waveBreak > 0) {
      this._waveBreak -= dt;
      if (this._waveBreak <= 0) {
        this._waveBreak = 0;
        this.wave++;
        this._spawnTimer  = 0;
        this._spawnDelay  = this._calcSpawnDelay();
        this._meteorCount = 0;
        this._waveQuota   = this._calcWaveQuota();
        this._waveActive  = true;
      }
      // 残存中の隕石・ミサイル・爆発は動かし続ける
    }

    // 隕石スポーン
    if (this._waveActive && this._meteorCount < this._waveQuota) {
      this._spawnTimer += dt;
      if (this._spawnTimer >= this._spawnDelay) {
        this._spawnTimer = 0;
        this._spawnMeteor();
        this._meteorCount++;
      }
    }

    // 隕石移動 + 地面到達判定
    for (let i = this.meteors.length - 1; i >= 0; i--) {
      const m = this.meteors[i];
      const dx = m.tx - m.x;
      const dy = m.ty - m.y;
      const dist = Math.hypot(dx, dy);

      if (dist < m.spd * dt) {
        // 地面到達 → 最寄り都市を破壊
        this._impactCity(m.tx, m.ty);
        this.meteors.splice(i, 1);
        continue;
      }
      const ratio = m.spd / dist;
      const nx = m.x + dx * ratio * dt;
      const ny = m.y + dy * ratio * dt;

      // 軌跡を更新（最大6点）
      m.trail.push({ x: m.x, y: m.y });
      if (m.trail.length > 6) m.trail.shift();
      m.x = nx;
      m.y = ny;
    }

    // ミサイル移動
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const ms = this.missiles[i];
      if (ms.done) { this.missiles.splice(i, 1); continue; }

      ms.x += ms.vx * dt;
      ms.y += ms.vy * dt;

      // 目標に到達したら爆発
      const dx = ms.tx - ms.x;
      const dy = ms.ty - ms.y;
      if (Math.hypot(dx, dy) < MISSILE_SPD * dt * 1.5) {
        this._spawnBlast(ms.tx, ms.ty);
        ms.done = true;
      }
    }

    // 爆発更新
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      if (b.growing) {
        b.r += BLAST_RATE * dt;
        if (b.r >= BLAST_GROW) { b.r = BLAST_GROW; b.growing = false; }
      } else {
        b.r -= BLAST_SHRINK * dt;
        if (b.r <= 0) { this.blasts.splice(i, 1); continue; }
      }
      // 爆発半径内の隕石を撃墜
      for (let j = this.meteors.length - 1; j >= 0; j--) {
        const m = this.meteors[j];
        if (Math.hypot(m.x - b.x, m.y - b.y) <= b.r) {
          this.meteors.splice(j, 1);
          this.score += METEOR_SCORE;
          this.engine.audio.good();
        }
      }
    }

    // 都市爆発エフェクト更新
    for (let i = this.cityBlasts.length - 1; i >= 0; i--) {
      const cb = this.cityBlasts[i];
      cb.t -= dt;
      cb.r += 60 * dt;
      if (cb.t <= 0) this.cityBlasts.splice(i, 1);
    }

    // 波クリア判定
    if (this._waveActive &&
        this._meteorCount >= this._waveQuota &&
        this.meteors.length === 0 &&
        this.blasts.length === 0) {
      this._waveActive = false;
      this._waveBreak  = 1.8; // 次の波まで休憩
      this.engine.audio.sequence();
    }

    // ゲームオーバー判定（全都市破壊）
    if (this.cities.every(c => !c)) {
      this.dead = true;
      this.engine.audio.bad();
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // 隕石をランダムにスポーン（上端から画面内の都市/地面を狙う）
  _spawnMeteor() {
    const x = 20 + Math.random() * (W - 40);

    // 生き残っている都市をターゲットにする（70%の確率）、残り30%はランダム
    const alive = this.cities.map((c, i) => c ? i : -1).filter(i => i >= 0);
    let tx;
    if (alive.length > 0 && Math.random() < 0.7) {
      const idx = alive[Math.floor(Math.random() * alive.length)];
      tx = CITY_XS[idx] + CITY_W / 2 + (Math.random() * 20 - 10);
    } else {
      tx = 20 + Math.random() * (W - 40);
    }
    const ty = GROUND_Y;

    this.meteors.push({
      x, y: -8,
      tx, ty,
      spd: this._calcMeteorSpd(),
      trail: [],
    });
  }

  // 爆発スポーン
  _spawnBlast(x, y) {
    this.blasts.push({ x, y, r: 4, growing: true });
    this.engine.audio.pick();
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
    if (bestIdx >= 0 && bestDist < CITY_W * 2) {
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
    this.engine.text('METEOR', 52, 10, 18, p.fg, 'left');
    this.engine.text('WAVE ' + this.wave, W / 2, 10, 16, p.mid, 'center');
    this.engine.text('SCORE ' + this.score, W - 12, 10, 16, p.fg, 'right');
    this.engine.text('HI ' + this.high, W - 12, 32, 13, p.dim, 'right');

    // 都市数インジケータ（生き残り都市数を数値で表示）
    const aliveCount = this.cities.filter(Boolean).length;
    this.engine.text('CITIES ' + aliveCount, 52, 32, 13, p.warn, 'left');

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
      ctx.save();
      ctx.globalAlpha = Math.max(0, cb.t / 0.7) * 0.9;
      ctx.beginPath();
      ctx.arc(cb.x, cb.y, cb.r, 0, Math.PI * 2);
      ctx.fillStyle = p.bad;
      ctx.fill();
      ctx.restore();
    }

    // ---- ミサイル ----
    for (const ms of this.missiles) {
      if (ms.done) continue;
      ctx.save();
      ctx.strokeStyle = p.warn;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(BATTERY_X, BATTERY_Y);
      ctx.lineTo(ms.x, ms.y);
      ctx.stroke();
      // 先端の輝点
      ctx.beginPath();
      ctx.arc(ms.x, ms.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.hi;
      ctx.fill();
      ctx.restore();
    }

    // ---- 隕石 ----
    for (const m of this.meteors) {
      // 軌跡
      for (let t = 0; t < m.trail.length; t++) {
        const alpha = (t + 1) / (m.trail.length + 1) * 0.6;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(m.trail[t].x, m.trail[t].y, 2, 0, Math.PI * 2);
        ctx.fillStyle = p.bad;
        ctx.fill();
        ctx.restore();
      }
      // 本体
      ctx.save();
      ctx.beginPath();
      ctx.arc(m.x, m.y, 5, 0, Math.PI * 2);
      ctx.fillStyle = p.bad;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(m.x, m.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.hi;
      ctx.fill();
      ctx.restore();
      // グリフ
      this.engine.text('*', m.x, m.y - 10, 12, p.warn, 'center');
    }

    // ---- 爆発 ----
    for (const b of this.blasts) {
      const alpha = b.growing ? 0.85 : (b.r / BLAST_GROW) * 0.7;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      // 外リング
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.strokeStyle = p.warn;
      ctx.lineWidth = b.growing ? 3 : 2;
      ctx.stroke();
      // 内側の淡い塗り
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r * 0.7, 0, Math.PI * 2);
      ctx.fillStyle = p.mid;
      ctx.globalAlpha = Math.max(0, alpha * 0.25);
      ctx.fill();
      ctx.restore();
    }

    // ---- 波クリア中の表示 ----
    if (!this._waveActive && !this.dead && this._waveBreak > 0) {
      this.engine.rect(0, H / 2 - 40, W, 80, p.dark);
      this.engine.text('WAVE ' + (this.wave) + ' CLEAR!', W / 2, H / 2 - 28, 24, p.hi, 'center');
      this.engine.text('NEXT WAVE IN...', W / 2, H / 2 + 4, 16, p.mid, 'center');
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

  // 星空（シードなし、固定の擬似乱数）
  _drawStarfield(ctx, p) {
    ctx.save();
    ctx.fillStyle = p.dim;
    // 再現可能な星座（固定シード的な配置）
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
