/* 旅館房間裡的她：逐像素點陣圖（2026-10-15 使用者：「先加入妹子，使用點陣圖畫」；v2 照使用者給的幾張參考學畫風）。
 * v2 學到的（只取身體畫法與上色，不照抄任何角色；遊戲裡一律成年人）：
 *  ①比例：頭大一點、肩窄而斜、腰收細、骨盆寬、大腿粗而併攏、腿長；肚子柔軟的弧、肚臍一條線。
 *  ②胸：超出身體兩側（側乳）、罩杯越大越下垂成水滴形（上緣斜、下緣飽滿）、下緣摺線陰影、乳溝線。
 *  ③上色：賽璐璐四階（陰影偏暖紅）、亮面高光（胸／大腿／臀／肩）、背光邊一圈亮邊、輪廓用深紅褐不用黑。
 *  ④頭髮：髮量、頭頂一圈光澤（天使環）、長髮分縷。
 *  ⑤姿勢：三道彎——重心在一隻腳、髖往那邊推、另一邊膝蓋往內；一手橫在胸下托著、一手垂在大腿邊。
 * 臉只有輪廓、不畫五官（使用者）。
 * drawGirl(g, { x, footY, h, look, doll, light }) → 直接畫在場景上（x＝腳底中心、footY＝腳底、h＝身高像素）。 */

const HAIR_RGB = {
  烏黑: [40, 30, 34], 深棕: [84, 52, 40], 淺棕: [146, 104, 72], 栗色: [116, 62, 42], 藍黑: [34, 38, 62], 亞麻色: [200, 174, 132],
  蜜金色: [220, 176, 96], 酒紅: [128, 42, 56], 白金色: [234, 222, 194], 灰白: [196, 194, 198], 銀白: [218, 222, 230], 橘紅: [214, 104, 62],
  玫瑰粉: [234, 154, 176], 薰衣草紫: [172, 142, 214], 薄荷綠: [152, 212, 184], 天空藍: [142, 192, 232],
};
const BUILD_F = {   // 肩、胸廓、腰、臀、大腿、小腿、手臂（名字跟 room_doll.js BUILDS 一樣）
  勻稱有致: {}, 骨感清瘦: { sh: .98, chest: .9, waist: .84, hip: .84, thigh: .72, calf: .78, arm: .74 }, 纖細苗條: { sh: .95, chest: .93, waist: .86, hip: .92, thigh: .86, calf: .88, arm: .86 },
  嬌小玲瓏: { sh: .94, waist: .94, hip: .96, thigh: .96, calf: .94, arm: .92 }, 微肉圓潤: { sh: 1.04, chest: 1.1, waist: 1.24, hip: 1.14, thigh: 1.26, calf: 1.16, arm: 1.26, belly: 1 },
  結實緊緻: { sh: 1.05, waist: .94, hip: 1.03, thigh: 1.08, calf: 1.1, arm: 1.04 }, 運動健美: { sh: 1.13, chest: 1.06, waist: .98, thigh: 1.14, calf: 1.18, arm: 1.14 },
  軟肉感有腰: { chest: 1.04, waist: .95, hip: 1.16, thigh: 1.2, calf: 1.06, arm: 1.12, belly: .5 }, 高挑纖長: { sh: .98, waist: .9, hip: .95, thigh: .9, calf: .9, arm: .9 },
  豐滿火辣: { sh: 1.04, chest: 1.08, waist: .98, hip: 1.2, thigh: 1.18, calf: 1.06, arm: 1.06 }, 細腰寬臀: { sh: .97, chest: .98, waist: .8, hip: 1.24, thigh: 1.14 },
  凹凸有致的沙漏身材: { sh: 1.06, chest: 1.05, waist: .78, hip: 1.18, thigh: 1.1 }, 極端腰臀比的漫畫比例: { sh: 1.04, chest: 1.02, waist: .64, hip: 1.34, thigh: 1.22, calf: .98 },
};
const CUPS = "ABCDEFGHI";
// 膚色四階（陰影偏暖紅）＋高光＋輪廓（深紅褐）
const SKIN = { spec: [255, 244, 236], hi: [255, 226, 210], mid: [246, 196, 178], lo: [222, 150, 140], deep: [186, 108, 108], line: [146, 74, 76], rim: [255, 214, 200] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function capsule(x, y, ax, ay, bx, by, ra, rb) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1e-9;
  const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), px = ax + dx * t, py = ay + dy * t, r = lerp(ra, rb, t);
  const ex = x - px, ey = y - py, d = Math.hypot(ex, ey);
  return { d: d - r, nx: ex / r, ny: ey / r };
}
function ellipse(x, y, cx, cy, rx, ry) {
  const ux = (x - cx) / rx, uy = (y - cy) / ry, k = Math.hypot(ux, uy);
  return { d: (k - 1) * Math.min(rx, ry), nx: ux, ny: uy };
}
/** 水滴形乳房：上半是拉長的橢圓（上緣斜）、下半飽滿；sag 越大越往下垂。 */
function breast(x, y, cx, cy, r, sag) {
  const up = y < cy, ry = up ? r * (1.15 + 0.5 * sag) : r * (0.95 + 0.08 * sag), rx = r * (1.04 + 0.06 * sag) * (up ? 1 - 0.18 * sag * clamp((cy - y) / ry, 0, 1) : 1);
  return ellipse(x, y, cx, cy, rx, ry);
}

