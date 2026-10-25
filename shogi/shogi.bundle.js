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
      sDown=()=>{beep(45,.4,"sawtooth",.09); setTimeout(()=>beep(30,.5,"sawtooth",.07),120);},
      sConnect=()=>{beep(659,.06,"square",.035); setTimeout(()=>beep(988,.09,"square",.035),70);},
      sDisc=()=>{beep(494,.07,"sawtooth",.045); setTimeout(()=>beep(220,.13,"sawtooth",.045),70);},
      sPromote=()=>{[659,784,988,1319].forEach((f,i)=>setTimeout(()=>beep(f,.1,"triangle",.05),i*55));},
      sDeploy=()=>{beep(165,.06,"square",.06); setTimeout(()=>beep(880,.05,"square",.03),50);};

/* ===== music.js ===== */
/* ---------- MUSIC(全WebAudio合成、アセットなし) ----------
   構成(ユーザー決定 2026-10-25):
     A SPY CLAV(5/4)   → タイトル / 全制圧後の凱旋ループ
     B INTERLOCK(7×5)  → 対局中ベッド(ミニマル化+イベント/陣営レイヤー)
     C ELECTRO(4/4+7/8)→ 敗北・コンティニュー画面
     勝利スティンガー・ステージクリア = Aのクラビリフ由来
   楽器・音量感は 07_lab/music_audition.html で整合済みの係数を踏襲。
   AC・muted は sfx.js とバンドルスコープで共有。
------------------------------------------------------------ */
const Music=(()=>{

const mtof=m=>440*Math.pow(2,(m-69)/12);
const E1=28,E2=40,G2=43,A2=45,BB2=46,B2=47,CS3=49,D3=50,E3=52,G3=55,A3=57,B3=59,
      D4=62,CS4=61,E4=64,FS4=66,G4=67,BB4=70,B4=71,D5=74;

let chain=null, cur=null, timer=null, sustained=[];
let mood={danger:false, alarm:false}, faction=null;

function ensure(){
  if(!AC) AC=new (window.AudioContext||window.webkitAudioContext)();
  if(!chain){
    const mg=AC.createGain();
    mg.gain.value=muted?0.0001:0.8;
    const comp=AC.createDynamicsCompressor();
    comp.threshold.value=-18; comp.ratio.value=4; comp.attack.value=0.004; comp.release.value=0.18;
    mg.connect(comp).connect(AC.destination);
    chain={mg};
  }
}
function applyMute(m){
  if(chain) chain.mg.gain.setTargetAtTime(m?0.0001:0.8, AC.currentTime, 0.05);
}

/* ---- 素材 ---- */
let _noise=null;
function noiseB(){
  if(_noise) return _noise;
  const b=AC.createBuffer(1,AC.sampleRate,AC.sampleRate), d=b.getChannelData(0);
  for(let i=0;i<d.length;i++) d[i]=Math.random()*2-1;
  return _noise=b;
}
const _ks=new Map();
function ksB(m){
  if(_ks.has(m)) return _ks.get(m);
  const sr=AC.sampleRate, N=Math.round(sr/mtof(m)), len=Math.floor(sr*1.2);
  const b=AC.createBuffer(1,len,sr), d=b.getChannelData(0);
  for(let i=0;i<N;i++) d[i]=Math.random()*2-1;
  for(let i=N;i<len;i++){ const p2=i-N-1>=0?d[i-N-1]:d[0]; d[i]=0.996*0.5*(d[i-N]+p2); }
  _ks.set(m,b);
  return b;
}
function env(t,a,peak,d,end){
  const g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(Math.max(peak,0.0001),t+a);
  g.gain.exponentialRampToValueAtTime(Math.max(end,0.0001),t+a+d);
  return g;
}

/* ---- 楽器(dest指定) ---- */
function bass(dest,t,m,dur,v,acid){
  const f=mtof(m);
  const o1=AC.createOscillator(); o1.type="sawtooth"; o1.frequency.value=f;
  const o2=AC.createOscillator(); o2.type="sine"; o2.frequency.value=f;
  const o3=AC.createOscillator(); o3.type="triangle"; o3.frequency.value=f*2;
  const lp=AC.createBiquadFilter(); lp.type="lowpass"; lp.Q.value=acid?11:4;
  lp.frequency.setValueAtTime(acid?240+2200*v:300+1300*v,t);
  lp.frequency.exponentialRampToValueAtTime(acid?200:130,t+0.16);
  const g=env(t,0.004,0.32*v,dur,0.001);
  const g2=AC.createGain(); g2.gain.value=0.5;
  const g3=AC.createGain(); g3.gain.value=0.16;
  o1.connect(lp); o2.connect(g2).connect(lp); o3.connect(g3).connect(lp);
  lp.connect(g).connect(dest);
  [o1,o2,o3].forEach(o=>{o.start(t);o.stop(t+dur+0.1);});
}
function clav(dest,t,m,dur,v){
  const f=mtof(m);
  const o1=AC.createOscillator(); o1.type="sawtooth"; o1.frequency.value=f;
  const o2=AC.createOscillator(); o2.type="square"; o2.frequency.value=f*1.004;
  const bp=AC.createBiquadFilter(); bp.type="bandpass";
  bp.frequency.value=Math.min(4200,Math.max(900,f*4)); bp.Q.value=1.1;
  const g=env(t,0.002,0.26*v,Math.min(dur,0.18),0.001);
  const g2=AC.createGain(); g2.gain.value=0.5;
  o1.connect(bp); o2.connect(g2).connect(bp);
  bp.connect(g).connect(dest);
  [o1,o2].forEach(o=>{o.start(t);o.stop(t+0.3);});
}
function ep(dest,t,m,dur,v){
  const f=mtof(m);
  const car=AC.createOscillator(); car.type="sine"; car.frequency.value=f;
  const mod=AC.createOscillator(); mod.type="sine"; mod.frequency.value=f*2;
  const mg=AC.createGain();
  mg.gain.setValueAtTime(f*1.2,t);
  mg.gain.exponentialRampToValueAtTime(f*0.06,t+dur*0.7);
  mod.connect(mg).connect(car.frequency);
  const g=AC.createGain();
  g.gain.setValueAtTime(0.0001,t);
  g.gain.exponentialRampToValueAtTime(0.16*v,t+0.006);
  g.gain.exponentialRampToValueAtTime(0.0008,t+dur);
  car.connect(g).connect(dest);
  [car,mod].forEach(o=>{o.start(t);o.stop(t+dur+0.1);});
}
const epChord=(dest,t,arr,dur,v)=>{for(const m of arr) ep(dest,t,m,dur,v/Math.sqrt(arr.length));};
const clavChord=(dest,t,arr,dur,v)=>{for(const m of arr) clav(dest,t,m,dur,v/Math.sqrt(arr.length));};
function ks(dest,t,m,v){
  const s=AC.createBufferSource(); s.buffer=ksB(m);
  const g=AC.createGain(); g.gain.value=0.5*v;
  s.connect(g).connect(dest); s.start(t);
}
function kick(dest,t,v){
  const o=AC.createOscillator(); o.type="sine";
  o.frequency.setValueAtTime(130,t);
  o.frequency.exponentialRampToValueAtTime(42,t+0.11);
  const g=env(t,0.002,0.5*v,0.16,0.001);
  o.connect(g).connect(dest); o.start(t); o.stop(t+0.3);
}
function hat(dest,t,v,open){
  const s=AC.createBufferSource(); s.buffer=noiseB();
  const hp=AC.createBiquadFilter(); hp.type="highpass"; hp.frequency.value=7500;
  const g=env(t,0.001,0.12*v,open?0.22:0.035,0.0005);
  s.connect(hp).connect(g).connect(dest); s.start(t); s.stop(t+0.3);
}
function clap(dest,t,v){
  for(const dt of [0,0.012,0.026]){
    const s=AC.createBufferSource(); s.buffer=noiseB();
    const bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=1500; bp.Q.value=0.9;
    const g=env(t+dt,0.001,0.2*v*(dt?0.7:1),dt<0.02?0.03:0.14,0.0008);
    s.connect(bp).connect(g).connect(dest); s.start(t+dt); s.stop(t+dt+0.25);
  }
}
function rim(dest,t,v){
  const s=AC.createBufferSource(); s.buffer=noiseB();
  const bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=3200; bp.Q.value=2;
  const g=env(t,0.001,0.18*v,0.025,0.0008);
  s.connect(bp).connect(g).connect(dest); s.start(t); s.stop(t+0.08);
}
function glitch(dest,t,v){
  const s=AC.createBufferSource(); s.buffer=noiseB();
  s.playbackRate.value=0.4+Math.random()*1.4;
  const bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.frequency.value=900+Math.random()*3500; bp.Q.value=6;
  const g=env(t,0.001,0.1*v,0.04,0.0008);
  s.connect(bp).connect(g).connect(dest); s.start(t); s.stop(t+0.08);
}
function blip(dest,t,f,v){
  const o=AC.createOscillator(); o.type="square"; o.frequency.value=f;
  const g=env(t,0.001,0.05*v,0.05,0.0005);
  o.connect(g).connect(dest); o.start(t); o.stop(t+0.1);
}
function sweep(dest,t,dur,f0,f1,v){
  const s=AC.createBufferSource(); s.buffer=noiseB();
  const bp=AC.createBiquadFilter(); bp.type="bandpass"; bp.Q.value=3;
  bp.frequency.setValueAtTime(f0,t);
  bp.frequency.exponentialRampToValueAtTime(f1,t+dur);
  const g=env(t,0.01,0.14*v,dur,0.001);
  s.connect(bp).connect(g).connect(dest); s.start(t); s.stop(t+dur+0.1);
}

/* ============ A: タイトル(SPY CLAV 5/4 104bpm) ============ */
const A_STEP=60/104/4;
const A_C1=[E4,G4,D5], A_C2=[D4,FS4,B4], A_SP=[E4,BB4,D5];
const A_BASS_A={0:[E2,2,1],3:[E2,1,.35],6:[G2,1,.8],8:[A2,2,.9],11:[A2,1,.35],12:[E2,2,1],15:[D3,1,.7],16:[BB2,2,.95],18:[A2,2,.8]};
const A_BASS_B={0:[E2,2,1],3:[E2,1,.35],6:[G2,1,.8],8:[A2,2,.9],12:[E2,2,1],16:[BB2,1,.9],17:[B2,1,.9],18:[CS3,1,.85],19:[D3,1,.85]};
const A_CLAV={2:[A_C1,.9],5:[A_C1,.45],7:[A_C2,.8],10:[A_C1,.6],13:[A_C1,.9],16:[A_SP,.85],18:[A_C2,.5]};
function stepTitle(dest,n,t){
  const bar=((n/20)|0)%8, i=n%20;
  if(i%2===1) t+=0.013;
  const bl=(bar%2===0)?A_BASS_A:A_BASS_B;
  if(bl[i]) bass(dest,t,bl[i][0],bl[i][1]*A_STEP*0.95,bl[i][2]);
  if(A_CLAV[i]) clavChord(dest,t,A_CLAV[i][0],0.14,A_CLAV[i][1]);
  if(i===0||i===8||i===13) kick(dest,t,i===0?1:.85);
  if(i===4||i===12) clap(dest,t,.7);
  if(i===9) rim(dest,t,.35);
  if(i%2===0) hat(dest,t,[2,6,10,14,18].includes(i)?.75:.45,false);
  if(i===18&&bar%2===1) hat(dest,t,.8,true);
  if(bar>=4){
    if(bar===4&&i===0) epChord(dest,t,[E3,B3,D4,FS4,B4],2.2,.8);
    if(bar===6&&i===0) epChord(dest,t,[D3,A3,D4,FS4],2.0,.75);
    if(bar===7&&i===16) epChord(dest,t,[BB2,E3,BB4],1.2,.8);
  }
}

/* ============ B: 対局中(INTERLOCK ミニマル+レイヤー) ============ */
const B_STEP=60/108/2;
const B_G1=[[E3,1],[G3,.65],[B3,.8],[D4,.65],[CS4,.9],[B3,.6],[G3,.75]];
const B_G2=[[B4,.5],[G4,.4],[E4,.45],[D4,.4],[FS4,.5]];
function stepBattle(dest,n,t){
  const g1=B_G1[n%7];
  ks(dest,t,g1[0],g1[1]*0.75);                        // ベッド: 撥弦オスティナート
  const i=n%10;
  if(i===0) bass(dest,t,E2,1.2*B_STEP,.7,faction==="hacker");
  if(i===5) bass(dest,t,A2,1.0*B_STEP,.55,faction==="hacker");
  hat(dest,t,i===0?.4:.22,false);
  if(mood.danger){                                     // 王手: リズム強化+対旋律
    if(i===0) kick(dest,t,.8);
    if(i===4||i===7) rim(dest,t,.5);
    const g2=B_G2[n%5]; ks(dest,t+0.5*B_STEP,g2[0],g2[1]*.8);
  }
  if(mood.alarm) blip(dest,t,n%2?1760:1318,.8);        // BLACKOUT間近: 警告パルス
  if(n%70===0){                                        // 回線同期の瞬間
    epChord(dest,t,[E3,B3,D4,FS4,B4],2.6,.75);
    hat(dest,t,.7,true);
  }
  // 陣営レイヤー
  if(faction==="botnet"&&(n%14===3||n%14===10)) glitch(dest,t,.9);
  if(faction==="corp"&&n%40===20) epChord(dest,t,[E3,B3,FS4],2.2,.5);
  if(faction==="hacker"&&n%20===13) bass(dest,t,BB2,0.8*B_STEP,.5,true);
}
function startStateDrone(dest){                        // state: 持続ドローン(監視網)
  const g=AC.createGain(); g.gain.value=0.0001;
  g.gain.setTargetAtTime(0.055,AC.currentTime,1.2);
  const lp=AC.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=320;
  const o1=AC.createOscillator(); o1.type="sawtooth"; o1.frequency.value=mtof(E1);
  const o2=AC.createOscillator(); o2.type="triangle"; o2.frequency.value=mtof(E2)*1.003;
  o1.connect(lp); o2.connect(lp); lp.connect(g).connect(dest);
  o1.start(); o2.start();
  sustained.push({stop(){g.gain.setTargetAtTime(0.0001,AC.currentTime,0.3);
    setTimeout(()=>{try{o1.stop();o2.stop();g.disconnect();}catch(e){}},1500);}});
}

/* ============ C: 敗北・コンティニュー(ELECTRO) ============ */
const C_STEP=60/114/4;
const C_BASS={0:[E2,1,1],2:[E2,1,.5],6:[G2,1,.7],8:[E2,1,.9],11:[BB2,1,.6],12:[A2,1,.8],14:[E3,1,.55]};
const C_BASS4={0:[E2,2,1],4:[G2,2,.8],8:[A2,2,.85],12:[BB2,2,.9]};
function stepResult(dest,n,t){
  const cyc=62, pos=n%cyc, loop=((n/cyc)|0)%2;
  let bar,i;
  if(pos<16){bar=0;i=pos;} else if(pos<32){bar=1;i=pos-16;} else if(pos<48){bar=2;i=pos-32;} else {bar=3;i=pos-48;}
  if(bar<3){
    if(C_BASS[i]) bass(dest,t,C_BASS[i][0],C_BASS[i][1]*C_STEP*0.9,C_BASS[i][2]);
    if(i===0||i===7||i===10) kick(dest,t,i===0?1:.8);
    if(i===4||i===12) clap(dest,t,.8);
    if(i%2===0) hat(dest,t,i%4===2?.7:.4,false);
    if(i===14) hat(dest,t,.7,true);
    if(bar===1&&(i===4||i===12)) clavChord(dest,t,A_C1,0.12,.7);
    if(bar===2&&i===0&&loop===1) epChord(dest,t,[E3,B3,D4,FS4],1.6,.75);
  }else{
    if(C_BASS4[i]) bass(dest,t,C_BASS4[i][0],C_BASS4[i][1]*C_STEP*0.9,C_BASS4[i][2]);
    if(i===0||i===8) kick(dest,t,.95);
    if(i===4) clap(dest,t,.8);
    if(i%2===0) hat(dest,t,.45,false);
    if(i===10) sweep(dest,t,0.45,400,5200,.9);
  }
}

/* ---- トラック制御 ---- */
const TRACKS={
  title:{dur:A_STEP, gain:0.95, step:stepTitle},
  battle:{dur:B_STEP, gain:0.62, step:stepBattle},
  result:{dur:C_STEP, gain:1.05, step:stepResult},
};
function stopTrack(){
  if(timer){clearInterval(timer); timer=null;}
  for(const s of sustained) s.stop();
  sustained=[];
  if(cur){
    const g=cur.g;
    try{g.gain.setTargetAtTime(0.0001,AC.currentTime,0.18);}catch(e){}
    setTimeout(()=>{try{g.disconnect();}catch(e){}},900);
    cur=null;
  }
}
function play(name){
  ensure();
  if(cur&&cur.name===name) return;
  stopTrack();
  const tr=TRACKS[name];
  const g=AC.createGain(); g.gain.value=0.0001;
  g.connect(chain.mg);
  g.gain.setTargetAtTime(tr.gain,AC.currentTime,0.3);
  cur={name,tr,g,n:0,next:AC.currentTime+0.12};
  if(name==="battle"&&faction==="state") startStateDrone(g);
  timer=setInterval(()=>{
    if(!cur) return;
    while(cur.next<AC.currentTime+0.45){
      cur.tr.step(cur.g,cur.n,cur.next);
      cur.n++; cur.next+=cur.tr.dur;
    }
  },100);
}

/* ---- スティンガー ---- */
function stingClear(){                                 // ステージクリア: Aリフ由来の上昇
  ensure();
  const t=AC.currentTime+0.03, s=0.11;
  [[E4,.9],[G4,.8],[B4,.9],[D5,1]].forEach((x,k)=>clav(chain.mg,t+k*s,x[0],0.12,x[1]));
  epChord(chain.mg,t+4*s,[E3,B3,E4,G4,B4],1.8,.9);
  hat(chain.mg,t+4*s,.8,true);
}
function stingWin(){                                   // 全制圧: 凱旋→タイトル曲へ
  ensure(); stopTrack();
  const t=AC.currentTime+0.03, s=0.13;
  [[E4,.9],[G4,.85],[B4,.9],[D5,.95],[E4+12,1]].forEach((x,k)=>clav(chain.mg,t+k*s,x[0],0.13,x[1]));
  epChord(chain.mg,t+5*s,[E3,B3,D4,FS4,B4,E4+12],2.6,1);
  kick(chain.mg,t+5*s,1);
  setTimeout(()=>play("title"),2800);
}

return {
  title:()=>play("title"),
  battle:(fid)=>{faction=fid; mood={danger:false,alarm:false}; play("battle");},
  result:(win)=>{ if(win) stingWin(); else play("result"); },
  stageClear:()=>{ stopTrack(); stingClear(); },
  setMood:(danger,alarm)=>{mood.danger=!!danger; mood.alarm=!!alarm;},
  applyMute,
  stop:stopTrack,
  _state:()=>({track:cur&&cur.name, n:cur&&cur.n, faction, mood:{...mood}, sustained:sustained.length}),
};
})();

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
  Music.battle(fid);
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
  setTimeout(()=>fxSpawn(i,"#ffd23e","star"),60);
  if(pc.s===0) showHint("rank");
}

