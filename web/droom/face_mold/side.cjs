// 臉模 側臉（面向畫面左，轉 90°）256×256：頭蓋＝同一個圓；臉前緣＝側面輪廓（額、眉骨、眼窩凹、鼻尖、人中、唇、下巴）；
// 下顎＝耳朵下端（轉折點）往下到下顎角（圓角）、再微鼓到下巴。耳線／鼻線／嘴線／下巴高度跟正面一樣。
const L=require('./lib.cjs');const N=256,CX=128;
const SKIN=[242,204,177],SH=[216,166,140],DK=[184,124,104],RED=[220,60,60];
const kB=+(process.env.B||1),kC=+(process.env.C||1),kD=+(process.env.D||1);
const CY=94+(+process.env.SY||26),R=70,AF=+(process.env.AF||.6),TOT=88/.6,EAR=CY-R+TOT*AF,T=TOT*(1-AF)/3,NOSE=EAR+T*kB,MOUTH=NOSE+T*kC,CHIN=MOUTH+T*kD;
const px=new Uint8ClampedArray(N*N*4);for(let i=0;i<N*N;i++)px.set([255,255,255,255],i*4);
const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<N&&y<N)px.set([...c,255],(y*N+x)*4)};
function spline(p,closed,n=12){const o=[],m=p.length,Q=i=>closed?p[(i+m)%m]:p[Math.max(0,Math.min(m-1,i))];for(let i=0;i<(closed?m:m-1);i++){const a=Q(i-1),b=Q(i),c=Q(i+1),d=Q(i+2);for(let k=0;k<n;k++){const t=k/n,t2=t*t,t3=t2*t;o.push([0,1].map(j=>.5*(2*b[j]+(-a[j]+c[j])*t+(2*a[j]-5*b[j]+4*c[j]-d[j])*t2+(-a[j]+3*b[j]-3*c[j]+d[j])*t3)))}}if(!closed)o.push(p[m-1]);return o}
function mask(poly){const m=new Uint8Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const X=x+.5,Y=y+.5;let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>Y)!=(yj>Y)&&X<(xj-xi)*(Y-yi)/(yj-yi)+xi)ins=!ins}if(ins)m[y*N+x]=1}return m}
const NT=process.env.NT||'std';
const F=f=>CX-f,q=T/(98/3);   // q：下半臉比例（舊版 1）   // 往前 f 格（面向左）
// 鼻子三種：std 標準（直、尖一點）／up 翹鼻（鼻樑微凹、鼻尖朝上、看得到鼻孔）／round 圓頭（鼻頭圓鼓）
const NOSEPTS={
 std:[],   // 正常：鼻子另外一格一格加（見下）
 up:[],   // 翹頭尖鼻：輪廓不放鼻子的點，鼻子另外一格一格加（見下）
 round:[],   // 圓頭：鼻子另外一格一格加（見下）
};
// 側面輪廓（臉前緣），由上往下
const prof=[
 [F(Math.sqrt(R*R-(CY-14-CY)**2)),CY-14],[F(70),CY],
 [F(69.6),EAR-9],            // 眉骨
 [F(66.2),EAR+2],            // 眼窩（鼻根）凹
 ...NOSEPTS[NT],
 [F(60.6),NOSE+5*q],           // 人中
 [F(60.4),MOUTH-5*q],          // 上唇
 [F(57.6),MOUTH],            // 嘴縫
 [F(57.4),MOUTH+4*q],          // 下唇
 [F(53.2),MOUTH+12*q],         // 下巴上凹
 [F(52.6),CHIN-9*q],           // 下巴前
 [F(49),CHIN-2.5*q],
 [F(42),CHIN],               // 下巴底
];
const TURN=[CX+4,NOSE],ANG=[CX+3,NOSE+.58*(CHIN-NOSE)];
// 下顎：下巴底 → 微鼓 → 圓角 → 往上到耳朵下端
const jaw=[];{const lerp2=(p,q,t)=>[p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t];
 const bow=(p,q,amt,n=30)=>{const d=[q[0]-p[0],q[1]-p[1]],l=Math.hypot(...d),nx=-d[1]/l,ny=d[0]/l;for(let i=0;i<n;i++){const t=i/n,b=Math.sin(Math.PI*t)*amt;const[x,y]=lerp2(p,q,t);jaw.push([x+nx*b,y+ny*b])}};
 const C=[F(42),CHIN],G=ANG,A=TURN,R1=8;const G1=lerp2(G,C,R1*1.4/Math.hypot(G[0]-C[0],G[1]-C[1])),G2=lerp2(G,A,R1/Math.hypot(G[0]-A[0],G[1]-A[1]));
 bow(C,G1,2.6);for(let i=0;i<20;i++){const t=i/20,u=1-t;jaw.push([u*u*G1[0]+2*u*t*G[0]+t*t*G2[0],u*u*G1[1]+2*u*t*G[1]+t*t*G2[1]])}bow(G2,A,1.6);jaw.push(A)}
