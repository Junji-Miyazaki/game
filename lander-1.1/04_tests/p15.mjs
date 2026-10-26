// LANDER P1.5 ヘッドレステスト。実行: node 04_tests/p15.mjs
// 天体ツアー / 大気 / モジュール / 世界ランキングnet / 名前事前入力 / デバッグ / 祝福演出
import { Game } from '../02_src/game.js';
import { BODIES, GRAVITY_BASE, stageInfo, bodyGravity, padWidth, obstacleCount, obstacleSpeed, makeWindSpec, windAt,
  celebrationParams, celebrationSequence, celebrationPose } from '../02_src/bodies.js';
import { MODULE_DEFS, newModules, rollOffers, isMaxed } from '../02_src/modules.js';
import { __setRelayUrl, relayEnabled, submitScore, fetchWorldTop } from '../02_src/net.js';
import { autopilotFrame } from '../02_src/autopilot.js';
import { setDebug, isDebug, debugLogoTap } from '../02_src/debug.js';
import { TitleScene } from '../02_src/title.js';
import { loadRanking, saveRanking, insertEntry, createRankTabs, rankTabsTap, getPlayerName } from '../02_src/ranking.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  return noop; }, set: () => true });
function makeStorage() {
  const m = new Map([['hudTipSeen', '1']]);
  return { m, getHigh: () => 0, setHigh: () => false, get: (k, d = null) => m.has(k) ? m.get(k) : d, set: (k, v) => m.set(k, String(v)) };
}
function makeEngine() {
  const e = { ctx, audio: new Proxy({}, { get: () => noop }), storage: makeStorage(), text: noop, rect: noop, stroke: noop,
    menuCalls: 0, toMenu() { e.menuCalls++; }, pointer: { down: false, x: 0, y: 0 }, touches: [] };
  return e;
}
function newGame() { const e = makeEngine(); const g = new Game(e); g.enter(); return { e, g }; }
function tick(g, sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) g.update(dt); }
const tap = (g, x = 10, y = 300) => g.onInput('tap', { x, y });
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const realRandom = Math.random;
const seeded = (seed) => { Math.random = lcg(seed); };
const unseed = () => { Math.random = realRandom; };
const onPad = (g) => { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; };
const MOONLIKE = [0, 1, 2];

// ---------- 1. stage -> body / loop mapping ----------
{
  const ids = BODIES.map(b => b.id);
  ok(ids.join() === 'moon,europa,io,mars,titan,venus', 'body order');
  for (let s = 1; s <= 30; s++) {
    const i = stageInfo(s);
    ok(i.index === Math.floor((s - 1) / 2) % 6 && i.loop === Math.floor((s - 1) / 12) && i.body === BODIES[i.index], 'mapping stage ' + s);
    ok(i.firstOfBody === (s % 2 === 1), 'firstOfBody stage ' + s);
  }
  ok(stageInfo(1).body.id === 'moon' && stageInfo(2).body.id === 'moon' && stageInfo(3).body.id === 'europa' && stageInfo(12).body.id === 'venus' && stageInfo(13).body.id === 'moon' && stageInfo(13).loop === 1, 'spot checks');
  const realG = { moon: 1.62, europa: 1.31, io: 1.80, mars: 3.71, titan: 1.35, venus: 8.87 };
  ok(BODIES.every(b => b.realG === realG[b.id]), 'real gravity table');
  // pad / obstacles / speed formulas
  ok(padWidth(1) === 54 && padWidth(12) === 22 && padWidth(13) === 46 && padWidth(24) === 22 && padWidth(2) === 51, 'pad width formula');
  ok(obstacleCount(1) === 0 && obstacleCount(2) === 2 && obstacleCount(3) === 3 && obstacleCount(12) === 7 && obstacleCount(13) === 4 + 0, 'obstacle count: ' + [1, 2, 3, 12, 13].map(obstacleCount));
  ok(obstacleSpeed(1) === 12 && obstacleSpeed(12) === 45 && obstacleSpeed(13) === 18, 'obstacle speed');
  const { g } = newGame();
  for (const s of [1, 4, 9, 13, 20, 30]) { g.stage = s; g.bonus = null; g._initStage();
    ok(g._padW === padWidth(s) && g.obstacles.length === obstacleCount(s) && g._info.index === stageInfo(s).index, 'game applies stage ' + s);
    ok(g.obstacles.every(o => o.style === stageInfo(s).body.obstacleStyle), 'obstacle style stage ' + s); }
  ok(BODIES.map(b => b.obstacleStyle).join() === 'rock,ice,lava,rock,ice,lava', 'obstacle style per body');
}

// ---------- 2. gravity formula ----------
{
  const { g } = newGame();
  for (let loop = 0; loop < 3; loop++) for (let b = 0; b < 6; b++) {
    const s = loop * 12 + b * 2 + 1;
    g.stage = s; g.bonus = null; g._initStage();
    const exp = GRAVITY_BASE * Math.sqrt(BODIES[b].realG / 1.62) * (1 + 0.15 * loop);
    ok(near(g._gravity, exp, 1e-12) && near(bodyGravity(BODIES[b], loop), exp, 1e-12), 'gravity ' + BODIES[b].id + ' loop ' + loop);
  }
  ok(near(bodyGravity(BODIES[0], 0), 0.25, 1e-12), 'moon stage1 gravity = 0.25 (no per-stage ramp)');
  g.stage = 1; g._initStage(); const g1 = g._gravity; g.stage = 2; g._initStage();
  ok(g._gravity === g1, 'stage 2 gravity == stage 1 (same body)');
}

// ---------- 3. vacuum bodies: no wind / drag / visibility ----------
{
  for (const b of MOONLIKE) {
    const { g } = newGame(); g.stage = b * 2 + 1; g._initStage(); g.obstacles = [];
    ok(g._windSpec === null && !g._body.drag && g._body.visibility === null && !g._body.heat, BODIES[b].id + ' has no atmosphere mechanics');
    g.vx = 12; g.y = 80; g.vy = 0; const vx0 = g.vx;
    tick(g, 3); ok(g.vx === vx0 && g._windAccel === 0, BODIES[b].id + ' vx unchanged without input/wind: ' + g.vx);
  }
  ok(makeWindSpec(BODIES[0], 0) === null && windAt(null, 5) === 0, 'makeWindSpec null for vacuum');
}

