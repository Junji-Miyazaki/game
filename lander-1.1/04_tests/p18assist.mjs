// p18assist — beta.4: SIDE THRUST（旧 ATTITUDE ASSIST の置換）/ LANDABLE ラベル / 隕石の尾と衝突コース警告 / 緊急シールド / 序盤の隕石数。
// 実行: node 04_tests/p18assist.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
import { Game, landableLabelIndex, obstacleThreats, landableSpots } from '../02_src/game.js';
import { stageInfo, obstacleCount } from '../02_src/bodies.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { RING_R, POWER_DEFS, POWER_IDS, SIDE_S, SIDE_ACCEL, SLOWMO_FACTOR, newRingState } from '../02_src/rings.js';
import { obstacleTail, drawObstacles, drawControls, OBS_TAIL_MIN, OBS_TAIL_MAX } from '../02_src/art.js';
import { moduleDef } from '../02_src/modules.js';
import { WHATSNEW } from '../02_src/whatsnew.js';
import { APP_VERSION } from '../02_src/version.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('');

// ctx モック。rec があれば テキスト・パス座標・arc・fillStyle を記録
function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient') return () => ({ addColorStop: noop });
      if (k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (rec && k === 'fillText') return (s, x, y) => { rec.texts.push({ s: String(s), x, y }); };
      if (rec && (k === 'moveTo' || k === 'lineTo')) return (x, y) => { rec.pts.push([k, x, y]); };
      if (rec && k === 'arc') return (x, y, r) => { rec.arcs.push({ x, y, r, stroke: t.strokeStyle }); };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { if (rec && k === 'fillStyle') rec.fills.push(String(v)); t[k] = v; return true; },
  });
}
const newRec = () => ({ texts: [], pts: [], arcs: [], fills: [] });
function makeEngine(extra = []) {
  const store = new Map([['hudTipSeen', '1'], ['touchHintSeen', '1'], ...extra]);
  const sfxLog = [];
  const sfx = {};
  for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = (a) => sfxLog.push([n, a]);
  return { store, sfxLog, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
function newGame(extra = []) { const e = makeEngine(extra); const g = new Game(e); g.enter(); return { e, g }; }
const stageGame = (stage, extra) => { const r = newGame(extra); r.g.stage = stage; r.g.bonus = null; r.g._initStage(); return r; };
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const render = (g) => { const rec = newRec(); try { g.render(makeCtx(rec)); } catch (e) { console.log('render threw', e); fail++; } return rec; };
// 真空・風なし・障害物なしの空中（io: stage 6）に機体を静止させる
function air(stage = 6) {
  const r = stageGame(stage); const g = r.g;
  g.obstacles = []; g._rg = null; g._gravity = 0; g._windSpec = null;
  g.x = 180; g.y = 150; g.vx = 0; g.vy = 0; g.angle = 0; g.omega = 0; g.fuel = g._fuelMax();
  return r;
}
const key = (g, k, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.onInput(k); g.update(DT); clock += 16; } };

// ================================================================ 1. SIDE THRUST
{
  ok(POWER_IDS.join() === 'slowmo,radar,side,fuel' && !POWER_DEFS.attitude && POWER_DEFS.side.name === 'SIDE THRUST', 'power kinds: attitude gone, side present');
  ok(SIDE_S === 8 && SIDE_ACCEL === 12 && POWER_DEFS.side.dur === 8 && POWER_DEFS.side.note === 'SIDE BUTTONS MOVE SIDEWAYS · 8 S', 'side constants and banner note');
  const srcs = ['rings.js', 'art.js', 'game.js', 'title.js', 'solarmap.js'].map((f) => fs.readFileSync(new URL('../02_src/' + f, import.meta.url), 'utf8')).join('\n');
  ok(!/'attitude'|_assistT|ASSIST_S|ATTITUDE ASSIST'/.test(srcs.replace(/\/\/[^\n]*/g, '')), 'no attitude-assist identifiers left in source');

  // 方向・加速度・水平保持・燃料（キー入力）
  const { g } = air(); g._sideT = SIDE_S; g.angle = 25;
  const f0 = g.fuel;
  key(g, 'left', 1);
  ok(near(g.vx, -SIDE_ACCEL, 0.6), 'LEFT key moves LEFT at ~12 px/s2 (vx after 1 s = ' + g.vx.toFixed(2) + ')');
  ok(Math.abs(g.angle) < 0.05 && g.omega === 0, 'level lock: tilt 25 -> ' + g.angle.toFixed(3) + ', omega 0 while pressing');
  ok(near(f0 - g.fuel, 1.5, 0.06), 'fuel at the normal RCS rate: ' + (f0 - g.fuel).toFixed(3));
  ok(g.x < 180, 'ship translated left: x=' + g.x.toFixed(1));
  const a = air(); a.g._sideT = SIDE_S; key(a.g, 'right', 1);
  ok(near(a.g.vx, SIDE_ACCEL, 0.6) && a.g.x > 180, 'RIGHT key moves RIGHT: vx=' + a.g.vx.toFixed(2));
  // 左右同時押し: 打ち消し（速度も燃料も変わらない）
  const b = air(); b.g._sideT = SIDE_S; for (let i = 0; i < 60; i++) { b.g.onInput('left'); b.g.onInput('right'); b.g.update(DT); }
  ok(near(b.g.vx, 0, 1e-9) && near(b.g.fuel, b.g._fuelMax(), 1e-9), 'both buttons cancel (no drift, no fuel)');
  // タッチ（画面下の左右ゾーン）も同じ規則
  const t1 = air(); t1.g._sideT = SIDE_S; t1.e.touches = [{ x: 40, y: 700 }]; run(t1.g, 1);
  ok(near(t1.g.vx, -SIDE_ACCEL, 0.6), 'touch on the LEFT button moves left: ' + t1.g.vx.toFixed(2));
  const t2 = air(); t2.g._sideT = SIDE_S; t2.e.touches = [{ x: 330, y: 700 }]; run(t2.g, 1);
  ok(near(t2.g.vx, SIDE_ACCEL, 0.6), 'touch on the RIGHT button moves right: ' + t2.g.vx.toFixed(2));
  // 回転入力は効かない（角速度 0・角度は水平のまま）
  const c = air(); c.g._sideT = SIDE_S; key(c.g, 'left', 2);
  ok(Math.abs(c.g.angle) < 0.01 && c.g.omega === 0, 'rotation inputs no longer rotate during SIDE THRUST');
  // 主推力は不変（水平なので真上へ THRUST_ACCEL=5.2）
  const m1 = air(); m1.g._sideT = SIDE_S; key(m1.g, 'up', 1); const m0 = air(); key(m0.g, 'up', 1);
  ok(near(m1.g.vy, m0.g.vy, 1e-9) && near(m0.g.vy, -5.2, 0.15), 'main thrust unchanged: vy ' + m1.g.vy.toFixed(3) + ' vs ' + m0.g.vy.toFixed(3));
  // 燃料 0 では動かない
  const z = air(); z.g._sideT = SIDE_S; z.g.fuel = 0; key(z.g, 'left', 1);
  ok(z.g.vx === 0, 'no fuel -> no sideways thrust');
  // 持続時間: 8 秒で終了、終了直前の omega は 0、終了後は通常の回転+ドリフトに戻る
  const d = air(); d.g._sideT = SIDE_S; d.g.angle = 30;
  run(d.g, 7.9); ok(d.g._sideT > 0 && d.g._activePower() && d.g._activePower().kind === 'side', 'still active at 7.9 s');
  run(d.g, 0.2); ok(d.g._sideT === 0 && !d.g._activePower(), 'ends at 8 s');
  ok(d.g.omega === 0 && Math.abs(d.g.angle) < 0.001, 'at expiry: omega 0, level (no jerk)');
  key(d.g, 'left', 0.5);
  ok(d.g.vx > 0 && d.g.omega > 0, 'after expiry LEFT is the reaction convention again (vx +, omega +): vx=' + d.g.vx.toFixed(2) + ' omega=' + d.g.omega.toFixed(1));
  // 入力なしの 8 秒間は燃料ゼロ消費
  const e0 = air(); e0.g._sideT = SIDE_S; run(e0.g, 8.2); ok(near(e0.g.fuel, e0.g._fuelMax(), 1e-9), 'idle side thrust burns no fuel');
  // 自動操縦（デバッグ AUTO LAND）は従来の回転制御のまま
  const au = air(); au.g._sideT = SIDE_S; au.g._auto = true; au.g.angle = 20; au.g.omega = 10; au.g.update(DT);
  ok(au.g.omega > 5, 'autopilot is not level-locked (omega kept): ' + au.g.omega.toFixed(2));

  // 特典の輪で取得 → バナー・HUD・ボタンの矢印
  const q = stageGame(6); const g2 = q.g; g2.obstacles = [];
  g2._rg = newRingState({ rings: [{ x: 100, y: 150, r: RING_R, i: 0 }], power: { x: 220, y: 200, r: RING_R, kind: 'side' } });
  g2.vx = 0; g2.vy = 0; g2._gravity = 0; g2.x = 220; g2.y = 190; g2.update(DT); g2.y = 200; g2.update(DT);
  ok(g2._rg.power.got && g2._sideT > 7.9 && g2._pbKind === 'side', 'collecting the power ring starts SIDE THRUST');
  const rec = render(g2);
  ok(rec.texts.some((t) => t.s === 'SIDE BUTTONS MOVE SIDEWAYS · 8 S') && rec.texts.some((t) => t.s === 'SIDE THRUST'), 'banner: name + note');
  ok(rec.texts.some((t) => /^SIDE THRUST 8s$/.test(t.s)), 'HUD: SIDE THRUST with remaining seconds: ' + rec.texts.filter((t) => /SIDE THRUST/.test(t.s)).map((t) => t.s).join('|'));
  run(g2, 3); const rec2 = render(g2);
  ok(rec2.texts.some((t) => /^SIDE THRUST [45]s$/.test(t.s)), 'HUD countdown: ' + rec2.texts.filter((t) => /SIDE THRUST \d/.test(t.s)).map((t) => t.s).join('|'));
  // ボタン矢印: side>0 のとき 左ボタンに ⇦（先端が左）、右ボタンに ⇨
  const rs = newRec(); drawControls(makeCtx(rs), false, false, false, 5, 1);
  const r0 = newRec(); drawControls(makeCtx(r0), false, false, false, 0, 1);
  const left = rs.pts.filter((p) => p[1] === 47), right = rs.pts.filter((p) => p[1] === 313);   // ボタン中心 60 / 300（bx=12/252, bw=96）。左矢印の先端 x=47、右矢印の先端 x=313
  ok(left.length >= 1 && right.length >= 1, 'arrows drawn on LEFT (tip at left) and RIGHT (tip at right) buttons');
  ok(r0.pts.filter((p) => p[1] === 47 || p[1] === 313).length === 0, 'no arrows without SIDE THRUST');
  // 描画: 炎は左右入れ替え（左ボタン=右ノズルから排気）。例外なく描ける
  const fl = air(); fl.g._sideT = SIDE_S; fl.e.touches = [{ x: 40, y: 700 }]; run(fl.g, 0.1);
  ok(fl.g._thrustRcsL && render(fl.g).texts.length > 0, 'renders with side thrust held');
}

// ================================================================ 2. LANDABLE ラベル
{
  const S = [{ x0: 50, x1: 110, y: 440 }];
  // 地面の高度 = y+16 から平地面までの距離。149px は表示、151px は非表示
  ok(landableLabelIndex(S, 80, 440 - 16 - 149) === 0, 'alt 149 over the spot -> label');
  ok(landableLabelIndex(S, 80, 440 - 16 - 151) === -1, 'alt 151 -> no label');
  ok(landableLabelIndex(S, 49, 300) === -1 && landableLabelIndex(S, 111, 300) === -1, 'outside the spot horizontally -> no label');
  ok(landableLabelIndex(S, 50, 300) === 0 && landableLabelIndex(S, 110, 300) === 0, 'spot edges inclusive');
  ok(landableLabelIndex(S, 80, 440 - 16 + 20) === -1, 'below the surface -> no label');
  ok(landableLabelIndex([], 80, 300) === -1 && landableLabelIndex(null, 80, 300) === -1, 'no spots -> -1');

  let anyOverlap = 0, n = 0;
  for (let s = 1; s <= 30; s++) { const { g } = stageGame(s); for (const sp of g._spots) { n++; if (sp.x1 > g.pad.x && sp.x0 < g.pad.x + g.pad.w) anyOverlap++; } }
  ok(n > 30 && anyOverlap === 0, 'labels only for non-pad flats (spots never overlap the pad): ' + n + ' spots');

  const { e, g } = stageGame(4); g.obstacles = []; g._rg = null;
  const sp = g._spots[0]; const cx = (sp.x0 + sp.x1) / 2;
  const place = (alt) => { g.x = cx; g.y = sp.y - 16 - alt; g.vx = 0; g.vy = 0; g._gravity = 0; g.angle = 0; g.omega = 0; };
  const sfx0 = e.sfxLog.length;
  place(100); run(g, 0.05); const mid = g._lblA[0];
  ok(mid > 0 && mid < 1, 'label fades in (not instant): ' + mid.toFixed(2));
  place(100); run(g, 0.4);
  ok(g._lblA[0] === 1, 'fully visible after 0.4 s');
  const rec = render(g); const lt = rec.texts.find((t) => t.s === 'LANDABLE');
  ok(lt && near(lt.x, cx, 40) && lt.y < sp.y - 10 && lt.y > sp.y - 40, 'LANDABLE drawn just above the flat spot: y=' + (lt && lt.y) + ' (spot ' + sp.y + ')');
  place(100); g.update(DT); ok(g._groundIndicator() && g._groundIndicator().kind, 'existing ground marker logic untouched');
  place(300); run(g, 0.05); ok(g._lblA[0] < 1, 'fading out when leaving');
  place(300); run(g, 0.4); ok(g._lblA[0] === 0 && !render(g).texts.some((t) => t.s === 'LANDABLE'), 'hidden at alt 300');
  // パッドの真上では出さない
  g.x = g.pad.x + g.pad.w / 2; g.y = g.pad.y - 16 - 60; g.vx = 0; g.vy = 0; run(g, 0.5);
  ok(!render(g).texts.some((t) => t.s === 'LANDABLE') && g._lblA.every((v) => v === 0), 'no label over the pad');
  ok(e.sfxLog.length === sfx0, 'no sound for the label');
}

// ================================================================ 3a. 隕石の尾
{
  const mk = (vx, extra = {}) => ({ x: 180, y: 250, vx, r: 12, style: 'rock', ...extra });
  const L = (vx, m) => obstacleTail(mk(vx), m).len;
  ok(L(10) === OBS_TAIL_MIN && L(0.5) === OBS_TAIL_MIN, 'slow -> clamp to min 6');
  ok(near(L(40), 14, 1e-9) && near(L(80), 28, 1e-9) && near(L(80) / L(40), 2, 1e-9), 'length ~ speed x 0.35 s (40 -> 14, 80 -> 28)');
  ok(L(200) === OBS_TAIL_MAX && L(-300) === OBS_TAIL_MAX, 'fast -> clamp to max 40');
  ok(near(L(100, SLOWMO_FACTOR), 8.75, 1e-9), 'SLOW-MO shortens the tail (100 px/s x 0.25 -> 8.75)');
  const tr = obstacleTail(mk(50)), tl = obstacleTail(mk(-50));
  ok(tr.dir === 1 && tr.x1 < tr.x0 && tr.x0 < 180, 'moving right: tail trails to the LEFT');
  ok(tl.dir === -1 && tl.x1 > tl.x0 && tl.x0 > 180, 'moving left: tail trails to the RIGHT');
  const ext = (ob, sm) => { const rc = newRec(); drawObstacles(makeCtx(rc), [ob], 0, { visual: { ground: '#4a4d58' } }, { speedMul: sm }); return rc; };
  for (const style of ['rock', 'ice', 'lava']) {
    const ob = mk(60, { style }); const rc = ext(ob);
    const wx = rc.pts.map((p) => p[1]).filter((x) => x > 60);   // 尾はワールド座標（本体は translate 後のローカル座標）
    const minX = Math.min(...wx), maxX = Math.max(...wx);
    const t = obstacleTail(ob);
    ok(near(minX, t.x1, 0.01) && maxX <= t.x0 + 1e-6, style + ': tail drawn behind (min x ' + minX.toFixed(1) + ' = tail tip ' + t.x1.toFixed(1) + ')');
    const alphas = rc.fills.filter((f) => /^rgba\(/.test(f)).map((f) => parseFloat(f.split(',').pop()));
    ok(alphas.some((a) => a > 0 && a <= 0.2) , style + ': subtle tail alpha');
  }
  const rl = ext(mk(-60)); ok(Math.max(...rl.pts.map((p) => p[1])) > 180 + 12 + 5 - 0, 'leftward obstacle: tail extends to the right');
  const rsp = ext(mk(60, { spent: true })); ok(rsp.pts.every((p) => p[1] < 60), 'spent obstacle has no tail');
}

// ================================================================ 3b. 衝突コース予測
{
  const W = 360, G = 0.25;
  const ob = (o) => ({ r: 12, style: 'rock', ...o });
  const th = (ship, obs, g = G, slowT = 0) => obstacleThreats({ vx: 0, vy: 0, ...ship }, obs, g, W, slowT, SLOWMO_FACTOR);
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 180, y: 150, vx: 0 })])[0] === true, 'descending onto a static obstacle -> threat');
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 300, y: 150, vx: 0 })])[0] === false, 'obstacle far to the side -> no threat');
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 100, y: 130, vx: 80 })])[0] === true, 'moving obstacle crossing the descent path -> threat');
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 115, y: 130, vx: 20 })])[0] === false, 'slow obstacle that stays clear -> no threat');
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 100, y: 400, vx: 80 })])[0] === false, 'obstacle far below the 1.5 s reach -> no threat');
  // 壁の反射: 右壁で跳ね返って機体に来る
  const bounce = th({ x: 250, y: 100, vy: 40 }, [ob({ x: 330, y: 130, vx: 100 })]);
  ok(bounce[0] === true, 'bounce off the right wall brings it into the ship -> threat');
  ok(th({ x: 250, y: 100, vy: 40 }, [ob({ x: 330, y: 130, vx: -100 })])[0] === true, 'left-moving version also threatens');
  ok(th({ x: 100, y: 100, vy: 40 }, [ob({ x: 30, y: 130, vx: -100 })])[0] === true, 'bounce off the LEFT wall -> threat');
  ok(th({ x: 100, y: 100, vy: 40 }, [ob({ x: 330, y: 130, vx: 100 })])[0] === false, 'bounce case that is far from the ship -> no threat');
  // SLOW-MO（0.25 倍）: 通常なら当たるが、スローなら間に合わない／途中で切れれば当たる
  const base = { x: 180, y: 100 }, o1 = [ob({ x: 100, y: 100, vx: 100 })];
  ok(th(base, o1, 0, 0)[0] === true, 'normal speed: hit');
  ok(th(base, o1, 0, 5)[0] === false, 'SLOW-MO active for the whole window: no threat (obstacle at 25%)');
  ok(th(base, o1, 0, 0.5)[0] === true, 'SLOW-MO expiring after 0.5 s: threat again');
  // 現在すでに近すぎる / 余白 6px
  ok(th({ x: 180, y: 100 }, [ob({ x: 180 + 12 + 14 + 5, y: 100, vx: 0 })], 0)[0] === true, 'clearance 5 px (< 6 margin) -> threat');
  ok(th({ x: 180, y: 100 }, [ob({ x: 180 + 12 + 14 + 7, y: 100, vx: 0 })], 0)[0] === false, 'clearance 7 px (> 6 margin) -> no threat');
  // サンプル間のすり抜け（高速で細い障害物を横切る）
  ok(th({ x: 20, y: 200, vx: 300 }, [ob({ x: 65, y: 200, vx: 0, r: 4 })], 0)[0] === true, 'fast pass between samples is still caught (segment test)');
  // 無効化済み(spent)は対象外。複数のうち危険なものだけ true
  ok(th({ x: 180, y: 100, vy: 40 }, [ob({ x: 180, y: 150, vx: 0, spent: true })])[0] === false, 'spent obstacle never flagged');
  const multi = th({ x: 180, y: 100, vy: 40 }, [ob({ x: 180, y: 150, vx: 0 }), ob({ x: 320, y: 150, vx: 0 }), ob({ x: 40, y: 380, vx: 10 })]);
  ok(multi.join() === 'true,false,false', 'only the dangerous obstacle is flagged: ' + multi.join());
  ok(th({ x: 180, y: 100 }, []).length === 0, 'no obstacles -> empty');
  // 軽さ
  const many = Array.from({ length: 11 }, (_, i) => ob({ x: 30 + i * 28, y: 150 + i * 20, vx: 30 + i * 5 }));
  const t0 = performance.now ? Date.now() : 0; for (let i = 0; i < 5000; i++) th({ x: 180, y: 100, vy: 30 }, many); const dtm = Date.now() - t0;
  ok(dtm < 1500, '5000 predictions x 11 obstacles in ' + dtm + ' ms (cheap)');

  // ゲーム統合: update が _threats を更新し、描画は危険な障害物だけ赤い輪郭
  const { g } = stageGame(6); g._rg = null; g._gravity = G; g._windSpec = null;
  g.x = 180; g.y = 100; g.vx = 0; g.vy = 40;
  g.obstacles = [{ x: 180, y: 150, vx: 0, r: 12, style: 'rock' }, { x: 320, y: 150, vx: 0, r: 12, style: 'rock' }];
  g.update(DT / 100);
  ok(g._threats.join() === 'true,false', 'game: _threats = ' + g._threats.join());
  const rc = render(g);
  const ringArc = (o) => rc.arcs.filter((a) => near(a.x, 0, 1e9) && near(a.r, o.r + 2.5, 1e-9)).length;
  ok(ringArc(g.obstacles[0]) >= 1, 'red outline arc drawn for the threatening obstacle');
  const g2 = stageGame(6).g; g2._rg = null; g2._gravity = G; g2.x = 180; g2.y = 100; g2.vx = 0; g2.vy = 40;
  g2.obstacles = [{ x: 320, y: 150, vx: 0, r: 12, style: 'rock' }]; g2.update(DT / 100);
  ok(render(g2).arcs.filter((a) => near(a.r, 14.5, 1e-9)).length === 0, 'no outline when not on a collision course');
  // SLOW-MO を反映
  const g3 = stageGame(6).g; g3._rg = null; g3._gravity = 0; g3._windSpec = null; g3.x = 180; g3.y = 100; g3.vx = 0; g3.vy = 0;
  g3.obstacles = [{ x: 100, y: 100, vx: 100, r: 12, style: 'rock' }]; g3._slowT = 0; g3.update(DT / 100);
  const normal = g3._threats[0]; g3.obstacles[0].x = 100; g3.vx = 0; g3.vy = 0; g3.x = 180; g3.y = 100; g3._slowT = 6; g3.update(DT / 100);
  ok(normal === true && g3._threats[0] === false, 'game prediction respects SLOW-MO');
}

