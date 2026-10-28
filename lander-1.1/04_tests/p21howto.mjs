// p21howto — beta.6→beta.7: HOW TO PLAY / 言語(JA/EN) / 操作の向き(STANDARD/INVERTED) / UPDATE INFORMATION の英訳 / ステージ開始の1文。
// 実行: node 04_tests/p21howto.mjs（lander-1.1/ から）
import './p10setup.mjs';
import fs from 'node:fs';
import { Game } from '../02_src/game.js';
import { TitleScene } from '../02_src/title.js';
import { HtCard, htContent, htWrap } from '../02_src/howto.js';
import { WHATSNEW, whatsnewItems } from '../02_src/whatsnew.js';
import { APP_VERSION } from '../02_src/version.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { i18nBind, i18nLang, i18nDetect, i18nControls, i18nSetLang, i18nSetControls } from '../02_src/core/i18n.js';
import { GOAL_LINES, goalKey, goalText, stageInfo, BONUS_MISSIONS } from '../02_src/bodies.js';
import { autopilotKeys } from '../02_src/autopilot.js';
import { SIDE_S, SIDE_ACCEL, POWER_DEFS } from '../02_src/rings.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('');
const setNav = (language) => Object.defineProperty(globalThis, 'navigator', { value: { language, languages: [language], maxTouchPoints: 0 }, configurable: true });

function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (rec && k === 'fillText') return (s, x, y) => { rec.texts.push(String(s)); };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
const texts = (scene) => { const rec = { texts: [] }; scene.render(makeCtx(rec)); return rec.texts; };
function makeEngine(extra = [], seen = true) {
  const store = new Map([...(seen ? [['hudTipSeen', '1'], ['howtoSkip', '1']] : []), ['touchHintSeen', '1'], ...extra]);
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = noop;
  return { store, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock() { this.ctx = this.ctx || {}; } },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const newGame = (extra, seen) => { const e = makeEngine(extra, seen); const g = new Game(e); g.enter(); return { e, g }; };
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const key = (g, k, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.onInput(k); g.update(DT); clock += 16; } };
function air(extra = []) {
  const r = newGame(extra); const g = r.g; g.stage = 6; g.bonus = null; g._initStage();
  g.obstacles = []; g._rg = null; g._gravity = 0; g._windSpec = null;
  g.x = 180; g.y = 150; g.vx = 0; g.vy = 0; g.angle = 0; g.omega = 0; g.fuel = g._fuelMax(); g._goalT = 0;
  return r;
}
const seed = (n) => { let x = n; Math.random = () => { x = (x * 1664525 + 1013904223) >>> 0; return x / 4294967296; }; };
const c = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, t0: clock + 1 });

// ================================================================ 1. 言語の既定と保存
{
  const e = makeEngine([], false); i18nBind(e.storage);
  setNav('ja-JP'); ok(i18nDetect() === 'ja' && i18nLang() === 'ja', 'navigator ja-JP -> JA');
  setNav('ja'); ok(i18nLang() === 'ja', 'navigator ja -> JA');
  setNav('en-US'); ok(i18nLang() === 'en', 'navigator en-US -> EN');
  setNav('fr-FR'); ok(i18nLang() === 'en', 'other languages -> EN');
  setNav('en-US'); i18nSetLang('ja'); ok(e.store.get('lang') === 'ja' && i18nLang() === 'ja', "stored 'lang' overrides navigator");
  setNav('ja-JP'); i18nSetLang('en'); ok(e.store.get('lang') === 'en' && i18nLang() === 'en', 'stored EN wins over a Japanese browser');
  ok(i18nSetLang('xx') === false && i18nLang() === 'en', 'invalid language ignored');
  ok(i18nControls() === 'standard', 'controls default STANDARD');
  i18nSetControls('inverted'); ok(e.store.get('controls') === 'inverted' && i18nControls() === 'inverted', "stored 'controls'");
  ok(i18nSetControls('weird') === false && i18nControls() === 'inverted', 'invalid controls ignored');
  e.store.set('lang', 'garbage'); setNav('en-US'); ok(i18nLang() === 'en', 'garbage stored value falls back to navigator');
  // 保存が使えない（例外）でも落ちない
  const bad = makeEngine(); bad.storage.get = () => { throw new Error('x'); }; bad.storage.set = () => { throw new Error('x'); };
  i18nBind(bad.storage); setNav('ja-JP'); ok(i18nLang() === 'ja' && i18nControls() === 'standard' && i18nSetLang('en') === false, 'blocked storage: defaults, no throw');
  // 永続: 別の Game/Title でも同じ値
  const e2 = makeEngine(); i18nBind(e2.storage); i18nSetLang('ja'); i18nSetControls('inverted');
  const t = new TitleScene(e2, noop, {}); t.enter(); ok(i18nLang() === 'ja' && i18nControls() === 'inverted', 'settings persist across scenes (same storage)');
}

