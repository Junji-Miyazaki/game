// LANDER : RCSスラスタで角運動量を制御しながら月面に軟着陸するゲーム。
// 姿勢ジェットは角加速度（トルク）を与えるだけで、離すと角速度ωが持続する（ダンピングなし）。
// 左1/3押しっぱなし：左RCSジェット（反時計方向トルク）
// 右1/3押しっぱなし：右RCSジェット（時計方向トルク）
// 中央1/3押しっぱなし：メインエンジン点火（機体上方向に推力）
// 成功着陸でステージクリア → 累計スコア加算 → 次ステージへ。クラッシュでゲームオーバー。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'lander',
  title: 'LANDER',
  desc: 'RCS姿勢制御で月面に軟着陸',
  glyph: '^',
};

// ---- 物理チューニング定数（超スローモーション＆Newtonian RCS）----
// ステージ1の基準値。ステージ毎に難度係数を掛ける。
// ※前回からさらに約1/5へ減速。ごくゆっくり、少しずつの姿勢微調整で操作する。
const GRAVITY_BASE      = 0.5;   // 重力加速度（px/s²）極微弱
const THRUST_ACCEL      = 1.6;   // メインエンジン推力加速度（px/s²）
const ANG_ACCEL         = 4.0;   // 姿勢ジェット角加速度（度/s²）左右どちらも噴射可
const FUEL_MAX          = 100;   // 燃料最大値
const FUEL_RATE_MAIN    = 7;     // メインエンジン燃料消費（/s）
const FUEL_RATE_RCS     = 2;     // RCSジェット燃料消費（/s）
const SAFE_VY           = 14;    // 着陸許容縦速度（px/s）
const SAFE_VX           = 8;     // 着陸許容横速度（px/s）
const SAFE_ANGLE        = 18;    // 着陸許容傾き（度）
const SAFE_OMEGA        = 12;    // 着陸許容角速度（度/s）
const PAD_W_BASE        = 54;    // ステージ1の着陸パッド幅（px）
const TERRAIN_SEGS      = 18;    // 地形セグメント数
const LANDER_START_Y    = 90;    // 初期Y座標
const GUIDE_THRESHOLD   = 30;    // ON COURSE判定距離（px）
const GUIDE_PTS         = 32;    // 軌道ガイドの点数

// ---- ステージ難度パラメータ ----
// stage: 1始まり。重力・パッド幅を段階的に調整。
function stageParams(stage) {
  const s = Math.min(stage, 8); // 8ステージ以上は固定
  return {
    gravity:   GRAVITY_BASE * (1 + (s - 1) * 0.08),  // 重力は毎ステージ8%増
    padW:      Math.max(24, PAD_W_BASE - (s - 1) * 4), // パッド幅は毎ステージ4px減
    stageBonus: s * 50,  // ステージ乗算ボーナス
  };
}

// ---- 地形生成 ----
function buildTerrain(padW) {
  const segW = W / TERRAIN_SEGS;
  const pts = [];
  const FLOOR_Y   = 608;
  const FLOOR_MIN = 525;

  // パッドを置くセグメントを1つランダム選定
  const available = [];
  for (let i = 2; i < TERRAIN_SEGS - 3; i++) available.push(i);
  const padSeg = available[Math.floor(Math.random() * available.length)];

  for (let i = 0; i <= TERRAIN_SEGS; i++) {
    const x = i * segW;
    let y;
    if (i === 0 || i === TERRAIN_SEGS) {
      y = FLOOR_Y;
    } else {
      y = FLOOR_MIN + Math.random() * (FLOOR_Y - FLOOR_MIN);
    }
    pts.push({ x, y });
  }

  // パッド部分を平坦に
  const midX  = (padSeg + 0.5) * segW;
  const flatY = FLOOR_MIN + 20 + Math.random() * 50;
  const lx    = midX - padW / 2;
  pts[padSeg].y     = flatY;
  pts[padSeg + 1].y = flatY;
  if (padSeg > 0)                  pts[padSeg - 1].y = (pts[padSeg - 1].y + flatY) / 2;
  if (padSeg + 2 <= TERRAIN_SEGS)  pts[padSeg + 2].y = (pts[padSeg + 2].y + flatY) / 2;

  const pad = { x: lx, y: flatY, w: padW };
  return { pts, pad };
}

