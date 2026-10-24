// タイトル画面（P0の仮実装。P2でリデザインする）。タップで開始。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';

export class TitleScene extends Scene {
  constructor(engine, startGame) {
    super(engine);
    this.startGame = startGame;
    this.isRoot = true;    // 最上位＝BACKボタン非表示
    this.t = 0;
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.2 ? 1.6 : 0.9, tw: Math.random() * 6.28 });
    }
  }

  onInput(action) {
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
  }
}
