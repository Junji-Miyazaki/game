// P2m テスト: 生成音楽/SFX。実音は出さず、偽AudioContextで構造を検証する。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../02_src/music.js'), 'utf8');
const { Music } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const throws = (f) => { try { f(); return false; } catch (e) { console.log('  threw:', e.message); return true; } };

// ---- 偽 AudioContext ----
let live = 0, created = 0, disconnected = 0, maxLive = 0;
class Param {
  constructor(v = 0) { this.value = v; this.target = v; }
  setValueAtTime(v) { this.value = v; this.target = v; return this; }
  linearRampToValueAtTime(v) { this.target = v; this.value = v; return this; }
  exponentialRampToValueAtTime(v) { this.target = v; this.value = v; return this; }
  setTargetAtTime(v) { this.target = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(ctx, kind, params = {}) {
    this.ctx = ctx; this.kind = kind; this.out = new Set(); this.dead = false; this.started = false;
    for (const k of Object.keys(params)) this[k] = new Param(params[k]);
    created++; live++; maxLive = Math.max(maxLive, live);
  }
  connect(n) { this.out.add(n); return n; }
  disconnect(t) { if (t) { this.out.delete(t); return; } if (!this.dead) { this.dead = true; live--; disconnected++; } this.out.clear(); }
  start() { this.started = true; }
  stop() { this.stoppedCalled = true; }
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'running'; this.destination = new Node(this, 'dest'); }
  createOscillator() { const n = new Node(this, 'osc', { frequency: 440, detune: 0 }); n.type = 'sine'; return n; }
  createGain() { return new Node(this, 'gain', { gain: 1 }); }
  createBiquadFilter() { const n = new Node(this, 'biquad', { frequency: 350, Q: 1, gain: 0 }); n.type = 'lowpass'; return n; }
  createDelay() { return new Node(this, 'delay', { delayTime: 0 }); }
  createWaveShaper() { return new Node(this, 'shaper'); }
  createStereoPanner() { return new Node(this, 'pan', { pan: 0 }); }
  createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new Node(this, 'src'); }
}

// 1) ctx 無し: 全メソッドが no-op
const audio = { ctx: null, enabled: true };
ok(!throws(() => Music.playTitle()), 'playTitle before attach');
Music.attach(audio);
const all = () => {
  Music.playTitle(); Music.playBody('mars'); Music.stopAll(); Music.tick(0.016);
  Music.sfx.landing(); Music.sfx.crash(); Music.sfx.module(); Music.sfx.launch(); Music.sfx.uiTap();
  Music.setMuted(false); Music.isMuted();
};
ok(!throws(all), 'all methods no-op without ctx');
ok(created === 0, 'no nodes created without ctx');
ok(Music.isMuted() === false, 'isMuted default false');
// ctx無しでミュート設定 → 後でctx生成時に反映
Music.setMuted(true);
ok(Music.isMuted() === true, 'muted flag stored without ctx');

// 2) ctx 生成後
const ctx = new FakeCtx();
const _all = new Set();
const origCreate = ctx.createGain.bind(ctx);
ctx.createGain = () => { const g = origCreate(); _all.add(g); return g; };
audio.ctx = ctx;
Music.tick(0.016);
const masterOf = () => { // destination に繋がる最初の gain
  for (const n of [..._all]) if (n.out.has(ctx.destination)) return n;
};
Music.setMuted(true); // ctx 生成後の反映
const master = masterOf();
ok(master && master.gain.target === 0, 'muted at ctx creation => master target 0');
Music.setMuted(false);
ok(masterOf().gain.target === 1, 'unmute restores master gain to 1');
Music.setMuted(true); ok(masterOf().gain.target === 0, 'mute ramps to 0');
Music.setMuted(false);

