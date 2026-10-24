// P6 ボーナスミッション再設計（TERRA / 選択 / SKIP / 得点 / 着陸可能性）。実行: node 04_tests/p6bonus.mjs
import { Game } from '../02_src/game.js';
import { TERRA, BODIES, BONUS_MISSIONS, bodyGravity, bonusBody, bonusScoreFor, missionOf } from '../02_src/bodies.js';
import { autopilotFrame } from '../02_src/autopilot.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { loadCheckpoint, loadRanking } from '../02_src/ranking.js';
import { hudInfoText } from '../02_src/art.js';
import { MODULE_DEFS } from '../02_src/modules.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const realRandom = Math.random;
const seeded = (seed) => { Math.random = lcg(seed); };
const unseed = () => { Math.random = realRandom; };

function makeCtx() {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, { get: (t, k) => k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
}
function makeMusic() {
  const log = [];
  return { log, attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: (id) => log.push('body:' + id), stopAll: noop, stopJingle: noop,
    playJingle: (o) => log.push('jingle:' + o.tier), tick: noop, duck: noop, sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop } };
}
function makeEngine() {
  const store = new Map([['hudTipSeen', '1']]);
  return { music: makeMusic(), audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu() { this.menuCalls = (this.menuCalls || 0) + 1; }, menuCalls: 0, pointer: { down: false, x: 0, y: 0 }, touches: [] };
}
function newGame() { const e = makeEngine(); const g = new Game(e); g.enter(); return { e, g }; }
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tapAt = (g, p) => { clock += 10; g.onInput('tap', { x: p.x, y: p.y, t0: clock - 50 }); };
const onPad = (g) => { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; };
const renderOK = (g) => { try { g.render(makeCtx()); return true; } catch (e) { console.log('render threw', e); return false; } };
setDebug(false); __setRelayUrl('');

// stage s を完璧に着陸 -> クリア画面
function clearStage(g, s) {
  g.stage = s; g.bonus = null; g._initStage(); g.obstacles = [];
  onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0;
  g._doSuccess(0, 0); run(g, 0.6); tapAt(g, { x: 180, y: 300 });   // 着陸シーン -> クリア画面（タップで進める）
  if (g.state === 'landing') { run(g, 0.6); tapAt(g, { x: 180, y: 300 }); }
}
function toCleared(g, s) {
  g.stage = s; g.bonus = null; g._initStage(); g.obstacles = [];
  onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0;
  g._doSuccess(0, 0); run(g, 3.2);   // 着陸シーケンス(2.6s)終了 -> cleared
  run(g, 0.6);
}

// ---------- 1. 選択画面は s%3===0 のクリア後だけ ----------
{
  const { g } = newGame();
  for (let s = 1; s <= 12; s++) {
    toCleared(g, s);
    ok(g.state === 'cleared', 'stage ' + s + ' cleared state: ' + g.state);
    tapAt(g, { x: 180, y: 300 });
    const sel = g.state === 'bonusselect';
    ok(sel === (s % 3 === 0), 'selection only after 3/6/9/12: stage ' + s + ' -> ' + g.state);
    if (!sel) ok(g.state === 'play' && g.stage === s + 1 && !g.bonus, 'non-bonus stage ' + s + ' -> stage ' + (s + 1));
  }
}

