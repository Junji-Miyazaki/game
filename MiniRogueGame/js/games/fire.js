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
const BOUNCE_XS = [80, 180, 280];          // 位置0,1,2 の中心X
const TRAMPOLINE_Y = 510;                  // 担架の上端Y
const TRAMPOLINE_W = 70;                   // 担架の幅
const TRAMPOLINE_H = 12;                   // 担架の高さ
const GROUND_Y = 530;                      // 落下判定ライン（担架より少し下）

// 建物（左端）
const BUILDING_X = 0;
const BUILDING_Y = 80;
const BUILDING_W = 60;
const BUILDING_H = 430;

// 救急車（右端）
const AMBULANCE_X = 290;
const AMBULANCE_Y = 480;
const AMBULANCE_W = 70;
const AMBULANCE_H = 60;

// ジャンパーが生成されるX（建物の右端付近）
const SPAWN_X = 42;
const SPAWN_Y = 200;   // 建物から飛び出す高さ

// ジャンパーサイズ
const JUMPER_W = 18;
const JUMPER_H = 22;

// 物理
const GRAVITY = 900;          // px/s^2
const BOUNCE_VY = -420;       // バウンス時の初速（上向き）
const BOUNCE_VX_STEP = 100;   // 各バウンスごとに右方向へのVX

// 難易度スケーリング
const BASE_SPAWN_INTERVAL = 3.0;   // 最初の生成間隔（秒）
const MIN_SPAWN_INTERVAL  = 1.0;   // 最短生成間隔

// HUD
const HUD_Y = 10;

export class Game extends Scene {
  enter() {
    // --- 状態リセット ---
    this.score    = 0;
    this.lives    = 3;
    this.high     = this.engine.storage.getHigh(meta.id);
    this.dead     = false;
    this.tram     = 1;          // 担架の現在ポジション index (0/1/2)
    this.jumpers  = [];         // アクティブなジャンパー配列
    this.spawnTimer   = 1.5;    // 最初の生成まで少し待つ
    this.rescued  = 0;          // 今回救助した人数
    this.elapsed  = 0;          // 経過時間（難易度計算用）
    this.flameTick = 0;         // 炎アニメ用タイマー
    this.shakeTimer = 0;        // ダメージ時の画面揺れ
    this.flashTimer = 0;        // 救助時のフラッシュ
  }

  // 現在の難易度による生成間隔
  _spawnInterval() {
    return Math.max(MIN_SPAWN_INTERVAL, BASE_SPAWN_INTERVAL - this.elapsed * 0.04);
  }

  // 新しいジャンパーを建物から生成
  _spawnJumper() {
    this.jumpers.push({
      x: SPAWN_X,          // 現在のX（物理シミュ）
      y: SPAWN_Y,          // 現在のY
      vx: 30,              // 右向きの初速（建物から飛び出す感じ）
      vy: 0,
      bounceIdx: 0,        // 次に向かうバウンスポジション index
      state: 'falling',    // 'falling' | 'bouncing' | 'rescued' | 'dead'
      rescueAnim: 0,       // 救助アニメーション用
    });
  }

