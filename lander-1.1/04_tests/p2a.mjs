// LANDER P2a ヘッドレステスト（ビジュアル再設計）。実行: node 04_tests/p2a.mjs
// art.js の全描画関数が、全天体・全ポーズ・全状態でスタブctxに対し例外なく動き、save/restore が釣り合い、
// 不正な数値(NaN)を渡さないこと、ゲームプレイ定数/判定矩形が変わっていないことを確認する。
import { Game, LANDING_PHASES, landingPhase } from '../02_src/game.js';
import * as art from '../02_src/art.js';
import { BODIES, bodyGravity, padWidth, obstacleCount, obstacleSpeed, celebrationPose, celebrationSequence, GRAVITY_BASE, STAGES_PER_BODY } from '../02_src/bodies.js';
import { MODULE_DEFS } from '../02_src/modules.js';
import { PALETTES } from '../02_src/core/palette.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};

// save/restore の深さを数え、NaN/Infinity 座標を検出するスタブctx
function makeCtx() {
  const st = { depth: 0, minDepth: 0, nan: 0, calls: 0 };
  const state = { globalAlpha: 1, font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  const NUMFN = new Set(['moveTo', 'lineTo', 'arc', 'ellipse', 'fillRect', 'strokeRect', 'translate', 'scale', 'rotate', 'quadraticCurveTo', 'bezierCurveTo', 'arcTo', 'drawImage', 'fillText', 'clearRect']);
  const ctx = new Proxy(state, {
    get: (t, k) => {
      if (k === 'save') return () => { st.depth++; };
      if (k === 'restore') return () => { st.depth--; if (st.depth < st.minDepth) st.minDepth = st.depth; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return (...a) => { for (const v of a) if (!Number.isFinite(v)) st.nan++; return { addColorStop: noop }; };
      if (NUMFN.has(k)) return (...a) => { st.calls++; for (let i = 0; i < a.length; i++) if (typeof a[i] === 'number' && !Number.isFinite(a[i])) st.nan++; };
      if (k in t) return t[k];
      return noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
  return { ctx, st };
}
const store = new Map([['howtoSkip', '1']]);
function makeEngine(ctx) {
  const e = { ctx, audio: new Proxy({}, { get: () => noop }),
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [] };
  return e;
}
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;

// ---------- 1. 全関数が全天体で例外なく動く ----------
{
  const { ctx, st } = makeCtx();
  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 37) % 360, y: 20 + (i * 53) % 460, r: i % 5 === 0 ? 2 : 1 }));
  let threw = null;
  try {
    for (const body of BODIES) {
      const pts = Array.from({ length: 19 }, (_, i) => ({ x: i * 20, y: i === 0 || i === 18 ? 540 : 445 + ((i * 29) % 80) }));
      const pad = { x: 150, y: 480, w: 40, moving: false };
      for (let t = 0; t < 3; t += 0.7) {
        art.drawBackdrop(ctx, body, t, stars);
        art.drawTerrain(ctx, body, pts, pad, t);
        art.drawPad(ctx, pad, t);
        art.drawBeacon(ctx, pad, t);
        art.drawObstacles(ctx, [{ x: 100, y: 200, r: 12, vx: 10, style: 'rock' }, { x: 200, y: 250, r: 17, vx: -8, style: 'ice' }, { x: 60, y: 300, r: 10, vx: 5, style: 'lava' }], t, body);
        if (body.visual.haze) art.drawHaze(ctx, body.visual.haze.color, body.visual.haze.alpha);
        if (body.visibility) art.drawFog(ctx, body.visual.fog, 180, 200, body.visibility);
      }
    }
    art.drawGuide(ctx, Array.from({ length: 33 }, (_, i) => ({ x: 100 + i, y: 90 + i * 12 })), true, 0.8);
    art.drawGuide(ctx, Array.from({ length: 33 }, (_, i) => ({ x: 100 + i, y: 90 + i * 12 })), false, 1);
    art.drawOnCourse(ctx, 180, 200, 0.3, 0.9);
    for (const [m, r, l] of [[true, true, true], [false, false, false], [true, false, true]]) art.drawShip(ctx, 180, 300, 33, m, r, l, 1.5);
    for (const ang of [-180, -90, 0, 45, 180]) art.drawShip(ctx, 180, 300, ang, true, true, true, 0);
    art.drawHatch(ctx, 100, 100, 0); art.drawHatch(ctx, 100, 100, 1); art.drawLadder(ctx, 100, 100, 160);
    art.drawFlag(ctx, 100, 200, 0, 0); art.drawFlag(ctx, 100, 200, 0.5, 1); art.drawFlag(ctx, 100, 200, 1, -1);
    art.drawParticles(ctx, [{ x: 10, y: 10, life: 1, max: 1.7 }, { x: 20, y: 20, life: 0.1, max: 1.7 }, { x: 20, y: 20, life: -1, max: 0 }]);
    art.drawShieldRing(ctx, 100, 100, 0.3, true); art.drawShieldRing(ctx, 100, 100, 0, true);
    art.drawRadar(ctx, true, 10, 10, 50, 50, 3, 4); art.drawRadar(ctx, false, 10, 10, 50, 50, 3, 4);
    for (const id of ['fuel', 'stab', 'shock', 'radar', 'shield', 'unknown']) art.drawModuleGlyph(ctx, id, 50, 50, 8, '#fff');
    art.icoFuel(ctx, 1, 1, 5, '#fff'); art.icoDown(ctx, 1, 1, 5, '#fff'); art.icoSide(ctx, 1, 1, 5, '#fff'); art.icoAngle(ctx, 1, 1, 5, '#fff', 200); art.icoSpin(ctx, 1, 1, 5, '#fff'); art.icoWind(ctx, 1, 1, 20, -1, '#fff'); art.icoShipMini(ctx, 1, 1, 1, '#fff');
    art.drawControls(ctx, true, false, true); art.drawControls(ctx, false, true, false);
    art.drawBackButton(ctx, { x: 6, y: 8, w: 42, h: 36 });
    art.drawIntro(ctx, 'MARS', 'g 3.71 m/s²  ·  THIN CO₂', 'WIND', 1.4); art.drawBonusBanner(ctx, 'MOVING PAD', 0.5); art.drawTouchdown(ctx);
    art.txt(ctx, 'Hello', 10, 10, 12, '#fff', 'center', { sp: 3, w: 300, a: 0.5, sh: 1 }); art.txt(ctx, null, 0, 0, 10); art.num(ctx, -12, 100, 10, 13, '#fff'); art.num(ctx, '', 100, 10, 13, '#fff');
  } catch (e) { threw = e; }
  ok(!threw, 'direct art calls: ' + (threw && threw.stack));
  ok(st.depth === 0 && st.minDepth === 0, 'save/restore balanced (depth=' + st.depth + ' min=' + st.minDepth + ')');
  ok(st.nan === 0, 'no NaN/Infinity passed to canvas (' + st.nan + ')');
  ok(st.calls > 500, 'something was drawn (' + st.calls + ')');
}

// ---------- 2. 全天体 x 全状態 のゲーム描画 ----------
{
  const STATES = ['play', 'landing', 'cleared', 'crashed', 'bonusfailed', 'gameover', 'module', 'debug'];
  let threw = null, frames = 0;
  const { ctx, st } = makeCtx();
  try {
    for (let b = 0; b < BODIES.length; b++) for (const loop of [0, 1]) for (const bonus of [null, 'CALM', 'ROVER', 'CROSSWIND', 'STORM']) {
      const g = new Game(makeEngine(ctx)); g.enter();
      g.stage = b * STAGES_PER_BODY + 1 + loop * 16; g.bonus = bonus ? { type: bonus, afterStage: g.stage } : null; g._initStage();
      g.modules = { stab: 2, shock: 1, radar: 1, shield: 2 };
      g._dbgPrev = 'play';
      for (const s of STATES) {
        if (s === 'landing' || s === 'cleared') { g.landingSeq = { t: 0 }; g._perfect = true; }
        if (s === 'module') g.offers = ['shield', 'radar'];
        if (s === 'gameover') { g.rankList = [{ name: 'AAA', score: 1234, stage: 5 }, { name: 'BBB', score: 99, stage: 1 }]; g.newIdx = 0; }
        g.state = s;
        g._thrustMain = g._thrustRcsL = g._thrustRcsR = (frames % 2 === 0);
        g.particles = s === 'crashed' ? [{ x: 100, y: 100, life: 1, max: 1.7, vx: 0, vy: 0 }] : [];
        const times = (s === 'landing' || s === 'cleared') ? [0, 0.3, 0.5, 0.9, 1.3, 1.7, 2.1, 2.5, 2.7, 3.5, 5, 9.2] : [0];
        for (const lt of times) {
          if (g.landingSeq) g.landingSeq.t = lt;
          g._introT = 1.2; g._bannerT = 1.2; g._clock = frames * 0.016;
          g.render(ctx); frames++;
        }
      }
    }
  } catch (e) { threw = e; }
  ok(!threw, 'game render over bodies x states x bonus: ' + (threw && threw.stack));
  ok(st.depth === 0 && st.minDepth === 0, 'game render save/restore balanced (depth=' + st.depth + ' min=' + st.minDepth + ')');
  ok(st.nan === 0, 'game render: no NaN/Infinity to canvas (' + st.nan + ')');
  ok(frames > 300, 'rendered many frames: ' + frames);
}

// ---------- 3. 全ポーズ / 全フェーズの宇宙飛行士 ----------
{
  const { ctx, st } = makeCtx();
  let threw = null, n = 0;
  try {
    for (const body of BODIES) for (const loop of [0, 1, 2]) for (const perfect of [false, true]) {
      const total = celebrationSequence(body, loop).reduce((a, s) => a + s.dur, 0);
      for (let t = 0; t < total * 2; t += 0.05) {
        const pose = celebrationPose(body, loop, t, perfect);
        art.drawAstronaut(ctx, 100, 400, 'done', t + 3, pose); n++;
        if (pose.fx) art.drawCelebFx(ctx, 100, 380, pose.fx);
      }
    }
    for (const ph of LANDING_PHASES) for (let p = 0; p <= 1; p += 0.25) art.drawAstronaut(ctx, 100, 400, ph.name, ph.t0 + p * (ph.t1 - ph.t0), null);
    for (let t = 0; t < 3; t += 0.1) { const ph = landingPhase(t); art.drawAstronaut(ctx, 100, 400, ph.name, t, null); }
    art.drawAstronaut(ctx, 100, 400, 'done', 1, { dy: 99, dx: 5, rot: 6.3, armL: 2.6, armR: 0, fx: null });   // 画面外上限
  } catch (e) { threw = e; }
  ok(!threw, 'astronaut all poses/phases: ' + (threw && threw.stack));
  ok(st.depth === 0 && st.minDepth === 0 && st.nan === 0, 'astronaut balanced + finite');
  ok(n > 500, 'astronaut frames ' + n);
}

// ---------- 4. 文字描画: letterSpacing 非対応環境のフォールバック ----------
{
  const { ctx } = makeCtx();
  let threw = null; try { art.txt(ctx, 'ABC', 0, 0, 10, '#fff', 'right', { sp: 2 }); art.txt(ctx, 'ABC', 0, 0, 10, '#fff', 'center', { sp: 2 }); } catch (e) { threw = e; }
  ok(!threw, 'spaced text fallback');
  ok(art.numWidth('12', 10) === 12, 'numWidth tabular slots');
  ok(/^rgba\(255,181,71,0\.50\)$/.test(art.rgba('#FFB547', 0.5)) && art.mixHex('#000000', '#ffffff', 0.5) === '#808080', 'color helpers');
}

// ---------- 5. ゲームプレイ定数・判定矩形が変わっていない（スポットチェック）----------
{
  const g = new Game(makeEngine(makeCtx().ctx)); g.enter();
  ok(g._safeVy() === 22 && g._bounceVy() === 45, 'SAFE_VY 22 / BOUNCE_VY 45');
  ok(near(bodyGravity(BODIES[0], 0), 0.25) && GRAVITY_BASE === 0.25, 'moon gravity 0.25');
  ok(padWidth(1) === 54 && padWidth(12) === 22 && obstacleCount(12) === 7 && obstacleSpeed(12) === 45, 'pad/obstacle formulas');
  ok(LANDING_PHASES[LANDING_PHASES.length - 1].t1 === 2.6, 'LANDING_SEQ_S 2.6');
  const cr = g._clearPanelRect(); ok(cr.x === 20 && cr.y === 128 && cr.w === 320 && cr.h === 216, 'clear panel rect unchanged');
  const gu = g._giveUpRect(); ok(gu.x === 130 && gu.y === 380 && gu.w === 100 && gu.h === 32, 'give-up rect unchanged');
  const mc = g._moduleCardRect(1); ok(mc.x === 24 && mc.y === 320 && mc.w === 312 && mc.h === 150, 'module card rect unchanged');
  const db = g._dbgBtnRect(); ok(db.x === 316 && db.y === 100 && db.w === 36 && db.h === 16, 'DBG button rect unchanged');
  ok(g._dbgButtons().length === 11 && g._dbgButtons()[0].x === 30 && g._dbgButtons()[0].y === 112 && g._dbgButtons()[0].w === 140 && g._dbgButtons()[0].h === 36, 'debug panel buttons geometry');
  // 操作ゾーン: x<120 左 / 120..240 推力 / >240 右
  const probe = (x) => { const e = makeEngine(makeCtx().ctx); e.touches = [{ x, y: 600 }]; const gg = new Game(e); gg.enter(); gg.x = 180; gg.y = 100; gg.update(1 / 60); return [gg._thrustRcsL, gg._thrustMain, gg._thrustRcsR]; };
  ok(probe(60)[0] && !probe(60)[1] && !probe(60)[2], 'left zone');
  ok(probe(180)[1] && !probe(180)[0] && !probe(180)[2], 'mid zone');
  ok(probe(300)[2] && !probe(300)[0] && !probe(300)[1], 'right zone');
  // クリアパネルがパッドと重ならない（パッド面 y>=455）
  ok(cr.y + cr.h <= 455 - 100, 'clear panel clear of landing scene');
  // 5つのモジュール全てにグリフがある
  ok(MODULE_DEFS.every(d => ['stab', 'shock', 'radar', 'shield'].includes(d.id)), 'module ids have glyphs');
  // パレットのキー互換
  const P = PALETTES.SPACE; ok(['bg', 'dark', 'dim', 'mid', 'fg', 'hi', 'warn', 'bad'].every(k => /^#[0-9a-f]{6}$/i.test(P[k])), 'palette keys kept');
  ok(P.bg.toLowerCase() === '#06080e' && P.fg.toLowerCase() === '#ece6d8' && P.mid.toLowerCase() === '#63d8c9' && P.warn.toLowerCase() === '#ffb547' && P.bad.toLowerCase() === '#ff4a3d', 'design palette baseline');
}

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
