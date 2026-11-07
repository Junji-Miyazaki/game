// BIRDS RECLAIM 試作 v1 — 材質・都市（ステージ）・建物の図面
// 実在の建物は形と色で分かる程度に崩して描く。ロゴや社名は出さない。人物・企業に結びつく建物は架空の名前にする。
const W = 360, H = 640, GY = 500, CS = 6, GRAV = 520, PMAX = 1400;
let HPM = 1; // 都市ごとの建物の硬さの倍率（put で掛ける）

// hp=強度 col=色 pt=得点 f=この割合より段が細ると上が倒れる
const MAT = {
  wd: { hp: .8, col: [150, 104, 66], pt: 2, f: .45 }, st: { hp: .35, col: [214, 184, 110], pt: 1, f: .5 },
  br: { hp: 2, col: [168, 84, 62], pt: 3, f: .4 }, bs: { hp: 2.2, col: [122, 82, 66], pt: 3, f: .4 },
  co: { hp: 3.4, col: [150, 154, 160], pt: 4, f: .35 }, gl: { hp: 1.4, col: [143, 179, 201], pt: 3, f: .4 },
  sl: { hp: 6.5, col: [74, 80, 90], pt: 6, f: .25 }, ls: { hp: 3.2, col: [198, 188, 164], pt: 4, f: .35 },
  wn: { hp: 2.4, col: [92, 96, 104], pt: 3, f: .35 }, wh: { hp: 1.3, col: [228, 224, 214], pt: 2, f: .4 },
  ne: { hp: .8, col: [234, 98, 150], pt: 2, f: .45 }, ny: { hp: .8, col: [240, 202, 92], pt: 2, f: .45 },
  // ボスの外殻
  tt: { hp: 5, col: [200, 202, 194], pt: 5, f: .3 }, sv: { hp: 3, col: [60, 68, 80], pt: 4, f: .3 },
  bl: { hp: 2, col: [118, 160, 192], pt: 3, f: .3 }, fan: { hp: 4, col: [128, 136, 146], pt: 6, f: .3 },
  gd: { hp: 2.6, col: [146, 118, 62], pt: 5, f: .3 }, rb: { hp: 3.6, col: [142, 72, 54], pt: 4, f: .3 },
  ch: { hp: 4.5, col: [234, 232, 224], pt: 5, f: .3 }, fs: { hp: 5, col: [128, 128, 124], pt: 5, f: .3 },
  ps: { hp: 4.5, col: [178, 172, 158], pt: 5, f: .3 }, cu: { hp: 4, col: [110, 172, 152], pt: 6, f: .3 },
  // 核（光る）
  nc: { hp: 40, col: [255, 120, 176], pt: 30, f: .3 }, sc: { hp: 30, col: [110, 196, 255], pt: 25, f: .3 },
  kc: { hp: 40, col: [255, 238, 196], pt: 30, f: .3 }, gc: { hp: 34, col: [252, 208, 96], pt: 30, f: .3 },
  rc: { hp: 45, col: [255, 84, 72], pt: 30, f: .3 }, fc: { hp: 22, col: [255, 138, 58], pt: 30, f: .3 },
  tc: { hp: 150, col: [255, 204, 92], pt: 40, f: .3 },
};

// ---------- 道具 ----------
const ri = (a, n) => a + Math.floor(Math.random() * n);
function mk(x, w, m) { return { x, w: w * CS, cells: new Map(), orig: [], f: MAT[m].f, dirty: 0 }; }
function put(b, r, k, m) { const hp = MAT[m].hp * HPM; b.cells.set(r * 200 + k, { r, k, m, hp, h0: hp }); }
function fin(b) { for (const q of b.cells.values()) b.orig[q.r] = (b.orig[q.r] || 0) + 1; b.n0 = b.cells.size; return b; }
function box(b, r0, r1, k0, k1, m) { for (let r = r0; r <= r1; r++) for (let k = k0; k <= k1; k++) put(b, r, k, m); }
// 中心 cx、幅の半分を hw0→hw1 に変えながら積む
function trap(b, r0, r1, cx, hw0, hw1, m) { for (let r = r0; r <= r1; r++) { const hw = Math.round(hw0 + (hw1 - hw0) * (r - r0) / Math.max(1, r1 - r0)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, m); } }

