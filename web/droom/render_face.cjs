// 2026-10-31：臉部圖層。每一項只留自己的標記色像素，前端再上色疊上去。
//  眼罩 blindfold：BLIND_RGB／BLIND_LO_RGB（前端疊在頭髮上面＝布綁在頭髮外面）
//  鼻子 nose（2026-11-01）：NOSE_RGB／NOSE_LO_RGB（前端只在頭髮以外的地方畫：陰影＋側面突出的輪廓）
// 走路：sheets[2x]/face/<body>_<item>_<style>_<dir>.png（8 格橫排）
// 坐姿：sheets[2x]/<sit_m|sit_v>/face/<body>_<item>_<style>.png（8 方向橫排）
// 平行：SHARD=i NSHARD=n；ITEMS=nose,blindfold；BODIES=balanced,…；POSES=walk,sit_m,sit_v；FORCE=1 重畫已存在的檔
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const BODY={balanced:{height_cm:161,build:'勻稱有致',hair:'中分長髮'},slim:{height_cm:166,build:'纖細苗條',hair:'短髮'},petite:{height_cm:150,build:'嬌小玲瓏',hair:'雙馬尾'},curvy:{height_cm:163,build:'微肉圓潤',hair:'大波浪長髮'}};
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45},SIT=[0,45,90,135,180,-135,-90,-45];
const ITEM={blindfold:[D.BLINDS,[D.BLIND_RGB,D.BLIND_LO_RGB]],nose:[D.NOSES,[D.NOSE_RGB,D.NOSE_LO_RGB]]};
const env=(k,all)=>process.env[k]?process.env[k].split(','):all;
const SHARD=+(process.env.SHARD||0),NSH=+(process.env.NSHARD||1),FORCE=!!process.env.FORCE;
const mk=(b,it,st)=>{const x=D.lookToDoll({...BODY[b],cup:'D 罩杯'});x.shape='round';x.areola='medium';x.hair='none';x[it]=st;return x};
const jobs=[];
for(const K of [1,2]){const O=__dirname+(K==2?'/sheets2x':'/sheets');
 for(const it of env('ITEMS',Object.keys(ITEM)))for(const st of ITEM[it][0])for(const b of env('BODIES',Object.keys(BODY)))for(const po of env('POSES',['walk','sit_m','sit_v'])){
  if(po=='walk')for(const d in DIR)jobs.push([`${O}/face/${b}_${it}_${st}_${d}.png`,64*K,140*K,i=>D.render(mk(b,it,st),'walk',i,DIR[d],{scale:K}),ITEM[it][1]]);
  else jobs.push([`${O}/${po}/face/${b}_${it}_${st}.png`,150*K,84*K,i=>D.render(mk(b,it,st),po,0,SIT[i],{scale:K}),ITEM[it][1]]);
 }}
let n=0,sk=0;jobs.forEach(([p,FW,FH,f,cols],ji)=>{if(ji%NSH!==SHARD)return;if(!FORCE&&fs.existsSync(p)&&fs.statSync(p).size>100){sk++;return}
 fs.mkdirSync(require('path').dirname(p),{recursive:true});
 const keep=(q,i)=>q[i+3]===D.CLOTH_A&&cols.some(c=>q[i]===c[0]&&q[i+1]===c[1]&&q[i+2]===c[2]);
 const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
 for(let i=0;i<8;i++){const r=f(i);for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(keep(r.pixels,si))S.pixels.set(r.pixels.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
 png(S,1,p);n++});
console.log('face done shard',SHARD,'rendered',n,'skipped',sk,'of',jobs.length);
