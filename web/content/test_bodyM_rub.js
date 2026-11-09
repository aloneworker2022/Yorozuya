// test_bodyM 最上面：像素磨蹭陰唇（預產動圖互動）。
// 圖片條由 tools/droom_groin/gen_rub_sheets.py 產：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
//   rub_closed.png：還沒打開（碰到時大小陰唇包著龜頭，沒碰到是腫脹微張）
//   rub_open.png  ：打開後（外翻陰唇＋肉穴，陰莖直接疊在上面）
//   rub_open_a35.png／rub_open_a70.png：打開的過渡幀（打開一點／打開大半），打開時依序播，讓打開滑順
//   rub_insert.png：插入（龜頭頂 INS0～INS1，陰道子宮剖面透視）
// 插入：打開後要先把龜頭拉到肉穴口（龜頭頂 ≥ AT_HOLE＝對準），再往上推才插進去（最深到子宮頸）；
//   在上面磨（沒對準）只是疊在陰唇上；插著時往下拉出肉穴口就回到疊著。
// 操作：手指按住陰莖任何一段，上下拖動陰莖摩擦陰唇；碰著陰唇時累積移動距離，每 RUB_DIST 格算一下，
// 摩擦 RUBS_TO_OPEN 下後陰唇打開（陰莖不用離開），之後改用打開那條。
const TIP0 = 76, TIP1 = 106;          // 圖片條的龜頭高度範圍（128 格座標）
const TIP_START = 101;                // 一開始：沒碰到
const CONTACT_BELOW = 95.5;           // 龜頭頂高於這列＝碰到陰唇
const RUB_DIST = 8;                   // 碰著陰唇時累積移動幾格算一下摩擦（不用換方向、不用離開；小幅度來回也算）
const RUBS_TO_OPEN = 4;               // 摩擦幾下陰唇打開
const PEN_HALF_W = 7;                 // 按得到陰莖的半寬（128 格）
const INS0 = 54, INS1 = 84;           // 插入圖片條：龜頭頂 54（頂到子宮頸再往裡推 6 格，子宮被壓扁）～84（剛進肉穴口）
const AT_HOLE = 85;                   // 打開後龜頭拉到這列以下＝頂在肉穴口（對準了），往上推才插進去
const OPEN_STEP_MS = 110;
// 尿道漲精液：碰著陰唇磨、或插著抽送時，每移動 1 格加 CUM_PER_PX；白色從根部往龜頭慢慢漲上去，漲滿停在尿道口
const CUM_PER_PX = 1 / 160;
const URETHRA_EMPTY = [56, 48, 66], CUM_WHITE = [250, 248, 252], CUM_SHADE = [214, 212, 226];
// 射精：漲滿就射，分 SHOTS 股、每股間隔 SHOT_MS；插著＝內射（灌進陰道、子宮，拔出來從肉穴口流出），在外面＝噴在她身上
const SHOTS = 4, SHOT_MS = 380;
const JERK_MS = 140;                  // 每一股陰莖往前抖一下（射精時不能前後拖）
const CH_H = 5.2, CH_W = 3.4;         // 子宮口前的小空間（陰道接子宮口那段往兩邊微微鼓開）：內射只積在這裡，不會進子宮
const chamberW = (y, cerv) => { const t = (y - (cerv - .8)) / CH_H; return t >= 0 && t <= 1 ? CH_W * Math.sin(Math.PI * t) ** .7 + .5 : 0; };
const INSIDE_MAX = 3;
const MILK = [246, 240, 236];         // 精液流進陰道後的乳白色（陰道染白、陰莖被包一層）                 // 射在裡面的量（1＝空間裝滿；超過就沿著陰莖往外流、從陰道口噴出來）
const HOLE_Y = 87, BODY_BG = [40, 34, 50];             // 打開過渡：每一格停多久（閉合 → 打開一點 → 打開大半 → 全開）

