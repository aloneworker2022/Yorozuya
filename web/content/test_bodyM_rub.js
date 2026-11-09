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
const URETHRA_EMPTY = [56, 48, 66], CUM_WHITE = [250, 248, 252], CUM_SHADE = [214, 212, 226];             // 打開過渡：每一格停多久（閉合 → 打開一點 → 打開大半 → 全開）

const section = document.createElement("section");
section.className = "card";
section.innerHTML = `
  <h2 style="margin-top:0">0. 磨蹭陰唇（像素）</h2>
  <p class="dim">手指按住陰莖任何一段，上下拖動來摩擦陰唇。摩擦 ${RUBS_TO_OPEN} 下陰唇會打開；打開後陰莖直接疊在陰唇上。把龜頭往下拉到肉穴口再往上推就插進去（插進去才看得到裡面）。磨蹭、抽送時陰莖的尿道會慢慢漲白色精液。</p>
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

const st = { tip: TIP_START, opened: false, openStep: 0, rubs: 0, travel: 0, drag: null, armed: false, inserted: false, cum: 0 };
let openTimer = 0;
let sheets = null;

function draw() {
  if (!sheets) return;
  const i = Math.round(st.tip) - TIP0;
  ctx.clearRect(0, 0, 128, 128);
  if (st.inserted) {
    ctx.drawImage(sheets.insert, (Math.round(st.tip) - INS0) * 128, 0, 128, 128, 0, 0, 128, 128);
  } else {
    const sheet = !st.opened ? sheets.closed : [sheets.a35, sheets.a70, sheets.open][Math.min(2, st.openStep)];
    ctx.drawImage(sheet, i * 128, 0, 128, 128, 0, 0, 128, 128);
  }
  drawUrethra();
  info.textContent = (st.cum > 0 ? `精液 ${Math.round(st.cum * 100)}%・` : "") + (st.inserted ? "插入中" : st.opened ? (st.armed ? "對準肉穴口了，往上推插進去" : "陰唇打開了：把陰莖往下拉到肉穴口") : `摩擦 ${st.rubs} / ${RUBS_TO_OPEN}`);
}

// 尿道：陰莖中線一條細線（根部 → 龜頭頂的尿道口）；只畫在陰莖上（被陰唇包住的地方不畫）
function drawUrethra() {
  const top = Math.round(st.tip) + 1;                     // 尿道口（龜頭頂下一格）
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
  const want = Math.round(st.drag.tip0 + (p.y - st.drag.y0));
  // 插入：打開後對準肉穴口才能往上推進去；沒對準最高只到 TIP0（疊在陰唇上）
  const canIn = st.opened && st.openStep >= 2 && (st.inserted || st.armed);
  const next = Math.max(canIn ? INS0 : TIP0, Math.min(TIP1, want));
  if (next === st.tip) return;
  track(st.tip, next);
  if (st.inserted || Math.min(st.tip, next) < CONTACT_BELOW) st.cum = Math.min(1, st.cum + Math.abs(next - st.tip) * CUM_PER_PX);   // 磨／抽送：尿道慢慢漲精液
  st.tip = next;
  if (st.opened && st.openStep >= 2) {
    if (st.tip >= AT_HOLE) { st.inserted = false; st.armed = true; }        // 拉到肉穴口（或拉出來）＝對準
    else if (st.armed || st.inserted) { st.inserted = st.tip <= INS1; }     // 對準後往上推＝插進去
    if (!st.inserted && st.tip < AT_HOLE && !canIn) st.armed = false;
  }
  draw();
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
  Object.assign(st, { tip: TIP_START, opened: false, openStep: 0, rubs: 0, travel: 0, drag: null, armed: false, inserted: false, cum: 0 });
  draw();
});

Promise.all(["rub_closed", "rub_open_a35", "rub_open_a70", "rub_open", "rub_insert"].map((n) => load(`/test_bodyM/${n}.png?v=7`)))
  .then(([closed, a35, a70, open, insert]) => { sheets = { closed, a35, a70, open, insert }; draw(); })
  .catch((e) => { info.textContent = e.message; console.error(e); });

// 除錯：window.TestBodyMRub.state()
window.TestBodyMRub = { state: () => ({ ...st, drag: !!st.drag }) };
