// P5 HUD（計器ラベル・天体情報・パイロット名・初回ヒント）のテスト。実行: node 04_tests/p5hud.mjs
import { Game } from '../02_src/game.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { addProfile } from '../02_src/ranking.js';
import { drawHUD, fitText, HUD_LAYOUT, HUD_LABELS, hudInfoText } from '../02_src/art.js';
import { BODIES } from '../02_src/bodies.js';
import { MODULE_DEFS } from '../02_src/modules.js';
import { W } from '../02_src/core/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
globalThis.fetch = () => Promise.resolve({ ok: true, status: 200, json: async () => ({}) });
setDebug(false); __setRelayUrl('');

// 実寸に近い測定（ASCII=0.6em, 全角=1em）。描画した 1 文字ごとの外接矩形を保守的に（ASCII 0.75em, 全角 1em）記録する
const sizeOf = (f) => { const m = /(\d+(?:\.\d+)?)px/.exec(f || ''); return m ? parseFloat(m[1]) : 10; };
const cw = (ch, size) => ch.charCodeAt(0) > 255 ? size : size * 0.6;
function makeCtx(st) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px x', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left' };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'save') return () => { st.depth++; };
      if (k === 'restore') return () => { st.depth--; };
      if (k === 'measureText') return (s) => ({ width: String(s).split('').reduce((a, ch) => a + cw(ch, sizeOf(t.font)), 0) });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s, x, y) => {
        s = String(s); st.texts.push(s);
        const size = sizeOf(t.font);
        for (const ch of Array.from(s)) {
          if (ch === ' ') continue;
          const w = ch.charCodeAt(0) > 255 ? size : size * 0.75;
          const left = t.textAlign === 'center' ? x - w / 2 : t.textAlign === 'right' ? x - w : x;
          st.glyphs.push({ ch, x: left, y, w, h: size });
        }
      };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function makeEngine(seen = true) {
  const store = new Map(seen ? [['hudTipSeen', '1'], ['howtoSkip', '1']] : [['howtoSkip', '1']]);   // beta.7: HOW TO PLAY はスキップ設定済み（毎回表示の流れは p21howto で検査）
  const log = [];
  return {
    music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop } },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); log.push(k); } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 }, _store: store, _log: log,
  };
}
function newGame(seen = true, setup) { const e = makeEngine(seen); if (setup) setup(e); const g = new Game(e); g.enter(); return g; }
const run = (g, sec) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { g.update(DT); clock += 16; } };
const render = (g) => { const st = { depth: 0, texts: [], glyphs: [] }; try { g.render(makeCtx(st)); } catch (e) { console.log('render threw', e && e.stack); return null; } return st.depth === 0 ? st : null; };
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const tapAt = (g, p) => { clock += 10; g.onInput('tap', { x: p.x, y: p.y, t0: clock - 50 }); };
const snap = (g) => JSON.stringify({ x: g.x, y: g.y, vx: g.vx, vy: g.vy, a: g.angle, o: g.omega, f: g.fuel, c: g._clock, ob: g.obstacles && g.obstacles.map((o) => [o.x, o.y]), w: g._windAccel, intro: g._introT });
const LONG_A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789ABCDEFGHIJ';
const LONG_J = 'あいうえおかきくけこさしすせそたちつてとなにぬねの';
const NAMES = ['', 'Neo', 'WWWWWWWWWWWWWWWWWWWW', LONG_A, LONG_J, 'みやざきじゅんじ MIYA'];

// ---------- 1. 文言・値 ----------
{
  const moon = BODIES[0], venus = BODIES[5];
  ok(hudInfoText({ realG: moon.realG, atmoTag: moon.atmoTag }) === 'g 1.62 m/s²  ·  NO ATMOSPHERE', 'moon info text: ' + hudInfoText({ realG: moon.realG, atmoTag: moon.atmoTag }));
  ok(/^g 8\.87 m\/s²  ·  EXTREME/.test(hudInfoText({ realG: venus.realG, atmoTag: venus.atmoTag })), 'venus info text');
  ok(HUD_LABELS.join() === 'DESCENT,DRIFT,TILT,SPIN', 'labels');
  const g = newGame(true, (e) => addProfile(e.storage, 'Neo'));
  const st = render(g);
  ok(st && ['DESCENT', 'DRIFT', 'TILT', 'SPIN'].every((w) => st.texts.join('').includes(w.split('').join(''))), 'instrument labels drawn');
  ok(st.texts.join('').replace(/ /g, '').includes('NOATMOSPHERE'), 'moon: NO ATMOSPHERE drawn');
  ok(st.texts.join('').includes('PILOT') && st.texts.join('').includes('Neo'), 'pilot drawn');
  // fitText
  const c = makeCtx({ depth: 0, texts: [], glyphs: [] });
  const f = fitText(c, LONG_J, 60, 8, 0.5, 500);
  ok(f.endsWith('…') && f.length < LONG_J.length, 'fitText truncates JP with ellipsis: ' + f);
  ok(fitText(c, 'Neo', 60, 8, 0.5, 500) === 'Neo', 'fitText keeps short');
}

