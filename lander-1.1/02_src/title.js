// タイトル画面（P0の仮実装。P2でリデザインする）。タップで開始。
// 上位3件を表示し、RANKING ターゲットで上位10件の一覧を開閉する。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, createRankTabs, rankTabsTap, drawRankPanel, getPlayerName, setPlayerName, sanitizeName, loadCheckpoint, clearCheckpoint, loadProfiles, getActiveProfile, setActiveProfile, addProfile, removeProfile, PROFILE_MAX, getMaxStage, unlockedStarts, WorldNet, sanitizeTitle, titleResultMessage, loadTop1, top1FromList, saveTop1, graphemes, TITLE_MAX } from './ranking.js';
import { relayEnabled, checkName, deleteName } from './net.js';
import { isDebug, debugLogoTap } from './debug.js';
import { Music } from './music.js';
import { txt, pill, rgba, veil, SITE, astronautCycle, drawTitleSky, drawLaunchSite, drawTower, drawRocket, drawLaunchFlame, drawGroundBlast, drawSmoke, drawSpeaker, drawAstronaut, drawProfilePanel, drawStartPanel, drawBetaTag, drawWorldBanner } from './art.js';

import { stageInfo } from './bodies.js';
import { WHATSNEW } from './whatsnew.js';
function stageBodyName(n) { try { const i = stageInfo(n); return i && i.body ? i.body.name : ''; } catch (_) { return ''; } }

// ---- 音楽/ミュート共通ヘルパー（game.js からも使う）----
// テストでは engine.music に差し替えられる。実機は music.js の Music。
export function musicOf(engine) { return (engine && engine.music) || Music; }
export const MUTE_KEY = 'muted';
export function isMuted(engine) { try { return engine.storage.get(MUTE_KEY, '0') === '1'; } catch (_) { return false; } }
// ミュート適用: 生成音楽(Music) と engine.audio のビープ両方を止める。保存は persist=true の時のみ
export function applyMute(engine, m, persist) {
  m = !!m;
  try { musicOf(engine).setMuted(m); } catch (_) { /* ignore */ }
  if (engine.audio) engine.audio.enabled = !m;
  if (persist) { try { engine.storage.set(MUTE_KEY, m ? '1' : '0'); } catch (_) { /* ignore */ } }
  return m;
}
export function toggleMute(engine) { return applyMute(engine, !isMuted(engine), true); }
export function restoreMute(engine) { return applyMute(engine, isMuted(engine), false); }

// ---- 発射シーケンスの時間割（秒）----
export const LAUNCH = { total: 3.5, ignite: 0.75, armStart: 1.0, armEnd: 1.7, lift: 1.6, accel: 300, camK: 0.6, fadeStart: 2.85 };
export const SMOKE_MAX = 80;     // 煙(kind 0)の同時粒子数の上限（モバイル性能のため）
export const STEAM_MAX = 18;     // 蒸気(kind 1)の上限
const clamp01 = (v) => Math.max(0, Math.min(1, v));

// 発射の経過時間 e から機体の上昇量
export function launchRise(e) { const u = Math.max(0, e - LAUNCH.lift); return 0.5 * LAUNCH.accel * u * u; }

// 煙粒子を1つ追加（上限超過なら捨てる）。side: -1|1
export function spawnSmoke(parts, side, burst) {
  let n = 0; for (let i = 0; i < parts.length; i++) if (parts[i].kind === 0) n++;
  if (n >= SMOKE_MAX) return false;
  const sp = (burst ? 110 : 60) + Math.random() * (burst ? 150 : 110);
  parts.push({
    kind: 0, x: SITE.rocketX + (Math.random() - 0.5) * 36, y: SITE.groundY - 3 + Math.random() * 5,
    vx: side * sp, vy: -(6 + Math.random() * 34), r: 11 + Math.random() * 8, gr: 30 + Math.random() * 30,
    age: 0, life: 2.3 + Math.random() * 1.1, ph: Math.random() * 6.28, spin: side * (0.5 + Math.random() * 0.8),
    peak: 0.9, warm: 1,
  });
  return true;
}
export function spawnSteam(parts, x, y, side, low) {
  let n = 0; for (let i = 0; i < parts.length; i++) if (parts[i].kind === 1) n++;
  if (n >= STEAM_MAX) return false;
  parts.push({
    kind: 1, x, y, vx: side * (8 + Math.random() * 8), vy: low ? -2 : -(9 + Math.random() * 6), r: low ? 6 : 3, gr: low ? 6 : 4,
    age: 0, life: 2.8 + Math.random() * 0.8, ph: 0, spin: 0, peak: low ? 0.14 : 0.2, warm: 0,
  });
  return true;
}
// 粒子の更新: 広がる・減速する・横へ流れる・薄れる。寿命切れは除去
export function stepSmoke(parts, dt) {
  const dragH = Math.exp(-1.5 * dt), dragV = Math.exp(-0.9 * dt), grD = Math.exp(-1.15 * dt);
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.age += dt;
    if (p.age >= p.life) { parts.splice(i, 1); continue; }
    p.vx *= dragH; p.vy = p.vy * dragV - (p.kind === 0 ? 26 : 3) * dt;
    p.x += (p.vx + 9) * dt; p.y += p.vy * dt;     // +9: ゆるい横風
    p.r += p.gr * dt; p.gr *= grD;
    if (p.kind === 0 && p.y > SITE.groundY + 3) { p.y = SITE.groundY + 3; p.vy = -Math.abs(p.vy) * 0.3; }
  }
}

// 次のシーンにフェードイン（暗転から）を被せる。ゲーム側のコードは触らない
export function fadeInScene(scene, dur) {
  const d = dur || 0.8;
  let ft = 0;
  const upd = scene.update.bind(scene), rnd = scene.render.bind(scene);
  scene.update = (dt) => { ft += (typeof dt === 'number' && dt > 0 ? dt : 0); return upd(dt); };
  scene.render = (ctx) => { rnd(ctx); if (ft < d) veil(ctx, 1 - ft / d); };
  return scene;
}


