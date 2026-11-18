// 嘴巴（共用）：正面像素圖（使用者給的嘴唇範例），貼在嘴線的臉表面，各角度用自己的投影畫（細格取樣）
const PAL={b:[246,188,190],T:[250,246,242],M:[122,52,62],L:[140,62,72],C:[172,62,78],u:[238,176,176],U:[216,128,136],P:[238,154,160],l:[226,138,146],H:[252,216,214],D:[214,118,128]};
const LIPS=[ // 中心在第 9 欄，第 3 列＝嘴縫（大一號：19×9）
"......uu...uu......",
"....uuUUu.uUUuu....",
"...uUUUUUUUUUUUu...",
".CLLLLLLLLLLLLLLLC.",
"C..lPPPPPPPPPPPl..C",
"...lPPHHHHHHHPPl...",
"....DPPPHHHPPPD....",
".....DDPPPPPDD.....",
"......DDDDDDD......",
];
// 每一列往後縮多少：下唇在上唇後面（45°／側面才看得出來）
const DZ0=[0,0,0,-.6,-1.6,-2.2,-2.8,-3.2,-3.6];
// 微張（使用者範例「新的唇形」）：上唇、嘴縫、上排牙齒（白）、嘴裡（深）、豐厚的下唇（中間亮光），下唇在後面
// 上唇中間的唇珠：圓圓的一顆（淺色＋亮點，第 0、1 列中間），底下的開口跟著往上拱；開口的上緣在中間拱起來（嘴縫中間高一列），中間露出比較多牙齒
const OPEN=["......uubbbuu......",
"....uuUbbHbbUuu....",
"...uUUUULLLUUUUu...",
".CLLLLLLTTTLLLLLLC.",
"C.LMTTTTTTTTTTTML.C",
"...LMMMMMMMMMMML...",
"...lPPPHHHHHPPPl...",
"....DPPPHHHPPPD....",
".....DDPPPPPDD.....",
"......DDDDDDD......"];
const DZ1=[0,0,0,-1.2,-3.2,-3.6,-1.8,-2.4,-3,-3.6];   // 牙齒、嘴裡往後退比較多（45° 才不會凸出來）
const MT=process.env.MT||'closed',ROWS=MT=='open'?null:null;
module.exports=function drawMouth(put,inside,proj,{MOUTH,zc}){
 const y0=Math.round(MOUTH)+1,z=x=>zc-x*x/12+.8,set=new Map();
 let SP=MT=='open'?OPEN:LIPS,DZ=MT=='open'?DZ1:DZ0;
 // 上唇薄（ULIP=thin）：上唇只剩 2 列——閉嘴版拿掉唇峰那列、留細細一條；微張版留唇珠＋拱起那列
 if(process.env.ULIP==='thin'){SP=MT=='open'?["......uubHbuu......",...OPEN.slice(2)]:[".....uuuu.uuuu.....",...LIPS.slice(2)];DZ=DZ.slice(1)}
 // 上厚唇（ULIP=full）：嘴縫上面多一列上唇
 if(process.env.ULIP==='full'){const k=SP.findIndex(r=>r.includes('C'))-(MT=='open'?1:0);SP=[...SP.slice(0,k),"...uUUUUUUUUUUUu...",...SP.slice(k)];DZ=[0,...DZ]}
 // 大嘴唇（BIG=1）：上唇也加厚、下唇多一列，整張往兩邊拉寬到 23 格
 if(process.env.BIG==='1'){if(process.env.ULIP!=='full'){const k=SP.findIndex(r=>r.includes('C'))-(MT=='open'?1:0);SP=[...SP.slice(0,k),"...uUUUUUUUUUUUu...",...SP.slice(k)];DZ=[0,...DZ]}
  const h=SP.findIndex((r,i)=>i>SP.findIndex(q=>q.includes('C'))&&r.includes('H'));SP=[...SP.slice(0,h+1),SP[h],...SP.slice(h+1)];DZ=[...DZ.slice(0,h+1),DZ[h]-.3,...DZ.slice(h+1).map(v=>v-.3)];
  const W2=23;SP=SP.map(r=>{let o='';for(let c=0;c<W2;c++)o+=r[Math.min(18,Math.floor((c+.5)*19/W2))];return o})}
 const LINE=SP.findIndex(r=>r.includes('C')),SW=SP[0].length,SC=(SW-1)/2;
 for(let r=0;r<SP.length;r++)for(let c=0;c<SW;c++){const ch=SP[r][c];if(ch=='.')continue;
  for(let a=0;a<4;a++)for(let b=0;b<4;b++){const x=c-SC+(a+.5)/4-.5,y=y0+r-LINE+(b+.5)/4-.5;const[X,Y,d]=proj([x,y,z(x)+DZ[r]]);if(d<=0)continue;
   const k=Math.floor(X)+','+Math.floor(Y),o=set.get(k);if(!o||o.d<d)set.set(k,{d,ch})}}
 for(const[k,{ch}]of set){const[X,Y]=k.split(',').map(Number);if(inside(X,Y))put(X,Y,PAL[ch])}
};
