/**
 * test_jspace — Jspace 草皮車 2.5D 像素外觀 ↔ 透視駕駛座
 * 純 Canvas 點陣繪製，無外部圖檔。之後可升正式功能（勿綁 app.js）。
 */
(function () {
  "use strict";

  const W = 160;
  const H = 120;

  /** @type {"exterior"|"cutaway"} */
  let view = "exterior";

  const canvas = document.getElementById("stage");
  const hint = document.getElementById("hint");
  const btnExt = document.getElementById("btn-ext");
  const btnCut = document.getElementById("btn-cut");
  if (!canvas || !canvas.getContext) return;

  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;

  /* —— 有限調色盤（點陣感） —— */
  const C = {
    sky1: "#1a3a28",
    sky2: "#0e2418",
    grass1: "#2d6b2a",
    grass2: "#245822",
    grass3: "#3a8a34",
    grassDk: "#1a4018",
    dirt: "#4a3a22",
    body: "#c8d4c0",
    bodyDk: "#8a9a82",
    bodyLt: "#e8f0e0",
    accent: "#5a8f5e",
    accentDk: "#3a5f3e",
    window: "#3a6a7a",
    windowLt: "#6ab0c0",
    tire: "#1a1a1a",
    tireRim: "#6a6a6a",
    seat: "#4a3a2a",
    seatLt: "#6a5240",
    dash: "#2a2a2a",
    dashLt: "#4a4a4a",
    floor: "#3a3228",
    floorLt: "#4a4238",
    wall: "#d0d8c8",
    wallDk: "#a0a898",
    label: "#7dff9a",
    labelBg: "#0a180a",
    shadow: "#0a1408",
    metal: "#7a8a78",
    light: "#ffe8a0",
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

  /** 水平掃描線草皮紋 */
  function drawGrass() {
    fillRect(0, 0, W, H, C.sky2);
    // 天空漸層條
    for (let y = 0; y < 42; y++) {
      const t = y / 42;
      fillRect(0, y, W, 1, t < 0.5 ? C.sky1 : C.sky2);
    }
    // 遠草地
    fillRect(0, 42, W, H - 42, C.grass2);
    for (let y = 42; y < H; y++) {
      const row = (y - 42) % 4;
      const col = row === 0 ? C.grass1 : row === 2 ? C.grass3 : C.grass2;
      for (let x = 0; x < W; x++) {
        const n = (x * 7 + y * 13) & 7;
        if (n === 0) setPixel(x, y, C.grassDk);
        else if (n === 3) setPixel(x, y, C.grass3);
        else if ((x + y) % 5 === 0) setPixel(x, y, col);
      }
    }
    // 前景草葉尖
    for (let x = 0; x < W; x += 3) {
      const h = 2 + ((x * 5) % 4);
      fillRect(x, H - h, 1, h, C.grass3);
      if ((x % 6) === 0) fillRect(x + 1, H - h - 1, 1, 1, C.grass1);
    }
  }

  /**
   * 2.5D／略等距廂型車（右前 3/4 感）
   * 車體錨點：左上約 (28, 38)
   */
  function drawExteriorVan() {
    // 陰影
    ctx.fillStyle = C.shadow;
    ctx.globalAlpha = 0.45;
    fillRect(34, 92, 98, 8, C.shadow);
    ctx.globalAlpha = 1;

    // —— 車身主塊（側面） ——
    fillRect(40, 52, 78, 36, C.body);
    // 頂部斜面（略 3/4）
    fillRect(46, 44, 66, 10, C.bodyLt);
    // 右側「前臉」厚度
    fillRect(118, 48, 14, 40, C.bodyDk);
    // 頂→側折線
    fillRect(46, 52, 72, 2, C.bodyDk);
    // 下緣
    fillRect(40, 86, 92, 2, C.accentDk);

    // 綠色腰線
    fillRect(42, 70, 74, 4, C.accent);
    fillRect(118, 68, 12, 4, C.accentDk);

    // 車窗（側）
    fillRect(48, 56, 22, 12, C.window);
    fillRect(74, 56, 22, 12, C.window);
    fillRect(100, 56, 14, 12, C.window);
    // 高光
    fillRect(50, 57, 6, 3, C.windowLt);
    fillRect(76, 57, 6, 3, C.windowLt);

    // 前擋（右側）
    fillRect(120, 52, 10, 14, C.window);
    fillRect(121, 53, 4, 4, C.windowLt);

    // 頭燈
    fillRect(126, 72, 5, 4, C.light);
    fillRect(126, 76, 5, 2, C.bodyDk);

    // 輪拱＋輪胎
    drawWheel(52, 84);
    drawWheel(108, 84);
    // 右側前輪略偏
    drawWheel(122, 82, true);

    // 側門縫
    fillRect(88, 54, 1, 32, C.bodyDk);
    // 把手
    fillRect(90, 68, 3, 2, C.metal);

    // 車頂行李／太陽能感小塊
    fillRect(58, 40, 40, 4, C.metal);
    fillRect(60, 38, 12, 2, C.accent);

    // 銘牌 J
    fillRect(44, 74, 8, 8, C.accentDk);
    fillRect(46, 76, 4, 1, C.label);
    fillRect(48, 76, 1, 4, C.label);
    fillRect(46, 79, 3, 1, C.label);

    // 草地壓痕
    fillRect(48, 94, 20, 1, C.dirt);
    fillRect(100, 94, 18, 1, C.dirt);
  }

  function drawWheel(cx, cy, small) {
    const r = small ? 5 : 6;
    fillRect(cx - r, cy - r + 1, r * 2, r * 2 - 1, C.tire);
    fillRect(cx - r + 1, cy - r, r * 2 - 2, r * 2, C.tire);
    fillRect(cx - 2, cy - 2, 4, 4, C.tireRim);
    fillRect(cx - 1, cy - 1, 2, 2, C.metal);
  }

  /**
   * 透視／剖視：左側駕駛座，右側後艙空
   */
  function drawCutaway() {
    // 車殼外框（剖面）
    fillRect(18, 28, 124, 72, C.wallDk);
    fillRect(22, 32, 116, 64, C.wall);

    // 地板
    fillRect(24, 78, 112, 16, C.floor);
    for (let x = 24; x < 136; x += 8) {
      fillRect(x, 78, 1, 16, C.floorLt);
    }

    // 分隔：駕駛艙 | 後艙
    fillRect(70, 34, 3, 44, C.wallDk);
    fillRect(71, 34, 1, 44, C.bodyDk);

    // —— 駕駛座區（左） ——
    // 儀表台
    fillRect(26, 48, 42, 14, C.dash);
    fillRect(28, 50, 16, 8, C.dashLt);
    fillRect(30, 52, 6, 3, C.windowLt); // 儀表亮
    fillRect(48, 52, 8, 4, C.metal); // 方向盤柱
    // 方向盤
    fillRect(50, 44, 12, 2, C.tire);
    fillRect(50, 54, 12, 2, C.tire);
    fillRect(50, 44, 2, 12, C.tire);
    fillRect(60, 44, 2, 12, C.tire);
    fillRect(54, 48, 4, 4, C.tireRim);

    // 座椅
    fillRect(36, 62, 22, 6, C.seatLt); // 坐墊
    fillRect(38, 50, 18, 14, C.seat); // 靠背
    fillRect(40, 52, 14, 8, C.seatLt);
    fillRect(42, 68, 4, 8, C.seat); // 腳柱
    fillRect(50, 68, 4, 8, C.seat);

    // 車窗（左前）
    fillRect(26, 34, 40, 12, C.window);
    fillRect(28, 35, 10, 4, C.windowLt);

    // 標籤「駕駛座」
    drawLabel(28, 84, "駕駛座");

    // —— 後艙（空） ——
    fillRect(76, 36, 58, 40, C.bodyLt);
    // 空洞感：淡格線
    for (let y = 40; y < 72; y += 6) {
      fillRect(80, y, 50, 1, C.wallDk);
    }
    for (let x = 80; x < 130; x += 8) {
      fillRect(x, 40, 1, 32, C.wallDk);
    }
    // 後窗
    fillRect(118, 38, 14, 18, C.window);
    fillRect(120, 40, 5, 5, C.windowLt);

    drawLabel(82, 58, "後艙（空）");

    // 外殼切面提示線
    fillRect(18, 28, 124, 2, C.accent);
    fillRect(18, 98, 124, 2, C.accentDk);
    // 剖面鋸齒感
    for (let x = 18; x < 142; x += 4) {
      fillRect(x, 26, 2, 2, C.accent);
      fillRect(x + 2, 100, 2, 2, C.accentDk);
    }
  }

  function drawLabel(x, y, text) {
    // 像素字用填色底 + 系統字（整數縮放後仍清晰）
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    const pad = 2;
    ctx.font = "bold 8px monospace";
    const tw = Math.ceil(ctx.measureText(text).width);
    fillRect(x - pad, y - 7, tw + pad * 2, 10, C.labelBg);
    ctx.fillStyle = C.label;
    ctx.textBaseline = "top";
    ctx.fillText(text, x, y - 6);
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
    const maxW = Math.min(window.innerWidth - 24, 640);
    const maxH = Math.min(window.innerHeight * 0.55, 480);
    let scale = Math.floor(Math.min(maxW / W, maxH / H));
    if (scale < 2) scale = 2;
    if (scale > 5) scale = 5;
    canvas.style.width = W * scale + "px";
    canvas.style.height = H * scale + "px";
  }

  /** 點擊是否落在車體大致範圍（外觀模式） */
  function hitVan(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (W / rect.width);
    const sy = (clientY - rect.top) * (H / rect.height);
    return sx >= 38 && sx <= 136 && sy >= 38 && sy <= 96;
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