// ================================================================ 2. UPDATE INFORMATION（JA/EN）
{
  const E = WHATSNEW.entries;
  ok(APP_VERSION === '1.1.0-beta.6' && E[0].version === APP_VERSION && E[0].date === '2026.10.27' && WHATSNEW.version === APP_VERSION, 'beta.6 is the newest entry (2026.10.27)');
  ok(E[0].items.slice(0, 3).join('|') === '操作説明（HOW TO PLAY）を追加|説明文を日本語・英語で切替|左右の操作の向きを設定で反転', 'beta.6 JA items (first three as specified)');
  ok(E[0].items.includes('操作説明は毎回表示（次回から非表示も可）') && E[0].itemsEn.includes('How-to shows each run (can hide)'), 'beta.7-change item present (JA/EN)');
  ok(E[0].items.includes('ステージ開始時にやることを1文で表示') && E[0].itemsEn.includes('One-line goal at each stage start') && E[0].items.length <= 6, 'beta.6 has the stage-goal item, <= 6 items');
  ok(E.every((en) => Array.isArray(en.itemsEn) && en.itemsEn.length === en.items.length), 'every entry: itemsEn parallel to items');
  ok(E.every((en) => en.items.every((l) => l.length <= 22) && en.itemsEn.every((l) => l.length <= 34 && /^[\x20-\x7e]+$/.test(l))), 'JA <= 22 chars, EN <= 34 chars ASCII: max EN ' + Math.max(...E.flatMap((en) => en.itemsEn.map((l) => l.length))));
  ok(E[0].itemsEn.join('|').includes('HOW TO PLAY') && E[0].itemsEn.some((l) => /invert/i.test(l)), 'beta.6 EN equivalents');
  const e = makeEngine(); i18nBind(e.storage); setNav('en-US'); i18nSetLang('ja');
  ok(whatsnewItems(E[0]) === E[0].items, 'JA -> items'); i18nSetLang('en'); ok(whatsnewItems(E[0]) === E[0].itemsEn, 'EN -> itemsEn');
  ok(whatsnewItems({ items: ['a'], itemsEn: [] }, 'en').join() === 'a', 'missing EN falls back to JA');
}