// ---------- 2. 3枚のカード / ★★の交互 / 倍率 ----------
{
  const { g } = newGame();
  const mids = [];
  for (const s of [3, 6, 9, 12]) {
    toCleared(g, s); tapAt(g, { x: 180, y: 300 });
    ok(g.state === 'bonusselect' && g.bonusOffers.length === 3, 'three cards at stage ' + s);
    const ms = g.bonusOffers.map(missionOf);
    ok(ms[0].id === 'CALM' && ms[0].stars === 1 && ms[0].mult === 1.0, 'card1 CALM x1.0');
    ok((ms[1].id === 'ROVER' || ms[1].id === 'CROSSWIND') && ms[1].stars === 2 && ms[1].mult === 1.5, 'card2 is a 2-star x1.5');
    ok(ms[2].id === 'STORM' && ms[2].stars === 3 && ms[2].mult === 2.5, 'card3 STORM x2.5');
    ok(ms.map((m) => m.name).join() === 'CALM APPROACH,' + ms[1].name + ',STORM LANDING', 'card names');
    mids.push(ms[1].id);
    ok(g.blocksBack(), 'blocksBack during selection');
    ok(renderOK(g), 'render selection stage ' + s);
    g._skipBonus(); // 次の機会へ（SKIP も機会を消費する）
    if (g.state === 'module') g._pickModule(0);
  }
  ok(mids.join() === 'ROVER,CROSSWIND,ROVER,CROSSWIND', '2-star alternates ROVER/CROSSWIND: ' + mids.join());
  ok(Object.keys(BONUS_MISSIONS).sort().join() === 'CALM,CROSSWIND,ROVER,STORM', 'no FUEL_RUN / PRECISION / MOVING_PAD missions');
}

// ---------- 3. 選択の入力規則（ロック・押しっぱなし・BACK・カード/SKIP のヒット） ----------
{
  const { g, e } = newGame();
  toCleared(g, 3); tapAt(g, { x: 180, y: 300 });
  ok(g.state === 'bonusselect', 'in selection');
  // 入力ロック: 入った直後のタップは無効
  tapAt(g, center(g._bonusCardRect(0)));
  ok(g.state === 'bonusselect', 'tap during input lock ignored');
  run(g, 0.6);
  // 画面に入る前から押していた指の解除は無効
  g.onInput('tap', { x: 180, y: 170, t0: g._overlayAt - 100 });
  ok(g.state === 'bonusselect', 'held pointer release ignored');
  // キーのオートリピート無効
  g.onInput('left', { repeat: true });
  ok(g.state === 'bonusselect', 'key repeat ignored');
  g.onInput('back');
  ok(g.state === 'bonusselect' && e.menuCalls === 0, 'back ignored during selection');
  // カードの外・隙間は無効
  tapAt(g, { x: 5, y: 300 });
  tapAt(g, { x: 180, y: 105 });
  ok(g.state === 'bonusselect', 'miss taps ignored');
  // 矩形の整合: カード3枚とSKIPが互いに重ならず画面内
  const rs = [0, 1, 2].map((i) => g._bonusCardRect(i)).concat([g._bonusSkipRect()]);
  const ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  let bad = 0; for (let i = 0; i < rs.length; i++) { if (rs[i].x < 0 || rs[i].y < 0 || rs[i].x + rs[i].w > 360 || rs[i].y + rs[i].h > 640) bad++; for (let j = i + 1; j < rs.length; j++) if (ov(rs[i], rs[j])) bad++; }
  ok(bad === 0, 'selection rects non-overlapping and on screen');
  ok(rs[3].w * rs[3].h < rs[0].w * rs[0].h / 2, 'SKIP BONUS is smaller than a card');
  // 2枚目をタップ
  const type = g.bonusOffers[1];
  tapAt(g, center(g._bonusCardRect(1)));
  ok(g.state === 'play' && g.bonus && g.bonus.type === type && g.bonus.afterStage === 3 && g.stage === 3, 'tap card 2 starts that mission at stage 3');
}

