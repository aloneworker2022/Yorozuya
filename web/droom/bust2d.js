/* 2026-11-07 胸部像素圖（2D 直接畫，不用 3D 模型）：照使用者給的像素參考圖。
   使用者：3D 算的爛透了，先從 C 罩杯畫一張看看。
   一格一格畫：深色背景、脖子／肩／手臂／軀幹剪影、深紅棕外框；乳房＝一片淺桃色、上半融進胸口不描線、
   下半＋外側＋乳溝描深線；乳房下面身體一塊深色投影；乳暈外圈深、裡面淺、乳頭深＋亮點；乳頭內側一道白亮點；鎖骨、肚臍。
   純計算：draw(opts) → { width, height, pixels }（RGBA）。前端、node 共用。 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Bust2D = api; })(this, function () {
  const P = {
    bg: [29, 20, 34], out: [112, 38, 40], line: [150, 70, 66],
    hi: [255, 242, 234], lite: [248, 210, 192], base: [240, 196, 178], shade: [226, 172, 154], deep: [204, 128, 112],
    arRing: [200, 116, 112], ar: [228, 156, 146], nip: [178, 86, 90], nipDeep: [140, 58, 66],
  };
  // 罩杯 → 乳房半徑（格）、下垂、間距
  const CUPS = { A: [6.5, 0], B: [8.5, .5], C: [10.5, 1], D: [12, 1.5], E: [13.5, 2], F: [14.5, 2.5], G: [15.5, 3], H: [16.5, 3.5], I: [17.5, 4] };

  function draw(opts = {}) {
    const W = opts.width || 90, H = opts.height || 104, cx = W / 2;
    const px = new Uint8ClampedArray(W * H * 4);
    const id = new Uint8Array(W * H);   // 0 背景、1 身體、2 手臂、3 乳房、4 乳暈、5 乳頭
    const col = new Array(W * H).fill(null);
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; col[y * W + x] = c; };
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? 0 : id[y * W + x];

    // ── 剪影：左半邊定義、右邊鏡像 ──
    // 軀幹：每一列的半寬（從中線）。脖子 0～10、肩 11～18、胸廓 19～60（腰往內收）、下面再微微變寬
    const torsoHalf = (y) => {
      if (y < 6) return 7;                                                    // 脖子
      if (y < 14) { const t = (y - 6) / 8; return 7 + 27 * t * t * (3 - 2 * t) ** .6; }   // 脖子 → 斜方肌 → 肩（圓滑）
      if (y < 30) return 34 - (y - 14) * .1;                                 // 胸廓上半（手臂另外畫在外面）
      if (y < 72) return 32.4 - (y - 30) * .14;                              // 胸廓 → 腰
      return 26.5 + (y - 72) * .1;                                           // 腰 → 下腹
    };
    const shoulderR = 8.5, shoulderX = 35.5, shoulderY = 21;                 // 肩頭（圓）
    const armOuter = (y) => y < shoulderY ? 0 : shoulderX + shoulderR - .5 + Math.min(1.5, (y - shoulderY) * .08) - Math.max(0, y - 62) * .06;
    const armInner = (y) => y < 34 ? 0 : armOuter(y) - 9.5;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const dx = Math.abs(x + .5 - cx);
      let v = 0;
      if (dx <= torsoHalf(y)) v = 1;
      if (y >= shoulderY && dx <= armOuter(y) && dx >= armInner(y) && dx > torsoHalf(y) - 1) v = 2;
      if (y >= 10 && y < shoulderY + 1 && ((dx - shoulderX) ** 2 + (y - shoulderY) ** 2 <= shoulderR * shoulderR || (dx < shoulderX && y >= shoulderY - shoulderR + 1 && dx <= torsoHalf(y) + 6))) v = v || (dx > torsoHalf(y) ? 2 : 1);   // 肩頭圓
      id[y * W + x] = v;
    }

    // ── 乳房 ──
    const cup = CUPS[(opts.cup || 'C').toUpperCase()] || CUPS.C, R = cup[0], sag = cup[1];
    const gap = 1.5 + R * .12;                  // 兩顆內緣到中線
    const bcy = 36 + sag + R * .35;             // 乳房中心高度
    const breasts = [-1, 1].map(s => ({ s, x: cx + s * (gap + R), y: bcy, rx: R, ry: R * .92 }));
    for (const b of breasts) for (let y = Math.floor(b.y - b.ry - 2); y <= b.y + b.ry + 1; y++) for (let x = Math.floor(b.x - b.rx - 1); x <= b.x + b.rx + 1; x++) {
      const u = (x + .5 - b.x) / b.rx, v = (y + .5 - b.y) / b.ry, e = u * u + v * v;
      if (e <= 1 && at(x, y)) id[y * W + x] = 3;
    }

    // ── 上色：底色 ──
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = id[y * W + x]; col[y * W + x] = v ? P.base : P.bg; }
    // 軀幹兩側、手臂內側：陰影一條
    for (let y = 13; y < H; y++) for (let x = 0; x < W; x++) {
      const v = id[y * W + x], dx = Math.abs(x + .5 - cx);
      if (v === 1 && y > 28 && dx > torsoHalf(y) - 3.2) set(x, y, P.shade);
      if (v === 2 && dx < armInner(y) + 2.5) set(x, y, P.shade);
    }
    // 乳房下面：一塊深色投影（外側比較寬，中線不暗）
    for (const b of breasts) for (let y = Math.ceil(b.y); y < b.y + b.ry + 7; y++) for (let x = Math.floor(b.x - b.rx - 3); x <= b.x + b.rx + 2; x++) {
      if (at(x, y) !== 1) continue;
      const u = (x + .5 - b.x) / (b.rx + .2), outer = (x + .5 - b.x) * b.s;     // outer>0＝外側
      const yb = b.y + b.ry * Math.sqrt(Math.max(0, 1 - u * u));               // 乳房下緣
      const depth = 2.5 + Math.max(0, outer) * .35;                            // 外側投影比較長
      if (Math.abs(u) <= 1.15 && y > yb - .5 && y < yb + depth && Math.abs(x + .5 - cx) > 2.5) set(x, y, P.deep);
    }
    // 乳房：上半一圈淡淡的（融進胸口）、下緣內側一條陰影
    for (const b of breasts) for (let y = Math.floor(b.y - b.ry - 1); y <= b.y + b.ry; y++) for (let x = Math.floor(b.x - b.rx - 1); x <= b.x + b.rx; x++) {
      if (at(x, y) !== 3) continue;
      const u = (x + .5 - b.x) / b.rx, v = (y + .5 - b.y) / b.ry, e = Math.sqrt(u * u + v * v);
      if (v < -.35 && e > .86 && (x + y) % 2 === 0) set(x, y, P.shade);                  // 上緣：點狀淡淡一圈
      if (v > .2 && e > .8) set(x, y, P.shade);                                           // 下緣內側
      if (v > .45 && e > .9 && u * b.s > -.2) set(x, y, P.deep);                          // 外下更暗
      if (v < -.1 && v > -.75 && Math.abs(u + b.s * .15) < .45 && e < .75) set(x, y, P.lite);   // 上半中間微亮
    }
    // 乳暈、乳頭（中心偏外、偏下一點；乳頭微微朝外）
    const AR = Math.max(2.2, R * .32);
    for (const b of breasts) {
      b.ax = b.x + b.s * R * .22; b.ay = b.y + R * .12;
      for (let y = Math.floor(b.ay - AR - 1); y <= b.ay + AR + 1; y++) for (let x = Math.floor(b.ax - AR - 1); x <= b.ax + AR + 1; x++) {
        const d = Math.hypot(x + .5 - b.ax, (y + .5 - b.ay) * 1.08);
        if (d <= AR) { id[y * W + x] = 4; set(x, y, d > AR - 1 ? P.arRing : P.ar); }
      }
      const nx = b.ax + b.s * .4, ny = b.ay;
      for (const [ox, oy, c] of [[0, 0, P.nip], [b.s, 0, P.nipDeep], [0, 1, P.nipDeep], [b.s, 1, P.nipDeep], [-b.s, -1, P.hi]]) { set(nx + ox, ny + oy, c); id[Math.round(ny + oy) * W + Math.round(nx + ox)] = 5; }
      // 濕亮：乳頭內上方一道白
      const hx = b.ax - b.s * (AR + 1.2), hy = b.ay - 1.5;
      for (let k = 0; k < Math.max(2, Math.round(R * .25)); k++) set(hx - b.s * k, hy - k * .5, P.hi);
      set(hx - b.s * 1, hy + 1, P.lite);
    }

    // ── 外框 ──
    const isSkin = (x, y) => at(x, y) > 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = id[y * W + x]; if (!v) continue;
      if (!isSkin(x - 1, y) || !isSkin(x + 1, y) || !isSkin(x, y - 1) || !isSkin(x, y + 1)) { set(x, y, P.out); continue; }
      if (v === 2 && (at(x - 1, y) === 1 || at(x + 1, y) === 1) && y > 30) set(x, y, P.out);   // 手臂跟軀幹之間
    }
    // 乳房外框：下半＋外側＋內側（乳溝），上半不描
    for (const b of breasts) for (let y = Math.floor(b.y - b.ry - 1); y <= b.y + b.ry + 1; y++) for (let x = Math.floor(b.x - b.rx - 1); x <= b.x + b.rx + 1; x++) {
      if (at(x, y) !== 3) continue;
      let border = false; for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(x + ox, y + oy) !== 3 && at(x + ox, y + oy) !== 4 && at(x + ox, y + oy) !== 5) border = true;
      if (!border) continue;
      const u = (x + .5 - b.x) / b.rx, v = (y + .5 - b.y) / b.ry, ang = Math.atan2(v, u * b.s);   // 0＝外側、+＝往下
      const outerUp = ang > -.75, innerMid = Math.abs(ang) > 2.2 && v > -.25;                   // 外側從斜上 40° 開始、乳溝從中間開始
      if (v > 0 || outerUp || innerMid) set(x, y, P.out);
    }
    // 鎖骨、胸骨上窩、肚臍
    for (const s of [-1, 1]) for (let k = 0; k < 13; k++) { set(cx + s * (5 + k), 14 + k * .12, P.line); if (k > 1) set(cx + s * (5 + k), 15 + k * .12, P.lite); }
    set(cx - .5, 13, P.shade); set(cx - .5, 14, P.line);
    const ny = Math.min(H - 6, 86);
    for (let k = 0; k < 3; k++) set(cx - .5, ny + k, P.out); set(cx - 1.5, ny + 1, P.deep); set(cx + .5, ny + 1, P.deep); set(cx - 1.5, ny + 3, P.hi); set(cx + .5, ny + 3, P.hi);
    // 肩膀小亮點
    for (const s of [-1, 1]) { set(cx + s * 37, 16, P.hi); set(cx + s * 38, 17, P.lite); }

    for (let i = 0; i < W * H; i++) { const c = col[i] || P.bg; px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; }
    return { width: W, height: H, pixels: px, breasts };
  }
  return { draw, CUPS, PALETTE: P };
});
