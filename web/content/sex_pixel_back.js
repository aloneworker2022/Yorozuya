// 「肏」像素互動・背後體位（2026-11-11 使用者）：她跪著翹起屁股、背對玩家；第一人稱往下看——畫面最底是玩家的腹部，陰莖從腹部往上。
// 介面、事件跟正面的 sex_pixel.js 一樣（mountSexPixelBack(host, opts) → { el, ready, look, state(), set(o), reset(), lock(on), destroy() }），房間照體位挑一個掛。
// 操作：
//   一隻手指上下拖＝前後扭腰（往前 FWD、往後 BACK 格；插進去以後也一樣，不會變大）。腹部、陰莖整組一起動。
//   兩隻手指一左一右按在兩瓣屁股上一起往下拖＝把她的臀部往後拉（臀部翹起 → 過渡格 → 臀部往後），放開就回去；
//     臀部往後時肉穴整個往玩家這邊靠，腰不用多動陰莖就進得更深（頂到子宮口只有臀部往後才頂得到）。
//   臀部往後而且腹部頂到屁股＝撞上去：屁股壓扁那張，撞上去那一下像果凍晃一下。
//   磨蹭：陰唇閉著時龜頭往前是伸進她兩腿間（被臀部、陰唇擋住看不到），碰著陰唇每移動 RUB_PX 格算一下，磨 4 下陰唇打開（跟正面一樣）。
//   打開後往前：龜頭頂在肉穴上（疊在陰唇前面），再往前過了肉穴就插進去；陰唇照陰莖的形狀撐開，肉穴以上那段在體內（透視）。
// 射精、陰道／子宮高潮照正面（尿不做）：尿道精液漲滿就射 4 股；內射照陰道形狀流、親著子宮口直接灌進子宮；
//   高潮四階：陰唇外翻 → 陰蒂勃起（背後看不到，只有階段）→ 陰道痙攣 → 子宮高潮（腫脹下降、吸吮、一抽一抽，可連續）；
//   子宮滿了再被頂把精液噴回陰道；痙攣過又滿滿的拔出來，陰道一口一口吐出精液，流到兩個膝蓋中間的床上。
// 圖（tools/droom_groin/back/gen_sexpix_back.py → web/sexpix/back/）：
//   her_<陰唇>_up.png  臀部翹起：閉著、打開 0.35、0.7、全開（陰唇＝line 一線鮑／mid 一般／butterfly 蝴蝶）
//   her_<陰唇>_mid.png 過渡格：閉著、打開；her_<陰唇>_sb.png 臀部往後：閉著、打開
//   her_<陰唇>_sq.png  撞到腹部壓扁（0.6～1.5 倍六張；上列閉著、下列打開）
//   ins_v<長度>.png    體內那一層（正面 trace128.py 插入 11 條 XRAY 相減出來的，正面座標，龜頭頂 54～84 每格一張）；陰道空間遮罩用正面的 /sexpix/lumen_v<長度>.png
// opts：look（pixelLookFor：labia small|mid|large → line|mid|butterfly、labcol pink|brown|dark、vlen 0.5|1|1.5；體型、陰蒂背後沒用到）
//       on(type, data)  事件：stage／insert／pullout／thrust／rub／ejac {where}／orgasm {count}／squirt／gush（沒有 pee）
//       reactMul()／cumMul()、crop、info、resetButton、canvasId／infoId（跟正面一樣）

export const SEXPIX_BACK_VER = 1;      // 改圖後 +1（圖片網址 ?v=）
const N = 128, MID = 64, BG = [40, 34, 50], EDGE = [70, 62, 82], BASE = [20, 18, 26], SKIN = [242, 204, 177];
const GLANS = 9.5, REST_TIP = 78, FWD = 16, BACK = 6;
const INS0 = 54, INS1 = 84;
// 三個姿勢：1 臀部翹起、1.5 過渡格、2 臀部往後。INS_DY＝正面座標 → 背後座標要移幾格；APEX＝陰唇開口最上面的尖；ENT＝肉穴那一列；CLIP＝陰唇底（閉著時龜頭過了這列就被擋住）
const POSE = { 1: { CLIP: 75, ENT: 74, INS_DY: -13, INS_TIP: 71, ANUS: [65, 66], APEX: 67 }, 1.5: { CLIP: 85, ENT: 84, INS_DY: -3, INS_TIP: 81, ANUS: [75, 76], APEX: 77 }, 2: { CLIP: 94, ENT: 93, INS_DY: 6, INS_TIP: 90, ANUS: [85, 86], APEX: 89 } };
const PULL_PX = 19, HIT_ROW = 99;
const WOB_SEQ = [5, 0, 4, 1, 3, 2], WOB_MS = 70;
const BELLY = { cx: 64, cy: 152, rx: 60, ry: 43 };
const RUB_PX = 8, RUB_NEED = 4, STEP_MS = 110;
// 背後腰的幅度只有正面的大約 2/5：插著時「每移動一格」漲得比正面快 K 倍，抽一下的份量才跟正面差不多（在外面磨照正面的速度）
const K = 2.5;
const CUM_PER_PX = 1 / 160, CUM_PER_PX_IN = K / 160, REACT_PER_PX = K / 60, REACT_MAX = 3, REACT_IDLE_MS = 1500, REACT_DECAY = .15, RUB_REACT_CAP = 1.99;
const THRUST_STEP = 44 / K;            // 插著（或碰著陰唇）每移動幾格算「一下」（正面 THRUST_PX 換成背後的幅度）
const URETHRA_EMPTY = [56, 48, 66], CUM_WHITE = [250, 248, 252], CUM_SHADE = [214, 212, 226], MILK = [246, 240, 236];
const SHOTS = 4, SHOT_MS = 380, JERK_MS = 140, INSIDE_MAX = 3, LUMEN_PX_PER_SHOT = 7, SPURT_FLY_MS = 150, PULL_SHOW_MS = 180;
const SPASM_GAP = { 2: [2600, 5200], 3: [1200, 3000] }, SPASM_N = { 2: [2, 3], 3: [3, 5] }, SPASM_ON_MS = 130, SPASM_OFF_MS = 210;
const DESC_BY_LV = [0, 0, 0, 7], LIFT_PER_LV = 2, BOB_UP = 3, BOB_MS = 260, SUCK_PER_BOB = .04, WOMB_MAX = 2, GUSH = .5, GUSH_MS = 320;
const CRAMP_GAP = [1400, 3200], CRAMP_N = [2, 4], CRAMP_ON_MS = 150, CRAMP_OFF_MS = 230, ORGASM_EVERY = 3;
const HEART_EVERY_MS = 420, HEART_LIFE_MS = 1400, HEART = ["01010", "11111", "11111", "01110", "00100"];
const SQUIRT_FULL = 1, SQUIRT_PULSES = [3, 5], HEAVE_MS = 280, HEAVE_PAUSE_MS = 320, POUR_LIFE_MS = 1500, SPRAY_G = .13;
const STAGES = ["", "陰唇外翻", "陰蒂勃起", "陰道痙攣", "子宮高潮"];
const LUMEN_ROWS = ["insert", "g1", "g1p", "g2", "g2p", "g2s", "g3", "g3p", "g3s", "g3u", "g3c"];
const VKEY = { 0.5: "05", 1: "10", 1.5: "15" };
const LAB_KIND = { small: "line", mid: "mid", large: "butterfly" };
// 陰唇的三個顏色（外緣、裡面、縫）：粉 → 淺褐／深褐（圖片載進來時換）
const LABCOL = {
  pink: [[196, 108, 118], [230, 168, 168], [170, 84, 98]],
  brown: [[150, 92, 86], [200, 142, 130], [120, 66, 62]],
  dark: [[96, 62, 66], [146, 104, 104], [70, 42, 46]],
};

