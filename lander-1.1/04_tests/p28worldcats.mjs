// p28worldcats — 追加ランキング（ゲーム側）: EXPEDITION 最速タイムの送信と、タイトルの WORLD に種類の切り替え（ALL / WEEK / STAGE / EXPEDITION）。
// 実行: node 04_tests/p28worldcats.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
const noop = () => {};
globalThis.window = { addEventListener: noop, removeEventListener: noop };
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });

const { setDebug } = await import('../02_src/debug.js');
const net = await import('../02_src/net.js');
const R = await import('../02_src/ranking.js');
const XD = await import('../02_src/expdata.js');
const { EXP_IDS, EXP_MISSIONS } = await import('../02_src/expedition/index.js');
const { ExpeditionScene } = await import('../02_src/expscene.js');
const { TitleScene } = await import('../02_src/title.js');
const { W } = await import('../02_src/core/engine.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const flush = async () => { for (let i = 0; i < 20; i++) await Promise.resolve(); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function makeCtx() {
  const rec = { texts: [] };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s) => { rec.texts.push(String(s)); };
      return k in t ? t[k] : noop;
    }, set: (t, k, v) => { t[k] = v; return true; } });
  ctx.rec = rec; return ctx;
}
function makeEngine(store) {
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'podAppear']) sfx[n] = noop;
  return { ctx: makeCtx(), canvas: { style: {} },
    music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const KEY = 'a'.repeat(64);
const prof = (n, key = KEY) => new Map([['profiles', JSON.stringify([{ name: n, key }])], ['activeProfile', n], ['lastName', n], ['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1']]);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, t0: clock + 1 });

setDebug(false); net.__setRelayUrl('https://relay.invalid');
const sent = []; let resp = () => ({ ok: true, status: 200 });
R.WorldNet.submitXp = async (e) => { sent.push(e); return resp(e); };
const fetched = []; let boardResp = (b) => ({ board: b, top: [] });
R.WorldNet.fetchBoard = async (b) => { fetched.push(b); return boardResp(b); };
R.WorldNet.fetchTop = async () => [{ name: 'TOP', score: 999, stage: 9 }];
XD.__xpRetryMs(5);

