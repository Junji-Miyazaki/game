// p8start — 到達済み天体からの開始（旧 CHOOSE START、L3 から太陽系マップ）。実行: node 04_tests/p8start.mjs（lander/ から）
import { Game } from '../02_src/game.js';
import { TitleScene } from '../02_src/title.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { getMaxStage, recordStageReached, unlockedStarts, removeProfile, addProfile, setActiveProfile, loadRanking, loadCheckpoint } from '../02_src/ranking.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('');

const ctx = new Proxy({ globalAlpha: 1 }, {
  get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k in t ? t[k] : noop),
  set: (t, k, v) => { t[k] = v; return true; } });
function makeEngine(store) {
  store = store || new Map();
  if (!store.has('hudTipSeen')) store.set('hudTipSeen', '1');
  return { ctx, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop,
      sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop } },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store };
}
const prof = (...names) => [['profiles', JSON.stringify(names.map((n, i) => ({ name: n, key: String(i).repeat(64) })))], ['activeProfile', names[0]], ['lastName', names[0]]];
const storeWith = (names, progress) => { const m = new Map([['hudTipSeen', '1'], ...prof(...names)]); if (progress !== undefined) m.set('progress', typeof progress === 'string' ? progress : JSON.stringify(progress)); return m; };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0, t0: 0 });
const renderOK = (s) => { try { s.render(ctx); return true; } catch (e) { console.log('render threw', e); return false; } };

// ===== 1. 解放リスト =====
{
  const L = (m) => unlockedStarts(m).map((o) => o.stage).join(',');
  // ステージ単位（ユーザー判断で天体単位から変更）: 到達済みの全ステージが開始地点
  const seq = (m) => Array.from({ length: m }, (_, i) => m - i).join(',');
  ok(L(1) === '1', 'maxStage 1 -> only stage 1');
  ok(L(2) === '2,1', 'maxStage 2 -> 2,1 (second stage of a body is a start point)');
  ok(L(3) === '3,2,1', 'maxStage 3 -> 3,2,1 (latest first)');
  ok(L(6) === seq(6) && L(12) === seq(12) && L(13) === seq(13), 'every reached stage is unlocked');
  ok(L(25) === seq(25), 'maxStage 25 -> 25 entries');
  const l = unlockedStarts(25);
  ok(l[0].label === 'ORBIT 2 · TITAN' && l[0].stage === 25, 'loop 1 label (8-body tour, 16 stages per loop): ' + l[0].label);
  ok(l[1].label === 'ORBIT 2 · MARS 2' && l[2].label === 'ORBIT 2 · MARS', 'second stage of a body gets a " 2" suffix: ' + l[1].label);
  const l2 = unlockedStarts(33);
  ok(l2[0].label === 'ORBIT 3 · MOON' && l2[0].stage === 33 && l2[1].label === 'ORBIT 2 · PLUTO 2', 'loop 2 label + Pluto is last in the tour: ' + l2[0].label + ' / ' + l2[1].label);
  ok(l[l.length - 1].label === 'MOON' && l[l.length - 2].label === 'MOON 2' && l[l.length - 5].label === 'IO', 'loop 0 labels have no prefix');
  { const ti = unlockedStarts(12).find((o) => o.stage === 9); ok(ti && ti.label === 'TITAN' && Math.abs(ti.realG - 1.35) < 1e-9, 'realG carried'); }
  ok(unlockedStarts(NaN).length === 1 && unlockedStarts(-5).length === 1, 'bad maxStage -> 1 option');
}

// ===== 2. 進捗の保存 =====
{
  const e = makeEngine(storeWith(['AAA']));
  const g = new Game(e); g.enter();
  ok(getMaxStage(e.storage, 'AAA') === 1, 'stage 1 start recorded (max 1)');
  g.stage = 4; g._initStage();
  ok(getMaxStage(e.storage, 'AAA') === 4, 'normal stage start raises maxStage');
  g.stage = 2; g._initStage();
  ok(getMaxStage(e.storage, 'AAA') === 4, 'lower stage does not lower maxStage');
  g.stage = 6; g.bonus = { type: 'CALM', afterStage: 6 }; g._initStage();
  ok(getMaxStage(e.storage, 'AAA') === 4, 'bonus stage start does not update progress');
  g.bonus = null; g.stage = 7; g._initStage();
  ok(getMaxStage(e.storage, 'AAA') === 7, 'next normal stage after bonus updates');
  // デバッグラン
  setDebug(true);
  const e2 = makeEngine(storeWith(['AAA'])); const g2 = new Game(e2); g2.enter(); g2.stage = 9; g2._initStage();
  ok(getMaxStage(e2.storage, 'AAA') === 1, 'debug run never updates progress');
  setDebug(false);
  const e3 = makeEngine(storeWith(['AAA'])); const g3 = new Game(e3); g3.enter(); g3._dbgTainted = true; g3.stage = 9; g3._initStage();
  ok(getMaxStage(e3.storage, 'AAA') === 1, 'debug-tainted run never updates progress');
  ok(recordStageReached(e.storage, 'AAA', 0) === false && recordStageReached(e.storage, '', 5) === false, 'invalid args rejected');
}

