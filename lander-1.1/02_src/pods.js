// ミッション POD（ツアー中に探査ミッションを解放するカプセル。PLAN §7m）。game.js から使う。
// 出る場所: 月（RYUGU）・火星（PHOBOS）・タイタン（ENCELADUS）・冥王星（67P）のステージ。まだ解放していないパイロットだけ。
// 出る確率: 30% + 外れるたびに +20%、4 回目の機会で必ず出る（運だけで詰まらない）。外れ回数はパイロットごとに保存。
// 取り方（beta.9）: 機体が画面の中ほど（y ≥ 200）まで降りた時、画面の中ほど（機体の 40〜80px 下・地面から 100px 以上上）に、
//   機体と反対側の横 110〜170px に現れ、出る時に短い音。その場で小さく揺れるだけで付いて来ない（自分で横へ寄せて取る）。
//   吸い寄せは 28px、18px で取れる。機体が POD より 90px 以上下へ降りるか、出てから 12 秒で上へ去る（逃した扱い）。
// 得点は 0。取った瞬間に解放を保存（その後の墜落でも保持）。乱数は Math.random を使わない（ツアーの乱数の並びを変えない）。
// バンドルは1つのスコープなので、トップレベルの名前はすべて POD_ / pod で始める。
import { expForBody } from './expedition/index.js';
import { xpIsUnlocked, xpUnlock, xpPodMiss, xpSetPodMiss } from './expdata.js';
import { txt, rgba } from './art.js';
import { P } from './core/palette.js';

export const POD_P0 = 0.3, POD_STEP = 0.2, POD_SURE = 3;
export const POD = { trigY: 200, minAlt: 140, dx0: 110, dx1: 170, dy0: 40, dy1: 80, clear: 100, minY: 150, bob: 6, sway: 10, magnet: 28, pick: 18, below: 90, life: 12, leaveS: 1.2, label: 2.2 };
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
    this.ph = this.rnd() * 6.28; this.u = this.rnd(); this.v = this.rnd();
    this.ax = 0; this.ay = 0; this.x = 0; this.y = 0; this.near = false;
  }
  // 出る位置: 機体と反対側の横（画面の中央寄りの側）・機体より少し下。地面から POD.clear 以上上。置けなければ null
  _place(ship, groundAt) {
    const side = ship.x < 180 ? 1 : -1, d = POD.dx0 + this.u * (POD.dx1 - POD.dx0);
    const cl = (v) => Math.max(24, Math.min(336, v));
    let x = cl(ship.x + side * d);
    if (Math.abs(x - ship.x) < POD.dx0) x = cl(ship.x - side * d);   // 画面の端で近すぎれば逆の側へ
    if (Math.abs(x - ship.x) < POD.dx0) return null;
    const gy = groundAt ? groundAt(x) : 640, y = Math.min(ship.y + POD.dy0 + this.v * (POD.dy1 - POD.dy0), gy - POD.clear);
    return y >= POD.minY ? { x, y } : null;
  }
  // ship = { x, y }、alt = 機体の足元から地面まで px、groundAt(x) = その x の地面の y。戻り値 'appear'（出た瞬間）| 'got' | null
  step(dt, ship, alt, groundAt) {
    this.t += dt;
    if (this.state === 'wait') {
      if (ship.y < POD.trigY) return null;
      const at = alt >= POD.minAlt ? this._place(ship, groundAt) : null;   // もう低すぎる・置く場所がない = このステージは出さない
      if (!at) { this.state = 'gone'; return null; }
      this.state = 'float'; this.vis = 0; this.ax = at.x; this.ay = at.y; this.x = at.x; this.y = at.y;
      return 'appear';
    }
    if (this.state === 'leave') { this.leaveT += dt; this.y -= 140 * dt; if (this.leaveT >= POD.leaveS) this.state = 'gone'; return null; }
    if (this.state !== 'float') return null;
    this.vis += dt;
    // その場で小さく揺れる（付いて来ない）。吸い寄せられた分は錨の位置もずらす
    const tx = this.ax + POD.sway * Math.sin(this.vis * 0.6 + this.ph), ty = this.ay + POD.bob * Math.sin(this.vis * 1.3 + this.ph);
    const k = 1 - Math.exp(-3 * dt); this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
    const dx = ship.x - this.x, dy = ship.y - this.y, d = Math.hypot(dx, dy);
    this.near = d < POD.magnet;
    if (this.near && d > 0.01) { const v = Math.min(d, (30 + (POD.magnet - d) * 6) * dt); this.x += dx / d * v; this.y += dy / d * v; this.ax += dx / d * v; this.ay += dy / d * v; }
    if (Math.hypot(ship.x - this.x, ship.y - this.y) < POD.pick) { this.state = 'got'; return 'got'; }
    if (ship.y > this.y + POD.below || this.vis > POD.life) { this.state = 'leave'; this.leaveT = 0; }
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
