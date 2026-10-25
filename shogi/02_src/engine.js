/* ============ CYBER SHOGI engine — ルール・探索(純粋ロジック) ============
   DOM・UI非依存。node から `import "../02_src/engine.js"` で読み込み可能。
   globalThis.Engine として公開。盤外状態(ダウンマス・予告・陣営・衛星軌道)は
   setCtx({down:Set, pending:Map, faction, orbit}) で注入する。Set/Mapは参照で
   保持するため、呼び出し側の実体を渡せば以後の変化も追従する。
   仕様はプロトタイプv3と同一(01_docs/DESIGN.md 参照)。
========================================================================= */
(function(g){
"use strict";

const N=5, KINGVAL=100000;

const PDEF={
  K:{g:"CEO", pg:"CEO", v:0,    jp:"玉"},
  R:{g:"AI",  pg:"AGI", v:600,  jp:"飛", pv:150},
  B:{g:"SAT", pg:"SAT+",v:500,  jp:"角", pv:150},
  G:{g:"F/W", pg:"F/W", v:400,  jp:"金"},
  S:{g:"HCK", pg:"APT", v:350,  jp:"銀", pv:60},
  P:{g:"bot", pg:"BOT+",v:100,  jp:"歩", pv:280},
};
const CANPROMO={R:1,B:1,S:1,P:1};
const HANDORDER=["R","B","G","S","P"];

const STEPS={
  K:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]],
  G:[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,0]],
  S:[[-1,-1],[-1,0],[-1,1],[1,-1],[1,1]],
  P:[[-1,0]],
  PSTAR:[[-1,0],[-1,-1],[-1,1]],          // bot★: 斜め前にも
};
const SLIDES={R:[[-1,0],[1,0],[0,-1],[0,1]], B:[[-1,-1],[-1,1],[1,-1],[1,1]]};
const RD=[[-1,-1],[-1,1],[1,-1],[1,1]], BD=[[-1,0],[1,0],[0,-1],[0,1]];
const ADJ8=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const rk=pc=>(pc.caps||0)>=2;              // 捕獲昇格(★)

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}

/* ---------- factions ---------- */
// setup: [r,c,t,promoted] の列。handP: 敵の初期手駒bot数。
const FACTIONS={
  botnet:{nm:"ボットネット", tgt:"対一般ユーザー",
    rule:"敵botは成ると増殖(敵手駒bot+1)",
    setup:[[0,2,"S"],[0,3,"G"],[0,4,"K"],[1,0,"P"],[1,1,"P"],[1,2,"P"],[1,3,"P"]],
    handP:1},
  corp:{nm:"メガコーポ", tgt:"対企業",
    rule:"敵F/Wの防護範囲が2マス",
    setup:[[0,0,"R"],[0,1,"B"],[0,2,"G"],[0,3,"G"],[0,4,"K"],[1,0,"P"]],
    handP:0},
  state:{nm:"国家中枢", tgt:"対国家",
    rule:"敵の監視網: SATは切断中も中継可+AGI起動済",
    setup:[[0,0,"R",1],[0,1,"B"],[0,2,"S"],[0,3,"G"],[0,4,"K"],[1,0,"P"]],
    handP:1},
  hacker:{nm:"ライバルハッカー", tgt:"対ハッカー",
    rule:"敵もDDoSを放つ(計2回)",
    setup:[[0,0,"R"],[0,1,"S"],[0,2,"S"],[0,3,"G"],[0,4,"K"],[1,0,"P"]],
    handP:0},
};
const SLOTS=[{depth:2,noise:130},{depth:2,noise:45},{depth:3,noise:0}];

/* ---------- 盤外コンテキスト ---------- */
let CTX={down:new Set(), pending:new Map(), faction:null, orbit:false};
function setCtx(c){
  CTX={
    down:c.down instanceof Set?c.down:new Set(c.down||[]),
    pending:c.pending instanceof Map?c.pending:new Map(c.pending||[]),
    faction:c.faction||null,
    orbit:!!c.orbit,
  };
}
const getCtx=()=>CTX;
const isDown=i=>CTX.down.has(i);