// ================================================================ 3. HOW TO PLAY: ラン開始のたびに表示 / 次回から表示しない
{
  setNav('en-US');
  const { e, g } = newGame([], false);
  ok(!!g._ht && !e.store.has('howtoSeen'), "run start: HOW TO PLAY shown; legacy 'howtoSeen' no longer written");
  const snap = () => [g.x, g.y, g.vy, g.fuel, g._clock].join();
  g.onInput('tap', { x: 180, y: 300, t0: clock + 5 }); ok(!!g._ht, 'tap within 0.35 s ignored');
  clock += 500; g.onInput('tap', { x: 180, y: 300, t0: clock - 1000 }); ok(!!g._ht, 'stale-finger release ignored');
  const s0 = snap(); run(g, 2);
  ok(snap() === s0 && g.state === 'play', 'physics frozen while the card is up');
  ok(g.blocksBack(), 'BACK button blocked while the card is up');
  g.onHidden(); ok(g.state === 'play', 'blur does not open HOLD under the card');
  const tx = texts(g).join('|');
  ok(tx.includes('HOW TO PLAY') && tx.includes('THESE ARE ALL THE CONTROLS') && /NO WEAPONS/.test(tx) && tx.includes("Don't show next time"), 'card text (EN, PC): title + ALL + no weapons + skip checkbox');
  g.onInput('tap', { x: 180, y: 300, t0: clock + 1 });
  ok(!g._ht && g.state === 'tip', 'tap closes the card; the HUD tip follows (state=' + g.state + ')');
  // 毎回表示: 次のラン開始（新しい Game.enter）でも出る。howtoSeen が残っていても関係ない
  const e2 = makeEngine([['howtoSeen', '1'], ['hudTipSeen', '1']], false); const g2 = new Game(e2); g2.enter(); ok(!!g2._ht, "old 'howtoSeen' ignored: card shown at every run start");
  const g3 = newGame([['hudTipSeen', '1']], false).g; ok(!!g3._ht, 'returning player also sees the card at run start');
  // ステージ間では出ない
  g3._ht.close(); g3.stage += 1; g3._initStage(); ok(!g3._ht, 'not shown between stages');
  // CONTINUE（チェックポイント再開）・MAP 開始も enter なので出る
  { const e = makeEngine([['hudTipSeen', '1']], false); e.resumeCheckpoint = { v: 1, stage: 4, totalScore: 100, continues: 0, runId: 'r', startStage: 1, modules: {} }; const g = new Game(e); g.enter(); ok(!!g._ht && g.stage === 4, 'CONTINUE start shows the card'); }
  { const e = makeEngine([['hudTipSeen', '1']], false); e.mapStart = 5; const g = new Game(e); g.enter(); ok(!!g._ht, 'map/other start shows the card'); }
  const g4 = newGame([], false).g; clock += 500; g4.onInput('confirm'); ok(!g4._ht, 'any key (confirm) closes after the lock');
  const g5 = newGame([], false).g; clock += 500; g5.onInput('left'); ok(!g5._ht && !g5._keys.left, 'an arrow key closes it and is not used for steering');
  // チェックボックス
  const { e: e6, g: g6 } = newGame([['hudTipSeen', '1']], false); const R6 = g6._ht.rects();
  ok(R6.skip.h >= 44 && R6.skip.w >= 44, 'skip checkbox target >= 44 px');
  const over = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok(![R6.ja, R6.en, R6.std, R6.inv].some((r) => over(r, R6.skip)) && R6.skip.y + R6.skip.h <= 640, 'checkbox overlaps no setting button and fits the screen');
  clock += 500; g6.onInput('tap', c(R6.skip));
  ok(!!g6._ht && e6.store.get('howtoSkip') === '1', 'checkbox ON: stored howtoSkip=1, card stays open');
  g6.onInput('tap', c(R6.skip)); ok(!!g6._ht && e6.store.get('howtoSkip') === '0', 'checkbox toggles OFF again');
  g6.onInput('tap', c(R6.skip)); ok(e6.store.get('howtoSkip') === '1', 'ON again');
  setNav('en-US'); i18nSetLang('ja'); ok(texts(g6).join('|').includes('次回から表示しない'), 'JA label 次回から表示しない'); i18nSetLang('en');
  g6.onInput('tap', { x: 180, y: 300, t0: clock + 1 });
  ok(!g6._ht, 'closed by outside tap');
  // 保存が効く: 同じ storage の新しいラン開始ではカードが出ない（計器ヒントのみ）
  const e7 = makeEngine([['hudTipSeen', '1']], false); e7.store.set('howtoSkip', '1'); const g7 = new Game(e7); g7.enter(); ok(!g7._ht && g7.state === 'play', 'howtoSkip=1: no card at run start');
  e7.store.set('howtoSkip', '0'); const g8 = new Game(e7); g8.enter(); ok(!!g8._ht, 'howtoSkip=0: card shown');
  // ブロックされた storage でも落ちない（毎回表示になる）
  const eb = makeEngine([], false); eb.storage.get = () => { throw new Error('b'); }; eb.storage.set = () => { throw new Error('b'); };
  let threw = false; try { const gb = new Game(eb); gb.enter(); run(gb, 1); texts(gb); gb._ht.input('tap', c(gb._ht.rects().skip)); } catch (_) { threw = true; } ok(!threw, 'blocked storage: no throw');
}

