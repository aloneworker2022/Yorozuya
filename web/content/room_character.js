/* Room silhouette + grid-based wandering. No AI or game save access.
   Her figure comes from RoomDoll (room_doll.js): a per-girl procedural silhouette built from
   girl.look (height, build, cup, hair, skirt). Frames are generated lazily in a Web Worker
   (main-thread fallback, one frame per idle slice) and cached per look; until they are ready
   the legacy block silhouette below is shown. */
(() => {
  'use strict';
  // Legacy block silhouette: only a placeholder while her doll frames are being generated.
  const LEGACY_ALPHA=204;
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
    for(let i=3;i<data.data.length;i+=4)if(data.data[i])data.data[i]=LEGACY_ALPHA;
    return {width:64,height:124,anchor:{x:32,y:118},pixels:data.data};
  }
  const frames=[false,true].map(mirrored=>[0,1,2,3].map(step=>sprite(step,mirrored)));
  const directions=['left','right','back-right','back-left'];
  const fronts={left:[0,1],right:[1,0],'back-right':[0,-1],'back-left':[-1,0]};
  function seatedSprite(facing,seatHeight) {
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
      const originalZ=z;
      const heightAt=value=>value<=35?value*seatHeight/35:value+seatHeight-35;
      z=heightAt(originalZ);h=heightAt(originalZ+h)-z;
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
    for(let i=3;i<pixels.length;i+=4)if(pixels[i])pixels[i]=LEGACY_ALPHA;
    return {width,height,anchor,pixels,depth};
  }
  const seated=new Map();
  function seatedFrame(facing,height){
    const key=`${facing}:${height}`;
    if(!seated.has(key))seated.set(key,seatedSprite(facing,height));
    return seated.get(key);
  }

  // ------------------------------------------------------------------ doll frames
  const Doll=window.RoomDoll||null;
  const CACHE_LOOKS=2;                 // keep the current girl + the previous one
  const sets=new Map();                // dollKey -> {key,doll,idle,walk:{f,fm,b,bm},sit:Map}
  const queue=[];                      // pending jobs, front = next
  let busy=null,worker=null,jobId=0,workerFailed=false;
  const perf={frames:0,ms:0,last:0};
  function makeWorker(){
    if(!Doll||typeof Worker==='undefined'||typeof Blob==='undefined')return null;
    try{
      const src=`const RoomDoll=(${Doll.factorySource})();
self.onmessage=e=>{const j=e.data,t0=performance.now();
  try{const f=RoomDoll.render(j.doll,j.pose,j.frame,j.yaw,j.opts||{});
    self.postMessage({id:j.id,ms:performance.now()-t0,f},[f.pixels.buffer,f.depth.buffer]);}
  catch(err){self.postMessage({id:j.id,error:String(err&&err.message||err)});}};`;
      const url=URL.createObjectURL(new Blob([src],{type:'text/javascript'}));
      const w=new Worker(url);
      w.onmessage=e=>finish(e.data);
      w.onerror=()=>{workerFailed=true;worker=null;if(busy){queue.unshift(busy.job);busy=null;}pump();};
      return w;
    }catch{return null;}
  }
  function storeFrame(job,f){
    const set=sets.get(job.key);if(!set)return;
    if(job.pose==='idle')set.idle=f;
    else if(job.pose==='walk'){const dir=job.yaw>90?'b':'f';set.walk[dir][job.frame]=f;set.walk[dir+'m'][job.frame]=Doll.mirror(f);}
    else if(job.pose==='sit')set.sit.set(job.sitKey,f);
  }
  function finish(msg){
    const cur=busy;busy=null;
    if(cur&&msg&&msg.id===cur.id){
      if(msg.f){perf.frames++;perf.ms+=msg.ms;perf.last=msg.ms;storeFrame(cur.job,msg.f);}
    }
    pump();
  }
  const later=typeof requestIdleCallback==='function'?fn=>requestIdleCallback(fn,{timeout:120}):fn=>setTimeout(fn,16);
  function pump(){
    if(busy||!queue.length||!Doll)return;
    const job=queue.shift();
    if(!sets.has(job.key)){pump();return;}
    if(!worker&&!workerFailed)worker=makeWorker();
    const id=++jobId;busy={id,job};
    if(worker){
      worker.postMessage({id,doll:job.doll,pose:job.pose,frame:job.frame,yaw:job.yaw,opts:job.opts});
    }else{
      // No worker: one frame per idle slice on the main thread.
      later(()=>{
        const t0=performance.now();let f=null;
        try{f=Doll.render(job.doll,job.pose,job.frame,job.yaw,job.opts||{});}catch{}
        finish({id,ms:performance.now()-t0,f});
      });
    }
  }
  function enqueue(job,urgent=false){
    const same=j=>j.key===job.key&&j.pose===job.pose&&j.frame===job.frame&&j.yaw===job.yaw&&j.sitKey===job.sitKey;
    if(busy&&same(busy.job))return;
    const at=queue.findIndex(same);
    if(at>=0){if(!urgent)return;queue.splice(at,1);}
    if(urgent)queue.unshift(job);else queue.push(job);
    pump();
  }
  function useLook(spec){
    if(!Doll)return null;
    const doll=Doll.lookToDoll(spec?.look||null,{outfit:spec?.outfit,undressStage:spec?.undressStage});
    const key=Doll.dollKey(doll);
    if(sets.has(key)){const set=sets.get(key);sets.delete(key);sets.set(key,set);return set;}
    const set={key,doll,idle:null,walk:{f:[],fm:[],b:[],bm:[]},sit:new Map()};
    sets.set(key,set);
    while(sets.size>CACHE_LOOKS)sets.delete(sets.keys().next().value);
    for(let i=queue.length-1;i>=0;i--)if(!sets.has(queue[i].key))queue.splice(i,1);
    enqueue({key,doll,pose:'idle',frame:0,yaw:0});
    for(const yaw of [45,135])for(let i=0;i<Doll.WALK_FRAMES;i++)enqueue({key,doll,pose:'walk',frame:i,yaw});
    return set;
  }
  function sitFrame(set,facing,height,urgent){
    if(!set)return null;
    const sitKey=`${facing}:${height}`,f=set.sit.get(sitKey);
    if(!f)enqueue({key:set.key,doll:set.doll,pose:'sit',frame:0,yaw:Doll.SEAT_YAW[facing]??-45,opts:{seat:height},sitKey},urgent);
    return f||null;
  }
  function create({cols,rows,blocked,getSeats=()=>[],random=Math.random}) {
    const state={u:2.5,v:3.5,moving:false,mirrored:false,back:false,step:0,mode:'idle',furnitureId:null,facing:'left',seatHeight:35};
    let look=null;   // this girl's doll frame set (null until setLook)
    let route=[],next=null,wait=1.8,elapsed=0,seat=null,sitTime=0,sitCooldown=0,present=false;
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
      if(!present)return {ok:false,message:'房間裡還沒有人。'};
      if(seat)return {ok:false,message:state.mode==='sitting'?'她已經坐下了。':'她正在使用座位，請稍候。'};
      const reachableCells=reachable();
      // Furniture defines seat anchors and rotated footprints. Navigation ends
      // on its reachable perimeter, never on an occupied furniture tile.
      const choices=getSeats().filter(item=>id===undefined||item.id===id).flatMap(item=>{
        const perimeter=[];
        for(let u=item.u;u<item.u+item.cols;u++)perimeter.push({u,v:item.v-1},{u,v:item.v+item.rows});
        for(let v=item.v;v<item.v+item.rows;v++)perimeter.push({u:item.u-1,v},{u:item.u+item.cols,v});
        return item.seats.flatMap(anchor=>perimeter.map(exit=>{
          const cell=reachableCells.find(c=>c.u===exit.u&&c.v===exit.v);
          const distance=Math.hypot(exit.u+.5-anchor.u,exit.v+.5-anchor.v);
          const [du,dv]=fronts[anchor.facing];
          const front=(exit.u+.5-anchor.u)*du+(exit.v+.5-anchor.v)*dv;
          return valid(exit.u,exit.v)&&cell?{item,anchor,exit,path:cell.path,distance,priority:front>0?0:1}:null;
        }).filter(Boolean));
      }).sort((a,b)=>a.path.length-b.path.length||a.distance-b.distance||a.priority-b.priority);
      if(!choices.length)return {ok:false,message:'沒有能靠近的座位，請在可坐的家具旁留出走道。'};
      const choice=choices[0];seat={id:choice.item.id,name:choice.item.name,anchor:choice.anchor,exit:choice.exit};
      route=alignRoute(choice.path);next=null;
      state.furnitureId=seat.id;state.facing=seat.anchor.facing;state.seatHeight=seat.anchor.height;state.mode='approaching';state.moving=false;
      sitFrame(look,state.facing,state.seatHeight,true);   // generate the seated pose while she walks over
      return {ok:true,message:`她正走到${seat.name}旁，靠近後就會坐下。`};
    }
    function standUp() {
      if(!seat||state.mode!=='sitting')return false;
      // Restore the standing pose at the reserved adjacent tile. If there is
      // room, take one step away; there is no walk through the chair's footprint.
      const exit=seat.exit;
      const away=[[0,1],[1,0],[0,-1],[-1,0]].map(([du,dv])=>({u:exit.u+du,v:exit.v+dv})).find(p=>valid(p.u,p.v));
      route=away?[away]:[];next=null;state.mode='leaving';state.moving=false;return true;
    }
    return {
      state,requestSit,standUp,
      get present(){return present;},
      setPresent(value){
        present=!!value;
        if(!present){seat=null;state.furnitureId=null;route=[];next=null;state.moving=false;state.mode='idle';return;}
        if(!valid(Math.floor(state.u),Math.floor(state.v))){
          for(let v=0;v<rows;v++)for(let u=0;u<cols;u++)if(valid(u,v)){state.u=u+.5;state.v=v+.5;v=rows;break;}
        }
        wait=1.2;
      },
      // Sitting uses a visual seat anchor, while navigation stays beside it.
      position(){return state.mode==='sitting'&&seat?{u:seat.anchor.u,v:seat.anchor.v}:{u:state.u,v:state.v};},
      isFurnitureLocked(id){return present&&!!seat&&seat.id===id;},
      occupies(u,v){return present&&((Math.floor(state.u)===u&&Math.floor(state.v)===v)||!!(next&&next.u===u&&next.v===v)||!!(seat&&seat.exit.u===u&&seat.exit.v===v));},
      /** spec: {look, outfit, undressStage}; null/without look = defaults (勻稱有致・D・長直・161). */
      setLook(spec){look=useLook(spec);return look?look.key:null;},
      lookKey(){return look?look.key:null;},
      dollStats(){return {...perf,queued:queue.length,busy:!!busy,worker:!!worker,ready:!!(look&&look.idle),
        walkReady:look?look.walk.f.filter(Boolean).length+look.walk.b.filter(Boolean).length:0};},
      frame(){
        if(state.mode==='sitting')return sitFrame(look,state.facing,state.seatHeight,true)||seatedFrame(state.facing,state.seatHeight);
        if(state.moving&&look){
          // 3/4 front (yaw 45) and 3/4 back (yaw 135); the other two directions are mirrors.
          const walk=look.walk,mir=!state.mirrored,list=state.back?(mir?walk.bm:walk.b):(mir?walk.fm:walk.f);
          const f=list[state.step%Doll.WALK_FRAMES];
          if(f)return f;
        }
        if(look&&look.idle)return look.idle;
        return frames[state.mirrored?1:0][state.moving?state.step%4:0];
      },
      update(dt,paused=false){
        if(!present||paused){state.moving=false;return;}
        sitCooldown=Math.max(0,sitCooldown-dt);
        if(state.mode==='sitting'){sitTime-=dt;state.moving=false;if(sitTime<=0)standUp();return;}
        if(!next){
          if(!route.length){
            if(state.mode==='approaching'){state.mode='sitting';sitTime=6;state.moving=false;return;}
            if(state.mode==='leaving'){seat=null;state.furnitureId=null;state.mode='idle';sitCooldown=15;wait=2;}
            wait-=dt;if(wait>0){state.moving=false;state.mode='idle';return;}
            if(!sitCooldown&&requestSit().ok)return;
            const choices=reachable().filter(c=>c.path.length);
            route=choices.length?alignRoute(choices[Math.floor(random()*choices.length)].path):[];
            wait=2+random()*3;state.mode=route.length?'walking':'idle';
          }
          if(!route.length){state.moving=false;return;}
          next=route.shift();
          if(!valid(next.u,next.v)){
            const retryId=state.mode==='approaching'?seat?.id:undefined;
            next=null;route=[];seat=null;state.furnitureId=null;state.mode='idle';state.moving=false;
            if(retryId!==undefined)requestSit(retryId);
            return;
          }
        }
        const du=next.u+.5-state.u,dv=next.v+.5-state.v,distance=Math.hypot(du,dv),travel=Math.min(distance,dt*.8);
        state.moving=true;state.mirrored=du-dv>0;state.back=du+dv<0;
        if(distance>0){state.u+=du/distance*travel;state.v+=dv/distance*travel;}
        elapsed+=dt;state.step=Math.floor(elapsed*14)%8;   // 8-frame walk at 14 fps (one cycle = 0.571 s)
        if(distance<=travel){state.u=next.u+.5;state.v=next.v+.5;next=null;}
      }
    };
  }
  window.RoomCharacter={create,useLook,doll:Doll};
})();
