// 臉模 左轉 45°（臉朝畫面左）：用正面臉模當基準做成簡單 3D——頭蓋＝球、下半臉每一列＝橢圓切片
// （寬＝正面臉模那一列的半寬、前＝臉中線深度、後＝下顎後緣），轉 45° 後每一列取左右極值當輪廓。
const L=require('./lib.cjs'),draw=require('./mold6.cjs');const N=256,CX=128;
const SKIN=[242,204,177],SH=[216,166,140],DK=[184,124,104],RED=[220,60,60];
const kB=+(process.env.B||1),kC=+(process.env.C||1),kD=+(process.env.D||1),DEG=+(process.env.DEG||45);
const CY=94+(+process.env.SY||26),R=70,EAR=CY+18,T=88*2/9,NOSE=EAR+T*kB,MOUTH=NOSE+T*kC,CHIN=MOUTH+T*kD;
const c=Math.cos(DEG*Math.PI/180),s=Math.sin(DEG*Math.PI/180);
const P=([x,y,z])=>[CX+x*c-z*s,y];                       // 往左轉：臉的正前方跑到畫面左邊
// 正面臉模每一列的半寬
const front=draw(kB,kC,kD),W=new Float32Array(N);
for(let y=0;y<N;y++){let n=0;for(let x=0;x<N;x++)if(front.face[y*N+x])n++;W[y]=n/2}
const lerp=(a,b,t)=>a+(b-a)*Math.max(0,Math.min(1,t));
const sph=y=>{const d=y-CY;return Math.abs(d)<R?Math.sqrt(R*R-d*d):0};
// 臉中線深度（往前）、下顎切片後緣
const zf=y=>y<=EAR?sph(y):y<=NOSE?lerp(sph(EAR),64,(y-EAR)/(NOSE-EAR)):y<=MOUTH?lerp(64,55,(y-NOSE)/(MOUTH-NOSE)):lerp(55,40,(y-MOUTH)/(CHIN-MOUTH));
// 切片：最寬處的深度 z0、後緣 zb（鼻線以下下顎往前收，到下巴只剩一小段）
const z0=y=>y<=NOSE?0:y<=MOUTH?lerp(0,20,(y-NOSE)/(MOUTH-NOSE)):lerp(20,34,(y-MOUTH)/(CHIN-MOUTH));
const zb=y=>y<=NOSE?-6:y<=MOUTH?lerp(-6,8,(y-NOSE)/(MOUTH-NOSE)):lerp(8,32,(y-MOUTH)/(CHIN-MOUTH));
const ext=new Array(N).fill(null);
for(let y=0;y<N;y++){let lo=1e9,hi=-1e9;const r=sph(y+.5);
 if(r>0){lo=Math.min(lo,CX-r);hi=Math.max(hi,CX+r)}
 if(y+.5>=CY&&y+.5<=CHIN+.5){const yy=Math.min(y+.5,CHIN),w=W[y],f=zf(yy),m=z0(yy),b=zb(yy);
   for(let t=0;t<=Math.PI+1e-6;t+=.01){const x=w*Math.cos(t);for(const z of[m+(f-m)*Math.sin(t),m-(m-b)*Math.sin(t)]){const X=P([x,y,z])[0];lo=Math.min(lo,X);hi=Math.max(hi,X)}}}
 // 遠側（左）眼窩小凹：耳線附近往內收一點，下面接顴骨
 const u=(y+.5-(EAR-3))/8;if(Math.abs(u)<1)lo+=2.2*(1-u*u)**2;
 if(lo<hi)ext[y]=[lo,hi]}
// 下顎打角度：近側從轉折點（耳朵下端）幾乎直直往下到下顎角，再轉一個角往前到下巴
// 下顎角在頭寬的 1/3（從後腦那邊量），高度在轉折點到下巴的 62%
let LO=1e9,HI=-1e9;for(const e of ext)if(e){LO=Math.min(LO,e[0]);HI=Math.max(HI,e[1])}
const TN=P([61,NOSE,-4])[0],ANGX=HI-(HI-LO)/(+process.env.FRAC||4),ANGY=NOSE+.62*(CHIN-NOSE);
let CHX=0;{const e=ext[Math.round(CHIN)-1];CHX=e?e[1]:CX-20}
// 下顎曲線（不要死板的折線）：耳下那段微微外鼓、下顎角圓角、下顎底線微微外鼓到下巴
const JAW=[];{const A=[TN,NOSE],G=[ANGX,ANGY],C=[CHX,CHIN];
 const lerp2=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
 const bow=(p,q,amt,n=40)=>{const d=[q[0]-p[0],q[1]-p[1]],l=Math.hypot(...d),nx=d[1]/l,ny=-d[0]/l;   // 往外（右下）鼓
  for(let i=0;i<n;i++){const t=i/n,b=Math.sin(Math.PI*t)*amt;const[x,y]=lerp2(p,q,t);JAW.push([x+nx*b,y+ny*b])}};
 const R1=+(process.env.RC||8);const G1=lerp2(G,A,R1/Math.hypot(G[0]-A[0],G[1]-A[1])),G2=lerp2(G,C,R1*1.4/Math.hypot(G[0]-C[0],G[1]-C[1]));
 bow(A,G1,1.6);
 for(let i=0;i<20;i++){const t=i/20,u=1-t;JAW.push([u*u*G1[0]+2*u*t*G[0]+t*t*G2[0],u*u*G1[1]+2*u*t*G[1]+t*t*G2[1]])}
 bow(G2,C,2.6);JAW.push(C)}
