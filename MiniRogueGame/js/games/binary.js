// BINARY : 2進数タイムアタック
// 目標の10進数を6ビットで作れ！タップでビットを切り替え、一致したらクリア。
// タイマーが尽きる前にできるだけ多くの目標をクリアせよ。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'binary',
  title: 'BINARY',
  desc: '目標の数を2進数で作れ',
  glyph: '01',
};

// ---- 定数 ----
const BITS       = 6;                    // ビット数（最大63）
const PLACE_VAL  = [32, 16, 8, 4, 2, 1]; // 左から右へ

const INIT_TIME  = 10;                   // 初期タイマー（秒）
const ADD_TIME   = 3;                    // 正解時に追加する秒数
const TIME_CAP   = 20;                   // タイマー上限（秒）

// HUDとレイアウト
const HUD_H      = 90;                   // HUD高さ
const TARGET_Y   = 98;                   // "TARGET" ラベル Y
const TARGET_NUM_Y = 122;                // 目標数字 Y
const EQUALS_Y   = 230;                  // "= XX" 表示 Y
const BITS_Y     = 280;                  // ビットボックス行 Y
const TIMER_BAR_Y = 560;                 // タイマーバー Y
const TIMER_BAR_H = 18;                  // タイマーバー高さ

// ビットボックス: 6個を横幅360にフィット。左右マージンを最小にする。
const BOX_W      = 52;
const BOX_H      = 72;
const BOX_GAP    = 4;
const BOX_ROW_W  = BOX_W * BITS + BOX_GAP * (BITS - 1); // 52*6 + 4*5 = 332
const BOX_X0     = Math.round((W - BOX_ROW_W) / 2);     // 14

// ---- ユーティリティ ----
function randTarget(exclude) {
  // 1..63 からexcludeを除いてランダムに選ぶ
  let v;
  do { v = 1 + Math.floor(Math.random() * 63); } while (v === exclude);
  return v;
}

function bitsToDecimal(bits) {
  let n = 0;
  for (let i = 0; i < BITS; i++) n += bits[i] * PLACE_VAL[i];
  return n;
}

// ---- ゲームクラス ----
export class Game extends Scene {
  enter() {
    this.score    = 0;
    this.level    = 1;
    this.high     = this.engine.storage.getHigh(meta.id);
    this.over     = false;
    this.timer    = INIT_TIME;
    this.bits     = new Array(BITS).fill(0);  // 全ビット0
    this.target   = randTarget(-1);           // 最初の目標
    this.cursor   = 0;                        // キーボード用カーソル（左右で移動）
    this.flash    = 0;                        // 正解フラッシュ残り時間（秒）
  }

  // ---- ロジック ----
  update(dt) {
    if (this.over) return;

    // フラッシュカウントダウン
    if (this.flash > 0) this.flash -= dt;

    // タイマーカウントダウン
    this.timer -= dt;
    if (this.timer <= 0) {
      this.timer = 0;
      this._gameOver();
    }
  }

  _toggleBit(i) {
    this.bits[i] ^= 1;
    this.engine.audio.beep(this.bits[i] ? 880 : 440, 0.06, 'square', 0.18);
    this._checkMatch();
  }

  _checkMatch() {
    if (bitsToDecimal(this.bits) === this.target) {
      this.engine.audio.good();
      this.score += this.level;
      this.level++;
      // タイマー追加（上限あり）
      this.timer = Math.min(this.timer + ADD_TIME, TIME_CAP);
      // フラッシュ演出
      this.flash = 0.35;
      // 新しい目標、ビットをリセット
      this.target = randTarget(this.target);
      this.bits.fill(0);
      // ハイスコア更新
      if (this.engine.storage.setHigh(meta.id, this.score)) {
        this.high = this.score;
      }
    }
  }

  _gameOver() {
    this.over = true;
    this.engine.audio.bad();
    if (this.engine.storage.setHigh(meta.id, this.score)) {
      this.high = this.score;
    }
  }

  // ---- 入力 ----
  onInput(action, data) {
    if (this.over) {
      if (action === 'back') return this.engine.toMenu();
      if (action === 'tap' || action === 'confirm') return this.enter();
      return;
    }
    if (action === 'back') return this.engine.toMenu();

    if (action === 'tap') {
      // どのビットボックスをタップしたか判定
      const tx = data.x;
      const ty = data.y;
      for (let i = 0; i < BITS; i++) {
        const bx = BOX_X0 + i * (BOX_W + BOX_GAP);
        const by = BITS_Y;
        if (tx >= bx && tx <= bx + BOX_W && ty >= by && ty <= by + BOX_H) {
          this._toggleBit(i);
          return;
        }
      }
      return;
    }

    // キーボード: 左右でカーソル移動、confirm/up/downでトグル
    if (action === 'left') {
      this.cursor = (this.cursor - 1 + BITS) % BITS;
      this.engine.audio.move();
      return;
    }
    if (action === 'right') {
      this.cursor = (this.cursor + 1) % BITS;
      this.engine.audio.move();
      return;
    }
    if (action === 'confirm' || action === 'up' || action === 'down') {
      this._toggleBit(this.cursor);
      return;
    }
  }