const face=mask([...spline(prof,false,14),...jaw,[CX+10,CY]]);
const head=new Uint8Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(face[i]||Math.hypot(x+.5-CX,y+.5-CY)<=R)head[i]=1}
// 翹頭尖鼻（側面）：從山根往下，鼻樑微凹、越往下越往前，鼻尖在第 17 列最尖、朝左上；鼻底從鼻尖往右下斜回人中
const UPNOSE=[0,0,0,0,-1,-1,-1,-1,-1,-1,-2,-2,-2,-3,-3,-4,-5,-6,-6,-5,-4,-2,-1];   // 鼻頭收圓一點（不要太尖）
const STDNOSE=[0,0,0,0,-1,-1,-1,-1,-2,-2,-2,-3,-3,-3,-4,-4,-5,-5,-5,-5,-4,-2,-1];   // 正常：鼻樑直直往前、鼻頭不翹不圓
if(NT=='std'){const X0=Math.round(F(65.6));STDNOSE.forEach((o,k)=>{const y=Math.round(EAR)+k;for(let x=X0+o;x<X0+8;x++)head[y*N+x]=1})}
// 側面嘴唇：輪廓一格一格定（上唇往前翹、下唇短短的縮在後面），相對嘴縫那一列、X0＝嘴縫前緣
const LIPROW=[[-5,-2],[-4,-3],[-3,-5],[-2,-4],[-1,-3],[0,-2],[1,-1],[2,-1],[3,0],[4,1]];   // 上唇往前上翹（最尖在第 -3 列，比人中凸 3 格）、下唇短、縮在後面   // 上唇往前上翹（尖在第 -1 列）、下唇短、縮在後面
const LIPROW_OPEN=[[-6,-2],[-5,-2],[-4,-3],[-3,-4],[-2,-4],[-1,-3],[0,-2],[1,-1],[2,-2],[3,-3],[4,-3],[5,-2],[6,-1],[7,1],[8,2]];   // 微張：上唇往前上翹（凸 2 格）、下唇微凸   // 微張（大一號）：上唇往前上翹、開口露牙齒、下唇豐厚   // 微張：嘴縫下多一列牙齒、下唇比較厚
const MT=process.env.MT||'closed',THIN=process.env.ULIP==='thin';
let LIPPX=MT=='open'?[[-2,-5,'u'],[-1,-5,'u'],[-3,-4,'U'],[-2,-4,'b'],[-1,-4,'U'],[0,-4,'u'],[-4,-3,'U'],[-3,-3,'b'],[-2,-3,'H'],[-1,-3,'U'],[0,-3,'U'],[1,-3,'u'],[-4,-2,'U'],[-3,-2,'U'],[-2,-2,'U'],[-1,-2,'U'],[0,-2,'U'],[1,-2,'U'],[-3,-1,'U'],[-2,-1,'U'],[-1,-1,'U'],[0,-1,'U'],[1,-1,'U'],[2,-1,'U'],[-2,0,'T'],[-1,0,'T'],[0,0,'T'],[1,0,'L'],[2,0,'L'],[3,0,'L'],[4,0,'L'],[5,0,'C'],[-1,1,'T'],[0,1,'T'],[1,1,'M'],[2,1,'M'],[3,1,'M'],[6,1,'C'],[-2,2,'P'],[-1,2,'P'],[0,2,'P'],[1,2,'M'],[-3,3,'P'],[-2,3,'P'],[-1,3,'H'],[0,3,'P'],[1,3,'P'],[-3,4,'P'],[-2,4,'H'],[-1,4,'P'],[0,4,'P'],[1,4,'P'],[-2,5,'D'],[-1,5,'D'],[0,5,'D'],[1,5,'P'],[-1,6,'D'],[0,6,'D']]:[[-3,-4,'u'],[-2,-4,'u'],[-5,-3,'U'],[-4,-3,'U'],[-3,-3,'U'],[-2,-3,'u'],[-4,-2,'U'],[-3,-2,'U'],[-2,-2,'U'],[-1,-2,'U'],[-3,-1,'U'],[-2,-1,'U'],[-1,-1,'U'],[0,-1,'U'],[-2,0,'L'],[-1,0,'L'],[0,0,'L'],[1,0,'L'],[2,0,'L'],[3,0,'C'],[-1,1,'P'],[0,1,'P'],[1,1,'P'],[4,1,'C'],[-1,2,'D'],[0,2,'P'],[0,3,'D']],LR=MT=='open'?LIPROW_OPEN:LIPROW;
if(THIN){   // 上唇薄：上唇只留嘴縫上面 2 列，最前面那格換淡色；那兩列以上的輪廓回到人中（-2）
 const top=Math.min(...LIPPX.filter(q=>q[1]==-2).map(q=>q[0]));
 LIPPX=LIPPX.filter(p=>p[1]>-3).map(p=>p[1]==-2&&p[0]==top?[p[0],p[1],'u']:p);
 const mn=r=>Math.min(...LIPPX.filter(q=>q[1]==r).map(q=>q[0]));LR=LR.map(([r,o])=>r<=-3?[r,-2]:r>=-2&&r<=-1?[r,mn(r)]:[r,o])}