export function mountSexPixelBack(host, opts = {}) {
const look = { labia: "mid", labcol: "pink", vlen: 1, ...(opts.look || {}) };
if (!VKEY[look.vlen]) look.vlen = 1;
if (!LABCOL[look.labcol]) look.labcol = "pink";
const lab = LAB_KIND[look.labia] || "mid";
const LAB = LABCOL[look.labcol];
const emit = (type, data = {}) => { try { opts.on && opts.on(type, data); } catch (err) { console.warn("[sexpix-back]", type, err); } };
const mul = (f) => { const v = typeof f === "function" ? Number(f()) : 1; return Number.isFinite(v) && v > 0 ? v : 1; };
let dead = false;
const timers = [];
const every = (fn, ms) => { const id = setInterval(() => { if (!dead) fn(); }, ms); timers.push(id); return id; };
const later = (fn, ms) => setTimeout(() => { if (!dead) fn(); }, ms);
const CERV_BASE = look.vlen === 1 ? 60 : 87.4 - 27.4 * look.vlen;   // 子宮口（正面座標，跟 trace128.py 一樣）

const section = document.createElement("div");
section.className = "sexpix sexpix-back";
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
if (opts.crop) {
  const { x = 0, y = 0, w = 128, h = 128 } = opts.crop;
  const win = document.createElement("div");
  win.className = "sexpix-crop";
  win.style.cssText = `position:relative;width:100%;aspect-ratio:${w}/${h};overflow:hidden;border-radius:6px;background:#28222f;touch-action:none`;
  cv.style.cssText += `;position:absolute;width:${(128 / w) * 100}%;height:auto;left:${(-x / w) * 100}%;top:${(-y / h) * 100}%;border-radius:0`;
  cv.parentElement.replaceWith(win);
  win.append(cv);
  section.prepend(win);
  if (opts.info === false && !opts.resetButton) section.querySelector(".sexpix-row").hidden = true;
}
const ctx = cv.getContext("2d");

// ---- 圖 ----
let IM = null;
const load = (src) => new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = () => reject(new Error(`載不到 ${src}`)); im.src = src; });
function slice(img, cols, rows, recolor) {
  const t = document.createElement("canvas"); t.width = cols * N; t.height = rows * N;
  const tc = t.getContext("2d", { willReadFrequently: true }); tc.drawImage(img, 0, 0);
  const map = recolor && look.labcol !== "pink" ? new Map(LABCOL.pink.map((f, k) => [(f[0] << 16) | (f[1] << 8) | f[2], LAB[k]])) : null;
  const out = [];
  for (let j = 0; j < rows; j++) {
    const r = [];
    for (let i = 0; i < cols; i++) {
      const d = tc.getImageData(i * N, j * N, N, N).data.slice();
      if (map) for (let k = 0; k < d.length; k += 4) { const c = map.get((d[k] << 16) | (d[k + 1] << 8) | d[k + 2]); if (c) { d[k] = c[0]; d[k + 1] = c[1]; d[k + 2] = c[2]; } }
      r.push(d);
    }
    out.push(r);
  }
  return out;
}

// ---- 狀態 ----
const fresh = () => ({ off: 0, pull: 0, stage: 0, rubs: 0, acc: 0, opening: false, locked: false,
  cum: 0, shooting: 0, spurt: null, splats: [], inside: 0, jerk: 0, leak: 0, drops: [], react: 0, pullAt: 0, moveAt: 0,
  spasm: false, spasmLeft: 0, spasmNext: 0, spasms: 0, womb: 0, bob: false, sucks: 0, cramp: false, crampLeft: 0, crampNext: 0, crampBursts: 0, cramps: 0, orgasms: 0,
  gush: -1e9, gushes: 0, hearts: [], kisses: 0, squirtReady: false, squirting: 0, squirts: 0, heave: 0, pours: [], vomit: 0, sprays: [],
  thrusts: 0, ejacs: 0, thrustTravel: 0, rubTravel: 0 });
let st = fresh(), wob = null, wasHit = false, lastStage = -1;
const level = () => Math.min(REACT_MAX, Math.floor(st.react));
const pose = () => st.pull < 1 / 3 ? 1 : st.pull < 2 / 3 ? 1.5 : 2;
// 現在的幾何：dy＝腹部和陰莖整組往上幾格；tip＝龜頭頂（背後座標）；ft＝換成正面座標的龜頭頂（挑體內那一層、算子宮口）
function G() {
  const ps = pose(), p = POSE[ps], dy = -Math.round(st.off) + st.jerk, tip = REST_TIP + dy;
  return { ps, p, dy, tip, ft: tip - p.INS_DY, inside: st.stage === 3 && tip <= p.INS_TIP, belly: BELLY.cy - BELLY.ry + dy };
}
const stageNo = () => st.stage < 3 ? 0 : 1 + Math.min(G().inside ? 3 : 1, level());
const hit = () => { const g = G(); return g.ps === 2 && g.belly <= HIT_ROW; };
const cervix0 = (lv, bob = false) => CERV_BASE - LIFT_PER_LV * lv + DESC_BY_LV[lv] - (bob ? BOB_UP : 0);   // 正面座標
const kissing = () => { const g = G(); return g.inside && g.ft <= cervix0(level()) + .5; };
const bobbing = () => G().inside && level() >= 3 && !kissing();
const canSuck = () => st.inside > .02 && st.womb < WOMB_MAX;
const rand = ([a, b]) => a + Math.random() * (b - a);
const hash = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263, 1274126177); h ^= h >>> 15; h = Math.imul(h, 2246822519); return ((h ^ (h >>> 13)) >>> 0) / 4294967296; };

