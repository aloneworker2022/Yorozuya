// 魅魔萬事屋 遊戲核心
// M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔
// M1:商店/地牢/召喚 + 名冊 + 情感需求 + NTR + 睡眠時鐘 + 看板娘罐頭反應
// M2:Ollama 聊天/約會(galgame 式)+ PersonaBuilder 銜接口 + history 存檔

import { buildSystemPrompt } from "./content/persona_builder.js";

// ===== 常數 =====

const REWARDS = [1, 2, 3, 4, 6, 8, 12, 24]; // 24 的因數;期限 = 24/G 小時
const HOUR = 3600 * 1000;
const MAX_EXEC = 3;

const RARITIES = ["N", "R", "S", "SS", "SSR"];
const SUMMON_TABLE = { 1: [100], 2: [50, 50], 3: [50, 20, 30], 4: [40, 30, 20, 10], 5: [40, 30, 18, 10, 2], 6: [35, 25, 25, 10, 5] };
const MULT = { N: 1.0, R: 1.1, S: 1.2, SS: 1.35, SSR: 1.5 };
const CHAT_GAP = { N: 3, R: 2, S: 1, SS: 1, SSR: 1 };  // 每 X 天至少聊 1 次
const DATE_GAP = { SS: 5, SSR: 3 };                     // 每 X 天至少約 1 次
const STAGES = [["stranger", "陌生", 0], ["friend", "朋友", 30], ["girlfriend", "女友", 90], ["wife", "妻子", 180]];
const RANSOM = { friend: 30, girlfriend: 90, wife: 180 };
const DATE_COST = 5, DATE_LIMIT = 2, NTR_WINDOW = 7; // 聊天計費:每 2 則玩家訊息 1 金
const DATE_LOCS = ["夜景", "咖啡廳", "遊樂園", "海邊", "圖書館"];
const THEMES = [["aqua", "霓虹水藍"], ["pink", "品紅魔宴"], ["green", "駭客終端"], ["amber", "琥珀映像管"], ["ice", "冰藍幽域"]];

// ===== 內容池(內建預設;之後歸 content/config.json 廠商件擴充)=====

const NAME_POOL = ["莉莉絲", "莫莉安", "賽蓮", "薇兒", "露露姆", "妮克絲", "卡蜜拉", "阿爾緹", "梅菲", "伊芙", "茉璃", "諾瓦"];
const PERSONALITY_POOL = ["傲嬌", "慵懶", "黏人", "高冷", "天然", "毒舌", "害羞", "元氣", "腹黑", "溫柔"];
const SPEECH_POOL = ["敬語", "平語", "粗魯", "撒嬌"];
const TRAIT_POOL = {
  hair: ["silver_hair", "black_hair", "pink_hair", "blonde_hair", "blue_hair", "red_hair"],
  eyes: ["red_eyes", "gold_eyes", "blue_eyes", "purple_eyes", "green_eyes"],
  body: ["petite", "tall", "slender", "curvy"],
  extra: ["long_hair", "short_hair", "twin_tails", "ponytail"],
};
const SACRIFICE_POOL = ["迷路的冒險者", "落魄的商人", "自願的信徒", "酒館的醉漢", "負債的賭徒", "失戀的詩人", "貪婪的盜賊", "無名的流浪者", "可疑的煉金術士", "逃兵"];
const MERCHANT_LINES = ["今天的貨色不錯吧?", "都是自願的,大概。", "早買早享受,晚了就沒了。", "便宜貨也有便宜貨的用法。", "別問來歷。問了也不便宜。"];
const TAUNTS = ["哼,金幣呢?空著手就想召喚魅魔?", "先去做點委託吧,窮鬼。", "祭品。沒有祭品,一切免談。", "你的錢包比夢境還要空。", "急什麼。書頁翻爛了她們也不會出來。"];
const REACT = {
  complete: ["幹得好♥", "今天也很可靠呢。", "嗯,不錯嘛。", "獎勵你一個微笑。"],
  fail: ["喂……違約了啦。", "唉,金幣又飛走了。", "……我就這樣看著你。"],
  hurry: ["喂,時間快到了!", "再不動手就要違約了喔!"],
  stage: ["……關係,好像變了呢。"],
  idle: ["……看什麼?", "嗯?怎麼了嗎。", "委託做完了嗎?", "無所事事的話,來陪我啊。"],
  sleepClick: ["(睡著了)"],
};
const CHAT_LINES = {
  stranger: ["……你是我的召喚者?哼。", "這裡就是人間嗎。", "別靠太近。", "有委託不去做嗎?"],
  friend: ["喔,是你啊。今天如何?", "陪我說說話嘛。", "你做委託的樣子,還算能看。"],
  girlfriend: ["等你好久了。", "今天……想我了嗎?", "牽手。快。"],
  wife: ["歡迎回家,親愛的。", "今晚想夢見什麼?我織給你。", "有你在身邊,夢都是甜的。"],
};
const DATE_LINES = {
  stranger: ["約、約會?算你有膽。", "哼,就陪你走走。"],
  friend: ["好啊,走吧走吧!", "你挑的地方,品味還行。"],
  girlfriend: ["嘿嘿,約會♥", "想去很久了,你怎麼知道?"],
  wife: ["跟你去哪裡都好。", "下次,想去更遠的地方。"],
};

// ===== 狀態 =====

let state = null;
let version = 0;
let dirty = false;
let saveTimer = null;
let detailId = null;     // 魅魔詳情頁
let dateChooser = false; // 詳情頁展開約會地點
let lastSleepState = null;

function defaultState() {
  return {
    gold: 0,
    quests: [],   // {id, text, lv:0|1|2, reward?, startedAt?, deadline?}
    succubi: [],  // 見 summon()
    dungeon: [],  // [{name}]
    shop: null,   // {day, stock:[{id,name,price,sold}], line}
    kanbanId: null,
    lastSettledDay: null,
    log: [],
    settings: { player: "", sleepStart: "01:00", sleepEnd: "06:00", theme: "aqua", ollamaUrl: "http://localhost:11434", model: "", rating: "sfw" },
  };
}

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pick2(arr) { const a = [...arr]; const i = a.splice(Math.floor(Math.random() * a.length), 1)[0]; return [i, pick(a)]; }
function randInt(lo, hi) { return lo + Math.floor(Math.random() * (hi - lo + 1)); }

// ===== 時間:日界與睡眠時段 =====
// 遊戲日以「睡眠結束時刻」為日界(醒來 = 新的一天)

function minOf(hhmm) { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }

function dayNum(t = Date.now()) {
  const d = new Date(t - minOf(state.settings.sleepEnd) * 60000);
  return Math.floor((d.getTime() - d.getTimezoneOffset() * 60000) / 86400000);
}

function isAsleep(t = Date.now()) {
  const d = new Date(t);
  const m = d.getHours() * 60 + d.getMinutes();
  const s = minOf(state.settings.sleepStart), e = minOf(state.settings.sleepEnd);
  return s <= e ? (m >= s && m < e) : (m >= s || m < e);
}

// ===== 存檔 =====
// 伺服器為權威;localStorage 只作斷線快取。連不上時絕不開空檔:
// 有快取用快取(恢復連線自動回推),沒快取顯示重連畫面。

const CACHE_KEY = "yorozuya_cache";

function cacheLocal() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ version, data: state })); } catch { }
}

