// 2026-10-30 pt28u：衣服圖層 sheets/cloth/<body>_<shape>_<cup>_<cloth>_<dir>.png，只留布的像素（被身體擋住的不畫）。
// pt77u：CL=bra,tee 只重畫指定衣服
// 跟乳暈、頭髮無關；前端在上色後以半透明白蓋上去（乳頭會隱約透出）。平行：SHARD=i NSHARD=n node render_cloth.cjs
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const SH=['round','bell','pendulous'],CU='ABCDEFGH'.split(''),SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1);
fs.mkdirSync(__dirname+'/sheets/cloth',{recursive:true});let ji=0,n=0;
for(const cl of D.CLOTHES.filter(c=>!process.env.CL||process.env.CL.split(',').includes(c)))for(const b in BODY)for(const s of SH)for(const c of CU)for(const d in DIR){if((ji++)%NSH!==SHARD)continue;
const doll=D.lookToDoll({...BODY[b],cup:c+' 罩杯'});doll.shape=s;doll.areola='medium';doll.hair='none';doll.cloth=cl;
const S={width:512,height:140,pixels:new Uint8ClampedArray(512*140*4)};
for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[d]);for(let y=0;y<140;y++)for(let x=0;x<64;x++){const si=(y*64+x)*4;if(f.pixels[si+3]!==D.CLOTH_A)continue;S.pixels.set(f.pixels.subarray(si,si+4),(y*512+i*64+x)*4);}}
png(S,1,`${__dirname}/sheets/cloth/${b}_${s}_${c}_${cl}_${d}.png`);if(++n%50==0)console.log(SHARD,n);}
console.log('cloth done',SHARD,n);
