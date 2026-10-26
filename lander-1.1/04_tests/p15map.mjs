// p15map — L3 太陽系マップ（旧 CHOOSE START の置き換え）。実行: node 04_tests/p15map.mjs（lander-1.1/ から）
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
const SYSOF = { moon: 'earth', io: 'jupiter', europa: 'jupiter', titan: 'saturn', mars: 'mars', venus: 'venus', mercury: 'mercury' };
const SYSORD = ['mercury', 'venus', 'earth', 'mars', 'jupiter', 'saturn'];
const BODYORD = ['moon', 'europa', 'io', 'mars', 'titan', 'venus', 'mercury'];
const bodyOf = (stage) => BODYORD[Math.floor(((stage - 1) % 14) / 2)];
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
  const card = m.cards(sys).find((c) => c.id === id), want = Math.floor((stage - 1) / 14);
  for (let g = 0; g < 40 && m.B[id].loop !== want; g++) t.onInput('tap', center(m.B[id].loop < want ? m.stepRects(card).next : m.stepRects(card).prev));
  t.onInput('tap', center(m.pipRect(card, (stage - 1) % 2)));
  run(t, 1.5);
}
const startVia = (t, stage) => { selectStage(t, stage); t.onInput('tap', center(t.map.startRect())); };
const openMap = (store) => { const x = mkTitle(store); x.t.onInput('tap', center(x.t.startBtn)); return x; };
const render = (t) => { const c = makeCtx(); t.render(c); return c.rec; };

// ===== 1. 開く場所 =====
{
  let x = mkTitle(storeWith(1));
  x.t.onInput('tap', center(x.t.startBtn));
  ok(x.t.map === null && x.calls.n === 1, 'one start option: START begins directly (no map)');
  x = mkTitle(storeWith(2));
  x.t.onInput('tap', center(x.t.startBtn));
  ok(!!x.t.map && x.calls.n === 0 && x.t.showRank === false, 'two options: START opens the map');
  ok(!('pick' in x.t) || x.t.pick == null, 'the old CHOOSE START state is gone');
  const cp = JSON.stringify({ v: 1, runId: 'r1', stage: 4, totalScore: 10, continues: 2, modules: {}, name: 'AAA' });
  x = mkTitle(storeWith(9, null, [['checkpoint', cp]]));
  x.t.onInput('tap', center(x.t.newBtn));
  ok(!!x.t.map && !!loadCheckpoint(x.e.storage), 'NEW MISSION (with a checkpoint) opens the map and keeps the checkpoint');
  x.t.onInput('tap', center(x.t.continueBtn)); x.t.onInput('tap', center(x.t.startBtn));
  ok(x.calls.n === 0 && !!x.t.map, 'taps on the hidden CONTINUE/START targets are swallowed');
  x = mkTitle(storeWith(9));
  x.t.onInput('confirm', {});
  ok(!!x.t.map, 'Enter on START opens the map');
  const mm = x.t.map; x.t.render(ctx);
  ok(x.t.blocksBack() === true, 'engine BACK is blocked while the map is open (map has its own BACK)');
}

// ===== 2. 選べるステージ == _startOptions() =====
for (const max of [2, 3, 7, 13, 14, 15, 16, 28, 29, 41, 60, 200]) {
  const { t } = openMap(storeWith(max));
  const want = t._startOptions().map((o) => o.stage).sort((a, b) => a - b);
  const got = t.map.reachable();
  ok(want.length === max && got.length === max && got.every((s, i) => s === want[i]), 'selectable stages == _startOptions() for maxStage ' + max);
  ok(want.join() === unlockedStarts(max).map((o) => o.stage).sort((a, b) => a - b).join(), '_startOptions is the unlockedStarts list (' + max + ')');
}