function mask(tip, dy) {                                     // 腹部＋陰莖的剪影
  const m = new Uint8Array(N * N), cor = tip + GLANS, top = BELLY.cy - BELLY.ry + dy;
  const shaft = (y) => 4.8 + 1.4 * Math.min(1, (y - cor) / (N - cor));
  const glans = (y) => { const t = (y - tip) / GLANS; return t >= 0 ? 5.9 * Math.sqrt(Math.max(0, Math.sin(Math.PI / 2 * Math.min(1, t * 1.25)))) : 0; };
  for (let y = Math.max(0, Math.floor(tip)); y < Math.min(N, Math.floor(top) + 3); y++) {
    const w = y < cor ? glans(y + .5) : shaft(y + .5);
    for (let x = MID - 8; x <= MID + 8; x++) if (Math.abs(x + .5 - MID) <= w) m[y * N + x] = 1;
  }
  for (let y = Math.max(0, Math.floor(top)); y < N; y++) for (let x = 0; x < N; x++)
    if (((x + .5 - BELLY.cx) / BELLY.rx) ** 2 + ((y + .5 - (BELLY.cy + dy)) / BELLY.ry) ** 2 <= 1) m[y * N + x] = 1;
  return m;
}
const isCol = (d, i, c) => d[i] === c[0] && d[i + 1] === c[1] && d[i + 2] === c[2];
const put = (d, x, y, c, a = 1) => { x = Math.round(x); y = Math.round(y); if (x < 0 || y < 0 || x >= N || y >= N) return; const k = (y * N + x) * 4; for (let j = 0; j < 3; j++) d[k + j] = d[k + j] * (1 - a) + c[j] * a; };
const isBg = (d, x, y) => { const k = (y * N + x) * 4; return Math.abs(d[k] - BG[0]) < 6 && Math.abs(d[k + 1] - BG[1]) < 6 && Math.abs(d[k + 2] - BG[2]) < 6; };
const dark = (d, x, y) => { const k = (y * N + x) * 4; return d[k] < 90 && d[k + 1] < 90 && d[k + 2] < 110; };

// 這一格體內用哪一條（照正面：痙攣 > 往外抽 > 子宮抽動 > 吸吮 > 收緊）
const cur = { row: 0, frame: 0 };
function pickRow(g) {
  const lv = level(), pulling = performance.now() - st.pullAt < PULL_SHOW_MS;
  let v = "insert";
  if (lv) {
    const sp = st.spasm && lv >= 2, cr = !sp && !pulling && st.cramp && lv >= 3, bo = !sp && !pulling && !cr && st.bob && lv >= 3;
    v = `g${lv}${sp ? "s" : pulling ? "p" : cr ? "c" : bo ? "u" : ""}`;
  }
  cur.row = LUMEN_ROWS.indexOf(v); cur.frame = Math.max(0, Math.min(INS1 - INS0, g.ft - INS0));
}
// 陰道空間遮罩（正面的 lumen，移到背後座標）：1＝陰道裡空著；.womb＝子宮腔
const lumenCache = new Map();
function lumenMask(g) {
  const key = `${cur.row}|${cur.frame}|${g.p.INS_DY}`;
  if (lumenCache.has(key)) return lumenCache.get(key);
  const src = IM.lumen[cur.row][cur.frame], m = new Uint8Array(N * N), w = new Uint8Array(N * N);
  for (let y = 0; y < N; y++) {
    const ty = y + g.p.INS_DY; if (ty < 0 || ty >= g.p.ENT) continue;
    for (let x = 0; x < N; x++) { const s = (y * N + x) * 4; m[ty * N + x] = src[s] > 128 ? 1 : 0; w[ty * N + x] = src[s + 1] > 128 ? 1 : 0; }
  }
  m.womb = w; m.wombN = w.reduce((a, b) => a + b, 0); lumenCache.set(key, m);
  return m;
}
function fluidMask(m) { const f = new Uint8Array(m); for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) { const k = y * N + x; if (!m[k] && m[k - N] && m[k + N]) f[k] = 1; } return f; }
function flood(f, seeds, count, seed = 0, up = false) {
  const done = new Uint8Array(N * N), out = [], front = [];
  const key = (x, y) => (up ? -y : y) - (!f[y * N + x - 1] || !f[y * N + x + 1] ? 1.3 : 0) + hash(x + seed, y) * 1.8;
  const push = (x, y) => { const k = y * N + x; if (x < 1 || x > N - 2 || y < 1 || y > N - 2 || !f[k] || done[k]) return; done[k] = 1; front.push({ x, y, k: key(x, y) }); };
  for (const [x, y] of seeds) push(x, y);
  while (out.length < count && front.length) {
    let bi = 0; for (let i = 1; i < front.length; i++) if (front[i].k < front[bi].k) bi = i;
    const c = front.splice(bi, 1)[0]; out.push(c);
    push(c.x, c.y + 1); push(c.x - 1, c.y); push(c.x + 1, c.y); push(c.x, c.y - 1);
  }
  return out;
}
function paintFluid(d, f, cells) {
  const on = new Uint8Array(N * N); for (const c of cells) on[c.y * N + c.x] = 1;
  for (const { x, y } of cells) {
    const fr = [[0, 1], [1, 0], [-1, 0]].some(([dx, dy]) => f[(y + dy) * N + x + dx] && !on[(y + dy) * N + x + dx]);
    put(d, x, y, fr ? [226, 220, 230] : hash(x, y + 3) < .15 ? CUM_WHITE : MILK, fr ? .8 : .92);
  }
}
const topCells = (f) => { for (let y = 0; y < N; y++) { const r = []; for (let x = 40; x < 88; x++) if (f[y * N + x]) r.push([x, y]); if (r.length) return r; } return []; };
function fillWomb(d, w, vol, total) { const seeds = []; for (let y = N - 1; y >= 0 && !seeds.length; y--) for (let x = 40; x < 88; x++) if (w[y * N + x]) seeds.push([x, y]); paintFluid(d, w, flood(w, seeds, Math.round(Math.min(1, vol / WOMB_MAX) * total), 3, true)); }

// 陰莖、腹部在她前面：流出來的精液不畫在上面
const penMask = new Uint8Array(N * N), bgMask = new Uint8Array(N * N);
function markPen(d, g) { penMask.fill(0); for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { bgMask[y * N + x] = isBg(d, x, y) ? 1 : 0; if (y >= g.p.ENT - 2 && dark(d, x, y) && !bgMask[y * N + x]) penMask[y * N + x] = 1; } }
const onPen = (x, y) => { x = Math.round(x); y = Math.round(y); return x >= 0 && y >= 0 && x < N && y < N && penMask[y * N + x] === 1; };
const penSpan = (y) => { y = Math.round(y); let xl = -1, xr = -1; if (y < 0 || y > N - 1) return null; for (let x = 50; x < 79; x++) if (penMask[y * N + x]) { if (xl < 0) xl = x; xr = x; } return xl < 0 ? null : [xl, xr]; };
function blob(d, x, y, r, a = 1, out = false) { for (let dy = -Math.ceil(r); dy <= Math.ceil(r); dy++) for (let dx = -Math.ceil(r); dx <= Math.ceil(r); dx++) { const e = (dx * dx) / (r * r) + (dy * dy) / (r * r * .7); if (e <= 1 && !(out && onPen(x + dx, y + dy))) put(d, x + dx, y + dy, e > .55 && dy > 0 ? CUM_SHADE : CUM_WHITE, a); } }
function rowOut(d, y, cx, hw, col, a) { for (let x = Math.floor(cx - hw); x <= Math.ceil(cx + hw); x++) { const u = Math.abs(x + .5 - cx); if (u <= hw && !onPen(x, y)) put(d, x, y, col(u), a); } }
function pool(d, cx, cy, vol) {                              // 床上一攤（兩個膝蓋中間的床，只畫在底色上）
  if (vol <= .01) return;
  const rx = Math.min(22, 4 + 9 * Math.sqrt(vol)), ry = Math.min(3.6, 1.3 + 1.2 * Math.sqrt(vol));
  for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
    if (x < 0 || x > N - 1 || y < 0 || y > N - 1 || !bgMask[y * N + x]) continue;
    const e = ((x + .5 - cx) / (rx + (hash(y, 31) - .5) * 2)) ** 2 + ((y + .5 - cy) / ry) ** 2;
    if (e <= 1) put(d, x, y, e > .62 && y + .5 > cy ? CUM_SHADE : MILK, .95);
  }
}
const holeY = (g) => g.p.ENT - 1, groundY = (g) => g.p.ENT + 14, poolY = (g) => g.p.ENT + 30;
function spray(x, y, n, vx, vy0, vy1) { const g = G(); for (let i = 0; i < n && st.sprays.length < 90; i++) st.sprays.push({ x: x + (Math.random() - .5) * 1.5, y, vx: (Math.random() * 2 - 1) * vx, vy: -(vy0 + Math.random() * (vy1 - vy0)), g: poolY(g) - 2 + Math.random() * 4 }); }

