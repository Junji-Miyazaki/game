// 試作 v1 の自動プレイ（Node、描画なし）。実行: node birds-reclaim/07_lab/proto_v1/sim.js [auto|none] [回数] [都市 0-2|all]
// auto = ポイントが貯まるたびに 仲間→守り→攻撃 の順で買う / none = 何も買わない
// 出力: 勝敗、各ボスの包囲開始時刻と崩すまでの秒数、得点。描画と地図の描画も数回呼んでエラーが出ないかを見る
const fs = require('fs'), path = require('path');
const MODE = process.argv[2] || 'auto', RUNS = Number(process.argv[3] || 4), WHICH = process.argv[4] || 'all';
const src = ['stages.js', 'globe.js', 'game.js'].map(f => fs.readFileSync(path.join(__dirname, f), 'utf8')).join('\n');
const noop = () => {}, grad = { addColorStop: noop };
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient') ? () => grad : k === 'measureText' ? () => ({ width: 10 }) : noop), set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
global.document = { hidden: false, addEventListener: noop, getElementById: id => els[id] || (els[id] = { getContext: () => ctx, addEventListener: noop, setPointerCapture: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) }) };
eval(src + `
SV = { clear: {}, best: {}, seen: {} };
for (let i = 0; i < 30; i++) { stepMap(1 / 60); draw(i / 60); }
console.log('map ok', DOTS.length + ' 陸の点');
const list = WHICH === 'all' ? [0, 1, 2] : [Number(WHICH)];
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
  console.log(MODE, S.st.id, run, S.mode.toUpperCase(), 't=' + S.t.toFixed(0) + 's', '得点=' + S.score, '最大' + S.peak + '羽', '|', ev.join(' '));
  SV = { clear: {}, best: {}, seen: {} };
}
mapEnter(0); for (let i = 0; i < 120; i++) { stepMap(1 / 60); draw(i / 60); } console.log('map after ok');
`);