/** 姿勢：重心在畫面右腳（s＝1）。sway(y)：身體中線的左右偏移——髖往右推、肩往左回，三道彎。 */
const HIP_SHIFT = 0.016;
function sway(y) { return HIP_SHIFT * sstep(0.28, 0.5, y) - 0.006 * (1 - sstep(0.16, 0.3, y)) - HIP_SHIFT * 0.35 * sstep(0.62, 0.95, y); }
/** 軀幹每個高度的半寬（關鍵點內插）。 */
function torsoHalf(y, F) {
  const K = [[0.148, 0.03], [0.168, 0.06 * F.sh], [0.198, 0.088 * F.sh], [0.24, 0.083 * F.chest], [0.31, 0.068 * lerp(F.chest, F.waist, 0.55)], [0.375, 0.054 * F.waist],
    [0.43, 0.072 * lerp(F.waist, F.hip, 0.65) + 0.006 * (F.belly || 0)], [0.48, 0.096 * F.hip], [0.515, 0.1 * F.hip], [0.548, 0.078 * F.hip]];
  if (y < K[0][0] || y > K[K.length - 1][0]) return 0;
  for (let i = 1; i < K.length; i++) if (y <= K[i][0]) { const t = (y - K[i - 1][0]) / (K[i][0] - K[i - 1][0]), s = t * t * (3 - 2 * t); return lerp(K[i - 1][1], K[i][1], s); }
  return 0;
}
/** 胸的中心與半徑（兩邊）。 */
function bustGeo(P) {
  const r = P.bust, sag = P.sag, cy = 0.248 + r * (0.62 + 0.55 * sag), dx = (0.022 + r * 0.92) * P.F.chest;
  return { r, sag, cy, cx: [sway(cy) - dx, sway(cy) + dx] };
}

