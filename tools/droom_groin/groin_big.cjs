// 近景私處（跟 eyes_big.js 一樣：模型只給位置，近景另外用曲線畫）：陰毛＋陰唇肉穴。
// 顏色只用 droom 那幾階：肉色 C/B/A、鼠蹊線色、陰唇粉、內裡紅、小口深紅、髮色兩階＋一階亮。
const SKIN={hi:[253,230,214],base:[245,208,181],sh:[217,168,142],dk:[196,140,118]};
const LAB={rim:[176,92,104],out:[214,142,146],min:[196,108,118],inn:[208,52,72],innHi:[240,110,124],hole:[122,14,30],holeDk:[84,6,18],clit:[250,170,180]};
const WET=[255,250,252];
function hash(x,y,k=0){let h=(x*374761393+y*668265263+k*1442695041)|0;h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967296}
function bbox(L,w,h,test){let x0=1e9,y0=1e9,x1=-1,y1=-1,n=0;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4;if(L[i+3]&&test(L,i)){n++;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y}}return n?{x0,y0,x1,y1,cx:(x0+x1)/2,w:x1-x0+1,h:y1-y0+1}:null}
exports.draw=function(d,w,h,MK,o){
  const put=(x,y,c,a=1)=>{x=Math.round(x);y=Math.round(y);if(x<0||y<0||x>=w||y>=h)return;const i=(y*w+x)*4;if(!d[i+3])return;for(let j=0;j<3;j++)d[i+j]=d[i+j]*(1-a)+c[j]*a};
  const LB=MK.labia&&bbox(MK.labia,w,h,()=>true);
  const PB=MK.pubic&&bbox(MK.pubic,w,h,()=>true);
  const LAY={};
  const solid=(x,y)=>{x=Math.round(x);y=Math.round(y);return x>=0&&y>=0&&x<w&&y<h&&d[(y*w+x)*4+3]>0};
  // ---- 陰唇肉穴 ----
  if(LB){
    const cx=LB.cx;
    let bot=LB.y0;while(solid(cx,bot+1)&&solid(cx-3,bot+1)&&solid(cx+3,bot+1))bot++;bot-=1;   // 往下到身體底（坐地：會陰被地板切掉的地方）
    const LH=(o.px||760)*0.115*(o.size||1), top=bot-LH, H=LH, HW=H*0.36;   // 大小跟著鏡頭（不看標記寬，各種陰唇同大小）
    LAY.top=top;LAY.H=H;
    const W=v=>HW*Math.pow(Math.max(0,Math.sin(Math.PI*Math.min(1,Math.max(0,v)))),0.62)*(1-0.12*v);   // 杏仁：下半略寬圓
    const open=o.open?0.34:0.16, CW=v=>W(v)*open*Math.pow(Math.max(0,Math.sin(Math.PI*v)),0.4);
    for(let y=Math.floor(top);y<=Math.ceil(bot);y++){const v=(y+.5-top)/H;if(v<0||v>1)continue;const ww=W(v),cw=CW(v);
      for(let x=Math.floor(cx-ww-1);x<=Math.ceil(cx+ww+1);x++){const u=x+.5-cx,au=Math.abs(u);
        if(au>ww)continue;let c;
        if(au>ww-1.2)c=[226,178,152];                             // 大陰唇外緣（用 droom 鼠蹊線色，淡）
        else if(au>cw+1.2){const t=(au-cw)/(ww-cw);               // 鼓起的肉瓣：上內側一條亮、下外側陰影，其餘本色
          c=(t<.32&&Math.abs(v-.38)<.26*(1-t*1.6))?SKIN.hi:(t>.72&&v>.55)||v>.9?SKIN.sh:SKIN.base;}
        else if(au>cw)c=LAB.rim;                                  // 縫邊
        else{const t=au/Math.max(.5,cw);                          // 縫裡：小陰唇→內裡
          c=t>.6?LAB.min:(v>.55?LAB.inn:LAB.out);                 // 上段粉、下段（穴口附近）紅
          if(v<.2)c=t>.5?LAB.min:LAB.out;}
        put(x,y,c);}}
    // 陰蒂
    const vy=top+H*0.17;put(cx,vy,LAB.clit);put(cx,vy+1,LAB.min);
    // 肉穴口（下 1/3，往內凹）
    const hy=top+H*0.7, hr=Math.max(1.5,CW(.7)*0.75), hv=Math.max(2,H*0.1);
    for(let y=Math.floor(hy-hv);y<=Math.ceil(hy+hv);y++)for(let x=Math.floor(cx-hr);x<=Math.ceil(cx+hr);x++){const e=((x+.5-cx)/hr)**2+((y+.5-hy)/hv)**2;if(e<1)put(x,y,e<.45?LAB.holeDk:LAB.hole)}
    // 內裡亮點＋濕亮
    put(cx-1,top+H*.38,LAB.innHi);put(cx+1,top+H*.52,LAB.innHi);put(cx,hy-hv-1,LAB.innHi);
    for(const[du,dv]of[[-.45,.42],[.4,.5],[-.3,.62],[.15,.85]])put(cx+du*W(dv),top+H*dv,WET);
    // 愛液：從穴口往下牽兩條細絲＋一滴
    const yb=hy+hv;for(let i=1;i<H*0.12;i++)put(cx+.5,yb+i,[250,226,232],.85);put(cx+.5,yb+H*.12+1,WET);
  }
  // ---- 陰毛 ----
  if(PB){
    const HP=o.hair, HL=HP[1].map(v=>Math.min(255,v+38));
    const DY=LAY.H?Math.max(0,PB.y1-(LAY.top+LAY.H*0.16)):0;   // 往上移多少
    const M=MK.pubic, inM=(x,y)=>{x=Math.round(x);y=Math.round(y+DY);if(x<0||y<0||x>=w||y>=h)return 0;const i=(y*w+x)*4;return M[i+3]?(M[i]==255?2:1):0};
    const cx=PB.cx, sx=PB.w/2, cy=(PB.y0+PB.y1)/2-DY, sy=PB.h/2;
    // 底：實心暗毛（中間區），外緣不填、交給一根根毛
    for(let y=PB.y0-DY;y<=PB.y1-DY;y++)for(let x=PB.x0;x<=PB.x1;x++)if(inM(x,y)==2)put(x,y,hash(x,y,3)<.8?HP[0]:HP[1]);
    // 一根根捲毛：從區內長出，大多往下、往外翹，尾巴可以超出標記（蓋到皮膚上）
    const N=Math.round(PB.w*PB.h*0.16*(o.K||2)/2);
    for(let k=0;k<N;k++){
      let x=cx+(hash(k,1)*2-1)*sx*.95, y=cy+(hash(k,2)*2-1)*sy*.95;
      if(!inM(x,y))continue;
      const side=(x-cx)/sx;                                   // −1 左…＋1 右
      let a=Math.PI/2-side*1.1+(hash(k,3)-.5)*1.6, curl=(hash(k,4)-.5)*.5;
      const len=2+hash(k,5)*(inM(x,y)==2?4:7)*(o.K||2)/2;
      const t=hash(k,6), col=t<.55?HP[0]:t<.9?HP[1]:HL;
      for(let i=0;i<len;i++){put(x,y,col);x+=Math.cos(a)*.9;y+=Math.sin(a)*.9;a+=curl;if(i>len*.5)curl*=1.15}
    }
    // 底緣幾撮蓋到陰唇上方（像參考圖往下垂）
    if(LB)for(let k=0;k<Math.round(PB.w*.6);k++){let x=cx+(hash(k,7)*2-1)*Math.min(sx,LB.w*.7),y=PB.y1-DY-hash(k,8)*sy*.4;let a=Math.PI/2+(hash(k,9)-.5)*1.2,curl=(hash(k,10)-.5)*.6;const len=2+hash(k,11)*5;for(let i=0;i<len;i++){put(x,y,hash(k,12)<.6?HP[0]:HP[1]);x+=Math.cos(a)*.9;y+=Math.sin(a)*.9;a+=curl}}
  }
};
