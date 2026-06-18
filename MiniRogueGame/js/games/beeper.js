// BEEPER : サイモン風記憶ゲーム
// 光る順番を記憶してパッドを同じ順番でタップ。ラウンドが進むほど長くなる。
// フレームレート非依存の update(dt) ステートマシンで再生アニメを制御する。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'beeper',
  title: 'BEEPER',
  desc: '光る順番を記憶して再現',
  glyph: '♪',
};

// ---- パッド定義 ----
// 2×2 グリッド。各パッドに固有の色と音程を割り当てる。
const PAD_SIZE  = 130;  // パッドの一辺の長さ (px)
const PAD_GAP   = 14;   // パッド間の隙間 (px)
const PAD_LEFT  = (W - PAD_SIZE * 2 - PAD_GAP) / 2; // グリッド左端 X
const PAD_TOP   = 180;  // グリッド上端 Y（HUDの下）

// パッド 0=左上, 1=右上, 2=左下, 3=右下
const PADS = [
  { col: 0, row: 0, freq: 330 },   // 左上: E4 寄り
  { col: 1, row: 0, freq: 415 },   // 右上: Ab4 寄り
  { col: 0, row: 1, freq: 494 },   // 左下: B4 寄り
  { col: 1, row: 1, freq: 622 },   // 右下: Eb5 寄り
];

// パッドの明暗に使うパレットインデックス（パッド番号→明色・暗色）
// パレットから 4 色選ぶ：mid, warn, bad, fg
const PAD_BRIGHT = ['mid', 'warn', 'bad', 'fg'];   // 点灯時
const PAD_DIM    = ['dark', 'dark', 'dark', 'dark']; // 消灯時 (どれも dark)

// パッド座標を計算する
function padRect(i) {
  const { col, row } = PADS[i];
  const x = PAD_LEFT + col * (PAD_SIZE + PAD_GAP);
  const y = PAD_TOP  + row * (PAD_SIZE + PAD_GAP);
  return { x, y, w: PAD_SIZE, h: PAD_SIZE };
}

// タップ座標がどのパッドに当たるか。当たらなければ -1
function hitPad(tx, ty) {
  for (let i = 0; i < 4; i++) {
    const { x, y, w, h } = padRect(i);
    if (tx >= x && tx <= x + w && ty >= y && ty <= y + h) return i;
  }
  return -1;
}

// ---- ゲーム内部の状態定数 ----
const STATE_SHOW    = 'SHOW';   // コンピュータが再生中
const STATE_INPUT   = 'INPUT';  // プレイヤーが入力中
const STATE_PAUSE   = 'PAUSE';  // ラウンド正解後のブリーフポーズ
const STATE_OVER    = 'OVER';   // ゲームオーバー

// 再生タイミング定数 (秒)
const BASE_LIT  = 0.45;   // 点灯時間 (長くなるほど速くなるが最低0.22)
const BASE_GAP  = 0.20;   // 消灯時間（パッド間のスキマ）
const MIN_LIT   = 0.22;
const PAUSE_DUR = 0.70;   // ラウンド成功後の待機時間

export class Game extends Scene {
  enter() {
    const p = P();
    this.high   = this.engine.storage.getHigh(meta.id);
    this.round  = 1;   // スコア = 完了したラウンド数
    this.seq    = [];  // ランダム配列（インデックス: 0-3）
    this.lit    = -1;  // 現在点灯中のパッドインデックス（-1=消灯）
    this.litTimer = 0; // 現在の点灯/消灯タイマー

    // プレイヤー入力フィードバック用（短く点灯させる）
    this.inputLit    = -1; // プレイヤータップで光るパッド
    this.inputTimer  = 0;

    this._startRound();
  }

  // ラウンド開始: シーケンスに1ステップ追加して再生開始
  _startRound() {
    this.seq.push(Math.floor(Math.random() * 4));
    this.state      = STATE_SHOW;
    this.showIdx    = 0;  // 次に再生するシーケンスインデックス
    this.litPhase   = 'off'; // 'on' | 'off' の2フェーズで制御
    this.litTimer   = BASE_GAP; // 最初に少し間を置いてから点灯
    this.lit        = -1;
    this.inputIdx   = 0;  // プレイヤーが次に入力すべきシーケンスインデックス
    this.status     = 'WATCH';
  }

  // 速度係数: ラウンドが進むほど速くなる（最低 MIN_LIT まで）
  _litDur() {
    const factor = Math.max(0.5, 1.0 - (this.seq.length - 1) * 0.03);
    return Math.max(MIN_LIT, BASE_LIT * factor);
  }