// ---------- 4. atmosphere params applied ----------
{
  const spec = { mars: [0.05, 0.08, 0.3], titan: [0.35, 0.06, 0.12], venus: [0.2, 0.05, 0.12] };
  for (let b = 3; b < 6; b++) {
    const body = BODIES[b];
    // drag
    let { g } = newGame(); g.stage = b * 2 + 1; g._initStage(); g.obstacles = []; g._windSpec = null;
    g.x = 180; g.y = 80; g.vx = 20; g.vy = 0; g._gravity = 0; tick(g, 1);
    const kx = Math.pow(1 - body.drag / 60, 60);
    ok(near(g.vx, 20 * kx, 0.3) && g.vx < 20, body.id + ' drag reduces vx: ' + g.vx.toFixed(2) + ' ~ ' + (20 * kx).toFixed(2));
    // vertical drag (dragY falls back to drag)
    ({ g } = newGame()); g.stage = b * 2 + 1; g._initStage(); g.obstacles = []; g._windSpec = null;
    g.x = 180; g.y = 80; g.vx = 0; g.vy = 10; g._gravity = 0; tick(g, 1);
    const dy = body.dragY !== undefined ? body.dragY : body.drag;
    ok(near(g.vy, 10 * Math.pow(1 - dy / 60, 60), 0.2), body.id + ' vertical drag: ' + g.vy.toFixed(2));
    // wind moves vx with zero input; sign/loop scaling
    ({ g } = newGame()); g.stage = b * 2 + 1; g._initStage(); g.obstacles = [];
    ok(g._windSpec && g._windSpec.freqs.length >= 2 && g._windSpec.freqs.length <= 3, body.id + ' wind spec has 2-3 sines');
    g._windSpec = { base: 1, amp: 0, freqs: [0.1, 0.2], phases: [0, 0] }; g._body = Object.assign({}, g._body, { drag: 0 });
    g.x = 180; g.y = 80; g.vx = 0; g.vy = 0; g._gravity = 0; tick(g, 2);
    ok(near(g.vx, 2, 0.05), body.id + ' wind changes vx without input: ' + g.vx.toFixed(3));
    // parameters (tuned values; see LOG)
    ok(body.drag === spec[body.id][0] && body.wind.base === spec[body.id][1] && body.wind.gust === spec[body.id][2], body.id + ' atmosphere params');
  }
  // wind magnitude, random sign, loop scaling
  seeded(77);
  const signs = new Set(); let maxA = 0;
  for (let i = 0; i < 40; i++) { const w = makeWindSpec(BODIES[3], 0); signs.add(Math.sign(w.base)); for (let t = 0; t < 200; t += 0.5) maxA = Math.max(maxA, Math.abs(windAt(w, t))); }
  ok(signs.size === 2, 'wind base sign is random per stage');
  ok(maxA <= 0.08 + 0.3 + 1e-9, 'wind bounded by base+gust: ' + maxA.toFixed(3));
  const w0 = makeWindSpec(BODIES[3], 0), w2 = makeWindSpec(BODIES[3], 2);
  ok(near(Math.abs(w2.base) / Math.abs(w0.base), 1.6, 1e-9) && near(w2.amp / w0.amp, 1.6, 1e-9), 'wind x(1+0.3*loop)');
  unseed();
  // visibility radius / haze / heat tokens
  ok(BODIES[4].visibility === 150 && BODIES[5].visibility === 110 && BODIES[3].visibility === null && BODIES[0].visibility === null, 'visibility radii titan150 venus110 mars null');
  ok(BODIES[3].visual.haze && BODIES[3].visual.haze.color && BODIES[4].visual.haze === null, 'mars haze token (visual only)');
  for (const b of BODIES) {
    const v = b.visual;
    ok(Array.isArray(v.sky) && v.sky.length === 2 && v.ground && v.rim && v.accent && 'fog' in v && 'skyObject' in v && typeof v.mood === 'string', b.id + ' visual tokens');
  }
  ok(BODIES.map(b => b.visual.skyObject).join() === 'earth,jupiter,jupiter,phobos,saturn,sun-glow', 'sky objects');
  // render fog / haze / beacon without error in each atmosphere body
  for (let b = 0; b < 6; b++) { const { g } = newGame(); g.stage = b * 2 + 1; g._initStage(); tick(g, 0.5); g.render(ctx); }
  ok(true, 'render each body ok');
  // fog gradient is created with the right radius and the beacon is drawn after it
  const calls = [];
  const spyCtx = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient') ? (...a) => { calls.push(['grad', a]); return { addColorStop: noop }; }
    : (k === 'arc') ? (...a) => calls.push(['arc', a]) : (k === 'measureText' ? () => ({ width: 10 }) : noop), set: () => true });
  const { g: gt } = newGame(); gt.stage = 9; gt._initStage(); gt.render(spyCtx);
  const gi = calls.findIndex(c => c[0] === 'grad' && c[1][5] === 150);   // P2a: 空/船のグラデも radial なので、霧(半径=visibility)を半径で特定
  ok(gi >= 0 && calls[gi][1][5] === 150, 'titan fog radial gradient radius 150');
  ok(calls.slice(gi).some(c => c[0] === 'arc' && Math.abs(c[1][0] - (gt.pad.x + gt.pad.w / 2)) < 0.01), 'beacon drawn after fog on the pad');
  const calls2 = []; const spy2 = new Proxy({}, { get: (t, k) => (k === 'createRadialGradient') ? (...a) => { if (a[5] === 150 || a[5] === 110) calls2.push(1); return { addColorStop: noop }; } : noop, set: () => true });
  const { g: gm } = newGame(); gm.stage = 7; gm._initStage(); gm.render(spy2);
  ok(calls2.length === 0, 'mars has no fog gradient');
  // heat (venus)
  let { g: gv } = newGame(); gv.stage = 11; gv._initStage(); gv.obstacles = []; gv._windSpec = null;
  gv.x = 180; gv.y = 80; gv.vx = gv.vy = 0; gv._gravity = 0; const f0 = gv.fuel; tick(gv, 5);
  ok(near(f0 - gv.fuel, 4, 0.05), 'venus passive fuel drain 0.8/s: ' + (f0 - gv.fuel).toFixed(3));
  const { g: gm2 } = newGame(); gm2.stage = 1; gm2._initStage(); gm2.obstacles = []; gm2.x = 180; gm2.y = 80; gm2._gravity = 0;
  const fm = gm2.fuel; for (let i = 0; i < 60; i++) { gm2.onInput('up'); gm2.update(1 / 60); }
  ok(near(fm - gm2.fuel, 5, 0.05), 'moon main engine 5/s');
  gv.fuel = gv._fuelMax(); gv.x = 180; gv.y = 80; gv.vx = gv.vy = 0; gv._thrustMain = false;
  const fv = gv.fuel; for (let i = 0; i < 60; i++) { gv.onInput('up'); gv.update(1 / 60); }
  ok(near(fv - gv.fuel, 5 * 1.3 + 0.8, 0.1), 'venus main engine x1.3 + drain: ' + (fv - gv.fuel).toFixed(3));
}