// ---- 星（背景）----
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

// ---- 降下軌道ガイド（始点→パッド中央への放物線点列）----
function buildGuide(startX, startY, pad, numPts) {
  const targetX = pad.x + pad.w / 2;
  const targetY = pad.y;
  const pts = [];
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    pts.push({
      x: startX + (targetX - startX) * t,
      y: startY + (targetY - startY) * (t * t),
    });
  }
  return pts;
}

export class Game extends Scene {

  enter() {
    // ゲーム全体の初期化（リトライ時もここから）
    this.high       = this.engine.storage.getHigh(meta.id) || 0;
    this.totalScore = 0;   // 累計スコア（ランの合計）
    this.stage      = 1;   // 現在ステージ
    this.state      = 'play'; // 'play' | 'cleared' | 'gameover'
    this._initStage();
  }

  // ---- 1ステージ初期化 ----
  _initStage() {
    this.state    = 'play';
    this.fuel     = FUEL_MAX;
    this.angle    = (Math.random() - 0.5) * 8;   // ごく小さな初期傾き（度）
    this.omega    = 0;                            // 角速度（度/s）- 初期ゼロ
    this.x        = W / 2 + (Math.random() - 0.5) * 50;
    this.y        = LANDER_START_Y;
    this.vx       = (Math.random() - 0.5) * 6;   // ほぼ静止した初期横速度
    this.vy       = 5;                            // ゆっくりとした初期下降速度

    // 今フレームの制御状態
    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;

    // ステージ難度
    const sp = stageParams(this.stage);
    this._gravity  = sp.gravity;
    this._padW     = sp.padW;

    // 地形・パッド
    const terrain  = buildTerrain(this._padW);
    this.terrainPts = terrain.pts;
    this.pad        = terrain.pad;
    this.stars      = this.stars || buildStars(40); // 星は全ステージ共有

    // 降下軌道ガイド
    this.guidePts = buildGuide(this.x, this.y, this.pad, GUIDE_PTS);

    // 軌道追従スコア用累積
    this._guideDevTotal = 0;
    this._guideDevCount = 0;

    // ステージクリア結果
    this._stageScore = 0;
    this._guideBonus = 0;

    // 爆発エフェクト
    this.particles   = [];

    // キーボード押しっぱなし状態（onInputが離散なのでupdate内で独自管理）
    this._keys = this._keys || { left: false, right: false, up: false };
  }

  // ---- ガイド上最近傍点との距離 ----
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

  // ---- キーボード離散入力 ----
  onInput(action, data) {
    if (this.state === 'cleared') {
      // ステージクリア画面：タップで次ステージ
      if (action === 'tap' || action === 'confirm') {
        this.stage += 1;
        this._initStage();
      }
      if (action === 'back') { this.engine.toMenu(); }
      return;
    }
    if (this.state === 'gameover') {
      // ゲームオーバー画面：タップでステージ1からリスタート
      if (action === 'tap' || action === 'confirm') {
        this.totalScore = 0;
        this.stage      = 1;
        this._initStage();
      }
      if (action === 'back') { this.engine.toMenu(); }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }

    // キーボード押しっぱなし追跡（keydown/keyupが離散なのでフラグ管理）
    // ここでは 'up/left/right/confirm' をワンショットパルスとして処理
    if (action === 'left')    this._keys.left  = true;
    if (action === 'right')   this._keys.right = true;
    if (action === 'up')      this._keys.up    = true;
    if (action === 'confirm') this._keys.up    = true;
  }

