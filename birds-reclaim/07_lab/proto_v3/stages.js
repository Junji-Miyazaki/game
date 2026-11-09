// BIRDS RECLAIM 試作 v3 — 材質・都市（ステージ）・建物の図面（第2弾で13都市）
// 実在の名前を出す（商用にしない）。ロゴは描かない。宗教施設・慰霊の場・惨事の現場は入れない。
// ボスは観光名所の分かりやすさではなく、いまの時代の権力と資本の新しい象徴を選ぶ（01_docs/CITIES_PROPOSAL.md §8）。
// 昔からの名所は、道中の「名所」（名前の札が付いた普通の建物）に回す。
const W = 360, H = 640, GY = 500, CS = 6, GRAV = 520, PMAX = 1400;
let HPM = 1; // 建物の硬さの倍率（put で掛ける）

// hp=強度 col=色 pt=得点 f=この割合より段が細ると上が倒れる
const MAT = {
  wd: { hp: .8, col: [150, 104, 66], pt: 2, f: .45 }, st: { hp: .35, col: [214, 184, 110], pt: 1, f: .5 },
  br: { hp: 2, col: [168, 84, 62], pt: 3, f: .4 }, bs: { hp: 2.2, col: [122, 82, 66], pt: 3, f: .4 },
  co: { hp: 3.4, col: [150, 154, 160], pt: 4, f: .35 }, gl: { hp: 1.4, col: [143, 179, 201], pt: 3, f: .4 },
  sl: { hp: 6.5, col: [74, 80, 90], pt: 6, f: .25 }, ls: { hp: 3.2, col: [198, 188, 164], pt: 4, f: .35 },
  wn: { hp: 2.4, col: [92, 96, 104], pt: 3, f: .35 }, wh: { hp: 1.3, col: [228, 224, 214], pt: 2, f: .4 },
  ne: { hp: .8, col: [234, 98, 150], pt: 2, f: .45 }, ny: { hp: .8, col: [240, 202, 92], pt: 2, f: .45 },
  // 名所と街並みの色
  rd: { hp: 1.6, col: [204, 62, 48], pt: 3, f: .4 }, wt: { hp: 1.4, col: [236, 234, 228], pt: 2, f: .4 }, gn: { hp: 1.6, col: [88, 140, 118], pt: 3, f: .4 },
  yr: { hp: 1.4, col: [226, 180, 62], pt: 2, f: .4 }, gb: { hp: 1.4, col: [66, 124, 214], pt: 2, f: .4 }, pu: { hp: 1.6, col: [140, 104, 190], pt: 3, f: .4 },
  or: { hp: 1.2, col: [236, 140, 60], pt: 2, f: .4 }, bz: { hp: 2.6, col: [128, 94, 58], pt: 4, f: .4 }, sd: { hp: 1.4, col: [214, 190, 142], pt: 2, f: .45 },
  mg: { hp: 1.6, col: [132, 160, 196], pt: 3, f: .4 }, au: { hp: 1.6, col: [184, 150, 92], pt: 3, f: .4 }, ss: { hp: 3.2, col: [184, 190, 198], pt: 4, f: .3 },
  p1: { hp: 1, col: [232, 172, 170], pt: 2, f: .45 }, p2: { hp: 1, col: [160, 204, 190], pt: 2, f: .45 }, p3: { hp: 1, col: [238, 212, 140], pt: 2, f: .45 },
  // ボスの外殻
  tt: { hp: 5, col: [200, 202, 194], pt: 5, f: .3 }, sv: { hp: 3, col: [60, 68, 80], pt: 4, f: .3 },
  bl: { hp: 2, col: [118, 160, 192], pt: 3, f: .3 }, fan: { hp: 4, col: [128, 136, 146], pt: 6, f: .3 },
  gd: { hp: 2.6, col: [146, 118, 62], pt: 5, f: .3 }, rb: { hp: 3.6, col: [142, 72, 54], pt: 4, f: .3 },
  ch: { hp: 4.5, col: [234, 232, 224], pt: 5, f: .3 }, fs: { hp: 5, col: [128, 128, 124], pt: 5, f: .3 },
  ps: { hp: 4.5, col: [178, 172, 158], pt: 5, f: .3 }, cu: { hp: 4, col: [110, 172, 152], pt: 6, f: .3 },
  rw: { hp: 2.6, col: [178, 132, 86], pt: 4, f: .3 }, cr: { hp: 1.6, col: [226, 186, 58], pt: 3, f: .3 }, mt: { hp: 3, col: [104, 118, 134], pt: 4, f: .3 },
  gr: { hp: 4, col: [196, 190, 178], pt: 5, f: .3 }, t1: { hp: 3, col: [92, 146, 138], pt: 4, f: .3 }, fb: { hp: 2.4, col: [222, 226, 230], pt: 3, f: .3 },
  px: { hp: 3, col: [120, 138, 158], pt: 4, f: .3 }, pv: { hp: 2, col: [64, 74, 88], pt: 3, f: .3 }, l8: { hp: 3, col: [150, 170, 188], pt: 4, f: .3 },
  mb: { hp: 3.4, col: [214, 212, 204], pt: 4, f: .3 }, gf: { hp: 2.6, col: [214, 172, 72], pt: 5, f: .3 }, sw: { hp: 3, col: [236, 236, 230], pt: 4, f: .3 },
  bh: { hp: 3.4, col: [162, 178, 198], pt: 4, f: .3 },
  fv: { hp: 2, col: [186, 212, 226], pt: 3, f: .3 }, cb: { hp: 3, col: [216, 200, 162], pt: 4, f: .3 }, dg: { hp: 3, col: [92, 126, 160], pt: 4, f: .3 },
  eg: { hp: 3, col: [118, 140, 158], pt: 4, f: .3 }, nv: { hp: 3, col: [66, 72, 70], pt: 4, f: .3 }, lx: { hp: 3, col: [50, 54, 66], pt: 4, f: .3 },
  sp: { hp: 3, col: [36, 40, 58], pt: 4, f: .3 }, tw: { hp: 2.4, col: [224, 226, 228], pt: 3, f: .3 },
  // 核（光る）
  nc: { hp: 40, col: [255, 120, 176], pt: 30, f: .3 }, sc: { hp: 30, col: [110, 196, 255], pt: 25, f: .3 },
  kc: { hp: 40, col: [255, 238, 196], pt: 30, f: .3 }, gc: { hp: 34, col: [252, 208, 96], pt: 30, f: .3 },
  rc: { hp: 45, col: [255, 84, 72], pt: 30, f: .3 }, fc: { hp: 22, col: [255, 138, 58], pt: 30, f: .3 },
  tc: { hp: 150, col: [255, 204, 92], pt: 40, f: .3 }, cs: { hp: 30, col: [255, 176, 64], pt: 30, f: .3 },
  dm: { hp: 40, col: [255, 214, 90], pt: 30, f: .3 }, pc: { hp: 26, col: [196, 140, 255], pt: 25, f: .3 }, pl: { hp: 40, col: [84, 200, 232], pt: 30, f: .3 },
  ev: { hp: 30, col: [110, 240, 200], pt: 30, f: .3 }, eu: { hp: 40, col: [255, 214, 60], pt: 30, f: .3 }, pk: { hp: 36, col: [150, 250, 120], pt: 30, f: .3 },
  ai: { hp: 34, col: [150, 255, 80], pt: 30, f: .3 }, bm: { hp: 30, col: [255, 248, 214], pt: 30, f: .3 }, ey: { hp: 40, col: [70, 140, 255], pt: 30, f: .3 },
};

// ---------- 道具 ----------
const ri = (a, n) => a + Math.floor(Math.random() * n);
const hs = (a, b) => { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); };
function mk(x, w, m) { return { x, w: w * CS, cells: new Map(), orig: [], f: MAT[m].f, dirty: 0 }; }
function put(b, r, k, m) { const hp = MAT[m].hp * HPM; b.cells.set(r * 200 + k, { r, k, m, hp, h0: hp }); }
function fin(b) { for (const q of b.cells.values()) b.orig[q.r] = (b.orig[q.r] || 0) + 1; b.n0 = b.cells.size; return b; }
function box(b, r0, r1, k0, k1, m) { for (let r = r0; r <= r1; r++) for (let k = k0; k <= k1; k++) put(b, r, k, m); }
// 中心 cx、幅の半分を hw0→hw1 に変えながら積む
function trap(b, r0, r1, cx, hw0, hw1, m) { for (let r = r0; r <= r1; r++) { const hw = Math.round(hw0 + (hw1 - hw0) * (r - r0) / Math.max(1, r1 - r0)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, m); } }

// ---------- 道中の建物（街並み） ----------
const GEN = {
  house(x) { const w = ri(10, 5), wh = ri(6, 4), b = mk(x, w, 'wd'); box(b, 0, wh - 1, 0, w - 1, 'wd'); for (let r = 0; r < w / 2; r++) for (let k = r; k < w - r; k++) put(b, wh + r, k, 'br'); return fin(b); },
  brick(x) { const w = ri(9, 6), h = ri(9, 10), b = mk(x, w, 'br'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 4 === 2 && k % 3 === 1) ? 'gl' : 'br'); return fin(b); },
  tower(x) { const w = ri(7, 6), h = ri(15, 13), b = mk(x, w, 'co'); box(b, 0, h - 1, 0, w - 1, 'co'); return fin(b); },
  glass(x) { const w = ri(7, 6), h = ri(18, 14), b = mk(x, w, 'gl'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k === 0 || k === w - 1 || r % 6 === 0) ? 'co' : 'gl'); return fin(b); },
  sky(x) { const w = ri(8, 3), h = ri(24, 10), b = mk(x, w, 'gl'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k === 0 || k === w - 1 || r % 5 === 0) ? 'co' : 'gl'); return fin(b); },
  pylon(x) { const b = mk(x, 17, 'sl'); for (let r = 0; r < 27; r++) { const hw = Math.max(1, Math.round(6 - r * .18)); for (let k = -hw; k <= hw; k++) { if (Math.abs(k) < hw - 1 && r % 3) continue; put(b, r, k + 8, 'sl'); } } return fin(b); },
  ware(x) { const w = ri(16, 7), h = ri(5, 3), b = mk(x, w, 'co'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, r === h - 1 ? 'sl' : 'co'); return fin(b); },
  // 大阪の店：低い店の端から縦長のネオン看板が屋根より上へ伸びる
  shop(x) { const w = ri(8, 4), h = ri(5, 4), b = mk(x, w + 1, 'br'); box(b, 0, h - 1, 0, w - 1, 'br'); const s = Math.random() < .5 ? 'ne' : 'ny'; for (let r = 1; r < h + ri(3, 3); r++) put(b, r, w, s); return fin(b); },
  // ロンドンの長屋：3軒つながり、屋根の上に煙突
  terrace(x) { const n = 3, u = ri(6, 2), w = u * n, h = ri(7, 2), b = mk(x, w, 'br'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k % u === 2) ? 'gl' : 'br'); for (let r = h; r < h + 2; r++) for (let k = r - h; k < w - (r - h); k++) put(b, r, k, 'sl'); for (let i = 1; i < n; i++) { put(b, h + 2, i * u, 'br'); put(b, h + 3, i * u, 'br'); } return fin(b); },
  // ニューヨークの褐色砂岩の家：上に飾り縁
  brown(x) { const w = ri(7, 3), h = ri(9, 4), b = mk(x, w, 'bs'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k % 2 === 1) ? 'gl' : 'bs'); box(b, h, h, 0, w - 1, 'co'); return fin(b); },
  // 石造りの事務所：縦長の窓の列
  stone(x) { const w = ri(10, 4), h = ri(12, 5), b = mk(x, w, 'ls'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k % 3 === 1 && r > 0 && r < h - 1) ? 'wn' : 'ls'); return fin(b); },
  // 東京の雑居ビル：細長い箱の脇に縦の看板
  zakkyo(x) { const w = ri(5, 3), h = ri(12, 8), b = mk(x, w + 1, 'co'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 2 && k % 2) ? 'gl' : 'co'); const s = Math.random() < .5 ? 'ne' : 'ny'; for (let r = 2; r < h; r++) put(b, r, w, s); return fin(b); },
  // 台北の騎楼：1階は柱だけ（歩道の屋根）、上に住まい、縦の看板
  arcade(x) { const w = ri(8, 4), h = ri(8, 5), b = mk(x, w + 1, 'ls'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) { if (r < 2 && k % 3) continue; put(b, r, k, (r >= 2 && r % 3 === 0 && k % 2) ? 'gl' : 'ls'); } const s = Math.random() < .5 ? 'ne' : 'rd'; for (let r = 3; r < h + 2; r++) put(b, r, w, s); return fin(b); },
  // バンコクの屋台：低い台、柱、色の日よけ
  stall(x) { const w = ri(5, 3), b = mk(x, w, 'wd'), m = ['rd', 'or', 'gb', 'yr'][ri(0, 4)]; box(b, 0, 1, 0, w - 1, 'wd'); box(b, 2, 3, 0, 0, 'wd'); box(b, 2, 3, w - 1, w - 1, 'wd'); box(b, 4, 4, 0, w - 1, m); return fin(b); },
  // ベトナムのチューブハウス：間口が狭く縦に長い。色の付いた正面と窓
  tube(x) { const w = ri(4, 2), h = ri(10, 7), m = ['p1', 'p2', 'p3', 'wt'][ri(0, 4)], b = mk(x, w, m); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k > 0 && k < w - 1) ? 'gl' : m); return fin(b); },
  // シンガポールのショップハウス：淡い色の2〜3軒、鎧戸、瓦屋根
  shophouse(x) { const n = ri(2, 2), u = 5, w = u * n, h = ri(7, 3), b = mk(x, w, 'p2'); for (let i = 0; i < n; i++) { const m = ['p1', 'p2', 'p3'][ri(0, 3)]; for (let r = 0; r < h; r++) for (let k = i * u; k < i * u + u; k++) put(b, r, k, (r % 3 === 1 && (k - i * u) % 2 === 1) ? 'wn' : m); } box(b, h, h, 0, w - 1, 'rd'); return fin(b); },
  // ドバイの旧市街：砂色の低い家と、風の塔（バルジール）
  sand(x) { const w = ri(8, 5), h = ri(4, 3), b = mk(x, w, 'sd'); box(b, 0, h - 1, 0, w - 1, 'sd'); const k0 = ri(1, w - 3); box(b, h, h + 3, k0, k0 + 1, 'sd'); return fin(b); },
  // 鏡のガラスの塔
  mirror(x) { const w = ri(7, 5), h = ri(20, 16), b = mk(x, w, 'mg'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, r % 7 === 0 ? 'ss' : (k % 3 === 0 ? 'au' : 'mg')); return fin(b); },
  // ドイツの木組みの家：白い壁に木の梁、急な切妻屋根
  gable(x) { const w = ri(7, 4), h = ri(6, 4), b = mk(x, w, 'wt'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 0 || k === 0 || k === w - 1) ? 'wd' : (r % 3 === 2 && k % 2) ? 'gl' : 'wt'); for (let r = 0; r < Math.ceil(w / 2); r++) for (let k = r; k < w - r; k++) { put(b, h + r * 2, k, 'rd'); put(b, h + r * 2 + 1, k, 'rd'); } return fin(b); },
  // パリのオスマン建築：クリーム色の石、鉄のバルコニー、灰色のマンサード屋根
  haussmann(x) { const w = ri(10, 4), h = ri(8, 3), b = mk(x, w, 'ls'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r === 2 || r === h - 2) && k % 2 ? 'sl' : (r % 2 && k % 3 === 1) ? 'wn' : 'ls'); for (let r = 0; r < 3; r++) for (let k = r; k < w - r; k++) put(b, h + r, k, (r === 1 && k % 3 === 1) ? 'gl' : 'mt'); return fin(b); },
  // 地中海の家：白や淡い色の壁、緑の鎧戸、素焼きの屋根
  riviera(x) { const w = ri(7, 4), h = ri(5, 4), m = ['wt', 'p1', 'p3', 'wt'][ri(0, 4)], b = mk(x, w, m); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'gn' : m); box(b, h, h, 0, w - 1, 'or'); return fin(b); },
  // ラ・マンチャの風車：白い塔、とがった屋根、十字の羽
  windmill(x) { const b = mk(x, 11, 'wt'), cx = 5, h = ri(8, 3); box(b, 0, h - 1, cx - 2, cx + 2, 'wt'); trap(b, h, h + 2, cx, 2, 0, 'sl'); for (let i = 1; i <= 4; i++) { put(b, h - 2 + i, cx, 'wd'); put(b, h - 2 - i, cx, 'wd'); put(b, h - 2, cx + 1 + i, 'wd'); put(b, h - 2, cx - 1 - i, 'wd'); } return fin(b); },
  // サンフランシスコのヴィクトリア様式の家：淡い色、出窓、とがった破風
  victorian(x) { const w = ri(5, 2), h = ri(7, 3), m = ['p1', 'p2', 'p3', 'pu', 'yr'][ri(0, 5)], b = mk(x, w, m); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k === 1 && r > 0 && r < h - 1) ? 'wt' : (r % 3 === 1 && k > 1) ? 'gl' : m); for (let r = 0; r < Math.ceil(w / 2); r++) for (let k = r; k < w - r; k++) put(b, h + r, k, 'sl'); return fin(b); },
  // ラスベガスのカジノ：低く横に長い箱、屋根の縁のネオン、端に縦の電飾看板
  casino(x) { const w = ri(14, 8), h = ri(5, 4), b = mk(x, w + 2, 'co'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, r >= h - 2 ? (k % 2 ? 'ne' : 'ny') : (r === 1 && k % 3 === 1) ? 'gl' : 'co'); for (let r = 0; r < h + 6; r++) { put(b, r, w, r > h ? 'ny' : 'co'); put(b, r, w + 1, r > h ? 'ne' : 'co'); } return fin(b); },
};
// エッフェル塔の形（パリの本物と、ラスベガスの半分の大きさの偽物で使う）
function eiffelB(x, h) {
  const hw0 = Math.round(h * .27), b = mk(x, hw0 * 2 + 1, 'bz'), cx = hw0;
  for (let r = 0; r <= h; r++) {
    const hw = Math.max(0, Math.round(hw0 * Math.pow(1 - r / h, 2.2))), deck = r === Math.round(h * .17) || r === Math.round(h * .38) || r === Math.round(h * .8);
    for (let k = -hw; k <= hw; k++) { const inner = Math.abs(k) < hw - 1; if (inner && !deck && (r % 3 || (r < h * .17 && Math.abs(k) < hw * .6))) continue; put(b, r, k + cx, deck ? 'au' : 'bz'); }
  }
  box(b, h + 1, h + 3, cx, cx, 'sl'); return fin(b);
}