async function fetchSave() {
  const r = await fetch("/api/save", { cache: "no-store" });
  if (!r.ok) throw new Error("http " + r.status);
  return r.json();
}

function showConnOverlay(show) {
  document.getElementById("conn-overlay").classList.toggle("hidden", !show);
}

function initState(j, offline) {
  version = j.version;
  state = j.data ?? defaultState();
  const def = defaultState();
  for (const k of Object.keys(def)) state[k] ??= def[k];
  state.settings = { ...def.settings, ...state.settings };
  if (state.lastSettledDay == null) state.lastSettledDay = dayNum();
  showConnOverlay(false);
  document.getElementById("set-srv").textContent = offline ? "離線(使用本地快取)" : "OK";
  settleOffline();
  settleDays();
  ensureShop();
  renderAll();
  if (offline) {
    toast("目前離線,進度會在恢復連線後自動同步", "bad");
    dirty = true;              // 讓 saveNow 的重試迴圈持續嘗試回推
    saveTimer = setTimeout(saveNow, 5000);
  } else {
    cacheLocal();
  }
}

async function load() {
  try {
    initState(await fetchSave(), false);
  } catch (e) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      try { initState(JSON.parse(cached), true); return; } catch { }
    }
    showConnOverlay(true);
    setTimeout(load, 3000);
  }
}

// 切回前景:對時結算 + 和伺服器對版本(避免背景太久資料過期)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !state) return;
  try {
    const j = await fetchSave();
    if (j.version > version && !dirty) {
      version = j.version;
      state = j.data ?? state;
      const def = defaultState();
      for (const k of Object.keys(def)) state[k] ??= def[k];
      state.settings = { ...def.settings, ...state.settings };
    }
    document.getElementById("set-srv").textContent = "OK";
  } catch { }
  settleOffline();
  settleDays();
  ensureShop();
  renderAll();
});

function scheduleSave() {
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

async function saveNow(keepalive = false) {
  if (!dirty || !state) return;
  dirty = false;
  try {
    const r = await fetch("/api/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_version: version, data: state }),
      keepalive,
    });
    if (r.status === 409) {
      const j = await fetch("/api/save").then(x => x.json());
      version = j.version;
      state = j.data ?? defaultState();
      toast("存檔衝突:已載入伺服器上較新的進度", "bad");
      renderAll();
      return;
    }
    const j = await r.json();
    version = j.version;
    cacheLocal();
    document.getElementById("set-ver").textContent = "v" + version;
    document.getElementById("set-srv").textContent = "OK";
  } catch (e) {
    // 存不上(離線/伺服器重啟):5 秒後自動重試,直到成功
    dirty = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 5000);
  }
}

window.addEventListener("beforeunload", () => { if (dirty) saveNow(true); });

function log(msg) {
  state.log.unshift(`[${new Date().toLocaleString("zh-TW", { hour12: false })}] ${msg}`);
  state.log = state.log.slice(0, 50);
}

// ===== 委託 =====

function penaltyOf(g) { return Math.max(1, Math.floor(g / 2)); }
function execQuests() { return state.quests.filter(q => q.lv === 2); }

function addQuest(text) {
  text = text.trim();
  if (!text) return;
  state.quests.push({ id: uid(), text, lv: 0 });
  toast("已加入發現池", "");
  scheduleSave(); renderAll();
}

function accept(id, g) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 1; q.reward = g;
  scheduleSave(); renderAll();
}

function start(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q || execQuests().length >= MAX_EXEC) return;
  q.lv = 2;
  q.startedAt = Date.now();
  q.deadline = q.startedAt + (24 / q.reward) * HOUR;
  log(`開始執行「${q.text}」(${q.reward} 金/${24 / q.reward}h)`);
  scheduleSave(); renderAll();
}

function complete(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  state.gold += q.reward;
  state.quests = state.quests.filter(x => x.id !== id);
  log(`完成「${q.text}」 +${q.reward} 金`);
  toast(`委託完成!+${q.reward} 金`, "good");
  kanbanReact("complete");
  scheduleSave(); renderAll();
}

function failQuest(q, silent = false) {
  const pen = penaltyOf(q.reward);
  state.gold -= pen;
  state.quests = state.quests.filter(x => x.id !== q.id);
  log(`「${q.text}」超時,違約金 -${pen} 金`);
  if (!silent) { toast(`委託超時!違約金 -${pen} 金`, "bad"); kanbanReact("fail"); }
}

function drop(id) {
  state.quests = state.quests.filter(x => x.id !== id);
  scheduleSave(); renderAll();
}

function demote(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 0; delete q.reward;
  scheduleSave(); renderAll();
}

function editText(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  const t = prompt("編輯委託內容:", q.text);
  if (t && t.trim()) { q.text = t.trim(); scheduleSave(); renderAll(); }
}

function settleOffline() {
  const now = Date.now();
  const expired = execQuests().filter(q => now >= q.deadline);
  if (!expired.length) return;
  let total = 0;
  for (const q of expired) { total += penaltyOf(q.reward); failQuest(q, true); }
  toast(`離線結算:${expired.length} 件委託超時,違約金 -${total} 金`, "bad");
  scheduleSave();
}

// ===== 商店與地牢 =====

function ensureShop() {
  const today = dayNum();
  if (state.shop && state.shop.day === today) return;
  const n = randInt(3, 6);
  state.shop = {
    day: today,
    stock: Array.from({ length: n }, () => ({ id: uid(), name: pick(SACRIFICE_POOL), price: randInt(5, 30), sold: false })),
    line: pick(MERCHANT_LINES),
  };
  scheduleSave();
}

function buy(itemId) {
  const it = state.shop.stock.find(i => i.id === itemId);
  if (!it || it.sold) return;
  if (state.gold < it.price) { toast("金幣不夠", "bad"); return; }
  state.gold -= it.price;
  it.sold = true;
  state.dungeon.push({ name: it.name });
  log(`購入祭品「${it.name}」 -${it.price} 金`);
  scheduleSave(); renderAll();
}

// ===== 召喚 =====

function rollRarity(n) {
  const table = SUMMON_TABLE[n];
  let r = Math.random() * 100, acc = 0;
  for (let i = 0; i < table.length; i++) { acc += table[i]; if (r < acc) return RARITIES[i]; }
  return RARITIES[table.length - 1];
}

function summon(n) {
  if (state.dungeon.length < n || state.gold < 0) return;
  state.dungeon.splice(0, n);
  const today = dayNum();
  const s = {
    id: uid(),
    name: pick(NAME_POOL),
    rarity: rollRarity(n),
    personality: pick2(PERSONALITY_POOL),
    speech: pick(SPEECH_POOL),
    dna: { seed: Math.floor(Math.random() * 1e9), traits: [pick(TRAIT_POOL.hair), pick(TRAIT_POOL.eyes), pick(TRAIT_POOL.body), pick(TRAIT_POOL.extra)] },
    affection: 0,
    stage: "stranger",
    portraitReady: false,
    summonedAt: Date.now(),
    lastChatDay: today,
    lastDateDay: today,
    datesToday: { day: today, count: 0 },
    ntr: null,
  };
  state.succubi.push(s);
  log(`獻祭 ${n} 人,召喚出【${s.rarity}】${s.name}`);
  scheduleSave();
  showSummonOverlay(s, n);
  renderAll();
}

