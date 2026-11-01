// 拆部位疊回去的身體 sheet（樣品）：node compsheet.cjs <dir>
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},K=2,FW=128,FH=280,O=__dirname+'/../sheets2x';
const d=process.argv[2],mk=()=>{const x=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});x.shape='round';x.areola='medium';x.hair='none';x.face='anime';return x};
const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
for(let i=0;i<8;i++){const r=D.renderParts(mk(),'walk',i,DIR[d],{scale:K}).composite;for(let y=0;y<FH;y++)S.pixels.set(r.pixels.subarray(y*FW*4,(y+1)*FW*4),(y*FW*8+i*FW)*4)}
png(S,1,`${O}/balanced_round_D_medium_${d}.png`);
