// ミッション POD（ツアー中に探査ミッションを解放するカプセル。PLAN §7m）。game.js から使う。
// 出る場所: 月（RYUGU）・火星（PHOBOS）・タイタン（ENCELADUS）・冥王星（67P）のステージ。まだ解放していないパイロットだけ。
// 出る確率: 30% + 外れるたびに +20%、4 回目の機会で必ず出る（運だけで詰まらない）。外れ回数はパイロットごとに保存。
// 取り方: 上空で機体のそばに現れ、機体の周り（50〜80px、上半分）をゆっくり漂う。ゆっくり付いてくるので、機体を少し寄せると
//   磁石の範囲（46px）に入って吸い寄せられ、24px で取れる。機体が地面から 150px より下がるか、出てから 16 秒で上へ去る（逃した扱い）。
// 得点は 0。取った瞬間に解放を保存（その後の墜落でも保持）。乱数は Math.random を使わない（ツアーの乱数の並びを変えない）。
// バンドルは1つのスコープなので、トップレベルの名前はすべて POD_ / pod で始める。
import { expForBody } from './expedition/index.js';
import { xpIsUnlocked, xpUnlock, xpPodMiss, xpSetPodMiss } from './expdata.js';
import { txt, rgba } from './art.js';
import { P } from './core/palette.js';