// 上厚唇／大嘴唇：上唇整塊往上推一列、嘴縫上面那列複製一份（上唇多一列）；大嘴唇再讓下唇多一列、往前多 1 格
if(process.env.ULIP==='full'||process.env.BIG==='1'){const r1=LIPPX.filter(p=>p[1]==-1);LIPPX=[...LIPPX.map(p=>p[1]<0?[p[0],p[1]-1,p[2]]:p),...r1];
 const o1=LR.find(q=>q[0]==-1)[1];LR=[...LR.map(([r,o])=>r<0?[r-1,o]:[r,o]),[-1,o1]]}
if(process.env.BIG==='1'){const lo=LIPPX.filter(p=>p[1]>=2&&p[0]<=1);const mx=Math.max(...LIPPX.map(p=>p[1]));
 LIPPX=[...LIPPX.map(p=>p[1]>=2&&p[0]<=1?[p[0]-1,p[1]+(p[1]>=3?1:0),p[2]]:p),...lo.filter(p=>p[1]==3).map(p=>[p[0]-1,3,p[2]])];
 LR=LR.map(([r,o])=>r>=2&&r<=mx?[r,o-1]:[r,o]);LR.push([mx+1,LR.find(q=>q[0]==mx)?LR.find(q=>q[0]==mx)[1]:0])}
