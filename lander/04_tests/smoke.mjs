// LANDER ヘッドレス・スモークテスト（canvas不要）。実行: node 04_tests/smoke.mjs
// 目的: update()/render() が例外なく回ること、基本状態遷移の確認。機能追加ごとにケースを足す。
import { Game } from '../02_src/game.js';
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => {
  if (k === 'measureText') return () => ({ width: 10 });
  if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
  return noop; }, set: () => true });
const store = new Map();
const engine = {
  ctx, audio: new Proxy({}, { get: () => noop }),
  storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
  text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 },
};
let pass = 0, fail = 0;
export const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

const g = new Game(engine); g.enter();
let threw = null;
try { for (let i = 0; i < 600; i++) { g.update(1 / 60); g.render(ctx); } } catch (e) { threw = e; }
ok(!threw, 'update/render 600 frames without exception: ' + (threw && threw.stack));
ok(['play', 'cleared', 'gameover'].includes(g.state), 'state valid: ' + g.state);

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
