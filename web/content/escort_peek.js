/* 接客偷看畫面（2026-10-10 Al；樣板 mockups/peek/half4.py）。
 * 全螢幕：走廊、掛粉紅牌子「工作室・接客中」的門 → 點門 → 門往內開一半 → 門縫裡：床、暖黃燈、
 * 她（房間同一套人偶 RoomDoll，自己的身材／髮型／罩杯／乳搖，側面體位）＋藍色剪影客人（大半被門擋住，只露腰／手）。
 * 「她沒發現你……」；門開著時每 2～4 秒冒一句字幕（客人藍字粗話／她呻吟），點門關上。
 * 不扣錢、不決定發現與否：這些由呼叫端（app.js）先算好傳進來。 */
import { peekLine, nextGapMs } from "./escort_voices.js?v=1";

const LW = 195, LH = 422;                    // 邏輯像素（畫面 ×2 放大）
const DX0 = 8, DX1 = 187, DY0 = 112, DY1 = 340;
const BED = 298;                              // 床面（世界 z＝0）的邏輯 y
/** 她骨盆（世界 y＝0）的邏輯 x：每個體位擺得讓她大半在門縫裡、客人大半在門後。 */
const HIPX = { missionary: DX0 + 70, cowgirl: DX0 + 68, doggy: DX0 + 68, kiss: DX0 + 66 };
const OPEN = 0.6;                            // 門半開：門縫佔門框寬度
const BLUE = "rgba(46,82,170,0.95)";
const POSE_ID = { missionary: "sex_missionary", cowgirl: "sex_cowgirl", doggy: "sex_doggy", kiss: "sex_kiss" };

let worker = null, jobSeq = 0;
const waiters = new Map();
function dollWorker() {
  const D = window.RoomDoll;
  if (!D || typeof Worker === "undefined") return null;
  if (worker) return worker;
  try {
    const src = `const RoomDoll=(${D.factorySource})();onmessage=(e)=>{const j=e.data;try{const f=RoomDoll.render(j.doll,j.pose,j.frame,0,{});postMessage({id:j.id,w:f.width,h:f.height,px:f.pixels},[f.pixels.buffer]);}catch(err){postMessage({id:j.id,err:String(err&&err.message||err)});}};`;
    worker = new Worker(URL.createObjectURL(new Blob([src], { type: "text/javascript" })));
    worker.onmessage = (e) => { const w = waiters.get(e.data.id); if (w) { waiters.delete(e.data.id); w(e.data); } };
  } catch { worker = null; }
  return worker;
}
/** 產一格：Worker 優先，沒有就主執行緒（測試／舊瀏覽器）。 */
function renderFrame(doll, pose, frame) {
  const w = dollWorker();
  if (!w) {
    const f = window.RoomDoll.render(doll, pose, frame, 0, {});
    return Promise.resolve({ w: f.width, h: f.height, px: f.pixels });
  }
  const id = ++jobSeq;
  return new Promise((res) => { waiters.set(id, res); w.postMessage({ id, doll, pose, frame }); });
}
/** 她的人偶幀 → canvas（不透明度拉到 95%）。 */
async function dollFrames(doll, pose) {
  const D = window.RoomDoll, n = D.POSES[pose].frames, out = [];
  for (let i = 0; i < n; i++) {
    const r = await renderFrame(doll, pose, i);
    if (r.err) throw new Error(r.err);
    const px = new Uint8ClampedArray(r.px);
    for (let k = 3; k < px.length; k += 4) if (px[k]) px[k] = 242;
    // 燈在左上：朝燈那一側的輪廓描一圈暖光（腰線、胸型讀得出來）
    const W = r.w, Hh = r.h, a = (x, y) => (x < 0 || y < 0 || x >= W || y >= Hh ? 0 : px[(y * W + x) * 4 + 3]);
    const rim = [];
    for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) if (a(x, y) && (!a(x - 1, y) || !a(x, y - 1) || !a(x + 1, y) && !a(x, y + 1))) rim.push((y * W + x) * 4);
    for (const i of rim) { px[i] = 196; px[i + 1] = 146; px[i + 2] = 112; }
    const c = document.createElement("canvas");
    c.width = r.w; c.height = r.h;
    c.getContext("2d").putImageData(new ImageData(px, r.w, r.h), 0, 0);
    out.push(c);
  }
  return out;
}

