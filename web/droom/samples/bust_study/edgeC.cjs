// 研習：原本的人偶（repo 的 room_doll_full.js，不改模型）C 罩杯正面 ×4，站姿，只畫邊
// 邊＝①剪影外框 ②前後交界（旁邊有更靠近的表面）③折角（表面方向突然轉）④模型本身的線（鎖骨摺線、乳房弧線）
const DR=process.argv[2], D=require(DR+'/room_doll_full.js'), png=require(DR+'/png.cjs'), OUT=process.argv[3];
const E=(k,d)=>process.env[k]!=null?+process.env[k]:d;
const K=4,doll=D.lookToDoll({height_cm:161,build:'勻稱有致',cup:'C 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';
const im=D.render(doll,'walk',0,0,{scale:K,stand:true}),p=im.pixels,W=im.width,Hh=im.height;
const g=D.render(doll,'walk',0,0,{scale:K,gbuf:true,stand:true}),hit=g.hit,DS=1.818;
const Y=new Float32Array(W*Hh);for(let i=0;i<W*Hh;i++)Y[i]=g.tt[i]*DS;   // 前後距離（模型格）
const at=(x,y)=>(x<0||y<0||x>=W||y>=Hh||!hit[y*W+x])?null:Y[y*W+x];
// 法線
const N=new Float32Array(W*Hh*3),R=E('R',1);
for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!hit[i])continue;const c=Y[i];
 const l=at(x-R,y),r=at(x+R,y),u=at(x,y-R),d=at(x,y+R);
 const ok=(v)=>v!=null&&Math.abs(v-c)<E('JMP',.8);   // 跨過前後交界不算斜率
 const gx=((ok(r)?r:c)-(ok(l)?l:c))/((ok(r)?R:0)+(ok(l)?R:0)||1)*K*1.1, gy=((ok(d)?d:c)-(ok(u)?u:c))/((ok(d)?R:0)+(ok(u)?R:0)||1)*K;
 let n=[-gx,-gy,1];const nl=Math.hypot(...n);N.set(n.map(v=>v/nl),i*3)}
const line=new Uint8Array(W*Hh),kind=new Uint8Array(W*Hh);
for(let y=0;y<Hh;y++)for(let x=0;x<W;x++){const i=y*W+x;if(!hit[i])continue;const c=Y[i];
 for(const[dx,dy]of[[1,0],[-1,0],[0,1],[0,-1]]){const xx=x+dx,yy=y+dy;
  if(xx<0||yy<0||xx>=W||yy>=Hh||!hit[yy*W+xx]){line[i]=1;kind[i]=1;break}                       // ① 剪影
  const j=yy*W+xx,v=Y[j];
  if(v-c>E('OCC',.8)){line[i]=1;kind[i]=2;break}                                                 // ② 我在後面、旁邊比較近
  const dot=N[i*3]*N[j*3]+N[i*3+1]*N[j*3+1]+N[i*3+2]*N[j*3+2];
  if(dot<Math.cos(E('ANG',38)*Math.PI/180)&&v>=c-1e-3){line[i]=1;kind[i]=3;break}                 // ③ 折角（只描一邊）
 }
 const r=p[i*4],gg=p[i*4+1],b=p[i*4+2];
 const isM=(k)=>{const a=p[k*4],bb2=p[k*4+1],cc=p[k*4+2];return (a==90&&bb2==60&&cc==60)||(a==134&&bb2==112&&cc==152)};
 if(isM(i)&&!(process.env.THIN&&y>0&&isM(i-W))){line[i]=1;kind[i]=kind[i]||4}            // ④ 模型本身的線（THIN：粗線只留最上面一格）
}
const MODE=process.env.MODE||'skin', LC=(process.env.LC||(MODE=='white'?'40,32,36':'150,96,80')).split(',').map(Number);
const SKIN=[242,204,177],BG=MODE=='white'?[255,255,255]:[236,232,226];
const y0=Math.round(Hh*E('Y0',.262)),y1=Math.round(Hh*E('Y1',.44)),H=y1-y0;
const S={width:W,height:H,pixels:new Uint8ClampedArray(W*H*4)};
for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=(y+y0)*W+x,di=(y*W+x)*4;let c=BG;
 if(hit[i]){const r=p[i*4],gg=p[i*4+1],b=p[i*4+2];
  c=MODE=='white'?BG:SKIN;
  if(MODE!='white'&&r==150&&gg==100&&b==128)c=[205,140,140];if(MODE!='white'&&r==205&&gg==150&&b==175)c=[225,160,165];
  if(line[i])c=LC}
 S.pixels.set([...c,255],di)}
png(S,2,OUT);
const cnt=[0,0,0,0,0];for(let i=0;i<W*Hh;i++)if(line[i])cnt[kind[i]]++;console.log('lines by kind',cnt.join(' '));
