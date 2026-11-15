// 胸部模組樣品：node samples/chest2d/preview.cjs <輸出.png>
// 上排＝現在的拆部位（chest＋圓形 D 乳房），下排＝chest2d.js（D）；正面／右／左，最後一列 B／C／D 正面。
const R = __dirname + '/../..', fs = require('fs'), PS = require(R + '/parts_shade.js'), png = require(R + '/png.cjs'), C2 = require(R + '/chest2d.js');
const zlib = require('zlib');
function readPng(f) {   // 只讀 8 位元 RGBA、非交錯（parts2x 就是這種）
  const b = fs.readFileSync(f); let p = 8, w, h, idat = [];
  while (p < b.length) { const n = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + n);
    if (t === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); } else if (t === 'IDAT') idat.push(d); p += 12 + n; }
  const raw = zlib.inflateSync(Buffer.concat(idat)), out = new Uint8Array(w * h * 4), bpp = 4, st = w * 4;
  for (let y = 0; y < h; y++) { const ft = raw[y * (st + 1)];
    for (let x = 0; x < st; x++) { const r = raw[y * (st + 1) + 1 + x], a = x >= bpp ? out[y * st + x - bpp] : 0, u = y ? out[(y - 1) * st + x] : 0, c = x >= bpp && y ? out[(y - 1) * st + x - bpp] : 0;
      let v = r; if (ft === 1) v += a; else if (ft === 2) v += u; else if (ft === 3) v += (a + u) >> 1; else if (ft === 4) { const pp = a + u - c, pa = Math.abs(pp - a), pb = Math.abs(pp - u), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? u : c; }
      out[y * st + x] = v & 255; } }
  return { w, h, d: out };
}
const W = 128, H = 280, n = W * H;
const frame = f => { const im = readPng(f), o = new Uint8Array(n * 4); for (let y = 0; y < H; y++) o.set(im.d.subarray(y * im.w * 4, y * im.w * 4 + W * 4), y * W * 4); return o; };
const P = (p, d) => frame(`${R}/parts2x/walk/balanced_${p}_${d}.png`), B = (cup, d) => frame(`${R}/parts2x/walk/breast/balanced_round_${cup}_medium_${d}.png`);
const MAP = { '51,45,64': [242, 204, 177], '134,112,152': [216, 166, 140], '30,24,40': [184, 124, 104], '33,27,45': [184, 124, 104], '240,240,240': [255, 255, 255], '150,100,128': [222, 150, 146], '205,150,175': [196, 108, 112], '90,60,60': [216, 166, 140], '110,75,75': [236, 197, 171], '31,24,42': [60, 50, 70] };
const tint = px => { for (let i = 0; i < n; i++) { if (!px[i * 4 + 3]) continue; const m = MAP[px[i * 4] + ',' + px[i * 4 + 1] + ',' + px[i * 4 + 2]]; if (m) px.set(m, i * 4); px[i * 4 + 3] = 255; } return px; };
const over = (dst, src) => { for (let i = 0; i < n; i++) if (src[i * 4 + 3]) dst.set(src.subarray(i * 4, i * 4 + 4), i * 4); return dst; };
const OLD = ['head', 'chest', 'waist', 'hips', 'torso', 'armL', 'armR', 'legs'];
const old = (d, cup) => tint(PS.shade(PS.merge(OLD.map(p => P(p, d)).concat([B(cup, d)]), n), W, H));
const neu = (d, cup) => {
  const base = tint(PS.shade(PS.merge(['head', 'waist', 'hips', 'torso', 'legs'].map(p => P(p, d)), n), W, H));
  // 順序：胸廓 → 手臂 → 乳房（乳房蓋在手臂內緣前面）；側面只畫近的那隻手
  over(base, C2.draw({ cup, dir: d, layer: 'torso' }).pixels);
  over(base, tint(PS.shade(PS.merge((d === 'front' ? ['armL', 'armR'] : [d === 'right' ? 'armL' : 'armR']).map(p => P(p, d)), n), W, H)));
  over(base, C2.draw({ cup, dir: d, layer: 'breast' }).pixels);
  return over(base, tint(PS.shade(PS.merge([P('head', d)], n), W, H)));   // 頭最後蓋（下巴蓋住脖子）
};
const cells = [[old('front', 'D'), old('right', 'D'), old('left', 'D')], [neu('front', 'D'), neu('right', 'D'), neu('left', 'D')], [neu('front', 'B'), neu('front', 'C'), neu('front', 'D')]];
const Y0 = 56, CH = 80, X0 = 20, CW = 88, BG = [46, 50, 60], OW = CW * 3, OH = CH * cells.length, out = new Uint8ClampedArray(OW * OH * 4);
for (let i = 0; i < OW * OH; i++) out.set([...BG, 255], i * 4);
cells.forEach((row, r) => row.forEach((px, c) => { for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const s = ((y + Y0) * W + x + X0) * 4; if (px[s + 3]) out.set(px.subarray(s, s + 3), ((r * CH + y) * OW + c * CW + x) * 4); } }));
png({ width: OW, height: OH, pixels: out }, +(process.env.UP || 4), process.argv[2] || __dirname + '/preview.png');
