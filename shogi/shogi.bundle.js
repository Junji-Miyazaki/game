/* ===== engine.js ===== */
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

/* ===== sfx.js ===== */
/* ---------- SFX (WebAudio 合成。v4aで music.js に統合予定) ---------- */
let AC=null, muted=false;
function setMuted(v){muted=v;}
function audioUnlock(){
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    AC.resume();
  }catch(e){}
}
function beep(f,d,type="square",g=.05){
  if(muted) return;
  try{
    AC=AC||new (window.AudioContext||window.webkitAudioContext)();
    const o=AC.createOscillator(), gn=AC.createGain();
    o.type=type; o.frequency.value=f; gn.gain.value=g;
    gn.gain.exponentialRampToValueAtTime(.0001,AC.currentTime+d);
    o.connect(gn).connect(AC.destination); o.start(); o.stop(AC.currentTime+d);
  }catch(e){}
}
const sMove=()=>beep(340,.06), sCap=()=>{beep(180,.12,"sawtooth",.06); setTimeout(()=>beep(90,.15,"sawtooth",.05),60);},
      sWin=()=>{[523,659,784,1046].forEach((f,i)=>setTimeout(()=>beep(f,.16,"triangle",.06),i*110));},
      sLose=()=>{[300,220,150,90].forEach((f,i)=>setTimeout(()=>beep(f,.2,"sawtooth",.05),i*140));},
      sDdos=()=>beep(60,.3,"sawtooth",.08),
      sRank=()=>{beep(880,.08,"triangle",.06); setTimeout(()=>beep(1320,.12,"triangle",.06),90);},
      sDown=()=>{beep(45,.4,"sawtooth",.09); setTimeout(()=>beep(30,.5,"sawtooth",.07),120);};

/* ===== ui.js ===== */
/* ---------- UI・ゲームフロー(エンジンは globalThis.Engine) ---------- */
const {
  N,KINGVAL,PDEF,HANDORDER,FACTIONS,SLOTS,rk,mulberry32,setCtx,
  initialBoard,makeLineup,makeBoScript,
  computeNets,genMoves,applyMove,kingSq,legalMoves,inCheck,
  evalBoard,orderMoves,negamax,cellName,
}=globalThis.Engine;

const $=s=>document.querySelector(s);

let run=null, bt=null, busy=false;
let sel=null, targets=[], ddosArm=false;

/* ---------- 駒SVGアイコン(stroke=currentColor) ---------- */
const ICONS={
  K:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M4.5 17V9l4.5 3.5L12 5.5 15 12.5 19.5 9v8z"/><path d="M4.5 19.5h15"/><circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/></svg>`,
  R:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"><rect x="6.5" y="6.5" width="11" height="11" rx="1.5"/><path d="M12 9.5 14.5 12 12 14.5 9.5 12z"/><path d="M12 2.5v4M12 17.5v4M2.5 12h4M17.5 12h4"/></svg>`,
  B:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 7.5 16.5 12 12 16.5 7.5 12z"/><path d="M7.5 12H5M19 12h-2.5"/><rect x="1.8" y="9.6" width="3.2" height="4.8"/><rect x="19" y="9.6" width="3.2" height="4.8"/><path d="M12 7.5V4.5"/></svg>`,
  G:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><path d="M12 3.5 19 6.5v6c0 4-3 6.7-7 8-4-1.3-7-4-7-8v-6z"/><path d="M5 10.5h14M8 14.5h8"/></svg>`,
  S:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="13.5" r="4.5"/><path d="M9.8 9.5 8 6.5M14.2 9.5 16 6.5M7.5 13.5h-4M16.5 13.5h4M8.8 16.8l-3 2.6M15.2 16.8l3 2.6"/></svg>`,
  P:`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"><rect x="6.5" y="9" width="11" height="9" rx="2"/><circle cx="9.8" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="14.2" cy="13" r="1" fill="currentColor" stroke="none"/><path d="M12 9V6"/><circle cx="12" cy="5" r="1.2"/></svg>`,
};
/* 陣営カラー */
const FCOLOR={botnet:"#7dff4d", corp:"#9fd0ff", state:"#ff5a3c", hacker:"#c04dff"};
function applyFactionColor(fid){
  const c=FCOLOR[fid]||"#ff2d95";
  document.body.style.setProperty("--efg",c);
  document.body.style.setProperty("--efg-glow",c+"40");
}

