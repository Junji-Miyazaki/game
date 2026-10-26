// BootScene 背景の比較プロトタイプ（02_src は読み取りのみ）。レイアウトは title.js BootScene.render と同一。
import { txt, pill, rgba, ellipsize } from '../../02_src/art.js?v=86285db95f';
import { P } from '../../02_src/core/palette.js?v=a36de9d9c3';
import { WHATSNEW } from '../../02_src/whatsnew.js?v=05ad9febf2';
import { APP_LABEL, APP_BUILD_TEXT } from '../../02_src/version.js?v=505abf124d';

const W = 360, H = 640;
const q = new URLSearchParams(location.search);
const state = { v: (q.get('v') || 'A').toUpperCase() === 'B' ? 'B' : 'A', reduce: q.get('reduce') === '1' };
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
function fit() {
  const r = cv.getBoundingClientRect(), s = (r.width || W) / W;
  cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
}
addEventListener('resize', fit); fit();

function rnd(a, b) { return a + Math.random() * (b - a); }
// 3層の視差星。速度 px/s（わずかに斜め）
const layers = [
  { n: 22, r: 0.6, a: 0.28, vx: 1.2, vy: 2.0 },
  { n: 16, r: 0.9, a: 0.4, vx: 2.4, vy: 3.6 },
  { n: 8, r: 1.3, a: 0.55, vx: 3.6, vy: 5.5 },
].map((L) => ({ ...L, s: Array.from({ length: L.n }, () => ({ x: rnd(0, W), y: rnd(0, H), tw: rnd(0, 6.28), f: rnd(0.4, 0.9) })) }));
let shoot = null, nextShoot = rnd(4, 8);

const PL = [ // 軌道半径, 周期(s), 半径, 色
  { r: 40, T: 70, s: 1.6, c: '#b9a58a', ph: 0.5 }, { r: 66, T: 110, s: 2.2, c: '#e8c98a', ph: 2.1 },
  { r: 98, T: 160, s: 2.6, c: '#63D8C9', ph: 4.0 }, { r: 132, T: 220, s: 2.0, c: '#d9805f', ph: 1.2 },
  { r: 186, T: 340, s: 4.2, c: '#d8b88e', ph: 5.3 }, { r: 236, T: 480, s: 3.6, c: '#e3d3a0', ph: 3.3 },
  { r: 290, T: 640, s: 3.0, c: '#8fd0e8', ph: 0.2 },
];

