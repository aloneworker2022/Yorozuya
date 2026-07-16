// 魅魔萬事屋 遊戲核心
// M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔
// M1:商店/地牢/召喚 + 名冊 + 情感需求 + NTR + 睡眠時鐘 + 看板娘罐頭反應
// M2:Ollama 聊天/約會(galgame 式)+ PersonaBuilder 銜接口 + history 存檔

import { buildSystemPrompt, buildWatchPrompt, buildSacrificePrompt } from "./content/persona_builder.js";

// 世界觀文件(內容模組件,可自由編輯):開機載入一次,注入每次對話。
// 核心零解析——只把整份文字透傳給 PersonaBuilder。
let WORLD_LORE = "";
fetch("content/world.md").then(r => r.ok ? r.text() : "").then(t => { WORLD_LORE = t; }).catch(() => {});

// 其他召喚師池(內容模組件,可自由編輯):開機載入一次
let SUMMONERS = [];
fetch("content/summoners.json").then(r => r.ok ? r.json() : null).then(j => { SUMMONERS = (j && j.summoners) || []; }).catch(() => {});
function summonerById(id) { return SUMMONERS.find(x => x.id === id) || null; }

// ===== 常數 =====

const HOUR = 3600 * 1000;
// ===== 擴充系統(8 軸)=====
// 取得方式:①看板娘自帶(暫時,Phase 4)②獻祭掉落(永久,Phase 7)。
// 目前可用 /testword 後門調整以供測試。第 7 軸「取消召喚師」是一次性效果、非等級。
const EXPANSIONS = {
  exec:     "執行中格數",   // 執行中上限 = 1 + lv
  reward:   "完成金額",     // 完成 = randInt(1+lv, 3+lv)
  offering: "商店祭品",     // 每日進貨 = 2 + lv
  roster:   "名冊名額",     // 名額 = 1 + lv
  kanban:   "看板娘時長",   // 小時 = 1 + lv
  crest:    "淫紋機率",     // 分母 = max(3, 20 - lv)
  drop:     "獻祭掉落率",   // 影響獻祭掉落(Phase 7)
};
const GIFT_KEYS = Object.keys(EXPANSIONS);   // 天賦可能的擴充軸
function expLv(k) {
  let lv = (state.expansions && state.expansions[k]) || 0;
  const kg = kanbanSuccubus && kanbanSuccubus();   // 看板娘自帶擴充暫時加到玩家身上
  if (kg && kg.gift === k) lv += 1;
  return lv;
}
function execCap() { return 1 + expLv("exec"); }
function rosterCap() { return 1 + expLv("roster"); }
function crestDenom() { return Math.max(3, 20 - expLv("crest")); }
function kanbanHours() { return 1 + expLv("kanban"); }
const QUEST_HOURS = 24;          // 期限統一 24 小時
const DISCOVER_BONUS_CAP = 10;   // 每日前 N 次發現有 0~2 金獎勵

const CREST_CAP = 5;             // 淫紋最多囤 5 層
// 每次進對話隨機決定能聊幾個來回(玩家不知道她何時喊停,製造驚喜)
const CHAT_TURNS = [1, 4];      // 聊天 1~4 來回
const DATE_TURNS = [2, 5];      // 約會 2~5 來回(付了 5 金,多聊幾句)

// 淫紋觸發:看板娘在、醒著、沒滿層時,委託操作有機率喚起她想聊天的慾望
// 基礎機率 1/crestDenom(擴充可從 1/20 提升到 1/3);完成委託 ×2
function grantCrest(mult = 1) {
  if (!kanbanSuccubus() || isAsleep()) return;
  if ((state.chatCharges || 0) >= CREST_CAP) return;
  if (Math.random() >= mult / crestDenom()) return;
  state.chatCharges = (state.chatCharges || 0) + 1;
  toast("……淫紋在發燙。她想跟你說話。", "good");
}

// 完成報酬:randInt(1+lv, 3+lv),由「完成金額」擴充提升上下限
function rollReward() {
  const lv = expLv("reward");
  return randInt(1 + lv, 3 + lv);
}

const RARITIES = ["N", "R", "S", "SS", "SSR"];
const SUMMON_TABLE = { 1: [100], 2: [50, 50], 3: [50, 20, 30], 4: [40, 30, 20, 10], 5: [40, 30, 18, 10, 2], 6: [35, 25, 25, 10, 5] };
const MULT = { N: 1.0, R: 1.1, S: 1.2, SS: 1.35, SSR: 1.5 };
const CHAT_GAP = { N: 3, R: 2, S: 1, SS: 1, SSR: 1 };  // 每 X 天至少聊 1 次
const DATE_GAP = { SS: 5, SSR: 3 };                     // 每 X 天至少約 1 次
const STAGES = [["stranger", "陌生", 0], ["friend", "朋友", 30], ["girlfriend", "女友", 90], ["wife", "妻子", 180]];
const RANSOM = { friend: 30, girlfriend: 90, wife: 180 };
const DATE_COST = 5, DATE_LIMIT = 2, NTR_WINDOW = 7; // 聊天計費:每 2 則玩家訊息 1 金
// 約會地點池(30 個情境;每次隨機抽 5 個給玩家選)
const DATE_SPOTS = [
  ["夜景展望台", "能俯瞰整座城市燈火的展望台,夜風微涼"],
  ["咖啡廳", "巷弄裡的安靜咖啡廳,咖啡香氣與輕音樂"],
  ["遊樂園", "熱鬧的遊樂園,摩天輪、雲霄飛車與棉花糖"],
  ["海邊", "傍晚的海灘,浪聲、海風與逐漸下沉的夕陽"],
  ["圖書館", "安靜的圖書館,只能咬耳朵小聲說話的緊張感"],
  ["水族館", "幽藍的水族館,巨大水槽前魚群緩緩游過"],
  ["動物園", "假日的動物園,看貓熊要排好長的隊"],
  ["電影院", "飄著爆米花香的電影院,剛散場還在回味劇情"],
  ["夏日祭典", "神社的夏日祭典,浴衣、撈金魚與蘋果糖"],
  ["煙火大會", "河畔的煙火大會,人潮與夜空中綻放的煙火"],
  ["溫泉街", "冒著白煙的溫泉街,散步吃溫泉蛋"],
  ["貓咖啡廳", "被貓咪包圍的貓咖啡廳,腿上趴了一隻不肯走"],
  ["電子遊樂場", "吵鬧的電子遊樂場,夾娃娃機與音樂遊戲對戰"],
  ["保齡球館", "保齡球館,說好輸的人要接受懲罰遊戲"],
  ["卡拉OK", "包廂卡拉OK,搶麥克風合唱到破音"],
  ["深夜便利商店", "深夜的便利商店,買關東煮當宵夜的小小約會"],
  ["屋頂天台", "大樓屋頂天台,吹著風喝罐裝飲料看星星"],
  ["公園野餐", "晴天的公園草地野餐,鋪墊子分享便當"],
  ["植物園", "溫室植物園,熱帶花草與玻璃屋頂灑下的光"],
  ["美術館", "安靜的美術館,在同一幅畫前並肩駐足"],
  ["商店街", "熱鬧的商店街,邊走邊分食剛炸好的可樂餅"],
  ["服飾店", "逛服飾店,互相挑衣服試穿打分數"],
  ["甜點吃到飽", "甜點吃到飽,蛋糕塔與無限續杯的紅茶"],
  ["深夜拉麵店", "深夜拉麵店,並肩坐吧台呼嚕嚕吃麵"],
  ["居酒屋", "熱鬧的居酒屋,串燒與微醺的氣氛"],
  ["夜市", "台式夜市,牽著手擠過人潮掃街吃小吃"],
  ["河堤散步", "黃昏的河堤,腳踏車鈴聲與拉得長長的影子"],
  ["星空郊外", "郊外的觀星點,滿天星斗與清晰可見的銀河"],
  ["滑雪場", "滑雪場,兩個人摔進雪堆裡笑成一團"],
  ["泳池樂園", "夏天的泳池樂園,滑水道與融化太快的冰淇淋"],
];
function pickN(arr, n) {
  const a = [...arr], out = [];
  while (out.length < n && a.length) out.push(a.splice(Math.floor(Math.random() * a.length), 1)[0]);
  return out;
}
let dateChoices = [];
const THEMES = [["aqua", "霓虹水藍"], ["pink", "品紅魔宴"], ["green", "駭客終端"], ["amber", "琥珀映像管"], ["ice", "冰藍幽域"], ["day", "日光白晝(亮)"], ["sakura", "櫻花(亮)"]];
const LIGHT_THEMES = new Set(["day", "sakura"]);

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

