// p9champ — WORLD #1 バナー / チャンピオン称号（二つ名）UI。実行: node 04_tests/p9champ.mjs（lander/ から）
// net の関数は WorldNet 経由で差し替える（実ネットワークには触れない）。
globalThis.CanvasRenderingContext2D = { prototype: { letterSpacing: '' } };   // art.js が字間を1回の fillText で描く経路を使う（文字列を記録しやすい）
const { TitleScene, openChampionEntry, championEntryOpen } = await import('../02_src/title.js');
const { Game } = await import('../02_src/game.js');
const { __setRelayUrl } = await import('../02_src/net.js');
const { setDebug } = await import('../02_src/debug.js');
const { WorldNet, loadTop1, sanitizeTitle, titleResultMessage, graphemes, createRankTabs, drawRankPanel } = await import('../02_src/ranking.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
setDebug(false); __setRelayUrl('https://relay.test');
const tick = () => new Promise((r) => setTimeout(r, 0));
const flush = async () => { for (let i = 0; i < 6; i++) await tick(); };

// 文字を記録する ctx（幅=1文字7px）
function makeCtx() {
  const rec = { texts: [], fill: [] };
  const st = {};
  const ctx = new Proxy(st, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: Array.from(String(s)).length * 7 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s, x, y) => { rec.texts.push({ s: String(s), x, y, align: t.textAlign, font: t.font }); };
      if (k in t) return t[k];
      return noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, rec };
}
const music = { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop,
  sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop, good: noop, bad: noop } };
function makeEngine(store, ctx) {
  const e = {
    ctx, music,
    audio: new Proxy({ ctx: null, enabled: true }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } }),
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
    text: noop, rect: noop, stroke: noop, menuCalls: 0, toMenu() { e.menuCalls++; }, pointer: { down: false, x: 0, y: 0 }, touches: [],
  };
  return e;
}
const KEY = 'k'.repeat(64);
const mkStore = (name = 'みや', extra = []) => new Map([['hudTipSeen', '1'], ['profiles', JSON.stringify([{ name, key: KEY }])], ['activeProfile', name], ['lastName', name], ...extra]);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0, t0: Infinity });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// ---- stubs ----
const calls = { fetch: 0, submit: [], setTitle: [] };
let topResp = null, submitResp = { ok: true, status: 200 }, setTitleResp = { ok: true, title: '' };
WorldNet.fetchTop = async () => { calls.fetch++; return topResp; };
WorldNet.submit = async (e) => { calls.submit.push(e); return submitResp; };
WorldNet.setTitle = async (n, k, t) => { calls.setTitle.push({ n, k, t }); return typeof setTitleResp === 'function' ? setTitleResp(t) : setTitleResp; };
const reset = () => { calls.fetch = 0; calls.submit.length = 0; calls.setTitle.length = 0; topResp = null; submitResp = { ok: true, status: 200 }; setTitleResp = { ok: true, title: '' }; };

// ===== 1. helpers =====
{
  ok(sanitizeTitle('  初代ランダーチャンピオン  ') === '初代ランダーチャンピオン', 'sanitizeTitle trims');
  ok(graphemes(sanitizeTitle('あ'.repeat(40))).length === 16, 'sanitizeTitle caps at 16 chars');
  ok(graphemes(sanitizeTitle('👨‍👩‍👧'.repeat(20))).length === 16, 'sanitizeTitle counts graphemes (ZWJ family emoji = 1)');
  ok(sanitizeTitle('a‮b\u0000c') === 'abc', 'sanitizeTitle strips bidi/control');
  ok(sanitizeTitle('   ') === '' && sanitizeTitle(null) === '', 'sanitizeTitle empty');
  ok(titleResultMessage({ ok: true }) === 'TITLE SAVED' && titleResultMessage({ ok: false, error: 'not-champion' }) === 'NOT THE CHAMPION ANYMORE'
    && titleResultMessage({ ok: false, error: 'unavailable' }) === 'TITLE SERVICE UNAVAILABLE' && /OFFLINE/.test(titleResultMessage({ ok: false, error: 'timeout' })), 'result messages');
}

