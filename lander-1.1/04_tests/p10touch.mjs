// L1 「どこでも接地」+ 着陸グレード + クリア集計 + WHAT'S NEW。実行: node 04_tests/p10touch.mjs（lander/ から）
import './p10setup.mjs';
import { Game, buildTerrain, landableSpots, flatRuns, footSlopeDeg, terrainYOn, gradeFor, gradeRank, GRADE_TABLE, GRADE_ORDER, LAND_SLOPE_DEG, FLAT_MIN_W } from '../02_src/game.js';
import { BootScene } from '../02_src/title.js';
import { WHATSNEW } from '../02_src/whatsnew.js';
import { BODIES, TERRA, padWidth, BONUS_MISSIONS } from '../02_src/bodies.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { GROUNDED_BANNER, TOUCH_HINT, TOUCH_HINT_JA, groundShadowColor } from '../02_src/art.js';
import { P } from '../02_src/core/palette.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const lcg = (s) => () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
const realRandom = Math.random;
const seeded = (seed) => { Math.random = lcg(seed); };
const unseed = () => { Math.random = realRandom; };
setDebug(false); __setRelayUrl('');

// ---- 描画記録つき ctx（txt の位置・translate を拾う）----
function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (rec && k === 'fillText') return (s, x, y) => rec.texts.push({ s: String(s), x, y, font: t.font, ls: t.letterSpacing, align: t.textAlign });
      if (rec && k === 'translate') return (x, y) => rec.tr.push([x, y]);
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const sizeOf = (font) => { const m = /(\d+(?:\.\d+)?)px/.exec(font || ''); return m ? +m[1] : 10; };
// txt の外接ボックス（概算: 幅 = 文字数*(size*0.58 + 字間)、y は上端）
function boxOf(t) {
  const sz = sizeOf(t.font), sp = parseFloat(t.ls) || 0;
  const w = t.s.length * (sz * 0.58 + sp);
  const x0 = t.align === 'center' ? t.x - w / 2 : t.align === 'right' ? t.x - w : t.x;
  return { x0, x1: x0 + w, y0: t.y, y1: t.y + sz, s: t.s };
}
const overlap = (a, b) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function makeMusic(log) {
  const sfx = {};
  for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick']) sfx[n] = (a) => log.push(n + (a === undefined ? '' : ':' + (typeof a === 'number' ? +a.toFixed(2) : a)));
  return { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx };
}
function makeEngine(extra = []) {
  const store = new Map([['hudTipSeen', '1'], ['touchHintSeen', '1'], ['lang', 'ja'], ...extra]);
  const sfxLog = [];
  return { store, sfxLog, music: makeMusic(sfxLog), audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu() { this.menuCalls = (this.menuCalls || 0) + 1; }, menuCalls: 0, pointer: { down: false, x: 0, y: 0 }, touches: [] };
}
const prof = (name) => [['profiles', JSON.stringify([{ name, key: 'a'.repeat(64) }])], ['activeProfile', '0'], ['lastName', name]];
function newGame(extra = []) { const e = makeEngine(extra); const g = new Game(e); g.enter(); g.obstacles = []; return { e, g }; }
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const renderOK = (g, rec) => { try { g.render(makeCtx(rec)); return true; } catch (e) { console.log('render threw', e); return false; } };
const tapAt = (g, x = 180, y = 300) => { clock += 10; g.onInput('tap', { x, y, t0: clock - 50 }); };

// 決定的な地形: 全面フラット(y=500)。パッドは x 280..330。spots 再計算つき
function flatWorld(g, pts) {
  const segW = 20; const P0 = [];
  for (let i = 0; i <= 18; i++) P0.push({ x: i * segW, y: i === 12 ? 470 : 500 });   // x 0..220 は広い平地、x 240 に尾根、x 260.. がパッドの平地
  g.terrainPts = pts || P0;
  g.pad = { x: 280, y: 500, w: 50, moving: false };
  g._spots = landableSpots(g.terrainPts, g.pad);
  g.guidePts = [{ x: g.x, y: g.y }, { x: 305, y: 500 }];
}
const put = (g, x, vy = 5, vx = 0, angle = 0, omega = 0) => { g.x = x; g.y = terrainYOn(g.terrainPts, x) - 16 - 0.05; g.vx = vx; g.vy = vy; g.angle = angle; g.omega = omega; g.state = 'play'; };
const touch = (g, x, vy, vx = 0, angle = 0, omega = 0) => { put(g, x, vy, vx, angle, omega); run(g, 0.05); };

// ---------- 1. 傾斜・平地の検出 ----------
{
  const flat = [{ x: 0, y: 480 }, { x: 360, y: 480 }];
  ok(footSlopeDeg(flat, 100) === 0, 'flat ground slope 0');
  const t20 = Math.tan(20 * Math.PI / 180), t8 = Math.tan(8 * Math.PI / 180), t12 = Math.tan(12 * Math.PI / 180);
  const ramp = (t) => [{ x: 0, y: 400 }, { x: 360, y: 400 + 360 * t }];
  ok(Math.abs(footSlopeDeg(ramp(t20), 180) - 20) < 0.01, '20deg ramp measured');
  ok(footSlopeDeg(ramp(t8), 180) <= LAND_SLOPE_DEG, '8deg ramp landable');
  ok(footSlopeDeg(ramp(t12), 180) > LAND_SLOPE_DEG, '12deg ramp not landable');
  ok(Math.abs(footSlopeDeg(ramp(Math.tan(10 * Math.PI / 180)), 180) - 10) < 1e-6, 'exactly 10deg is the limit');
  // 脚が段差をまたぐ: 左脚は台地、右脚は崖下
  const step = [{ x: 0, y: 480 }, { x: 100, y: 480 }, { x: 120, y: 520 }, { x: 360, y: 520 }];
  ok(footSlopeDeg(step, 40) === 0 && footSlopeDeg(step, 200) === 0, 'both feet on the same level: flat');
  ok(footSlopeDeg(step, 100) > LAND_SLOPE_DEG, 'feet straddling a cliff edge: steep');
  ok(footSlopeDeg(step, 112) > LAND_SLOPE_DEG, 'feet straddling (center on the ramp): steep');
  ok(footSlopeDeg(flat, 14) === 0 && footSlopeDeg(flat, 346) === 0, 'edge x clamps inside the world');
  // 平地区間
  const runs = flatRuns(step);
  ok(runs.length === 2 && runs[0].x1 === 100 && runs[1].x0 === 120, 'flatRuns splits at the cliff: ' + JSON.stringify(runs));
  ok(flatRuns([{ x: 0, y: 480 }, { x: 40, y: 480 }, { x: 60, y: 520 }]).length === 0, 'run shorter than 44px is not a flat spot');
}

