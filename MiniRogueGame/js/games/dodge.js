// DODGE : 弾幕ミサイル回避ゲーム（板野サーカス風）
// ヴァルキリー型ファイターを操作して、右から迫るホーミングミサイルをかわす。
// ミサイルは最大旋回速度で制限されるため、慣性でオーバーシュートしてらせん軌跡（板野サーカス）を描く。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'dodge',
  title: 'DODGE',
  desc: '弾幕ミサイルを避けろ',
  glyph: '>',
};

// ---- 定数 ----
const PLAY_LEFT   = 0;
const PLAY_RIGHT  = W;
const PLAY_TOP    = 72;         // HUDの下
const PLAY_BOTTOM = H - 20;

// 自機移動の追従速度（ドラッグ追従、ピクセル/秒）
const FIGHTER_FOLLOW = 420;
// キーボード操作速度（ピクセル/秒）
const KEY_SPEED = 200;
// 自機の最大移動可能X（左2/3エリアに制限）
const FIGHTER_MAX_X = W * 0.62;
// 当たり判定半径（自機）
const HIT_R = 10;
// ミサイル先端の当たり判定半径
const MISSILE_R = 5;

// ミサイルトレイルの最大保存点数
const TRAIL_MAX = 60;

// スターフィールドの星数
const STAR_COUNT = 50;

// ---- ユーティリティ ----
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

// 角度差を -π～π に正規化
function angleDiff(to, from) {
  let d = to - from;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

// ---- スターフィールド ----
class Star {
  constructor() {
    this.reset(Math.random() * W);
  }
  reset(x) {
    this.x = x;
    this.y = PLAY_TOP + Math.random() * (PLAY_BOTTOM - PLAY_TOP);
    this.speed = 20 + Math.random() * 80;  // 速いほど前景感
    this.r = this.speed > 70 ? 1.5 : 1;
  }
  update(dt) {
    this.x -= this.speed * dt;
    if (this.x < 0) this.reset(W);
  }
}

// ---- ミサイル ----
class Missile {
  constructor(x, y, angle, speed, turnRate) {
    this.x = x;
    this.y = y;
    this.angle = angle;       // 現在の進行角度（ラジアン）
    this.speed = speed;
    this.turnRate = turnRate; // 最大旋回速度（ラジアン/秒）
    this.trail = [];          // [{x,y}] 最近の軌跡
    this.age = 0;             // 経過時間（秒）
    this.dead = false;
    // 画面外判定用マージン
    this._oob = 0;
  }

  update(dt, targetX, targetY) {
    if (this.dead) return;
    this.age += dt;

    // ターゲットへの方向角度を計算
    const dx = targetX - this.x;
    const dy = targetY - this.y;
    const desired = Math.atan2(dy, dx);

    // 旋回速度でクランプしながら方向を更新（オーバーシュート→板野サーカス軌道）
    const diff = angleDiff(desired, this.angle);
    const maxTurn = this.turnRate * dt;
    this.angle += clamp(diff, -maxTurn, maxTurn);

    // 位置更新
    this.x += Math.cos(this.angle) * this.speed * dt;
    this.y += Math.sin(this.angle) * this.speed * dt;

    // トレイル記録（間引き：毎フレーム全保存→スムーズ）
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > TRAIL_MAX) this.trail.shift();

    // 画面外に出たら削除フラグ
    if (this.x < -40 || this.x > W + 40 || this.y < PLAY_TOP - 40 || this.y > PLAY_BOTTOM + 40) {
      this._oob++;
      if (this._oob > 5) this.dead = true;
    } else {
      this._oob = 0;
    }
  }
}