// ---- 畫 ----
function draw() {
  if (!IM || dead) return;
  const g = G(), hn = hit(), P = g.p;
  if (hn && !wasHit) { wob = performance.now(); requestAnimationFrame(tickWob); }
  if (!hn) wob = null;
  wasHit = hn;
  const lipOpen = st.stage === 3 ? 1 : 0;
  const her = g.ps === 2 ? (hn ? IM.sq[lipOpen][wobIdx()] : IM.sb[0][lipOpen]) : g.ps === 1.5 ? IM.mid[0][lipOpen] : IM.up[0][st.stage];
  const out = new ImageData(new Uint8ClampedArray(her), N, N), d = out.data;
  const m = mask(g.tip, g.dy), vis = new Uint8Array(N * N), open = st.stage === 3, inside = g.inside;
  const clip = !open ? P.CLIP : inside ? P.ENT - 2 : 0;       // 閉著：伸進兩腿間被擋住；打開：頂在肉穴上；插進去：肉穴以上在體內
  if (inside) {
    let pw = 0; for (let x = 0; x < N; x++) if (m[P.ENT * N + x]) pw++;
    pw = Math.min(6, pw / 2);                                // 肉穴那一列陰莖的半寬
    for (let y = P.APEX; y <= P.ENT; y++) for (let u = -8; u <= 8; u++) {   // 原本打開的陰唇擦掉（開口改跟陰莖走）
      const i = (y * N + MID + u) * 4;
      if (LAB.some((c) => isCol(d, i, c)) || isCol(d, i, [110, 30, 50]) || isCol(d, i, [200, 72, 96])) { d[i] = SKIN[0]; d[i + 1] = SKIN[1]; d[i + 2] = SKIN[2]; }
    }
    pickRow(g);
    const L = IM.ins[cur.row][cur.frame];                    // 體內：被撐開的陰道＋裡面的陰莖＋子宮
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const s = (y * N + x) * 4, ty = y + P.INS_DY; if (!L[s + 3] || ty < 0 || ty >= P.ENT) continue;
      if (isCol(L, s, BASE) || isCol(L, s, EDGE)) continue;
      const i = (ty * N + x) * 4; if (isCol(d, i, BG) || (d[i] === 255 && d[i + 1] === 255 && d[i + 2] === 255)) continue;
      d[i] = L[s]; d[i + 1] = L[s + 1]; d[i + 2] = L[s + 2];
    }
    for (const ay of P.ANUS) { const i = (ay * N + MID) * 4; d[i] = her[i]; d[i + 1] = her[i + 1]; d[i + 2] = her[i + 2]; }
    const T = { line: { rim: 1, inner: 0, flap: 0 }, mid: { rim: 1, inner: 1, flap: 0 }, butterfly: { rim: 2, inner: 1, flap: 4 } }[lab];
    let prev = 0;                                            // 陰唇照陰莖的形狀撐開（種類：邊多厚、內側一圈粉、垂下來的皮）
    for (let y = P.APEX; y <= P.ENT; y++) {
      const w = Math.max(0, Math.round((pw + 1) * Math.pow((y - P.APEX + .6) / (P.ENT - P.APEX + .6), .7)));
      for (let u = Math.min(prev + 1, w); u <= w + T.rim - 1; u++) for (const sx of [-1, 1]) put(d, MID + sx * u, y, LAB[0]);
      if (T.inner && w > 1) for (const sx of [-1, 1]) put(d, MID + sx * (w - 1), y, LAB[1]);
      prev = w;
    }
    for (let k = 1; k <= T.flap; k++) for (const sx of [-1, 1]) {   // 蝴蝶：兩片皮從肉穴兩旁垂下來，貼著陰莖兩邊
      const x0 = MID + sx * (prev + (k > 2 ? 0 : 1)); put(d, x0, P.ENT + k, LAB[0]); if (k < T.flap) put(d, x0 + sx, P.ENT + k, LAB[0]);
    }
  }
  const at = (x, y) => x >= 0 && x < N && y >= 0 && y < N && m[y * N + x];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!m[y * N + x]) continue;
    const i = (y * N + x) * 4;
    if (y < clip || (!open && LAB.some((c) => isCol(her, i, c))) || (inside && lab === "butterfly" && y <= P.ENT + 4 && isCol(d, i, LAB[0]))) continue;
    vis[y * N + x] = 1;
    const c = !at(x + 1, y) || !at(x - 1, y) || !at(x, y + 1) || !at(x, y - 1) ? EDGE : BASE;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  const ny = Math.floor(g.belly) + 6; if (ny < N) for (let x = MID - 2; x < MID + 2; x++) put(d, x, ny, EDGE);   // 肚臍
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {  // 黑影碰到底色一圈白邊
    if (!vis[y * N + x]) continue;
    for (const [dx, dy2] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const qx = x + dx, qy = y + dy2; if (qx < 0 || qx >= N || qy < 0 || qy >= N || vis[qy * N + qx]) continue;
      const i = (qy * N + qx) * 4; if (isCol(d, i, BG)) d[i] = d[i + 1] = d[i + 2] = 255;
    }
  }
  drawUrethra(d, g);
  drawCum(d, g);
  drawHearts(d);
  ctx.putImageData(out, 0, 0);
  const sn = stageNo();
  if (sn !== lastStage) { lastStage = sn; emit("stage", { stage: sn, name: STAGES[sn] || "" }); }
  if (info.hidden) return;
  info.textContent = (sn ? `【${sn}・${STAGES[sn]}】` : "") + (g.ps === 2 ? (hn ? "臀部撞到腹部・" : "臀部往後・") : g.ps === 1.5 ? "臀部往後一點・" : "")
    + (st.squirting ? "陰道把精液吐出來了！・" : "") + (st.shooting ? (inside ? (kissing() ? "射進子宮！・" : "內射中！・") : "射精中！・") : st.cum > 0 ? `精液 ${Math.round(st.cum * 100)}%・` : "")
    + (inside ? `插入 ${P.ENT - g.tip} 格・${["還鬆鬆的", "陰道收緊", "陰道纏住、變長", "緊緊纏住、勃起變長"][level()]}${st.spasm || st.spasmLeft ? "・一抖一抖地痙攣" : ""}${performance.now() - st.gush < 900 ? "・子宮把精液噴回陰道！" : ""}${st.cramp || st.crampLeft ? "・子宮一抽一抽" : ""}${kissing() ? "・子宮口親著龜頭♥" : bobbing() ? (canSuck() ? "・子宮口吸著精液" : "・子宮口一吸一吸") : ""}${st.womb > .05 ? `・子宮裡 ${Math.round(st.womb / WOMB_MAX * 100)}%` : ""}`
      : st.stage === 3 ? `陰唇打開了${g.tip < P.CLIP ? "（頂著肉穴）" : ""}` : `磨蹭 ${st.rubs}／${RUB_NEED} 下${g.tip < P.CLIP ? "（碰著陰唇）" : ""}`);
}
const wobIdx = () => { if (!wob) return 2; const i = Math.floor((performance.now() - wob) / WOB_MS); if (i >= WOB_SEQ.length) { wob = null; return 2; } return WOB_SEQ[i]; };
const tickWob = () => { if (!wob || dead) return; draw(); if (wob) requestAnimationFrame(tickWob); };

