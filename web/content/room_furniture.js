/* Small code-native pixel sprites using the same 2:1 projection as the room.
   The anchor is the back corner of the occupied cell, not the image bottom. */
(() => {
  'use strict';
  function makeChair(facing) {
    const canvas = document.createElement('canvas');
    canvas.width = 96; canvas.height = 104;
    const ctx = canvas.getContext('2d');
    const project = (u, v, z) => {
      if (facing === 'right') [u, v] = [v, u];
      return [48 + (u - v) * 32, 64 + (u + v) * 16 - z];
    };
    function face(points, color) {
      points = points.map(p => project(...p));
      ctx.fillStyle = color;
      for (let y = Math.ceil(Math.min(...points.map(p => p[1]))); y < Math.max(...points.map(p => p[1])); y++) {
        const hits = [];
        for (let i = 0; i < points.length; i++) {
          const a = points[i], b = points[(i + 1) % points.length];
          if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) hits.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
        }
        hits.sort((a,b) => a-b);
        for (let i = 0; i + 1 < hits.length; i += 2) ctx.fillRect(Math.ceil(hits[i]),y,Math.ceil(hits[i+1])-Math.ceil(hits[i]),1);
      }
    }
    function box(u,v,w,d,z,h,top,front,side) {
      face([[u,v+d,z],[u+w,v+d,z],[u+w,v+d,z+h],[u,v+d,z+h]], facing === 'left' ? front : side);
      face([[u+w,v,z],[u+w,v+d,z],[u+w,v+d,z+h],[u+w,v,z+h]], facing === 'left' ? side : front);
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
      sprites: { left: makeChair('left'), right: makeChair('right') } }
  };
})();