// ===== 3. パイロット別・削除・破損JSON =====
{
  const st = storeWith(['AAA', 'BBB']);
  const e = makeEngine(st);
  recordStageReached(e.storage, 'AAA', 9); recordStageReached(e.storage, 'BBB', 3);
  ok(getMaxStage(e.storage, 'AAA') === 9 && getMaxStage(e.storage, 'BBB') === 3, 'per-pilot isolation');
  setActiveProfile(e.storage, 'BBB');
  const g = new Game(e); g.enter(); g.stage = 5; g._initStage();
  ok(getMaxStage(e.storage, 'BBB') === 5 && getMaxStage(e.storage, 'AAA') === 9, 'game updates only the active pilot');
  removeProfile(e.storage, 'AAA');
  ok(!('AAA' in JSON.parse(st.get('progress'))) && getMaxStage(e.storage, 'AAA') === 1 && getMaxStage(e.storage, 'BBB') === 5, 'deleting a pilot removes only its progress');
  for (const bad of ['{not json', '[1,2]', 'null', '"x"', '{"AAA":5}', '{"AAA":{"maxStage":"9"}}', '{"AAA":{"maxStage":-3}}', '{"__proto__":{"maxStage":9}}']) {
    const e2 = makeEngine(storeWith(['AAA'], bad));
    let threw = null, m;
    try { m = getMaxStage(e2.storage, 'AAA'); recordStageReached(e2.storage, 'AAA', 3); } catch (x) { threw = x; }
    ok(!threw && m === 1, 'corrupt progress handled: ' + bad);
    ok(!threw && getMaxStage(e2.storage, 'AAA') === 3, 'corrupt progress is repaired on next write: ' + bad);
  }
  ok(getMaxStage(makeEngine(storeWith(['AAA'])).storage, 'toString') === 1, 'prototype property name is not a pilot');
}

// ===== 4. タイトル: オーバーレイ =====
// ===== 天体の2ステージ目から開始しても天体紹介を表示（ランの開始時のみ）=====
{
  const e = makeEngine(storeWith(['AAA'], { AAA: { maxStage: 4 } }));
  e.startStage = 4;                                   // EUROPA の2ステージ目
  const g = new Game(e); g.enter();
  ok(g.stage === 4 && g._introT > 0, 'starting at the 2nd stage of a body shows the body intro');
  g.continues = 3; g._introT = 0; g._initStage();     // CONTINUE で同じステージを再初期化
  ok(g._introT === 0, 'no intro on a continue re-init of a mid-body stage');
  g.stage = 5; g._initStage();                        // 次の天体の最初のステージは従来どおり表示
  ok(g._introT > 0, 'first stage of the next body still shows the intro');
}

