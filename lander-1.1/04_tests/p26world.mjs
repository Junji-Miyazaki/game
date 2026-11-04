// p26world — beta.9: 世界ランキングへの送信（ステージクリアごと・途中でやめた時・GAME OVER、20 秒制限の再送）。実行: node 04_tests/p26world.mjs（lander-1.1/ から）
import './p10setup.mjs';
import { Game } from '../02_src/game.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { WorldNet } from '../02_src/ranking.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('https://relay.invalid');   // 送信は WorldNet.submit の差し替えで受ける（ネットワークなし）
const sent = []; let resp = () => ({ ok: true, status: 200 });
WorldNet.submit = async (e) => { sent.push(e); return resp(e); };
WorldNet.fetchTop = async () => null;
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function makeEngine(store) {
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = noop;
  return { music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => true, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const KEY = '1'.repeat(64);
const base = (extra = []) => new Map([['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1'], ...extra]);
const withProf = () => base([['profiles', JSON.stringify([{ name: 'AAA', key: KEY }])], ['activeProfile', 'AAA']]);
const land = (g) => { g.obstacles = []; g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._doSuccess(0, 0); };

// ===== 1. ステージクリアごとに送る（このランの最高より高い時だけ）=====
{
  sent.length = 0;
  const g = new Game(makeEngine(withProf())); g.enter();
  land(g); await flush();
  ok(sent.length === 1 && sent[0].score === g.totalScore && sent[0].name === 'AAA' && sent[0].key === KEY && sent[0].stage === 1, 'stage clear → sent with the pilot key: ' + JSON.stringify(sent[0] && { s: sent[0].score, st: sent[0].stage }));
  g.stage = 2; g._initStage(); land(g); await flush();
  ok(sent.length === 2 && sent[1].score === g.totalScore && sent[1].score > sent[0].score && sent[1].stage === 2, 'next clear → sent again (higher)');
  // 途中でやめる: 同じ合計なら送らない
  g.state = 'play'; g.exit(); await flush(); ok(sent.length === 2, 'quit with no new points: not resent');
  g.totalScore += 100; g.exit(); await flush(); ok(sent.length === 3 && sent[2].score === g.totalScore, 'quit with more points: sent');
}

// ===== 2. 途中でタイトルへ戻った時（クリア前に送れていなかった分）=====
{
  sent.length = 0;
  const g = new Game(makeEngine(withProf())); g.enter();
  g.totalScore = 1234; g.state = 'crashed'; g.exit(); await flush();
  ok(sent.length === 1 && sent[0].score === 1234, 'BACK to the title mid-run → current total sent');
  const g0 = new Game(makeEngine(withProf())); g0.enter(); g0.exit(); await flush(); ok(sent.length === 1, '0 points → nothing sent');
}

// ===== 3. GAME OVER は同じ点でも送る（称号の判定のため）、その後タイトルへ出ても重ねて送らない =====
{
  sent.length = 0;
  const g = new Game(makeEngine(withProf())); g.enter();
  land(g); await flush(); const n1 = sent.length;
  g._gameOver(); await flush();
  ok(n1 === 1 && sent.length === 2 && sent[1].score === sent[0].score, 'game over → sent (even if equal)');
  g.exit(); await flush(); ok(sent.length === 2, 'leaving the game-over screen: no extra send');
}

// ===== 4. 失敗したら次の機会に送り直す / 20 秒制限は 1 回待って再送 =====
{
  sent.length = 0; resp = () => ({ ok: false, error: 'timeout' });
  const g = new Game(makeEngine(withProf())); g.enter();
  land(g); await flush(); ok(sent.length === 1 && !g._worldSent, 'failed send: not marked as sent');
  resp = () => ({ ok: true, status: 200 });
  g.state = 'play'; g.exit(); await flush(); ok(sent.length === 2 && g._worldSent === g.totalScore, 'resent on the next chance');
  // 429 → setTimeout の後にもう一度
  sent.length = 0; let n429 = 0; resp = () => (n429++ === 0 ? { ok: false, status: 429 } : { ok: true, status: 200 });
  const waits = []; const st0 = globalThis.setTimeout; globalThis.setTimeout = (f, ms) => { waits.push(ms); return st0(f, 0); };
  const g2 = new Game(makeEngine(withProf())); g2.enter(); land(g2);
  await new Promise((r) => st0(r, 20)); await flush();
  globalThis.setTimeout = st0;
  ok(sent.length === 2 && waits.includes(21000) && g2._worldSent === g2.totalScore, 'rate limited → waits 21 s and resends once');
  resp = () => ({ ok: true, status: 200 });
}

// ===== 5. 送らない場合: パイロットの鍵なし・デバッグ・中継オフ =====
{
  sent.length = 0;
  const g = new Game(makeEngine(base())); g.enter(); land(g); g.state = 'play'; g.exit(); await flush();
  ok(sent.length === 0, 'no pilot key: stage clear / quit do not send');
  setDebug(true); const gd = new Game(makeEngine(withProf())); gd.enter(); land(gd); await flush(); setDebug(false);
  ok(sent.length === 0, 'debug run: nothing sent');
  __setRelayUrl(''); const go = new Game(makeEngine(withProf())); go.enter(); land(go); await flush(); __setRelayUrl('https://relay.invalid');
  ok(sent.length === 0, 'relay off: nothing sent');
}

console.log('p26world: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
