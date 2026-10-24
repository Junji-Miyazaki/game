// P2b テスト: アニメーションタイトル / 発射シーケンス / 音楽・SFXフック / ミュート。実行: node 04_tests/p2b.mjs
import { TitleScene, LAUNCH, SMOKE_MAX, STEAM_MAX, spawnSmoke, spawnSteam, stepSmoke, launchRise, fadeInScene, toggleMute, restoreMute, applyMute, isMuted } from '../02_src/title.js';
import { Game } from '../02_src/game.js';
import { SITE, astronautCycle } from '../02_src/art.js';
import { STAGES_PER_BODY } from '../02_src/bodies.js';
import { MODULE_DEFS } from '../02_src/modules.js';
import { setDebug } from '../02_src/debug.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;

// save/restore の深さと NaN を数えるスタブctx
function makeCtx() {
  const st = { depth: 0, minDepth: 0, nan: 0, veils: [] };
  const state = { globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const NUMFN = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'fillRect', 'strokeRect', 'translate', 'scale', 'rotate', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'rect', 'fillText']);
  const ctx = new Proxy(state, {
    get: (t, k) => {
      if (k === 'save') return () => { st.depth++; };
      if (k === 'restore') return () => { st.depth--; if (st.depth < st.minDepth) st.minDepth = st.depth; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { for (const v of a) if (!Number.isFinite(v)) st.nan++; return { addColorStop: noop }; };
      if (k === 'fillRect') return (x, y, w, h) => { for (const v of [x, y, w, h]) if (!Number.isFinite(v)) st.nan++; if (w >= 360 && h >= 640) st.veils.push(state.fillStyle); };
      if (NUMFN.has(k)) return (...a) => { for (const v of a) if (typeof v === 'number' && !Number.isFinite(v)) st.nan++; };
      if (k in t) return t[k];
      return noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, st };
}

// ---- スタブ Music: 呼び出しを記録する ----
function makeMusic() {
  const log = [];
  const rec = (n) => (...a) => { log.push(n + (a.length ? ':' + a.join(',') : '')); };
  return {
    log, count: (n) => log.filter((x) => x === n || x.startsWith(n + ':')).length,
    attach: noop, setMuted: rec('setMuted'), isMuted: () => false,
    playTitle: rec('playTitle'), playBody: rec('playBody'), stopAll: rec('stopAll'), stopJingle: rec('stopJingle'),
    playJingle: (o) => { log.push('playJingle:' + (o && o.tier) + ',' + !!(o && o.perfect)); }, tick: () => { log.push('tick'); },
    sfx: { landing: rec('landing'), crash: rec('crash'), module: rec('module'), launch: rec('launch'), uiTap: rec('uiTap') },
  };
}
function makeEngine(ctx, music, store) {
  store = store || new Map([['hudTipSeen', '1']]);
  return {
    ctx, music,
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock() { this.ctx = this.ctx || {}; } },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], _store: store,
  };
}
const inRect = (r, x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const tap = (s, x, y) => s.onInput('tap', { x, y, now: 0 });
const run = (s, sec) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) s.update(DT); };
const smokeCount = (s) => s.parts.filter((p) => p.kind === 0).length;
const steamCount = (s) => s.parts.filter((p) => p.kind === 1).length;

setDebug(false);

