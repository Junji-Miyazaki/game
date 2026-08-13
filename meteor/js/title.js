// タイトル画面 — 深宇宙にネオンの都市リングとタイトルロゴ。タップで開始。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';

export class TitleScene extends Scene {
  constructor(engine, startGame) {
    super(engine);
    this.startGame = startGame;
    this.isRoot = true;    // 最上位＝BACKボタン非表示
    this.t = 0;
    // 星空（静的に生成）
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({
        x: Math.random() * W, y: Math.random() * H,
        r: Math.random() < 0.2 ? 1.6 : 0.9,
        tw: Math.random() * 6.28,
      });
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
    // 背景：縦グラデ（深宇宙）
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#070a16'); g.addColorStop(0.6, p.bg); g.addColorStop(1, '#141031');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // 星（またたき）
    for (const s of this.stars) {
      const a = 0.35 + 0.5 * Math.abs(Math.sin(this.t * 0.8 + s.tw));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.hi;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // 惑星シルエット（左上・右下）
    ctx.fillStyle = 'rgba(60,50,120,0.25)';
    ctx.beginPath(); ctx.arc(30, 90, 90, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(40,80,140,0.20)';
    ctx.beginPath(); ctx.arc(W - 20, H - 120, 110, 0, 7); ctx.fill();

    // タイトル
    ctx.save();
    ctx.shadowColor = p.mid; ctx.shadowBlur = 18;
    this.engine.text('METEOR', W / 2, 150, 52, p.hi, 'center');
    ctx.restore();
    this.engine.text('// PROTOCOL', W / 2, 208, 16, p.mid, 'center');

    // 都市スカイライン（ネオン輪郭・下部）
    ctx.save();
    ctx.strokeStyle = p.mid; ctx.lineWidth = 1.6;
    ctx.shadowColor = p.mid; ctx.shadowBlur = 8;
    ctx.beginPath();
    let x = 0; const base = H - 120;
    const heights = [18, 34, 22, 44, 28, 52, 20, 38, 26, 46, 18, 30];
    for (const h of heights) {
      const w = W / heights.length;
      ctx.lineTo(x, base); ctx.lineTo(x, base - h); ctx.lineTo(x + w, base - h);
      x += w;
    }
    ctx.lineTo(W, base);
    ctx.stroke();
    ctx.restore();

    // 開始プロンプト（点滅）
    if (Math.floor(this.t * 1.6) % 2 === 0)
      this.engine.text('TAP TO DEFEND', W / 2, H - 84, 16, p.fg, 'center');
    this.engine.text('BEST ' + (this.engine.storage.getHigh('meteor') || 0), W / 2, H - 52, 12, p.dim, 'center');
  }
}
