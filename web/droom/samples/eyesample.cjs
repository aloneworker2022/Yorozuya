const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},K=2,FW=128,FH=280,O=__dirname+'/../sheets2x';
const d=process.argv[2];
const doll=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';doll.eyes='mark';
const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
for(let i=0;i<8;i++){const r=D.render(doll,'walk',i,DIR[d],{scale:K});for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4,p=r.pixels;if(p[si+3]===D.CLOTH_A&&p[si+2]>=150&&p[si]>=60&&p[si]<=130&&p[si+1]>=60&&p[si+1]<=130)S.pixels.set(p.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
require('fs').mkdirSync(O+'/face',{recursive:true});png(S,1,`${O}/face/balanced_eyes_${d}.png`);
