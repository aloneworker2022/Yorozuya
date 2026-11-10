// 「肏」像素互動（2026-11-10）：手指按住陰莖上下拖——磨蹭陰唇、插入、抽送、射精；她的高潮用陰唇、陰蒂、陰道、子宮表現。
// 原本是 test_bodyM 最上面的測試（test_bodyM_rub.js），改成可以掛到任何地方的模組：mountSexPixel(host, opts)。
// 圖是分層的（tools/droom_groin/gen_sexpix.py → web/sexpix/）：身體底圖（5 種體型）＋大腿姿勢＋胯下（陰唇 3 種大小 × 陰道長度 3 級）＋陰蒂（3 種大小）；陰唇顏色在這裡換色。
// opts：
//   look   { build: slim|std|plump|firm|wide, labia: small|mid|large, labcol: pink|brown|dark, clit: small|mid|large, vlen: 0.5|1|1.5 }
//   on(type, data)  事件：stage {stage, name}／insert／pullout／thrust（插著每移動 THRUST_PX 格算一下）／rub（在外面碰著陰唇每 THRUST_PX 格）／
//                   ejac {where: womb|inside|outside}／orgasm {count}（進子宮高潮的第一陣子宮抽動、之後每 ORGASM_EVERY 陣一次）／pee／squirt／gush
//   reactMul()  她的反應漲多快（倍率，預設 1）；cumMul()  尿道精液漲多快（倍率，預設 1）
//   info（預設 true）顯示資訊列；resetButton（預設 false）；canvasId／infoId（測試頁用）
// 回傳 { el, ready, look, state(), set(o), reset(), lock(on), destroy() }
//
// ↓ 以下是原本 test_bodyM_rub.js 的說明（圖片條名字是舊的 rub_*；現在是 /sexpix/g_<陰唇>_*）
// test_bodyM 最上面：像素磨蹭陰唇（預產動圖互動）。
// 圖片條由 tools/droom_groin/gen_rub_sheets.py 產：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
//   rub_closed.png：還沒打開（碰到時大小陰唇包著龜頭，沒碰到是腫脹微張）
//   rub_open.png  ：打開後（外翻陰唇＋肉穴，陰莖直接疊在上面）
//   rub_open_a35.png／rub_open_a70.png：打開的過渡幀（打開一點／打開大半），打開時依序播，讓打開滑順
//   rub_insert.png：插入（龜頭頂 INS0～INS1，陰道子宮剖面透視）
//   rub_insert_g1～g3.png：插著的反應 1～3 階（陰道收緊、陰道口那圈纏住陰莖、陰道勃起變長＝子宮頸往上提 LIFT_PER_LV 格／階）
//   rub_insert_g1p～g3p.png：同上、往外抽的那一下（陰道口那圈黏著莖被拖出來）
//   rub_insert_g2s／g3s.png：2、3 階痙攣那一下（陰道因為興奮一抖一抖鎖緊：整條再夾緊、上段縮回）
//   rub_insert_g3u.png：3 階子宮口吸吮往上那一下（子宮口往上縮、頸口張開）
//   rub_insert_g3c.png：3 階子宮抽動那一下（子宮高潮：整個子宮收縮——變窄、子宮底往下擠、壁變厚）
//   rub_legs.png：大腿抬起的姿勢（−2～8 格，一格一張；只有跟平常不一樣的格子，疊在上面，左右腿各挑一張）
//   rub_open_e.png：打開後陰蒂勃起（反應 1 階以上、還沒插進去時）
// 高潮分階段（使用者）：1 陰唇外翻（磨開）→ 2 陰蒂勃起（反應 1 階）→ 3 陰道痙攣（2 階）→ 4 子宮高潮（3 階）
//   子宮高潮（使用者 2026-11-10）＝子宮開始吸吮、然後子宮一抽一抽；可以連續高潮，不會結束（停下來才慢慢退）
//   3 階子宮腫脹、子宮口下降 DESC_BY_LV 格；龜頭頂到子宮口的那幾格畫子宮口親著龜頭（愛心這裡畫）
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
const OPEN_STEP_MS = 110;              // 打開過渡：每一格停多久（閉合 → 打開一點 → 打開大半 → 全開）
// 尿道漲精液：碰著陰唇磨、或插著抽送時，每移動 1 格加 CUM_PER_PX；白色從根部往龜頭慢慢漲上去，漲滿停在尿道口
const CUM_PER_PX = 1 / 160;
const URETHRA_EMPTY = [56, 48, 66], CUM_WHITE = [250, 248, 252], CUM_SHADE = [214, 212, 226];
// 射精：漲滿就射，分 SHOTS 股、每股間隔 SHOT_MS；插著＝內射（灌進陰道、子宮，拔出來從肉穴口流出），在外面＝噴在她身上
const SHOTS = 4, SHOT_MS = 380;
const JERK_MS = 140;                  // 每一股陰莖往前抖一下（射精時不能前後拖）
const CH_H = 5.2;                     // 子宮口前的小空間（陰道接子宮口那段往兩邊微微鼓開）的高；內射先積在這裡，太多才順著陰道往外流
const INSIDE_MAX = 3;                 // 射在裡面的量（1＝空間裝滿；超過就沿著陰莖往外流、從陰道口噴出來）
const MILK = [246, 240, 236];         // 精液流進陰道後的乳白色（陰道染白、陰莖被包一層）
// 插著的反應：抽送每移動 1 格加 REACT_PER_PX（0～3 階）；停下來 REACT_IDLE_MS 後每秒退 REACT_DECAY
// 1/60＝來回抽一趟升一階（之前 1/25 兩下半就到子宮高潮，中間的階段看不到）；約 6 下到子宮高潮，跟第一次射精差不多時候
const REACT_PER_PX = 1 / 60, REACT_MAX = 3, REACT_IDLE_MS = 1500, REACT_DECAY = .15;
const LIFT_PER_LV = 2;                // 陰道勃起：每階子宮頸往上提幾格（跟 trace128.py 的 LIFT＝6×AROUSE 一樣）
const PULL_SHOW_MS = 180;             // 往外抽之後多久還用「拖出來」那條
// 痙攣：插著、反應到 2 階以上時，每隔一陣子一抖一抖（一陣 SPASM_N 下，每下夾 SPASM_ON_MS、鬆 SPASM_OFF_MS）；不用抽送，停著也會抖
const SPASM_GAP = { 2: [2600, 5200], 3: [1200, 3000] };   // 兩陣之間隔多久（ms，隨機）
const SPASM_N = { 2: [2, 3], 3: [3, 5] };                  // 一陣抖幾下
const SPASM_ON_MS = 130, SPASM_OFF_MS = 210;
// 子宮：興奮（2 階以上）腫脹、子宮口下降；陰道裡有精液就一上一下吸進子宮；龜頭頂著子宮口＝親著龜頭、飄出愛心
const DESC_BY_LV = [0, 0, 0, 7];      // 子宮口下降幾格（跟 gen_rub_sheets.py 一樣；第 4 階段才下降）
const STAGES = ["", "陰唇外翻", "陰蒂勃起", "陰道痙攣", "子宮高潮"];
const RUB_REACT_CAP = 1.99;           // 還沒插進去：在外面磨最多到陰蒂勃起（陰道、子宮的階段要插著）
// 噴精：陰道裡精液滿了（≥ SQUIRT_FULL）時痙攣過，拔出陰莖的時候陰道一抽一抽把精液吐出來
// 吐的樣子像嘔吐（使用者：不是噴口水那樣）：陰道口先鼓起來一團（HEAVE_MS），再一大口濃濃的湧出來、順著往下淌（不是飛散的點），停一下再吐下一口
const SQUIRT_FULL = 1, SQUIRT_PULSES = [3, 5], HEAVE_MS = 280, HEAVE_PAUSE_MS = 320, POUR_LIFE_MS = 1500;
// 身體動作（使用者：抽插時大腿、腹部跟著動，大腿上下微微扭；子宮高潮〔第 4 階段〕雙腿忍不住往上）
// 大腿＝重畫的姿勢圖（rub_legs.png：大腿以髖為軸往上抬 LEG0～LEG1 格，左右腿各挑一張疊上去），不是把畫面像素往上推；腹部還是整塊微微位移
const LEG0 = -2, LEG1 = 8;             // 跟 gen_rub_sheets.py 一樣
const LEG_LIFT = 5, LEG_TREMBLE = .8;
const BOB_UP = 3;                     // 吸吮往上那一下子宮口縮幾格（跟 trace128.py 的 BOB 一樣）
const BOB_MS = 260;                   // 吸吮：上、下各停多久
const SUCK_PER_BOB = .04;             // 每吸一下從陰道吸進子宮多少（1＝一次射精 4 股的量）；使用者：子宮一次不會吸很多
const WOMB_MAX = 2;                   // 子宮裡最多裝多少（畫面上＝子宮腔整個填滿）
// 子宮滿了（吸滿、或親著龜頭被射滿）再被龜頭頂到子宮口：子宮把精液噴回陰道裡（使用者 2026-11-10）
const GUSH = .5, GUSH_MS = 320;
// 子宮抽動（子宮高潮）：3 階插著時一陣一陣抽（一陣 CRAMP_N 下，每下縮 CRAMP_ON_MS、鬆 CRAMP_OFF_MS），每抽一下大腿往上一抬
const CRAMP_GAP = [1400, 3200], CRAMP_N = [2, 4], CRAMP_ON_MS = 150, CRAMP_OFF_MS = 230;
const HEART_EVERY_MS = 420, HEART_LIFE_MS = 1400;
// 體位（使用者 2026-11-10）：她躺在床上、屁股壓在床上；陰莖是從斜前方往斜下插進去（正常體位），不是在屁股下面。
//   所以流出來的精液不會流到陰莖／龜頭上：從陰道口往後流過會陰、流到屁股那裡，在屁股下緣的床上積成一攤（st.vomit＝那一攤的量）；陰莖在前面，擋住的地方看不到。
//   噴出來的小滴（sprays）落在床上那一帶。
// 尿（使用者 2026-11-10）：子宮高潮時尿出來——一道連續的尿（PEE_MS，一開始強、後面變弱），不是一下一下；尿在床上積一攤。之後隔 PEE_AGAIN 再尿
const GROUND = 97;                    // 會陰／屁股下緣（流到這裡就進那一攤）
const POOL_Y = 101.5, PEE_POOL_Y = 107.5;   // 兩攤在床上的位置（陰莖在前面會擋住中間，所以要夠寬、兩邊才看得到）
const PEE_X = 64.5, PEE_Y = 81, PEE_COL = [252, 234, 136], PEE_EDGE = [226, 200, 96], PEE_MS = 3800, PEE_AGAIN = [5000, 10000], SPRAY_G = .13;
const HOLE_Y = 87, BODY_BG = [40, 34, 50];

