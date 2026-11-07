/* 溫泉旅館的浴室（日式主臥室按 > 過來；2026-10-15，照使用者給的參考照片）。
 * 逐像素光線追蹤（同 rental_room_paint.js）：正面米色大磁磚牆＋淋浴滑桿與蓮蓬頭＋下段洞石牆與石台（擺備品）＋水龍頭；
 * 左邊檜木條長凳、地上排水溝；中間檜木浴凳；右邊白色浴缸包紅褐大理石（白紋）＋前面一階大理石踏階、浴缸邊搭毛巾和海綿；
 * 右上天花板間接燈的暖光。世界座標（公尺）：x −1.6～1.6、y 0～2.4、正面牆 z＝2.6。
 * paintBathroom(ctx, { night }) → 畫一張（靜態）。 */
import { paintKit as K } from "./rental_entry_paint.js?v=2";
import { roomKit as RK } from "./rental_room_paint.js?v=3";
const { hash, fbm, mix, mul, add, clamp01, smooth, put, LW, LH } = K;
const { hitBox, hitEll, woodGrain, tint } = RK;

const CAM = [0.05, 1.45, 0.05], VP = [97.5, 158], F = 128;   // 站在浴室門口：整面牆＋長凳＋浴缸都在畫面裡
const ROOM = { x0: -1.6, x1: 1.6, h: 2.4, zb: 2.6 };
const HINOKI = [222, 190, 140], TILE = [206, 188, 160], FLOOR = [214, 202, 182];
// 物件（箱子）
const BOXES = [
  { k: "lower", x0: -1.6, x1: 0.78, y0: 0, y1: 0.86, z0: 2.47, z1: 2.6 },          // 下段洞石牆（凸出一點）
  { k: "ledge", x0: -1.6, x1: 0.82, y0: 0.86, y1: 0.92, z0: 2.4, z1: 2.6 },         // 石台
  { k: "tub", x0: 0.42, x1: 1.6, y0: 0, y1: 0.64, z0: 1.62, z1: 2.6 },              // 浴缸外圍（大理石）
  { k: "step", x0: 0.22, x1: 1.6, y0: 0, y1: 0.22, z0: 1.12, z1: 1.62 },            // 踏階
  { k: "bench", x0: -1.6, x1: -1.02, y0: 0.4, y1: 0.46, z0: 0.0, z1: 2.3 },          // 長凳椅面
  { k: "benchLeg", x0: -1.1, x1: -1.04, y0: 0, y1: 0.4, z0: 0.35, z1: 0.42 },
  { k: "benchLeg", x0: -1.1, x1: -1.04, y0: 0, y1: 0.4, z0: 2.1, z1: 2.17 },
  { k: "benchRail", x0: -1.1, x1: -1.04, y0: 0.12, y1: 0.17, z0: 0.35, z1: 2.17 },
  { k: "stool", x0: -0.24, x1: 0.18, y0: 0.27, y1: 0.31, z0: 2.08, z1: 2.32 },      // 浴凳椅面
  { k: "stoolLeg", x0: -0.24, x1: -0.2, y0: 0, y1: 0.27, z0: 2.08, z1: 2.32 },
  { k: "stoolLeg", x0: 0.14, x1: 0.18, y0: 0, y1: 0.27, z0: 2.08, z1: 2.32 },
  { k: "towel", x0: 0.62, x1: 1.02, y0: 0.64, y1: 0.69, z0: 1.6, z1: 1.86 },        // 毛巾（搭在浴缸前緣）
  { k: "towelHang", x0: 0.62, x1: 1.02, y0: 0.4, y1: 0.69, z0: 1.58, z1: 1.62 },
  { k: "bar", x0: 0.04, x1: 0.08, y0: 1.08, y1: 1.92, z0: 2.55, z1: 2.6 },          // 淋浴滑桿
  { k: "mixer", x0: -0.12, x1: 0.18, y0: 0.66, y1: 0.72, z0: 2.4, z1: 2.47 },       // 水龍頭
  { k: "bottle", x0: -0.36, x1: -0.31, y0: 0.92, y1: 1.02, z0: 2.46, z1: 2.51 },     // 備品三瓶
  { k: "bottle", x0: -0.29, x1: -0.24, y0: 0.92, y1: 1.02, z0: 2.46, z1: 2.51 },
  { k: "bottle", x0: -0.22, x1: -0.17, y0: 0.92, y1: 1.02, z0: 2.46, z1: 2.51 },
];
const ELLS = [
  { k: "head", c: [0.06, 1.74, 2.48], r: [0.07, 0.07, 0.03] },                     // 蓮蓬頭
  { k: "sponge", c: [0.86, 0.73, 1.74], r: [0.1, 0.05, 0.07] },                     // 海綿
  { k: "soap", c: [0.06, 1.28, 2.53], r: [0.06, 0.02, 0.05] },                      // 皂盤
];
const TUB_IN = { x0: 0.56, x1: 1.5, z0: 1.76, z1: 2.5 };   // 浴缸內緣（白）

