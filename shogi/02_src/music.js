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
