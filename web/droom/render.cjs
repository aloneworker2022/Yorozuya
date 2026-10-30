const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs');
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const AR=['small','medium','large','huge'],SH=['round','bell','pendulous'],CU='ABCDEFGH'.split('');
const jobs=new Set();for(const b in BODY)for(const s of SH)for(const c of CU)for(const a of AR)for(const d in DIR)jobs.add([b,s,c,a,d].join('_'));const SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1);let ji=0;
for(const b in BODY)for(const a of AR)for(const d in DIR)jobs.add([b,'round','D',a,d].join('_'));
for(const s of SH)for(const c of CU)for(const d in DIR)jobs.add(['balanced',s,c,'medium',d].join('_'));
for(const s of SH)for(const c of CU)for(const a of AR)jobs.add(['balanced',s,c,a,'front'].join('_'));
let n=0;for(const k of jobs){if((ji++)%NSH!==SHARD)continue;const[b,s,c,a,d]=k.split('_').length>5?(()=>{const p=k.split('_');return[p[0],p[1],p[2],p[3],p.slice(4).join('_')]})():k.split('_');
const doll=D.lookToDoll({...BODY[b],cup:c+' 罩杯'});doll.shape=s;doll.areola=a;doll.hair='none';   // 2026-10-30 pt24u：身體 sheet 不含頭髮，頭髮另外疊 sheets/hair/
const S={width:64*8,height:140,pixels:new Uint8ClampedArray(512*140*4)};
for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[d]);for(let y=0;y<140;y++)S.pixels.set(f.pixels.subarray(y*256,(y+1)*256),(y*512+i*64)*4);}
png(S,1,`${__dirname}/sheets/${k}.png`);if(++n%50==0)console.log(n,jobs.size);}
// 頭髮圖層：sheets/hair/<body>_<back|front>_<style>_<dir>.png，只留頭髮像素（被身體擋住的不畫）
require('fs').mkdirSync(__dirname+'/sheets/hair',{recursive:true});let hn=0;
for(const b in BODY)for(const[L,list]of[['back',D.BACK_HAIRS],['front',D.FRONT_HAIRS]])for(const st of list)for(const d in DIR){if((ji++)%NSH!==SHARD)continue;
const doll=D.lookToDoll({...BODY[b],cup:'D 罩杯'});doll.shape='round';doll.areola='medium';doll.backHair=L=='back'?st:null;doll.frontHair=L=='front'?st:null;
const S={width:64*8,height:140,pixels:new Uint8ClampedArray(512*140*4)};
for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[d]);for(let y=0;y<140;y++)for(let x=0;x<64;x++){const si=(y*64+x)*4;if(f.pixels[si+3]!==D.HAIR_A)continue;S.pixels.set(f.pixels.subarray(si,si+4),(y*512+i*64+x)*4);}}
png(S,1,`${__dirname}/sheets/hair/${b}_${L}_${st}_${d}.png`);hn++;}console.log('hair',hn);
require('fs').writeFileSync(__dirname+'/combos.json',JSON.stringify([...jobs]));console.log('done',n);