// ---------- 2. 地形の保証（2000ステージ）----------
{
  seeded(20261026);
  let bad = 0, far = 0, n = 0, minCenterGap = 1e9, worstBottom = 0, padClear = 0;
  const check = (padW, opts, tag) => {
    const { pts, pad } = buildTerrain(padW, opts);
    n++;
    const spots = landableSpots(pts, pad);
    const z0 = pad.moving ? pad.minX : pad.x, z1 = pad.moving ? pad.maxX + pad.w : pad.x + pad.w;
    const good = spots.filter(s => s.x1 - s.x0 >= FLAT_MIN_W && (s.x1 <= z0 || s.x0 >= z1));
    // 独立計算: 各スポットの全点がコントロールバー(560)の十分上、パッド面も
    const above = spots.every(s => pts.filter(p => p.x >= s.x0 && p.x <= s.x1).every(p => p.y <= 520));
    if (good.length < 2 || !above) { bad++; if (bad < 4) console.log('  bad terrain', tag, padW, JSON.stringify(opts), good.length, above); }
    if (good.length >= 2) {
      const c = good.map(s => (s.x0 + s.x1) / 2).sort((a, b) => a - b);
      minCenterGap = Math.min(minCenterGap, c[1] - c[0]);
      if (c[1] - c[0] >= 100) far++;
    }
    worstBottom = Math.max(worstBottom, pad.y + 10);
    if (pad.y + 10 <= 560 - 12) padClear++;
  };
  for (let s = 1; s <= 1000; s++) check(padWidth(s), null, 'stage' + s);
  const ms = Object.values(BONUS_MISSIONS);
  for (let k = 0; k < 1000; k++) { const m = ms[k % ms.length]; check(m.padW, m.moving ? { plateau: m.plateauSegs, period: m.padPeriod } : null, m.id); }
  unseed();
  ok(n === 2000, '2000 stages generated');
  ok(bad === 0, 'every stage (normal + all 4 bonus missions) has >= 2 flat spots >= 44px, away from the pad, below y 520: bad=' + bad);
  ok(minCenterGap >= 80, 'the two spots are distinct and spread (min centre gap ' + minCenterGap + ')');
  ok(far / n > 0.7, 'most stages spread the spots >= 100px apart: ' + (far / n).toFixed(3));
  ok(padClear === n && worstBottom <= 525, 'pad stays above the control bar (worst bottom ' + worstBottom + ')');
}

// ---------- 3. パッド外の安全な接地 -> grounded ----------
{
  const { g } = newGame();
  flatWorld(g); const sc = g.totalScore;
  touch(g, 100, 5);
  ok(g.state === 'grounded', 'off-pad safe touchdown -> grounded: ' + g.state);
  ok(g.totalScore === sc && g._stageScore === 0 && g.landingSeq === null, 'no score, no landing sequence');
  ok(g.vx === 0 && g.vy === 0 && Math.abs(g.y - (500 - 16)) < 1e-6, 'craft rests on the ground');
  ok(renderOK(g), 'render grounded');
  // バナー文言
  const rec = { texts: [], tr: [] }; renderOK(g, rec);
  run(g, 0.4); const rec2 = { texts: [], tr: [] }; renderOK(g, rec2);
  const joined = rec2.texts.map(t => t.s).join(' | ');
  ok(GROUNDED_BANNER === 'TOUCHDOWN — NO SCORE · THRUST TO LIFT OFF', 'banner constant text');
  ok(joined.includes('TOUCHDOWN — NO SCORE') && joined.includes('THRUST TO LIFT OFF'), 'banner shown while grounded');
  // 燃料は減らない（金星の受動消費も止まる）
  g._body = BODIES[5]; const f0 = g.fuel; run(g, 2);
  ok(g.state === 'grounded' && g.fuel === f0, 'no fuel drain while grounded (even on VENUS): ' + g.fuel + ' vs ' + f0);
  // 推力で離陸
  g._keys.up = true; run(g, 0.02);   // 接地直後の保護時間(0.2s)は過ぎている
  ok(g.state === 'play' && g.vy < 0 && g.y < 500 - 16, 'thrust lifts off: ' + g.state + ' vy=' + g.vy);
  const fuelAt = g.fuel; for (let i = 0; i < 30; i++) { g._keys.up = true; g.update(DT); }
  ok(g.state === 'play' && g.y < 500 - 16 - 3 && g.fuel < fuelAt, 'keeps climbing and uses fuel again');
  // 離陸後にパッドへ着陸 -> 通常のクリア
  g._body = BODIES[0]; g.x = 305; g.y = 500 - 16 - 0.05; g.vy = 3; g.vx = 0; g.angle = 0; g.omega = 0; g.state = 'play'; run(g, 0.05);
  ok(g.state === 'landing' && g.totalScore > sc, 'then landing on the pad scores normally');
}
{   // 押しっぱなしで接地しても即座に跳ねない
  const { g } = newGame(); flatWorld(g);
  touch(g, 100, 5); g._keys.up = true; g.update(DT);
  ok(g.state === 'grounded', 'thrust held at touchdown does not instantly bounce');
  run(g, 0.3); g._keys.up = true; g.update(DT);
  ok(g.state === 'play', 'held thrust lifts off after the settle time');
}
{   // ポインタ(画面の中央ゾーン)でも離陸
  const { e, g } = newGame(); flatWorld(g);
  touch(g, 100, 5); run(g, 0.3);
  e.touches = [{ x: 180, y: 600 }]; run(g, 0.05);
  ok(g.state === 'play' && g.vy < 0, 'thrust zone pointer lifts off'); e.touches = [];
}
{   // マージナル速度 (SAFE超え〜BOUNCE以内) はパッド外でも跳ねてから落ち着く
  const { g } = newGame(); flatWorld(g);
  put(g, 100, 30); let bounced = false;
  for (let i = 0; i < 60 * 6 && g.state === 'play'; i++) { g.update(DT); if (g._bouncing) bounced = true; }
  ok(bounced && g.state === 'grounded', 'marginal touchdown bounces, then settles to grounded: ' + g.state);
  const { g: g2 } = newGame(); flatWorld(g2);
  put(g2, 100, 30); for (let i = 0; i < 60 * 6 && g2.state === 'play'; i++) g2.update(DT);
  ok(g2._contact0 === null, 'contact record cleared after settling');
}

