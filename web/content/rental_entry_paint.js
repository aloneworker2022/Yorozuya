/* 旅館玄關・逐像素繪製（2026-10-15 試作，使用者選「方法 1」：不拼方塊，一個像素一個像素算顏色）。
 * 每個區域是一個「材質函式」：木紋／灰泥／和紙／石地用雜訊做紋理，光線用距離衰減（拉門透光、燈籠暖光），
 * 透視用消失點，最後用 4×4 Bayer 網點收成像素風。靜態部分算一次存起來，會動的（紙後燈光呼吸、人影）每格只重算拉門那塊。
 * paintRyokan(ctx, t) → 畫一格。 */
const LW = 195, LH = 422;

// ------------------------------------------------------------ 工具：雜訊、混色、網點
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, y, o = 3) { let s = 0, a = .5, f = 1; for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f); a *= .5; f *= 2; } return s / (1 - .5 ** o); }
const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const add = (c, d) => [c[0] + d[0], c[1] + d[1], c[2] + d[2]];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
/** 量化到每通道 12 階＋網點：像素畫的顆粒感，漸層不會變成色帶。 */
function put(px, i, x, y, c) {
  const d = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - .5) * (255 / 12);
  for (let k = 0; k < 3; k++) { const v = c[k] + d; px[i + k] = Math.max(0, Math.min(255, Math.round(v / (255 / 12)) * (255 / 12))); }
  px[i + 3] = 255;
}

// ------------------------------------------------------------ 日式拉門（溫泉旅館玄關）
// 版面（邏輯像素）：天花板 0–60｜欄間 60–78｜鴨居 78–84｜拉門 84–258｜敷居 258–262｜架高木地板 262–282｜上框 282–292｜土間 292–
const RY = { vpX: 97, vpY: 190, wl: 22, wr: 173, top: 60, shTop: 84, shBot: 258, flTop: 262, step: 282, doma: 292 };
const SHOJI = { x0: 26, x1: 169, y0: 88, y1: 254, seams: [62, 97, 133] };

/** 光：拉門透出的暖光（從紙面往外衰減）＋左邊燈籠。回傳暖光量（0～1+）。 */
function lightAt(x, y, breathe = 1) {
  const sx = Math.max(SHOJI.x0, Math.min(SHOJI.x1, x)), sy = Math.max(SHOJI.y0, Math.min(SHOJI.y1, y));
  const ds = Math.hypot(x - sx, (y - sy) * .8);
  const shoji = .95 * breathe * Math.exp(-ds / 46);
  const dl = Math.hypot(x - 9, y - 150);
  const lantern = .55 * Math.exp(-dl / 34);
  return shoji + lantern;
}
const WARM = [255, 196, 120], AMB = .16;
function lit(base, x, y, breathe, ao = 1) {
  const L = lightAt(x, y, breathe);
  const k = (AMB + L) * ao;
  return mix(mul(base, k), mul([base[0] * WARM[0] / 255, base[1] * WARM[1] / 255, base[2] * WARM[2] / 255], k * 1.25), clamp01(L));
}
/** 木紋：沿 dir（'h' 橫紋／'v' 直紋）拉長的雜訊＋年輪條紋。 */
function wood(x, y, dir, base, seed = 0) {
  const [u, v] = dir === "h" ? [x, y] : [y, x];
  const n = fbm(u * .05 + seed, v * .6 + seed * 3, 3);
  const ring = .5 + .5 * Math.sin(v * 1.7 + n * 9 + seed);
  return mul(base, .78 + .22 * ring + .12 * (n - .5));
}

/** 人影（紙上）：頭＋脖子＋肩的柔邊剪影。回傳 0～1 遮蔽量。 */
function silhouette(x, y, cx, cy, s, lean, hair = 0) {
  // 頭（橢圓，往 lean 那邊歪）＋脖子＋肩膀到胸口（上窄下寬的梯形，肩頭圓）；hair＞0：頭後面多一片垂下的長髮
  const hx = cx + lean, hy = cy;
  const head = Math.hypot((x - hx) / (7.2 * s), (y - hy) / (8.8 * s));
  const neckD = (Math.abs(x - (hx * .6 + cx * .4)) / (3.4 * s)) + (y < hy + 6 * s || y > hy + 15 * s ? 9 : 0);
  const top = hy + 13 * s, ty = (y - top) / (40 * s);
  const half = (15 + 9 * Math.min(1, Math.max(0, ty)) ** .5) * s, round = ty < .12 ? Math.hypot((Math.abs(x - cx) - (half - 6 * s)) / (6 * s), (y - top - 6 * s) / (6 * s)) : 0;
  const torso = ty < 0 ? 9 : ty < .12 && Math.abs(x - cx) > half - 6 * s ? round : Math.abs(x - cx) / half;
  const hairD = hair ? Math.hypot((x - (hx - lean * .3 - 3 * s)) / (8 * s), (y - (hy + 14 * s)) / (16 * s)) : 9;
  const d = Math.min(head, neckD, torso, hairD);
  return 1 - smooth(.8, 1.12, d);   // 紙是透光的 → 邊緣是糊的
}

