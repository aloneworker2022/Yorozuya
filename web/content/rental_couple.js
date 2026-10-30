/* 旅館房間裡的兩個人（2026-10-17 Al 認可的點陣動圖，即時版）。
 * 原本是 /workspace/mock 的 Python＋node 腳本（venues.py／vrun.py／jpsexpx2.py／jpbathpx.py／jpbathstand.py＋jpx/*.cjs）一格一格算成 GIF；
 * 這裡照同一套數字改成瀏覽器即時畫：
 *   她＝rental_doll.js（凍結的 room_doll v7）側面 renderSide → 每個房間像素沿相機射線打到「人物卡片」平面 → 取樣（原尺寸、照床／浴缸角度）；
 *   不透明（alpha>0 → 255）＋1px 外框；客人＝藍色圓角線條（只動腰）；泡澡＝水面染色、水下淡淡看得到、漣漪、蒸氣；
 *   浴缸邊站著＝她彎腰抓浴缸、踮腳尖（腳掌多邊形），他腳踩地、雙腿有關節；A/B/C 用使用者給的胸型、D～I 前端圓球隨罩杯放大。
 * makeCouple({ venue, scene:'bed'|'bath', pose, doll }) → { frame(now) → {canvas(195×422 疊在背景上)|null, box}, ready }。
 * 一個姿勢 30 格，第一次進來一格一格算（一格約 40～60ms），算好的就先播。 */
import "./rental_doll.js?v=1";

const X = globalThis.RentalDoll;
const LW = 195, LH = 422, D2R = Math.PI / 180, NF = 30;
const U = 0.0146;   // 公尺／人偶單位（161cm＝110 單位）
const JPB = { cam: [0.05, 1.45, 0.05], vp: [97.5, 158], f: 128, yaw: 0 };
// 跟 /workspace/mock/venues.py 同一份（相機要跟 rental_room_paint／rental_bath_paint／rental_scenes_hm 一樣）
export const VENUE_CFG = {
  ryokan: {
    bed: { cam: [1.15, 1.5, -0.95], vp: [97.5, 200], f: 158, yaw: -19, O: [-0.75, 1.9], u: [1, 0], B: 0.5 },
    soak: { ...JPB, O: [0.95, 2.13], u: [-1, 0], B: 0.12, WATER: 0.56, TUB: [0.56, 1.5, 1.76, 2.5], ST: [0.7, 2.0] },
    stand: { ...JPB, ZC: 1.9, RIMX: 0.47, RIMY: 0.64, B: 0.0, water: null } },
  hotel: {
    bed: { cam: [1.25, 1.5, -0.2], vp: [97.5, 186], f: 176, yaw: -14, O: [-0.1, 3.05], u: [1, 0], B: 0.56 },
    soak: { cam: [0.15, 1.5, 0.35], vp: [97.5, 176], f: 150, yaw: 0, O: [0.51, 2.25], u: [-1, 0], B: 0.135, WATER: 0.575, TUB: [-0.1, 1.28, 1.88, 2.68], ST: [0.26, 2.12] },
    stand: { cam: [0.15, 1.5, 0.35], vp: [97.5, 176], f: 150, yaw: 0, ZC: 2.7, RIMX: -0.25, RIMY: 0.58, B: 0.0, water: null } },
  motel: {
    bed: { cam: [1.45, 1.55, 0.1], vp: [97.5, 182], f: 172, yaw: -16, O: [0.0, 3.75], u: [1, 0], B: 0.6 },
    soak: { cam: [0.25, 1.6, 0.45], vp: [97.5, 172], f: 150, yaw: 0, O: [0.345, 2.52], u: [-1, 0], B: 0.215, WATER: 0.655, TUB: [-1.0, 1.85, 2.15, 3.45], ST: [0.095, 2.39] },
    stand: { cam: [0.25, 1.6, 0.45], vp: [97.5, 172], f: 150, yaw: 0, ZC: 3.4, RIMX: 1.85, RIMY: 0.66, B: 0.2, water: [0.655, [-1.0, 1.85, 2.15, 3.45]] } },
};
const GIRL_RIM = [120, 92, 118], MAN_RIM = [96, 140, 220], BLUE = [46, 82, 170], WCOL = [120, 170, 185];

