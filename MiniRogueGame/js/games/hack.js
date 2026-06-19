// HACK : コードブレーカー × リアクションスピード
// グリッドから「DECRYPT」ターゲットを見つけてタップせよ。
// 全10ラウンド固定。タイムアウトなし。反応速度でスコアを競う。
// 速くタップするほど高得点。誤タップは減点なし（時間ロスで自然にスコアが下がる）。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'hack',
  title: 'HACK',
  desc: '一致コードを素早くタップ',
  glyph: '#',
};

// ---- レイアウト定数 ----
const COLS        = 4;           // グリッド列数
const ROWS        = 5;           // グリッド行数（20セル固定）
const CELL_W      = 84;          // セル幅  (360 / 4 = 90 → 余白込みで84)
const CELL_H      = 60;          // セル高さ
const GRID_X      = 12;          // グリッド左端
const GRID_Y      = 210;         // グリッド上端（HUDの下）
const CELL_GAP_X  = 6;           // 横間隔
const CELL_GAP_Y  = 6;           // 縦間隔

// ---- ゲームパラメータ ----
const TOTAL_ROUNDS  = 10;        // 全ラウンド数（固定）
const FLASH_DUR     = 0.22;      // フラッシュ持続秒
const SCORE_MAX     = 1000;      // 1ラウンドの最高得点
const SCORE_MIN     = 50;        // 1ラウンドの最低得点（どんなに遅くても）
// 反応時間スコア計算: score = max(SCORE_MIN, SCORE_MAX - elapsed * SCORE_DECAY)
// 例) 0秒→1000点、5秒→500点、10秒以上→50点
const SCORE_DECAY   = 95;        // 1秒あたりの減点量
const FLASH_GAIN_DUR = 0.7;      // "+NNN" 表示の持続秒

// 16進コード生成に使う文字
const HEX_CHARS = '0123456789ABCDEF';

// バックグラウンドに流す片仮名ノイズ文字（ハッカー演出）
const NOISE_CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホ0123456789ABCDEF';
const NOISE_COUNT = 30;

// ランダム 2文字 hex コード
function randCode() {
  return HEX_CHARS[Math.floor(Math.random() * 16)] +
         HEX_CHARS[Math.floor(Math.random() * 16)];
}

export class Game extends Scene {
  enter() {
    this.score      = 0;           // 累計スコア
    this.round      = 0;           // 現在ラウンド（0始まり、TOTAL_ROUNDSで終了）
    this.high       = this.engine.storage.getHigh(meta.id);
    this.over       = false;       // リザルト画面フラグ
    this.elapsed    = 0;           // 現在ラウンドの経過時間（秒）

    // フラッシュ状態 { idx, t, good }
    this.flash      = null;

    // "+NNN" 得点フラッシュ { text, t }
    this.gainFlash  = null;

    // ノイズ粒子
    this._initNoise();

    // 最初のラウンド開始
    this._newRound();
  }

  // ---- ノイズ粒子初期化 ----
  _initNoise() {
    this.noise = [];
    for (let i = 0; i < NOISE_COUNT; i++) {
      this.noise.push(this._makeNoisePart());
    }
  }

