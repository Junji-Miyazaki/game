// FIRE : Game & Watch スタイルの救助ゲーム
// 燃える建物から飛び降りる人を担架で受け止め、右の救急車まで送り届ける。
// 担架の位置を左右に動かして飛び降り人を順番にバウンドさせるタイミングゲーム。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'fire',
  title: 'FIRE',
  desc: '落ちる人を担架で受け止め救助',
  glyph: 'A',
};

// --- レイアウト定数 ---
// バウンスポジション（担架が止まれるX座標）
// 救急車との重なりを避けるため間隔を広げた
const BOUNCE_XS = [85, 180, 268];         // 位置0,1,2 の中心X

const TRAMPOLINE_Y = 500;                 // 担架の上端Y（少し上に移動して視野確保）
const TRAMPOLINE_W = 72;                  // 担架の幅
const TRAMPOLINE_H = 14;                  // 担架の高さ
const GROUND_Y = 524;                     // 落下ミス判定ライン

// 建物（左端）
const BUILDING_X = 0;
const BUILDING_Y = 80;
const BUILDING_W = 62;
const BUILDING_H = 430;

// 救急車（右端）— バウンスポジション2(268)と重ならないよう右寄りに
const AMBULANCE_X = 300;
const AMBULANCE_Y = 470;
const AMBULANCE_W = 58;
const AMBULANCE_H = 58;

// 救急車の入口X（ジャンパーがここに向かって飛び込む）
const AMBULANCE_ENTRY_X = AMBULANCE_X + 4;

// ジャンパーが生成されるX（建物の右端付近）
const SPAWN_X = 44;
const SPAWN_Y = 210;   // 建物から飛び出す高さ

// ジャンパーサイズ
const JUMPER_W = 18;
const JUMPER_H = 22;

// 物理 — 重力を下げてゆっくり落下させる
const GRAVITY       = 480;    // px/s^2（元900→480に減速）
const BOUNCE_VY     = -520;   // バウンス時の初速（上向き・大きく飛ばす）
const BOUNCE_VX_BASE = 90;    // バウンス後の横速度（基本値）
const BOUNCE_VX_STEP = 25;    // bounceIdxごとの追加横速度
const SPAWN_VY_INIT  = -40;   // 建物から飛び出す初期縦速度（ほぼ水平気味に）

// 最終バウンス後（救急車へ）の速度
const FINAL_VX = 160;
const FINAL_VY = -380;

// 難易度スケーリング
const BASE_SPAWN_INTERVAL = 4.0;   // 最初の生成間隔（秒）
const MIN_SPAWN_INTERVAL  = 1.4;   // 最短生成間隔

// HUD
const HUD_Y = 10;

// バウンス数（0,1,2 の3段階を踏んで救助）
const BOUNCE_COUNT = 3;

export class Game extends Scene {
  enter() {
    // --- 状態リセット ---
    this.score       = 0;
    this.lives       = 3;
    this.high        = this.engine.storage.getHigh(meta.id);
    this.dead        = false;
    this.tram        = 1;          // 担架の現在ポジション index (0/1/2)
    this.jumpers     = [];         // アクティブなジャンパー配列
    this.spawnTimer  = 2.0;        // 最初の生成まで少し待つ
    this.rescued     = 0;          // 今回救助した人数
    this.elapsed     = 0;          // 経過時間（難易度計算用）
    this.flameTick   = 0;          // 炎アニメ用タイマー
    this.shakeTimer  = 0;          // ダメージ時の画面揺れ
    this.flashTimer  = 0;          // 救助時のフラッシュ
    this.rescueFlash = 0;          // 救助成功表示タイマー
    this.lastRescueX = 0;          // 救助成功表示X座標
    this.lastRescueY = 0;          // 救助成功表示Y座標
  }

