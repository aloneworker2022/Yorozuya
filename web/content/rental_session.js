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

// ------------------------------------------------------------ 點人物 → AI 圖＋即時對話（2026-10-17 改：跟接客偷看一樣用場景上的字幕泡泡）
// 圖（這個房型＋地點姿勢，兩張隨機一張）鋪滿畫面；對話不是列表，而是偷看那套：客人藍字泡泡在右、她粉字泡泡在左（頭附近），
// 一句一句冒（2～4 秒一句、停 1.7 秒），她的句子照叫聲類型／個性加尾音（escort_voices.flavorWife）；講完再跟伺服器要新的一段（即時產生）。
// 還沒有圖：泡泡直接冒在房間畫面上、對齊兩個人的位置。點一下畫面（或 ×）回到房間。
import { nextGapMs, flavorWife } from "./escort_voices.js?v=3";
const CSS = `
.rs-talk{position:absolute;inset:0;z-index:3;touch-action:manipulation}
.rs-talk.pic{background:#000}
.rs-talk:not(.pic) .ttl{display:none}
.rs-talk img,.rs-talk canvas.rs-comp{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.rs-talk .peek-bub{position:absolute;max-width:46%;padding:3px 7px;border-radius:7px;font:600 13px/1.3 system-ui,sans-serif;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .25s,transform .25s;white-space:normal}
.rs-talk .peek-bub.on{opacity:1;transform:none}
.rs-talk .peek-bub.c{background:rgba(20,30,70,.82);color:#8fb2ff;border:1px solid #3f62c0}
.rs-talk .peek-bub.w{background:rgba(60,20,40,.82);color:#ffb0cf;border:1px solid #c0608c}
.rs-talk .ttl{position:absolute;left:0;right:0;top:4.5%;text-align:center;color:#e8b4cf;font:600 14px/1.3 "Fusion Pixel",system-ui,sans-serif;text-shadow:0 1px 0 #000,0 0 4px #000;pointer-events:none}
.rs-talk .x{position:absolute;top:8px;right:8px;background:none;border:0;color:#ddd;font-size:22px;box-shadow:none;cursor:pointer}`;
let manifest = null, manifestAt = 0;
export async function loadImages(force = false) {
  if (!force && manifest && Date.now() - manifestAt < 60e3) return manifest;
  try { const r = await fetch("/api/rental/scene-images"); manifest = r.ok ? (await r.json()).images || {} : {}; } catch { manifest = manifest || {}; }
  manifestAt = Date.now();
  return manifest;
}
/** 這段的圖：先找「這個她＋這個客人」→「這個她（任何客人）」→ 通用（2026-10-17 Al：長相要對得上）。owners＝["她id|客人id", "她id|*"]。 */
export function ownersOf(girlId, clientId) {
  const ok = (x) => /^[A-Za-z0-9_-]{1,64}$/.test(String(x || ""));
  if (!ok(girlId)) return [];
  return [...(ok(clientId) ? [`${girlId}|${clientId}`] : []), `${girlId}|*`];
}
export function pickUrls(m, venue, key, owners = []) {
  const v = m?.[venue] || {};
  for (const o of owners) { const u = ((v["@" + o] || {})[key] || []).filter(Boolean); if (u.length) return u; }
  return (v[key] || []).filter(Boolean);
}
/** 2026-10-18 Al：點人物的圖＝遊戲自己的房間（當下那張點陣場景）＋AI 畫的兩個人（去背透明 PNG），顯示時合成。
 *  兩個人放在點陣情侶的框（rental_couple 用房間投影放在床面／浴缸上的那個框）：底對齊、置中、縮進框裡；泡澡在下半身疊水。
 *  room：195×422 房間 canvas；box：{x0,y0,x1,y1}（同座標）；回 canvas（4 倍），圖不是去背的（舊版整張圖）→ null。 */
