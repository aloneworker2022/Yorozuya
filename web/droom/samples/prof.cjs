const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const K=4,S={width:300,height:110,pixels:new Uint8ClampedArray(300*110*4).fill(255)};
[[0,null],[1,'mark']].forEach(([i,m])=>{const doll=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';doll.nose='small';if(m)doll.mouth=m;
const r=D.render(doll,'walk',0,90,{scale:K}),p=r.pixels,W=256;for(let y=0;y<110;y++)for(let x=0;x<150;x++){const si=((y+80)*W+x+80)*4;if(!p[si+3])continue;const lip=p[si+3]===D.CLOTH_A&&p[si+1]>=150&&p[si]>=60&&p[si+2]<=130;S.pixels.set([...(lip?[230,120,130]:[240,200,175]),255],(y*300+i*150+x)*4)}});
png(S,4,process.argv[2]);
