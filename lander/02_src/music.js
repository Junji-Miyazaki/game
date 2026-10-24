// 生成音楽 + 効果音（P2m）。WebAudioのみで合成、素材ファイル・既存旋律の引用なし。
// 方針: 2001/ソラリス/ブレードランナー的な気配だけを狙い、控えめ（音楽バス約-18dBFS）。
// ctx は engine.audio.ctx（最初のタップ後に生成）を遅延取得。無い間は全メソッドが no-op。
// 全ヘルパー名は _mus 接頭辞（バンドルは同一スコープに連結されるため）。

const _MUS_MUSIC_LEVEL = 0.125;   // ≒ -18 dBFS
const _MUS_SFX_LEVEL = 0.32;      // ≒ -10 dBFS（音楽より少し大きい）
const _MUS_MAX_MUSIC_VOICES = 14; // 一過性の音楽ボイス上限（ベル/パルス等）
const _MUS_MAX_SFX_VOICES = 10;   // 効果音ボイス上限
const _MUS_LOOKAHEAD = 0.6;       // 先読み秒
const _MUS_XFADE = 2;             // 天体切替クロスフェード秒

const _musS = {
  audio: null, ctx: null, muted: false,
  master: null, musicBus: null, sfxBus: null, noise: null,
  voices: [],   // 一過性ボイス {nodes, end, kind}
  scenes: [],   // 稼働中/フェードアウト中のシーン
  cur: null, curId: null,
};

const _musHas = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(_musSCENES, id);
const _musRand = (a, b) => a + Math.random() * (b - a);
const _musPick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const _musHz = (root, semis) => root * Math.pow(2, semis / 12);

function _musEnsure() {
  const a = _musS.audio;
  const ctx = a && a.ctx;
  if (!ctx) return false;
  if (_musS.ctx === ctx) return true;
  // 新しいctx（または初回）: グラフを作り直す
  _musS.ctx = ctx; _musS.voices = []; _musS.scenes = []; _musS.cur = null; _musS.curId = null;
  const master = ctx.createGain();
  master.gain.value = _musS.muted ? 0 : 1;
  master.connect(ctx.destination);
  const mb = ctx.createGain(); mb.gain.value = _MUS_MUSIC_LEVEL; mb.connect(master);
  const sb = ctx.createGain(); sb.gain.value = _MUS_SFX_LEVEL; sb.connect(master);
  _musS.master = master; _musS.musicBus = mb; _musS.sfxBus = sb;
  // ノイズバッファは1本を全員で共有（2秒、ループ再生）
  const len = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  _musS.noise = buf;
  return true;
}

function _musDisconnect(nodes) {
  for (const n of nodes) {
    try { if (n.stop && n._musStarted) n.stop(); } catch (e) { /* 停止済み */ }
    try { n.disconnect(); } catch (e) { /* 切断済み */ }
  }
}

// 一過性ボイスを登録。上限超過なら false（呼び出し側は生成済みノードを捨てる）
function _musCanVoice(kind) {
  const cap = kind === 's' ? _MUS_MAX_SFX_VOICES : _MUS_MAX_MUSIC_VOICES;
  let n = 0;
  for (const v of _musS.voices) if (v.kind === kind) n++;
  return n < cap;
}
function _musReg(kind, nodes, end) { _musS.voices.push({ kind, nodes, end }); }

function _musOsc(type, freq, t0, t1, detune) {
  const o = _musS.ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  if (detune) o.detune.value = detune;
  o.start(t0); o._musStarted = true;
  if (t1 != null) o.stop(t1);
  return o;
}

function _musNoiseSrc(t0, t1) {
  const s = _musS.ctx.createBufferSource();
  s.buffer = _musS.noise; s.loop = true;
  s.start(t0); s._musStarted = true;
  if (t1 != null) s.stop(t1);
  return s;
}