// ===== 2. banner: fetch / cache / hidden =====
{
  reset();
  // 何も知らない -> 非表示
  topResp = null;
  let { ctx, rec } = makeCtx();
  let t = new TitleScene(makeEngine(mkStore(), ctx), noop, { launch: true });
  t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(t.top1 === null && !rec.texts.some((x) => x.s === 'WORLD CHAMPION'), 'hidden when nothing is known (offline, no cache)');
  // 取得成功 -> 表示 + キャッシュ更新
  topResp = [{ name: 'みや', score: 4095, stage: 12, date: 'x', title: '初代ランダーチャンピオン' }, { name: 'B', score: 100, stage: 2 }];
  const store = mkStore('B');
  ({ ctx, rec } = makeCtx());
  t = new TitleScene(makeEngine(store, ctx), noop, { launch: true });
  t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(t.top1 && t.top1.name === 'みや' && t.top1.score === 4095, 'top1 from fetch');
  ok(rec.texts.some((x) => x.s === 'WORLD CHAMPION') && rec.texts.some((x) => x.s === '4095') && rec.texts.some((x) => x.s === 'みや'), 'banner row 1 rendered');
  ok(rec.texts.some((x) => x.s === '「初代ランダーチャンピオン」'), 'banner row 2 shows the epithet in corner brackets');
  const c = loadTop1(store.get('worldTop1') ? t.engine.storage : null);
  ok(c && c.name === 'みや' && c.score === 4095 && c.title === '初代ランダーチャンピオン' && c.at > 0, 'cache updated on fetch');
  ok(t.engine.storage.get('worldTop1').includes('"at"'), 'cache is JSON {name,score,title,at,board}');
  // 称号なし -> 2行目なし
  topResp = [{ name: 'みや', score: 4095, stage: 12 }];
  ({ ctx, rec } = makeCtx());
  t = new TitleScene(makeEngine(mkStore('B'), ctx), noop, { launch: true }); t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(rec.texts.some((x) => x.s === 'WORLD CHAMPION') && !rec.texts.some((x) => x.s.startsWith('「')), 'no epithet -> single line');
  // オフライン(null) -> キャッシュ表示。空配列 -> 消える
  const st2 = mkStore('B', [['worldTop1', JSON.stringify({ name: 'みや', score: 777, title: 'X', at: 1, board: 'v1.1' })]]);
  topResp = null;
  ({ ctx, rec } = makeCtx());
  t = new TitleScene(makeEngine(st2, ctx), noop, { launch: true }); t.enter();
  ok(t.top1 && t.top1.score === 777, 'cache shown instantly (before fetch resolves)');
  await flush(); t.update(0.016); t.render(ctx);
  ok(t.top1 && t.top1.score === 777 && rec.texts.some((x) => x.s === '777'), 'offline: cached #1 still shown');
  ok(JSON.parse(st2.get('worldTop1')).score === 777, 'offline fetch does not touch the cache');
  topResp = [];
  t = new TitleScene(makeEngine(st2, makeCtx().ctx), noop, { launch: true }); t.enter(); await flush();
  ok(t.top1 === null, 'empty server list clears the known #1');
  // 破損キャッシュ
  topResp = null;
  t = new TitleScene(makeEngine(mkStore('B', [['worldTop1', '{bad']]), makeCtx().ctx), noop, { launch: true }); t.enter(); await flush();
  ok(t.top1 === null, 'corrupt cache ignored');
}