// ---------- 1. タイトル/発射の状態機械 ----------
{
  const { ctx } = makeCtx(); const m = makeMusic(); const e = makeEngine(ctx, m);
  e.storage.set('player.name', 'x');
  let started = 0;
  // 既定（opts なし）= 従来どおり即開始
  { const t0 = new TitleScene(makeEngine(ctx, makeMusic()), () => started++); t0.name = 'KAI'; tap(t0, 10, 10); ok(started === 1, 'no opts: START begins the game immediately (legacy)'); started = 0; }

  const t = new TitleScene(e, () => started++, { launch: true }); t.enter();
  t.name = 'KAI';
  tap(t, 10, 10);
  ok(t.launch && started === 0, 'START -> launch begins, game not started yet');
  run(t, 1.0); ok(started === 0, 'game not started at 1.0s');
  run(t, 1.5); ok(started === 0, 'game not started at 2.5s');
  run(t, 0.7); ok(started === 0, 'game not started at ~3.2s (total ' + LAUNCH.total + 's)');
  run(t, 0.5); ok(started === 1, 'game started once after ~3.5s');
  run(t, 2); ok(started === 1, 'game start fired only once');
  ok(LAUNCH.total >= 3 && LAUNCH.total <= 4, 'launch length about 3 s');

  // タップでスキップ
  started = 0;
  const t2 = new TitleScene(makeEngine(ctx, makeMusic()), () => started++, { launch: true }); t2.enter(); t2.name = 'KAI';
  tap(t2, 10, 10); run(t2, 0.6); ok(started === 0, 'mid-launch: still not started');
  tap(t2, 100, 300); ok(started === 1, 'tap during launch skips to the game');
  tap(t2, 100, 300); run(t2, 5); ok(started === 1, 'skip fires once');
  const t2b = new TitleScene(makeEngine(ctx, makeMusic()), () => started++, { launch: true }); t2b.enter(); t2b.name = 'KAI'; started = 0;
  tap(t2b, 10, 10); t2b.onInput('confirm'); ok(started === 1, 'confirm key during launch also skips');

  // 名前が先: 未設定 → 名前入力 → 確定 → 発射 → ゲーム
  started = 0;
  const t3 = new TitleScene(makeEngine(ctx, makeMusic()), () => started++, { launch: true }); t3.enter();
  tap(t3, 10, 10);
  ok(!t3.launch && t3.pendingStart && started === 0, 'no name: name entry comes first, no launch yet');
  run(t3, 3); ok(!t3.launch && started === 0, 'launch does not start while waiting for name');
  t3._submitName('Neo');
  ok(t3.launch && started === 0 && t3.name === 'Neo', 'name submitted -> launch starts (game not yet)');
  run(t3, 3.6); ok(started === 1, 'then the game starts');
  // CHANGE は発射しない
  const t4 = new TitleScene(makeEngine(ctx, makeMusic()), () => started++, { launch: true }); t4.enter(); t4.name = 'KAI'; started = 0;
  const cb = t4.changeBtn; tap(t4, cb.x + 3, cb.y + 3); ok(!t4.launch && started === 0 && !t4.pendingStart, 'CHANGE opens name without launching');
  // デバッグ5連打は発射しない
  const lb = t4.logoBox; for (let i = 0; i < 5; i++) t4.onInput('tap', { x: lb.x + 5, y: lb.y + 5, now: 100 * i });
  ok(!t4.launch && started === 0, 'logo taps do not launch'); setDebug(false);
  // 発射中の描画は例外なし・balanced
  const cr = makeCtx(); const t5 = new TitleScene(makeEngine(cr.ctx, makeMusic()), noop, { launch: true }); t5.enter(); t5.name = 'KAI'; tap(t5, 10, 10);
  let thrown = null;
  try { for (let i = 0; i < 230; i++) { t5.update(DT); t5.render(cr.ctx); } } catch (err) { thrown = err; }
  ok(!thrown, 'launch update/render does not throw: ' + (thrown && thrown.stack));
  ok(cr.st.depth === 0 && cr.st.minDepth >= 0, 'launch render save/restore balanced (' + cr.st.depth + ')');
  ok(cr.st.nan === 0, 'launch render passes no NaN/Infinity (' + cr.st.nan + ')');
  ok(cr.st.veils.length > 0, 'launch ends with a full-screen veil (dark dip into the game)');
}

