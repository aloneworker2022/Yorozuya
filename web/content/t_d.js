/** t_d 約會測試機。舊 testdate.js 不動。聊天輸入走看板叫名那套，劇本在 /edit_date。 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";
import { buildSystemPrompt } from "./persona_builder.js";
import {
  DATE_ACT_ZH,
  DEFAULT_DATE_SCRIPT,
  normalizeDateScript,
  classifyDateLine,
} from "./edit_date.js";
import { fillBinds, bindHint } from "./script_mode.js";
import { filledPack, normalizeMolestPack, buildMolestImgBody } from "./date_molest.js";
import { pickDateOutfit, girlForDate, dateOutfitText } from "./date_outfit.js";
import { placeZh, fillPlaceTokens } from "./date_place.js";

const DEFAULT_ENDPOINT = "http://192.168.68.55:11434";
const DEFAULT_MODEL = "e-girl:latest";
const TIMES = [
  { id: "morning", name: "早上" },
  { id: "afternoon", name: "下午" },
  { id: "evening", name: "晚上" },
  { id: "night", name: "深夜" },
];
const ZONES = [
  { id: "plaza", name: "廣場" },
  { id: "toilet", name: "廁所" },
  { id: "woods", name: "森林區" },
  { id: "play", name: "遊戲區" },
  { id: "path", name: "步道區" },
];
const RELS = [
  { id: "stranger", name: "陌生" },
  { id: "friend", name: "朋友" },
  { id: "girlfriend", name: "女友" },
  { id: "wife", name: "妻子" },
];
/** 店頭調戲同一套，但約會現場陌生會鬆一點。 */
const REL_TEASE = {
  stranger: "態度鎖定【害羞＋無奈＋想擋】。你們約出來了，不必盛怒仇視，可是也不配合。可罵「你認真的」「這裡有人」，可結巴、別開臉。禁止享受、撒嬌、求更多。",
  friend: "態度鎖定【憤怒＋羞恥】。你們是朋友，他不該這樣。可罵太過分；禁止主動配合或女友式撒嬌。身體若有反應，更羞、更氣。",
  girlfriend: "態度鎖定【羞恥但身體在享受】。可嗔「討厭」「羞死了」，底下是情動，不是恨。禁止盛怒仇視。",
  wife: "態度鎖定【順從＋享受＋投入】。身體是日常親密。可軟、可直接。禁止陌生式怒罵推開。",
};
/** 約會比店頭鬆：尤其陌生——人已經願意出門。 */
const DATE_REL_OPEN = {
  stranger:
    "【約會微調·陌生】這段蓋過上方關係裡「幾乎不主動／只回一句」。你們已經約出來了，比店頭戒備鬆：可以接話、可以吐槽這場約會，不必每句只回一個字。稱呼仍不親暱。身體或性話題仍算越界，用害羞／無奈／小聲擋，不要一上來就當仇敵盛怒。還沒答應交往，保持距離，可是人已經在現場。",
  friend: "【約會微調】照朋友關係。人已經在約會現場，比店頭再自然一點。",
  girlfriend: "【約會微調】照女友關係。這是約會，可以更黏、更在場。",
  wife: "【約會微調】照妻子關係。出門約會是日常。",
};
const NEXT = { plaza: "path", path: "play", play: "woods", woods: "toilet", toilet: "plaza" };
const EAT_COST = { morning: 20, afternoon: 40, evening: 60, night: 30 };
const STAMINA_MAX = 10;
const AROUSAL_MAX = 20;
const SHAME_MAX = 15;
const OBEY_MAX = 35;
const HYPE_MAX = 8;
const ACT_ZH = DATE_ACT_ZH;
/** 猥褻成功分母：1/n；妻子 n=1 必成 */
const MOLEST_ODDS = {
  stranger: 10,
  friend: 8,
  girlfriend: 4,
  wife: 1,
};

function molestOddsDenom() {
  const n = MOLEST_ODDS[relStage];
  return Number.isFinite(n) && n > 0 ? n : 10;
}

function molestOddsZh() {
  const n = molestOddsDenom();
  return n <= 1 ? "必成" : `1/${n}`;
}

/** @returns {{ ok: boolean, oddsZh: string }} */
function rollMolestSuccess() {
  const n = molestOddsDenom();
  if (n <= 1) return { ok: true, oddsZh: "必成" };
  return { ok: Math.random() < 1 / n, oddsZh: `1/${n}` };
}


const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

let cards = [];
let dateScript = normalizeDateScript(DEFAULT_DATE_SCRIPT);
let girl = null;
let dateOutfit = null; // { text, index, girlId }
let relStage = "stranger";
let busy = false;
let started = false;
let paging = false;
let waitingAi = false;
let pendingResolve = false;
let cgOpen = false;
let cgGirlReady = false;
let cgCloseResolve = null;

/** 強制關掉覆蓋層（後台逃生／卡住時） */
function openAdminPanel() {
  // 先關覆蓋層（中止這一輪），後台一定要壓在最上層
  if (cgOpen) forceCloseCg(true);
  const el = $("admin");
  if (!el) return;
  el.style.zIndex = "100";
  el.classList.add("on");
}

function forceCloseCg(resolveOk = true) {
  const ov = $("cg-overlay");
  const img = $("cg-img");
  if (img) img.removeAttribute("src");
  if (ov) {
    ov.classList.remove("on");
    ov.setAttribute("aria-hidden", "true");
    ov.dataset.phase = "player";
  }
  const done = cgCloseResolve;
  cgOpen = false;
  cgGirlReady = false;
  cgCloseResolve = null;
  if (resolveOk && typeof done === "function") done({ aborted: true });
  renderHud();
}

let queue = [];
const state = emptyState();

function emptyState() {
  return {
    time: "morning",
    zone: "plaza",
    stamina: STAMINA_MAX,
    arousal: 0,
    shame: 0,
    heart: 0,
    money: 200,
    ended: false,
    card: null,
    used: [],
    usedLines: {},
    arrive: "",
    male: null,
    round: 0,
    lastGirlLine: "",
    molestImgs: {},
  };
}

/** exitPaging 完成時 resolve；供猜招戰串場用 */
let pagingWaiters = [];
function notifyPagingDone() {
  const list = pagingWaiters;
  pagingWaiters = [];
  for (const fn of list) {
    try { fn(); } catch { /* ignore */ }
  }
}

function lsGet(k, d) {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch {
    return d;
  }
}
function lsSet(k, v) {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* ignore */
  }
}