function showSummonOverlay(s, n) {
  const ov = document.getElementById("summon-overlay");
  ov.classList.remove("hidden");
  ov.innerHTML = `<div class="summon-circle"></div>`;
  setTimeout(() => {
    ov.innerHTML = `
      <div class="summon-result r-${s.rarity}">
        <div class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</div>
        <h3>${esc(s.name)}</h3>
        <div class="portrait">${girlSVG("#241333", 7)}</div>
        <p>她還沒有形體……讓她今晚做個夢吧。</p>
        <p class="small">${s.personality.join("・")} / ${s.speech}</p>
        <button id="summon-close">接受契約</button>
      </div>`;
    document.getElementById("summon-close").onclick = () => { ov.classList.add("hidden"); ov.innerHTML = ""; renderAll(); };
  }, 1400);
}

// ===== 情感、需求、NTR =====

function stageInfo(key) { return STAGES.find(s => s[0] === key); }
function nextStage(s) { const i = STAGES.findIndex(x => x[0] === s.stage); return STAGES[i + 1] || null; }
function stageLabel(key) { return stageInfo(key)[1]; }

function applyAffection(s, base) {
  const d = Math.round(base * MULT[s.rarity] * 10) / 10;
  s.affection = Math.round((s.affection + d) * 10) / 10;
  // 升階(里程碑,不回退)
  let ns = nextStage(s);
  while (ns && s.affection >= ns[2]) {
    s.stage = ns[0];
    log(`${s.name} 與你的關係升級為【${ns[1]}】`);
    toast(`${s.name} 成為你的${ns[1]}了!`, "good");
    kanbanReact("stage");
    ns = nextStage(s);
  }
  checkBreak(s);
  return d;
}

function checkBreak(s) {
  if (s.affection > -10 || s.ntr) return;
  if (s.stage === "stranger") {
    state.succubi = state.succubi.filter(x => x.id !== s.id);
    if (detailId === s.id) detailId = null;
    log(`${s.name} 離開了。再也不會回來。`);
    toast(`${s.name} 離開了……`, "bad");
  } else {
    const today = dayNum();
    s.ntr = { sinceDay: today, deadlineDay: today + NTR_WINDOW };
    s.affection = -10;
    log(`${s.name} 被另一位召喚師奪走了!${NTR_WINDOW} 天內可贖回(${RANSOM[s.stage]} 金)`);
    toast(`${s.name} 被奪走了!`, "bad");
  }
}

// 每日結算:逐日檢查需求逾期
function settleDays() {
  const today = dayNum();
  if (state.lastSettledDay >= today) return;
  for (let d = state.lastSettledDay + 1; d <= today; d++) {
    for (const s of [...state.succubi]) {
      if (s.ntr) {
        if (d >= s.ntr.deadlineDay) {
          state.succubi = state.succubi.filter(x => x.id !== s.id);
          if (detailId === s.id) detailId = null;
          log(`${s.name} 沒能等到你。她的一切都被那個男人帶走了。`);
          toast(`${s.name} 永遠消失了……`, "bad");
        }
        continue;
      }
      let miss = (d - s.lastChatDay) > CHAT_GAP[s.rarity];
      if (DATE_GAP[s.rarity] && (d - s.lastDateDay) > DATE_GAP[s.rarity]) miss = true;
      if (miss) {
        s.affection = Math.round((s.affection - 3) * 10) / 10;
        checkBreak(s);
      }
    }
  }
  state.lastSettledDay = today;
  scheduleSave();
}

function needStatus(s) {
  if (s.ntr) return "ntr";
  if (s.affection <= -7) return "danger";
  const today = dayNum();
  const chatDue = (today - s.lastChatDay) >= CHAT_GAP[s.rarity];
  const dateDue = DATE_GAP[s.rarity] && (today - s.lastDateDay) >= DATE_GAP[s.rarity];
  return (chatDue || dateDue) ? "due" : "ok";
}

// ===== 互動:聊天/約會 session(LLM;無模型時罐頭模式)=====

let chatWith = null;      // 對話中的魅魔 id
let chatSession = null;   // {type:'chat'|'date', location, playerMsgs, gotReply, busy}
let chatAbort = null;

function interactGuard(s, cost) {
  if (isAsleep()) return "睡眠時段——她回夢境了";
  if (s.ntr) return "她不在你身邊……";
  if (state.gold < 0) return "負債中,先去做委託還債吧";
  if (state.gold < cost) return "金幣不夠";
  return null;
}

function enterChat(id, type = "chat", location = null) {
  const s = state.succubi.find(x => x.id === id);
  if (!s) return;
  const err = interactGuard(s, type === "date" ? DATE_COST : 0);
  if (err) { toast(err, "bad"); return; }
  const today = dayNum();
  if (type === "date") {
    if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
    if (s.datesToday.count >= DATE_LIMIT) { toast("今天約會夠多了,她需要休息", "bad"); return; }
    state.gold -= DATE_COST;
    s.datesToday.count++;
    s.lastDateDay = today;
    s.lastChatDay = today;
    log(`與 ${s.name} 去${location}約會 -${DATE_COST} 金`);
  }
  chatWith = id;
  chatSession = { type, location, playerMsgs: 0, gotReply: false, busy: false };
  dateChooser = false;
  document.body.classList.add("chat-mode");
  scheduleSave(); renderAll();
  renderChatLog(s);
  if (type === "date") vnShow("", `—— ${location}・約會開始 ——`, "sys");
  document.getElementById("chat-input").focus();
}

function exitChat() {
  const s = state.succubi.find(x => x.id === chatWith);
  if (s && chatSession) {
    if (chatSession.type === "date") {
      const d = applyAffection(s, randInt(1, 5));
      log(`與 ${s.name} 的${chatSession.location}約會結束,情感 +${d}`);
      toast(`約會結束,情感 +${d}`, "good");
    } else if (chatSession.gotReply) {
      const d = applyAffection(s, randInt(-1, 2));
      log(`與 ${s.name} 聊了一會,情感 ${d >= 0 ? "+" : ""}${d}`);
      toast(`聊天結束,情感 ${d >= 0 ? "+" : ""}${d}`, d >= 0 ? "good" : "bad");
    }
  }
  chatAbort?.abort();
  chatWith = null; chatSession = null;
  document.body.classList.remove("chat-mode");
  scheduleSave(); renderAll();
}

function buildCtx(s) {
  const h = new Date().getHours();
  return {
    character: {
      name: s.name, rarity: s.rarity, personality: s.personality,
      speech_style: s.speech, appearance_dna: s.dna, backstory: "",
    },
    relationship: {
      stage: s.stage, affection: s.affection,
      days_since_summon: Math.floor((Date.now() - s.summonedAt) / 86400000),
    },
    scene: {
      type: chatSession.type, location: chatSession.location,
      time_of_day: h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening",
    },
    content_rating: state.settings.rating || "sfw",
    player: { name: state.settings.player || "主人" },
  };
}

// ===== VN 對話框(日式文字冒險演出)=====

function vnShow(name, text, who = "ai") {
  const n = $("#vn-name");
  n.textContent = name;
  n.style.color = who === "user" ? "var(--cyan)" : who === "sys" ? "var(--dim)" : "var(--pink)";
  $("#vn-text").textContent = text;
  $("#vn-cursor").classList.add("hidden");
  vnTyping(false);
}

function vnTyping(show) { $("#vn-typing").classList.toggle("hidden", !show); }
function vnDone() { $("#vn-cursor").classList.remove("hidden"); vnTyping(false); }

