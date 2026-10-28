// P4 MISSION HOLD / ABORT MISSION テスト。実行: node 04_tests/p4hold.mjs
import { Game } from '../02_src/game.js';
import { Music } from '../02_src/music.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { loadRanking } from '../02_src/ranking.js';
import { W } from '../02_src/core/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;

let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
const fetchCalls = [];
globalThis.fetch = (url, opt) => { fetchCalls.push({ url, body: opt && opt.body }); return Promise.resolve({ ok: true, status: 200, json: async () => ({ board: 'v1.1', top: [] }) }); };

function makeCtx(st) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'save') return () => { st.depth++; };
      if (k === 'restore') return () => { st.depth--; };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s) => { st.texts.push(String(s)); };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function makeMusic() {
  const log = [];
  const rec = (n) => (...a) => { log.push(n + (a.length ? ':' + a.join(',') : '')); };
  return { log, attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: rec('duck'),
    sfx: { landing: rec('landing'), crash: rec('crash'), module: rec('module'), launch: rec('launch'), uiTap: rec('uiTap') } };
}
function makeEngine(opts = {}) {
  const store = new Map([['hudTipSeen', '1'], ['howtoSkip', '1']]);
  return {
    music: opts.noDuck ? Object.assign(makeMusic(), { duck: undefined }) : makeMusic(),
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store,
  };
}
function newGame(opts) { const e = makeEngine(opts); const g = new Game(e); g.enter(); return g; }
const run = (g, sec) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { g.update(DT); clock += 16; } };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const tapAt = (g, p) => { clock += 10; g.onInput('tap', { x: p.x, y: p.y, t0: clock - 50 }); };
const btn = (g, id) => g._holdButtons().find((b) => b.id === id);
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const snap = (g) => JSON.stringify({ x: g.x, y: g.y, vx: g.vx, vy: g.vy, a: g.angle, o: g.omega, f: g.fuel, c: g._clock, st: g.stage, t: g.totalScore, parts: g.parts && g.parts.length, pad: g.pad && g.pad.x, pt: g._padT, wind: g._windAccel, ob: g.obstacles && g.obstacles.map((o) => [o.x, o.y]), intro: g._introT, bn: g._bannerT, cont: g.continues, bt: g._bounceT });
const renderOK = (g) => { const st = { depth: 0, texts: [] }; try { g.render(makeCtx(st)); } catch (e) { console.log('render threw', e); return false; } return st.depth === 0 ? st : false; };
function enterHold(g) { tapAt(g, center(g._holdRect())); run(g, 0.4); }

setDebug(false);
__setRelayUrl('');

// ---- 1. HOLD ボタンと凍結 ----
{
  const g = newGame(); run(g, 1);
  ok(g.state === 'play', 'starts in play');
  tapAt(g, center(g._holdRect()));
  ok(g.state === 'hold', 'HOLD button -> hold');
  run(g, 0.4);
  // 凍結前に推力入力を保持していても動かない
  g.engine.touches = [{ x: 180, y: 600 }]; g.engine.pointer = { down: true, x: 180, y: 600 };
  const s0 = snap(g);
  run(g, 5);
  ok(snap(g) === s0, 'hold: positions/velocities/fuel/timers identical after 5 s');
  ok(g.engine.music.log.includes('duck:true'), 'hold ducks BGM');
  ok(renderOK(g), 'render in hold');
  g.engine.touches = []; g.engine.pointer.down = false;
}

// ---- 2. RESUME: 復帰と0.5秒の入力無視 ----
{
  const g = newGame(); run(g, 1); g.fuel = 80;
  enterHold(g);
  const fuel = g.fuel, vy = g.vy;
  tapAt(g, center(btn(g, 'resume')));
  ok(g.state === 'play', 'resume -> previous state (play)');
  ok(g.engine.music.log.includes('duck:false'), 'resume un-ducks');
  g.engine.touches = [{ x: 180, y: 600 }]; g.engine.pointer = { down: true, x: 180, y: 600 };
  g.onInput('confirm');
  run(g, 0.4);
  ok(g.fuel === fuel, 'grace: control input ignored for 0.4 s (fuel unchanged, got ' + g.fuel + ')');
  ok(!g._thrustMain, 'grace: no thrust flag');
  run(g, 0.3);
  ok(g.fuel < fuel, 'after grace, held thrust works again');
  g.engine.touches = []; g.engine.pointer.down = false;
  ok(vy !== undefined, 'vy defined');
}