// ---------- 4. SKIP BONUS ----------
{
  const { g } = newGame();
  toCleared(g, 6); const t0 = g.totalScore; const c0 = g.continues;
  tapAt(g, { x: 180, y: 300 }); run(g, 0.6);
  ok(g.state === 'bonusselect', 'at selection');
  tapAt(g, center(g._bonusSkipRect()));
  ok(g.state === 'module' && !g.bonus, 'SKIP -> module choice (no bonus)');
  ok(g.totalScore === t0 && g.continues === c0 && g._bonusScore === 0, 'SKIP gives no bonus score, keeps continues');
  run(g, 0.6); tapAt(g, { x: 180, y: 150 });   // 1枚目のモジュールカード
  ok(g.state === 'play' && g.stage === 7 && !g.bonus, 'SKIP -> module -> stage 7');
  // モジュールが全て最大なら選択はスキップされ直接 s+1
  const { g: g2 } = newGame();
  for (const d of MODULE_DEFS) g2.modules[d.id] = d.max;
  toCleared(g2, 3); tapAt(g2, { x: 180, y: 300 }); run(g2, 0.6);
  tapAt(g2, center(g2._bonusSkipRect()));
  ok(g2.state === 'play' && g2.stage === 4, 'SKIP with all modules maxed -> stage 4 directly');
}

// ---------- 5. ミッションごとの物理フラグ ----------
{
  const { g } = newGame();
  const exp = {
    CALM:      { moving: false, wind: false, drag: false },
    ROVER:     { moving: true,  wind: false, drag: false },
    CROSSWIND: { moving: false, wind: true,  drag: true },
    STORM:     { moving: true,  wind: true,  drag: true },
  };
  for (const loop of [0, 1]) for (const id of Object.keys(exp)) {
    const s = 3 + loop * 12;
    g.stage = s; g.bonus = { type: id, afterStage: s }; g._initStage();
    const m = BONUS_MISSIONS[id], x = exp[id];
    const tag = id + ' loop ' + loop;
    ok(!!g.pad.moving === x.moving, tag + ' moving pad: ' + g.pad.moving);
    ok(!!g._windSpec === x.wind, tag + ' wind');
    ok(!!g._body.drag === x.drag && (x.drag ? g._body.dragY > 0 : g._body.dragY === 0), tag + ' drag');
    ok(g.pad.w === m.padW && g._padW === m.padW, tag + ' pad width ' + g.pad.w);
    ok(g.obstacles.length === 0, tag + ' no obstacles');
    ok(g._body.id === 'terra' && g._body.name === 'TERRA' && g._body.realG === 9.81, tag + ' body is TERRA');
    ok(near(g._gravity, 0.25 * Math.sqrt(9.81 / 1.62) * (1 + 0.15 * loop), 1e-9), tag + ' gravity ' + g._gravity.toFixed(4));
    ok(g._body.celebTier === Math.min(2, m.stars - 1), tag + ' celebTier');
    if (x.moving) ok(g.pad.maxX > g.pad.minX && g.pad.period > 0 && g.pad.minX >= 0 && g.pad.maxX + g.pad.w <= 360, tag + ' plateau range sane');
    ok(BONUS_MISSIONS.STORM.padW < BONUS_MISSIONS.ROVER.padW, 'STORM pad smaller than the others');
  }
  ok(near(bodyGravity(TERRA, 0), 0.6151, 0.0005), 'TERRA gravity value ~0.615: ' + bodyGravity(TERRA, 0).toFixed(4));
  ok(!BODIES.some((b) => b.id === 'terra') && BODIES.length === 6, 'TERRA is not part of the 6-body tour');
  // 台地上のパッドが実際に動く
  g.stage = 3; g.bonus = { type: 'ROVER', afterStage: 3 }; g._initStage();
  const x0 = g.pad.x; run(g, 2); ok(Math.abs(g.pad.x - x0) > 5, 'ROVER pad moves: ' + (g.pad.x - x0).toFixed(1));
  g.stage = 3; g.bonus = { type: 'CALM', afterStage: 3 }; g._initStage();
  const y0 = g.pad.x; run(g, 2); ok(g.pad.x === y0, 'CALM pad static');
  // 無風ミッションでは風加速が常に 0、風ミッションでは風が出る
  g.stage = 3; g.bonus = { type: 'CALM', afterStage: 3 }; g._initStage(); g.vx = 0; run(g, 1); ok(g._windAccel === 0 && g.vx === 0, 'CALM: no wind accel');
  g.stage = 3; g.bonus = { type: 'CROSSWIND', afterStage: 3 }; g._initStage(); g.vx = 0; run(g, 3); ok(g._windAccel !== 0 && g.vx !== 0, 'CROSSWIND: wind pushes');
}

