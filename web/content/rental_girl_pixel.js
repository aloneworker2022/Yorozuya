/* 旅館房間裡的她：逐像素點陣圖（2026-10-15，使用者：「先加入妹子，使用點陣圖畫」；參考圖只取站姿與比例）。
 * 正面站姿：一手橫過腰、一手橫在胸下；身材照她自己的 look（身高、體型、罩杯、髮型、髮色、陰毛）。臉只有輪廓、不畫五官（使用者）。
 * 做法：身體拆成頭／脖子／軀幹（每個高度一個半寬）／胸／手臂／腿，各自是平滑的 2D 形狀；每個像素算落在哪一層的哪個部位、
 * 那個部位表面的朝向（法線），照左上來的光切成三階膚色，最後描輪廓（層與層交界也描，手臂疊在身上分得出來）。
 * drawGirl(g, { x, footY, h, look, doll, light }) → 直接畫在場景上（x＝腳底中心、footY＝腳底、h＝身高像素）。 */

const HAIR_RGB = {
  烏黑: [40, 30, 34], 深棕: [74, 48, 38], 淺棕: [140, 100, 70], 栗色: [110, 60, 40], 藍黑: [30, 34, 54], 亞麻色: [196, 170, 130],
  蜜金色: [214, 170, 90], 酒紅: [120, 40, 52], 白金色: [232, 220, 190], 灰白: [190, 188, 190], 銀白: [214, 218, 226], 橘紅: [210, 100, 60],
  玫瑰粉: [230, 150, 170], 薰衣草紫: [170, 140, 210], 薄荷綠: [150, 210, 180], 天空藍: [140, 190, 230],
};
const BUILD_F = {   // 肩、胸廓、腰、臀、大腿、小腿、手臂（跟 room_doll.js BUILDS 同一套名字，數值只取寬窄）
  勻稱有致: {}, 骨感清瘦: { sh: .98, chest: .9, waist: .84, hip: .84, thigh: .72, calf: .78, arm: .74 }, 纖細苗條: { sh: .95, chest: .93, waist: .86, hip: .92, thigh: .86, calf: .88, arm: .86 },
  嬌小玲瓏: { sh: .94, waist: .94, hip: .96, thigh: .96, calf: .94, arm: .92 }, 微肉圓潤: { sh: 1.04, chest: 1.1, waist: 1.24, hip: 1.14, thigh: 1.26, calf: 1.16, arm: 1.26 },
  結實緊緻: { sh: 1.05, waist: .94, hip: 1.03, thigh: 1.08, calf: 1.1, arm: 1.04 }, 運動健美: { sh: 1.13, chest: 1.06, waist: .98, thigh: 1.14, calf: 1.18, arm: 1.14 },
  軟肉感有腰: { chest: 1.04, waist: .95, hip: 1.16, thigh: 1.2, calf: 1.06, arm: 1.12 }, 高挑纖長: { sh: .98, waist: .9, hip: .95, thigh: .9, calf: .9, arm: .9 },
  豐滿火辣: { sh: 1.04, chest: 1.08, waist: .98, hip: 1.2, thigh: 1.18, calf: 1.06, arm: 1.06 }, 細腰寬臀: { sh: .97, chest: .98, waist: .8, hip: 1.24, thigh: 1.14 },
  凹凸有致的沙漏身材: { sh: 1.06, chest: 1.05, waist: .78, hip: 1.18, thigh: 1.1 }, 極端腰臀比的漫畫比例: { sh: 1.04, chest: 1.02, waist: .64, hip: 1.34, thigh: 1.22, calf: .98 },
};
const CUPS = "ABCDEFGHI";
const SKIN = { hi: [246, 214, 194], mid: [226, 182, 162], lo: [186, 132, 122], line: [116, 70, 70] };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
/** 錐形膠囊：回傳 { d（<0 在裡面，單位同座標）, nx（橫向 −1～1）, ny } */
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
/** 軀幹：每個高度的半寬（關鍵點內插），回傳形狀。y 在 0（頭頂）～1（腳底）。 */
function torsoHalf(y, F) {
  const K = [[0.155, 0.04], [0.175, 0.075 * F.sh], [0.205, 0.1 * F.sh], [0.25, 0.094 * F.chest], [0.32, 0.08 * lerp(F.chest, F.waist, 0.5)], [0.39, 0.064 * F.waist],
    [0.44, 0.076 * lerp(F.waist, F.hip, 0.6)], [0.49, 0.092 * F.hip], [0.525, 0.094 * F.hip], [0.55, 0.07 * F.hip]];
  if (y < K[0][0] || y > K[K.length - 1][0]) return 0;
  for (let i = 1; i < K.length; i++) if (y <= K[i][0]) { const t = (y - K[i - 1][0]) / (K[i][0] - K[i - 1][0]), s = t * t * (3 - 2 * t); return lerp(K[i - 1][1], K[i][1], s); }
  return 0;
}

