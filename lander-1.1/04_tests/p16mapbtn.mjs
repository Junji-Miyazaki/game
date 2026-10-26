// p16mapbtn — タイトルの MAP ボタン（閲覧モード）。実行: node 04_tests/p16mapbtn.mjs
import { Game } from '../02_src/game.js';
import { TitleScene } from '../02_src/title.js';
import { SolarMap } from '../02_src/solarmap.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { unlockedStarts, loadCheckpoint } from '../02_src/ranking.js';
import { starsSummary } from '../02_src/stars.js';
import { stageInfo } from '../02_src/bodies.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
Object.defineProperty(globalThis, 'performance', { value: { now: () => 1000 }, configurable: true });
setDebug(false); __setRelayUrl('');

// 描画記録つき ctx: fillText の文字列とグラデーション生成回数を数える
function makeCtx(rec) {
  rec = rec || { texts: [], grads: 0 };
  const base = { globalAlpha: 1 };
  const ctx = new Proxy(base, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => { rec.grads++; return { addColorStop: noop }; };
      if (k === 'fillText') return (s) => { rec.texts.push(String(s)); };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; } });
  ctx.rec = rec;
  return ctx;
}
const ctx = makeCtx();
function makeEngine(store) {
  store = store || new Map();
  if (!store.has('hudTipSeen')) store.set('hudTipSeen', '1');
  const taps = { n: 0 };
  return { ctx, taps, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop,
      sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: () => { taps.n++; } } },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store };
}
const prof = (...names) => [['profiles', JSON.stringify(names.map((n, i) => ({ name: n, key: String(i).repeat(64) })))], ['activeProfile', names[0]], ['lastName', names[0]]];
const storeWith = (max, best, extra) => {
  const m = new Map([['hudTipSeen', '1'], ...prof('AAA'), ['progress', JSON.stringify({ AAA: { maxStage: max } })]]);
  if (best) m.set('stageBest', JSON.stringify({ AAA: best }));
  if (extra) for (const [k, v] of extra) m.set(k, v);
  return m;
};
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0, t0: 0 });
const mkTitle = (store) => { const calls = { n: 0 }; const e = makeEngine(store); const t = new TitleScene(e, () => { calls.n++; }, { launch: false }); t.enter(); t.update(0.016); return { e, t, calls }; };
const SYSOF = { moon: 'earth', io: 'jupiter', europa: 'jupiter', titan: 'saturn', mars: 'mars', venus: 'venus', mercury: 'mercury', pluto: 'pluto' };
const SYSORD = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn', 'pluto'];
const BODYORD = ['moon', 'europa', 'io', 'mars', 'titan', 'venus', 'mercury', 'pluto'];
const bodyOf = (stage) => BODYORD[Math.floor(((stage - 1) % 16) / 2)];
const run = (t, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) t.update(0.05); };
function zoomTo(t, sys) {
  const m = t.map; m.introT = 1.6;
  if (m.view === 'zoom' && m.camSys === sys) return;
  if (m.view === 'zoom') m.input('back');
  run(t, 2);
  t.onInput('tap', center(m.chipRects()[SYSORD.indexOf(sys)]));
  for (let i = 0; i < 100 && !(m.view === 'zoom' && m.zProg === 1 && !m.ship.fl); i++) t.update(0.05);
}
function selectStage(t, stage) {
  const m = t.map, id = bodyOf(stage), sys = SYSOF[id];
  zoomTo(t, sys);
  const card = m.cards(sys).find((c) => c.id === id), want = Math.floor((stage - 1) / 16);
  for (let g = 0; g < 40 && m.B[id].loop !== want; g++) t.onInput('tap', center(m.B[id].loop < want ? m.stepRects(card).next : m.stepRects(card).prev));
  t.onInput('tap', center(m.pipRect(card, (stage - 1) % 2)));
  run(t, 1.5);
}
const startVia = (t, stage) => { selectStage(t, stage); t.onInput('tap', center(t.map.startRect())); };
const openMap = (store) => { const x = mkTitle(store); x.t.onInput('tap', center(x.t.startBtn)); return x; };
const render = (t) => { const c = makeCtx(); t.render(c); return c.rec; };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const cpJson = JSON.stringify({ v: 1, runId: 'r1', stage: 4, totalScore: 10, continues: 2, modules: {}, name: 'AAA' });