// ---------- 4. 失敗の理由 ----------
{
  const reasons = [];
  const t = (label, setup, want) => {
    const { g } = newGame(); flatWorld(g, setup.pts); setup.go(g); run(g, setup.sec || 0.06);
    ok(g.state === 'crashed' && g._crashReason === want, label + ' -> ' + want + ' (got ' + g.state + '/' + g._crashReason + ')');
    reasons.push(g._crashReason);
    ok(renderOK(g), 'render crashed: ' + want);
  };
  t('hard impact (vy)', { go: (g) => put(g, 100, 70) }, 'HARD IMPACT');
  t('hard impact (vx)', { go: (g) => put(g, 100, 5, 40) }, 'HARD IMPACT');
  t('hard impact (spin)', { go: (g) => put(g, 100, 5, 0, 0, 60) }, 'HARD IMPACT');
  t('tipped over', { go: (g) => put(g, 100, 5, 0, 70) }, 'TIPPED OVER');
  const steepPts = []; for (let i = 0; i <= 18; i++) steepPts.push({ x: i * 20, y: 420 + i * 6.5 });   // 約18度
  t('steep ground', { pts: steepPts, go: (g) => { g.pad = { x: 300, y: 0, w: 1, moving: false }; put(g, 120, 5); } }, 'STEEP GROUND');
  t('obstacle', { go: (g) => { put(g, 100, 0); g.y = 300; g.vy = 0; g.obstacles = [{ x: 100, y: 300, vx: 0, r: 14 }]; }, sec: 0.03 }, 'HIT AN OBSTACLE');
  ok(new Set(reasons).size === 4, 'distinct reasons: ' + [...new Set(reasons)].join(','));
  // 急斜面に低速で触れても失敗（SAFE範囲でも）
  const { g } = newGame(); flatWorld(g, steepPts); g.pad = { x: 300, y: 0, w: 1, moving: false }; put(g, 200, 1); run(g, 0.2);
  ok(g.state === 'crashed' && g._crashReason === 'STEEP GROUND', 'slow touch on a steep slope still fails');
  // 接地中に障害物が当たる
  const { g: g2 } = newGame(); flatWorld(g2); touch(g2, 100, 5);
  g2.obstacles = [{ x: 100, y: 484, vx: 0, r: 10 }]; run(g2, 0.05);
  ok(g2.state === 'crashed' && g2._crashReason === 'HIT AN OBSTACLE', 'obstacle hits a grounded craft');
  // 残機なし -> ゲームオーバー経由
  const { g: g3 } = newGame(); flatWorld(g3); g3.continues = 0; put(g3, 100, 70); run(g3, 0.06);
  ok(g3.state === 'gameover' || g3.state === 'ranking', 'no continues: HARD IMPACT ends the run: ' + g3.state);
}
{   // STRANDED
  const { g } = newGame(); flatWorld(g); g.fuel = 0;
  touch(g, 100, 5);
  ok(g.state === 'grounded', 'out of fuel at touchdown: grounded first');
  const rec = { texts: [], tr: [] }; run(g, 0.3); renderOK(g, rec);
  ok(rec.texts.some(t => t.s === 'OUT OF FUEL'), 'banner says OUT OF FUEL');
  g._keys.up = true; run(g, 0.9);
  ok(g.state === 'grounded', 'still grounded at ~1.2 s');
  run(g, 0.4);
  ok(g.state === 'crashed' && g._crashReason === 'STRANDED — OUT OF FUEL', 'stranded after 1.5 s: ' + g.state + '/' + g._crashReason);
  // 燃料があれば何秒でも待てる
  const { g: h } = newGame(); flatWorld(h); touch(h, 100, 5); run(h, 10);
  ok(h.state === 'grounded' && h.fuel > 0, 'with fuel, waiting never strands');
  // 離陸直後に燃料が尽きる -> 再接地 -> STRANDED
  const { g: k } = newGame(); flatWorld(k); k.fuel = 0.05; touch(k, 100, 5); run(k, 0.3); for (let i = 0; i < 20; i++) { k._keys.up = true; k.update(DT); }
  for (let i = 0; i < 60 * 150 && k.state !== 'crashed' && k.state !== 'gameover'; i++) { k._keys.up = false; k.update(DT); }
  ok(k.fuel === 0 && k._crashReason === 'STRANDED — OUT OF FUEL', 'lift off on the last drop, come down, stranded: ' + k.state + '/' + k._crashReason + ' fuel=' + k.fuel);
}
{   // パッド上の着陸は従来どおり
  const { g } = newGame(); flatWorld(g); touch(g, 305, 5);
  ok(g.state === 'landing' && g._lastGrade, 'pad landing unchanged: landing sequence + grade');
  const { g: h } = newGame(); flatWorld(h); touch(h, 305, 70);
  ok(h.state === 'crashed' && h._crashReason === 'TOO FAST', 'pad: fast slam still TOO FAST');
}

// ---------- 5. 地面マーカーの色 ----------
{
  const { g } = newGame(); flatWorld(g);
  const at = (x, alt, vy, vx = 0, ang = 0, om = 0) => { g.x = x; g.y = 500 - 16 - alt; g.vy = vy; g.vx = vx; g.angle = ang; g.omega = om; g.state = 'play'; return g._groundIndicator(); };
  ok(at(100, 100, 10).kind === 'ok', 'slow over flat ground: ok (teal)');
  ok(at(100, 100, 30).kind === 'caution', 'too fast over flat ground: caution (amber)');
  ok(at(100, 100, 10, 20).kind === 'caution', 'sideways too fast: caution');
  ok(at(100, 100, 10, 0, 40).kind === 'caution', 'tilted: caution');
  ok(at(100, 100, 10, 0, 0, 30).kind === 'caution', 'spinning: caution');
  ok(at(100, 100, -50).kind === 'ok', 'rising fast is not a landing-speed problem');
  ok(at(100, 250, 10) === null, 'above 220 px: no marker');
  ok(at(100, 219, 10) !== null, 'just under 220 px: marker');
  ok(at(305, 60, 10) === null, 'over the pad: no shadow (the pad is the special target)');
  const steep = []; for (let i = 0; i <= 18; i++) steep.push({ x: i * 20, y: i < 9 ? 500 : 500 + (i - 9) * 8 });   // 右半分は約22度
  g.terrainPts = steep; g.pad = { x: 20, y: 500, w: 50, moving: false };
  const gi = (x) => { g.x = x; g.y = terrainYOn(steep, x) - 16 - 60; g.vy = 5; g.vx = 0; g.angle = 0; g.omega = 0; g.state = 'play'; return g._groundIndicator(); };
  ok(gi(250).kind === 'bad' && gi(250).slope > LAND_SLOPE_DEG, 'steep ground: bad (red)');
  ok(gi(100).kind === 'ok', 'flat part of the same terrain: ok');
  g.state = 'grounded'; ok(g._groundIndicator() === null, 'no marker once grounded');
  g.state = 'landing'; ok(g._groundIndicator() === null, 'no marker in result states');
  const p = P();
  ok(groundShadowColor('ok') === p.mid && groundShadowColor('caution') === p.warn && groundShadowColor('bad') === p.bad, 'marker colours: teal / amber / red');
  // 描画
  flatWorld(g); at(100, 100, 30); ok(renderOK(g), 'render with caution marker');
  at(100, 100, 5); ok(renderOK(g), 'render with ok marker');
}

