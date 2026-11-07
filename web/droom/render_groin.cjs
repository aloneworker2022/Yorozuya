// 2026-10-30 pt31u：下身圖層 sheets/groin/<body>_<pubic|labia|pants>_<style>_<dir>.png，只留該部位標記色像素（被手腳擋住的不畫）。
// 跟胸型／罩杯無關（用 round D 算）。平行：SHARD=i NSHARD=n node render_groin.cjs
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const L=[...D.PUBICS.map(s=>['pubic',s]),...D.LABIAS.map(s=>['labia',s]),...D.PANTS.map(s=>['pants',s])],SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1);
fs.mkdirSync(__dirname+'/sheets/groin',{recursive:true});let ji=0,n=0;
for(const[k,st]of L)for(const b in BODY)for(const d in DIR){if((ji++)%NSH!==SHARD)continue;
const doll=D.lookToDoll({...BODY[b],cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.hair='none';doll[k]=st;
const S={width:512,height:140,pixels:new Uint8ClampedArray(512*140*4)};
const nk={...doll};delete nk[k];// pt32u：裸身剪影，圖層像素必須落在身體上（細繩不出臀部輪廓）
for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[d]),g=D.render(nk,'walk',i,DIR[d]);for(let y=0;y<140;y++)for(let x=0;x<64;x++){const si=(y*64+x)*4;if(f.pixels[si+3]!==D.CLOTH_A||!g.pixels[si+3])continue;S.pixels.set(f.pixels.subarray(si,si+4),(y*512+i*64+x)*4);}}
png(S,1,`${__dirname}/sheets/groin/${b}_${k}_${st}_${d}.png`);n++;}
console.log('groin done',SHARD,n);
