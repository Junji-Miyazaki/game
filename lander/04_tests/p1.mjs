// LANDER P1 ヘッドレステスト。実行: node 04_tests/p1.mjs
import { Game, landingPhase, LANDING_PHASES } from '../02_src/game.js';
import { loadRanking, saveRanking, insertEntry, qualifies } from '../02_src/ranking.js';
import { TitleScene } from '../02_src/title.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  return noop; }, set: () => true });

const BTN_Y = 640 - 80;
function makeStorage() {
  const m = new Map([['hudTipSeen', '1']]);
  return { m, getHigh: () => 0, setHigh: () => false,
    get: (k, d = null) => m.has(k) ? m.get(k) : d, set: (k, v) => m.set(k, String(v)) };
}
function makeEngine() {
  const e = {
    ctx, audio: new Proxy({}, { get: () => noop }), storage: makeStorage(),
    text: noop, rect: noop, stroke: noop, menuCalls: 0,
    toMenu() { e.menuCalls++; },
    pointer: { down: false, x: 0, y: 0 }, touches: [],
  };
  return e;
}
function newGame() { const e = makeEngine(); const g = new Game(e); g.enter(); return { e, g }; }
function tick(g, sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) g.update(dt); }
function tap(g, x = 10, y = 300) { g.onInput('tap', { x, y }); }

// ---------- 1. ranking pure functions ----------
{
  const mk = (name, score, stage, date) => ({ name, score, stage, date });
  let l = [];
  l = insertEntry(l, mk('a', 100, 1, '2026-01-01'));
  l = insertEntry(l, mk('b', 300, 2, '2026-01-02'));
  l = insertEntry(l, mk('c', 200, 5, '2026-01-03'));
  ok(l.map(e => e.name).join('') === 'bca', 'sort by score desc');
  l = insertEntry(l, mk('d', 200, 7, '2026-01-04'));
  ok(l.map(e => e.name).join('') === 'bdca', 'tie score -> higher stage first');
  l = insertEntry(l, mk('e', 200, 5, '2026-01-02'));
  ok(l.map(e => e.name).join('') === 'bdeca', 'tie score+stage -> earlier date first: ' + l.map(e => e.name).join(''));
  const before = l.length;
  insertEntry(l, mk('z', 1, 1, 'x'));
  ok(l.length === before, 'insertEntry is non-mutating');
  let big = [];
  for (let i = 1; i <= 15; i++) big = insertEntry(big, mk('p' + i, i * 10, 1, '2026-01-' + String(i).padStart(2, '0')));
  ok(big.length === 10, 'capped at 10');
  ok(big[0].score === 150 && big[9].score === 60, 'top10 kept: ' + big[0].score + '..' + big[9].score);
  ok(qualifies([], 1), 'empty list: 1 qualifies');
  ok(!qualifies([], 0), 'score 0 never qualifies');
  ok(!qualifies([], -5), 'negative never qualifies');
  ok(qualifies(big.slice(0, 9), 1), '<10 entries: qualifies');
  ok(!qualifies(big, 60), 'equal to 10th does not beat it');
  ok(qualifies(big, 61), 'beats 10th');
  // storage round trip + corrupt
  const st = makeStorage();
  ok(loadRanking(st).length === 0, 'load empty');
  saveRanking(st, big);
  ok(loadRanking(st).length === 10 && loadRanking(st)[0].name === 'p15', 'round trip');
  st.set('ranking', '{not json');
  ok(Array.isArray(loadRanking(st)) && loadRanking(st).length === 0, 'corrupt JSON -> []');
  st.set('ranking', '{"a":1}');
  ok(loadRanking(st).length === 0, 'non-array -> []');
  st.set('ranking', JSON.stringify([{ name: 'ok', score: 5, stage: 1, date: 'd' }, null, 3, { name: 1 }]));
  ok(loadRanking(st).length === 1, 'invalid elements filtered');
  const bad = { get() { throw new Error('x'); }, set() { throw new Error('y'); } };
  ok(loadRanking(bad).length === 0 && saveRanking(bad, []) === false, 'throwing storage is safe');
}