// ---------- 6. 初回ヒント ----------
{
  const { e, g } = newGame(); e.store.delete('touchHintSeen'); g.enter(); g.obstacles = []; g._introT = 0; flatWorld(g, null);
  // 遠い: ヒントなし
  g.x = 180; g.y = 100; g.vx = 0; g.vy = 0; g.state = 'play'; run(g, 0.05);
  ok(g._touchHintT === 0 && !e.store.has('touchHintSeen'), 'far from flat ground: no hint');
  g._spots = [{ x0: 40, x1: 120, y: 500 }];
  g.x = 80; g.y = 500 - 16 - 150; g.vy = 0; g.guidePts = [{ x: 80, y: 340 }, { x: 305, y: 500 }]; run(g, 0.02);
  ok(g._touchHintT > 0 && e.store.get('touchHintSeen') === '1', 'within 160 px: hint toast + saved');
  const rec = { texts: [], tr: [] }; renderOK(g, rec);
  ok(TOUCH_HINT === 'FLAT GROUND: YOU CAN TOUCH DOWN · NO SCORE' && rec.texts.some(t => t.s === TOUCH_HINT_JA), 'hint text shown (lang ja)');
  ok(g.state === 'play', 'hint does not pause the game');
  const y0 = g.y; run(g, 0.2); ok(g.y !== y0, 'physics keeps running during the hint');
  run(g, 5); ok(g._touchHintT === 0, 'hint fades out');
  g.x = 80; g.y = 400; g.vy = 0; run(g, 0.05);
  ok(g._touchHintT === 0, 'shown only once');
  // 次のステージ・次のランでも出ない
  g._initStage(); g._spots = [{ x0: 40, x1: 120, y: 500 }]; g.x = 80; g.y = 400; g.vy = 0; run(g, 0.05);
  ok(g._touchHintT === 0, 'not again on the next stage');
  const g2 = new Game(e); g2.enter(); g2.obstacles = []; flatWorld(g2); g2._spots = [{ x0: 40, x1: 120, y: 500 }]; g2.x = 80; g2.y = 400; g2.vy = 0; run(g2, 0.05);
  ok(g2._touchHintT === 0, 'not again in a new run (touchHintSeen stored)');
  // 160 px ちょうど外
  const { e: e3, g: g3 } = newGame(); e3.store.delete('touchHintSeen'); g3.enter(); g3.obstacles = []; g3._introT = 0; flatWorld(g3); g3._spots = [{ x0: 40, x1: 120, y: 500 }];
  g3.x = 80; g3.y = 500 - 16 - 175; g3.vy = 0; run(g3, 0.01);
  ok(g3._touchHintT === 0, 'beyond 160 px: not yet');
  g3.y = 500 - 16 - 140; run(g3, 0.01); ok(g3._touchHintT > 0, 'then within range: shown');
}
{   // storage が使えなくても例外にならない
  const { e, g } = newGame(); e.storage.get = () => { throw new Error('blocked'); }; e.storage.set = () => { throw new Error('blocked'); };
  flatWorld(g); g._touchHintDone = undefined; g._spots = [{ x0: 40, x1: 120, y: 500 }]; g.x = 80; g.y = 400; g.state = 'play';
  let threw = false; try { run(g, 0.1); renderOK(g); } catch (_) { threw = true; }
  ok(!threw, 'blocked storage does not throw');
}