// ---------- 2. 粒子上限 ----------
{
  const { ctx } = makeCtx(); const e = makeEngine(ctx, makeMusic());
  const t = new TitleScene(e, noop, { launch: true }); t.enter(); t.name = 'KAI';
  let maxSmoke = 0, maxSteam = 0, maxAll = 0;
  run(t, 20); maxSteam = Math.max(maxSteam, steamCount(t));
  ok(steamCount(t) > 0, 'idle steam wisps are emitted');
  tap(t, 10, 10);
  for (let i = 0; i < 260; i++) { t.update(DT); maxSmoke = Math.max(maxSmoke, smokeCount(t)); maxSteam = Math.max(maxSteam, steamCount(t)); maxAll = Math.max(maxAll, t.parts.length); }
  ok(maxSmoke > 20, 'launch emits a thick cloud (peak puffs ' + maxSmoke + ')');
  ok(maxSmoke <= SMOKE_MAX && maxSteam <= STEAM_MAX, 'particle caps hold (smoke ' + maxSmoke + '/' + SMOKE_MAX + ', steam ' + maxSteam + '/' + STEAM_MAX + ')');
  ok(maxAll <= SMOKE_MAX + STEAM_MAX, 'total particles <= ' + (SMOKE_MAX + STEAM_MAX));
  const arr = []; for (let i = 0; i < 5000; i++) { spawnSmoke(arr, i % 2 ? 1 : -1, i % 3 === 0); spawnSteam(arr, 200, 300, 1, i % 2 === 0); }
  ok(arr.filter((p) => p.kind === 0).length === SMOKE_MAX && arr.filter((p) => p.kind === 1).length === STEAM_MAX, 'spawn helpers enforce the caps under spam');
  // 寿命で消える・拡大して減速する
  const q = []; spawnSmoke(q, 1, false); const r0 = q[0].r, v0 = Math.abs(q[0].vx);
  for (let i = 0; i < 60; i++) stepSmoke(q, DT);
  ok(q.length === 1 && q[0].r > r0 * 1.5 && Math.abs(q[0].vx) < v0 * 0.5, 'puff expands and slows down');
  for (let i = 0; i < 400; i++) stepSmoke(q, DT);
  ok(q.length === 0, 'puffs die after their lifetime');
  ok(launchRise(0) === 0 && launchRise(LAUNCH.lift) === 0 && launchRise(LAUNCH.lift + 1) < launchRise(LAUNCH.lift + 2) / 3, 'liftoff: slow start then accelerating climb');
}

// ---------- 3. タップ対象の非重複 ----------
{
  const { ctx } = makeCtx(); const t = new TitleScene(makeEngine(ctx, makeMusic()), noop);
  const rects = { mute: t.muteBtn, logo: t.logoBox, change: t.changeBtn, start: t.startBtn, rank: t.rankBtn };
  const names = Object.keys(rects);
  let bad = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlap(rects[names[i]], rects[names[j]])) bad.push(names[i] + '/' + names[j]);
  ok(bad.length === 0, 'title tap targets do not overlap: ' + bad.join(','));
  ok(names.every((n) => rects[n].x >= 0 && rects[n].y >= 0 && rects[n].x + rects[n].w <= 360 && rects[n].y + rects[n].h <= 640), 'all targets inside the screen');
  // ロケット(脚・フィン込みの外形) とUIが重ならない
  const rocket = { x: SITE.rocketX - 24, y: SITE.groundY - SITE.rocketH, w: 48, h: SITE.rocketH };
  const tower = { x: SITE.towerX - 12, y: SITE.towerTop - 28, w: SITE.rocketX - SITE.hw - SITE.towerX + 12, h: SITE.groundY - SITE.towerTop + 28 };
  ok(names.every((n) => !overlap(rects[n], rocket) && !overlap(rects[n], tower)), 'no UI target overlaps the rocket/tower');
  // 最小タップ面積
  ok(t.muteBtn.w >= 40 && t.muteBtn.h >= 40 && t.startBtn.h >= 40, 'mute/start targets >= 40pt');
  // 各ターゲットの中心タップが意図した動作だけを起こす
  const e = makeEngine(ctx, makeMusic()); let started = 0; const tt = new TitleScene(e, () => started++); tt.enter(); tt.name = 'KAI';
  tap(tt, t.rankBtn.x + 5, t.rankBtn.y + 5); ok(tt.showRank && started === 0, 'RANKING tap toggles list only');
  tap(tt, t.rankBtn.x + 5, t.rankBtn.y + 5);
  tap(tt, t.muteBtn.x + 5, t.muteBtn.y + 5); ok(started === 0 && isMuted(e), 'mute tap toggles mute only');
  tap(tt, t.startBtn.x + 5, t.startBtn.y + 5); ok(started === 1, 'START button starts');
}

