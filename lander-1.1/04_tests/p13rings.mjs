// p13rings — L2: 輪（リング）/ 特典の輪 / ★3 / 水星 / 得点上限。実行: node 04_tests/p13rings.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
import { Game, gradeFor } from '../02_src/game.js';
import { TitleScene } from '../02_src/title.js';
import { BODIES, TERRA, STAGES_PER_BODY, BODY_COUNT, stageInfo, bodyGravity, padWidth, obstacleCount, obstacleSpeed, bonusScoreFor, BONUS_ORDER, introText, celebrationParams } from '../02_src/bodies.js';
import { autopilotKeys } from '../02_src/autopilot.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { RING_R, POWER_RING_GAP, RING_MIN, RING_MAX, RING_GAP_MIN, RING_TERRAIN_MARGIN, RING_Y_MAX, POWER_DEFS, POWER_IDS, SLOWMO_S, SIDE_S, SIDE_ACCEL, POWER_FUEL_FRAC, SLOWMO_FACTOR, buildRings, newRingState, ringStep, ringCollect, allRingsGot, maxRingScore, terrainTopIn, segDist } from '../02_src/rings.js';
import { readStageBest, recordStage, stageRecord, starsSummary, starCount, STAR_LANDED, STAR_RINGS, STAR_PERFECT } from '../02_src/stars.js';
import { WHATSNEW } from '../02_src/whatsnew.js';
import { APP_VERSION, APP_LABEL, APP_BUILD_TEXT } from '../02_src/version.js';
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
function setRings(g, pts, power) {
  g._rg = newRingState({ rings: pts.map((p, i) => ({ x: p[0], y: p[1], r: RING_R, i })), power: power ? { x: power[0], y: power[1], r: RING_R, kind: power[2] } : null });
}
// 機体を (x,y) へ1フレームで動かして update（物理を止めるため速度ゼロ・重力無効）
function warp(g, x, y) { g.vx = 0; g.vy = 0; g._gravity = 0; g.x = x; g.y = y; g.update(DT); }
// 2点間を一定速度で通る（1フレームで warp しないので、フレーム間の線分判定も使う）
function sweep(g, x0, y0, x1, y1, speed = 60) {
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / (speed * DT)));
  g.vx = 0; g.vy = 0; g._gravity = 0;
  for (let i = 0; i <= n; i++) { g.x = x0 + (x1 - x0) * i / n; g.y = y0 + (y1 - y0) * i / n; g.vx = 0; g.vy = 0; g.update(DT); }
}
// 完璧な着陸（パッド上・ゆっくり・まっすぐ）
function landPerfect(g) { onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._doSuccess(0, 0); }

// ---------- 1. 輪の配置: 全天体(水星を含む)・多数のシードで 到達可能・重ならない・地形/障害物から離れる ----------
{
  let total = 0, bad = 0, counts = { 4: 0, 5: 0, 6: 0 }, minGap = 1e9, minTer = 1e9, obsOK = 0, obsTot = 0, monotone = true, nearStart = 1e9, pwN = 0, pwTot = 0, pwTooClose = 0, pwStage1 = 0, pwMulti = 0, mercurySeen = 0;
  const stages = [];
  for (let s = 1; s <= 56; s++) stages.push(s);   // 4周ぶん（全天体×全ステージ）
  for (const stage of stages) for (let seed = 1; seed <= 25; seed++) {
    seeded(seed * 131 + stage);
    const { g } = stageGame(stage); unseed();
    const rg = g._rg; total++;
    if (stageInfo(stage).body.id === 'mercury') mercurySeen++;
    if (!rg || rg.rings.length < RING_MIN || rg.rings.length > RING_MAX) { bad++; continue; }
    counts[rg.rings.length]++;
    for (let i = 0; i < rg.rings.length; i++) {
      const r = rg.rings[i];
      if (i && r.y < rg.rings[i - 1].y - 1e-6) monotone = false;                       // 上から下へ（降下の順）
      if (i) minGap = Math.min(minGap, Math.hypot(r.x - rg.rings[i - 1].x, r.y - rg.rings[i - 1].y));
      minTer = Math.min(minTer, terrainTopIn(g.terrainPts, r.x - r.r, r.x + r.r) - (r.y + r.r));
      nearStart = Math.min(nearStart, Math.hypot(r.x - g.x, r.y - g.y));
      if (r.x < r.r || r.x > 360 - r.r || r.y < 60 || r.y > RING_Y_MAX + 1e-6) bad++;
      for (const o of g.obstacles) { obsTot++; if (Math.abs(r.y - o.y) - o.r >= 10) obsOK++; }
    }
    if (stage >= 2) { pwTot++; if (rg.power) pwN++; }
    if (stage === 1 && rg.power) pwStage1++;
    if (rg.power) {
      for (const r of rg.rings) if (Math.hypot(r.x - rg.power.x, r.y - rg.power.y) < POWER_RING_GAP - 1e-6) pwTooClose++;
      if (!clearOfTerrainP(g, rg.power)) bad++;
      if (!POWER_IDS.includes(rg.power.kind)) bad++;
    }
  }
  function clearOfTerrainP(g, p) { return terrainTopIn(g.terrainPts, p.x - p.r, p.x + p.r) - (p.y + p.r) >= RING_TERRAIN_MARGIN - 1e-6; }
  ok(bad === 0, 'all layouts valid (4-6 rings, inside the playfield, power ring clear of terrain): bad=' + bad);
  ok(counts[4] > 0 && counts[5] > 0 && counts[6] > 0, 'ring count varies over 4..6: ' + JSON.stringify(counts));
  ok(monotone, 'rings run top to bottom (descent order)');
  ok(minGap >= RING_GAP_MIN - 1e-6, 'rings never overlap / read as a line: min gap ' + minGap.toFixed(1) + ' >= ' + RING_GAP_MIN);
  ok(minTer >= RING_TERRAIN_MARGIN - 1e-6, 'rings keep clear of terrain: min clearance ' + minTer.toFixed(1) + ' >= ' + RING_TERRAIN_MARGIN);
  ok(nearStart >= 40, 'first ring is not on top of the spawn: ' + nearStart.toFixed(1));
  ok(obsOK / obsTot >= 0.8, 'rings avoid obstacle bands (>=10px from the edge) in >= 80% of cases: ' + (obsOK / obsTot).toFixed(3));
  ok(mercurySeen >= 4 * 2 * 25, 'Mercury stages included in the layout sweep: ' + mercurySeen);
  ok(pwStage1 === 0, 'no power ring on stage 1');
  ok(pwTooClose === 0, 'power ring never overlaps a ring');
  ok(pwTot > 0 && pwN / pwTot > 0.1 && pwN / pwTot < 0.4, 'power ring is rare (10-40% of stages from stage 2): ' + (pwN / pwTot).toFixed(3));
  // 同じ入力なら同じ配置（rnd 注入）
  const { g } = stageGame(8);
  const a = buildRings({ stage: 8, startX: g.x, startY: g.y, pad: g.pad, terrainPts: g.terrainPts, obstacles: g.obstacles, rnd: lcg(5) });
  const b = buildRings({ stage: 8, startX: g.x, startY: g.y, pad: g.pad, terrainPts: g.terrainPts, obstacles: g.obstacles, rnd: lcg(5) });
  ok(JSON.stringify(a) === JSON.stringify(b), 'buildRings is deterministic for the same rnd');
  // RADAR 所持なら特典の RADAR は出ない
  let radarKinds = new Set(); for (let sd = 1; sd <= 400; sd++) { const l = buildRings({ stage: 6, startX: g.x, startY: g.y, pad: g.pad, terrainPts: g.terrainPts, obstacles: [], rnd: lcg(sd), radarOwned: true }); if (l.power) radarKinds.add(l.power.kind); }
  ok(radarKinds.size > 0 && !radarKinds.has('radar'), 'owned RADAR module -> power ring never offers RADAR: ' + [...radarKinds].join());
  let allKinds = new Set(); for (let sd = 1; sd <= 600; sd++) { const l = buildRings({ stage: 6, startX: g.x, startY: g.y, pad: g.pad, terrainPts: g.terrainPts, obstacles: [], rnd: lcg(sd) }); if (l.power) allKinds.add(l.power.kind); }
  ok(POWER_IDS.every((k) => allKinds.has(k)), 'all four power kinds can appear: ' + [...allKinds].join());
  // ボーナス(TERRA)は輪なし
  const bg = newGame().g; bg.stage = 3; bg.bonus = { type: 'CALM' }; bg._initStage();
  ok(bg._rg === null, 'bonus stages have no rings');
}