async function llmReply(s, onToken) {
  // 無模型設定 → 罐頭模式(逐字打字機演出)
  if (!state.settings.model) {
    await new Promise(r => setTimeout(r, 600));
    const pool = chatSession?.type === "date" ? DATE_LINES : CHAT_LINES;
    const line = pick(pool[s.stage] || pool.stranger);
    for (let i = 1; i <= line.length; i++) {
      if (!chatSession) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      onToken(line.slice(0, i));
      await new Promise(r => setTimeout(r, 35));
    }
    return line;
  }
  chatAbort = new AbortController();
  const res = await fetch("/api/llm/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      endpoint: state.settings.ollamaUrl,
      model: state.settings.model,
      stream: true,
      messages: [
        { role: "system", content: buildSystemPrompt(buildCtx(s)) },
        ...(s.history || []).slice(-40).map(m => ({ role: m.role, content: m.content })),
      ],
      options: { temperature: 0.9 },
    }),
    signal: chatAbort.signal,
  });
  if (!res.ok) throw new Error("proxy error");
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "", acc = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line) continue;
      const o = JSON.parse(line);
      if (o.error) throw new Error(o.error);
      acc += o.message?.content || "";
      onToken(acc);
      if (o.done) { if (!acc.trim()) throw new Error("empty"); return acc; }
    }
  }
  if (!acc.trim()) throw new Error("empty");
  return acc;
}

async function sendChatMsg() {
  const s = state.succubi.find(x => x.id === chatWith);
  const input = document.getElementById("chat-input");
  if (!s || !chatSession || chatSession.busy) return;
  const text = input.value.trim();
  if (!text) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  // 計費:聊天 session 每 2 則玩家訊息 1 金(約會 session 訊息免費,入場已付 5 金)
  const chargeable = chatSession.type === "chat" && (chatSession.playerMsgs + 1) % 2 === 0;
  if (chargeable && state.gold < 1) { toast("金幣不夠了,先去做委託吧", "bad"); return; }

  input.value = "";
  s.history ??= [];
  s.history.push({ role: "user", content: text, t: Date.now() });
  // 先亮出玩家台詞,名牌切「她・輸入中」
  vnShow(state.settings.player || "你", text, "user");
  vnTyping(true);
  $("#vn-name").textContent = (state.settings.player || "你") + " → " + s.name;
  chatSession.busy = true;
  document.getElementById("chat-send").disabled = true;
  try {
    const reply = await llmReply(s, acc => {
      vnShow(s.name, acc, "ai");
    });
    s.history.push({ role: "assistant", content: reply, t: Date.now() });
    s.history = s.history.slice(-200);
    chatSession.playerMsgs++;
    if (chargeable) { state.gold -= 1; renderHud(); }
    if (!chatSession.gotReply) { chatSession.gotReply = true; s.lastChatDay = dayNum(); }
    vnDone();
    scheduleSave();
  } catch (e) {
    s.history.pop();
    if (e.name !== "AbortError") {
      vnShow("", "(她恍神了……訊息不扣費,再說一次吧)", "sys");
      input.value = text;
    }
  }
  if (chatSession) {
    chatSession.busy = false;
    const btn = document.getElementById("chat-send");
    if (btn) btn.disabled = false;
    input.focus();
  }
}

function appendMsg(role, text) {
  const msgs = document.getElementById("chat-msgs");
  const d = document.createElement("div");
  d.className = "msg " + role;
  d.textContent = text;
  msgs.appendChild(d);
  return d;
}

function renderBacklog(s) {
  const msgs = document.getElementById("chat-msgs");
  msgs.innerHTML = "";
  for (const m of (s.history || []).slice(-100)) {
    appendMsg(m.role === "user" ? "user" : "ai", m.content);
  }
  if (!(s.history || []).length) appendMsg("sys", "(還沒有對話紀錄)");
  const bl = document.getElementById("chat-backlog");
  bl.scrollTop = bl.scrollHeight;
}

function renderChatLog(s) {
  document.getElementById("chat-backlog").classList.add("hidden");
  const lastAi = [...(s.history || [])].reverse().find(m => m.role === "assistant");
  if (lastAi) { vnShow(s.name, lastAi.content, "ai"); vnDone(); }
  else vnShow("", `(這是你與 ${s.name} 的第一次對話——她看著你,等你先開口)`, "sys");
}

function ransom(id) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || !s.ntr) return;
  const cost = RANSOM[s.stage];
  if (state.gold < cost) { toast(`贖金 ${cost} 金,你付不起`, "bad"); return; }
  state.gold -= cost;
  const today = dayNum();
  s.ntr = null;
  s.affection = 0;
  s.lastChatDay = s.lastDateDay = today;
  s.datesToday = { day: today, count: 0 };
  log(`付出 ${cost} 金,把 ${s.name} 贖了回來。`);
  toast(`${s.name} 回來了。別再冷落她了。`, "good");
  scheduleSave(); renderAll();
}

// ===== 看板娘 =====

function kanbanSuccubus() {
  if (state.kanbanId) {
    const s = state.succubi.find(x => x.id === state.kanbanId);
    if (s && !s.ntr) return s;
  }
  const alive = state.succubi.filter(s => !s.ntr);
  return alive[alive.length - 1] || null;
}

let bubbleTimer = null;
function kanbanSay(text) {
  const b = document.getElementById("kanban-bubble");
  b.textContent = text;
  b.classList.remove("hidden");
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => b.classList.add("hidden"), 2800);
}

function kanbanReact(type) {
  if (isAsleep()) return;           // 睡眠中罐頭反應停用
  if (!kanbanSuccubus()) return;    // 沒有看板娘
  kanbanSay(pick(REACT[type]));
}

// ===== 像素剪影 =====

