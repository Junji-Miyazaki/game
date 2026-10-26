// p20pluto — beta.5: PLUTO（ツアー最後の天体）/ ICE SLIDE / 2つめの中継地点（HOP）/ 48★・8パッチ。実行: node 04_tests/p20pluto.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
import { Game, gradeRank, SLIDE_CAP_DIST, buildTerrain, landableSpots } from '../02_src/game.js';
import { SolarMap } from '../02_src/solarmap.js';
import { BODIES, BODY_COUNT, STAGES_PER_BODY, ICE_FRICTION, stageInfo, bodyGravity, padWidth, obstacleCount, obstacleSpeed, makeWindSpec, introText, celebrationParams } from '../02_src/bodies.js';
import { autopilotFrame } from '../02_src/autopilot.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { ringCollect, maxRingScore } from '../02_src/rings.js';
import { starsSummary } from '../02_src/stars.js';
import { patchesSummary, patchCount, drawMissionPatch } from '../02_src/patches.js';
import { unlockedStarts } from '../02_src/ranking.js';
import { WHATSNEW } from '../02_src/whatsnew.js';
import { APP_VERSION } from '../02_src/version.js';

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
setDebug(false); __setRelayUrl('');

function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'createRadialGradient') return (...a) => { if (rec) rec.ops.push(['grad', a]); return { addColorStop: noop }; };
      if (rec && k === 'fillText') return (s, x, y) => { rec.texts.push({ s: String(s), x, y, font: t.font }); };
      if (rec && k === 'setLineDash') return (a) => { rec.ops.push(['dash', a]); };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const newRec = () => ({ texts: [], ops: [] });