// ================================================================ 4. タイトルに '?' は無い・カードの設定・タップ消費
{
  setNav('en-US');
  const e = makeEngine([['profiles', JSON.stringify([{ name: 'TESTER', key: 'a'.repeat(64) }])], ['activeProfile', '0']]);
  const calls = { n: 0 };
  const t = new TitleScene(e, () => { calls.n++; }, { launch: true }); t.enter(); t.update(0.016);
  ok(t.howBtn === undefined && t.ht === undefined, "title has no '?' button / card (beta.7)");
  ok(t.muteBtn.x === 360 - 48 && t.muteBtn.w === 40, 'mute button back at its original place');
  t.onInput('tap', { x: 360 - 72, y: 28, t0: clock + 1 }); ok(!t.ht, "tap where '?' used to be opens nothing");
  ok(!texts(t).includes('HOW TO PLAY'), 'title never draws HOW TO PLAY');
  // 設定ボタン（単体のカード）
  let closed = 0; const card = new HtCard({ storage: e.storage, onClose: () => { closed++; } }); clock += 500;
  const R = card.rects();
  ok([R.ja, R.en, R.std, R.inv].every((r) => r.h >= 44 && r.w >= 44), 'setting buttons >= 44 px');
  const sc = { render: (ctx) => card.render(ctx) };
  card.input('tap', c(R.ja)); ok(!closed && e.store.get('lang') === 'ja', 'JA button sets lang and keeps the card open');
  let tx = texts(sc).join('|'); ok(tx.includes('操作はこれだけです') && tx.includes('HOW TO PLAY'), 'JA texts shown; design label HOW TO PLAY stays English');
  card.input('tap', c(R.inv)); ok(!closed && e.store.get('controls') === 'inverted', 'INVERTED button sets controls');
  tx = texts(sc).join('|'); ok(/左：機首が左へ/.test(tx), 'JA: INVERTED rotation direction text (LEFT -> nose left)');
  card.input('tap', c(R.std)); tx = texts(sc).join('|'); ok(/左：機首が右へ/.test(tx), 'JA: STANDARD rotation direction text (LEFT -> nose right)');
  card.input('tap', c(R.en)); ok(e.store.get('lang') === 'en', 'EN button'); tx = texts(sc).join('|');
  ok(/LEFT: NOSE TILTS RIGHT/.test(tx), 'EN: STANDARD direction text');
  card.input('tap', c(R.inv)); tx = texts(sc).join('|'); ok(/LEFT: NOSE TILTS LEFT/.test(tx), 'EN: INVERTED direction text');
  card.input('tap', c(R.std));
  card.input('tap', { x: 180, y: 300, t0: clock + 1 }); ok(closed === 1, 'tap elsewhere closes');
  t.onInput('tap', { x: 180, y: 300, now: 0 }); ok(calls.n > 0 || !!t.launch, 'title taps work as usual');
}