// ---- 3. ABORT -> CONFIRM ----
{
  fetchCalls.length = 0; __setRelayUrl('https://relay.test');
  const g = newGame(); run(g, 1);
  g.totalScore = 1234; g.continues = 3; g.fuel = 77;
  const rows0 = loadRanking(g.engine.storage).length;
  enterHold(g);
  tapAt(g, center(btn(g, 'abort')));
  ok(g.state === 'hold' && g._holdConfirm === true, 'ABORT -> confirm view in same panel');
  const st = renderOK(g);
  ok(st && st.texts.join('').replace(/ /g,'').includes('ABORTMISSION?') && st.texts.join('').replace(/ /g,'').includes('YOURSCOREWILLBERECORDED'), 'confirm text rendered');
  ok(g._holdButtons().map((b) => b.label).join() === 'CANCEL,CONFIRM ABORT', 'confirm buttons');
  // CANCEL
  run(g, 0.4);
  tapAt(g, center(btn(g, 'cancel')));
  ok(g.state === 'hold' && g._holdConfirm === false, 'CANCEL returns to hold panel');
  ok(renderOK(g).texts.join('').replace(/ /g,'').includes('MISSIONHOLD'), 'hold panel text');
  // 再度 -> CONFIRM
  run(g, 0.4); tapAt(g, center(btn(g, 'abort'))); run(g, 0.4);
  tapAt(g, center(btn(g, 'confirm')));
  ok(g.state === 'gameover', 'CONFIRM -> gameover');
  ok(g.totalScore === 1234, 'totalScore unchanged (no fuel bonus)');
  ok(g.continues === 3, 'continues untouched');
  ok(loadRanking(g.engine.storage).length === rows0 + 1, 'one local ranking row added');
  ok(g.engine.music.log.includes('uiTap') && !g.engine.music.log.includes('crash'), 'soft ui sound, no crash sfx');
  ok(g.engine.music.log[g.engine.music.log.length - 1] !== 'duck:true' && g.engine.music.log.lastIndexOf('duck:false') > g.engine.music.log.lastIndexOf('duck:true'), 'abort un-ducks');
  await Promise.resolve(); await new Promise((r) => setTimeout(r, 5));
  const subs = fetchCalls.filter((c) => /\/submit$/.test(c.url));
  ok(subs.length === 1 && JSON.parse(subs[0].body).score === 1234, 'world submit exactly once with score');
  ok(renderOK(g), 'gameover render');
  // ゲームオーバー後のタップ位置が前のパネルを貫通しない: 入力ロック中は何も起きない
  tapAt(g, { x: 180, y: 300 });
  ok(g.state === 'gameover', 'tap right after abort does not leak');
  __setRelayUrl('');
}
// debug run は記録/送信しない
{
  fetchCalls.length = 0; __setRelayUrl('https://relay.test');
  setDebug(true);
  const g = newGame(); run(g, 1); g.totalScore = 500;
  const rows0 = loadRanking(g.engine.storage).length;
  enterHold(g); tapAt(g, center(btn(g, 'abort'))); run(g, 0.4); tapAt(g, center(btn(g, 'confirm')));
  await new Promise((r) => setTimeout(r, 5));
  ok(g.state === 'gameover' && loadRanking(g.engine.storage).length === rows0 && fetchCalls.length === 0, 'debug run abort: not recorded, not submitted');
  setDebug(false); __setRelayUrl('');
  const g2 = newGame(); run(g2, 1); g2._dbgTainted = true; g2.totalScore = 500;
  enterHold(g2); tapAt(g2, center(btn(g2, 'abort'))); run(g2, 0.4); tapAt(g2, center(btn(g2, 'confirm')));
  ok(g2.state === 'gameover' && loadRanking(g2.engine.storage).length === 0, 'tainted run abort: not recorded');
}

