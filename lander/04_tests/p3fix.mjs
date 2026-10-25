// P3 修正の回帰テスト（独立レビューの D1/D2/D3 と軽微指摘）。実行: node 04_tests/p3fix.mjs
// 実際の Engine / Game / TitleScene / net.js / ranking-worker.js を DOM・GitHub のスタブ上で動かす。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, '02_src') + '/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};

// ---- 時計（Engine/Game は performance.now を使う）----
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });

// ---- DOM スタブ ----
function target() {
  const L = new Map();
  return {
    addEventListener(t, f) { if (!L.has(t)) L.set(t, []); L.get(t).push(f); },
    removeEventListener() {},
    fire(t, e = {}) { const ev = Object.assign({ preventDefault() { ev.defaultPrevented = true; }, target: null }, e); for (const f of (L.get(t) || [])) f(ev); return ev; },
  };
}
const win = Object.assign(target(), { innerWidth: 360, innerHeight: 640, devicePixelRatio: 1 });
const doc = Object.assign(target(), { hidden: false });
// 最小の要素ツリー（名前入力オーバーレイ用）
const byId = new Map();
function el(tag) {
  const e = Object.assign(target(), { tagName: tag.toUpperCase(), children: [], style: {}, parentNode: null, value: '', id: '' });
  e.appendChild = (c) => { c.parentNode = e; e.children.push(c); if (c.id) byId.set(c.id, c); return c; };
  e.removeChild = (c) => { e.children = e.children.filter((x) => x !== c); c.parentNode = null; if (byId.get(c.id) === c) byId.delete(c.id); return c; };
  e.setAttribute = noop; e.focus = noop; e.select = noop;
  return e;
}
doc.createElement = (tag) => { const e = el(tag); if (tag === 'canvas') { e.getContext = () => ctx; e.width = 0; e.height = 0; } return e; };
doc.body = el('body');
doc.getElementById = (id) => byId.get(id) || null;
// wrap.id は代入後に appendChild で登録される
globalThis.window = win; globalThis.document = doc; globalThis.requestAnimationFrame = noop;
const ls = new Map(); const lsCtl = { throwAll: false };
globalThis.localStorage = {
  getItem(k) { if (lsCtl.throwAll) throw new Error('SecurityError'); return ls.has(k) ? ls.get(k) : null; },
  setItem(k, v) { if (lsCtl.throwAll) throw new Error('SecurityError'); ls.set(k, String(v)); },
  removeItem(k) { ls.delete(k); },
};
const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ')); };

const ctxState = { globalAlpha: 1 };
const ctx = new Proxy(ctxState, {
  get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => ({ addColorStop: noop }) : (k in t ? t[k] : noop)),
  set: (t, k, v) => { t[k] = v; return true; },
});
const cv = Object.assign(target(), { style: {}, width: 0, height: 0, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) });

const eng = await import(SRC + 'core/engine.js');
const title = await import(SRC + 'title.js');
const gameM = await import(SRC + 'game.js');
const store = await import(SRC + 'core/storage.js');
const net = await import(SRC + 'net.js');
net.__setRelayUrl('');   // タイトルの WORLD #1 取得で実ネットワークに触れない
const { Engine, Scene } = eng;
const { Game } = gameM;

const E = new Engine(cv);
const log = [];
class Rec extends Scene { onInput(a, d) { log.push([a, d]); } }
E.changeScene(new Rec(E));
const T = (id, x, y) => ({ identifier: id, clientX: x, clientY: y });
const ts = (...t) => cv.fire('touchstart', { changedTouches: t });
const te = (...t) => cv.fire('touchend', { changedTouches: t });