// ---------- 5. landability (PD autopilot): >= 80% of 50 seeds per body, loops 0 and 1 ----------
{
  const N = 50; const t0 = Date.now(); const rates = [];
  for (let loop = 0; loop < 2; loop++) for (let b = 0; b < 6; b++) {
    const stage = loop * 12 + b * 2 + 2;   // 各天体の2番目のステージ（パッドが狭い方）
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) {
      seeded(seed * 7919 + b);
      const { g } = newGame(); g.stage = stage; g.bonus = null; g._initStage(); g.obstacles = [];   // 障害物は大気と無関係のため除外
      for (let f = 0; f < 15000 && g.state === 'play'; f++) autopilotFrame(g);
      unseed();
      if (g.state === 'landing') wins++;
    }
    rates.push(BODIES[b].id + (loop ? '/L1' : '/L0') + ':' + wins);
    ok(wins >= 0.8 * N, 'landable ' + BODIES[b].id + ' loop ' + loop + ': ' + wins + '/' + N);
  }
  console.log('  landability (' + ((Date.now() - t0) / 1000).toFixed(0) + 's): ' + rates.join(' '));
}

// ---------- 6. modules ----------
{
  // offers
  seeded(5);
  let allDistinct = true, n2 = 0;
  for (let i = 0; i < 500; i++) { const o = rollOffers(newModules()); if (o.length === 2) n2++; if (new Set(o).size !== o.length) allDistinct = false; }
  ok(allDistinct && n2 === 500, 'offers: 2 distinct each time');
  const mods = newModules(); mods.stab = 2; mods.radar = 1;
  let leaked = false; for (let i = 0; i < 500; i++) { const o = rollOffers(mods); if (o.some(id => isMaxed(mods, id))) leaked = true; if (o.length !== 2) leaked = true; }
  ok(!leaked, 'maxed modules never offered (3 left -> 2 offers)');
  mods.shock = 2; ok(rollOffers(mods).join() === 'shield', 'only 1 candidate -> 1 offer');
  mods.shield = 2; ok(rollOffers(mods).length === 0, 'all maxed -> no offers');
  unseed();
  ok(MODULE_DEFS.map(d => d.id + d.max).join() === 'stab2,shock2,radar1,shield2', 'module pool and max levels');

  // flow: bonus resolves -> module state -> pick -> next stage
  let { e, g } = newGame();
  g.stage = 3; g.bonus = { type: 'ROVER' }; g._initStage();
  onPad(g); g.vy = 1; g._doSuccess(0, 0); tick(g, 4.2); tap(g);
  ok(g.state === 'module' && g.offers.length === 2 && g.stage === 3, 'bonus success -> module state (stage not advanced yet)');
  ok(g.blocksBack() === true, 'blocksBack during module choice');
  g.render(ctx);
  tap(g, 100, 200);
  ok(g.state === 'module', 'tap ignored during input lock');
  tick(g, 0.6); g.onInput('back'); ok(g.state === 'module', 'back ignored in module state');
  const chosen = g.offers[1]; const r = g._moduleCardRect(1);
  tap(g, r.x + 5, r.y + 5);
  ok(g.state === 'play' && g.stage === 4 && g.modules[chosen] === 1 && !g.bonus && g.blocksBack() === false, 'tap card -> module taken, stage 4 starts');
  // failure also offers
  ({ g } = newGame()); g.stage = 3; g.bonus = { type: 'STORM' }; g._initStage(); g._doCrash('X'); tick(g, 0.6); tap(g);
  ok(g.state === 'module', 'bonus failure -> module offer');
  tick(g, 0.6); g.onInput('left'); ok(g.state === 'play' && g.stage === 4, 'keyboard picks card 0');
  // all maxed -> skipped
  ({ g } = newGame()); for (const d of MODULE_DEFS) g.modules[d.id] = d.max;
  g.stage = 3; g.bonus = { type: 'CALM' }; g._initStage(); g._doCrash('X'); tick(g, 0.6); tap(g);
  ok(g.state === 'play' && g.stage === 4, 'all maxed -> no offer, next stage');
  // persistence through continue, reset on new run
  ({ e, g } = newGame()); g.modules.fuel = 2; g.modules.radar = 1;
  g._doCrash('C'); tick(g, 0.6); tap(g);
  ok(g.state === 'play' && g.modules.fuel === 2 && g.modules.radar === 1, 'modules survive continue');
  ok(near(g.fuel, 150, 1e-9), 'fuel tank persists into the restarted stage');
  g.enter(); ok(Object.values(g.modules).every(v => v === 0), 'new run (enter) resets modules');
  const g2 = new Game(e); g2.enter(); ok(Object.values(g2.modules).every(v => v === 0), 'fresh Game has no modules');

  // effects
  ({ g } = newGame());
  ok(g._fuelMax() === 100 && g._angDamp() === 0.82 && g._safeVy() === 22 && g._bounceVy() === 45, 'baseline values');
  g.modules.fuel = 1; g._initStage(); ok(g.fuel === 125, 'FUEL TANK lvl1 +25%');
  g.modules.fuel = 2; g._initStage(); ok(g.fuel === 150, 'FUEL TANK lvl2 +50%');
  g.bonus = { type: 'CALM' }; g._initStage(); ok(near(g.fuel, 150, 1e-9), 'P6: bonus missions start with the full (module-scaled) tank'); g.bonus = null;
  g.modules.stab = 1; ok(g._angDamp() === 0.6, 'STABILIZER lvl1 0.6'); g.modules.stab = 2; ok(g._angDamp() === 0.45, 'STABILIZER lvl2 0.45');
  { const a = newGame().g, b = newGame().g; a.obstacles = b.obstacles = []; b.modules.stab = 2; a.omega = b.omega = 10; a.y = b.y = 80; a._gravity = b._gravity = 0; a.angle = b.angle = 0;
    tick(a, 1); tick(b, 1); ok(near(a.omega, 8.2, 0.05) && near(b.omega, 4.5, 0.05), 'damping effect on omega: ' + a.omega.toFixed(2) + '/' + b.omega.toFixed(2)); }
  g.modules.shock = 1; ok(g._safeVy() === 28 && g._bounceVy() === 53, 'SHOCK lvl1'); g.modules.shock = 2; ok(g._safeVy() === 34 && g._bounceVy() === 61, 'SHOCK lvl2');
  { // vy=30 on the pad: bounce without module, clean landing with lvl1+
    const mk = (lv) => { const { g } = newGame(); g.modules.shock = lv; g._initStage(); g.obstacles = []; g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16 - 0.01; g.vx = 0; g.vy = 26; g.angle = 0; g.omega = 0; g.update(1 / 60); return g; };
    ok(mk(0)._bouncing === true && mk(0).state === 'play', 'vy 26 bounces without absorber');
    ok(mk(1).state === 'landing', 'vy 26 lands with SHOCK lvl1 (safe 28)');
    const hard = (lv) => { const { g } = newGame(); g.modules.shock = lv; g._initStage(); g.obstacles = []; g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16 - 0.01; g.vx = 0; g.vy = 56; g.update(1 / 60); return g.state; };
    ok(hard(0) !== 'play' && hard(1) !== 'play' && hard(2) === 'play', 'vy 56: crash at lvl0/1 (limits 45/53), bounce at lvl2 (61)'); }
  // HUD with all modules renders
  for (const d of MODULE_DEFS) g.modules[d.id] = d.max; g._initStage(); g.render(ctx);

  // RADAR prediction accuracy vs real ballistic path
  for (const [stage, label] of [[1, 'moon'], [7, 'mars'], [9, 'titan'], [11, 'venus']]) {
    let worst = 0;
    for (let s = 1; s <= 8; s++) {
      seeded(s * 31 + stage);
      const { g } = newGame(); g.modules.radar = 1; g.stage = stage; g._initStage(); g.obstacles = [];
      g.vx = (Math.random() - 0.5) * 20; g.vy = 1 + Math.random() * 3;
      const pr = g.predictLanding();
      for (let f = 0; f < 30000 && g.state === 'play'; f++) g.update(1 / 60);
      unseed();
      worst = Math.max(worst, Math.abs(pr.x - g.x));
      ok(pr.hit, 'prediction hits terrain (' + label + ')');
    }
    ok(worst < 3, 'RADAR prediction vs simulated path ' + label + ': worst dx=' + worst.toFixed(2));
  }
  { const { g } = newGame(); g.modules.radar = 1; g._initStage(); g.render(ctx); ok(true, 'radar render'); }

  // SHIELD
  { const { g } = newGame(); g.modules.shield = 1; g.stage = 3; g._initStage();
    ok(g._shieldReady === true, 'shield ready at stage start');
    g._gravity = 0; g.vx = g.vy = 0; g.x = 180; g.y = 200;
    g.obstacles = [{ x: 180, y: 200, vx: 0, r: 12, style: 'rock' }, { x: 100, y: 300, vx: 0, r: 12, style: 'rock' }];
    g.update(1 / 60);
    ok(g.state === 'play' && g._shieldReady === false && g._shieldFlash > 0, 'first hit absorbed, flash on');
    g.update(1 / 60); ok(g.state === 'play', 'absorbed obstacle does not hit again');
    g.x = 100; g.y = 300; g.update(1 / 60);
    ok(g.state === 'crashed' && g._crashReason === 'HIT AN OBSTACLE', 'second hit in the same stage crashes');
    g.render(ctx);
    // recharge next stage
    g.continues = 3; g._initStage(); ok(g._shieldReady === true, 'shield recharges each stage');
    const { g: n } = newGame(); n.stage = 3; n._initStage(); n._gravity = 0; n.x = 180; n.y = 200; n.vx = n.vy = 0;
    n.obstacles = [{ x: 180, y: 200, vx: 0, r: 12, style: 'rock' }]; n.update(1 / 60);
    ok(n.state === 'crashed', 'without shield a hit crashes'); }
  // SHIELD Lv2: ステージ毎に2回吸収、3回目でクラッシュ、次ステージで2回分に回復
  { const { g } = newGame(); g.modules.shield = 2; g.stage = 3; g._initStage();
    ok(g._shieldCharges === 2, 'shield lv2 starts with 2 charges');
    g._gravity = 0; g.vx = g.vy = 0;
    g.obstacles = [{ x: 180, y: 200, vx: 0, r: 12, style: 'rock' }, { x: 100, y: 300, vx: 0, r: 12, style: 'rock' }, { x: 260, y: 350, vx: 0, r: 12, style: 'rock' }];
    g.x = 180; g.y = 200; g.update(1 / 60); ok(g.state === 'play' && g._shieldCharges === 1, 'lv2: 1st hit absorbed');
    g.render(ctx);
    g.x = 100; g.y = 300; g.update(1 / 60); ok(g.state === 'play' && g._shieldCharges === 0, 'lv2: 2nd hit absorbed');
    g.x = 260; g.y = 350; g.update(1 / 60); ok(g.state === 'crashed', 'lv2: 3rd hit crashes');
    g.continues = 3; g._initStage(); ok(g._shieldCharges === 2, 'lv2: recharges to 2 next stage'); }
}

