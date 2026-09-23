/* Small code-native pixel sprites using the same 2:1 projection as the room.
   The anchor is the back corner of the occupied cell, not the image bottom. */
(() => {
  'use strict';
  function makeChair(facing) {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 104;
    const ctx = canvas.getContext('2d');
    const depth = new Float64Array(canvas.width * canvas.height).fill(-Infinity);
    const rotate = (u,v) => {
      if (facing === 'right') return [v,1-u];
      if (facing === 'back-right') return [1-u,1-v];
      if (facing === 'back-left') return [1-v,u];
      return [u,v];
    };
    const project = (u,v,z) => [48+(u-v)*32,64+(u+v)*16-z,u+v+z/32];
    // Per-pixel depth keeps the backrest, seat and legs correctly occluded
    // from all four directions, including when the back faces the viewer.
    function face(points, color) {
      points = points.map(p => project(...p));
      ctx.fillStyle = color;
      for (let y = Math.max(0,Math.ceil(Math.min(...points.map(p => p[1])))); y < Math.min(canvas.height,Math.max(...points.map(p => p[1]))); y++) {
        const hits = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) {
            const t = (y-a[1])/(b[1]-a[1]);
            hits.push([a[0]+t*(b[0]-a[0]),a[2]+t*(b[2]-a[2])]);
          }
        }
        hits.sort((a,b) => a[0]-b[0]);
        for (let i = 0; i + 1 < hits.length; i += 2) {
          const a=hits[i],b=hits[i+1];
          for (let x=Math.max(0,Math.ceil(a[0]));x<Math.min(canvas.width,Math.ceil(b[0]));x++) {
            const d=a[1]+(x-a[0])/(b[0]-a[0])*(b[1]-a[1]);
            const index=y*canvas.width+x;
            if(d>=depth[index]) { depth[index]=d;ctx.fillRect(x,y,1,1); }
          }
        }
      }
    }
    function box(u,v,w,d,z,h,top,front,side) {
      const a=rotate(u,v),b=rotate(u+w,v+d);
      u=Math.min(a[0],b[0]);v=Math.min(a[1],b[1]);w=Math.abs(b[0]-a[0]);d=Math.abs(b[1]-a[1]);
      face([[u,v+d,z],[u+w,v+d,z],[u+w,v+d,z+h],[u,v+d,z+h]],front);
      face([[u+w,v,z],[u+w,v+d,z],[u+w,v+d,z+h],[u+w,v,z+h]],side);
      face([[u,v,z+h],[u+w,v,z+h],[u+w,v+d,z+h],[u,v+d,z+h]],top);
    }
    face([[.12,.17,0],[.84,.17,0],[.97,.87,0],[.3,.95,0]],'#b09270');
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
    return canvas;
  }
  window.RoomFurniture = {
    chair: { name: '鼠尾草木椅', footprint: { cols: 1, rows: 1 }, anchor: { x: 48, y: 64 },
      directions: ['left','right','back-right','back-left'],
      labels: { left:'左前 ↙',right:'右前 ↘','back-right':'右後 ↗','back-left':'左後 ↖' },
      sprites: Object.fromEntries(['left','right','back-right','back-left'].map(direction => [direction,makeChair(direction)])) }
  };
})();
