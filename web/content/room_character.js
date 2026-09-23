/* Temporary pixel silhouette and grid-based wandering. No AI or game save access. */
(() => {
  'use strict';
  function sprite(step, mirrored) {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=124;
    const ctx=canvas.getContext('2d');
    if(mirrored){ctx.translate(64,0);ctx.scale(-1,1);}
    ctx.fillStyle='#332d40';
    const rect=(x,y,w,h)=>ctx.fillRect(x,y,w,h);
    // Adult proportions: 110 px standing height versus a 69 px chair back
    // and a 42 px desk. Lengthen torso/legs rather than enlarging the head.
    for(const r of [[25,8,14,4],[23,12,18,18],[21,17,4,26],[39,17,4,26],
      [28,29,8,7],[22,35,20,12],[24,47,16,17],
      [22,62,20,9],[20,71,24,8],[18,79,28,5],
      [18,37,5,17],[17,54,5,18],[16,71,6,7],
      [41,37,5,17],[42,54,5,18],[42,71,6,7]])rect(...r);
    const stride=[0,2,0,-2][step];
    rect(23,83,6,31+stride);rect(21,113+stride,9,5);
    rect(35,83,6,31-stride);rect(34,113-stride,9,5);
    // Apply opacity once, so overlaps do not produce darker patches.
    const data=ctx.getImageData(0,0,64,124);
    for(let i=3;i<data.data.length;i+=4)if(data.data[i])data.data[i]=158;
    return {width:64,height:124,anchor:{x:32,y:118},pixels:data.data};
  }
  const frames=[false,true].map(mirrored=>[0,1,2,3].map(step=>sprite(step,mirrored)));
  const directions=['left','right','back-right','back-left'];
  const fronts={left:[0,1],right:[1,0],'back-right':[0,-1],'back-left':[-1,0]};
  function seatedSprite(facing) {
    const width=96,height=128,anchor={x:48,y:112};
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),depth=new Float64Array(width*height).fill(-Infinity);
    const rotate=(u,v)=>facing==='right'?[v,1-u]:facing==='back-right'?[1-u,1-v]:facing==='back-left'?[1-v,u]:[u,v];
    const project=(u,v,z)=>[anchor.x+(u-v)*32,anchor.y+(u+v-1)*16-z,u+v-1+z/32];
    function face(points) {
      points=points.map(p=>project(...p));ctx.fillStyle='#332d40';
      for(let y=Math.max(0,Math.ceil(Math.min(...points.map(p=>p[1]))));y<Math.min(height,Math.max(...points.map(p=>p[1])));y++) {
        const hits=[];
        for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y)){const t=(y-a[1])/(b[1]-a[1]);hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);}}
        hits.sort((a,b)=>a[0]-b[0]);
        for(let i=0;i+1<hits.length;i+=2){const a=hits[i],b=hits[i+1];for(let x=Math.max(0,Math.ceil(a[0]));x<Math.min(width,Math.ceil(b[0]));x++){const d=a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]),index=y*width+x;if(d>=depth[index]){depth[index]=d;ctx.fillRect(x,y,1,1);}}}
      }
    }
    function box(u,v,w,d,z,h){
      const a=rotate(u,v),b=rotate(u+w,v+d);u=Math.min(a[0],b[0]);v=Math.min(a[1],b[1]);w=Math.abs(b[0]-a[0]);d=Math.abs(b[1]-a[1]);
      face([[u,v+d,z],[u+w,v+d,z],[u+w,v+d,z+h],[u,v+d,z+h]]);
      face([[u+w,v,z],[u+w,v+d,z],[u+w,v+d,z+h],[u+w,v,z+h]]);
      face([[u,v,z+h],[u+w,v,z+h],[u+w,v+d,z+h],[u,v+d,z+h]]);
    }
    // Knees bend over the seat edge; feet rest on the floor. The torso sits
    // in front of the backrest, using the same world depth as the chair.
    for(const u of [.28,.59]){box(u,.73,.13,.16,3,30);box(u,.73,.15,.24,0,5);box(u,.43,.15,.43,34,7);}
    box(.24,.35,.52,.4,36,10);box(.31,.35,.38,.22,46,19);
    box(.25,.35,.5,.22,61,7);box(.44,.38,.13,.14,68,5);
    box(.33,.33,.34,.29,73,18);box(.3,.3,.4,.2,68,23);
    for(const u of [.19,.72]){box(u,.4,.09,.13,45,18);box(u,.43,.1,.29,41,6);}
    const pixels=ctx.getImageData(0,0,width,height).data;
    for(let i=3;i<pixels.length;i+=4)if(pixels[i])pixels[i]=158;
    return {width,height,anchor,pixels,depth};
  }
  const seated=Object.fromEntries(directions.map(direction=>[direction,seatedSprite(direction)]));
  function create({cols,rows,blocked,getChairs=()=>[],random=Math.random}) {
    const state={u:2.5,v:3.5,moving:false,mirrored:false,step:0,mode:'idle',chairId:null,facing:'left'};
    let route=[],next=null,wait=1.8,elapsed=0,seat=null,sitTime=0,sitCooldown=0;
    const valid=(u,v)=>u>=0&&v>=0&&u<cols&&v<rows&&!blocked(u,v);
    if(!valid(Math.floor(state.u),Math.floor(state.v))){
      for(let v=0;v<rows;v++)for(let u=0;u<cols;u++)if(valid(u,v)){state.u=u+.5;state.v=v+.5;v=rows;break;}
    }
    function reachable() {
      const start={u:Math.floor(state.u),v:Math.floor(state.v),path:[]};
      const queue=[start],seen=new Set([`${start.u},${start.v}`]);
      for(let i=0;i<queue.length;i++)for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]){
        const current=queue[i],u=current.u+du,v=current.v+dv,key=`${u},${v}`;
        if(!valid(u,v)||seen.has(key))continue;
        seen.add(key);queue.push({u,v,path:[...current.path,{u,v}]});
      }
      return queue;
    }
    function alignRoute(path) {
      const u=Math.floor(state.u),v=Math.floor(state.v);
      return Math.abs(state.u-u-.5)+Math.abs(state.v-v-.5)>.001?[{u,v},...path]:path;
    }
    function requestSit(id) {
      if(seat)return {ok:false,message:state.mode==='sitting'?'她已經坐下了。':'她正在使用椅子，請稍候。'};
      const reachableCells=reachable();
      const choices=getChairs().filter(chair=>id===undefined||chair.id===id).map(chair=>{
        const [du,dv]=fronts[chair.facing],exit={u:chair.u+du,v:chair.v+dv};
        const cell=reachableCells.find(c=>c.u===exit.u&&c.v===exit.v);
        return valid(exit.u,exit.v)&&cell?{chair,exit,path:cell.path}:null;
      }).filter(Boolean).sort((a,b)=>a.path.length-b.path.length);
      if(!choices.length)return {ok:false,message:'沒有能走到正面的空椅子，請轉向或留出走道。'};
      const choice=choices[0];seat={...choice.chair,exit:choice.exit};
      route=alignRoute([...choice.path,{u:seat.u,v:seat.v}]);next=null;
      state.chairId=seat.id;state.facing=seat.facing;state.mode='approaching';state.moving=false;
      return {ok:true,message:'她正走向椅子。'};
    }
    function standUp() {
      if(!seat||state.mode!=='sitting')return false;
      route=[{...seat.exit}];next=null;state.mode='leaving';state.moving=false;return true;
    }
    return {
      state,requestSit,standUp,
      isChairLocked(id){return !!seat&&seat.id===id;},
      occupies(u,v){return (Math.floor(state.u)===u&&Math.floor(state.v)===v)||!!(next&&next.u===u&&next.v===v)||!!(seat&&seat.exit.u===u&&seat.exit.v===v);},
      frame(){return state.mode==='sitting'?seated[state.facing]:frames[state.mirrored?1:0][state.moving?state.step:0];},
      update(dt,paused=false){
        if(paused){state.moving=false;return;}
        sitCooldown=Math.max(0,sitCooldown-dt);
        if(state.mode==='sitting'){sitTime-=dt;state.moving=false;if(sitTime<=0)standUp();return;}
        if(!next){
          if(!route.length){
            if(state.mode==='approaching'){state.mode='sitting';sitTime=6;state.moving=false;return;}
            if(state.mode==='leaving'){seat=null;state.chairId=null;state.mode='idle';sitCooldown=15;wait=2;}
            wait-=dt;if(wait>0){state.moving=false;state.mode='idle';return;}
            if(!sitCooldown&&requestSit().ok)return;
            const choices=reachable().filter(c=>c.path.length);
            route=choices.length?alignRoute(choices[Math.floor(random()*choices.length)].path):[];
            wait=2+random()*3;state.mode=route.length?'walking':'idle';
          }
          if(!route.length){state.moving=false;return;}
          next=route.shift();
          const enteringSeat=seat&&state.mode==='approaching'&&next.u===seat.u&&next.v===seat.v;
          if(!valid(next.u,next.v)&&!enteringSeat){next=null;route=[];seat=null;state.chairId=null;state.mode='idle';state.moving=false;return;}
        }
        const du=next.u+.5-state.u,dv=next.v+.5-state.v,distance=Math.hypot(du,dv),travel=Math.min(distance,dt*.8);
        state.moving=true;state.mirrored=du-dv>0;
        if(distance>0){state.u+=du/distance*travel;state.v+=dv/distance*travel;}
        elapsed+=dt;state.step=Math.floor(elapsed*7)%4;
        if(distance<=travel){state.u=next.u+.5;state.v=next.v+.5;next=null;}
      }
    };
  }
  window.RoomCharacter={create};
})();