// 掃除: 終了時刻を過ぎたボイスを切断し、フェード済みシーンを破棄
function _musSweep() {
  const ctx = _musS.ctx; if (!ctx) return;
  const now = ctx.currentTime;
  if (_musS.voices.length) {
    const keep = [];
    for (const v of _musS.voices) { if (v.end <= now) _musDisconnect(v.nodes); else keep.push(v); }
    _musS.voices = keep;
  }
  if (_musS.scenes.length) {
    const keep = [];
    for (const sc of _musS.scenes) {
      if (sc.killAt != null && sc.killAt <= now) _musDisconnect(sc.nodes); else keep.push(sc);
    }
    _musS.scenes = keep;
  }
}

// ---- 音色部品 ----

// ベル: 基音 + 非整数倍音。env は指数減衰。dest（シーン入力）とdelay送りへ接続
function _musBell(sc, t, f, dur, vel, ratio, tri) {
  if (!_musCanVoice('m')) return;
  const ctx = _musS.ctx;
  const end = t + dur + 0.1;
  const o1 = _musOsc(tri ? 'triangle' : 'sine', f, t, end);
  const o2 = _musOsc('sine', f * ratio, t, end);
  const g2 = ctx.createGain(); g2.gain.value = 0.3;
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vel, t + 0.012);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o1.connect(env); o2.connect(g2); g2.connect(env);
  env.connect(sc.bus);
  if (sc.send) env.connect(sc.send);
  _musReg('m', [o1, o2, g2, env], end);
}

// ゆっくり動くLFO → AudioParam
function _musLfo(sc, rate, depth, param) {
  const ctx = _musS.ctx;
  const l = _musOsc('sine', rate, ctx.currentTime);
  const g = ctx.createGain(); g.gain.value = depth;
  l.connect(g); g.connect(param);
  sc.nodes.push(l, g);
  return l;
}

// 持続ドローン: 複数オシレータ → ローパス → 出力
function _musDrone(sc, spec) {
  const ctx = _musS.ctx; const now = ctx.currentTime;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass'; lp.frequency.value = spec.lp; lp.Q.value = spec.q || 0.7;
  const g = ctx.createGain(); g.gain.value = spec.gain;
  lp.connect(g);
  let tail = g;
  if (spec.drive) { // ウェーブシェイパで歪ませる（金星）
    const ws = ctx.createWaveShaper();
    const n = 256, c = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i / (n - 1) * 2 - 1; c[i] = Math.tanh(x * spec.drive); }
    ws.curve = c;
    g.connect(ws); tail = ws;
    sc.nodes.push(ws);
  }
  tail.connect(sc.bus);
  sc.nodes.push(lp, g);
  spec.osc.forEach((o) => {
    const osc = _musOsc(o.type, o.f, now, null, o.det || 0);
    osc.connect(lp); sc.nodes.push(osc);
  });
  if (spec.lfoRate) _musLfo(sc, spec.lfoRate, spec.lfoDepth, lp.frequency);
  if (spec.swellRate) _musLfo(sc, spec.swellRate, spec.swellDepth, g.gain);
  return { lp, g };
}

// 帯域フィルタ付きノイズ（風・空気）
function _musAir(sc, type, freq, q, gain, gustRate, gustDepth, gainGust) {
  const ctx = _musS.ctx; const now = ctx.currentTime;
  const src = _musNoiseSrc(now, null);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.value = gain;
  src.connect(f); f.connect(g); g.connect(sc.bus);
  sc.nodes.push(src, f, g);
  if (gustRate) _musLfo(sc, gustRate, gustDepth, f.frequency);
  if (gainGust) _musLfo(sc, gustRate || 0.05, gainGust, g.gain);
  return { f, g };
}

// フィードバックディレイ（空間感）
function _musDelay(sc, time, fb, wet) {
  const ctx = _musS.ctx;
  const send = ctx.createGain(); send.gain.value = 1;
  const d = ctx.createDelay(2); d.delayTime.value = time;
  const f = ctx.createGain(); f.gain.value = fb;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2400;
  const w = ctx.createGain(); w.gain.value = wet;
  send.connect(d); d.connect(lp); lp.connect(f); f.connect(d); lp.connect(w); w.connect(sc.bus);
  sc.send = send;
  sc.nodes.push(send, d, f, lp, w);
}

