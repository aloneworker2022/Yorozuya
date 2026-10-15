/* 日租女友・旅館玄關（2026-10-15）：開車送到旅館後，玩家直接站在玄關，自己決定進不進去。
 * 三種玄關（rental.js VENUES／venueOf）：
 *   ryokan 日式拉門（溫泉旅館）：木框玄關、上框、石地、兩雙鞋；拉門紙後亮著燈、映著兩個人影。
 *   hotel  旅館房門：昏暗走廊、地毯、房號牌、「使用中」紅燈、門縫透光、刷卡鎖綠燈。
 *   motel  汽車旅館：車庫（鐵捲門拉一半、你的車停著）、日光燈、樓梯上去就是房門。
 * 畫面跟偷看同一套尺寸（195×422 邏輯像素、放大顯示）。不決定結果，只回報玩家選了什麼。
 * openEntry({ venue, room, stayZh, clientName, onChoose(presence 'in'|'door') }) → { close() }。 */
import { paintRyokan } from "./rental_entry_paint.js?v=2";
import { paintJapaneseRoom } from "./rental_room_paint.js?v=1";
const LW = 195, LH = 422;

const CSS = `
.rent-entry{position:fixed;inset:0;z-index:9000;background:#120e16;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.rent-entry .box{position:relative;height:100%;max-height:100dvh;aspect-ratio:195/422;max-width:100vw}
.rent-entry canvas{width:100%;height:100%;image-rendering:pixelated;display:block}
.rent-entry .t{position:absolute;left:0;right:0;text-align:center;font:600 15px/1.35 "Fusion Pixel",system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 0 #000;padding:0 14px}
.rent-entry .ti{top:4.5%;color:#e8b4cf}.rent-entry .st{top:10%;color:#e6c79a;font-size:13px}
.rent-entry .ch{position:absolute;left:7%;right:7%;bottom:3.5%;display:flex;flex-direction:column;gap:8px}
.rent-entry .ch button{display:flex;flex-direction:column;align-items:center;gap:1px;padding:9px 10px;border-radius:10px;border:1px solid #6a4a5c;background:rgba(28,18,30,.9);color:#f2dbe6;font:600 15px/1.3 system-ui,sans-serif;cursor:pointer;box-shadow:none;text-shadow:none}
.rent-entry .ch button.main{background:rgba(120,40,78,.92);border-color:#d0709c}
.rent-entry .ch small{font-weight:400;font-size:12px;color:#d8b9c8}`;

const R = (g, c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x, y, w, h); };

