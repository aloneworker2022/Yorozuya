// node poseanim.cjs <pose> → /tmp/shots/pa_<pose>_<f>.png（上色疊回去：0／90／180 度＋拆開 45 度）
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const mk=()=>{const x=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});x.shape='round';x.areola='medium';x.hair='none';x.face='anime';return x};
const A=[217,168,142],B=[245,208,181],C=[253,230,214],NP=[[236,150,160],[226,120,138]];
const tint=(p,i)=>{const r=p[i],g=p[i+1],b=p[i+2];if(r==240&&g==240&&b==240)return[255,255,255];if(r==90&&g==60&&b==60)return[226,178,152];if(r==150&&g==100&&b==128)return NP[0];if(r==205&&g==150&&b==175)return NP[1];
 const l=r*.3+g*.59+b*.11,t=Math.max(0,Math.min(1,(l-28)/47)),[P,Q,u]=t<.5?[A,B,t*2]:[B,C,(t-.5)*2];return P.map((v,j)=>v+(Q[j]-v)*u)};
const pose=process.argv[2],NF=D.POSES[pose].frames,OFF={torso:[0,0],legs:[0,18],armL:[-18,0],armR:[18,0],breast:[0,0],head:[0,-16]},ORD=['torso','legs','armL','armR','breast','head'];
for(let f=0;f<NF;f++){const R=[0,90,180].map(y=>D.renderParts(mk(),pose,f,y,{scale:2}).composite);const W=R[0].width,H=R[0].height,PADX=40,PADY=36,CW=W+PADX*2,CH=H+PADY*2;
 const S={width:CW*4,height:CH,pixels:new Uint8ClampedArray(CW*4*CH*4)};for(let i=0;i<S.pixels.length;i+=4)S.pixels.set([34,29,44,255],i);
 const out=(p,W)=>{const a=new Uint8Array(W*H);for(let i=0;i<W*H;i++)a[i]=p[i*4+3]?1:0;return a};
 R.forEach((r,c)=>{const p=r.pixels,al=out(p,W);for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,X=c*CW+PADX+x,Y=PADY+y;let o=null;
   if(al[i])o=tint(p,i*4);else if((x>0&&al[i-1])||(x<W-1&&al[i+1])||(y>0&&al[i-W])||(y<H-1&&al[i+W]))o=[255,255,255];if(o)S.pixels.set([...o,255],(Y*S.width+X)*4)}});
 for(const pt of ORD){const r=D.render(mk(),pose,f,45,{scale:2,parts:[pt]}),p=r.pixels,[dx,dy]=OFF[pt];
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=(y*W+x)*4;if(!p[si+3])continue;const X=3*CW+PADX+x+dx,Y=PADY+y+dy;if(X<3*CW||Y<0||X>=S.width||Y>=CH)continue;S.pixels.set([...tint(p,si),255],(Y*S.width+X)*4)}}
 png(S,1,`/tmp/shots/pa_${pose}_${f}.png`)}
console.log(pose,NF);
