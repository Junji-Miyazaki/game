// P4 保存と再開 / パイロットプロフィール / WORLD ADMIN / PUBLIC BETA。実行: node 04_tests/p4save.mjs
import { Game } from '../02_src/game.js';
import { TitleScene, nameOverlayOpen, hideNameOverlay } from '../02_src/title.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { loadRanking, saveRanking, recordEntry, loadCheckpoint, loadProfiles, getActiveProfile, getPlayerName } from '../02_src/ranking.js';
import { W } from '../02_src/core/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });

// ---- 偽サーバー（fetch スタブ）----
const srv = { taken: new Set(), calls: [], offline: false, admin: 'secret', names: [{ name: 'AAA', first: '2026-01-02T00:00:00Z', best: { score: 900, stage: 4, date: 'x' } }, { name: 'BBB', first: '2026-02-03T00:00:00Z', best: null }], deleteStatus: 200 };
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
globalThis.fetch = async (url, init) => {
  const u = String(url), path = u.replace('https://relay.test', '').split('?')[0];
  srv.calls.push({ path, init, url: u });
  if (srv.offline) throw new Error('offline');
  const hdr = (init && init.headers) || {};
  if (path === '/name') return res(200, { taken: srv.taken.has(decodeURIComponent(u.split('n=')[1])) });
  if (path === '/submit') { const b = JSON.parse(init.body); return srv.taken.has('owned:' + b.name) ? res(403, {}) : res(200, {}); }
  if (path === '/delete') return res(srv.deleteStatus, {});
  if (path === '/admin/list') return hdr['X-Admin-Key'] === srv.admin ? res(200, { names: srv.names }) : res(401, {});
  if (path === '/admin/delete') { if (hdr['X-Admin-Key'] !== srv.admin) return res(401, {}); const n = JSON.parse(init.body).name; srv.names = srv.names.filter((x) => x.name !== n); return res(200, {}); }
  return res(404, {});
};
const tick = () => new Promise((r) => setTimeout(r, 15));

function makeCtx() {
  const st = { depth: 0 };
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, { get: (t, k) => k === 'save' ? () => { st.depth++; } : k === 'restore' ? () => { st.depth--; } : k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
}
function makeMusic() { const log = []; const rec = (n) => () => { log.push(n); }; return { log, attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: rec('uiTap') } }; }
function makeEngine(store) {
  store = store || new Map([['hudTipSeen', '1']]);
  return { music: makeMusic(), audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store };
}
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tapAt = (s, p) => { clock += 10; s.onInput('tap', { x: p.x, y: p.y, t0: clock - 50 }); };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const cpOf = (e) => loadCheckpoint(e.storage);
const holdRoundTrip = (g, id) => { tapAt(g, center(g._holdRect())); run(g, 0.4); const b = g._holdButtons(); tapAt(g, center(b.find((x) => x.id === id))); };
const renderOK = (s) => { try { s.render(makeCtx()); return true; } catch (e) { console.log('render threw', e); return false; } };
setDebug(false); __setRelayUrl('');