// ---------- 名所（名前の札が付く普通の建物） ----------
// 倒すと「◯◯、還る」と出て点が入る。real=人工の木など（倒すと本物の大きな木が育つ）
const LM = {
  // 大阪
  glico: { name: 'グリコサイン', make(x) { const b = mk(x, 12, 'sl'); box(b, 0, 5, 1, 1, 'sl'); box(b, 0, 5, 10, 10, 'sl'); box(b, 6, 15, 0, 11, 'gb'); for (const [r, k] of [[13, 6], [12, 6], [11, 6], [10, 5], [10, 7], [9, 4], [11, 8], [8, 5], [8, 7], [12, 4], [12, 5], [14, 6]]) put(b, r, k, 'wt'); return fin(b); } },
  kani: { name: 'かに道楽', make(x) { const b = mk(x, 14, 'br'); box(b, 0, 6, 1, 12, 'br'); box(b, 7, 9, 4, 9, 'rd'); for (const [r, k] of [[7, 2], [7, 3], [8, 2], [7, 10], [7, 11], [8, 11], [10, 4], [11, 4], [11, 3], [10, 9], [11, 9], [11, 10]]) put(b, r, k, 'rd'); return fin(b); } },
  harukas: { name: 'あべのハルカス', make(x) { const b = mk(x, 12, 'gl'); for (let r = 0; r <= 48; r++) { const k0 = r <= 20 ? 0 : r <= 34 ? 3 : 6; for (let k = k0; k <= 11; k++) put(b, r, k, (r % 5 === 0 || k === 11) ? 'co' : 'gl'); } return fin(b); } },
  oskcastle: { name: '大阪城', make(x) { const b = mk(x, 25, 'ls'), cx = 12; trap(b, 0, 5, cx, 12, 10, 'ls'); trap(b, 6, 9, cx, 8, 8, 'wt'); trap(b, 10, 10, cx, 10, 10, 'gn'); trap(b, 11, 13, cx, 6, 6, 'wt'); trap(b, 14, 14, cx, 8, 8, 'gn'); trap(b, 15, 17, cx, 4, 4, 'wt'); trap(b, 18, 18, cx, 6, 6, 'gn'); trap(b, 19, 20, cx, 3, 3, 'wt'); trap(b, 21, 21, cx, 4, 4, 'gn'); put(b, 22, cx - 3, 'yr'); put(b, 22, cx + 3, 'yr'); return fin(b); } },
  umedasky: { name: '梅田スカイビル', make(x) { const b = mk(x, 18, 'gl'); for (const k0 of [0, 12]) for (let r = 0; r <= 30; r++) for (let k = k0; k <= k0 + 5; k++) put(b, r, k, r % 4 === 0 ? 'co' : 'gl'); for (let r = 31; r <= 34; r++) for (let k = 0; k <= 17; k++) { if (r >= 32 && r <= 33 && k >= 7 && k <= 10) continue; put(b, r, k, 'ss'); } return fin(b); } },
  kaiyukan: { name: '海遊館', make(x) { const b = mk(x, 20, 'gb'); for (let r = 0; r <= 12; r++) for (let k = 0; k <= 19; k++) put(b, r, k, r <= 5 ? (Math.floor(k / 5) % 2 ? 'rd' : 'gb') : (r === 9 && k % 3 === 1 ? 'wt' : 'gb')); return fin(b); } },
  // 東京
  shibuya109: { name: 'SHIBUYA109', make(x) { const b = mk(x, 8, 'ss'); for (let r = 0; r <= 24; r++) for (let k = 0; k <= 7; k++) put(b, r, k, (r >= 20 && r <= 22 && k >= 1 && k <= 6) ? 'wt' : (k % 2 ? 'gl' : 'ss')); return fin(b); } },
  tokyotower: { name: '東京タワー', make(x) { const b = mk(x, 17, 'rd'); for (let r = 0; r <= 50; r++) { const hw = Math.max(0, Math.round(8 - r * .16)), deck = r === 20 || r === 21 || r === 36, m = Math.floor(r / 5) % 2 ? 'wt' : 'rd'; for (let k = -hw; k <= hw; k++) { if (Math.abs(k) < hw - 1 && r % 3 && !deck) continue; put(b, r, k + 8, deck ? 'gl' : m); } } return fin(b); } },
  tokyostation: { name: '東京駅 丸の内駅舎', make(x) { const b = mk(x, 45, 'br'); for (let r = 0; r <= 8; r++) for (let k = 0; k <= 44; k++) put(b, r, k, (r === 3 || r === 6) ? 'wt' : (r % 3 === 1 && k % 3 === 1) ? 'gl' : 'br'); for (const cx of [6, 38]) { trap(b, 9, 10, cx, 4, 4, 'br'); trap(b, 11, 13, cx, 4, 1, 'sl'); } trap(b, 9, 10, 22, 6, 6, 'br'); trap(b, 11, 11, 22, 5, 3, 'sl'); return fin(b); } },
  boj: { name: '日本銀行本店', make(x) { const b = mk(x, 24, 'ls'), cx = 12; for (let r = 0; r <= 10; r++) for (let k = 0; k <= 23; k++) put(b, r, k, (r >= 2 && r <= 8 && k % 3 === 1) ? 'wn' : 'ls'); trap(b, 11, 12, cx, 10, 6, 'ls'); trap(b, 13, 15, cx, 3, 2, 'gn'); put(b, 16, cx, 'gn'); return fin(b); } },
  skytree: { name: '東京スカイツリー', make(x) { const b = mk(x, 13, 'wt'), cx = 6; for (let r = 0; r <= 10; r++) { const hw = Math.round(6 - r * .4); for (let k = cx - hw; k <= cx + hw; k++) { if (Math.abs(k - cx) < hw - 1 && r % 3) continue; put(b, r, k, 'wt'); } } for (let r = 11; r <= 70; r++) { const hw = r < 44 ? 2 : 1; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r % 6 === 0 ? 'gl' : 'wt'); } trap(b, 40, 42, cx, 4, 4, 'gl'); trap(b, 56, 57, cx, 3, 3, 'gl'); box(b, 71, 75, cx, cx, 'sl'); return fin(b); } },
  // 台北〜バンコク
  grandhotel: { name: '圓山大飯店', make(x) { const b = mk(x, 37, 'rd'), cx = 18; for (let r = 0; r <= 10; r++) for (let k = 1; k <= 35; k++) put(b, r, k, (r % 4 === 3) ? 'yr' : (k % 3 === 1 ? 'wn' : 'rd')); trap(b, 11, 12, cx, 18, 16, 'yr'); trap(b, 13, 16, cx, 11, 11, 'rd'); trap(b, 17, 18, cx, 13, 10, 'yr'); trap(b, 19, 20, cx, 6, 6, 'rd'); trap(b, 21, 22, cx, 8, 4, 'yr'); return fin(b); } },
  shinkong: { name: '新光摩天大樓', make(x) { const b = mk(x, 13, 'au'); for (let r = 0; r <= 40; r++) for (let k = 0; k <= 12; k++) put(b, r, k, (r % 5 === 0) ? 'co' : (k % 3 === 0 ? 'au' : 'yr')); trap(b, 41, 44, 6, 5, 2, 'au'); return fin(b); } },
  bts: { name: 'BTS スカイトレイン', make(x) { const b = mk(x, 40, 'co'); for (let k = 0; k <= 31; k++) if (k % 10 < 2) box(b, 0, 6, k, k, 'co'); box(b, 7, 8, 0, 39, 'co'); box(b, 9, 9, 6, 30, 'ss'); box(b, 10, 10, 6, 30, 'gn'); return fin(b); } },
  baiyoke: { name: 'バイヨーク・スカイ', make(x) { const b = mk(x, 10, 'gb'), M = ['gb', 'pu', 'rd', 'or', 'yr']; for (let r = 0; r <= 55; r++) for (let k = 0; k <= 9; k++) put(b, r, k, k % 3 === 0 ? 'co' : M[Math.floor(r / 11) % 5]); box(b, 56, 60, 4, 5, 'sl'); return fin(b); } },
  statetower: { name: 'ステート・タワー', make(x) { const b = mk(x, 14, 'wt'), cx = 7; for (let r = 0; r <= 40; r++) for (let k = 0; k <= 13; k++) put(b, r, k, (k % 3 === 1 && r % 2) ? 'wn' : 'wt'); trap(b, 41, 46, cx, 6, 1, 'yr'); return fin(b); } },
  iconsiam: { name: 'アイコンサイアム', make(x) { const b = mk(x, 40, 'gl'); for (let k = 0; k <= 39; k++) { const h = 10 + Math.round(2 * Math.sin(k * .4)); for (let r = 0; r <= h; r++) put(b, r, k, r % 4 === 0 ? 'ss' : 'gl'); } for (const k0 of [4, 28]) for (let r = 0; r <= 40; r++) for (let k = k0; k <= k0 + 7; k++) put(b, r, k, r % 3 === 0 ? 'ss' : 'gl'); return fin(b); } },
  // ホーチミン〜シンガポール
  benthanh: { name: 'ベンタイン市場', make(x) { const b = mk(x, 36, 'p3'); for (let r = 0; r <= 6; r++) for (let k = 0; k <= 35; k++) put(b, r, k, (r % 3 === 1 && k % 4 === 1) ? 'wn' : 'p3'); box(b, 7, 14, 15, 20, 'wt'); box(b, 11, 12, 16, 19, 'yr'); trap(b, 15, 16, 17, 3, 1, 'rd'); return fin(b); } },
  bitexco: { name: 'ビテクスコ・タワー', make(x) { const b = mk(x, 20, 'gl'), cx = 7; for (let r = 0; r <= 44; r++) { const hw = Math.max(1, Math.round(4 + 2 * Math.sin(Math.PI * r / 40) - (r > 36 ? (r - 36) * .5 : 0))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r % 4 === 0 || Math.abs(k - cx) === hw) ? 'co' : 'gl'); } box(b, 33, 33, cx + 3, cx + 11, 'sl'); box(b, 34, 34, cx + 5, cx + 12, 'yr'); return fin(b); } },
  kltower: { name: 'KL タワー', make(x) { const b = mk(x, 11, 'wt'), cx = 5; trap(b, 0, 3, cx, 4, 2, 'wt'); box(b, 4, 37, cx - 1, cx + 1, 'wt'); trap(b, 38, 43, cx, 3, 5, 'gl'); box(b, 41, 41, 0, 10, 'wt'); box(b, 44, 44, cx - 3, cx + 3, 'wt'); box(b, 45, 52, cx, cx, 'sl'); return fin(b); } },
  raffles: { name: 'ラッフルズ・ホテル', make(x) { const b = mk(x, 30, 'wt'), cx = 15; for (let r = 0; r <= 9; r++) for (let k = 0; k <= 29; k++) put(b, r, k, (r % 4 === 2 && k % 2) ? 'wn' : 'wt'); trap(b, 10, 11, cx, 14, 12, 'or'); trap(b, 12, 13, cx, 4, 3, 'wt'); trap(b, 14, 14, cx, 4, 4, 'or'); return fin(b); } },
  merlion: { name: 'マーライオン', make(x) { const b = mk(x, 12, 'wt'); box(b, 0, 2, 0, 11, 'ls'); for (let r = 3; r <= 9; r++) { const k0 = 2 + Math.round(Math.sin(r * .6)); box(b, r, r, k0, k0 + 6, 'wt'); } box(b, 10, 13, 3, 9, 'wt'); put(b, 12, 10, 'wt'); put(b, 11, 10, 'gb'); return fin(b); } },
  supertree: { name: 'スーパーツリー（人工の木）', real: 1, make(x) { const b = mk(x, 17, 'pu'), cx = 8; for (let r = 0; r <= 22; r++) { const hw = r < 4 ? 2 : 1; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, 'pu'); } for (let r = 23; r <= 27; r++) { const hw = 2 + Math.round((r - 23) * 1.5); for (let k = cx - hw; k <= cx + hw; k++) { put(b, r, k, (k + r) % 3 ? 'pu' : 'gn'); } } return fin(b); } },
  // ドバイ
  skidubai: { name: 'スキー・ドバイ', make(x) { const b = mk(x, 40, 'ss'); for (let k = 0; k <= 39; k++) { const h = 4 + Math.round(k * .35); for (let r = 0; r <= h; r++) put(b, r, k, r >= h - 1 ? 'wt' : 'ss'); } return fin(b); } },
  motf: { name: '未来博物館', make(x) { const b = mk(x, 24, 'ss'); box(b, 0, 2, 2, 21, 'sd'); for (let r = 3; r <= 25; r++) for (let k = 0; k <= 23; k++) { const d = Math.hypot(k - 11.5, (r - 13.5) * 1.1); if (d >= 7 && d <= 11.6) put(b, r, k, (k * 7 + r * 3) % 5 === 0 ? 'wn' : 'ss'); } return fin(b); } },
  emirates: { name: 'エミレーツ・タワーズ', make(x) { const b = mk(x, 19, 'ss'); const tw = (k0, h, t) => { for (let r = 0; r <= h + t; r++) { const s = r > h ? Math.round((r - h) * 7 / t) : 0; for (let k = k0 + s; k <= k0 + 6; k++) put(b, r, k, r % 5 === 0 ? 'mg' : 'ss'); } }; tw(0, 40, 10); tw(12, 32, 8); return fin(b); } },
  dubaimall: { name: 'ドバイ・モール', make(x) { const b = mk(x, 45, 'sd'); for (let r = 0; r <= 9; r++) for (let k = 0; k <= 44; k++) put(b, r, k, r === 9 ? 'gl' : (r % 3 === 1 && k % 4 === 1 ? 'wn' : 'sd')); return fin(b); } },
  // ロンドン
  bttower: { name: 'BT タワー', make(x) { const b = mk(x, 8, 'gl'), cx = 4; for (let r = 0; r <= 38; r++) box(b, r, r, cx - 2, cx + 1, r % 3 ? 'gl' : 'co'); box(b, 26, 31, cx - 3, cx + 2, 'wt'); box(b, 39, 44, cx - 1, cx, 'sl'); return fin(b); } },
  boe: { name: 'イングランド銀行', make(x) { const b = mk(x, 40, 'ls'); for (let r = 0; r <= 8; r++) for (let k = 0; k <= 39; k++) put(b, r, k, (r >= 2 && r <= 6 && k % 4 === 2 && k > 12 && k < 27) ? 'wn' : 'ls'); box(b, 9, 9, 0, 39, 'co'); return fin(b); } },
  gherkin: { name: 'ガーキン', make(x) { const b = mk(x, 15, 'gl'), cx = 7; for (let r = 0; r <= 34; r++) { const hw = Math.max(1, Math.round(7 * Math.sin(Math.PI * (r + 6) / 44))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, ((r + k) % 6 < 2) ? 'wn' : 'gl'); } return fin(b); } },
  shard: { name: 'ザ・シャード', make(x) { const b = mk(x, 17, 'gl'), cx = 8; for (let r = 0; r <= 62; r++) { const hw = Math.round(8 * (1 - r / 64)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r % 6 === 0 || Math.abs(k - cx) === hw) ? 'ss' : 'gl'); } return fin(b); } },
  londoneye: { name: 'ロンドン・アイ', make(x) { const b = mk(x, 27, 'wt'), cx = 13, cr = 15; for (let r = 0; r <= 29; r++) for (let k = 0; k <= 26; k++) { const d = Math.hypot(k - cx, r - cr); if (d >= 11 && d <= 12.9) put(b, r, k, (Math.round(Math.atan2(r - cr, k - cx) * 4) % 2) ? 'gl' : 'wt'); } for (let i = 0; i <= 15; i++) { const d = Math.round(7 - i * 7 / 15); for (const k of [cx - d, cx - d - 1, cx + d, cx + d + 1]) put(b, i, k, 'wt'); } for (let i = 0; i < 12; i++) for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) put(b, cr + dy * i, cx + dx * i, 'wt'); return fin(b); } },
  // ニューヨーク
  msg: { name: 'マディソン・スクエア・ガーデン', make(x) { const b = mk(x, 32, 'co'); for (let r = 0; r <= 14; r++) for (let k = 0; k <= 31; k++) put(b, r, k, k % 2 ? 'wt' : 'co'); box(b, 15, 15, 1, 30, 'ss'); return fin(b); } },
  esb: { name: 'エンパイア・ステート・ビル', make(x) { const b = mk(x, 24, 'ls'); let r = 0; for (const [t, a, z] of [[5, 0, 23], [40, 3, 20], [50, 6, 17], [56, 8, 15], [60, 10, 13]]) for (; r <= t; r++) for (let k = a; k <= z; k++) put(b, r, k, (k % 2 && r % 2) ? 'wn' : 'ls'); box(b, 61, 68, 11, 12, 'sl'); return fin(b); } },
  chrysler: { name: 'クライスラー・ビル', make(x) { const b = mk(x, 14, 'ls'), cx = 7; for (let r = 0; r <= 44; r++) for (let k = 0; k <= 13; k++) put(b, r, k, (k % 2 && r % 2) ? 'wn' : 'ls'); for (let r = 45; r <= 56; r++) { const hw = Math.max(1, Math.round(6 - (r - 45) * .45)); for (let k = cx - hw; k <= cx + hw - 1; k++) { if ((r - 45) % 3 === 2 && Math.abs(k - cx) < hw - 1) continue; put(b, r, k, 'ss'); } } box(b, 57, 62, cx - 1, cx - 1, 'sl'); return fin(b); } },
  nyse: { name: 'ニューヨーク証券取引所', make(x) { const b = mk(x, 28, 'wt'), cx = 14; box(b, 0, 1, 0, 27, 'ls'); for (let r = 2; r <= 13; r++) for (let k = 0; k <= 27; k++) put(b, r, k, k % 4 === 1 ? 'wt' : 'ls'); for (let r = 5; r <= 12; r++) for (let k = 5; k <= 22; k++) put(b, r, k, (k <= 11 && r >= 9) ? 'gb' : (r % 2 ? 'rd' : 'wt')); box(b, 14, 14, 0, 27, 'ls'); trap(b, 15, 17, cx, 13, 4, 'ls'); return fin(b); } },
  bull: { name: 'チャージング・ブル', make(x) { const b = mk(x, 14, 'bz'); box(b, 0, 1, 0, 13, 'ls'); for (const k of [1, 2, 8, 9]) box(b, 2, 3, k, k, 'bz'); box(b, 4, 7, 0, 10, 'bz'); box(b, 5, 8, 11, 13, 'bz'); put(b, 9, 13, 'bz'); put(b, 9, 11, 'bz'); put(b, 8, 0, 'bz'); return fin(b); } },
  // ベルリン〜フランクフルト
  brandenburg: { name: 'ブランデンブルク門', make(x) { const b = mk(x, 30, 'ls'); box(b, 0, 1, 0, 29, 'ls'); for (let i = 0; i < 6; i++) box(b, 2, 12, i * 5 + 1, i * 5 + 2, 'ls'); box(b, 13, 15, 0, 29, 'ls'); box(b, 16, 17, 6, 23, 'ls'); box(b, 18, 20, 12, 17, 'cu'); put(b, 21, 14, 'cu'); put(b, 21, 15, 'cu'); return fin(b); } },
  fernsehturm: { name: 'ベルリンのテレビ塔', make(x) { const b = mk(x, 13, 'co'), cx = 6; trap(b, 0, 3, cx, 5, 2, 'co'); box(b, 4, 42, cx - 1, cx + 1, 'co'); for (let r = 43; r <= 53; r++) { const hw = Math.round(Math.sqrt(Math.max(0, 30 - (r - 48) * (r - 48)))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r === 48 ? 'gl' : 'ss'); } box(b, 54, 62, cx, cx, 'rd'); return fin(b); } },
  sonycenter: { name: 'ソニーセンター', make(x) { const b = mk(x, 36, 'gl'); for (let r = 0; r <= 14; r++) for (let k = 0; k <= 35; k++) { if (r > 1 && k > 8 && k < 27) continue; put(b, r, k, r % 4 === 0 ? 'co' : 'gl'); } for (let k = 0; k <= 35; k++) { const h = 15 + Math.round(5 * Math.sin(Math.PI * k / 35)); for (let r = 15; r <= h; r++) put(b, r, k, (k + r) % 4 === 0 ? 'wt' : 'fv'); } return fin(b); } },
  commerzbank: { name: 'コメルツバンク・タワー', make(x) { const b = mk(x, 14, 'gl'), cx = 7; for (let r = 0; r <= 52; r++) for (let k = 0; k <= 13; k++) put(b, r, k, (k === 0 || k === 13 || r % 6 === 0) ? 'ss' : (Math.floor(r / 6) % 3 === 1 && k > 3 && k < 10) ? 'gn' : 'gl'); box(b, 53, 56, cx - 3, cx + 3, 'ss'); box(b, 57, 61, cx, cx, 'sl'); return fin(b); } },
  messeturm: { name: 'メッセトゥルム', make(x) { const b = mk(x, 13, 'rb'), cx = 6; for (let r = 0; r <= 44; r++) for (let k = 0; k <= 12; k++) put(b, r, k, (k % 3 === 1 && r % 2) ? 'wn' : 'rb'); for (let r = 45; r <= 50; r++) for (let k = 1; k <= 11; k++) put(b, r, k, 'gl'); trap(b, 51, 56, cx, 5, 0, 'rb'); return fin(b); } },
  // パリ〜モナコ（昔からの名所は札に回す）
  lafayette: { name: 'ギャラリー・ラファイエット', make(x) { const b = mk(x, 34, 'ls'), cx = 17; for (let r = 0; r <= 10; r++) for (let k = 0; k <= 33; k++) put(b, r, k, (r % 3 === 1 && k % 3 === 1) ? 'wn' : 'ls'); for (let r = 11; r <= 18; r++) { const hw = Math.round(Math.sqrt(Math.max(0, 81 - (r - 10) * (r - 10) * 1.2))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (k + r) % 3 ? 'cr' : 'gl'); } return fin(b); } },
  louvre: { name: 'ルーヴルのピラミッド', make(x) { const b = mk(x, 25, 'gl'), cx = 12; for (let r = 0; r <= 12; r++) { const hw = 12 - r; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, ((k - cx + r) % 3 === 0 || (cx - k + r) % 3 === 0) ? 'ss' : 'gl'); } return fin(b); } },
  pompidou: { name: 'ポンピドゥー・センター', make(x) { const b = mk(x, 40, 'gl'), P = ['gb', 'rd', 'gn', 'yr']; for (let r = 0; r <= 15; r++) for (let k = 0; k <= 39; k++) put(b, r, k, k % 5 === 0 ? P[(k / 5) % 4] : r % 4 === 0 ? 'wt' : 'gl'); box(b, 16, 16, 0, 39, 'wt'); return fin(b); } },
  montparnasse: { name: 'モンパルナス・タワー', make(x) { const b = mk(x, 12, 'pv'); for (let r = 0; r <= 50; r++) for (let k = 0; k <= 11; k++) put(b, r, k, r % 2 ? 'pv' : 'mt'); box(b, 51, 52, 1, 10, 'co'); return fin(b); } },
  eiffel: { name: 'エッフェル塔', make(x) { return eiffelB(x, 60); } },
  // バルセロナ〜マドリード（サグラダ・ファミリアは宗教施設なので入れない）
  boqueria: { name: 'ボケリア市場', make(x) { const b = mk(x, 30, 'p2'), cx = 15; for (let r = 0; r <= 7; r++) for (let k = 0; k <= 29; k++) put(b, r, k, (r % 3 === 1 && k % 3 === 1) ? 'yr' : 'p2'); for (let r = 8; r <= 14; r++) { const hw = Math.round(14 * Math.sqrt(Math.max(0, 1 - ((r - 7) / 8) ** 2))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r === 11 && k % 2) ? 'or' : 'gl'); } return fin(b); } },
  casamila: { name: 'カサ・ミラ', make(x) { const b = mk(x, 30, 'ls'); for (let k = 0; k <= 29; k++) { const h = 14 + Math.round(1.5 * Math.sin(k * .5)); for (let r = 0; r <= h; r++) put(b, r, k, (r % 3 === 1 && (k + Math.round(Math.sin(r) * 2)) % 4 === 1) ? 'sl' : (r === h ? 'wt' : 'ls')); } for (const k of [5, 13, 22]) box(b, 12, 18, k, k + 1, 'wt'); return fin(b); } },
  cuatrotorres: { name: 'クアトロ・トーレス', make(x) { const b = mk(x, 44, 'gl'); box(b, 0, 1, 0, 43, 'co'); for (const [k0, h, m] of [[0, 52, 'gl'], [11, 56, 'mg'], [22, 50, 'bl'], [33, 54, 'ss']]) for (let r = 2; r <= h; r++) for (let k = k0 + 1; k <= k0 + 9; k++) put(b, r, k, r % 5 === 0 ? 'co' : m); return fin(b); } },
  metropolis: { name: 'メトロポリス・ビル', make(x) { const b = mk(x, 16, 'wt'), cx = 8; for (let r = 0; r <= 22; r++) for (let k = 1; k <= 15; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'wn' : 'wt'); for (let r = 23; r <= 30; r++) { const hw = Math.round(7 * Math.sqrt(Math.max(0, 1 - ((r - 22) / 9) ** 2))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, 'sl'); } for (let r = 31; r <= 34; r++) put(b, r, cx, 'cr'); put(b, 33, cx - 1, 'cr'); put(b, 33, cx + 1, 'cr'); return fin(b); } },
  palacioreal: { name: 'マドリード王宮', make(x) { const b = mk(x, 46, 'wt'); for (let r = 0; r <= 12; r++) for (let k = 0; k <= 45; k++) put(b, r, k, r <= 2 ? 'ls' : (r % 3 === 1 && k % 3 === 1) ? 'wn' : 'wt'); box(b, 13, 13, 0, 45, 'ls'); for (const k0 of [0, 20, 40]) box(b, 14, 16, k0, k0 + 5, 'wt'); return fin(b); } },
  // シアトル
  pikeplace: { name: 'パイク・プレイス・マーケット', make(x) { const b = mk(x, 34, 'br'); for (let r = 0; r <= 6; r++) for (let k = 0; k <= 33; k++) put(b, r, k, (r % 3 === 1 && k % 3 === 1) ? 'gl' : 'br'); box(b, 7, 7, 0, 33, 'co'); for (const k of [8, 24]) box(b, 8, 11, k, k, 'sl'); box(b, 12, 14, 4, 29, 'rd'); for (let k = 6; k <= 27; k += 2) put(b, 13, k, 'wt'); return fin(b); } },
  columbia: { name: 'コロンビア・センター', make(x) { const b = mk(x, 14, 'pv'); for (let r = 0; r <= 60; r++) { const s = r > 50 ? 3 : r > 40 ? 1 : 0; for (let k = s; k <= 13 - s; k++) put(b, r, k, r % 4 === 0 ? 'mt' : 'pv'); } return fin(b); } },
  library: { name: 'シアトル中央図書館', make(x) { const b = mk(x, 30, 'gl'); for (let r = 0; r <= 22; r++) { const a = Math.round(r < 8 ? 6 - r * .6 : r < 14 ? 2 + (r - 8) : Math.max(0, 8 - (r - 14))), z = Math.round(r < 12 ? 23 + r * .5 : 29 - (r - 12) * .6); for (let k = a; k <= z; k++) put(b, r, k, ((k + r) % 3 === 0 || (k - r + 30) % 3 === 0) ? 'ss' : 'gl'); } return fin(b); } },
  spaceneedle: { name: 'スペース・ニードル', make(x) { const b = mk(x, 17, 'wt'), cx = 8; for (let r = 0; r <= 44; r++) { const hw = r < 30 ? Math.max(1, Math.round(4 - r * .1)) : Math.round(1 + (r - 30) * .1); put(b, r, cx - hw, 'wt'); put(b, r, cx + hw, 'wt'); put(b, r, cx, 'wt'); if (r % 8 === 4) for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, 'wt'); } for (let r = 45; r <= 49; r++) { const hw = r <= 47 ? 4 + (r - 45) * 2 : 8 - (r - 47) * 2; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r === 46 ? 'gl' : 'wt'); } trap(b, 50, 51, cx, 2, 1, 'wt'); box(b, 52, 58, cx, cx, 'sl'); return fin(b); } },
  // サンフランシスコ〜シリコンバレー（ロゴは描かない）
  goldengate: { name: 'ゴールデン・ゲート・ブリッジ', make(x) { const b = mk(x, 40, 'rd'), cab = k => 12 + Math.round(36 * Math.pow(1 - (k < 14 ? 14 - k : k - 24) / 15, 2)); for (const k of [14, 15, 23, 24]) box(b, 0, 52, k, k, 'rd'); for (const r of [24, 36, 48, 52]) box(b, r, r, 14, 24, 'rd'); box(b, 10, 11, 0, 39, 'rd'); for (let k = 0; k <= 39; k++) { if (k >= 14 && k <= 24) continue; const nb = k < 14 ? k + 1 : k - 1, r1 = cab(k), r2 = nb >= 14 && nb <= 24 ? r1 : cab(nb); for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) put(b, r, k, 'rd'); if (k % 3 === 0) box(b, 12, r1, k, k, 'rd'); } return fin(b); } },
  paintedladies: { name: 'ペインテッド・レディース', make(x) { const b = mk(x, 30, 'p1'), M = ['p1', 'p3', 'p2', 'pu', 'yr']; for (let i = 0; i < 5; i++) { const k0 = i * 6, m = M[i], h = 7 + (i % 2); for (let r = 0; r < h; r++) for (let k = k0; k < k0 + 6; k++) put(b, r, k, (k === k0 + 1 && r > 0) ? 'wt' : (r % 3 === 1 && k > k0 + 2) ? 'gl' : m); for (let r = 0; r < 3; r++) for (let k = k0 + r; k < k0 + 6 - r; k++) put(b, h + r, k, 'sl'); } return fin(b); } },
  transamerica: { name: 'トランスアメリカ・ピラミッド', make(x) { const b = mk(x, 19, 'wt'), cx = 9; for (let r = 0; r <= 52; r++) { const hw = Math.max(0, Math.round(9 * (1 - r / 54))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r % 2 && Math.abs(k - cx) < hw) ? 'wn' : 'wt'); } for (const s of [-1, 1]) box(b, 30, 38, cx + s * 4, cx + s * 4, 'wt'); box(b, 53, 58, cx, cx, 'wt'); return fin(b); } },
  salesforce: { name: 'セールスフォース・タワー', make(x) { const b = mk(x, 15, 'ls'), cx = 7; for (let r = 0; r <= 60; r++) { const hw = r < 50 ? 7 - Math.floor(r / 25) : Math.max(1, Math.round(6 - (r - 50) * .5)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r >= 52 ? 'ss' : (k - cx) % 2 ? 'gl' : 'ls'); } return fin(b); } },
  meta: { name: 'Meta 本社（屋上の公園）', make(x) { const b = mk(x, 44, 'wt'); for (let r = 0; r <= 8; r++) for (let k = 0; k <= 43; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'gl' : 'wt'); box(b, 9, 9, 0, 43, 'gn'); for (const k of [4, 12, 21, 30, 38]) { box(b, 10, 12, k, k, 'wd'); box(b, 13, 15, k - 2, k + 2, 'gn'); } return fin(b); } },
  googleplex: { name: 'Googleplex', make(x) { const b = mk(x, 34, 'wt'); for (let r = 0; r <= 9; r++) for (let k = 0; k <= 33; k++) put(b, r, k, (r % 3 === 1 && k % 3 !== 0) ? 'gl' : 'wt'); for (const k of [3, 15, 27]) { box(b, 10, 11, k + 1, k + 1, 'wd'); box(b, 12, 15, k - 1, k + 3, 'gn'); } return fin(b); } },
  // ラスベガス（偽物の名所は、ほかの都市の名所と並べて見せる）
  welcome: { name: 'Welcome to Las Vegas の看板', make(x) { const b = mk(x, 15, 'wt'), cx = 7; box(b, 0, 6, 4, 4, 'sl'); box(b, 0, 6, 10, 10, 'sl'); for (let r = 7; r <= 17; r++) { const hw = 7 - Math.abs(r - 12) * .6 | 0; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, Math.abs(k - cx) === hw || r === 7 || r === 17 ? 'rd' : (r === 12 ? 'ny' : 'wt')); } put(b, 18, cx, 'ny'); put(b, 19, cx, 'ny'); return fin(b); } },
  nyny: { name: 'ニューヨーク・ニューヨーク（偽の摩天楼）', make(x) { const b = mk(x, 36, 'ls'); box(b, 0, 3, 0, 35, 'rd'); for (const [k0, w, h, m] of [[1, 6, 22, 'ls'], [8, 5, 30, 'ss'], [14, 7, 38, 'ls'], [22, 5, 26, 'bs'], [28, 7, 20, 'ls']]) for (let r = 4; r <= h; r++) for (let k = k0; k < k0 + w; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'wn' : m); box(b, 39, 43, 17, 17, 'sl'); for (let k = 0; k <= 35; k++) put(b, 4 + Math.round(3 + 3 * Math.sin(k * .5)), k, 'rd'); return fin(b); } },
  parislv: { name: 'パリス・ラスベガスのエッフェル塔（半分の大きさ）', make(x) { return eiffelB(x, 32); } },
  bellagio: { name: 'ベラージオの噴水', make(x) { const b = mk(x, 44, 'sd'), cx = 22; box(b, 0, 1, 0, 43, 'gl'); for (let r = 2; r <= 36; r++) { const hw = Math.round(14 - Math.max(0, r - 22) * .6); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'wn' : 'sd'); } trap(b, 37, 38, cx, 6, 3, 'or'); for (const k of [2, 4, 39, 41]) box(b, 2, 9 + (k % 3), k, k, 'gl'); return fin(b); } },
  caesars: { name: 'シーザーズ・パレス', make(x) { const b = mk(x, 22, 'wt'); for (let r = 0; r <= 4; r++) for (let k = 0; k <= 21; k++) put(b, r, k, k % 3 === 1 ? 'ls' : 'wt'); for (let r = 5; r <= 34; r++) for (let k = 3; k <= 18; k++) put(b, r, k, (r % 2 && k % 3 === 1) ? 'gb' : 'wt'); box(b, 35, 36, 2, 19, 'cr'); return fin(b); } },
};

