// 試作 v2 の自動プレイ（Node、描画なし）。実行: node birds-reclaim/07_lab/proto_v2/sim.js [auto|none] [回数] [都市の番号|all]
// auto = ポイントが貯まるたびに 仲間→守り→攻撃 の順で買う / none = 何も買わない
// 出力: 図面の点検（置いただけで崩れる建物がないか）、勝敗、各ボスの包囲開始時刻と崩すまでの秒数、得点、還した名所。
// 地図・渡り・パスポートの描画も呼んでエラーが出ないかを見る
const fs = require('fs'), path = require('path');
const MODE = process.argv[2] || 'auto', RUNS = Number(process.argv[3] || 4), WHICH = process.argv[4] || 'all';
const src = ['stages.js', 'globe.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
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
for (const si of list) for (let run = 0; run < RUNS; run++) {
  startStage(si); let ev = [], ps = 0, n = 0, lo = 0;
  while (S.mode === 'play' && S.t < 420) {
    step(1 / 60); n++;
    if (MODE === 'auto') for (const k of ['b1', 'b2', 'b3']) if (S.pts >= S.cost[k]) buy(k);
    if (S.siege && !ps) { ps = S.t; ev.push(S.boss.name + ' ' + S.t.toFixed(0) + 's(' + aliveN() + '羽)'); }
    if (S.lightOut && !lo) { lo = S.t; ev.push('核 ' + (S.t - ps).toFixed(1) + 's'); }
    if (!S.siege && ps) { ev.push('→' + (S.t - ps).toFixed(1) + 's'); ps = 0; }
    if (n % 600 === 0) draw(n / 60);
  }
  if (lo) ev.push('崩しきり ' + (S.t - lo).toFixed(1) + 's');
  for (let i = 0; i < 300; i++) { step(1 / 60); draw(i / 60); }
  console.log(MODE, S.st.id, run, S.mode.toUpperCase(), 't=' + S.t.toFixed(0) + 's', '得点=' + S.score, '最大' + S.peak + '羽', '名所' + S.lmDown + '/' + S.lmN, '|', ev.join(' '));
  SV = SV0();
}
// 渡りの場面・パスポート・旅の仲間
SV = SV0(); SV.clear.osaka = 1; SV.clear.tokyo = 1; SV.last = 'tokyo'; SV.date.osaka = '2026.11.07'; SV.seen.tsutenkaku = 1; SV.lm.osaka = { 'グリコサイン': 1 };
flyEnter(2); console.log('fly', FLY.from.en, '→', FLY.to.en, FLY.km + 'km', FLY.n + '羽', FLY.kinds.join('・'));
for (let i = 0; i < 400 && scene === 'fly'; i++) { stepFly(1 / 60); draw(i / 60); } console.log('fly → scene', scene, 'HPM', HPM.toFixed(3));
scene = 'pass'; P.sel = -1; draw(0); P.sel = 0; draw(0); P.sel = 3; draw(0); console.log('pass ok');
mapEnter(0); for (let i = 0; i < 120; i++) { stepMap(1 / 60); draw(i / 60); } console.log('map after ok');
`);