// ---------- 道中の建物 ----------
const GEN = {
  house(x) { const w = ri(10, 5), wh = ri(6, 4), b = mk(x, w, 'wd'); box(b, 0, wh - 1, 0, w - 1, 'wd'); for (let r = 0; r < w / 2; r++) for (let k = r; k < w - r; k++) put(b, wh + r, k, 'br'); return fin(b); },
  brick(x) { const w = ri(9, 6), h = ri(9, 10), b = mk(x, w, 'br'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 4 === 2 && k % 3 === 1) ? 'gl' : 'br'); return fin(b); },
  tower(x) { const w = ri(7, 6), h = ri(15, 13), b = mk(x, w, 'co'); box(b, 0, h - 1, 0, w - 1, 'co'); return fin(b); },
  glass(x) { const w = ri(7, 6), h = ri(18, 14), b = mk(x, w, 'gl'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k === 0 || k === w - 1 || r % 6 === 0) ? 'co' : 'gl'); return fin(b); },
  sky(x) { const w = ri(8, 3), h = ri(24, 10), b = mk(x, w, 'gl'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k === 0 || k === w - 1 || r % 5 === 0) ? 'co' : 'gl'); return fin(b); },
  pylon(x) { const b = mk(x, 17, 'sl'); for (let r = 0; r < 27; r++) { const hw = Math.max(1, Math.round(6 - r * .18)); for (let k = -hw; k <= hw; k++) { if (Math.abs(k) < hw - 1 && r % 3) continue; put(b, r, k + 8, 'sl'); } } return fin(b); },
  ware(x) { const w = ri(16, 7), h = ri(5, 3), b = mk(x, w, 'co'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, r === h - 1 ? 'sl' : 'co'); return fin(b); },
  // 新世界の店：低い店の端から縦長のネオン看板が屋根より上へ伸びる
  shop(x) { const w = ri(8, 4), h = ri(5, 4), b = mk(x, w + 1, 'br'); box(b, 0, h - 1, 0, w - 1, 'br'); const s = Math.random() < .5 ? 'ne' : 'ny'; for (let r = 1; r < h + ri(3, 3); r++) put(b, r, w, s); return fin(b); },
  // ロンドンの長屋：3軒つながり、屋根の上に煙突
  terrace(x) { const n = 3, u = ri(6, 2), w = u * n, h = ri(7, 2), b = mk(x, w, 'br'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k % u === 2) ? 'gl' : 'br'); for (let r = h; r < h + 2; r++) for (let k = r - h; k < w - (r - h); k++) put(b, r, k, 'sl'); for (let i = 1; i < n; i++) { put(b, h + 2, i * u, 'br'); put(b, h + 3, i * u, 'br'); } return fin(b); },
  // ニューヨークの褐色砂岩の家：上に飾り縁
  brown(x) { const w = ri(7, 3), h = ri(9, 4), b = mk(x, w, 'bs'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (r % 3 === 1 && k % 2 === 1) ? 'gl' : 'bs'); box(b, h, h, 0, w - 1, 'co'); return fin(b); },
  // 石造りの事務所：縦長の窓の列
  stone(x) { const w = ri(10, 4), h = ri(12, 5), b = mk(x, w, 'ls'); for (let r = 0; r < h; r++) for (let k = 0; k < w; k++) put(b, r, k, (k % 3 === 1 && r > 0 && r < h - 1) ? 'wn' : 'ls'); return fin(b); },
};

