// p12v11 — BETA v1.1: 版ラベル / 保存領域の分離 / v1.0 パイロットの引き継ぎ / ボード v1.1 / PIN。実行: node 04_tests/p12v11.mjs
globalThis.CanvasRenderingContext2D = { prototype: { letterSpacing: '' } };   // 字間を1回の fillText で描く経路（文字列を記録しやすい）
const { APP_VERSION, APP_LABEL, APP_BUILD_TEXT, STORAGE_PREFIX, LEGACY_PREFIX, APP_BOARD } = await import('../02_src/version.js');
const { WHATSNEW } = await import('../02_src/whatsnew.js');
const { Storage } = await import('../02_src/core/storage.js');
const net = await import('../02_src/net.js');
const { TitleScene, BootScene, openPinEntry, pinEntryOpen, hidePinEntry } = await import('../02_src/title.js');
const { Game } = await import('../02_src/game.js');
const mig = await import('../02_src/migrate.js');
const R = await import('../02_src/ranking.js');
const { setDebug } = await import('../02_src/debug.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const tick = (ms = 8) => new Promise((r) => setTimeout(r, ms));
setDebug(false);

// ---- 偽 localStorage（Map）----
function makeLS(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); }, key: (i) => [...m.keys()][i] ?? null, get length() { return m.size; } };
}
const snapshot = (ls, prefix) => JSON.stringify([...ls.m.entries()].filter(([k]) => k.startsWith(prefix)).sort());

function makeCtx() {
  const rec = { texts: [] }, st = {};
  const ctx = new Proxy(st, { get: (t, k) => {
    if (k === 'measureText') return (s) => ({ width: Array.from(String(s)).length * 7 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'fillText') return (s) => { rec.texts.push(String(s)); };
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
  return { ctx, rec };
}
const music = { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop,
  sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop, good: noop, bad: noop } };
function makeEngine(store) {
  return { music, audio: new Proxy({ ctx: null, enabled: true }, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } }),
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => (store.has(k) ? store.get(k) : d), set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store };
}
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0 });
const KEY = 'ab'.repeat(32);

// ===== 1. ラベル / 定数 =====
{
  ok(APP_VERSION === '1.1.0-beta.7' && APP_LABEL === 'BETA v1.1' && APP_BUILD_TEXT === 'build 1.1.0-beta.7', 'version constants');
  ok(STORAGE_PREFIX === 'lander11.' && LEGACY_PREFIX === 'lander.' && APP_BOARD === 'v1.1', 'prefix/board constants');
  ok(WHATSNEW.version === APP_VERSION, 'whatsnew.version is the single APP_VERSION');
  const store = new Map();
  const b = new BootScene(makeEngine(store), noop); b.update(2);
  const { ctx, rec } = makeCtx(); b.render(ctx);
  ok(rec.texts.some((t) => t === 'BETA v1.1'), 'boot shows BETA v1.1');
  ok(rec.texts.some((t) => t === 'build 1.1.0-beta.7'), 'boot shows build text under the update frame');
  ok(rec.texts.some((t) => t === 'UPDATE INFORMATION'), 'boot shows UPDATE INFORMATION');
  b.onInput('tap', { x: 1, y: 1 });
  ok(store.get('seenVersion') === APP_VERSION, 'seenVersion = APP_VERSION');
  const t = new TitleScene(makeEngine(new Map([['hudTipSeen', '1'], ['howtoSkip', '1']])), noop, { launch: true }); net.__setRelayUrl(''); t.enter(); t.update(0.1);
  const c2 = makeCtx(); t.render(c2.ctx);
  ok(c2.rec.texts.includes('BETA v1.1') && !c2.rec.texts.includes('PUBLIC BETA'), 'title shows BETA v1.1 (not PUBLIC BETA)');
}