// ---------- 4. 音楽フック（タイトル） ----------
{
  const { ctx } = makeCtx(); const m = makeMusic(); const e = makeEngine(ctx, m);
  const t = new TitleScene(e, noop, { launch: true }); t.enter(); t.name = 'KAI';
  ok(m.count('playTitle') === 0, 'no title music before the first input (audio locked)');
  t.update(DT); ok(m.count('tick') === 1, 'title update ticks the music');
  e.audio.unlock(); t.onInput('left'); ok(m.count('playTitle') === 1, 'first input starts the title music');
  tap(t, 5, 5); ok(m.count('stopAll') === 1 && m.count('playTitle') === 1, 'START fades the title music out (stopAll) and does not restart it');
  run(t, LAUNCH.ignite - 0.1); ok(m.count('launch') === 0, 'no launch sfx before ignition');
  run(t, 0.2); ok(m.count('launch') === 1, 'sfx.launch fires at ignition');
  run(t, 1); ok(m.count('launch') === 1, 'sfx.launch fires once');
  // ゲームから戻ったタイトル（音声は既にアンロック済み）はすぐタイトル曲
  const m2 = makeMusic(); const e2 = makeEngine(ctx, m2); e2.audio.unlock();
  const t2 = new TitleScene(e2, noop, { launch: true }); t2.enter(); ok(m2.count('playTitle') === 1, 'returning to title (audio unlocked) plays the title music');
  const t3 = new TitleScene(e2, noop, { launch: true }); t3.enter(); t3.update(DT);
  // 実物の Music (attach 前) に対しても例外なし
  const eReal = makeEngine(ctx, null); eReal.music = undefined;
  let thrown = null; try { const tr = new TitleScene(eReal, noop, { launch: true }); tr.enter(); tr.name = 'A'; tr.onInput('tap', { x: 5, y: 5 }); run(tr, 4); tr.render(ctx); } catch (err) { thrown = err; }
  ok(!thrown, 'works with the real (unattached) Music module: ' + (thrown && thrown.message));
}

// ---------- 5. 音楽フック（ゲーム） ----------
{
  const { ctx } = makeCtx(); const m = makeMusic(); const e = makeEngine(ctx, m);
  const g = new Game(e); g.enter();
  ok(m.log.includes('playBody:moon'), 'stage 1 starts the Moon music');
  ok(m.count('playBody') === 1, 'one playBody at start');
  g.update(DT); ok(m.count('tick') === 1, 'game update ticks the music');
  g.state = 'play'; g._initStage(); ok(m.count('playBody') === 1, 're-initialising the same stage/body does not restart the music');
  g.stage = 2; g._initStage(); ok(m.count('playBody') === 1, 'next stage on the same body keeps the music');
  g.stage = STAGES_PER_BODY + 1; g._initStage(); ok(m.log.includes('playBody:europa') && m.count('playBody') === 2, 'body change switches the music to Europa');
  g.stage = 3 * STAGES_PER_BODY + 1; g._initStage(); ok(m.log.includes('playBody:mars'), 'later body switches again');
  // sfx
  g.state = 'play'; g._doSuccess(0, 0); ok(m.count('landing') === 0 && m.count('playJingle') === 1, 'touchdown plays the jingle instead of the landing chime');
  { let bad = 0; g.engine.audio.bad = () => { bad++; }; g.state = 'play'; g._initStage(); g._doCrash('X');
    ok(bad === 1 && m.count('crash') === 0, 'crash plays the original low 8-bit beep (user preference), not the generated crash sfx'); }
  g.state = 'module'; g.offers = [MODULE_DEFS[0].id]; g._inputLock = 0; g._pickModule(0); ok(m.count('module') === 1, 'module sfx when a module is taken');
  // 光 uiTap: crashed の CONTINUE
  g.state = 'play'; g._initStage(); g.continues = 2; g._doCrash('X'); g._inputLock = 0; const u0 = m.count('uiTap'); g.onInput('tap', { x: 180, y: 300 }); ok(m.count('uiTap') === u0 + 1, 'light uiTap on the CONTINUE overlay button');
  // 戻る
  const s0 = m.count('stopAll'); g.exit(); ok(m.count('stopAll') === s0 + 1, 'leaving the game stops/fades the music (stopAll)');
  // 新ラン（Game 新規）でまた曲が始まる
  const g2 = new Game(e); g2.enter(); ok(m.log.filter((x) => x === 'playBody:moon').length === 2, 'a new run starts the Moon music again');
  // 実物 Music（未attach）でも例外なし
  const eReal = makeEngine(ctx, null); eReal.music = undefined; let thrown = null;
  try { const gr = new Game(eReal); gr.enter(); for (let i = 0; i < 120; i++) { gr.update(DT); gr.render(ctx); } gr._doSuccess(0, 0); gr.exit(); } catch (err) { thrown = err; }
  ok(!thrown, 'game works with the real unattached Music: ' + (thrown && thrown.message));
}

