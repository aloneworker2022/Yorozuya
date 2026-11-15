/* 2026-11-15 胸部模組（2D 像素，第 1 版樣品；還沒接進遊戲）
   取代拆部位的 chest（脖子＋肩＋胸廓）＋ breast 兩塊：直接在 parts2x 的格子裡畫（一格 128×280、K＝2，
   位置對齊 parts2x/walk 的 front／right／left），其他部位（頭、腰、髖、手、腿）照舊疊上來。
   畫法照使用者給的參考：先胸廓再掛乳房；肩膀＝脖子 → 斜方肌斜下 → 肩角；鎖骨中間有凹口；
   乳房外線從腋下的段差開始、往外鼓過胸廓、乳頭那條線最寬、下緣圓、內側往上收、上緣不畫線（斜坡融進胸口）；
   側面：鎖骨下來一條斜坡 → 乳頭 → 下乳飽滿 → 摺進肋骨。
   上色：droom 三階肉色平塗（肉色／陰影／深色），深色只用在輪廓、下乳的摺、乳溝最靠近那一點。
   draw({ cup:'D', dir:'front'|'right'|'left', shade:true, layer:'torso'|'breast' }) → { width, height, pixels }（RGBA，沒畫到的地方透明）。
   目前只有 B／C／D（同一個形狀縮放）、正面＋側面；斜角 4 個方向、背面還沒做。 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Chest2D = api; })(this, function () {
  const W = 128, H = 280, CX = 63.5;
  const SKIN = [242, 204, 177], SHADOW = [216, 166, 140], DARK = [184, 124, 104];
  const AREOLA = [222, 150, 146], NIP = [196, 108, 112];
  // 罩杯：對 D 的倍率（寬、長、乳暈），基準點在腋下段差附近（使用者 11-08 研習的 B／C／D 比例）
  const CUPS = { B: [.86 / 1.12, .8 / 1.2, .85 / 1.15], C: [1 / 1.12, 1 / 1.2, 1 / 1.15], D: [1, 1, 1] };

  // ── 形狀（格子像素；正面 x＝離中線、右半邊，左半邊鏡像）──
  const FRONT = {
    // 胸廓剪影（右半邊，從脖子頂往下到腰；左半邊鏡像）
    torso: [[0, 63], [4, 63], [4, 72], [4.3, 77], [6.5, 80], [10.5, 82.5], [15.5, 84], [20, 85.5], [23.5, 87.5], [25, 90.5], [25, 94],
      [23, 97.5], [19.5, 99.5], [17, 102], [16, 106], [15.6, 110], [15, 114], [13.8, 118], [12.8, 122], [12.6, 125], [0, 125]],
    // 乳房（D，右邊那顆）：腋下段差 → 外側鼓 → 乳頭線最寬 → 下緣 → 內側 → 往上收（上緣斜坡，不畫線）
    breast: [[16.5, 95], [19, 98.5], [20.8, 102], [21.6, 105.5], [21, 109], [18.8, 112.5], [15, 114.8], [10.5, 115.4], [6.2, 113.6],
      [3, 110.5], [1.6, 106.5], [1.8, 103], [3.2, 99.8], [6, 97], [10, 95], [14, 94.4]],
    lineFrom: 0, lineTo: 11,          // 輪廓線只畫 breast[0]～breast[12]（腋下 → 外 → 下 → 內），上緣不畫
    nip: [13.2, 106], areola: 2.3,
    base: [10, 96],                   // 罩杯縮放的基準點
    clavicle: [[1.2, 86.5], [5, 85.6], [10, 85.8], [14.5, 85.2], [17.5, 85.6]],
    armpit: [[16.5, 95], [16.2, 92.5]],   // 腋下段差（三角肌前緣往下一小段）
  };
  const SIDE = {   // 面向右（dir＝right），x 是格子絕對座標
    torso: [[63, 63], [70, 63], [70.5, 72], [70.8, 78], [72.6, 83], [73.6, 86], [74.6, 90], [75, 96], [75, 104], [74.6, 110], [74.2, 114.5],
      [73.6, 119], [73.2, 125], [55, 125], [55.6, 119], [54.6, 112], [54, 104], [54.2, 96], [55.2, 90], [57.4, 84.5], [60.5, 80.5], [62.4, 76], [63, 70]],
    breast: [[73.4, 88.5], [76.5, 92.5], [80.5, 97], [84.5, 101.5], [87.2, 104.6], [87.8, 106.6], [86.8, 109.5], [84.2, 112.6], [80.5, 114.6],
      [76.5, 115.2], [73.6, 114.6], [72.5, 112], [72.5, 100], [72.6, 90]],
    lineFrom: 0, lineTo: 10,
    fold: [[80.5, 114.6], [76.5, 115.2], [73.4, 114.4], [71.6, 113.2]],   // 下乳摺進肋骨
    nip: [87.6, 105.6], base: [74, 92],
    clavicle: [[66.5, 85], [69.5, 84.6], [72, 84.4]],
  };

  function spline(pts, closed, n = 10) {
    const out = [], m = pts.length, P = i => closed ? pts[(i + m) % m] : pts[Math.max(0, Math.min(m - 1, i))];
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    if (!closed) out.push(pts[m - 1]);
    return out;
  }
  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function fillMask(poly) {
    const m = new Uint8Array(W * H);
    let y0 = H, y1 = 0; for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = 0; x < W; x++) if (inPoly(poly, x + .5, y + .5)) m[y * W + x] = 1;
    return m;
  }
  // 1px 線（四捨五入到格子，去掉 L 形轉角）
  function strokePts(poly) {
    const pts = [];
    for (let i = 0; i + 1 < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
      for (let k = 0; k <= n; k++) {
        const p = [Math.floor(x0 + (x1 - x0) * k / n), Math.floor(y0 + (y1 - y0) * k / n)];
        const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p);
      }
    }
    const out = [];
    for (const p of pts) {
      const a = out[out.length - 2];
      if (a && Math.abs(a[0] - p[0]) === 1 && Math.abs(a[1] - p[1]) === 1) out.pop();
      out.push(p);
    }
    return out;
  }

  function draw(opts = {}) {
    const cup = CUPS[(opts.cup || 'D').toUpperCase()] || CUPS.D, dir = opts.dir || 'front', shade = opts.shade !== false;
    const px = new Uint8ClampedArray(W * H * 4), col = new Array(W * H).fill(null), own = new Uint8Array(W * H);   // own：1＝乳房圖層
    let mine = 0;
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { col[y * W + x] = c; if (mine) own[y * W + x] = 1; } };
    const flip = dir === 'left';           // 左＝右的鏡像
    const side = dir === 'right' || dir === 'left';
    const D = side ? SIDE : FRONT;
    const sc = ([x, y]) => [D.base[0] + (x - D.base[0]) * cup[0], D.base[1] + (y - D.base[1]) * cup[1]];
    // 正面：右半邊座標 → 兩邊；側面：直接用
    const toFrame = side ? (p => [p[0], p[1]]) : ((p, s) => [CX + s * p[0], p[1]]);
    const sides = side ? [1] : [1, -1];

    // 1) 胸廓
    let torsoPoly;
    if (side) torsoPoly = spline(D.torso, true, 8);
    else { const r = D.torso, l = r.slice().reverse().map(([x, y]) => [-x, y]); torsoPoly = spline(r.concat(l), true, 8).map(p => toFrame(p, 1)); }
    const sil = fillMask(torsoPoly), bm = new Uint8Array(W * H);
    // 2) 乳房
    const breastPolys = sides.map(s => spline(D.breast.map(sc), true, 10).map(p => toFrame(p, s)));
    for (const bp of breastPolys) { const m = fillMask(bp); for (let i = 0; i < W * H; i++) if (m[i]) { bm[i] = 1; sil[i] = 1; own[i] = 1; } }
    for (let i = 0; i < W * H; i++) if (sil[i]) col[i] = SKIN;

    if (shade) {
      // 乳房下面的影子（胸廓上，乳房下緣往下 2 格）
      for (let y = 1; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!sil[i] || bm[i]) continue;
        if (bm[i - W]) col[i] = SHADOW;
      }
      if (!side) {
        // 乳溝：兩顆內側朝中間那面（乳頭高度最寬、往上變細）＝ Y 字暗部
        const nipY = sc(D.nip)[1];
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          const i = y * W + x; if (!bm[i]) continue;
          const dx = Math.abs(x + .5 - CX), w = y >= nipY ? 3.6 : 3.6 - (nipY - y) * .45;
          if (w > 0 && dx < sc([1.6, 0])[0] + w) col[i] = SHADOW;
        }
      } else {
        // 側面：下乳靠身體那一半的陰影
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (bm[i] && bm[i - W] && !bm[i + W] && x < sc(D.nip)[0] - 2) col[i - W] = SHADOW; }   // 下乳靠下緣一格
      }
    }

    // 3) 線
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {   // 外輪廓
      const i = y * W + x; if (!sil[i]) continue;
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1 || !sil[i - 1] || !sil[i + 1] || !sil[i - W] || (!sil[i + W] && y < 122)) { col[i] = DARK; if (bm[i]) own[i] = 1; }
    }
    for (const s of sides) {   // 乳房輪廓（上緣不畫）
      mine = 1;
      const pts = spline(D.breast.map(sc).slice(D.lineFrom, D.lineTo + 1), false, 10).map(p => toFrame(p, s));
      for (const [x, y] of strokePts(pts)) set(x, y, DARK);
      mine = 0;
      if (D.clavicle) for (const [x, y] of strokePts(spline(D.clavicle, false, 8).map(p => toFrame(p, s)))) set(x, y, SHADOW);
      if (D.armpit) for (const [x, y] of strokePts(D.armpit.map(p => toFrame(p, s)))) set(x, y, SHADOW);
      if (D.fold) for (const [x, y] of strokePts(spline(D.fold.map(sc), false, 8))) set(x, y, DARK);
    }
    if (!side) {
      set(Math.floor(CX), 87, SHADOW); set(Math.ceil(CX), 87, SHADOW);   // 鎖骨中間凹口
      // 乳溝最靠近那一點的深色小塊
      const yC = Math.round(sc(D.nip)[1] + 2); set(Math.floor(CX), yC, DARK); set(Math.ceil(CX), yC, DARK); set(Math.floor(CX), yC + 1, DARK); set(Math.ceil(CX), yC + 1, DARK);
    }
    // 4) 乳暈、乳頭
    mine = 1;
    for (const s of sides) {
      const [nx, ny] = toFrame(sc(D.nip), s), ar = side ? 0 : D.areola * cup[2];
      if (side) { set(Math.floor(nx), Math.floor(ny), NIP); set(Math.floor(nx), Math.floor(ny) + 1, NIP); set(Math.floor(nx) - 1, Math.floor(ny) - 1, AREOLA); set(Math.floor(nx) - 1, Math.floor(ny) + 2, AREOLA); continue; }
      for (let y = Math.floor(ny - ar - 1); y <= ny + ar + 1; y++) for (let x = Math.floor(nx - ar - 1); x <= nx + ar + 1; x++)
        if (Math.hypot(x + .5 - nx, (y + .5 - ny) * 1.1) <= ar + .35) set(x, y, AREOLA);
      set(Math.floor(nx), Math.floor(ny), NIP);
    }
    mine = 0;
    const layer = opts.layer;   // 'torso'＝只胸廓、'breast'＝只乳房（讓手臂可以夾在中間），沒給＝全部

    for (let i = 0; i < W * H; i++) {
      let c = col[i]; if (!c) continue;
      if ((layer === 'torso' && own[i]) || (layer === 'breast' && !own[i])) continue;
      if (flip) { const y = (i / W) | 0, x = i % W, j = y * W + (W - 1 - x); px.set([c[0], c[1], c[2], 255], j * 4); }
      else px.set([c[0], c[1], c[2], 255], i * 4);
    }
    return { width: W, height: H, pixels: px };
  }
  return { draw, CUPS: Object.keys(CUPS), W, H };
});
