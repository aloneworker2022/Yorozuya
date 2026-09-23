/* Temporary pixel silhouette and grid-based wandering. No AI or game save access. */
(() => {
  'use strict';
  function sprite(step, mirrored) {
    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=88;
    const ctx=canvas.getContext('2d');
    if(mirrored){ctx.translate(64,0);ctx.scale(-1,1);}
    ctx.fillStyle='#332d40';
    const rect=(x,y,w,h)=>ctx.fillRect(x,y,w,h);
    // Plain human silhouette: hair, torso, dress, arms and legs.
    for(const r of [[23,16,18,22],[20,22,5,31],[39,23,6,32],[24,14,15,6],
      [28,35,8,6],[23,40,18,16],[20,51,24,13],[17,62,30,5],
      [17,42,5,17],[42,42,5,17],[16,55,5,8],[44,55,5,8]])rect(...r);
    const stride=[0,2,0,-2][step];
    rect(23,66,6,13+stride);rect(22,77+stride,8,4);
    rect(35,66,6,13-stride);rect(34,77-stride,8,4);
    // Apply opacity once, so overlaps do not produce darker patches.
    const data=ctx.getImageData(0,0,64,88);
    for(let i=3;i<data.data.length;i+=4)if(data.data[i])data.data[i]=158;
    return {width:64,height:88,anchor:{x:32,y:82},pixels:data.data};
  }
  const frames=[false,true].map(mirrored=>[0,1,2,3].map(step=>sprite(step,mirrored)));
  function create({cols,rows,blocked,random=Math.random}) {
    const state={u:2.5,v:4.5,moving:false,mirrored:false,step:0};
    let route=[],next=null,wait=1.8,elapsed=0;
    const valid=(u,v)=>u>=0&&v>=0&&u<cols&&v<rows&&!blocked(u,v);
    if(!valid(Math.floor(state.u),Math.floor(state.v))){
      for(let v=0;v<rows;v++)for(let u=0;u<cols;u++)if(valid(u,v)){state.u=u+.5;state.v=v+.5;v=rows;break;}
    }
    function chooseRoute() {
      const start={u:Math.floor(state.u),v:Math.floor(state.v),path:[]};
      const queue=[start],seen=new Set([`${start.u},${start.v}`]),choices=[];
      for(let i=0;i<queue.length;i++) {
        const current=queue[i];
        for(const [du,dv] of [[1,0],[-1,0],[0,1],[0,-1]]) {
          const u=current.u+du,v=current.v+dv,key=`${u},${v}`;
          if(!valid(u,v)||seen.has(key))continue;
          seen.add(key);const node={u,v,path:[...current.path,{u,v}]};queue.push(node);choices.push(node);
        }
      }
      route=choices.length?choices[Math.floor(random()*choices.length)].path:[];
      wait=2+random()*3;
    }
    return {
      state,
      occupies(u,v){return (Math.floor(state.u)===u&&Math.floor(state.v)===v)||!!(next&&next.u===u&&next.v===v);},
      frame(){return frames[state.mirrored?1:0][state.moving?state.step:0];},
      update(dt,paused=false){
        if(paused){state.moving=false;return;}
        if(!next){
          if(!route.length){wait-=dt;if(wait>0){state.moving=false;return;}chooseRoute();}
          if(!route.length){state.moving=false;return;}
          next=route.shift();
          if(!valid(next.u,next.v)){next=null;route=[];state.moving=false;return;}
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