// ---- シーン定義 ----
// 各シーン: build(sc) で持続ノードを作り、step(t, sc) で一過性ノートを予約し次までの秒数を返す。
const _musPENT = [0, 2, 4, 7, 9];      // 長調ペンタ
const _musMINP = [0, 3, 5, 7, 10];     // 短調ペンタ

const _musSCENES = {
  title: {
    build(sc) {
      _musDelay(sc, 0.52, 0.5, 0.55);
      _musDrone(sc, { osc: [{ type: 'sawtooth', f: 55, det: -6 }, { type: 'sawtooth', f: 55, det: 7 }, { type: 'triangle', f: 110 }],
        lp: 420, gain: 0.5, lfoRate: 0.045, lfoDepth: 260 });
    },
    step(t, sc) {
      const deg = _musPick(_musPENT) + _musPick([12, 24, 24, 36]);
      _musBell(sc, t, _musHz(110, deg), 3.2, 0.2, 2.76);
      if (Math.random() < 0.25) _musBell(sc, t + 0.35, _musHz(110, _musPick(_musPENT) + 24), 3, 0.12, 2.76);
      return _musRand(2.6, 5.5);
    },
  },
  moon: {
    build(sc) {
      _musDelay(sc, 0.7, 0.45, 0.4);
      _musDrone(sc, { osc: [{ type: 'sine', f: 73.4 }, { type: 'sine', f: 73.4, det: 5 }], lp: 300, gain: 0.12 });
      _musAir(sc, 'bandpass', 900, 0.5, 0.012, 0.03, 300);
    },
    step(t, sc) {
      _musBell(sc, t, _musHz(293.7, _musPick(_musPENT) + _musPick([0, 12])), 4, 0.1, 2.76);
      return _musRand(8, 16);
    },
  },
  europa: {
    build(sc) {
      _musDelay(sc, 0.38, 0.55, 0.6);
      _musDrone(sc, { osc: [{ type: 'sine', f: 92.5 }, { type: 'sine', f: 138.6, det: 4 }], lp: 600, gain: 0.1 });
      _musAir(sc, 'highpass', 6000, 0.7, 0.008);
    },
    step(t, sc) {
      const f = _musHz(739.99, _musPick([0, 3, 5, 7, 10]) + _musPick([0, 12]));
      _musBell(sc, t, f, 2.4, 0.13, 3.5);
      if (Math.random() < 0.4) _musBell(sc, t + 0.18, f * 1.5, 2, 0.07, 3.5);
      return _musRand(1.8, 4.5);
    },
  },
  io: {
    build(sc) {
      sc.beat = 0;
      _musDrone(sc, { osc: [{ type: 'sine', f: 41.2 }, { type: 'triangle', f: 41.2, det: 8 }], lp: 160, gain: 0.25 });
      sc.rumbleAt = -1;
    },
    step(t, sc) {
      // 低いサブパルス（16分刻みの間引きパターン）
      const pat = [1, 0, 0, 1, 0, 1, 0, 0];
      const hit = pat[sc.beat % pat.length]; sc.beat++;
      if (hit && _musCanVoice('m')) {
        const ctx = _musS.ctx; const end = t + 0.45;
        const o = _musOsc('sine', 62, t, end);
        o.frequency.setValueAtTime(62, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.25);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.6, t + 0.015);
        env.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
        o.connect(env); env.connect(sc.bus);
        _musReg('m', [o, env], end);
      }
      if (sc.rumbleAt < 0) sc.rumbleAt = t + _musRand(8, 20);
      if (t >= sc.rumbleAt && _musCanVoice('m')) {
        const ctx = _musS.ctx; const dur = 2.6; const end = t + dur + 0.1;
        const src = _musNoiseSrc(t, end);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 130;
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.5, t + 0.8);
        env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(lp); lp.connect(env); env.connect(sc.bus);
        _musReg('m', [src, lp, env], end);
        sc.rumbleAt = t + _musRand(10, 24);
      }
      return 0.5;
    },
  },
  mars: {
    build(sc) {
      _musAir(sc, 'bandpass', 420, 0.9, 0.35, 0.07, 220, 0.2);
      _musDrone(sc, { osc: [{ type: 'sawtooth', f: 49, det: -5 }, { type: 'sawtooth', f: 49.5, det: 6 }], lp: 180, gain: 0.3, lfoRate: 0.05, lfoDepth: 60 });
    },
    step() { return 5; }, // 持続音のみ
  },
  titan: {
    build(sc) {
      _musDrone(sc, { osc: [{ type: 'sawtooth', f: 32.7, det: -9 }, { type: 'sawtooth', f: 32.7, det: 8 }, { type: 'square', f: 49, det: 3 }],
        lp: 130, q: 1.2, gain: 0.55, lfoRate: 0.03, lfoDepth: 60 });
      _musAir(sc, 'lowpass', 220, 0.6, 0.18, 0.02, 60);
    },
    step(t, sc) {
      if (Math.random() < 0.5) _musBell(sc, t, _musHz(65.4, _musPick([0, 3, 7, 10])), 5, 0.22, 2, true);
      return _musRand(7, 13);
    },
  },
  venus: {
    build(sc) {
      // 歪みの度合いを、ゲインのゆっくりしたうねりで変える（スウェル）
      _musDrone(sc, { osc: [{ type: 'sawtooth', f: 43.65, det: -10 }, { type: 'sawtooth', f: 43.65, det: 9 }, { type: 'square', f: 21.8 }],
        lp: 240, q: 1.5, gain: 0.7, drive: 3.5, swellRate: 0.06, swellDepth: 0.35, lfoRate: 0.04, lfoDepth: 90 });
    },
    step() { return 5; },
  },
};