ok(!throws(() => Music.playTitle()), 'playTitle');
ok(Music._debug().cur === 'title', 'title is current');
for (const id of ['moon', 'europa', 'io', 'mars', 'titan', 'venus', 'terra']) {   // P6: terra（ボーナス専用）を追加
  ok(!throws(() => Music.playBody(id)), 'playBody ' + id);
  ok(Music._debug().cur === id, 'cur=' + id);
  for (let i = 0; i < 50; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
}
ok(!throws(() => Music.playBody('nope')), 'unknown body no throw');
ok(Music._debug().cur === 'moon', 'unknown body falls back to moon');
ok(!throws(() => Music.playBody(undefined)), 'undefined body no throw');
ok(!throws(() => Music.playBody(null)), 'null body no throw');
ok(!throws(() => Music.playBody('__proto__')), '__proto__ body no throw');
ok(!throws(() => Music.playBody('constructor')), 'constructor body no throw');
ok(Music._debug().cur === 'moon', 'prototype-key falls back to moon');

// 3) クロスフェード: 切替直後は2シーン、2.5秒後に旧シーン破棄
Music.playBody('mars'); ctx.currentTime += 0.01; Music.tick(0.01);
Music.playBody('venus');
ok(Music._debug().scenes >= 2, 'crossfade keeps old scene briefly: ' + Music._debug().scenes);
for (let i = 0; i < 30; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
ok(Music._debug().scenes === 1, 'old scene torn down after fade: ' + Music._debug().scenes);
// 同じボディの再呼び出しは何もしない
const cBefore = created; Music.playBody('venus');
ok(created === cBefore, 'same body replay is idempotent');

// 4) 120秒シミュレーション: ボイス数が有界、停止ノードは切断
const BOUND_VOICES = 24; // 一過性: 音楽14 + SFX10
let maxV = 0, maxPersist = 0;
for (const id of ['title', 'moon', 'europa', 'io', 'mars', 'titan', 'venus', 'terra']) {
  if (id === 'title') Music.playTitle(); else Music.playBody(id);
  for (let i = 0; i < 1200; i++) { // 120 s @ 10 Hz
    ctx.currentTime += 0.1; Music.tick(0.1);
    if (i % 40 === 0) { Music.sfx.landing(); Music.sfx.module(); Music.sfx.uiTap(); }
    const d = Music._debug();
    maxV = Math.max(maxV, d.voices); maxPersist = Math.max(maxPersist, d.persistentNodes);
  }
}
ok(maxV <= BOUND_VOICES, `voices bounded (max ${maxV} <= ${BOUND_VOICES})`);
ok(maxPersist < 80, 'persistent nodes bounded (max ' + maxPersist + ')');
ok(disconnected > 0, 'finished nodes were disconnected: ' + disconnected);
ok(live < 120, `live node count stays bounded (live ${live}, peak ${maxLive})`);

// 同時多発でも上限
for (let i = 0; i < 200; i++) { Music.sfx.crash(); Music.sfx.launch(); Music.sfx.landing(); }
ok(Music._debug().voices <= BOUND_VOICES, 'sfx spam capped: ' + Music._debug().voices);
ctx.currentTime += 10; Music.tick(0.1);
ok(Music._debug().voices <= 2, 'voices drain after spam: ' + Music._debug().voices);


// 4b) タイトル曲「牧歌から深宇宙へ」: F リディアン・ドミナント / 7/8(2+2+3) / 24小節周期 / ドローン出入り / 240秒の有界性
{
  const SCALE = [0, 2, 4, 6, 7, 9, 10];
  const E8 = 60 / 96;
  const allOscs = []; const origOsc = FakeCtx.prototype.createOscillator;
  FakeCtx.prototype.createOscillator = function () { const n = origOsc.call(this); allOscs.push(n); return n; };
  Music.playTitle();
  const seen = new Map(); let maxTV = 0, maxPT = 0, drone = [];
  for (let i = 0; i < 2400; i++) { // 240 s @ 10 Hz
    ctx.currentTime += 0.1; Music.tick(0.1);
    const d = Music._debug();
    maxTV = Math.max(maxTV, d.voices); maxPT = Math.max(maxPT, d.persistentNodes);
    for (const x of d.titleLog) seen.set(x.kind + '@' + x.t.toFixed(4) + '@' + x.semi, x);
    drone = d.titleDrone;
  }
  const L = [...seen.values()];
  ok(L.length > 300, 'title notes scheduled over 240 s: ' + L.length);
  ok(L.every((x) => SCALE.includes(((x.semi % 12) + 12) % 12)), 'title scale is exactly F G A B C D Eb');
  ok(new Set(L.map((x) => ((x.semi % 12) + 12) % 12)).size === 7, 'title uses all seven scale degrees');
  const bass = L.filter((x) => x.kind === 'bass');
  ok(bass.length > 20 && bass.every((x) => [0, 2, 4].includes(x.e)), 'title bass only on eighths 0,2,4 (2+2+3 group heads)');
  const lead0 = L.filter((x) => x.kind === 'lead' && x.bar === 0 && x.e === 0)[0], t0 = lead0.t;
  ok(Math.abs(bass.filter((x) => x.bar === 0).map((x) => x.t).reduce((a, b) => a + b, 0) - (3 * t0 + (0 + 2 + 4) * E8)) < 1e-6, 'bar-0 bass at eighths 0,2,4 spaced by the eighth');
  const bars = new Set(L.filter((x) => x.kind === 'lead' && x.e === 0).map((x) => Math.round((x.t - t0) / (7 * E8))));
  ok(bars.has(1) && bars.has(2), 'one bar = 7 eighths at 96/min (' + (7 * E8).toFixed(3) + ' s)');
  const ins = drone.filter((x) => x.kind === 'in'), outs = drone.filter((x) => x.kind === 'out');
  ok(ins.length >= 3 && outs.length >= 2, 'drone cycles over 240 s: in=' + ins.length + ' out=' + outs.length);
  ok(Math.abs(ins[0].t0 - (t0 + 3 * 7 * E8)) < 1e-6 && Math.abs(ins[0].t1 - ins[0].t0 - 10) < 1e-9, 'drone fades in at bar 4 over 10 s (t=' + (ins[0].t0 - t0).toFixed(2) + ')');
  ok(Math.abs(outs[0].t0 - (t0 + 17 * 7 * E8)) < 1e-6 && Math.abs(outs[0].t1 - outs[0].t0 - 8) < 1e-9, 'drone recedes at bar 18 over 8 s (t=' + (outs[0].t0 - t0).toFixed(2) + ')');
  ok(Math.abs(ins[1].t0 - ins[0].t0 - 24 * 7 * E8) < 1e-6 && Math.abs(outs[1].t0 - outs[0].t0 - 24 * 7 * E8) < 1e-6, 'cycle is 24 bars (' + (24 * 7 * E8).toFixed(1) + ' s)');
  // テルミン: 単発グライドは各周回の小節2・4の終わり、背景は「約3拍鳴いて1拍休む」間欠ジェスチャー（小節6〜ドローン退場）
  const th = L.filter((x) => x.kind === 'ther'), bg = L.filter((x) => x.kind === 'bg'), lead = L.filter((x) => x.kind === 'lead');
  const gest = L.filter((x) => x.kind === 'gest').sort((a, b) => a.t - b.t);
  const bcOf = (x) => x.bar % 24, cycOf = (x) => Math.floor(x.bar / 24);
  ok(th.length >= 8 && th.every((x) => [1, 3].includes(bcOf(x)) && x.e === 5), 'single glides only at the end of bars 2 and 4 of each cycle');
  for (const c of [0, 1]) ok([1, 3].every((k) => th.some((x) => cycOf(x) === c && bcOf(x) === k)), 'cycle ' + c + ' has glides at bars 2 and 4');
  ok(gest.length > 30, 'background gestures scheduled: ' + gest.length);
  ok(gest.every((g) => bcOf(g) >= 5 && bcOf(g) < 17), 'gestures start only from bar 6 up to the drone recede (none in bars 1-5, none after bar 18)');
  ok([0, 1].every((c) => gest.some((g) => cycOf(g) === c && bcOf(g) === 5) && gest.some((g) => cycOf(g) === c && bcOf(g) >= 15)), 'gestures span bar 6 .. 17 in every cycle');
  ok(gest.every((g) => g.dur / E8 >= 2.5 - 1e-9 && g.dur / E8 <= 3.5 + 1e-9), 'each gesture lasts 2.5-3.5 eighths');
  ok(gest.every((g, i) => i === 0 || cycOf(g) !== cycOf(gest[i - 1]) || g.t - (gest[i - 1].t + gest[i - 1].dur) >= E8 - 1e-9), 'gaps of at least 1 eighth between gestures (one at a time)');
  ok(new Set(gest.map((g) => g.type)).size === 3, 'all three gesture types occur: ' + [...new Set(gest.map((g) => g.type))].join());
  ok(gest.every((g, i) => i < 2 || !(g.type === gest[i - 1].type && g.type === gest[i - 2].type)), 'no gesture type three times in a row');
  ok(L.filter((x) => x.kind === 'ther' || x.kind === 'bg').every((x) => SCALE.includes(((x.semi % 12) + 12) % 12)) && gest.every((g) => SCALE.includes(((g.semi1 % 12) + 12) % 12)), 'theremin endpoints stay in the scale');
  const gestPeak = Math.max(...gest.map((x) => x.vel)), glideVel = Math.max(...th.map((x) => x.vel)), leadMin = Math.min(...lead.map((x) => x.vel));
  ok(gest.every((g) => g.vel === glideVel) && glideVel < leadMin, 'levels: gesture ' + gestPeak.toFixed(3) + ' == glide ' + glideVel.toFixed(3) + ' < lead ' + leadMin.toFixed(3));
  const leadAtT = (time) => { const k = Math.floor((time - t0) / E8 + 1e-6); const tt = t0 + k * E8; return lead.find((l) => Math.abs(l.t - tt) < 1e-6); };
  ok(bg.every((x) => { const l = leadAtT(x.t); return !l || l.semi !== x.semi; }), 'gesture endpoints never unison with the lead note on that eighth');
  ok(new Set(bg.map((x) => x.semi)).size >= 6, 'gestures cover several pitches');
  ok(th.filter((x) => x.t < t0 + 1 * 7 * E8).length === 0 && bg.filter((x) => x.t < t0 + 5 * 7 * E8).length === 0, 'pastoral opening (bars 1-5) has no background theremin');
  const ph0 = L.filter((x) => x.kind === 'lead' && x.bar < 24).map((x) => x.semi + '@' + x.e).join(), ph1 = L.filter((x) => x.kind === 'lead' && x.bar >= 24 && x.bar < 48).map((x) => x.semi + '@' + x.e).join();
  ok(ph0 !== ph1, 'phrase order varies between cycles');
  ok(maxTV <= 14, 'title voices bounded over 240 s (max ' + maxTV + ' <= 14)');
  ok(maxPT < 80, 'title persistent nodes bounded (' + maxPT + ')');
  // マスター・ミュートでタイトルも無音へ
  Music.setMuted(true); ok(masterOf().gain.target === 0, 'mute ramps master to 0 during title'); Music.setMuted(false);
  // playBody へクロスフェード → タイトルのノードが切断される
  const persistTitle = Music._debug().persistentNodes, discBefore = disconnected, nOscTitle = allOscs.length;
  Music.playBody('moon'); ctx.currentTime += 0.01; Music.tick(0.01);
  ok(Music._debug().scenes >= 2, 'crossfade from title keeps the old scene briefly');
  for (let i = 0; i < 40; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
  ok(Music._debug().scenes === 1 && Music._debug().cur === 'moon', 'title scene torn down after crossfade');
  ok(disconnected - discBefore >= persistTitle, 'title nodes disconnected after crossfade (' + (disconnected - discBefore) + ' >= ' + persistTitle + ')');
  ok(allOscs.slice(0, nOscTitle).every((o) => o.dead), 'every title oscillator (incl. the sustained background theremin) disconnected after crossfade to playBody');
  // stopAll でも破棄（背景テルミン稼働中: 小節7付近＝約30秒）
  Music.stopAll(0.2); for (let i = 0; i < 30; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
  const nBefore = allOscs.length; Music.playTitle();
  for (let i = 0; i < 340; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
  const bgNow = Music._debug().titleLog.filter((x) => x.kind === 'bg').length;
  ok(bgNow > 3 && allOscs.slice(nBefore).some((o) => !o.dead), 'background gestures active ~34 s into the title (' + bgNow + ' endpoints)');
  Music.stopAll(0.5); for (let i = 0; i < 25; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
  ok(Music._debug().scenes === 0 && Music._debug().voices <= 2, 'stopAll tears the title down');
  ok(allOscs.slice(nBefore).every((o) => o.dead), 'stopAll stops and disconnects every title oscillator incl. the background gesture voices');
  FakeCtx.prototype.createOscillator = origOsc;
}

// 5) SFX 反復
ok(!throws(() => { for (let i = 0; i < 20; i++) { Music.sfx.landing(); Music.sfx.crash(); Music.sfx.module(); Music.sfx.launch(); Music.sfx.uiTap(); ctx.currentTime += 4; Music.tick(0.1); } }), 'sfx repeated');

// 6) enabled=false なら SFX 無音
audio.enabled = false;
const c2 = created; Music.sfx.uiTap(); Music.sfx.crash();
ok(created === c2, 'sfx silent when engine audio disabled');
audio.enabled = true;

// 7) stopAll → フェード後に全シーン破棄、tick は idempotent
Music.stopAll(1);
ok(Music._debug().cur === null, 'stopAll clears current');
for (let i = 0; i < 30; i++) { ctx.currentTime += 0.1; Music.tick(0.1); }
ok(Music._debug().scenes === 0, 'scenes torn down after stopAll');
const c3 = created;
ok(!throws(() => { for (let i = 0; i < 100; i++) { ctx.currentTime += 0.1; Music.tick(0.1); } Music.stopAll(); Music.stopAll(0); }), 'tick/stopAll idempotent when idle');
ok(created === c3, 'idle tick creates no nodes');
ok(!throws(() => Music.stopAll(NaN)), 'stopAll(NaN)');

// 8) ctx 差し替え（再生成）でも落ちない
audio.ctx = new FakeCtx();
ok(!throws(() => { Music.playTitle(); audio.ctx.currentTime += 1; Music.tick(0.1); Music.sfx.uiTap(); }), 'new ctx rebuilds graph');

// 9) アクティブなノードが孤立していない（停止指示が出ている）
ok(Music.isMuted() === false, 'mute state preserved');

console.log(`p2m: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