/** 這個像素是什麼：{ layer, part, nx, ny }。layer：0 後髮、1 身體、2 胸、3 前面的手臂、4 前髮。 */
function sample(x, y, P) {
  const { F, hair, hairLen } = P;
  let best = null;
  const take = (layer, part, s) => { if (s.d <= 0 && (!best || layer >= best.layer)) best = { layer, part, nx: s.nx, ny: s.ny, d: s.d }; };
  const hx = sway(0.07);
  // 0 後髮
  if (hairLen > 0) {
    const top = 0.03, end = hairLen;
    if (y > top && y < end) { const t = (y - top) / (end - top), w = 0.074 * (1 - 0.2 * t) + 0.012 * Math.sin(t * 3); const cx = hx + sway(y) * 0.3; if (Math.abs(x - cx) < w) take(0, "hairB", { d: Math.abs(x - cx) - w, nx: (x - cx) / w, ny: 0 }); }
  }
  if (hair === "twin") for (const s of [-1, 1]) take(0, "hairB", capsule(x, y, hx + s * 0.062, 0.05, hx + s * 0.1, 0.36, 0.03, 0.012));
  if (hair === "pony_hi" || hair === "pony_lo") take(0, "hairB", capsule(x, y, hx + 0.036, hair === "pony_hi" ? 0.02 : 0.1, hx + 0.074, hair === "pony_hi" ? 0.3 : 0.32, 0.028, 0.01));
  if (hair === "bun") take(0, "hairB", ellipse(x, y, hx, -0.01, 0.034, 0.028));
  if (hair === "buns") for (const s of [-1, 1]) take(0, "hairB", ellipse(x, y, hx + s * 0.048, -0.002, 0.024, 0.022));
  // 1 身體
  take(1, "head", ellipse(x, y, hx, 0.072, 0.05, 0.066));
  take(1, "neck", capsule(x, y, hx, 0.12, sway(0.16), 0.162, 0.016, 0.019));
  const hw = torsoHalf(y, F), cx = sway(y);
  if (hw > 0) take(1, "torso", { d: Math.abs(x - cx) - hw, nx: clamp((x - cx) / hw, -1, 1), ny: 0 });
  for (const s of [-1, 1]) take(1, "torso", capsule(x, y, sway(0.16) + s * 0.024, 0.156, sway(0.19) + s * 0.086 * F.sh, 0.192, 0.018, 0.024));   // 斜肩
  // 腿：右腳（s＝1）是重心腳、直；左腳膝蓋往內、腳往外一點
  for (const s of [-1, 1]) {
    const hipX = sway(0.52) + s * 0.05 * F.hip, kx = s > 0 ? sway(0.73) + 0.03 : sway(0.73) - 0.012, ax = s > 0 ? sway(0.95) + 0.026 : sway(0.95) - 0.05;
    take(1, s > 0 ? "legR" : "legL", capsule(x, y, hipX, 0.52, kx, 0.735, 0.062 * F.thigh, 0.03));
    take(1, s > 0 ? "legR" : "legL", capsule(x, y, kx, 0.735, kx + (ax - kx) * 0.3, 0.81, 0.03, 0.033 * F.calf));
    take(1, s > 0 ? "legR" : "legL", capsule(x, y, kx + (ax - kx) * 0.3, 0.81, ax, 0.958, 0.033 * F.calf, 0.015));
    take(1, s > 0 ? "legR" : "legL", ellipse(x, y, ax + s * 0.006, 0.977, 0.021, 0.012));
  }
  // 畫面左手：垂在身側、手停在大腿邊
  const shL = [sway(0.19) - 0.09 * F.sh, 0.195], elL = [sway(0.35) - 0.105 * F.sh, 0.35], wrL = [sway(0.5) - 0.11 * F.hip, 0.5];
  take(1, "arm", capsule(x, y, shL[0], shL[1], elL[0], elL[1], 0.024 * F.arm, 0.018 * F.arm));
  take(1, "arm", capsule(x, y, elL[0], elL[1], wrL[0], wrL[1], 0.018 * F.arm, 0.013));
  take(1, "hand", ellipse(x, y, wrL[0] + 0.004, wrL[1] + 0.022, 0.016, 0.026));
  // 2 胸（另外一層，超出身體兩側；兩邊之間描乳溝線）
  const B = bustGeo(P);
  take(2, "bustL", breast(x, y, B.cx[0], B.cy, B.r, B.sag));
  take(2, "bustR", breast(x, y, B.cx[1], B.cy, B.r, B.sag));
  // 3 畫面右手：上臂貼身、前臂橫在胸下托著
  const shR = [sway(0.19) + 0.09 * F.sh, 0.195], elR = [sway(0.34) + 0.108 * F.sh, 0.345], wrR = [B.cx[0] - B.r * 0.4, B.cy + B.r * 1.0];
  take(3, "arm", capsule(x, y, shR[0], shR[1], elR[0], elR[1], 0.024 * F.arm, 0.018 * F.arm));
  take(3, "arm", capsule(x, y, elR[0], elR[1], wrR[0], wrR[1], 0.018 * F.arm, 0.014));
  take(3, "hand", ellipse(x, y, wrR[0] - 0.012, wrR[1] - 0.004, 0.024, 0.014));
  // 4 前髮：頭頂髮殼（挖掉臉）、鬢角、長髮兩束到胸前、麻花辮
  const capS = ellipse(x, y, hx, 0.056, 0.064, 0.068), face = ellipse(x, y, hx, 0.088, 0.041, 0.054);
  if (capS.d <= 0 && !(face.d <= 0 && y > 0.046)) take(4, "hair", capS);
  if (hair === "bob" || hair === "medium") for (const s of [-1, 1]) take(4, "hair", capsule(x, y, hx + s * 0.053, 0.06, hx + s * 0.058, hair === "bob" ? 0.132 : 0.18, 0.017, 0.012));
  if (hair === "long" || hair === "waist") for (const s of [-1, 1]) {
    take(4, "hair", capsule(x, y, hx + s * 0.053, 0.06, hx + s * 0.07, 0.17, 0.018, 0.016));
    take(4, "hair", capsule(x, y, hx + s * 0.07, 0.17, hx + s * (0.078 + 0.01 * s), hair === "waist" ? 0.36 : 0.29, 0.016, 0.006));
  }
  if (hair === "braid") for (let i = 0; i < 9; i++) {
    const t = i / 8, bx = hx + lerp(-0.048, -0.072, t) + 0.005 * Math.sin(i * 1.7), by = lerp(0.1, 0.33, t), r = lerp(0.017, 0.009, t);
    take(4, "braid", ellipse(x, y, bx + (i % 2 ? 0.004 : -0.004), by, r * 1.15, r));
  }
  return best;
}

