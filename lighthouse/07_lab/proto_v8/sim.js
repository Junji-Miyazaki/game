// 試作 v8 の自動プレイ（Node、描画なし）。実行: node lighthouse/07_lab/proto_v8/sim.js [auto|none] [回数]
// auto = ポイントが貯まるたびに 仲間→攻撃→守り の順で買う / none = 何も買わない
// 出力: 勝敗、各ボスの包囲開始時刻と撃破までの秒数、包囲中の体当たりの向き
const fs = require('fs');
const path = require('path');
const MODE = process.argv[2] || 'auto';
const RUNS = Number(process.argv[3] || 4);
let src = fs.readFileSync(path.join(__dirname, 'proto.js'), 'utf8')
  .replace(/requestAnimationFrame\(loop\)\}requestAnimationFrame\(loop\);/, '}');
src = src.replace('function impact(b,nx,ny,hit){', "function impact(b,nx,ny,hit){if(S.siege&&hit.b===S.boss){const side=Math.abs(b.vx)>Math.abs(b.vy)?(b.vx>0?'左から':'右から'):(b.vy>0?'上から':'下から');DIR[side]=(DIR[side]||0)+1}");
const noop = () => {};
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
const els = {};
global.document = { getElementById: (id) => els[id] || (els[id] = { getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 640, height: 360 }) }) };
global.DIR = {};
eval(src + `;for(let run=0;run<RUNS;run++){reset();let tt=0,ev=[],ps=0;while(!S.over&&!S.win&&tt<300){step(1/60);tt+=1/60;if(MODE==='auto')for(const k of ['b1','b3','b2'])buy(k);
if(S.siege&&!ps){ps=tt;ev.push(S.boss.name+'包囲 '+tt.toFixed(0)+'s('+S.birds.filter(b=>b.st!==2).length+'羽)')}if(!S.siege&&ps){ev.push('撃破 '+(tt-ps).toFixed(1)+'s');ps=0}}
console.log(MODE,run,S.win?'WIN':S.over?'DEAD':'TIME','t='+tt.toFixed(0)+'s',ev.join(' / '))}console.log('包囲中の体当たりの向き:',JSON.stringify(DIR))`);
