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
    const col=s===0?"#19e3ff":"#ff2d95", op=s===0?0.45:0.28;
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
      let sub="";
      if(pc.frozen>0) sub=`<span class="lv">STUN ${pc.frozen}</span>`;
      else if(offline) sub=`<span class="lv">OFFLINE</span>`;
      d.innerHTML=(rk(pc)&&pc.t!=="K"?`<span class="rk">★</span>`:"")+
        `<span class="g">${pc.p?PDEF[pc.t].pg:PDEF[pc.t].g}</span>`+sub;
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