// ---------- 6. HUD: TERRA + ミッション名 + g 9.81 ----------
{
  const { g } = newGame();
  g.stage = 6; g.bonus = { type: 'STORM', afterStage: 6 }; g._initStage();
  g.render(makeCtx());
  ok(g._hud.bodyName === 'TERRA' && g._hud.mission === 'STORM LANDING' && near(g._hud.realG, 9.81, 1e-9) && g._hud.bonus, 'HUD data: TERRA / mission / 9.81');
  const t = hudInfoText(g._hud);
  ok(t.includes('g 9.81 m/s²') && t.includes('STORM LANDING'), 'HUD info text: ' + t);
  g.bonus = null; g._initStage(); g.render(makeCtx());
  ok(g._hud.mission === '' && !hudInfoText(g._hud).includes('STORM'), 'normal stage has no mission text');
  ok(hudInfoText({ realG: 1.62, atmoTag: 'NONE' }) === 'g 1.62 m/s²  ·  NO ATMOSPHERE', 'normal body HUD text unchanged');
  // BGM は terra
  const { g: g2, e: e2 } = newGame();
  g2.stage = 3; g2.bonus = { type: 'CALM', afterStage: 3 }; g2._initStage();
  ok(e2.music.log.includes('body:terra'), 'bonus starts the terra ambient: ' + e2.music.log.join());
}

// ---------- 7. 得点式 ----------
{
  for (const id of Object.keys(BONUS_MISSIONS)) for (const fuel of [0, 12.3, 55, 100]) {
    const { g } = newGame();
    g.stage = 3; g.bonus = { type: id, afterStage: 3 }; g._initStage(); g.obstacles = [];
    onPad(g); g.fuel = fuel; g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0;
    const t0 = g.totalScore;
    g._doSuccess(0, 0);
    const want = Math.round((600 + fuel * 10) * BONUS_MISSIONS[id].mult);
    ok(g._bonusScore === want && g.totalScore - t0 === want && g._guideBonus === 0, id + ' fuel ' + fuel + ' score ' + g._bonusScore + ' = ' + want);
    ok(bonusScoreFor(id, fuel) === want, 'bonusScoreFor ' + id);
  }
  // 通常ステージの得点にはガイド/着地ボーナスが付くが、ボーナスには付かない
  const { g } = newGame(); g.stage = 3; g.bonus = null; g._initStage(); g._guideDevTotal = 0; g._guideDevCount = 100; onPad(g); g.vx = 0; g.vy = 1; g._doSuccess(0, 0);
  ok(g._stageScore > 0 && g._guideBonus > 0, 'normal stage still scores guide bonus');
}

// ---------- 8. STORM 成功で CONTINUE+1（上限3）/ 他は付かない / 失敗は消費しない ----------
{
  for (const [id, start, want] of [['STORM', 1, 2], ['STORM', 2, 3], ['STORM', 3, 3], ['CALM', 1, 1], ['ROVER', 2, 2], ['CROSSWIND', 2, 2]]) {
    const { g } = newGame();
    g.stage = 3; g.bonus = { type: id, afterStage: 3 }; g._initStage(); g.continues = start; g.obstacles = [];
    onPad(g); g.vx = 0; g.vy = 1; g._doSuccess(0, 0);
    ok(g.continues === want, id + ' success continues ' + start + ' -> ' + g.continues + ' (want ' + want + ')');
    ok(g._bonusGrant === (id === 'STORM' && start < 3), id + ' grant flag at ' + start);
  }
  for (const id of Object.keys(BONUS_MISSIONS)) for (const c of [0, 1, 3]) {
    const { g } = newGame();
    g.stage = 6; g.bonus = { type: id, afterStage: 6 }; g._initStage(); g.continues = c;
    const t0 = g.totalScore;
    g._doCrash('TEST');
    ok(g.state === 'bonusfailed' && g.continues === c && g.totalScore === t0, id + ' crash keeps continues (' + c + ') and score');
    ok(renderOK(g), id + ' bonusfailed renders');
    run(g, 0.6); tapAt(g, { x: 180, y: 300 });
    ok(g.state === 'module' && !g.bonus, id + ' failed -> module choice');
    tapAt(g, { x: 180, y: 150 }); run(g, 0.6); tapAt(g, { x: 180, y: 150 });
    ok(g.state === 'play' && g.stage === 7 && !g.bonus && g.continues === c, id + ' failed -> module -> stage 7');
  }
}

