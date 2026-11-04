// p24expedition — beta.8: EXPEDITION を本編へ（PLAN §7m/§7s）。実行: node 04_tests/p24expedition.mjs（lander-1.1/ から）
// パイロットごとの保存 / POD の確率と取り方 / ステージ後の MISSION ACCEPTED / マップの入口と ★60 / ミッション画面（埋め込み）/ バンドル
// beta.9: POD は画面の中ほどに出て付いて来ない / いま向かう（寄り道）とツアーへ戻る / 未挑戦の再案内 / ゲームオーバー画面の入口
import './p10setup.mjs';
import fs from 'node:fs';
import vm from 'node:vm';
const noop = () => {};
const listeners = [];
globalThis.window = { addEventListener: (t, f) => listeners.push([t, f]), removeEventListener: (t, f) => { const i = listeners.findIndex((x) => x[0] === t && x[1] === f); if (i >= 0) listeners.splice(i, 1); } };
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });

const { Game } = await import('../02_src/game.js');
const { TitleScene } = await import('../02_src/title.js');
const { SolarMap } = await import('../02_src/solarmap.js');
const { setDebug } = await import('../02_src/debug.js');
const { __setRelayUrl } = await import('../02_src/net.js');
const { starsSummary } = await import('../02_src/stars.js');
const { EXP_MISSIONS, expForBody } = await import('../02_src/expedition/index.js');
const XD = await import('../02_src/expdata.js');
const { Pod, podPlan, podChance, podRng, POD } = await import('../02_src/pods.js');
const { ExpeditionScene, XP_ACC, XP_BTN, xpDrawAccepted } = await import('../02_src/expscene.js');
setDebug(false); __setRelayUrl('');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
function makeCtx(rec) {
  rec = rec || { texts: [] };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s) => { rec.texts.push(String(s)); };
      return k in t ? t[k] : noop;
    }, set: (t, k, v) => { t[k] = v; return true; } });
  ctx.rec = rec; return ctx;
}
function makeEngine(store, extra) {
  const log = [];
  const sfx = {}; for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'podAppear']) sfx[n] = () => log.push(n);
  return Object.assign({ ctx: makeCtx(), canvas: { style: {} }, log,
    music: { attach: noop, setMuted: noop, isMuted: () => false, playTitle: noop, playBody: (b) => log.push('body:' + b), stopAll: noop, stopJingle: noop, playJingle: () => log.push('jingle'), duck: noop, tick: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } }, extra || {});
}
const prof = (n) => [['profiles', JSON.stringify([{ name: n, key: 'a'.repeat(64) }])], ['activeProfile', n], ['lastName', n], ['hudTipSeen', '1'], ['howtoSkip', '1'], ['touchHintSeen', '1']];
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, t0: clock + 1 });

// ===== 1. 一覧と保存 =====
{
  ok(EXP_MISSIONS.map((m) => m.id).join() === 'ryugu,phobos,enceladus,67p', 'missions in tour order');
  ok(['moon', 'mars', 'titan', 'pluto'].every((b, i) => expForBody(b) === EXP_MISSIONS[i]) && expForBody('io') === null, 'POD bodies: moon / mars / titan / pluto only');
  ok(XD.XP_STARS_MAX === 12, '12 expedition stars');
  const s = new Map(), st = makeEngine(s).storage;
  ok(XD.xpKey('A B', 'ryugu', 'best') === 'xp.A%20B.ryugu.best', 'key per pilot (encoded) and mission');
  ok(!XD.xpIsUnlocked(st, 'AAA', 'ryugu') && XD.xpUnlock(st, 'AAA', 'ryugu') && !XD.xpUnlock(st, 'AAA', 'ryugu') && XD.xpIsUnlocked(st, 'AAA', 'ryugu'), 'unlock once, saved');
  ok(!XD.xpIsUnlocked(st, 'BBB', 'ryugu'), 'unlock is per pilot');
  XD.xpStore(st, 'AAA', 'ryugu').set('best', JSON.stringify({ score: 5, stars: [true, true, false] }));
  const sum = XD.xpSummary(st, 'AAA');
  ok(sum.stars === 2 && sum.max === 12 && sum.list[0].unlocked && !sum.list[0].seen && !sum.list[1].unlocked, 'summary: stars / unlocked / seen');
  ok(s.get('lander11.exp.touch_and_go.best') === undefined, 'lab keys are not used by the main game');
  XD.__xpSetAll(true); ok(XD.xpIsUnlocked(st, 'ZZZ', '67p') && !XD.xpUnlockedSaved(st, 'ZZZ', '67p'), '?expedition=all unlocks without saving'); XD.__xpSetAll(false);
}