  // ---- 描画 ----
  render(ctx) {
    const p = P();

    // ---------- HUD ----------
    this.engine.text('BINARY', 12, 12, 20, p.fg, 'left');
    this.engine.text('LV ' + this.level, W - 12, 12, 16, p.fg, 'right');
    this.engine.text('SCORE ' + this.score, 12, 42, 14, p.mid, 'left');
    this.engine.text('HI ' + this.high, W - 12, 42, 14, p.dim, 'right');

    // HUD区切り線
    this.engine.rect(0, HUD_H - 2, W, 2, p.dark);

    // ---------- 目標表示 ----------
    this.engine.text('TARGET', W / 2, TARGET_Y, 14, p.dim, 'center');

    // 正解フラッシュ: 目標数字をhi色で強調
    const targetColor = (this.flash > 0) ? p.hi : p.warn;
    this.engine.text('' + this.target, W / 2, TARGET_NUM_Y, 64, targetColor, 'center');

    // ---------- ビットボックス ----------
    const currentVal = bitsToDecimal(this.bits);

    for (let i = 0; i < BITS; i++) {
      const bx = BOX_X0 + i * (BOX_W + BOX_GAP);
      const by = BITS_Y;
      const isOn = this.bits[i] === 1;
      const isCursor = (i === this.cursor);

      // ボックス背景
      const boxBg = isOn ? p.dim : p.dark;
      this.engine.rect(bx, by, BOX_W, BOX_H, boxBg);

      // カーソル枠（キーボード用）
      const borderColor = isCursor ? p.fg : (isOn ? p.mid : p.dim);
      const borderWidth = isCursor ? 3 : 2;
      this.engine.stroke(bx, by, BOX_W, BOX_H, borderColor, borderWidth);

      // ビット値（0 or 1）
      const bitColor = isOn ? p.hi : p.dim;
      this.engine.text('' + this.bits[i], bx + BOX_W / 2, by + 12, 28, bitColor, 'center');

      // 桁の重み（小さく下に）
      this.engine.text('' + PLACE_VAL[i], bx + BOX_W / 2, by + BOX_H - 20, 12, p.dim, 'center');
    }

    // ---------- 現在値 = XX ----------
    const eqColor = (currentVal === this.target) ? p.hi : p.fg;
    this.engine.text('= ' + currentVal, W / 2, EQUALS_Y, 30, eqColor, 'center');

    // 一致ヒント矢印
    if (currentVal === this.target && !this.over) {
      this.engine.text('OK!', W / 2, EQUALS_Y + 36, 16, p.hi, 'center');
    }

    // ---------- タイマーバー ----------
    const ratio = this.timer / INIT_TIME;       // 0..1 以上になる場合もあるのでclamp
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const barMaxW = W - 24;                     // 左右12pxマージン

    // バー背景
    this.engine.rect(12, TIMER_BAR_Y, barMaxW, TIMER_BAR_H, p.dark);

    // バー本体（残り時間に応じて色を変える）
    let barColor = p.mid;
    if (clampedRatio < 0.25) barColor = p.bad;
    else if (clampedRatio < 0.5) barColor = p.warn;
    const barW = Math.round(barMaxW * clampedRatio);
    if (barW > 0) this.engine.rect(12, TIMER_BAR_Y, barW, TIMER_BAR_H, barColor);

    // バー枠線
    this.engine.stroke(12, TIMER_BAR_Y, barMaxW, TIMER_BAR_H, p.dim, 1);

    // タイマー数値
    const timerLabel = this.timer.toFixed(1);
    this.engine.text(timerLabel, W / 2, TIMER_BAR_Y - 22, 16, barColor, 'center');

    // ---------- ゲームオーバーオーバーレイ ----------
    if (this.over) {
      // 半透明背景（bg色で塗りつぶし）
      this.engine.rect(0, H / 2 - 90, W, 180, p.dark);
      this.engine.stroke(12, H / 2 - 90, W - 24, 180, p.dim, 2);

      this.engine.text('GAME OVER', W / 2, H / 2 - 68, 32, p.bad, 'center');
      this.engine.text('SCORE ' + this.score, W / 2, H / 2 - 24, 20, p.fg, 'center');
      if (this.score === this.high && this.score > 0) {
        this.engine.text('NEW RECORD!', W / 2, H / 2 + 10, 16, p.warn, 'center');
      }
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 42, 14, p.mid, 'center');
    }
  }
}
