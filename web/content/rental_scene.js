/* 旅館場景的共用逐像素光線追蹤（2026-10-15）：給旅館／汽車旅館的玄關、主臥室、浴室用。
 * 場景 S：{ cam:[x,y,z], vp:[sx,sy], f, yaw(度), room:{x0,x1,h,zb}, boxes:[{k,x0,x1,y0,y1,z0,z1}], ells:[{k,c,r}],
 *          shade(kind, p, n, d) → [r,g,b] | {c, mirror:0～1} | null（看穿，換下一個交點） }
 * 房間的面 kind：floor／ceil／back／left／right。鏡子：shade 回 {c, mirror}，再追一次反射（只彈一次）。 */
import { paintKit as K } from "./rental_entry_paint.js?v=2";
import { roomKit as RK } from "./rental_room_paint.js?v=3";
export const { hash, vnoise, fbm, mix, mul, add, clamp01, smooth, put, LW, LH } = K;
export const { hitBox, hitEll, woodGrain, tint } = RK;

const WALLS = new Set(["floor", "ceil", "back", "left", "right"]);
const NORMAL = { floor: [0, 1, 0], ceil: [0, -1, 0], back: [0, 0, -1], left: [1, 0, 0], right: [-1, 0, 0] };

function hitRoom(o, d, R) {
  const out = [];
  if (d[1] < 0) out.push({ t: -o[1] / d[1], kind: "floor" });
  if (d[1] > 0) out.push({ t: (R.h - o[1]) / d[1], kind: "ceil" });
  if (d[2] > 0) out.push({ t: (R.zb - o[2]) / d[2], kind: "back" });
  if (d[0] < 0) out.push({ t: (R.x0 - o[0]) / d[0], kind: "left" });
  if (d[0] > 0) out.push({ t: (R.x1 - o[0]) / d[0], kind: "right" });
  let best = null;
  for (const h of out) if (h.t > 1e-4 && (!best || h.t < best.t)) best = h;
  return best;
}
/** 一條視線的顏色。 */
export function trace(S, o, d, depth = 0) {
  const hits = [];
  const r = hitRoom(o, d, S.room); if (r) hits.push({ ...r, n: NORMAL[r.kind] });
  for (const b of S.boxes || []) { const h = hitBox(o, d, b); if (h) hits.push({ t: h.t, kind: b.k, n: h.n, obj: b }); }
  for (const e of S.ells || []) { const h = hitEll(o, d, e); if (h) hits.push({ t: h.t, kind: e.k, n: h.n, obj: e }); }
  hits.sort((a, b) => a.t - b.t);
  for (const h of hits) {
    const p = [o[0] + d[0] * h.t, o[1] + d[1] * h.t, o[2] + d[2] * h.t];
    let c = S.shade(h.kind, p, h.n, d, h.obj);
    if (!c) continue;
    if (!Array.isArray(c)) {
      if (c.mirror && depth < 1) {
        const n = h.n, k = 2 * (d[0] * n[0] + d[1] * n[1] + d[2] * n[2]), rd = [d[0] - k * n[0], d[1] - k * n[1], d[2] - k * n[2]];
        const rc = trace(S, [p[0] + n[0] * 1e-3, p[1] + n[1] * 1e-3, p[2] + n[2] * 1e-3], rd, depth + 1);
        c = mix(c.c, rc, c.mirror);
      } else c = c.c;
    }
    if (WALLS.has(h.kind) && S.ao !== false) {   // 牆角、牆與地板交界暗一點
      const R = S.room, e = Math.min(p[0] - R.x0, R.x1 - p[0], p[1], R.h - p[1], h.kind === "back" ? 9 : R.zb - p[2]);
      c = mul(c, 0.8 + 0.2 * smooth(0, 0.32, e));
    }
    return c;
  }
  return [0, 0, 0];
}
function dirOf(S, sx, sy) {
  const q = [(sx + 0.5 - S.vp[0]) / S.f, -(sy + 0.5 - S.vp[1]) / S.f, 1], a = (S.yaw || 0) * Math.PI / 180, cy = Math.cos(a), sn = Math.sin(a);
  const d = [q[0] * cy + q[2] * sn, q[1], -q[0] * sn + q[2] * cy], n = Math.hypot(...d);
  return [d[0] / n, d[1] / n, d[2] / n];
}
/** 畫整張（靜態）。回傳 canvas。 */
export function render(S) {
  const c = document.createElement("canvas"); c.width = LW; c.height = LH;
  const img = new ImageData(LW, LH), px = img.data;
  for (let sy = 0; sy < LH; sy++) for (let sx = 0; sx < LW; sx++) put(px, (sy * LW + sx) * 4, sx, sy, trace(S, S.cam, dirOf(S, sx, sy)));
  c.getContext("2d").putImageData(img, 0, 0);
  if (S.post) S.post(c.getContext("2d"), (x, y, z) => project(S, x, y, z));
  c.project = (x, y, z) => project(S, x, y, z);   // 之後把人物放進場景用
  return c;
}
/** 世界座標 → 畫面座標（疊 2D 線條／文字／動畫用）。 */
export function project(S, x, y, z) {
  const v = [x - S.cam[0], y - S.cam[1], z - S.cam[2]], a = (S.yaw || 0) * Math.PI / 180, cy = Math.cos(a), sn = Math.sin(a);
  const q0 = v[0] * cy - v[2] * sn, q2 = v[0] * sn + v[2] * cy;
  return [S.vp[0] + S.f * q0 / q2, S.vp[1] - S.f * v[1] / q2];
}
/** 光：amb＋點光源（down：只往下照的嵌燈）。回傳乘數 [r,g,b]。 */
export function lightAt(p, n, amb, lights) {
  let L = amb.slice();
  for (const q of lights) {
    const lx = q.p[0] - p[0], ly = q.p[1] - p[1], lz = q.p[2] - p[2], ld = Math.hypot(lx, ly, lz) || 1;
    let k = Math.max(0, (n[0] * lx + n[1] * ly + n[2] * lz) / ld) * q.k / (0.3 + ld * ld * (q.fall ?? 0.35));
    if (q.down) k *= Math.max(0, -ly / ld) ** 2;
    L = add(L, mul(q.col, k));
  }
  return L;
}
// ------------------------------------------------------------ 材質
/** 磁磚：u 橫、v 縱；w×h 一塊、縫 grout 公尺；row 交錯。 */
export function tiles(u, v, w, h, base, groutCol, stagger = true, grout = 0.006) {
  const row = Math.floor(v / h), off = stagger && row % 2 ? w / 2 : 0;
  const gu = (((u + off) % w) + w) % w, gv = ((v % h) + h) % h;
  if (gu < grout || gv < grout) return groutCol;
  return mul(base, 0.94 + 0.06 * fbm(u * 3 + row, v * 3, 2));
}
/** 大理石：底色＋紋路色。 */
export function marble(u, v, base, veinCol, seed = 0, freq = 1) {
  const n = fbm(u * 3 * freq + seed, v * 3 * freq + seed, 4), vein = Math.abs(Math.sin((u * 1.4 + v * 0.9 + n * 3.2) * 2.4 * freq));
  return mix(mul(base, 0.82 + 0.3 * fbm(u * 4, v * 4, 3)), veinCol, (1 - smooth(0.02, 0.1, vein)) * 0.75);
}
/** 大馬士革花紋壁紙（汽車旅館）。 */
export function damask(u, v, base, ink) {
  const a = Math.sin(u * 14) * Math.sin(v * 9) + 0.6 * Math.sin(u * 7 + v * 4.5) * Math.cos(v * 9 - u * 3.5);
  return mix(base, ink, smooth(0.55, 0.75, Math.abs(a)) * 0.55);
}
/** 軟包（拉扣格子）：每格中間凸、扣子凹。 */
export function tufted(u, v, base, s = 0.22) {
  const fu = (((u / s) % 1) + 1) % 1, fv = (((v / s + (Math.floor(u / s) % 2) * 0.5) % 1) + 1) % 1;
  const du = fu - 0.5, dv = fv - 0.5, bump = 1 - (du * du + dv * dv) * 2.2, button = Math.hypot(du, dv) > 0.46 ? 0.62 : 1;
  return mul(base, (0.72 + 0.32 * bump) * button);
}
