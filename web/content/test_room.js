/* One ground cell is a true 64 x 64 diamond. World coordinates are in cells;
   z is pixel height. Keep this projection shared with future furniture. */
(() => {
  'use strict';
  const COLS = 4, ROWS = 6, TILE_WIDTH = 64, TILE_HEIGHT = 64;
  const canvas = document.getElementById('room');
  const ctx = canvas.getContext('2d');
  const button = document.getElementById('grid');
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
    polygon([[48,337],[176,465],[385,256],[250,122]], '#ded4c4');
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
  }
  button.addEventListener('click', () => {
    showGrid = !showGrid;
    button.setAttribute('aria-pressed', String(showGrid));
    button.textContent = showGrid ? '隱藏格線' : '顯示格線';
    draw();
  });
  draw();
})();