function ryokanStatic(px) {
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    const i = (y * LW + x) * 4;
    let c;
    // 側牆的邊界（透視）：天花板邊 (0,0)→(wl,top)、地板邊 (wl,flTop)→(0,step)
    const leftEdge = y < RY.top ? RY.wl * (y / RY.top) : y > RY.flTop ? RY.wl * (1 - (y - RY.flTop) / (RY.step - RY.flTop)) : RY.wl;
    const rightEdge = LW - leftEdge;
    if (y < RY.top && x > leftEdge && x < rightEdge) {
      // 天花板：杉木板，板縫往消失點收
      const ang = Math.atan2(x - RY.vpX, RY.vpY - y), board = Math.floor(ang * 9 + 20);
      const seam = Math.abs(((ang * 9 + 20) % 1)) < .07 ? .55 : 1;
      c = mul(wood(ang * 300, y, "h", [92, 66, 46], board), seam);
      c = lit(c, x, y, 1, .55 + .45 * (y / RY.top));
    } else if (y >= RY.flTop && y < RY.step && x >= leftEdge - 1 && x <= rightEdge + 1) {
      // 架高的木地板（磨亮，反射拉門光：直條光暈）
      const dep = (y - RY.flTop) / (RY.step - RY.flTop), wx = RY.vpX + (x - RY.vpX) / (.86 + .14 * dep);
      c = wood(wx, y * 3, "h", [120, 80, 50], 2);
      const refl = Math.exp(-(((wx - 97) / 60) ** 2)) * (1 - dep) * .55;
      c = add(lit(c, x, y, 1), mul([255, 210, 150], refl * .5));
    } else if (y >= RY.step && y < RY.doma) {
      // 上框：一整根磨亮的櫸木，上緣一條反光
      c = wood(x, y, "h", [132, 88, 54], 5);
      if (y === RY.step) c = mix(c, [255, 220, 170], .55);
      if (y === RY.doma - 1) c = mul(c, .45);
      c = lit(c, x, y, 1, .9);
    } else if (y >= RY.doma) {
      // 土間：灰黑的石地（雜訊石塊＋縫）＋往下變暗
      // 石板：抖動格點的 Voronoi，算最近兩點的距離差 → 石縫；每塊石頭自己的色調
      const sx = x / 22, sy = (y - RY.doma) / 13;
      let d1 = 9, d2 = 9, id = 0;
      for (let gy = Math.floor(sy) - 1; gy <= Math.floor(sy) + 1; gy++) for (let gx = Math.floor(sx) - 1; gx <= Math.floor(sx) + 1; gx++) {
        const px2 = gx + .2 + .6 * hash(gx, gy), py2 = gy + .2 + .6 * hash(gy + 31, gx + 7), d = Math.hypot((sx - px2) * 1.0, (sy - py2) * 1.0);
        if (d < d1) { d2 = d1; d1 = d; id = hash(gx * 3 + 1, gy * 5 + 2); } else if (d < d2) d2 = d;
      }
      const grout = smooth(.03, .09, d2 - d1);
      const n = fbm(x * .2, y * .2, 3);
      c = mix([34, 32, 30], mul([84 + 22 * id, 80 + 18 * id, 74 + 14 * id], .8 + .35 * n - .25 * d1), grout);
      c = lit(c, x, y, 1, 1 - .5 * smooth(RY.doma, LH, y));
    } else if (x <= leftEdge || x >= rightEdge) {
      // 側牆：土牆（聚樂壁，細顆粒）＋柱子
      const pillar = (x > leftEdge - 6 && x <= leftEdge) || (x >= rightEdge && x < rightEdge + 6);
      c = pillar ? wood(x, y, "v", [70, 48, 32], 7) : mul([150, 120, 88], .7 + .3 * fbm(x * .7, y * .7, 2));
      c = lit(c, x, y, 1, pillar ? .8 : .7);
    } else if (y < RY.shTop) {
      // 欄間（雕花透光）＋鴨居
      if (y >= RY.shTop - 6) c = lit(wood(x, y, "h", [96, 64, 40], 3), x, y, 1, .8);
      else {
        // 欄間：細竹條直排，條與條之間透出房裡的光（中間亮、兩端暗）
        const inner = x > SHOJI.x0 + 2 && x < SHOJI.x1 - 2 && y > RY.top + 2 && y < RY.shTop - 8;
        const slat = (x % 4) < 2;
        const bright = 1 - .55 * ((x - 97) / 72) ** 2;
        c = inner && !slat ? mul([236, 184, 112], .55 + .45 * bright) : lit(wood(x, y, inner ? "v" : "h", [88, 60, 38], 4), x, y, 1, inner ? .95 : .75);
      }
    } else {
      // 拉門那一塊：框＋紙在 ryokanShoji 每格畫；這裡只畫外框的木頭與敷居
      c = lit(wood(x, y, "v", [86, 58, 38], 6), x, y, 1, .85);
      if (y >= RY.shBot) c = lit(wood(x, y, "h", [104, 70, 44], 8), x, y, 1, .8);
    }
    put(px, i, x, y, c);
  }
  // 燈籠（行燈）：左牆上的紙燈，自己發光
  for (let y = 138; y < 166; y++) for (let x = 2; x < 17; x++) {
    const i = (y * LW + x) * 4, e = Math.hypot((x - 9) / 7.5, (y - 152) / 14);
    if (e > 1) continue;
    const frame = (y === 138 || y === 165 || x === 9) ? .5 : 1;
    put(px, i, x, y, mul([255, 206, 140], (1.05 - .35 * e) * frame));
  }
  // 拖鞋：架高地板上排好兩雙（旅館的）、土間上兩雙鞋（她的紅高跟鞋擺整齊、他的皮鞋亂丟）
  const blob = (cx, cy, rx, ry, col, rot = 0, shine = 0) => {
    for (let y = Math.floor(cy - ry - 2); y <= cy + ry + 2; y++) for (let x = Math.floor(cx - rx - 2); x <= cx + rx + 2; x++) {
      if (x < 0 || y < 0 || x >= LW || y >= LH) continue;
      const dx = x - cx, dy = y - cy, ux = dx * Math.cos(rot) + dy * Math.sin(rot), uy = -dx * Math.sin(rot) + dy * Math.cos(rot);
      const e = (ux / rx) ** 2 + (uy / ry) ** 2;
      const i = (y * LW + x) * 4;
      if (e <= 1) put(px, i, x, y, lit(add(col, mul([255, 230, 200], shine * Math.max(0, -uy / ry) * .5)), x, y, 1, .95));
      else if (e < 1.6 && dy > 0) { for (let k = 0; k < 3; k++) px[i + k] *= .72; }   // 落在地上的影子
    }
  };
  blob(78, 272, 7, 3, [176, 150, 120]); blob(92, 272, 7, 3, [176, 150, 120]);          // 旅館拖鞋
  blob(108, 272, 7, 3, [176, 150, 120]); blob(122, 272, 7, 3, [176, 150, 120]);
  blob(70, 306, 6, 2.6, [150, 34, 52], .1, 1); blob(84, 307, 6, 2.6, [150, 34, 52], .05, 1);   // 她的高跟鞋（併攏）
  put(px, (309 * LW + 74) * 4, 74, 309, [90, 20, 30]); put(px, (310 * LW + 88) * 4, 88, 310, [90, 20, 30]);   // 鞋跟
  blob(112, 312, 10, 4, [70, 46, 34], .45, 1.2); blob(134, 318, 10, 4, [70, 46, 34], -.3, 1.2);   // 他的皮鞋（亂丟）
}