// 背景故事:魅魔不是魔界來的,是被從現實世界召喚來的女子——
// 召喚當下由核心擲骰生成並寫入存檔,人設永遠一致,AI 只負責「演」它
const JOB_POOL = [
  ["女高中生", "每天搭電車通學、和同學混社團,考試前才熬夜抱佛腳"],
  ["大學生", "住便宜小套房,靠打工和獎學金過活,報告永遠拖到最後一天"],
  ["便利商店大夜班店員", "習慣了凌晨四點的城市,收銀速度是店裡最快的"],
  ["護理師", "在醫院輪三班,腳很痠,但被病人道謝時會偷偷開心"],
  ["咖啡店店員", "拉花有兩下子,記得每個熟客的口味"],
  ["上班族 OL", "每天擠地鐵、開不完的會,錢包裡塞滿超商集點貼紙"],
  ["接案插畫家", "日夜顛倒,交稿前會變成另一種生物"],
  ["偶像練習生", "練舞到深夜,夢想站上大舞台,飲食控制得很辛苦"],
  ["圖書館員", "喜歡書頁的味道,對吵鬧的人會用眼神殺人"],
  ["電競隊青訓選手", "手速驚人、作息毀滅,講話夾雜遊戲梗"],
  ["麵包店學徒", "凌晨三點起床揉麵,身上總有一股奶油香"],
  ["家裡蹲網路寫手", "足不出戶,靠外送維生,深夜論戰從沒輸過"],
];
const ATTITUDE_POOL = [
  "對突然被召喚到這裡感到莫名其妙,滿腦子想著原本的生活",
  "嘴上抱怨自己被綁架了,心裡卻對這個奇怪的地方有一點點好奇",
  "非常不情願,認為這是非法拘禁,三不五時揚言要告你",
  "半信半疑,懷疑這是整人節目,或只是一場還沒醒的夢",
  "意外地看得開,覺得反正原本的日子也過膩了",
];
// 每日作息:依職業給早/午/下午/晚四時段的生活(召喚來能聊上個時段做了什麼)
const SCHEDULE_BY_JOB = {
  "女高中生": ["在教室上課、偷傳紙條", "和同學擠在頂樓吃便當", "社團活動揮汗", "補習班或回家寫作業"],
  "大學生": ["睡到快遲到才衝去上課", "學餐隨便扒兩口", "泡圖書館趕永遠寫不完的報告", "打工或系上聚餐"],
  "便利商店大夜班店員": ["剛下大夜班回家補眠", "睡得正熟", "傍晚才起床發呆", "準備上工、清點貨架"],
  "護理師": ["交接查房、忙得團團轉", "匆忙扒兩口冷掉的飯", "換藥打針跑不停", "下班累癱或接著上夜班"],
  "咖啡店店員": ["開店磨豆、預熱機器", "出餐尖峰手忙腳亂", "顧店、偷練拉花", "打烊清潔擦桌子"],
  "上班族 OL": ["擠地鐵進辦公室", "和同事吃午餐配八卦", "開一場又一場的會", "加班或下班小酌"],
  "接案插畫家": ["昨晚爆肝、現在補眠中", "起床邊吃邊改稿", "畫圖畫到忘記時間", "進入交稿前的衝刺地獄"],
  "偶像練習生": ["晨間發聲練習", "控制熱量的清淡午餐", "練舞練到腿軟", "上唱歌課、自主加練"],
  "圖書館員": ["上架整理新書", "在員工休息室安靜吃飯", "幫讀者找書、蓋章", "閉館前盤點巡場"],
  "電競隊青訓選手": ["補眠中(昨晚排位到天亮)", "起床邊吃邊打幾把", "團隊訓練賽", "直播或複盤到深夜"],
  "麵包店學徒": ["凌晨就在揉麵、顧烤箱", "收拾忙碌的早晨", "回去補個眠", "備料、發酵準備明天"],
  "家裡蹲網路寫手": ["還在睡", "醒來配泡麵當早午餐", "追劇、逛論壇筆戰", "開始碼字戰到深夜"],
};
const SCHEDULE_SLOTS = ["morning", "noon", "afternoon", "evening"];
const SLOT_LABEL = { morning: "早上", noon: "中午", afternoon: "下午", evening: "晚上", night: "深夜" };
function timeSlot(h = new Date().getHours()) {
  if (h < 6) return "night";
  if (h < 11) return "morning";
  if (h < 14) return "noon";
  if (h < 18) return "afternoon";
  if (h < 23) return "evening";
  return "night";
}
function makeSchedule(job) {
  const acts = SCHEDULE_BY_JOB[job] || ["過著自己的生活", "吃頓飯歇口氣", "忙自己的事", "度過一個平凡的夜晚"];
  const sch = {};
  SCHEDULE_SLOTS.forEach((k, i) => sch[k] = acts[i]);
  sch.night = "回到夢境織夢";
  return sch;
}

function makeBackstory() {
  const [job, life] = pick(JOB_POOL);
  return {
    job,
    backstory: `她原本是現實世界的${job}——${life}。某天毫無預警地被召喚到魅魔萬事屋,成了所謂的「魅魔」。${pick(ATTITUDE_POOL)}。`,
    schedule: makeSchedule(job),
  };
}
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
    quests: [],   // {id, text, lv:0|1|2, startedAt?, deadline?}
    discover: null, // {day, count} 每日發現獎勵計數
    chatCharges: 0, // 淫紋層數(聊天入場券,委託操作隨機觸發,上限 5)
    expansions: {}, // 擴充等級(8 軸,見 EXPANSIONS);名額/格數等由此推導
    dismiss: null,  // {day, price} 今日遣散費
    succubi: [],  // 見 summon()
    dungeon: [],  // [{name}]
    shop: null,   // {day, stock:[{id,name,price,sold}], line}
    kanbanId: null,
    kanbanUntil: null,  // 看板娘召喚到期時間戳(限時)
    lastKanbanId: null, // 最後一位看板娘(過期後背景顯示她的休息剪影)
    lastSettledDay: null,
    log: [],
    settings: {
      player: "", sleepStart: "01:00", sleepEnd: "06:00", theme: "aqua",
      ollamaUrl: "http://localhost:11434", model: "", rating: "sfw",
      cardColors: null,   // null = 主題預設;{exec|found|acc|vn: {color,opacity}}
      tabOpacity: 1,
      bgImages: [], bgIndex: 0, bgInterval: 5,
    },
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
  // 擴充制移轉:名額改由 expansions.roster 推導(名額 = 1 + roster)。
  // 舊存檔的 slots / 已持有隻數換算成等值 roster 等級,進度不損失。
  state.expansions ??= {};
  const legacySlots = Math.max(state.slots ?? 2, state.succubi.length, 1);
  state.expansions.roster = Math.max(state.expansions.roster || 0, legacySlots - 1);
  delete state.slots;
  // 背景故事移轉:舊魅魔補發人生
  for (const s of state.succubi) {
    if (!s.backstory) Object.assign(s, makeBackstory());
    else if (!s.schedule) s.schedule = makeSchedule(s.job);   // 有故事沒作息 → 補作息
  }
  // 看板娘限時化移轉:舊的永久看板娘寬限一個時段,到期後改付費召喚
  if (state.kanbanId && !state.kanbanUntil) state.kanbanUntil = Date.now() + kanbanHours() * HOUR;
  // 召喚師系統移轉:舊魅魔補發抽取間隔
  for (const s of state.succubi) {
    if (s.summoner === undefined) s.summoner = null;
    if (s.nextDraw == null) { s.drawIvlH = randInt(2, 5); s.nextDraw = Date.now() + s.drawIvlH * HOUR; }
    if (!s.gift) s.gift = pick(GIFT_KEYS);
  }
  showConnOverlay(false);
  document.getElementById("set-srv").textContent = offline ? "離線(使用本地快取)" : "OK";
  settleOffline();
  settleDays();
  ensureShop();
  renderAll();
  applyBg();
  startBgRotation();
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

// ---- 前端版本偵測:git pull 後手機回前景自動載入新版 ----
// 用 app.js 的 ETag/Last-Modified 當指紋,檔案一變就重整(對話中不打斷)

let bootTag = null;
async function assetTag() {
  try {
    const r = await fetch("app.js", { method: "HEAD", cache: "no-store" });
    return r.headers.get("etag") || r.headers.get("last-modified") || "";
  } catch { return null; }
}
assetTag().then(t => { bootTag = t; });

// 切回前景:對時結算 + 和伺服器對版本(避免背景太久資料過期)
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !state) return;
  const tag = await assetTag();
  if (tag && bootTag && tag !== bootTag && !chatSession && !dirty) {
    toast("偵測到新版本,更新中…", "good");
    setTimeout(() => location.reload(), 600);
    return;
  }
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
// 手機切走/關閉 PWA 時 beforeunload 常不觸發,pagehide 與隱藏時也強制沖存
window.addEventListener("pagehide", () => { if (dirty) saveNow(true); });
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && dirty) saveNow(true);
});

function log(msg) {
  state.log.unshift(`[${new Date().toLocaleString("zh-TW", { hour12: false })}] ${msg}`);
  state.log = state.log.slice(0, 50);
}

// ===== 委託 =====

function execQuests() { return state.quests.filter(q => q.lv === 2); }

function addQuest(text) {
  text = text.trim();
  if (!text) return;
  state.quests.push({ id: uid(), text, lv: 0 });
  // 發現獎勵:每日前 N 次 +0~2 金
  const today = dayNum();
  if (state.discover?.day !== today) state.discover = { day: today, count: 0 };
  if (state.discover.count < DISCOVER_BONUS_CAP) {
    state.discover.count++;
    const g = randInt(0, 2);
    if (g > 0) {
      state.gold += g;
      log(`發現「${text}」 +${g} 金`);
      toast(`發現委託!+${g} 金`, "good");
    } else toast("已加入發現池", "");
  } else toast("已加入發現池", "");
  grantCrest(1);
  scheduleSave(); renderAll();
}

function accept(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 1;
  grantCrest(1);
  scheduleSave(); renderAll();
}

