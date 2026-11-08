// 用 droom 人偶（room_doll_full.js）拍 M 字腿胯下近景，照 droom index.html 的 tint／groinOver／outline 上色。
const DR=process.env.DROOM, D=require(DR+'/room_doll_full.js'), png=require(DR+'/png.cjs');
const CELL=126/1.15;
const env=(k,d)=>process.env[k]!==undefined?+process.env[k]:d;
const W=env('W',200),H=env('H',200),K=env('K',2);
const CAM={dist:env('DIST',.45)*CELL,eyeZ:env('EYE',.45)*CELL,pitch:env('PITCH',35)*Math.PI/180,f:env('F',300),w:W,h:H,cx:W/2,cy:env('CY',H/2)};
const POSE=process.env.POSE||'sit_m';
const mk=(o={})=>{const x=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});x.shape='round';x.areola='medium';x.hair='none';Object.assign(x,o);return x};
const R=d=>D.render(d,POSE,0,0,{scale:K,cam:CAM});
const base=R(mk()), w=base.width||W*K, h=base.height||H*K, d=new Uint8ClampedArray(base.pixels);
const layers=[], MK={};
for(const [k,st] of [['labia',process.env.LABIA||'butterfly_open'],['pubic',process.env.PUBIC||'triangle']]) if(st!=='none'){
  const r=R(mk({[k]:st})).pixels; const L=new Uint8ClampedArray(r.length);
  for(let i=0;i<r.length;i+=4) if(r[i+3]===D.CLOTH_A&&base.pixels[i+3]) L.set(r.subarray(i,i+4),i);
  layers.push(L); MK[k]=L;
}
// ---- 上色（抄 droom index.html tint）----
const HP=[[30,22,26],[70,56,60]], NP=[[214,120,140],[236,150,168]];
const A=[217,168,142],B=[245,208,181],C=[253,230,214];
const hm=new Uint8Array(d.length>>2);
for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const r=d[i],g=d[i+1],b=d[i+2];let o=null;
 if(r==240&&g==240&&b==240)o=[255,255,255];else if(r==90&&g==60&&b==60)o=[226,178,152];else if(r==110&&g==75&&b==75)o=[236,197,171];else if(r==150&&g==100&&b==128)o=NP[0];else if(r==205&&g==150&&b==175)o=NP[1];
 if(o){d[i]=o[0];d[i+1]=o[1];d[i+2]=o[2];d[i+3]=255;continue}
 const l=r*.3+g*.59+b*.11,t=Math.max(0,Math.min(1,(l-28)/(75-28)));const [P,Q,u]=t<.5?[A,B,t*2]:[B,C,(t-.5)*2];
 for(let j=0;j<3;j++)d[i+j]=P[j]+(Q[j]-P[j])*u;d[i+3]=255}
const BIG=process.env.BIG!=='0';
for(const L of (BIG?[]:layers))for(let i=0;i<d.length;i+=4){if(!L[i+3])continue;const r=L[i],g=L[i+1],b=L[i+2],p=i>>2,x=p%w,y=p/w|0;let o,k=1;
 if(r==255&&g==0&&b==255){if((x*3+y*5)%11==0)continue;o=(x*2+y*3)%7==0||((x+y*2)%9==0)?HP[1]:HP[0]}
 else if(r>170&&r<215&&g<20&&b>170&&b<215){if((x+y)%2||(x*3+y)%5==0)continue;o=HP[0];k=.85}
 else if(r==255&&g==255&&b==0)o=[196,108,118];else if(r==255&&g==0&&b==0)o=(x*7+y*3)%13?[208,52,72]:[240,110,124];else if(r>100&&r<160&&g<20&&b<20)o=[122,14,30];else continue;
 for(let j=0;j<3;j++)d[i+j]=d[i+j]*(1-k)+o[j]*k;d[i+3]=255}
if(BIG)require('./groin_big.cjs').draw(d,w,h,MK,{hair:HP,K,px:CAM.f*K,open:/open/.test(process.env.LABIA||'butterfly_open')});
// 外圈 1px 白
const al=new Uint8Array(w*h);for(let i=0;i<w*h;i++)al[i]=d[i*4+3]?1:0;
for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(al[i])continue;if((x>0&&al[i-1])||(x<w-1&&al[i+1])||(y>0&&al[i-w])||(y<h-1&&al[i+w])){d[i*4]=d[i*4+1]=d[i*4+2]=255;d[i*4+3]=255}}
png({width:w,height:h,pixels:d},+(process.env.UP||3),process.env.OUT||'out.png');
console.log('ok',w,h,JSON.stringify(CAM));
