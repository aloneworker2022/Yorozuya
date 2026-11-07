// 2026-11-01 拆部位樣品：各部位分開算原始資料 → 每格取最近 → 統一上色，和整張一起算比對（node parts_sample.cjs → /tmp/shots/parts.png）
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs');
const mk=()=>{const d=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});d.shape='round';d.areola='medium';d.hair='none';d.face='anime';return d};
const COL={head:[230,160,60],torso:[120,170,230],breast:[230,110,150],armL:[110,200,120],armR:[60,150,90],legs:[170,130,220]};
const yaws=[0,45,90],W=128,H=280,cols=9,S={width:W*cols,height:H*yaws.length,pixels:new Uint8ClampedArray(W*cols*H*yaws.length*4).fill(255)};
const put=(cx,cy,x,y,rgb)=>S.pixels.set([...rgb,255],((cy*H+y)*S.width+cx*W+x)*4);
yaws.forEach((yaw,row)=>{const full=D.render(mk(),'walk',1,yaw,{scale:2});const {bufs,composite}=D.renderParts(mk(),'walk',1,yaw,{scale:2});
 D.PARTS.forEach((pt,k)=>{const b=bufs[pt];for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x;if(b.hit[i])put(k,row,x,y,COL[pt].map(v=>v*(.75+.25*Math.min(1,Math.max(0,(b.tt[i]+8)/16)))))}});
 for(let y=0;y<H;y++)for(let x=0;x<W;x++){const i=y*W+x,a=full.pixels,c=composite.pixels,j=i*4;
  if(c[j+3])put(6,row,x,y,[c[j],c[j+1],c[j+2]]);if(a[j+3])put(7,row,x,y,[a[j],a[j+1],a[j+2]]);
  const df=a[j]!=c[j]||a[j+1]!=c[j+1]||a[j+2]!=c[j+2]||a[j+3]!=c[j+3];if(df)put(8,row,x,y,[255,0,0]);else if(a[j+3])put(8,row,x,y,[215,215,215])}});
png(S,2,'/tmp/shots/parts.png');
