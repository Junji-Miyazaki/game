// 試作 v3 の自動プレイ（Node、描画なし）。実行: node birds-reclaim/07_lab/proto_v3/sim.js [smart|naive|none] [回数] [都市の番号|all]
// smart = 6種すべてが仲間。都市の仕掛けに合わせて3種を選び、場面ごとに効く鳥を呼ぶ（人が考えて遊ぶ近似）
// naive = 最初の3種のまま、ムクドリだけを呼び続ける（考えずに連打する近似） / none = 何も呼ばない
// 「選ぶ意味がある」かの目安：smart は 4 回中 3 回以上勝ち、naive はそれより明らかに負ける
// 出力: 図面の点検（置いただけで崩れる建物がないか）、勝敗、各ボスの包囲開始時刻と崩すまでの秒数、得点、還した名所。
// 地図・渡り・パスポートの描画も呼んでエラーが出ないかを見る
const fs = require('fs'), path = require('path');
const MODE = process.argv[2] || 'smart', RUNS = Number(process.argv[3] || 4), WHICH = process.argv[4] || 'all';
const src = ['stages.js', 'sky.js', 'globe.js', 'game.js', 'film.js', 'words.js'] /* ページ（v3.html）と同じ順 */.map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
const noop = () => {}, grad = { addColorStop: noop };
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => grad : k === 'measureText' ? () => ({ width: 10 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
global.document = { hidden: false, addEventListener: noop, getElementById: id => els[id] || (els[id] = { getContext: () => ctx, addEventListener: noop, setPointerCapture: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) }) };
eval(src + `
SV = SV0();
for (let i = 0; i < 30; i++) { stepMap(1 / 60); draw(i / 60); }
console.log('map ok', DOTS.length + ' 陸の点');
// 図面の点検：置いた直後に structural を回し、崩れ落ちるマスがあれば名前を出す
{ let bad = 0; S = { chunks: [], cid: 0, parts: [], mode: 'map' };
  const chk = (nm, b) => { const n = b.cells.size; structural(b); if (b.cells.size !== n) { bad++; console.log('  崩れる図面:', nm, n + '→' + b.cells.size); } S.chunks = []; S.parts = []; };
  for (const id in BOSS) { HPM = 1; chk('BOSS ' + id, BOSS[id].make(0)); } for (const id in LM) chk('LM ' + id, LM[id].make(0));
  for (const k in GEN) for (let j = 0; j < 30; j++) chk('GEN ' + k, GEN[k](0));
  console.log('図面の点検', bad ? bad + ' 件' : 'ok'); }
const list = WHICH === 'all' ? STAGES.map((_, i) => i) : [Number(WHICH)];
// smart の3種：象徴（なければ中ボス）の仕掛けに効く鳥1種 → カラス → ムクドリ → ハヤブサ の順に埋める
function teamFor(ST) { // 効く鳥1種（象徴を優先）＋ 都市の札で得意が多く苦手が少ない鳥。ムクドリかカラスを1種は入れる
  const T = []; for (const id of [ST.final, ...ST.bosses.map(b => b.id)]) { const k = KEYB[BOSS[id].gim]; if (k && !T.length && OWN().includes(k)) T.push(k); }
  const CT = cityTags(ST), base = { starling: .8, crow: .5, falcon: .3 }, sc = k => (base[k] || 0) + .5 * (KIND[k].am * (KIND[k].wall || 1) - 1) + KIND[k].like.filter(t => CT.includes(t)).length - KIND[k].hate.filter(t => CT.includes(t)).length; // 壁への強さも見る // 数の役（ムクドリ）は少し高く見る
  if (!T.includes('starling')) T.push('starling'); // 道中で群れを育てる数の鳥は必ず連れていく
  for (const k of OWN().filter(k => !T.includes(k)).sort((a, b) => sc(b) - sc(a))) if (T.length < NSL()) T.push(k); return T.filter(k => OWN().includes(k)).slice(0, NSL()); }
const OWN = () => SV.kinds, NSL = () => slotsNow();
const cnt = k => S.birds.filter(b => b.st !== 2 && b.sp.key === k).length;
function smart() {
  const T = S.team, slot = k => T.indexOf(k), B = S.boss; let want = null;
  if (S.siege) { const key = KEYB[B.gim]; if (key && slot(key) >= 0 && cnt(key) < 30) want = key; else if (slot('falcon') >= 0 && !B.dead && !(B.final && S.lightOut) && cnt('falcon') < 24) want = 'falcon'; else { const sc = k => likeK(S.kinds[k], B) * (S.kinds[k].wall || 1) * S.kinds[k].am; want = T.filter(k => k !== 'owl' && k !== 'swallow').sort((a, b) => sc(b) - sc(a))[0] || T[0]; } } // 鍵がなければ、この建物にいちばん効く鳥
  else if (aliveN() < 110 || S.pts > 120) want = slot('starling') >= 0 ? 'starling' : 'crow'; // 道中は群れを育て、余りは包囲のためにためる
  if (want && slot(want) >= 0) { const k = KEYS[slot(want)]; if (S.pts >= S.cost[k]) buy(k); }
}
// 順路：最初からの旅を通しで遊ぶ（ムクドリ1種・枠1つから。還すと枠と鳥が増える）。都市ごとに3回まで挑む。
// route=考えて遊ぶ（その時の仲間から組を選び、場面で効く鳥を呼ぶ。羽は連れていく鳥の威力から育てる） routen=1枠目だけを連打
if (MODE === 'route' || MODE === 'routen') { const out = [];
  for (let rep = 0; rep < RUNS; rep++) { SV = SV0(); const row = [];
    for (let si = 0; si < STAGES.length; si++) { let res = 'x', tries = 0;
      for (; tries < 3; tries++) { if (MODE === 'route') SV.team = teamFor(STAGES[si]); fixTeam(); startStage(si); S.brief = 0;
        if (!process.env.WX) S.wfx = { spd: 1, light: 1, scroll: 1, txt: [] };
        while (S.mode === 'play' && S.t < 420) { step(1 / 60); if (S.card) S.card = null; if (MODE === 'route') smart(); else if (S.pts >= S.cost.b1) buy('b1'); }
        if (S.mode === 'win') { res = String(tries + 1); break; } }
      if (MODE === 'route') for (const k of SV.team) for (const f of ['p', 's', 'p']) { const L = SV.lv[k] = SV.lv[k] || { p: 0, s: 0 }; while (L[f] < 3 && SV.fe >= L[f] + 1) { SV.fe -= L[f] + 1; L[f]++; } }
      row.push(STAGES[si].id + ':' + res + '[' + SV.team.join(',') + ']'); }
    console.log(MODE, 'rep' + rep, row.join(' ')); console.log('  仲間', SV.kinds.join(','), '枠', slotsNow()); }
  process.exit(0); }
for (const si of list) for (let run = 0; run < RUNS; run++) {
  SV = SV0(); SV.allSlots = 1; if (MODE !== 'smart') { SV.kinds = ['starling', 'crow', 'swallow']; SV.team = SV.kinds.slice(); } // 連打の比較は、その5の前と同じ3種で
  if (MODE === 'smart') { SV.kinds = Object.keys(KIND); SV.team = process.env.TEAM ? process.env.TEAM.split(',') : teamFor(STAGES[si]); } // TEAM=owl,starling,crow で組を固定して比べる
  startStage(si); draw(0); S.arr.t = 9; draw(0); tap(180, 300); if (S.brief) throw new Error('brief did not close'); let ev = [], ps = 0, n = 0, lo = 0; // 作戦のカードを描いてタップで閉じる
  if (!process.env.WX) S.wfx = { spd: 1, light: 1, scroll: 1, txt: [] }; // 天気は回す時刻で変わるので、ふだんは中立で比べる（WX=1 で現地の季節の空を使う） if (process.env.NOCD) for (const k in S.kinds) S.kinds[k].cd = 0; // 切り分け用
  while (S.mode === 'play' && S.t < 420) {
    step(1 / 60); n++; if (S.card) { if (S.card.t === 0) draw(0); tap(180, 300); } // 建物のカードはタップまで止まる
    if (MODE === 'smart') smart(); else if (MODE === 'naive' && S.pts >= S.cost.b1) buy('b1');
    if (S.siege && !ps) { ps = S.t; ev.push(S.boss.name + ' ' + S.t.toFixed(0) + 's(' + aliveN() + '羽)'); }
    if (S.lightOut && !lo) { lo = S.t; ev.push('核 ' + (S.t - ps).toFixed(1) + 's'); }
    if (!S.siege && ps) { ev.push('→' + (S.t - ps).toFixed(1) + 's'); ps = 0; }
    if (n % 600 === 0) draw(n / 60);
  }
  if (lo) ev.push('崩しきり ' + (S.t - lo).toFixed(1) + 's');
  for (let i = 0; i < 300; i++) { step(1 / 60); draw(i / 60); }
  if (process.env.WORDS) console.log('  言葉', S.wordsGot.join(','), '新しい', S.wordsNew.length);
  console.log(MODE, S.st.id, run, S.mode.toUpperCase(), '[' + S.team.join(',') + ']', 't=' + S.t.toFixed(0) + 's', '得点=' + S.score, '最大' + S.peak + '羽', '名所' + S.lmDown + '/' + S.lmN, '|', ev.join(' '));
  SV = SV0();
}
// 渡りの場面・パスポート・旅の仲間
SV = SV0(); SV.clear.osaka = 1; SV.clear.tokyo = 1; SV.last = 'tokyo'; SV.date.osaka = '2026.11.07'; SV.seen.tsutenkaku = 1; SV.lm.osaka = { 'グリコサイン': 1 };
flyEnter(2); console.log('fly', FLY.from.en, '→', FLY.to.en, FLY.km + 'km', FLY.n + '羽', FLY.kinds.join('・'));
for (let i = 0; i < 400 && scene === 'fly'; i++) { stepFly(1 / 60); draw(i / 60); } console.log('fly → scene', scene, 'HPM', HPM.toFixed(3));
scene = 'pass'; P.sel = -1; draw(0); P.sel = 0; draw(0); P.sel = 3; draw(0); console.log('pass ok');
// 冒頭と終わりの映画（描画のエラーだけ見る）
for (const kind of ['intro', 'end']) { filmStart(kind); if (FILM.wait) filmTap(10, 300); let i = 0; for (; i < 6000 && scene === 'film'; i++) { stepFilm(1 / 30); draw(i / 30); } console.log('film', kind, 'ok', (i / 30).toFixed(1) + 's', '→', scene); }
// 鳥の図鑑
SV = SV0(); SV.fe = 6; SV.kinds = Object.keys(KIND); scene = 'book'; draw(0); bookTap(bkBtn(0, 0).x + 5, bkBtn(0, 0).y + 5); bookTap(bkBtn(1, 1).x + 5, bkBtn(1, 1).y + 5); draw(0); console.log('book', JSON.stringify(SV.lv), 'fe', SV.fe); bookTap(R_RESPEC.x + 5, R_RESPEC.y + 5); console.log('respec fe', SV.fe);
// 言葉の書架
SV.epi = { intro: 1, osaka: 1, end: 1 }; scene = 'pass'; P.sel = -1; draw(0); passTap(R_WORDS.x + 5, R_WORDS.y + 5); console.log('words scene', scene, wordCount() + '/' + Object.keys(WORDS).length); draw(0); wordsTap(wbRow(1).x + 5, wbRow(1).y + 5); draw(0); console.log('shelf', WB.sel); wordsTap(R_WBACK.x + 5, R_WBACK.y + 5);
// 還った時の結果画面とごほうび
SV = SV0(); startStage(5); S.brief = 0; S.win = 1; S.mode = 'win'; finish(); for (let i = 0; i < 480; i++) { step(1 / 60); draw(i / 60); } console.log('reward', JSON.stringify(S.reward), 'area', S.area, 'kinds', SV.kinds.join(','));
console.log('words page', S.wordsGot.length, 'tap→', (tap(180, resY() + 20), S.rp)); for (let i = 0; i < 60; i++) { step(1 / 60); draw(i / 60); } tap(R_WGO.x + 5, R_WGO.y + 5); console.log('after words → scene', scene, 'sel', CITIES[M.sel].id);
scene = 'map'; mapTap(R_WORDSM.x + 5, R_WORDSM.y + 5); draw(0); console.log('map → words', scene); wordsTap(R_WBACK.x + 5, R_WBACK.y + 5); console.log('back →', scene);
mapEnter(0); for (let i = 0; i < 120; i++) { stepMap(1 / 60); draw(i / 60); } console.log('map after ok');
`);