function mkproj(c) {
  const [cx, cy0, cz] = c.cam, Y = c.yaw * D2R, co = Math.cos(Y), sn = Math.sin(Y);
  return (x, y, z) => { const v0 = x - cx, v1 = y - cy0, v2 = z - cz, q0 = v0 * co - v2 * sn, q2 = v0 * sn + v2 * co; return [c.vp[0] + c.f * q0 / q2, c.vp[1] - c.f * v1 / q2]; };
}
function ray(c, sx, sy) {
  const Y = c.yaw * D2R, co = Math.cos(Y), sn = Math.sin(Y), q0 = (sx + .5 - c.vp[0]) / c.f, q1 = -(sy + .5 - c.vp[1]) / c.f;
  return [q0 * co + sn, q1, -q0 * sn + co];
}
/** 房間像素 → 卡片上的精靈座標（venues.card）。回 { idx: Int32Array（-1＝打不到）, Y: Float32Array（世界高度）}。 */
function card(c, O, u, B, SC, AX, AY, CW, CH) {
  const idx = new Int32Array(LW * LH).fill(-1), Yw = new Float32Array(LW * LH), n = [-u[1], u[0]], C = c.cam;
  for (let sy = 0; sy < LH; sy++) for (let sx = 0; sx < LW; sx++) {
    const d = ray(c, sx, sy), t = ((O[0] - C[0]) * n[0] + (O[1] - C[2]) * n[1]) / (d[0] * n[0] + d[2] * n[1]);
    const Xw = C[0] + d[0] * t, Y = C[1] + d[1] * t, Z = C[2] + d[2] * t, s = (Xw - O[0]) * u[0] + (Z - O[1]) * u[1];
    const PX = Math.round(AX + (s / U) * SC - .5), PY = Math.round(AY - ((Y - B) / U) * SC - .5), i = sy * LW + sx;
    Yw[i] = Y;
    if (t > 0 && PX >= 0 && PX < CW && PY >= 0 && PY < CH) idx[i] = PY * CW + PX;
  }
  return { idx, Y: Yw };
}
/** 水面（y＝yv）在浴缸範圍內的像素＋它的世界 x／z（漣漪用）。 */
function waterSurf(c, yv, T) {
  const ws = new Uint8Array(LW * LH), wx = new Float32Array(LW * LH), wz = new Float32Array(LW * LH), C = c.cam;
  for (let sy = 0; sy < LH; sy++) for (let sx = 0; sx < LW; sx++) {
    const d = ray(c, sx, sy), t = (yv - C[1]) / d[1], x = C[0] + d[0] * t, z = C[2] + d[2] * t, i = sy * LW + sx;
    wx[i] = x; wz[i] = z; ws[i] = t > 0 && x > T[0] && x < T[1] && z > T[2] && z < T[3] ? 1 : 0;
  }
  return { ws, wx, wz };
}
// ---------------------------------------------------------------- 精靈：她（renderSide）、他（藍色圓角線條）
function girlSprite(doll, pose, f, cv) {
  const { sh, P } = X.buildSex(doll, pose, f, {});
  const r = X.renderSide(sh, P, { ...cv, side: true });
  const px = r.pixels;
  for (let i = 3; i < px.length; i += 4) px[i] = px[i] > 0 ? 255 : 0;   // 不透明
  return px;
}
let mcv = null;
function manSprite(cv, draw) {
  const { w, h, ax, ay, scale: SC } = cv;
  if (!mcv) mcv = document.createElement("canvas");
  mcv.width = w; mcv.height = h;
  const g = mcv.getContext("2d");
  g.clearRect(0, 0, w, h); g.fillStyle = g.strokeStyle = "#fff"; g.lineCap = "round";
  const P = (y, z) => [ax + y * SC, ay - z * SC];
  const limb = (p, q, wd) => { const a = P(...p), b = P(...q); g.lineWidth = Math.max(1, Math.round(wd * SC)); g.beginPath(); g.moveTo(...a); g.lineTo(...b); g.stroke(); };
  const disk = (c, r) => { const a = P(...c); g.beginPath(); g.arc(a[0], a[1], r * SC, 0, 7); g.fill(); };
  draw(limb, disk);
  const src = g.getImageData(0, 0, w, h).data, out = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) if (src[i * 4 + 3] > 127) { out[i * 4] = BLUE[0]; out[i * 4 + 1] = BLUE[1]; out[i * 4 + 2] = BLUE[2]; out[i * 4 + 3] = 255; }
  return out;
}
const MAN = {
  // jpsexpx2.man
  bed: (pose, a) => (limb, disk) => {
    const hy = a.hip[1], hz = a.hip[2], p = a.p, out = 9 * (1 - p), lean = 5 * (p - .5);
    const body = (pel, dy, dz) => { const L = 29, n = Math.hypot(dy, dz), sh = [pel[0] + dy / n * L, pel[1] + dz / n * L]; limb(pel, sh, 11); disk([sh[0] + dy / n * 3 - 1.5, sh[1] + dz / n * 9], 6.5); return sh; };
    if (pose === "missionary") {
      const pel = [hy + 8 + out * 1.4, 9 + .8 * p], sh = body(pel, 12 - lean, 29);
      limb([sh[0] - 1, sh[1] - 4], [hy + 14, 22 + 1.5 * a.j], 4.5); limb(pel, [pel[0] + 4, 2], 8); limb([pel[0] + 4, 2], [pel[0] + 22, 1.5], 5.5);
    } else if (pose === "doggy") {
      const pel = [hy + 7 + out * 1.1, hz + 1], sh = body(pel, 7 - lean * 1.2, 27);
      limb([sh[0] - 1, sh[1] - 5], [hy + 3, hz + 4], 4.5); limb(pel, [pel[0] + 2, 2.5], 8); limb([pel[0] + 2, 2.5], [pel[0] + 19, 1.5], 5.5);
    } else {   // kiss：她坐在他腿上面對面；他坐在床上（在她右邊、+y），腿往前伸到她下面，頭湊過去貼著她的臉
      const hd = [a.head[1] + 15, a.head[2] + 1.5 + .4 * a.fwd], sh = [hd[0] + 4, hd[1] - 12.5], pel = [sh[0] + 2.5, 5];
      limb(pel, [hy - 4, 4], 8.5); limb([hy - 4, 4], [hy - 18, 1.5], 5.5);
      limb(pel, sh, 11.5); limb([sh[0] - .5, sh[1] + 2], [hd[0] + 1, hd[1] - 4.5], 4.5); disk(hd, 6.5);
    }
  },
  kissArm: (a) => (limb) => {   // 摟著她的背（畫在她前面）
    const hy = a.hip[1], hz = a.hip[2], sh = [a.head[1] + 19, a.head[2] - 11 + .4 * a.fwd];
    limb(sh, [hy + 2, hz + 15], 5); limb([hy + 2, hz + 15], [hy - 7, hz + 19], 4.5);
  },
  // jpbathpx.man（泡澡：他靠著浴缸一端，她坐在他腿上往後靠）
  soak: (f) => (limb, disk) => {
    const br = Math.sin(2 * Math.PI * f / 30), pel = [-24, 4], sh = [-28, 50 + .4 * br], hd = [-27, 62 + .4 * br];
    limb(pel, sh, 12); limb(sh, [sh[0] + .5, hd[1] - 4], 6); disk(hd, 6.5); limb(pel, [-2, 10], 8); limb([-2, 10], [26, 4], 6);
  },
  soakArm: (f) => (limb) => { const br = Math.sin(2 * Math.PI * f / 30); limb([-27, 48 + .4 * br], [-12, 30], 5); limb([-12, 27], [6, 25 + .6 * br], 4.5); },
  // jpbathstand.man（只動腰：腳踩地、膝蓋跟著彎、肩膀幾乎不動）
  stand: (a) => (limb, disk) => {
    const hy = a.hip[1], hz = a.hip[2], p = a.p, out = 9 * (1 - p), HREF = 0.5, HZ = a.hip[2];
    const pel = [hy + 9 + out * 1.1, HZ + 1], sh = [HREF + 17 - 0.12 * (pel[0] - (HREF + 14)), HZ + 29], hd = [sh[0] - 3.5, sh[1] + 13.5], LT = 27, LS = 27;
    for (const fy of [HREF + 19, HREF + 15]) {
      const ft = [fy, 2], dx = pel[0] - ft[0], dz = pel[1] - ft[1], L = Math.min(Math.hypot(dx, dz), LT + LS - .01);
      const ca = Math.max(-1, Math.min(1, (LS * LS + L * L - LT * LT) / (2 * LS * L))), base = Math.atan2(dz, dx), ang = base - Math.acos(ca);
      let kn = [ft[0] + LS * Math.cos(base + Math.acos(ca)), ft[1] + LS * Math.sin(base + Math.acos(ca))];
      if (kn[0] > Math.max(pel[0], ft[0])) kn = [ft[0] + LS * Math.cos(ang), ft[1] + LS * Math.sin(ang)];
      limb(pel, kn, 8.5); limb(kn, ft, 6); limb([ft[0] + 1.5, 1.4], [ft[0] - 5.5, 1.2], 4.5);
    }
    const mid = [(pel[0] + sh[0]) / 2, (pel[1] + sh[1]) / 2];
    limb(pel, [mid[0] + .5, mid[1]], 11.5); limb(mid, [sh[0], sh[1] - 2], 12.5); limb([sh[0] - 1, sh[1] + 2], [hd[0] + .5, hd[1] - 5], 4.2); disk(hd, 6.3);
    const el = [(sh[0] + hy + 4) / 2 + 2, (sh[1] + hz + 3) / 2 - 1]; limb([sh[0] - 1, sh[1] - 2], el, 5); limb(el, [hy + 4, hz + 3], 4.5);
  },
};
// ---------------------------------------------------------------- 骨架（jpx/bath.cjs、jpx/stand.cjs）
function soakRig(P, f, { mulR, rotX, rotY }) {
  const ph = 2 * Math.PI * f / 30, br = Math.sin(ph), Lt = P.hipz - P.knee;
  return { p: .5, j: .5, u: .5, H: [0, 0, 12 + .4 * br], R: rotX(22), lean: 0, headR: mulR(rotY(4 * Math.sin(ph)), rotX(-6)),
    knees: (s) => [s * 5.5, Lt - 4, 26], ankles: (s) => [s * 4.5, 36 + (s > 0 ? 2 : 0), 4], pole: (s) => [s * .3, .6, .4],
    wrists: (s) => [s * 7, 12, 26 + .5 * br], apole: (s) => [s * 1, .2, -.3], toe: [0, .8, .2], axis: "y", amp: 1.2, sway: 0, fwd: .6 * br };
}
const DR = [-1, 0, 0, 0, 0, -1, 0, -1, 0];
const standRig = (WR) => (P, f, { mulR, rotX, SEX_THRUST, HER_J }) => {
  const n = SEX_THRUST.length, i = ((f % n) + n) % n, p = SEX_THRUST[i], j = HER_J[i], u = HER_J[(i - 1 + n) % n];
  return { p, j, u, H: [0, 2 - 3.0 * j, P.hipz - 1.5], R: mulR(DR, rotX(-6 + 2.5 * u)), lean: -.04 - .03 * u, headR: rotX(30 + 6 * u),
    ankles: (s) => [s * 4.5, 7, P.ankle], pole: (s) => [s * .2, -1, .1], wrists: (s) => [s * 6, WR[0] - 1.5 * u, WR[1]], apole: (s) => [s * .4, .5, .3],
    toe: [0, -.98, -.1], foot: "flat", axis: "y", amp: 3.2 };
};
/** 胸型（使用者認可）：A／B／C 照他畫的三個胸型；D～I 前端圓球隨罩杯放大（jpx/stand.cjs CUPFIT）。 */
function cupHooks(cup) {
  const FIT = { A: [1.4, .2, 0], B: [1.0, .65, 2.2], C: [1.0, .65, 3] }[cup];
  if (FIT) return { rsc: FIT[0], lscale: FIT[1], bulb: FIT[2] };
  const RF = 5.7, cr = { A: 2.3, B: 3.1, C: 3.8, D: 4.5, E: 5.15, F: 5.7, G: 6.1, H: 6.55, I: 7.0 }[cup] ?? 4.5;
  return { rsc: 1, lscale: 1 + .12 * Math.min(1.3, cr / RF), bulb: (r) => r * (4.8 / RF) * Math.min(1.15, Math.pow(r / RF, .6)) };
}
function withHooks(h, fn) {
  const HK = X.HK, old = { ...HK };
  Object.assign(HK, { rig: null, noBreast: false, rsc: 1, lscale: 1, bulb: 0 }, h);
  try { return fn(); } finally { Object.assign(HK, old); }
}
// ---------------------------------------------------------------- 合成
function mapLayer(spr, idx, rimCol) {   // tomap＋rim
  const out = new Uint8ClampedArray(LW * LH * 4);
  for (let i = 0; i < LW * LH; i++) { const k = idx[i]; if (k >= 0 && spr[k * 4 + 3]) { out.set(spr.subarray(k * 4, k * 4 + 4), i * 4); } }
  return rim(out, rimCol);
}
function rim(a, col) {
  const al = (x, y) => a[(y * LW + x) * 4 + 3] > 0, edge = [];
  for (let y = 0; y < LH; y++) for (let x = 0; x < LW; x++) {
    if (!al(x, y)) continue;
    if ((y > 0 && !al(x, y - 1)) || (y < LH - 1 && !al(x, y + 1)) || (x > 0 && !al(x - 1, y)) || (x < LW - 1 && !al(x + 1, y))) edge.push(y * LW + x);
  }
  for (const i of edge) { a[i * 4] = col[0]; a[i * 4 + 1] = col[1]; a[i * 4 + 2] = col[2]; a[i * 4 + 3] = 255; }
  return a;
}
function over(dst, src) { for (let i = 0; i < LW * LH; i++) if (src[i * 4 + 3]) dst.set(src.subarray(i * 4, i * 4 + 4), i * 4); }
const FOOT = [[77, 249], [81, 248], [82, 251], [87, 256], [90, 257], [90, 258], [84, 258], [79, 255], [77, 252]], FOOT0 = [80, 257], PPM0 = 128 / (1.9 - 0.05);