function clamp(n, max) {
  return Math.max(0, Math.min(max, n));
}
function tier(n, kind) {
  if (kind === "shame") {
    if (n >= 10) return "high";
    if (n >= 5) return "mid";
    return "low";
  }
  if (n >= 14) return "high";
  if (n >= 7) return "mid";
  return "low";
}
function obeyScore() {
  return state.arousal + state.shame;
}
function obeyLevel() {
  const n = obeyScore();
  if (n >= 21) return "obey";
  if (n >= 11) return "answer";
  return "resist";
}
function obeyZh() {
  return { resist: "抗拒", answer: "回應", obey: "順從" }[obeyLevel()];
}
function tierZh(t) {
  return { low: "低", mid: "中", high: "高" }[t] || t;
}
function zoneOf(id) {
  return ZONES.find((z) => z.id === id) || ZONES[0];
}
function timeOf(id) {
  return TIMES.find((t) => t.id === id) || TIMES[0];
}
function relOf(id) {
  return RELS.find((r) => r.id === id) || RELS[0];
}
function normalizeEndpoint(raw) {
  let s = String(raw || "").trim();
  if (!s) return DEFAULT_ENDPOINT;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  s = s.replace(/\/+$/, "");
  const host = s.replace(/^https?:\/\//i, "");
  if (!/:\d+/.test(host.split("/")[0])) s += ":11434";
  return s;
}
function aiCfg() {
  const endpoint = normalizeEndpoint($("t-endpoint")?.value || DEFAULT_ENDPOINT);
  const model = ($("t-model")?.value || "").trim() || DEFAULT_MODEL;
  if ($("t-endpoint") && $("t-endpoint").value !== endpoint) $("t-endpoint").value = endpoint;
  lsSet("t_d.endpoint", endpoint);
  lsSet("t_d.model", model);
  return { provider: "ollama", endpoint, model };
}

function renderHud() {
  $("stamina-n").textContent = `${state.stamina}/${STAMINA_MAX}`;
  $("arousal-n").textContent = `${state.arousal}/${AROUSAL_MAX}`;
  $("shame-n").textContent = `${state.shame}/${SHAME_MAX}`;
  $("heart-n").textContent = String(state.heart);
  $("money-n").textContent = String(state.money);
  $("stamina-bar").style.width = `${(state.stamina / STAMINA_MAX) * 100}%`;
  $("arousal-bar").style.width = `${(state.arousal / AROUSAL_MAX) * 100}%`;
  $("shame-bar").style.width = `${(state.shame / SHAME_MAX) * 100}%`;
  const obeyN = $("obey-n");
  const obeyBar = $("obey-bar");
  if (obeyN) obeyN.textContent = `${obeyZh()} ${obeyScore()}`;
  if (obeyBar) obeyBar.style.width = `${(obeyScore() / OBEY_MAX) * 100}%`;
  $("hud")?.classList.toggle("has-male", !!(state.male?.onField || state.male?.appeared));
  const hypeN = $("hype-n");
  const hypeBar = $("hype-bar");
  if (hypeN) {
    const hv = state.male?.onField ? (state.male.hype ?? 0) : 0;
    hypeN.textContent = `${hv}/${HYPE_MAX}`;
  }
  if (hypeBar) {
    const hv = state.male?.onField ? (state.male.hype ?? 0) : 0;
    hypeBar.style.width = `${(hv / HYPE_MAX) * 100}%`;
  }
  document.body.dataset.time = state.time;
  $("zone-name").textContent = zoneOf(state.zone).name;
  const desc = $("zone-desc");
  if (desc) desc.textContent = state.card ? state.card.scene : "";
  const who = $("girl-now");
  if (who) {
    let t = girl
      ? `${girl.name} · ${relOf(relStage).name} · ${girl.archetype || (girl.personality || []).join("、")} · ${girl.job || ""}`
      : "";
    if (state.male?.onField) t += ` · ${state.male.name}`;
    who.textContent = t;
  }
  document.querySelectorAll("#times .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === state.time));
  document.querySelectorAll("#zones .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === state.zone));
  document.querySelectorAll("#rels .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === relStage));
  $("acts-bar")?.classList.toggle("paging", paging);
  $("acts-bar")?.classList.toggle("cg-open", cgOpen);
  $("acts-bar")?.classList.toggle("no-chat", !started || state.ended);
  const maleField = !!state.male?.onField && !state.ended && !state.male?.sex;
  const maleFree = maleField && (state.male.freeTurns > 0);
  $("acts")?.classList.toggle("has-male", maleField);
  $("acts")?.classList.toggle("male-free", maleFree);
  const chatOn = started && !busy && !paging && !state.ended && state.stamina > 0 && !!state.card && !state.male?.onField;
  const input = $("date-input");
  const send = $("date-send");
  if (input) input.disabled = !chatOn;
  if (send) send.disabled = !chatOn;
  const rescueBtn = document.querySelector('[data-act="rescue"]');
  if (rescueBtn) {
    rescueBtn.textContent = state.male?.onField
      ? `帶女子脫離騷擾 ${escapeOddsZh()}`
      : "帶女子脫離騷擾";
  }
  const next = $("btn-next");
  if (next) {
    next.disabled = waitingAi || cgOpen;
    next.textContent = waitingAi ? "……" : "下一頁";
    next.hidden = !!cgOpen;
  }
  document.querySelectorAll("#acts .act").forEach((el) => {
    const act = el.dataset.act;
    if (act === "admin") {
      // 只在玩家行動列可見時可按（與調戲／猥褻同一時段）
      el.disabled = !started || busy || paging || cgOpen || state.ended;
      return;
    }
    if (!started || busy || paging || cgOpen) {
      el.disabled = true;
      return;
    }
    if (state.ended) {
      el.disabled = act !== "end";
      return;
    }
    const maleOn = !!state.male?.onField && !state.male?.sex;
    const freeWatch = maleOn && (state.male.freeTurns > 0);
    if (freeWatch) {
      el.disabled = true;
      return;
    }
    if (act === "eat") {
      el.disabled = state.money < EAT_COST[state.time];
    } else if (act === "block-tease" || act === "block-molest") {
      el.disabled = !maleOn || state.stamina <= 0;
    } else if (act === "rescue") {
      el.disabled = !maleOn;
    } else if (act === "tease" || act === "talk" || act === "molest") {
      el.disabled = state.stamina <= 0 || maleOn;
    } else if (act === "end") {
      el.disabled = maleOn;
    } else {
      el.disabled = maleOn;
    }
    if (act === "molest") {
      el.textContent = `猥褻（${molestOddsZh()}）`;
    }
  });
}

function addBubble(role, who, text, extra, img) {
  $("empty")?.remove();
  const div = document.createElement("div");
  div.className = "bubble " + role;
  div.innerHTML = `<div class="who">${esc(who)}</div><div class="tx"></div>`
    + (img ? `<div class="cg"><img alt=""></div>` : "")
    + (extra ? `<div class="delta"></div>` : "");
  const tx = div.querySelector(".tx");
  if (img) {
    tx.textContent = text && !String(text).startsWith("/assets/") ? text : "";
    const im = div.querySelector(".cg img");
    if (im) im.src = img;
  } else {
    tx.textContent = text;
  }
  if (extra) div.querySelector(".delta").textContent = extra;
  $("log").appendChild(div);
  $("log").scrollTop = $("log").scrollHeight;
  return div;
}

function clearLog(html) {
  $("log").innerHTML = html || "";
}

function enterPaging() {
  paging = true;
  renderHud();
}

function resolveAfterRound() {
  if (state.ended) return;
  if (Math.random() < 0.25) {
    const to = NEXT[state.zone];
    if (cards.some((c) => c.zone === to)) state.zone = to;
  }
  drawCard();
}

async function exitPaging() {
  const shouldResolve = pendingResolve && started && !state.ended;
  pendingResolve = false;
  paging = false;
  waitingAi = false;
  queue = [];
  busy = false;
  notifyPagingDone();
  if (shouldResolve) resolveAfterRound();
  if (shouldResolve && (await maybeMaleBeat())) return;
  renderHud();
  if (started && !state.ended) $("date-input")?.focus();
}

async function showPage(item) {
  clearLog("");
  if (item.load) {
    waitingAi = true;
    renderHud();
    addBubble(item.role, item.who, "……");
    try {
      item.text = await item.load();
    } catch (e) {
      item.text = item.fallback || "……";
      item.extra = e.message;
    }
    waitingAi = false;
    clearLog("");
  }
  addBubble(item.role, item.who, item.text, item.extra, item.img);
  if (item.role === "girl") state.lastGirlLine = item.text;
  renderHud();
}

async function advance() {
  if (!paging || waitingAi || cgOpen) return;
  if (!queue.length) {
    await exitPaging();
    return;
  }
  await showPage(queue.shift());
}

function enqueue(item) {
  queue.push(item);
}

async function playQueue(first) {
  enterPaging();
  queue = first.slice(1);
  await showPage(first[0]);
}

function setAdminStatus(msg, err) {
  const el = $("admin-status");
  if (!el) return;
  el.textContent = msg || "";
  el.style.color = err ? "#ff5f7a" : "#6bcb77";
}

function renderGirlAdmin() {
  const el = $("admin-girl");
  if (!el) return;
  if (!girl) {
    el.textContent = "還沒抽妹子。";
    return;
  }
  const mark = RARITY_MARK[girl.rarity] || "";
  el.innerHTML = `<b>${esc(girl.name)}</b> ${esc(mark + (girl.rarity || ""))}<br>${esc(relOf(relStage).name)} · ${esc((girl.personality || []).join("、"))} · ${esc(girl.job || "")}`;
}

function pickArrive() {
  const modes = ["player_wait", "girl_wait"];
  return modes[Math.floor(Math.random() * modes.length)];
}

/** 預產圖期間的開場旁白（不含省略號；省略號由動畫補上）。 */
function arriveLoadingText(mode, name) {
  if (mode === "girl_wait") return `你正在趕路去見${name}`;
  return `你先到了。正在等${name}`;
}

/** 預產完成後的真正抵達旁白。 */
function arriveText(mode, name) {
  if (mode === "girl_wait") return `你趕到時，${name}已經在長椅那邊等你了。`;
  return `過了一會兒，${name}從入口走過來。`;
}

const ENG_KEY = "yoro_testword_engines";

function engFromLs() {
  let e = {
    imgProvider: "grok-img",
    imgModel: "grok-4.5",
    llmProvider: "grok-build",
    llmModel: "grok-4.5",
    comfyUrl: "",
    comfyCkpt: "",
  };
  try {
    e = { ...e, ...JSON.parse(localStorage.getItem(ENG_KEY) || "{}") };
  } catch {
    /* ignore */
  }
  return e;
}

/** 讀 localStorage 引擎，並合併存檔 settings 的 imgProvider／comfyUrl。 */
async function getImgEng() {
  const e = engFromLs();
  try {
    const r = await fetch("/api/save", { cache: "no-store" });
    const j = await r.json();
    const s = j?.data?.settings || {};
    if (s.imgProvider) e.imgProvider = s.imgProvider === "comfy" ? "comfy" : s.imgProvider;
    if (s.comfyUrl) e.comfyUrl = s.comfyUrl;
  } catch {
    /* 沒存檔就用 LS／預設 */
  }
  return e;
}

async function apiJson(url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || r.status);
  return j;
}

/** 同 edit_date：POST /api/imggen 再輪詢至 done／error。 */
async function waitImg(body, ms = 360000) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
}

/** 省略號循環＋可選進度（done/total）。回傳 stop 函式。 */
function startArriveDots(txEl, base, getProgress) {
  const frames = ["…", "……", "………"];
  let i = 0;
  const tick = () => {
    if (!txEl) return;
    const p = typeof getProgress === "function" ? getProgress() : null;
    const suf = p && p.total > 0 ? `（${p.done}/${p.total}）` : "";
    txEl.textContent = base + frames[i % frames.length] + suf;
    i += 1;
  };
  tick();
  const id = setInterval(tick, 450);
  return () => clearInterval(id);
}

/**
 * 約會開場前依序預產所有有參考圖的猥褻包。
 * 結果寫入 state.molestImgs[packId]；失敗不中止整場約會。
 */
async function pregenMolestImages(onProgress) {
  state.molestImgs = {};
  const packs = (dateScript.molestPacks || []).map(normalizeMolestPack);
  const need = packs.filter((p) => String(p.slot?.ref || "").trim());
  if (!need.length) {
    if (onProgress) onProgress(0, 0);
    return;
  }
  const eng = await getImgEng();
  const g = girl;
  for (let i = 0; i < need.length; i += 1) {
    if (onProgress) onProgress(i, need.length);
    const pack = need[i];
    const placeId = pack.placeId || "plaza";
    try {
      const built = await buildMolestImgBody(pack, g, eng, "anime", relStage, placeId);
      const r = await waitImg(built.body);
      if (r.status === "done" && r.result) {
        state.molestImgs[pack.id] = String(r.result).split("?")[0];
      } else {
        console.warn("[t_d] molest pregen failed", pack.id || pack.name, r.error || r.status);
      }
    } catch (err) {
      console.warn("[t_d] molest pregen error", pack.id || pack.name, err);
    }
    if (onProgress) onProgress(i + 1, need.length);
  }
}

function matchingCards() {
  const sh = tier(state.shame, "shame");
  const ar = tier(state.arousal, "arousal");
  const exact = cards.filter(
    (c) => c.zone === state.zone && c.time === state.time && c.shame === sh && c.arousal === ar,
  );
  if (exact.length) return exact;
  return cards.filter((c) => c.zone === state.zone && c.time === state.time);
}

function actionPool(spec) {
  if (!spec) return [];
  if (Array.isArray(spec)) return spec.filter((x) => x && x.player);
  if (spec.player) return [spec];
  return [];
}

function pickActionLine(card, act) {
  const pool = actionPool(card.actions?.[act]);
  if (!pool.length) return null;
  const key = `${card.id}:${act}`;
  const used = state.usedLines[key] || [];
  const left = pool.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : pool.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  state.usedLines[key] = left.length ? used.concat(chosen) : [chosen];
  return pool[chosen];
}


function ensureDateOutfit() {
  if (!girl) return { text: "便服", index: 0, girlId: "" };
  if (!dateOutfit || dateOutfit.girlId !== girl.id) {
    dateOutfit = pickDateOutfit(girl, relStage);
  }
  return dateOutfit;
}

function datedGirl() {
  return girlForDate(girl, ensureDateOutfit());
}

function fillDateText(text) {
  return fillPlaceTokens(fillBinds(text, datedGirl() || girl), state.zone || "plaza");
}

function fillActSpec(spec) {
  if (!spec) return null;
  // molest packs 已在 pickMolestSpec 展開標註
  if (spec.attitude != null || spec.feel != null) return { ...spec };
  return {
    ...spec,
    narr: fillDateText(spec.narr),
    player: fillDateText(spec.player),
  };
}

function pickMolestSpec() {
  const packs = (dateScript.molestPacks || []).map(normalizeMolestPack);
  if (!packs.length) return null;
  const usedKey = "edit:molest-pack";
  const used = state.usedLines[usedKey] || [];
  const left = packs.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : packs.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  state.usedLines[usedKey] = left.length ? used.concat(chosen) : [chosen];
  const pack = packs[chosen];
  const f = filledPack(pack, datedGirl() || girl, "你", state.zone || pack.placeId || "plaza");
  const pre = state.molestImgs?.[pack.id] || "";
  return {
    narr: f.narrPrompt,
    player: f.playerAct,
    attitude: f.attitude,
    feel: f.feelPrompt,
    imgUrl: pre || f.slot?.url || "",
    packName: f.name,
  };
}

function pickScriptLine(act) {
  // 調戲按鈕 → edit_date「調戲（按鈕）」acts.tease
  if (act === "tease" || act === "talk") {
    const pool = actionPool(dateScript.acts?.tease);
    if (!pool.length) return null;
    const usedKey = "edit:tease";
    const used = state.usedLines[usedKey] || [];
    const left = pool.map((_, i) => i).filter((i) => !used.includes(i));
    const pickFrom = left.length ? left : pool.map((_, i) => i);
    const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
    state.usedLines[usedKey] = left.length ? used.concat(chosen) : [chosen];
    return pool[chosen];
  }
  if (act === "molest") return pickMolestSpec();
  const pool = actionPool(dateScript.acts?.[act]);
  if (!pool.length) return null;
  const usedKey = `edit:${act}`;
  const used = state.usedLines[usedKey] || [];
  const left = pool.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : pool.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  state.usedLines[usedKey] = left.length ? used.concat(chosen) : [chosen];
  return pool[chosen];
}

function drawCard() {
  const pool = matchingCards();
  if (!pool.length) return null;
  const fresh = pool.filter((c) => !state.used.includes(c.id));
  const src = fresh.length ? fresh : pool;
  const card = src[Math.floor(Math.random() * src.length)];
  state.card = card;
  state.used.push(card.id);
  if (state.used.length > 12) state.used.shift();
  return card;
}

function cleanLine(raw, who) {
  let s = String(raw || "").trim();
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").trim();
  s = s.replace(/^```[\s\S]*?```/g, "").trim();
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((l) => !/^#\S/.test(l) && !/^【/.test(l));
  s = (kept.length ? kept : lines).join("\n").trim();
  if (who) {
    const re = new RegExp(`^(?:${who}|她|他)\\s*[:：]\\s*`, "i");
    s = s.replace(re, "");
  }
  s = s.replace(/^(?:台詞|動作|旁白)\s*[:：]\s*/gm, "");
  s = s.replace(/^["「『]+|["」』]+$/g, "").trim();
  return s;
}

async function llmChat(messages) {
  const { provider, endpoint, model } = aiCfg();
  const startRes = await fetch("/api/llm/chat_job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      endpoint,
      model,
      messages,
      options: { temperature: 0.85, num_predict: 180 },
    }),
  });
  if (!startRes.ok) throw new Error("連不上遊戲伺服器");
  const { job_id } = await startRes.json();
  const t0 = Date.now();
  let acc = "";
  let fails = 0;
  while (true) {
    await new Promise((r) => setTimeout(r, 350));
    if (Date.now() - t0 > 180000) throw new Error("模型逾時");
    let j;
    try {
      const r = await fetch(`/api/llm/chat_job/${job_id}`, { cache: "no-store" });
      if (r.status === 404) throw new Error("回覆已過期");
      if (!r.ok) throw new Error("http " + r.status);
      j = await r.json();
      fails = 0;
    } catch (e) {
      if (++fails > 40) throw new Error(e.message || "網路中斷");
      continue;
    }
    if (j.error) throw new Error(j.error);
    if (j.text) acc = j.text;
    if (j.done) {
      if (!String(acc || "").trim()) throw new Error("模型回了空訊息");
      return acc;
    }
  }
}