// ===== 1. 一覧が中継・ミッション一覧と揃っている =====
{
  ok(R.XB_XP.map((x) => x.id).join() === EXP_IDS.join(), 'ranking XB_XP ids match expedition/index.js');
  ok(R.XB_XP.every((x, i) => x.name === EXP_MISSIONS[i].name), 'ranking XB_XP names match');
  const wsrc = fs.readFileSync(new URL('../../lander/06_server/ranking-worker.js', import.meta.url), 'utf8');
  const m = /const XP_IDS = \[([^\]]*)\]/.exec(wsrc);
  ok(m && m[1].replace(/['\s]/g, '') === EXP_IDS.join(), 'worker XP_IDS match');
  ok(/XP_MIN_T = 5, XP_MAX_T = 1800/.test(wsrc) && XD.XP_T_MIN === 5 && XD.XP_T_MAX === 1800, 'time limits match the worker');
}

// ===== 2. 送るべきタイム =====
{
  const s = prof('AAA'), st = makeEngine(s).storage, store = XD.xpStore(st, 'AAA', 'ryugu');
  ok(XD.xpPendingTime(st, 'AAA', 'ryugu') === null, 'no best time → nothing to send');
  store.set('besttime', '42.37'); ok(XD.xpPendingTime(st, 'AAA', 'ryugu') === 42.37, 'best time → pending');
  store.set('wsent', '42.37'); ok(XD.xpPendingTime(st, 'AAA', 'ryugu') === null, 'already sent → nothing');
  store.set('besttime', '40'); ok(XD.xpPendingTime(st, 'AAA', 'ryugu') === 40, 'faster than sent → pending');
  store.set('besttime', '3'); store.set('wsent', ''); ok(XD.xpPendingTime(st, 'AAA', 'ryugu') === null, 'below the relay minimum → not sent');
}

// ===== 2b. 得点も一緒に送る =====
{
  const s = prof('SCR'), st = makeEngine(s).storage, store = XD.xpStore(st, 'SCR', 'ryugu');
  store.set('besttime', '40'); store.set('best', JSON.stringify({ score: 2600, stars: [true, true, false] }));
  let pd = XD.xpPending(st, 'SCR', 'ryugu'); ok(pd && pd.time === 40 && pd.score === 2600, 'pending carries time and score');
  sent.length = 0; await XD.xpWorldSend(st, 'ryugu');
  ok(sent.length === 1 && sent[0].time === 40 && sent[0].score === 2600 && store.get('wsentS') === '2600', 'sends score with time, remembers it');
  ok(XD.xpPending(st, 'SCR', 'ryugu') === null, 'nothing pending after send');
  store.set('best', JSON.stringify({ score: 2900, stars: [true, true, true] }));
  pd = XD.xpPending(st, 'SCR', 'ryugu'); ok(pd && pd.time === 40 && pd.score === 2900, 'better score alone → pending (time resent as is)');
  store.set('best', JSON.stringify({ score: 99999, stars: [true, true, true] })); ok(XD.xpBestScore(st, 'SCR', 'ryugu') === null, 'score above the relay cap ignored');
}

// ===== 3. xpWorldSend =====
{
  sent.length = 0;
  const s = prof('AAA'), st = makeEngine(s).storage, store = XD.xpStore(st, 'AAA', 'phobos');
  store.set('besttime', '55.5');
  let r = await XD.xpWorldSend(st, 'phobos');
  ok(r && r.ok && sent.length === 1 && sent[0].name === 'AAA' && sent[0].key === KEY && sent[0].mission === 'phobos' && sent[0].time === 55.5, 'sends name, key, mission, time');
  ok(store.get('wsent') === '55.5', 'remembers what was sent');
  ok(XD.xpWorldSend(st, 'phobos') === null && sent.length === 1, 'not resent');
  // 失敗したら覚えない
  store.set('besttime', '50'); resp = () => ({ ok: false, status: 502 });
  await XD.xpWorldSend(st, 'phobos'); ok(sent.length === 2 && store.get('wsent') === '55.5', 'failure: not marked sent');
  // 429 は1回だけ再送
  let n = 0; resp = () => (++n === 1 ? { ok: false, status: 429 } : { ok: true, status: 200 });
  r = await XD.xpWorldSend(st, 'phobos'); ok(n === 2 && r.ok && store.get('wsent') === '50', '429 → one resend, then marked');
  resp = () => ({ ok: true, status: 200 });
  // 送らない条件
  const s2 = new Map([['profiles', JSON.stringify([{ name: 'NOKEY' }])], ['activeProfile', 'NOKEY']]), st2 = makeEngine(s2).storage;
  XD.xpStore(st2, 'NOKEY', 'ryugu').set('besttime', '30'); ok(XD.xpWorldSend(st2, 'ryugu') === null, 'no device key → not sent');
  const s3 = prof('DBG'), st3 = makeEngine(s3).storage; XD.xpStore(st3, 'DBG', 'ryugu').set('besttime', '30');
  setDebug(true); ok(XD.xpWorldSend(st3, 'ryugu') === null, 'debug → not sent'); setDebug(false);
  net.__setRelayUrl(''); ok(XD.xpWorldSend(st3, 'ryugu') === null, 'relay off → not sent'); net.__setRelayUrl('https://relay.invalid');
  // 同時に2回呼んでも1回
  sent.length = 0; const a = XD.xpWorldSend(st3, 'ryugu'), b = XD.xpWorldSend(st3, 'ryugu'); await a;
  ok(b === null && sent.length === 1, 'in-flight guard');
}

// ===== 4. 取りこぼしの送信（タイトルに戻った時、1件だけ）=====
{
  sent.length = 0;
  const s = prof('BBB'), st = makeEngine(s).storage;
  XD.xpStore(st, 'BBB', 'enceladus').set('besttime', '70'); XD.xpStore(st, 'BBB', '67p').set('besttime', '90');
  await XD.xpWorldBackfill(st); ok(sent.length === 1 && sent[0].mission === 'enceladus', 'backfill sends one (first pending)');
  await XD.xpWorldBackfill(st); ok(sent.length === 2 && sent[1].mission === '67p', 'next visit sends the next');
  ok(XD.xpWorldBackfill(st) === null, 'nothing left');
  // タイトルの enter で呼ばれる
  sent.length = 0; XD.xpStore(st, 'BBB', 'ryugu').set('besttime', '33');
  const t = new TitleScene(makeEngine(s), noop, { launch: false }); t.enter(); await flush(); await sleep(10);
  ok(sent.some((e) => e.mission === 'ryugu' && e.time === 33), 'title enter → backfill');
}

// ===== 5. ミッションの成功（MISSION）で送る。練習は送らない =====
{
  sent.length = 0;
  const s = prof('CCC'); const e = makeEngine(s);
  const sc = new ExpeditionScene(e, 'ryugu', noop); sc.enter();
  const sh = sc.lab.shell;
  sh.sess.mode = 'practice'; sh.complete({ t: 41.2, base: 100, fuel: 1 }, [true, false, false]); await flush();
  ok(sent.length === 0, 'practice clear → not sent');
  sh.sess.mode = 'mission'; sh.sess.lives = 3; const f = sh.complete({ t: 44.4, base: 100, fuel: 1 }, [true, true, false]); await flush(); await sleep(10);
  ok(f && f.newBestTime && sent.length === 1 && sent[0].mission === 'ryugu' && sent[0].time === 44.4 && sent[0].name === 'CCC', 'mission clear with a new best → sent');
  sh.complete({ t: 50, base: 100, fuel: 1 }, [true, true, false]); await flush(); await sleep(10);
  ok(sent.length === 1, 'slower clear with a lower score → not sent');
  sh.complete({ t: 60, base: 2300, fuel: 1 }, [true, true, true]); await flush(); await sleep(10);
  ok(sent.length === 2 && sent[1].time === 44.4 && sent[1].score > 1000, 'slower clear with a higher score → sent (best time, best score)');
  sc.exit();
}

// ===== 5b. 寄り道で成功 → onWin（1回だけ）。練習・ツアー外では呼ばない =====
{
  let wins = 0;
  const e = makeEngine(prof('DTR'));
  const sc = new ExpeditionScene(e, 'phobos', noop, { detour: true, onWin: () => { wins++; } }); sc.enter();
  const sh = sc.lab.shell;
  sh.sess.mode = 'practice'; sh.complete({ t: 41, base: 100, fuel: 1 }, [true, false, false]); ok(wins === 0, 'practice → no reward');
  sh.sess.mode = 'mission'; sh.sess.lives = 3; sh.complete({ t: 41, base: 100, fuel: 1 }, [true, false, false]); ok(wins === 1, 'detour mission clear → onWin');
  sh.complete({ t: 40, base: 100, fuel: 1 }, [true, false, false]); ok(wins === 1, 'only once per detour');
  sc.exit();
  let w2 = 0; const sc2 = new ExpeditionScene(makeEngine(prof('DTR')), 'phobos', noop, { onWin: () => { w2++; } }); sc2.enter();
  sc2.lab.shell.sess.mode = 'mission'; sc2.lab.shell.complete({ t: 41, base: 100, fuel: 1 }, [true, false, false]); ok(w2 === 0, 'from the map (not a detour) → no reward'); sc2.exit();
}

// ===== 5c. ゲーム側: 寄り道の成功で CONTINUE +1（ランごと・同じ寄り道で1回）と帯の表示 =====
{
  const { Game } = await import('../02_src/game.js');
  const e = makeEngine(prof('GFT')); e.pods = true;
  let detourId = null; e.toDetour = (id) => { detourId = id; };
  const g = new Game(e); g.enter();
  const c0 = g.continues;
  g._suspended = true; g._detourWin('ryugu'); g._detourWin('ryugu');
  ok(g.continues === c0 + 1, 'detour win → +1 continue, only once: ' + c0 + ' -> ' + g.continues);
  ok(g.totalScore === 0, 'score unchanged');
  g.enter();   // 寄り道から戻る（_suspended → 再開だけ）
  ok(g.continues === c0 + 1 && g._giftT > 0, 'kept after returning, banner pending');
  const cx = makeCtx(); g.render(cx); ok(cx.rec.texts.includes('+1 CONTINUE'), 'banner drawn after return');
  for (let i = 0; i < 300; i++) g.update(1 / 60);
  ok(g._giftT === 0, 'banner fades out');
  const cy = makeCtx(); g.render(cy); ok(!cy.rec.texts.includes('+1 CONTINUE'), 'banner gone');
  g.exit(); g.enter(); ok(g.continues === c0 && g._giftFor === null, 'new run resets');
}

// ===== 6. タイトルの WORLD: 種類の切り替え =====
{
  fetched.length = 0;
  const tabs = R.createRankTabs({ cats: true });
  const X = 32, Y = 130, Wd = W - 64;
  const tap = (r) => R.rankTabsTap(tabs, X, Y, r.x + r.w / 2, r.y + r.h / 2, Wd, null);
  const tr = R.rankTabRects(X, Y, Wd), cr = R.rankCatRects(X, Y, Wd);
  ok(!(cr.all.y < tr.world.y + tr.world.h), 'category chips sit below the LOCAL / WORLD tabs');
  ok(cr.xp.x + cr.xp.w <= X + Wd + 0.5, 'chips fit the panel width');
  ok(!tap(cr.week), 'chips inactive while LOCAL');
  ok(tap(tr.world) && tabs.mode === 'world' && tabs.cat === 'all', 'WORLD opens ALL');
  await flush();
  ok(tap(cr.week) && tabs.cat === 'week' && fetched.at(-1) === 'v1.1-week', 'WEEK loads v1.1-week');
  ok(tap(cr.reach) && tabs.cat === 'reach' && fetched.at(-1) === 'v1.1-reach', 'STAGE loads v1.1-reach');
  ok(tap(cr.xp) && tabs.cat === 'xp' && tabs.xpi === 0 && fetched.at(-1) === 'xp-ryugu', 'EXPEDITION chip loads xp-ryugu');
  ok(tap(cr.xp) && tabs.xpi === 1 && fetched.at(-1) === 'xp-phobos', 'tap again → next mission');
  tap(cr.xp); tap(cr.xp); ok(fetched.at(-1) === 'xp-67p', '… up to 67P');
  tap(cr.xp); ok(tabs.xpi === 4 && fetched.at(-1) === 'xp-total' && R.rankCatLabel(tabs, 'xp') === 'TOTAL \u203a', 'after 67P → TOTAL');
  tap(cr.xp); ok(tabs.xpi === 0 && R.rankCatBoard(tabs) === 'xp-ryugu', 'wraps to RYUGU');
  const nf = fetched.length; tap(cr.week); ok(fetched.length === nf, 'already loaded board is not refetched');
  // 描画
  boardResp = (b) => b === 'v1.1-week' ? { board: b, week: '2026-11-09', resetAt: Date.now() + (2 * 24 + 5) * 3600e3 + 60e3, last: { name: 'OLD1', score: 4321 }, top: [{ name: 'WK', score: 1500, stage: 4, title: 'ACE' }] }
    : b === 'v1.1-reach' ? { board: b, top: [{ name: 'DEEP', score: 300, stage: 12 }] }
    : b === 'xp-total' ? { board: b, missions: 4, top: [{ name: 'SUM', total: 11234, n: 3 }, { name: 'BADT', total: 'x', n: 1 }] }
    : { board: b, top: [{ name: 'FAST', time: 42.4 }, { name: 'BAD', time: 'x' }] };
  for (const k of Object.keys(tabs.extra)) delete tabs.extra[k];
  const draw = async (cat) => { tabs.cat = cat; if (cat !== 'all') await R.loadCat(tabs); const c = makeCtx(); R.drawRankPanel(null, c, tabs, [], X, Y, Wd, -1); return c.rec.texts; };
  let tx = await draw('week');
  ok(tx.includes('WK') && tx.includes('1500') && tx.includes('ACE') && tx.some((t) => /THIS WEEK .*RESETS IN 2D 05H/.test(t)) && tx.some((t) => /LAST WEEK #1 +OLD1 +4321/.test(t)), 'WEEK: rows, reset countdown, last week champion: ' + JSON.stringify(tx.filter((t) => /WEEK/.test(t))));
  ok(['ALL', 'WEEK', 'STAGE'].every((l) => tx.includes(l)) && tx.some((t) => /^RYUGU/.test(t)), 'chip labels drawn');
  tx = await draw('reach'); ok(tx.includes('ST.12') && tx.includes('300') && tx.includes('DEEPEST STAGE REACHED'), 'STAGE: stage as the main number');
  tabs.xpi = 0; tx = await draw('xp'); ok(tx.includes('FAST') && tx.includes('00:42.4') && !tx.includes('BAD'), 'EXPEDITION: time as mm:ss.s, invalid rows dropped');
  tabs.xpi = 4; tx = await draw('xp'); ok(tx.includes('SUM') && tx.includes('11234') && tx.includes('3/4') && !tx.includes('BADT') && tx.some((t) => /BEST SCORE OF EACH MISSION/.test(t)), 'TOTAL: total, missions counted, note');
  tabs.xpi = 0;
  tx = await draw('all'); ok(tx.includes('ALL-TIME BEST SCORE'), 'ALL drawn with note');
  // 旧中継・オフライン
  boardResp = () => null; R.WorldNet.updating = true; tabs.xpi = 1; tx = await draw('xp'); ok(tx.includes('WORLD: UPDATING'), 'old relay → UPDATING');
  R.WorldNet.updating = false; tabs.xpi = 2; tx = await draw('xp'); ok(tx.includes('OFFLINE'), 'no response → OFFLINE');
  // 種類なしのタブ（ゲームオーバー）は従来どおり
  const plain = R.createRankTabs(); plain.mode = 'world'; plain.status = 'ok'; plain.world = [{ name: 'P', score: 5, stage: 1 }];
  const c = makeCtx(); R.drawRankPanel(null, c, plain, [], X, 146, Wd, -1);
  ok(!c.rec.texts.includes('WEEK') && c.rec.texts.includes('P'), 'game-over panel: no category chips');
}

// ===== 7. net.fetchBoard: 旧中継（400）を区別 =====
{
  const real = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 400, json: async () => ({ error: 'invalid' }) });
  ok((await net.fetchBoard('v1.1-week')).old === true, 'fetchBoard: 400 → old relay');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ board: 'v1.1-week', top: [] }) });
  ok(Array.isArray((await net.fetchBoard('v1.1-week')).top), 'fetchBoard: ok');
  globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ board: 'v1.1', top: [] }) });
  ok((await net.fetchBoard('v1.1-week')) === null, 'fetchBoard: wrong board → null');
  let body = null; globalThis.fetch = async (u, init) => { body = { u, b: JSON.parse(init.body) }; return { ok: true, status: 200, json: async () => ({ ok: true, best: true }) }; };
  const r = await net.submitXpTime({ name: 'A', key: KEY, mission: 'ryugu', time: 40 });
  ok(r.ok && r.best === true && /\/xp$/.test(body.u) && body.b.mission === 'ryugu' && body.b.time === 40 && body.b.key === KEY, 'submitXpTime posts to /xp');
  globalThis.fetch = real;
}

net.__setRelayUrl('');
console.log(`p28worldcats: ${pass}/${pass + fail} ${fail ? 'FAIL' : 'PASS'}`);
process.exit(fail ? 1 : 0);