// ---------------------------------------------------------------- 客人（藍色剪影，世界座標：y 往右、z 往上，床面 z＝0）
let limb = function (g, a, b, w) {
  g.lineWidth = w; g.lineCap = "round";
  g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
}
let headAt = function (g, p, r = 6) { g.beginPath(); g.arc(p[0], p[1], r, 0, Math.PI * 2); g.fill(); }
/** a＝RoomDoll.sexAnchor（她骨盆＋抽送深度 p）。退出距離是 2.5 倍、猛地頂回。 */
export function drawClient(g, pose, a, K = 1) {
  const hx = HIPX[pose] || HIPX.cowgirl;
  const P = (y, z) => [hx + y * K, BED - z * K];
  const lw = g.lineWidth;
  const limb0 = limb; limb = (gg, a1, b1, w) => limb0(gg, a1, b1, w * K);
  const head0 = headAt; headAt = (gg, p1, r = 6) => head0(gg, p1, r * K);
  const out = 9 * (1 - a.p);   // 退出量 0～9（×2.2 畫在骨盆上：退很多、頂回很猛）
  g.strokeStyle = BLUE; g.fillStyle = BLUE;
  const [hy, hz] = [a.hip[1], a.hip[2]];
  if (pose === "missionary") {
    const pel = [hy + 8 + out * 1.4, 9];                     // 下腹一直貼在她骨盆前（門縫內看得到）
    limb(g, P(...pel), P(pel[0] + 12, 38), 11);            // 軀幹往後仰一點，她的小腿靠在他肩上
    headAt(g, P(pel[0] + 15, 48), 6.5);
    limb(g, P(pel[0] + 11, 34), P(hy + 14, 22), 4.5);      // 手抓她大腿
    limb(g, P(...pel), P(pel[0] + 4, 2), 8);               // 跪著的大腿
    limb(g, P(pel[0] + 4, 2), P(pel[0] + 22, 1.5), 5.5);
    limb(g, P(pel[0] - 4, 10), P(...pel), 6);              // 下腹貼著她
  } else if (pose === "cowgirl") {
    headAt(g, P(-38, 7), 6.5);
    limb(g, P(-31, 6), P(5, 6), 11);                         // 腰在她屁股正下方
    limb(g, P(5, 5), P(40, 3), 7);
    limb(g, P(-26, 9), P(-8, Math.max(14, hz + 10)), 4.5); // 手扶她的腰
  } else if (pose === "doggy") {
    const pel = [hy + 7 + out * 1.1, hz + 1];                // 整個循環都貼著她屁股、留在門縫內
    limb(g, P(...pel), P(pel[0] + 7, pel[1] + 27), 11);
    headAt(g, P(pel[0] + 10, pel[1] + 37), 6.5);
    limb(g, P(pel[0] + 6, pel[1] + 22), P(hy + 3, hz + 4), 4.5);   // 雙手抓她臀部
    limb(g, P(...pel), P(pel[0] + 2, 2.5), 8);
    limb(g, P(pel[0] + 2, 2.5), P(pel[0] + 19, 1.5), 5.5);
    limb(g, P(pel[0] - 5, pel[1]), P(...pel), 6);
  } else {
    limb(g, P(17, 12), P(16, 39), 11);                       // 他坐在右邊，跟她分開兩個形
    headAt(g, P(12.5, 48), 6.5);                             // 頭往她那邊湊：嘴貼著她
    limb(g, P(16, 9), P(-22, 3), 7);
    limb(g, P(15, 34), P(1, 27), 4.5);                       // 手摟她的腰
  }
  limb = limb0; headAt = head0; g.lineWidth = lw;
}