// ---------- 7. balance: bonus multipliers, per-stage score < 8000 with maxed modules ----------
{
  let worst = 0;
  for (const bonus of [null, 'CALM', 'ROVER', 'CROSSWIND', 'STORM']) for (const stage of [1, 6, 12, 24, 36, 60]) {
    const { g } = newGame(); for (const d of MODULE_DEFS) g.modules[d.id] = d.max;
    g.stage = stage; g.bonus = bonus ? { type: bonus } : null; g._initStage();
    g.fuel = g._fuelMax(); onPad(g); g.vx = 0; g.vy = 0; g.angle = 0; g.omega = 0;
    g._guideDevCount = 1; g._guideDevTotal = 0;   // 誘導ボーナス最大
    g._doSuccess(0, 0);
    worst = Math.max(worst, g._stageScore);
    if (bonus === 'STORM') ok(g._bonusScore === Math.round((600 + g._fuelMax() * 10) * 2.5), 'P6: STORM x2.5 with a full tank: ' + g._bonusScore);
  }
  ok(worst < 8000, 'max per-stage score with all modules maxed < 8000: ' + worst);
  const { g: gn } = newGame(); gn.bonus = { type: 'STORM' }; gn._initStage(); gn.fuel = 100; onPad(gn); gn._doSuccess(0, 0);
  ok(gn._bonusScore === 4000, 'P6: STORM x2.5 baseline (600+1000)*2.5 = 4000: ' + gn._bonusScore);
}

