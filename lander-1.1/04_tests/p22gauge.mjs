// p22gauge — beta.7: SHIELD ゲージ（20秒で満タン→ボタン/クリック/↓/S で5秒の泡）。緊急シールドの廃止。
// 実行: node 04_tests/p22gauge.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
import { Game, SH_BTN, SH_HIT, SH_FULL_S, SH_DUR_S, SH_BUBBLE_R } from '../02_src/game.js';
import { htContent } from '../02_src/howto.js';
import { MUTE_KEY } from '../02_src/title.js';
import { i18nBind, i18nSetLang } from '../02_src/core/i18n.js';
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
  const store = new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1'], ...extra]);
  const sfxLog = [];
  const sfx = {};
  for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch', 'shield']) sfx[n] = (a) => sfxLog.push([n, a]);
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


const tap = (g, x, y, extra = {}) => g.onInput('tap', Object.assign({ x, y, t0: clock + 1e6 }, extra));
const full = (g) => { g._gauge = SH_FULL_S; return g; };
const shieldTexts = (g) => render(g).texts.filter((t) => t.s === 'SHIELD');
const btnText = (g) => shieldTexts(g).find((t) => t.y >= 480);
const hudText = (g) => shieldTexts(g).find((t) => t.y < 80);

// ================================================================ 1. 充填: 20 秒で満タン
{
  const { g } = air();
  ok(g._gauge === 0 && SH_FULL_S === 20 && SH_DUR_S === 5, 'new run: gauge 0, constants 20 s / 5 s');
  run(g, 19.5); ok(g._gauge > 19.4 && g._gauge < 19.6 && !g._shieldFull(), 'after 19.5 s: not full (' + g._gauge.toFixed(2) + ')');
  run(g, 0.6); ok(g._shieldFull() && g._gauge === SH_FULL_S, 'after ~20.1 s: full, clamped at 20');
  run(g, 5); ok(g._gauge === SH_FULL_S, 'stays at the cap');
  render(g); ok(g._hud.shield === 1, 'HUD value is 1 when full');
  const h = air().g; run(h, 10); render(h); ok(Math.abs(h._hud.shield - 0.5) < 0.01, 'HUD value ~0.5 at 10 s');
  ok(!!hudText(h), 'HUD gauge label SHIELD drawn near the fuel bar (y=' + (hudText(h) || {}).y + ')');
  ok(hudText(h).y > 50 && hudText(h).y < 62, 'label sits at the fuel row');
}
// grounded も数える（平地で待つ戦略）
{
  const { g } = stageGame(1); g.obstacles = []; g._rg = null; g._spots = []; g._windSpec = null; g._windAccel = 0;
  const pts = []; for (let i = 0; i <= 18; i++) pts.push({ x: i * 20, y: 480 }); g.terrainPts = pts; g.pad = { x: 170, y: 480, w: 22, moving: false };
  g.fuel = g._fuelMax(); g.x = 60; g.y = 480 - 16 - 0.2; g.vx = 0; g.vy = 2; g.angle = 0; g.omega = 0; g.state = 'play'; g._contact0 = null; g._bouncing = false;
  for (let i = 0; i < 300 && g.state === 'play'; i++) { g.update(DT); clock += 16; }
  ok(g.state === 'grounded', 'set up: grounded on flat ground (state ' + g.state + ')');
  const g0 = g._gauge; run(g, 4);
  ok(g.state === 'grounded' && Math.abs(g._gauge - g0 - 4) < 0.05, 'grounded time charges the gauge: +' + (g._gauge - g0).toFixed(2) + ' in 4 s');
  run(g, 20); ok(g.state === 'grounded' && g._shieldFull(), 'waiting on flat ground fills it');
  ok(!!btnText(g), 'button visible while grounded and full');
  g.onInput('down'); ok(g._shT > 0, 'can activate while grounded');
}
// 止まる状態
{
  const { g, e } = air(); run(g, 3); const g0 = g._gauge;
  g._enterHold(); run(g, 2); ok(g.state === 'hold' && g._gauge === g0, 'MISSION HOLD: paused');
  g.state = 'play'; g._ht = null;
  g._openHowto(false); run(g, 2); ok(g._ht && g._gauge === g0, 'HOW TO PLAY card: paused'); g._ht = null;
  for (const st of ['tip', 'cleared', 'crashed', 'bonusfailed', 'module', 'bonusselect', 'gameover', 'landing', 'debug']) {
    g.state = st; g._tipT = 99; run(g, 1.5); ok(g._gauge === g0, st + ': paused');
  }
  g.state = 'play'; run(g, 1); ok(g._gauge > g0 + 0.9, 'resumes when back in play');
  // 導入の天体紹介（_introT）の間は操縦可能な play なので数える
}
// 持ち越し・リセット・使用・墜落
{
  const { e, g } = air(); g._gauge = 12.5;
  g.stage = 7; g.bonus = null; g._initStage(); ok(g._gauge === 12.5, 'carries over to the next stage');
  g.stage = 8; g.bonus = { type: 'CALM' }; g._initStage(); ok(g._gauge === 12.5, 'and through a bonus stage');
  g.bonus = null; g.stage = 9; g._initStage();
  g._doCrash('TIPPED OVER'); g._continue(); ok(g._gauge === 12.5, 'crash does not reduce it (continue)');
  g._doCrash('HIT AN OBSTACLE'); g._continue(); ok(g._gauge === 12.5, 'obstacle crash does not reduce it either');
  const g2 = new Game(e); g2.enter(); ok(g2._gauge === 0, 'a new run starts at 0');
  full(g); g.onInput('down'); ok(g._gauge === 0 && g._shT === SH_DUR_S, 'use sets it to 0');
  run(g, 5.1); ok(g._shT === 0, 'bubble gone after 5 s'); ok(g._gauge > 4.9 && g._gauge < 5.3, 'recharge restarts from 0 (' + g._gauge.toFixed(2) + ')');
  const g3 = air().g; g3._gauge = 10; g3.stage = 3; g3._initStage(); ok(g3._shT === 0, 'bubble does not carry across stages'); 
  const dbg = air().g; setDebug(true); dbg._gauge = 0; run(dbg, 2); setDebug(false); ok(dbg._gauge > 1.9, 'debug runs charge as usual');
}

