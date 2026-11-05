// 2026-11-05 近景大眼睛（使用者：下一步做眼睛，先畫一組看看）。模型只標兩眼位置（face/<body>_eyes_<dir>.png，#8080FF），
// 遠景眼睛只有幾個像素，照舊用 eyesOver() 的點陣畫法；近景（面對面 sheet）一隻眼睛約 80×65 像素，改用這裡：
//   每隻眼睛在標記範圍裡用曲線畫：上眼線（粗、外眼角更粗、往外翹一點）、下眼線（細、只畫外側）、眼白（上緣一條淡影）、
//   瞳孔（直的橢圓、上深下亮三階、外圈深色、中間瞳仁）、兩個亮點（左上大、右下小）。眼型 6 種、瞳色照 IRIS_PAL。
// 方向：兩隻＝正面或斜面（瞳孔往臉朝的那邊偏）；一隻＝正側面（外眼角朝耳朵，瞳孔貼前緣、變窄）。
(function () {
  // u：0 內眼角→1 外眼角；hu／hl＝上／下眼皮離中線多高（×眼睛高）；tilt＝外眼角往下（＋）或往上（−）；ir＝瞳孔半寬（×眼睛寬）、iry＝瞳孔半高（×眼睛高）
  const SHAPE = {
    round:  { hu: .50, hl: .40, tilt: 0,    ir: .30, iry: .50, flick: .10 },
    almond: { hu: .42, hl: .26, tilt: -.10, ir: .27, iry: .46, flick: .16 },
    droopy: { hu: .44, hl: .30, tilt: .20,  ir: .29, iry: .48, flick: .06 },
    cat:    { hu: .38, hl: .24, tilt: -.26, ir: .25, iry: .44, flick: .24 },
  };
  const LASH = [34, 26, 36], LASH_HI = [70, 50, 62], LOWER = [150, 104, 104], SCL = [252, 250, 250], SCL_SH = [214, 214, 230], WHITE = [255, 255, 255];
  function paint(d, hm, W, H, box, out, turn, side, st, IR) {
    const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1, cy = (y0 + y1) / 2;
    const put = (x, y, o, k = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; if (hm[i >> 2] || !d[i + 3]) return; for (let j = 0; j < 3; j++) d[i + j] = d[i + j] * (1 - k) + o[j] * k; };
    // 外眼角在 out 那側：u＝0 在內眼角
    const X = u => out > 0 ? x0 + u * (w - 1) : x1 - u * (w - 1), U = x => out > 0 ? (x - x0) / (w - 1) : (x1 - x) / (w - 1);
    const th = Math.max(2, h * .09);   // 上眼線粗細
    if (st === 'happy' || st === 'closed') {   // 笑眼 ∩／閉眼 ︶：一條粗弧線＋外眼角幾根睫毛
      const amp = h * .28;
      for (let x = x0; x <= x1; x++) { const u = U(x), yc = st === 'happy' ? cy + h * .1 - amp * Math.sin(Math.PI * u) : cy + h * .1 + amp * .6 * Math.sin(Math.PI * u), t = th * (.6 + .8 * u);
        for (let y = yc - t / 2; y <= yc + t / 2; y++) put(x, y, LASH); }
      if (st === 'closed') for (let k = 0; k < 3; k++) { const u = .7 + k * .12, x = X(u), y = cy + h * .1 + h * .17 * Math.sin(Math.PI * u); for (let s = 0; s < h * .14; s++) put(x + out * s * .5, y + s, LASH); }
      return;
    }
    const S = SHAPE[st] || SHAPE.round;
    const top = u => cy - S.hu * h * Math.sqrt(Math.max(0, Math.sin(Math.PI * u))) + S.tilt * h * (u - .5);   // 上眼皮
    const bot = u => cy + S.hl * h * Math.pow(Math.max(0, Math.sin(Math.PI * u)), .7) + S.tilt * h * (u - .5);   // 下眼皮
    // 瞳孔位置：正面在中間；斜面往臉轉的那邊偏（turn：畫面上 −1 左／＋1 右）；正側面貼前緣（內眼角那側）
    const icx = side ? X(.32) : X(.5) + turn * .1 * w, icy = cy + h * .06;
    const irx = S.ir * w * (side ? .7 : 1), iry = S.iry * h;
    // 1) 眼白＋瞳孔（只在上下眼皮之間）
    for (let x = x0; x <= x1; x++) {
      const u = U(x), yt = top(u), yb = bot(u);
      for (let y = Math.ceil(yt); y <= Math.floor(yb); y++) {
        const ex = (x - icx) / irx, ey = (y - icy) / iry, r = Math.hypot(ex, ey);
        if (r <= 1) {
          const v = (y - (icy - iry)) / (2 * iry);   // 0 上→1 下
          let c = v < .38 ? IR[0] : v < .7 ? IR[1] : IR[2];
          if (r > .86) c = IR[0];   // 外圈
          if (Math.hypot(ex / .42, (ey - .05) / .5) <= 1) c = IR[0].map(q => q * .55);   // 瞳仁
          put(x, y, c);
        } else put(x, y, y - yt < Math.max(2, h * .12) ? SCL_SH : SCL);   // 眼白，上緣一條淡影
      }
    }
    // 2) 亮點：左上大、右下小（光從左上）
    const hl = (dx, dy, rx, ry) => { for (let y = icy + dy - ry; y <= icy + dy + ry; y++) for (let x = icx + dx - rx; x <= icx + dx + rx; x++) if (((x - icx - dx) / rx) ** 2 + ((y - icy - dy) / ry) ** 2 <= 1 && y >= top(U(x)) + 1) put(x, y, WHITE); };
    hl(-irx * .35, -iry * .42, Math.max(1.5, irx * .3), Math.max(1.5, iry * .22));
    hl(irx * .38, iry * .38, Math.max(1, irx * .13), Math.max(1, iry * .1));
    // 3) 上眼線：沿上眼皮，外眼角更粗、往外翹（flick）
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      const u = Math.min(1, Math.max(0, U(x))), yt = top(u), t = th * (.75 + .9 * u * u);
      for (let y = yt - t * .7; y <= yt + t * .3; y++) put(x, y, u > .2 && u < .5 && y < yt - t * .35 ? LASH_HI : LASH);
    }
    { const ue = 1, xe = X(ue), ye = top(ue), L = Math.max(3, w * S.flick + w * .06);   // 翹出去的眼尾
      for (let s = 0; s <= L; s++) { const t = th * (1 - s / L) * 1.1; for (let k = -t / 2; k <= t / 2; k++) put(xe + out * s, ye - s * (.35 + (S.tilt < 0 ? .35 : 0)) + k, LASH); } }
    // 4) 下眼線：外側 55%，細、淡
    for (let x = x0; x <= x1; x++) { const u = U(x); if (u < .45) continue; const yb = bot(u); put(x, yb + 1, LOWER, .9); if (u > .8) put(x, yb + 2, LOWER, .5); }
    // 5) 內眼角一點
    put(X(0) - out, cy + S.tilt * h * -.5, LOWER, .8);
  }
  // 從標記圖找每隻眼睛的範圍，畫上去。回傳 true＝有用大眼畫法（眼睛夠大）
  function over(d, hm, ED, W, NF, dOf, st, IR, f) {
    const H = ED.length / 4 / W, FW = W / NF, isE = (x, y) => { const i = (y * W + x) * 4; return ED[i + 3] && ED[i + 2] >= 150 && ED[i] >= 60 && ED[i] <= 130 && ED[i + 1] >= 60 && ED[i + 1] <= 130; };
    const [fs, side] = dOf(f), cols = [];
    for (let x = f * FW; x < (f + 1) * FW; x++) { let on = false; for (let y = 0; y < H; y++) if (isE(x, y)) { on = true; break; } cols.push(on); }
    const eyes = []; for (let i = 0; i < cols.length; i++) if (cols[i]) { let j = i; while (j + 1 < cols.length && cols[j + 1]) j++; eyes.push([f * FW + i, f * FW + j]); i = j; }
    if (!eyes.length) return false;
    const boxes = eyes.map(([a, b]) => { let t = 1e9, u = -1; for (let x = a; x <= b; x++) for (let y = 0; y < H; y++) if (isE(x, y)) { t = Math.min(t, y); u = Math.max(u, y); } return [a, t, b, u]; });
    if (Math.max(...boxes.map(b => b[3] - b[1])) < 12) return false;   // 太小（遠景）→ 舊畫法
    const one = boxes.length === 1 || side, ws = boxes.map(b => b[2] - b[0]);
    // 斜面：兩隻眼睛一寬一窄（遠的那隻窄）→ 臉轉向窄的那邊，瞳孔一起往那邊偏
    const turn = boxes.length === 2 && Math.abs(ws[0] - ws[1]) > .12 * Math.max(...ws) ? (ws[0] < ws[1] ? -1 : 1) : 0;
    boxes.forEach((b, k) => { const out = boxes.length > 1 ? (k === 0 ? -1 : 1) : -fs || 1; paint(d, hm, W, H, b, out, turn, one, st, IR); });
    return true;
  }
  window.EyeBig = { over, paint, SHAPE };
})();