/* ---------- 初期配置・シード台本 ---------- */
function initialBoard(fid,o={}){
  const F=FACTIONS[fid];
  const board=new Array(N*N).fill(null);
  const put=(r,c,t,s,p)=>board[r*N+c]={t,s,p:!!p,frozen:0,caps:0};
  put(4,0,"K",0); put(4,1,"G",0); put(4,2,"S",0); put(4,3,"B",0); put(4,4,"R",0,!!o.awaken);
  put(3,4,"P",0);
  for(const [r,c,t,p] of F.setup) put(r,c,t,1,p);
  if(o.zeroday){
    const i=board.findIndex(q=>q&&q.s===1&&q.t==="P");
    if(i>=0) board[i]=null;
  }
  const hands={0:{R:0,B:0,G:0,S:0,P:o.extraBots||0},1:{R:0,B:0,G:0,S:0,P:F.handP}};
  return {board,hands};
}
function makeLineup(seed){
  const rng=mulberry32(seed^0x51ED);
  const names=Object.keys(FACTIONS);
  for(let i=names.length-1;i>0;i--){const j=(rng()*(i+1))|0;[names[i],names[j]]=[names[j],names[i]];}
  return names.slice(0,3);
}
function makeBoScript(seed,stage){
  const rng=mulberry32((seed^0xB1AC0)+stage*7919);
  const s=[...Array(N*N).keys()];
  for(let i=s.length-1;i>0;i--){const j=(rng()*(i+1))|0;[s[i],s[j]]=[s[j],s[i]];}
  return s;
}

/* ---------- network (回線) ---------- */
// CEOから味方8近傍チェーンで到達=オンライン。SATは同行同列を中継(★で斜めも)。
// state陣営: 敵SATは切断中もBFSシード(常時監視網)。
// タップ: 敵オンラインHCKの半径1(★で2)の駒をオフライン化(CEO除外、F/W防護あり、
// チェーン導通は維持)。corp陣営の敵F/WとF/W★は防護半径2。
function computeNets(board){
  const on=[new Set(),new Set()], tapped=[new Set(),new Set()];
  for(const s of [0,1]){
    const k=kingSq(board,s);
    if(k<0) continue;
    const q=[k]; on[s].add(k);
    if(s===1&&CTX.faction==="state"){
      for(let i=0;i<N*N;i++){
        const p=board[i];
        if(p&&p.s===1&&p.t==="B"&&!on[1].has(i)){on[1].add(i); q.push(i);}
      }
    }
    while(q.length){
      const i=q.pop(), r=(i/N)|0, c=i%N;
      for(const [dr,dc] of ADJ8){
        const nr=r+dr, nc=c+dc;
        if(nr<0||nr>=N||nc<0||nc>=N) continue;
        const j=nr*N+nc, p=board[j];
        if(p&&p.s===s&&!on[s].has(j)){on[s].add(j); q.push(j);}
      }
      const self=board[i];
      if(self&&self.t==="B"){
        const star=rk(self);
        for(let j=0;j<N*N;j++){
          if(on[s].has(j)) continue;
          const p=board[j];
          if(!p||p.s!==s) continue;
          const jr=(j/N)|0, jc=j%N;
          const line=jr===r||jc===c;
          const diag=star&&Math.abs(jr-r)===Math.abs(jc-c);
          if(line||diag){on[s].add(j); q.push(j);}
        }
      }
    }
  }
  for(const s of [0,1]){
    const e=1-s;
    for(const i of on[e]){
      if(!board[i]||board[i].t!=="S") continue;
      const rad=rk(board[i])?2:1;
      const r=(i/N)|0, c=i%N;
      for(let j=0;j<N*N;j++){
        const p=board[j];
        if(!p||p.s!==s||p.t==="K") continue;
        const d=Math.max(Math.abs(((j/N)|0)-r),Math.abs(j%N-c));
        if(d<1||d>rad) continue;
        if(!on[s].has(j)) continue;
        if(fwProtected(board,on[s],j,s)) continue;
        tapped[s].add(j);
      }
    }
  }
  for(const s of [0,1]) for(const j of tapped[s]) on[s].delete(j);
  return {on,tapped};
}
function fwProtected(board,ownOn,j,s){
  if(board[j].t==="G") return true;
  const jr=(j/N)|0, jc=j%N;
  for(let i=0;i<N*N;i++){
    const q=board[i];
    if(!q||q.s!==s||q.t!=="G") continue;
    if(!ownOn.has(i)) continue;
    const rad=(s===1&&CTX.faction==="corp")||rk(q)?2:1;
    const d=Math.max(Math.abs(((i/N)|0)-jr),Math.abs(i%N-jc));
    if(d<=rad) return true;
  }
  return false;
}
function netAdjacent(i,own){
  const r=(i/N)|0, c=i%N;
  for(const [dr,dc] of ADJ8){
    const nr=r+dr, nc=c+dc;
    if(nr<0||nr>=N||nc<0||nc>=N) continue;
    if(own.has(nr*N+nc)) return true;
  }
  return false;
}

