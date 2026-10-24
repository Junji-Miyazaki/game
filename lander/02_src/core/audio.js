// 矩形波の短いBEEP音。80年代マイコン風のSE。
// WebAudioはユーザー操作後でないと鳴らせないため、最初の入力でresume()する。
export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
  }

  // 初回のユーザー操作で呼ぶ
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // freq: 周波数(Hz), dur: 長さ(秒), type: 'square'|'sine'|'triangle'|'sawtooth'
  beep(freq = 440, dur = 0.08, type = 'square', vol = 0.15) {
    if (!this.enabled || !this.ctx) return;
    const t0 = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  // 連続した音階（メロディ/効果音シーケンス）
  sequence(notes) {
    if (!this.enabled || !this.ctx) return;
    let t = 0;
    for (const n of notes) {
      setTimeout(() => this.beep(n.freq, n.dur || 0.08, n.type || 'square', n.vol || 0.15), t * 1000);
      t += (n.gap != null ? n.gap : (n.dur || 0.08));
    }
  }

  // よく使うSE
  move()    { this.beep(220, 0.04, 'square', 0.08); }
  pick()    { this.beep(880, 0.07, 'square', 0.14); }
  good()    { this.sequence([{ freq: 660 }, { freq: 880 }, { freq: 1320 }]); }
  bad()     { this.beep(120, 0.25, 'sawtooth', 0.18); }
  select()  { this.beep(520, 0.05, 'square', 0.12); }
}