for(let y=Math.floor(NOSE);y<N;y++){if(!ext[y])continue;const Y=y+.5;if(Y>CHIN)continue;
 let h=null;for(let i=0;i<JAW.length-1;i++){const[x0,y0]=JAW[i],[x1,y1]=JAW[i+1];if((y0<=Y&&Y<=y1)||(y1<=Y&&Y<=y0)){const t=y1==y0?0:(Y-y0)/(y1-y0);const x=x0+(x1-x0)*t;h=h==null?x:Math.max(h,x)}}
 if(h!=null)ext[y][1]=Math.min(Math.max(h,ext[y][0]+1),Math.max(ext[y][1],h))}
const px=new Uint8ClampedArray(N*N*4);for(let i=0;i<N*N;i++)px.set([255,255,255,255],i*4);
const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<N&&y<N)px.set([...c,255],(y*N+x)*4)};
const face=new Uint8Array(N*N);for(let y=0;y<N;y++)if(ext[y])for(let x=0;x<N;x++)if(x+.5>=ext[y][0]&&x+.5<=ext[y][1])face[y*N+x]=1;
function mask(poly){const m=new Uint8Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const X=x+.5,Y=y+.5;let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>Y)!=(yj>Y)&&X<(xj-xi)*(Y-yi)/(yj-yi)+xi)ins=!ins}if(ins)m[y*N+x]=1}return m}
function shape(m,keepBottom){for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!m[i])continue;const e=!m[i-1]||!m[i+1]||!m[i-N]||(!m[i+N]&&!keepBottom);put(x,y,e?DK:SKIN)}}
// 脖子（中心在頭的中心稍後）
const nx=P([0,0,-8])[0],nt=MOUTH-14;
const neck=mask([[nx-19,nt],[nx-19,nt+50],[nx-21,nt+75],[nx-26,N+2],[nx+26,N+2],[nx+21,nt+75],[nx+19,nt+50],[nx+19,nt]]);
shape(neck,1);shape(face);
const inner=(x,y)=>{x=Math.round(x);y=Math.round(y);const i=y*N+x;return face[i]&&face[i-1]&&face[i+1]&&face[i-N]&&face[i+N]};
const G=process.env.GUIDE!=='0';const dot=(x,y,c)=>{if(G&&inner(x,y))put(x,y,c)};
// 近側耳朵（畫在頭上）：耳根在頭側面（z≈−4），轉 45° 後在頭中間偏右
const EB=NOSE-EAR,ear0=P([R-6,0,-4])[0];
const earPts=[[0,-12],[5,-13],[10,-10],[13,-3],[13.5,.15*EB],[12,.45*EB],[9,.72*EB],[5,EB-3],[1,EB],[-1,.6*EB],[-1.5,.2*EB],[-1,-6]].map(([x,f])=>[ear0+x,EAR+f]);
const earM=mask(earPts);
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!earM[i])continue;const e=!earM[i-1]||!earM[i+1]||!earM[i-N]||!earM[i+N];put(x,y,e?DK:SKIN)}
for(let y=Math.round(EAR-8);y<=EAR+.55*EB;y++){const t=(y-(EAR-8))/(8+.55*EB);put(ear0+9-6*t*t+ (t<.15?-(.15-t)*20:0),y,SH)}
// 1/3 定位線：從頭頂直直往下到下顎角
for(let y=0;y<ANGY;y++)if(!earM[y*N+Math.round(ANGX)])dot(ANGX,y,SH);
 if(G){for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)put(ANGX+a,Math.round(ANGY)+b,RED);}
