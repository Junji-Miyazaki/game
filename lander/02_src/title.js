// タイトル画面（P0の仮実装。P2でリデザインする）。タップで開始。
// 上位3件を表示し、RANKING ターゲットで上位10件の一覧を開閉する。
import { Scene, W, H } from './core/engine.js';
import { P } from './core/palette.js';
import { loadRanking, createRankTabs, rankTabsTap, drawRankPanel, getPlayerName, setPlayerName, sanitizeName, loadCheckpoint, clearCheckpoint, loadProfiles, getActiveProfile, setActiveProfile, addProfile, removeProfile, PROFILE_MAX } from './ranking.js';
import { relayEnabled, checkName, deleteName } from './net.js';
import { isDebug, debugLogoTap } from './debug.js';
import { Music } from './music.js';
import { txt, pill, rgba, veil, SITE, astronautCycle, drawTitleSky, drawLaunchSite, drawTower, drawRocket, drawLaunchFlame, drawGroundBlast, drawSmoke, drawSpeaker, drawAstronaut, drawProfilePanel, drawBetaTag } from './art.js';

import { stageInfo } from './bodies.js';
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
    this.cp = null;
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
    // 既に音声がアンロック済み（ゲームから戻った場合）ならすぐタイトル曲
    if (this.engine.audio && this.engine.audio.ctx) this._ensureMusic();
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
    if (this.pendingStart) { this.pendingStart = false; this._begin(); }
  }
  // 名前入力オーバーレイからの確定（新規パイロット）。-> null（受理）| エラー文字列 | Promise<エラー文字列|null>（WORLD の重複確認が必要な時のみ）
  _onNameEntered(v) {
    const nm = sanitizeName(v);
    if (!nm) return 'ENTER A NAME';
    const list = loadProfiles(this.engine.storage);
    const accept = () => {
      if (!addProfile(this.engine.storage, nm)) return 'MAX ' + PROFILE_MAX + ' PILOTS';
      this.name = nm; this.prof = null;
      if (this.pendingStart) { this.pendingStart = false; this._begin(); }
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
    this._begin();
  }
  // NEW MISSION: チェックポイントを破棄して最初から
  _newMission() {
    musicOf(this.engine).sfx.uiTap();
    clearCheckpoint(this.engine.storage); this.cp = null; this.engine.resumeCheckpoint = null;
    if (!this.name) { this._openName(true); return; }
    this._begin();
  }

  _hit(b, d) { return d.x >= b.x && d.x <= b.x + b.w && d.y >= b.y && d.y <= b.y + b.h; }

  exit() { hideNameOverlay(); }

  onInput(action, data) {
    if (nameOverlayOpen()) return;           // 名前入力中はキャンバスの入力を受けない（下で発射が始まらない）
    if (data && data.repeat) return;         // キーのオートリピートでは開始・スキップしない
    if (this.launch) {            // 発射中: タップ/決定でスキップ
      if (action === 'tap' || action === 'confirm') this._finishLaunch();
      return;
    }
    this._ensureMusic();          // 最初の入力でタイトル曲（iOSはジェスチャ必須）
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
    if (action === 'confirm' && this.cp) { this._continueMission(); return; }
    if (action === 'tap' || action === 'confirm') {
      musicOf(this.engine).sfx.uiTap();
      if (!this.name) { this._openName(true); return; }   // 名前未設定: 入力後に開始
      this._begin();
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
    }
    if (this.prof) {
      const R = this._profRects(), pf = this.prof;
      drawProfilePanel(ctx, { mode: pf.mode, rows: R.rows, add: R.add, close: R.close, msg: pf.msg,
        confirm: pf.mode === 'confirm' ? { l1: 'DELETE ' + String(pf.target).toUpperCase() + '?', l2: 'THIS ALSO REMOVES ITS WORLD RECORD', yes: R.yes, no: R.no } : null });
    }
  }
}