// ---------- 5b. BGM停止/ジングル/再開のフック順序 ----------
{
  const { ctx } = makeCtx(); const m = makeMusic(); const e = makeEngine(ctx, m);
  const g = new Game(e); g.enter();
  const mark = () => m.log.length;
  const since = (i) => m.log.slice(i).filter((x) => x !== 'tick');
  // 成功 -> stopAll(0.3) の後に playJingle（tier=celebTier、perfect 反映）
  let i0 = mark(); g.state = 'play'; g._doSuccess(0, 0);
  let seq = since(i0);
  ok(seq[0] === 'stopAll:0.3' && seq[1].startsWith('playJingle:0,'), 'success: stopAll(0.3) then playJingle tier 0 on the Moon: ' + seq.join('|'));
  ok(seq[1] === 'playJingle:0,' + !!g._perfect, 'perfect flag passed through');
  g._perfect = true; // perfect 伝播の別確認（_doSuccess は内部で再計算するため、静止値で成功させる）
  // 次ステージ（同一天体）-> stopJingle + playBody が再度呼ばれる
  i0 = mark(); g._nextAfterClear(); seq = since(i0);
  ok(seq.includes('stopJingle:0.3') && seq.includes('playBody:moon'), 'next stage after success: stopJingle + playBody (same body restarts): ' + seq.join('|'));
  ok(seq.indexOf('stopJingle:0.3') < seq.indexOf('playBody:moon'), 'stopJingle before playBody');
  // 通常の連続 _initStage（停止なし）では再起動しない
  i0 = mark(); g.state = 'play'; g._initStage(); ok(since(i0).length === 0, 'no BGM stop in between => no restart');
  // クラッシュ -> stopAll(0.4)、ジングルなし。CONTINUE -> stopJingle + playBody
  g.continues = 2; i0 = mark(); g._doCrash('X'); seq = since(i0);
  ok(seq.join('|') === 'stopAll:0.4', 'crash: stopAll(0.4) only: ' + seq.join('|'));
  i0 = mark(); g._continue(); seq = since(i0);
  ok(seq.includes('stopJingle:0.3') && seq.includes('playBody:moon'), 'CONTINUE after crash: stopJingle + playBody: ' + seq.join('|'));
  // ボーナス開始 / モジュール選択後の次ステージ
  g.state = "play"; g.stage = 3; g._doSuccess(0, 0); i0 = mark(); g._nextAfterClear(); seq = since(i0);
  ok(g.bonus && seq.includes('stopJingle:0.3') && seq.some((x) => x.startsWith('playBody:')), 'bonus mission start: stopJingle + playBody: ' + seq.join('|'));
  g.state = 'play'; g._doSuccess(0, 0); g.offers = [MODULE_DEFS[0].id]; g.state = 'module'; g._inputLock = 0; i0 = mark(); g._pickModule(0); seq = since(i0);
  ok(seq.includes('stopJingle:0.3') && seq.some((x) => x.startsWith('playBody:')), 'module chosen then next stage: stopJingle + playBody: ' + seq.join('|'));
  // 上位天体・周回で tier が上がる（IO celebTier1 -> 1、loop>0 で +1、上限2）
  g.bonus = null; g.stage = 3 * STAGES_PER_BODY + 1; g.state = 'play'; g._initStage(); i0 = mark(); g._doSuccess(0, 0);
  ok(since(i0).some((x) => /^playJingle:[12],/.test(x)), 'higher body gets tier >= 1');
  g.stage = 5 * STAGES_PER_BODY + 1; g.state = 'play'; g._initStage(); i0 = mark(); g._doSuccess(0, 0);
  ok(since(i0).some((x) => x.startsWith('playJingle:2,')), 'Titan/Venus tier 2 (capped)');
  // タイトルへ戻る -> stopJingle + stopAll
  i0 = mark(); g.exit(); seq = since(i0);
  ok(seq.includes('stopJingle:0.3') && seq.some((x) => x.startsWith('stopAll')), 'exit: stopJingle + stopAll: ' + seq.join('|'));
}