function start(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q || execQuests().length >= execCap()) return;
  q.lv = 2;
  q.startedAt = Date.now();
  q.deadline = q.startedAt + QUEST_HOURS * HOUR;
  log(`開始執行「${q.text}」(期限 ${QUEST_HOURS}h)`);
  grantCrest(1);
  scheduleSave(); renderAll();
}

function complete(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  const g = rollReward();
  state.gold += g;
  state.quests = state.quests.filter(x => x.id !== id);
  log(`完成「${q.text}」 +${g} 金`);
  toast(g >= 19 ? `大豐收!委託完成 +${g} 金!!` : `委託完成!+${g} 金`, "good");
  kanbanReact("complete");
  grantCrest(2);
  scheduleSave(); renderAll();
}

function failQuest(q, silent = false) {
  const pen = randInt(1, 6);
  state.gold -= pen;
  state.quests = state.quests.filter(x => x.id !== q.id);
  log(`「${q.text}」超時,違約金 -${pen} 金`);
  if (!silent) { toast(`委託超時!違約金 -${pen} 金`, "bad"); kanbanReact("fail"); }
}

function drop(id) {
  const q = state.quests.find(x => x.id === id);
  if (!q) return;
  if (q.lv === 1) {   // 承接了又反悔:信用受損
    const pen = randInt(1, 3);
    state.gold -= pen;
    log(`推掉已承接的「${q.text}」 -${pen} 金`);
    toast(`推掉承接的委託,信用受損 -${pen} 金`, "bad");
  }
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
  const before = state.gold;
  for (const q of expired) failQuest(q, true);
  toast(`離線結算:${expired.length} 件委託超時,違約金 -${before - state.gold} 金`, "bad");
  scheduleSave();
}

// ===== 商店與地牢 =====

function ensureShop() {
  const today = dayNum();
  if (state.shop && state.shop.day === today) return;
  const n = 2 + expLv("offering");   // 每日進貨數 = 2 + 「商店祭品」擴充
  state.shop = {
    day: today,
    stock: Array.from({ length: n }, () => ({ id: uid(), name: pick(SACRIFICE_POOL), price: randInt(5, 30), sold: false })),
    line: pick(MERCHANT_LINES),
  };
  scheduleSave();
}

// 今日獻祭費:每日重擲 1~10 金(獻祭魅魔給地獄惡魔)
function dismissPriceToday() {
  const today = dayNum();
  if (state.dismiss?.day !== today) {
    state.dismiss = { day: today, price: randInt(1, 10) };
    scheduleSave();
  }
  return state.dismiss.price;
}

// 獻祭掉落率:依被獻祭魅魔的階段(擴充可降分母提升機率)
const SAC_DROP_DENOM = { stranger: 40, friend: 20, girlfriend: 10, wife: 3 };
function sacrificeDropChance(stage) {
  const base = SAC_DROP_DENOM[stage] || 40;
  const denom = Math.max(1, base - expLv("drop") * 5);   // 每級「獻祭掉落率」降 5
  return 1 / denom;
}

// 魅魔獻祭:VN 描述(讀 testword 腳本 + AI)→ 移除她 + 機率掉永久天賦擴充
async function sacrificeSuccubus(id) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || s.ntr) return;
  const price = dismissPriceToday();
  if (state.gold < price) { toast(`今日獻祭費 ${price} 金,你付不起`, "bad"); return; }
  if (!confirm(`獻祭 ${s.name}?\n費用 ${price} 金。她將被獻給地獄惡魔,永遠消失。`)) return;
  state.gold -= price;

  // 進入獻祭 VN
  sacrificeWith = id;
  document.body.classList.add("chat-mode");
  detailId = null;
  renderAll();
  vnShow("", `—— 獻祭儀式:${s.name} ——`, "sys");
  setSacBtns(false);
  vnTyping(true);

  let script = { method: null, body: null };
  try { script = await fetch("/api/scripts/random?category=sacrifice_succubus").then(r => r.json()); } catch { }
  const ctx = {
    world: WORLD_LORE, content_rating: state.settings.rating || "sfw",
    character: { name: s.name, personality: s.personality, backstory: s.backstory },
    method: script.method, method_desc: script.body,
  };
  const msgs = [
    { role: "system", content: buildSacrificePrompt(ctx) },
    { role: "user", content: "描述這場獻祭儀式的過程,3~5 句,以旁白第三人稱。" },
  ];
  try {
    await llmJobRun(msgs, acc => vnShow(s.name, acc, "ai"),
      `祭壇的火光映著 ${s.name} 蒼白的臉,她掙扎著,喉間發出無聲的哀鳴……儀式的紋路一寸寸亮起,將她的存在抽離這個世界。`);
    vnDone();
  } catch (e) {
    if (e.name === "AbortError") { sacrificeWith = null; document.body.classList.remove("chat-mode"); renderAll(); return; }
    vnShow("", "(儀式的細節模糊了……)", "sys");
  }

  // 結算:移除 + 掉落
  const dropped = Math.random() < sacrificeDropChance(s.stage);
  let dropMsg = "";
  if (dropped) {
    state.expansions ??= {};
    const inc = s.stage === "wife" ? 2 : 1;   // 妻子最豐厚
    state.expansions[s.gift] = (state.expansions[s.gift] || 0) + inc;
    dropMsg = `\n\n✦ 你永久獲得了她的天賦:${EXPANSIONS[s.gift]} +${inc}!`;
  }
  state.succubi = state.succubi.filter(x => x.id !== id);
  if (state.kanbanId === id) { state.kanbanId = null; state.kanbanUntil = null; }
  if (state.lastKanbanId === id) state.lastKanbanId = null;
  log(`獻祭了 ${s.name}(-${price} 金)${dropped ? `,獲得 ${EXPANSIONS[s.gift]} 擴充` : ""}`);
  sacResult = `${s.name} 化作了獻祭的光。${dropMsg}`;
  setSacBtns(true);
  scheduleSave();
}

function dismiss(id) { return sacrificeSuccubus(id); }   // 相容舊呼叫

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
  if (state.succubi.length >= rosterCap()) { toast(`名冊名額已滿(${rosterCap()} 格)——靠擴充增加名額`, "bad"); return; }
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
    summoner: null,                                   // 被別的召喚師纏上時 = {id, affection, sinceDay}
    drawIvlH: randInt(2, 5),                           // 隱藏:抽召喚師的間隔(小時)
    nextDraw: Date.now() + randInt(2, 5) * HOUR,       // 下次抽取時間戳
    gift: pick(GIFT_KEYS),                             // 天賦擴充(看板娘時暫加、獻祭時有機率永久)
    ...makeBackstory(),   // job + backstory:她被召喚前的現實人生
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
        <p class="small dim">她原本是……${esc(s.job || "?")}</p>
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

function enterChat(id, type = "chat", location = null, skipEncounter = false) {
  const s = state.succubi.find(x => x.id === id);
  if (!s) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  if (s.ntr) { toast("她不在你身邊……", "bad"); return; }
  const today = dayNum();
  if (type === "date") {
    if (state.gold < 0) { toast("負債中,先去做委託還債吧", "bad"); return; }
    if (state.gold < DATE_COST) { toast("金幣不夠", "bad"); return; }
    if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
    if (s.datesToday.count >= DATE_LIMIT) { toast("今天約會夠多了,她需要休息", "bad"); return; }
    // 被纏上時 1/5 撞見對方 → 約會失敗變觀戰(不扣費、不算今日約會);搶回後直接成立
    if (!skipEncounter && s.summoner && Math.random() < ENCOUNTER_CHANCE) { enterWatch(s, "date", location); return; }
    state.gold -= DATE_COST;
    s.datesToday.count++;
    s.lastDateDay = today;
    s.lastChatDay = today;
    log(`與 ${s.name} 去${location}約會 -${DATE_COST} 金`);
  } else {
    // 聊天不花金幣,吃 1 層淫紋(委託操作隨機觸發)
    if ((state.chatCharges || 0) < 1) { toast("需要淫紋——去做委託,她就會想找你", "bad"); return; }
    state.chatCharges--;
    s.lastChatDay = today;
  }
  chatWith = id;
  const spot = DATE_SPOTS.find(x => x[0] === location);
  const turnCap = randInt(...(type === "date" ? DATE_TURNS : CHAT_TURNS));
  chatSession = { type, location, locationDesc: spot ? spot[1] : null, playerMsgs: 0, turnCap, gotReply: false, busy: false };
  dateChooser = false;
  document.body.classList.add("chat-mode");
  // 場景邊界標記:LLM 上下文只取此標記之後(本場景),話題不跨場景
  s.history ??= [];
  s.history.push({
    role: "sys",
    content: type === "date" ? `兩人抵達「${location}」,約會開始` : "日常閒聊",
    t: Date.now(),
  });
  // 重置輸入狀態(修復:上一場達回合上限鎖住的輸入框會殘留到下一場)
  const inputEl = document.getElementById("chat-input");
  if (inputEl) { inputEl.disabled = false; inputEl.placeholder = "說點什麼…(Enter 送出)"; inputEl.value = ""; }
  const sendBtn = document.getElementById("chat-send");
  if (sendBtn) sendBtn.disabled = false;
  setChatWaiting(false);
  scheduleSave(); renderAll();
  renderChatLog(s);
  if (type === "date") vnShow("", `—— ${location}・約會開始 ——`, "sys");
  inputEl?.focus();
  sceneOpener(s);   // 她先開口:約會描述場景心情 / 聊天打招呼
}

