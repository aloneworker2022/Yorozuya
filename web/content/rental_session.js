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
.rs-talk img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
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
    const urls = ((m?.[ctx.venue] || {})[slotKey(ctx.act)] || []).filter(Boolean);
    if (!urls.length) return;
    const img = new Image(); img.alt = ""; state.pic = img.src = urls[Math.floor(Math.random() * urls.length)];
    el.classList.add("pic"); el.prepend(img); place();
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
