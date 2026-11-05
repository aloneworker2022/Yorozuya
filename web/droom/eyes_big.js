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
    round:  { open: .46, tilt: -.02, pk: .45, lash: .9 },
    almond: { open: .40, tilt: -.05, pk: .40, lash: .9 },
    droopy: { open: .40, tilt: .07,  pk: .38, lash: .75 },
    cat:    { open: .35, tilt: -.13, pk: .42, lash: 1.05 },
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
      return;
    }
    // 正面／斜面
    const base = u => cyc + S.tilt * R * u;
    const sk = u => u < S.pk ? .5 * u / S.pk : .5 + .5 * (u - S.pk) / (1 - S.pk);
    const top = u => base(u) - O * .64 * Math.pow(Math.max(0, Math.sin(Math.PI * sk(u))), .75);
    const bot = u => base(u) + O * .36 * Math.pow(Math.max(0, Math.sin(Math.PI * (u < .55 ? .5 * u / .55 : .5 + .5 * (u - .55) / .45))), 1.15);
    const um = .48, ri = O * .52, icx = X(um) + turn * .1 * w, icy = (top(um) + bot(um)) / 2 - O * .04, irx = ri * Math.min(1, .5 + .5 * w / R);
    // 1) 眼白＋瞳孔（lashOnly＝斜面被擠到鼻樑旁的遠眼：只畫眼線和睫毛，不畫眼白、瞳孔）
    if (!lashOnly) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const u = U(x), yt = top(u), yb = bot(u);
      for (let y = Math.ceil(yt); y <= Math.floor(yb); y++) {
        const ex = (x - icx) / irx, ey = (y - icy) / ri, r = Math.hypot(ex, ey);
        if (r <= 1) {
          let c = r > .84 ? IR[0] : y - yt < O * .22 ? IR[0].map((q, j) => q * .6 + IR[1][j] * .4) : ey < .1 ? IR[1] : IR[2];
          if (r > .84 && r <= .9) c = IR[0].map(q => q * .8);
          if (r < .36) c = IR[0].map(q => q * .45);   // 瞳仁
          put(x, y, c);
        } else put(x, y, u < .05 ? CARU : y - yt < Math.max(1.5, O * .14) ? SCL_SH : SCL);
      }
    }
    // 亮點：左上一個小圓（光從左上）＋右下一點
    if (!lashOnly) { const hx = icx - irx * .32, hy = icy - ri * .3, hr = Math.max(1.5, ri * .17); for (let y = hy - hr; y <= hy + hr; y++) for (let x = hx - hr; x <= hx + hr; x++) if ((x - hx) ** 2 + (y - hy) ** 2 <= hr * hr && y > top(U(x)) + 1) put(x, y, WHITE); put(icx + irx * .3, icy + ri * .32, WHITE, .8); }
    }
    // 2) 雙眼皮摺線：上眼皮上方一條細線（中間離遠、兩端靠近）
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < .18 || u > .97) continue; const y = top(u) - O * (.2 + .18 * Math.sin(Math.PI * u)); const k = sstep(.18, .35, u) * (1 - sstep(.85, .97, u)); put(x, y, CREASE, .9 * k + .1); if (u > .4 && u < .85) put(x, y - 1, CREASE, .4 * k); }
    // 2026-11-05 第 6 版：眼窩陰影加大加深（使用者：眼睛是凹進去的，不是凸眼）——臉沒有立體打光，凹進去要靠陰影畫出來（參考圖的畫法）：
    //   ① 眉骨下、眼皮上：從摺線往上到約一個開口高，越靠眼皮越深（內側、中間最深）
    //   ② 內眼角靠山根那側：一條直的陰影往鼻樑漸淡（鼻樑側面）
    //   ③ 下眼皮下面淡淡一層（眼袋的凹）
    free = true;
    for (let x = Math.min(x0, x1) - Math.round(w * .06); x <= Math.max(x0, x1) + Math.round(w * .04); x++) { const u = Math.min(1.05, Math.max(-.05, U(x))), yt = top(Math.min(1, Math.max(0, u))), H1 = O * 1.05, kk = .42 * (1 - .45 * Math.max(0, u - .3) / .75) * Math.min(1, (u + .1) / .25);
      for (let y = Math.floor(yt - H1); y < yt; y++) { const q = (y - (yt - H1)) / H1; put(x, y, SOCK, kk * q * q); } }
    { const xi = X(0), yI = base(0), Wd = O * .8, Wi = O * .35; for (let i = -Math.floor(Wi); i < Wd; i++) for (let y = Math.floor(yI - O * 1.0); y <= yI + O * .7; y++) { const x = xi - out * i, u = U(x); if (i < 0 && y >= top(Math.max(0, u)) - 1 && y <= bot(Math.max(0, u)) + 1) continue; const f = i < 0 ? 1 + i / Wi : 1 - i / Wd, g = y < yI ? 1 - (yI - y) / (O * 1.0) : 1 - (y - yI) / (O * .7); put(x, y, SOCK, .34 * f * f * Math.max(0, g) ** 1.5); } }
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x), yb = bot(u); for (let j = 2; j < O * .5; j++) put(x, yb + j, SOCK, .16 * (1 - j / (O * .5)) * Math.sin(Math.PI * Math.min(1, u * 1.05))); }
    free = false;
    // 3) 上眼線：內側細、外側粗；眼尾往外一撇
    for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) {
      const u = Math.min(1, Math.max(0, U(x))), t = R * (.022 + .05 * sstep(.12, .78, u)), yt = top(u);
      for (let y = yt - t * .75; y <= yt + t * .3; y++) put(x, y, u < .12 ? LINE2 : LINE);
    }
    free = true; { const xe = X(1), ye = top(1), L = R * .13; stroke(xe, ye - R * .02, xe + out * L, ye - L * (.28 - S.tilt * 1.5), R * .055, 1, LINE); } free = false;
    // 4) 上睫毛：一根根往外翹，越外越長越斜
    const nL = 7;
    for (let k = 0; k < nL; k++) { const q = k / (nL - 1), u = .35 + .65 * q, xs = X(Math.min(1, u)), ys = top(Math.min(1, u)) - R * (.022 + .05 * sstep(.12, .78, u)) * .6;
      const a = (80 - 60 * q) * Math.PI / 180, L = R * (.035 + .075 * q * q + .015 * (k % 2)) * S.lash;
      free = q > .6; stroke(xs, ys, xs + out * L * Math.cos(a), ys - L * Math.sin(a), Math.max(1.5, R * .028), 1, LINE); free = false; }
    // 5) 下眼線（外側 70%，細淡）＋外側兩三根下睫毛
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < .3) continue; put(x, bot(u) + 1, LOWER, .5 + .45 * sstep(.3, .8, u)); }
    for (const u of [.62, .74, .85, .95]) { const xs = X(u), ys = bot(u) + 1, L = R * (.03 + .03 * (u - .6) / .35); stroke(xs, ys, xs + out * L * .55, ys + L * .85, 2, 1, LINE2); }
    // 6) 內眼角：淚腺尖角＋一點線
    stroke(X(0), base(0), X(-.04), base(0) + O * .05, 1.5, 1, LOWER);
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
    const one = boxes.length === 1 || side, ws = boxes.map(b => b[2] - b[0] + 1);
    // 看得到的眼睛範圍：標記往外擴 Dl 格（眼線、摺線、陰影會畫到標記外面一點）
    const Dl = Math.max(2, Math.round(Math.max(...ws) * .16)), vis = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = f * FW; x < (f + 1) * FW; x++) if (isE(x, y)) for (let dy = -Dl; dy <= Dl; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue; const r = Dl - Math.abs(dy); for (let dx = -r; dx <= r; dx++) { const xx = x + dx; if (xx >= 0 && xx < W) vis[yy * W + xx] = 1; } }
    // 斜面：兩隻眼睛一寬一窄（遠的那隻窄）→ 臉轉向窄的那邊，瞳孔一起往那邊偏；開口高度照寬的那隻（正側面照眼睛高）
    const turn = boxes.length === 2 && Math.abs(ws[0] - ws[1]) > .12 * Math.max(...ws) ? (ws[0] < ws[1] ? -1 : 1) : 0;
    const wRef = one ? Math.max(...boxes.map(b => (b[3] - b[1] + 1) * 1.25)) : Math.max(...ws);
    boxes.forEach((b, k) => { const out = boxes.length > 1 ? (k === 0 ? -1 : 1) : -fs || 1;
      if (boxes.length === 2 && EyeBig.far === 'hide' && ws[k] < .55 * Math.max(...ws)) return;   // 被山根擋住：遠眼整隻不畫
      paint(d, hm, W, H, b, out, turn, one, st, IR, wRef, vis, boxes.length === 2 && EyeBig.far === 'lash' && ws[k] < .55 * Math.max(...ws)); });
    return true;
  }
  // far：斜面遠的那隻被擠到鼻樑旁（寬度 < 近眼 55%）時 'hide'＝被山根擋住不畫（2026-11-05 使用者：側面眼睛應該被山根擋住、不是印上去）、'lash'＝只畫眼線睫毛、'full'＝整隻畫
  const EyeBig = { over, paint, SHAPE, far: 'full' };   // 第 7 版：臉前面改平，45 度遠眼看得到（使用者：遠眼在鼻樑旁、凹在眼窩裡）→ 整隻畫，被鼻樑擋住的照標記不畫
  window.EyeBig = EyeBig;
})();