// ------------------------------------------------------------ 材質
function tileWall(u, v, w = 0.6, h = 0.3) {   // 大磁磚：u 橫、v 高
  const row = Math.floor(v / h), off = row % 2 ? w / 2 : 0;
  const gu = Math.abs((((u + off + 10) % w) + w) % w), gv = Math.abs(((v + 10) % h));
  const grout = gu < 0.006 || gv < 0.006;
  const grain = 0.94 + 0.05 * fbm(u * 3, v * 40, 2) + 0.03 * fbm(u * 20, v * 20, 2);
  return mul(grout ? [176, 160, 136] : TILE, grout ? 1 : grain);
}
function travertine(u, v) {   // 洞石：米白、橫紋、小孔
  let c = mul([214, 204, 186], 0.94 + 0.06 * fbm(u * 2, v * 30, 3));
  if (hash(Math.floor(u * 90), Math.floor(v * 90)) > 0.965) c = mul(c, 0.78);
  return c;
}
function marble(u, v, seed = 0) {   // 紅褐大理石＋白紋
  const n = fbm(u * 3 + seed, v * 3 + seed, 4);
  const vein = Math.abs(Math.sin((u * 1.4 + v * 0.9 + n * 3.2) * 2.4));
  let c = mul([92, 40, 38], 0.8 + 0.3 * fbm(u * 4, v * 4, 3));   // 深酒紅褐，不要太紅
  c = mix(c, [204, 186, 178], (1 - smooth(0.02, 0.1, vein)) * 0.7);
  return c;
}
function floorTile(x, z) {
  const s = 0.6, gu = Math.abs((((x + 10) % s) + s) % s), gv = Math.abs((((z + 10) % s) + s) % s);
  return gu < 0.006 || gv < 0.006 ? [178, 166, 146] : mul(FLOOR, 0.95 + 0.05 * fbm(x * 6, z * 6, 2));
}
function slats(x, z) {   // 長凳椅面：橫的檜木條
  const gap = Math.abs((((z + 10) % 0.07) + 0.07) % 0.07) < 0.016;
  return gap ? null : woodGrain(x, z, HINOKI, 4);
}

// ------------------------------------------------------------ 光：間接燈（右上，暖）＋頂燈＋環境
const COVE = [1.55, 2.38, 1.3];
function lighting(p, n) {
  let L = [0.42, 0.38, 0.33];
  const lx = COVE[0] - p[0], ly = COVE[1] - p[1], lz = COVE[2] - p[2], ld = Math.hypot(lx, ly, lz) || 1;
  L = add(L, mul([1.0, 0.78, 0.5], 1.4 * Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / ld) / (0.4 + ld * ld * 0.35)));
  const tx = 0 - p[0], ty = 2.4 - p[1], tz = 1.2 - p[2], td = Math.hypot(tx, ty, tz) || 1;
  L = add(L, mul([0.95, 0.86, 0.72], 0.75 * Math.max(0, (n[0] * tx + n[1] * ty + n[2] * tz) / td) / (0.5 + td * td * 0.25)));
  return L;
}

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

