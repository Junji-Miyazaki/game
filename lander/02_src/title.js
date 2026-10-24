// タイトル画面（P0の仮実装。P2でリデザインする）。タップで開始。
// 上位3件を表示し、RANKING ターゲットで上位10件の一覧を開閉する。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, drawRankingRows } from './ranking.js';

export class TitleScene extends Scene {
  constructor(engine, startGame) {
    super(engine);
    this.startGame = startGame;
    this.isRoot = true;    // 最上位＝BACKボタン非表示
    this.t = 0;
    this.showRank = false;
    this.rank = [];
    this.rankBtn = { x: W / 2 - 60, y: H * 0.88, w: 120, h: 30 };
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.2 ? 1.6 : 0.9, tw: Math.random() * 6.28 });
    }
  }

  enter() { this.rank = loadRanking(this.engine.storage); }

  onInput(action, data) {
    if (action === 'tap' && data) {
      const b = this.rankBtn;
      if (data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h) {
        this.showRank = !this.showRank;
        return;
      }
    }
    if (action === 'tap' || action === 'confirm') {
      this.engine.audio.good();
      this.startGame();
    }
  }

  update(dt) { this.t += dt; }

  render(ctx) {
    const p = P();
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      ctx.globalAlpha = 0.35 + 0.5 * Math.abs(Math.sin(this.t * 0.8 + s.tw));
      ctx.fillStyle = p.fg;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    this.engine.text('LANDER', W / 2, H * 0.36, 44, p.hi, 'center');
    const blink = 0.5 + 0.5 * Math.sin(this.t * 3);
    ctx.globalAlpha = 0.4 + 0.6 * blink;
    this.engine.text('TAP TO START', W / 2, H * 0.62, 16, p.mid, 'center');
    ctx.globalAlpha = 1;

    // 上位3件
    for (let i = 0; i < Math.min(3, this.rank.length); i++) {
      const e = this.rank[i];
      this.engine.text((i + 1) + '. ' + e.name + '  ' + e.score, W / 2, H * 0.68 + i * 20, 13, p.fg, 'center');
    }

    // RANKING ターゲット
    const b = this.rankBtn;
    this.engine.stroke(b.x, b.y, b.w, b.h, p.dim, 1.5);
    this.engine.text('RANKING', W / 2, b.y + 7, 14, p.mid, 'center');

    // 全件一覧
    if (this.showRank) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      this.engine.rect(20, 90, W - 40, 440, p.dark);
      ctx.restore();
      this.engine.stroke(20, 90, W - 40, 440, p.mid, 2);
      this.engine.text('TOP 10', W / 2, 104, 20, p.hi, 'center');
      drawRankingRows(this.engine, ctx, this.rank, 32, 150, W - 64, -1);
    }
  }
}