// ---------- ボス（その都市の、いまの時代の象徴） ----------
// shell=外壁の強度 coreHp=核の強度（象徴だけ上書き） kind=中ボス/象徴 core=核の材質 gim=仕掛け shine=光る材質（glare）
// カード：place=場所 year=できた年など fact=1行の説明 say=鳥の言い分（その街の鳥がしゃべる） after=還ったあと sub=遊び方の説明
// 年や数値は［要確認］のものを含む（01_docs/CITIES_PROPOSAL.md §7）
const BOSS = {
  tsutenkaku: {
    shell: 22, name: '通天閣', kind: '中ボス', core: 'nc', place: '大阪・新世界', year: '1956年（2代目）／103m',
    fact: '新世界の真ん中の鉄塔。胴にネオンの看板を巻いている', say: '「ネオンで夜が来えへん。寝られへんねん」', after: '通天閣は、カラスの見張り台になった', sub: 'ネオンの看板を壊せ',
    make(x) { const b = mk(x, 27, 'tt'), cx = 13;
      for (let r = 0; r < 10; r++) { const kl = 1 + Math.floor(r * .5); box(b, r, r, kl, kl + 2, 'tt'); box(b, r, r, 26 - kl - 2, 26 - kl, 'tt'); }
      box(b, 9, 9, 6, 20, 'tt'); trap(b, 10, 11, cx, 8, 8, 'tt'); trap(b, 12, 38, cx, 4, 4, 'tt'); box(b, 22, 28, cx - 3, cx + 3, 'nc');
      trap(b, 39, 43, cx, 7, 7, 'tt'); box(b, 40, 42, cx - 6, cx + 6, 'gl'); trap(b, 44, 46, cx, 3, 3, 'tt'); trap(b, 47, 49, cx, 1, 0, 'tt'); return fin(b); },
  },
  yumeshima: {
    shell: 18, name: '夢洲', kind: '中ボス', core: 'cs', place: '大阪・夢洲（埋め立て地）', year: '2025年 万博 → カジノ開業予定',
    fact: '万博の木の輪「大屋根リング」の隣に、カジノを含むリゾートが建つ', say: '「輪っかの次はルーレットかいな」', after: '夢洲は、鳥の島になった', sub: '万博の輪の隣にカジノが建つ — 工事中の金の看板を壊せ',
    make(x) { const b = mk(x, 48, 'rw');
      for (let r = 0; r <= 8; r++) for (let k = 0; k <= 28; k++) { if (k % 4 && r % 3) continue; put(b, r, k, 'rw'); }
      box(b, 9, 10, 0, 28, 'rw');
      for (let r = 0; r <= 27; r++) for (let k = 31; k <= 43; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'gl' : 'co');
      box(b, 21, 25, 32, 42, 'cs');
      for (let r = 28; r <= 40; r++) { put(b, r, 37, 'cr'); if (r % 2) put(b, r, 38, 'cr'); }
      box(b, 41, 41, 30, 44, 'cr'); box(b, 42, 42, 36, 38, 'cr'); return fin(b); },
  },
  fucho: {
    shell: 38, coreHp: 90, name: '大阪府咲洲庁舎', kind: '象徴', core: 'kc', out: '庁舎の灯が消えた', place: '大阪・咲洲（埋め立て地）', year: '1995年／256m',
    fact: '元は WTC コスモタワー。埋め立て地に建ち、2010年に府が買い取って庁舎にした', say: '「先に海を埋め立て（reclaim）たんは、そっちや」', after: '咲洲は、干潟に還った', sub: '頂の灯を消し、崩しきれ',
    make(x) { const b = mk(x, 23, 'co'), cx = 11;
      for (let r = 0; r < 6; r++) for (let k = 0; k < 23; k++) put(b, r, k, r % 2 && k % 3 === 1 ? 'gl' : 'co');
      for (let r = 6; r <= 50; r++) for (let k = cx - 7; k <= cx + 7; k++) put(b, r, k, (Math.abs(k - cx) === 7 || r % 5 === 0) ? 'co' : 'gl');
      trap(b, 51, 55, cx, 6, 3, 'kc'); trap(b, 56, 56, cx, 2, 2, 'co'); box(b, 57, 60, cx, cx, 'sl'); return fin(b); },
  },
  roppongi: {
    shell: 22, name: '六本木ヒルズ森タワー', kind: '中ボス', core: 'kc', place: '東京・六本木', year: '2003年／238m',
    fact: 'IT 長者が住み「ヒルズ族」と呼ばれた。頂の近くに展望台と美術館', say: '「見下ろす役は、そろそろ交代だ」', after: '森タワーは、名前のとおり森になった', sub: '頂の展望台の灯を壊せ',
    make(x) { const b = mk(x, 26, 'mt'), cx = 13;
      for (let r = 0; r <= 5; r++) for (let k = 0; k <= 25; k++) put(b, r, k, r === 3 ? 'gl' : 'co');
      for (let r = 6; r <= 47; r++) { const hw = 7 + Math.round(1.6 * Math.sin(Math.PI * (r - 6) / 41)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (r >= 40 && r <= 43) ? 'kc' : (Math.abs(k - cx) === hw || r % 4 === 0) ? 'co' : 'mt'); }
      trap(b, 48, 49, cx, 6, 5, 'mt'); box(b, 50, 53, cx, cx, 'sl'); return fin(b); },
  },
  diet: {
    shell: 26, name: '国会議事堂', kind: '中ボス', core: 'kc', gim: 'slow', place: '東京・永田町', year: '1936年／中央塔 65m',
    fact: '国の決まりごとを決める場所。採決を遅らせる「牛歩戦術」でも知られる', say: '「牛歩で決まらないなら、空で決める」', after: '議事堂の前庭に、草が生い茂った', sub: '牛歩戦術で群れが遅くなる — 止まっている間に、中央塔の頂を壊せ',
    make(x) { const b = mk(x, 50, 'gr'), cx = 25;
      for (let r = 0; r <= 10; r++) for (let k = 0; k <= 49; k++) put(b, r, k, (r % 3 === 1 && k % 3 === 1) ? 'wn' : 'gr');
      box(b, 11, 15, 14, 35, 'gr'); for (let k = 15; k <= 35; k += 3) box(b, 11, 14, k, k, 'wn');
      for (let r = 16; r <= 26; r++) for (let k = cx - 5; k <= cx + 5; k++) put(b, r, k, (r % 3 === 0 && Math.abs(k - cx) % 2 === 1) ? 'wn' : 'gr');
      trap(b, 27, 30, cx, 5, 4, 'gr'); trap(b, 31, 35, cx, 3, 0, 'kc'); return fin(b); },
  },
  tmg: {
    shell: 32, coreHp: 70, name: '東京都庁', kind: '象徴', core: 'kc', gim: 'map', out: '双塔の灯が消えた', place: '東京・新宿', year: '1991年／243m',
    fact: '双子の塔の都庁舎。夜は壁一面にプロジェクションマッピングが映る', say: '「光るビルに、渡りの仲間が何羽ぶつかったと思う」', after: '都庁の双塔に、ツタが絡んだ', sub: '壁の映像が光ると群れの目がくらむ。光る前にタップで散らせ — 2つの頂の灯を消し、崩しきれ',
    make(x) { const b = mk(x, 34, 'gr');
      for (let r = 0; r <= 8; r++) for (let k = 0; k <= 33; k++) put(b, r, k, (r % 2 && k % 2) ? 'wn' : 'gr');
      for (let r = 9; r <= 24; r++) for (let k = 4; k <= 29; k++) put(b, r, k, (r % 2 && k % 3 === 1) ? 'wn' : 'gr');
      for (const k0 of [4, 19]) { for (let r = 25; r <= 44; r++) for (let k = k0; k <= k0 + 10; k++) put(b, r, k, (r % 2 && (k - k0) % 3 === 1) ? 'wn' : 'gr'); box(b, 45, 48, k0 + 2, k0 + 8, 'kc'); }
      return fin(b); },
  },
  t101: {
    shell: 20, name: '台北101', kind: '中ボス', core: 'dm', gim: 'sway', place: '台北・信義区', year: '2004年／508m',
    fact: '竹の節のように8段を積んだ塔。頂の近くに、660トンの制振ダンパーの金の球が吊られている', say: '「あの金の玉、巣にちょうどいい」', after: '101の節から、竹が伸びた', sub: '金の球が揺れると、近くの鳥がはじかれる — 揺れの合間に球を壊せ',
    make(x) { const b = mk(x, 24, 't1'), cx = 12;
      trap(b, 0, 9, cx, 10, 7, 't1');
      for (let i = 0; i < 8; i++) for (let r = 10 + i * 5; r <= 14 + i * 5; r++) { const s = r - 10 - i * 5, hw = 6 + s; for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, s === 4 ? 'co' : 't1'); }
      for (let r = 50; r <= 56; r++) { put(b, r, cx - 5, 't1'); put(b, r, cx + 5, 't1'); } box(b, 56, 56, cx - 5, cx + 5, 't1'); put(b, 55, cx, 'sl');
      for (const [r, hw] of [[51, 1], [52, 2], [53, 2], [54, 1]]) for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, 'dm');
      box(b, 57, 62, cx, cx, 'sl'); return fin(b); },
  },
  tsmc: {
    shell: 14, name: 'TSMC の工場', kind: '中ボス', core: 'pc', gim: 'fan', place: '台湾・新竹', year: '1987年 創業',
    fact: '世界の先端半導体の多くをつくる工場。チップがなければ、スマホも AI も動かない', say: '「世界を回すチップ？ 世界はもともと回ってる」', after: '工場の屋根に、草の種がこぼれた', sub: 'クリーンルームの空調の風が群れを押し返す — 先に屋根のファンを壊し、紫の光を消せ',
    make(x) { const b = mk(x, 50, 'fb');
      for (let r = 0; r <= 13; r++) for (let k = 0; k <= 49; k++) put(b, r, k, r % 5 === 2 ? 'bl' : 'fb');
      for (const k0 of [6, 22, 38]) box(b, 4, 8, k0, k0 + 5, 'pc');
      box(b, 14, 14, 0, 49, 'co'); for (const k0 of [3, 13, 25, 35]) box(b, 15, 16, k0, k0 + 5, 'fan'); box(b, 15, 24, 45, 46, 'ch'); b.roof = 15; return fin(b); },
  },
  maha: {
    shell: 34, coreHp: 100, name: 'キング・パワー・マハナコーン', kind: '象徴', core: 'kc', out: '頂の展望台が消えた', place: 'バンコク・シーロム', year: '2016年／314m',
    fact: 'ピクセルが崩れたような塔。いまの名は「キング・パワー」。頂にガラス床の展望台', say: '「キングは、空に一羽で十分だ」', after: '欠けたマスの一つひとつに、鳥が巣をかけた', sub: '頂のガラスの展望台を壊し、崩しきれ',
    make(x) { const b = mk(x, 20, 'px'), cx = 10;
      for (let r = 0; r <= 65; r++) { const off = Math.round(6 * Math.sin(r * .16)); for (let k = cx - 8; k <= cx + 8; k++) { if (r > 4 && Math.abs(k - cx - off) <= 2) put(b, r, k, hs(r, k) < .55 ? 'pv' : 'gl'); else put(b, r, k, (k === cx - 8 || k === cx + 8 || r % 5 === 0) ? 'co' : 'px'); } }
      box(b, 66, 68, cx - 8, cx + 8, 'kc'); return fin(b); },
  },
  l81: {
    shell: 20, name: 'ランドマーク81', kind: '中ボス', core: 'kc', place: 'ホーチミン・ビンタン', year: '2018年／461m',
    fact: 'ベトナムでいちばん高い塔。竹の束をかたどったという', say: '「束ねて高くしたって、空には届かないよ」', after: '81の足元に、マングローブが戻った', sub: '頂の冠の灯を壊せ',
    make(x) { const b = mk(x, 22, 'l8'); box(b, 0, 3, 0, 21, 'l8');
      for (const [k0, h] of [[1, 40], [5, 52], [9, 62], [13, 56], [17, 44]]) for (let r = 4; r <= h; r++) for (let k = k0; k <= k0 + 3; k++) put(b, r, k, (r % 5 === 0 || k === k0) ? 'co' : 'l8');
      box(b, 59, 62, 9, 12, 'kc'); box(b, 63, 66, 10, 11, 'sl'); return fin(b); },
  },
  petronas: {
    shell: 22, name: 'ペトロナス・ツインタワー', kind: '中ボス', core: 'sc', place: 'クアラルンプール', year: '1998年／452m',
    fact: '1998年から6年、世界一高いビルだった双子の塔。41階と42階を空中の橋が結ぶ', say: '「空の橋は、渡り鳥のものだ」', after: '双子の塔は、つる草でつながった', sub: '空中の連絡橋を落とせ',
    make(x) { const b = mk(x, 40, 'ss');
      for (const k0 of [2, 26]) { for (let r = 0; r <= 60; r++) { const s = r <= 38 ? 0 : r <= 46 ? 1 : r <= 52 ? 2 : r <= 55 ? 3 : 5; for (let k = k0 + s; k <= k0 + 11 - s; k++) put(b, r, k, r % 4 === 0 ? 'gl' : 'ss'); } box(b, 61, 66, k0 + 5, k0 + 6, 'sl'); }
      box(b, 30, 31, 14, 25, 'sc'); for (let i = 0; i < 5; i++) { for (const k of [14 + i, 15 + i, 25 - i, 24 - i]) put(b, 25 + i, k, 'ss'); } return fin(b); },
  },
  mbs: {
    shell: 26, coreHp: 50, name: 'マリーナベイ・サンズ', kind: '象徴', core: 'pl', out: '屋上のプールが干上がった', place: 'シンガポール・マリーナベイ', year: '2010年／3棟 57階',
    fact: '海を埋め立てた土地に建つ3本の塔。屋上に船のような庭と空中のプール、下にはカジノ', say: '「干潟を埋めて、屋上に水たまり。順番が逆だ」', after: 'サンズの屋上は、湿地の鳥の楽園になった', sub: '屋上の空中プールを干上がらせ、崩しきれ',
    make(x) { const b = mk(x, 52, 'mb');
      for (const k0 of [4, 21, 38]) for (let r = 0; r <= 44; r++) for (let k = k0; k <= k0 + 9; k++) put(b, r, k, r % 4 === 0 ? 'co' : (k - k0) % 3 === 1 ? 'gl' : 'mb');
      box(b, 45, 46, 0, 51, 'mb'); box(b, 47, 48, 3, 40, 'pl'); box(b, 47, 49, 42, 50, 'mb'); return fin(b); },
  },
  frame: {
    shell: 18, name: 'ドバイ・フレーム', kind: '中ボス', core: 'gc', gim: 'glare', shine: ['gf', 'gc'], place: 'ドバイ・ザビール公園', year: '2018年／150m',
    fact: '金色の巨大な額縁。片側に古いドバイ、反対側に新しいドバイが収まる', say: '「額に入れたい景色なら、触るな」', after: '額縁の中に、砂漠の花が咲いた', sub: '金がときどき光り、群れの目がくらむ。光る前にタップで散らせ — 頂のガラスの床を壊せ',
    make(x) { const b = mk(x, 34, 'gf');
      for (const k0 of [0, 28]) for (let r = 0; r <= 46; r++) for (let k = k0; k <= k0 + 5; k++) put(b, r, k, r % 6 === 0 ? 'gl' : 'gf');
      box(b, 47, 49, 0, 33, 'gf'); box(b, 50, 51, 4, 29, 'gc'); return fin(b); },
  },
  baa: {
    shell: 20, name: 'ブルジュ・アル・アラブ', kind: '中ボス', core: 'kc', island: 1, place: 'ドバイ・ジュメイラの人工島', year: '1999年／321m',
    fact: '人工島に建つ帆の形のホテル。頂の近くにヘリポートが張り出している', say: '「七つ星だか知らないが、星は夜空のものだ」', after: '帆のホテルは、海鳥の岩場になった', sub: '張り出したヘリポートを壊せ',
    make(x) { const b = mk(x, 30, 'sw');
      box(b, 0, 3, 2, 24, 'sw');
      for (let r = 4; r <= 52; r++) { const m0 = 21 - Math.round(r * r / 900), w = Math.round(17 * Math.sin(Math.PI * Math.min(1, (r + 6) / 62))); for (let k = Math.max(0, m0 - w); k <= m0 + 1; k++) put(b, r, k, k >= m0 ? 'co' : (r % 6 === 0 ? 'co' : 'sw')); }
      box(b, 41, 41, 21, 23, 'sl'); box(b, 42, 43, 21, 27, 'kc'); box(b, 53, 58, 18, 18, 'sl'); return fin(b); },
  },
  khalifa: {
    shell: 36, coreHp: 110, name: 'ブルジュ・ハリファ', kind: '象徴', core: 'kc', out: '尖塔の灯が消えた', place: 'ドバイ・ダウンタウン', year: '2010年／828m',
    fact: '世界一高い建物。砂漠の街の真ん中に、針のように立つ', say: '「渡りの道に、そんなもの立てるな」', after: '足元に、オアシスが広がった', sub: '尖塔の先の灯を消し、崩しきれ',
    make(x) { const b = mk(x, 30, 'bh'), cx = 15; let r = 0;
      for (const [top, hl, hr] of [[12, 14, 14], [21, 12, 13], [29, 10, 11], [36, 8, 9], [42, 6, 7], [47, 5, 5], [51, 3, 4], [54, 2, 2], [57, 1, 1]]) for (; r <= top; r++) for (let k = cx - hl; k <= cx + hr - 1; k++) put(b, r, k, r % 5 === 0 ? 'ss' : 'bh');
      box(b, 58, 64, cx - 1, cx, 'kc'); return fin(b); }, // 尖塔の先が画面上の HUD に隠れない高さにする
  },
  abbey: {
    shell: 16, name: 'アビー・ロード・スタジオ', kind: '中ボス', core: 'rc', deco: 'zebra', place: 'ロンドン・セント・ジョンズ・ウッド', year: '1931年',
    fact: '世界一有名な横断歩道の前に建つ録音スタジオ', say: '「あの横断歩道、渡るのは4人じゃない。鳥だ」', after: 'スタジオの屋根で、鳥が歌いはじめた', sub: '録音中の赤いランプを消せ',
    make(x) { const b = mk(x, 32, 'wh');
      for (let r = 0; r < 12; r++) for (let k = 2; k <= 29; k++) put(b, r, k, ((r === 3 || r === 4 || r === 8 || r === 9) && k % 4 === 1) ? 'gl' : 'wh');
      box(b, 0, 1, 13, 18, 'ls'); box(b, 5, 8, 13, 18, 'rc'); box(b, 12, 12, 1, 30, 'wh'); trap(b, 13, 14, 16, 12, 10, 'sl'); return fin(b); },
  },
  walkie: {
    shell: 18, name: 'ウォーキートーキー', kind: '中ボス', core: 'kc', gim: 'beam', place: 'ロンドン・シティ', year: '2014年／160m',
    fact: '上ほど太いガラスの塔。完成前、反射光で路上の車の部品を溶かした', say: '「車を溶かした光で、今度は俺らを焼く気か」', after: 'ガラスの塔は、苔の崖になった', sub: '曲面の反射光が群れを焼く。光の輪から逃げろ — 頂の庭の灯を壊せ',
    make(x) { const b = mk(x, 25, 'bl'), cx = 12;
      for (let r = 0; r <= 33; r++) { const hw = Math.round(6 + 6 * Math.pow(r / 33, 1.6)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (Math.abs(k - cx) === hw || r % 6 === 0) ? 'co' : 'bl'); }
      trap(b, 34, 34, cx, 12, 12, 'co'); box(b, 35, 37, cx - 10, cx + 10, 'kc'); for (const k of [cx - 11, cx + 11]) box(b, 35, 37, k, k, 'co'); trap(b, 38, 39, cx, 11, 10, 'co'); return fin(b); },
  },
  battersea: {
    shell: 26, coreHp: 40, name: 'バタシー発電所', kind: '象徴', core: 'fc', out: '炉の火が消えた', smoke: 1, place: 'ロンドン・テムズ河岸', year: '1930年代／煙突 4本',
    fact: '石炭の発電所。1983年に止まり、いまは店と大企業の事務所が入る', say: '「燃やすのをやめて、今度は何を売る」', after: '煙突に、ハヤブサが巣をかけた', sub: '屋根の上の炉の火を消し、崩しきれ',
    make(x) { const b = mk(x, 50, 'rb');
      for (let r = 0; r < 24; r++) for (let k = 0; k < 50; k++) put(b, r, k, (k % 5 === 2 && r >= 6 && r <= 18) ? 'gl' : 'rb');
      box(b, 24, 27, 12, 37, 'rb'); box(b, 22, 27, 19, 30, 'fc');
      for (const k0 of [1, 6, 40, 45]) box(b, 24, 44, k0, k0 + 3, 'ch'); b.stacks = [1, 6, 40, 45]; return fin(b); },
  },
  rock: {
    shell: 22, name: 'ロックフェラー・センター', kind: '中ボス', core: 'gc', place: 'ニューヨーク・ミッドタウン', year: '1930年代／259m',
    fact: '石油王の名を冠した摩天楼の街。冬は前にスケート場と大きなツリーが出る', say: '「石油の金で建てた塔か。燃え尽きる前に還してやる」', after: '摩天楼の屋上が、草原になった', sub: '頂の金の展望台を壊せ',
    make(x) { const b = mk(x, 25, 'ls'), cx = 12, sl = (r, hw) => { for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (k - cx + 20) % 2 ? 'wn' : 'ls'); };
      box(b, 0, 9, 0, 24, 'ls'); for (let r = 10; r <= 29; r++) sl(r, 7); for (let r = 30; r <= 39; r++) sl(r, 6); for (let r = 40; r <= 45; r++) sl(r, 5);
      box(b, 46, 49, cx - 4, cx + 4, 'gc'); box(b, 50, 50, cx - 2, cx + 2, 'gc'); return fin(b); },
  },
  goldtower: {
    shell: 20, name: 'トランプ・タワー', kind: '中ボス', core: 'gc', gim: 'glare', shine: ['gd', 'gc'], place: 'ニューヨーク・五番街', year: '1983年／202m',
    fact: '金色のガラスに包まれた、大統領の名を冠した塔', say: '「金の鏡張り。映るのは自分だけ」', after: '金の塔は、ただの緑の崖になった', sub: 'ガラスが光ると群れの目がくらむ。光る前にタップで散らせ — 頂の金を壊せ',
    make(x) { const b = mk(x, 21, 'gd'), cx = 6;
      for (let r = 0; r <= 14; r++) box(b, r, r, cx + 7, cx + 14 - Math.floor(r / 3), 'gd');
      for (let r = 0; r <= 55; r++) for (let k = cx - 6; k <= cx + 6; k++) put(b, r, k, r % 4 === 3 ? 'wn' : 'gd');
      box(b, 50, 55, cx - 5, cx + 5, 'gc'); box(b, 56, 56, cx - 6, cx + 6, 'gd'); return fin(b); },
  },
  liberty: {
    shell: 36, coreHp: 120, name: '自由の女神', kind: '象徴', core: 'tc', out: '松明が消えた', island: 1, place: 'ニューヨーク・リバティ島', year: '1886年／93m（台座込み）',
    fact: '港の島に立ち、松明を掲げる像', say: '「自由なら、空の俺らが先輩だ」', after: '女神の冠に、カモメが並んだ', sub: '掲げた松明を消し、崩しきれ',
    make(x) { const b = mk(x, 41, 'fs'), cx = 20;
      for (let r = 0; r <= 5; r++) for (let k = 0; k <= 40; k++) { if (r >= 4 && k % 8 < 2) continue; put(b, r, k, 'fs'); }
      trap(b, 6, 8, cx, 13, 13, 'ps'); for (let r = 9; r <= 22; r++) for (let k = cx - 10; k <= cx + 10; k++) put(b, r, k, (r >= 14 && r <= 18 && Math.abs(Math.abs(k - cx) - 4) < 1) ? 'wn' : 'ps');
      trap(b, 23, 25, cx, 11, 11, 'ps'); trap(b, 26, 27, cx, 6, 6, 'cu'); trap(b, 28, 43, cx, 6, 4, 'cu'); box(b, 35, 41, cx + 5, cx + 7, 'cu');
      trap(b, 44, 45, cx, 4, 4, 'cu'); box(b, 46, 46, cx - 1, cx + 1, 'cu'); trap(b, 47, 50, cx, 2, 2, 'cu'); trap(b, 51, 51, cx, 3, 3, 'cu');
      for (const k of [cx - 3, cx - 1, cx + 1, cx + 3]) box(b, 52, 53, k, k, 'cu');
      for (let r = 44; r <= 56; r++) { const k = cx - 4 - Math.floor((r - 44) / 6); box(b, r, r, k - 1, k, 'cu'); }
      const tx = cx - 6; trap(b, 57, 57, tx, 2, 2, 'tc'); trap(b, 58, 58, tx, 2, 2, 'tc'); trap(b, 59, 60, tx, 1, 1, 'tc'); put(b, 61, tx, 'tc'); return fin(b); },
  },
  // ---- 第2弾 ----
  tesla: {
    shell: 16, name: 'テスラのギガファクトリー', kind: '中ボス', core: 'ev', place: 'ドイツ・ベルリン郊外グリューンハイデ', year: '2022年 操業',
    fact: '松林を切り開いて建てた、電気自動車の巨大な工場', say: '「森を切って“緑の車”？ 計算が合わない」', after: '工場の跡に、松林が戻った', sub: '屋根の上の充電の光を消せ',
    make(x) { const b = mk(x, 52, 'tw');
      for (let r = 0; r <= 12; r++) for (let k = 0; k <= 51; k++) put(b, r, k, r % 5 === 2 ? 'bl' : 'tw');
      box(b, 13, 13, 0, 51, 'co'); for (let r = 14; r <= 22; r++) for (let k = 38; k <= 51; k++) put(b, r, k, (r % 3 === 1 && k % 2) ? 'gl' : 'tw');
      box(b, 14, 17, 6, 17, 'ev'); box(b, 14, 15, 22, 33, 'pv'); return fin(b); },
  },
  dbank: {
    shell: 22, name: 'ドイツ銀行ツインタワー', kind: '中ボス', core: 'kc', place: 'ドイツ・フランクフルト', year: '1984年／155m',
    fact: '鏡のガラスの双子の塔。あだ名は「借方と貸方」', say: '「貸し借りの帳尻、いま合わせる」', after: '双子の塔にツタが絡み、帳尻が合った', sub: '借方と貸方、2つの頂の灯を両方消せ',
    make(x) { const b = mk(x, 34, 'dg');
      for (let r = 0; r <= 5; r++) for (let k = 0; k <= 33; k++) put(b, r, k, r % 2 ? 'gl' : 'co');
      for (const k0 of [2, 20]) { for (let r = 6; r <= 50; r++) for (let k = k0; k <= k0 + 11; k++) put(b, r, k, (k === k0 + 3 || k === k0 + 8) ? 'mg' : r % 6 === 0 ? 'ss' : 'dg'); box(b, 51, 53, k0 + 2, k0 + 9, 'kc'); }
      return fin(b); },
  },
  ecb: {
    shell: 34, coreHp: 100, name: '欧州中央銀行', kind: '象徴', core: 'eu', out: 'ユーロの灯が消えた', place: 'ドイツ・フランクフルト（マイン川のほとり）', year: '2014年／185m',
    fact: 'ユーロの金利を決める中央銀行。古い卸売市場の上に、ねじれた双子の塔が建つ', say: '「金の流れより、川の流れ」', after: 'マイン川の岸に、ヨシ原が戻った', sub: '頂のユーロの灯を消し、崩しきれ',
    make(x) { const b = mk(x, 54, 'eg');
      for (let r = 0; r <= 9; r++) for (let k = 0; k <= 53; k++) put(b, r, k, (r >= 2 && r <= 7 && k % 4 === 1) ? 'gl' : 'br');
      for (let r = 10; r <= 60; r++) { const s = Math.round((r - 10) * .08); for (let k = 14 + s; k <= 25; k++) put(b, r, k, r % 5 === 0 ? 'ss' : 'eg'); for (let k = 26; k <= 29; k++) put(b, r, k, r % 8 === 0 ? 'ss' : 'gl'); for (let k = 30; k <= 41 - s; k++) put(b, r, k, r % 5 === 0 ? 'ss' : 'eg'); }
      box(b, 61, 63, 20, 35, 'eu'); return fin(b); },
  },
  arche: {
    shell: 18, name: 'グランダルシュ', kind: '中ボス', core: 'kc', place: 'パリ・ラ・デファンス', year: '1989年／110m',
    fact: 'ビジネス街ラ・デファンスの端に建つ、真ん中が空っぽの巨大な立方体の門。穴には「雲」と呼ばれる白い屋根が吊られている', say: '「真ん中が空っぽの門。金も人も、すり抜けていく」', after: '門の穴を、渡り鳥の群れが通り抜けた', sub: '頂の屋上の灯を壊せ',
    make(x) { const b = mk(x, 40, 'ch');
      box(b, 0, 2, 0, 39, 'ch');
      for (let r = 3; r <= 33; r++) for (const k0 of [0, 34]) for (let k = k0; k <= k0 + 5; k++) put(b, r, k, (r % 3 === 1 && (k - k0) % 2) ? 'gl' : 'ch');
      for (let r = 34; r <= 39; r++) for (let k = 0; k <= 39; k++) put(b, r, k, (r % 2 && k % 3 === 1) ? 'gl' : 'ch');
      box(b, 12, 14, 9, 30, 'fv'); for (const k of [12, 27]) box(b, 15, 33, k, k, 'sl'); box(b, 39, 40, 12, 27, 'kc'); return fin(b); },
  },
  flv: {
    shell: 18, name: 'ルイ・ヴィトン財団', kind: '中ボス', core: 'kc', gim: 'gust', place: 'パリ・ブローニュの森', year: '2014年',
    fact: 'ラグジュアリーの巨大企業が、森の中に建てた美術館。ガラスの帆をまとった船の形', say: '「森にガラスの船を泊めるな。帆は風のものだ」', after: '帆の骨組みに、森のツタが登った', sub: 'ガラスの帆が風を起こし、群れを押し戻す — 風がやんだ隙に、帆の頂の灯を壊せ',
    make(x) { const b = mk(x, 46, 'wt');
      for (let r = 0; r <= 18; r++) for (let k = 6; k <= 39; k++) put(b, r, k, (r % 4 === 2 && k % 3 === 1) ? 'gl' : 'wt');
      const sail = (cx, r0, r1, hm) => { for (let r = r0; r <= r1; r++) { const hw = Math.round(hm * Math.sin(Math.PI * (r - r0) / (r1 - r0))); for (let k = Math.max(0, cx - hw); k <= Math.min(45, cx + hw); k++) put(b, r, k, (k + r) % 5 === 0 ? 'ss' : 'fv'); } };
      sail(10, 8, 26, 9); sail(37, 6, 24, 8); sail(24, 12, 34, 11); for (const q of [...b.cells.values()]) if (q.r >= 30 && q.k >= 17 && q.k <= 31) put(b, q.r, q.k, 'kc'); return fin(b); },
  },
  montecarlo: {
    shell: 30, coreHp: 90, name: 'カジノ・ド・モンテカルロ', kind: '象徴', core: 'gc', out: '金の飾りが落ちた', place: 'モナコ・モンテカルロ', year: '1863年 開業',
    fact: '税の避難所として知られる小さな国の、宮殿のようなカジノ', say: '「税の避難所はあっても、鳥の避難所はない」', after: 'カジノの屋根は、カモメの見晴らし台になった', sub: '屋根の上の金の飾りを落とし、崩しきれ',
    make(x) { const b = mk(x, 50, 'cb'), cx = 25;
      for (let r = 0; r <= 16; r++) for (let k = 0; k <= 49; k++) put(b, r, k, (r >= 3 && r <= 12 && k % 4 === 2) ? 'gl' : r === 16 ? 'gf' : 'cb');
      for (let r = 17; r <= 26; r++) for (let k = 16; k <= 33; k++) put(b, r, k, (r % 4 === 1 && k % 3 === 1) ? 'gl' : 'cb');
      trap(b, 27, 30, cx, 9, 5, 'cu'); trap(b, 31, 34, cx, 5, 2, 'gc');
      for (const k0 of [2, 41]) { for (let r = 17; r <= 32; r++) for (let k = k0; k <= k0 + 6; k++) put(b, r, k, (r % 4 === 1 && (k - k0) % 2) ? 'gl' : 'cb'); trap(b, 33, 37, k0 + 3, 3, 0, 'cu'); }
      return fin(b); },
  },
  glories: {
    shell: 18, name: 'トッレ・グローリエス', kind: '中ボス', core: 'nc', place: 'バルセロナ・グローリエス', year: '2005年／144m',
    fact: '水道会社の本社として建った弾丸形の塔。夜は外壁の LED が色を変える', say: '「水道会社の塔なら、まず水浴び場を作れ」', after: '弾丸の塔に、インコの大きな共同の巣がかかった', sub: '頂の光るドームを壊せ',
    make(x) { const b = mk(x, 17, 'gb'), cx = 8, P = ['rd', 'or', 'gb', 'pu', 'gl'];
      for (let r = 0; r <= 46; r++) { const hw = r < 30 ? 8 : Math.round(8 * Math.sqrt(Math.max(0, 1 - ((r - 30) / 17) ** 2))); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r >= 40 ? 'nc' : P[Math.floor(hs(r >> 2, k >> 1) * 5)]); }
      return fin(b); },
  },
  kio: {
    shell: 20, name: 'プエルタ・デ・エウローパ', kind: '中ボス', core: 'kc', place: 'マドリード・カスティーリャ広場', year: '1996年／114m',
    fact: '内側へ15度ずつ傾き、門のように向き合う双子の塔', say: '「傾いてまで寄り合って、何の相談だ」', after: '傾いた塔は、インコの滑り台になった', sub: '傾いた2本の塔の頂の灯を壊せ — 根元を削れば、塔ごと倒れる',
    make(x) { const b = mk(x, 48, 'mt');
      for (let r = 0; r <= 48; r++) { const s = Math.round(r * .27); for (let i = 0; i <= 9; i++) { const m = r >= 45 ? 'kc' : (r % 4 === 0 || i === 0 || i === 9) ? 'ss' : 'mt'; put(b, r, s + i, m); put(b, r, 47 - s - i, m); } }
      return fin(b); },
  },
  bernabeu: {
    shell: 28, coreHp: 90, name: 'サンティアゴ・ベルナベウ', kind: '象徴', core: 'sc', out: '巨大画面が消えた', place: 'スペイン・マドリード', year: '1947年 → 2024年 改装',
    fact: 'サッカーの殿堂。改装で銀の金属の皮と、閉じる屋根と、ぐるりと一周する巨大画面をまとった', say: '「芝生は鳥の食堂だ。屋根で閉じるな」', after: '芝生に、鳥の大群が降りた', sub: '屋根の上の巨大画面を消し、崩しきれ',
    make(x) { const b = mk(x, 54, 'ss');
      for (let r = 0; r <= 22; r++) for (let k = 0; k <= 53; k++) put(b, r, k, (r + Math.floor(k / 5)) % 4 === 0 ? 'pv' : 'ss');
      for (const k0 of [0, 47]) box(b, 23, 28, k0, k0 + 6, 'ss'); box(b, 23, 24, 7, 46, 'ss'); box(b, 25, 27, 16, 37, 'sc'); return fin(b); },
  },
  msft: {
    shell: 18, name: 'マイクロソフト本社', kind: '中ボス', core: 'kc', gim: 'glare', shine: ['bl', 'kc'], place: 'アメリカ・レドモンド', year: '1986年 移転',
    fact: 'パソコンの「窓」を世界に売った会社の、森の中の広い本社', say: '「窓を売るなら、鳥がぶつからない窓にしろ」', after: 'ガラスの壁に、ツタが這った', sub: 'ガラスが光ると群れの目がくらむ。光る前にタップで散らせ — 屋上の灯を壊せ',
    make(x) { const b = mk(x, 44, 'bl');
      for (let r = 0; r <= 4; r++) for (let k = 0; k <= 43; k++) put(b, r, k, r === 4 || k % 3 === 0 ? 'co' : 'bl');
      for (const [k0, k1, h] of [[2, 15, 22], [16, 29, 28], [30, 41, 18]]) for (let r = 5; r <= h; r++) for (let k = k0; k <= k1; k++) put(b, r, k, (r % 4 === 0 || k === k0 || k === k1) ? 'co' : 'bl');
      box(b, 29, 32, 18, 27, 'kc'); return fin(b); },
  },
  boeing: {
    shell: 16, name: 'ボーイングのエバレット工場', kind: '中ボス', core: 'kc', place: 'アメリカ・エバレット', year: '1967年',
    fact: '体積で世界一大きい建物。ここで旅客機を組み立てる', say: '「鉄の鳥をつくる工場か。本物の鳥に、あいさつはまだか」', after: '格納庫は、鳥の大きなねぐらになった', sub: '扉から出てくる旅客機の灯を壊せ',
    make(x) { const b = mk(x, 54, 'fb');
      for (let r = 0; r <= 20; r++) for (let k = 0; k <= 39; k++) put(b, r, k, (k >= 6 && k <= 37 && r <= 16) ? ((k - 6) % 6 === 0 ? 'co' : 'gb') : r % 5 === 4 ? 'co' : 'fb');
      for (let r = 21; r <= 24; r++) for (let k = r - 21; k <= 39 - (r - 21); k++) put(b, r, k, 'co');
      box(b, 0, 2, 44, 44, 'sl'); box(b, 0, 2, 30, 30, 'sl'); box(b, 3, 5, 24, 39, 'wt'); box(b, 3, 5, 40, 51, 'kc'); box(b, 4, 4, 52, 53, 'kc'); return fin(b); },
  },
  spheres: {
    shell: 23, coreHp: 90, name: 'アマゾンのスフィア', kind: '象徴', core: 'pk', out: '球の森が解き放たれた', place: 'アメリカ・シアトル', year: '2018年',
    fact: '物流の巨大企業の本社に建つ3つのガラスの球。中に世界じゅうの植物を閉じ込めている', say: '「森をガラス玉に閉じ込めて、社員の癒やし？ 出してやる」', after: '閉じ込められた森が、街じゅうに広がった', sub: '大きな球の頂からあふれる森の光を解き放ち、崩しきれ',
    make(x) { const b = mk(x, 56, 'ss'); box(b, 0, 1, 0, 55, 'co');
      for (const [ck, cr, R] of [[11, 12, 11], [29, 17, 16], [46, 11, 10]]) for (let r = 2; r <= cr + R; r++) for (let k = ck - R; k <= ck + R; k++) { const d = Math.hypot(k - ck, r - cr); if (d > R + .3 || k < 0 || k > 55) continue; put(b, r, k, (d > R - 1.3 || (k + r) % 5 === 0 || (k - r + 60) % 5 === 0) ? 'ss' : (r < cr ? 'gn' : 'gl')); }
      for (const q of [...b.cells.values()]) if (q.r >= 31 && Math.hypot(q.k - 29, q.r - 17) <= 16.3) put(b, q.r, q.k, 'pk'); return fin(b); },
  },
  cloud: {
    shell: 14, name: 'グーグルのデータセンター', kind: '中ボス', core: 'sc', gim: 'fan', place: 'アメリカのどこか（場所は出さない）', year: '24時間 止まらない',
    fact: '検索と動画とクラウドを支える巨大な計算機の倉庫。冷却に大量の水を使う', say: '「川の水、借りっぱなしだろ」', after: '冷却塔に、ツバメが巣をかけた', sub: '冷却ファンの風が群れを押し返す — 先にファンを壊せ',
    make(x) { const b = mk(x, 46, 'sv');
      for (let r = 0; r < 16; r++) for (let k = 0; k < 46; k++) put(b, r, k, r % 4 === 2 ? 'bl' : 'sv');
      for (const k0 of [7, 21, 35]) box(b, 4, 8, k0, k0 + 3, 'sc');
      box(b, 16, 16, 0, 45, 'co'); for (const k0 of [4, 14, 26, 36]) box(b, 17, 18, k0, k0 + 5, 'fan'); b.roof = 17; return fin(b); },
  },
  nvidia: {
    shell: 22, name: 'エヌビディア本社', kind: '中ボス', core: 'ai', place: 'アメリカ・サンタクララ', year: '2022年（新しい棟）',
    fact: 'AI の計算に欠かせない半導体の会社。三角形を敷き詰めた本社に、世界のお金が集まる', say: '「AI の王様？ 群れの知恵は、こっちが何千万年も先だ」', after: '三角の天窓から、木が伸びた', sub: '屋根の緑の三角を壊せ',
    make(x) { const b = mk(x, 52, 'nv'), cx = 26;
      for (let r = 0; r <= 12; r++) for (let k = 0; k <= 51; k++) put(b, r, k, (r % 4 === 2 && k % 2) ? 'gl' : 'nv');
      for (let r = 13; r <= 20; r++) { const hw = Math.round(25 - (r - 13) * 2.4); for (let k = cx - hw; k <= cx + hw - 1; k++) put(b, r, k, Math.abs(((k + 100) % 8) - 4) < (r - 12) * .5 ? 'gl' : 'nv'); }
      trap(b, 21, 25, cx, 6, 1, 'ai'); return fin(b); },
  },
  apple: {
    shell: 32, coreHp: 100, name: 'アップル・パーク', kind: '象徴', core: 'kc', out: '宇宙船の灯が消えた', place: 'アメリカ・クパチーノ', year: '2017年',
    fact: '一周およそ1.6kmの、輪の形の本社。「宇宙船」と呼ばれる', say: '「宇宙船なら、宇宙へ帰れ」', after: '輪の中庭が、本物の森になった', sub: '宇宙船の頂の灯を消し、崩しきれ',
    make(x) { const b = mk(x, 56, 'wt'), cx = 28;
      for (let r = 0; r <= 18; r++) { const hw = Math.round(27 - 9 * ((r - 9) / 9) ** 2); for (let k = cx - hw; k <= cx + hw - 1; k++) put(b, r, k, r % 4 === 0 ? 'wt' : (r === 9 || r === 10) ? 'gn' : 'gl'); }
      trap(b, 19, 20, cx, 16, 12, 'pv'); trap(b, 21, 25, cx, 7, 2, 'kc'); return fin(b); },
  },
  luxor: {
    shell: 20, name: 'ルクソール', kind: '中ボス', core: 'bm', gim: 'pillar', place: 'ラスベガス・ストリップ', year: '1993年／107m',
    fact: 'ピラミッド形のホテル。頂から夜空へ強い光の柱を放つ。虫が集まり、それを食べにコウモリも来る', say: '「虫を集めてくれて、ありがとう。でも壊す」', after: 'ピラミッドは、ただの砂の山になった', sub: '頂から光の柱が立ち、柱の中の鳥は焼かれる — 柱が消えた隙に頂を壊せ',
    make(x) { const b = mk(x, 53, 'lx'), cx = 26;
      for (let r = 0; r <= 33; r++) { const hw = Math.round(26 * (1 - r / 34)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, r >= 27 ? 'bm' : ((k - cx + r) % 6 === 0 || (cx - k + r) % 6 === 0) ? 'mt' : 'lx'); }
      return fin(b); },
  },
  strat: {
    shell: 18, name: 'ザ・ストラット', kind: '中ボス', core: 'rc', place: 'ラスベガス', year: '1996年／350m',
    fact: '頂に絶叫マシンを載せた展望塔。アメリカ西部でいちばん高い塔', say: '「宙づりで叫ぶのが遊び？ こっちは毎日飛んでる」', after: '塔の頂で、鳥たちが静かに眠った', sub: '頂の絶叫マシンを壊せ',
    make(x) { const b = mk(x, 21, 'co'), cx = 10;
      for (let r = 0; r <= 8; r++) for (const s of [-1, 1]) { const k = cx + s * (6 - Math.floor(r * .6)); box(b, r, r, Math.min(k, k - s), Math.max(k, k - s), 'co'); }
      box(b, 0, 52, cx - 1, cx + 1, 'co'); trap(b, 53, 55, cx, 4, 7, 'wt'); box(b, 56, 58, cx - 7, cx + 7, 'gl'); trap(b, 59, 59, cx, 7, 5, 'wt');
      box(b, 60, 63, cx - 1, cx + 1, 'sl'); box(b, 60, 60, cx - 9, cx + 9, 'rc'); box(b, 61, 63, cx - 9, cx - 8, 'rc'); box(b, 61, 63, cx + 8, cx + 9, 'rc'); box(b, 63, 64, cx - 3, cx + 3, 'rc'); return fin(b); },
  },
  sphere: {
    shell: 20, coreHp: 70, name: 'スフィア', kind: '象徴', core: 'ey', gim: 'eye', out: '目玉の光が消えた', place: 'ラスベガス', year: '2023年／112m',
    fact: '外側が全部 LED の球形の劇場。巨大な目玉や顔の映像で、街を見下ろす', say: '「見つめるのは、鳥の仕事だ」', after: '光の球が消え、砂漠の夜空に星が戻った', sub: '目玉に見つめられた鳥は固まる。目が開く前にタップで離れろ — 瞳を壊し、崩しきれ',
    make(x) { const b = mk(x, 52, 'sp'), cx = 26, cy = 27, R = 25;
      box(b, 0, 2, 16, 35, 'co');
      for (let r = 3; r <= cy + R; r++) for (let k = 0; k <= 51; k++) { if (Math.hypot(k - cx + .5, r - cy) <= R) put(b, r, k, Math.hypot(k - cx + .5, r - cy - 18) < 4.4 ? 'ey' : 'sp'); }
      b.eye = [cx - .5, cy + 18]; return fin(b); }, // 2D では球の中心は四方を囲まれるので、瞳は上のほうに置く（空の鳥を見上げる目）
  },
};

