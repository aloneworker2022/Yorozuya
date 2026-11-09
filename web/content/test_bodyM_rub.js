// test_bodyM 最上面：像素磨蹭陰唇（預產動圖互動）。
// 圖片條由 tools/droom_groin/gen_rub_sheets.py 產：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
//   rub_closed.png：還沒打開（碰到時大小陰唇包著龜頭，沒碰到是腫脹微張）
//   rub_open.png  ：打開後（外翻陰唇＋肉穴，陰莖直接疊在上面）
//   rub_open_a35.png／rub_open_a70.png：打開的過渡幀（打開一點／打開大半），打開時依序播，讓打開滑順
//   rub_insert.png：插入（龜頭頂 INS0～INS1，陰道子宮剖面透視）
//   rub_insert_g1～g3.png：插著的反應 1～3 階（陰道收緊、陰道口那圈纏住陰莖、陰道勃起變長＝子宮頸往上提 LIFT_PER_LV 格／階）
//   rub_insert_g1p～g3p.png：同上、往外抽的那一下（陰道口那圈黏著莖被拖出來）
//   rub_insert_g2s／g3s.png：2、3 階痙攣那一下（陰道因為興奮一抖一抖鎖緊：整條再夾緊、上段縮回）
//   rub_insert_g2u／g3u.png：2、3 階子宮口吸吮往上那一下（子宮口往上縮、頸口張開）
//   2、3 階子宮腫脹、子宮口下降 DESC_BY_LV 格；龜頭頂到子宮口的那幾格畫子宮口親著龜頭（愛心這裡畫）
//   rub_insert_lumen.png：上面插入那 11 條的空間遮罩（一條一列，LUMEN_ROWS 順序；紅＝陰道裡空著、綠＝子宮腔）——內射的精液照陰道形狀流、吸進子宮
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
const CH_H = 5.2;                     // 子宮口前的小空間（陰道接子宮口那段往兩邊微微鼓開）的高；內射先積在這裡，太多才順著陰道往外流
const INSIDE_MAX = 3;
const MILK = [246, 240, 236];         // 精液流進陰道後的乳白色（陰道染白、陰莖被包一層）                 // 射在裡面的量（1＝空間裝滿；超過就沿著陰莖往外流、從陰道口噴出來）
// 插著的反應：抽送每移動 1 格加 REACT_PER_PX（0～3 階）；停下來 REACT_IDLE_MS 後每秒退 REACT_DECAY
const REACT_PER_PX = 1 / 25, REACT_MAX = 3, REACT_IDLE_MS = 1500, REACT_DECAY = .15;
const LIFT_PER_LV = 2;                // 陰道勃起：每階子宮頸往上提幾格（跟 trace128.py 的 LIFT＝6×AROUSE 一樣）
const PULL_SHOW_MS = 180;             // 往外抽之後多久還用「拖出來」那條
// 痙攣：插著、反應到 2 階以上時，每隔一陣子一抖一抖（一陣 SPASM_N 下，每下夾 SPASM_ON_MS、鬆 SPASM_OFF_MS）；不用抽送，停著也會抖
const SPASM_GAP = { 2: [2600, 5200], 3: [1200, 3000] };   // 兩陣之間隔多久（ms，隨機）
const SPASM_N = { 2: [2, 3], 3: [3, 5] };                  // 一陣抖幾下
const SPASM_ON_MS = 130, SPASM_OFF_MS = 210;
// 子宮：興奮（2 階以上）腫脹、子宮口下降；陰道裡有精液就一上一下吸進子宮；龜頭頂著子宮口＝親著龜頭、飄出愛心
const DESC_BY_LV = [0, 0, 3, 7];      // 子宮口下降幾格（跟 gen_rub_sheets.py 一樣）
const BOB_UP = 3;                     // 吸吮往上那一下子宮口縮幾格（跟 trace128.py 的 BOB 一樣）
const BOB_MS = 260;                   // 吸吮：上、下各停多久
const SUCK_PER_BOB = .1;              // 每吸一下從陰道吸進子宮多少（1＝一次射精 4 股的量）
const WOMB_MAX = 3, WOMB_PX = 14;     // 子宮裡最多裝多少；每 1 的量填幾格
const HEART_EVERY_MS = 420, HEART_LIFE_MS = 1400;
const cervix0 = (lv, bob = false) => 60 - LIFT_PER_LV * lv + DESC_BY_LV[lv] - (bob ? BOB_UP : 0);   // 這一階沒被頂到時子宮頸的位置
const HOLE_Y = 87, BODY_BG = [40, 34, 50];             // 打開過渡：每一格停多久（閉合 → 打開一點 → 打開大半 → 全開）

