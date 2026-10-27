// テスト専用（?test=1 のときだけ mission.js が読み込む）。window.__auto に検証用の自動操縦を置く。
// 流れ: waiting(タップで開始) → 噴気の頂上の試料へ（want 個）→ パッドへ → 着地。
// 注意: 姿勢と横速度は「理想的に」直接セットする（実機の回転は遅いので、流れ・判定・燃料の確認用であって人間の腕前の保証ではない）。
// 噴気の力・衝突・試料の判定・パッドのロックは理想化せず本物の物理で動く。
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function install(lab) {
  const G = window.__geyser, V = G.VENTS, PAD = G.PAD, F = () => window.__flow;
  const CRUISE_Y = V[1].y - G.HP() * 0.86;   // 試料の高さ（噴気の頂上付近）を巡航する
  const makeCtl = (opt = {}) => {
    const want = opt.want || 1, order = opt.order || (want >= 3 ? [0, 1, 2] : [1]);
    let ti = 0, phase = 'go';   // go（試料へ）→ pad（パッド上空へ）→ land
    return (l) => {
      const s = l.ship, m = l.m, o = {};
      if (l.state === 'grounded') return { main: true };   // 接地したら離陸（試料なしでパッドに降りた場合も）
      const vt = (ty, vmax) => {   // 鉛直: 上/下向き噴射の向きは理想（angle を 0/180 に直接セット）
        const tvy = clamp(0.8 * (ty - s.y), -vmax, vmax);
        s.omega = 0;
        if (s.vy > tvy + 1.5) { s.angle = 0; o.main = true; } else if (s.vy < tvy - 1.5) { s.angle = 180; o.main = true; } else s.angle = 0;   // 不感帯つき（燃料節約。重力が小さいので惰性で漂ってよい）
      };
      const hx = (tx, vmax = 14) => {   // 横: 目標へ 2.4px/s² で寄せる制動曲線（理想化）
        const dx = tx - s.x, tvx = Math.abs(dx) < 8 ? clamp(0.5 * dx, -3, 3) : Math.sign(dx) * Math.min(vmax, Math.sqrt(2 * 2.2 * (Math.abs(dx) - 4)));
        s.vx += clamp(tvx - s.vx, -2.4 / 60, 2.4 / 60);
      };
      if (phase !== 'pad' && phase !== 'land' && ti >= order.length) phase = 'pad';
      if (phase === 'go') {   // 噴気の頂上の高さ（試料の高さ）を保って横に滑る。燃料節約: 上下の往復をしない
        const i = order[ti], v = V[i];
        hx(v.x); vt(CRUISE_Y, 10);
        if (m.got[i]) ti++;
        return o;
      }
      if (phase === 'pad') {
        const tx = PAD.x + PAD.w / 2; hx(tx); vt(CRUISE_Y, 10);
        if (Math.abs(s.x - tx) < 3 && Math.abs(s.vx) < 1.5) phase = 'land';
        return o;
      }
      // land: 制動曲線で降下（#1 と同じ）。着地直前は直立
      const tx = PAD.x + PAD.w / 2, alt = PAD.y - (s.y + 16);
      hx(tx, 6); s.omega = 0;
      const tvy = Math.min(16, 2 + Math.sqrt(2 * 3 * Math.max(0, alt)));
      if (s.vy > tvy) { s.angle = 0; o.main = true; } else if (s.vy < tvy - 1.2) { s.angle = 180; o.main = true; } else s.angle = 0;
      if (alt < 14) s.angle = 0;
      return o;
    };
  };
  const samplesOf = (m) => m.got.filter(Boolean).length;
  const step = (sec) => { for (let i = 0; i < Math.round(sec * 60); i++) lab.step(1 / 60); };
  const run = (opt = {}) => {   // opt.mode 指定でメニュー経由と同じ begin()、なければ現状のモードで reset
    lab.params.ph0 = opt.ph0 != null ? opt.ph0 : 0;
    if (opt.mode) F().begin(opt.mode, opt); else lab.reset();
    const ctl = makeCtl(opt); const log = []; let last = '';
    if (lab.m.waiting) { step(1); F().tap(180, 320); }   // 開始待ち → タップで開始
    for (let i = 0; i < 60 * 200; i++) {
      lab.script = ctl; lab.step(1 / 60);
      const m = lab.m, ph = m.result || (lab.state === 'grounded' ? 'grounded' : samplesOf(m) + 'smp');
      if (ph !== last) { log.push(lab.t.toFixed(0) + 's ' + ph + ' fuel' + Math.round(lab.fuelPct())); last = ph; }
      if (m.result && m.resultT > 1.5) break;
    }
    lab.script = null;
    const m = lab.m;
    return { result: m.result, final: m.final, reason: m.reason, detail: m.detail, samples: samplesOf(m), t: m.flyT, log: log.join(' | ') };
  };
  // 物理の検査: 噴気の押し（9〜14 px/s² 近傍・高さで減衰）、口でのバウンス、接地中の噴出、パッドのロック、失敗3種
  const physics = () => {
    const ok = {}; F().begin('practice'); step(1); F().tap(180, 320); lab.script = () => ({});
    const v1 = V[1], T = (i, a) => { const m = lab.m; m.flyT = V[i].O + lab.params.ph0 + a; for (let k = 0; k < V.length; k++) m.vs[k] = G.ventAt(V[k], m.flyT, lab.params.ph0); };
    const place = (x, y, vx = 0, vy = 0) => { lab.state = 'play'; lab.frozen = false; Object.assign(lab.ship, { x, y, vx, vy, angle: 0, omega: 0, fuel: 100 }); lab.m.result = null; lab.m.strandT = 0; };
    const accelAt = (i, h, dx = 0, a = 0.9) => { T(i, a); place(V[i].x + dx, V[i].y - h); const vy0 = lab.ship.vy; const t0 = lab.m.flyT; lab.step(1 / 60); lab.m.flyT = t0; return -(lab.ship.vy - vy0) * 60 - lab.params.g; };
    let s = lab.ship, m = lab.m;
    // 押し: 口に近いほど強い（9〜14）、頂上近くで弱い（≈F_TOP）、柱の外は 0
    const nearV = [0, 1, 2].map((i) => accelAt(i, 24)), topV = accelAt(1, 0.86 * G.HP()), outV = accelAt(1, 24, 60);
    ok.push = [nearV.every((a) => a >= 9 && a <= 14), topV > 2 && topV < 6, outV < 0.2, accelAt(1, 120) < accelAt(1, 24)];
    // 前触れ: 噴出の 1.2 秒前から tele > 0、噴出前は力なし
    T(1, -0.6); ok.tele = [m.vs[1].tele > 0.4 && m.vs[1].a < 0, accelAt(1, 24, 0, -0.6) < 0.2];
    // 噴出の長さ: 約 3.2 秒で終わる（a<0）。周期 6〜9 秒
    ok.timing = [V.every((v) => v.P >= 6 && v.P <= 9), G.ventAt(V[1], V[1].O + 3.0, 0).a >= 0, G.ventAt(V[1], V[1].O + 3.4, 0).a < 0, Math.abs(G.ERUPT_S - 3.2) < 1e-9];
    // 噴出口に突っ込む: 墜落でなくバウンス
    T(1, 1.0); place(v1.x, v1.y - 16 - 4, 0, 22); lab.step(1 / 60); ok.bump = [lab.state === 'play', !m.result, s.vy < 0, m.bumpT > 0];
    step(0.5); ok.bump.push(!m.result && lab.state === 'play');
    // 接地中の噴出口が噴く: 持ち上げられる（墜落でも停止でもない）
    lab.reset(); step(1); F().tap(180, 320); lab.script = () => ({}); s = lab.ship; m = lab.m; T(0, -0.02); place(V[0].x, V[0].y - 16); lab.state = 'grounded'; step(0.3); ok.ground = [lab.state === 'play', s.vy < 0 || s.y < V[0].y - 20, !lab.m.result];
    // 試料: 噴出中だけ出現・取れる・同じ噴気の試料は1回だけ
    lab.reset(); step(1); F().tap(180, 320); lab.script = () => ({}); const m2 = lab.m, s2 = lab.ship;
    const sp = () => G.samplePos(1, lab.clock);
    m2.flyT = V[1].O - 0.5; s2.x = sp().x; s2.y = sp().y; s2.vx = s2.vy = 0; lab.frozen = true; lab.step(1 / 60); const before = m2.got[1];
    m2.flyT = V[1].O + 0.2; lab.step(1 / 60); const early = m2.got[1];   // 立ち上がり中（a < RISE）は未出現
    m2.flyT = V[1].O + 1.0; lab.step(1 / 60); const taken = m2.got[1]; const n1 = m2.got.filter(Boolean).length;
    m2.flyT = V[1].O + 1.2; lab.step(1 / 60); ok.sample = [before === false, early === false, taken === true, n1 === 1, m2.got.filter(Boolean).length === 1];
    // 3 つの噴気それぞれで1つずつ（最大3）
    for (const i of [0, 2]) { m2.flyT = V[i].O + 1.0; const p = G.samplePos(i, lab.clock); s2.x = p.x; s2.y = p.y; lab.step(1 / 60); }
    ok.sample.push(m2.got.every(Boolean));
    // パッドのロック: 試料 0 で着地 = grounded のみ（得点なし・失敗でもない）→ 推力で離陸。試料ありなら勝利
    lab.reset(); step(1); F().tap(180, 320); lab.script = null; const m3 = lab.m, s3 = lab.ship; lab.frozen = false; lab.controlsEnabled = true;
    Object.assign(s3, { x: PAD.x + PAD.w / 2, y: PAD.y - 16 - 25, vx: 0, vy: 8, angle: 0, omega: 0 }); lab.state = 'play';
    for (let i = 0; i < 300 && lab.state === 'play'; i++) lab.step(1 / 60);
    ok.lock = [lab.state === 'grounded', !m3.result, lab.lastTouch && lab.lastTouch.kind === 'pad', m3.lockedT > 0];
    lab.script = () => ({ main: true }); step(0.4); lab.script = null; ok.lock.push(lab.state === 'play' && s3.vy < 0);
    m3.got[1] = true; Object.assign(s3, { x: PAD.x + PAD.w / 2, y: PAD.y - 16 - 25, vx: 0, vy: 8, angle: 0, omega: 0 }); lab.state = 'play';
    for (let i = 0; i < 300 && lab.state === 'play' && !m3.result; i++) lab.step(1 / 60);
    ok.lock.push(m3.result === 'win', m3.final && m3.final.n === 1, m3.final.s2 === false);
    // 失敗: 地面への強い衝突 / 画面外 / 燃料 0 のまま 2 秒
    lab.reset(); step(1); F().tap(180, 320); lab.script = null; lab.frozen = false; Object.assign(lab.ship, { x: 100, y: lab.terrainY(100) - 30, vx: 0, vy: 60 }); lab.state = 'play'; step(0.5); ok.fail = [lab.m.result === 'lose', lab.m.reason === 'HARD IMPACT'];
    lab.reset(); step(1); F().tap(180, 320); lab.script = null; lab.frozen = false; Object.assign(lab.ship, { x: 100, y: -40, vx: 0, vy: -5 }); step(0.2); ok.fail.push(lab.m.reason === 'LEFT THE AREA');
    lab.reset(); step(1); F().tap(180, 320); lab.script = null; lab.ship.fuel = 0; step(1.5); ok.fail.push(!lab.m.result); step(1); ok.fail.push(lab.m.reason === 'STRANDED');
    lab.script = null; lab.params.ph0 = 0; F().begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' '), nearV, topV, outV };
  };
  // メニュー → MISSION/PRACTICE、スコア式（ライフ倍率・時間ボーナス）、ライフ喪失 → MISSION FAILED、練習は保存しない、★和集合・最高スコア・ベストタイム
  const score = () => {
    const A = window.__score, Fw = F(), B = Fw.BTN, ok = {}, K = A.KEY_B, KT = A.KEY_T, sv = { ...Fw.sess };
    const getT = () => localStorage.getItem(KT), get = () => localStorage.getItem(K);
    const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
    const kill = () => { if (lab.m.waiting) Fw.tap(180, 320); lab.step(1 / 60); lab.m.result || lab.crash('TEST', 'forced'); };
    const wipe = () => { localStorage.removeItem(K); localStorage.removeItem(KT); };
    wipe();
    ok.formula = [A.mult(3) === 1, A.mult(2) === 0.8, A.mult(1) === 0.6, A.timeBonus(0) === 1500, A.timeBonus(30) === 1200, A.timeBonus(45.55) === 1045, A.timeBonus(150) === 0, A.timeBonus(400) === 0];
    Fw.begin('menu'); ok.menu = [lab.m.menu === true, B.practice.h >= 44, B.mission.h >= 44];
    Fw.tap(...center(B.practice)); ok.menu.push(Fw.sess.mode === 'practice' && !lab.m.menu && lab.m.waiting === true);
    // 開始待ち: 待ってもタイマーは進まず何も失わない。タップで開始（キーでも開始）
    step(4); ok.wait = [lab.m.waiting === true, lab.m.flyT === 0, !lab.m.result, Fw.sess.lives === 3, lab.frozen === true]; Fw.tap(180, 320); step(1); ok.wait.push(!lab.m.waiting, lab.m.flyT > 0.9, lab.ship.y > 96);
    const kd = (k) => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); window.dispatchEvent(new KeyboardEvent('keyup', { key: k })); };
    lab.reset(); kd(' '); ok.wait.push(!lab.m.waiting); lab.reset(); kd('ArrowUp'); ok.wait.push(!lab.m.waiting); lab.reset();
    // 練習: 失敗は何度でも・ライフ不変・保存なし
    kill(); step(1); ok.pracFail = [lab.m.result === 'lose', lab.m.lifeLost === false, lab.m.failed === false, Fw.sess.lives === 3];
    lab.reset(); ok.pracRetry = [Fw.sess.mode === 'practice', lab.m.waiting && !lab.m.result];
    const pw = run({ mode: 'practice', want: 1 }); ok.pracWin = [pw.result === 'win', pw.final.practice === true, get() === null, getT() === null, pw.final.newBestTime === false];
    // ミッション勝利（試料1）: ★1 のみ（★2 なし）
    const w1 = run({ mode: 'mission', ph0: 0, want: 1 }), f1 = lab.m.final;
    ok.win1 = [w1.result === 'win', f1.lives === 3, f1.mult === 1, f1.n >= 1, f1.newStars[0] === true, f1.s2 === (f1.n >= 3), JSON.parse(get()).score === f1.score, f1.tbonus === A.timeBonus(f1.t), f1.score === Math.round((f1.base + f1.tbonus) * f1.mult), f1.t > 5 && f1.t < 150, f1.newBestTime === true, Math.abs(parseFloat(getT()) - f1.t) < 1e-9];
    // 3 試料: ★2
    const w3 = run({ mode: 'mission', ph0: 0, want: 3 }), f3 = lab.m.final;
    ok.win3 = [w3.result === 'win', f3.n === 3, f3.s2 === true, f3.newStars[1] === true, JSON.parse(get()).stars[1] === true, f3.s3 === (f3.grade === 'PERFECT'), f3.base === 1000 + Math.round(f3.fuel) * 10 + (f3.grade === 'PERFECT' ? 300 : 100)];
    // ライフ喪失 → 自動で開始待ちへ → 勝利は ×0.8
    lab.reset(); step(1); Fw.tap(180, 320); step(3); const tLost = lab.m.flyT; kill(); ok.lose1 = [tLost > 2.9 && tLost < 3.2, lab.m.lifeLost === true, Fw.sess.lives === 2, lab.m.result === 'lose']; step(Fw.LIFE_LOST_S + 0.1);
    ok.lose1.push(!lab.m.result && lab.m.waiting && Fw.sess.lives === 2 && Fw.sess.mode === 'mission' && lab.m.flyT === 0);
    const w2 = run({ want: 1 }), f2 = lab.m.final;
    ok.win2 = [w2.result === 'win', f2.lives === 2, Math.abs(f2.mult - 0.8) < 1e-9, f2.score === Math.round((f2.base + f2.tbonus) * 0.8), JSON.parse(get()).score === Math.max(f1.score, f3.score, f2.score), f2.newStars[0] === false];
    // 0 ライフ → MISSION FAILED → RETRY MISSION → MENU
    Fw.begin('mission'); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(1);
    ok.failed = [lab.m.failed === true, lab.m.lifeLost === false, Fw.sess.lives === 0, lab.m.result === 'lose'];
    Fw.tap(...center(B.res1).map((v, i) => (i ? v + 330 : v))); ok.failed.push(Fw.sess.mode === 'mission' && Fw.sess.lives === 3 && lab.m.waiting && !lab.m.result);
    kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(Fw.LIFE_LOST_S + 0.1); kill(); step(1);
    Fw.tap(...center(B.res2).map((v, i) => (i ? v + 330 : v))); ok.failed.push(Fw.sess.mode === 'menu' && lab.m.menu === true);
    // R: 開始後のミッション中は無料リトライにならない（ライフ -1）。開始前の R は無料
    Fw.begin('mission'); kd('r'); ok.rkey = [Fw.sess.lives === 3 && lab.m.waiting]; Fw.tap(180, 320); step(0.5); kd('r'); ok.rkey.push(Fw.sess.lives === 2 && lab.m.result === 'lose');
    // 永続化: ★の和集合・最高スコアは下がらない / ベストタイムは最小値 / 壊れた保存でも落ちない
    localStorage.setItem(K, JSON.stringify({ score: 99999, stars: [true, false, true] })); localStorage.setItem(KT, '1');
    const w4 = run({ mode: 'mission', ph0: 0, want: 3 }), f4 = lab.m.final, b4 = JSON.parse(get());
    ok.persist = [w4.result === 'win', b4.score === 99999, f4.newBest === false, b4.stars[0] && b4.stars[2], b4.stars[1] === true, f4.newStars[2] === false, f4.newBestTime === false, parseFloat(getT()) === 1];
    localStorage.setItem(KT, '9999'); const w5 = run({ mode: 'mission', ph0: 0, want: 1 }), f5 = lab.m.final; ok.persist.push(f5.newBestTime === true, Math.abs(parseFloat(getT()) - f5.t) < 1e-9);
    localStorage.setItem(KT, 'junk'); localStorage.setItem(K, '{broken'); Fw.begin('menu'); ok.persist.push(lab.m.menu === true);
    wipe(); Object.assign(Fw.sess, sv); Fw.begin('menu');
    const flat = Object.entries(ok).map(([k, v]) => [k, v.every(Boolean), v.map((x) => (x ? 1 : 0)).join('')]);
    return { pass: flat.every((x) => x[1]), detail: flat.map((x) => x[0] + ':' + x[2]).join(' ') };
  };
  // 通常クリア 5 本（ミッション、噴気の位相を変える）: 1 試料 / 3 試料 を交互に。時間も報告
  const five = () => {
    const rows = [[0, 1], [1.7, 3], [3.4, 1], [5.1, 3], [6.8, 3], [2.2, 1]].map(([ph0, want]) => { const r = run({ mode: 'mission', ph0, want }); return { ph0, want, ok: r.result === 'win' && r.final.lives === 3 && r.samples >= want, t: +r.t.toFixed(1), n: r.samples, grade: r.final && r.final.grade, fuel: r.final && Math.round(r.final.fuel), why: r.result === 'win' ? '' : r.reason + ' / ' + r.log };
    });
    localStorage.removeItem(window.__score.KEY_B); localStorage.removeItem(window.__score.KEY_T); lab.script = null; lab.params.ph0 = 0; F().begin('menu');
    return { rows, pass: rows.every((r) => r.ok) };
  };
  window.__auto = { makeCtl, run, physics, score, five };
}
