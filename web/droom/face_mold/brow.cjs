// 眉毛（共用）：3D 曲線貼在頭蓋球面上，給各角度用自己的投影畫出來
// proj([x,y,z]) → [X,Y,深度朝向]；depth>0 才畫（朝向畫面那一面）
const BROW=[118,80,62],BROWL=[160,114,90];
// 參數（環境變數 BROWCFG，JSON）：dy 高低（負＝往上）、arch 彎度、w0/w1 眉頭／眉尾粗細
module.exports=function drawBrow(put,inside,proj,{CY,R,EAR},sides=[1,-1]){
 const C={dy:-13,arch:5,w0:2.4,w1:1.0,...JSON.parse(process.env.BROWCFG||'{}')};
 for(const s of sides){
  const pts=[];for(let u=0;u<=1.0001;u+=.004){
   const x=14+36*u,y=EAR+C.dy-C.arch*Math.sin(Math.PI*u*.9)+1.5*u;   // 眉頭在內、眉峰在 55%、眉尾微微往下
   const z=Math.sqrt(Math.max(0,R*R-x*x-(y-CY)**2))+.8;
   const [X,Y,d]=proj([s*x,y,z]);if(d<=0)continue;pts.push([X,Y,C.w0+(C.w1-C.w0)*u,u])}
  const done=new Set();
  for(const[X,Y,w,u]of pts){const r=w/2;for(let yy=Math.floor(Y-r);yy<=Math.ceil(Y+r);yy++)for(let xx=Math.floor(X-r);xx<=Math.ceil(X+r);xx++){
   if(Math.hypot(xx+.5-X,yy+.5-Y)>r+.05)continue;const k=xx+','+yy;if(done.has(k))continue;if(!inside(xx,yy))continue;done.add(k);put(xx,yy,u>.72?BROWL:BROW)}}
 }
};