// ===== 2. POD の確率 =====
{
  ok([0, 1, 2, 3, 9].map(podChance).join() === '0.3,0.5,0.7,1,1', 'chance 30/50/70/100 (4th chance is sure)');
  const s = new Map(), st = makeEngine(s).storage, never = () => 0.999;
  const r = [0, 1, 2, 3].map(() => podPlan(st, 'AAA', 'moon', never));
  ok(r[0] === null && r[1] === null && r[2] === null && r[3] && r[3].id === 'ryugu', 'unlucky: appears on the 4th chance');
  ok(podPlan(st, 'AAA', 'io', () => 0) === null && podPlan(st, '', 'moon', () => 0) === null, 'no POD on other bodies / without a pilot');
  XD.xpUnlock(st, 'AAA', 'ryugu'); ok(podPlan(st, 'AAA', 'moon', () => 0) === null, 'no POD once unlocked');
  const a = podRng(5), b = podRng(5); ok(a() === b() && a() !== podRng(6)(), 'own RNG (does not use Math.random)');
}

// ===== 3. POD の動き（beta.9: 画面の中ほど・付いて来ない）=====
{
  const flat = () => 520;
  const sim = (pod, ship, alt, sec, mover, gnd) => { let got = null; for (let i = 0; i < sec * 60 && !got; i++) { if (mover) mover(ship, i); const ev = pod.step(1 / 60, ship, alt(ship), gnd || flat); if (ev === 'got') got = ev; } return got; };
  const p = new Pod('ryugu', podRng(1)), ship = { x: 100, y: 120 };
  sim(p, ship, () => 400, 2.0); ok(p.state === 'wait', 'does not appear while the ship is still high');
  ship.y = 210; const ev = p.step(1 / 60, ship, 300, flat);
  ok(ev === 'appear' && p.state === 'float', 'appears when the ship reaches mid-screen (appear event for the sound)');
  ok(p.x >= ship.x + POD.dx0 - 1 && p.x <= ship.x + POD.dx1 + 1 && p.y >= ship.y + POD.dy0 - 1 && p.y <= ship.y + POD.dy1 + 1, 'on the other side, a little lower: ' + p.x.toFixed(0) + ',' + p.y.toFixed(0));
  const x0 = p.ax, y0 = p.ay; let far = 0;
  for (let i = 0; i < 300; i++) { ship.x = 60 + (i % 40); p.step(1 / 60, ship, 300, flat); far = Math.max(far, Math.hypot(p.x - x0, p.y - y0)); }
  ok(p.state === 'float' && far < POD.sway + POD.bob + 2, 'stays where it is (does not follow the ship): ' + far.toFixed(1));
  const got = sim(p, ship, () => 300, 8, (s) => { const dx = p.x - s.x, dy = p.y - s.y, d = Math.hypot(dx, dy) || 1; s.x += dx / d; s.y += dy / d; });   // 60 px/s で寄せる
  ok(got === 'got', 'steering the ship to it grabs it');
  const q = new Pod('ryugu', podRng(2)), s2 = { x: 100, y: 210 }; q.step(1 / 60, s2, 300, flat);
  s2.y = q.y + POD.below + 5; q.step(1 / 60, s2, 200, flat); ok(q.state === 'leave', 'leaves upward when the ship goes well below it');
  for (let i = 0; i < 120; i++) q.step(1 / 60, s2, 120, flat); ok(q.state === 'gone', 'then gone');
  const L = new Pod('ryugu', podRng(4)), s3 = { x: 100, y: 210 }; L.step(1 / 60, s3, 300, flat); sim(L, s3, () => 300, POD.life + 0.2);
  ok(L.state === 'leave' || L.state === 'gone', 'leaves after ' + POD.life + ' s');
  const r = new Pod('ryugu', podRng(3)); r.step(1 / 60, { x: 100, y: 250 }, 100, flat); ok(r.state === 'gone', 'does not appear if the ship is already low');
  const hi = new Pod('ryugu', podRng(5)); hi.step(1 / 60, { x: 100, y: 210 }, 300, () => 230); ok(hi.state === 'gone', 'no room above high ground: not shown');
  let inside = true; for (const sx of [20, 90, 180, 270, 340]) { const z = new Pod('ryugu', podRng(sx)); z.step(1 / 60, { x: sx, y: 220 }, 300, flat); inside = inside && z.state === 'float' && z.x >= 24 && z.x <= 336 && Math.abs(z.x - sx) >= POD.dx0 - 1; }
  ok(inside, 'always on screen and at least ' + POD.dx0 + ' px to the side');
}