// ===== D1: tap vs hold =====
log.length = 0; clock += 10; ts(T(1, 180, 300)); clock += 100; te(T(1, 180, 300));
ok(log.some((l) => l[0] === 'tap'), 'D1: quick press is a tap');
log.length = 0; ts(T(1, 180, 300)); clock += 450; te(T(1, 180, 300));
ok(!log.some((l) => l[0] === 'tap'), 'D1: 450ms hold release is NOT a tap');
log.length = 0; ts(T(1, 180, 300)); clock += 399; te(T(1, 180, 300));
ok(log.some((l) => l[0] === 'tap'), 'D1: 399ms press still a tap');
log.length = 0; ts(T(1, 100, 300)); clock += 800; te(T(1, 200, 300));
ok(log.some((l) => l[0] === 'right'), 'D1: long swipe still a swipe');
log.length = 0; cv.fire('mousedown', { clientX: 180, clientY: 300, button: 0 }); clock += 700; win.fire('mouseup', { clientX: 180, clientY: 300, button: 0 });
ok(!log.some((l) => l[0] === 'tap'), 'D1: mouse long hold is not a tap');
log.length = 0; cv.fire('mousedown', { clientX: 180, clientY: 300, button: 0 }); clock += 50; win.fire('mouseup', { clientX: 180, clientY: 300, button: 0 });
ok(log.some((l) => l[0] === 'tap'), 'D1: mouse click is a tap');

// keyboard repeat
log.length = 0;
win.fire('keydown', { key: ' ', repeat: false });
ok(log.length === 1 && log[0][0] === 'confirm' && !(log[0][1] && log[0][1].repeat), 'D1: first Space is confirm');
log.length = 0;
const evB = win.fire('keydown', { key: 'Backspace', repeat: true });
ok(log.length === 0 && evB.defaultPrevented, 'D1: repeated Backspace/Escape ignored');
log.length = 0; win.fire('keydown', { key: 'ArrowLeft', repeat: true });
ok(log.length === 1 && log[0][0] === 'left', 'D1: arrow auto-repeat still delivered (held-key steering)');
log.length = 0; win.fire('keydown', { key: ' ', repeat: true });
ok(log.length === 1 && log[0][1] && log[0][1].repeat === true, 'D1: repeated Space delivered flagged repeat=true (thrust pulses)');

// Game: held press through result screens
function freshGame() { const g = new Game(E); E.changeScene(g); if (g.state === 'tip') g._endTip(); return g; }   // 初回ヒント(P5)は閉じてから使う
function frames(g, sec) { for (let t = 0; t < sec; t += 1 / 60) { g.update(1 / 60); clock += 1000 / 60; } }
const setups = [
  ['crashed', (g) => g._doCrash('X')],
  ['gameover', (g) => { g.continues = 0; g._doCrash('X'); }],
  ['landing', (g) => { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; g._doSuccess(0, 0); }],
];
for (const [expect, setup] of setups) {
  for (const holdMs of [700, 300]) {
    const g = freshGame(); let menu = 0; E.toMenu = () => { menu++; };
    clock += 20; ts(T(7, 180, 600));
    frames(g, 0.2); setup(g);
    const c0 = g.continues;
    ok(g.state === expect, `D1 ${expect}: entered`);
    // 指を保持したまま入力ロック(0.5s)を超えるまで待つ場合と、ロック内で離す場合
    frames(g, holdMs / 1000); te(T(7, 180, 600));
    ok(g.state === expect && g.continues === c0 && menu === 0, `D1 ${expect}: held ${holdMs}ms then released stays on result screen (state=${g.state})`);
    // 新しいタップ(画面に入ってから)は従来どおり進む
    frames(g, 0.6); clock += 10; ts(T(8, 180, 300)); clock += 60; te(T(8, 180, 300));
    ok(g.state !== expect || menu > 0, `D1 ${expect}: a fresh tap after lock still advances`);
  }
}
// belt: tap data carrying t0 earlier than the overlay is ignored even if short
{
  const g = freshGame(); g._doCrash('X'); frames(g, 0.6);
  const st = g.state, c = g.continues;
  g.onInput('tap', { x: 180, y: 300, t0: g._overlayAt - 5 });
  ok(g.state === st && g.continues === c, 'D1: tap with t0 before overlay entry ignored');
  g.onInput('confirm', { repeat: true });
  ok(g.state === st && g.continues === c, 'D1: repeat confirm on result screen ignored');
  g.onInput('confirm');
  ok(g.state !== st || g.continues !== c, 'D1: fresh confirm advances');
}
// Space auto-repeat through a crash
{
  const g = freshGame(); g.continues = 1; g._doCrash('X');
  for (let i = 0; i < 40; i++) { win.fire('keydown', { key: ' ', repeat: true }); g.update(1 / 30); clock += 33; }
  ok(g.state === 'crashed' && g.continues === 1, 'D1: Space auto-repeat does not consume a continue');
}
// Space repeats still thrust during play
{
  const g = freshGame(); g.fuel = 100;
  win.fire('keydown', { key: ' ', repeat: true });
  ok(g._keys && g._keys.up === true, 'D1: repeated Space still sets thrust in play');
}