/* ---------- 初回コンテキストヒント(1回だけ、タップで閉じる) ---------- */
const HINTS={
  offline:{t:"OFFLINE — 回線切断",b:`自分の駒が<b>CEOとの隣接チェーン</b>から切れて<b>OFFLINE</b>になった。<br>
    オフラインの駒は<b>走れない・成れない</b>。回線(シアンの線)を繋ぎ直すか、SAT(衛星)の同行・同列中継でオンラインに戻せる。`},
  tap:{t:"TAPPED — 敵のハッカー",b:`敵<b>HCK</b>の隣接マスに入った駒は<b>タップ=強制オフライン</b>にされる。<br>
    <b>F/W(金)</b>の隣にいる味方はタップから防護される。敵HCK自体を倒すか、F/Wの傘の下で戦え。`},
  blackout:{t:"BLACKOUT予告",b:`赤いカウントのマスは、数字が0になると<b>サーバーダウン=永久封鎖</b>。<br>
    その瞬間に乗っていた駒は<b>消滅</b>する(CEOなら即敗北)。カウントは完全に公開情報——逃がすか、敵を追い込むかはあなた次第。`},
  rank:{t:"★RANK UP — 捕獲昇格",b:`敵を<b>2体乗っ取った駒</b>は★ランクアップ。<br>
    AI=切断無効 / SAT=斜めにも中継 / HCK=タップ範囲2 / F/W=防護範囲2 / bot=斜め前にも進める。成りとは別枠。取られるとリセット。`},
  eddos:{t:"敵DDoS — 反撃",b:`ライバルハッカーは<b>こちらの最高価値の駒</b>へDDoSを撃ってくる(計2回)。<br>
    撃たれた駒は2手停止。大駒を前に出すタイミングに注意。`},
};
let hintQueue=[], hintOpen=false;
function hintSeen(id){ try{return !!localStorage.getItem("cs.hint."+id);}catch(e){return true;} }
function showHint(id){
  if(hintSeen(id)) return;
  try{localStorage.setItem("cs.hint."+id,"1");}catch(e){}
  hintQueue.push(id);
  if(!hintOpen) nextHint();
}
function nextHint(){
  const id=hintQueue.shift();
  if(!id){hintOpen=false; $("#hint-modal").classList.remove("on"); return;}
  hintOpen=true;
  $("#hint-title").textContent=HINTS[id].t;
  $("#hint-body").innerHTML=HINTS[id].b;
  $("#hint-modal").classList.add("on");
}
function checkStateHints(){
  if(!bt||bt.over) return;
  const nets=computeNets(bt.board);
  for(let i=0;i<25;i++){
    const p=bt.board[i];
    if(!p||p.s!==0||p.t==="K") continue;
    if(nets.tapped[0].has(i)){ showHint("tap"); }
    else if(!nets.on[0].has(i)&&!(p.t==="R"&&rk(p))){ showHint("offline"); }
  }
}

const UPGRADES=[
  {id:"bot",    ic:"▣", nm:"増援BOT",       ds:"各局の開始時、手駒にbot+1(重複可)", stack:true},
  {id:"awaken", ic:"◈", nm:"AI覚醒",        ds:"AIコア(飛)がAGI(竜)状態で開始", stack:false},
  {id:"orbit",  ic:"◍", nm:"衛星軌道リンク", ds:"衛星(角)が盤の左右端をワープして周回移動", stack:false},
  {id:"ddos",   ic:"⚡", nm:"DDoS攻撃 +1",   ds:"敵1体を2手停止。手番を消費しない(重複可)", stack:true},
  {id:"backup", ic:"⟲", nm:"バックアップ復元", ds:"各局1回、自駒が奪われた時に自分の手駒へ復元", stack:false},
  {id:"zeroday",ic:"☠", nm:"ゼロデイ",      ds:"敵botを1体、侵入済み状態で消去して開始(敵回線が痩せる)", stack:false},
];

/* ---------- terminal log ---------- */
const termLines=[];
function log(html){
  termLines.push("&gt; "+html);
  while(termLines.length>6) termLines.shift();
  $("#term").innerHTML=termLines.join("<br>");
}

/* ---------- battle setup ---------- */
function has(id){return run.upgrades.includes(id);}
function cnt(id){return run.upgrades.filter(u=>u===id).length;}
const curFaction=()=>FACTIONS[run.lineup[run.stage]];

function startBattle(){
  const F=curFaction(), fid=run.lineup[run.stage];
  const {board,hands}=initialBoard(fid,{awaken:has("awaken"),zeroday:has("zeroday"),extraBots:cnt("bot")});
  bt={board,hands,turn:0,moves:0,ply:0,kifu:[],backupUsed:false,lastMove:null,over:false,
      down:new Set(), pending:new Map(), faction:fid,
      boScript:makeBoScript(run.seed,run.stage), boPtr:0,
      eDdos:fid==="hacker"?2:0, eDdosAt:fid==="hacker"?[4,12]:[]};
  setCtx({down:bt.down, pending:bt.pending, faction:fid, orbit:has("orbit")});
  applyFactionColor(fid);
  run.ddos=cnt("ddos")-run.ddosSpent;
  sel=null; targets=[]; ddosArm=false;
  banner(`STAGE ${run.stage+1} :: ${F.tgt}`, `${F.nm} — ${F.rule}`);
  log(`<span class="m">BREACHING</span> STAGE ${run.stage+1} — ${F.nm} <span class="y">[${F.rule}]</span>`);
  if(has("zeroday")) log(`<span class="y">ゼロデイ発動</span>: 敵bot消去済み`);
  render();
}

/* ---------- AI ---------- */
function aiPickMove(){
  const slot=SLOTS[run.stage];
  const mv=legalMoves(bt.board,bt.hands,1);
  if(mv.length===0) return null;
  let best=null, bestSc=-Infinity;
  for(const m of orderMoves(bt.board,mv)){
    const {b,h}=applyMove(bt.board,bt.hands,1,m);
    let sc=-negamax(b,h,0,slot.depth-1,-Infinity,Infinity);
    sc+=(run.rngAI()*2-1)*slot.noise;
    if(sc>bestSc){bestSc=sc; best=m;}
  }
  return best;
}