function shadeHit(kind, p, n, d) {
  const L = lighting(p, n);
  switch (kind) {
    case "floor": {
      let c = floorTile(p[0], p[2]);
      if (p[0] > -0.98 && p[0] < -0.86 && p[2] > 0.5 && p[2] < 1.9) c = (Math.abs(((p[2] * 40) % 1)) < 0.4) ? [60, 58, 56] : [120, 116, 110];   // 排水溝蓋
      // 接觸陰影：長凳、浴缸、踏階、浴凳底下
      const near = (b, m) => p[0] > b.x0 - m && p[0] < b.x1 + m && p[2] > b.z0 - m && p[2] < b.z1 + m;
      if (near({ x0: -1.6, x1: -1.02, z0: 0, z1: 2.3 }, 0.05)) c = mul(c, 0.7);
      if (near({ x0: 0.22, x1: 1.6, z0: 1.12, z1: 2.6 }, 0.05)) c = mul(c, 0.75);
      if (near({ x0: -0.24, x1: 0.18, z0: 2.08, z1: 2.32 }, 0.04)) c = mul(c, 0.72);
      return tint(c, L);
    }
    case "ceil": {
      let c = mul([236, 228, 214], 1.25);   // 天花板：燈在上面照不到自己，用反射回來的光補亮
      if (Math.abs(p[0] - 0.4) < 0.14 && Math.abs(p[2] - 2.0) < 0.12) c = (Math.abs(((p[0] * 30) % 1)) < 0.5) ? [150, 146, 140] : [214, 210, 204];   // 抽風扇
      const cove = p[0] > 1.35 ? smooth(1.35, 1.6, p[0]) : 0;   // 間接燈那條
      return add(mul(c, 0.78 + 0.18 * smooth(-1.6, 1.6, p[0])), mul([255, 214, 150], 0.9 * cove));   // 天花板不套光（燈在上面照不到自己），越靠間接燈越亮
    }
    case "back": return tint(tileWall(p[0], p[1]), L);
    case "left": return tint(tileWall(p[2], p[1]), L);
    case "right": return add(tint(tileWall(p[2], p[1]), L), mul([255, 200, 130], 0.5 * smooth(1.6, 2.38, p[1])));   // 右牆上面被間接燈打亮
    case "lower": return tint(travertine(n[2] ? p[0] : p[2], p[1]), L);
    case "ledge": return tint(mul([228, 218, 200], n[1] > 0.5 ? 1.06 : 0.92), L);
    case "tub": {
      if (n[1] > 0.5) {
        if (p[0] > TUB_IN.x0 && p[0] < TUB_IN.x1 && p[2] > TUB_IN.z0 && p[2] < TUB_IN.z1) {   // 浴缸裡面（白、往裡面暗）
          const e = Math.min(p[0] - TUB_IN.x0, TUB_IN.x1 - p[0], p[2] - TUB_IN.z0, TUB_IN.z1 - p[2]);
          return tint(mul([240, 240, 236], 0.72 + 0.28 * smooth(0, 0.12, e)), L);
        }
        if (p[0] > TUB_IN.x0 - 0.06 && p[0] < TUB_IN.x1 + 0.06 && p[2] > TUB_IN.z0 - 0.06 && p[2] < TUB_IN.z1 + 0.06) return tint([246, 246, 242], L);   // 白色缸緣
        if (Math.abs(p[0] - 1.2) < 0.04 && Math.abs(p[2] - 2.52) < 0.03) return [210, 214, 220];   // 水龍頭
        return tint(marble(p[0], p[2], 1), L);
      }
      return tint(marble(n[0] ? p[2] : p[0], p[1], n[0] ? 3 : 2), L);
    }
    case "step": return tint(marble(n[1] > 0.5 ? p[0] : (n[0] ? p[2] : p[0]), n[1] > 0.5 ? p[2] : p[1], 5), L);
    case "bench": { const c = n[1] > 0.5 ? slats(p[0], p[2]) : woodGrain(p[2], p[1], HINOKI, 6); return c ? tint(c, L) : null; }
    case "benchLeg": case "benchRail": case "stoolLeg": return tint(woodGrain(p[1], p[0], mul(HINOKI, 0.92), 7), L);
    case "stool": return tint(woodGrain(p[0], p[2], HINOKI, 8), L);
    case "towel": case "towelHang": return tint(mul([248, 248, 246], 0.92 + 0.08 * Math.sin((p[0] + p[2]) * 120)), L);
    case "bar": case "mixer": return add(tint([170, 176, 184], L), mul([255, 255, 255], 0.25 * Math.max(0, n[0])));
    case "bottle": return tint([60, 56, 52], L);
    case "head": return add(tint([190, 196, 204], L), mul([255, 255, 255], 0.3 * Math.max(0, -n[2])));
    case "soap": return tint([200, 204, 210], L);
    case "sponge": return tint([238, 214, 120], L);
  }
  return [255, 0, 255];
}

