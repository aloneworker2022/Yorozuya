/* 旅館（hotel）／汽車旅館（motel）的玄關、主臥室、浴室（2026-10-15；使用者：照溫泉旅館的做法做另外兩種）。
 * 都用 rental_scene.js 的逐像素光線追蹤。每個 export 回傳一張畫好的 canvas（靜態），玄關另外有 anim(g, t, P) 疊動畫。 */
import { render, project, lightAt, tiles, marble, damask, tufted, woodGrain, tint, fbm, hash, mix, mul, add, smooth, clamp01 } from "./rental_scene.js?v=2";

const B = (k, x0, x1, y0, y1, z0, z1, extra = {}) => ({ k, x0, x1, y0, y1, z0, z1, ...extra });
const inR = (p, x0, x1, y0, y1) => p[0] > x0 && p[0] < x1 && p[1] > y0 && p[1] < y1;

// ================================================================ 旅館：玄關（走廊盡頭的房門）
export function hotelDoorScene(room = "305") {
  const amb = [0.3, 0.24, 0.32];
  const lights = [{ p: [0, 2.48, 1.5], col: [1, 0.82, 0.6], k: 2.4, down: true }, { p: [0, 2.48, 2.7], col: [1, 0.82, 0.6], k: 2.2, down: true },
    { p: [0, 0.05, 3.1], col: [1, 0.7, 0.45], k: 0.35, fall: 2.2 }];   // 門縫透出的光（貼地）
  const S = {
    cam: [0, 1.5, 0.75], vp: [97.5, 200], f: 165, room: { x0: -0.95, x1: 0.95, h: 2.5, zb: 3.2 },
    boxes: [
      B("frame", -0.53, 0.53, 0, 2.18, 3.16, 3.2), B("door", -0.46, 0.46, 0, 2.1, 3.13, 3.17), B("plate", -0.13, 0.13, 2.24, 2.36, 3.17, 3.2),
      B("lampBox", 0.62, 0.76, 1.48, 1.72, 3.17, 3.2), B("lock", 0.3, 0.37, 0.94, 1.16, 3.11, 3.13), B("handle", 0.24, 0.42, 0.98, 1.01, 3.08, 3.13),
      B("dnd", 0.28, 0.37, 0.72, 0.93, 3.1, 3.11),
    ],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      if (k === "floor") {   // 酒紅地毯＋金色菱形
        const u = p[0] * 5, v = p[2] * 5, m = Math.abs(((u + v) % 1 + 1) % 1 - 0.5) + Math.abs(((u - v) % 1 + 1) % 1 - 0.5);
        let c = mul([96, 30, 46], 0.9 + 0.1 * fbm(p[0] * 30, p[2] * 30, 2));
        if (m < 0.08) c = [150, 112, 60];
        if (Math.abs(p[0]) > 0.7) c = mul(c, 0.8);
        return tint(c, L);
      }
      if (k === "ceil") return tint([60, 50, 64], add(L, [0.2, 0.2, 0.2]));
      if (k === "left" || k === "right") {
        const doorZ = p[2] > 1.0 && p[2] < 1.9 && p[1] < 2.1;   // 兩邊別間房的門
        if (doorZ) return tint(mul([70, 36, 44], p[2] < 1.04 || p[2] > 1.86 || p[1] > 2.06 ? 0.6 : 1), L);
        if (p[2] > 1.3 && p[2] < 1.6 && p[1] > 2.18 && p[1] < 2.28) return tint([170, 136, 70], L);
        if (p[1] < 0.1) return tint([50, 34, 40], L);   // 踢腳板
        const stripe = (((p[2] * 6) % 1) + 1) % 1 < 0.5;
        return tint(mul(stripe ? [70, 50, 84] : [62, 44, 76], 0.95 + 0.05 * fbm(p[2] * 20, p[1] * 20, 2)), L);
      }
      if (k === "back") { if (p[1] < 0.1) return tint([50, 34, 40], L); return tint([66, 48, 80], L); }
      if (k === "frame") return tint([34, 20, 26], L);
      if (k === "door") {   // 深酒紅木門＋兩塊凹框
        const inset = inR(p, -0.38, 0.38, 1.18, 1.98) || inR(p, -0.38, 0.38, 0.12, 1.06);
        const edge = (inR(p, -0.4, 0.4, 1.16, 2.0) || inR(p, -0.4, 0.4, 0.1, 1.08)) && !inset;
        return tint(woodGrain(p[1], p[0], edge ? [118, 64, 76] : inset ? [84, 44, 56] : [100, 54, 66], 3), L);
      }
      if (k === "plate") return tint([196, 156, 80], add(L, [0.3, 0.3, 0.3]));
      if (k === "lampBox") return [60, 20, 26];
      if (k === "lock") return tint([40, 40, 46], L);
      if (k === "handle") return add(tint([200, 160, 80], L), [40, 30, 10]);
      if (k === "dnd") return tint([214, 86, 118], L);
      return null;
    },
    post(g, P) {   // 房號
      const c = P(0, 2.3, 3.17); g.fillStyle = "#2a1a22"; g.font = "bold 8px sans-serif"; g.textAlign = "center"; g.fillText(room, c[0], c[1] + 3);
    },
  };
  const canvas = render(S);
  return {
    canvas,
    anim(g, t) {   // 「使用中」紅燈閃、刷卡鎖綠燈、門縫的光輕輕晃
      const on = Math.floor(t / 900) % 4 !== 3, lp = project(S, 0.69, 1.6, 3.17), lk = project(S, 0.335, 1.1, 3.11);
      g.fillStyle = on ? "#ff4a64" : "#7a2434"; g.fillRect(Math.round(lp[0]) - 4, Math.round(lp[1]) - 5, 9, 9);
      if (on) { g.fillStyle = "rgba(255,74,100,.16)"; g.beginPath(); g.arc(lp[0], lp[1], 14, 0, 7); g.fill(); }
      g.fillStyle = "#f0c0c8"; g.font = "6px sans-serif"; g.textAlign = "center"; g.fillText("使用中", lp[0], lp[1] + 13);
      g.fillStyle = Math.floor(t / 600) % 2 ? "#3cf08a" : "#1c8a4c"; g.fillRect(Math.round(lk[0]) - 1, Math.round(lk[1]) - 2, 2, 2);
      const a = project(S, -0.46, 0.01, 3.13), b = project(S, 0.46, 0.01, 3.13), fl = 0.6 + 0.4 * Math.sin(t / 700);
      g.fillStyle = `rgba(255,190,130,${0.55 * fl})`; g.fillRect(a[0], a[1] - 1, b[0] - a[0], 2);
    },
  };
}