/* ---------- kifu ---------- */
function recKifu(side,m,pc,captured){
  const mark=side===0?"☗":"☖";
  let s;
  if(m.drop) s=`${mark}${PDEF[m.drop].jp}打 ${cellName(m.to)}`;
  else s=`${mark}${PDEF[pc.t].jp}${cellName(m.from)}→${cellName(m.to)}${m.promo?"成":""}${captured?"(取)":""}`;
  bt.kifu.push(`${bt.kifu.length+1}. ${s}`);
}

/* ---------- blackout ---------- */
function tickBlackout(){
  bt.ply++;
  for(const [cell,cd] of [...bt.pending]){
    if(cd-1<=0){
      bt.pending.delete(cell);
      bt.down.add(cell);
      sDown();
      const p=bt.board[cell];
      if(p){
        bt.board[cell]=null;
        log(`<span class="m">SERVER DOWN</span> ${cellName(cell)} — ${p.s===0?"自":"敵"}${PDEF[p.t].g}消滅`);
        if(p.t==="K"){
          render();
          if(p.s===1){ stageWin(); } else { runOver(false); }
          return true;
        }
      } else {
        log(`<span class="m">SERVER DOWN</span> ${cellName(cell)} — 封鎖`);
      }
    } else bt.pending.set(cell,cd-1);
  }
  if(bt.ply>=6&&(bt.ply-6)%8===0&&bt.down.size+bt.pending.size<5){
    while(bt.boPtr<bt.boScript.length){
      const cell=bt.boScript[bt.boPtr++];
      if(bt.down.has(cell)||bt.pending.has(cell)) continue;
      const p=bt.board[cell];
      if(p&&p.t==="K") continue;
      bt.pending.set(cell,4);
      log(`<span class="y">⚠ BLACKOUT予告</span> ${cellName(cell)}: 4手後にサーバーダウン`);
      showHint("blackout");
      break;
    }
  }
  return false;
}

/* ---------- rank-up ---------- */
function checkRankUp(i){
  const pc=bt.board[i];
  if(!pc||pc.t==="K"||!rk(pc)||pc.rkLogged) return;
  pc.rkLogged=true; sRank();
  log(`<span class="y">★RANK UP</span>: ${pc.s===0?"自":"敵"}${PDEF[pc.t].g} — 能力強化`);
  if(pc.s===0) showHint("rank");
}

