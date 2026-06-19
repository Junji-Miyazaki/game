// LANDER : 姿勢制御で月面に軟着陸するゲーム。
// サイドビュー物理シミュレーション。重力・推力・燃料を管理しながら着陸パッドに降りる。
// 左1/3タップ：反時計回り回転 / 中央1/3タップ：メインエンジン点火 / 右1/3タップ：時計回り回転
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'lander',
  title: 'LANDER',
  desc: '姿勢制御で月面に軟着陸',
  glyph: '^',
};

// ---- 物理チューニング定数（スロー＆フロート感重視）----
const GRAVITY       = 4;     // 重力加速度（px/s²）ごく微弱、ふわふわ感
const THRUST        = 14;    // 主エンジン推力（px/s²）繊細な操作が必要
const ROT_SPEED     = 28;    // 回転速度（度/s）ゆっくり精密に
const ROT_NUDGE     = 4;     // キーボード1回転ステップ（度）
const FUEL_MAX      = 100;   // 燃料最大値
const FUEL_RATE     = 14;    // 燃料消費率（/s）
const SAFE_VY       = 18;    // 着陸時安全な縦速度（px/s）
const SAFE_VX       = 10;    // 着陸時安全な横速度（px/s）
const SAFE_ANGLE    = 15;    // 着陸時安全な傾き（度）
const PAD_W         = 50;    // 着陸パッド幅（px）
const TERRAIN_SEGS  = 18;    // 地形セグメント数
const LANDER_START_Y = 90;   // 初期Y座標（画面上部付近）

// ---- 地形生成 ----
function buildTerrain(padCount) {
  // セグメント点をランダムに生成し、パッドを埋め込む
  const segW = W / TERRAIN_SEGS;
  const pts = [];

  // パッドを置くセグメントをランダム選定（1〜2個）
  const padSegs = [];
  const available = [];
  for (let i = 2; i < TERRAIN_SEGS - 3; i++) available.push(i);
  for (let p = 0; p < padCount; p++) {
    if (available.length === 0) break;
    const idx = Math.floor(Math.random() * available.length);
    padSegs.push(available[idx]);
    // 隣接セグメントも除外（パッド同士を離す）
    available.splice(Math.max(0, idx - 2), 5);
  }

  // 地形Y座標を生成（580〜620 付近、地面に近い高さ）
  const FLOOR_Y   = 610;
  const FLOOR_MIN = 530;
  for (let i = 0; i <= TERRAIN_SEGS; i++) {
    const x = i * segW;
    let y;
    if (i === 0 || i === TERRAIN_SEGS) {
      y = FLOOR_Y; // 端は固定
    } else {
      y = FLOOR_MIN + Math.random() * (FLOOR_Y - FLOOR_MIN);
    }
    pts.push({ x, y });
  }

  // パッド部分を平坦にする
  const pads = [];
  for (const seg of padSegs) {
    const midX = (seg + 0.5) * segW;
    const flatY = FLOOR_MIN + 20 + Math.random() * 50;
    const lx = midX - PAD_W / 2;
    // 該当セグメントの両端点を平坦なYに設定
    pts[seg].y     = flatY;
    pts[seg + 1].y = flatY;
    // 隣接をなだらかにブレンド
    if (seg > 0)                 pts[seg - 1].y = (pts[seg - 1].y + flatY) / 2;
    if (seg + 2 <= TERRAIN_SEGS) pts[seg + 2].y = (pts[seg + 2].y + flatY) / 2;
    pads.push({ x: lx, y: flatY, w: PAD_W, bonus: padCount > 1 });
  }

  return { pts, pads };
}

// ---- 星（背景）----
function buildStars(count) {
  const stars = [];
  for (let i = 0; i < count; i++) {
    stars.push({ x: Math.random() * W, y: 20 + Math.random() * 460, r: Math.random() < 0.2 ? 2 : 1 });
  }
  return stars;
}

// ---- 降下軌道ガイドを生成（始点から着陸パッドへの理想曲線）----
// 放物線状の点列として返す（スコアリング＆描画用）
function buildGuide(startX, startY, pad, numPts) {
  // パッド中央が目標
  const targetX = pad.x + pad.w / 2;
  const targetY = pad.y;
  const pts = [];
  for (let i = 0; i <= numPts; i++) {
    const t = i / numPts;
    // 水平：線形補間。垂直：放物線で緩やかに落下
    const x = startX + (targetX - startX) * t;
    const y = startY + (targetY - startY) * (t * t); // t^2: 緩やかな加速感
    pts.push({ x, y });
  }
  return pts;
}