// ================================================================ 旅館：主臥室（偏暗、梅紫軟包床頭牆、吊燈、鏡牆）
export function hotelBedScene() {
  const amb = [0.32, 0.25, 0.32];
  const lights = [{ p: [-1.62, 1.3, 3.85], col: [1, 0.78, 0.5], k: 0.9 }, { p: [0.82, 1.3, 3.85], col: [1, 0.78, 0.5], k: 0.9 },
    { p: [-0.4, 1.86, 4.12], col: [0.9, 0.4, 0.8], k: 0.9, fall: 0.6 }, { p: [-0.4, 2.58, 2.2], col: [1, 0.85, 0.65], k: 1.3, down: true }];
  const S = {
    cam: [1.25, 1.5, -0.2], vp: [97.5, 186], f: 176, yaw: -14, room: { x0: -2.0, x1: 2.0, h: 2.6, zb: 4.2 },
    boxes: [
      B("headboard", -1.45, 0.65, 0.35, 1.72, 4.1, 4.2), B("bed", -1.3, 0.5, 0, 0.56, 2.0, 4.1), B("runner", -1.33, 0.53, 0.3, 0.58, 2.35, 2.75),
      B("stand", -2.0, -1.5, 0, 0.55, 3.6, 4.15), B("stand", 0.6, 1.1, 0, 0.55, 3.6, 4.15),
      B("chair", 1.0, 1.8, 0, 0.42, 1.0, 1.8), B("chairBack", 1.65, 1.8, 0.42, 0.95, 1.0, 1.8), B("chairArm", 1.0, 1.8, 0.42, 0.62, 1.0, 1.12),
    ],
    ells: [{ k: "pillow", c: [-0.85, 0.66, 3.82], r: [0.33, 0.13, 0.2] }, { k: "pillow", c: [0.05, 0.66, 3.82], r: [0.33, 0.13, 0.2] },
      { k: "pendant", c: [-1.62, 1.3, 3.85], r: [0.12, 0.16, 0.12] }, { k: "pendant", c: [0.82, 1.3, 3.85], r: [0.12, 0.16, 0.12] }],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      if (k === "floor") return tint(mul([78, 72, 76], 0.9 + 0.1 * fbm(p[0] * 25, p[2] * 25, 2)), L);   // 深灰地毯
      if (k === "ceil") return tint([70, 62, 72], add(L, [0.15, 0.15, 0.15]));
      if (k === "back") {
        if (p[1] > 1.72 && p[1] < 1.9 && p[0] > -1.5 && p[0] < 0.7) return mix([230, 120, 210], [120, 50, 120], (p[1] - 1.72) / 0.18);   // LED 燈帶
        return tint(mul([54, 50, 58], 0.94 + 0.06 * fbm(p[0] * 30, p[1] * 30, 2)), L);
      }
      if (k === "right") {
        if (p[2] > 0.9 && p[2] < 3.5 && p[1] > 0.25 && p[1] < 2.25) return { c: tint([40, 38, 46], L), mirror: 0.72 };   // 鏡牆
        return tint([56, 52, 60], L);
      }
      if (k === "left") return tint(mul([54, 50, 58], 0.95 + 0.05 * fbm(p[2] * 30, p[1] * 30, 2)), L);
      if (k === "headboard") return tint(tufted(p[0], p[1], [110, 52, 92]), L);
      if (k === "bed") return tint(mul([238, 234, 236], n[1] > 0.5 ? 1 : 0.88), L);
      if (k === "runner") return tint(mul([104, 46, 84], 0.9 + 0.1 * Math.sin(p[0] * 80)), L);
      if (k === "pillow") return tint([236, 230, 232], L);
      if (k === "pendant") return [255, 214, 150];
      if (k === "stand") return tint(woodGrain(p[0], p[1], [70, 52, 46], 2), L);
      if (k.startsWith("chair")) return tint(mul([78, 56, 70], 0.92 + 0.08 * fbm(p[0] * 40, p[2] * 40, 2)), L);
      return null;
    },
    post(g, P) {   // 吊燈的線
      g.strokeStyle = "rgba(30,24,32,.9)"; g.lineWidth = 1;
      for (const x of [-1.62, 0.82]) { const a = P(x, 1.46, 3.85), b = P(x, 2.6, 3.85); g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke(); }
    },
  };
  return render(S);
}