// ---------- 鳥 ----------
// 最初からいる群れはムクドリ。都市ごとに、その土地の鳥が合流する。還した都市の鳥は、次の都市から旅の仲間として 10 羽ずつ混じる
const BIRD = {
  base: { name: 'ムクドリ', col: '#15181D', s: 7, hp: 0, am: 1 },
  crow: { name: 'ハシブトガラス', note: '体力 +1', col: '#07080A', s: 8, hp: 1, am: 1, wn: 1 },
  kite: { name: 'トビ', note: '威力 ×1.3', col: '#3A2E26', s: 9.5, hp: 0, am: 1.3, wn: .8 },
  myna: { name: 'インドハッカ', note: '体力 +1', col: '#2A2420', s: 7, hp: 1, am: 1, wn: 1.1 },
  hcrow: { name: 'イエガラス', note: '合流の数 ×1.3', col: '#1A1A1E', s: 8, hp: 0, am: 1, wn: 1.3 },
  falcon: { name: 'ハヤブサ', note: '威力 ×2', col: '#4A4E58', s: 8.5, hp: 0, am: 2, wn: .6 },
  raven: { name: 'ワタリガラス', note: '威力 ×1.5', col: '#1D1A24', s: 9, hp: 0, am: 1.5, wn: .9 },
  pigeon: { name: 'ドバト', note: '合流の数 ×1.3', col: '#5C6672', s: 6.5, hp: 0, am: 1, wn: 1.3 },
  jackdaw: { name: 'ニシコクマルガラス', note: '威力 ×1.2・合流 ×1.2', col: '#26272E', s: 7, hp: 0, am: 1.2, wn: 1.2 },
  gull: { name: 'カモメ', note: '体力 +1', col: '#7E8690', s: 9, hp: 1, am: 1, wn: .9 },
  parakeet: { name: 'オキナインコ', note: '合流の数 ×1.5', col: '#3F7A3C', s: 6.5, hp: 0, am: 1, wn: 1.5 },
  amcrow: { name: 'アメリカガラス', note: '体力 +1', col: '#0B0C10', s: 8, hp: 1, am: 1, wn: 1 },
  pelican: { name: 'カッショクペリカン', note: '威力 ×1.8', col: '#5A5048', s: 11, hp: 0, am: 1.8, wn: .6 },
  grackle: { name: 'オナガクロムクドリモドキ', note: '合流の数 ×1.4', col: '#141430', s: 7.5, hp: 0, am: 1, wn: 1.4 },
};