// ---------- 2. 飛行可能性: 輪を順に狙う自動操縦で全部通過できる（障害物なし。特典の輪は寄り道なので別に確認）----------
{
  const N = 24; const rep = [];
  let mercWins = 0, mercLanded = 0, mercN = 0, pwGot = 0, pwN = 0;
  const fly = (g, withPower) => {
    for (let f = 0; f < 22000 && g.state === 'play'; f++) {
      const ts = g._rg.rings.filter((r) => !r.got).concat(withPower && g._rg.power && !g._rg.power.got ? [g._rg.power] : []);
      const nx = ts.filter((r) => r.y > g.y - 6).sort((p, q) => p.y - q.y)[0];
      g._apWayX = nx ? nx.x : null;
      const k = autopilotKeys(g); if (k.left) g.onInput('left'); if (k.right) g.onInput('right'); if (k.up) g.onInput('up');
      g.update(DT);
    }
  };
  for (let b = 0; b < BODY_COUNT; b++) for (const part of [1, 2]) {
    const stage = b * 2 + part;
    let all = 0, landed = 0;
    for (let seed = 1; seed <= N; seed++) {
      seeded(seed * 977 + stage);
      const { g } = stageGame(stage); g.obstacles = []; unseed();
      fly(g, false);
      if (allRingsGot(g._rg)) all++;
      if (g.state === 'landing') landed++;
      if (BODIES[b].id === 'mercury') { mercN++; if (allRingsGot(g._rg)) mercWins++; if (g.state === 'landing') mercLanded++; }
      // 特典の輪を狙う飛行（同じシード）: 寄り道して取れる
      seeded(seed * 977 + stage);
      const { g: h } = stageGame(stage); h.obstacles = []; unseed();
      if (h._rg.power) { pwN++; fly(h, true); if (h._rg.power.got) pwGot++; }
    }
    rep.push(BODIES[b].id + part + ':' + all + '/' + N);
    const slow = BODIES[b].id === 'titan';   // タイタンは終端降下速度が極端に遅く、打ち切り(22000フレーム)で輪が残ることがある
    ok(all >= (slow ? 0.6 : 0.9) * N, 'autopilot flies through every ring: ' + BODIES[b].id + ' stage ' + stage + ': ' + all + '/' + N);
  }
  console.log('  ring flight (autopilot via waypoints): ' + rep.join(' ') + '  | power ring detour reached ' + pwGot + '/' + pwN);
  ok(mercN === 2 * N && mercWins >= 0.9 * mercN, 'MERCURY: autopilot collects every ring: ' + mercWins + '/' + mercN);
  ok(mercLanded >= 0.9 * mercN, 'MERCURY: autopilot lands while following the rings: ' + mercLanded + '/' + mercN);
  // 特典は任意の寄り道。PD 自動操縦は横の機動力が低い（8px/s）ため、人が操縦するより厳しい下限として 70%
  ok(pwN >= 20 && pwGot >= 0.7 * pwN, 'power rings are reachable by a detour from the descent path (PD autopilot, a lower bound): ' + pwGot + '/' + pwN);
}