// ---- メインゲームクラス ----
export class Game extends Scene {
  enter() {
    const p = P();
    // 自機
    this.fx = 80;
    this.fy = (PLAY_TOP + PLAY_BOTTOM) / 2;

    // ミサイル配列
    this.missiles = [];

    // スターフィールド
    this.stars = Array.from({ length: STAR_COUNT }, () => new Star());

    // スコア・時間
    this.elapsed = 0;    // 生存時間（秒）
    this.score = 0;      // 表示スコア（ms単位で整数）
    this.high = this.engine.storage.getHigh(meta.id) || 0;

    // スポーン管理
    this.spawnTimer = 0;
    this.spawnInterval = 1.8; // 最初のスポーン間隔（秒）
    this.volleyCount = 1;     // 1回のスポーンで出るミサイル数

    // 爆発エフェクト
    this.explosion = null;   // { x, y, t, dur }

    // ゲームオーバーフラグ
    this.dead = false;

    // キーボード入力状態（方向）
    this.keyDir = { x: 0, y: 0 };

    // エンジン炎アニメーション用
    this.flameTick = 0;
  }

  onInput(action, data) {
    if (this.dead) {
      if (action === 'back') { this.engine.toMenu(); return; }
      if (action === 'tap' || action === 'confirm') { this.enter(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    // キーボード方向（update内で参照）
    if (action === 'up')    { this.keyDir.y = -1; }
    if (action === 'down')  { this.keyDir.y =  1; }
    if (action === 'left')  { this.keyDir.x = -1; }
    if (action === 'right') { this.keyDir.x =  1; }
  }

  update(dt) {
    if (this.dead) {
      // 爆発エフェクトのカウントダウン
      if (this.explosion) {
        this.explosion.t += dt;
        if (this.explosion.t > this.explosion.dur) this.explosion = null;
      }
      return;
    }

    this.elapsed += dt;
    this.score = Math.floor(this.elapsed * 100);
    this.flameTick += dt;

    // ---- 自機移動 ----
    const ptr = this.engine.pointer;

    if (ptr.down) {
      // ドラッグ追従：ポインタ座標へスムーズ移動
      const tdx = ptr.x - this.fx;
      const tdy = ptr.y - this.fy;
      const dist = Math.sqrt(tdx * tdx + tdy * tdy);
      if (dist > 1) {
        const step = Math.min(FIGHTER_FOLLOW * dt, dist);
        this.fx += (tdx / dist) * step;
        this.fy += (tdy / dist) * step;
      }
    } else {
      // キーボード操作（矢印キー）
      if (this.keyDir.x !== 0 || this.keyDir.y !== 0) {
        const klen = Math.sqrt(this.keyDir.x ** 2 + this.keyDir.y ** 2);
        this.fx += (this.keyDir.x / klen) * KEY_SPEED * dt;
        this.fy += (this.keyDir.y / klen) * KEY_SPEED * dt;
      }
    }
    // キー方向はフレームごとにリセット（onInputで毎回セットされる）
    this.keyDir.x = 0;
    this.keyDir.y = 0;

    // 自機を遊技エリア内にクランプ
    this.fx = clamp(this.fx, PLAY_LEFT + 20, FIGHTER_MAX_X);
    this.fy = clamp(this.fy, PLAY_TOP + 16, PLAY_BOTTOM - 16);

    // ---- スターフィールド更新 ----
    for (const s of this.stars) s.update(dt);

    // ---- ミサイルスポーン ----
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnVolley();

      // 難易度カーブ：時間経過でスポーン間隔を短く、ボレー数を増やす
      const t = this.elapsed;
      this.spawnInterval = Math.max(0.45, 1.8 - t * 0.028);
      this.volleyCount   = 1 + Math.floor(t / 8);  // 8秒ごとに+1
      this.spawnTimer    = this.spawnInterval;
    }

    // ---- ミサイル更新 ----
    for (const m of this.missiles) {
      m.update(dt, this.fx, this.fy);
    }
    // 死亡ミサイルを除去
    this.missiles = this.missiles.filter(m => !m.dead);

    // ---- 当たり判定 ----
    for (const m of this.missiles) {
      if (m.dead) continue;
      const dx = m.x - this.fx;
      const dy = m.y - this.fy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < HIT_R + MISSILE_R) {
        this._gameOver(m.x, m.y);
        return;
      }
    }
  }

  _spawnVolley() {
    const t = this.elapsed;
    // 基本ミサイル速度（時間で加速）
    const baseSpeed = 90 + t * 1.5;
    // 旋回速度（最初は緩く、段々鋭く）
    const baseTurnRate = 1.0 + t * 0.04;

    const count = this.volleyCount;
    for (let i = 0; i < count; i++) {
      // スポーン位置：右端、垂直方向はランダム
      const sy = PLAY_TOP + 30 + Math.random() * (PLAY_BOTTOM - PLAY_TOP - 60);
      // 初期角度：左方向に±30度のブレ
      const angleSpread = (Math.random() - 0.5) * (Math.PI / 3);
      const initAngle = Math.PI + angleSpread;  // 基本は左向き（π）
      // ボレー内の速度・旋回にランダムさを加えて軌道を散らす
      const speed    = baseSpeed    * (0.8 + Math.random() * 0.5);
      const turnRate = baseTurnRate * (0.6 + Math.random() * 0.8);

      this.missiles.push(new Missile(W + 10, sy, initAngle, speed, turnRate));
    }
  }

  _gameOver(ex, ey) {
    this.dead = true;
    this.engine.audio.bad();
    this.explosion = { x: ex, y: ey, t: 0, dur: 1.2 };

    // ハイスコア保存
    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    } else {
      this.high = this.engine.storage.getHigh(meta.id) || this.high;
    }
  }

