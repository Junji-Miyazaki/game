// P2j テスト: 成功ジングル（7/8拍子・F リディアン・ドミナント）。実音は出さず偽AudioContextで構造を検証。実行: node 04_tests/p2j.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '../02_src/music.js'), 'utf8');
const { Music } = await import('data:text/javascript;base64,' + Buffer.from(src).toString('base64'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL: ' + m); } };
const throws = (f) => { try { f(); return false; } catch (e) { console.log('  threw:', e.message); return true; } };

let live = 0;
class Param {
  constructor(v = 0) { this.value = v; this.target = v; }
  setValueAtTime(v) { this.value = v; this.target = v; return this; }
  linearRampToValueAtTime(v) { this.target = v; return this; }
  exponentialRampToValueAtTime(v) { this.target = v; return this; }
  setTargetAtTime(v) { this.target = v; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(ctx, kind, params = {}) {
    this.ctx = ctx; this.kind = kind; this.out = new Set(); this.dead = false;
    for (const k of Object.keys(params)) this[k] = new Param(params[k]);
    live++;
  }
  connect(n) { this.out.add(n); return n; }
  disconnect() { if (!this.dead) { this.dead = true; live--; } this.out.clear(); }
  start() {}
  stop() {}
  setPeriodicWave(w) { this.wave = w; }
}
class FakeCtx {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.destination = new Node(this, 'dest'); this.gains = []; this.waves = 0; }
  createOscillator() { const n = new Node(this, 'osc', { frequency: 440, detune: 0 }); n.type = 'sine'; return n; }
  createGain() { const n = new Node(this, 'gain', { gain: 1 }); this.gains.push(n); return n; }
  createBiquadFilter() { const n = new Node(this, 'biquad', { frequency: 350, Q: 1 }); n.type = 'lowpass'; return n; }
  createDelay() { return new Node(this, 'delay', { delayTime: 0 }); }
  createWaveShaper() { return new Node(this, 'shaper'); }
  createPeriodicWave(re, im) { this.waves++; return { re, im }; }
  createBuffer(ch, len) { return { length: len, getChannelData: () => new Float32Array(len) }; }
  createBufferSource() { return new Node(this, 'src'); }
}

const audio = { ctx: null, enabled: true };

// 1) ctx 無し / 未attach: no-op
ok(!throws(() => { Music.playJingle({ tier: 1 }); Music.stopJingle(); Music.stopJingle(0.5); }), 'jingle API no-op before attach');
ok(Music.jingleBeat() === null, 'jingleBeat null without ctx');
Music.attach(audio);
ok(!throws(() => { Music.playJingle({ tier: 2, perfect: true }); Music.tick(0.1); Music.stopJingle(); }), 'jingle API no-op without ctx');
ok(Music.jingleBeat() === null, 'jingleBeat null without ctx (attached)');

const ctx = new FakeCtx(); audio.ctx = ctx;
const adv = (sec, step = 0.05) => { const n = Math.round(sec / step); for (let i = 0; i < n; i++) { ctx.currentTime += step; Music.tick(step); } };
const info = Music.jingleInfo;
const mod12 = (x) => ((x % 12) + 12) % 12;

// 2) 仕様値
ok(info.barLength === 7 && JSON.stringify(info.accents) === '[0,2,4]', '7 eighths per bar, accents on [0,2,4]');
ok(JSON.stringify(info.scale) === '[0,2,4,6,7,9,10]', 'acoustic/Lydian-dominant scale 1 2 3 #4 5 6 b7');

function play(opts, seconds) {
  Music.stopAll(0.05); adv(1);
  Music.playJingle(opts); adv(seconds);
  return Music._debug();
}
const grid = (log, E, t0) => (e) => Math.round((e.t - t0) / E);
const barOf = (log, idx, b) => log.filter((e) => e.kind === 'lead' && Math.floor(idx(e) / 7) === b).map((e) => e.semi).join(',');

// 3) tier0 のイベント検査
let d = play({ tier: 0 }, 40);
const log0 = d.jingleLog; const E0 = d.jingle.E; const idx0 = grid(log0, E0, d.jingle.t0);
ok(d.jingle && d.jingle.tier === 0 && d.jingle.tempo === 168, 'tier0 tempo 168 eighths/min');
ok(log0.length > 20, 'events scheduled: ' + log0.length);
{ const t0 = d.jingle.t0;
  ok(log0.every((e) => Math.abs((e.t - t0) / E0 - idx0(e)) < 1e-6), 'all events on the eighth grid'); }
ok(JSON.stringify([...new Set(log0.filter((e) => e.kind === 'bass').map((e) => idx0(e) % 7))].sort()) === '[0,2,4]', 'bass only on group downbeats 0,2,4');
ok(JSON.stringify([...new Set(log0.filter((e) => e.kind === 'hat').map((e) => idx0(e) % 7))].sort()) === '[0,2,4]', 'hat only on accents 0,2,4');
ok(log0.filter((e) => e.kind === 'lead').some((e) => idx0(e) % 7 !== 0 && idx0(e) % 7 !== 2 && idx0(e) % 7 !== 4), 'lead also plays off-accent eighths');
const semis0 = log0.filter((e) => e.semi != null).map((e) => mod12(e.semi));
ok(semis0.every((s) => info.scale.includes(s)), 'every note is in the scale: ' + [...new Set(semis0)]);
const introSem = log0.filter((e) => e.kind === 'lead' && idx0(e) < 14).map((e) => mod12(e.semi));
ok(introSem.includes(6) && introSem.includes(10), 'hook (intro) contains #4 and b7');
ok(barOf(log0, idx0, 0) !== barOf(log0, idx0, 2) && barOf(log0, idx0, 1) !== barOf(log0, idx0, 3), 'intro bars differ from loop bars');
ok(barOf(log0, idx0, 2) === barOf(log0, idx0, 4) && barOf(log0, idx0, 2) === barOf(log0, idx0, 6), 'loop bar 1 repeats');
ok(barOf(log0, idx0, 3) === barOf(log0, idx0, 5) && barOf(log0, idx0, 3) === barOf(log0, idx0, 7), 'loop bar 2 repeats');
{ const maxBar = Math.floor(Math.max(...log0.map(idx0)) / 7);
  let introAgain = false;
  for (let b = 2; b <= maxBar; b++) if (barOf(log0, idx0, b) === barOf(log0, idx0, 0) || barOf(log0, idx0, b) === barOf(log0, idx0, 1)) introAgain = true;
  ok(maxBar >= 8 && !introAgain, 'intro played once only (bars played: ' + (maxBar + 1) + ')'); }
ok(!log0.some((e) => e.kind === 'sparkle' || e.kind === 'dbl'), 'tier0 non-perfect: no sparkle / octave doubling');
ok(ctx.waves === 1, 'single PeriodicWave (25% pulse) shared: ' + ctx.waves);

// 4) tier
const tempos = [];
for (const tier of [0, 1, 2]) { d = play({ tier }, 30); tempos.push(d.jingle.tempo); }
ok(tempos[0] === 168 && tempos[2] === 200 && tempos[0] < tempos[1] && tempos[1] < tempos[2], 'tier raises tempo: ' + tempos);
{ d = play({ tier: 1 }, 40); const idx = grid(d.jingleLog, d.jingle.E, d.jingle.t0);
  ok(barOf(d.jingleLog, idx, 3) !== barOf(d.jingleLog, idx, 5), 'tier1 has a fill (loop bar 2 differs between passes)');
  const sem = d.jingleLog.filter((e) => e.semi != null).map((e) => mod12(e.semi));
  ok(sem.every((s) => info.scale.includes(s)), 'tier1 notes (incl. fill) stay in the scale'); }
{ d = play({ tier: 2 }, 30);
  ok(d.jingleLog.some((e) => e.kind === 'dbl'), 'tier2 adds octave doubling');
  const sem = d.jingleLog.filter((e) => e.semi != null).map((e) => mod12(e.semi));
  ok(sem.every((s) => info.scale.includes(s)), 'tier2 notes stay in the scale');
  ok(sem.includes(6) && sem.includes(10), 'tier2 keeps #4 and b7'); }

// 5) perfect
d = play({ tier: 0, perfect: false }, 20);
const nPlain = d.jingleLog.filter((e) => e.kind === 'sparkle').length;
d = play({ tier: 0, perfect: true }, 20);
{ const idx = grid(d.jingleLog, d.jingle.E, d.jingle.t0); const sp = d.jingleLog.filter((e) => e.kind === 'sparkle');
  ok(nPlain === 0 && sp.length >= 6, 'perfect adds sparkle arpeggio voices: ' + sp.length);
  ok(sp.every((e) => idx(e) % 7 >= 4) && sp.every((e) => info.scale.includes(mod12(e.semi))), 'sparkle only on the last group (eighths 4-6) and in scale'); }

// 6) jingleBeat
Music.stopAll(0.05); adv(1);
ok(Music.jingleBeat() === null, 'jingleBeat null when not playing');
Music.playJingle({ tier: 0 });
let b = Music.jingleBeat();
ok(b && b.playing && b.tempo === 168 && b.eighthIndex === 0, 'jingleBeat at start: ' + JSON.stringify(b));
const E = 60 / 168; ctx.currentTime += 0.03 + 2.5 * E; Music.tick(0.01);
b = Music.jingleBeat();
ok(b.eighthIndex === 2 && Math.abs(b.phase - 0.5) < 1e-6, 'jingleBeat tracks eighth index/phase: ' + JSON.stringify(b));
ctx.currentTime += 7 * E; b = Music.jingleBeat();
ok(b.eighthIndex === 2 && b.phase >= 0 && b.phase < 1, 'eighthIndex wraps modulo 7');

// 7) stopJingle
Music.stopAll(0.05); adv(1);
Music.playJingle({ tier: 2, perfect: true }); adv(10);
const liveBefore = live;
Music.stopJingle(0.3);
ok(Music.jingleBeat() === null, 'jingleBeat null right after stopJingle');
ok(ctx.gains.some((g) => !g.dead && g.gain.target === 0), 'stopJingle ramps the jingle bus to 0');
ok(Music._debug().dying === 1, 'bus awaits disconnect');
adv(1);
ok(Music._debug().dying === 0 && Music._debug().voices === 0, 'bus and voices disconnected after fade');
ok(live < liveBefore, `live nodes dropped after stop (${liveBefore} -> ${live})`);
ok(!throws(() => { Music.stopJingle(); Music.stopJingle(0); Music.stopJingle(NaN); adv(1); }), 'stopJingle idempotent');
{ const c0 = ctx.gains.length; adv(5); ok(ctx.gains.length === c0, 'no new nodes after stop'); }
Music.playJingle({ tier: 0 }); adv(2); Music.stopAll(0.2); ok(Music.jingleBeat() === null, 'stopAll also stops the jingle'); adv(1);
ok(Music._debug().dying === 0, 'stopAll tears the jingle down');
Music.playJingle({ tier: 0 }); adv(1); Music.playJingle({ tier: 1 }); adv(0.5);
ok(Music._debug().jingle.tier === 1, 'replay replaces the running jingle');
Music.playTitle(); ok(Music.jingleBeat() === null, 'playTitle stops the jingle'); Music.stopAll(0.05); adv(2);

// 8) ボイス数は60秒で有界
let maxV = 0;
for (const tier of [0, 1, 2]) {
  Music.playJingle({ tier, perfect: true });
  for (let i = 0; i < 600; i++) { ctx.currentTime += 0.1; Music.tick(0.1); maxV = Math.max(maxV, Music._debug().voices); }
  Music.stopJingle(0.1); adv(1);
}
ok(maxV <= 18, `jingle voices bounded over 60 s x3 tiers (max ${maxV} <= 18)`);
Music.playJingle({ tier: 2 }); ctx.currentTime += 300; Music.tick(300);
ok(Music._debug().voices <= 18, 'long stall does not flood voices: ' + Music._debug().voices);
Music.stopAll(0.05); adv(2);
Music.playBody('mars'); Music.playJingle({ tier: 2, perfect: true });
let maxAll = 0; for (let i = 0; i < 300; i++) { ctx.currentTime += 0.1; Music.tick(0.1); if (i % 10 === 0) Music.sfx.module(); maxAll = Math.max(maxAll, Music._debug().voices); }
ok(maxAll <= 14 + 10 + 18, 'total voices under combined caps: ' + maxAll);
Music.stopAll(0.05); adv(3);
ok(Music._debug().voices === 0 && Music._debug().dying === 0, 'all clean after stopAll');

// 9) ミュート / 音声無効 / 不正引数
Music.setMuted(true);
{ const c1 = ctx.gains.length; Music.playJingle({ tier: 1, perfect: true }); adv(2);
  ok(ctx.gains.length === c1 && Music.jingleBeat() === null && Music._debug().jingle === null, 'muted: playJingle is a safe no-op (no nodes, no beat)'); }
Music.setMuted(false);
audio.enabled = false; Music.playJingle({ tier: 0 }); ok(Music.jingleBeat() === null, 'engine audio disabled: no jingle'); audio.enabled = true;
Music.playJingle({ tier: 0 }); ok(Music.jingleBeat() !== null, 'unmuted: plays again');
ok(!throws(() => { Music.playJingle(); Music.playJingle(null); Music.playJingle({ tier: 99 }); Music.playJingle({ tier: -3 }); Music.playJingle({ tier: 'x' }); adv(1); }), 'bad arguments do not throw');
ok(Music._debug().jingle && Music._debug().jingle.tier === 0, 'bad tier falls back to 0');
Music.playJingle({ tier: 99 }); ok(Music._debug().jingle.tier === 2, 'tier clamps high to 2');
audio.ctx = new FakeCtx();
ok(!throws(() => { Music.playJingle({ tier: 1 }); audio.ctx.currentTime += 1; Music.tick(0.1); Music.stopJingle(); }), 'ctx replacement rebuilds the jingle graph');

console.log(`p2j: ${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