export class Game extends Scene {

  enter() {
    this.high  = this.engine.storage.getHigh(meta.id);
    this.state = 'play'; // 'play' | 'landed' | 'crashed'
    this.score = 0;
    this._init();
  }

  // 1ラウンド初期化（リトライ時もここから）
  _init() {
    this.state  = 'play';
    this.fuel   = FUEL_MAX;
    this.angle  = (Math.random() - 0.5) * 10; // ごく小さな初期傾き（度）
    this.x      = W / 2 + (Math.random() - 0.5) * 60;
    this.y      = LANDER_START_Y;
    this.vx     = (Math.random() - 0.5) * 8;  // ほぼ静止した初期横速度
    this.vy     = 2;                            // ごくゆっくりな初期下降速度
    this.thrust = false;
    this.score  = 0;

    // 地形（パッドを 1〜2 個配置）
    const padCount = Math.random() < 0.5 ? 2 : 1;
    const terrain  = buildTerrain(padCount);
    this.terrainPts = terrain.pts;
    this.pads       = terrain.pads;
    this.stars      = buildStars(40);

    // 降下軌道ガイド（最初のパッドへの理想パス）
    const guidePad = this.pads[0];
    this.guidePts  = buildGuide(this.x, this.y, guidePad, 30);

    // 軌道追従スコア用：各フレームでのガイドへの近さを累積
    // _guideDevTotal: 距離の累積, _guideDevCount: サンプル数
    this._guideDevTotal = 0;
    this._guideDevCount = 0;

    // 爆発エフェクト用
    this.particles  = [];
    this.resultTimer = 0;
  }