// 送出後隱藏輸入列,等她回完才出現(避免連發沒人回)
function setChatWaiting(b) {
  const row = document.getElementById("chat-input-row");
  if (row) row.style.visibility = b ? "hidden" : "";
}

// 進場自動開場白:不佔玩家回合、不寫入玩家訊息
async function sceneOpener(s) {
  if (!chatSession) return;
  chatSession.busy = true;
  setChatWaiting(true);
  vnTyping(true);
  const inst = chatSession.type === "date"
    ? `(旁白:你們剛抵達「${chatSession.location}」——${chatSession.locationDesc || ""}。請用一兩句話開場:描述你眼前看到的場景和此刻的真實感受,依你的個性可以期待興奮、也可以嫌棄抱怨。不要延續之前任何話題。)`
    : "(旁白:他來找你說話了。請依你的個性與你們的關係,自然地打招呼開場,可以主動拋出一個新話題或聊聊你原本生活的事。不要延續之前任何話題。)";
  try {
    const reply = await llmReply(s, acc => vnShow(s.name, acc, "ai"), inst);
    s.history.push({ role: "assistant", content: reply, t: Date.now() });
    s.history = s.history.slice(-200);
    vnDone();
    dirty = true;
    saveNow();
  } catch (e) {
    if (e.name !== "AbortError") {
      vnShow("", chatSession?.type === "date"
        ? `—— ${chatSession.location}・約會開始 ——`
        : `(她看著你,等你開口)`, "sys");
    }
  }
  if (chatSession && !chatSession.ended) {
    chatSession.busy = false;
    setChatWaiting(false);
    document.getElementById("chat-input")?.focus();
  }
}

function exitChat() {
  const s = state.succubi.find(x => x.id === chatWith);
  if (s && chatSession) {
    if (chatSession.type === "date") {
      const d = applyAffection(s, randInt(1, 5));
      s.history.push({ role: "sys", content: `「${chatSession.location}」的約會結束了,兩人回到日常`, t: Date.now() });
      log(`與 ${s.name} 的${chatSession.location}約會結束,情感 +${d}`);
      toast(`約會結束,情感 +${d}`, "good");
    } else if (chatSession.gotReply) {
      const d = applyAffection(s, randInt(-1, 2));
      s.history.push({ role: "sys", content: "這次閒聊告一段落", t: Date.now() });
      log(`與 ${s.name} 聊了一會,情感 ${d >= 0 ? "+" : ""}${d}`);
      toast(`聊天結束,情感 ${d >= 0 ? "+" : ""}${d}`, d >= 0 ? "good" : "bad");
    }
  }
  chatAbort?.abort();
  chatWith = null; chatSession = null;
  document.body.classList.remove("chat-mode");
  scheduleSave(); renderAll();
}

// ===== 觀戰模式:看她與其他召喚師的互動,伺機搶回 =====

let watchWith = null;     // 觀戰中的魅魔 id
let watchSession = null;  // {type:'kanban'|'date', location, turnCap, presses, busy, ended}
let sacrificeWith = null; // 獻祭儀式中的魅魔 id
let sacResult = "";       // 獻祭結果文字

function setSacBtns(enabled) {
  const d = document.getElementById("sac-done");
  if (d) d.disabled = !enabled;
  if (enabled && sacResult) toast(sacResult.includes("✦") ? "✦ 獲得永久擴充!" : "獻祭完成", sacResult.includes("✦") ? "good" : "");
}
function exitSacrifice() {
  chatAbort?.abort();
  sacrificeWith = null; sacResult = "";
  document.body.classList.remove("chat-mode");
  renderAll();
}

const SUMMONER_STAGES = [["friend", 30], ["girlfriend", 90], ["wife", 180]];

function enterWatch(s, type, location = null) {
  watchWith = s.id;
  const releaseChance = type === "date" ? 1 / 10 : 1 / 20;
  watchSession = { type, location, turnCap: randInt(1, 4), presses: 0, releaseChance, busy: false, ended: false };
  document.body.classList.add("chat-mode");
  const su = summonerById(s.summoner?.id);
  toast(`${su ? su.name : "另一位召喚師"} 搶先一步……`, "bad");
  scheduleSave(); renderAll();
  const opener = type === "date"
    ? `你想約 ${s.name},卻撞見她正被 ${su?.name || "另一個男人"} 拉著約會……`
    : `你召喚 ${s.name},她卻出現在 ${su?.name || "另一個男人"} 身邊……`;
  vnShow("", `—— ${opener} ——`, "sys");
  watchNext();   // 自動放第一句
}

async function watchNext() {
  const s = state.succubi.find(x => x.id === watchWith);
  if (!s || !watchSession || watchSession.busy || watchSession.ended) return;
  const su = summonerById(s.summoner?.id);
  if (!su) { exitWatch(); return; }
  watchSession.busy = true;
  setWatchBtns(false);
  vnTyping(true);

  const ctx = {
    world: WORLD_LORE,
    content_rating: state.settings.rating || "sfw",
    character: { name: s.name, personality: s.personality, backstory: s.backstory },
    summoner: su,
    scene: { type: watchSession.type, location: watchSession.location },
  };
  const msgs = [
    { role: "system", content: buildWatchPrompt(ctx) },
    { role: "user", content: "生成他們接下來的一來一往,嚴格照「他:…／她:…」兩行輸出。" },
  ];
  try {
    const raw = await llmJobRun(msgs, acc => vnShowWatch(su, s, acc), "他:哼,別扭什麼,乖一點嘛。\n她:……別碰我。");
    vnShowWatch(su, s, raw, true);
    vnDone();
  } catch (e) {
    if (e.name === "AbortError") return;
    vnShow("", "(畫面一陣模糊……再按一次下一句)", "sys");
  }
  watchSession.busy = false;
  watchSession.presses++;

  // 約會觀戰:對方好感 +0~2,可能養成妻子(永久失去)
  if (watchSession.type === "date") {
    const d = randInt(0, 2);
    s.summoner.affection += d;
    let ns = SUMMONER_STAGES.find(([, th]) => s.summoner.affection >= th && th === 180);
    if (s.summoner.affection >= 180) {
      log(`${s.name} 被 ${su.name} 娶走了,永遠離開了萬事屋。`);
      toast(`${s.name} 成了 ${su.name} 的妻子,永遠消失了……`, "bad");
      state.succubi = state.succubi.filter(x => x.id !== s.id);
      if (state.kanbanId === s.id) state.kanbanId = null;
      exitWatch(true);
      return;
    }
  }

  // 搶回判定
  if (Math.random() < watchSession.releaseChance) {
    rescueFromWatch(s);
    return;
  }
  // 觀戰次數用盡:沒搶回,她繼續留在對方身邊
  if (watchSession.presses >= watchSession.turnCap) {
    watchSession.ended = true;
    setWatchBtns(false);
    vnShow("", "(你只能眼睜睜看著……這次沒能把她拉回來)", "sys");
    setTimeout(() => { if (watchSession?.ended) exitWatch(); }, 1800);
    return;
  }
  setWatchBtns(true);
  scheduleSave();
}

// 搶回成功:結束觀戰,原本的動作(召喚看板娘/約會)接著成立
function rescueFromWatch(s) {
  const type = watchSession.type, location = watchSession.location;
  watchSession.ended = true;
  chatAbort?.abort();
  vnShow("", `你排開那個男人,把 ${s.name} 拉了回來!`, "sys");
  toast(`成功搶回 ${s.name}!`, "good");
  setTimeout(() => {
    watchWith = null; watchSession = null;
    document.body.classList.remove("chat-mode");
    if (type === "kanban") summonKanban(s.id, true);        // 召喚看板娘成立(不再擲撞見)
    else enterChat(s.id, "date", location, true);           // 約會成立(不再擲撞見)
  }, 1200);
  scheduleSave();
}

function exitWatch(gone = false) {
  chatAbort?.abort();
  watchWith = null; watchSession = null;
  document.body.classList.remove("chat-mode");
  if (gone) detailId = null;
  scheduleSave(); renderAll();
}

// 觀戰 VN:解析「他:…／她:…」,分兩行顯示;解析失敗則整段當旁白
function vnShowWatch(su, s, raw, done = false) {
  const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
  let him = "", her = "";
  for (const l of lines) {
    const m = l.replace(/^[「『]/, "").match(/^(.+?)[::](.*)$/);
    if (!m) { if (!him) him = l; continue; }
    const who = m[1], txt = m[2].trim();
    if (who.includes("她") || who.includes(s.name)) her = txt;
    else him = txt;
  }
  const box = $("#vn-text");
  if (her) {
    box.innerHTML = `<span class="w-him">${esc(su.name)}:${esc(him)}</span><br><span class="w-her">${esc(s.name)}:${esc(her)}</span>`;
  } else {
    box.textContent = raw;
  }
  $("#vn-name").textContent = `${su.emoji || "👤"} ${su.name} ／ ${s.name}`;
  $("#vn-name").style.color = "var(--red)";
}

function setWatchBtns(enabled) {
  const nx = document.getElementById("watch-next");
  if (nx) nx.disabled = !enabled;
}