const mkTitle = (store, cb) => { const calls = cb || { n: 0 }; const e = makeEngine(store); const t = new TitleScene(e, () => { calls.n++; }, { launch: false }); t.enter(); t.update(0.016); return { e, t, calls }; };
const cpJson = JSON.stringify({ v: 1, runId: 'r1', stage: 4, totalScore: 1234, continues: 2, modules: {}, name: 'AAA' });
// 太陽系マップ（旧 CHOOSE START）を実際のタップで操作する: 惑星系チップ -> 拡大 -> (周回) -> ステージのピップ -> START ボタン
const SYSOF = { moon: 'earth', io: 'jupiter', europa: 'jupiter', titan: 'saturn', mars: 'mars', venus: 'venus', mercury: 'mercury' };
const SYSORD = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const BODYORD = ['moon', 'europa', 'io', 'mars', 'titan', 'venus', 'mercury'];
function zoomTo(t, sys) {
  const m = t.map; m.introT = 1.6;
  if (m.view === 'zoom' && m.camSys === sys) return;
  if (m.view === 'zoom') m.input('back');
  for (let i = 0; i < 40; i++) t.update(0.05);
  t.onInput('tap', center(m.chipRects()[SYSORD.indexOf(sys)]));
  for (let i = 0; i < 100 && !(m.view === 'zoom' && m.zProg === 1 && !m.ship.fl); i++) t.update(0.05);
}
function selectStage(t, stage) {
  const m = t.map, id = BODYORD[Math.floor(((stage - 1) % 14) / 2)], sys = SYSOF[id];
  zoomTo(t, sys);
  const card = m.cards(sys).find((c) => c.id === id), want = Math.floor((stage - 1) / 14);
  for (let g = 0; g < 40 && m.B[id].loop !== want; g++) t.onInput('tap', center(m.B[id].loop < want ? m.stepRects(card).next : m.stepRects(card).prev));
  t.onInput('tap', center(m.pipRect(card, (stage - 1) % 2)));
  for (let i = 0; i < 100 && m.ship.fl; i++) t.update(0.05);
}
const startVia = (t, stage) => { selectStage(t, stage); t.onInput('tap', center(t.map.startRect())); };
{
  // 段階1のみ: 直接開始
  const { t, calls, e } = mkTitle(storeWith(['AAA'], { AAA: { maxStage: 1 } }));
  t.onInput('tap', center(t.startBtn));
  ok(t.map === null && calls.n === 1, 'only stage 1 unlocked: START starts directly');
  ok(e.startStage == null, 'no startStage for a plain start');
}
{
  // 複数: START で太陽系マップ
  const { t, calls, e } = mkTitle(storeWith(['AAA'], { AAA: { maxStage: 7 } }));
  t.onInput('tap', center(t.startBtn));
  ok(!!t.map && calls.n === 0, 'START with >1 option opens the solar map');
  ok(t.map.reachable().join() === unlockedStarts(7).map((o) => o.stage).sort((a, b) => a - b).join(), 'map reaches exactly the unlocked stages');
  ok(t.blocksBack() === true, 'blocksBack while open');
  ok(renderOK(t), 'renders with the map');
  // 貫通しない（1回目のタップはイントロのスキップで消費される）
  for (const r of [t.startBtn, t.rankBtn, t.changeBtn, t.muteBtn, t.logoBox, t.startBtn]) t.onInput('tap', center(r));
  ok(!!t.map && calls.n === 0 && !t.showRank && !t.prof, 'taps on START/RANKING/PILOTS/mute/logo do not fall through');
  t.map.introT = 1.6;
  t.onInput('tap', { x: 180, y: 8, now: 0 }); t.onInput('tap', { x: 350, y: 300, now: 0 });
  ok(!!t.map && calls.n === 0, 'taps on empty space are ignored');
  t.onInput('back', {});
  ok(t.map === null && calls.n === 0 && t.blocksBack() === false, 'Back (overview) closes without starting');
  // BACK ボタン
  t.onInput('tap', center(t.startBtn)); t.map.introT = 1.6;
  t.onInput('tap', center(t.map.backRect()));
  ok(t.map === null && calls.n === 0, 'BACK button closes the map');
  // ステージをタップ→START ボタン
  t.onInput('tap', center(t.startBtn));
  startVia(t, 5);
  ok(calls.n === 1 && t.map === null && e.startStage === 5, 'selecting a stage and pressing START starts at that stage');
}
{
  // キー: Enter で拡大 -> 右/左でステージ -> Enter で開始
  const { t, calls, e } = mkTitle(storeWith(['AAA'], { AAA: { maxStage: 9 } }));
  t.onInput('confirm', {});
  ok(!!t.map, 'Enter on START opens the map');
  t.map.introT = 1.6;
  t.onInput('confirm', { repeat: true });
  ok(calls.n === 0 && t.map.view === 'over', 'key auto-repeat does nothing');
  t.onInput('confirm', {});                                        // 最遠のステージ(TITAN)の惑星系へ移動して拡大
  for (let i = 0; i < 100 && t.map.view !== 'zoom'; i++) t.update(0.05);
  for (let i = 0; i < 20; i++) t.update(0.05);
  ok(t.map.view === 'zoom' && t.map.camSys === 'saturn', 'Enter zooms into the focused system (furthest stage)');
  t.onInput('confirm', {});                                        // 1回目: 選択
  ok(t.map.sel === 9 && calls.n === 0, 'first Enter selects the furthest stage, does not start');
  t.onInput('confirm', {});                                        // 2回目: 開始
  ok(calls.n === 1 && e.startStage === 9, 'second Enter starts it');
}
{
  // NEW MISSION（チェックポイントあり）
  const { t, calls, e } = mkTitle((() => { const m = storeWith(['AAA'], { AAA: { maxStage: 13 } }); m.set('checkpoint', cpJson); return m; })());
  ok(!!t.cp, 'checkpoint loaded');
  t.onInput('tap', center(t.newBtn));
  ok(!!t.map && !!loadCheckpoint(e.storage) && calls.n === 0, 'NEW MISSION opens the map and keeps the checkpoint while choosing');
  t.onInput('tap', center(t.continueBtn));
  ok(!!t.map && calls.n === 0 && !!loadCheckpoint(e.storage), 'tap on CONTINUE area while open does not continue');
  t.map.introT = 1.6; t.onInput('back', {});
  ok(!t.map && !!loadCheckpoint(e.storage) && !!t.cp, 'closing keeps the checkpoint');
  t.onInput('tap', center(t.newBtn));
  ok(t.map.reachable().length === 13, '13 options for maxStage 13');
  startVia(t, 13);
  ok(calls.n === 1 && e.startStage === 13 && loadCheckpoint(e.storage) === null && e.resumeCheckpoint == null, 'choosing discards the checkpoint and starts');
  // CONTINUE は startStage を持ち越さない
  const x = mkTitle((() => { const m = storeWith(['AAA'], { AAA: { maxStage: 13 } }); m.set('checkpoint', cpJson); return m; })());
  x.e.startStage = 9; x.t.onInput('tap', center(x.t.continueBtn));
  ok(x.e.startStage === null && x.e.resumeCheckpoint && x.calls.n === 1, 'CONTINUE ignores/clears startStage');
}
{
  // 長いリスト（周回が多い）でも描画が落ちず、後ろの周回のステージを選べる
  const { t, calls, e } = mkTitle(storeWith(['AAA'], { AAA: { maxStage: 200 } }));
  t.onInput('tap', center(t.startBtn));
  ok(t.map.reachable().length === 200, 'long list: 200 options');
  let threw = null; try { for (let i = 0; i < 30; i++) { t.update(0.05); t.render(ctx); } startVia(t, 7); } catch (x) { threw = x; }
  ok(!threw, 'map never throws with 200 stages: ' + (threw && threw.stack));
  ok(calls.n === 1 && e.startStage === 7, 'a stage of the first orbit can be chosen when 15 orbits are unlocked');
}
{
  // 名前なし: 新規名は進捗なし -> 直接開始
  const m = new Map([['hudTipSeen', '1'], ['progress', JSON.stringify({ NEWB: { maxStage: 9 } })]]);
  const { t, calls } = mkTitle(m);
  t.onInput('tap', center(t.startBtn));   // 名前入力（document 無し環境では開かない）
  t.pendingStart = true; t._onNameEntered('NEWB');
  ok(!!t.map && calls.n === 0, 'pending start after entering an existing pilot name opens the map');
}