// ================================================================ 旅館：浴室（深灰石材、亮藍按摩浴缸、玻璃淋浴間、洗手台＋鏡子）
export function hotelBathScene() {
  const amb = [0.4, 0.38, 0.4];
  const lights = [{ p: [0.4, 2.48, 2.0], col: [1, 0.9, 0.75], k: 1.4, down: true }, { p: [-0.9, 2.48, 1.0], col: [1, 0.9, 0.75], k: 1.0, down: true },
    { p: [0.6, 0.6, 2.3], col: [0.3, 0.7, 1.0], k: 0.9, fall: 0.8 }];
  const S = {
    cam: [0.15, 1.5, 0.35], vp: [97.5, 176], f: 150, room: { x0: -1.4, x1: 1.4, h: 2.5, zb: 2.8 },
    boxes: [B("tub", -0.25, 1.4, 0, 0.58, 1.75, 2.8), B("counter", -1.4, -0.86, 0.8, 0.86, 0.15, 1.35), B("cabinet", -1.4, -0.9, 0, 0.8, 0.2, 1.3),
      B("rain", -1.05, -0.7, 2.44, 2.47, 2.1, 2.45), B("tap", 0.5, 0.62, 0.58, 0.72, 2.7, 2.76)],
    ells: [{ k: "sink", c: [-1.12, 0.87, 0.75], r: [0.18, 0.04, 0.24] }],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      if (k === "floor") return tint(tiles(p[0], p[2], 0.6, 0.6, [74, 74, 78], [44, 44, 48], false), L);
      if (k === "ceil") return tint([180, 176, 172], add(L, [0.2, 0.2, 0.2]));
      if (k === "back" || k === "right") return tint(tiles(k === "back" ? p[0] : p[2], p[1], 0.6, 1.2, [92, 90, 94], [58, 56, 60]), L);
      if (k === "left") {
        if (p[2] > 0.25 && p[2] < 1.25 && p[1] > 1.0 && p[1] < 2.0) {   // 鏡子＋LED 邊
          if (p[2] < 0.29 || p[2] > 1.21 || p[1] < 1.04 || p[1] > 1.96) return [240, 236, 226];
          return { c: [30, 30, 34], mirror: 0.8 };
        }
        return tint(tiles(p[2], p[1], 0.6, 1.2, [92, 90, 94], [58, 56, 60]), L);
      }
      if (k === "tub") {
        if (n[1] > 0.5 && p[0] > -0.1 && p[0] < 1.28 && p[2] > 1.88 && p[2] < 2.68) {   // 水面：亮藍、漣漪
          const r = 0.85 + 0.15 * Math.sin(p[0] * 40 + fbm(p[0] * 6, p[2] * 6, 2) * 8) * Math.sin(p[2] * 30);
          return mul([90, 200, 250], r);
        }
        return tint(n[1] > 0.5 ? [200, 198, 196] : mul([120, 118, 122], 0.95 + 0.05 * fbm(p[0] * 20, p[1] * 20, 2)), L);
      }
      if (k === "counter") return tint([232, 228, 222], L);
      if (k === "cabinet") return tint(woodGrain(p[2], p[1], [62, 52, 48], 4), L);
      if (k === "sink") return tint([246, 246, 244], L);
      if (k === "rain" || k === "tap") return add(tint([180, 184, 190], L), [30, 30, 30]);
      return null;
    },
    post(g, P) {   // 淋浴間的玻璃（半透明＋反光線）
      const q = [P(-1.4, 0, 1.75), P(-0.55, 0, 1.75), P(-0.55, 2.2, 1.75), P(-1.4, 2.2, 1.75)];
      g.fillStyle = "rgba(190,220,230,.12)"; g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(...v) : g.moveTo(...v))); g.fill();
      g.strokeStyle = "rgba(220,235,240,.5)"; g.lineWidth = 1; g.beginPath(); g.moveTo(...P(-0.55, 0, 1.75)); g.lineTo(...P(-0.55, 2.2, 1.75)); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.moveTo(...P(-1.2, 1.8, 1.75)); g.lineTo(...P(-0.9, 0.6, 1.75)); g.stroke();
    },
  };
  return render(S);
}