// その国のあいさつ（到着のカードと、国境を越えた時に出す）
const HELLO = {
  日本: ['ようこそ', '日本語'], 台湾: ['歡迎（ホアンイン）', '台湾華語'], タイ: ['サワッディー', 'タイ語'], ベトナム: ['シンチャオ', 'ベトナム語'],
  マレーシア: ['スラマッ・ダタン', 'マレー語'], シンガポール: ['ウェルカム', '英語'], アラブ首長国連邦: ['マルハバ', 'アラビア語'], イギリス: ['ウェルカム', '英語'], アメリカ: ['ウェルカム', '英語'],
  ドイツ: ['ヴィルコメン', 'ドイツ語'], フランス: ['ビアンヴニュ', 'フランス語'], モナコ: ['ビアンヴニュ', 'フランス語'], スペイン: ['ビエンベニード', 'スペイン語'],
};

// ---------- 都市 ----------
// zones: x=始まる位置 n=区間名 c=国（国をまたぐ都市だけ） rain=その区間だけ雨 g=[[建物, 割合]...] sil=遠景の街並みの高さ[基準, 幅]
// lm: [[位置, 名所]...]  via: 国をまたぐ都市の通り道（地図に線を引く）  tz: 到着のカードに出す現地時刻
// sky: [昼, 夕] の [上, 中, 地平] の色
const STAGES = [
  {
    id: 'osaka', city: '大阪', en: 'OSAKA', country: '日本', lat: 34.69, lon: 135.5, tz: 'Asia/Tokyo', weather: 'くもり', hp: 1, bird: 'crow',
    sky: [[[150, 160, 176], [196, 196, 200], [228, 218, 204]], [[60, 56, 86], [170, 120, 122], [246, 168, 108]]], ground: ['#545A60', '#2E3238'],
    zones: [{ x: 0, n: '道頓堀', g: [['shop', .55], ['brick', .25], ['house', .2]], sil: [12, 22] }, { x: 1500, n: '新世界', g: [['shop', .75], ['brick', .25]], sil: [16, 24] },
      { x: 3300, n: '大阪城・梅田', g: [['glass', .55], ['tower', .45]], sil: [40, 60] }, { x: 4500, n: '湾岸', g: [['ware', .5], ['pylon', .3], ['glass', .2]], sil: [14, 30] },
      { x: 6300, n: '夢洲・咲洲', g: [['glass', .6], ['ware', .4]], sil: [30, 50] }],
    bosses: [{ x: 2700, id: 'tsutenkaku' }, { x: 5600, id: 'yumeshima' }], final: 'fucho',
    lm: [[700, 'glico'], [1150, 'kani'], [2050, 'harukas'], [3500, 'oskcastle'], [4000, 'umedasky'], [4700, 'kaiyukan']], end: '大阪は、自然に還った。',
  },
  {
    id: 'tokyo', city: '東京', en: 'TOKYO', country: '日本', lat: 35.68, lon: 139.69, tz: 'Asia/Tokyo', weather: '晴れ', hp: 1.05, bird: 'kite',
    sky: [[[132, 168, 204], [188, 206, 222], [226, 228, 226]], [[44, 48, 84], [150, 110, 130], [244, 160, 110]]], ground: ['#50555C', '#2C3036'],
    zones: [{ x: 0, n: '渋谷', g: [['zakkyo', .6], ['glass', .4]], sil: [30, 40] }, { x: 1500, n: '六本木', g: [['glass', .5], ['tower', .3], ['zakkyo', .2]], sil: [40, 60] },
      { x: 3700, n: '永田町', g: [['stone', .6], ['tower', .4]], sil: [30, 40] }, { x: 5100, n: '丸の内', g: [['stone', .5], ['glass', .5]], sil: [40, 60] },
      { x: 6000, n: '押上', g: [['zakkyo', .6], ['house', .4]], sil: [16, 24] }, { x: 6700, n: '新宿', g: [['sky', .6], ['glass', .4]], sil: [60, 80] }],
    bosses: [{ x: 2600, id: 'roppongi' }, { x: 4300, id: 'diet' }], final: 'tmg',
    lm: [[800, 'shibuya109'], [1800, 'tokyotower'], [5300, 'tokyostation'], [5700, 'boj'], [6250, 'skytree']], end: '東京は、自然に還った。',
  },
  {
    id: 'taipei', city: '台北〜バンコク', en: 'TAIPEI → BANGKOK', country: '台湾・タイ', lat: 25.03, lon: 121.56, via: [[13.75, 100.5]], tz: 'Asia/Taipei', weather: '蒸し暑い', hp: 1.05, bird: 'myna',
    sky: [[[150, 178, 196], [200, 212, 214], [236, 226, 206]], [[56, 48, 80], [176, 112, 110], [250, 170, 96]]], ground: ['#585A58', '#30322F'],
    zones: [{ x: 0, n: '西門町', c: '台湾', g: [['arcade', .7], ['zakkyo', .3]], sil: [20, 30] }, { x: 1500, n: '信義区', c: '台湾', g: [['glass', .6], ['tower', .4]], sil: [40, 60] },
      { x: 3200, n: '新竹', c: '台湾', g: [['ware', .6], ['glass', .4]], sil: [14, 24] }, { x: 4700, n: 'サイアム', c: 'タイ', rain: 1, g: [['stall', .45], ['glass', .35], ['zakkyo', .2]], sil: [30, 50] },
      { x: 6300, n: 'シーロム', c: 'タイ', g: [['glass', .5], ['sky', .3], ['stall', .2]], sil: [50, 70] }],
    bosses: [{ x: 2300, id: 't101' }, { x: 3900, id: 'tsmc' }], final: 'maha',
    lm: [[700, 'grandhotel'], [1700, 'shinkong'], [5000, 'bts'], [5700, 'baiyoke'], [6500, 'statetower'], [6950, 'iconsiam']], end: 'バンコクは、自然に還った。',
  },
  {
    id: 'saigon', city: 'ホーチミン〜シンガポール', en: 'SAIGON → SINGAPORE', country: 'ベトナム・マレーシア・シンガポール', lat: 10.78, lon: 106.7, via: [[3.14, 101.69], [1.28, 103.86]], tz: 'Asia/Ho_Chi_Minh', weather: '晴れのちスコール', hp: 1.1, bird: 'hcrow',
    sky: [[[138, 182, 206], [196, 218, 222], [234, 232, 214]], [[40, 52, 84], [160, 110, 128], [248, 164, 104]]], ground: ['#565A55', '#2E322E'],
    zones: [{ x: 0, n: 'ベンタイン', c: 'ベトナム', g: [['tube', .8], ['brick', .2]], sil: [16, 24] }, { x: 1500, n: 'ビンタン', c: 'ベトナム', g: [['tube', .5], ['glass', .5]], sil: [30, 50] },
      { x: 3300, n: 'クアラルンプール', c: 'マレーシア', g: [['glass', .5], ['sky', .3], ['shophouse', .2]], sil: [40, 70] }, { x: 5100, n: 'チャイナタウン', c: 'シンガポール', rain: 1, g: [['shophouse', .8], ['glass', .2]], sil: [30, 50] },
      { x: 6400, n: 'マリーナベイ', c: 'シンガポール', g: [['glass', .6], ['sky', .4]], sil: [50, 80] }],
    bosses: [{ x: 2400, id: 'l81' }, { x: 4300, id: 'petronas' }], final: 'mbs',
    lm: [[700, 'benthanh'], [1700, 'bitexco'], [3600, 'kltower'], [5400, 'raffles'], [6000, 'merlion'], [6700, 'supertree']], end: 'シンガポールは、自然に還った。',
  },
  {
    id: 'dubai', city: 'ドバイ', en: 'DUBAI', country: 'アラブ首長国連邦', lat: 25.2, lon: 55.27, tz: 'Asia/Dubai', weather: '快晴・砂ぼこり', hp: 1.1, bird: 'falcon', dust: 1,
    sky: [[[150, 176, 200], [214, 212, 200], [240, 226, 196]], [[52, 48, 78], [190, 120, 100], [252, 176, 96]]], ground: ['#8A7A60', '#4E4434'],
    zones: [{ x: 0, n: 'デイラ（旧市街）', g: [['sand', .75], ['mirror', .25]], sil: [10, 18] }, { x: 1500, n: 'ザビール', g: [['sand', .4], ['mirror', .6]], sil: [20, 40] },
      { x: 3500, n: 'ジュメイラ', g: [['mirror', .5], ['sand', .5]], sil: [20, 40] }, { x: 5000, n: 'シェイク・ザイード・ロード', g: [['mirror', .6], ['sky', .4]], sil: [60, 90] },
      { x: 6500, n: 'ダウンタウン', g: [['mirror', .6], ['sky', .4]], sil: [60, 90] }],
    bosses: [{ x: 2400, id: 'frame' }, { x: 4200, id: 'baa' }], final: 'khalifa',
    lm: [[800, 'skidubai'], [5300, 'motf'], [5800, 'emirates'], [6550, 'dubaimall']], end: 'ドバイは、自然に還った。',
  },
  {
    id: 'berlin', city: 'ベルリン〜フランクフルト', en: 'BERLIN → FRANKFURT', country: 'ドイツ', lat: 52.52, lon: 13.4, via: [[50.11, 8.68]], tz: 'Europe/Berlin', weather: 'くもり', hp: 1.1, bird: 'jackdaw',
    sky: [[[140, 150, 164], [184, 190, 198], [214, 214, 210]], [[48, 52, 74], [140, 112, 120], [222, 160, 118]]], ground: ['#50555A', '#2C3034'],
    zones: [{ x: 0, n: 'ミッテ', g: [['gable', .4], ['stone', .4], ['tower', .2]], sil: [20, 30] }, { x: 1500, n: 'ポツダム広場', g: [['glass', .6], ['stone', .4]], sil: [36, 50] },
      { x: 2200, n: 'グリューンハイデ（松林）', g: [['ware', .5], ['gable', .5]], sil: [8, 14] }, { x: 3600, n: 'フランクフルトの銀行街', g: [['sky', .5], ['glass', .3], ['stone', .2]], sil: [60, 80] },
      { x: 5300, n: 'メッセ', g: [['glass', .5], ['tower', .3], ['gable', .2]], sil: [40, 60] }, { x: 6300, n: 'マイン河岸', g: [['gable', .5], ['stone', .3], ['glass', .2]], sil: [30, 60] }],
    bosses: [{ x: 2700, id: 'tesla' }, { x: 4500, id: 'dbank' }], final: 'ecb',
    lm: [[600, 'brandenburg'], [1100, 'fernsehturm'], [1700, 'sonycenter'], [3900, 'commerzbank'], [5500, 'messeturm']], end: 'フランクフルトは、自然に還った。',
  },
  {
    id: 'paris', city: 'パリ〜モナコ', en: 'PARIS → MONACO', country: 'フランス・モナコ', lat: 48.86, lon: 2.35, via: [[43.74, 7.42]], tz: 'Europe/Paris', weather: '晴れ', hp: 1.1, bird: 'gull',
    sky: [[[136, 164, 196], [190, 204, 218], [228, 222, 212]], [[50, 48, 82], [168, 116, 128], [246, 170, 120]]], ground: ['#55585C', '#2E3134'],
    zones: [{ x: 0, n: 'オペラ', c: 'フランス', g: [['haussmann', .85], ['stone', .15]], sil: [20, 30] }, { x: 1000, n: 'マレ', c: 'フランス', g: [['haussmann', .7], ['brick', .3]], sil: [20, 30] },
      { x: 1700, n: 'モンパルナス', c: 'フランス', g: [['haussmann', .6], ['tower', .4]], sil: [24, 40] }, { x: 2300, n: 'ラ・デファンス', c: 'フランス', g: [['sky', .5], ['glass', .5]], sil: [50, 70] },
      { x: 3300, n: 'シャン・ド・マルス', c: 'フランス', g: [['haussmann', .8], ['stone', .2]], sil: [20, 30] }, { x: 4000, n: 'ブローニュの森', c: 'フランス', g: [['house', .6], ['riviera', .4]], sil: [6, 12] },
      { x: 5300, n: 'ニース', c: 'フランス', g: [['riviera', .8], ['haussmann', .2]], sil: [14, 24] }, { x: 6300, n: 'モンテカルロ', c: 'モナコ', g: [['riviera', .5], ['glass', .3], ['haussmann', .2]], sil: [30, 50] }],
    bosses: [{ x: 2700, id: 'arche' }, { x: 4600, id: 'flv' }], final: 'montecarlo',
    lm: [[500, 'lafayette'], [1100, 'louvre'], [1500, 'pompidou'], [1950, 'montparnasse'], [3500, 'eiffel']], end: 'モナコは、自然に還った。',
  },
  {
    id: 'barcelona', city: 'バルセロナ〜マドリード', en: 'BARCELONA → MADRID', country: 'スペイン', lat: 41.39, lon: 2.17, via: [[40.42, -3.7]], tz: 'Europe/Madrid', weather: '快晴', hp: 1.1, bird: 'parakeet',
    sky: [[[118, 166, 214], [180, 208, 228], [236, 228, 206]], [[48, 46, 84], [178, 112, 112], [252, 168, 96]]], ground: ['#6E6658', '#3A3630'],
    zones: [{ x: 0, n: 'ランブラス通り', g: [['riviera', .6], ['haussmann', .4]], sil: [16, 24] }, { x: 1000, n: 'アシャンプラ', g: [['haussmann', .6], ['riviera', .4]], sil: [20, 30] },
      { x: 1900, n: 'グローリエス', g: [['glass', .6], ['tower', .4]], sil: [30, 50] }, { x: 3000, n: 'ラ・マンチャ（風車の丘）', g: [['windmill', .5], ['riviera', .5]], sil: [6, 10] },
      { x: 4200, n: 'カステリャーナ通り', g: [['sky', .5], ['glass', .5]], sil: [50, 70] }, { x: 5500, n: 'グラン・ビア', g: [['haussmann', .6], ['stone', .4]], sil: [24, 36] },
      { x: 6500, n: 'チャマルティン', g: [['glass', .5], ['riviera', .5]], sil: [30, 50] }],
    bosses: [{ x: 2400, id: 'glories' }, { x: 4800, id: 'kio' }], final: 'bernabeu',
    lm: [[500, 'boqueria'], [1100, 'casamila'], [4300, 'cuatrotorres'], [5800, 'metropolis'], [6300, 'palacioreal']], end: 'マドリードは、自然に還った。',
  },
  {
    id: 'london', city: 'ロンドン', en: 'LONDON', country: 'イギリス', lat: 51.51, lon: -.13, tz: 'Europe/London', weather: '雨', hp: 1.1, bird: 'raven', rain: 1,
    sky: [[[128, 138, 150], [170, 176, 182], [198, 200, 202]], [[50, 56, 70], [118, 112, 122], [190, 150, 128]]], ground: ['#4E5459', '#2A2E33'],
    zones: [{ x: 0, n: 'セント・ジョンズ・ウッド', g: [['terrace', .8], ['brick', .2]], sil: [10, 18] }, { x: 2900, n: 'シティ', g: [['glass', .45], ['stone', .55]], sil: [36, 56] },
      { x: 5600, n: 'テムズ河岸', g: [['ware', .5], ['brick', .3], ['pylon', .2]], sil: [12, 26] }],
    bosses: [{ x: 2300, id: 'abbey' }, { x: 4900, id: 'walkie' }], final: 'battersea',
    lm: [[3000, 'bttower'], [3300, 'boe'], [3800, 'gherkin'], [4400, 'shard'], [6200, 'londoneye']], end: 'ロンドンは、自然に還った。',
  },
  {
    id: 'seattle', city: 'シアトル', en: 'SEATTLE', country: 'アメリカ', lat: 47.61, lon: -122.33, tz: 'America/Los_Angeles', weather: '小雨', hp: 1.15, bird: 'amcrow', rain: 1,
    sky: [[[124, 138, 152], [168, 178, 188], [200, 204, 206]], [[44, 50, 70], [112, 108, 124], [180, 146, 130]]], ground: ['#4C5357', '#292E32'],
    zones: [{ x: 0, n: 'パイク・プレイス', g: [['brick', .6], ['house', .4]], sil: [16, 26] }, { x: 1300, n: 'ダウンタウン', g: [['sky', .5], ['glass', .5]], sil: [50, 70] },
      { x: 2300, n: 'レドモンド', g: [['glass', .5], ['house', .5]], sil: [12, 20] }, { x: 3800, n: 'エバレット', g: [['ware', .7], ['house', .3]], sil: [8, 16] },
      { x: 5600, n: 'サウス・レイク・ユニオン', g: [['glass', .6], ['brick', .2], ['sky', .2]], sil: [40, 60] }],
    bosses: [{ x: 2800, id: 'msft' }, { x: 4500, id: 'boeing' }], final: 'spheres',
    lm: [[850, 'pikeplace'], [1500, 'columbia'], [1950, 'library'], [5900, 'spaceneedle']], end: 'シアトルは、自然に還った。',
  },
  {
    id: 'sf', city: 'サンフランシスコ〜シリコンバレー', en: 'SAN FRANCISCO → SILICON VALLEY', country: 'アメリカ', lat: 37.77, lon: -122.42, via: [[37.33, -122.01]], tz: 'America/Los_Angeles', weather: '霧のち晴れ', hp: 1.15, bird: 'pelican',
    sky: [[[150, 176, 200], [200, 212, 220], [232, 228, 218]], [[46, 50, 84], [160, 114, 130], [246, 166, 112]]], ground: ['#56595B', '#2F3234'],
    zones: [{ x: 0, n: 'ゴールデン・ゲート', fog: 1, g: [['victorian', .7], ['house', .3]], sil: [14, 24] }, { x: 1300, n: 'ソーマ', fog: 1, g: [['sky', .4], ['glass', .3], ['victorian', .3]], sil: [40, 70] },
      { x: 2500, n: 'メンロパーク', g: [['glass', .4], ['house', .6]], sil: [10, 18] }, { x: 3200, n: 'マウンテンビュー', g: [['glass', .4], ['ware', .3], ['house', .3]], sil: [10, 18] },
      { x: 4700, n: 'サンタクララ', g: [['glass', .5], ['ware', .5]], sil: [14, 24] }, { x: 6300, n: 'クパチーノ', g: [['house', .6], ['glass', .4]], sil: [10, 18] }],
    bosses: [{ x: 3800, id: 'cloud' }, { x: 5300, id: 'nvidia' }], final: 'apple',
    lm: [[450, 'goldengate'], [1000, 'paintedladies'], [1500, 'transamerica'], [2000, 'salesforce'], [2700, 'meta'], [3350, 'googleplex']], end: 'シリコンバレーは、自然に還った。',
  },
  {
    id: 'vegas', city: 'ラスベガス', en: 'LAS VEGAS', country: 'アメリカ', lat: 36.17, lon: -115.14, tz: 'America/Los_Angeles', weather: '快晴・夜', hp: 1.2, bird: 'grackle',
    sky: [[[54, 50, 96], [132, 92, 140], [236, 150, 112]], [[14, 16, 40], [38, 34, 78], [96, 62, 112]]], ground: ['#6A5E50', '#3A3430'],
    zones: [{ x: 0, n: 'ストリップ南', g: [['casino', .7], ['sand', .3]], sil: [16, 30] }, { x: 1500, n: 'ルクソール前', g: [['casino', .6], ['mirror', .4]], sil: [30, 50] },
      { x: 3200, n: 'センター・ストリップ', g: [['casino', .5], ['mirror', .3], ['sky', .2]], sil: [40, 60] }, { x: 4600, n: 'ストラット', g: [['casino', .6], ['ware', .4]], sil: [20, 40] },
      { x: 6000, n: 'ベネチアン', g: [['casino', .5], ['mirror', .5]], sil: [40, 60] }],
    bosses: [{ x: 2500, id: 'luxor' }, { x: 5100, id: 'strat' }], final: 'sphere',
    lm: [[500, 'welcome'], [1100, 'nyny'], [3500, 'parislv'], [3950, 'bellagio'], [4400, 'caesars']], end: 'ラスベガスは、自然に還った。',
  },
  {
    id: 'newyork', city: 'ニューヨーク', en: 'NEW YORK', country: 'アメリカ', lat: 40.71, lon: -74.01, tz: 'America/New_York', weather: '晴れ', hp: 1.3, bird: 'pigeon',
    sky: [[[120, 150, 186], [178, 196, 214], [222, 226, 228]], [[34, 40, 72], [120, 100, 140], [240, 150, 110]]], ground: ['#4A4F56', '#272B31'],
    zones: [{ x: 0, n: 'ブルックリン', g: [['brown', .7], ['brick', .3]], sil: [14, 24] }, { x: 1900, n: 'ミッドタウン', g: [['sky', .6], ['stone', .4]], sil: [60, 90] },
      { x: 4300, n: '五番街', g: [['sky', .5], ['stone', .3], ['glass', .2]], sil: [60, 90] }, { x: 6300, n: 'ウォール街・港', g: [['ware', .5], ['stone', .3], ['brown', .2]], sil: [40, 80] }],
    bosses: [{ x: 2900, id: 'rock' }, { x: 5300, id: 'goldtower' }], final: 'liberty',
    lm: [[2000, 'msg'], [2450, 'esb'], [3700, 'chrysler'], [6400, 'nyse'], [6800, 'bull']], end: 'ニューヨークは、自然に還った。',
  },
];
// 地図に出すだけの次の候補（第2弾で全部遊べるようになった。案が増えたらここに足す）
const TEASERS = [];

