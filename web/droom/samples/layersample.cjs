// 樣品圖層：node layersample.cjs <dir> <brows|blindfold>
const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},K=2,FW=128,FH=280,O=__dirname+'/../sheets2x';
const [d,it]=process.argv.slice(2);
const doll=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';doll.nose='small';doll.mouth='mark';
const C=it=='brows'?[D.BROW_RGB,D.BROW_LO_RGB]:[D.BLIND_RGB,D.BLIND_LO_RGB];doll[it]=it=='brows'?'mark':'cloth';
const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
for(let i=0;i<8;i++){const r=D.render(doll,'walk',i,DIR[d],{scale:K}),p=r.pixels;for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(p[si+3]===D.CLOTH_A&&C.some(c=>p[si]===c[0]&&p[si+1]===c[1]&&p[si+2]===c[2]))S.pixels.set(p.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
require('fs').mkdirSync(O+'/face',{recursive:true});png(S,1,it=='brows'?`${O}/face/balanced_brows_${d}.png`:`${O}/face/balanced_blindfold_cloth_${d}.png`);