// ================================================================ 汽車旅館：玄關（車庫＋樓梯）
export function motelGarageScene(room = "305") {
  const amb = [0.2, 0.2, 0.24];
  const lights = [{ p: [-0.6, 2.7, 2.6], col: [0.85, 0.95, 1], k: 2.2, fall: 0.3 }, { p: [1.1, 2.6, 5.9], col: [1, 0.72, 0.45], k: 0.5, fall: 0.8 }];
  const steps = [];
  for (let i = 0; i < 13; i++) steps.push(B("step", 0.35, 1.8, 0, (i + 1) * 0.18, 2.4 + i * 0.27, 6.0));
  const S = {
    cam: [0.0, 1.55, -0.5], vp: [97.5, 192], f: 140, room: { x0: -1.8, x1: 1.8, h: 4.4, zb: 6.0 },
    boxes: [
      ...steps,
      B("car", -1.65, -0.15, 0.3, 0.95, 1.4, 5.4), B("cabin", -1.5, -0.3, 0.95, 1.4, 2.5, 4.3), B("tail", -1.62, -1.3, 0.72, 0.84, 1.37, 1.4), B("tail", -0.5, -0.18, 0.72, 0.84, 1.37, 1.4),
      B("plate", -1.05, -0.75, 0.48, 0.62, 1.37, 1.4), B("tube", -1.1, -0.1, 2.68, 2.74, 2.55, 2.65), B("heel", 0.6, 0.72, 0.18, 0.24, 2.48, 2.54), B("heel", 0.8, 0.9, 0.18, 0.23, 2.52, 2.6),
      B("tdoor", 0.55, 1.65, 2.34, 4.3, 5.96, 6.0),
    ],
    ells: [{ k: "wheel", c: [-1.62, 0.3, 2.0], r: [0.1, 0.3, 0.3] }, { k: "wheel", c: [-0.18, 0.3, 2.0], r: [0.1, 0.3, 0.3] }],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      if (k === "floor") {   // 環氧樹脂地坪（灰綠、亮面）＋黃色停車線
        let c = mul([96, 108, 102], 0.9 + 0.1 * fbm(p[0] * 4, p[2] * 4, 3));
        if (Math.abs(p[0] - 0.05) < 0.04 && p[2] < 5.5) c = [196, 168, 48];
        if (p[0] > -1.75 && p[0] < -0.05 && p[2] > 1.3 && p[2] < 5.5) c = mul(c, 0.6);   // 車底陰影
        return { c: tint(c, L), mirror: 0.12 };
      }
      if (k === "ceil") return tint([52, 52, 58], L);
      if (k === "back" || k === "left" || k === "right") {   // 清水模
        const u = k === "back" ? p[0] : p[2];
        let c = mul([116, 114, 118], 0.86 + 0.18 * fbm(u * 2, p[1] * 2, 4));
        if (hash(Math.floor(u * 7), Math.floor(p[1] * 7)) > 0.9 && (((u * 7) % 1) + 1) % 1 < 0.08) c = mul(c, 0.8);
        return tint(c, L);
      }
      if (k === "step") return tint(mul([132, 128, 134], n[1] > 0.5 ? 1.05 : 0.8), L);
      if (k === "car") return { c: tint(mul([30, 42, 64], n[1] > 0.5 ? 1.2 : 1), L), mirror: n[1] > 0.5 ? 0.25 : 0.12 };
      if (k === "cabin") return n[2] < -0.5 || Math.abs(n[0]) > 0.5 ? { c: [20, 24, 34], mirror: 0.35 } : tint([30, 42, 64], L);
      if (k === "tail") return [220, 40, 50];
      if (k === "plate") return tint([210, 210, 216], L);
      if (k === "wheel") return [14, 14, 16];
      if (k === "tube") return [236, 248, 252];
      if (k === "heel") return tint([170, 40, 60], L);
      if (k === "tdoor") return tint(woodGrain(p[1], p[0], [96, 52, 58], 3), L);
      return null;
    },
    post(g, P) {
      // 扶手
      g.strokeStyle = "#8a8692"; g.lineWidth = 1; g.beginPath(); g.moveTo(...P(0.38, 1.05, 2.4)); g.lineTo(...P(0.38, 3.2, 5.9)); g.stroke();
      // 牆上漆的車庫號碼
      const c = P(-1.8, 2.0, 3.4); g.fillStyle = "rgba(216,192,64,.9)"; g.font = "bold 13px sans-serif"; g.textAlign = "center"; g.fillText(room, c[0] + 12, c[1]);
    },
  };
  const canvas = render(S);
  return {
    canvas,
    anim(g, t) {   // 日光燈偶爾閃一下、門縫光、尾燈
      if ((Math.floor(t / 120) % 37) === 0) { g.fillStyle = "rgba(0,0,0,.22)"; g.fillRect(0, 0, 195, 422); }
      const a = project(S, 0.55, 2.35, 5.95), b = project(S, 1.65, 2.35, 5.95), fl = 0.6 + 0.4 * Math.sin(t / 800);
      g.fillStyle = `rgba(255,170,120,${0.7 * fl})`; g.fillRect(a[0], a[1] - 1, b[0] - a[0], 2);
    },
  };
}

