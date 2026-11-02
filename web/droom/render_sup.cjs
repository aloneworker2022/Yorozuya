// 2026-10-30 pt78u：穿胸罩（托高集中）的身體與衣服 sheet。托高後不分圓／鐘／下垂，形狀欄位固定寫 sup。
// sheets/sup/<body>_sup_<cup>_<areola>_<dir>.png、sheets/sup/cloth/<body>_sup_<cup>_<bra|tee|napkin_bell|napkin_jade>_<dir>.png
// HD=1 → sheets2x/sup/（只畫 balanced／D）。平行：SHARD=i NSHARD=n
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const HD=!!process.env.HD,K=HD?2:1,FW=64*K,FH=140*K,O=__dirname+(HD?'/sheets2x/sup':'/sheets/sup');
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const AR=['small','medium','large','huge'],CU=HD?['D']:'ABCDEFGH'.split(''),BS=HD?['balanced']:Object.keys(BODY),CLS=['bra','tee','napkin_bell','napkin_jade'];
const SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1),ONLY=process.env.ONLY;fs.mkdirSync(O+'/cloth',{recursive:true});
const jobs=[];for(const b of BS)for(const c of CU)for(const d in DIR){if(ONLY!='cloth')for(const a of AR)jobs.push([b,c,d,a,null]);if(ONLY!='body')for(const cl of CLS)jobs.push([b,c,d,'medium',cl])}
let n=0;jobs.forEach(([b,c,d,a,cl],ji)=>{if(ji%NSH!==SHARD)return;
 const doll=D.lookToDoll({...BODY[b],cup:c+' 罩杯'});doll.shape='round';doll.areola=a;doll.hair='none';doll.braSupport=true;if(cl)doll.cloth=cl;
 const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
 for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[d],HD?{scale:K}:undefined);for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(!f.pixels[si+3]||(cl&&f.pixels[si+3]!==D.CLOTH_A))continue;S.pixels.set(f.pixels.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
 png(S,1,cl?`${O}/cloth/${b}_sup_${c}_${cl}_${d}.png`:`${O}/${b}_sup_${c}_${a}_${d}.png`);if(++n%50==0)console.log(SHARD,n)});
console.log('sup done',SHARD,n);