// ===== 5. 開始地点からのラン =====
{
  const st = storeWith(['AAA'], { AAA: { maxStage: 12 } });
  const e = makeEngine(st); e.startStage = 7;
  const g = new Game(e); g.enter();
  ok(g.stage === 7 && g.totalScore === 0 && g.continues === 3 && g.startStage === 7, 'run starts at stage 7, score 0, continues 3');
  ok(Object.values(g.modules).every((v) => v === 0), 'modules all 0');
  ok(g.state === 'play' && g._info.firstOfBody === true && g._introT > 0, 'first stage of the body: intro shows');
  ok(e.startStage === null, 'engine.startStage consumed');
  const cp = loadCheckpoint(e.storage);
  ok(cp && cp.stage === 7 && cp.startStage === 7 && cp.runId === g.runId && cp.totalScore === 0, 'checkpoint saved from stage 7 with startStage');
  ok(g.bonusCount === 2 && g.stage % 3 !== 0, 'bonus cadence follows absolute numbers');
  const e2 = makeEngine(st); e2.startStage = 7; const g2 = new Game(e2); g2.enter();
  ok(g2.runId !== g.runId, 'new runId each run');
  const cpSaved = loadCheckpoint(e.storage);
  // ゲームオーバー -> ランキング
  g.totalScore = 450; g._gameOver(false);
  const rk = loadRanking(e.storage);
  ok(rk.length === 1 && rk[0].startStage === 7 && rk[0].score === 450, 'local ranking entry has startStage');
  // 通常開始
  const e3 = makeEngine(storeWith(['AAA'])); const g3 = new Game(e3); g3.enter();
  ok(g3.stage === 1 && g3.startStage === 1, 'plain run has startStage 1');
  g3.totalScore = 10; g3._gameOver(false);
  ok(loadRanking(e3.storage)[0].startStage === 1, 'plain ranking entry startStage 1');
  // 再開したラン（CONTINUE）は startStage を引き継ぐ
  const e4 = makeEngine(st); e4.resumeCheckpoint = cpSaved; const g4 = new Game(e4); g4.enter();
  ok(g4.startStage === 7 && g4.stage === 7, 'resumed run keeps its startStage');
  // 無効な startStage は無視
  for (const bad of [0, -1, 1.5, 'x', 99999, NaN]) { const e5 = makeEngine(storeWith(['AAA'])); e5.startStage = bad; const g5 = new Game(e5); g5.enter(); ok(g5.stage === 1, 'invalid startStage ignored: ' + bad); }
  // 開始後に最大ステージを超えたら進捗が伸びる
  g.stage = 13; g._initStage();
  ok(getMaxStage(e.storage, 'AAA') === 13, 'progress extends from a mid-tour run');
}
console.log('p8start: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
