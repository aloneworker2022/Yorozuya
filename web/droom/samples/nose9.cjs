const D=require(__dirname+'/../room_doll_full.js'),png=require(__dirname+'/../png.cjs');
const ns=process.argv[2],K=4,X0=88,FW=90,Y0=100,FH=70,S={width:FW*3,height:FH,pixels:new Uint8ClampedArray(FW*3*FH*4).fill(255)};
const doll=D.lookToDoll({height_cm:161,build:'勻稱有致',hair:'中分長髮',cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll.face='anime';doll.nose=ns;
[0,45,90].forEach((yaw,i)=>{const r=D.render(doll,'walk',0,yaw,{scale:K}),p=r.pixels,W=64*K;for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=((y+Y0)*W+x+X0+(yaw==90?22:yaw==45?8:0))*4;if(!p[si+3])continue;
 const o=(p[si+1]===0&&p[si]>100)?[255,20,140]:[240,200,175];S.pixels.set([...o,255],(y*FW*3+i*FW+x)*4)}});
png(S,1,`/tmp/shots/n9_${ns}.png`);