// ===== 2. 保存領域の分離 =====
{
  const ls = makeLS({ 'lander.profiles': '[{"name":"OLD","key":"k"}]', 'lander.high.lander': '999', 'lander.progress': '{"OLD":{"maxStage":9}}' });
  globalThis.localStorage = ls;
  const before = snapshot(ls, 'lander.');
  Storage.set('x', 1); Storage.set('profiles', '[]'); Storage.setHigh('lander', 50);
  ok(Storage.get('profiles') === '[]' && ls.m.get('lander11.profiles') === '[]' && ls.m.get('lander11.x') === '1', 'v1.1 writes go to lander11.*');
  ok(Storage.getHigh('lander') === 50 && ls.m.get('lander11.high.lander') === '50', 'high score under lander11.');
  ok(snapshot(ls, 'lander.') === before, "v1.1 writes never touch 'lander.' keys");
  ok([...ls.m.keys()].every((k) => k.startsWith('lander.') || k.startsWith('lander11.')), 'only the two prefixes exist');
  const own = [...ls.m.keys()].filter((k) => k.startsWith('lander11.'));
  ok(own.length === 3 && !ls.m.has('lander.x'), 'no leakage into lander.*');
}

// ===== 3. 引き継ぎ（import / fresh / 一度だけ）=====
{
  const legacy = {
    'lander.profiles': JSON.stringify([{ name: 'ACE', key: KEY }, { name: 'ZED', key: 'cd'.repeat(32) }]),
    'lander.activeProfile': 'ZED', 'lander.lastName': 'ZED',
    'lander.worldTop1': JSON.stringify({ name: 'ACE', score: 5, title: 'T', at: 1 }), 'lander.muted': '1',
    'lander.progress': '{"ACE":{"maxStage":8}}', 'lander.checkpoint': '{"v":1}', 'lander.ranking': '[{"name":"ACE","score":1,"stage":1}]',
    'lander.stageBest': '{"ACE":{}}', 'lander.high.lander': '77', 'lander.seenVersion': '2026.10.26', 'lander.hudTipSeen': '1', 'lander.touchHintSeen': '1',
  };
  // 3a import
  let ls = makeLS(legacy); const snap = snapshot(ls, 'lander.');
  ok(mig.legacyPilotNames(ls).join() === 'ACE,ZED', 'legacy pilot names read');
  ok(mig.migrationPlan(ls) === 'ask', 'plan: v1.0 pilots + no v1.1 data -> ask');
  const copied = mig.applyMigration(ls, 'imported');
  ok(copied.slice().sort().join() === ['activeProfile', 'lastName', 'muted', 'profiles'].sort().join(), 'import copies exactly the identity keys (not the v1.0 champion): ' + copied);
  ok(!ls.m.has('lander11.worldTop1'), 'v1.0 worldTop1 is NOT copied (v1.0 champion must not appear in v1.1)');
  for (const k of ['profiles', 'activeProfile', 'lastName', 'muted']) ok(ls.m.get('lander11.' + k) === legacy['lander.' + k], 'exact value copied: ' + k);
  ok(JSON.parse(ls.m.get('lander11.profiles'))[0].key === KEY, 'ownership key copied exactly');
  for (const k of ['progress', 'checkpoint', 'ranking', 'stageBest', 'high.lander', 'seenVersion', 'hudTipSeen', 'touchHintSeen']) ok(!ls.m.has('lander11.' + k), 'NOT copied: ' + k);
  ok(ls.m.get('lander11.migration') === 'imported', 'choice recorded');
  ok(snapshot(ls, 'lander.') === snap, "import never modifies 'lander.' data");
  ok(mig.migrationPlan(ls) === 'skip', 'asked once: next launch -> skip');
  // 3b fresh
  ls = makeLS(legacy);
  ok(mig.migrationPlan(ls) === 'ask', 'plan ask (fresh case)');
  ok(mig.applyMigration(ls, 'fresh').length === 0 && [...ls.m.keys()].filter((k) => k.startsWith('lander11.')).join() === 'lander11.migration' && ls.m.get('lander11.migration') === 'fresh', 'fresh copies nothing, records choice');
  ok(mig.migrationPlan(ls) === 'skip', 'fresh: not asked again');
  // 3c no legacy -> mark none, never ask later
  ls = makeLS({}); ok(mig.migrationPlan(ls) === 'skip' && ls.m.get('lander11.migration') === 'none', 'no v1.0 data: skip + marker');
  ls.m.set('lander.profiles', legacy['lander.profiles']); ok(mig.migrationPlan(ls) === 'skip', 'v1.0 pilots appearing later: still not asked');
  // 3d existing v1.1 data -> skip
  ls = makeLS({ ...legacy, 'lander11.seenVersion': '1.1.0-beta' }); ok(mig.migrationPlan(ls) === 'skip' && !ls.m.has('lander11.migration'), 'v1.1 data exists -> skip');
  // 3e lastName only
  ls = makeLS({ 'lander.lastName': 'SOLO' }); ok(mig.legacyPilotNames(ls).join() === 'SOLO' && mig.migrationPlan(ls) === 'ask', 'lastName-only counts as a pilot');
  // 3f broken JSON
  ls = makeLS({ 'lander.profiles': '{bad' }); ok(mig.legacyPilotNames(ls).length === 0 && mig.migrationPlan(ls) === 'skip', 'broken profiles -> no pilots');
  // 3g scene
  ls = makeLS(legacy); let nexted = 0;
  const sc = new mig.MigrateScene(makeEngine(new Map()), () => { nexted++; }, ls, mig.legacyPilotNames(ls));
  const cc = makeCtx(); sc.render(cc.ctx);
  ok(cc.rec.texts.includes('IMPORT v1.0 PILOTS') && cc.rec.texts.includes('START FRESH'), 'choice screen labels');
  sc.onInput('tap', { x: 5, y: 5 }); ok(nexted === 0 && !ls.m.has('lander11.migration'), 'stray tap decides nothing');
  sc.onInput('tap', center(sc.btnImport)); ok(nexted === 1 && ls.m.get('lander11.migration') === 'imported' && ls.m.has('lander11.profiles'), 'tap IMPORT');
  sc.onInput('tap', center(sc.btnFresh)); ok(nexted === 1, 'second tap ignored');
  ls = makeLS(legacy); const s2 = new mig.MigrateScene(makeEngine(new Map()), noop, ls, []); s2.onInput('down'); s2.onInput('confirm');
  ok(ls.m.get('lander11.migration') === 'fresh', 'keyboard: down+confirm = START FRESH');
}