// ===== 3. SET TITLE target: champion only; overlays consume taps =====
{
  reset();
  topResp = [{ name: 'みや', score: 4095, stage: 12, title: 'OLD' }, { name: 'B', score: 1, stage: 1 }];
  const started = { n: 0 };
  // 非チャンピオン
  let { ctx, rec } = makeCtx();
  let t = new TitleScene(makeEngine(mkStore('B'), ctx), () => { started.n++; }, { launch: false });
  t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(!t._isChampion() && !rec.texts.some((x) => x.s === 'SET TITLE'), 'non-champion: no SET TITLE');
  t.onInput('tap', center(t.titleBtn));
  ok(!championEntryOpen(t._champ), 'non-champion tap on the SET TITLE rect opens nothing');
  // チャンピオン
  started.n = 0;
  ({ ctx, rec } = makeCtx());
  t = new TitleScene(makeEngine(mkStore('みや'), ctx), () => { started.n++; }, { launch: false });
  t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(t._isChampion() && rec.texts.some((x) => x.s === 'SET TITLE'), 'champion: SET TITLE shown');
  t.onInput('tap', center(t.titleBtn));
  ok(championEntryOpen(t._champ) && t._champ.value === 'OLD', 'tap opens the entry prefilled with the current title');
  ok(started.n === 0 && !t.launch, 'opening the entry does not start the game');
  ok(t.blocksBack() === true, 'blocksBack while open');
  t.onInput('tap', { x: 180, y: 480, now: 0 }); t.onInput('confirm', {}); t.onInput('back', {}); t.onInput('tap', center(t.rankBtn));
  ok(started.n === 0 && !t.launch && t.showRank === false && championEntryOpen(t._champ), 'overlay consumes taps/keys (no start, no ranking)');
  ({ ctx, rec } = makeCtx()); t.render(ctx);   // 開いたまま描画しても例外なし
  // SAVE: 空白付き・17文字 -> 16 に切り詰め
  setTitleResp = (x) => ({ ok: true, title: x });
  const r = await t._champ.save('  ' + 'あ'.repeat(30) + ' ');
  ok(calls.setTitle.length === 1 && calls.setTitle[0].n === 'みや' && calls.setTitle[0].k === KEY && graphemes(calls.setTitle[0].t).length === 16, 'SAVE calls setTitle(name,key,<=16 graphemes trimmed)');
  ok(r.ok && t._champ.msg === 'TITLE SAVED', 'inline TITLE SAVED');
  ok(loadTop1(t.engine.storage).title === 'あ'.repeat(16), 'cache title updated after save');
  await new Promise((res) => setTimeout(res, 1300));
  ok(!championEntryOpen(t._champ) && t.top1.title === 'あ'.repeat(16), 'closes after success; banner shows new title');
  // 空 = クリア
  t.onInput('tap', center(t.titleBtn));
  await t._champ.save('   ');
  ok(calls.setTitle[calls.setTitle.length - 1].t === '', 'empty saves "" (clears)');
  t._champ.skip();
  ok(!championEntryOpen(t._champ), 'SKIP closes');
  t.onInput('tap', center(t.titleBtn)); t.exit();
  ok(t._champ === null || !t._champ.open, 'exit closes the entry');
}

// ===== 4. error results =====
{
  reset();
  const cases = [['not-champion', 'NOT THE CHAMPION ANYMORE'], ['unavailable', 'TITLE SERVICE UNAVAILABLE'], ['disabled', 'TITLE SERVICE UNAVAILABLE'], ['timeout', 'OFFLINE — TRY LATER'], ['forbidden', 'NOT ALLOWED — KEY MISMATCH'], ['invalid', 'INVALID TITLE']];
  for (const [err, msg] of cases) {
    setTitleResp = { ok: false, error: err };
    let closed = 0;
    const c = openChampionEntry({ name: 'みや', key: KEY, initial: '', heading: 'X', onClose: () => { closed++; } });
    await c.save('t');
    ok(c.msg === msg && c.open && !c.busy && closed === 0, 'error ' + err + ' -> "' + msg + '", stays open (SKIP always available)');
    c.skip(); ok(closed === 1 && !c.open, 'SKIP after error leaves');
  }
  WorldNet.setTitle = async () => { throw new Error('boom'); };
  const c = openChampionEntry({ name: 'みや', key: KEY, onClose: noop });
  let threw = false; try { await c.save('x'); } catch (_) { threw = true; }
  ok(!threw && c.msg === 'TITLE SERVICE UNAVAILABLE' && c.open, 'setTitle throwing does not escape (shown as unavailable)');
  c.skip();
  WorldNet.setTitle = async (n, k, t) => { calls.setTitle.push({ n, k, t }); return typeof setTitleResp === 'function' ? setTitleResp(t) : setTitleResp; };
}