// 1. 配置・当たり判定
{
  for (const withCp of [false, true]) {
    const { t } = mkTitle(storeWith(1, null, withCp ? [['checkpoint', cpJson]] : null));
    const m = t.mapBtn, r = t.rankBtn;
    ok(!!m && m.h >= 44 && r.h >= 44, 'MAP/RANKING hit boxes >=44px tall');
    ok(Math.abs((m.x + m.w / 2) - 180 - (180 - (r.x + r.w / 2))) < 0.01, 'RANKING and MAP are centered symmetrically');
    ok(!overlap(m, r), 'MAP/RANKING do not overlap');
    const others = { start: t.startBtn, cont: t.continueBtn, newBtn: t.newBtn, pilots: t.changeBtn, mute: t.muteBtn, logo: t.logoBox, beta: t.betaBox, plaque: t.worldBox, setTitle: t.titleBtn };
    for (const [k, o] of Object.entries(others)) ok(!overlap(m, o) && !overlap(r, o), 'MAP/RANKING clear of ' + k + ' (cp=' + withCp + ')');
    ok(m.x >= 0 && m.x + m.w <= 360 && m.y + m.h <= 640 && r.x >= 0, 'inside 360x640');
    run(t, 4); const rec = makeCtx(); t.render(rec);
    const j = rec.rec.texts.join('');
    ok(j.includes('MAP') && j.includes('RANKING'), 'MAP and RANKING drawn');
  }
}
// 2. 1 開始 → 閲覧専用
{
  const { t, calls, e } = mkTitle(storeWith(1, null, [['checkpoint', cpJson]]));
  t.onInput('tap', center(t.mapBtn));
  ok(!!t.map && t.map.viewOnly === true && calls.n === 0, 'MAP with 1 start opens view-only, no game start');
  ok(!!loadCheckpoint(e.storage), 'checkpoint kept after opening');
  t.map.introT = 1.6; run(t, 1);
  zoomTo(t, 'earth'); t.onInput('tap', center(t.map.pipRect(t.map.cards('earth').find((c) => c.id === 'moon'), 0))); run(t, 1);
  const rec = render(t);
  ok(!rec.texts.includes('START') && rec.texts.includes('LAND TO UNLOCK MORE STARTS'), 'no START bar; hint shown');
  t.onInput('tap', center(t.map.startRect()));
  t.onInput('confirm', {});
  ok(calls.n === 0 && !!t.map, 'tapping where START would be / confirm does not start');
  t.onInput('tap', center(t.startBtn)); t.onInput('tap', center(t.continueBtn));
  ok(calls.n === 0, 'taps swallowed by the map');
  t.onInput('back', {}); t.onInput('back', {}); for (let i = 0; i < 3 && t.map; i++) t.onInput('back', {});
  ok(t.map === null && calls.n === 0 && !!loadCheckpoint(e.storage) && !!t.cp, 'BACK closes to title; checkpoint preserved');
}
// 3. 名前なし
{
  const m = new Map([['hudTipSeen', '1']]);
  const { t, calls } = mkTitle(m);
  t.onInput('tap', center(t.mapBtn));
  ok(!!t.map && t.map.viewOnly === true && calls.n === 0, 'no pilot name: view-only');
}
// 4. >1 開始 → 開始できる。_startAt 経路と同一
{
  let same = true;
  for (const s of [1, 2, 3, 7, 15, 17, 33]) {
    const A = mkTitle(storeWith(33, null, [['checkpoint', cpJson]])); A.t._startAt(s);
    const B = mkTitle(storeWith(33, null, [['checkpoint', cpJson]]));
    B.t.onInput('tap', center(B.t.mapBtn));
    ok(!!B.t.map && B.t.map.viewOnly === false && !!loadCheckpoint(B.e.storage), 'MAP with >1 starts: startable, checkpoint intact on open (' + s + ')');
    startVia(B.t, s);
    if (!(A.calls.n === 1 && B.calls.n === 1 && A.e.startStage === B.e.startStage && B.t.map === null && loadCheckpoint(B.e.storage) === null && B.e.resumeCheckpoint == null && B.t.cp === null)) same = false;
  }
  ok(same, 'start from MAP == _startAt path (params, checkpoint cleared only on start)');
  const { t, e } = mkTitle(storeWith(9, null, [['checkpoint', cpJson]]));
  t.onInput('tap', center(t.mapBtn)); for (let i = 0; i < 4 && t.map; i++) t.onInput('back', {});
  ok(t.map === null && !!loadCheckpoint(e.storage), 'open/close with >1 starts keeps checkpoint');
}
// 5. 一覧表示中は MAP を開かず閉じるだけ / RANKING は従来通り
{
  const { t, calls } = mkTitle(storeWith(9));
  t.onInput('tap', center(t.rankBtn)); ok(t.showRank, 'RANKING still toggles list');
  t.onInput('tap', center(t.mapBtn)); ok(!!t.map && t.showRank === false, 'MAP while list open: opens map, list closed');
  ok(calls.n === 0, 'no accidental start');
}
console.log('p16mapbtn: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
