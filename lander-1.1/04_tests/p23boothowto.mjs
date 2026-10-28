// p23boothowto — 起動画面の HOW TO PLAY ボタン（ラン開始時と同じカード、設定・「次回から表示しない」共通）。実行: node 04_tests/p23boothowto.mjs
import './p10setup.mjs';
import { BootScene } from '../02_src/title.js';
import { htSkipGet } from '../02_src/howto.js';
import { W, H } from '../02_src/core/engine.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
function makeCtx(rec) {
  const st = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '' };
  return new Proxy(st, { get: (t, k) => {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'fillText') return (s, x, y) => rec.push({ s: String(s), x, y });
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
}
function eng(init = []) {
  const store = new Map([['lang', 'ja'], ...init]);
  return { started: false, store, audio: { unlock: noop }, storage: { get: (k, d = null) => (store.has(k) ? store.get(k) : d), set: (k, v) => { store.set(k, String(v)); return true; } } };
}
const mk = (init) => { const e = eng(init); const b = new BootScene(e, () => { e.started = true; }); return { e, b }; };
const shot = (b, t = 5) => { b.t = t; const rec = []; b.render(makeCtx(rec)); return rec; };
const tap = (b, x, y) => b.onInput('tap', { x, y, t0: Date.now() + 1e6 });

{
  const { e, b } = mk([['howtoSkip', '1']]);
  const L = b.newsLayout(), hb = L.howto, hh = L.howtoHit;
  const lbl = shot(b).find((t) => t.s === 'HOW TO PLAY');
  ok(!!lbl && lbl.y > L.bottom && lbl.y < H, 'HOW TO PLAY label drawn below the update frame (y=' + (lbl && lbl.y) + ')');
  ok(hh.h >= 44 && hh.y + hh.h <= H && hh.y > L.build.y + L.build.h - 2, 'hit box >= 44 px, below the build text, inside the screen');
  ok(hh.x <= hb.x && hh.x + hh.w >= hb.x + hb.w && hh.y <= hb.y && hh.y + hh.h >= hb.y + hb.h, 'hit box covers the button');
  ok(L.bottom < hh.y, 'does not overlap the update frame (frame bottom ' + L.bottom + ')');
  ok(L.view.h >= 100, 'update frame still has room (' + L.view.h + ')');
  // ボタンをタップ → カードが開き、開始しない
  tap(b, W / 2, hb.y + hb.h / 2);
  ok(!!b.ht && !e.started, 'tap opens the card and does not begin');
  ok(b.blocksBack() && !b.dragZone({ x: 100, y: 500 }), 'card open: back blocked, no news drag');
  const sc = b.scroll; b.onInput('down'); ok(b.scroll === sc, 'card open: keys do not scroll the news');
  // 「次回から表示しない」を外せる（ラン開始時と同じ設定）
  const R = b.ht.rects(); tap(b, R.skip.x + 10, R.skip.y + 10);
  ok(!htSkipGet(e.storage) && e.store.get('howtoSkip') === '0', 'unchecking "don\'t show" from the boot screen re-enables it');
  ok(!e.started && !!b.ht, 'still on the card');
  // 閉じる（ロック時間後のタップ）→ 起動画面に戻る。開始はしない
  b.ht.openedAt -= 5000; tap(b, 180, 300);
  ok(!b.ht && !e.started, 'tap closes the card, back on the boot screen');
  // 通常のタップは従来どおり開始
  tap(b, 180, 300); ok(e.started, 'a normal tap then begins');
}
{ // ボタン外（枠の中や上部）は開始のまま
  const { e, b } = mk(); tap(b, 180, 500); ok(e.started && !b.ht, 'tap on the news frame still begins');
}
console.log('p23boothowto: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
if (fail) process.exit(1);
