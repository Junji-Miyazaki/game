// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 流れ: waiting(タップで開始) → 塊より上の高さで目標の真上へ → くびれへ降下して touchV で接触 → 錨 → 演出 → 勝利。
// 注意: 姿勢と横速度は「理想的に」直接セットする（横の補正は最大 5 px/s² = 機体を倒して全推力と同程度）。人間の腕前の保証ではない。
// ガスの押し・接触（錨・跳ね返り・壁と岩の押し返し）は理想化せず本物の物理で動く。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function install(lab) {
  const T = window.__tag, TGT = T.TGT, GY = T.GY, F = () => window.__flow;
  const CRUISE_Y = GY - 160;
  const makeCtl = (opt = {}) => {
    const touchV = opt.touchV != null ? opt.touchV : 2, aimDx = opt.aimDx || 0, LAT = opt.lat != null ? opt.lat : 5;
    let bounced = 0;
    return (l) => {
      const s = l.ship, m = l.m, o = {};
      if (m.phase) return o;
      if (l.state === 'grounded') return { main: true };
      if (m.bounces > bounced) bounced = m.bounces;
      const tv = bounced && opt.touchV2 != null ? opt.touchV2 : touchV;
      const tx = TGT.x + aimDx, dx = tx - s.x, alt = GY - (s.y + 16);
      const tvx = Math.abs(dx) < 8 ? clamp(0.5 * dx, -3, 3) : Math.sign(dx) * Math.min(14, Math.sqrt(2 * 2.2 * (Math.abs(dx) - 4)));
      s.vx += clamp(tvx - s.vx, -LAT / 60, LAT / 60);
      let tvy;
      if (Math.abs(dx) > 3 || Math.abs(s.vx) > 0.6) tvy = clamp(0.8 * (CRUISE_Y - s.y), -10, 10);   // 横が合うまでは塊より上を巡航
      else tvy = Math.min(14, tv + Math.sqrt(2 * 2.5 * Math.max(0, alt - 3)));                       // 制動曲線で降下、接触時に tv
      s.omega = 0;
      if (s.vy > tvy + 0.3) { s.angle = 0; o.main = true; } else if (s.vy < tvy - 1.5 && alt > 20) { s.angle = 180; o.main = true; } else s.angle = 0;
      return o;
    };
  };
  const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) lab.step(1 / 60); };
  const run = (opt = {}) => {
    if (opt.mode) F().begin(opt.mode, opt); else lab.reset();
    const ctl = makeCtl(opt), log = []; let last = '';
    if (lab.m.waiting) { step(opt.wait || 1); F().tap(180, 320); }
    for (let i = 0; i < 60 * 150; i++) {
      lab.script = ctl; lab.step(1 / 60);
      const m = lab.m, ph = m.result || m.phase || lab.state;
      if (ph !== last) { log.push(m.flyT.toFixed(1) + 's ' + ph + ' fuel' + Math.round(lab.fuelPct())); last = ph; }
      if (m.result && m.resultT > 1.5) break;
    }
    lab.script = null;
    const m = lab.m;
    return { result: m.result, final: m.final, reason: m.reason, touch: m.touch, t: m.flyT, bounces: m.bounces, bumps: m.bumps, log: log.join(' | ') };
  };
  // 物理
  const physics = () => {
    const ok = {};
    const fresh = () => { F().begin('practice'); step(0.2); F().tap(180, 320); lab.script = () => ({}); lab.params.jet = 0; };
    const place = (x, alt, vx, vy, angle = 0, omega = 0) => { lab.state = 'play'; lab.frozen = false; Object.assign(lab.ship, { x, y: lab.terrainY(x) - 16 - alt, vx, vy, angle, omega, fuel: 100 }); };
    const until = (fn, sec = 3) => { for (let i = 0; i < sec * 60 && !fn(); i++) lab.step(1 / 60); return fn(); };
    const jet0 = lab.params.jet;
    // 目標に 2 px/s・直立 → 錨（★2 跳ね返りなし・★3 PERFECT）→ 時間が止まる → 演出の後に勝利
    fresh(); place(TGT.x, 1, 0, 2); until(() => lab.m.phase === 'anchor');
    let f = lab.m.final; const t1 = f && f.t;
    ok.anchor = [lab.m.phase === 'anchor', !!f && f.s2, !!f && f.s3, lab.controlsEnabled === false, !lab.m.result];
    step(1); ok.anchor.push(lab.m.flyT === t1, !lab.m.result, Math.abs(lab.ship.y - (GY - 16)) < 0.5); until(() => lab.m.result, T.ANCHOR_S + 0.5);
    ok.anchor.push(lab.m.result === 'win', lab.m.final.t === t1);
    // 9.5 px/s・中心から 14 px → 錨（PERFECT ではない）/ 斜めの合成速度 / 傾き 8° は PERFECT でない
    fresh(); place(TGT.x + 14, 1, 0, 9.5); until(() => lab.m.phase === 'anchor'); ok.anchor.push(lab.m.phase === 'anchor' && !lab.m.final.s3);
    fresh(); place(TGT.x, 1, 5, 6); until(() => lab.m.phase === 'anchor' || lab.m.bounces > 0); ok.anchor.push(lab.m.phase === 'anchor');
    fresh(); place(TGT.x, 1, 0, 2.5, 8); until(() => lab.m.phase === 'anchor'); ok.anchor.push(lab.m.phase === 'anchor' && !lab.m.final.s3);
    // 速すぎ（14 px/s）→ 錨なし・大きく跳ね返る・墜落でない。その後そっと触れて錨 → ★2 なし
    fresh(); place(TGT.x, 1, 0, 14); until(() => lab.m.bounces > 0);
    ok.bounce = [!lab.m.phase, lab.ship.vy < -7, !lab.m.result, lab.m.bounces === 1]; step(1); ok.bounce.push(!lab.m.result, lab.ship.y < GY - 16 - 5);
    place(TGT.x, 1, 0, 2); until(() => lab.m.phase === 'anchor'); ok.bounce.push(lab.m.phase === 'anchor' && lab.m.final.s2 === false && lab.m.final.bounces === 1);
    // 傾き 25°・低速 → 跳ね返る / 50 px/s → 墜落
    fresh(); place(TGT.x, 1, 0, 3, 25); until(() => lab.m.bounces > 0); ok.bounce.push(!lab.m.phase, !lab.m.result, lab.ship.vy < 0);
    fresh(); place(TGT.x, 3, 0, 50); until(() => lab.m.result); ok.bounce.push(lab.m.result === 'lose' && lab.m.reason === 'HARD IMPACT');
    // 壁: くびれの左の壁へ横から 5 px/s → 押し返される。14 px/s → 墜落
    const wallX = (() => { for (let x = TGT.x; x > 100; x--) if (lab.terrainY(x) < GY - 40) return x; return null; })(), wy = GY - 30;
    fresh(); Object.assign(lab.ship, { x: wallX + T.HULL + 6, y: wy, vx: -5, vy: 0, angle: 0, omega: 0 }); lab.state = 'play';
    until(() => lab.m.bumps > 0, 3); ok.wall = [wallX != null, lab.m.bumps > 0, !lab.m.result, lab.ship.vx > 0]; step(1); ok.wall.push(!lab.m.result);
    fresh(); Object.assign(lab.ship, { x: wallX + T.HULL + 6, y: wy, vx: -14, vy: 0, angle: 0, omega: 0 }); lab.state = 'play';
    until(() => lab.m.result, 3); ok.wall.push(lab.m.result === 'lose', lab.m.reason === 'HIT THE CLIFF');
    // ガス: 前触れの間は押さない / 噴出中は噴流の中だけ横に押す（向きは噴出口から外へ）/ 噴流の外は押さない / 強さ 0 なら押さない
    const J = T.JETS[0], at = (tt) => T.jetAt(J, tt);
    let tTele = null, tFull = null; for (let tt = 0; tt < 30; tt += 0.01) { const a = at(tt); if (tTele == null && a.tele > 0.5) tTele = tt; if (tFull == null && a.env === 1) { tFull = tt; break; } }
    ok.jet = [tTele != null && tFull != null && tFull > tTele, T.jetForce(J, J.x + 60, J.y, tTele, 5) === 0, T.jetForce(J, J.x + 60, J.y, tFull, 5) > 2, T.jetForce(J, J.x + 60, J.y + 60, tFull, 5) < 0.05, T.jetForce(J, J.x - 30, J.y, tFull, 5) === 0, T.jetForce(J, J.x + 60, J.y, tFull, 0) === 0];
    const J2 = T.JETS[1]; let t2 = null; for (let tt = 0; tt < 30; tt += 0.01) if (T.jetAt(J2, tt).env === 1) { t2 = tt; break; }
    ok.jet.push(T.jetForce(J2, J2.x - 60, J2.y, t2, 5) < -2);
    fresh(); lab.params.jet = jet0; lab.m.flyT = tFull - 0.05; Object.assign(lab.ship, { x: J.x + 50, y: J.y, vx: 0, vy: 0, angle: 0, omega: 0 }); step(0.5);
    ok.jet.push(lab.ship.vx > 1, !lab.m.result);
    // 失敗: 画面外 / 燃料 0 のまま 2 秒
    fresh(); Object.assign(lab.ship, { x: 100, y: -40, vx: 0, vy: -5 }); step(0.2); ok.fail = [lab.m.reason === 'LEFT THE AREA'];
    fresh(); lab.ship.fuel = 0; lab.ship.y = 200; step(1.5); ok.fail.push(!lab.m.result); step(1); ok.fail.push(lab.m.reason === 'STRANDED');
    lab.params.jet = jet0; lab.script = null; F().begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // メニュー〜ライフ〜スコア〜永続化〜R キー〜ブリーフィング（#3 と同じ検査）
  const score = () => {
    const A = window.__score, Fw = F(), B = Fw.BTN, ok = {}, K = A.KEY_B, KT = A.KEY_T, sv = { ...Fw.sess };
    const getT = () => localStorage.getItem(KT), get = () => localStorage.getItem(K);
    const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
    const kill = () => { if (lab.m.waiting) Fw.tap(180, 320); lab.step(1 / 60); lab.m.result || lab.crash('TEST', 'forced'); };
    const wipe = () => { localStorage.removeItem(K); localStorage.removeItem(KT); };
    const kd = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
    wipe();
    ok.formula = [A.mult(3) === 1, A.mult(2) === 0.8, A.mult(1) === 0.6, A.timeBonus(0) === 1500, A.timeBonus(30) === 1200, A.timeBonus(150) === 0];
    Fw.begin('menu'); ok.menu = [lab.m.menu === true, B.practice.h >= 44, B.mission.h >= 44];
    localStorage.removeItem(A.KEY_S); Fw.tap(...center(B.practice)); ok.menu.push(Fw.sess.mode === 'practice' && lab.m.waiting === true, Fw.sess.brief === 'start'); Fw.tap(180, 320); ok.menu.push(!Fw.sess.brief && lab.m.waiting === true);
    step(4); ok.wait = [lab.m.waiting === true, lab.m.flyT === 0, !lab.m.result, lab.frozen === true]; Fw.tap(180, 320); ok.wait.push(lab.controlsEnabled === true); step(1); ok.wait.push(!lab.m.waiting, lab.m.flyT > 0.9, lab.ship.y > T.ENTRY.y + 8, lab.ship.x < T.ENTRY.x - 4);   // 開始: すぐ操作でき、左下へ流れる
    lab.reset(); kd(' '); ok.wait.push(!lab.m.waiting); lab.reset(); kd('ArrowUp'); ok.wait.push(!lab.m.waiting); lab.reset();
    kill(); step(1); ok.pracFail = [lab.m.result === 'lose', lab.m.lifeLost === false, lab.m.failed === false, Fw.sess.lives === 3];
    const pw = run({ mode: 'practice' }); ok.pracWin = [pw.result === 'win', pw.final.practice === true, get() === null, getT() === null];
    // ミッション勝利（一度跳ね返ってから錨）: ★1 のみ
    const w1 = run({ mode: 'mission', touchV: 14, touchV2: 6 }), f1 = lab.m.final;
    ok.win1 = [w1.result === 'win', f1.lives === 3, f1.s2 === false, f1.s3 === false, f1.newStars[0] === true, JSON.parse(get()).score === f1.score, f1.score === Math.round((f1.base + f1.tbonus) * f1.mult), f1.base === 1000 + Math.round(f1.fuel) * 10 + 100, f1.newBestTime === true, Math.abs(parseFloat(getT()) - f1.t) < 1e-9];
    // 一発・PERFECT: ★2 ★3
    const w3 = run({ mode: 'mission', touchV: 2 }), f3 = lab.m.final;
    ok.win3 = [w3.result === 'win', f3.s2 === true, f3.s3 === true, f3.newStars[1] && f3.newStars[2], JSON.parse(get()).stars.every(Boolean), f3.base === 1000 + Math.round(f3.fuel) * 10 + 300];
    // ライフ喪失 → 自動で開始待ち → 勝利は ×0.8
    lab.reset(); step(1); Fw.tap(180, 320); step(3); kill(); ok.lose1 = [lab.m.lifeLost === true, Fw.sess.lives === 2]; step(Fw.LIFE_LOST_S + 0.1);
    ok.lose1.push(!lab.m.result && lab.m.waiting && Fw.sess.lives === 2 && lab.m.flyT === 0);
    const w2 = run({}), f2 = lab.m.final; ok.win2 = [w2.result === 'win', f2.lives === 2, Math.abs(f2.mult - 0.8) < 1e-9, f2.score === Math.round((f2.base + f2.tbonus) * 0.8)];
    // 0 ライフ → MISSION FAILED → RETRY MISSION / MENU
    Fw.begin('mission'); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(1);
    ok.failed = [lab.m.failed === true, Fw.sess.lives === 0];
    Fw.tap(...center(B.res1).map((v, i) => (i ? v + 330 : v))); ok.failed.push(Fw.sess.lives === 3 && lab.m.waiting && !lab.m.result);
    kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(1);
    Fw.tap(...center(B.res2).map((v, i) => (i ? v + 330 : v))); ok.failed.push(Fw.sess.mode === 'menu' && lab.m.menu === true);
    // R: 開始後のミッション中はライフ -1、開始前は無料
    Fw.begin('mission'); kd('r'); ok.rkey = [Fw.sess.lives === 3 && lab.m.waiting]; Fw.tap(180, 320); step(0.5); kd('r'); ok.rkey.push(Fw.sess.lives === 2 && lab.m.result === 'lose');
    // 永続化
    localStorage.setItem(K, JSON.stringify({ score: 99999, stars: [true, false, false] })); localStorage.setItem(KT, '1');
    const w4 = run({ mode: 'mission', touchV: 2 }), b4 = JSON.parse(get()), f4 = lab.m.final;
    ok.persist = [w4.result === 'win', b4.score === 99999, f4.newBest === false, b4.stars.every(Boolean), f4.newBestTime === false, parseFloat(getT()) === 1];
    localStorage.setItem(KT, 'junk'); localStorage.setItem(K, '{broken'); Fw.begin('menu'); ok.persist.push(lab.m.menu === true);
    wipe(); Object.assign(Fw.sess, sv);
    // ブリーフィング
    const KS = A.KEY_S, hadS = localStorage.getItem(KS); localStorage.removeItem(KS);
    Fw.begin('menu'); Fw.tap(...center(B.help)); ok.brief = [Fw.sess.brief === 'view']; Fw.tap(180, 320); ok.brief.push(!Fw.sess.brief && lab.m.menu === true);
    Fw.tap(...center(B.mission)); ok.brief.push(Fw.sess.brief === 'start', lab.frozen === true); step(2); ok.brief.push(lab.m.flyT === 0); Fw.tap(180, 320); ok.brief.push(!Fw.sess.brief && lab.m.waiting === true);
    if (hadS == null) localStorage.removeItem(KS); else localStorage.setItem(KS, hadS); Fw.begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // 通常クリア（ミッション）: 接触速度・狙いのずれを変える（ガスの時刻は開始からなので全回同じ。降り方の違いで当たり方が変わる）
  const five = () => {
    const rows = [[2, 0], [6, 10], [4, -12], [2.5, 4], [9, 0], [5, -6]].map(([touchV, aimDx]) => {
      const r = run({ mode: 'mission', touchV, aimDx });
      return { touchV, aimDx, ok: r.result === 'win' && r.final.lives === 3, t: +r.t.toFixed(1), fuel: r.final && Math.round(r.final.fuel), sp: r.touch && +r.touch.sp.toFixed(1), dx: r.touch && +r.touch.dx.toFixed(1), s2: r.final && r.final.s2, s3: r.final && r.final.s3, bumps: r.bumps, why: r.result === 'win' ? '' : r.reason + ' / ' + r.log };
    });
    localStorage.removeItem(window.__score.KEY_B); localStorage.removeItem(window.__score.KEY_T); lab.script = null; F().begin('menu');
    return { rows, pass: rows.every((r) => r.ok) };
  };
  window.__auto = { makeCtl, run, physics, score, five };
}
