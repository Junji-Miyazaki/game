// LANDER タイトル曲 試聴用の候補シンセ（実験用。ゲーム本体には組み込まれていない）。
// すべてオリジナル。F基準・リディアン・ドミナント(F G A B C D Eb)・7/8拍子(2+2+3)。
// 使い方: const h = createCandidate('A', ctx, destNode, {seed}); setInterval(() => h.tick(), 25); h.stop(0.3);

export const F_ROOT = 349.23;                 // F4
export const SCALE = [0, 2, 4, 6, 7, 9, 10];  // F G A B C D Eb（半音）
export const GROUPS = [2, 2, 3];
export const ACCENTS = [0, 2, 4];
export const BAR = 7;
const LOOKAHEAD = 0.6;
const hz = (semi) => F_ROOT * Math.pow(2, semi / 12);

function rngOf(seed) { // mulberry32
  let a = (seed >>> 0) || 1;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

class Engine {
  constructor(ctx, dest, o) {
    this.ctx = ctx; this.o = o;
    this.clock = o.clock || (() => ctx.currentTime);
    this.keepNodes = !!o.keep;           // オフライン描画用: 掃除で切断しない
    this.rng = rngOf(o.seed != null ? o.seed : (Date.now() & 0xffffff));
    this.E = 60 / o.tempo;
    this.caps = o.caps || {};
    this.nodes = []; this.voices = []; this.log = [];
    this.stats = { maxVoices: 0, maxByKind: {} };
    this.n = 0; this.stopping = false; this.done = false; this.killAt = 0;
    const now = this.clock();
    this.out = ctx.createGain();
    this.out.gain.setValueAtTime(0.0001, now);
    this.out.gain.linearRampToValueAtTime(o.level, now + 0.15);
    this.out.connect(dest);
    this.nodes.push(this.out);
    this.next = now + 0.05;
    const len = Math.max(1, Math.floor(ctx.sampleRate));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = this.rng() * 2 - 1;
    this.noise = buf;
    this._pulse = {};
  }
  keep(...ns) { this.nodes.push(...ns); return ns[0]; }
  gain(v, to) { const g = this.ctx.createGain(); g.gain.value = v; if (to) g.connect(to); this.keep(g); return g; }
  filter(type, f, q, to) { const b = this.ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q || 0.7; if (to) b.connect(to); this.keep(b); return b; }
  // 持続オシレータ（stop で止める）
  hold(type, f, det) { const o = this.ctx.createOscillator(); o.type = type; o.frequency.value = f; if (det) o.detune.value = det; o.start(this.clock()); this.keep(o); return o; }
  lfo(rate, depth, param) { const l = this.hold('sine', rate); const g = this.gain(depth); l.connect(g); g.connect(param); return g; }
  pulseWave(duty) {
    if (this._pulse[duty] !== undefined) return this._pulse[duty];
    let w = null; const c = this.ctx;
    if (typeof c.createPeriodicWave === 'function') {
      try { const N = 32, re = new Float32Array(N + 1), im = new Float32Array(N + 1);
        for (let k = 1; k <= N; k++) { re[k] = (2 / (k * Math.PI)) * Math.sin(2 * Math.PI * k * duty); im[k] = (2 / (k * Math.PI)) * (1 - Math.cos(2 * Math.PI * k * duty)); }
        w = c.createPeriodicWave(re, im); } catch (e) { w = null; }
    }
    this._pulse[duty] = w; return w;
  }
  // 疑似ステレオのフィードバックディレイ。入力ゲインを返す
  stereoDelay(tl, tr, fb, wet, lpHz) {
    const c = this.ctx; const input = this.gain(1); const wetG = this.gain(wet, this.out);
    [[tl, -0.7], [tr, 0.7]].forEach(([t, p]) => {
      const d = c.createDelay(2); d.delayTime.value = t; const f = this.gain(fb);
      const lp = this.filter('lowpass', lpHz, 0.5);
      input.connect(d); d.connect(lp); lp.connect(f); f.connect(d);
      let tail = lp;
      if (c.createStereoPanner) { const sp = c.createStereoPanner(); sp.pan.value = p; lp.connect(sp); tail = sp; this.keep(sp); }
      tail.connect(wetG); this.keep(d);
    });
    return input;
  }
  count(kind) { const now = this.clock(); let n = 0; for (const v of this.voices) if (v.kind === kind && v.end > now) n++; return n; }
  canVoice(kind) { return this.count(kind) < (this.caps[kind] || 8); }
  reg(kind, nodes, end, cleanup) {
    this.voices.push({ kind, nodes, end, cleanup });
    const k = this.voices.length; if (k > this.stats.maxVoices) this.stats.maxVoices = k;
    const kc = this.count(kind); if (kc > (this.stats.maxByKind[kind] || 0)) this.stats.maxByKind[kind] = kc;
  }
  killVoice(v) {
    for (const n of v.nodes) { try { n.disconnect(); } catch (e) { /* 切断済み */ } }
    if (v.cleanup) { try { v.cleanup(); } catch (e) { /* ok */ } }
  }
  sweep() {
    const now = this.clock(); const keep = [];
    for (const v of this.voices) { if (v.end <= now) { if (!this.keepNodes) this.killVoice(v); } else keep.push(v); }
    this.voices = keep;
  }
  // 音程ありの1音。o: {t,hz,dur,vel,dest,type|wave,det,partials,atk,holdFrac,vib,kind}
  tone(kind, o) {
    if (!this.canVoice(kind)) return;
    const c = this.ctx; const t = o.t; const end = t + o.dur + 0.05;
    const env = c.createGain(); const atk = o.atk != null ? o.atk : 0.008;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(o.vel, t + atk);
    env.gain.setValueAtTime(o.vel, t + Math.max(atk, o.dur * (o.holdFrac != null ? o.holdFrac : 0.5)));
    env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    env.connect(o.dest);
    const nodes = [env]; let cleanup = null;
    const mk = (type, f, g, det, wave) => {
      const os = c.createOscillator(); os.frequency.value = f; if (det) os.detune.value = det;
      if (wave) os.setPeriodicWave(wave); else os.type = type;
      os.start(t); os._started = true; os.stop(end);
      if (g !== 1) { const gg = c.createGain(); gg.gain.value = g; os.connect(gg); gg.connect(env); nodes.push(gg); } else os.connect(env);
      nodes.push(os); return os;
    };
    const wave = o.wave ? this.pulseWave(o.wave) : null;
    const main = mk(wave ? 'square' : (o.type || 'sine'), o.hz, 1, o.det || 0, wave);
    for (const p of (o.partials || [])) mk(p.type || 'sine', o.hz * p.ratio, p.gain, p.det || 0, null);
    if (o.vib && this.vibGain) { this.vibGain.connect(main.detune); const vg = this.vibGain; cleanup = () => vg.disconnect(main.detune); }
    this.reg(kind, nodes, end, cleanup);
  }
  // 無音程のノイズ/クリック系
  hit(kind, t, vel, o) {
    if (!this.canVoice(kind)) return;
    const c = this.ctx; const end = t + o.dur + 0.03;
    const src = c.createBufferSource(); src.buffer = this.noise; src.loop = true; src.start(t, this.rng() * 0.8); src.stop(end);
    const f = c.createBiquadFilter(); f.type = o.type; f.frequency.value = o.f; f.Q.value = o.q || 1;
    const env = c.createGain(); env.gain.setValueAtTime(vel, t); env.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
    src.connect(f); f.connect(env); env.connect(o.dest);
    this.reg(kind, [src, f, env], end);
    this.log.push({ kind, t, semi: null, e: o.e });
  }
  note(kind, t, semi, e, bar) { this.log.push({ kind, t, semi, e, bar }); if (this.log.length > 3000) this.log.shift(); }
  tick() {
    if (this.done) return;
    const now = this.clock();
    this.sweep();
    if (this.stopping) { if (now >= this.killAt) this.dispose(); return; }
    if (this.next < now) { const skip = Math.ceil((now - this.next) / this.E); this.next += skip * this.E; this.n += skip; }
    let g = 16;
    while (this.next < now + LOOKAHEAD && g-- > 0) { this.step(this.n, this.next); this.n++; this.next += this.E; }
  }
  stop(fade = 0.3) {
    if (this.stopping || this.done) return;
    this.stopping = true;
    const now = this.clock(); const f = Math.max(0.05, fade);
    this.out.gain.cancelScheduledValues(now);
    this.out.gain.setValueAtTime(this.out.gain.value, now);
    this.out.gain.linearRampToValueAtTime(0, now + f);
    this.killAt = now + f + 0.1;
    for (const n of this.nodes) { try { if (n.stop) n.stop(this.killAt); } catch (e) { /* ok */ } }
  }
  dispose() {
    if (this.done) return; this.done = true;
    for (const v of this.voices) { for (const n of v.nodes) { try { if (n._started) n.stop(); } catch (e) { /* ok */ } } this.killVoice(v); }
    this.voices = [];
    for (const n of this.nodes) { try { n.disconnect(); } catch (e) { /* ok */ } }
  }
  api() { const s = this; return { tick: () => s.tick(), stop: (f) => s.stop(f), dispose: () => s.dispose(), get done() { return s.done; }, engine: s }; }
}

// ---------------- 案A 軽いアンビエント ----------------
// Fadd9 / G7(F,G,B,D) / Dm7 / F7(add9)。2小節ごとに和音が変わる（4和音で8小節=約40秒周期、ベル配置は確率的に変化）。
const A_CHORDS = [
  [-12, -8, -5, 2],    // F A C G
  [-12, -6, -3, 2],    // F B D G  （#4 を含むリディアン色）
  [-15, -8, -5, 0],    // D A C F  （Dm7）
  [-12, -8, -2, 2],    // F A Eb G （b7）
];
const A_BELLS = [
  [12, 16, 19, 26, 24, 21],
  [14, 18, 21, 12, 26, 24],
  [9, 12, 16, 19, 21, 24],
  [12, 16, 19, 22, 14, 24],
];
function makeA(ctx, dest, opts) {
  const o = Object.assign({ tempo: 84, level: 1.24, caps: { pad: 10, bell: 8 } }, opts);
  const E = new Engine(ctx, dest, o);
  const padLp = E.filter('lowpass', 1600, 0.5);
  const padG = E.gain(0.8, E.out); padLp.connect(padG);
  E.lfo(0.055, 0.22, padG.gain);
  E.pad = padLp;
  const root = E.hold('sine', hz(-24)); const rg = E.gain(0.05, E.out); root.connect(rg);   // F2=87Hz 極小のサイン
  E.bell = E.gain(1, E.out);
  E.bell.connect(E.stereoDelay(E.E * 3 / 2, E.E * 2.25, 0.42, 0.5, 3200));
  E.bi = 0;
  E.step = function (n, t) {
    const e = n % BAR, bar = Math.floor(n / BAR), ci = Math.floor(bar / 2) % 4;
    if (n % 14 === 0) {
      const vel = 0.05 * (0.9 + this.rng() * 0.2);
      A_CHORDS[ci].forEach((s, i) => {
        this.tone('pad', { t, hz: hz(s), dur: 14 * this.E + 3.5, vel: i === 0 ? vel * 0.8 : vel, dest: this.pad, type: 'sine', atk: n === 0 ? 1.2 : 3, holdFrac: (14 * this.E) / (14 * this.E + 3.5),
          partials: [{ type: 'triangle', ratio: 1, gain: 0.3, det: 5 }] });
        this.note('pad', t, s, e, bar);
      });
    }
    const gi = ACCENTS.indexOf(e);
    if (gi >= 0) {
      const dens = 0.75 + 0.25 * Math.sin(bar * 0.7);
      if (this.rng() < [0.95, 0.5, 0.7][gi] * dens) {
        const pool = A_BELLS[ci];
        const stp = [1, 1, 2, -1][Math.floor(this.rng() * 4)];
        this.bi = (this.bi + stp + pool.length * 4) % pool.length;
        const s = pool[this.bi];
        this.tone('bell', { t, hz: hz(s), dur: 2.8, vel: gi === 0 ? 0.075 : 0.06, dest: this.bell, type: 'sine', atk: 0.012, holdFrac: 0.02,
          partials: [{ ratio: 2.76, gain: 0.25 }, { ratio: 5.4, gain: 0.07 }] });
        this.note('bell', t, s, e, bar);
      }
    }
  };
  return E.api();
}

// ---------------- 案B ミッション・テーマ ----------------
const B_PH = [
  [[12, null, 19, null, 18, 19, null], [21, null, 19, 16, 19, null, null], [16, null, 19, null, 22, 21, 19], [18, null, 19, null, 12, null, null]],
  [[12, 14, 16, null, 19, null, 21], [22, null, 21, 19, 16, null, null], [14, null, 16, null, 19, 21, 22], [19, null, 18, null, 12, null, null]],
];
const B_COUNTER = [
  [null, 4, null, 7, null, 12, null],
  [null, 9, null, 7, null, 4, 7],
  [null, 7, null, 9, null, 10, 9],
  [null, 6, null, 7, null, null, null],
];
const B_BASS = [[-12, -5, -12], [-12, -2, -5], [-15, -12, -5], [-12, -10, -12]];
function makeB(ctx, dest, opts) {
  const o = Object.assign({ tempo: 96, level: 0.35, caps: { lead: 4, cnt: 4, bass: 4, shk: 3 } }, opts);
  const E = new Engine(ctx, dest, o);
  const vib = E.hold('sine', 5.2); E.vibGain = E.gain(6); vib.connect(E.vibGain);   // 6セント
  E.leadBus = E.filter('lowpass', 2600, 0.5, E.out);
  E.leadBus.connect(E.stereoDelay(E.E, E.E * 1.5, 0.3, 0.22, 2400));
  E.cntBus = E.filter('lowpass', 1800, 0.5, E.out);
  E.bassBus = E.filter('lowpass', 700, 0.5, E.out);
  E.step = function (n, t) {
    const e = n % BAR, bar = Math.floor(n / BAR), b = bar % 4, p = Math.floor(bar / 4) % 4;
    // フレーズ順: A, B, A, B'（B' は最終小節がAの終止）。16小節=約70秒周期
    const row = (p === 0 || p === 2) ? B_PH[0][b] : (p === 3 && b === 3) ? B_PH[0][3] : B_PH[1][b];
    const semi = row[e];
    if (semi != null) {
      let j = e + 1; while (j < BAR && row[j] == null) j++;
      const dur = Math.min(3 * this.E, j < BAR ? (j - e) * this.E * 0.97 : (BAR - e) * this.E * 1.2);
      const acc = ACCENTS.indexOf(e) >= 0;
      this.tone('lead', { t, hz: hz(semi), dur, vel: acc ? 0.24 : 0.19, dest: this.leadBus, type: 'triangle', atk: 0.03, holdFrac: 0.6, vib: true,
        partials: [{ type: 'sine', ratio: 1, gain: 0.6 }] });
      this.note('lead', t, semi, e, bar);
    }
    if (p >= 1) {
      const c = B_COUNTER[b][e];
      if (c != null) { this.tone('cnt', { t, hz: hz(c), dur: this.E * 0.7, vel: 0.08, dest: this.cntBus, wave: 0.25, atk: 0.004, holdFrac: 0.3 }); this.note('cnt', t, c, e, bar); }
    }
    const gi = ACCENTS.indexOf(e);
    if (gi >= 0) {
      const grp = GROUPS[gi]; const bs = B_BASS[b][gi];
      this.tone('bass', { t, hz: hz(bs), dur: this.E * grp * 0.85, vel: 0.3, dest: this.bassBus, type: 'triangle', atk: 0.01, holdFrac: 0.5 });
      this.note('bass', t, bs, e, bar);
      this.hit('shk', t, gi === 0 ? 0.05 : 0.032, { type: 'bandpass', f: 6000, q: 1, dur: 0.07, dest: this.out, e });
    }
  };
  return E.api();
}

// ---------------- 案C チップ・ドーン ----------------
const C_CH = [[0, 4, 7, 14], [2, 6, 9, 14], [-3, 0, 4, 7], [0, 4, 7, 10]];
const C_ARP = [[0, 1, 2, 1, 3, 2, 1], [3, 2, 1, 2, 0, 1, 2]];
const C_TOP = [[19, 16, 21], [18, 21, 19], [16, 19, 21], [22, 19, 16]];
const C_TOP2 = [[19, 16, 21], [18, 21, 19], [16, 19, 21], [22, 21, 24]];
const C_BASS = [[-12, -5, -12], [-10, -3, -10], [-15, -8, -15], [-12, -2, -5]];
function makeC(ctx, dest, opts) {
  const o = Object.assign({ tempo: 140, level: 0.63, caps: { arp: 6, top: 4, bass: 4, hat: 4 } }, opts);
  const E = new Engine(ctx, dest, o);
  E.puls = E.filter('lowpass', 3200, 0.5, E.out);
  E.bassBus = E.filter('lowpass', 800, 0.5, E.out);
  E.step = function (n, t) {
    const e = n % BAR, bar = Math.floor(n / BAR), b = bar % 4, cyc = Math.floor(bar / 4) % 4;
    const ch = C_CH[b];
    const ai = (cyc === 1 ? C_ARP[1] : C_ARP[0])[e];
    const acc = ACCENTS.indexOf(e);
    const a = ch[ai] + 12;
    this.tone('arp', { t, hz: hz(a), dur: this.E * 0.8, vel: acc >= 0 ? 0.13 : 0.085, dest: this.puls, wave: 0.25, atk: 0.004, holdFrac: 0.4 });
    this.note('arp', t, a, e, bar);
    if (acc >= 0) {
      const top = (cyc === 2 ? C_TOP2 : C_TOP)[b][acc];
      this.tone('top', { t, hz: hz(top), dur: this.E * GROUPS[acc] * 0.8, vel: 0.085, dest: this.puls, wave: 0.125, atk: 0.006, holdFrac: 0.5 });
      this.note('top', t, top, e, bar);
      if (cyc === 3 && acc === 1) { // 12.5% のエコー
        this.tone('top', { t: t + this.E * 0.5, hz: hz(top), dur: this.E * 0.6, vel: 0.04, dest: this.puls, wave: 0.125, atk: 0.004, holdFrac: 0.3 });
        this.note('top', t + this.E * 0.5, top, e, bar);
      }
      const bs = C_BASS[b][acc];
      this.tone('bass', { t, hz: hz(bs), dur: this.E * GROUPS[acc] * 0.85, vel: 0.3, dest: this.bassBus, type: 'triangle', atk: 0.008, holdFrac: 0.5 });
      this.note('bass', t, bs, e, bar);
      this.hit('hat', t, acc === 0 ? 0.05 : 0.035, { type: 'highpass', f: 7000, q: 0.7, dur: 0.04, dest: this.out, e });
    } else if (e % 2 === 1) {
      this.hit('hat', t, 0.018, { type: 'highpass', f: 8000, q: 0.7, dur: 0.03, dest: this.out, e });
    }
  };
  return E.api();
}

// ---------------- 案D 重低音×ポップ・キッチュ ----------------
const D_HOOK = [
  [12, null, 18, 19, null, 22, 19],
  [21, 19, null, 18, null, 19, 16],
  [12, 16, null, 19, null, 18, 22],
  [21, null, 19, 18, 16, null, 12],
];
const D_HOOK_B4 = [19, 18, 19, 22, 21, 19, 12];
const D_BASS = [[-24, -17, -24], [-22, -15, -22], [-24, -12, -24], [-14, -17, -24]];
const D_THER = [[16, 21], [19, 18], [22, 19], [12, 19]];
function makeD(ctx, dest, opts) {
  const o = Object.assign({ tempo: 120, level: 0.26, caps: { toy: 10, pizz: 4, ther: 2, tick: 4 } }, opts);
  const E = new Engine(ctx, dest, o);
  // 重低音ドローン（F1 + C2）。現行タイトルより低めのゲイン、アクセントで -3dB ダック
  E.duck = E.gain(1, E.out);
  const dlp = E.filter('lowpass', 380, 0.7, E.duck);
  const dg = E.gain(0.3, dlp);
  [['sawtooth', hz(-36), -6], ['sawtooth', hz(-36), 7], ['sawtooth', hz(-29), 4], ['triangle', hz(-24), 0]].forEach(([ty, f, d]) => { const os = E.hold(ty, f, d); os.connect(dg); });
  E.lfo(0.045, 220, dlp.frequency);
  E.toy = E.gain(1, E.out);
  E.toy.connect(E.stereoDelay(E.E * 0.75, E.E * 1.0, 0.28, 0.22, 3500));
  E.thBus = E.gain(1, E.out);
  E.thBus.connect(E.stereoDelay(E.E * 1.5, E.E * 2, 0.35, 0.3, 2600));
  E.pizzBus = E.filter('lowpass', 520, 0.5, E.out);
  E.vibGain = E.gain(14); E.hold('sine', 5.6).connect(E.vibGain);
  E.thNext = 2; E.lastDuck = -1;
  E.step = function (n, t) {
    const e = n % BAR, bar = Math.floor(n / BAR), b = bar % 4, ph = Math.floor(bar / 4) % 4;
    const order = ph === 3 ? [1, 0, 3, 2] : [0, 1, 2, 3];
    const row = (ph === 2 && b === 3) ? D_HOOK_B4 : D_HOOK[order[b]];
    const semi = row[e];
    if (semi != null) {
      const acc = ACCENTS.indexOf(e) >= 0;
      this.tone('toy', { t, hz: hz(semi), dur: 0.5, vel: acc ? 0.2 : 0.15, dest: this.toy, type: 'triangle', det: 6, atk: 0.003, holdFrac: 0.04,
        partials: [{ type: 'sine', ratio: 1, gain: 0.7, det: -5 }, { type: 'sine', ratio: 4.01, gain: 0.12, det: 9 }, { type: 'sine', ratio: 6.3, gain: 0.04 }] });
      this.note('toy', t, semi, e, bar);
      if (ph === 1) { const hi = semi + 12; this.tone('toy', { t, hz: hz(hi), dur: 0.35, vel: 0.05, dest: this.toy, type: 'sine', atk: 0.003, holdFrac: 0.03 }); this.note('toy', t, hi, e, bar); }
      if (acc) { // ドローンを短く -3dB
        const d = this.duck.gain; d.setValueAtTime(1, t); d.linearRampToValueAtTime(0.7, t + 0.03); d.linearRampToValueAtTime(1, t + 0.4);
      }
    }
    const gi = ACCENTS.indexOf(e);
    if (gi >= 0) {
      const bs = D_BASS[b][gi];
      this.tone('pizz', { t, hz: hz(bs), dur: 0.2, vel: 0.5, dest: this.pizzBus, type: 'triangle', atk: 0.003, holdFrac: 0.05 });
      this.note('pizz', t, bs, e, bar);
      this.tone('tick', { t, hz: gi === 0 ? 1600 : 1200, dur: 0.03, vel: gi === 0 ? 0.07 : 0.045, dest: this.out, type: 'sine', atk: 0.001, holdFrac: 0.1 });
      this.log.push({ kind: 'tick', t, semi: null, e });
    }
    if (bar >= this.thNext && e === 0) {   // テルミン風の応答（2〜4小節おき）
      const pr = D_THER[Math.floor(this.rng() * D_THER.length)];
      const f1 = hz(pr[0]), f2 = hz(pr[1]);
      if (this.canVoice('ther')) {
        const c = this.ctx; const end = t + 1.85;
        const os = c.createOscillator(); os.type = 'sine'; os.frequency.setValueAtTime(f1 * 0.94, t);
        os.frequency.exponentialRampToValueAtTime(f1, t + 0.18); os.frequency.setValueAtTime(f1, t + 0.7);
        os.frequency.exponentialRampToValueAtTime(f2, t + 1.0);
        os.start(t); os._started = true; os.stop(end);
        const env = c.createGain(); env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.11, t + 0.15);
        env.gain.setValueAtTime(0.11, t + 1.3); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        os.connect(env); env.connect(this.thBus);
        this.vibGain.connect(os.detune); const vg = this.vibGain;
        this.reg('ther', [os, env], end, () => vg.disconnect(os.detune));
        this.note('ther', t, pr[0], e, bar); this.note('ther', t + 1.0, pr[1], e, bar);
      }
      this.thNext = bar + [2, 3, 4][Math.floor(this.rng() * 3)];
    }
  };
  return E.api();
}

