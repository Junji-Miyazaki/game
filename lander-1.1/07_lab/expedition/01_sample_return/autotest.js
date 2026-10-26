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
      { const tv = m.mvx + clamp(0.3 * (m.mx - s.x), -12, 12); s.vx += clamp(tv - s.vx, -6 / 60, 6 / 60); }   // 帰路の横合わせも理想化（枠は固体なので母船の真下へ回り込む）
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
  // 衝突テスト: 解放後に母船へ速く突っ込ませる。墜落せず跳ね返り、プレイが続くこと。speed 大でもすり抜けないこと
  const bump = (opt = {}) => {
    lab.reset(); lab.script = null;
    for (let i = 0; i < 200 && lab.m.docked; i++) lab.step(1 / 60);
    const s = lab.ship, m = lab.m, sp = opt.speed || 60, ox = opt.ox || 0;
    s.x = m.mx + ox; s.y = 130 + (opt.dy || 60); s.vx = m.mvx + (opt.rvx || 0); s.vy = -sp; s.angle = 0; s.omega = 0;
    let minDy = 1e9, maxDy = -1e9;
    for (let i = 0; i < 180; i++) { lab.step(1 / 60); minDy = Math.min(minDy, s.y - 130); maxDy = Math.max(maxDy, s.y - 130); if (m.result) break; }
    return { bumps: m.bumps, result: m.result, reason: m.reason, state: lab.state, minDy: +minDy.toFixed(1), vy: +s.vy.toFixed(1) };
  };
  // スコア式と永続化: 試行カウンタは解放で+1、reset/再読込で戻らない。★は累積（和集合）
  const score = () => {
    const A = window.__score, ok = [];
    ok.push(A.mult(1) === 1, Math.abs(A.mult(7) - 0.262144) < 1e-9, A.mult(30) === 0.1, A.score(100, 'PERFECT', 1) === 2300, A.score(50, 'GOOD', 3) === Math.round(1600 * 0.64));
    localStorage.removeItem(A.KEY_A); localStorage.removeItem(A.KEY_B);
    run({ ph0: -1.2 }); const a1 = lab.m.final, k1 = localStorage.getItem(A.KEY_A);
    run({ ph0: -1.2 }); const a2 = lab.m.final, k2 = localStorage.getItem(A.KEY_A), best = JSON.parse(localStorage.getItem(A.KEY_B));
    ok.push(a1.attempt === 1 && k1 === '1', a2.attempt === 2 && k2 === '2', Math.abs(a2.mult - 0.8) < 1e-9, a2.score === A.score(a2.fuel, a2.grade, 2), best.score === Math.max(a1.score, a2.score), a2.newStars[0] === false);
    lab.reset(); ok.push(lab.m.attempt === 2 && localStorage.getItem(A.KEY_A) === '2');   // reset では戻らない
    localStorage.removeItem(A.KEY_A); localStorage.removeItem(A.KEY_B);
    return { ok, pass: ok.every(Boolean) };
  };
  window.__auto = { makeCtl, run, bump, score };
}
