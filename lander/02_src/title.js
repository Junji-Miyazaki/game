// タイトル画面（P0の仮実装。P2でリデザインする）。タップで開始。
// 上位3件を表示し、RANKING ターゲットで上位10件の一覧を開閉する。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, createRankTabs, rankTabsTap, drawRankPanel, getPlayerName, setPlayerName } from './ranking.js';
import { isDebug, debugLogoTap } from './debug.js';

// 名前入力オーバーレイ（HTML）。document が無い環境では false を返し何もしない。確定で onSubmit(name)。
export function showNameOverlay(initial, onSubmit) {
  if (typeof document === 'undefined') return false;
  const old = document.getElementById('lander-name-entry');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const wrap = document.createElement('div');
  wrap.id = 'lander-name-entry';
  wrap.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;' +
    'background:#151b32;border:2px solid #3ee6ff;border-radius:6px;padding:16px;width:min(300px,86vw);' +
    'box-sizing:border-box;text-align:center;color:#c9ecff;font-family:"Rajdhani",sans-serif;';
  const label = document.createElement('div');
  label.textContent = 'ENTER YOUR NAME';
  label.style.cssText = 'font-size:18px;margin-bottom:10px;';
  const input = document.createElement('input');
  input.type = 'text'; input.maxLength = 10; input.value = initial || ''; input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.style.cssText = 'width:100%;box-sizing:border-box;font-size:20px;padding:8px;text-align:center;' +
    'background:#0a0e1c;color:#fff;border:1px solid #33406b;border-radius:4px;outline:none;';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'OK';
  btn.style.cssText = 'margin-top:12px;width:100%;font-size:20px;padding:10px;background:#3ee6ff;color:#0a0e1c;border:0;border-radius:4px;font-weight:700;font-family:inherit;';
  const done = () => { const v = input.value; if (wrap.parentNode) wrap.parentNode.removeChild(wrap); onSubmit(v); };
  btn.addEventListener('click', done);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); done(); }
  });
  wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(btn);
  document.body.appendChild(wrap);
  try { input.focus(); input.select(); } catch (_) { /* ignore */ }
  return true;
}

export class TitleScene extends Scene {
  constructor(engine, startGame) {
    super(engine);
    this.startGame = startGame;
    this.isRoot = true;    // 最上位＝BACKボタン非表示
    this.t = 0;
    this.showRank = false;
    this.rank = [];
    this.tabs = createRankTabs();
    this.name = '';
    this.pendingStart = false;
    this.toastT = 0;
    this.logoBox = { x: W / 2 - 110, y: H * 0.36 - 34, w: 220, h: 68 };
    this.changeBtn = { x: W / 2 - 34, y: H * 0.545, w: 68, h: 18 };
    this.rankBtn = { x: W / 2 - 60, y: H * 0.88, w: 120, h: 30 };
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.2 ? 1.6 : 0.9, tw: Math.random() * 6.28 });
    }
  }

  enter() { this.rank = loadRanking(this.engine.storage); this.tabs = createRankTabs(); this.name = getPlayerName(this.engine.storage); }

  // 名前確定（HTML・テストフック共通）。開始待ち(pendingStart)ならそのままゲーム開始
  _submitName(name) {
    this.name = setPlayerName(this.engine.storage, name);
    if (this.pendingStart) { this.pendingStart = false; this.startGame(); }
  }
  _openName(thenStart) {
    this.pendingStart = !!thenStart;
    showNameOverlay(this.name || '', (v) => this._submitName(v));
  }

  onInput(action, data) {
    if (action === 'tap' && data) {
      const b = this.rankBtn;
      if (data.x >= b.x && data.x <= b.x + b.w && data.y >= b.y && data.y <= b.y + b.h) {
        this.showRank = !this.showRank;
        if (this.showRank) this.tabs = createRankTabs();
        return;
      }
      // 開いている一覧の LOCAL / WORLD タブ（RELAY_URL 設定時のみ）
      if (this.showRank && rankTabsTap(this.tabs, 32, 130, data.x, data.y, W - 64)) return;
    }
    if (action === 'tap' && data) {
      const lb = this.logoBox;
      if (data.x >= lb.x && data.x <= lb.x + lb.w && data.y >= lb.y && data.y <= lb.y + lb.h) {
        // ロゴ5連打（2秒以内）でデバッグ有効化。ロゴタップではゲームを開始しない
        if (debugLogoTap(data.now)) this.toastT = 2;
        return;
      }
      const cb = this.changeBtn;
      if (this.name && data.x >= cb.x && data.x <= cb.x + cb.w && data.y >= cb.y && data.y <= cb.y + cb.h) { this._openName(false); return; }
    }
    if (action === 'tap' || action === 'confirm') {
      this.engine.audio.good();
      if (!this.name) { this._openName(true); return; }   // 名前未設定: 入力後に開始
      this.startGame();
    }
  }

  update(dt) { this.t += dt; if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt); }

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

    if (this.name) {
      this.engine.text('PILOT: ' + this.name, W / 2, H * 0.50, 14, p.fg, 'center');
      const cb = this.changeBtn;
      this.engine.stroke(cb.x, cb.y, cb.w, cb.h, p.dim, 1);
      this.engine.text('CHANGE', W / 2, cb.y + 3, 10, p.mid, 'center');
    }
    if (isDebug()) this.engine.text('DEBUG', W - 8, 8, 10, p.warn, 'right');
    if (this.toastT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.toastT);
      this.engine.rect(W / 2 - 50, 40, 100, 24, p.dark); this.engine.stroke(W / 2 - 50, 40, 100, 24, p.warn, 1.5);
      this.engine.text('DEBUG ON', W / 2, 45, 13, p.warn, 'center');
      ctx.restore();
    }

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
      drawRankPanel(this.engine, ctx, this.tabs, this.rank, 32, 130, W - 64, -1);
    }
  }
}
