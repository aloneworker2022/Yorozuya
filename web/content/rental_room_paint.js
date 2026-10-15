/* 日式主臥室（溫泉旅館，拉開拉門後看到的房間；2026-10-15，照使用者給的參考照片，不要櫃子）。
 * 逐像素：每個像素從眼睛射一條視線，算先碰到房間的哪個面（地板／天花板／正面牆／左右牆）或床（箱子＋枕頭橢球），
 * 再照碰到的位置算材質（木紋、和紙、玻璃外的湖景、壁畫）和光（窗光、嵌燈、地板反光），最後網點量化成像素風。
 * 世界座標（公尺）：x 左右（−2.2～2.2）、y 高（地板 0、天花板 2.5）、z 往裡（正面牆 3.6）。眼睛在 (0.85, 1.45, −0.2)。
 * paintJapaneseRoom(ctx, { night }) → 畫一張（靜態，算一次約 0.2 秒）。 */
import { paintKit as K } from "./rental_entry_paint.js?v=2";
const { hash, fbm, mix, mul, add, clamp01, smooth, put, LW, LH } = K;

const CAM = [1.15, 1.5, -0.95], VP = [97.5, 200], F = 158, YAW = -19 * Math.PI / 180;   // 站在門口外一點、往左轉 19°、鏡頭拉近：整間房（床、壁畫、拉門、湖景）塞滿直式畫面
const ROOM = { x0: -2.2, x1: 2.2, h: 2.5, zb: 3.6 };
// 正面牆的分區（x 公尺）：拉門 −2.2～0.55｜落地門 0.55～1.35｜素牆 1.35～2.2；欄間 y 2.12～2.4
const WALL = { shoji1: 0.55, door1: 1.35, ranma0: 2.12, ranma1: 2.4, top: 2.08 };
const BED = { x0: -2.2, x1: -0.15, z0: 1.05, z1: 2.75, base: 0.28, top: 0.5 };
const PILLOWS = [{ c: [-1.85, 0.58, 1.48], r: [0.22, 0.13, 0.34], col: [70, 130, 128] }, { c: [-1.82, 0.6, 2.25], r: [0.22, 0.14, 0.34], col: [70, 130, 128] },
  { c: [-1.62, 0.57, 1.62], r: [0.18, 0.1, 0.28], col: [176, 206, 214] }];
const LAMPS = [[-1.0, 2.5, 1.4], [1.0, 2.5, 1.4], [-1.0, 2.5, 3.0], [1.0, 2.5, 3.0]];
/** 床頭的落地紙燈（行燈）：晚上主要的暖光。 */
const ANDON = { c: [-1.95, 0.42, 3.05], r: [0.13, 0.3, 0.13] };

// ------------------------------------------------------------ 窗外：天空、遠山、近山、湖、陽台欄杆
function view(x, y, night) {
  // x：牆上的橫向位置（公尺），y：高度
  const hFar = 1.62 + 0.18 * fbm(x * 0.9 + 3, 1.3, 3), hNear = 1.38 + 0.28 * fbm(x * 1.6 + 11, 2.7, 3);
  const lake = 1.06;
  let c;
  if (y > hFar) c = night ? mix([18, 26, 52], [40, 52, 86], clamp01((y - 1.6) / 0.6)) : mix([208, 226, 236], [244, 246, 240], clamp01((2.1 - y) / 0.5));
  else if (y > hNear) c = night ? [22, 30, 40] : mix([132, 162, 150], [160, 186, 176], fbm(x * 4, y * 4, 2));   // 遠山（霧）
  else if (y > lake) {
    const tree = fbm(x * 9, y * 9, 3);
    c = night ? mul([14, 22, 20], 0.8 + 0.4 * tree) : mul([52, 104, 62], 0.72 + 0.5 * tree);                    // 近山（樹）
    if (!night && hash(Math.floor(x * 30), Math.floor(y * 30)) > 0.985) c = [220, 214, 196];                    // 山腰的小屋
  } else {
    const rip = 0.92 + 0.08 * Math.sin(y * 90 + fbm(x * 3, y * 20, 2) * 6);
    c = night ? mul([16, 30, 44], rip) : mul([84, 166, 168], rip * (0.9 + 0.2 * (lake - y)));                   // 湖
    if (night && Math.abs(x - 0.9) < 0.12 * (1.2 - y) && Math.sin(y * 140) > 0.2) c = [200, 196, 150];         // 月光倒影
  }
  if (night && y > 1.95 && Math.hypot(x - 0.95, (y - 2.0) * 1.2) < 0.06) c = [246, 240, 210];                  // 月亮
  // 陽台欄杆（深色）：扶手、中間一條、柱子；陽台地板
  if (y < 0.12) c = night ? [26, 26, 30] : [118, 116, 112];
  else if (Math.abs(y - 0.98) < 0.025 || Math.abs(y - 0.55) < 0.012 || (y < 0.98 && Math.abs(((x + 4) % 0.42) - 0.21) < 0.012)) c = night ? [8, 8, 10] : [36, 36, 40];
  return c;
}