// 尿道：陰莖中線一條細線（根部＝腹部上緣 → 龜頭頂的尿道口）；精液白色從根部往上漲
function drawUrethra(d, g) {
  const top = g.tip + 1, bot = Math.min(N, Math.floor(g.belly) + 1), len = bot - top; if (len <= 0) return;
  const fillFrom = bot - st.cum * len;
  for (let y = Math.max(0, top); y < bot; y++) { if (!dark(d, MID, y)) continue; put(d, MID, y, y >= fillFrom ? ((y & 1) ? CUM_SHADE : CUM_WHITE) : URETHRA_EMPTY); }
}
function drawCum(d, g) {
  if (!st.splats.length && !st.spurt && !st.inside && !st.womb && !st.pours.length && !st.vomit && !st.squirting && !st.drops.length && !st.sprays.length) return;
  const P = g.p, H = holeY(g);
  markPen(d, g);
  const sh = P.INS_DY - POSE[1].INS_DY;                       // 射在她身上的：跟著她的身體移動
  for (const sp0 of st.splats) { const sp = { ...sp0, y: sp0.y + sh }; blob(d, sp.x, sp.y, sp.r); for (let i = 1; i <= sp.drip; i++) put(d, sp.x + (i > 2 ? .5 : 0), sp.y + sp.r * .6 + i, i % 2 ? CUM_SHADE : CUM_WHITE); }
  if (g.inside) {
    const m = lumenMask(g);
    if (st.womb > 0) fillWomb(d, m.womb, st.womb, m.wombN);
    if (st.inside) {
      const f = fluidMask(m);
      paintFluid(d, f, flood(f, topCells(f), Math.round(Math.min(st.inside, INSIDE_MAX) * SHOTS * LUMEN_PX_PER_SHOT)));
      if (performance.now() - st.gush < GUSH_MS) for (const c of flood(f, topCells(f), 18, 11)) put(d, c.x, c.y, hash(c.x, c.y + 9) < .25 ? CUM_SHADE : [255, 255, 255], .95);
      const over = Math.max(0, st.inside - 1), milk = Math.min(1, over / 1.2);
      if (milk > 0) for (let y = Math.max(0, g.tip); y < P.ENT; y++) for (const sx of [-1, 1]) {   // 太多：陰莖整根被一層乳白包住
        let x = MID + sx; while (x > 0 && x < N - 1 && dark(d, x, y)) { put(d, x, y, !dark(d, x + sx, y) ? [168, 162, 180] : [222, 218, 226], .7 + .15 * milk); x += sx; }
      }
      if (over > .5) for (const sx of [-1, 1]) {             // 從陰道口溢出來：口旁兩坨＋往下流
        const sp = penSpan(P.ENT + 1), bx = sp ? (sx < 0 ? sp[0] - 2 : sp[1] + 3) : MID + .5 + sx * 6;
        blob(d, bx, P.ENT + .5, 1.2 + Math.min(1.4, over * .6), 1, true);
        for (let k = 1; k <= 2 + Math.round(over * 2); k++) if (!onPen(bx, P.ENT + 2 + k)) put(d, bx, P.ENT + 2 + k, k % 2 ? CUM_SHADE : CUM_WHITE);
      }
    }
    if (st.leak) for (const sx of [-1, 1]) for (let k = 0; k < 5; k++) if (!onPen(MID + .5 + sx * (6 + k), P.ENT - k * .6)) put(d, MID + .5 + sx * (6 + k), P.ENT - k * .6, CUM_WHITE);
  } else if (st.inside && st.stage === 3) {                   // 拔出來：肉穴口流出白色
    const v = Math.min(INSIDE_MAX, st.inside);
    blob(d, MID + .5, H, 1.2 + v * .6, 1, true);
    for (let i = 0; i < 3 + Math.round(v * 4) && H + 2 + i <= groundY(g); i++) rowOut(d, H + 2 + i, MID + .5, .6, () => i % 2 ? CUM_SHADE : CUM_WHITE, 1);
  }
  for (const dr of st.drops) blob(d, dr.x, dr.y, dr.r, 1, true);
  drawVomit(d, g);
  for (const q of st.sprays) if (!onPen(q.x, q.y)) { put(d, q.x, q.y, CUM_WHITE, .95); if (q.px !== undefined && !onPen(q.px, q.py)) put(d, q.px, q.py, CUM_SHADE, .7); }
  if (st.spurt && st.spurt.inside && g.inside) {             // 內射這一股：一小團沿著陰道衝上去，到頂濺開
    const sp = st.spurt, f = fluidMask(lumenMask(g)), t = Math.min(1, (performance.now() - sp.t0) / SPURT_FLY_MS), yc = Math.round(sp.y0 + (sp.y1 - sp.y0) * t);
    let seed = null; for (let dy = 0; dy < 4 && !seed; dy++) for (const dx of [0, -1, 1, -2, 2]) if (f[(yc + dy) * N + MID + dx]) { seed = [MID + dx, yc + dy]; break; }
    if (seed) for (const c of flood(f, [seed], t < 1 ? 5 : 12, sp.seed)) put(d, c.x, c.y, hash(c.x, c.y) < .3 ? CUM_SHADE : CUM_WHITE, .95);
  } else if (st.spurt && !st.spurt.inside) {                 // 在外面這一股：從尿道口噴出去的白線
    const sp = st.spurt, n = Math.max(12, Math.abs(sp.y1 - sp.y0));
    for (let i = 0; i <= n; i++) { const t = i / n, x = MID + .5 + (sp.x - MID - .5) * t, y = sp.y0 + (sp.y1 - sp.y0) * t; put(d, x, y, CUM_WHITE); put(d, x + 1, y, CUM_SHADE, .6); }
  }
}
// 吐精：一口一口，從肉穴口往下淌（她跪著，往下＝往床那邊），流到兩個膝蓋中間的床上積一攤
function drawVomit(d, g) {
  const now = performance.now(), H = holeY(g), GR = groundY(g);
  pool(d, MID + .5, poolY(g), st.vomit);
  if (st.vomit > 0 && !g.inside) { const w = .8 + Math.min(1.6, st.vomit * 1.2); for (let y = H + 1; y <= GR; y++) { const hw = w * (.75 + .5 * hash(5, y)), cx = MID + .5 + Math.sin(y * .5) * .5; rowOut(d, y, cx, hw, (u) => u > hw - .8 ? CUM_SHADE : MILK, .9); } }
  if (st.squirting && st.heave > 0) { const r = 1.4 + 2.6 * st.heave ** .8; blob(d, MID + .5, H + .3 + r * .35, r, 1, true); }
  for (const p of st.pours) {
    const e = now - p.t0, w0 = 3.6 + p.v * 8, flow = e * .016 + (e / 1000) ** 2 * 12, front = Math.min(GR, H + 3 + flow), wTop = w0 * Math.max(.25, 1 - e / POUR_LIFE_MS);
    for (let y = H + 1; y <= front; y++) {
      const t = (y - H) / Math.max(1, front - H), lump = (hash(Math.round(y - flow), p.ph * 100 | 0) - .5) * 1.6, hw = Math.max(.6, (wTop * (1 - t) + w0 * .7 * t) / 2 + lump * .5), cx = p.x + Math.sin(y * .25 + p.ph) * .8;
      rowOut(d, y, cx, hw, (u) => u > hw - .8 ? CUM_SHADE : (hash(Math.round(cx + u), y) < .12 ? CUM_WHITE : MILK), .95);
    }
    if (front < GR) blob(d, p.x + Math.sin(front * .25 + p.ph) * .8, front, w0 * .62, 1, true);
  }
}
function drawHearts(d) {
  const now = performance.now();
  for (const h of st.hearts) {
    const age = (now - h.t0) / HEART_LIFE_MS, x0 = Math.round(h.x + Math.sin(age * 6 + h.ph) * 1.5 - 2), y0 = Math.round(h.y - age * 16 - 2), a = age < .7 ? 1 : Math.max(0, 1 - (age - .7) / .3);
    HEART.forEach((row, yy) => [...row].forEach((v, xx) => { if (v !== "1") return; const edge = yy === 0 || xx === 0 || xx === 4 || yy === 4 || (yy === 3 && (xx === 1 || xx === 3)); put(d, x0 + xx, y0 + yy, edge ? [226, 60, 112] : (yy === 1 && xx === 1 ? [255, 214, 228] : [255, 120, 166]), a); }));
  }
}