  render(ctx) {
    const p = P();

    // ---- 遊技エリア背景 ----
    this.engine.rect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP, p.dark);

    // ---- スターフィールド ----
    for (const s of this.stars) {
      ctx.fillStyle = p.dim;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // ---- ミサイル描画（トレイル + 先端） ----
    for (const m of this.missiles) {
      this._drawMissile(ctx, m, p);
    }

    // ---- 自機描画 ----
    if (!this.dead || (this.explosion && this.explosion.t < 0.15)) {
      this._drawFighter(ctx, this.fx, this.fy, p);
    }

    // ---- 爆発エフェクト ----
    if (this.explosion) {
      this._drawExplosion(ctx, this.explosion, p);
    }

    // ---- HUD ----
    // タイトル（左、BACKボタン右）
    this.engine.text('DODGE', 52, 10, 20, p.fg, 'left');
    // スコア（TIME表示）
    const secStr = (this.elapsed).toFixed(1) + 's';
    this.engine.text('TIME ' + secStr, 52, 34, 14, p.mid, 'left');
    // ハイスコア
    const hiSec = (this.high / 100).toFixed(1) + 's';
    this.engine.text('BEST ' + hiSec, W - 8, 10, 14, p.dim, 'right');

    // ---- ゲームオーバーオーバーレイ ----
    if (this.dead) {
      this._drawGameOver(ctx, p);
    }
  }

  _drawMissile(ctx, m, p) {
    const trail = m.trail;
    if (trail.length < 2) return;

    // トレイルを描画（古い点ほど透明）
    // globalAlphaを操作するので描画後に必ずリセットする
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // トレイルを短いセグメントに分けてグラデーション描画
      const len = trail.length;
      for (let i = 1; i < len; i++) {
        const frac = i / len;               // 0(古い)→1(新しい)
        const alpha = clamp(frac * frac * 0.85, 0, 1);
        ctx.globalAlpha = alpha;

        // 新しい側はwarn、古い側はdimに色変化
        ctx.strokeStyle = frac > 0.6 ? p.warn : p.dim;
        ctx.lineWidth = frac > 0.7 ? 2 : 1;

        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }

    // ミサイル先端（明るい四角形 + 光彩）
    const head = trail[trail.length - 1];
    ctx.globalAlpha = 1;

    // 明るいコア
    ctx.fillStyle = p.hi;
    ctx.fillRect(head.x - 3, head.y - 2, 6, 4);
    // 外側光彩（warn色）
    ctx.fillStyle = p.warn;
    ctx.fillRect(head.x - 4, head.y - 3, 8, 6);
    // コア再描画
    ctx.fillStyle = p.hi;
    ctx.fillRect(head.x - 2, head.y - 1, 4, 2);

    ctx.lineCap = 'butt';
    ctx.lineWidth = 1;
  }

