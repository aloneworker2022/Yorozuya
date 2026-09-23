/* Furniture shares a 64 x 32 ground projection. Each direction has its own
   footprint, anchor, pixels and depth map for accurate room occlusion. */
(() => {
  'use strict';
  const directions = ['left','right','back-right','back-left'];
  const labels = {left:'左前 ↙',right:'右前 ↘','back-right':'右後 ↗','back-left':'左後 ↖'};
  const wood=['#d5b080','#a57d54','#826044'], pale=['#f0dec0','#d2bc98','#ae9778'];
  const green=['#b7c397','#8e9f77','#728763'], blue=['#a8bfcb','#819caa','#637f91'];
  const dark=['#987659','#76583f','#5d4635'], rose=['#d8ae9e','#b8897e','#946c67'];
  const definitions = {
    chair: {name:'鼠尾草木椅',cols:1,rows:1,seats:[{u:.5,v:.5,height:35,direction:0}],draw(box) {
    // Rear posts, side rails and front legs.
    for (const u of [.17,.73]) box(u,.18,.1,.1,0,66,'#d5ae7b','#99724f','#78573f');
    for (const u of [.17,.73]) {
      box(u,.25,.08,.51,12,3,'#b58c60','#8a6449','#75543d');
      box(u,.73,.1,.1,0,27,'#d5ae7b','#99724f','#78573f');
    }
    box(.16,.18,.68,.09,41,22,'#b7bf96','#8c9a72','#697b5b');
    // Wooden rear panel distinguishes the back from the upholstered front.
    box(.2,.165,.6,.014,43,18,'#c49d6f','#a17b53','#866044');
    box(.27,.15,.04,.015,45,14,'#d7b386','#b89163','#99744f');
    box(.69,.15,.04,.015,45,14,'#d7b386','#b89163','#99744f');
    box(.14,.16,.72,.13,64,5,'#dfbd8a','#b78c5f','#96714d');
    box(.24,.275,.035,.01,44,16,'#cbd0aa','#b7c29a','#b7c29a');
    box(.72,.275,.025,.01,44,16,'#748660','#748660','#748660');
    box(.12,.15,.76,.74,25,5,'#d5b080','#a57d54','#826044');
    box(.17,.22,.66,.6,30,4,'#b7c397','#8e9f77','#728763');
    box(.23,.27,.52,.46,34,1,'#c1cba3','#a1b186','#8b9e75');
    }},
    desk: {name:'橡木書桌',cols:2,rows:1,draw(b) {
      for(const u of [.12,1.72]) for(const v of [.12,.76]) b(u,v,.12,.12,0,37,...wood);
      b(.08,.08,1.82,.82,37,5,...wood);
      b(1.12,.2,.6,.6,25,12,...pale); b(1.34,.807,.15,.03,30,2,...dark);
      b(.25,.25,.4,.4,42,2,...blue);b(.29,.25,.32,.38,44,1,...pale);
    }},
    bed: {name:'雲朵單人床',cols:1,rows:2,seats:[{u:.72,v:1.25,height:29,direction:1}],draw(b) {
      b(.08,.06,.84,1.84,5,11,...wood); b(.08,.04,.84,.13,0,44,...pale);
      b(.12,.2,.76,1.66,16,9,...pale);b(.15,.7,.7,1.13,25,4,...blue);
      b(.16,.27,.68,.34,25,6,'#fff0d9','#e6d8c0','#c9bca8');
      b(.15,.72,.7,.1,29,1,'#d3e0df','#bbcdcd','#97b1b8');
    }},
    sofa: {name:'奶茶雙人沙發',cols:2,rows:1,seats:[{u:.61,v:.56,height:30,direction:0},{u:1.39,v:.56,height:30,direction:0}],draw(b) {
      for(const u of [.16,1.74])for(const v of [.2,.74])b(u,v,.1,.1,0,8,...dark);
      b(.1,.15,1.8,.74,8,16,...rose);b(.13,.13,1.74,.18,24,27,...rose);
      for(const u of [.25,1.03])b(u,.35,.72,.48,24,6,'#e4beac','#c99b8b','#ac8078');
      for(const u of [.1,1.72])b(u,.15,.18,.74,24,14,...rose);
      b(.32,.26,.42,.12,30,15,...green);
    }},
    bookshelf: {name:'午後書櫃',cols:2,rows:1,draw(b) {
      b(.08,.16,1.84,.12,0,86,...dark);
      for(const u of [.08,1.8])b(u,.16,.12,.65,0,86,...wood);
      for(const z of [4,29,55,83])b(.08,.16,1.84,.65,z,3,...wood);
      const colors=[green,blue,rose,pale];
      for(let row=0;row<3;row++) for(let n=0;n<7;n++) {
        const u=.27+n*.2,z=[7,32,58][row],h=13+(n*7+row*3)%9;
        b(u,.38,.13,.32,z,h,...colors[(n+row)%4]);
        b(u,.705,.13,.01,z+3,1,...pale);
      }
    }},
    cabinet: {name:'奶油收納櫃',cols:1,rows:1,draw(b) {
      b(.1,.14,.8,.72,0,55,...pale);b(.06,.1,.88,.8,55,4,...wood);
      for(const u of [.13,.52]){b(u,.863,.35,.015,7,43,...wood);b(u+.14,.883,.07,.03,28,3,...dark);}
    }},
    nightstand: {name:'床邊小抽屜',cols:1,rows:1,draw(b) {
      b(.16,.16,.68,.68,2,28,...pale);b(.12,.12,.76,.76,30,4,...wood);
      for(const z of [6,19]) {b(.2,.845,.6,.02,z,10,...wood);b(.46,.87,.09,.04,z+4,2,...dark);}
    }},
    plant: {name:'小葉盆栽',cols:1,rows:1,draw(b) {
      b(.3,.3,.4,.4,0,18,'#cc9b7d','#b17d63','#916350');b(.26,.26,.48,.48,17,5,...rose);
      b(.29,.29,.42,.42,22,1,...dark);b(.47,.47,.06,.06,23,30,...dark);
      for(const [u,v,z,w,d] of [[.17,.3,31,.3,.2],[.48,.47,35,.3,.23],[.33,.16,42,.25,.24],[.23,.49,47,.28,.25],[.48,.34,52,.27,.23],[.4,.35,58,.17,.19]]) b(u,v,w,d,z,5,...green);
    }},
    lamp: {name:'暖光落地燈',cols:1,rows:1,draw(b) {
      b(.24,.24,.52,.52,0,4,...dark);b(.47,.47,.06,.06,4,64,...wood);
      b(.2,.2,.6,.6,61,4,'#ffe6b2','#e5c68e','#c8aa7c');
      b(.25,.25,.5,.5,65,15,...pale);b(.32,.32,.36,.36,80,4,'#fff0d2','#e6d1ae','#cbb794');
    }},
    coffee: {name:'矮腳茶几',cols:1,rows:1,draw(b) {
      for(const u of [.18,.72])for(const v of [.18,.72])b(u,v,.1,.1,0,17,...wood);
      b(.1,.1,.8,.8,17,4,...wood);b(.22,.25,.31,.34,21,2,...rose);
      b(.62,.45,.13,.13,21,8,...pale);b(.65,.48,.07,.07,29,1,...dark);
    }}
  };
  function frame(def,facing) {
    const swap=facing==='right'||facing==='back-left';
    const cols=swap?def.rows:def.cols,rows=swap?def.cols:def.rows;
    const anchor={x:rows*32+16,y:100};
    const canvas=document.createElement('canvas');canvas.width=(cols+rows)*32+32;canvas.height=100+(cols+rows)*16+8;
    const ctx=canvas.getContext('2d'),depth=new Float64Array(canvas.width*canvas.height).fill(-Infinity);
    const rotate=(u,v)=>facing==='right'?[v,def.cols-u]:facing==='back-right'?[def.cols-u,def.rows-v]:facing==='back-left'?[def.rows-v,u]:[u,v];
    const project=(u,v,z)=>[anchor.x+(u-v)*32,anchor.y+(u+v)*16-z,u+v+z/32];
    function face(points,color) {
      points=points.map(p=>project(...p));ctx.fillStyle=color;
      for(let y=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[1]))));y<Math.min(canvas.height,Math.max(...points.map(p=>p[1])));y++) {
        const hits=[];
        for(let i=0;i<points.length;i++) {const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);}}
        hits.sort((a,b)=>a[0]-b[0]);
        for(let i=0;i+1<hits.length;i+=2) {const a=hits[i],b=hits[i+1];for(let x=Math.max(0,Math.ceil(a[0]));x<Math.min(canvas.width,Math.ceil(b[0]));x++) {const d=a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]),index=y*canvas.width+x;if(d>=depth[index]){depth[index]=d;ctx.fillRect(x,y,1,1);}}}
      }
    }
    function box(u,v,w,d,z,h,top,front,side) {
      const a=rotate(u,v),b=rotate(u+w,v+d);u=Math.min(a[0],b[0]);v=Math.min(a[1],b[1]);w=Math.abs(b[0]-a[0]);d=Math.abs(b[1]-a[1]);
      face([[u,v+d,z],[u+w,v+d,z],[u+w,v+d,z+h],[u,v+d,z+h]],front);
      face([[u+w,v,z],[u+w,v+d,z],[u+w,v+d,z+h],[u+w,v,z+h]],side);
      face([[u,v,z+h],[u+w,v,z+h],[u+w,v+d,z+h],[u,v+d,z+h]],top);
    }
    def.draw(box);
    const seats=(def.seats||[]).map(seat=>{
      const [u,v]=rotate(seat.u,seat.v);
      return {u,v,height:seat.height,facing:directions[(directions.indexOf(facing)+seat.direction)%4]};
    });
    return {canvas,anchor,cols,rows,seats,depth,pixels:ctx.getImageData(0,0,canvas.width,canvas.height).data};
  }
  window.RoomFurniture=Object.fromEntries(Object.entries(definitions).map(([id,def])=>[id,{id,name:def.name,directions,labels,
    frames:Object.fromEntries(directions.map(facing=>[facing,frame(def,facing)]))}]));
})();
