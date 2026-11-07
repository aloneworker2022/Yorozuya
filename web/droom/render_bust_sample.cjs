// 乳型樣本對照表（2026-11-07）：勻稱體型、指定乳暈；每列一個罩杯、每欄 乳型 × 方向（站姿走路第 0 格，2×）。
// 用法：SHAPES=round,dome CUPS=A,C,E DIRS=front,front_right,right AREOLA=medium OUT=xxx.png node render_bust_sample.cjs
const D = require(__dirname + '/room_doll_full.js'), png = require(__dirname + '/png.cjs');
const env = (k, def) => process.env[k] ? process.env[k].split(',') : def;
const SHAPES = env('SHAPES', ['round', 'dome']), CUPS = env('CUPS', ['A', 'C', 'E']), DIRS = env('DIRS', ['front', 'front_right', 'right']);
const DIR = { front: 0, front_right: 45, right: 90, back: 180, left: -90 };
const K = +(process.env.K || 2), FW = 64 * K, FH = 140 * K, CROP = [Math.round(FH * (+process.env.Y0 || .16)), Math.round(FH * (+process.env.Y1 || .58))];   // 只留胸口上下
// 排法：每列一個罩杯、每欄 乳型 × 方向（手機直的看）
const CH = CROP[1] - CROP[0], W = FW * SHAPES.length * DIRS.length, H = CH * CUPS.length;
const S = { width: W, height: H, pixels: new Uint8ClampedArray(W * H * 4) };
for (let i = 0; i < W * H; i++) S.pixels.set([236, 232, 226, 255], i * 4);
SHAPES.forEach((sh, ri) => CUPS.forEach((c, ci) => DIRS.forEach((d, di) => {
  const doll = D.lookToDoll({ height_cm: 161, build: '勻稱有致', cup: c + ' 罩杯' });
  doll.shape = sh; doll.areola = process.env.AREOLA || 'medium'; doll.hair = 'none'; doll.face = 'anime';
  const px = D.render(doll, 'walk', 0, DIR[d], { scale: K }).pixels, x0 = (ri * DIRS.length + di) * FW, y0 = ci * CH;
  for (let y = 0; y < CH; y++) for (let x = 0; x < FW; x++) {
    const si = ((y + CROP[0]) * FW + x) * 4; if (!px[si + 3]) continue;
    const a = px[si + 3] / 255, di2 = ((y0 + y) * W + x0 + x) * 4;
    for (let k = 0; k < 3; k++) S.pixels[di2 + k] = Math.round(px[si + k] * a + S.pixels[di2 + k] * (1 - a));
  }
  for (let y = 0; y < CH; y++) S.pixels.set(di ? [215, 208, 200, 255] : [120, 110, 100, 255], ((y0 + y) * W + x0) * 4);   // 欄分隔線（乳型之間較深）
  for (let x = 0; x < FW; x++) S.pixels.set([180, 170, 160, 255], (y0 * W + x0 + x) * 4);   // 列分隔線
})));
png(S, +(process.env.SCALE || 2), process.env.OUT || __dirname + '/bust_sample.png');
console.log('ok', SHAPES.join('/'), CUPS.join(''), DIRS.join('/'), W, H);
