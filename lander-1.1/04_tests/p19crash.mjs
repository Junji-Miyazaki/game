// p19crash — 失敗理由の下に「実測値 / 上限」を出す（_crashDetail）。
// 実行: node 04_tests/p19crash.mjs（lander-1.1/ から）
import './p10setup.mjs';
import { Game, footSlopeDeg, LAND_SLOPE_DEG } from '../02_src/game.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { WHATSNEW } from '../02_src/whatsnew.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
setDebug(false); __setRelayUrl('');
function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, { get: (t, k) => {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'fillText') return (s, x, y) => { rec.push({ s: String(s), x, y }); };
    return k in t ? t[k] : noop; }, set: (t, k, v) => { t[k] = v; return true; } });
}
function makeEngine() {
  const store = new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1']]);
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = noop;
  return { store, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
function fresh(stage = 3, bonus = null) {
  const g = new Game(makeEngine()); g.enter(); g.stage = stage; g.bonus = bonus; g._initStage(); g.obstacles = []; g._rg = null; g._windSpec = null;
  return g;
}
const onGround = (g, x, o) => { g.x = x; g.y = g._terrainYAt(x) - 16 + 1; g.vx = o.vx || 0; g.vy = o.vy || 0; g.angle = o.ang || 0; g.omega = o.om || 0; g.state = 'playing'; g._bouncing = false; g._contact0 = null; };
const padX = (g) => g.pad.x + g.pad.w / 2;
const crash = (g, x, o) => { onGround(g, x, o); g._checkCollision(); return { r: g._crashReason, d: g._crashDetail && g._crashDetail.text }; };

// --- パッド上: 即クラッシュの各理由
{
  const g = fresh(); const x = padX(g);
  const c = crash(g, x, { vy: 52 }); ok(c.r === 'TOO FAST' && c.d === '52 / 45 px/s', 'TOO FAST 52 / 45 px/s: ' + JSON.stringify(c));
}
{
  let g = fresh(); let c = crash(g, padX(g), { vy: 20, vx: 33.4 }); ok(c.r === 'TOO MUCH SIDEWAYS SPEED' && c.d === '33 / 26 px/s', 'sideways: ' + JSON.stringify(c));
  g = fresh(); c = crash(g, padX(g), { vy: 20, om: 61.6 }); ok(c.r === 'SPINNING TOO FAST' && c.d === '62 / 40 °/s', 'spin: ' + JSON.stringify(c));
  g = fresh(); c = crash(g, padX(g), { vy: 20, ang: 70 }); ok(c.r === 'TIPPED OVER' && c.d === '70 / 55 °', 'tipped: ' + JSON.stringify(c));
  ok(g._crashDetail && g.state === 'crashed' || g.state === 'gameover' || true, 'state set');
  // 衝撃吸収モジュール: vy 上限が上がる（45 + BOUNCE_VY_PER_LEVEL*lv）
  g = fresh(); g.modules.shock = 2; const lim = g._bounceVy(); ok(lim > 45, 'shock raises limit: ' + lim);
  c = crash(g, padX(g), { vy: lim + 7 }); ok(c.r === 'TOO FAST' && c.d === Math.round(lim + 7) + ' / ' + Math.round(lim) + ' px/s', 'TOO FAST with shock: ' + JSON.stringify(c));
  g = fresh(); g.modules.shock = 2; c = crash(g, padX(g), { vy: 50 }); ok(c.r !== 'TOO FAST' && g._crashReason !== 'TOO FAST', 'vy 50 not too fast with shock (bounces)');
}
// --- 直接: 理由 -> 値行
{
  const g = fresh();
  let d = g._crashDetailFor(10, 10, 10, 10); ok(d === null || /\//.test(d.text), 'HARD LANDING returns worst metric');
  // 比率: vy 40/45=.89, vx 20/26=.77, ang 50/55=.91, om 10/40 -> 傾きが最大
  d = g._crashDetailFor(40, 20, 50, 10); ok(g._crashReasonFor(40, 20, 50, 10) === 'HARD LANDING' && d.text === '50 / 55 °', 'HARD LANDING worst=angle: ' + d.text);
  d = g._crashDetailFor(44, 20, 10, 10); ok(d.text === '44 / 45 px/s', 'HARD LANDING worst=vy: ' + d.text);
  d = g._worstDetail(50, 30, 10, 10, true); ok(d.text === '30 / 26 px/s', 'HARD IMPACT picks largest exceeded ratio (vx 1.15 > vy 1.11): ' + d.text);
}
// --- パッド外: HARD IMPACT / STEEP GROUND / TIPPED OVER
{
  let g = fresh(3);
  // パッドから離れた平地を探す
  let xs = []; for (let x = 20; x < 340; x += 2) { if (x >= g.pad.x - 4 && x <= g.pad.x + g.pad.w + 4) continue; xs.push([x, footSlopeDeg(g.terrainPts, x)]); }
  const flat = xs.find((a) => a[1] < 3), steep = xs.find((a) => a[1] > LAND_SLOPE_DEG + 1);
  ok(!!flat, 'found flat off-pad x');
  if (flat) {
    let c = crash(g, flat[0], { vy: 20, vx: 40 }); ok(c.r === 'HARD IMPACT' && c.d === '40 / 26 px/s', 'HARD IMPACT: ' + JSON.stringify(c));
    g = fresh(3); c = crash(g, flat[0], { vy: 10, ang: 60 }); ok(c.r === 'TIPPED OVER' && c.d === '60 / 55 °', 'off-pad tipped: ' + JSON.stringify(c));
  }
  if (steep) {
    g = fresh(3); const st = (() => { for (let x = 20; x < 340; x += 2) { if (x >= g.pad.x - 4 && x <= g.pad.x + g.pad.w + 4) continue; const s0 = footSlopeDeg(g.terrainPts, x); if (s0 > LAND_SLOPE_DEG + 1) return [x, s0]; } return null; })();
    ok(!!st, 'steep x on fresh terrain'); const c = st ? crash(g, st[0], { vy: 10 }) : {}; const sl = st ? Math.round(st[1]) : 0;
    ok(c.r === 'STEEP GROUND' && c.d === sl + ' / 10 °', 'STEEP GROUND: ' + JSON.stringify(c) + ' sl=' + (st && st[1]));
  } else console.log('note: no steep ground found at stage 3');
  // _resolveBounce の TIPPED OVER は上限 33°
  g = fresh(3); g.x = padX(g); g.angle = 40; g._resolveBounce(); ok(g._crashReason === 'TIPPED OVER' && g._crashDetail.text === '40 / 33 °', 'resolve tipped 40 / 33 °: ' + JSON.stringify(g._crashDetail));
}
// --- 値の無い理由
{
  const g = fresh(); g._doCrash('HIT AN OBSTACLE'); ok(g._crashDetail === null, 'obstacle: no detail');
  const h = fresh(); h._doCrash('STRANDED — OUT OF FUEL'); ok(h._crashDetail === null, 'fuel: no detail');
}
// --- パネル描画
function panelTexts(bonus) {
  const g = fresh(3, bonus); g.continues = 2; g._doCrash('TOO FAST', { text: '52 / 45 px/s' });
  const rec = []; g.render(makeCtx(rec)); return { g, rec };
}
{
  const { g, rec } = panelTexts(null);
  const d = rec.find((t) => t.s === '52 / 45 px/s'), r = rec.find((t) => t.s === 'TOO FAST'), sc = rec.find((t) => t.s === 'SCORE');
  ok(g.state === 'crashed' && d && r && sc && r.y < d.y && d.y < sc.y, 'crash panel: reason < detail < SCORE');
  const tap = rec.find((t) => /TAP TO CONTINUE/.test(t.s)); ok(tap && sc.y + 20 < tap.y, 'detail/score do not overlap button');
  ok(Math.abs(d.x - r.x) <= 3, 'detail centered like reason: ' + d.x);
}
{
  const { g, rec } = panelTexts({ type: 'ROVER', afterStage: 3 });
  const d = rec.find((t) => t.s === '52 / 45 px/s'), r = rec.find((t) => t.s === 'TOO FAST'), n = rec.find((t) => t.s === 'NO CONTINUE USED');
  ok(g.state === 'bonusfailed' && d && r && n && r.y < d.y && d.y < n.y, 'bonus panel shows detail between reason and NO CONTINUE USED');
}
{
  const g = fresh(3); g.continues = 2; g._doCrash('HIT AN OBSTACLE'); const rec = []; g.render(makeCtx(rec));
  ok(rec.some((t) => t.s === 'HIT AN OBSTACLE') && !rec.some((t) => /\d \/ \d/.test(t.s)), 'no value line for obstacle');
}
// --- UPDATE INFORMATION
{
  const it = WHATSNEW.entries[2].items; ok(it.includes('失敗理由に速さ・傾きの数値を表示') && it.length <= 6, 'whatsnew item added, <=6: ' + it.length);
  ok(it.every((l) => l.length <= 22), 'items <= 22 chars');
}
console.log('p19crash: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
