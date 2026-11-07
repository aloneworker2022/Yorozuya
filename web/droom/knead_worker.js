// 2026-11-07 揉乳房視窗的背景算圖（droom index.html 最下面）。主執行緒一次只送一張，算完回傳原始資料（parts_shade 格式）。
//   setup：底圖＝除了被揉那一顆以外的全部（kneadSkip），只算一次
//   frame：被揉的那一顆（kneadOnly），只算乳房附近的框
importScripts('/droom/room_doll_full.js?v=5', '/droom/parts_shade.js?v=3');
const D = self.RoomDoll, PS = self.PartsShade;
let look = null, K = 2, cam = null, box = null;
const mk = (o, pinch) => {
  const d = D.lookToDoll({ height_cm: 161, build: look.build || '勻稱有致', cup: look.cup + ' 罩杯' });
  d.shape = look.shape; d.areola = look.areola; d.hair = 'none'; d.face = 'anime';
  d.knead = { side: 1, o, pinch };
  return d;
};
self.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'setup') {
    look = m.look; K = m.K; cam = m.cam;
    const g = D.render(mk([0, 0, 0], 0), 'idle', 0, 0, { scale: K, cam, gbuf: true, bakeStamps: true, kneadSkip: true });
    const k = g.knead, R = k.r * k.pxPerUnit, pad = R * 2.9;
    box = [Math.floor(k.nip[0] - pad), Math.floor(k.nip[1] - pad * 1.15), Math.ceil(k.nip[0] + pad), Math.ceil(k.nip[1] + pad * 1.25)];
    const px = PS.encode(g);
    self.postMessage({ type: 'base', gen: m.gen, px, knead: k, W: g.width, H: g.height, cupBounce: D.CUP_BOUNCE[look.cup] ?? .8 }, [px.buffer]);
  } else if (m.type === 'frame') {
    const g = D.render(mk(m.o, m.pinch), 'idle', 0, 0, { scale: K, cam, gbuf: true, bakeStamps: true, kneadOnly: true, box });
    const px = PS.encode(g);
    self.postMessage({ type: 'frame', gen: m.gen, key: m.key, px, knead: g.knead }, [px.buffer]);
  }
};
