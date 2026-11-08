// 研習：C 罩杯正面 ×4，肉色＋「一個」深一點的陰影色（用 gbuf 的表面深度 tt 判斷，tt 越大越靠近鏡頭，單位＝模型格，1 格＝K 像素）
const DR=process.argv[2], D=require(DR+'/room_doll_full.js'), png=require(DR+'/png.cjs'), OUT=process.argv[3];
const E=(k,d)=>process.env[k]!=null?+process.env[k]:d;
const SKIN=[242,204,177], SHADOW=(process.env.SHC||'214,162,136').split(',').map(Number);
const K=4,doll=D.lookToDoll({height_cm:161,build:'勻稱有致',cup:'C 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';
const im=D.render(doll,process.env.POSE||'walk',0,E('YAW',0),{scale:K,stand:!!process.env.STAND}),p=im.pixels,W=im.width,Hh=im.height;
const g=D.render(doll,process.env.POSE||'walk',0,E('YAW',0),{scale:K,gbuf:true,stand:!!process.env.STAND}),tt=g.tt,hit=g.hit;
const at=(x,y)=>(x<0||y<0||x>=W||y>=Hh||!hit[y*W+x])?null:tt[y*W+x];
// 光：上方偏左、偏前（畫面座標 x 右、y 下、z 朝鏡頭）
const L=[E('LX',-.25),E('LY',-.75),E('LZ',.6)],ll=Math.hypot(...L);L.forEach((v,i)=>L[i]=v/ll);
const TH=E('TH',.35),OCC=E('OCC',24),OS=E('OS',.25),R=E('R',2);
const out=new Uint8ClampedArray(p),shade=new Uint8Array(W*Hh);
for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!hit[i])continue;const c=tt[i];
 const l=at(x-R,y),r=at(x+R,y),u=at(x,y-R),d=at(x,y+R);
 // tt 換成真正的前後距離：Y＝2·tt／GIRTH（≈1.82 倍）；左右 X＝螢幕／GIRTH
 const DS=E('DS',1.818),GW=E('GW',1.1);
 const gx=((r??c)-(l??c))/(2*R)*K*DS*GW, gy=((d??c)-(u??c))/(2*R)*K*DS;   // 每模型格的深度變化
 let n=[-gx,-gy,1];const nl=Math.hypot(...n);n=n.map(v=>v/nl);
 const lam=n[0]*L[0]+n[1]*L[1]+n[2]*L[2];
 let occ=false;for(let k=1;k<=OCC;k++){const v=at(x,y-k);if(v!=null&&v-c>OS+k/K*(-L[2]/L[1])*0+0&&v-c>k/K*Math.abs(L[2]/L[1])){occ=true;break}}
 // 前後交界：旁邊有明顯更靠近鏡頭的表面（例如手臂蓋在身體前）→ 身體這側描一格陰影色
 let edge=false;const EG=E('EG',1.2);if(EG>0)for(const[dx2,dy2]of(process.env.NOTOP?[[1,0],[-1,0],[0,-1]]:[[1,0],[-1,0],[0,1],[0,-1]])){const v=at(x+dx2,y+dy2);if(v!=null&&(v-c>EG||(g.limb[y*W+x]!==g.limb[(y+dy2)*W+x+dx2]&&v-c>E('EL',.15)))){edge=true;break}}
 // 乳房輪廓：乳房旁邊（左右、下方）的身體描一格陰影色；上緣不描（融進胸口）
 if(process.env.BEDGE&&y>=E('BEY',0)&&!(g.bust[i]&127))for(const[dx2,dy2]of[[1,0],[-1,0],[0,-1]]){const j=(y+dy2)*W+x+dx2,v=at(x+dx2,y+dy2);if(v!=null&&(g.bust[j]&127)==1&&v-c>E('BE',.3)){edge=true;break}}
 if(lam<TH||occ||edge)shade[i]=1}
for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const i=y*W+x,j=i*4;if(!p[j+3])continue;const r=p[j],gg=p[j+1],b=p[j+2];let o;
 if(r==240&&gg==240&&b==240)o=[255,255,255];else if(r==90&&gg==60&&b==60)o=SHADOW;else if(r==150&&gg==100&&b==128)o=[205,140,140];else if(r==205&&gg==150&&b==175)o=[225,160,165];
 else if(r==30&&gg==24&&b==40||r==33&&gg==27&&b==45)o=SHADOW;else o=shade[i]?SHADOW:SKIN;
 out.set([...o,255],j)}
const y0=Math.round(Hh*E('Y0',.22)),y1=Math.round(Hh*E('Y1',.50)),H=y1-y0;const S={width:W,height:H,pixels:new Uint8ClampedArray(W*H*4)};
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=((y+y0)*W+x)*4,di=(y*W+x)*4,bg=[236,232,226];for(let k=0;k<3;k++)S.pixels[di+k]=out[si+3]?out[si+k]:bg[k];S.pixels[di+3]=255}
png(S,2,OUT);
