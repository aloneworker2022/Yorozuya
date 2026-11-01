// 樣品：勻稱 round D medium 走路 2×，動漫臉型＋鼻子；輸出到 sheets2x（截圖後還原）
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},K=2,FW=128,FH=280,O=__dirname+'/../sheets2x';
const d=process.argv[2],what=process.argv[3];
const doll=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';
if(what=='nose')doll.nose=process.argv[4]||'small';
const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
for(let i=0;i<8;i++){const r=D.render(doll,'walk',i,DIR[d],{scale:K});for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4,p=r.pixels;if(!p[si+3])continue;
 if(what=='nose'&&!(p[si+3]===D.CLOTH_A&&p[si+1]===0&&p[si]>100&&p[si+2]>40))continue;S.pixels.set(p.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
png(S,1,what=='nose'?`${O}/face/balanced_nose_${process.argv[4]||'small'}_${d}.png`:`${O}/balanced_round_D_medium_${d}.png`);