// ---- 射精 ----
function shootOnce() {
  const g = G(), kiss = kissing();
  st.jerk = -2; later(() => { st.jerk = 0; draw(); }, JERK_MS);   // 每一股往前一抖
  if (g.inside && kiss) { st.spurt = null; st.womb = Math.min(WOMB_MAX, st.womb + 1 / SHOTS); if (st.womb >= WOMB_MAX) st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS); }
  else if (g.inside) {
    const c0 = cervix0(level()), cerv = c0 - Math.max(0, c0 - g.ft) + g.p.INS_DY;
    st.spurt = { inside: true, seed: Math.floor(Math.random() * 1000), t0: performance.now(), y0: g.tip - 2, y1: Math.min(g.tip - 2, Math.round(cerv + 1)) };
    const fly = setInterval(() => { if (dead || !st.spurt || performance.now() - st.spurt.t0 > SPURT_FLY_MS + 40) clearInterval(fly); else draw(); }, 30);
    st.inside = Math.min(INSIDE_MAX, st.inside + 1 / SHOTS);
    if (st.inside > 1.5) { leakSpray(); st.leak = 1; later(() => { st.leak = 0; draw(); }, 220); }
  } else {                                                   // 在外面：噴到她的屁股、腰上（第一股最遠）
    const k = SHOTS - st.shooting, src = ctx.getImageData(0, 0, N, N).data;
    let x = MID + .5 + (Math.random() * 2 - 1) * (3 + k * 3), y = 22 + k * 9 + Math.random() * 4;
    y = Math.min(g.tip - 8, y);
    while (Math.abs(x - MID) > 2 && isBg(src, Math.round(x), Math.round(y))) x += x > MID ? -1 : 1;
    st.spurt = { x, y0: g.tip, y1: y };
    st.splats.push({ x, y: y - (g.p.INS_DY - POSE[1].INS_DY), r: 2.2 + Math.random() * 1.2 - k * .2, drip: 2 + Math.floor(Math.random() * 3) });
    if (st.splats.length > 40) st.splats.shift();
  }
  st.cum = Math.max(0, st.cum - 1 / SHOTS); st.shooting -= 1; draw();
  later(() => { st.spurt = null; draw(); if (st.shooting > 0) shootOnce(); }, SHOT_MS);
}
const leakSpray = () => { const g = G(); for (const sx of [-1, 1]) spray(MID + .5 + sx * 7, g.p.ENT, 4, 1.2, .3, 1.4); };
function maybeShoot() {
  if (st.cum >= 1 && !st.shooting && !st.locked) {
    st.shooting = SHOTS; st.ejacs += 1;
    emit("ejac", { where: G().inside ? (kissing() ? "womb" : "inside") : "outside", count: st.ejacs });
    shootOnce();
  }
}
function wombGush() {
  const v = Math.min(GUSH, st.womb); st.womb -= v; st.inside = Math.min(INSIDE_MAX, st.inside + v); st.gush = performance.now(); st.gushes += 1; emit("gush", {});
  if (st.inside > 1.5) { leakSpray(); st.leak = 1; later(() => { st.leak = 0; draw(); }, 220); }
  later(draw, GUSH_MS + 20); later(draw, 920);
}
let dropTimer = 0;
function spawnDrop() {
  if (st.drops.length > 14) return;
  const g = G(), sx = Math.random() < .5 ? -1 : 1;
  if (Math.random() < .5) spray(MID + .5 + sx * 7, g.p.ENT, 1 + Math.round(Math.random()), 1, .2, .9);
  st.inside = Math.max(0, st.inside - .03);
  st.drops.push({ x: MID + .5 + sx * (7 + Math.random() * 1.5), y: g.p.ENT, r: .9 + Math.random() * .7, vy: .35 + Math.random() * .25 });
  if (!dropTimer) dropTimer = setInterval(() => {
    if (dead) { clearInterval(dropTimer); return; }
    const gr = groundY(G()); for (const dr of st.drops) { dr.y += dr.vy; dr.vy += .05; }
    st.drops = st.drops.filter((dr) => { if (dr.y < gr + 1) return true; st.vomit += .03; return false; });
    if (!st.drops.length) { clearInterval(dropTimer); dropTimer = 0; }
    draw();
  }, 50);
}
let vomitLeft = 0, heaveT0 = 0, heaveNext = 0;
function startSquirt() { st.squirtReady = false; vomitLeft = Math.round(rand(SQUIRT_PULSES) + Math.min(2, st.inside - SQUIRT_FULL)); st.squirts += 1; st.squirting = 1; heaveT0 = performance.now(); heaveNext = 0; emit("squirt", {}); }

