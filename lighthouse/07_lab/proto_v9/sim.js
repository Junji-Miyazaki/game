// 試作 v9 の自動プレイ（Node、描画なし）。実行: node lighthouse/07_lab/proto_v9/sim.js [auto|none] [回数]
// auto = ポイントが貯まるたびに 仲間→攻撃→守り の順で買う / none = 何も買わない
// 出力: 勝敗、各ボスの包囲開始時刻と撃破までの秒数、得点。最後に描画を数回呼んでエラーが出ないかも見る
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'auto';
const RUNS = Number(process.argv[3] || 4);
const src = fs.readFileSync(path.join(__dirname, 'proto.js'), 'utf8');
const noop = () => {};
const grad = { addColorStop: noop };
const ctx = new Proxy({}, {
  get: (t, k) => (k in t ? t[k] : k === 'createLinearGradient' ? () => grad : k === 'measureText' ? () => ({ width: 10 }) : noop),
  set: (t, k, v) => { t[k] = v; return true; },
});
const els = {};
global.document = {
  hidden: false,
  addEventListener: noop,
  getElementById: (id) => els[id] || (els[id] = { getContext: () => ctx, addEventListener: noop, getBoundingClientRect: () => ({ left: 0, top: 0, width: 360, height: 640 }) }),
};
eval(src + `
for (let run = 0; run < RUNS; run++) {
  start(); let ev = [], ps = 0, n = 0;
  while (S.mode === 'play' && S.t < 400) {
    step(1 / 60); n++;
    if (MODE === 'auto') for (const k of ['b1', 'b3', 'b2']) if (S.pts >= S.cost[k]) buy(k);
    if (S.siege && !ps) { ps = S.t; ev.push(S.boss.name + '包囲 ' + S.t.toFixed(0) + 's(' + aliveN() + '羽)'); }
    if (!S.siege && ps) { ev.push('撃破 ' + (S.t - ps).toFixed(1) + 's'); ps = 0; }
    if (n % 600 === 0) draw(n / 60);
  }
  for (let i = 0; i < 90; i++) { step(1 / 60); draw(i / 60); }
  console.log(MODE, run, S.mode.toUpperCase(), 't=' + S.t.toFixed(0) + 's', '得点=' + S.score, '最大' + S.peak + '羽', ev.join(' / '));
}
reset('title'); for (let i = 0; i < 120; i++) { step(1 / 60); draw(i / 60); } console.log('title ok', aliveN() + '羽');
`);