function _musStartScene(id, fade) {
  const ctx = _musS.ctx; const now = ctx.currentTime;
  const def = _musSCENES[id];
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fade);
  gain.connect(_musS.musicBus);
  const sc = { id, bus: gain, send: null, nodes: [gain], next: now + 0.2, killAt: null };
  def.build(sc);
  _musS.scenes.push(sc);
  return sc;
}

function _musFadeOut(sc, fade) {
  const ctx = _musS.ctx; const now = ctx.currentTime;
  sc.bus.gain.cancelScheduledValues(now);
  sc.bus.gain.setValueAtTime(sc.bus.gain.value, now);
  sc.bus.gain.linearRampToValueAtTime(0, now + fade);
  sc.killAt = now + fade + 0.2;
  sc.next = Infinity;
  for (const n of sc.nodes) { try { if (n.stop && n._musStarted) n.stop(sc.killAt); } catch (e) { /* 既に予約済み */ } }
}

function _musSwitch(id, fade) {
  if (!_musEnsure()) return;
  _musSweep();
  if (!_musHas(id)) id = 'moon';
  if (_musS.cur && _musS.curId === id && _musS.cur.killAt == null) return;
  if (_musS.cur) _musFadeOut(_musS.cur, fade);
  _musS.cur = _musStartScene(id, fade);
  _musS.curId = id;
}

