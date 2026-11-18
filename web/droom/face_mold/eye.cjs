// 眼睛（第一版，只有正面）：以眼睛中心為原點，x 往外眼角為正、y 往下為正；回傳該點的顏色（不畫回傳 null）
// 位置：耳線上，中心離中線 33（正面輔助線的虛線橢圓）
const SKIN=[242,204,177],SH=[216,166,140],DK=[184,124,104];
const PAL={
 K:[58,36,36],      // 上眼線（睫毛）
 k:[110,70,62],     // 睫毛邊、眼尾淡
 W:[250,247,244],   // 眼白
 w:[214,206,214],   // 上眼皮投在眼白上的影子
 I:[84,52,44],      // 虹膜深（上）
 i:[140,88,62],     // 虹膜中
 j:[190,132,88],    // 虹膜亮（下）
 P:[38,22,22],      // 瞳孔
 H:[255,255,255],   // 亮點
 L:DK,              // 下眼線
 c:SH,              // 雙眼皮摺線
};
const IN=-12,OUT=13;   // 內眼角、外眼角
const tt=x=>(x-IN)/(OUT-IN);
const yu=x=>{const t=tt(x);return t<=0||t>=1?0:-7.5*Math.pow(Math.sin(Math.PI*Math.pow(t,.8)),.75)};   // 上眼瞼（拱在偏內側）
const yl=x=>{const t=tt(x);return t<=0||t>=1?0:5.5*Math.pow(Math.sin(Math.PI*Math.pow(t,1.25)),.9)};  // 下眼瞼（低點偏外側）
const IC=[.5,.3],IRX=6.2,IRY=7;
function eyeAt(x,y,s=1){
 const t=tt(x),u=yu(x),l=yl(x);
 // 雙眼皮摺線
 if(t>.18&&t<.88&&Math.abs(y-(u-4.6-1.2*t))<.55)return 'c';
 // 眼尾上挑的一小撇（外眼角往外上）
 if(x>=OUT-1&&x<=OUT+3.5){const yy=-1.2-(x-OUT)*.7;if(y>yy-1.1&&y<yy+.6)return x>OUT+2?'k':'K'}
 if(t<=0||t>=1)return null;
 // 上眼線：越往外越粗
 const th=1.6+1.6*t;
 if(y>=u-th&&y<u+.6)return t<.08?'k':'K';
 // 下眼線（只畫外側 2/3，淡）
 if(y>=l&&y<l+1)return t>.32?'L':null;
 if(y<u+.6||y>=l)return null;
 // 眼睛裡面
 const dx=(x-IC[0])/IRX,dy=(y-IC[1])/IRY,r=Math.hypot(dx,dy);
 if(r<1){
  const hx=s*(x-IC[0])+IC[0];   // 亮點用畫面方向（光一律從左上）
  if(Math.hypot((hx+2.6)/1.4,(y+2.6)/1.6)<1)return 'H';         // 大亮點（左上，光從左上）
  if(Math.hypot((hx-2.8)/.8,(y-3)/.8)<1)return 'H';             // 小亮點（右下）
  if(Math.hypot((x-IC[0])/2.3,(y-IC[1]+.3)/3.4)<1)return 'P';  // 瞳孔
  if(r>.86)return 'I';                                          // 虹膜外圈
  const v=(y-u)/(l-u);return v<.4?'I':v<.72?'i':'j';            // 上深下亮
 }
 return y<u+2.4?'w':'W';
}
module.exports=function drawEye(put,inside,{CX,EAR},sides=[1,-1]){
 for(const s of sides){const ex=CX+s*33,ey=EAR;
  for(let Y=Math.floor(ey-16);Y<=ey+10;Y++)for(let X=Math.floor(ex-20);X<=ex+20;X++){
   if(!inside(X,Y))continue;const ch=eyeAt(s*(X+.5-ex),Y+.5-ey,s);if(ch)put(X,Y,PAL[ch])}}
};
module.exports.eyeAt=eyeAt;module.exports.PAL=PAL;