// ---------- 6. ミュート ----------
{
  const { ctx } = makeCtx(); const m = makeMusic(); const e = makeEngine(ctx, m);
  ok(!isMuted(e) && e.audio.enabled === true, 'unmuted by default');
  const r = toggleMute(e);
  ok(r === true && isMuted(e) && e.audio.enabled === false && e._store.get('muted') === '1' && m.log.includes('setMuted:true'), 'toggle -> muted: Music muted, beeps disabled, persisted "1"');
  toggleMute(e); ok(!isMuted(e) && e.audio.enabled === true && e._store.get('muted') === '0' && m.log.includes('setMuted:false'), 'toggle again -> unmuted, persisted "0"');
  // 再起動で復元
  const store = new Map([['muted', '1']]); const m2 = makeMusic(); const e2 = makeEngine(ctx, m2, store);
  restoreMute(e2); ok(e2.audio.enabled === false && m2.log.includes('setMuted:true'), 'restoreMute applies the saved mute at startup');
  const store3 = new Map(); const e3 = makeEngine(ctx, makeMusic(), store3); restoreMute(e3); ok(e3.audio.enabled === true && !store3.has('muted'), 'restore without saved value leaves sound on and writes nothing');
  applyMute(e3, true, false); ok(!store3.has('muted'), 'applyMute(persist=false) does not write');
  // タイトルのボタン
  const e4 = makeEngine(ctx, makeMusic()); const t = new TitleScene(e4, noop); t.enter(); const mb = t.muteBtn;
  tap(t, mb.x + 4, mb.y + 4); ok(isMuted(e4) && e4.audio.enabled === false, 'title mute button mutes (beeps off)');
  tap(t, mb.x + 4, mb.y + 4); ok(!isMuted(e4) && e4.audio.enabled === true, 'title mute button unmutes');
  // ゲームのボタン + 配置
  const e5 = makeEngine(ctx, makeMusic()); const g = new Game(e5); g.enter(); const gr = g._muteRect();
  g.onInput('tap', { x: gr.x + 4, y: gr.y + 4 }); ok(isMuted(e5) && e5.audio.enabled === false && e5._store.get('muted') === '1', 'in-game mute button mutes and persists');
  g.onInput('tap', { x: gr.x + 4, y: gr.y + 4 }); ok(!isMuted(e5) && e5.audio.enabled === true, 'in-game mute button unmutes');
  const back = e5.backBtn || { x: 6, y: 8, w: 42, h: 36 };
  const dbg = g._dbgBtnRect();
  ok(!overlap(gr, back) && !overlap(gr, dbg), 'game mute button overlaps neither BACK nor DBG');
  ok(gr.y + gr.h <= 52 && gr.x >= 52, 'game mute button sits in the ignored top strip (y<=52, right of BACK): no thrust conflict');
  // HUD 数字(スコア右寄せ=x>=256 / DEBUG タグ x=178..) とも重ならない
  ok(gr.x + gr.w <= 178 && gr.x >= 120, 'mute button clear of the DEBUG tag (x>=178) and the score (x>=256)');
  // ミュートボタンのタップで推力が入らない
  g.state = 'play'; g._initStage(); e5.touches = [{ x: gr.x + 4, y: gr.y + 4 }]; g.update(DT); ok(!g._thrustMain && !g._thrustRcsL && !g._thrustRcsR, 'holding the mute button does not thrust');
  // ミュート中も SFX 呼び出しは例外なし（実音の抑止は music.js master gain / audio.enabled）
  let thrown = null; try { g._doSuccess(0, 0); g._initStage(); g._doCrash('x'); } catch (err) { thrown = err; } ok(!thrown, 'sfx while muted does not throw');
}