export function paintBathroom(g) {
  const img = new ImageData(LW, LH), px = img.data;
  for (let sy = 0; sy < LH; sy++) for (let sx = 0; sx < LW; sx++) {
    const d0 = [(sx + 0.5 - VP[0]) / F, -(sy + 0.5 - VP[1]) / F, 1], dn = Math.hypot(...d0), d = d0.map((v) => v / dn), o = CAM;
    const r = hitRoom(o, d);
    const hits = [{ t: r.t, kind: r.kind, n: null }];
    for (const b of BOXES) { const h = hitBox(o, d, b); if (h) hits.push({ t: h.t, kind: b.k, n: h.n }); }
    for (const e of ELLS) { const h = hitEll(o, d, e); if (h) hits.push({ t: h.t, kind: e.k, n: h.n }); }
    hits.sort((a, b) => a.t - b.t);
    let c = null;
    for (const h of hits) {   // 長凳的條縫要看穿到下面 → 回傳 null 就看下一個
      const p = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t];
      const n = h.n || ({ floor: [0, 1, 0], ceil: [0, -1, 0], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] })[h.kind];
      c = shadeHit(h.kind, p, n, d);
      if (c) {
        if (["floor", "ceil", "back", "left", "right"].includes(h.kind)) {   // 牆角暗一點
          const e = Math.min(p[0] - ROOM.x0, ROOM.x1 - p[0], p[1], ROOM.h - p[1], h.kind === "back" ? 9 : ROOM.zb - p[2]);
          c = mul(c, 0.84 + 0.16 * smooth(0, 0.3, e));
        }
        break;
      }
    }
    put(px, (sy * LW + sx) * 4, sx, sy, c || [0, 0, 0]);
  }
  g.putImageData(img, 0, 0);
  // 蓮蓬頭的水管：從滑桿上的蓮蓬頭垂下來、繞一圈接到水龍頭（投影到畫面上用線畫）
  const P = (x, y, z) => [VP[0] + F * (x - CAM[0]) / (z - CAM[2]), VP[1] - F * (y - CAM[1]) / (z - CAM[2])];
  const pts = [[0.07, 1.66, 2.47], [0.16, 1.2, 2.42], [0.22, 0.6, 2.36], [0.2, 0.32, 2.3], [0.12, 0.3, 2.34], [0.08, 0.5, 2.4], [0.04, 0.68, 2.43]].map((q) => P(...q));
  g.strokeStyle = "#b4bac2"; g.lineWidth = 1; g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; g.quadraticCurveTo(pts[i][0], pts[i][1], m[0], m[1]); }
  g.lineTo(pts[pts.length - 1][0], pts[pts.length - 1][1]); g.stroke();
}
