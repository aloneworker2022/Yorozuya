// 胸部研習（2026-11-08）：原本人偶（勻稱、161 cm、C 罩杯、站姿手自然下垂、拿掉乳房）的正面剪影 → mask_nobust.png（K=4）
// 紅＝軀幹、藍＝手腳（limb）；ribcage.py／color12.py 讀這張當底。
// 用法：node mask.cjs <輸出資料夾>
const DR = __dirname + '/../..', D = require(DR + '/room_doll_full.js'), png = require(DR + '/png.cjs'), OUT = process.argv[2] || __dirname;
const doll = D.lookToDoll({ height_cm: 161, build: '勻稱有致', cup: 'C 罩杯' });
doll.shape = 'round'; doll.areola = 'medium'; doll.hair = 'none'; doll.face = 'anime'; doll._noBust = 1;
const K = 4, g = D.render(doll, 'walk', 0, 0, { scale: K, gbuf: true, stand: true }), W = g.width, H = g.height;
const S = { width: W, height: H, pixels: new Uint8ClampedArray(W * H * 4) };
for (let i = 0; i < W * H; i++) S.pixels.set(g.hit[i] ? (g.limb[i] ? [0, 0, 255, 255] : [255, 0, 0, 255]) : [0, 0, 0, 0], i * 4);
require('fs').mkdirSync(OUT, { recursive: true }); png(S, 1, OUT + '/mask_nobust.png');
console.log('ok', W, H, OUT + '/mask_nobust.png');