  update(dt) {
    // プレイヤータップのフィードバック点灯を消す
    if (this.inputTimer > 0) {
      this.inputTimer -= dt;
      if (this.inputTimer <= 0) this.inputLit = -1;
    }

    if (this.state === STATE_SHOW) {
      this.litTimer -= dt;
      if (this.litTimer <= 0) {
        if (this.litPhase === 'off') {
          // 消灯フェーズ終了 → 次のパッドを点灯
          if (this.showIdx >= this.seq.length) {
            // 全ステップ再生完了 → 入力フェーズへ
            this.state   = STATE_INPUT;
            this.status  = 'REPEAT';
            this.lit     = -1;
          } else {
            // 次パッドを点灯
            const padIdx = this.seq[this.showIdx];
            this.lit      = padIdx;
            this.litPhase = 'on';
            this.litTimer = this._litDur();
            this.engine.audio.beep(PADS[padIdx].freq, this._litDur() * 0.85, 'square', 0.3);
          }
        } else {
          // 点灯フェーズ終了 → 消灯してから次へ
          this.lit      = -1;
          this.litPhase = 'off';
          this.litTimer = BASE_GAP;
          this.showIdx++;
        }
      }
    } else if (this.state === STATE_PAUSE) {
      this.litTimer -= dt;
      if (this.litTimer <= 0) {
        this.round++;
        this._startRound();
      }
    }
  }

  onInput(action, data) {
    if (this.state === STATE_OVER) {
      if (action === 'back') return this.engine.toMenu();
      if (action === 'tap' || action === 'confirm') return this.enter();
      return;
    }
    if (action === 'back') return this.engine.toMenu();

    if (action === 'tap' && this.state === STATE_INPUT) {
      const i = hitPad(data.x, data.y);
      if (i < 0) return; // パッド外タップは無視

      // タップフィードバック: 短く点灯 + 音
      this.inputLit   = i;
      this.inputTimer = 0.18;
      this.engine.audio.beep(PADS[i].freq, 0.15, 'square', 0.3);

      if (i === this.seq[this.inputIdx]) {
        // 正解タップ
        this.inputIdx++;
        if (this.inputIdx >= this.seq.length) {
          // シーケンス全入力完了
          this.engine.audio.good();
          if (this.engine.storage.setHigh(meta.id, this.round)) this.high = this.round;
          this.state    = STATE_PAUSE;
          this.litTimer = PAUSE_DUR;
          this.status   = 'NICE!';
        }
      } else {
        // 不正解
        this.engine.audio.bad();
        // ハイスコア保存（round - 1 が完了ラウンド数）
        const score = this.round - 1;
        if (this.engine.storage.setHigh(meta.id, score)) this.high = score;
        this.state  = STATE_OVER;
        this.status = 'MISS!';
      }
    }
  }

  render(ctx) {
    const p = P();
    const e = this.engine;

    // ---- HUD ----
    e.text('BEEPER', W / 2, 14, 20, p.fg, 'center');
    e.text('ROUND ' + this.round, 14, 14, 15, p.mid, 'left');
    e.text('HI ' + this.high, W - 14, 14, 15, p.dim, 'right');

    // ---- ステータスライン（HUD直下）----
    e.text(this.status, W / 2, 50, 16, p.warn, 'center');

    // ---- パッド描画 ----
    for (let i = 0; i < 4; i++) {
      const { x, y, w, h } = padRect(i);
      const isLit = (i === this.lit) || (i === this.inputLit);
      const dimKey    = PAD_DIM[i];
      const brightKey = PAD_BRIGHT[i];

      if (isLit) {
        // 点灯: 明るい塗り + 白枠
        e.rect(x, y, w, h, p[brightKey]);
        e.stroke(x, y, w, h, p.hi, 3);
      } else {
        // 消灯: 暗い塗り + dim枠
        e.rect(x, y, w, h, p.dark);
        e.stroke(x, y, w, h, p.dim, 2);
      }

      // パッド内アイコン（音符）
      const iconColor = isLit ? p.bg : p.dim;
      e.text('♪', x + w / 2, y + h / 2 - 14, 28, iconColor, 'center');
    }

    // ---- シーケンス長インジケーター ----
    // 現在のシーケンス長を小さいドットで表示
    const dotY = PAD_TOP + PAD_SIZE * 2 + PAD_GAP + 20;
    const dotR = 5;
    const dotSpacing = 14;
    const totalDots = this.seq.length;
    const startX = W / 2 - ((totalDots - 1) * dotSpacing) / 2;
    for (let d = 0; d < totalDots; d++) {
      const dx = startX + d * dotSpacing;
      // 入力フェーズでは入力済みドットを明るく
      let dotColor;
      if (this.state === STATE_INPUT && d < this.inputIdx) {
        dotColor = p.mid;
      } else {
        dotColor = p.dim;
      }
      ctx.fillStyle = dotColor;
      ctx.beginPath();
      ctx.arc(dx, dotY, dotR, 0, Math.PI * 2);
      ctx.fill();
    }

    // ---- ゲームオーバーオーバーレイ ----
    if (this.state === STATE_OVER) {
      const score = this.round - 1;
      const oy = H / 2 - 80;
      e.rect(0, oy, W, 200, p.dark);
      e.stroke(0, oy, W, 200, p.bad, 3);
      e.text('GAME OVER', W / 2, oy + 18, 30, p.bad, 'center');
      e.text('SCORE: ' + score + ' ROUNDS', W / 2, oy + 66, 18, p.fg, 'center');
      e.text('HI: ' + this.high, W / 2, oy + 96, 16, p.dim, 'center');
      e.text('TAP TO RETRY', W / 2, oy + 138, 15, p.mid, 'center');
    }
  }
}