/* ---------- render ---------- */
function buildBoard(){
  const bd=$("#board"); bd.innerHTML="";
  for(let i=0;i<N*N;i++){
    const d=document.createElement("div");
    d.className="cell"; d.dataset.i=i;
    d.addEventListener("click",()=>onCell(i));
    bd.appendChild(d);
  }
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.id="netsvg"; svg.setAttribute("viewBox","0 0 100 100");
  svg.setAttribute("preserveAspectRatio","none");
  bd.appendChild(svg);
}
function drawNet(nets){
  const svg=$("#netsvg");
  let out="";
  const ctr=i=>[(i%N+0.5)*20,(((i/N)|0)+0.5)*20];
  for(const s of [0,1]){
    const col=s===0?"#19e3ff":(FCOLOR[bt.faction]||"#ff2d95"), op=s===0?0.45:0.28;
    const list=[...nets.on[s]];
    for(let a=0;a<list.length;a++)for(let b=a+1;b<list.length;b++){
      const i=list[a], j=list[b];
      const dr=Math.abs(((i/N)|0)-((j/N)|0)), dc=Math.abs(i%N-j%N);
      if(dr<=1&&dc<=1){
        const [x1,y1]=ctr(i),[x2,y2]=ctr(j);
        out+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="0.7" opacity="${op}"/>`;
      }
    }
    for(const i of list){
      const p=bt.board[i];
      if(!p||p.t!=="B") continue;
      for(const j of list){
        if(j===i) continue;
        const dr=Math.abs(((i/N)|0)-((j/N)|0)), dc=Math.abs(i%N-j%N);
        const sameLine=((i/N)|0)===((j/N)|0)||i%N===j%N||(rk(p)&&dr===dc);
        if(sameLine&&(dr>1||dc>1)){
          const [x1,y1]=ctr(i),[x2,y2]=ctr(j);
          out+=`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="0.5" opacity="${op*0.8}" stroke-dasharray="2 2"/>`;
        }
      }
    }
  }
  svg.innerHTML=out;
}
function render(){
  const nets=computeNets(bt.board);
  const inChk=!bt.over&&inCheck(bt.board,bt.hands,0);
  for(let i=0;i<N*N;i++){
    const cell=$("#board").children[i], pc=bt.board[i];
    cell.className="cell";
    if(bt.down.has(i)){ cell.classList.add("down"); cell.innerHTML=""; continue; }
    if(sel&&sel.type==="board"&&sel.i===i) cell.classList.add("selc");
    if(bt.lastMove&&bt.lastMove.to===i) cell.classList.add("lastmv");
    if(bt.fx&&bt.fx.i===i&&performance.now()-bt.fx.t<950) cell.classList.add("hacked");
    const tg=targets.find(m=>m.to===i);
    if(tg){cell.classList.add("movable"); if(pc)cell.classList.add("cap");}
    if(pc&&pc.t==="K"&&pc.s===0&&inChk) cell.classList.add("checkk");
    cell.innerHTML="";
    if(bt.pending.has(i)){
      const b=document.createElement("span");
      b.className="cd"; b.textContent=bt.pending.get(i);
      cell.appendChild(b);
    }
    if(pc){
      const offline=pc.t!=="K"&&!nets.on[pc.s].has(i)&&!(pc.t==="R"&&rk(pc));
      const d=document.createElement("div");
      d.className=`pc s${pc.s}${pc.p?" promo":""}${pc.frozen>0?" frozen":""}${offline?" offline":""}`;
      let sub=`<span class="g2">${pc.p?PDEF[pc.t].pg:PDEF[pc.t].g}</span>`;
      if(pc.frozen>0) sub=`<span class="lv">STUN ${pc.frozen}</span>`;
      else if(offline) sub=`<span class="lv">OFFLINE</span>`;
      d.innerHTML=(rk(pc)&&pc.t!=="K"?`<span class="rk">★</span>`:"")+
        `<span class="ic">${ICONS[pc.t]}</span>`+sub;
      cell.appendChild(d);
    }
  }
  drawNet(nets);
  renderHand(0); renderHand(1);
  $("#hud-stage").textContent=`STAGE ${run.stage+1}/3 :: ${curFaction().nm}`;
  $("#hud-score").textContent=`SCORE ${run.score}`;
  const db=$("#bt-ddos");
  db.textContent=`DDoS ×${run.ddos}`;
  db.disabled=run.ddos<=0||bt.turn!==0||bt.over;
  db.classList.toggle("armed",ddosArm);
}
function renderHand(side){
  const el=side===0?$("#hand-p"):$("#hand-e");
  el.querySelectorAll(".chip").forEach(c=>c.remove());
  for(const t of HANDORDER){
    const n=bt.hands[side][t];
    if(n<=0) continue;
    const c=document.createElement("div");
    c.className="chip"+(side===1?" enemy":"");
    if(side===0&&sel&&sel.type==="hand"&&sel.t===t) c.classList.add("sel");
    c.innerHTML=`${PDEF[t].g}<span class="n">×${n}</span>`;
    if(side===0) c.addEventListener("click",()=>onHand(t));
    el.appendChild(c);
  }
}

/* ---------- input ---------- */
function onHand(t){
  if(busy||bt.over||bt.turn!==0) return;
  ddosArm=false;
  if(sel&&sel.type==="hand"&&sel.t===t){sel=null;targets=[];}
  else{
    sel={type:"hand",t};
    targets=legalMoves(bt.board,bt.hands,0).filter(m=>m.drop===t);
  }
  render();
}
function onCell(i){
  if(busy||bt.over||bt.turn!==0) return;
  if(bt.down.has(i)) return;
  const pc=bt.board[i];
  if(ddosArm){
    if(pc&&pc.s===1&&pc.t!=="K"){
      pc.frozen=2; run.ddos--; run.ddosSpent++;
      ddosArm=false; sDdos();
      log(`<span class="y">⚡DDoS</span>: 敵${PDEF[pc.t].g}を2手停止 <span class="m">[SERVICE DENIED]</span>`);
      render();
    }
    return;
  }
  const tg=targets.find(m=>m.to===i);
  if(sel&&tg){ doPlayerMove(tg); return; }
  if(pc&&pc.s===0){
    sel={type:"board",i};
    targets=legalMoves(bt.board,bt.hands,0).filter(m=>m.from===i);
  }else{ sel=null; targets=[]; }
  render();
}

/* ---------- turns ---------- */
function doPlayerMove(m){
  const pc=m.drop?null:bt.board[m.from];
  const {b,h,captured}=applyMove(bt.board,bt.hands,0,m);
  bt.board=b; bt.hands=h; bt.lastMove=m; bt.moves++;
  recKifu(0,m,pc,captured);
  for(const q of bt.board) if(q&&q.s===0&&q.frozen>0) q.frozen--;
  sel=null; targets=[];
  if(captured){
    run.score+=Math.round((PDEF[captured.t].v+(captured.p?PDEF[captured.t].pv||0:0))/10);
    sCap(); flashHack(m.to);
    log(`<span class="g">UNIT HACKED</span>: 敵${PDEF[captured.t].g} → 乗っ取り完了`);
    checkRankUp(m.to);
  } else sMove();
  render();
  if(captured&&captured.t==="K"){ stageWin(); return; }
  if(tickBlackout()) return;
  render();
  bt.turn=1; busy=true;
  log(`<span class="m">hostile AI computing…</span>`);
  render();
  setTimeout(enemyTurn,420);
}

function enemyTurn(){
  // hacker陣営: 所定の手数でこちらの最高価値駒へDDoS(手番消費なし)
  if(bt.eDdos>0&&bt.eDdosAt.length&&bt.ply>=bt.eDdosAt[0]){
    bt.eDdosAt.shift();
    let tgt=-1, tv=-1;
    for(let i=0;i<N*N;i++){
      const p=bt.board[i];
      if(!p||p.s!==0||p.t==="K"||p.frozen>0) continue;
      const v=PDEF[p.t].v+(p.p?PDEF[p.t].pv||0:0);
      if(v>tv){tv=v; tgt=i;}
    }
    if(tgt>=0){
      bt.board[tgt].frozen=2; bt.eDdos--; sDdos();
      log(`<span class="m">⚡敵DDoS</span>: 自${PDEF[bt.board[tgt].t].g}が2手停止 [COUNTER ATTACK]`);
      showHint("eddos");
    }
  }
  const mv=legalMoves(bt.board,bt.hands,1);
  if(mv.length===0){ busy=false; stageWin(true); return; }
  const m=aiPickMove()||mv[0];
  const pc=m.drop?null:bt.board[m.from];
  const {b,h,captured}=applyMove(bt.board,bt.hands,1,m);
  let backup=false;
  if(captured&&captured.t!=="K"&&has("backup")&&!bt.backupUsed){
    bt.backupUsed=true; backup=true;
    h[1][captured.t]--; h[0][captured.t]++;
  }
  bt.board=b; bt.hands=h; bt.lastMove=m; bt.moves++;
  recKifu(1,m,pc,captured);
  for(const q of bt.board) if(q&&q.s===1&&q.frozen>0) q.frozen--;
  if(captured){
    sCap(); flashHack(m.to);
    if(backup) log(`<span class="y">⟲バックアップ復元</span>: ${PDEF[captured.t].g}を自軍手駒へ回収`);
    else log(`<span class="m">UNIT LOST</span>: ${PDEF[captured.t].g}が敵に奪取された`);
    checkRankUp(m.to);
  }
  if(m.promo&&pc&&pc.t==="P"&&bt.faction==="botnet"){
    log(`<span class="m">増殖</span>: 敵botが複製を生成 [BOTNET SPREADING]`);
  }
  bt.turn=0; busy=false;
  render();
  if(captured&&captured.t==="K"){ runOver(false); return; }
  if(tickBlackout()) return;
  render();
  const pl=legalMoves(bt.board,bt.hands,0);
  if(pl.length===0){ runOver(false); return; }
  if(inCheck(bt.board,bt.hands,0)) log(`<span class="m">⚠ WARNING: CEOが攻撃圏内 (王手)</span>`);
  checkStateHints();
}

// render()がclassNameをリセットするため、演出は状態(bt.fx)経由でrenderに反映する
function flashHack(i){
  bt.fx={i,t:performance.now()};
  setTimeout(()=>{ if(bt&&bt.fx&&bt.fx.i===i){ bt.fx=null; if(!bt.over) render(); } },950);
}

/* ---------- stage / run flow ---------- */
function stageWin(lockout){
  bt.over=true; sWin();
  const speedBonus=Math.max(0,300-bt.moves*10);
  const gain=500*(run.stage+1)+speedBonus;
  run.score+=gain; run.totalMoves+=bt.moves;
  run.kifuAll.push(`# STAGE ${run.stage+1} ${curFaction().nm}`,...bt.kifu);
  log(`<span class="g">ACCESS GRANTED</span> — ${curFaction().nm} 制圧 (+${gain}${lockout?" / SYSTEM LOCKDOWN勝ち":""})`);
  setTimeout(()=>{
    if(run.stage>=2){ runOver(true); }
    else offerUpgrades();
  },900);
}
function offerUpgrades(){
  const pool=UPGRADES.filter(u=>u.stack||!has(u.id));
  const arr=[...pool];
  for(let i=arr.length-1;i>0;i--){const j=(run.rngDraft()*(i+1))|0;[arr[i],arr[j]]=[arr[j],arr[i]];}
  const offer=arr.slice(0,3);
  const box=$("#upg-cards"); box.innerHTML="";
  for(const u of offer){
    const d=document.createElement("div");
    d.className="upg";
    d.innerHTML=`<div class="ic">${u.ic}</div><div class="nm">${u.nm}</div><div class="ds">${u.ds}</div>`;
    d.addEventListener("click",()=>{
      run.upgrades.push(u.id);
      $("#upg-modal").classList.remove("on");
      log(`<span class="y">強化取得</span>: ${u.nm}`);
      run.stage++;
      startBattle();
    });
    box.appendChild(d);
  }
  $("#upg-modal").classList.add("on");
}
function rankOf(sc){ return sc>=3200?"S":sc>=2400?"A":sc>=1600?"B":sc>=800?"C":"D"; }

/* ---------- ラン記録(ランキング準備: 棋譜+シードでリプレイ検証可能) ---------- */
function saveRunRecord(win){
  const rec={ts:Date.now(),v:3,mode:run.mode,seed:run.seed,lineup:[...run.lineup],win,
    score:run.score,rank:rankOf(run.score),stage:run.stage+1,totalMoves:run.totalMoves,
    upgrades:[...run.upgrades],kifu:[...run.kifuAll]};
  let best=null,bestDaily=null;
  try{
    const runs=JSON.parse(localStorage.getItem("cs.runs")||"[]");
    runs.unshift(rec); runs.length=Math.min(runs.length,20);
    localStorage.setItem("cs.runs",JSON.stringify(runs));
    best=JSON.parse(localStorage.getItem("cs.best")||"null");
    if(!best||rec.score>best.score){ localStorage.setItem("cs.best",JSON.stringify(rec)); best=rec; }
    if(rec.mode==="daily"){
      const k="cs.daily."+rec.seed;
      bestDaily=JSON.parse(localStorage.getItem(k)||"null");
      if(!bestDaily||rec.score>bestDaily.score){ localStorage.setItem(k,JSON.stringify(rec)); bestDaily=rec; }
    }
  }catch(e){}
  return {best,bestDaily};
}

function runOver(win){
  bt.over=true;
  if(!win){
    run.totalMoves+=bt.moves;
    run.kifuAll.push(`# STAGE ${run.stage+1} ${curFaction().nm} (敗北)`,...bt.kifu);
  }
  if(win){run.score+=1000; sWin();} else sLose();
  const {best,bestDaily}=saveRunRecord(win);
  const body=$("#end-body");
  const route=run.lineup.map(f=>FACTIONS[f].nm).join(" → ");
  const bestLine=best?`自己ベスト: ${best.score}${best.score===run.score&&best.ts>Date.now()-5000?" (更新!)":""}`:"";
  const dailyLine=run.mode==="daily"&&bestDaily?`本日ベスト: ${bestDaily.score}`:"";
  body.innerHTML=`
    <h2>${win?"FULL CONTROL — 全システム掌握":"CONNECTION LOST — 侵入失敗"}</h2>
    <div class="rank">${rankOf(run.score)}</div>
    <div class="fs">FINAL SCORE: ${run.score}</div>
    <div class="detail">MODE: ${run.mode==="daily"?"DAILY (seed "+run.seed+")":"FREE"}<br>
      侵入経路: ${route}<br>
      到達: STAGE ${run.stage+1}/3 ・ 総手数: ${run.totalMoves}<br>
      強化: ${run.upgrades.length?run.upgrades.map(id=>UPGRADES.find(u=>u.id===id).nm).join(" / "):"なし"}<br>
      ${bestLine}${dailyLine?" ・ "+dailyLine:""}</div>
    <button class="menu-btn" id="bt-retry">RETRY — 再侵入</button>
    <button class="menu-btn mg" id="bt-home">TITLE</button>`;
  $("#end-modal").classList.add("on");
  $("#bt-retry").addEventListener("click",()=>{ $("#end-modal").classList.remove("on"); newRun(run.mode); });
  $("#bt-home").addEventListener("click",()=>{
    $("#end-modal").classList.remove("on");
    $("#game").classList.remove("on"); $("#title").classList.add("on");
    renderRouteCard(); startNetBg();
  });
}
function banner(txt,sub){
  $("#banner-txt").textContent=txt;
  $("#banner-sub").textContent=sub||"";
  $("#banner").classList.add("on");
  setTimeout(()=>$("#banner").classList.remove("on"),1800);
}

function newRun(mode){
  let seed;
  if(mode==="daily"){
    const d=new Date();
    seed=d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
  } else seed=(Math.random()*1e9)|0;
  // シード分離: 経路/ドラフト/AIノイズを独立ストリーム化(ブラックアウトは局ごとの台本)
  run={mode,seed,stage:0,score:0,upgrades:[],ddos:0,ddosSpent:0,totalMoves:0,
       kifuAll:[],
       lineup:makeLineup(seed),
       rngDraft:mulberry32(seed^0xD4AF7),
       rngAI:mulberry32(seed^0xA11CE)};
  termLines.length=0;
  $("#hud-seed").textContent=mode==="daily"?"DAILY#"+seed:"FREE";
  $("#title").classList.remove("on"); $("#game").classList.add("on");
  log(`<span class="c">CYBER SHOGI :: FACTION WARS</span> [${mode.toUpperCase()}]`);
  log(`侵入経路: <span class="y">${run.lineup.map(f=>FACTIONS[f].nm).join(" → ")}</span>`);
  startBattle();
}

/* ---------- タイトル: 本日の経路カード ---------- */
function dailySeed(){
  const d=new Date();
  return d.getFullYear()*10000+(d.getMonth()+1)*100+d.getDate();
}
function renderRouteCard(){
  const seed=dailySeed(), lineup=makeLineup(seed);
  let best=null;
  try{best=JSON.parse(localStorage.getItem("cs.daily."+seed)||"null");}catch(e){}
  const route=lineup.map(f=>
    `<span class="dot" style="background:${FCOLOR[f]}"></span>${FACTIONS[f].nm}`).join(" → ");
  $("#route-card").innerHTML=
    `<div class="rc-t">TODAY'S ROUTE — DAILY#${seed}</div>`+
    `<div class="rc-route">${route}</div>`+
    `<div class="rc-best">${best?`本日ベスト: ${best.score} [${best.rank}]${best.win?" 全制圧":""}`:"未侵入 — 全員同条件のスコアアタック"}</div>`;
}

/* ===== main.js ===== */
/* ---------- 起動(音声アンロック)→タイトル→配線 ---------- */

/* boot: ブラウザの自動再生制限対策。最初のタップで AudioContext を解錠 */
$("#boot").addEventListener("click",()=>{
  audioUnlock();
  $("#boot").classList.remove("on");
  $("#title").classList.add("on");
  renderRouteCard();
  startNetBg();
  // music.js 導入後はここでタイトル曲を開始する
});

/* ---------- タイトル背景: 生成ネットワーク ---------- */
let netBgRun=false;
function startNetBg(){
  if(netBgRun) return;
  netBgRun=true;
  const cv=$("#net-bg"), ctx=cv.getContext("2d");
  const NODES=34, nodes=[];
  for(let i=0;i<NODES;i++) nodes.push({
    x:Math.random(), y:Math.random(),
    vx:(Math.random()-.5)*0.00035, vy:(Math.random()-.5)*0.00035,
    m:Math.random()<0.18,            // 一部はマゼンタ(敵ノード)
  });
  let pulse=null; // {a,b,t} リンク上を走るパケット
  function frame(){
    if(!$("#title").classList.contains("on")){ netBgRun=false; return; }
    const W=cv.clientWidth, H=cv.clientHeight;
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
    ctx.clearRect(0,0,W,H);
    for(const n of nodes){
      n.x+=n.vx; n.y+=n.vy;
      if(n.x<0||n.x>1) n.vx*=-1;
      if(n.y<0||n.y>1) n.vy*=-1;
    }
    const R=0.17;
    for(let i=0;i<NODES;i++)for(let j=i+1;j<NODES;j++){
      const a=nodes[i], b=nodes[j];
      const dx=a.x-b.x, dy=a.y-b.y, d=Math.hypot(dx,dy);
      if(d<R){
        const al=(1-d/R)*0.3;
        ctx.strokeStyle=(a.m&&b.m)?`rgba(255,45,149,${al})`:`rgba(25,227,255,${al})`;
        ctx.lineWidth=1;
        ctx.beginPath(); ctx.moveTo(a.x*W,a.y*H); ctx.lineTo(b.x*W,b.y*H); ctx.stroke();
      }
    }
    for(const n of nodes){
      ctx.fillStyle=n.m?"rgba(255,45,149,.8)":"rgba(25,227,255,.8)";
      ctx.beginPath(); ctx.arc(n.x*W,n.y*H,1.6,0,7); ctx.fill();
    }
    if(!pulse&&Math.random()<0.02){
      const i=(Math.random()*NODES)|0; let j=-1,bd=9;
      for(let k=0;k<NODES;k++){ if(k===i)continue;
        const d=Math.hypot(nodes[i].x-nodes[k].x,nodes[i].y-nodes[k].y);
        if(d<R&&d<bd){bd=d;j=k;} }
      if(j>=0) pulse={a:i,b:j,t:0};
    }
    if(pulse){
      pulse.t+=0.04;
      if(pulse.t>=1) pulse=null;
      else{
        const a=nodes[pulse.a], b=nodes[pulse.b];
        const x=a.x+(b.x-a.x)*pulse.t, y=a.y+(b.y-a.y)*pulse.t;
        ctx.fillStyle="rgba(255,210,62,.9)";
        ctx.beginPath(); ctx.arc(x*cv.width,y*cv.height,2.4,0,7); ctx.fill();
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

/* ---------- HOW TO PLAY(カード5枚) ---------- */
const HOWTO=[
 {t:"① 目的と流れ", b:`シードが決めた<b>3つの敵陣営</b>に連続侵入し、各局で敵<b>CEO(玉)を詰ませる</b>。
   勝つたびにサイバー強化を1つドラフトして次へ。3連勝で全システム掌握。<br><br>
   奪った敵駒は<b>乗っ取り済=持ち駒</b>となり、自軍として盤に投入できる(将棋の持ち駒ルール)。<br>
   1局2〜5分、1ラン10分前後。<b>DAILY</b>は日替わり固定シードの全員同条件スコアアタック。`},
 {t:"② 駒(動きは5五将棋のまま)", b:`<table>
   <tr><td>CEO</td><td>玉 — 全方向1マス。詰まされたら負け</td></tr>
   <tr><td>AI</td><td>飛車 — 縦横に走る(成=AGI)。切断に最も弱い</td></tr>
   <tr><td>SAT</td><td>角 — 斜めに走る(成=SAT+)。同行・同列を無線中継</td></tr>
   <tr><td>F/W</td><td>金 — 自身と隣接味方をタップから防護</td></tr>
   <tr><td>HCK</td><td>銀 — 隣接する敵をタップ(強制オフライン化)</td></tr>
   <tr><td>bot</td><td>歩 — 最安の配線。抜かれると回線が崩れる急所</td></tr></table>
   二歩・最奥段bot打ち禁止。最奥段に入ると自動で成る(オンライン時のみ)。`},
 {t:"③ 回線 — このゲームの核", b:`<div class="ht-svg"><svg viewBox="0 0 200 110" fill="none">
   <line x1="40" y1="90" x2="70" y2="60" stroke="#19e3ff" stroke-width="2"/>
   <line x1="70" y1="60" x2="110" y2="60" stroke="#19e3ff" stroke-width="2"/>
   <circle cx="40" cy="90" r="11" stroke="#19e3ff" stroke-width="2"/><text x="40" y="94" fill="#19e3ff" font-size="9" text-anchor="middle">CEO</text>
   <circle cx="70" cy="60" r="11" stroke="#19e3ff" stroke-width="2"/><text x="70" y="64" fill="#19e3ff" font-size="9" text-anchor="middle">bot</text>
   <circle cx="110" cy="60" r="11" stroke="#19e3ff" stroke-width="2"/><text x="110" y="64" fill="#19e3ff" font-size="9" text-anchor="middle">AI</text>
   <circle cx="165" cy="30" r="11" stroke="#5a7aa0" stroke-width="2" stroke-dasharray="3 3"/><text x="165" y="34" fill="#5a7aa0" font-size="8" text-anchor="middle">SAT</text>
   <text x="165" y="52" fill="#ff4444" font-size="8" text-anchor="middle">OFFLINE</text></svg></div>
   自CEOから<b>味方の隣接チェーン(8方向)</b>で繋がる駒だけ<b>オンライン</b>。
   切断された駒は<b>走れない・成れない</b>。持ち駒は<b>自回線の隣接マス</b>にしか打てない。<br>
   → 勝ち筋は「駒得」より<b>「敵回線の切断」</b>。敵botを1枚抜くと、その先の大駒が丸ごと沈黙する。`},
 {t:"④ 敵陣営と昇格★", b:`陣営ごとに編成+固有ルールが1つ変わり、正解の戦略が入れ替わる:<table>
   <tr><td>ボットネット</td><td>bot群。成ると増殖 → 速攻で潰せ</td></tr>
   <tr><td>メガコーポ</td><td>F/W×2・防護範囲2 → タップ不通。駒得で正面突破</td></tr>
   <tr><td>国家中枢</td><td>SAT常時中継+AGI → 切断無効。SAT自体を奪え</td></tr>
   <tr><td>ライバルハッカー</td><td>HCK×2+DDoS反撃 → F/Wで大駒を守れ</td></tr></table>
   敵を<b>2体乗っ取った駒は★ランクアップ</b>(AI=切断無効/SAT=斜め中継/HCK=タップ範囲2/F/W=防護範囲2/bot=斜め前)。`},
 {t:"⑤ BLACKOUTとDDoS", b:`<b>BLACKOUT:</b> 赤いカウントのマスは0で<b>サーバーダウン=永久封鎖</b>。
   乗っていた駒は消滅(CEOなら即敗北)。完全公開の決定論——長期戦は物理的に不可能。<br><br>
   <b>DDoS(強化で入手):</b> 手番を消費せず敵1体を2手停止。
   「DDoS込みの詰み手順」が組める。全敵駒を止めるとSYSTEM LOCKDOWN勝ち。<br><br>
   スコア=乗っ取り価値+ステージボーナス+<b>速度ボーナス(手数が少ないほど高い)</b>。ランクS〜D。`},
];
let howtoPage=0;
function showHowto(p){
  howtoPage=Math.max(0,Math.min(HOWTO.length-1,p));
  $("#howto-title").textContent=HOWTO[howtoPage].t;
  $("#howto-body").innerHTML=HOWTO[howtoPage].b;
  $("#howto-pos").textContent=(howtoPage+1)+" / "+HOWTO.length;
  $("#howto-prev").disabled=howtoPage===0;
  $("#howto-next").disabled=howtoPage===HOWTO.length-1;
  $("#howto-modal").classList.add("on");
}
$("#bt-howto").addEventListener("click",()=>showHowto(0));
$("#howto-prev").addEventListener("click",()=>showHowto(howtoPage-1));
$("#howto-next").addEventListener("click",()=>showHowto(howtoPage+1));
$("#howto-close").addEventListener("click",()=>$("#howto-modal").classList.remove("on"));
$("#hint-modal").addEventListener("click",nextHint);

/* ---------- メニュー・対局コントロール ---------- */
$("#bt-free").addEventListener("click",()=>newRun("free"));
$("#bt-daily").addEventListener("click",()=>newRun("daily"));
$("#bt-ddos").addEventListener("click",()=>{
  if(run.ddos<=0||bt.turn!==0||bt.over) return;
  ddosArm=!ddosArm; sel=null; targets=[];
  if(ddosArm) log(`<span class="y">⚡DDoS準備</span>: 停止させる敵ユニットを選択`);
  render();
});
$("#bt-kifu").addEventListener("click",()=>{
  $("#kifu-txt").value=bt.kifu.join("\n")||"(no moves)";
  $("#kifu-modal").classList.add("on");
});
$("#bt-kifu-close").addEventListener("click",()=>$("#kifu-modal").classList.remove("on"));
function toggleMute(){
  muted=!muted; setMuted(muted);
  const lbl=muted?"SOUND OFF":"SOUND ON";
  $("#bt-mute").textContent=lbl;
  $("#bt-mute-title").textContent=lbl;
}
$("#bt-mute").addEventListener("click",toggleMute);
$("#bt-mute-title").addEventListener("click",e=>{e.stopPropagation(); toggleMute();});
$("#bt-quit").addEventListener("click",()=>{
  if(!bt.over&&!confirm("侵入を中断してタイトルへ戻る?")) return;
  $("#game").classList.remove("on"); $("#title").classList.add("on");
  renderRouteCard(); startNetBg();
});

buildBoard();