// 頭蓋圓下半（虛線）
{let n=0,last='';for(let a=0;a<=Math.PI;a+=.003){const x=Math.round(CX+R*Math.cos(a)),y=Math.round(CY+R*Math.sin(a));if(x+','+y==last)continue;last=x+','+y;if((n++%6)<4&&!earM[y*N+x])dot(x,y,SH)}}
// 中線：沿著臉表面（頭頂 → 額頭 → 鼻 → 嘴 → 下巴）
const cl=y=>P([0,y,zf(y)])[0];
{let last=null;for(let y=CY-R+1;y<CHIN-1;y+=.25){const p=[Math.round(cl(y)),Math.round(y)];if(last&&p+''==last+'')continue;if(last&&Math.abs(p[0]-last[0])>1){const st=Math.sign(p[0]-last[0]);for(let x=last[0]+st;x!=p[0];x+=st)dot(x,last[1],SH)}last=p;dot(p[0],p[1],SH)}}
// 橫線：正交投影下維持水平，中間（中線那點）微微往下彎
const hline=(y0,bend,fromX,toX)=>{const m=cl(y0),w=Math.max(m-fromX,toX-m);for(let x=Math.floor(fromX);x<=toX;x++){const u=(x+.5-m)/w;if(!earM[Math.round(y0)*N+x])dot(x,Math.round(y0+bend*(1-u*u)),SH)}};
hline(EAR,0,0,ear0-2);
const turnN=P([61,NOSE,-4])[0],turnF=P([-61,NOSE,-4])[0];
hline(NOSE,2,0,turnN);hline(MOUTH,2,0,P([43,MOUTH,26])[0]);
 if(G){for(let d=-2;d<=2;d++)dot(cl(EAR)+d,EAR,DK);}
// 鼻 ∨（鼻尖凸出一點）、嘴（短線，遠側短）
const nX=Math.round(P([0,NOSE,68])[0]),nY=Math.round(NOSE);
 if(G){for(const[dx,dy]of[[-2,-1],[-1,0],[0,1],[1,0],[2,-1],[3,-2]])put(nX+dx,nY+dy,DK);}
 // 嘴巴記號改成真的嘴巴
// 轉折點：近側在輪廓上；遠側被臉擋住，用小一點的點標在裡面
 if(G){for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)put(turnN+a,Math.round(NOSE)+b,RED);}
 if(G){put(turnF,Math.round(NOSE),RED);}
if(process.env.NOSE!=='0'){
 const NT=process.env.NT||'std';
 { // 翹頭尖鼻（45°）：鼻樑線從山根（中線、眼睛中央）往下，先貼著中線、下段往左翹出去（微凹），鼻頭深色尖角往右下
  const LT=[229,185,158],ey=Math.round(EAR),ny=Math.round(NOSE),sx=cl(EAR),tx=Math.round(P([0,NOSE-2,zf(NOSE)+8])[0])-2;
  const n=ny-(NT=='round'?5:4)-ey;for(let k=0;k<=n;k++){const u=k/n,x=Math.round(sx+(tx-sx)*u*u),y=ey+k;put(x,y,u<.2?LT:SH)}
  if(NT=='up'){for(const[dx,dy]of[[0,-3],[0,-2],[1,-2],[1,-1],[2,-1],[3,0]])put(tx+dx,ny+dy,DK);put(tx+2,ny-2,SH);}
  else if(NT=='std'){for(const[dx,dy,c]of[[0,-3,SH],[0,-2,DK],[0,-1,DK],[1,0,DK],[2,0,DK],[3,-1,SH]])put(tx+dx,ny+dy,c);}
  else{ // 圓頭：線尾接一個寬圓圈（5×4），上半陰影色、下半深色
   put(tx,ny-4,SH);const cx=tx+1;for(const[dx,dy,c]of[[-1,-3,SH],[0,-3,SH],[1,-3,SH],[-2,-2,SH],[2,-2,SH],[-2,-1,DK],[2,-1,DK],[-1,0,DK],[0,0,DK],[1,0,DK]])put(cx+dx,ny+dy,c);}
 }
}
if(process.env.BROW!=='0')require('./brow.cjs')(put,(x,y)=>face[y*N+x]&&!earM[y*N+x],([x,y,z])=>[CX+x*c-z*s,y,x*s+z*c],{CY,R,EAR});
if(process.env.MOUTH!=='0')require('./mouth.cjs')(put,(x,y)=>face[y*N+x]&&!earM[y*N+x],([x,y,z])=>[CX+x*c-z*s,y,x*s+z*c],{MOUTH,zc:zf(MOUTH)});
L.png({width:N,height:N,pixels:px},1,'turn45.png');L.png({width:N,height:N,pixels:px},3,'turn45_x3.png');
console.log({ANGX,ANGY,LO,HI,CHX,turnN,turnF,ear0,cl:cl(NOSE)});