// ===== 3. 開始パラメータは旧パスと同じ =====
{
  const cp = JSON.stringify({ v: 1, runId: 'r1', stage: 4, totalScore: 10, continues: 2, modules: {}, name: 'AAA' });
  let allSame = true, msg = '';
  for (let s = 1; s <= 29; s++) {
    // 旧パス（CHOOSE START の行タップ）= title._startAt(stage)
    const A = mkTitle(storeWith(29, null, [['checkpoint', cp]]));
    A.t.onInput('tap', center(A.t.newBtn)); A.t._startAt(s);
    // 新パス（マップ）
    const B = mkTitle(storeWith(29, null, [['checkpoint', cp]]));
    B.t.onInput('tap', center(B.t.newBtn)); startVia(B.t, s);
    const same = A.calls.n === 1 && B.calls.n === 1 && A.e.startStage === B.e.startStage && (B.e.startStage === (s > 1 ? s : null)) && B.t.map === null
      && loadCheckpoint(B.e.storage) === null && B.e.resumeCheckpoint == null && B.t.cp === null;
    if (!same) { allSame = false; msg += ' ' + s; }
    if (s === 1 || s === 8 || s === 22 || s === 29) {
      const ga = new Game(A.e); ga.enter(); const gb = new Game(B.e); gb.enter();
      const eq = ga.stage === gb.stage && gb.stage === s && gb.totalScore === 0 && gb.continues === 3 && gb.startStage === s && ga.startStage === gb.startStage;
      ok(eq, 'Game starts at stage ' + s + ' with the same params via the map');
    }
  }
  ok(allSame, 'every stage 1..29 starts exactly as the old panel did (startStage, checkpoint cleared, one begin)' + msg);
}

// ===== 4. ロックされたステージ・START の誤爆 =====
{
  const { t, calls, e } = openMap(storeWith(3));
  const m = t.map; m.introT = 1.6;
  zoomTo(t, 'mars');                                  // 火星(7,8)はロック
  const card = m.cards('mars')[0];
  t.onInput('tap', center(m.pipRect(card, 0))); t.onInput('tap', center(m.pipRect(card, 1)));
  ok(m.sel === null && calls.n === 0 && m.toast && /LOCKED/.test(m.toast.text), 'locked stage tap: no selection, toast only');
  t.onInput('tap', center(card ? { x: 16, y: card.y, w: 150, h: card.h } : m.startRect()));
  ok(m.sel === null && calls.n === 0, 'locked body (card area) cannot be selected');
  t.onInput('tap', center(m.startRect()));
  ok(calls.n === 0 && m.sel === null, 'START area with nothing selected does nothing');
  t.onInput('confirm', {}); t.onInput('right', {}); t.onInput('left', {});
  ok(m.sel === null && calls.n === 0, 'keys: nothing selectable in a locked system');
  ok(!m.selectableAt('mars').length && m.pips('mars').every((p) => p.state === 'locked'), 'locked pips report state locked');
  ok(t.map.reachable().join() === '1,2,3', 'reachable == 1,2,3');
  // 解放済みの惑星系: 選択だけでは開始しない
  m.input('back'); run(t, 1);
  zoomTo(t, 'earth');
  const mc = m.cards('earth')[0];
  t.onInput('tap', center(m.pipRect(mc, 0)));
  ok(m.sel === 1 && calls.n === 0, 'tapping an unlocked stage only selects it (START bar appears)');
  t.onInput('tap', center(m.pipRect(mc, 1)));
  ok(m.sel === 2 && calls.n === 0, 'tapping another stage moves the selection');
  t.onInput('tap', { x: 180, y: 250, now: 0 });
  ok(calls.n === 0 && m.sel === 2, 'a stray tap does not start or change the selection');
  t.onInput('tap', center(m.startRect()));
  ok(calls.n === 1 && e.startStage === 2 && t.map === null, 'START bar starts the selected stage');
}