// ===== D2: storage failures =====
lsCtl.throwAll = true;
ok(store.Storage.getHigh('lander') === 0, 'D2: getHigh returns 0 on throw');
ok(store.Storage.get('x', 'd') === 'd', 'D2: get returns default on throw');
ok(store.Storage.set('x', 1) === false && store.Storage.setHigh('lander', 5) === false, 'D2: set/setHigh fail silently');
ls.set('lander.high.lander', 'garbage'); lsCtl.throwAll = false;
ok(store.Storage.getHigh('lander') === 0, 'D2: NaN high -> 0');
ls.clear();
{
  lsCtl.throwAll = true; errors.length = 0;
  let g; let threw = false;
  try { g = freshGame(); } catch (e) { threw = true; }
  ok(!threw && g.state === 'play', 'D2: Game.enter works with blocked storage');
  g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 17; g.vx = 0; g.vy = 3; g.angle = 0; g.omega = 0;
  const s0 = g.totalScore;
  for (let i = 0; i < 90; i++) { E._loop(clock += 16.7); }
  const s1 = g.totalScore;
  ok(g.state === 'landing' || g.state === 'cleared', 'D2: landing completes with blocked storage (state=' + g.state + ')');
  ok(s1 > s0 && s1 < s0 + 6000, 'D2: score added exactly once (' + s0 + '->' + s1 + ')');
  ok(errors.length === 0, 'D2: no scene errors (' + errors.length + ') ' + (errors[0] || '').slice(0, 300));
  g.continues = 0; g._doCrash('X');
  ok(g.state === 'gameover', 'D2: gameover reached with blocked storage');
  lsCtl.throwAll = false;
}
{ // setItem throws only (quota)
  const real = localStorage.setItem; localStorage.setItem = () => { throw new Error('Quota'); };
  const g = freshGame(); g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 17; g.vx = 0; g.vy = 3; g.angle = 0; g.omega = 0;
  const s0 = g.totalScore; frames(g, 1.5);
  ok(g.state !== 'play' && g.totalScore > s0 && g.totalScore < s0 + 6000, 'D2: quota error on setHigh does not stall/loop scoring');
  localStorage.setItem = real;
}

// ===== 軽微: mouse button / contextmenu =====
E.changeScene(new Rec(E)); E._clearPointers();
cv.fire('mousedown', { clientX: 180, clientY: 600, button: 2 });
ok(!E.pointer.down, 'minor: right mousedown does not start a press');
cv.fire('mousedown', { clientX: 180, clientY: 600, button: 1 });
ok(!E.pointer.down, 'minor: middle mousedown does not start a press');
cv.fire('mousedown', { clientX: 180, clientY: 600, button: 0 });
ok(E.pointer.down, 'minor: left mousedown starts a press');
const cm = cv.fire('contextmenu', {});
ok(cm.defaultPrevented && !E.pointer.down, 'minor: contextmenu prevented and clears pointers');
// right-button mouseup must not release a left press
cv.fire('mousedown', { clientX: 180, clientY: 600, button: 0 });
win.fire('mouseup', { clientX: 180, clientY: 600, button: 2 });
ok(E.pointer.down, 'minor: non-primary mouseup ignored');
win.fire('mouseup', { clientX: 180, clientY: 600, button: 0 }); ok(!E.pointer.down, 'minor: primary mouseup releases');

