// p17patch — ミッションパッチ（天体ごと・PERFECT で獲得）。実行: node 04_tests/p17patch.mjs（lander-1.1/ から）
import './p10setup.mjs';
import { Game } from '../02_src/game.js';
import { TitleScene } from '../02_src/title.js';
import { BODIES } from '../02_src/bodies.js';
import { setDebug } from '../02_src/debug.js';
import { __setRelayUrl } from '../02_src/net.js';
import { starsSummary, readStageBest } from '../02_src/stars.js';
import { patchesSummary, patchCount, patchIsNew, patchAwardView, drawMissionPatch, PATCH_AWARD_S, PATCH_CHIME_S, PATCH_COUNT } from '../02_src/patches.js';
import { Music } from '../02_src/music.js';
import { WHATSNEW } from '../02_src/whatsnew.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL:', m); } };
const noop = () => {};
const DT = 1 / 60;
let clock = 1000;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clock }, configurable: true });
setDebug(false); __setRelayUrl('');

// 描画を記録する ctx（fillText・clip・arc の回数）
function makeCtx(rec) {
  const state = { globalAlpha: 1, letterSpacing: '0px', font: '10px sans', fillStyle: '', strokeStyle: '', lineWidth: 1 };
  return new Proxy(state, {
    get: (t, k) => {
      if (k === 'measureText') return (s) => ({ width: String(s).length * 5 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'fillText') return (s, x, y) => { rec.texts.push({ s: String(s), x, y }); };
      if (k === 'clip') return () => { rec.clips++; };
      return k in t ? t[k] : noop;
    },
    set: (t, k, v) => { t[k] = v; return true; } });
}
const newRec = () => ({ texts: [], clips: 0 });
const has = (rec, s) => rec.texts.some((t) => t.s === s);

function makeEngine(extra = [], opts = {}) {
  const store = new Map([['hudTipSeen', '1'], ['touchHintSeen', '1'], ...extra]);
  const sfxLog = [];
  const sfx = {};
  for (const n of ['landing', 'crash', 'module', 'launch', 'uiTap', 'thud', 'tick', 'ring', 'power', 'patch']) sfx[n] = (a) => sfxLog.push([n, a]);
  return { store, sfxLog,
    music: { attach: noop, setMuted: noop, isMuted: () => !!opts.muted, playTitle: noop, playBody: noop, stopAll: noop, stopJingle: noop, playJingle: noop, tick: noop, duck: noop, sfx },
    audio: { ctx: null, enabled: true, good: noop, bad: noop, beep: noop, unlock: noop },
    storage: { getHigh: () => 0, setHigh: () => false, get: (k, d = null) => store.has(k) ? store.get(k) : d, set: (k, v) => { store.set(k, String(v)); return true; } },
    text: noop, rect: noop, stroke: noop, toMenu: noop, pointer: { down: false, x: 0, y: 0 }, touches: [], backBtn: { x: 6, y: 8, w: 42, h: 36 } };
}
const prof = (...names) => [['profiles', JSON.stringify(names.map((n, i) => ({ name: n, key: String(i + 1).repeat(64) })))], ['activeProfile', names[0]], ['lastName', names[0]]];
function newGame(extra = [], opts) { const e = makeEngine(extra, opts); const g = new Game(e); g.enter(); return { e, g }; }
const run = (g, sec) => { for (let i = 0, n = Math.round(sec / DT); i < n; i++) { g.update(DT); clock += 16; } };
const onPad = (g) => { g.x = g.pad.x + g.pad.w / 2; g.y = g._terrainYAt(g.x) - 16; };
const stageGame = (stage, extra, opts) => { const r = newGame(extra, opts); r.g.stage = stage; r.g.bonus = null; r.g._initStage(); r.g.obstacles = []; return r; };
const landPerfect = (g) => { onPad(g); g.vx = 0; g.vy = 1; g.angle = 0; g.omega = 0; g._doSuccess(0, 0); };
const landSoso = (g) => { onPad(g); g.vx = 0; g.vy = 14; g.angle = 0; g.omega = 0; g._doSuccess(0, 0); };
const BODYORD = ['moon', 'europa', 'io', 'mars', 'titan', 'venus', 'mercury'];
const bodyAt = (stage) => BODYORD[Math.floor(((stage - 1) % 14) / 2)];

// ---------- 1. 導出（stageBest が正）----------
{
  const m = new Map([...prof('AAA'), ['stageBest', JSON.stringify({
    AAA: { 3: { grade: 'PERFECT', stars: 7 },        // europa（1周目）
           29: { grade: 'PERFECT', stars: 5 },        // 3周目の moon（ステージ29 = 28+1）
           10: { grade: 'S', stars: 3 },              // titan: PERFECT ではない
           55: { grade: 'PERFECT', stars: 7 } },      // 4周目の mercury（ステージ55 = 42+13）
    BBB: { 1: { grade: 'A', stars: 3 } } }) ]]);
  const st = { get: (k, d = null) => m.has(k) ? m.get(k) : d, set: (k, v) => { m.set(k, String(v)); return true; } };
  const sm = patchesSummary(st, 'AAA'), by = Object.fromEntries(sm.map((x) => [x.id, x.earned]));
  ok(sm.length === BODIES.length && PATCH_COUNT === BODIES.length && sm.every((x, i) => x.id === BODIES[i].id && x.name === BODIES[i].name && typeof x.earned === 'boolean'), 'summary: one entry per body, in order, {id,name,earned}');
  ok(by.europa === true, 'stage 3 PERFECT -> EUROPA patch');
  ok(by.moon === true, 'a later loop (stage 29 = loop 3 MOON) counts');
  ok(by.mercury === true, 'stage 55 (loop 4, MERCURY) counts');
  const bit = new Map([['stageBest', JSON.stringify({ DDD: { 7: { grade: '', stars: 4 } } })]]);   // io: grade 空でも ★3 のビットだけで導く
  ok(patchesSummary({ get: (k, d = null) => bit.has(k) ? bit.get(k) : d }, 'DDD').find((x) => x.id === 'mars').earned === true, 'PERFECT star bit alone also counts (stage 7 = mars)');
  ok(by.titan === false && by.mars === false && by.venus === false, 'S grade / no record -> not earned');
  ok(patchCount(sm) === 3 && by.io === false, 'count = earned entries (' + patchCount(sm) + ')');
  ok(patchesSummary(st, 'BBB').every((x) => !x.earned), 'pilot scope: BBB (A grade only) has none');
  ok(patchesSummary(st, 'NOBODY').every((x) => !x.earned) && patchesSummary(st, '').every((x) => !x.earned) && patchesSummary(st, '__proto__').every((x) => !x.earned), 'unknown / empty / __proto__ pilot: none');
  // 2つ目のステージだけでも、最初のステージが未記録でも獲得
  const m2 = new Map([['stageBest', JSON.stringify({ CCC: { 12: { grade: 'PERFECT', stars: 7 } } })]]);   // stage 12 = loop0, venus(index 5)
  const s2 = { get: (k, d = null) => m2.has(k) ? m2.get(k) : d };
  ok(patchesSummary(s2, 'CCC').find((x) => x.id === 'venus').earned === true && patchCount(patchesSummary(s2, 'CCC')) === 1, 'any stage of the body (second stage only) counts');
  // stageBest が正: 壊れた/空の保存値でも落ちない
  ok(patchesSummary({ get: () => '{oops' }, 'AAA').every((x) => !x.earned) && patchesSummary({ get: () => null }, 'AAA').length === BODIES.length, 'corrupt/empty storage -> all unearned, no throw');
  // starsSummary と矛盾しない: 最高グレードが PERFECT の天体は必ず earned
  const ss = starsSummary(st, 'AAA');
  ok(ss.bodies.every((b, i) => b.grade !== 'PERFECT' || sm[i].earned), 'consistent with starsSummary (best grade PERFECT => earned)');
}

// ---------- 2. 純関数 ----------
{
  const before = [{ id: 'moon', earned: true }, { id: 'europa', earned: false }];
  ok(patchIsNew(before, 'europa', 'PERFECT') === true, 'new patch: first PERFECT on the body');
  ok(patchIsNew(before, 'moon', 'PERFECT') === false, 'not new: already earned');
  ok(patchIsNew(before, 'europa', 'S') === false && patchIsNew(before, 'europa', '') === false, 'not new: grade below PERFECT');
  ok(patchIsNew(before, 'nowhere', 'PERFECT') === false && patchIsNew(null, 'moon', 'PERFECT') === false, 'unknown body / no data: false');
  const v0 = patchAwardView(0), vm = patchAwardView(PATCH_CHIME_S + 0.1), ve = patchAwardView(PATCH_AWARD_S + 0.01), vn = patchAwardView(null);
  ok(v0.fly === 0 && v0.flash === 0 && v0.text === 0 && !v0.done, 'award view at 0: not started');
  ok(patchAwardView(-1).fly === 0 && !patchAwardView(-1).done, 'negative time clamps');
  ok(vm.fly === 1 && vm.flash > 0 && vm.flash < 1 && vm.text > 0 && !vm.done, 'just after landing: flash + text starting');
  ok(ve.done && ve.fly === 1 && ve.flash === 1 && ve.text === 1 && vn.done, 'finished (and null = finished)');
  ok(PATCH_CHIME_S < PATCH_AWARD_S, 'chime inside the award window');
}

// ---------- 3. 描画（全天体・取得/未取得）----------
{
  let threw = false; const clipsE = [], clipsU = [];
  for (const b of BODIES) {
    for (const earned of [true, false]) for (const r of [4.6, 9, 17, 26]) {
      const rec = newRec();
      try { drawMissionPatch(makeCtx(rec), b.id, 100, 100, r, { earned, rim: r >= 18 }); } catch (e) { threw = true; console.log(e); }
      if (r === 26) (earned ? clipsE : clipsU).push(rec);
    }
  }
  ok(!threw, 'every patch renders at every size, earned and unearned');
  ok(clipsE.every((c) => c.clips >= 1) && clipsU.every((c) => c.clips === 0), 'earned patches draw a pictogram (clip); unearned are an outline only');
  ok(clipsU.every((c) => has(c, '?')) && clipsE.every((c) => !has(c, '?')), 'unearned shows ?, earned does not');
  ok(clipsE.every((c, i) => c.texts.map((t) => t.s).join('') === BODIES[i].name), 'earned large patch has the body name on the rim (letter by letter)');
  const r0 = newRec(); drawMissionPatch(makeCtx(r0), 'moon', 0, 0, 9, { earned: false, q: false });
  ok(!has(r0, '?'), 'q:false hides the ?');
}

// ---------- 4. ゲーム: 獲得は初回のみ・パイロット別・デバッグ/ボーナス除外 ----------
{
  const a = stageGame(3, prof('AAA'));   // europa
  landPerfect(a.g);
  ok(a.g._patchInfo && a.g._patchInfo.id === 'europa' && a.g._patchInfo.name === 'EUROPA', 'first PERFECT on EUROPA earns the patch');
  ok(patchesSummary(a.e.storage, 'AAA').find((x) => x.id === 'europa').earned === true, 'and it is derived from stageBest right away');
  ok(Object.keys(readStageBest(a.e.storage).AAA).length === 1 && a.e.store.size > 0 && !a.e.store.has('patches') && !a.e.store.has('patchAt'), 'no new storage key; stageBest is the source of truth');
  // 同じ天体の別ステージ（stage 4）の PERFECT は新規ではない
  const st = new Map(a.e.store);
  const b = stageGame(4, [...st.entries()]); landPerfect(b.g);
  ok(b.g._patchInfo === null && b.g._starsInfo && (b.g._starsInfo.fresh & 4) === 4, 'second EUROPA stage PERFECT: stars yes, patch not again');
  // 次の天体（io, stage 5）は新規
  const c = stageGame(5, [...st.entries()]); landPerfect(c.g);
  ok(c.g._patchInfo && c.g._patchInfo.id === 'io', 'next body (IO) is a new patch');
  // 同じステージをもう一度 PERFECT: 新規ではない
  const d = stageGame(3, [...st.entries()]); landPerfect(d.g);
  ok(d.g._patchInfo === null, 'same stage again: no award');
  // PERFECT 未満では出ない
  const f = stageGame(7, prof('AAA')); landSoso(f.g);
  ok(f.g._grade !== 'PERFECT' && f.g._patchInfo === null && patchCount(patchesSummary(f.e.storage, 'AAA')) === 0, 'non-PERFECT landing: no patch (' + f.g._grade + ')');
  // 周回2以降でもその天体で初めてなら新規（stage 3+14 = 17）
  const g2 = stageGame(17, prof('AAA')); landPerfect(g2.g);
  ok(g2.g._patchInfo && g2.g._patchInfo.id === 'europa', 'loop 2 stage: counts for the body, earns if first');
  // 他のパイロットは別
  const h = stageGame(3, [...st.entries()].filter(([k]) => k !== 'activeProfile' && k !== 'profiles' && k !== 'lastName').concat(prof('BBB', 'AAA')));
  landPerfect(h.g);
  ok(h.g._patchInfo && h.g._patchInfo.id === 'europa' && patchesSummary(h.e.storage, 'AAA').find((x) => x.id === 'europa').earned, 'pilot scope: BBB earns EUROPA separately from AAA');
  // 既に PERFECT の記録があった人は演出なしで最初から獲得済み（自動）
  const legacy = stageGame(3, [...prof('LEG'), ['stageBest', JSON.stringify({ LEG: { 4: { grade: 'PERFECT', stars: 7 } } })]]);
  ok(patchesSummary(legacy.e.storage, 'LEG').find((x) => x.id === 'europa').earned === true, 'existing PERFECT records already count (no migration)');
  landPerfect(legacy.g); ok(legacy.g._patchInfo === null, 'legacy PERFECT holder: no award re-played');
  // デバッグ操作・デバッグモード・ボーナス: 記録なし・演出なし
  const d1 = stageGame(3, prof('DAN')); d1.g._dbgTainted = true; landPerfect(d1.g);
  ok(d1.g._patchInfo === null && !d1.e.store.has('stageBest'), 'debug-tainted run: no patch, nothing stored');
  setDebug(true); const d2 = stageGame(3, prof('DAN')); landPerfect(d2.g); setDebug(false);
  ok(d2.g._patchInfo === null && !d2.e.store.has('stageBest'), 'debug mode: no patch');
  const b1 = newGame(prof('EVE')); b1.g.stage = 3; b1.g.bonus = { type: 'CALM' }; b1.g._initStage(); b1.g.obstacles = []; landPerfect(b1.g);
  ok(b1.g._patchInfo === null && !b1.e.store.has('stageBest'), 'bonus stage: no patch');
  const n1 = stageGame(3); let thr = false; try { landPerfect(n1.g); } catch (_) { thr = true; }
  ok(!thr && n1.g._patchInfo === null, 'no pilot: no patch, no crash');
  // 次のステージに入ると演出状態は消える
  a.g._nextAfterClear(); ok(a.g._patchInfo === null || a.g.state !== 'cleared', 'leaving the clear screen does not leak patch state into play');
}

// ---------- 5. クリア画面の順序・音・タップでスキップ ----------
{
  const { e, g } = stageGame(3, prof('AAA'));
  landPerfect(g);
  const baseH = 216 + (g._breakdown && g._breakdown.length > 4 ? 10 : 0) + 42;
  ok(g._clearPanelRect().h === baseH + 46 && g._clearPanelRect().y + g._clearPanelRect().h < 455, 'panel has room for the patch row and still clears the pads (h=' + g._clearPanelRect().h + ')');
  run(g, 2.7); ok(g.state === 'cleared', 'cleared state reached');
  let rec = newRec(); g.render(makeCtx(rec));
  ok(!has(rec, 'PATCH EARNED — EUROPA') && !e.sfxLog.some((l) => l[0] === 'patch'), 'while counting: no patch text, no chime');
  run(g, 1.3);   // 集計が終わった
  const t0 = g._patchInfo.t0, end = g._clearEnd();
  ok(g._clearT >= end && g._starT < t0, 'count finished, stars popping first (starT=' + g._starT.toFixed(2) + ' < patch t0=' + t0.toFixed(2) + ')');
  ok(t0 >= 0.12 + 0.24 * 2 + 0.2, 'patch step is after the last star pop (t0=' + t0.toFixed(2) + ')');
  rec = newRec(); g.render(makeCtx(rec));
  ok(!has(rec, 'PATCH EARNED — EUROPA'), 'before its turn: no text yet');
  ok(g._clearView().patch && g._clearView().patch.pt < 0 && g._patchBusy(), 'clear view carries the patch step; busy');
  // 途中でタップ → パッチ演出の最後まで進める（次のステージには進まない）
  const sBefore = g.stage;
  run(g, t0 - g._starT + 0.05);
  ok(e.sfxLog.filter((l) => l[0] === 'patch').length === 0, 'no chime until the patch lands');
  run(g, PATCH_CHIME_S + 0.1);
  ok(e.sfxLog.filter((l) => l[0] === 'patch').length === 1, 'chime plays once when the patch lands');
  rec = newRec(); g.render(makeCtx(rec));
  ok(has(rec, 'PATCH EARNED — EUROPA'), 'text "PATCH EARNED — EUROPA" shown');
  run(g, PATCH_AWARD_S + 0.5);
  ok(!g._patchBusy() && e.sfxLog.filter((l) => l[0] === 'patch').length === 1, 'animation complete; chime not repeated');
  rec = newRec(); g.render(makeCtx(rec)); ok(has(rec, 'PATCH EARNED — EUROPA') && rec.texts.some((t) => /^TAP  · /.test(t.s)), 'final state shows patch text and the NEXT line below it');
  const slotY = rec.texts.find((t) => t.s === 'PATCH EARNED — EUROPA').y, nextY = rec.texts.find((t) => /^TAP  · /.test(t.s)).y;
  ok(nextY > slotY + 12 && g._clearPanelRect().y + g._clearPanelRect().h > nextY + 10, 'NEXT line sits below the patch row, inside the panel');
  g._inputLock = 0; g.onInput('tap', { x: 180, y: 300 });
  ok(g.state !== 'cleared' || g.stage === sBefore + 1 || g._clearT == null, 'tap after the animation advances');
}
{
  // タップでスキップ: 演出の途中で押すと最後まで進み、次のステージには進まない。もう一度押すと進む
  const { e, g } = stageGame(3, prof('AAA')); landPerfect(g);
  run(g, 4.0); g._inputLock = 0;
  const t0 = g._patchInfo.t0; run(g, Math.max(0, t0 - g._starT) + 0.2);
  ok(g._patchBusy() && g.state === 'cleared', 'mid patch animation');
  g.onInput('tap', { x: 180, y: 300 });
  ok(g.state === 'cleared' && !g._patchBusy() && g._starT >= 99, 'tap mid-animation: skip to the end (still on the clear screen)');
  const rec = newRec(); g.render(makeCtx(rec)); ok(has(rec, 'PATCH EARNED — EUROPA'), 'skipped state shows the earned text');
  g.onInput('tap', { x: 180, y: 300 });
  ok(g.state !== 'cleared' || g.stage === 4, 'second tap advances');
  // カウント中のタップは従来どおり集計を最後まで進めるだけ
  const x = stageGame(3, prof('XYZ')); landPerfect(x.g); run(x.g, 2.9); x.g._inputLock = 0;
  x.g.onInput('tap', { x: 180, y: 300 });
  ok(x.g.state === 'cleared' && x.g._clearT >= x.g._clearEnd() && !x.g._patchBusy(), 'tap while counting: jumps to the finished state (stars and patch included), still on the clear screen');
  { const r = newRec(); x.g.render(makeCtx(r)); ok(has(r, 'PATCH EARNED — XYZ'.replace('XYZ', 'EUROPA')), 'finished state shows the patch text'); }
  // 音: 演出を飛ばしたときはチャイムを鳴らさない（飛ばして得るのは最終状態のみ）
  ok(x.e.sfxLog.filter((l) => l[0] === 'patch').length === 0, 'skipping does not fire a late chime');
}
{
  // ミュート: _sfx が止める
  const { e, g } = stageGame(3, [...prof('AAA'), ['muted', '1']]); landPerfect(g);
  run(g, 4.2); run(g, g._patchInfo.t0 + PATCH_CHIME_S + 0.3);
  ok(g._patchInfo && g._starT > g._patchInfo.t0 + PATCH_CHIME_S && e.sfxLog.filter((l) => l[0] === 'patch').length === 0, 'muted: no chime (visual still plays)');
  // 新しい★が無いのにパッチだけ（その天体で PERFECT ★が既にあるのは矛盾するので、グレードのみの旧データ）でも出る
  const old = stageGame(3, [...prof('OLD'), ['stageBest', JSON.stringify({ OLD: { 3: { grade: 'S', stars: 3 } } })]]); landPerfect(old.g);
  ok(old.g._patchInfo && old.g._patchInfo.t0 > 0.2, 'patch after the stars for an upgraded record');
  // 通常の（パッチなし）PERFECT / 一般着陸ではパネルの高さも従来どおり
  const plain = stageGame(3, [...prof('AAA'), ['stageBest', JSON.stringify({ AAA: { 4: { grade: 'PERFECT', stars: 7 } } })]]); landPerfect(plain.g);
  ok(plain.g._patchInfo === null && plain.g._clearPanelRect().h === 216 + (plain.g._breakdown.length > 4 ? 10 : 0) + 42, 'no patch earned: panel height unchanged');
}

// ---------- 6. 太陽系マップ ----------
const title = (extra) => { const e = makeEngine(extra); const calls = { n: 0 }; const t = new TitleScene(e, () => { calls.n++; }, { launch: false }); t.enter(); t.update(0.016); return { e, t, calls }; };
const center = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2, now: 0, t0: 0 });
const runT = (t, sec) => { for (let i = 0; i < Math.round(sec / 0.05); i++) t.update(0.05); };
const bestOf = (o) => ['stageBest', JSON.stringify({ AAA: o })];
{
  const base = [...prof('AAA'), ['progress', JSON.stringify({ AAA: { maxStage: 14 } })]];
  const none = title([...base]), two = title([...base, bestOf({ 3: { grade: 'PERFECT', stars: 7 }, 9: { grade: 'PERFECT', stars: 5 } })]);
  for (const x of [none, two]) { x.t.onInput('tap', center(x.t.mapBtn)); x.t.map.introT = 1.6; runT(x.t, 1); }
  const rn = newRec(); none.t.render(makeCtx(rn)); const r2 = newRec(); two.t.render(makeCtx(r2));
  ok(has(rn, 'PATCH 0/7') && has(r2, 'PATCH 2/7'), 'map header: PATCH n/7 (' + r2.texts.filter((t) => /PATCH/.test(t.s)).map((t) => t.s).join(',') + ')');
  const star = r2.texts.find((t) => /^★ /.test(t.s)), pt = r2.texts.find((t) => t.s === 'PATCH 2/7'), sel = r2.texts.find((t) => t.s === 'SELECT DESTINATION');
  ok(star && pt && Math.abs(pt.x - star.x) < 2 && pt.y > star.y && pt.y < star.y + 24, 'PATCH n/7 sits right under the star total, same right edge');
  ok(pt.x <= 346 && pt.x - 8 * 8 > sel.x + 18 * 7 - 40, 'header text stays inside 360 and clear of the left title');
  ok(two.t.map.hasPatch('europa') && two.t.map.hasPatch('titan') && !two.t.map.hasPatch('io') && two.t.map.patchTotal().n === 2, 'map knows which bodies have patches (europa, titan)');
  ok(r2.clips - rn.clips >= 2, 'overview draws a badge for each earned patch (' + (r2.clips - rn.clips) + ' extra pictograms)');
  // ズーム: カードに取得/未取得を描く（io=未取得 europa=取得）
  const m = two.t.map; m.input('back'); runT(two.t, 1);
  two.t.onInput('tap', center(m.chipRects()[4])); for (let i = 0; i < 100 && !(m.view === 'zoom' && m.zProg === 1 && !m.ship.fl); i++) two.t.update(0.05);
  const z2 = newRec(); two.t.render(makeCtx(z2));
  const z0 = title([...base]); z0.t.onInput('tap', center(z0.t.mapBtn)); z0.t.map.introT = 1.6; runT(z0.t, 1); z0.t.onInput('tap', center(z0.t.map.chipRects()[4])); for (let i = 0; i < 100 && !(z0.t.map.view === 'zoom' && z0.t.map.zProg === 1 && !z0.t.map.ship.fl); i++) z0.t.update(0.05);
  const z1 = newRec(); z0.t.render(makeCtx(z1));
  
  ok(m.view === 'zoom' && z2.clips - z1.clips >= 1, 'zoomed JUPITER: the earned EUROPA card draws its patch pictogram (extra clips: ' + (z2.clips - z1.clips) + ')');
  ok(m.cards('jupiter').filter((c) => c.kind === 'body').length === 2, 'two body cards on Jupiter');
}

