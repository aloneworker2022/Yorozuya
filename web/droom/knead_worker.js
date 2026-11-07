// 2026-11-07 揉乳房視窗的背景算圖（droom index.html 最下面）。主執行緒一次只送一張，算完回傳原始資料（parts_shade 格式：深度＋標記）。
//   setup：先依乳房大小定取景（脖子下 → 乳房最低點＋往下拉的空間；橫幅含兩顆乳房＋往外拉的空間），再算底圖（被揉那一顆以外的全部，只算一次）
//   frame：被揉的那一顆（kneadOnly），只算乳房附近的框
//   回傳原始資料（不壓成 16 位元：壓了深度會一圈一圈，打光看得出來）：hit、深度 tt（Float32）、標記 code（同 parts_shade）
function pack(g) {
  const n = g.hit.length, tt = new Float32Array(n), code = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (g.hit[i]) { tt[i] = g.tt[i]; code[i] = g.mat[i] === 2 ? 120 : g.mat[i] === 3 ? (g.bust[i] === 98 ? 123 : g.bust[i] === 99 ? 122 : 121) : g.bust[i] & 127; }
  return { hit: g.hit, tt, code };
}
const xfer = (G) => [G.hit.buffer, G.tt.buffer, G.code.buffer];
importScripts('/droom/room_doll_full.js?v=9');
const D = self.RoomDoll;
const GIRTH = 1.1;   // room_doll_full.js 的 GIRTH（左右拉寬）
let look = null, K = 2, cam = null, box = null;
const mk = (o, pinch) => {
  const d = D.lookToDoll({ height_cm: 161, build: look.build || '勻稱有致', cup: look.cup + ' 罩杯' });
  d.shape = look.shape; d.areola = look.areola; d.hair = 'none'; d.face = 'anime';
  d.knead = { side: 1, o, pinch };
  return d;
};
// 取景（使用者：胸部為主、從脖子下開始、橫幅大一點；很垂的照比例拉大畫面）
function frameCam(maxPull) {
  const { sh, P } = D.build(mk([0, 0, 0], 0), 'idle', 0, 0, {});
  const kn = sh.knead, r = kn.r, nip = kn.nip;
  let low = nip[2] - r * 1.2;   // 乳房最低點：掃被揉那顆的零件
  for (const p of sh.prims) if (p.kw && p.k === 0) low = Math.min(low, p.c[2] - p.r[2]);
  const pull = maxPull * r;
  const xr = Math.max(nip[0] + r * 1.5 + pull * .8, 11.5);
  const Wx = 2 * xr + 2, zTop = P.S + .8, zBot = low - pull - 1.5, Hz = zTop - zBot;
  const w = 220, dist = 220, f = w * dist / Wx, h = Math.round(Hz * f / (dist * GIRTH));
  return { dist, eyeZ: (zTop + zBot) / 2, pitch: 0, f, w, h, cx: w / 2, cy: h / 2 };
}
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'setup') {
    look = m.look; K = m.K;
    cam = frameCam(m.maxPull || 1);
    const g = D.render(mk([0, 0, 0], 0), 'idle', 0, 0, { scale: K, cam, gbuf: true, bakeStamps: true, kneadSkip: true, refine: true });
    const k = g.knead, R = k.r * k.pxPerUnit, pad = R * (1.6 + (m.maxPull || 1) * 1.3);
    box = [Math.floor(k.nip[0] - pad), Math.floor(k.nip[1] - pad * 1.1), Math.ceil(k.nip[0] + pad), Math.ceil(k.nip[1] + pad * 1.3)];
    const G = pack(g);
    self.postMessage({ type: 'base', gen: m.gen, G, knead: k, W: g.width, H: g.height, cam, K, cupBounce: D.CUP_BOUNCE[look.cup] ?? .8 }, xfer(G));
  } else if (m.type === 'frame') {
    const g = D.render(mk(m.o, m.pinch), 'idle', 0, 0, { scale: K, cam, gbuf: true, bakeStamps: true, kneadOnly: true, box, refine: true });
    const G = pack(g);
    self.postMessage({ type: 'frame', gen: m.gen, key: m.key, G, knead: g.knead }, xfer(G));
  }
};