// 名前入力オーバーレイ（HTML）。document が無い環境では false を返し何もしない。確定で onSubmit(name)。
// onSubmit(value) は null/undefined（受理）・文字列（インラインのエラー表示でオーバーレイを維持）・Promise<文字列|null>（確認中は CHECKING…）を返せる。
// opts: { label, password, max }
export function showNameOverlay(initial, onSubmit, opts) {
  if (typeof document === 'undefined') return false;
  const old = document.getElementById('lander-name-entry');
  if (old && old.parentNode) old.parentNode.removeChild(old);
  const wrap = document.createElement('div');
  wrap.id = 'lander-name-entry';
  wrap.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);z-index:1000;' +
    'background:#151b32;border:2px solid #3ee6ff;border-radius:6px;padding:16px;width:min(300px,86vw);' +
    'box-sizing:border-box;text-align:center;color:#c9ecff;font-family:"Rajdhani",sans-serif;';
  const label = document.createElement('div');
  label.textContent = (opts && opts.label) || 'ENTER YOUR NAME';
  label.style.cssText = 'font-size:18px;margin-bottom:10px;';
  const input = document.createElement('input');
  input.type = (opts && opts.password) ? 'password' : 'text'; input.maxLength = (opts && opts.max) || 10; input.value = initial || ''; input.autocomplete = 'off';
  input.setAttribute('autocapitalize', 'off');
  input.style.cssText = 'width:100%;box-sizing:border-box;font-size:20px;padding:8px;text-align:center;' +
    'background:#0a0e1c;color:#fff;border:1px solid #33406b;border-radius:4px;outline:none;';
  const btn = document.createElement('button');
  btn.type = 'button'; btn.textContent = 'OK';
  btn.style.cssText = 'margin-top:12px;width:100%;font-size:20px;padding:10px;background:#3ee6ff;color:#0a0e1c;border:0;border-radius:4px;font-weight:700;font-family:inherit;';
  const msg = document.createElement('div');
  msg.style.cssText = 'min-height:18px;margin-top:10px;font-size:13px;letter-spacing:1px;color:#ffb547;';
  let busy = false;
  const fin = (m) => { busy = false; btn.disabled = false; if (m) msg.textContent = String(m); else if (wrap.parentNode) wrap.parentNode.removeChild(wrap); };
  const done = () => {
    if (busy) return;
    let r = null;
    try { r = onSubmit(input.value); } catch (_) { r = null; }
    if (r && typeof r.then === 'function') { busy = true; btn.disabled = true; msg.textContent = 'CHECKING\u2026'; r.then(fin, () => fin(null)); }
    else fin(typeof r === 'string' ? r : null);
  };
  btn.addEventListener('click', done);
  input.addEventListener('keydown', (e) => {
    if (e.isComposing || e.keyCode === 229) return;
    if (e.key === 'Enter') { e.preventDefault(); done(); }
  });
  wrap.appendChild(label); wrap.appendChild(input); wrap.appendChild(btn); wrap.appendChild(msg);
  document.body.appendChild(wrap);
  try { input.focus(); input.select(); } catch (_) { /* ignore */ }
  return true;
}

export function nameOverlayOpen() {
  return typeof document !== 'undefined' && !!(document.getElementById && document.getElementById('lander-name-entry'));
}
export function hideNameOverlay() {
  try {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const old = document.getElementById('lander-name-entry');
    if (old && old.parentNode) old.parentNode.removeChild(old);
  } catch (_) { /* ignore */ }
}

