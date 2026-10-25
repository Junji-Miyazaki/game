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