// ツアーの POD を浮かせる（機体を画面の中ほどへ）
function floatPod(g) { for (let i = 0; i < 30 && g._pod.state === 'wait'; i++) { g.y = 220; g.vy = 0; g.update(1 / 60); clock += 16; } }

// ===== 4. ツアー: POD を取る → ステージ後に MISSION ACCEPTED（2つのボタン）=====
{
  const s = new Map(prof('AAA')); s.set(XD.xpKey('AAA', 'ryugu', 'podMiss'), '3');   // 4 回目の機会 = 必ず出る
  const e = makeEngine(s, { pods: true }), g = new Game(e); g.enter();
  ok(g._body.id === 'moon' && g._pod && g._pod.id === 'ryugu', 'moon stage 1 gets a POD on the 4th chance');
  const off = new Game(makeEngine(new Map(prof('AAA')))); off.enter(); ok(!off._pod, 'no POD unless engine.pods (existing tests and debug engines)');
  floatPod(g);
  ok(g._pod.state === 'float' && e.log.includes('podAppear'), 'POD appears at mid-screen with a sound');
  const rc = makeCtx(); g.render(rc); ok(rc.rec.texts.includes('POD'), 'POD label drawn');
  g.x = g._pod.x; g.y = g._pod.y; g.update(1 / 60);
  ok(XD.xpUnlockedSaved(e.storage, 'AAA', 'ryugu') && g._podGot === 'ryugu' && e.log.includes('power'), 'picked up: unlocked and saved immediately, sound');
  const rt = makeCtx(); g.render(rt); ok(rt.rec.texts.includes('MISSION POD RECEIVED'), 'small toast, play continues');
  ok(g.state === 'play' && !g._podShow, 'no interruption during play');
  g._doCrash('TEST', 'forced'); clock += 16;
  for (let i = 0; i < 90 && !g._podShow; i++) { g.update(1 / 60); clock += 16; }
  ok(g._podShow && g._podShow.id === 'ryugu' && g._podShow.kind === 'pod', 'after the stage ends (crash), the full-screen presentation starts');
  const st0 = g.state; const t0 = g._podShow.t; for (let i = 0; i < 30; i++) g.update(1 / 60); ok(g.state === st0 && g._podShow.t > t0, 'game frozen under the presentation');
  ok(g.blocksBack(), 'BACK blocked while shown');
  for (let i = 0; i < 30; i++) g.update(1 / 60);
  g.onInput('tap', { x: 180, y: 300, t0: clock + 1 }); ok(g._podShow.t >= XP_ACC.close, 'tap skips to the end');
  g.onInput('tap', center(XP_BTN.go)); ok(g._podShow, 'buttons ignore taps for a moment (no accidental press)');
  for (let i = 0; i < 40; i++) g.update(1 / 60);
  ok(e.log.includes('jingle'), 'stamp jingle');
  const ra = makeCtx(); g.render(ra); ok(['MISSION ACCEPTED', 'MISSION POD RECEIVED', 'RYUGU'].every((x) => ra.rec.texts.includes(x)) && ra.rec.texts.some((x) => x === 'ツアーを続ける' || x === 'CONTINUE TOUR') && ra.rec.texts.some((x) => /^(いま向かう|GO NOW)  ▸  RYUGU$/.test(x)), 'presentation draws name, stamp and the two buttons');
  for (let i = 0; i < 600; i++) g.update(1 / 60); ok(!!g._podShow, 'does not close by itself (the player chooses)');
  g.onInput('tap', { x: 180, y: 300, t0: clock + 1 }); ok(!!g._podShow, 'tap outside the buttons does nothing');
  g.onInput('tap', center(XP_BTN.tour)); ok(!g._podShow && g.state === st0, 'CONTINUE TOUR closes it, tour goes on');
  // 文字送りの途中も落ちない
  for (const t of [0, 0.5, 1.6, 2.0, 2.6, 3.1, 4]) for (const kind of ['pod', 'offer']) { try { xpDrawAccepted(makeCtx(), { id: '67p', t, kind }, 1); } catch (er) { ok(false, 'draw at ' + t + ': ' + er); } }
  // 解放済み → もう出ない
  const g2 = new Game(makeEngine(s, { pods: true })); g2.enter(); ok(!g2._pod, 'no POD after unlocking');
}