  update(dt) {
    if (this.dead) return;

    this.elapsed   += dt;
    this.flameTick += dt;
    if (this.shakeTimer > 0) this.shakeTimer -= dt;
    if (this.flashTimer > 0) this.flashTimer -= dt;

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
      if (j.state === 'rescued') {
        j.rescueAnim += dt;
        if (j.rescueAnim > 0.6) toRemove.push(i);
        continue;
      }
      if (j.state === 'dead') {
        j.rescueAnim += dt;
        if (j.rescueAnim > 0.5) toRemove.push(i);
        continue;
      }

      // 重力
      j.vy += GRAVITY * dt;
      j.x  += j.vx * dt;
      j.y  += j.vy * dt;

      // 担架バウンス判定
      // ジャンパーの次に向かうバウンスポジションに到達したか
      const targetX = BOUNCE_XS[j.bounceIdx];
      const jCenterX = j.x + JUMPER_W / 2;
      const jBottom  = j.y + JUMPER_H;

      if (j.vy > 0 && jBottom >= TRAMPOLINE_Y && jBottom <= GROUND_Y) {
        // 担架の中心X付近に来た
        const distX = Math.abs(jCenterX - targetX);
        // 担架がここにあるか？
        const tramX = BOUNCE_XS[this.tram];
        const tramHalf = TRAMPOLINE_W / 2 + 8; // 少し余裕を持たせる

        if (Math.abs(jCenterX - tramX) < tramHalf) {
          // バウンス！
          if (this.tram === j.bounceIdx) {
            // 正しいポジションでキャッチ
            j.vy = BOUNCE_VY;
            j.vx = BOUNCE_VX_STEP + j.bounceIdx * 30;
            j.bounceIdx++;
            this.engine.audio.pick();
            this.score += 1;

            if (j.bounceIdx > 2) {
              // B2からのバウンスは救急車へ
              j.state = 'rescued';
              j.rescueAnim = 0;
              this.rescued++;
              this.score += 5;
              this.flashTimer = 0.3;
              this.engine.audio.good();
            }
          } else {
            // 担架の位置が違うがジャンパーが当たってしまった（間違えてバウンスさせてしまう）
            // 通常プレイでは担架はプレイヤーが動かすので「当たってしまう」ケースは稀だが
            // 間違ったポジションでもバウンスさせて続ける（ペナルティなし）
            j.vy = BOUNCE_VY;
            j.vx = BOUNCE_VX_STEP;
            // bounceIdxを正しい次の段階に補正
            j.bounceIdx = Math.max(j.bounceIdx, this.tram) + 1;
            this.engine.audio.move();
            this.score += 1;
            if (j.bounceIdx > 2) {
              j.state = 'rescued';
              j.rescueAnim = 0;
              this.rescued++;
              this.score += 5;
              this.flashTimer = 0.3;
              this.engine.audio.good();
            }
          }
        }
      }

      // 地面に落下 = ミス
      if (jBottom > GROUND_Y + 20) {
        j.state = 'dead';
        j.rescueAnim = 0;
        this.lives--;
        this.shakeTimer = 0.3;
        this.engine.audio.bad();
        if (this.lives <= 0) {
          this._gameOver();
          return;
        }
      }

      // 画面外右へ消えた（救急車に到達）
      if (j.x > W + 20 && j.bounceIdx > 2) {
        toRemove.push(i);
      }
      // 画面外へ飛び去った（予期しないケース）
      if (j.y > H + 50 || j.x > W + 100) {
        toRemove.push(i);
      }
    }