// ---------- 2. pad always >= 12px above button bar ----------
{
  const { g } = newGame();
  let worst = -1e9, movingOk = true;
  for (let i = 0; i < 2000; i++) {
    g.stage = 1 + (i % 12);
    g.bonus = (i % 4 === 0) ? { type: 'ROVER' } : (i % 4 === 1) ? { type: 'STORM' } : null;   // P6: 旧 MOVING_PAD/PRECISION の対応先
    g._initStage();
    const bottom = g.pad.y + 10;
    worst = Math.max(worst, bottom);
    if (g.pad.moving) {
      if (!(g.pad.minX >= 0 && g.pad.maxX + g.pad.w <= 360 && g.pad.maxX > g.pad.minX)) movingOk = false;
      // 台地の幅 = plateauSegs x 20px（P6: 8区間160px -> 6区間120px）
      if (Math.abs((g.pad.maxX + g.pad.w - g.pad.minX) - 120) > 1) movingOk = false;
    }
    // 地形は左右端でボタン帯の背後まで塗りが続く（端点 y <= BTN_Y、描画は H まで）
    if (g.terrainPts[0].y > BTN_Y || g.terrainPts[g.terrainPts.length - 1].y > BTN_Y) worst = 1e9;
    // パッド下の地形 = パッド面
    const ty = g._terrainYAt(g.pad.x + 1), ty2 = g._terrainYAt(g.pad.x + g.pad.w - 1);
    if (Math.abs(ty - g.pad.y) > 0.01 || Math.abs(ty2 - g.pad.y) > 0.01) worst = 1e9;
  }
  ok(worst <= BTN_Y - 12, 'pad bottom (incl legs) <= BTN_Y-12 over 2000 terrains; worst=' + worst);
  ok(movingOk, 'moving pad plateau geometry valid');
}

// ---------- 3. bounce-loop resolution ----------
{
  // (a) 傾いた低速接触を強制し、実際に約1.6秒以内に 'play' を抜けること
  let resolvedAll = true, maxT = 0;
  for (const ang of [30, 35, 45, 54]) {
    const { g } = newGame();
    const px = g.pad.x + g.pad.w / 2;
    g.x = px; g.y = g._terrainYAt(px) - 16 - 0.05; g.vx = 0; g.vy = 3; g.angle = ang; g.omega = 0;
    let t = 0;
    while (g.state === 'play' && t < 4) { g.update(1 / 60); t += 1 / 60; }
    maxT = Math.max(maxT, t);
    if (g.state === 'play') resolvedAll = false;
  }
  ok(resolvedAll && maxT <= 1.7, 'tilted low-speed contact leaves play within ~1.6s; max=' + maxT.toFixed(2));
  // (b) 決着ロジック: 33°以下=成功 / 超=TIPPED OVER
  let { g } = newGame();
  g._bouncing = true; g._bounceTime = 1.51; g.angle = 30; g.vx = g.vy = 0;
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16;
  g._resolveBounce();
  ok(g.state === 'landing', 'resolve: 30deg -> success (landing seq)');
  ({ g } = newGame());
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.angle = 40; g._bouncing = true;
  g._resolveBounce();
  ok(g.state === 'crashed' && g._crashReason === 'TIPPED OVER', 'resolve: 40deg -> TIPPED OVER: ' + g.state + '/' + g._crashReason);
  // (c) update 経由: _bouncing の累積が1.5秒を超えたら決着
  ({ g } = newGame());
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16 - 0.01; g.vx = 0; g.vy = 0; g.omega = 0; g.angle = 45;
  g._bouncing = true; g._bounceTime = 1.49;
  tick(g, 0.1);
  ok(g.state !== 'play', 'update-driven resolve after cumulative >1.5s: ' + g.state);
  // (d) 離陸したらバウンス状態は解除される
  ({ g } = newGame());
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16 - 80; g.vy = -5; g.angle = 0;
  g._bouncing = true; g._bounceTime = 1.4;
  tick(g, 0.1);
  ok(g.state === 'play' && g._bouncing === false && g._bounceTime === 0, 'airborne clears bounce state');
}