export const THRUST_PX = 44;           // 插著（或碰著陰唇）每移動幾格算「一下」（來回一趟約 60 格）
export const ORGASM_EVERY = 3;         // 子宮高潮中每幾陣子宮抽動算一次高潮（第一陣一定算）
const LABCOL = {                       // 陰唇顏色換色（跟 trace128.py 的 SW／_LC 一樣）：粉 → 淺褐／深褐
  from: [[204, 96, 112], [238, 160, 166], [250, 198, 202], [214, 112, 124], [244, 178, 182]],
  brown: [[146, 86, 80], [196, 136, 124], [222, 172, 160], [168, 104, 96], [208, 152, 140]],
  dark: [[84, 54, 60], [134, 94, 96], [172, 130, 128], [106, 70, 74], [150, 110, 110]],
};
const VKEY = { 0.5: "05", 1: "10", 1.5: "15" };
export const SEXPIX_VER = 1;           // 改圖後 +1（圖片網址 ?v=）

export function mountSexPixel(host, opts = {}) {
const look = { build: "std", labia: "mid", labcol: "pink", clit: "mid", vlen: 1, ...(opts.look || {}) };
if (!VKEY[look.vlen]) look.vlen = 1;
const emit = (type, data = {}) => { try { opts.on && opts.on(type, data); } catch (err) { console.warn("[sexpix]", type, err); } };
const mul = (f) => { const v = typeof f === "function" ? Number(f()) : 1; return Number.isFinite(v) && v > 0 ? v : 1; };
let dead = false;
const timers = [];
const every = (fn, ms) => { const id = setInterval(() => { if (!dead) fn(); }, ms); timers.push(id); return id; };
const CERV_BASE = look.vlen === 1 ? 60 : 87.4 - 27.4 * look.vlen;   // 子宮口（沒被頂到、0 階）：陰道長度決定（跟 trace128.py 一樣）
const cervix0 = (lv, bob = false) => CERV_BASE - LIFT_PER_LV * lv + DESC_BY_LV[lv] - (bob ? BOB_UP : 0);   // 這一階沒被頂到時子宮頸的位置
const section = document.createElement("div");
section.className = "sexpix";
section.innerHTML = `
  <div style="display:flex;justify-content:center">
    <canvas class="sexpix-cv" width="128" height="128"
      style="width:min(70vw,384px);height:auto;aspect-ratio:1;image-rendering:pixelated;touch-action:none;background:#28222f;cursor:grab"></canvas>
  </div>
  <div class="sexpix-row" style="display:flex;gap:.5em;justify-content:center;align-items:center;margin-top:.3em">
    <span class="sexpix-info" style="opacity:.75;font-size:.85rem"></span>
    <button class="sexpix-reset" type="button" hidden>重來</button>
  </div>`;
host.append(section);
const cv = section.querySelector(".sexpix-cv");
const info = section.querySelector(".sexpix-info");
if (opts.canvasId) cv.id = opts.canvasId;
if (opts.infoId) info.id = opts.infoId;
if (opts.info === false) info.hidden = true;
if (opts.resetButton) section.querySelector(".sexpix-reset").hidden = false;

const ctx = cv.getContext("2d");
ctx.imageSmoothingEnabled = false;

const load = (src) => new Promise((resolve, reject) => {
  const im = new Image();
  im.onload = () => resolve(im);
  im.onerror = () => reject(new Error(`載不到 ${src}`));
  im.src = src;
});

const fresh = () => ({ tip: TIP_START, opened: false, openStep: 0, rubs: 0, travel: 0, drag: null, armed: false, inserted: false, cum: 0,
  shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [], react: 0, pullAt: 0, moveAt: 0, spasm: false, spasmLeft: 0, spasmNext: 0, spasms: 0, womb: 0, bob: false, sucks: 0, cramp: false, crampLeft: 0, crampNext: 0, cramps: 0, gush: -1e9, gushes: 0, hearts: [], kisses: 0, squirtReady: false, squirting: 0, squirts: 0, heave: 0, pours: [], vomit: 0, sprays: [], pees: 0, peeT0: 0, peeUntil: 0, peeNext: 0, peePool: 0, locked: false, thrustTravel: 0, rubTravel: 0, crampBursts: 0, orgasms: 0, thrusts: 0, ejacs: 0 });
const st = fresh();   // drops＝抽插時從陰道口帶出來、往下流的精液   // shooting＝還剩幾股；spurt＝這一股的噴射（畫一下）；splats＝身上的精液；inside＝射在裡面的量（0～1）
let openTimer = 0, lastStage = -1;
let sheets = null;

function draw() {
  if (!sheets || dead) return;
  const tipNow = Math.round(st.tip) + st.jerk;            // 射精時一抖一抖
  const i = Math.max(0, tipNow - TIP0);
  ctx.clearRect(0, 0, 128, 128);
  ctx.drawImage(sheets.body, 0, 0);                         // 身體底圖（她的體型）
  drawLegs();                                               // 大腿姿勢
  if (st.inserted) {
    const lv = level(), pulling = performance.now() - st.pullAt < PULL_SHOW_MS;
    const spasm = st.spasm && sheets.spasm[lv], cramp = !spasm && !pulling && st.cramp && sheets.cramp[lv], bob = !spasm && !pulling && !cramp && st.bob && sheets.bob[lv];
    const sheet = lv ? (spasm ? sheets.spasm[lv] : pulling ? sheets.pull[lv] : cramp ? sheets.cramp[lv] : bob ? sheets.bob[lv] : sheets.grip[lv]) : sheets.insert;
    cur.variant = lv ? `g${lv}${spasm ? "s" : pulling ? "p" : cramp ? "c" : bob ? "u" : ""}` : "insert";
    cur.frame = Math.max(0, Math.min(INS1 - INS0, tipNow - INS0));
    ctx.drawImage(sheet, cur.frame * 128, 0, 128, 128, 0, 0, 128, 128);
  } else {
    const sheet = !st.opened ? sheets.closed : [sheets.a35, sheets.a70, sheets.open][Math.min(2, st.openStep)];
    ctx.drawImage(sheet, i * 128, 0, 128, 128, 0, 0, 128, 128);
    // 陰蒂（她的大小）：沒打開／打開過渡／打開後沒勃起、半勃起（反應 0.5 起）、全勃起（1 階起）
    const cf = !st.opened ? 0 : st.openStep < 2 ? 1 + st.openStep : 3 + (st.react >= 1 ? 2 : st.react >= .5 ? 1 : 0);
    ctx.drawImage(sheets.clit, cf * 128, 0, 128, 128, 0, 0, 128, 128);
  }
  drawUrethra();
  drawCum();
  drawHearts();
  applyBody();
  const stg = stage();
  if (stg !== lastStage) { lastStage = stg; emit("stage", { stage: stg, name: STAGES[stg] || "" }); }
  info.textContent = (stg ? `【${stg}・${STAGES[stg]}】` : "") + (st.squirting ? "陰道把精液吐出來了！・" : "") + (performance.now() < st.peeUntil ? "尿出來了・" : "") + (st.shooting ? (st.inserted ? "內射中！・" : "射精中！・") : st.cum > 0 ? `精液 ${Math.round(st.cum * 100)}%・` : "") + (st.inserted ? `插入中・${["", "陰道收緊", "陰道纏住、變長", "緊緊纏住、勃起變長"][level()] || "還鬆鬆的"}${st.spasm || st.spasmLeft ? "・一抖一抖地痙攣" : ""}${performance.now() - st.gush < 900 ? "・子宮把精液噴回陰道！" : ""}${st.cramp || st.crampLeft ? "・子宮一抽一抽" : ""}${kissing() ? "・子宮口親著龜頭♥" : bobbing() ? (canSuck() ? "・子宮口吸著精液" : "・子宮口一吸一吸") : ""}${st.womb > .05 ? `・子宮裡 ${Math.round(st.womb / WOMB_MAX * 100)}%` : ""}` : st.opened ? (st.armed ? "對準肉穴口了，往上推插進去" : "陰唇打開了：把陰莖往下拉到肉穴口") : `摩擦 ${st.rubs} / ${RUBS_TO_OPEN}`);
}

// ---- 陰道空間遮罩（內射的精液照陰道形狀流，陰道腫脹撐開時也跟著） ----
const LUMEN_ROWS = ["insert", "g1", "g1p", "g2", "g2p", "g2s", "g3", "g3p", "g3s", "g3u", "g3c"];
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
  m.womb = w; m.wombN = w.reduce((a, b) => a + b, 0);
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
  if (performance.now() - st.gush < GUSH_MS)                  // 子宮噴回來的那一下：子宮口前一團亮白濺開
    for (const c of flood(f, topCells(f), 18, 11)) put(d, 128, c.x, c.y, hash(c.x, c.y + 9) < .25 ? CUM_SHADE : [255, 255, 255], .95);
}
// 子宮裡的精液：從頸管往子宮底填（往上漫）；填的格數照這一格子宮腔的大小算——WOMB_MAX＝整個子宮腔填滿（腫脹時子宮腔變大也一樣）
function fillWomb(d, w, vol, total) {
  let seeds = [];
  for (let y = 127; y >= 0 && !seeds.length; y--) for (let x = 40; x < 88; x++) if (w[y * 128 + x]) seeds.push([x, y]);
  paintFluid(d, w, flood(w, seeds, Math.round(Math.min(1, vol / WOMB_MAX) * total), 3, true));
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
// 高潮階段：1 陰唇外翻（打開）→ 2 陰蒂勃起（反應 1 階）→ 3 陰道痙攣（2 階，插著）→ 4 子宮高潮（3 階，插著：吸吮＋子宮抽動）
const stage = () => !st.opened ? 0 : 1 + Math.min(st.inserted ? 3 : 1, level());
// 吐精：一口一口（像嘔吐）——陰道口先鼓起一團（heave 0→1），然後一大口湧出來順著往下淌（pour），停一下再下一口；陰道裡的量跟著少
let vomitLeft = 0, heaveT0 = 0, heaveNext = 0;
function startSquirt() {
  st.squirtReady = false;
  vomitLeft = Math.round(SQUIRT_PULSES[0] + Math.random() * (SQUIRT_PULSES[1] - SQUIRT_PULSES[0]) + Math.min(2, st.inside - SQUIRT_FULL));
  st.squirts += 1; st.squirting = 1;
  heaveT0 = performance.now(); heaveNext = 0;
}
function stepVomit(now) {
  if (!st.squirting) return false;
  if (st.inserted || st.inside <= .05 || vomitLeft <= 0) { st.squirting = 0; st.heave = 0; return true; }
  if (heaveNext) { if (now < heaveNext) return false; heaveNext = 0; heaveT0 = now; }
  st.heave = Math.min(1, (now - heaveT0) / HEAVE_MS);
  if (st.heave >= 1) {                                        // 吐出來：一大口
    const v = Math.min(st.inside, .25 + .15 * Math.random());
    st.inside -= v; vomitLeft -= 1; st.heave = 0;
    st.pours.push({ t0: now, v, ph: Math.random() * 6, x: 64.5 + (Math.random() - .5) * 1.2 });
    spray("cum", 64.5, HOLE_Y + 1, 5 + Math.round(v * 10), 1.5, .2, 1.3);   // 吐出來的那一下帶幾滴往外噴
    body.B.v -= 1.0; body.L.v += .5; body.R.v += .4;          // 吐的那一下肚子一縮、腿一抖
    heaveNext = now + HEAVE_PAUSE_MS;
  }
  return true;
}
function drawVomit(d) {
  const now = performance.now();
  pool(d, 64.5, PEE_POOL_Y, st.peePool, PEE_COL, PEE_EDGE, .8);              // 床上的尿
  pool(d, 64.5, POOL_Y, st.vomit, MILK, CUM_SHADE, .95);                     // 屁股下緣床上的那一攤精液（陰莖在前面，擋住的看不到）
  if (st.vomit > 0 && !st.inserted) {                        // 流過的痕跡：陰道口往後流過會陰到屁股
    const w = .8 + Math.min(1.6, st.vomit * 1.2);
    for (let y = HOLE_Y + 1; y <= GROUND; y++) {
      const hw = w * (.75 + .5 * hash(5, y)), cx = 64.5 + Math.sin(y * .5) * .5;
      rowOut(d, y, cx, hw, (u) => u > hw - .8 ? CUM_SHADE : MILK, .9);
    }
  }
  if (st.squirting && st.heave > 0) {                       // 鼓起來的那一團（越鼓越大，快吐出來）
    const r = 1.4 + 2.6 * st.heave ** .8;
    blob(d, 64.5, HOLE_Y + .3 + r * .35, r, 1, true);
    if (!onPen(64 - r * .3, HOLE_Y + .4)) { put(d, 128, 63.5 - r * .3, HOLE_Y - r * .1, CUM_WHITE); put(d, 128, 64 - r * .3, HOLE_Y + .4, [255, 255, 255]); }   // 亮點
  }
  for (const p of st.pours) {                                // 湧出來的那一大口：從陰道口往後淌到屁股下緣，流進那一攤
    const e = now - p.t0, w0 = 3.6 + p.v * 8;                 // 一大口：濃、寬
    const flow = e * .016 + (e / 1000) ** 2 * 12;               // 黏稠：慢慢淌、越來越快
    const front = Math.min(GROUND, HOLE_Y + 3 + flow);
    const wTop = w0 * Math.max(.25, 1 - e / POUR_LIFE_MS);
    for (let y = HOLE_Y + 1; y <= front; y++) {
      const t = (y - HOLE_Y) / Math.max(1, front - HOLE_Y);
      const lump = (hash(Math.round(y - flow), p.ph * 100 | 0) - .5) * 1.6;   // 一團一團的（跟著往下流）
      const hw = Math.max(.6, (wTop * (1 - t) + w0 * .7 * t) / 2 + lump * .5);
      const cx = p.x + Math.sin(y * .25 + p.ph) * .8;
      rowOut(d, y, cx, hw, (u) => u > hw - .8 ? CUM_SHADE : (hash(Math.round(cx + u), y) < .12 ? CUM_WHITE : MILK), .95);
    }
    if (front < GROUND) blob(d, p.x + Math.sin(front * .25 + p.ph) * .8, front, w0 * .62, 1, true);   // 還沒流到屁股：前端一大坨
  }
}

// ---- 身體動作：三個彈簧（左腿、右腿、腹部），p＝往下幾格（負＝往上） ----
// 大腿：彈簧的位置挑 rub_legs.png 的姿勢（真的重畫的大腿：剖面往上抬、上緣變陡、下緣跟著），左半、右半各疊一張
const body = { L: { p: 0, v: 0, k: .22 }, R: { p: 0, v: 0, k: .28 }, B: { p: 0, v: 0, k: .3 } };
function stepBody(now) {
  const orgasm = st.inserted && stage() === 4;              // 子宮高潮：雙腿忍不住往上（一直在抖）
  let moving = false;
  for (const [key, sp] of Object.entries(body)) {
    const rest = key === "B" ? (orgasm ? -.6 : 0) : (orgasm ? -LEG_LIFT + LEG_TREMBLE * Math.sin(now / (key === "L" ? 47 : 59)) : 0);
    sp.v += -sp.k * (sp.p - rest) - .32 * sp.v;
    sp.p += sp.v;
    if (Math.abs(sp.v) > .02 || Math.abs(sp.p - rest) > .05 || Math.abs(sp.p) > .05) moving = true;
  }
  return moving;
}
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const legIdx = (p) => Math.max(LEG0, Math.min(LEG1, Math.round(-p))) - LEG0;
function drawLegs() {
  const l = legIdx(body.L.p), r = legIdx(body.R.p);
  if (l !== -LEG0) ctx.drawImage(sheets.legs, l * 128, 0, 64, 128, 0, 0, 64, 128);
  if (r !== -LEG0) ctx.drawImage(sheets.legs, r * 128 + 64, 0, 64, 128, 64, 0, 64, 128);
}
let bodyBuf = null;
function applyBody() {                                       // 腹部（中間、y<70）整塊微微位移
  const B = body.B.p;
  if (Math.abs(B) < .3) return;
  const img = ctx.getImageData(0, 0, 128, 128), src = img.data;
  if (!bodyBuf) bodyBuf = new Uint8ClampedArray(src.length);
  const out = bodyBuf;
  for (let x = 0; x < 128; x++) {
    const wT = clamp01((Math.abs(x + .5 - 64.5) - 12) / 22);
    for (let y = 0; y < 128; y++) {
      const wB = (1 - wT) * clamp01((70 - y) / 22);
      const sy = y - Math.round(B * wB);
      const o = (y * 128 + x) * 4, k = (Math.max(0, Math.min(127, sy)) * 128 + x) * 4;
      if (sy < 0 || sy > 127) { out[o] = BODY_BG[0]; out[o + 1] = BODY_BG[1]; out[o + 2] = BODY_BG[2]; out[o + 3] = 255; continue; }
      out[o] = src[k]; out[o + 1] = src[k + 1]; out[o + 2] = src[k + 2]; out[o + 3] = src[k + 3];
    }
  }
  src.set(out);
  ctx.putImageData(img, 0, 0);
}
// 動畫：身體彈簧、吐精，有在動才重畫
every(() => {
  if (!sheets) return;
  const now = performance.now();
  const a = stepBody(now), b = stepVomit(now), c0 = stepSprays(), c = stepPee(now) || c0 || now < st.peeUntil + 80;
  for (const p of st.pours) if (now - p.t0 > 450) { const dv = Math.min(p.v - (p.given || 0), p.v * 40 / (POUR_LIFE_MS - 450)); p.given = (p.given || 0) + dv; st.vomit += dv; }   // 流到屁股：那一攤慢慢變大
  st.pours = st.pours.filter((p) => { if (now - p.t0 < POUR_LIFE_MS) return true; st.vomit += p.v - (p.given || 0); return false; });
  if (!st.inserted && st.opened && st.inside > 0 && !st.squirting) { const v = Math.min(st.inside, .0016); st.inside -= v; st.vomit += v; }   // 拔出來後裡面的慢慢流出來
  if (a || b || c || st.pours.length) draw();
}, 40);

const tipNowY = () => Math.round(st.tip) + st.jerk;
const kissing = () => st.inserted && tipNowY() <= cervix0(level()) + .5;            // 龜頭頂到（沒吸的時候的）子宮口
const bobbing = () => st.inserted && level() >= 3 && !kissing();                   // 子宮高潮：子宮口一上一下吸吮（陰道裡沒精液也在吸）
const canSuck = () => st.inside > .02 && st.womb < WOMB_MAX;                       // 吸得到東西
const leakSpray = () => { for (const sx of [-1, 1]) spray("cum", 64.5 + sx * 7, HOLE_Y, 4, 1.2, .3, 1.4); };   // 陰道太滿從陰道口噴出來：兩邊各幾滴
// 子宮滿了被頂：把精液噴回陰道裡（陰道太滿就從陰道口噴出來）
function wombGush() {
  const v = Math.min(GUSH, st.womb);
  st.womb -= v; st.inside = Math.min(INSIDE_MAX, st.inside + v);
  st.gush = performance.now(); st.gushes += 1; emit("gush", {});
  if (st.inside > 1.5) { leakSpray(); st.leak = 1; setTimeout(() => { st.leak = 0; draw(); }, 220); }
  body.B.v += .9; body.L.v -= .5; body.R.v -= .6;             // 肚子一鼓、腿一抖
  setTimeout(draw, GUSH_MS + 20); setTimeout(draw, 920);
}

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
function blob(d, x, y, r, a = 1, out = false) {             // 一坨精液：白、下緣一圈淡灰（厚度）；out＝流出來的（不蓋到陰莖）
  for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) {
    const e = (dx * dx) / (r * r) + (dy * dy) / (r * r * .7);
    if (e <= 1 && !(out && onPen(x + dx, y + dy))) put(d, 128, x + dx, y + dy, e > .55 && dy > 0 ? CUM_SHADE : CUM_WHITE, a);
  }
}
// 露在外面的陰莖（陰道口以下）：畫精液之前先記下來，流出來的精液不畫在上面
const penMask = new Uint8Array(128 * 128), bgMask = new Uint8Array(128 * 128);
function markPen(d) {
  penMask.fill(0);
  for (let y = 88; y < 128; y++) for (let x = 20; x < 108; x++) bgMask[y * 128 + x] = isBg(d, x, y) ? 1 : 0;   // 床（背景）
  for (let y = HOLE_Y - 2; y < 128; y++) for (let x = 50; x < 79; x++) {
    const k = (y * 128 + x) * 4;
    if (d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110 && !isBg(d, x, y)) penMask[y * 128 + x] = 1;
  }
}
const onPen = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < 128 && y < 128 && penMask[y * 128 + x] === 1; };
const penSpan = (y) => { y = Math.round(y); let xl = -1, xr = -1; if (y < 0 || y > 127) return null; for (let x = 50; x < 79; x++) if (penMask[y * 128 + x]) { if (xl < 0) xl = x; xr = x; } return xl < 0 ? null : [xl, xr]; };
// 流出來的一列：中心 cx、半寬 hw；陰莖在前面，擋住的格子不畫
function rowOut(d, y, cx, hw, col, a) {
  for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) { const u = Math.abs(x + .5 - cx); if (u <= hw && !onPen(x, y)) put(d, 128, x, y, col(u), a); }
}
// 床上的一攤（扁扁的橢圓，量越多越寬）：只畫在床上（背景格），身體、陰莖擋住的地方不畫
function pool(d, cx, cy, vol, colIn, colEdge, a) {
  if (vol <= .01) return;
  const rx = Math.min(26, 5 + 10 * Math.sqrt(vol)), ry = Math.min(4.2, 1.5 + 1.4 * Math.sqrt(vol));
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    if (x < 0 || x > 127 || y < 0 || y > 127 || !bgMask[y * 128 + x]) continue;
    const e = ((x + .5 - cx) / (rx + (hash(y, 31) - .5) * 2)) ** 2 + ((y + .5 - cy) / ry) ** 2;
    if (e <= 1) put(d, 128, x, y, e > .62 && y + .5 > cy ? colEdge : colIn, a);
  }
}
// 噴出來的小滴（精液／尿）：飛出去、落在床上（g＝落地那一列）
function spray(kind, x, y, n, vx, vy0, vy1) {
  for (let i = 0; i < n && st.sprays.length < 90; i++)
    st.sprays.push({ kind, x: x + (Math.random() - .5) * 1.5, y, vx: (Math.random() * 2 - 1) * vx, vy: -(vy0 + Math.random() * (vy1 - vy0)), g: (kind === "pee" ? 103 : 98) + Math.random() * 5 });
}
function stepSprays() {
  if (!st.sprays.length) return false;
  for (const q of st.sprays) { q.px = q.x; q.py = q.y; q.x += q.vx; q.y += q.vy; q.vy += SPRAY_G; }
  st.sprays = st.sprays.filter((q) => { if (q.x <= 0 || q.x >= 128) return false; if (q.vy > 0 && q.y >= q.g) { if (q.kind === "cum") st.vomit += .008; return false; } return true; });
  return true;
}
// 尿的強度：一開始很快變強、中間持續、最後慢慢變弱（一道連續的尿）
const peeStrength = (now) => { if (now >= st.peeUntil) return 0; const u = (now - st.peeT0) / PEE_MS; return u < .08 ? u / .08 : u < .65 ? 1 : Math.max(.12, (1 - u) / .35); };
function stepPee(now) {
  if (st.inserted && stage() === 4) {                        // 子宮高潮：尿出來；一直高潮的話隔一陣子再尿
    if (!st.peeNext) st.peeNext = now + 900;
    if (now >= st.peeNext) { emit("pee", {}); st.peeT0 = now; st.peeUntil = now + PEE_MS; st.pees += 1; st.peeNext = now + PEE_MS + rand(PEE_AGAIN); }
  } else st.peeNext = 0;
  const s = peeStrength(now);
  if (s <= 0) return false;
  st.peePool = Math.min(4, st.peePool + .006 * s);
  if (Math.random() < s * .7) spray("pee", st.peeLand || PEE_X, 100 + 5 * s, 1, .9, .3, .9);   // 落在床上濺起來
  return true;
}
function drawSprays(d) {
  const now = performance.now(), s = peeStrength(now);
  if (s > 0) {                                               // 一道尿：從尿道口尿出來、落在前面的床上（朝鏡頭這邊，所以在最前面）；強的時候尿得遠
    let x = PEE_X, y = PEE_Y, vy = -(.15 + .55 * s);
    const vx = .1 * Math.sin(now / 450), end = 100 + 6 * s;
    for (let i = 0; i < 300 && y < end; i++) {
      put(d, 128, x, y, PEE_COL, .92); if (s > .6) put(d, 128, x + 1, y, i % 5 ? PEE_COL : [255, 250, 200], .8);
      x += vx * .5 + Math.sin(now / 90 + y * .4) * .06; y += vy * .5; vy += .11 * .5;
    }
    st.peeLand = x;
  }
  for (const q of st.sprays) {
    if (q.kind === "pee") { put(d, 128, q.x, q.y, PEE_COL, .9); if (q.px !== undefined) put(d, 128, q.px, q.py, PEE_COL, .5); }
    else if (!onPen(q.x, q.y)) { put(d, 128, q.x, q.y, CUM_WHITE, .95); if (q.px !== undefined && !onPen(q.px, q.py)) put(d, 128, q.px, q.py, CUM_SHADE, .7); }
  }
}
function drawCum() {
  if (!st.splats.length && !st.spurt && !st.inside && !st.womb && !st.pours.length && !st.vomit && !st.squirting && !st.drops.length && !st.sprays.length && !st.peePool && performance.now() > st.peeUntil) return;
  const img = ctx.getImageData(0, 0, 128, 128), d = img.data;
  markPen(d);
  for (const sp of st.splats) {                            // 身上的精液：一坨＋往下流一點
    blob(d, sp.x, sp.y, sp.r);
    for (let i = 1; i <= sp.drip; i++) put(d, 128, sp.x + (i > 2 ? .5 : 0), sp.y + sp.r * .6 + i, i % 2 ? CUM_SHADE : CUM_WHITE);
  }
  const tipY = Math.round(st.tip) + st.jerk;
  if (st.womb > 0 && st.inserted) { const m = lumenMask(); if (m) fillWomb(d, m.womb, st.womb, m.wombN); }   // 吸進子宮的精液
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
          const sp = penSpan(HOLE_Y + 2), bx = sp ? (sx < 0 ? sp[0] - 2 : sp[1] + 3) : 64.5 + sx * 6;   // 貼在陰莖兩邊（不蓋到陰莖）
          blob(d, bx, HOLE_Y + 1.5, 1.2 + Math.min(1.4, over * .6), 1, true);
          for (let k = 1; k <= 2 + Math.round(over * 2); k++) if (!onPen(bx, HOLE_Y + 3 + k)) put(d, 128, bx, HOLE_Y + 3 + k, k % 2 ? CUM_SHADE : CUM_WHITE);
        }
      }
    }
    if (st.leak) for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) if (!onPen(64.5 + sx * (6 + k), HOLE_Y - k * .6)) put(d, 128, 64.5 + sx * (6 + k), HOLE_Y - k * .6, CUM_WHITE);   // 噴出來的那一下
  } else if (st.inside && st.opened) {                      // 拔出來：肉穴口流出白色（射越多流越多）
    const v = Math.min(INSIDE_MAX, st.inside);
    blob(d, 64.5, HOLE_Y + 1, 1.4 + v * .7, 1, true);
    for (let i = 0; i < 3 + Math.round(v * 4) && HOLE_Y + 3 + i <= GROUND; i++) rowOut(d, HOLE_Y + 3 + i, 64.5, .6, () => i % 2 ? CUM_SHADE : CUM_WHITE, 1);
  }
  for (const dr of st.drops) blob(d, dr.x, dr.y, dr.r, 1, true);      // 抽插帶出來、往下流的精液
  drawVomit(d);                                              // 陰道吐出來的精液（一口一口往下淌）
  drawSprays(d);                                             // 噴出來的小滴（精液、尿）
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
  const kiss = kissing();                                    // 抖之前就親著才算（不然差 2 格也會被算成親著）
  st.jerk = -2;                                              // 往前抖一下
  setTimeout(() => { st.jerk = 0; draw(); }, JERK_MS);
  if (st.inserted && kiss) {                            // 子宮口親著龜頭時射：直接灌進子宮
    st.spurt = null;
    st.womb = Math.min(WOMB_MAX, st.womb + 1 / SHOTS);
    if (st.womb >= WOMB_MAX) st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS);   // 子宮滿了才往陰道裡流
  } else if (st.inserted) {                                  // 內射：一股從龜頭射到子宮口旁的空間（不直接進子宮；之後子宮口會吸）
    const c0 = cervix0(level()), cerv = c0 - Math.max(0, c0 - tipY);
    st.spurt = { inside: true, seed: Math.floor(Math.random() * 1000), t0: performance.now(), y0: tipY - 2, y1: Math.min(tipY - 2, Math.round(cerv + 1)) };
    const fly = setInterval(() => { if (!st.spurt || performance.now() - st.spurt.t0 > SPURT_FLY_MS + 40) clearInterval(fly); draw(); }, 30);
    const before = st.inside;
    st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS);
    if (st.inside > 1.5 && before <= st.inside) { leakSpray(); st.leak = 1; setTimeout(() => { st.leak = 0; draw(); }, 220); }   // 太多：噴出來
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
  if (Math.random() < .5) spray("cum", 64.5 + sx * 7, HOLE_Y + 1, 1 + Math.round(Math.random()), 1, .2, .9);   // 帶出來時噴一兩滴
  st.inside = Math.max(0, st.inside - .03);                    // 帶出來的那一滴是從裡面少掉的
  st.drops.push({ x: 64.5 + sx * (7 + Math.random() * 1.5), y: HOLE_Y + 1, r: .9 + Math.random() * .7, vy: .35 + Math.random() * .25 });
  if (!dropTimer) dropTimer = setInterval(() => {
    for (const dr of st.drops) { dr.y += dr.vy; dr.vy += .05; }
    st.drops = st.drops.filter((dr) => { if (dr.y < GROUND + 1) return true; st.vomit += .03; return false; });   // 流到屁股下緣：進那一攤
    if (!st.drops.length) { clearInterval(dropTimer); dropTimer = 0; }
    draw();
  }, 50);
}