// ------------------------------------------------------------ 日式拉門（溫泉旅館）
function drawRyokan(g, t, room) {
  R(g, "#1e1510", 0, 0, LW, LH);
  R(g, "#2a1d15", 0, 60, LW, 260);                                     // 牆
  R(g, "#3a281b", 0, 64, LW, 12); R(g, "#4b3424", 0, 64, LW, 2);         // 橫樑
  for (const x of [12, 176]) { R(g, "#3a281b", x, 76, 8, 236); R(g, "#4b3424", x, 76, 2, 236); }   // 柱
  // 拉門：紙後亮燈（慢慢呼吸）
  const glow = 0.92 + 0.08 * Math.sin(t / 900);
  const paper = `rgb(${Math.round(222 * glow)},${Math.round(196 * glow)},${Math.round(142 * glow)})`;
  R(g, "#3f2c1e", 26, 96, 144, 206);
  R(g, paper, 30, 100, 66, 198); R(g, paper, 100, 100, 66, 198);
  // 映在紙上的兩個人影（她在前、客人在後；跟著燈影輕輕晃）
  const sx = Math.sin(t / 1300) * 1.5;
  g.fillStyle = "rgba(120,86,58,.42)";
  g.beginPath(); g.ellipse(108 + sx, 168, 9, 11, 0, 0, 7); g.fill();            // 她的頭
  g.beginPath(); g.ellipse(110 + sx, 200, 15, 22, 0, 0, 7); g.fill();           // 她的肩
  g.fillStyle = "rgba(96,66,44,.46)";
  g.beginPath(); g.ellipse(128 - sx * .6, 158, 10, 12, 0, 0, 7); g.fill();      // 他的頭
  g.beginPath(); g.ellipse(132 - sx * .6, 196, 20, 28, 0, 0, 7); g.fill();      // 他的肩
  // 格子
  g.fillStyle = "#5a402c";
  for (const x0 of [30, 100]) {
    for (let x = x0 + 16; x < x0 + 66; x += 17) R(g, "#5a402c", x, 100, 2, 198);
    for (let y = 122; y < 298; y += 22) R(g, "#5a402c", x0, y, 66, 2);
  }
  R(g, "#3f2c1e", 96, 96, 4, 206);                                        // 兩扇門的接縫
  R(g, "#2a1d15", 30, 96, 66, 4); R(g, "#2a1d15", 100, 96, 66, 4);
  R(g, "#c9a65a", 92, 196, 2, 10); R(g, "#c9a65a", 102, 196, 2, 10);      // 把手凹槽
  // 掛著的木牌（房名）
  R(g, "#6b4a32", 82, 80, 32, 12); R(g, "#8a6244", 82, 80, 32, 2);
  g.fillStyle = "#f0dcb8"; g.font = "8px sans-serif"; g.textAlign = "center"; g.fillText(room, 98, 90);
  // 上框（架高的木頭地板邊）
  R(g, "#6b4a32", 0, 302, LW, 10); R(g, "#8a6244", 0, 302, LW, 2); R(g, "#3e2b1d", 0, 312, LW, 4);
  // 石地（土間）
  R(g, "#3a3632", 0, 316, LW, 106);
  g.fillStyle = "#45403b";
  for (let y = 322; y < 420; y += 14) for (let x = (y / 14) % 2 ? 0 : 12; x < LW; x += 26) R(g, "#45403b", x, y, 22, 10);
  // 兩雙鞋：她的高跟鞋（擺得整齊）、他的皮鞋（隨便脫）
  R(g, "#9c3346", 70, 330, 12, 5); R(g, "#9c3346", 84, 331, 12, 5); R(g, "#7a2234", 80, 333, 2, 5); R(g, "#7a2234", 94, 334, 2, 5);
  R(g, "#c0566a", 70, 330, 4, 1); R(g, "#c0566a", 84, 331, 4, 1);
  R(g, "#1b1a1d", 110, 334, 18, 7); R(g, "#1b1a1d", 128, 338, 17, 7); R(g, "#3a383e", 110, 334, 6, 1); R(g, "#3a383e", 128, 338, 6, 1);
  // 燈籠（左上，暖光）
  const lf = 0.85 + 0.15 * Math.sin(t / 370) * Math.sin(t / 530);
  g.fillStyle = `rgba(240,170,90,${0.18 * lf})`; g.beginPath(); g.arc(4, 86, 26, 0, 7); g.fill();
  R(g, "#e8a85a", 0, 78, 6, 16); R(g, "#7a4a2a", 0, 76, 6, 2); R(g, "#7a4a2a", 0, 94, 6, 2);
}