// ---------- 4. continues ----------
{
  const { e, g } = newGame();
  ok(g.continues === 3, 'starts with 3 continues');
  g.stage = 4; g.totalScore = 777; g._initStage();
  const stageParamsSnap = { grav: g._gravity, padW: g._padW, obs: g.obstacles.length };
  const terrain1 = g.terrainPts;
  g._doCrash('TEST');
  ok(g.state === 'crashed' && g.continues === 3 && g._crashReason === 'TEST', 'crash with continues -> crashed overlay, none consumed yet');
  tap(g);                        // 入力ロック中（押しっぱなしの指の解除対策）
  ok(g.state === 'crashed', 'tap ignored during input lock');
  tick(g, 0.6);
  tap(g);
  ok(g.state === 'play' && g.continues === 2, 'continue consumed -> play, 2 left');
  ok(g.stage === 4 && g.totalScore === 777, 'same stage, totalScore kept');
  ok(g._gravity === stageParamsSnap.grav && g._padW === stageParamsSnap.padW && g.obstacles.length === stageParamsSnap.obs, 'same stage params');
  ok(g.terrainPts !== terrain1, 'terrain regenerated');
  g._doCrash('T2'); tick(g, 0.6); tap(g);
  g._doCrash('T3'); tick(g, 0.6); tap(g);
  ok(g.continues === 0 && g.state === 'play', 'continues reach 0');
  g.fuel = 50;
  g._doCrash('LAST');
  ok(g.state === 'gameover', 'crash at 0 continues -> gameover');
  ok(g.totalScore === 777 + 100, 'final crash adds fuel*2 once');
  ok(g.goPhase === 'ranking' && g.newIdx === 0, 'P1.5: qualifying score -> auto-recorded (no name prompt)');
  // render in each state
  g.render(ctx);
  const r = loadRanking(e.storage);
  ok(r.length === 1 && r[0].name === 'PILOT' && r[0].score === 877 && r[0].stage === 4, 'ranking saved with PILOT, score, furthest stage');
  g.render(ctx);
  tap(g);
  ok(e.menuCalls === 0, 'tap during lock after submit ignored');
  tick(g, 0.6); tap(g);
  ok(e.menuCalls === 1, 'tap in ranking -> toMenu');

  // give up
  const o = newGame(); const h = o.g;
  h.stage = 2; h.totalScore = 50;
  h._doCrash('X'); tick(h, 0.6);
  const gr = h._giveUpRect();
  tap(h, gr.x + 5, gr.y + 5);
  ok(h.state === 'gameover' && h.continues === 3 && h.totalScore === 50, 'give up -> gameover (no fuel add)');
  // P1.5: 名前は事前入力（lastName）。10文字に切り詰め・日本語可
  const o2 = newGame();
  o2.e.storage.set('lastName', '  日本語の名前ですよろしくおねがいします  ');
  o2.g.stage = 2; o2.g.totalScore = 50; o2.g._doCrash('X'); tick(o2.g, 0.6);
  const gr2 = o2.g._giveUpRect(); tap(o2.g, gr2.x + 5, gr2.y + 5);
  const rr = loadRanking(o2.e.storage);
  ok(Array.from(rr[0].name).length === 10, 'stored name cut to 10 chars: ' + rr[0].name);
  // score 0 -> directly ranking
  const z = newGame().g; z.totalScore = 0; z.fuel = 0; z.continues = 0; z._doCrash('Z');
  ok(z.state === 'gameover' && z.goPhase === 'ranking', 'non-qualifying -> ranking directly');
  // 11th place does not qualify, tie-high-stage etc.
  const full = newGame(); 
  let list = []; for (let i = 1; i <= 10; i++) list = insertEntry(list, { name: 'n' + i, score: i * 100, stage: 1, date: 'd' + i });
  saveRanking(full.e.storage, list);
  full.g.totalScore = 100; full.g.continues = 0; full.g.fuel = 0; full.g._doCrash('Q');
  ok(full.g.goPhase === 'ranking', 'score equal to 10th does not qualify');
  const full2 = newGame(); saveRanking(full2.e.storage, list);
  full2.g.totalScore = 150; full2.g.continues = 0; full2.g.fuel = 0; full2.g._doCrash('Q');
  ok(full2.g.newIdx >= 0, 'score beating 10th qualifies (auto-recorded)');
  ok(loadRanking(full2.e.storage).length === 10 && full2.g.rankList[full2.g.newIdx].name === 'PILOT', 'inserted, capped, highlighted index valid');
}

