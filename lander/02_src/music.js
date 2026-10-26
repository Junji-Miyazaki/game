// 生成音楽 + 効果音（P2m）。WebAudioのみで合成、素材ファイル・既存旋律の引用なし。
// 方針: 2001/ソラリス/ブレードランナー的な気配だけを狙い、控えめ（音楽バス約-18dBFS）。
// ctx は engine.audio.ctx（最初のタップ後に生成）を遅延取得。無い間は全メソッドが no-op。
// 全ヘルパー名は _mus 接頭辞（バンドルは同一スコープに連結されるため）。

const _MUS_DUCK = 0.3;           // HOLD 中のBGM倍率
const _MUS_MUSIC_LEVEL = 0.125;   // ≒ -18 dBFS
const _MUS_SFX_LEVEL = 0.32;      // ≒ -10 dBFS（音楽より少し大きい）
const _MUS_MAX_MUSIC_VOICES = 14; // 一過性の音楽ボイス上限（ベル/パルス等）
const _MUS_MAX_SFX_VOICES = 10;   // 効果音ボイス上限
const _MUS_LOOKAHEAD = 0.6;       // 先読み秒
const _MUS_XFADE = 2;             // 天体切替クロスフェード秒
const _MUS_JINGLE_LEVEL = 0.2;    // ジングルは環境BGM(0.125)より大きく、SFX(0.32)より小さく
const _MUS_MAX_JINGLE_VOICES = 18;