/** 一個場景（房型＋地點＋姿勢）。bg：那間的背景畫布（195×422）。 */
export function makeCouple({ venue, scene, pose, doll, bg }) {
  const V = VENUE_CFG[venue] || VENUE_CFG.hotel;
  const kind = scene === "bed" ? "bed" : pose === "soak" ? "soak" : "stand";
  const c = V[kind], proj = mkproj(c);
  const D = { height_cm: Number(doll?.height_cm) || 161, build: doll?.build || "勻稱有致", cup: String(doll?.cup || "D").charAt(0).toUpperCase(), hair: doll?.hair || "long", skirt: "" };
  let cv, map, water = null, hooks = {}, rigPose, ms = (f) => X.SEX_FRAME_MS[f % X.SEX_FRAME_MS.length], k = 1, WR;
  if (kind === "bed") {
    cv = { w: 520, h: 240, ax: 290, ay: 210, scale: 2 };
    map = card(c, c.O, c.u, c.B, 2, cv.ax, cv.ay, cv.w, cv.h);
    rigPose = pose === "missionary" ? "sex_missionary" : pose === "doggy" ? "sex_doggy" : "sex_kiss";
  } else if (kind === "soak") {
    cv = { w: 300, h: 200, ax: 170, ay: 170, scale: 2 };
    map = card(c, c.O, c.u, c.B, 2, cv.ax, cv.ay, cv.w, cv.h);
    water = { y: c.WATER, ...waterSurf(c, c.WATER, c.TUB) };
    hooks = { rig: soakRig }; rigPose = "sex_kiss"; ms = () => 85;
  } else {
    cv = { w: 360, h: 250, ax: 180, ay: 240, scale: 2 };
    WR = [-40, (c.RIMY - c.B) / U + 1];
    const HX = c.RIMX + WR[0] * U;
    map = card(c, [HX, c.ZC], [-1, 0], c.B, 2, cv.ax, cv.ay, cv.w, cv.h);
    if (c.water) water = { y: c.water[0], ...waterSurf(c, c.water[0], c.water[1]) };
    hooks = { rig: standRig(WR), ...cupHooks(D.cup) }; rigPose = "sex_doggy";
    k = (c.f / (c.ZC - c.cam[2])) / PPM0;
  }
  const bgData = bg.getContext("2d").getImageData(0, 0, LW, LH).data;
  const frames = new Array(NF).fill(null);
  let fcv = null, fg = null;
  function build(f) {
    const a = withHooks(hooks, () => X.sexAnchor(D, rigPose, f));
    const gs = withHooks(hooks, () => girlSprite(D, rigPose, f, cv));
    let G = new Uint8ClampedArray(LW * LH * 4);
    for (let i = 0; i < LW * LH; i++) { const q = map.idx[i]; if (q >= 0 && gs[q * 4 + 3]) G.set(gs.subarray(q * 4, q * 4 + 4), i * 4); }
    if (kind === "stand") G = tiptoe(G);
    rim(G, GIRL_RIM);
    const layers = [];
    if (kind === "bed") {
      const M = mapLayer(manSprite(cv, MAN.bed(pose, a)), map.idx, MAN_RIM);
      layers.push(...(pose === "doggy" ? [G, M] : [M, G]));
      if (pose === "kiss" || pose === "undress") layers.push(mapLayer(manSprite(cv, MAN.kissArm(a)), map.idx, MAN_RIM));
    } else if (kind === "soak") {
      layers.push(mapLayer(manSprite(cv, MAN.soak(f)), map.idx, MAN_RIM), G, mapLayer(manSprite(cv, MAN.soakArm(f)), map.idx, MAN_RIM));
    } else layers.push(G, mapLayer(manSprite(cv, MAN.stand(a)), map.idx, MAN_RIM));
    // 合成到背景上
    const img = new Float32Array(LW * LH * 3);
    for (let i = 0; i < LW * LH; i++) { img[i * 3] = bgData[i * 4]; img[i * 3 + 1] = bgData[i * 4 + 1]; img[i * 3 + 2] = bgData[i * 4 + 2]; }
    const ph = 2 * Math.PI * f / 30;
    if (kind === "soak") for (let i = 0; i < LW * LH; i++) if (water.ws[i]) {
      const rip = (Math.sin(water.wx[i] * 60 + ph * 2) + Math.sin(water.wz[i] * 45 - ph * 3)) * .5, add = rip > .7 ? 25 : 0;
      for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = img[i * 3 + ch] * .45 + WCOL[ch] * .55 + add;
    }
    let x0 = LW, y0 = LH, x1 = 0, y1 = 0;
    for (const Lr of layers) for (let i = 0; i < LW * LH; i++) {
      if (!Lr[i * 4 + 3]) continue;
      const x = i % LW, y = (i / LW) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (water && map.Y[i] < water.y) {   // 水面以下：只在水裡淡淡看得到
        if (!water.ws[i]) continue;
        for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = Lr[i * 4 + ch] * .35 + img[i * 3 + ch] * .65;
      } else for (let ch = 0; ch < 3; ch++) img[i * 3 + ch] = Lr[i * 4 + ch];
    }
    if (water) for (let i = 0; i < LW * LH; i++) if (water.ws[i] && Math.abs(map.Y[i] - water.y) < 0.012 && Math.sin((i % LW) * 1.3 + ph * 4) > 0.3) { img[i * 3] = 220; img[i * 3 + 1] = 240; img[i * 3 + 2] = 245; }
    const out = document.createElement("canvas"); out.width = LW; out.height = LH;
    const og = out.getContext("2d"), id = og.createImageData(LW, LH);
    for (let i = 0; i < LW * LH; i++) { id.data[i * 4] = img[i * 3]; id.data[i * 4 + 1] = img[i * 3 + 1]; id.data[i * 4 + 2] = img[i * 3 + 2]; id.data[i * 4 + 3] = 255; }
    og.putImageData(id, 0, 0);
    if (kind === "soak") {   // 蒸氣
      for (let s = 0; s < 6; s++) {
        const q = (f / 30 + s / 6) % 1, [cx, cy] = proj(c.ST[0] + 0.13 * s + 0.03 * Math.sin(ph + s), c.WATER + q * 0.7, c.ST[1] + 0.08 * (s % 3)), r = 2 + 3 * q;
        og.fillStyle = `rgba(235,235,240,${(70 * (1 - q)) / 255})`; og.beginPath(); og.ellipse(cx, cy, r, r, 0, 0, 7); og.fill();
      }
    }
    return { canvas: out, box: x1 >= x0 ? { x0, y0, x1, y1 } : null, ms: ms(f) };
  }
  // 踮腳尖：把她腳底那一小截清掉，畫使用者認可的腳掌（腳跟抬高、前腳掌和腳趾著地、朝浴缸）
  function tiptoe(gm) {
    const al = (x, y) => gm[(y * LW + x) * 4 + 3] > 0;
    let yb = -1;
    for (let y = LH - 1; y >= 0 && yb < 0; y--) for (let x = 0; x < LW; x++) if (al(x, y)) { yb = y; break; }
    if (yb < 4) return gm;
    let xs = []; for (let x = 0; x < LW; x++) if (al(x, yb - 3)) xs.push(x);
    if (!xs.length) return gm;
    const med = xs.slice().sort((a, b) => a - b)[xs.length >> 1]; xs = xs.filter((x) => Math.abs(x - med) < 8);
    const xb = Math.floor(xs.reduce((a, b) => a + b, 0) / xs.length);
    const cols = [[], [], []];
    for (let y = Math.max(0, yb - Math.floor(25 * k)); y < yb - Math.floor(6 * k); y++) for (let x = 0; x < LW; x++) if (al(x, y)) for (let ch = 0; ch < 3; ch++) cols[ch].push(gm[(y * LW + x) * 4 + ch]);
    const col = cols.map((a) => (a.length ? a.sort((p, q) => p - q)[a.length >> 1] : 40));
    for (let y = yb - Math.round(4 * k); y < yb + 3; y++) for (let x = Math.max(0, xb - Math.floor(20 * k)); x < xb + Math.floor(20 * k); x++) if (y >= 0 && y < LH && x < LW) gm.fill(0, (y * LW + x) * 4, (y * LW + x) * 4 + 4);
    if (!fcv) { fcv = document.createElement("canvas"); fcv.width = LW; fcv.height = LH; fg = fcv.getContext("2d"); }
    fg.clearRect(0, 0, LW, LH); fg.fillStyle = `rgb(${col.join(",")})`; fg.beginPath();
    FOOT.forEach(([x, y], i) => { const px = xb + (x - FOOT0[0]) * k, py = yb + (y - FOOT0[1]) * k; i ? fg.lineTo(px, py) : fg.moveTo(px, py); });
    fg.closePath(); fg.fill();
    const fd = fg.getImageData(0, 0, LW, LH).data;
    for (let i = 0; i < LW * LH; i++) if (fd[i * 4 + 3] > 127) { gm[i * 4] = col[0]; gm[i * 4 + 1] = col[1]; gm[i * 4 + 2] = col[2]; gm[i * 4 + 3] = 255; }
    return gm;
  }
  let done = 0, t0 = 0, cur = 0, curAt = 0;
  /** 每畫面呼叫：先算下一格（一次一格），再照每格的毫秒數播已經算好的。 */
  function frame(now) {
    if (done < NF) { frames[done] = build(done); done++; }
    if (!t0) { t0 = now; curAt = now; }
    while (now - curAt >= (frames[cur]?.ms || 80)) { curAt += frames[cur]?.ms || 80; cur = (cur + 1) % NF; if (cur >= done) cur = 0; }
    return frames[Math.min(cur, done - 1)];
  }
  return { frame, buildAll: () => { while (done < NF) { frames[done] = build(done); done++; } return frames; }, get ready() { return done >= NF; } };
}
