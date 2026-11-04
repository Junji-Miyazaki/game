// EXPEDITION（本編 v1.1）: ミッション画面のシーンと、POD を受け取った後の全画面演出（MISSION ACCEPTED）。
// ミッション本体は 02_src/expedition/（試作ページと共通）。ここは本編のエンジンにつなぐだけ:
//   ループ = Engine が update/render を呼ぶ / 指 = engine.touches / タップ = onInput('tap') / 音 = engine.audio.ctx（ミュートに従う）
//   記録 = パイロットごと（expdata.js の xpStore）/ BACK・Escape = shell.back（メニュー → マップへ）
// バンドルは1つのスコープなので、トップレベルの名前はすべて xp / XP_ / Expedition で始める。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { txt, rgba, rr } from './art.js';
import { i18nLang } from './core/i18n.js';
import { Music } from './music.js';
import { getActiveProfile } from './ranking.js';
import { expMission } from './expedition/index.js';
import { xpStore, xpDrawBody, xpBodyColor, xpMarkPlayed } from './expdata.js';

const XP_mus = (engine) => (engine && engine.music) || Music;

export class ExpeditionScene extends Scene {
  // onExit: メニューの MAP / Escape で呼ぶ（main.js がタイトル＋マップへ戻す）
  // opts.detour（beta.9）: ツアーからの寄り道。メニューを出さずに MISSION で始め、終わったら onExit でツアーへ戻る
  constructor(engine, id, onExit, opts) {
    super(engine);
    this.id = id; this.meta = expMission(id); this.onExit = onExit || null; this.detour = !!(opts && opts.detour);
    this.isRoot = true;   // エンジンの BACK ボタンは出さない（メニューに MAP を出す）
    this.lab = null; this._left = false;
  }
  enter() {
    const eng = this.engine, st = eng.storage;
    let pilot = ''; try { const pr = getActiveProfile(st); pilot = (pr && pr.name) || ''; } catch (_) { pilot = ''; }
    this.pilot = pilot;
    const muted = () => { try { const mu = XP_mus(eng); return !!(mu.isMuted && mu.isMuted()) || (eng.audio && eng.audio.enabled === false); } catch (_) { return false; } };
    this.lab = this.meta.create({
      embed: { ctx: eng.ctx, canvas: eng.canvas, touches: () => eng.touches || [], audioCtx: () => (eng.audio && eng.audio.ctx) || null },
      store: xpStore(st, pilot, this.id), onExit: () => this._exit(), lang: () => i18nLang(), muted, detour: this.detour,
    });
    // 一度でも PRACTICE / MISSION を始めたら「遊んだ」（ツアーでの再案内と終了画面の入口が止まる）
    const sh = this.lab.shell, begin = sh.begin;
    sh.begin = (l, mode, o) => { if (mode === 'practice' || mode === 'mission') xpMarkPlayed(st, pilot, this.id); return begin(l, mode, o); };
    this.lab.start();
    if (this.detour) sh.startDetour(this.lab);
    try { const mu = XP_mus(eng); if (mu.stopJingle) mu.stopJingle(0.3); mu.playBody(this.meta.music); } catch (_) { /* 音なし */ }
  }
  exit() {
    if (this.lab) this.lab.destroy();
    try { XP_mus(this.engine).stopAll(0.5); } catch (_) { /* ignore */ }
  }
  _exit() { if (this._left) return; this._left = true; if (this.onExit) this.onExit(); }
  update(dt) {
    try { XP_mus(this.engine).tick(dt); } catch (_) { /* ignore */ }
    if (this.lab && !this._left) this.lab.step(typeof dt === 'number' && dt > 0 ? Math.min(dt, 0.1) : 0.016);
  }
  render() { if (this.lab) this.lab.draw(); }
  onInput(action, data) {
    if (!this.lab || this._left) return;
    if (action === 'tap' && data) this.lab.tap(data.x, data.y);
    else if (action === 'back') this.lab.shell.back(this.lab);
  }
}