const section = document.createElement("section");
section.className = "card";
section.innerHTML = `
  <h2 style="margin-top:0">0. 磨蹭陰唇（像素）</h2>
  <p class="dim">手指按住陰莖任何一段，上下拖動來摩擦陰唇。摩擦 ${RUBS_TO_OPEN} 下陰唇會打開；打開後陰莖直接疊在陰唇上。把龜頭往下拉到肉穴口再往上推就插進去（插進去才看得到裡面）。磨蹭、抽送時陰莖的尿道會慢慢漲白色精液，漲滿就射（射的時候陰莖一抖一抖、不能前後）：插著是內射（積在子宮口前，太多流進陰道變乳白、陰莖被包一層，抽插時從陰道口流出來），在外面射在她身上。</p>
  <div style="display:flex;justify-content:center">
    <canvas id="rub-cv" width="128" height="128"
      style="width:min(92vw,512px);height:auto;aspect-ratio:1;image-rendering:pixelated;touch-action:none;background:#28222f;cursor:grab"></canvas>
  </div>
  <div class="row" style="justify-content:center;margin-top:.4em">
    <span id="rub-info" class="dim"></span>
    <button id="rub-reset" type="button">重來</button>
  </div>`;
const main = document.querySelector("main");
main.prepend(section);

const cv = section.querySelector("#rub-cv");
const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;
const info = section.querySelector("#rub-info");

const load = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error(`載不到 ${src}`));
  im.src = src;
});

const st = { tip: TIP_START, opened: false, openStep: 0, rubs: 0, travel: 0, drag: null, armed: false, inserted: false, cum: 0,
  shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [] };   // drops＝抽插時從陰道口帶出來、往下流的精液   // shooting＝還剩幾股；spurt＝這一股的噴射（畫一下）；splats＝身上的精液；inside＝射在裡面的量（0～1）
let openTimer = 0;
let sheets = null;

function draw() {
  if (!sheets) return;
  const tipNow = Math.round(st.tip) + st.jerk;            // 射精時一抖一抖
  const i = Math.max(0, tipNow - TIP0);
  ctx.clearRect(0, 0, 128, 128);
  if (st.inserted) {
    ctx.drawImage(sheets.insert, Math.max(0, tipNow - INS0) * 128, 0, 128, 128, 0, 0, 128, 128);
  } else {
    const sheet = !st.opened ? sheets.closed : [sheets.a35, sheets.a70, sheets.open][Math.min(2, st.openStep)];
    ctx.drawImage(sheet, i * 128, 0, 128, 128, 0, 0, 128, 128);
  }
  drawUrethra();
  drawCum();
  info.textContent = (st.shooting ? (st.inserted ? "內射中！・" : "射精中！・") : st.cum > 0 ? `精液 ${Math.round(st.cum * 100)}%・` : "") + (st.inserted ? "插入中" : st.opened ? (st.armed ? "對準肉穴口了，往上推插進去" : "陰唇打開了：把陰莖往下拉到肉穴口") : `摩擦 ${st.rubs} / ${RUBS_TO_OPEN}`);
}

// 尿道：陰莖中線一條細線（根部 → 龜頭頂的尿道口）；只畫在陰莖上（被陰唇包住的地方不畫）
function drawUrethra() {
  const top = Math.round(st.tip) + st.jerk + 1;           // 尿道口（龜頭頂下一格）
  const len = 128 - top;
  if (len <= 0) return;
  const img = ctx.getImageData(64, top, 1, len);
  const d = img.data;
  const fillFrom = 128 - st.cum * len;                     // 白色漲到這一列（從根部往上）
  for (let i = 0; i < len; i++) {
    const y = top + i, k = i * 4;
    const isPen = d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110;   // 這格是陰莖（實心黑／透視裡的黑）
    if (!isPen) continue;
    const c = y >= fillFrom ? ((y & 1) ? CUM_SHADE : CUM_WHITE) : URETHRA_EMPTY;
    d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; d[k + 3] = 255;
  }
  ctx.putImageData(img, 64, top);
}