// ---------- 8. net.js ----------
const realFetch = globalThis.fetch;
{
  const calls = []; const mkFetch = (impl) => async (url, init) => { calls.push({ url, init }); return impl(url, init); };
  // disabled
  __setRelayUrl('');
  globalThis.fetch = mkFetch(() => ({ ok: true, json: async () => ({ top: [] }) }));
  ok(relayEnabled() === false, 'relay off by default/empty');
  const r0 = await submitScore({ name: 'A', score: 1, stage: 1 }); const w0 = await fetchWorldTop();
  ok(r0.ok === false && w0 === null && calls.length === 0, 'RELAY_URL empty -> no network calls');
  { // game over with relay off: still no calls
    const { e, g } = newGame(); e.storage.set('lastName', 'ZED'); g.totalScore = 500; g.continues = 0; g.fuel = 0; g._doCrash('X');
    ok(calls.length === 0, 'game over with relay off: no fetch'); }
  // enabled: payload
  __setRelayUrl('https://relay.test/');
  ok(relayEnabled() === true, 'relay on after setter');
  const rs = await submitScore({ name: 'ABC', score: 1234, stage: 7, date: 'ignored', extra: 1 });
  ok(rs.ok === true && calls.length === 1 && calls[0].url === 'https://relay.test/submit' && calls[0].init.method === 'POST', 'POST /submit');
  ok(JSON.stringify(JSON.parse(calls[0].init.body)) === JSON.stringify({ name: 'ABC', score: 1234, stage: 7, board: 'v1.0' }), 'payload only {name,score,stage,board}');
  ok(calls[0].init.headers['Content-Type'] === 'application/json' && calls[0].init.signal, 'JSON header + abort signal');
  calls.length = 0;
  globalThis.fetch = mkFetch(() => ({ ok: true, json: async () => ({ top: [{ name: 'A', score: 9, stage: 2, date: 'd' }] }) }));
  const top = await fetchWorldTop();
  ok(Array.isArray(top) && top.length === 1 && calls[0].url === 'https://relay.test/ranking?board=v1.0' && calls[0].init.method === 'GET', 'GET /ranking returns array');
  globalThis.fetch = mkFetch(() => ({ ok: true, json: async () => ({ nope: 1 }) })); ok(await fetchWorldTop() === null, 'malformed body -> null');
  globalThis.fetch = mkFetch(() => ({ ok: false, status: 500, json: async () => ({}) })); ok(await fetchWorldTop() === null, 'HTTP error -> null');
  ok((await submitScore({ name: 'A', score: 1, stage: 1 })).ok === false, 'HTTP 500 -> ok:false');
  globalThis.fetch = mkFetch(() => { throw new Error('boom'); });
  { let threw = false; try { const a = await submitScore({ name: 'A', score: 1, stage: 1 }); const b = await fetchWorldTop(); ok(a.ok === false && b === null, 'thrown fetch handled'); } catch (_) { threw = true; } ok(!threw, 'never throws'); }
  globalThis.fetch = undefined; ok((await submitScore({ name: 'A', score: 1, stage: 1 })).ok === false && await fetchWorldTop() === null, 'no fetch available handled');
  // timeout via AbortController
  let aborted = false;
  globalThis.fetch = (url, init) => new Promise((res, rej) => { init.signal.addEventListener('abort', () => { aborted = true; rej(new Error('aborted')); }); });
  let t1 = Date.now(); const rt = await submitScore({ name: 'A', score: 1, stage: 1 }, 60);
  ok(rt.ok === false && aborted && Date.now() - t1 < 1000, 'submit timeout aborts the request');
  aborted = false; t1 = Date.now(); ok(await fetchWorldTop(60) === null && aborted, 'fetchWorldTop timeout -> null');
  globalThis.fetch = () => new Promise(() => {});   // signal を無視して永久に待つ fetch でも競合タイマーで解決
  ok((await submitScore({ name: 'A', score: 1, stage: 1 }, 60)).ok === false, 'timeout even if fetch ignores the signal');

  // game over -> fire-and-forget submit with the stored name; WORLD tab loading/offline
  calls.length = 0; globalThis.fetch = mkFetch(() => ({ ok: true, json: async () => ({ top: [{ name: 'W1', score: 99, stage: 3, date: 'd' }] }) }));
  { const { e, g } = newGame(); e.storage.set('lastName', 'ZED'); g.stage = 4; g.totalScore = 900; g.continues = 0; g.fuel = 0; g._doCrash('X');
    await Promise.resolve();
    ok(calls.length === 1 && calls[0].url === 'https://relay.test/submit' && JSON.parse(calls[0].init.body).name === 'ZED' && JSON.parse(calls[0].init.body).score === 900, 'game over submits to world with stored name');
    g.render(ctx);
    const tabs = g.rankTabs; ok(tabs.mode === 'local', 'overlay starts on LOCAL');
    tick(g, 0.6); const gx = 32, wr = { x: gx + Math.floor((360 - 64 - 8) / 2) + 8 + 4, y: 146 + 5 };
    tap(g, wr.x, wr.y); ok(tabs.mode === 'world' && tabs.status === 'loading' && e.menuCalls === 0, 'WORLD tab tap -> LOADING (not exit)');
    g.render(ctx); await new Promise(r => setTimeout(r, 5)); ok(tabs.status === 'ok' && tabs.world.length === 1, 'WORLD list loaded'); g.render(ctx);
    tap(g, 40, 150); ok(tabs.mode === 'local', 'LOCAL tab tap'); }
  globalThis.fetch = mkFetch(() => { throw new Error('down'); });
  { const tabs = createRankTabs(); ok(rankTabsTap(tabs, 32, 146, 250, 150, 296) && tabs.mode === 'world', 'tab tap handled'); await new Promise(r => setTimeout(r, 5)); ok(tabs.status === 'offline', 'WORLD -> OFFLINE on failure'); }
  __setRelayUrl('');
  ok(rankTabsTap(createRankTabs(), 32, 146, 250, 150, 296) === false, 'tabs inert when relay off');
  { const { g } = newGame(); g.totalScore = 10; g.continues = 0; g._doCrash('X'); g.render(ctx); ok(true, 'ranking render without tabs'); }
  globalThis.fetch = realFetch;
}

