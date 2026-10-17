/* 日租女友・旅館房間裡的流程（2026-10-17 Al）。
 * 進房先在床上接吻 → 隨機地點（床鋪／浴室）＋那個地點的隨機姿勢；每個動作遊戲時間 10 分鐘、每次都內射；
 * 每做完一個動作 1/3 結束（退房），否則換地點＋姿勢。整場在開始時就擲好（跟 rental.js 一樣「真相先擲」）。
 * 不會自己跳出來：玩家在 openRoom 裡左右切換主臥室／浴室找人，兩人畫在場景裡；點人物才開面板（AI 圖＋即時對話）。
 * 純規則（planSession／stateAt／sessionResult）可在 node 測；drawCouple／openTalk 要瀏覽器。 */
import { GAME_HOUR_MS } from "./rental.js?v=7";

export const ACTION_GAME_MIN = 10;
export const ACTION_MS = (GAME_HOUR_MS / 60) * ACTION_GAME_MIN;   // 真實 20 秒
export const END_CHANCE = 1 / 3;
export const MAX_ACTS = 12;
export const POSES = { bed: ["missionary", "doggy"], bath: ["soak", "standing"] };
export const POSE_ZH = { kiss: "接吻", missionary: "正面", doggy: "背後", soak: "泡澡", standing: "站著從後面" };
export const LOC_ZH = { bed: "床鋪", bath: "浴室" };
export const SLOT_KEYS = ["bed_kiss", "bed_missionary", "bed_doggy", "bath_soak", "bath_standing"];

/** 擲一整場：第一個一定是床上接吻；之後每個動作都不跟上一個一樣。 */
export function planSession(r = Math.random, startAt = Date.now()) {
  const acts = [{ loc: "bed", pose: "kiss" }];
  for (let n = 0; n < MAX_ACTS - 1; n++) {
    const prev = acts[acts.length - 1];
    let loc, pose, guard = 0;
    do {
      loc = r() < 0.5 ? "bed" : "bath";
      pose = POSES[loc][Math.floor(r() * POSES[loc].length) % POSES[loc].length];
    } while (loc === prev.loc && pose === prev.pose && ++guard < 8);
    if (loc === prev.loc && pose === prev.pose) pose = POSES[loc].find((x) => x !== pose);
    acts.push({ loc, pose, cum: true });
    if (r() < END_CHANCE) break;
  }
  return { startAt, acts };
}
/** 現在在做什麼：{ i, act, left（毫秒）, done }。 */
export function stateAt(s, now = Date.now()) {
  if (!s?.acts?.length) return { i: -1, act: null, left: 0, done: true };
  const i = Math.floor(Math.max(0, now - Number(s.startAt || 0)) / ACTION_MS);
  if (i >= s.acts.length) return { i: s.acts.length, act: null, left: 0, done: true };
  return { i, act: s.acts[i], left: ACTION_MS - ((now - s.startAt) % ACTION_MS), done: false, cums: s.acts.slice(0, i).filter((a) => a.cum).length };
}
/** 整場的結果（給 rental_ui → rentalApply：飢渴、子宮精液、懷孕擲骰）。 */
export function sessionResult(s) {
  const n = (s?.acts || []).filter((a) => a.cum).length;
  return { level: "sex", cums: n, creampies: n, condom: false, session: true };
}
export const slotKey = (act) => (act ? `${act.loc}_${act.pose}` : "");