function makeEngine(extra = [], opts = {}) {
  const store = new Map([['hudTipSeen', '1'], ['touchHintSeen', '1'], ...extra]);
  const sfxLog = [];
  const sfx = {};
  for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power']) sfx[n] = (a) => sfxLog.push([n, a]);
  return { store, sfxLog, music: { attach: noop, setMuted: noop, isMuted: () => !!opts.muted, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const prof = (name) => [['profiles', JSON.stringify([{ name, key: 'a'.repeat(64) }])], ['activeProfile', name], ['lastName', name]];
function newGame(extra = [], opts) { const e = makeEngine(extra, opts); const g = new Game(e); g.enter(); return { e, g }; }
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const onPad = (g) => { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; };
const stageGame = (stage, extra, opts) => { const r = newGame(extra, opts); r.g.stage = stage; r.g.bonus = null; r.g._initStage(); return r; };
const renderOK = (g, rec) => { try { g.render(makeCtx(rec)); return true; } catch (e) { console.log('render threw', e); return false; } };
// 手動の輪を置く（物理に影響されないよう、機体を直接動かして検証する）

// ---- 平らな氷の世界（テスト用）。パッド x 170..192 / 崖 opts.cliffX から先は急斜面 ----
function flat(g, o = {}) {
  const pts = []; for (let i = 0; i <= 18; i++) pts.push({ x: i * 20, y: 480 });
  if (o.cliffX != null) for (let i = 0; i <= 18; i++) if (pts[i].x >= o.cliffX + 20) pts[i].y = 540;
  g.terrainPts = pts; g.pad = { x: 170, y: 480, w: 22, moving: false }; g.obstacles = []; g._rg = null; g._spots = []; g._windSpec = null; g._windAccel = 0;
  g._wp = o.wp ? { x: o.wp, y: 480, w: 40, done: false, t: 0 } : null; g._wpBonus = 0; g._slide = null; g._slideDist = 0;
  g.fuel = g._fuelMax(); g.state = 'play'; g._contact0 = null; g._bouncing = false; g._thrustMain = false;
  return g;
}
function drop(g, x, vx, vy = 2) { g.x = x; g.y = 480 - 16 - 0.2; g.vx = vx; g.vy = vy; g.angle = 0; g.omega = 0; g._gravity = 0.1547; g.state = 'play'; }
function untilSettled(g, maxS = 20) { for (let i = 0; i < maxS / DT && (g.state === 'play' || (g.state === 'grounded' && g._slide)); i++) { g.update(DT); clock += 16; if (g._slide && g._x0 == null) g._x0 = g._slide.x0; } }
const plutoStage = (stage) => { const r = stageGame(stage); r.g.obstacles = []; return r; };

// ---------- 1. 天体データ・順序・周回 ----------
{
  const P = BODIES[7];
  ok(BODY_COUNT === 8 && P.id === 'pluto' && P.name === 'PLUTO' && BODIES[6].id === 'mercury', 'PLUTO is the 8th and last body, after Mercury');
  ok(P.realG === 0.62 && P.atmoLabel.startsWith('TRACE N₂') && P.atmoTag === 'TRACE N₂' && P.atmoType === 'trace' && P.drag === 0 && !P.wind.base && !P.wind.gust && P.visibility === null && P.iceSlide === true, 'real g 0.62, TRACE N2, no wind/drag, no visibility radius, ice slide');
  ok(near(bodyGravity(P, 0), 0.25 * Math.sqrt(0.62 / 1.62), 1e-12) && near(bodyGravity(P, 0), 0.1547, 0.0005), 'game gravity ~0.155 via the sqrt mapping: ' + bodyGravity(P, 0).toFixed(4));
  ok(makeWindSpec(P, 0) === null && P.dim > 0 && P.dim < 0.6 && P.visual.skyObject === 'charon' && P.celebTier === 2 && celebrationParams(P).apex > 0, 'dim lighting (tint, not a radius), Charon in the sky, celebration tier like Mercury');
  ok(introText(P).startsWith('PLUTO · THE EDGE OF THE SOLAR SYSTEM · g 0.62 m/s²') && !introText(P).includes('WIND'), 'intro text: ' + introText(P));
  for (const [stage, idx, loop, first] of [[15, 7, 0, true], [16, 7, 0, false], [31, 7, 1, true], [32, 7, 1, false], [17, 0, 1, true], [47, 7, 2, true], [48, 7, 2, false]]) {
    const i = stageInfo(stage); ok(i.index === idx && i.loop === loop && i.firstOfBody === first, 'stage ' + stage + ' -> index ' + idx + ' loop ' + loop);
  }
  ok(padWidth(15) === 22 && padWidth(16) === 22 && padWidth(31) === 22 && padWidth(17) === 46, 'pad width: Pluto 22 at loop 0 (same floor as Mercury), loop 1 restarts at 46');
  ok(obstacleCount(16) === 7 && obstacleCount(17) === 4 && obstacleSpeed(16) === 57 && obstacleSpeed(17) === 18, 'loop scaling follows the 16-stage loop');
  for (const stage of [15, 16, 31, 32, 47, 48]) {
    const { g } = plutoStage(stage), loop = stageInfo(stage).loop;
    ok(near(g._gravity, 0.25 * Math.sqrt(0.62 / 1.62) * (1 + 0.15 * loop), 1e-12) && g._body.id === 'pluto' && g._windSpec === null && g._padW === padWidth(stage), 'Pluto gravity/loop scaling, no wind at stage ' + stage);
  }
  const mus = fs.readFileSync(new URL('../02_src/music.js', import.meta.url), 'utf8');
  ok(/\n  pluto: \{/.test(mus), 'music.js has a pluto ambient scene');
  // _musAir に gustRate(6番目) だけ渡して gustDepth(7番目) を省くと、実ブラウザでは AudioParam の非有限値で例外になる（モックでは検出できない）
  const calls = [...mus.matchAll(/_musAir\(sc,([^;\n]*)\);/g)].map((m) => m[1].split(',').length);
  ok(calls.length >= 6 && calls.every((n) => n !== 5), '(sc 以外の引数 5 個 = gustRate だけ) _musAir calls never pass gustRate without gustDepth (' + calls.join(',') + ')');
  const log = []; const { g } = newGame(); g.engine.music.playBody = (id) => log.push(id); g.stage = 15; g._initStage(); ok(log[log.length - 1] === 'pluto', 'Pluto music requested on entry');
}

// ---------- 2. ICE SLIDE の物理（解析解 v0^2 / (2 mu)）----------
{
  ok(ICE_FRICTION > 0 && ICE_FRICTION < 12, 'ICE_FRICTION = ' + ICE_FRICTION + ' px/s^2');
  for (const v0 of [4, 8, 12, -8]) {
    const { g } = plutoStage(15); flat(g); drop(g, 60 + (v0 < 0 ? 200 : 0), v0);
    untilSettled(g);
    const want = v0 * v0 / (2 * ICE_FRICTION) * Math.sign(v0), got = g.x - g._x0;   // 距離は最初の接触の位置からの差
    ok(g.state === 'grounded' && !g._slide && g.vx === 0 && near(got, want, 0.6), 'slide v0=' + v0 + ': stops at ' + got.toFixed(2) + ' ~ ' + want.toFixed(2) + ' (state ' + g.state + ')');
    ok(g.totalScore === 0 && Math.abs(g.angle) < 1, 'grounded off the pad: no score, level (v0=' + v0 + ')');
  }
  // 滑走中の挙動: 速度は単調に減る・水平・y は地面に張り付く
  { const { g } = plutoStage(15); flat(g); drop(g, 40, 12); let prev = 99, mono = true, level = true, any = false;
    for (let i = 0; i < 600 && (g.state === 'play' || g._slide); i++) { g.update(DT); if (g._slide) { any = true; if (Math.abs(g.vx) > prev + 1e-9) mono = false; prev = Math.abs(g.vx); if (Math.abs(g.angle) > 6 || Math.abs(g.y + 16 - 480) > 1e-6) level = false; } }
    ok(any && mono && level, 'sliding: speed decreases monotonically, ship stays level on the ice'); }
  // 壁: 画面端で止まって決着（落ちない）
  { const { g } = plutoStage(15); flat(g); drop(g, 300, 13); untilSettled(g); ok(g.state === 'grounded' && g.x <= 346 && g.x >= 14, 'slide against the wall settles (x ' + g.x.toFixed(1) + ')'); }
}

// ---------- 3. 決着: パッド上=成功 / 平地=接地 / 縁=クラッシュ / 離陸 ----------
{
  // パッド中央・ゆっくり: 滑って止まる → 成功（得点あり）、グレードは最初の接触から
  { const { g } = plutoStage(15); flat(g); drop(g, 181, 2.5, 1); untilSettled(g);
    ok(g.state === 'landing' && g.totalScore > 0 && g._grade === 'PERFECT' && g._perfect === true, 'pad, tiny vx: slide ~0.6 px, success, PERFECT (first contact) -> ' + g.state + '/' + g._grade);
    ok(g._breakdown.every((r) => r[0] !== 'WAYPOINT'), 'no waypoint row on stage 15'); }
  // パッド左端から右へ 6 px/s: 3.6 px 滑ってもパッド上 → 成功。グレードは接触の速さで決まる（S 以下）
  { const { g } = plutoStage(15); flat(g); drop(g, 175, 6, 1); untilSettled(g);
    ok(g.state === 'landing' && g.x > 175 && g.x < 192 && gradeRank(g._grade) <= gradeRank('S') && gradeRank(g._grade) >= 0, 'slides within the pad: success, grade ' + g._grade); }
  // パッドの上に降りたが 12 px/s: 14 px 滑ってパッドを出る → 接地（得点なし・離陸できる）
  { const { g } = plutoStage(15); flat(g); drop(g, 178, 12); untilSettled(g);
    ok(g.state === 'grounded' && g.totalScore === 0 && g.x > 192, 'slid off the pad onto flat ice: grounded, no score (x ' + g.x.toFixed(1) + ')');
    g.onInput('up'); for (let i = 0; i < 30; i++) { g.onInput('up'); g.update(DT); } ok(g.state === 'play' && g.vy < 0, 'can lift off from the ice afterwards'); }
  // 平地に降りてパッドへ滑り込む → パッドで止まれば成功
  { const { g } = plutoStage(15); flat(g); drop(g, 160, 8); untilSettled(g);   // 160 + 6.4 = 166.4 → パッドの手前で止まる
    ok(g.state === 'grounded' && g.x < 170, 'short of the pad: grounded');
    const { g: h } = plutoStage(15); flat(g); flat(h); drop(h, 165, 8); untilSettled(h);   // 165 + 6.4 = 171.4 → パッドの左端に乗る
    ok(h.state === 'landing' && h.x >= 170, 'flat ice -> slides onto the pad and stops there: success'); }
  // 縁: 滑走中に急斜面へ → SLID OFF THE EDGE（滑走の速さの値行）
  { const { g } = plutoStage(15); flat(g, { cliffX: 250 }); g.continues = 3; drop(g, 228, 13); untilSettled(g);
    ok(g.state === 'crashed' && g._crashReason === 'SLID OFF THE EDGE' && g._crashDetail && /^SLIDING AT \d+ px\/s$/.test(g._crashDetail.text), 'slide onto a slope: SLID OFF THE EDGE with a speed line (' + (g._crashDetail && g._crashDetail.text) + ')');
    const rec = newRec(); ok(renderOK(g, rec) && rec.texts.some((t) => t.s === 'SLID OFF THE EDGE') && rec.texts.some((t) => /^SLIDING AT/.test(t.s)), 'crash panel shows reason + value'); }
  // 速すぎる接触は従来どおりの失敗（滑走しない）
  { const { g } = plutoStage(15); flat(g); g.continues = 3; drop(g, 60, 30); untilSettled(g); ok(g.state === 'crashed' && g._crashReason === 'HARD IMPACT', 'vx 30: HARD IMPACT as before'); }
  // 滑走中の推力は離陸（水平速度は保つ）
  { const { g } = plutoStage(15); flat(g); drop(g, 60, 12);
    for (let i = 0; i < 40; i++) { g.update(DT); }
    ok(g.state === 'grounded' && !!g._slide, 'still sliding after ~0.7 s'); const vx0 = g.vx;
    for (let i = 0; i < 20; i++) { g.onInput('up'); g.update(DT); }
    ok(g.state === 'play' && g._slide === null && g.vx > 0 && g.vx > vx0 * 0.5, 'thrust during the slide lifts off, keeping horizontal speed (' + g.vx.toFixed(1) + ')'); }
  // 滑走中の燃料切れ: パッド上で止まれば成功（STRANDED にならない）
  { const { g } = plutoStage(15); flat(g); drop(g, 178, 8); g.fuel = 0; untilSettled(g); ok(g.state === 'landing', 'out of fuel while sliding onto the pad: success, not STRANDED'); }
  { const { g } = plutoStage(15); flat(g); g.continues = 3; drop(g, 60, 3); g.fuel = 0; untilSettled(g); run(g, 2); ok(g.state === 'crashed' && /STRANDED/.test(g._crashReason), 'out of fuel on flat ice: STRANDED after it stops (as L1)'); }
  // 他の天体は滑らない
  { const { g } = stageGame(1); flat(g); drop(g, 60, 8); untilSettled(g); ok(g.state === 'grounded' && g.vx === 0 && !g._slide, 'MOON: no slide (stops at once)'); }
}

// ---------- 4. グレード上限（滑走距離 > 12 px）----------
{
  ok(SLIDE_CAP_DIST === 12, 'cap distance 12 px');
  const mk = (dist) => { const { g } = plutoStage(15); flat(g); onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._contact0 = { vy: 1, vx: 0, ang: 0, om: 0 }; g._slideDist = dist; g._doSuccess(0, 0); return g._grade; };
  ok(mk(0) === 'PERFECT' && mk(12) === 'PERFECT' && mk(12.5) === 'A', 'slide > 12 px caps the grade at A (<= 12 is untouched)');
  const { g } = plutoStage(15); flat(g); onPad(g); g.vx = 0; g.vy = 1; g._contact0 = { vy: 1, vx: 0, ang: 0, om: 0 }; g._slideDist = 20; g._doSuccess(0, 0);
  const { g: h } = plutoStage(15); flat(h); onPad(h); h.vx = 0; h.vy = 1; h._contact0 = { vy: 20, vx: 11, ang: 0, om: 0 }; h._slideDist = 20; h._doSuccess(0, 0);
  ok(g._grade === 'A' && h._grade === 'B' && g._slideDist === 0, 'a worse first contact stays worse (B); the counter resets');
}

// ---------- 5. 2つめ: 中継地点 + 鍵つきパッド ----------
{
  let okAll = true, far = 0, n = 0, fuels = true, flatOK = true;
  for (const stage of [16, 32, 48]) for (let seed = 1; seed <= 30; seed++) {
    seeded(seed * 31 + stage); const { g } = plutoStage(stage); unseed(); n++;
    const w = g._wp; if (!w || w.done) { okAll = false; continue; }
    if (Math.abs(w.x - (g.pad.x + g.pad.w / 2)) >= 100) far++;
    if (!near(g.fuel, 135, 1e-9) || !near(g._fuelMax(), 135, 1e-9)) fuels = false;
    const xs = [w.x - w.w / 2, w.x + w.w / 2]; if (!(w.w >= 36 && xs[0] >= 10 && xs[1] <= 350 && Math.abs(w.y - g._terrainYAt(w.x)) < 1e-6 && g._spots.some((s) => s.x0 <= xs[0] + 3 && s.x1 >= xs[1] - 3) && (xs[1] < g.pad.x || xs[0] > g.pad.x + g.pad.w))) flatOK = false;
  }
  ok(okAll, 'every 2nd Pluto stage (16/32/48) has a waypoint'); ok(flatOK, 'waypoint sits on a flat marked run, clear of the pad (90 seeds)');
  ok(far >= 0.7 * n, 'waypoint is placed away from the pad (>= 100 px) in most seeds: ' + far + '/' + n);
  ok(fuels, 'fuel +35% on the waypoint stages (135)');
  for (const stage of [15, 31, 47, 14, 1]) ok(plutoStage(stage).g._wp === null && near(plutoStage(stage).g.fuel, 100, 1e-9), 'no waypoint / normal fuel at stage ' + stage);
  ok(stageGame(16, [], {}).g._wp && near(stageGame(16).g._fuelMax(), 135, 1e-9), 'fuel max includes the factor');
  // 誘導線は中継地点へ → 取得後はパッドへ
  { const { g } = plutoStage(16); const e = g.guidePts[g.guidePts.length - 1]; ok(near(e.x, g._wp.x, 0.01) && near(e.y, g._wp.y, 0.01), 'guide line points to the waypoint first');
    const rg = g._rg; ok(rg && rg.rings.length >= 3, 'rings are laid out on the start -> waypoint leg (kept so the RINGS star stays possible)'); }
  // 鍵つきパッド: 降りても接地止まり（得点なし・離陸できる）、新しい失敗はなし
  { const { g } = plutoStage(16); flat(g, { wp: 60 }); g.guidePts = g.guidePts; drop(g, 181, 1, 1); untilSettled(g);
    ok(g.state === 'grounded' && g.totalScore === 0 && g._wp.done === false, 'touching down on the LOCKED pad = grounded, no score, waypoint still open');
    g.state = 'play'; g.vy = -3; g.y -= 20; g._thrustMain = false;
    const rec = newRec(); ok(renderOK(g, rec) && rec.texts.some((t) => t.s === 'LOCKED'), 'LOCKED label drawn on the pad'); }
  // 中継地点に降りる → 解錠・チャイム・バナー・ボーナス → 離陸 → パッドで通常クリア
  { const { g, e } = plutoStage(16); flat(g, { wp: 60 }); g.totalScore = 0; drop(g, 62, 2, 1); untilSettled(g);
    ok(g.state === 'grounded' && g._wp.done === true && g._wpBannerT > 0 && g.totalScore === 0, 'waypoint touchdown: done, banner, no score yet');
    ok(g._wpBonus >= 100 && g._wpBonus <= 300 && (g._wpBonus - 100) % 50 === 0, 'waypoint bonus 100..300 by grade: ' + g._wpBonus);
    ok(e.sfxLog.length >= 0 && g.guidePts[g.guidePts.length - 1].x > 150 && g.guidePts[g.guidePts.length - 1].x < 200, 'guide re-aimed at the pad');
    const rec = newRec(); ok(renderOK(g, rec) && rec.texts.some((t) => t.s === 'WAYPOINT 1 ✓'), 'banner WAYPOINT 1 ✓ drawn');
    g.update(DT); for (let i = 0; i < 20; i++) { g.onInput('up'); g.update(DT); } ok(g.state === 'play', 'lifts off after the waypoint');
    drop(g, 178, 3, 1); g._thrustMain = false; untilSettled(g);
    ok(g.state === 'landing' && g.totalScore > 0 && g._breakdown.some((r) => r[0] === 'WAYPOINT' && r[1] === g._wpBonus), 'then the pad clears the stage, with the WAYPOINT row'); }
  // 中継地点の外側（幅の外）では解錠しない
  { const { g } = plutoStage(16); flat(g, { wp: 60 }); drop(g, 100, 1, 1); untilSettled(g); ok(g._wp.done === false && g.state === 'grounded', 'a touchdown beside the waypoint does not count'); }
  // 速すぎる接触（SAFE 外）は従来どおりバウンス/失敗 = 中継地点にならない
  { const { g } = plutoStage(16); flat(g, { wp: 60 }); g.continues = 3; drop(g, 60, 30, 2); untilSettled(g); ok(g._wp.done === false && g.state === 'crashed', 'a hard hit near the waypoint just crashes'); }
  // 得点: 中継地点ボーナス込みでも stage x 8000 の中継上限内（最悪ケース）
  { const { g } = newGame(); g.continues = 3; let worst = 0, viol = 0;
    for (let stage = 1; stage <= 96; stage++) {
      g.stage = stage; g.bonus = null; g._initStage(); g.obstacles = [];
      const n = g._rg.rings.length; for (let i = 0; i < n; i++) ringCollect(g._rg, i);
      if (g._wp) { g._wp.done = true; g._wpBonus = 300; }
      g.fuel = g._fuelMax(); onPad(g); g.vx = 0; g.vy = 0; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
      worst = Math.max(worst, g._stageScore); if (g.totalScore > stage * 8000) viol++;
      if (stage % 3 === 0) { g.totalScore += 600 * 2.5 + 1000 * 2.5; if (g.totalScore > stage * 8000) viol++; }
    }
    ok(viol === 0 && worst < 4800, 'worst case incl. waypoint bonus never exceeds stage x 8000 (96 stages); worst single stage ' + worst); }
}

// ---------- 6. 描画 ----------
{
  let okR = true;
  for (const stage of [15, 16, 31, 32]) for (let k = 0; k < 3; k++) { const { g } = plutoStage(stage); g.x = 150; g.y = 300; okR = renderOK(g) && okR; g.state = 'grounded'; g._slide = { x0: 100, ang: 0, om: 0, sprayT: 0 }; g.vx = 7; okR = renderOK(g) && okR; g._slide = null; okR = renderOK(g) && okR; g.state = 'tip'; g._tipPrev = 'play'; okR = renderOK(g) && okR; }
  ok(okR, 'Pluto stages render (play / sliding / grounded / tip) without throwing');
  const { g } = plutoStage(15); g._introT = 2; g.x = 150; g.y = 300; const rec = newRec(); renderOK(g, rec);
  ok(rec.texts.some((t) => t.s === 'PLUTO') && rec.texts.some((t) => t.s === 'THE EDGE OF THE SOLAR SYSTEM'), 'intro shows PLUTO / THE EDGE OF THE SOLAR SYSTEM');
  const { g: s } = plutoStage(15); s.state = 'grounded'; s._slide = { x0: 100, ang: 0, om: 0, sprayT: 0 }; s.vx = 7; const r2 = newRec(); renderOK(s, r2);
  ok(r2.texts.some((t) => t.s === 'SLIDING') && !r2.texts.some((t) => /^TOUCHDOWN/.test(t.s)), 'SLIDING cue replaces the grounded banner while sliding');
  const { g: d } = plutoStage(15); const ops = []; const c = makeCtx({ texts: [], ops }); d.render(c); ok(ops.length > 0, 'dim lighting + Charon draw (gradients recorded: ' + ops.length + ')');
  const P2 = { moon: 1 }; const pr = newRec(); const pc = makeCtx(pr);
  let pok = true; try { drawMissionPatch(pc, 'pluto', 100, 100, 17, {}); drawMissionPatch(pc, 'pluto', 100, 100, 17, { earned: false }); drawMissionPatch(pc, 'pluto', 100, 100, 30, { rim: true }); } catch (e) { pok = false; }
  ok(pok, 'PLUTO patch (heart-shaped plain + Charon) draws');
}

// ---------- 7. ★48 / パッチ 8 / マップ ----------
{
  const store = new Map([['stageBest', JSON.stringify({ AAA: { 15: { grade: 'PERFECT', stars: 7 }, 16: { grade: 'S', stars: 3 } } })]]);
  const st = { get: (k, d = null) => store.has(k) ? store.get(k) : d };
  const sum = starsSummary(st, 'AAA');
  ok(sum.maxStars === 48 && sum.bodies.length === 8 && sum.bodies[7].id === 'pluto' && sum.bodies[7].max === 6 && sum.bodies[7].stars === 5 && sum.totalStars === 5, 'stars: denominator 8 x 2 x 3 = 48, Pluto 5/6');
  ok(sum.bodies[7].stages.map((x) => x.stage).join() === '15,16', 'Pluto stages are 15 and 16');
  const pm = patchesSummary(st, 'AAA'); ok(pm.length === 8 && pm[7].id === 'pluto' && pm[7].earned === true && patchCount(pm) === 1, 'patches: 8 entries, PLUTO earned by a PERFECT on stage 15');
  const list = unlockedStarts(16);
  const m = new SolarMap({ list, summary: sum, patches: pm });
  ok(m.reachable().includes(15) && m.reachable().includes(16) && m.B.pluto.first === 15 && !m.B.pluto.locked && m.hasPatch('pluto') && m.patchTotal().of === 8, 'map: Pluto is a landing body (15, 16), patch 1/8');
  ok(m.chipRects().length === 7 && m.chipRects().every((r) => r.x >= 0 && r.x + r.w <= 360 && r.h >= 44) && m.soonRects().every((r) => r.soon !== 'PLUTO'), 'map: 7 chips inside 360 px, Pluto gone from COMING SOON');
  const locked = new SolarMap({ list: unlockedStarts(10), summary: starsSummary({ get: (k, d = null) => d }, 'ZZZ') }); ok(locked.sysLocked('pluto') && !locked.reachable().includes(15), 'Pluto stays locked until stage 15 is reached');
}

// ---------- 8. 自動操縦: 全 Pluto ステージを確実に（氷の滑走込み）----------
{
  const N = 30, out = []; let tot = 0, win = 0;
  for (const stage of [15, 16, 31, 32]) {
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) {
      seeded(seed * 7919 + stage);
      const { g } = stageGame(stage); g.obstacles = []; unseed();
      for (let f = 0; f < 40000 && (g.state === 'play' || g.state === 'grounded'); f++) { autopilotFrame(g); }
      tot++; if (g.state === 'landing') { wins++; win++; }
    }
    out.push(stage + ':' + wins); ok(wins >= 0.9 * N, 'autopilot lands Pluto stage ' + stage + ' (incl. ice slide' + (stage % 2 ? '' : ' + waypoint hop') + '): ' + wins + '/' + N);
  }
  console.log('  pluto landability (ICE_FRICTION ' + ICE_FRICTION + '): ' + out.join(' ') + '  total ' + win + '/' + tot);
}

// ---------- 9. 版・UPDATE INFORMATION ----------
{
  const E = WHATSNEW.entries;
  ok(APP_VERSION === '1.1.0-beta.5' && E[0].version === APP_VERSION && E[0].date === '2026.10.26', 'beta.5 is the newest entry (2026.10.26)');
  ok(E[0].items.join('|') === ['新天体：冥王星（氷で滑る・中継着陸）', 'ツアーは1周16ステージに', '★は48個、パッチは8枚に'].join('|') && E[0].items.every((l) => l.length <= 22), 'beta.5 items as specified, each <= 22 chars');
}

console.log('p20pluto: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