// ---- 射精 ----
const put = (d, w, x, y, c, a = 1) => {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= w || y >= 128) return;
  const k = (y * w + x) * 4;
  for (let j = 0; j < 3; j++) d[k + j] = d[k + j] * (1 - a) + c[j] * a;
};
const isBg = (d, x, y) => { const k = (y * 128 + x) * 4; return Math.abs(d[k] - BODY_BG[0]) < 6 && Math.abs(d[k + 1] - BODY_BG[1]) < 6 && Math.abs(d[k + 2] - BODY_BG[2]) < 6; };
function blob(d, x, y, r, a = 1) {                          // 一坨精液：白、下緣一圈淡灰（厚度）
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const e = (dx * dx) / (r * r) + (dy * dy) / (r * r * .7);
    if (e <= 1) put(d, 128, x + dx, y + dy, e > .55 && dy > 0 ? CUM_SHADE : CUM_WHITE, a);
  }
}
function drawCum() {
  if (!st.splats.length && !st.spurt && !st.inside) return;
  const img = ctx.getImageData(0, 0, 128, 128), d = img.data;
  for (const sp of st.splats) {                            // 身上的精液：一坨＋往下流一點
    blob(d, sp.x, sp.y, sp.r);
    for (let i = 1; i <= sp.drip; i++) put(d, 128, sp.x + (i > 2 ? .5 : 0), sp.y + sp.r * .6 + i, i % 2 ? CUM_SHADE : CUM_WHITE);
  }
  const tipY = Math.round(st.tip) + st.jerk;
  if (st.inside && st.inserted) {
    const push = Math.max(0, 60 - tipY), cerv = 60 - push;     // 子宮頸被頂著走
    const fill = Math.min(1, st.inside);                       // 子宮口前的小空間：從子宮口往下積滿
    for (let y = Math.floor(cerv - .8); y <= Math.ceil(cerv - .8 + CH_H); y++) {
      if ((y + .5 - (cerv - .8)) / CH_H > fill) continue;
      const w = chamberW(y + .5, cerv);
      for (let x = Math.floor(64.5 - w); x <= Math.ceil(64.5 + w); x++) {
        const u = x + .5 - 64.5;
        if (Math.abs(u) > w - .4) continue;                      // 留著壁
        if (Math.abs(u) < 2 && y < cerv + .5) continue;           // 子宮頸本身（頸口不灌進去）
        put(d, 128, x, y, (x + y) % 3 ? CUM_WHITE : CUM_SHADE, .9);
      }
    }
    const over = Math.max(0, st.inside - 1);                   // 太多：流進陰道（陰道變乳白、陰莖包一層；不再畫陰莖兩邊的白線）
    const milk = Math.min(1, over / 1.2);                      // 0～1：陰道多白
    if (milk > 0) {
      const y0 = Math.floor(cerv - .8 + CH_H - 1);
      for (let y = y0; y < HOLE_Y + 1; y++) {
        const pf = .82 + .18 * (y - 59) / 28;
        const inPen = y >= tipY;
        const g = inPen ? (y < tipY + 9.5 ? 5.6 : 5.0) * pf + .2 : .5;
        const flare = Math.max(0, (y - (HOLE_Y - 6.5)) / 5) * 1.6;
        const band = g + flare + 1.8;                            // 陰道（壁＋裡面）
        for (let x = Math.floor(64.5 - band); x <= Math.ceil(64.5 + band); x++) {
          const u = Math.abs(x + .5 - 64.5);
          if (u > band) continue;
          const k = (y * 128 + x) * 4, dark = d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110;
          if (dark) put(d, 128, x, y, u > g - 1 ? [168, 162, 180] : [222, 218, 226], .7 + .15 * milk);   // 陰莖整根被一層乳白蓋住（偏灰一點、邊深一圈，跟陰道的乳白分得開）
          else put(d, 128, x, y, MILK, (.6 + .32 * milk));                                   // 陰道染乳白（濃、不太透）
        }
      }
    }
    if (over > 0) {
      if (over > .5) {                                          // 從陰道口噴出來：口旁兩坨＋往下流
        for (const sx of [-1, 1]) {
          blob(d, 64.5 + sx * 6, HOLE_Y + 1.5, 1.2 + Math.min(1.4, over * .6));
          for (let k = 1; k <= 2 + Math.round(over * 2); k++) put(d, 128, 64.5 + sx * 6, HOLE_Y + 3 + k, k % 2 ? CUM_SHADE : CUM_WHITE);
        }
      }
    }
    if (st.leak) for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) put(d, 128, 64.5 + sx * (6 + k), HOLE_Y - k * .6, CUM_WHITE);   // 噴出來的那一下
  } else if (st.inside && st.opened) {                      // 拔出來：肉穴口流出白色（射越多流越多）
    const v = Math.min(INSIDE_MAX, st.inside);
    blob(d, 64.5, HOLE_Y + 1, 1.4 + v * .7);
    for (let i = 0; i < 3 + Math.round(v * 4); i++) put(d, 128, 64 + (i > 3 ? 1 : 0), HOLE_Y + 3 + i, i % 2 ? CUM_SHADE : CUM_WHITE);
  }
  const milkOut = Math.min(1, Math.max(0, st.inside - 1) / 1.2);
  if (milkOut > 0 && st.inserted) {                          // 露在外面、剛抽出來那段陰莖帶著一層乳白
    for (let y = HOLE_Y + 1; y < HOLE_Y + 1 + 7 * milkOut; y++)
      for (let x = 58; x <= 71; x++) {
        const k = (y * 128 + x) * 4;
        if (d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110) put(d, 128, x, y, MILK, .75 * (1 - (y - HOLE_Y) / (8 * milkOut + 1)));
      }
  }
  for (const dr of st.drops) blob(d, dr.x, dr.y, dr.r);      // 抽插帶出來、往下流的精液
  if (st.spurt) {                                            // 這一股：從尿道口噴出去的白線
    const sp = st.spurt;
    const n = Math.max(12, Math.abs(sp.y1 - sp.y0));
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = 64.5 + (sp.x - 64.5) * t, y = sp.y0 + (sp.y1 - sp.y0) * t;
      put(d, 128, x, y, CUM_WHITE); put(d, 128, x + 1, y, CUM_SHADE, .6);
    }
  }
  ctx.putImageData(img, 0, 0);
}
function shootOnce() {
  const tipY = Math.round(st.tip);
  st.jerk = -2;                                              // 往前抖一下
  setTimeout(() => { st.jerk = 0; draw(); }, JERK_MS);
  if (st.inserted) {                                         // 內射：一股從龜頭射到子宮口旁的空間（不進子宮）
    const cerv = 60 - Math.max(0, 60 - tipY);
    st.spurt = { x: 64.5, y0: tipY - 1, y1: Math.min(tipY - 1, cerv + 1.5) };
    const before = st.inside;
    st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS);
    if (st.inside > 1.5 && before <= st.inside) { st.leak = 1; setTimeout(() => { st.leak = 0; draw(); }, 220); }   // 太多：噴出來
  } else {                                                   // 在外面：往上噴到她的下腹、陰阜（一股比一股近）
    const k = SHOTS - st.shooting;                           // 第幾股（0 最遠）
    let x = 64.5 + (Math.random() * 2 - 1) * (2 + k * 2.5), y = 40 + k * 7 + Math.random() * 3;   // 下腹（肚臍下）→ 陰阜，第一股最遠
    const d = ctx.getImageData(0, 0, 128, 128).data;
    y = Math.max(30, Math.min(tipY - 12, y));
    while (y > 20 && isBg(d, Math.round(x), Math.round(y))) y -= 1;   // 落在身上
    st.spurt = { x, y0: tipY, y1: y };
    st.splats.push({ x, y, r: 2.2 + Math.random() * 1.2 - k * .2, drip: 2 + Math.floor(Math.random() * 3) });
    if (st.splats.length > 40) st.splats.shift();
  }
  st.cum = Math.max(0, st.cum - 1 / SHOTS);                  // 尿道裡的白色退一截
  st.shooting -= 1;
  draw();
  setTimeout(() => { st.spurt = null; draw(); if (st.shooting > 0) shootOnce(); }, SHOT_MS);
}
// 抽插往外抽的時候，陰道裡的精液被帶出來：陰道口兩邊冒出一滴，往下流
let dropTimer = 0;
function spawnDrop() {
  if (st.drops.length > 14) return;
  const sx = Math.random() < .5 ? -1 : 1;
  st.drops.push({ x: 64.5 + sx * (5.5 + Math.random() * 1.5), y: HOLE_Y + 1, r: .9 + Math.random() * .7, vy: .35 + Math.random() * .25 });
  if (!dropTimer) dropTimer = setInterval(() => {
    for (const dr of st.drops) { dr.y += dr.vy; dr.vy += .05; }
    st.drops = st.drops.filter((dr) => dr.y < 127);
    if (!st.drops.length) { clearInterval(dropTimer); dropTimer = 0; }
    draw();
  }, 50);
}