export const Music = {
  attach(engineAudio) { _musS.audio = engineAudio || null; },

  setMuted(m) {
    _musS.muted = !!m;
    if (!_musEnsure()) return;
    const ctx = _musS.ctx; const p = _musS.master.gain; const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(_musS.muted ? 0 : 1, now, 0.04);
  },
  isMuted() { return _musS.muted; },

  playTitle() { _musSwitch('title', _MUS_XFADE); },
  playBody(bodyId) { _musSwitch(_musHas(bodyId) && bodyId !== 'title' ? bodyId : 'moon', _MUS_XFADE); },

  stopAll(fadeSec = 1) {
    if (!_musS.ctx || !_musEnsure()) return;
    const f = Math.max(0.05, +fadeSec || 0);
    for (const sc of _musS.scenes) if (sc.killAt == null) _musFadeOut(sc, f);
    _musS.cur = null; _musS.curId = null;
  },

  tick(dt) {
    if (!_musEnsure()) return;
    _musSweep();
    const now = _musS.ctx.currentTime;
    const sc = _musS.cur;
    if (!sc || sc.killAt != null) return;
    if (sc.next < now) sc.next = now; // タブ休止後などの遅れは詰め直す
    let guard = 8;
    while (sc.next < now + _MUS_LOOKAHEAD && guard-- > 0) {
      const iv = _musSCENES[sc.id].step(sc.next, sc);
      sc.next += Math.max(0.05, iv);
    }
  },

  // テスト用: 現在の稼働数
  _debug() {
    let persistent = 0;
    for (const sc of _musS.scenes) persistent += sc.nodes.length;
    return { voices: _musS.voices.length, scenes: _musS.scenes.length, persistentNodes: persistent, cur: _musS.curId };
  },

  sfx: {
    landing() {
      if (!_musSfxReady()) return;
      const t = _musS.ctx.currentTime + 0.01;
      [0, 4, 7].forEach((s, i) => _musSfxTone('sine', _musHz(523.25, s), t + i * 0.16, 0.9, 0.5, 2.0));
    },
    crash() {
      if (!_musSfxReady()) return;
      const ctx = _musS.ctx; const t = ctx.currentTime + 0.005; const end = t + 1.0;
      const o = _musOsc('sine', 110, t, end);
      o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(32, t + 0.5);
      const e1 = ctx.createGain();
      e1.gain.setValueAtTime(0.0001, t); e1.gain.linearRampToValueAtTime(1, t + 0.008);
      e1.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
      o.connect(e1); e1.connect(_musS.sfxBus);
      const src = _musNoiseSrc(t, end);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(3000, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
      const e2 = ctx.createGain();
      e2.gain.setValueAtTime(0.0001, t); e2.gain.linearRampToValueAtTime(0.7, t + 0.005);
      e2.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
      src.connect(lp); lp.connect(e2); e2.connect(_musS.sfxBus);
      _musReg('s', [o, e1, src, lp, e2], end + 0.1);
    },
    module() {
      if (!_musSfxReady()) return;
      const t = _musS.ctx.currentTime + 0.01;
      [0, 4, 7, 12, 16].forEach((s, i) => _musSfxTone('triangle', _musHz(659.25, s), t + i * 0.065, 0.35, 0.4, 2.0));
    },
    launch() {
      if (!_musSfxReady()) return;
      const ctx = _musS.ctx; const t = ctx.currentTime + 0.01; const dur = 3; const end = t + dur + 0.2;
      const src = _musNoiseSrc(t, end);
      const bp = ctx.createBiquadFilter(); bp.type = 'lowpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(120, t); bp.frequency.exponentialRampToValueAtTime(2500, t + dur);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(0.9, t + 1.8);
      env.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
      src.connect(bp); bp.connect(env); env.connect(_musS.sfxBus);
      const o = _musOsc('sine', 40, t, end);
      o.frequency.exponentialRampToValueAtTime(95, t + dur);
      const e2 = ctx.createGain();
      e2.gain.setValueAtTime(0.0001, t); e2.gain.linearRampToValueAtTime(0.6, t + 1.2);
      e2.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
      o.connect(e2); e2.connect(_musS.sfxBus);
      _musReg('s', [src, bp, env, o, e2], end + 0.1);
    },
    uiTap() {
      if (!_musSfxReady()) return;
      const t = _musS.ctx.currentTime + 0.001;
      _musSfxTone('sine', 1800, t, 0.035, 0.25, 0);
    },
  },
};

function _musSfxReady() {
  if (!_musEnsure()) return false;
  if (_musS.audio && _musS.audio.enabled === false) return false;
  _musSweep();
  return _musCanVoice('s');
}

// 効果音の単音（サイン/三角 + 任意の倍音）
function _musSfxTone(type, f, t, dur, vel, ratio) {
  if (!_musCanVoice('s')) return;
  const ctx = _musS.ctx; const end = t + dur + 0.05;
  const o = _musOsc(type, f, t, end);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vel, t + 0.006);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(env); env.connect(_musS.sfxBus);
  const nodes = [o, env];
  if (ratio) {
    const o2 = _musOsc('sine', f * ratio, t, end);
    const g2 = ctx.createGain(); g2.gain.value = 0.25;
    o2.connect(g2); g2.connect(env); nodes.push(o2, g2);
  }
  _musReg('s', nodes, end);
}