// ------------------------------------------------------------ 場景裡的兩個人（點陣、不透明＋1px 外框；客人藍色）
// 每間的錨點（畫面像素，195×422）：x、y＝人物腳底／床面／水面，s＝站著的身高像素。
const ANCHOR = {   // flip：鏡像（浴缸在右邊時她要朝右扶浴缸）；wy：水面（沒給＝y）
  ryokan: { bed: { x: 44, y: 240, s: 48 }, bath: { x: 158, y: 210, s: 60, water: true }, bathStand: { x: 96, y: 264, s: 74, flip: true } },
  hotel: { bed: { x: 60, y: 232, s: 46 }, bath: { x: 132, y: 240, s: 62, water: true }, bathStand: { x: 46, y: 292, s: 82, flip: true } },
  motel: { bed: { x: 58, y: 216, s: 40 }, bath: { x: 100, y: 222, s: 60, water: true }, bathStand: { x: 100, y: 250, s: 70, water: true, wy: 222 } },
};
export function anchorOf(venue, act) {
  const A = ANCHOR[venue] || ANCHOR.hotel;
  if (!act) return null;
  return act.loc === "bed" ? A.bed : act.pose === "standing" ? A.bathStand : A.bath;
}
const SKIN = "#e8b39a", SKIN_D = "#c98d74", HAIR = "#3a2418", MAN = "#3d6fd2", MAN_D = "#2a4f9a", INK = "#140c10";
// 部位：[x, y, rx, ry, rot, color]（單位＝身高；y 往上是負）
function parts(pose, t) {
  const th = Math.sin(t / 260) * 0.035, jig = Math.sin(t / 260 - 0.9) * 0.012, bob = Math.sin(t / 900) * 0.01;
  switch (pose) {
    case "kiss": return {
      girl: [[-0.16, -0.56, 0.08, 0.15, 0, HAIR], [-0.11, -0.42, 0.065, 0.14, 0.1, SKIN], [-0.03, -0.27, 0.12, 0.05, 0, SKIN_D], [-0.1, -0.64 + bob, 0.07, 0.08, 0, SKIN], [-0.13, -0.68 + bob, 0.075, 0.05, 0, HAIR], [-0.06, -0.45, 0.035, 0.035, 0, SKIN]],
      man: [[0.13, -0.45, 0.09, 0.16, -0.1, MAN], [0.04, -0.26, 0.13, 0.06, 0, MAN_D], [0.05, -0.66 - bob, 0.075, 0.085, 0, MAN], [-0.02, -0.45, 0.1, 0.025, 0.3, MAN_D]] };
    case "missionary": return {
      girl: [[-0.47, -0.06, 0.1, 0.05, 0, HAIR], [-0.38, -0.09, 0.065, 0.06, 0, SKIN], [-0.18, -0.09 + th * 0.3, 0.18, 0.065, 0, SKIN], [-0.16, -0.17 + jig, 0.05, 0.04, 0, SKIN], [0.1, -0.24, 0.05, 0.17, -0.7, SKIN_D]],
      man: [[0.02 + th, -0.3, 0.08, 0.17, 0.75, MAN], [0.13 + th, -0.16, 0.08, 0.07, 0, MAN_D], [0.22 + th * 0.4, -0.07, 0.13, 0.05, 0, MAN_D], [-0.1 + th, -0.44, 0.07, 0.075, 0, MAN], [-0.12 + th, -0.2, 0.025, 0.12, 0.2, MAN_D]] };
    case "doggy": return {
      girl: [[-0.33, -0.27 + th * 0.3, 0.07, 0.075, 0, SKIN], [-0.37, -0.3 + th * 0.3, 0.08, 0.06, 0, HAIR], [-0.15, -0.26 + th * 0.2, 0.18, 0.07, -0.08, SKIN], [-0.2, -0.17 + jig, 0.04, 0.05 + Math.abs(jig), 0, SKIN_D],
        [-0.3, -0.13, 0.025, 0.11, 0.1, SKIN], [0.05, -0.14, 0.045, 0.13, 0.1, SKIN_D], [0.04, -0.28 + th * 0.2, 0.08, 0.075, 0, SKIN]],
      man: [[0.15 + th, -0.29, 0.07, 0.08, 0, MAN_D], [0.18 + th * 0.5, -0.46, 0.08, 0.17, 0.12, MAN], [0.2 + th * 0.4, -0.67, 0.07, 0.08, 0, MAN], [0.2, -0.13, 0.05, 0.14, -0.1, MAN_D], [0.08 + th, -0.36, 0.1, 0.022, -0.4, MAN]] };
    case "soak": return {
      girl: [[-0.09, -0.27, 0.085, 0.13, 0, HAIR], [-0.06, -0.1, 0.1, 0.13, 0, SKIN], [-0.06, -0.33 + bob, 0.07, 0.08, 0, SKIN], [-0.08, -0.38 + bob, 0.075, 0.05, 0, HAIR], [-0.11, -0.05 + bob * 2, 0.045, 0.04, 0, SKIN_D]],
      man: [[0.09, -0.16, 0.12, 0.17, 0, MAN], [0.1, -0.42 - bob, 0.075, 0.085, 0, MAN], [-0.02, -0.08, 0.11, 0.025, -0.15, MAN_D]] };
    default: return {   // standing：她彎腰 90 度扶著浴缸（朝左），他站在後面只動腰
      girl: [[0.0, -0.25, 0.045, 0.25, 0, SKIN_D], [0.0 + th * 0.4, -0.5, 0.08, 0.08, 0, SKIN], [-0.18 + th * 0.4, -0.53, 0.18, 0.07, 0.05, SKIN], [-0.39 + th * 0.4, -0.55, 0.07, 0.075, 0, SKIN],
        [-0.43 + th * 0.4, -0.5, 0.06, 0.1, 0, HAIR], [-0.32, -0.42, 0.025, 0.12, 0, SKIN], [-0.2 + th * 0.4, -0.45 + jig, 0.045, 0.055 + Math.abs(jig), 0, SKIN_D]],
      man: [[0.15, -0.25, 0.05, 0.25, 0, MAN_D], [0.12 + th, -0.5, 0.08, 0.085, 0, MAN_D], [0.15 + th * 0.3, -0.72, 0.08, 0.18, 0, MAN], [0.16, -0.94, 0.075, 0.085, 0, MAN], [0.04 + th, -0.58, 0.1, 0.022, 0.3, MAN]] };
  }
}
const scratch = typeof document !== "undefined" ? document.createElement("canvas") : null;
/** 畫兩個人；回傳點擊框 {x0,y0,x1,y1}（畫面像素）。 */
export function drawCouple(g, venue, act, t = 0) {
  const A = anchorOf(venue, act);
  if (!A || !scratch) return null;
  const W = Math.ceil(A.s * 1.2), H = Math.ceil(A.s * 1.15), ox = Math.floor(W / 2), oy = Math.ceil(A.s * 1.05);
  scratch.width = W; scratch.height = H;
  const c = scratch.getContext("2d");
  c.imageSmoothingEnabled = false;
  const P = parts(act.pose, t);
  const order = act.pose === "kiss" || act.pose === "soak" ? [...P.man, ...P.girl] : [...P.girl, ...P.man];   // 側面：他在她後面的姿勢，他的腰疊在她前面
  for (const [x, y, rx, ry, rot, col] of order) {
    c.fillStyle = col; c.beginPath(); c.ellipse(ox + (A.flip ? -x : x) * A.s, oy + y * A.s, Math.max(1, rx * A.s), Math.max(1, ry * A.s), A.flip ? -rot : rot, 0, 7); c.fill();
  }
  // 硬邊（不透明）＋ 1px 外框
  const img = c.getImageData(0, 0, W, H), d = img.data, solid = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) { solid[i] = d[i * 4 + 3] > 110 ? 1 : 0; d[i * 4 + 3] = solid[i] ? 255 : 0; }
  const ink = [0x14, 0x0c, 0x10];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (solid[i]) continue;
    if ((x > 0 && solid[i - 1]) || (x < W - 1 && solid[i + 1]) || (y > 0 && solid[i - W]) || (y < H - 1 && solid[i + W])) { d[i * 4] = ink[0]; d[i * 4 + 1] = ink[1]; d[i * 4 + 2] = ink[2]; d[i * 4 + 3] = 255; }
  }
  // 水面以下：淡淡看得到
  const wy = oy + Math.round((A.wy ?? A.y) - A.y);
  if (A.water) for (let y = Math.max(0, wy + 1); y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (d[i + 3]) d[i + 3] = 60; }
  c.putImageData(img, 0, 0);
  const X0 = Math.round(A.x - ox), Y0 = Math.round(A.y - oy);
  g.drawImage(scratch, X0, Y0);
  if (A.water) {   // 水面一條亮線＋漣漪
    g.fillStyle = "rgba(170,225,255,.55)";
    for (let x = Math.round(A.x - A.s * 0.35); x < A.x + A.s * 0.35; x++) if (((x + Math.floor(t / 300)) & 3) !== 0) g.fillRect(x, (A.wy ?? A.y) + (((x >> 2) + Math.floor(t / 500)) & 1), 1, 1);
  }
  return { x0: X0, y0: Y0, x1: X0 + W, y1: Y0 + H };
}