// ================================================================ 2. 発動入力
{
  // 満タンでないとボタンは出ず、どの入力でも発動しない
  const { g } = air(); run(g, 5);
  ok(!btnText(g), 'button hidden while not full (HUD gauge only)');
  g.onInput('down'); tap(g, 180, 530); tap(g, 100, 300, { mouse: true });
  ok(g._shT === 0 && g._gauge > 4.9, 'not full: nothing activates, gauge untouched');
  full(g); run(g, 0.05);
  const bt = btnText(g); ok(!!bt, 'button visible when full: SHIELD text at (' + (bt && bt.x.toFixed(0)) + ',' + (bt && bt.y.toFixed(0)) + ')');
  ok(SH_BTN.h >= 56 && SH_BTN.w >= 56, 'button size >= 56 px (' + SH_BTN.w + 'x' + SH_BTN.h + ')');
  // 3つの操作ボタン (y 570..626, x 12..108 / 132..228 / 252..348) と重ならず、メイン噴射ボタンの真上
  ok(SH_BTN.y + SH_BTN.h < 570 && SH_HIT.y + SH_HIT.h <= 560, 'above the control buttons, hit box ends at ' + (SH_HIT.y + SH_HIT.h));
  const cx = SH_BTN.x + SH_BTN.w / 2; ok(Math.abs(cx - 180) < 1 && cx > 132 && cx < 228, 'centered above the main-thrust button');
  ok(SH_HIT.x <= SH_BTN.x && SH_HIT.y <= SH_BTN.y && SH_HIT.x + SH_HIT.w >= SH_BTN.x + SH_BTN.w && SH_HIT.y + SH_HIT.h >= SH_BTN.y + SH_BTN.h, 'hit box covers the visible button');
  // タッチ（マウスでない）: ボタン外では発動しない、ボタン内は発動、操作ボタン帯は発動しない
  tap(g, 60, 300); tap(g, 180, 300); tap(g, 180, 600); tap(g, 180, 570); tap(g, 60, 600);
  ok(g._shT === 0 && g._shieldFull(), 'touch taps outside the button (incl. all 3 control buttons) do not activate');
  // 画面に入る前から押していた指の解除は無視
  g._overlayAt = 1000; g.onInput('tap', { x: 180, y: 530, t0: 500 }); g._overlayAt = 0;
  ok(g._shT === 0, 'a release of a finger that was already down is ignored');
  tap(g, 180, 530); ok(g._shT === SH_DUR_S && g._gauge === 0, 'tap on the SHIELD button activates');
  ok(g.state === 'play', 'still playing');
}
{ // ボタン上の押下は噴射にならない（満タン時）
  const { g } = air(); full(g); g.vy = 0; g.e = null;
  g.engine.touches = [{ x: 180, y: 530 }]; run(g, 0.5); ok(g._thrustMain === false && g.vy === 0, 'holding the SHIELD button does not fire the main engine');
  g.engine.touches = [{ x: 180, y: 600 }]; run(g, 0.2); ok(g._thrustMain === true, 'but the main-thrust button still does');
  g.engine.touches = [];
  // 満タンでなければボタン位置の押下は従来どおり噴射
  const h = air().g; h.engine.touches = [{ x: 180, y: 530 }]; run(h, 0.2); ok(h._thrustMain === true, 'not full: that spot is the normal thrust zone');
}
{ // マウスのクリック（操作ボタン帯以外のどこでも）
  const { g } = air(); full(g); tap(g, 40, 300, { mouse: true });
  ok(g._shT === SH_DUR_S, 'mouse click on the canvas activates');
  const a = air().g; full(a); tap(a, 180, 590, { mouse: true }); tap(a, 40, 640 - 20, { mouse: true }); tap(a, 300, 570, { mouse: true });
  ok(a._shT === 0, 'mouse click on the control-button band does not');
  const b = air().g; full(b); tap(b, 180, 530, { mouse: true }); ok(b._shT > 0, 'mouse click on the SHIELD button activates');
  const m = air().g; full(m); m._holdRect && tap(m, 200, 30, { mouse: true }); ok(m._shT === 0 && m.state === 'hold', 'click on the pause button pauses (does not activate)');
}
{ // ↓ / S （キー）と、Space/↑/W は主推力のまま
  const { g } = air(); full(g); g.onInput('down'); ok(g._shT === SH_DUR_S, '↓ (down) activates');
  const s = air().g; full(s); s.onInput('down', { swipe: true }); ok(s._shT === 0, 'a swipe-down gesture does not');
  for (const k of ['up', 'confirm']) {
    const r = air(); r.g._gauge = SH_FULL_S; r.g.vy = 0; key(r.g, k, 0.5);
    ok(r.g._shT === 0 && r.g._shieldFull() && r.g.vy < -1.5, k + ': thrusts, never activates the shield (vy ' + r.g.vy.toFixed(2) + ')');
  }
  const l = air().g; full(l); l.onInput('left'); l.onInput('right'); l.onInput('back' === 'x' ? 'x' : 'left'); ok(l._shT === 0, 'left/right do not activate');
  // 2 回目は無効（0 に戻っている）
  g.onInput('down'); ok(g._gauge === 0 && g._shT <= SH_DUR_S, 'second press right away does nothing');
  // 自動操縦は自動発動しない
  const au = air().g; full(au); au._auto = true; run(au, 3); ok(au._shT === 0 && au._shieldFull(), 'AUTO LAND never activates the shield');
  // HOLD / HOW TO PLAY 中は不可
  const hd = air().g; full(hd); hd._enterHold(); hd.onInput('down'); ok(hd._shT === 0, 'cannot activate during MISSION HOLD');
  const ht = air().g; full(ht); ht._openHowto(false); ht.onInput('down'); ok(ht._shT === 0 && ht._gauge === SH_FULL_S, 'cannot activate behind the HOW TO PLAY card');
  const cl = air().g; full(cl); cl.state = 'cleared'; cl.onInput('down'); ok(cl._shT === 0, 'cannot activate on result screens');
}
{ // 発動の表示・音
  const { g, e } = air(); full(g); e.sfxLog.length = 0; g.onInput('down');
  ok(typeof g.engine.music.sfx.shield === 'function', 'sfx.shield exists');
  const rec = render(g); ok(rec.texts.some((t) => t.s === 'SHIELD' && t.y > 240 && t.y < 290), 'SHIELD banner shown');
  ok(rec.arcs.some((a) => near(a.r, SH_BUBBLE_R, 1e-9)) && rec.arcs.some((a) => near(a.r, SH_BUBBLE_R + 4, 1e-9)), 'bubble + remaining-time ring drawn');
  ok(!btnText(g) , 'button hidden while the bubble is up');
  run(g, 1.8); ok(!render(g).texts.some((t) => t.s === 'SHIELD' && t.y > 240 && t.y < 290), 'banner gone after ~1.6 s');
  ok(render(g).arcs.some((a) => near(a.r, SH_BUBBLE_R, 1e-9)), 'bubble still drawn');
  run(g, 3.5); ok(!render(g).arcs.some((a) => near(a.r, SH_BUBBLE_R, 1e-9)), 'bubble gone after 5 s');
  // sfx は Music.sfx.shield を呼ぶ。ミュート時は呼ばない
  let n = 0; const e2 = air(); e2.g.engine.music.sfx.shield = () => n++; full(e2.g); e2.g.onInput('down'); ok(n === 1, 'activation sfx played once');
  let n2 = 0; const e3 = air(); e3.g.engine.music.sfx.shield = () => n2++; e3.e.store.set(MUTE_KEY, '1'); full(e3.g); e3.g.onInput('down'); ok(n2 === 0 && e3.g._shT > 0, 'muted: no sfx, still works');
}