// ===== 5. game over: NEW WORLD RECORD overlay =====
async function runGameOver({ name = 'みや', score = 5000, top, debug = false, noKey = false } = {}) {
  reset();
  const store = mkStore(name);
  if (noKey) store.set('profiles', JSON.stringify([]));
  topResp = top;
  const { ctx, rec } = makeCtx();
  const e = makeEngine(store, ctx);
  const g = new Game(e); g.enter();
  if (debug) g._dbgTainted = true;
  g.totalScore = score; g.stage = 7;
  g._gameOver();
  await flush();
  return { g, e, store, ctx, rec };
}
{
  // 自分が #1 かつ同スコア -> 出る
  let { g, ctx } = await runGameOver({ top: [{ name: 'みや', score: 5000, stage: 7, title: '前の称号' }, { name: 'B', score: 10, stage: 1 }] });
  ok(calls.submit.length === 1 && calls.submit[0].name === 'みや' && calls.submit[0].key === KEY, 'world submit sent with profile key');
  ok(championEntryOpen(g._champ) && g._champ.value === '前の称号' && g._champ.heading === 'NEW WORLD RECORD!', 'overlay opens (prefilled) when pilot is #1 with this score');
  ok(g.blocksBack() === true, 'game over: blocksBack while overlay open');
  g.onInput('tap', { x: 180, y: 300, now: 0, t0: Infinity }); g.onInput('confirm', {}); g.onInput('back', {});
  ok(g.engine.menuCalls === 0 && championEntryOpen(g._champ), 'overlay consumes taps/keys: no return to title');
  g.render(ctx);
  setTitleResp = (x) => ({ ok: true, title: x });
  await g._champ.save('  CHAMP  ');
  ok(calls.setTitle.length === 1 && calls.setTitle[0].t === 'CHAMP' && calls.setTitle[0].n === 'みや', 'SAVE -> setTitle(name,key,trimmed)');
  await new Promise((r) => setTimeout(r, 1300));
  ok(!championEntryOpen(g._champ) && g.state === 'gameover', 'after save, normal ranking screen continues');
  g.engine.menuCalls = 0; g.onInput('confirm', {}); g._inputLock = 0; g.onInput('confirm', {});
  ok(g.engine.menuCalls === 1, 'ranking screen -> title works afterwards');

  // SKIP
  ({ g } = await runGameOver({ top: [{ name: 'みや', score: 5000, stage: 7 }] }));
  ok(championEntryOpen(g._champ), 'opens (no previous title)');
  g._champ.skip();
  ok(!championEntryOpen(g._champ) && g.state === 'gameover' && calls.setTitle.length === 0, 'SKIP continues to ranking without calling setTitle');

  // 出ない: スコア違い / 別人が#1 / デバッグ / 取得失敗 / 提出失敗 / キー無し
  ({ g } = await runGameOver({ top: [{ name: 'みや', score: 6000, stage: 7 }] }));
  ok(!g._champ, 'not shown: #1 has a different (higher) score');
  ({ g } = await runGameOver({ top: [{ name: 'B', score: 5000, stage: 7 }, { name: 'みや', score: 4000, stage: 1 }] }));
  ok(!g._champ, 'not shown: another pilot is #1');
  ({ g } = await runGameOver({ top: [{ name: 'みや', score: 5000, stage: 7 }], debug: true }));
  ok(!g._champ && calls.submit.length === 0 && calls.fetch === 0, 'not shown / nothing sent in a debug run');
  ({ g } = await runGameOver({ top: null }));
  ok(!g._champ, 'not shown: world fetch failed (offline)');
  topResp = null; submitResp = { ok: false, status: 0 };
  {
    reset(); submitResp = { ok: false, error: 'timeout' }; topResp = [{ name: 'みや', score: 5000, stage: 7 }];
    const e = makeEngine(mkStore(), makeCtx().ctx); const g2 = new Game(e); g2.enter(); g2.totalScore = 5000; g2._gameOver(); await flush();
    ok(!g2._champ && calls.fetch === 0, 'not shown: submit failed (no refetch)');
  }
  // 画面を離れた後に応答 -> 出ない
  {
    reset(); topResp = [{ name: 'みや', score: 5000, stage: 7 }];
    let release; WorldNet.fetchTop = () => new Promise((r) => { release = () => r(topResp); });
    const e = makeEngine(mkStore(), makeCtx().ctx); const g2 = new Game(e); g2.enter(); g2.totalScore = 5000; g2._gameOver(); await flush();
    g2.exit(); release(); await flush();
    ok(!g2._champ, 'late response after leaving the screen opens nothing');
    WorldNet.fetchTop = async () => { calls.fetch++; return topResp; };
  }
  // 称号が WORLD 行に出る
  setDebug(false);
}