// ---------- 9. name before play / auto record ----------
{
  const { e, g } = newGame(); e.storage.set('lastName', 'KAI');
  g.stage = 3; g.totalScore = 400; g.continues = 0; g.fuel = 0; g._doCrash('X');
  ok(g.state === 'gameover' && g.goPhase === 'ranking' && g.newIdx === 0, 'game over: no name prompt, auto-recorded');
  ok(loadRanking(e.storage)[0].name === 'KAI' && loadRanking(e.storage)[0].stage === 3, 'recorded with stored name and stage');
  g.render(ctx);
  const x = newGame(); x.g.totalScore = 0; x.g.continues = 0; x.g.fuel = 0; x.g._doCrash('X');
  ok(x.g.newIdx === -1 && loadRanking(x.e.storage).length === 0, 'non-qualifying run not recorded');
  // title
  const te = makeEngine(); let started = 0; const t = new TitleScene(te, () => started++); t.enter(); t.render(ctx);
  t.onInput('tap', { x: 10, y: 600 }); ok(started === 0 && t.pendingStart, 'no name -> START opens name entry first');
  t._submitName('  Neo  '); ok(started === 1 && getPlayerName(te.storage) === 'Neo', 'submit -> stored, game starts');
  t.enter(); t.render(ctx); ok(t.name === 'Neo', 'title shows stored pilot');
  const cb = t.changeBtn; t.onInput('tap', { x: cb.x + 3, y: cb.y + 3 }); ok(started === 1 && !t.pendingStart, 'CHANGE opens overlay without starting');
  t._submitName('Trinity'); ok(started === 1 && t.name === 'Trinity', 'CHANGE updates name only');
  t.onInput('tap', { x: 10, y: 600 }); ok(started === 2, 'START with stored name begins immediately');
  t._submitName('日本語の名前ですよろしくおねがいします'); ok(Array.from(t.name).length === 10, 'name cut to 10 chars');
}

// ---------- 10. debug mode ----------
{
  setDebug(false);
  ok(!isDebug(), 'debug off by default');
  globalThis.location = { search: '?debug' }; ok(isDebug(), '?debug query activates'); globalThis.location = { search: '?x=1&debug=1' }; ok(isDebug(), '?debug=1 activates');
  globalThis.location = { search: '?nodebug' }; ok(!isDebug(), 'unrelated query does not activate'); delete globalThis.location;
  ok(debugLogoTap(0) === false && debugLogoTap(400) === false && debugLogoTap(800) === false && debugLogoTap(1200) === false && debugLogoTap(1600) === true && isDebug(), '5 logo taps within 2s activate');
  setDebug(false);
  [0, 500, 1000, 1500].forEach(t => debugLogoTap(t)); ok(debugLogoTap(2100) === false && !isDebug(), '5th tap after >2s window does not activate');
  setDebug(false);
  // via the title scene
  const te = makeEngine(); let started = 0; const t = new TitleScene(te, () => started++); t.enter();
  const lb = t.logoBox; for (let i = 0; i < 5; i++) t.onInput('tap', { x: lb.x + 10, y: lb.y + 10, now: 100 * i });
  ok(isDebug() && t.toastT > 0 && started === 0, 'title logo x5 -> DEBUG ON toast, game not started');
  t.render(ctx); setDebug(false);
  ok(!(function () { try { return JSON.stringify([...te.storage.m.entries()]).includes('debug'); } catch (_) { return false; } })(), 'debug not persisted to storage');

  setDebug(true);
  const open = (g) => { g.render(ctx); const b = g._dbgBtnRect(); tap(g, b.x + 3, b.y + 3); };
  const press = (g, i) => { const b = g._dbgButtons()[i]; tap(g, b.x + 5, b.y + 5); };
  { const { g } = newGame(); g.render(ctx);
    const b = g._dbgBtnRect();
    ok(b.x + b.w <= 360 && b.y >= 94 && b.x > 200, 'DBG button top-right below the HUD (no BACK/HUD collision)');
    open(g); ok(g.state === 'debug', 'DBG tap opens panel (paused)');
    const y0 = g.y; tick(g, 1); ok(g.y === y0, 'game paused while panel is open'); g.render(ctx);
    press(g, 10); ok(g.state === 'play', 'CLOSE resumes');
    open(g); press(g, 8); ok(g.fuel === 100 && g.state === 'play', 'FUEL FULL');
    g.fuel = 10; open(g); press(g, 8); ok(g.fuel === 100, 'FUEL FULL refills');
    open(g); press(g, 9); ok(g.continues === 6 && g.state === 'play', '+3 CONTINUES'); g.render(ctx);
    open(g); press(g, 4); ok(g.stage === 2 && g.state === 'play', 'STAGE +');
    open(g); press(g, 3); open(g); press(g, 3); ok(g.stage === 1, 'STAGE - (min 1)');
    open(g); press(g, 5); ok(g.stage === 3 && g._body.id === 'europa', 'NEXT BODY');
    open(g); press(g, 5); ok(g.stage === 5 && g._body.id === 'io', 'NEXT BODY again');
    // P6: BONUS ▶ はミッション選択画面を開く（旧: 種類を順に切替）
    open(g); press(g, 6); ok(g.state === 'bonusselect' && g.bonusOffers.length === 3 && !g.bonus, 'BONUS opens the mission selection'); g.render(ctx);
    tick(g, 0.6); { const r = g._bonusCardRect(1); tap(g, r.x + 5, r.y + 5); } ok(g.state === 'play' && !!g.bonus, 'selection pick starts a mission');
    open(g); press(g, 6); tick(g, 0.6); { const r = g._bonusSkipRect(); tap(g, r.x + 5, r.y + 5); } ok(g.state === 'module' && !g.bonus, 'SKIP BONUS from the debug-opened selection -> module choice'); tick(g, 0.6); g._pickModule(0);
    open(g); press(g, 7); ok(g.state === 'module' && g.offers.length === 2 && !g.bonus, 'MODULE opens choice'); g.render(ctx);
    tick(g, 0.6); g._pickModule(0);
    open(g); press(g, 2); ok(g.state === 'crashed' && g._crashReason === 'DEBUG CRASH', 'CRASH');
    g.render(ctx);
    open(g); ok(g.state === 'debug', 'panel opens from crashed state'); press(g, 10); ok(g.state === 'crashed', 'CLOSE returns to previous state');
    open(g); press(g, 1); ok(g.state === 'landing' && g._perfect === true, 'WIN NOW -> perfect landing sequence');
    g.render(ctx); tick(g, 3); ok(g.state === 'cleared', 'WIN NOW proceeds to cleared'); g.render(ctx);
    ok(g.totalScore > 0, 'WIN NOW scored'); }
  // AUTO LAND flies and lands on every body
  { let wins = 0, tries = 0;
    for (let b = 0; b < 6; b++) for (let s = 1; s <= 6; s++) {
      seeded(s * 131 + b); const { g } = newGame(); g.stage = b * 2 + 2; g._initStage(); unseed();
      open(g); press(g, 0); ok(g.state === 'play' && g._auto === true, 'AUTO LAND engaged');
      for (let f = 0; f < 15000 && g.state === 'play'; f++) g.update(1 / 60);
      tries++; if (g.state === 'landing') wins++;
    }
    ok(wins >= 0.8 * tries, 'AUTO LAND lands on every body: ' + wins + '/' + tries);
    const { g } = newGame(); g.stage = 4; g._initStage(); open(g); press(g, 0); g.state === 'play'; g._doCrash('x'); g._initStage(); ok(g._auto === false, 'auto cleared on new stage'); }
  // debug runs never enter ranking / world submit
  const sf = []; globalThis.fetch = async (u, i) => { sf.push(u); return { ok: true, json: async () => ({ top: [] }) }; }; __setRelayUrl('https://relay.test');
  { const { e, g } = newGame(); e.storage.set('lastName', 'DBG'); g.totalScore = 5000; g.continues = 0; g.fuel = 0; g._doCrash('X');
    await Promise.resolve();
    ok(g.state === 'gameover' && loadRanking(e.storage).length === 0 && g.newIdx === -1 && sf.length === 0, 'debug-on run: not in local ranking, not submitted'); g.render(ctx); }
  setDebug(false);
  { const { e, g } = newGame(); e.storage.set('lastName', 'DBG'); g.totalScore = 5000; g.continues = 0;
    g.render(ctx); g._dbgTainted = true; g.fuel = 0; g._doCrash('X'); await Promise.resolve();
    ok(loadRanking(e.storage).length === 0 && sf.length === 0, 'run that used a debug action: excluded even after debug is off'); }
  { const { e, g } = newGame(); e.storage.set('lastName', 'REAL'); g.totalScore = 5000; g.continues = 0; g.fuel = 0; g._doCrash('X'); await Promise.resolve();
    ok(loadRanking(e.storage).length === 1 && sf.length === 1, 'sanity: normal run is recorded and submitted'); }
  __setRelayUrl(''); globalThis.fetch = realFetch;
  { const { g } = newGame(); g.render(ctx); const b = g._dbgBtnRect(); tap(g, b.x + 3, b.y + 3); ok(g.state === 'play', 'DBG inert when debug is off'); }
}