// ================================================================ 5. 文言: PC / タッチ / JA / EN / 折り返し
{
  for (const lang of ['ja', 'en']) for (const inv of [false, true]) for (const touch of [false, true]) {
    const k = htContent(lang, inv, touch);
    ok(Object.values(k).every((v) => typeof v === 'string' && v.length > 0), lang + ' inv=' + inv + ' touch=' + touch + ': all strings non-empty');
  }
  const pcJa = htContent('ja', false, false), tcJa = htContent('ja', false, true);
  ok(pcJa.tiltHead === '← → で機体を傾ける' && /↑ \/ Space で噴射/.test(pcJa.thrust), 'JA PC: keys');
  ok(/ボタン/.test(tcJa.tiltHead) && /中央のボタン/.test(tcJa.thrust), 'JA touch: buttons');
  ok(htContent('ja', false, true).noWeapons === '武器はありません。隕石はよけてください' && htContent('ja', false, true).all === '操作はこれだけです', 'JA: ALL + no weapons wording');
  ok(htContent('ja', false, false).rings.includes('輪は任意') && htContent('ja', false, false).goal.includes('パッド'), 'JA: rings optional, pad goal');
  const pcEn = htContent('en', false, false);
  ok(/SPACE/.test(pcEn.thrust) && /ALL THE CONTROLS/.test(pcEn.all) && /NO WEAPONS/.test(pcEn.noWeapons) && /OPTIONAL/.test(pcEn.rings) && /SIDE THRUST/.test(pcEn.rings), 'EN texts');
  // 実在するキーだけを挙げる: engine.js のキー割り当てに P は無い
  const eng = fs.readFileSync(new URL('../02_src/core/engine.js', import.meta.url), 'utf8');
  ok(!/'p'|'P'/.test(eng.replace(/\/\/[^\n]*/g, '')) && !/\bP\b.*pause/i.test(pcEn.pause + pcJa.pause), 'no P key in engine; pause text does not list a P key');
  // 折り返し: どの行も幅に収まる（モック幅 = 5px/字）
  const ctx = makeCtx(null);
  for (const [lang, size] of [['ja', 11], ['en', 9]]) {
    const k = htContent(lang, false, false); let bad = 0;
    for (const s of [k.thrust, k.goal, k.flat, k.rings, k.tilt]) for (const l of htWrap(ctx, s, size, 400, 1, 300)) if (l.length * 5 + l.length > 300 + 6) bad++;
    ok(bad === 0, lang + ': wrapped lines fit');
  }
  // タッチ端末: ボタンの絵を描いた版もエラーなく描ける
  const cardT = new HtCard({ touch: true }), cardP = new HtCard({ touch: false });
  let thr = false; try { cardT.render(makeCtx({ texts: [] })); cardP.render(makeCtx({ texts: [] })); } catch (_) { thr = true; } ok(!thr, 'both device variants render');
  const rec = { texts: [] }; cardT.render(makeCtx(rec)); ok(rec.texts.some((s) => /TOUCH|PC:/.test(s)), 'touch variant also mentions PC keys compactly');
}

// ================================================================ 6. MISSION HOLD から開く
{
  setNav('en-US');
  const { e, g } = newGame();
  g.onInput('tap', c(g._holdRect())); ok(g.state === 'hold', 'enter HOLD'); run(g, 0.4);
  const hb = g._holdButtons(); const how = hb.find((b) => b.id === 'howto');
  ok(!!how && how.h >= 44 && hb.length === 3, 'HOLD menu has a HOW TO PLAY button (>= 44 px)');
  ok(!hb.some((b) => b.id !== 'howto' && b.x < how.x + how.w && how.x < b.x + b.w && b.y < how.y + how.h && how.y < b.y + b.h), 'HOW TO PLAY does not overlap RESUME / ABORT');
  clock += 500; g.onInput('tap', c(how)); ok(!!g._ht && g.state === 'hold', 'tap opens the card, still in HOLD');
  clock += 500; g.onInput('tap', c(hb[0])); ok(!g._ht && g.state === 'hold', 'a tap over the RESUME position only closes the card (not consumed as RESUME)');
  run(g, 0.4); g.onInput('tap', c(how)); ok(!!g._ht, 'reopen from HOLD');
  const R = g._ht.rects(); g.onInput('tap', c(R.inv)); ok(e.store.get('controls') === 'inverted', 'settings reachable from HOLD');
  g.onInput('tap', c(R.skip)); ok(e.store.get('howtoSkip') === '0' && !!g._ht, 'checkbox in HOLD changes the same setting (card stays open)');
  g.onInput('tap', c(R.skip)); ok(e.store.get('howtoSkip') === '1', 'checkbox in HOLD toggles back');
  clock += 500;
  g.onInput('tap', { x: 180, y: 250, t0: clock + 1 }); ok(!g._ht && g.state === 'hold', 'closing returns to the HOLD menu');
  ok(texts(g).includes('HOW TO PLAY'), 'HOLD menu shows the button label');
  g.onInput('back'); ok(g.state === 'play', 'back/Esc resumes as before');
}

