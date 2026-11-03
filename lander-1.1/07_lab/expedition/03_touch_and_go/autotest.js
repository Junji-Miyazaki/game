// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 流れ: waiting(タップで開始) → 岩より上の高さで目標の真上へ → 降下して touchV で接触 → 自動静止（操作なし）→ LIFT OFF で直立・全推力 → 線を越えて CLEAR → 真上へ去る演出 → 勝利。
// 注意: 姿勢と横速度は「理想的に」直接セットする（流れ・判定・燃料の確認用であって人間の腕前の保証ではない）。
// 接触（採取・跳ね返り・岩の押し返し）・離脱の制限時間は理想化せず本物の物理で動く。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function install(lab) {
  const T = window.__tag, TGT = T.TGT, GY = T.GY, F = () => window.__flow;
  const CRUISE_Y = GY - 150;
  const makeCtl = (opt = {}) => {
    const touchV = opt.touchV != null ? opt.touchV : 2, aimDx = opt.aimDx || 0, idle = !!opt.idleAfter;
    return (l) => {
      const s = l.ship, m = l.m, o = {};
      if (l.state === 'grounded') return { main: true };
      if (m.sampled) { if (idle || m.phase !== 'leave') return o; s.angle = 0; s.omega = 0; o.main = true; return o; }   // 離脱: 直立で全推力
      const tx = TGT.x + aimDx, dx = tx - s.x, alt = GY - (s.y + 16);
      const tvx = Math.abs(dx) < 8 ? clamp(0.5 * dx, -3, 3) : Math.sign(dx) * Math.min(14, Math.sqrt(2 * 2.2 * (Math.abs(dx) - 4)));
      s.vx += clamp(tvx - s.vx, -2.4 / 60, 2.4 / 60);
      let tvy;
      if (Math.abs(dx) > 3 || Math.abs(s.vx) > 0.6) tvy = clamp(0.8 * (CRUISE_Y - s.y), -10, 10);   // 横が合うまでは岩より上を巡航
      else tvy = Math.min(14, touchV + Math.sqrt(2 * 2.5 * Math.max(0, alt - 3)));                   // 制動曲線で降下、接触時に touchV
      s.omega = 0;
      if (s.vy > tvy + 0.3) { s.angle = 0; o.main = true; } else if (s.vy < tvy - 1.5 && alt > 20) { s.angle = 180; o.main = true; } else s.angle = 0;
      return o;
    };
  };
  const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) lab.step(1 / 60); };
  const run = (opt = {}) => {
    if (opt.mode) F().begin(opt.mode, opt); else lab.reset();
    const ctl = makeCtl(opt), log = []; let last = '';
    if (lab.m.waiting) { step(1); F().tap(180, 320); }
    for (let i = 0; i < 60 * 150; i++) {
      lab.script = ctl; lab.step(1 / 60);
      const m = lab.m, ph = m.result || m.phase || lab.state;
      if (ph !== last) { log.push(m.flyT.toFixed(1) + 's ' + ph + ' fuel' + Math.round(lab.fuelPct())); last = ph; }
      if (m.result && m.resultT > 1.5) break;
    }
    lab.script = null;
    const m = lab.m;
    return { result: m.result, final: m.final, reason: m.reason, touch: m.touch, t: m.flyT, bumps: m.bumps, log: log.join(' | ') };
  };
  // 物理: 採取（≤vtouch・傾き ≤20）/ 速すぎ・傾きすぎは跳ね返る（墜落ではない）/ 中心と PERFECT の判定 / 岩はそっとなら押し返し・速いと墜落 / 平地は接地 / 離脱の制限時間 / 失敗
  const physics = () => {
    const ok = {};
    const fresh = () => { F().begin('practice'); step(0.2); F().tap(180, 320); lab.script = () => ({}); };
    const place = (x, alt, vx, vy, angle = 0, omega = 0) => { lab.state = 'play'; lab.frozen = false; Object.assign(lab.ship, { x, y: lab.terrainY(x) - 16 - alt, vx, vy, angle, omega, fuel: 100 }); };
    const until = (fn, sec = 3) => { for (let i = 0; i < sec * 60 && !fn(); i++) lab.step(1 / 60); return fn(); };
    // 中心に 2 px/s・直立 → 採取（中心・PERFECT）、上向きに離れ始める
    fresh(); place(TGT.x, 1, 0, 2); until(() => lab.m.sampled);
    let t = lab.m.touch; ok.sample = [lab.m.sampled, t && t.center, t && t.perfect, lab.ship.vy < 0, !lab.m.result, lab.state === 'play'];
    // 採取後: 小さく弾んで自動で止まる（操作は効かない）→ LIFT OFF の合図で操作が戻る
    lab.script = () => ({ main: true }); step(0.2); ok.settle = [lab.m.phase === 'settle', lab.controlsEnabled === false, lab.ship.fuel === 100];
    let hmax = 0; for (let i = 0; i < 60 * T.SETTLE.s && lab.m.phase === 'settle'; i++) { lab.step(1 / 60); hmax = Math.max(hmax, GY - (lab.ship.y + 16)); }
    lab.script = () => ({}); step(0.05);
    ok.settle.push(lab.m.phase === 'leave', lab.controlsEnabled === true, Math.hypot(lab.ship.vx, lab.ship.vy) < 0.6, hmax > 3 && hmax < 20, Math.abs(lab.ship.angle) < 3, lab.m.leaveT < 0.1);
    const y0 = lab.ship.y; step(2); ok.settle.push(Math.abs(lab.ship.y - y0) < 1.5, !lab.m.result);   // 何もしなければその場にほぼ留まる
    // 7.5 px/s・中心から 12 px → 採取（中心でない・PERFECT でない）
    fresh(); place(TGT.x + 12, 1, 0, 7.5); until(() => lab.m.sampled); t = lab.m.touch; ok.sample.push(lab.m.sampled && !t.center && !t.perfect);
    // 斜めの 6 px/s（横 4・縦 4.5）も合成速度で判定 → 採取
    fresh(); place(TGT.x, 1, 4, 4.5); until(() => lab.m.sampled); ok.sample.push(lab.m.sampled === true);
    // 3 px/s でも傾き 8° → PERFECT ではない
    fresh(); place(TGT.x, 1, 0, 2.5, 8); until(() => lab.m.sampled); ok.sample.push(lab.m.sampled && !lab.m.touch.perfect);
    // 速すぎ（12 px/s）→ 採取なし・跳ね返る・墜落でない
    fresh(); place(TGT.x, 1, 0, 12); until(() => lab.m.bumps > 0); ok.fast = [!lab.m.sampled, lab.ship.vy < 0, !lab.m.result, lab.m.noSampleT > 0]; step(1); ok.fast.push(!lab.m.result);
    // 傾き 25°・低速 → 採取なし・跳ね返る
    fresh(); place(TGT.x, 1, 0, 3, 25); until(() => lab.m.bumps > 0); ok.tilt = [!lab.m.sampled, !lab.m.result, lab.ship.vy < 0];
    // 非常に速い（50 px/s）→ 墜落
    fresh(); place(TGT.x, 3, 0, 50); until(() => lab.m.result); ok.tilt.push(lab.m.result === 'lose' && lab.m.reason === 'HARD IMPACT');
    // 岩: 大岩の左斜面へ右向き 5 px/s → 押し返される（墜落しない）。15 px/s → 墜落
    const R = T.ROCKS[3], rx = R.x - R.r * 0.75;
    fresh(); Object.assign(lab.ship, { x: rx - 6, y: lab.terrainY(rx) - 16 - 2, vx: 5, vy: 0, angle: 0, omega: 0 }); lab.state = 'play';
    until(() => lab.m.bumps > 0, 4); ok.rock = [lab.m.bumps > 0, !lab.m.result, lab.ship.vx < 0]; step(1.5); ok.rock.push(!lab.m.result);
    fresh(); Object.assign(lab.ship, { x: rx - 6, y: lab.terrainY(rx) - 16 - 2, vx: 15, vy: 0, angle: 0, omega: 0 }); lab.state = 'play';
    until(() => lab.m.result, 3); ok.rock.push(lab.m.result === 'lose');
    // 平地（目標外・傾斜 ≤5°）に 4 px/s → 接地（採取なし・失敗なし）→ 推力で離陸
    let fx = null; for (let x = 40; x < 340; x += 2) if (Math.abs(x - TGT.x) > TGT.r + 4 && T.footSlopeDeg(T.terrain, x) <= 5) { fx = x; break; }
    fresh(); place(fx, 1, 0, 4); until(() => lab.state === 'grounded'); ok.flat = [fx != null, lab.state === 'grounded', !lab.m.sampled, !lab.m.result];
    lab.script = () => ({ main: true }); step(0.4); lab.script = () => ({}); ok.flat.push(lab.state === 'play' && lab.ship.vy < 0);
    // 離脱: 採取後に何もしない → 制限時間で CAUGHT IN DEBRIS。全推力なら制限内に線を越えて勝利
    fresh(); place(TGT.x, 1, 0, 2); until(() => lab.m.sampled); step(T.SETTLE.s + lab.params.leave - 0.2); ok.leave = [!lab.m.result]; step(0.4);
    ok.leave.push(lab.m.result === 'lose', lab.m.reason === 'CAUGHT IN DEBRIS');
    fresh(); place(TGT.x, 1, 0, 2); until(() => lab.m.sampled); lab.script = (l) => { l.ship.angle = 0; l.ship.omega = 0; return { main: true }; };
    until(() => lab.m.phase === 'away', 12); lab.script = () => ({});
    // 線を越えた: CLEAR（時間はここで止まる）→ 去る演出中は結果を出さない（機体は真上へ）→ 画面の外へ消えてから勝利
    const t1 = lab.m.flyT, x1 = lab.ship.x, y1 = lab.ship.y; ok.away = [lab.m.phase === 'away', !lab.m.result, !!lab.m.final, lab.controlsEnabled === false]; step(1);
    ok.away.push(lab.m.flyT === t1, !lab.m.result, lab.state === 'play', lab.ship.y < y1 - 60, Math.abs(lab.ship.x - x1) < 12, Math.abs(lab.ship.angle) < 1); until(() => lab.hideShip, 3);
    ok.away.push(lab.hideShip === true, !lab.m.result, lab.ship.y < -40); until(() => lab.m.result, T.AWAY.s + 0.5);
    ok.away.push(lab.m.result === 'win', lab.m.final.t === t1);
    ok.leave.push(lab.m.result === 'win', lab.m.final && lab.m.final.leaveT < lab.params.leave - 1.5, lab.m.final && lab.m.final.s2 && lab.m.final.s3);
    // 失敗: 画面外 / 燃料 0 のまま 2 秒
    fresh(); Object.assign(lab.ship, { x: 100, y: -40, vx: 0, vy: -5 }); step(0.2); ok.fail = [lab.m.reason === 'LEFT THE AREA'];
    fresh(); lab.ship.fuel = 0; step(1.5); ok.fail.push(!lab.m.result); step(1); ok.fail.push(lab.m.reason === 'STRANDED');
    lab.script = null; F().begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // メニュー〜ライフ〜スコア〜永続化〜R キー〜ブリーフィング（#2 と同じ検査）
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
    step(4); ok.wait = [lab.m.waiting === true, lab.m.flyT === 0, !lab.m.result, lab.frozen === true]; Fw.tap(180, 320); ok.wait.push(lab.controlsEnabled === true); step(1); ok.wait.push(!lab.m.waiting, lab.m.flyT > 0.9, lab.ship.y > T.ENTRY.y + 10, lab.ship.x > T.ENTRY.x + 4);   // 開始: すぐ操作でき、右下へ流れる
    lab.reset(); kd(' '); ok.wait.push(!lab.m.waiting); lab.reset(); kd('ArrowUp'); ok.wait.push(!lab.m.waiting); lab.reset();
    kill(); step(1); ok.pracFail = [lab.m.result === 'lose', lab.m.lifeLost === false, lab.m.failed === false, Fw.sess.lives === 3];
    const pw = run({ mode: 'practice' }); ok.pracWin = [pw.result === 'win', pw.final.practice === true, get() === null, getT() === null];
    // ミッション勝利（ずらして速めに触る）: ★1 のみ
    const w1 = run({ mode: 'mission', touchV: 6, aimDx: 11 }), f1 = lab.m.final;
    ok.win1 = [w1.result === 'win', f1.lives === 3, f1.s2 === false, f1.s3 === false, f1.newStars[0] === true, JSON.parse(get()).score === f1.score, f1.score === Math.round((f1.base + f1.tbonus) * f1.mult), f1.base === 1000 + Math.round(f1.fuel) * 10 + 100, f1.newBestTime === true, Math.abs(parseFloat(getT()) - f1.t) < 1e-9];
    // 中心・PERFECT: ★2 ★3
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
  // 通常クリア（ミッション）: 接触速度と狙いのずれを変える
  const five = () => {
    const rows = [[2, 0], [6, 11], [4, -12], [2.5, 3], [7.5, 0], [5, -6]].map(([touchV, aimDx]) => {
      const r = run({ mode: 'mission', touchV, aimDx });
      return { touchV, aimDx, ok: r.result === 'win' && r.final.lives === 3, t: +r.t.toFixed(1), fuel: r.final && Math.round(r.final.fuel), sp: r.touch && +r.touch.sp.toFixed(1), dx: r.touch && +r.touch.dx.toFixed(1), s2: r.final && r.final.s2, s3: r.final && r.final.s3, leave: r.final && +r.final.leaveT.toFixed(1), why: r.result === 'win' ? '' : r.reason + ' / ' + r.log };
    });
    localStorage.removeItem(window.__score.KEY_B); localStorage.removeItem(window.__score.KEY_T); lab.script = null; F().begin('menu');
    return { rows, pass: rows.every((r) => r.ok) };
  };
  window.__auto = { makeCtl, run, physics, score, five };
}
