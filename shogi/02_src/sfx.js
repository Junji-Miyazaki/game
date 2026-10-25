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
