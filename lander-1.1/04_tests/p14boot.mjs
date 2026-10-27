// p14boot — 起動画面: UPDATE INFORMATION の枠・スクロール・ドラッグとタップの区別・NEW ピル・モノクロの版ラベル。実行: node 04_tests/p14boot.mjs
import './p10setup.mjs';
import { BootScene } from '../02_src/title.js';
import { WHATSNEW } from '../02_src/whatsnew.js';
import { APP_LABEL } from '../02_src/version.js';
import { drawBetaTag } from '../02_src/art.js';
import { P } from '../02_src/core/palette.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};

function makeCtx(rec) {
  const st = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '' };
  return new Proxy(st, { get: (t, k) => {
    if (k === 'measureText') return (s) => ({ width: String(s).length * 6 });
    if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
    if (k === 'fillText') return (s, x, y) => rec.push({ s: String(s), x, y, fill: t.fillStyle, font: t.font });
    return k in t ? t[k] : noop;
  }, set: (t, k, v) => { t[k] = v; return true; } });
}
function eng(init = []) {
  const store = new Map([['lang', 'ja'], ...init]);   // beta.6: UPDATE INFORMATION は設定の言語で表示。日本語の項目を検査するので ja にする
  return { started: false, store, audio: { unlock: noop }, storage: { get: (k, d = null) => (store.has(k) ? store.get(k) : d), set: (k, v) => { store.set(k, String(v)); return true; } } };
}
const mk = (init) => { const e = eng(init); const b = new BootScene(e, () => { e.started = true; }); return { e, b }; };
const shot = (b, t = 5) => { b.t = t; const rec = []; b.render(makeCtx(rec)); return rec; };
const isTeal = (c) => String(c).toLowerCase() === P().mid.toLowerCase();

// 1. NEW ピル: 未確認なら出る / タップ後（次回起動）は出ない
{
  let { e, b } = mk();
  ok(b.isNewVersion() && shot(b).some((t) => t.s === 'NEW'), 'unseen: NEW pill shown');
  b.onInput('tap', { x: 180, y: 300 });
  ok(e.started && e.store.get('seenVersion') === WHATSNEW.entries[0].version, 'tap begins and stores newest version');
  const b2 = new BootScene(e, noop);   // 同じ端末の次回起動
  ok(!b2.isNewVersion() && !shot(b2).some((t) => t.s === 'NEW'), 'next launch: no NEW pill');
  ok(shot(b2).some((t) => t.s === 'UPDATE INFORMATION'), 'next launch: heading still shown');
}

// 2. ピルは見出しの右（実測幅）。フォント幅が違っても重ならない
{
  for (const cw of [4, 5, 6, 8]) {
    const { b } = mk(); b.t = 5;
    const rec = []; const ctx = makeCtx(rec);
    const orig = ctx.measureText; const c2 = new Proxy(ctx, { get: (t, k) => k === 'measureText' ? (s) => ({ width: String(s).length * cw }) : t[k], set: (t, k, v) => { t[k] = v; return true; } });
    b.render(c2);
    const L = b.newsLayout();
    ok(L.pill.x >= L.head.x + L.head.w + 8 && L.pill.x + L.pill.w <= 352, 'pill right of measured heading with gap (char width ' + cw + ')');
  }
}

// 3. 枠のレイアウト (360x640): TAP TO BEGIN / SOUND ON / build と重ならない
{
  const { b } = mk(); const r = shot(b);
  const L = b.newsLayout(), f = L.frame;
  const snd = r.find((t) => t.s === 'SOUND ON'), build = r.find((t) => t.s.startsWith('build '));
  ok(f.y > snd.y + 10, 'frame below SOUND ON');
  ok(L.head.y + L.head.h < f.y, 'heading above the frame');
  ok(build.y >= f.y + f.h + 2 && build.y + 8 <= 636, 'build text under the frame, on screen');
  ok(f.x >= 0 && f.x + f.w <= 360 && L.view.x >= f.x && L.view.x + L.view.w <= f.x + f.w && L.view.y >= f.y && L.view.y + L.view.h <= f.y + f.h, 'view inside frame inside screen');
  ok(r.filter((t) => t.s !== 'NEW' && t.y > f.y - 1 && t.y < f.y + f.h && !/^\d{4}|・/.test(t.s) && !WHATSNEW.entries.some((en) => en.items.includes(t.s))).length === 0, 'only update content inside the frame');
}