// ---------- 5. bonus missions ----------
{
  const { g } = newGame();
  const clearStage = (s) => { // 通常ステージsをクリアして遷移先まで進める
    g.stage = s; g.bonus = null; g._initStage();
    g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0;
    g._doSuccess(0, 0);
    tick(g, 3.0);
  };
  clearStage(1); tap(g);
  ok(g.stage === 2 && !g.bonus, 'stage 1 clear -> stage 2, no bonus');
  clearStage(3);
  ok(g.state === 'cleared', 'landing seq ends in cleared');
  tap(g);
  // P6: s%3===0 のクリア後はミッション選択画面（旧: 自動でボーナス開始）
  ok(g.state === 'bonusselect' && g.stage === 3 && !g.bonus, 'P6: after stage 3: mission selection');
  tick(g, 0.6); tap(g, ...[180, 100 + 122 + 56]);   // 2枚目（★★）
  ok(g.bonus && g.bonus.type === 'ROVER' && g.stage === 3 && g.state === 'play', 'after stage 3: ROVER DOCK (first 2-star), stage stays 3');
  ok(g.pad.moving === true, 'moving pad active');
  // bonus crash does not consume continue
  const c0 = g.continues;
  g._doCrash('BONUSCRASH');
  ok(g.state === 'bonusfailed' && g.continues === c0, 'bonus crash -> bonusfailed, continue kept');
  g.render(ctx);
  tick(g, 0.6); tap(g);
  ok(g.state === 'module', 'P1.5: bonus failed tap -> module choice');
  g._pickModule(0);
  ok(g.stage === 4 && !g.bonus && g.state === 'play', 'bonus failed tap -> module pick -> stage 4');
  clearStage(4); tap(g);
  ok(g.stage === 5 && !g.bonus, 'stage 4 clear: no bonus');
  // stage 6 -> 選択 -> STORM LANDING（旧 PRECISION の対応先: 小パッド・成功で +1 continue）
  clearStage(6); tap(g);
  ok(g.state === 'bonusselect', 'P6: after stage 6: selection');
  tick(g, 0.6); tap(g, 180, 112 + 244 + 56);   // 3枚目（★★★）
  ok(g.bonus && g.bonus.type === 'STORM' && g.stage === 6, 'after stage 6: STORM');
  ok(g._padW === 32 && g.pad.w === 32, 'storm pad width 32');
  g.continues = 2; g.fuel = 40;
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0;
  const t0 = g.totalScore;
  g._doSuccess(0, 0);
  ok(g.continues === 3 && g._bonusGrant, 'STORM success: +1 continue (2->3)');
  ok(g._bonusScore === Math.round((600 + 400) * 2.5) && g.totalScore === t0 + 2500, 'P6: STORM score x2.5: ' + g._bonusScore);
  tick(g, 3);
  g.render(ctx);
  tap(g);
  ok(g.state === 'module', 'bonus clear -> module choice'); g._pickModule(0);
  ok(g.stage === 7 && !g.bonus, 'bonus clear -> stage 7');
  // cap at 3
  g.stage = 6; g.bonus = { type: 'STORM' }; g._initStage(); g.continues = 3;
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 0;
  g._doSuccess(0, 0);
  ok(g.continues === 3 && !g._bonusGrant, 'continue capped at 3');
  for (const k in g.modules) g.modules[k] = 0;   // P1.5: 途中で取得したランダムなモジュールを除く
  // stage 9 -> 選択（★★ は ROVER / CROSSWIND の交互で、3回目は ROVER）-> CALM APPROACH
  clearStage(9); tap(g);
  ok(g.state === 'bonusselect' && g.bonusOffers[1] === 'ROVER', 'P6: stage 9 selection, 2-star alternates back to ROVER');
  tick(g, 0.6); tap(g, 180, 112 + 56);   // 1枚目（★）
  ok(g.bonus && g.bonus.type === 'CALM' && g.fuel === g._fuelMax(), 'after stage 9: CALM APPROACH with a full tank');
  ok(g._body.id === 'terra' && g.stage === 9, 'bonus is on TERRA, stage 9');
  tick(g, 2.5); g.render(ctx); // banner
  clearStage(12); tap(g);
  ok(g.state === 'bonusselect' && g.bonusOffers[1] === 'CROSSWIND', 'P6: stage 12 selection offers CROSSWIND');
  // ボーナスに障害物は無い
  g.stage = 5; g.bonus = { type: 'ROVER' }; g._initStage();
  ok(g.obstacles.length === 0, 'P6: bonus missions have no obstacles');
}