// ===== 4. ボード v1.1 の送信 =====
const calls = []; let handler = () => ({ ok: true, status: 200, json: async () => ({ board: 'v1.1', top: [] }) });
globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return handler(String(url), init); };
{
  net.__setRelayUrl('https://relay.test');
  ok(net.RELAY_BOARD === 'v1.1', 'RELAY_BOARD defaults to v1.1');
  calls.length = 0; await net.submitScore({ name: 'A', score: 5, stage: 2, key: KEY });
  ok(JSON.parse(calls[0].init.body).board === 'v1.1', 'submit body has board v1.1');
  calls.length = 0; await net.fetchWorldTop(); ok(calls[0].url === 'https://relay.test/ranking?board=v1.1', 'GET /ranking?board=v1.1');
  calls.length = 0; await net.setTitle('A', KEY, 'T'); ok(JSON.parse(calls[0].init.body).board === 'v1.1', 'title body has board v1.1');
}

// ===== 5. ボード非対応（旧 Worker）: WORLD は UPDATING、送信しない =====
{
  net.__setRelayUrl('https://relay.test');   // 対応キャッシュをリセット
  handler = () => ({ ok: true, status: 200, json: async () => ({ top: [{ name: 'V10', score: 1, stage: 1 }] }) });   // board 無し = 旧 Worker
  ok(await net.relayBoardSupported() === false && await net.relayBoardState() === 'unsupported', 'old relay -> unsupported');
  calls.length = 0;
  ok(await R.WorldNet.fetchTop() === null && R.WorldNet.updating === true, 'fetchTop: null + updating (never shows v1.0 rows)');
  const r = await R.WorldNet.submit({ name: 'A', score: 5, stage: 1, key: KEY }); ok(r.ok === false && r.error === 'updating' && !calls.some((c) => /\/submit/.test(c.url)), 'submit: not sent');
  const t = await R.WorldNet.setTitle('A', KEY, 'x'); ok(t.ok === false && t.error === 'updating' && !calls.some((c) => /\/title/.test(c.url)), 'setTitle: not sent');
  ok(R.titleResultMessage(t) === 'WORLD: UPDATING', 'title message: WORLD: UPDATING');
  const tabs = R.createRankTabs(); tabs.mode = 'world'; await R.loadWorld(tabs); ok(tabs.status === 'updating', 'WORLD tab status updating (not offline)');
  const c = makeCtx(); R.drawRankPanel({}, c.ctx, tabs, [], 32, 146, 296, -1); ok(c.rec.texts.includes('WORLD: UPDATING') && !c.rec.texts.includes('OFFLINE'), 'WORLD tab draws WORLD: UPDATING');
  // ゲームオーバーでもクラッシュせず注記
  const g = new Game(makeEngine(new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['lastName', 'ZED']]))); g.enter(); g.totalScore = 400; g.continues = 0; g.fuel = 0;
  let threw = false; try { g._doCrash('X'); await tick(20); g.render(makeCtx().ctx); } catch (_) { threw = true; }
  ok(!threw && g.state === 'gameover' && g._worldNote === 'WORLD: UPDATING' && !calls.some((c2) => /\/submit/.test(c2.url)), 'game over: local ranking kept, note WORLD: UPDATING, no submit');
  // タイトル: 別の版の #1 を出さない
  const st = new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['worldTop1', JSON.stringify({ name: 'V10', score: 1, title: '', at: 1 })]]);
  const ts = new TitleScene(makeEngine(st), noop, { launch: true }); ts.enter(); await tick(20); ok(ts.top1 === null, 'title: stale v1.0 #1 hidden while updating');
  // ネットワーク失敗は「不明」: OFFLINE 扱いで送信しない
  net.__setRelayUrl('https://relay.test'); handler = () => { throw new Error('down'); };
  ok(await net.relayBoardState() === 'unknown', 'network failure -> unknown (not unsupported)');
  calls.length = 0; const r2 = await R.WorldNet.submit({ name: 'A', score: 5, stage: 1, key: KEY }); ok(r2.ok === false && r2.error === 'offline' && calls.every((c2) => !/\/submit/.test(c2.url)), 'unknown: not submitted');
  const tabs2 = R.createRankTabs(); tabs2.mode = 'world'; await R.loadWorld(tabs2); ok(tabs2.status === 'offline', 'unknown -> OFFLINE');
  // 対応 Worker では送る
  net.__setRelayUrl('https://relay.test'); handler = () => ({ ok: true, status: 200, json: async () => ({ board: 'v1.1', top: [] }) });
  calls.length = 0; const r3 = await R.WorldNet.submit({ name: 'A', score: 5, stage: 1, key: KEY }); ok(r3.ok === true && calls.some((c2) => /\/submit$/.test(c2.url)), 'supported: submitted');
}