// ---------- 7. グレード ----------
{
  const row = (vy, vx, ang, om, dist) => ({ vy, vx, ang, om, dist });
  const T = [
    [row(0, 0, 0, 0, 0), 'PERFECT'], [row(8, 3, 5, 6, 0.25), 'PERFECT'], [row(8.01, 0, 0, 0, 0), 'S'], [row(0, 3.01, 0, 0, 0), 'S'], [row(0, 0, 5.01, 0, 0), 'S'],
    [row(0, 0, 0, 6.01, 0), 'S'], [row(0, 0, 0, 0, 0.26), 'S'], [row(12, 6, 10, 10, 0.5), 'S'], [row(12.01, 0, 0, 0, 0), 'A'], [row(0, 6.01, 0, 0, 0), 'A'],
    [row(0, 0, 10.01, 0, 0), 'A'], [row(0, 0, 0, 10.01, 0), 'A'], [row(0, 0, 0, 0, 0.51), 'A'], [row(16, 9, 17, 14, 0.75), 'A'], [row(16.01, 0, 0, 0, 0), 'B'],
    [row(0, 9.01, 0, 0, 0), 'B'], [row(0, 0, 17.01, 0, 0), 'B'], [row(0, 0, 0, 14.01, 0), 'B'], [row(0, 0, 0, 0, 0.76), 'B'], [row(20, 11, 24, 17, 1), 'B'],
    [row(20.01, 0, 0, 0, 0), 'C'], [row(0, 11.01, 0, 0, 0), 'C'], [row(0, 0, 24.01, 0, 0), 'C'], [row(0, 0, 0, 17.01, 0), 'C'], [row(0, 0, 0, 0, 1.01), 'C'],
    [row(22, 13, 28, 20, 1), 'C'], [row(5, 1, 2, 3, 0.9), 'B'], [row(10, 4, 8, 8, 0.4), 'S'], [row(14, 7, 12, 12, 0.6), 'A'],
  ];
  for (const [r, want] of T) ok(gradeFor(r) === want, 'gradeFor ' + JSON.stringify(r) + ' -> ' + want + ' (got ' + gradeFor(r) + ')');
  ok(GRADE_ORDER.join() === 'C,B,A,S,PERFECT' && gradeRank('S') > gradeRank('A') && gradeRank('C') === 0, 'grade order');
  ok(GRADE_TABLE.every((r, i) => i === 0 || (r.vy > GRADE_TABLE[i - 1].vy && r.vx > GRADE_TABLE[i - 1].vx && r.ang > GRADE_TABLE[i - 1].ang && r.om > GRADE_TABLE[i - 1].om && r.dist > GRADE_TABLE[i - 1].dist)), 'tiers strictly widen');
  // 実際の着陸: _perfect は PERFECT と一致
  const land = (vy, vx, ang, om, xOff = 0) => {
    const { g } = newGame(); flatWorld(g); g.x = 305 + xOff; g.y = 500 - 16 - 0.05; g.vy = vy; g.vx = vx; g.angle = ang; g.omega = om; g.state = 'play'; run(g, 0.05); return g;
  };
  let g = land(4, 0, 0, 0); ok(g._lastGrade === 'PERFECT' && g._perfect === true && g.state === 'landing', 'gentle centred landing: PERFECT + _perfect');
  g = land(4, 0, 0, 0, 20); ok(g._lastGrade === 'B' && g._perfect === false, 'PERFECT needs the pad centre (dist 0.8 -> B, got ' + g._lastGrade + ')');
  g = land(4, 0, 0, 0, 8); ok(g._lastGrade === 'S', 'dist 0.32 -> S (got ' + g._lastGrade + ')');
  g = land(4, 0, 0, 0, 6); ok(g._lastGrade === 'PERFECT', 'dist 0.24 -> PERFECT (got ' + g._lastGrade + ')');
  g = land(10, 4, 8, 8, 6); ok(g._lastGrade === 'S', 'good landing -> S (got ' + g._lastGrade + ')');
  g = land(14, 7, 12, 12, 0); ok(g._lastGrade === 'A', 'A (got ' + g._lastGrade + ')');
  g = land(19, 10, 20, 15, 0); ok(g._lastGrade === 'B', 'B (got ' + g._lastGrade + ')');
  g = land(21, 12, 27, 19, 0); ok(g._lastGrade === 'C', 'C: at the SAFE limits (got ' + g._lastGrade + ')');
  // バウンスしてから成功 -> 最初の衝撃で評価 (C)
  { const { g: h } = newGame(); flatWorld(h); put(h, 305, 30); let b = false; for (let i = 0; i < 360 && h.state === 'play'; i++) { h.update(DT); if (h._bouncing) b = true; }
    ok(b && h.state === 'landing' && h._lastGrade === 'C' && !h._perfect, 'bounced landing is graded on the first impact: C (got ' + h._lastGrade + ')'); }
  // 移動パッド: 中心からの距離は現在位置で測る
  { const { g: h } = newGame(); h.stage = 3; h.bonus = { type: 'ROVER' }; h._initStage(); h.obstacles = [];
    const c = h.pad.x + h.pad.w / 2; h.x = c; h.y = h._terrainYAt(c) - 16; h.vx = 0; h.vy = 3; h.angle = 0; h.omega = 0; h._doSuccess(0, 0);
    ok(h._lastGrade === 'PERFECT', 'bonus pad landing is graded too'); }
}

// ---------- 8. クリア画面の集計 ----------
function landAndClear(extra = [], opts = {}) {
  const { e, g } = newGame(extra); if (opts.bonus) { g.stage = 3; g.bonus = { type: opts.bonus }; g._initStage(); g.obstacles = []; }
  flatWorld(g); g.pad = g.pad; g.x = 305; g.y = 500 - 16 - 0.05; g.vy = 4; g.vx = 0; g.angle = 0; g.omega = 0; g.state = 'play';
  e.sfxLog.length = 0; run(g, 0.05); return { e, g };
}
{
  const { e, g } = landAndClear();
  ok(g.state === 'landing' && g._clearT === 0, 'count starts at 0 on success');
  ok(g._breakdown && g._breakdown.length === 4 && g._breakdown.reduce((a, b) => a + b[1], 0) === g._stageScore, 'breakdown lines sum to the stage score: ' + JSON.stringify(g._breakdown) + ' vs ' + g._stageScore);
  ok(e.sfxLog.filter(s => s.startsWith('thud')).length === 1, 'touchdown thud once: ' + e.sfxLog.join(','));
  for (let i = 0; i < 400 && g.state !== 'cleared'; i++) g.update(DT);
  ok(g.state === 'cleared', 'cleared after the landing sequence');
  e.sfxLog.length = 0;
  const p0 = g._clearView(); ok(p0.stamp === 0 && p0.tot === 0, 'at the start of the count: no stamp, no total');
  // 行ごとに順に
  const seen = [];
  for (let i = 0; i < 80; i++) { run(g, 0.02); const v = g._clearView(); seen.push(v); }
  const mono = seen.every((v, i) => i === 0 || v.prog.every((p, k) => p >= seen[i - 1].prog[k]) && v.tot >= seen[i - 1].tot && v.stamp >= seen[i - 1].stamp);
  ok(mono, 'count progress is monotonic');
  ok(seen.some(v => v.prog[0] > 0 && v.prog[1] === 0), 'lines count one after another');
  ok(g._clearT >= g._clearEnd() - 1e-9 && g._clearEnd() <= 1.3 && g._clearEnd() >= 1.0, 'whole count ~1.2 s: ' + g._clearEnd());
  ok(e.sfxLog.filter(s => s.startsWith('tick')).length === 5 && e.sfxLog.filter(s => s.startsWith('thud')).length === 1, 'ticks per step (4 lines + total) and one stamp thud: ' + e.sfxLog.join(','));
  // 描画: パネル内におさまる
  const rec = { texts: [], tr: [] }; renderOK(g, rec);
  const R = g._clearPanelRect();
  const boxes = rec.texts.map(boxOf).filter(b => b.y0 >= R.y - 1 && b.y0 <= R.y + R.h);
  ok(boxes.length > 8 && boxes.every(b => b.x0 >= R.x - 1 && b.x1 <= R.x + R.w + 1 && b.y1 <= R.y + R.h), 'all panel text stays inside the panel');
  let ov = 0; for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) if (overlap(boxes[i], boxes[j])) { ov++; console.log('  overlap', boxes[i].s, '/', boxes[j].s); }
  ok(ov === 0, 'panel texts do not overlap each other (full count)');
  ok(rec.texts.some(t => t.s === 'PERFECT') && rec.texts.some(t => t.s === '+' + g._stageScore), 'stamp + total shown');
  ok(R.x === 20 && R.y === 128 && R.w === 320 && R.h >= 216 && R.h <= 216 + 10 + 42, 'panel rect: same origin/width; height grows only for the RINGS line / stars row (L2): ' + R.h);
}
{   // 途中のタップ: 最後まで進めるだけ。次のタップで次へ
  const { e, g } = landAndClear(); run(g, 2.7);
  ok(g.state === 'cleared', 'cleared'); run(g, 0.4);
  ok(g._clearT < g._clearEnd(), 'still counting at 0.4 s');
  e.sfxLog.length = 0; tapAt(g);
  ok(g.state === 'cleared' && g._clearT === g._clearEnd(), 'tap mid-count skips to the end, stays on the panel');
  ok(g._clearView().stamp >= 0.999 && g._clearView().prog.every(p => p === 1), 'skip shows every line and the stamp');
  ok(e.sfxLog.length === 0, 'skipping is silent');
  run(g, 0.1); tapAt(g);
  ok(g.state === 'play' && g.stage === 2, 'next tap goes to the next stage');
}
{   // 入力ロック(0.3s)中のタップは無視
  const { g } = landAndClear(); run(g, 2.65); g._inputLock = 0.3; const t0 = g._clearT; tapAt(g);
  ok(g.state === 'cleared' && g._clearT === t0, 'tap inside the input lock is ignored');
}
{   // ミュート中は無音
  const { e, g } = landAndClear([['muted', '1']]); run(g, 4);
  e.sfxLog.length; const m = e.sfxLog.filter(s => /^(thud|tick)/.test(s)).length;
  ok(m === 0, 'mute: no thud / tick: ' + e.sfxLog.join(','));
}
{   // ボーナスの集計と描画
  const { g } = landAndClear([], { bonus: 'STORM' });
  ok(g.state === 'landing' && g._breakdown.length === 3 && g._breakdown.reduce((a, b) => a + b[1], 0) === g._stageScore, 'bonus breakdown sums: ' + JSON.stringify(g._breakdown) + ' / ' + g._stageScore);
  run(g, 4); ok(renderOK(g), 'render bonus clear');
}
{   // 状態を直接差し替えるテスト向け: 集計なしの cleared は全部表示
  const { g } = newGame(); g.state = 'cleared'; g.landingSeq = { t: 3 }; ok(renderOK(g), 'cleared without a count renders'); tapAt(g); ok(g.state === 'play' || g.state === 'bonusselect', 'and one tap advances');
}