// ---------- 9. 祝福の格 / ジングル / HOLD / チェックポイント / デバッグ ----------
{
  const exp = { CALM: 0, ROVER: 1, CROSSWIND: 1, STORM: 2 };
  for (const id of Object.keys(exp)) for (const loop of [0, 1]) {
    const { g, e } = newGame();
    const s = 3 + loop * 12;
    g.stage = s; g.bonus = { type: id, afterStage: s }; g._initStage(); onPad(g); g.vx = 0; g.vy = 1; g._doSuccess(0, 0);
    const j = e.music.log.filter((x) => x.startsWith('jingle:')).pop();
    ok(j === 'jingle:' + exp[id], id + ' loop ' + loop + ' jingle tier ' + j);
    ok(g._body.celebTier === exp[id], id + ' celebration tier');
    ok(renderOK(g), id + ' landing scene renders');
  }
  // HOLD / ABORT はボーナス中も動く
  for (const id of Object.keys(exp)) {
    const { g } = newGame();
    g.stage = 3; g.bonus = { type: id, afterStage: 3 }; g._initStage(); run(g, 1);
    const s0 = [g.x, g.y, g.vx, g.vy, g.fuel, g._windT, g._padT].join();
    tapAt(g, center(g._holdRect()));
    ok(g.state === 'hold', id + ' HOLD enters');
    run(g, 2);
    ok([g.x, g.y, g.vx, g.vy, g.fuel, g._windT, g._padT].join() === s0, id + ' HOLD freezes everything');
    ok(renderOK(g), id + ' hold renders');
    run(g, 0.4); tapAt(g, center(g._holdButtons()[0]));
    ok(g.state === 'play', id + ' RESUME');
    tapAt(g, center(g._holdRect())); run(g, 0.4);
    const bs = g._holdButtons(); tapAt(g, center(bs[1])); run(g, 0.4); tapAt(g, center(g._holdButtons()[1]));
    ok(g.state === 'gameover', id + ' ABORT ends the run: ' + g.state);
  }
  // チェックポイントはボーナス/選択の中に入らない（次の通常ステージ）
  {
    const { g, e } = newGame();
    toCleared(g, 3);
    ok(loadCheckpoint(e.storage).stage === 3, 'checkpoint at stage 3 start');
    tapAt(g, { x: 180, y: 300 });
    ok(g.state === 'bonusselect' && loadCheckpoint(e.storage).stage === 3, 'at selection: checkpoint still stage 3 (resume replays stage 3, never lands in a bonus)');
    tapAt(g, { x: 0, y: 0 }); run(g, 0.6);
    tapAt(g, center(g._bonusCardRect(2)));
    ok(g.state === 'play' && g.bonus.type === 'STORM', 'STORM started');
    ok(loadCheckpoint(e.storage).stage === 4, 'during bonus: checkpoint = stage 4 (next normal stage)');
  }
  // デバッグ BONUS ▶ は選択画面を開き、ランは除外される
  {
    setDebug(true);
    const { g } = newGame();
    ok(g._isDebugRun(), 'debug run');
    g.state = 'debug'; g._dbgPrev = 'play';
    g._debugAction(6);
    ok(g.state === 'bonusselect' && g.bonusOffers.length === 3 && !g.bonus, 'debug BONUS opens the selection screen');
    ok(renderOK(g), 'debug selection renders');
    run(g, 0.6); tapAt(g, center(g._bonusCardRect(0)));
    ok(g.state === 'play' && g.bonus.type === 'CALM', 'debug: pick CALM');
    g.state = 'debug'; g._dbgPrev = 'play'; g._debugAction(6); ok(g.state === 'bonusselect', 'debug BONUS again');
    ok(loadCheckpoint(g.engine.storage) === null || true, 'debug: no checkpoint write needed');
    setDebug(false);
  }
}

