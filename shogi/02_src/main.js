/* ---------- 起動・コントロール配線 ---------- */
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
$("#bt-mute").addEventListener("click",e=>{
  muted=!muted; setMuted(muted);
  e.target.textContent=muted?"SOUND OFF":"SOUND ON";
});
$("#bt-quit").addEventListener("click",()=>{
  if(!bt.over&&!confirm("侵入を中断してタイトルへ戻る?")) return;
  $("#game").classList.remove("on"); $("#title").classList.add("on");
});

buildBoard();
