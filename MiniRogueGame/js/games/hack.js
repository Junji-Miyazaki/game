// HACK : コードブレーカー × カウントダウン
// グリッドに並んだ 2文字16進コードの中から「DECRYPT」ターゲットを時間内にタップせよ。
// 正解 → スコア加算＋時間追加。不正解 → 時間ペナルティ。タイムアウトでゲームオーバー。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'hack',
  title: 'HACK',
  desc: '一致コードを時間内にタップ',
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
const TIME_INIT   = 12;          // 初期カウントダウン秒
const TIME_BONUS  = 3.5;         // 正解時追加秒
const TIME_PENALTY= 1.5;         // 不正解時ペナルティ秒
const FLASH_DUR   = 0.22;        // フラッシュ持続秒
const SCORE_BASE  = 10;          // 1問あたりの基本スコア

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
    this.score  = 0;
    this.level  = 1;
    this.high   = this.engine.storage.getHigh(meta.id);
    this.over   = false;
    this.timer  = TIME_INIT;

    // フラッシュ状態 { idx, t, good }
    this.flash  = null;

    // ノイズ粒子
    this._initNoise();

    // グリッド＋ターゲット生成
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

    // タイピング演出: ターゲット表示を1文字ずつ
    this._typeLen  = 0;             // 現在表示中の文字数
    this._typeTimer = 0;
    this._typeDone  = false;
  }

  // ---- update ----
  update(dt) {
    if (this.over) return;

    // カウントダウン
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this._gameOver();
      return;
    }

    // フラッシュ
    if (this.flash) {
      this.flash.t -= dt;
      if (this.flash.t <= 0) this.flash = null;
    }

    // ノイズアニメーション（下方向スクロール）
    for (const p of this.noise) {
      p.y += p.speed * dt;
      p.age += dt;
      if (p.y > H + 20) {
        p.y = -20;
        p.x = Math.random() * W;
        p.ch = NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
      }
      // 約5秒ごとに文字を変える
      if (p.age > 5) {
        p.age = 0;
        p.ch = NOISE_CHARS[Math.floor(Math.random() * NOISE_CHARS.length)];
      }
    }

    // タイピング演出
    if (!this._typeDone) {
      this._typeTimer += dt;
      // 1文字あたり 0.06s
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
      // 正解
      const gain = SCORE_BASE * this.level;
      this.score += gain;
      // タイムボーナスはレベルが上がると少なめ
      const bonus = Math.max(1.2, TIME_BONUS - this.level * 0.3);
      this.timer = Math.min(this.timer + bonus, TIME_INIT);
      this.flash = { idx, t: FLASH_DUR, good: true };
      this.engine.audio.good();
      this.level++;
      // 次ラウンドへ
      this._newRound();
    } else {
      // 不正解
      this.timer = Math.max(0, this.timer - TIME_PENALTY);
      this.flash = { idx, t: FLASH_DUR, good: false };
      this.engine.audio.bad();
      if (this.timer <= 0) { this.timer = 0; this._gameOver(); }
    }
  }

  _gameOver() {
    this.over = true;
    this.engine.audio.bad();
    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    }
  }

  // ---- render ----
  render(ctx) {
    const p = P();

    // ---- ノイズ背景（dimカラー、グリッドの下に描画）----
    for (const n of this.noise) {
      // グリッド領域は薄く、それ以外は少し濃く
      const inGrid = n.x >= GRID_X && n.x < GRID_X + COLS * (CELL_W + CELL_GAP_X) &&
                     n.y >= GRID_Y && n.y < GRID_Y + ROWS * (CELL_H + CELL_GAP_Y);
      ctx.globalAlpha = inGrid ? 0.07 : 0.18;
      this.engine.text(n.ch, n.x, n.y, 12, p.dim, 'center');
      ctx.globalAlpha = 1.0;
    }

    // ---- HUD ----
    // タイトルバー
    this.engine.rect(0, 0, W, 44, p.dark);
    this.engine.text('HACK', 14, 10, 22, p.fg, 'left');
    this.engine.text('HI ' + this.high, W - 14, 10, 16, p.dim, 'right');

    // スコア行
    this.engine.text('SCORE', 14, 52, 13, p.dim, 'left');
    this.engine.text(String(this.score), 14, 68, 26, p.mid, 'left');
    this.engine.text('LV ' + this.level, W - 14, 52, 13, p.dim, 'right');

    // タイマーバー
    const BAR_X = 14, BAR_Y = 104, BAR_W = W - 28, BAR_H = 14;
    this.engine.rect(BAR_X, BAR_Y, BAR_W, BAR_H, p.dark);
    const ratio = Math.max(0, this.timer / TIME_INIT);
    const barColor = ratio > 0.4 ? p.mid : (ratio > 0.2 ? p.warn : p.bad);
    this.engine.rect(BAR_X, BAR_Y, Math.floor(BAR_W * ratio), BAR_H, barColor);
    this.engine.stroke(BAR_X, BAR_Y, BAR_W, BAR_H, p.dim, 1);

    // タイマー数字
    const timerSec = Math.ceil(this.timer);
    this.engine.text(timerSec + 's', W - 14, 122, 14, barColor, 'right');

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

      // 背景
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

      // セル塗り
      this.engine.rect(c.x, c.y, c.w, c.h, bgColor);
      // 枠
      this.engine.stroke(c.x, c.y, c.w, c.h, borderColor, 1);
      // コード文字
      this.engine.text(c.code, c.x + c.w / 2, c.y + c.h / 2 - 12, 22, textColor, 'center');
    }

    // ---- ゲームオーバーオーバーレイ ----
    if (this.over) {
      // 半透明の暗幕
      ctx.globalAlpha = 0.82;
      this.engine.rect(0, 0, W, H, p.bg);
      ctx.globalAlpha = 1.0;

      // ボックス
      const bx = 24, by = H / 2 - 110, bw = W - 48, bh = 220;
      this.engine.rect(bx, by, bw, bh, p.dark);
      this.engine.stroke(bx, by, bw, bh, p.bad, 2);

      this.engine.text('TIME OUT', W / 2, by + 18, 30, p.bad, 'center');
      this.engine.text('SCORE', W / 2, by + 64, 14, p.dim, 'center');
      this.engine.text(String(this.score), W / 2, by + 82, 36, p.fg, 'center');
      this.engine.text('HI ' + this.high, W / 2, by + 128, 16, p.mid, 'center');
      this.engine.text('TAP TO RETRY', W / 2, by + 164, 15, p.mid, 'center');
    }
  }
}