// ---------- 6. ROVER DOCK (moving pad) uses live pad position ----------
{
  const { g } = newGame();
  g.stage = 3; g.bonus = { type: 'ROVER' }; g._initStage();
  g.obstacles = [];
  const { minX, maxX, w } = g.pad;
  const staticCenter = (minX + maxX) / 2 + w / 2; // 初期位置(静的パッド)の中心
  // 先頭フレームでパッドは minX 側へ動く -> staticCenter は live パッドの外
  g.x = staticCenter; g.y = g._terrainYAt(g.x) - 16 - 0.02; g.vx = 0; g.vy = 5; g.angle = 0; g.omega = 0;
  tick(g, 0.05);
  ok(g.state === 'bonusfailed' && g._crashReason === 'MISSED THE PAD', 'old static pad position misses live pad: ' + g.state + '/' + g._crashReason);
  // live pad の上なら成功
  g.continues = 3; g._initStage(); g.obstacles = [];
  tick(g, 2.0); // パッドを動かす
  g.obstacles = [];
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16 - 0.02; g.vx = 0; g.vy = 5; g.angle = 0; g.omega = 0;
  g.update(1 / 60);
  ok(g.state === 'landing', 'landing on live pad position succeeds: ' + g.state);
  // パッドが実際に動いている
  const { g: g2 } = newGame(); g2.stage = 3; g2.bonus = { type: 'ROVER' }; g2._initStage(); g2.obstacles = [];
  const xs = []; for (let i = 0; i < 360; i++) { g2.y = 90; g2.vy = 0; g2.update(1 / 60); xs.push(g2.pad.x); }
  ok(Math.max(...xs) - Math.min(...xs) > 60, 'pad slides back and forth: range ' + (Math.max(...xs) - Math.min(...xs)).toFixed(0));
}

// ---------- 7. landing sequence ----------
{
  ok(landingPhase(0).name === 'hatch' && landingPhase(0.5).name === 'descend' && landingPhase(1.3).name === 'walk' &&
     landingPhase(1.7).name === 'flag' && landingPhase(2.1).name === 'wave' && landingPhase(2.6).name === 'done', 'phase function timeline');
  ok(LANDING_PHASES.length === 5, 'phase data');
  const { g } = newGame();
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 10;
  g._doSuccess(10, 0);
  ok(g.state === 'landing' && g.landingSeq && g.landingSeq.t === 0, 'success -> landing, seq t=0');
  let sawOverlayEarly = false;
  for (let t = 0; t < 2.5; t += 1 / 60) { g.update(1 / 60); g.render(ctx); if (g.state === 'cleared') sawOverlayEarly = true; }
  ok(g.state === 'landing' && !sawOverlayEarly, 'still landing at ~2.5s (clear screen not shown)');
  tick(g, 0.2);
  ok(g.state === 'cleared', 'cleared after ~2.6s');
  // skip
  const s = newGame().g;
  s.x = s.pad.x + s.pad.w / 2; s.y = s._terrainYAt(s.x) - 16; s.vy = 1; s.angle = 0;
  s._doSuccess(0, 0);
  tick(s, 0.7); tap(s);
  ok(s.state === 'cleared', 'tap skips landing');
  const s2 = newGame().g;
  s2.x = s2.pad.x + s2.pad.w / 2; s2.y = s2._terrainYAt(s2.x) - 16; s2.vy = 1; s2.angle = 0;
  s2._doSuccess(0, 0); tick(s2, 0.7); s2.onInput('confirm');
  ok(s2.state === 'cleared', 'confirm skips landing');
  // drawing hooks exist and run
  let threw = null; try { s2._drawAstronaut(ctx, 10, 10, 'wave', 1); s2._drawLandingFlag(ctx, 10, 10, 0.5); } catch (e) { threw = e; }
  ok(!threw, 'astronaut/flag draw methods run');
}