// ------------------------------------------------------------ 旅館房門（走廊）
function drawHotel(g, t, room) {
  R(g, "#150f19", 0, 0, LW, LH);
  R(g, "#241a2e", 0, 56, LW, 270);                                     // 牆
  for (let x = 4; x < LW; x += 12) R(g, "#2b2036", x, 56, 4, 270);       // 壁紙直紋
  R(g, "#1a1220", 0, 56, LW, 8);                                       // 天花板邊
  R(g, "#3a2a3e", 0, 318, LW, 6);                                      // 踢腳板
  // 地毯（花紋）
  R(g, "#3a1f33", 0, 324, LW, 98);
  for (let y = 330; y < LH; y += 16) for (let x = (y / 16) % 2 ? 0 : 10; x < LW; x += 20) { R(g, "#4a2840", x + 4, y, 8, 2); R(g, "#4a2840", x + 7, y - 3, 2, 8); }
  // 頂燈光錐
  g.fillStyle = "rgba(255,214,160,.07)";
  g.beginPath(); g.moveTo(84, 64); g.lineTo(111, 64); g.lineTo(150, 324); g.lineTo(45, 324); g.fill();
  R(g, "#ffd9a0", 90, 62, 15, 3);
  // 門
  R(g, "#1d1218", 54, 116, 88, 206);                                   // 門框
  R(g, "#5a3646", 58, 120, 80, 200);
  R(g, "#6a4254", 64, 128, 68, 80); R(g, "#6a4254", 64, 218, 68, 94);  // 門板凹框
  R(g, "#4e2e3c", 66, 130, 64, 76); R(g, "#4e2e3c", 66, 220, 64, 90);
  // 門縫透光（房裡亮著）
  const fl = 0.75 + 0.25 * Math.sin(t / 700);
  R(g, `rgba(255,190,130,${0.55 * fl})`, 58, 318, 80, 2);
  g.fillStyle = `rgba(255,190,130,${0.12 * fl})`; g.beginPath(); g.moveTo(58, 320); g.lineTo(138, 320); g.lineTo(150, 340); g.lineTo(46, 340); g.fill();
  // 把手＋刷卡鎖（綠燈＝剛刷過）
  R(g, "#c9a24a", 124, 222, 10, 3); R(g, "#8a6a2a", 124, 225, 10, 1);
  R(g, "#2a2a30", 126, 200, 7, 16); R(g, Math.floor(t / 600) % 2 ? "#3cf08a" : "#1c8a4c", 128, 203, 3, 2);
  // 請勿打擾牌
  R(g, "#d0506e", 120, 228, 10, 20); R(g, "#f0d0da", 122, 234, 6, 1); R(g, "#f0d0da", 122, 238, 6, 1);
  // 房號牌＋「使用中」燈
  R(g, "#c9a24a", 80, 98, 36, 14); R(g, "#2a1a22", 82, 100, 32, 10);
  g.fillStyle = "#f0d8a0"; g.font = "bold 9px sans-serif"; g.textAlign = "center"; g.fillText(room, 98, 108);
  const on = Math.floor(t / 900) % 4 !== 3;
  R(g, "#2a1a22", 148, 140, 22, 30); R(g, on ? "#ff4a64" : "#7a2434", 151, 143, 16, 10);
  if (on) { g.fillStyle = "rgba(255,74,100,.18)"; g.beginPath(); g.arc(159, 148, 14, 0, 7); g.fill(); }
  g.fillStyle = "#f0c0c8"; g.font = "6px sans-serif"; g.fillText("使用中", 159, 165);
  // 走廊兩側遠處的門（透視）
  R(g, "#1d1218", 2, 130, 14, 186); R(g, "#3a2430", 4, 134, 10, 180);
  R(g, "#1d1218", 179, 130, 14, 186); R(g, "#3a2430", 181, 134, 10, 180);
}