// ================================================================ 3. 効果
{
  const mk = (withShield, modLv = 0) => {
    const r = air(); const g = r.g; g.modules.shield = modLv; g._initStage(); g._gravity = 0; g._windSpec = null; g._rg = null;
    g.x = 180; g.y = 150; g.vx = 0; g.vy = 0; g.fuel = g._fuelMax();
    g.obstacles = [{ x: 120, y: 150, vx: 60, r: 12, style: 'rock' }];
    if (withShield) { full(g); g.onInput('down'); }
    return r;
  };
  const c = mk(false); run(c.g, 1.5); ok(c.g.state !== 'play', 'control: the same meteor crashes without the shield (state ' + c.g.state + ')');
  const s = mk(true); let minD = 1e9, bounced = false;
  for (let i = 0; i < 90; i++) { s.g.update(DT); clock += 16; minD = Math.min(minD, Math.hypot(s.g.x - s.g.obstacles[0].x, s.g.y - s.g.obstacles[0].y)); if (s.g.obstacles[0].vx < 0) bounced = true; }
  ok(s.g.state === 'play' && bounced, 'meteor is deflected, no crash (state ' + s.g.state + ')');
  ok(minD >= SH_BUBBLE_R + 12 - 1.5, 'it never gets inside the bubble: min distance ' + minD.toFixed(1));
  ok(s.g.obstacles[0].vx < 0 && !s.g.obstacles[0].spent, 'moving away afterwards, not consumed');
  // 右からの隕石も、斜め(dy≠0)も
  const r2 = mk(true); r2.g.obstacles = [{ x: 240, y: 150, vx: -80, r: 10, style: 'rock' }]; run(r2.g, 1.2); ok(r2.g.state === 'play' && r2.g.obstacles[0].vx > 0, 'from the right: deflected right');
  const r3 = mk(true); r3.g.obstacles = [{ x: 150, y: 150 + 20, vx: 50, r: 12, style: 'rock' }]; run(r3.g, 1); ok(r3.g.state === 'play', 'off-center hit: deflected');
  // モジュールの SHIELD は消費しない
  const r4 = mk(true, 2); const ch0 = r4.g._shieldCharges; run(r4.g, 1.5);
  ok(ch0 === 2 && r4.g._shieldCharges === 2 && r4.g.state === 'play', 'module shield charges untouched by the bubble');
  // 泡が切れたら隕石は普通に当たる
  const r5 = mk(true); run(r5.g, 5.1); r5.g.obstacles = [{ x: r5.g.x - 20, y: r5.g.y, vx: 50, r: 12, style: 'rock' }]; run(r5.g, 0.5); ok(r5.g.state !== 'play', 'after 5 s the meteor hits again');
  // モジュール SHIELD は別物のまま: 泡なしでは従来どおり吸収、ゲージは変化しない
  const r6 = mk(false, 1); r6.g._gauge = 7; r6.g.obstacles = [{ x: 170, y: 150, vx: 0, r: 12, style: 'rock' }]; r6.g.update(DT);
  ok(r6.g.state === 'play' && r6.g._shieldCharges === 0 && r6.g.obstacles[0].spent && near(r6.g._gauge, 7 + DT, 1e-9), 'module shield still absorbs (and is independent of the gauge)');
}
{ // 地面の衝撃は従来どおり
  const { g } = stageGame(1); g.obstacles = []; g._rg = null; g._spots = []; g._windSpec = null; g._windAccel = 0;
  const pts = []; for (let i = 0; i <= 18; i++) pts.push({ x: i * 20, y: 480 }); g.terrainPts = pts; g.pad = { x: 170, y: 480, w: 22, moving: false };
  full(g); g.onInput('down'); ok(g._shT > 0, 'bubble up');
  g.fuel = g._fuelMax(); g.x = 60; g.y = 480 - 16 - 0.2; g.vx = 0; g.vy = 70; g.angle = 0; g.omega = 0; g._gravity = 0.15; g._contact0 = null; g._bouncing = false;
  for (let i = 0; i < 30 && g.state === 'play'; i++) { g.update(DT); clock += 16; }
  ok(g.state !== 'play' && g.state !== 'grounded' && /FAST|HARD|IMPACT/.test(g._crashReason), 'a hard landing still fails during the shield: ' + g._crashReason);
}

