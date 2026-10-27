// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 流れ: docked(タップ待ち→解放→自動で漂う) → descent → sampling(着地して2s) → return → win。
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
    if (!opt.keepDocked) { for (let i = 0; i < 120; i++) lab.step(1 / 60); if (lab.m.docked) window.__flow.tap(180, 320); }   // 2s 待っても係留のまま → タップで解放
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
    if (lab.m.docked) window.__flow.tap(180, 320);
    const s = lab.ship, m = lab.m, sp = opt.speed || 60, ox = opt.ox || 0;
    s.x = m.mx + ox; s.y = 130 + (opt.dy || 60); s.vx = m.mvx + (opt.rvx || 0); s.vy = -sp; s.angle = 0; s.omega = 0;
    let minDy = 1e9, maxDy = -1e9;
    for (let i = 0; i < 180; i++) { lab.step(1 / 60); minDy = Math.min(minDy, s.y - 130); maxDy = Math.max(maxDy, s.y - 130); if (m.result) break; }
    return { bumps: m.bumps, result: m.result, reason: m.reason, state: lab.state, minDy: +minDy.toFixed(1), vy: +s.vy.toFixed(1) };
  };
  const offsite = () => {
    const F = window.__flow, out = []; F.begin('practice', { atSite: false, nearDock: false }); F.tap(180, 320);
    for (let i = 0; i < 70; i++) lab.step(1 / 60);   // 解放 → 操作可
    const s = lab.ship, m = lab.m, drop = (x) => { s.x = x; s.y = lab.terrainY(x) - 16 - 25; s.vx = 0; s.vy = 8; s.angle = 0; s.omega = 0; };
    drop(60); for (let i = 0; i < 240 && lab.state === 'play'; i++) lab.step(1 / 60);
    out.push(lab.state === 'grounded', !m.result, !m.sampled, lab.padAt(s.x) === null, lab.lastTouch && lab.lastTouch.kind === 'ground');
    for (let i = 0; i < 180; i++) lab.step(1 / 60); out.push(m.gauge === 0, !m.sampled, lab.state === 'grounded');   // 3 秒置いても採取されない
    lab.script = () => ({ main: true }); for (let i = 0; i < 20; i++) lab.step(1 / 60); lab.script = null;
    out.push(lab.state === 'play', s.vy < 0);                                                                       // 推力で離陸
    drop(325); for (let i = 0; i < 240 && lab.state === 'play'; i++) lab.step(1 / 60); out.push(lab.state === 'grounded', !m.result);   // もう一つの平地
    s.x = 60; lab.state = 'play'; drop(116); for (let i = 0; i < 240 && lab.state === 'play'; i++) lab.step(1 / 60);
    out.push(lab.state === 'crashed', m.result === 'lose', m.reason === 'STEEP GROUND');                              // 急な岩
    return out;
  };
  // メニュー → MISSION/PRACTICE、スコア式（ライフ倍率）、ライフ喪失 → MISSION FAILED、練習は保存しない、★和集合・最高スコア
  const score = () => {
    const A = window.__score, F = window.__flow, B = F.BTN, ok = {}, K = A.KEY_B;
    const KT = A.KEY_T, getT = () => localStorage.getItem(KT), get = () => localStorage.getItem(K), step = (sec) => { for (let i = 0; i < sec * 60; i++) lab.step(1 / 60); };
    const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
    const kill = () => { if (lab.m.docked) F.tap(180, 320); lab.step(1 / 60); lab.m.result || lab.crash('TEST', 'forced'); };   // 解放後に墜落させる
    const wipe = () => { localStorage.removeItem(K); localStorage.removeItem(KT); localStorage.removeItem('lander11.exp.sample_return.attempts'); };
    wipe(); const sv = { ...F.sess };
    // 式
    ok.formula = [A.mult(3) === 1, A.mult(2) === 0.8, A.mult(1) === 0.6, A.score(100, 'PERFECT', 3) === 2300, A.score(50, 'GOOD', 2) === Math.round(1600 * 0.8), A.score(0, null, 1) === 600,
      A.timeBonus(0) === 1500, A.timeBonus(30) === 1200, A.timeBonus(45.55) === 1045, A.timeBonus(150) === 0, A.timeBonus(400) === 0,
      A.score(100, 'PERFECT', 3, 30) === 3500, A.score(50, 'GOOD', 2, 60) === Math.round((1600 + 900) * 0.8)];
    // メニュー: ボタン 44px 以上、PRACTICE タップで練習へ、MENU で戻る
    F.begin('menu'); ok.menu = [lab.m.menu === true, B.practice.h >= 44, B.mission.h >= 44, B.site.h >= 44, B.near.h >= 44];
    F.tap(...center(B.site)); ok.toggle = [F.sess.atSite === true]; F.tap(...center(B.site));
    localStorage.removeItem(A.KEY_S); F.tap(...center(B.practice)); ok.menu.push(F.sess.mode === 'practice' && !lab.m.menu && lab.m.docked, F.sess.brief === 'start', lab.frozen === true); F.tap(180, 320); ok.menu.push(!F.sess.brief && lab.m.docked);
    // 係留: 待っても解放されない・ライフ不変。タップ/キーで解放
    step(5); ok.dock = [lab.m.docked === true, !lab.m.result, F.sess.lives === 3]; F.tap(180, 320); ok.dock.push(!lab.m.docked && lab.m.released === true && lab.ship.vy > 0);
    lab.reset(); step(1); const kd = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); }; kd(' '); ok.dock.push(!lab.m.docked); lab.reset(); kd('ArrowUp'); ok.dock.push(!lab.m.docked); lab.reset();
    // 練習: 失敗は何度でも・ライフ不変・保存なし
    kill(); step(1); ok.pracFail = [lab.m.result === 'lose', lab.m.lifeLost === false, lab.m.failed === false, F.sess.lives === 3];
    lab.reset(); ok.pracRetry = [F.sess.mode === 'practice', lab.m.docked && !lab.m.result];
    const pw = run({ mode: 'practice' }); ok.pracWin = [pw.result === 'win', pw.final.practice === true, get() === null, getT() === null, pw.final.newBestTime === false];
    // オフサイト着地: 平らな別地点 = grounded（失敗ではない・採取なし）→ 推力で離陸。急な岩 = STEEP GROUND
    ok.offsite = offsite();
    // 練習の局面スキップ
    F.begin('practice', { atSite: true, nearDock: false }); ok.atSite = [lab.state === 'grounded', !lab.m.sampled, !lab.m.docked]; step(2.2); ok.atSite.push(lab.m.sampled === true);
    F.begin('practice', { atSite: false, nearDock: true }); ok.nearDock = [lab.m.sampled === true, lab.state === 'play', !lab.m.docked];
    const nw = run({ mode: 'practice', nearDock: true }); ok.nearDock.push(nw.result === 'win', get() === null, getT() === null);
    F.begin('practice', { atSite: false, nearDock: false });
    // ミッション勝利: 3 ライフ ×1.0
    const w1 = run({ mode: 'mission', ph0: -1.2 }), f1 = lab.m.final;
    ok.win3 = [w1.result === 'win', f1.lives === 3, f1.mult === 1, f1.newStars[0] === true, JSON.parse(get()).score === f1.score, JSON.parse(get()).stars[0] === true,
      f1.tbonus === A.timeBonus(f1.t), f1.score === A.score(f1.fuel, f1.grade, 3, f1.t), f1.t > 5 && f1.t < 150, f1.newBestTime === true, Math.abs(parseFloat(getT()) - f1.t) < 1e-9];
    // ライフ喪失 → 自動で係留スタートへ → 勝利は ×0.8
    lab.reset(); step(1); F.tap(180, 320); step(3); const tLost = lab.m.flyT; kill(); ok.lose1 = [tLost > 2.9 && tLost < 3.2, lab.m.lifeLost === true, F.sess.lives === 2, lab.m.result === 'lose']; step(F.LIFE_LOST_S + 0.1);
    ok.lose1.push(!lab.m.result && lab.m.docked && F.sess.lives === 2 && F.sess.mode === 'mission' && lab.m.flyT === 0);
    // この回は手動で 3 ライフ前提を崩さずに勝つ
    const w2 = run({}), f2 = lab.m.final;
    ok.win2 = [w2.result === 'win', f2.lives === 2, Math.abs(f2.mult - 0.8) < 1e-9, f2.score === A.score(f2.fuel, f2.grade, 2, f2.t), f2.t < f1.t + 20, Math.abs(parseFloat(getT()) - Math.min(f1.t, f2.t)) < 1e-9, f2.newBestTime === (f2.t < f1.t), JSON.parse(get()).score === Math.max(f1.score, f2.score), f2.newStars[0] === false];
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
    // ベストタイム: 遅い記録では更新されない / 速い記録では更新される（最小値）。スコアとは別キー
    localStorage.setItem(KT, '1'); const w4 = run({ mode: 'mission', ph0: -1.2 }), f4 = lab.m.final;
    ok.bestTime = [w4.result === 'win', f4.newBestTime === false, parseFloat(getT()) === 1, f4.bestTime === 1];
    localStorage.setItem(KT, '9999'); const w5 = run({ mode: 'mission', ph0: -1.2 }), f5 = lab.m.final;
    ok.bestTime.push(f5.newBestTime === true, Math.abs(parseFloat(getT()) - f5.t) < 1e-9, JSON.parse(get()).score === 99999);
    localStorage.setItem(KT, 'junk'); F.begin('menu'); ok.bestTime.push(lab.m.menu === true);
    localStorage.setItem(K, '{broken'); F.begin('menu'); ok.persist.push(lab.m.menu === true);   // 壊れた保存でも落ちない
    // ブリーフィング: ? で再表示 / 選択直後に表示（凍結）/ タップで開始待ち / NEXT TIME SKIP は保存され次回から出ない
    const KS = A.KEY_S, hadS = localStorage.getItem(KS); localStorage.removeItem(KS);
    F.begin('menu'); F.tap(...center(B.help)); ok.brief = [F.sess.brief === 'view', lab.m.menu === true]; F.tap(...center(B.skip)); ok.brief.push(localStorage.getItem(KS) === '1', F.sess.brief === 'view'); F.tap(...center(B.skip)); ok.brief.push(!localStorage.getItem(KS)); F.tap(180, 320); ok.brief.push(!F.sess.brief && lab.m.menu === true);
    F.begin('menu'); F.tap(...center(B.mission)); ok.brief.push(F.sess.brief === 'start', lab.frozen === true, !lab.m.menu); step(2); ok.brief.push(lab.m.flyT === 0 && lab.m.docked && !lab.m.result); F.tap(180, 320); ok.brief.push(!F.sess.brief, F.sess.mode === 'mission', lab.m.docked === true);
    F.begin('menu'); F.tap(...center(B.practice)); F.tap(...center(B.skip)); ok.brief.push(localStorage.getItem(KS) === '1'); F.tap(180, 320);
    F.begin('menu'); F.tap(...center(B.mission)); ok.brief.push(!F.sess.brief && F.sess.mode === 'mission');   // skip 済みなら出ない
    if (hadS == null) localStorage.removeItem(KS); else localStorage.setItem(KS, hadS);
    wipe(); Object.assign(F.sess, sv); F.begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // 通常クリア 5 本（ミッションモード、母船の開始位相を変える）
  const five = () => {
    const out = [-1.2, -2.6, 0, 1.4, 2.6].map((ph0) => { const r = run({ mode: 'mission', ph0 }); return r.result === 'win' && r.final.lives === 3; });
    localStorage.removeItem(window.__score.KEY_B); localStorage.removeItem(window.__score.KEY_T); window.__flow.begin('menu'); lab.params.ph0 = -1.2;
    return { out, pass: out.every(Boolean) };
  };
  window.__auto = { makeCtl, run, bump, score, five };
}