// ---- 4. 自動 HOLD ----
{
  const g = newGame(); run(g, 1);
  g.onHidden();
  ok(g.state === 'hold', 'hidden/blur in play -> hold');
  const s0 = snap(g); run(g, 3); ok(snap(g) === s0 && g.state === 'hold', 'no auto-resume');
  g.onHidden(); ok(g.state === 'hold' && g._holdPrev === 'play', 'repeat onHidden in hold: no change');
  for (const st of ['crashed', 'cleared', 'landing', 'gameover', 'module', 'bonusfailed', 'debug']) {
    const h = newGame(); run(h, 0.5); h.state = st; h.onHidden();
    ok(h.state === st, 'onHidden ignored in ' + st);
  }
}
// エンジン経由 (blur / visibilitychange / pagehide)
{
  const L = new Map();
  const mk = () => ({ addEventListener(t, f) { if (!L.has(t)) L.set(t, []); L.get(t).push(f); }, removeEventListener: noop });
  globalThis.window = Object.assign(mk(), { innerWidth: 360, innerHeight: 640, devicePixelRatio: 1 });
  globalThis.document = Object.assign(mk(), { hidden: false, createElement: () => ({ getContext: () => makeCtx({ depth: 0, texts: [] }), style: {}, addEventListener: noop }), body: { appendChild: noop } });
  globalThis.requestAnimationFrame = noop;
  globalThis.localStorage = { getItem: () => null, setItem: noop, removeItem: noop };
  const eng = await import('../02_src/core/engine.js');
  const cv = Object.assign(mk(), { style: {}, width: 0, height: 0, getContext: () => makeCtx({ depth: 0, texts: [] }), getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) });
  const E = new eng.Engine(cv);
  for (const [name, fire] of [['blur', () => (L.get('blur') || []).forEach((f) => f())], ['pagehide', () => (L.get('pagehide') || []).forEach((f) => f())], ['visibilitychange', () => { document.hidden = true; (L.get('visibilitychange') || []).forEach((f) => f()); document.hidden = false; }]]) {
    const g = new Game(E); E.changeScene(g); if (g._ht) g._ht.close(); if (g.state === 'tip') g._endTip(); run(g, 0.5);
    fire();
    ok(g.state === 'hold', 'engine ' + name + ' -> hold');
  }
  // 押しっぱなしの指は hold 中に離しても tap にならない
  const g = new Game(E); E.changeScene(g); if (g._ht) g._ht.close(); if (g.state === 'tip') g._endTip(); run(g, 0.5);
  clock += 10; E._pStart(5, 180, 400); clock += 200;
  g._enterHold(); clock += 100;
  const before = g.state; const cb = g._holdConfirm;
  g.onInput('tap', { x: btn(g, 'abort').x + 10, y: btn(g, 'abort').y + 10, t0: clock - 300 });
  ok(g.state === before && g._holdConfirm === cb, 'finger held before hold: its release does not press a hold button');
}

// ---- 5. HOLD ボタンは play のみ / タップの貫通 / キー ----
{
  const g = newGame(); run(g, 0.5);
  ok(g.state === 'play', 'play');
  for (const st of ['crashed', 'cleared', 'landing', 'gameover', 'module', 'bonusfailed']) {
    const h = newGame(); run(h, 0.5); h.state = st; h._inputLock = 0;
    tapAt(h, center(h._holdRect()));
    ok(h.state !== 'hold', 'HOLD button inactive in ' + st);
  }
  const st = renderOK(g); ok(st, 'play render');
  // hold panel taps do not leak
  enterHold(g);
  const s0 = snap(g);
  tapAt(g, { x: 20, y: 600 }); tapAt(g, { x: 180, y: 600 }); tapAt(g, { x: 300, y: 600 }); tapAt(g, { x: 30, y: 26 });
  ok(g.state === 'hold' && snap(g) === s0, 'taps outside buttons: nothing happens');
  g.onInput('left'); g.onInput('up'); g.onInput('confirm'); run(g, 0.5);
  ok(snap(g) === s0 && g.state === 'hold', 'keys do not steer while on hold');
  // Escape in hold = resume; in confirm = cancel; engine BACK blocked
  ok(g.blocksBack() === true, 'BACK disabled during hold');
  g.onInput('back'); ok(g.state === 'play', 'Escape on hold panel resumes (does not leave the game)');
  run(g, 0.5); enterHold(g); tapAt(g, center(btn(g, 'abort'))); run(g, 0.4);
  g.onInput('back'); ok(g.state === 'hold' && !g._holdConfirm, 'Escape on confirm = cancel');
  // ロック中の連打はボタンに効かない (誤爆防止)
  const h2 = newGame(); run(h2, 0.5); tapAt(h2, center(h2._holdRect()));
  const nx = center({ x: 70, y: 384, w: W - 140, h: 48 });
  tapAt(h2, nx); ok(h2.state === 'hold' && !h2._holdConfirm, 'taps within 0.3 s of entering hold ignored');
}