if(process.env.MOUTH!=='0'){const X0=Math.round(F(57.6)),y0=Math.round(MOUTH)+1;for(const[r,o]of LR){const y=y0+r;for(let x=X0-8;x<X0+o;x++)head[y*N+x]=0;for(let x=X0+o;x<X0+8;x++)head[y*N+x]=1}}
const RNDNOSE=[0,0,0,0,-1,-1,-1,-1,-1,-2,-2,-2,-3,-3,-4,-5,-6,-7,-7,-7,-6,-4,-2];   // 圓頭：鼻樑比較直、鼻頭圓鼓（凸 7 格、上下圓）
if(NT=='round'){const X0=Math.round(F(65.6));RNDNOSE.forEach((o,k)=>{const y=Math.round(EAR)+k;for(let x=X0+o;x<X0+8;x++)head[y*N+x]=1})}
if(NT=='up'){const X0=Math.round(F(65.6));UPNOSE.forEach((o,k)=>{const y=Math.round(EAR)+k;for(let x=X0+o;x<X0+8;x++)head[y*N+x]=1})}
// 脖子（側面往前斜）：前緣在下巴後面、後緣接後腦
// 頭骨和下顎分開：後腦圓在後下方 55° 那點（NAPE）接到後頸；頭骨圓在「下顎角→NAPE」那條線以下的部分不算頭（那裡是脖子）
const NA=55*Math.PI/180,NAPE=[CX+R*Math.cos(NA),CY+R*Math.sin(NA)];
{const[jx,jy]=ANG,[ax,ay]=NAPE;for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!head[i]||face[i])continue;
 if(x+.5>=jx-1&&x+.5<=ax+2){const ly=jy+(ay-jy)*(x+.5-jx)/(ax-jx);if(y+.5>ly)head[i]=0}else if(x+.5<jx-1&&y+.5>jy)head[i]=0}}
const neck=mask(spline([[CX-12,ANG[1]-6],[CX-17,222],[CX-26,N+4],[CX+24,N+4],[CX+23,226],[CX+30,198],NAPE,[CX+30,165],[CX+10,160]],true,8));
function shape(m,keepBottom){for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!m[i])continue;const e=!m[i-1]||!m[i+1]||!m[i-N]||(!m[i+N]&&!keepBottom);put(x,y,e?DK:SKIN)}}
shape(neck,1);shape(head);
// 頭骨圓切掉的那條線（下顎角→後頸）跟脖子是連著的肉，不描線；只有下顎（臉的部分）壓在脖子上才有線
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(head[i]&&!face[i]&&neck[i+N]&&!head[i+N])put(x,y,SKIN)}
// 下顎不用線：下顎（臉）壓在脖子上的那一圈改回肉色；脖子上畫下巴的影子——下顎底線下面一塊（前面寬、往下顎角變窄），下顎後緣後面窄窄 2 格
{for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(face[i]&&head[i]&&(neck[i+N]&&!face[i+N]||neck[i+1]&&!face[i+1]))put(x,y,SKIN)}
 const bottom=new Float32Array(N).fill(-1);for(let x=0;x<N;x++)for(let y=N-1;y>=0;y--)if(face[y*N+x]){bottom[x]=y;break}
 for(let x=0;x<N;x++){if(bottom[x]<0||x+.5>ANG[0]+1)continue;const t=Math.max(0,Math.min(1,(ANG[0]-x)/(ANG[0]-(CX-20))));const k=Math.round(2+6*t);
  for(let y=bottom[x]+1;y<=bottom[x]+k;y++){const i=y*N+x;if(neck[i]&&!face[i])put(x,y,SH)}}
 for(let y=Math.round(NOSE+3);y<=ANG[1];y++){let xr=-1;for(let x=N-1;x>=0;x--)if(face[y*N+x]){xr=x;break}if(xr<0)continue;const k=y<NOSE+8?1:2;
  for(let x=xr+1;x<=xr+k;x++){const i=y*N+x;if((head[i]||neck[i])&&!face[i])put(x,y,SH)}}}