/** 這個像素是什麼：回傳 { layer, part, nx, ny } 或 null。layer：0 後髮、1 身體、2 前面的手臂、3 前髮／辮子。 */
function sample(x, y, P) {
  const { F, bust, hair, hairLen } = P;
  let best = null;
  const take = (layer, part, s) => { if (s.d <= 0 && (!best || layer >= best.layer)) best = { layer, part, nx: s.nx, ny: s.ny, d: s.d }; };
  // 0 後髮（身體後面）
  if (hairLen > 0) {
    const end = hairLen, top = 0.04;
    if (y > top && y < end) {
      const t = (y - top) / (end - top), w = (hair === "twin" ? 0 : 0.07 * (1 - 0.25 * t)) + 0.002;
      if (Math.abs(x) < w) take(0, "hair", { d: Math.abs(x) - w, nx: x / w, ny: 0 });
    }
  }
  if (hair === "twin") for (const s of [-1, 1]) take(0, "hair", capsule(x, y, s * 0.06, 0.05, s * 0.095, 0.36, 0.028, 0.012));
  if (hair === "pony_hi" || hair === "pony_lo") take(0, "hair", capsule(x, y, 0.035, hair === "pony_hi" ? 0.02 : 0.1, 0.07, hair === "pony_hi" ? 0.28 : 0.3, 0.026, 0.01));
  if (hair === "bun") take(0, "hair", ellipse(x, y, 0, -0.008, 0.032, 0.026));
  if (hair === "buns") for (const s of [-1, 1]) take(0, "hair", ellipse(x, y, s * 0.045, 0.0, 0.022, 0.02));
  // 1 身體
  take(1, "head", ellipse(x, y, 0, 0.07, 0.048, 0.063));
  take(1, "neck", capsule(x, y, 0, 0.115, 0, 0.165, 0.019, 0.022));
  const hw = torsoHalf(y, F);
  if (hw > 0) take(1, "torso", { d: Math.abs(x) - hw, nx: clamp(x / hw, -1, 1), ny: 0 });
  for (const s of [-1, 1]) take(1, "torso", capsule(x, y, s * 0.03, 0.158, s * 0.1 * F.sh, 0.19, 0.02, 0.026));   // 肩（從脖子斜斜往下，不要方肩）
  for (const s of [-1, 1]) take(1, "bust", ellipse(x, y, s * (0.036 + bust * 0.35) * F.chest, 0.262 + bust * 0.32, bust * 1.04, bust));
  for (const s of [-1, 1]) {   // 腿：大腿→膝→小腿肚→腳踝（右腳 s＝1 稍微往內，重心在左腳）
    const hx = s * 0.046 * F.hip, kx = s * (s > 0 ? 0.026 : 0.034), ax = s * (s > 0 ? 0.022 : 0.032);
    take(1, "leg", capsule(x, y, hx, 0.52, kx, 0.745, 0.054 * F.thigh, 0.029));
    take(1, "leg", capsule(x, y, kx, 0.745, kx + s * 0.004, 0.82, 0.029, 0.032 * F.calf));
    take(1, "leg", capsule(x, y, kx + s * 0.004, 0.82, ax, 0.958, 0.032 * F.calf, 0.016));
    take(1, "leg", ellipse(x, y, ax + s * 0.006, 0.976, 0.02, 0.012));
  }
  for (const s of [-1, 1]) take(1, "arm", capsule(x, y, s * 0.108 * F.sh, 0.19, s * 0.124 * F.sh, 0.345, 0.025 * F.arm, 0.019 * F.arm));   // 上臂（貼著身體）
  // 2 前面的手臂：左手（畫面左）橫過腰、右手橫在胸下扶著左臂
  take(2, "arm", capsule(x, y, -0.124 * F.sh, 0.345, 0.07, 0.392, 0.019 * F.arm, 0.015));
  take(2, "hand", ellipse(x, y, 0.085, 0.392, 0.02, 0.014));
  take(2, "arm", capsule(x, y, 0.124 * F.sh, 0.345, -0.03, 0.336, 0.019 * F.arm, 0.015));
  take(2, "hand", ellipse(x, y, -0.045, 0.34, 0.019, 0.014));
  // 3 前髮：頭頂的髮殼（臉的橢圓挖掉）、鬢角；麻花辮（垂在左肩前）
  const capS = ellipse(x, y, 0, 0.056, 0.061, 0.066);   // 髮量蓬一點，不要貼頭
  const face = ellipse(x, y, 0, 0.085, 0.04, 0.052);
  if (capS.d <= 0 && !(face.d <= 0 && y > 0.045)) take(3, "hair", capS);
  if (hair === "bob" || hair === "medium") for (const s of [-1, 1]) take(3, "hair", capsule(x, y, s * 0.05, 0.06, s * 0.055, hair === "bob" ? 0.13 : 0.17, 0.016, 0.011));
  if (hair === "long" || hair === "waist") for (const s of [-1, 1]) {   // 長髮：兩側各一束從耳後垂到胸前（蓋住一點肩）
    take(3, "hair", capsule(x, y, s * 0.05, 0.06, s * 0.066, 0.17, 0.017, 0.015));
    take(3, "hair", capsule(x, y, s * 0.066, 0.17, s * 0.07, hair === "waist" ? 0.34 : 0.28, 0.015, 0.006));
  }
  if (hair === "braid") {
    for (let i = 0; i < 9; i++) {
      const t = i / 8, cx = lerp(-0.045, -0.062, t) + 0.006 * Math.sin(i * 1.7), cy = lerp(0.1, 0.33, t), r = lerp(0.016, 0.009, t);
      take(3, "braid", ellipse(x, y, cx + (i % 2 ? 0.004 : -0.004), cy, r * 1.15, r));
    }
  }
  return best;
}