  _makeNoisePart() {
    return {
      x: Math.random() * W,
      y: Math.random() * H,
      ch: NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)],
      speed: 18 + Math.random() * 40,   // px/s
      age: Math.random() * 4,
    };
  }

  // ---- グリッド生成（ターゲットがグリッド内に必ず1つ） ----
  _newRound() {
    // 全セルにユニークコードを割り当てる（ターゲット重複を防ぐため）
    const total = COLS * ROWS;
    const used = new Set();
    const codes = [];
    while (codes.length < total) {
      const c = randCode();
      if (!used.has(c)) { used.add(c); codes.push(c); }
    }

    // ターゲットはコード一覧からランダムに1つ選ぶ
    const targetIdx = Math.floor(Math.random() * total);
    this.target = codes[targetIdx];

    // セルオブジェクト生成（x,y,w,h,code）
    this.cells = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const idx = row * COLS + col;
        const cx = GRID_X + col * (CELL_W + CELL_GAP_X);
        const cy = GRID_Y + row * (CELL_H + CELL_GAP_Y);
        this.cells.push({
          x: cx, y: cy, w: CELL_W, h: CELL_H,
          code: codes[idx],
        });
      }
    }

    // 経過タイマーをリセット
    this.elapsed = 0;

    // タイピング演出: ターゲット表示を1文字ずつ
    this._typeLen   = 0;
    this._typeTimer = 0;
    this._typeDone  = false;
  }

  // ---- update ----
  update(dt) {
    if (this.over) return;

    // 現在ラウンドの経過時間（タイムアウトなし、スコア計算用）
    this.elapsed += dt;

    // フラッシュ
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }

    // 得点フラッシュ
    if (this.gainFlash) {
      this.gainFlash.t -= dt;
      if (this.gainFlash.t <= 0) this.gainFlash = null;
    }

    // ノイズアニメーション（下方向スクロール）
    for (const part of this.noise) {
      part.y += part.speed * dt;
      part.age += dt;
      if (part.y > H + 20) {
        part.y = -20;
        part.x = Math.random() * W;
        part.ch = NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
      }
      // 約5秒ごとに文字を変える
      if (part.age > 5) {
        part.age = 0;
        part.ch = NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
      }
    }

    // タイピング演出（1文字 0.06s）
    if (!this._typeDone) {
      this._typeTimer += dt;
      const targetLen = ('DECRYPT > ' + this.target).length;
      this._typeLen = Math.min(Math.floor(this._typeTimer / 0.06), targetLen);
      if (this._typeLen >= targetLen) this._typeDone = true;
    }
  }

  // ---- onInput ----
  onInput(action, data) {
    if (this.over) {
      if (action === 'back') return this.engine.toMenu();
      if (action === 'tap' || action === 'confirm') { this.enter(); }
      return;
    }
    if (action === 'back') return this.engine.toMenu();

    if (action === 'tap' && data) {
      this._handleTap(data.x, data.y);
    }
  }

  _handleTap(tx, ty) {
    // どのセルがタップされたか
    const idx = this.cells.findIndex(
      c => tx >= c.x && tx < c.x + c.w && ty >= c.y && ty < c.y + c.h
    );
    if (idx < 0) return; // セル外

    const cell = this.cells[idx];
    if (cell.code === this.target) {
      // 正解 — 反応時間でスコア計算
      const gain = Math.max(SCORE_MIN, Math.round(SCORE_MAX - this.elapsed * SCORE_DECAY));
      this.score += gain;
      this.flash = { idx, t: FLASH_DUR, good: true };
      this.gainFlash = { text: '+' + gain, t: FLASH_GAIN_DUR };
      this.engine.audio.good();

      // ハイスコア更新
      if (this.engine.storage.setHigh(meta.id, this.score)) {
        this.high = this.score;
      }

      this.round++;
      if (this.round >= TOTAL_ROUNDS) {
        // 全ラウンド終了 → リザルト
        this._showResults();
      } else {
        // 次ラウンドへ
        this._newRound();
      }
    } else {
      // 不正解 — ゲーム終了なし。赤フラッシュのみ（経過時間は止まらない）
      this.flash = { idx, t: FLASH_DUR, good: false };
      this.engine.audio.bad();
    }
  }

  _showResults() {
    this.over = true;
    // 最終スコアでハイスコア更新（正解時にも更新しているが念のため）
    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    }
  }

  // ---- render ----
  render(ctx) {
    const p = P();

    // ---- ノイズ背景（dimカラー、グリッドの下に描画）----
    for (const n of this.noise) {
      const inGrid = n.x >= GRID_X && n.x < GRID_X + COLS * (CELL_W + CELL_GAP_X) &&
                     n.y >= GRID_Y && n.y < GRID_Y + ROWS * (CELL_H + CELL_GAP_Y);
      ctx.globalAlpha = inGrid ? 0.07 : 0.18;
      this.engine.text(n.ch, n.x, n.y, 12, p.dim, 'center');
      ctx.globalAlpha = 1.0;
    }

    // ---- HUD ----
    // タイトルバー（BACKボタンは x:6..48 なので HACK タイトルは x>=52 から）
    this.engine.rect(0, 0, W, 44, p.dark);
    this.engine.text('HACK', 52, 10, 22, p.fg, 'left');   // BACKボタン右側から開始
    this.engine.text('HI ' + this.high, W - 14, 10, 16, p.dim, 'right');

    // スコア行
    this.engine.text('SCORE', 52, 52, 13, p.dim, 'left');
    this.engine.text(String(this.score), 52, 68, 26, p.mid, 'left');

    // ラウンド進捗（右側）
    const roundDisp = Math.min(this.round + 1, TOTAL_ROUNDS);
    this.engine.text('ROUND ' + roundDisp + ' / ' + TOTAL_ROUNDS, W - 14, 52, 13, p.dim, 'right');

    // 経過時間（右側。反応速度の参考表示）
    const elapsedLabel = this.elapsed.toFixed(1) + 's';
    this.engine.text(elapsedLabel, W - 14, 68, 20, p.fg, 'right');

    // ---- DECRYPT ターゲット ----
    this.engine.rect(0, 145, W, 56, p.dark);
    this.engine.stroke(0, 145, W, 56, p.dim, 1);
    const fullLabel = 'DECRYPT > ' + this.target;
    const showLabel = this._typeDone ? fullLabel : fullLabel.slice(0, this._typeLen);
    // カーソル点滅（タイピング中）
    const cursor = (!this._typeDone && Math.floor(Date.now() / 250) % 2 === 0) ? '_' : '';
    this.engine.text(showLabel + cursor, W / 2, 157, 24, p.hi, 'center');

    // ---- グリッドセル ----
    for (let i = 0; i < this.cells.length; i++) {
      const c = this.cells[i];
      const isFlash = this.flash && this.flash.idx === i;

      let bgColor = p.dark;
      let textColor = p.fg;
      let borderColor = p.dim;

      if (isFlash) {
        if (this.flash.good) {
          bgColor = p.mid;
          textColor = p.bg;
          borderColor = p.hi;
        } else {
          bgColor = p.bad;
          textColor = p.hi;
          borderColor = p.bad;
        }
      }

      this.engine.rect(c.x, c.y, c.w, c.h, bgColor);
      this.engine.stroke(c.x, c.y, c.w, c.h, borderColor, 1);
      this.engine.text(c.code, c.x + c.w / 2, c.y + c.h / 2 - 12, 22, textColor, 'center');
    }

    // ---- "+NNN" 得点フラッシュ（グリッド上部に表示）----
    if (this.gainFlash) {
      const alpha = Math.min(1, this.gainFlash.t / FLASH_GAIN_DUR * 2);
      ctx.globalAlpha = alpha;
      this.engine.text(this.gainFlash.text, W / 2, GRID_Y - 30, 28, p.warn, 'center');
      ctx.globalAlpha = 1.0;
    }

    // ---- リザルトオーバーレイ ----
    if (this.over) {
      // 半透明の暗幕
      ctx.globalAlpha = 0.88;
      this.engine.rect(0, 0, W, H, p.bg);
      ctx.globalAlpha = 1.0;

      // ボックス
      const bx = 24, by = H / 2 - 140, bw = W - 48, bh = 280;
      this.engine.rect(bx, by, bw, bh, p.dark);
      this.engine.stroke(bx, by, bw, bh, p.mid, 2);

      this.engine.text('MISSION COMPLETE', W / 2, by + 18, 20, p.mid, 'center');
      this.engine.text('TOTAL SCORE', W / 2, by + 60, 14, p.dim, 'center');
      this.engine.text(String(this.score), W / 2, by + 78, 48, p.hi, 'center');

      // ハイスコア表示
      if (this.score >= this.high && this.score > 0) {
        this.engine.text('NEW RECORD!', W / 2, by + 140, 18, p.warn, 'center');
      } else {
        this.engine.text('HI  ' + this.high, W / 2, by + 140, 16, p.dim, 'center');
      }

      // スコア解説（最高・達成ラウンド）
      this.engine.text(TOTAL_ROUNDS + ' ROUNDS CLEARED', W / 2, by + 170, 14, p.fg, 'center');
      this.engine.text('MAX ' + (SCORE_MAX * TOTAL_ROUNDS) + ' PTS POSSIBLE', W / 2, by + 192, 12, p.dim, 'center');

      this.engine.text('TAP TO RETRY', W / 2, by + 236, 15, p.mid, 'center');
    }
  }
}
