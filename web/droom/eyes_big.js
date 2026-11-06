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
    // 2026-11-06 第 3 種畫法（使用者給第 3 組參考圖：眼睛不好看，用這個眼睛眉毛）：
    //   粗上眼線、外眼角一塊實心三角＋三根粗睫毛往外翹、內眼角往下一小尖；大圓瞳孔碰到上下眼皮（上面一段眼皮陰影、深外圈、大瞳仁、一個大亮點）；
    //   下眼皮外側一段粗短線（跟上眼線分開）、內側細淡；雙眼皮摺線貼近眼睛。
    const base = u => cyc + S.tilt * R * u;
    const sk = u => u < S.pk ? .5 * u / S.pk : .5 + .5 * (u - S.pk) / (1 - S.pk);
    const top = u => base(u) - O * .6 * Math.pow(Math.max(0, Math.sin(Math.PI * sk(u))), .6);
    const bot = u => base(u) + O * .4 * Math.pow(Math.max(0, Math.sin(Math.PI * (u < .5 ? .5 * u / .5 : .5 + .5 * (u - .5) / .5))), .8);
    const um = .5, ri = O * .6, icx = X(um) + turn * .1 * w, icy = (top(um) + bot(um)) / 2 + O * .02, irx = ri * .92 * Math.min(1, .45 + .55 * w / R);
    // 1) 眼白＋瞳孔
    if (!lashOnly) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      const u = U(x), yt = top(u), yb = bot(u);
      for (let y = Math.ceil(yt); y <= Math.floor(yb); y++) {
        const ex = (x - icx) / irx, ey = (y - icy) / ri, r = Math.hypot(ex, ey);
        if (r <= 1) {
          let c = r > .86 ? IR[0].map(q => q * .7) : y - yt < O * .3 ? IR[0] : ey < .25 ? IR[1] : IR[2];
          if (r < .42) c = [20, 16, 22];   // 大瞳仁
          put(x, y, c);
        } else put(x, y, u < .04 ? CARU : y - yt < Math.max(1.5, O * .16) ? SCL_SH : SCL);
      }
    }
    // 亮點：上面一個大圓（光從左上）＋右下一小點
    { const hx = icx - irx * .28, hy = icy - ri * .32, hrx = Math.max(2, irx * .3), hry = Math.max(2, ri * .26); for (let y = hy - hry; y <= hy + hry; y++) for (let x = hx - hrx; x <= hx + hrx; x++) if (((x - hx) / hrx) ** 2 + ((y - hy) / hry) ** 2 <= 1 && y > top(U(x)) + 1) put(x, y, WHITE);
      put(icx + irx * .35, icy + ri * .35, WHITE); put(icx + irx * .35 + 1, icy + ri * .35, WHITE, .7); }
    }
    // 2) 雙眼皮摺線：貼近眼睛的一條細線
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) { const u = U(x); if (u < .22 || u > 1) continue; const y = top(u) - O * (.16 + .1 * Math.sin(Math.PI * u)); const k = sstep(.22, .4, u); put(x, y, LINE2, .75 * k); }
    // 眼窩陰影（第 9 版起真的凹陷已經有陰影，這裡只淡淡補一點）
    free = true;
    for (let x = Math.min(x0, x1) - Math.round(w * .06); x <= Math.max(x0, x1) + Math.round(w * .04); x++) { const u = Math.min(1.05, Math.max(-.05, U(x))), yt = top(Math.min(1, Math.max(0, u))), H1 = O * 1.05, kk = .2 * (1 - .45 * Math.max(0, u - .3) / .75) * Math.min(1, (u + .1) / .25);
      for (let y = Math.floor(yt - H1); y < yt; y++) { const q = (y - (yt - H1)) / H1; put(x, y, SOCK, kk * q * q); } }
    free = false;
    // 3) 上眼線：粗，往外越粗
    for (let x = Math.min(x0, x1) - 1; x <= Math.max(x0, x1) + 1; x++) {
      const u = Math.min(1, Math.max(0, U(x))), t = R * (.03 + .07 * sstep(.05, .85, u)), yt = top(u);
      for (let y = yt - t * .8; y <= yt + t * .25; y++) put(x, y, LINE);
    }
    // 外眼角：實心三角（上眼線往下包到下眼皮）＋三根粗睫毛往外翹
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
    bs.forEach(([a, b], k) => { const inner = bs.length > 1 ? (k === 0 ? 1 : -1) : fs || 1, xa = f * FW + (inner > 0 ? b : a), w = b - a + 1, R = Math.max(w, Wmax * .6);
      const yc = (yOf[a] + yOf[b] + 2 * yOf[(a + b) >> 1]) / 4;
      for (let i = 0; i <= w * 2; i++) { const t = i / (w * 2), x = xa - inner * t * (w - 1);
        const yy = yc + R * (-S[0] * Math.sin(Math.PI * Math.min(1, t * 1.15)) + S[1] * (1 - t) * .5 + .06 * Math.max(0, t - .7) / .3);
        const th = R * .16 * S[2] * (t < .3 ? .75 + .25 * t / .3 : Math.max(.12, 1 - (t - .3) / .7));
        for (let y = yy - th / 2; y <= yy + th / 2; y++) put(x, y, (y > yy + th * .25) ? C2 : C); } });
    return true;
  }
  // far：斜面遠的那隻被擠到鼻樑旁（寬度 < 近眼 55%）時 'hide'＝被山根擋住不畫（2026-11-05 使用者：側面眼睛應該被山根擋住、不是印上去）、'lash'＝只畫眼線睫毛、'full'＝整隻畫
  const EyeBig = { over, paint, SHAPE, far: 'full', browOver };   // 第 7 版：臉前面改平，45 度遠眼看得到（使用者：遠眼在鼻樑旁、凹在眼窩裡）→ 整隻畫，被鼻樑擋住的照標記不畫
  window.EyeBig = EyeBig;
})();
