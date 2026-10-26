// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 流れ: docked(係留1.2s+自動で漂う) → descent → sampling(着地して2s) → return → win。
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
        const tvx = alt < 60 ? clamp(0.25 * (SX - s.x), -3, 3) : Math.sign(SX - s.x) * Math.min(10, Math.sqrt(2 * 1.2 * Math.max(Math.abs(SX - s.x) - 4, 0)));   // 制動曲線
        const tvy = Math.min(18, 2 + Math.sqrt(2 * 3 * Math.max(0, alt)));
        // 横移動は理想化: vx を目標へ 2.4px/s² で直接寄せる（推力で横移動すると鉛直の持ち分が足りないため）。燃料は鉛直制動ぶんのみ
        s.vx += clamp(tvx - s.vx, -2.4 / 60, 2.4 / 60); s.angle = 0; s.omega = 0;
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
      const ph = lab.m.result || (lab.m.docked ? 'docked' : lab.m.sampled ? 'return' : lab.state === 'grounded' ? (lab.m.gauge > 0 ? 'sampling' : 'grounded') : 'descent');
      if (ph !== last) { log.push(lab.t.toFixed(0) + 's ' + ph + ' fuel' + Math.round(lab.fuelPct())); last = ph; }
      if (lab.m.result && lab.m.resultT > 1.5) break;
    }
    lab.script = null;
    return { result: lab.m.result, final: lab.m.final, reason: lab.m.reason, detail: lab.m.detail, log: log.join(' | ') };
  };
  window.__auto = { makeCtl, run };
}