export const CANDIDATES = [
  { id: 'A', label: '案A 軽いアンビエント', make: makeA, tempo: 84, level: 1.24,
    desc: '84 /分(8分音符)・7/8(2+2+3)・Fリディアン。サイン/三角のやわらかいパッドが F(add9)→G7/F→Dm7→F7 と2小節ごとに推移し、ガラス質のベルが群頭にまばらに響く。疑似ステレオのディレイで広がる。90Hz以下は極小のサインのみ。軽く静か。' },
  { id: 'B', label: '案B ミッション・テーマ', make: makeB, tempo: 96, level: 0.35,
    desc: '96 /分・7/8(2+2+3)。成功ジングルを穏やかに再構成した口ずさめる主旋律（三角+サイン、軽いビブラート）、25%パルスの小さな裏メロ、群頭(0,2,4)の三角ベース、ごく小さなシェイカー。16小節でフレーズが A-B-A-B′ と変化。前向きで落ち着いた雰囲気。' },
  { id: 'C', label: '案C チップ・ドーン', make: makeC, tempo: 140, level: 0.63,
    desc: '140 /分・7/8(2+2+3)。25%/12.5%デューティのパルス・アルペジオ、群頭の三角ベース、小さなハット。ローパスで角を丸めた軽快なチップチューン。16小節ごとにアルペジオの向きやトップラインが変わる。ジングルに最も近い。' },
  { id: 'D', label: '案D 重低音×ポップ・キッチュ', make: makeD, tempo: 120, level: 0.26,
    desc: '120 /分・7/8(2+2+3)。現行タイトルの重いドローンをF基準(低いF+Cの5度)で残し、現行より低めに混ぜてアクセントで約-3dBダック。その上にトイピアノ/オルゴール調のおどけたフック(#4のBとb7のEbを使用)、跳ねるピチカート・ベース、2〜4小節おきに応答するテルミン風グライド、小さなティック。重さとの落差が魅力。' },
];

export function createCandidate(id, ctx, dest, opts) {
  const c = CANDIDATES.find((x) => x.id === id);
  if (!c) throw new Error('unknown candidate ' + id);
  return c.make(ctx, dest, opts || {});
}