// ================================================================ 汽車旅館：主臥室（酒紅絨布床頭牆、金色花紋壁紙、天花板鏡子、大電視、亮面大理石地板）
export function motelBedScene() {
  const amb = [0.38, 0.28, 0.3];
  const lights = [{ p: [-0.6, 2.85, 3.6], col: [1, 0.8, 0.6], k: 1.6, down: true }, { p: [1.6, 2.85, 2.0], col: [1, 0.8, 0.6], k: 1.0, down: true },
    { p: [-2.3, 2.8, 2.5], col: [1, 0.35, 0.6], k: 0.8, fall: 0.5 }, { p: [2.3, 2.8, 4.8], col: [1, 0.35, 0.6], k: 0.8, fall: 0.5 }];
  const BED = { x0: -1.8, x1: 0.6, z0: 2.6, z1: 4.95 };
  const S = {
    cam: [1.45, 1.55, 0.1], vp: [97.5, 182], f: 172, yaw: -16, room: { x0: -2.4, x1: 2.4, h: 2.9, zb: 5.0 },
    boxes: [B("headwall", -2.1, 1.0, 0, 2.4, 4.9, 5.0), B("bed", BED.x0, BED.x1, 0, 0.6, BED.z0, 4.9), B("runner", BED.x0 - 0.03, BED.x1 + 0.03, 0.35, 0.62, 3.0, 3.45),
      B("tv", 2.32, 2.4, 0.95, 1.85, 1.4, 3.0), B("console", 1.95, 2.4, 0, 0.45, 1.2, 3.2), B("sofa", -2.4, -1.75, 0, 0.42, 0.6, 2.0), B("sofaBack", -2.4, -2.2, 0.42, 0.9, 0.6, 2.0)],
    ells: [{ k: "pillow", c: [-1.25, 0.72, 4.65], r: [0.4, 0.14, 0.22] }, { k: "pillow", c: [0.05, 0.72, 4.65], r: [0.4, 0.14, 0.22] }],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      if (k === "floor") return { c: tint(marble(p[0], p[2], [214, 200, 182], [150, 130, 110], 2, 0.8), L), mirror: 0.18 };
      if (k === "ceil") {
        if (p[0] > BED.x0 && p[0] < BED.x1 && p[2] > BED.z0 && p[2] < BED.z1) {   // 床正上方的天花板鏡子（金框）
          if (p[0] < BED.x0 + 0.06 || p[0] > BED.x1 - 0.06 || p[2] < BED.z0 + 0.06 || p[2] > BED.z1 - 0.06) return tint([200, 160, 80], add(L, [0.3, 0.3, 0.3]));
          return { c: [30, 22, 26], mirror: 0.78 };
        }
        if (p[1] > 2.85 && (p[0] < -2.3 || p[0] > 2.3 || p[2] > 4.9)) return [255, 90, 160];
        return tint([92, 70, 76], add(L, [0.12, 0.12, 0.12]));
      }
      if (k === "back" || k === "left" || k === "right") {
        if (p[1] > 2.8) return [255, 96, 170];   // 牆頂一圈粉紅燈帶
        return tint(damask(k === "back" ? p[0] : p[2], p[1], [150, 108, 70], [214, 176, 104]), L);
      }
      if (k === "headwall") return p[1] > 2.32 ? tint([200, 160, 80], add(L, [0.3, 0.3, 0.3])) : tint(tufted(p[0], p[1], [120, 30, 44], 0.26), L);
      if (k === "bed") return tint(mul([240, 236, 230], n[1] > 0.5 ? 1 : 0.86), L);
      if (k === "runner") return tint(mul([150, 110, 60], 0.9 + 0.1 * Math.sin(p[0] * 60)), L);
      if (k === "pillow") return tint([240, 232, 224], L);
      if (k === "tv") return n[0] < -0.5 ? (p[1] > 1.0 && p[1] < 1.8 && p[2] > 1.45 && p[2] < 2.95 ? { c: [16, 20, 34], mirror: 0.4 } : [20, 20, 22]) : [20, 20, 22];
      if (k === "console") return tint(woodGrain(p[2], p[1], [60, 40, 34], 5), L);
      if (k.startsWith("sofa")) return tint(mul([60, 30, 36], 0.9 + 0.1 * fbm(p[2] * 30, p[1] * 30, 2)), L);
      return null;
    },
  };
  return render(S);
}