export async function composeScene(room, url, box, key, venue, K = 4) {
  const im = await new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = url; });
  const t = document.createElement("canvas"); t.width = t.height = 4;
  const tg = t.getContext("2d", { willReadFrequently: true }); tg.drawImage(im, 0, 0, 2, 2, 0, 0, 2, 2);
  if (tg.getImageData(0, 0, 1, 1).data[3] > 200) return null;   // 角落不透明＝舊版合成好的整張圖
  const W = room.width, H = room.height, out = document.createElement("canvas"); out.width = W * K; out.height = H * K;
  const g = out.getContext("2d");
  g.imageSmoothingEnabled = false; g.drawImage(room, 0, 0, W * K, H * K);
  const bw = (box.x1 - box.x0 + 1) * K, bh = (box.y1 - box.y0 + 1) * K;
  const k = Math.min(bh / im.height, (bw * 1.15) / im.width), dw = im.width * k, dh = im.height * k;
  const cx = ((box.x0 + box.x1 + 1) / 2) * K, by = (box.y1 + 1) * K, dx = cx - dw / 2, dy = by - dh;
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.save(); g.fillStyle = "rgba(0,0,0,0.3)"; g.filter = `blur(${2 * K}px)`;
  g.beginPath(); g.ellipse(cx, by - K, dw * 0.45, Math.max(2 * K, dh * 0.04), 0, 0, Math.PI * 2); g.fill(); g.restore();
  g.drawImage(im, dx, dy, dw, dh);
  if (key === "bath_soak") {
    const wy = by - dh * 0.42, col = venue === "hotel" ? [70, 150, 235] : venue === "motel" ? [90, 160, 200] : [120, 175, 190];
    const gr = g.createLinearGradient(0, wy, 0, by);
    gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col.map((x) => Math.round(x * 0.6))},0.85)`);
    g.fillStyle = gr; g.fillRect(dx - dw * 0.06, wy, dw * 1.12, by - wy);
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = K * 0.75;
    g.beginPath(); for (let x = dx - dw * 0.06; x <= dx + dw * 1.06; x += K * 1.5) g.lineTo(x, wy + Math.sin(x / (K * 3)) * K * 0.6); g.stroke();
  }
  return out;
}
/** 點陣情侶一整圈的聯集框（合成時用；比單格穩）。 */
export function unionBox(frames) {
  let b = null;
  for (const f of frames || []) { const x = f?.box; if (!x) continue; b = b ? { x0: Math.min(b.x0, x.x0), y0: Math.min(b.y0, x.y0), x1: Math.max(b.x1, x.x1), y1: Math.max(b.y1, x.y1) } : { ...x }; }
  return b;
}
export async function fetchTalk(payload) {
  try {
    const r = await fetch("/api/rental/scene-talk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    if (r.ok) { const j = await r.json(); if (Array.isArray(j.lines) && j.lines.length) return j; }
  } catch { /* 沒網路：下面的保底 */ }
  return { lines: [{ side: "client", text: "……" }, { side: "wife", text: "嗯……" }], ai: false };
}
/** box：.box 元素；ctx：{ venue, act, step, cums, girl, client, voice, family, box（兩人在畫面上的框，195×422 像素）}。回 { close(), el, state }。 */
export function openTalk(box, ctx) {
  if (!document.getElementById("rs-talk-css")) { const st = document.createElement("style"); st.id = "rs-talk-css"; st.textContent = CSS; document.head.append(st); }
  box.querySelector(".rs-talk")?.remove();
  const el = document.createElement("div");
  el.className = "rs-talk";
  el.innerHTML = `<div class="ttl"></div><div class="peek-bub c"></div><div class="peek-bub w"></div><button type="button" class="x" aria-label="回到房間">×</button>`;
  el.querySelector(".ttl").textContent = `${LOC_ZH[ctx.act.loc]}・${POSE_ZH[ctx.act.pose]}`;
  const bubC = el.querySelector(".peek-bub.c"), bubW = el.querySelector(".peek-bub.w");
  const state = { closed: false, lines: [], said: [], pic: "" };
  let timer = 0, busy = false;
  const close = () => { state.closed = true; clearTimeout(timer); el.remove(); };
  el.addEventListener("click", close);
  box.append(el);
  // 沒有圖：泡泡貼著兩個人（框的上緣）；有圖：照偷看的固定位置
  const place = () => {
    const b = ctx.box;
    if (!state.pic && b) {
      const top = Math.max(14, (b.y0 / 422) * 100 - 9), mid = ((b.x0 + b.x1) / 2 / 195) * 100;
      bubW.style.top = `${top + 4}%`; bubW.style.left = `${Math.max(2, Math.min(52, mid - 40))}%`; bubW.style.right = "";
      bubC.style.top = `${top - 3}%`; bubC.style.right = `${Math.max(2, Math.min(52, 60 - mid))}%`; bubC.style.left = "";
    } else {
      bubC.style.top = "33%"; bubC.style.right = "6%"; bubC.style.left = "";
      bubW.style.top = `${43 + (ctx.act.pose === "missionary" ? 13 : ctx.act.pose === "doggy" ? 10 : 0)}%`; bubW.style.left = "5%"; bubW.style.right = "";
    }
  };
  place();
  void loadImages().then((m) => {
    if (state.closed) return;
    const urls = pickUrls(m, ctx.venue, slotKey(ctx.act), ctx.owners || []);
    if (!urls.length) return;
    const url = urls[Math.floor(Math.random() * urls.length)];
    const show = (node) => { if (state.closed) return; state.pic = url; el.classList.add("pic"); el.prepend(node); place(); };
    const asImg = () => { const img = new Image(); img.alt = ""; img.src = url; show(img); };
    if (ctx.room && ctx.place) {
      composeScene(ctx.room, url, ctx.place, slotKey(ctx.act), ctx.venue).then((c) => { if (!c) return asImg(); c.className = "rs-comp"; show(c); }).catch(asImg);
    } else asImg();
  });
  const more = async () => {
    if (busy) return; busy = true;
    try {
      const j = await fetchTalk({ venue: ctx.venue, loc: ctx.act.loc, pose: ctx.act.pose, step: ctx.step, cums: ctx.cums, girl: ctx.girl, client: ctx.client });
      state.lines.push(...j.lines); state.ai = j.ai;
    } finally { busy = false; }
  };
  const say = async () => {
    if (state.closed) return;
    if (!state.lines.length) await more();
    if (state.closed) return;
    const l = state.lines.shift();
    if (l) {
      const side = l.side === "client" ? "client" : "wife", bub = side === "client" ? bubC : bubW;
      const text = side === "wife" ? flavorWife(l.text, { voice: ctx.voice || "", family: ctx.girl?.family || "" }) : l.text;
      state.said.push({ side, text });
      bub.textContent = text; bub.classList.add("on");
      clearTimeout(bub._t); bub._t = setTimeout(() => bub.classList.remove("on"), 1700);
      if (state.lines.length <= 1) void more();   // 快講完就先要下一段（即時產生）
    }
    timer = setTimeout(say, nextGapMs());
  };
  timer = setTimeout(say, 700);
  return { close, el, state };
}