  // 現在の難易度による生成間隔
  _spawnInterval() {
    return Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - this.elapsed * 0.05);
  }

  // 新しいジャンパーを建物から生成
  _spawnJumper() {
    this.jumpers.push({
      x:          SPAWN_X,          // 現在のX
      y:          SPAWN_Y,          // 現在のY
      vx:         28,               // 右向きの初速（建物から飛び出す感じ）
      vy:         SPAWN_VY_INIT,    // ほぼ水平に飛び出す
      bounceIdx:  0,                // 次に向かうバウンスポジション index (0/1/2)
      state:      'falling',        // 'falling' | 'rescued' | 'dead'
      animTimer:  0,                // 救助/死亡アニメーション用タイマー
    });
  }

  update(dt) {
    // dead状態でもフレームを消費しないようにすぐリターン
    if (this.dead) return;

    this.elapsed    += dt;
    this.flameTick  += dt;
    if (this.shakeTimer  > 0) this.shakeTimer  -= dt;
    if (this.flashTimer  > 0) this.flashTimer  -= dt;
    if (this.rescueFlash > 0) this.rescueFlash -= dt;

    // 生成タイマー
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this._spawnJumper();
      this.spawnTimer = this._spawnInterval();
    }

    // ジャンパー物理更新
    const toRemove = [];
    for (let i = 0; i < this.jumpers.length; i++) {
      const j = this.jumpers[i];

      // --- 終端状態のアニメーション消化 ---
      if (j.state === 'rescued') {
        j.animTimer += dt;
        if (j.animTimer > 0.8) toRemove.push(i);
        continue;
      }
      if (j.state === 'dead') {
        j.animTimer += dt;
        if (j.animTimer > 0.6) toRemove.push(i);
        continue;
      }

      // --- 重力・移動（NaN防止：isFiniteチェック） ---
      const dvx = isFinite(j.vx) ? j.vx : 0;
      const dvy = isFinite(j.vy) ? j.vy : 0;
      j.vy += GRAVITY * dt;
      j.x  += dvx * dt;
      j.y  += dvy * dt;

      // NaNが混入した場合の安全ネット
      if (!isFinite(j.x) || !isFinite(j.y)) {
        j.state = 'dead';
        j.animTimer = 0;
        continue;
      }

      const jCenterX = j.x + JUMPER_W / 2;
      const jBottom  = j.y + JUMPER_H;

      // --- 担架バウンス判定 ---
      // 下降中かつ担架の高さ帯に入ったとき判定
      if (j.vy > 0 && jBottom >= TRAMPOLINE_Y - 4 && jBottom <= GROUND_Y) {

        // bounceIdx が有効範囲内のときだけターゲットを参照
        if (j.bounceIdx >= 0 && j.bounceIdx < BOUNCE_COUNT) {
          const tramX    = BOUNCE_XS[this.tram];          // 担架の現在X
          const tramHalf = TRAMPOLINE_W / 2 + 10;         // 余裕幅

          // 担架にジャンパーが重なっているか？
          if (Math.abs(jCenterX - tramX) < tramHalf) {
            this._doBounce(j);
          }
        }
      }

      // --- 地面落下 = ミス ---
      if (jBottom > GROUND_Y + 10) {
        j.state = 'dead';
        j.animTimer = 0;
        this.lives--;
        this.shakeTimer = 0.4;
        this.engine.audio.bad();
        if (this.lives <= 0) {
          this._gameOver();
          return;  // ループを即中断（toRemoveが壊れないよう）
        }
      }

      // --- 画面外へ完全に消えた場合も削除 ---
      if (j.x > W + 80 || j.y > H + 80) {
        toRemove.push(i);
      }
    }

    // 重複排除 → 逆順で削除（indexズレ防止）
    const uniqueRemove = [...new Set(toRemove)].sort((a, b) => b - a);
    for (const idx of uniqueRemove) {
      this.jumpers.splice(idx, 1);
    }
  }

  // バウンス処理を切り出し（update肥大化防止）
  _doBounce(j) {
    const jCenterX = j.x + JUMPER_W / 2;

    if (j.bounceIdx < BOUNCE_COUNT - 1) {
      // --- 通常バウンス（まだ途中のポジション）---
      const vx = BOUNCE_VX_BASE + j.bounceIdx * BOUNCE_VX_STEP;
      j.vy = BOUNCE_VY;
      j.vx = vx;
      j.bounceIdx++;
      this.engine.audio.pick();
      this.score += 1;

    } else {
      // --- 最終バウンス（位置2→救急車へ飛び込む）---
      j.vy = FINAL_VY;
      j.vx = FINAL_VX;
      j.bounceIdx++;  // BOUNCE_COUNT(3) になる
      j.state = 'rescued';
      j.animTimer = 0;

      this.rescued++;
      this.score += 5;
      this.flashTimer  = 0.4;
      this.rescueFlash = 1.0;
      this.lastRescueX = j.x;
      this.lastRescueY = j.y;

      // sequence()は必ず配列を渡す（引数なしはThrowするため）
      this.engine.audio.sequence([
        { freq: 660, dur: 0.08 },
        { freq: 880, dur: 0.08 },
        { freq: 1100, dur: 0.10 },
      ]);
    }
  }

  _gameOver() {
    this.dead = true;
    // sequence()には必ず配列を渡す（引数なし → throws）
    this.engine.audio.sequence([
      { freq: 440, dur: 0.12 },
      { freq: 330, dur: 0.12 },
      { freq: 220, dur: 0.20 },
    ]);
    if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
  }

  onInput(action, data) {
    if (this.dead) {
      if (action === 'tap' || action === 'confirm') {
        this.enter(); // リトライ
      } else if (action === 'back') {
        this.engine.toMenu();
      }
      return;
    }

    if (action === 'back') {
      this.engine.toMenu();
      return;
    }

    if (action === 'left') {
      if (this.tram > 0) {
        this.tram--;
        this.engine.audio.move();
      }
    } else if (action === 'right') {
      if (this.tram < BOUNCE_COUNT - 1) {
        this.tram++;
        this.engine.audio.move();
      }
    } else if (action === 'tap' && data) {
      // 画面の左半分タップ → 担架を左へ、右半分 → 右へ
      if (data.x < W / 2) {
        if (this.tram > 0) { this.tram--; this.engine.audio.move(); }
      } else {
        if (this.tram < BOUNCE_COUNT - 1) { this.tram++; this.engine.audio.move(); }
      }
    }
  }

  render(ctx) {
    const p = P();

    // 画面揺れエフェクト
    let shakeX = 0, shakeY = 0;
    if (this.shakeTimer > 0) {
      shakeX = (Math.random() - 0.5) * 8;
      shakeY = (Math.random() - 0.5) * 6;
    }
    if (shakeX !== 0 || shakeY !== 0) {
      ctx.save();
      ctx.translate(shakeX, shakeY);
    }

    // 救助フラッシュ（画面全体の淡い光）
    if (this.flashTimer > 0) {
      this.engine.rect(0, 0, W, H, p.hi + '18');
    }

    // === HUD ===
    // BACKボタン（x:6..48, y:8..44）を避けて x>=52 から描く
    this.engine.text('FIRE', 52, HUD_Y + 4, 18, p.warn, 'left');
    this.engine.text('SCORE ' + this.score, 52, HUD_Y + 26, 13, p.mid, 'left');
    this.engine.text('HI ' + this.high, W - 10, HUD_Y + 4, 13, p.dim, 'right');

    // ライフ表示（右上）— 'A'グリフで人を表現
    for (let i = 0; i < 3; i++) {
      const lx = W - 14 - i * 18;
      const ly = HUD_Y + 22;
      this.engine.text('A', lx, ly, 14, i < this.lives ? p.fg : p.dark, 'right');
    }

    // === 地面ライン ===
    this.engine.rect(0, GROUND_Y + 12, W, 4, p.dim);

    // === 建物（左） ===
    this._drawBuilding(p);

    // === 救急車（右） ===
    this._drawAmbulance(p);

    // === バウンスポジションマーカー（地面上の目印）===
    for (let i = 0; i < BOUNCE_COUNT; i++) {
      const bx = BOUNCE_XS[i];
      const isActive = (i === this.tram);
      // 担架が止まれる位置を示すマーカー（三角形風に矩形を重ねる）
      const mc = isActive ? p.fg : p.dim;
      this.engine.rect(bx - 6, GROUND_Y,     12, 4, mc);
      this.engine.rect(bx - 4, GROUND_Y + 4,  8, 4, mc);
      this.engine.rect(bx - 2, GROUND_Y + 8,  4, 4, mc);
      // ポジション番号（小さく）
      this.engine.text(String(i + 1), bx, GROUND_Y - 14, 11, mc, 'center');
    }

    // === 担架 ===
    this._drawTrampoline(p);

    // === ジャンパー ===
    for (const j of this.jumpers) {
      this._drawJumper(ctx, j, p);
    }

    // === 救助成功フィードバック（+5 表示）===
    if (this.rescueFlash > 0) {
      const alpha = Math.min(1, this.rescueFlash);
      const ry = AMBULANCE_Y - 10 - (1 - this.rescueFlash) * 30;
      ctx.globalAlpha = alpha;
      this.engine.text('+5 SAVED!', AMBULANCE_X + AMBULANCE_W / 2, ry, 16, p.hi, 'center');
      ctx.globalAlpha = 1.0;
    }

    // === 操作ガイド（下部）===
    if (!this.dead) {
      this.engine.text('← →  で担架を移動', W / 2, H - 26, 12, p.dim, 'center');
    }

    if (shakeX !== 0 || shakeY !== 0) {
      ctx.restore();
    }

    // === ゲームオーバーオーバーレイ ===
    if (this.dead) {
      // 半透明の暗い背景
      this.engine.rect(18, H / 2 - 110, W - 36, 220, p.dark);
      this.engine.stroke(18, H / 2 - 110, W - 36, 220, p.bad, 2);
      this.engine.text('GAME OVER', W / 2, H / 2 - 96, 28, p.bad,  'center');
      this.engine.text('SCORE   ' + this.score,   W / 2, H / 2 - 54, 20, p.fg,   'center');
      this.engine.text('RESCUED  ' + this.rescued, W / 2, H / 2 - 24, 16, p.mid,  'center');
      this.engine.text('BEST    ' + this.high,    W / 2, H / 2 +  6, 16, p.dim,  'center');
      // 区切り線
      this.engine.rect(W / 2 - 70, H / 2 + 30, 140, 2, p.dim);
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 42, 15, p.fg,   'center');
      this.engine.text('‹ BACK',       W / 2, H / 2 + 66, 13, p.dim,  'center');
    }
  }

  // 建物描画（炎アニメつき）
  _drawBuilding(p) {
    // 建物本体
    this.engine.rect(BUILDING_X, BUILDING_Y, BUILDING_W, BUILDING_H, p.dark);
    this.engine.stroke(BUILDING_X, BUILDING_Y, BUILDING_W, BUILDING_H, p.dim, 2);

    // 窓グリッド（装飾）
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 2; col++) {
        const wx = BUILDING_X + 8 + col * 24;
        const wy = BUILDING_Y + 20 + row * 60;
        // 上の2階の窓は炎で赤くなっている
        const wColor = (row <= 1) ? p.warn : p.mid;
        this.engine.rect(wx, wy, 14, 14, p.bg);
        this.engine.stroke(wx, wy, 14, 14, wColor, 1);
      }
    }

    // 建物上部の炎（アニメ）— 2フレーム交互
    const flameToggle = (Math.floor(this.flameTick * 4) % 2 === 0);
    const fc1 = flameToggle ? p.warn : p.bad;
    const fc2 = flameToggle ? p.bad  : p.warn;

    this.engine.rect(BUILDING_X + 2,  BUILDING_Y - 26, 12, 30, fc1);
    this.engine.rect(BUILDING_X + 16, BUILDING_Y - 20, 10, 24, fc2);
    this.engine.rect(BUILDING_X + 28, BUILDING_Y - 30, 14, 34, fc1);
    this.engine.rect(BUILDING_X + 46, BUILDING_Y - 18, 10, 22, fc2);

    // 建物の出口プラットフォーム（ジャンパーが飛び出す場所）
    this.engine.rect(BUILDING_X + BUILDING_W - 4, SPAWN_Y - 8, 14, 6, p.fg);

    // 「FIRE」ラベル（建物内）
    this.engine.text('FIRE', BUILDING_X + BUILDING_W / 2, BUILDING_Y + BUILDING_H / 2, 12, p.bad, 'center');
  }

  // 救急車描画
  _drawAmbulance(p) {
    // 車体
    this.engine.rect(AMBULANCE_X, AMBULANCE_Y, AMBULANCE_W, AMBULANCE_H, p.dark);
    this.engine.stroke(AMBULANCE_X, AMBULANCE_Y, AMBULANCE_W, AMBULANCE_H, p.fg, 2);

    // 赤十字マーク
    const cx = AMBULANCE_X + AMBULANCE_W / 2;
    const cy = AMBULANCE_Y + AMBULANCE_H / 2 - 6;
    this.engine.rect(cx - 9, cy - 3, 18, 6, p.bad);
    this.engine.rect(cx - 3, cy - 9, 6, 18, p.bad);

    // 「SAVE」ラベル
    this.engine.text('SAVE', cx, AMBULANCE_Y + AMBULANCE_H - 16, 11, p.fg, 'center');

    // タイヤ
    this.engine.rect(AMBULANCE_X + 4,              AMBULANCE_Y + AMBULANCE_H - 2, 14, 8, p.mid);
    this.engine.rect(AMBULANCE_X + AMBULANCE_W - 18, AMBULANCE_Y + AMBULANCE_H - 2, 14, 8, p.mid);

    // ライトアニメ（点滅）
    const lightOn = (Math.floor(this.flameTick * 3) % 2 === 0);
    if (lightOn) {
      this.engine.rect(AMBULANCE_X + 3, AMBULANCE_Y + 3, 9, 7, p.warn);
    }

    // 入口（左側に開口部を示す線）
    this.engine.rect(AMBULANCE_X, AMBULANCE_Y + 10, 4, AMBULANCE_H - 24, p.bg);
  }

  // 担架描画
  _drawTrampoline(p) {
    const tx = BOUNCE_XS[this.tram] - TRAMPOLINE_W / 2;
    const ty = TRAMPOLINE_Y;

    // 担架を運ぶ救助員（左右）
    this._drawRescuer(tx - 10,              ty - 28, p);
    this._drawRescuer(tx + TRAMPOLINE_W - 4, ty - 28, p);

    // 担架本体（明るい色で目立たせる）
    this.engine.rect(tx, ty, TRAMPOLINE_W, TRAMPOLINE_H, p.fg);
    this.engine.stroke(tx, ty, TRAMPOLINE_W, TRAMPOLINE_H, p.hi, 2);

    // 担架中央のクロス模様
    this.engine.rect(tx + TRAMPOLINE_W / 2 - 1, ty + 2, 2, TRAMPOLINE_H - 4, p.bg);
    this.engine.rect(tx + 2, ty + TRAMPOLINE_H / 2 - 1, TRAMPOLINE_W - 4, 2, p.bg);
  }

  // 救助員の簡易人型
  _drawRescuer(x, y, p) {
    this.engine.rect(x + 2, y,      8, 8,  p.fg);   // 頭
    this.engine.rect(x + 3, y + 8,  6, 12, p.mid);  // 胴体
    this.engine.rect(x + 2, y + 20, 4, 8,  p.fg);   // 左脚
    this.engine.rect(x + 6, y + 20, 4, 8,  p.fg);   // 右脚
  }

  // ジャンパー（飛び降り人）描画
  _drawJumper(ctx, j, p) {
    // 座標を整数に丸める（NaN対策を兼ねる）
    const x = isFinite(j.x) ? Math.round(j.x) : -100;
    const y = isFinite(j.y) ? Math.round(j.y) : -100;

    if (j.state === 'rescued') {
      // 救助済み：右へ飛び込みながらフェードアウト
      const alpha = Math.max(0, 1 - j.animTimer / 0.8);
      ctx.globalAlpha = alpha;
      this.engine.rect(x, y, JUMPER_W, JUMPER_H, p.hi);
      this.engine.text('★', x + JUMPER_W / 2, y - 6, 14, p.warn, 'center');
      ctx.globalAlpha = 1.0;
      return;
    }

    if (j.state === 'dead') {
      // 落下ミス：X印でフェードアウト
      const alpha = Math.max(0, 1 - j.animTimer / 0.6);
      ctx.globalAlpha = alpha;
      this.engine.text('X', x + JUMPER_W / 2, y, 22, p.bad, 'center');
      ctx.globalAlpha = 1.0;
      return;
    }

    // 通常（落下/バウンス中）：人型
    this.engine.rect(x + 4, y,      10, 9,  p.fg);   // 頭
    this.engine.rect(x + 5, y + 9,   8, 9,  p.mid);  // 胴体
    this.engine.rect(x,     y + 6,   5, 4,  p.fg);   // 左腕
    this.engine.rect(x + 13, y + 6,  5, 4,  p.fg);   // 右腕
    this.engine.rect(x + 4, y + 18,  4, 4,  p.fg);   // 左脚
    this.engine.rect(x + 10, y + 18, 4, 4,  p.fg);   // 右脚

    // 次のターゲットポジションへの目印（担架が止まるべき場所を細線で示す）
    if (j.bounceIdx >= 0 && j.bounceIdx < BOUNCE_COUNT) {
      const targetX = BOUNCE_XS[j.bounceIdx];
      // ターゲットとジャンパーが横に近いほど明るく表示
      const dist = Math.abs((j.x + JUMPER_W / 2) - targetX);
      const showGuide = dist < 80;
      if (showGuide) {
        this.engine.rect(targetX - 1, TRAMPOLINE_Y - 18, 2, 16, p.dim);
      }
    }
  }
}