// ===== 5. マップ: ★60・正体が現れる・解放済みは開始できる =====
{
  const s = new Map(prof('AAA')); s.set('progress', JSON.stringify({ AAA: { maxStage: 3 } }));
  s.set(XD.xpKey('AAA', 'phobos', 'unlocked'), '1');
  const went = []; const e = makeEngine(s, { toExpedition: (id) => went.push(id) });
  const t = new TitleScene(e, noop, { launch: false }); t.enter(); t.update(0.016);
  t.onInput('tap', center(t.mapBtn)); const m = t.map;
  ok(m && m.exp.list.length === 4 && m.XP.phobos.unlocked && !m.XP.ryugu.unlocked, 'map gets the pilot expedition state');
  ok(m.reveal.phobos !== undefined && s.get(XD.xpKey('AAA', 'phobos', 'seen')) === '1', 'first open after unlock: reveal animation, marked seen');
  m.introT = 1.6; for (let i = 0; i < 80; i++) t.update(0.05);
  const rc = makeCtx(); t.render(rc);
  ok(rc.rec.texts.includes('PHOBOS') && rc.rec.texts.filter((x) => x === '???').length === 3, 'revealed name, others still ???');
  ok(rc.rec.texts.some((x) => /^★ \d+ \/ 60$/.test(x)), 'total ★ / 60');
  const r = m.soonRects().find((q) => q.id === 'phobos'); t.onInput('tap', center(r));
  ok(went.join() === 'phobos' && t.map === null, 'tap an unlocked mission → expedition scene (map closes)');
  const t2 = new TitleScene(e, noop, { launch: false }); t2.enter(); t2.onInput('tap', center(t2.mapBtn));
  ok(t2.map.reveal.phobos === undefined, 'reveal only once');
  const t3 = new TitleScene(e, noop, { launch: false, openMap: true }); t3.enter(); ok(!!t3.map, 'back from a mission: title opens with the map');
  // ズーム: 地球系のカードに RYUGU（未解放）
  ok(m.cards('earth').some((c) => c.kind === 'exp' && c.id === 'ryugu') && m.cards('pluto').some((c) => c.kind === 'exp' && c.id === '67p'), 'mission cards in earth / pluto systems');
  const sm = new SolarMap({ list: [], summary: starsSummary(e.storage, 'AAA') }); ok(sm.exp.list.length === 0 && sm.soonRects().length === 0, 'map without expedition data still works');
}