// ===== 5. BACK / 閉じる / イントロ / 飛行 =====
{
  const { t, calls } = openMap(storeWith(14));
  const m = t.map;
  t.onInput('tap', center(m.chipRects()[3]));       // イントロ中のタップ: 消費されて何も起きない
  ok(m.introT >= 1.6 && m.view === 'over' && !m.ship.fl && calls.n === 0, 'first tap skips the intro and is consumed (no zoom)');
  t.onInput('tap', center(m.chipRects()[3]));       // 火星 -> 飛行
  ok(m.view === 'zoom' || m.ship.fl || m.camSys === 'mars', 'tapping a planet starts the flight to it');
  const sawFlight = !!m.ship.fl;
  t.onInput('tap', { x: 5, y: 600, now: 0 });       // 飛行中のタップ = スキップ（消費）
  t.update(0.016);
  ok(sawFlight && !m.ship.fl && calls.n === 0, 'a tap during the planet-to-planet flight skips it');
  run(t, 1.5);
  ok(m.view === 'zoom' && m.zProg === 1 && m.camSys === 'mars', 'zoomed into the system after ~0.5 s');
  t.onInput('tap', center(m.backRect()));
  ok(m.view === 'over' && t.map === m && calls.n === 0, 'BACK in the system view returns to the overview');
  run(t, 1);
  t.onInput('back', {});
  ok(t.map === null && calls.n === 0, 'BACK again closes the map (back to the title)');
  // Esc/Backspace 経路（engine は 'back' を送る）
  const y = openMap(storeWith(14)); y.t.map.introT = 1.6;
  zoomTo(y.t, 'jupiter'); y.t.onInput('back', {});
  ok(y.t.map.view === 'over' && y.t.map.sel === null, 'Esc in the system view -> overview (selection cleared)');
  run(y.t, 1); y.t.onInput('back', {});
  ok(y.t.map === null, 'Esc in the overview -> closes');
  // 拡大のアニメーション中の入力は無視
  const z = openMap(storeWith(14)); z.t.map.introT = 1.6; z.t.onInput('tap', center(z.t.map.chipRects()[3]));
  for (let i = 0; i < 40 && z.t.map.ship.fl; i++) z.t.update(0.05);
  for (let i = 0; i < 3; i++) z.t.update(0.05);
  const zp = z.t.map.zProg;
  ok(zp > 0 && zp < 1, 'mid-zoom state reached (' + zp.toFixed(2) + ')');
  z.t.onInput('back', {}); z.t.onInput('tap', center(z.t.map.backRect()));
  ok(z.t.map && z.t.map.zTarget === 1 && z.calls.n === 0, 'input during the zoom transition is ignored');
  // 閉じた後に再び開ける・状態を持ち越さない
  const w = openMap(storeWith(14)); w.t.map.introT = 1.6; w.t.onInput('back', {});
  w.t.onInput('tap', center(w.t.startBtn));
  ok(!!w.t.map && w.t.map.introT < 1.5 && w.t.map.sel === null, 'reopening gives a fresh map (intro again, nothing selected)');
}

// ===== 6. ★の表示データ（リング・旗・ロック・カウンタ）=====
{
  // moon(1,2) 着陸のみ / europa(3,4) 全★ / io(5) 1つだけ着陸 / mars 未着陸 ... maxStage 8（mars まで解放）
  const best = { 1: { grade: 'B', stars: 1 }, 2: { grade: 'S', stars: 3 }, 3: { grade: 'PERFECT', stars: 7 }, 4: { grade: 'PERFECT', stars: 7 }, 5: { grade: 'C', stars: 1 } };
  const { t } = openMap(storeWith(8, best));
  const m = t.map, sum = starsSummary(t.engine.storage, t.name);
  ok(m.ringState('moon') === 'ring' && m.ringState('europa') === 'gold', 'ring when every stage landed; gold ring when every star is collected');
  ok(m.ringState('io') === 'none' && m.ringState('mars') === 'none' && m.ringState('titan') === 'none', 'partly landed / not landed -> no ring');
  ok(m.ringState('earth') === 'ring' && m.ringState('jupiter') === 'none' && m.ringState('mars') === 'none', 'system ring aggregates its bodies (Jupiter: Io incomplete -> none)');
  ok(m.flagged('moon') && m.flagged('europa') && m.flagged('io') && !m.flagged('mars') && m.flagged('jupiter') && m.flagged('earth') && !m.flagged('saturn'), 'flag on any landing');
  ok(m.sysLocked('mercury') && m.sysLocked('venus') && m.sysLocked('saturn') && !m.sysLocked('mars') && !m.sysLocked('earth') && !m.sysLocked('jupiter'), 'locked systems (dimmed) follow maxStage');
  const mp = m.pips('europa');
  ok(mp[0].stage === 3 && mp[0].mask === 7 && mp[0].grade === 'PERFECT' && mp[0].state === 'done', 'pip data: stars + grade + state');
  ok(m.pips('mars').every((p) => p.state === 'open'), 'mars (7,8) open at maxStage 8: not yet landed');
  { const l7 = new SolarMap({ list: unlockedStarts(7), summary: sum }); ok(l7.pips('mars')[0].state === 'open' && l7.pips('mars')[1].state === 'locked', 'stage 8 locked at maxStage 7'); }
  ok(m.B.moon.best === 'S' && m.B.europa.best === 'PERFECT' && m.B.moon.stars === 3 && m.B.europa.stars === 6, 'body best grade / star totals come from starsSummary');
  const r = render(t); // イントロ中でも落ちない
  m.introT = 1.6; run(t, 1);
  const rec = render(t);
  ok(rec.texts.includes('★ ' + sum.totalStars + ' / ' + sum.maxStars), 'total stars counter drawn: ' + (rec.texts.find((s) => s.startsWith('★ ')) || 'none') + ' / expect ' + sum.totalStars + ' / ' + sum.maxStars);
  ok(sum.totalStars === 10 && sum.maxStars === 42, 'counter data: 10 / 42');
  for (const nm of ['PHOBOS', 'RYUGU', '67P', 'ENCELADUS', 'TRITON', 'PLUTO']) ok(rec.texts.includes(nm), 'COMING SOON silhouette label drawn: ' + nm);
  ok(rec.texts.includes('COMING SOON · v1.2'), 'COMING SOON heading drawn');
  // 拡大画面
  zoomTo(t, 'jupiter');
  const rz = render(t);
  ok(['IO', 'EUROPA', 'S1', 'S2', 'BEST'].every((s) => rz.texts.includes(s)) && rz.texts.includes('P'), 'zoom draws cards, stage pips, best grade');
  // 周回: 2周目の記録（stage 15 = moon 1）を持つとき
  const best2 = Object.assign({}, best, { 15: { grade: 'A', stars: 3 } });
  const o2 = openMap(storeWith(16, best2)); const m2 = o2.t.map;
  ok(m2.B.moon.loops === 1 && m2.B.moon.loop === 1 && m2.pips('moon')[0].stage === 15 && m2.pips('moon')[0].mask === 3, 'orbit 2 pips use the later stage records');
  ok(m2.B.moon.ring === true && m2.ringState('moon') === 'ring', 'ring is judged on the first-orbit stages');
}