// ---- チャンピオン称号の入力（WORLD #1 のみ）----
// document が無い環境でも状態機械として動く（テスト用）。DOM は薄い皮。
// o = { name, key, initial, heading, storage, onClose(ctrl) }。save(raw) -> Promise<result>。成功は約1.2秒後に自動で閉じる。失敗はメッセージを出して残す（SKIP で必ず抜けられる）
export const CHAMP_ID = 'lander-champ-entry';
export function openChampionEntry(o) {
  hideChampionEntry();
  const c = { open: true, busy: false, msg: '', ok: false, name: o.name, heading: o.heading || '', value: sanitizeTitle(o.initial || ''), _timer: 0, _dom: null };
  const render = () => { if (c._dom) { c._dom.msg.textContent = c.msg; c._dom.save.disabled = c.busy; c._dom.skip.textContent = c.ok || c.msg ? 'CLOSE' : 'SKIP'; } };
  c.close = () => {
    if (!c.open) return;
    c.open = false;
    if (c._timer) { clearTimeout(c._timer); c._timer = 0; }
    if (c._dom && c._dom.wrap.parentNode) c._dom.wrap.parentNode.removeChild(c._dom.wrap);
    c._dom = null;
    try { if (o.onClose) o.onClose(c); } catch (_) { /* ignore */ }
  };
  c.skip = () => c.close();
  c.save = async (raw) => {
    if (!c.open || c.busy) return null;
    const title = sanitizeTitle(raw === undefined ? c.value : raw);
    c.value = title; c.busy = true; c.ok = false; c.msg = 'SAVING\u2026'; render();
    let r;
    try { r = await WorldNet.setTitle(o.name, o.key, title); } catch (_) { r = { ok: false, error: 'unavailable' }; }
    if (!c.open) return r;
    c.busy = false; c.ok = !!(r && r.ok); c.msg = titleResultMessage(r); c.result = r;
    if (c.ok) {
      const saved = (r && typeof r.title === 'string') ? sanitizeTitle(r.title) : title;
      if (o.storage) { const t1 = loadTop1(o.storage); if (t1 && t1.name === o.name) { t1.title = saved; saveTop1(o.storage, t1); } }
      c._timer = setTimeout(() => c.close(), 1200);
    }
    render();
    return r;
  };
  if (typeof document !== 'undefined' && document.body && document.createElement) {
    try {
      const wrap = document.createElement('div');
      wrap.id = CHAMP_ID;
      const head = document.createElement('div'); head.className = 'ce-head'; head.textContent = c.heading;
      const sub = document.createElement('div'); sub.className = 'ce-name'; sub.textContent = o.name;
      const label = document.createElement('div'); label.className = 'ce-label'; label.textContent = 'YOUR TITLE (OPTIONAL, MAX ' + TITLE_MAX + ')';
      const input = document.createElement('input');
      input.type = 'text'; input.maxLength = 64; input.value = c.value; input.autocomplete = 'off'; input.spellcheck = false;
      input.setAttribute('autocapitalize', 'off'); input.placeholder = '\u300c \u300d';
      const save = document.createElement('button'); save.type = 'button'; save.textContent = 'SAVE'; save.className = 'ce-save';
      const skip = document.createElement('button'); skip.type = 'button'; skip.textContent = 'SKIP'; skip.className = 'ce-skip';
      const msg = document.createElement('div'); msg.className = 'ce-msg';
      let composing = false;
      const clamp = () => { if (composing) return; const g = graphemes(input.value); if (g.length > TITLE_MAX) input.value = g.slice(0, TITLE_MAX).join(''); c.value = input.value; };
      input.addEventListener('compositionstart', () => { composing = true; });
      input.addEventListener('compositionend', () => { composing = false; clamp(); });
      input.addEventListener('input', clamp);
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.isComposing || e.keyCode === 229) return;
        if (e.key === 'Enter') { e.preventDefault(); c.save(input.value); }
        else if (e.key === 'Escape') { e.preventDefault(); c.skip(); }
      });
      save.addEventListener('click', () => c.save(input.value));
      skip.addEventListener('click', () => c.skip());
      const row = document.createElement('div'); row.className = 'ce-row'; row.appendChild(save); row.appendChild(skip);
      [head, sub, label, input, row, msg].forEach((n) => wrap.appendChild(n));
      document.body.appendChild(wrap);
      c._dom = { wrap, input, save, skip, msg };
      try { input.focus(); input.select(); } catch (_) { /* ignore */ }
    } catch (_) { c._dom = null; }
  }
  return c;
}
export function hideChampionEntry() {
  try {
    if (typeof document === 'undefined' || !document.getElementById) return;
    const old = document.getElementById(CHAMP_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
  } catch (_) { /* ignore */ }
}
export function championEntryOpen(c) { return !!(c && c.open); }

// ---- 起動画面「TAP TO BEGIN」----
// ブラウザは最初のユーザー操作まで音を出せない（自動再生の制限）。ここで1回タップしてもらうことで
// 音声が有効になり、次のタイトル画面は表示された瞬間から曲が流れる（TitleScene.enter が ctx を見て再生）。
// 音声の有効化そのものは engine の入力処理（audio.unlock）がジェスチャ内で行う。
export class BootScene extends Scene {
  constructor(engine, next) {
    super(engine);
    this.next = next;
    this.isRoot = true;   // BACKボタン非表示
    this.t = 0;
    this.done = false;
    this.stars = [];
    for (let i = 0; i < 46; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * H, r: Math.random() < 0.15 ? 1.3 : 0.7, tw: Math.random() * 6.28 });
    }
  }
  onInput(action, data) {
    if (this.done) return;
    if (data && data.repeat) return;
    if (action === 'tap' || action === 'confirm') {
      this.done = true;
      try { this.engine.storage.set('seenVersion', WHATSNEW.version); } catch (_) { /* 保存できなくても進める */ }
      if (typeof this.next === 'function') this.next();
    }
  }
  // WHAT'S NEW の配置（ロゴ y~256 / TAP TO BEGIN y~384 / SOUND ON y~412 の下。360x640 で重ならない）
  newsLayout() {
    const y0 = 470, n = WHATSNEW.lines.length;
    return { head: { x: W / 2 - 60, y: y0, w: 120, h: 9 }, pill: { x: W / 2 + 66, y: y0 - 2, w: 28, h: 13 },
      lines: WHATSNEW.lines.map((_, i) => ({ x: 28, y: y0 + 18 + i * 15, w: W - 56, h: 9 })), bottom: y0 + 18 + (n - 1) * 15 + 9 };
  }
  isNewVersion() {
    let seen = null; try { seen = this.engine.storage.get('seenVersion', null); } catch (_) { /* ignore */ }
    return seen !== WHATSNEW.version;
  }
  update(dt) { this.t += (dt > 0 ? dt : 0.016); }
  render(ctx) {
    const p = P();
    ctx.fillStyle = p.bg; ctx.fillRect(0, 0, W, H);
    for (const s of this.stars) {
      ctx.globalAlpha = Math.max(0, Math.min(1, 0.18 + 0.32 * Math.abs(Math.sin(this.t * 0.6 + s.tw))));
      ctx.fillStyle = p.fg;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const fadeIn = Math.min(1, this.t / 0.8);
    txt(ctx, 'LANDER', W / 2, H * 0.40, 22, p.hi, 'center', { sp: 12, w: 300, a: 0.85 * fadeIn });
    txt(ctx, 'SOFT LANDING TOUR', W / 2, H * 0.40 + 34, 8, p.dim, 'center', { sp: 5, w: 400, a: fadeIn });
    const pulse = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(this.t * 2.2));
    txt(ctx, 'TAP TO BEGIN', W / 2, H * 0.60, 12, p.fg, 'center', { sp: 6, w: 400, a: pulse * fadeIn });
    txt(ctx, 'SOUND ON', W / 2, H * 0.60 + 28, 7, p.dim, 'center', { sp: 5, w: 400, a: 0.7 * fadeIn });
    // WHAT'S NEW（静かに）。未確認のバージョンなら NEW のピルと少し明るい文字
    const nw = this.newsLayout(), fresh = this.isNewVersion(), nf = Math.max(0, Math.min(1, (this.t - 0.4) / 0.8));
    txt(ctx, "WHAT'S NEW", W / 2, nw.head.y, 7, fresh ? p.mid : p.dim, 'center', { sp: 5, w: 500, a: (fresh ? 0.95 : 0.7) * nf });
    if (fresh) {
      ctx.save(); ctx.globalAlpha = nf; pill(ctx, nw.pill.x, nw.pill.y, nw.pill.w, nw.pill.h, rgba(p.warn, 0.14), rgba(p.warn, 0.7));
      txt(ctx, 'NEW', nw.pill.x + nw.pill.w / 2, nw.pill.y + 3.5, 6, p.warn, 'center', { sp: 2, w: 600 }); ctx.restore();
    }
    for (let i = 0; i < WHATSNEW.lines.length; i++) {
      txt(ctx, WHATSNEW.lines[i], W / 2, nw.lines[i].y, 8, p.fg, 'center', { sp: 2, w: 400, a: (fresh ? 0.8 : 0.5) * nf });
    }
  }
}