/** 拉門（每格重畫）：紙面背光＋格子（細木條，有陰影面）＋門框＋兩個人影。 */
function ryokanShoji(px, t) {
  const breathe = .93 + .07 * Math.sin(t / 900) + .02 * Math.sin(t / 233);
  const sway = Math.sin(t / 1400), sway2 = Math.sin(t / 1900 + 1);
  for (let y = RY.shTop; y < RY.shBot; y++) for (let x = RY.wl + 1; x < RY.wr; x++) {
    const i = (y * LW + x) * 4;
    const inPaper = x > SHOJI.x0 && x < SHOJI.x1 && y > SHOJI.y0 && y < SHOJI.y1;
    let c;
    if (!inPaper) { c = lit(wood(x, y, "v", [86, 58, 38], 6), x, y, breathe, .85); put(px, i, x, y, c); continue; }
    // 門與門的接縫（框）
    const seam = SHOJI.seams.some((s) => Math.abs(x - s) <= 1.5);
    if (seam) { const edge = SHOJI.seams.some((s) => x - s === -1.5 || x - s === -1) ? 1.15 : .9; put(px, i, x, y, lit(wood(x, y, "v", [96, 64, 40], 6), x, y, breathe, edge)); continue; }
    // 格子：每扇 3 直 × 8 橫（組子），細、有亮面和暗面
    const panel = x < SHOJI.seams[0] ? 0 : x < SHOJI.seams[1] ? 1 : x < SHOJI.seams[2] ? 2 : 3;
    const p0 = [SHOJI.x0, ...SHOJI.seams][panel], p1 = [...SHOJI.seams, SHOJI.x1][panel], pw = p1 - p0;
    const kx = ((x - p0) / pw) * 3, ky = ((y - SHOJI.y0) / (SHOJI.y1 - SHOJI.y0)) * 8;
    const onV = Math.abs(kx - Math.round(kx)) * pw / 3 < .8 && Math.round(kx) > 0 && Math.round(kx) < 3;
    const onH = Math.abs(ky - Math.round(ky)) * (SHOJI.y1 - SHOJI.y0) / 8 < .8 && Math.round(ky) > 0 && Math.round(ky) < 8;
    if (onV || onH) { put(px, i, x, y, lit([70, 48, 30], x, y, breathe, .9)); continue; }
    // 紙：背後的燈（中間亮、四角暗）＋和紙纖維
    const cx = (x - 97) / 80, cy = (y - 160) / 110;
    let glow = (1.05 - .45 * (cx * cx + cy * cy)) * breathe;
    const fiber = .94 + .06 * fbm(x * .9, y * .25, 2);
    // 人影：她（左、略低，頭往他那邊靠）、他（右、高，身體往她傾）
    const her = silhouette(x, y, 106 + 1.2 * sway, 158, .95, 3.5 + 1.5 * sway, 1);   // 她：長髮、頭往他那邊靠
    const him = silhouette(x, y, 136 - 1.0 * sway2, 144, 1.12, -4 - 2 * sway2);
    const shade = SHOW_SILHOUETTES ? Math.max(her * .48, him * .56) : 0;
    glow *= 1 - shade;
    c = mul([250, 214, 160], glow * fiber);
    c = mix(c, [110, 70, 48], shade * .35);
    put(px, i, x, y, c);
  }
  // 引手（把手凹槽）
  for (const hx of [59, 100]) for (let y = 166; y < 178; y++) put(px, (y * LW + hx) * 4, hx, y, [58, 40, 26]);
  // 房名木牌
  return breathe;
}

/** 紙後人影：2026-10-15 使用者「人影先不用」→ 關掉（程式留著）。 */
const SHOW_SILHOUETTES = false;
let cacheStatic = null;
/** 畫一格日式拉門玄關。room＝房名（例「桜の間」）。 */
export function paintRyokan(g, t = 0, room = "桜の間") {
  if (!cacheStatic) { cacheStatic = new ImageData(LW, LH); ryokanStatic(cacheStatic.data); }
  const img = new ImageData(new Uint8ClampedArray(cacheStatic.data), LW, LH);
  ryokanShoji(img.data, t);
  g.putImageData(img, 0, 0);
  // 房名木牌（文字用 canvas 寫，掛在鴨居上）
  g.fillStyle = "#5a3c26"; g.fillRect(83, 64, 30, 12); g.fillStyle = "#7a5436"; g.fillRect(83, 64, 30, 1);
  g.fillStyle = "#f2dcb4"; g.font = "8px sans-serif"; g.textAlign = "center"; g.fillText(room, 98, 73);
}

/** 給其他場景共用（日式房間等）。 */
export const paintKit = { hash, vnoise, fbm, mix, mul, add, clamp01, smooth, put, LW, LH };