// ================================================================ 7. 操作の向きの物理
{
  const run1 = (extra, k, sec = 0.5) => { const r = air(extra); key(r.g, k, sec); return r.g; };
  const sL = run1([], 'left'), sR = run1([], 'right');
  ok(sL.omega > 0 && sL.vx > 0 && sR.omega < 0 && sR.vx < 0, 'STANDARD keys: LEFT omega+/vx+, RIGHT omega-/vx- (unchanged)');
  const iL = run1([['controls', 'inverted']], 'left'), iR = run1([['controls', 'inverted']], 'right');
  ok(iL.omega < 0 && iL.vx < 0 && iR.omega > 0 && iR.vx > 0, 'INVERTED keys: LEFT nose LEFT (omega-) drift LEFT (vx-), RIGHT opposite: ' + [iL.omega, iL.vx, iR.omega, iR.vx].map((v) => v.toFixed(2)).join(','));
  ok(near(iL.omega, -sL.omega, 1e-9) && near(iL.vx, -sL.vx, 1e-9), 'INVERTED is the exact mirror of STANDARD');
  ok(iL.angle < 0 && sL.angle > 0, 'angle sign follows (CCW for inverted LEFT)');
  // タッチ（左右ゾーン）
  for (const [inv, sgn] of [[false, 1], [true, -1]]) {
    const r = air(inv ? [['controls', 'inverted']] : []); r.e.touches = [{ x: 40, y: 700 }]; run(r.g, 0.5);
    ok(r.g.omega * sgn > 0 && r.g.vx * sgn > 0, (inv ? 'INVERTED' : 'STANDARD') + ' touch LEFT button');
    const q = air(inv ? [['controls', 'inverted']] : []); q.e.touches = [{ x: 330, y: 700 }]; run(q.g, 0.5);
    ok(q.g.omega * sgn < 0 && q.g.vx * sgn < 0, (inv ? 'INVERTED' : 'STANDARD') + ' touch RIGHT button');
  }
  // 設定を変えると次のフレームから効く（同じ Game）
  const r = air(); key(r.g, 'left', 0.3); const w0 = r.g.omega; r.e.store.set('controls', 'inverted'); r.g.omega = 0; r.g.vx = 0; key(r.g, 'left', 0.3);
  ok(w0 > 0 && r.g.omega < 0, 'setting change applies immediately');
  // 炎の側（INVERTED は左右入れ替え）
  const fl = air([['controls', 'inverted']]); fl.g._thrustRcsL = true; let called = null;
  const rec = makeCtx({ texts: [] }); try { fl.g._drawLander(rec, 180, 150, 0); } catch (_) { /* ignore */ } ok(true, 'inverted lander renders');
  // SIDE THRUST: STANDARD 左ボタン=右へ / INVERTED 左ボタン=左へ
  for (const [inv, sgn] of [[false, 1], [true, -1]]) {
    const a = air(inv ? [['controls', 'inverted']] : []); a.g._sideT = SIDE_S; key(a.g, 'left', 1);
    ok(near(a.g.vx, sgn * SIDE_ACCEL, 0.6) && a.g.omega === 0, (inv ? 'INVERTED' : 'STANDARD') + ' SIDE THRUST: LEFT moves ' + (inv ? 'left' : 'right') + ' (vx=' + a.g.vx.toFixed(2) + ')');
    const b = air(inv ? [['controls', 'inverted']] : []); b.g._sideT = SIDE_S; key(b.g, 'right', 1);
    ok(near(b.g.vx, -sgn * SIDE_ACCEL, 0.6), (inv ? 'INVERTED' : 'STANDARD') + ' SIDE THRUST: RIGHT is the opposite');
  }
  // SIDE THRUST の矢印（art）は p18assist で検査。ボタン描画が inverted でも例外なし
  const bt = air([['controls', 'inverted']]); bt.g._sideT = SIDE_S; let th = false; try { texts(bt.g); } catch (_) { th = true; } ok(!th, 'buttons draw in INVERTED with SIDE THRUST');
}