// ---------- v3：呼べる鳥の種類（役割がある） ----------
// 下の3つのボタンで、連れてきた3種のどれかを呼ぶ。ポイントは建物を崩すとたまる。同じ種類を呼ぶたびに少し高くなる
// wall=外壁への威力の倍率 core=核への倍率 seek=核へ一直線 wind=風（冷却ファン・帆の横風・牛歩）が効かない light=光で目がくらまない／目玉で固まらない stone=石を落として周りも砕く
const KIND = {
  starling: { name: 'ムクドリ', role: '数で押す', n: 8, cost: 18, col: '#15181D', s: 7, hp: 0, am: 1, shape: 'starling' },
  crow: { name: 'カラス', role: '硬い壁を割る', n: 3, cost: 30, col: '#07080A', s: 9.5, hp: 1, am: 1, wall: 2.5, shape: 'crow' },
  swallow: { name: 'ツバメ', role: '風に流されない', n: 5, cost: 26, col: '#1B2440', s: 7.5, hp: 0, am: 1, wind: 1, shape: 'swallow' },
  owl: { name: 'フクロウ', role: '光で目がくらまない', n: 3, cost: 30, col: '#6E5438', s: 9.5, hp: 1, am: 1.2, light: 1, shape: 'owl' },
  falcon: { name: 'ハヤブサ', role: '核へ一直線', n: 3, cost: 34, col: '#48505E', s: 9, hp: 0, am: 1.2, core: 4, seek: 1, shape: 'falcon' },
  pelican: { name: 'ペリカン', role: '石で壁ごと砕く', n: 3, cost: 32, col: '#9A9184', s: 12.5, hp: 2, am: 1.3, wall: 2, stone: 1, shape: 'pelican' },
  // v3 その5：新しい5種（案は Fable）。どれも画面で動きが違う。cling=壁に張り付いて同じ所をつつき、揺れではじかれない low=足元の段だけを突く（光の柱に入らない）
  // vee=V字で来て、群れの全員が同じ1点を叩く loot=崩したマスの点が 1.5 倍 dodge=止まらず飛ぶので反射光に焼かれない
  woodpecker: { name: 'キツツキ', role: '張り付いてつつく', n: 2, cost: 34, col: '#33503A', s: 8.5, hp: 2, am: 1, wall: 1.8, cling: 1, shape: 'woodpecker' },
  darter: { name: 'ヘビウ', role: '足元を崩す', n: 3, cost: 32, col: '#2A2622', s: 9.5, hp: 1, am: 1.2, low: 1, shape: 'darter' },
  goose: { name: 'ハイイロガン', role: 'V字で一点を叩く', n: 5, cost: 36, col: '#77746C', s: 10, hp: 2, am: 1.6, vee: 1, shape: 'goose' },
  magpie: { name: 'カササギ', role: '光るものを拾う', n: 5, cost: 24, col: '#101216', s: 8, hp: 1, am: 1, loot: 1.5, shape: 'magpie' },
  swift: { name: 'アマツバメ', role: '止まらず光線をかわす', n: 6, cost: 28, col: '#1A1A1C', s: 7, hp: 0, am: .6, dodge: 1, shape: 'swift' },
};
// cd=呼んだあとボタンが使えない秒数 spd=突っ込む速さと間隔 like/hate=得意・苦手な建物の札（威力 ×1.35／×0.65）
for (const [k, cd, spd, like, hate] of [['starling', 1.2, 1.1, [], []], ['crow', 2.5, .9, ['hard'], ['wind']], ['swallow', 2.5, 1.4, ['wind'], ['light']],
  ['owl', 3, .9, ['light'], ['tall']], ['falcon', 3.5, 1.3, ['tall'], ['wide']], ['pelican', 4, .75, ['wide'], ['tall']],
  ['woodpecker', 3.5, .9, ['hard'], ['light']], ['darter', 3.5, 1, ['tall'], ['wide']], ['goose', 4, .8, ['hard'], ['light']], ['magpie', 2.5, 1, ['light'], ['wind']], ['swift', 2, 1.6, ['wide'], ['tall']]]) Object.assign(KIND[k], { key: k, cd, spd, like, hate });