const inner=(x,y)=>{x=Math.round(x);y=Math.round(y);const i=y*N+x;return head[i]&&head[i-1]&&head[i+1]&&head[i-N]&&head[i+N]};
const G=process.env.GUIDE!=='0';const dot=(x,y,c)=>{if(G&&inner(x,y))put(x,y,c)};
// 下顎在頭蓋圓裡面那段也描出來（陰影色）
{let last='';for(const[x,y]of spline(jaw.filter((_,i)=>i%3==0),false,4)){const k=Math.round(x)+','+Math.round(y);if(k==last)continue;last=k;dot(x,y,SH)}}
// 耳朵：在頭中間偏後，下端在轉折點
const EB=NOSE-EAR;
const earPts=[[-2,-10],[3,-13],[10,-12],[15,-7],[16.5,.1*EB],[15,.42*EB],[11.5,.7*EB],[6,EB-3],[1,EB],[-1.5,.6*EB],[-2.5,.2*EB]].map(([x,f])=>[TURN[0]+x-2,EAR+f]);
const earM=mask(spline(earPts,true,8));
for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!earM[i])continue;const e=!earM[i-1]||!earM[i+1]||!earM[i-N]||!earM[i+N];put(x,y,e?DK:SKIN)}
{let last='';for(const[x,y]of spline([[TURN[0]+1,EAR-7],[TURN[0]+8,EAR-8],[TURN[0]+12,EAR-2],[TURN[0]+12,EAR+.35*EB],[TURN[0]+8,EAR+.62*EB]],false,10)){const k=Math.round(x)+','+Math.round(y);if(k==last)continue;last=k;put(x,y,SH)}}
// 頭蓋圓下半（虛線）
{let n=0,last='';for(let a=0;a<=Math.PI;a+=.003){const x=Math.round(CX+R*Math.cos(a)),y=Math.round(CY+R*Math.sin(a));if(x+','+y==last)continue;last=x+','+y;if((n++%6)<4&&!earM[y*N+x])dot(x,y,SH)}}
// 橫線：耳線、鼻線、嘴線（從臉前緣到耳朵前面）
for(const y of[EAR,NOSE,MOUTH]){const Y=Math.round(y);for(let x=0;x<N;x++)if(!earM[Y*N+x]&&x<TURN[0]+20)dot(x,Y,SH)}
// 1/4 定位線（直的，從頭頂到下顎角）
for(let y=0;y<ANG[1];y++)if(!earM[y*N+Math.round(ANG[0])])dot(ANG[0],y,SH);
// 眼睛位置（側面只看到一個小三角）、嘴縫
 if(G){for(const[dx,dy]of[[0,0],[1,0],[2,0],[3,0],[0,1],[1,1],[0,2]])put(F(63)+dx,EAR+dy,DK);}
 // 嘴巴記號改成真的嘴巴
// 紅點：轉折點（耳朵下端）、下顎角
 if(G){for(const[x,y]of[TURN,ANG])for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)put(x+a,Math.round(y)+b,RED);}
if(process.env.NOSE!=='0'){
 // 鼻子（側面）：輪廓上已經有鼻尖；加鼻翼影子＋鼻孔
 const ny=Math.round(NOSE);
 // 正常側面：只有輪廓
 // 翹頭尖鼻側面：不畫鼻孔
 // 圓頭側面：只有輪廓
}
if(process.env.BROW!=='0')require('./brow.cjs')(put,(x,y)=>head[y*N+x]&&!earM[y*N+x],([x,y,z])=>[CX-z,y,-x+.001],{CY,R,EAR});
if(process.env.MOUTH!=='0'){const X0=Math.round(F(57.6)),y0=Math.round(MOUTH)+1,P={b:[246,188,190],T:[250,246,242],M:[122,52,62],H:[252,216,214],L:[140,62,72],C:[172,62,78],u:[238,176,176],U:[216,128,136],P:[238,154,160],D:[214,118,128]};
 for(const[dx,dy,c]of LIPPX)put(X0+dx,y0+dy,P[c])}
L.png({width:N,height:N,pixels:px},1,'side.png');L.png({width:N,height:N,pixels:px},3,'side_x3.png');
