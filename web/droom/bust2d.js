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
    const W = opts.width || 96, H = opts.height || 104, cx = W / 2;
    const [R0, hk, sag] = CUPS[(opts.cup || 'C').toUpperCase()] || CUPS.C, R = R0 * .78;
    const h = new Float32Array(W * H), mask = new Uint8Array(W * H), part = new Uint8Array(W * H);   // part：0 身體、1 乳房、2 乳暈、3 乳頭
    // 第 4 版構圖（使用者附的人體結構圖）：整個軀幹在畫面裡——細脖子、肩膀斜下到圓圓的肩角、兩邊短短的手臂；
    //   乳房掛在胸廓兩側、偏下（上緣約軀幹 1/3）、中間分開有空隙、外緣凸出軀幹輪廓（外擴）；下面肋弓弧線，再收到腰（梯形）。
    const NECK = 7.5, NECK_Y = 11, SH_X = 37, SH_Y = 15, SH_R = 7, ARM_IN = 28.5, ARMPIT = 33, ARM_END = 66;
    const torsoHalf = (y) => y < NECK_Y ? NECK : y < SH_Y ? NECK + (SH_X - NECK) * sst(NECK_Y - 1, SH_Y + 1, y) ** .7 : y < ARMPIT ? SH_X : ARM_IN - (y - ARMPIT) * .1;
    const armOut = (y) => SH_X + 2 - Math.max(0, y - SH_Y - SH_R) * .04;
    const breasts = [-1, 1].map(s => ({ s, x: cx + s * (R * .95 + 5.5), y: 52 + sag * .8 + (R - 14) * .5, R }));
    let bump = new Float32Array(W * H), which = new Int8Array(W * H), arm = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, dx = x + .5 - cx, ax = Math.abs(dx);
      // 剪影：軀幹＋肩角（圓）＋手臂（到 ARM_END）
      // 肩線：從脖子根往外微微斜下（斜方肌），到肩角圓圓地轉下去接手臂外側
      const yTop = ax <= NECK ? 0 : ax <= SH_X - 5 ? NECK_Y + (ax - NECK) * .11 + 1.2 * sst(NECK, NECK + 6, ax) : NECK_Y + (SH_X - 5 - NECK) * .11 + 1.2 + (ax - (SH_X - 5)) ** 2 * .42;
      const inT = y >= yTop && (y < ARMPIT ? ax <= armOut(Math.max(y, SH_Y)) + 0 : ax <= torsoHalf(y));
      const inArm = y >= SH_Y && y < ARM_END && ax >= ARM_IN - 1 && ax <= armOut(y) && y >= yTop;
      if (inT || inArm) mask[i] = 1;
      // 高度：軀幹圓柱（隨半寬）
      const hw = Math.max(NECK, Math.min(SH_X, torsoHalf(Math.max(y, ARMPIT)))), u = Math.min(1, ax / (hw + 6));
      let t = (y < NECK_Y + 1 ? 6 : 9) * Math.sqrt(Math.max(0, 1 - u * u));
      if (y < NECK_Y + 2) t += 2.4 * (1 - sst(0, NECK_Y + 2, y));                      // 脖子往前
      if (y < NECK_Y + 1) t += .8 * Math.exp(-(((ax - (2.5 + (NECK_Y - y) * .45)) / 1.2) ** 2));   // 胸鎖乳突肌
      t -= 1.5 * Math.exp(-(dx * dx) / 4 - ((y - (NECK_Y + 1.5)) / 1.5) ** 2);          // 胸骨上窩
      const clav = NECK_Y + 2 + ax * .04 + Math.sin(ax / 8) * .8 - (ax < 5 ? (5 - ax) * .45 : 0);
      if (ax > 2.5 && ax < SH_X - 3) t += 1.3 * Math.exp(-(((y - clav) / 1.2) ** 2));   // 鎖骨
      t += 1.2 * Math.exp(-(((y - 30) / 8) ** 2)) * sst(2, 7, ax) * (1 - sst(24, 34, ax));   // 上胸
      t += .45 * Math.exp(-(dx * dx) / 6) * (1 - sst(55, 70, y));                        // 胸骨
      t -= .7 * Math.exp(-(dx * dx) / 5) * sst(64, 80, y);                               // 乳房下胸骨溝
      if (ax < ARM_IN) t += .7 * sst(-1.6, 1.6, 74 + ax * .45 - y);                    // 肋弓（倒 V）
      if (y > 62 && ax > 14 && ax < ARM_IN) t += .25 * Math.sin((y - ax * .45) / 2.2) * sst(62, 70, y);   // 肋骨
      // 手臂：兩邊的圓柱，肩膀那段跟身體同一塊，腋下以下分開
      if (inArm || (ax > ARM_IN - 2 && y >= SH_Y)) {
        const aU = (ax - (ARM_IN + SH_X + 2) / 2) / 6.5, armH = 6.5 * Math.sqrt(Math.max(0, 1 - aU * aU)) + 2 + 1 * Math.exp(-(((y - SH_Y - 3) / 6) ** 2));
        const sep = sst(ARMPIT - 12, ARMPIT, y);
        if (armH > t) { t = t + (armH - t) * (.4 + .6 * sep); if (sep > .5 && ax > ARM_IN - .5) arm[i] = 1; }
      }
      h[i] = t;
      // 乳房：上半邊緣平緩（融進胸口）、下半陡（摺痕）；外側半徑大＝外擴、外緣凸出軀幹輪廓
      for (const b of breasts) {
        const bx = (x + .5 - b.x) / b.R, by = (y + .5 - b.y) / b.R, out = bx * b.s;
        const ry = by < 0 ? 1.5 : .98 - .12 * Math.max(0, out), rx = (out > 0 ? 1.15 : .95) + Math.max(0, -by) * .1;
        const e = Math.hypot(bx / rx, by / ry); if (e >= 1) continue;
        const k = sst(-.8, .45, by);
        const v = b.R * hk * 1.15 * Math.pow(1 - e * e, .5 + (1 - k) * 1.3);
        if (v > bump[i]) { bump[i] = v; which[i] = b.s; }
      }
      if (bump[i] > .05) { mask[i] = 1; part[i] = 1; arm[i] = 0; }
      h[i] += bump[i];
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
      fi += ((Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296 - .5) * .25;   // 皮膚微微斑駁（參考圖的質感）
      let idx = Math.round(fi + BAYER[(y & 3) * 4 + (x & 3)] * .55);
      idx = Math.max(0, Math.min(n - 1, idx));
      put(i, part[i] === 3 ? (idx >= 2 ? C.nip : AREOLA[idx + 2]) : pal[idx]);
    }
    return { width: W, height: H, pixels: px, breasts };
  }
  return { draw, CUPS };
});
