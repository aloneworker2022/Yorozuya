// 2026-11-18 胸部：配對表全部乳型 × 罩杯（4×、站著不晃；胸廓＝chest2d.js、乳房＝room_doll_full.js）
// 用法：node samples/chest2d/grid.cjs <yaw> <dir> <out.png>   例：node samples/chest2d/grid.cjs 0 front samples/chest2d/table_front.png；列＝乳型、欄＝A～I，表上不會出現的格子留空
const D=require(__dirname+'/../../room_doll_full.js'),PS=require(__dirname+'/../../parts_shade.js'),png=require(__dirname+'/../../png.cjs'),C3=require(__dirname+'/../../chest2d.js');
const yaw=+process.argv[2],dir=process.argv[3],out=process.argv[4];
const K=4,Q=2,W=64*K,H=140*K,n=W*H,MAP={'51,45,64':[242,204,177],'134,112,152':[184,124,104],'30,24,40':[184,124,104],'33,27,45':[184,124,104],'240,240,240':[255,255,255],'150,100,128':[222,150,146],'205,150,175':[196,108,112],'90,60,60':[184,124,104],'110,75,75':[236,197,171]};
const tint=px=>{for(let i=0;i<n;i++){if(!px[i*4+3])continue;const m=MAP[px[i*4]+','+px[i*4+1]+','+px[i*4+2]];if(m)px.set(m,i*4);px[i*4+3]=255}return px};
const TABLE=[['平坦／微隆','flat',{},'AB'],['饅頭型','dome',{},'ABCDE'],['挺俏上挺','perky',{},'ABCDEF'],['半球型','sup',{},'BCDE'],['自然圓潤','round',{},'BCDEFG'],
 ['水滴型','teardrop',{},'CDEFGHI'],['極密著深溝','round',{gap:'close'},'CDEFGHI'],['木瓜型','pendulous',{},'DEFGHI'],['鐘型','bell',{},'DEFGHI'],['母乳型沉重下垂','heavy',{},'EFGHI']];
const CUPS='ABCDEFGHI'.split(''),Y0=60*Q,CH=96*Q,X0=24*Q,CW=80*Q,OW=CW*CUPS.length,OH=CH*TABLE.length,o=new Uint8ClampedArray(OW*OH*4);
for(let i=0;i<OW*OH;i++)o.set([...((((i%OW)/CW|0)+((i/OW|0)/CH|0))%2?[246,246,246]:[234,236,240]),255],i*4);
const torso=C3.draw({dir,noBreast:true,scale:Q}).pixels;
TABLE.forEach(([name,sh,ex,cups],r)=>CUPS.forEach((c,ci)=>{if(!cups.includes(c))return;
 const d=D.lookToDoll({height_cm:161,build:'勻稱有致',cup:c+' 罩杯'});d.shape=sh==='sup'?'round':sh;d.braSupport=sh==='sup';d.areola='medium';d.hair='none';d.face='anime';Object.assign(d,ex);d._yaw=yaw;d.noWideLines=1;
 const enc=p=>PS.encode(D.render(d,'walk',0,yaw,{scale:K,parts:[p],gbuf:true,stand:true,bakeStamps:true}));
 const G=PS.merge([enc('chest'),enc('breast')],n),old=tint(PS.shade(G,W,H)),px=new Uint8ClampedArray(torso);
 const isB=i=>{for(const j of[i-1,i+1,i-W,i+W,i-2,i+2,i-3,i+3,i-2*W,i+2*W])if(G.code[j]>=1&&G.code[j]<=3)return true;return false};
 for(let i=0;i<n;i++){const c2=G.code[i];if(G.hit[i]&&((c2>=1&&c2<=3)||(c2>=121&&isB(i))))px.set(old.subarray(i*4,i*4+4),i*4)}
 for(let y=0;y<CH;y++)for(let x=0;x<CW;x++){const s=((y+Y0)*W+x+X0)*4;if(px[s+3])o.set(px.subarray(s,s+3),((r*CH+y)*OW+ci*CW+x)*4)}}));
png({width:OW,height:OH,pixels:o},1,out);