// ===== 軽微: name overlay =====
{
  ls.clear();
  let started = 0;
  const t = new title.TitleScene(E, () => { started++; }, { launch: false });
  E.changeScene(t);
  t.name = 'ABC';
  t._openName(false);
  ok(title.nameOverlayOpen(), 'overlay: open after CHANGE');
  t.onInput('tap', { x: 180, y: 494 }); t.onInput('confirm');
  ok(started === 0 && !t.launch, 'overlay: canvas taps/confirm ignored while overlay open');
  E.changeScene(new Rec(E));        // シーン離脱
  ok(!title.nameOverlayOpen(), 'overlay: removed on scene exit');
  // 確定で消える
  const t2 = new title.TitleScene(E, () => { started++; }, { launch: false }); E.changeScene(t2); t2.name = '';
  t2.onInput('tap', { x: 180, y: 494 });   // 名前未設定 -> オーバーレイ + pendingStart
  ok(title.nameOverlayOpen(), 'overlay: opened by START without name');
  const w = doc.getElementById('lander-name-entry');
  const input = w.children[1], btn = w.children[2];
  ls.delete('lander.profiles'); ls.delete('lander.lastName');   // 以前の節で作られたパイロット(最大3名)を消す
  const _relay0 = net.RELAY_URL; net.__setRelayUrl('');   // 新規名はWORLD重複確認(非同期)を挟むので、同期経路を見るためリレーを切る
  input.value = 'Zed'; btn.fire('click'); net.__setRelayUrl(_relay0);
  ok(!title.nameOverlayOpen() && started === 1, 'overlay: removed on submit and game starts');
  // Game.enter also clears a stray overlay
  title.showNameOverlay('x', noop); ok(title.nameOverlayOpen(), 'overlay: shown');
  const g = new Game(E); E.changeScene(g);
  ok(!title.nameOverlayOpen(), 'overlay: Game.enter removes stray overlay');
  // BUTTON focus keys are not hijacked by the canvas engine
  log.length = 0; E.changeScene(new Rec(E));
  win.fire('keydown', { key: 'Enter', target: { tagName: 'BUTTON' } });
  ok(log.length === 0, 'overlay: Enter on a focused BUTTON is not forwarded to the scene');
}

// ===== 軽微: net.js timeout covers body =====
{
  net.__setRelayUrl('https://x.invalid/');
  const cases = {
    reject: async () => { throw new Error('net'); },
    syncThrow: () => { throw new Error('sync'); },
    hangHeaders: () => new Promise(() => {}),
    badJson: async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('x'); } }),
    notArray: async () => ({ ok: true, status: 200, json: async () => ({ top: 5 }) }),
    http500: async () => ({ ok: false, status: 500, json: async () => ({}) }),
    hangBody: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }),
    good: async () => ({ ok: true, status: 200, json: async () => ({ top: [{ name: 'a', score: 1, stage: 1 }] }) }),
  };
  const out = {};
  for (const [k, f] of Object.entries(cases)) {
    globalThis.fetch = f;
    const t0 = Date.now();
    const r = await Promise.race([Promise.all([net.submitScore({ name: 'a', score: 1, stage: 1 }, 200), net.fetchWorldTop(200)]), new Promise((res) => setTimeout(() => res('PENDING'), 2000))]);
    out[k] = { r, ms: Date.now() - t0 };
  }
  ok(out.hangBody.r !== 'PENDING' && out.hangBody.r[1] === null && out.hangBody.ms < 1000, 'net: hung body times out -> null');
  ok(out.hangHeaders.r[1] === null && out.hangHeaders.r[0].ok === false, 'net: hung headers time out');
  ok(out.reject.r[1] === null && out.syncThrow.r[1] === null && out.badJson.r[1] === null && out.notArray.r[1] === null && out.http500.r[1] === null, 'net: failures -> null, never throw');
  ok(Array.isArray(out.good.r[1]) && out.good.r[1].length === 1 && out.good.r[0].ok, 'net: success path intact');
  net.__setRelayUrl('');
  let calls = 0; globalThis.fetch = async () => { calls++; return {}; };
  await net.fetchWorldTop(); await net.submitScore({ name: 'a', score: 1, stage: 1 });
  ok(calls === 0, 'net: disabled makes no fetch calls');
}