  // ---- 毎フレームのロジック ----
  update(dt) {
    if (this.state !== 'play') {
      this._updateParticles(dt);
      // キーフラグをリセット（結果画面中は使わない）
      if (this._keys) { this._keys.left = false; this._keys.right = false; this._keys.up = false; }
      return;
    }

    const ptr = this.engine.pointer;

    // ---- 制御入力の判定 ----
    // ポインタ（タッチ/マウス押しっぱなし）＋キーボードフラグ
    this._thrustMain = false;
    this._thrustRcsL = false;
    this._thrustRcsR = false;

    // ptr.y>52：上部のBACKボタン/HUD帯では操作を拾わない（左ジェットがBACKと干渉しないように）
    if (ptr.down && ptr.y > 52) {
      if (ptr.x < 120)       this._thrustRcsL = true; // 画面左：反時計回りジェット
      else if (ptr.x > 240)  this._thrustRcsR = true; // 画面右：時計回りジェット
      else                   this._thrustMain  = true; // 中央：メイン噴射
    }
    // キーボード（追加。ワンショットパルス扱い）
    if (this._keys) {
      if (this._keys.left)  { this._thrustRcsL = true; }
      if (this._keys.right) { this._thrustRcsR = true; }
      if (this._keys.up)    { this._thrustMain  = true; }
      // ワンショット：次フレームにはリセット
      this._keys.left  = false;
      this._keys.right = false;
      this._keys.up    = false;
    }

    // ---- 姿勢RCSジェット（角加速度→ω積分。ダンピングなし）----
    if (this._thrustRcsL && this.fuel > 0) {
      // 左ジェット：反時計方向にトルク（ω減少）
      this.omega -= ANG_ACCEL * dt;
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }
    if (this._thrustRcsR && this.fuel > 0) {
      // 右ジェット：時計方向にトルク（ω増加）
      this.omega += ANG_ACCEL * dt;
      this.fuel   = Math.max(0, this.fuel - FUEL_RATE_RCS * dt);
    }

    // ---- メインエンジン（機体のangleに沿った推力）----
    if (this._thrustMain && this.fuel > 0) {
      // angle=0が上向き。機体上方向 = angle方向に加速
      const rad = (this.angle - 90) * Math.PI / 180;
      this.vx  += Math.cos(rad) * THRUST_ACCEL * dt;
      this.vy  += Math.sin(rad) * THRUST_ACCEL * dt;
      this.fuel = Math.max(0, this.fuel - FUEL_RATE_MAIN * dt);
    }

    // ---- 角速度を角度に積分（ダンピングなし＝純粋な角運動量保存）----
    this.angle += this.omega * dt;
    // angle を -180〜180 に正規化
    this.angle  = ((this.angle + 180) % 360 + 360) % 360 - 180;

    // ---- 重力（真下方向）----
    this.vy += this._gravity * dt;

    // ---- 位置更新 ----
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // ---- 水平クランプ（画面端で弱く跳ね返る）----
    const PAD = 14;
    if (this.x < PAD)     { this.x = PAD;     this.vx =  Math.abs(this.vx) * 0.3; }
    if (this.x > W - PAD) { this.x = W - PAD; this.vx = -Math.abs(this.vx) * 0.3; }
    // 上端クランプ
    if (this.y < 60) { this.y = 60; this.vy = Math.max(0, this.vy); }

    // ---- 軌道追従サンプリング（上半分のみ）----
    if (this.y < 420) {
      this._guideDevTotal += this._distToGuide(this.x, this.y);
      this._guideDevCount += 1;
    }

    // ---- 地形衝突判定 ----
    this._checkCollision();
  }