// ===== 7. COMING SOON / TERRA は選べない =====
{
  const { t, calls } = openMap(storeWith(14));
  const m = t.map; m.introT = 1.6;
  for (const r of m.soonRects()) {
    t.onInput('tap', center(r));
    ok(m.view === 'over' && !m.ship.fl && m.sel === null && calls.n === 0 && m.toast && /COMING SOON/.test(m.toast.text) && m.toast.text.startsWith(r.soon), 'COMING SOON ' + r.soon + ': toast only');
  }
  zoomTo(t, 'mars');
  const cs = m.cards('mars'), soon = cs.find((c) => c.kind === 'soon');
  t.onInput('tap', center({ x: 16, y: soon.y, w: 328, h: soon.h }));
  ok(m.sel === null && calls.n === 0 && /PHOBOS/.test(m.toast.text), 'PHOBOS card is not selectable');
  zoomTo(t, 'saturn');
  ok(m.cards('saturn').some((c) => c.kind === 'soon' && c.soon === 'ENCELADUS'), 'Saturn shows ENCELADUS as coming soon');
  zoomTo(t, 'earth');
  const bonus = m.cards('earth').find((c) => c.kind === 'bonus');
  t.onInput('tap', center({ x: 16, y: bonus.y, w: 328, h: bonus.h }));
  ok(m.sel === null && calls.n === 0 && /TERRA/.test(m.toast.text), 'TERRA (bonus) marker is not a start point');
  ok(m.reachable().every((s) => s <= 14) && !m.reachable().includes(0), 'no stage for TERRA / coming-soon bodies');
}

// ===== 8. 周回の切り替え =====
{
  const { t, calls, e } = openMap(storeWith(40));
  const m = t.map; zoomTo(t, 'earth');
  const card = m.cards('earth')[0];
  ok(m.B.moon.loops === 2 && m.B.moon.loop === 2 && m.pips('moon')[0].stage === 29, 'default orbit is the furthest unlocked (stage 29/30)');
  t.onInput('tap', center(m.pipRect(card, 0)));
  ok(m.sel === 29, 'select the orbit-3 stage');
  t.onInput('tap', center(m.stepRects(card).prev));
  ok(m.B.moon.loop === 1 && m.sel === null && m.pips('moon')[0].stage === 15, 'previous orbit: pips switch, selection cleared');
  t.onInput('tap', center(m.stepRects(card).prev)); t.onInput('tap', center(m.stepRects(card).prev));
  ok(m.B.moon.loop === 0, 'orbit stepper clamps at the first orbit');
  t.onInput('tap', center(m.pipRect(card, 1)));
  t.onInput('tap', center(m.startRect()));
  ok(calls.n === 1 && e.startStage === 2, 'a first-orbit stage can still be started when later orbits are unlocked');
  // キーの上下で周回
  const k = openMap(storeWith(40)); zoomTo(k.t, 'earth');
  k.t.onInput('up', {}); ok(k.t.map.B.moon.loop === 2, 'up clamps at the newest orbit');
  k.t.onInput('down', {}); ok(k.t.map.B.moon.loop === 1, 'down steps to the previous orbit');
}