// ---- 動了：腰、或她的臀部被拉 ----
function moved(before, after) {
  const now = performance.now(), dTip = Math.abs(after.tip - before.tip);
  if (!dTip && after.ps === before.ps) return;
  st.moveAt = now;
  const wasIn = before.inside, isIn = after.inside, dft = after.ft - before.ft;
  if (isIn || wasIn) {                                       // 抽送：用「正面座標的龜頭頂」算，腰動或她被拉都算
    st.react = Math.min(REACT_MAX + .99, st.react + Math.abs(dft) * REACT_PER_PX * mul(opts.reactMul));
    st.thrustTravel += Math.abs(dft);
    while (st.thrustTravel >= THRUST_STEP) { st.thrustTravel -= THRUST_STEP; st.thrusts += 1; emit("thrust", { count: st.thrusts }); }
    st.pullAt = dft > 0 ? now : 0;
    if (dft < 0 && isIn && after.ft <= cervix0(level()) && st.womb >= WOMB_MAX - .01) wombGush();
    if (dft > 0 && isIn && st.inside > 1 && Math.random() < .35 + .2 * Math.min(1, st.inside - 1)) spawnDrop();
  } else if (Math.min(before.tip, after.tip) < after.p.CLIP) {   // 在外面碰著陰唇
    st.rubTravel += dTip;
    while (st.rubTravel >= THRUST_STEP) { st.rubTravel -= THRUST_STEP; emit("rub", { opened: st.stage === 3 }); }
    if (st.stage === 3 && st.react < RUB_REACT_CAP) st.react = Math.min(RUB_REACT_CAP, st.react + dTip * REACT_PER_PX * .5 * mul(opts.reactMul));
  }
  if (!st.shooting && (isIn || wasIn || Math.min(before.tip, after.tip) < after.p.CLIP))
    st.cum = Math.min(1, st.cum + (isIn || wasIn ? Math.abs(dft) * CUM_PER_PX_IN : dTip * CUM_PER_PX) * mul(opts.cumMul));
  if (wasIn !== isIn) emit(isIn ? "insert" : "pullout", {});
  if (wasIn && !isIn && st.squirtReady) startSquirt();
  maybeShoot();
}

// ---- 手勢 ----
const pts = new Map();
let drag = null, grab = null;
const k128 = () => N / cv.getBoundingClientRect().height;
function begin() {
  const a = [...pts.values()];
  if (a.length === 1) { drag = { id: [...pts.keys()][0], y: a[0].y, off: st.off }; grab = null; }
  else if (a.length === 2 && Math.min(a[0].sx, a[1].sx) < MID && Math.max(a[0].sx, a[1].sx) > MID && a.every((p) => p.sy < 100)) { grab = { y: (a[0].y + a[1].y) / 2, pull: st.pull }; drag = null; }
  else { drag = null; if (a.length !== 2) grab = null; }
}
const onDown = (e) => {
  if (st.locked || !IM) return;
  cv.setPointerCapture(e.pointerId);
  const r = cv.getBoundingClientRect(), k = k128();
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: (e.clientX - r.left) * k, sy: (e.clientY - r.top) * k });
  begin(); cv.style.cursor = "grabbing"; e.preventDefault();
};
const onMove = (e) => {
  const p = pts.get(e.pointerId); if (!p || st.locked) return;
  p.x = e.clientX; p.y = e.clientY;
  const k = k128();
  if (st.shooting) {                                         // 射精時不能動
    if (drag) { drag.y = e.clientY; drag.off = st.off; }
    if (grab) { const a = [...pts.values()]; grab.y = (a[0].y + a[1].y) / 2; grab.pull = st.pull; }
    return;
  }
  if (grab && pts.size === 2) {
    const a = [...pts.values()], before = G();
    st.pull = Math.max(0, Math.min(1, grab.pull + ((a[0].y + a[1].y) / 2 - grab.y) * k / PULL_PX));
    moved(before, G()); draw(); return;
  }
  if (!drag || drag.id !== e.pointerId) return;
  const before = G(), prev = st.off;
  st.off = Math.max(-BACK, Math.min(FWD, drag.off + (drag.y - e.clientY) * k));
  if (st.stage === 0 && !st.opening && REST_TIP - Math.round(st.off) < POSE[pose()].CLIP) {   // 龜頭碰著陰唇而且在動才算
    st.acc += Math.abs(st.off - prev);
    while (st.acc >= RUB_PX) { st.acc -= RUB_PX; st.rubs++; }
    if (st.rubs >= RUB_NEED) openUp();
  }
  moved(before, G()); draw();
};
const onEnd = (e) => {
  if (!pts.has(e.pointerId)) return;
  pts.delete(e.pointerId);
  if (grab) { const before = G(); grab = null; st.pull = 0; moved(before, G()); draw(); }
  drag = null;
  if (pts.size === 1) begin();
  if (!pts.size) cv.style.cursor = st.locked ? "default" : "grab";
};
cv.addEventListener("pointerdown", onDown);
cv.addEventListener("pointermove", onMove);
cv.addEventListener("pointerup", onEnd);
cv.addEventListener("pointercancel", onEnd);
function openUp() { st.opening = true; let i = 0; const step = () => { i++; st.stage = i; draw(); if (i < 3) later(step, STEP_MS); else st.opening = false; }; later(step, STEP_MS); }
function reset() { const keep = st.locked; st = fresh(); st.locked = keep; vomitLeft = 0; heaveNext = 0; wob = null; lastStage = -1; pts.clear(); drag = grab = null; draw(); }
section.querySelector(".sexpix-reset").addEventListener("click", reset);