  // ---- 地形衝突・着陸判定 ----
  _checkCollision() {
    const terrainY = this._terrainYAt(this.x);
    const footY    = this.y + 16; // 機体底

    if (footY < terrainY) return;

    // パッドに着地しているか
    const onPad = (this.x >= this.pad.x && this.x <= this.pad.x + this.pad.w);

    // 角度の絶対値（-180〜180正規化後）
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const absOmega = Math.abs(this.omega);

    const safeLand = onPad &&
                     Math.abs(this.vy) <= SAFE_VY &&
                     Math.abs(this.vx) <= SAFE_VX &&
                     absAngle          <= SAFE_ANGLE &&
                     absOmega          <= SAFE_OMEGA;

    if (safeLand) {
      // ---- ステージクリア ----
      this.y  = terrainY - 16;
      this.vx = 0; this.vy = 0; this.omega = 0;

      const sp        = stageParams(this.stage);
      const fuelBonus = Math.round(this.fuel * 10);
      const softBonus = Math.round(Math.max(0, SAFE_VY - Math.abs(this.vy)) * 6);
      const uprBonus  = Math.round(Math.max(0, SAFE_ANGLE - absAngle) * 4);
      // 軌道追従ボーナス（偏差0→200、偏差80以上→0）
      let guideBonus = 0;
      if (this._guideDevCount > 0) {
        const avgDev = this._guideDevTotal / this._guideDevCount;
        guideBonus   = Math.round(Math.max(0, 200 - avgDev * 2.5));
      }
      this._guideBonus  = guideBonus;
      this._stageScore  = fuelBonus + softBonus + uprBonus + guideBonus + sp.stageBonus;
      this.totalScore  += this._stageScore;

      // ハイスコア更新
      if (this.totalScore > this.high) {
        this.high = this.totalScore;
        this.engine.storage.setHigh(meta.id, this.high);
      }

      this.engine.audio.good();
      this.state = 'cleared';

    } else {
      // ---- クラッシュ：ゲームオーバー ----
      this._explode();
      this.engine.audio.bad();

      // 累計スコアにわずかに加算（燃料残量のみ）
      this.totalScore += Math.round((this.fuel || 0) * 2);

      // ハイスコア更新
      if (this.totalScore > this.high) {
        this.high = this.totalScore;
        this.engine.storage.setHigh(meta.id, this.high);
      }

      this.state = 'gameover';
    }
  }

  // ---- 爆発パーティクル ----
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
    for (const pt of this.particles) {
      pt.x    += pt.vx * dt;
      pt.y    += pt.vy * dt;
      pt.vy   += this._gravity * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter(pt => pt.life > 0);
  }

  // ---- 地形のxでのYを線形補間 ----
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

  // ---- 毎フレームの描画 ----
  render(ctx) {
    const p = P();

    // ---- 背景：星 ----
    if (this.stars) {
      for (const s of this.stars) {
        ctx.fillStyle = s.r > 1 ? p.dim : p.dark;
        ctx.fillRect(s.x, s.y, s.r, s.r);
      }
    }

    // ---- 降下軌道ガイド ----
    this._drawGuide(ctx);

    // ---- 地形 ----
    if (this.terrainPts && this.terrainPts.length > 0) {
      ctx.fillStyle = p.dark;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (const pt of this.terrainPts) ctx.lineTo(pt.x, pt.y);
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = p.dim;
      ctx.lineWidth   = 2;
      ctx.beginPath();
      for (let i = 0; i < this.terrainPts.length; i++) {
        const pt = this.terrainPts[i];
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else         ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();
    }

    // ---- 着陸パッド ----
    if (this.pad) {
      const pd = this.pad;
      ctx.fillStyle = p.fg;
      ctx.fillRect(pd.x, pd.y, pd.w, 4);
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x,           pd.y, 4, 10);
      ctx.fillRect(pd.x + pd.w - 4, pd.y, 4, 10);
      // フラグ
      ctx.fillStyle = p.mid;
      ctx.fillRect(pd.x + pd.w / 2 - 1, pd.y - 22, 2, 22);
      ctx.fillStyle = p.warn;
      ctx.fillRect(pd.x + pd.w / 2 + 1, pd.y - 20, 12, 9);
      this.engine.text('PAD', pd.x + pd.w / 2, pd.y - 38, 10, p.mid, 'center');
    }

    // ---- 爆発パーティクル ----
    if (this.particles) {
      for (const pt of this.particles) {
        const t = Math.max(0, Math.min(1, pt.life / pt.max));
        ctx.fillStyle = t > 0.5 ? p.warn : p.bad;
        const r = Math.max(1, Math.round(t * 4));
        ctx.fillRect(pt.x - r / 2, pt.y - r / 2, r, r);
      }
    }

    // ---- ランダー本体 ----
    if (this.state !== 'gameover' || (this.particles && this.particles.length > 0)) {
      if (this.state === 'play' || this.state === 'cleared') {
        this._drawLander(ctx, this.x, this.y, this.angle);
      }
    }

    // ---- HUD ----
    this._drawHUD(ctx);

    // ---- コントロールヒント ----
    this._drawHints(ctx);

    // ---- 結果オーバーレイ ----
    if (this.state === 'cleared') {
      this._drawClearScreen(ctx);
    } else if (this.state === 'gameover') {
      this._drawGameOver(ctx);
    }
  }