// ===== 9. キーボード =====
{
  const { t, calls, e } = openMap(storeWith(9));
  const m = t.map;
  t.onInput('right', {});                                  // イントロをスキップ（キーも1回消費）
  ok(m.introT >= 1.6, 'a key press skips the intro too');
  const f0 = m.focus; t.onInput('right', {}); t.onInput('left', {}); t.onInput('left', {});
  ok(m.focus === (f0 + 5) % 6 && m.view === 'over', 'arrow keys move the planet focus (wraps)');
  t.onInput('confirm', {});
  run(t, 3);
  ok(m.view === 'zoom' && m.camSys === SYSORD[(f0 + 5) % 6], 'Enter zooms into the focused system');
  t.onInput('back', {}); run(t, 1);
  // saturn(titan 9,10 -> 9 unlocked): 右で 9 を選択
  while (m.focus !== 5) t.onInput('right', {});
  t.onInput('confirm', {}); run(t, 3);
  t.onInput('right', {});
  ok(m.sel === 9, 'right selects the first unlocked stage');
  t.onInput('right', {}); ok(m.sel === 9, 'selection clamps at the last unlocked stage (stage 10 locked)');
  t.onInput('confirm', {});
  ok(calls.n === 1 && e.startStage === 9, 'Enter starts the selected stage');
}

// ===== 10. 全タップ・全キーのファジング（誤開始が起きない）=====
{
  let seed = 12345; const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  let bad = 0, starts = 0, threw = null;
  for (const max of [2, 9, 30]) {
    for (let round = 0; round < 6; round++) {
      let { t, calls } = openMap(storeWith(max, { 1: { grade: 'A', stars: 3 } }));
      try {
        for (let i = 0; i < 700 && t.map; i++) {
          const m = t.map, before = calls.n;
          const mayStart = m.view === 'zoom' && m.zProg === 1 && !m.ship.fl && m.sel !== null && m.introT >= 1.5;
          const r = rnd();
          if (r < 0.62) {
            const pt = { x: rnd() * 360, y: rnd() * 640, now: 0, t0: 0 };
            const onStart = mayStart && pt.x >= 16 && pt.x <= 344 && pt.y >= 536 && pt.y <= 588;
            t.onInput('tap', pt);
            if (calls.n !== before && !onStart) bad++;
          } else if (r < 0.82) {
            const a = ['up', 'down', 'left', 'right', 'back', 'confirm'][Math.floor(rnd() * 6)];
            t.onInput(a, {});
            if (calls.n !== before && !(a === 'confirm' && mayStart)) bad++;
          } else { t.update(0.016 + rnd() * 0.1); if (rnd() < 0.5) t.render(ctx); }
          if (calls.n !== before) { starts++; break; }
        }
      } catch (x) { threw = x; }
    }
  }
  ok(bad === 0 && !threw, 'fuzz: the game never starts unless a selected stage is confirmed (bad=' + bad + ', starts=' + starts + ')' + (threw ? threw.stack : ''));
}