/* ---------- move generation ---------- */
const lastRank=s=>s===0?0:4;
const inB=(r,c)=>r>=0&&r<N&&c>=0&&c<N;

function pieceDirs(pc){
  const t=pc.t,p=pc.p;
  let steps=[],slides=[];
  if(t==="K") steps=STEPS.K;
  else if(t==="G") steps=STEPS.G;
  else if(t==="S") steps=p?STEPS.G:STEPS.S;
  else if(t==="P") steps=p?STEPS.G:(rk(pc)?STEPS.PSTAR:STEPS.P);
  else if(t==="R"){slides=SLIDES.R; if(p)steps=RD;}
  else if(t==="B"){slides=SLIDES.B; if(p)steps=BD;}
  return {steps,slides};
}

function genMoves(board,hands,side){
  const mv=[], dir=side===0?1:-1;
  const orbit=side===0&&CTX.orbit;
  const own=computeNets(board).on[side];
  for(let i=0;i<N*N;i++){
    const pc=board[i];
    if(!pc||pc.s!==side) continue;
    if(pc.frozen>0) continue;
    // AI★はスタンドアロン演算: 切断の影響を受けない
    const online=pc.t==="K"||own.has(i)||(pc.t==="R"&&rk(pc));
    const r=(i/N)|0, c=i%N, {steps,slides}=pieceDirs(pc);
    for(const [dr,dc] of steps){
      const nr=r+dr*dir, nc=c+dc;
      if(!inB(nr,nc)) continue;
      // オフライン歩は成れないため最奥段への前進は不可(死に駒防止)
      if(pc.t==="P"&&!pc.p&&!online&&nr===lastRank(side)) continue;
      const j=nr*N+nc;
      if(isDown(j)) continue;
      const tg=board[j];
      if(tg&&tg.s===side) continue;
      mv.push(mkMove(i,j,pc,side,online));
    }
    for(const [dr,dc] of slides){
      let nr=r+dr*dir, nc=c+dc;
      let range=online?N:1;
      while(range-->0){
        if(nr<0||nr>=N) break;
        if(nc<0||nc>=N){
          if(orbit&&pc.t==="B"){nc=(nc+N)%N;} else break;
        }
        const j=nr*N+nc;
        if(isDown(j)) break;
        const tg=board[j];
        if(tg&&tg.s===side) break;
        mv.push(mkMove(i,j,pc,side,online));
        if(tg) break;
        nr+=dr*dir; nc+=dc;
      }
    }
  }
  for(const t of HANDORDER){
    if(hands[side][t]<=0) continue;
    for(let i=0;i<N*N;i++){
      if(board[i]||isDown(i)) continue;
      if(!netAdjacent(i,own)) continue;
      const r=(i/N)|0, c=i%N;
      if(t==="P"){
        if(r===lastRank(side)) continue;
        let nifu=false;
        for(let rr=0;rr<N;rr++){
          const q=board[rr*N+c];
          if(q&&q.s===side&&q.t==="P"&&!q.p){nifu=true;break;}
        }
        if(nifu) continue;
      }
      mv.push({from:-1,to:i,drop:t,promo:false});
    }
  }
  return mv;
}
function mkMove(from,to,pc,side,online){
  const toR=(to/N)|0, fromR=(from/N)|0, lz=lastRank(side);
  const promo=online&&!pc.p&&CANPROMO[pc.t]&&(toR===lz||fromR===lz);
  return {from,to,drop:null,promo};
}