// ===== A. チェックポイント =====
{
  const e = makeEngine(); const g = new Game(e); g.enter();
  let cp = cpOf(e);
  ok(cp && cp.stage === 1 && cp.totalScore === 0 && cp.continues === 3 && cp.runId === g.runId && cp.v === 1 && cp.savedAt, 'saved at stage 1 start');
  g.totalScore = 700; g.stage = 2; g._initStage();
  cp = cpOf(e); ok(cp.stage === 2 && cp.totalScore === 700, 'saved at each stage start with score');
  g.modules.stab = 1; g.stage = 3; g._initStage(); ok(cpOf(e).modules.stab === 1, 'modules saved');
  // ボーナス: 次のステージを保存
  g.stage = 3; g.bonus = { type: 'MOVING_PAD', afterStage: 3 }; g._initStage();
  ok(cpOf(e).stage === 4, 'bonus pending -> saves the following stage (' + cpOf(e).stage + ')');
  g.bonus = null; g.stage = 4; g.continues = 2; g._initStage(); ok(cpOf(e).continues === 2, 'continue count saved');
  // 本当のゲームオーバーで破棄 (残機切れ)
  g.continues = 0; g._doCrash('X'); ok(g.state === 'gameover' && cpOf(e) === null, 'true game over clears checkpoint');
  // GIVE UP
  const g2 = new Game(e); g2.enter(); g2._doCrash('X'); ok(g2.state === 'crashed' && cpOf(e) !== null, 'crash with continues keeps checkpoint');
  run(g2, 0.6); const gu = g2._giveUpRect(); tapAt(g2, center(gu)); ok(g2.state === 'gameover' && cpOf(e) === null, 'GIVE UP clears checkpoint');
  // ABORT は保持
  const g3 = new Game(e); g3.enter(); g3.totalScore = 321; run(g3, 0.5); holdRoundTrip(g3, 'abort'); run(g3, 0.4); const cf = g3._holdButtons().find((x) => x.id === 'confirm'); tapAt(g3, center(cf));
  ok(g3.state === 'gameover', 'abort -> gameover');
  cp = cpOf(e); ok(cp && cp.totalScore === 321 && cp.runId === g3.runId, 'abort keeps and updates checkpoint');
  // デバッグは保存しない
  const e2 = makeEngine(); setDebug(true); const gd = new Game(e2); gd.enter(); gd.stage = 2; gd._initStage();
  ok(cpOf(e2) === null, 'debug mode never saves'); setDebug(false);
  const gt = new Game(e2); gt.enter(); ok(cpOf(e2) !== null, 'normal run saves'); gt._dbgTainted = true; gt.totalScore = 55; gt.stage = 5; gt._initStage(); ok(cpOf(e2).stage === 1, 'tainted run stops saving');
  // 壊れた値
  const e3 = makeEngine(); e3.storage.set('checkpoint', '{bad'); ok(cpOf(e3) === null, 'corrupt checkpoint ignored');
  e3.storage.set('checkpoint', JSON.stringify({ v: 1, runId: 'r', stage: -3, totalScore: 1, continues: 1, modules: {} })); ok(cpOf(e3) === null, 'invalid stage ignored');
}

// ===== A. 再開 =====
{
  const e = makeEngine(); const g = new Game(e); g.enter();
  g.totalScore = 4200; g.stage = 7; g.continues = 1; g.modules.stab = 2; g.modules.shield = 1; g._initStage();
  const cp = cpOf(e), rid = g.runId;
  e.resumeCheckpoint = cp;
  const r = new Game(e); r.enter();
  ok(r.stage === 7 && r.totalScore === 4200 && r.continues === 1 && r.runId === rid && r.modules.stab === 2 && r.modules.shield === 1 && r.state === 'play', 'resume restores stage/score/continues/modules/runId');
  ok(e.resumeCheckpoint === null, 'resume token consumed');
  const n = new Game(e); n.enter(); ok(n.stage === 1 && n.totalScore === 0 && n.runId !== rid && n.continues === 3, 'next game without token is a fresh run');
  ok(renderOK(r), 'resumed game renders');
}

// ===== A. runId ランキング =====
{
  const e = makeEngine(); saveRanking(e.storage, [{ name: 'OLD', score: 500, stage: 2, date: '2026-01-01T00:00:00Z' }]);
  const g = new Game(e); g.enter(); g.totalScore = 1000; g.stage = 3; run(g, 0.3); holdRoundTrip(g, 'abort'); run(g, 0.4); tapAt(g, center(g._holdButtons().find((x) => x.id === 'confirm')));
  let l = loadRanking(e.storage); ok(l.length === 2 && l[0].runId === g.runId && l[0].score === 1000, 'abort recorded one row with runId');
  e.resumeCheckpoint = cpOf(e);
  const r = new Game(e); r.enter(); ok(r.runId === g.runId, 'resumed same runId'); r.totalScore = 2500; r.stage = 5; r.continues = 0; r.fuel = 0; r._doCrash('X');
  l = loadRanking(e.storage); ok(l.length === 2 && l.filter((x) => x.runId === g.runId).length === 1 && l[0].score === 2500 && l[0].stage === 5, 'resumed run UPDATES its row (no duplicate)');
  e.resumeCheckpoint = null;
  const low = new Game(e); low.enter(); low.runId = g.runId; low.totalScore = 100; low.continues = 0; low.fuel = 0; low._doCrash('X');
  l = loadRanking(e.storage); ok(l.length === 2 && l.find((x) => x.runId === g.runId).score === 2500, 'lower score does not overwrite');
  ok(l.some((x) => x.name === 'OLD' && !x.runId), 'old rows without runId untouched');
  const l2 = recordEntry([{ name: 'a', score: 5, stage: 1, date: 'd' }], { name: 'b', score: 5, stage: 1, date: 'd2' }); ok(l2.length === 2, 'recordEntry without runId appends');
}