// ------------------------------------------------------------ 點人物 → 面板：AI 圖（這個房型＋地點姿勢，兩張隨機一張）＋即時對話
const CSS = `
.rs-talk{position:absolute;inset:6% 4% 4%;background:rgba(16,10,18,.94);border:1px solid #6a4a5c;border-radius:12px;display:flex;flex-direction:column;overflow:hidden;z-index:3}
.rs-talk .hd{display:flex;justify-content:space-between;align-items:center;padding:8px 10px;color:#e8b4cf;font:600 14px/1.3 system-ui,sans-serif}
.rs-talk .hd button{background:none;border:0;color:#fff;font-size:22px;cursor:pointer;box-shadow:none;padding:0 4px}
.rs-talk .pic{flex:0 0 auto;max-height:48%;display:flex;align-items:center;justify-content:center;background:#000}
.rs-talk .pic img{max-width:100%;max-height:100%;object-fit:contain;display:block}
.rs-talk .pic .none{color:#a88;font:13px system-ui;padding:24px 10px;text-align:center}
.rs-talk .lines{flex:1;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;font:14px/1.45 system-ui,sans-serif}
.rs-talk .l{max-width:86%;padding:5px 9px;border-radius:10px}
.rs-talk .l.wife{align-self:flex-start;background:#4a2238;color:#ffe3f0}
.rs-talk .l.client{align-self:flex-end;background:#22345a;color:#dfe9ff}
.rs-talk .wait{color:#a89;font-size:12px}`;
let manifest = null, manifestAt = 0;
export async function loadImages(force = false) {
  if (!force && manifest && Date.now() - manifestAt < 60e3) return manifest;
  try { const r = await fetch("/api/rental/scene-images"); manifest = r.ok ? (await r.json()).images || {} : {}; } catch { manifest = manifest || {}; }
  manifestAt = Date.now();
  return manifest;
}
export async function fetchTalk(payload) {
  try {
    const r = await fetch("/api/rental/scene-talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.lines) && j.lines.length) return j; }
  } catch { /* 沒網路：下面的保底 */ }
  return { lines: [{ side: "client", text: "……" }, { side: "wife", text: "嗯……" }], ai: false };
}
/** box：.box 元素；ctx：{ venue, act, step, cums, girl, client, girlName, clientName }。回 { close() }。 */
export function openTalk(box, ctx) {
  if (!document.getElementById("rs-talk-css")) { const st = document.createElement("style"); st.id = "rs-talk-css"; st.textContent = CSS; document.head.append(st); }
  box.querySelector(".rs-talk")?.remove();
  const el = document.createElement("div");
  el.className = "rs-talk";
  el.innerHTML = `<div class="hd"><span></span><button type="button" aria-label="關閉">×</button></div><div class="pic"><div class="none">圖片載入中…</div></div><div class="lines"><div class="wait">他們在說話……</div></div>`;
  el.querySelector(".hd span").textContent = `${LOC_ZH[ctx.act.loc]}・${POSE_ZH[ctx.act.pose]}`;
  let closed = false;
  const close = () => { closed = true; el.remove(); };
  el.querySelector(".hd button").addEventListener("click", close);
  box.append(el);
  void loadImages().then((m) => {
    if (closed) return;
    const urls = ((m?.[ctx.venue] || {})[slotKey(ctx.act)] || []).filter(Boolean), pic = el.querySelector(".pic");
    if (!urls.length) { pic.innerHTML = `<div class="none">這個房型還沒有這個姿勢的圖（test_room「旅館圖」按鈕可以生）</div>`; return; }
    const img = new Image(); img.alt = ""; img.src = urls[Math.floor(Math.random() * urls.length)]; pic.replaceChildren(img);
  });
  void fetchTalk({ venue: ctx.venue, loc: ctx.act.loc, pose: ctx.act.pose, step: ctx.step, cums: ctx.cums, girl: ctx.girl, client: ctx.client }).then(async (j) => {
    if (closed) return;
    const box2 = el.querySelector(".lines"); box2.replaceChildren();
    for (const l of j.lines) {
      if (closed) return;
      const d = document.createElement("div"); d.className = `l ${l.side === "client" ? "client" : "wife"}`;
      d.textContent = `${l.side === "client" ? ctx.clientName || "客人" : ctx.girlName || "她"}：${l.text}`;
      box2.append(d); box2.scrollTop = box2.scrollHeight;
      await new Promise((r) => setTimeout(r, 900));
    }
  });
  return { close, el };
}
