// test_bodyM 最上面：像素「肏」互動的測試（本體在 sex_pixel.js，房間的做愛也用同一份）。
// 這裡多一排選單：體型／陰唇大小／陰唇顏色／陰蒂大小／陰道長度，換了就重新掛一次。
// 除錯：window.TestBodyMRub.state()／.set({...})；事件印在 console（[sexpix]）。
import { mountSexPixel } from "/content/sex_pixel.js?v=2";

const OPTS = {
  build: [["slim", "瘦"], ["std", "標準"], ["plump", "肉"], ["firm", "結實"], ["wide", "寬臀"]],
  labia: [["small", "陰唇 內收小巧"], ["mid", "陰唇 適中"], ["large", "陰唇 外翻飽滿"]],
  labcol: [["pink", "粉"], ["brown", "淺褐"], ["dark", "深褐"]],
  clit: [["small", "陰蒂 小"], ["mid", "陰蒂 中"], ["large", "陰蒂 大"]],
  vlen: [["0.5", "陰道 0.5"], ["1", "陰道 1"], ["1.5", "陰道 1.5"]],
};
const look = { build: "std", labia: "mid", labcol: "pink", clit: "mid", vlen: "1" };
try { Object.assign(look, JSON.parse(localStorage.getItem("test_bodyM_look") || "{}")); } catch { /* 壞值就用預設 */ }

const section = document.createElement("section");
section.className = "card";
section.innerHTML = `
  <h2 style="margin-top:0">0. 肏（像素互動）</h2>
  <details class="dim" style="margin:.2em 0 .4em"><summary>說明</summary><p style="margin:.3em 0 0">手指按住陰莖上下拖：磨蹭陰唇 → 打開 → 把龜頭拉到肉穴口再往上推插進去 → 抽送。尿道漲滿就射。她的高潮分四階：陰唇外翻 → 陰蒂勃起 → 陰道痙攣 → 子宮高潮（吸吮、子宮抽動、會尿出來）。下面的選單換她的身體。</p></details>
  <div class="row" id="rub-look" style="justify-content:center;margin-bottom:.4em"></div>
  <div id="rub-host"></div>`;
document.querySelector("main").prepend(section);

const row = section.querySelector("#rub-look");
for (const [key, list] of Object.entries(OPTS)) {
  const sel = document.createElement("select");
  sel.style.width = "auto";
  sel.dataset.look = key;
  for (const [v, zh] of list) sel.add(new Option(zh, v, false, String(look[key]) === v));
  sel.addEventListener("change", () => { look[key] = sel.value; localStorage.setItem("test_bodyM_look", JSON.stringify(look)); mount(); });
  row.append(sel);
}

let api = null;
function mount() {
  api?.destroy();
  api = mountSexPixel(section.querySelector("#rub-host"), {
    look: { ...look, vlen: Number(look.vlen) },
    canvasId: "rub-cv", infoId: "rub-info", resetButton: true,
    on: (type, data) => { if (type !== "rub" && type !== "thrust") console.log("[sexpix]", type, JSON.stringify(data)); },
  });
  window.TestBodyMRub = api;
}
mount();
