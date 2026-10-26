// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 注意: 姿勢は「理想的に」直接セットする（実機の回転は遅いので、これは流れ・判定・燃料の確認用であって人間の腕前の保証ではない）。
const YR = 130 + 31, SX = 222;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function install(lab) {
  const makeCtl = (opt = {}) => {
    const V = opt.V || 16; let stage = 'climb';
    return (l) => {
      const s = l.ship, m = l.m, o = {};
      if (l.state === 'grounded') { stage = 'climb'; return m.sampled ? { main: true } : {}; }
      if (!m.sampled) {
        const alt = l.terrainY(s.x) - (s.y + 16);
        const tvx = alt < 60 ? clamp(0.25 * (SX - s.x), -3, 3) : clamp(0.1 * (SX - s.x), -10, 10);
        const tvy = Math.min(18, 2 + Math.sqrt(2 * 3 * Math.max(0, alt)));
        s.angle = clamp(2.5 * (tvx - s.vx), -28, 28); s.omega = 0;
        if (s.vy > tvy) o.main = true;
        return o;
      }
      const dy = s.y - YR;
      if (stage === 'climb' && dy <= V * V / (2 * 4.8) + 8) stage = 'brake';
      if (stage === 'brake' && s.vy > -0.6) stage = 'hold';
      if (stage === 'climb') { s.angle = 0; s.omega = 0; if (s.vy > -V) o.main = true; }
      else if (stage === 'brake') { s.angle = 180; s.omega = 0; if (s.vy < -Math.sqrt(2 * 3.5 * Math.max(dy, 0))) o.main = true; }
      else { s.angle = 0; s.omega = 0; }
      return o;
    };
  };
  const run = (opt = {}) => {
    if (opt.ph0 != null) lab.params.ph0 = opt.ph0;
    lab.reset(); const ctl = makeCtl(opt); const log = []; let last = '';
    for (let i = 0; i < 60 * 150; i++) {
      lab.script = ctl; lab.step(1 / 60);
      const ph = lab.m.result || (lab.m.sampled ? 'return' : lab.state);
      if (ph !== last) { log.push(lab.t.toFixed(0) + 's ' + ph + ' fuel' + Math.round(lab.fuelPct())); last = ph; }
      if (lab.m.result && lab.m.resultT > 1.5) break;
    }
    lab.script = null;
    return { result: lab.m.result, final: lab.m.final, reason: lab.m.reason, detail: lab.m.detail, log: log.join(' | ') };
  };
  window.__auto = { makeCtl, run };
}