function maybeShoot() {
  if (st.cum >= 1 && !st.shooting) { st.shooting = SHOTS; shootOnce(); }
}

function toGrid(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * 128, y: (ev.clientY - r.top) / r.height * 128 };
}

// 碰著陰唇時移動就累積摩擦距離（磨的當下就會打開，陰莖不用離開）
function track(prev, next) {
  if (st.opened || Math.min(prev, next) >= CONTACT_BELOW) return;
  st.travel += Math.abs(next - prev);
  st.rubs = Math.min(RUBS_TO_OPEN, Math.floor(st.travel / RUB_DIST));
  if (st.rubs >= RUBS_TO_OPEN) startOpen();
}

// 打開：打開一點 → 打開大半 → 全開，一格一格播
function startOpen() {
  st.opened = true; st.openStep = 0;
  clearInterval(openTimer);
  openTimer = setInterval(() => {
    st.openStep += 1;
    if (st.openStep >= 2) clearInterval(openTimer);
    draw();
  }, OPEN_STEP_MS);
}

cv.addEventListener("pointerdown", (ev) => {
  const p = toGrid(ev);
  if (Math.abs(p.x - 64) > PEN_HALF_W || p.y < st.tip - 1) return;   // 只有按在陰莖上才抓得到
  st.drag = { id: ev.pointerId, y0: p.y, tip0: st.tip };
  cv.setPointerCapture(ev.pointerId);
  cv.style.cursor = "grabbing";
  ev.preventDefault();
});
cv.addEventListener("pointermove", (ev) => {
  if (!st.drag || ev.pointerId !== st.drag.id) return;
  const p = toGrid(ev);
  if (st.shooting) { st.drag.y0 = p.y; st.drag.tip0 = st.tip; return; }   // 射精時不能前後
  const want = Math.round(st.drag.tip0 + (p.y - st.drag.y0));
  // 插入：打開後對準肉穴口才能往上推進去；沒對準最高只到 TIP0（疊在陰唇上）
  const canIn = st.opened && st.openStep >= 2 && (st.inserted || st.armed);
  const next = Math.max(canIn ? INS0 : TIP0, Math.min(TIP1, want));
  if (next === st.tip) return;
  if (st.inserted && next > st.tip && st.inside > 1 && Math.random() < .35 + .2 * Math.min(1, st.inside - 1)) spawnDrop();   // 往外抽：帶出精液
  track(st.tip, next);
  if (!st.shooting && (st.inserted || Math.min(st.tip, next) < CONTACT_BELOW)) st.cum = Math.min(1, st.cum + Math.abs(next - st.tip) * CUM_PER_PX);   // 磨／抽送：尿道慢慢漲精液
  st.tip = next;
  if (st.opened && st.openStep >= 2) {
    if (st.tip >= AT_HOLE) { st.inserted = false; st.armed = true; }        // 拉到肉穴口（或拉出來）＝對準
    else if (st.armed || st.inserted) { st.inserted = st.tip <= INS1; }     // 對準後往上推＝插進去
    if (!st.inserted && st.tip < AT_HOLE && !canIn) st.armed = false;
  }
  draw();
  maybeShoot();
});
const release = (ev) => {
  if (!st.drag || ev.pointerId !== st.drag.id) return;
  st.drag = null;
  cv.style.cursor = "grab";
};
cv.addEventListener("pointerup", release);
cv.addEventListener("pointercancel", release);
section.querySelector("#rub-reset").addEventListener("click", () => {
  clearInterval(openTimer);
  Object.assign(st, { tip: TIP_START, opened: false, openStep: 0, rubs: 0, travel: 0, drag: null, armed: false, inserted: false, cum: 0,
    shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [] });
  draw();
});

Promise.all(["rub_closed", "rub_open_a35", "rub_open_a70", "rub_open", "rub_insert"].map((n) => load(`/test_bodyM/${n}.png?v=9`)))
  .then(([closed, a35, a70, open, insert]) => { sheets = { closed, a35, a70, open, insert }; draw(); })
  .catch((e) => { info.textContent = e.message; console.error(e); });

// 除錯：window.TestBodyMRub.state()
window.TestBodyMRub = { state: () => ({ ...st, drag: !!st.drag }) };