// ------------------------------------------------------------ 材質
function woodGrain(u, v, base, seed = 0) {   // u 沿紋、v 橫紋
  const n = fbm(u * 1.4 + seed, v * 26 + seed * 2, 3), ring = 0.5 + 0.5 * Math.sin(v * 70 + n * 7);
  return mul(base, 0.86 + 0.1 * ring + 0.1 * (n - 0.5));
}
const OAK = [214, 168, 112], OAK_LIGHT = [226, 186, 132], PLASTER = [234, 220, 196], PAPER = [244, 236, 220];

/** 正面牆。回傳 { c, emit }（emit＝自己發光：窗外、和紙透光）。 */
function backWall(x, y, night) {
  const frame = (a, b, w = 0.045) => Math.abs(a - b) < w;
  // 欄間（最上面一排：細框＋和紙，橫三段）
  if (y > WALL.ranma0 && y < WALL.ranma1 && x < WALL.door1 + 0.05) {
    const seg = [-2.2, -1.25, -0.3, WALL.door1 + 0.05];
    const onFrame = y < WALL.ranma0 + 0.04 || y > WALL.ranma1 - 0.04 || seg.some((s) => frame(x, s, 0.03)) || (Math.abs(((x + 4) % 0.32)) < 0.018) || frame(y, 2.26, 0.012);
    return onFrame ? { c: woodGrain(y, x, OAK_LIGHT, 2) } : { c: PAPER, emit: night ? 0.15 : 0.55 };
  }
  if (y > WALL.ranma1 - 0.04 && y < WALL.ranma1 + 0.02) return { c: woodGrain(x, y, OAK, 1) };
  // 拉門（左）：兩扇，粗框；上段和紙（田字格）、中段玻璃（看得到湖）、下段和紙
  if (x < WALL.shoji1 && y < WALL.top) {
    const p0 = [-2.2, -0.82, WALL.shoji1], panel = x < p0[1] ? 0 : 1, a = p0[panel], b = p0[panel + 1];
    const edge = x - a < 0.07 || b - x < 0.07 || y < 0.07 || WALL.top - y < 0.06;
    if (edge) return { c: woodGrain(y, x, OAK_LIGHT, 3 + panel) };
    const glassLo = 0.42, glassHi = 1.5;
    if (y > glassLo && y < glassHi) {
      if (frame(y, glassLo + 0.02, 0.025) || frame(y, glassHi - 0.02, 0.025) || frame(x, (a + b) / 2, 0.02)) return { c: woodGrain(y, x, OAK_LIGHT, 5) };
      // 左邊那扇後面有窗簾（米色、有直摺）
      if (panel === 0 && x < a + 0.55) return { c: mul([226, 206, 190], 0.85 + 0.15 * Math.sin(x * 70)), emit: night ? 0.1 : 0.35 };
      return { c: view(x, y, night), emit: 1 };
    }
    const gx = (x - a) / (b - a) * 3, gy = y > glassHi ? (y - glassHi) / (WALL.top - glassHi) * 2 : y / glassLo * 1;
    if (Math.abs(gx - Math.round(gx)) * (b - a) / 3 < 0.014 || Math.abs(gy - Math.round(gy)) * 0.3 < 0.012) return { c: woodGrain(y, x, OAK_LIGHT, 6) };
    return { c: mul(PAPER, 0.97 + 0.03 * fbm(x * 30, y * 9, 2)), emit: night ? 0.12 : 0.5 };
  }
  // 落地門（中右）：深色細框、整片玻璃
  if (x >= WALL.shoji1 && x < WALL.door1 && y < WALL.top + 0.02) {
    if (x - WALL.shoji1 < 0.05 || WALL.door1 - x < 0.05 || WALL.top - y < 0.05 || frame(x, 0.83, 0.02)) return { c: [52, 52, 56] };
    return { c: view(x, y, night), emit: 1 };
  }
  if (x < WALL.door1 + 0.05 && y >= WALL.top) return { c: woodGrain(x, y, OAK, 7) };   // 拉門上的楣
  // 素牆（原本櫃子的位置）
  return { c: mul(PLASTER, 0.96 + 0.04 * fbm(x * 8, y * 8, 2)) };
}
/** 左牆（x＝−2.2）：米色牆＋山嵐壁畫＋床頭板。u＝z（深度）、v＝y。 */
function leftWall(z, y) {
  if (y > 0.5 && y < 0.92 && z > BED.z0 - 0.05 && z < BED.z1 + 0.05) {   // 床頭板（木）＋上面一排書
    if (y > 0.86) { const b = Math.floor(z * 22); return { c: mul([[150, 60, 50], [60, 90, 120], [200, 180, 140], [90, 110, 70]][b % 4], 0.85 + 0.3 * hash(b, 3)) }; }
    return { c: woodGrain(z, y, [190, 146, 96], 9) };
  }
  let c = mul([236, 222, 196], 0.97 + 0.03 * fbm(z * 6, y * 6, 2));
  if (y > 1.05 && y < 2.05) {   // 壁畫：淡綠山、霧（水墨）
    const ridge1 = 1.3 + 0.22 * fbm(z * 1.8, 5, 3), ridge2 = 1.15 + 0.16 * fbm(z * 2.6 + 4, 8, 3);
    const mist = fbm(z * 3, y * 6, 3);
    if (y < ridge1) c = mix(c, [150, 186, 150], (0.55 - 0.4 * mist) * smooth(ridge1 - 0.25, ridge1, y) + 0.15);
    if (y < ridge2) c = mix(c, [118, 164, 124], 0.5 * (1 - mist));
    c = mix(c, [246, 240, 228], 0.35 * smooth(0.55, 0.8, mist));
  }
  return { c };
}
/** 右牆（x＝2.2）：淺橡木直板＋靠裡面的一扇直條拉門。 */
function rightWall(z, y) {
  if (z > 2.75 && z < 3.4 && y < WALL.top) {
    const edge = z - 2.75 < 0.05 || 3.4 - z < 0.05 || y < 0.06 || WALL.top - y < 0.05;
    const lat = Math.abs(((z - 2.75) % 0.13)) < 0.014 || Math.abs((y % 0.3)) < 0.014;
    return edge || lat ? { c: woodGrain(y, z, OAK_LIGHT, 11) } : { c: PAPER, emit: 0.25 };
  }
  const seam = Math.abs(((z + 10) % 0.46)) < 0.01;
  return { c: mul(woodGrain(y, z, [222, 178, 124], 12), seam ? 0.78 : 1) };
}
function floorTex(x, z) {
  const pw = 0.14, plank = Math.floor((x + 10) / pw), off = hash(plank, 1) * 1.6, joint = Math.abs(((z + off) % 1.6)) < 0.012;
  const gap = Math.abs(((x + 10) % pw)) < 0.006;
  return mul(woodGrain(z, x, mix(OAK, [228, 180, 120], hash(plank, 2) * 0.6), plank), gap || joint ? 0.8 : 1);
}
function ceilingTex(x, z) {
  for (const L of LAMPS) { const d = Math.hypot(x - L[0], z - L[2]); if (d < 0.06) return { c: [255, 246, 220], emit: 2 }; if (d < 0.08) return { c: [200, 196, 190] }; }
  return { c: mul([244, 236, 222], 0.97 + 0.03 * fbm(x * 5, z * 5, 2)) };
}