function maybeShoot() {
  if (st.cum >= 1 && !st.shooting && !st.locked) {
    st.shooting = SHOTS; st.ejacs += 1;
    emit("ejac", { where: st.inserted ? (kissing() ? "womb" : "inside") : "outside", count: st.ejacs });
    shootOnce();
  }
}

function toGrid(ev) {
  const r = cv.getBoundingClientRect();
  return { x: (ev.clientX - r.left) / r.width * 128, y: (ev.clientY - r.top) / r.height * 128 };
}

// 碰著陰唇時移動就累積摩擦距離（磨的當下就會打開，陰莖不用離開）
function track(prev, next) {
  if (Math.min(prev, next) >= CONTACT_BELOW) return;
  if (!st.inserted) { st.rubTravel += Math.abs(next - prev); while (st.rubTravel >= THRUST_PX) { st.rubTravel -= THRUST_PX; emit("rub", { opened: st.opened }); } }
  if (st.opened) {                                           // 打開後在外面繼續磨：反應慢慢上來（最多到陰蒂勃起）
    if (!st.inserted && st.react < RUB_REACT_CAP) st.react = Math.min(RUB_REACT_CAP, st.react + Math.abs(next - prev) * REACT_PER_PX * .5 * mul(opts.reactMul));
    return;
  }
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
  if (st.locked || !sheets) return;
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
    st.react = Math.min(REACT_MAX + .99, st.react + Math.abs(next - st.tip) * REACT_PER_PX * mul(opts.reactMul));
    st.thrustTravel += Math.abs(next - st.tip);
    while (st.thrustTravel >= THRUST_PX) { st.thrustTravel -= THRUST_PX; st.thrusts += 1; emit("thrust", { count: st.thrusts }); }
    if (next > st.tip) st.pullAt = performance.now(); else st.pullAt = 0;
    const dd = next - st.tip;                                // 抽插：大腿跟著上下（左右不一樣＝扭）、腹部跟著被頂
    body.L.v += dd * .11; body.R.v += dd * .07; body.B.v += dd * .05;
    if (dd < 0 && next <= cervix0(level()) && st.womb >= WOMB_MAX - .01) wombGush();   // 子宮滿了被頂到子宮口
  }
  st.moveAt = performance.now();
  if (st.inserted && next > st.tip && st.inside > 1 && Math.random() < .35 + .2 * Math.min(1, st.inside - 1)) spawnDrop();   // 往外抽：帶出精液
  track(st.tip, next);
  if (!st.shooting && (st.inserted || Math.min(st.tip, next) < CONTACT_BELOW)) st.cum = Math.min(1, st.cum + Math.abs(next - st.tip) * CUM_PER_PX * mul(opts.cumMul));   // 磨／抽送：尿道慢慢漲精液
  st.tip = next;
  const wasIn = st.inserted;
  if (st.opened && st.openStep >= 2) {
    if (st.tip >= AT_HOLE) { st.inserted = false; st.armed = true; }        // 拉到肉穴口（或拉出來）＝對準
    else if (st.armed || st.inserted) { st.inserted = st.tip <= INS1; }     // 對準後往上推＝插進去
    if (!st.inserted && st.tip < AT_HOLE && !canIn) st.armed = false;
  }
  if (wasIn !== st.inserted) emit(st.inserted ? "insert" : "pullout", {});
  if (wasIn && !st.inserted && st.squirtReady) { startSquirt(); emit("squirt", {}); }   // 拔出來：痙攣過又滿滿的＝陰道吐出精液
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
function reset() {
  clearInterval(openTimer);
  vomitLeft = 0; heaveNext = 0;
  for (const sp of Object.values(body)) { sp.p = 0; sp.v = 0; }
  const keep = st.locked;
  Object.assign(st, fresh(), { locked: keep });
  lastStage = -1;
  draw();
}
section.querySelector(".sexpix-reset").addEventListener("click", reset);