// ---- 排程 ----
every(() => {                                                // 吐精、噴出來的小滴、流到床上
  if (!IM) return;
  const now = performance.now(), g = G(); let dirty = false;
  if (st.squirting) {
    if (g.inside || st.inside <= .05 || vomitLeft <= 0) { st.squirting = 0; st.heave = 0; }
    else if (!heaveNext || now >= heaveNext) {
      if (heaveNext) { heaveNext = 0; heaveT0 = now; }
      st.heave = Math.min(1, (now - heaveT0) / HEAVE_MS);
      if (st.heave >= 1) {
        const v = Math.min(st.inside, .25 + .15 * Math.random());
        st.inside -= v; vomitLeft -= 1; st.heave = 0;
        st.pours.push({ t0: now, v, ph: Math.random() * 6, x: MID + .5 + (Math.random() - .5) * 1.2 });
        spray(MID + .5, holeY(g) + 1, 5 + Math.round(v * 10), 1.5, .2, 1.3);
        heaveNext = now + HEAVE_PAUSE_MS;
      }
    }
    dirty = true;
  }
  if (st.sprays.length) {
    for (const q of st.sprays) { q.px = q.x; q.py = q.y; q.x += q.vx; q.y += q.vy; q.vy += SPRAY_G; }
    st.sprays = st.sprays.filter((q) => { if (q.x <= 0 || q.x >= N) return false; if (q.vy > 0 && q.y >= q.g) { st.vomit += .008; return false; } return true; });
    dirty = true;
  }
  for (const p of st.pours) if (now - p.t0 > 450) { const dv = Math.min(p.v - (p.given || 0), p.v * 40 / (POUR_LIFE_MS - 450)); p.given = (p.given || 0) + dv; st.vomit += dv; }
  st.pours = st.pours.filter((p) => { if (now - p.t0 < POUR_LIFE_MS) return true; st.vomit += p.v - (p.given || 0); return false; });
  if (st.pours.length) dirty = true;
  if (!g.inside && st.stage === 3 && st.inside > 0 && !st.squirting) { const v = Math.min(st.inside, .0016); st.inside -= v; st.vomit += v; dirty = true; }   // 拔出來後裡面的慢慢流出來
  if (dirty) draw();
}, 40);
let lastShown = "";
every(() => {                                                // 停下來：反應慢慢退；「往外抽」那條換回來
  if (!IM) return;
  const now = performance.now();
  if (st.react > 0 && !drag && !grab && now - st.moveAt > REACT_IDLE_MS) st.react = Math.max(0, st.react - REACT_DECAY / 4);
  const shown = `${G().inside}|${level()}|${now - st.pullAt < PULL_SHOW_MS}`;
  if (shown !== lastShown) { lastShown = shown; draw(); }
}, 250);
every(() => { if (st.pullAt && performance.now() - st.pullAt >= PULL_SHOW_MS && G().inside) { st.pullAt = 0; draw(); } }, 60);
every(() => {                                                // 痙攣（2 階以上）：一陣一陣一抖一抖
  const lv = level(), now = performance.now();
  if (!IM || !G().inside || lv < 2) { if (st.spasm || st.spasmLeft) { st.spasm = false; st.spasmLeft = 0; draw(); } st.spasmNext = 0; return; }
  if (!st.spasmNext) st.spasmNext = now + rand(SPASM_GAP[lv]);
  if (st.spasmLeft || now < st.spasmNext) return;
  st.spasmLeft = Math.round(rand(SPASM_N[lv]));
  const twitch = () => {
    if (!st.spasmLeft || !G().inside) { st.spasm = false; st.spasmLeft = 0; draw(); return; }
    st.spasm = true; st.spasms += 1;
    if (st.inside >= SQUIRT_FULL) st.squirtReady = true;     // 陰道裡滿滿的時候痙攣：拔出來會吐
    draw();
    later(() => { st.spasm = false; st.spasmLeft -= 1; draw(); if (st.spasmLeft > 0) later(twitch, SPASM_OFF_MS); else st.spasmNext = performance.now() + rand(SPASM_GAP[level()] || SPASM_GAP[2]); }, SPASM_ON_MS);
  };
  twitch();
}, 100);
every(() => {                                                // 子宮抽動（子宮高潮，3 階）：一陣一陣抽，不會結束
  const now = performance.now();
  if (!IM || !G().inside || level() < 3) { if (st.cramp || st.crampLeft) { st.cramp = false; st.crampLeft = 0; draw(); } st.crampNext = 0; st.crampBursts = 0; return; }
  if (!st.crampNext) st.crampNext = now + 500;
  if (st.crampLeft || now < st.crampNext) return;
  st.crampLeft = Math.round(rand(CRAMP_N)); st.crampBursts += 1;
  if (st.crampBursts % ORGASM_EVERY === 1) { st.orgasms += 1; emit("orgasm", { count: st.orgasms, burst: st.crampBursts }); }
  const twitch = () => {
    if (!st.crampLeft || !G().inside || level() < 3) { st.cramp = false; st.crampLeft = 0; draw(); return; }
    st.cramp = true; st.cramps += 1; draw();
    later(() => { st.cramp = false; st.crampLeft -= 1; draw(); if (st.crampLeft > 0) later(twitch, CRAMP_OFF_MS); else st.crampNext = performance.now() + rand(CRAMP_GAP); }, CRAMP_ON_MS);
  };
  twitch();
}, 100);
let heartAt = 0;
every(() => {                                                // 子宮口吸吮；頂著子宮口＝親著龜頭、飄愛心
  if (!IM) return;
  const now = performance.now();
  if (bobbing()) { st.bob = !st.bob; if (st.bob && canSuck()) { const v = Math.min(SUCK_PER_BOB, st.inside, WOMB_MAX - st.womb); st.inside -= v; st.womb += v; st.sucks += 1; } draw(); }
  else if (st.bob) { st.bob = false; draw(); }
  if (kissing() && now - heartAt > HEART_EVERY_MS) { heartAt = now; st.kisses += 1; st.hearts.push({ x: MID + .5 + (Math.random() * 2 - 1) * 5, y: G().tip - 3, t0: now, ph: Math.random() * 6 }); }
}, BOB_MS);
every(() => { if (!st.hearts.length) return; const now = performance.now(); st.hearts = st.hearts.filter((h) => now - h.t0 < HEART_LIFE_MS); draw(); }, 60);

const url = (n) => `/sexpix/${n}.png?v=${SEXPIX_BACK_VER}`;
const vk = VKEY[look.vlen];
const ready = Promise.all([
  load(url(`back/her_${lab}_up`)), load(url(`back/her_${lab}_mid`)), load(url(`back/her_${lab}_sb`)), load(url(`back/her_${lab}_sq`)),
  load(url(`back/ins_v${vk}`)), load(url(`lumen_v${vk}`)),
]).then(([up, midImg, sb, sq, ins, lumen]) => {
  if (dead) return;
  IM = { up: slice(up, 4, 1, true), mid: slice(midImg, 2, 1, true), sb: slice(sb, 2, 1, true), sq: slice(sq, 6, 2, true), ins: slice(ins, 31, 11), lumen: slice(lumen, 31, 11) };
  draw();
}).catch((e) => { info.hidden = false; info.textContent = e.message; console.error(e); });

return {
  el: section,
  ready,
  look: { ...look, back: lab },
  state: () => { const g = G(); return { ...st, drag: !!drag || !!grab, level: level(), stage: stageNo(), opened: st.stage === 3, inserted: g.inside, tip: g.tip, ft: g.ft, pose: g.ps, hit: hit(), kissing: kissing() }; },
  set: (o) => { Object.assign(st, o); draw(); },               // 除錯用（例 set({ react: 2.5, inside: 1.6, stage: 3 })）
  reset,
  lock: (on = true) => { st.locked = !!on; if (on) { pts.clear(); drag = grab = null; cv.style.cursor = "default"; } else cv.style.cursor = "grab"; },
  destroy: () => { dead = true; for (const id of timers) clearInterval(id); clearInterval(dropTimer); section.remove(); },
};
}
