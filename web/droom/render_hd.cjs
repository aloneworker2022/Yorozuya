// 2026-10-30 pt36u：2× 解析度預覽 —— 只畫一組（balanced 勻稱／round／D／medium 乳暈），8 方向，含全部髮型、餐巾布、下身圖層。
// 輸出 sheets2x/ 底下同樣的路徑結構，每格 128×280（原本 64×140）。play.html?hd=1 使用。
const D=require(__dirname+'/room_doll_full.js'),png=require(__dirname+'/png.cjs'),fs=require('fs');
const K=2,FW=64*K,FH=140*K,O=__dirname+'/sheets2x';
const B='balanced',LOOK={height_cm:161,build:'勻稱有致',hair:'中分長髮'},S0='round',C0='D',A0='medium';
const DIR={front:0,front_right:45,right:90,back_right:135,back:180,back_left:-135,left:-90,front_left:-45};
const ONLY=process.env.ONLY;
for(const d of ['','/hair','/cloth','/groin'])fs.mkdirSync(O+d,{recursive:true});
const base=()=>{const x=D.lookToDoll({...LOOK,cup:C0+' 罩杯'});x.shape=S0;x.areola=A0;x.hair='none';return x};
function sheet(doll,file,keep,nk){const S={width:FW*8,height:FH,pixels:new Uint8ClampedArray(FW*8*FH*4)};
 for(let i=0;i<8;i++){const f=D.render(doll,'walk',i,DIR[file.d],{scale:K}),g=nk&&D.render(nk,'walk',i,DIR[file.d],{scale:K});
  for(let y=0;y<FH;y++)for(let x=0;x<FW;x++){const si=(y*FW+x)*4;if(!f.pixels[si+3]||(keep&&f.pixels[si+3]!==keep)||(g&&!g.pixels[si+3]))continue;S.pixels.set(f.pixels.subarray(si,si+4),(y*FW*8+i*FW+x)*4)}}
 png(S,1,O+file.p);console.log(file.p)}
for(const d in DIR){
 if(!ONLY||ONLY=='body'){for(const a of ['small','medium','large','huge']){const x=base();x.areola=a;sheet(x,{d,p:`/${B}_${S0}_${C0}_${a}_${d}.png`})}}
 if(!ONLY||ONLY=='hair')for(const[L,list]of[['back',D.BACK_HAIRS],['front',D.FRONT_HAIRS]])for(const st of list){const x=D.lookToDoll({...LOOK,cup:C0+' 罩杯'});x.shape=S0;x.areola=A0;x.backHair=L=='back'?st:null;x.frontHair=L=='front'?st:null;sheet(x,{d,p:`/hair/${B}_${L}_${st}_${d}.png`},D.HAIR_A)}
 if(!ONLY||ONLY=='cloth')for(const cl of D.CLOTHES){const x=base();x.cloth=cl;sheet(x,{d,p:`/cloth/${B}_${S0}_${C0}_${cl}_${d}.png`},D.CLOTH_A)}
 if(!ONLY||ONLY=='groin')for(const[k,st]of[...D.PUBICS.map(s=>['pubic',s]),...D.LABIAS.map(s=>['labia',s]),...D.PANTS.map(s=>['pants',s])]){const x=base();x[k]=st;const nk={...x};delete nk[k];sheet(x,{d,p:`/groin/${B}_${k}_${st}_${d}.png`},D.CLOTH_A,nk)}
}
