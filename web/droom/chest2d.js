/* 2026-11-15 胸部模組（2D 像素，樣品；還沒接進遊戲）
   取代拆部位的 chest（脖子＋肩＋胸廓）＋ breast 兩塊，只畫胸部這一段：直接在 parts2x 的格子裡畫
   （一格 128×280、K＝2，位置對齊 parts2x/walk 的各方向），頭、腰、手、腿是別的模組。
   畫法照使用者給的參考：先胸廓再掛乳房；肩膀＝脖子 → 斜方肌斜下 → 肩角；鎖骨中間有凹口；
   乳房是微微下垂的水滴（不是圓球）：上半是從胸口斜下來的斜坡（上緣不畫線）、重量在下半、最寬在乳頭線下面、
   乳頭在中心偏下、微微朝下；外線從腋下的段差開始、往外鼓過胸廓；側面乳頭凸出輪廓外。
   上色：droom 三階肉色平塗（肉色／陰影／深色），深色只用在輪廓、下乳的摺、乳溝最靠近那一點。
   draw({ cup:'D', shape:'round', dir, shade:true, layer:'torso'|'breast' }) → { width, height, pixels }（RGBA，沒畫到的地方透明）。
   dir：front／front_right／front_left／right／left（背面三個方向還沒做）。cup：B／C／D（同一個形狀縮放）。
   layer：'torso' 只胸廓、'breast' 只乳房（讓手臂可以夾在中間），沒給＝全部。 */
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.Chest2D = api; })(this, function () {
  let W = 128, H = 280; const CX = 63.5;   // W／H 在 draw 裡照 scale 設（scale:2＝解析度加倍，256×560）
  const SKIN = [242, 204, 177], SHADOW = [216, 166, 140], DARK = [184, 124, 104];
  const AREOLA = [222, 150, 146], NIP = [196, 108, 112];
  // 罩杯：對 D 的倍率（寬、長、乳暈），使用者 11-08 研習的 B／C／D 比例
  const CUPS = { A: [.52, .42, .7], B: [.77, .67, .76], C: [.82, .75, .84], D: [1, 1, 1], E: [1.1, 1.14, 1.08], F: [1.2, 1.28, 1.15], G: [1.3, 1.42, 1.22], H: [1.4, 1.56, 1.3], I: [1.5, 1.7, 1.36] };   // B／C／D 照 11-08 研習的比例，其他照舊模型的階梯往兩頭推
  // 乳型（都以圓形為底去變形）：ky 往下拉長、w0／w1 上端／下端的寬度倍率、splay 下端往外撇、lift 整顆上下移、in 往中間靠、
  //   nipDy 乳頭再往下、down 側面乳頭朝下、p0／p1 側面上端／下端往前凸的倍率、back 側面下端往身體收
  const SHAPE_T = {
    round: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, p0: 1, p1: 1, back: 0 },
    flat: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, p0: 1, p1: 1, back: 0 },
    dome: { ky: .88, w0: 1.06, w1: 1.02, splay: 0, lift: 0, in: 0, nipDy: -.8, p0: .74, p1: .66, back: 0 },                    // 饅頭：底寬、矮、往前凸得少
    perky: { ky: .9, w0: .94, w1: .94, splay: 0, lift: -1.6, in: 0, nipDy: -1.8, up: 1, p0: .95, p1: .95, back: 0, hollow: 1 },   // 挺俏：位置高、上半直斜坡、乳頭上翹
    wide: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, p0: 1, p1: 1, back: 0, wideOut: 1 },                         // 外擴／八字：整顆往外開、中間本來就有縫、不擠
    close: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, p0: 1, p1: 1, back: 0, pressAll: 1 },                       // 極密著深溝：任何罩杯都擠成一條長乳溝
    teardrop: { ky: 1.16, w0: .9, w1: 1.04, splay: .6, lift: 0, in: 0, nipDy: 1.2, p0: .82, p1: 1.02, back: .6, hollow: 1 },   // hollow：上胸是扁的、微微凹的斜坡，肉都在下半
    bell: { ky: 1.1, w0: .72, w1: 1.12, splay: .4, lift: 0, in: 0, nipDy: .6, p0: .62, p1: 1.08, back: 0 },
    // 下垂、托高不是變形，另外畫（OVERRIDE）
    pendulous: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, up: 1, p0: 1, p1: 1, back: 0 },      // 下垂・飽滿、乳頭上翹
    papaya: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, down: 1, p0: 1, p1: 1, back: 0 },        // 下垂・木瓜、乳頭朝下
    sup: { ky: 1, w0: 1, w1: 1, splay: 0, lift: 0, in: 0, nipDy: 0, p0: 1, p1: 1, back: 0 },
  };
  const NIP_OUT = 4.2, OUT_BULGE = 2, OUT_SPLAY = 1.4;   // 乳頭往外側移幾格、外半邊多鼓幾格（D）
  // 遊戲的罩杯 × 乳型配對表（web/content/girl_gen.js BREAST_FIT）：這裡的 11 種乳型一對一；0＝不會出現（不畫）
  const FIT = {
    flat: ['平坦／微隆', 'AB'], dome: ['饅頭型', 'ABCDE'], perky: ['挺俏上挺', 'ABCDEF'], hemisphere: ['半球型', 'BCDEFGH'], round: ['自然圓潤', 'BCDEFG'],
    wide: ['外擴／八字', 'BCDEFGHI'], teardrop: ['水滴型', 'CDEFGHI'], close: ['極密著深溝', 'CDEFGHI'], papaya: ['木瓜型', 'DEFGHI'], bell: ['鐘型', 'DEFGHI'], heavy: ['母乳型沉重下垂', 'EFGHI'],
  };
  const mirror = pts => pts.map(([x, y]) => [2 * CX - x, y]);

  // ── 形狀（格子絕對座標；D 罩杯）──
  // 乳房：pts 閉合曲線、line＝[從, 到] 畫輪廓的那一段（上緣斜坡不畫）、nip 乳頭、ar 乳暈半徑（0＝側面看不到）、
  //   out＝側面乳頭往外凸的方向（+1 右、−1 左）、base 罩杯縮放基準點。後面的乳房蓋前面的。
  const FR_BR = [[63.5 + 17.6, 99.4], [63.5 + 18.6, 101.6], [63.5 + 19.9, 104], [63.5 + 21.2, 107.4], [63.5 + 21.4, 110.4], [63.5 + 20, 113.6], [63.5 + 16.8, 116.3],
    [63.5 + 12.5, 117.2], [63.5 + 8, 116], [63.5 + 4.4, 113], [63.5 + 2.4, 109.5], [63.5 + 2, 106], [63.5 + 2.8, 102.5], [63.5 + 5.5, 99.8], [63.5 + 9.5, 98], [63.5 + 14, 97.6]];
  const FRONT_TORSO_R = [[0, 63], [4, 63], [4, 72], [4.3, 77], [6.5, 80], [10.5, 82.5], [15.5, 84], [20, 85.5], [23.5, 87.5], [25, 90.5], [25, 94],
    [23, 97.5], [19.5, 99.5], [17, 102], [16, 106], [15.6, 110], [15, 114], [13.8, 118], [12.8, 122], [12.6, 126], [0, 126]];
  const SHAPES = {
    front: {
      front: 1,
      torso: FRONT_TORSO_R.map(([x, y]) => [CX + x, y]).concat(FRONT_TORSO_R.slice().reverse().map(([x, y]) => [CX - x, y])),
      breasts: [
        { pts: FR_BR, line: [0, 12], nip: [CX + 13.4, 108.6], ar: 2.3, base: [CX + 12, 99.4], cleave: 1, crease: [[CX + 19.6, 96.4], [CX + 18.4, 97.8]], tail: -1 },
        { pts: mirror(FR_BR), line: [0, 12], nip: [CX - 13.4, 108.6], ar: 2.3, base: [CX - 12, 99.4], cleave: -1, crease: [[CX - 19.6, 96.4], [CX - 18.4, 97.8]], tail: 1 },
      ],
      clavicle: [[[CX + 1.2, 86.5], [CX + 5, 85.6], [CX + 10, 85.8], [CX + 14.5, 85.2], [CX + 17.5, 85.6]], [[CX - 1.2, 86.5], [CX - 5, 85.6], [CX - 10, 85.8], [CX - 14.5, 85.2], [CX - 17.5, 85.6]]],
      notch: [CX, 87], cleaveDot: [CX, 110.5],
    },
    // 斜前 45°（她轉向畫面右邊）：右邊那顆在遠側、看到側面輪廓凸出胸廓；左邊那顆在近側、比較正面、蓋住遠的那顆內側
    front_right: {
      torso: [[62, 63], [69, 63], [69.5, 72], [70.5, 78], [74, 81], [79, 84], [82, 87], [83.3, 90.5], [82.5, 94], [79, 97], [78, 101], [77.6, 106], [76.6, 110],
        [75, 114], [73.5, 118], [73, 126], [55, 126], [54.5, 118], [52.5, 113], [51, 108], [50.5, 102], [50, 97], [46, 94], [45, 90], [46.5, 87], [50, 84.5],
        [55, 82], [59, 79.5], [61.5, 76], [62, 70]],
      breasts: [
        { pts: [[77.8, 96.6], [81.4, 98.2], [84.8, 100.8], [87.4, 104.4], [88.5, 108.2], [87.8, 111.8], [85.6, 114.8], [82, 116.7], [78, 117.2], [74, 116.2], [71.5, 110], [72.5, 101]],
          line: [0, 9], nip: [88.3, 108.8], ar: 0, out: 1, base: [77.8, 96.6], shadeIn: 79 },
        { pts: [[54, 99.2], [54.2, 102.6], [54.9, 106.6], [56.2, 110.4], [58.4, 114], [61.8, 116.7], [66.2, 117.4], [70.2, 116.3], [73.2, 113.2], [74.6, 109.2], [74.5, 105],
          [73.2, 101.8], [70, 99.4], [65, 98], [59, 97.8]], line: [0, 10], nip: [67.2, 108.8], ar: 2.1, arX: .8, base: [60, 99.2], crease: [[50.6, 96.2], [52.2, 97.9]], tail: 1 },
      ],
      clavicle: [[[66, 86.4], [70, 85.6], [74, 85.4], [77.5, 85.9]], [[64, 86.6], [60, 85.8], [55.5, 85.6], [51.5, 86.2]]],
      notch: [65, 87],
    },
    // 側面（面向右）
    right: {
      sideView: 1,
      torso: [[63, 63], [70, 63], [70.5, 72], [70.8, 78], [72.6, 83], [73.6, 86], [74.4, 90], [74.8, 96], [75, 104], [74.6, 110], [74.2, 114.5],
        [73.6, 119], [73.2, 126], [55, 126], [55.6, 119], [54.6, 112], [54, 104], [54.2, 96], [55.2, 90], [57.4, 84.5], [60.5, 80.5], [62.4, 76], [63, 70]],
      breasts: [
        { pts: [[73.6, 88], [77.2, 91.2], [80.8, 94.8], [84.2, 99], [86.8, 103.4], [87.8, 107.4], [87.2, 110.6], [85, 113.8], [81.4, 116.2], [77.4, 116.9],
          [74.2, 116], [72.4, 112], [72.4, 100], [72.6, 90]], line: [0, 10], nip: [87.6, 107.8], ar: 0, out: 1, base: [74, 92], shadeIn: 80 },
      ],
      fold: [[77.4, 116.9], [74.2, 116], [72, 114.6]],
      clavicle: [[[66.5, 85], [69.5, 84.6], [72, 84.4]]],
    },
  };
  // 半球（托高）：從外上開始、繞過底、到內上（這段畫線），最後是上緣（不畫線）；o＝外側方向
  const dome = (cx, cy, rx, ry, o) => [-35, -10, 15, 40, 65, 90, 115, 140, 165, 190, 215, 245, 270, 295].map(a => [cx + o * rx * Math.cos(a * Math.PI / 180), cy + ry * Math.sin(a * Math.PI / 180)]);
  // 下垂（照舊版人偶）：上面窄窄地貼著胸口往下掛、重量全在最底、底是圓袋、乳頭在最底朝下
  const PEND_FR = [[17.6, 99.4], [18.4, 105], [19.6, 111], [20.8, 116.5], [21, 120.6], [19.4, 123.8], [16, 125.6], [12, 125.8], [8.6, 124.2], [6.4, 121], [5.4, 116], [5, 110], [4.8, 104.5],
    [6.5, 101], [10, 99], [14, 98.2]].map(([x, y]) => [CX + x, y]);
  // 下垂・飽滿（乳頭上翹）：一樣往下掛，但下半是又大又圓的一包、乳頭在前端偏上、朝前上
  const FULL_FR = [[17.6, 99.4], [18.8, 104], [20.6, 109], [22, 114], [22.2, 118.5], [20.4, 122.4], [16.6, 124.8], [12, 125.2], [7.6, 123.6], [4.6, 120], [3.2, 115], [3, 110], [3.6, 105],
    [6, 101.4], [10, 99.4], [14, 98.4]].map(([x, y]) => [CX + x, y]);
  const OVERRIDE = {
    // 水滴：照 D 五種乳型那一版（使用者認可的）——側面／遠側上半是直的斜坡，不是後來圓形改的鼓弧；大罩杯上半也不鼓
    teardrop: {
      front_right: { breasts: [{ pts: [[77.8, 96.6], [80.6, 99.4], [83.8, 102.6], [86.6, 105.6], [88, 108.4], [87.6, 111.2], [85.4, 114.3], [81.8, 116.5], [77.6, 117.1], [74, 116.2], [71.5, 110], [72.5, 101]], nip: [87.9, 108.8] }, {}] },
      right: { breasts: [{ pts: [[73.6, 88], [76.6, 92.2], [79.8, 96.2], [83.4, 100.6], [86.4, 104.6], [87.6, 107.4], [87.2, 110.4], [85, 113.8], [81.4, 116.2], [77.4, 116.9], [74.2, 116], [72.4, 112], [72.4, 100], [72.6, 90]] }] },
    },
    pendulous: {
      front: { breasts: [{ pts: FULL_FR, line: [0, 12], nip: [CX + 13.6, 116.4], base: [CX + 12, 99.4] }, { pts: mirror(FULL_FR), line: [0, 12], nip: [CX - 13.6, 116.4], base: [CX - 12, 99.4] }] },
      front_right: { breasts: [
        { pts: [[77.8, 96.6], [80, 101], [83, 106], [86, 110.6], [88, 114.6], [88.4, 118.4], [86.8, 122], [83.6, 124.6], [79.8, 125.2], [76.4, 124], [73.5, 118], [72.5, 103]], line: [0, 9], nip: [88.2, 115.6] },
        { pts: [[54, 99.2], [54, 104], [54.4, 109.6], [55.4, 115], [57.4, 120], [60.8, 123.8], [65.2, 125.2], [69.6, 124.2], [72.8, 121], [74.4, 116.4], [74.6, 111], [73.8, 106], [71, 101.6], [65, 99], [59, 98.2]],
          line: [0, 11], nip: [66.6, 116.6] }] },
      right: { breasts: [{ pts: [[73.8, 90], [75.8, 96], [78.6, 102], [82, 107.5], [85.6, 112.4], [87.6, 116], [87.4, 119.6], [85.2, 122.8], [81.6, 124.8], [77.8, 125], [75, 123.4], [73.6, 120], [72.4, 112], [72.4, 96]],
        line: [0, 11], nip: [87.4, 116] }], fold: null },
    },
    papaya: {
      front: { breasts: [{ pts: PEND_FR, line: [0, 12], nip: [CX + 14.6, 121.4], base: [CX + 12, 99.4] }, { pts: mirror(PEND_FR), line: [0, 12], nip: [CX - 14.6, 121.4], base: [CX - 12, 99.4] }], cleaveDot: null },
      front_right: { breasts: [
        { pts: [[77.8, 96.6], [79.4, 102], [81.8, 108], [84.4, 114], [86.2, 119], [86.4, 122.4], [84.4, 125], [81, 126], [77.6, 125.2], [75, 122.4], [73, 115], [72.5, 103]], line: [0, 9], nip: [86.2, 121.4] },
        { pts: [[54, 99.2], [54.4, 105], [55.2, 111], [56.6, 117], [58.6, 122], [62, 125], [66, 125.8], [69.6, 124.2], [72, 120.6], [73, 115], [73, 109], [72.4, 104], [70, 100.6], [65, 98.8], [59, 98.2]],
          line: [0, 11], nip: [66.6, 121.2] }] },
      right: { breasts: [{ pts: [[73.8, 90], [75.4, 97], [77.4, 104], [79.8, 110], [82.4, 115], [84.2, 119], [84.6, 122], [83, 124.6], [80, 125.6], [77, 124.8], [75, 122.6], [73.6, 119.5], [72.4, 112], [72.4, 96]],
        line: [0, 11], nip: [84.4, 120.6] }], fold: null },
    },
    sup: {
      front: { breasts: [{ pts: dome(CX + 9.5, 103.4, 8.8, 8.6, 1), line: [0, 10], nip: [CX + 9.8, 103.8], base: [CX + 9.5, 99] }, { pts: dome(CX - 9.5, 103.4, 8.8, 8.6, -1), line: [0, 10], nip: [CX - 9.8, 103.8], base: [CX - 9.5, 99] }],
        cleaveDot: [CX, 104.5] },
      front_right: { breasts: [
        { pts: [[77.8, 95], [81, 95.8], [84.2, 98], [86.4, 101.4], [86.8, 105], [85.6, 108.6], [83, 111.4], [79.6, 113], [76.4, 113.2], [74, 112.4], [72, 107], [72.5, 98]], line: [0, 9], nip: [86.6, 104.4] },
        { pts: dome(65, 103.8, 8.4, 8.6, -1), line: [0, 10], nip: [66.6, 104.2], base: [62, 99] }] },
      right: { breasts: [{ pts: [[73.8, 94.4], [77, 94.8], [80.6, 96.4], [83.6, 99.2], [85.2, 102.8], [84.8, 106.8], [82.6, 110], [79.4, 112.2], [76, 113], [73.6, 112.6], [72.4, 108], [72.4, 98]], line: [0, 9], nip: [85, 103] }],
        fold: [[76, 113], [73.6, 112.6], [72, 111.4]] },
    },
  };
  // A 罩杯：不是把乳房縮扁，是胸口上很小的起伏——正面只有乳頭下面一小段淡淡的弧（陰影色）、沒有乳溝線和腋下摺線；側面是輪廓上一個小小的鼓包
  const SOFT = { soft: 1, crease: null, tail: 0, cleave: 0 };
  const A_FR = [[16.8, 101.5], [17, 104], [15.6, 106.4], [12.2, 107.5], [8.6, 106.7], [6.6, 104.4], [6.6, 102], [9, 100.4], [13, 100]].map(([x, y]) => [CX + x - 2.4, y]);
  // B 罩杯：比 A 大一級的起伏——開始有下緣線（深色、外側繞到底到內側），還是沒有乳溝線和腋下摺線
  const B_FR = [[17.2, 100.5], [17.8, 104], [16.4, 107.4], [13, 109.4], [9, 109.2], [6, 107.2], [4.6, 104], [5.2, 101.2], [8, 99.6], [13, 99.4]].map(([x, y]) => [CX + x - 1, y]);
  const SOFT_B = { ...SOFT, lineDark: 1 };
  const CUP_OV = {
    B: {
      front: { breasts: [{ ...SOFT_B, pts: B_FR, line: [0, 6], nip: [CX + 11, 104.6], ar: 1.8 }, { ...SOFT_B, pts: mirror(B_FR), line: [0, 6], nip: [CX - 11, 104.6], ar: 1.8 }] },
      front_right: { breasts: [
        { ...SOFT_B, pts: [[77.8, 97.6], [80, 99.6], [82, 102.4], [83.2, 105.2], [82.8, 108], [81, 110.2], [78.6, 111], [76, 110.4], [74.5, 106], [74.8, 100]], line: [0, 0], nip: [83, 105.4] },
        { ...SOFT_B, pts: [[55.6, 100.6], [55.4, 104], [56.6, 107.4], [59.6, 109.6], [63.6, 109.6], [66.8, 107.6], [68.2, 104.4], [67.4, 101.4], [64.6, 99.8], [60, 99.4]], line: [0, 6], nip: [62.6, 104.8], ar: 1.8, arX: .85 }] },
      right: { breasts: [{ ...SOFT_B, pts: [[73.8, 95], [76, 98], [78.4, 101.4], [80, 104.4], [80.2, 107], [79, 109.4], [76.8, 110.8], [74.4, 111], [72.5, 108], [72.5, 97]], line: [0, 0], nip: [80, 105] }],
        fold: [[76.8, 110.8], [74.4, 111], [72.6, 110]] },
    },
    A: {
      front: { breasts: [{ ...SOFT, pts: A_FR, line: [1, 5], nip: [CX + 10.4, 104], ar: 1.5 }, { ...SOFT, pts: mirror(A_FR), line: [1, 5], nip: [CX - 10.4, 104], ar: 1.5 }] },
      front_right: { breasts: [
        { ...SOFT, pts: [[77.8, 99.4], [79.4, 101.4], [80.6, 103.6], [80.9, 105.6], [80.2, 107.4], [78.6, 108.7], [76.8, 109], [75, 106], [75, 100]], line: [0, 0], nip: [80.6, 105.2] },
        { ...SOFT, pts: [[57, 101.5], [56.8, 104], [58, 106.4], [61, 107.6], [64.6, 107], [66.6, 105], [66.8, 102.6], [64.6, 100.8], [60.5, 100.4]], line: [1, 5], nip: [62.6, 104.2], ar: 1.5, arX: .85 }] },
      right: { breasts: [{ ...SOFT, pts: [[73.9, 97.6], [75.6, 100.2], [77, 103], [77.5, 105.2], [76.9, 107.2], [75.5, 108.6], [74, 109.2], [72.5, 107], [72.5, 99]], line: [0, 0], nip: [77.2, 104.8] }], fold: null },
    },
  };
  OVERRIDE.hemisphere = OVERRIDE.sup; SHAPE_T.hemisphere = SHAPE_T.sup; OVERRIDE.heavy = OVERRIDE.pendulous; SHAPE_T.heavy = SHAPE_T.pendulous;
  const SIDE_OF = { front: 'front', front_right: 'front_right', right: 'right', front_left: 'front_right', left: 'right' };
  function shapeFor(dir, shape, cupName) {
    const d0 = SIDE_OF[dir] || 'front', base = SHAPES[d0], cv = shape === 'flat' ? CUP_OV.A[d0] : (CUP_OV[cupName] || {})[d0], ov = cv || (OVERRIDE[shape] || {})[d0];
    let S = base;
    if (ov) S = { ...base, ...ov, soft: !!cv, breasts: base.breasts.map((b, i) => ({ ...b, ...ov.breasts[i], _g: null })) };
    return dir !== d0 ? mirShape(S) : S;
  }
  // 左邊的方向＝右邊的鏡像
  const mirShape = s => ({
    torso: mirror(s.torso), breasts: s.breasts.map(b => ({ ...b, pts: mirror(b.pts), nip: mirror([b.nip])[0], base: mirror([b.base])[0], out: b.out && -b.out, cleave: b.cleave && -b.cleave, crease: b.crease && mirror(b.crease), tail: b.tail && -b.tail, shadeIn: b.shadeIn && 2 * CX - b.shadeIn })),
    front: s.front, sideView: s.sideView, soft: s.soft, clavicle: s.clavicle && s.clavicle.map(mirror), armpit: s.armpit && s.armpit.map(mirror), fold: s.fold && mirror(s.fold), notch: s.notch && mirror([s.notch])[0], mir: 1,
  });

  function spline(pts, closed, n = 10) {
    const out = [], m = pts.length, P = i => closed ? pts[(i + m) % m] : pts[Math.max(0, Math.min(m - 1, i))];
    const segs = closed ? m : m - 1;
    for (let i = 0; i < segs; i++) {
      const p0 = P(i - 1), p1 = P(i), p2 = P(i + 1), p3 = P(i + 2);
      for (let k = 0; k < n; k++) {
        const t = k / n, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(j => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
      }
    }
    if (!closed) out.push(pts[m - 1]);
    return out;
  }
  function inPoly(poly, x, y) {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function fillMask(poly) {
    const m = new Uint8Array(W * H);
    let y0 = H, y1 = 0; for (const p of poly) { y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    for (let y = Math.max(0, Math.floor(y0)); y <= Math.min(H - 1, Math.ceil(y1)); y++)
      for (let x = 0; x < W; x++) if (inPoly(poly, x + .5, y + .5)) m[y * W + x] = 1;
    return m;
  }
  // 1px 線（落到格子，去掉 L 形轉角）
  function strokePts(poly) {
    const pts = [];
    for (let i = 0; i + 1 < poly.length; i++) {
      const [x0, y0] = poly[i], [x1, y1] = poly[i + 1], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3));
      for (let k = 0; k <= n; k++) {
        const p = [Math.floor(x0 + (x1 - x0) * k / n), Math.floor(y0 + (y1 - y0) * k / n)];
        const l = pts[pts.length - 1]; if (!l || l[0] !== p[0] || l[1] !== p[1]) pts.push(p);
      }
    }
    const out = [];
    for (const p of pts) {
      const a = out[out.length - 2];
      if (a && Math.abs(a[0] - p[0]) === 1 && Math.abs(a[1] - p[1]) === 1) out.pop();
      out.push(p);
    }
    return out;
  }

  function draw(opts = {}) {
    const K = opts.scale === 2 ? 2 : 1; W = 128 * K; H = 280 * K;
    if (K === 2 && !opts.noBreast) throw new Error('scale:2 目前只支援 noBreast（胸廓）');
    const sp = p => K === 1 ? p : [p[0] * 2 + .5, p[1] * 2];   // 2× 格子 → 4× 格子
    let cup = CUPS[(opts.cup || 'D').toUpperCase()] || CUPS.D;
    const shade = opts.shade !== false, layer = opts.layer;
    const cupName = (opts.cup || 'D').toUpperCase(), S0 = shapeFor(opts.dir || 'front', opts.shape || 'round', cupName), S = opts.noBreast ? { ...S0, breasts: [], fold: null } : S0;   // noBreast：只畫胸廓（乳房另外疊）
    const col = new Array(W * H).fill(null), own = new Uint8Array(W * H);   // own：1＝乳房圖層
    let mine = 0;
    const set = (x, y, c) => { if (x >= 0 && y >= 0 && x < W && y < H) { col[y * W + x] = c; if (mine) own[y * W + x] = 1; } };
    const T = SHAPE_T[opts.shape || 'round'] || SHAPE_T.round;   // A／B 的小起伏也照乳型變形（各乳型不共用同一張）
    if (S.soft) cup = opts.shape === 'flat' && cupName === 'B' ? [1.3, 1.3, 1.15] : [1, 1, 1];
    // 大罩杯（D 以上）：越大越外擴、兩顆在中間擠出一條長乳溝
    const big = Math.max(0, Math.min(1, (cup[0] - 1) / .4)), gapOpt = opts.gap === 'apart' ? 4 : 0, press = gapOpt || T.wideOut ? 0 : Math.max(5 * big, T.pressAll ? 2.6 : 0);
    const scl = b => {
      if (!b._g) { const ys = b.pts.map(p => p[1]), xs = b.pts.map(p => p[0]); b._g = { y0: Math.min(...ys), y1: Math.max(...ys), cx: (Math.min(...xs) + Math.max(...xs)) / 2 }; }
      const g = b._g, mid = S.torso.reduce((a, p) => a + p[0], 0) / S.torso.length;
      return ([x, y], isNip) => {
        const t = Math.max(0, Math.min(1, (y - g.y0) / (g.y1 - g.y0)));
        if (b.out) {   // 側面輪廓：以胸壁為基準往前凸
          const far = !S.sideView ? 1.16 : 1;
          const wall = b.out > 0 ? Math.min(...b.pts.map(p => p[0])) : Math.max(...b.pts.map(p => p[0]));
          x = wall + (x - wall) * (T.p0 + (T.p1 - T.p0) * t) * far - b.out * T.back * t * t;
          // 上半不要是一條直斜線（大了會變尖角）：乳頭線以上往外鼓成圓的，越大越鼓
          if (!isNip && y < b.nip[1] && (x - wall) * b.out > 0) { const tt = (y - g.y0) / (b.nip[1] - g.y0); x += b.out * (T.hollow ? 0 : (S.sideView ? 1.8 : 2.4) * big) * Math.sin(Math.PI * Math.min(1, tt * 1.1)); }
          if (!S.sideView && !isNip) x += b.out * 2 * big * Math.min(1, t * 2.5);   // 斜前遠的那顆：大罩杯整顆往外擠
        } else {
          const o = b.tail ? -b.tail : Math.sign(g.cx - mid);   // 外側方向
          x = g.cx + (x - g.cx) * (T.w0 + (T.w1 - T.w0) * t) + o * T.splay * t * t - o * T.in;
          if (!S.front && b.tail) x += o * (isNip ? 2.5 : 5.5 * Math.min(1, t * 2.5)) * big * ((x - g.cx) * o > 0 || isNip ? 1 : .35);   // 斜前近的那顆：大罩杯往近側擠出去
          if (S.front && !isNip && !b.soft) x += o * (OUT_SPLAY + ((x - g.cx) * o > 0 ? 3 * big : -OUT_SPLAY * big) + (T.wideOut ? ((x - g.cx) * o > 0 ? 2.4 : 1.4) : 0)) * t * t;   // 大罩杯：外半邊更往外、內半邊不撇開（留在中間擠著）   // 整顆下端往外撇（蛋的軸往外）
          if (S.front && !isNip && !b.soft && (x - g.cx) * o > 0) x += o * (OUT_BULGE + 1.6 * big + press) * Math.sin(Math.PI * Math.min(1, t * 1.15));   // 乳房朝外開：外半邊多鼓一點
        }
        y = g.y0 + (y - g.y0) * T.ky + T.lift + (isNip ? T.nipDy : 0);
        x = b.base[0] + (x - b.base[0]) * cup[0]; y = b.base[1] + (y - b.base[1]) * cup[1];
        if (b._k != null) x = b._xo + (x - b._xo) * b._k;   // 乳溝：以外側為基準左右縮放，讓內緣落在指定的位置
        if (b._k != null && press && !isNip) x = CX + b.cleave * Math.max(0, (x - CX) * b.cleave - press);   // 擠在一起：靠中線的那一段壓成一條直線
        return [x, y];
      };
    };

    // 乳溝（正面）：close＝兩顆內緣貼在中線、合成一條線；apart＝中間留 GAP 格
    const gap = (opts.gap === 'apart' ? 4 : 0) + (T.wideOut ? 1.6 : 0);
    for (const b of S.breasts) { b._k = null; if (!b.cleave || !S.front) continue; const sc0 = scl(b), xs = b.pts.map(p => sc0(p)[0]);
      const xo = b.cleave > 0 ? Math.max(...xs) : Math.min(...xs), xi = b.cleave > 0 ? Math.min(...xs) : Math.max(...xs); b._xo = xo; b._k = (xo - (CX + b.cleave * gap)) / (xo - xi); }
    // 1) 胸廓＋乳房剪影
    const sil = fillMask(spline(S.torso.map(sp), true, 8)), bm = new Uint8Array(W * H);
    const B = S.breasts.map(b => { const sc = scl(b), poly = spline(b.pts.map(sc), true, 10), m = fillMask(poly); for (let i = 0; i < W * H; i++) if (m[i]) { bm[i] = 1; sil[i] = 1; } return { b, sc, m }; });
    for (let i = 0; i < W * H; i++) if (sil[i]) col[i] = SKIN;
    // 乳房下面的影子（胸廓上，下緣往下 1 格）
    if (shade) for (let i = W; i < W * H; i++) if (sil[i] && !bm[i] && bm[i - W]) col[i] = SHADOW;
    // 外輪廓（底下接腰，不描底邊）
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x; if (!sil[i]) continue;
      if (!sil[i - 1] || !sil[i + 1] || (!sil[i - W] && y > 68 * K) || (!sil[i + W] && y < 123 * K)) { col[i] = DARK; if (bm[i]) own[i] = 1; }
    }
    for (const c of S.clavicle || []) for (const [x, y] of strokePts(spline(c.map(sp), false, 8))) set(x, y, SHADOW);
    for (const c of S.armpit || []) for (const [x, y] of strokePts(c.map(sp))) set(x, y, SHADOW);
    if (S.notch) { const nt = sp(S.notch); set(Math.floor(nt[0]), nt[1], SHADOW); set(Math.ceil(nt[0] - .01), nt[1], SHADOW); if (K === 2) { set(Math.floor(nt[0]), nt[1] + 1, SHADOW); set(Math.ceil(nt[0] - .01), nt[1] + 1, SHADOW); } }

    // 2) 乳房：一顆一顆疊（後面的蓋前面的）
    mine = 1;
    for (const { b, sc, m } of B) {
      let [nx, ny] = sc(b.nip, 1);
      // 乳頭微微朝外：正面往外側移、乳暈壓扁一點；斜前近的那顆轉向鏡頭＝往它自己的中間移
      if (S.front && b.cleave) nx += b.cleave * (NIP_OUT + 1.5 * big + (T.wideOut ? 1.6 : T.pressAll ? -1 : 0)) * cup[0]; else if (b.ar && b.tail) nx -= b.tail * 2.2;
      for (let i = 0; i < W * H; i++) if (m[i]) { col[i] = SKIN; own[i] = 1; }
      if (shade) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x; if (!m[i]) continue;
        // 乳溝：內側朝中間那面（乳頭高度最寬、往上變細）
        if (b.cleave) {
          const pts = b.pts.map(sc); let edge = b.cleave > 0 ? Infinity : -Infinity;
          for (const p of spline(pts, true, 10)) if (Math.abs(p[1] - (y + .5)) < .6) edge = b.cleave > 0 ? Math.min(edge, p[0]) : Math.max(edge, p[0]);
          const w = y + .5 >= ny ? 4 : 4 - (ny - y - .5) * .45, d = b.cleave > 0 ? x + .5 - edge : edge - x - .5;
          if (w > 0 && isFinite(edge) && d >= 0 && d < w) col[i] = SHADOW;
        }
        // 側面：下乳圓底往上一格陰影（不打方塊）
        if (b.shadeIn != null && y + .5 > ny + 2 && !m[i + W] && m[i - W] && (b.out > 0 ? x + .5 < nx - 1 : x + .5 > nx + 1)) col[i] = SHADOW;
      }
      const pts = spline(b.pts.map(sc).slice(b.line[0], b.line[1] + 1 + (S.front && press > 1 ? 1 : 0)), false, 10);
      if (b.line[1] > b.line[0]) for (const [x, y] of strokePts(pts)) set(x, y, b.soft && !b.lineDark ? SHADOW : DARK);
      // 腋下：摺線從手臂和身體的交界彎下來、接進乳房外線；副乳＝交界往胸口翹的一小撇
      const st = sc(b.pts[0]);
      if (b.crease) { mine = 0; for (const [x, y] of strokePts(spline(b.crease.concat([st]), false, 8))) set(x, y, DARK); mine = 1; }
      if (b.tail) for (const [x, y] of strokePts([[st[0] + b.tail * 1.2, st[1] - .2], [st[0] + b.tail * 3.4, st[1] - 1.8]])) set(x, y, SHADOW);
      // 乳暈、乳頭
      if (b.ar) {
        const ar = b.ar * cup[2], ax = S.front ? .62 : (b.arX || 1);
        for (let y = Math.floor(ny - ar - 1); y <= ny + ar + 1; y++) for (let x = Math.floor(nx - ar - 1); x <= nx + ar + 1; x++)
          if (Math.hypot((x + .5 - nx) / ax, (y + .5 - ny) * 1.1) <= ar + .35) set(x, y, AREOLA);
        set(Math.floor(nx), Math.floor(ny), NIP);
      } else {
        // 側面：乳頭凸出輪廓外 2 格、微微朝下；乳暈是輪廓裡上下各一格
        const fx = Math.floor(nx), fy = Math.floor(ny), o = b.out;
        if (T.up) {   // 朝前上
          for (const [dx, dy] of [[1, 0], [2, -1], [1, -1], [2, 0]]) set(fx + o * dx, fy + dy, NIP);
          set(fx, fy - 2, AREOLA); set(fx, fy + 1, AREOLA); set(fx - o, fy + 2, AREOLA);
        } else if (T.down) {   // 朝前下
          for (const [dx, dy] of [[1, 1], [2, 2], [1, 2], [2, 1]]) set(fx + o * dx, fy + dy, NIP);
          set(fx, fy - 1, AREOLA); set(fx + o, fy, AREOLA); set(fx - o, fy + 2, AREOLA); set(fx, fy + 3, AREOLA);
        } else {
          if (S.sideView) {   // 正側面：乳頭朝外＝微微轉向鏡頭，看得到一片壓扁的乳暈，乳頭只凸出 1 格
            for (let dy = -1; dy <= 2; dy++) { set(fx - o, fy + dy, AREOLA); set(fx - 2 * o, fy + dy, AREOLA); if (dy === 0 || dy === 1) set(fx - 3 * o, fy + dy, AREOLA); }
            set(fx, fy, AREOLA); set(fx, fy + 1, AREOLA);
            for (const [dx, dy] of [[-1, 0], [-1, 1], [0, 0], [0, 1], [1, 0], [1, 1]]) if (dx >= 0 || dy === 0) set(fx + o * dx, fy + dy, NIP);
          } else {
            for (const [dx, dy] of [[1, 0], [2, 0], [1, 1], [2, 1]]) set(fx + o * dx, fy + dy, NIP);
            set(fx, fy - 1, AREOLA); set(fx, fy + 2, AREOLA); set(fx - o, fy - 1, AREOLA); set(fx - o, fy + 2, AREOLA);
          }
        }
      }
    }
    if (S.fold) for (const [x, y] of strokePts(spline(S.fold.map(scl(S.breasts[0])), false, 8))) set(x, y, DARK);
    mine = 0;

    const px = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      const c = col[i]; if (!c) continue;
      if ((layer === 'torso' && own[i]) || (layer === 'breast' && !own[i])) continue;
      px.set([c[0], c[1], c[2], 255], i * 4);
    }
    return { width: W, height: H, pixels: px };
  }
  return { draw, FIT, SHAPES: Object.keys(FIT), CUPS: Object.keys(CUPS), DIRS: Object.keys(SIDE_OF), W, H };
});