/** 名冊 look → 畫她要的參數。 */
export function girlParams(look = {}, doll = null) {
  const F = { sh: 1, chest: 1, waist: 1, hip: 1, thigh: 1, calf: 1, arm: 1, ...(BUILD_F[String(look.build || doll?.build || "").trim()] || {}) };
  const cup = String(doll?.cup || look.cup || "D").trim().charAt(0).toUpperCase(), ci = Math.max(0, CUPS.indexOf(cup));
  const hair = doll?.hair || "long";
  const hairLen = { short: 0, bob: 0.13, medium: 0.2, long: 0.38, waist: 0.5, pony_hi: 0, pony_lo: 0, bun: 0, buns: 0, braid: 0.12, twin: 0 }[hair] ?? 0.3;
  const hc = HAIR_RGB[String(look.hair_color || "").trim()] || HAIR_RGB.深棕;
  const pubic = /剃光|沒有/.test(String(look.pubic_hair || "")) ? 0 : /稀疏/.test(String(look.pubic_hair || "")) ? 1 : /濃密/.test(String(look.pubic_hair || "")) ? 3 : 2;
  return { F, bust: 0.026 + ci * 0.0052, hair, hairLen, hairRGB: hc, pubic, heightCm: Number(doll?.height_cm || look.height_cm) || 160 };
}