// ================================================================ 4. 緊急シールド
{
  const { e, g } = stageGame(4);           // stage 4: 隕石あり
  const keys0 = [...e.store.keys()].sort().join();
  ok(g._shieldCharges === 0 && !g._emerg, 'baseline: no shield');
  g._doCrash('TIPPED OVER'); ok((e._obsCrash || {})[4] === undefined, 'other crash reasons do not count');
  g._continue();
  g._doCrash('HIT AN OBSTACLE'); ok(e._obsCrash[4] === 1, '1st obstacle crash counted');
  g._continue(); ok(g._shieldCharges === 0 && !g._emerg && g._esT === 0, 'after 1 crash: still no shield');
  g._doCrash('HIT AN OBSTACLE'); ok(e._obsCrash[4] === 2, '2nd obstacle crash counted');
  g._continue();
  ok(g._emerg && g._shieldCharges === 1 && g._shieldReady && g._esT > 2, 'after 2 crashes: next attempt starts with +1 shield + banner timer');
  ok(render(g).texts.some((t) => t.s === 'EMERGENCY SHIELD'), 'banner EMERGENCY SHIELD shown');
  run(g, 3); ok(g._esT === 0 && !render(g).texts.some((t) => t.s === 'EMERGENCY SHIELD'), 'banner goes away after ~2.6 s');
  const g1 = stageGame(4, []); // 新しい Game だが別エンジン → カウンタなし
  ok(g1.g._shieldCharges === 0, 'counter is engine-level (a different engine has none)');
  // 吸収の確認（同じエンジンで再開）
  g._continue(); g.obstacles = [{ x: 180, y: 200, vx: 0, r: 12, style: 'rock' }]; g.x = 180; g.y = 200; g.vx = 0; g.vy = 0; g._gravity = 0; g.update(DT);
  ok(g.state === 'play' && g._shieldCharges === 0 && g.obstacles[0].spent, 'emergency shield absorbed one hit');
  g.obstacles.push({ x: 180, y: 200, vx: 0, r: 12, style: 'rock' }); g.update(DT);
  ok(g.state === 'crashed' || g.state === 'gameover', 'a second hit still crashes');
  // 3 回目の挑戦以降もクリアまで付く（カウンタは 3 に増える）
  ok(e._obsCrash[4] >= 3, 'counter keeps counting: ' + e._obsCrash[4]);
  g._continue(); ok(g._emerg && g._shieldCharges === 1, 'still protected while the stage is not cleared');
  // 新しいラン（同じエンジン、同じステージから開始）でも引き継ぐ
  const g2 = new Game(e); g2.enter(); g2.stage = 4; g2.bonus = null; g2._initStage();
  ok(g2._emerg && g2._shieldCharges === 1, 'a new run started at that stage keeps the emergency shield (same session)');
  // 別ステージには付かない
  g2.stage = 5; g2._initStage(); ok(!g2._emerg && g2._shieldCharges === 0, 'other stages unaffected');
  // クリアでリセット
  g2.stage = 4; g2._initStage(); g2.x = g2.pad.x + g2.pad.w / 2; g2.y = g2._terrainYAt(g2.x) - 16; g2.vx = 0; g2.vy = 1; g2.angle = 0; g2.omega = 0; g2._doSuccess(0, 0);
  ok(e._obsCrash[4] === undefined, 'counter reset when the stage is cleared');
  g2.stage = 4; g2._initStage(); ok(!g2._emerg && g2._shieldCharges === 0, 'next attempt after clearing: no shield');
  // モジュールと重なる（最大 max+1）
  for (const lv of [1, moduleDef('shield').max]) {
    const r = stageGame(6); r.e._obsCrash = { 6: 2 }; r.g.modules.shield = lv; r.g._initStage();
    ok(r.g._shieldCharges === lv + 1, 'stacks with module level ' + lv + ' -> ' + r.g._shieldCharges + (lv === moduleDef('shield').max ? ' (= max+1)' : ''));
  }
  // ボーナスは対象外（カウントしない・付けない）
  const bn = newGame(); bn.g.stage = 3; bn.g.bonus = { type: 'CALM' }; bn.g._initStage();
  bn.g._doCrash('HIT AN OBSTACLE'); ok(!bn.e._obsCrash || bn.e._obsCrash[3] === undefined, 'bonus crash is not counted');
  bn.e._obsCrash = { 3: 5 }; bn.g._continue ? 0 : 0; bn.g.bonus = { type: 'CALM' }; bn.g._initStage();
  ok(!bn.g._emerg && bn.g._shieldCharges === 0, 'bonus stages never get an emergency shield');
  // セッションのみ: 保存領域は変わらない
  const added = [...e.store.keys()].filter((k) => !keys0.split(',').includes(k)); ok(!added.some((k) => /obs|emerg|shield|crash/i.test(k)) && !JSON.stringify([...e.store.values()]).match(/_obsCrash|emerg/i), 'emergency counter never persisted (new keys: ' + added.join('|') + ')');
}