// ---------- 8. multi-zone control ----------
{
  const { e, g } = newGame();
  e.touches = [{ x: 60, y: 600 }, { x: 180, y: 600 }];
  g.update(1 / 60);
  ok(g._thrustRcsL && g._thrustMain && !g._thrustRcsR, 'left + center touches -> RCS L + main');
  e.touches = [{ x: 300, y: 600 }, { x: 180, y: 300 }, { x: 60, y: 10 }];
  g.update(1 / 60);
  ok(g._thrustRcsR && g._thrustMain && !g._thrustRcsL, 'right + center; touch above CONTROL_Y_MIN ignored');
  e.touches = [];
  g.update(1 / 60);
  ok(!g._thrustRcsL && !g._thrustRcsR && !g._thrustMain, 'no touches -> no thrust');
  // 実物の推力: 左+中央同時で燃料が両方ぶん減る
  e.touches = [{ x: 60, y: 600 }, { x: 180, y: 600 }];
  const f0 = g.fuel; g.update(1 / 60);
  ok(Math.abs((f0 - g.fuel) - (5 + 1.5) / 60) < 1e-6, 'fuel burn from both systems');
  // 旧API(pointerのみ)へのフォールバック
  const e2 = makeEngine(); delete e2.touches; e2.pointer = { down: true, x: 300, y: 500 };
  const g2 = new Game(e2); g2.enter(); g2.update(1 / 60);
  ok(g2._thrustRcsR, 'fallback to engine.pointer when touches absent');
}

// ---------- 9. title ----------
{
  const e = makeEngine();
  let started = 0;
  const t = new TitleScene(e, () => started++);
  let list = []; for (let i = 1; i <= 5; i++) list = insertEntry(list, { name: 'n' + i, score: i * 10, stage: i, date: 'd' });
  saveRanking(e.storage, list);
  t.enter();
  t.update(0.1); t.render(ctx);
  ok(t.rank.length === 5, 'title loads ranking');
  const b = t.rankBtn;
  t.onInput('tap', { x: b.x + 5, y: b.y + 5 });
  ok(t.showRank === true && started === 0, 'RANKING target toggles list, does not start');
  t.render(ctx);
  t.onInput('tap', { x: b.x + 5, y: b.y + 5 });
  ok(t.showRank === false, 'RANKING toggles off');
  t.onInput('tap', { x: 10, y: 10 });
  ok(started === 0, 'P1.5: no stored name -> START waits for name entry');
  t._submitName('  ');
  ok(started === 1 && t.name === 'PILOT', 'name submitted -> game starts');
  t.onInput('tap', { x: 10, y: 10 });
  ok(started === 2, 'name stored -> tap starts immediately');
  t.render(ctx);
}

// ---------- 10. fuzz ----------
{
  const { e, g } = newGame();
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const visited = new Set(); let threw = null;
  try {
    for (let f = 0; f < 5000; f++) {
      const n = Math.floor(rnd() * 4); e.touches = [];
      for (let i = 0; i < n; i++) e.touches.push({ x: rnd() * 360, y: rnd() * 640 });
      e.pointer.down = e.touches.length > 0;
      const r = rnd();
      if (r < 0.03) g.onInput('tap', { x: rnd() * 360, y: rnd() * 640 });
      else if (r < 0.05) g.onInput(['left', 'right', 'up', 'down', 'confirm', 'back'][Math.floor(rnd() * 6)]);
      if (rnd() < 0.01) { // 全状態へ到達させるための強制イベント
        const k = rnd();
        if (k < 0.25) { g.bonus = { type: ['CALM', 'ROVER', 'CROSSWIND', 'STORM'][Math.floor(rnd() * 4)] }; g.stage = 1 + Math.floor(rnd() * 12); g._initStage(); }
        else if (k < 0.5) { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vy = 1; g.angle = 0; g._doSuccess(0, 0); }
        else if (k < 0.9) g._doCrash('FUZZ');
        else { g.continues = 0; g._doCrash('FUZZ'); }
      }
      if (g.state === 'module' && rnd() < 0.5) g._pickModule(Math.floor(rnd() * 2) % Math.max(1, g.offers.length));
      if (rnd() < 0.002) g.enter();
      g.update(rnd() < 0.05 ? 0.1 : 1 / 60);
      g.render(ctx);
      visited.add(g.state);
    }
  } catch (err) { threw = err; }
  ok(!threw, '5000 random frames, no exception: ' + (threw && threw.stack));
  ok(['play', 'landing', 'cleared', 'crashed', 'bonusfailed', 'gameover'].every(s => visited.has(s)), 'fuzz visited all states: ' + [...visited].join(','));
}