// 停下來：「拖出來」那條換回來；一陣子沒抽送，收緊／勃起慢慢退
let lastShown = "";
every(() => {
  if (!sheets) return;
  const now = performance.now();
  if (st.react > 0 && !st.drag && now - st.moveAt > REACT_IDLE_MS) st.react = Math.max(0, st.react - REACT_DECAY / 4);
  const shown = `${st.inserted}|${level()}|${now - st.pullAt < PULL_SHOW_MS}`;
  if (shown !== lastShown) { lastShown = shown; draw(); }
}, 250);
every(() => { if (st.pullAt && performance.now() - st.pullAt >= PULL_SHOW_MS && st.inserted) { st.pullAt = 0; draw(); } }, 60);

// 痙攣排程：到 2 階以上才會抖；每一陣抖幾下（夾 → 鬆），抖完隔一陣子再來
const rand = ([a, b]) => a + Math.random() * (b - a);
every(() => {
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
    st.spasm = true; st.spasms += 1;
    body.L.v -= .6; body.R.v -= .45; body.B.v -= .25;          // 痙攣：腿一抽
    if (st.inside >= SQUIRT_FULL) st.squirtReady = true;      // 陰道裡滿滿的精液時痙攣：拔出來會噴
    draw();
    setTimeout(() => {
      st.spasm = false; st.spasmLeft -= 1; draw();
      if (st.spasmLeft > 0) setTimeout(twitch, SPASM_OFF_MS);
      else st.spasmNext = performance.now() + rand(SPASM_GAP[level()] || SPASM_GAP[2]);
    }, SPASM_ON_MS);
  };
  twitch();
}, 100);