// ---------- 7. フェードイン / 飛行士 ----------
{
  const { ctx, st } = makeCtx();
  const sc = { n: 0, update() { this.n++; }, render() {} };
  fadeInScene(sc, 0.8);
  sc.render(ctx); const first = st.veils.length; ok(first === 1, 'fade-in covers the first frame');
  for (let i = 0; i < 60; i++) sc.update(DT);
  sc.render(ctx); ok(st.veils.length === first, 'fade-in is gone after its duration');
  ok(sc.n === 60, 'wrapped update still runs');
  // 飛行士: 周期内で歩く/手を振る/中に入る/ハッチで手を振る/空
  const modes = new Set(); let okRange = true, maxJump = 0, prev = astronautCycle(0);
  for (let t = 0; t < 44; t += 0.05) {
    const a = astronautCycle(t); modes.add(a.mode);
    if (!(a.a >= 0 && a.a <= 1 && a.glow >= 0 && a.glow <= 1 && a.x >= 113 && a.x <= 181)) okRange = false;
    if (a.mode !== 'hidden' && prev.mode !== 'hidden') maxJump = Math.max(maxJump, Math.abs(a.x - prev.x));
    prev = a;
  }
  ok(okRange, 'astronaut cycle stays within the walkway and alpha/glow in [0,1]');
  ok(modes.has('walk') && modes.has('wave') && modes.has('hidden'), 'cycle walks, waves and boards');
  ok(maxJump < 1.2, 'astronaut motion is continuous (max step ' + maxJump.toFixed(2) + ')');
  const a14 = astronautCycle(15), a8 = astronautCycle(10);
  ok(a14.mode === 'wave' && a14.a > 0.9 && a8.mode === 'hidden' && a8.glow === 1, 'reappears waving at the hatch after boarding (hatch lit while inside)');
}

// ---------- 8. 3000フレーム ランダム入力ファズ（タイトル） ----------
{
  setDebug(false);
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const cr = makeCtx(); const m = makeMusic();
  let started = 0, thrown = null, t = null, created = 0;
  const mk = () => { const e = makeEngine(cr.ctx, m); if (rnd() < 0.7) e.storage.set('player.name', 'KAI'); t = new TitleScene(e, () => started++, { launch: rnd() < 0.85 }); t.enter(); created++; };
  mk();
  let maxP = 0;
  try {
    for (let i = 0; i < 3000; i++) {
      if (i % 450 === 449) mk();
      const r = rnd();
      if (r < 0.05) t.onInput('tap', { x: rnd() * 360, y: rnd() * 640, now: i * 16 });
      else if (r < 0.07) t.onInput(['left', 'right', 'up', 'down', 'confirm', 'back'][Math.floor(rnd() * 6)]);
      else if (r < 0.075) t._submitName(rnd() < 0.5 ? 'Z' : '');
      t.update(rnd() < 0.05 ? 0.1 : DT); t.render(cr.ctx);
      maxP = Math.max(maxP, t.parts.length);
    }
  } catch (err) { thrown = err; }
  ok(!thrown, 'title update/render never throws over 3000 random-input frames: ' + (thrown && thrown.stack));
  ok(maxP <= SMOKE_MAX + STEAM_MAX, 'particle cap held during fuzz (' + maxP + ')');
  ok(cr.st.nan === 0 && cr.st.depth === 0 && cr.st.minDepth >= 0, 'fuzz: no NaN, save/restore balanced (nan ' + cr.st.nan + ', depth ' + cr.st.depth + ')');
  ok(created > 3 && started >= 0, 'fuzz exercised multiple title instances (' + created + ', starts ' + started + ')');
  // dt が異常でも壊れない
  const e = makeEngine(cr.ctx, makeMusic()); const t2 = new TitleScene(e, noop, { launch: true }); t2.enter(); t2.name = 'K'; tap(t2, 5, 5);
  let thrown2 = null; try { for (const d of [0, -1, NaN, 0.1, 5, undefined]) { t2.update(d); t2.render(cr.ctx); } } catch (err) { thrown2 = err; }
  ok(!thrown2, 'abnormal dt values do not throw');
}

console.log('p2b: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