// ---- 6. 継続中の状態 (bonus / 他天体) でも復帰が同一 ----
{
  const g = newGame(); g.bonus = { type: 'ROVER', afterStage: 3 }; g._initStage(); run(g, 1);
  enterHold(g); const s0 = snap(g); run(g, 2); tapAt(g, center(btn(g, 'resume')));
  ok(g.state === 'play' && snap(g) === s0, 'bonus stage: resume restores exactly');
  ok(g.bonus && g.bonus.type === 'ROVER', 'bonus preserved');
}

// ---- 7. HUD タップ対象の非重複 ----
{
  const g = newGame();
  const rects = { back: g.engine.backBtn, mute: g._muteRect(), hold: g._holdRect(), dbg: g._dbgBtnRect() };
  const names = Object.keys(rects); let bad = 0;
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (overlap(rects[names[i]], rects[names[j]])) { bad++; console.log('overlap', names[i], names[j]); }
  ok(bad === 0, 'no overlap among BACK/mute/HOLD/DBG');
  const hr = g._holdRect();
  ok(hr.y + hr.h <= 52, 'HOLD inside control-ignore strip (y<=52)');
  ok(hr.w >= 32 && hr.h >= 32 && hr.x >= 182 && hr.x + hr.w <= 230, 'HOLD size and clear of top-right score area');
  // DEBUG タグ (x178.., y8..16) / ステージ行 (y<=17) とも非重複
  ok(hr.y >= 18, 'below DEBUG tag / stage text baseline row');
  // HOLD 上の指は操縦ゾーンに入らない
  g.engine.touches = [{ x: 203, y: 34 }]; run(g, 0.5);
  ok(!g._thrustMain && !g._thrustRcsL && !g._thrustRcsR, 'finger on HOLD button is not a control input');
  g.engine.touches = [];
  // hold パネルのボタン同士
  g._holdConfirm = false; const b = g._holdButtons(); ok(!overlap(b[0], b[1]), 'hold buttons do not overlap');
  g._holdConfirm = true; const c = g._holdButtons(); ok(!overlap(c[0], c[1]), 'confirm buttons do not overlap');
  ok(b.concat(c).every((r) => r.h >= 44 && r.x >= 0 && r.x + r.w <= W), 'buttons >=44pt, inside screen');
}

