// 2026-10-31：坐地張腿姿勢 sheet（M 字 sit_m／V 字 sit_v），靜態一格。一張 sheet＝8 個方向橫排（front, front_right, right, back_right, back, back_left, left, front_left）。
// 每格 128×140（1×）／256×280（HD=1，2×）；canvas 'floor'。輸出：
//   sheets[2x]/<pose>/<body>_<shape>_<cup>_<areola>.png、<pose>/hair/<body>_<back|front>_<style>.png、<pose>/groin/<body>_<pubic|labia|pants>_<style>.png
// 坐姿不畫衣服（cloth／sup）。平行：SHARD=i NSHARD=n；POSE=sit_m|sit_v；ONLY=body,hair,groin；FORCE=1 重畫已存在的檔
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const POSE=process.env.POSE||'sit_m',HD=!!process.env.HD,K=HD?2:1,FW=128*K,FH=140*K,O=__dirname+(HD?'/sheets2x/':'/sheets/')+POSE;
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIRS=[0,45,90,135,180,-135,-90,-45];
const AR=['small','medium','large','huge'],SH=['round','bell','pendulous'],CU='ABCDEFGH'.split('');
const SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1),FORCE=!!process.env.FORCE,on=k=>!process.env.ONLY||process.env.ONLY.split(',').includes(k);
for(const d of ['','/hair','/groin'])fs.mkdirSync(O+d,{recursive:true});
const mk=(b,c,s,a)=>{const x=D.lookToDoll({...BODY[b],cup:c+' 罩杯'});x.shape=s;x.areola=a;x.hair='none';return x};
const jobs=[];
for(const b in BODY){
 if(on('body'))for(const s of SH)for(const c of CU)for(const a of AR)jobs.push([`/${b}_${s}_${c}_${a}.png`,()=>mk(b,c,s,a),null]);
 if(on('hair'))for(const[L,list]of[['back',D.BACK_HAIRS],['front',D.FRONT_HAIRS]])for(const st of list)jobs.push([`/hair/${b}_${L}_${st}.png`,()=>{const x=D.lookToDoll({...BODY[b],cup:'D 罩杯'});x.shape='round';x.areola='medium';x.backHair=L=='back'?st:null;x.frontHair=L=='front'?st:null;return x},'hair']);
 if(on('groin'))for(const[k,st]of[...D.PUBICS.map(s=>['pubic',s]),...D.LABIAS.map(s=>['labia',s]),...D.PANTS.map(s=>['pants',s])])jobs.push([`/groin/${b}_${k}_${st}.png`,()=>{const x=mk(b,'D','round','medium');x[k]=st;return x},k]);
}
let n=0,sk=0;jobs.forEach(([p,f,kind],ji)=>{if(ji%NSH!==SHARD)return;if(!FORCE&&fs.existsSync(O+p)&&fs.statSync(O+p).size>100){sk++;return}
 const doll=f();let nk=null;if(kind&&kind!=='hair'){nk={...doll};delete nk[kind]}
 const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
 DIRS.forEach((yaw,i)=>{const r=kind==='hair'?D.renderHairLayer(doll,POSE,0,yaw,{scale:K}):D.render(doll,POSE,0,yaw,{scale:K}),g=nk&&D.render(nk,POSE,0,yaw,{scale:K});
  for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(!r.pixels[si+3])continue;if(nk&&(r.pixels[si+3]!==D.CLOTH_A||!g.pixels[si+3]))continue;S.pixels.set(r.pixels.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}});
 png(S,1,O+p);if(++n%25==0)console.log(POSE,K+'x','shard',SHARD,n)});
console.log('sit done',POSE,K+'x','shard',SHARD,'rendered',n,'skipped',sk,'of',jobs.length);