const section = document.createElement("section");
section.className = "card";
section.innerHTML = `
  <h2 style="margin-top:0">0. 磨蹭陰唇（像素）</h2>
  <p class="dim">手指按住陰莖任何一段，上下拖動來摩擦陰唇。摩擦 ${RUBS_TO_OPEN} 下陰唇會打開；打開後陰莖直接疊在陰唇上。把龜頭往下拉到肉穴口再往上推就插進去（插進去才看得到裡面）。磨蹭、抽送時陰莖的尿道會慢慢漲白色精液，漲滿就射（射的時候陰莖一抖一抖、不能前後）：抽送越多陰道越收緊、陰道口那一圈纏住陰莖（往外抽時被拖出來），陰道勃起變長（子宮頸往上提）；夠興奮時陰道會一抖一抖地痙攣（停著不動也會），子宮腫脹、子宮口降下來，陰道裡有精液就一上一下吸進子宮；龜頭頂著子宮口時子宮口會親著龜頭、飄出愛心（這時候射直接灌進子宮）；停下來慢慢鬆回去。插著是內射（積在子宮口前，太多流進陰道變乳白、陰莖被包一層，抽插時從陰道口流出來），在外面射在她身上。</p>
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
  shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [], react: 0, pullAt: 0, moveAt: 0, spasm: false, spasmLeft: 0, spasmNext: 0, spasms: 0, womb: 0, bob: false, sucks: 0, hearts: [], kisses: 0 };   // drops＝抽插時從陰道口帶出來、往下流的精液   // shooting＝還剩幾股；spurt＝這一股的噴射（畫一下）；splats＝身上的精液；inside＝射在裡面的量（0～1）
let openTimer = 0;
let sheets = null;

function draw() {
  if (!sheets) return;
  const tipNow = Math.round(st.tip) + st.jerk;            // 射精時一抖一抖
  const i = Math.max(0, tipNow - TIP0);
  ctx.clearRect(0, 0, 128, 128);
  if (st.inserted) {
    const lv = level(), pulling = performance.now() - st.pullAt < PULL_SHOW_MS;
    const spasm = st.spasm && sheets.spasm[lv], bob = !spasm && !pulling && st.bob && sheets.bob[lv];
    const sheet = lv ? (spasm ? sheets.spasm[lv] : pulling ? sheets.pull[lv] : bob ? sheets.bob[lv] : sheets.grip[lv]) : sheets.insert;
    cur.variant = lv ? `g${lv}${spasm ? "s" : pulling ? "p" : bob ? "u" : ""}` : "insert";
    cur.frame = Math.max(0, Math.min(INS1 - INS0, tipNow - INS0));
    ctx.drawImage(sheet, cur.frame * 128, 0, 128, 128, 0, 0, 128, 128);
  } else {
    const sheet = !st.opened ? sheets.closed : [sheets.a35, sheets.a70, sheets.open][Math.min(2, st.openStep)];
    ctx.drawImage(sheet, i * 128, 0, 128, 128, 0, 0, 128, 128);
  }
  drawUrethra();
  drawCum();
  drawHearts();
  info.textContent = (st.shooting ? (st.inserted ? "內射中！・" : "射精中！・") : st.cum > 0 ? `精液 ${Math.round(st.cum * 100)}%・` : "") + (st.inserted ? `插入中・${["", "陰道收緊", "陰道纏住、變長", "緊緊纏住、勃起變長"][level()] || "還鬆鬆的"}${st.spasm || st.spasmLeft ? "・一抖一抖地痙攣" : ""}${kissing() ? "・子宮口親著龜頭♥" : st.bob || sucking() ? "・子宮口吸著精液" : ""}${st.womb > .05 ? `・子宮裡 ${Math.round(st.womb / WOMB_MAX * 100)}%` : ""}` : st.opened ? (st.armed ? "對準肉穴口了，往上推插進去" : "陰唇打開了：把陰莖往下拉到肉穴口") : `摩擦 ${st.rubs} / ${RUBS_TO_OPEN}`);
}

// ---- 陰道空間遮罩（內射的精液照陰道形狀流，陰道腫脹撐開時也跟著） ----
const LUMEN_ROWS = ["insert", "g1", "g1p", "g2", "g2p", "g2s", "g2u", "g3", "g3p", "g3s", "g3u"];
const cur = { variant: "insert", frame: 0 };
let lumenImg = null;
const lumenCache = new Map();
const lumenCv = document.createElement("canvas"); lumenCv.width = lumenCv.height = 128;
const lumenCtx = lumenCv.getContext("2d", { willReadFrequently: true });
function lumenMask() {                                      // 現在這一格：Uint8Array(128×128)，1＝陰道裡空著；.womb＝子宮腔
  if (!lumenImg) return null;
  const key = `${cur.variant}|${cur.frame}`;
  if (lumenCache.has(key)) return lumenCache.get(key);
  const row = Math.max(0, LUMEN_ROWS.indexOf(cur.variant));
  lumenCtx.clearRect(0, 0, 128, 128);
  lumenCtx.drawImage(lumenImg, cur.frame * 128, row * 128, 128, 128, 0, 0, 128, 128);
  const src = lumenCtx.getImageData(0, 0, 128, 128).data, m = new Uint8Array(128 * 128), w = new Uint8Array(128 * 128);
  for (let i = 0; i < m.length; i++) { m[i] = src[i * 4] > 128 ? 1 : 0; w[i] = src[i * 4 + 1] > 128 ? 1 : 0; }
  m.womb = w;
  lumenCache.set(key, m);
  return m;
}
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 15; h = Math.imul(h, 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };
const LUMEN_PX_PER_SHOT = 7;                                 // 每股精液佔幾格（第 4 股剛好裝滿子宮口前那塊）
// 精液能到的地方：陰道裡空著的格子＋皺褶齒縫（上下都空著的那格），液面才是圓順的、不會變成一節一節的梯子
function fluidMask(m) {
  const f = new Uint8Array(m);
  for (let y = 1; y < 127; y++) for (let x = 1; x < 127; x++) {
    const k = y * 128 + x;
    if (!m[k] && m[k - 128] && m[k + 128]) f[k] = 1;
  }
  return f;
}
// 從起點一格一格往外漫（只走 f 裡面，連著的）：每次挑 key 最小的鄰格——往下（陰道口）容易、貼著壁容易、加一點固定雜訊（前緣參差、不會閃）
function flood(f, seeds, count, seed = 0, up = false) {     // up：往上漫（子宮從頸管往子宮底填）
  const done = new Uint8Array(128 * 128), out = [], front = [];
  const key = (x, y) => (up ? -y : y) - (!f[y * 128 + x - 1] || !f[y * 128 + x + 1] ? 1.3 : 0) + hash(x + seed, y) * 1.8;
  const push = (x, y) => { const k = y * 128 + x; if (x < 1 || x > 126 || y < 1 || y > 126 || !f[k] || done[k]) return; done[k] = 1; front.push({ x, y, k: key(x, y) }); };
  for (const [x, y] of seeds) push(x, y);
  while (out.length < count && front.length) {
    let bi = 0;
    for (let i = 1; i < front.length; i++) if (front[i].k < front[bi].k) bi = i;
    const c = front.splice(bi, 1)[0];
    out.push(c);
    push(c.x, c.y + 1); push(c.x - 1, c.y); push(c.x + 1, c.y); push(c.x, c.y - 1);
  }
  return out;
}
function paintFluid(d, f, cells) {
  const on = new Uint8Array(128 * 128);
  for (const c of cells) on[c.y * 128 + c.x] = 1;
  for (const { x, y } of cells) {
    const front = [[0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => f[(y + dy) * 128 + x + dx] && !on[(y + dy) * 128 + x + dx]);
    put(d, 128, x, y, front ? [226, 220, 230] : hash(x, y + 3) < .15 ? CUM_WHITE : MILK, front ? .8 : .92);   // 前緣淡一點、偶爾亮點
  }
}
const topCells = (f) => {                                    // 最上面那一列（子宮口前）＝精液的起點
  for (let y = 0; y < 128; y++) { const r = []; for (let x = 40; x < 88; x++) if (f[y * 128 + x]) r.push([x, y]); if (r.length) return r; }
  return [];
};
// 從子宮口往陰道口流（重力往畫面下面）：先積在子宮口前那塊，太多就順著陰道往下流，照陰道的形狀（腫脹撐開時也跟著）
function fillLumen(d, m, vol) {
  const f = fluidMask(m);
  paintFluid(d, f, flood(f, topCells(f), Math.round(vol * SHOTS * LUMEN_PX_PER_SHOT)));
}
// 子宮裡的精液：從頸管往子宮底填（往上漫）
function fillWomb(d, w, vol) {
  let seeds = [];
  for (let y = 127; y >= 0 && !seeds.length; y--) for (let x = 40; x < 88; x++) if (w[y * 128 + x]) seeds.push([x, y]);
  paintFluid(d, w, flood(w, seeds, Math.round(vol * WOMB_PX), 3, true));
}
// 愛心：龜頭頂著子宮口時從那裡飄出來（往上飄、左右晃、最後淡掉）
const HEART = ["01010", "11111", "11111", "01110", "00100"];
function drawHearts() {
  if (!st.hearts.length) return;
  const img = ctx.getImageData(0, 0, 128, 128), d = img.data, now = performance.now();
  for (const h of st.hearts) {
    const age = (now - h.t0) / HEART_LIFE_MS;
    const x0 = Math.round(h.x + Math.sin(age * 6 + h.ph) * 1.5 - 2), y0 = Math.round(h.y - age * 16 - 2);
    const a = age < .7 ? 1 : Math.max(0, 1 - (age - .7) / .3);
    HEART.forEach((row, yy) => [...row].forEach((v, xx) => {
      if (v !== "1") return;
      const edge = yy === 0 || xx === 0 || xx === 4 || yy === 4 || (yy === 3 && (xx === 1 || xx === 3));
      put(d, 128, x0 + xx, y0 + yy, edge ? [226, 60, 112] : (yy === 1 && xx === 1 ? [255, 214, 228] : [255, 120, 166]), a);
    }));
  }
  ctx.putImageData(img, 0, 0);
}
const tipNowY = () => Math.round(st.tip) + st.jerk;
const kissing = () => st.inserted && tipNowY() <= cervix0(level()) + .5;            // 龜頭頂到（沒吸的時候的）子宮口
const sucking = () => st.inserted && level() >= 2 && !kissing() && st.inside > .02 && st.womb < WOMB_MAX;

// 這一股：一小團精液從龜頭頂往子宮口衝上去（沿著陰道空著的地方，不是一條線），到頂濺開
const SPURT_FLY_MS = 150;
function drawSpurtInside(d, m, sp) {
  const f = fluidMask(m);
  const t = Math.min(1, (performance.now() - sp.t0) / SPURT_FLY_MS);
  const yc = Math.round(sp.y0 + (sp.y1 - sp.y0) * t);
  let seed = null;
  for (let dy = 0; dy < 4 && !seed; dy++) for (const dx of [0, -1, 1, -2, 2]) if (f[(yc + dy) * 128 + 64 + dx]) { seed = [64 + dx, yc + dy]; break; }
  if (!seed) return;
  const n = t < 1 ? 5 : 12;                                  // 飛的時候一小團，撞到子宮口濺開一片
  for (const c of flood(f, [seed], n, sp.seed)) put(d, 128, c.x, c.y, hash(c.x, c.y) < .3 ? CUM_SHADE : CUM_WHITE, .95);
}

// 尿道：陰莖中線一條細線（根部 → 龜頭頂的尿道口）；只畫在陰莖上（被陰唇包住的地方不畫）
const level = () => Math.min(REACT_MAX, Math.floor(st.react));

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
  if (!st.splats.length && !st.spurt && !st.inside && !st.womb) return;
  const img = ctx.getImageData(0, 0, 128, 128), d = img.data;
  for (const sp of st.splats) {                            // 身上的精液：一坨＋往下流一點
    blob(d, sp.x, sp.y, sp.r);
    for (let i = 1; i <= sp.drip; i++) put(d, 128, sp.x + (i > 2 ? .5 : 0), sp.y + sp.r * .6 + i, i % 2 ? CUM_SHADE : CUM_WHITE);
  }
  const tipY = Math.round(st.tip) + st.jerk;
  if (st.womb > 0 && st.inserted) { const m = lumenMask(); if (m) fillWomb(d, m.womb, st.womb); }   // 吸進子宮的精液
  if (st.inside && st.inserted) {
    const c0 = cervix0(level()), push = Math.max(0, c0 - tipY), cerv = c0 - push;   // 子宮頸被頂著走（陰道勃起變長：子宮頸往上提）
    const m = lumenMask();
    if (m) fillLumen(d, m, st.inside);                         // 從子宮口前那塊開始積，太多就順著陰道往陰道口流（照陰道形狀）
    const over = Math.max(0, st.inside - 1);                   // 太多：流進陰道（只填在陰道裡面、陰莖包一層；陰道壁保持肉色）
    const milk = Math.min(1, over / 1.2);                      // 0～1：陰道多白
    if (milk > 0) {
      const y0 = Math.floor(cerv - .8 + CH_H - 1);
      for (let y = y0; y < HOLE_Y + 1; y++) {
        const pf = .82 + .18 * (y - 59) / 28;
        const inPen = y >= tipY;
        const g = inPen ? (y < tipY + 9.5 ? 5.6 : 5.0) * pf + .2 : .5;
        const flare = Math.max(0, (y - (HOLE_Y - 6.5)) / 5) * 1.6;
        // 只填在陰道裡面（壁保持肉色）：從中間往兩邊，陰莖那段整根蓋乳白，碰到壁前多塗一格白；龜頭上面＝那條縫
        const isDark = (x) => { const k = (y * 128 + x) * 4; return d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110; };
        const penRow = inPen && (isDark(62) || isDark(66));           // 中間那列是尿道（不是黑），看旁邊
        if (penRow) for (const sx of [-1, 1]) {
          if (sx < 0) put(d, 128, 64, y, [222, 218, 226], .5);         // 尿道那列也蓋一層
          let x = sx < 0 ? 63 : 65;
          while (x >= 0 && x < 128 && isDark(x)) {
            const edge = !isDark(x + sx);
            put(d, 128, x, y, edge ? [168, 162, 180] : [222, 218, 226], .7 + .15 * milk);   // 陰莖整根被一層乳白蓋住（邊深一圈）
            x += sx;
          }
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
  const mSp = st.spurt && st.spurt.inside ? lumenMask() : null;
  if (mSp) drawSpurtInside(d, mSp, st.spurt);                 // 內射這一股：彎彎曲曲沿著陰道
  else if (st.spurt) {                                        // 在外面這一股：從尿道口噴出去的白線
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
  if (st.inserted && kissing()) {                            // 子宮口親著龜頭時射：直接灌進子宮
    st.spurt = null;
    st.womb = Math.min(WOMB_MAX, st.womb + 1 / SHOTS);
    if (st.womb >= WOMB_MAX) st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS);   // 子宮滿了才往陰道裡流
  } else if (st.inserted) {                                  // 內射：一股從龜頭射到子宮口旁的空間（不直接進子宮；之後子宮口會吸）
    const c0 = cervix0(level()), cerv = c0 - Math.max(0, c0 - tipY);
    st.spurt = { inside: true, seed: Math.floor(Math.random() * 1000), t0: performance.now(), y0: tipY - 2, y1: Math.min(tipY - 2, Math.round(cerv + 1)) };
    const fly = setInterval(() => { if (!st.spurt || performance.now() - st.spurt.t0 > SPURT_FLY_MS + 40) clearInterval(fly); draw(); }, 30);
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
  if (st.inserted) {                                        // 抽送：陰道慢慢收緊、勃起變長；往外抽那一下陰道口那圈被拖出來
    st.react = Math.min(REACT_MAX + .99, st.react + Math.abs(next - st.tip) * REACT_PER_PX);
    if (next > st.tip) st.pullAt = performance.now(); else st.pullAt = 0;
  }
  st.moveAt = performance.now();
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
    shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [], react: 0, pullAt: 0, moveAt: 0, spasm: false, spasmLeft: 0, spasmNext: 0, spasms: 0, womb: 0, bob: false, sucks: 0, hearts: [], kisses: 0 });
  draw();
});

// 停下來：「拖出來」那條換回來；一陣子沒抽送，收緊／勃起慢慢退
let lastShown = "";
setInterval(() => {
  if (!sheets) return;
  const now = performance.now();
  if (st.react > 0 && !st.drag && now - st.moveAt > REACT_IDLE_MS) st.react = Math.max(0, st.react - REACT_DECAY / 4);
  const shown = `${st.inserted}|${level()}|${now - st.pullAt < PULL_SHOW_MS}`;
  if (shown !== lastShown) { lastShown = shown; draw(); }
}, 250);
setInterval(() => { if (st.pullAt && performance.now() - st.pullAt >= PULL_SHOW_MS && st.inserted) { st.pullAt = 0; draw(); } }, 60);

// 痙攣排程：到 2 階以上才會抖；每一陣抖幾下（夾 → 鬆），抖完隔一陣子再來
const rand = ([a, b]) => a + Math.random() * (b - a);
setInterval(() => {
  const lv = level(), now = performance.now();
  if (!sheets || !st.inserted || lv < 2) {
    if (st.spasm || st.spasmLeft) { st.spasm = false; st.spasmLeft = 0; draw(); }
    st.spasmNext = 0; return;
  }
  if (!st.spasmNext) st.spasmNext = now + rand(SPASM_GAP[lv]);
  if (st.spasmLeft || now < st.spasmNext) return;
  st.spasmLeft = Math.round(rand(SPASM_N[lv]));
  const twitch = () => {
    if (!st.spasmLeft || !st.inserted) { st.spasm = false; st.spasmLeft = 0; draw(); return; }
    st.spasm = true; st.spasms += 1; draw();
    setTimeout(() => {
      st.spasm = false; st.spasmLeft -= 1; draw();
      if (st.spasmLeft > 0) setTimeout(twitch, SPASM_OFF_MS);
      else st.spasmNext = performance.now() + rand(SPASM_GAP[level()] || SPASM_GAP[2]);
    }, SPASM_ON_MS);
  };
  twitch();
}, 100);

// 子宮口吸吮：一上一下，往上那一下從陰道吸一點進子宮；龜頭頂著子宮口時＝親著龜頭、飄愛心
let heartAt = 0;
setInterval(() => {
  if (!sheets) return;
  const now = performance.now();
  if (sucking()) {
    st.bob = !st.bob;
    if (st.bob) { const v = Math.min(SUCK_PER_BOB, st.inside, WOMB_MAX - st.womb); st.inside -= v; st.womb += v; st.sucks += 1; }
    draw();
  } else if (st.bob) { st.bob = false; draw(); }
  if (kissing() && now - heartAt > HEART_EVERY_MS) {
    heartAt = now; st.kisses += 1;
    st.hearts.push({ x: 64.5 + (Math.random() * 2 - 1) * 5, y: tipNowY() - 3, t0: now, ph: Math.random() * 6 });
  }
}, BOB_MS);
setInterval(() => {                                          // 愛心動畫
  if (!st.hearts.length) return;
  const now = performance.now();
  st.hearts = st.hearts.filter((h) => now - h.t0 < HEART_LIFE_MS);
  draw();
}, 60);

const SHEETS = ["rub_closed", "rub_open_a35", "rub_open_a70", "rub_open", "rub_insert",
  "rub_insert_g1", "rub_insert_g2", "rub_insert_g3", "rub_insert_g1p", "rub_insert_g2p", "rub_insert_g3p", "rub_insert_g2s", "rub_insert_g3s", "rub_insert_g2u", "rub_insert_g3u", "rub_insert_lumen"];
Promise.all(SHEETS.map((n) => load(`/test_bodyM/${n}.png?v=13`)))
  .then(([closed, a35, a70, open, insert, g1, g2, g3, p1, p2, p3, s2, s3, u2, u3, lumen]) => {
    lumenImg = lumen;
    sheets = { closed, a35, a70, open, insert, grip: [null, g1, g2, g3], pull: [null, p1, p2, p3], spasm: [null, null, s2, s3], bob: [null, null, u2, u3] };
    draw();
  })
  .catch((e) => { info.textContent = e.message; console.error(e); });

// 除錯：window.TestBodyMRub.state()
window.TestBodyMRub = { state: () => ({ ...st, drag: !!st.drag, level: level() }) };