function buildCtx(s) {
  const slot = timeSlot();
  const sch = s.schedule || {};
  return {
    character: {
      name: s.name, rarity: s.rarity, personality: s.personality,
      speech_style: s.speech, appearance_dna: s.dna, backstory: s.backstory || "",
      schedule: sch,
      current_activity: sch[slot] || null,   // 這個時段她原本的生活在做什麼
    },
    relationship: {
      stage: s.stage, affection: s.affection,
      days_since_summon: Math.floor((Date.now() - s.summonedAt) / 86400000),
    },
    scene: {
      type: chatSession.type, location: chatSession.location,
      scene_prompt: chatSession.locationDesc || null,
      transition: [...(s.history || [])].reverse().find(m => m.role === "sys")?.content || null,
      time_of_day: slot,
      time_label: SLOT_LABEL[slot],
    },
    content_rating: state.settings.rating || "sfw",
    player: { name: state.settings.player || "主人" },
    world: WORLD_LORE,
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

// 通用 LLM job 執行:RP5 代跑 Ollama、手機輪詢(切 app/瞬斷不中斷)
async function llmJobRun(messages, onToken, cannedLine) {
  if (!state.settings.model) {                     // 無模型 → 罐頭逐字
    await new Promise(r => setTimeout(r, 600));
    const line = cannedLine || "……";
    for (let i = 1; i <= line.length; i++) {
      if (chatAbort?.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      onToken(line.slice(0, i));
      await new Promise(r => setTimeout(r, 32));
    }
    return line;
  }
  chatAbort = new AbortController();
  const startRes = await fetch("/api/llm/chat_job", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ endpoint: state.settings.ollamaUrl, model: state.settings.model, messages, options: { temperature: 0.9 } }),
    signal: chatAbort.signal,
  });
  if (!startRes.ok) throw new Error("連不上遊戲伺服器");
  const { job_id } = await startRes.json();
  const t0 = Date.now();
  let acc = "", fails = 0;
  while (true) {
    if (chatAbort.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
    await new Promise(r => setTimeout(r, 400));
    if (document.hidden) continue;
    if (Date.now() - t0 > 300000) throw new Error("等太久了(逾時)");
    let j;
    try {
      const r = await fetch(`/api/llm/chat_job/${job_id}`, { cache: "no-store" });
      if (r.status === 404) throw new Error("expired");
      if (!r.ok) throw new Error("http " + r.status);
      j = await r.json();
      fails = 0;
    } catch (e) {
      if (e.message === "expired") throw new Error("回覆已過期");
      if (++fails > 40) throw new Error("網路中斷太久");
      continue;
    }
    if (j.error) throw new Error(j.error);
    if (j.text && j.text !== acc) { acc = j.text; onToken(acc); }
    if (j.done) { if (!acc.trim()) throw new Error("模型回了空訊息"); return acc; }
  }
}

async function llmReply(s, onToken, extraUser = null) {
  // 上下文只取「本場景」:最後一個場景標記(sys)之後的對話。
  const hist = s.history || [];
  let cut = 0;
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].role === "sys") { cut = i + 1; break; }
  const msgs = [
    { role: "system", content: buildSystemPrompt(buildCtx(s)) },
    ...hist.slice(cut).slice(-40).filter(m => m.role === "user" || m.role === "assistant").map(m => ({ role: m.role, content: m.content })),
  ];
  if (extraUser) msgs.push({ role: "user", content: extraUser });
  const canned = pick((chatSession?.type === "date" ? DATE_LINES : CHAT_LINES)[s.stage] || CHAT_LINES.stranger);
  return llmJobRun(msgs, onToken, canned);
}

async function sendChatMsg() {
  const s = state.succubi.find(x => x.id === chatWith);
  const input = document.getElementById("chat-input");
  if (!s || !chatSession || chatSession.busy) return;
  const text = input.value.trim();
  if (!text) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }

  input.value = "";
  s.history ??= [];
  s.history.push({ role: "user", content: text, t: Date.now() });
  // 先亮出玩家台詞,名牌切「她・輸入中」;輸入列先收起,她回完才出現
  vnShow(state.settings.player || "你", text, "user");
  vnTyping(true);
  $("#vn-name").textContent = (state.settings.player || "你") + " → " + s.name;
  chatSession.busy = true;
  setChatWaiting(true);
  document.getElementById("chat-send").disabled = true;
  try {
    // 失敗自動重試一次(手機切回前景時網路常需要一秒回魂)
    let reply;
    try {
      reply = await llmReply(s, acc => vnShow(s.name, acc, "ai"));
    } catch (e1) {
      if (e1.name === "AbortError") throw e1;
      vnTyping(true);
      await new Promise(r => setTimeout(r, 1000));
      reply = await llmReply(s, acc => vnShow(s.name, acc, "ai"));
    }
    s.history.push({ role: "assistant", content: reply, t: Date.now() });
    s.history = s.history.slice(-200);
    chatSession.playerMsgs++;
    if (!chatSession.gotReply) { chatSession.gotReply = true; s.lastChatDay = dayNum(); }
    vnDone();
    dirty = true;
    saveNow();   // 對話內容立即寫入伺服器,不等防抖——關頁面也不掉字

    // 回合上限(每次隨機):達標後鎖輸入、顯示收尾,稍後自動結束(結算情感)
    if (chatSession.playerMsgs >= chatSession.turnCap) {
      chatSession.ended = true;
      const inputEl = document.getElementById("chat-input");
      if (inputEl) { inputEl.disabled = true; inputEl.placeholder = "這次對話結束了…"; }
      const btn = document.getElementById("chat-send");
      if (btn) btn.disabled = true;
      setTimeout(() => { if (chatSession?.ended) exitChat(); }, 1600);
      return;
    }
  } catch (e) {
    s.history.pop();
    if (e.name !== "AbortError") {
      console.error("LLM error:", e);
      const why = e.message && e.message !== "proxy error" ? `原因:${e.message}` : "連不上 Ollama";
      vnShow("", `(她恍神了……訊息不扣費,再說一次吧。${why})`, "sys");
      input.value = text;
    }
  }
  if (chatSession && !chatSession.ended) {
    chatSession.busy = false;
    setChatWaiting(false);
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
    appendMsg(m.role === "user" ? "user" : m.role === "sys" ? "sys" : "ai",
      m.role === "sys" ? `—— ${m.content} ——` : m.content);
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

// 限時看板娘:必須付費召喚、到期自動解除、無自動遞補(過期即回召喚書)
function kanbanSuccubus() {
  if (!state.kanbanId || !state.kanbanUntil || Date.now() >= state.kanbanUntil) return null;
  const s = state.succubi.find(x => x.id === state.kanbanId);
  return (s && !s.ntr) ? s : null;
}
function kanbanRemainMs() {
  return state.kanbanUntil ? Math.max(0, state.kanbanUntil - Date.now()) : 0;
}
const KANBAN_COST = 1;
const DRAW_CHANCE = 1 / 20;   // 每個間隔抽到召喚師的機率(未纏上時)
const ENCOUNTER_CHANCE = 1 / 5; // 有召喚師後,招看板娘/約會時「她正在對方身邊」的機率

// 抽召喚師:每隻魅魔每 drawIvlH 小時擲一次;擋抽三條件——
// ①已被纏上 ②正是我們的看板娘 ③正被我們約會(對話中)。回傳是否有變化。
function checkSummonerDraws() {
  if (!SUMMONERS.length) return false;
  const now = Date.now();
  let changed = false;
  const kanId = kanbanSuccubus()?.id;
  for (const s of state.succubi) {
    if (s.nextDraw == null) { s.drawIvlH ??= randInt(2, 5); s.nextDraw = now + s.drawIvlH * HOUR; }
    let rolls = 0;
    while (now >= s.nextDraw && rolls < 30) {
      rolls++;
      const blocked = s.summoner || s.ntr || s.id === kanId ||
        (chatWith === s.id && chatSession);
      if (!blocked && Math.random() < DRAW_CHANCE) {
        const su = pick(SUMMONERS);
        s.summoner = { id: su.id, affection: 0, sinceDay: dayNum() };
        log(`${su.name} 纏上了 ${s.name}!`);
        toast(`⚠ ${su.name} 纏上了 ${s.name}`, "bad");
      }
      s.nextDraw += s.drawIvlH * HOUR;
      changed = true;
    }
    // 保險:離線過久時 30 次追不回,直接跳到下個未來時點
    if (s.nextDraw <= now) { s.nextDraw = now + s.drawIvlH * HOUR; changed = true; }
  }
  return changed;
}

// 無看板娘時背景顯示的「休息中」魅魔:優先最後一位看板娘,否則最新召喚(排除 NTR)
function restingSuccubus() {
  if (state.lastKanbanId) {
    const s = state.succubi.find(x => x.id === state.lastKanbanId && !x.ntr);
    if (s) return s;
  }
  const alive = state.succubi.filter(s => !s.ntr);
  return alive[alive.length - 1] || null;
}

function summonKanban(id, skipEncounter = false) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || s.ntr) return;
  if (state.gold < KANBAN_COST) { toast(`召喚看板娘需 ${KANBAN_COST} 金`, "bad"); return; }
  // 被纏上時 1/5 撞見對方 → 觀戰(她沒來,不扣費);搶回後 skipEncounter 直接成立
  if (!skipEncounter && s.summoner && Math.random() < ENCOUNTER_CHANCE) { enterWatch(s, "kanban"); return; }
  state.gold -= KANBAN_COST;
  state.kanbanId = id;
  state.lastKanbanId = id;
  state.kanbanUntil = Date.now() + kanbanHours() * HOUR;
  log(`召喚 ${s.name} 為看板娘`);
  toast(`${s.name} 來到你身邊♥`, "good");   // 不透露持續時間
  scheduleSave(); renderAll();
}