async function aiNarrate(hint) {
  try {
    const raw = await llmChat([
      {
        role: "system",
        content: fillDateText(dateScript.narr_system),
      },
      { role: "user", content: `演出方向：${hint}` },
    ]);
    return cleanLine(raw) || hint;
  } catch (e) {
    return hint;
  }
}

function buildDateGirlCtx() {
  const g = datedGirl() || girl || {};
  const worn = dateOutfitText(g, ensureDateOutfit());
  return {
    character: {
      name: g.name || "她",
      rarity: g.rarity,
      personality: g.personality,
      speech_style: g.speech,
      backstory: g.backstory || "",
      tone: g.tone || null,
      catchphrases: g.catchphrases || null,
      reactions: g.reactions || null,
      quirk: g.quirk || null,
      contrast: g.contrast || null,
      likes: g.likes || null,
      dislikes: g.dislikes || null,
      hobbies: g.hobbies || null,
      chrono: g.chrono || null,
      arc: g.arc || null,
      libido: g.libido || null,
      look: g.look || null,
      special_traits: g.specialTraits || null,
      job_desc: g.jobDesc || null,
      outfitPick: g.outfitPick,
    },
    // 約會穿著提示（給 persona／旁白）
    _dateWear: worn,
    relationship: { stage: relStage, progress: null, days_since_summon: 0 },
    scene: {
      type: "date_park",
      time_of_day: state.time,
      time_label: timeOf(state.time).name,
    },
    content_rating: "nsfw",
    player: { name: "你" },
  };
}

