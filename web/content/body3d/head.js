/* 3D 人偶系統・頭部（素描用的「素體頭」：Loomis 球＋側平面、Asaro 平面頭）
 *   做法：整顆頭寫成一個 SDF（帶號距離場：顱骨橢球切掉兩側平面＋臉面具＋下顎＋顴骨＋眉弓＋鼻子，挖眼窩、放眼球），
 *   再從頭裡面一點 O 往每個方向打射線找表面 → 把球／二十面體的頂點推到表面上。
 *   面數少＋平面法線＝素描的「切面頭」；面數多＋平滑法線＝灰模。
 *   座標：y 朝上、z 朝前（臉）、x 朝她的左邊；單位＝顱骨半徑（頭頂 y≈1.05，眉線 y=0，鼻底 ≈-0.95，下巴 ≈-1.8）。 */
import * as THREE from "three";
import { mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

export const DEFAULT_HEAD = {
  craniumW: 1,   // 顱骨寬
  jawW: 1,       // 下顎寬
  chinLen: 1,    // 下巴長（臉下三分之一）
  noseLen: 1,    // 鼻長
  socket: 1,     // 眼窩深
  cheek: 1,      // 顴骨
  brow: 1,       // 眉弓
  faceLen: 1,    // 臉長（眉線以下整體縮放）
  noseAngle: 20, // 鼻樑角度（度，鼻樑和臉正面垂直線的夾角：小＝貼臉、大＝挺出來）
  noseBridge: 1, // 鼻樑高
  noseUp: 0,     // 鼻頭上翹（-1 鷹勾 … 1 上翹）
  // 女性特徵
  eyeSize: 1,    // 眼睛大小
  lips: 1,       // 嘴唇厚
  chinPoint: 0,  // 下巴尖（0 方 … 1 尖）
  cheekFat: 0,   // 臉頰肉（蘋果肌）
  forehead: 0,   // 額頭圓（填平眉弓上方、額頭往前鼓）
};

/** 「女性化」滑桿的兩端：0＝預設素體（偏男），1＝女性。中間線性內插，拉完各滑桿還能再微調。 */
export const FEM_TARGET = {
  craniumW: 0.97, jawW: 0.8, faceLen: 0.94, chinLen: 0.9, noseLen: 0.86, socket: 0.65, cheek: 0.85, brow: 0.45,
  noseAngle: 24, noseBridge: 0.8, noseUp: 0.45, eyeSize: 1.15, lips: 1.35, chinPoint: 0.7, cheekFat: 0.7, forehead: 0.8,
};

/* 臉的部件是照「眉 0、鼻底 -0.95、下巴 -1.75」畫的，再把眉線以下往上壓（FACE_K）成正常頭身：
 * 頭高 ≈ 頭寬 × 1.5，髮際→眉、眉→鼻底、鼻底→下巴三等份。 */
const FACE_K = 0.74;
const smooth01 = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

/* ---- SDF 小工具 ---- */
const len3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
function sdEllipsoid(x, y, z, cx, cy, cz, rx, ry, rz) {
  const px = x - cx, py = y - cy, pz = z - cz;
  const k0 = len3(px / rx, py / ry, pz / rz), k1 = len3(px / (rx * rx), py / (ry * ry), pz / (rz * rz));
  return k1 < 1e-9 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
/** 圓錐膠囊：a 端半徑 ra、b 端半徑 rb（近似即可）。 */
function sdRoundCone(x, y, z, ax, ay, az, bx, by, bz, ra, rb) {
  const bax = bx - ax, bay = by - ay, baz = bz - az, pax = x - ax, pay = y - ay, paz = z - az;
  const h = Math.min(1, Math.max(0, (pax * bax + pay * bay + paz * baz) / (bax * bax + bay * bay + baz * baz)));
  return len3(pax - bax * h, pay - bay * h, paz - baz * h) - (ra + (rb - ra) * h);
}
const smin = (a, b, k) => { const h = Math.max(k - Math.abs(a - b), 0) / k; return Math.min(a, b) - h * h * k * 0.25; };
const smax = (a, b, k) => -smin(-a, -b, k);

/** 照參數做出頭的 SDF：f(x,y,z) < 0 在裡面。也回傳結構線要用的幾個高度。 */
export function headSDF(P = DEFAULT_HEAD) {
  const cw = 0.8 * P.craniumW, side = cw * 0.9, jw = P.jawW;
  const chinY = -1.75 - (P.chinLen - 1) * 0.45;
  // 鼻子：鼻根 B 往下斜 noseAngle 度、長 L 到鼻頭
  const na = (P.noseAngle * Math.PI) / 180, L = 0.7 * P.noseLen, bZ = 0.86 + 0.05 * (P.noseBridge - 1);
  const noseTipY = -0.2 - L * Math.cos(na) + 0.05 * P.noseUp, noseTipZ = bZ + L * Math.sin(na) - 0.02 * Math.abs(P.noseUp);
  const es = P.eyeSize, lp = P.lips, cp = P.chinPoint;
  const jawY = -1.25 + (chinY + 1.75) * 0.5;
  const mouthY = -0.95 + (chinY + 0.95) * 0.35;
  const sock = 0.17 * P.socket, k = FACE_K * P.faceLen;
  // 真實 y → 部件座標 y（眉線以上不動，往下平滑地拉長 1/k 倍）
  const warp = (y) => y * (1 + (1 / k - 1) * smooth01(0.05, -0.2, y));
  const raw = (x, y, z) => {
    const ax = Math.abs(x);   // 左右對稱
    // 顱骨：橢球切掉兩側（Loomis 的側平面）
    let d = smax(sdEllipsoid(x, y, z, 0, 0.05, -0.1, cw, 1.0, 1.02), ax - side, 0.12);
    // 臉：面具＋下顎塊＋下巴＋下顎線＋下顎枝
    let face = sdEllipsoid(x, y, z, 0, -0.62, 0.22, 0.6, 0.92, 0.7);
    face = smin(face, sdEllipsoid(x, y, z, 0, (jawY + chinY) * 0.5 + 0.05, 0.05, 0.5 * jw, 0.5, 0.6), 0.2);
    face = smin(face, sdEllipsoid(x, y, z, 0, chinY + 0.14 + 0.03 * cp, 0.6 + 0.03 * cp, 0.24 * (1 - 0.4 * cp), 0.2, 0.2 * (1 - 0.2 * cp)), 0.15);
    face = smin(face, sdRoundCone(ax, y, z, 0.52 * jw, jawY, -0.2, 0.16 * (1 - 0.55 * cp), chinY + 0.1, 0.58, 0.1, 0.11 * (1 - 0.3 * cp)), 0.15);
    face = smin(face, sdRoundCone(ax, y, z, 0.52 * jw, jawY, -0.2, 0.6 * P.craniumW, -0.35, -0.22, 0.1, 0.14), 0.15);
    d = smin(d, face, 0.25);
    // 顴骨、眉弓
    d = smin(d, sdEllipsoid(ax, y, z, 0.47, -0.45, 0.55, 0.2 * P.cheek, 0.14 * P.cheek, 0.2 * P.cheek), 0.12);
    d = smin(d, sdRoundCone(ax, y, z, 0, 0.0, 0.9, 0.5, 0.0, 0.72, 0.1 * P.brow, 0.08 * P.brow), 0.1);
    // 女性：臉頰肉（顴骨下、嘴角外側的軟肉）、圓額頭
    if (P.cheekFat > 0.01) d = smin(d, sdEllipsoid(ax, y, z, 0.36, -0.78, 0.5, 0.22 * P.cheekFat, 0.2 * P.cheekFat, 0.2 * P.cheekFat), 0.2 * P.cheekFat);
    if (P.forehead > 0.01) d = smin(d, sdEllipsoid(x, y, z, 0, 0.32, 0.5 + 0.06 * P.forehead, 0.56, 0.45, 0.42), 0.3 * P.forehead);
    // 耳朵（貼在側平面上）
    d = smin(d, sdEllipsoid(ax, y, z, side + 0.04, -0.4, -0.18, 0.07, 0.28, 0.17), 0.05);
    // 鼻子：鼻樑到鼻頭的錐＋鼻翼
    d = smin(d, sdRoundCone(x, y, z, 0, -0.2, bZ, 0, noseTipY, noseTipZ, 0.07 * (0.6 + 0.4 * P.noseBridge), 0.1 * (0.9 + 0.1 * P.noseLen)), 0.06);
    d = smin(d, sdEllipsoid(ax, y, z, 0.1 * (0.85 + 0.15 * P.noseLen), noseTipY - 0.04, noseTipZ - 0.13, 0.08, 0.07, 0.08), 0.06);
    // 嘴唇（上下兩片）＋嘴縫
    d = smin(d, sdEllipsoid(x, y, z, 0, mouthY + 0.05 + 0.01 * lp, 0.78 + 0.02 * lp, 0.2, 0.06 * lp, 0.07 * lp), 0.06);
    d = smin(d, sdEllipsoid(x, y, z, 0, mouthY - 0.06 - 0.015 * lp, 0.76 + 0.02 * lp, 0.17, 0.065 * lp, 0.07 * lp), 0.06);
    d = smax(d, -sdEllipsoid(x, y, z, 0, mouthY, 0.88, 0.19, 0.012, 0.1), 0.01);
    // 眼窩挖掉、眼球放進去
    d = smax(d, -sdEllipsoid(ax, y, z, 0.3, -0.3, 0.75 + sock, 0.19 * es, 0.14 * es, sock + 0.01), 0.08);
    d = Math.min(d, len3(ax - 0.3, y + 0.32, z - 0.7 + 0.02 * (es - 1)) - 0.155 * es);
    return d;
  };
  const f = (x, y, z) => raw(x, warp(y), z) * Math.min(1, k);
  const unwarp = (yw) => { let lo = -4, hi = 2; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (warp(m) < yw) lo = m; else hi = m; } return (lo + hi) / 2; };
  const lv = { top: 1.05, hair: 0.62, brow: 0, eye: -0.32, nose: noseTipY - 0.1, mouth: mouthY, chin: chinY };
  for (const n in lv) if (lv[n] < 0) lv[n] = unwarp(lv[n]);
  return { f, levels: lv };
}

/** 從 (ox,oy,oz) 往方向 (dx,dy,dz) 找最外面那層表面的距離（由外往內 sphere tracing，再二分）。 */
function castOut(f, ox, oy, oz, dx, dy, dz, far = 3.4) {
  let t = far, tOut = far;
  for (let i = 0; i < 160 && t > 0; i++) {
    const s = f(ox + dx * t, oy + dy * t, oz + dz * t);
    if (s < 0) break;
    tOut = t;
    t -= Math.max(s * 0.85, 0.003);
  }
  let lo = Math.max(t, 0), hi = tOut;   // lo 在裡面、hi 在外面
  for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (f(ox + dx * m, oy + dy * m, oz + dz * m) < 0) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

const O = [0, -0.3, 0];   // 射線從這裡出發（大約鼻根後面、頭的正中）

/** 頭的幾何。planar＝切面頭（低面數、平面法線），detail＝切面數；否則是平滑的灰模。 */
export function buildHeadGeometry(P = DEFAULT_HEAD, { planar = true, detail = 6 } = {}) {
  const { f } = headSDF(P);
  let g = planar ? new THREE.IcosahedronGeometry(1, detail) : new THREE.SphereGeometry(1, 160, 120);
  if (!planar) { g.deleteAttribute("uv"); g.deleteAttribute("normal"); g = mergeVertices(g); }
  const pos = g.attributes.position, v = new THREE.Vector3();
  const cache = new Map();   // 二十面體不共用頂點，同一點只打一次
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();
    const k = `${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)}`;
    let t = cache.get(k);
    if (t === undefined) { t = castOut(f, O[0], O[1], O[2], v.x, v.y, v.z); cache.set(k, t); }
    pos.setXYZ(i, O[0] + v.x * t, O[1] + v.y * t, O[2] + v.z * t);
  }
  g.computeVertexNormals();   // 二十面體沒有共用頂點 → 每面一個法線＝切面
  g.computeBoundingSphere();
  return g;
}

/** 素描結構線（貼在表面上）：中線、髮際／眉／眼／鼻底／嘴／下巴橫線、兩側 Loomis 側面圓。回傳 [[x,y,z]...] 的折線陣列。 */
export function constructionLines(P = DEFAULT_HEAD) {
  const { f, levels } = headSDF(P), lift = 0.012, out = [];
  const on = (o, d) => { const t = castOut(f, o[0], o[1], o[2], d[0], d[1], d[2]) + lift; return [o[0] + d[0] * t, o[1] + d[1] * t, o[2] + d[2] * t]; };
  // 中線：x=0 平面，從後腦頂越過頭頂、臉、到下巴底
  const mid = [];
  for (let a = -0.25 * Math.PI; a <= 0.93 * Math.PI; a += Math.PI / 160) mid.push(on(O, [0, Math.cos(a), Math.sin(a)]));
  out.push({ name: "中線", pts: mid });
  // 橫線：在那個高度的水平面上繞前半圈
  const ring = (name, y, span) => {
    const pts = [];
    for (let th = -span; th <= span + 1e-6; th += span / 60) pts.push(on([0, y, -0.1], [Math.sin(th), 0, Math.cos(th)]));
    out.push({ name, pts });
  };
  ring("髮際", levels.hair, Math.PI * 0.5);
  ring("眉線", levels.brow, Math.PI * 0.55);
  ring("眼線", levels.eye, Math.PI * 0.5);
  ring("鼻底", levels.nose, Math.PI * 0.45);
  ring("嘴", levels.mouth, Math.PI * 0.3);
  // Loomis 側面圓（從中間往兩側打到側平面上）
  for (const sx of [1, -1]) {
    const pts = [];
    for (let a = 0; a <= Math.PI * 2 + 1e-6; a += Math.PI / 48) pts.push(on([0, -0.05 + 0.55 * Math.sin(a), -0.12 + 0.55 * Math.cos(a)], [sx, 0, 0]));
    out.push({ name: "側面圓", pts });
  }
  return { lines: out, levels };
}