export class TitleScene extends Scene {
  // opts.launch=true で START 後に約3.5秒の発射シーケンスを挟む（main.js が指定）。省略時は即開始（従来動作）。
  constructor(engine, startGame, opts) {
    super(engine);
    this.startGame = startGame;
    this.useLaunch = !!(opts && opts.launch);
    this.isRoot = true;    // 最上位＝BACKボタン非表示
    this.t = 0;
    this.showRank = false;
    this.rank = [];
    this.tabs = createRankTabs();
    this.name = '';
    this.pendingStart = false;
    this.toastT = 0;
    this.launch = null;    // 発射中: { e, ign, done, parts }
    this.parts = [];       // 煙/蒸気の粒子
    this._musicOn = false;
    this._steamAcc = 0; this._smokeAcc = 0; this._steamSide = 1;
    // タップ対象（互いに重ならない。8pxグリッド）
    this.muteBtn = { x: W - 48, y: 6, w: 40, h: 40 };
    this.logoBox = { x: W / 2 - 110, y: 52, w: 220, h: 56 };
    this.betaBox = { x: W / 2 - 44, y: 114, w: 88, h: 16 };        // PUBLIC BETA（タップはロゴタップ扱い）
    this.changeBtn = { x: W / 2 - 40, y: 436, w: 80, h: 20 };      // PILOTS（旧 CHANGE。プロフィール一覧を開く）
    this.startBtn = { x: W / 2 - 90, y: 472, w: 180, h: 44 };
    this.continueBtn = { x: W / 2 - 110, y: 464, w: 220, h: 48 };  // チェックポイントがある時、START の代わり
    this.newBtn = { x: W / 2 - 70, y: 520, w: 140, h: 32 };
    this.worldBox = { x: 40, y: 134, w: 280, h: 28 };               // WORLD #1 バナー（1行目 y134、称号 y150。ロゴ/BETA(〜130)とロケット先端(164)の間）
    this.titleBtn = { x: 284, y: 132, w: 68, h: 22 };               // SET TITLE（現チャンピオンのみ。バナー右端）
    this.top1 = null;       // { name, score, title, at } 既知の WORLD #1
    this._topTok = 0; this._champ = null;
    this.cp = null;
    this.pick = null;                                               // CHOOSE START { list, sel, page }
    this.prof = null;                                               // PILOTS パネル { mode, target, msg, busy }
    this.rankBtn = { x: W / 2 - 60, y: 568, w: 120, h: 28 };
    this.stars = [];
    for (let i = 0; i < 70; i++) {
      this.stars.push({ x: Math.random() * W, y: Math.random() * 380, r: Math.random() < 0.2 ? 1.5 : 0.9, tw: Math.random() * 6.28, deep: i >= 40 });
    }
  }

  enter() {
    this.rank = loadRanking(this.engine.storage); this.tabs = createRankTabs(); this.name = getPlayerName(this.engine.storage);
    try { const ap = getActiveProfile(this.engine.storage); if (ap) this.name = ap.name; } catch (_) { /* ignore */ }
    this.cp = loadCheckpoint(this.engine.storage);
    this.top1 = loadTop1(this.engine.storage);      // 即表示（オフラインでも）
    this._refreshTop1();
    // 既に音声がアンロック済み（ゲームから戻った場合）ならすぐタイトル曲
    if (this.engine.audio && this.engine.audio.ctx) this._ensureMusic();
  }

  // WORLD #1 を取得してキャッシュ・表示を更新。失敗(null)ならキャッシュのまま
  _refreshTop1() {
    const tk = ++this._topTok;
    let pr = null;
    try { pr = Promise.resolve(WorldNet.fetchTop()); } catch (_) { return Promise.resolve(); }
    return pr.then((list) => {
      if (tk !== this._topTok || !Array.isArray(list)) return;
      this.top1 = top1FromList(this.engine.storage, list);
    }, () => {});
  }
  _isChampion() {
    const t = this.top1; if (!t || !t.name) return false;
    const ap = getActiveProfile(this.engine.storage);
    return !!ap && ap.name === t.name;
  }
  _openTitleEntry() {
    const ap = getActiveProfile(this.engine.storage);
    if (!ap || !this._isChampion()) return;
    musicOf(this.engine).sfx.uiTap();
    this.showRank = false;
    this._champ = openChampionEntry({ name: ap.name, key: ap.key, initial: (this.top1 && this.top1.title) || '', heading: 'WORLD #1', storage: this.engine.storage,
      onClose: (c) => { this._champ = null; this.top1 = loadTop1(this.engine.storage) || this.top1; if (!c || !c.ok) this._refreshTop1(); } });   // 保存成功時は再取得しない（中継の古いキャッシュで上書きされないように）
  }

  _ensureMusic() {
    if (this._musicOn || this.launch) return;
    this._musicOn = true;
    musicOf(this.engine).playTitle();
  }

