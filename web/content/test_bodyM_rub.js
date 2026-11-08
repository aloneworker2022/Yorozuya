// test_bodyM 最上面：像素磨蹭陰唇（預產動圖互動）。
// 圖片條由 tools/droom_groin/gen_rub_sheets.py 產：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
//   rub_closed.png：還沒打開（碰到時大小陰唇包著龜頭，沒碰到是腫脹微張）
//   rub_open.png  ：打開後（外翻陰唇＋肉穴，陰莖直接疊在上面）
// 操作：手指按住陰莖任何一段，上下拖動陰莖摩擦陰唇；摩擦 RUBS_TO_OPEN 下後陰唇打開，之後改用打開那條。
const TIP0 = 76, TIP1 = 106;          // 圖片條的龜頭高度範圍（128 格座標）
const TIP_START = 101;                // 一開始：沒碰到
const CONTACT_BELOW = 95.5;           // 龜頭頂高於這列＝碰到陰唇
const RUB_MIN_TRAVEL = 3;             // 一下摩擦至少要移動幾格（碰到時來回）
const RUBS_TO_OPEN = 4;               // 摩擦幾下陰唇打開
const PEN_HALF_W = 7;                 // 按得到陰莖的半寬（128 格）

const section = document.createElement("section");
section.className = "card";
section.innerHTML = `
  <h2 style="margin-top:0">0. 磨蹭陰唇（像素）</h2>
  <p class="dim">手指按住陰莖任何一段，上下拖動來摩擦陰唇。摩擦 ${RUBS_TO_OPEN} 下陰唇會打開；打開後陰莖直接疊在陰唇上。</p>
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

const st = { tip: TIP_START, opened: false, rubs: 0, dir: 0, turnAt: TIP_START, drag: null };
let sheets = null;

function draw() {
  if (!sheets) return;
  const i = Math.round(st.tip) - TIP0;
  ctx.clearRect(0, 0, 128, 128);
  ctx.drawImage(st.opened ? sheets.open : sheets.closed, i * 128, 0, 128, 128, 0, 0, 128, 128);
  info.textContent = st.opened ? "陰唇打開了" : `摩擦 ${st.rubs} / ${RUBS_TO_OPEN}`;
}

function toGrid(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * 128, y: (ev.clientY - r.top) / r.height * 128 };
}

// 碰到陰唇時每次換方向（而且這一段移動夠多）算一下摩擦
function track(prev, next) {
  const d = Math.sign(next - prev);
  if (!d) return;
  if (st.dir && d !== st.dir) {
    const touching = Math.min(st.turnAt, prev) < CONTACT_BELOW;
    if (touching && Math.abs(prev - st.turnAt) >= RUB_MIN_TRAVEL && !st.opened) {
      st.rubs += 1;
      if (st.rubs >= RUBS_TO_OPEN) st.opened = true;
    }
    st.turnAt = prev;
  }
  st.dir = d;
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
  const next = Math.max(TIP0, Math.min(TIP1, Math.round(st.drag.tip0 + (p.y - st.drag.y0))));
  if (next === st.tip) return;
  track(st.tip, next);
  st.tip = next;
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
  Object.assign(st, { tip: TIP_START, opened: false, rubs: 0, dir: 0, turnAt: TIP_START, drag: null });
  draw();
});

Promise.all([load("/test_bodyM/rub_closed.png?v=1"), load("/test_bodyM/rub_open.png?v=1")])
  .then(([closed, open]) => { sheets = { closed, open }; draw(); })
  .catch((e) => { info.textContent = e.message; console.error(e); });

// 除錯：window.TestBodyMRub.state()
window.TestBodyMRub = { state: () => ({ ...st, drag: !!st.drag }) };
