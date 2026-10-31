// 2026-10-30 pt36u：2× 解析度 sheet（每格 128×280）。pt79u：升級成跟 1× 一樣的完整組合（全部體型／胸型／罩杯／乳暈／髮型／衣服／下身／托高 sup）。
// 輸出 sheets2x/ 底下跟 sheets/ 相同的相對路徑。play.html?hd=1、index.html?hd=1 使用。
// 平行：SHARD=i NSHARD=n node render_hd.cjs；ONLY=body|hair|cloth|groin|sup|supcloth；CL=bra,tee 只畫指定衣服；FORCE=1 重畫已存在的檔
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const K=2,FW=64*K,FH=140*K,O=__dirname+'/sheets2x';
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const AR=['small','medium','large','huge'],SH=process.env.SHAPES?process.env.SHAPES.split(','):['round','bell','pendulous'],CU='ABCDEFGH'.split(''),SUPCL=['bra','tee','napkin_bell','napkin_jade'];
const ONLY=process.env.ONLY,SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1),FORCE=!!process.env.FORCE;
const CLF=c=>!process.env.CL||process.env.CL.split(',').includes(c);
for(const d of ['','/hair','/cloth','/groin','/sup','/sup/cloth'])fs.mkdirSync(O+d,{recursive:true});
const mk=(b,c,s,a)=>{const x=D.lookToDoll({...BODY[b],cup:c+' 罩杯'});x.shape=s;x.areola=a;x.hair='none';return x};
const jobs=[],on=k=>!ONLY||ONLY.split(',').includes(k);
for(const b in BODY)for(const d in DIR){
 if(on('body'))for(const s of SH)for(const c of CU)for(const a of AR)jobs.push([`/${b}_${s}_${c}_${a}_${d}.png`,d,()=>mk(b,c,s,a)]);
 if(on('cloth'))for(const cl of D.CLOTHES.filter(CLF))for(const s of SH)for(const c of CU)jobs.push([`/cloth/${b}_${s}_${c}_${cl}_${d}.png`,d,()=>{const x=mk(b,c,s,'medium');x.cloth=cl;return x},D.CLOTH_A]);
 if(on('hair'))for(const[L,list]of[['back',D.BACK_HAIRS],['front',D.FRONT_HAIRS]])for(const st of list)jobs.push([`/hair/${b}_${L}_${st}_${d}.png`,d,()=>{const x=D.lookToDoll({...BODY[b],cup:'D 罩杯'});x.shape='round';x.areola='medium';x.backHair=L=='back'?st:null;x.frontHair=L=='front'?st:null;return x},'hair']);   // 2026-10-31：renderHairLayer 分前髮／可能被擋的後髮
 if(on('groin'))for(const[k,st]of[...D.PUBICS.map(s=>['pubic',s]),...D.LABIAS.map(s=>['labia',s]),...D.PANTS.map(s=>['pants',s])])jobs.push([`/groin/${b}_${k}_${st}_${d}.png`,d,()=>{const x=mk(b,'D','round','medium');x[k]=st;return x},D.CLOTH_A,k]);
 if(on('sup'))for(const c of CU)for(const a of AR)jobs.push([`/sup/${b}_sup_${c}_${a}_${d}.png`,d,()=>{const x=mk(b,c,'round',a);x.braSupport=true;return x}]);
 if(on('supcloth'))for(const c of CU)for(const cl of SUPCL.filter(CLF))jobs.push([`/sup/cloth/${b}_sup_${c}_${cl}_${d}.png`,d,()=>{const x=mk(b,c,'round','medium');x.braSupport=true;x.cloth=cl;return x},D.CLOTH_A]);
}
let n=0,sk=0;jobs.forEach(([p,d,f,keep,nkk],ji)=>{if(ji%NSH!==SHARD)return;if(!FORCE&&fs.existsSync(O+p)&&fs.statSync(O+p).size>100){sk++;return}
 const doll=f();let nk=null;if(nkk){nk={...doll};delete nk[nkk]}
 const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
 for(let i=0;i<8;i++){const r=keep==='hair'?D.renderHairLayer(doll,'walk',i,DIR[d],{scale:K}):D.render(doll,'walk',i,DIR[d],{scale:K}),g=nk&&D.render(nk,'walk',i,DIR[d],{scale:K});
  for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(!r.pixels[si+3]||(keep&&keep!=='hair'&&r.pixels[si+3]!==keep)||(g&&!g.pixels[si+3]))continue;S.pixels.set(r.pixels.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
 png(S,1,O+p);if(++n%50==0)console.log('shard',SHARD,n)});
console.log('hd done shard',SHARD,'rendered',n,'skipped',sk,'of',jobs.length);