// ===== 6. WORLD rows render titles; long names never throw =====
{
  const { ctx, rec } = makeCtx();
  const tabs = createRankTabs(); tabs.mode = 'world'; tabs.status = 'ok';
  tabs.world = [{ name: 'みや', score: 4095, stage: 12, title: '初代ランダーチャンピオン' }, { name: 'B', score: 100, stage: 2 }];
  drawRankPanel({}, ctx, tabs, [], 32, 130, 296, -1);
  ok(rec.texts.some((x) => x.s === '初代ランダーチャンピオン'), 'WORLD row shows the epithet');
  const row0 = rec.texts.find((x) => x.s === 'みや'), tl = rec.texts.find((x) => x.s === '初代ランダーチャンピオン');
  ok(row0 && tl && tl.y > row0.y && tl.y - row0.y <= 20 && tl.x === row0.x, 'epithet sits under the name');
  ok(rec.texts.filter((x) => x.s === 'B').length === 1 && !rec.texts.some((x) => x.s === 'undefined'), 'rows without a title unchanged');
  const lt = makeCtx(); const t2 = createRankTabs(); t2.mode = 'local';
  drawRankPanel({}, lt.ctx, t2, [{ name: 'みや', score: 1, stage: 1, title: 'SHOULD-NOT-MATTER' }], 32, 130, 296, -1);
  ok(true, 'LOCAL tab renders');
  // 長い日本語 / 絵文字
  const long = 'ああああああああああああああああああああ', lt2 = createRankTabs(); lt2.mode = 'world'; lt2.status = 'ok';
  lt2.world = [{ name: long, score: 99999, stage: 99, title: long + long }];
  const m = makeCtx(); let threw = null;
  try { drawRankPanel({}, m.ctx, lt2, [], 32, 130, 296, -1); } catch (e) { threw = e; }
  ok(!threw, 'long Japanese name/title in WORLD rows: no throw');
  const bad = m.rec.texts.filter((x) => x.x + x.s.length * 7 > 32 + 296 - 54 - 20 && x.align === 'left' && x.x >= 60);
  ok(bad.length === 0, 'WORLD row name/title truncated before the score column: ' + JSON.stringify(bad.map((b) => b.s)));
  ok(m.rec.texts.some((x) => x.s.endsWith('…')), 'truncation uses an ellipsis');
}

// ===== 7. title layout: no overlaps, long names =====
{
  reset();
  const LONGN = 'あいうえおかきくけこ', LONGT = 'とてもながいにほんごのしょうごうです';
  topResp = [{ name: LONGN, score: 1234567, stage: 99, title: LONGT }];
  for (const asChamp of [false, true]) for (const withCp of [false, true]) {
    const extra = withCp ? [['checkpoint', JSON.stringify({ v: 1, runId: 'r', stage: 4, totalScore: 1234, continues: 2, modules: {}, name: 'x', savedAt: 'z' })]] : [];
    const store = mkStore(asChamp ? LONGN : 'B', extra);
    const { ctx, rec } = makeCtx();
    const t = new TitleScene(makeEngine(store, ctx), noop, { launch: true });
    let threw = null;
    try { t.enter(); await flush(); t.update(0.016); t.render(ctx); } catch (e) { threw = e; }
    ok(!threw, 'render with long JP name/title (champ=' + asChamp + ', cp=' + withCp + ') does not throw: ' + (threw && threw.message));
    ok(t._isChampion() === asChamp, 'champion detection (' + asChamp + ')');
    const bn = rec.texts.filter((x) => x.y >= 120 && x.y <= 170 && x.s !== 'SET TITLE' && x.s !== 'BETA v1.1');
    const wb = t.worldBox;
    // 描画された文字の外接（幅=7px/文字。sp 無視の下限）が画面内、バナー帯内
    ok(bn.length >= 3, 'banner texts drawn');
    ok(bn.every((x) => x.y >= wb.y - 1 && x.y + 10 <= wb.y + wb.h + 1), 'banner texts within the banner band y');
    const wOfT = (x) => x.s.length * 7 + (x.s.length - 1) * 1;   // 7px/字 + 字間(最小1px)
    const x0 = (x) => x.align === 'center' ? x.x - wOfT(x) / 2 : x.align === 'right' ? x.x - wOfT(x) : x.x;
    const xs = bn.map(x0), xe = bn.map((x) => x0(x) + wOfT(x));
    ok(Math.min(...xs) >= wb.x - 4 && Math.max(...xe) <= wb.x + wb.w + 2, 'plaque texts stay inside the plaque / screen edge (champ=' + asChamp + ')');
    const others = { logo: t.logoBox, beta: t.betaBox, mute: t.muteBtn, pilots: t.changeBtn, rank: t.rankBtn, start: withCp ? t.continueBtn : t.startBtn, newBtn: t.newBtn };
    for (const [k, r] of Object.entries(others)) {
      ok(!overlap(wb, r), 'worldBox does not overlap ' + k);
      if (asChamp) ok(!overlap(t.titleBtn, r), 'SET TITLE does not overlap ' + k);
    }
    // ロケット(x 185-215, 先端 y=164 から下) / タワー(x<=125, y>=176) / 宇宙飛行士の領域
    const rocket = { x: 183, y: 164, w: 34, h: 240 }, tower = { x: 90, y: 176, w: 40, h: 220 };
    ok(!overlap(wb, rocket) && !overlap(wb, tower), 'worldBox clear of rocket and tower');
    if (asChamp) ok(!overlap(t.titleBtn, rocket) && !overlap(t.titleBtn, tower), 'SET TITLE clear of rocket/tower');
    ok(wb.y >= t.betaBox.y + t.betaBox.h && wb.y + wb.h <= 164, 'banner sits between BETA and the rocket tip');
    if (asChamp) ok(t.titleBtn.h >= 32 && t.titleBtn.y >= wb.y + wb.h && !overlap(t.titleBtn, wb), 'SET TITLE hit box >=32px tall and below the plaque (no overlap)');
    ok(asChamp === rec.texts.some((x) => x.s === 'YOU'), 'YOU tag only for the champion');
    ok(rec.texts.some((x) => x.s === 'WORLD CHAMPION'), 'plaque label drawn');
    let thr2 = null; try { for (const tt of [0, 0.5, 3, 7.3]) { t.t = tt; t.render(ctx); } } catch (e) { thr2 = e; }
    ok(!thr2, 'plaque animation frames render');
  }
}