// 建物の札：光（光る仕掛け）、風（風の仕掛け）、硬い（外壁が厚い）、高い（55 段以上）、広い（48 マス以上で低い）
const TAGN = { light: '光', wind: '風', hard: '硬い', tall: '高い', wide: '広い' };
function bossTags(id) {
  const D = BOSS[id]; if (D.tags) return D.tags; const b = D.make(0); let top = 0; for (const q of b.cells.values()) top = Math.max(top, q.r); const w = b.w / CS, T = [];
  if (['glare', 'map', 'eye', 'pillar', 'beam'].includes(D.gim)) T.push('light'); if (['fan', 'gust'].includes(D.gim)) T.push('wind'); if (D.shell >= 28) T.push('hard');
  if (top >= 55) T.push('tall'); else if (w >= 48 && top < 32) T.push('wide'); return (D.tags = T);
}
function cityTags(ST) { const s = new Set(); for (const id of [...ST.bosses.map(b => b.id), ST.final]) for (const t of bossTags(id)) s.add(t); return [...s]; }
// v3 その5（ユーザー案）：最初はムクドリ1種・枠1つ。都市を還すと枠が増え（3つまで）、都市ごとに新しい鳥が仲間になる
// 鍵の鳥はおもに「その仕掛けに会った都市を還すと来る」。答えを持って前の都市に戻ると、まだの言葉を掘り出しやすい
const KIND_START = ['starling'];
const UNLOCK = { osaka: ['crow'], tokyo: ['swallow', 'owl'], taipei: ['woodpecker'], saigon: ['darter'], dubai: ['falcon'], berlin: ['goose'], paris: ['magpie'], london: ['swift'], sf: ['pelican'] };
const slotsFor = n => Math.min(3, 1 + n); // 還した都市の数 → 連れていける種類の数
// 仕掛けごとに効く鳥（建物のカードに出す）
const KEYB = { fan: 'swallow', gust: 'swallow', slow: 'swallow', glare: 'owl', map: 'owl', eye: 'owl', sway: 'woodpecker', beam: 'swift', pillar: 'darter' };
// 道中で合流する土地の鳥の形（呼ぶ鳥と同じ描き分けを使う）
for (const k in BIRD) BIRD[k].shape = { crow: 'crow', raven: 'crow', hcrow: 'crow', jackdaw: 'crow', amcrow: 'crow', kite: 'falcon', falcon: 'falcon', gull: 'gull', pelican: 'pelican' }[k] || 'starling';

// ---------- v3：鳥の言葉（都市を還すと1行もらえる。13行で詩になる） ----------
const VERSE = {
  osaka: 'ネオンを消したら、星がひとつ戻った。',
  tokyo: '決まらない会議より、渡りの季節のほうが正確だ。',
  taipei: 'チップの光より、ホタルの光。',
  saigon: '埋めた海は、いつか海に戻りたがる。',
  dubai: '砂漠に雪を降らせても、空は乾いたままだ。',
  berlin: '森は、貸し借りをしない。',
  paris: '本物の帆は、風にしか従わない。',
  barcelona: '傾いた塔の上で、インコが巣を編む。',
  london: '煙突は、ハヤブサの崖になった。',
  seattle: '閉じ込めた森は、外の森を覚えていた。',
  sf: '計算できないものが、空にはまだある。',
  vegas: '見つめ返したら、光の目は閉じた。',
  newyork: '自由は、像のことではなかった。空のことだった。',
};