// ---- MISSION ACCEPTED（ツアーで POD を取ったステージの終わりに全画面）----
// 暗転 → 天体が迫って大写し → 天体名と任務文が計器風に1文字ずつ → 「MISSION ACCEPTED」の印＋ジングル。タップで先へ / 閉じる。
// beta.9: 最後に2つのボタン（いま向かう = ツアーから寄り道 / ツアーを続ける）。自動では閉じない。
// st.kind = 'pod'（POD を取った）| 'offer'（解放済みで未挑戦の探査を、その天体のステージ後に再び案内。印・ジングルなし）
export const XP_ACC = { fade: 0.4, grow0: 0.3, grow1: 1.7, type0: 1.5, cps: 28, stamp: 3.0, close: 3.6, armed: 0.3 };
export const XP_BTN = { go: { x: 40, y: 522, w: 280, h: 48 }, tour: { x: 40, y: 580, w: 280, h: 44 } };
const XP_in = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
// ボタンの当たり。出てから XP_ACC.armed 秒は反応しない（飛ばしのタップがそのまま押さないように）。戻り値 'go' | 'tour' | null
export function xpAcceptedHit(st, x, y) {
  if (!st || st.t < XP_ACC.close + XP_ACC.armed) return null;
  return XP_in(XP_BTN.go, x, y) ? 'go' : XP_in(XP_BTN.tour, x, y) ? 'tour' : null;
}
const XP_e = (u) => { u = Math.max(0, Math.min(1, u)); return 1 - Math.pow(1 - u, 3); };
// st = { id, t }。戻り値なし
export function xpDrawAccepted(ctx, st, clock) {
  const m = expMission(st.id); if (!m) return;
  const p = P(), t = st.t, A = XP_ACC, ja = i18nLang() === 'ja';
  ctx.save();
  ctx.fillStyle = 'rgba(2,3,8,' + (0.94 * Math.min(1, t / A.fade)) + ')'; ctx.fillRect(0, 0, W, H);
  // 星が後ろへ流れる（迫っていく感じ）
  for (let i = 0; i < 60; i++) {
    const a = i * 2.39996, z = ((i * 0.137 + t * 0.35) % 1), d = 20 + z * z * 360;
    const x = 180 + Math.cos(a) * d, y = 250 + Math.sin(a) * d * 0.9;
    ctx.fillStyle = rgba('#ffffff', Math.min(1, t / 0.6) * (0.2 + 0.6 * z)); ctx.beginPath(); ctx.arc(x, y, 0.4 + z * 1.4, 0, 7); ctx.fill();
  }
  const g = XP_e((t - A.grow0) / (A.grow1 - A.grow0)), r = 6 + 84 * g;
  if (t > A.grow0) {
    const glow = ctx.createRadialGradient(180, 250, r * 0.6, 180, 250, r * 1.8); glow.addColorStop(0, rgba(xpBodyColor(st.id), 0.25)); glow.addColorStop(1, rgba(xpBodyColor(st.id), 0));
    ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(180, 250, r * 1.8, 0, 7); ctx.fill();
    xpDrawBody(ctx, st.id, 180, 250, r, clock || t);
  }
  const offer = st.kind === 'offer';
  txt(ctx, offer ? 'EXPEDITION READY' : 'MISSION POD RECEIVED', 180, 64, 9, p.mid, 'center', { w: 700, sp: 2.2, a: Math.min(1, t / 0.5) });
  txt(ctx, 'EXPEDITION 0' + m.no, 180, 82, 7.5, p.dim, 'center', { w: 600, sp: 2, a: Math.min(1, t / 0.5) });
  if (t > A.type0) {   // 計器風の文字送り（名前 → 任務名 → 任務文）
    const n = Math.floor((t - A.type0) * A.cps), task = ja ? m.task.ja : m.task.en;
    const l1 = m.name, l2 = m.title, l3 = task;
    const s1 = l1.slice(0, n), s2 = l2.slice(0, Math.max(0, n - l1.length)), s3 = Array.from(l3).slice(0, Math.max(0, n - l1.length - l2.length)).join('');
    const cur = Math.sin(t * 16) > 0 ? '_' : ' ';
    txt(ctx, s1 + (n < l1.length ? cur : ''), 180, 372, 22, p.fg, 'center', { w: 800, sp: 4 });
    if (s2) txt(ctx, s2 + (n < l1.length + l2.length ? cur : ''), 180, 404, 10, p.warn, 'center', { w: 700, sp: 1.8 });
    if (s3) txt(ctx, s3, 180, 426, ja ? 12 : 10, p.fg, 'center', { w: 600, sp: ja ? 0 : 0.6, a: 0.9 });
  }
  if (offer && t > A.type0) txt(ctx, ja ? 'まだ挑戦していない探査です' : 'NOT PLAYED YET', 180, 470, ja ? 11 : 9, p.warn, 'center', { w: 700, sp: ja ? 0 : 1.6, a: 0.85 });
  if (!offer && t > A.stamp) {   // 印: 少し傾いた枠が大きい所から押される
    const k = Math.min(1, (t - A.stamp) / 0.18), sc = 1.7 - 0.7 * k;
    ctx.save(); ctx.translate(180, 470); ctx.rotate(-0.12); ctx.scale(sc, sc); ctx.globalAlpha *= k;
    ctx.strokeStyle = p.warn; ctx.lineWidth = 2.2; ctx.strokeRect(-112, -20, 224, 40); ctx.lineWidth = 0.8; ctx.strokeRect(-107, -15, 214, 30);
    txt(ctx, 'MISSION ACCEPTED', 0, -8, 15, p.warn, 'center', { w: 800, sp: 2.4 });
    ctx.restore();
  }
  if (t > A.close) {   // 2つのボタン
    const k = Math.min(1, (t - A.close) / A.armed), B = XP_BTN, hot = 0.5 + 0.5 * Math.sin(t * 4.5);
    ctx.save(); ctx.globalAlpha *= k;
    txt(ctx, ja ? 'あとでマップからも挑戦できます' : 'YOU CAN ALSO PLAY IT LATER FROM THE MAP', 180, 508, ja ? 10 : 7.5, p.dim, 'center', { w: 600, sp: ja ? 0 : 0.8 });
    rr(ctx, B.go.x, B.go.y, B.go.w, B.go.h, 22); ctx.fillStyle = '#0D111B'; ctx.fill(); ctx.fillStyle = rgba(p.warn, 0.16 + 0.1 * hot); ctx.fill(); ctx.strokeStyle = rgba(p.warn, 0.9); ctx.lineWidth = 1.5; ctx.stroke();
    txt(ctx, (ja ? 'いま向かう  ▸  ' : 'GO NOW  ▸  ') + m.name, 180, B.go.y + 16, ja ? 15 : 13, p.warn, 'center', { w: 800, sp: ja ? 0.5 : 1.6 });
    rr(ctx, B.tour.x, B.tour.y, B.tour.w, B.tour.h, 20); ctx.fillStyle = '#0D111B'; ctx.fill(); ctx.strokeStyle = rgba(p.fg, 0.45); ctx.lineWidth = 1.2; ctx.stroke();
    txt(ctx, ja ? 'ツアーを続ける' : 'CONTINUE TOUR', 180, B.tour.y + 15, ja ? 13 : 11, p.fg, 'center', { w: 700, sp: ja ? 0.5 : 1.6, a: 0.85 });
    ctx.restore();
  }
  ctx.restore();
}
