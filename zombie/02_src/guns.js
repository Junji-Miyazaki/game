'use strict';
// =====================================================================
// guns.js — 銃の性能と、一人称で見た銃の絵（画像素材なし）
// 絵は「銃身に沿った x、右手側が +y」の座標で描く。単位 u は画面の高さの 1%。
// =====================================================================
const Guns = (() => {
  const TAU = Math.PI * 2;
  // dmg:1発の威力 rate:毎秒の発数 mag:弾倉 reload:装填(秒) kick:反動 spread:ばらつき(px) pellets:散弾の粒数
  // pierce:貫通する体数 ap:盾と木を貫く heat:撃ち続けるとぶれる量
  const DATA = {
    pistol:  { name: '拳銃',           cost: 0,    dmg: 1,   rate: 3.5, mag: 8,   reload: 1.0, kick: 0.8, spread: 0,  desc: '最初の一丁。軽くて装填が速い' },
    magnum:  { name: 'マグナム',       cost: 150,  dmg: 5,   rate: 1.3, mag: 6,   reload: 1.9, kick: 1.8, spread: 0,  pierce: 1, desc: '一発が重い。1体を貫通する' },
    auto:    { name: '自動拳銃',       cost: 250,  dmg: 1,   rate: 7.5, mag: 18,  reload: 1.1, kick: 0.5, spread: 7,  desc: '押している間ばらまく' },
    shotgun: { name: 'ショットガン',   cost: 450,  dmg: 1.5, rate: 1.1, mag: 6,   reload: 2.2, kick: 2.0, spread: 40, pellets: 8, desc: '近いほど強い。まとめて当たる' },
    rifle:   { name: 'ライフル',       cost: 600,  dmg: 3,   rate: 6,   mag: 30,  reload: 1.5, kick: 0.6, spread: 3,  desc: '威力と連射の両立' },
    mg:      { name: '機関銃',         cost: 1200, dmg: 2.5, rate: 12,  mag: 100, reload: 3.5, kick: 0.5, spread: 16, heat: 0.06, desc: '撃ち続けるほどぶれる' },
    at:      { name: '対戦車ライフル', cost: 2000, dmg: 60,  rate: 0.6, mag: 5,   reload: 3.0, kick: 2.6, spread: 0,  pierce: 99, ap: true, desc: '盾も木も貫く。ボス向け' },
  };
  const ORDER = ['pistol', 'magnum', 'auto', 'shotgun', 'rifle', 'mg', 'at'];
  // 見え方：ax=画面の横位置、ay=下端からの高さ(u)、k=大きさ、tip=銃口の x、flash=発砲の光の大きさ
  const VIEW = {
    pistol:  { ax: 0.63, ay: -8, k: 1.3,  tip: 13.8, flash: 4.5 },
    magnum:  { ax: 0.63, ay: -8, k: 1.3,  tip: 19.2, flash: 7.5 },
    auto:    { ax: 0.63, ay: -8, k: 1.3,  tip: 15.6, flash: 4 },
    shotgun: { ax: 0.8,  ay: 2,  k: 1,    tip: 31,   flash: 9 },
    rifle:   { ax: 0.8,  ay: 2,  k: 1,    tip: 30,   flash: 5.5 },
    mg:      { ax: 0.78, ay: 2,  k: 1,    tip: 32.5, flash: 6 },
    at:      { ax: 0.8,  ay: 2,  k: 0.88, tip: 37,   flash: 12 },
  };

  const EDGE = 'rgba(120,235,255,0.5)';
  const METAL = ['#4a596e', '#0c1219'], DARK = ['#252e3a', '#07090d'], POLY = ['#2c3540', '#0b0e12'];
  const WOOD = ['#8f673c', '#2e1c0d'], OLIVE = ['#515e36', '#161c0e'], GLOVE = ['#313b47', '#0d1117'], SLEEVE = ['#27364a', '#0c131c'];
  let g, u;
  // 多角形（y 方向に明→暗のグラデーション＝左から光が当たる金属）
  function P(pts, col, edge = EDGE) {
    let w = 0.01;
    g.beginPath(); pts.forEach((p, i) => { i ? g.lineTo(p[0] * u, p[1] * u) : g.moveTo(p[0] * u, p[1] * u); w = Math.max(w, Math.abs(p[1])); }); g.closePath();
    if (typeof col === 'string') g.fillStyle = col;
    else { const gr = g.createLinearGradient(0, -w * u, 0, w * u); gr.addColorStop(0, col[0]); gr.addColorStop(0.42, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; }
    g.fill(); if (edge) { g.strokeStyle = edge; g.lineWidth = 1.2; g.stroke(); }
  }
  const R = (x0, x1, h0, h1, col, edge) => P([[x0, -h0], [x1, -h1], [x1, h1], [x0, h0]], col, edge);   // 左右対称の先細り
  function E(x, y, rx, ry, col, edge = EDGE, rot = 0) {
    g.beginPath(); g.ellipse(x * u, y * u, rx * u, ry * u, rot, 0, TAU);
    if (typeof col === 'string') g.fillStyle = col;
    else { const gr = g.createLinearGradient(0, (y - ry) * u, 0, (y + ry) * u); gr.addColorStop(0, col[0]); gr.addColorStop(1, col[1]); g.fillStyle = gr; }
    g.fill(); if (edge) { g.strokeStyle = edge; g.lineWidth = 1.2; g.stroke(); }
  }
  function L(x0, y0, x1, y1, col, w = 0.25) { g.strokeStyle = col; g.lineWidth = w * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 * u, y0 * u); g.lineTo(x1 * u, y1 * u); g.stroke(); }
  function glow(x, y, r, col) { g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8; g.beginPath(); g.arc(x * u, y * u, r * u, 0, TAU); g.fill(); g.shadowBlur = 0; }
  // 拳銃を両手で握る：腕2本、重ねた手、スライドに沿う親指
  function twoHands() {
    P([[-3, -1], [-4, -5.6], [-24, -14], [-24, -5]], SLEEVE); P([[-3, 1], [-4, 5.6], [-24, 12], [-24, 3]], SLEEVE);
    L(-6.5, -6.6, -5.4, -2.2, EDGE, 0.2); L(-6.5, 6.4, -5.4, 2.2, EDGE, 0.2);                // 袖口
    E(-1.9, 1.5, 3.5, 3.3, GLOVE, EDGE, 0.2); E(-1.3, -1.7, 3.5, 3.1, GLOVE, EDGE, -0.3);
    for (let i = 0; i < 4; i++) E(1.3 - i * 0.25, -3.2 + i * 1.25, 1.0, 0.72, GLOVE, EDGE, 0.5);   // 握った指
    E(1.7, -2.1, 2.3, 0.75, GLOVE, EDGE, -0.06); E(0.5, 2.3, 1.9, 0.72, GLOVE, EDGE, 0.08);   // 親指
  }
  // 長い銃を下から支える左手
  function supportHand(x, y) {
    E(x, y, 3.3, 2.1, GLOVE, EDGE, -0.1);
    for (let i = 0; i < 4; i++) E(x - 2 + i * 1.3, y + 1.7, 0.66, 1.45, GLOVE, EDGE, 0.05);
  }
  function serrations(x0, x1, h, n) { for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (n - 1); L(x, -h, x, -h * 0.55, '#05070a', 0.18); L(x, h, x, h * 0.55, '#05070a', 0.18); } }

  const SHAPE = {
    pistol() {
      twoHands();
      R(-1, 0, 0.55, 0.55, DARK);                                         // 撃鉄
      R(13, 13.8, 0.8, 0.75, '#05070a');                                   // 銃口
      R(0, 13, 1.75, 1.45, METAL);                                         // スライド
      R(0, 13, 0.62, 0.5, ['#5c6c82', '#2a3442'], null);                   // 上面
      serrations(0.5, 2.7, 1.72, 6);
      P([[5.5, 0.55], [8.6, 0.5], [8.6, 1.4], [5.5, 1.5]], '#06080b');     // 排莢口
      P([[0.4, -1.55], [1.7, -1.55], [1.7, -0.6], [0.4, -0.6]], DARK); P([[0.4, 0.6], [1.7, 0.6], [1.7, 1.55], [0.4, 1.55]], DARK);   // 照門
      glow(1.05, -1.05, 0.22, '#e8f6ff'); glow(1.05, 1.05, 0.22, '#e8f6ff');
      R(11.7, 12.8, 0.38, 0.36, DARK); glow(12.25, 0, 0.24, '#55f0ff');    // 照星
    },
    magnum() {
      twoHands();
      R(-1.9, -0.3, 0.5, 0.45, METAL);                                     // 撃鉄
      R(-0.5, 3, 1.55, 1.55, METAL);                                       // フレーム後部
      P([[2.6, -2.2], [3.4, -2.8], [6.6, -2.8], [7.5, -2.2], [7.5, 2.2], [6.6, 2.8], [3.4, 2.8], [2.6, 2.2]], ['#5d6d83', '#111821']);   // 弾倉（シリンダー）
      for (const y of [-1.75, 0, 1.75]) E(5, y, 1.7, 0.42, '#0a0e14', null);     // 溝
      R(2.6, 7.6, 0.95, 0.9, ['#66768c', '#2e3948'], null);                // 上の梁
      R(19, 19.2, 0.75, 0.75, '#05070a');
      R(7.4, 19, 1.3, 1.08, METAL);                                        // 銃身
      R(7.6, 18.6, 0.48, 0.42, ['#66768c', '#2e3948'], null);              // リブ
      for (let x = 8.6; x < 17.6; x += 1.7) L(x, -0.3, x + 0.8, -0.3, '#0a0e14', 0.2), L(x, 0.3, x + 0.8, 0.3, '#0a0e14', 0.2);
      P([[0.2, -0.8], [1.2, -0.8], [1.2, -0.25], [0.2, -0.25]], DARK); P([[0.2, 0.25], [1.2, 0.25], [1.2, 0.8], [0.2, 0.8]], DARK);
      R(17.2, 18.8, 0.34, 0.3, '#ff8a3a');                                 // 照星（橙）
    },
    auto() {
      P([[-1, -2.2], [1.7, -2.4], [-1.4, -9.5], [-4.2, -8.8]], POLY);      // 長い弾倉
      twoHands();
      R(-1, 0, 0.55, 0.55, DARK);
      R(15.5, 15.6, 0.8, 0.8, '#05070a');
      R(0, 12.5, 1.8, 1.55, METAL);
      R(0, 12.5, 0.62, 0.52, ['#5c6c82', '#2a3442'], null);
      serrations(0.5, 2.7, 1.76, 6); serrations(9, 11, 1.6, 5);
      P([[5, 0.55], [8.2, 0.5], [8.2, 1.45], [5, 1.55]], '#06080b');
      R(12.5, 15.5, 1.9, 1.7, DARK);                                       // 反動を抑える先端
      for (const x of [13.3, 14.5]) { L(x, -1.5, x, -0.7, '#05070a', 0.35); L(x, 1.5, x, 0.7, '#05070a', 0.35); }
      P([[0.4, -1.6], [1.7, -1.6], [1.7, -0.6], [0.4, -0.6]], DARK); P([[0.4, 0.6], [1.7, 0.6], [1.7, 1.6], [0.4, 1.6]], DARK);
      glow(1.05, -1.1, 0.22, '#e8f6ff'); glow(1.05, 1.1, 0.22, '#e8f6ff');
      R(11.2, 12.3, 0.38, 0.36, DARK); glow(11.75, 0, 0.24, '#7dff8a');
    },
    shotgun(st) {
      const pump = -2.2 * (st.pump || 0);
      R(-13, -4, 3.2, 2.7, WOOD);                                          // 銃床
      R(30, 31, 1.2, 1.2, '#05070a');
      R(8, 30, 1.4, 1.08, METAL);                                          // 銃身
      R(8, 30, 0.34, 0.28, ['#66768c', '#2e3948'], null);
      R(-4, 8, 3.05, 2.5, METAL);                                          // 機関部
      R(-4, 8, 0.9, 0.75, ['#5c6c82', '#2a3442'], null);
      P([[1, 1.1], [5.2, 1], [5.2, 2.3], [1, 2.6]], '#06080b');            // 排莢口
      R(12 + pump, 21 + pump, 2.75, 2.35, WOOD);                           // 先台（ポンプ）
      for (let x = 13; x < 20.5; x += 1.15) { L(x + pump, -2.5, x + pump, -1.6, '#1c1108', 0.22); L(x + pump, 2.5, x + pump, 1.6, '#1c1108', 0.22); }
      supportHand(16.6 + pump, -2.7);
      glow(29.3, 0, 0.28, '#ffd27a');                                      // 照星（金の玉）
    },
    rifle() {
      P([[2, -3.1], [6, -2.9], [4.2, -8.4], [0.2, -8.2]], POLY);           // 弾倉
      R(-8, 11, 5.4, 3.5, POLY);                                           // 機関部
      R(28.5, 30, 1.5, 1.4, DARK);                                         // 銃口
      R(21, 28.5, 1.1, 1.0, METAL);                                        // 銃身
      R(10.5, 21.5, 3.2, 2.2, METAL);                                      // ハンドガード
      for (let x = 12.5; x < 21; x += 2.2) { L(x, -2.3, x + 1.1, -2.1, '#06090d', 0.5); L(x, 2.3, x + 1.1, 2.1, '#06090d', 0.5); }
      R(-8, 19, 1.3, 0.9, ['#5c6c82', '#2a3442'], null);                   // 上のレール
      for (let x = -7; x < 18; x += 1.4) L(x, -0.8, x, 0.8, '#1a222c', 0.2);
      R(1.5, 6.5, 2.2, 2.1, DARK);                                         // 光学照準
      E(4, 0, 1.6, 1.6, 'rgba(90,200,230,0.22)'); glow(4, 0, 0.2, '#ff4a3a');
      R(25.3, 26.7, 0.45, 0.4, DARK); glow(26, 0, 0.2, '#55f0ff');
      L(-8, -4.1, 10, -2.75, 'rgba(120,235,255,0.7)', 0.2);
      supportHand(16, -3.1);
    },
    mg(st) {
      P([[-2, -4.2], [7.5, -3.6], [6.4, -10], [-4, -10.6]], OLIVE);        // 弾薬箱
      for (let i = 0; i < 6; i++) P([[4.6 - i * 0.5, -3.9 + i * 0.6], [6.2 - i * 0.5, -3.75 + i * 0.6], [6.1 - i * 0.5, -3.3 + i * 0.6], [4.5 - i * 0.5, -3.45 + i * 0.6]], '#d8a83a', 'rgba(60,40,10,0.8)');   // 弾帯
      L(26, -1.6, 21.5, -6.2, '#3a4756', 0.45); L(26, 1.6, 21.5, 6.2, '#3a4756', 0.45);   // 二脚
      R(-11, 10, 5.7, 3.9, METAL);                                         // 機関部
      R(30.5, 32.5, 1.35, 1.2, DARK);                                      // 消炎器
      R(28, 31, 0.9, 0.85, METAL);
      R(10, 28, 2.7, 1.95, METAL);                                         // 放熱筒
      for (let x = 11.5; x < 27; x += 2.2) for (const y of [-1.35, 1.35]) E(x, y * (1 - (x - 10) * 0.012), 0.5, 0.5, st.heat > 0.5 ? `rgba(255,${120 - 60 * st.heat | 0},40,0.9)` : '#05070a', null);
      R(-6, 8.5, 3.3, 2.7, ['#5c6c82', '#27313e']);                        // 上ぶた
      L(-6, -3.2, -6, 3.2, '#0a0e14', 0.25); L(1, -3.0, 1, 3.0, '#0a0e14', 0.2);
      P([[11, 2.7], [17.5, 2.2], [17.5, 3.5], [11, 4]], DARK);             // 提げ手
      P([[-4.5, -1.4], [-3, -1.4], [-3, -0.5], [-4.5, -0.5]], DARK); P([[-4.5, 0.5], [-3, 0.5], [-3, 1.4], [-4.5, 1.4]], DARK);
      R(26.3, 27.6, 0.5, 0.45, DARK); glow(27, 0, 0.2, '#55f0ff');
      supportHand(13.5, -3.6);
    },
    at() {
      L(24, -1.2, 18.5, -7.4, '#3a4756', 0.5); L(24, 1.2, 18.5, 7.4, '#3a4756', 0.5);   // 二脚
      E(18.5, -7.4, 0.8, 0.5, DARK); E(18.5, 7.4, 0.8, 0.5, DARK);
      R(-13, -2, 4.4, 3.5, POLY);                                          // 銃床
      R(-9.5, -3, 1.9, 1.7, ['#3d4855', '#161c24']);                       // 頬当て
      R(33, 37, 2.4, 2.4, METAL);                                          // 大きな銃口制退器
      for (const x of [33.8, 35, 36.2]) { L(x, -2.3, x, -1.2, '#05070a', 0.5); L(x, 2.3, x, 1.2, '#05070a', 0.5); }
      R(10, 33, 1.55, 1.02, METAL);                                        // 長い銃身
      L(11, -0.5, 32, -0.34, '#1a222c', 0.16); L(11, 0.5, 32, 0.34, '#1a222c', 0.16);
      R(-2, 10, 3.7, 2.9, METAL);                                          // 機関部
      P([[3, 2.9], [4.7, 2.9], [5.6, 5.3], [3.9, 5.5]], METAL); E(4.8, 5.6, 0.9, 0.9, DARK);   // ボルトの握り
      R(11, 14.2, 1.9, 1.9, DARK);                                         // スコープ（前）
      R(0, 13, 1.5, 1.38, ['#3a4553', '#090c10']);                         // スコープ（筒）
      E(6.2, 0, 1.0, 1.0, DARK); E(6.2, 2.1, 0.8, 0.8, DARK);              // 調整つまみ
      R(-2.8, 0.5, 1.95, 1.95, DARK);                                      // スコープ（後）
      E(-2.6, 0, 1.45, 1.45, 'rgba(140,90,230,0.4)'); glow(-2.9, -0.4, 0.3, 'rgba(190,240,255,0.9)');
      supportHand(8.5, -3.7);
    },
  };

  // 銃を描く：(ax, ay) を付け根に ang の向きへ。戻り値は銃口の画面位置
  function drawAt(ctx, id, ax, ay, ang, unit, st = {}) {
    const V = VIEW[id], k = st.kick || 0;
    g = ctx; u = unit * V.k;
    const flip = (id === 'pistol' || id === 'magnum' || id === 'auto') ? k * 0.07 : k * 0.02;   // 拳銃は銃口が跳ねる
    const a = ang + flip, back = k * 1.5 * u;
    g.save(); g.translate(ax - Math.cos(ang) * back, ay - Math.sin(ang) * back); g.rotate(a); g.lineJoin = 'round';
    SHAPE[id](st);
    g.restore();
    const tip = V.tip * u - back;
    return [ax + Math.cos(a) * tip, ay + Math.sin(a) * tip];
  }
  // 夜の画面での置き方：右下から狙いへ向ける。drop=持ち替え中に下げる量(0..1)
  function draw(ctx, id, W, H, aim, st = {}) {
    const V = VIEW[id], unit = H * 0.01;
    const ax = W * V.ax, ay = H + V.ay * unit + (st.drop || 0) * H * 0.35 + Math.sin((st.T || 0) * 1.7) * unit * 0.25;
    const ang = Math.max(-Math.PI * 0.9, Math.min(-Math.PI * 0.22, Math.atan2(aim[1] - ay, aim[0] - ax)));
    return drawAt(ctx, id, ax, ay, ang, unit, st);
  }
  // 発砲の光（星形＋にじみ）
  function flash(ctx, id, p, k, H) {
    const r = VIEW[id].flash * H * 0.01 * k;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    const gr = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 1.6);
    gr.addColorStop(0, 'rgba(255,248,210,0.95)'); gr.addColorStop(0.35, 'rgba(255,190,90,0.55)'); gr.addColorStop(1, 'rgba(255,140,50,0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p[0], p[1], r * 1.6, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,240,190,0.9)'; ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = i * TAU / 10 + p[0], rr = i % 2 ? r * 0.35 : r; ctx.lineTo(p[0] + Math.cos(a) * rr, p[1] + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  }
  return { DATA, ORDER, VIEW, draw, drawAt, flash };
})();
if (typeof module !== 'undefined') module.exports = Guns;
