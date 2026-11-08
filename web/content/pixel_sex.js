/* 像素風預產動圖：部件（陰莖／陰唇正面／陰道剖面）程序繪製。
 * 每個部件回傳 { w, h, px }，px 是每格的色碼（null＝透明）。
 * 光源左上；每個色票 4 階：[描邊, 暗, 中, 亮]；2×2 以上用 4×4 Bayer 抖色。 */
(function (root) {
  "use strict";

  const RAMPS = {
    skin: {
      light: ["#6e4237", "#d79a86", "#f5c9b4", "#ffe6d6"],
      medium: ["#5a3426", "#b9765c", "#dca084", "#f2c4a8"],
      tan: ["#3e2219", "#8a4f38", "#b47657", "#d39b79"],
    },
    // 陰唇顏色三級：跟房間「開發」一樣 粉 → 咖啡 → 黑
    labia: {
      pink: ["#7a2a43", "#d05c7b", "#ee8fa5", "#ffc2cf"],
      brown: ["#4a261d", "#8c4f3f", "#b77463", "#d79c89"],
      dark: ["#26131a", "#55302f", "#7b4a44", "#9c6a60"],
    },
    mucosa: ["#62182f", "#bd3f5c", "#e8768d", "#ffb0bf"],
    glans: ["#55203a", "#b04d6e", "#da7f9b", "#f6b6c8"],
    tissue: ["#5e2e34", "#b56d6f", "#dc9b96", "#f3c3ba"],
    hole: ["#1c060e", "#3c0f1e", "#5a1a2c", "#5a1a2c"],
    // 陰毛：[最暗, 暗, 中, 亮]
    hair: {
      black: ["#0e0809", "#1f1414", "#3a2724", "#5c4239"],
      brown: ["#1e0f0a", "#3d2216", "#62392a", "#8a5a42"],
      blonde: ["#5a3e1c", "#9a7038", "#c79d58", "#e8c886"],
    },
    wet: "#fff7fb",
  };

  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];

  function grid(w, h) {
    return { w, h, px: new Array(w * h).fill(null) };
  }
  function put(g, x, y, c) {
    x = Math.round(x); y = Math.round(y);
    if (x >= 0 && y >= 0 && x < g.w && y < g.h) g.px[y * g.w + x] = c;
  }
  function tone(b, x, y) {
    b += (BAYER[y & 3][x & 3] / 16 - 0.47) * 0.14;
    return b > 0.74 ? 3 : b > 0.42 ? 2 : 1;
  }
  const clamp01 = (v) => Math.max(0, Math.min(1, v));


  /** 旋轉橢圓（ang＝長軸角度，弧度）。 */
  function rell(cx, cy, rx, ry, ang) {
    const c = Math.cos(ang), sn = Math.sin(ang);
    const uv = (x, y) => {
      const dx = x - cx, dy = y - cy;
      return [(dx * c + dy * sn) / rx, (-dx * sn + dy * c) / ry];
    };
    return {
      in: (x, y) => { const [u, v] = uv(x, y); return u * u + v * v < 1; },
      lit: (x, y) => {
        const [u, v] = uv(x, y);
        const z = Math.sqrt(Math.max(0, 1 - u * u - v * v));
        return clamp01(0.55 * z + 0.45 * (0.5 - 0.25 * (x - cx) / rx - 0.5 * (y - cy) / ry));
      },
    };
  }
  /** 固定雜湊（同一格永遠同一值：預產幀之間陰毛不會閃）。 */
  function hash(x, y, k = 0) {
    let h = (x * 374761393 + y * 668265263 + k * 1442695041) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  /** 整個剪影外緣補最暗描邊。 */
  function silhouette(g, color) {
    const at = (x, y) => (x < 0 || y < 0 || x >= g.w || y >= g.h) ? "edge" : g.px[y * g.w + x];
    const out = [];
    for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
      if (!g.px[y * g.w + x]) continue;
      if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(x + dx, y + dy) === null)) out.push([x, y]);
    }
    for (const [x, y] of out) put(g, x, y, color);
  }

  /** 填一個形狀：inside(x,y) 以格心判斷；邊界格塗描邊色（outline:false 不描）。 */
  function shape(g, ramp, inside, light, opts = {}) {
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const cx = x + 0.5, cy = y + 0.5;
        if (!inside(cx, cy)) continue;
        const edge = opts.outline !== false && (
          !inside(cx + 1, cy) || !inside(cx - 1, cy) || !inside(cx, cy + 1) || !inside(cx, cy - 1));
        // edge 可以是函式：(x,y)→色碼或 null（null＝這格不描，照常上色）
        const ec = edge ? (typeof opts.edge === "function" ? opts.edge(cx, cy) : (opts.edge || ramp[0])) : null;
        put(g, x, y, ec || ramp[tone(light(cx, cy), x, y)]);
      }
    }
  }

  /** 橢圓（球面打光，左上亮）。 */
  function ell(cx, cy, rx, ry) {
    return {
      in: (x, y) => ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1,
      lit: (x, y) => {
        const nx = (x - cx) / rx, ny = (y - cy) / ry;
        const z = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
        return clamp01(0.55 * z + 0.45 * (0.5 - 0.35 * nx - 0.55 * ny));
      },
    };
  }
  function drawEll(g, ramp, e, opts) {
    shape(g, ramp, e.in, e.lit, opts);
  }

  /** 沿中心線的管狀（陰莖身）：x∈[x0,x1]、|y−yc(x)|<r(x)。 */
  function tube(g, ramp, x0, x1, yc, r) {
    shape(g, ramp,
      (x, y) => x >= x0 && x <= x1 && Math.abs(y - yc(x)) < r(x),
      (x, y) => {
        const ny = (y - yc(x)) / r(x);
        const z = Math.sqrt(Math.max(0, 1 - ny * ny));
        return clamp01(0.55 * z + 0.45 * (0.5 - 0.6 * ny));
      });
  }

  /** 龜頭：冠狀溝（x0）最粗，往前收成圓頭；沿中心線 yc。 */
  function glans(g, x0, yc, len, R) {
    const h = (x) => {
      const t = (x - x0) / len;
      if (t < 0 || t > 1) return 0;
      // 圓頂；冠狀溝那一圈略收邊（不是直角）
      const lip = t < 0.14 ? 0.86 + t : 1;
      return R * Math.sqrt(Math.max(0, 1 - t * t)) * lip;
    };
    shape(g, RAMPS.glans,
      (x, y) => Math.abs(y - yc(x)) < h(x),
      (x, y) => {
        const ny = (y - yc(x)) / Math.max(0.5, h(x));
        const t = (x - x0) / len;
        return clamp01(0.5 * Math.sqrt(Math.max(0, 1 - ny * ny)) + 0.45 * (0.5 - 0.6 * ny) + 0.12 * (0.5 - t));
      });
    // 尿道口
    const tx = x0 + len - 1.2;
    put(g, tx, yc(tx), RAMPS.hole[0]);
    put(g, tx - 1, yc(tx), RAMPS.glans[1]);
  }

  /** 陰莖（側面，朝右）。 */
  function penis(opts = {}) {
    const skin = RAMPS.skin[opts.skin] || RAMPS.skin.medium;
    const g = grid(62, 28);
    const yc = (x) => 14 - 0.0011 * (x - 4) ** 2;
    const r = (x) => 5.4 - 0.7 * (x - 4) / 42;
    drawEll(g, skin, ell(10, 20.5, 8, 6.4)); // 陰囊（在後面）
    // 陰囊中縫
    for (let y = 17; y < 26; y++) put(g, 10 + Math.round(Math.sin(y) * 0.5), y, skin[1]);
    tube(g, skin, 0, 45, yc, r);
    // 血管：一條淡淡的凸起（暗線＋上緣亮點）
    for (let x = 14; x < 36; x++) {
      const y = Math.round(yc(x) - r(x) * 0.15 + Math.sin(x * 0.28) * 0.7);
      put(g, x, y, skin[1]);
      if (x % 3 === 0) put(g, x, y - 1, skin[3]);
    }
    glans(g, 44, yc, 12, 6.0);
    return g;
  }

  /** 陰唇（正面）。 */
  function vulva(opts = {}) {
    const skin = RAMPS.skin[opts.skin] || RAMPS.skin.light;
    const lab = RAMPS.labia[opts.labia] || RAMPS.labia.pink;
    const g = grid(40, 50);
    const cx = 20;
    // 底：整塊皮膚（不描外框）
    shape(g, skin, (x, y) => Math.abs((x - cx) / 20) ** 4 + Math.abs((y - 25) / 25) ** 4 < 1,
      (x, y) => clamp01(0.7 - 0.25 * (y - 10) / 40 - 0.15 * Math.abs(x - cx) / 20), { outline: false });
    // 兩側大腿（鼠蹊折線）
    drawEll(g, skin, ell(cx - 26, 34, 15, 30), { edge: skin[1] });
    drawEll(g, skin, ell(cx + 26, 34, 15, 30), { edge: skin[1] });
    drawEll(g, skin, ell(cx - 4.8, 28, 6.6, 17.5), { edge: skin[1] }); // 大陰唇 左
    drawEll(g, skin, ell(cx + 4.8, 28, 6.6, 17.5), { edge: skin[1] }); // 大陰唇 右
    // 小陰唇：邊緣微皺
    const minRx = (y) => 3.8 * (1 + 0.13 * Math.sin(y * 1.25));
    shape(g, lab,
      (x, y) => ((x - cx) / minRx(y)) ** 2 + ((y - 28.5) / 14) ** 2 < 1,
      (x, y) => ell(cx, 28.5, minRx(y), 14).lit(x, y), { edge: lab[1] });
    drawEll(g, lab, ell(cx, 15.5, 3, 3.6), { edge: lab[1] }); // 陰蒂包皮
    drawEll(g, RAMPS.mucosa, ell(cx, 30, 2.2, 10), { outline: false }); // 前庭
    shape(g, RAMPS.hole, ell(cx, 34, 1.5, 2.6).in, () => 0.5, { outline: false }); // 陰道口
    put(g, cx, 34, RAMPS.hole[0]);
    put(g, cx, 17.5, RAMPS.mucosa[3]); // 陰蒂
    put(g, cx, 18.5, RAMPS.mucosa[2]);
    put(g, cx, 23, RAMPS.mucosa[3]); // 尿道口附近一點亮
    return g;
  }


  /** M 字開腿正面：下腹＋大腿＋陰阜陰毛＋陰唇肉穴。
   *  hair：none／trim／natural／bush；hairColor：black／brown／blonde；wet：濕亮點。 */
  function crotch(opts = {}) {
    const skin = RAMPS.skin[opts.skin] || RAMPS.skin.light;
    const lab = RAMPS.labia[opts.labia] || RAMPS.labia.pink;
    const hairR = RAMPS.hair[opts.hairColor] || RAMPS.hair.black;
    const style = opts.hair || "natural";
    const g = grid(96, 80);
    const cx = 48;
    const soft = { edge: skin[1] };
    const smooth = (t) => { t = clamp01(t); return t * t * (3 - 2 * t); };
    drawEll(g, skin, ell(cx - 11, 80, 15, 10), soft); // 屁股
    drawEll(g, skin, ell(cx + 11, 80, 15, 10), soft);
    drawEll(g, skin, rell(10, 49, 36, 15.5, 0.30), soft); // 左大腿（往外張）
    drawEll(g, skin, rell(86, 49, 36, 15.5, -0.30), soft); // 右大腿
    // 下腹往下收到胯下；它的邊就是鼠蹊折線（V）
    const w = (y) => y < 20 ? 27 : y < 62 ? 27 - 12 * smooth((y - 20) / 42) : 15 * Math.sqrt(Math.max(0, 1 - ((y - 62) / 15) ** 2));
    shape(g, skin, (x, y) => y < 77 && Math.abs(x - cx) < w(y),
      (x, y) => {
        const nx = (x - cx) / Math.max(1, w(y));
        return clamp01(0.5 * Math.sqrt(Math.max(0, 1 - nx * nx)) + 0.45 * (0.55 - 0.3 * nx) - 0.12 * Math.max(0, y - 55) / 20);
      }, soft);
    // 肚臍
    put(g, cx, 13, skin[0]); put(g, cx, 14, skin[1]); put(g, cx - 1, 12, skin[3]);
    // 陰阜（鼓起）
    drawEll(g, skin, ell(cx, 45, 14, 10), { outline: false });
    // 大陰唇（肉肉的兩瓣）
    // 上緣融進陰阜不描；中段淡線；下半（肉瓣底）深線
    const majEdge = { edge: (x, y) => y < 52 ? null : y < 60 ? skin[1] : skin[0] };
    drawEll(g, skin, ell(cx - 5.4, 59, 7, 13), majEdge);
    drawEll(g, skin, ell(cx + 5.4, 59, 7, 13), majEdge);
    // 小陰唇：從縫裡翻出來一點，邊緣微皺
    const mrx = (y) => 3.3 * (1 + 0.15 * Math.sin(y * 1.3));
    shape(g, lab, (x, y) => ((x - cx) / mrx(y)) ** 2 + ((y - 60) / 11) ** 2 < 1,
      (x, y) => ell(cx, 60, mrx(y), 11).lit(x, y), { edge: lab[0] });
    drawEll(g, lab, ell(cx, 50, 2.2, 2.8), { edge: lab[0] }); // 陰蒂包皮
    put(g, cx, 52, RAMPS.mucosa[3]); put(g, cx, 53, RAMPS.mucosa[2]); // 陰蒂
    const vest = ell(cx, 61.5, 1.8, 7.5);
    shape(g, RAMPS.mucosa, vest.in, vest.lit, { outline: false }); // 前庭（濕粉）
    shape(g, RAMPS.hole, ell(cx, 65, 1.6, 2.4).in, () => 0.5, { outline: false }); // 肉穴口
    put(g, cx, 65, RAMPS.hole[0]); put(g, cx, 66, RAMPS.hole[0]);
    put(g, cx, 57, RAMPS.mucosa[1]); // 尿道口
    // 陰毛：底下一塊實心暗毛＋上面一根根捲毛（hash 固定，幀之間不閃）
    const HAIR = {
      trim: { c: [cx, 41, 4, 7], n: 50, side: 0 },
      natural: { c: [cx, 41, 12, 8.5], n: 230, side: 50 },
      bush: { c: [cx, 42, 15.5, 11], n: 380, side: 120 },
    }[style];
    if (HAIR) {
      const [hx, hy, hrx, hry] = HAIR.c;
      const inBody = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < g.w && y < g.h && !!g.px[y * g.w + x]; };
      const slit = (x, y) => Math.abs(x - cx) < 2.6 && y > 48;
      // 倒三角：越下面越窄
      const dHair = (x, y) => {
        const shrink = 1 - 0.35 * clamp01((y - hy) / hry);
        return Math.sqrt(((x - hx) / (hrx * shrink)) ** 2 + ((y - hy) / hry) ** 2);
      };
      for (let y = 0; y < g.h; y++) for (let x = 0; x < g.w; x++) {
        if (!inBody(x, y) || slit(x + 0.5, y + 0.5)) continue;
        if (dHair(x + 0.5, y + 0.5) < 0.62) put(g, x, y, hash(x, y, 9) < 0.7 ? hairR[1] : hairR[0]);
      }
      const strand = (x, y, k, len) => {
        let a = Math.PI / 2 + (hash(k, 1, 4) - 0.5) * 2.6; // 大多往下垂、亂翹
        const curl = (hash(k, 2, 4) - 0.5) * 1.1;
        const tone = hash(k, 3, 4);
        const col = tone < 0.45 ? hairR[0] : tone < 0.8 ? hairR[1] : tone < 0.95 ? hairR[2] : hairR[3];
        for (let i = 0; i < len; i++) {
          if (!inBody(x, y) || slit(x, y)) break;
          put(g, x, y, i === 0 && tone > 0.6 ? hairR[2] : col);
          x += Math.cos(a); y += Math.sin(a) * 0.9; a += curl;
        }
      };
      for (let k = 0; k < HAIR.n; k++) {
        const r = Math.sqrt(hash(k, 5, 4)) * 1.08, t = hash(k, 6, 4) * Math.PI * 2;
        const x = hx + Math.cos(t) * hrx * r * (1 - 0.3 * clamp01(Math.sin(t))), y = hy + Math.sin(t) * hry * r;
        strand(x, y, k, 2 + Math.floor(hash(k, 7, 4) * 4));
      }
      // 沿大陰唇兩側往下長的毛
      for (let k = 0; k < HAIR.side; k++) {
        const side = k % 2 ? 1 : -1;
        const y = 48 + hash(k, 8, 5) * (style === "bush" ? 20 : 12);
        const x = cx + side * (4 + hash(k, 9, 5) * 6);
        strand(x, y, k + 1000, 2 + Math.floor(hash(k, 10, 5) * 3));
      }
    }
    // 濕亮點（愛液反光）
    if (opts.wet !== false) {
      for (const [x, y] of [[cx - 2, 56], [cx + 2, 60], [cx - 1, 64], [cx + 1, 68], [cx - 7, 60], [cx + 7, 63], [cx + 1, 54]]) put(g, x, y, RAMPS.wet);
      for (const [x, y] of [[cx - 24, 54], [cx + 21, 58], [cx - 16, 66], [cx + 28, 48], [cx - 10, 30]]) {
        put(g, x, y, RAMPS.wet); put(g, x, y + 1, skin[3]);
      }
    }
    silhouette(g, skin[0]);
    return g;
  }

  /** 陰道剖面（側面，入口在左、子宮頸在右）。depth＝龜頭進到入口後幾格（<0＝沒插）。 */
  function crossSection(opts = {}) {
    const lab = RAMPS.labia[opts.labia] || RAMPS.labia.pink;
    const mskin = RAMPS.skin[opts.maleSkin] || RAMPS.skin.medium;
    const depth = Number.isFinite(opts.depth) ? opts.depth : -99;
    const pr = opts.pr || 3.6;
    const g = grid(86, 36);
    const ox = 9, end = 71;
    const cy = (x) => 19 - 0.07 * (x - ox);
    const tip = ox + depth;
    const rest = 0.6, open = pr + 0.7;
    const lumen = (x) => {
      if (depth < 0) return rest;
      if (x <= tip - 2) return open;
      if (x >= tip + 4) return rest;
      return open + (rest - open) * (x - (tip - 2)) / 6;
    };
    // 周圍組織
    shape(g, RAMPS.tissue,
      (x, y) => x >= ox - 2 && Math.abs((x - 46) / 40) ** 4 + Math.abs((y - 18) / 15) ** 4 < 1,
      (x, y) => clamp01(0.62 - 0.35 * (y - 18) / 15));
    // 子宮（暗示）
    drawEll(g, RAMPS.tissue, ell(82, cy(82) - 1, 7, 9));
    // 陰道壁（皺褶）
    shape(g, RAMPS.mucosa,
      (x, y) => x >= ox - 1 && x <= end && Math.abs(y - cy(x)) < lumen(x) + 2.8,
      (x, y) => {
        const up = y < cy(x);
        const rug = Math.floor(x / 2) % 2 ? 0.18 : -0.12;
        return clamp01((up ? 0.62 : 0.5) + rug);
      });
    drawEll(g, RAMPS.mucosa, ell(75, cy(75), 5.2, 5.8)); // 子宮頸
    put(g, 70, cy(70), RAMPS.hole[0]); // 子宮頸口
    // 腔
    shape(g, RAMPS.hole, (x, y) => x >= ox - 1 && x <= end - 1 && Math.abs(y - cy(x)) < lumen(x), () => 0.5, { outline: false });
    // 陰唇（入口上下兩瓣，被撐開會往外推）
    const lr = lumen(ox);
    drawEll(g, lab, ell(ox - 2.5, cy(ox) - (lr + 2.4), 5.5, 2.6));
    drawEll(g, lab, ell(ox - 2.5, cy(ox) + (lr + 2.4), 5.5, 2.6));
    // 陰莖
    if (depth > -20) {
      tube(g, mskin, 0, tip - 8, cy, () => pr);
      glans(g, tip - 9, cy, 9, pr + 0.6);
    }
    return g;
  }

  function render(canvas, g, scale = 6) {
    canvas.width = g.w * scale;
    canvas.height = g.h * scale;
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let y = 0; y < g.h; y++) {
      for (let x = 0; x < g.w; x++) {
        const c = g.px[y * g.w + x];
        if (!c) continue;
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
  }

  root.PixelSex = { RAMPS, penis, vulva, crotch, crossSection, render };
})(typeof window !== "undefined" ? window : globalThis);