// ---------------------------------------------------------------- 場景
function drawScene(g, st) {
  g.fillStyle = "#16121e"; g.fillRect(0, 0, LW, LH);
  g.fillStyle = "#1a1624"; for (let x = 0; x < LW; x += 10) g.fillRect(x, 0, 1, 360);
  g.fillStyle = "#221c28"; g.fillRect(0, 360, LW, LH - 360);
  g.fillStyle = "#3a2828"; g.fillRect(DX0 - 5, DY0 - 6, DX1 - DX0 + 10, DY1 - DY0 + 6);
  const w = DX1 - DX0, gap = Math.round(w * OPEN * st.open);
  if (gap > 0) {
    g.save(); g.beginPath(); g.rect(DX0, DY0, gap, DY1 - DY0); g.clip();
    g.fillStyle = "#4a3438"; g.fillRect(DX0, DY0, w, DY1 - DY0);   // 牆亮一點，她的剪影才讀得出曲線
    g.fillStyle = "#34221f"; g.fillRect(DX0, BED + 22, w, DY1 - BED - 22);
    const lx = DX0 + 56, ly = DY0 + 46;
    [[46, "#46301f"], [32, "#5f4027"], [18, "#7a5030"]].forEach(([r, c]) => { g.fillStyle = c; g.beginPath(); g.arc(lx, ly, r, 0, 7); g.fill(); });
    g.fillStyle = "#f0be6e"; g.fillRect(lx - 4, ly - 4, 9, 9);
    g.fillStyle = "#965a5a"; g.fillRect(DX0 + 2, BED, w, 12);            // 床
    g.fillStyle = "#462828"; g.fillRect(DX0 + 2, BED + 12, w, 8);
    g.fillRect(DX0, BED - 18, 5, 38);                                   // 床頭板
    g.fillStyle = "#dcc8be"; g.fillRect(DX0 + 6, BED - 5, 14, 5);       // 枕頭
    const f = st.frames?.[st.fi];
    const cvp = window.RoomDoll.CANVAS.peek;
    if (st.anchor) drawClient(g, st.pose, st.anchor, cvp.scale);
    if (f) g.drawImage(f, (HIPX[st.pose] || HIPX.cowgirl) - cvp.ax, BED - cvp.ay);
    g.restore();
    g.fillStyle = `rgba(230,170,90,${0.27 * st.open})`;               // 門縫透出的光
    g.beginPath(); g.moveTo(DX0, DY1); g.lineTo(DX0 + gap, DY1); g.lineTo(DX0 + gap + 22 * st.open, LH); g.lineTo(DX0 - 18 * st.open, LH); g.fill();
  }
  // 門板（往內開：右邊那條鉸鏈，開越大越窄、越斜）
  const x0 = DX0 + gap, sk = 8 * st.open;
  g.fillStyle = "#60402f";
  g.beginPath(); g.moveTo(x0, DY0 - sk); g.lineTo(DX1, DY0); g.lineTo(DX1, DY1); g.lineTo(x0, DY1 + sk); g.fill();
  g.fillStyle = "#96704f"; g.fillRect(x0, DY0 - sk, 2, DY1 - DY0 + 2 * sk);
  if (st.open < 0.05) {
    g.strokeStyle = "#4a3024"; g.lineWidth = 1;
    g.strokeRect(DX0 + 22, DY0 + 26, w - 44, 60); g.strokeRect(DX0 + 22, DY0 + 104, w - 44, 80);
    g.fillStyle = "#dcae3c"; g.fillRect(DX0 + 8, DY0 + 110, 5, 5);
  }
  // 粉紅牌子
  g.fillStyle = "#46203a"; g.fillRect(80, 92, 36, 18);
  g.strokeStyle = "#d278a0"; g.strokeRect(80.5, 92.5, 35, 17);
  g.fillStyle = "#e65a8c"; g.beginPath(); g.arc(98, 101, 4, 0, 7); g.fill();
}

const CSS = `
.peek-ov{position:fixed;inset:0;z-index:9000;background:#16121e;display:flex;align-items:center;justify-content:center;touch-action:manipulation}
.peek-box{position:relative;height:100%;max-height:100dvh;aspect-ratio:195/422;max-width:100vw}
.peek-box canvas{width:100%;height:100%;image-rendering:pixelated;display:block}
.peek-t{position:absolute;left:0;right:0;text-align:center;font:600 15px/1.3 "Fusion Pixel",system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 0 #000}
.peek-title{top:7%;color:#e88ab4}.peek-status{top:13%;color:#e6be8c}.peek-hint{bottom:5%;color:#f0dce6}
.peek-bub{position:absolute;max-width:46%;padding:3px 7px;border-radius:7px;font:600 13px/1.3 system-ui,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s;white-space:nowrap}
.peek-bub.on{opacity:1;transform:none}
.peek-bub.c{background:rgba(20,30,70,.82);color:#8fb2ff;border:1px solid #3f62c0}
.peek-bub.w{background:rgba(60,20,40,.82);color:#ffb0cf;border:1px solid #c0608c}
.peek-close{position:absolute;top:8px;right:8px;background:none;border:0;color:#998;font-size:22px}`;

/**
 * 打開偷看。opts：{ who, doll, pose('missionary'…), noticed, cost, voice, family, onClose(state) }。
 * 回傳 { close() , state }（state.opened：真的開過門；state.lines：冒過的字幕，測試用）。
 */