// 4. スクロール: ホイール・ドラッグ・キーで範囲内に収まる。最後まで行けば全項目が描かれる
{
  const { b } = mk();
  ok(b.scrollMax() > 0 && b.scroll === 0, 'content taller than frame (scrollable)');
  b.onWheel({ dy: -500 }); ok(b.scroll === 0, 'wheel up clamps at 0');
  b.onWheel({ dy: 30 }); ok(b.scroll === 30, 'wheel down scrolls');
  b.onWheel({ dy: 99999 }); ok(b.scroll === b.scrollMax(), 'wheel down clamps at max');
  b.onDrag({ dy: -20 }); ok(b.scroll === b.scrollMax(), 'drag content up at end: stays clamped');
  b.onDrag({ dy: 1e6 }); ok(b.scroll === 0, 'drag clamps at 0');
  b.onDrag({ dy: -25 }); ok(b.scroll === 25, 'drag up scrolls content down (follows finger)');
  b.onInput('down'); ok(b.scroll > 25, 'arrow down scrolls'); b.onInput('up'); b.onInput('up'); b.onInput('up'); ok(b.scroll === 0, 'arrow up clamps at 0');
  ok(!b.done, 'scrolling never begins');
  const seen = new Set(); let s = 0;
  for (b.scroll = 0; b.scroll <= b.scrollMax(); b.scroll += 6) shot(b).forEach((t) => seen.add(t.s));
  ok(WHATSNEW.entries.every((en) => en.items.every((l) => seen.has(l)) && seen.has(en.date + ' · build ' + en.version)), 'every date line and item reachable by scrolling');
  b.scroll = 10; shot(b); // 描画で例外が出ない
  // 描画位置: スクロール0で先頭項目が枠内
  b.scroll = 0; const r = shot(b), L = b.newsLayout();
  const first = r.find((t) => t.s === WHATSNEW.entries[0].items[0]);
  ok(first && first.y >= L.view.y && first.y + 11 <= L.view.y + L.view.h, 'first item inside the view at scroll 0');
  // 先頭の項目の左端が箇条書き記号より右（ぶら下げインデント）
  const dot = r.find((t) => t.s === '・');
  ok(dot && first.x > dot.x + 8, 'hanging indent: text right of bullet');
}

