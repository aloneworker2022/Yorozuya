/* 2026-11-07 胸部像素圖（2D 直接畫，不用 3D 模型）。
   第 2 版：照使用者第二張參考圖（胸部近景：鎖骨到乳房下、乳房佔滿畫面、兩顆在中間碰在一起；
   上半很滑順地從胸口長出來、下半飽滿有深線；明暗柔和多階、用抖動（dither）過渡；乳暈大而深、乳頭深＋亮點、乳頭內上方一道濕亮）。
   做法：2D 高度圖（軀幹＝圓柱、兩顆乳房＝凸起：上半邊緣平緩、下半邊緣陡＝摺痕；兩顆取 max＝中間有乳溝）
   → 由高度算法線打光＋上方遮擋＝乳房下的陰影 → 量化成少數幾個顏色（4×4 Bayer 抖動）→ 外框：剪影、乳房下緣／外側陡降處。
   純計算：draw(opts) → { width, height, pixels }（RGBA）。前端、node 共用。 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Bust2D = api; })(this, function () {
  const SKIN = [[246, 212, 192], [226, 176, 150], [206, 152, 124], [188, 132, 106], [166, 110, 88], [140, 86, 70], [112, 62, 52]];   // 亮 → 暗
  const AREOLA = [[204, 124, 108], [186, 104, 90], [166, 86, 76], [142, 68, 62], [118, 52, 50]];
  const C = { bg: [122, 132, 152], out: [66, 26, 26], spec: [252, 238, 228], nip: [104, 44, 42] };
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16 - .5);
  // 罩杯 → 乳房半徑（格）、往前凸多高、下垂
  const CUPS = { A: [12, .4, 0], B: [15, .5, .5], C: [18, .62, 1], D: [19.5, .68, 1.5], E: [21, .74, 2.2], F: [19.5, .84, 2.8], G: [20.5, .88, 3.4], H: [21.5, .9, 4], I: [22.5, .92, 4.6] };
  const sst = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

  function draw(opts = {}) {
    const W = opts.width || 90, H = opts.height || 112, cx = W / 2;
    const [R, hk, sag] = CUPS[(opts.cup || 'C').toUpperCase()] || CUPS.C;
    const h = new Float32Array(W * H), mask = new Uint8Array(W * H), part = new Uint8Array(W * H);   // part：0 身體、1 乳房、2 乳暈、3 乳頭
    // 軀幹半寬：上面是肩膀（超出畫面），往下胸廓、腰慢慢收
    const half = (y) => y < 10 ? 15 + y * 3.4 + y * y * .02 : 52;   // 上面：脖子 → 斜方肌往兩邊斜下到肩膀（之後超出畫面）
    // 乳房：微微外擴（使用者）——最飽滿那點往外、外側半徑大、乳暈乳頭偏外並朝外（看起來橫向被壓窄一點）、外下緣往腋下收上去
    const breasts = [-1, 1].map(s => ({ s, x: cx + s * (R * 1.0 + 1.2), y: 56 + sag + (R - 18) * .4, R }));
    let bump = new Float32Array(W * H), which = new Int8Array(W * H), arm = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, dx = x + .5 - cx, ax = Math.abs(dx), hw = half(y);
      // 手臂：畫面兩邊（腋下以下跟身體之間留背景縫）
      const gx0 = 38.5 - Math.max(0, y - 76) * .12;
      const armGap = y > 76 && ax > gx0 && ax < gx0 + 2.2 + (y - 76) * .05;
      if (ax <= hw && !armGap) mask[i] = 1;
      // 軀幹：圓柱
      const u = dx / 50; let t = 9 * Math.sqrt(Math.max(0, 1 - u * u));
      // 脖子：往前一點＋兩條胸鎖乳突肌往下收到胸骨上窩
      if (y < 9 && ax < 15) t += 2.4 * (1 - y / 9);
      if (y < 11) t += .9 * Math.exp(-(((ax - (4 + (10 - y) * .95)) / 1.3) ** 2));
      t -= 1.6 * Math.exp(-(dx * dx) / 4 - ((y - 10.5) / 1.6) ** 2);                    // 胸骨上窩（凹）
      // 鎖骨：從上窩往兩邊、微微 S 形，稜線上亮下暗
      const clav = 10.5 + ax * .05 + Math.sin(ax / 9) * .9 - (ax < 6 ? (6 - ax) * .5 : 0);
      if (ax > 3 && ax < 40) t += 1.4 * Math.exp(-(((y - clav) / 1.25) ** 2));
      // 上胸（胸大肌）一片微微隆起、胸骨中間一條亮
      t += 1.4 * Math.exp(-(((y - 27) / 9) ** 2)) * sst(2, 8, ax) * (1 - sst(28, 40, ax));
      t += .45 * Math.exp(-(dx * dx) / 6) * (1 - sst(58, 72, y));
      // 乳房下：胸骨溝、肋弓（倒 V，上面高下面低）、兩側肋骨淡淡幾條
      t -= .8 * Math.exp(-(dx * dx) / 5) * sst(70, 90, y);
      if (ax < 34) t += .55 * sst(-1.6, 1.6, 86 + ax * .38 - y);
      if (y > 66 && ax > 17 && ax < 38) t += .28 * Math.sin((y - ax * .45) / 2.3) * sst(66, 74, y);
      // 肩膀／手臂：兩邊的圓柱，跟胸口之間一條摺（三角肌前緣），腋下以下是另一塊
      // 手臂從肩膀慢慢分出來（上面跟肩膀同一塊、不分界），腋下以下才是分開的一塊
      const aU = (ax - 47) / 10.5, armH = (7.5 * Math.sqrt(Math.max(0, 1 - aU * aU)) + 1.5 + 1.2 * Math.exp(-(((y - 17) / 7) ** 2))) * sst(4, 18, y);
      const sep = sst(16, 32, y);
      if (armH > t && ax > 34) { t = t + (armH - t) * (.35 + .65 * sep); if (sep > .5) arm[i] = 1; }
      h[i] = t;
      // 乳房凸起：上半半徑拉長、邊緣平緩；下半邊緣陡（摺痕）；外側半徑大＝往外擴，外下緣往腋下收
      for (const b of breasts) {
        const bx = (x + .5 - b.x) / b.R, by = (y + .5 - b.y) / b.R, out = bx * b.s;   // out>0＝外側
        const ry = by < 0 ? 1.55 : .97 - .14 * Math.max(0, out), rx = (out > 0 ? 1.12 : 1.0) + Math.max(0, -by) * .1;
        const e = Math.hypot(bx / rx, by / ry); if (e >= 1) continue;
        const k = sst(-.8, .45, by);
        const prof = Math.pow(1 - e * e, .5 + (1 - k) * 1.3);
        const v = b.R * hk * prof;
        if (v > bump[i]) { bump[i] = v; which[i] = b.s; }
      }
      h[i] += bump[i]; if (bump[i] > .05) { part[i] = 1; arm[i] = 0; }
    }
    // 乳暈、乳頭：偏外、略低；朝外所以橫向窄一點，乳頭再往外一點
    const AR = R * .3;
    for (const b of breasts) {
      b.ax = b.x + b.s * R * .3; b.ay = b.y + R * .08;
      for (let y = Math.floor(b.ay - AR - 2); y <= b.ay + AR + 2; y++) for (let x = Math.floor(b.ax - AR - 2); x <= b.ax + AR + 2; x++) {
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const d = Math.hypot((x + .5 - b.ax) / .84, (y + .5 - b.ay) * 1.02), i = y * W + x;
        if (d <= AR) { part[i] = 2; h[i] += .35 * (1 - d / AR); }
        const dn = Math.hypot((x + .5 - b.ax - b.s * AR * .22) / .84, y + .5 - b.ay);
        if (dn <= AR * .36) { part[i] = 3; h[i] += .9 * (1 - dn / (AR * .36)); }
      }
    }
    const H_ = (x, y) => h[Math.max(0, Math.min(H - 1, y)) * W + Math.max(0, Math.min(W - 1, x))];
    const L = (() => { const v = [-.05, .3, .95], l = Math.hypot(...v); return v.map(q => q / l); })();
    const HV = (() => { const v = [-.2, .35, 1.9], l = Math.hypot(...v); return v.map(q => q / l); })();
    const px = new Uint8ClampedArray(W * H * 4);
    const put = (i, c) => { px[i * 4] = c[0]; px[i * 4 + 1] = c[1]; px[i * 4 + 2] = c[2]; px[i * 4 + 3] = 255; };
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) { put(i, C.bg); continue; }
      // 外框：剪影；乳房下緣／外側往下陡降的地方（上半不描）
      let edge = false;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const xx = x + ox, yy = y + oy; if (xx < 0 || yy < 0 || xx >= W || yy >= H || !mask[yy * W + xx]) edge = true; }
      const drop = Math.max(h[i] - H_(x, y + 1), (h[i] - H_(x + 1, y)) * (which[i] > 0 ? 1 : 0), (h[i] - H_(x - 1, y)) * (which[i] < 0 ? 1 : 0), (h[i] - H_(x + which[i] * -1, y)) * (part[i] && Math.abs(x + .5 - cx) < R * .9 ? 1 : 0));
      if (part[i] && drop > 2.4 && y > breasts[0].y - R * .25) edge = true;
      if (!edge && arm[i] && y > 30 && (x > 0 && !arm[i - 1] && !part[i - 1] || x < W - 1 && !arm[i + 1] && !part[i + 1])) edge = true;   // 手臂跟身體之間（腋下以下）
      if (edge) { put(i, C.out); continue; }
      const gx = (H_(x + 1, y) - H_(x - 1, y)) / 2, gy = (H_(x, y + 1) - H_(x, y - 1)) / 2;
      let nx = -gx, ny = gy, nz = 1.6; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(0, nx * L[0] + ny * L[1] + nz * L[2]);
      let occ = 0;   // 上方比自己高很多＝被擋（乳房下面）
      for (let k = 1; k <= 9; k++) { const d = H_(x, y - k) - h[i] - k * .55; if (d > 0) occ = Math.max(occ, Math.min(1, d / 3)); }
      // 色階：平的皮膚＝第 2 階（中間的棕褐），正對光的乳房亮到第 0～1 階，側面／下面暗到第 4～5 階，被擋再暗
      let fi = 2 + (.94 - dif) * 20 + occ * 3.2 - (part[i] === 1 ? .35 : 0);
      const spec = nx * HV[0] + ny * HV[1] + nz * HV[2];
      const b = breasts[which[i] < 0 ? 0 : 1], dA = Math.hypot(x + .5 - b.ax, y + .5 - b.ay);
      // 濕亮：只在乳頭內上方一小塊（參考圖）
      if (part[i] === 1 && dA < AR * 2 && dA > AR * 1.05 && (x + .5 - b.ax) * b.s < 0 && y + .5 < b.ay && dA < AR * 1.7 && spec > .9935) { put(i, C.spec); continue; }
      if (part[i] === 3 && spec > .985 && (x + .5 - b.ax) * b.s < .5) { put(i, C.spec); continue; }
      if (part[i] === 2 && dA > AR - 1.1) { put(i, AREOLA[Math.min(AREOLA.length - 1, 3)]); continue; }   // 乳暈外圈深
      const pal = part[i] >= 2 ? AREOLA : SKIN, n = pal.length;
      if (pal === AREOLA) fi = fi * .6;
      if (arm[i] && y > 22 && y < 34 && (x > 0 && !arm[i - 1] || x < W - 1 && !arm[i + 1])) fi += 1.2;   // 三角肌前緣：淡淡一條摺
      fi += ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296 - .5) * .38;   // 皮膚微微斑駁（參考圖的質感）
      let idx = Math.round(fi + BAYER[(y & 3) * 4 + (x & 3)] * .55);
      idx = Math.max(0, Math.min(n - 1, idx));
      put(i, part[i] === 3 ? (idx >= 2 ? C.nip : AREOLA[idx + 2]) : pal[idx]);
    }
    return { width: W, height: H, pixels: px, breasts };
  }
  return { draw, CUPS };
});
