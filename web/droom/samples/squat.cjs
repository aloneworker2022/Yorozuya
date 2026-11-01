// node squat.cjs <yaw> → /tmp/shots/sq_<yaw>_<f>.png（上色＋頭髮）＋拆開版 sqx_<f>.png（yaw==45 時）
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const yaw=+process.argv[2],mk=(h)=>{const x=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});x.shape='round';x.areola='medium';x.face='anime';if(h){x.backHair='long';x.frontHair='curtain'}else x.hair='none';return x};
const A=[217,168,142],B=[245,208,181],C=[253,230,214],NP=[[236,150,160],[226,120,138]],HP=[[22,20,24],[74,72,80]];
const tint=(p,i)=>{const r=p[i],g=p[i+1],b=p[i+2];if(r==240&&g==240&&b==240)return[255,255,255];if(r==90&&g==60&&b==60)return[226,178,152];if(r==150&&g==100&&b==128)return NP[0];if(r==205&&g==150&&b==175)return NP[1];
 const l=r*.3+g*.59+b*.11,t=Math.max(0,Math.min(1,(l-28)/47)),[P,Q,u]=t<.5?[A,B,t*2]:[B,C,(t-.5)*2];return P.map((v,j)=>v+(Q[j]-v)*u)};
let dif=0,tot=0;const OFF={torso:[0,0],legs:[0,18],armL:[-18,0],armR:[18,0],breast:[0,0],head:[0,-16]},ORD=['torso','legs','armL','armR','breast','head'];
for(let f=0;f<16;f++){const {composite:r}=D.renderParts(mk(0),'squat_down',f,yaw,{scale:2}),hl=D.renderHairLayer(mk(1),'squat_down',f,yaw,{scale:2});const W=r.width,H=r.height,S={width:W+40,height:H+20,pixels:new Uint8ClampedArray((W+40)*(H+20)*4)};
 for(let i=0;i<S.pixels.length;i+=4)S.pixels.set([34,29,44,255],i);const al=new Uint8Array(W*H),col=new Array(W*H);
 for(let i=0;i<W*H;i++){const p=r.pixels,hp=hl.pixels,j=i*4;if(p[j+3])col[i]=tint(p,j);if(hp[j+3]&&(hp[j+3]!=214||!p[j+3]))col[i]=hp[j]>60?HP[1]:HP[0];if(col[i])al[i]=1}
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;let o=col[i];if(!o&&((x>0&&al[i-1])||(x<W-1&&al[i+1])||(y>0&&al[i-W])||(y<H-1&&al[i+W])))o=[255,255,255];if(o)S.pixels.set([...o,255],((y+10)*S.width+x+20)*4)}
 png(S,1,`/tmp/shots/sq_${yaw}_${f}.png`);
 if(f%4==0){const a=D.render(mk(0),'squat_down',f,yaw,{scale:2}).pixels,b=r.pixels;for(let i=0;i<a.length;i+=4)if(a[i+3]||b[i+3]){tot++;if(a[i]!=b[i]||a[i+1]!=b[i+1]||a[i+2]!=b[i+2]||a[i+3]!=b[i+3])dif++}}
 if(yaw==45){const X={width:W+80,height:H+60,pixels:new Uint8ClampedArray((W+80)*(H+60)*4)};for(let i=0;i<X.pixels.length;i+=4)X.pixels.set([34,29,44,255],i);
  for(const pt of ORD){const q=D.render(mk(0),'squat_down',f,45,{scale:2,parts:[pt]}).pixels,[dx,dy]=OFF[pt];for(let y=0;y<H;y++)for(let x=0;x<W;x++){const si=(y*W+x)*4;if(!q[si+3])continue;const xx=x+40+dx,yy=y+30+dy;if(xx<0||yy<0||xx>=X.width||yy>=X.height)continue;X.pixels.set([...tint(q,si),255],(yy*X.width+xx)*4)}}
  png(X,1,`/tmp/shots/sqx_${f}.png`)}}
console.log('yaw',yaw,'diff',dif,'/',tot,(dif/tot*100).toFixed(3)+'%');