// ---------- 3. 通過判定 ----------
{
  const st = newRingState({ rings: [{ x: 100, y: 200, r: RING_R, i: 0 }], power: null });
  ok(segDist(0, 0, 10, 0, 5, 3) === 3 && near(segDist(0, 0, 10, 0, 13, 4), 5, 1e-9), 'segDist basics');
  let r = ringStep(st, 100, 150, 100, 160); ok(r.hits.length === 0 && !st.rings[0].got, 'far away: no hit');
  r = ringStep(st, 100 + RING_R + 1, 190, 100 + RING_R + 1, 210); ok(r.hits.length === 0, 'passes just outside the radius: no hit');
  r = ringStep(st, 100 + RING_R - 1, 190, 100 + RING_R - 1, 210); ok(r.hits.length === 1 && st.rings[0].got && r.hits[0].pts === 50 && r.hits[0].combo === 1, 'passes just inside: hit, +50 x1');
  r = ringStep(st, 100, 190, 100, 210); ok(r.hits.length === 0, 'a collected ring is not collected twice');
  const st2 = newRingState({ rings: [{ x: 100, y: 200, r: RING_R, i: 0 }], power: null });
  r = ringStep(st2, 100, 100, 100, 300); ok(r.hits.length === 1, 'fast pass (one big step across the ring) is caught by the segment test');
  const st3 = newRingState({ rings: [{ x: 100, y: 200, r: RING_R, i: 0 }], power: null });
  ringStep(st3, 100, 250, 100, 260); ok(st3.rings[0].missed, 'flying past below marks the ring missed');
  r = ringStep(st3, 100, 260, 100, 190); ok(r.hits.length === 1 && !st3.rings[0].missed, 'rising back through a missed ring still collects it');
  // ゲーム内: 機体中心が通ったときだけ（機体の見た目の大きさでは取れない）
  const { g } = stageGame(2); g.obstacles = []; setRings(g, [[180, 200]], null);
  sweep(g, 180 + RING_R + 4, 150, 180 + RING_R + 4, 250); ok(g._rg.collected === 0, 'game: ship centre outside the ring radius -> not collected');
  sweep(g, 180 + RING_R - 3, 150, 180 + RING_R - 3, 205, 60); ok(g._rg.collected === 1, 'game: ship centre inside -> collected');
  ok(g._floats.length >= 1 && g._floats[0].text === '+50 ×1', 'floating text "+50 x1": ' + (g._floats[0] && g._floats[0].text));
  g.particles = []; g._rg.rings[0].got = false; g._rg.last = -1; g._rg.collected = 0; warp(g, 180, 200);
  ok(g._rg.collected === 1 && g.particles.length > 5, 'burst particles spawned: ' + g.particles.length);
  ok(g.state === 'play', 'sweeping through rings in space does not crash the ship');
}

// ---------- 4. コンボと得点（順番どおり連続で増え、取り逃しでリセット）----------
{
  const mk = (n) => newRingState({ rings: Array.from({ length: n }, (_, i) => ({ x: 100, y: 100 + 50 * i, r: RING_R, i })), power: null });
  let st = mk(6); const pts = [];
  for (let i = 0; i < 6; i++) pts.push(ringCollect(st, i));
  ok(pts.join() === '50,100,150,200,250,300' && st.score === 1050 && st.combo === 6, 'in order: 50 x combo -> ' + pts.join() + ' total ' + st.score);
  ok(st.score === maxRingScore(6) && maxRingScore(4) === 500 && maxRingScore(5) === 750, 'maxRingScore = 50 * n(n+1)/2');
  st = mk(6); const q = [0, 1, 3, 4, 5].map((i) => ringCollect(st, i));   // 2 を飛ばす
  ok(q.join() === '50,100,50,100,150' && st.combo === 3 && st.score === 450, 'skipping one resets the combo: ' + q.join());
  st = mk(6); const w = [1, 2, 3].map((i) => ringCollect(st, i));          // 最初の輪を取り逃し
  ok(w.join() === '50,100,150', 'starting later still builds a combo from there (1,2,3 in order)? ' + w.join());
  st = mk(6); const o = [0, 2, 1].map((i) => ringCollect(st, i));          // 逆順
  ok(o.join() === '50,50,50' || o.join() === '50,50,100', 'out-of-order does not chain upward: ' + o.join());
  // ゲーム内のフロー: 5つ全部を順に通ると +1+2+3+4+5 (x50)
  const { e, g } = stageGame(2); g.obstacles = []; const ys = [120, 190, 260, 330, 400];
  setRings(g, ys.map((y, i) => [120 + 20 * i, y]), null);
  for (let i = 0; i < 5; i++) sweep(g, 120 + 20 * i, ys[i] - 25, 120 + 20 * i, ys[i] + 25);
  ok(g._rg.collected === 5 && g._rg.score === 750 && allRingsGot(g._rg), 'game: 5 rings in order -> 750');
  ok(e.sfxLog.filter((x) => x[0] === 'ring').map((x) => x[1]).join() === '1,2,3,4,5', 'ring chime gets a rising combo argument: ' + e.sfxLog.filter((x) => x[0] === 'ring').map((x) => x[1]).join());
  ok(g._floats.some((f) => f.text === '+50 ×5'), 'floating text shows the combo: +50 x5');
  // 取り逃しを挟む
  const r2 = stageGame(2); const g2 = r2.g; g2.obstacles = []; setRings(g2, ys.map((y, i) => [120 + 20 * i, y]), null);
  for (const i of [0, 1, 3, 4]) sweep(g2, 120 + 20 * i, ys[i] - 25, 120 + 20 * i, ys[i] + 25);
  ok(g2._rg.collected === 4 && g2._rg.score === 50 + 100 + 50 + 100 && !allRingsGot(g2._rg), 'game: skipping one ring resets the combo (50+100+50+100)');
  // 着陸でクリア内訳に RINGS が入り、総得点に加算される。墜落では加算されない
  const base = stageGame(2); base.g.obstacles = []; setRings(base.g, [[200, 150]], null); landPerfect(base.g);
  const s0 = base.g._stageScore;
  g.totalScore = 0; landPerfect(g);
  ok(g._breakdown.length === 5 && g._breakdown[4][0] === 'RINGS' && g._breakdown[4][1] === 750, 'clear breakdown gains a RINGS line: ' + JSON.stringify(g._breakdown[4]));
  ok(g._stageScore - s0 > 0 && g.totalScore === g._stageScore, 'ring points are part of the stage score / total');
  const r3 = stageGame(2); const g3 = r3.g; g3.obstacles = []; setRings(g3, [[200, 150]], null); sweep(g3, 200, 120, 200, 180);
  ok(g3._rg.score === 50, 'collected before the crash'); g3._doCrash('X'); const t0 = g3.totalScore; g3.continues = 2; g3._continue();
  ok(g3.totalScore === t0 && g3._rg.score === 0 && g3._rg.collected === 0, 'crash + continue: ring points are not banked, rings are rebuilt (no farming)');
  ok(g._breakdown.length === 5 && renderOK(g), 'render the clear screen with 5 lines');
  // 輪を取らなければ従来どおり4行（既存の内訳は不変）
  const r4 = stageGame(2); landPerfect(r4.g); ok(r4.g._breakdown.length === 4 && r4.g._breakdown.every((x) => x[0] !== 'RINGS'), 'no rings collected -> breakdown unchanged (4 lines)');
}