// ---------- 2. 全天体 × 全状態 × 長い名前で例外なし・重なりなし ----------
function boxesFor(g) {
  const L = HUD_LAYOUT;
  const bk = { x: 6, y: 8, w: 42, h: 36 };
  return {
    back: bk, mute: g._muteRect(), hold: g._holdRect(), dbg: g._dbgBtnRect(),
    debugTag: { x: 178, y: 8, w: 52, h: 9 },
    info: { x: L.info.x, y: L.info.y, w: L.info.maxW, h: L.info.size + 2 },
    wind: { x: L.wind.x, y: L.wind.y, w: 100, h: 9 },
    pilot: { x: L.pilot.right - L.pilot.maxW, y: L.pilot.y, w: L.pilot.maxW, h: L.pilot.size + 2 },
    row: L.row,
  };
}
{
  const g0 = newGame(true); const B = boxesFor(g0);
  // 固定要素との非重複（レイアウト）
  const names = ['info', 'wind', 'pilot'];
  for (const n of names) for (const o of ['back', 'mute', 'hold', 'debugTag']) ok(!overlap(B[n], B[o]), n + ' vs ' + o + ' (layout)');
  ok(!overlap(B.info, B.wind) && !overlap(B.info, B.pilot) && !overlap(B.wind, B.pilot), 'info/wind/pilot mutually disjoint');
  for (const n of names) ok(!overlap(B[n], B.row), n + ' vs instrument row');
  ok(!overlap(B.wind, B.dbg) && !overlap(B.info, B.dbg) && !overlap(B.pilot, B.dbg), 'new texts vs DBG');
  ok(B.wind.x + B.wind.w < B.dbg.x, 'wind right edge left of DBG');
  ok(B.pilot.x > B.hold.x + B.hold.w && B.pilot.x > B.debugTag.x + B.debugTag.w, 'pilot is right of HOLD/DEBUG');
  ok(B.row.y + B.row.h <= B.info.y, 'row above info line');
}
const states = ['play', 'landing', 'cleared', 'crashed', 'bonusfailed', 'gameover', 'hold', 'debug'];
let renders = 0, overlaps = 0;
for (const dbg of [false, true]) {
  setDebug(dbg);
  for (const nm of NAMES) {
    for (let bi = 0; bi < BODIES.length; bi++) {
      for (const bonus of [false, true]) {
        const g = newGame(true, (e) => { if (nm) addProfile(e.storage, nm); });
        g.stage = 1 + bi * 2 + (bi % 2); g.modules = { fuel: 2, stab: 2, shock: 2, radar: 1, shield: 1 };
        if (bonus) g.bonus = { type: 'STORM', afterStage: g.stage };   // P6: 風ありのボーナス（旧 MOVING_PAD は風なしの CALM/ROVER 相当になるため STORM で風ラベルとの非重複も検査）
        g._initStage(); if (g.state === 'tip') g._endTip();
        // 状態ごとに描画
        for (const s of states) {
          const g2 = g;
          if (s === 'play') { g2.state = 'play'; }
          else if (s === 'landing') { g2.state = 'play'; g2.x = g2.pad.x + g2.pad.w / 2; g2.y = g2._terrainYAt(g2.x) - 16; try { g2._doSuccess(0, 0); } catch (_) {} }
          else if (s === 'cleared' || s === 'crashed' || s === 'bonusfailed' || s === 'gameover') { g2.state = s; }
          else if (s === 'hold') { g2.state = 'play'; g2._enterHold(); }
          else if (s === 'debug') { g2.state = 'play'; g2._dbgPrev = 'play'; g2.state = 'debug'; }
          const st = render(g2); renders++;
          ok(!!st, `render ok body=${BODIES[bi].id} state=${s} name=${nm.slice(0, 6)} dbg=${dbg} bonus=${bonus}`);
          if (s === 'play' && st) {
            const B = boxesFor(g2);
            // 計測行ラベル等を含む HUD の全グリフ: 左上 BACK ボタン内/ HOLD / ミュート / (DBG時)DBG に侵入しない。画面外にも出ない
            const hudGl = st.glyphs.filter((q) => q.y < 106);
            for (const q of hudGl) {
              for (const key of ['back', 'mute', 'hold']) {
                if (overlap(q, B[key])) { overlaps++; ok(false, `glyph '${q.ch}'@${q.x.toFixed(0)},${q.y} overlaps ${key} (${BODIES[bi].id}, '${nm.slice(0, 6)}')`); }
              }
              if (dbg && overlap(q, B.dbg) && !'DBG'.includes(q.ch)) { overlaps++; ok(false, `glyph '${q.ch}' (not the DBG label) overlaps DBG`); }
              if (q.x < 0 || q.x + q.w > W) { overlaps++; ok(false, `glyph '${q.ch}'@${q.x.toFixed(0)} outside screen (${nm.slice(0, 6)})`); }
            }
            // パイロット名: 右寄せの枠 [pilot.x, 右端] の内側
            const pg = st.glyphs.filter((q) => q.y >= HUD_LAYOUT.pilot.y - 1 && q.y <= HUD_LAYOUT.pilot.y + 1);
            for (const q of pg) if (q.x < B.pilot.x - 0.01 || q.x + q.w > HUD_LAYOUT.pilot.right + 2) ok(false, `pilot glyph out of box '${q.ch}' x=${q.x.toFixed(1)}`);
            // 情報行は info 枠内 / 風ラベルは wind 枠内
            const ig = st.glyphs.filter((q) => q.y >= HUD_LAYOUT.info.y - 1 && q.y <= HUD_LAYOUT.info.y + 1 && q.x < HUD_LAYOUT.wind.x - 1);
            for (const q of ig) if (q.x + q.w > HUD_LAYOUT.info.x + HUD_LAYOUT.info.maxW + 1) ok(false, `info glyph beyond maxW '${q.ch}'`);
            if (g2._windSpec) {
              const info = st.glyphs.filter((q) => Math.abs(q.y - HUD_LAYOUT.info.y) < 1.5 && q.x < HUD_LAYOUT.wind.x);
              const mx = info.length ? Math.max(...info.map((q) => q.x + q.w)) : 0;
              ok(mx <= HUD_LAYOUT.wind.x, `info text clears wind label (${BODIES[bi].id}) maxX=${mx.toFixed(1)}`);
            }
          }
          g.state = 'play';
        }
      }
    }
  }
}
setDebug(false);
ok(overlaps === 0, 'no overlap/overflow found over ' + renders + ' renders');