function scenePromptBlock(card, narr, act) {
  const zone = zoneOf(state.zone);
  const bits = [
    "【這一拍場景】（看板店頭聊沒有這段；約會要帶進去）",
    `你們正在公園「${zone.name}」約會（${placeZh(state.zone)}）。時段：${timeOf(state.time).name}。人就在他眼前。`,
    `她今天穿著「${dateOutfitText(datedGirl() || girl, ensureDateOutfit())}」。`,
    card?.name ? `場景「${card.name}」：${card.scene}` : "",
    card?.narration ? `場景旁白：${card.narration}` : "",
    narr ? `剛才發生的事：${narr}` : "",
    `這一拍系統判定：${ACT_ZH[act] || act}。`,
    act === "talk" || act === "tease" || act === "molest"
      ? REL_TEASE[relStage] || REL_TEASE.stranger
      : "",
    "把場景裡正在發生的事帶進台詞。不要當沒這回事。不准自己換地、結束約會、口交或做愛。",
  ];
  return bits.filter(Boolean).join("\n");
}

async function aiGirlReply({ card, act, narr, playerLine, delta, attitude, feel }) {
  const name = girl?.name || "她";
  const sys = [
    buildSystemPrompt(buildDateGirlCtx()),
    DATE_REL_OPEN[relStage] || DATE_REL_OPEN.stranger,
    fillDateText(dateScript.girl_system),
    scenePromptBlock(card, narr, act),
    attitude ? `【這一拍態度】${attitude}` : "",
    feel ? `【身體感覺】${feel}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const user = [
    `我：${playerLine}`,
    delta ? `這一拍變化（她感覺得到，不要唸數字）：${delta}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  const raw = await llmChat([
    { role: "system", content: sys },
    { role: "user", content: user },
  ]);
  return cleanLine(raw, name) || "……";
}

function applyAct(act, opts = {}) {
  const bits = [];
  if (act === "eat") {
    const cost = EAT_COST[state.time];
    if (state.money < cost) return { ok: false, reason: "錢不夠。" };
    const gain = 2 + Math.floor(Math.random() * 3);
    state.money -= cost;
    state.stamina = clamp(state.stamina + gain, STAMINA_MAX);
    bits.push(`-${cost} 金　體力 +${gain}`);
    return { ok: true, bits };
  }
  if (state.stamina <= 0) return { ok: false, reason: "體力沒了。" };
  state.stamina = clamp(state.stamina - 1, STAMINA_MAX);
  bits.push("體力 -1");
  if (act === "interact") {
    const bonus = Math.floor(Math.random() * (state.arousal + 1));
    const gain = 1 + bonus;
    state.heart += gain;
    bits.push(`感情 +${gain}`);
  } else if (act === "talk" || act === "tease") {
    state.arousal = clamp(state.arousal + 1, AROUSAL_MAX);
    state.shame = clamp(state.shame + 1, SHAME_MAX);
    bits.push("性慾 +1　羞恥 +1");
  } else if (act === "molest") {
    if (opts.molestOk === false) {
      // 失敗：仍耗體力；羞恥微增、無性慾獎勵
      state.shame = clamp(state.shame + 1, SHAME_MAX);
      bits.push(`猥褻失敗（${opts.oddsZh || molestOddsZh()}）　羞恥 +1`);
    } else {
      state.arousal = clamp(state.arousal + 3, AROUSAL_MAX);
      state.shame = clamp(state.shame + 5, SHAME_MAX);
      bits.push(`猥褻成功（${opts.oddsZh || molestOddsZh()}）　性慾 +3　羞恥 +5`);
    }
  }
  return { ok: true, bits };
}

function endPages() {
  // 單男場上：羞恥／性慾滿 → 開房分岔；體力 0 → 請吃飯流程。不走舊散場。
  if (state.male?.onField && !state.male?.sex) return [];
  if (state.shame >= SHAME_MAX) {
    state.ended = true;
    return [{ role: "sys", who: "散場", text: `${girl?.name || "她"}羞恥全滿，跑掉了。約會結束。` }];
  }
  if (state.stamina <= 0) {
    state.ended = true;
    return [{ role: "sys", who: "散場", text: "體力用完了。約會結束。" }];
  }
  return [];
}

function spawnMale() {
  const types = dateScript?.male?.types || [];
  const list = types.length
    ? types
    : [{ id: "fat", name: "男子", talkWeight: 0.5 }];
  const meta = list[Math.floor(Math.random() * list.length)];
  return {
    type: meta.id,
    name: meta.name || "男子",
    talkWeight: meta.talkWeight ?? 0.5,
    onField: false,
    appeared: false,
    gone: false,
    sex: false,
    hype: HYPE_MAX,
    freeTurns: 0,
    used: {},
    escapeDenom: 15,
  };
}

function escapeDenom() {
  return state.male?.escapeDenom || 15;
}
function escapeChance() {
  return 1 / escapeDenom();
}
function escapeOddsZh() {
  return `1/${escapeDenom()}`;
}

/** 從當前男子種類的池抽旁白+男子台詞（approach / harass / molest / mate / taunt） */
function currentMaleType() {
  const male = dateScript?.male || {};
  const types = Array.isArray(male.types) ? male.types : [];
  const typeId = state.male?.type;
  return types.find((t) => t.id === typeId) || types[0] || null;
}

function pickMaleMolestSpec() {
  const typ = currentMaleType();
  const packs = (typ?.molestPacks || []).map((p) => normalizeMolestPack(p));
  if (!packs.length) return null;
  const usedKey = "molest-pack";
  const m = state.male;
  const used = (m.used[usedKey] || []);
  const left = packs.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : packs.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  m.used[usedKey] = left.length ? used.concat(chosen) : [chosen];
  const pack = packs[chosen];
  const f = filledPack(pack, datedGirl() || girl, typ?.name || state.male?.name || "男子", state.zone || pack.placeId || "plaza");
  return {
    narr: f.narrPrompt || "男子動手猥褻。",
    male: f.playerAct || "……",
    attitude: f.attitude || "",
    feel: f.feelPrompt || "",
    imgUrl: String(f.slot?.url || "").trim(),
    packName: f.name,
  };
}

function pickMaleScriptLine(poolKey) {
  if (poolKey === "molest") {
    const fromPack = pickMaleMolestSpec();
    if (fromPack) return fromPack;
  }
  const typ = currentMaleType();
  const pack = Array.isArray(typ?.[poolKey]) ? typ[poolKey] : [];
  if (!pack.length) {
    return {
      narr: fillDateText("那名男子靠近她。"),
      male: fillDateText("……"),
    };
  }
  const m = state.male;
  const used = (m.used[poolKey] || []);
  const left = pack.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : pack.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  m.used[poolKey] = left.length ? used.concat(chosen) : [chosen];
  const line = pack[chosen] || {};
  return {
    narr: fillDateText(line.narr || "那名男子靠近她。"),
    male: fillDateText(line.male || "……"),
  };
}

/** 舊 talk→harass、touch→molest；猜招用 tease／molest */
function pickMaleLine(kind) {
  const pool =
    kind === "talk" || kind === "tease" || kind === "harass"
      ? "harass"
      : kind === "touch" || kind === "molest"
        ? "molest"
        : kind;
  return pickMaleScriptLine(pool);
}

function pickInterruptOkLine() {
  const pool = actionPool(dateScript.acts?.interruptOk);
  if (!pool.length) {
    return {
      narr: fillDateText("你擋在她身前。"),
      player: fillDateText("別碰她。"),
    };
  }
  const usedKey = "edit:interruptOk";
  const used = state.usedLines[usedKey] || [];
  const left = pool.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : pool.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  state.usedLines[usedKey] = left.length ? used.concat(chosen) : [chosen];
  const line = pool[chosen];
  return {
    narr: fillDateText(line.narr || "你擋在她身前。"),
    player: fillDateText(line.player || "別碰她。"),
  };
}

/** talkWeight 越高 → 越常調戲(tease) */
function maleActKind() {
  const w = state.male.talkWeight ?? 0.5;
  return Math.random() < w ? "tease" : "molest";
}

function maleSucceeds() {
  const lv = obeyLevel();
  if (lv === "resist") return false;
  if (lv === "obey") return true;
  return Math.random() < 0.5;
}

function applyMaleAct(kind) {
  const isMolest = kind === "touch" || kind === "molest" || kind === "mate";
  const a = isMolest ? 2 : 1;
  const s = isMolest ? 2 : 1;
  state.arousal = clamp(state.arousal + a, AROUSAL_MAX);
  state.shame = clamp(state.shame + s, SHAME_MAX);
  return `性慾 +${a}　羞恥 +${s}`;
}

function maleKindZh(kind) {
  if (kind === "approach") return "搭訕";
  if (kind === "talk" || kind === "harass" || kind === "tease") return "調戲";
  if (kind === "touch" || kind === "molest") return "猥褻";
  if (kind === "mate") return "交配請求";
  if (kind === "taunt") return "嘲諷";
  return "接近";
}

/** 簡單二選一／多選一彈窗，回傳 choice.id */
function showChoices({ title, body, choices }) {
  return new Promise((resolve) => {
    const ov = $("overlay");
    const titleEl = $("modal-title");
    const bodyEl = $("modal-body");
    const box = $("modal-choices");
    const ok = $("modal-ok");
    if (!ov || !box) {
      resolve(choices?.[0]?.id || null);
      return;
    }
    if (titleEl) titleEl.textContent = title || "";
    if (bodyEl) bodyEl.textContent = body || "";
    box.hidden = false;
    box.innerHTML = "";
    if (ok) ok.classList.add("hidden");
    const finish = (id) => {
      box.hidden = true;
      box.innerHTML = "";
      if (ok) ok.classList.remove("hidden");
      ov.classList.remove("on");
      resolve(id);
    };
    for (const c of choices || []) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = c.label;
      btn.addEventListener("click", () => finish(c.id));
      box.appendChild(btn);
    }
    ov.classList.add("on");
  });
}