/** 名冊 look → 畫她要的參數。 */
export function girlParams(look = {}, doll = null) {
  const F = { sh: 1, chest: 1, waist: 1, hip: 1, thigh: 1, calf: 1, arm: 1, belly: 0, ...(BUILD_F[String(look.build || doll?.build || "").trim()] || {}) };
  const cup = String(doll?.cup || look.cup || "D").trim().charAt(0).toUpperCase(), ci = Math.max(0, CUPS.indexOf(cup));
  const hair = doll?.hair || "long";
  const hairLen = { short: 0, bob: 0.135, medium: 0.21, long: 0.4, waist: 0.52, pony_hi: 0, pony_lo: 0, bun: 0, buns: 0, braid: 0.12, twin: 0 }[hair] ?? 0.3;
  const hc = HAIR_RGB[String(look.hair_color || "").trim()] || HAIR_RGB.深棕;
  const ph = String(look.pubic_hair || ""), pubic = /剃光|沒有/.test(ph) ? 0 : /稀疏/.test(ph) ? 1 : /濃密/.test(ph) ? 3 : 2;
  const soft = /微肉|軟肉|豐滿|漫畫/.test(String(look.build || doll?.build || "")) ? 0.25 : 0;
  return { F, bust: 0.027 + ci * 0.0062, sag: clamp(ci / 8 * 0.85 + soft, 0, 1), hair, hairLen, hairRGB: hc, pubic, heightCm: Number(doll?.height_cm || look.height_cm) || 160 };
}

