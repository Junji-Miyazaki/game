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
  const run = (opt = {}) => {   // opt.mode 指定でメニュー経由と同じ begin()、なければ現状のモードで reset
    if (opt.ph0 != null) lab.params.ph0 = opt.ph0;
    if (opt.mode) window.__flow.begin(opt.mode, opt); else lab.reset();
    const ctl = makeCtl(opt); const log = []; let last = '';
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
  // メニュー → MISSION/PRACTICE、スコア式（ライフ倍率）、ライフ喪失 → MISSION FAILED、練習は保存しない、★和集合・最高スコア
  const score = () => {
    const A = window.__score, F = window.__flow, B = F.BTN, ok = {}, K = A.KEY_B;
    const get = () => localStorage.getItem(K), step = (sec) => { for (let i = 0; i < sec * 60; i++) lab.step(1 / 60); };
    const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
    const kill = () => { for (let i = 0; i < 200 && lab.m.docked; i++) lab.step(1 / 60); lab.m.result || lab.crash('TEST', 'forced'); };   // 解放後に墜落させる
    const wipe = () => { localStorage.removeItem(K); localStorage.removeItem('lander11.exp.sample_return.attempts'); };
    wipe(); const sv = { ...F.sess };
    // 式
    ok.formula = [A.mult(3) === 1, A.mult(2) === 0.8, A.mult(1) === 0.6, A.score(100, 'PERFECT', 3) === 2300, A.score(50, 'GOOD', 2) === Math.round(1600 * 0.8), A.score(0, null, 1) === 600];
    // メニュー: ボタン 44px 以上、PRACTICE タップで練習へ、MENU で戻る
    F.begin('menu'); ok.menu = [lab.m.menu === true, B.practice.h >= 44, B.mission.h >= 44, B.site.h >= 44, B.near.h >= 44];
    F.tap(...center(B.site)); ok.toggle = [F.sess.atSite === true]; F.tap(...center(B.site));
    F.tap(...center(B.practice)); ok.menu.push(F.sess.mode === 'practice' && !lab.m.menu && lab.m.docked);
    // 練習: 失敗は何度でも・ライフ不変・保存なし
    kill(); step(1); ok.pracFail = [lab.m.result === 'lose', lab.m.lifeLost === false, lab.m.failed === false, F.sess.lives === 3];
    lab.reset(); ok.pracRetry = [F.sess.mode === 'practice', lab.m.docked && !lab.m.result];
    const pw = run({ mode: 'practice' }); ok.pracWin = [pw.result === 'win', pw.final.practice === true, get() === null];
    // 練習の局面スキップ
    F.begin('practice', { atSite: true, nearDock: false }); ok.atSite = [lab.state === 'grounded', !lab.m.sampled, !lab.m.docked]; step(2.2); ok.atSite.push(lab.m.sampled === true);
    F.begin('practice', { atSite: false, nearDock: true }); ok.nearDock = [lab.m.sampled === true, lab.state === 'play', !lab.m.docked];
    const nw = run({ mode: 'practice', nearDock: true }); ok.nearDock.push(nw.result === 'win', get() === null);
    F.begin('practice', { atSite: false, nearDock: false });
    // ミッション勝利: 3 ライフ ×1.0
    const w1 = run({ mode: 'mission', ph0: -1.2 }), f1 = lab.m.final;
    ok.win3 = [w1.result === 'win', f1.lives === 3, f1.mult === 1, f1.score === A.score(f1.fuel, f1.grade, 3), f1.newStars[0] === true, JSON.parse(get()).score === f1.score, JSON.parse(get()).stars[0] === true];
    // ライフ喪失 → 自動で係留スタートへ → 勝利は ×0.8
    lab.reset(); kill(); ok.lose1 = [lab.m.lifeLost === true, F.sess.lives === 2, lab.m.result === 'lose']; step(F.LIFE_LOST_S + 0.1);
    ok.lose1.push(!lab.m.result && lab.m.docked && F.sess.lives === 2 && F.sess.mode === 'mission');
    // この回は手動で 3 ライフ前提を崩さずに勝つ
    const w2 = run({}), f2 = lab.m.final;
    ok.win2 = [w2.result === 'win', f2.lives === 2, Math.abs(f2.mult - 0.8) < 1e-9, f2.score === A.score(f2.fuel, f2.grade, 2), JSON.parse(get()).score === Math.max(f1.score, f2.score), f2.newStars[0] === false];
    // 0 ライフ → MISSION FAILED → RETRY MISSION（新しい3ライフ）→ MENU
    F.begin('mission'); kill(); step(F.LIFE_LOST_S + 0.1); kill(); step(F.LIFE_LOST_S + 0.1); kill(); step(1);
    ok.failed = [lab.m.failed === true, lab.m.lifeLost === false, F.sess.lives === 0, lab.m.result === 'lose'];
    F.tap(...center(B.res1).map((v, i) => (i ? v + 330 : v))); ok.failed.push(F.sess.mode === 'mission' && F.sess.lives === 3 && lab.m.docked && !lab.m.result);
    kill(); step(F.LIFE_LOST_S + 0.1); kill(); step(F.LIFE_LOST_S + 0.1); kill(); step(1);
    F.tap(...center(B.res2).map((v, i) => (i ? v + 330 : v))); ok.failed.push(F.sess.mode === 'menu' && lab.m.menu === true);
    // 永続化: ★の和集合・最高スコアは下がらない
    localStorage.setItem(K, JSON.stringify({ score: 99999, stars: [true, false, true] }));
    const w3 = run({ mode: 'mission', ph0: -1.2 }), f3 = lab.m.final, b3 = JSON.parse(get());
    ok.persist = [w3.result === 'win', b3.score === 99999, f3.newBest === false, b3.stars[0] && b3.stars[2], b3.stars[1] === f3.s2, f3.newStars[2] === false];
    localStorage.setItem(K, '{broken'); F.begin('menu'); ok.persist.push(lab.m.menu === true);   // 壊れた保存でも落ちない
    wipe(); Object.assign(F.sess, sv); F.begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // 通常クリア 5 本（ミッションモード、母船の開始位相を変える）
  const five = () => {
    const out = [-1.2, -2.6, 0, 1.4, 2.6].map((ph0) => { const r = run({ mode: 'mission', ph0 }); return r.result === 'win' && r.final.lives === 3; });
    localStorage.removeItem(window.__score.KEY_B); window.__flow.begin('menu'); lab.params.ph0 = -1.2;
    return { out, pass: out.every(Boolean) };
  };
  window.__auto = { makeCtl, run, bump, score, five };
}