  // 名前確定（同期のテストフック／従来動作）。プロフィールも作成・選択する。開始待ち(pendingStart)ならそのままゲーム開始
  _submitName(name) {
    this.name = setPlayerName(this.engine.storage, name); this.prof = null;
    try { addProfile(this.engine.storage, this.name); } catch (_) { /* ignore */ }
    if (this.pendingStart) { this.pendingStart = false; this._startOrChoose(); }
  }
  // 名前入力オーバーレイからの確定（新規パイロット）。-> null（受理）| エラー文字列 | Promise<エラー文字列|null>（WORLD の重複確認が必要な時のみ）
  _onNameEntered(v) {
    const nm = sanitizeName(v);
    if (!nm) return 'ENTER A NAME';
    const list = loadProfiles(this.engine.storage);
    const accept = () => {
      if (!addProfile(this.engine.storage, nm)) return 'MAX ' + PROFILE_MAX + ' PILOTS';
      this.name = nm; this.prof = null;
      if (this.pendingStart) { this.pendingStart = false; this._startOrChoose(); }
      return null;
    };
    if (list.some((p) => p.name === nm)) return accept();
    if (list.length >= PROFILE_MAX) return 'MAX ' + PROFILE_MAX + ' PILOTS';
    if (!relayEnabled()) return accept();
    return Promise.resolve().then(() => checkName(nm)).then(
      (r) => (r && r.ok && r.taken) ? 'NAME ALREADY REGISTERED \u2014 CHOOSE ANOTHER' : accept(),   // {ok:false}（オフライン）は検証できないので許可
      () => accept());
  }
  _openName(thenStart) {
    this.pendingStart = !!thenStart;
    showNameOverlay('', (v) => this._onNameEntered(v));
  }

  // ---- PILOTS パネル ----
  _profRects() {
    const list = loadProfiles(this.engine.storage);
    const act = getActiveProfile(this.engine.storage);
    const rows = list.map((p, i) => ({ name: p.name, active: !!act && act.name === p.name,
      sel: { x: 36, y: 164 + i * 56, w: 200, h: 44 }, del: { x: 248, y: 164 + i * 56, w: 56, h: 44 } }));
    return { rows, add: { x: 60, y: 340, w: W - 120, h: 44, off: list.length >= PROFILE_MAX }, close: { x: W / 2 - 50, y: 400, w: 100, h: 36 },
      yes: { x: 60, y: 300, w: W - 120, h: 44, label: 'CONFIRM DELETE' }, no: { x: 60, y: 356, w: W - 120, h: 44, label: 'CANCEL' } };
  }
  _profInput(action, data) {
    const pf = this.prof;
    if (action === 'back') { if (pf.mode === 'confirm') { pf.mode = 'list'; pf.msg = ''; } else this.prof = null; return; }
    if (action !== 'tap' || !data || pf.busy) return;
    const R = this._profRects();
    if (pf.mode === 'confirm') {
      if (this._hit(R.no, data)) { pf.mode = 'list'; pf.msg = ''; }
      else if (this._hit(R.yes, data)) this._deletePilot(pf.target);
      return;
    }
    if (this._hit(R.close, data)) { this.prof = null; return; }
    if (this._hit(R.add, data)) { if (!R.add.off) { this.prof = null; this._openName(false); } else pf.msg = 'MAX ' + PROFILE_MAX + ' PILOTS'; return; }
    for (const r of R.rows) {
      if (this._hit(r.del, data)) { pf.mode = 'confirm'; pf.target = r.name; pf.msg = ''; return; }
      if (this._hit(r.sel, data)) { setActiveProfile(this.engine.storage, r.name); this.name = r.name; return; }
    }
  }
  // サーバー側の名前と記録も削除。成功/「未登録」ならローカルから削除、通信失敗なら残す。ローカルのランキング行は消さない
  async _deletePilot(name) {
    const pf = this.prof; if (!pf) return;
    const prof = loadProfiles(this.engine.storage).find((p) => p.name === name);
    if (!prof) { pf.mode = 'list'; return; }
    let remove = true;
    if (relayEnabled()) {
      pf.busy = true; pf.msg = 'DELETING\u2026';
      let r = null; try { r = await deleteName(prof.name, prof.key); } catch (_) { r = null; }
      pf.busy = false;
      if (!(r && r.ok) && !(r && r.error === 'unknown')) {
        remove = false;
        pf.msg = (r && r.error === 'forbidden') ? 'NOT ALLOWED \u2014 KEY MISMATCH' : 'OFFLINE \u2014 TRY AGAIN';
      }
    }
    if (!remove) return;
    removeProfile(this.engine.storage, name);
    const ap = getActiveProfile(this.engine.storage);
    this.name = ap ? ap.name : '';
    pf.mode = 'list'; pf.msg = '';
  }

  // START 確定後: 発射シーケンス（または即ゲーム）
  _begin() {
    if (!this.useLaunch) { this.startGame(); return; }
    if (this.launch) return;
    this.launch = { e: 0, ign: false, done: false };
    this.showRank = false;
    const m = musicOf(this.engine);
    m.stopAll(2.5);               // タイトル曲をフェードアウト
    this._musicOn = false;
  }
  _finishLaunch() {
    if (!this.launch || this.launch.done) return;
    this.launch.done = true;
    this.startGame();
  }