// ===== 11. 描画（全状態で例外なし・グラデーションの再生成なし）=====
{
  const { t } = openMap(storeWith(40, { 1: { grade: 'S', stars: 7 }, 2: { grade: 'S', stars: 7 }, 29: { grade: 'PERFECT', stars: 7 } }));
  const m = t.map; let threw = null;
  try {
    for (let i = 0; i < 40; i++) { t.update(0.05); t.render(ctx); }
    for (const sys of SYSORD) { zoomTo(t, sys); const c0 = m.cards(sys).find((c) => c.kind === 'body'); t.onInput('tap', center(m.pipRect(c0, 0))); for (let i = 0; i < 40; i++) { t.update(0.05); t.render(ctx); } t.onInput('tap', { x: 180, y: 300, now: 0 }); }
  } catch (x) { threw = x; }
  ok(!threw, 'renders every system without throwing: ' + (threw && threw.stack));
  // 定常状態のグラデーション生成数（同じ ctx で再描画。彗星が出ない間は 0）
  m.cometNext = 1e9; m.comet = null; zoomTo(t, 'jupiter'); run(t, 2);
  const c = makeCtx(); t.render(c); const g0 = c.rec.grads;
  for (let i = 0; i < 60; i++) { t.update(0.016); t.render(c); }
  ok(c.rec.grads - g0 === 0, 'steady state: no gradients created per frame after the first (' + (c.rec.grads - g0) + ' in 60 frames)');
  m.introT = 1.6; m.zTarget = 0; run(t, 2); const c2 = makeCtx(); t.render(c2); const h0 = c2.rec.grads;
  for (let i = 0; i < 60; i++) { t.update(0.016); t.render(c2); }
  ok(c2.rec.grads - h0 === 0, 'overview steady state: no gradients per frame (' + (c2.rec.grads - h0) + ')');
  // reduce motion
  const r = new SolarMap({ list: unlockedStarts(10), summary: starsSummary(makeEngine(storeWith(10)).storage, 'AAA'), reduce: true });
  ok(r.introT >= 1.6, 'reduce motion: no intro');
  r.input('tap', center(r.chipRects()[4])); for (let i = 0; i < 30; i++) r.update(0.05);
  ok(r.view === 'zoom' && r.zProg === 1, 'reduce motion: flight and zoom finish quickly');
  r.render(ctx);
}

// ===== 12. マスコット・タップ領域・サイズ =====
{
  const { t, calls } = openMap(storeWith(14));
  const m = t.map; m.introT = 1.6; run(t, 2);
  const s = m.shipScr;
  ok(!!s && s.world === 'ov', 'ship position known in the overview');
  const before = m.mascot.t0;
  t.onInput('tap', { x: s.x, y: s.y - 10 * s.k - 2, now: 0, t0: 0 });
  ok(m.mascot.t0 > before && m.view === 'over' && calls.n === 0, 'tapping the astronaut triggers a reaction (no navigation)');
  m.introT = 1.6;
  const big = (r) => r.w >= 44 && r.h >= 44;
  ok(m.chipRects().every(big), 'overview system chips >= 44 px');
  ok(big(m.backRect()) && m.startRect().h >= 44 && m.startRect().w >= 300, 'BACK / START targets >= 44 px');
  const cd = m.cards('jupiter')[0];
  ok(big(m.pipRect(cd, 0)) && big(m.pipRect(cd, 1)) && big(m.stepRects(cd).prev) && big(m.stepRects(cd).next), 'stage pips and orbit steppers >= 44 px');
  ok(m.pipRect(cd, 0).x + m.pipRect(cd, 0).w <= m.pipRect(cd, 1).x && m.stepRects(cd).prev.x + 48 <= m.stepRects(cd).next.x, 'targets do not overlap');
  ok(m.soonRects().every((r) => r.w >= 44 && r.h >= 44), 'COMING SOON targets >= 44 px');
  // 惑星の当たり: 全惑星は中心タップで拡大
  for (const id of SYSORD) {
    const q = m.ovP[id]; const fresh = openMap(storeWith(14)); const fm = fresh.t.map; fm.introT = 1.6; fresh.t.update(0.1);
    const qq = fm.ovP[id]; fresh.t.onInput('tap', { x: qq.x, y: qq.y, now: 0, t0: 0 });
    for (let i = 0; i < 100 && fm.view !== 'zoom'; i++) fresh.t.update(0.05);
    for (let i = 0; i < 20; i++) fresh.t.update(0.05);
    ok(fm.view === 'zoom' && fm.camSys === id, 'tapping planet ' + id + ' zooms into its system');
  }
}

// ===== 13. デバッグモード =====
{
  setDebug(true);
  const { t, calls, e } = openMap(storeWith(9));
  ok(!!t.map, 'debug mode: the map opens like the old panel');
  startVia(t, 6);
  ok(calls.n === 1 && e.startStage === 6, 'debug mode: starting a stage behaves the same');
  setDebug(false);
}

console.log('p15map: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
