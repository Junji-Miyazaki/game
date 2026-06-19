// 1-BIT HERO : 1画面ミニ・ローグライク
// @を動かして鍵Kを取り、出口Dへ。敵Eに触れると死亡。1プレイ数十秒、死んだら即リトライ。
// ★このファイルは「ゲーム実装の手本」。他ゲームも同じ形（meta + Game extends Scene）で作る。
import { Scene, W, H } from '../core/engine.js';
import { P } from '../core/palette.js';

export const meta = {
  id: 'rogue',
  title: '1-BIT HERO',
  desc: '鍵を取り出口へ。敵を避けろ',
  glyph: '@',
};

const COLS = 9;
const ROWS = 12;
const CELL = 40;                 // 360 / 9
const GRID_Y = 96;               // グリッド開始Y（上にHUD）
const GRID_X = 0;

export class Game extends Scene {
  enter() {
    this.score = 0;
    this.level = 1;
    this.high = this.engine.storage.getHigh(meta.id);
    this.dead = false;
    this.msg = 'SWIPE TO MOVE';
    this._build();
  }

  // レベル生成。到達可能性をBFSで保証する。
  _build() {
    const enemyCount = Math.min(1 + Math.floor(this.level / 2), 6);
    let tries = 0;
    do {
      tries++;
      this.walls = [];
      for (let y = 0; y < ROWS; y++) {
        this.walls[y] = [];
        for (let x = 0; x < COLS; x++) {
          // 外周は壁、内側はランダム
          const edge = (x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1);
          this.walls[y][x] = edge ? true : Math.random() < 0.20;
        }
      }
      this.player = { x: 1, y: ROWS - 2 };
      this.door = { x: COLS - 2, y: 1 };
      this.key = this._randFloor([this.player, this.door]);
      this.walls[this.player.y][this.player.x] = false;
      this.walls[this.door.y][this.door.x] = false;
      if (this.key) this.walls[this.key.y][this.key.x] = false;
    } while ((!this.key || !this._reachable(this.player, [this.key, this.door])) && tries < 40);

    // 敵配置（プレイヤーから離れた床）
    this.enemies = [];
    for (let i = 0; i < enemyCount; i++) {
      const e = this._randFloor([this.player, this.door, this.key, ...this.enemies], 4);
      if (e) this.enemies.push(e);
    }
    this.hasKey = false;
  }