// ================================================================ 4. 操作の割り当て（実エンジン経由）と HOW TO PLAY
{
  const winH = {}, canH = {};
  const reg = (st) => (n, f) => { (st[n] = st[n] || []).push(f); };
  globalThis.window = { addEventListener: reg(winH), innerWidth: 360, innerHeight: 640, devicePixelRatio: 1 };
  globalThis.document = { addEventListener: reg({}), hidden: false };
  const cx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 5 }) : noop) });
  const canvas = { style: {}, width: 0, height: 0, addEventListener: reg(canH), getBoundingClientRect: () => ({ left: 0, top: 0 }), getContext: () => cx };
  const { Engine } = await import('../02_src/core/engine.js');
  const E = new Engine(canvas); const got = []; E.scene = { isRoot: true, onInput: (a, d) => got.push([a, d]) };
  const fire = (st, n, ev) => (st[n] || []).forEach((f) => f(Object.assign({ preventDefault: noop, target: {} }, ev)));
  for (const k of ['ArrowDown', 's']) { got.length = 0; fire(winH, 'keydown', { key: k }); ok(got.length === 1 && got[0][0] === 'down' && !(got[0][1] && got[0][1].swipe), k + ' -> down (no swipe flag)'); }
  for (const [k, a] of [[' ', 'confirm'], ['ArrowUp', 'up'], ['w', 'up']]) { got.length = 0; fire(winH, 'keydown', { key: k }); ok(got[0][0] === a, JSON.stringify(k) + ' -> ' + a + ' (thrust)'); }
  const T = (x, y) => ({ identifier: 1, clientX: x, clientY: y });
  got.length = 0; fire(canH, 'mousedown', { clientX: 90, clientY: 300 }); fire(winH, 'mouseup', { clientX: 90, clientY: 300 });
  ok(got.length === 1 && got[0][0] === 'tap' && got[0][1].mouse === true, 'mouse click -> tap with mouse flag');
  got.length = 0; fire(canH, 'touchstart', { changedTouches: [T(180, 530)] }); fire(canH, 'touchend', { changedTouches: [T(180, 530)] });
  ok(got.length === 1 && got[0][0] === 'tap' && !got[0][1].mouse, 'finger tap -> tap without mouse flag');
  got.length = 0; fire(canH, 'touchstart', { changedTouches: [T(180, 300)] }); fire(canH, 'touchend', { changedTouches: [T(180, 360)] });
  ok(got.length === 1 && got[0][0] === 'down' && got[0][1].swipe === true, 'finger swipe down -> down with swipe flag');
  // 実エンジン + Game: 満タンで S キー / マウスクリック / タップ
  const g = new Game(E); E.scene = g; g.enter(); g.stage = 6; g.bonus = null; g._initStage(); g.obstacles = []; g._ht = null; g.state = 'play'; g._tipOn = false;
  full(g); fire(winH, 'keydown', { key: 's' }); ok(g._shT > 0, 'S key activates (real engine)');
  const g2 = new Game(E); E.scene = g2; g2.enter(); g2.stage = 6; g2.bonus = null; g2._initStage(); g2._ht = null; g2.state = 'play'; full(g2);
  fire(canH, 'mousedown', { clientX: 90, clientY: 300 }); fire(winH, 'mouseup', { clientX: 90, clientY: 300 }); ok(g2._shT > 0, 'mouse click activates (real engine)');
  const g3 = new Game(E); E.scene = g3; g3.enter(); g3.stage = 6; g3.bonus = null; g3._initStage(); g3._ht = null; g3.state = 'play'; full(g3);
  fire(canH, 'touchstart', { changedTouches: [T(180, 300)] }); fire(canH, 'touchend', { changedTouches: [T(180, 300)] }); ok(g3._shT === 0, 'a plain finger tap elsewhere does not (mobile uses the button)');
  fire(canH, 'touchstart', { changedTouches: [T(180, 530)] }); fire(canH, 'touchend', { changedTouches: [T(180, 530)] }); ok(g3._shT > 0, 'finger tap on the button activates (real engine)');
  E._clearPointers();
}
{
  for (const lang of ['ja', 'en']) for (const touch of [true, false]) {
    const c = htContent(lang, false, touch);
    ok(typeof c.shield === 'string' && /SHIELD/.test(c.shield) && /5/.test(c.shield), lang + ' HOW TO PLAY has the SHIELD line: ' + c.shield);
  }
  ok(htContent('en', false, true).shield === 'When the gauge is full: SHIELD (tap / click / ↓) blocks meteors for 5 s', 'EN text as specified');
  ok(/タップ／クリック／↓/.test(htContent('ja', false, true).shield), 'JA mentions tap / click / ↓');
  ok(htContent('en', false, true).all === 'THESE ARE ALL THE CONTROLS' && htContent('ja', false, true).all === '操作はこれだけです', 'the "these are all the controls" framing is kept');
  // カードの描画: 説明文が設定ボタン(LANGUAGE の行 y=466)に食い込まない
  for (const lang of ['ja', 'en']) for (const touch of [true, false]) {
    const e = makeEngine(); i18nBind(e.storage); i18nSetLang(lang);
    const { HtCard } = await import('../02_src/howto.js'); const card = new HtCard({ storage: e.storage, touch });
    const rec = newRec(); card.render(makeCtx(rec));
    const want = htContent(lang, false, touch);
    const other = rec.texts.find((t) => t.s === want.other); const last = rec.texts.filter((t) => t.y < 466 && t.s !== 'HOW TO PLAY');
    ok(other && other.y < 458, lang + (touch ? ' touch' : ' pc') + ': text block ends above the settings (other-line y=' + (other && other.y) + ')');
    ok(rec.texts.some((t) => /SHIELD/.test(t.s)), lang + ' card renders the SHIELD line');
  }
  i18nSetLang('en');
}

console.log('p22gauge: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