// 子宮抽動排程（子宮高潮）：3 階插著就一陣一陣抽，不會結束（反應退下去才停）；每抽一下大腿往上一抬
every(() => {
  const now = performance.now();
  if (!sheets || !st.inserted || level() < 3) {
    if (st.cramp || st.crampLeft) { st.cramp = false; st.crampLeft = 0; draw(); }
    st.crampNext = 0; st.crampBursts = 0; return;
  }
  if (!st.crampNext) st.crampNext = now + 500;               // 進子宮高潮：先吸一下，然後開始抽
  if (st.crampLeft || now < st.crampNext) return;
  st.crampLeft = Math.round(rand(CRAMP_N));
  st.crampBursts += 1;
  if (st.crampBursts % ORGASM_EVERY === 1) { st.orgasms += 1; emit("orgasm", { count: st.orgasms, burst: st.crampBursts }); }
  const twitch = () => {
    if (!st.crampLeft || !st.inserted || level() < 3) { st.cramp = false; st.crampLeft = 0; draw(); return; }
    st.cramp = true; st.cramps += 1;
    body.L.v -= 1.5; body.R.v -= 1.2; body.B.v -= .5;        // 子宮一抽：大腿往上一抬、肚子一縮
    draw();
    setTimeout(() => {
      st.cramp = false; st.crampLeft -= 1; draw();
      if (st.crampLeft > 0) setTimeout(twitch, CRAMP_OFF_MS);
      else st.crampNext = performance.now() + rand(CRAMP_GAP);
    }, CRAMP_ON_MS);
  };
  twitch();
}, 100);