// ---------- 7. PILOTS のパッチケース ----------
{
  const bestA = bestOf({ 3: { grade: 'PERFECT', stars: 7 }, 5: { grade: 'PERFECT', stars: 7 }, 9: { grade: 'S', stars: 3 } });
  const { e, t, calls } = title([...prof('AAA', 'BBB'), bestA]);
  t.onInput('tap', center(t.changeBtn));
  ok(t.prof && t.prof.mode === 'list', 'PILOTS opens');
  const R = t._profRects(), ov = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  ok(R.rows.length === 2 && R.rows.every((r) => r.patch && r.patch.w >= 44 && r.patch.h >= 44 && r.pin.w >= 44 && r.del.w >= 44 && r.sel.w >= 100), 'each row: PATCH/PIN/DEL buttons >= 44px and a usable name area');
  ok(R.rows.every((r) => !ov(r.sel, r.patch) && !ov(r.patch, r.pin) && !ov(r.pin, r.del) && r.del.x + r.del.w <= 340 - 8), 'row buttons do not overlap and stay inside the panel');
  ok(R.rows[0].del.y + 44 < R.add.y && !ov(R.rows[1].del, R.add), 'rows clear of ADD PILOT');
  let rec = newRec(); t.render(makeCtx(rec)); ok(rec.texts.filter((x) => x.s === 'PATCH').length === 2, 'PATCH button drawn on each pilot row');
  t.onInput('tap', center(R.rows[0].patch));
  ok(t.prof && t.prof.mode === 'patches' && t.prof.target === 'AAA' && calls.n === 0, 'row PATCH button opens the patch case for that pilot');
  rec = newRec(); t.render(makeCtx(rec));
  ok(has(rec, 'PATCHES') && has(rec, 'AAA') && has(rec, '2 / 7') && has(rec, 'BACK'), 'patch case: title, pilot, count, BACK');
  ok(rec.texts.filter((x) => x.s === '?').length === 5, 'unearned patches show ? (5 of 7)');
  ok(BODIES.every((b) => has(rec, b.name)), 'all seven body names labelled');
  ok(rec.clips >= 2, 'earned patches are drawn with pictograms');
  const R2 = t._profRects();
  ok(R2.cells.length === 7 && R2.pbk.h >= 44 && R2.pbk.w >= 44 && R2.cells.every((c) => c.w >= 44 && c.h >= 44 && c.x >= 20 && c.x + c.w <= 340 && c.y + c.h <= R2.pbk.y), 'grid of 7 cells, BACK >= 44px, all inside the panel and above BACK');
  const ids = BODIES.map((b) => b.id);
  t.onInput('tap', center(R2.cells[ids.indexOf('io')]));
  rec = newRec(); t.render(makeCtx(rec));
  ok(t.prof.sel === 'io' && has(rec, 'IO · PERFECT LANDING DONE'), 'tap an earned patch: detail line');
  t.onInput('tap', center(R2.cells[ids.indexOf('mars')]));
  rec = newRec(); t.render(makeCtx(rec));
  ok(t.prof.sel === 'mars' && has(rec, 'PERFECT LANDING ON ANY MARS STAGE'), 'tap an unearned patch: how to earn it');
  // タップは消費される: パネルの外・空き地・下のタイトルのボタン位置を押しても何も起きない
  for (const pt of [{ x: 180, y: 40 }, { x: 5, y: 600 }, center(t.startBtn), center(t.mapBtn), center(t.rankBtn), center(R2.rows[0].del), center(R2.rows[0].pin)]) t.onInput('tap', Object.assign({ now: 0, t0: 0 }, pt));
  ok(t.prof && t.prof.mode === 'patches' && calls.n === 0 && !t.map && !t.showRank && loadAll(e).profiles === 2, 'taps are consumed: no start, map, ranking, PIN or delete');
  // BACK で PILOTS 一覧へ。もう一度 PATCH → 別パイロットは別ケース
  t.onInput('tap', center(R2.pbk));
  ok(t.prof && t.prof.mode === 'list', 'BACK returns to the pilot list');
  t.onInput('tap', center(R.rows[1].patch));
  rec = newRec(); t.render(makeCtx(rec));
  ok(t.prof.mode === 'patches' && t.prof.target === 'BBB' && has(rec, 'BBB') && has(rec, '0 / 7') && rec.texts.filter((x) => x.s === '?').length === 7, 'second pilot: own case (0 / 7, all ?)');
  t.onInput('back', {}); ok(t.prof && t.prof.mode === 'list', 'back key also returns to the list');
  t.onInput('back', {}); ok(t.prof === null, 'back key again closes PILOTS');
  // 一覧の他のボタンは従来どおり（PIN/DEL/名前タップ）
  t.onInput('tap', center(t.changeBtn)); t.onInput('tap', center(R.rows[1].sel));
  ok(t.name === 'BBB', 'selecting a pilot by tapping the name still works');
  t.onInput('tap', center(R.rows[1].del)); ok(t.prof.mode === 'confirm', 'DEL still opens the confirmation');
}
function loadAll(e) { try { return { profiles: JSON.parse(e.store.get('profiles') || '[]').length }; } catch (_) { return { profiles: -1 }; } }