  // ---- ガイド上の最近傍点との距離を返す ----
  _distToGuide(x, y) {
    let minDist = Infinity;
    const pts = this.guidePts;
    for (let i = 0; i < pts.length; i++) {
      const dx = x - pts[i].x;
      const dy = y - pts[i].y;
      const d  = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) minDist = d;
    }
    return minDist;
  }

  // ---- キーボード離散入力（デスクトップ確認用）----
  onInput(action, data) {
    if (this.state !== 'play') {
      // 結果画面：tap/confirm でリトライ
      if (action === 'tap' || action === 'confirm') { this._init(); return; }
      if (action === 'back') { this.engine.toMenu(); return; }
      return;
    }
    if (action === 'back') { this.engine.toMenu(); return; }
    // キーボードの離散ステップ操作（小さなナッジ）
    if (action === 'left')  this.angle -= ROT_NUDGE;
    if (action === 'right') this.angle += ROT_NUDGE;
    if (action === 'up' && this.fuel > 0) {
      // 小さな推力パルス（キーボード用）
      const rad = (this.angle - 90) * Math.PI / 180;
      this.vx += Math.cos(rad) * THRUST * 0.12;
      this.vy += Math.sin(rad) * THRUST * 0.12;
      this.fuel = Math.max(0, this.fuel - FUEL_RATE * 0.12);
    }
  }

  // ---- 毎フレームのロジック ----
  update(dt) {
    if (this.state !== 'play') {
      // 爆発パーティクルだけ更新する
      this._updateParticles(dt);
      return;
    }

    const ptr = this.engine.pointer;

    // ポインタ押しっぱなしで連続操作（ゾーン判定）
    this.thrust = false;
    if (ptr.down) {
      if (ptr.x < 120) {
        // 左ゾーン：反時計回り（ゆっくり）
        this.angle -= ROT_SPEED * dt;
      } else if (ptr.x > 240) {
        // 右ゾーン：時計回り（ゆっくり）
        this.angle += ROT_SPEED * dt;
      } else {
        // 中央ゾーン：メインエンジン点火
        if (this.fuel > 0) {
          this.thrust = true;
          const rad = (this.angle - 90) * Math.PI / 180;
          this.vx += Math.cos(rad) * THRUST * dt;
          this.vy += Math.sin(rad) * THRUST * dt;
          this.fuel = Math.max(0, this.fuel - FUEL_RATE * dt);
        }
      }
    }

    // 角度を -180〜180 に正規化
    this.angle = ((this.angle + 180) % 360 + 360) % 360 - 180;

    // 重力のみ（人工的な減衰なし＝純粋なニュートン積分）
    this.vy += GRAVITY * dt;

    // 位置更新（dt スケール）
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // 水平クランプ（画面内に保持、壁で弱く跳ね返る）
    const PAD = 14;
    if (this.x < PAD)     { this.x = PAD;     this.vx =  Math.abs(this.vx) * 0.3; }
    if (this.x > W - PAD) { this.x = W - PAD; this.vx = -Math.abs(this.vx) * 0.3; }

    // 上端クランプ
    if (this.y < 60) { this.y = 60; this.vy = Math.abs(this.vy) * 0.2; }

    // 軌道追従スコア用サンプリング（約6フレームに1回、画面上半分のみ）
    // yが降下中だけ計測（y < 400 くらいまで）
    if (this.y < 400) {
      this._guideDevTotal += this._distToGuide(this.x, this.y);
      this._guideDevCount += 1;
    }

    // 地形との衝突判定
    this._checkCollision();
  }

  // ---- 地形衝突・着陸判定 ----
  _checkCollision() {
    // 着地点のY座標を地形から補間して求める
    const terrainY = this._terrainYAt(this.x);
    // ランダーの底（足先）はY+16 付近
    const footY = this.y + 16;

    if (footY < terrainY) return; // まだ着地していない

    // パッドに着地しているか確認
    const onPad = this.pads.find(pd => this.x >= pd.x && this.x <= pd.x + pd.w);

    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const safeLand = Math.abs(this.vy) <= SAFE_VY &&
                     Math.abs(this.vx) <= SAFE_VX &&
                     absAngle <= SAFE_ANGLE;

    if (onPad && safeLand) {
      // ---- 着陸成功 ----
      this.y  = terrainY - 16;
      this.vx = 0; this.vy = 0;
      const fuelBonus  = Math.round(this.fuel * 8);
      const softBonus  = Math.round(Math.max(0, SAFE_VY - Math.abs(this.vy)) * 5);
      const padBonus   = onPad.bonus ? 200 : 100;
      // 軌道追従ボーナス：平均偏差が小さいほど高得点（最大150点）
      let guideBonus = 0;
      if (this._guideDevCount > 0) {
        const avgDev = this._guideDevTotal / this._guideDevCount;
        // 偏差0→150点、偏差60以上→0点
        guideBonus = Math.round(Math.max(0, 150 - avgDev * 2.5));
      }
      this.score = fuelBonus + softBonus + padBonus + guideBonus;
      this._guideBonus = guideBonus; // 表示用
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
      this.engine.audio.good();
      this.state = 'landed';
    } else {
      // ---- 衝突クラッシュ ----
      this._explode();
      this.engine.audio.bad();
      this.state   = 'crashed';
      this._guideBonus = 0;
      this.score   = Math.round(this.fuel * 2);
      if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
    }
  }

  // ---- 爆発パーティクル生成 ----
  _explode() {
    this.particles = [];
    for (let i = 0; i < 24; i++) {
      const spd = 20 + Math.random() * 50;
      const dir = Math.random() * Math.PI * 2;
      this.particles.push({
        x:    this.x,
        y:    this.y,
        vx:   Math.cos(dir) * spd,
        vy:   Math.sin(dir) * spd - 20,
        life: 0.8 + Math.random() * 0.8,
        max:  1.6,
      });
    }
  }

  _updateParticles(dt) {
    for (const pt of this.particles) {
      pt.x    += pt.vx * dt;
      pt.y    += pt.vy * dt;
      pt.vy   += GRAVITY * dt;
      pt.life -= dt;
    }
    this.particles = this.particles.filter(pt => pt.life > 0);
  }

  // ---- 地形の x での Y を線形補間で取得 ----
  _terrainYAt(x) {
    const pts = this.terrainPts;
    for (let i = 0; i < pts.length - 1; i++) {
      if (x >= pts[i].x && x <= pts[i + 1].x) {
        const t = (x - pts[i].x) / (pts[i + 1].x - pts[i].x);
        return pts[i].y + t * (pts[i + 1].y - pts[i].y);
      }
    }
    return H; // 範囲外は画面底
  }

  // ---- 毎フレームの描画 ----
  render(ctx) {
    const p = P();

    // ---- 背景：星 ----
    for (const s of this.stars) {
      ctx.fillStyle = s.r > 1 ? p.dim : p.dark;
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }

    // ---- 降下軌道ガイド（点線で理想パスを示す）----
    this._drawGuide(ctx);

    // ---- 地形描画 ----
    ctx.fillStyle = p.dark;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (const pt of this.terrainPts) ctx.lineTo(pt.x, pt.y);
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();

    // 地形アウトライン
    ctx.strokeStyle = p.dim;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    for (let i = 0; i < this.terrainPts.length; i++) {
      const pt = this.terrainPts[i];
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else         ctx.lineTo(pt.x, pt.y);
    }
    ctx.stroke();

    // ---- 着陸パッド描画 ----
    for (const pad of this.pads) {
      ctx.fillStyle = p.fg;
      ctx.fillRect(pad.x, pad.y, pad.w, 4);
      ctx.fillStyle = p.mid;
      ctx.fillRect(pad.x,             pad.y, 4, 10);
      ctx.fillRect(pad.x + pad.w - 4, pad.y, 4, 10);
      // フラグ
      ctx.fillStyle = pad.bonus ? p.warn : p.fg;
      ctx.fillRect(pad.x + pad.w / 2 - 1, pad.y - 22, 2, 22);
      ctx.fillRect(pad.x + pad.w / 2 + 1, pad.y - 20, 14, 10);
      this.engine.text(
        pad.bonus ? 'x2' : 'PAD',
        pad.x + pad.w / 2, pad.y - 38, 11,
        pad.bonus ? p.warn : p.mid, 'center'
      );
    }

    // ---- 爆発パーティクル ----
    for (const pt of this.particles) {
      const t = pt.life / pt.max;
      ctx.fillStyle = t > 0.5 ? p.warn : p.bad;
      const r = Math.max(1, Math.round(t * 4));
      ctx.fillRect(pt.x - r / 2, pt.y - r / 2, r, r);
    }

    // ---- ランダー描画（回転あり）----
    if (this.state !== 'crashed') {
      this._drawLander(ctx, this.x, this.y, this.angle);
    }

    // ---- HUD ----
    this._drawHUD(ctx);

    // ---- コントロールヒント（画面下部）----
    this._drawHints(ctx);

    // ---- 結果オーバーレイ ----
    if (this.state === 'landed') {
      this._drawResult(ctx, true);
    } else if (this.state === 'crashed') {
      this._drawResult(ctx, false);
    }
  }

  // ---- 降下軌道ガイドを点線で描画 ----
  _drawGuide(ctx) {
    const p    = P();
    const pts  = this.guidePts;
    // ガイドが存在しない・0点の場合は描かない
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = p.warn;
    ctx.lineWidth   = 1;
    ctx.setLineDash([4, 7]); // 点線パターン
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.stroke();
    ctx.setLineDash([]);
    // 目標パッドに小さなダイヤマークを描く
    const last = pts[pts.length - 1];
    ctx.fillStyle = p.warn;
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(last.x,     last.y - 6);
    ctx.lineTo(last.x + 5, last.y);
    ctx.lineTo(last.x,     last.y + 6);
    ctx.lineTo(last.x - 5, last.y);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // ---- ランダー本体を回転描画 ----
  _drawLander(ctx, x, y, angleDeg) {
    const p   = P();
    const rad = angleDeg * Math.PI / 180;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rad);

    // エンジン炎（推力中のみ）
    if (this.thrust && this.fuel > 0) {
      const flameLen = 10 + Math.random() * 8;
      ctx.fillStyle = p.warn;
      ctx.beginPath();
      ctx.moveTo(-6, 8);
      ctx.lineTo(0,  8 + flameLen);
      ctx.lineTo(6,  8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = p.hi;
      ctx.beginPath();
      ctx.moveTo(-3, 8);
      ctx.lineTo(0,  8 + flameLen * 0.5);
      ctx.lineTo(3,  8);
      ctx.closePath();
      ctx.fill();
    }

    // 胴体
    ctx.fillStyle   = p.mid;
    ctx.fillRect(-8, -10, 16, 18);
    ctx.strokeStyle = p.fg;
    ctx.lineWidth   = 1.5;
    ctx.strokeRect(-8, -10, 16, 18);

    // キャビン窓
    ctx.fillStyle = p.hi;
    ctx.fillRect(-4, -8, 8, 7);

    // 左脚
    ctx.strokeStyle = p.mid;
    ctx.lineWidth   = 2;
    ctx.beginPath(); ctx.moveTo(-7, 8);  ctx.lineTo(-14, 16); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-14, 16); ctx.lineTo(-18, 16); ctx.stroke();

    // 右脚
    ctx.beginPath(); ctx.moveTo(7, 8);   ctx.lineTo(14, 16);  ctx.stroke();
    ctx.beginPath(); ctx.moveTo(14, 16);  ctx.lineTo(18, 16);  ctx.stroke();

    // エンジンノズル
    ctx.fillStyle = p.dark;
    ctx.fillRect(-5, 8, 10, 6);

    ctx.restore();
  }

  // ---- HUD表示（左上はBACKボタン占有のため x>=52 から）----
  _drawHUD(ctx) {
    const p = P();

    // タイトル
    this.engine.text('LANDER', 52, 14, 18, p.fg, 'left');
    this.engine.text('HI ' + this.high, W - 12, 14, 14, p.dim, 'right');

    // 燃料バー
    const barX = 52, barY = 44, barW = 120, barH = 12;
    this.engine.rect(barX, barY, barW, barH, p.dark);
    const fuelRatio = this.fuel / FUEL_MAX;
    const fuelColor = fuelRatio > 0.4 ? p.mid : fuelRatio > 0.15 ? p.warn : p.bad;
    if (fuelRatio > 0) this.engine.rect(barX, barY, Math.round(barW * fuelRatio), barH, fuelColor);
    this.engine.stroke(barX, barY, barW, barH, p.dim, 1);
    this.engine.text('FUEL', barX + barW + 5, barY, 11, p.dim, 'left');

    // 縦速度（色分け）
    const vyAbs   = Math.abs(this.vy);
    const vyColor = vyAbs <= SAFE_VY ? p.mid : vyAbs <= SAFE_VY * 1.5 ? p.warn : p.bad;
    this.engine.text('V:' + Math.round(this.vy), W - 12, 44, 14, vyColor, 'right');

    // 横速度
    const vxAbs   = Math.abs(this.vx);
    const vxColor = vxAbs <= SAFE_VX ? p.dim : vxAbs <= SAFE_VX * 1.8 ? p.warn : p.bad;
    this.engine.text('H:' + Math.round(this.vx), W - 12, 62, 14, vxColor, 'right');

    // 角度
    const absAngle = Math.abs(((this.angle + 180) % 360 + 360) % 360 - 180);
    const aColor   = absAngle <= SAFE_ANGLE ? p.dim : absAngle <= SAFE_ANGLE * 2 ? p.warn : p.bad;
    this.engine.text('A:' + Math.round(this.angle) + '°', 52, 62, 14, aColor, 'left');
  }

  // ---- 操作ヒント（画面下部の3ゾーン区切り）----
  _drawHints(ctx) {
    const p  = P();
    const hy = H - 22;
    this.engine.text('◄ ROT',  60,     hy, 11, p.dim, 'center');
    this.engine.text('THRUST', W / 2, hy, 11, p.dim, 'center');
    this.engine.text('ROT ►', W - 60,  hy, 11, p.dim, 'center');
    // ゾーン区切り線（薄く）
    ctx.strokeStyle = p.dark;
    ctx.lineWidth   = 1;
    ctx.beginPath(); ctx.moveTo(120, H - 32); ctx.lineTo(120, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(240, H - 32); ctx.lineTo(240, H); ctx.stroke();
  }

  // ---- 結果オーバーレイ ----
  _drawResult(ctx, success) {
    const p = P();
    this.engine.rect(0, H / 2 - 90, W, 190, p.dark);
    this.engine.stroke(0, H / 2 - 90, W, 190, p.dim, 2);

    if (success) {
      this.engine.text('LANDED!',           W / 2, H / 2 - 74, 32, p.hi,  'center');
      this.engine.text('SCORE ' + this.score, W / 2, H / 2 - 32, 20, p.fg, 'center');
      // 軌道ボーナス内訳
      const gb = this._guideBonus != null ? this._guideBonus : 0;
      this.engine.text('GUIDE +' + gb,      W / 2, H / 2 - 6,  14, p.warn,'center');
      this.engine.text('HI ' + this.high,   W / 2, H / 2 + 18, 16, p.mid, 'center');
    } else {
      this.engine.text('CRASHED!',          W / 2, H / 2 - 74, 32, p.bad, 'center');
      this.engine.text('SCORE ' + this.score, W / 2, H / 2 - 32, 20, p.fg, 'center');
      this.engine.text('HI ' + this.high,   W / 2, H / 2 - 6,  16, p.mid, 'center');
    }
    this.engine.text('TAP TO RETRY', W / 2, H / 2 + 52, 14, p.dim, 'center');
  }
}