  // CONTINUE MISSION: 保存したステージの開始から再開（発射シーケンスはそのまま流す）
  _continueMission() {
    musicOf(this.engine).sfx.uiTap();
    if (!this.name) { this._openName(false); return; }
    this.engine.resumeCheckpoint = this.cp;
    this.engine.startStage = null;
    this._begin();
  }
  // NEW MISSION: 最初から（到達済みの天体が複数あれば CHOOSE START）。チェックポイントは開始が確定した時に破棄（CANCEL では失わない）
  _newMission() {
    musicOf(this.engine).sfx.uiTap();
    if (!this.name) { clearCheckpoint(this.engine.storage); this.cp = null; this.engine.resumeCheckpoint = null; this._openName(true); return; }
    this._startOrChoose();
  }
  _startOptions() { return unlockedStarts(getMaxStage(this.engine.storage, this.name)); }
  _startOrChoose() {
    const list = this._startOptions();
    if (list.length > 1) { this.showRank = false; this.pick = { list, sel: 0, page: 0 }; return; }
    this._startAt(1);
  }
  _startAt(stage) {
    this.pick = null;
    clearCheckpoint(this.engine.storage); this.cp = null; this.engine.resumeCheckpoint = null;
    this.engine.startStage = stage > 1 ? stage : null;
    this._begin();
  }
  // ---- CHOOSE START ----
  _pickRects() {
    const pk = this.pick, PER = 6;
    const pages = Math.max(1, Math.ceil(pk.list.length / PER));
    const page = Math.max(0, Math.min(pages - 1, pk.page));
    const rows = [];
    for (let i = page * PER; i < Math.min(pk.list.length, (page + 1) * PER); i++) {
      const o = pk.list[i];
      rows.push({ i, o, rect: { x: 36, y: 124 + (i - page * PER) * 52, w: W - 72, h: 44 }, cursor: i === pk.sel, best: i === 0,
        label: o.label, stage: o.stage, g: o.realG.toFixed(2) });
    }
    return { rows, page, pages, prev: { x: 36, y: 446, w: 56, h: 32 }, next: { x: W - 92, y: 446, w: 56, h: 32 }, cancel: { x: W / 2 - 60, y: 510, w: 120, h: 36 } };
  }
  _pickInput(action, data) {
    const pk = this.pick, R = this._pickRects();
    if (action === 'back') { this.pick = null; return; }
    if (action === 'up' || action === 'down') {
      pk.sel = Math.max(0, Math.min(pk.list.length - 1, pk.sel + (action === 'down' ? 1 : -1)));
      pk.page = Math.floor(pk.sel / 6); return;
    }
    if (action === 'left' || action === 'right') { pk.page = Math.max(0, Math.min(R.pages - 1, R.page + (action === 'right' ? 1 : -1))); return; }
    if (action === 'confirm') { musicOf(this.engine).sfx.uiTap(); this._startAt(pk.list[pk.sel].stage); return; }
    if (action !== 'tap' || !data) return;
    if (this._hit(R.cancel, data)) { musicOf(this.engine).sfx.uiTap(); this.pick = null; return; }
    if (R.pages > 1 && this._hit(R.prev, data)) { pk.page = Math.max(0, R.page - 1); return; }
    if (R.pages > 1 && this._hit(R.next, data)) { pk.page = Math.min(R.pages - 1, R.page + 1); return; }
    for (const r of R.rows) if (this._hit(r.rect, data)) { musicOf(this.engine).sfx.uiTap(); this._startAt(r.o.stage); return; }
    // それ以外のタップは何もしない（裏の START/CONTINUE に貫通させない）
  }
  blocksBack() { return !!this.pick || championEntryOpen(this._champ); }

  _hit(b, d) { return d.x >= b.x && d.x <= b.x + b.w && d.y >= b.y && d.y <= b.y + b.h; }

  exit() { hideNameOverlay(); this._topTok++; if (this._champ) this._champ.close(); hideChampionEntry(); }

  onInput(action, data) {
    if (championEntryOpen(this._champ)) return;   // 称号入力中は全入力を消費（下で開始しない）
    if (nameOverlayOpen()) return;           // 名前入力中はキャンバスの入力を受けない（下で発射が始まらない）
    if (data && data.repeat) return;         // キーのオートリピートでは開始・スキップしない
    if (this.launch) {            // 発射中: タップ/決定でスキップ
      if (action === 'tap' || action === 'confirm') this._finishLaunch();
      return;
    }
    this._ensureMusic();          // 最初の入力でタイトル曲（iOSはジェスチャ必須）
    if (this.pick) { this._pickInput(action, data); return; }   // CHOOSE START 表示中は入力を独占
    if (this.prof) { this._profInput(action, data); return; }   // PILOTS パネル表示中はパネルが入力を独占
    if (action === 'tap' && data) {
      if (this._hit(this.muteBtn, data)) {
        const m = toggleMute(this.engine);
        if (!m) musicOf(this.engine).sfx.uiTap();
        return;
      }
      if (this._hit(this.rankBtn, data)) {
        musicOf(this.engine).sfx.uiTap();
        this.showRank = !this.showRank;
        if (this.showRank) this.tabs = createRankTabs();
        return;
      }
      // 開いている一覧の LOCAL / WORLD タブ（RELAY_URL 設定時のみ）
      if (this.showRank && rankTabsTap(this.tabs, 32, 130, data.x, data.y, W - 64)) return;
      // 一覧表示中は、それ以外のどこをタップしても「閉じる」だけ（裏の START/CONTINUE に貫通させない）
      if (this.showRank) { musicOf(this.engine).sfx.uiTap(); this.showRank = false; return; }
      if (this._hit(this.titleBtn, data) && this._isChampion() && !this.launch) { this._openTitleEntry(); return; }
      if (this._hit(this.logoBox, data) || this._hit(this.betaBox, data)) {
        // ロゴ5連打（2秒以内）でデバッグ有効化。ロゴタップではゲームを開始しない
        if (debugLogoTap(data.now)) this.toastT = 2;
        return;
      }
      if (this._hit(this.changeBtn, data)) { musicOf(this.engine).sfx.uiTap(); this.showRank = false; this.prof = { mode: 'list', target: '', msg: '', busy: false }; return; }
      if (this.cp) {   // チェックポイントあり: CONTINUE MISSION / NEW MISSION。それ以外のタップでは開始しない
        if (this._hit(this.continueBtn, data)) { this._continueMission(); return; }
        if (this._hit(this.newBtn, data)) { this._newMission(); return; }
        return;
      }
    }
    if (this.showRank && (action === 'confirm' || action === 'back')) { this.showRank = false; return; }   // キー操作でも一覧を閉じるだけ
    if (action === 'confirm' && this.cp) { this._continueMission(); return; }
    if (action === 'tap' || action === 'confirm') {
      musicOf(this.engine).sfx.uiTap();
      if (!this.name) { this._openName(true); return; }   // 名前未設定: 入力後に開始
      this._startOrChoose();
    }
  }

