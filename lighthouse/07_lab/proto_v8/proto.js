const cv=document.getElementById('cv'),c=cv.getContext('2d'),W=640,H=360,GY=320,CS=6,END=9000,GRAV=520,PMAX=1500;
const MAT={st:{hp:.35,col:[214,184,110],pt:1,f:.5},wd:{hp:.8,col:[150,104,66],pt:2,f:.45},br:{hp:2,col:[168,84,62],pt:3,f:.4},co:{hp:3.4,col:[150,154,160],pt:4,f:.35},gl:{hp:1.4,col:[143,179,201],pt:3,f:.4},sl:{hp:6.5,col:[74,80,90],pt:6,f:.25},lw:{hp:60,col:[236,236,240],pt:5,f:.45},lr:{hp:60,col:[196,78,70],pt:5,f:.3},lp:{hp:100,col:[255,226,140],pt:40,f:.3},sn:{hp:22,col:[176,166,148],pt:6,f:.35},ck:{hp:60,col:[240,232,200],pt:30,f:.3},lg:{hp:45,col:[92,104,112],pt:6,f:.3},wt:{hp:40,col:[120,150,160],pt:8,f:.3}};
const ZONES=[{x:0,n:'村'},{x:1600,n:'町'},{x:3400,n:'都市'},{x:5400,n:'工業地帯'},{x:7300,n:'岬'}];
let S,ff=1;
function zoneAt(x){let z=0;for(let i=0;i<ZONES.length;i++)if(x>=ZONES[i].x)z=i;return z}
function mk(x,w,m){return {x,w:w*CS,cells:new Map(),orig:[],f:MAT[m].f,dirty:0}}
function put(b,r,k,m){b.cells.set(r*200+k,{r,k,m,hp:MAT[m].hp})}
function fin(b){for(const q of b.cells.values())b.orig[q.r]=(b.orig[q.r]||0)+1;return b}
function hut(x){const w=8+Math.floor(Math.random()*4),wh=3+Math.floor(Math.random()*2),b=mk(x,w+3,'wd');for(let r=0;r<wh;r++)for(let k=1;k<=w;k++)put(b,r,k,'wd');for(let r=0;r<w/2+1;r++)for(let k=r;k<=w+1-r;k++)put(b,wh+r,k,'st');return fin(b)}
function house(x){const w=10+Math.floor(Math.random()*5),wh=6+Math.floor(Math.random()*4),b=mk(x,w,'wd');for(let r=0;r<wh;r++)for(let k=0;k<w;k++)put(b,r,k,'wd');for(let r=0;r<w/2;r++)for(let k=r;k<w-r;k++)put(b,wh+r,k,'br');for(let r=0;r<3;r++)put(b,wh+2+r,w-3,'br');return fin(b)}
function brick(x){const w=9+Math.floor(Math.random()*6),h=9+Math.floor(Math.random()*10),b=mk(x,w,'br');for(let r=0;r<h;r++)for(let k=0;k<w;k++)put(b,r,k,(r%4===2&&k%3===1)?'gl':'br');return fin(b)}
function tower(x,glass){const w=7+Math.floor(Math.random()*6),h=15+Math.floor(Math.random()*13),b=mk(x,w,glass?'gl':'co');for(let r=0;r<h;r++)for(let k=0;k<w;k++)put(b,r,k,glass?((k===0||k===w-1||r%6===0)?'co':'gl'):'co');return fin(b)}
function pylon(x){const b=mk(x,17,'sl');for(let r=0;r<27;r++){const hw=Math.max(1,Math.round(6-r*.18));for(let k=-hw;k<=hw;k++){if(Math.abs(k)<hw-1&&r%3)continue;put(b,r,k+8,'sl')}}return fin(b)}
function light(x){const b=mk(x,19,'lw');b.light=1;for(let r=0;r<46;r++){const hw=r>41?3:r>38?5:Math.round(9-r*.1);for(let k=-hw;k<=hw;k++)put(b,r,k+9,r>41?'lp':(r>38?'lr':(Math.floor(r/7)%2?'lr':'lw')))}return fin(b)}
function clock(x){const b=mk(x,17,'sn');b.boss=1;b.core='ck';b.name='時計塔';for(let r=0;r<25;r++){const hw=r<17?8:r<19?6:Math.max(0,Math.round(5-(r-19)*.9));for(let k=-hw;k<=hw;k++){let m='sn';if(r>=10&&r<=15&&Math.abs(k)<=3)m='ck';else if(r<8&&r%4>=1&&r%4<=2&&Math.abs(k)%4===2)m='gl';put(b,r,k+8,m)}}return fin(b)}
function water(x){const b=mk(x,18,'lg');b.boss=1;b.core='wt';b.name='給水塔';for(let r=0;r<12;r++)for(let k=0;k<18;k++){const leg=k<=2||k>=15||(k>=7&&k<=10);if(leg||((r===5||r===10)&&k%2===0))put(b,r,k,'lg')}for(let r=12;r<22;r++)for(let k=0;k<18;k++)put(b,r,k,'wt');for(let r=22;r<26;r++)for(let k=r-21;k<18-(r-21);k++)put(b,r,k,'lg');return fin(b)}
function reset(){S={x:0,inc:[],birds:[],blds:[],chunks:[],wild:[],parts:[],pops:[],pts:60,score:0,armor:0,atk:1.6,ov:0,ovY:0,over:0,win:0,siege:0,cost:{b1:25,b2:40,b3:45},cid:0};
for(let i=0;i<40;i++)addBird(100+Math.random()*80,90+Math.random()*90);
const BX=[3150,6950];let x=460;while(x<END-700){if(BX.some(v=>x>v-80&&x<v+300)){x+=40;continue}const z=zoneAt(x),r=Math.random();let b;
if(z===0)b=r<.6?hut(x):house(x);else if(z===1)b=r<.45?house(x):brick(x);else if(z===2)b=r<.3?brick(x):tower(x,r<.7);else if(z===3)b=r<.45?pylon(x):tower(x,r<.75);else b=r<.6?house(x):hut(x);
S.blds.push(b);x+=b.w+30+Math.random()*(z<2?60:100);if(Math.random()<(z<2?.6:.4))S.wild.push({at:x-20,n:5+Math.floor(Math.random()*7)})}
S.L=light(END);S.L.boss=1;S.L.core='lp';S.L.name='灯台';S.L.final=1;const b1=clock(BX[0]),b2=water(BX[1]);S.blds.push(b1,b2,S.L);S.bossList=[b1,b2,S.L];S.bi=0;S.banner=0}
function addBird(x,y,vx,vy){S.birds.push({x:S.x+x,y,vx:vx||0,vy:vy||0,ox:-90+Math.random()*120,oy:-50+Math.random()*100,hp:2+S.armor,st:0,ph:Math.random()*6,stun:0,oa:Math.random()*6.28,orr:70+Math.random()*90,cd:Math.random()*2})}
const $=id=>document.getElementById(id);
function buy(k){if(S.pts<S.cost[k]||S.over||S.win)return;S.pts-=S.cost[k];if(k==='b1')for(let i=0;i<8;i++)addBird(60+Math.random()*80,80+Math.random()*80);if(k==='b2'){S.armor++;for(const b of S.birds)b.hp++}if(k==='b3')S.atk+=.8;S.cost[k]=Math.round(S.cost[k]*1.55)}
$('b1').onclick=()=>buy('b1');$('b2').onclick=()=>buy('b2');$('b3').onclick=()=>buy('b3');$('rs').onclick=()=>reset();
$('ff').onclick=()=>{ff=ff===1?3:1;$('ff').textContent='早送り ×'+ff};
cv.onclick=e=>{const r=cv.getBoundingClientRect();S.gx=S.x+(e.clientX-r.left)/r.width*W;S.gy=(e.clientY-r.top)/r.height*H;S.gt=2.5;for(const b of S.birds)if(b.st===1&&Math.random()<.5)b.st=0};
function cellAt(wx,wy){for(const b of S.blds){if(wx<b.x||wx>=b.x+b.w)continue;const k=Math.floor((wx-b.x)/CS),r=Math.floor((GY-wy)/CS);if(r<0)continue;const q=b.cells.get(r*200+k);if(q)return {b,q}}return null}
function part(x,y,vx,vy,col,s){if(S.parts.length>=PMAX)S.parts.shift();S.parts.push({x,y,vx,vy,t:0,col,s})}
const rgb=m=>'rgb('+MAT[m].col.join(',')+')';
function kill(b,q,mul){const key=q.r*200+q.k;if(!b.cells.has(key))return;b.cells.delete(key);b.dirty=1;S.score+=Math.round(MAT[q.m].pt*(mul||1));S.pts+=MAT[q.m].pt*.7*(mul||1);part(b.x+q.k*CS,GY-(q.r+1)*CS,-40+Math.random()*90,-70*Math.random(),rgb(q.m),CS*.8)}
function detach(b,list,tip){if(!list.length)return;let sx=0,sy=0;for(const q of list){b.cells.delete(q.r*200+q.k);sx+=b.x+(q.k+.5)*CS;sy+=GY-(q.r+.5)*CS}b.dirty=1;const cx=sx/list.length,cy=sy/list.length;
if(list.length<4){for(const q of list)part(b.x+q.k*CS,GY-(q.r+1)*CS,0,0,rgb(q.m),CS*.8);return}
let R=0;const cells=list.map(q=>{const lx=b.x+(q.k+.5)*CS-cx,ly=GY-(q.r+.5)*CS-cy;R=Math.max(R,Math.hypot(lx,ly));return {lx,ly,m:q.m}});
S.chunks.push({id:++S.cid,src:b,x:cx,y:cy,vx:0,vy:0,a:0,w:tip,cells,R,t:0})}
function structural(b){b.dirty=0;if(!b.cells.size)return;const seen=new Set(),st=[];
for(const [key,q] of b.cells)if(q.r===0){seen.add(key);st.push(q)}
while(st.length){const q=st.pop();for(const [a,e] of [[1,0],[-1,0],[0,1],[0,-1]]){const key=(q.r+a)*200+q.k+e;if(!seen.has(key)&&b.cells.has(key)){seen.add(key);st.push(b.cells.get(key))}}}
const loose=[];for(const [key,q] of b.cells)if(!seen.has(key))loose.push(q);if(loose.length)detach(b,loose,(Math.random()-.5)*.6);
let top=-1;const cnt=[],mn=[],mx=[],sk=[];for(const q of b.cells.values()){const r=q.r;top=Math.max(top,r);cnt[r]=(cnt[r]||0)+1;sk[r]=(sk[r]||0)+q.k;mn[r]=Math.min(mn[r]??99,q.k);mx[r]=Math.max(mx[r]??-99,q.k)}
let aN=0,aK=0;const cumN=[],cumK=[];for(let r=top;r>=0;r--){cumN[r]=aN;cumK[r]=aK;aN+=cnt[r]||0;aK+=sk[r]||0}
for(let r=0;r<top;r++){const n=cnt[r]||0;if(!n||!cumN[r])continue;const com=cumK[r]/cumN[r],mid=(mn[r]+mx[r])/2;
const weak=n/b.orig[r]<b.f,off=com<mn[r]-.5||com>mx[r]+.5;if(weak||off){const up=[];for(const q of b.cells.values())if(q.r>r)up.push(q);detach(b,up,Math.sign(com-mid||Math.random()-.5)*(off?.9:.35));break}}}
function stepChunks(dt){for(let i=S.chunks.length-1;i>=0;i--){const ch=S.chunks[i];ch.t+=dt;ch.vy+=GRAV*dt;ch.x+=ch.vx*dt;ch.y+=ch.vy*dt;ch.w*=1+dt*1.2;ch.w=Math.max(-3,Math.min(3,ch.w));ch.a+=ch.w*dt;
const ca=Math.cos(ch.a),sa=Math.sin(ch.a);let hit=null;
if(ch.t>.04)for(const q of ch.cells){const wx=ch.x+q.lx*ca-q.ly*sa,wy=ch.y+q.lx*sa+q.ly*ca+CS/2;if(wy>=GY){hit={g:1};break}const h=cellAt(wx,wy);if(h&&!(h.b===ch.src&&ch.t<.45)){hit=h;break}}
for(const bd of S.birds){if(bd.st===2||bd.hitBy===ch.id)continue;if(Math.hypot(bd.x-ch.x,bd.y-ch.y)<ch.R*.6){bd.hitBy=ch.id;bd.hp--;if(bd.hp<=0){bd.st=2;bd.vx=ch.vx;bd.vy=ch.vy}}}
if(hit){const sp=Math.hypot(ch.vx,ch.vy);for(const q of ch.cells){const wx=ch.x+q.lx*ca-q.ly*sa,wy=ch.y+q.lx*sa+q.ly*ca;S.score+=Math.round(MAT[q.m].pt*.8);S.pts+=MAT[q.m].pt*.5;part(wx,wy,ch.vx*.3+(Math.random()-.5)*120+q.lx*2,-Math.random()*sp*.35,rgb(q.m),CS*.8)}
if(hit.b){let dmg=ch.cells.length*sp*.004;const q=hit.q;for(const [a,e] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){if(dmg<=0)break;const n=hit.b.cells.get((q.r+a)*200+q.k+e);if(n){const d=Math.min(dmg,n.hp+.01);n.hp-=d;dmg-=d;if(n.hp<=0)kill(hit.b,n)}}}
S.chunks.splice(i,1)}}}
function bird(x,y,s,ang,fold,rot,col){c.save();c.translate(x,y);c.rotate(rot);c.strokeStyle=col;c.lineWidth=1.8;c.lineCap='round';c.lineJoin='round';const sp=s*(1-fold*.7),ex=sp*.5,ey=-Math.sin(ang)*s*.55,ty=-Math.sin(ang)*s*.2+s*.25*Math.max(0,ang);c.beginPath();c.moveTo(-sp,ty);c.lineTo(-ex,ey);c.lineTo(0,0);c.lineTo(ex,ey);c.lineTo(sp,ty);c.stroke();c.restore()}
function aimY(){if(S.ov>0)return S.ovY;for(const b of S.blds){if(b.light||b.x+b.w<S.x+170||b.x>S.x+540||!b.cells.size)continue;let top=0;for(const q of b.cells.values())top=Math.max(top,q.r);return Math.min(GY-14,GY-top*CS*(.12+.4*(.5+.5*Math.sin(S.x*.005))))}return 150}
function exposed(b){const e=[];for(const q of b.cells.values()){if(!b.cells.has(q.r*200+q.k-1)||!b.cells.has(q.r*200+q.k+1)||!b.cells.has((q.r+1)*200+q.k))e.push(q)}return e}
function impact(b,nx,ny,hit){const q=hit.q;q.hp-=S.atk;if(q.hp<=0){let left=-q.hp;kill(hit.b,q);for(const [a,e] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,1]]){if(left<=0)break;const n=hit.b.cells.get((q.r+a)*200+q.k+e);if(n){n.hp-=left*.6;if(n.hp<=0){left=-n.hp;kill(hit.b,n)}}}return true}
b.hp--;S.pops.push({x:nx,y:ny,t:0});if(b.hp<=0){b.st=2;b.vx=-60;b.vy=-40}else{b.vx=-b.vx*.6-60*Math.sign(b.vx||1);b.vy=-80+Math.random()*60;b.stun=.3}return false}
function slot(i,N,t){const sh=(t/7)%3,k=Math.floor(sh),u=sh-k,w=u<.75?0:(u-.75)/.25,e=w*w*(3-2*w);const A=shape(k%3,i,N,t),B=shape((k+1)%3,i,N,t);return [A[0]+(B[0]-A[0])*e,A[1]+(B[1]-A[1])*e]}
function shape(k,i,N,t){if(k===0){const row=Math.floor((i+1)/2),side=i%2?1:-1;return [-row*10+50,side*row*7]}
if(k===1){const u=(i*0.618034)%1;const x=-u*210+70;return [x,Math.sin(x*.025+t*1.3)*28+((i*7)%11-5)*3]}
const r=Math.sqrt((i+.5)/N)*Math.min(110,22+Math.sqrt(N)*9),a=i*2.39996;return [Math.cos(a)*r,Math.sin(a)*r*.7]}
function pickTarget(wx,wy,near){let best=null,bd=1e9;const cand=[];for(const b of S.blds){if(!b.cells.size||b.x>wx+(near?160:340)||b.x+b.w<wx-(near?160:60))continue;if(b.boss&&b!==S.boss)continue;if(S.siege&&b!==S.boss)continue;
let top=0;for(const q of b.cells.values())top=Math.max(top,q.r);for(const q of exposed(b)){const cx=b.x+(q.k+.5)*CS,cy=GY-(q.r+.5)*CS;if(near){const d=Math.hypot(cx-wx,cy-wy);if(d<bd){bd=d;best={b,q}}}else if(q.r<=top*.4||Math.random()<.25)cand.push({b,q})}}
if(near)return bd<200?best:null;return cand.length?cand[Math.floor(Math.random()*cand.length)]:null}
function siegeTarget(bd){const B=S.boss,ex=exposed(B);if(!ex.length)return null;let top=0;for(const q of ex)top=Math.max(top,q.r);
if(Math.random()<.35){const lo=ex.filter(q=>q.r<=top*.35);if(lo.length){const q=lo[Math.floor(Math.random()*lo.length)];return {b:B,q}}}
let best=null,bdist=1e9;for(const q of ex){const d=Math.hypot(B.x+(q.k+.5)*CS-bd.x,GY-(q.r+.5)*CS-bd.y)+Math.random()*50;if(d<bdist){bdist=d;best=q}}return {b:B,q:best}}
function coreLeft(B){let n=0;for(const q of B.cells.values())if(q.m===B.core)n++;for(const ch of S.chunks)if(ch.src===B)for(const q of ch.cells)if(q.m===B.core)n++;return n}
function step(dt){const L=S.L,B=S.bossList[S.bi],stop=B.x+B.w/2-400;S.banner-=dt;
if(!S.over&&!S.win){S.x=Math.min(stop,S.x+dt*100)}S.siege=S.x>=stop-.5&&!S.win?1:0;S.boss=B;
let topB=0;for(const q of B.cells.values())topB=Math.max(topB,q.r);
const LX=S.x+260,lcx=B.x+B.w/2,lcy=GY-Math.max(60,topB*CS*.55)+40;
for(const w of S.wild){if(!w.got&&S.x+260>=w.at){w.got=1;const e=Math.random(),side=e<.4?'top':e<.75?'right':'left';const bx=side==='right'?S.x+W+30:side==='left'?S.x-30:S.x+120+Math.random()*400,by=side==='top'?-25:40+Math.random()*150;
for(let i=0;i<w.n;i++)S.inc.push({x:bx+(Math.random()-.5)*40,y:by+(Math.random()-.5)*30,vx:side==='right'?-140:side==='left'?220:(Math.random()-.5)*60,vy:side==='top'?140:(Math.random()-.5)*40,ph:Math.random()*6,t:0})}}
for(let i=S.inc.length-1;i>=0;i--){const q=S.inc[i];q.t+=dt;const tx=(S.fx??LX)+Math.sin(q.ph)*30,ty=(S.fy??140)+Math.cos(q.ph)*20,dx=tx-q.x,dy=ty-q.y,d=Math.hypot(dx,dy)||1,sp=230;
q.vx+=(dx/d*sp+(S.siege?0:100)-q.vx)*dt*2.2;q.vy+=(dy/d*sp-q.vy)*dt*2.2;q.x+=q.vx*dt;q.y+=q.vy*dt;if(d<45||q.t>6){addBird(q.x-S.x,q.y,q.vx,q.vy);S.inc.splice(i,1)}}
S.ft=(S.ft||0)+dt;S.gt=(S.gt||0)-dt;const gather=S.gt>0;S.rot=(S.rot||0)+dt*.75;S.ringY=Math.max(70,GY-(topB+1)*CS-55);
const fyT=gather?S.gy:(S.siege?lcy-40:138+Math.sin(S.ft*.35)*34),fxT=gather?S.gx:(S.siege?lcx:LX);
S.fx=(S.fx??LX)+(fxT-(S.fx??LX))*Math.min(1,dt*(gather?2.4:1.2));S.fy=(S.fy??140)+(fyT-(S.fy??140))*Math.min(1,dt*(gather?2.4:1));
const breath=gather?.42:(S.siege?1.5:1+.38*Math.sin(S.ft*.55));S.sc=(S.sc||1)+(breath-(S.sc||1))*Math.min(1,dt*2);
const alive=[];for(const b of S.birds)if(b.st!==2)alive.push(b);const N=alive.length;let idx=0;
for(let i=S.birds.length-1;i>=0;i--){const b=S.birds[i];
if(b.st===2){b.vy+=300*dt;b.x+=b.vx*dt;b.y+=b.vy*dt;b.rot=(b.rot||0)+dt*6;if(b.y>H+20)S.birds.splice(i,1);continue}
const my=idx++;
if(b.stun>0){b.stun-=dt;b.vy+=200*dt}
else if(b.st===1){const T=b.tg;if(!T.b.cells.has(T.q.r*200+T.q.k)){b.st=0}else{const gx=T.b.x+(T.q.k+.5)*CS,gy=GY-(T.q.r+.5)*CS,dx=gx-b.x,dy=gy-b.y,d=Math.hypot(dx,dy)||1;b.vx+=(dx/d*400-b.vx)*dt*5;b.vy+=(dy/d*400-b.vy)*dt*5}}
else{let tx,ty;if(S.siege&&!gather){const ang=S.rot+6.2832*my/Math.max(1,N),lane=(my%3)-1,R=(120+Math.min(70,N*.25))*(1+.12*Math.sin(S.ft*.8))+lane*14;b.depth=Math.sin(ang);tx=lcx+Math.cos(ang)*R*1.2;ty=S.ringY+Math.sin(ang)*R*.3+lane*10+Math.sin(S.ft*2+b.ph)*3}
else{const sl=slot(my,N,S.ft);tx=S.fx+sl[0]*S.sc+Math.sin(S.ft*1.7+b.ph)*4;ty=S.fy+sl[1]*S.sc+Math.cos(S.ft*1.3+b.ph)*4}
const k=gather?4:2.2;b.vx+=((tx-b.x)*k-b.vx)*dt*3+(S.siege?0:100*dt*3);b.vy+=((ty-b.y)*k-b.vy)*dt*3;
b.cd-=dt;if(b.cd<0&&!S.win){const T=gather?pickTarget(S.gx,S.gy,1):(S.siege?siegeTarget(b):pickTarget(b.x,b.y,0));if(T){b.tg=T;b.st=1}b.cd=gather?.3+Math.random()*.7:(S.siege?.5+Math.random()*1.1:1.2+Math.random()*2.4)}}
const vm=Math.hypot(b.vx,b.vy),cap=b.st===1?440:300;if(vm>cap){b.vx*=cap/vm;b.vy*=cap/vm}
const nx=b.x+b.vx*dt,ny=Math.min(GY-2,b.y+b.vy*dt);const hit=cellAt(nx,ny);
if(hit){if(impact(b,nx,ny,hit)){b.x=nx;b.y=ny;b.vx*=.9;if(b.st===1){b.st=0;b.stun=.2;b.vy=-90}}else if(b.st===1)b.st=0}
else{b.x=nx;b.y=ny}if(b.y>=GY-2)b.vy=-140}
for(const b of S.blds)if(b.dirty)structural(b);
stepChunks(dt);
for(let i=S.parts.length-1;i>=0;i--){const p=S.parts[i];p.t+=dt;if(p.y<GY){p.vy+=300*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;if(p.y>=GY){p.y=GY-p.s*Math.random();p.vx=0;p.vy=0}}if(p.t>6)S.parts.splice(i,1)}
for(let i=S.pops.length-1;i>=0;i--){S.pops[i].t+=dt;if(S.pops[i].t>.4)S.pops.splice(i,1)}
if(!S.birds.some(b=>b.st!==2)&&!S.inc.length&&!S.win)S.over=1;
S.lamp=coreLeft(L);const cl=coreLeft(B);if(!cl&&!B.dead){B.dead=1;S.score+=B.final?500:250;S.pts+=B.final?0:60;if(B.final)S.win=1;else{const rest=[...B.cells.values()];if(rest.length)detach(B,rest,(Math.random()-.5)*1.2);S.bi++;S.banner=2.2;S.bname=B.name}}}
reset();let last=0;
function loop(ms){const t=ms/1000,dt=Math.min(.04,t-last||0);last=t;for(let i=0;i<ff;i++)step(dt);
const cam=S.x,z=zoneAt(cam+300),alive=S.birds.filter(b=>b.st!==2).length,L=S.L;
c.fillStyle='#C3C8CF';c.fillRect(0,0,W,H);c.fillStyle='#B4BAC3';for(let i=0;i<6;i++){const cx=((i*230-cam*.2)%(W+300)+W+300)%(W+300)-150;c.fillRect(cx,30+i*17,200,14)}
c.fillStyle='#ACB2BA';for(let i=0;i<14;i++){const bx=((i*120-cam*.45)%(W+200)+W+200)%(W+200)-100;const bh=(z<2?14:z<4?50:10)+((i*37)%(z<2?20:70));c.fillRect(bx,GY-bh,z<2?30:50,bh)}
if(S.lamp&&L.x-cam<W+300){let lx=L.x-cam+57,ly=GY-45*CS;for(const q of L.cells.values())if(q.m==='lp'){lx=L.x+q.k*CS-cam;ly=GY-(q.r+1)*CS;break}const a=Math.sin(t*1.2);c.fillStyle='rgba(255,236,170,.35)';c.beginPath();c.moveTo(lx,ly);c.lineTo(lx-520,ly-80+a*90);c.lineTo(lx-520,ly-10+a*90);c.fill()}
for(const b of S.blds){if(b.x-cam>W+10||b.x+b.w-cam<-10)continue;for(const q of b.cells.values()){const col=MAT[q.m].col,f=Math.max(.5,q.hp/MAT[q.m].hp);c.fillStyle='rgb('+col.map(v=>Math.round(v*(.6+.4*f))).join(',')+')';c.fillRect(b.x+q.k*CS-cam,GY-(q.r+1)*CS,CS-1,CS-1)}}
for(const ch of S.chunks){c.save();c.translate(ch.x-cam,ch.y);c.rotate(ch.a);for(const q of ch.cells){c.fillStyle=rgb(q.m);c.fillRect(q.lx-CS/2,q.ly-CS/2,CS-1,CS-1)}c.restore()}
c.fillStyle=z===0?'#6A7350':'#5B5F58';c.fillRect(0,GY,W,H-GY);if(L.x+L.w-cam<W+200){c.fillStyle='#6E7F8E';c.fillRect(L.x+L.w-cam+40,GY,W,H-GY)}
for(const p of S.parts){c.fillStyle=p.col;c.fillRect(p.x-cam,p.y,p.s,p.s)}
for(const q of S.inc)bird(q.x-cam,q.y,6.5,Math.sin(t*16+q.ph)*.65,0,Math.atan2(q.vy,Math.abs(q.vx)+1)*.5*Math.sign(q.vx||1),'#3A4048');
for(const b of S.birds)bird(b.x-cam,b.y,S.siege&&b.st===0&&b.depth!=null?7*(1+.28*b.depth):7,b.st===2?.1:b.st===1?0:Math.sin(t*14+b.ph)*.6,b.st===1?1:b.stun>0?.4:0,b.st===2?b.rot:b.st===1?Math.atan2(b.vy,b.vx)+Math.PI/2:(b.stun>0?-.6:Math.atan2(b.vy,Math.max(60,Math.abs(b.vx)))*.6*Math.sign(b.vx||1)),b.st===2?'#555A62':'#15181D');
if(S.gt>0){c.strokeStyle='rgba(21,24,29,'+Math.min(.5,S.gt*.3)+')';c.lineWidth=1;c.beginPath();c.arc(S.gx-cam,S.gy,10+(2.5-S.gt)*6,0,7);c.stroke()}
for(const p of S.pops){c.strokeStyle='rgba(20,22,26,'+(1-p.t/.4)+')';c.beginPath();c.arc(p.x-cam,p.y,3+p.t*20,0,7);c.stroke()}
c.fillStyle='#15181D';c.font='13px sans-serif';c.fillText('群れ '+alive+' 羽',14,22);c.fillText('得点 '+S.score,14,40);c.fillText('ポイント '+Math.floor(S.pts),14,58);c.fillText('守り '+S.armor+'  攻撃 ×'+S.atk.toFixed(1),14,76);
const pr=Math.min(1,S.x/(L.x+L.w/2-400));c.fillStyle='rgba(21,24,29,.15)';c.fillRect(W-190,16,170,5);c.fillStyle='#15181D';c.fillRect(W-190,16,170*pr,5);for(const Z of ZONES){const zx=W-190+170*Math.min(1,Z.x/(L.x+L.w/2-400));c.fillRect(zx,13,1,11)}c.fillText(S.siege?S.boss.name+'を包囲':ZONES[z].n,W-190,38);for(const bb of S.bossList){const zx=W-190+170*Math.min(1,(bb.x+bb.w/2-400)/(L.x+L.w/2-400));c.fillStyle=bb.dead?'rgba(21,24,29,.3)':'#A3402F';c.fillRect(zx-2,11,4,15)}c.fillStyle='#15181D';if(S.banner>0){c.textAlign='center';c.font='18px sans-serif';c.fillText(S.bname+' 撃破',W/2,60);c.textAlign='left';c.font='13px sans-serif'}
c.textAlign='center';c.font='18px sans-serif';if(S.over)c.fillText('群れが尽きた — 得点 '+S.score,W/2,H/2);if(S.win)c.fillText('LIGHT OUT — 得点 '+S.score,W/2,60);c.textAlign='left';
$('b1').textContent='仲間を呼ぶ +8 羽（'+S.cost.b1+'）';$('b2').textContent='守り +1（'+S.cost.b2+'）';$('b3').textContent='攻撃 +0.8（'+S.cost.b3+'）';
requestAnimationFrame(loop)}requestAnimationFrame(loop);
