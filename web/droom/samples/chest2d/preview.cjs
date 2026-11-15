// 胸部模組樣品（只畫胸部模組，不疊頭／腰／手）：node samples/chest2d/preview.cjs <輸出.png>
// 上排 D：左／左前／正面／右前／右；下排正面 B／C／D ＋ 右前 B／D。
const R = __dirname + '/../..', png = require(R + '/png.cjs'), C2 = require(R + '/chest2d.js');
const W = 128, rows = [
  [['left', 'D'], ['front_left', 'D'], ['front', 'D'], ['front_right', 'D'], ['right', 'D']],
  [['front', 'B'], ['front', 'C'], ['front', 'D'], ['front_right', 'B'], ['front_right', 'D']],
];
const Y0 = 58, CH = 72, X0 = 30, CW = 68, BG = [46, 50, 60], cols = rows[0].length, OW = CW * cols, OH = CH * rows.length;
const out = new Uint8ClampedArray(OW * OH * 4);
for (let i = 0; i < OW * OH; i++) out.set([...BG, 255], i * 4);
rows.forEach((row, r) => row.forEach(([dir, cup], c) => {
  const px = C2.draw({ dir, cup }).pixels;
  for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const s = ((y + Y0) * W + x + X0) * 4; if (px[s + 3]) out.set(px.subarray(s, s + 3), ((r * CH + y) * OW + c * CW + x) * 4); }
}));
png({ width: OW, height: OH, pixels: out }, +(process.env.UP || 5), process.argv[2] || __dirname + '/preview.png');