// ===== 7b. plaque tap opens WORLD ranking, consumes the tap =====
{
  reset();
  topResp = [{ name: 'Zed', score: 5000, stage: 9, title: 'x' }];
  const store = mkStore('B');
  const { ctx } = makeCtx();
  let started = 0;
  const t = new TitleScene(makeEngine(store, ctx), noop, { launch: true });
  t.enter(); await flush(); t.update(0.016);
  const wb = t.worldBox;
  t.onInput('tap', { x: wb.x + wb.w / 2, y: wb.y + wb.h / 2, now: 1000 });
  ok(t.showRank === true && t.tabs && t.tabs.mode === 'world', 'plaque tap opens ranking on WORLD tab');
  ok(!t.launch, 'plaque tap does not start the game');
  t.onInput('tap', { x: 20, y: 300, now: 2000 });
  ok(t.showRank === false && !t.launch, 'next tap only closes the ranking');
  // 本人でなければ SET TITLE 領域のタップは何もしない（開始もしない）
  t.onInput('tap', { x: t.titleBtn.x + 10, y: t.titleBtn.y + 10, now: 3000 });
  ok(!championEntryOpen(), 'non-champion cannot open title entry from plaque area');
}

// ===== 7c. HALL OF FAME (WORLD TOP 5) between Boot and Title =====
{
  const { BootScene, HallOfFameScene, hallHasData, HALL_SECS } = await import('../02_src/title.js');
  const { saveWorldList, loadWorldList, worldTop5View } = await import('../02_src/ranking.js');
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ name: 'P' + (i + 1), score: 9000 - i * 100, stage: 5, title: i === 0 ? 'T' : '' }));
  const st = { m: new Map(), get(k, d = null) { return this.m.has(k) ? this.m.get(k) : d; }, set(k, v) { this.m.set(k, String(v)); } };
  ok(loadWorldList(st) === null, 'no cache -> null');
  ok(saveWorldList(st, mk(150)) && loadWorldList(st).length === 100, 'cache keeps at most 100 rows');
  ok(loadWorldList(st)[0].title === 'T', 'cache keeps title');
  st.set('worldTop5', JSON.stringify({ at: 1, rows: mk(3) })); ok(loadWorldList(st) === null, 'cache without v1.1 board stamp -> ignored'); st.set('worldTop5', '{broken'); ok(loadWorldList(st) === null, 'corrupt cache -> null (no throw)');
  const L = mk(12);
  let v = worldTop5View(L, 'P3'); ok(v.rows.length === 5 && v.rows[2].you && !v.extra, 'YOU marked inside top5');
  v = worldTop5View(L, 'P9'); ok(!v.rows.some((r) => r.you) && v.extra && v.extra.rank === 9 && v.extra.score === 8200, 'YOU #N extra row outside top5');
  v = worldTop5View(L, 'nobody'); ok(!v.extra && !v.rows.some((r) => r.you), 'absent -> no YOU');
  ok(worldTop5View([], 'x') === null && worldTop5View(null, 'x') === null, 'empty -> null');

  const mkEng = (store, ctx, ev) => { const e = makeEngine(store, ctx); e.music = { ...music, playFanfare: () => { ev.push('fan'); }, stopFanfare: () => { ev.push('stopfan'); }, playTitle: () => { ev.push('title'); } }; return e; };
  const setup = async (cache, resp, me) => {
    reset(); topResp = resp;
    const store = mkStore(me); if (cache) store.set('worldTop5', JSON.stringify({ at: 1, board: 'v1.1', rows: cache }));
    const { ctx, rec } = makeCtx(); const ev = [];
    const eng = mkEng(store, ctx, ev);
    return { store, ctx, rec, ev, eng };
  };
  // no data -> hallHasData false (main.js skips the scene)
  let S = await setup(null, null, 'B');
  ok(hallHasData(S.eng) === false, 'no cache -> hall skipped');
  // flow: Boot tap -> hall (not title, game not started)
  const long = mk(8); long[0].name = 'あいうえおかきくけこさしすせそた'; long[0].title = 'とてもながいにほんごのしょうごうです'; long[7].name = 'B';
  S = await setup(long, null, 'B');
  ok(hallHasData(S.eng) === true, 'cache -> hall shown');
  const order = [];
  const boot = new BootScene(S.eng, () => order.push('hall'));
  boot.onInput('tap', { x: 1, y: 1, now: 0 }); boot.onInput('tap', { x: 1, y: 1, now: 0 });
  ok(order.join() === 'hall', 'boot tap goes to hall exactly once');
  let hall = new HallOfFameScene(S.eng, () => order.push('title'));
  hall.enter(); await flush();
  ok(S.ev.join() === 'fan', 'fanfare starts once on hall enter; title music not started by hall');
  let thr = null; try { for (let i = 0; i < 150; i++) { hall.update(1 / 60); hall.render(S.ctx); } } catch (e) { thr = e; }
  ok(!thr && S.rec.texts.some((x) => x.s === 'HALL OF FAME') && S.rec.texts.some((x) => x.s === 'WORLD CHAMPION') && S.rec.texts.some((x) => x.s === 'YOU  #8'), 'hall renders plaque + YOU #N row (long names)');
  ok(order.join() === 'hall', 'no auto-advance at 2.5s');
  hall.onInput('tap', { x: 180, y: 300, now: 1 });
  ok(order.join() === 'hall,title' && S.ev.includes('stopfan'), 'tap skips to title once and stops the fanfare');
  hall.onInput('tap', { x: 180, y: 300, now: 2 }); hall.update(10);
  ok(order.length === 2, 'no double advance after skip');
  // auto advance
  S = await setup(long, null, 'B'); const o2 = [];
  hall = new HallOfFameScene(S.eng, () => o2.push('title')); hall.enter();
  for (let i = 0; i < Math.floor(HALL_SECS * 60) - 10; i++) hall.update(1 / 60);
  ok(o2.length === 0, 'still showing just before the deadline');
  for (let i = 0; i < 20; i++) hall.update(1 / 60);
  ok(o2.length === 1, 'auto-advances after ~' + HALL_SECS + 's, once');
  // refresh swaps view + saves cache
  S = await setup(long, mk(3), 'P2'); hall = new HallOfFameScene(S.eng, noop); hall.enter(); await flush();
  for (let i = 0; i < 60; i++) { hall.update(1 / 60); hall.render(S.ctx); }
  ok(S.store.get('worldTop5').includes('P3') && S.rec.texts.some((x) => x.s === 'YOU'), 'fetch refreshes cache and shows YOU tag');
  // the real Music: mute -> no jingle / no crash without audio; title music starts only in Title
  const { Music } = await import('../02_src/music.js');
  Music.setMuted(true);
  ok(!Music.playFanfare(), 'muted -> fanfare is a no-op'); Music.stopFanfare(0.1);
  const noMusic = { ...S.eng, music: music }; // music mock without playFanfare
  let thr2 = null; try { const h2 = new HallOfFameScene(noMusic, noop); h2.enter(); h2.update(1); h2.render(S.ctx); } catch (e) { thr2 = e; }
  ok(!thr2, 'music without fanfare support does not crash the hall');
}