/** 畫她。opts：{ x, footY, h（身高像素）, look, doll, light:[r,g,b] 乘數（房間燈色） } */
export function drawGirl(g, opts = {}) {
  const P = girlParams(opts.look || {}, opts.doll || null), H = Math.max(40, Math.round(opts.h || 110)), W = Math.ceil(H * 0.34) + 4;
  const L = opts.light || [1, 1, 1];
  const img = g.getImageData(Math.round(opts.x - W / 2), Math.round(opts.footY - H), W, H + 1), px = img.data;
  const at = (i, j) => { if (i < 0 || j < 0 || i >= W || j > H) return null; return grid[j * W + i]; };
  const grid = new Array(W * (H + 1));
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    const x = (i + 0.5 - W / 2) / H, y = (j + 0.5) / H;
    grid[j * W + i] = sample(x, y, P);
  }
  const hairLo = P.hairRGB.map((v) => v * 0.62), hairHi = P.hairRGB.map((v) => Math.min(255, v * 1.25 + 20));
  for (let j = 0; j <= H; j++) for (let i = 0; i < W; i++) {
    const s = grid[j * W + i]; if (!s) continue;
    const x = (i + 0.5 - W / 2) / H, y = (j + 0.5) / H;
    // 輪廓：旁邊是空的，或旁邊是比較後面的層
    let edge = false;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(i + di, j + dj); if (!n || n.layer < s.layer) { edge = true; break; } }
    const isHair = s.part === "hair" || s.part === "braid";
    let c;
    if (edge) c = isHair ? hairLo.map((v) => v * 0.7) : SKIN.line;
    else {
      // 光從左上：表面朝左上越亮；三階
      const nz = Math.sqrt(Math.max(0, 1 - Math.min(1, s.nx * s.nx + s.ny * s.ny)));
      const lam = -0.6 * s.nx - 0.35 * s.ny + 0.7 * nz;
      if (isHair) c = s.part === "braid" && (j % 3 === 0) ? hairLo : lam > 0.62 ? hairHi : lam > 0.2 ? P.hairRGB : hairLo;
      else {
        c = lam > 0.6 ? SKIN.hi : lam > 0.18 ? SKIN.mid : SKIN.lo;
        if (s.part === "torso") {
          for (const sg of [-1, 1]) {   // 胸下緣的陰影
            const bx = sg * (0.036 + P.bust * 0.35) * P.F.chest, by = 0.262 + P.bust * 0.32;
            if (Math.abs(x - bx) < P.bust * 0.9 && y > by + P.bust * 0.85 && y < by + P.bust * 1.25) c = SKIN.lo;
          }
          if (Math.abs(x) < 0.004 && Math.abs(y - 0.42) < 0.006) c = SKIN.lo;   // 肚臍
          if (P.pubic && Math.abs(x) < 0.006 * (P.pubic + 1) * (1 - (y - 0.505) / 0.04) && y > 0.505 && y < 0.545) c = hairLo;   // 陰毛
          if (Math.abs(x) < 0.0035 && y > 0.53 && y < 0.552) c = SKIN.lo;
        }
        if (s.part === "bust") {   // 乳暈：每邊胸的中下方
          for (const sg of [-1, 1]) {
            const bx = sg * (0.036 + P.bust * 0.35) * P.F.chest + sg * P.bust * 0.12, by = 0.262 + P.bust * 0.32 + P.bust * 0.22;
            if (Math.hypot(x - bx, y - by) < Math.max(0.0055, P.bust * 0.2)) c = [214, 132, 132];
          }
        }
        if (s.part === "head") c = lam > 0.3 ? SKIN.hi : SKIN.mid;   // 臉：只有輪廓，平一點
      }
    }
    const k = (j * W + i) * 4;
    px[k] = Math.min(255, c[0] * L[0]); px[k + 1] = Math.min(255, c[1] * L[1]); px[k + 2] = Math.min(255, c[2] * L[2]); px[k + 3] = 255;
  }
  // 腳下的影子（橢圓、半透明）先畫，再把人疊上去
  g.save(); g.fillStyle = "rgba(0,0,0,.28)"; g.beginPath(); g.ellipse(opts.x, opts.footY, H * 0.12, H * 0.022, 0, 0, 7); g.fill(); g.restore();
  // 只放她自己的像素（背景保留原圖）
  const bg = g.getImageData(Math.round(opts.x - W / 2), Math.round(opts.footY - H), W, H + 1);
  for (let k = 0; k < px.length; k += 4) if (px[k + 3] !== 255 || !grid[k / 4]) { px[k] = bg.data[k]; px[k + 1] = bg.data[k + 1]; px[k + 2] = bg.data[k + 2]; px[k + 3] = bg.data[k + 3]; }
  g.putImageData(img, Math.round(opts.x - W / 2), Math.round(opts.footY - H));
}
