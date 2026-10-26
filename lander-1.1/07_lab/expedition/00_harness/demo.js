// harness の動作確認デモ: 平らな地面 + 1つのパッドに着陸 / 離陸を繰り返す。物理スライダーを触って感触を見る。
import { createLab, W } from './harness.js';
import { txt } from '../../../02_src/art.js';
import { P } from '../../../02_src/core/palette.js';

const terrain = [];
for (let x = 0; x <= W; x += 10) terrain.push({ x, y: 520 });
const pads = [{ x: 150, y: 520, w: 60, id: 'pad' }];

const lab = createLab({
  canvas: document.getElementById('c'), title: 'HARNESS DEMO',
  defaults: { g: 0.25 },
  world: { terrain, pads },
  start(l) { l.resetShip({ x: 70, y: 90, vx: 6, vy: 10 }); l.msg = 'LAND ON THE PAD · THRUST TO LIFT OFF'; },
  onTouchdown(l, i) { l.msg = i.kind === 'pad' ? 'PAD: grade ' + i.grade : 'GROUND (no pad)'; },
  onCrash(l, r, d) { l.msg = r + ' — ' + d + ' · press R'; },
  onDrawBack(ctx) { const g = ctx.createLinearGradient(0, 0, 0, 560); g.addColorStop(0, '#04050a'); g.addColorStop(1, '#141a2a'); ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 640); },
  onDrawMid(ctx, l) { const p = l.world.pads[0]; ctx.fillStyle = '#ECE6D8'; ctx.fillRect(p.x, p.y - 2, p.w, 4); },
  onDrawFront(ctx, l) { txt(ctx, l.msg || '', 180, 70, 9, P().fg, 'center', { w: 600, sp: 0.5 }); },
});
lab.start();