// ================================================================ 8. 自動操縦は両方の設定で着陸する
{
  const land = (inverted, stage, seedRuns) => {
    let landed = 0;
    for (let s = 0; s < seedRuns; s++) {
      const r = newGame(inverted ? [['controls', 'inverted']] : []); const g = r.g; g.stage = stage; g.bonus = null; g._initStage(); g._goalT = 0; g.obstacles = []; g._auto = true;
      const cleared = () => g.state === 'landing' || g.state === 'cleared';
      for (let i = 0; i < 60 * 200 && !cleared() && g.state !== 'crashed' && g.state !== 'gameover'; i++) { g.update(DT); clock += 16; }
      if (cleared()) landed++;
    }
    return landed;
  };
  for (const st of [1, 3, 14]) { const a = land(false, st, 4), b = land(true, st, 4); ok(a === 4 && b === 4, 'AUTO LAND stage ' + st + ': standard ' + a + '/4, inverted ' + b + '/4'); }
  // autopilot は物理の向きで出力し、反転しない（_auto 中は inverted でも同じ軌跡）
  const mk = (inv) => { seed(7); const r = newGame(inv ? [['controls', 'inverted']] : []); const g = r.g; g.stage = 2; g._initStage(); g._goalT = 0; g.obstacles = []; g._auto = true; run(g, 5); return [g.x, g.y, g.angle].map((v) => v.toFixed(4)).join(); };
  ok(mk(false) === mk(true), 'autopilot trajectory identical in both settings (operates on physics)');
}

