// 動漫臉用的頭髮圖層（樣品）：node hairsample.cjs <dir> <back|front> <style>
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},K=2,FW=128,FH=280,O=__dirname+'/../sheets2x';
const [d,L,st]=process.argv.slice(2);const x=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});x.shape='round';x.areola='medium';x.face='anime';x.backHair=L=='back'?st:null;x.frontHair=L=='front'?st:null;
const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
for(let i=0;i<8;i++){const r=D.renderHairLayer(x,'walk',i,DIR[d],{scale:K});for(let yy=0;yy<FH;yy++)for(let xx=0;xx<FW;xx++){const si=(yy*FW+xx)*4;if(r.pixels[si+3])S.pixels.set(r.pixels.subarray(si,si+4),(yy*FW*8+i*FW+xx)*4)}}
png(S,1,`${O}/hair/balanced_${L}_${st}_${d}.png`);
