/**
 * sfx.js — 神速 SHINSOKU audio engine
 * Procedural Web Audio API sound synthesis. No audio files, no DOM, no external deps.
 * Import: import { SFX } from './sfx.js';
 */

// ─── Internal state ───────────────────────────────────────────────────────────

let _ctx = null;           // AudioContext (created lazily on init())
let _master = null;        // Master GainNode → destination
let _muted = false;        // Mute flag
let _initialized = false;

// Pre-baked noise buffers (created once on init)
let _whiteNoiseBuf = null;
let _pinkNoiseBuf  = null;

// Ambient state
let _ambientNodes = [];        // all running ambient source/gain nodes
let _ambientDripInterval = null;

// Rate-limit state for hit()
let _lastHitTime = -Infinity;
const HIT_THROTTLE_MS = 40;

// localStorage key
const MUTE_KEY = 'shinsoku_muted';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Guard: returns true if we should skip making sound. */
function _skip() {
  return !_initialized || !_ctx || _muted;
}

/** Convenience: current AudioContext time. */
function _now() {
  return _ctx.currentTime;
}

/**
 * Create a GainNode that is wired to the master output.
 * Returns the GainNode (set .gain.value before use).
 */
function _masterGain(gainVal = 1) {
  const g = _ctx.createGain();
  g.gain.value = gainVal;
  g.connect(_master);
  return g;
}

/**
 * Create a BiquadFilterNode connected to `dest`.
 * @param {AudioNode} dest
 * @param {string} type  BiquadFilter type
 * @param {number} freq
 * @param {number} [Q]
 * @param {number} [gain_dB]
 */
function _filter(dest, type, freq, Q = 1, gain_dB = 0) {
  const f = _ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = Q;
  f.gain.value = gain_dB;
  f.connect(dest);
  return f;
}

/**
 * Schedule an OscillatorNode through a GainNode envelope → master.
 * Cleans up automatically.
 * @param {number}   freq     Hz
 * @param {string}   type     OscillatorType
 * @param {number}   vol      peak gain
 * @param {number}   attack   seconds
 * @param {number}   decay    seconds
 * @param {number}   sustain  sustain level (0–1 of vol)
 * @param {number}   release  seconds after decay
 * @param {number}   [detune] cents
 * @param {AudioNode} [out]   destination (defaults to master)
 */
function _osc(freq, type, vol, attack, decay, sustain, release, detune = 0, out = null) {
  const dest = out || _master;
  const g = _ctx.createGain();
  g.gain.setValueAtTime(0, _now());
  g.gain.linearRampToValueAtTime(vol, _now() + attack);
  g.gain.linearRampToValueAtTime(vol * sustain, _now() + attack + decay);
  g.gain.linearRampToValueAtTime(0, _now() + attack + decay + release);
  g.connect(dest);

  const o = _ctx.createOscillator();
  o.type = type;
  o.frequency.value = freq;
  o.detune.value = detune;
  o.connect(g);
  o.start(_now());
  o.stop(_now() + attack + decay + release + 0.01);
  o.onended = () => { o.disconnect(); g.disconnect(); };
  return o;
}

/**
 * Noise burst: plays a slice of the given buffer through a filter → gain → master.
 * @param {AudioBuffer} buf
 * @param {string}       filterType
 * @param {number}       filterFreq
 * @param {number}       vol
 * @param {number}       duration   seconds
 * @param {AudioNode}    [out]
 */
function _noise(buf, filterType, filterFreq, vol, duration, out = null) {
  const dest = out || _master;
  const g = _ctx.createGain();
  g.gain.setValueAtTime(vol, _now());
  g.gain.exponentialRampToValueAtTime(0.0001, _now() + duration);
  g.connect(dest);

  const f = _ctx.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = filterFreq;
  f.connect(g);

  const src = _ctx.createBufferSource();
  src.buffer = buf;
  src.connect(f);
  src.start(_now());
  src.stop(_now() + duration + 0.01);
  src.onended = () => { src.disconnect(); f.disconnect(); g.disconnect(); };
  return src;
}

