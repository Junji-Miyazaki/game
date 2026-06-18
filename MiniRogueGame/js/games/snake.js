// SNAKE : CRTグリーンの定番スネークゲーム
// スワイプで方向操作。食べ物を食べて成長、壁か自分の体に当たったらゲームオーバー。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'snake',
  title: 'SNAKE',
  desc: 'CRTグリーンの定番スネーク',
  glyph: '~',
};

// ---- グリッド設定 ----
// COLS=12, ROWS=16, CELL=30 → プレイエリア 360x480
// HUD: 0〜95px, プレイエリア: 96〜575px（480px）, フッター: 576〜639px（64px）
const COLS = 12;
const ROWS = 16;
const CELL = 30;
const GRID_X = 0;
const GRID_Y = 96;

// ---- ゲームパラメータ ----
const STEP_INIT = 0.14;    // 初期ステップ間隔（秒）
const STEP_FLOOR = 0.07;   // 最高速度（秒）
const SPEED_UP = 0.003;    // 食べるたびに間隔を縮める量

export class Game extends Scene {
  enter() {
    this.score = 0;
    this.high = this.engine.storage.getHigh(meta.id);
    this.dead = false;

    // スネーク初期化：中央付近から右向きに3マス
    const startX = Math.floor(COLS / 2);
    const startY = Math.floor(ROWS / 2);
    // bodyは頭から尻尾の順（インデックス0が頭）
    this.body = [
      { x: startX,     y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ];
    this.dir = { x: 1, y: 0 };  // 右向きで開始

    // 入力バッファ（最大1手先まで）
    this.dirBuffer = [];

    // ステップタイマー
    this.stepInterval = STEP_INIT;
    this.stepTimer = 0;

    // 食べ物を配置
    this.food = this._spawnFood();
  }

  // ---- 空きセルにランダムに食べ物を置く ----
  _spawnFood() {
    // スネークが占有しているセルのセットを作成
    const occupied = new Set(this.body.map(s => s.x + ',' + s.y));
    const candidates = [];
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        if (!occupied.has(x + ',' + y)) candidates.push({ x, y });
      }
    }
    if (candidates.length === 0) return null; // 盤面が満杯（クリア）
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  // ---- 入力処理 ----
  onInput(action, data) {
    // ゲームオーバー中
    if (this.dead) {
      if (action === 'back') return this.engine.toMenu();
      if (action === 'tap' || action === 'confirm') return this.enter();
      return;
    }
    if (action === 'back') return this.engine.toMenu();

    // 方向入力をバッファに積む（バッファは最大1個まで）
    let nd = null;
    if (action === 'up')    nd = { x: 0,  y: -1 };
    else if (action === 'down')  nd = { x: 0,  y: 1  };
    else if (action === 'left')  nd = { x: -1, y: 0  };
    else if (action === 'right') nd = { x: 1,  y: 0  };

    if (nd && this.dirBuffer.length < 1) {
      this.dirBuffer.push(nd);
    }
  }

  // ---- 毎フレーム更新 ----
  update(dt) {
    if (this.dead) return;

    this.stepTimer += dt;
    if (this.stepTimer >= this.stepInterval) {
      this.stepTimer -= this.stepInterval;
      this._step();
    }
  }

  // ---- 1ステップ進める ----
  _step() {
    // バッファから次の方向を適用（直逆は無視）
    if (this.dirBuffer.length > 0) {
      const nd = this.dirBuffer.shift();
      // 直逆チェック：頭が3マス以上ある場合のみ（初期状態でも安全）
      const isReverse = (nd.x !== 0 && nd.x === -this.dir.x) ||
                        (nd.y !== 0 && nd.y === -this.dir.y);
      if (!isReverse) {
        this.dir = nd;
      }
    }

    // 新しい頭の位置を計算
    const head = this.body[0];
    const nx = head.x + this.dir.x;
    const ny = head.y + this.dir.y;

    // 壁衝突判定
    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      this._die();
      return;
    }

    // 自己衝突判定（尻尾は移動後に消えるので除外して判定）
    // 尻尾以外のセルと衝突したら死亡
    for (let i = 0; i < this.body.length - 1; i++) {
      if (this.body[i].x === nx && this.body[i].y === ny) {
        this._die();
        return;
      }
    }

    // 食べ物判定
    const ate = this.food && nx === this.food.x && ny === this.food.y;

    // スネークを前進させる：先頭に追加
    this.body.unshift({ x: nx, y: ny });