/** 畫她。opts：{ x, footY, h（身高像素）, look, doll, light:[r,g,b] 乘數（房間燈色） } */
export function drawGirl(g, opts = {}) {
  const P = girlParams(opts.look || {}, opts.doll || null), H = Math.max(40, Math.round(opts.h || 110)), W = Math.ceil(H * 0.36) + 6;
  const L = opts.light || [1, 1, 1], X0 = Math.round(opts.x - W / 2), Y0 = Math.round(opts.footY - H);
  const grid = new Array(W * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) grid[j * W + i] = sample((i + 0.5 - W / 2) / H, (j + 0.5) / H, P);
  const at = (i, j) => (i < 0 || j < 0 || i >= W || j > H ? null : grid[j * W + i]);
  const hairLo = P.hairRGB.map((v) => v * 0.6), hairHi = P.hairRGB.map((v) => Math.min(255, v * 1.3 + 26)), hairLine = P.hairRGB.map((v) => v * 0.38);
  const B = bustGeo(P);
  const joins = new Set(["torso|neck", "neck|torso", "torso|head", "head|neck", "neck|head", "torso|legL", "legL|torso", "torso|legR", "legR|torso", "arm|hand", "hand|arm"]);   // 這些部位接成一塊、不描線
  // 腳下的影子
  g.save(); g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(opts.x, opts.footY, H * 0.13, H * 0.024, 0, 0, 7); g.fill(); g.restore();
  const img = g.getImageData(X0, Y0, W, H + 1), px = img.data;
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    const s = grid[j * W + i]; if (!s) continue;
    const x = (i + 0.5 - W / 2) / H, y = (j + 0.5) / H;
    const isHair = s.part.startsWith("hair") || s.part === "braid";
    // 輪廓：旁邊空、比較後面的層、或同層不同部位（乳溝、兩腿之間、手臂和身體）
    let edge = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = at(i + di, j + dj);
      // 胸的上半部順著胸口長出來，不描線（只描下緣、外側、乳溝）
      if (n && s.part.startsWith("bust") && n.part === "torso" && y < B.cy + B.r * 0.1) continue;
      if (!n || n.layer < s.layer) { edge = true; break; }
      if (n.layer === s.layer && n.part !== s.part) {
        const nHair = n.part.startsWith("hair") || n.part === "braid";
        if (!(isHair && nHair) && !joins.has(`${s.part}|${n.part}`)) { edge = true; break; }
      }
    }
    let c;
    if (edge) c = isHair ? hairLine : SKIN.line;
    else {
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, s.nx * s.nx + s.ny * s.ny)));
      const lam = -0.58 * s.nx - 0.38 * s.ny + 0.72 * nz;   // 光從左上前方
      if (isHair) {
        c = lam > 0.6 ? hairHi : lam > 0.15 ? P.hairRGB : hairLo;
        if (s.part === "hair" && Math.abs(y - 0.03 - Math.abs(x - sway(0.07)) * 0.6) < 0.006 && lam > 0) c = hairHi;   // 天使環
        if (s.part === "hairB" && i % 4 === 0) c = hairLo;   // 長髮分縷
        if (s.part === "braid" && j % 3 === 0) c = hairLo;
      } else {
        c = lam > 0.7 ? SKIN.hi : lam > 0.36 ? SKIN.mid : lam > 0.05 ? SKIN.lo : SKIN.deep;
        if (s.nx > 0.86 && !s.part.startsWith("bust")) c = SKIN.rim;   // 背光邊一圈亮
        if (lam > 0.9 && (s.part.startsWith("bust") || s.part.startsWith("leg") || (s.part === "torso" && y > 0.45))) c = SKIN.spec;   // 亮面高光
        if (s.part === "torso") {
          for (const bx of B.cx) if (Math.abs(x - bx) < B.r * 0.95 && y > B.cy + B.r * 0.88 && y < B.cy + B.r * 1.25) c = SKIN.lo;   // 胸下摺線的陰影
          const mx = sway(y);
          if (Math.abs(x - mx) < 0.003 && y > 0.4 && y < 0.428) c = SKIN.lo;   // 肚臍
          if (Math.abs(x - mx) < 0.0025 && y > 0.3 && y < 0.37) c = SKIN.mid;   // 腹部中線（淡）
          if (P.pubic && y > 0.505 && y < 0.545 && Math.abs(x - mx) < 0.007 * (P.pubic + 1) * (1 - (y - 0.505) / 0.045)) c = hairLo;
          if (Math.abs(x - mx) < 0.003 && y > 0.53 && y < 0.552) c = SKIN.deep;
          if (y > 0.18 && y < 0.19 && Math.abs(Math.abs(x - mx) - 0.03) < 0.018) c = SKIN.lo;   // 鎖骨
        }
        if (s.part.startsWith("bust")) {   // 乳暈（每邊胸的中下、往外一點）
          const k = s.part === "bustL" ? 0 : 1, ax = B.cx[k] + (k ? 1 : -1) * B.r * 0.12, ay = B.cy + B.r * (0.25 + 0.15 * B.sag);
          const d = Math.hypot(x - ax, y - ay);
          if (d < Math.max(0.006, B.r * 0.22)) c = d < Math.max(0.003, B.r * 0.08) ? [206, 110, 120] : [232, 150, 150];
        }
        if (s.part === "head") c = lam > 0.25 ? SKIN.hi : SKIN.mid;   // 臉：只有輪廓
        if (s.part === "head" && y > 0.098 && y < 0.11 && Math.abs(Math.abs(x - sway(0.07)) - 0.025) < 0.009) c = [250, 196, 190];   // 臉頰一點紅暈
      }
    }
    const k = (j * W + i) * 4;
    px[k] = Math.min(255, c[0] * L[0]); px[k + 1] = Math.min(255, c[1] * L[1]); px[k + 2] = Math.min(255, c[2] * L[2]); px[k + 3] = 255;
  }
  g.putImageData(img, X0, Y0);
}