// ===== 6. PIN =====
{
  net.__setRelayUrl('https://relay.test');
  // 6a net の応答 → エラー対応
  const respond = (status, body) => { handler = () => ({ ok: status >= 200 && status < 300, status, json: async () => body }); };
  respond(403, { error: 'bad-pin' }); let r = await net.loginWithPin('A', '1234', KEY); ok(r.error === 'bad-pin' && R.pinErrorMessage(r) === 'WRONG PIN', 'bad-pin -> WRONG PIN');
  respond(429, { error: 'locked', retryAfter: 900 }); r = await net.loginWithPin('A', '1234', KEY); ok(r.error === 'locked' && r.retryAfter === 900 && R.pinErrorMessage(r) === 'LOCKED — TRY IN 15 MIN', 'locked -> minutes from retryAfter');
  respond(429, { error: 'locked', scope: 'name', retryAfter: 40000 }); r = await net.loginWithPin('A', '1234', KEY); ok(/LATER TODAY/.test(R.pinErrorMessage(r)), 'daily name lock -> later today');
  respond(503, { error: 'pin-disabled' }); r = await net.setPin('A', KEY, '1234'); ok(R.pinErrorMessage(r) === 'PIN NOT AVAILABLE YET', 'pin-disabled -> NOT AVAILABLE YET');
  respond(404, { error: 'not found' }); r = await net.setPin('A', KEY, '1234'); ok(R.pinErrorMessage(r) === 'PIN NOT AVAILABLE YET', 'old relay (404 not found) -> NOT AVAILABLE YET');
  respond(429, { error: 'rate', retryAfter: 120 }); r = await net.loginWithPin('A', '1234', KEY); ok(r.error === 'rate' && /WAIT 2 MIN/.test(R.pinErrorMessage(r)), 'rate message');
  respond(409, { error: 'no-pin' }); r = await net.loginWithPin('A', '1234', KEY); ok(R.pinErrorMessage(r) === 'THIS NAME HAS NO PIN', 'no-pin message');
  handler = () => { throw new Error('x'); }; r = await net.loginWithPin('A', '1234', KEY); ok(/OFFLINE/.test(R.pinErrorMessage(r)), 'network error -> OFFLINE');

  // 6b ログイン: 新しい鍵を保存、PIN は保存しない
  const ls = makeLS(); globalThis.localStorage = ls;
  const store = Storage;   // 実 Storage（接頭辞 lander11.）
  let seenLogin = null;
  R.PinNet.login = async (n, p, k) => { seenLogin = { n, p, k }; return { ok: true, name: n }; };
  const bad = await R.pinLoginAndAdopt(store, 'Neo', '12'); ok(!bad.ok && seenLogin === null, 'invalid PIN rejected client-side (no call)');
  for (const p of ['abcd', '1234567', '12 34', '']) ok(!(await R.pinLoginAndAdopt(store, 'Neo', p)).ok, 'invalid PIN: ' + JSON.stringify(p));
  const good = await R.pinLoginAndAdopt(store, 'Neo', '482913');
  const prof = R.loadProfiles(store).find((p) => p.name === 'Neo');
  ok(good.ok && prof && prof.key === seenLogin.k && /^[0-9a-f]{64}$/.test(prof.key), 'login success stores the newKey (hex) as this name\'s key');
  ok(R.getActiveProfile(store).name === 'Neo', 'adopted pilot is active');
  ok(![...ls.m.entries()].some(([k, v]) => v.includes('482913') || k.includes('482913')), 'PIN never stored in localStorage');
  R.PinNet.login = async () => ({ ok: false, error: 'bad-pin' });
  const fail1 = await R.pinLoginAndAdopt(store, 'Trin', '000000'); ok(!fail1.ok && fail1.msg === 'WRONG PIN' && !R.loadProfiles(store).some((p) => p.name === 'Trin'), 'failed login adds no profile');

  // 6c set / clear（実 net 経由でリクエスト形を確認）
  R.PinNet.login = (n, p, k) => net.loginWithPin(n, p, k); R.PinNet.set = (n, k, p) => net.setPin(n, k, p); R.PinNet.clear = (n, k) => net.clearPin(n, k);
  respond(200, { ok: true }); calls.length = 0;
  let s = await R.pinSetFor(store, 'Neo', '123456'); ok(s.ok && calls[0].url === 'https://relay.test/pin/set' && JSON.stringify(JSON.parse(calls[0].init.body)) === JSON.stringify({ name: 'Neo', key: prof.key, pin: '123456' }), 'pin/set request shape');
  calls.length = 0; s = await R.pinSetFor(store, 'Neo', '12'); ok(!s.ok && calls.length === 0, 'set: invalid PIN not sent');
  calls.length = 0; s = await R.pinClearFor(store, 'Neo'); ok(s.ok && calls[0].url === 'https://relay.test/pin/clear' && JSON.stringify(JSON.parse(calls[0].init.body)) === JSON.stringify({ name: 'Neo', key: prof.key }), 'pin/clear request shape');
  s = await R.pinSetFor(store, 'Ghost', '1234'); ok(!s.ok, 'set: unknown local pilot refused');
  respond(404, { error: 'unknown' }); s = await R.pinSetFor(store, 'Neo', '1234'); ok(s.msg === 'NAME NOT REGISTERED YET', 'unregistered name message');
  respond(503, { error: 'pin-disabled' }); s = await R.pinClearFor(store, 'Neo'); ok(s.msg === 'PIN NOT AVAILABLE YET', 'clear: pin-disabled message');
  ok(![...ls.m.values()].some((v) => v.includes('123456')), 'PIN (set) never stored');

  // 6d PIN 入力の状態機械（DOM 無し）
  let closed = null; const seen = [];
  const c = openPinEntry({ mode: 'login', name: 'Neo', onSubmit: async (pin) => { seen.push(pin); return pin === '111111' ? { ok: true, msg: 'WELCOME BACK' } : { ok: false, msg: 'WRONG PIN' }; }, onClose: (cc) => { closed = cc; } });
  ok(pinEntryOpen(c), 'pin entry opens');
  await c.submit('12'); ok(c.msg === 'PIN MUST BE 4-6 DIGITS' && seen.length === 0, 'validates before calling');
  await c.submit('222222'); ok(!c.ok && c.msg === 'WRONG PIN' && pinEntryOpen(c), 'wrong PIN keeps it open');
  await c.submit('111111'); ok(c.ok && c.msg === 'WELCOME BACK', 'right PIN -> ok');
  ok((() => { const j = JSON.stringify({ ...c, _timer: 0, _dom: null }); return !j.includes('111111') && !j.includes('222222'); })(), 'controller never holds the PIN');
  await tick(800); ok(!pinEntryOpen(c) && closed && closed.ok === true, 'auto-closes on success, onClose sees ok');
  hidePinEntry();

  // 6e 名前入力: 登録済み＋PIN あり → THIS IS MY NAME
  const st = new Map([['hudTipSeen', '1'], ['howtoSkip', '1']]); const ts = new TitleScene(makeEngine(st), noop, { launch: true });
  handler = (u) => /\/name/.test(u) ? { ok: true, status: 200, json: async () => ({ taken: true, hasPin: true }) } : { ok: true, status: 200, json: async () => ({}) };
  let out = await ts._onNameEntered('Cipher');
  ok(out && typeof out === 'object' && /ENTER PIN/.test(out.action.label) && /REGISTERED/.test(out.msg), 'taken + hasPin -> offer THIS IS MY NAME — ENTER PIN');
  handler = (u) => /\/name/.test(u) ? { ok: true, status: 200, json: async () => ({ taken: true, hasPin: false }) } : {};
  out = await ts._onNameEntered('Cipher'); ok(typeof out === 'string' && /CHOOSE ANOTHER/.test(out), 'taken without PIN -> unchanged message');
  ts.pendingStart = false; let started = 0; ts._startOrChoose = () => { started++; };
  ts.pendingStart = true;
  R.PinNet.login = async (n, p, k) => ({ ok: true, name: n });
  const pc = ts._openPinLogin('Cipher'); ok(pinEntryOpen(ts._pin), 'PIN login overlay opened for the name');
  ts.onInput('tap', { x: 180, y: 480, now: 0 }); ok(started === 0, 'title ignores input while PIN entry open');
  await pc.submit('654321'); await tick(800);
  ok(R.loadProfiles(ts.engine.storage).some((p) => p.name === 'Cipher') && ts.name === 'Cipher' && started === 1 && ts.pendingStart === false, 'PIN login success: pilot added, start continues');

  // 6f PILOTS 画面: PIN メニュー
  const st2 = new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['profiles', JSON.stringify([{ name: 'Neo', key: KEY }])], ['lastName', 'Neo']]);
  const t2 = new TitleScene(makeEngine(st2), noop, { launch: true }); t2.enter();
  handler = (u) => /\/name/.test(u) ? { ok: true, status: 200, json: async () => ({ taken: true, hasPin: true }) } : { ok: true, status: 200, json: async () => ({ ok: true }) };
  t2.onInput('tap', center(t2.changeBtn)); ok(t2.prof && t2.prof.mode === 'list', 'PILOTS opens');
  let rects = t2._profRects(); const cl = makeCtx(); t2.render(cl.ctx); ok(cl.rec.texts.includes('PIN'), 'list shows PIN button');
  ok(rects.rows[0].pin.x >= rects.rows[0].sel.x + rects.rows[0].sel.w && rects.rows[0].del.x >= rects.rows[0].pin.x + rects.rows[0].pin.w, 'select/PIN/DEL do not overlap');
  t2.onInput('tap', center(rects.rows[0].pin)); await tick();
  ok(t2.prof.mode === 'pin' && t2.prof.hasPin === true, 'PIN menu opened, hasPin read from /name');
  const c3 = makeCtx(); t2.render(c3.ctx); const all = c3.rec.texts.join('|');
  ok(all.includes('CHANGE PIN') && all.includes('REMOVE PIN') && /OTHER DEVICES/.test(all) && /REUSE A PASSWORD/.test(all), 'menu: CHANGE / REMOVE + warning note');
  calls.length = 0; rects = t2._profRects(); t2.onInput('tap', center(rects.prem)); await tick();
  ok(calls.some((c4) => /\/pin\/clear$/.test(c4.url)) && t2.prof.hasPin === false && t2.prof.msg === 'PIN REMOVED', 'REMOVE PIN calls /pin/clear');
  rects = t2._profRects(); const c5 = makeCtx(); t2.render(c5.ctx); ok(c5.rec.texts.includes('SET PIN') && !c5.rec.texts.includes('REMOVE PIN'), 'after removal: SET PIN only');
  t2.onInput('tap', center(rects.pset)); ok(pinEntryOpen(t2._pin) && t2._pin.mode === 'set', 'SET PIN opens the set form');
  await t2._pin.submit('1357'); await tick(800); ok(t2.prof.hasPin === true && t2.prof.msg === 'PIN SAVED', 'set success reflected in menu');
  t2.onInput('back'); ok(t2.prof.mode === 'list', 'back returns to list');
  // 通信失敗でも落ちない
  handler = () => { throw new Error('off'); }; t2.onInput('tap', center(t2._profRects().rows[0].pin)); await tick(); ok(t2.prof.mode === 'pin' && /OFFLINE/.test(t2.prof.msg), 'offline: menu still opens with message');
}