async function aiGirlReplyToMale({ narr, maleLine, success, kind }) {
  const name = girl?.name || "她";
  const mn = state.male.name;
  const sys = [
    `你是「${name}」。個性：${(girl?.personality || []).join("、") || "—"}。職業：${girl?.job || "—"}。`,
    girl?.tone ? `語氣：${girl.tone}` : "",
    "你只能對已經發生的事做反應。不准下達行動、不准自己走開結束約會、不准唸數字。",
    success
      ? "判定成功：你沒有躲開，讓他碰／讓他說下去。可以害羞、可以猶豫，但身體沒有離開。"
      : "判定失敗：你反抗、躲開、拒絕。語氣依個性，但一定是抗拒。",
    "一句到三句中文第一人稱。不要角色名冒號。",
  ]
    .filter(Boolean)
    .join("\n");
  const user = [
    `地點：公園${zoneOf(state.zone).name}`,
    `場景：${state.card?.name || ""}　${state.card?.scene || ""}`,
    `男子「${mn}」動作：${maleKindZh(kind)}`,
    `旁白：${narr}`,
    `${mn}：${maleLine}`,
    `順從：${obeyZh()}　判定：${success ? "成功" : "失敗"}`,
    `性慾${state.arousal}/${AROUSAL_MAX} 羞恥${state.shame}/${SHAME_MAX}`,
  ].join("\n");
  const raw = await llmChat([
    { role: "system", content: sys },
    { role: "user", content: user },
  ]);
  return cleanLine(raw, name) || (success ? "……" : "別碰我。");
}

async function aiSexAnnounce(who) {
  const name = girl?.name || "她";
  const mn = state.male.name;
  if (who === "girl") {
    const raw = await llmChat([
      {
        role: "system",
        content: `你是「${name}」。對旁邊的約會對象（玩家）說你想跟剛才那個男人去旅館做愛。道歉或對不起都可以，但意思必須是想去。一句到兩句。不要角色名冒號。`,
      },
      { role: "user", content: `男子是${mn}。請對玩家說。` },
    ]);
    return cleanLine(raw, name) || "對不起……我想跟他去旅館。";
  }
  const raw = await llmChat([
    {
      role: "system",
      content: `你是「${mn}」。對旁邊這個男人（玩家）宣布你要帶這個女人去旅館做愛。可以囂張。一句到兩句。不要角色名冒號。`,
    },
    { role: "user", content: `女的叫${name}。請對玩家說。` },
  ]);
  return cleanLine(raw, mn) || "我們要去旅館做愛了。";
}

/**
 * 玩家成功行動回合後：
 * - 場上已有單男 → 等玩家猜招（不自動男子回合）
 * - 否則 → 1/2 抽種類搭訕（測單男暫調；正式應回 1/20）
 */
async function maybeMaleBeat() {
  if (state.ended) return false;
  const m = state.male;
  if (m?.sex) return false;
  if (m?.onField) return false;
  if (Math.random() < 1 / 2) {
    state.male = spawnMale();
    await startMaleApproach();
    return true;
  }
  return false;
}