    if (ate) {
      // 成長：尻尾を消さない
      this.score += 1;
      this.engine.audio.pick();
      // 速度アップ（下限あり）
      this.stepInterval = Math.max(STEP_FLOOR, this.stepInterval - SPEED_UP);
      // 新しい食べ物を配置
      this.food = this._spawnFood();
      // ハイスコア更新チェック
      if (this.engine.storage.setHigh(meta.id, this.score)) {
        this.high = this.score;
      }
    } else {
      // 通常移動：尻尾を削除
      this.body.pop();
    }
  }

  // ---- 死亡処理 ----
  _die() {
    this.dead = true;
    this.engine.audio.bad();
    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    }
  }

  // ---- 描画 ----
  render(ctx) {
    const p = P();

    // ---- HUD ----
    this.engine.text('SNAKE', 12, 12, 20, p.fg, 'left');
    this.engine.text('HI ' + this.high, W - 12, 12, 14, p.dim, 'right');
    this.engine.text('SCORE', 12, 44, 13, p.dim, 'left');
    this.engine.text(String(this.score), 12, 62, 22, p.mid, 'left');

    // ---- プレイフィールドの背景 ----
    this.engine.rect(GRID_X, GRID_Y, COLS * CELL, ROWS * CELL, p.dark);

    // ---- グリッドドット（薄い格子点） ----
    ctx.fillStyle = p.dim;
    for (let y = 1; y < ROWS; y++) {
      for (let x = 1; x < COLS; x++) {
        const px = GRID_X + x * CELL;
        const py = GRID_Y + y * CELL;
        ctx.fillRect(px - 1, py - 1, 2, 2);
      }
    }

    // ---- 食べ物 ----
    if (this.food) {
      const fx = GRID_X + this.food.x * CELL;
      const fy = GRID_Y + this.food.y * CELL;
      // 食べ物：明るい黄色で塗り、内側に小さい正方形
      this.engine.rect(fx + 4, fy + 4, CELL - 8, CELL - 8, p.warn);
      this.engine.rect(fx + 8, fy + 8, CELL - 16, CELL - 16, p.hi);
    }

    // ---- スネーク本体 ----
    for (let i = this.body.length - 1; i >= 0; i--) {
      const seg = this.body[i];
      const px = GRID_X + seg.x * CELL;
      const py = GRID_Y + seg.y * CELL;

      if (i === 0) {
        // 頭：ハイライトカラー + やや大きめ
        this.engine.rect(px + 1, py + 1, CELL - 2, CELL - 2, p.hi);
        // 頭の目（進行方向に応じて表示）
        ctx.fillStyle = p.dark;
        const eyeSize = 4;
        if (this.dir.x === 1) {
          // 右向き：右側に目
          ctx.fillRect(px + CELL - 8, py + 5,   eyeSize, eyeSize);
          ctx.fillRect(px + CELL - 8, py + CELL - 9, eyeSize, eyeSize);
        } else if (this.dir.x === -1) {
          // 左向き：左側に目
          ctx.fillRect(px + 4, py + 5,   eyeSize, eyeSize);
          ctx.fillRect(px + 4, py + CELL - 9, eyeSize, eyeSize);
        } else if (this.dir.y === -1) {
          // 上向き：上側に目
          ctx.fillRect(px + 5,        py + 4, eyeSize, eyeSize);
          ctx.fillRect(px + CELL - 9, py + 4, eyeSize, eyeSize);
        } else {
          // 下向き：下側に目
          ctx.fillRect(px + 5,        py + CELL - 8, eyeSize, eyeSize);
          ctx.fillRect(px + CELL - 9, py + CELL - 8, eyeSize, eyeSize);
        }
      } else {
        // 胴体：末尾に近いほど暗く
        const ratio = i / (this.body.length - 1); // 0(首)→1(尻尾)
        // 首に近い→p.fg、尻尾に近い→p.mid
        const color = ratio < 0.5 ? p.fg : p.mid;
        const pad = 2 + Math.floor(ratio * 3); // 尻尾ほど細く
        this.engine.rect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, color);
      }
    }

    // ---- フィールドの枠線 ----
    this.engine.stroke(GRID_X, GRID_Y, COLS * CELL, ROWS * CELL, p.dim, 2);

    // ---- フッター：操作ヒント ----
    if (!this.dead) {
      this.engine.text('SWIPE TO STEER', W / 2, GRID_Y + ROWS * CELL + 16, 13, p.dim, 'center');
    }

    // ---- ゲームオーバーオーバーレイ ----
    if (this.dead) {
      // 半透明の暗いオーバーレイ
      ctx.fillStyle = p.dark;
      ctx.globalAlpha = 0.88;
      ctx.fillRect(0, H / 2 - 90, W, 180);
      ctx.globalAlpha = 1.0;

      this.engine.stroke(16, H / 2 - 90, W - 32, 180, p.dim, 2);
      this.engine.text('GAME OVER', W / 2, H / 2 - 72, 28, p.bad, 'center');
      this.engine.text('SCORE  ' + this.score, W / 2, H / 2 - 30, 20, p.fg, 'center');
      if (this.score > 0 && this.score === this.high) {
        this.engine.text('NEW BEST!', W / 2, H / 2 + 4, 16, p.warn, 'center');
      }
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 36, 16, p.mid, 'center');
      this.engine.text('BACK = MENU', W / 2, H / 2 + 62, 13, p.dim, 'center');
    }
  }
}