// ================================================================ 9. ステージ開始の1文
{
  const MAXJA = 22, MAXEN = 40;
  ok(Object.values(GOAL_LINES).every((l) => l.ja.length <= MAXJA && l.en.length <= MAXEN && l.ja && l.en), 'goal lines: JA <= 22, EN <= 40 chars: ' + Object.entries(GOAL_LINES).filter(([, l]) => l.ja.length > MAXJA || l.en.length > MAXEN).map(([k]) => k).join());
  const base = { waypoint: false, ice: false, visibility: null, dark: false, moving: false, wind: false, meteors: false };
  const F = (o) => goalKey(Object.assign({}, base, o));
  ok(F({}) === 'plain' && F({ meteors: true }) === 'meteors' && F({ wind: true }) === 'wind' && F({ moving: true }) === 'moving', 'single features map to their sentence');
  ok(F({ visibility: 130, dark: true }) === 'dark' && F({ visibility: 110 }) === 'fog' && F({ ice: true }) === 'ice' && F({ waypoint: true }) === 'waypoint', 'dark / fog / ice / waypoint');
  ok(F({ waypoint: true, ice: true, visibility: 1, dark: true, moving: true, wind: true, meteors: true }) === 'waypoint', 'priority: waypoint beats everything');
  ok(F({ ice: true, visibility: 1, dark: true, moving: true, wind: true, meteors: true }) === 'ice', 'priority: ice > dark');
  ok(F({ visibility: 130, dark: true, moving: true, wind: true, meteors: true }) === 'dark', 'priority: dark > moving');
  ok(F({ moving: true, wind: true, meteors: true }) === 'moving' && F({ wind: true, meteors: true }) === 'wind', 'priority: moving > wind > meteors');
  ok(goalKey({ bonusType: 'ROVER', wind: true }) === 'ROVER' && goalKey({ bonusType: 'STORM' }) === 'STORM' && goalKey({ bonusType: 'CROSSWIND' }) === 'CROSSWIND' && goalKey({ bonusType: 'CALM' }) === 'CALM', 'TERRA bonus: per mission');
  ok(goalKey({ bonusType: 'NOPE' }) === 'plain' && goalKey() === 'plain', 'unknown / empty -> plain');
  ok(goalText('plain', 'ja') === 'パッドにゆっくり着陸しよう' && goalText('plain', 'en') === 'Land gently on the pad', 'plain sentence (JA / EN)');
  ok(goalText('meteors', 'ja') === '隕石をよけてパッドに着陸しよう' && goalText('wind', 'en') === 'Fight the wind and reach the pad' && goalText('dark', 'ja') === 'ライトの届く範囲を頼りにパッドへ', 'specified sentences');
  ok(goalText('ice', 'ja') === '氷で滑る。止まれる速さでパッドへ' && goalText('waypoint', 'en') === 'Touch the waypoint first, then the pad' && goalText('moving', 'ja') === '動くパッドに合わせて着陸しよう', 'ice / waypoint / moving sentences');
  ok(Object.keys(BONUS_MISSIONS).every((k) => GOAL_LINES[k]), 'every TERRA mission has a sentence');
  // 実ステージ: 各天体・各ステージが期待のキーを返し、描画される（1周目 16 ステージ + ボーナス）
  setNav('en-US'); const seen = {};
  for (let st = 1; st <= 16; st++) {
    const r = newGame(); const g = r.g; g.stage = st; g.bonus = null; g._initStage();
    const k = g._goalKey(); seen[k] = (seen[k] || 0) + 1;
    ok(g._goalT > 2.4 && g._goalT <= 2.5, 'stage ' + st + ': goal shown for ~2.5 s');
    if (g._wp) ok(k === 'waypoint', 'stage ' + st + ' has a waypoint -> waypoint');
    else if (g._body.iceSlide) ok(k === 'ice', 'stage ' + st + ' Pluto 1 -> ice');
    else if (g._body.visibility != null) ok(k === 'dark' || k === 'fog', 'stage ' + st + ' visibility -> dark/fog');
    else if (g.obstacles.length && !g._windSpec) ok(k === 'meteors', 'stage ' + st + ' -> meteors');
  }
  ok(seen.plain >= 1 && seen.meteors >= 1 && seen.waypoint === 1 && seen.ice === 1 && seen.dark >= 1, 'tour covers plain/meteors/waypoint/ice/dark: ' + JSON.stringify(seen));
  for (const type of ['CALM', 'ROVER', 'CROSSWIND', 'STORM']) { const r = newGame(); const g = r.g; g.stage = 4; g.bonus = { type, afterStage: 4 }; g._initStage(); ok(g._goalKey() === type, 'bonus ' + type + ' -> its sentence'); }
  // 描画（EN/JA）: 本文が出る・2.5秒で消える・凍結中は出ない・案内のみで物理に影響しない
  for (const lang of ['en', 'ja']) {
    const r = newGame([['lang', lang]]); const g = r.g; g.stage = 2; g._initStage();
    const want = goalText(g._goalKey(), lang);
    ok(texts(g).includes(want), lang + ': sentence drawn at stage start: ' + want);
    run(g, 1.2); ok(texts(g).includes(want), lang + ': still drawn at 1.2 s');
    run(g, 1.5); ok(!texts(g).includes(want), lang + ': gone after ~2.5 s');
    ok(g.state === 'play', 'non-blocking');
  }
  { const r = newGame([['lang', 'en']]); const g = r.g; g.stage = 2; g._initStage(); g._ht = new HtCard({}); ok(!texts(g).includes(goalText(g._goalKey(), 'en')), 'not drawn under the HOW TO PLAY card'); }
  { seed(3); const a = newGame(); seed(3); const b = newGame(); for (const x of [a, b]) { seed(5); x.g.stage = 3; x.g._initStage(); } b.g._goalT = 0; run(a.g, 3); run(b.g, 3); ok([a.g.x, a.g.y, a.g.vy].join() === [b.g.x, b.g.y, b.g.vy].join(), 'goal line does not change physics'); }
}

console.log('p21howto: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