// ===== 7d. v1.1: never show the v1.0 champion (imported worldTop1 / unstamped cache) =====
{
  const { HallOfFameScene, hallHasData } = await import('../02_src/title.js');
  const { saveTop1, loadTop1: lt1 } = await import('../02_src/ranking.js');
  reset(); topResp = null;   // relay not supported / unknown -> fetchTop returns null
  const v10 = JSON.stringify({ name: 'V10CHAMP', score: 9999, title: 'old', at: 1 });   // 引き継ぎ等で入った印の無い値
  const store = mkStore('B', [['worldTop1', v10], ['worldTop5', JSON.stringify({ at: 1, rows: [{ name: 'V10CHAMP', score: 9999, title: '' }] })]]);
  const { ctx, rec } = makeCtx();
  const eng = makeEngine(store, ctx);
  ok(lt1(eng.storage) === null, 'unstamped (v1.0) worldTop1 is not loaded');
  ok(hallHasData(eng) === false, 'unstamped worldTop5 -> hall skipped');
  const t = new TitleScene(eng, noop, { launch: true }); t.enter(); await flush(); t.update(0.016); t.render(ctx);
  ok(t.top1 === null && !rec.texts.some((x) => x.s === 'V10CHAMP' || x.s === 'WORLD CHAMPION'), 'title shows no champion from v1.0 data while relay is not supported');
  // v1.1 の取得で上書きされる
  topResp = [{ name: 'NEW11', score: 123, stage: 3 }];
  const t2 = new TitleScene(eng, noop, { launch: true }); t2.enter(); await flush();
  ok(t2.top1 && t2.top1.name === 'NEW11' && JSON.parse(store.get('worldTop1')).board === 'v1.1', 'v1.1 fetch overwrites and stamps the cache');
  // 以後、未対応(null)でも v1.1 のキャッシュは残る
  topResp = null;
  const t3 = new TitleScene(makeEngine(store, makeCtx().ctx), noop, { launch: true }); t3.enter(); await flush();
  ok(t3.top1 && t3.top1.name === 'NEW11', 'cached v1.1 champion kept while relay not supported/unknown');
  ok(hallHasData(eng) === true, 'v1.1 fetch via title also fills the hall cache');
}