async function aiBodyNarr({ actionNarr, maleLine, success, kind }) {
  const mn = state.male.name;
  const gn = girl?.name || "她";
  const hint = [
    `只寫 1～3 句旁白。描述「${mn}」的肢體動作，以及「${gn}」的肢體動作與表情。`,
    "不要寫對話，不要替任何人下指令，不要唸數字。",
    success
      ? "判定成功：她沒有躲開，身體留在原地或讓他碰到。"
      : "判定失敗：她躲開、推開、別過臉、後退。",
    `男子這次是：${maleKindZh(kind)}`,
    `動作方向：${actionNarr}`,
    `他剛說：${maleLine}`,
    state.lastGirlLine ? `她剛說：${state.lastGirlLine}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  try {
    const raw = await llmChat([
      {
        role: "system",
        content: "你是約會場景的旁白。只描述已經發生的肢體與表情。",
      },
      { role: "user", content: hint },
    ]);
    return cleanLine(raw) || actionNarr;
  } catch {
    return actionNarr;
  }
}

function maleBeatPages({ kind, spec, success, delta }) {
  const m = state.male;
  const pages = [
    {
      role: "male",
      who: m.name,
      text: spec.male,
      extra: kind === "approach" ? "" : success ? `成功　${delta || ""}` : delta || "",
    },
    {
      role: "girl",
      who: girl.name,
      fallback: success ? "……" : "別碰我。",
      load: () =>
        aiGirlReplyToMale({
          narr: spec.narr,
          maleLine: spec.male,
          success,
          kind,
        }),
    },
  ];
  if (success) {
    pages.push({
      role: "sys",
      who: "旁白",
      fallback: spec.narr,
      load: () =>
        aiBodyNarr({
          actionNarr: spec.narr,
          maleLine: spec.male,
          success,
          kind,
        }),
    });
  }
  return pages;
}

async function startMaleApproach() {
  const m = state.male;
  m.onField = true;
  m.appeared = true;
  m.hype = HYPE_MAX;
  m.freeTurns = 0;
  m.sex = false;
  // 出場重置女子性慾／羞恥（體力不變）
  state.arousal = 0;
  state.shame = 0;
  const spec = pickMaleScriptLine("approach");
  await playQueue(
    maleBeatPages({ kind: "approach", spec, success: false, delta: "" }).concat([
      {
        role: "sys",
        who: "系統",
        text: `男子性奮 ${m.hype}/${HYPE_MAX}。猜他下一招：阻止調戲或阻止猥褻。`,
      },
    ]),
  );
}

function maleLeavePages(reason) {
  const m = state.male;
  if (!m) return [];
  m.onField = false;
  m.gone = true;
  m.freeTurns = 0;
  return [
    {
      role: "sys",
      who: "旁白",
      text: reason || `${m.name}沒興致了，罵罵咧咧地走開了。`,
    },
  ];
}

/** 男子實際出手（調戲／猥褻），含圖片路徑；回傳後呼叫者檢查分岔 */
async function performMaleAction(kind, { skipStamina } = {}) {
  const m = state.male;
  if (!m?.onField) return;
  const spec = pickMaleLine(kind);
  const success = maleSucceeds();
  const deltaBits = [applyMaleAct(kind)];
  if (!skipStamina) {
    state.stamina = clamp(state.stamina - 1, STAMINA_MAX);
    deltaBits.push("體力 -1");
  }
  const delta = deltaBits.join("　");
  const isMolest = kind === "molest" || kind === "touch";

  if (isMolest && success && spec.imgUrl) {
    enterPaging();
    queue = [];
    await showPage({
      role: "male",
      who: m.name,
      text: spec.male,
      extra: `成功　${delta}`,
    });
    waitingAi = true;
    const girlP = aiGirlReplyToMale({
      narr: spec.narr,
      maleLine: spec.male,
      success: true,
      kind,
    });
    const cg = await runMolestCg({
      url: spec.imgUrl,
      playerLine: spec.male,
      playerWho: m.name,
      girlName: girl?.name || "她",
      girlPromise: girlP,
      delta,
    });
    waitingAi = false;
    if (cg?.aborted) {
      busy = false;
      paging = false;
      queue = [];
      pendingResolve = false;
      notifyPagingDone();
      renderHud();
      return { aborted: true };
    }
    busy = false;
    paging = false;
    queue = [];
    notifyPagingDone();
    renderHud();
    return { aborted: false, success, delta };
  }

  await playQueue(maleBeatPages({ kind, spec, success, delta }));
  // playQueue 進 paging；等玩家翻完才繼續——呼叫端用 waitPagingDone
  return { aborted: false, success, delta, paging: true };
}

/** 等目前 paging 隊列播完（玩家按下一頁至 exitPaging） */
function waitPagingDone() {
  if (!paging) return Promise.resolve();
  return new Promise((resolve) => {
    pagingWaiters.push(resolve);
  });
}

async function playQueueAndWait(pages) {
  if (!pages?.length) return;
  await playQueue(pages);
  await waitPagingDone();
}

async function afterMaleResolved() {
  if (state.ended || !state.male) return;
  // 性慾滿 → 男子發起；羞恥滿 → 女子發起
  if (state.arousal >= AROUSAL_MAX && state.male.onField && !state.male.sex) {
    await resolveSexBranch("male");
    return;
  }
  if (state.shame >= SHAME_MAX && state.male.onField && !state.male.sex) {
    await resolveSexBranch("girl");
    return;
  }
  if (state.male.onField && state.male.hype <= 0) {
    await playQueueAndWait(maleLeavePages());
    pendingResolve = !state.ended;
    return;
  }
  if (state.male.onField && state.stamina <= 0 && state.male.freeTurns <= 0) {
    await resolveStaminaZeroInvite();
  }
}

async function resolveSexBranch(from) {
  const m = state.male;
  if (!m?.onField || m.sex) return;
  const gn = girl?.name || "她";
  const pages =
    from === "girl"
      ? [
          {
            role: "girl",
            who: gn,
            fallback: "對不起……我想跟他去旅館。",
            load: () => aiSexAnnounce("girl"),
          },
        ]
      : [
          {
            role: "male",
            who: m.name,
            fallback: "我們要去旅館做愛了。",
            load: () => aiSexAnnounce("male"),
          },
        ];
  await playQueueAndWait(pages);
  if (state.ended) return;

  const choice = await showChoices({
    title: from === "girl" ? `${gn}想跟他去旅館` : `${m.name}要帶她去旅館`,
    body: "旅館場景尚未實作，先選結局分支。付 10 金可一起去；離開則約會結束。",
    choices: [
      { id: "hotel", label: "付 10 金，一起去旅館" },
      { id: "leave", label: "自己離開（她會私下跟他做）" },
    ],
  });

  if (choice === "hotel") {
    if (state.money < 10) {
      await playQueueAndWait([
        { role: "sys", who: "系統", text: "金錢不足 10，只能離開。" },
      ]);
    } else {
      state.money -= 10;
      m.sex = true;
      m.onField = false;
      state.ended = true;
      await playQueueAndWait([
        {
          role: "sys",
          who: "旁白",
          text: `你付了 10 金。三人往旅館走去……（旅館詳細場景尚未實作）　金錢 -10`,
        },
        {
          role: "sys",
          who: "散場",
          text: `約會告一段落。感情 ${state.heart}、性慾 ${state.arousal}、羞恥 ${state.shame}。`,
        },
      ]);
      renderHud();
      return;
    }
  }

  const n = 3 + Math.floor(Math.random() * 4); // 3–6
  m.sex = true;
  m.onField = false;
  state.ended = true;
  await playQueueAndWait([
    {
      role: "sys",
      who: "旁白",
      text: `你轉身離開。${gn}會在你不知道的地方，跟${m.name}做 ${n} 次……（分支 stub）`,
    },
    {
      role: "sys",
      who: "散場",
      text: `約會結束。感情 ${state.heart}、性慾 ${state.arousal}、羞恥 ${state.shame}。`,
    },
  ]);
  renderHud();
}

async function resolveStaminaZeroInvite() {
  const m = state.male;
  if (!m?.onField || m.sex || state.ended) return;
  if (m.freeTurns > 0) return;

  const cost = EAT_COST[state.time];
  await playQueueAndWait([
    {
      role: "male",
      who: m.name,
      text: `體力沒了吧？一起吃點東西啊。只要 ${cost} 金。`,
    },
    {
      role: "sys",
      who: "系統",
      text: "體力歸零。要跟他一起吃東西恢復，還是拒絕？",
    },
  ]);

  const canEat = state.money >= cost;
  const choice = await showChoices({
    title: "男子邀請吃東西",
    body: canEat
      ? `花費 ${cost} 金恢復體力，這一輪男子不會出手。拒絕則他連動三招。`
      : `金錢不足（需要 ${cost}）。只能拒絕，他會連動三招。`,
    choices: canEat
      ? [
          { id: "eat", label: `吃東西（-${cost} 金）` },
          { id: "refuse", label: "拒絕（他連動三招）" },
        ]
      : [{ id: "refuse", label: "沒錢，只能拒絕（他連動三招）" }],
  });

  if (choice === "eat" && canEat) {
    const result = applyAct("eat");
    await playQueueAndWait([
      {
        role: "sys",
        who: "旁白",
        text: `你們坐下吃東西。男子這輪沒動手。${result.bits.join("　")}`,
      },
    ]);
    renderHud();
    return;
  }

  m.freeTurns = 3;
  await playQueueAndWait([
    {
      role: "sys",
      who: "旁白",
      text: `${m.name}嘿嘿笑：「那我就不客氣了。」接下來三招，你只能看著。`,
    },
  ]);
  await runMaleFreeTurns();
}

async function runMaleFreeTurns() {
  const m = state.male;
  while (m?.onField && !m.sex && !state.ended && m.freeTurns > 0) {
    m.freeTurns -= 1;
    const kind = maleActKind();
    const left = m.freeTurns;
    renderHud();
    const tauntNote = {
      role: "sys",
      who: "系統",
      text: `男子自由行動（還剩 ${left} 次）`,
    };
    // 先提示再出手
    await playQueueAndWait([tauntNote]);
    if (!m.onField || m.sex || state.ended) break;
    const r = await performMaleAction(kind, { skipStamina: true });
    if (r?.paging) await waitPagingDone();
    if (r?.aborted) return;
    if (state.arousal >= AROUSAL_MAX) {
      await resolveSexBranch("male");
      return;
    }
    if (state.shame >= SHAME_MAX) {
      await resolveSexBranch("girl");
      return;
    }
  }
  if (state.ended || !state.male) return;
  if (m.onField && !m.sex) {
    state.stamina = STAMINA_MAX;
    m.freeTurns = 0;
    await playQueueAndWait([
      {
        role: "sys",
        who: "旁白",
        text: `一陣混亂過後，${girl?.name || "她"}喘著恢復了體力。猜招戰繼續。`,
      },
    ]);
  }
  renderHud();
}

/**
 * 猜招戰：玩家先選阻止調戲／阻止猥褻；男子暗擲 tease｜molest。
 */
async function doGuessInterrupt(guess) {
  const m = state.male;
  if (!m?.onField || m.sex || state.ended) return;
  if (busy || paging) return;
  if (state.stamina <= 0) {
    await resolveStaminaZeroInvite();
    return;
  }

  const secret = maleActKind(); // "tease" | "molest"
  const ok = guess === secret;
  state.round += 1;
  busy = true;
  renderHud();

  if (ok) {
    m.hype = Math.max(0, (m.hype ?? HYPE_MAX) - 1);
    state.heart = (state.heart || 0) + 5;
    const spec = pickInterruptOkLine();
    const delta = `阻止成功　男子性奮 -1（${m.hype}/${HYPE_MAX}）　感情 +5`;
    await playQueueAndWait([
      { role: "player", who: "我", text: spec.player, extra: delta },
      {
        role: "sys",
        who: "旁白",
        fallback: spec.narr,
        load: () =>
          aiNarrate(
            `玩家成功擋住男子的「${maleKindZh(secret)}」。方向：${spec.narr}。只寫已經發生的阻擋，不要發明新事件。`,
          ),
      },
      {
        role: "male",
        who: m.name,
        text: m.hype <= 0 ? "……嘖，沒意思。" : "切，下次看你還擋不擋得住。",
      },
    ]);
    busy = false;
    if (m.hype <= 0) {
      await playQueueAndWait(maleLeavePages());
      pendingResolve = !state.ended;
      if (!state.ended) {
        // 男子離開後可走一般回合結算／再抽單男
        resolveAfterRound();
        if (await maybeMaleBeat()) return;
      }
      renderHud();
      return;
    }
    pendingResolve = false;
    renderHud();
    return;
  }

  // 失敗：嘲諷 → 男子出手
  const taunt = pickMaleScriptLine("taunt");
  await playQueueAndWait([
    {
      role: "sys",
      who: "系統",
      text: `阻止失敗（他要的是${maleKindZh(secret)}）`,
    },
    { role: "male", who: m.name, text: taunt.male },
  ]);

  const r = await performMaleAction(secret);
  if (r?.paging) await waitPagingDone();
  busy = false;
  if (r?.aborted) return;

  await afterMaleResolved();
  if (!state.ended && state.male?.onField) {
    pendingResolve = false;
  } else if (!state.ended) {
    pendingResolve = true;
    resolveAfterRound();
    if (await maybeMaleBeat()) return;
  }
  renderHud();
}

/** 單男場上一起吃東西：男子本輪不出手、不扣性奮 */
async function doMaleFieldEat() {
  if (!state.male?.onField || state.male.sex) return;
  const result = applyAct("eat");
  if (!result.ok) {
    await playQueueAndWait([{ role: "sys", who: "系統", text: result.reason }]);
    return;
  }
  state.round += 1;
  await playQueueAndWait([
    {
      role: "sys",
      who: "旁白",
      text: `你們找地方吃東西。男子跟著坐下來，這輪沒動手。${result.bits.join("　")}`,
    },
  ]);
  renderHud();
}

async function doRescue() {
  const odds = escapeOddsZh();
  const ok = Math.random() < escapeChance();
  const mn = state.male.name;
  const gn = girl.name;
  state.round += 1;
  pendingResolve = !ok;
  const pages = [
    { role: "player", who: "我", text: "走，我們離開這裡。" },
    {
      role: "girl",
      who: gn,
      fallback: ok ? "……好。" : "我……再一下。",
      load: async () => {
        const raw = await llmChat([
          {
            role: "system",
            content: [
              `你是「${gn}」。玩家要把你從「${mn}」身邊拉開。`,
              ok
                ? "判定成功：你願意跟玩家走、離開這個男人。一句到兩句。"
                : "判定失敗：沒甩掉。你沒有跟玩家走，那個男人還在。一句到兩句。不要角色名冒號。",
            ].join(""),
          },
          { role: "user", content: `躲開機率 ${odds}。判定：${ok ? "甩掉了" : "沒甩掉"}。` },
        ]);
        return cleanLine(raw, gn) || (ok ? "……走吧。" : "再一下就好……");
      },
    },
    {
      role: "sys",
      who: "旁白",
      fallback: ok
        ? `你拉著她躲開了。甩掉${mn}。`
        : `你拉著她想甩掉${mn}，沒甩掉。他還在（${odds}）。`,
      load: () =>
        aiBodyNarr({
          actionNarr: ok
            ? `玩家抓住${gn}的手，要把她從${mn}身邊帶走。`
            : `玩家要拉${gn}走，但她沒有離開${mn}。`,
          maleLine: ok ? "喂！" : "她不會跟你走。",
          success: !ok,
          kind: "tease",
        }),
    },
  ];
  if (ok) {
    state.male.onField = false;
    state.male.gone = true;
    state.male.freeTurns = 0;
    const to = NEXT[state.zone];
    if (cards.some((c) => c.zone === to)) state.zone = to;
    drawCard();
  }
  await playQueue(pages);
}

function chatHint(act, playerLine, card) {
  const scene = card?.scene || placeZh(state.zone) || zoneOf(state.zone).name;
  const name = girl?.name || "她";
  if (act === "molest") {
    return `玩家在「${scene}」對「${name}」動手猥褻。他說／做：「${playerLine}」。只描述已經發生的肢體，不要寫成口交或做愛。`;
  }
  if (act === "talk" || act === "tease") {
    return `玩家在「${scene}」用話調戲「${name}」。他說：「${playerLine}」。只描述已經發生的調戲，不要動手寫成猥褻，不要寫成口交或做愛。`;
  }
  return `玩家在「${scene}」跟「${name}」說話。他說：「${playerLine}」。只描述已經發生的對話現場。`;
}

async function doChat(raw) {
  const text = String(raw || "").trim();
  if (!text) return;
  if (!started || busy || paging || state.ended) return;
  const card = state.card;
  if (!card) return;
  const cls = classifyDateLine(text, dateScript);
  const input = $("date-input");
  if (input) input.value = "";
  if (cls.act === "oral" || cls.act === "sex") {
    await playQueue([
      { role: "player", who: "我", text },
      { role: "sys", who: "系統", text: cls.refuse || "這裡不行。" },
    ]);
    return;
  }
  const molestRoll = cls.act === "molest" ? rollMolestSuccess() : null;
  const result = applyAct(cls.act, molestRoll
    ? { molestOk: molestRoll.ok, oddsZh: molestRoll.oddsZh }
    : {});
  if (!result.ok) {
    await playQueue([{ role: "sys", who: "系統", text: result.reason }]);
    return;
  }
  state.round += 1;
  const delta = `${ACT_ZH[cls.act] || cls.act}　${result.bits.join("　")}`;
  // 聊天判成猥褻且失敗：玩家 → 旁白，女子不輸出
  if (cls.act === "molest" && molestRoll && !molestRoll.ok) {
    const failHint =
      `玩家想猥褻「${girl?.name || "她"}」（成功率 ${molestRoll.oddsZh}，失敗）。他說／做：「${text}」。` +
      `旁白只寫被擋開、沒得逞。不要寫成成功。不要寫女子台詞。`;
    busy = true;
    waitingAi = false;
    renderHud();
    await playQueue([
      { role: "player", who: "我", text, extra: delta },
      {
        role: "sys",
        who: "旁白",
        load: () => aiNarrate(failHint),
        fallback: `你伸手想碰，被${girl?.name || "她"}躲开了。（${molestRoll.oddsZh}）`,
      },
      ...endPages(),
    ]);
    pendingResolve = !state.ended;
    busy = false;
    renderHud();
    return;
  }

  const hint = chatHint(cls.act, text, card);
  busy = true;
  enterPaging();
  waitingAi = true;
  renderHud();
  await showPage({
    role: "sys",
    who: "旁白",
    load: () => aiNarrate(hint),
    fallback: hint,
  });
  const narr = document.querySelector("#log .tx")?.textContent || hint;
  waitingAi = false;
  const girlP = aiGirlReply({ card, act: cls.act, narr, playerLine: text, delta });
  enqueue({ role: "player", who: "我", text, extra: delta });
  enqueue({
    role: "girl",
    who: girl.name,
    fallback: "……",
    load: () => girlP,
  });
  endPages().forEach(enqueue);
  pendingResolve = !state.ended;
  busy = false;
  renderHud();
}

async function startDate() {
  if (!girl) {
    setAdminStatus("先抽妹子。", true);
    return;
  }
  Object.assign(state, emptyState());
  state.time = $("times")?.querySelector(".pill.on")?.dataset.id || "morning";
  dateOutfit = null;
  ensureDateOutfit();
  started = true;
  state.ended = false;
  busy = false;
  pendingResolve = false;
  $("admin").classList.remove("on");
  state.arrive = pickArrive();
  state.male = null;
  const card = drawCard();

  // 開場前預產猥褻圖：先到／趕路旁白＋省略號，期間鎖操作
  const needPregen = (dateScript.molestPacks || [])
    .map(normalizeMolestPack)
    .some((p) => String(p.slot?.ref || "").trim());
  if (needPregen) {
    busy = true;
    enterPaging();
    waitingAi = true;
    renderHud();
    const base = arriveLoadingText(state.arrive, girl.name);
    clearLog("");
    const bubble = addBubble("sys", "旁白", base + "…");
    const tx = bubble.querySelector(".tx");
    const progress = { done: 0, total: 0 };
    const stopDots = startArriveDots(tx, base, () => progress);
    try {
      await pregenMolestImages((done, total) => {
        progress.done = done;
        progress.total = total;
      });
    } finally {
      stopDots();
      waitingAi = false;
      busy = false;
    }
  }

  const pages = [
    { role: "sys", who: "旁白", text: arriveText(state.arrive, girl.name) },
  ];
  if (!card) pages.push({ role: "sys", who: "系統", text: "沒有可抽的廣場卡。" });
  else pages.push({ role: "sys", who: "旁白", text: card.narration });
  await playQueue(pages);
  $("date-input")?.focus();
}


/** 猥褻有圖：全螢幕覆蓋，點圖推進 你 → 她的名字 → 關閉（回到 v7.10，不用下一頁） */
function runMolestCg({ url, playerLine, girlName, girlPromise, delta, playerWho }) {
  return new Promise((resolve) => {
    const ov = $("cg-overlay");
    const img = $("cg-img");
    const who = $("cg-who");
    const tx = $("cg-tx");
    const deltaEl = $("cg-delta");
    const cap = $("cg-cap");
    if (!ov || !img || !who || !tx) {
      resolve({ girlText: "", aborted: false });
      return;
    }

    let phase = 0; // 0 player → 1 girl → 2 done
    let girlText = "";
    let girlSettled = false;
    let lock = false;

    const cleanup = () => {
      img.removeEventListener("click", onClick);
      cap?.removeEventListener("click", onClick);
      ov.classList.remove("on");
      ov.setAttribute("aria-hidden", "true");
      ov.dataset.phase = "player";
      cgOpen = false;
      cgGirlReady = false;
      cgCloseResolve = null;
      img.removeAttribute("src");
    };

    const finish = (opts = {}) => {
      if (phase >= 2) return;
      phase = 2;
      const out = girlText || tx.textContent || "……";
      cleanup();
      resolve({ girlText: out, aborted: !!opts.aborted });
      renderHud();
    };

    const showPlayer = () => {
      ov.dataset.phase = "player";
      cgGirlReady = false;
      who.textContent = playerWho || "你";
      tx.textContent = playerLine || "";
      if (deltaEl) deltaEl.textContent = delta || "";
      renderHud();
    };

    const showGirl = (text) => {
      ov.dataset.phase = "girl";
      cgGirlReady = true;
      who.textContent = girlName || "她";
      tx.textContent = text || "……";
      if (deltaEl) deltaEl.textContent = "";
      if (text) state.lastGirlLine = text;
      renderHud();
    };

    Promise.resolve(girlPromise)
      .then((x) => {
        girlText = String(x || "……");
        girlSettled = true;
        if (phase === 1 && !lock) showGirl(girlText);
      })
      .catch(() => {
        girlText = "……";
        girlSettled = true;
        if (phase === 1 && !lock) showGirl(girlText);
      });

    const onClick = async (e) => {
      e?.preventDefault?.();
      e?.stopPropagation?.();
      if (lock || phase >= 2) return;

      if (phase === 0) {
        phase = 1;
        if (girlSettled) {
          showGirl(girlText || "……");
          return;
        }
        showGirl("……");
        lock = true;
        try {
          girlText = String((await girlPromise) || "……");
        } catch {
          girlText = "……";
        }
        girlSettled = true;
        lock = false;
        if (phase === 1) showGirl(girlText);
        return;
      }

      if (phase === 1) {
        finish();
      }
    };

    cgOpen = true;
    cgGirlReady = false;
    cgCloseResolve = finish;
    img.src = url || "";
    showPlayer();
    ov.classList.add("on");
    ov.setAttribute("aria-hidden", "false");
    img.addEventListener("click", onClick);
    cap?.addEventListener("click", onClick);
    renderHud();
  });
}



async function doAct(act) {
  if (act === "admin") {
    openAdminPanel();
    return;
  }
  if (act === "next") {
    await advance();
    return;
  }
  if (!started || busy || paging) return;
  if (act === "end") {
    state.ended = true;
    await playQueue([
      { role: "sys", who: "散場", text: `回家。感情 ${state.heart}、性慾 ${state.arousal}、羞恥 ${state.shame}。` },
    ]);
    return;
  }
  if (state.ended) return;
  if (act === "interact") return;
  if (act === "block-tease") {
    await doGuessInterrupt("tease");
    return;
  }
  if (act === "block-molest") {
    await doGuessInterrupt("molest");
    return;
  }
  if (act === "rescue") {
    if (!state.male?.onField) return;
    await doRescue();
    return;
  }
  if (state.male?.onField && !state.male.sex) {
    if (act === "eat") {
      await doMaleFieldEat();
      return;
    }
    if (act === "end") return;
    return;
  }
  const card = state.card;
  if (!card) return;
  const fromEdit = act === "tease" || act === "talk" || act === "molest";
  const spec = fillActSpec(fromEdit ? pickScriptLine(act) : pickActionLine(card, act));
  if (!spec) {
    await playQueue([{ role: "sys", who: "系統", text: fromEdit ? "edit_date 還沒寫這個行動。" : "這張卡沒有這個行動。" }]);
    return;
  }
  const molestRoll = act === "molest" ? rollMolestSuccess() : null;
  const result = applyAct(act, molestRoll
    ? { molestOk: molestRoll.ok, oddsZh: molestRoll.oddsZh }
    : {});
  if (!result.ok) {
    await playQueue([{ role: "sys", who: "系統", text: result.reason }]);
    return;
  }
  state.round += 1;
  const delta = `${ACT_ZH[act] || act}　${result.bits.join("　")}`;
  busy = true;
  enterPaging();
  waitingAi = true;
  renderHud();

  // 猥褻失敗：玩家 → 旁白，女子不輸出，不出圖
  if (act === "molest" && molestRoll && !molestRoll.ok) {
    const failHint =
      `玩家想對「${girl?.name || "她"}」動手猥褻（成功率 ${molestRoll.oddsZh}，這次失敗）。` +
      `他原本要做：「${spec.player}」。寫旁白：被她擋開／躲开／喝止，肢體沒得逞。不要寫成成功，不要口交或做愛。不要寫女子台詞。`;
    waitingAi = false;
    await playQueue([
      { role: "player", who: "你", text: spec.player, extra: delta },
      {
        role: "sys",
        who: "旁白",
        load: () => aiNarrate(failHint),
        fallback: `你伸手想碰，被${girl?.name || "她"}躲开了。（${molestRoll.oddsZh}）`,
      },
      ...endPages(),
    ]);
    pendingResolve = !state.ended;
    busy = false;
    renderHud();
    return;
  }

  await showPage({
    role: "sys",
    who: "旁白",
    load: () => aiNarrate(spec.narr),
    fallback: spec.narr,
  });
  const narr = document.querySelector("#log .tx")?.textContent || spec.narr;
  waitingAi = false;
  const girlP = aiGirlReply({
    card, act, narr, playerLine: spec.player, delta,
    attitude: spec.attitude || "",
    feel: spec.feel || "",
  });

  // 猥褻成功且有預產圖：全螢幕覆蓋推進
  if (act === "molest" && spec.imgUrl) {
    const cg = await runMolestCg({
      url: spec.imgUrl,
      playerLine: spec.player,
      girlName: girl?.name || "她",
      girlPromise: girlP,
      delta,
    });
    if (cg?.aborted) {
      busy = false;
      waitingAi = false;
      paging = false;
      queue = [];
      pendingResolve = false;
      renderHud();
      return;
    }
    const ends = endPages();
    pendingResolve = !state.ended;
    busy = false;
    if (ends.length) {
      queue = ends.slice(1);
      await showPage(ends[0]);
      renderHud();
    } else {
      await exitPaging();
    }
    return;
  }

  enqueue({ role: "player", who: "我", text: spec.player, extra: delta });
  enqueue({
    role: "girl",
    who: girl.name,
    fallback: "……",
    load: () => girlP,
  });
  endPages().forEach(enqueue);
  pendingResolve = !state.ended;
  busy = false;
  renderHud();
}

function drawGirlFromPool() {
  const g = generateGirl({ luck: 40, rating: "nsfw", usedNames: girl ? [girl.name] : [] });
  if (!g) throw new Error("人設池還沒載入");
  g.id = "drawn-" + Date.now().toString(36);
  girl = g;
  dateOutfit = null;
  renderGirlAdmin();
  renderHud();
  setAdminStatus(`抽到 ${g.name}`);
}

async function pingEngine() {
  setAdminStatus("檢查中…");
  const { endpoint } = aiCfg();
  try {
    const r = await fetch(`/api/llm/tags?provider=ollama&endpoint=${encodeURIComponent(endpoint)}`);
    if (!r.ok) throw new Error("Ollama 連不上");
    const tags = await r.json();
    const names = (tags?.models || []).map((m) => m.name || m.model || m).filter(Boolean);
    const dl = $("t-model-list");
    if (dl) dl.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
    const cur = ($("t-model")?.value || "").trim();
    if ($("t-model") && (!cur || (names.length && !names.includes(cur)))) {
      $("t-model").value = names.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : names[0] || DEFAULT_MODEL;
    }
    setAdminStatus(names.length ? `✓ ${names.length} 個模型` : "連上了但沒模型", !names.length);
  } catch (e) {
    setAdminStatus(e.message, true);
  }
}

function mountPills() {
  $("times").innerHTML = TIMES.map((t) => `<button class="pill" type="button" data-id="${t.id}">${t.name}</button>`).join("");
  $("zones").innerHTML = ZONES.map((z) => `<button class="pill" type="button" data-id="${z.id}">${z.name}</button>`).join("");
  $("rels").innerHTML = RELS.map((r) => `<button class="pill" type="button" data-id="${r.id}">${r.name}</button>`).join("");
  $("times").addEventListener("click", (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    state.time = id;
    renderHud();
  });
  $("zones").addEventListener("click", (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    state.zone = id;
    renderHud();
  });
  $("rels").addEventListener("click", (e) => {
    const id = e.target.dataset?.id;
    if (!id) return;
    relStage = id;
    lsSet("t_d.rel", id);
    renderGirlAdmin();
    renderHud();
  });
}

async function boot() {
  $("t-endpoint").value = normalizeEndpoint(lsGet("t_d.endpoint", lsGet("testdate.endpoint", DEFAULT_ENDPOINT)));
  $("t-model").value = lsGet("t_d.model", lsGet("testdate.model", DEFAULT_MODEL));
  const savedRel = lsGet("t_d.rel", "stranger");
  if (RELS.some((r) => r.id === savedRel)) relStage = savedRel;
  mountPills();
  renderHud();
  document.querySelector("#acts").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    doAct(btn.dataset.act);
  });
  $("date-send")?.addEventListener("click", () => doChat($("date-input")?.value));
  $("date-input")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      doChat(e.target.value);
    }
  });
  $("btn-next").addEventListener("click", () => advance());
  $("log").addEventListener("click", () => {
    if (paging) advance();
  });
  $("admin-ok").addEventListener("click", () => $("admin").classList.remove("on"));
  $("admin").addEventListener("click", (e) => {
    if (e.target === $("admin")) $("admin").classList.remove("on");
  });
  $("btn-draw-girl").addEventListener("click", () => {
    try {
      drawGirlFromPool();
    } catch (e) {
      setAdminStatus(e.message, true);
    }
  });
  $("btn-ping").addEventListener("click", () => pingEngine());
  $("btn-start").addEventListener("click", () => startDate());
  $("modal-ok")?.addEventListener("click", () => $("overlay").classList.remove("on"));
  $("admin").classList.add("on");
  try {
    await loadPools();
    const pack = await fetch("/content/t_d_cards.json?ts=" + Date.now()).then((r) => {
      if (!r.ok) throw new Error("讀卡失敗");
      return r.json();
    });
    cards = pack.cards || [];
    try {
      const raw = await fetch("/content/edit_date.json?ts=" + Date.now()).then((r) => {
        if (!r.ok) throw new Error("讀劇本失敗");
        return r.json();
      });
      dateScript = normalizeDateScript(raw);
    } catch {
      dateScript = normalizeDateScript(DEFAULT_DATE_SCRIPT);
    }
    const mt = dateScript.male?.types?.length || 0;
    setAdminStatus(`卡 ${cards.length} 張 · 人設池已載入 · 約會／單男劇本已載入（種類 ${mt}）`);
  } catch (e) {
    setAdminStatus(e.message, true);
  }
}

boot();
