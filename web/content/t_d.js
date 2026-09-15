/** t_d 約會測試機。舊 testdate.js 不動。聊天輸入走看板叫名那套，劇本在 /edit_date。 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";
import { buildSystemPrompt } from "./persona_builder.js";
import {
  DATE_ACT_ZH,
  DEFAULT_DATE_SCRIPT,
  normalizeDateScript,
  classifyDateLine,
} from "./edit_date.js";

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
const ACT_ZH = DATE_ACT_ZH;

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

let cards = [];
let malePack = null;
let dateScript = normalizeDateScript(DEFAULT_DATE_SCRIPT);
let girl = null;
let relStage = "stranger";
let busy = false;
let started = false;
let paging = false;
let waitingAi = false;
let pendingResolve = false;
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
  };
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
  $("hud")?.classList.remove("has-male");
  document.body.dataset.time = state.time;
  $("zone-name").textContent = zoneOf(state.zone).name;
  const desc = $("zone-desc");
  if (desc) desc.textContent = state.card ? state.card.scene : "";
  const who = $("girl-now");
  if (who) {
    who.textContent = girl
      ? `${girl.name} · ${relOf(relStage).name} · ${girl.archetype || (girl.personality || []).join("、")} · ${girl.job || ""}`
      : "";
  }
  document.querySelectorAll("#times .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === state.time));
  document.querySelectorAll("#zones .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === state.zone));
  document.querySelectorAll("#rels .pill").forEach((el) => el.classList.toggle("on", el.dataset.id === relStage));
  $("acts-bar")?.classList.toggle("paging", paging);
  $("acts-bar")?.classList.toggle("no-chat", !started || state.ended);
  $("acts")?.classList.remove("has-male");
  const chatOn = started && !busy && !paging && !state.ended && state.stamina > 0 && !!state.card;
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
    next.disabled = waitingAi;
    next.textContent = waitingAi ? "……" : "下一頁";
  }
  document.querySelectorAll("#acts .act").forEach((el) => {
    const act = el.dataset.act;
    if (act === "admin") {
      el.disabled = false;
      return;
    }
    if (!started || busy || paging) {
      el.disabled = true;
      return;
    }
    if (state.ended) {
      el.disabled = act !== "end";
      return;
    }
    if (act === "eat") el.disabled = state.money < EAT_COST[state.time];
    else if (act === "tease" || act === "talk" || act === "molest") el.disabled = state.stamina <= 0;
    else el.disabled = false;
  });
}

function addBubble(role, who, text, extra) {
  $("empty")?.remove();
  const div = document.createElement("div");
  div.className = "bubble " + role;
  div.innerHTML = `<div class="who">${esc(who)}</div><div class="tx"></div>` + (extra ? `<div class="delta"></div>` : "");
  div.querySelector(".tx").textContent = text;
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
  if (shouldResolve) resolveAfterRound();
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
  addBubble(item.role, item.who, item.text, item.extra);
  if (item.role === "girl") state.lastGirlLine = item.text;
  renderHud();
}

async function advance() {
  if (!paging || waitingAi) return;
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
  const modes = ["player_wait", "girl_wait", "together"];
  return modes[Math.floor(Math.random() * modes.length)];
}

function arriveText(mode, name) {
  if (mode === "girl_wait") return `你走到廣場。${name}已經坐在長椅那邊了。`;
  if (mode === "together") return `你們前後腳到廣場入口，對上眼。`;
  return `你先到廣場。晨風還涼，${name}還沒出現。過了一會兒，她從入口走過來。`;
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

function pickScriptLine(act) {
  const key = act === "talk" ? "tease" : act;
  const pool = actionPool(dateScript.acts?.[key]);
  if (!pool.length) return null;
  const usedKey = `edit:${key}`;
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
        content: dateScript.narr_system,
      },
      { role: "user", content: `演出方向：${hint}` },
    ]);
    return cleanLine(raw) || hint;
  } catch (e) {
    return hint;
  }
}

function buildDateGirlCtx() {
  const g = girl || {};
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
    },
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
    `你們正在公園「${zone.name}」約會。時段：${timeOf(state.time).name}。人就在他眼前。`,
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

async function aiGirlReply({ card, act, narr, playerLine, delta }) {
  const name = girl?.name || "她";
  const sys = [
    buildSystemPrompt(buildDateGirlCtx()),
    DATE_REL_OPEN[relStage] || DATE_REL_OPEN.stranger,
    dateScript.girl_system,
    scenePromptBlock(card, narr, act),
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

function applyAct(act) {
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
    state.arousal = clamp(state.arousal + 3, AROUSAL_MAX);
    state.shame = clamp(state.shame + 5, SHAME_MAX);
    bits.push("性慾 +3　羞恥 +5");
  }
  return { ok: true, bits };
}

function endPages() {
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
  const ids = Object.keys(malePack?.types || { fat: 1, gym: 1, lust: 1 });
  const type = ids[Math.floor(Math.random() * ids.length)];
  const meta = malePack?.types?.[type] || {
    name: "男子",
    talkWeight: 0.5,
    approach: "嗨。",
    approachNarr: "有個男人走過來。",
  };
  return {
    type,
    name: meta.name,
    talkWeight: meta.talkWeight ?? 0.5,
    appearAfter: 2 + Math.floor(Math.random() * 3),
    onField: false,
    appeared: false,
    gone: false,
    sex: false,
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

function pickMaleLine(kind) {
  const m = state.male;
  const cardId = state.card?.id;
  const lv = obeyLevel();
  const pack = malePack?.lines?.[m.type]?.[cardId]?.[lv]?.[kind];
  if (!pack?.length) return { narr: "那名男子靠近她。", male: "……" };
  const key = `${cardId}:${lv}:${kind}`;
  const used = m.used[key] || [];
  const left = pack.map((_, i) => i).filter((i) => !used.includes(i));
  const pickFrom = left.length ? left : pack.map((_, i) => i);
  const chosen = pickFrom[Math.floor(Math.random() * pickFrom.length)];
  m.used[key] = left.length ? used.concat(chosen) : [chosen];
  return pack[chosen];
}

function maleActKind() {
  const w = state.male.talkWeight ?? 0.5;
  return Math.random() < w ? "talk" : "touch";
}

function maleSucceeds() {
  const lv = obeyLevel();
  if (lv === "resist") return false;
  if (lv === "obey") return true;
  return Math.random() < 0.5;
}

function applyMaleAct(kind) {
  const a = kind === "touch" ? 2 : 1;
  const s = kind === "touch" ? 2 : 1;
  state.arousal = clamp(state.arousal + a, AROUSAL_MAX);
  state.shame = clamp(state.shame + s, SHAME_MAX);
  return `性慾 +${a}　羞恥 +${s}`;
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
    `男子「${mn}」動作：${kind === "approach" ? "搭訕" : kind === "talk" ? "言語調戲" : "肢體碰觸"}`,
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
        content: `你是「${name}」。對旁邊的約會對象（玩家）說你要跟剛才那個男人去做愛了。道歉或對不起都可以，但意思必須是要去做愛。一句到兩句。不要角色名冒號。`,
      },
      { role: "user", content: `男子是${mn}。請對玩家說。` },
    ]);
    return cleanLine(raw, name) || "對不起……我要去做愛了。";
  }
  const raw = await llmChat([
    {
      role: "system",
      content: `你是「${mn}」。對旁邊這個男人（玩家）宣布你要帶這個女人去做愛了。可以囂張。一句到兩句。不要角色名冒號。`,
    },
    { role: "user", content: `女的叫${name}。請對玩家說。` },
  ]);
  return cleanLine(raw, mn) || "我們要去做愛了。";
}

async function maybeMaleBeat() {
  const m = state.male;
  if (state.ended || !m || m.sex) return false;
  if (m.onField) {
    await startMaleTurn();
    return true;
  }
  if (!m.appeared && state.round >= m.appearAfter) {
    await startMaleApproach();
    return true;
  }
  if (m.appeared && !m.onField && Math.random() < 1 / 3) {
    m.onField = true;
    m.gone = false;
    await startMaleTurn();
    return true;
  }
  return false;
}

function sexPages(fromGirl) {
  state.male.sex = true;
  state.ended = true;
  if (fromGirl) {
    return [
      {
        role: "girl",
        who: girl.name,
        fallback: "對不起……我要去做愛了。",
        load: () => aiSexAnnounce("girl"),
      },
    ];
  }
  return [
    {
      role: "male",
      who: state.male.name,
      fallback: "我們要去做愛了。",
      load: () => aiSexAnnounce("male"),
    },
  ];
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
    `男子這次是：${kind === "approach" ? "走過來搭訕" : kind === "talk" ? "言語調戲" : "肢體碰觸"}`,
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
    { role: "male", who: m.name, text: spec.male, extra: kind === "approach" ? "" : `${success ? "成功" : "失敗"}　${delta || ""}` },
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
    {
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
    },
  ];
  if (kind === "approach" || m.sex) return pages;
  const lv = obeyLevel();
  if (lv === "obey" && state.arousal >= AROUSAL_MAX) {
    pages.push({
      role: "girl",
      who: girl.name,
      fallback: "要不要……去做？",
      load: async () => {
        const raw = await llmChat([
          {
            role: "system",
            content: `你是「${girl.name}」。你已經順從，性慾滿了。主動問眼前這個男人要不要做愛。一句到兩句。不要角色名冒號。`,
          },
          { role: "user", content: `男人是${m.name}。` },
        ]);
        return cleanLine(raw, girl.name) || "要不要……現在去做？";
      },
    });
    pages.push(...sexPages(true));
  } else if (lv === "obey" && Math.random() < 1 / 3) {
    pages.push({
      role: "male",
      who: m.name,
      fallback: "跟我走，去做愛。",
      load: async () => {
        const raw = await llmChat([
          {
            role: "system",
            content: `你是「${m.name}」。你要帶這個女人去做愛，或強邀。一句。不要角色名冒號。`,
          },
          { role: "user", content: `女的叫${girl.name}。` },
        ]);
        return cleanLine(raw, m.name) || "跟我走，去做愛。";
      },
    });
    pages.push(...sexPages(false));
  }
  return pages;
}

async function startMaleApproach() {
  const m = state.male;
  const meta = malePack?.types?.[m.type] || {};
  m.onField = true;
  m.appeared = true;
  const spec = {
    narr: meta.approachNarr || "有個男人走過來。",
    male: meta.approach || "嗨。",
  };
  await playQueue(maleBeatPages({ kind: "approach", spec, success: false, delta: "" }));
}

async function startMaleTurn() {
  const kind = maleActKind();
  const spec = pickMaleLine(kind);
  const delta = applyMaleAct(kind);
  const success = maleSucceeds();
  if (state.male) state.male.escapeDenom = (state.male.escapeDenom || 15) + 2;
  await playQueue(maleBeatPages({ kind, spec, success, delta }));
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
          kind: "talk",
        }),
    },
  ];
  if (ok) {
    state.male.onField = false;
    state.male.gone = true;
    const to = NEXT[state.zone];
    if (cards.some((c) => c.zone === to)) state.zone = to;
    drawCard();
  }
  await playQueue(pages);
}

function chatHint(act, playerLine, card) {
  const scene = card?.scene || zoneOf(state.zone).name;
  const name = girl?.name || "她";
  if (act === "molest") {
    return `玩家在「${scene}」對「${name}」動手猥褻。他說／做：「${playerLine}」。只描述已經發生的肢體，不要寫成口交或做愛。`;
  }
  if (act === "talk") {
    return `玩家在「${scene}」用話調戲「${name}」。他說：「${playerLine}」。只描述已經發生的言語調戲，不要動手寫成猥褻，不要寫成口交或做愛。`;
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
  const result = applyAct(cls.act);
  if (!result.ok) {
    await playQueue([{ role: "sys", who: "系統", text: result.reason }]);
    return;
  }
  state.round += 1;
  const delta = `${ACT_ZH[cls.act] || cls.act}　${result.bits.join("　")}`;
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
  started = true;
  state.ended = false;
  busy = false;
  pendingResolve = false;
  $("admin").classList.remove("on");
  state.arrive = pickArrive();
  state.male = null;
  const card = drawCard();
  const pages = [{ role: "sys", who: "旁白", text: arriveText(state.arrive, girl.name) }];
  if (!card) pages.push({ role: "sys", who: "系統", text: "沒有可抽的廣場卡。" });
  else pages.push({ role: "sys", who: "旁白", text: card.narration });
  await playQueue(pages);
  $("date-input")?.focus();
}

async function doAct(act) {
  if (act === "admin") {
    $("admin").classList.add("on");
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
  if (act === "rescue" || act === "interact") return;
  const card = state.card;
  if (!card) return;
  const fromEdit = act === "tease" || act === "talk" || act === "molest";
  const spec = fromEdit ? pickScriptLine(act) : pickActionLine(card, act);
  if (!spec) {
    await playQueue([{ role: "sys", who: "系統", text: fromEdit ? "edit_date 還沒寫這個行動。" : "這張卡沒有這個行動。" }]);
    return;
  }
  const result = applyAct(act);
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
  await showPage({
    role: "sys",
    who: "旁白",
    load: () => aiNarrate(spec.narr),
    fallback: spec.narr,
  });
  const narr = document.querySelector("#log .tx")?.textContent || spec.narr;
  waitingAi = false;
  const girlP = aiGirlReply({ card, act, narr, playerLine: spec.player, delta });
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
    malePack = null;
    try {
      const raw = await fetch("/content/edit_date.json?ts=" + Date.now()).then((r) => {
        if (!r.ok) throw new Error("讀劇本失敗");
        return r.json();
      });
      dateScript = normalizeDateScript(raw);
    } catch {
      dateScript = normalizeDateScript(DEFAULT_DATE_SCRIPT);
    }
    setAdminStatus(`卡 ${cards.length} 張 · 人設池已載入 · 約會劇本已載入（男子線暫停）`);
  } catch (e) {
    setAdminStatus(e.message, true);
  }
}

boot();