// ================================================================ 汽車旅館：浴室（黑色大理石金紋、超大按摩浴缸、玻璃淋浴間、金色水龍頭）
export function motelBathScene() {
  const amb = [0.34, 0.32, 0.34];
  const lights = [{ p: [0.4, 2.65, 2.4], col: [1, 0.88, 0.7], k: 1.6, down: true }, { p: [-1.5, 2.65, 1.5], col: [1, 0.88, 0.7], k: 1.1, down: true },
    { p: [0.4, 0.7, 2.8], col: [0.5, 0.9, 1.0], k: 0.8, fall: 0.6 }, { p: [1.9, 2.6, 3.5], col: [1, 0.4, 0.7], k: 0.6, fall: 0.5 }];
  const S = {
    cam: [0.25, 1.6, 0.45], vp: [97.5, 172], f: 150, room: { x0: -2.0, x1: 2.0, h: 2.7, zb: 3.6 },
    boxes: [B("tub", -1.2, 2.0, 0, 0.66, 2.0, 3.6), B("tstep", -1.2, 2.0, 0, 0.26, 1.6, 2.0), B("tap", 0.3, 0.5, 0.66, 0.86, 3.4, 3.5), B("tapNeck", 0.36, 0.44, 0.8, 0.86, 3.25, 3.45),
      B("rain", -1.75, -1.35, 2.56, 2.6, 2.6, 3.2)],
    shade(k, p, n) {
      const L = lightAt(p, n, amb, lights);
      const blk = (u, v, s) => marble(u, v, [40, 38, 42], [180, 148, 90], s, 0.55);   // 金紋放大，不要碎成星點
      if (k === "floor") return { c: tint(tiles(p[0], p[2], 0.8, 0.8, [40, 38, 40], [70, 64, 56], false), L), mirror: 0.2 };
      if (k === "ceil") return tint([170, 160, 160], add(L, [0.2, 0.2, 0.2]));
      if (k === "back" || k === "left" || k === "right") return tint(blk(k === "back" ? p[0] : p[2], p[1], k.length), L);
      if (k === "tub" || k === "tstep") {
        if (k === "tub" && n[1] > 0.5 && p[0] > -1.0 && p[0] < 1.85 && p[2] > 2.15 && p[2] < 3.45) {   // 水面：青綠微光、漣漪＋氣泡
          const r = 0.85 + 0.15 * Math.sin(p[0] * 30 + fbm(p[0] * 5, p[2] * 5, 2) * 7) * Math.sin(p[2] * 26);
          let c = mul([70, 190, 196], r);
          if (hash(Math.floor(p[0] * 60), Math.floor(p[2] * 60)) > 0.97) c = [220, 250, 250];
          return c;
        }
        return tint(blk(n[1] > 0.5 ? p[0] : p[0] + p[2], n[1] > 0.5 ? p[2] : p[1], 7), L);
      }
      if (k === "tap" || k === "tapNeck" || k === "rain") return add(tint([206, 166, 80], L), [40, 30, 10]);
      return null;
    },
    post(g, P) {   // 淋浴間玻璃
      const q = [P(-2.0, 0, 1.9), P(-1.15, 0, 1.9), P(-1.15, 2.4, 1.9), P(-2.0, 2.4, 1.9)];
      g.fillStyle = "rgba(190,220,230,.1)"; g.beginPath(); q.forEach((v, i) => (i ? g.lineTo(...v) : g.moveTo(...v))); g.fill();
      g.strokeStyle = "rgba(220,200,140,.7)"; g.lineWidth = 1; g.beginPath(); g.moveTo(...P(-1.15, 0, 1.9)); g.lineTo(...P(-1.15, 2.4, 1.9)); g.stroke();
      g.strokeStyle = "rgba(255,255,255,.16)"; g.beginPath(); g.moveTo(...P(-1.8, 2.0, 1.9)); g.lineTo(...P(-1.4, 0.7, 1.9)); g.stroke();
    },
  };
  return render(S);
}