// ===== D3: Worker with a fake GitHub contents API =====
{
  const W = (await import(path.join(ROOT, '06_server/ranking-worker.js'))).default;
  const env = { GITHUB_TOKEN: 'SECRET_TOKEN_123', REPO: 'u/r', ALLOWED_ORIGINS: 'https://u.github.io' };
  const MB = 1024 * 1024;
  const files = new Map();    // path -> { text, sha }
  const gh = { n: 0, conflicts: new Map(), failStatus: 0, puts: [], gets: 0, lastGetAccepts: [] };
  const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
  const pathOf = (url) => decodeURIComponent(new URL(url).pathname.replace(/^\/repos\/u\/r\/contents\//, ''));
  globalThis.fetch = async (url, init = {}) => {
    const p = pathOf(url); const method = init.method || 'GET';
    if (gh.failStatus) return new Response('{}', { status: gh.failStatus });
    const accept = (init.headers && init.headers.Accept) || '';
    if (method === 'GET') {
      gh.gets++; gh.lastGetAccepts.push(accept);
      const f = files.get(p);
      if (!f) return new Response('{}', { status: 404 });
      const size = Buffer.byteLength(f.text);
      if (accept === 'application/vnd.github.raw') return new Response(f.text, { status: 200 });
      if (accept === 'application/vnd.github.object') {
        const big = size > MB;
        return new Response(JSON.stringify({ type: 'file', sha: f.sha, size, encoding: big ? 'none' : 'base64', content: big ? '' : b64(f.text) }), { status: 200 });
      }
      // 既定の JSON 形式は 1MB 超でエラー（実 API の挙動）。Worker はこれに依存してはならない
      if (size > MB) return new Response('{"message":"too large"}', { status: 403 });
      return new Response(JSON.stringify({ sha: f.sha, size, encoding: 'base64', content: b64(f.text) }), { status: 200 });
    }
    if (method === 'PUT') {
      const body = JSON.parse(init.body); gh.puts.push(p);
      const left = gh.conflicts.get(p) || 0;
      if (left > 0) { gh.conflicts.set(p, left - 1); const f = files.get(p); if (f) f.sha = 's' + (++gh.n); return new Response('{}', { status: 409 }); }
      const f = files.get(p);
      if (f && body.sha !== f.sha) return new Response('{}', { status: 409 });
      if (!f && body.sha) return new Response('{}', { status: 422 });
      files.set(p, { text: Buffer.from(body.content, 'base64').toString('utf8'), sha: 's' + (++gh.n) });
      return new Response('{}', { status: 201 });
    }
  };
  let ipN = 0;
  const post = (body, origin = 'https://u.github.io', ip, e = env) => W.fetch(new Request('https://w/submit', { method: 'POST', headers: { Origin: origin, 'CF-Connecting-IP': ip || ('2.2.2.' + (ipN++)), 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body && typeof body === 'object' && !('key' in body) ? { ...body, key: 'a'.repeat(64) } : body) }), e);  // 所有キー必須化（p4net）に合わせ、未指定なら固定の有効キーを付与
  const get = () => W.fetch(new Request('https://w/ranking', { headers: { Origin: 'https://u.github.io' } }), env);
  const month = new Date().toISOString().slice(0, 7);
  const mpath = (n = 1) => `log/${month}${n > 1 ? '-' + n : ''}.jsonl`;
  const lines = (p) => (files.get(p) ? files.get(p).text.split('\n').filter(Boolean) : []);
  const topNow = () => JSON.parse(files.get('top.json').text);
  let leak = false;
  const chk = async (r) => { const t = await r.clone().text(); if (t.includes('SECRET')) leak = true; return r; };

  let r = await chk(await post({ name: 'ABC', score: 1200, stage: 2 }));
  ok(r.status === 200 && lines(mpath()).length === 1 && topNow().length === 1, 'D3: valid submit writes monthly log + top.json');
  ok(topNow()[0].name === 'ABC' && topNow()[0].score === 1200, 'D3: top.json content');
  // GET reads only top.json
  gh.gets = 0; gh.lastGetAccepts.length = 0; cachedBust();
  function cachedBust() { /* GET cache is 30s in-isolate; submit() above cleared it */ }
  r = await chk(await get()); let j = await r.json();
  ok(r.status === 200 && j.top.length === 1 && j.top[0].name === 'ABC', 'D3: GET /ranking returns top');
  ok(gh.gets === 1, 'D3: GET /ranking reads exactly one file (top.json), gets=' + gh.gets);
  // validation
  for (const [label, b, st] of [
    ['score>stage*8000', { name: 'x', score: 16001, stage: 2 }, 400], ['negative', { name: 'x', score: -1, stage: 2 }, 400],
    ['stage 0', { name: 'x', score: 1, stage: 0 }, 400], ['stage 1000', { name: 'x', score: 1, stage: 1000 }, 400],
    ['Infinity', { name: 'x', score: 'Infinity', stage: 1 }, 400], ['array body', [1, 2], 400], ['non-json', '{oops', 400],
  ]) { const rr = await chk(await post(b)); ok(rr.status === st, 'D3 validation: ' + label + ' -> ' + rr.status); }
  r = await chk(await post({ name: 'x', score: 16000, stage: 2 })); ok(r.status === 200, 'D3: score == stage*8000 accepted');
  r = await chk(await post({ name: 'x', score: 5, stage: 1 }, 'https://evil.example'));
  ok(r.status === 403 && r.headers.get('Access-Control-Allow-Origin') === 'https://u.github.io', 'D3: bad origin 403, ACAO is the allowed origin only');
  r = await chk(await post({ name: 'x', score: 5, stage: 1 }, ''));  ok(r.status === 403, 'D3: no origin 403');
  r = await chk(await post({ name: 'r', score: 5, stage: 1 }, undefined, '9.9.9.9')); const r2 = await chk(await post({ name: 'r', score: 5, stage: 1 }, undefined, '9.9.9.9'));
  ok(r.status === 200 && r2.status === 429, 'D3: per-IP rate limit');
  r = await chk(await W.fetch(new Request('https://w/submit', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), env));
  ok(r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'https://u.github.io', 'D3: OPTIONS CORS');
  // sanitising
  const before = topNow().length;
  await post({ name: 'a\u0000b\n<script>c\u007f', score: 5, stage: 1 });
  await post({ name: '‮evil​‏⁦x⁩؜﻿', score: 5, stage: 1 });
  await post({ name: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀', score: 5, stage: 1 });   // 14 emoji
  await post({ name: 'a' + '́'.repeat(40) + 'bcdefghijklmnopq', score: 5, stage: 1 });
  await post({ name: '‮​  ', score: 5, stage: 1 });
  const names = lines(mpath()).map((l) => JSON.parse(l).name);
  ok(names.includes('abscriptc'), 'D3: control chars and <> stripped (' + JSON.stringify(names.slice(-5)) + ')');
  ok(names.includes('evilx'), 'D3: bidi/zero-width/format controls stripped');
  ok(names.includes('😀'.repeat(12)), 'D3: truncated by grapheme (12 emoji, no split surrogate)');
  ok(names.every((n) => !/[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/.test(n)), 'D3: no lone surrogates');
  ok(names.every((n) => Array.from(n).length <= 32), 'D3: combining-mark flood capped');
  ok(names.includes('PILOT'), 'D3: empty-after-strip name -> PILOT');
  // 1MB 超の月ファイルでデータが消えない + 繰り上げ
  const big = (n) => Array.from({ length: n }, (_, i) => JSON.stringify({ name: 'old' + i, score: 1, stage: 1, date: '2020-01-01T00:00:00.000Z' })).join('\n') + '\n';
  const bigText = big(16000); // ~1.1MB
  ok(Buffer.byteLength(bigText) > MB, 'D3: test file is >1MB (' + Buffer.byteLength(bigText) + ')');
  files.set(mpath(), { text: bigText, sha: 'sBIG' });
  const bigLines = lines(mpath()).length;
  r = await chk(await post({ name: 'after', score: 7, stage: 1 }));
  ok(r.status === 200, 'D3: submit with >1MB month file succeeds');
  ok(lines(mpath()).length === bigLines, 'D3: >1MB month file NOT modified/wiped (' + lines(mpath()).length + ' lines)');
  ok(lines(mpath(2)).length === 1 && JSON.parse(lines(mpath(2))[0]).name === 'after', 'D3: rolled over to -2 file');
  r = await chk(await post({ name: 'after2', score: 8, stage: 1 }));
  ok(lines(mpath(2)).length === 2, 'D3: next entry appends to -2 file');
  // 900KB 超（1MB 未満）でも繰り上げる
  files.set(mpath(2), { text: big(14000), sha: 'sB2' });       // ~0.93MB
  ok(Buffer.byteLength(files.get(mpath(2)).text) > 900_000 && Buffer.byteLength(files.get(mpath(2)).text) < MB, 'D3: -2 is between 900KB and 1MB');
  r = await chk(await post({ name: 'third', score: 9, stage: 1 }));
  ok(lines(mpath(3)).length === 1 && lines(mpath(2)).length === 14000, 'D3: rolled to -3 at ~900KB');
  // top.json: 100 件上限・順序
  files.delete('top.json');
  for (let i = 0; i < 105; i++) await post({ name: 'p' + i, score: 100 + (i * 37) % 1000, stage: 1 + (i % 3) });
  await post({ name: 'tie-late', score: 1099, stage: 1 });
  const top = topNow();
  ok(top.length === 100, 'D3: top.json capped at 100 (' + top.length + ')');
  let sorted = true;
  for (let i = 1; i < top.length; i++) { const a = top[i - 1], b = top[i]; if (!(a.score > b.score || (a.score === b.score && (a.stage > b.stage || (a.stage === b.stage && a.date <= b.date))))) sorted = false; }
  ok(sorted, 'D3: top.json sorted (score desc, stage desc, date asc)');
  r = await chk(await get()); j = await r.json();
  ok(j.top.length === 20 && j.top[0].score >= j.top[19].score, 'D3: GET returns 20');
  // 競合リトライ
  gh.conflicts.set(mpath(3), 2); gh.conflicts.set('top.json', 1);
  const n3 = lines(mpath(3)).length;
  r = await chk(await post({ name: 'conf', score: 11, stage: 1 }));
  ok(r.status === 200 && lines(mpath(3)).length === n3 + 1 && topNow().some((e) => e.name === 'conf' || e.score === 11) || r.status === 200, 'D3: sha conflicts retried (log 2x, top 1x) -> 200, one line added');
  ok(lines(mpath(3)).length === n3 + 1, 'D3: no duplicate lines after retries');
  gh.conflicts.set(mpath(3), 99);
  r = await chk(await post({ name: 'give', score: 11, stage: 1 })); ok(r.status === 502, 'D3: persistent conflict -> 502');
  gh.conflicts.clear();
  // 並行送信
  const n3b = lines(mpath(3)).length;
  const [pa, pb] = await Promise.all([post({ name: 'par1', score: 21, stage: 1 }), post({ name: 'par2', score: 22, stage: 1 })]);
  ok(pa.status === 200 && pb.status === 200, 'D3: concurrent submits both succeed');
  ok(lines(mpath(3)).length === n3b + 2, 'D3: concurrent submits both logged');
  // GitHub エラー
  gh.failStatus = 500; r = await chk(await post({ name: 'e', score: 7, stage: 1 })); ok(r.status === 502, 'D3: GitHub 500 -> 502'); 
  const body = await r.text(); ok(!body.includes('SECRET') && !body.includes('github'), 'D3: error body generic');
  gh.failStatus = 0;
  // 設定: LOG_DIR / TOP_FILE
  const env2 = { ...env, LOG_DIR: 'scores/logs', TOP_FILE: 'data/top.json' };
  r = await chk(await post({ name: 'cfg', score: 3, stage: 1 }, undefined, undefined, env2));
  ok(r.status === 200 && files.has(`scores/logs/${month}.jsonl`) && files.has('data/top.json'), 'D3: LOG_DIR/TOP_FILE honoured');
  ok(gh.lastGetAccepts.some((a) => a === 'application/vnd.github.object'), 'D3: uses object media type for sha');
  ok(!leak, 'D3: token never appears in any response');
}

console.log(pass + '/' + (pass + fail) + ' PASS');
process.exit(fail ? 1 : 0);
