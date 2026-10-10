/* Room silhouette + activities (room_activity.js) with walking as the transition. No AI or game save access:
   context comes in through getContext(), activity starts go out through onActivity().
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
  const POSE_CACHE=44;                 // activity/seat pose frames kept per look (LRU, mirrors included)
  const sets=new Map();                // dollKey -> {key,doll,idle,walk:{f,fm,b,bm},sit:Map,pose:Map}
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
    else if(job.pkey){
      const put=(k,v)=>{set.pose.delete(k);set.pose.set(k,v);while(set.pose.size>POSE_CACHE)set.pose.delete(set.pose.keys().next().value);};
      put(job.pkey,f);if(job.mkey)put(job.mkey,Doll.mirror(f));
    }
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
    const same=j=>j.key===job.key&&j.pose===job.pose&&j.frame===job.frame&&j.yaw===job.yaw&&j.sitKey===job.sitKey&&j.pkey===job.pkey;
    if(busy&&same(busy.job))return;
    const at=queue.findIndex(same);
    if(at>=0){if(!urgent)return;queue.splice(at,1);}
    if(urgent)queue.unshift(job);else queue.push(job);
    pump();
  }
  function useLook(spec){
    if(!Doll)return null;
    const doll=Doll.lookToDoll(spec?.look||null,{outfit:spec?.outfit,undressStage:spec?.undressStage,belly:spec?.belly});
    const key=Doll.dollKey(doll);
    if(sets.has(key)){const set=sets.get(key);sets.delete(key);sets.set(key,set);return set;}
    const set={key,doll,idle:null,walk:{f:[],fm:[],b:[],bm:[]},sit:new Map(),pose:new Map()};
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
  // Floor facings → the yaw actually rendered (+ mirror). 3/4 front and 3/4 back are rendered; the
  // other two diagonals are mirrors; 'front' looks straight at the viewer.
  const VIEW={right:{yaw:45,mirror:false},left:{yaw:45,mirror:true},'back-right':{yaw:135,mirror:false},
    'back-left':{yaw:135,mirror:true},front:{yaw:0,mirror:false}};
  /** One frame of an activity pose. view: {yaw,mirror}; seat height for chair poses. Missing → queued, null. */
  function poseFrame(set,pose,frame,view,seatH,urgent){
    if(!set||!Doll)return null;
    const base=`${pose}|${view.yaw}|${frame}|${seatH??''}`,k=view.mirror?base+'|m':base,f=set.pose.get(k);
    if(f){set.pose.delete(k);set.pose.set(k,f);return f;}
    enqueue({key:set.key,doll:set.doll,pose,frame,yaw:view.yaw,opts:seatH!=null?{seat:seatH}:{},pkey:base,mkey:base+'|m'},urgent);
    return null;
  }
  function prefetchPose(set,pose,view,seatH){
    const n=(Doll&&Doll.POSES[pose]&&Doll.POSES[pose].frames)||1;
    for(let i=n-1;i>=0;i--)poseFrame(set,pose,i,view,seatH,true);   // urgent, frame 0 ends up first
  }
  function loopIndex(pose,t){
    const P=Doll&&Doll.POSES[pose];if(!P||P.frames<2)return 0;
    const i=Math.floor(t*P.fps);
    if(!P.pingpong)return i%P.frames;
    const n=2*P.frames-2,j=i%n;return j<P.frames?j:n-j;
  }
  function create({cols,rows,blocked,getSeats=()=>[],random=Math.random,getContext=()=>null,onActivity=()=>{}}) {
    const state={u:2.5,v:3.5,moving:false,mirrored:false,back:false,step:0,mode:'idle',furnitureId:null,facing:'left',seatHeight:35};
    let look=null;   // this girl's doll frame set (null until setLook)
    let route=[],next=null,wait=1.8,elapsed=0,seat=null,sitTime=0,sitCooldown=0,present=false;
    // Activity (room_activity.js). act: {spec,dur,phase:'go'|'enter'|'hold'|'exit',t,spot,seat,holdAt}
    const Acts=window.RoomActivity||null;
    let act=null,held=false,replanReq=false,animT=0;
    const localHist=[];   // newest first; used when the context has no history (no summon module)
    const ENTER_S=.8,LIE_ENTER_S=1.3;
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
    function emit(evt){
      if(evt.type==='start'){localHist.unshift(evt.id);localHist.length=Math.min(localHist.length,8);}
      try{onActivity(evt);}catch{}
    }
    function requestSit(id,types,planned) {
      if(!present)return {ok:false,message:'房間裡還沒有人。'};
      if(seat)return {ok:false,message:state.mode==='sitting'?'她已經坐下了。':'她正在使用座位，請稍候。'};
      const reachableCells=reachable();
      // Furniture defines seat anchors and rotated footprints. Navigation ends
      // on its reachable perimeter, never on an occupied furniture tile.
      const choices=getSeats().filter(item=>(id===undefined||item.id===id)&&(!types||types.includes(item.type))).flatMap(item=>{
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
      if(!planned&&Acts){   // the 坐這裡 button = the 正坐 activity
        const spec=Acts.BY_ID.chair_sit;act={spec,dur:Acts.duration(spec,{},random),phase:'go',seat:true,manual:true};
        emit({type:'start',id:spec.id,at:Date.now(),dur:act.dur});
      }
      const pose=act&&act.seat?act.spec.pose:'sit';
      if(!Acts)sitFrame(look,state.facing,state.seatHeight,true);   // generate the seated pose while she walks over
      else prefetchPose(look,pose,{yaw:Doll?Doll.SEAT_YAW[state.facing]??-45:-45,mirror:false},state.seatHeight);
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
    // ------------------------------------------------------------ activities
    const isFree=(u,v)=>valid(u,v);
    /** Where to do it: {cell,pos:{u,v},facing,cells,path} or null. */
    function findSpot(spec){
      const reach=reachable(),here=reach[0];
      const pickOne=list=>list.length?list[Math.floor(random()*list.length)]:null;
      const away=list=>{const far=list.filter(c=>c.path.length);return far.length?far:list;};
      const at=(c,du,dv,facing,cells)=>({cell:c,pos:{u:c.u+.5+du,v:c.v+.5+dv},facing,cells:cells||[{u:c.u,v:c.v}],path:c.path});
      if(spec.spot==='front'){
        const best=Math.max(...reach.map(c=>c.u+c.v)),c=pickOne(reach.filter(c=>c.u+c.v===best));
        return c&&at(c,.12,.12,'front');
      }
      if(spec.spot==='wall'||spec.spot==='corner'){
        let list=reach.filter(c=>c.u===0||c.v===0);
        if(spec.spot==='corner'&&list.length){const m=Math.min(...list.map(c=>c.u+c.v));list=list.filter(c=>c.u+c.v===m);}
        const c=pickOne(spec.spot==='wall'?away(list):list);if(!c)return null;
        const onU=c.u===0&&(c.v!==0||random()<.5);   // back against (or facing) the u=0 wall
        const off=spec.facing==='wall'?-.2:-.16;
        if(spec.facing==='wall')return onU?at(c,off,0,'back-left'):at(c,0,off,'back-right');
        return onU?at(c,off,0,'right'):at(c,0,off,'left');
      }
      if(spec.spot==='open'){
        // Lying down covers ~3 cells in a line: the body runs along her facing (on back / on stomach)
        // or across it (curled on her side).
        const opts=[];
        for(const c of reach)for(const facing of ['right','left']){
          const alongU=(facing==='right')!==(spec.pose==='sleep_curl');
          const [du,dv]=alongU?[1,0]:[0,1];
          if(isFree(c.u-du,c.v-dv)&&isFree(c.u+du,c.v+dv))opts.push(at(c,0,0,facing,[{u:c.u,v:c.v},{u:c.u-du,v:c.v-dv},{u:c.u+du,v:c.v+dv}]));
        }
        const far=opts.filter(o=>o.path.length);return pickOne(far.length?far:opts);
      }
      const c=pickOne(away(reach));
      return c&&at(c,(random()-.5)*.3,(random()-.5)*.3,random()<.5?'left':'right');
    }
    function context(){
      let ctx=null;try{ctx=getContext();}catch{ctx=null;}
      ctx=Object.assign({},ctx||{});
      ctx.seats=[...new Set(getSeats().map(item=>item.type))];
      if(!Array.isArray(ctx.history)||!ctx.history.length)ctx.history=localHist.slice();
      return ctx;
    }
    function planNext(){
      replanReq=false;
      const ctx=context();
      let tries=0,spec=null,spot=null;
      const skip=new Set();
      while(tries++<4){
        const hist=[...(ctx.history||[])];
        const w=Acts.weights({...ctx,history:hist});for(const id of skip)w.set(id,0);
        let total=0;for(const v of w.values())total+=v;
        if(total<=0)break;
        let r=random()*total;spec=null;
        for(const a of Acts.ACTIVITIES){r-=w.get(a.id);if(r<0&&w.get(a.id)>0){spec=a;break;}}
        if(!spec)break;
        if(spec.place==='seat'){
          const dur=Acts.duration(spec,ctx,random);
          act={spec,dur,phase:'go',seat:true};
          if(requestSit(undefined,spec.seat,true).ok){emit({type:'start',id:spec.id,at:Date.now(),dur});return true;}
          act=null;skip.add(spec.id);continue;
        }
        spot=findSpot(spec);
        if(spot)break;
        skip.add(spec.id);spec=null;
      }
      if(!spec||!spot){spec=Acts.BY_ID.twirl;spot=findSpot(spec);if(!spot)return false;}
      const dur=Acts.duration(spec,ctx,random);
      act={spec,dur,phase:'go',spot};
      route=alignRoute(spot.path);
      route.push({u:spot.cell.u,v:spot.cell.v,x:spot.pos.u,y:spot.pos.v});
      next=null;state.mode='walking';
      const view=VIEW[spot.facing];
      prefetchPose(look,spec.pose,view);
      if(spec.lie)poseFrame(look,'hug_knees',0,view,null,true);
      emit({type:'start',id:spec.id,at:Date.now(),dur});
      return true;
    }
    function arrive(){
      state.mode='activity';state.moving=false;
      act.phase='enter';act.t=act.spec.lie?LIE_ENTER_S:ENTER_S;
      state.facing=act.spot.facing;
    }
    function stepActivity(dt){
      if(act.phase==='enter'){act.t-=dt;if(act.t<=0){act.phase='hold';act.holdAt=animT;emit({type:'hold',id:act.spec.id,at:Date.now()});}}
      else if(act.phase==='hold'){
        if(!held)act.dur-=dt;
        if(act.dur<=0||replanReq){replanReq=false;act.phase='exit';act.t=act.spec.lie?LIE_ENTER_S:ENTER_S*.6;}
      }else if(act.phase==='exit'){
        act.t-=dt;
        if(act.t<=0){act=null;state.mode='idle';wait=.8+random()*1.6;}
      }
    }
    function bubble(){
      if(!act||!act.spec.icon)return null;
      const sleepy=act.spec.kind==='sleep';
      if(act.phase!=='hold')return null;
      const t=animT-(act.holdAt||0);
      // Subtle: on start for 6 s, then 5 s every 20 s (zzz floats the whole time she sleeps).
      let a=0;
      if(sleepy||act.spec.sticky)a=1;   // zzz / 求你（hunger_beg）一直浮著
      else if(t<6)a=Math.min(1,t/.3,(6-t)/.4);
      else{const c=(t-6)%20;if(c>15)a=Math.min(1,(c-15)/.3,(20-c)/.4);}
      return a>0?{icon:act.spec.icon,alpha:Math.max(0,Math.min(1,a)),t}:null;
    }
    function activityInfo(){
      if(!act)return null;
      return {id:act.spec.id,name:act.spec.name,phase:act.phase,kind:act.spec.kind,left:Math.max(0,Math.round(act.dur)),
        facing:act.spot?act.spot.facing:state.facing,seat:!!act.seat};
    }
    return {
      state,requestSit,standUp,
      get present(){return present;},
      setPresent(value){
        present=!!value;
        if(!present){seat=null;state.furnitureId=null;route=[];next=null;state.moving=false;state.mode='idle';act=null;return;}
        if(!valid(Math.floor(state.u),Math.floor(state.v))){
          for(let v=0;v<rows;v++)for(let u=0;u<cols;u++)if(valid(u,v)){state.u=u+.5;state.v=v+.5;v=rows;break;}
        }
        wait=1.2;
      },
      // Sitting uses a visual seat anchor, while navigation stays beside it.
      position(){return state.mode==='sitting'&&seat?{u:seat.anchor.u,v:seat.anchor.v}:{u:state.u,v:state.v};},
      isFurnitureLocked(id){return present&&!!seat&&seat.id===id;},
      occupies(u,v){
        if(!present)return false;
        if(state.mode==='activity'&&act&&act.spot&&act.spot.cells.some(c=>c.u===u&&c.v===v))return true;
        return (Math.floor(state.u)===u&&Math.floor(state.v)===v)||!!(next&&next.u===u&&next.v===v)||!!(seat&&seat.exit.u===u&&seat.exit.v===v);
      },
      /** spec: {look, outfit, undressStage}; null/without look = defaults (勻稱有致・D・長直・161). */
      setLook(spec){look=useLook(spec);return look?look.key:null;},
      lookKey(){return look?look.key:null;},
      dollStats(){return {...perf,queued:queue.length,busy:!!busy,worker:!!worker,ready:!!(look&&look.idle),
        walkReady:look?look.walk.f.filter(Boolean).length+look.walk.b.filter(Boolean).length:0,poseFrames:look?look.pose.size:0};},
      /** Current activity (null while idle between activities). */
      activity:activityInfo,
      bubble,
      /** Chat open: hold the current pose (timers stop, no new activity). */
      hold(on){held=!!on;},
      /** After a chat: finish what she is doing now and pick again (with the post-chat bias). */
      replan(){
        if(!act)return;
        if(act.phase==='go'&&!act.seat){act=null;route=[];state.mode='idle';wait=.3;return;}
        if(act.phase==='enter'||act.phase==='hold')replanReq=true;
      },
      /** Tests / debugging: start a given activity now. */
      startActivity(id){
        if(!Acts||!Acts.BY_ID[id]||!present)return false;
        replanReq=false;
        if(state.mode==='sitting'){standUp();}
        const spec=Acts.BY_ID[id];
        if(spec.place==='seat'){
          if(seat)return false;
          act={spec,dur:Acts.duration(spec,{},random),phase:'go',seat:true};
          if(requestSit(undefined,spec.seat,true).ok){emit({type:'start',id,at:Date.now(),dur:act.dur});return true;}
          act=null;return false;
        }
        if(seat)return false;
        const spot=findSpot(spec);if(!spot)return false;
        act={spec,dur:Acts.duration(spec,{},random),phase:'go',spot};
        route=alignRoute(spot.path);route.push({u:spot.cell.u,v:spot.cell.v,x:spot.pos.u,y:spot.pos.v});
        next=null;state.mode='walking';
        prefetchPose(look,spec.pose,VIEW[spot.facing]);if(spec.lie)poseFrame(look,'hug_knees',0,VIEW[spot.facing],null,true);
        emit({type:'start',id,at:Date.now(),dur:act.dur});
        return true;
      },
      frame(){
        if(state.mode==='sitting'){
          const pose=act&&act.seat?act.spec.pose:'sit';
          if(Acts&&look){
            const f=poseFrame(look,pose,loopIndex(pose,animT),{yaw:Doll.SEAT_YAW[state.facing]??-45,mirror:false},state.seatHeight,true);
            if(f)return f;
          }
          return sitFrame(look,state.facing,state.seatHeight,true)||seatedFrame(state.facing,state.seatHeight);
        }
        if(state.moving&&look){
          // 3/4 front (yaw 45) and 3/4 back (yaw 135); the other two directions are mirrors.
          const walk=look.walk,mir=!state.mirrored,list=state.back?(mir?walk.bm:walk.b):(mir?walk.fm:walk.f);
          const f=list[state.step%Doll.WALK_FRAMES];
          if(f)return f;
        }
        if(state.mode==='activity'&&act&&act.spot&&look){
          const view=VIEW[act.spot.facing]||VIEW.right,pose=act.spec.pose;
          if(act.phase==='hold'){const f=poseFrame(look,pose,loopIndex(pose,animT-(act.holdAt||0)),view,null,true);if(f)return f;}
          // Getting down to / up from the floor goes through sitting on the floor; other poses
          // enter and leave through the standing idle.
          if(act.spec.lie){const f=poseFrame(look,'hug_knees',0,view,null,true);if(f)return f;}
        }
        if(look&&look.idle)return look.idle;
        return frames[state.mirrored?1:0][state.moving?state.step%4:0];
      },
      update(dt,paused=false){
        if(!present){state.moving=false;return;}
        animT+=dt;
        if(paused){state.moving=false;return;}
        sitCooldown=Math.max(0,sitCooldown-dt);
        if(state.mode==='sitting'){
          if(!held)sitTime-=dt;state.moving=false;
          if(sitTime<=0||replanReq){replanReq=false;standUp();}
          return;
        }
        if(state.mode==='activity'&&act){state.moving=false;stepActivity(dt);return;}
        if(!next){
          if(!route.length){
            if(state.mode==='approaching'){
              state.mode='sitting';state.moving=false;
              sitTime=act&&act.seat?act.dur:6;
              if(act&&act.seat){act.phase='hold';act.holdAt=animT;emit({type:'hold',id:act.spec.id,at:Date.now()});}
              return;
            }
            if(state.mode==='leaving'){seat=null;state.furnitureId=null;state.mode='idle';sitCooldown=15;wait=1.5;act=null;}
            if(state.mode==='walking'&&act&&act.phase==='go'&&act.spot){arrive();return;}
            wait-=dt;if(wait>0||held){state.moving=false;state.mode='idle';return;}
            if(Acts){if(planNext())return;wait=2;state.mode='idle';state.moving=false;return;}
            // No activity module: the original random wander.
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
            if(retryId!==undefined){if(requestSit(retryId,undefined,true).ok)return;}
            act=null;
            return;
          }
        }
        const tx=next.x??next.u+.5,ty=next.y??next.v+.5;
        const du=tx-state.u,dv=ty-state.v,distance=Math.hypot(du,dv),travel=Math.min(distance,dt*.8);
        if(distance>.02){state.mirrored=du-dv>0;state.back=du+dv<0;}
        state.moving=distance>.001;
        if(distance>0){state.u+=du/distance*travel;state.v+=dv/distance*travel;}
        elapsed+=dt;state.step=Math.floor(elapsed*14)%8;   // 8-frame walk at 14 fps (one cycle = 0.571 s)
        if(distance<=travel){state.u=tx;state.v=ty;next=null;}
      }
    };
  }
  window.RoomCharacter={create,useLook,doll:Doll,VIEW,loopIndex};
})();