// 5. 枠内のタップは BEGIN / 枠内のドラッグは BEGIN しない（エンジン経由）
{
  const winH = {}, docH = {}, canH = {};
  const reg = (st) => (n, f) => { (st[n] = st[n] || []).push(f); };
  globalThis.window = { addEventListener: reg(winH), innerWidth: 360, innerHeight: 640, devicePixelRatio: 1 };
  globalThis.document = { addEventListener: reg(docH), hidden: false };
  const cx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 5 }) : noop) });
  const canvas = { style: {}, width: 0, height: 0, addEventListener: reg(canH), getBoundingClientRect: () => ({ left: 0, top: 0 }), getContext: () => cx };
  const { Engine } = await import('../02_src/core/engine.js');
  const E = new Engine(canvas);
  const fire = (st, n, ev) => (st[n] || []).forEach((f) => f(Object.assign({ preventDefault: noop, target: {} }, ev)));
  const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
  const setup = () => { const e = E; let began = 0; const b = new BootScene(e, () => { began++; }); e.scene = b; e._clearPointers(); return { b, began: () => began }; };
  // タップ（枠内）
  let s = setup();
  fire(canH, 'touchstart', { changedTouches: [T(1, 180, 520)] });
  fire(canH, 'touchend', { changedTouches: [T(1, 181, 521)] });
  ok(s.began() === 1, 'tap inside the frame begins');
  // タップ（枠外）
  s = setup(); fire(canH, 'touchstart', { changedTouches: [T(1, 180, 200)] }); fire(canH, 'touchend', { changedTouches: [T(1, 180, 200)] });
  ok(s.began() === 1, 'tap outside the frame begins');
  // 枠内ドラッグ（上へ60px）: スクロールのみ
  s = setup();
  fire(canH, 'touchstart', { changedTouches: [T(1, 180, 540)] });
  fire(canH, 'touchmove', { changedTouches: [T(1, 180, 530)] });
  fire(canH, 'touchmove', { changedTouches: [T(1, 180, 500)] });
  fire(canH, 'touchend', { changedTouches: [T(1, 180, 480)] });
  ok(s.began() === 0 && s.b.scroll >= 40 && !s.b.done, 'drag inside the frame scrolls (' + s.b.scroll + ') and does not begin');
  // 下へ戻すドラッグ
  fire(canH, 'touchstart', { changedTouches: [T(1, 180, 480)] }); fire(canH, 'touchmove', { changedTouches: [T(1, 180, 520)] }); fire(canH, 'touchend', { changedTouches: [T(1, 180, 540)] });
  ok(s.began() === 0 && s.b.scroll < 20, 'drag back down scrolls back');
  // 6px以内の微小移動はタップ
  s = setup(); fire(canH, 'touchstart', { changedTouches: [T(1, 180, 540)] }); fire(canH, 'touchmove', { changedTouches: [T(1, 182, 543)] }); fire(canH, 'touchend', { changedTouches: [T(1, 182, 543)] });
  ok(s.began() === 1 && s.b.scroll === 0, 'movement <= 6px is a tap (begins, no scroll)');
  // マウスのドラッグ（window 上で離す）
  s = setup(); fire(canH, 'mousedown', { clientX: 180, clientY: 540 }); fire(winH, 'mousemove', { clientX: 180, clientY: 490 }); fire(winH, 'mouseup', { clientX: 180, clientY: 490 });
  ok(s.began() === 0 && s.b.scroll > 30, 'mouse drag inside the frame scrolls, does not begin');
  // 枠外から始めたスワイプはスクロール扱いにならず BEGIN もしない
  s = setup(); fire(canH, 'touchstart', { changedTouches: [T(1, 180, 100)] }); fire(canH, 'touchmove', { changedTouches: [T(1, 180, 60)] }); fire(canH, 'touchend', { changedTouches: [T(1, 180, 40)] });
  ok(s.began() === 0, 'swipe outside the frame does not begin');
  // ホイール
  s = setup(); let prevented = false;
  fire(canH, 'wheel', { clientX: 180, clientY: 520, deltaY: 40, deltaMode: 0, preventDefault: () => { prevented = true; } });
  ok(s.b.scroll === 40 && prevented, 'wheel inside the frame scrolls');
  fire(canH, 'wheel', { clientX: 180, clientY: 100, deltaY: 40, deltaMode: 0 });
  ok(s.b.scroll === 40, 'wheel outside the frame ignored');
  fire(canH, 'wheel', { clientX: 180, clientY: 520, deltaY: 1e5, deltaMode: 0 }); ok(s.b.scroll === s.b.scrollMax(), 'wheel clamps at max via engine');
  // 他シーン（onDrag/onWheel なし）はこれまで通り
  const got = []; E.scene = { isRoot: true, onInput: (a) => got.push(a) }; E._clearPointers();
  fire(canH, 'touchstart', { changedTouches: [T(1, 180, 540)] }); fire(canH, 'touchmove', { changedTouches: [T(1, 180, 480)] }); fire(canH, 'touchend', { changedTouches: [T(1, 180, 470)] });
  ok(got.join() === 'up', 'other scenes: swipe still delivered as before');
  fire(canH, 'wheel', { clientX: 180, clientY: 520, deltaY: 40 });
  // キーボード
  s = setup(); fire(winH, 'keydown', { key: 'ArrowDown' }); ok(s.b.scroll > 0 && s.began() === 0, 'keyboard ArrowDown scrolls');
  fire(winH, 'keydown', { key: 'Enter' }); ok(s.began() === 1, 'Enter begins');
  s = setup(); fire(winH, 'keydown', { key: ' ' }); ok(s.began() === 1, 'Space begins');
}

// 6. モノクロ: 起動画面とタイトルの版ラベルにティール/琥珀を使わない
{
  const { b } = mk(); const r = shot(b);
  const lab = r.find((t) => t.s === APP_LABEL);
  ok(lab && !isTeal(lab.fill) && String(lab.fill).toLowerCase() !== P().warn.toLowerCase(), 'boot BETA label is not teal/amber: ' + (lab && lab.fill));
  const rec = []; drawBetaTag(makeCtx(rec), { x: 142, y: 110, w: 76, h: 12 }, 1);
  ok(rec[0] && !isTeal(rec[0].fill) && String(rec[0].fill).toLowerCase() !== P().warn.toLowerCase(), 'title beta tag is monochrome: ' + (rec[0] && rec[0].fill));
}

console.log('p14boot: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