function girlSVG(fill, scale = 6) {
  const px = [
    [6, 0, 1, 2], [9, 0, 1, 2],                 // 角
    [4, 2, 8, 1], [3, 3, 10, 4],                // 髮/頭
    [2, 4, 1, 7], [13, 4, 1, 7],                // 側髮
    [4, 7, 8, 1],
    [7, 8, 2, 1],                               // 頸
    [5, 9, 6, 4],                               // 身
    [4, 10, 1, 3], [11, 10, 1, 3],              // 臂
    [0, 9, 2, 3], [14, 9, 2, 3],                // 翼
    [1, 8, 1, 1], [14, 8, 1, 1],
    [5, 13, 6, 3],                              // 裙
    [6, 16, 1, 5], [9, 16, 1, 5],               // 腿
    [5, 21, 2, 1], [9, 21, 2, 1],               // 足
    [12, 14, 1, 3], [13, 16, 1, 2], [12, 18, 2, 1], // 尾
  ];
  return `<svg viewBox="0 0 16 22" width="${16 * scale}" height="${22 * scale}" shape-rendering="crispEdges">${px.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"/>`).join("")}</svg>`;
}

// ===== Tick =====

let lastTickDay = null;

setInterval(() => {
  if (!state) return;
  const now = Date.now();
  let changed = false;

  for (const q of [...execQuests()]) {
    if (now >= q.deadline) { failQuest(q); changed = true; }
    else {
      updateBar(q, now);
      const frac = (q.deadline - now) / (q.deadline - q.startedAt);
      if (frac <= 0.2 && !q._warned) { q._warned = true; kanbanReact("hurry"); }
    }
  }

  const today = dayNum();
  if (lastTickDay !== null && today !== lastTickDay) { settleDays(); ensureShop(); changed = true; }
  lastTickDay = today;

  const asleep = isAsleep();
  if (asleep !== lastSleepState) {
    if (asleep && chatWith) { toast("睡眠時段到了,她回夢境了", "bad"); exitChat(); }
    lastSleepState = asleep;
    changed = true;
  }

  if (changed) { scheduleSave(); renderAll(); }
}, 1000);

// ===== 渲染 =====

const $ = s => document.querySelector(s);
function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

function applyTheme() {
  document.body.dataset.theme = state.settings.theme || "aqua";
}

function renderAll() {
  applyTheme();
  renderHud();
  renderQuests();
  renderShop();
  renderSuccubi();
  renderKanban();
  renderSettings();
}

function renderHud() {
  const g = $("#hud-gold");
  g.textContent = "⟡ " + state.gold;
  g.classList.toggle("debt", state.gold < 0);
  $("#hud-debt").classList.toggle("hidden", state.gold >= 0);

  const needy = state.succubi.filter(s => needStatus(s) !== "ok").length;
  const nb = $("#hud-need");
  nb.classList.toggle("hidden", needy === 0);
  nb.querySelector("span").textContent = needy;

  const asleep = isAsleep();
  $("#hud-sleep").classList.toggle("hidden", !asleep);
  document.body.classList.toggle("asleep", asleep);
}

function fmtRemain(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}

function updateBar(q, now) {
  const bar = document.querySelector(`[data-bar="${q.id}"]`);
  const rem = document.querySelector(`[data-remain="${q.id}"]`);
  if (!bar) return;
  const frac = (q.deadline - now) / (q.deadline - q.startedAt);
  bar.style.width = Math.max(0, frac * 100) + "%";
  bar.classList.toggle("danger", frac <= 0.2);
  if (rem) rem.innerHTML = frac <= 0.2
    ? `剩 <span class="warn">${fmtRemain(q.deadline - now)}</span> — 違約金 <span class="warn">-${penaltyOf(q.reward)} 金</span>`
    : `剩 ${fmtRemain(q.deadline - now)}`;
}

// ===== 委託卡片場景(cthulhu-note 式:一次一張,手勢操作)=====

let qScene = "exec";        // exec(執行中三格)| proc(處理)
let pinIdx = 0;
let procPool = null;        // 強制池:0 發現 | 1 已承接 | null 自動
let procIdx = { 0: 0, 1: 0 };
let _pinAbort = null;

function poolItems(lv) { return state.quests.filter(q => q.lv === lv); }
function curPool() {
  if (procPool !== null && poolItems(procPool).length) return procPool;
  procPool = null;
  return poolItems(0).length ? 0 : 1;
}
function goProc() { qScene = "proc"; document.getElementById("page-quests").classList.add("on-proc"); renderQuests(); }
function goExec() { qScene = "exec"; procPool = null; document.getElementById("page-quests").classList.remove("on-proc"); renderQuests(); }

function renderQuests() {
  renderExec();
  renderProc();
}

// --- 場景一:執行中三格輪播 ---

function renderExec() {
  const exec = execQuests();
  $("#exec-count").textContent = `執行中 ${exec.length}/${MAX_EXEC}`;
  const track = $("#pin-track");
  let html = "";
  for (let i = 0; i < MAX_EXEC; i++) {
    const q = exec[i];
    if (q) {
      html += `<div class="pin-slide"><div class="q-card">
        <span class="q-tag gold-tag">完成 +${q.reward} 金</span>
        <div class="q-body">${esc(q.text)}</div>
        <div>
          <div class="bar-wrap"><div class="bar" data-bar="${q.id}"></div></div>
          <div class="remain" data-remain="${q.id}"></div>
          <div class="q-hints"><span class="hint">↑ 上滑完成</span><span class="hint">← → 切換</span></div>
        </div>
        <div class="swind"></div>
      </div></div>`;
    } else {
      html += `<div class="pin-slide"><div class="pin-slot" data-slot>
        <div class="pin-slot-icon">+</div>
        <div class="pin-slot-txt">${poolItems(0).length + poolItems(1).length ? "去承接/開始委託" : "先在下方輸入待辦"}</div>
      </div></div>`;
    }
  }
  track.innerHTML = html;
  pinIdx = Math.min(pinIdx, MAX_EXEC - 1);
  track.style.transform = `translateX(-${pinIdx * 100}%)`;
  $("#pin-dots").innerHTML = Array.from({ length: MAX_EXEC }, (_, i) => `<div class="dot${i === pinIdx ? " on" : ""}"></div>`).join("");
  track.querySelectorAll("[data-slot]").forEach(el => el.onclick = () => goProc());
  attachPinSwipe($("#pin-carousel"), exec);
  const now = Date.now();
  for (const q of exec) updateBar(q, now);
}

function setPinIdx(i) {
  pinIdx = Math.max(0, Math.min(MAX_EXEC - 1, i));
  $("#pin-track").style.transform = `translateX(-${pinIdx * 100}%)`;
  document.querySelectorAll("#pin-dots .dot").forEach((d, idx) => d.classList.toggle("on", idx === pinIdx));
}

function attachPinSwipe(el, exec) {
  if (_pinAbort) _pinAbort.abort();
  _pinAbort = new AbortController();
  const sig = _pinAbort.signal;
  const track = $("#pin-track");
  const THRESH = 50;
  let sx, sy, startIdx, dragging = false;

  el.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    startIdx = pinIdx; dragging = true;
    track.style.transition = "none";
  }, { passive: true, signal: sig });
  el.addEventListener("touchmove", e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) {
      track.style.transform = `translateX(${-(startIdx * 100 - (dx / el.offsetWidth) * 100)}%)`;
      if (e.cancelable) e.preventDefault();
    }
  }, { passive: false, signal: sig });
  el.addEventListener("touchend", e => {
    if (!dragging) return; dragging = false;
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    track.style.transition = "transform .3s cubic-bezier(.4,0,.2,1)";
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -THRESH) setPinIdx(startIdx + 1);
      else if (dx > THRESH) setPinIdx(startIdx - 1);
      else setPinIdx(startIdx);
    } else {
      track.style.transform = `translateX(-${pinIdx * 100}%)`;
      if (dy < -THRESH) { const q = exec[pinIdx]; if (q) flyPinCard(() => complete(q.id)); }
    }
  }, { passive: true, signal: sig });

  let mdown = false, msx, msy, msi;
  el.addEventListener("mousedown", e => { mdown = true; msx = e.clientX; msy = e.clientY; msi = pinIdx; track.style.transition = "none"; }, { signal: sig });
  window.addEventListener("mousemove", e => {
    if (!mdown) return;
    const dx = e.clientX - msx;
    track.style.transform = `translateX(${-(msi * 100 - (dx / el.offsetWidth) * 100)}%)`;
  }, { signal: sig });
  window.addEventListener("mouseup", e => {
    if (!mdown) return; mdown = false;
    const dx = e.clientX - msx, dy = e.clientY - msy;
    track.style.transition = "transform .3s cubic-bezier(.4,0,.2,1)";
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -THRESH) setPinIdx(msi + 1); else if (dx > THRESH) setPinIdx(msi - 1); else setPinIdx(msi);
    } else {
      track.style.transform = `translateX(-${pinIdx * 100}%)`;
      if (dy < -THRESH) { const q = exec[pinIdx]; if (q) flyPinCard(() => complete(q.id)); }
    }
  }, { signal: sig });
}

function flyPinCard(action) {
  const slide = document.querySelectorAll("#pin-track .pin-slide")[pinIdx];
  const card = slide?.querySelector(".q-card");
  if (!card) { action(); return; }
  card.style.transition = "transform .26s ease,opacity .26s ease";
  card.style.transform = "translateY(-130%)";
  card.style.opacity = "0";
  setTimeout(action, 260);
}

// --- 場景二:處理(發現/已承接) ---

function renderProc() {
  const stage = $("#q-stage");
  const nav = $("#q-nav");
  const badge = $("#q-badge");
  const NAMES = { 0: "發現", 1: "已承接" };
  const lv = curPool();
  const list = poolItems(lv);

  const tabs = $("#q-force-tabs");
  tabs.innerHTML = [0, 1].map(l =>
    `<button class="q-force-tab${l === lv ? " active" : ""}" data-pool="${l}">${NAMES[l]}<b>${poolItems(l).length}</b></button>`).join("");
  tabs.querySelectorAll("button").forEach(b => b.onclick = () => { procPool = +b.dataset.pool; renderQuests(); });

  const total = poolItems(0).length + poolItems(1).length;
  if (!total) { badge.textContent = "全清 ✓"; badge.className = "lv-badge empty"; }
  else { badge.textContent = NAMES[lv]; badge.className = "lv-badge"; }

  if (!list.length) {
    stage.innerHTML = total
      ? `<div class="empty-state"><span class="e-icon">✓</span><span class="e-txt">${NAMES[lv]}池清空了</span></div>`
      : `<div class="empty-state"><span class="e-icon">🌙</span><span class="e-txt">委託板清空了。去陪陪她們吧。</span></div>`;
    nav.textContent = "";
    return;
  }
  procIdx[lv] = Math.min(procIdx[lv], list.length - 1);
  const i = procIdx[lv];
  const q = list[i];
  const full = execQuests().length >= MAX_EXEC;

  const tag = lv === 0
    ? `<span class="q-tag">發現・未定價</span>`
    : `<span class="q-tag gold-tag">${q.reward} 金 / ${24 / q.reward} 小時 / 違約 ${penaltyOf(q.reward)} 金</span>`;
  const hints = lv === 0
    ? ["↑ 承接定價", "↓ 推掉", "← → 切換", "點兩下 編輯"]
    : [full ? "執行中已滿" : "↑ 開始執行", "↓ 推掉", "← → 切換", "點兩下 退回"];

  stage.innerHTML = `<div class="q-card" id="proc-card">
    ${tag}
    <div class="q-body">${esc(q.text)}</div>
    <div class="q-hints">${hints.map(h => `<span class="hint">${h}</span>`).join("")}</div>
    <div class="swind"></div>
  </div>`;
  nav.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";

  const card = $("#proc-card");
  const nav2 = dir => {
    const n = poolItems(lv).length;
    const nx = procIdx[lv] + dir;
    if (nx < 0 || nx >= n) return;
    procIdx[lv] = nx;
    renderProc();
  };
  const H = lv === 0 ? {
    up: () => openRewardSheet(q),
    down: () => flyCard(card, "down", () => drop(q.id)),
    left: () => nav2(1), right: () => nav2(-1),
    dbl: () => editText(q.id),
  } : {
    up: () => {
      if (execQuests().length >= MAX_EXEC) { toast("執行中已滿 3 件", "bad"); return; }
      flyCard(card, "up", () => { start(q.id); goExec(); });
    },
    down: () => flyCard(card, "down", () => drop(q.id)),
    left: () => nav2(1), right: () => nav2(-1),
    dbl: () => demote(q.id),
  };
  swipeable(card, H);
}

function flyCard(el, dir, action) {
  if (!el) { action(); return; }
  const T = { up: "translateY(-130%)", down: "translateY(130%)", left: "translateX(-130%)", right: "translateX(130%)" };
  el.style.transition = "transform .24s ease,opacity .24s ease";
  el.style.transform = T[dir];
  el.style.opacity = "0";
  setTimeout(action, 240);
}

// --- 滑動引擎(照抄 cthulhu-note)---

function swipeable(el, { up, down, left, right, dbl }) {
  let sx, sy, active = false, lastTap = 0;
  const THRESH = 55, noLR = !left && !right;
  const s = (cx, cy) => { sx = cx; sy = cy; active = true; el.style.transition = "none"; };
  const m = (cx, cy) => {
    if (!active) return;
    const dx = cx - sx, dy = cy - sy, h = Math.abs(dx) > Math.abs(dy);
    let tx = 0, ty = 0;
    if (h && !noLR) tx = Math.sign(dx) * Math.min(Math.abs(dx), THRESH * 1.5);
    else if (!h) ty = Math.sign(dy) * Math.min(Math.abs(dy), THRESH * 1.5);
    el.style.transform = `translate(${tx}px,${ty}px) rotate(${tx * .025}deg)`;
    const ov = el.querySelector(".swind");
    if (ov) {
      const abs = Math.max(Math.abs(tx), Math.abs(ty));
      if (abs > 14) {
        ov.style.opacity = Math.min(abs / (THRESH * 1.5), .85);
        if (!h) { ov.textContent = dy < 0 ? "↑" : "↓"; ov.style.background = dy < 0 ? "rgba(111,227,225,.22)" : "rgba(255,95,122,.22)"; }
        else { ov.textContent = dx > 0 ? "←" : "→"; ov.style.background = "rgba(255,255,255,.06)"; }
      } else ov.style.opacity = 0;
    }
  };
  const e = (cx, cy) => {
    if (!active) return; active = false;
    const dx = cx - sx, dy = cy - sy, h = Math.abs(dx) > Math.abs(dy);
    el.style.transition = "transform .15s ease"; el.style.transform = "";
    const ov = el.querySelector(".swind"); if (ov) ov.style.opacity = 0;
    if (h && !noLR) { if (dx < -THRESH && left) { left(); return; } if (dx > THRESH && right) { right(); return; } }
    else if (!h) { if (dy < -THRESH && up) { up(); return; } if (dy > THRESH && down) { down(); return; } }
    if (dbl && Math.abs(dx) < 12 && Math.abs(dy) < 12) {
      const now = Date.now();
      if (now - lastTap < 320) { dbl(); lastTap = 0; } else lastTap = now;
    }
  };
  el.addEventListener("touchstart", ev => { const t = ev.touches[0]; s(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener("touchmove", ev => { const t = ev.touches[0]; m(t.clientX, t.clientY); if (ev.cancelable) ev.preventDefault(); }, { passive: false });
  el.addEventListener("touchend", ev => { const t = ev.changedTouches[0]; e(t.clientX, t.clientY); }, { passive: true });
  el.addEventListener("mousedown", ev => s(ev.clientX, ev.clientY));
  window.addEventListener("mousemove", ev => { if (ev.buttons === 1) m(ev.clientX, ev.clientY); });
  window.addEventListener("mouseup", ev => { if (active) e(ev.clientX, ev.clientY); });
}

// --- 承接定價 bottom sheet ---

function openRewardSheet(q) {
  const ov = $("#reward-overlay");
  $("#reward-ctx").textContent = q.text;
  const grid = $("#reward-grid");
  grid.innerHTML = REWARDS.map(g =>
    `<button data-g="${g}">${g} 金<small>${24 / g} 小時</small></button>`).join("");
  grid.querySelectorAll("button").forEach(b => b.onclick = () => {
    ov.classList.add("hidden");
    accept(q.id, +b.dataset.g);
    toast(`已承接:${b.dataset.g} 金 / ${24 / +b.dataset.g} 小時`, "good");
  });
  ov.classList.remove("hidden");
}

function renderShop() {
  ensureShop();
  $("#merchant-line").textContent = "「" + state.shop.line + "」";
  const st = $("#shop-stock"); st.innerHTML = "";
  for (const it of state.shop.stock) {
    const d = document.createElement("div");
    d.className = "shop-item" + (it.sold ? " sold" : "");
    d.innerHTML = `
      <span class="sname">${esc(it.name)}</span>
      <span class="sprice">${it.price} 金</span>
      <button ${it.sold || state.gold < it.price ? "disabled" : ""}>${it.sold ? "已售出" : "購買"}</button>`;
    if (!it.sold) d.querySelector("button").onclick = () => buy(it.id);
    st.appendChild(d);
  }
  $("#dungeon-count").textContent = `(${state.dungeon.length} 人)`;
  $("#dungeon-list").innerHTML = state.dungeon.length
    ? state.dungeon.map(p => `<span>${esc(p.name)}</span>`).join("")
    : `<span class="dim">空無一人。</span>`;
}

function renderSuccubi() {
  const home = $("#succubi-home");
  const detail = $("#succubus-detail");
  const chatV = $("#chat-view");

  // 對話模式優先
  if (chatWith) {
    const cs = state.succubi.find(x => x.id === chatWith);
    if (!cs) { // 對話對象消失(NTR 過期等)
      chatWith = null; chatSession = null;
      document.body.classList.remove("chat-mode");
    } else {
      home.classList.add("hidden");
      detail.classList.add("hidden");
      chatV.classList.remove("hidden");
      $("#chat-title").textContent = chatSession.type === "date"
        ? `${cs.name}・${chatSession.location}約會中`
        : `${cs.name}・聊天中(每 2 則 1 金)`;
      return;
    }
  }
  chatV.classList.add("hidden");

  if (detailId) {
    const s = state.succubi.find(x => x.id === detailId);
    if (!s) { detailId = null; } else {
      home.classList.add("hidden");
      detail.classList.remove("hidden");
      renderDetail(s, detail);
      return;
    }
  }
  home.classList.remove("hidden");
  detail.classList.add("hidden");

  const roster = $("#roster"); roster.innerHTML = "";
  for (const s of state.succubi) {
    const st = needStatus(s);
    const ns = nextStage(s);
    const barW = s.affection >= 0
      ? (ns ? Math.min(100, s.affection / ns[2] * 100) : 100)
      : Math.min(100, -s.affection * 10);
    const el = document.createElement("div");
    el.className = `scard r-${s.rarity}` + (s.ntr ? " ntr" : "");
    el.innerHTML = `
      <div class="thumb">${girlSVG("#241333", 2.5)}</div>
      <div class="sinfo">
        <div class="sname"><b>${esc(s.name)}</b><span class="rbadge">${s.rarity}</span>
          <span class="stage-chip">${s.ntr ? "被奪走" : stageLabel(s.stage)}</span></div>
        <div class="aff-bar"><div class="${s.affection < 0 ? "neg" : ""}" style="width:${barW}%"></div></div>
      </div>
      <div class="status-dot ${st}"></div>`;
    el.onclick = () => { detailId = s.id; dateChooser = false; renderAll(); };
    roster.appendChild(el);
  }
  if (!state.succubi.length) roster.innerHTML = `<div class="empty">一個魅魔都沒有。桌上只有那本召喚之書。</div>`;

  const hint = $("#summon-hint");
  const counts = $("#summon-counts");
  hint.textContent = state.gold < 0 ? "負債中不可召喚" : `地牢裡有 ${state.dungeon.length} 名祭品`;
  counts.innerHTML = "";
  for (let n = 1; n <= 6; n++) {
    const b = document.createElement("button");
    b.textContent = n;
    b.disabled = state.dungeon.length < n || state.gold < 0;
    b.title = `獻祭 ${n} 人`;
    b.onclick = () => summon(n);
    counts.appendChild(b);
  }
}

function renderDetail(s, root) {
  const asleep = isAsleep();
  const st = needStatus(s);
  const ns = nextStage(s);
  const today = dayNum();
  const datesLeft = s.datesToday?.day === today ? DATE_LIMIT - s.datesToday.count : DATE_LIMIT;

  let needLine;
  if (s.ntr) {
    needLine = `<div class="ntr-note">她被另一位召喚師奪走了。剩 ${s.ntr.deadlineDay - today} 天可贖回(${RANSOM[s.stage]} 金)</div>`;
  } else {
    const bits = [`每 ${CHAT_GAP[s.rarity]} 天至少聊 1 次`];
    if (DATE_GAP[s.rarity]) bits.push(`每 ${DATE_GAP[s.rarity]} 天至少約會 1 次`);
    const stTxt = { ok: "心情不錯", due: "今天想見你", danger: "快要離開了!" }[st];
    needLine = `<div class="aff-line dim small">${bits.join(" / ")} — ${stTxt}</div>`;
  }

  root.className = `r-${s.rarity}`;
  root.innerHTML = `
    <div class="panel">
      <button class="back-btn" id="detail-back">‹ 名冊</button>
      <div class="portrait">${girlSVG("#241333", 6)}</div>
      <div class="aff-line">
        <b>${esc(s.name)}</b> <span class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</span>
        ・${s.ntr ? "被奪走" : stageLabel(s.stage)}
      </div>
      <div class="traits">${s.personality.map(p => `<span>${p}</span>`).join("")}<span>${s.speech}</span>${s.dna.traits.map(t => `<span>${t}</span>`).join("")}</div>
      <div class="aff-line">情感 <b>${s.affection}</b>${ns && !s.ntr ? ` <span class="dim small">/ ${ns[2]} 升【${ns[1]}】</span>` : ""}</div>
      ${needLine}
      ${!s.portraitReady ? `<div class="aff-line dim small">尚未成形——今晚讓她織夢,明早見到她的臉(M3)</div>` : ""}
      <div class="detail-actions">
        ${s.ntr
          ? `<button class="gold" id="act-ransom">贖回 ${RANSOM[s.stage]} 金</button>`
          : `<button id="act-chat" ${asleep ? "disabled" : ""}>聊天(每 2 則 1 金)</button>
             <button class="cyan" id="act-date" ${asleep || datesLeft <= 0 ? "disabled" : ""}>約會 ${DATE_COST} 金(今日剩 ${datesLeft})</button>`}
      </div>
      ${dateChooser && !s.ntr ? `<div class="chooser" style="justify-content:center">${DATE_LOCS.map(l => `<button data-loc="${l}">${l}</button>`).join("")}</div>` : ""}
      ${asleep ? `<div class="aff-line dim small">(睡眠時段——她回夢境了)</div>` : ""}
    </div>`;

  root.querySelector("#detail-back").onclick = () => { detailId = null; dateChooser = false; renderAll(); };
  root.querySelector("#act-chat")?.addEventListener("click", () => enterChat(s.id));
  root.querySelector("#act-date")?.addEventListener("click", () => { dateChooser = !dateChooser; renderAll(); });
  root.querySelector("#act-ransom")?.addEventListener("click", () => ransom(s.id));
  root.querySelectorAll("[data-loc]").forEach(b => b.onclick = () => enterChat(s.id, "date", b.dataset.loc));
}

function renderKanban() {
  // 對話模式:看板娘換成正在對話的魅魔
  const s = (chatWith && state.succubi.find(x => x.id === chatWith)) || kanbanSuccubus();
  const book = $("#book");
  const girl = $("#kanban-girl");
  const zzz = $("#kanban-zzz");
  const asleep = isAsleep();
  zzz.classList.toggle("hidden", !asleep);

  if (s) {
    book.classList.add("hidden");
    girl.classList.remove("hidden");
    girl.className = `r-${s.rarity}`;
    girl.innerHTML = girlSVG("#241333", 9) + `<div class="kname">${esc(s.name)}</div>`;
    girl.onclick = () => kanbanSay(asleep ? pick(REACT.sleepClick) : pick(REACT.idle));
  } else {
    girl.classList.add("hidden");
    book.classList.remove("hidden");
    book.onclick = () => kanbanSay(asleep ? pick(REACT.sleepClick) : pick(TAUNTS));
  }
}

function renderSettings() {
  $("#set-player").value = state.settings.player || "";
  $("#set-sleep-start").value = state.settings.sleepStart;
  $("#set-sleep-end").value = state.settings.sleepEnd;
  $("#set-ollama").value = state.settings.ollamaUrl || "";
  $("#set-model").value = state.settings.model || "";
  $("#set-rating").value = state.settings.rating || "sfw";
  $("#set-ver").textContent = version ? "v" + version : "(尚未寫入)";

  const sel = $("#set-kanban");
  sel.innerHTML = `<option value="">最新召喚(自動)</option>` +
    state.succubi.map(s => `<option value="${s.id}" ${state.kanbanId === s.id ? "selected" : ""}>${esc(s.name)}(${s.rarity})</option>`).join("");

  $("#set-theme").innerHTML = THEMES.map(([k, label]) =>
    `<option value="${k}" ${(state.settings.theme || "aqua") === k ? "selected" : ""}>${label}</option>`).join("");

  $("#log-list").innerHTML = state.log.length
    ? state.log.map(l => `<div>${esc(l)}</div>`).join("")
    : "還沒有任何記錄。";
}

// ===== 分頁滑動 =====

const tabButtons = document.querySelectorAll("#tabs button");
function switchTab(i) {
  document.getElementById("track").style.transform = `translateX(-${i * 25}%)`;
  tabButtons.forEach((b, j) => b.classList.toggle("active", j === i));
  document.body.dataset.tab = i;
}
tabButtons.forEach(b => b.onclick = () => switchTab(+b.dataset.tab));
switchTab(0);

// ===== 事件綁定 =====

$("#quest-add").onclick = () => { addQuest($("#quest-input").value); $("#quest-input").value = ""; };
$("#quest-input").addEventListener("keydown", e => {
  if (e.key === "Enter") { addQuest(e.target.value); e.target.value = ""; }
});

$("#hud-need").onclick = () => switchTab(2);

// 委託卡片場景
$("#q-back").onclick = () => goExec();
$("#reward-cancel").onclick = () => $("#reward-overlay").classList.add("hidden");
$("#reward-overlay").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hidden"); });

$("#set-player").addEventListener("change", e => { state.settings.player = e.target.value.trim(); scheduleSave(); });
$("#set-sleep-start").addEventListener("change", e => { state.settings.sleepStart = e.target.value; scheduleSave(); renderAll(); });
$("#set-sleep-end").addEventListener("change", e => { state.settings.sleepEnd = e.target.value; scheduleSave(); renderAll(); });
$("#set-kanban").addEventListener("change", e => { state.kanbanId = e.target.value || null; scheduleSave(); renderAll(); });
$("#set-theme").addEventListener("change", e => { state.settings.theme = e.target.value; scheduleSave(); renderAll(); });

// 聊天室
$("#chat-back").onclick = () => exitChat();
$("#chat-send").onclick = () => sendChatMsg();
$("#chat-input").addEventListener("keydown", e => { if (e.key === "Enter") sendChatMsg(); });
$("#chat-log-btn").onclick = () => {
  const bl = $("#chat-backlog");
  const s = state.succubi.find(x => x.id === chatWith);
  if (!s) return;
  if (bl.classList.contains("hidden")) { renderBacklog(s); bl.classList.remove("hidden"); }
  else bl.classList.add("hidden");
};
$("#chat-backlog").onclick = () => $("#chat-backlog").classList.add("hidden");
$("#conn-retry").onclick = () => load();

// AI 設定
$("#set-ollama").addEventListener("change", e => { state.settings.ollamaUrl = e.target.value.trim() || "http://localhost:11434"; scheduleSave(); });
$("#set-model").addEventListener("change", e => { state.settings.model = e.target.value.trim(); scheduleSave(); });
$("#set-rating").addEventListener("change", e => { state.settings.rating = e.target.value; scheduleSave(); });
$("#btn-llm-test").onclick = async () => {
  const r = $("#llm-test-result");
  r.textContent = "測試中…";
  try {
    const j = await fetch(`/api/llm/tags?endpoint=${encodeURIComponent(state.settings.ollamaUrl)}`)
      .then(x => { if (!x.ok) throw 0; return x.json(); });
    const names = (j.models || []).map(m => m.name);
    $("#model-list").innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
    r.textContent = names.length ? `OK,${names.length} 個模型(模型欄可下拉選)` : "OK,但沒有已安裝的模型";
  } catch { r.textContent = "連線失敗——檢查端點與 Ollama 是否啟動"; }
};

$("#btn-export").onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `yorozuya-save-v${version}.json`;
  a.click();
};
$("#btn-import").onclick = () => $("#import-file").click();
$("#import-file").addEventListener("change", async e => {
  const f = e.target.files[0];
  if (!f) return;
  try {
    const j = JSON.parse(await f.text());
    if (typeof j.gold !== "number" || !Array.isArray(j.quests)) throw new Error("格式不對");
    state = j;
    const def = defaultState();
    for (const k of Object.keys(def)) state[k] ??= def[k];
    settleOffline(); settleDays();
    scheduleSave(); renderAll();
    toast("存檔已匯入", "good");
  } catch { toast("匯入失敗:不是有效的存檔", "bad"); }
  e.target.value = "";
});
$("#btn-reset").onclick = () => {
  if (!confirm("確定重置?金幣、委託與所有魅魔將全部消失。")) return;
  state = defaultState();
  state.lastSettledDay = null;
  detailId = null;
  scheduleSave();
  state.lastSettledDay = dayNum();
  ensureShop();
  renderAll();
};

// ===== Toast =====

function toast(msg, cls = "") {
  const d = document.createElement("div");
  d.className = "toast " + cls;
  d.textContent = msg;
  document.getElementById("toasts").appendChild(d);
  setTimeout(() => d.remove(), 3200);
}

// ===== 測試掛鉤(不影響遊戲)=====

window.DBG = {
  dayNum: () => dayNum(),
  state: () => state,
  isAsleep: () => isAsleep(),
};

// ===== 啟動 =====

if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

load();
