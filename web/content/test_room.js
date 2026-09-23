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
  let showGrid = false;
  const project = (u, v, z = 0) => [origin.x + (u - v) * TILE_WIDTH / 2, origin.y + (u + v) * TILE_HEIGHT / 2 - z];

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
    if (showGrid) {
      for (let u = 0; u <= COLS; u++) line([u,0],[u,ROWS],'#7c8061');
      for (let v = 0; v <= ROWS; v++) line([0,v],[COLS,v],'#7c8061');
    }
    renderView();
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
    pointers.set(event.pointerId, localPoint(event));
    canvas.classList.add('dragging');
  });
  canvas.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId)) return;
    const before = gesture();
    pointers.set(event.pointerId, localPoint(event));
    const after = gesture();
    zoomAt(before.distance > 0 ? after.distance / before.distance : 1, before, after);
  });
  function release(event) {
    pointers.delete(event.pointerId);
    if (!pointers.size) canvas.classList.remove('dragging');
  }
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, release);
  window.addEventListener('blur', () => { pointers.clear(); canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1;
    zoomAt(Math.exp(-Math.max(-150, Math.min(150, event.deltaY * unit)) * .003), localPoint(event));
  }, { passive: false });
  const center = { x: canvas.width / 2, y: canvas.height / 2 };
  document.getElementById('zoom-in').addEventListener('click', () => zoomAt(1.25, center));
  document.getElementById('zoom-out').addEventListener('click', () => zoomAt(1 / 1.25, center));
  document.getElementById('reset-view').addEventListener('click', () => {
    pointers.clear();
    canvas.classList.remove('dragging');
    Object.assign(camera, { scale: 1, x: 0, y: 0 });
    renderView();
  });
  button.addEventListener('click', () => {
    showGrid = !showGrid;
    button.setAttribute('aria-pressed', String(showGrid));
    button.textContent = showGrid ? '隱藏格線' : '顯示格線';
    draw();
  });
  draw();
})();