let t = 0, last = performance.now(), tReal = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  tReal += dt;
  const m = state.reduce ? 0 : 1;
  t += dt * m;
  render(dt * m);
  requestAnimationFrame(frame);
}
function stars(dt) {
  const p = P();
  for (const L of layers) for (const s of L.s) {
    s.x += L.vx * dt; s.y += L.vy * dt;
    if (s.x > W + 2) s.x -= W + 4; if (s.y > H + 2) s.y -= H + 4;
    const tw = state.reduce ? 0.7 : 0.55 + 0.45 * Math.sin(t * s.f + s.tw);
    ctx.globalAlpha = L.a * tw; ctx.fillStyle = p.fg;
    ctx.beginPath(); ctx.arc(s.x, s.y, L.r, 0, 6.2832); ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function shooting(dt) {
  if (state.reduce) return;
  nextShoot -= dt;
  if (!shoot && nextShoot <= 0) { shoot = { x: rnd(60, W), y: rnd(10, H * 0.3), u: 0, len: rnd(40, 70) }; nextShoot = rnd(8, 15); }
  if (!shoot) return;
  shoot.u += dt / 1.1;
  if (shoot.u >= 1) { shoot = null; return; }
  const ang = 2.55, dx = Math.cos(ang), dy = Math.sin(ang), d = shoot.u * 150;
  const hx = shoot.x + dx * d, hy = shoot.y + dy * d, fade = Math.sin(shoot.u * Math.PI) * 0.35;
  const g = ctx.createLinearGradient(hx, hy, hx - dx * shoot.len, hy - dy * shoot.len);
  g.addColorStop(0, 'rgba(236,230,216,' + fade + ')'); g.addColorStop(1, 'rgba(236,230,216,0)');
  ctx.strokeStyle = g; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - dx * shoot.len, hy - dy * shoot.len); ctx.stroke();
}
function solar() {
  const p = P(), cx = W / 2, cy = H * 0.34, K = 0.3;
  ctx.save(); ctx.globalAlpha = K;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 90);
  g.addColorStop(0, rgba(p.warn, 0.9)); g.addColorStop(0.15, rgba(p.warn, 0.35)); g.addColorStop(1, rgba(p.warn, 0));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffd98a'; ctx.beginPath(); ctx.arc(cx, cy, 6, 0, 6.2832); ctx.fill();
  ctx.strokeStyle = p.dim; ctx.lineWidth = 0.6;
  for (const o of PL) { ctx.globalAlpha = K * 0.55; ctx.beginPath(); ctx.ellipse(cx, cy, o.r, o.r * 0.55, 0, 0, 6.2832); ctx.stroke(); }
  ctx.globalAlpha = K * 1.4;
  for (const o of PL) {
    const a = o.ph + t * 6.2832 / o.T;
    ctx.fillStyle = o.c; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * o.r, cy + Math.sin(a) * o.r * 0.55, o.s, 0, 6.2832); ctx.fill();
  }
  ctx.restore();
}
function render(dt) {
  const p = P();
  ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
  if (state.v === 'B') solar();
  stars(dt); shooting(dt);
  const fadeIn = Math.min(1, tReal / 0.8);
  // ロゴの呼吸グロー（周期4s、控えめ）
  const br = state.reduce ? 0.5 : 0.5 + 0.5 * Math.sin(t * 6.2832 / 4 - 1.57);
  ctx.save(); ctx.shadowColor = rgba(p.mid, 0.25 + 0.4 * br); ctx.shadowBlur = 6 + 14 * br;
  txt(ctx, 'LANDER', W / 2, H * 0.40, 22, p.hi, 'center', { sp: 12, w: 300, a: (0.78 + 0.17 * br) * fadeIn });
  ctx.restore();
  txt(ctx, 'SOFT LANDING TOUR', W / 2, H * 0.40 + 34, 8, p.dim, 'center', { sp: 5, w: 400, a: fadeIn });
  txt(ctx, APP_LABEL, W / 2, H * 0.40 + 52, 8, p.mid, 'center', { sp: 5, w: 500, a: 0.8 * fadeIn });
  const pulse = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(tReal * 2.2));
  txt(ctx, 'TAP TO BEGIN', W / 2, H * 0.60, 12, p.fg, 'center', { sp: 6, w: 400, a: pulse * fadeIn });
  txt(ctx, 'SOUND ON', W / 2, H * 0.60 + 28, 7, p.dim, 'center', { sp: 5, w: 400, a: 0.7 * fadeIn });
  const y0 = 470, n = WHATSNEW.lines.length, nf = Math.max(0, Math.min(1, (tReal - 0.4) / 0.8));
  const bottom = y0 + 18 + (n - 1) * 18 + 12;
  if (state.v === 'B') { // 可読性用の暗いスクリム
    const sg = ctx.createLinearGradient(0, y0 - 24, 0, bottom + 30);
    sg.addColorStop(0, 'rgba(6,8,14,0)'); sg.addColorStop(0.18, 'rgba(6,8,14,0.78)'); sg.addColorStop(0.85, 'rgba(6,8,14,0.78)'); sg.addColorStop(1, 'rgba(6,8,14,0)');
    ctx.fillStyle = sg; ctx.fillRect(0, y0 - 24, W, bottom - y0 + 54);
  }
  txt(ctx, "WHAT'S NEW", W / 2, y0, 7, p.mid, 'center', { sp: 5, w: 500, a: 0.95 * nf });
  ctx.save(); ctx.globalAlpha = nf; pill(ctx, W / 2 + 66, y0 - 2, 28, 13, rgba(p.warn, 0.14), rgba(p.warn, 0.7));
  txt(ctx, 'NEW', W / 2 + 80, y0 - 2 + 3.5, 6, p.warn, 'center', { sp: 2, w: 600 }); ctx.restore();
  WHATSNEW.lines.forEach((l, i) => txt(ctx, ellipsize(ctx, l, 11, 400, 0.5, W - 40), W / 2, y0 + 18 + i * 18, 11, p.fg, 'center', { sp: 0.5, w: 400, a: 0.85 * nf }));
  txt(ctx, APP_BUILD_TEXT, W / 2, bottom + 16, 7, p.dim, 'center', { sp: 2, w: 400, a: 0.55 * nf });
}

const bA = document.getElementById('bA'), bB = document.getElementById('bB'), bR = document.getElementById('bR');
function sync() { bA.classList.toggle('on', state.v === 'A'); bB.classList.toggle('on', state.v === 'B'); bR.classList.toggle('on', state.reduce); }
function setV(v) { state.v = v; tReal = 0; const u = new URL(location); u.searchParams.set('v', v); history.replaceState(null, '', u); sync(); }
bA.onclick = () => setV('A'); bB.onclick = () => setV('B');
bR.onclick = () => { state.reduce = !state.reduce; sync(); };
sync();
window.__lab = { state, setV };
requestAnimationFrame(frame);
