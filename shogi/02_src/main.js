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

/* ---------- タイトル背景: データアート(テキストストリーム×パースグリッド×ノード網) ----------
   参照: 池田亮二系の微細データ描写+工学ワイヤーフレーム。白基調・低彩度、発光は瞬間のみ。 */
let netBgRun=false;
const GLYPHS="01748ACEF∴∵ΔΣ歩銀金角飛玉成#%&+=<>/\\|";
function startNetBg(){
  if(netBgRun) return;
  netBgRun=true;
  const cv=$("#net-bg"), ctx=cv.getContext("2d");
  // テキストストリーム列
  const COLS=9, cols=[];
  for(let i=0;i<COLS;i++) cols.push({
    x:0.04+0.92*Math.random(), y:Math.random(),
    sp:(0.0006+Math.random()*0.0022)*(Math.random()<0.5?1:-1),
    n:14+(Math.random()*18|0), fs:9+(Math.random()*3|0),
    chars:Array.from({length:40},()=>GLYPHS[(Math.random()*GLYPHS.length)|0]),
    hot:Math.random()<0.22,
  });
  // 浮遊ノード網(白・微細)
  const NODES=24, nodes=[];
  for(let i=0;i<NODES;i++) nodes.push({
    x:Math.random(), y:Math.random(),
    vx:(Math.random()-.5)*0.0003, vy:(Math.random()-.5)*0.0003,
  });
  let t=0, flickerAt=180+Math.random()*240;
  function frame(){
    if(!$("#title").classList.contains("on")){ netBgRun=false; return; }
    const W=cv.clientWidth, H=cv.clientHeight;
    if(cv.width!==W||cv.height!==H){cv.width=W;cv.height=H;}
    ctx.clearRect(0,0,W,H);
    t++;
    // 1) パースグリッド(奥行きトンネル、ゆっくり呼吸)
    const vx=W/2, vy=H*0.46, zoom=1+0.05*Math.sin(t*0.004);
    ctx.strokeStyle="rgba(140,170,210,0.07)"; ctx.lineWidth=1;
    for(let k=1;k<=7;k++){
      const s=Math.pow(k/7,1.7)*zoom;
      ctx.strokeRect(vx-W*0.46*s, vy-H*0.40*s, W*0.92*s, H*0.80*s);
    }
    for(const [cx,cy] of [[-0.46,-0.40],[0.46,-0.40],[-0.46,0.40],[0.46,0.40],[0,-0.40],[0,0.40],[-0.46,0],[0.46,0]]){
      ctx.beginPath(); ctx.moveTo(vx+cx*W*0.13, vy+cy*H*0.13);
      ctx.lineTo(vx+cx*W*zoom, vy+cy*H*zoom); ctx.stroke();
    }
    // 2) テキストストリーム
    ctx.textBaseline="top";
    for(const c of cols){
      c.y+=c.sp;
      if(c.y>1.2) c.y=-0.2; if(c.y<-0.2) c.y=1.2;
      ctx.font=c.fs+"px monospace";
      for(let k=0;k<c.n;k++){
        const yy=((c.y+k*0.028)%1.4-0.2)*H;
        if(yy<-14||yy>H) continue;
        if(Math.random()<0.012) c.chars[k%c.chars.length]=GLYPHS[(Math.random()*GLYPHS.length)|0];
        const head=k===0;
        ctx.fillStyle=head&&c.hot?"rgba(25,227,255,.8)":
          head?"rgba(220,235,255,.55)":`rgba(150,180,215,${0.05+0.13*(1-k/c.n)})`;
        ctx.fillText(c.chars[k%c.chars.length], c.x*W, yy);
      }
    }
    // 3) ノード網(白微細)
    ctx.lineWidth=1;
    for(const n of nodes){
      n.x+=n.vx; n.y+=n.vy;
      if(n.x<0||n.x>1) n.vx*=-1;
      if(n.y<0||n.y>1) n.vy*=-1;
    }
    const R=0.16;
    for(let i=0;i<NODES;i++)for(let j=i+1;j<NODES;j++){
      const a=nodes[i], b=nodes[j];
      const d=Math.hypot(a.x-b.x,a.y-b.y);
      if(d<R){
        ctx.strokeStyle=`rgba(200,220,245,${(1-d/R)*0.14})`;
        ctx.beginPath(); ctx.moveTo(a.x*W,a.y*H); ctx.lineTo(b.x*W,b.y*H); ctx.stroke();
      }
    }
    ctx.fillStyle="rgba(220,235,255,.6)";
    for(const n of nodes) ctx.fillRect(n.x*W-1,n.y*H-1,2,2);
    // 4) フリッカー帯(数秒に一度、1-2フレーム)
    if(t>flickerAt){
      if(t<flickerAt+2){
        const y=Math.random()*H, h=4+Math.random()*30;
        ctx.fillStyle="rgba(230,240,255,0.10)";
        ctx.fillRect(0,y,W,h);
        ctx.fillStyle="rgba(25,227,255,0.05)";
        ctx.fillRect(0,0,W,H);
      } else flickerAt=t+180+Math.random()*300;
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