// ===== 6. ミッション画面（埋め込み）=====
for (const M of EXP_MISSIONS) {
  const s = new Map(prof('AAA')); let back = 0;
  const e = makeEngine(s); const sc = new ExpeditionScene(e, M.id, () => { back++; });
  const n0 = listeners.length;
  let err = null;
  try {
    sc.enter();
    ok(listeners.length > n0 && e.log.includes('body:' + M.music), M.id + ': entered (listeners, music)');
    for (let i = 0; i < 30; i++) { sc.update(1 / 60); sc.render(e.ctx); }
    const lab = sc.lab, sh = lab.shell;
    ok(lab.embedded && lab.m.menu === true, M.id + ': starts at its menu');
    sc.onInput('tap', center(sh.BTN.practice)); ok(sh.sess.mode === 'practice', M.id + ': PRACTICE from a tap');
    if (sh.sess.brief) sc.onInput('tap', { x: 180, y: 300 });
    if (lab.m.waiting || lab.m.docked) sc.onInput('tap', { x: 180, y: 300 });   // 開始待ち（#1 は係留の解放）
    e.touches = [{ x: 180, y: 600 }];   // 噴射ボタンを押し続ける
    for (let i = 0; i < 90; i++) { sc.update(1 / 60); sc.render(e.ctx); }
    ok(lab.input.main === true || lab.m.result, M.id + ': engine touches drive the controls');
    e.touches = [];
    sc.onInput('back'); ok(lab.m.menu === true, M.id + ': Escape → its menu');
    // 記録はパイロットごとのキーへ
    sh.begin(lab, 'mission'); sh.complete({ t: 30, base: 1000, fuel: 50 }, [true, false, false]);
    ok(s.has(XD.xpKey('AAA', M.id, 'best')) && !s.has('lander11.exp.' + M.shellId + '.best'), M.id + ': record saved per pilot (not the lab key)');
    sh.begin(lab, 'menu'); sc.onInput('tap', center(sh.BTN.back)); ok(back === 1, M.id + ': MAP button → back to the map');
    sc.exit(); ok(listeners.length === n0, M.id + ': listeners removed on exit');
  } catch (er) { err = er; }
  ok(!err, M.id + ': no exception ' + (err && err.stack));
}

// ===== 7. 説明カードの英語（文が全部ある）=====
{
  const s = new Map(prof('AAA')); s.set('lang', 'en');
  for (const M of EXP_MISSIONS) {
    const e = makeEngine(s); const sc = new ExpeditionScene(e, M.id, noop); sc.enter();
    const sh = sc.lab.shell; sc.onInput('tap', center(sh.BTN.help));
    e.ctx.rec.texts.length = 0; sc.render(e.ctx); const tx = e.ctx.rec.texts;   // ミッションはエンジンの ctx に描く
    const jp = tx.filter((x) => /[぀-ヿ一-鿿]/.test(x));
    ok(sh.sess.brief === 'view' && tx.includes('GOALS') && tx.includes(M.title.split(' ')[0] === 'COMET' ? 'COMET 67P — ANCHOR' : tx.find((x) => x.includes('—'))) && !jp.length, M.id + ': EN briefing has no Japanese text ' + sh.sess.brief + ' ' + JSON.stringify(jp));
    sc.exit();
  }
}