// ------------------------------------------------------------ 汽車旅館（車庫＋樓梯）
function drawMotel(g, t, room) {
  R(g, "#121216", 0, 0, LW, LH);
  R(g, "#2c2a2f", 0, 56, LW, 290);                                     // 牆（水泥）
  for (let i = 0; i < 40; i++) { const x = (i * 53) % LW, y = 60 + (i * 97) % 280; R(g, "#333137", x, y, 2, 1); }
  R(g, "#1e1d22", 0, 56, LW, 10);                                      // 天花板
  // 日光燈（偶爾閃一下）
  const blink = (Math.floor(t / 120) % 37) === 0;
  R(g, blink ? "#8a9aa0" : "#e8f4f6", 30, 70, 50, 3);
  if (!blink) { g.fillStyle = "rgba(220,240,245,.06)"; g.beginPath(); g.moveTo(30, 73); g.lineTo(80, 73); g.lineTo(120, 346); g.lineTo(-10, 346); g.fill(); }
  // 鐵捲門（左邊，拉下一半；外面是夜色）
  R(g, "#0e1426", 0, 80, 22, 266);
  R(g, "#5a5c64", 0, 80, 22, 150);
  for (let y = 84; y < 230; y += 6) R(g, "#46484f", 0, y, 22, 2);
  R(g, "#2e3038", 0, 228, 22, 4);
  // 地板
  R(g, "#26252a", 0, 346, LW, 76); R(g, "#d8c040", 8, 384, 110, 2);   // 停車線
  // 車（你的車，停在車庫左半邊，車尾朝你）
  R(g, "#1b2433", 14, 276, 98, 64); R(g, "#26324a", 18, 280, 90, 24);   // 車身＋後窗
  R(g, "#3a4a66", 22, 283, 82, 4);                                     // 後窗反光
  R(g, "#1b2433", 26, 262, 74, 18); R(g, "#2c3a54", 30, 266, 66, 12);  // 車頂
  const brake = 0.6 + 0.4 * Math.sin(t / 1500);
  R(g, `rgba(220,40,50,${brake})`, 16, 308, 14, 6); R(g, `rgba(220,40,50,${brake})`, 96, 308, 14, 6);   // 尾燈
  R(g, "#c8c8d0", 52, 318, 22, 7); R(g, "#2a2a30", 54, 320, 18, 3);    // 車牌
  R(g, "#0c0c10", 20, 340, 18, 8); R(g, "#0c0c10", 88, 340, 18, 8);    // 輪胎
  // 樓梯（右邊，往後上去；一階一階）
  const steps = 11;
  for (let i = 0; i < steps; i++) {
    const x = 120 + i * 5, y = 340 - i * 20;
    R(g, "#4a4650", x, y, 75 - i * 5, 6); R(g, "#5c5864", x, y, 75 - i * 5, 1);   // 踏面
    R(g, "#38353d", x, y + 6, 75 - i * 5, 14);                                    // 踢面
  }
  R(g, "#5c5864", 118, 116, 3, 232);                                    // 扶手柱
  g.strokeStyle = "#7a7682"; g.lineWidth = 2; g.beginPath(); g.moveTo(119, 330); g.lineTo(172, 112); g.stroke();   // 扶手
  // 樓梯頂的房門（門縫透光）
  R(g, "#1a1318", 150, 60, 45, 58); R(g, "#6a3a44", 154, 64, 41, 52);
  const fl = 0.7 + 0.3 * Math.sin(t / 800);
  R(g, `rgba(255,170,120,${0.6 * fl})`, 154, 116, 41, 2);
  g.fillStyle = `rgba(255,170,120,${0.1 * fl})`; g.beginPath(); g.moveTo(154, 118); g.lineTo(195, 118); g.lineTo(195, 150); g.lineTo(140, 150); g.fill();
  R(g, "#c9a24a", 158, 92, 5, 2);
  // 車庫號碼（＝房號），漆在牆上
  g.fillStyle = "#d8c040"; g.font = "bold 16px sans-serif"; g.textAlign = "center"; g.fillText(room, 60, 200);
  // 她的高跟鞋掉在第一階
  R(g, "#9c3346", 132, 334, 10, 4); R(g, "#7a2234", 140, 336, 2, 4); R(g, "#9c3346", 146, 337, 9, 3);
}

// 2026-10-15：日式拉門改用逐像素繪製（rental_entry_paint.js）；舊的方塊版 drawRyokan 留著備用
const DRAW = { ryokan: paintRyokan, hotel: drawHotel, motel: drawMotel };
const FPS_MS = { ryokan: 100 };   // 逐像素的每格比較重：每 100ms 才重畫一次（燈光呼吸、人影很慢，看不出差）
const STATUS = {
  ryokan: "拉門後面亮著燈。兩雙鞋擺在你腳邊。",
  hotel: "門剛關上，房號燈亮著「使用中」。",
  motel: "鐵捲門拉下一半。樓梯上去就是房間。",
};

/** 檢查用：畫一格到 canvas（不開畫面）。 */
export function drawEntry(g, venue, t = 0, room = "305") { (DRAW[venue] || drawHotel)(g, t, room); }