// ---------- 9. stageBest ----------
{
  const gradeLand = (g, vy, xOff = 0) => { flatWorld(g); g.x = 305 + xOff; g.y = 500 - 16 - 0.05; g.vy = vy; g.vx = 0; g.angle = 0; g.omega = 0; g.state = 'play'; run(g, 0.05); };
  const { e, g } = newGame(prof('ACE'));
  g.stage = 3; g._initStage(); g.obstacles = []; gradeLand(g, 14);
  let sb = JSON.parse(e.store.get('stageBest'));
  ok(g._lastGrade === 'A' && sb.ACE && sb.ACE['3'].grade === 'A', 'stageBest stored per pilot: ' + e.store.get('stageBest'));
  g._initStage(); g.obstacles = []; gradeLand(g, 19);   // B: 下げない
  sb = JSON.parse(e.store.get('stageBest')); ok(g._lastGrade === 'B' && sb.ACE['3'].grade === 'A', 'worse grade does not overwrite');
  g._initStage(); g.obstacles = []; gradeLand(g, 4);
  sb = JSON.parse(e.store.get('stageBest')); ok(sb.ACE['3'].grade === 'PERFECT', 'better grade overwrites');
  g.stage = 4; g._initStage(); g.obstacles = []; gradeLand(g, 10, 5);
  sb = JSON.parse(e.store.get('stageBest')); ok(sb.ACE['4'].grade === 'S' && sb.ACE['3'].grade === 'PERFECT', 'per-stage entries');
  // 別パイロットは別枠
  e.store.set('profiles', JSON.stringify([{ name: 'ACE', key: 'a'.repeat(64) }, { name: 'BOB', key: 'b'.repeat(64) }])); e.store.set('activeProfile', '1'); e.store.set('lastName', 'BOB');
  g._pilotFor = null; g.stage = 3; g._initStage(); g.obstacles = []; gradeLand(g, 19);
  sb = JSON.parse(e.store.get('stageBest')); ok(sb.BOB && sb.BOB['3'].grade === 'B' && sb.ACE['3'].grade === 'PERFECT', 'another pilot has its own bests');
  // 破損 JSON は作り直す
  e.store.set('stageBest', '{oops'); g._initStage(); g.obstacles = []; gradeLand(g, 19);
  sb = JSON.parse(e.store.get('stageBest')); ok(sb.BOB['3'].grade === 'B', 'corrupt stageBest recovers');
  e.store.set('stageBest', '[1,2]'); g._initStage(); g.obstacles = []; gradeLand(g, 19); ok(!Array.isArray(JSON.parse(e.store.get('stageBest'))), 'array stageBest replaced');
  // ボーナスは保存しない
  e.store.delete('stageBest'); g.stage = 3; g.bonus = { type: 'CALM' }; g._initStage(); g.obstacles = []; gradeLand(g, 4);
  ok(!e.store.has('stageBest'), 'bonus landings are not stored');
  // デバッグ操作ラン / debug モード
  { const { e: e2, g: g2 } = newGame(prof('ACE')); g2._dbgTainted = true; g2.stage = 3; g2._initStage(); g2.obstacles = []; gradeLand(g2, 4);
    ok(g2._lastGrade === 'PERFECT' && !e2.store.has('stageBest'), 'debug-tainted run: grade shown but not stored'); }
  { setDebug(true); const { e: e2, g: g2 } = newGame(prof('ACE')); g2.stage = 3; g2._initStage(); g2.obstacles = []; gradeLand(g2, 4);
    ok(!e2.store.has('stageBest'), '?debug: not stored'); setDebug(false); }
  { const { e: e2, g: g2 } = newGame(); g2.stage = 3; g2._initStage(); g2.obstacles = []; gradeLand(g2, 4); ok(!e2.store.has('stageBest') && g2._lastGrade === 'PERFECT', 'no pilot: nothing stored, no error'); }
  { const { e: e2, g: g2 } = newGame(prof('ACE')); e2.storage.set = () => { throw new Error('blocked'); }; g2.stage = 3; g2._initStage(); g2.obstacles = [];
    let t = false; try { gradeLand(g2, 4); } catch (_) { t = true; } ok(!t && g2._lastGrade === 'PERFECT', 'blocked storage does not break the landing'); }
}