/* ---------- 演出(FX) ---------- */
let fxCtx=null, fxP=[], fxLoop=false;
let ghostCell=-1, ghostUntil=0;                 // 移動アニメ中の実駒隠し
let fxNet={on:new Set(), off:new Set(), until:0}; // 回線変化の発光
let promoCell=-1, promoUntil=0;
let prevNet=null;                                // 前回renderのオンライン状態

function fxSpawn(i,color,kind){
  const cv=fxCtx.canvas;
  const x=(i%N+0.5)/N*cv.width, y=(((i/N)|0)+0.5)/N*cv.height;
  if(kind==="burst")for(let k=0;k<16;k++){
    const a=Math.random()*6.283, v=(1.5+Math.random()*3)*cv.width/360;
    fxP.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,dec:.045,color,w:1.6,kind:"p"});
  }
  if(kind==="ring") fxP.push({x,y,r:4,vr:cv.width/180,life:1,dec:.05,color,kind:"r"});
  if(kind==="star"){
    fxP.push({x,y,r:4,vr:cv.width/150,life:1,dec:.04,color,kind:"r"});
    for(let k=0;k<10;k++){
      const a=k/10*6.283, v=(2+Math.random()*2)*cv.width/360;
      fxP.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:1,dec:.03,color,w:2.2,kind:"p"});
    }
  }
  if(!fxLoop){fxLoop=true; requestAnimationFrame(fxFrame);}
}
function fxFrame(){
  const cv=fxCtx.canvas, W=cv.clientWidth, H=cv.clientHeight;
  if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
  fxCtx.clearRect(0,0,W,H);
  fxP=fxP.filter(p=>p.life>0);
  for(const p of fxP){
    p.life-=p.dec;
    fxCtx.globalAlpha=Math.max(p.life,0);
    if(p.kind==="p"){
      p.x+=p.vx; p.y+=p.vy; p.vx*=.96; p.vy*=.96;
      fxCtx.fillStyle=p.color;
      fxCtx.fillRect(p.x-p.w/2,p.y-p.w/2,p.w,p.w);
    }else{
      p.r+=p.vr;
      fxCtx.strokeStyle=p.color; fxCtx.lineWidth=1.5;
      fxCtx.beginPath(); fxCtx.arc(p.x,p.y,p.r,0,6.283); fxCtx.stroke();
    }
  }
  fxCtx.globalAlpha=1;
  if(fxP.length){requestAnimationFrame(fxFrame);} else fxLoop=false;
}
// 駒クローンを飛ばす移動アニメ(状態は確定済み、見た目だけ)
function animateMove(from,to){
  const bd=$("#board"), c2=bd.children[to];
  const pcEl=c2&&c2.querySelector(".pc");
  if(!pcEl) return;
  const rb=bd.getBoundingClientRect(), rp=pcEl.getBoundingClientRect();
  const r1=bd.children[from].getBoundingClientRect();
  const r2=bd.children[to].getBoundingClientRect();
  const wrap=document.createElement("div");
  wrap.className="movewrap";
  wrap.style.left=(rp.left-rb.left)+"px"; wrap.style.top=(rp.top-rb.top)+"px";
  wrap.style.width=rp.width+"px"; wrap.style.height=rp.height+"px";
  wrap.style.transform=`translate(${r1.left-r2.left}px,${r1.top-r2.top}px)`;
  wrap.appendChild(pcEl.cloneNode(true));
  bd.appendChild(wrap);
  ghostCell=to; ghostUntil=performance.now()+170;
  render();
  requestAnimationFrame(()=>{wrap.style.transform="translate(0,0)";});
  setTimeout(()=>{wrap.remove(); ghostCell=-1; if(bt&&!bt.over) render();},180);
}
function fxPromote(i){
  promoCell=i; promoUntil=performance.now()+750;
  fxSpawn(i,"#ffd23e","ring"); fxSpawn(i,"#ffd23e","burst");
  sPromote();
  setTimeout(()=>{promoCell=-1; if(bt&&!bt.over) render();},780);
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
  const cv=document.createElement("canvas");
  cv.id="fxcv";
  bd.appendChild(cv);
  fxCtx=cv.getContext("2d");
}
function drawNet(nets){
  const svg=$("#netsvg");
  let out="";
  const ctr=i=>[(i%N+0.5)*20,(((i/N)|0)+0.5)*20];
  for(const s of [0,1]){
    const col=s===0?"#e9e7e2":(FCOLOR[bt.faction]||"#ff2d95"), op=s===0?0.45:0.28;
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
  // 回線 接続/切断の検出(同一対局内の前回renderと比較)
  const curNet=new Map();
  for(let i=0;i<N*N;i++){
    const p=bt.board[i];
    if(p&&p.t!=="K") curNet.set(i+","+p.s, nets.on[p.s].has(i)||(p.t==="R"&&rk(p)));
  }
  if(prevNet&&prevNet.bt===bt){
    const on=new Set(), off=new Set();
    for(const [k,v] of curNet){
      const old=prevNet.map.get(k);
      if(old===undefined||old===v) continue;
      const i=+k.split(",")[0];
      (v?on:off).add(i);
    }
    if(on.size||off.size){
      fxNet={on,off,until:performance.now()+650};
      const svg=$("#netsvg");
      svg.classList.remove("flash"); void svg.getBoundingClientRect(); svg.classList.add("flash");
      setTimeout(()=>svg.classList.remove("flash"),600);
      if(off.size) sDisc(); else sConnect();
    }
  }
  prevNet={bt,map:curNet};
  const inChk=!bt.over&&inCheck(bt.board,bt.hands,0);
  for(let i=0;i<N*N;i++){
    const cell=$("#board").children[i], pc=bt.board[i];
    cell.className="cell";
    if(bt.down.has(i)){
      cell.classList.add("down"); cell.innerHTML="";
      const co=document.createElement("span"); co.className="coord"; co.textContent=cellName(i);
      cell.appendChild(co);
      continue;
    }
    if(sel&&sel.type==="board"&&sel.i===i) cell.classList.add("selc");
    if(bt.lastMove&&bt.lastMove.to===i) cell.classList.add("lastmv");
    if(bt.fx&&bt.fx.i===i&&performance.now()-bt.fx.t<950) cell.classList.add("hacked");
    const tg=targets.find(m=>m.to===i);
    if(tg){cell.classList.add("movable"); if(pc)cell.classList.add("cap");}
    if(pc&&pc.t==="K"&&pc.s===0&&inChk) cell.classList.add("checkk");
    if(ghostCell===i&&performance.now()<ghostUntil) cell.classList.add("ghosted");
    if(promoCell===i&&performance.now()<promoUntil) cell.classList.add("promoflash");
    cell.innerHTML="";
    {
      const co=document.createElement("span"); co.className="coord"; co.textContent=cellName(i);
      cell.appendChild(co);
    }
    if(bt.pending.has(i)){
      const b=document.createElement("span");
      b.className="cd"; b.textContent=bt.pending.get(i);
      cell.appendChild(b);
    }
    if(pc){
      const offline=pc.t!=="K"&&!nets.on[pc.s].has(i)&&!(pc.t==="R"&&rk(pc));
      const netfx=fxNet.until>performance.now()?(fxNet.on.has(i)?" fx-on":fxNet.off.has(i)?" fx-off":""):"";
      const d=document.createElement("div");
      d.className=`pc s${pc.s}${pc.p?" promo":""}${pc.frozen>0?" frozen":""}${offline?" offline":""}${netfx}`;
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
  } else if(m.drop){ sDeploy(); } else sMove();
  render();
  if(m.drop){ fxSpawn(m.to,"#19e3ff","ring"); }
  else animateMove(m.from,m.to);
  if(captured) fxSpawn(m.to,FCOLOR[bt.faction]||"#ff2d95","burst");
  if(m.promo) fxPromote(m.to);
  if(captured&&captured.t==="K"){ stageWin(); return; }
  if(tickBlackout()) return;
  render();
  updateMood();
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
  if(m.drop){ fxSpawn(m.to,FCOLOR[bt.faction]||"#ff2d95","ring"); sDeploy(); }
  else animateMove(m.from,m.to);
  if(captured) fxSpawn(m.to,"#19e3ff","burst");
  if(m.promo) fxPromote(m.to);
  if(captured&&captured.t==="K"){ runOver(false); return; }
  if(tickBlackout()) return;
  render();
  const pl=legalMoves(bt.board,bt.hands,0);
  if(pl.length===0){ runOver(false); return; }
  if(inCheck(bt.board,bt.hands,0)) log(`<span class="m">⚠ WARNING: CEOが攻撃圏内 (王手)</span>`);
  updateMood();
  checkStateHints();
}

function updateMood(){
  if(!bt||bt.over) return;
  const danger=inCheck(bt.board,bt.hands,0);
  const alarm=[...bt.pending.values()].some(cd=>cd<=2);
  Music.setMood(danger,alarm);
}

// render()がclassNameをリセットするため、演出は状態(bt.fx)経由でrenderに反映する
function flashHack(i){
  bt.fx={i,t:performance.now()};
  setTimeout(()=>{ if(bt&&bt.fx&&bt.fx.i===i){ bt.fx=null; if(!bt.over) render(); } },950);
}

/* ---------- stage / run flow ---------- */
function stageWin(lockout){
  bt.over=true;
  if(run.stage>=2) Music.stop(); else Music.stageClear(); // 最終面はrunOver側で凱旋スティンガー
  sWin();
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
  Music.result(win);
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
    renderRouteCard(); startNetBg(); Music.title();
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
  // マーキー(流れるシステムテキスト)
  const mq=`INTRUSION PROTOCOL v4 ░ SEED #${seed} ░ ROUTE: ${lineup.map(f=>FACTIONS[f].nm).join(" > ")} ░ CAPTURE = HACK ░ 回線ヲ切断セヨ ░ OFFLINE UNITS CANNOT RUN ░ BLACKOUT IN PROGRESS ░ `;
  $("#marquee .mq").textContent=mq+mq;
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
  Music.title();
});

/* ---------- タイトル背景: ミニマル(回転する5×5ワイヤーフレーム格子+データ帯) ----------
   墨地に生成りの細線のみ。動くのはこの1要素。アクセント色は回線パルス1点だけ。 */
let netBgRun=false;
function startNetBg(){
  if(netBgRun) return;
  netBgRun=true;
  const cv=$("#net-bg"), ctx=cv.getContext("2d");
  const dpr=Math.min(window.devicePixelRatio||1,2);
  // 5×5の盤面格子上に、高さの異なる"塔"(ノード)を立てる=都市/データの柱
  const H=[];
  for(let i=0;i<25;i++) H.push(Math.random()<0.45?0.15+Math.random()*0.85:0);
  let t=0, pulse=null, bars=[];
  function proj(x,y,z,rot,W,Hh){
    const c=Math.cos(rot), s=Math.sin(rot);
    const X=x*c-y*s, Y=x*s+y*c;
    const tilt=0.52;
    const sx=X, sy=Y*Math.sin(tilt)-z*Math.cos(tilt);
    const narrow=W<760;
    const sc=Math.min(W,Hh)*(narrow?0.24:0.30);
    return narrow?[W*0.66+sx*sc, Hh*0.86+sy*sc]:[W*0.70+sx*sc, Hh*0.50+sy*sc];
  }
  function frame(){
    if(!$("#title").classList.contains("on")){ netBgRun=false; return; }
    const W=cv.clientWidth, Hh=cv.clientHeight;
    if(cv.width!==W*dpr||cv.height!==Hh*dpr){cv.width=W*dpr;cv.height=Hh*dpr;}
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,W,Hh);
    t++;
    const rot=t*0.0016;
    const g=k=>(k-2)*0.5;
    ctx.lineWidth=1;
    // 床の格子
    ctx.strokeStyle="rgba(233,231,226,0.13)";
    for(let k=0;k<=5;k++){
      const a=proj(-1.25+k*0.5,-1.25,0,rot,W,Hh), b=proj(-1.25+k*0.5,1.25,0,rot,W,Hh);
      ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke();
      const c=proj(-1.25,-1.25+k*0.5,0,rot,W,Hh), d=proj(1.25,-1.25+k*0.5,0,rot,W,Hh);
      ctx.beginPath(); ctx.moveTo(c[0],c[1]); ctx.lineTo(d[0],d[1]); ctx.stroke();
    }
    // 塔(垂直線)と頂点、近接頂点を結ぶ回線
    const tops=[];
    for(let i=0;i<25;i++){
      if(!H[i]) continue;
      const x=g(i%5), y=g((i/5)|0), z=H[i]*(0.9+0.1*Math.sin(t*0.01+i));
      const p0=proj(x,y,0,rot,W,Hh), p1=proj(x,y,z,rot,W,Hh);
      ctx.strokeStyle="rgba(233,231,226,0.30)";
      ctx.beginPath(); ctx.moveTo(p0[0],p0[1]); ctx.lineTo(p1[0],p1[1]); ctx.stroke();
      ctx.fillStyle="rgba(233,231,226,0.85)";
      ctx.fillRect(p1[0]-1.5,p1[1]-1.5,3,3);
      tops.push({i,p:p1,x:i%5,y:(i/5)|0});
    }
    ctx.strokeStyle="rgba(233,231,226,0.16)";
    const links=[];
    for(let a=0;a<tops.length;a++)for(let b=a+1;b<tops.length;b++){
      if(Math.max(Math.abs(tops[a].x-tops[b].x),Math.abs(tops[a].y-tops[b].y))===1){
        links.push([tops[a].p,tops[b].p]);
        ctx.beginPath(); ctx.moveTo(tops[a].p[0],tops[a].p[1]); ctx.lineTo(tops[b].p[0],tops[b].p[1]); ctx.stroke();
      }
    }
    // 回線パルス(唯一のアクセント)
    if(!pulse&&links.length&&Math.random()<0.025) pulse={l:(Math.random()*links.length)|0,k:0};
    if(pulse){
      pulse.k+=0.035;
      const L=links[pulse.l];
      if(!L||pulse.k>=1) pulse=null;
      else{
        ctx.fillStyle="#19e3ff";
        ctx.fillRect(L[0][0]+(L[1][0]-L[0][0])*pulse.k-2, L[0][1]+(L[1][1]-L[0][1])*pulse.k-2,4,4);
      }
    }
    // データ帯(池田亮二的バーコード) — 画面下部の細い帯
    if(t%4===0){
      bars=[];
      let x=0;
      while(x<W){ const w=1+((Math.random()*4)|0); if(Math.random()<0.5) bars.push([x,w]); x+=w+((Math.random()*3)|0); }
    }
    ctx.fillStyle="rgba(233,231,226,0.10)";
    const by=Hh-46;
    for(const [x,w] of bars) ctx.fillRect(x,by,w,6);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // 時計(メタ行)
  const tick=()=>{
    if(!$("#title").classList.contains("on")) return;
    const d=new Date(), z=n=>String(n).padStart(2,"0");
    const el=$("#g-clock"); if(el) el.textContent=`${z(d.getHours())}:${z(d.getMinutes())}:${z(d.getSeconds())}`;
    setTimeout(tick,1000);
  };
  tick();
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
  Music.applyMute(muted);
  const lbl=muted?"SOUND OFF":"SOUND ON";
  $("#bt-mute").textContent=lbl;
  $("#bt-mute-title").textContent=lbl;
}
$("#bt-mute").addEventListener("click",toggleMute);
$("#bt-mute-title").addEventListener("click",e=>{e.stopPropagation(); toggleMute();});
$("#bt-quit").addEventListener("click",()=>{
  if(!bt.over&&!confirm("侵入を中断してタイトルへ戻る?")) return;
  $("#game").classList.remove("on"); $("#title").classList.add("on");
  renderRouteCard(); startNetBg(); Music.title();
});

buildBoard();

/* ---------- タイトルロゴ: 信号モーション(強さ0.3) ----------
   普段は微振動、1.4〜3.9秒に一度、走査ずれのように一瞬(90ms)文字がずれる。07_lab/title_font_audition の C=signal と同式。 */
(function logoSignal(){
  const AMT=0.3;
  const logos=[...document.querySelectorAll(".g-logo")];
  const sets=logos.map(l=>{
    const chs=[];
    const walk=node=>{
      for(const n of [...node.childNodes]){
        if(n.nodeType===3){
          const frag=document.createDocumentFragment();
          for(const c of n.textContent){ const s=document.createElement("span"); s.className="ch"; s.textContent=c; frag.appendChild(s); chs.push(s); }
          node.replaceChild(frag,n);
        } else if(n.nodeType===1&&n.tagName!=="BR") walk(n);
      }
    };
    walk(l);
    return {chs,seed:Math.random()*100};
  });
  const nz=x=>Math.sin(x)*0.6+Math.sin(x*2.13+1.7)*0.3+Math.sin(x*4.7+0.3)*0.1;
  let until=0, next=1.5;
  function frame(ts){
    const t=ts/1000;
    if(!$("#title").classList.contains("on")&&!$("#boot").classList.contains("on")){ requestAnimationFrame(frame); return; }
    if(t>next){ until=t+0.09; next=t+1.4+Math.random()*2.5; }
    for(const S of sets) S.chs.forEach((s,i)=>{
      if(t<until){
        const off=(Math.random()-.5)*14*AMT;
        s.style.transform=`translateX(${(i%2?off:-off)*0.6}px) skewX(${off*0.4}deg)`;
      } else s.style.transform=`translateX(${nz(t*3+S.seed+i*1.37)*0.35*AMT}px)`;
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