// ---------- 11. celebration + clear panel ----------
{
  // panel never overlaps the scene: bottom >= 90px above the pad
  seeded(4242);
  let worstGap = 1e9;
  for (let i = 0; i < 400; i++) {
    const { g } = newGame(); g.stage = 1 + (i % 36); g.bonus = (i % 5 === 0) ? { type: 'ROVER' } : null; g._initStage();
    const r = g._clearPanelRect(); worstGap = Math.min(worstGap, g.pad.y - (r.y + r.h));
  }
  unseed();
  ok(worstGap >= 90, 'clear panel bottom >= 90px above the pad over 400 terrains; min gap=' + worstGap.toFixed(1));
  const rr = newGame().g._clearPanelRect(); ok(rr.y >= 70 && rr.y + rr.h <= 365, 'panel within y 70..365');

  // the scene keeps rendering in 'cleared' (craft, astronaut with pose) and loops
  { const { g } = newGame(); g.stage = 7; g._initStage(); onPad(g); g.vy = 1; g._doSuccess(0, 0);
    let astro = [], craft = 0, flag = 0;
    g._drawAstronaut = (c, x, y, ph, t, pose) => astro.push({ ph, pose, y }); g._drawLander = () => craft++; g._drawLandingFlag = () => flag++;
    tick(g, 3.0); ok(g.state === 'cleared', 'cleared reached'); astro.length = 0; craft = 0;
    g.render(ctx); ok(astro.length === 1 && astro[0].ph === 'done' && astro[0].pose && craft === 1 && flag >= 1, 'cleared still draws craft + flag + astronaut with pose');
    const poses = []; for (let i = 0; i < 400; i++) { g.update(1 / 60); astro.length = 0; g.render(ctx); poses.push(astro[0].pose); }
    ok(g.state === 'cleared' && poses.every(p => p && Number.isFinite(p.dy) && Number.isFinite(p.rot) && Number.isFinite(p.armL) && Number.isFinite(p.armR)), 'pose params: dy/rot/armL/armR finite while waiting');
    ok(Math.max(...poses.map(p => p.dy)) > 5 && Math.min(...poses.map(p => p.dy)) === 0, 'astronaut keeps jumping while cleared'); }
  { // tap skip during landing jumps to celebration time
    const { g } = newGame(); onPad(g); g.vy = 1; g._doSuccess(0, 0); tick(g, 0.7); tap(g);
    ok(g.state === 'cleared' && g.landingSeq && g.landingSeq.t >= 2.6, 'skipping the landing sequence enters the celebration loop'); g.render(ctx);
    tick(g, 1.5); tap(g); ok(g.state === 'play' && g.landingSeq === null, 'tap after cleared starts next stage'); }

  // apex / airtime follow gravity
  const P = (id) => celebrationParams(BODIES.find(b => b.id === id));
  ok(P('europa').apex > P('moon').apex && P('moon').apex > P('io').apex && P('io').apex > P('mars').apex && P('mars').apex > P('venus').apex, 'apex decreases with gravity');
  ok(P('europa').airtime > P('moon').airtime && P('moon').airtime > P('mars').airtime && P('mars').airtime > P('venus').airtime, 'airtime decreases with gravity');
  ok(BODIES.every(b => { const c = celebrationParams(b); return c.apex >= 12 && c.apex <= 40 && c.airtime >= 0.45 && c.airtime <= 1.9; }), 'apex/airtime clamped on-screen');
  // measured from pose function
  for (const b of BODIES) {
    const { apex, airtime } = celebrationParams(b);
    let maxDy = 0; for (let t = 0; t < 10; t += 0.01) maxDy = Math.max(maxDy, celebrationPose(b, 0, t, false).dy);
    ok(near(maxDy, apex, 0.6), b.id + ' measured apex ' + maxDy.toFixed(1) + ' ~ ' + apex.toFixed(1));
    const hop = celebrationSequence(b, 0).find(s => s.kind === 'hop'); ok(near(hop.dur, airtime, 1e-9), b.id + ' hop duration = airtime');
  }
  // tier styles
  const hopsOf = (b, loop) => celebrationSequence(b, loop).filter(s => s.kind === 'hop');
  const maxRot = (b, loop) => { let m = 0, mn = 0; for (let t = 0; t < 8; t += 0.01) { const r = celebrationPose(b, loop, t, false).rot; m = Math.max(m, r); mn = Math.min(mn, r); } return [mn, m]; };
  for (const id of ['moon', 'europa']) { const b = BODIES.find(x => x.id === id); const [mn, mx] = maxRot(b, 0); ok(b.celebTier === 0 && hopsOf(b, 0).length === 1 && hopsOf(b, 0)[0].spin === 0 && mx === 0 && mn === 0, id + ' tier0: floaty hop + wave, no spin'); }
  for (const id of ['io', 'mars']) { const b = BODIES.find(x => x.id === id); const [, mx] = maxRot(b, 0); ok(b.celebTier === 1 && hopsOf(b, 0).length === 1 && mx > 6.0, id + ' tier1: hop + full 360 spin (max rot ' + mx.toFixed(2) + ')'); }
  for (const id of ['titan', 'venus']) { const b = BODIES.find(x => x.id === id); const [mn] = maxRot(b, 0); const seq = celebrationSequence(b, 0);
    ok(b.celebTier === 2 && hopsOf(b, 0).length === 2 && mn < -6.0 && seq.some(s => s.arms === 'pump'), id + ' tier2: backflip + fist pump + double jump (min rot ' + mn.toFixed(2) + ')'); }
  for (const b of BODIES) {
    ok(!celebrationSequence(b, 0).some(s => s.kind === 'dance') && celebrationSequence(b, 1).some(s => s.kind === 'dance'), b.id + ' loop>=1 adds a dance flourish');
    let dx = 0; for (let t = 0; t < 8; t += 0.01) dx = Math.max(dx, Math.abs(celebrationPose(b, 1, t, false).dx)); ok(dx > 1, b.id + ' dance moves sideways');
  }
  // perfect landing => fx; thresholds
  ok(celebrationPose(BODIES[0], 0, 1, true).fx && !celebrationPose(BODIES[0], 0, 1, false).fx, 'PERFECT adds fx burst');
  { const f = (vy, vx, ang, om) => { const { g } = newGame(); onPad(g); g.vy = vy; g.vx = vx; g._doSuccess(ang, om); return g._perfect; };
    ok(f(1, 0, 0, 0) && f(8, 3, 5, 6) && !f(9, 0, 0, 0) && !f(1, 4, 0, 0) && !f(1, 0, 6, 0) && !f(1, 0, 0, 7), 'perfect thresholds: vy<=8 vx<=3 angle<=5 omega<=6'); }
  { const { g } = newGame(); onPad(g); g.vy = 1; g._doSuccess(0, 0); tick(g, 3.1); g.render(ctx); ok(true, 'perfect celebration renders (fx)'); }
  // real astronaut drawing accepts pose with placeholder shapes
  { const { g } = newGame(); g._drawAstronaut(ctx, 100, 400, 'done', 5, celebrationPose(BODIES[5], 1, 1.3, true)); g._drawCelebFx(ctx, 100, 400, { u: 0.5, n: 8 }); ok(true, 'astronaut + fx draw with pose'); }
}