const _musS = {
  audio: null, ctx: null, muted: false, ducked: false,
  master: null, musicBus: null, sfxBus: null, noise: null,
  voices: [],   // 一過性ボイス {nodes, end, kind}
  scenes: [],   // 稼働中/フェードアウト中のシーン
  cur: null, curId: null,
  jingle: null, dying: [], jbus: null, pulse: null,
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
  _musS.jingle = null; _musS.dying = []; _musS.pulse = null;
  const master = ctx.createGain();
  master.gain.value = _musS.muted ? 0 : 1;
  master.connect(ctx.destination);
  const mb = ctx.createGain(); mb.gain.value = _MUS_MUSIC_LEVEL * (_musS.ducked ? _MUS_DUCK : 1); mb.connect(master);
  const sb = ctx.createGain(); sb.gain.value = _MUS_SFX_LEVEL; sb.connect(master);
  const jb = ctx.createGain(); jb.gain.value = _MUS_JINGLE_LEVEL; jb.connect(master);
  _musS.master = master; _musS.musicBus = mb; _musS.sfxBus = sb; _musS.jbus = jb;
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
  const cap = kind === 's' ? _MUS_MAX_SFX_VOICES : kind === 'j' ? _MUS_MAX_JINGLE_VOICES : _MUS_MAX_MUSIC_VOICES;
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
  if (_musS.dying.length) {
    const keep = [];
    for (const d of _musS.dying) { if (d.killAt <= now) _musDisconnect(d.nodes); else keep.push(d); }
    _musS.dying = keep;
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


// ---- タイトル曲「牧歌から深宇宙へ」（07_lab の案E2を移植）----
// F リディアン・ドミナント(F G A B C D Eb) / 7/8拍子 2+2+3 / 96 8分音符/分 / 24小節(≒105秒)で一巡。
// 小節1-3 牧歌（三角+サインの主旋律・パルス裏メロ・三角ベース・シェイカー）→ 小節4から約10秒で低いFのドローン(F1+C2)が昇り、
// 小節18から約8秒で退き、牧歌(小節20-24)に戻って周回。ドローン中は主旋律アクセントで約-3dBダック、裏メロを間引き、
// テルミン風: 小節2・4の終わりに単発の応答グライド、小節6〜ドローン退場までは背景の間欠テルミン・ジェスチャー（約3拍鳴いて1拍休みを繰り返す。にゅわーん/びーよよよよ/みよよよよーん）。奇数周回はフレーズ順を1つずらす。音は全てオリジナル。
// ボイスは一過性の音楽ボイス('m')として数える（上限14。タイトルの実測最大は9）。
const _MUS_T_ROOT = 349.23;                 // F4
const _MUS_T_E = 60 / 96;                   // 8分音符の秒数
const _MUS_T_BAR = 7;
const _MUS_T_ACC = [0, 2, 4];               // 2+2+3 の群頭
const _MUS_T_GRP = [2, 2, 3];
const _MUS_T_CYCLE = 24;                    // 一周の小節数
const _MUS_T_IN = 3;                        // ドローンが入る小節（0始まり＝小節4）
const _MUS_T_OUT = 17;                      // ドローンが退き始める小節（0始まり＝小節18）
const _MUS_T_FADE_IN = 10, _MUS_T_FADE_OUT = 8;
const _MUS_T_DRONE = 0.19;                  // ドローンのゲイン（スマホで聴こえるよう 0.12→0.19 ≈ +4dB。旧タイトル0.5よりは低い）
const _MUS_T_DLP_LO = 180, _MUS_T_DLP_HI = 650;   // ドローンのローパス（閉→開）。スマホの小型スピーカーは~150Hz未満がほぼ出ないため、倍音を通して「低いうなり」を聴こえさせる
const _MUS_T_THER_VEL = 0.11;               // テルミン風グライドの音量（0.07→0.11 ≈ +4dB。頻度は据え置き＝時折）
const _MUS_T_GEST_VEL = _MUS_T_THER_VEL;   // 背景テルミン・ジェスチャーのピーク音量（単発グライドと同じ。個別に調整するならここ）
const _MUS_T_SCALE = [0, 2, 4, 6, 7, 9, 10];
const _MUS_T_BGPOOL = [0, 2, 4, 6, 7, 9, 10, 12, 14, 16, 18, 19, 21, 22];   // 背景テルミンの音域 F4〜Eb6（リディアン・ドミナントのみ）
const _MUS_T_LEVEL = 1.6;                   // シーン出力ゲイン（音楽バス0.125の手前）。旧タイトル RMS -24.6/peak -14 dBFS に対し新曲 約 -26.6/-14 dBFS（オフライン実測、同一経路）
const _MUS_T_PLAN = [0, 1, 0, 1, 0, 2];     // 4小節フレーズ型: 0=A 1=B 2=B'（終止）
const _MUS_T_PH = [
  [[12, null, 19, null, 18, 19, null], [21, null, 19, 16, 19, null, null], [16, null, 19, null, 22, 21, 19], [18, null, 19, null, 12, null, null]],
  [[12, 14, 16, null, 19, null, 21], [22, null, 21, 19, 16, null, null], [14, null, 16, null, 19, 21, 22], [19, null, 18, null, 12, null, null]],
];
const _MUS_T_CNT = [
  [null, 4, null, 7, null, 12, null], [null, 9, null, 7, null, 4, 7],
  [null, 7, null, 9, null, 10, 9], [null, 6, null, 7, null, null, null],
];
const _MUS_T_BASS = [[-12, -5, -12], [-12, -2, -5], [-15, -12, -5], [-12, -10, -12]];
const _MUS_T_THER = [[16, 21], [19, 18], [22, 19], [12, 19]];

// 緩いビブラート: detune を直線ランプで往復（共有LFOを使わないので切断が単純）
function _musTVib(o, t, dur, cents, rate) {
  if (!o.detune || dur < 0.35) return;
  const half = 0.5 / rate; let sign = 1;
  o.detune.setValueAtTime(0, t + 0.18);
  for (let x = t + 0.18 + half; x < t + dur - 0.05; x += half) { o.detune.linearRampToValueAtTime(sign * cents, x); sign = -sign; }
}

// 擬似ステレオのフィードバックディレイ。入力ゲインを返す（出力は sc.out へ）
function _musTStereoDelay(sc, tl, tr, fb, wet, lpHz) {
  const ctx = _musS.ctx;
  const input = ctx.createGain(); input.gain.value = 1;
  const w = ctx.createGain(); w.gain.value = wet; w.connect(sc.out);
  sc.nodes.push(input, w);
  [[tl, -0.7], [tr, 0.7]].forEach(([time, pan]) => {
    const d = ctx.createDelay(2); d.delayTime.value = time;
    const f = ctx.createGain(); f.gain.value = fb;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = lpHz;
    input.connect(d); d.connect(lp); lp.connect(f); f.connect(d);
    sc.nodes.push(d, f, lp);
    if (typeof ctx.createStereoPanner === 'function') {
      const sp = ctx.createStereoPanner(); sp.pan.value = pan; lp.connect(sp); sp.connect(w); sc.nodes.push(sp);
    } else lp.connect(w);
  });
  return input;
}

// 音程付きの1音。spec: {t, semi, dur, vel, dest, type|wave, atk, holdFrac, partials, vib}
function _musTTone(sc, spec) {
  if (!_musCanVoice('m')) return;
  const ctx = _musS.ctx; const t = spec.t; const end = t + spec.dur + 0.05;
  const f = _musHz(_MUS_T_ROOT, spec.semi);
  const env = ctx.createGain(); const atk = spec.atk || 0.008;
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(spec.vel, t + atk);
  env.gain.setValueAtTime(spec.vel, t + Math.max(atk, spec.dur * (spec.holdFrac != null ? spec.holdFrac : 0.5)));
  env.gain.exponentialRampToValueAtTime(0.0001, t + spec.dur);
  env.connect(spec.dest);
  const nodes = [env];
  const mk = (type, freq, g, wave) => {
    const o = ctx.createOscillator(); o.frequency.value = freq;
    if (wave) o.setPeriodicWave(wave); else o.type = type;
    o.start(t); o._musStarted = true; o.stop(end);
    if (g !== 1) { const gg = ctx.createGain(); gg.gain.value = g; o.connect(gg); gg.connect(env); nodes.push(gg); } else o.connect(env);
    nodes.push(o); return o;
  };
  const pw = spec.wave ? _musPulse() : null;
  const main = mk(pw ? 'square' : spec.type, f, 1, pw);
  for (const p of (spec.partials || [])) mk(p.type, f * p.ratio, p.gain, null);
  if (spec.vib) _musTVib(main, t, spec.dur, 6, 5.2);
  _musReg('m', nodes, end);
  sc.log.push({ kind: spec.kind, t, semi: spec.semi, e: spec.e, bar: spec.bar, vel: spec.vel }); if (sc.log.length > 600) sc.log.shift();
}

// 小節 bar の主旋律の行（step と背景テルミンの衝突回避で共用）
function _musTRow(bar) {
  const b = bar % 4, cyc = Math.floor(bar / _MUS_T_CYCLE), bc = bar % _MUS_T_CYCLE;
  const typ = _MUS_T_PLAN[(Math.floor(bc / 4) + (cyc % 2)) % _MUS_T_PLAN.length];
  return typ === 0 ? _MUS_T_PH[0][b] : (typ === 2 && b === 3) ? _MUS_T_PH[0][3] : _MUS_T_PH[1][b];
}

// 背景テルミン: 小節6〜ドローン退場までの「間欠ジェスチャー」。約3拍の鳴き(にゅわーん / びーよよよよ / みよよよよーん)→1拍休み、を繰り返す。
// 1ジェスチャー=サイン1本+エンベロープ1つ（同時に鳴るのは1つだけ）。端点はF リディアン・ドミナントの音のみ。
// 状態ベース: tick が遅れても取りこぼさず、周回ごとに別の並びを生成。主旋律と同じ音高にはならないよう逃がす。
function _musTWob(o, t0, t1, rate, c0, c1) {   // 速い/深いワブル（深さが c0→c1 セントへ広がる）
  if (!o.detune) return;
  const half = 0.5 / rate; let sign = 1;
  o.detune.setValueAtTime(0, t0);
  for (let x = t0 + half; x < t1; x += half) { o.detune.linearRampToValueAtTime(sign * (c0 + (c1 - c0) * (x - t0) / Math.max(0.001, t1 - t0)), x); sign = -sign; }
}

function _musTTarget(pool, idx, lo, hi, up) {   // idx から lo..hi 半音離れた pool の音（上/下）。無ければ -1
  const c = [];
  for (let i = 0; i < pool.length; i++) { const d = (pool[i] - pool[idx]) * (up ? 1 : -1); if (d >= lo && d <= hi) c.push(i); }
  return c.length ? _musPick(c) : -1;
}

function _musTBg(sc, t, n, bc, cyc) {
  const E = _MUS_T_E; const ctx = _musS.ctx; const pool = _MUS_T_BGPOOL;
  if (sc.bgCyc !== cyc && bc >= 5 && bc < _MUS_T_OUT) { sc.bgCyc = cyc; sc.gNext = t; }
  if (sc.gNext == null) return;
  if (sc.gNext < t) sc.gNext = t;
  const leadAt = (time) => { const m = n + Math.floor((time - t) / E + 1e-6); return _musTRow(Math.floor(m / _MUS_T_BAR))[m % _MUS_T_BAR]; };
  const dodge = (idx, time) => {   // 主旋律と同音なら1オクターブ離すか隣の音へ
    const lead = leadAt(time);
    if (lead == null || pool[idx] !== lead) return idx;
    const alt = pool.indexOf(lead - 12) >= 0 ? pool.indexOf(lead - 12) : pool.indexOf(lead + 12);
    return alt >= 0 ? alt : (idx > 0 ? idx - 1 : idx + 1);
  };
  while (sc.gNext <= t + E) {
    const tg = sc.gNext;
    const mG = n + Math.floor((tg - t) / E + 1e-6); const barG = Math.floor(mG / _MUS_T_BAR); const bcG = barG % _MUS_T_CYCLE;
    if (Math.floor(barG / _MUS_T_CYCLE) !== sc.bgCyc || bcG < 5 || bcG >= _MUS_T_OUT) { sc.gNext = null; return; }   // ドローンと一緒に打ち切り
    const dur = E * _musRand(2.5, 3.5), rest = E * _musRand(1, 1.5);
    sc.gNext = tg + dur + rest;
    if (!_musCanVoice('m')) continue;
    // 種類: 同じ種類が3回続かないように
    const hist = sc.gHist || (sc.gHist = []);
    let ty = _musPick(['nyu', 'bii', 'miyo']);
    if (hist.length >= 2 && hist[hist.length - 1] === ty && hist[hist.length - 2] === ty) ty = _musPick(['nyu', 'bii', 'miyo'].filter((x) => x !== ty));
    hist.push(ty); if (hist.length > 8) hist.shift();
    let i0 = dodge(2 + Math.floor(Math.random() * 8), tg), i1 = i0;
    const f = (i) => _musHz(_MUS_T_ROOT, pool[i]);
    const o = _musOsc('sine', f(i0), tg, tg + dur + 0.05);
    const env = ctx.createGain(); const L = _MUS_T_GEST_VEL;
    const fr = o.frequency; fr.setValueAtTime(f(i0), tg);
    if (ty === 'nyu') {   // にゅわーん: 膨らんで、全体の約60%で滑らかに上下へ5〜12半音、終わりにビブラートが広がり消える
      const up = Math.random() < 0.5;
      i1 = _musTTarget(pool, i0, 5, 12, up); if (i1 < 0) i1 = _musTTarget(pool, i0, 5, 12, !up); if (i1 < 0) i1 = i0 > 0 ? i0 - 1 : i0 + 1;
      i1 = dodge(i1, tg + dur);
      fr.setValueAtTime(f(i0), tg + dur * 0.12); fr.exponentialRampToValueAtTime(f(i1), tg + dur * 0.72);
      _musTWob(o, tg + dur * 0.1, tg + dur, 5.5, 8, 35);
      env.gain.setValueAtTime(0.0001, tg); env.gain.linearRampToValueAtTime(L, tg + dur * 0.3); env.gain.setValueAtTime(L, tg + dur * 0.62); env.gain.exponentialRampToValueAtTime(0.0001, tg + dur);
    } else if (ty === 'bii') {   // びーよよよよ: 同じ高さで速く深いワブル(7〜9Hz, 20→60セント)、最後に1〜2半音さがる
      if (i0 < 1) i0 = i1 = 3;
      i1 = Math.max(0, dodge(i0 - 1, tg + dur));   // プール内の隣接音は1〜2半音差
      fr.setValueAtTime(f(i0), tg + dur * 0.65); fr.exponentialRampToValueAtTime(f(i1), tg + dur * 0.95);
      _musTWob(o, tg + 0.05, tg + dur, _musRand(7, 9), 20, 60);
      env.gain.setValueAtTime(0.0001, tg); env.gain.linearRampToValueAtTime(L, tg + 0.12); env.gain.setValueAtTime(L, tg + dur * 0.7); env.gain.exponentialRampToValueAtTime(0.0001, tg + dur);
    } else {   // みよよよよーん: 前半40%は速いワブル(約40セント)、その後5度〜1オクターブ滑って尾(ーん)が消える
      const up = Math.random() < 0.5;
      i1 = _musTTarget(pool, i0, 7, 12, up); if (i1 < 0) i1 = _musTTarget(pool, i0, 7, 12, !up); if (i1 < 0) i1 = i0 > 0 ? i0 - 1 : i0 + 1;
      i1 = dodge(i1, tg + dur);
      fr.setValueAtTime(f(i0), tg + dur * 0.4); fr.exponentialRampToValueAtTime(f(i1), tg + dur * 0.8);
      _musTWob(o, tg + 0.05, tg + dur * 0.4, 8, 40, 40); _musTWob(o, tg + dur * 0.8, tg + dur, 5.5, 6, 12);
      env.gain.setValueAtTime(0.0001, tg); env.gain.linearRampToValueAtTime(L, tg + 0.1); env.gain.setValueAtTime(L, tg + dur * 0.75); env.gain.exponentialRampToValueAtTime(0.0001, tg + dur);
    }
    o.connect(env); env.connect(sc.thBus);
    _musReg('m', [o, env], tg + dur + 0.05);
    _musS.voices[_musS.voices.length - 1].sc = sc;
    const eG = mG % _MUS_T_BAR;
    sc.log.push({ kind: 'bg', t: tg, semi: pool[i0], e: eG, bar: barG, vel: L }, { kind: 'bg', t: tg + dur, semi: pool[i1], e: eG, bar: barG, vel: L, end: true },
      { kind: 'gest', t: tg, dur, type: ty, semi: pool[i0], semi1: pool[i1], e: eG, bar: barG, vel: L });
    while (sc.log.length > 600) sc.log.shift();
  }
}

function _musTitleScene() {
  return {
    build(sc) {
      const ctx = _musS.ctx; const now = ctx.currentTime;
      sc.n = 0; sc.dState = null; sc.thNext = 0; sc.log = []; sc.dlog = [];
      sc.out = ctx.createGain(); sc.out.gain.value = _MUS_T_LEVEL; sc.out.connect(sc.bus); sc.nodes.push(sc.out);
      const lp = (type, hzv, to) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = hzv; b.Q.value = 0.5; b.connect(to); sc.nodes.push(b); return b; };
      sc.leadBus = lp('lowpass', 2600, sc.out);
      sc.leadBus.connect(_musTStereoDelay(sc, _MUS_T_E, _MUS_T_E * 1.5, 0.3, 0.22, 2400));
      sc.cntBus = lp('lowpass', 1800, sc.out);
      sc.bassBus = lp('lowpass', 700, sc.out);
      sc.thBus = ctx.createGain(); sc.thBus.gain.value = 1; sc.thBus.connect(sc.out); sc.nodes.push(sc.thBus);
      sc.thBus.connect(_musTStereoDelay(sc, _MUS_T_E * 1.5, _MUS_T_E * 2, 0.35, 0.25, 2600));
      // ドローン（F1 + C2 + F2）: 無音から始め、ローパスをゆっくり開く。duck でアクセント時に約-3dB
      sc.duck = ctx.createGain(); sc.duck.gain.value = 1; sc.duck.connect(sc.out);
      sc.dlp = ctx.createBiquadFilter(); sc.dlp.type = 'lowpass'; sc.dlp.frequency.value = _MUS_T_DLP_LO; sc.dlp.Q.value = 0.7; sc.dlp.connect(sc.duck);
      sc.dg = ctx.createGain(); sc.dg.gain.value = 0.0001; sc.dg.connect(sc.dlp);
      sc.nodes.push(sc.duck, sc.dlp, sc.dg);
      [['sawtooth', 43.65, -6], ['sawtooth', 43.65, 7], ['sawtooth', 65.41, 4], ['triangle', 87.31, 0]].forEach(([type, f, det]) => {
        const o = _musOsc(type, f, now, null, det); o.connect(sc.dg); sc.nodes.push(o);
      });
      // スマホ用の倍音レイヤー（F3 三角波、控えめ）: 小型スピーカーでもドローンの存在が聴こえる帯域
      { const g = ctx.createGain(); g.gain.value = 0.35; g.connect(sc.dg); const o = _musOsc('triangle', 174.61, now, null, 3); o.connect(g); sc.nodes.push(g, o); }
      _musLfo(sc, 0.045, 120, sc.dlp.frequency);
    },
    step(t, sc) {
      const E = _MUS_T_E; const n = sc.n++;
      const e = n % _MUS_T_BAR, bar = Math.floor(n / _MUS_T_BAR), b = bar % 4;
      const cyc = Math.floor(bar / _MUS_T_CYCLE), bc = bar % _MUS_T_CYCLE;
      // ドローンの出入り（状態遷移で管理: 遅れても取りこぼさない）
      if (e === 0) {
        const want = bc >= _MUS_T_IN && bc < _MUS_T_OUT;
        if (want && sc.dState !== 'in') {
          sc.dState = 'in';
          sc.dg.gain.cancelScheduledValues(t); sc.dg.gain.setValueAtTime(0.0001, t); sc.dg.gain.linearRampToValueAtTime(_MUS_T_DRONE, t + _MUS_T_FADE_IN);
          sc.dlp.frequency.setValueAtTime(_MUS_T_DLP_LO, t); sc.dlp.frequency.exponentialRampToValueAtTime(_MUS_T_DLP_HI, t + _MUS_T_FADE_IN + 2);
          sc.dlog.push({ kind: 'in', t0: t, t1: t + _MUS_T_FADE_IN, bar });
        } else if (!want && sc.dState === 'in') {
          sc.dState = 'out';
          sc.dg.gain.cancelScheduledValues(t); sc.dg.gain.setValueAtTime(_MUS_T_DRONE, t); sc.dg.gain.linearRampToValueAtTime(0.0001, t + _MUS_T_FADE_OUT);
          sc.dlp.frequency.setValueAtTime(_MUS_T_DLP_HI, t); sc.dlp.frequency.exponentialRampToValueAtTime(_MUS_T_DLP_LO, t + _MUS_T_FADE_OUT);
          sc.dlog.push({ kind: 'out', t0: t, t1: t + _MUS_T_FADE_OUT, bar });
        }
      }
      const droneOn = bc >= _MUS_T_IN && bc < _MUS_T_OUT + 2;
      const ph = Math.floor(bc / 4);
      const row = _musTRow(bar);
      const semi = row[e];
      const acc = _MUS_T_ACC.indexOf(e);
      if (semi != null) {
        let j = e + 1; while (j < _MUS_T_BAR && row[j] == null) j++;
        const dur = Math.min(3 * E, j < _MUS_T_BAR ? (j - e) * E * 0.97 : (_MUS_T_BAR - e) * E * 1.2);
        _musTTone(sc, { kind: 'lead', t, semi, e, bar, dur, vel: acc >= 0 ? 0.24 : 0.19, dest: sc.leadBus, type: 'triangle', atk: 0.03, holdFrac: 0.6, vib: true,
          partials: [{ type: 'sine', ratio: 1, gain: 0.6 }] });
        if (acc >= 0 && droneOn) { const d = sc.duck.gain; d.setValueAtTime(1, t); d.linearRampToValueAtTime(0.7, t + 0.03); d.linearRampToValueAtTime(1, t + 0.5); }
      }
      if (ph >= 1) {
        const c = _MUS_T_CNT[b][e];
        if (c != null && !(droneOn && (e === 3 || e === 6))) {
          _musTTone(sc, { kind: 'cnt', t, semi: c, e, bar, dur: E * 0.7, vel: droneOn ? 0.06 : 0.08, dest: sc.cntBus, wave: true, atk: 0.004, holdFrac: 0.3 });
        }
      }
      if (acc >= 0) {
        const bs = _MUS_T_BASS[b][acc];
        _musTTone(sc, { kind: 'bass', t, semi: bs, e, bar, dur: E * _MUS_T_GRP[acc] * 0.85, vel: 0.3, dest: sc.bassBus, type: 'triangle', atk: 0.01, holdFrac: 0.5 });
        if (_musCanVoice('m')) {   // 極小のシェイカー（帯域ノイズ）
          const ctx = _musS.ctx; const end = t + 0.1;
          const src = _musNoiseSrc(t, end);
          const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 6000; bp.Q.value = 1;
          const env = ctx.createGain(); const v = acc === 0 ? 0.05 : 0.032;
          env.gain.setValueAtTime(v, t); env.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
          src.connect(bp); bp.connect(env); env.connect(sc.out);
          _musReg('m', [src, bp, env], end);
        }
      }
      // 単発グライド（リードに応える）: 各周回の小節2と小節4の終わり（e=5）
      if ((bc === 1 || bc === 3) && e === 5 && _musCanVoice('m')) {
        const pr = _musPick(_MUS_T_THER);
        const f1 = _musHz(_MUS_T_ROOT, pr[0]), f2 = _musHz(_MUS_T_ROOT, pr[1]);
        const ctx = _musS.ctx; const end = t + 1.85;
        const o = _musOsc('sine', f1 * 0.94, t, end);
        o.frequency.setValueAtTime(f1 * 0.94, t); o.frequency.exponentialRampToValueAtTime(f1, t + 0.18);
        o.frequency.setValueAtTime(f1, t + 0.7); o.frequency.exponentialRampToValueAtTime(f2, t + 1.0);
        _musTVib(o, t, 1.8, 12, 5.6);
        const env = ctx.createGain();
        env.gain.setValueAtTime(0.0001, t); env.gain.linearRampToValueAtTime(_MUS_T_THER_VEL, t + 0.2);
        env.gain.setValueAtTime(_MUS_T_THER_VEL, t + 1.3); env.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
        o.connect(env); env.connect(sc.thBus);
        _musReg('m', [o, env], end);
        sc.log.push({ kind: 'ther', t, semi: pr[0], e, bar, vel: _MUS_T_THER_VEL }, { kind: 'ther', t: t + 1.0, semi: pr[1], e, bar, vel: _MUS_T_THER_VEL });
      }
      _musTBg(sc, t, n, bc, cyc);
      return E;
    },
  };
}

const _musSCENES = {
  title: _musTitleScene(),   // 案E2「牧歌から深宇宙へ」（下の _MUS_T_* 参照）
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
  terra: {   // ボーナス専用の昼の惑星: 明るい長調のやわらかいパッド + やさしい風 + 稀なやわらかいベル（ハーモニック）
    build(sc) {
      _musDelay(sc, 0.6, 0.4, 0.35);
      _musDrone(sc, { osc: [{ type: 'sine', f: 130.8 }, { type: 'triangle', f: 164.8, det: 4 }, { type: 'sine', f: 196, det: -3 }, { type: 'sine', f: 293.7, det: 5 }],
        lp: 1100, gain: 0.14, lfoRate: 0.05, lfoDepth: 260, swellRate: 0.07, swellDepth: 0.04 });
      _musAir(sc, 'bandpass', 650, 0.6, 0.02, 0.06, 180, 0.012);
    },
    step(t, sc) {
      _musBell(sc, t, _musHz(523.25, _musPick(_musPENT) + _musPick([0, 12])), 3.2, 0.07, 2);
      return _musRand(5, 10);
    },
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
  for (const v of _musS.voices) { // シーン所有の持続ボイス（背景テルミン）も同時に止める
    if (v.sc !== sc) continue;
    v.end = Math.min(v.end, sc.killAt);
    for (const n of v.nodes) { try { if (n.stop && n._musStarted) n.stop(sc.killAt); } catch (e) { /* ok */ } }
  }
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


// ---- 成功ジングル（7/8拍子 2+2+3、F リディアン・ドミナント）----
// 音階: 1 2 3 #4 5 6 b7 = 0 2 4 6 7 9 10（半音）。#4(6)とb7(10)をフックに含める。オリジナル旋律（既存曲の引用なし）。
const _MUS_J_ROOT = 349.23;                  // F4
const _MUS_J_SCALE = [0, 2, 4, 6, 7, 9, 10];
const _MUS_J_TEMPO = [168, 184, 200];        // 8分音符/分（tier別）
const _MUS_J_ACCENTS = [0, 2, 4];            // 2+2+3 の群頭
const _MUS_J_BAR = 7;
// 旋律（F4=0 からの半音、null=休符）。イントロ2小節は1回、ループ2小節は stopJingle まで反復
const _MUS_J_INTRO = [[12, 16, 19, 18, 21, 22, 21], [19, 22, 21, 18, 19, 16, 12]];
const _MUS_J_LOOP = [
  [[19, null, 21, null, 22, 21, 19], [18, null, 19, null, 16, null, 12]],                 // tier0: 疎で軽い
  [[21, 24, null, 22, 21, null, 19], [21, 18, 19, null, 16, 18, 19]],                      // tier1: シンコペ
  [[19, 21, 24, 22, 21, 19, 22], [21, 18, 19, 16, 16, 19, 24]],                            // tier2: 速く、末尾はアルペジオ上行
];
const _MUS_J_FILL = [26, 24, 22, 21, 19, 18, 16];  // tier>=1: ループ2周に1回、2小節目を下行フィルに差替え
const _MUS_J_BASS = [[-12, -5, -12], [-12, -2, -5]];
const _MUS_J_SPARKLE = [28, 31, 34];               // perfect: 各小節の最終群に高域アルペジオ（F7構成音）

function _musPulse() {
  const ctx = _musS.ctx;
  if (_musS.pulse !== null) return _musS.pulse;
  _musS.pulse = false;
  if (typeof ctx.createPeriodicWave === 'function') {
    try {
      const N = 32, d = 0.25, real = new Float32Array(N + 1), imag = new Float32Array(N + 1);
      for (let n = 1; n <= N; n++) {
        real[n] = (2 / (n * Math.PI)) * Math.sin(2 * Math.PI * n * d);
        imag[n] = (2 / (n * Math.PI)) * (1 - Math.cos(2 * Math.PI * n * d));
      }
      _musS.pulse = ctx.createPeriodicWave(real, imag);
    } catch (e) { _musS.pulse = false; }
  }
  return _musS.pulse;
}

function _musJNote(J, kind, t, semi, dur, vel, type) {
  if (!_musCanVoice('j')) return;
  const ctx = _musS.ctx; const end = t + dur + 0.05;
  const o = ctx.createOscillator();
  o.frequency.value = _musHz(_MUS_J_ROOT, semi);
  const pw = type === 'pulse' ? _musPulse() : null;
  if (pw) o.setPeriodicWave(pw); else o.type = type === 'pulse' ? 'square' : type;
  o.start(t); o._musStarted = true; o.stop(end);
  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(vel, t + 0.005);
  env.gain.setValueAtTime(vel, t + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(env); env.connect(J.bus);
  _musReg('j', [o, env], end);
  J.log.push({ kind, t, semi }); if (J.log.length > 400) J.log.shift();
}

function _musJHat(J, t, vel) {
  if (!_musCanVoice('j')) return;
  const ctx = _musS.ctx; const end = t + 0.06;
  const src = _musNoiseSrc(t, end);
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 7000;
  const env = ctx.createGain();
  env.gain.setValueAtTime(vel, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  src.connect(hp); hp.connect(env); env.connect(J.bus);
  _musReg('j', [src, hp, env], end);
  J.log.push({ kind: 'hat', t, semi: null }); if (J.log.length > 400) J.log.shift();
}

// n = ジングル開始からの8分音符通し番号。1つの8分音符分の音を t に予約
function _musJStep(J, n, t) {
  const E = J.E; const bar = Math.floor(n / _MUS_J_BAR); const e = n % _MUS_J_BAR;
  let pat, bassBar;
  if (bar < 2) { pat = _MUS_J_INTRO[bar]; bassBar = bar; }
  else {
    const k = bar - 2; const which = k % 2; const cycle = Math.floor(k / 2);
    pat = _MUS_J_LOOP[J.tier][which]; bassBar = which;
    if (which === 1 && J.tier >= 1 && cycle % 2 === 1) pat = _MUS_J_FILL;
  }
  const accent = _MUS_J_ACCENTS.indexOf(e);
  const semi = pat[e];
  const hi = J.tier >= 1 ? 1 : 0.85;
  if (semi != null) {
    const dur = E * (accent >= 0 ? 0.95 : 0.8);
    _musJNote(J, 'lead', t, semi, dur, accent >= 0 ? 0.5 * hi : 0.38 * hi, 'pulse');
    if (J.tier >= 2) _musJNote(J, 'dbl', t, semi + 12, dur * 0.8, 0.16, 'pulse');
  }
  if (accent >= 0) {
    const grp = e === 4 ? 3 : 2;
    _musJNote(J, 'bass', t, _MUS_J_BASS[bassBar][accent], E * grp * 0.85, 0.7, 'triangle');
    _musJHat(J, t, accent === 0 ? 0.3 : 0.2);
  }
  if (J.perfect && e >= 4) _musJNote(J, 'sparkle', t, _MUS_J_SPARKLE[e - 4], E * 1.3, 0.14, 'sine');
}

function _musJStop(fade) {
  const J = _musS.jingle; if (!J) return;
  _musS.jingle = null;
  const ctx = _musS.ctx; const now = ctx.currentTime;
  const f = Math.max(0.05, +fade || 0);
  J.bus.gain.cancelScheduledValues(now);
  J.bus.gain.setValueAtTime(J.bus.gain.value, now);
  J.bus.gain.linearRampToValueAtTime(0, now + f);
  const killAt = now + f + 0.1;
  for (const v of _musS.voices) if (v.kind === 'j') v.end = Math.min(v.end, killAt);
  _musS.dying.push({ nodes: [J.bus], killAt });
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

  // MISSION HOLD 中にBGMだけを約30%へ下げる（SFXは下げない）。ctx無しなら状態だけ保存して何もしない
  duck(on) {
    _musS.ducked = !!on;
    if (!_musEnsure() || !_musS.musicBus) return;
    const ctx = _musS.ctx; const p = _musS.musicBus.gain; const now = ctx.currentTime;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(_MUS_MUSIC_LEVEL * (_musS.ducked ? _MUS_DUCK : 1), now, 0.08);
  },

  playTitle() { _musJStop(0.3); _musSwitch('title', _MUS_XFADE); },
  playBody(bodyId) { _musSwitch(_musHas(bodyId) && bodyId !== 'title' ? bodyId : 'moon', _MUS_XFADE); },

  // 成功ジングル。BGMは呼び出し側が stopAll で止める（ここでは止めない）。ミュート/音声無効/ctx無しは何もしない
  playJingle(opts) {
    const o = opts || {};
    if (!_musEnsure()) return;
    _musJStop(0.05);
    if (_musS.muted || (_musS.audio && _musS.audio.enabled === false)) return;
    _musSweep();
    const tier = Math.max(0, Math.min(2, Math.floor(+o.tier) || 0));
    const ctx = _musS.ctx; const now = ctx.currentTime;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(_musS.jbus);
    const tempo = _MUS_J_TEMPO[tier];
    const E = 60 / tempo;
    _musS.jingle = { tier, perfect: !!o.perfect, bus, E, tempo, t0: now + 0.03, next: now + 0.03, n: 0, log: [] };
  },
  // HALL OF FAME 用ファンファーレ（約2秒、7/8＝2+2+3、F リディアン・ドミナント）。ミュート/音声無効/ctx無しは何もしない。タイトル曲とは別系統（stopFanfare で止める）
  playFanfare() {
    if (!_musEnsure()) return false;
    if (_musS.muted || (_musS.audio && _musS.audio.enabled === false)) return false;
    _musSweep();
    Music.stopFanfare(0.05);
    const ctx = _musS.ctx; const now = ctx.currentTime;
    const bus = ctx.createGain(); bus.gain.value = 1; bus.connect(_musS.jbus);
    const sc = { bus, send: null };
    const E = 60 / 200, t0 = now + 0.05, hz = (s) => _musHz(_MUS_J_ROOT, s);
    // 2+2+3: 群頭 e0,e2,e4。F-A-C と上行、#4(18)を経て b7(22)から主音の上のオクターブ(24)へ。最後は F-A-C の和音
    _musBell(sc, t0, hz(-12), 1.0, 0.16, 2, true);
    for (const [e, s, d, v] of [[0, 12, 0.5, 0.13], [2, 16, 0.5, 0.13], [4, 19, 0.45, 0.14], [5, 18, 0.45, 0.11], [6, 22, 0.35, 0.13]]) _musBell(sc, t0 + e * E, hz(s), d, v, 2, true);
    const tf = t0 + 7 * E;   // 次小節の頭に着地（約2.1秒）
    for (const [s, v] of [[12, 0.13], [16, 0.11], [19, 0.11], [24, 0.15], [-12, 0.15]]) _musBell(sc, tf, hz(s), 1.0, v, 2, true);
    _musS.fanfare = { bus, endAt: tf + 1.1 };
    _musS.dying.push({ nodes: [bus], killAt: tf + 1.4 });
    return true;
  },
  stopFanfare(fadeSec = 0.2) {
    const F = _musS.fanfare;
    if (!F || !_musS.ctx) return;
    _musS.fanfare = null;
    const now = _musS.ctx.currentTime, f = Math.max(0.05, +fadeSec || 0);
    try { F.bus.gain.cancelScheduledValues(now); F.bus.gain.setValueAtTime(F.bus.gain.value, now); F.bus.gain.linearRampToValueAtTime(0, now + f); } catch (_) { /* ignore */ }
  },
  stopJingle(fadeSec = 0.3) {
    if (!_musS.ctx || !_musEnsure()) return;
    _musJStop(fadeSec);
  },
  // 同期用: { playing, eighthIndex(0..6), phase(0..1), tempo } / 再生していなければ null
  jingleBeat() {
    const J = _musS.jingle;
    if (!J || !_musS.ctx) return null;
    const x = (_musS.ctx.currentTime - J.t0) / J.E;
    if (!(x >= 0)) return { playing: true, eighthIndex: 0, phase: 0, tempo: J.tempo };
    const k = Math.floor(x);
    return { playing: true, eighthIndex: k % _MUS_J_BAR, phase: x - k, tempo: J.tempo };
  },

  stopAll(fadeSec = 1) {
    if (!_musS.ctx || !_musEnsure()) return;
    const f = Math.max(0.05, +fadeSec || 0);
    _musJStop(f);
    for (const sc of _musS.scenes) if (sc.killAt == null) _musFadeOut(sc, f);
    _musS.cur = null; _musS.curId = null;
  },

  tick(dt) {
    if (!_musEnsure()) return;
    _musSweep();
    const now = _musS.ctx.currentTime;
    const J = _musS.jingle;
    if (J) {
      if (J.next < now) { // 遅れは拍位置を保ったまま詰める
        const skip = Math.ceil((now - J.next) / J.E); J.next += skip * J.E; J.n += skip;
      }
      let g = 16;
      while (J.next < now + _MUS_LOOKAHEAD && g-- > 0) { _musJStep(J, J.n, J.next); J.n++; J.next += J.E; }
    }
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
    return { jingle: _musS.jingle ? { tier: _musS.jingle.tier, perfect: _musS.jingle.perfect, E: _musS.jingle.E, t0: _musS.jingle.t0, tempo: _musS.jingle.tempo } : null,
      jingleLog: _musS.jingle ? _musS.jingle.log.slice() : [], titleLog: (_musS.cur && _musS.curId === 'title') ? _musS.cur.log.slice() : [], titleDrone: (_musS.cur && _musS.curId === 'title') ? _musS.cur.dlog.slice() : [], dying: _musS.dying.length, voices: _musS.voices.length, scenes: _musS.scenes.length, persistentNodes: persistent, cur: _musS.curId };
  },

  jingleInfo: { root: _MUS_J_ROOT, scale: _MUS_J_SCALE.slice(), barLength: _MUS_J_BAR, accents: _MUS_J_ACCENTS.slice(), tempos: _MUS_J_TEMPO.slice() },

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