// 到期解除(每秒 tick 呼叫);回傳是否有變化
function expireKanban() {
  if (state.kanbanId && (!state.kanbanUntil || Date.now() >= state.kanbanUntil)) {
    state.kanbanId = null;
    state.kanbanUntil = null;
    // 不提醒玩家——要自己去魅魔頁察看她還在不在
    return true;
  }
  return false;
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

  if (expireKanban()) changed = true;
  if (checkSummonerDraws()) changed = true;

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
  applyLayoutVars();
}

// ===== 版面:卡片顏色 + 反差字色 + 分頁列透明度(cthulhu-note 式)=====

const CARD_KINDS = [["exec", "執行中卡"], ["found", "發現卡"], ["acc", "已承接卡"], ["vn", "對話框"]];

function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// 相對亮度(WCAG),用來算對比度
function relLum(r, g, b) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

// 反差字色:把自訂色依透明度疊在主題底色上,算出實際底色,
// 再從「近黑 / 近白」挑對比度較高的那個 → 任何底色都保證讀得清。
function contrastText(hex, a) {
  const base = LIGHT_THEMES.has(state.settings.theme || "aqua") ? 236 : 20;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  const R = r * a + base * (1 - a), G = g * a + base * (1 - a), B = b * a + base * (1 - a);
  const L = relLum(R, G, B);
  const dark = relLum(22, 16, 31), light = relLum(244, 251, 255);
  const cDark = (Math.max(L, dark) + 0.05) / (Math.min(L, dark) + 0.05);
  const cLight = (Math.max(L, light) + 0.05) / (Math.min(L, light) + 0.05);
  return cLight >= cDark ? "#f4fbff" : "#16101f";
}

function applyLayoutVars() {
  const root = document.documentElement.style;
  const cc = state.settings.cardColors || {};
  for (const [k] of CARD_KINDS) {
    const c = cc[k];
    if (!c) {
      root.removeProperty(`--card-${k}`);
      root.removeProperty(`--card-${k}-text`);
      continue;
    }
    root.setProperty(`--card-${k}`, hexToRgba(c.color, c.opacity));
    // 一律設定明確反差字色,不再回退到可能撞色的主題字
    const t = contrastText(c.color, c.opacity);
    root.setProperty(`--card-${k}-text`, t);
    // 反向光暈:淺字配深暈、深字配淺暈,連中灰底也讓字浮出來
    const halo = t === "#f4fbff"
      ? "0 0 3px rgba(0,0,0,.9),0 1px 2px rgba(0,0,0,.7)"
      : "0 0 3px rgba(255,255,255,.9),0 1px 2px rgba(255,255,255,.6)";
    root.setProperty(`--card-${k}-halo`, halo);
  }
  const tabs = document.getElementById("tabs");
  if (tabs) tabs.style.opacity = state.settings.tabOpacity ?? 1;
}

// ===== 全域背景圖 =====

let bgTimer = null;

function applyBg() {
  const layer = document.getElementById("bg-layer");
  const imgs = state.settings.bgImages || [];
  if (!imgs.length) {
    layer.classList.remove("on");
    setTimeout(() => { layer.style.backgroundImage = ""; }, 800);
    return;
  }
  if (state.settings.bgIndex >= imgs.length) state.settings.bgIndex = 0;
  layer.style.backgroundImage = `url(/assets/backgrounds/${imgs[state.settings.bgIndex]})`;
  requestAnimationFrame(() => layer.classList.add("on"));
}

function rotateBg() {
  const imgs = state.settings.bgImages || [];
  if (imgs.length < 2) return;
  state.settings.bgIndex = (state.settings.bgIndex + 1) % imgs.length;
  const layer = document.getElementById("bg-layer");
  layer.style.opacity = "0";
  setTimeout(() => { applyBg(); layer.style.opacity = ""; }, 800);
  scheduleSave();
}

function startBgRotation() {
  clearInterval(bgTimer);
  if ((state.settings.bgImages || []).length > 1)
    bgTimer = setInterval(rotateBg, (state.settings.bgInterval || 5) * 60 * 1000);
}

function resizeImageToBlob(file) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let w = img.width, h = img.height;
        if (w > MAX) { h = Math.round(h * MAX / w); w = MAX; }
        if (h > MAX) { w = Math.round(w * MAX / h); h = MAX; }
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        c.toBlob(b => res(b), "image/jpeg", 0.78);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

async function uploadBgFiles(input) {
  for (const f of Array.from(input.files)) {
    const blob = await resizeImageToBlob(f);
    const fd = new FormData();
    fd.append("file", new File([blob], "bg.jpg", { type: "image/jpeg" }));
    const r = await fetch("/api/backgrounds", { method: "POST", body: fd });
    if (r.ok) {
      const d = await r.json();
      state.settings.bgImages.push(d.name);
    }
  }
  input.value = "";
  scheduleSave(); applyBg(); startBgRotation(); renderSettings();
  toast("背景圖已上傳", "good");
}

async function removeBgAt(i) {
  const name = state.settings.bgImages[i];
  try { await fetch(`/api/backgrounds/${name}`, { method: "DELETE" }); } catch { }
  state.settings.bgImages.splice(i, 1);
  if (state.settings.bgIndex >= state.settings.bgImages.length) state.settings.bgIndex = 0;
  scheduleSave(); applyBg(); startBgRotation(); renderSettings();
}

function renderAll() {
  // 每個子渲染獨立 try:單一區塊出錯(如半更新缺元素)不連累其他,
  // 委託輸入等核心功能永遠保持可用。
  for (const fn of [applyTheme, renderHud, renderQuests, renderShop, renderSuccubi, renderChatView, renderKanban, renderCrest, renderSettings]) {
    try { fn(); } catch (e) { console.error(fn.name, e); }
  }
}