  _randFloor(avoid = [], minDist = 0) {
    for (let t = 0; t < 100; t++) {
      const x = 1 + Math.floor(Math.random() * (COLS - 2));
      const y = 1 + Math.floor(Math.random() * (ROWS - 2));
      if (this.walls[y][x]) continue;
      let ok = true;
      for (const a of avoid) {
        if (!a) continue;
        if (a.x === x && a.y === y) { ok = false; break; }
        if (minDist && Math.abs(a.x - x) + Math.abs(a.y - y) < minDist) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  }

  // startから targets 全てに到達できるか
  _reachable(start, targets) {
    const seen = new Set();
    const q = [start];
    seen.add(start.x + ',' + start.y);
    while (q.length) {
      const c = q.shift();
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]]) {
        const nx = c.x + dx, ny = c.y + dy;
        if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
        if (this.walls[ny][nx]) continue;
        const k = nx + ',' + ny;
        if (seen.has(k)) continue;
        seen.add(k); q.push({ x: nx, y: ny });
      }
    }
    return targets.every(t => t && seen.has(t.x + ',' + t.y));
  }

  onInput(action) {
    if (this.dead) {
      if (action === 'tap' || action === 'confirm' || action === 'back') {
        if (action === 'back') return this.engine.toMenu();
        this.enter(); // リトライ
      }
      return;
    }
    if (action === 'back') return this.engine.toMenu();
    let dx = 0, dy = 0;
    if (action === 'up') dy = -1;
    else if (action === 'down') dy = 1;
    else if (action === 'left') dx = -1;
    else if (action === 'right') dx = 1;
    else return;
    this._step(dx, dy);
  }

  _step(dx, dy) {
    const nx = this.player.x + dx, ny = this.player.y + dy;
    if (this.walls[ny][nx]) { this.engine.audio.bad(); return; }
    this.player.x = nx; this.player.y = ny;
    this.engine.audio.move();

    // 鍵取得
    if (this.key && this.player.x === this.key.x && this.player.y === this.key.y) {
      this.hasKey = true; this.key = null; this.msg = 'GOT KEY! GO TO D';
      this.engine.audio.pick();
    }
    // 出口
    if (this.player.x === this.door.x && this.player.y === this.door.y) {
      if (this.hasKey) {
        this.score += 10 * this.level; this.level++;
        this.engine.audio.good(); this.msg = 'LEVEL ' + this.level;
        this._build(); return;
      } else { this.msg = 'NEED KEY!'; }
    }
    // 敵移動：検知範囲内ならプレイヤーを追跡、範囲外はランダム徘徊
    const detectRange = 4 + Math.floor(this.level / 3); // レベルが上がるほど検知範囲が広がる
    for (const e of this.enemies) {
      const dist = Math.abs(this.player.x - e.x) + Math.abs(this.player.y - e.y);
      if (dist <= detectRange) {
        // 追跡モード：X優先で1マス近づく
        const ex = e.x + Math.sign(this.player.x - e.x);
        const ey = e.y + Math.sign(this.player.y - e.y);
        if (!this.walls[e.y][ex] && ex !== e.x) e.x = ex;
        else if (!this.walls[ey][e.x] && ey !== e.y) e.y = ey;
      } else {
        // 徘徊モード：ランダムな直交方向に1マス移動（25%で停止）
        if (Math.random() < 0.25) continue; // 止まる
        const dirs = [[0,-1],[0,1],[-1,0],[1,0]];
        // シャッフル
        for (let i = dirs.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [dirs[i], dirs[j]] = [dirs[j], dirs[i]];
        }
        for (const [ddx, ddy] of dirs) {
          const nx = e.x + ddx, ny = e.y + ddy;
          if (nx >= 0 && ny >= 0 && nx < COLS && ny < ROWS && !this.walls[ny][nx]) {
            e.x = nx; e.y = ny; break;
          }
        }
      }
    }
    this._checkDeath();
  }

  _checkDeath() {
    for (const e of this.enemies) {
      if (e.x === this.player.x && e.y === this.player.y) {
        this.dead = true;
        this.engine.audio.bad();
        if (this.engine.storage.setHigh(meta.id, this.score)) this.high = this.score;
        this.msg = 'YOU DIED';
        return;
      }
    }
  }

  render(ctx) {
    const p = P();
    // HUD（左上はBACKボタンが x:6..48 を占有するため x>=52 から描く）
    this.engine.text('1-BIT HERO', 52, 14, 18, p.fg, 'left');
    this.engine.text('LV ' + this.level, W - 12, 14, 16, p.fg, 'right');
    this.engine.text('SCORE ' + this.score, 52, 44, 14, p.mid, 'left');
    this.engine.text('HI ' + this.high, W - 12, 44, 14, p.dim, 'right');

    // グリッド
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < COLS; x++) {
        const px = GRID_X + x * CELL, py = GRID_Y + y * CELL;
        if (this.walls[y][x]) {
          this.engine.rect(px + 2, py + 2, CELL - 4, CELL - 4, p.dark);
          this.engine.text('#', px + CELL / 2, py + 8, 22, p.dim, 'center');
        }
      }
    }
    const glyph = (gx, gy, ch, color) =>
      this.engine.text(ch, GRID_X + gx * CELL + CELL / 2, GRID_Y + gy * CELL + 6, 26, color, 'center');

    if (this.key) glyph(this.key.x, this.key.y, 'K', p.warn);
    glyph(this.door.x, this.door.y, 'D', this.hasKey ? p.fg : p.dim);
    for (const e of this.enemies) glyph(e.x, e.y, 'E', p.bad);
    glyph(this.player.x, this.player.y, '@', p.hi);

    // フッターメッセージ
    this.engine.text(this.msg, W / 2, H - 56, 16, p.fg, 'center');

    if (this.dead) {
      this.engine.rect(0, H / 2 - 70, W, 140, p.dark);
      this.engine.text('YOU DIED', W / 2, H / 2 - 50, 32, p.bad, 'center');
      this.engine.text('SCORE ' + this.score, W / 2, H / 2 - 6, 18, p.fg, 'center');
      this.engine.text('TAP TO RETRY', W / 2, H / 2 + 28, 14, p.mid, 'center');
    }
  }
}