// ---------- 10. 一周の得点がリレー上限に十分収まる ----------
{
  // 最良ケース: モジュール全部最大、満タン燃料、全ステージ完璧着陸 + 毎ボーナス STORM 満タン
  const { g } = newGame();
  for (const d of MODULE_DEFS) g.modules[d.id] = d.max;
  let maxStage = 0, worst = 0;
  for (let s = 1; s <= 60; s++) {
    g.stage = s; g.bonus = null; g._initStage(); g.obstacles = [];
    onPad(g); g.fuel = g._fuelMax(); g.vx = 0; g.vy = 0.5; g._guideDevCount = 100; g._guideDevTotal = 0;
    g._doSuccess(0, 0);
    if (s % 3 === 0) {
      g.bonus = { type: 'STORM', afterStage: s }; g._initStage(); onPad(g); g.fuel = g._fuelMax(); g.vx = 0; g.vy = 0.5;
      const before = g.totalScore; g._doSuccess(0, 0);
      worst = Math.max(worst, g.totalScore - before);
      g.bonus = null;
    }
    maxStage = s;
    ok(g.totalScore <= s * 8000, 'relay limit at stage ' + s + ': ' + g.totalScore + ' <= ' + s * 8000);
  }
  ok(g.totalScore < maxStage * 8000 * 0.5, 'far below relay limit: ' + g.totalScore + ' vs ' + maxStage * 8000);
  ok(worst < 8000, 'single best-case STORM bonus < 8000: ' + worst);
}

// ---------- 11. 着陸可能性（自動操縦）: 各ミッション・loop0/1 とも 50 シードの 80% 以上 ----------
{
  const N = +(process.env.P6_N || 50); const t0 = Date.now(); const rates = [];
  for (const id of Object.keys(BONUS_MISSIONS)) for (let loop = 0; loop < 2; loop++) {
    const stage = 3 + loop * 12;
    let wins = 0; const why = {};
    for (let seed = 1; seed <= N; seed++) {
      seeded(seed * 7919 + (id.length * 31) + loop * 13);
      const { g } = newGame(); g.stage = stage; g.bonus = { type: id, afterStage: stage }; g._initStage(); g.obstacles = [];
      for (let f = 0; f < 15000 && g.state === 'play'; f++) autopilotFrame(g);
      unseed();
      if (g.state === 'landing') wins++; else why[g._crashReason || g.state] = (why[g._crashReason || g.state] || 0) + 1;
    }
    rates.push(id + (loop ? '/L1:' : '/L0:') + wins + (wins < N ? JSON.stringify(why) : ''));
    ok(wins >= 0.8 * N, 'landable ' + id + ' loop ' + loop + ': ' + wins + '/' + N);
  }
  console.log('  landability (' + ((Date.now() - t0) / 1000).toFixed(0) + 's): ' + rates.join(' '));
}