// ------------------------------------------------------------ 光
/** 窗光（正面牆窗戶那一片，白天強）＋嵌燈（往下的暖光圈）＋環境光。p＝位置、n＝法線。 */
function lighting(p, n, night) {
  const win = [-0.4, 1.2, ROOM.zb];   // 窗戶中心
  const dx = win[0] - p[0], dy = win[1] - p[1], dz = win[2] - p[2], d = Math.hypot(dx, dy, dz) || 1;
  const ndl = Math.max(0, (n[0] * dx + n[1] * dy + n[2] * dz) / d);
  let L = night ? [0.32, 0.27, 0.29] : add([0.58, 0.56, 0.52], mul([0.75, 0.72, 0.64], ndl * Math.min(1.4, 2.6 / (d + 0.6))));
  for (const q of LAMPS) {
    const lx = q[0] - p[0], ly = q[1] - p[1], lz = q[2] - p[2], ld = Math.hypot(lx, ly, lz) || 1;
    const cone = Math.max(0, -ly / ld) ** 2;   // 往下照
    const nl = Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / ld);
    const k = (night ? 2.1 : 0.22) * cone * nl / (0.3 + ld * ld * 0.28);
    L = add(L, mul([1.0, 0.82, 0.58], k));
  }
  {   // 行燈（全方向、很暖）
    const lx = ANDON.c[0] - p[0], ly = ANDON.c[1] - p[1], lz = ANDON.c[2] - p[2], ld = Math.hypot(lx, ly, lz) || 1;
    const nl = Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / ld);
    L = add(L, mul([1.0, 0.7, 0.42], (night ? 1.6 : 0.15) * nl / (0.2 + ld * ld * 0.5)));
  }
  return L;
}
const tint = (c, L) => [c[0] * L[0], c[1] * L[1], c[2] * L[2]];

