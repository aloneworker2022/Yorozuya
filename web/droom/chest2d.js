/* 2026-11-15 胸部模組（2D 像素，樣品；還沒接進遊戲）
   取代拆部位的 chest（脖子＋肩＋胸廓）＋ breast 兩塊，只畫胸部這一段：直接在 parts2x 的格子裡畫
   （一格 128×280、K＝2，位置對齊 parts2x/walk 的各方向），頭、腰、手、腿是別的模組。
   畫法照使用者給的參考：先胸廓再掛乳房；肩膀＝脖子 → 斜方肌斜下 → 肩角；鎖骨中間有凹口；
   乳房是微微下垂的水滴（不是圓球）：上半是從胸口斜下來的斜坡（上緣不畫線）、重量在下半、最寬在乳頭線下面、
   乳頭在中心偏下、微微朝下；外線從腋下的段差開始、往外鼓過胸廓；側面乳頭凸出輪廓外。
   上色：droom 三階肉色平塗（肉色／陰影／深色），深色只用在輪廓、下乳的摺、乳溝最靠近那一點。
   draw({ cup:'D', dir, shade:true, layer:'torso'|'breast' }) → { width, height, pixels }（RGBA，沒畫到的地方透明）。
   dir：front／front_right／front_left／right／left（背面三個方向還沒做）。cup：B／C／D（同一個形狀縮放）。
   layer：'torso' 只胸廓、'breast' 只乳房（讓手臂可以夾在中間），沒給＝全部。 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Chest2D = api; })(this, function () {
  const W = 128, H = 280, CX = 63.5;
  const SKIN = [242, 204, 177], SHADOW = [216, 166, 140], DARK = [184, 124, 104];
  const AREOLA = [222, 150, 146], NIP = [196, 108, 112];
  // 罩杯：對 D 的倍率（寬、長、乳暈），使用者 11-08 研習的 B／C／D 比例
  const CUPS = { B: [.86 / 1.12, .8 / 1.2, .85 / 1.15], C: [1 / 1.12, 1 / 1.2, 1 / 1.15], D: [1, 1, 1] };
  const mirror = pts => pts.map(([x, y]) => [2 * CX - x, y]);

  // ── 形狀（格子絕對座標；D 罩杯）──
  // 乳房：pts 閉合曲線、line＝[從, 到] 畫輪廓的那一段（上緣斜坡不畫）、nip 乳頭、ar 乳暈半徑（0＝側面看不到）、
  //   out＝側面乳頭往外凸的方向（+1 右、−1 左）、base 罩杯縮放基準點。後面的乳房蓋前面的。
  const FR_BR = [[63.5 + 16.5, 95], [63.5 + 18, 99], [63.5 + 19.8, 103], [63.5 + 21.2, 107], [63.5 + 21.4, 110.2], [63.5 + 20, 113.6], [63.5 + 16.8, 116.3],
    [63.5 + 12.5, 117.2], [63.5 + 8, 116], [63.5 + 4.4, 113], [63.5 + 2.4, 109.5], [63.5 + 2, 106], [63.5 + 2.8, 102.5], [63.5 + 5.5, 99.5], [63.5 + 9.5, 97], [63.5 + 13.5, 95.5]];
  const FRONT_TORSO_R = [[0, 63], [4, 63], [4, 72], [4.3, 77], [6.5, 80], [10.5, 82.5], [15.5, 84], [20, 85.5], [23.5, 87.5], [25, 90.5], [25, 94],
    [23, 97.5], [19.5, 99.5], [17, 102], [16, 106], [15.6, 110], [15, 114], [13.8, 118], [12.8, 122], [12.6, 126], [0, 126]];
  const SHAPES = {
    front: {
      torso: FRONT_TORSO_R.map(([x, y]) => [CX + x, y]).concat(FRONT_TORSO_R.slice().reverse().map(([x, y]) => [CX - x, y])),
      breasts: [
        { pts: FR_BR, line: [0, 12], nip: [CX + 13.4, 108.6], ar: 2.3, base: [CX + 10, 96], cleave: -1 },
        { pts: mirror(FR_BR), line: [0, 12], nip: [CX - 13.4, 108.6], ar: 2.3, base: [CX - 10, 96], cleave: 1 },
      ],
      clavicle: [[[CX + 1.2, 86.5], [CX + 5, 85.6], [CX + 10, 85.8], [CX + 14.5, 85.2], [CX + 17.5, 85.6]], [[CX - 1.2, 86.5], [CX - 5, 85.6], [CX - 10, 85.8], [CX - 14.5, 85.2], [CX - 17.5, 85.6]]],
      armpit: [[[CX + 16.5, 95], [CX + 16.2, 92.5]], [[CX - 16.5, 95], [CX - 16.2, 92.5]]],
      notch: [CX, 87], cleaveDot: [CX, 110.5],
    },
    // 斜前 45°（她轉向畫面右邊）：右邊那顆在遠側、看到側面輪廓凸出胸廓；左邊那顆在近側、比較正面、蓋住遠的那顆內側
    front_right: {
      torso: [[62, 63], [69, 63], [69.5, 72], [70.5, 78], [74, 81], [79, 84], [82, 87], [83.3, 90.5], [82.5, 94], [79, 97], [78, 101], [77.6, 106], [76.6, 110],
        [75, 114], [73.5, 118], [73, 126], [55, 126], [54.5, 118], [52.5, 113], [51, 108], [50.5, 102], [50, 97], [46, 94], [45, 90], [46.5, 87], [50, 84.5],
        [55, 82], [59, 79.5], [61.5, 76], [62, 70]],
      breasts: [
        { pts: [[74.5, 91], [78.5, 96], [82.6, 100.6], [86, 104.4], [87.8, 107.6], [87.6, 110.6], [85.4, 114], [81.8, 116.3], [77.6, 117], [74, 116.2], [71.5, 110], [72, 98]],
          line: [0, 9], nip: [87.8, 108.2], ar: 0, out: 1, base: [76, 96], shadeIn: 79 },
        { pts: [[55.5, 96], [56.6, 100], [57.3, 105], [57.9, 109.6], [59.5, 113.9], [62.6, 116.7], [66.8, 117.3], [70.6, 116], [73.4, 112.8], [74.6, 108.8], [74.4, 104.6],
          [73, 101.5], [69.5, 98.2], [64.5, 96.2], [60, 95.4]], line: [0, 10], nip: [67.6, 108.8], ar: 2.1, arX: .8, base: [62, 96], cleave: 1 },
      ],
      clavicle: [[[66, 86.4], [70, 85.6], [74, 85.4], [77.5, 85.9]], [[64, 86.6], [60, 85.8], [55.5, 85.6], [51.5, 86.2]]],
      armpit: [[[55.5, 95], [55.2, 92.5]]],
      notch: [65, 87],
    },
    // 側面（面向右）
    right: {
      torso: [[63, 63], [70, 63], [70.5, 72], [70.8, 78], [72.6, 83], [73.6, 86], [74.4, 90], [74.8, 96], [75, 104], [74.6, 110], [74.2, 114.5],
        [73.6, 119], [73.2, 126], [55, 126], [55.6, 119], [54.6, 112], [54, 104], [54.2, 96], [55.2, 90], [57.4, 84.5], [60.5, 80.5], [62.4, 76], [63, 70]],
      breasts: [
        { pts: [[73.6, 88], [76.6, 92.2], [79.8, 96.2], [83.4, 100.6], [86.4, 104.6], [87.6, 107.4], [87.2, 110.4], [85, 113.8], [81.4, 116.2], [77.4, 116.9],
          [74.2, 116], [72.4, 112], [72.4, 100], [72.6, 90]], line: [0, 10], nip: [87.6, 107.8], ar: 0, out: 1, base: [74, 92], shadeIn: 80 },
      ],
      fold: [[77.4, 116.9], [74.2, 116], [72, 114.6]],
      clavicle: [[[66.5, 85], [69.5, 84.6], [72, 84.4]]],
    },
  };
  // 左邊的方向＝右邊的鏡像
  const mirShape = s => ({
    torso: mirror(s.torso), breasts: s.breasts.map(b => ({ ...b, pts: mirror(b.pts), nip: mirror([b.nip])[0], base: mirror([b.base])[0], out: b.out && -b.out, cleave: b.cleave && -b.cleave, shadeIn: b.shadeIn && 2 * CX - b.shadeIn })),
    clavicle: s.clavicle && s.clavicle.map(mirror), armpit: s.armpit && s.armpit.map(mirror), fold: s.fold && mirror(s.fold), notch: s.notch && mirror([s.notch])[0], mir: 1,
  });
  SHAPES.front_left = mirShape(SHAPES.front_right);
  SHAPES.left = mirShape(SHAPES.right);

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
  // 1px 線（落到格子，去掉 L 形轉角）
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
    const cup = CUPS[(opts.cup || 'D').toUpperCase()] || CUPS.D, shade = opts.shade !== false, layer = opts.layer;
    const S = SHAPES[opts.dir || 'front'] || SHAPES.front;
    const col = new Array(W * H).fill(null), own = new Uint8Array(W * H);   // own：1＝乳房圖層
    let mine = 0;
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { col[y * W + x] = c; if (mine) own[y * W + x] = 1; } };
    const scl = b => ([x, y]) => [b.base[0] + (x - b.base[0]) * cup[0], b.base[1] + (y - b.base[1]) * cup[1]];

    // 1) 胸廓＋乳房剪影
    const sil = fillMask(spline(S.torso, true, 8)), bm = new Uint8Array(W * H);
    const B = S.breasts.map(b => { const sc = scl(b), poly = spline(b.pts.map(sc), true, 10), m = fillMask(poly); for (let i = 0; i < W * H; i++) if (m[i]) { bm[i] = 1; sil[i] = 1; } return { b, sc, m }; });
    for (let i = 0; i < W * H; i++) if (sil[i]) col[i] = SKIN;
    // 乳房下面的影子（胸廓上，下緣往下 1 格）
    if (shade) for (let i = W; i < W * H; i++) if (sil[i] && !bm[i] && bm[i - W]) col[i] = SHADOW;
    // 外輪廓（底下接腰，不描底邊）
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!sil[i]) continue;
      if (!sil[i - 1] || !sil[i + 1] || (!sil[i - W] && y > 68) || (!sil[i + W] && y < 123)) { col[i] = DARK; if (bm[i]) own[i] = 1; }
    }
    for (const c of S.clavicle || []) for (const [x, y] of strokePts(spline(c, false, 8))) set(x, y, SHADOW);
    for (const c of S.armpit || []) for (const [x, y] of strokePts(c)) set(x, y, SHADOW);
    if (S.notch) { set(Math.floor(S.notch[0]), S.notch[1], SHADOW); set(Math.ceil(S.notch[0] - .01), S.notch[1], SHADOW); }

    // 2) 乳房：一顆一顆疊（後面的蓋前面的）
    mine = 1;
    for (const { b, sc, m } of B) {
      const [nx, ny] = sc(b.nip);
      for (let i = 0; i < W * H; i++) if (m[i]) { col[i] = SKIN; own[i] = 1; }
      if (shade) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!m[i]) continue;
        // 乳溝：內側朝中間那面（乳頭高度最寬、往上變細）
        if (b.cleave) {
          const pts = b.pts.map(sc); let edge = b.cleave > 0 ? Infinity : -Infinity;
          for (const p of spline(pts, true, 10)) if (Math.abs(p[1] - (y + .5)) < .6) edge = b.cleave > 0 ? Math.min(edge, p[0]) : Math.max(edge, p[0]);
          const w = y + .5 >= ny ? 3.2 : 3.2 - (ny - y - .5) * .5, d = b.cleave > 0 ? x + .5 - edge : edge - x - .5;
          if (w > 0 && isFinite(edge) && d >= 0 && d < w) col[i] = SHADOW;
        }
        // 側面：下乳圓底往上一格陰影（不打方塊）
        if (b.shadeIn != null && y + .5 > ny + 2 && !m[i + W] && m[i - W] && (b.out > 0 ? x + .5 < nx - 1 : x + .5 > nx + 1)) col[i] = SHADOW;
      }
      const pts = spline(b.pts.map(sc).slice(b.line[0], b.line[1] + 1), false, 10);
      for (const [x, y] of strokePts(pts)) set(x, y, DARK);
      // 乳暈、乳頭
      if (b.ar) {
        const ar = b.ar * cup[2], ax = b.arX || 1;
        for (let y = Math.floor(ny - ar - 1); y <= ny + ar + 1; y++) for (let x = Math.floor(nx - ar - 1); x <= nx + ar + 1; x++)
          if (Math.hypot((x + .5 - nx) / ax, (y + .5 - ny) * 1.1) <= ar + .35) set(x, y, AREOLA);
        set(Math.floor(nx), Math.floor(ny), NIP);
      } else {
        // 側面：乳頭凸出輪廓外 2 格、微微朝下；乳暈是輪廓裡上下各一格
        const fx = Math.floor(nx), fy = Math.floor(ny), o = b.out;
        for (const [dx, dy] of [[1, 0], [2, 0], [1, 1], [2, 1]]) set(fx + o * dx, fy + dy, NIP);
        set(fx, fy - 1, AREOLA); set(fx, fy + 2, AREOLA); set(fx - o, fy - 1, AREOLA); set(fx - o, fy + 2, AREOLA);
      }
    }
    if (S.fold) for (const [x, y] of strokePts(spline(S.fold.map(scl(S.breasts[0])), false, 8))) set(x, y, DARK);
    if (shade && S.cleaveDot) { const [x, y] = scl(S.breasts[0])(S.cleaveDot); for (const dx of [-.5, .5]) for (const dy of [0, 1]) set(Math.floor(x + dx), Math.floor(y) + dy, DARK); }
    mine = 0;

    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const c = col[i]; if (!c) continue;
      if ((layer === 'torso' && own[i]) || (layer === 'breast' && !own[i])) continue;
      px.set([c[0], c[1], c[2], 255], i * 4);
    }
    return { width: W, height: H, pixels: px };
  }
  return { draw, CUPS: Object.keys(CUPS), DIRS: Object.keys(SHAPES), W, H };
});