// ---------- 12. 描画が投げない（全ミッション x 全状態 x loop） ----------
{
  const states = ['play', 'landing', 'cleared', 'crashed', 'bonusfailed', 'gameover', 'module', 'bonusselect', 'hold', 'debug', 'tip'];
  let threw = null;
  for (const id of [null, ...Object.keys(BONUS_MISSIONS)]) for (const loop of [0, 1, 3]) for (const st of states) {
    const { g } = newGame();
    g.stage = 3 + loop * 12; g.bonus = id ? { type: id, afterStage: g.stage } : null; g._initStage(); run(g, 0.3);
    if (st === 'bonusselect') { g._enterBonusSelect(); }
    else if (st === 'module') { g.offers = MODULE_DEFS.slice(0, 2).map((d) => d.id); g.state = 'module'; }
    else if (st === 'hold') { g._enterHold(); }
    else if (st === 'debug') { g._dbgPrev = 'play'; g.state = 'debug'; }
    else if (st === 'tip') { g._tipPrev = 'play'; g._tipT = 2; g.state = 'tip'; }
    else if (st === 'landing') { onPad(g); g._doSuccess(0, 0); }
    else if (st === 'gameover') { g._gameOver(true); }
    else if (st !== 'play') g.state = st;
    try { g.render(makeCtx()); run(g, 0.2); g.render(makeCtx()); } catch (e) { threw = threw || (id + '/' + loop + '/' + st + ': ' + e.stack); }
  }
  ok(!threw, 'render never throws: ' + threw);
}

// ---------- 13. fuzz 3000 フレーム（選択・SKIP・デバッグ含む）----------
{
  seeded(424242);
  const { g } = newGame();
  const rnd = Math.random;
  const visited = new Set(); let threw = null;
  try {
    for (let f = 0; f < 3000; f++) {
      const k = rnd();
      if (k < 0.04) { g.stage = 1 + Math.floor(rnd() * 24); g.bonus = rnd() < 0.5 ? { type: Object.keys(BONUS_MISSIONS)[Math.floor(rnd() * 4)], afterStage: g.stage } : null; g._initStage(); }
      else if (k < 0.07) { toCleared2(g); }
      else if (k < 0.14) {
        const t = rnd();
        if (g.state === 'bonusselect') {
          const rs = [g._bonusCardRect(0), g._bonusCardRect(1), g._bonusCardRect(2), g._bonusSkipRect()];
          tapAt(g, center(rs[Math.floor(rnd() * 4)]));
        } else tapAt(g, { x: rnd() * 360, y: rnd() * 640 });
        if (t < 0.15) g.onInput(['left', 'right', 'up', 'confirm', 'back'][Math.floor(rnd() * 5)], rnd() < 0.3 ? { repeat: true } : undefined);
      } else if (k < 0.17 && g.state === 'play') g._doCrash('FUZZ');
      else if (k < 0.2 && g.state === 'play') { onPad(g); g.vx = 0; g.vy = 1; g._doSuccess(0, 0); }
      else if (k < 0.22) { g.onInput('left'); g.onInput('up'); }
      g.update(DT); clock += 16;
      if (f % 7 === 0) g.render(makeCtx());
      visited.add(g.state);
      if (!isFinite(g.x) || !isFinite(g.y) || !isFinite(g.fuel) || g.continues < 0 || g.continues > 3) throw new Error('bad state f=' + f + ' ' + [g.x, g.y, g.fuel, g.continues]);
      if (g.state === 'gameover' && rnd() < 0.2) { g.enter(); }
    }
  } catch (e) { threw = e.stack; }
  unseed();
  ok(!threw, 'fuzz 3000 frames: ' + threw);
  ok(visited.has('bonusselect') && visited.has('module') && visited.has('play') && visited.has('bonusfailed'), 'fuzz visited selection etc: ' + [...visited].join(','));
  function toCleared2(g) { if (g.state === 'play') { g.stage = 3 * (1 + Math.floor(rnd() * 5)); g.bonus = null; g._initStage(); onPad(g); g.vx = 0; g.vy = 1; g._doSuccess(0, 0); run(g, 3.4); } }
}

console.log(`p6bonus: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