// ---- 8. Music.duck ----
{
  let threw = false;
  try { Music.duck(true); Music.duck(false); Music.duck(true); Music.duck(false); } catch (_) { threw = true; }
  ok(!threw, 'Music.duck no-op safe before audio unlock');
  // duck の無いスタブ Music でも Game は動く
  const g = newGame({ noDuck: true }); run(g, 0.5);
  let t2 = false; try { enterHold(g); tapAt(g, center(btn(g, 'resume'))); } catch (_) { t2 = true; }
  ok(!t2 && g.state === 'play', 'Game tolerates Music without duck');
  // ctx ありのフェイクで ramp が掛かる
  const calls = [];
  const gainNode = () => ({ gain: { value: 1, cancelScheduledValues: () => calls.push('cancel'), setTargetAtTime: (v) => calls.push('ramp:' + v.toFixed(4)) }, connect: noop, disconnect: noop });
  const fctx = { currentTime: 0, sampleRate: 8000, destination: {}, createGain: gainNode, createBuffer: () => ({ getChannelData: () => new Float32Array(8000) }), createBufferSource: () => ({ connect: noop, start: noop, stop: noop, buffer: null, loop: false }), createOscillator: () => ({ connect: noop, start: noop, stop: noop, frequency: { value: 0, setValueAtTime: noop, setTargetAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop }, type: '' }), createBiquadFilter: () => ({ connect: noop, frequency: { value: 0, setValueAtTime: noop, setTargetAtTime: noop }, Q: { value: 0 }, type: '' }), createDelay: () => ({ connect: noop, delayTime: { value: 0 } }), createWaveShaper: () => ({ connect: noop }), createStereoPanner: () => ({ connect: noop, pan: { value: 0 } }) };
  Music.attach({ ctx: fctx, enabled: true });
  let t3 = false; try { Music.duck(true); Music.duck(false); } catch (e) { t3 = true; console.log(e); }
  ok(!t3, 'Music.duck with a context does not throw');
  ok(calls.some((c) => c === 'ramp:0.0375') && calls.some((c) => c === 'ramp:0.1250'), 'duck ramps to 30% and back (' + calls.filter((c) => c.startsWith('ramp')).join(' ') + ')');
  Music.attach(null);
}

// ---- 9. render は全 hold/confirm 状態で投げない ----
{
  for (const bonus of [null, { type: 'CALM', afterStage: 3 }, { type: 'ROVER', afterStage: 3 }, { type: 'CROSSWIND', afterStage: 6 }, { type: 'STORM', afterStage: 9 }]) {
    for (const stage of [1, 4, 7, 10, 13, 16, 19]) {
      const g = newGame(); g.stage = stage; g.bonus = bonus; g._initStage(); run(g, 0.3);
      enterHold(g); if (!renderOK(g)) ok(false, 'render hold stage ' + stage);
      g._holdConfirm = true; if (!renderOK(g)) ok(false, 'render confirm stage ' + stage);
    }
  }
  ok(true, 'render hold/confirm across bodies/bonuses');
}

// ---- 10. ファズ 3000 フレーム ----
{
  let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  let threw = null, holds = 0, aborts = 0, runs = 0;
  let g = newGame();
  const evs = ['left', 'right', 'up', 'down', 'confirm', 'back'];
  try {
    for (let f = 0; f < 3000; f++) {
      const r = rnd();
      if (g.state === 'gameover' && r < 0.2) { g = newGame(); runs++; }
      if (r < 0.04) g.onHidden();
      else if (r < 0.10) tapAt(g, center(g._holdRect()));
      else if (r < 0.22 && g.state === 'hold') { const bs = g._holdButtons(); const b = bs[Math.floor(rnd() * bs.length)]; tapAt(g, center(b)); }
      else if (r < 0.30) tapAt(g, { x: rnd() * 360, y: rnd() * 640 });
      else if (r < 0.34) g.onInput(evs[Math.floor(rnd() * evs.length)], rnd() < 0.2 ? { repeat: true } : undefined);
      else if (r < 0.37) g.engine.touches = rnd() < 0.5 ? [] : [{ x: rnd() * 360, y: 60 + rnd() * 580 }];
      if (g.state === 'hold') holds++;
      if (g.state === 'hold' && g._holdConfirm && rnd() < 0.1) aborts++;
      g.update(DT * (0.5 + rnd())); clock += 16;
      if (f % 7 === 0 && !renderOK(g)) throw new Error('render failed at ' + f + ' state ' + g.state);
      if (!Number.isFinite(g.x) || !Number.isFinite(g.y) || !Number.isFinite(g.fuel)) throw new Error('NaN at ' + f);
    }
  } catch (e) { threw = e; console.log(e); }
  ok(!threw, '3000-frame fuzz incl. hold/abort: no exception (holds=' + holds + ', confirm views=' + aborts + ', fresh runs=' + runs + ')');
  ok(holds > 50, 'fuzz exercised hold');
}

console.log(`p4hold: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