// ---------- ボス（その都市の象徴） ----------
// shell=外壁の強度（核とファン以外のマスはこの値まで硬くする） coreHp=核の強度（象徴だけ上書き） name=表示名 kind=中ボス/象徴 sub=包囲時の説明 core=核の材質 gim=仕掛け
const BOSS = {
  tsutenkaku: {
    shell: 22, name: '通天閣', kind: '中ボス', core: 'nc', sub: '新世界の鉄塔 — ネオンの看板を壊せ',
    make(x) { const b = mk(x, 27, 'tt'), cx = 13;
      for (let r = 0; r < 10; r++) { const kl = 1 + Math.floor(r * .5); box(b, r, r, kl, kl + 2, 'tt'); box(b, r, r, 26 - kl - 2, 26 - kl, 'tt'); }
      box(b, 9, 9, 6, 20, 'tt'); trap(b, 10, 11, cx, 8, 8, 'tt'); trap(b, 12, 38, cx, 4, 4, 'tt'); box(b, 22, 28, cx - 3, cx + 3, 'nc');
      trap(b, 39, 43, cx, 7, 7, 'tt'); box(b, 40, 42, cx - 6, cx + 6, 'gl'); trap(b, 44, 46, cx, 3, 3, 'tt'); trap(b, 47, 49, cx, 1, 0, 'tt'); return fin(b); },
  },
  cloud: {
    shell: 14, name: 'クラウドセンター', kind: '中ボス', core: 'sc', gim: 'fan', sub: '湾岸の巨大データセンター — 冷却ファンの風が群れを押し返す。先にファンを壊せ',
    make(x) { const b = mk(x, 46, 'sv');
      for (let r = 0; r < 16; r++) for (let k = 0; k < 46; k++) put(b, r, k, r % 4 === 2 ? 'bl' : 'sv');
      for (const k0 of [7, 21, 35]) box(b, 4, 8, k0, k0 + 3, 'sc');
      box(b, 16, 16, 0, 45, 'co'); for (const k0 of [4, 14, 26, 36]) box(b, 17, 18, k0, k0 + 5, 'fan'); b.roof = 17; return fin(b); },
  },
  fucho: {
    shell: 45, coreHp: 90, name: '湾岸の府庁舎', kind: '象徴', core: 'kc', out: '庁舎の灯が消えた', sub: '海辺にそびえる庁舎 — 頂の灯を消し、崩しきれ',
    make(x) { const b = mk(x, 23, 'co'), cx = 11;
      for (let r = 0; r < 6; r++) for (let k = 0; k < 23; k++) put(b, r, k, r % 2 && k % 3 === 1 ? 'gl' : 'co');
      for (let r = 6; r <= 50; r++) for (let k = cx - 7; k <= cx + 7; k++) put(b, r, k, (Math.abs(k - cx) === 7 || r % 5 === 0) ? 'co' : 'gl');
      trap(b, 51, 55, cx, 6, 3, 'kc'); trap(b, 56, 56, cx, 2, 2, 'co'); box(b, 57, 60, cx, cx, 'sl'); return fin(b); },
  },
  abbey: {
    shell: 16, name: 'アビー・ロード・スタジオ', kind: '中ボス', core: 'rc', deco: 'zebra', sub: '白い録音スタジオ — 録音中の赤いランプを消せ',
    make(x) { const b = mk(x, 32, 'wh');
      for (let r = 0; r < 12; r++) for (let k = 2; k <= 29; k++) put(b, r, k, ((r === 3 || r === 4 || r === 8 || r === 9) && k % 4 === 1) ? 'gl' : 'wh');
      box(b, 0, 1, 13, 18, 'ls'); box(b, 5, 8, 13, 18, 'rc'); box(b, 12, 12, 1, 30, 'wh'); trap(b, 13, 14, 16, 12, 10, 'sl'); return fin(b); },
  },
  walkie: {
    shell: 18, name: 'ウォーキートーキー', kind: '中ボス', core: 'kc', gim: 'beam', sub: '上ほど太いガラスの塔 — 曲面の反射光が群れを焼く。光の輪から逃げろ',
    make(x) { const b = mk(x, 25, 'bl'), cx = 12;
      for (let r = 0; r <= 33; r++) { const hw = Math.round(6 + 6 * Math.pow(r / 33, 1.6)); for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (Math.abs(k - cx) === hw || r % 6 === 0) ? 'co' : 'bl'); }
      trap(b, 34, 34, cx, 12, 12, 'co'); box(b, 35, 37, cx - 10, cx + 10, 'kc'); for (const k of [cx - 11, cx + 11]) box(b, 35, 37, k, k, 'co'); trap(b, 38, 39, cx, 11, 10, 'co'); return fin(b); },
  },
  battersea: {
    shell: 26, coreHp: 40, name: 'バタシー発電所', kind: '象徴', core: 'fc', out: '炉の火が消えた', smoke: 1, sub: 'テムズ河岸の煉瓦の発電所 — 屋根の上の炉の火を消し、崩しきれ',
    make(x) { const b = mk(x, 50, 'rb');
      for (let r = 0; r < 24; r++) for (let k = 0; k < 50; k++) put(b, r, k, (k % 5 === 2 && r >= 6 && r <= 18) ? 'gl' : 'rb');
      box(b, 24, 27, 12, 37, 'rb'); box(b, 22, 27, 19, 30, 'fc');
      for (const k0 of [1, 6, 40, 45]) box(b, 24, 44, k0, k0 + 3, 'ch'); b.stacks = [1, 6, 40, 45]; return fin(b); },
  },
  rock: {
    shell: 22, name: 'ロックフェラー・センター', kind: '中ボス', core: 'gc', sub: '摩天楼の殿堂 — 頂の金の展望台を壊せ',
    make(x) { const b = mk(x, 25, 'ls'), cx = 12, sl = (r, hw) => { for (let k = cx - hw; k <= cx + hw; k++) put(b, r, k, (k - cx + 20) % 2 ? 'wn' : 'ls'); };
      box(b, 0, 9, 0, 24, 'ls'); for (let r = 10; r <= 29; r++) sl(r, 7); for (let r = 30; r <= 39; r++) sl(r, 6); for (let r = 40; r <= 45; r++) sl(r, 5);
      box(b, 46, 49, cx - 4, cx + 4, 'gc'); box(b, 50, 50, cx - 2, cx + 2, 'gc'); return fin(b); },
  },
  goldtower: {
    shell: 20, name: '金の塔', kind: '中ボス', core: 'gc', gim: 'glare', sub: '大統領の名を冠した金色の塔 — ガラスが光ると群れの目がくらむ。光る前にタップで散らせ',
    make(x) { const b = mk(x, 21, 'gd'), cx = 6;
      for (let r = 0; r <= 14; r++) box(b, r, r, cx + 7, cx + 14 - Math.floor(r / 3), 'gd');
      for (let r = 0; r <= 55; r++) for (let k = cx - 6; k <= cx + 6; k++) put(b, r, k, r % 4 === 3 ? 'wn' : 'gd');
      box(b, 50, 55, cx - 5, cx + 5, 'gc'); box(b, 56, 56, cx - 6, cx + 6, 'gd'); return fin(b); },
  },
  liberty: {
    shell: 36, coreHp: 120, name: '自由の女神', kind: '象徴', core: 'tc', out: '松明が消えた', island: 1, sub: '港の島に立つ像 — 掲げた松明を消し、崩しきれ',
    make(x) { const b = mk(x, 41, 'fs'), cx = 20;
      for (let r = 0; r <= 5; r++) for (let k = 0; k <= 40; k++) { if (r >= 4 && k % 8 < 2) continue; put(b, r, k, 'fs'); }
      trap(b, 6, 8, cx, 13, 13, 'ps'); for (let r = 9; r <= 22; r++) for (let k = cx - 10; k <= cx + 10; k++) put(b, r, k, (r >= 14 && r <= 18 && Math.abs(Math.abs(k - cx) - 4) < 1) ? 'wn' : 'ps');
      trap(b, 23, 25, cx, 11, 11, 'ps'); trap(b, 26, 27, cx, 6, 6, 'cu'); trap(b, 28, 43, cx, 6, 4, 'cu'); box(b, 35, 41, cx + 5, cx + 7, 'cu');
      trap(b, 44, 45, cx, 4, 4, 'cu'); box(b, 46, 46, cx - 1, cx + 1, 'cu'); trap(b, 47, 50, cx, 2, 2, 'cu'); trap(b, 51, 51, cx, 3, 3, 'cu');
      for (const k of [cx - 3, cx - 1, cx + 1, cx + 3]) box(b, 52, 53, k, k, 'cu');
      for (let r = 44; r <= 56; r++) { const k = cx - 4 - Math.floor((r - 44) / 6); box(b, r, r, k - 1, k, 'cu'); }
      const tx = cx - 6; trap(b, 57, 57, tx, 2, 2, 'tc'); trap(b, 58, 58, tx, 2, 2, 'tc'); trap(b, 59, 60, tx, 1, 1, 'tc'); put(b, 61, tx, 'tc'); return fin(b); },
  },
};