// ---------- 3. 初回ヒント ----------
{
  const g = newGame(false);
  ok(g.state === 'tip', 'first run: tip shown (state=' + g.state + ')');
  ok(g.engine._store.get('hudTipSeen') === '1', 'hudTipSeen flag stored');
  const st = render(g);
  ok(st && st.texts.join('').replace(/ /g, '').includes('KEEPTHEMWHITE') && st.texts.join('').replace(/ /g, '').includes('TAPTOSTART'), 'tip text rendered');
  // 物理凍結（2 秒）
  const s0 = snap(g); run(g, 2); ok(snap(g) === s0 && g.state === 'tip', 'tip: physics frozen for 2 s');
  // 出現前から押していた指の解除・直後 0.3 秒のタップは無視
  g._inputLock = 0.3; clock += 5;
  g.onInput('tap', { x: 180, y: 300, t0: g._overlayAt - 100 }); ok(g.state === 'tip', 'tip: stale t0 release ignored');
  g.onInput('tap', { x: 180, y: 300, t0: clock }); ok(g.state === 'tip', 'tip: tap during 0.3 s lock ignored');
  run(g, 0.4);
  // ミュート/HOLD の位置をタップしても閉じるだけで、それらは作動しない
  const holdC = { x: g._holdRect().x + 10, y: g._holdRect().y + 10 };
  const fuel0 = g.fuel;
  tapAt(g, holdC); ok(g.state === 'play', 'tip dismissed by tap (state=' + g.state + ')');
  ok(g.state !== 'hold', 'tip tap on HOLD does not enter hold');
  // 押しっぱなし(下部の推力ゾーン)でもグレース中は推力なし
  g.engine.touches = [{ id: 1, x: 180, y: 600 }]; g.engine.pointer = { down: true, x: 180, y: 600 };
  run(g, 0.3); ok(g.fuel === fuel0 && !g._thrustMain, 'no thruster fire right after dismissal (grace)');
  run(g, 0.4); ok(g.fuel < fuel0, 'thrust works after grace');
  g.engine.touches = []; g.engine.pointer = { down: false, x: 0, y: 0 };
  // 2 回目: 出ない
  const g2 = newGame(false, (e) => e._store.set('hudTipSeen', '1')); ok(g2.state === 'play', 'tip not shown again when flag set');
  // 自動で閉じる（約 4 秒）
  const g3 = newGame(false); run(g3, 3.7); ok(g3.state === 'tip', 'tip still up at 3.7 s'); run(g3, 0.5); ok(g3.state === 'play', 'tip auto-dismisses by ~4 s');
  // 別の Game インスタンス（同じ storage）でも再表示しない
  const e = makeEngine(false); const a = new Game(e); a.enter(); const b = new Game(e); b.enter();
  ok(a.state === 'tip' && b.state === 'play', 'same storage: shown once only');
  // tip 中の hidden/ back で壊れない
  const g4 = newGame(false); g4.onHidden(); ok(g4.state === 'tip', 'onHidden during tip does not hold'); g4.onInput('back'); ok(render(g4) !== null, 'render after back during tip');
  // 後続ステージでは出ない
  g3._initStage(); ok(g3.state === 'play', 'tip never in later stages');
  // ブロックされた storage でも例外なし
  const eb = makeEngine(false); eb.storage.get = () => { throw new Error('blocked'); }; eb.storage.set = () => { throw new Error('blocked'); };
  let threw = false; try { const gb = new Game(eb); gb.enter(); run(gb, 5); render(gb); } catch (_) { threw = true; } ok(!threw, 'blocked storage: no throw');
}
console.log(`p5hud: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