export const POD_P0 = 0.3, POD_STEP = 0.2, POD_SURE = 3;
export const POD = { appear0: 1.2, appear1: 2.8, r0: 50, r1: 80, follow: 0.45, magnet: 46, pick: 24, leaveAlt: 150, minAlt: 200, life: 16, leaveS: 1.2, topY: 78, label: 2.2 };
export function podChance(miss) { return miss >= POD_SURE ? 1 : Math.min(1, POD_P0 + POD_STEP * Math.max(0, miss)); }
export function podRng(seed) { let s = (seed >>> 0) || 0x9E3779B9; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// ステージ開始時の判定。出るなら { id, rnd }、出ないなら null。対象のステージなら外れ回数を +1 して保存（取れば解放で上書きされる）
export function podPlan(storage, pilot, bodyId, rnd) {
  const m = expForBody(bodyId);
  if (!m || !pilot || !storage) return null;
  if (xpIsUnlocked(storage, pilot, m.id)) return null;
  const miss = xpPodMiss(storage, pilot, m.id), go = rnd() < podChance(miss);
  xpSetPodMiss(storage, pilot, m.id, miss + 1);
  return go ? { id: m.id } : null;
}

export class Pod {
  constructor(id, rnd) {
    this.id = id; this.rnd = rnd || Math.random;
    this.state = 'wait'; this.t = 0; this.vis = 0; this.leaveT = 0;
    this.appearAt = POD.appear0 + this.rnd() * (POD.appear1 - POD.appear0);
    this.ph = this.rnd() * 6.28; this.x = 0; this.y = 0; this.near = false;
  }
  // 機体のまわり（上半分）の漂う位置。画面の上端で押し下げられたら、その分を横へ逃がして距離 r を保つ（勝手に磁石の範囲へ入らない）
  _target(sx, sy) {
    const a = -Math.PI / 2 + 1.15 * Math.sin(this.ph + this.vis * 0.45), r = (POD.r0 + POD.r1) / 2 + (POD.r1 - POD.r0) / 2 * Math.sin(this.vis * 0.7 + this.ph);
    let x = sx + Math.cos(a) * r, y = sy + Math.sin(a) * r * 0.8;
    if (y < POD.topY) {
      y = POD.topY; const dy = y - sy, side = Math.cos(a) !== 0 ? Math.sign(Math.cos(a)) : 1;
      x = sx + side * Math.sqrt(Math.max(0, r * r - dy * dy));
    }
    if (x < 16 || x > 344) x = sx - (x - sx);   // 画面の横端なら反対側へ
    return { x: Math.max(16, Math.min(344, x)), y };
  }
  // ship = { x, y }、alt = 機体の足元から地面まで px。戻り値 'got' | null
  step(dt, ship, alt) {
    this.t += dt;
    if (this.state === 'wait') {
      if (this.t >= this.appearAt) {
        if (alt < POD.minAlt) { this.state = 'gone'; return null; }   // もう低すぎる = 出さない
        this.state = 'float'; this.vis = 0; const g = this._target(ship.x, ship.y); this.x = g.x; this.y = g.y;
      }
      return null;
    }
    if (this.state === 'leave') { this.leaveT += dt; this.y -= 140 * dt; if (this.leaveT >= POD.leaveS) this.state = 'gone'; return null; }
    if (this.state !== 'float') return null;
    this.vis += dt;
    const g = this._target(ship.x, ship.y), k = 1 - Math.exp(-POD.follow * dt);
    this.x += (g.x - this.x) * k; this.y += (g.y - this.y) * k;
    const dx = ship.x - this.x, dy = ship.y - this.y, d = Math.hypot(dx, dy);
    this.near = d < POD.magnet;
    if (this.near && d > 0.01) { const v = Math.min(d, (40 + (POD.magnet - d) * 7) * dt); this.x += dx / d * v; this.y += dy / d * v; }
    if (Math.hypot(ship.x - this.x, ship.y - this.y) < POD.pick) { this.state = 'got'; return 'got'; }
    if (alt < POD.leaveAlt || this.vis > POD.life) { this.state = 'leave'; this.leaveT = 0; }
    return null;
  }
  get visible() { return this.state === 'float' || this.state === 'leave'; }
  draw(ctx, clock) {
    if (!this.visible) return;
    const p = P(), a = this.state === 'leave' ? Math.max(0, 1 - this.leaveT / POD.leaveS) : Math.min(1, this.vis / 0.3), t = clock || 0;
    ctx.save(); ctx.globalAlpha *= a;
    if (this.vis < 0.6) { const k = this.vis / 0.6; ctx.strokeStyle = rgba(p.warn, 0.8 * (1 - k)); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(this.x, this.y, 8 + k * 40, 0, 7); ctx.stroke(); }   // 出現の輪
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    const gl = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, 20); gl.addColorStop(0, rgba(p.warn, 0.35 + 0.2 * pulse)); gl.addColorStop(1, rgba(p.warn, 0));
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(this.x, this.y, 20, 0, 7); ctx.fill();
    if (this.near) { ctx.setLineDash([2, 3]); ctx.strokeStyle = rgba(p.mid, 0.6); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(this.x, this.y, 12 + 3 * pulse, 0, 7); ctx.stroke(); ctx.setLineDash([]); }
    ctx.translate(this.x, this.y); ctx.rotate(Math.sin(t * 1.3 + this.ph) * 0.5);
    ctx.fillStyle = '#E8E2D2'; ctx.beginPath(); ctx.ellipse(0, 0, 8, 5.5, 0, 0, 7); ctx.fill();   // カプセル
    ctx.fillStyle = '#9aa3b3'; ctx.fillRect(-1.2, -5.5, 2.4, 11);
    ctx.strokeStyle = p.warn; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 0, 8, 5.5, 0, 0, 7); ctx.stroke();
    ctx.fillStyle = rgba(p.warn, 0.5 + 0.5 * pulse); ctx.beginPath(); ctx.arc(4.2, -1.5, 1.4, 0, 7); ctx.fill();   // 点滅灯
    ctx.restore();
    if (this.state === 'float' && this.vis < POD.label) txt(ctx, 'POD', this.x, this.y - 26, 9, p.warn, 'center', { w: 800, sp: 2, a: a * (0.6 + 0.4 * pulse) * Math.min(1, (POD.label - this.vis) / 0.4) });
  }
}
export function podUnlock(storage, pilot, id) { return xpUnlock(storage, pilot, id); }