/** Build a white-noise AudioBuffer (2 seconds, mono). */
function _makeWhiteNoiseBuf() {
  const len = _ctx.sampleRate * 2;
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** Build a pink-noise AudioBuffer (2 seconds, mono) via Paul Kellett algorithm. */
function _makePinkNoiseBuf() {
  const len = _ctx.sampleRate * 2;
  const buf = _ctx.createBuffer(1, len, _ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0=0,b1=0,b2=0,b3=0,b4=0,b5=0,b6=0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886*b0 + w*0.0555179;
    b1 = 0.99332*b1 + w*0.0750759;
    b2 = 0.96900*b2 + w*0.1538520;
    b3 = 0.86650*b3 + w*0.3104856;
    b4 = 0.55000*b4 + w*0.5329522;
    b5 = -0.7616*b5 - w*0.0168980;
    data[i] = (b0+b1+b2+b3+b4+b5+b6 + w*0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/** Fade out and disconnect a set of ambient nodes. */
function _fadeOutAmbient(nodes, duration = 1.5) {
  for (const n of nodes) {
    if (n._gainNode) {
      try {
        n._gainNode.gain.cancelScheduledValues(_now());
        n._gainNode.gain.linearRampToValueAtTime(0, _now() + duration);
      } catch (_) { /* context may be gone */ }
    }
    try {
      setTimeout(() => {
        try { n.stop && n.stop(); } catch (_) {}
        try { n.disconnect && n.disconnect(); } catch (_) {}
        if (n._gainNode) {
          try { n._gainNode.disconnect(); } catch (_) {}
        }
      }, (duration + 0.1) * 1000);
    } catch (_) {}
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export const SFX = {

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  init() {
    // Read persisted mute state
    try {
      const stored = localStorage.getItem(MUTE_KEY);
      if (stored !== null) _muted = stored === 'true';
    } catch (_) {}

    if (_initialized && _ctx) {
      // If suspended (e.g. after tab backgrounding), resume
      if (_ctx.state === 'suspended') _ctx.resume();
      return;
    }

    try {
      _ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[SFX] AudioContext unavailable:', e);
      return;
    }

    // Master chain: master gain → destination
    _master = _ctx.createGain();
    _master.gain.value = 0.25;   // overall level ceiling
    _master.connect(_ctx.destination);

    // Pre-bake noise buffers
    _whiteNoiseBuf = _makeWhiteNoiseBuf();
    _pinkNoiseBuf  = _makePinkNoiseBuf();

    _initialized = true;

    if (_ctx.state === 'suspended') _ctx.resume();
  },

  // ── Mute / toggle ──────────────────────────────────────────────────────────

  setMuted(bool) {
    _muted = !!bool;
    try { localStorage.setItem(MUTE_KEY, String(_muted)); } catch (_) {}
    // Kill ambient immediately when muting
    if (_muted) SFX.stopAmbient();
  },

  toggle() {
    SFX.setMuted(!_muted);
    return _muted;
  },

  isMuted() {
    return _muted;
  },

  // ── One-shot SFX ──────────────────────────────────────────────────────────

  /**
   * hit() — light blade-on-flesh tick.
   * Rate-limited to ~25×/sec maximum to survive 神速 spam.
   * Very short, very quiet.
   */
  hit() {
    if (_skip()) return;
    const now = performance.now();
    if (now - _lastHitTime < HIT_THROTTLE_MS) return;
    _lastHitTime = now;

    // Short high-pass noise transient + a quick sine blip
    _noise(_whiteNoiseBuf, 'bandpass', 3800 + Math.random()*800, 0.06, 0.04);
    _osc(900 + Math.random()*200, 'sine', 0.05, 0, 0.01, 0, 0.03);
  },

  /**
   * crit() — brighter, sharper, slightly louder hit.
   */
  crit() {
    if (_skip()) return;

    // Bright bandpass noise crack
    _noise(_whiteNoiseBuf, 'bandpass', 5500, 0.12, 0.07);
    // Two sine tones for metallic bite
    _osc(1400, 'sine',   0.10, 0, 0.005, 0, 0.08);
    _osc(2800, 'sine',   0.05, 0, 0.003, 0, 0.06);
    // Small downward pitch blip for emphasis
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0.08, _now());
    g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.12);
    g.connect(_master);
    const o = _ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2200, _now());
    o.frequency.exponentialRampToValueAtTime(600, _now() + 0.12);
    o.connect(g);
    o.start(_now()); o.stop(_now() + 0.13);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  },

  /**
   * kill() — crunchy impact + short downward blip (enemy death).
   */
  kill() {
    if (_skip()) return;

    // Low-mid impact: filtered pink noise thud
    _noise(_pinkNoiseBuf, 'lowpass', 400, 0.18, 0.12);
    // High crunch layer
    _noise(_whiteNoiseBuf, 'bandpass', 2200, 0.10, 0.06);

    // Downward blip (pitch falls)
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0.12, _now());
    g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.22);
    g.connect(_master);
    const o = _ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(320, _now());
    o.frequency.exponentialRampToValueAtTime(60, _now() + 0.22);
    o.connect(g);
    o.start(_now()); o.stop(_now() + 0.23);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  },

  /**
   * levelUp() — bright rising 4-note arpeggio/chime.
   */
  levelUp() {
    if (_skip()) return;

    // Four-note rising arpeggio in a pentatonic-ish pattern
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const t = i * 0.10;
      const g = _ctx.createGain();
      g.gain.setValueAtTime(0, _now() + t);
      g.gain.linearRampToValueAtTime(0.13, _now() + t + 0.02);
      g.gain.linearRampToValueAtTime(0.06, _now() + t + 0.12);
      g.gain.linearRampToValueAtTime(0, _now() + t + 0.45);
      g.connect(_master);

      // Sine for body
      const o1 = _ctx.createOscillator();
      o1.type = 'sine';
      o1.frequency.value = freq;
      o1.connect(g);
      o1.start(_now() + t);
      o1.stop(_now() + t + 0.46);
      o1.onended = () => { o1.disconnect(); };

      // Triangle overtone (octave up, quieter)
      const o2 = _ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = freq * 2;
      const g2 = _ctx.createGain();
      g2.gain.value = 0.3;
      o2.connect(g2);
      g2.connect(g);
      o2.start(_now() + t);
      o2.stop(_now() + t + 0.46);
      o2.onended = () => { o2.disconnect(); g2.disconnect(); if (i === notes.length-1) g.disconnect(); };
    });
  },

  /**
   * skill(kind) — activation whoosh.
   * kind: 'speed' | 'power' | 'hp'
   */
  skill(kind = 'speed') {
    if (_skip()) return;

    switch (kind) {

      case 'speed': {
        // Fast rising shimmer — sweep sawtooth + high bandpass noise
        const g = _ctx.createGain();
        g.gain.setValueAtTime(0.04, _now());
        g.gain.linearRampToValueAtTime(0.14, _now() + 0.08);
        g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.35);
        g.connect(_master);

        const o = _ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(300, _now());
        o.frequency.exponentialRampToValueAtTime(2400, _now() + 0.30);
        o.connect(g);
        o.start(_now()); o.stop(_now() + 0.36);
        o.onended = () => { o.disconnect(); g.disconnect(); };

        // High shimmer noise layer
        _noise(_whiteNoiseBuf, 'highpass', 4000, 0.07, 0.30);
        break;
      }

      case 'power': {
        // Low punchy swell — pitched down, rumble + sub thud
        _noise(_pinkNoiseBuf, 'lowpass', 300, 0.18, 0.40);

        // Sub-bass swell
        const g = _ctx.createGain();
        g.gain.setValueAtTime(0, _now());
        g.gain.linearRampToValueAtTime(0.18, _now() + 0.06);
        g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.45);
        g.connect(_master);

        const o = _ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(80, _now());
        o.frequency.exponentialRampToValueAtTime(40, _now() + 0.40);
        o.connect(g);
        o.start(_now()); o.stop(_now() + 0.46);
        o.onended = () => { o.disconnect(); g.disconnect(); };

        // Mid crunch transient
        _noise(_whiteNoiseBuf, 'bandpass', 900, 0.12, 0.15);
        break;
      }

      case 'hp':
      default: {
        // Soft warm bloom — gentle sine choir swell
        const freqs = [261.63, 329.63, 392.00]; // C4 E4 G4
        freqs.forEach((freq, i) => {
          const g = _ctx.createGain();
          g.gain.setValueAtTime(0, _now());
          g.gain.linearRampToValueAtTime(0.09, _now() + 0.18);
          g.gain.linearRampToValueAtTime(0.04, _now() + 0.45);
          g.gain.linearRampToValueAtTime(0, _now() + 0.70);
          g.connect(_master);

          const o = _ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          o.detune.value = (i - 1) * 6; // slight warmth
          o.connect(g);
          o.start(_now()); o.stop(_now() + 0.71);
          o.onended = () => { o.disconnect(); g.disconnect(); };
        });

        // Soft pink noise bloom
        _noise(_pinkNoiseBuf, 'lowpass', 800, 0.05, 0.50);
        break;
      }
    }
  },

  /**
   * pickup(rarity) — pleasant blip; rarity scales brightness/duration/sparkle.
   * rarity: 'common'|'rare'|'epic'|'legendary'|undefined
   */
  pickup(rarity) {
    if (_skip()) return;

    const rarityMap = { common: 0, rare: 1, epic: 2, legendary: 3 };
    const level = (rarity != null && rarityMap[rarity] !== undefined)
      ? rarityMap[rarity] : 0;

    // Base blip: rising frequency
    const baseFreq  = [600,  800,  1000, 1200][level];
    const topFreq   = [1000, 1600, 2400, 3600][level];
    const vol       = [0.10, 0.12, 0.14, 0.16][level];
    const dur       = [0.12, 0.18, 0.28, 0.45][level];
    const sparkle   = [0,    1,    2,    4   ][level];

    const g = _ctx.createGain();
    g.gain.setValueAtTime(vol, _now());
    g.gain.exponentialRampToValueAtTime(0.0001, _now() + dur);
    g.connect(_master);

    const o = _ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(baseFreq, _now());
    o.frequency.exponentialRampToValueAtTime(topFreq, _now() + dur * 0.6);
    o.connect(g);
    o.start(_now()); o.stop(_now() + dur + 0.01);
    o.onended = () => { o.disconnect(); g.disconnect(); };

    // Sparkle: extra high-frequency tinkles for rare+
    for (let i = 0; i < sparkle; i++) {
      const delay = 0.05 + i * 0.07;
      const sparkG = _ctx.createGain();
      sparkG.gain.setValueAtTime(0, _now() + delay);
      sparkG.gain.linearRampToValueAtTime(0.06, _now() + delay + 0.01);
      sparkG.gain.exponentialRampToValueAtTime(0.0001, _now() + delay + 0.12);
      sparkG.connect(_master);

      const sparkO = _ctx.createOscillator();
      sparkO.type = 'sine';
      sparkO.frequency.value = 2000 + i * 600 + Math.random() * 400;
      sparkO.connect(sparkG);
      sparkO.start(_now() + delay);
      sparkO.stop(_now() + delay + 0.13);
      sparkO.onended = () => { sparkO.disconnect(); sparkG.disconnect(); };
    }
  },

  /**
   * playerHurt() — short low thud/grunt tone for taking damage.
   */
  playerHurt() {
    if (_skip()) return;

    // Low thud: pink noise lowpass burst
    _noise(_pinkNoiseBuf, 'lowpass', 350, 0.22, 0.18);

    // Dissonant descending sine grunt
    const g = _ctx.createGain();
    g.gain.setValueAtTime(0.12, _now());
    g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.20);
    g.connect(_master);
    const o = _ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(180, _now());
    o.frequency.exponentialRampToValueAtTime(90, _now() + 0.18);
    o.connect(g);
    o.start(_now()); o.stop(_now() + 0.21);
    o.onended = () => { o.disconnect(); g.disconnect(); };

    // High-freq distress click
    _noise(_whiteNoiseBuf, 'bandpass', 1800, 0.08, 0.05);
  },

  /**
   * enterArea(theme) — brief transition swell.
   * theme: 'dungeon'|'grassland'|'forest'
   */
  enterArea(theme = 'dungeon') {
    if (_skip()) return;

    switch (theme) {

      case 'dungeon': {
        // Ominous low swell + metallic shimmer
        _noise(_pinkNoiseBuf, 'lowpass', 250, 0.14, 0.80);

        const g = _ctx.createGain();
        g.gain.setValueAtTime(0, _now());
        g.gain.linearRampToValueAtTime(0.10, _now() + 0.30);
        g.gain.linearRampToValueAtTime(0, _now() + 0.90);
        g.connect(_master);
        const o = _ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = 55;
        o.detune.value = 7; // slightly detuned for unease
        o.connect(g);
        o.start(_now()); o.stop(_now() + 0.91);
        o.onended = () => { o.disconnect(); g.disconnect(); };

        // Metal shimmer (high filtered noise)
        _noise(_whiteNoiseBuf, 'bandpass', 3200, 0.05, 0.60);
        break;
      }

      case 'grassland': {
        // Bright airy major-chord swell
        const notes = [392.00, 523.25, 659.25]; // G4 C5 E5
        notes.forEach((freq, i) => {
          const g = _ctx.createGain();
          g.gain.setValueAtTime(0, _now());
          g.gain.linearRampToValueAtTime(0.08, _now() + 0.20 + i*0.05);
          g.gain.linearRampToValueAtTime(0, _now() + 0.80 + i*0.05);
          g.connect(_master);
          const o = _ctx.createOscillator();
          o.type = 'triangle';
          o.frequency.value = freq;
          o.connect(g);
          o.start(_now()); o.stop(_now() + 0.85 + i*0.05);
          o.onended = () => { o.disconnect(); g.disconnect(); };
        });
        _noise(_whiteNoiseBuf, 'highpass', 5000, 0.04, 0.70);
        break;
      }

      case 'forest': {
        // Dark eerie minor-ish swell + wind
        const notes = [174.61, 220.00, 261.63]; // F3 A3 C4 (minor-flavoured)
        notes.forEach((freq, i) => {
          const g = _ctx.createGain();
          g.gain.setValueAtTime(0, _now());
          g.gain.linearRampToValueAtTime(0.07, _now() + 0.25 + i*0.08);
          g.gain.linearRampToValueAtTime(0, _now() + 1.00 + i*0.05);
          g.connect(_master);
          const o = _ctx.createOscillator();
          o.type = 'sine';
          o.frequency.value = freq;
          o.detune.value = -12; // slightly dark
          o.connect(g);
          o.start(_now()); o.stop(_now() + 1.05 + i*0.05);
          o.onended = () => { o.disconnect(); g.disconnect(); };
        });
        // Wind: highpass noise fade
        _noise(_pinkNoiseBuf, 'bandpass', 1200, 0.06, 0.90);
        break;
      }
    }
  },

  // ── Ambient bed ────────────────────────────────────────────────────────────

  /**
   * ambient(theme) — looping ambient pad. Crossfades from any previous ambient.
   * theme: 'dungeon'|'grassland'|'forest'
   */
  ambient(theme = 'dungeon') {
    if (_skip()) return;

    // Fade out old ambient
    SFX.stopAmbient();

    const nodes = [];  // track all nodes so stopAmbient can clean them

    /**
     * Helper: create a looping oscillator with a slow LFO on gain.
     * Returns { stop } for cleanup.
     */
    const makeOscPad = (freq, type, baseVol, lfoFreq, lfoDepth, detuneVal = 0) => {
      const gainNode = _ctx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(_master);

      // Fade in
      gainNode.gain.linearRampToValueAtTime(baseVol, _now() + 1.5);

      // LFO for tremolo
      const lfo = _ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = lfoFreq;
      const lfoGain = _ctx.createGain();
      lfoGain.gain.value = lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(gainNode.gain);
      lfo.start();

      const osc = _ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      osc.detune.value = detuneVal;
      osc.connect(gainNode);
      osc.start();

      const entry = {
        _gainNode: gainNode,
        stop() {
          try { osc.stop(); } catch (_) {}
          try { lfo.stop(); } catch (_) {}
          try { osc.disconnect(); } catch (_) {}
          try { lfo.disconnect(); } catch (_) {}
          try { lfoGain.disconnect(); } catch (_) {}
          try { gainNode.disconnect(); } catch (_) {}
        }
      };
      nodes.push(entry);
      return entry;
    };

    /**
     * Helper: looping filtered noise pad.
     */
    const makeNoisePad = (buf, filterType, filterFreq, vol, lfoFreq, lfoDepth) => {
      const gainNode = _ctx.createGain();
      gainNode.gain.value = 0;
      gainNode.connect(_master);
      gainNode.gain.linearRampToValueAtTime(vol, _now() + 1.5);

      const lfo = _ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = lfoFreq;
      const lfoGain = _ctx.createGain();
      lfoGain.gain.value = lfoDepth;
      lfo.connect(lfoGain);
      lfoGain.connect(gainNode.gain);
      lfo.start();

      const filt = _ctx.createBiquadFilter();
      filt.type = filterType;
      filt.frequency.value = filterFreq;
      filt.connect(gainNode);

      // Loop the noise buffer
      const src = _ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(filt);
      src.start();

      const entry = {
        _gainNode: gainNode,
        stop() {
          try { src.stop(); } catch (_) {}
          try { lfo.stop(); } catch (_) {}
          try { src.disconnect(); } catch (_) {}
          try { filt.disconnect(); } catch (_) {}
          try { lfo.disconnect(); } catch (_) {}
          try { lfoGain.disconnect(); } catch (_) {}
          try { gainNode.disconnect(); } catch (_) {}
        }
      };
      nodes.push(entry);
      return entry;
    };

    switch (theme) {

      case 'dungeon': {
        // Low ominous drone — two detuned sines
        makeOscPad(55,   'sine', 0.08, 0.05, 0.015);          // sub
        makeOscPad(55.5, 'sine', 0.05, 0.07, 0.010, 18);      // slightly detuned
        makeOscPad(110,  'sine', 0.03, 0.03, 0.008);          // octave
        // Filtered pink noise bed (very quiet hiss)
        makeNoisePad(_pinkNoiseBuf, 'lowpass', 300, 0.04, 0.11, 0.01);

        // Sparse water drips via a slow interval
        const dripFn = () => {
          if (_skip() || _ambientNodes !== nodes) return;
          // Random drip: a short sine ping
          const freq = 800 + Math.random() * 600;
          const g = _ctx.createGain();
          g.gain.setValueAtTime(0.06, _now());
          g.gain.exponentialRampToValueAtTime(0.0001, _now() + 0.35);
          g.connect(_master);
          const o = _ctx.createOscillator();
          o.type = 'sine';
          o.frequency.setValueAtTime(freq, _now());
          o.frequency.exponentialRampToValueAtTime(freq * 0.6, _now() + 0.35);
          o.connect(g);
          o.start(_now()); o.stop(_now() + 0.36);
          o.onended = () => { o.disconnect(); g.disconnect(); };
        };
        // Schedule drips at irregular intervals (2–7 s)
        const scheduleDrip = () => {
          if (_ambientNodes !== nodes) return;
          const delay = 2000 + Math.random() * 5000;
          _ambientDripInterval = setTimeout(() => {
            dripFn();
            scheduleDrip();
          }, delay);
        };
        scheduleDrip();
        break;
      }

      case 'grassland': {
        // Bright airy pad — higher harmonic series
        makeOscPad(261.63, 'triangle', 0.06, 0.09, 0.012);        // C4
        makeOscPad(329.63, 'triangle', 0.05, 0.11, 0.010, -8);    // E4 detuned
        makeOscPad(392.00, 'sine',     0.04, 0.07, 0.008, 12);    // G4
        // High-frequency airy noise (wind)
        makeNoisePad(_whiteNoiseBuf, 'highpass', 5500, 0.03, 0.05, 0.008);
        break;
      }

      case 'forest': {
        // Dark eerie pad — minor tonality, slower LFOs
        makeOscPad(87.31,  'sine',     0.07, 0.04, 0.015);         // F2 sub
        makeOscPad(130.81, 'sine',     0.05, 0.06, 0.012, -10);    // C3 detune
        makeOscPad(174.61, 'triangle', 0.04, 0.03, 0.008, 7);      // F3
        // Wind-like bandpass noise
        makeNoisePad(_pinkNoiseBuf, 'bandpass', 1000, 0.05, 0.08, 0.015);
        // Sub rumble
        makeNoisePad(_pinkNoiseBuf, 'lowpass', 200, 0.04, 0.06, 0.01);
        break;
      }
    }

    _ambientNodes = nodes;
  },

  /**
   * stopAmbient() — fade out and clean up any running ambient.
   */
  stopAmbient() {
    if (_ambientDripInterval !== null) {
      clearTimeout(_ambientDripInterval);
      _ambientDripInterval = null;
    }
    if (_ambientNodes.length > 0) {
      _fadeOutAmbient(_ambientNodes, 1.2);
      _ambientNodes = [];
    }
  },
};
