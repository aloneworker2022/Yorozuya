/**
 * test_jspace — Jspace 草皮車 2.5D 像素外觀 ↔ 透視駕駛座
 * 純 Canvas 點陣繪製，無外部圖檔。之後可升正式功能（勿綁 app.js）。
 * 內部解析 320×240，整數縮放 + pixelated。
 */
(function () {
  "use strict";

  const W = 320;
  const H = 240;

  /** @type {"exterior"|"cutaway"} */
  let view = "exterior";

  const canvas = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const btnExt = document.getElementById("btn-ext");
  const btnCut = document.getElementById("btn-cut");
  if (!canvas || !canvas.getContext) return;

  canvas.width = W;
  canvas.height = H;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  /* —— 有限調色盤（點陣感） —— */
  const C = {
    sky1: "#1a3a28",
    sky2: "#0e2418",
    sky3: "#163028",
    grass1: "#2d6b2a",
    grass2: "#245822",
    grass3: "#3a8a34",
    grass4: "#4a9a42",
    grassDk: "#1a4018",
    grassMid: "#2a6028",
    dirt: "#4a3a22",
    dirtLt: "#5a4a30",
    body: "#c8d4c0",
    bodyDk: "#8a9a82",
    bodyMd: "#a8b8a0",
    bodyLt: "#e8f0e0",
    accent: "#5a8f5e",
    accentDk: "#3a5f3e",
    accentLt: "#7ab87e",
    window: "#3a6a7a",
    windowLt: "#6ab0c0",
    windowDk: "#2a4a58",
    tire: "#1a1a1a",
    tireRim: "#6a6a6a",
    hub: "#9a9a9a",
    seat: "#4a3a2a",
    seatLt: "#6a5240",
    seatDk: "#2a2218",
    dash: "#2a2a2a",
    dashLt: "#4a4a4a",
    floor: "#3a3228",
    floorLt: "#4a4238",
    floorDk: "#2a2218",
    wall: "#d0d8c8",
    wallDk: "#a0a898",
    wallLt: "#e8f0e0",
    label: "#7dff9a",
    labelBg: "#0a180a",
    shadow: "#0a1408",
    metal: "#7a8a78",
    metalLt: "#a0b098",
    light: "#ffe8a0",
    lightDk: "#c8b060",
    bumper: "#5a5a52",
    bumperLt: "#7a7a70",
  };

  function setPixel(x, y, color) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, 1, 1);
  }

  function fillRect(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  /** 變化草皮：多層色、草叢、遠近 */
  function drawGrass() {
    fillRect(0, 0, W, H, C.sky2);
    // 天空漸層
    for (let y = 0; y < 84; y++) {
      const t = y / 84;
      let col = C.sky2;
      if (t < 0.35) col = C.sky1;
      else if (t < 0.7) col = C.sky3;
      fillRect(0, y, W, 1, col);
    }
    // 遠草帶
    fillRect(0, 84, W, H - 84, C.grass2);
    for (let y = 84; y < H; y++) {
      const depth = (y - 84) / (H - 84);
      for (let x = 0; x < W; x++) {
        const n = (x * 11 + y * 17 + ((x ^ y) << 1)) & 15;
        let col = C.grass2;
        if (n === 0 || n === 7) col = C.grassDk;
        else if (n === 2 || n === 11) col = C.grass3;
        else if (n === 4) col = C.grass1;
        else if (n === 9 && depth > 0.4) col = C.grass4;
        else if ((x + y * 2) % 9 === 0) col = C.grassMid;
        else if (depth < 0.25 && n === 5) col = C.grass1;
        setPixel(x, y, col);
      }
    }
    // 中景草叢斑塊
    for (let i = 0; i < 28; i++) {
      const bx = (i * 47 + 13) % W;
      const by = 96 + ((i * 31) % 60);
      const bw = 4 + (i % 5);
      const bh = 2 + (i % 3);
      fillRect(bx, by, bw, bh, i % 2 ? C.grass3 : C.grassDk);
    }
    // 前景草葉尖
    for (let x = 0; x < W; x += 2) {
      const h = 3 + ((x * 7) % 6);
      const tip = (x % 4 === 0) ? C.grass4 : C.grass3;
      fillRect(x, H - h, 1, h, tip);
      if ((x % 5) === 0) fillRect(x + 1, H - h - 1, 1, 2, C.grass1);
      if ((x % 8) === 0) fillRect(x - 1, H - h + 1, 1, 1, C.grassDk);
    }
  }

  /**
   * 2.5D／3/4 廂型車（右前感）— 高細節
   * 錨點約 (56, 76)
   */
  function drawExteriorVan() {
    // 地面陰影（橢圓感）
    ctx.globalAlpha = 0.5;
    fillRect(68, 186, 196, 12, C.shadow);
    fillRect(78, 184, 176, 4, C.shadow);
    fillRect(88, 196, 156, 4, C.shadow);
    ctx.globalAlpha = 1;

    // —— 車身側面主塊 ——
    fillRect(80, 104, 156, 72, C.body);
    // 側面明暗分帶
    fillRect(80, 104, 156, 8, C.bodyLt);
    fillRect(80, 168, 156, 8, C.bodyMd);
    fillRect(80, 104, 4, 72, C.bodyLt);
    fillRect(228, 104, 8, 72, C.bodyDk);

    // 頂部斜面（3/4 屋頂）
    fillRect(92, 84, 132, 22, C.bodyLt);
    fillRect(96, 80, 120, 6, C.body);
    // 屋頂→側折線
    fillRect(90, 102, 146, 4, C.bodyDk);
    // 右側「前臉」厚度（等距感）
    fillRect(236, 92, 28, 84, C.bodyDk);
    fillRect(236, 92, 28, 10, C.bodyMd);
    fillRect(236, 164, 28, 12, C.bodyMd);
    // 前臉與側身銜接斜邊
    for (let i = 0; i < 8; i++) {
      fillRect(236 + i, 100 + i, 1, 60 - i * 2, C.bodyMd);
    }

    // 下緣／裙邊
    fillRect(80, 172, 184, 4, C.accentDk);
    fillRect(82, 174, 180, 2, C.bumper);

    // 綠色腰線
    fillRect(84, 140, 148, 8, C.accent);
    fillRect(84, 140, 148, 2, C.accentLt);
    fillRect(236, 136, 24, 8, C.accentDk);
    fillRect(236, 136, 24, 2, C.accent);

    // —— 側窗（三塊） ——
    drawSideWindow(96, 110, 40, 24);
    drawSideWindow(146, 110, 40, 24);
    drawSideWindow(196, 110, 28, 24);
    // 窗框分隔
    fillRect(136, 110, 3, 24, C.bodyDk);
    fillRect(186, 110, 3, 24, C.bodyDk);

    // 前擋風（右側 3/4）
    fillRect(242, 100, 18, 30, C.window);
    fillRect(242, 100, 18, 30, C.window);
    fillRect(244, 102, 8, 10, C.windowLt);
    fillRect(250, 112, 6, 8, C.windowDk);
    fillRect(240, 98, 22, 3, C.bodyLt); // 雨刷區
    fillRect(244, 128, 14, 2, C.metal); // 雨刷

    // 頭燈＋保險桿
    fillRect(252, 144, 10, 8, C.light);
    fillRect(252, 144, 10, 2, C.lightDk);
    fillRect(254, 146, 4, 3, "#fff8d0");
    fillRect(250, 152, 14, 6, C.bumper);
    fillRect(250, 152, 14, 2, C.bumperLt);
    // 前保險桿橫條
    fillRect(236, 168, 28, 6, C.bumper);
    fillRect(238, 170, 24, 2, C.bumperLt);

    // 後保險桿（左側）
    fillRect(76, 168, 8, 8, C.bumper);
    fillRect(78, 148, 4, 6, "#c04040"); // 尾燈感

    // 輪拱＋輪胎（含輪轂）
    drawWheel(104, 172, 12);
    drawWheel(200, 172, 12);
    drawWheel(248, 168, 10); // 右側前輪略小

    // 側門縫＋把手
    fillRect(176, 106, 2, 64, C.bodyDk);
    fillRect(178, 136, 6, 4, C.metal);
    fillRect(179, 137, 4, 2, C.metalLt);

    // 車頂行李架
    fillRect(110, 74, 90, 8, C.metal);
    fillRect(112, 72, 86, 3, C.metalLt);
    fillRect(118, 70, 8, 4, C.accent); // 架腳
    fillRect(184, 70, 8, 4, C.accent);
    // 架上箱／太陽能板
    fillRect(128, 66, 36, 8, C.accentDk);
    fillRect(130, 68, 14, 3, C.accentLt);
    fillRect(148, 68, 12, 3, C.windowLt);

    // 側銘牌「Jspace」像素字
    fillRect(88, 150, 42, 12, C.accentDk);
    fillRect(90, 152, 38, 8, C.labelBg);
    drawPixelJspace(92, 153);

    // 草地壓痕／輪胎痕
    fillRect(96, 192, 40, 2, C.dirt);
    fillRect(100, 194, 32, 1, C.dirtLt);
    fillRect(188, 192, 36, 2, C.dirt);
    fillRect(240, 188, 24, 2, C.dirt);
  }

  function drawSideWindow(x, y, w, h) {
    fillRect(x, y, w, h, C.windowDk);
    fillRect(x + 2, y + 2, w - 4, h - 4, C.window);
    fillRect(x + 3, y + 3, Math.floor(w / 3), 6, C.windowLt);
    fillRect(x + w - 8, y + h - 10, 4, 6, C.windowDk);
  }

  /** 簡易像素「J」標＋小點當 space */
  function drawPixelJspace(x, y) {
    // J
    fillRect(x + 2, y, 4, 1, C.label);
    fillRect(x + 4, y, 1, 6, C.label);
    fillRect(x, y + 5, 5, 1, C.label);
    // s
    fillRect(x + 8, y + 1, 4, 1, C.label);
    fillRect(x + 8, y + 1, 1, 2, C.label);
    fillRect(x + 8, y + 3, 4, 1, C.label);
    fillRect(x + 11, y + 3, 1, 2, C.label);
    fillRect(x + 8, y + 5, 4, 1, C.label);
    // p
    fillRect(x + 14, y + 1, 1, 6, C.label);
    fillRect(x + 14, y + 1, 3, 1, C.label);
    fillRect(x + 16, y + 1, 1, 3, C.label);
    fillRect(x + 14, y + 3, 3, 1, C.label);
    // a
    fillRect(x + 19, y + 2, 3, 1, C.label);
    fillRect(x + 19, y + 2, 1, 4, C.label);
    fillRect(x + 21, y + 2, 1, 4, C.label);
    fillRect(x + 19, y + 4, 3, 1, C.label);
    // c
    fillRect(x + 24, y + 2, 3, 1, C.label);
    fillRect(x + 24, y + 2, 1, 4, C.label);
    fillRect(x + 24, y + 5, 3, 1, C.label);
    // e
    fillRect(x + 29, y + 2, 3, 1, C.label);
    fillRect(x + 29, y + 2, 1, 4, C.label);
    fillRect(x + 29, y + 3, 2, 1, C.label);
    fillRect(x + 29, y + 5, 3, 1, C.label);
  }

  function drawWheel(cx, cy, r) {
    // 輪拱陰影
    fillRect(cx - r - 2, cy - r - 2, r * 2 + 4, 4, C.bodyDk);
    // 輪胎外圈
    fillRect(cx - r, cy - r + 2, r * 2, r * 2 - 3, C.tire);
    fillRect(cx - r + 1, cy - r, r * 2 - 2, r * 2, C.tire);
    fillRect(cx - r + 2, cy - r - 1, r * 2 - 4, 1, C.tire);
    // 胎紋
    fillRect(cx - r + 1, cy - 1, 2, 2, C.tireRim);
    fillRect(cx + r - 3, cy - 1, 2, 2, C.tireRim);
    // 輪轂
    fillRect(cx - 4, cy - 4, 8, 8, C.tireRim);
    fillRect(cx - 3, cy - 3, 6, 6, C.hub);
    fillRect(cx - 1, cy - 1, 2, 2, C.metalLt);
    // 輪輻
    fillRect(cx - 3, cy, 6, 1, C.tireRim);
    fillRect(cx, cy - 3, 1, 6, C.tireRim);
  }

  /**
   * 透視剖視：左側駕駛座，右側後艙空 — 更高解析 2.5D
   */
  function drawCutaway() {
    // 外殼剖面框
    fillRect(28, 40, 264, 160, C.wallDk);
    fillRect(36, 48, 248, 144, C.wall);
    // 內壁亮邊
    fillRect(36, 48, 248, 4, C.wallLt);
    fillRect(36, 48, 4, 144, C.wallLt);

    // —— 地板（透視：近寬遠窄感用水平線＋匯聚） ——
    fillRect(40, 152, 240, 36, C.floor);
    fillRect(40, 152, 240, 4, C.floorDk);
    // 透視地磚線（往後艙收斂）
    for (let i = 0; i < 8; i++) {
      const y = 156 + i * 4;
      fillRect(44, y, 232 - i * 2, 1, C.floorLt);
    }
    for (let i = 0; i < 12; i++) {
      const x0 = 48 + i * 18;
      // 斜透視線往右後收
      for (let t = 0; t < 32; t++) {
        const x = x0 + Math.floor(t * 0.35);
        const y = 156 + t;
        if (y < 188) setPixel(x, y, C.floorDk);
      }
    }

    // 分隔牆：駕駛艙 | 後艙
    fillRect(140, 52, 6, 100, C.wallDk);
    fillRect(142, 52, 2, 100, C.bodyDk);
    fillRect(140, 52, 6, 4, C.accent);

    // —— 駕駛座區（左） ——
    // 左側牆
    fillRect(40, 52, 6, 100, C.wallDk);
    // 擋風／側窗
    fillRect(48, 52, 88, 28, C.windowDk);
    fillRect(52, 56, 80, 20, C.window);
    fillRect(56, 58, 24, 8, C.windowLt);
    fillRect(100, 64, 20, 10, C.windowDk);
    // 儀表台（有厚度）
    fillRect(50, 88, 86, 28, C.dash);
    fillRect(52, 90, 82, 6, C.dashLt);
    fillRect(54, 98, 28, 12, C.dashLt); // 儀表區
    fillRect(58, 100, 10, 6, C.windowLt);
    fillRect(72, 100, 6, 6, C.accent);
    fillRect(82, 102, 14, 4, C.metal);
    // 方向盤柱
    fillRect(100, 100, 10, 16, C.metal);
    fillRect(102, 98, 6, 4, C.metalLt);
    // 方向盤（圓環感）
    fillRect(94, 78, 22, 4, C.tire);
    fillRect(94, 102, 22, 4, C.tire);
    fillRect(94, 78, 4, 28, C.tire);
    fillRect(112, 78, 4, 28, C.tire);
    fillRect(100, 88, 10, 10, C.tireRim);
    fillRect(103, 91, 4, 4, C.hub);
    // 方向盤輻
    fillRect(98, 92, 14, 2, C.tire);
    fillRect(104, 84, 2, 18, C.tire);

    // 駕駛座（有厚度／靠背）
    fillRect(64, 118, 48, 14, C.seatLt); // 坐墊
    fillRect(66, 116, 44, 4, C.seat);
    fillRect(68, 90, 40, 30, C.seat); // 靠背
    fillRect(72, 94, 32, 20, C.seatLt);
    fillRect(74, 96, 28, 4, C.seatDk); // 頭枕區
    fillRect(78, 86, 20, 8, C.seatDk); // 頭枕
    fillRect(72, 132, 8, 16, C.seat); // 腳柱
    fillRect(96, 132, 8, 16, C.seat);
    fillRect(70, 146, 36, 4, C.seatDk); // 底座

    drawLabel(52, 178, "駕駛座");

    // —— 後艙（空，有深度） ——
    fillRect(150, 56, 130, 96, C.bodyLt);
    // 後壁（遠）
    fillRect(250, 60, 26, 80, C.wallDk);
    fillRect(252, 62, 20, 20, C.window); // 後窗
    fillRect(254, 64, 8, 8, C.windowLt);
    // 右側內壁
    fillRect(150, 56, 4, 96, C.wall);
    // 頂板透視線
    for (let i = 0; i < 6; i++) {
      const y = 60 + i * 3;
      fillRect(154, y, 96 - i * 4, 1, C.wallDk);
    }
    // 側壁縱線（深度）
    for (let i = 0; i < 8; i++) {
      const x = 160 + i * 12;
      fillRect(x, 64, 1, 80 - i * 2, C.wallDk);
    }
    // 地板延伸到後艙
    fillRect(150, 140, 126, 12, C.floor);
    for (let i = 0; i < 5; i++) {
      fillRect(154 + i * 2, 142 + i * 2, 110 - i * 8, 1, C.floorLt);
    }
    // 空艙暗示：地板中央標線
    fillRect(180, 148, 60, 1, C.accentDk);

    drawLabel(168, 110, "後艙（空）");

    // 外殼切面提示（鋸齒）
    fillRect(28, 40, 264, 4, C.accent);
    fillRect(28, 196, 264, 4, C.accentDk);
    for (let x = 28; x < 292; x += 8) {
      fillRect(x, 36, 4, 4, C.accent);
      fillRect(x + 4, 200, 4, 4, C.accentDk);
    }
  }

  function drawLabel(x, y, text) {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const pad = 3;
    ctx.font = "bold 12px monospace";
    const tw = Math.ceil(ctx.measureText(text).width);
    fillRect(x - pad, y - 10, tw + pad * 2, 14, C.labelBg);
    ctx.fillStyle = C.label;
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y - 8);
    ctx.restore();
  }

  function drawFrame() {
    drawGrass();
    if (view === "exterior") drawExteriorVan();
    else drawCutaway();
  }

  function setView(next) {
    view = next;
    btnExt && btnExt.classList.toggle("on", view === "exterior");
    btnCut && btnCut.classList.toggle("on", view === "cutaway");
    if (hint) {
      hint.textContent =
        view === "exterior"
          ? "點擊車輛進入透視內部 · 駕駛座／後艙（空）"
          : "透視中 · 僅駕駛座；後艙留空給之後家具 · 按「外觀」返回";
    }
    drawFrame();
  }

  function fitCanvas() {
    const maxW = Math.min(window.innerWidth - 24, 720);
    const maxH = Math.min(window.innerHeight * 0.55, 540);
    let scale = Math.floor(Math.min(maxW / W, maxH / H));
    if (scale < 1) scale = 1;
    if (scale > 3) scale = 3;
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
  }

  /** 點擊是否落在車體大致範圍（外觀模式） */
  function hitVan(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (W / rect.width);
    const sy = (clientY - rect.top) * (H / rect.height);
    return sx >= 72 && sx <= 272 && sy >= 66 && sy <= 198;
  }

  btnExt &&
    btnExt.addEventListener("click", function () {
      setView("exterior");
    });
  btnCut &&
    btnCut.addEventListener("click", function () {
      setView("cutaway");
    });

  canvas.addEventListener("click", function (e) {
    if (view === "exterior") {
      if (hitVan(e.clientX, e.clientY)) setView("cutaway");
    } else {
      setView("exterior");
    }
  });

  window.addEventListener("resize", function () {
    fitCanvas();
    drawFrame();
  });

  fitCanvas();
  setView("exterior");
})();