function applyMove(board,hands,side,m){
  const b=board.map(p=>p?{...p}:null);
  const h={0:{...hands[0]},1:{...hands[1]}};
  let captured=null;
  if(m.drop){
    b[m.to]={t:m.drop,s:side,p:false,frozen:0,caps:0};
    h[side][m.drop]--;
  }else{
    const pc={...b[m.from]};
    captured=b[m.to];
    if(captured&&captured.t!=="K"){
      h[side][captured.t]++;
      pc.caps=(pc.caps||0)+1;              // 捕獲昇格カウント
    }
    if(m.promo){
      pc.p=true;
      // botnet: 敵botの成りで増殖(探索中も一貫して適用)
      if(pc.t==="P"&&side===1&&CTX.faction==="botnet") h[1].P++;
    }
    b[m.to]=pc; b[m.from]=null;
  }
  return {b,h,captured};
}

function kingSq(board,side){
  for(let i=0;i<N*N;i++){const p=board[i]; if(p&&p.t==="K"&&p.s===side) return i;}
  return -1;
}
function canCaptureKing(board,hands,side){
  const k=kingSq(board,1-side);
  if(k<0) return true;
  return genMoves(board,hands,side).some(m=>m.to===k&&!m.drop);
}
function legalMoves(board,hands,side){
  return genMoves(board,hands,side).filter(m=>{
    const {b,h}=applyMove(board,hands,side,m);
    return !canCaptureKing(b,h,1-side);
  });
}
function inCheck(board,hands,side){ return canCaptureKing(board,hands,1-side); }

/* ---------- eval & search ---------- */
function evalBoard(board,hands,side){
  const {on}=computeNets(board);
  let sc=0;
  for(let i=0;i<N*N;i++){
    const p=board[i]; if(!p) continue;
    let v=p.t==="K"?KINGVAL:PDEF[p.t].v+(p.p?(PDEF[p.t].pv||0):0);
    if(p.t!=="K"&&rk(p)) v+=60;
    if(p.t!=="K"&&!on[p.s].has(i)&&!(p.t==="R"&&rk(p))) v*=0.6;
    const r=(i/N)|0,c=i%N; v+=(2-Math.abs(2-r))*4+(2-Math.abs(2-c))*4;
    sc+=p.s===side?v:-v;
  }
  for(const [cell,cd] of CTX.pending){
    if(cd<=3){
      const p=board[cell];
      if(p&&p.t!=="K"){
        const v=PDEF[p.t].v*0.8;
        sc+=p.s===side?-v:v;
      } else if(p&&p.t==="K"){
        sc+=p.s===side?-KINGVAL/4:KINGVAL/4;
      }
    }
  }
  for(const t of HANDORDER){
    sc+=hands[side][t]*PDEF[t].v*1.05;
    sc-=hands[1-side][t]*PDEF[t].v*1.05;
  }
  return sc;
}
function orderMoves(board,mv){
  return mv.map(m=>{
    let s=0;
    if(!m.drop){
      const tg=board[m.to];
      if(tg) s=1000+(tg.t==="K"?KINGVAL:PDEF[tg.t].v);
      if(m.promo) s+=120;
    } else s=-50;
    return {m,s};
  }).sort((a,b)=>b.s-a.s).map(x=>x.m);
}
function negamax(board,hands,side,depth,alpha,beta){
  if(kingSq(board,side)<0) return -KINGVAL-depth;
  if(depth===0) return evalBoard(board,hands,side);
  const mv=orderMoves(board,genMoves(board,hands,side));
  if(mv.length===0) return -KINGVAL/2;
  let best=-Infinity;
  for(const m of mv){
    let sc;
    if(!m.drop&&board[m.to]&&board[m.to].t==="K"){ sc=KINGVAL+depth; }
    else{
      const {b,h}=applyMove(board,hands,side,m);
      sc=-negamax(b,h,1-side,depth-1,-beta,-alpha);
    }
    if(sc>best) best=sc;
    if(best>alpha) alpha=best;
    if(alpha>=beta) break;
  }
  return best;
}

/* ---------- 表記 ---------- */
const colName=c=>String(5-c), rowName=r=>"一二三四五"[r];
const cellName=i=>colName(i%N)+rowName((i/N)|0);

g.Engine={
  N,KINGVAL,PDEF,CANPROMO,HANDORDER,ADJ8,FACTIONS,SLOTS,
  rk,mulberry32,setCtx,getCtx,isDown,
  initialBoard,makeLineup,makeBoScript,
  computeNets,fwProtected,netAdjacent,pieceDirs,
  genMoves,mkMove,applyMove,kingSq,canCaptureKing,legalMoves,inCheck,
  evalBoard,orderMoves,negamax,
  lastRank,inB,colName,rowName,cellName,
};
})(globalThis);
