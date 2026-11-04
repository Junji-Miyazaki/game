// p25score — beta.9: クリアの得点は集計が合計に届くまで右上の得点・BEST に出さない。実行: node 04_tests/p25score.mjs（lander-1.1/ から）
import './p10setup.mjs';
import { Game } from '../02_src/game.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('');
function makeCtx(rec) {
  return new Proxy({ globalAlpha: 1 }, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s) => { rec.push(String(s)); };
      return k in t ? t[k] : noop;
    }, set: (t, k, v) => { t[k] = v; return true; } });
}
function makeEngine(store) {
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = noop;
  return { music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => Number(store.get('high') || 0), setHigh: (_, v) => { store.set('high', String(v)); return true; }, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const store = new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1'], ['profiles', JSON.stringify([{ name: 'AAA', key: '1'.repeat(64) }])], ['activeProfile', 'AAA']]);
const g = new Game(makeEngine(store)); g.enter(); g.obstacles = [];
g.totalScore = 500; g.high = 800;
g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._doSuccess(0, 0);
const add = g._stageScore, tot = g.totalScore;
ok(add > 300 && tot === 500 + add, 'stage score added to the run total: +' + add);
ok(g.state === 'landing' && g._scoreShown() === 500 && g._highShown() === 800, 'landing: HUD shows the old total and old BEST');
const hud = () => { g._drawHUD(makeCtx([])); return g._hud; };
ok(hud().total === 500 && hud().high === 800, 'HUD is given the old total and BEST');
let guard = 0; while (g.state === 'landing' && guard++ < 600) { g.update(1 / 60); clock += 16; }
ok(g.state === 'cleared' && g._scoreShown() === 500, 'clear screen opens, total not yet counted');
let seen = [g._scoreShown()], mono = true;
for (let i = 0; i < 600 && g._clearT < g._clearEnd(); i++) { g.update(1 / 60); clock += 16; const s = g._scoreShown(); if (s < seen[seen.length - 1]) mono = false; seen.push(s); }
ok(mono && seen.some((s) => s > 500 && s < tot), 'counts up together with the TOTAL line');
ok(g._scoreShown() === tot && g._highShown() === Math.max(800, tot) && hud().total === tot, 'after the tally: the new total and BEST');
const r = []; g._drawClearScreen(makeCtx(r)); ok(r.includes(String(tot)), 'clear panel TOTAL column matches');
g._nextAfterClear && g._nextAfterClear(); for (let i = 0; i < 5; i++) { g.update(1 / 60); clock += 16; }
ok(g._scoreShown() === g.totalScore, 'next stage: plain total');
console.log('p25score: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