// ---------- 10. 演出（砂塵・揺れ・音）----------
{
  const dust = (bodyIdx) => { const { g } = newGame(); flatWorld(g); g._body = bodyIdx === 'terra' ? TERRA : BODIES[bodyIdx]; touch(g, 305, 5); return g.particles.filter(p => p.col); };
  const dm = dust(0), dmars = dust(3);
  ok(dm.length >= 10 && dm.every(p => /^#[0-9a-f]{6}$/.test(p.col)), 'dust on pad landing: ' + dm.length);
  ok(dm[0].col !== dmars[0].col, 'dust colour differs per body: ' + dm[0].col + ' / ' + dmars[0].col);
  const { e, g } = newGame(); flatWorld(g); touch(g, 100, 5);
  ok(g.particles.some(p => p.col) && e.sfxLog.some(s => s.startsWith('thud:0.6')), 'off-pad touchdown: lighter thud + dust: ' + e.sfxLog.join(','));
  const { e: e2, g: g2 } = newGame(); flatWorld(g2); touch(g2, 305, 5);
  ok(e2.sfxLog.some(s => s === 'thud:1'), 'pad touchdown: full thud');
  // 揺れ: 描画オフセットのみ、<=3px、<=0.25s（shake中は render の最初の translate が揺れ）
  ok(g2._shakeT <= 0.25 + 1e-9 && g2._shakeT > 0, 'shake armed for <= 0.25 s');
  const calm = (() => { const { g: h } = newGame(); flatWorld(h); h.x = 100; h.y = 400; h.state = 'play'; const r = { texts: [], tr: [] }; renderOK(h, r); return r.tr.length; })();
  let maxOff = 0, shakes = 0; const y0 = g2.y;
  for (let i = 0; i < 20; i++) {
    const r = { texts: [], tr: [] }; const armed = g2._shakeT > 0; renderOK(g2, r);
    if (armed) { shakes++; const [x, y] = r.tr[0]; maxOff = Math.max(maxOff, Math.abs(x), Math.abs(y)); }
    g2.update(DT);
  }
  ok(shakes > 5 && maxOff <= 3 && maxOff > 0, 'shake offsets within 3 px (max ' + maxOff + ', frames ' + shakes + ')');
  ok(g2._shakeT === 0 && g2.y === y0, 'shake ends within 0.25 s and never moves the craft');
  { const r3 = { texts: [], tr: [] }; renderOK(g2, r3); const first = r3.tr[0]; ok(!first || Math.abs(first[0]) > 3 || Math.abs(first[1]) > 3 || r3.tr.length >= calm - 2, 'no shake offset after the shake'); }
  // 土煙は消える
  run(g2, 1.5); ok(!g2.particles.some(p => p.col), 'dust fades away');
}

// ---------- 11. 平地の目印・全新状態の描画 ----------
{
  const { g } = newGame(); flatWorld(g); g._spots = landableSpots(g.terrainPts, g.pad);
  ok(g._spots.length >= 1, 'flat world has marked spots'); ok(renderOK(g), 'render with markings');
  let n = 0; for (const body of [...BODIES, TERRA]) for (let k = 0; k < 4; k++) {
    const { g: h } = newGame(); h._body = body; h.obstacles = []; h.state = 'play';
    ok(h._spots.length >= 2 || h.bonus, 'fresh stage has >= 2 marked spots');
    h.x = 100; h.y = 470; h.vy = 5; renderOK(h) && n++;
    h.state = 'grounded'; h._groundedT = 1; renderOK(h) && n++; h.fuel = 0; renderOK(h) && n++;
    h._touchHintT = 2; renderOK(h) && n++; h._shakeT = 0.2; h._shakeAmp = 3; renderOK(h) && n++;
    h.state = 'hold'; h._holdPrev = 'grounded'; renderOK(h) && n++;
  }
  ok(n === 9 * 6 * 4, 'render never throws: all new states x 9 bodies (8 + TERRA) x 4 seeds (' + n + ')');
  // 全グレードのスタンプ
  for (const gr of ['C', 'B', 'A', 'S', 'PERFECT']) for (const t of [0, 0.3, 0.7, 1.0, 1.22, 5]) {
    const { g: h } = newGame(); flatWorld(h); h.x = 305; h.y = 484; h.vy = 4; h.state = 'play'; run(h, 0.05); h._grade = gr; h._clearT = t; h.state = 'cleared'; h.landingSeq = { t: 3 };
    ok(renderOK(h), 'render clear panel grade ' + gr + ' t=' + t);
  }
}
{   // HOLD は接地中も使え、復帰後も grounded のまま
  const { g } = newGame(); flatWorld(g); touch(g, 100, 5);
  g._enterHold(); ok(g.state === 'hold', 'HOLD from grounded'); const f = g.fuel; run(g, 1);
  g._resume(); ok(g.state === 'grounded' && g.fuel === f, 'RESUME returns to grounded'); run(g, 0.6);
  g.onHidden(); ok(g.state === 'hold', 'auto-hold on blur while grounded');
}

// ---------- 12. WHAT'S NEW ----------
{
  const ENT = WHATSNEW.entries;
  ok(WHATSNEW.version === '1.1.0-beta.6' && ENT.length >= 2 && ENT[0].version === WHATSNEW.version, 'whatsnew: entries newest first, version = entries[0]');
  ok(ENT.every(en => /^\d{4}\.\d\d\.\d\d$/.test(en.date) && en.items.length >= 3 && en.items.length <= 6), 'each entry: date + 3-6 items');
  ok(ENT.every(en => en.items.every(l => l.length <= 22 && /[\u3040-\u30ff]/.test(l))), 'items <= 22 chars, Japanese (user decision)');
  const ITEMS = ENT.flatMap(en => en.items);
  const mk = (extra = []) => { const e = makeEngine(extra); const b = new BootScene(e, () => { e.started = true; }); return { e, b }; };
  const draw = (b, t = 5) => { b.t = t; const rec = { texts: [], tr: [] }; b.render(makeCtx(rec)); return rec.texts; };
  let { e, b } = mk();
  ok(b.isNewVersion() === true, 'fresh device: NEW');
  let tx = draw(b);
  ok(tx.some(t => t.s === 'NEW') && tx.some(t => t.s === 'UPDATE INFORMATION') && !tx.some(t => t.s === "WHAT'S NEW") && ENT[0].items.every(l => tx.some(t => t.s === l)), 'NEW pill + header + visible newest items drawn');
  b.onInput('tap', { x: 10, y: 10 });
  ok(e.started === true && e.store.get('seenVersion') === WHATSNEW.version, 'boot tap starts and stores seenVersion');
  ({ e, b } = mk([['seenVersion', WHATSNEW.version]]));
  tx = draw(b); ok(!b.isNewVersion() && !tx.some(t => t.s === 'NEW') && tx.some(t => t.s === 'UPDATE INFORMATION'), 'same version: no NEW pill, block still shown');
  ({ e, b } = mk([['seenVersion', '2020.01.01']])); ok(b.isNewVersion(), 'old version: NEW again');
  // 明るさ: NEW のときは行が少し明るい（alpha 記録）
  const alphas = (extra) => { const { b: bb } = mk(extra); bb.t = 5; const ctx = makeCtx(null); const rec = []; const c2 = new Proxy({}, { get: (t, k) => k === 'fillText' ? (s) => rec.push([String(s), ctx.globalAlpha]) : ctx[k], set: (t, k, v) => { ctx[k] = v; return true; } }); bb.render(c2); return rec.find(r => r[0] === ENT[0].items[0])[1]; };
  ok(alphas([]) > alphas([['seenVersion', WHATSNEW.version]]), 'unseen version: text slightly brighter');
  // レイアウト (360x640): ロゴ/TAP/SOUND ON と非重複、画面内
  ({ e, b } = mk()); tx = draw(b, 5);
  const bx = tx.map(boxOf);
  const find = (s) => bx.find(x => x.s === s);
  const logo = find('LANDER'), sub = find('SOFT LANDING TOUR'), tap = find('TAP TO BEGIN'), snd = find('SOUND ON');
  const news = bx.filter(x => x.s === 'UPDATE INFORMATION' || x.s === 'NEW' || ITEMS.includes(x.s));
  ok(news.length >= 7, 'news boxes found');
  let ov = 0; for (const n of news) for (const o of [logo, sub, tap, snd]) if (overlap(n, o)) { ov++; console.log('  overlap', n.s, o.s); }
  const hd = find('UPDATE INFORMATION'), npill = find('NEW');
  ok(!overlap(hd, npill) && npill.x0 >= hd.x1, 'NEW pill is right of the heading, no overlap');
  ok(ov === 0, 'UPDATE INFORMATION does not overlap the logo / tap prompt');
  ok(news.every(n => n.x0 >= 8 && n.x1 <= 352 && n.y1 <= 632), 'news block inside the screen');
  ok(Math.min(...news.map(n => n.y0)) > snd.y1 + 8, 'news block sits clearly below TAP TO BEGIN / SOUND ON');
  const L = b.newsLayout(); ok(L.bottom <= 600 && L.pill.x + L.pill.w <= 352 && L.head.y > snd.y1 && L.frame.y > L.head.y, 'newsLayout bounds');
  ok(!tx.some(t => t.y < 0), 'sanity');
  // 保存できない端末でも進める
  ({ e, b } = mk()); e.storage.set = () => { throw new Error('x'); }; e.storage.get = () => { throw new Error('x'); };
  let thr = false; try { draw(b); b.onInput('tap', { x: 1, y: 1 }); } catch (_) { thr = true; }
  ok(!thr && e.started === true, 'blocked storage: still renders and starts');
  // 連打・リピートで二重に進まない
  ({ e, b } = mk()); let c = 0; b.next = () => { c++; }; b.onInput('tap', {}); b.onInput('tap', {}); b.onInput('confirm', {}); ok(c === 1, 'boot advances once');
}

// ---------- 13. fuzz ----------
{
  seeded(5);
  const seenStates = new Set(); let lifts = 0, grounded = 0, finite = true, threw = 0;
  const { e, g } = newGame();
  const reset = () => {
    g.stage = 1 + Math.floor(Math.random() * 14); g.bonus = null; g.continues = 3; g._initStage(); g.obstacles = Math.random() < 0.2 ? g.obstacles : [];
    if (Math.random() < 0.6) flatWorld(g);   // 平地の多い地形（接地・離陸を確実に踏ませる）
    if (Math.random() < 0.6) { flatWorld(g); g.x = 30 + Math.random() * 170; g.y = 462 + Math.random() * 12; g.vy = 1 + Math.random() * 4; g.vx = (Math.random() - 0.5) * 6; g.angle = (Math.random() - 0.5) * 10; }   // 平地の上空からの穏やかな降下（接地・離陸を確実に踏ませる）
    else if (Math.random() < 0.7) { g.x = 30 + Math.random() * 300; g.y = 330 + Math.random() * 100; g.vy = Math.random() * 25; g.vx = (Math.random() - 0.5) * 20; g.angle = (Math.random() - 0.5) * 30; }
  };
  reset(); let prev = 'play';
  for (let f = 0; f < 5000; f++) {
    if (f % 600 === 599) { g.state = 'play'; reset(); }   // 定期的に仕切り直す（乱数の流れが変わっても接地・離陸を踏む）
    const r = Math.random();
    if (g.state === 'play' || g.state === 'grounded') {
      // L2: 降下を緩めるだけの推力にする（毎回上昇してしまうと接地に届かない）
      if (g._keys) { if (r < 0.3 && (g.vy > 5 || g.state === 'grounded' && r < 0.08)) g._keys.up = true; if (r > 0.9) g._keys.left = true; if (r > 0.93) g._keys.right = true; }
      if (Math.random() < 0.01 && g.state === 'grounded') g.fuel = Math.random() < 0.5 ? 0 : 50;
    }
    try { g.update(DT); clock += 16; if (f % 7 === 0) g.render(makeCtx(null)); } catch (err) { threw++; if (threw < 3) console.log(err); }
    if (!Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.vx) || !Number.isFinite(g.vy) || !Number.isFinite(g.angle) || !Number.isFinite(g.fuel)) finite = false;
    seenStates.add(g.state); if (g.state === 'grounded') grounded++;
    if (prev === 'grounded' && g.state === 'play') lifts++;
    prev = g.state;
    if (g.state === 'landing' || g.state === 'cleared' || g.state === 'crashed' || g.state === 'bonusfailed' || g.state === 'module' || g.state === 'bonusselect' || g.state === 'gameover' || g.state === 'ranking') {
      if (Math.random() < 0.08) { tapAt(g); if (Math.random() < 0.5) tapAt(g); if (['module'].includes(g.state)) g._pickModule(0); if (g.state === 'bonusselect') g._skipBonus(); }
      if (Math.random() < 0.02 || g.state === 'gameover' || g.state === 'ranking') { g.state = 'play'; reset(); }
    }
  }
  unseed();
  ok(threw === 0, 'fuzz: no exceptions in 5000 frames (' + threw + ')');
  ok(finite, 'fuzz: all physics values finite');
  ok(seenStates.has('grounded') && grounded > 20, 'fuzz reached grounded: ' + grounded + ' frames; states: ' + [...seenStates].join(','));
  ok(lifts > 0, 'fuzz lifted off from grounded: ' + lifts);
}

console.log('\np10touch: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