export function openPeek(opts = {}) {
  if (!document.getElementById("peek-css")) {
    const s = document.createElement("style"); s.id = "peek-css"; s.textContent = CSS; document.head.append(s);
  }
  const pose = POSE_ID[opts.pose] ? opts.pose : "cowgirl";
  const ov = document.createElement("div");
  ov.className = "peek-ov"; ov.id = "peek-overlay"; ov.dataset.pose = pose;
  ov.innerHTML = `<div class="peek-box"><canvas width="${LW}" height="${LH}"></canvas>
    <div class="peek-t peek-title">工作室・接客中</div><div class="peek-t peek-status"></div><div class="peek-t peek-hint"></div>
    <div class="peek-bub c"></div><div class="peek-bub w"></div><button class="peek-close" type="button" aria-label="離開">×</button></div>`;
  document.body.append(ov);
  const cv = ov.querySelector("canvas"), g = cv.getContext("2d");
  g.imageSmoothingEnabled = false;
  const status = ov.querySelector(".peek-status"), hint = ov.querySelector(".peek-hint");
  const bubC = ov.querySelector(".peek-bub.c"), bubW = ov.querySelector(".peek-bub.w");
  const st = { pose, open: 0, target: 0, frames: null, fi: 0, anchor: null, opened: false, closed: false, lines: [], side: "client" };
  const D = window.RoomDoll, dpose = POSE_ID[pose], doll = opts.doll || D.lookToDoll(opts.who?.look || null);
  hint.textContent = opts.cost ? `點門偷看（−${opts.cost} 金）` : "點門偷看";
  status.textContent = "";
  let raf = 0, last = performance.now(), acc = 0, talkAt = 0;
  const recent = { client: [], wife: [] };
  const say = () => {
    const side = st.side;
    st.side = side === "client" ? "wife" : "client";
    const l = peekLine(side, pose, { voice: opts.voice || "", family: opts.family || "", recent: recent[side] });
    recent[side] = [...recent[side], l.key].slice(-6);
    st.lines.push({ side, text: l.text });
    const el = side === "client" ? bubC : bubW;
    el.textContent = l.text;
    // 客人在門縫右緣（門板邊），她在頭的附近
    const y = side === "client" ? 33 : 43 + (pose === "missionary" ? 13 : pose === "doggy" ? 10 : 0);
    el.style.top = `${y}%`;
    if (side === "client") { el.style.left = ""; el.style.right = "6%"; } else { el.style.right = ""; el.style.left = "5%"; }
    el.classList.add("on");
    clearTimeout(el._t); el._t = setTimeout(() => el.classList.remove("on"), 1700);
  };
  const tick = (now) => {
    const dt = Math.min(100, now - last); last = now;
    if (st.open !== st.target) {
      const step = dt / 650;
      st.open = st.target > st.open ? Math.min(st.target, st.open + step) : Math.max(st.target, st.open - step);
      if (st.open === 0 && st.closed) { finish(); return; }
    }
    if (st.frames && Number.isInteger(st.hold)) {   // 檢查用：停在某一格
      st.fi = st.hold % st.frames.length;
      st.anchor = { ...D.sexAnchor(doll, dpose, st.fi) };
    } else if (st.frames) {
      acc += dt;
      while (acc >= D.SEX_FRAME_MS[st.fi]) { acc -= D.SEX_FRAME_MS[st.fi]; st.fi = (st.fi + 1) % st.frames.length; }
      st.anchor = { ...D.sexAnchor(doll, dpose, st.fi) };
    }
    if (st.open >= 0.98 && st.frames && !st.closed && now >= talkAt) { say(); talkAt = now + nextGapMs(); }
    drawScene(g, st);
    raf = requestAnimationFrame(tick);
  };
  const framesReady = dollFrames(doll, dpose).then((fr) => { st.frames = fr; st.anchor = D.sexAnchor(doll, dpose, 0); }).catch((err) => { console.warn("[peek]", err); });
  const openDoor = () => {
    if (opts.onOpen && opts.onOpen() === false) return;
    st.opened = true; st.target = 1; talkAt = performance.now() + 900;
    status.textContent = opts.noticed ? "……她好像看到門縫了！" : "她沒發現你……";
    status.style.color = opts.noticed ? "#ff8a8a" : "";
    hint.textContent = "點門關上";
  };
  const finish = () => {
    if (!ov.isConnected) return;
    cancelAnimationFrame(raf); ov.remove();
    try { opts.onClose?.(st); } catch { /* */ }
  };
  const closeDoor = () => { st.closed = true; st.target = 0; hint.textContent = ""; bubC.classList.remove("on"); bubW.classList.remove("on"); if (st.open === 0) finish(); };
  cv.addEventListener("click", (ev) => {
    const r = cv.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width * LW, y = (ev.clientY - r.top) / r.height * LH;
    const onDoor = x >= DX0 - 6 && x <= DX1 + 6 && y >= DY0 - 30 && y <= DY1 + 10;
    if (!onDoor || st.closed) return;
    if (!st.opened) openDoor(); else closeDoor();
  });
  ov.querySelector(".peek-close").addEventListener("click", () => (st.opened ? closeDoor() : finish()));
  raf = requestAnimationFrame(tick);
  return { state: st, ready: framesReady, open: openDoor, close: closeDoor, say };
}
