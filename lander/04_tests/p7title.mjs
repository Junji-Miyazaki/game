// p7title — タイトル画面の回帰テスト（ランキング一覧を閉じるタップが START に貫通しないこと）
// 実行: node 04_tests/p7title.mjs（lander/ から）
import { TitleScene, BootScene } from '../02_src/title.js';
import { __setRelayUrl as __r0 } from '../02_src/net.js'; __r0('');   // タイトルの WORLD #1 取得で実ネットワークに触れない

const noop = () => {};
const ctx = new Proxy({}, {
  get: (t, k) => {
    if (k === 'measureText') return () => ({ width: 10 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k in t) return t[k];
    return noop;
  },
  set: (t, k, v) => { t[k] = v; return true; },
});
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };

function makeEngine(store) {
  return {
    ctx, music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, duck: noop, tick: noop,
      sfx: { landing: noop, crash: noop, module: noop, launch: noop, uiTap: noop } },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock() { this.ctx = this.ctx || {}; } },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => store.set(k, String(v)) },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [],
  };
}
const profileStore = (extra = []) => new Map([
  ['hudTipSeen', '1'],
  ['profiles', JSON.stringify([{ name: 'TESTER', key: 'a'.repeat(64) }])],
  ['activeProfile', '0'],
  ...extra,
]);
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0 });
const started = (t, calls) => calls.n > 0 || !!t.launch;

// 1) チェックポイントなし：一覧を開く → 一覧上をタップ → 閉じるだけで開始しない → もう一度タップで開始
{
  const calls = { n: 0 };
  const t = new TitleScene(makeEngine(profileStore()), () => { calls.n++; }, { launch: true });
  t.enter(); t.update(0.016);
  ok(!!t.name, 'profile name loaded');
  t.onInput('tap', center(t.rankBtn));
  ok(t.showRank === true, 'RANKING opens the list');
  t.onInput('tap', { x: 180, y: 300, now: 0 });
  ok(t.showRank === false, 'tap on the open list closes it');
  ok(!started(t, calls), 'closing the list does NOT start the game');
  t.onInput('tap', { x: 180, y: 300, now: 0 });
  ok(started(t, calls), 'next tap (list closed) starts as before');
}
// 2) チェックポイントあり：一覧表示中に CONTINUE ボタン位置をタップしても閉じるだけ
{
  const cp = JSON.stringify({ v: 1, runId: 'r1', stage: 4, totalScore: 1234, continues: 2, modules: {}, name: 'TESTER', savedAt: '2026-10-25T00:00:00Z' });
  const calls = { n: 0 };
  const t = new TitleScene(makeEngine(profileStore([['checkpoint', cp]])), () => { calls.n++; }, { launch: true });
  t.enter(); t.update(0.016);
  if (t.cp && t.continueBtn) {
    t.onInput('tap', center(t.rankBtn));
    t.onInput('tap', center(t.continueBtn));
    ok(t.showRank === false && !started(t, calls), 'with a checkpoint, a tap on CONTINUE while the list is open only closes the list');
  } else ok(false, 'checkpoint UI not present (cp/continueBtn missing)');
}
// 3) キー操作（Enter / Back）でも一覧を閉じるだけ
{
  const calls = { n: 0 };
  const t = new TitleScene(makeEngine(profileStore()), () => { calls.n++; }, { launch: true });
  t.enter(); t.update(0.016);
  t.onInput('tap', center(t.rankBtn));
  t.onInput('confirm', {});
  ok(t.showRank === false && !started(t, calls), 'Enter closes the list without starting');
  t.onInput('tap', center(t.rankBtn));
  t.onInput('back', {});
  ok(t.showRank === false && !started(t, calls), 'Back closes the list without starting');
}
// 4) 一覧表示中の描画が例外を出さない
{
  const t = new TitleScene(makeEngine(profileStore()), noop, { launch: true });
  t.enter(); t.onInput('tap', center(t.rankBtn));
  let threw = null; try { for (let i = 0; i < 60; i++) { t.update(1 / 60); t.render(ctx); } } catch (e) { threw = e; }
  ok(!threw, 'render with the list open does not throw: ' + (threw && threw.stack));
}

// 5) 起動画面 TAP TO BEGIN：タップまで次へ進まない／1回のタップで1回だけ進む／その後のタイトルは音声有効なら即タイトル曲
{
  let n = 0;
  const e = makeEngine(profileStore());
  const b = new BootScene(e, () => { n++; });
  b.enter && b.enter();
  for (let i = 0; i < 120; i++) { b.update(1 / 60); b.render(ctx); }
  ok(n === 0, 'boot: does not advance without input');
  b.onInput('confirm', { repeat: true });
  ok(n === 0, 'boot: key auto-repeat does not advance');
  b.onInput('tap', { x: 180, y: 380, now: 0 });
  b.onInput('tap', { x: 180, y: 380, now: 0 });
  ok(n === 1, 'boot: first tap advances exactly once');
  ok(b.isRoot === true, 'boot: no BACK button');
  // エンジンはタップ時に audio.unlock() する → その直後のタイトル enter で曲が始まる
  let played = 0;
  const e2 = makeEngine(profileStore());
  e2.music.playTitle = () => { played++; };
  e2.audio.unlock();
  const t = new TitleScene(e2, noop, { launch: true }); t.enter();
  ok(played === 1, 'title music starts on enter when audio was unlocked by the boot tap');
}
console.log('p7title: ' + pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