// ---------- 5. HUD の輪の表示・描画 ----------
{
  const { g } = stageGame(3); g.obstacles = []; setRings(g, [[150, 150], [170, 220], [190, 290], [200, 350]], null);
  let rec = newRec(); renderOK(g, rec);
  ok(rec.texts.some((t) => t.s === '0/4'), 'HUD shows the ring count 0/4: ' + rec.texts.map((t) => t.s).filter((s) => /\//.test(s)).join('|'));
  sweep(g, 150, 125, 150, 175); sweep(g, 170, 195, 170, 245);
  rec = newRec(); renderOK(g, rec);
  ok(rec.texts.some((t) => t.s === '2/4  +150'), 'HUD after 2 rings: "2/4  +150"');
  g.state = 'play'; g._pbT = 0;
  // ボーナスでは非表示
  const b = newGame().g; b.stage = 3; b.bonus = { type: 'CALM' }; b._initStage(); rec = newRec(); renderOK(b, rec);
  ok(!rec.texts.some((t) => /^\d+\/\d+/.test(t.s)), 'no ring count in bonus stages');
  // 全天体・全状態で描画が落ちない
  let n = 0;
  for (const body of BODIES) { const r = stageGame(stageInfoStageOf(body.id)); r.g._pbT = 1; r.g._pbKind = 'slowmo'; r.g._floats.push({ x: 100, y: 200, text: '+50 ×2', age: 0.3, life: 1.1 }); for (const st of ['play', 'grounded']) { r.g.state = st; if (renderOK(r.g)) n++; } }
  ok(n === BODIES.length * 2, 'render with rings/power banner/floats on every body: ' + n);
  function stageInfoStageOf(id) { return BODIES.findIndex((x) => x.id === id) * 2 + 2; }
}

// ---------- 6. 特典の輪 ----------
{
  // 取得: 1ステージ1個。再通過で二重付与しない。バナーとチャイム
  const { e, g } = stageGame(4); g.obstacles = []; setRings(g, [[100, 150]], [220, 260, 'fuel']);
  g.fuel = 50; sweep(g, 220, 230, 220, 290);
  ok(Math.abs(g.fuel - (50 + POWER_FUEL_FRAC * 100)) < 0.2, 'FUEL +15%: 50 -> 65 (' + g.fuel.toFixed(1) + ')');
  ok(g._rg.power.got && g._pbT > 0 && g._pbKind === 'fuel', 'banner shown for the power-up');
  ok(e.sfxLog.some((x) => x[0] === 'power'), 'power chime played');
  const f1 = g.fuel; sweep(g, 220, 290, 220, 230); ok(near(g.fuel, f1, 0.5), 'a power ring is granted once');
  ok(renderOK(g), 'banner renders');
  // 上限（満タンを超えない）
  const r2 = stageGame(4); r2.g.obstacles = []; setRings(r2.g, [[100, 150]], [220, 260, 'fuel']); r2.g.fuel = 95; sweep(r2.g, 220, 230, 220, 290);
  ok(near(r2.g.fuel, 100, 0.2), 'FUEL capped at the tank size: ' + r2.g.fuel.toFixed(1));
  // RADAR: そのステージ中だけ。次のステージで消える。モジュール所持とは別
  const r3 = stageGame(4); const g3 = r3.g; g3.obstacles = []; setRings(g3, [[100, 150]], [220, 260, 'radar']);
  ok(!g3._hasRadar(), 'no radar before'); sweep(g3, 220, 230, 220, 290);
  ok(g3._hasRadar() && g3._lvl('radar') === 0 && g3._activePower().kind === 'radar', 'RADAR power on for the rest of the stage (module level unchanged)');
  run(g3, 20); ok(g3._hasRadar(), 'RADAR does not time out within the stage');
  g3._initStage(); ok(!g3._hasRadar(), 'RADAR power is gone on the next stage');
  // SLOW-MO: 8秒間 隕石 50% 速度
  const r4 = stageGame(6); const g4 = r4.g; setRings(g4, [[100, 150]], [220, 160, 'slowmo']);
  g4.obstacles = [{ x: 100, y: 300, vx: 40, r: 12, style: 'rock' }];
  const dx0 = (() => { const o = g4.obstacles[0]; const x0 = o.x; g4.vx = 0; g4.vy = 0; g4._gravity = 0; g4.x = 30; g4.y = 80; g4.update(1); return o.x - x0; })();
  g4.obstacles[0].x = 100; g4.obstacles[0].vx = 40;
  sweep(g4, 220, 130, 220, 190, 80);
  ok(g4._slowT > 7 && g4._slowT <= SLOWMO_S, 'SLOW-MO timer started: ' + g4._slowT.toFixed(2));
  g4.obstacles[0].x = 100; g4.obstacles[0].vx = 40; g4.x = 30; g4.y = 80; g4.vx = 0; g4.vy = 0;
  const xa = g4.obstacles[0].x; g4.update(0.05); const dxSlow = (g4.obstacles[0].x - xa) / 0.05;
  ok(near(dxSlow, 40 * SLOWMO_FACTOR, 1.5) && dx0 > 0, 'obstacles move at SLOWMO_FACTOR speed while SLOW-MO: ' + dxSlow.toFixed(1) + ' px/s (normal 40)');
  ok(g4._activePower().kind === 'slowmo' && g4._activePower().remain > 0, 'HUD power info during SLOW-MO');
  g4._slowT = 0.05; g4.obstacles[0].x = 100; g4.obstacles[0].vx = 40; g4.x = 30; g4.y = 80; g4.vx = 0; g4.vy = 0;
  run(g4, 0.2); g4.obstacles[0].x = 100; g4.x = 30; g4.y = 80; g4.vx = 0; g4.vy = 0; const xb = g4.obstacles[0].x; g4.update(0.05);
  ok(near((g4.obstacles[0].x - xb) / 0.05, 40, 1.5) && g4._slowT === 0 && !g4._activePower(), 'SLOW-MO ends: obstacles back to full speed');
  ok(SLOWMO_S === 8 && SLOWMO_FACTOR === 0.25 && SIDE_S === 8 && SIDE_ACCEL === 12 && POWER_FUEL_FRAC === 0.15, 'spec constants: 8s / 25% / side 8s / 12 px/s2 / 15%');
  // SIDE THRUST: 8秒間 水平を保ち、左右ボタンで真横へ（詳細は p18assist）
  const r5 = stageGame(6); const g5 = r5.g; g5.obstacles = []; setRings(g5, [[100, 150]], [220, 200, 'side']);
  g5.angle = 40; g5.omega = 0; g5.vx = 0; g5.vy = 0; g5._gravity = 0.1; g5.x = 220; g5.y = 170;
  for (let i = 0; i < 60 && !g5._rg.power.got; i++) { g5.y += 1; g5.update(DT); }
  ok(g5._rg.power.got && g5._sideT > 7 && g5._sideT <= SIDE_S, 'SIDE THRUST started: ' + g5._sideT.toFixed(2));
  const a0 = Math.abs(g5.angle); const fuel0 = g5.fuel;
  g5.y = 150; g5.vy = 0; run(g5, 3); g5.y = 150; g5.vy = 0;
  ok(Math.abs(g5.angle) < 1 && Math.abs(g5.angle) < a0 - 20, 'held level within 3 s: ' + a0.toFixed(1) + ' -> ' + g5.angle.toFixed(1));
  ok(near(g5.fuel, fuel0, 0.01), 'no buttons pressed: side thrust uses no fuel');
  g5.y = 150; g5.vy = 0; g5.vx = 0; run(g5, 5.5);
  ok(g5._sideT === 0 && !g5._activePower(), 'SIDE THRUST ends after 8 s');
  g5.angle = 30; g5.omega = 0; g5.y = 150; g5.vy = 0; g5.vx = 0; run(g5, 1); ok(Math.abs(g5.angle - 30) < 1.5, 'after it ends the ship holds its attitude again (no auto-level)');
  // 特典は自動操縦を出さない（位置・速度は触らない）
  const x0 = g5.x, vx0 = g5.vx; g5.update(DT); ok(g5.x === x0 + g5.vx * DT || near(g5.x, x0 + vx0 * DT, 0.01), 'power-ups never steer the ship translation');
  // ミュートを守る
  const m = stageGame(4, [['muted', '1']]); m.g.obstacles = []; setRings(m.g, [[100, 150]], [220, 260, 'fuel']);
  sweep(m.g, 100, 120, 100, 180); sweep(m.g, 220, 230, 220, 290);
  ok(m.e.sfxLog.filter((x) => x[0] === 'ring' || x[0] === 'power').length === 0, 'muted: no ring/power sfx at all');
  // 特典の輪のボーナス・ステージ1では出ない（配置側で保証済み）。パワー種別の定義
  ok(POWER_IDS.join() === 'slowmo,radar,side,fuel' && POWER_IDS.every((k) => POWER_DEFS[k] && POWER_DEFS[k].name), 'power definitions');
  ok(!POWER_IDS.includes('autopilot'), 'no autopilot power');
}

// ---------- 7. ★3: 保存・累積・パイロット別・デバッグ/ボーナス除外・表示 ----------
{
  const pf = prof('ACE');
  const { e, g } = stageGame(3, pf); g.obstacles = [];
  // 1回目: 着陸のみ（輪なし・グレードC相当）
  setRings(g, [[100, 150], [120, 220]], null);
  onPad(g); g.vx = 0; g.vy = 18; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
  let rec = stageRecord(e.storage, 'ACE', 3);
  ok(rec.stars === STAR_LANDED, 'landing only -> 1 star (landed): ' + rec.stars);
  ok(g._starsInfo && g._starsInfo.mask === 1 && g._starsInfo.fresh === 1, 'clear panel info: fresh = landed');
  // 2回目: 輪を全部取って着陸（PERFECT でない）-> ★★ に累積
  g._initStage(); g.obstacles = []; setRings(g, [[100, 150], [120, 220]], null);
  sweep(g, 100, 120, 100, 180); sweep(g, 120, 190, 120, 250);
  g.state = 'play'; onPad(g); g.vx = 0; g.vy = 14; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
  rec = stageRecord(e.storage, 'ACE', 3);
  ok(rec.stars === (STAR_LANDED | STAR_RINGS) && g._starsInfo.fresh === STAR_RINGS && g._starsInfo.mask === 3, 'all rings in that run -> rings star added (cumulative): ' + rec.stars);
  // 3回目: 輪は取らないが PERFECT -> 3 つ全部（他の挑戦で取った★も累積）
  g._initStage(); g.obstacles = []; setRings(g, [[100, 150], [120, 220]], null);
  g.state = 'play'; onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
  rec = stageRecord(e.storage, 'ACE', 3);
  ok(g._grade === 'PERFECT' && rec.stars === 7 && rec.grade === 'PERFECT' && g._starsInfo.fresh === STAR_PERFECT, 'PERFECT without rings still adds its star; stars accumulate across attempts (all 3)');
  // 輪を1つ取り逃した着陸では ★2 は付かない
  const r2 = stageGame(4, prof('BOB')); r2.g.obstacles = []; setRings(r2.g, [[100, 150], [120, 220]], null); sweep(r2.g, 100, 120, 100, 180);
  r2.g.state = 'play'; onPad(r2.g); r2.g.vx = 0; r2.g.vy = 14; r2.g.angle = 0; r2.g.omega = 0; r2.g._doSuccess(0, 0);
  ok(stageRecord(r2.e.storage, 'BOB', 4).stars === 1, 'missing one ring -> no rings star');
  // 悪いグレードでは最良グレードを下げない・★は減らない
  const r3 = stageGame(3, pf); r3.g.obstacles = []; setRings(r3.g, [[100, 150]], null);
  r3.e.store.set('stageBest', e.store.get('stageBest')); onPad(r3.g); r3.g.vx = 0; r3.g.vy = 18; r3.g.angle = 0; r3.g.omega = 0; r3.g._doSuccess(0, 0);
  rec = stageRecord(r3.e.storage, 'ACE', 3); ok(rec.stars === 7 && rec.grade === 'PERFECT', 'a worse later attempt never removes stars or lowers the best grade');
  // パイロット別
  const sb = readStageBest(e.storage); ok(sb.ACE && sb.ACE['3'].stars === 7, 'stored next to stageBest, per pilot');
  const r4 = stageGame(3, prof('CAT'));
  r4.e.store.set('stageBest', e.store.get('stageBest'));
  ok(stageRecord(r4.e.storage, 'CAT', 3).stars === 0, 'another pilot has no stars on the same stage');
  onPad(r4.g); r4.g.vx = 0; r4.g.vy = 1; r4.g.angle = 0; r4.g.omega = 0; r4.g._doSuccess(0, 0);
  ok(stageRecord(r4.e.storage, 'CAT', 3).stars >= 5 && stageRecord(r4.e.storage, 'ACE', 3).stars === 7, 'pilots are scoped independently');
  ok(recordStage(e.storage, '__proto__', 1, 'C', 1).saved === false, 'unsafe pilot name is not stored');
  // デバッグ操作のラン・デバッグモードは記録しない
  const d1 = stageGame(3, prof('DAN')); d1.g._dbgTainted = true; d1.g.obstacles = []; onPad(d1.g); d1.g.vy = 1; d1.g._doSuccess(0, 0);
  ok(!d1.e.store.has('stageBest') && d1.g._starsInfo === null, 'debug-tainted run: no stars recorded and none shown');
  setDebug(true); const d2 = stageGame(3, prof('DAN')); d2.g.obstacles = []; onPad(d2.g); d2.g.vy = 1; d2.g._doSuccess(0, 0); setDebug(false);
  ok(!d2.e.store.has('stageBest') && d2.g._starsInfo === null, 'debug mode: no stars recorded');
  // ボーナスは記録しない
  const b1 = newGame(prof('EVE')); b1.g.stage = 3; b1.g.bonus = { type: 'CALM' }; b1.g._initStage(); onPad(b1.g); b1.g.vy = 1; b1.g._doSuccess(0, 0);
  ok(!b1.e.store.has('stageBest') && b1.g._starsInfo === null, 'bonus stage: no stars');
  // パイロットなし（プロファイルなし）でも落ちない
  const n1 = stageGame(3); n1.g.obstacles = []; onPad(n1.g); n1.g.vy = 1; let thr = false; try { n1.g._doSuccess(0, 0); } catch (_) { thr = true; }
  ok(!thr && !n1.e.store.has('stageBest'), 'no pilot profile: lands fine, nothing stored');
  // 壊れた保存値から復旧
  const c1 = stageGame(3, [...prof('FAY'), ['stageBest', '{oops']]); c1.g.obstacles = []; onPad(c1.g); c1.g.vy = 1; c1.g._doSuccess(0, 0);
  ok(stageRecord(c1.e.storage, 'FAY', 3).stars >= 5, 'corrupt stageBest is rebuilt');
  // L1 形式（grade だけ）の既存データは壊さず引き継ぐ
  const l1 = stageGame(3, [...prof('GUS'), ['stageBest', JSON.stringify({ GUS: { 3: { grade: 'S' }, 4: { grade: 'A' } } })]]); l1.g.obstacles = []; onPad(l1.g); l1.g.vy = 14; l1.g.angle = 0; l1.g._doSuccess(0, 0);
  const sbl = readStageBest(l1.e.storage); ok(sbl.GUS['4'].grade === 'A' && sbl.GUS['3'].grade === 'S' && sbl.GUS['3'].stars === 1, 'L1-format data upgraded in place (grade kept, stars added)');
  // 集計関数（L3 の太陽系マップ用）
  const sum = starsSummary(e.storage, 'ACE');
  ok(sum.bodies.length === BODY_COUNT && sum.bodies[sum.bodies.length - 1].id === 'mercury', 'starsSummary: one entry per body, Mercury last');
  const europa = sum.bodies.find((b) => b.id === 'europa');
  ok(europa.stages.length >= 2 && europa.stages[0].stage === 3 && europa.stages[0].stars === 3 && europa.stages[0].grade === 'PERFECT' && europa.stages[0].mask === 7, 'starsSummary: per-stage stars + best grade (Europa stage 3)');
  ok(europa.stars === 3 && europa.grade === 'PERFECT' && sum.totalStars === 3 + 0 && sum.maxStars === BODY_COUNT * 2 * 3, 'starsSummary totals: ' + sum.totalStars + '/' + sum.maxStars);
  ok(starsSummary(e.storage, 'NOBODY').totalStars === 0 && starsSummary(e.storage, '').bodies.every((b) => b.stars === 0), 'starsSummary for unknown/empty pilot');
  ok(starCount(0) === 0 && starCount(7) === 3 && starCount(5) === 2, 'starCount');
  // クリア画面: ★が描かれ、グレードのスタンプの後に新しい★が順に押される
  const v = stageGame(3, pf); v.g.obstacles = []; setRings(v.g, [[100, 150]], null); sweep(v.g, 100, 120, 100, 180);
  v.g.state = 'play'; onPad(v.g); v.g.vx = 0; v.g.vy = 1; v.g.angle = 0; v.g.omega = 0; v.e.store.delete('stageBest'); v.g._doSuccess(0, 0);
  run(v.g, 2.7); ok(v.g.state === 'cleared', 'cleared state reached');
  ok(v.g._starT === 0 && v.g._clearView().stars.k.every((x) => x === 0), 'stars wait for the grade stamp: not popped while counting');
  run(v.g, 1.3);
  const cv0 = v.g._clearView(); ok(cv0.stars && cv0.stars.fresh === 7 && cv0.stars.k.every((x) => x === 0) && v.g._starT < 0.12, 'count finished: stars about to pop (starT=' + v.g._starT.toFixed(3) + ')');
  rec = newRec(); renderOK(v.g, rec);
  ok(['LANDED', 'RINGS', 'PERFECT'].every((s) => rec.texts.some((t) => t.s === s)), 'clear panel shows the three star labels');
  run(v.g, 0.2); const cv1 = v.g._clearView(); run(v.g, 1.2); const cv2 = v.g._clearView();
  ok(cv1.stars.k[0] > 0 && cv1.stars.k[2] < cv1.stars.k[0], 'stars pop one after another: ' + cv1.stars.k.map((x) => x.toFixed(2)).join('/'));
  ok(cv2.stars.k.filter((x, i) => cv2.stars.fresh & (1 << i)).every((x) => x === 1) && v.g._clearT >= v.g._clearEnd(), 'all stars popped ~1.4 s after the count');
  const R = v.g._clearPanelRect(); ok(R.h === 216 + 10 + 42 + (v.g._patchInfo ? 46 : 0) && R.y + R.h < 455, 'panel with RINGS line + stars row (+patch row if earned) fits above the pads: h=' + R.h);
  // タップで集計を最後まで飛ばすと★も完了
  const v2 = stageGame(3, pf); v2.g.obstacles = []; onPad(v2.g); v2.g.vy = 1; v2.g._doSuccess(0, 0); run(v2.g, 2.7); v2.g._inputLock = 0; v2.g._skipClear();
  { const cs = v2.g._clearView().stars; ok(cs.k.filter((x, i) => cs.fresh & (1 << i)).every((x) => x === 1) && cs.fresh > 0, 'skip completes the star animation'); }
  // 既に取った★は押印アニメーションなしで最初から表示
  const v3 = stageGame(3, pf); v3.e.store.set('stageBest', e.store.get('stageBest')); v3.g.obstacles = []; onPad(v3.g); v3.g.vy = 1; v3.g._doSuccess(0, 0);
  ok(v3.g._starsInfo.fresh === 0 && v3.g._starsInfo.mask === 7, 'already-earned stars are shown, not re-animated');
  // CHOOSE START: ステージごとの★と最高グレード
  const st = new Map([['hudTipSeen', '1'], ...prof('ACE'), ['progress', JSON.stringify({ ACE: { maxStage: 6 } })], ['stageBest', e.store.get('stageBest')]]);
  const te = makeEngine([...st.entries()]); const t = new TitleScene(te, noop, { launch: false }); t.enter(); t.update(0.016);
  t.onInput('tap', { x: t.startBtn.x + 2, y: t.startBtn.y + 2, now: 0, t0: 0 });
  ok(!!t.map, 'solar map opens where CHOOSE START did');
  if (t.map) {
    const r3s = t.map.pips('europa').find((r) => r.stage === 3), r1s = t.map.pips('moon').find((r) => r.stage === 1);
    ok(r3s && r3s.mask === 7 && r3s.grade === 'PERFECT' && r1s && r1s.mask === 0 && r1s.grade === '', 'solar map pips carry stars + best grade per stage');
    const rc = newRec(); let tt = false; try { t.render(makeCtx(rc)); } catch (_) { tt = true; } ok(!tt, 'solar map renders with stars');
  }
}

// ---------- 8. 水星 ----------
{
  const M = BODIES[BODIES.length - 1];
  ok(BODY_COUNT === 7 && M.id === 'mercury' && M.name === 'MERCURY' && BODIES[5].id === 'venus', 'Mercury is the 7th body, right after Venus (end of the tour)');
  ok(M.realG === 3.70 && M.atmoType === 'none' && M.atmoTag === 'NONE' && M.drag === 0 && !M.wind.base && !M.wind.gust, 'real g 3.70, no atmosphere, no drag, no wind');
  ok(M.visibility > 0 && M.visibility < 150 && M.heat && M.heat.fuelDrain > 0 && M.heat.fuelDrain < BODIES[5].heat.fuelDrain && M.heat.mainFuelMul <= BODIES[5].heat.mainFuelMul, 'visibility (dark crater) + lighter heat than Venus');
  ok(M.guideAboveFog === true && M.visual.sky[0] === '#000000' && M.visual.skyObject === 'sun-low' && /^#[0-3]/.test(M.visual.ground), 'dark ground + low sun + guide drawn above the darkness');
  ok(M.celebTier === 2 && celebrationParams(M).apex > 0, 'celebration tier fitted');
  ok(introText(M).startsWith('MERCURY · g 3.70 m/s² · NONE') && introText(M).includes('DARK CRATER') && !introText(M).includes('WIND'), 'intro text: ' + introText(M));
  ok(STAGES_PER_BODY === 2 && stageInfo(13).body.id === 'mercury' && stageInfo(14).body.id === 'mercury' && stageInfo(15).body.id === 'moon' && stageInfo(15).loop === 1, 'two stages like other bodies; loop is now 14 stages');
  // 重力と周回の拡大
  for (const [stage, loop] of [[13, 0], [14, 0], [27, 1], [28, 1], [41, 2]]) {
    const { g } = stageGame(stage);
    ok(near(g._gravity, 0.25 * Math.sqrt(3.70 / 1.62) * (1 + 0.15 * loop), 1e-12) && g._body.id === 'mercury' && g._info.loop === loop, 'Mercury gravity/loop scaling at stage ' + stage);
    ok(g._padW === padWidth(stage) && g.obstacles.length === obstacleCount(stage) && g._windSpec === null, 'pad/obstacles per formula, no wind at stage ' + stage);
  }
  ok(padWidth(15) === 46 && obstacleSpeed(14) === 51 && obstacleSpeed(15) === 18 && padWidth(14) === 22, 'loop-scaling formulas follow the 14-stage loop');
  // 受動的な燃料消費（日照側の熱）: 毎秒 fuelDrain、推力では 1.0 倍
  const { g } = stageGame(13); g.obstacles = []; g.x = 180; g.y = 100; g.vx = 0; g.vy = 0; g._gravity = 0; const f0 = g.fuel; run(g, 3);
  ok(near(f0 - g.fuel, 3 * M.heat.fuelDrain, 0.05), 'passive fuel drain on Mercury: ' + (f0 - g.fuel).toFixed(2) + ' ~ ' + (3 * M.heat.fuelDrain).toFixed(2));
  const { g: gm } = stageGame(1); gm.obstacles = []; gm.x = 180; gm.y = 100; gm.vx = 0; gm.vy = 0; gm._gravity = 0; const fm = gm.fuel; run(gm, 3);
  ok(fm - gm.fuel < 0.01, 'moon has no passive drain (control)');
  // 視界: 暗闇の描画（霧のグラデーション=visibility）と、その上に誘導線・ビーコン・輪
  const rec = newRec(); const gr = stageGame(13).g; gr.obstacles = []; gr.x = 180; gr.y = 200; renderOK(gr, rec);
  const fogIdx = rec.ops.findIndex((o) => o[0] === 'grad' && o[1][5] === M.visibility);
  const guideIdx = rec.ops.map((o, i) => (o[0] === 'dash' && o[1] && o[1].length === 2 && ((o[1][0] === 2 && o[1][1] === 7) || (o[1][0] === 5 && o[1][1] === 5))) ? i : -1).filter((i) => i >= 0);
  ok(fogIdx >= 0, 'darkness drawn with the ship light radius ' + M.visibility);
  ok(guideIdx.length >= 1 && guideIdx.every((i) => i > fogIdx), 'guide line is drawn on top of the darkness (pad guidance stays readable)');
  // 他の天体(タイタン)の誘導線は従来どおり霧の下
  const rt = newRec(); const gt = stageGame(9).g; gt.obstacles = []; gt.x = 180; gt.y = 200; renderOK(gt, rt);
  const fogT = rt.ops.findIndex((o) => o[0] === 'grad' && o[1][5] === BODIES[4].visibility), guideT = rt.ops.findIndex((o) => o[0] === 'dash' && o[1] && o[1].length === 2 && ((o[1][0] === 2 && o[1][1] === 7) || (o[1][0] === 5 && o[1][1] === 5)));
  ok(fogT >= 0 && guideT >= 0 && guideT < fogT, 'Titan keeps the guide under the fog (unchanged)');
  // 水星のビーコンは霧の後
  ok(renderOK(gr) && renderOK(stageGame(14).g), 'render Mercury stages');
  // ambient music: 専用シーンがあり body 切替で再生される
  const log = []; const gmus = newGame().g; gmus.engine.music.playBody = (id) => log.push(id); gmus.stage = 13; gmus._initStage();
  ok(log[log.length - 1] === 'mercury', 'Mercury music requested on entry');
  const musSrc = fs.readFileSync(new URL('../02_src/music.js', import.meta.url), 'utf8');
  ok(/\n  mercury: \{/.test(musSrc) && /ring\(combo\)/.test(musSrc) && /power\(\) \{/.test(musSrc), 'music.js has a mercury ambient scene + sfx.ring / sfx.power');
}

// ---------- 9. 水星: 自動操縦（04_tests の PD）で全ステージ着陸、周回でも ----------
{
  const N = 40; const out = [];
  for (const stage of [13, 14, 27, 28, 41, 42]) {
    let wins = 0;
    for (let seed = 1; seed <= N; seed++) {
      seeded(seed * 7919 + stage);
      const { g } = stageGame(stage); g.obstacles = []; unseed();
      for (let f = 0; f < 15000 && g.state === 'play'; f++) { const k = autopilotKeys(g); if (k.left) g.onInput('left'); if (k.right) g.onInput('right'); if (k.up) g.onInput('up'); g.update(DT); }
      if (g.state === 'landing') wins++;
    }
    out.push(stage + ':' + wins);
    ok(wins >= 0.8 * N, 'autopilot lands on Mercury stage ' + stage + ': ' + wins + '/' + N);
  }
  console.log('  mercury landability (plain autopilot): ' + out.join(' '));
}

// ---------- 10. 得点上限（中継: stage x 8000）----------
{
  const worker = fs.readFileSync(new URL('../../lander/06_server/ranking-worker.js', import.meta.url), 'utf8');
  const cap = +(/MAX_SCORE_PER_STAGE\s*=\s*(\d+)/.exec(worker) || [])[1];
  ok(cap === 8000, 'relay cap found in ../lander/06_server/ranking-worker.js: ' + cap);
  ok(/score > stage \* MAX_SCORE_PER_STAGE/.test(worker), 'relay rejects score > stage * cap');
  // 全ステージ「満タン・PERFECT・全輪最大コンボ」で進める最悪ケース。各ステージの到達時点で total <= stage * cap を確認（ボーナスは STORM 満タン）
  const { g } = newGame(); g.continues = 3; let worst = 0, worstBonus = 0, violations = 0;
  for (let stage = 1; stage <= 84; stage++) {
    g.stage = stage; g.bonus = null; g._initStage(); g.obstacles = [];
    const n = g._rg.rings.length; for (let i = 0; i < n; i++) ringCollect(g._rg, i);
    g.fuel = g._fuelMax(); onPad(g); g.vx = 0; g.vy = 0; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
    ok(g._grade === 'PERFECT' && g._breakdown.some((x) => x[0] === 'RINGS' && x[1] === maxRingScore(n)), 'worst-case stage ' + stage + ' scores the full ring bonus ' + maxRingScore(n));
    worst = Math.max(worst, g._stageScore);
    if (g.totalScore > stage * cap) violations++;
    if (stage % 3 === 0) {   // ボーナス（最大: STORM, 満タン）
      const sc = bonusScoreFor('STORM', g._fuelMax()); worstBonus = Math.max(worstBonus, sc); g.totalScore += sc;
      if (g.totalScore > stage * cap) violations++;
    }
  }
  ok(violations === 0, 'worst-case run never exceeds stage x 8000 at any stage (84 stages incl. Mercury + bonuses)');
  ok(worst < cap * 0.6 && worstBonus < cap, 'single-stage worst case ' + worst + ' (< 60% of the cap), bonus worst ' + worstBonus);
  ok(maxRingScore(RING_MAX) === 1050, 'ring bonus never exceeds 1050 per stage');
}

// ---------- 11. WHAT'S NEW / 版 ----------
{
  ok(APP_VERSION === '1.1.0-beta.4' && APP_LABEL === 'BETA v1.1' && APP_BUILD_TEXT === 'build 1.1.0-beta.4', 'version 1.1.0-beta.4, label unchanged');
  const E0 = WHATSNEW.entries[0];
  ok(WHATSNEW.version === APP_VERSION && E0.version === APP_VERSION && E0.items.length >= 1 && E0.items.length <= 6, 'whatsnew newest entry: 1-6 items');
  ok(WHATSNEW.entries.every((en) => en.items.every((l) => l.length <= 22)), 'each item <= 22 chars: ' + WHATSNEW.entries.flatMap((en) => en.items.map((l) => l.length)).join(','));
  const joined = WHATSNEW.entries.flatMap((en) => en.items).join('|');
  ok(/輪/.test(joined) && /特別な輪|特典/.test(joined) && /★/.test(joined) && /水星/.test(joined), 'mentions rings, special rings, stars, Mercury');
  ok(WHATSNEW.entries[1].items.includes('タイトルの MAP から太陽系マップ') && 'タイトルの MAP から太陽系マップ'.length <= 22, 'mentions the title MAP button');
}

console.log('p13rings: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