// ---------- 12. fuzz: 5000 random frames across all bodies/states ----------
{
  const { e, g } = newGame();
  const rnd = lcg(987654); const visited = new Set(); const bodiesSeen = new Set(); let threw = null;
  const savedFetch = globalThis.fetch; globalThis.fetch = async () => ({ ok: true, json: async () => ({ top: [] }) });
  try {
    for (let f = 0; f < 5000; f++) {
      const n = Math.floor(rnd() * 4); e.touches = [];
      for (let i = 0; i < n; i++) e.touches.push({ x: rnd() * 360, y: rnd() * 640 });
      e.pointer.down = e.touches.length > 0;
      const r = rnd();
      if (r < 0.04) g.onInput('tap', { x: rnd() * 360, y: rnd() * 640 });
      else if (r < 0.06) g.onInput(['left', 'right', 'up', 'down', 'confirm', 'back'][Math.floor(rnd() * 6)]);
      if (rnd() < 0.012) {
        const k = rnd();
        if (k < 0.25) { g.bonus = rnd() < 0.5 ? { type: ['CALM', 'ROVER', 'CROSSWIND', 'STORM'][Math.floor(rnd() * 4)] } : null; g.stage = 1 + Math.floor(rnd() * 40); g._initStage(); }
        else if (k < 0.45) { onPad(g); g.vy = 1; g.angle = 0; if (g.state === 'play') g._doSuccess(0, 0); }
        else if (k < 0.6) { if (g.state === 'play') g._doCrash('FUZZ'); }
        else if (k < 0.7) { g.continues = 0; if (g.state === 'play') g._doCrash('FUZZ'); }
        else if (k < 0.85) { const d = MODULE_DEFS[Math.floor(rnd() * MODULE_DEFS.length)]; g.modules[d.id] = Math.min(d.max, g.modules[d.id] + 1); }
        else setDebug(rnd() < 0.5);
      }
      if (g.state === 'module' && rnd() < 0.3) g._pickModule(Math.floor(rnd() * 2) % Math.max(1, g.offers.length));
      if (rnd() < 0.002) g.enter();
      if (isDebug() && rnd() < 0.01) { const b = g._dbgBtnRect(); g.onInput('tap', { x: b.x + 2, y: b.y + 2 }); }
      if (g.state === 'debug' && rnd() < 0.2) { const bs = g._dbgButtons(); const bb = bs[Math.floor(rnd() * bs.length)]; g.onInput('tap', { x: bb.x + 2, y: bb.y + 2 }); }
      g.update(rnd() < 0.05 ? 0.1 : 1 / 60);
      g.render(ctx);
      visited.add(g.state); bodiesSeen.add(g._body && g._body.id);
    }
  } catch (err) { threw = err; }
  setDebug(false); globalThis.fetch = savedFetch;
  ok(!threw, '5000 random frames, no exception: ' + (threw && threw.stack));
  ok(['play', 'landing', 'cleared', 'crashed', 'bonusfailed', 'gameover', 'module'].every(s => visited.has(s)), 'fuzz visited states: ' + [...visited].join(','));
  ok(BODIES.every(b => bodiesSeen.has(b.id)), 'fuzz visited all 6 bodies (+ TERRA via bonus): ' + [...bodiesSeen].join(','));
}

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
