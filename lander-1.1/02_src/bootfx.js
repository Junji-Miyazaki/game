// 起動画面の背景（07_lab/boot_backdrop の案 B「太陽系を暗く」を移植）。
// 3層の視差星 + 流れ星 + 明るさ約30%の太陽グロー・細い軌道・ゆっくり公転する惑星 + ロゴの呼吸グロー(周期4s)。
// 軽量化: 太陽グラデーションは ctx ごとに1回だけ作って使い回す（毎フレーム生成しない）。
import { P } from './core/palette.js';
import { rgba } from './art.js';

const BFX_W = 360, BFX_H = 640, BFX_TAU = Math.PI * 2;
const bfxRnd = (a, b) => a + Math.random() * (b - a);
const BFX_PLANETS = [   // 軌道半径, 周期(s), 半径, 色, 初期位相
  { r: 40, T: 70, s: 1.6, c: '#b9a58a', ph: 0.5 }, { r: 66, T: 110, s: 2.2, c: '#e8c98a', ph: 2.1 },
  { r: 98, T: 160, s: 2.6, c: '#63D8C9', ph: 4.0 }, { r: 132, T: 220, s: 2.0, c: '#d9805f', ph: 1.2 },
  { r: 186, T: 340, s: 4.2, c: '#d8b88e', ph: 5.3 }, { r: 236, T: 480, s: 3.6, c: '#e3d3a0', ph: 3.3 },
  { r: 290, T: 640, s: 3.0, c: '#8fd0e8', ph: 0.2 },
];
const BFX_BRIGHT = 0.3;   // 太陽系全体の明るさ

export class BootFx {
  constructor() {
    this.t = 0;
    this.layers = [
      { n: 22, r: 0.6, a: 0.28, vx: 1.2, vy: 2.0 },
      { n: 16, r: 0.9, a: 0.4, vx: 2.4, vy: 3.6 },
      { n: 8, r: 1.3, a: 0.55, vx: 3.6, vy: 5.5 },
    ].map((L) => ({ ...L, s: Array.from({ length: L.n }, () => ({ x: bfxRnd(0, BFX_W), y: bfxRnd(0, BFX_H), tw: bfxRnd(0, 6.28), f: bfxRnd(0.4, 0.9) })) }));
    this.shoot = null; this.nextShoot = bfxRnd(4, 8);
    this._g = null; this._gctx = null;
  }
  update(dt) {
    dt = dt > 0 ? dt : 0.016;
    this.t += dt;
    for (const L of this.layers) for (const s of L.s) {
      s.x += L.vx * dt; s.y += L.vy * dt;
      if (s.x > BFX_W + 2) s.x -= BFX_W + 4;
      if (s.y > BFX_H + 2) s.y -= BFX_H + 4;
    }
    this.nextShoot -= dt;
    if (!this.shoot && this.nextShoot <= 0) { this.shoot = { x: bfxRnd(60, BFX_W), y: bfxRnd(10, BFX_H * 0.3), u: 0, len: bfxRnd(40, 70) }; this.nextShoot = bfxRnd(8, 15); }
    if (this.shoot) { this.shoot.u += dt / 1.1; if (this.shoot.u >= 1) this.shoot = null; }
  }
  // 呼吸 0..1（周期 4 s）
  breath() { return 0.5 + 0.5 * Math.sin(this.t * BFX_TAU / 4 - 1.57); }
  draw(ctx) {
    const p = P(), t = this.t, cx = BFX_W / 2, cy = BFX_H * 0.34;
    // 太陽グロー・軌道・惑星
    ctx.save(); ctx.globalAlpha = BFX_BRIGHT;
    if (this._gctx !== ctx || !this._g) {
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
      g.addColorStop(0, rgba(p.warn, 0.9)); g.addColorStop(0.15, rgba(p.warn, 0.35)); g.addColorStop(1, rgba(p.warn, 0));
      this._g = g; this._gctx = ctx;
    }
    ctx.fillStyle = this._g; ctx.fillRect(cx - 90, cy - 90, 180, 180);
    ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, BFX_TAU); ctx.fill();
    ctx.strokeStyle = p.dim; ctx.lineWidth = 0.6; ctx.globalAlpha = BFX_BRIGHT * 0.55;
    ctx.beginPath();
    for (const o of BFX_PLANETS) { ctx.moveTo(cx + o.r, cy); ctx.ellipse(cx, cy, o.r, o.r * 0.55, 0, 0, BFX_TAU); }
    ctx.stroke();
    ctx.globalAlpha = BFX_BRIGHT * 1.4;
    for (const o of BFX_PLANETS) {
      const a = o.ph + t * BFX_TAU / o.T;
      ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * o.r, cy + Math.sin(a) * o.r * 0.55, o.s, 0, BFX_TAU); ctx.fill();
    }
    ctx.restore();
    // 星
    ctx.fillStyle = p.fg;
    for (const L of this.layers) for (const s of L.s) {
      ctx.globalAlpha = L.a * (0.55 + 0.45 * Math.sin(t * s.f + s.tw));
      ctx.beginPath(); ctx.arc(s.x, s.y, L.r, 0, BFX_TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const sh = this.shoot;
    if (sh) {
      const ang = 2.55, dx = Math.cos(ang), dy = Math.sin(ang), d = sh.u * 150;
      const hx = sh.x + dx * d, hy = sh.y + dy * d, fade = Math.sin(sh.u * Math.PI) * 0.35;
      const g = ctx.createLinearGradient(hx, hy, hx - dx * sh.len, hy - dy * sh.len);
      g.addColorStop(0, 'rgba(236,230,216,' + fade + ')'); g.addColorStop(1, 'rgba(236,230,216,0)');
      ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * sh.len, hy - dy * sh.len); ctx.stroke();
    }
  }
}
