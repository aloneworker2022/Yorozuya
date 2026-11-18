// 臉模 256×256：A 頭頂→耳線（固定）／B 耳線→鼻線／C 鼻線→嘴線／D 嘴線→下巴；B C D 各有 短 中 長
// 下顎：轉折點（鼻線）→ 直線到嘴線 → 從嘴線收圓到下巴
const L=require('./lib.cjs');const N=256,CX=128;
const SKIN=[242,204,177],SH=[216,166,140],DK=[184,124,104],RED=[220,60,60];
const LV={短:.8,中:1,長:1.2};
function draw(kB,kC,kD){
 const px=new Uint8ClampedArray(N*N*4);for(let i=0;i<N*N;i++)px.set([255,255,255,255],i*4);
 const put=(x,y,c)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&y>=0&&x<N&&y<N)px.set([...c,255],(y*N+x)*4)};
 const CY=94+(+process.env.SY||26),R=70,EAR=CY+18,T=88*2/9;
 const NOSE=EAR+T*kB,MOUTH=NOSE+T*kC,CHIN=MOUTH+T*kD;
 const TURNX=61,MW=43;
 function mask(poly){const m=new Uint8Array(N*N);for(let y=0;y<N;y++)for(let x=0;x<N;x++){const X=x+.5,Y=y+.5;let ins=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const[xi,yi]=poly[i],[xj,yj]=poly[j];if((yi>Y)!=(yj>Y)&&X<(xj-xi)*(Y-yi)/(yj-yi)+xi)ins=!ins}if(ins)m[y*N+x]=1}return m}
 const sideX=(y,s)=>{const t=(y-CY)/(NOSE-CY);return CX+s*(R-(R-TURNX)*t*t)};
 const jaw=s=>{const o=[];const a=[CX+s*TURNX,NOSE],b=[CX+s*MW,MOUTH];
  for(let t=0;t<1;t+=.05)o.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);          // 直線（紅線那段）
  const d=[b[0]-a[0],b[1]-a[1]],l=Math.hypot(...d),k=(CHIN-MOUTH)*.45;
  const P=[b,[b[0]+d[0]/l*k,b[1]+d[1]/l*k],[CX+s*MW*.3,CHIN],[CX,CHIN]];
  for(let t=0;t<=1.0001;t+=.02){const u=1-t;o.push([0,1].map(j=>u*u*u*P[0][j]+3*u*u*t*P[1][j]+3*u*t*t*P[2][j]+t*t*t*P[3][j]))}return o};
 const poly=[];
 for(let y=NOSE;y>CY;y--)poly.push([sideX(y,1),y]);
 for(let a=0;a>=-Math.PI;a-=.01)poly.push([CX+R*Math.cos(a),CY+R*Math.sin(a)]);
 for(let y=CY+1;y<=NOSE;y++)poly.push([sideX(y,-1),y]);
 poly.push(...jaw(-1),...jaw(1).reverse());
 const face=mask(poly);
 const nt=MOUTH-6,neck=mask([[CX-19,nt],[CX-19,nt+50],[CX-21,nt+75],[CX-26,N+2],[CX+26,N+2],[CX+21,nt+75],[CX+19,nt+50],[CX+19,nt]]);
 const sx=y=>y<CY?Math.sqrt(R*R-(CY-y)**2):sideX(y,1)-CX;
 const EB=NOSE-EAR;
 const earPoly=s=>{const o=[];for(let y=NOSE;y>=EAR-12;y-=2)o.push([CX+s*(sx(y)-3),y]);
  for(const[x,f]of[[3,-12],[7,-11],[9.5,-6],[10,.1*EB],[8.5,.4*EB],[5.5,.67*EB],[2.5,EB-4],[0,EB]]){const y=EAR+f;o.push([CX+s*(sx(y)+x),y])}return o};
 function shape(m,keepBottom){for(let y=0;y<N;y++)for(let x=0;x<N;x++){const i=y*N+x;if(!m[i])continue;const e=!m[i-1]||!m[i+1]||!m[i-N]||(!m[i+N]&&!keepBottom);put(x,y,e?DK:SKIN)}}
 shape(neck,1);[1,-1].forEach(s=>shape(mask(earPoly(s))));shape(face);
 for(const s of[1,-1])for(let y=EAR-7;y<=EAR+.5*EB;y++){const t=(y-(EAR-7))/(7+.5*EB);put(CX+s*(sx(y)+5-3*t*t),y,SH)}
 const inner=(x,y)=>{x=Math.round(x);y=Math.round(y);const i=y*N+x;return face[i]&&face[i-1]&&face[i+1]&&face[i-N]&&face[i+N]};
 const G=process.env.GUIDE!=='0';const dot=(x,y,c)=>{if(G&&inner(x,y))put(x,y,c)};
 for(let y=CY-R+1;y<CHIN;y++)dot(CX,y,SH);
 {let n=0,last='';for(let a=0;a<=Math.PI;a+=.003){const x=Math.round(CX+R*Math.cos(a)),y=Math.round(CY+R*Math.sin(a));if(x+','+y==last)continue;last=x+','+y;if((n++%6)<4)dot(x,y,SH)}}
 for(let x=0;x<N;x++)dot(x,EAR,SH);
 const curve=(y0,w,bend)=>{for(let x=0;x<N;x++){const u=(x+.5-CX)/w;dot(x,Math.round(y0+bend*(1-u*u)),SH)}};
 curve(NOSE,TURNX,2);curve(MOUTH,MW,2);
 if(G){for(const y of[EAR])for(let d=-2;d<=2;d++)dot(CX+d,y,DK);}
 if(G){for(const[dx,dy]of[[-2,-2],[-1,-1],[0,0],[1,-1],[2,-2]])put(CX+dx,Math.round(NOSE)+1+dy,DK);}
 // 嘴巴記號改成真的嘴巴（mouth.cjs）
 if(G){for(const s of[1,-1])for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)put(CX+s*TURNX+a,Math.round(NOSE)+b,RED);}
 if(process.env.NOSE!=='0'){
 // 鼻子（正面，照使用者範例）：鼻樑左側一條線，從眉頭下方往下、微微往左鼓再收回來，
 // 到鼻尖往右勾一下，勾的尾巴用深色。上段淡、下段實。
 const ny=Math.round(NOSE),LT=[229,185,158];
 // 從「眼睛中央」那條線（耳線）開始，斜斜往左下到鼻頭（鼻線），鼻頭往右勾、勾的尾巴深色
 const ey=Math.round(EAR),L0=ny-ey,path=[];
 const NT=process.env.NT||'std';
 if(NT=='std'){   // 正常：鼻樑線同另外兩種，鼻頭是一個小小的勾（往右下彎一下再微微往上收），不尖也不圓
  const n=L0-4;let ex=0;for(let k=0;k<=n;k++){const t=k/n,dx=Math.round(-5+1.6*Math.sin(Math.PI*t*.9)-1.4*t*t);ex=dx;path.push([dx,-L0+k,t<.2?LT:SH])}
  for(const[dx,dy,c]of[[0,-3,SH],[0,-2,DK],[0,-1,DK],[1,0,DK],[2,0,DK],[3,-1,SH]])path.push([ex+dx,dy,c]);}
 if(NT=='up'){   // 翹頭尖鼻（使用者範例）：鼻樑線往右微鼓、下段往左下收；鼻頭是一小塊深色尖角，尖端朝右下
  const n=L0-5;for(let k=0;k<=n;k++){const t=k/n,dx=Math.round(-5+1.6*Math.sin(Math.PI*t*.9)-1.4*t*t);path.push([dx,-L0+k,t<.2?LT:SH])}
  path.push([-6,-4,DK],[-6,-3,DK],[-5,-3,DK],[-6,-2,SH],[-4,-2,DK],[-5,-1,SH],[-4,-1,DK],[-3,-1,DK],[-3,0,DK],[-2,0,DK]);}
 if(NT=='round'){   // 圓頭（使用者範例）：鼻樑線跟翹頭尖鼻一樣，鼻頭是一個比較寬的圓（5×4），上半陰影色、下半深色
  const n=L0-5;let ex=0;for(let k=0;k<=n;k++){const t=k/n,dx=Math.round(-5+1.6*Math.sin(Math.PI*t*.9)-1.4*t*t);ex=dx;path.push([dx,-L0+k,t<.2?LT:SH])}
  // 鼻頭：接在線尾的一個寬圓圈（5×4），上半陰影色、下半深色，裡面不填
  const cx=ex+1;path.push([ex,-4,SH]);for(const[dx,dy,c]of[[-1,-3,SH],[0,-3,SH],[1,-3,SH],[-2,-2,SH],[2,-2,SH],[-2,-1,DK],[2,-1,DK],[-1,0,DK],[0,0,DK],[1,0,DK]])path.push([cx+dx,dy,c]);}
 for(const[dx,dy,c]of path)put(CX+dx,ny+dy,c);
}
  if(process.env.BROW!=='0'){require('./brow.cjs')(put,(x,y)=>face[y*N+x],([x,y,z])=>[CX+x,y,1],{CY,R,EAR});
   if(G)for(const s of[1,-1])for(let a=0;a<6.28;a+=.02){const x=Math.round(CX+s*33+17*Math.cos(a)),y=Math.round(EAR+10*Math.sin(a));if(Math.round(a/.02)%5<3)dot(x,y,SH)}}   // 眼睛位置（虛線橢圓）
 if(process.env.EYE!=='0')require('./eye.cjs')(put,(x,y)=>face[y*N+x],{CX,EAR});
 if(process.env.MOUTH!=='0')require('./mouth.cjs')(put,(x,y)=>face[y*N+x],([x,y,z])=>[CX+x,y,1],{MOUTH,zc:55});
 px.face=face;return px;
}
module.exports=draw;
if(require.main===module){
 const fs=require('fs');fs.mkdirSync('mold9',{recursive:true});
 // 九張：每一列只改一個部分，其他兩個維持「中」
 const rows=[['B',l=>[LV[l],1,1]],['C',l=>[1,LV[l],1]],['D',l=>[1,1,LV[l]]]];
 for(const[p,f]of rows)for(const l of['短','中','長']){const px=draw(...f(l));L.png({width:N,height:N,pixels:px},1,`mold9/${p}_${l}.png`)}
 L.png({width:N,height:N,pixels:draw(1,1,1)},3,'mold6_x3.png');
}