// ===== 9. 寄り道: いま向かう → ミッション → ツアーへ戻る（ランの状態はそのまま）=====
{
  const s = new Map(prof('AAA')); s.set(XD.xpKey('AAA', 'ryugu', 'podMiss'), '3');
  const e = makeEngine(s, { pods: true });
  e.changeScene = (sc) => { if (e.scene && e.scene.exit) e.scene.exit(); e.scene = sc; if (sc.enter) sc.enter(); };
  e.toDetour = (id, game) => e.changeScene(new ExpeditionScene(e, id, () => e.changeScene(game), { detour: true }));
  const g = new Game(e); e.scene = g; g.enter();
  floatPod(g); g.x = g._pod.x; g.y = g._pod.y; g.update(1 / 60);
  g._doCrash('TEST', 'forced'); clock += 16;
  for (let i = 0; i < 90 && !g._podShow; i++) { g.update(1 / 60); clock += 16; }
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  g.onInput('tap', { x: 180, y: 300, t0: clock + 1 }); for (let i = 0; i < 30; i++) g.update(1 / 60);
  const before = { state: g.state, stage: g.stage, score: g.totalScore, cont: g.continues, run: g.runId };
  g.onInput('tap', center(XP_BTN.go));
  const sc = e.scene;
  ok(sc instanceof ExpeditionScene && sc.detour && sc.id === 'ryugu', 'GO NOW → the expedition (detour)');
  const sh = sc.lab.shell;
  ok(sh.detour && sh.sess.mode === 'mission' && sh.sess.lives === 3 && sh.sess.brief === 'start' && !sc.lab.m.menu, 'starts in MISSION (3 lives) with the briefing, no menu');
  ok(XD.xpPlayed(e.storage, 'AAA', 'ryugu'), 'marked as played');
  sc.onInput('tap', { x: 180, y: 300, t0: clock + 1 }); ok(!sh.sess.brief, 'briefing closes with a tap');
  for (let i = 0; i < 20; i++) { sc.update(1 / 60); sc.render(e.ctx); }
  sc.lab.controlsEnabled = false; sc.lab.m.waiting = false; sc.lab.m.result = 'lose'; sc.lab.m.failed = true; sc.lab.m.lifeLost = false; sc.lab.m.resultT = 2; sc.lab.m.reason = 'X'; sc.lab.m.detail = 'Y';
  e.ctx.rec.texts.length = 0; let rerr = null; try { sc.render(e.ctx); } catch (er) { rerr = er; }
  ok(!rerr && e.ctx.rec.texts.some((x) => x === 'ツアーへ戻る' || x === 'BACK TO TOUR') && !e.ctx.rec.texts.includes('RETRY MISSION'), 'result screen: only BACK TO TOUR ' + (rerr || ''));
  const oy = sc.lab.m.result === 'win' ? 478 : 330;
  sc.onInput('tap', { x: 180, y: oy + 24, t0: clock + 1 });
  ok(e.scene === g, 'BACK TO TOUR → the same tour');
  ok(g.state === before.state && g.stage === before.stage && g.totalScore === before.score && g.continues === before.cont && g.runId === before.run, 'run state kept (stage, score, continues)');
  ok(g._resumeT > 0 && !g._suspended && !g._podShow, 'fade back in, ready');
  g.update(1 / 60); g.render(makeCtx());
  // Escape でもツアーへ戻る
  g._podShow = { id: 'ryugu', t: XP_ACC.close + 1, kind: 'offer', stamped: true }; g.onInput('tap', center(XP_BTN.go));
  ok(e.scene instanceof ExpeditionScene, 'second detour');
  e.scene.onInput('back'); ok(e.scene === g && g.stage === before.stage, 'Escape in a detour → back to the tour');
  // Enter / Space = ツアーを続ける
  g._podShow = { id: 'ryugu', t: XP_ACC.close + 1, kind: 'offer', stamped: true }; g.onInput('confirm', {}); ok(!g._podShow && e.scene === g, 'Enter = continue tour');
  // 地図から開いた探査はメニューから（寄り道ではない）
  const m2 = new ExpeditionScene(makeEngine(new Map(prof('AAA'))), 'phobos', noop); m2.enter(); ok(m2.lab.m.menu === true && !m2.lab.shell.detour, 'from the map: menu as before'); m2.exit();
}

