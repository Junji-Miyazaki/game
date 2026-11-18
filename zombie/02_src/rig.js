'use strict';
// =====================================================================
// rig.js — 人型の描画（画像素材なし）
// 3D の骨格（頭・胴・腕2・脚2）を動かし、yaw（向き）と tilt（見下ろす角度）で投影して、
// 奥から順に「先細りのカプセル」と円で描く。造形テストとゲーム本体の両方が使う。
// =====================================================================
const Rig = (() => {
  const TAU = Math.PI * 2, HP = Math.PI / 2;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

  // 色を明るく(k>0)／暗く(k<0)。#rrggbb だけ受ける
  const shadeCache = {};
  function shade(hex, k) {
    const key = hex + k; let v = shadeCache[key]; if (v) return v;
    const n = parseInt(hex.slice(1), 16), t = k > 0 ? 255 : 0, a = Math.abs(k);
    const r = Math.round((n >> 16) + (t - (n >> 16)) * a), g = Math.round(((n >> 8) & 255) + (t - ((n >> 8) & 255)) * a), b = Math.round((n & 255) + (t - (n & 255)) * a);
    return (shadeCache[key] = `rgb(${r},${g},${b})`);
  }

  // -------------------------------------------------------------------
  // 体の型。f=+1 はカメラの方を向く（ゾンビ）、f=-1 は背を向ける（兵士）
  // outfit: tee | office | hoodie | dress | vest | tank   hairType: short | messy | long | bald
  // legStyle: torn（裾が破れて足首）| full | bare | shorts
  // -------------------------------------------------------------------
  const BASE_Z = {
    kind: 'z', f: 1, lean: 0.3, leanBob: 0.04, legA: 0.38, knee: 0.55, drag: 1, dragKnee: 1, asym: 0.25,
    legLen: 0.4, hipW: 0.1, spine: 0.5, shW: 0.19, torsoW: 0.25, headR: 0.125, headDrop: 0.25, headTilt: 0,
    wobble: 1, sway: 0.06, armSpread: 0.04, arms: [[1.65, 0.1], [1.6, 0.1]], cycle: 1.4, bulk: 1,
    skin: '#86a173', shirt: '#4b5d4a', pants: '#2f3340', hair: '#262a20', shoe: '#1b1914',
    outfit: 'tee', hairType: 'short', legStyle: 'torn', fat: false,
    armLen: 1, elbow: -0.18, jawK: 0.74, eye: '#ff3a2a',
    hem: false, ribs: false, stump: '', deadEye: '', scar: false, blot: [[-0.42, 0.42, 0.24], [0.5, -0.25, 0.17]],
    stains: [[0, 0.86, 0.045], [0.035, 0.7, 0.03], [-0.04, 0.76, 0.024]]
  };
  const ZV = [
    { hem: true, scar: true },                                                                  // 0 Tシャツ：両腕を前へ
    { drag: 0.3, dragKnee: 0.1, asym: 0.45, headTilt: 0.07, arms: [[1.7, 0.08], [0.2, 0.3]], sway: 0.1, cycle: 1.7,
      skin: '#7f9a78', shirt: '#b4b2a0', pants: '#2a2c33', hair: '#1c1a16', outfit: 'office', tie: '#5a1f24', legStyle: 'full', deadEye: 'L',
      stains: [[0.05, 0.6, 0.05], [0.09, 0.45, 0.03], [0.0, 0.82, 0.03]] },                      // 1 会社員：右脚を引きずる・右腕だらり
    { lean: 0.5, asym: 0.35, legA: 0.32, arms: [[1.85, 0.15], [1.4, 0.15]], headDrop: 0.45, headTilt: -0.05, cycle: 1.2,
      skin: '#93a383', shirt: '#3d4a5c', pants: '#2b2b33', outfit: 'hoodie', hairType: 'bald', legStyle: 'full' },   // 2 パーカー：前のめり
    { skin: '#9aab84', shirt: '#6a3a4a', pants: '#6a3a4a', arms: [[1.55, 0.12], [1.72, 0.1]], cycle: 1.5, hair: '#3a2a1a',
      outfit: 'dress', hairType: 'long', legStyle: 'bare', shoe: null, shW: 0.17, torsoW: 0.22, bulk: 0.9, deadEye: 'R', blot: [[0.4, 0.5, 0.2]] },         // 3 ワンピース・長い髪
    { drag: 0.4, dragKnee: 0.15, asym: 0.4, headTilt: -0.08, arms: [[0.25, 0.3], [1.68, 0.1]], sway: 0.09, cycle: 1.8,
      skin: '#8a9d6e', shirt: '#3e3e3e', pants: '#3a3328', outfit: 'vest', vest: '#c8742a', hairType: 'bald', legStyle: 'full', shoe: '#2a2018', stump: 'L', scar: true }, // 4 作業員（左腕は途中から無い）
    { lean: 0.45, asym: 0.3, arms: [[1.78, 0.12], [1.7, 0.12]], headDrop: 0.4, cycle: 1.3,
      skin: '#7c9482', shirt: '#8a8672', pants: '#252a30', hair: '#14161a', outfit: 'tank', hairType: 'messy', shoe: null, ribs: true, hem: true }, // 5 タンクトップ・裸足・あばらが見える
  ].map(o => Object.assign({}, BASE_Z, o));
  const FAT = Object.assign({}, BASE_Z, {
    fat: true, torsoW: 0.4, hipW: 0.15, legLen: 0.35, spine: 0.44, shW: 0.24, headR: 0.13, legA: 0.28, asym: 0.2, bulk: 1.3,
    sway: 0.1, armSpread: 0.2, arms: [[1.5, 0.1], [1.56, 0.1]], cycle: 1.9, lean: 0.22,
    skin: '#8fa27a', shirt: '#6b6a55', pants: '#3a3a40', hairType: 'bald', legStyle: 'shorts', shoe: null, hem: true, blot: [[-0.3, 0.5, 0.3], [0.45, 0.1, 0.22], [0.1, -0.5, 0.15]],
    stains: [[0, 0.9, 0.05], [0.06, 0.72, 0.035]]
  });
  const SOLDIER = {
    kind: 's', f: -1, lean: 0.12, leanBob: 0.02, legA: 0.48, knee: 0.7, drag: 1, dragKnee: 1, asym: 0,
    legLen: 0.44, hipW: 0.1, spine: 0.5, shW: 0.19, torsoW: 0.27, headR: 0.13, headDrop: 0.05, headTilt: 0, bulk: 1,
    wobble: 0, sway: 0.025, cycle: 0.62, suit: '#1c3048', armor: '#2f5878', glow: '#55f0ff'
  };
  // ランナー：細くて速い。腕を振って走る
  const RUNNER = Object.assign({}, BASE_Z, {
    lean: 0.5, leanBob: 0.06, legA: 0.8, knee: 1.1, asym: 0.05, cycle: 0.5, sway: 0.03, headDrop: -0.22, wobble: 0.4,
    arms: [[0.35, 0.95], [0.35, 0.95]], elbow: 1.05, armSpread: 0.1, torsoW: 0.21, shW: 0.17, bulk: 0.85,
    skin: '#9aaf8c', shirt: '#a63a2a', pants: '#22262e', hair: '#101216', outfit: 'tank', hairType: 'messy', legStyle: 'shorts', shoe: '#d8d8d0',
    stains: [[0, 0.86, 0.04]]
  });
  // 盾持ち：胴の前に板を構える。頭は出ている
  const SHIELD = Object.assign({}, BASE_Z, {
    lean: 0.2, asym: 0.15, cycle: 1.6, arms: [[1.15, 0.04], [1.6, 0.1]], shield: true,
    skin: '#7f9a8a', shirt: '#26324a', pants: '#1c2434', hair: '#15181c', outfit: 'vest', vest: '#1a2230', legStyle: 'full', shoe: '#101418',
    stains: [[0.02, 0.9, 0.035]]
  });
  // ボス：大きく、腕が長く、肩から骨が出ている。目は黄色
  const BOSS = Object.assign({}, BASE_Z, {
    boss: true, legLen: 0.36, hipW: 0.14, spine: 0.56, shW: 0.3, torsoW: 0.46, headR: 0.118, bulk: 1.55, armLen: 1.35, armSpread: 0.25,
    arms: [[1.2, 0.15], [1.3, 0.15]], lean: 0.42, cycle: 2.2, legA: 0.3, asym: 0.15, sway: 0.12, jawK: 0.92, eye: '#ffd23a',
    skin: '#8a7494', shirt: '#3a2a3a', pants: '#2a2630', outfit: 'tank', hairType: 'bald', legStyle: 'torn', shoe: null, ribs: true, scar: true,
    stains: [[0, 0.88, 0.07], [0.1, 0.66, 0.05], [-0.09, 0.72, 0.04]]
  });
  const TYPES = [...ZV, FAT, SOLDIER, RUNNER, SHIELD, BOSS];
  const T_FAT = 6, T_SOL = 7, T_RUN = 8, T_SHD = 9, T_BOSS = 10;

  // -------------------------------------------------------------------
  // 姿勢：p は 0..1 の周期。state = walk | claw（壁を叩く）| aim（構えて撃つ）
  // -------------------------------------------------------------------
  function pose(P, p, state) {
    const f = P.f;
    const q = p + P.asym * Math.sin(TAU * p) / TAU;   // 時間のゆがみ＝歩みの不ぞろい
    const s = Math.sin(TAU * q), c = Math.cos(TAU * q);
    let aL, aR, kL, kR, sway, lean;
    if (state === 'walk') {
      aL = P.legA * s; aR = -P.legA * P.drag * s;
      kL = P.knee * Math.max(0, c) + 0.06; kR = P.knee * P.dragKnee * Math.max(0, -c) + 0.06;
      sway = P.sway * Math.sin(TAU * q);
      lean = P.lean + P.leanBob * Math.sin(TAU * q * 2);
    } else {
      aL = 0.12; aR = -0.18; kL = 0.18; kR = 0.12;
      sway = P.sway * 0.6 * Math.sin(TAU * p);
      lean = P.lean + (state === 'claw' ? 0.12 + 0.06 * Math.sin(TAU * p * 2) : 0);
    }
    const L = P.legLen;
    const leg = (hip, a, k) => {
      const kn = add(hip, [0, -Math.cos(a) * L, f * Math.sin(a) * L]);
      const ft = add(kn, [0, -Math.cos(a - k) * L, f * Math.sin(a - k) * L]);
      return [kn, ft];
    };
    const pel = [sway * 0.5, 0, 0];
    const hipL = add(pel, [-P.hipW, 0, 0]), hipR = add(pel, [P.hipW, 0, 0]);
    const [knL, ftL] = leg(hipL, aL, kL), [knR, ftR] = leg(hipR, aR, kR);
    const chest = add(pel, [sway, Math.cos(lean) * P.spine, f * Math.sin(lean) * P.spine]);
    const hunch = P.kind === 'z' ? f * 0.04 : 0;
    const shL = add(chest, [-P.shW, -0.02, hunch]), shR = add(chest, [P.shW, -0.02, hunch]);
    const hl = lean * 0.5 + P.headDrop;
    const head = add(chest, [sway * 0.4 + P.headTilt + 0.025 * P.wobble * Math.sin(TAU * q * 2 + 1),
      Math.cos(hl) * 0.21, f * Math.sin(hl) * 0.21]);
    let elL, haL, elR, haR, gun = null;
    if (P.kind === 'z') {
      const arm = (sh, side, base, amp, ph) => {
        const phi = state === 'claw' ? 1.85 + 0.55 * Math.sin(TAU * p + ph) : base + amp * Math.sin(TAU * q + ph);
        const sp = side * P.armSpread;
        const u = 0.3 * P.armLen, v = 0.28 * P.armLen;
        const el = add(sh, [sp * 0.3, -Math.cos(phi) * u, f * Math.sin(phi) * u]);
        const p2 = state === 'claw' ? phi - 0.5 : phi + P.elbow;
        const ha = add(el, [sp * 0.15, -Math.cos(p2) * v, f * Math.sin(p2) * v]);
        return [el, ha];
      };
      [elL, haL] = arm(shL, -1, P.arms[0][0], P.arms[0][1], 0);
      [elR, haR] = arm(shR, 1, P.arms[1][0], P.arms[1][1], Math.PI * 0.9);
    } else {
      const rec = state === 'aim' ? 0.035 * Math.max(0, Math.sin(TAU * p * 3)) : 0;
      const gs = add(chest, [0.07, -0.15, f * (0.12 - rec)]);
      const dir = [0, 0.04, f];
      const ge = add(gs, mul(dir, 0.62));
      haR = add(gs, mul(dir, 0.04)); haL = add(gs, mul(dir, 0.34));
      const elbow = (sh, ha, side) => add(mix(sh, ha, 0.5), [side * 0.09, -0.09, 0]);
      elL = elbow(shL, haL, -1); elR = elbow(shR, haR, 1);
      gun = [gs, ge];
    }
    const up = [0, -Math.min(ftL[1], ftR[1]) + 0.045, 0];   // 低い方の足を地面へ
    const J = { pel, hipL, hipR, knL, ftL, knR, ftR, chest, shL, shR, head, elL, haL, elR, haR };
    for (const k in J) J[k] = add(J[k], up);
    J.gun = gun ? [add(gun[0], up), add(gun[1], up)] : null;
    J.mouth = state === 'claw' ? 0.6 + 0.4 * Math.sin(TAU * p * 2) : 0.35 + 0.25 * Math.sin(TAU * q);   // 口の開き 0..1
    return J;
  }

  // -------------------------------------------------------------------
  // 描画
  // -------------------------------------------------------------------
  function drawRig(g, P, p, S, ox, oy, yaw, tilt, state) {
    const J = pose(P, p, state);
    const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt);
    const pr = v => {
      const x = v[0] * cy + v[2] * sy, z = -v[0] * sy + v[2] * cy, y = v[1];
      return [ox + x * S, oy + (-y * ct + z * st) * S, z * ct + y * st];
    };
    const parts = [];
    // seg：先細りのカプセル（rA→rB は半径、m 単位）  dot：円  fx：その場で描く飾り
    const seg = (a, b, rA, rB, col, bias = 0) => { const A = pr(a), B = pr(b); parts.push({ t: 0, A, B, rA: rA * S, rB: rB * S, col, d: (A[2] + B[2]) * 0.5 + bias }); };
    const dot = (cc, r, col, bias = 0) => { const C = pr(cc); parts.push({ t: 1, C, r: r * S, col, d: C[2] + bias }); };
    const plate = (pts, col, bias = 0) => { const Q = pts.map(pr); parts.push({ t: 3, Q, col, d: Q.reduce((a, q) => a + q[2], 0) / Q.length + bias }); };
    const fx = (at, fn, bias = 0) => { parts.push({ t: 2, fn, d: pr(at)[2] + bias }); };
    const f = P.f, isZ = P.kind === 'z', B = P.bulk;
    const ol = isZ ? '#0b0e09' : 'rgba(85,240,255,0.9)';
    const olw = Math.max(0.8, S * 0.018);
    const fwd = (v, k) => add(v, [0, 0, f * k]);

    // 影
    g.fillStyle = 'rgba(0,0,0,0.42)';
    g.beginPath(); g.ellipse(ox, oy, 0.36 * S, Math.max(0.03, 0.36 * st) * S, 0, 0, TAU); g.fill();

    if (isZ) drawZombieParts(); else drawSoldierParts();

    function drawZombieParts() {
      const skin = P.skin, mid = mix(J.pel, J.chest, 0.5), front = P.torsoW * 0.5;
      // 脚
      const legCol = P.legStyle === 'bare' ? skin : P.pants;
      for (const [hp, kn, ft] of [[J.hipL, J.knL, J.ftL], [J.hipR, J.knR, J.ftR]]) {
        seg(hp, kn, 0.082 * B, 0.064 * B, legCol);
        if (P.legStyle === 'torn') { seg(kn, mix(kn, ft, 0.68), 0.064 * B, 0.056 * B, P.pants); seg(mix(kn, ft, 0.62), ft, 0.046, 0.038, skin); }
        else if (P.legStyle === 'full') seg(kn, ft, 0.062 * B, 0.05 * B, P.pants);
        else seg(kn, ft, 0.058 * B, 0.042 * B, skin);
        seg(ft, add(ft, [0, -0.015, f * 0.15]), 0.052, 0.04, P.shoe || skin);              // 足（つま先は前）
      }
      seg(J.hipL, J.hipR, 0.09 * B, 0.09 * B, P.outfit === 'dress' ? P.shirt : P.pants);
      if (P.outfit === 'dress') seg(add(J.pel, [0, 0.06, 0]), add(J.pel, [0, -0.28, 0]), 0.14, 0.21, P.shirt, 0.06);   // スカート
      // 胴（腹は細く胸は広い）
      const torsoCol = P.outfit === 'vest' ? P.vest : P.shirt;
      seg(add(J.pel, [0, 0.05, 0]), mix(J.pel, J.chest, 0.55), front * 0.84, front * 0.96, torsoCol);
      seg(mix(J.pel, J.chest, 0.45), add(J.chest, [0, -0.05, 0]), front * 0.98, front * 1.12, torsoCol);
      seg(J.shL, J.shR, 0.068 * B, 0.068 * B, P.outfit === 'vest' ? P.shirt : torsoCol);
      if (P.fat) { dot(fwd(mix(J.pel, J.chest, 0.3), 0.11), 0.19, skin); dot(fwd(mix(J.pel, J.chest, 0.52), 0.1), 0.2, P.shirt); }   // 服から出た腹
      if (P.outfit === 'vest' && !P.shield) seg(fwd(add(mid, [-front * 0.8, 0, 0]), front * 0.8), fwd(add(mid, [front * 0.8, 0, 0]), front * 0.8), 0.02, 0.02, '#e8e2a0', 0.03);
      if (P.outfit === 'office') seg(fwd(add(J.chest, [0, -0.07, 0]), front + 0.01), fwd(add(mix(J.pel, J.chest, 0.42), [0.03, 0, 0]), front + 0.02), 0.02, 0.032, P.tie, 0.04);
      // 血のしみ（口元から胸へ垂れた形）
      fx(fwd(mid, front + 0.02), () => {
        if (pr(fwd(J.chest, front))[2] <= pr(J.chest)[2]) return;                                   // 正面が見えるときだけ
        g.fillStyle = 'rgba(96,18,18,0.88)';
        for (const [sx, sf, sr] of P.stains) {
          const c = pr(fwd(add(mix(J.pel, J.chest, sf), [sx, 0, 0]), front * 0.96));
          g.beginPath(); g.ellipse(c[0], c[1], sr * S, sr * 1.7 * S, sx * 4, 0, TAU); g.fill();        // 縦に垂れた形・外線なし
        }
      }, 0.06);
      if (P.hem) fx(fwd(J.pel, front), () => {   // 破れた裾（ぎざぎざに垂れる）
        if (pr(fwd(J.pel, front))[2] <= pr(J.pel)[2]) return;
        const n = 5, w = front * 0.86;
        g.beginPath();
        for (let i = 0; i <= n; i++) {
          const x = -w + i * (2 * w / n), a = pr(fwd(add(J.pel, [x, 0.09, 0]), front * 0.8));
          i ? g.lineTo(a[0], a[1]) : g.moveTo(a[0], a[1]);
          if (i < n) { const t = pr(fwd(add(J.pel, [x + w / n * (0.7 + (i % 3) * 0.3), 0.02 - ((i * 7) % 3) * 0.035, 0]), front * 0.74)); g.lineTo(t[0], t[1]); }
        }
        g.closePath(); g.fillStyle = shade(torsoCol, -0.12); g.fill(); g.strokeStyle = ol; g.lineWidth = olw; g.stroke();
      }, 0.03);
      if (P.ribs) fx(fwd(mid, front + 0.02), () => {   // 裂けた脇腹からあばら
        if (pr(fwd(J.chest, front))[2] <= pr(J.chest)[2]) return;
        const c = pr(fwd(add(mix(J.pel, J.chest, 0.6), [front * 0.55, 0, 0]), front * 0.88));
        g.fillStyle = '#4a1010'; g.beginPath(); g.ellipse(c[0], c[1], 0.075 * S * B, 0.1 * S * B, 0.2, 0, TAU); g.fill();
        g.strokeStyle = '#d8d2b8'; g.lineWidth = Math.max(1, 0.016 * S); g.lineCap = 'round';
        for (let i = -1; i <= 1; i++) { g.beginPath(); g.arc(c[0] - 0.02 * S, c[1] + i * 0.045 * S * B, 0.055 * S * B, -0.9, 0.9); g.stroke(); }
      }, 0.07);
      if (P.shield) {   // 盾（上に のぞき窓）
        const c = fwd(add(mid, [-0.05, 0.02, 0]), front + 0.24);
        plate([[-0.27, 0.38, -0.05], [0.27, 0.38, -0.05], [0.27, -0.42, 0.05], [-0.27, -0.42, 0.05]].map(o => add(c, [o[0], o[1], f * o[2]])), '#3a4a66', 0.05);
        plate([[-0.2, 0.32, -0.04], [0.2, 0.32, -0.04], [0.2, 0.17, -0.02], [-0.2, 0.17, -0.02]].map(o => add(c, [o[0], o[1], f * (o[2] + 0.012)])), '#7fa6bd', 0.06);
      }
      if (P.boss) for (const sd of [-1, 1]) {   // 肩から突き出た骨
        const sh = sd < 0 ? J.shL : J.shR;
        seg(add(sh, [sd * 0.02, 0.04, 0]), add(sh, [sd * 0.17, 0.3, -f * 0.05]), 0.05, 0.008, '#d8d2b8', 0.01);
        seg(add(sh, [-sd * 0.09, 0.05, -f * 0.04]), add(sh, [-sd * 0.05, 0.25, -f * 0.12]), 0.04, 0.008, '#d8d2b8', 0.01);
      }
      // 腕
      const longSleeve = P.outfit === 'office' || P.outfit === 'hoodie' || P.outfit === 'vest';
      const bare = P.outfit === 'tank';
      for (const [sh, el, ha, tag] of [[J.shL, J.elL, J.haL, 'L'], [J.shR, J.elR, J.haR, 'R']]) {
        if (bare) seg(sh, el, 0.05 * B, 0.043 * B, skin);
        else if (longSleeve) seg(sh, el, 0.056 * B, 0.048 * B, P.shirt);
        else { seg(sh, mix(sh, el, 0.6), 0.058 * B, 0.054 * B, P.shirt); seg(mix(sh, el, 0.5), el, 0.047 * B, 0.043 * B, skin); }
        if (P.stump === tag) {   // ひじの先で千切れている：骨がのぞく
          const e2 = mix(el, ha, 0.4);
          seg(el, e2, 0.045 * B, 0.04 * B, skin); dot(e2, 0.042, '#5c1414', 0.005); dot(mix(el, ha, 0.47), 0.02, '#d8d2b8', 0.01);
          continue;
        }
        if (longSleeve) { seg(el, mix(el, ha, 0.8), 0.048 * B, 0.042 * B, P.shirt); seg(mix(el, ha, 0.72), ha, 0.036, 0.033, skin); }
        else seg(el, ha, 0.043 * B, 0.034 * B, skin);
        dot(ha, 0.046, skin);
        if (S > 34) fx(ha, () => {   // 指（かぎ爪）
          const a = pr(el), b = pr(ha), dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
          g.strokeStyle = ol; g.lineCap = 'round';
          for (let pass = 0; pass < 2; pass++) {
            g.lineWidth = (pass ? 0.02 : 0.02 + 0.036) * S; if (pass) g.strokeStyle = shade(skin, 0.08);
            for (const k of [-1.5, -0.5, 0.5, 1.5]) {
              const nx = -uy * k * 0.024 * S, ny = ux * k * 0.024 * S;
              g.beginPath(); g.moveTo(b[0] + nx, b[1] + ny);
              g.lineTo(b[0] + nx * 1.5 + ux * 0.06 * S, b[1] + ny * 1.5 + uy * 0.06 * S);
              g.lineTo(b[0] + nx * 1.3 + ux * 0.085 * S + 0.02 * S * uy, b[1] + ny * 1.3 + uy * 0.085 * S + 0.03 * S); g.stroke();
            }
          }
        }, 0.02);
      }
      // 首・頭（頭蓋＋あご）
      const R = P.headR, H = J.head;
      seg(J.chest, H, 0.045, 0.04, skin);
      if (P.outfit === 'hoodie') dot(add(H, [0, 0.02, -f * 0.05]), R * 1.16, P.shirt, -0.3);
      if (P.hairType !== 'bald') dot(add(H, [0, 0.045, -f * 0.04]), R * 0.96, P.hair, -0.3);
      if (P.hairType === 'long') {
        seg(add(H, [0, 0, -f * 0.08]), add(J.chest, [0, -0.12, -f * 0.13]), 0.105, 0.07, P.hair, -0.3);
        for (const sd of [-1, 1]) seg(add(H, [sd * R * 0.9, 0.02, 0]), add(J.chest, [sd * P.shW * 0.8, -0.08, f * 0.03]), 0.035, 0.022, P.hair, 0.02);
      }
      if (P.hairType === 'short') for (const o of [[-0.5, 0.62], [0, 0.72], [0.5, 0.62]]) dot(add(H, [o[0] * R, o[1] * R, f * R * 0.62]), R * 0.36, P.hair, 0.015);   // 生えぎわ
      for (const sd of [-1, 1]) dot(add(H, [sd * R * 0.96, -0.01, 0]), 0.03, skin);                 // 耳
      const jaw = add(H, [0, -R * 0.62, f * R * 0.3]);
      dot(H, R, skin); dot(jaw, R * P.jawK, skin);
      if (P.hairType === 'messy') for (const o of [[-0.07, 0.72, 0], [0.07, 0.7, 0], [-0.025, 0.86, -0.03], [0.03, 0.84, 0.03]])   // 逆立った髪の房
        seg(add(H, [o[0], R * o[1], f * o[2]]), add(H, [o[0] * 1.5, R * (o[1] + 0.34), f * o[2] * 1.4]), 0.026, 0.007, P.hair, 0.02);
      // 顔（正面が見えるときだけ）
      fx(fwd(H, R), () => {
        const hc = pr(H), nose = pr(fwd(H, R * 1.02));
        if (nose[2] <= hc[2]) return;
        const big = S > 60, u = R * S;
        const eye = sd => pr(add(H, [sd * R * 0.4, R * 0.1, f * R * 0.88]));
        const e1 = eye(-1), e2 = eye(1), ex = 0.27 * u;
        // 肌のしみ
        g.fillStyle = shade(skin, -0.32); g.globalAlpha *= 0.4;
        for (const [bx, by, br] of P.blot) { const c = pr(add(H, [bx * R, by * R, f * R * 0.8])); g.beginPath(); g.ellipse(c[0], c[1], br * u, br * u * 0.8, bx, 0, TAU); g.fill(); }
        g.globalAlpha /= 0.4;
        if (big) {   // こけた頬と眉の影
          g.fillStyle = shade(skin, -0.3); g.globalAlpha *= 0.55;
          for (const sd of [-1, 1]) { const c = pr(add(H, [sd * R * 0.56, -R * 0.36, f * R * 0.66])); g.beginPath(); g.ellipse(c[0], c[1], 0.17 * u, 0.3 * u, sd * 0.3, 0, TAU); g.fill(); }
          g.beginPath(); g.ellipse((e1[0] + e2[0]) / 2, (e1[1] + e2[1]) / 2 - ex * 0.9, 0.82 * u, 0.2 * u, 0, 0, TAU); g.fill();
          g.globalAlpha /= 0.55;
        }
        // 目：くぼみ → 白目 → 光る瞳（片目が白くにごった個体もいる）
        g.fillStyle = 'rgba(14,16,8,0.85)';
        g.beginPath(); g.ellipse(e1[0], e1[1], ex, ex * 0.85, 0, 0, TAU); g.ellipse(e2[0], e2[1], ex, ex * 0.85, 0, 0, TAU); g.fill();
        for (const [e, tag] of [[e1, 'L'], [e2, 'R']]) {
          const dead = P.deadEye === tag;
          if (big) { g.fillStyle = dead ? '#cfd3c4' : '#b9b48e'; g.beginPath(); g.ellipse(e[0], e[1] + ex * 0.08, ex * 0.72, ex * 0.52, 0, 0, TAU); g.fill(); }
          if (dead) continue;
          g.fillStyle = P.eye; g.shadowColor = P.eye; g.shadowBlur = Math.max(2, S * 0.07);
          g.beginPath(); g.arc(e[0], e[1] + ex * 0.08, Math.max(0.8, (big ? 0.11 : 0.13) * u), 0, TAU); g.fill(); g.shadowBlur = 0;
          if (big) { g.fillStyle = '#1a0606'; g.beginPath(); g.arc(e[0], e[1] + ex * 0.08, 0.035 * u, 0, TAU); g.fill(); }
        }
        if (big) {   // 眉（内側へ下がる）・鼻・傷あと
          g.strokeStyle = shade(skin, -0.6); g.lineWidth = 0.12 * u; g.lineCap = 'round';
          g.beginPath(); g.moveTo(e1[0] - ex * 1.25, e1[1] - ex * 1.3); g.lineTo(e1[0] + ex * 0.95, e1[1] - ex * 0.7);
          g.moveTo(e2[0] + ex * 1.25, e2[1] - ex * 1.3); g.lineTo(e2[0] - ex * 0.95, e2[1] - ex * 0.7); g.stroke();
          g.lineWidth = 0.05 * u; g.beginPath(); g.moveTo(nose[0], nose[1] - 0.18 * u); g.lineTo(nose[0] - 0.02 * u, nose[1] + 0.08 * u); g.stroke();
          g.fillStyle = shade(skin, -0.55);
          g.beginPath(); g.arc(nose[0] - 0.08 * u, nose[1] + 0.13 * u, 0.05 * u, 0, TAU); g.arc(nose[0] + 0.08 * u, nose[1] + 0.13 * u, 0.05 * u, 0, TAU); g.fill();
          if (P.scar) {
            const a = pr(add(H, [-R * 0.55, R * 0.72, f * R * 0.6])), b = pr(add(H, [R * 0.15, R * 0.42, f * R * 0.86]));
            g.strokeStyle = '#5c1414'; g.lineWidth = 0.05 * u; g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
            g.lineWidth = 0.025 * u; for (let i = 1; i < 4; i++) { const x = a[0] + (b[0] - a[0]) * i / 4, y = a[1] + (b[1] - a[1]) * i / 4; g.beginPath(); g.moveTo(x - 0.05 * u, y - 0.07 * u); g.lineTo(x + 0.05 * u, y + 0.07 * u); g.stroke(); }
          }
        }
        // 口：歯ぐき → 口の中 → 歯 → 垂れた血
        const m = pr(add(jaw, [0, -R * 0.05, f * R * 0.72])), mw = 0.42 * u, mh = (0.12 + 0.2 * J.mouth) * u;
        if (big) { g.fillStyle = '#5a2020'; g.beginPath(); g.ellipse(m[0], m[1], mw * 1.14, mh * 1.22, 0, 0, TAU); g.fill(); }
        g.fillStyle = '#140808'; g.beginPath(); g.ellipse(m[0], m[1], mw, mh, 0, 0, TAU); g.fill();
        if (big) {
          g.fillStyle = '#cfcaae';
          for (let i = -2; i <= 2; i++) { const tw = mw * (i % 2 ? 0.2 : 0.24); g.fillRect(m[0] + i * mw * 0.3 - tw / 2, m[1] - mh * 0.96, tw, mh * (i % 2 ? 0.42 : 0.56)); }
          for (let i = -1; i <= 1; i++) g.fillRect(m[0] + i * mw * 0.36 - mw * 0.1, m[1] + mh * 0.5, mw * 0.2, mh * 0.44);
        }
        g.fillStyle = '#5c1414';
        g.beginPath(); g.ellipse(m[0] + mw * 0.55, m[1] + mh * 0.9, mw * 0.28, mh * 0.9 + 0.1 * u, 0.2, 0, TAU); g.fill();
        if (big) { g.beginPath(); g.ellipse(m[0] - mw * 0.4, m[1] + mh * 1.1, mw * 0.12, mh * 0.5 + 0.06 * u, -0.1, 0, TAU); g.fill(); }
      }, 0.05);
    }

    function drawSoldierParts() {
      for (const [hp, kn, ft] of [[J.hipL, J.knL, J.ftL], [J.hipR, J.knR, J.ftR]]) {
        seg(hp, kn, 0.08, 0.064, P.suit); seg(kn, ft, 0.062, 0.05, P.suit);
        seg(ft, add(ft, [0, -0.015, f * 0.15]), 0.055, 0.045, '#0a121b');
      }
      seg(J.hipL, J.hipR, 0.09, 0.09, P.suit);
      const front = P.torsoW * 0.5;
      seg(add(J.pel, [0, 0.05, 0]), mix(J.pel, J.chest, 0.55), front * 0.86, front * 0.98, P.armor);
      seg(mix(J.pel, J.chest, 0.45), add(J.chest, [0, -0.05, 0]), front, front * 1.12, P.armor);
      seg(J.shL, J.shR, 0.075, 0.075, P.armor);
      // 背嚢（縦長）と灯り
      const b0 = add(mix(J.pel, J.chest, 0.82), [0, 0, -f * 0.16]), b1 = add(mix(J.pel, J.chest, 0.38), [0, 0, -f * 0.15]);
      seg(b0, b1, 0.1, 0.09, '#14243a');
      fx(add(b0, [0, 0, -f * 0.1]), () => {
        const led = pr(add(b0, [0, -0.02, -f * 0.1]));
        if (led[2] <= pr(b0)[2]) return;
        g.fillStyle = P.glow; g.shadowColor = P.glow; g.shadowBlur = Math.max(2, S * 0.1);
        g.fillRect(led[0] - 0.05 * S, led[1] - 0.012 * S, 0.1 * S, Math.max(1, 0.024 * S)); g.shadowBlur = 0;
      }, 0.02);
      for (const [sh, el, ha] of [[J.shL, J.elL, J.haL], [J.shR, J.elR, J.haR]]) {
        seg(sh, el, 0.055, 0.047, P.suit); seg(el, ha, 0.046, 0.04, P.suit); dot(ha, 0.048, '#0d1620');
      }
      seg(J.gun[0], J.gun[1], 0.03, 0.022, '#0a0e13');
      dot(J.gun[1], 0.022, P.glow);
      seg(J.chest, J.head, 0.045, 0.04, P.suit);
      dot(J.head, P.headR, '#22405f');
      fx(J.head, () => {
        const hc = pr(J.head), v1 = pr(add(J.head, [-0.07, 0, f * 0.1])), v2 = pr(add(J.head, [0.07, 0, f * 0.1]));
        g.strokeStyle = P.glow; g.shadowColor = P.glow; g.shadowBlur = Math.max(2, S * 0.08);
        g.lineWidth = Math.max(1, 0.035 * S); g.lineCap = 'round';
        g.beginPath();
        if (v1[2] > hc[2]) { g.moveTo(v1[0], v1[1]); g.lineTo(v2[0], v2[1]); }        // 正面：バイザー
        else { const b = pr(add(J.head, [0, 0.04, -f * 0.12])); g.moveTo(b[0], b[1] - 0.04 * S); g.lineTo(b[0], b[1] + 0.03 * S); } // 背面：ライン
        g.stroke(); g.shadowBlur = 0;
      }, 0.2);
    }

    // 奥から順に。大きい部品だけ左上が明るく右下が暗いグラデーションで立体に見せる
    parts.sort((a, b) => a.d - b.d);
    g.lineJoin = 'round';
    const paint = (cx, cyy, r, col) => {
      if (r < 2.6 || col[0] !== '#') return col;
      const gr = g.createLinearGradient(cx - r, cyy - r, cx + r, cyy + r);
      gr.addColorStop(0, shade(col, 0.2)); gr.addColorStop(0.5, col); gr.addColorStop(1, shade(col, -0.38));
      return gr;
    };
    for (const q of parts) {
      if (q.t === 0) {
        const ang = Math.atan2(q.B[1] - q.A[1], q.B[0] - q.A[0]);
        g.beginPath(); g.arc(q.A[0], q.A[1], q.rA, ang + HP, ang + 3 * HP); g.arc(q.B[0], q.B[1], q.rB, ang - HP, ang + HP); g.closePath();
        g.strokeStyle = ol; g.lineWidth = olw * 2; g.stroke();
        g.fillStyle = paint((q.A[0] + q.B[0]) / 2, (q.A[1] + q.B[1]) / 2, Math.max(q.rA, q.rB), q.col); g.fill();
      } else if (q.t === 1) {
        g.beginPath(); g.arc(q.C[0], q.C[1], q.r, 0, TAU);
        g.strokeStyle = ol; g.lineWidth = olw * 2; g.stroke();
        g.fillStyle = paint(q.C[0], q.C[1], q.r, q.col); g.fill();
      } else if (q.t === 3) {
        let cx = 0, cyy = 0, r = 0;
        g.beginPath(); q.Q.forEach((v, i) => { i ? g.lineTo(v[0], v[1]) : g.moveTo(v[0], v[1]); cx += v[0] / q.Q.length; cyy += v[1] / q.Q.length; }); g.closePath();
        for (const v of q.Q) r = Math.max(r, Math.hypot(v[0] - cx, v[1] - cyy));
        g.strokeStyle = ol; g.lineWidth = olw * 2; g.stroke();
        g.fillStyle = paint(cx, cyy, r, q.col); g.fill();
      } else q.fn();
    }
  }

  // -------------------------------------------------------------------
  // キャッシュ：型×傾き×動き ごとに FR コマを先に描いておく（小さく映るもの用）
  // -------------------------------------------------------------------
  const FR = 16, CS = 36;
  const caches = {};
  const R = { TYPES, T_FAT, T_SOL, T_RUN, T_SHD, T_BOSS, pose, drawRig, FR, cacheFrames: 0, cdpr: 1 };
  R.getSet = (ti, tilt, state) => {
    const key = ti + '|' + tilt + '|' + state;
    if (caches[key]) return caches[key];
    const P = TYPES[ti], S = CS * R.cdpr;
    const w = Math.ceil(1.7 * S), h = Math.ceil(2.6 * S), ax = w / 2, ay = h - 0.45 * S;
    const frames = [];
    for (let i = 0; i < FR; i++) {
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      drawRig(c.getContext('2d'), P, i / FR, S, ax, ay, 0, tilt, state);
      frames.push(c);
    }
    R.cacheFrames += FR;
    return (caches[key] = { frames, w, h, ax, ay, S });
  };
  // 貼る。mir=true で左右反転（dpr は呼び出し側の画面倍率）
  R.blit = (ctx, dpr, set, ph, sx, sy, sc, mir) => {
    const fr = set.frames[Math.floor(ph * FR) % FR], k = sc / set.S;
    const dw = set.w * k, dh = set.h * k, x = sx - set.ax * k, y = sy - set.ay * k;
    if (mir) { ctx.setTransform(-dpr, 0, 0, dpr, 2 * sx * dpr, 0); ctx.drawImage(fr, x, y, dw, dh); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    else ctx.drawImage(fr, x, y, dw, dh);
  };
  // その場で描く（近くで大きく映るもの用）
  R.live = (ctx, dpr, P, ph, sx, sy, sc, mir, tilt, state) => {
    if (mir) ctx.setTransform(-dpr, 0, 0, dpr, 2 * sx * dpr, 0);
    drawRig(ctx, P, ph, sc, sx, sy, 0, tilt, state);
    if (mir) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  return R;
})();
if (typeof module !== 'undefined') module.exports = Rig;