    // 重複排除 → 逆順で削除（indexズレ防止）
    const uniqueRemove = [...new Set(toRemove)].sort((a, b) => b - a);
    for (const idx of uniqueRemove) {
      this.jumpers.splice(idx, 1);
    }
  }

  _gameOver() {
    this.dead = true;
    this.engine.audio.sequence();
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
      if (this.tram < 2) {
        this.tram++;
        this.engine.audio.move();
      }
    } else if (action === 'tap' && data) {
      // 画面の左半分タップ → 担架を左へ、右半分 → 右へ
      if (data.x < W / 2) {
        if (this.tram > 0) { this.tram--; this.engine.audio.move(); }
      } else {
        if (this.tram < 2) { this.tram++; this.engine.audio.move(); }
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

    // 救助フラッシュ
    if (this.flashTimer > 0) {
      this.engine.rect(0, 0, W, H, p.hi + '22');
    }

    // === HUD ===
    // BACKボタン（x:6..48, y:8..44）を避けて x>=52 から描く
    this.engine.text('FIRE', 52, HUD_Y + 4, 18, p.warn, 'left');
    this.engine.text('SCORE ' + this.score, 52, HUD_Y + 28, 14, p.mid, 'left');
    this.engine.text('HI ' + this.high, W - 10, HUD_Y + 4, 14, p.dim, 'right');

    // ライフ表示（右上）
    let livesStr = '';
    for (let i = 0; i < 3; i++) {
      livesStr += i < this.lives ? 'A ' : '  ';
    }
    this.engine.text(livesStr.trim(), W - 10, HUD_Y + 24, 16, p.fg, 'right');

    // === 地面ライン ===
    this.engine.rect(0, GROUND_Y + 20, W, 4, p.dim);

    // === 建物（左） ===
    this._drawBuilding(p);

    // === 救急車（右） ===
    this._drawAmbulance(p);

    // === バウンスポジションマーカー ===
    for (let i = 0; i < 3; i++) {
      const bx = BOUNCE_XS[i];
      const isActive = (i === this.tram);
      // 地面上のポジションマーカー（小さな矩形）
      const markerColor = isActive ? p.fg : p.dim;
      this.engine.rect(bx - 4, GROUND_Y + 8, 8, 8, markerColor);
    }

    // === 担架 ===
    this._drawTrampoline(p);

    // === ジャンパー ===
    for (const j of this.jumpers) {
      this._drawJumper(ctx, j, p);
    }

    // === 操作ガイド（下部） ===
    if (!this.dead) {
      this.engine.text('← →  で担架を移動', W / 2, H - 30, 13, p.dim, 'center');
    }

    if (shakeX !== 0 || shakeY !== 0) {
      ctx.restore();
    }

    // === ゲームオーバーオーバーレイ ===
    if (this.dead) {
      this.engine.rect(20, H / 2 - 100, W - 40, 200, p.dark);
      this.engine.stroke(20, H / 2 - 100, W - 40, 200, p.bad, 2);
      this.engine.text('GAME OVER', W / 2, H / 2 - 78, 28, p.bad, 'center');
      this.engine.text('SCORE  ' + this.score, W / 2, H / 2 - 38, 20, p.fg, 'center');
      this.engine.text('RESCUED  ' + this.rescued, W / 2, H / 2 - 10, 16, p.mid, 'center');
      this.engine.text('BEST  ' + this.high, W / 2, H / 2 + 18, 16, p.dim, 'center');
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 52, 16, p.fg, 'center');
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
        const wColor = (row === 1 && col === 0) ? p.warn : p.mid;  // 2階窓が燃えてる
        this.engine.rect(wx, wy, 14, 14, p.bg);
        this.engine.stroke(wx, wy, 14, 14, wColor, 1);
      }
    }

    // 建物上部の炎（アニメ）
    const flameToggle = (Math.floor(this.flameTick * 4) % 2 === 0);
    const flameColor1 = flameToggle ? p.warn : p.bad;
    const flameColor2 = flameToggle ? p.bad : p.warn;

    // 炎を複数の矩形で表現
    this.engine.rect(BUILDING_X + 2,  BUILDING_Y - 24, 12, 28, flameColor1);
    this.engine.rect(BUILDING_X + 16, BUILDING_Y - 18, 10, 22, flameColor2);
    this.engine.rect(BUILDING_X + 28, BUILDING_Y - 28, 14, 32, flameColor1);
    this.engine.rect(BUILDING_X + 44, BUILDING_Y - 16, 10, 20, flameColor2);

    // 建物の出口プラットフォーム（ジャンパーが飛び出す場所）
    this.engine.rect(BUILDING_X + BUILDING_W - 4, SPAWN_Y - 8, 12, 6, p.fg);

    // 「FIRE」ラベル（建物内）
    this.engine.text('FIRE', BUILDING_X + BUILDING_W / 2, BUILDING_Y + BUILDING_H / 2, 13, p.bad, 'center');
  }

  // 救急車描画
  _drawAmbulance(p) {
    // 車体
    this.engine.rect(AMBULANCE_X, AMBULANCE_Y, AMBULANCE_W, AMBULANCE_H, p.dark);
    this.engine.stroke(AMBULANCE_X, AMBULANCE_Y, AMBULANCE_W, AMBULANCE_H, p.fg, 2);

    // 赤十字マーク
    const cx = AMBULANCE_X + AMBULANCE_W / 2;
    const cy = AMBULANCE_Y + AMBULANCE_H / 2 - 4;
    this.engine.rect(cx - 10, cy - 3, 20, 6, p.bad);
    this.engine.rect(cx - 3, cy - 10, 6, 20, p.bad);

    // 「救急」ラベル
    this.engine.text('SAVE', cx, AMBULANCE_Y + AMBULANCE_H - 18, 12, p.fg, 'center');

    // タイヤ
    this.engine.rect(AMBULANCE_X + 6,  AMBULANCE_Y + AMBULANCE_H - 2, 16, 8, p.mid);
    this.engine.rect(AMBULANCE_X + AMBULANCE_W - 22, AMBULANCE_Y + AMBULANCE_H - 2, 16, 8, p.mid);

    // ライトアニメ（点滅）
    const lightOn = (Math.floor(this.flameTick * 3) % 2 === 0);
    if (lightOn) {
      this.engine.rect(AMBULANCE_X + 4, AMBULANCE_Y + 4, 10, 8, p.warn);
    }
  }

  // 担架描画
  _drawTrampoline(p) {
    const tx = BOUNCE_XS[this.tram] - TRAMPOLINE_W / 2;
    const ty = TRAMPOLINE_Y;

    // 担架を運ぶ救助員（左）
    this._drawRescuer(tx - 10, ty - 28, p);
    // 担架を運ぶ救助員（右）
    this._drawRescuer(tx + TRAMPOLINE_W - 4, ty - 28, p);

    // 担架本体（明るい色で目立たせる）
    this.engine.rect(tx, ty, TRAMPOLINE_W, TRAMPOLINE_H, p.fg);
    this.engine.stroke(tx, ty, TRAMPOLINE_W, TRAMPOLINE_H, p.hi, 2);

    // 担架中央のクロス模様
    this.engine.rect(tx + TRAMPOLINE_W / 2 - 1, ty + 2, 2, TRAMPOLINE_H - 4, p.bg);
  }

  // 救助員の簡易人型
  _drawRescuer(x, y, p) {
    // 頭
    this.engine.rect(x + 2, y, 8, 8, p.fg);
    // 胴体
    this.engine.rect(x + 3, y + 8, 6, 12, p.mid);
    // 脚
    this.engine.rect(x + 2, y + 20, 4, 8, p.fg);
    this.engine.rect(x + 6, y + 20, 4, 8, p.fg);
  }

  // ジャンパー（飛び降り人）描画
  _drawJumper(ctx, j, p) {
    const x = Math.round(j.x);
    const y = Math.round(j.y);

    if (j.state === 'rescued') {
      // 救助済み：フェードアウトアニメ
      const alpha = Math.max(0, 1 - j.rescueAnim / 0.6);
      ctx.globalAlpha = alpha;
      this.engine.rect(x, y, JUMPER_W, JUMPER_H, p.hi);
      this.engine.text('★', x + JUMPER_W / 2, y - 4, 14, p.warn, 'center');
      ctx.globalAlpha = 1.0;
      return;
    }

    if (j.state === 'dead') {
      // 落下死：X印
      const alpha = Math.max(0, 1 - j.rescueAnim / 0.5);
      ctx.globalAlpha = alpha;
      this.engine.text('X', x + JUMPER_W / 2, y, 20, p.bad, 'center');
      ctx.globalAlpha = 1.0;
      return;
    }

    // 通常（落下中）：人型グリフ
    // 頭
    this.engine.rect(x + 4, y, 10, 9, p.fg);
    // 胴体
    this.engine.rect(x + 5, y + 9, 8, 9, p.mid);
    // 腕（ばんざいポーズ）
    this.engine.rect(x,     y + 6, 5, 4, p.fg);
    this.engine.rect(x + 13, y + 6, 5, 4, p.fg);
    // 脚
    this.engine.rect(x + 4, y + 18, 4, 4, p.fg);
    this.engine.rect(x + 10, y + 18, 4, 4, p.fg);

    // ジャンパーが向かっているバウンスポジションを矢印で示す（デバッグ兼ガイド）
    if (j.bounceIdx < 3) {
      const targetX = BOUNCE_XS[j.bounceIdx];
      const arrowY = TRAMPOLINE_Y - 16;
      // 細い縦線でターゲット位置を示す
      this.engine.rect(targetX - 1, arrowY, 2, 14, p.dim);
    }
  }
}