// ===== C'. プロフィール =====
{
  // 移行
  const e = makeEngine(); e.storage.set('lastName', 'みや');
  const l = loadProfiles(e.storage);
  ok(l.length === 1 && l[0].name === 'みや' && l[0].key.length >= 32, 'migration: lastName -> profile with fresh key');
  ok(loadProfiles(e.storage)[0].key === l[0].key, 'migration stable (same key on reload)');
  const t = new TitleScene(e, noop, { launch: false }); t.enter();
  ok(t.name === 'みや', 'title shows migrated pilot');
  // 追加フロー
  __setRelayUrl('https://relay.test'); srv.calls.length = 0;
  let r = await t._onNameEntered('Neo'); ok(r === null && loadProfiles(e.storage).length === 2 && t.name === 'Neo', 'add pilot (not taken)');
  ok(srv.calls.some((c) => c.path === '/name'), 'checkName called');
  srv.taken.add('Zed'); r = await t._onNameEntered('Zed'); ok(r === 'NAME ALREADY REGISTERED — CHOOSE ANOTHER' && loadProfiles(e.storage).length === 2, 'taken -> inline message, no profile');
  srv.offline = true; r = await t._onNameEntered('Zed'); ok(r === null && loadProfiles(e.storage).length === 3, 'offline check -> allowed'); srv.offline = false;
  r = await t._onNameEntered('Four'); ok(r === 'MAX 3 PILOTS' && loadProfiles(e.storage).length === 3, 'limit 3');
  r = await t._onNameEntered('   '); ok(r === 'ENTER A NAME', 'empty rejected');
  r = await t._onNameEntered('neo'); ok(typeof r !== 'string' || r === 'MAX 3 PILOTS', 'case differs = different name (hits limit, not treated as Neo)');
  // 選択
  t.prof = { mode: 'list', target: '', msg: '', busy: false };
  let R = t._profRects(); tapAt(t, center(R.rows.find((x) => x.name === 'みや').sel));
  ok(t.name === 'みや' && getActiveProfile(e.storage).name === 'みや' && getPlayerName(e.storage) === 'みや', 'select pilot -> active');
  ok(R.add.off === true, 'ADD disabled at 3');
  ok(renderOK(t), 'profile panel renders');
  // 削除: 通信失敗 -> 残る
  srv.offline = true; srv.calls.length = 0;
  tapAt(t, center(R.rows.find((x) => x.name === 'Neo').del)); ok(t.prof.mode === 'confirm' && t.prof.target === 'Neo', 'delete asks confirmation');
  ok(renderOK(t), 'confirm renders');
  tapAt(t, center(R.yes)); await tick();
  ok(loadProfiles(e.storage).length === 3 && /OFFLINE/.test(t.prof.msg), 'delete offline: profile kept, message "' + t.prof.msg + '"');
  srv.offline = false;
  tapAt(t, center(R.yes)); await tick();
  const del = srv.calls.find((c) => c.path === '/delete');
  ok(del && JSON.parse(del.init.body).name === 'Neo' && JSON.parse(del.init.body).key.length >= 32, 'deleteName called with name+key');
  ok(loadProfiles(e.storage).length === 2 && !loadProfiles(e.storage).some((p) => p.name === 'Neo'), 'delete success removes profile');
  // ローカルランキングは消えない
  saveRanking(e.storage, [{ name: 'Neo', score: 9, stage: 1, date: 'd' }]);
  t.prof.mode = 'confirm'; t.prof.target = 'Zed'; srv.deleteStatus = 404; await t._deletePilot('Zed'); srv.deleteStatus = 200;
  ok(loadProfiles(e.storage).length === 1 && loadRanking(e.storage).length === 1, 'server "unknown" -> removed locally; local ranking rows kept');
  // 現在のパイロットを削除 -> 残りが有効
  await t._deletePilot('みや'); ok(loadProfiles(e.storage).length === 0 && t.name === '', 'deleting last pilot -> no name');
  ok(getPlayerName(e.storage) === '', 'lastName cleared');
  __setRelayUrl('');
}
// 世界送信は有効プロフィールの name+key
{
  const e = makeEngine(); e.storage.set('lastName', 'ZED'); const key = loadProfiles(e.storage)[0].key;
  __setRelayUrl('https://relay.test'); srv.calls.length = 0;
  const g = new Game(e); g.enter(); g.totalScore = 800; g.continues = 0; g.fuel = 0; g._doCrash('X'); await tick();
  const sub = srv.calls.find((c) => c.path === '/submit'); const b = sub && JSON.parse(sub.init.body);
  ok(b && b.name === 'ZED' && b.key === key && b.score === 800, 'submit carries active profile name + key');
  ok(g._worldNote === '', 'no note on success');
  srv.taken.add('owned:ZED'); const g2 = new Game(e); g2.enter(); g2.totalScore = 900; g2.continues = 0; g2.fuel = 0; g2._doCrash('X'); await tick();
  ok(g2._worldNote === 'WORLD: NAME OWNED BY ANOTHER DEVICE' && g2.state === 'gameover', 'name owned by another device -> small note, local flow intact');
  ok(renderOK(g2), 'gameover with note renders'); srv.taken.delete('owned:ZED');
  // デバッグは送らない
  srv.calls.length = 0; setDebug(true); const g3 = new Game(e); g3.enter(); g3.totalScore = 5; g3.continues = 0; g3._doCrash('X'); await tick(); setDebug(false);
  ok(!srv.calls.some((c) => c.path === '/submit'), 'debug run not submitted');
  __setRelayUrl('');
}