// ================================================================ 5. 序盤の隕石数
{
  const want = [0, 1, 2, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 7, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 9, 9, 6, 6];
  const got = Array.from({ length: 30 }, (_, i) => obstacleCount(i + 1));
  ok(got.join() === want.join(), 'obstacleCount stages 1..30: ' + got.join());
  // 2周目以降は従来式のまま
  const old = (s) => { const il = (s - 1) % 14; return s <= 1 ? 0 : Math.min(2 + Math.floor(il / 2), 7) + 2 * stageInfo(s).loop; };
  let same = true; for (let s = 15; s <= 70; s++) if (obstacleCount(s) !== old(s)) same = false;
  ok(same, 'loops >= 1 identical to the old formula (stages 15..70)');
  let ge = true; for (let s = 1; s <= 14; s++) { if (obstacleCount(s) > old(s)) ge = false; if (s >= 5 && obstacleCount(s) !== old(s)) ge = false; }
  ok(ge && obstacleCount(2) === 1 && obstacleCount(5) === 4, 'loop 0: ramp only below the old value, identical from stage 5');
  ok(stageGame(3).g.obstacles.length === 2 && stageGame(2).g.obstacles.length === 1 && stageGame(1).g.obstacles.length === 0, 'game builds the new counts (s1 0, s2 1, s3 2)');
}

// ================================================================ 6. 版・UPDATE INFORMATION
{
  ok(APP_VERSION === '1.1.0-beta.4', 'APP_VERSION 1.1.0-beta.4');
  const E = WHATSNEW.entries;
  ok(E[0].version === '1.1.0-beta.4' && E[0].date === '2026.10.26' && WHATSNEW.version === '1.1.0-beta.4', 'newest entry = beta.4 (2026.10.26)');
  ok(E[0].items.join('|') === ['SIDE THRUST：左右で真横に移動', '平地の上に LANDABLE を表示', '隕石に進行方向の尾と危険表示', '隕石で2回墜落すると緊急シールド', '序盤の隕石を少しずつ増やす', '失敗理由に速さ・傾きの数値を表示'].join('|'), 'beta.4 items as specified');
  ok(E.every((en) => en.items.every((l) => l.length <= 22)), 'every item <= 22 chars: ' + E[0].items.map((l) => l.length).join(','));
  ok(E.map((en) => en.version).join() === '1.1.0-beta.4,1.1.0-beta.3,1.1.0-beta.2,1.1.0-beta', 'older entries kept');
}

console.log('p18assist: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