// ===== 8. fake DOM: input clamp, Enter, removal =====
{
  const els = [];
  const mk = (tag) => {
    const el = { tag, children: [], listeners: {}, style: {}, value: '', className: '', parentNode: null,
      appendChild(c) { this.children.push(c); c.parentNode = this; return c; }, removeChild(c) { this.children = this.children.filter((x) => x !== c); c.parentNode = null; },
      addEventListener(n, f) { (this.listeners[n] = this.listeners[n] || []).push(f); }, setAttribute: noop, focus: noop, select: noop,
      fire(n, ev) { for (const f of (this.listeners[n] || [])) f(ev || {}); } };
    els.push(el); return el;
  };
  const body = mk('body');
  globalThis.document = { body, createElement: mk, getElementById: (id) => { const f = (n) => (n.id === id ? n : n.children.map(f).find(Boolean)); return f(body) || null; } };
  reset(); setTitleResp = (x) => ({ ok: true, title: x });
  let closed = 0;
  const c = openChampionEntry({ name: 'みや', key: KEY, initial: 'ab', heading: 'NEW WORLD RECORD!', onClose: () => { closed++; } });
  const wrap = document.getElementById('lander-champ-entry');
  ok(!!wrap && wrap.children.some((x) => x.textContent === 'NEW WORLD RECORD!'), 'DOM overlay created with heading');
  const texts = []; const walk = (n) => { if (n.textContent) texts.push(n.textContent); n.children.forEach(walk); }; walk(wrap);
  ok(texts.includes('YOUR TITLE (OPTIONAL, MAX 16)') && texts.includes('SAVE') && texts.includes('SKIP'), 'label / SAVE / SKIP present');
  const input = c._dom.input;
  ok(input.value === 'ab', 'input prefilled');
  input.value = 'あ'.repeat(25); input.fire('input');
  ok(graphemes(input.value).length === 16, 'live clamp to 16 graphemes');
  let stopped = 0; input.fire('keydown', { key: 'a', stopPropagation() { stopped++; } });
  ok(stopped === 1, 'keydown stops propagation (does not leak to the game)');
  input.fire('keydown', { key: 'Enter', isComposing: true, keyCode: 229, stopPropagation: noop, preventDefault: noop });
  ok(calls.setTitle.length === 0, 'Enter during IME composition does not save');
  input.fire('keydown', { key: 'Enter', stopPropagation: noop, preventDefault: noop }); await flush();
  ok(calls.setTitle.length === 1 && graphemes(calls.setTitle[0].t).length === 16, 'Enter saves');
  c.skip();
  ok(!document.getElementById('lander-champ-entry') && closed === 1, 'DOM removed on close');
  const c2 = openChampionEntry({ name: 'みや', key: KEY, onClose: noop });
  const c3 = openChampionEntry({ name: 'みや', key: KEY, onClose: noop });
  ok(body.children.length === 1, 'only one overlay at a time');
  c3.close(); delete globalThis.document;
}

console.log(`p9champ: ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