// ---------- 11. engine input robustness (stubbed window/canvas) ----------
{
  const winH = {}; const docH = {};
  const reg = (store) => (n, f) => { (store[n] = store[n] || []).push(f); };
  globalThis.window = { addEventListener: reg(winH), innerWidth: 360, innerHeight: 640, devicePixelRatio: 1 };
  globalThis.document = { addEventListener: reg(docH), hidden: false };
  const canH = {};
  const canvas = { style: {}, width: 0, height: 0, addEventListener: reg(canH),
    getBoundingClientRect: () => ({ left: 0, top: 0 }), getContext: () => ctx };
  const { Engine } = await import('../02_src/core/engine.js');
  const eng = new Engine(canvas);
  const got = [];
  eng.scene = { isRoot: true, onInput: (a, d) => got.push(a) };
  const fire = (store, n, ev) => (store[n] || []).forEach(f => f(Object.assign({ preventDefault: noop, target: {} }, ev)));
  const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });

  // mouse: window-level release
  fire(canH, 'mousedown', { clientX: 100, clientY: 300 });
  ok(eng.pointer.down && eng.touches.length === 1, 'mousedown on canvas');
  fire(winH, 'mousemove', { clientX: 400, clientY: 700 });
  ok(eng.pointer.x > 300, 'mousemove tracked on window');
  fire(winH, 'mouseup', { clientX: 900, clientY: 900 });
  ok(!eng.pointer.down && eng.touches.length === 0, 'mouseup outside canvas releases');
  ok(!got.includes('tap'), 'far release is a swipe/other, not tap');
  got.length = 0;
  // single tap
  fire(canH, 'touchstart', { changedTouches: [T(1, 50, 300)] });
  fire(canH, 'touchend', { changedTouches: [T(1, 52, 301)] });
  ok(got.join() === 'tap' && !eng.pointer.down, 'single finger tap dispatches tap');
  got.length = 0;
  // multi touch
  fire(canH, 'touchstart', { changedTouches: [T(1, 50, 600)] });
  fire(canH, 'touchstart', { changedTouches: [T(2, 180, 600)] });
  ok(eng.touches.length === 2 && eng.pointer.down, 'two touches tracked');
  fire(canH, 'touchmove', { changedTouches: [T(2, 200, 610)] });
  ok(Math.abs(eng.touches[1].x - 200) < 1e-6, 'touches array is live');
  fire(canH, 'touchend', { changedTouches: [T(1, 50, 600)] });
  ok(eng.touches.length === 1 && eng.pointer.x === 200, 'pointer = first remaining touch');
  fire(canH, 'touchend', { changedTouches: [T(2, 200, 610)] });
  ok(got.length === 0 && eng.touches.length === 0 && !eng.pointer.down, 'multi-finger gesture dispatches nothing');
  // cancel
  fire(canH, 'touchstart', { changedTouches: [T(5, 50, 300)] });
  fire(canH, 'touchcancel', { changedTouches: [T(5, 50, 300)] });
  ok(got.length === 0 && !eng.pointer.down, 'touchcancel releases, no tap');
  // blur / visibility / pagehide
  fire(canH, 'touchstart', { changedTouches: [T(6, 50, 300), T(7, 150, 300)] });
  ok(eng.touches.length === 2, 'changedTouches iterated (2 at once)');
  fire(winH, 'blur', {});
  ok(eng.touches.length === 0 && !eng.pointer.down, 'blur clears all');
  fire(canH, 'touchstart', { changedTouches: [T(8, 50, 300)] });
  globalThis.document.hidden = true; fire(docH, 'visibilitychange', {});
  ok(eng.touches.length === 0, 'visibilitychange(hidden) clears');
  fire(canH, 'touchstart', { changedTouches: [T(9, 50, 300)] });
  fire(winH, 'pagehide', {});
  ok(eng.touches.length === 0, 'pagehide clears');
  // keyboard vs input
  got.length = 0;
  fire(winH, 'keydown', { key: 'Backspace', target: { tagName: 'INPUT' } });
  fire(winH, 'keydown', { key: ' ', target: { tagName: 'TEXTAREA' } });
  fire(winH, 'keydown', { key: 'Enter', target: { tagName: 'DIV', isContentEditable: true } });
  ok(got.length === 0, 'keys in INPUT/TEXTAREA/contenteditable ignored');
  let prevented = false;
  fire(winH, 'keydown', { key: 'Backspace', target: { tagName: 'BODY' }, preventDefault: () => { prevented = true; } });
  ok(got.join() === 'back' && prevented, 'keys elsewhere still handled');
  delete globalThis.window; delete globalThis.document;
}

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