// ===== 10. 再案内: 解放済みで未挑戦なら、その天体のステージをクリアした後に1回（ランごと）=====
{
  const s = new Map(prof('AAA')); s.set(XD.xpKey('AAA', 'ryugu', 'unlocked'), '1');
  const e = makeEngine(s, { pods: true }), g = new Game(e); g.enter();
  ok(!g._pod && g._offerId === 'ryugu', 'unlocked, not played: offer planned for this moon stage');
  for (let i = 0; i < 20; i++) g.update(1 / 60); ok(!g._podShow, 'not during play');
  g.state = 'cleared'; const jl = e.log.filter((x) => x === 'jingle').length;
  for (let i = 0; i < 90 && !g._podShow; i++) { g.update(1 / 60); clock += 16; }
  ok(g._podShow && g._podShow.kind === 'offer' && g._podShow.id === 'ryugu', 'after clearing: EXPEDITION READY');
  for (let i = 0; i < 60; i++) g.update(1 / 60);
  const rc = makeCtx(); g.render(rc); ok(rc.rec.texts.includes('EXPEDITION READY') && !rc.rec.texts.includes('MISSION ACCEPTED') && e.log.filter((x) => x === 'jingle').length === jl, 'offer: no stamp, no jingle');
  g.onInput('tap', center(XP_BTN.tour)); ok(!g._podShow, 'declined');
  g._podInit(); ok(g._offerId === null, 'only once per run');
  const g2 = new Game(makeEngine(s, { pods: true })); g2.enter(); ok(g2._offerId === 'ryugu', 'asked again on the next run');
  XD.xpMarkPlayed(e.storage, 'AAA', 'ryugu'); const g3 = new Game(makeEngine(s, { pods: true })); g3.enter(); ok(g3._offerId === null, 'not asked once played');
  const s4 = new Map(prof('AAA')); s4.set(XD.xpKey('AAA', 'ryugu', 'unlocked'), '1'); s4.set(XD.xpKey('AAA', 'ryugu', 'best'), JSON.stringify({ score: 1, stars: [true, false, false] }));
  ok(XD.xpPlayed(makeEngine(s4).storage, 'AAA', 'ryugu'), 'a saved record counts as played');
  const g5 = new Game(makeEngine(s4)); g5.enter(); ok(g5._offerId === null || g5._offerId === undefined, 'no offer without engine.pods');
}

// ===== 11. ゲームオーバー画面の入口 =====
{
  const s = new Map(prof('AAA')); s.set(XD.xpKey('AAA', 'phobos', 'unlocked'), '1');
  const went = []; const e = makeEngine(s, { pods: true, toExpedition: (id) => went.push(id) }), g = new Game(e); g.enter();
  g._gameOver(); ok(g.state === 'gameover' && g._xpEntry === 'phobos', 'game over: unplayed expedition offered');
  const rc = makeCtx(); g.render(rc); ok(rc.rec.texts.some((x) => x.startsWith('PHOBOS')) && rc.rec.texts.some((x) => x === '未挑戦の探査があります' || x === 'NEW EXPEDITION READY'), 'entrance drawn');
  g._inputLock = 0; g.onInput('tap', center(g._xpEntryRect())); ok(went.join() === 'phobos', 'tap → the expedition');
  const s2 = new Map(prof('AAA')); const g2 = new Game(makeEngine(s2, { pods: true, toExpedition: noop })); g2.enter(); g2._gameOver(); ok(!g2._xpEntry, 'nothing unlocked: no entrance');
}

// ===== 8. バンドル（1 ファイルのクラシックスクリプト）が読み込めて、閉じたスコープが効いている =====
{
  const src = fs.readFileSync(new URL('../02_src/lander.bundle.js', import.meta.url), 'utf8');
  ok(/const EXP_index = \(function \(\) \{/.test(src) && /const EXP_m4 = \(function/.test(src), 'bundle wraps expedition modules');
  let err = null; try { new vm.Script(src); } catch (er) { err = er; }
  ok(!err, 'bundle parses: ' + (err && err.message));
}

console.log('p24expedition: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