// ------------------------------------------------------------ 射線
function hitRoom(o, d) {
  let t = Infinity, kind = "";
  const cand = (tt, k) => { if (tt > 1e-4 && tt < t) { t = tt; kind = k; } };
  if (d[1] < 0) cand(-o[1] / d[1], "floor");
  if (d[1] > 0) cand((ROOM.h - o[1]) / d[1], "ceil");
  cand((ROOM.zb - o[2]) / d[2], "back");
  if (d[0] < 0) cand((ROOM.x0 - o[0]) / d[0], "left");
  if (d[0] > 0) cand((ROOM.x1 - o[0]) / d[0], "right");
  return { t, kind };
}
function hitBox(o, d, b) {   // AABB slab → { t, n }
  let tmin = -Infinity, tmax = Infinity, n = null;
  for (const [ax, lo, hi] of [[0, b.x0, b.x1], [1, b.y0, b.y1], [2, b.z0, b.z1]]) {
    if (Math.abs(d[ax]) < 1e-9) { if (o[ax] < lo || o[ax] > hi) return null; continue; }
    let t1 = (lo - o[ax]) / d[ax], t2 = (hi - o[ax]) / d[ax], s = -1;
    if (t1 > t2) { [t1, t2] = [t2, t1]; s = 1; }
    if (t1 > tmin) { tmin = t1; n = [0, 0, 0]; n[ax] = s; }
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0 ? { t: tmin, n } : null;
}
function hitEll(o, d, e) {
  const oc = [(o[0] - e.c[0]) / e.r[0], (o[1] - e.c[1]) / e.r[1], (o[2] - e.c[2]) / e.r[2]], dd = [d[0] / e.r[0], d[1] / e.r[1], d[2] / e.r[2]];
  const a = dd[0] ** 2 + dd[1] ** 2 + dd[2] ** 2, b = 2 * (oc[0] * dd[0] + oc[1] * dd[1] + oc[2] * dd[2]), c = oc[0] ** 2 + oc[1] ** 2 + oc[2] ** 2 - 1;
  const disc = b * b - 4 * a * c; if (disc < 0) return null;
  const t = (-b - Math.sqrt(disc)) / (2 * a); if (t <= 0) return null;
  const p = [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t];
  const n = [(p[0] - e.c[0]) / e.r[0] ** 2, (p[1] - e.c[1]) / e.r[1] ** 2, (p[2] - e.c[2]) / e.r[2] ** 2], nn = Math.hypot(...n);
  return { t, n: n.map((v) => v / nn) };
}

/** 床：底座（木）＋床墊（白）＋床旗（青綠，床尾那段）＋枕頭；托盤＋茶壺。 */
function shadeBed(p, n, night) {
  let c;
  if (p[1] < BED.base + 0.002 && n[1] < 0.5) c = woodGrain(p[0], p[1], [200, 156, 104], 13);
  else {
    const runner = p[0] > -0.95 && p[0] < -0.35;
    c = runner ? mul([84, 132, 120], 0.9 + 0.1 * Math.sin(p[2] * 60) * Math.sin(p[0] * 60)) : mul([246, 244, 238], 0.96 + 0.04 * fbm(p[0] * 8, p[2] * 8, 2));
    if (n[1] < 0.5) c = mul(c, 0.86);   // 側面垂下來那段暗一點
    // 托盤（深色木）＋茶壺（陶）
    if (n[1] > 0.5 && Math.abs(p[0] + 0.66) < 0.16 && Math.abs(p[2] - 1.9) < 0.11) c = [70, 44, 30];
    if (n[1] > 0.5 && Math.hypot(p[0] + 0.7, p[2] - 1.88) < 0.05) c = [150, 120, 96];
  }
  return tint(c, lighting(p, n, night));
}

export function paintJapaneseRoom(g, opts = {}) {
  const night = !!opts.night, img = new ImageData(LW, LH), px = img.data;
  const bed = { x0: BED.x0, x1: BED.x1, y0: 0, y1: BED.top, z0: BED.z0, z1: BED.z1 };
  for (let sy = 0; sy < LH; sy++) for (let sx = 0; sx < LW; sx++) {
    const q = [(sx + 0.5 - VP[0]) / F, -(sy + 0.5 - VP[1]) / F, 1], cy = Math.cos(YAW), sn = Math.sin(YAW);
    const d0 = [q[0] * cy + q[2] * sn, q[1], -q[0] * sn + q[2] * cy], dn = Math.hypot(...d0), d = d0.map((v) => v / dn);
    const o = CAM, r = hitRoom(o, d);
    let best = { t: r.t, kind: r.kind, n: null };
    const hb = hitBox(o, d, bed); if (hb && hb.t < best.t) best = { t: hb.t, kind: "bed", n: hb.n };
    for (const pl of PILLOWS) { const he = hitEll(o, d, pl); if (he && he.t < best.t) best = { t: he.t, kind: "pillow", n: he.n, col: pl.col }; }
    { const ha = hitEll(o, d, ANDON); if (ha && ha.t < best.t) best = { t: ha.t, kind: "andon", n: ha.n }; }
    const p = [o[0] + d[0] * best.t, o[1] + d[1] * best.t, o[2] + d[2] * best.t];
    let c;
    if (best.kind === "andon") {   // 紙燈：自己發光，木框兩條
      const frame = Math.abs(p[1] - ANDON.c[1]) > ANDON.r[1] * 0.85 || Math.abs(Math.atan2(best.n[0], best.n[2])) < 0.12;
      c = frame ? [96, 64, 40] : mul([255, 214, 150], night ? 1.05 : 0.85);
    } else if (best.kind === "bed") c = shadeBed(p, best.n, night);
    else if (best.kind === "pillow") c = tint(mul(best.col, 0.9 + 0.1 * fbm(p[0] * 20, p[2] * 20, 2)), lighting(p, best.n, night));
    else if (best.kind === "floor") {
      c = tint(floorTex(p[0], p[2]), lighting(p, [0, 1, 0], night));
      // 床底下的影子（接觸陰影）
      const inB = p[0] > BED.x0 - 0.06 && p[0] < BED.x1 + 0.08 && p[2] > BED.z0 - 0.08 && p[2] < BED.z1 + 0.06;
      if (inB) c = mul(c, 0.55);
      // 地板亮面反光：把視線往上翻，看會不會打到窗戶
      const rd = [d[0], -d[1], d[2]], tb = (ROOM.zb - p[2]) / rd[2], wx = p[0] + rd[0] * tb, wy = p[1] + rd[1] * tb;
      if (tb > 0 && wy < WALL.top) {
        const w = backWall(wx, wy, night);
        if (w.emit) c = mix(c, w.c, 0.22 * (w.emit > 0.9 ? 1 : w.emit) * (1 - smooth(0.6, 1.8, wy)));
      }
    } else if (best.kind === "ceil") {
      const t = ceilingTex(p[0], p[2]);
      c = t.emit ? t.c : tint(t.c, lighting(p, [0, -1, 0], night));
      for (const L of LAMPS) { const dd = Math.hypot(p[0] - L[0], p[2] - L[2]); c = add(c, mul([255, 220, 170], (night ? 0.7 : 0.18) * Math.exp(-dd / 0.2))); }
    } else if (best.kind === "back") {
      const w = backWall(p[0], p[1], night);
      c = w.emit ? mix(tint(w.c, lighting(p, [0, 0, -1], night)), w.c, Math.min(1, w.emit)) : tint(w.c, lighting(p, [0, 0, -1], night));
    } else if (best.kind === "left") {
      const w = leftWall(p[2], p[1]); c = tint(w.c, lighting(p, [1, 0, 0], night));
    } else {
      const w = rightWall(p[2], p[1]); c = w.emit ? mix(tint(w.c, lighting(p, [-1, 0, 0], night)), w.c, w.emit) : tint(w.c, lighting(p, [-1, 0, 0], night));
    }
    // 角落的環境遮蔽：靠牆角、牆和地板交界暗一點
    if (best.kind !== "bed" && best.kind !== "pillow") {
      const edge = Math.min(p[0] - ROOM.x0, ROOM.x1 - p[0], ROOM.zb - p[2] + 9 * (best.kind === "back" ? 0 : 1), p[1], ROOM.h - p[1]);
      c = mul(c, 0.82 + 0.18 * smooth(0, 0.35, best.kind === "back" ? Math.min(p[0] - ROOM.x0, ROOM.x1 - p[0], p[1], ROOM.h - p[1]) : edge));
    }
    put(px, (sy * LW + sx) * 4, sx, sy, c);
  }
  g.putImageData(img, 0, 0);
}

/** 給浴室等其他房間共用的射線／材質工具。 */
export const roomKit = { hitBox, hitEll, woodGrain, tint };

/** 世界座標 → 畫面座標（把人物放進日式主臥室用）。 */
export function projectJapaneseRoom(x, y, z) {
  const v = [x - CAM[0], y - CAM[1], z - CAM[2]], cy = Math.cos(YAW), sn = Math.sin(YAW);
  const q0 = v[0] * cy - v[2] * sn, q2 = v[0] * sn + v[2] * cy;
  return [VP[0] + F * q0 / q2, VP[1] - F * v[1] / q2];
}