// ---------- 鳥 ----------
// 最初からいる群れはムクドリ。都市ごとに、その土地の鳥が合流してくる
const BIRD = {
  base: { name: 'ムクドリ', col: '#15181D', s: 7, hp: 0, am: 1 },
  crow: { name: 'ハシブトガラス', note: '体力 +1', col: '#07080A', s: 8, hp: 1, am: 1, wn: 1 },
  raven: { name: 'ワタリガラス', note: '威力 ×1.5', col: '#1D1A24', s: 9, hp: 0, am: 1.5, wn: .9 },
  pigeon: { name: 'ドバト', note: '合流の数 ×1.3', col: '#5C6672', s: 6.5, hp: 0, am: 1, wn: 1.3 },
};

// ---------- 都市 ----------
// zones: x=始まる位置 n=区間名 g=[[建物, 割合]...] sil=遠景の街並みの高さ[基準, 幅]
// sky: [昼, 夕] の [上, 中, 地平] の色
const STAGES = [
  {
    id: 'osaka', city: '大阪', en: 'OSAKA', country: '日本', lat: 34.69, lon: 135.5, hp: 1, bird: 'crow',
    sky: [[[150, 160, 176], [196, 196, 200], [228, 218, 204]], [[60, 56, 86], [170, 120, 122], [246, 168, 108]]], ground: ['#545A60', '#2E3238'],
    zones: [{ x: 0, n: '下町', g: [['house', .6], ['brick', .4]], sil: [10, 20] }, { x: 1500, n: '新世界', g: [['shop', .75], ['brick', .25]], sil: [16, 24] },
      { x: 3300, n: '梅田', g: [['glass', .55], ['tower', .45]], sil: [40, 60] }, { x: 4700, n: '湾岸', g: [['ware', .5], ['pylon', .3], ['glass', .2]], sil: [14, 30] },
      { x: 6500, n: '咲洲', g: [['glass', .6], ['ware', .4]], sil: [30, 50] }],
    bosses: [{ x: 2700, id: 'tsutenkaku' }, { x: 5600, id: 'cloud' }], final: 'fucho', end: '大阪は、自然に還った。',
  },
  {
    id: 'london', city: 'ロンドン', en: 'LONDON', country: 'イギリス', lat: 51.51, lon: -.13, hp: 1.15, bird: 'raven', rain: 1,
    sky: [[[128, 138, 150], [170, 176, 182], [198, 200, 202]], [[50, 56, 70], [118, 112, 122], [190, 150, 128]]], ground: ['#4E5459', '#2A2E33'],
    zones: [{ x: 0, n: 'セント・ジョンズ・ウッド', g: [['terrace', .8], ['brick', .2]], sil: [10, 18] }, { x: 2900, n: 'シティ', g: [['glass', .45], ['stone', .55]], sil: [36, 56] },
      { x: 5600, n: 'テムズ河岸', g: [['ware', .5], ['brick', .3], ['pylon', .2]], sil: [12, 26] }],
    bosses: [{ x: 2300, id: 'abbey' }, { x: 4900, id: 'walkie' }], final: 'battersea', end: 'ロンドンは、自然に還った。',
  },
  {
    id: 'newyork', city: 'ニューヨーク', en: 'NEW YORK', country: 'アメリカ', lat: 40.71, lon: -74.01, hp: 1.3, bird: 'pigeon',
    sky: [[[120, 150, 186], [178, 196, 214], [222, 226, 228]], [[34, 40, 72], [120, 100, 140], [240, 150, 110]]], ground: ['#4A4F56', '#272B31'],
    zones: [{ x: 0, n: 'ブルックリン', g: [['brown', .7], ['brick', .3]], sil: [14, 24] }, { x: 1900, n: 'ミッドタウン', g: [['sky', .6], ['stone', .4]], sil: [60, 90] },
      { x: 4300, n: '五番街', g: [['sky', .5], ['stone', .3], ['glass', .2]], sil: [60, 90] }, { x: 6300, n: '港', g: [['ware', .7], ['brown', .3]], sil: [40, 80] }],
    bosses: [{ x: 2900, id: 'rock' }, { x: 5300, id: 'goldtower' }], final: 'liberty', end: 'ニューヨークは、自然に還った。',
  },
];
// 地図に出すだけの次の候補（まだ遊べない）
const TEASERS = [
  { city: '東京', en: 'TOKYO', country: '日本', lat: 35.68, lon: 139.77 }, { city: 'パリ', en: 'PARIS', country: 'フランス', lat: 48.86, lon: 2.35 },
  { city: 'ドバイ', en: 'DUBAI', country: 'アラブ首長国連邦', lat: 25.2, lon: 55.27 }, { city: 'シンガポール', en: 'SINGAPORE', country: 'シンガポール', lat: 1.29, lon: 103.85 },
  { city: 'シリコンバレー', en: 'SILICON VALLEY', country: 'アメリカ', lat: 37.39, lon: -122.08 },
];
