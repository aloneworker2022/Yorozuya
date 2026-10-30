/* Orthographic pixel exterior. u: rear to front; v: far to near; z: height.
   Geometry, glass, doors and wheels share one projection. No external assets. */
(() => {
'use strict';
const canvas=document.getElementById('stage'),ctx=canvas.getContext('2d',{alpha:false});
let ox,oy;
const p=(u,v,z)=>[ox+.86*u-.86*v,oy+.43*u+.43*v-z];
function rect(x,y,w,h,c){ctx.fillStyle=c;ctx.fillRect(Math.round(x),Math.round(y),w,h)}
function poly(points,c){
 ctx.fillStyle=c;
 for(let y=Math.ceil(Math.min(...points.map(p=>p[1])));y<Math.ceil(Math.max(...points.map(p=>p[1])));y++){
  const hits=[];
  for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]))}
  hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)ctx.fillRect(Math.ceil(hits[i]),y,Math.ceil(hits[i+1])-Math.ceil(hits[i]),1);
 }
}
const face=(q,c)=>poly(q.map(a=>p(...a)),c);
function line(a,b,c,w=1){a=p(...a);b=p(...b);const n=Math.ceil(Math.max(Math.abs(b[0]-a[0]),Math.abs(b[1]-a[1])));for(let i=0;i<=n;i++){const t=n?i/n:0;rect(a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t,w,w,c)}}
const side=(a,b,lo,hi,c,v=86)=>face([[a,v,lo],[b,v,lo],[b,v,hi],[a,v,hi]],c);
const front=(a,b,lo,hi,c,u=206)=>face([[u,a,lo],[u,b,lo],[u,b,hi],[u,a,hi]],c);
function disc(u,v,z,r,c){const q=[];for(let i=0;i<32;i++){const a=i*Math.PI/16;q.push([u+Math.cos(a)*r,v,z+Math.sin(a)*r])}face(q,c)}
function wheel(u,v){
 disc(u,v-4,17,18,'#283333');disc(u,v,17,18,'#242e31');disc(u,v+1,17,14,'#354044');disc(u,v+2,17,10,'#a1ada6');disc(u,v+3,17,7,'#586b6d');
 for(let k=0;k<5;k++){const a=k*Math.PI*2/5;line([u+Math.cos(a)*3,v+4,17+Math.sin(a)*3],[u+Math.cos(a)*8,v+4,17+Math.sin(a)*8],'#d1d5c3',2)}disc(u,v+5,17,3,'#bcc7bc');
}
function grass(w,h){
 rect(0,0,w,h,'#788b50');let seed=17291;
 const rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296};
 const tones=['#7e9054','#819355','#74874d','#71834b','#849658'];
 for(let i=0;i<w*h/420;i++){const x=rnd()*w,y=rnd()*h,rx=8+rnd()*24,ry=3+rnd()*10;poly([[x-rx,y],[x-rx*.6,y-ry],[x+rx*.5,y-ry],[x+rx,y],[x+rx*.6,y+ry],[x-rx*.4,y+ry]],tones[i%5])}
 for(let i=0;i<w*h/26;i++){const x=rnd()*w,y=rnd()*h,c=['#91a363','#657d47','#a1ac6c','#728849'][i%4];rect(x,y,2,1,c);if(i%3===0){rect(x+1,y-2,1,2,c);rect(x-2,y-1,1,1,c)}if(i%89===0){rect(x,y,2,2,'#d9cc8b');rect(x+1,y-1,1,1,'#f0e4ae')}}
}
function van(){
 face([[-8,2,0],[208,2,0],[235,103,0],[207,115,0],[-5,106,0],[-19,81,0]],'#647647');
 face([[0,8,0],[205,8,0],[219,92,0],[195,101,0],[0,93,0]],'#526442');
 wheel(169,4);
 face([[0,0,24],[203,0,24],[203,0,68],[179,0,119],[8,0,119],[0,0,109]],'#a9b9a8');
 face([[0,0,23],[207,0,23],[207,86,23],[0,86,23]],'#303e3b');
 face([[0,86,27],[205,86,27],[205,86,69],[181,86,118],[8,86,118],[0,86,108]],'#b9c5b4');
 side(1,204,28,67,'#82988b');side(2,203,29,35,'#617b72');side(3,202,65,69,'#dce0cc');side(4,9,37,105,'#cad0bc');
 face([[0,86,108],[8,86,118],[181,86,118],[183,80,121],[183,6,121],[176,0,122],[8,0,122],[0,7,119]],'#e7e6cd');
 face([[8,8,122],[174,8,122],[178,77,121],[10,77,121]],'#f2eed6');
 for(const v of [19,33,47,61]){line([21,v,122],[160,v,122],'#d7dac3');line([21,v+1,123],[160,v+1,123],'#faf4db')}
 line([8,86,118],[181,86,118],'#fff3d6',2);line([4,87,111],[178,87,111],'#8fa398');
 for(const [a,b] of [[13,68],[75,128]]){side(a,b,76,108,'#34484a');side(a+2,b-2,79,106,'#536e70');side(a+3,b-3,94,105,'#718b87');face([[a+3,87,80],[a+14,87,80],[b-7,87,105],[b-19,87,105]],'#829b91');line([a+2,88,77],[b-1,88,77],'#d0d7c3')}
 face([[137,87,76],[196,87,76],[177,87,108],[137,87,108]],'#30474b');
 face([[140,88,80],[190,88,80],[174,88,105],[140,88,105]],'#5c797a');
 face([[145,89,101],[172,89,101],[185,89,83],[174,89,83]],'#91aaa0');line([162,89,80],[162,89,106],'#344b4c',2);
 for(const u of [72,132])line([u,87,37],[u,87,110],'#6e877e');line([198,87,34],[198,87,71],'#587269');line([11,88,71],[124,88,71],'#647d72');line([13,88,72],[124,88,72],'#c3ceba');
 side(118,128,64,67,'#405954',89);side(140,150,66,69,'#435e59',89);side(118,127,67,68,'#e2e4cc',90);side(140,149,69,70,'#dce0c9',90);
 face([[183,0,119],[183,86,119],[206,86,69],[206,0,69]],'#d0d7c1');
 face([[185,6,114],[185,80,114],[202,80,78],[202,6,78]],'#30474c');
 face([[187,9,110],[187,77,110],[201,77,81],[201,9,81]],'#668686');
 face([[187,10,109],[187,72,109],[192,72,99],[192,10,99]],'#91aaa0');
 face([[190,15,104],[190,25,104],[200,47,83],[200,37,83]],'#aec0ab');
 line([201,14,82],[201,37,84],'#2f4548');line([201,47,82],[201,72,84],'#2f4548');
 front(0,86,29,69,'#8ea497');front(2,84,66,73,'#c0cbb7');front(4,82,47,63,'#354b4b',207);front(18,68,48,62,'#425a55',208);
 for(let v=23;v<66;v+=8)for(const z of [51,58])face([[209,v-3,z],[209,v,z+3],[209,v+3,z],[209,v,z-3]],'#81968a');
 front(7,17,51,59,'#e9e6c9',210);front(69,79,51,59,'#e9e6c9',210);front(6,18,61,63,'#fff4cc',211);front(68,80,61,63,'#fff4cc',211);
 front(6,10,49,51,'#d5ac69',211);front(77,80,49,51,'#d5ac69',211);front(39,47,54,59,'#bdcbb7',211);front(41,45,55,57,'#48605a',212);
 front(1,85,26,36,'#546c64',209);front(22,64,31,39,'#304a46',210);front(32,54,32,39,'#d7d8bd',211);front(36,50,34,36,'#718477',212);
 front(8,17,33,39,'#344c48',210);front(69,78,33,39,'#344c48',210);front(11,15,35,38,'#c5cbb3',211);front(71,75,35,38,'#c5cbb3',211);line([210,3,27],[210,83,27],'#a0b1a0');
 for(const u of [37,169]){disc(u,88,19,21,'#627a70');disc(u,89,18,19,'#344740');wheel(u,91)}
 line([193,84,81],[194,98,84],'#394f4b',2);side(183,197,83,94,'#354c49',99);side(184,195,88,93,'#94a99b',100);
 line([187,1,84],[185,-8,87],'#394f4b',2);front(-10,-3,85,94,'#506961',185);side(1,4,48,65,'#aa6552',89);side(1,4,59,64,'#ecc18a',90);
}
function render(){const scale=Math.max(1,Math.min(2,Math.floor(innerWidth/440)));canvas.width=Math.ceil(innerWidth/scale);canvas.height=Math.ceil(innerHeight/scale);ctx.imageSmoothingEnabled=false;grass(canvas.width,canvas.height);ox=Math.round(canvas.width/2-50);oy=Math.round(canvas.height/2-1);van()}
let frame;addEventListener('resize',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(render)});render();
})();