// ===== タイトルのボタン =====
{
  const e = makeEngine(); const t = new TitleScene(e, noop, { launch: false }); t.enter();
  ok(renderOK(t), 'title renders without checkpoint');
  const g = new Game(e); g.enter(); g.stage = 8; g.totalScore = 3300; g._initStage();
  const e2 = e; const t2 = new TitleScene(e2, noop, { launch: false }); t2.name = 'KAI'; t2.enter(); t2.name = 'KAI';
  ok(!!t2.cp && t2.cp.stage === 8, 'title sees checkpoint');
  ok(renderOK(t2), 'title with CONTINUE/NEW renders');
  const A = { mute: t2.muteBtn, logo: t2.logoBox, beta: t2.betaBox, pilots: t2.changeBtn, rank: t2.rankBtn };
  const sets = [Object.assign({ start: t2.startBtn }, A), Object.assign({ cont: t2.continueBtn, neu: t2.newBtn }, A)];
  let bad = 0;
  for (const set of sets) { const k = Object.keys(set); for (let i = 0; i < k.length; i++) for (let j = i + 1; j < k.length; j++) if (k[i] !== 'logo' && k[j] !== 'logo' || true) { if (overlap(set[k[i]], set[k[j]])) { bad++; console.log('overlap', k[i], k[j]); } } }
  ok(bad === 0, 'no title tap-target overlap (START set and CONTINUE/NEW set)');
  ok(t2.continueBtn.h >= 44 && t2.newBtn.h >= 32 && t2.betaBox.y >= t2.logoBox.y + t2.logoBox.h, 'sizes ok; beta tag below logo box');
  // 開始待ちの CONTINUE
  let started = 0; t2.startGame = () => started++;
  tapAt(t2, { x: 180, y: 600 }); ok(started === 0 && !t2.launch, 'tap elsewhere does not start while checkpoint exists');
  tapAt(t2, center(t2.continueBtn)); ok(started === 1 && e.resumeCheckpoint && e.resumeCheckpoint.stage === 8, 'CONTINUE MISSION starts with checkpoint token');
  const rg = new Game(e); rg.enter(); ok(rg.stage === 8 && rg.totalScore === 3300, 'game picks token up');
  e.resumeCheckpoint = null;
  tapAt(t2, center(t2.newBtn)); ok(started === 2 && cpOf(e) === null && t2.cp === null && e.resumeCheckpoint === null, 'NEW MISSION clears checkpoint and starts');
  // ベータタグのタップ = ロゴタップ
  setDebug(false);
  let toast = 0; for (let i = 0; i < 5; i++) { clock += 50; t2.onInput('tap', { x: center(t2.betaBox).x, y: center(t2.betaBox).y, now: clock }); } 
  ok(t2.toastT > 0, 'taps on beta tag count as logo taps'); setDebug(false);
}