// 淫紋按鈕:有層數、看板娘在、醒著、不在對話中才顯示
function renderCrest() {
  const el = $("#crest");
  if (!el) return;
  const show = (state.chatCharges || 0) > 0 && kanbanSuccubus() && !isAsleep() && !chatWith;
  el.classList.toggle("hidden", !show);
  const n = $("#crest-n");
  if (show && n) n.textContent = state.chatCharges;
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
    ? `剩 <span class="warn">${fmtRemain(q.deadline - now)}</span> — <span class="warn">超時要賠違約金!</span>`
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
  $("#exec-count").textContent = `執行中 ${exec.length}/${execCap()}`;
  const track = $("#pin-track");
  let html = "";
  for (let i = 0; i < execCap(); i++) {
    const q = exec[i];
    if (q) {
      html += `<div class="pin-slide"><div class="q-card c-exec">
        <span class="q-tag gold-tag">完成 → ? 金(1~24)</span>
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
  pinIdx = Math.min(pinIdx, execCap() - 1);
  track.style.transform = `translateX(-${pinIdx * 100}%)`;
  $("#pin-dots").innerHTML = Array.from({ length: execCap() }, (_, i) => `<div class="dot${i === pinIdx ? " on" : ""}"></div>`).join("");
  track.querySelectorAll("[data-slot]").forEach(el => el.onclick = () => goProc());
  attachPinSwipe($("#pin-carousel"), exec);
  const now = Date.now();
  for (const q of exec) updateBar(q, now);
}

function setPinIdx(i) {
  pinIdx = Math.max(0, Math.min(execCap() - 1, i));
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
  const full = execQuests().length >= execCap();

  const tag = lv === 0
    ? `<span class="q-tag">發現</span>`
    : `<span class="q-tag gold-tag">期限 ${QUEST_HOURS} 小時 / 完成擲 1~24 金</span>`;
  const hints = lv === 0
    ? ["↑ 承接", "↓ 推掉", "← → 切換", "點兩下 編輯"]
    : [full ? "執行中已滿" : "↑ 開始執行", "↓ 推掉(-1~3金)", "← → 切換", "點兩下 退回"];

  stage.innerHTML = `<div class="q-card ${lv === 0 ? "c-found" : "c-acc"}" id="proc-card">
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
    up: () => flyCard(card, "up", () => { accept(q.id); toast("已承接", "good"); }),
    down: () => flyCard(card, "down", () => drop(q.id)),
    left: () => nav2(1), right: () => nav2(-1),
    dbl: () => editText(q.id),
  } : {
    up: () => {
      if (execQuests().length >= execCap()) { toast(`執行中已滿 ${execCap()} 件`, "bad"); return; }
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

  renderPlayerAttrs();
}

// 玩家屬性面板(商店底部):金幣、名額、擴充(擴充系統將於後續階段填入)
function renderPlayerAttrs() {
  const el = $("#player-attrs");
  if (!el) return;
  const derived = [
    ["金幣", `${state.gold} 金`],
    ["名冊名額", `${state.succubi.length} / ${rosterCap()}`],
    ["執行中格數", `${execCap()} 格`],
    ["淫紋", `${state.chatCharges || 0} 層`],
    ["完成金額", `${1 + expLv("reward")}~${3 + expLv("reward")} 金`],
    ["商店祭品", `每日 ${2 + expLv("offering")} 人`],
    ["淫紋機率", `1/${crestDenom()}`],
    ["看板娘時長", `${kanbanHours()} 小時`],
  ];
  const lvs = Object.keys(EXPANSIONS).map(k => `${EXPANSIONS[k]} Lv${expLv(k)}`).join("、");
  el.innerHTML =
    derived.map(([a, b]) => `<div class="setting-row"><label>${a}</label><span>${b}</span></div>`).join("") +
    `<div class="setting-row"><label>擴充等級</label><span class="dim" style="text-align:right">${lvs}</span></div>`;
}

// 聊天插播層:蓋在所有分頁之上,只有「結束對話」能退出
function renderChatView() {
  const chatV = $("#chat-view");
  const inputRow = $("#chat-input-row");
  const watchCtl = $("#watch-controls");
  const sacCtl = $("#sac-controls");

  // 獻祭模式最優先
  if (sacrificeWith) {
    chatV.classList.remove("hidden");
    inputRow?.classList.add("hidden");
    watchCtl?.classList.add("hidden");
    sacCtl?.classList.remove("hidden");
    $("#chat-title").textContent = "獻祭儀式";
    return;
  }
  sacCtl?.classList.add("hidden");

  // 觀戰模式優先
  if (watchWith) {
    const s = state.succubi.find(x => x.id === watchWith);
    if (!s) { watchWith = null; watchSession = null; document.body.classList.remove("chat-mode"); }
    else {
      chatV.classList.remove("hidden");
      inputRow?.classList.add("hidden");
      watchCtl?.classList.remove("hidden");
      const su = summonerById(s.summoner?.id);
      $("#chat-title").textContent = `觀戰:${s.name} 與 ${su?.name || "他"}`;
      return;
    }
  }
  watchCtl?.classList.add("hidden");
  inputRow?.classList.remove("hidden");

  if (chatWith) {
    const cs = state.succubi.find(x => x.id === chatWith);
    if (!cs) {
      chatWith = null; chatSession = null;
      document.body.classList.remove("chat-mode");
    } else {
      chatV.classList.remove("hidden");
      $("#chat-title").textContent = chatSession.type === "date"
        ? `${cs.name}・${chatSession.location}約會中`
        : `${cs.name}・聊天中`;
      return;
    }
  }
  chatV.classList.add("hidden");
}

function renderSuccubi() {
  const home = $("#succubi-home");
  const detail = $("#succubus-detail");

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
          <span class="stage-chip">${s.ntr ? "被奪走" : stageLabel(s.stage)}</span>
          ${kanbanSuccubus()?.id === s.id ? `<span class="stage-chip" style="color:var(--gold)">★ 看板娘</span>` : ""}
          ${s.summoner && !s.ntr ? `<span class="stage-chip" style="color:var(--red)">⚠ 被纏上</span>` : ""}</div>
        <div class="aff-bar"><div class="${s.affection < 0 ? "neg" : ""}" style="width:${barW}%"></div></div>
      </div>
      <div class="status-dot ${st}"></div>`;
    el.onclick = () => { detailId = s.id; dateChooser = false; renderAll(); };
    roster.appendChild(el);
  }
  if (!state.succubi.length) roster.innerHTML = `<div class="empty">一個魅魔都沒有。桌上只有那本召喚之書。</div>`;

  document.querySelector("#roster-panel h2").textContent = `魅魔名冊(${state.succubi.length}/${rosterCap()})`;
  const hint = $("#summon-hint");
  const counts = $("#summon-counts");
  const full = state.succubi.length >= rosterCap();
  hint.textContent = state.gold < 0 ? "負債中不可召喚"
    : full ? `名冊名額已滿(${rosterCap()} 格)——靠擴充增加名額`
    : `地牢裡有 ${state.dungeon.length} 名祭品`;
  counts.innerHTML = "";
  for (let n = 1; n <= 6; n++) {
    const b = document.createElement("button");
    b.textContent = n;
    b.disabled = state.dungeon.length < n || state.gold < 0 || full;
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
  // 被別的召喚師纏上
  let summonerLine = "";
  if (s.summoner && !s.ntr) {
    const su = summonerById(s.summoner.id);
    if (su) summonerLine = `<div class="summoner-note">⚠ ${su.emoji} <b>${esc(su.name)}</b> 纏上了她(${esc(su.desc)})<br>
      對方好感 ${s.summoner.affection} — 招她當看板娘或約會時,有機會撞見他們(Phase 6 觀戰/搶回)</div>`;
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
      <div class="traits">${s.job ? `<span style="color:var(--cyan)">前${esc(s.job)}</span>` : ""}${s.personality.map(p => `<span>${p}</span>`).join("")}<span>${s.speech}</span>${s.dna.traits.map(t => `<span>${t}</span>`).join("")}</div>
      ${s.backstory ? `<div class="aff-line dim small" style="max-width:32em;margin:0 auto">${esc(s.backstory)}</div>` : ""}
      ${s.schedule ? `<div class="schedule">${SCHEDULE_SLOTS.map(k => {
        const now = timeSlot() === k;
        return `<div class="sch-row${now ? " now" : ""}"><span class="sch-t">${SLOT_LABEL[k]}</span><span>${esc(s.schedule[k])}</span></div>`;
      }).join("")}</div>` : ""}
      <div class="aff-line">情感 <b>${s.affection}</b>${ns && !s.ntr ? ` <span class="dim small">/ ${ns[2]} 升【${ns[1]}】</span>` : ""}</div>
      ${needLine}
      ${summonerLine}
      ${!s.portraitReady ? `<div class="aff-line dim small">尚未成形——今晚讓她織夢,明早見到她的臉(M3)</div>` : ""}
      <div class="detail-actions">
        ${s.ntr
          ? `<button class="gold" id="act-ransom">贖回 ${RANSOM[s.stage]} 金</button>`
          : `<button class="cyan" id="act-date" ${asleep || datesLeft <= 0 ? "disabled" : ""}>約會 ${DATE_COST} 金(今日剩 ${datesLeft})</button>
             ${kanbanSuccubus()?.id === s.id
               ? `<button disabled>★ 看板娘(陪伴中)</button>`
               : `<button id="act-kanban">召喚為看板娘(${KANBAN_COST} 金)</button>`}`}
      </div>
      ${dateChooser && !s.ntr ? `<div class="chooser" style="justify-content:center">${dateChoices.map(([l]) => `<button data-loc="${l}">${l}</button>`).join("")}<button data-reroll title="換一批">🎲</button></div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">聊天請透過淫紋(做委託觸發)——看板娘才聽得見你的呼喚</div>` : ""}
      ${asleep ? `<div class="aff-line dim small">(睡眠時段——她回夢境了)</div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">天賦:${EXPANSIONS[s.gift] || "?"}(當看板娘時暫時 +1;獻祭有 1/${Math.round(1 / sacrificeDropChance(s.stage))} 機率永久獲得)</div>
        <div class="detail-actions"><button class="danger-btn" id="act-dismiss">獻祭(${dismissPriceToday()} 金)</button></div>` : ""}
    </div>`;

  root.querySelector("#detail-back").onclick = () => { detailId = null; dateChooser = false; renderAll(); };
  root.querySelector("#act-kanban")?.addEventListener("click", () => summonKanban(s.id));
  root.querySelector("#act-dismiss")?.addEventListener("click", () => sacrificeSuccubus(s.id));
  root.querySelector("#act-date")?.addEventListener("click", () => {
    dateChooser = !dateChooser;
    if (dateChooser) dateChoices = pickN(DATE_SPOTS, 5);
    renderAll();
  });
  root.querySelector("#act-ransom")?.addEventListener("click", () => ransom(s.id));
  root.querySelector("[data-reroll]")?.addEventListener("click", () => { dateChoices = pickN(DATE_SPOTS, 5); renderAll(); });
  root.querySelectorAll("[data-loc]").forEach(b => b.onclick = () => enterChat(s.id, "date", b.dataset.loc));
}

function renderKanban() {
  const book = $("#book");
  const girl = $("#kanban-girl");
  const zzz = $("#kanban-zzz");
  const asleep = isAsleep();
  zzz.classList.toggle("hidden", !asleep);

  // 三態:對話中的魅魔 / 現任看板娘(亮) → 休息中的魅魔(暗) → 召喚書(名冊全空)
  const active = (chatWith && state.succubi.find(x => x.id === chatWith)) || kanbanSuccubus();
  const s = active || restingSuccubus();

  if (s) {
    book.classList.add("hidden");
    girl.classList.remove("hidden");
    girl.className = `r-${s.rarity}` + (active ? "" : " resting");
    if (active) {
      girl.innerHTML = girlSVG("#241333", 9) + `<div class="kname">${esc(s.name)}</div>`;
      girl.onclick = () => kanbanSay(asleep ? pick(REACT.sleepClick) : pick(REACT.idle));
    } else {
      // 休息中:暗淡剪影,點擊花錢再召喚
      girl.innerHTML = girlSVG("#241333", 9) +
        `<div class="kname">${esc(s.name)}<span class="krem" style="color:var(--dim)">(回到自己的生活中)</span></div>`;
      girl.onclick = () => {
        if (asleep) { kanbanSay(pick(REACT.sleepClick)); return; }
        if (state.gold < KANBAN_COST) { kanbanSay("哼,連 1 金都沒有,還想叫我來?"); return; }
        summonKanban(s.id);
      };
    }
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

  $("#set-theme").innerHTML = THEMES.map(([k, label]) =>
    `<option value="${k}" ${(state.settings.theme || "aqua") === k ? "selected" : ""}>${label}</option>`).join("");

  // 版面:卡片顏色列
  const THEME_CARD_DEFAULT = { aqua: "#120c22", pink: "#220c1c", green: "#0a1a10", amber: "#261808", ice: "#0c162c", day: "#ffffff", sakura: "#fff8fb" };
  const rows = $("#card-color-rows");
  const cc = state.settings.cardColors || {};
  const defHex = THEME_CARD_DEFAULT[state.settings.theme || "aqua"];
  rows.innerHTML = CARD_KINDS.map(([k, label]) => {
    const c = cc[k] || { color: defHex, opacity: 0.68 };
    return `<div class="card-color-row" data-kind="${k}">
      <span class="ccname">${label}</span>
      <input type="color" value="${c.color}">
      <input type="range" min="0" max="1" step="0.01" value="${c.opacity}">
      <span class="ccval">${Math.round(c.opacity * 100)}%</span>
    </div>`;
  }).join("");
  rows.querySelectorAll(".card-color-row").forEach(row => {
    const k = row.dataset.kind;
    const cp = row.querySelector("input[type=color]");
    const ca = row.querySelector("input[type=range]");
    const onchg = () => {
      state.settings.cardColors ??= {};
      state.settings.cardColors[k] = { color: cp.value, opacity: parseFloat(ca.value) };
      row.querySelector(".ccval").textContent = Math.round(ca.value * 100) + "%";
      applyLayoutVars(); scheduleSave();
    };
    cp.oninput = onchg;
    ca.oninput = onchg;
  });

  $("#set-tab-op").value = state.settings.tabOpacity ?? 1;
  $("#tab-op-val").textContent = Math.round((state.settings.tabOpacity ?? 1) * 100) + "%";
  $("#set-bg-interval").value = state.settings.bgInterval || 5;
  $("#bg-thumbs").innerHTML = (state.settings.bgImages || []).map((n, i) =>
    `<div class="bg-thumb${i === state.settings.bgIndex ? " active-bg" : ""}">
      <img src="/assets/backgrounds/${n}" loading="lazy">
      <button class="bg-thumb-del" data-i="${i}">✕</button>
    </div>`).join("") || `<span class="dim small">還沒有背景圖。</span>`;
  $("#bg-thumbs").querySelectorAll(".bg-thumb-del").forEach(b => b.onclick = () => removeBgAt(+b.dataset.i));

  $("#log-list").innerHTML = state.log.length
    ? state.log.map(l => `<div>${esc(l)}</div>`).join("")
    : "還沒有任何記錄。";
}

// ===== 分頁滑動 =====

const tabButtons = document.querySelectorAll("#tabs button");
function switchTab(i) {
  const tr = document.getElementById("track");
  if (tr) tr.style.transform = `translateX(-${i * 25}%)`;
  tabButtons.forEach((b, j) => b.classList.toggle("active", j === i));
  document.body.dataset.tab = i;
}
tabButtons.forEach(b => b.addEventListener("click", () => switchTab(+b.dataset.tab)));
switchTab(0);

// ===== 事件綁定 =====
// 一律 null-safe:半更新(新舊 index/app 混搭)時缺失的元素靜默略過,
// 絕不因單一 null 參照同步崩潰而讓整個 app 磚掉。

function on(id, ev, fn) {
  const el = document.getElementById(id);
  if (el) el.addEventListener(ev, fn);
}

on("quest-add", "click", () => { const i = $("#quest-input"); if (i) { addQuest(i.value); i.value = ""; } });
on("quest-input", "keydown", e => { if (e.key === "Enter") { addQuest(e.target.value); e.target.value = ""; } });
on("hud-need", "click", () => switchTab(2));
on("q-back", "click", () => goExec());
on("crest", "click", () => { const s = kanbanSuccubus(); if (s) enterChat(s.id); });

on("set-player", "change", e => { state.settings.player = e.target.value.trim(); scheduleSave(); });
on("set-sleep-start", "change", e => { state.settings.sleepStart = e.target.value; scheduleSave(); renderAll(); });
on("set-sleep-end", "change", e => { state.settings.sleepEnd = e.target.value; scheduleSave(); renderAll(); });
on("set-theme", "change", e => { state.settings.theme = e.target.value; scheduleSave(); renderAll(); });

on("btn-card-reset", "click", () => { state.settings.cardColors = null; applyLayoutVars(); scheduleSave(); renderSettings(); });
on("set-tab-op", "input", e => {
  state.settings.tabOpacity = parseFloat(e.target.value);
  const v = $("#tab-op-val"); if (v) v.textContent = Math.round(e.target.value * 100) + "%";
  applyLayoutVars(); scheduleSave();
});
on("set-bg-interval", "change", e => {
  state.settings.bgInterval = Math.max(1, parseInt(e.target.value) || 5);
  e.target.value = state.settings.bgInterval;
  startBgRotation(); scheduleSave();
});
on("btn-bg-upload", "click", () => $("#bg-file")?.click());
on("bg-file", "change", e => uploadBgFiles(e.target));
on("btn-bg-clear", "click", async () => {
  if (!confirm("刪除全部背景圖?")) return;
  for (const n of state.settings.bgImages || []) {
    try { await fetch(`/api/backgrounds/${n}`, { method: "DELETE" }); } catch { }
  }
  state.settings.bgImages = [];
  state.settings.bgIndex = 0;
  clearInterval(bgTimer);
  scheduleSave(); applyBg(); renderSettings();
});

// 聊天室
on("chat-back", "click", () => {
  if (sacrificeWith) { if (!document.getElementById("sac-done")?.disabled) exitSacrifice(); return; }
  if (watchWith) exitWatch(); else exitChat();
});
on("chat-send", "click", () => sendChatMsg());
on("watch-next", "click", () => watchNext());
on("watch-end", "click", () => exitWatch());
on("sac-done", "click", () => exitSacrifice());
on("chat-input", "keydown", e => { if (e.key === "Enter") sendChatMsg(); });
on("chat-log-btn", "click", () => {
  const bl = $("#chat-backlog");
  const s = state.succubi.find(x => x.id === chatWith);
  if (!bl || !s) return;
  if (bl.classList.contains("hidden")) { renderBacklog(s); bl.classList.remove("hidden"); }
  else bl.classList.add("hidden");
});
on("chat-backlog", "click", () => $("#chat-backlog")?.classList.add("hidden"));
on("conn-retry", "click", () => load());

// AI 設定
on("set-ollama", "change", e => { state.settings.ollamaUrl = e.target.value.trim() || "http://localhost:11434"; scheduleSave(); });
on("set-model", "change", e => { state.settings.model = e.target.value.trim(); scheduleSave(); });
on("set-rating", "change", e => { state.settings.rating = e.target.value; scheduleSave(); });
on("btn-llm-test", "click", async () => {
  const r = $("#llm-test-result");
  if (!r) return;
  r.textContent = "測試中…";
  try {
    const j = await fetch(`/api/llm/tags?endpoint=${encodeURIComponent(state.settings.ollamaUrl)}`)
      .then(x => { if (!x.ok) throw 0; return x.json(); });
    const names = (j.models || []).map(m => m.name);
    const dl = $("#model-list"); if (dl) dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
    r.textContent = names.length ? `OK,${names.length} 個模型(模型欄可下拉選)` : "OK,但沒有已安裝的模型";
  } catch { r.textContent = "連線失敗——檢查端點與 Ollama 是否啟動"; }
});

on("btn-export", "click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `yorozuya-save-v${version}.json`;
  a.click();
});
on("btn-import", "click", () => $("#import-file")?.click());
on("import-file", "change", async e => {
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
on("btn-reset", "click", () => {
  if (!confirm("確定重置存檔?金幣、委託與所有魅魔將全部消失。")) return;
  state = defaultState();
  state.lastSettledDay = null;
  detailId = null;
  scheduleSave();
  state.lastSettledDay = dayNum();
  ensureShop();
  renderAll();
});

// 全部重來:硬重置——清伺服器存檔 + 本地快取 + service worker,回到全新遊戲。
// 也是萬一再遇到卡死狀態的終極自救按鈕。
on("btn-hard-reset", "click", async () => {
  if (!confirm("全部重來?\n\n這會清空伺服器上的存檔、本地快取與所有進度,回到全新遊戲,無法復原。")) return;
  if (!confirm("真的確定?所有魅魔、委託、金幣都會永遠消失。")) return;
  dirty = false;
  clearTimeout(saveTimer);
  const fresh = defaultState();
  fresh.lastSettledDay = dayNum();
  // 直接以最新版本覆寫伺服器為全新狀態
  try {
    const j = await fetch("/api/save").then(r => r.json());
    await fetch("/api/save", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base_version: j.version, data: fresh }),
    });
  } catch { }
  try { localStorage.removeItem(CACHE_KEY); } catch { }
  try { sessionStorage.clear(); } catch { }
  try { if (window.caches) for (const k of await caches.keys()) await caches.delete(k); } catch { }
  try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { }
  location.reload();
});

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
  watch: (id, type = "kanban", loc = "海邊") => { const s = state.succubi.find(x => x.id === id); if (s) enterWatch(s, type, loc); },
};

// ===== 啟動 =====

// PWA 自動更新:回前景時檢查新版;新 service worker 接管後自動重整,
// 手機不會再卡在舊版程式打已淘汰的 API
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").then(reg => {
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") reg.update().catch(() => { });
    });
    setInterval(() => reg.update().catch(() => { }), 60 * 60 * 1000);
  }).catch(() => { });
  let hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadController && !chatSession) location.reload();
    hadController = true;
  });
}

load();