// ---------- 7b. 効果音 ----------
{
  let thr = false; try { Music.sfx.patch(); } catch (_) { thr = true; }
  ok(typeof Music.sfx.patch === 'function' && !thr, 'Music.sfx.patch exists and is silent/safe without an AudioContext (mute path)');
}

// ---------- 8. UPDATE INFORMATION ----------
{
  const E0 = WHATSNEW.entries[0];
  ok(E0.items.length <= 6 && E0.items.length >= 1, 'newest entry stays within 6 items (' + E0.items.length + ')');
  ok(E0.items.includes('PERFECT で天体ごとのパッチ') && 'PERFECT で天体ごとのパッチ'.length <= 22, 'mentions the patches (<=22 chars)');
  ok(WHATSNEW.entries.every((en) => en.items.every((l) => l.length <= 22)), 'every item <= 22 chars');
  { const A = WHATSNEW.entries.flatMap((en) => en.items); ok(A.some((l) => /輪/.test(l)) && A.some((l) => /★/.test(l)) && A.some((l) => /水星/.test(l)) && A.some((l) => /MAP/.test(l)), 'rings/power-ups, stars, Mercury, MAP listed across entries'); }
}

console.log('p17patch: ' + pass + '/' + (pass + fail) + (fail ? ' FAIL' : ' PASS'));
process.exit(fail ? 1 : 0);