  _drawFighter(ctx, x, y, p) {
    // ヴァルキリー風の小型ファイター（三角矢印型）
    // 機体本体：横長の鋭い三角形（右向き）
    ctx.fillStyle = p.fg;
    ctx.beginPath();
    ctx.moveTo(x + 18, y);           // 機首
    ctx.lineTo(x - 10, y - 8);       // 上翼端
    ctx.lineTo(x - 6, y);            // 中央くびれ
    ctx.lineTo(x - 10, y + 8);       // 下翼端
    ctx.closePath();
    ctx.fill();

    // ハイライト（機体上部）
    ctx.fillStyle = p.hi;
    ctx.beginPath();
    ctx.moveTo(x + 18, y);
    ctx.lineTo(x - 4, y - 3);
    ctx.lineTo(x - 6, y);
    ctx.closePath();
    ctx.fill();

    // コックピット
    ctx.fillStyle = p.mid;
    ctx.fillRect(x + 2, y - 2, 8, 4);

    // エンジン炎（点滅アニメーション）
    const flameLen = 6 + Math.sin(this.flameTick * 18) * 4;
    const flameW   = 3 + Math.sin(this.flameTick * 22) * 1.5;
    ctx.fillStyle = p.warn;
    ctx.fillRect(x - 10 - flameLen, y - flameW / 2, flameLen, flameW);
    ctx.fillStyle = p.hi;
    ctx.fillRect(x - 10 - flameLen * 0.5, y - flameW * 0.3, flameLen * 0.5, flameW * 0.6);

    // 当たり判定可視化（デバッグ用・通常は非表示）
    // ctx.strokeStyle = p.bad; ctx.lineWidth=1; ctx.beginPath(); ctx.arc(x,y,HIT_R,0,Math.PI*2); ctx.stroke();
  }

  _drawExplosion(ctx, exp, p) {
    const frac = exp.t / exp.dur;        // 0→1
    const r    = 8 + frac * 60;
    const savedAlpha = ctx.globalAlpha;
    try {
      // 外輪（広がる）
      ctx.globalAlpha = clamp((1 - frac) * 0.8, 0, 1);
      ctx.strokeStyle = p.bad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r, 0, Math.PI * 2);
      ctx.stroke();

      // 内側フラッシュ
      ctx.globalAlpha = clamp((1 - frac * 2) * 0.9, 0, 1);
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r * 0.5, 0, Math.PI * 2);
      ctx.fill();

      // 中心白フラッシュ
      ctx.globalAlpha = clamp((1 - frac * 3) * 1.0, 0, 1);
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.arc(exp.x, exp.y, r * 0.2, 0, Math.PI * 2);
      ctx.fill();
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
      ctx.lineWidth = 1;
    }
  }

  _drawGameOver(ctx, p) {
    // 半透明パネル
    const savedAlpha = ctx.globalAlpha;
    try {
      ctx.globalAlpha = 0.82;
      ctx.fillStyle = p.dark;
      ctx.fillRect(30, H / 2 - 90, W - 60, 200);
    } finally {
      ctx.globalAlpha = clamp(savedAlpha, 0, 1);
    }
    this.engine.stroke(30, H / 2 - 90, W - 60, 200, p.bad, 2);

    this.engine.text('GAME OVER', W / 2, H / 2 - 72, 30, p.bad, 'center');

    const secStr = (this.elapsed).toFixed(1) + 's';
    this.engine.text('TIME  ' + secStr, W / 2, H / 2 - 28, 20, p.fg, 'center');

    const hiSec = (this.high / 100).toFixed(1) + 's';
    this.engine.text('BEST  ' + hiSec, W / 2, H / 2 + 4, 16, p.dim, 'center');

    // 点滅テキスト（elapsed使って点滅）
    const blink = Math.floor(this.elapsed * 3) % 2 === 0;
    if (blink) {
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 50, 16, p.mid, 'center');
    }

    this.engine.text('‹ BACK to menu', W / 2, H / 2 + 78, 12, p.dim, 'center');
  }
}
