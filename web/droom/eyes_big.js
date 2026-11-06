// 2026-11-05 近景大眼睛（使用者：下一步做眼睛，先畫一組看看）。模型只標兩眼位置（face/<body>_eyes_<dir>.png，#8080FF），
// 遠景眼睛只有幾個像素，照舊用 eyesOver() 的點陣畫法；近景（面對面 sheet）一隻眼睛約 80 像素寬，改用這裡畫。
// 2026-11-05 第 2 版（使用者給參考圖：半寫實漫畫眼）：
//   眼形＝寬的杏仁形（開口高約眼寬 0.38），上眼皮最高點偏內側、下眼皮淺；上眼線粗、往外眼角加粗，眼尾往外一撇；
//   上面一條細的雙眼皮摺線；上睫毛一根根往外翹（越外越長、越斜）、下睫毛只在外側幾根；內眼角尖尖的淚腺；
//   瞳孔是圓的，上緣被眼皮蓋住一點：外圈深、上面一段眼皮陰影、下亮、瞳仁小、左上一個小亮點；眼白上緣淡影。
//   斜面：遠的那隻變窄，但開口高度照近的那隻（不會變扁），瞳孔往臉轉的方向偏；正側面：「<」楔形，前緣開口、瞳孔是貼前緣的窄橢圓。
(function () {
  // open＝開口高（×參考眼寬）；tilt＝外眼角比內眼角低多少（＋往下、−往上，×參考眼寬）；pk＝上眼皮最高點在哪（0 內→1 外）
  const SHAPE = {
    // 2026-11-05 使用者（參考圖）：開眼太小 → 開口高加大（杏眼 .38→.5）；模型的眼睛也往上移、變大
    // 2026-11-05 第 3 版（使用者：眼睛在眼窩裡面、沒有那麼大）：開口回到眼寬約四成，瞳孔小一點，睫毛短一點
    // 2026-11-06 第 3 種畫法：眼睛開大一點（參考圖瞳孔碰到上下眼皮）
    round:  { open: .62, tilt: -.02, pk: .45, lash: 1 },
    almond: { open: .55, tilt: -.05, pk: .42, lash: 1 },
    droopy: { open: .55, tilt: .08,  pk: .4,  lash: .85 },
    cat:    { open: .48, tilt: -.14, pk: .45, lash: 1.15 },
    // 2026-11-06 使用者給真人參考照（學這個五官）：杏仁眼、開口偏窄、上眼皮蓋住瞳孔上緣一點（內雙、眼皮有陰影），
    //   細長上揚的眼線（外眼角往外上拉出尖尾，不是粗睫毛三角）、下眼線整條淡淡暈開（外側深）、瞳孔中等＋深外圈＋小瞳仁
    winged: { open: .32, tilt: -.03, pk: .5, lash: .7, wing: 1, iris: 1.05, scale: .88, pupil: .3, hood: 1 },
  };
  const SOCK = [196, 132, 112], LINE = [52, 34, 34], LINE2 = [96, 64, 60], CREASE = [176, 122, 108], LOWER = [150, 100, 96], SCL = [252, 250, 250], SCL_SH = [222, 214, 222], WHITE = [255, 255, 255], CARU = [226, 150, 150];
  const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  function paint(d, hm, W, H, box, out, turn, side, st, IR, wRef, vis, lashOnly) {
    const [x0, y0, x1, y1] = box, w = x1 - x0 + 1, h = y1 - y0 + 1, R = wRef || w;
    // vis：看得到的眼睛範圍（標記往外擴幾格）；被鼻樑擋住的地方沒有標記 → 不畫（不會像貼紙一樣蓋在鼻子上）。外眼角的睫毛、眼尾不受限（free）
    let free = false;
    const put = (x, y, o, k = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; if (hm[i >> 2] || !d[i + 3]) return; if (vis && !free && !vis[i >> 2]) return; for (let j = 0; j < 3; j++) d[i + j] = d[i + j] * (1 - k) + o[j] * k; };
    const X = u => out > 0 ? x0 + u * (w - 1) : x1 - u * (w - 1), U = x => out > 0 ? (x - x0) / (w - 1) : (x1 - x) / (w - 1);
    const stroke = (xa, ya, xb, yb, t0, t1, c) => { const n = Math.ceil(Math.hypot(xb - xa, yb - ya) * 2) + 1; for (let i = 0; i <= n; i++) { const s = i / n, x = xa + (xb - xa) * s, y = ya + (yb - ya) * s, t = t0 + (t1 - t0) * s; for (let dy = -t / 2; dy <= t / 2; dy += .5) for (let dx = -t / 2; dx <= t / 2; dx += .5) put(x + dx, y + dy, c); } };
    const cyc = (y0 + y1) / 2 + h * .06;
    const S = SHAPE[st] || SHAPE.almond, O = S.open * R;
    if (st === 'happy' || st === 'closed') {   // 笑眼 ∩／閉眼 ︶：一條眼線（外側粗）＋睫毛；閉眼睫毛往下
      const up = st === 'happy', base = u => cyc + S.tilt * R * u, arc = u => base(u) + (up ? -1 : 1) * O * .35 * Math.sin(Math.PI * u);
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x), t = R * (.02 + .035 * sstep(.1, .8, u)); for (let y = arc(u) - t / 2; y <= arc(u) + t / 2; y++) put(x, y, LINE); }
      for (let k = 0; k < 4; k++) { const u = .55 + k * .14, xs = X(Math.min(1, u)), ys = arc(Math.min(1, u)), L = R * (.05 + .04 * k), a = (up ? 1 : -1) * (.9 - .18 * k);
        stroke(xs, ys, xs + out * L * Math.cos(a) * .8, ys - L * Math.sin(a), 2, 1, LINE); }
      return;
    }
    if (side) {   // 正側面：「<」楔形。u＝0 前緣（開口、朝臉前方），u＝1 外眼角（朝耳朵）
      const Hs = Math.min(h * .9, O * 1.1), top = u => cyc - Hs * .55 * Math.pow(1 - u, .9), bot = u => cyc + Hs * .4 * Math.pow(1 - u, 1.1);
      const irx = Math.max(1.5, w * .16), iry = Hs * .42, icx = X(.1), icy = cyc - Hs * .04;
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < 0 || u > 1) continue;
        for (let y = Math.ceil(top(u)); y <= Math.floor(bot(u)); y++) { const ex = (x - icx) / irx, ey = (y - icy) / iry, r = Math.hypot(ex, ey);
          put(x, y, r <= 1 ? (r > .8 ? IR[0] : ey < -.3 ? IR[0] : ey < .35 ? IR[1] : IR[2]) : y - top(u) < 2 ? SCL_SH : SCL); } }
      for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) { const u = Math.min(1, Math.max(0, U(x))), t = R * (.025 + .03 * u); for (let y = top(u) - t * .7; y <= top(u) + t * .3; y++) put(x, y, LINE); put(x, bot(u) + 1, LOWER, .9); }
      for (let k = 0; k < 4; k++) { const u = .05 + k * .2, xs = X(u), ys = top(u), L = R * (.06 + .02 * k); stroke(xs, ys, xs - out * L * .5, ys - L * .9, 2, 1, LINE); }   // 睫毛往前上翹
      if (S.wing) { free = true; stroke(X(.85), top(.85), X(1) + out * R * .2, cyc - R * .12, R * .04, 1, LINE); free = false; }   // 2026-11-06 上揚眼線：側面也拉出尾巴（往耳朵、往上）
      return;
    }
    // 正面／斜面
    // 2026-11-06 第 3 種畫法（使用者給第 3 組參考圖：眼睛不好看，用這個眼睛眉毛）：
    //   粗上眼線、外眼角一塊實心三角＋三根粗睫毛往外翹、內眼角往下一小尖；大圓瞳孔碰到上下眼皮（上面一段眼皮陰影、深外圈、大瞳仁、一個大亮點）；
    //   下眼皮外側一段粗短線（跟上眼線分開）、內側細淡；雙眼皮摺線貼近眼睛。
    const base = u => cyc + S.tilt * R * u;
    const sk = u => u < S.pk ? .5 * u / S.pk : .5 + .5 * (u - S.pk) / (1 - S.pk);
    const top = u => base(u) - O * .6 * Math.pow(Math.max(0, Math.sin(Math.PI * sk(u))), .6);
    const bot = u => base(u) + O * .4 * Math.pow(Math.max(0, Math.sin(Math.PI * (u < .5 ? .5 * u / .5 : .5 + .5 * (u - .5) / .5))), .8);
    const um = .5, ri = O * .6 * (S.iris || 1), icx = X(um) + turn * .1 * w, icy = (top(um) + bot(um)) / 2 + O * (S.hood ? -.06 : .02), irx = ri * .92 * Math.min(1, .45 + .55 * w / R);
    // 1) 眼白＋瞳孔
    if (!lashOnly) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const u = U(x), yt = top(u), yb = bot(u);
      for (let y = Math.ceil(yt); y <= Math.floor(yb); y++) {
        const ex = (x - icx) / irx, ey = (y - icy) / ri, r = Math.hypot(ex, ey);
        if (r <= 1) {
          let c = r > .86 ? IR[0].map(q => q * .7) : y - yt < O * .3 ? IR[0] : ey < .25 ? IR[1] : IR[2];
          if (S.wing && r > .86) c = IR[0].map(q => q * .7);   // 深外圈（參考照：淺色瞳孔外面一圈深）
          else if (S.wing && r > .3 && r <= .86) { const a = Math.atan2(ey, ex), k = .5 + .5 * Math.sin(a * 9 + r * 6); c = c.map((q, j) => q * (1 - .12 * k) + IR[2][j] * .12 * k); }   // 虹膜放射紋
          if (r < (S.pupil || .42)) c = [20, 16, 22];   // 瞳仁
          put(x, y, c);
        } else put(x, y, u < .04 ? CARU : y - yt < Math.max(1.5, O * .16) ? SCL_SH : SCL);
      }
    }
    // 亮點：上面一個大圓（光從左上）＋右下一小點
    { const hx = icx - irx * .28, hy = icy - ri * .32, hrx = Math.max(2, irx * .3), hry = Math.max(2, ri * .26); for (let y = hy - hry; y <= hy + hry; y++) for (let x = hx - hrx; x <= hx + hrx; x++) if (((x - hx) / hrx) ** 2 + ((y - hy) / hry) ** 2 <= 1 && y > top(U(x)) + 1) put(x, y, WHITE);
      put(icx + irx * .35, icy + ri * .35, WHITE); put(icx + irx * .35 + 1, icy + ri * .35, WHITE, .7); }
    }
    // 2) 雙眼皮摺線：貼近眼睛的一條細線
    if (S.hood) {   // 內雙：摺線貼近眼線、中間一片眼皮陰影（參考照）
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1) + Math.round(w * .04); x++) { const u = Math.min(1.04, U(x)); if (u < .12) continue; const uu = Math.min(1, u), yc = top(uu) - O * (.2 + .06 * Math.sin(Math.PI * uu)), k = sstep(.12, .35, u);
        put(x, yc, LINE2, .6 * k); for (let y = Math.ceil(yc + 1); y < top(uu); y++) put(x, y, SOCK, .35 * k); }
    } else
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < .22 || u > 1) continue; const y = top(u) - O * (.16 + .1 * Math.sin(Math.PI * u)); const k = sstep(.22, .4, u); put(x, y, LINE2, .75 * k); }
    // 眼窩陰影（第 9 版起真的凹陷已經有陰影，這裡只淡淡補一點）
    free = true;
    for (let x = Math.min(x0, x1) - Math.round(w * .06); x <= Math.max(x0, x1) + Math.round(w * .04); x++) { const u = Math.min(1.05, Math.max(-.05, U(x))), yt = top(Math.min(1, Math.max(0, u))), H1 = O * 1.05, kk = .2 * (1 - .45 * Math.max(0, u - .3) / .75) * Math.min(1, (u + .1) / .25);
      for (let y = Math.floor(yt - H1); y < yt; y++) { const q = (y - (yt - H1)) / H1; put(x, y, SOCK, kk * q * q); } }
    free = false;
    // 3) 上眼線：粗，往外越粗
    for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) {
      const u = Math.min(1, Math.max(0, U(x))), t = R * (S.wing ? .035 + .035 * sstep(.05, .9, u) : .03 + .07 * sstep(.05, .85, u)), yt = top(u);
      for (let y = yt - t * .8; y <= yt + t * .25; y++) put(x, y, LINE);
    }
    // 外眼角：實心三角（上眼線往下包到下眼皮）＋三根粗睫毛往外翹
    if (S.wing) {   // 細長上揚眼線：從上眼線外段一路拉出眼尾外面、往上收成尖（實心楔形），沒有粗睫毛
      free = true;
      const xe = X(1), ye = top(1) + (bot(1) - top(1)) * .1, xt = xe + out * R * .3, yt2 = ye - R * (.13 + .2 * Math.max(0, -S.tilt));
      for (let i = 0, n = Math.ceil(R * .6); i <= n; i++) { const s2 = i / n, u = .72 + .28 * s2, xa = X(u), ya = top(u) - R * .01;   // 上緣：沿上眼線到尾尖
        const xb = xe + (xt - xe) * s2, yb = ye + (yt2 - ye) * s2;   // 下緣：從外眼角直線到尾尖
        stroke(xa, ya, xb + (xt - xb) * s2 * s2, yb + (yt2 - yb) * s2 * s2, Math.max(1, R * .03 * (1 - s2)), 1, LINE); }
      stroke(xe, ye, xt, yt2, R * .04, 1, LINE);
      for (let k = 0; k < 6; k++) { const u = .35 + k * .11, xs = X(Math.min(1, u)), ys = top(Math.min(1, u)) - R * .02, L = R * (.04 + .015 * k) * S.lash; stroke(xs, ys, xs + out * L * .55, ys - L, Math.max(1, R * .02), 1, LINE); }   // 短而密的睫毛
      stroke(X(0), base(0) - O * .02, X(-.05), base(0) + O * .1, R * .025, 1, LINE);   // 內眼角
      free = false;
      for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) { const u = Math.min(1, Math.max(0, U(x))), yb = bot(u) + 1;   // 下眼線：整條暈開、外側深，下面一層淡淡陰影
        if (u < .1) continue; const k = sstep(.1, .45, u); put(x, yb, LINE2, .35 + .5 * k); put(x, yb + 1, LINE2, .25 * k); for (let y = yb + 2; y < yb + 2 + O * .25; y++) put(x, y, SOCK, .18 * k * (1 - (y - yb - 2) / (O * .25))); }
      return;
    }
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < .8) continue; const yt = top(u), yb = bot(u), f = sstep(.8, 1, u); for (let y = yt; y <= yt + (yb - yt) * f * .75; y++) put(x, y, LINE); }
    free = true;
    { const xe = X(1), ye = top(1) + (bot(1) - top(1)) * .2;
      for (const [ang, len, wd] of [[38, .2, .075], [14, .24, .085], [-12, .15, .06]]) { const a = (ang - S.tilt * 60) * Math.PI / 180, Lh = R * len * S.lash; stroke(xe - out * R * .02, ye, xe + out * Lh * Math.cos(a), ye - Lh * Math.sin(a), R * wd, 1, LINE); }
      const um2 = .55, xs = X(um2), ys = top(um2) - R * .05; stroke(xs, ys, xs + out * R * .05, ys - R * .09, R * .04, 1, LINE); }   // 上面中間一小根
    // 內眼角：往下一小尖
    stroke(X(0), base(0) - O * .05, X(-.06), base(0) + O * .18, R * .035, 1, LINE);
    free = false;
    // 4) 下眼皮：外側一段粗短線（跟上眼線分開一點）、內側細淡
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x), yb = bot(u) + 1;
      if (u > .5 && u < .93) { const t = R * .035 * Math.sin(Math.PI * (u - .5) / .43); for (let y = yb; y <= yb + t; y++) put(x, y, LINE2); }
      else if (u > .12 && u <= .5) put(x, yb, LOWER, .5); }
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
    { const sc = (SHAPE[st] || {}).scale; if (sc) for (const bx of boxes) { const c = (bx[0] + bx[2]) / 2, hw = (bx[2] - bx[0]) * sc / 2; bx[0] = Math.round(c - hw); bx[2] = Math.round(c + hw); } }   // 2026-11-06 參考照的眼睛比較小（約臉寬 1/5）
    const one = boxes.length === 1 || side, ws = boxes.map(b => b[2] - b[0] + 1);
    // 看得到的眼睛範圍：標記往外擴 Dl 格（眼線、摺線、陰影會畫到標記外面一點）
    const Dl = Math.max(2, Math.round(Math.max(...ws) * .16)), vis = new Uint8Array(W * H), vis0 = new Uint8Array(W * H);   // vis0：不擴（遠眼用，2026-11-06 使用者：挺的鼻樑要遮到另一隻眼睛）
    for (let y = 0; y < H; y++) for (let x = f * FW; x < (f + 1) * FW; x++) if (isE(x, y)) vis0[y * W + x] = 1;
    for (let y = 0; y < H; y++) for (let x = f * FW; x < (f + 1) * FW; x++) if (isE(x, y)) for (let dy = -Dl; dy <= Dl; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const r = Dl - Math.abs(dy); for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) vis[yy * W + xx] = 1; } }
    // 斜面：兩隻眼睛一寬一窄（遠的那隻窄）→ 臉轉向窄的那邊，瞳孔一起往那邊偏；開口高度照寬的那隻（正側面照眼睛高）
    const turn = boxes.length === 2 && Math.abs(ws[0] - ws[1]) > .12 * Math.max(...ws) ? (ws[0] < ws[1] ? -1 : 1) : 0;
    const wRef = one ? Math.max(...boxes.map(b => (b[3] - b[1] + 1) * 1.25)) : Math.max(...ws);
    boxes.forEach((b, k) => { const out = boxes.length > 1 ? (k === 0 ? -1 : 1) : -fs || 1;
      if (boxes.length === 2 && EyeBig.far === 'hide' && ws[k] < .55 * Math.max(...ws)) return;   // 被山根擋住：遠眼整隻不畫
      const far = boxes.length === 2 && ws[k] < .8 * Math.max(...ws);
      paint(d, hm, W, H, b, out, turn, one, st, IR, wRef, far ? vis0 : vis, boxes.length === 2 && EyeBig.far === 'lash' && ws[k] < .55 * Math.max(...ws)); });
    return true;
  }
  // 2026-11-06 近景大眉毛（使用者第 3 組參考圖）：實心的毛筆筆觸——眉頭粗、約 30% 最粗、往眉尾收成尖；中後段拱起、眉尾往下。
  //   模型只標眉毛位置（face/<body>_brows_<dir>.png，#FFC040），這裡照範圍畫。眉型：natural 自然、flat 平、arch 細彎、thick 粗、worried 八字、angry 怒。
  const BROW = { natural: [.1, 0, 1], flat: [.03, 0, 1], arch: [.18, 0, .8], thick: [.08, 0, 1.45], worried: [.06, -.2, 1], angry: [.06, .22, 1.05] };   // [拱起, 眉頭高低（−往上）, 粗細倍率]
  function browOver(d, hm, BD, W, NF, dOf, st, HP, f) {
    const H = BD.length / 4 / W, FW = W / NF, isB = (x, y) => { const i = (y * W + x) * 4; return BD[i + 3] && BD[i] >= 150 && BD[i + 1] >= 110 && BD[i + 1] <= 200 && BD[i + 2] <= 70; };
    const [fs] = dOf(f), cols = []; let n = 0;
    const yOf = []; for (let x = f * FW; x < (f + 1) * FW; x++) { let on = false, ys = 0, c = 0; for (let y = 0; y < H; y++) if (isB(x, y)) { on = true; ys += y; c++; } cols.push(on); yOf.push(c ? ys / c : 0); if (on) n++; }
    if (!n) return false;
    const bs = []; for (let i = 0; i < cols.length; i++) if (cols[i]) { let j = i; while (j + 1 < cols.length && cols[j + 1]) j++; bs.push([i, j]); i = j; }
    const Wmax = Math.max(...bs.map(([a, b]) => b - a + 1)); if (Wmax < 20) return false;   // 遠景 → 舊畫法
    const S = BROW[st] || BROW.natural, C = HP[0].map(v => v * .75), C2 = HP[0].map((v, j) => v * .55 + HP[1][j] * .45);
    const put = (x, y, o) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; if (hm[i >> 2] || !d[i + 3]) return; d[i] = o[0]; d[i + 1] = o[1]; d[i + 2] = o[2]; };
    if (st === 'bold') {
      // 2026-11-06 真人參考照：濃眉。第 2 版（使用者：眉型、位置不對）——照參考照量：
      //   位置：眉頭在內眼角正上方（模型標記的眉頭偏鼻樑內側，往外移 15%），眉尾超過外眼角，全長約 1.2 個標記寬；眉毛下緣到眼睛的距離比眼睛開口高一點（不再壓低）。
      //   眉型：眉頭最粗（方方的、顏色淡一點、往上的毛流），往外慢慢變細、一路往上升到約 62% 的眉峰（柔和的角），再往下收成尖尖的眉尾，眉尾高度跟眉頭下緣差不多。邊緣半透明不鋸齒。
      const Cb = HP[0].map(v => v * .5), Cb2 = HP[0].map((v, j) => v * .55 + HP[1][j] * .3 + 40);
      const putA = (x, y, o, k) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H || k <= 0) return; const i = (y * W + x) * 4; if (hm[i >> 2] || !d[i + 3]) return; k = Math.min(1, k); for (let j = 0; j < 3; j++) d[i + j] = d[i + j] * (1 - k) + o[j] * k; };
      bs.forEach(([a, b], k) => { const inner = bs.length > 1 ? (k === 0 ? 1 : -1) : fs || 1, w = b - a + 1, T = Wmax;
        const xIn = f * FW + (inner > 0 ? b : a), xh = xIn - inner * w * .15, len = w * 1.08;
        const yc = (yOf[a] + yOf[b] + 2 * yOf[(a + b) >> 1]) / 4;
        const cen = t => yc + T * (.06 - .14 * sstep(0, .62, t) + .17 * Math.pow(sstep(.62, 1, t), 1.1));
        const thk = t => T * (t < .62 ? .27 - .08 * t / .62 : Math.max(.025, .19 * (1 - (t - .62) / .38) ** 1.3));
        const n = Math.ceil(len * 2);
        for (let i = 0; i <= n; i++) { const t = i / n, x = xh - inner * t * len, c = cen(t), th = thk(t), hi = c - th * .55, lo = c + th * .45;
          for (let y = Math.floor(hi) - 1; y <= lo + 1; y++) { const e = Math.min(y - hi, lo - y) + .5; if (e <= 0) continue; const q = (y - hi) / th;
            let col = Cb, kk = Math.min(1, e);
            if (t < .14) { const u = t / .14; kk *= .35 + .65 * u * u; if (q < .3 * (1 - u) || q > 1 - .15 * (1 - u)) kk *= .4; col = u < .6 ? Cb2 : Cb; }   // 眉頭：從淡到深漸變、上下角圓一點
            putA(x, y, col, kk); } } });
      return true;
    }
    bs.forEach(([a, b], k) => { const inner = bs.length > 1 ? (k === 0 ? 1 : -1) : fs || 1, xa = f * FW + (inner > 0 ? b : a), w = b - a + 1, R = Math.max(w, Wmax * .6);
      const yc = (yOf[a] + yOf[b] + 2 * yOf[(a + b) >> 1]) / 4;
      for (let i = 0; i <= w * 2; i++) { const t = i / (w * 2), x = xa - inner * t * (w - 1);
        const yy = yc + R * (-S[0] * Math.sin(Math.PI * Math.min(1, t * 1.15)) + S[1] * (1 - t) * .5 + .06 * Math.max(0, t - .7) / .3);
        const th = R * .16 * S[2] * (t < .3 ? .75 + .25 * t / .3 : Math.max(.12, 1 - (t - .3) / .7));
        for (let y = yy - th / 2; y <= yy + th / 2; y++) put(x, y, (y > yy + th * .25) ? C2 : C); } });
    return true;
  }
  // 2026-11-06 近景鼻子（真人參考照：鼻樑直、鼻頭圓潤、看得到兩個小鼻孔）。模型標鼻子位置（face/<body>_nose_<style>_<dir>.png，#FF0080）。
  //   鼻樑兩側只有很淡的陰影（背光那側一條）、鼻頭一個亮點、鼻頭下面一片陰影、兩個鼻孔、鼻翼兩條小弧線。正側面只補膚色＋一個鼻孔。回傳 false＝太小（遠景）用舊畫法
  function noseOver(d, hm, ND, W, NF, s, f) {
    const H = ND.length / 4 / W, FW = W / NF, isN = (x, y) => { if (x < f * FW || x >= (f + 1) * FW || y < 0 || y >= H) return false; const i = (y * W + x) * 4; return ND[i + 3] && ND[i] > 100 && ND[i + 1] == 0 && ND[i + 2] > 40; };
    let x0 = 1e9, x1 = -1, y0 = 1e9, y1 = -1; for (let y = 0; y < H; y++) for (let x = f * FW; x < (f + 1) * FW; x++) if (isN(x, y)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    if (x1 < 0 || y1 - y0 < 30) return false;
    const SK = [245, 208, 181], HI = [253, 230, 216], SH = [222, 166, 144], SH2 = [200, 136, 116], NOS = [120, 62, 58], LN = [176, 108, 92];
    const put = (x, y, o, k = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; if (hm[i >> 2]) return; if (!d[i + 3]) { d[i] = SK[0]; d[i + 1] = SK[1]; d[i + 2] = SK[2]; d[i + 3] = 255; } for (let j = 0; j < 3; j++) d[i + j] = d[i + j] * (1 - k) + o[j] * k; };
    const h = y1 - y0, ell = (cx, cy, rx, ry, c, k) => { for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) { const e = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2; if (e <= 1) put(x, y, c, k * (e > .6 ? .6 : 1)); } };
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (isN(x, y) && !d[(y * W + x) * 4 + 3]) put(x, y, SK);   // 凸出臉外補膚色
    // 下半部每列的左右邊、鼻頭中心（最下面 25% 的平均）
    let sx = 0, n = 0; for (let y = Math.round(y1 - h * .25); y <= y1; y++) for (let x = x0; x <= x1; x++) if (isN(x, y)) { sx += x; n++; }
    const cx = n ? sx / n : (x0 + x1) / 2, wTip = x1 - x0 + 1;
    if (!s) { const dir = (x1 - cx) > (cx - x0) ? -1 : 1; ell(cx + dir * wTip * .1, y1 - h * .04, Math.max(1.5, wTip * .12), Math.max(1, h * .025), NOS, .8); return true; }   // 正側面
    // 鼻樑：背光那側（s 那側，光從另一邊上方）一條往內漸淡的陰影，越往下越明顯
    for (let y = Math.round(y0 + h * .12); y <= y1 - h * .18; y++) { let xe = -1; if (s < 0) { for (let x = x0; x <= x1; x++) if (isN(x, y)) { xe = x; break; } } else { for (let x = x1; x >= x0; x--) if (isN(x, y)) { xe = x; break; } } if (xe < 0) continue;
      const k = .12 + .3 * (y - y0) / h; for (let j = 0; j < 4; j++) put(xe - s * j, y, SH, k * (1 - j / 4)); }
    // 鼻頭：圓潤一顆（亮點偏光那側上方）、鼻頭下面一片陰影
    const ty = y1 - h * .14, rT = wTip * .3;
    ell(cx + s * rT * .6, ty, rT * .5, h * .07, SH, .3);   // 鼻頭背光那側的圓形陰影
    ell(cx - s * rT * .2, ty - h * .035, rT * .32, h * .028, HI, .9);   // 鼻頭亮點
    for (let x = x0 - 1; x <= x1 + 1; x++) { let yb = -1; for (let y = y1; y >= y0; y--) if (isN(x, y)) { yb = y; break; } if (yb < 0) continue; const u = Math.abs(x - cx) / (wTip / 2), k = .75 * (1 - Math.min(1, u) ** 2);
      for (let dy = 0; dy < 5; dy++) put(x, yb - dy, SH2, k * (1 - dy / 5)); put(x, yb + 1, SH, k * .6); put(x, yb + 2, SH, k * .3); }   // 鼻頭下面的陰影＋落在人中上的影子
    // 鼻孔：兩個小橢圓（斜面遠的那個小一點）；鼻翼：兩條小弧
    for (const side of [-1, 1]) { const far = side === -s ? .7 : 1, nx = cx + side * wTip * .2 * far, ny = y1 - h * .035;
      ell(nx, ny, Math.max(2, wTip * .1 * far), Math.max(1.5, h * .028), NOS, .9);
      const dark = side === s ? .85 : .55;   // 鼻翼：外側一條弧（從鼻翼上緣彎下來接到鼻孔），背光那側深、裡面淡淡一片陰影
      for (let i = 0; i <= 16; i++) { const a = i / 16, ax = cx + side * wTip * (.38 - .1 * a), ay = y1 - h * (.15 - .13 * a) - h * .035 * Math.sin(Math.PI * a), kk = dark * Math.sin(Math.PI * Math.min(1, .15 + a * 1.1));
        put(ax, ay, LN, kk); put(ax - side, ay, LN, kk * .5); if (side === s) for (let j = 1; j < 4; j++) put(ax - side * (j + 1), ay, SH, .25 * (1 - j / 4)); } }
    return true;
  }
  // far：斜面遠的那隻被擠到鼻樑旁（寬度 < 近眼 55%）時 'hide'＝被山根擋住不畫（2026-11-05 使用者：側面眼睛應該被山根擋住、不是印上去）、'lash'＝只畫眼線睫毛、'full'＝整隻畫
  const EyeBig = { over, paint, SHAPE, far: 'full', browOver, noseOver };   // 第 7 版：臉前面改平，45 度遠眼看得到（使用者：遠眼在鼻樑旁、凹在眼窩裡）→ 整隻畫，被鼻樑擋住的照標記不畫
  window.EyeBig = EyeBig;
})();