  update(dt) {
    if (!(dt > 0)) dt = 0.016;
    this.t += dt;
    if (this.toastT > 0) this.toastT = Math.max(0, this.toastT - dt);
    musicOf(this.engine).tick(dt);
    const L = this.launch;
    if (L) {
      L.e += dt;
      if (!L.ign && L.e >= LAUNCH.ignite) {
        L.ign = true;
        musicOf(this.engine).sfx.launch();
        for (let i = 0; i < 12; i++) spawnSmoke(this.parts, i % 2 ? 1 : -1, true);   // 点火の初期バースト
      }
      if (L.ign) {
        // 点火〜上昇初期は濃く、上昇しきったら絞る
        const rate = L.e < LAUNCH.lift + 0.9 ? 30 : 12;
        this._smokeAcc += rate * dt;
        while (this._smokeAcc >= 1) { this._smokeAcc -= 1; this._steamSide = -this._steamSide; spawnSmoke(this.parts, this._steamSide, false); }
      }
      if (L.e >= LAUNCH.total) this._finishLaunch();
    } else {
      // 待機中の蒸気（ベント）。射点の足元と側面から
      this._steamAcc += dt;
      if (this._steamAcc >= 0.45) {
        this._steamAcc = 0; this._steamSide = -this._steamSide;
        if (Math.random() < 0.5) spawnSteam(this.parts, SITE.rocketX + this._steamSide * 15, SITE.groundY - 46 - Math.random() * 60, this._steamSide, false);
        else spawnSteam(this.parts, SITE.rocketX + this._steamSide * 20, SITE.groundY - 3, this._steamSide, true);
      }
    }
    stepSmoke(this.parts, dt);
  }

