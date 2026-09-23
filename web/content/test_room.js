/* Ground cells project to 64 x 32 diamonds (2:1). World coordinates are in cells;
   z is pixel height. Keep this projection shared with future furniture. */
(() => {
  'use strict';
  const COLS = 4, ROWS = 6, TILE_WIDTH = 64, TILE_HEIGHT = 32;
  const canvas = document.getElementById('room');
  const view = canvas.getContext('2d');
  const artwork = document.createElement('canvas');
  artwork.width = canvas.width;
  artwork.height = canvas.height;
  const ctx = artwork.getContext('2d');
  const button = document.getElementById('grid');
  const zoomLabel = document.getElementById('zoom-level');
  const camera = { scale: 1, x: 0, y: 0 };
  const pointers = new Map();
  const MIN_ZOOM = .6, MAX_ZOOM = 3;
  const origin = { x: 240, y: 132 };
  const wallHeight = 100;
  const catalog = window.RoomFurniture;
  const items = [{id:1,type:'chair',u:1,v:3,facing:'left'}];
  let selectedId = 1, nextId = 2;
  const moveButton = document.getElementById('move-item');
  const status = document.getElementById('furniture-status');
  let placing = false, drag = null, candidate = null;
  const selected = () => items.find(item => item.id === selectedId);
  const frameOf = item => catalog[item.type].frames[item.facing];
  let showGrid = false;
  const project = (u, v, z = 0) => [origin.x + (u - v) * TILE_WIDTH / 2, origin.y + (u + v) * TILE_HEIGHT / 2 - z];
  const actor=window.RoomCharacter.create({cols:COLS,rows:ROWS,getSeats:()=>items.map(item=>{
    const f=frameOf(item);return {...item,name:catalog[item.type].name,cols:f.cols,rows:f.rows,
      seats:f.seats.map(seat=>({...seat,u:item.u+seat.u,v:item.v+seat.v}))};
  }).filter(item=>item.seats.length),blocked:(u,v)=>items.some(item=>{
    const f=frameOf(item);return u>=item.u&&u<item.u+f.cols&&v>=item.v&&v<item.v+f.rows;
  })});
  let scenePixels=null,sceneDepth=null,wandering=true,sceneVisible=true;

  // Scanline fills and integer lines keep the artwork pixel crisp.
  function polygon(points, color) {
    ctx.fillStyle = color;
    const minY = Math.ceil(Math.min(...points.map(p => p[1])));
    const maxY = Math.ceil(Math.max(...points.map(p => p[1])));
    for (let y = minY; y < maxY; y++) {
      const hits = [];
      for (let i = 0; i < points.length; i++) {
        const a = points[i], b = points[(i + 1) % points.length];
        if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) hits.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
      }
      hits.sort((a, b) => a - b);
      for (let i = 0; i + 1 < hits.length; i += 2) ctx.fillRect(Math.ceil(hits[i]), y, Math.ceil(hits[i + 1]) - Math.ceil(hits[i]), 1);
    }
  }
  const face = (points, color) => polygon(points.map(p => project(...p)), color);
  function line(a, b, color) {
    a = project(...a); b = project(...b);
    const steps = Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])));
    ctx.fillStyle = color;
    for (let i = 0; i <= steps; i++) {
      const t = steps ? i / steps : 0;
      ctx.fillRect(Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), 1, 1);
    }
  }
  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    // Ground shadow and the two exposed edges of the room platform.
    polygon([[0,0],[COLS,0],[COLS,ROWS],[0,ROWS]].map(([u,v]) => {
      const [x,y] = project(u,v);
      return [x+9,y+16];
    }), '#ded4c4');
    face([[0,ROWS,0],[COLS,ROWS,0],[COLS,ROWS,-12],[0,ROWS,-12]], '#aa8060');
    face([[COLS,0,0],[COLS,ROWS,0],[COLS,ROWS,-12],[COLS,0,-12]], '#89664f');
    // Walls, with a small visible thickness and a wooden cap.
    face([[-.15,-.15,wallHeight],[0,0,wallHeight],[0,ROWS,wallHeight],[-.15,ROWS,wallHeight]], '#fff4d8');
    face([[0,0,wallHeight],[COLS,0,wallHeight],[COLS,-.15,wallHeight],[-.15,-.15,wallHeight]], '#fff7e4');
    face([[0,0,0],[0,ROWS,0],[0,ROWS,wallHeight],[0,0,wallHeight]], '#e0cfad');
    face([[0,0,0],[COLS,0,0],[COLS,0,wallHeight],[0,0,wallHeight]], '#f4e5c7');
    face([[-.15,ROWS,0],[0,ROWS,0],[0,ROWS,wallHeight],[-.15,ROWS,wallHeight]], '#baa17e');
    face([[COLS,0,0],[COLS,-.15,0],[COLS,-.15,wallHeight],[COLS,0,wallHeight]], '#cbb591');
    for (const z of [28,30]) {
      line([0,0,z],[0,ROWS,z], z === 28 ? '#c7b594' : '#eddec1');
      line([0,0,z],[COLS,0,z], z === 28 ? '#dfccaa' : '#fff0d3');
    }
    for (let v = .5; v < ROWS; v += .5) line([0,v,4],[0,v,27],'#d3c19f');
    for (let u = .5; u < COLS; u += .5) line([u,0,4],[u,0,27],'#e7d6b6');
    // 24 cells, each containing subtle wooden boards.
    const tones = ['#d9b588','#dfbc90','#d5af82','#e3c096'];
    for (let u = 0; u < COLS; u++) for (let v = 0; v < ROWS; v++) {
      face([[u,v],[u+1,v],[u+1,v+1],[u,v+1]], tones[(u * 3 + v * 7) % tones.length]);
      for (let k = 0; k < 4; k++) {
        const edge = v + k / 4;
        line([u,edge],[u+1,edge],'#bf986e');
        line([u,edge+.03],[u+1,edge+.03],'#e9cba1');
        const start = u + .12 + ((v + k) % 3) * .12;
        line([start,edge+.13],[Math.min(u+.9,start+.36),edge+.13], '#cda67b');
      }
      line([u,v],[u,v+1],'#c49d73');
    }
    // Skirting sits over the back edge of the floor.
    face([[0,0,0],[0,ROWS,0],[0,ROWS,7],[0,0,7]], '#aa8663');
    face([[0,0,0],[COLS,0,0],[COLS,0,7],[0,0,7]], '#c39f77');
    line([0,0,7],[0,ROWS,7],'#f0d4a8');
    line([0,0,7],[COLS,0,7],'#ffe3b9');
    line([0,ROWS],[COLS,ROWS],'#f3d3a5');
    line([COLS,0],[COLS,ROWS],'#f0cda0');
    if (showGrid || placing || drag) {
      for (let u = 0; u <= COLS; u++) line([u,0],[u,ROWS],'#7c8061');
      for (let v = 0; v <= ROWS; v++) line([0,v],[COLS,v],'#7c8061');
    }
    const active = selected();
    if (active) {
      const pos = candidate ? {...active,...candidate} : active;
      const f=frameOf(pos);
      const tint=actor.isFurnitureLocked(pos.id)?'#abb8bd':canPlace(pos)?'#9aa982':'#bf8073';
      face([[pos.u,pos.v],[pos.u+f.cols,pos.v],[pos.u+f.cols,pos.v+f.rows],[pos.u,pos.v+f.rows]],tint);
    }
    // Composite furniture by depth per pixel, so long tables and tall cabinets
    // occlude correctly even when their screen-space silhouettes overlap.
    const output=ctx.getImageData(0,0,canvas.width,canvas.height);
    const depths=new Float64Array(canvas.width*canvas.height).fill(-Infinity);
    for(const original of items) {
      const item=original.id===selectedId && candidate ? {...original,...candidate} : original;
      const f=frameOf(item),[px,py]=project(item.u,item.v);
      const ox=Math.round(px-f.anchor.x),oy=Math.round(py-f.anchor.y);
      for(let sy=0;sy<f.canvas.height;sy++) for(let sx=0;sx<f.canvas.width;sx++) {
        const source=sy*f.canvas.width+sx;
        if(!f.pixels[source*4+3]) continue;
        const x=ox+sx,y=oy+sy;
        if(x<0||y<0||x>=canvas.width||y>=canvas.height) continue;
        const target=y*canvas.width+x,d=f.depth[source]+item.u+item.v;
        if(d>=depths[target]) {depths[target]=d;output.data.set(f.pixels.subarray(source*4,source*4+4),target*4);}
      }
    }
    scenePixels=output;sceneDepth=depths;
    drawActor();
  }

  function drawActor() {
    if(!scenePixels)return;
    const output=new ImageData(new Uint8ClampedArray(scenePixels.data),canvas.width,canvas.height);
    const {u,v}=actor.position(),f=actor.frame(),[px,py]=project(u,v);
    const ox=Math.round(px-f.anchor.x),oy=Math.round(py-f.anchor.y);
    function blend(x,y,color,alpha,depth){
      if(x<0||y<0||x>=canvas.width||y>=canvas.height)return;
      const index=y*canvas.width+x;if(depth<sceneDepth[index])return;
      for(let c=0;c<3;c++)output.data[index*4+c]=Math.round(color[c]*alpha+output.data[index*4+c]*(1-alpha));
    }
    for(let y=-3;y<=3;y++)for(let x=-12;x<=12;x++)if(x*x/144+y*y/9<=1)blend(Math.round(px)+x,Math.round(py)+y,[40,33,45],.16,u+v);
    for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){
      const i=(y*f.width+x)*4,alpha=f.pixels[i+3]/255;
      if(alpha)blend(ox+x,oy+y,f.pixels.subarray(i,i+3),alpha,u+v+(f.depth?f.depth[y*f.width+x]:Math.max(0,f.anchor.y-y)/32));
    }
    ctx.putImageData(output,0,0);renderView();
  }

  function canPlace(pos) {
    if(actor.isFurnitureLocked(pos.id))return false;
    const f=frameOf(pos);
    let touchesActor=false;
    for(let u=pos.u;u<pos.u+f.cols;u++)for(let v=pos.v;v<pos.v+f.rows;v++)if(actor.occupies(u,v))touchesActor=true;
    return !touchesActor && Number.isInteger(pos.u) && Number.isInteger(pos.v) && pos.u>=0 && pos.v>=0 && pos.u+f.cols<=COLS && pos.v+f.rows<=ROWS &&
      items.every(other => {
        if(other.id===pos.id) return true;
        const g=frameOf(other);
        return pos.u+f.cols<=other.u || other.u+g.cols<=pos.u || pos.v+f.rows<=other.v || other.v+g.rows<=pos.v;
      });
  }
  function worldPoint(point) {
    return { x: (point.x-camera.x)/camera.scale, y: (point.y-camera.y)/camera.scale };
  }
  function groundPoint(point) {
    const p = worldPoint(point), x = (p.x-origin.x)/(TILE_WIDTH/2), y = (p.y-origin.y)/(TILE_HEIGHT/2);
    return { u: (x+y)/2, v: (y-x)/2 };
  }
  function hitItem(point) {
    const p=worldPoint(point);let best=null,bestDepth=-Infinity;
    for(const item of items) {
      const f=frameOf(item),[x,y]=project(item.u,item.v);
      const sx=Math.floor(p.x-x+f.anchor.x),sy=Math.floor(p.y-y+f.anchor.y);
      if(sx<0||sy<0||sx>=f.canvas.width||sy>=f.canvas.height) continue;
      const index=sy*f.canvas.width+sx,d=f.depth[index]+item.u+item.v;
      if(f.pixels[index*4+3] && d>=bestDepth){best=item;bestDepth=d;}
    }
    return best;
  }
  function setPlacing(value) {
    placing=value;moveButton.setAttribute('aria-pressed',String(value));
    moveButton.textContent=value?'取消移動':'移動';
  }
  function cancelDrag() { drag=null;candidate=null; }
  function refreshActorControls(){
    const item=selected(),locked=!!item&&actor.isFurnitureLocked(item.id);
    for(const id of ['move-item','turn-item','remove-item']){
      const control=document.getElementById(id);control.disabled=locked;
      control.title=locked?'她正在使用這件家具，起身離開後才能調整。':'';
    }
    const sitButton=document.getElementById('actor-sit');
    sitButton.disabled=actor.state.furnitureId!==null||!!item&&!frameOf(item).seats.length;
    sitButton.title=item&&!frameOf(item).seats.length?'這件家具不是座位。':'';
    sitButton.textContent=item?'坐這裡':'找位置坐';
    document.getElementById('actor-stand').disabled=actor.state.mode!=='sitting';
    const descriptions={idle:'她正在休息，稍後會找座位休息。',walking:'她正在房間裡走動。',approaching:'她正走到座位旁。',sitting:'她正坐著休息。',leaving:'她正起身離開座位。'};
    const text=descriptions[actor.state.mode]+(!wandering?'（已暫停）':'');
    const label=document.getElementById('actor-status');
    if(label.textContent!==text)label.textContent=text;
  }
  function refresh() {
    const item=selected();
    document.getElementById('selection').hidden=!item;
    document.getElementById('empty-selection').hidden=!!item;
    if(item) {
      const def=catalog[item.type],f=frameOf(item);
      document.getElementById('item-name').textContent=def.name;
      document.getElementById('item-size').textContent=`占地 ${f.cols} × ${f.rows}・第 ${item.u+1} 列，第 ${item.v+1} 格${f.seats.length?'・可坐':''}`;
      document.getElementById('item-preview').src=f.canvas.toDataURL();
      document.getElementById('item-preview').alt=def.name;
      document.getElementById('turn-item').textContent=`${def.labels[item.facing]} 旋轉`;
    }
    document.getElementById('room-count').textContent=`房間內 ${items.length} 件`;
    const placed=document.getElementById('placed-items');placed.replaceChildren();
    for(const entry of items) {
      const btn=document.createElement('button');btn.type='button';btn.dataset.instance=entry.id;
      btn.textContent=`${catalog[entry.type].name} #${entry.id}`;btn.setAttribute('aria-pressed',String(entry.id===selectedId));
      btn.addEventListener('click',()=>{cancelDrag();setPlacing(false);selectedId=entry.id;status.textContent='已選取，可移動、旋轉或收回。';refresh();draw();});
      placed.append(btn);
    }
    for(const card of document.querySelectorAll('[data-add]')) {
      const n=items.filter(entry=>entry.type===card.dataset.add).length;
      card.querySelector('.in-room').textContent=n?`房內 ${n} 件`:'尚未擺放';
    }
    refreshActorControls();
  }
  moveButton.addEventListener('click',()=>{
    if(!selected()||actor.isFurnitureLocked(selectedId)) return;
    cancelDrag();setPlacing(!placing);
    status.textContent=placing?'點選空地，或拖曳選中的家具。':'已取消移動。';draw();
  });
  document.getElementById('turn-item').addEventListener('click',()=>{
    const item=selected();if(!item||actor.isFurnitureLocked(item.id))return;
    cancelDrag();const def=catalog[item.type];
    const next={...item,facing:def.directions[(def.directions.indexOf(item.facing)+1)%4]};
    if(canPlace(next)) {Object.assign(item,next);status.textContent='已旋轉家具。';}
    else status.textContent='旋轉後會碰到家具、人物或超出房間，請先移到空位。';
    refresh();draw();
  });
  document.getElementById('remove-item').addEventListener('click',()=>{
    if(actor.isFurnitureLocked(selectedId))return;
    const index=items.findIndex(item=>item.id===selectedId);if(index<0)return;
    const name=catalog[items[index].type].name;items.splice(index,1);
    cancelDrag();setPlacing(false);selectedId=null;status.textContent=`已收回${name}，可以從下方列表再次加入。`;
    refresh();draw();
  });
  function addItem(type) {
    cancelDrag();setPlacing(false);
    const item={id:nextId,type,u:0,v:0,facing:'left'};let found=false;
    // Try the default direction first, then the perpendicular footprint.
    for(const facing of ['left','right']) {
      item.facing=facing;
      for(let v=0;v<ROWS&&!found;v++)for(let u=0;u<COLS&&!found;u++) {
        item.u=u;item.v=v;if(canPlace(item))found=true;
      }
      if(found)break;
    }
    if(found){nextId++;items.push(item);selectedId=item.id;status.textContent=`已加入${catalog[type].name}，可拖曳調整位置。`;}
    else status.textContent='房間沒有足夠的連續空位，請先移動或收回家具。';
    refresh();draw();
    document.querySelector('.scene').scrollIntoView({block:'start',behavior:'smooth'});
  }
  function buildCatalog() {
    const list=document.getElementById('furniture-list');
    for(const [type,def] of Object.entries(catalog)) {
      const btn=document.createElement('button');btn.type='button';btn.className='furniture-card';btn.dataset.add=type;
      btn.setAttribute('aria-label',`加入${def.name}`);
      const img=document.createElement('img');img.src=def.frames.left.canvas.toDataURL();img.alt='';
      const name=document.createElement('strong');name.textContent=def.name;
      const size=document.createElement('span');size.className='catalog-size';size.textContent=`${def.frames.left.cols} × ${def.frames.left.rows} 格${def.frames.left.seats.length?'・可坐':''}`;
      const count=document.createElement('span');count.className='in-room';
      const add=document.createElement('span');add.className='add-label';add.textContent='＋ 加入房間';
      btn.append(img,name,size,count,add);btn.addEventListener('click',()=>addItem(type));list.append(btn);
    }
  }

  function renderView() {
    // Keep part of the room reachable even after a long drag.
    for (const [axis, size] of [['x', canvas.width], ['y', canvas.height]]) {
      const center = size * (1 - camera.scale) / 2;
      const travel = Math.max(0, size * (camera.scale - 1)) / 2 + size * .2;
      camera[axis] = Math.max(center - travel, Math.min(center + travel, camera[axis]));
    }
    view.clearRect(0, 0, canvas.width, canvas.height);
    view.imageSmoothingEnabled = false;
    view.drawImage(artwork, camera.x, camera.y, canvas.width * camera.scale, canvas.height * camera.scale);
    zoomLabel.textContent = `${Math.round(camera.scale * 100)}%`;
  }

  function zoomAt(factor, from, to = from) {
    const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, camera.scale * factor));
    const ratio = next / camera.scale;
    camera.x = to.x - (from.x - camera.x) * ratio;
    camera.y = to.y - (from.y - camera.y) * ratio;
    camera.scale = next;
    renderView();
  }
  function localPoint(event) {
    const bounds = canvas.getBoundingClientRect();
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width,
      y: (event.clientY - bounds.top) * canvas.height / bounds.height };
  }
  function gesture() {
    const [a, b] = [...pointers.values()];
    return b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, distance: Math.hypot(a.x - b.x, a.y - b.y) }
      : { ...a, distance: 0 };
  }
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (pointers.size >= 2) return;
    canvas.setPointerCapture(event.pointerId);
    const point = localPoint(event);
    pointers.set(event.pointerId, point);
    if (pointers.size === 2) {
      cancelDrag();draw();
    } else {
      const hit=hitItem(point);
      if(hit&&actor.isFurnitureLocked(hit.id)){
        selectedId=hit.id;cancelDrag();setPlacing(false);
        status.textContent='她正在使用這件家具，起身離開後才能調整。';refresh();draw();return;
      }
      if(hit || (placing && selected())) {
        const wasPlacing=placing;
        if(!wasPlacing && hit) {selectedId=hit.id;refresh();}
        const item=selected(),ground=groundPoint(point),onItem=hit && hit.id===item.id;
        drag={id:event.pointerId,start:ground,onItem,original:{...item}};
        candidate=onItem?{u:item.u,v:item.v}:{u:Math.floor(ground.u),v:Math.floor(ground.v)};
        draw();
      }
    }
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture();
    pointers.set(event.pointerId, localPoint(event));
    if (drag && pointers.size === 1) {
      const ground = groundPoint(localPoint(event));
      candidate = drag.onItem ? {u:drag.original.u+Math.round(ground.u-drag.start.u),v:drag.original.v+Math.round(ground.v-drag.start.v)}
        : {u:Math.floor(ground.u),v:Math.floor(ground.v)};
      draw(); return;
    }
    const after = gesture();
    zoomAt(before.distance > 0 ? after.distance / before.distance : 1, before, after);
  });
  function release(event) {
    if (drag && drag.id === event.pointerId) {
      if (event.type === 'pointerup' && candidate) {
        const item=selected();
        if (item && canPlace({...item,...candidate})) {
          Object.assign(item,candidate); setPlacing(false);
          status.textContent = `已放好${catalog[item.type].name}。`;
        } else status.textContent = '這裡超出房間，或有家具、人物，已保留原位。';
      }
      cancelDrag();refresh();draw();
    }
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release);
  window.addEventListener('blur', () => { pointers.clear(); cancelDrag(); draw(); canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (drag) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    zoomAt(Math.exp(-Math.max(-150, Math.min(150, event.deltaY * unit)) * .003), localPoint(event));
  }, { passive: false });
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
  document.getElementById('zoom-in').addEventListener('click', () => zoomAt(1.25, center));
  document.getElementById('zoom-out').addEventListener('click', () => zoomAt(1 / 1.25, center));
  document.getElementById('reset-view').addEventListener('click', () => {
    pointers.clear();
    cancelDrag();
    canvas.classList.remove('dragging');
    Object.assign(camera, { scale: 1, x: 0, y: 0 });
    draw();
  });
  button.addEventListener('click', () => {
    showGrid = !showGrid;
    button.setAttribute('aria-pressed', String(showGrid));
    button.textContent = showGrid ? '隱藏格線' : '顯示格線';
    draw();
  });
  buildCatalog();
  refresh();
  draw();
  const actorToggle=document.getElementById('actor-toggle');
  actorToggle.addEventListener('click',()=>{
    wandering=!wandering;actorToggle.setAttribute('aria-pressed',String(!wandering));
    actorToggle.textContent=wandering?'暫停動作':'繼續動作';
    actor.update(0,true);refreshActorControls();drawActor();
  });
  function resumeActor(){
    wandering=true;actorToggle.setAttribute('aria-pressed','false');actorToggle.textContent='暫停動作';
    cancelDrag();setPlacing(false);
  }
  document.getElementById('actor-sit').addEventListener('click',()=>{
    const item=selected();
    if(item&&!frameOf(item).seats.length){status.textContent='這件家具不是座位，請選擇椅子、沙發或床。';return;}
    const result=actor.requestSit(item?.id);
    status.textContent=result.message;
    if(result.ok)resumeActor();
    refreshActorControls();draw();
  });
  document.getElementById('actor-stand').addEventListener('click',()=>{
    if(actor.standUp())resumeActor();refreshActorControls();draw();
  });
  new IntersectionObserver(entries=>{sceneVisible=entries[0].isIntersecting;}).observe(canvas);
  let previous=0;
  function animate(now){
    requestAnimationFrame(animate);
    if(document.hidden||!sceneVisible){previous=now;return;}
    if(now-previous<50)return;
    const dt=previous?Math.min((now-previous)/1000,.1):0;previous=now;
    actor.update(dt,!wandering||placing||!!drag||pointers.size>0);
    refreshActorControls();
    drawActor();
  }
  requestAnimationFrame(animate);
})();