// ===== D. WORLD ADMIN =====
{
  __setRelayUrl('https://relay.test'); setDebug(true);
  const e = makeEngine(); const g = new Game(e); g.enter();
  g._dbgPrev = 'play'; g.state = 'debug';
  const ls = globalThis.localStorage; globalThis.localStorage = { getItem: () => null, setItem: (k) => { throw new Error('should not persist ' + k); }, removeItem: noop };
  let asked = 0; g._askAdminKey = (cb) => { asked++; cb('wrong'); };
  tapAt(g, center(g._adminBtnRect())); await tick();
  ok(g._admin && g._admin.phase === 'error' && g._admin.msg === 'UNAUTHORIZED', 'wrong key -> UNAUTHORIZED inline (' + (g._admin && g._admin.msg) + ')');
  ok(renderOK(g), 'admin error renders');
  g._askAdminKey = (cb) => { asked++; cb(srv.admin); }; g._admin = null;
  tapAt(g, center(g._adminBtnRect())); await tick();
  ok(g._admin.phase === 'list' && g._admin.names.length === 2 && asked === 2, 'list loaded after key');
  ok(renderOK(g), 'admin list renders');
  // 2回目は鍵を聞かない
  g._admin = null; tapAt(g, center(g._adminBtnRect())); await tick(); ok(asked === 2 && g._admin.phase === 'list', 'key asked once per session');
  let R = g._adminRects(); ok(R.rows.length === 2 && R.rows[0].sub.includes('BEST 900'), 'rows show best/first');
  tapAt(g, center(R.rows[0].del)); ok(g._admin.confirm === 'AAA', 'delete asks confirmation'); ok(renderOK(g), 'confirm renders');
  tapAt(g, center(g._adminConfirmRects().no)); ok(g._admin.confirm === null && srv.names.length === 2, 'cancel keeps');
  tapAt(g, center(R.rows[0].del)); tapAt(g, center(g._adminConfirmRects().yes)); await tick(); await tick();
  ok(srv.names.length === 1 && g._admin.names.length === 1 && g._admin.names[0].name === 'BBB', 'delete -> adminDelete -> list refreshed');
  ok(srv.calls.some((c) => c.path === '/admin/delete' && c.init.headers['X-Admin-Key'] === srv.admin), 'admin key sent as header');
  srv.offline = true; g._admin = null; g._adminOpen(); await tick(); ok(g._admin.msg === 'OFFLINE', 'offline message'); srv.offline = false;
  tapAt(g, center(g._adminRects().close)); ok(g._admin === null, 'close returns to DBG panel');
  // ページ送り
  srv.names = Array.from({ length: 12 }, (_, i) => ({ name: 'N' + i, first: '2026-01-01', best: null }));
  g._adminOpen(); await tick(); R = g._adminRects(); ok(R.rows.length === 5 && R.next && !R.prev, 'paged 5 per page');
  tapAt(g, center(R.next)); R = g._adminRects(); ok(g._admin.page === 1 && R.prev && R.next, 'next page');
  tapAt(g, center(R.next)); R = g._adminRects(); ok(R.rows.length === 2 && !R.next, 'last page');
  const all = [...g._adminRects().rows.map((r) => r.del), g._adminRects().prev, g._adminRects().close].filter(Boolean); let ov = 0;
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j])) ov++;
  ok(ov === 0, 'admin targets do not overlap');
  const D = g._dbgButtons().concat([g._adminBtnRect()]); ov = 0;
  for (let i = 0; i < D.length; i++) for (let j = i + 1; j < D.length; j++) if (overlap(D[i], D[j])) ov++;
  ok(ov === 0, 'DBG buttons incl. WORLD ADMIN do not overlap');
  globalThis.localStorage = ls;
  ok(!e.storage.get('adminKey') && ![...e._store.values()].some((v) => v === srv.admin), 'admin key not in storage');
  setDebug(false); __setRelayUrl('');
}

// ===== ファズ: タイトル/プロフィール/チェックポイント =====
{
  let seed = 99; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const e = makeEngine(); let t = new TitleScene(e, noop, { launch: rnd() < 0.5 }); t.enter();
  let threw = null; __setRelayUrl('');
  try {
    for (let f = 0; f < 3000; f++) {
      const r = rnd();
      if (r < 0.2) t.onInput('tap', { x: rnd() * W, y: rnd() * 640, t0: clock, now: clock });
      else if (r < 0.25) t.onInput(['confirm', 'back', 'left'][Math.floor(rnd() * 3)]);
      else if (r < 0.28) t._submitName(['A', 'Bee', 'みや', ''][Math.floor(rnd() * 4)]);
      else if (r < 0.31) { const g = new Game(e); g.enter(); g.totalScore = Math.floor(rnd() * 5000); g.stage = 1 + Math.floor(rnd() * 14); g._initStage(); if (rnd() < 0.5) { g.continues = 0; g._doCrash('X'); } t.enter(); }
      else if (r < 0.33) { hideNameOverlay(); t = new TitleScene(e, noop, { launch: rnd() < 0.5 }); t.enter(); }
      t.update(0.016); clock += 16;
      if (f % 11 === 0 && !renderOK(t)) throw new Error('title render ' + f);
    }
  } catch (err) { threw = err; console.log(err); }
  ok(!threw, 'title/profile/checkpoint fuzz 3000 steps');
}

console.log(`p4save: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