  render(ctx) {
    const p = P();
    const L = this.launch, e = L ? L.e : 0;
    const rise = L ? launchRise(e) : 0;
    const camY = rise * LAUNCH.camK;
    const space = clamp01((rise - 60) / 320);
    const ui = L ? clamp01(1 - e / 0.35) : 1;
    const logoA = L ? clamp01(1 - (e - 0.15) / 0.9) : 1;
    const arm = L ? clamp01((e - LAUNCH.armStart) / (LAUNCH.armEnd - LAUNCH.armStart)) : 0;
    const flame = L && L.ign ? clamp01((e - LAUNCH.ignite) / 0.5) : 0;
    const shake = L && L.ign && e < LAUNCH.lift + 0.9 ? 1.1 * clamp01((e - LAUNCH.ignite) / 0.4) : 0;
    const shx = shake ? Math.sin(this.t * 71) * shake : 0, shy = shake ? Math.cos(this.t * 83) * shake * 0.7 : 0;
    const as = astronautCycle(this.t);
    const asA = L ? as.a * clamp01(1 - e / 0.2) : as.a;
    const glow = L ? as.glow * clamp01(1 - (e - 0.4) / 0.4) : as.glow;

    drawTitleSky(ctx, { t: this.t, stars: this.stars, space, camY });
    ctx.save();
    ctx.translate(shx, camY + shy);
    drawLaunchSite(ctx, { t: this.t });
    drawTower(ctx, { t: this.t, arm });
    drawRocket(ctx, SITE.rocketX, SITE.groundY - rise, { glow });
    if (asA > 0.01 && as.mode !== 'hidden') {
      ctx.save();
      ctx.globalAlpha = asA;
      ctx.translate(as.x, SITE.armY); ctx.scale(1.4, 1.4);
      drawAstronaut(ctx, 0, 0, as.mode, this.t * 0.5);
      ctx.restore();
    }
    if (flame > 0) drawGroundBlast(ctx, SITE.rocketX, SITE.groundY, flame * (rise < 200 ? 1 : 1 - clamp01((rise - 200) / 200)));
    drawSmoke(ctx, this.parts);
    if (flame > 0) drawLaunchFlame(ctx, SITE.rocketX, SITE.groundY - rise, flame, this.t, rise < 10 ? SITE.groundY + 4 + rise * 6 : null);   // 炎は煙の手前で明るく
    ctx.restore();

    if (L) {
      // 点火の閃光と最後の暗転（次の画面はこの暗転から立ち上がる）
      const fa = clamp01(1 - (e - LAUNCH.ignite) / 0.3);
      if (L.ign && fa > 0) { ctx.save(); ctx.globalAlpha = 0.09 * fa; ctx.fillStyle = '#ffe2b8'; ctx.fillRect(0, 0, W, H); ctx.restore(); }
      const v = clamp01((e - LAUNCH.fadeStart) / (LAUNCH.total - LAUNCH.fadeStart));
      if (v > 0) veil(ctx, v * v * (3 - 2 * v));
      // 控えめなカウントダウン 3-2-1（点火直前）
      if (e < LAUNCH.ignite) {
        const n = 3 - Math.min(2, Math.floor(e / (LAUNCH.ignite / 3)));
        txt(ctx, String(n), W / 2, 478, 28, p.fg, 'center', { w: 200, a: 0.8 });
      }
    }

    // ---- UI ----
    if (logoA > 0) {
      txt(ctx, 'LANDER', W / 2, 60, 34, p.hi, 'center', { sp: 16, w: 300, a: logoA });
      txt(ctx, 'SOFT LANDING TOUR', W / 2, 98, 8, p.dim, 'center', { sp: 5, w: 400, a: logoA });
      drawBetaTag(ctx, this.betaBox, logoA);
    }
    if (ui > 0 && this.top1) {
      const champ = this._isChampion();
      drawWorldBanner(ctx, this.worldBox, this.top1, ui * 0.9, champ ? 2 * (this.titleBtn.x - 8 - (this.worldBox.x + this.worldBox.w / 2)) : this.worldBox.w);   // 中央揃えのまま SET TITLE に食い込まない幅
      if (champ) {
        const tb = this.titleBtn;
        pill(ctx, tb.x, tb.y + 2, tb.w, 18, rgba(p.warn, 0.06 * ui), rgba(p.warn, 0.4 * ui));
        txt(ctx, 'SET TITLE', tb.x + tb.w / 2, tb.y + 7, 7, p.warn, 'center', { sp: 2, w: 500, a: ui });
      }
    }
    if (ui > 0) {
      const sp = drawSpeaker;
      sp(ctx, this.muteBtn.x + this.muteBtn.w / 2, this.muteBtn.y + this.muteBtn.h / 2, 1, rgba(p.fg, 0.7 * ui), isMuted(this.engine));
      if (this.name) txt(ctx, 'PILOT  ' + this.name, W / 2, 416, 12, p.fg, 'center', { sp: 3, w: 500, a: ui });
      else txt(ctx, 'ENTER NAME ON START', W / 2, 420, 8, p.dim, 'center', { sp: 4, w: 400, a: ui });
      const cb = this.changeBtn;
      pill(ctx, cb.x, cb.y, cb.w, cb.h, rgba(p.fg, 0.04 * ui), rgba(p.fg, 0.22 * ui));
      txt(ctx, 'PILOTS', W / 2, cb.y + 6, 8, p.mid, 'center', { sp: 3, w: 500, a: ui });
      const breath = 0.5 + 0.5 * Math.sin(this.t * 2);
      if (this.cp) {
        const c = this.continueBtn, nb = this.newBtn;
        pill(ctx, c.x, c.y, c.w, c.h, rgba(p.mid, 0.07 + 0.04 * breath), rgba(p.mid, (0.5 + 0.25 * breath) * ui), 1.2);
        txt(ctx, 'CONTINUE MISSION', W / 2, c.y + 10, 12, p.hi, 'center', { sp: 5, w: 500, a: ui });
        const bn = (stageBodyName(this.cp.stage) || '').toUpperCase();
        txt(ctx, 'ST.' + this.cp.stage + (bn ? '  \u00b7  ' + bn : '') + '  \u00b7  ' + this.cp.totalScore, W / 2, c.y + 30, 8, p.dim, 'center', { sp: 2, w: 500, a: ui });
        pill(ctx, nb.x, nb.y, nb.w, nb.h, null, rgba(p.fg, 0.22 * ui));
        txt(ctx, 'NEW MISSION', W / 2, nb.y + 11, 9, p.fg, 'center', { sp: 4, w: 500, a: ui });
      } else {
        const sb = this.startBtn;
        pill(ctx, sb.x, sb.y, sb.w, sb.h, rgba(p.mid, 0.07 + 0.04 * breath), rgba(p.mid, (0.5 + 0.25 * breath) * ui), 1.2);
        txt(ctx, 'START', W / 2, sb.y + 15, 14, p.hi, 'center', { sp: 9, w: 500, a: ui });
        if (this.rank.length) txt(ctx, 'BEST  ' + this.rank[0].score, W / 2, 530, 9, p.dim, 'center', { sp: 3, w: 400, a: ui });
      }
      const b = this.rankBtn;
      pill(ctx, b.x, b.y, b.w, b.h, rgba(p.fg, 0.03 * ui), rgba(p.fg, 0.2 * ui));
      txt(ctx, 'RANKING', W / 2, b.y + 9, 9, p.mid, 'center', { sp: 4, w: 500, a: ui });
    }
    if (isDebug()) txt(ctx, 'DEBUG', 12, 16, 9, p.warn, 'left', { sp: 3, w: 500 });
    if (this.toastT > 0) {
      ctx.save(); ctx.globalAlpha = Math.min(1, this.toastT);
      this.engine.rect(W / 2 - 50, 140, 100, 24, p.dark); this.engine.stroke(W / 2 - 50, 140, 100, 24, p.warn, 1.5);
      this.engine.text('DEBUG ON', W / 2, 145, 13, p.warn, 'center');
      ctx.restore();
    }

    // 全件一覧
    if (this.showRank) {
      ctx.save();
      ctx.globalAlpha = 0.95;
      this.engine.rect(20, 90, W - 40, 440, p.dark);
      ctx.restore();
      this.engine.stroke(20, 90, W - 40, 440, p.mid, 2);
      this.engine.text('TOP 10', W / 2, 104, 20, p.hi, 'center');
      drawRankPanel(this.engine, ctx, this.tabs, this.rank, 32, 130, W - 64, -1);
      ctx.save(); ctx.globalAlpha = 0.55 + 0.25 * Math.sin(this.t * 2.4);
      this.engine.text('TAP TO CLOSE', W / 2, 508, 9, p.dim, 'center');
      ctx.restore();
    }
    if (this.pick) {
      const R = this._pickRects();
      drawStartPanel(ctx, { rows: R.rows, page: R.page, pages: R.pages, prev: R.prev, next: R.next, cancel: R.cancel });
    }
    if (this.prof) {
      const R = this._profRects(), pf = this.prof;
      drawProfilePanel(ctx, { mode: pf.mode, rows: R.rows, add: R.add, close: R.close, msg: pf.msg,
        confirm: pf.mode === 'confirm' ? { l1: 'DELETE ' + String(pf.target).toUpperCase() + '?', l2: 'THIS ALSO REMOVES ITS WORLD RECORD', yes: R.yes, no: R.no } : null });
    }
    if (championEntryOpen(this._champ)) veil(ctx, 0.55);
  }
}