// ===== 7. WORLD ADMIN: PIN RESET =====
{
  net.__setRelayUrl('https://relay.test'); setDebug(true);
  const admin = { names: [{ name: 'AAA', first: '2026-01-02T00:00:00Z', best: null, hasPin: true }, { name: 'BBB', first: '2026-02-03T00:00:00Z', best: null, hasPin: false }] };
  handler = (u, init) => {
    const body = init && init.body ? JSON.parse(init.body) : null;
    if (/\/admin\/list/.test(u)) return { ok: true, status: 200, json: async () => ({ names: admin.names }) };
    if (/\/admin\/pin-reset/.test(u)) { admin.names = admin.names.map((n) => (n.name === body.name ? { ...n, hasPin: false } : n)); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const g = new Game(makeEngine(new Map([['hudTipSeen', '1'], ['howtoSkip', '1']]))); g.enter(); g._dbgPrev = 'play'; g.state = 'debug';
  g._askAdminKey = (cb) => cb('adminsecret');
  g.onInput('tap', center(g._adminBtnRect())); await tick(20);
  let Rr = g._adminRects(); ok(Rr.rows.length === 2 && Rr.rows[0].hasPin && !Rr.rows[1].hasPin, 'admin rows know hasPin');
  ok(!(Rr.rows[0].pin.x < Rr.rows[0].del.x + Rr.rows[0].del.w && Rr.rows[0].del.x < Rr.rows[0].pin.x + Rr.rows[0].pin.w), 'PIN RESET and DEL do not overlap');
  const cx = makeCtx(); g.render(cx.ctx); ok(cx.rec.texts.includes('PIN RESET'), 'PIN RESET button drawn');
  g.onInput('tap', center(Rr.rows[1].pin)); ok(!g._admin.confirm, 'no PIN -> button inert');
  g.onInput('tap', center(Rr.rows[0].pin)); ok(g._admin.confirm === 'AAA' && g._admin.confirmKind === 'pin', 'PIN RESET asks confirmation');
  const cy = makeCtx(); g.render(cy.ctx); ok(cy.rec.texts.some((t) => /RESET PIN OF AAA/.test(t)) && cy.rec.texts.includes('CONFIRM RESET'), 'confirm text');
  g.onInput('tap', center(g._adminConfirmRects().no)); ok(g._admin.confirm === null, 'cancel');
  calls.length = 0; g.onInput('tap', center(Rr.rows[0].pin)); g.onInput('tap', center(g._adminConfirmRects().yes)); await tick(30);
  const pc = calls.find((c) => /\/admin\/pin-reset$/.test(c.url));
  ok(pc && pc.init.headers['X-Admin-Key'] === 'adminsecret' && JSON.parse(pc.init.body).name === 'AAA', 'pin-reset sent with admin header and name');
  ok(g._admin.names.find((n) => n.name === 'AAA').hasPin === false && /PIN RESET: AAA/.test(g._admin.msg), 'list refreshed, message shown');
  ok(!calls.some((c) => /\/admin\/delete/.test(c.url)), 'did not delete');
  setDebug(false);
}

net.__setRelayUrl('');
console.log(`p12v11: ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