// 子宮口吸吮：一上一下，往上那一下從陰道吸一點進子宮；龜頭頂著子宮口時＝親著龜頭、飄愛心
let heartAt = 0;
every(() => {
  if (!sheets) return;
  const now = performance.now();
  if (bobbing()) {
    st.bob = !st.bob;
    if (st.bob && canSuck()) { const v = Math.min(SUCK_PER_BOB, st.inside, WOMB_MAX - st.womb); st.inside -= v; st.womb += v; st.sucks += 1; }
    draw();
  } else if (st.bob) { st.bob = false; draw(); }
  if (kissing() && now - heartAt > HEART_EVERY_MS) {
    heartAt = now; st.kisses += 1;
    st.hearts.push({ x: 64.5 + (Math.random() * 2 - 1) * 5, y: tipNowY() - 3, t0: now, ph: Math.random() * 6 });
  }
}, BOB_MS);
every(() => {                                          // 愛心動畫
  if (!st.hearts.length) return;
  const now = performance.now();
  st.hearts = st.hearts.filter((h) => now - h.t0 < HEART_LIFE_MS);
  draw();
}, 60);

// 陰唇顏色：粉色以外把小陰唇肉瓣那五個顏色換掉（整條圖片條換一次）
function recolor(im) {
  const to = LABCOL[look.labcol];
  if (!to) return im;
  const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
  const x = c.getContext("2d"); x.drawImage(im, 0, 0);
  const img = x.getImageData(0, 0, c.width, c.height), d = img.data;
  const key = (r, g, bl) => (r << 16) | (g << 8) | bl, map = new Map(LABCOL.from.map((f, k) => [key(...f), to[k]]));
  for (let k = 0; k < d.length; k += 4) { if (!d[k + 3]) continue; const t = map.get(key(d[k], d[k + 1], d[k + 2])); if (t) { d[k] = t[0]; d[k + 1] = t[1]; d[k + 2] = t[2]; } }
  x.putImageData(img, 0, 0);
  return c;
}
const INS_NAMES = ["insert", "g1", "g2", "g3", "g1p", "g2p", "g3p", "g2s", "g3s", "g3u", "g3c"];
const url = (n) => `/sexpix/${n}.png?v=${SEXPIX_VER}`;
const gk = `g_${look.labia}`, vk = `v${VKEY[look.vlen]}`;
const ready = Promise.all([
  load(url(`body_${look.build}`)), load(url(`legs_${look.build}`)), load(url(`clit_${look.clit}`)), load(url(`lumen_${vk}`)),
  ...["closed", "a35", "a70", "open"].map((n) => load(url(`${gk}_${n}`))),
  ...INS_NAMES.map((n) => load(url(`${gk}_${vk}_${n}`))),
]).then(([bodyImg, legs, clit, lumen, closed, a35, a70, open, ...ins]) => {
  if (dead) return;
  const [insert, g1, g2, g3, p1, p2, p3, s2, s3, u3, c3] = ins.map(recolor);
  lumenImg = lumen;
  sheets = { body: bodyImg, legs, clit, closed: recolor(closed), a35: recolor(a35), a70: recolor(a70), open: recolor(open), insert,
    grip: [null, g1, g2, g3], pull: [null, p1, p2, p3], spasm: [null, null, s2, s3], bob: [null, null, null, u3], cramp: [null, null, null, c3] };
  draw();
}).catch((e) => { info.hidden = false; info.textContent = e.message; console.error(e); });

const api = {
  el: section,
  ready,
  look,
  state: () => ({ ...st, drag: !!st.drag, level: level(), stage: stage() }),
  set: (o) => { Object.assign(st, o); draw(); },     // 除錯用：直接改狀態（例 set({ react: 2.5, inside: 1.6 })）
  reset,
  lock: (on = true) => { st.locked = !!on; if (on) { st.drag = null; cv.style.cursor = "default"; } else cv.style.cursor = "grab"; },
  destroy: () => { dead = true; for (const id of timers) clearInterval(id); clearInterval(openTimer); clearInterval(dropTimer); section.remove(); },
};
return api;
}