  // ---- 降下軌道ガイドを点線で描画 ----
  // ON COURSE時はガイドを明るく表示し、OFF COURSEは薄暗く表示
  _drawGuide(ctx) {
    const p   = P();
    const pts = this.guidePts;
    if (!pts || pts.length < 2) return;

    // 現在の位置とガイドの距離
    const dist     = this.state === 'play' ? this._distToGuide(this.x, this.y) : Infinity;
    const onCourse = (dist <= GUIDE_THRESHOLD);

    ctx.save();
    if (onCourse) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = p.hi;
      ctx.lineWidth   = 2;
      ctx.setLineDash([5, 5]);
    } else {
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = p.warn;
      ctx.lineWidth   = 1;
      ctx.setLineDash([4, 8]);
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
    ctx.setLineDash([]);

    // 目標パッドのダイヤマーク
    const last = pts[pts.length - 1];
    ctx.fillStyle   = onCourse ? p.hi : p.warn;
    ctx.globalAlpha = onCourse ? 0.9 : 0.45;
    ctx.beginPath();
    ctx.moveTo(last.x,     last.y - 7);
    ctx.lineTo(last.x + 6, last.y);
    ctx.lineTo(last.x,     last.y + 7);
    ctx.lineTo(last.x - 6, last.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // ON COURSE インジケーター（プレイ中かつコース上のみ）
    if (onCourse && this.state === 'play') {
      this._drawOnCourseIndicator(ctx);
    }
  }

  // ---- ON COURSE インジケーター ----
  _drawOnCourseIndicator(ctx) {
    const p = P();
    ctx.save();
    // 機体の周囲にグローリング
    ctx.globalAlpha  = 0.45;
    ctx.strokeStyle  = p.hi;
    ctx.lineWidth    = 3;
    ctx.shadowColor  = p.hi;
    ctx.shadowBlur   = 8;
    ctx.beginPath();
    ctx.arc(this.x, this.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // テキスト表示（機体上部に）
    ctx.save();
    ctx.globalAlpha = 0.9;
    this.engine.text('ON COURSE', W / 2, 72, 12, p.hi, 'center');
    ctx.restore();
  }

  // ---- ランダー本体（4つのRCSノズル付き）----
  _drawLander(ctx, x, y, angleDeg) {
    const p   = P();
    if (typeof x !== 'number' || typeof y !== 'number') return;
    const rad = (angleDeg || 0) * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);

    // ---- メインエンジン炎（底ノズル）----
    if (this._thrustMain && this.fuel > 0) {
      const fl = 10 + Math.random() * 10;
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-6, 9);
      ctx.lineTo(0,  9 + fl);
      ctx.lineTo(6,  9);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(-3, 9);
      ctx.lineTo(0,  9 + fl * 0.5);
      ctx.lineTo(3,  9);
      ctx.closePath();
      ctx.fill();
    }

    // ---- 胴体 ----
    ctx.fillStyle   = p.mid;
    ctx.fillRect(-8, -10, 16, 18);
    ctx.strokeStyle = p.fg;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(-8, -10, 16, 18);

    // ---- キャビン窓 ----
    ctx.fillStyle = p.hi;
    ctx.fillRect(-4, -8, 8, 7);

    // ---- 左脚 ----
    ctx.strokeStyle = p.mid;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(-7, 8);   ctx.lineTo(-14, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(-18, 16); ctx.stroke();

    // ---- 右脚 ----
    ctx.beginPath(); ctx.moveTo(7, 8);    ctx.lineTo(14, 16);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16);  ctx.lineTo(18, 16);  ctx.stroke();

    // ---- メインエンジンノズル（底中央）----
    ctx.fillStyle = p.dark;
    ctx.fillRect(-5, 9, 10, 5);
    // ノズル枠：アクティブ時ハイライト
    ctx.strokeStyle = this._thrustMain && this.fuel > 0 ? p.warn : p.dim;
    ctx.lineWidth   = 1;
    ctx.strokeRect(-5, 9, 10, 5);

    // ---- 左RCSノズル（胴体左側、上寄り）----
    // 左RCSジェットはノズル左側から炎→機体が反時計方向に回転
    ctx.fillStyle = p.dark;
    ctx.fillRect(-12, -6, 4, 4);
    if (this._thrustRcsL && this.fuel > 0) {
      // 左ノズル炎（左方向に噴射）
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-12, -4);
      ctx.lineTo(-12 - (5 + Math.random() * 5), -2);
      ctx.lineTo(-12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = this._thrustRcsL && this.fuel > 0 ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-12, -6, 4, 4);

    // ---- 右RCSノズル（胴体右側、上寄り）----
    ctx.fillStyle = p.dark;
    ctx.fillRect(8, -6, 4, 4);
    if (this._thrustRcsR && this.fuel > 0) {
      // 右ノズル炎（右方向に噴射）
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(12, -4);
      ctx.lineTo(12 + (5 + Math.random() * 5), -2);
      ctx.lineTo(12, -6 + 1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = this._thrustRcsR && this.fuel > 0 ? p.warn : p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(8, -6, 4, 4);

    // ---- 姿勢補助RCSノズル（天頂、小さなトップノズル）----
    ctx.fillStyle   = p.dark;
    ctx.fillRect(-3, -14, 6, 4);
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 0.8;
    ctx.strokeRect(-3, -14, 6, 4);

    ctx.restore();
  }

  // ---- HUD（左上x>=52、カラーコード付き）----
  _drawHUD(ctx) {
    const p = P();

    // タイトル + ステージ
    this.engine.text('LANDER', 52, 8, 16, p.fg, 'left');
    this.engine.text('ST.' + this.stage, 52, 26, 12, p.mid, 'left');
    // ハイスコア
    this.engine.text('HI ' + (this.high || 0), W - 8, 8, 12, p.dim, 'right');
    // 累計スコア
    this.engine.text('TOT ' + this.totalScore, W - 8, 22, 12, p.mid, 'right');

    // 燃料バー
    const bx = 52, by = 44, bw = 110, bh = 10;
    this.engine.rect(bx, by, bw, bh, p.dark);
    const fr    = Math.max(0, Math.min(1, (this.fuel || 0) / FUEL_MAX));
    const fclr  = fr > 0.4 ? p.mid : fr > 0.15 ? p.warn : p.bad;
    if (fr > 0) this.engine.rect(bx, by, Math.round(bw * fr), bh, fclr);
    this.engine.stroke(bx, by, bw, bh, p.dim, 1);
    this.engine.text('FUEL', bx + bw + 4, by, 10, p.dim, 'left');

    if (this.state !== 'play') return;

    // 縦速度
    const vy    = this.vy || 0;
    const vyclr = Math.abs(vy) <= SAFE_VY ? p.mid : Math.abs(vy) <= SAFE_VY * 1.6 ? p.warn : p.bad;
    this.engine.text('VY ' + Math.round(vy), W - 8, 38, 11, vyclr, 'right');

    // 横速度
    const vx    = this.vx || 0;
    const vxclr = Math.abs(vx) <= SAFE_VX ? p.mid : Math.abs(vx) <= SAFE_VX * 2 ? p.warn : p.bad;
    this.engine.text('VX ' + Math.round(vx), W - 8, 52, 11, vxclr, 'right');

    // 角度
    const ang    = this.angle || 0;
    const absAng = Math.abs(((ang + 180) % 360 + 360) % 360 - 180);
    const aclr   = absAng <= SAFE_ANGLE ? p.mid : absAng <= SAFE_ANGLE * 2 ? p.warn : p.bad;
    this.engine.text('A ' + Math.round(ang) + '°', 52, 58, 11, aclr, 'left');

    // 角速度ω
    const om    = this.omega || 0;
    const omclr = Math.abs(om) <= SAFE_OMEGA ? p.mid : Math.abs(om) <= SAFE_OMEGA * 2 ? p.warn : p.bad;
    this.engine.text('ω ' + Math.round(om), W - 8, 66, 11, omclr, 'right');
  }

  // ---- 操作ヒント（画面下部3ゾーン：左回転／噴射／右回転）----
  _drawHints(ctx) {
    const p  = P();
    const bandY = H - 30, bandH = 30, hy = H - 22;

    // 各ゾーン：押下中はバンドを明るく塗り、ラベルを強調
    const zone = (x, w, active, label) => {
      this.engine.rect(x, bandY, w, bandH, active ? p.dim : p.dark);
      this.engine.text(label, x + w / 2, hy, 11, active ? p.hi : p.fg, 'center');
    };
    zone(0,   120, this._thrustRcsL, '◄ 左回転');     // 反時計回りジェット
    zone(120, 120, this._thrustMain, '▲ 噴射');       // メインエンジン
    zone(240, 120, this._thrustRcsR, '右回転 ►');     // 時計回りジェット

    // ゾーン区切り線
    ctx.strokeStyle = p.dark;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(120, bandY); ctx.lineTo(120, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(240, bandY); ctx.lineTo(240, H); ctx.stroke();
  }

  // ---- ステージクリア画面 ----
  _drawClearScreen(ctx) {
    const p = P();
    const cx = W / 2;
    const cy = H / 2;

    // 半透明パネル
    ctx.save();
    ctx.globalAlpha = 0.92;
    this.engine.rect(20, cy - 130, W - 40, 270, p.dark);
    this.engine.stroke(20, cy - 130, W - 40, 270, p.mid, 2);
    ctx.restore();

    this.engine.text('STAGE CLEAR!',    cx, cy - 116, 24, p.hi,   'center');
    this.engine.text('ST.' + this.stage + ' COMPLETE', cx, cy - 86, 13, p.mid, 'center');

    // スコア内訳（stageScoreからguide bonusを含む）
    this.engine.text('STAGE SCORE',     cx, cy - 62, 12, p.dim,  'center');
    this.engine.text('+' + (this._stageScore || 0), cx, cy - 46, 20, p.fg, 'center');
    this.engine.text('GUIDE BONUS +' + (this._guideBonus || 0), cx, cy - 22, 11, p.warn, 'center');

    // 区切り
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(40, cy + 4); ctx.lineTo(W - 40, cy + 4); ctx.stroke();

    this.engine.text('TOTAL SCORE',     cx, cy + 14, 12, p.dim,  'center');
    this.engine.text('' + this.totalScore, cx, cy + 30, 24, p.hi, 'center');
    this.engine.text('BEST ' + (this.high || 0), cx, cy + 60, 14, p.mid, 'center');

    // 次ステージ案内
    this.engine.text('TAP → STAGE ' + (this.stage + 1), cx, cy + 90, 14, p.fg, 'center');
    this.engine.text('BACK → MENU', cx, cy + 110, 11, p.dim, 'center');
  }

  // ---- ゲームオーバー画面 ----
  _drawGameOver(ctx) {
    const p = P();
    const cx = W / 2;
    const cy = H / 2;

    ctx.save();
    ctx.globalAlpha = 0.92;
    this.engine.rect(20, cy - 120, W - 40, 250, p.dark);
    this.engine.stroke(20, cy - 120, W - 40, 250, p.bad, 2);
    ctx.restore();

    this.engine.text('GAME OVER',         cx, cy - 106, 28, p.bad,  'center');
    this.engine.text('CRASHED! ST.' + this.stage, cx, cy - 74, 13, p.warn, 'center');

    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(40, cy - 54); ctx.lineTo(W - 40, cy - 54); ctx.stroke();

    this.engine.text('FINAL SCORE',       cx, cy - 40, 12, p.dim,  'center');
    this.engine.text('' + this.totalScore, cx, cy - 24, 26, p.fg,  'center');

    ctx.beginPath(); ctx.moveTo(40, cy + 8); ctx.lineTo(W - 40, cy + 8); ctx.stroke();

    this.engine.text('BEST',              cx, cy + 18, 11, p.dim,  'center');
    this.engine.text('' + (this.high || 0), cx, cy + 34, 22, p.hi, 'center');

    this.engine.text('TAP TO RETRY',      cx, cy + 68, 14, p.fg,   'center');
    this.engine.text('BACK → MENU',  cx, cy + 88, 11, p.dim,  'center');
  }
}