export function openEntry(opts = {}) {
  if (!document.getElementById("rent-entry-css")) {
    const s = document.createElement("style"); s.id = "rent-entry-css"; s.textContent = CSS; document.head.append(s);
  }
  const venue = DRAW[opts.venue] ? opts.venue : "hotel", V = opts.venues?.[venue] || {};
  const room = opts.room || "305";
  const ov = document.createElement("div");
  ov.className = "rent-entry"; ov.id = "rent-entry"; ov.dataset.venue = venue;
  ov.innerHTML = `<div class="box"><canvas width="${LW}" height="${LH}"></canvas>
    <div class="t ti"></div><div class="t st"></div><div class="ch"></div></div>`;
  document.body.append(ov);
  ov.querySelector(".ti").textContent = `${V.zh || "旅館"}・${venue === "ryokan" ? room : venue === "motel" ? `${room} 號車庫` : `${room} 號房前`}${opts.stayZh ? `（${opts.stayZh}）` : ""}`;
  ov.querySelector(".st").textContent = STATUS[venue];
  const g = ov.querySelector("canvas").getContext("2d");
  g.imageSmoothingEnabled = false;
  let raf = 0, closed = false;
  let lastDraw = -1e9;
  const tick = (now) => { if (closed) return; if (now - lastDraw >= (FPS_MS[venue] || 0)) { lastDraw = now; DRAW[venue](g, now, room); } raf = requestAnimationFrame(tick); };
  raf = requestAnimationFrame(tick);
  const close = () => { if (closed) return; closed = true; cancelAnimationFrame(raf); ov.remove(); };
  const ch = ov.querySelector(".ch");
  const btn = (label, sub, main, presence) => {
    const b = document.createElement("button"); b.type = "button"; if (main) b.className = "main";
    b.innerHTML = "<span></span><small></small>"; b.firstChild.textContent = label; b.lastChild.textContent = sub;
    b.addEventListener("click", () => { close(); opts.onChoose?.(presence); });
    ch.append(b);
  };
  btn(V.enter || "進去", `看得到全部；${opts.clientName || "客人"}不知道你是她老公`, true, "in");
  btn(V.wait || "在外面等", "聽得到，看不到", false, "door");
  return { close, el: ov };
}

/** 進去之後看到的房間（2026-10-15：先做日式主臥室；其他兩種還沒有 → 回傳 null，呼叫端照舊）。
 * openRoom({ venue, room, night, clientName, onContinue }) → { close() } | null。 */
const ROOMS = { ryokan: paintJapaneseRoom };
export function hasRoom(venue) { return !!ROOMS[venue]; }
export function openRoom(opts = {}) {
  const paint = ROOMS[opts.venue];
  if (!paint) return null;
  if (!document.getElementById("rent-entry-css")) {
    const st = document.createElement("style"); st.id = "rent-entry-css"; st.textContent = CSS; document.head.append(st);
  }
  const ov = document.createElement("div");
  ov.className = "rent-entry"; ov.id = "rent-room"; ov.dataset.venue = opts.venue;
  ov.innerHTML = `<div class="box"><canvas width="${LW}" height="${LH}"></canvas><div class="t ti"></div><div class="t st"></div><div class="ch"></div></div>`;
  document.body.append(ov);
  ov.querySelector(".ti").textContent = opts.room || "";
  ov.querySelector(".st").textContent = `${opts.clientName || "客人"}和她已經在房間裡了。`;
  const g = ov.querySelector("canvas").getContext("2d");
  paint(g, { night: !!opts.night });   // 靜態：畫一次
  const b = document.createElement("button"); b.type = "button"; b.className = "main"; b.textContent = "繼續";
  let closed = false;
  const close = () => { if (closed) return; closed = true; ov.remove(); };
  b.addEventListener("click", () => { close(); opts.onContinue?.(); });
  ov.querySelector(".ch").append(b);
  return { close, el: ov };
}
/** 檢查用：畫房間到 canvas。 */
export function drawRoom(g, venue, night = false) { ROOMS[venue]?.(g, { night }); }
