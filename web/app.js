// 魅魔萬事屋 遊戲核心
// M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔
// M1:商店/地牢/召喚 + 名冊 + 情感需求 + NTR + 睡眠時鐘 + 看板娘罐頭反應
// M2:Ollama 聊天/約會(galgame 式)+ PersonaBuilder 銜接口 + history 存檔

import { buildSystemPrompt, buildWatchPrompt, buildSacrificePrompt, buildOfferingPrompt, buildQuipPrompt, buildBubblePrompt, buildCardPlayPrompt, buildCardVisualPosePrompt, parseCardVisualPose, formatCardReactDisplay, buildMatingPrompt, buildSacScenePrompt, buildSacReactPrompt } from "./content/persona_builder.js";
import { loadPools, generateGirl, WARDROBE_UNLOCK } from "./content/girl_gen.js";
import * as Cards from "./content/card_engine.js";
loadPools();   // 人物生成池(persona_pools.json;載入失敗時召喚退回舊制簡易骰)

// 遊戲版本(顯示在設定頁最下方;每次改版遞增——手機顯示的就是「正在跑的 app.js」的版本)
const APP_VER = "v6.31(2026-08-08)上線槽硬切：清玩家牌進度";

// 世界觀文件(內容模組件,可自由編輯):開機載入一次,注入每次對話。
// 核心零解析——只把整份文字透傳給 PersonaBuilder。
let WORLD_LORE = "";
fetch("content/world.md").then(r => r.ok ? r.text() : "").then(t => { WORLD_LORE = t; }).catch(() => {});

// 其他召喚師池(內容模組件,可自由編輯):開機載入一次
let SUMMONERS = [];
fetch("content/summoners.json").then(r => r.ok ? r.json() : null).then(j => { SUMMONERS = (j && j.summoners) || []; }).catch(() => {});
function summonerById(id) { return SUMMONERS.find(x => x.id === id) || null; }

// 互動牌制內容：必須吃 /api/cards（registry.active 上線卡組）
// 失敗才退 content/cards.json，並在除錯台顯示警告
let CARDS_PACK_INFO = { packId: null, file: null, name: null, via: null };
let CARDS_LOAD = fetch("/api/cards?ts=" + Date.now())
  .then(r => {
    if (!r.ok) throw new Error("api " + r.status);
    return r.json();
  })
  .then(j => {
    if (j) {
      Cards.setCardsData(j);
      CARDS_PACK_INFO = {
        packId: j?._meta?.active_pack || "?",
        file: j?._meta?.active_file || "?",
        name: j?._meta?.active_name || j?._meta?.title || "?",
        liveEpoch: j?._meta?.live_epoch ?? 0,
        via: "api",
        cardCount: (j.cards || []).length,
        starterCount: (Cards.starterPoolIds?.() || []).length,
      };
      console.info("[cards] loaded pack", CARDS_PACK_INFO);
    }
    return j;
  })
  .catch(err => {
    console.warn("[cards] /api/cards failed, fallback content/cards.json", err);
    return fetch("content/cards.json?ts=" + Date.now())
      .then(r => r.ok ? r.json() : null)
      .then(j => {
        if (j) {
          Cards.setCardsData(j);
          CARDS_PACK_INFO = {
            packId: "main?",
            file: "cards.json",
            name: "fallback-static",
            via: "static-fallback",
            cardCount: (j.cards || []).length,
            starterCount: (Cards.starterPoolIds?.() || []).length,
          };
          console.warn("[cards] using static fallback — 上線卡組可能沒掛到", CARDS_PACK_INFO);
        }
        return j;
      });
  })
  .catch(() => null);

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
  crest:    "淫紋機率",     // 每級 +5% 每次委託操作她想找你說話的機率(基礎值由稀有度決定)
  drop:     "獻祭掉落率",   // 影響獻祭掉落(Phase 7)
  cheap:    "召喚減費",     // 第二位起的看板娘費用每級 -1 金,地板 2 金
};
// 天賦可能值:8 個擴充軸 + 特殊「取消召喚師」(獻祭刷到就清掉所有召喚師)
const GIFT_KEYS = [...Object.keys(EXPANSIONS), "cleanse"];
function giftLabel(g) { return g === "cleanse" ? "取消所有召喚師" : (EXPANSIONS[g] || "?"); }
function expLv(k) {
  let lv = (state.expansions && state.expansions[k]) || 0;
  // 在任看板娘自帶擴充暫時加到玩家身上(多看板娘可疊,每位 +1)
  if (typeof kanbanSuccubi === "function" && state) {
    for (const kg of kanbanSuccubi()) if (kg.gift === k) lv += 1;
  }
  return lv;
}
function execCap() { return 1 + expLv("exec"); }
function rosterCap() { return 1 + expLv("roster"); }
function kanbanHours() { return 1 + expLv("kanban"); }
const QUEST_HOURS = 24;          // 期限統一 24 小時
const DISCOVER_BONUS_CAP = 10;   // 每日前 N 次發現有 0~2 金獎勵

// 每次進對話隨機決定能聊幾個來回(玩家不知道她何時喊停,製造驚喜)
// 聊天回到即時多回合 session:她當場回話,情感在 session 結束時結算一次
const CHAT_TURNS = [2, 4];      // 聊天 2~4 來回(一盞淫紋一場,聊到她喊停)
const DATE_TURNS = [2, 5];      // 約會 2~5 來回(付了 5 金,多聊幾句)

// ===== 淫紋:她有話要跟你說 =====
// 淫紋不是點數、不是入場券,是一盞「這位看板娘想跟你說話」的燈,亮了就能點開聊。
// 判定時機 = 你在委託上的每一次操作(發現 / 承接 / 開始執行 / 完成):
// 每操作一次,就對「此刻在店頭的每位看板娘」各擲一次她自己的出現率——中了她的紋就亮。
// 出現率完全由她的稀有度(+ 淫紋機率擴充)決定,不做任何額外加權或節流:
// 你做事她就找你說話,你不做事店裡就安安靜靜。
const CREST_P = { N: 1 / 4, R: 1 / 3, S: 2 / 5, SS: 1 / 2, SSR: 2 / 3 };
// 「淫紋機率」擴充:每級 +5%(上限 90%),讓低稀有度的孩子也能養到話多一點
function crestChance(s) {
  return Math.min(0.9, (CREST_P[s.rarity] ?? CREST_P.N) + expLv("crest") * 0.05);
}

// 委託操作觸發的淫紋判定（舊路徑；牌制開啟時改走 questBubbleRoll）。
// 被召喚走的不判;睡眠時段不判;已有紋／進行中對話不重複判。
function crestRoll() {
  if (freeChatRetired()) return false; // M2/M6：養成改氣泡，不再亮淫紋進聊天
  if (isAsleep()) return false;
  let changed = false;
  for (const s of kanbanSuccubi()) {
    if (s.summoner?.taken || s.wantsTalk || s.chatLine || s.typing) continue;
    // 這場還在進行中才跳過;擱置過久的舊 session 直接作廢,不讓它把紋鎖死
    if (s.chatSess) {
      if (Date.now() - (s.chatSess.at || 0) < CHAT_SESS_TTL) continue;
      s.chatSess = null;
    }
    if (Math.random() >= crestChance(s)) continue;
    // 中了就馬上亮紋:點進去可以「你先說」(零等待);
    // 同時在背景寫她的開場白,若你還沒點進來就寫好了,開場就換成她先開口。
    s.wantsTalk = Date.now();
    s.chatSess = null;                    // 上一場已結束,這是新的一場(回合數重抽)
    (s.history ??= []).push({ role: "sys", content: "—— 新的一次對話 ——", t: Date.now() });
    s.history = s.history.slice(-200);
    changed = true;
    toast(`……${s.name} 的淫紋亮了。她想跟你說話。`, "good");
  }
  // 中了就馬上排她那句話(有模型時);沒模型 crestFallback 會在下一秒補罐頭台詞
  if (changed) { dirty = true; try { genTick(true); } catch { /* 下輪 tick 再說 */ } }
  return changed;
}

/**
 * M2 氣泡：僅 discover / accept / complete 三節點、固定 15%、每位在場看板娘各擲一次。
 * 有模型 → 即時短 AI（對準這次委託）；失敗／無模型 → 罐頭。
 * 不進全螢幕聊天、不下手牌；情感 +0/+1（日 cap +2／人）。
 */
function questBubbleRoll(eventKey, questText = "") {
  if (!cardSystemOn()) return false;
  const girlIds = kanbanSuccubi()
    .filter(s => !s.ntr && !s.summoner?.taken)
    .map(s => s.id);
  if (!girlIds.length) return false;
  const hits = Cards.rollBubble(state, eventKey, {
    questText: questText || "",
    asleep: isAsleep(),
    girlIds,
    dayKey: dayNum(),
  });
  if (!hits.length) return false;
  const queue = [];
  const hasModel = !!state.settings?.model;
  for (const h of hits) {
    const s = state.succubi.find(x => x.id === h.girlId);
    if (!s) continue;
    if (h.emotionDelta) applyAffection(s, h.emotionDelta);
    const canned = h.text || "……";
    if (!hasModel) {
      queue.push({
        girlId: s.id,
        name: s.name,
        text: canned,
        emotionDelta: h.emotionDelta || 0,
        pending: false,
      });
      continue;
    }
    // 有 AI：先排隊顯示讀取，背景下單
    const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    const aiKey = `bubble:${s.id}:${eventKey}:${token}`;
    const item = {
      girlId: s.id,
      name: s.name,
      text: "",
      canned,
      emotionDelta: h.emotionDelta || 0,
      pending: true,
      aiKey,
      eventKey,
      questText: questText || "",
    };
    queue.push(item);
    // 立刻丟單（prio 8：低於打牌 12／回覆 10，高於背景 quip）
    genPost(aiKey, bubbleMsgs(s, eventKey, questText || ""), 8).catch(() => {});
  }
  if (!queue.length) return false;
  enqueueKanbanBubbles(queue);
  dirty = true;
  try { genTick(true); } catch { /* */ }
  return true;
}

function bubbleMsgs(girl, eventKey, questText) {
  const ctx = buildCtx(girl);
  ctx.want_guard_flag = false;
  ctx.bubble_event = { key: eventKey, quest_text: questText || "" };
  return [
    { role: "system", content: buildBubblePrompt(ctx) },
    { role: "user", content: "只輸出那一句話。" },
  ];
}

function bubbleLineFromAi(raw) {
  const { text } = stripGuardFlag(raw || "");
  let line = (text || "").split("\n").map(l => l.trim()).filter(Boolean)[0] || "";
  line = line.slice(0, 60);
  if (Cards.isWeakLine?.(line)) return "";
  return line;
}

/** 收氣泡 AI：佇列裡 pending 的 + 正在顯示的 */
async function genBubbleOrders() {
  if (!state.settings?.model) return;
  const items = [];
  if (bubbleShowingItem?.pending && bubbleShowingItem.aiKey) items.push(bubbleShowingItem);
  for (const it of bubbleQueue) {
    if (it.pending && it.aiKey) items.push(it);
  }
  if (!items.length) return;

  let changed = false;
  for (const it of items) {
    const girl = state.succubi.find(x => x.id === it.girlId);
    if (!girl) {
      it.pending = false;
      it.text = it.canned || "……";
      changed = true;
      continue;
    }
    const r = await genPost(it.aiKey, bubbleMsgs(girl, it.eventKey || "discover", it.questText || ""), 8);
    if (!r) continue;
    if (r.status === "pending" || r.status === "running" || r.status === "queued") continue;
    if (r.status === "done" && r.result) {
      const line = bubbleLineFromAi(r.result);
      it.text = line || it.canned || "……";
      it.fromAi = !!line;
    } else {
      it.text = it.canned || "……";
      it.fromAi = false;
    }
    it.pending = false;
    changed = true;
    // 若正在顯示這句，立刻換字
    if (bubbleShowingItem === it) refreshBubbleText(it);
  }
  if (changed) {
    // 若佇列頭已就緒但還沒顯示，催一下
    if (!bubbleShowing) pumpKanbanBubbles();
  }
}

function refreshBubbleText(it) {
  const textEl = document.getElementById("bubble-text");
  const hint = document.getElementById("bubble-hint");
  if (!textEl || !bubbleShowing) return;
  textEl.textContent = it.text || it.canned || "……";
  if (hint) hint.textContent = "點一下繼續";
}

/** 看板罐頭反應（完成／違約／催促等）— 有模型時也走短 AI */
function kanbanReact(kind) {
  if (isAsleep() || document.body.classList.contains("card-mode")) return;
  const g = kanbanSuccubus();
  if (!g || g.ntr || g.summoner?.taken) return;
  const canned = pick(REACT[kind] || REACT.idle);
  if (!state.settings?.model) {
    kanbanSay(canned);
    return;
  }
  // 用 complete 氣泡框架帶一點情境
  const eventKey = kind === "complete" ? "complete"
    : kind === "fail" ? "accept"
    : kind === "hurry" ? "accept"
    : "discover";
  const questText = kind === "hurry"
    ? "快到期的那件委託"
    : kind === "fail"
      ? "違約／搞砸的那件"
      : kind === "stage"
        ? "你們關係變了"
        : "剛完成的事";
  const token = `${Date.now().toString(36)}_${kind}`;
  const aiKey = `bubble:${g.id}:react:${token}`;
  const item = {
    girlId: g.id,
    name: g.name,
    text: "",
    canned,
    emotionDelta: 0,
    pending: true,
    aiKey,
    eventKey,
    questText,
  };
  enqueueKanbanBubbles([item]);
  genPost(aiKey, bubbleMsgs(g, eventKey, questText), 8).catch(() => {});
  try { genTick(true); } catch { /* */ }
}

// 擱置太久的那場對話就當它結束了(紋熄滅、下次委託操作再開新的一場),
// 免得一場沒聊完的舊對話把她的淫紋永遠佔住。
const CHAT_SESS_TTL = 30 * 60 * 1000;
function expireChatSess() {
  let changed = false;
  for (const s of state.succubi) {
    if (!s.chatSess || s.typing) continue;
    if (Date.now() - (s.chatSess.at || 0) < CHAT_SESS_TTL) continue;
    s.chatSess = null; s.chatLine = null; s.wantsTalk = 0;
    changed = true;
  }
  return changed;
}

// 沒設 AI 模型(或連敗到保底)時:念頭/回覆直接落地成罐頭台詞,循環照樣跑得動。
// 另加卡住保險:她「正在輸入」超過 3 分鐘還沒生出來,一律補罐頭——不讓 … 永遠轉下去。
const TYPING_STUCK_MS = 3 * 60 * 1000;
function crestFallback() {
  if (freeChatRetired()) return false; // M2/M6：不再補淫紋開場白
  const dead = !state.settings.model || chatGenFail.count >= 3;
  let changed = false;
  for (const s of state.succubi) {
    if (s.ntr || s.summoner?.taken) continue;
    const stuck = s.typing && Date.now() - s.typing.at > TYPING_STUCK_MS;
    if (!((s.typing && (dead || stuck)) || (s.wantsTalk && dead && isKanban(s.id)))) continue;
    const replying = !!s.typing;
    s.chatLine = { text: pick(CHAT_LINES[s.stage] || CHAT_LINES.stranger), t: Date.now() };
    s.wantsTalk = 0;
    s.typing = null;
    changed = true;
    if (replying) toast(`${s.name} 回你了`, "good");
  }
  return changed;
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
const THEMES = [["aqua", "霓虹水藍"], ["pink", "品紅魔宴"], ["green", "駭客終端"], ["amber", "琥珀映像管"], ["ice", "冰藍幽域"], ["day", "日光白晝(亮)"], ["sakura", "櫻花(亮)"], ["crimson", "緋紅煉獄"], ["violet", "紫電幽夢"], ["goldtemple", "鎏金聖殿"], ["mint", "薄荷幻境"], ["bloodmoon", "血月"], ["abyssocean", "深海遺跡"], ["cyber", "賽博霓虹"], ["toxic", "毒液螢光"], ["rosedusk", "玫瑰暮光"], ["steel", "鋼鐵黎明"], ["plumwine", "紫醉金迷"], ["jade", "翡翠幽光"], ["lavasunset", "熔岩夕燒"], ["lavender", "薰衣草夜"], ["copper", "赤銅機關"], ["voidabyss", "虛空深淵"], ["cherry", "桃夭"], ["forest", "幽林秘境"], ["ember", "餘燼"], ["glacier", "冰河極夜"], ["peacock", "孔雀藍"], ["bordeaux", "波爾多"], ["sulfur", "硫磺地獄"], ["indigo", "靛藍星圖"], ["coral", "珊瑚礁"], ["obsidian", "曜石"], ["aurora", "極光"], ["pumpkin", "南瓜燈"], ["sapphire", "藍寶石"], ["venom", "劇毒"], ["dawn", "曙光(亮)"], ["parchment", "羊皮紙(亮)"], ["mist", "晨霧(亮)"]];
const LIGHT_THEMES = new Set(["day", "sakura", "goldtemple", "mint", "rosedusk", "steel", "jade", "lavasunset", "lavender", "cherry", "forest", "glacier", "sulfur", "coral", "pumpkin", "dawn", "parchment", "mist"]);

// ===== 內容池(內建預設;之後歸 content/config.json 廠商件擴充)=====

const NAME_POOL = [
  "莉莉絲", "莫莉安", "賽蓮", "薇兒", "露露姆", "妮克絲", "卡蜜拉", "阿爾緹", "梅菲", "伊芙",
  "茉璃", "諾瓦", "蕾雅", "瑟菲", "米絲緹", "安潔", "露娜", "芙蘭", "黛拉", "琪亞",
  "奧莉薇", "珂賽特", "瑪儂", "艾莉緹", "桑妮雅", "菲歐娜", "莎夏", "尤莉", "伊索德", "梅露辛",
  "卡蓮", "緹雅", "雪莉", "悠梨", "綺羅", "汐音", "鈴蘭", "真白", "琉璃", "撫子",
];
const PERSONALITY_POOL = [
  "傲嬌", "慵懶", "黏人", "高冷", "天然", "毒舌", "害羞", "元氣", "腹黑", "溫柔",
  "三無", "嘴硬心軟", "古板認真", "神經質", "愛面子", "迷糊", "好勝", "憂鬱", "老成", "中二",
  "節儉", "吃貨", "潔癖", "膽小", "傲慢", "忠犬", "悶騷",
];
const SPEECH_POOL = ["敬語", "平語", "粗魯", "撒嬌"];
const TRAIT_POOL = {
  hair: ["silver_hair", "black_hair", "pink_hair", "blonde_hair", "blue_hair", "red_hair"],
  eyes: ["red_eyes", "gold_eyes", "blue_eyes", "purple_eyes", "green_eyes"],
  body: ["petite", "tall", "slender", "curvy"],
  extra: ["long_hair", "short_hair", "twin_tails", "ponytail"],
};
const SACRIFICE_POOL = ["迷路的冒險者", "落魄的商人", "自願的信徒", "酒館的醉漢", "負債的賭徒", "失戀的詩人", "貪婪的盜賊", "無名的流浪者", "可疑的煉金術士", "逃兵"];

// 背景故事:魅魔不是魔界來的,是被從現實世界召喚來的女子——
// 召喚當下由核心擲骰生成並寫入存檔,人設永遠一致,AI 只負責「演」它。
// 每項 = [職業, 人生描述, [早/午/下午/晚 作息]]
const JOB_POOL = [
  ["女高中生", "每天搭電車通學、和同學混社團,考試前才熬夜抱佛腳",
    ["在教室上課、偷傳紙條", "和同學擠在頂樓吃便當", "社團活動揮汗", "補習班或回家寫作業"]],
  ["大學生", "住便宜小套房,靠打工和獎學金過活,報告永遠拖到最後一天",
    ["睡到快遲到才衝去上課", "學餐隨便扒兩口", "泡圖書館趕永遠寫不完的報告", "打工或系上聚餐"]],
  ["便利商店大夜班店員", "習慣了凌晨四點的城市,收銀速度是店裡最快的",
    ["剛下大夜班回家補眠", "睡得正熟", "傍晚才起床發呆", "準備上工、清點貨架"]],
  ["護理師", "在醫院輪三班,腳很痠,但被病人道謝時會偷偷開心",
    ["交接查房、忙得團團轉", "匆忙扒兩口冷掉的飯", "換藥打針跑不停", "下班累癱或接著上夜班"]],
  ["咖啡店店員", "拉花有兩下子,記得每個熟客的口味",
    ["開店磨豆、預熱機器", "出餐尖峰手忙腳亂", "顧店、偷練拉花", "打烊清潔擦桌子"]],
  ["上班族 OL", "每天擠地鐵、開不完的會,錢包裡塞滿超商集點貼紙",
    ["擠地鐵進辦公室", "和同事吃午餐配八卦", "開一場又一場的會", "加班或下班小酌"]],
  ["接案插畫家", "日夜顛倒,交稿前會變成另一種生物",
    ["昨晚爆肝、現在補眠中", "起床邊吃邊改稿", "畫圖畫到忘記時間", "進入交稿前的衝刺地獄"]],
  ["偶像練習生", "練舞到深夜,夢想站上大舞台,飲食控制得很辛苦",
    ["晨間發聲練習", "控制熱量的清淡午餐", "練舞練到腿軟", "上唱歌課、自主加練"]],
  ["圖書館員", "喜歡書頁的味道,對吵鬧的人會用眼神殺人",
    ["上架整理新書", "在員工休息室安靜吃飯", "幫讀者找書、蓋章", "閉館前盤點巡場"]],
  ["電競隊青訓選手", "手速驚人、作息毀滅,講話夾雜遊戲梗",
    ["補眠中(昨晚排位到天亮)", "起床邊吃邊打幾把", "團隊訓練賽", "直播或複盤到深夜"]],
  ["麵包店學徒", "凌晨三點起床揉麵,身上總有一股奶油香",
    ["凌晨就在揉麵、顧烤箱", "收拾忙碌的早晨", "回去補個眠", "備料、發酵準備明天"]],
  ["家裡蹲網路寫手", "足不出戶,靠外送維生,深夜論戰從沒輸過",
    ["還在睡", "醒來配泡麵當早午餐", "追劇、逛論壇筆戰", "開始碼字戰到深夜"]],
  ["花店店員", "指尖總有花草味,能背出每種花的花語,但不太信那一套",
    ["清晨去批發市場挑花", "修剪、換水、整理花桶", "包客人訂的花束", "打烊前把賣剩的花帶回家插"]],
  ["甜點師學徒", "夢想開自己的店,手臂上有好幾道烤盤燙疤",
    ["提早進廚房備料", "站著吃兩口員工餐", "練習擠花與調溫巧克力", "留下來洗一座山的模具"]],
  ["深夜電台DJ", "聲音好聽得犯規,聽眾的煩惱信她每封都讀",
    ["節目剛下、睡得正沉", "起床吃早午餐配聽眾來信", "選歌、寫腳本", "進棚準備開麥"]],
  ["健身教練", "肌肉線條漂亮,對飲食控制超嚴格,但深夜偷吃炸雞",
    ["帶晨間團課", "水煮餐+蛋白粉", "一對一私教課", "自主訓練、關店前擦器材"]],
  ["補習班國文老師", "改作文改到深夜,金句隨口就來,私下講話很毒",
    ["補眠(昨晚改考卷到三點)", "備課、印講義", "連上三堂課喉嚨冒煙", "晚班課+留下來被學生問問題"]],
  ["動物園飼育員", "身上常沾著飼料味,動物比人好懂是她的口頭禪",
    ["餵食巡舍、鏟不完的便", "躲在後場吃便當", "健康檢查、陪動物玩", "寫觀察日誌、跟夜班交接"]],
  ["街頭吉他手", "在天橋下唱自己寫的歌,吉他袋裡的零錢是全部收入",
    ["睡到中午", "邊吃邊寫歌詞", "找點位練唱", "黃金時段開唱到末班車"]],
  ["遊戲公司美術", "為了改一顆按鈕加班三天,滑鼠手很嚴重",
    ["擠電梯進公司開晨會", "叫外送配螢幕吃", "改稿、改稿、再改稿", "加班或準時落跑打自己的遊戲"]],
  ["婚紗店造型師", "見過幾百個新娘哭著笑,自己卻沒談過像樣的戀愛",
    ["準備今天的新娘妝髮", "在婚宴後台隨便吃", "跟妝、補妝、救場", "收工具、預約明天的新娘"]],
  ["巫女", "在小神社打工幫忙,掃不完的落葉,對神明的存在半信半疑",
    ["掃參道、開社務所", "在簷廊吃飯糰", "賣御守、接待參拜客", "關門前巡一圈、餵神社的貓"]],
  ["小劇場演員", "白天打工晚上排戲,台詞背得比誰都熟,存摺比誰都薄",
    ["咖啡店打工中", "啃飯糰背台詞", "進排練場排戲", "演出或排到深夜"]],
  ["計程車夜班司機", "城市的深夜她全認得,聽過上千個醉客的人生故事",
    ["剛交班、睡覺中", "睡到自然醒吃早午餐", "保養車、小睡儲備體力", "出車,跑到天亮"]],
  ["漁港攤販女兒", "凌晨的魚市場長大,殺魚俐落,聲音天生比人大",
    ["魚市場幫忙叫賣", "收攤後補眠", "幫家裡記帳、送貨", "早早睡,凌晨三點要起"]],
  ["寵物美容師", "被貓抓狗咬是日常,還是覺得毛小孩比人可愛",
    ["開店消毒、確認預約", "抱著店貓吃午餐", "洗剪吹、被掙扎的柯基襲擊", "打掃滿地的毛、關店"]],
  ["檔案室公務員", "在地下室管檔案,安靜到能聽見日光燈的聲音,蓋章蓋得行雲流水",
    ["打卡、開燈、開始歸檔", "在茶水間吃自己帶的便當", "調卷、蓋章、被借閱單淹沒", "準時下班是唯一的堅持"]],
  ["調酒師", "記得住兩百種酒譜和熟客的失戀故事,自己滴酒不沾",
    ["睡到中午", "備料、切檸檬角", "開店前試新酒譜", "站吧檯,聽人講心事到打烊"]],
  ["天文台研究助理", "熬夜看星星是工作,許願是給觀測順利用的",
    ["觀測剛結束、補眠中", "起床整理昨晚的數據", "寫報告、校準儀器", "上山,準備今晚的觀測"]],
];
const ATTITUDE_POOL = [
  "對突然被召喚到這裡感到莫名其妙,滿腦子想著原本的生活",
  "嘴上抱怨自己被綁架了,心裡卻對這個奇怪的地方有一點點好奇",
  "非常不情願,認為這是非法拘禁,三不五時揚言要告你",
  "半信半疑,懷疑這是整人節目,或只是一場還沒醒的夢",
  "意外地看得開,覺得反正原本的日子也過膩了",
  "表面上配合,其實一直在暗中觀察這裡有沒有逃跑路線",
  "比起自己的處境,更擔心原本世界裡沒人餵的貓",
  "乾脆當成免費長假,順便逃避原本世界堆著的爛攤子",
  "認定召喚她的人遲早會後悔,抱著看好戲的心態住下來",
  "出乎意料地興奮,覺得這比原本一成不變的日子刺激多了",
];
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
  const entry = JOB_POOL.find(([j]) => j === job);
  const acts = entry?.[2] || ["過著自己的生活", "吃頓飯歇口氣", "忙自己的事", "度過一個平凡的夜晚"];
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
let dateChooser = false; // 詳情頁展開約會地點（僅舊自由聊路徑）
let dateFlow = null;     // 牌制：{ girlId, phoneCost, venueId } 已接通並抽好地點，待確認是否付費前往
let severChooser = false; // 詳情頁展開「破除纏身」祭品選擇
let lastSleepState = null;

function defaultState() {
  return {
    gold: 0,
    quests: [],   // {id, text, lv:0|1|2, startedAt?, deadline?}
    discover: null, // {day, count} 每日發現獎勵計數
    expansions: {}, // 擴充等級(8 軸,見 EXPANSIONS);名額/格數等由此推導
    dismiss: null,  // {day, price} 今日遣散費
    succubi: [],  // 見 summon()
    dungeon: [],  // [{name}]
    shop: null,   // {day, stock:[{id,name,price,sold}], line} 祭品商店
    // v6 互動牌制（勿與祭品 shop 混淆）
    cardInventory: {},   // cardId → { count, unlocked? }
    cardDeck: [],        // 出戰牌組 cardId[]（商店頁編輯；開戰直接用）
    deckPresets: [],     // 預留多套牌組
    cardShop: null,      // { nextRefreshAt, slots:[{cardId,price,sold,isSale,salePrice?}] }
    cardSession: null,   // 當前牌桌 session（見 card_engine）
    // 綁定「上線槽」：與 registry.active + liveEpoch 不一致時硬清牌進度
    cardsLive: { packId: null, epoch: 0 },
    bubbleAff: { day: null, byGirl: {} }, // M2 氣泡情感日 cap { day, byGirl: { id: used } }
    playerProfile: {
      name: "", body: "", look: "", habit: "",
      prefs: [], quiz: {},
      starterSpeechCardId: null, cardPlayerLv: 0,
      onboardDone: false, // 創角完成（含無 starter 池直接進）
    },
    kanbans: [],        // 在任看板娘 [{id, until}](多看板娘制;until=到期時間戳)
    lastKanbanId: null, // 最後一位看板娘(全過期後背景顯示她的休息剪影)
    lastSettledDay: null,
    log: [],
    settings: {
      player: "", sleepStart: "01:00", sleepEnd: "06:00", theme: "aqua",
      // llmProvider: "ollama" | "grok-build"(無頭訂單;舊 xai/grok 會自動映射)
      llmProvider: "ollama",
      ollamaUrl: "http://localhost:11434", model: "", rating: "nsfw",
      // 織夢生圖那台(顯卡主機)。跟 ollamaUrl 一樣是「別台機器的位址」——
      // 伺服器不會知道,只能由這裡填進去。留空 = 用伺服器的 COMFY_URL 預設。
      comfyUrl: "",
      // 生圖走哪條:"comfy"(本機顯卡,召喚出三連拍)或 "grok-img"(雲端,單張)
      imgProvider: "grok-img",
      // 舊欄位:全局 Comfy checkpoint。已改為「每位妹子 s.comfyCkpt 自帶模型」,
      // 生圖不再讀這個;保留只為舊存檔相容,可忽略。
      comfyCkpt: "",
      cardColors: null,   // null = 主題預設;{exec|found|acc|vn: {color,opacity}}
      cardCenter: false,  // 卡牌文字水平置中
      cardFontScale: 1,   // 卡牌文字大小倍率(0.7~1.6)
      tabOpacity: 1,
      bgImages: [], bgIndex: 0, bgInterval: 5,
      features: { cardSystem: true },
    },
  };
}

function cardSystemOn() {
  return !!(state?.settings?.features?.cardSystem !== false && Cards.cardsReady());
}

/** M6：自由輸入長聊是否已退役（牌制開 = 是；history 仍可只讀） */
function freeChatRetired() {
  return cardSystemOn() || !!(state?.settings?.features?.freeChatRetired);
}

/**
 * 清掉淫紋／自由聊殘狀態，避免亮燈卻點不進、或背景仍下 chat 單。
 * 不刪 s.history（只讀檔案）。
 */
function retireFreeChatState() {
  for (const s of state.succubi || []) {
    s.wantsTalk = 0;
    s.chatLine = null;
    s.chatSess = null;
    s.typing = null;
  }
  // 若卡在舊全螢幕自由聊，踢回主畫面（觀戰／獻祭另有 watchWith／sacrificeWith）
  if (chatWith && chatSession?.type === "chat" && !watchWith && !sacrificeWith) {
    chatWith = null;
    chatSession = null;
    document.body.classList.remove("chat-mode");
  }
}

/** 牌桌／約會互動算「見過她」——餵舊 need 時鐘 */
function touchInteractDay(girl) {
  if (!girl) return;
  girl.lastChatDay = dayNum();
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
  // 全域 NSFW：取消 SFW 路徑，舊存檔也強制
  state.settings.rating = "nsfw";
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
  // 多看板娘制移轉:單一 kanbanId/kanbanUntil → kanbans 陣列
  state.kanbans ??= [];
  if (state.kanbanId && state.kanbanUntil && !state.kanbans.some(k => k.id === state.kanbanId)) {
    state.kanbans.push({ id: state.kanbanId, until: state.kanbanUntil });
  }
  delete state.kanbanId; delete state.kanbanUntil;
  // 氣泡快取移轉:單看板娘物件 → 依 girlId 的 map
  if (state.quips && state.quips.girlId) {
    state.quips = { [state.quips.girlId]: { hash: state.quips.hash, lines: state.quips.lines || [], got: state.quips.got || [] } };
  }
  state.quips ??= {};
  // v6 牌制移轉
  state.cardInventory ??= {};
  state.cardDeck ??= [];
  state.deckPresets ??= [];
  state.cardShop ??= null;
  state.cardSession ??= null;
  state.cardsLive ??= { packId: null, epoch: 0 };
  if (state.cardSession) Cards.normalizeSessionPhase?.(state.cardSession);
  state.bubbleAff ??= { day: null, byGirl: {} }; // M2 氣泡情感日 cap
  state.playerProfile = {
    name: "", body: "", look: "", habit: "",
    prefs: [], quiz: {},
    starterSpeechCardId: null, cardPlayerLv: 0,
    onboardDone: false,
    ...(state.playerProfile || {}),
  };
  state.playerProfile.prefs ??= [];
  state.playerProfile.quiz ??= {};
  // 舊存檔已有底色 → 視為創角完成；無 starter 的 NSFW 包用 onboardDone
  if (state.playerProfile.starterSpeechCardId) state.playerProfile.onboardDone = true;
  else state.playerProfile.onboardDone = !!state.playerProfile.onboardDone;
  if (!state.playerProfile.name && state.settings?.player) {
    state.playerProfile.name = state.settings.player;
  }
  // M6：牌制預設開；自由聊天主路徑退役（history 只讀保留，見 retireFreeChatState）
  // cardSceneArt：出卡後依她回應生場景圖（實驗，可關）
  state.settings.features = {
    cardSystem: true,
    freeChatRetired: true,
    cardSceneArt: true,
    ...(state.settings.features || {}),
  };
  // 舊存檔若曾手動關牌制，仍尊重 cardSystem:false；其餘強制退役自由聊
  if (state.settings.features.cardSystem !== false) {
    state.settings.features.freeChatRetired = true;
  }
  if (Cards.cardsReady()) {
    // 上線槽硬切：pack / epoch 變了就清空玩家牌進度（與伺服器 activate 對齊）
    const meta = Cards.activePackMeta?.() || {};
    const packId = meta.packId || CARDS_PACK_INFO?.packId || null;
    const epoch = meta.liveEpoch ?? CARDS_PACK_INFO?.liveEpoch ?? 0;
    const bind = Cards.bindLivePack?.(state, packId, epoch);
    if (bind?.wiped) {
      console.info("[cards] live pack cutover wiped player card progress", bind);
      log(
        `上線牌組切換：${bind.from || "（無）"} → ${bind.to || "?"}（epoch ${bind.epoch ?? epoch}），已清空牌庫／貨架／創角話術`,
      );
      // toast 在 render 前可能被蓋；進場後再提醒
      setTimeout(() => {
        try {
          toast("已換上線牌組：牌庫與貨架已清空，請重抽基礎話術", "bad");
        } catch { /* */ }
      }, 400);
    }
    Cards.ensureStarterFallback(state);
    Cards.pruneDeck?.(state);
  }
  if (cardSystemOn()) {
    retireFreeChatState();
  }
  // 召喚師系統移轉:舊魅魔補發抽取間隔
  for (const s of state.succubi) {
    // M5：CG cache 欄位；立繪同步進 portrait:* key
    s.cardCg ??= {};
    syncPortraitCgCache(s);
    if (s.summoner === undefined) s.summoner = null;
    if (s.nextDraw == null) { s.drawIvlH = randInt(2, 5); s.nextDraw = Date.now() + s.drawIvlH * HOUR; }
    if (!s.gift) s.gift = pick(GIFT_KEYS);
    // 飢渴移轉:舊魅魔沒有這欄,不補的話 craveValue 會永遠停在 0
    if (!s.crave) s.crave = { v: randInt(0, 25), at: Date.now() };
    // 交配環系統移轉:舊 summoner.affection(0~240)→ stage/resist/matingCount/kinks
    const sm = s.summoner;
    if (sm && sm.stage == null) {
      sm.stage = affToStageIdx(sm.affection || 0);
      sm.resist = STAGE_RESIST[sm.stage];
      sm.matingCount = 0;
      sm.ringUnlocked = false;
      if (!sm.kinks) sm.kinks = KINKS.length ? sampleN(KINKS.map(k => k.name), randInt(4, 10)) : [];
      delete sm.affection;
    }
  }
  showConnOverlay(false);
  document.getElementById("set-srv").textContent = offline ? "離線(使用本地快取)" : "OK";
  settleOffline();
  settleDays();
  ensureShop();
  renderAll();
  applyBg();
  startBgRotation();
  // 重整後若 cardSession 還在：自動打開牌桌，避免「有牌局卻看不到、又不能換看板」
  try {
    const rec = resumeOrRecoverCardSession({ forceUi: true, silent: false });
    if (rec?.resumed) {
      renderCardTable();
      renderCrests();
    } else if (rec?.closed) {
      renderAll();
    }
  } catch (e) {
    console.warn("recover card session failed", e);
  }
  // testword「約會（隨機妹子）」：sessionStorage 旗標 → 跳過電話直接開桌
  try { consumeQuickDateTest(); } catch (e) {
    console.warn("quick date test failed", e);
  }
  // 本機 Comfy:進遊戲就抓 checkpoint 清單,舊妹子補綁專屬模型
  if (!offline && imgProvider() === "comfy") {
    refreshComfyCkpts({ force: true }).then(ok => {
      if (ok) assignMissingGirlCkpts();
    });
  }
  if (offline) {
    toast("目前離線,進度會在恢復連線後自動同步", "bad");
    dirty = true;              // 讓 saveNow 的重試迴圈持續嘗試回推
    saveTimer = setTimeout(saveNow, 5000);
  } else {
    cacheLocal();
    simSync();   // 進場即向伺服器要召喚師模擬的最新狀態(關機期間的判定/act 都補回來)
  }
}

/**
 * testword 快速約會：讀 yoro_quick_date，清障後 openDateTable。
 * 旗標一次性消費；失效／找不到人就 toast 並放棄。
 */
function consumeQuickDateTest() {
  let raw;
  try { raw = sessionStorage.getItem("yoro_quick_date"); } catch { return; }
  if (!raw) return;
  try { sessionStorage.removeItem("yoro_quick_date"); } catch { /* */ }

  let payload;
  try { payload = JSON.parse(raw); } catch {
    toast("快速約會旗標損壞", "bad");
    return;
  }
  const girlId = payload?.girlId;
  const venueId = payload?.venueId || "park";
  const force = !!payload?.force;
  // 超過 5 分鐘視為過期（防舊分頁誤觸）
  if (payload?.ts && Date.now() - payload.ts > 5 * 60 * 1000) {
    toast("快速約會旗標已過期——請在 testword 再按一次", "bad");
    return;
  }
  if (!cardSystemOn()) {
    toast("卡牌系統未就緒，無法開快速約會", "bad");
    return;
  }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s) {
    toast("快速約會：找不到那隻妹子（存檔不同步？）", "bad");
    return;
  }
  if (s.ntr) {
    toast(`${s.name} 已是 NTR 狀態，無法約`, "bad");
    return;
  }
  // 清卡住的牌局
  if (Cards.sessionActive(state) || state.cardSession) {
    try { Cards.closeSession?.(state, "quick_date_test"); } catch { /* */ }
    state.cardSession = null;
    document.body.classList.remove("card-mode");
  }
  // 下看板
  if (isKanban(s.id)) {
    state.kanbans = (state.kanbans || []).filter(k => k.id !== s.id);
  }
  if (s.summoner?.taken) delete s.summoner.taken;

  // 延後一幀：等 resumeOrRecover / render 完再進桌
  setTimeout(() => {
    openDateTable(s.id, venueId, { force });
    if (state.cardSession?.mode === "date" && state.cardSession.girlId === s.id) {
      toast(`🧪 測試約會：${s.name} @ ${venueId}`, "good");
    }
  }, 60);
}

let bootFailed = false;   // 存檔載入/渲染爆掉 → 臨時全新狀態、且不自動存(保住伺服器上的舊檔待修)
async function load() {
  try {
    await CARDS_LOAD;
    try { renderSettings?.(); } catch { /* boot 順序：可能尚無 state */ }
  } catch { /* 牌制內容載失敗仍可跑舊路徑 */ }
  let j;
  try {
    j = await fetchSave();                 // 網路層:真的連不上才進這個 catch
  } catch (e) {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) { try { initState(JSON.parse(cached), true); return; } catch { } }
    showConnOverlay(true);
    setTimeout(load, 3000);
    return;
  }
  try {
    initState(j, false);                   // 拿到伺服器資料:初始化 + 渲染
  } catch (e) {
    // 存檔損壞/不相容導致渲染爆掉——別無限轉圈,也別覆蓋伺服器上的舊檔(留著待修)
    console.error("存檔載入失敗(可能損壞或不相容):", e);
    bootFailed = true;
    showConnOverlay(false);
    try { version = j.version; state = defaultState(); renderAll(); applyBg(); } catch { }
    toast("⚠ 存檔載入失敗,已用臨時全新狀態開啟(未覆蓋舊檔)。可開 /testword 按「重設存檔」急救。", "bad");
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
      state.settings.rating = "nsfw";
    }
    document.getElementById("set-srv").textContent = "OK";
  } catch { }
  settleOffline();
  settleDays();
  ensureShop();
  renderAll();
});

function scheduleSave() {
  if (bootFailed) return;   // 存檔載入失敗的臨時狀態:絕不寫回,保住伺服器上的舊檔
  dirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 800);
}

// 同時只允許一筆存檔在飛:兩筆重疊時後者會帶著已經過期的 base_version 送出 → 409,
// 而 409 的處理是「載入伺服器版本」,等於把這 1 秒內的新進度沖掉(送出訊息→跳出對話
// 這種連續動作最容易踩到)。有請求在飛就排下一輪,等新 version 回來再送。
let saveInFlight = false;
async function saveNow(keepalive = false) {
  if (bootFailed || !dirty || !state) return;
  if (saveInFlight && !keepalive) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); return; }
  saveInFlight = true;
  dirty = false;
  let failed = false;
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
    failed = true;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 5000);
  } finally {
    saveInFlight = false;
    // 這筆在飛的期間又有新進度 → 立刻補一輪(帶著剛拿到的新 version,不會 409)
    if (dirty && !failed) { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 300); }
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

// 委託快照:給 AI 看的真實待辦(唯讀素材,AI 只評論,碰不到任何數字)
function questSnapshot() {
  const cut = t => (t.length > 30 ? t.slice(0, 30) + "…" : t);
  const now = Date.now();
  return {
    discovered: state.quests.filter(q => q.lv === 0).slice(-6).map(q => cut(q.text)),
    accepted: state.quests.filter(q => q.lv === 1).slice(-6).map(q => cut(q.text)),
    executing: execQuests().map(q => ({ title: cut(q.text), mins_left: Math.max(0, Math.round((q.deadline - now) / 60000)) })),
  };
}
// 委託狀態指紋:變了就作廢已生成的氣泡(避免她講已完成/已丟棄的任務)
function questHash() { return state.quests.map(q => q.id + ":" + q.lv).join(","); }

// ===== 點名機制:她「盯」一件他的委託(規格見 docs/relationship-axes.md)=====
// 底線:她只能盯清單裡已經有的一件,不能發明新任務——state.quests 是玩家真實人生的待辦,
// 用 AI 幻覺污染它是不能開的口子。嘴上順口講的小事(「順便買醬油」)留在台詞裡,不進系統。
const ERRAND_STAGE = { stranger: 0, friend: 0.5, girlfriend: 1, wife: 1 };   // 點名機率
const ERRAND_BONUS = { friend: 1, girlfriend: 2, wife: 2 };                  // 做完給的好感

// 遊戲挑件(不讓 AI 挑,更不讓它輸出結構化資料):
// 剩時間最短的執行中 > 承接最久沒動的 > 隨機一件發現池的
function chooseErrandQuest() {
  const exec = execQuests().slice().sort((a, b) => a.deadline - b.deadline);
  if (exec.length) return exec[0];
  const acc = state.quests.filter(q => q.lv === 1);
  if (acc.length) return acc[0];         // state.quests 依加入順序,[0] = 最久沒動的
  const found = state.quests.filter(q => q.lv === 0);
  return found.length ? pick(found) : null;
}

function errandStatusText(q) {
  if (q.lv === 2) return `執行中,剩 ${Math.max(0, Math.round((q.deadline - Date.now()) / 60000))} 分`;
  if (q.lv === 1) return "已承接,還沒動工";
  return "剛發現,還沒決定要不要接";
}

/** 生成她的台詞前呼叫:確保 s.errand 有效。回傳給 prompt 用的物件,階段不允許時回 null。 */
function ensureErrand(s) {
  if (!s || s.ntr) return null;
  const chance = ERRAND_STAGE[s.stage] ?? 0;
  if (!chance) { s.errand = null; return null; }

  // 舊 pin 還指向一件存在且未完成的委託 → 沿用(這樣「追問」才有意義)
  let q = s.errand && state.quests.find(x => x.id === s.errand.qid);
  if (q) {
    s.errand.text = q.text;                       // 委託被改名時跟著更新
  } else {
    if (Math.random() >= chance) { s.errand = null; return null; }
    q = chooseErrandQuest();
    if (!q) { s.errand = null; return null; }
    s.errand = { qid: q.id, text: q.text, day: dayNum(), asked: false, late: false };
    dirty = true;
  }
  return {
    text: s.errand.text,
    status: errandStatusText(q),
    // 女友才追問「上次交代的做了沒」;妻子不追問(當他會做),朋友也不追問
    asked: s.stage === "girlfriend" && s.errand.asked,
    late: s.stage === "wife" && !!s.errand.late,
  };
}

/** 她真的把這件講出去了 → 記下來,下次才知道要不要追問 */
function markErrandAsked(s) {
  if (s?.errand && !s.errand.asked) { s.errand.asked = true; dirty = true; }
}

/** 委託完成時:誰盯著這件,誰加好感(嘴上答應不算數,做完才算) */
function errandReward(qid) {
  for (const s of state.succubi) {
    if (s.errand?.qid !== qid) continue;
    const base = ERRAND_BONUS[s.stage] || 1;
    const d = applyAffection(s, base);
    log(`${s.name} 盯的「${s.errand.text}」完成了 情感 +${d}`);
    toast(`${s.name} 交代的事做完了!情感 +${d}`, "good");
    s.errand = null;
    dirty = true;
  }
}

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
  // M2：發現 → 氣泡 15%；舊路徑仍 crest
  if (cardSystemOn()) questBubbleRoll("discover", text);
  else crestRoll();
  scheduleSave(); renderAll();
}

function accept(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 1;
  if (cardSystemOn()) questBubbleRoll("accept", q.text);
  else crestRoll();
  scheduleSave(); renderAll();
}

function start(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q || execQuests().length >= execCap()) return;
  q.lv = 2;
  q.startedAt = Date.now();
  q.deadline = q.startedAt + QUEST_HOURS * HOUR;
  log(`開始執行「${q.text}」(期限 ${QUEST_HOURS}h)`);
  // 規格鎖死：氣泡只有 discover/accept/complete 三點；「開始執行」不擲
  // 舊淫紋路徑仍可在開始時亮燈（相容）
  if (!cardSystemOn()) crestRoll();
  scheduleSave(); renderAll();
}

function complete(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  const g = rollReward();
  state.gold += g;
  const qText = q.text;
  state.quests = state.quests.filter(x => x.id !== id);
  log(`完成「${qText}」 +${g} 金`);
  toast(g >= 19 ? `大豐收!委託完成 +${g} 金!!` : `委託完成!+${g} 金`, "good");
  errandReward(id);   // 有人盯著這件的話,她要的東西做到了
  if (cardSystemOn()) {
    // 牌制：完成用 15% 氣泡，不再固定罐頭 + 淫紋進聊天
    questBubbleRoll("complete", qText);
  } else {
    kanbanReact("complete");
    crestRoll();
  }
  scheduleSave(); renderAll();
}

// 超時:扣違約金、退回已承接池(現實待辦不會消失,只是這次沒趕上)
function failQuest(q, silent = false) {
  const pen = randInt(1, 6);
  state.gold -= pen;
  q.lv = 1;
  delete q.startedAt; delete q.deadline; delete q._warned;
  log(`「${q.text}」超時,違約金 -${pen} 金,退回委託板`);
  if (!silent) { toast(`「${q.text}」超時!違約金 -${pen} 金,已退回委託板`, "bad"); kanbanReact("fail"); }
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
  // 委託沒了,盯著它的 pin 一併失效(下次生成台詞時重挑)
  for (const s of state.succubi) if (s.errand?.qid === id) s.errand = null;
  scheduleSave(); renderAll();
}

// (點兩下編輯/退回已移除——提示拿掉後成了看不懂的意外行為;卡片只吃滑動手勢)

function settleOffline() {
  const now = Date.now();
  const expired = execQuests().filter(q => now >= q.deadline);
  if (!expired.length) return;
  const before = state.gold;
  for (const q of expired) failQuest(q, true);
  toast(`離線結算:${expired.length} 件委託超時,違約金 -${before - state.gold} 金,已退回委託板`, "bad");
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

// 儀式演出開關:false = 確認後直接結算,不跑六句 VN(暫時關閉,之後要改演出再打開)
const SAC_RITUAL = false;

// ── 魅魔獻祭 ──
// 規則:
//  1. 隨時可獻祭,沒有等待期(原本的「召喚後須過一天」已取消)。
//  2. SAC_RITUAL=true 時才需要預織文:每晚睡眠時段(預設 01:00 起)為缺文的魅魔
//     在背景織好 6 句存入 s.sacScript,儀式直接讀取播放。
//  3. SAC_RITUAL=false(現行)不顯示任何文字,故不織文、也不拿文擋住獻祭。

const SAC_SCENE_LABELS = ["準備", "獻祭", "收尾"];

function sacScriptReady(s) {
  const sc = s?.sacScript;
  return !!(sc?.ready && sc.pages?.length === 6 && sc.pages.every(p => p && p.text));
}

// 隨時可獻祭:不再要求「召喚後過一天」,不演出時也不要求獻祭文
// (沒有文字要播,拿「文沒織好」擋住獻祭沒有道理)
function canSacrifice(s) {
  return !!(s && !s.ntr && (!SAC_RITUAL || sacScriptReady(s)));
}

/** 按鈕/ toast 用的阻擋原因(可發動時回 "") */
function sacrificeBlockReason(s) {
  if (!s || s.ntr) return "無法獻祭";
  if (SAC_RITUAL && !sacScriptReady(s)) return "獻祭文尚未備妥(01:00 起織夢)";
  return "";
}

/** 確保 s.sacScript 殼層存在(挑好手法 + 開場 + 六頁空位) */
function ensureSacScriptShell(s) {
  if (s.sacScript?.pages?.length === 6) return s.sacScript;
  const method = (SACRIFICE.methods && SACRIFICE.methods.length)
    ? pick(SACRIFICE.methods)
    : { name: "魔法陣獻祭", prep: null, ritual: null, finale: null };
  const opening = (SACRIFICE.opening || "{name} 被帶到了祭壇前,眼神帶著疑惑。")
    .replaceAll("{name}", s.name);
  s.sacScript = {
    method,
    opening,
    pages: Array.from({ length: 6 }, () => ({ text: null })),
    ready: false,
    startedAt: Date.now(),
  };
  return s.sacScript;
}

function sacSceneOf(idx) {
  const sc = Math.floor(idx / 2);           // 0 準備 / 1 獻祭 / 2 收尾
  const label = SAC_SCENE_LABELS[sc] || "準備";
  return { sc, label, isDesc: idx % 2 === 0 };
}

function sacCannedDesc(label, name, body) {
  if (body) return body;
  return ({ "準備": `祭壇的紋路亮起,${name} 被引到了魔法陣中央。`,
            "獻祭": `力量順著紋路攀升,一寸寸自 ${name} 的身上抽離。`,
            "收尾": `光芒散去,${name} 的身影靜靜癱軟、消融。` })[label] || "儀式繼續進行。";
}
function sacCannedResp(label, name) {
  return ({ "準備": "「……這是要做什麼?放開我。」",
            "獻祭": "「唔……不、不要……!」",
            "收尾": "她再也發不出聲音,身子軟軟地垂了下去。" })[label] || "「……」";
}

function sacCannedForPage(s, idx) {
  const { sc, label, isDesc } = sacSceneOf(idx);
  const method = s.sacScript?.method || {};
  const script = [method.prep, method.ritual, method.finale][sc] || "";
  const body = script.replaceAll("{name}", s.name);
  return isDesc ? sacCannedDesc(label, s.name, body) : sacCannedResp(label, s.name);
}

/** 組出第 idx 頁(0~5)的 LLM messages;描述頁讀腳本,反應頁讀前一頁旁白 */
function sacPageMsgs(s, idx) {
  const rating = state.settings.rating || "nsfw";
  const char = { name: s.name, personality: s.personality, backstory: s.backstory };
  const { sc, label, isDesc } = sacSceneOf(idx);
  const method = s.sacScript.method || {};
  const script = ([method.prep, method.ritual, method.finale][sc] || "").replaceAll("{name}", s.name);
  if (isDesc) {
    const dctx = { world: WORLD_LORE, content_rating: rating, character: char,
                   method_name: method.name, scene_label: label, scene_stage: sc + 1, scene_script: script };
    return [
      { role: "system", content: buildSacScenePrompt(dctx) },
      { role: "user", content: `讀入本場景「${label}」的腳本,寫 1~2 句第三人稱旁白描述這一段。只輸出旁白。` },
    ];
  }
  const narration = s.sacScript.pages[idx - 1]?.text || "";
  const rctx = { world: WORLD_LORE, content_rating: rating, character: char,
                 scene_label: label, scene_stage: sc + 1, narration };
  return [
    { role: "system", content: buildSacReactPrompt(rctx) },
    { role: "user", content: `讀入上面的旁白,寫出「${s.name}」此刻的反應(台詞或肢體),1~2 句。` },
  ];
}

/** 無模型:睡眠時段一次用罐頭填滿,讓沒 Ollama 也有獻祭文可播(僅 SAC_RITUAL=true 時用得到) */
function fillSacCanned(s) {
  const sc = ensureSacScriptShell(s);
  if (sc.ready) return;
  for (let i = 0; i < 6; i++) {
    if (!sc.pages[i].text) sc.pages[i].text = sacCannedForPage(s, i);
  }
  sc.ready = true;
}

/**
 * 睡眠時段(預設 01:00 起)背景預織獻祭文。
 * - 有模型:走 /api/gen 代工佇列,鎖屏也照跑;每 tick 最多推進幾頁。
 * - 無模型:罐頭一次填滿。
 * 生成完成寫入 s.sacScript,存檔備用;儀式發動時直接讀取。
 */
async function genSacOrders() {
  if (!SAC_RITUAL) return;   // 不演出:沒有文字要播,別每晚白織一輪
  if (!state || !isAsleep()) return;
  let budget = 3;   // 每輪最多收/下幾頁,避免把聊天/觀戰代工塞爆
  for (const s of state.succubi) {
    if (budget <= 0) break;
    if (s.ntr) continue;
    if (sacScriptReady(s)) continue;
    ensureSacScriptShell(s);

    // 無模型 → 罐頭直接備妥
    if (!state.settings.model) {
      fillSacCanned(s);
      dirty = true; scheduleSave();
      continue;
    }

    const pages = s.sacScript.pages;
    for (let i = 0; i < 6; i++) {
      if (pages[i]?.text) continue;
      // 反應頁必須等描述頁先到
      if (i % 2 === 1 && !pages[i - 1]?.text) break;
      const key = `sac:${s.id}:${s.sacScript.method?.name || "m"}:${i}:${strHash(pages[i - 1]?.text || s.name)}`;
      const r = await genPost(key, sacPageMsgs(s, i));
      if (!r) break;
      if (r.status === "done" && r.result) {
        pages[i].text = (r.result.split("\n").slice(0, 4).join("\n") || r.result).slice(0, 500).trim();
        if (!pages[i].text) pages[i].text = sacCannedForPage(s, i);
      } else if (r.status === "error") {
        // 生成失敗不卡死:這頁用罐頭,其餘頁下輪繼續
        pages[i].text = sacCannedForPage(s, i);
      } else {
        break;   // pending/running:等下輪
      }
      if (pages.every(p => p?.text)) s.sacScript.ready = true;
      dirty = true; scheduleSave();
      budget--;
      break;   // 每隻每輪最多推進一頁
    }
  }
}

// 魅魔獻祭:SAC_RITUAL=true 時讀取預織的 sacScript 播放 VN(開場 → 六句)→「完成獻祭」結算;
// SAC_RITUAL=false(現行)確認後直接結算,不生成、不顯示任何文字,結果只走 log/toast。
async function sacrificeSuccubus(id) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || s.ntr) return;
  const block = sacrificeBlockReason(s);
  if (block) { toast(block, "bad"); return; }
  const price = dismissPriceToday();
  if (state.gold < price) { toast(`今日獻祭費 ${price} 金,你付不起`, "bad"); return; }
  if (!confirm(`獻祭 ${s.name}?\n費用 ${price} 金。她將被獻給地獄惡魔,永遠消失。`)) return;
  state.gold -= price;

  // 不演出:直接結算(移除她 + 天賦掉落判定),不進 chat-mode、不生成任何文字
  if (!SAC_RITUAL) {
    sacSettle({ id, name: s.name, stage: s.stage, gift: s.gift, price });
    detailId = null;
    renderAll();
    return;
  }

  const sc = s.sacScript;
  sacrificeWith = id;
  sacSession = {
    id, name: s.name, persona: s.personality, backstory: s.backstory, stage: s.stage, gift: s.gift,
    method: sc.method, opening: sc.opening,
    pages: sc.pages.map(p => ({ text: p.text })),   // 拷貝預織文,儀式中不改存檔原文
    idx: 0, ready: true, settled: false, price,
  };
  document.body.classList.add("chat-mode");
  detailId = null;
  renderAll();
  sacShowCurrent();   // 文已備妥 → 開場即可按「開始儀式」
}

// 顯示目前這一頁(0=開場,1~6=六句);文皆預織,直接播
function sacShowCurrent() {
  const ss = sacSession; if (!ss) return;
  const title = document.getElementById("chat-title");
  if (title) title.textContent = `獻祭儀式:${ss.name}${ss.idx ? `(${ss.idx}/6)` : ""}`;
  if (ss.idx === 0) {
    vnShow(ss.name, ss.opening, "ai");
    vnDone();
    sacBtn();
    return;
  }
  sacRender(ss.idx);
  vnDone();
  sacBtn();
}

// 偶數頁=場景描述(旁白);奇數頁=她的反應(她的名字/台詞)
function sacRender(i, partial) {
  const ss = sacSession; if (!ss || i < 1) return;
  const j = i - 1;
  const text = partial != null ? partial : (ss.pages[j] && ss.pages[j].text) || "";
  if (j % 2 === 1) vnShow(ss.name, text, "ai");
  else vnShow("", text, "sys");
}

// 開場 →「開始儀式 ▶」;進行中 →「下一句 ▶」;最後 →「完成獻祭」
function sacBtn() {
  const ss = sacSession; const b = document.getElementById("sac-done");
  if (!b || !ss) return;
  if (ss.idx === 0) {
    b.textContent = "開始儀式 ▶";
    b.disabled = false;
    return;
  }
  b.textContent = ss.idx >= 6 ? "完成獻祭" : "下一句 ▶";
  b.disabled = !(ss.pages[ss.idx - 1] && ss.pages[ss.idx - 1].text);
}

function sacAdvance() {
  const ss = sacSession; if (!ss) return;
  if (ss.idx >= 6) { if (!ss.settled) sacSettle(ss); exitSacrifice(); return; }
  ss.idx++;
  sacShowCurrent();
}

// 結算:移除她 + 依階段機率掉永久天賦擴充(在「完成獻祭」時才發生)
// ss.forSever=true 時:這次獻祭是「破除纏身」的祭品,log 由呼叫端另寫
function sacSettle(ss) {
  ss.settled = true;
  const dropped = Math.random() < sacrificeDropChance(ss.stage);
  let dropMsg = "";
  if (dropped) {
    if (ss.gift === "cleanse") {
      // 必須回報伺服器 clear,否則下一輪 simSync 會把召喚師鏡像蓋回來
      const victims = state.succubi.filter(x => x.id !== ss.id && x.summoner);
      for (const x of victims) {
        simClearOf(x);
        x.summoner = null;
      }
      dropMsg = `\n\n✦ 特殊天賦發動:所有魅魔身上的召喚師都被抹除了!(${victims.length} 名解除;同類型再纏會接續舊階段)`;
      simSync(true);
    } else {
      state.expansions ??= {};
      const inc = ss.stage === "wife" ? 2 : 1;   // 妻子最豐厚
      state.expansions[ss.gift] = (state.expansions[ss.gift] || 0) + inc;
      dropMsg = `\n\n✦ 你永久獲得了她的天賦:${EXPANSIONS[ss.gift]} +${inc}!`;
    }
  }
  Cards.closeSessionIfGirl(state, ss.id);
  state.succubi = state.succubi.filter(x => x.id !== ss.id);
  state.kanbans = (state.kanbans || []).filter(k => k.id !== ss.id);
  if (state.lastKanbanId === ss.id) state.lastKanbanId = null;
  document.body.classList.remove("card-mode");
  if (!ss.forSever) {
    log(`獻祭了 ${ss.name}(-${ss.price} 金)${dropped ? (ss.gift === "cleanse" ? ",發動清除召喚師" : `,獲得 ${EXPANSIONS[ss.gift]} 擴充`) : ""}`);
    toast(dropMsg.includes("✦") ? "✦ 獲得永久擴充!" : `${ss.name} 化作了獻祭的光`, dropMsg.includes("✦") ? "good" : "");
  } else if (dropMsg.includes("✦")) {
    toast(dropMsg.includes("清除") ? "✦ 清除召喚師!" : "✦ 獲得永久擴充!", "good");
  }
  scheduleSave();
  return { dropped, dropMsg };
}

// 破除纏身:名冊上「被纏住」只剩 1 人時成功機率;≥2 人時隨機挑一人必成
const SEVER_SOLO_CHANCE = 1 / 3;

/**
 * 獻祭一名魅魔,嘗試破除召喚師纏身。
 * - 被纏住 ≥2 人:隨機選一人解除(必成)
 * - 被纏住 =1 人:1/3 成功
 * 成功時伺服器記 mem(同類型再纏接續階段);祭品無論成敗都消失。
 * @param {string} offerId 祭品魅魔 id
 * @param {string} [fromDetailId] 從哪頁發起(祭品若是當頁則導回名冊/其他)
 */
async function severSummonerWithSacrifice(offerId, fromDetailId) {
  const offer = state.succubi.find(x => x.id === offerId);
  if (!offer || offer.ntr) { toast("選一名可獻祭的魅魔當祭品", "bad"); return; }
  if (!canSacrifice(offer)) { toast(sacrificeBlockReason(offer) || "無法獻祭她", "bad"); return; }

  const candidates = state.succubi.filter(x => x.id !== offer.id && x.summoner && !x.ntr);
  if (!candidates.length) {
    toast("沒有其他被召喚師纏住的魅魔可破除", "bad");
    return;
  }

  const price = dismissPriceToday();
  if (state.gold < price) { toast(`今日獻祭費 ${price} 金,你付不起`, "bad"); return; }

  const multi = candidates.length >= 2;
  if (!confirm(
    `獻祭 ${offer.name}(${price} 金) 嘗試破除召喚師?\n\n` +
    `· ${offer.name} 將永遠消失\n` +
    `· 成功時:隨機一名被纏魅魔回到未纏上(階段會記住)`
  )) return;

  state.gold -= price;

  // 擲成敗 / 選目標(在移出祭品前先定案)
  let target = null;
  let success = false;
  if (multi) {
    target = pick(candidates);
    success = true;
  } else {
    target = candidates[0];
    success = Math.random() < SEVER_SOLO_CHANCE;
  }

  // 祭品走既有獻祭結算(天賦掉落照常;forSever 避免重複 toast/log 主文)
  sacSettle({
    id: offer.id, name: offer.name, stage: offer.stage, gift: offer.gift,
    price, forSever: true,
  });
  if (sacrificeWith === offer.id) exitSacrifice();
  if (watchWith === offer.id) exitWatch(true);
  if (chatWith === offer.id) exitChat();

  // 祭品若是詳情頁對象,或破除成功後想留在被救的人身上
  if (detailId === offer.id) {
    detailId = success && target ? target.id : (fromDetailId && fromDetailId !== offer.id ? fromDetailId : null);
  }

  if (success && target) {
    // 祭品結算可能觸發 cleanse 已把人清掉——再確認還在名冊且仍有 summoner
    target = state.succubi.find(x => x.id === target.id) || null;
    if (target?.summoner) {
      const su = summonerById(target.summoner.id);
      const stageTxt = rivalStageName(target.summoner.stage ?? 0);
      const suName = su?.name || "召喚師";
      const wasTaken = !!target.summoner.taken;
      simClearOf(target);
      target.summoner = null;
      if (watchWith === target.id) exitWatch(true);
      if (chatWith === target.id) exitChat();
      log(`獻祭 ${offer.name}(-${price} 金)破除了 ${target.name} 身上「${suName}」的纏身(階段「${stageTxt}」已記住${multi ? ";隨機選中" : ""})`);
      toast(
        `破除成功!${target.name} 身上的召喚師被抹除了` + (wasTaken ? "(她也掙脫了召喚)" : "") +
        `——「${suName}」的舊情(${stageTxt})仍記著`,
        "good",
      );
    } else {
      log(`獻祭 ${offer.name}(-${price} 金)嘗試破除纏身——目標已不在或已被其他效果清除`);
      toast("破除擲中了,但目標已不在纏身狀態", "");
    }
  } else {
    const name = target?.name || "她";
    log(`獻祭 ${offer.name}(-${price} 金)嘗試破除纏身——失敗(${name} 仍被纏住)`);
    toast(`破除失敗……${name} 身上的召喚師還在`, "bad");
  }

  severChooser = false;
  await simSync(true);
  scheduleSave();
  renderAll();
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

function canSummon() {
  return state.dungeon.length >= 1 && state.gold >= 0 && state.succubi.length < rosterCap();
}

// 開始獻祭召喚:一位一位獻祭祭品,獻完再召喚
function startSummonSacrifice() {
  if (state.gold < 0) { toast("負債中不可召喚", "bad"); return; }
  if (state.succubi.length >= rosterCap()) { toast(`名冊名額已滿(${rosterCap()} 格)`, "bad"); return; }
  if (state.dungeon.length < 1) { toast("地牢裡沒有祭品", "bad"); return; }
  sacSummon = { count: 0 };
  document.body.classList.add("chat-mode");
  renderAll();
  sacrificeNextOffering();
}

// 獻祭下一位祭品(VN 描述)
async function sacrificeNextOffering() {
  if (!sacSummon) return;
  const off = state.dungeon.shift();
  sacSummon.count++;
  renderChatView();   // 刷新標題「已獻 N 人」
  setSummonSacBtns(false);
  vnShow("", `—— 獻祭第 ${sacSummon.count} 位:${off.name} ——`, "sys");
  vnTyping(true);

  let script = { method: null, body: null };
  try { script = await fetch("/api/scripts/random?category=sacrifice_offering").then(r => r.json()); } catch { }
  const ctx = {
    world: WORLD_LORE, content_rating: state.settings.rating || "nsfw",
    offering_name: off.name, method: script.method, method_desc: script.body,
    nth: sacSummon.count,
  };
  const msgs = [
    { role: "system", content: buildOfferingPrompt(ctx) },
    { role: "user", content: "描述這場祭品獻祭的過程,3~5 句旁白。" },
  ];
  try {
    await llmJobRun(msgs, acc => vnShow("祭壇", acc, "ai"),
      `${off.name} 被拖上祭壇,魔法陣的光紋亮起,將他的血肉與魂魄一寸寸抽入召喚之書……祭壇上只剩一縷輕煙。`);
    vnDone();
  } catch (e) {
    if (e.name === "AbortError") { exitSummonSacrifice(); return; }
    vnShow("", "(儀式的細節模糊了……)", "sys");
  }
  scheduleSave();
  setSummonSacBtns(true);
}

// 獻祭完畢 → 依人數擲稀有度召喚
function doSummonNow() {
  const n = sacSummon.count;
  sacSummon = null;
  document.body.classList.remove("chat-mode");
  summonWithCount(n);
}
function exitSummonSacrifice() {
  chatAbort?.abort();
  const n = sacSummon?.count || 0;
  sacSummon = null;
  document.body.classList.remove("chat-mode");
  if (n > 0) summonWithCount(n); else renderAll();
}
function setSummonSacBtns(enabled) {
  const more = document.getElementById("ssac-more");
  const done = document.getElementById("ssac-summon");
  const canMore = sacSummon && state.dungeon.length > 0 && sacSummon.count < 6;
  if (more) { more.disabled = !enabled || !canMore; more.textContent = canMore ? `繼續獻祭(地牢還有 ${state.dungeon.length})` : "地牢已空 / 已達 6 人"; }
  if (done) { done.disabled = !enabled; done.textContent = sacSummon ? `召喚(已獻 ${sacSummon.count} 人)` : "召喚"; }
}

// 獻祭人數 → luck(0~100):越多人越容易開出高評級 → 高稀有度(SSR 真的開得出來)
const LUCK_BY_COUNT = { 1: 0, 2: 18, 3: 35, 4: 55, 5: 75, 6: 92 };

function summonWithCount(n) {
  if (n < 1 || state.succubi.length >= rosterCap()) { renderAll(); return; }
  const today = dayNum();
  // 新制:原型骨幹+評級抽卡(persona_pools.json;nsfw 項目依分級門控);池子沒載到退回舊制
  let gen = null;
  try {
    gen = generateGirl({
      luck: LUCK_BY_COUNT[Math.min(6, n)] || 0,
      rating: state.settings.rating || "nsfw",
      usedNames: state.succubi.map(x => x.name),
    });
  } catch (e) { gen = null; }

  const base = {
    id: uid(),
    affection: 0,
    stage: "stranger",
    portraitReady: false,
    summonedAt: Date.now(),
    lastChatDay: today,
    lastDateDay: today,
    datesToday: { day: today, count: 0 },
    ntr: null,
    errand: null,                                     // 她盯著的那件委託 {qid,text,day,asked,late}
    guard: null,                                      // 防備狀態 {hits,cool}(只有陌生階段有)
    crave: { v: randInt(0, 25), at: Date.now() },     // 飢渴 {v,at};懶算,見 craveValue
    summoner: null,                                   // 被別的召喚師纏上時 = {id, affection, sinceDay}
    drawIvlH: randInt(2, 5),                           // 隱藏:抽召喚師的間隔(小時)
    nextDraw: Date.now() + randInt(2, 5) * HOUR,       // 下次抽取時間戳
    gift: pick(GIFT_KEYS),                             // 天賦擴充(看板娘時暫加、獻祭時有機率永久)
    dna: { seed: Math.floor(Math.random() * 1e9), traits: [pick(TRAIT_POOL.hair), pick(TRAIT_POOL.eyes), pick(TRAIT_POOL.body), pick(TRAIT_POOL.extra)] },
  };
  const s = gen ? { ...base, ...gen } : (() => {
    // 舊制退路(池子載入失敗時)
    const usedNames = new Set(state.succubi.map(x => x.name));
    const freeNames = NAME_POOL.filter(x => !usedNames.has(x));
    return {
      ...base,
      name: pick(freeNames.length ? freeNames : NAME_POOL),
      rarity: rollRarity(n),
      personality: pick2(PERSONALITY_POOL),
      speech: pick(SPEECH_POOL),
      ...makeBackstory(),
    };
  })();
  // Comfy 模式:召喚當下就綁定她專屬的 checkpoint(有清單才抽;沒抓過則生圖前再補)
  if (imgProvider() === "comfy") {
    const pool = usableComfyCkpts();
    if (pool.length) s.comfyCkpt = pickRandomComfyCkpt();
  }
  state.succubi.push(s);
  log(`獻祭 ${n} 人,召喚出【${s.rarity}】${s.name}`
    + (s.comfyCkpt ? ` · 模型 ${shortCkptName(s.comfyCkpt)}` : ""));
  scheduleSave();
  showSummonOverlay(s, n);
  renderAll();
}

function showSummonOverlay(s, n) {
  const ov = document.getElementById("summon-overlay");
  ov.classList.remove("hidden");
  ov.innerHTML = `<div class="summon-circle"></div>`;
  setTimeout(() => {
    // 生得出圖就當場織形體,等生成結束召喚才算完成;生不出來(無模型)才退回
    // 舊制的「今晚作夢」。判斷的是**生圖**能不能用,不是聊天用哪個 provider——
    // 以前這裡問的是 llmIsOrder(),聊天走 Ollama + 生圖走 ComfyUI 時就永遠不生圖。
    if (canWeaveNow()) genSummonPortrait(ov, s);
    else renderSummonCard(ov, s);
  }, 1400);
}

// 召喚結果卡:有立繪就顯示立繪,沒有就 SVG 剪影 +「今晚作夢」
function renderSummonCard(ov, s) {
  const ready = !!girlShot(s, "full");
  ov.innerHTML = `
    <div class="summon-result r-${s.rarity}">
      <div class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</div>
      <h3>${esc(s.name)}</h3>
      <div class="portrait">${girlPortrait(s, 7, "full")}</div>
      <p>${ready ? "她成形了——這就是她的模樣。" : "她還沒有形體……讓她今晚做個夢吧。"}</p>
      ${!ready && lastWeaveError
        ? `<p class="small" style="color:var(--red)">織不出形體:${esc(lastWeaveError)}</p>`
        : ""}
      <p class="small">${s.personality.join("・")} / ${s.speech}</p>
      <p class="small dim">她原本是……${esc(s.job || "?")}</p>
      ${s.comfyCkpt && imgProvider() === "comfy"
        ? `<p class="small dim">生圖模型 · ${esc(shortCkptName(s.comfyCkpt))}</p>` : ""}
      <button id="summon-close">接受契約</button>
    </div>`;
  document.getElementById("summon-close").onclick = () => { ov.classList.add("hidden"); ov.innerHTML = ""; renderAll(); };
}

// 生圖進行中的魅魔 id(召喚立繪 / 事後補織共用),避免同一隻重複下單、按鈕重複點
const portraitGenning = new Set();

// 生圖走哪條路:ComfyUI(本機顯卡)或 Grok Build(雲端)
function imgProvider() {
  return state.settings.imgProvider === "comfy" ? "comfy" : "grok-img";
}

// 現在生得出圖嗎。ComfyUI 是本機顯卡隨時可織;Grok 生圖只要選了 grok-img
//（伺服器有 grok CLI 即可），不要求聊天也走 Grok Build。
function canWeaveNow() {
  const img = imgProvider();
  if (img === "comfy") return true;
  if (img === "grok-img") return true; // 下單時才會知道 CLI 在不在
  return llmIsOrder();
}

// 最後一次生圖失敗的原因。生圖是背景工作,失敗沒有地方講就等於靜靜消失——
// 留著給召喚卡與詳細頁顯示,不要讓人自己去猜。
let lastWeaveError = "";
// 最後一次去背的結果。同理:去背在伺服器上默默跳過時,手機看到的只是「還是白底」,
// 沒有任何地方講原因(沒裝 Pillow?模型畫了場景?角色跟背景同色?)。
let lastCutNote = "";

// 織完一張就問一次去背結果。一次請求,只在真的沒摳成時才留字。
async function pollCutNote() {
  try {
    const j = await fetch("/api/cutout").then(r => r.json());
    if (!j.available) { lastCutNote = j.hint || "沒裝 Pillow,立繪不會去背"; return; }
    const last = (j.recent || [])[0];
    lastCutNote = last && !last.changed ? last.why : "";
  } catch { /* 問不到就算了,不要因為診斷訊息拖累生圖流程 */ }
}

// ComfyUI 的 checkpoint 清單(「測試 ComfyUI」或生圖前 refresh 抓)。
// bad = 試過確定沒有文字編碼器的單件檔——分配給妹子時跳過。
// 每位妹子自帶 s.comfyCkpt;設定頁不再選全局模型。
let comfyCkpts = [];
let comfyBadCkpts = [];
let comfyCkptRefreshAt = 0;
/** 最近一次 /api/comfy/status 原文(測試列顯示 VRAM 用) */
let comfyLastStatus = null;

function usableComfyCkpts() {
  const bad = new Set(comfyBadCkpts);
  const u = comfyCkpts.filter(c => c && !bad.has(c));
  return u.length ? u : comfyCkpts.slice();
}

function pickRandomComfyCkpt(exclude = "") {
  let pool = usableComfyCkpts();
  if (exclude && pool.length > 1) pool = pool.filter(c => c !== exclude);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 檔名太長時詳細頁只顯示尾段 */
function shortCkptName(name) {
  if (!name) return "";
  const base = String(name).split(/[/\\]/).pop() || name;
  return base.length > 42 ? "…" + base.slice(-40) : base;
}

async function refreshComfyCkpts({ force = false } = {}) {
  if (!force && comfyCkpts.length && Date.now() - comfyCkptRefreshAt < 60000) {
    return true;
  }
  const u = (state?.settings?.comfyUrl || "").trim();
  try {
    const res = await fetch("/api/comfy/status" + (u ? "?url=" + encodeURIComponent(u) : ""));
    const j = await res.json();
    comfyLastStatus = j;
    if (!j?.ok) return false;
    comfyCkpts = j.checkpoints || [];
    comfyBadCkpts = j.bad_checkpoints || [];
    comfyCkptRefreshAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * 確保這位妹子有固定 Comfy checkpoint。
 * - 已有且不在壞檔名單 → 沿用(同一人永遠同一模型)
 * - 沒有 / 已是壞檔 → 從可用清單隨機抽一個綁定並存檔
 * 回傳要用的 ckpt 名(可能仍空:Comfy 沒模型時交給伺服器自動挑)
 */
async function ensureGirlComfyCkpt(s) {
  if (!s || imgProvider() !== "comfy") return s?.comfyCkpt || "";
  await refreshComfyCkpts();
  const cur = (s.comfyCkpt || "").trim();
  const bad = cur && comfyBadCkpts.includes(cur);
  if (cur && !bad) return cur;
  const picked = pickRandomComfyCkpt(cur);
  if (picked) {
    s.comfyCkpt = picked;
    try { dirty = true; scheduleSave(); } catch { /* */ }
  }
  return s.comfyCkpt || "";
}

/** 測試 Comfy 成功後:幫還沒綁模型的舊妹子補上(不覆蓋已有的) */
function assignMissingGirlCkpts() {
  if (imgProvider() !== "comfy" || !state?.succubi?.length) return 0;
  const pool = usableComfyCkpts();
  if (!pool.length) return 0;
  let n = 0;
  for (const s of state.succubi) {
    const cur = (s.comfyCkpt || "").trim();
    if (cur && !comfyBadCkpts.includes(cur)) continue;
    s.comfyCkpt = pickRandomComfyCkpt(cur);
    if (s.comfyCkpt) n++;
  }
  if (n) { try { dirty = true; scheduleSave(); } catch { /* */ } }
  return n;
}

// 一張的下單→輪詢。shot 給值(head|half|full)= 三連拍其中一張,尺寸與 seed
// 由伺服器依規格決定(三張同 seed 才是同一張臉)。回 URL 或 ""。
// opts.forceNew：新 key 強制重跑；opts.randomSeed：半身換樣時用（Comfy）
async function weaveShot(s, shot, onTick, opts = {}) {
  const comfy = imgProvider() === "comfy";
  // 每位妹子自帶 checkpoint;沒綁過就現在抽一個綁死
  const girlCkpt = comfy ? await ensureGirlComfyCkpt(s) : "";
  const body = {
    // 強制新單，避免佇列回舊 done 快取
    key: opts.forceNew
      ? `portrait:${s.id}:${shot}:${Date.now().toString(36)}`
      : undefined,
    provider: imgProvider(),
    model: state.settings.model || "grok-4.5",
    // Grok 那條沒有三連拍,只認 framing;head 對它而言最接近半身
    framing: comfy ? "full" : (shot === "full" ? "full" : "half"),
    rating: state.settings.rating || "nsfw",
    style: state.settings.imgStyle || "pixel",
    character: s,   // 完整人設(generateGirl 結果),生圖以此為準
    retry: true,
    ...(comfy ? {
      shot,
      char_id: s.id,
      comfy_url: state.settings.comfyUrl || "",
      ckpt: girlCkpt || "",
      // 0 = 伺服器用人設 seed；換半身時給隨機 seed 才會變
      ...(opts.randomSeed ? { seed: (Math.floor(Math.random() * 2147483646) + 1) } : {}),
    } : {}),
  };
  const t0 = Date.now();
  const timer = onTick ? setInterval(() => onTick(Math.round((Date.now() - t0) / 1000)), 1000) : null;
  let url = "";
  lastWeaveError = "";
  try {
    let r = await imgGenPost(body);
    if (!r) lastWeaveError = "伺服器沒回應(/api/imggen)";
    let key = r?.key;
    const deadline = Date.now() + 180000;   // 最多等 3 分鐘
    while (r && Date.now() < deadline) {
      if (r.status === "done") { url = r.result || ""; break; }
      if (r.status === "error") { lastWeaveError = r.error || "生圖失敗"; break; }
      await new Promise(res => setTimeout(res, 1500));
      r = await imgGenPost({ ...body, key, retry: false });
      key = r?.key || key;
    }
    if (!url && !lastWeaveError) lastWeaveError = "等了 3 分鐘還沒好";
  } catch (e) {
    lastWeaveError = String(e?.message || e);
  }
  if (timer) clearInterval(timer);
  if (url && comfy) await pollCutNote();
  return url;
}

function setShot(s, shot, url) {
  if (!url) return;
  if (!s.portraits) s.portraits = {};
  // 同路徑覆寫時加版本，避免瀏覽器吃舊半身
  const bust = url.includes("?") ? url : `${url.split("#")[0]}?v=${Date.now()}`;
  s.portraits[shot] = bust;
  s.portrait = s.portraits.full || s.portraits.half || bust;
  s.portraitReady = true;
  syncPortraitCgCache(s);
  dirty = true;
  saveNow();
}

/**
 * 把「全身 full」立刻換到主畫面看板娘站位（#kanban-girl）。
 * 這就是玩家看到的「站著當看板娘」那張，不是半身／頭像。
 */
function replaceKanbanFullStand(s) {
  if (!s) return false;
  const url = girlShot(s, "full");
  if (!url) return false;
  syncPortraitCgCache(s);
  dirty = true;
  scheduleSave();

  // 先整頁重畫看板（從 SVG 剪影也能變成 <img>）
  try { renderKanban(); } catch { /* */ }

  const root = document.getElementById("kanban-girl");
  if (!root || root.classList.contains("hidden")) {
    // 她應該在店頭；若 DOM 沒站著，再 renderAll 一次
    try { renderAll(); } catch { /* */ }
  }
  const wrap = document.querySelector(`#kanban-girl .kgirl[data-kid="${CSS.escape?.(s.id) || s.id}"]`)
    || document.querySelector(`#kanban-girl .kgirl[data-kid="${s.id}"]`);
  if (!wrap) {
    try { renderAll(); } catch { /* */ }
    return !!girlShot(s, "full");
  }

  let img = wrap.querySelector("img.portrait-img");
  if (!img) {
    // 還是剪影 SVG → 拆掉換成 img
    wrap.querySelectorAll("svg").forEach(el => el.remove());
    img = document.createElement("img");
    img.className = "portrait-img shot-full";
    img.alt = s.name || "";
    const nameEl = wrap.querySelector(".kname");
    if (nameEl) wrap.insertBefore(img, nameEl);
    else wrap.appendChild(img);
  }
  // 強制換 src（同檔覆寫也靠 ?v=）
  img.src = url;
  img.setAttribute("src", url);
  img.classList.remove("hidden");
  // 再觸發一次 load，避免部分瀏覽器卡住舊圖
  img.decode?.().catch?.(() => {});
  return true;
}

/**
 * 召為看板娘專用：
 * 1) 必織「全身 full」店頭站姿 → 織好馬上 replaceKanbanFullStand
 * 2) 1/3 再織 half（牌桌用），織好也立刻更新
 * 不擋召喚按鈕；失敗會 toast 原因。
 */
async function weaveKanbanArrival(s) {
  if (!s) return;
  if (!canWeaveNow()) {
    toast("現在不能生圖（設定→生圖 Comfy／Grok）", "bad");
    return;
  }
  // 若別的織圖佔著，最多等 45 秒，不要默默放棄
  const waitT0 = Date.now();
  while (portraitGenning.has(s.id) && Date.now() - waitT0 < 45000) {
    await new Promise(r => setTimeout(r, 400));
  }
  if (portraitGenning.has(s.id)) {
    toast("立繪佇列忙碌，看板全身圖稍後再試", "bad");
    return;
  }

  portraitGenning.add(s.id);
  const changeHalf = Math.random() < 1 / 3;
  try {
    toast(`${s.name} 的全身立繪繪製中…`, "");
    lastWeaveError = "";
    // 看板娘 = full 全身站姿（主畫面 #kanban-girl）
    const fullUrl = await weaveShot(s, "full", null, { forceNew: true, randomSeed: true });
    if (!fullUrl) {
      toast(`全身立繪失敗：${lastWeaveError || "無圖"}`, "bad");
      console.warn("[kanbanArt] full failed", lastWeaveError, imgProvider());
      return;
    }
    setShot(s, "full", fullUrl);
    const ok = replaceKanbanFullStand(s);
    toast(ok
      ? `${s.name} 的全身立繪已換上店頭`
      : `${s.name} 立繪已存檔（畫面刷新中）`, "good");
    // 保險再刷一次
    try { renderKanban(); renderAll(); } catch { /* */ }

    if (changeHalf) {
      lastWeaveError = "";
      const halfUrl = await weaveShot(s, "half", null, { forceNew: true, randomSeed: true });
      if (halfUrl) {
        setShot(s, "half", halfUrl);
        if (document.body.classList.contains("card-mode") && girlForSession()?.id === s.id) {
          setCtPortrait(s, { prefer: "half" });
        }
        toast(`${s.name} 的半身像也更新了`, "good");
        try { renderAll(); } catch { /* */ }
      }
    } else if (!s.portraits?.half) {
      const halfUrl = await weaveShot(s, "half", null, { forceNew: true, randomSeed: true });
      if (halfUrl) setShot(s, "half", halfUrl);
    }
    if (!s.portraits?.head) {
      const headUrl = await weaveShot(s, "head", null, { forceNew: true });
      if (headUrl) setShot(s, "head", headUrl);
    }
  } catch (e) {
    console.warn("[kanbanArt]", e);
    toast(`看板立繪出錯：${e?.message || e}`, "bad");
  } finally {
    portraitGenning.delete(s.id);
  }
}

// 召喚三連拍:先等 full(召喚結果卡要顯示它),head/half 背景補。
// 三張都等 = 召喚要卡三倍時間;玩家在讀結果卡的時候另外兩張正好織完。
async function weavePortrait(s, onTick) {
  if (!s || portraitGenning.has(s.id)) return false;
  portraitGenning.add(s.id);
  let ok = false;
  try {
    setShot(s, "full", await weaveShot(s, "full", onTick));
    ok = !!girlShot(s, "full");
    // M5：full 好了立刻同步 cache；half/head 背景補（兩條生圖路都補，不卡 UI）
    if (ok) {
      syncPortraitCgCache(s);
      weaveRest(s);   // 不 await
    }
  } finally {
    portraitGenning.delete(s.id);
  }
  return ok;
}

// 背景補剩下兩張。失敗不重試也不吵——girlShot 會自動退回已經有的那張。
async function weaveRest(s) {
  for (const shot of ["head", "half"]) {
    if (s.portraits?.[shot]) continue;
    setShot(s, shot, await weaveShot(s, shot));
    syncPortraitCgCache(s);
    // 牌桌開著就刷新立繪，不整頁 render 打斷手牌
    if (document.body.classList.contains("card-mode")) {
      const g = girlForSession();
      if (g && g.id === s.id) setCtPortrait(s, { cardId: cardUi.lastPlay?.cardId || null });
    } else {
      renderAll();
    }
  }
}

// ── M5：CG / 立繪 cache（開戰不卡 GPU）──────────────────────
// girl.cardCg[key] = { url, status: 'ready'|'pending'|'error', at, source }
// key: portrait:half|full|head 或 card:{cardId}
// 規則：有 cache 用 cache；無則立繪／字首占位；**禁止** open 路徑 await 生圖。

function ensureCardCgMap(s) {
  if (!s) return {};
  s.cardCg ??= {};
  return s.cardCg;
}

/** 把三連拍立繪同步進 cardCg（同源 URL，一張多用） */
function syncPortraitCgCache(s) {
  if (!s) return;
  const cg = ensureCardCgMap(s);
  const now = Date.now();
  for (const shot of ["half", "full", "head"]) {
    const url = s.portraits?.[shot] || (shot === "full" ? s.portrait : "") || "";
    if (!url) continue;
    const k = `portrait:${shot}`;
    const prev = cg[k];
    if (prev?.url === url && prev.status === "ready") continue;
    cg[k] = { url, status: "ready", at: now, source: "portrait" };
  }
}

/** 本桌出卡場景鏈 URL（乾淨 path，可當 image_edit ref） */
function cardSceneChainUrl() {
  const u = String(state.cardSession?.sceneChainUrl || "").split("?")[0].split("#")[0].trim();
  if (u && /^\/assets\/(portraits|testword)\//.test(u)) return u;
  return "";
}

/** 記住本桌最新場景圖（下一張接續用；結束牌局隨 session 清掉） */
function rememberCardSceneChain(url) {
  const sess = state.cardSession;
  if (!sess) return;
  const clean = String(url || "").split("?")[0].split("#")[0].trim();
  if (!clean || !/^\/assets\/(portraits|testword)\//.test(clean)) return;
  sess.sceneChainUrl = clean;
}

/** 牌桌占位／回退：有鏈就用上一張場景，不要跳回半身 */
function cardTablePlaceUrl(girl) {
  const chain = cardSceneChainUrl();
  if (chain) return chain;
  if (!girl) return "";
  syncPortraitCgCache(girl);
  return resolveCardTableArt(girl, { prefer: "half", allowChain: false }).url
    || state.cardSession?.girlSnap?.portraits?.half
    || state.cardSession?.girlSnap?.portrait
    || "";
}

/**
 * 解析牌桌要用的圖（同步、零等待）。
 * prefer: 'half' | 'full' | 'head'；cardId 有專屬 cache 時優先。
 * allowChain：無 card 專圖時是否用本桌上一張場景（打牌中連續用）。
 */
function resolveCardTableArt(girl, { cardId = null, prefer = "half", allowChain = true } = {}) {
  if (!girl) return { url: "", kind: "empty", weaving: false, key: null };
  syncPortraitCgCache(girl);
  const cg = girl.cardCg || {};
  const weaving = portraitGenning.has(girl.id);

  if (cardId) {
    const ck = `card:${cardId}`;
    const hit = cg[ck];
    // 必須有真實 url 才用 card cache；空 url 的 pending 會讓立繪變「？」——改回退鏈／半身
    if (hit?.url && (hit.status === "ready" || hit.status === "pending")) {
      return {
        url: hit.url,
        kind: hit.status === "pending" ? "scene_pending" : "card",
        weaving: weaving || hit.status === "pending",
        key: ck,
      };
    }
  }

  // 打牌中：優先本桌上一張場景，避免每張都閃回半身立繪
  if (allowChain && document.body.classList.contains("card-mode")) {
    const chain = cardSceneChainUrl();
    if (chain) {
      return { url: chain, kind: "scene_chain", weaving, key: "session:sceneChain" };
    }
  }

  const order = SHOT_FALLBACK[prefer] || SHOT_FALLBACK.half;
  for (const shot of order) {
    const k = `portrait:${shot}`;
    if (cg[k]?.url) return { url: cg[k].url, kind: "portrait", weaving, key: k };
    const u = girlShot(girl, shot);
    if (u) return { url: u, kind: "portrait", weaving, key: k };
  }
  // session 快取的立繪（live 物件上 portraits 被清掉時）
  const snap = state.cardSession?.girlSnap;
  if (snap && snap.id === girl.id) {
    for (const shot of order) {
      const u = snap.portraits?.[shot] || (shot === "full" ? snap.portrait : "");
      if (u) return { url: u, kind: "portrait_snap", weaving, key: `snap:${shot}` };
    }
  }
  return { url: "", kind: "placeholder", weaving, key: null };
}

/**
 * 背景補齊半身／頭（牌桌要用）。**永不 await 給呼叫端**。
 * 已在織或不能織 → 直接 return。
 */
function ensureArtCacheBg(girl) {
  if (!girl || !canWeaveNow()) {
    if (girl) syncPortraitCgCache(girl);
    return;
  }
  syncPortraitCgCache(girl);
  // 以真實檔位為準（girlShot 會 fallback，不能拿來判斷「缺 half」）
  const needHalf = !girl.portraits?.half;
  const needHead = !girl.portraits?.head;
  const needFull = !girl.portraits?.full && !girl.portrait;
  if (!needHalf && !needHead && !needFull) return;
  if (portraitGenning.has(girl.id)) return;
  // fire-and-forget：永不阻塞開桌／出卡
  weaveMissing(girl, false).then(() => {
    syncPortraitCgCache(girl);
    if (document.body.classList.contains("card-mode")) {
      const g = girlForSession();
      if (g && g.id === girl.id) setCtPortrait(girl, { cardId: cardUi.lastPlay?.cardId || null });
    }
  }).catch(() => {});
}

/**
 * 出卡後：若該卡尚無專屬 CG，把當前最佳立繪 **別名** 進 card:{id}
 * （先有占位圖；場景生圖完成後會覆寫同一 key。）
 * 注意：有舊場景圖時不要呼叫這個當「完成」——應走 primeCardSceneArtOnPlay 強制重畫。
 */
function bindCardArtAlias(girl, cardId) {
  if (!girl || !cardId) return;
  const cg = ensureCardCgMap(girl);
  const key = `card:${cardId}`;
  if (cg[key]?.status === "ready" && cg[key].url) return;
  if (cg[key]?.status === "pending") return;
  // 不帶 cardId，避免又命中舊 card: 場景圖
  const art = resolveCardTableArt(girl, { prefer: "half" });
  if (!art.url) return;
  cg[key] = {
    url: art.url,
    status: "ready",
    at: Date.now(),
    source: "alias_portrait",
  };
}

/**
 * 每次打出卡牌：作廢該卡舊場景圖，改占位 + pending。
 * 占位優先「本桌上一張場景」，沒有才用半身——連續打牌不要閃回立繪。
 */
function primeCardSceneArtOnPlay(girl, cardId) {
  if (!girl || !cardId) return;
  const g = girlForSession() || girl;
  cacheGirlSnapOnSession(g);
  const cg = ensureCardCgMap(g);
  const key = `card:${cardId}`;
  // 先清掉 card: 快取再取占位，否則 resolve 會回傳這張卡的舊場景
  delete cg[key];
  syncPortraitCgCache(g);
  // 鏈接優先 → 半身 → snap
  const placeUrl = cardTablePlaceUrl(g);

  if (cardSceneArtOn()) {
    cg[key] = {
      url: placeUrl || "",
      status: "pending",
      at: Date.now(),
      source: cardSceneChainUrl() ? "scene_chain_hold" : "scene_pending",
    };
    cardUi.sceneArtPending = true;
  } else if (placeUrl) {
    cg[key] = {
      url: placeUrl,
      status: "ready",
      at: Date.now(),
      source: cardSceneChainUrl() ? "scene_chain_hold" : "alias_portrait",
    };
  }
  if (document.body.classList.contains("card-mode")) {
    setCtPortrait(g, { cardId: placeUrl ? cardId : null });
  }
}

/** 實驗開關：每出卡依她回應生場景圖 */
function cardSceneArtOn() {
  return !!(cardSystemOn()
    && state?.settings?.features?.cardSceneArt !== false
    && canWeaveNow());
}

/** 診斷：為什麼這次沒排隊場景圖 */
function cardSceneArtWhyOff() {
  if (!cardSystemOn()) return "牌制未開";
  if (state?.settings?.features?.cardSceneArt === false) return "設定關掉了「出卡場景圖」";
  if (!canWeaveNow()) return `生圖不可用（目前 provider=${imgProvider()}）`;
  return "";
}

// 出卡場景生圖狀態（作廢用 gen）
const cardSceneJob = { gen: 0, key: null, cardId: null, girlId: null };

function voidCardSceneArt() {
  cardSceneJob.gen = (cardSceneJob.gen || 0) + 1;
  cardSceneJob.key = null;
  cardSceneJob.cardId = null;
  cardSceneJob.girlId = null;
}

/**
 * 出卡生圖三層（見 docs/card-system.md §12.3）：
 *   ① 身份固定：seed + 人設素質（server sdtags／CHARACTER SHEET）
 *   ② 卡牌運鏡：visualEn（玩家 POV 構圖／距離／前景痕跡）
 *   ③ 回應神態：回話後 AI 產表情＋肢體（本段；英文 tag）
 * 本函式只負責 ③ 的中文分鏡標籤。
 */
function cardVisualPoseMsgs(girl, play) {
  const player = playerBindName();
  const ctx = buildCtx(girl);
  const def = play?.cardId ? Cards.cardById(play.cardId) : null;
  ctx.card_play = {
    ...(ctx.card_play || {}),
    scene_start: play?.sceneStart || "",
    girl_line: play?.girlLine || "",
    dialogue: play?.girlLine || "",
    open_fail: !!(play?.open && play.open.success === false),
    card_name: play?.name || def?.name || "",
    kind: def?.kind || play?.kind || "",
    sex_phase: play?.sexPhase || def?.sexPhase || "",
  };
  const sys = buildCardVisualPosePrompt(ctx);
  const phase = play?.sexPhase || def?.sexPhase || "";
  const stage = girl?.stage || "stranger";
  const kind = def?.kind || play?.kind || "";
  const intimate = isIntimateContactCard(def);
  const attPose = intimate
    ? (stage === "wife" ? "妻子：順從享受投入（沉溺、迎合、抱緊）"
      : stage === "girlfriend" ? "女友：羞恥但享受（咬唇羞紅、半迎合）"
        : stage === "friend" ? "朋友：羞怒尷尬（半推、別開眼）"
          : "陌生：盛怒羞恥抗拒（怒瞪、推開、併腿）")
    : (stage === "wife" || stage === "girlfriend"
      ? "親密聊天：溫柔、自然、有眼神；不是性交姿勢"
      : stage === "friend"
        ? "朋友聊天：輕鬆或略尷尬；正常站姿／半身，不要被摸"
        : "陌生對話：客氣、戒備或好奇；正常對話姿態，禁止被摸胸／脫衣");
  const phaseHint = intimate
    ? (phase === "climax" ? "這是 L4 高潮：失神／阿黑顏可，但仍要看得出階段態度餘韻。"
      : phase === "player_climax" ? "這是 L5 中出：失神餘韻；態度仍掛關係階段。"
        : phase === "intercourse_intense" || kind === "intercourse" || kind === "sex"
          ? "這是 L2+ 正戲：被幹姿勢；表情態度必須符合關係階段。"
          : kind === "foreplay" ? "這是前戲：衣物位移；表情＝階段態度。"
            : kind === "erotic" ? "這是猥褻：被摸部位；表情＝階段態度。"
              : "")
    : "這是普通對話／輕互動：只寫臉與上半身反應；禁止裸露、摸胸、性交姿勢。";
  // relationship 注入分鏡 prompt
  if (ctx.relationship) ctx.relationship.stage = stage;
  else ctx.relationship = { stage };
  return [
    { role: "system", content: sys },
    {
      role: "user",
      content: [
        `她說了：「${String(play?.girlLine || "").slice(0, 180)}」。`,
        `卡種：${kind || "speech"}。`,
        `關係態度：${attPose}。`,
        phaseHint,
        intimate
          ? "只輸出 表情：… 與 動作：… 兩行（可見神態，必須畫得出該階段態度）。"
          : "只輸出 表情：… 與 動作：… 兩行（對話神態；禁止寫被摸／脫衣／性交）。",
      ].filter(Boolean).join(""),
    },
  ];
}

/**
 * 層 ③：把「表情／動作」中文 → 英文逗號 tag。
 * 只寫反應神態；不重寫運鏡（② visualEn）、不發明外貌（① 人設）。
 */
/** 關係階段 → 層③態度 tag（與 persona NSFW_STAGE_ATTITUDE 對齊） */
function stageAttitudeImgTags(stage) {
  switch (stage) {
    case "wife":
      return "submissive, pleasure, loving, devoted, aroused, engaged, half-closed eyes";
    case "girlfriend":
      return "blush, shy, pleasure, aroused, biting lip, embarrassed, half-closed eyes, loving";
    case "friend":
      return "angry, embarrassed, blush, ashamed, reluctant, averted eyes, tears";
    default:
      return "angry, furious, glare, tears, blush, resistance, rejecting, furrowed brows, ashamed";
  }
}

function cardImgEnMsgs(girl, play, def) {
  const pose = play?.visualPose || parseCardVisualPose(play?.visualPoseText || "");
  const dialogue = String(play?.girlLine || "").replace(/\s+/g, " ").slice(0, 160);
  const tags = (def?.tags || []).join(", ");
  const kind = def?.kind || play?.kind || "";
  const stage = girl?.stage || "stranger";
  const intimate = isIntimateContactCard(def);
  // 普通話術：反應是聊天神態，禁止性態度／ahegao／被摸
  const attTags = intimate
    ? stageAttitudeImgTags(stage)
    : (stage === "wife" || stage === "girlfriend"
      ? "soft smile, warm eyes, relaxed shoulders, natural blush"
      : stage === "friend"
        ? "mild smile or awkward smile, attentive eyes, natural posture"
        : "neutral to polite expression, attentive, slight tension, looking at him");
  return [
    {
      role: "system",
      content: [
        intimate
          ? "You convert her reaction into English IMAGE TAGS (layer 3 only) for an NSFW adult game."
          : "You convert her reaction into English IMAGE TAGS (layer 3 only) for a conversation / light-interaction beat.",
        "Output ONLY comma-separated short English tags for expression + body pose.",
        intimate
          ? "MUST reflect relationship attitude tags provided (stranger=furious resist, friend=angry shame, girlfriend=shy pleasure, wife=submissive pleasure)."
          : "This is NOT sex. Describe face and upper-body reaction to talk/light contact only.",
        intimate
          ? "Use tag form: blush, tears, ahegao, open mouth, tongue out, rolling eyes, arched back, trembling thighs."
          : "Use tag form: eye contact, soft smile, raised eyebrow, tilted head, open mouth speaking, hand near chin, relaxed pose. FORBIDDEN: groping, breast grab, bare breasts, nipples, sex, penetration, ahegao, male hands on breasts.",
        "FORBIDDEN: camera framing, POV, shot type (layer 2). FORBIDDEN: hair/eye color, full outfit inventory (layer 1).",
        "No Chinese. No narrative sentences. No dialogue text.",
        intimate ? "Adult explicit ok." : "Keep clothes on; SFW conversation framing.",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        tags ? `Card tags: ${tags}` : "",
        kind ? `Card kind: ${kind}` : "",
        `Relationship stage: ${stage}`,
        `Required attitude tags: ${attTags}`,
        pose?.face ? `Expression (ZH): ${pose.face}` : "",
        pose?.body ? `Body (ZH): ${pose.body}` : "",
        dialogue ? `She said (context only): ${dialogue}` : "",
        play?.open?.success === false ? "Physical rejection visible." : "",
        intimate
          ? "English reaction tags only; include the required attitude tags."
          : "English reaction tags only for a talk beat; no sexual body contact tags.",
      ].filter(Boolean).join("\n"),
    },
  ];
}

/** 去掉會污染 CLIP 的 meta 標籤字樣 */
function scrubImgPromptLabels(s) {
  return String(s || "")
    .replace(/\b(CARD VISUAL|authoritative action|stage direction|card tokens?|player action tokens?|ACTION \(authoritative\)|PRIMARY:|AUTHORITATIVE)\b/gi, " ")
    .replace(/\b(prompt|visualEn|visualZh|kind|speech|shop_premium)\s*[:=]/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
}

/**
 * NTR 生圖：強制旁觀第三人稱，剝掉「玩家第一人稱／from his POV／viewer hands」。
 * （卡面 visualEn 常殘留 from his POV，會把雙人場面畫成玩家視角。）
 */
function scrubNtrObserverCamEn(s) {
  let t = scrubImgPromptLabels(String(s || ""));
  t = t
    .replace(/\bfrom his POV\b/gi, "")
    .replace(/\bfrom her POV\b/gi, "")
    .replace(/\bfirst[-\s]?person( POV)?\b/gi, "")
    .replace(/\bplayer POV\b/gi, "")
    .replace(/\bPOV\b/gi, "")
    .replace(/\bviewer'?s? hands?\b/gi, "")
    .replace(/\bmale hands? in (the )?foreground\b/gi, "")
    .replace(/\blooking (?:at|toward|between) (?:the )?viewer\b/gi, "not looking at camera")
    .replace(/\bbeside him\b/gi, "beside the man")
    .replace(/\bbetween viewer and\b/gi, "with")
    .replace(/\bplayer left out\b/gi, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  return t;
}

/**
 * NTR 生圖核心 tag（前置、權重高）：
 *  必須有 1man 1girl、禁止第一視角、畫出兩人互動。
 *  stage: 1 旁觀互動 / 2 雙人 / 3 猥褻 / 4 性交 / 5 高潮 / 6 結局
 */
function ntrCoreTags(stage, { ending = "" } = {}) {
  const st = Number(stage) || 1;
  // danbooru／SD 通用人數 tag（1man + 1boy 雙寫提高命中）
  const duo = [
    "1man",
    "1girl",
    "1boy",
    "2people",
    "two people",
    "couple",
  ];
  const cam = [
    "third person view",
    "third-person",
    "from side",
    "cinematic",
    "no first person",
    "no first-person",
    "not pov",
    "not from his pov",
    "no pov",
    "no viewer hands",
    "no player hands",
    "not looking at viewer",
  ];
  if (ending === "return") {
    return ["1girl", "solo", "looking at viewer", "soft smile", "reunion", "fully clothed"];
  }
  if (ending === "taken" || st >= 6) {
    return [
      ...duo,
      ...cam,
      "other man leading her away",
      "holding hands",
      "walking together",
      "interaction",
      "fully clothed",
    ];
  }
  if (st >= 5) {
    // L5 高潮
    return [
      ...duo,
      ...cam,
      "sex",
      "fucking",
      "vaginal",
      "penetration",
      "penis",
      "pussy",
      "intercourse",
      "orgasm",
      "ahegao",
      "creampie",
      "climax",
      "pleasure face",
      "tongue out",
      "man fucking woman",
      "two people having sex",
      "physical interaction",
      "nsfw",
      "explicit",
    ];
  }
  if (st >= 4) {
    // L4 交配
    return [
      ...duo,
      ...cam,
      "sex",
      "fucking",
      "vaginal",
      "penetration",
      "penis",
      "pussy",
      "intercourse",
      "man fucking woman",
      "two people having sex",
      "physical interaction",
      "nsfw",
      "explicit",
    ];
  }
  if (st >= 3) {
    // L3 猥褻（性接觸／亂摸；提詞含 sex 系讓模型吃到 NSFW 互動）
    return [
      ...duo,
      ...cam,
      "groping",
      "molestation",
      "breast grab",
      "fondling",
      "male hand on breast",
      "male hands on her body",
      "sexual harassment",
      "sex",
      "erotic",
      "nsfw",
      "explicit",
      "two people intimate contact",
      "physical interaction",
      "man touching woman",
    ];
  }
  if (st >= 2) {
    // L2 玩家不在場雙人互動
    return [
      ...duo,
      ...cam,
      "man and woman together",
      "talking",
      "close distance",
      "physical interaction",
      "interaction between man and woman",
      "fully clothed",
      "sfw",
    ];
  }
  // L1 玩家旁觀：仍是 1man 1girl 互動
  return [
    ...duo,
    ...cam,
    "man talking to woman",
    "man approaching woman",
    "interaction between man and woman",
    "awkward encounter",
    "physical interaction",
    "fully clothed",
    "sfw",
  ];
}

/**
 * 非色情牌：從 action 字串清掉會誘發摸胸／性交的 tag。
 * （CLIP 常把 from his POV + large breasts + nsfw 畫成亂摸。）
 */
function sanitizeConversationActionEn(s) {
  let t = scrubImgPromptLabels(String(s || ""));
  t = t
    .replace(/\b(grop(?:e|ing|es)?|fondl\w*|molest\w*|breast\s*grab|grab(?:bing)?\s*(?:her\s*)?breasts?|paizuri|titjob)\b/gi, "")
    .replace(/\b(bare breasts?|topless|nude|naked|nipples?|areolae?|erect nipples?)\b/gi, "")
    .replace(/\b(sex|fucking|penetration|pussy|penis|vaginal|creampie|ahegao|orgasm face|rolling eyes|tongue out)\b/gi, "")
    .replace(/\b(male hands?|man's hands?|large male hands?|his hands? on)\b/gi, "")
    .replace(/\b(under skirt|skirt lift(?:ed)?|panties pulled|bra pulled|clothes pull)\b/gi, "")
    .replace(/\b(nsfw|explicit)\b/gi, "")
    .replace(/\s*,\s*,+/g, ",")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
  return t;
}

/**
 * 對話／日常牌層③：只補表情／微動作，不強制正對鏡頭。
 * 朝向／距離／座位一律交給層② visualEn（場面）。
 */
function conversationReactionEn(play, def) {
  if (play?.open?.success === false) {
    return "awkward expression, defensive posture, fully clothed";
  }
  const kind = def?.kind || "";
  if (kind === "girl_trait") {
    return "natural expressive face, subtle gesture matching her action, fully clothed";
  }
  if (kind === "venue_event") {
    return "natural expression matching the moment, fully clothed, cinematic pose";
  }
  return "natural expression, speaking or listening, relaxed shoulders, fully clothed";
}

/** 對話生圖用人設：拿掉乳暈等易誘發露點的欄位（罩杯比例仍保留以鎖同人） */
function characterForConversationScene(girl) {
  if (!girl || typeof girl !== "object") return girl;
  const g = { ...girl };
  if (girl.look && typeof girl.look === "object") {
    g.look = { ...girl.look };
    delete g.look.areola;
  }
  return g;
}

/**
 * 從 visualEn／場面旁白判斷「要不要偏離立繪」：
 *  - 玩家是否伸手
 *  - 視線是否看胸／腿／別處
 *  - 站／坐／走
 * 其餘跟立繪：同一張臉、可看向玩家。
 */
function parseCardSceneSpecials(def, play) {
  const ve = String(cardVisualEn(def) || play?.cameraEn || "");
  const scene = String(play?.sceneStart || def?.sceneStart || "");
  const name = String(def?.name || play?.name || "");
  const blob = `${ve}\n${scene}\n${name}`.toLowerCase();
  const zh = `${name}${scene}${ve}`;

  const playerHand =
    /\b(male hands?|his hand|first-?person|armrest|fingertip|reaching|hand in foreground)\b/i.test(ve)
    || /伸手|扶住|牽|拍肩|指尖|扶手|手背|掌心|遞|擦她|整理衣領|提袋|碰/.test(zh)
    || ((def?.tags || []).includes("touch") && !isIntimateContactCard(def));

  let gaze = "default";
  if (/chest|breast|cleavage|看著胸|看胸|胸部/.test(blob + zh)
    && /看|gaze|look|pov|視線/.test(blob + zh)) {
    gaze = "chest";
  } else if (/(thigh|skirt|裙底|大腿)/.test(blob + zh)
    && /看|gaze|look|pov|視線/.test(blob + zh)) {
    gaze = "thighs";
  } else if (
    /\b(looking at (screen|window|horizon|scenery|waves|ahead|away)|eyes toward screen|looking ahead)\b/i.test(ve)
    || /銀幕|螢幕|窗|風景|海平|遠方|別處|櫥窗|看著前方/.test(zh)
  ) {
    gaze = "away";
  } else if (/\b(looking at him|eye contact)\b/i.test(ve) || /對視|看著你|看你/.test(zh)) {
    gaze = "him";
  }

  let posture = "standing";
  if (/\b(sit|seated|sitting|bench|sofa|seat|cinema|chair|bed edge)\b/i.test(ve)
    || /坐下|長椅|座位|影院|床沿|沙發|並坐|扶手/.test(zh)) {
    posture = "sitting";
  } else if (/\b(walk|walking|path|shoreline)\b/i.test(ve) || /散步|走在|步道|踩浪/.test(zh)) {
    posture = "walking";
  }

  return { playerHand, gaze, posture };
}

/** 簡單表情 tag（給立繪基底出卡用） */
function simpleExpressionTags(play, def) {
  const blob = [
    play?.girlLine,
    play?.visualBeatZh,
    play?.visualPose?.face,
    play?.visualPose?.body,
    play?.feelLabel,
    def?.name,
    def?.promptHint,
  ].filter(Boolean).join(" ");
  const rules = [
    [/哭|淚|哭點|tears|crying|sad/i, "crying, tears, sad expression"],
    [/怒|生氣|兇|怒瞪|angry|furious|glare/i, "angry, glare, furrowed brows"],
    [/尷尬|awkward|embarrassed/i, "embarrassed, awkward smile"],
    [/羞|臉紅|shy|blush/i, "shy, blush, bashful"],
    [/開心|笑|快樂|happy|laugh|smile|cheerful/i, "happy, smile, cheerful"],
    [/緊張|nervous/i, "nervous, tense expression"],
    [/溫柔|soft|gentle|warm/i, "soft smile, gentle expression"],
    [/驚|surprise|wide eyes/i, "surprised, wide eyes"],
    [/冷|冷淡|cold/i, "cold expression, neutral"],
  ];
  for (const [re, tags] of rules) {
    if (re.test(blob)) return tags;
  }
  const d = play?.emotionDelta ?? 0;
  if (d <= -3) return "annoyed, cold expression";
  if (d >= 3) return "soft smile, warm expression";
  return "neutral expression, calm";
}

function simplePostureTags(posture) {
  if (posture === "sitting") return "sitting pose, seated";
  if (posture === "walking") return "standing, walking pose";
  return "standing pose";
}

/**
 * 從 visualEn／卡名抽一點「場面差異」tag（不走完整色情運鏡）。
 * 避免每張軟場景 extra 幾乎一樣 → 連 seed 隨機也像同一張。
 */
function softSceneFlavorTags(def, play) {
  const ve = scrubImgPromptLabels(String(play?.cameraEn || cardVisualEn(def) || ""));
  const name = String(def?.name || play?.name || "");
  const scene = String(play?.sceneStart || def?.sceneStart || "");
  const blob = `${ve} ${name} ${scene}`.toLowerCase();
  const tags = [];
  // 場合／道具（有就加，沒有不强行）
  const hints = [
    [/\bcinema|movie|screen|影院|銀幕|電影/, "cinema seat, movie screen glow"],
    [/\bpark|bench|tree|公園|長椅|樹蔭/, "park bench, outdoor daylight"],
    [/\bmall|shop|store|商場|櫥窗|店/, "shopping mall interior, store lights"],
    [/\bbeach|sea|wave|海岸|沙灘|浪/, "beach, ocean horizon, bright sky"],
    [/\bhotel|room|bed|旅館|房|床/, "hotel room interior, soft lamp light"],
    [/\bphone|call|電話|手機/, "holding phone, phone screen light"],
    [/\bcoffee|cafe|cafe|咖啡/, "cafe table, warm indoor light"],
    [/\bnight|晚上|夜/, "night ambience, dim lights"],
    [/\brain|雨/, "rainy mood, wet atmosphere"],
    [/\bdoor|門口|玄關/, "near doorway"],
    [/\bwindow|窗/, "by the window"],
  ];
  for (const [re, tag] of hints) {
    if (re.test(blob)) tags.push(tag);
  }
  // 卡名若含英文運鏡短語，取前幾個安全詞（擋 nsfw）
  if (ve) {
    const safe = ve
      .split(/[,;，、]/)
      .map(s => s.trim())
      .filter(s => s && s.length < 48)
      .filter(s => !/\b(nude|naked|sex|penis|pussy|nsfw|grope|breast grab|areola|nipple)\b/i.test(s))
      .slice(0, 3);
    for (const s of safe) {
      if (!tags.some(t => t.includes(s) || s.includes(t))) tags.push(s);
    }
  }
  return tags.slice(0, 5);
}

/**
 * 從卡面 visualEn／scene 抽「一男一女在做什麼」的互動 tag（NTR L2+ 用）。
 */
function ntrCoupleActionTags(def, play) {
  const ve = scrubNtrObserverCamEn(String(play?.cameraEn || cardVisualEn(def) || ""));
  const name = String(def?.name || play?.name || "");
  const scene = String(play?.sceneStart || def?.sceneStart || "");
  const blob = `${ve} ${name} ${scene}`.toLowerCase();
  const tags = [];
  const rules = [
    [/插進話題|接話|talk|conversation|whisper|低語|叫住|打招呼/, "talking closely, intimate conversation, man speaking to her"],
    [/並肩|三人行|walking|walk side/, "walking side by side, man and woman together"],
    [/扶|hold|elbow|手腕|牽/, "man holding her arm or wrist, guiding her"],
    [/坐|seat|sit|床|sofa|換座/, "sitting close together, man beside her"],
    [/角落|shadow|alcove|牆角/, "standing close in a corner, man cornering her softly"],
    [/撫摸|touch|hand on|裙|thigh|armrest|爆米花/, "man touching her lightly, close body contact"],
    [/廁所|restroom|toilet|淋浴|shower/, "near restroom or private stall, man with her"],
    [/車|car|passenger|副駕/, "by a car or inside car, man with her"],
    [/海|ocean|swim|浪|water|防波堤/, "close together in or by water"],
    [/房|room|hotel|door|進房|走廊|電梯/, "entering room together, man and woman alone"],
    [/笑|joke|笑聲/, "she smiling at him, shared laugh"],
    [/拉|lead|帶|拐/, "man leading her away, she following"],
    [/試衣|fitting/, "man waiting near her, possessive stance"],
    [/專櫃|購物|逛街|衣服/, "man shopping with her, picking clothes for her"],
    [/揉|摸胸|grop|breast|猥褻|亂摸|探裙|裙底/, "man groping her body, male hands on breasts or thighs"],
    [/泳衣|內衣|胸罩|bra|swimsuit/, "hand inside swimsuit or bra, clothes pulled"],
    [/壓|按牆|pin|抵/, "man pinning her, body pressed close"],
  ];
  for (const [re, tag] of rules) {
    if (re.test(blob) || re.test(name)) tags.push(tag);
  }
  // visualEn 安全短詞（已 scrub 掉 POV）
  if (ve) {
    const safe = ve.split(/[,;，、]/).map(s => s.trim()).filter(s => s && s.length < 56)
      .filter(s => !/\b(nude|naked|sex|penis|pussy|nsfw|grope|areola|nipple|pov|first[-\s]?person|viewer)\b/i.test(s))
      .slice(0, 4);
    for (const s of safe) {
      if (!tags.some(t => t.includes(s) || s.includes(t.slice(0, 12)))) tags.push(s);
    }
  }
  return tags.slice(0, 6);
}

/**
 * 立繪基底出卡 extra：
 *  跟立繪同一人 → 改表情／站坐 → 僅在伸手／特殊視線時加特化。
 *  NTR：提詞最前強制 1man 1girl + 禁止第一視角 + 雙人互動；
 *  L3 起加 groping／sex／fucking 等（見 ntrCoreTags）。
 */
function buildPortraitBasedSceneExtra(def, play) {
  const sp = parseCardSceneSpecials(def, play);
  const expr = simpleExpressionTags(play, def);
  const ntrTrack = (def?.dateTrack === "ntr") || play?.dateTrack === "ntr"
    || (def?.tags || []).includes("rival_shadow") || !!play?.rivalName;
  const ntrStage = Number(play?.dateChapterStage ?? def?.dateStage ?? 1) || 1;
  // L1 旁觀；L2 雙人；L3 猥褻；L4 交配；L5 高潮；L6 結局
  const ntrEnding = ntrTrack && ntrStage >= 6;
  const ntrL1Watch = ntrTrack && ntrStage === 1;
  const ntrCouple = ntrTrack && ntrStage >= 2 && ntrStage < 6;
  const ntrMolest = ntrTrack && ntrStage >= 3 && ntrStage < 4;
  const ntrMating = ntrTrack && ntrStage >= 4 && ntrStage < 5;
  const ntrClimax = ntrTrack && ntrStage >= 5 && ntrStage < 6;

  const pushNtrVe = (parts, max = 10) => {
    const ve = scrubNtrObserverCamEn(String(play?.cameraEn || cardVisualEn(def) || ""));
    if (!ve) return;
    ve.split(/[,;，、]/).map(s => s.trim()).filter(Boolean).slice(0, max).forEach(t => {
      if (/\b(pov|first[-\s]?person|viewer'?s?\s*hands?|from his)\b/i.test(t)) return;
      if (!parts.some(p => String(p).toLowerCase() === t.toLowerCase()
        || String(p).includes(t) || t.includes(String(p).slice(0, 10)))) {
        parts.push(t);
      }
    });
  };
  const pushNtrEnv = (parts) => {
    if ((def?.kind || "") !== "venue_event") return;
    const env = {
      cinema: "cinema",
      park: "park",
      mall: "mall",
      beach: "beach",
      hotel: "hotel room",
    };
    const vid = (def.venueIds || [])[0];
    if (vid && env[vid]) parts.push(env[vid], "detailed background");
  };
  /** 身份鎖放後面，人數／動作 tag 放最前（CLIP 前段權重） */
  const ntrIdentityTail = () => [
    expr,
    "same woman as reference portrait",
    "keep same face",
    "same hair",
    "same body",
    "anime",
  ].filter(Boolean);

  // L6 結局
  if (ntrEnding) {
    const end = play?.dateEnding || def?.dateEnding || "";
    const parts = [
      ...ntrCoreTags(6, { ending: end === "return" ? "return" : "taken" }),
      ...ntrIdentityTail(),
    ];
    if (end === "taken") {
      parts.push("NTR ending", "she looking back", "bittersweet");
    } else {
      parts.push("gentle", "no other man", "solo girl returning");
    }
    for (const t of softSceneFlavorTags(def, play)) parts.push(t);
    pushNtrVe(parts, 6);
    return scrubImgPromptLabels(parts.join(", "));
  }

  // L1：1man 1girl 互動，第三人稱
  if (ntrL1Watch) {
    const parts = [
      ...ntrCoreTags(1),
      "man talking to her",
      "she reacting to him",
      "looking at the man",
      ...ntrIdentityTail(),
    ];
    for (const t of ntrCoupleActionTags(def, play)) parts.push(t);
    for (const t of softSceneFlavorTags(def, play)) parts.push(t);
    pushNtrVe(parts, 8);
    pushNtrEnv(parts);
    return scrubImgPromptLabels(parts.join(", "));
  }

  if (ntrCouple) {
    const parts = [
      ...ntrCoreTags(ntrStage),
      ...ntrIdentityTail(),
    ];
    if (ntrClimax) {
      parts.push(
        "ahegao",
        "orgasm face",
        "legs wrapped around man",
        "embracing the man",
        "sweat",
        "clothes pulled aside",
      );
    } else if (ntrMating) {
      parts.push(
        "clothes pulled aside",
        "partially undressed",
        "ahegao or resistance face",
        "sex position",
      );
    } else if (ntrMolest) {
      parts.push(
        "clothes still on",
        "hand under clothes",
        "she resisting or flustered",
        "blush",
        "open mouth",
      );
    } else {
      // L2
      parts.push(
        "looking at the man",
        "private moment",
        "standing or sitting together",
      );
    }
    for (const t of ntrCoupleActionTags(def, play)) parts.push(t);
    for (const t of softSceneFlavorTags(def, play)) parts.push(t);
    // L3+ 允許卡面 visualEn 的 sex／grope 詞進來
    pushNtrVe(parts, ntrStage >= 3 ? 12 : 8);
    pushNtrEnv(parts);
    return scrubImgPromptLabels(parts.join(", "));
  }

  const parts = [
    "same character as reference portrait",
    "keep same face, hair, body, outfit",
    "portrait character base",
    simplePostureTags(sp.posture),
    expr,
    "fully clothed",
  ];

  // 視線：預設跟立繪看向玩家；只有特殊才改
  if (sp.gaze === "away") {
    parts.push("looking away from viewer", "looking at scenery or screen or window");
  } else if (sp.gaze === "chest") {
    parts.push("from his POV", "looking toward her chest", "upper body", "she reacts to being looked at");
  } else if (sp.gaze === "thighs") {
    parts.push("from his POV", "looking toward her thighs or legs", "she may react");
  } else {
    // default / him：立繪感
    parts.push("looking at viewer");
  }

  if (sp.playerHand) {
    parts.push(
      "first-person POV",
      "male hand in foreground",
      "male hands",
      "light natural touch or gesture",
    );
  }

  // 極淡環境（不重寫整張構圖）
  if ((def?.kind || "") === "venue_event") {
    const env = {
      cinema: "cinema soft background",
      park: "park soft background",
      mall: "mall soft background",
      beach: "beach soft background",
      hotel: "hotel room soft background",
    };
    const vid = (def.venueIds || [])[0];
    if (vid && env[vid]) parts.push(env[vid]);
  }

  // 卡專屬場面差：每張卡 extra 不完全一樣
  for (const t of softSceneFlavorTags(def, play)) parts.push(t);

  // NTR L1：第三人剛出現（三角），尚未「帶遠」
  if (ntrTrack) {
    parts.push(
      "another man present in scene",
      "third person nearby",
      "awkward triangle composition",
    );
  }

  parts.push("no groping", "not explicit", "clean illustration");
  return scrubImgPromptLabels(parts.join(", "));
}

/**
 * 台詞就緒後：
 *  - 軟場景（對話／場地／非色情）：不跑長 AI 運鏡；只記簡單表情，visualEn 留給特化判斷
 *  - 色情：仍走完整層③
 */
async function ensureCardImgEnAfterText(girl, play, gen) {
  const def = play?.cardId ? Cards.cardById(play.cardId) : null;
  const fb = visualBeatFallback(play, def, girl);
  const cam = scrubImgPromptLabels(cardVisualEn(def) || fb.visual_en || "");

  // 立繪基底路線：表情簡標 + 保留 visualEn 供伸手／視線特化
  if (shouldSkipLayer3Ai(def, play) || isSoftSafeScene(def, play)) {
    const expr = simpleExpressionTags(play, def);
    const sp = parseCardSceneSpecials(def, play);
    play.imgEn = expr;
    play.visualBeatEn = expr;
    play.cameraEn = cam;
    play.sceneSpecials = sp;
    play.visualBeatZh = `表情：${expr}；姿勢：${sp.posture}`;
    play.visualPose = {
      face: expr,
      body: sp.posture,
      text: `表情：${expr}\n動作：${sp.posture}`,
    };
    return expr;
  }

  // 無模型：沒有層 ③，生圖只靠 ①+②
  if (!state.settings?.model) {
    play.imgEn = "";
    play.visualBeatEn = "";
    play.visualBeatZh = fb.visual_zh;
    play.cameraEn = cam;
    return "";
  }

  // A) 表情／動作（給畫圖，不是玩家主台詞）——僅親密／她主動偏色
  if (!play.visualPose) {
    const poseKey = `cardpose:${girl.id}:${play.cardId}:${gen}`;
    const deadlinePose = Date.now() + 60000;
    let rp = await genPost(poseKey, cardVisualPoseMsgs(girl, play), 11);
    while (rp && Date.now() < deadlinePose) {
      if (cardSceneJob.gen !== gen) return null;
      if (rp.status === "done" && rp.result) {
        const { text } = stripGuardFlag(
          typeof rp.result === "string" ? rp.result : String(rp.result ?? ""),
        );
        const pose = parseCardVisualPose(text);
        if (pose) {
          play.visualPose = pose;
          play.visualPoseText = pose.text;
          play.visualBeatZh = `表情：${pose.face}；動作：${pose.body}`;
        }
        break;
      }
      if (rp.status === "error") break;
      await new Promise(res => setTimeout(res, 700));
      rp = await genPost(poseKey, cardVisualPoseMsgs(girl, play), 11);
    }
  }

  // B) 層 ③ 英文反應 tag
  const key = `cardimgen:${girl.id}:${play.cardId}:${gen}`;
  const deadline = Date.now() + 90000;
  let r = await genPost(key, cardImgEnMsgs(girl, play, def), 11);
  while (r && Date.now() < deadline) {
    if (cardSceneJob.gen !== gen) return null;
    if (r.status === "done" && r.result) {
      const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
      let en = scrubImgPromptLabels(text.replace(/[\u4e00-\u9fff]+/g, " "));
      en = en.replace(/[\u4e00-\u9fff]/g, " ").replace(/\s+/g, " ").trim();
      // 太短才用保底反應，仍不塞運鏡
      if (en.length < 8) en = reactionFallbackEn(play);
      play.imgEn = en;
      play.visualBeatEn = en;
      play.cameraEn = scrubImgPromptLabels(cardVisualEn(def) || fb.visual_en || "");
      if (!play.visualBeatZh) play.visualBeatZh = fb.visual_zh;
      return en;
    }
    if (r.status === "error") break;
    await new Promise(res => setTimeout(res, 700));
    r = await genPost(key, cardImgEnMsgs(girl, play, def), 11);
  }
  const en = reactionFallbackEn(play);
  play.imgEn = en;
  play.visualBeatEn = en;
  play.cameraEn = scrubImgPromptLabels(cardVisualEn(def) || fb.visual_en || "");
  if (!play.visualBeatZh) play.visualBeatZh = fb.visual_zh;
  return en;
}

/** 層 ③ 保底（無模型／翻譯失敗）：只給中性可見神態，不寫運鏡 */
function reactionFallbackEn(play) {
  if (play?.open?.success === false) return "rejecting expression, pulling back, defensive posture";
  const pose = play?.visualPose;
  if (pose?.face || pose?.body) {
    // 中文保底直出不了 CLIP 時用中性可畫 tag
    return "responsive facial expression, natural body language, reacting to him";
  }
  return "responsive expression, natural pose, reacting to him";
}

/** 卡牌專用畫圖描述（英文）；子卡有寫用子，否則沿 parentId 繼承 */
function cardVisualEn(def) {
  if (!def) return "";
  let cur = def;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const v = (cur.visualEn || cur.imgPrompt || "").trim();
    if (v) return v;
    cur = cur.parentId ? Cards.cardById(cur.parentId) : null;
  }
  return "";
}

function cardVisualZh(def) {
  if (!def) return "";
  let cur = def;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    const v = (cur.visualZh || "").trim();
    if (v) return v;
    cur = cur.parentId ? Cards.cardById(cur.parentId) : null;
  }
  return "";
}

/** 是否為「色／性接觸」類卡（玩家猥褻／前戲／正戲） */
function isIntimateContactCard(def) {
  const kind = def?.kind || "";
  return kind === "erotic" || kind === "foreplay" || kind === "intercourse" || kind === "sex";
}

/**
 * 妹子本體牌是否「她主動偏色」（脫／上手／內衣）——仍不是玩家亂摸胸。
 * 用於微調層②保底與禁止 chain 沿用摸胸圖。
 */
function isGirlLedLewdTrait(def) {
  if ((def?.kind || "") !== "girl_trait") return false;
  const s = `${def?.name || ""} ${def?.sceneStart || ""}`;
  // 勿用單字「喘／色」——會誤傷「喘不過氣」等對話句
  return /脫衣|脫掉|先脫|內衣|上手|先摸|摸你|穿著做|慾望|色氣|痴女|吻你|親過來|上床|做愛|性交|脫氛圍/.test(s)
    || /\b(lingerie|undress|seduc)\b/i.test(def?.visualEn || "");
}

/**
 * 對話／輕互動（話術、妹子日常）：可跳過層③ AI、用 sfw。
 * 不含 venue_event——場地要走電影構圖，不可被「對話半身正對」管線帶走。
 */
function isConversationCard(def) {
  const kind = def?.kind || "";
  if (kind === "speech" || kind === "shop_premium") return true;
  if (kind === "girl_trait") return !isGirlLedLewdTrait(def);
  return false;
}

/** 場地／約會章節：身歷其境場景圖（並肩、側坐、遠近），禁止半身立繪 ref 鎖死正臉 */
function isVenueSceneCard(def, play = null) {
  if (play?.fromDateChapter) return true;
  return (def?.kind || "") === "venue_event";
}

/** 非色情、需穿衣／禁摸胸的軟場景（對話 + 場地） */
function isSoftSafeScene(def, play = null) {
  return isConversationCard(def) || isVenueSceneCard(def, play);
}

/** 跳過層③ AI（避免亂加正對／摸胸） */
function shouldSkipLayer3Ai(def, play = null) {
  return isSoftSafeScene(def, play);
}

/**
 * 這一拍生圖要不要強調「男手在碰她」。
 * 普通 speech／打招呼：禁止因「hand gestures」就塞 male hands（會整圖變摸胸）。
 */
function cardNeedsContactHands(def, camEn = "") {
  if (isIntimateContactCard(def)) return true;
  const kind = def?.kind || "";
  const tags = def?.tags || [];
  const s = String(camEn || "");
  // 話術／本體／場地：只有 visualEn 寫了明確性接觸才加手
  if (kind === "speech" || kind === "girl_trait" || kind === "venue_event" || kind === "shop_premium") {
    return /\b(grop(?:e|ing)?|breast\s*grab|grab(?:bing)?\s*breast|fondl|molest|under\s*skirt|pussy|penetration|sex|fucking|strip(?:ping)?|caress(?:ing)?\s*breast)\b/i.test(s);
  }
  if (tags.includes("sex")) return true;
  // touch 標籤 alone（拍肩、牽手）≠ 摸胸；要看 visualEn 是否親密
  if (tags.includes("touch")) {
    return /\b(grop|breast|chest\s*grab|fondl|molest|waist|hip|thigh|ass|butt|embrace|hug from behind|arms around)\b/i.test(s)
      || isIntimateContactCard(def);
  }
  return /\b(grop|fondl|molest|penetration|sex|fucking)\b/i.test(s);
}

/**
 * 把「觸碰的手」鎖成玩家／男主 POV 手（tag 形式）。
 * 例：first-person POV, male hands, large male hands
 * 只在親密接觸牌／明確摸她時呼叫——普通話術不要鎖男手。
 */
function lockPlayerHandsInVisualEn(def, camEn) {
  let s = scrubImgPromptLabels(String(camEn || "").trim());
  if (!s) return s;
  if (!cardNeedsContactHands(def, s)) return s;

  // 歧義 hand → male hand（避免畫成她自摸）
  if (/\bhands?\b/i.test(s) && !/\b(male|man'?s|his|pov|viewer'?s|masculine)\b/i.test(s)) {
    s = s
      .replace(/\bher hands?\b/gi, "covering")
      .replace(/\bhands?\b/gi, (m) => (m.toLowerCase() === "hands" ? "male hands" : "male hand"));
  }

  const parts = [];
  if (!/\b(first-?person\s*pov|pov)\b/i.test(s)) parts.push("first-person POV");
  if (!/\bmale hands?\b/i.test(s)) parts.push("male hands", "large male hands");
  if (!/\b(no self-?touch|not self-?touch)\b/i.test(s)) parts.push("no self-touch");
  if (!parts.length) return s;
  return `${s}, ${parts.join(", ")}`.replace(/\s+,/g, ",").replace(/,\s*,+/g, ", ").trim();
}

/**
 * 補齊身體／衣物 TAG（逗號短詞，非敘事句）。
 * 例：skirt lift, bare breasts, breasts, panties around thighs
 * 僅色情／前戲／正戲；普通話術（含 touch 拍肩牽手）不走這條，避免裸胸污染。
 */
function enrichBodyActionInVisualEn(def, camEn) {
  let s = scrubImgPromptLabels(String(camEn || "").trim());
  if (!s) return s;
  const kind = def?.kind || "";
  // 硬擋：speech / girl_trait / venue 永不自動補 bare breasts 等
  if (kind === "speech" || kind === "girl_trait" || kind === "venue_event" || kind === "shop_premium") {
    return s;
  }
  if (!(kind === "erotic" || kind === "foreplay" || kind === "intercourse" || kind === "sex"
    || (def?.tags || []).includes("sex"))) {
    return s;
  }
  const name = String(def?.name || "");
  const id = String(def?.id || "");
  const low = s.toLowerCase();
  const extras = [];

  const has = (re) => re.test(low);
  const nameHas = (re) => re.test(name);
  const addIf = (re, tags) => {
    if (!has(re)) for (const t of tags) extras.push(t);
  };

  // 衣物 — 必須寫「哪一件 + 狀態」
  if (nameHas(/裙|裙底|撩裙/) || has(/\bskirt\b/) || id.includes("w0008")) {
    addIf(/\b(skirt lifted|skirt raised|under skirt)\b/, ["skirt lifted", "skirt raised"]);
  }
  if (nameHas(/底褲|內褲|褪下|絆|勒/) || has(/\bpant(?:y|ies)\b/) || id.startsWith("s0004")) {
    addIf(/\b(panties pulled down|panties around)\b/, ["panties pulled down", "panties around thighs", "bare hips", "pussy"]);
  }
  if (nameHas(/褲|脫褲/) && !nameHas(/底褲|內褲/)) {
    addIf(/\b(pants pulled down|pants around)\b/, ["pants pulled down", "pants around knees", "panties pulled down"]);
  }
  if (nameHas(/扯開|剝|半裸|肩帶|脫|垮|扯衣/) || id.startsWith("s0002")
    || has(/\b(blouse|shirt|bra|strap)\b/)) {
    addIf(/\b(blouse pulled|shirt pulled|bra pulled|bare breasts)\b/, [
      "blouse pulled open", "shirt pulled open", "bra pulled down",
      "bare breasts", "breasts", "nipples",
    ]);
  }

  // 正戲必須有 sex / fucking
  if (kind === "intercourse" || kind === "sex" || nameHas(/插|幹|做|射|中出|抽送|高潮/)) {
    addIf(/\b(sex|fucking)\b/, ["sex", "fucking", "vaginal", "penetration"]);
  }

  // 表情／高潮
  if (nameHas(/高潮|潮吹|失神|翻白|去了/) || (def?.sexPhase === "climax")) {
    addIf(/\b(ahegao|orgasm face)\b/, ["ahegao", "orgasm face", "rolling eyes", "tongue out", "tears"]);
  } else if (kind === "erotic" || kind === "foreplay") {
    addIf(/\b(blush|resistance|tears)\b/, ["blush", "tears", "resistance"]);
  }

  // 身體姿勢 — tag
  if (nameHas(/開腿|M字|壓膝|分開/) || has(/\b(spread legs|m legs|missionary)\b/)) {
    addIf(/\b(spread legs|missionary|inner thighs)\b/, ["missionary", "spread legs", "inner thighs"]);
  }
  if (nameHas(/後入|背後|撈腰後|按頭後/) || has(/\b(doggy|from behind)\b/)) {
    addIf(/\b(doggy style|from behind|arched back)\b/, ["doggy style", "from behind", "arched back", "looking back"]);
  }
  if (nameHas(/牆|抵牆|撞牆/) || has(/\bagainst wall\b/)) {
    addIf(/\b(against wall|wall sex|one leg up)\b/, ["against wall", "wall sex", "standing sex", "one leg up"]);
  }
  if (nameHas(/腿軟|軟腿|軟著/) || has(/\b(weak knees|trembling legs)\b/)) {
    addIf(/\b(weak knees|trembling)\b/, ["weak knees", "trembling legs"]);
  }
  if (nameHas(/抱|空中|扛/) || has(/\b(suspended|feet off|carried)\b/)) {
    addIf(/\b(suspended congress|feet off ground|legs around)\b/, ["suspended congress", "legs around waist", "feet off ground"]);
  }
  if (nameHas(/潮|濕|過敏/) || has(/\b(wet|squirting|pussy juice)\b/)) {
    addIf(/\b(wet|squirting)\b/, ["wet pussy", "squirting"]);
  }

  // 取景 tag（缺才補）
  if (!has(/\b(close-?up|low angle|high angle|from below|from above|half body|full body|lower body|hips focus|breasts focus|from behind|side view|three-quarter)\b/)) {
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
    const frames = ["close-up", "low angle", "lower body focus", "half body", "high angle", "from behind"];
    extras.push(frames[Math.abs(h) % frames.length]);
  }

  if (!extras.length) return s;
  const seen = new Set(low.split(/,\s*/).map((x) => x.trim()).filter(Boolean));
  const uniq = [];
  for (const t of extras) {
    const k = t.toLowerCase();
    if (seen.has(k) || low.includes(k)) continue;
    seen.add(k);
    uniq.push(t);
  }
  if (!uniq.length) return s;
  return `${s}, ${uniq.join(", ")}`.replace(/\s+,/g, ",").replace(/,\s*,+/g, ", ").trim();
}

/** 層②：先補身體／衣物 tag，再鎖男手 tag */
function finalizeCardVisualEn(def, camEn) {
  return lockPlayerHandsInVisualEn(def, enrichBodyActionInVisualEn(def, camEn));
}

/**
 * 畫面定格保底（NSFW）：visualEn 用逗號 TAG，非敘事句。
 */
function visualBeatFallback(play, def, girl = null) {
  const tags = def?.tags || [];
  const kind = def?.kind || "speech";
  const name = play?.name || def?.name || "";
  // 旁白先綁女子（[eye]、[breast]、[name]…）
  let sceneRaw = String(play?.sceneStart || def?.sceneStart || "");
  if (girl && Cards.resolveCardBinds) {
    sceneRaw = Cards.resolveCardBinds(
      sceneRaw,
      Cards.bindContextFromGirl?.(girl, playerBindName()),
    ) || sceneRaw;
  }
  const scene = sceneRaw.slice(0, 220);
  const gName = girl?.name || play?._boundName || "";
  const cardVis = cardVisualEn(def);
  const cardVisZh = cardVisualZh(def);
  // 層 ②：英文 TAG（保底；有 visualEn 時以卡面為準）
  // 禁止一律 looking at viewer——朝向／距離交給 visualEn 或下方依場面推斷
  let camEn = "from his POV, medium shot, natural staging, fully clothed, cinematic";
  let camZh = "描寫她：依場面自然站位與朝向。";
  if (cardVis) {
    camEn = cardVis;
    camZh = cardVisZh || `描寫她：牌「${name || "這一拍"}」這一刻的畫面。`;
  } else if (kind === "intercourse" || kind === "sex" || tags.includes("sex")
    || /性交|插入|抽插|騎乘|後入|口交|中出/.test(name + scene)) {
    camEn = "first-person POV, male hands, sex, vaginal, penetration, penis, pussy, spread legs, arched back, sweat, open mouth, nsfw, explicit";
    camZh = "描寫她：性交中的身體、結合部位；觸碰的是男手／玩家手。";
  } else if (kind === "foreplay" || kind === "erotic"
    || /猥|摸胸|揉胸|解衣|剝|底褲|裙底/.test(name + scene)) {
    camEn = "first-person POV, male hands, large male hands, groping, clothes pull, half body, blush, nsfw";
    camZh = "描寫她：被男手摸的部位、衣物錯位、掙扎或僵住（不是她自摸）。";
  } else if (tags.includes("kiss") || /吻/.test(name)) {
    camEn = "from his POV, close distance, kiss, three-quarter view of her face, blush, parted lips, fully clothed upper body";
    camZh = "描寫她：被吻時的臉；近距離，非證件照正對。";
  } else if (tags.includes("touch") && (kind === "speech" || kind === "girl_trait")) {
    camEn = "from his POV, medium shot, she nearby, three-quarter view, light contact moment, fully clothed, natural pose, NO groping";
    camZh = "描寫她：輕觸互動時的姿態與距離。";
  } else if (kind === "girl_trait") {
    if (isGirlLedLewdTrait(def) || /脫|上手|內衣|先摸/.test(name + scene)) {
      camEn = "from his POV, medium shot, she at arm's length or closer, three-quarter view, she-led intimate pose, may glance at him, fully or mostly clothed, NO viewer groping";
      camZh = "描寫她：她主動親密姿態；自然朝向。";
    } else if (tags.includes("touch") || /黏|貼|抱|拉|靠|湊近|袖/.test(name + scene)) {
      camEn = "from his POV, medium shot, she beside or leaning toward him, three-quarter or side view, light contact, fully clothed, NO groping";
      camZh = "描寫她：側旁靠近／輕觸，非正對鏡頭。";
    } else {
      camEn = "from his POV, medium shot, natural room distance, three-quarter view, she speaking or gesturing, may look at him or slightly aside, fully clothed, conversational staging, NO groping";
      camZh = "描寫她：自然對話距離與朝向。";
    }
  } else if (tags.includes("talk") || kind === "speech") {
    camEn = "from his POV, medium shot, conversational distance, three-quarter view of her, natural expression, fully clothed, not a passport photo pose";
    camZh = "描寫她：對話距離的自然半身，非強制正對。";
  } else if (kind === "venue_event") {
    camEn = "from his POV, environmental medium shot, she placed naturally in the scene, may be beside or ahead, three-quarter or side view, fully clothed, cinematic date staging";
    camZh = "描寫她：場地內自然位置與朝向。";
  }
  camEn = finalizeCardVisualEn(def, camEn);
  const visual_zh = [
    gName ? `對象是「${gName}」。` : "",
    camZh,
    scene ? `場面：${scene.slice(0, 100)}` : "",
  ].filter(Boolean).join("");
  return { visual_zh, visual_en: camEn };
}

/** 從 visualEn 推 framing（head/half/full）
 *  坐姿／影院鄰座 → half（避免 full 的 standing 標籤打架）
 *  走路／室外寬景 → full
 */
function framingFromCameraEn(camEn, tags = []) {
  const s = String(camEn || "").toLowerCase();
  if (/\b(doggy style|standing sex|suspended congress|mating press)\b/.test(s)) {
    return "full";
  }
  // 坐姿優先 half（影院、長椅、床沿、吧台）— 不可 full+standing
  if (/\b(seated|sitting|seat|bench|sofa|bed edge|armrest|cinema dark|in dark cinema)\b/.test(s)) {
    return "half";
  }
  // 走路／室外／大廳寬景
  if (/\b(medium-wide|wide shot|walking|shoreline|park path|aisle|lobby|hallway|side by side|beach|golden hour|escalator)\b/.test(s)) {
    return "full";
  }
  if (/\b(full body|from behind|against wall)\b/.test(s) && !/\bseated\b/.test(s)) {
    return "full";
  }
  if (/\b(lower body focus|hips focus|under skirt|inner thigh|panties around|pussy)\b/.test(s)
    && !/\b(face focus|close-up face)\b/.test(s)) {
    return "half";
  }
  if (/\b(face focus|close-up face|head and shoulders|ear focus)\b/.test(s)
    && !/\b(breast|pussy|sex|penetration|thigh|profile|side view)\b/.test(s)) {
    return "head";
  }
  if (tags.includes("sex") || /\b(sex|vaginal|penetration|creampie)\b/.test(s)) return "full";
  if (/\b(profile|side view|three-quarter|over.?the.?shoulder|window)\b/.test(s)) {
    return "half";
  }
  if (tags.includes("kiss") || tags.includes("touch")) return "half";
  return "half";
}

/** 定格（NSFW）：主動描寫妹子被猥褻／性交的身體與場面，供插圖與回話共用 */
function visualBeatMsgs(girl, play, def) {
  const tags = (def?.tags || []).join(", ");
  const player = playerBindName();
  const bctx = Cards.bindContextFromGirl?.(girl, player) || {};
  const sceneBound = Cards.resolveCardBinds?.(
    play?.sceneStart || def?.sceneStart || "",
    bctx,
  ) || (play?.sceneStart || def?.sceneStart || "—");
  const vEn = cardVisualEn(def);
  const vZh = cardVisualZh(def);
  return [
    {
      role: "system",
      content: [
        "你是 NSFW 成人遊戲的分鏡師。任務：把這一拍收成同一個鏡頭，供插圖使用。",
        "核心：畫面主詞是【妹子的身體與她被怎麼對待】——猥褻、解衣、愛撫、性交都要寫得具體、可畫。",
        "要寫：她的哪個部位被碰／被看／被插入、衣物狀態、表情與肢體（掙扎、僵住、發熱、被迫打開等）。",
        "可以寫玩家的手／下身作為作用來源，但不要只寫空運鏡；禁止只寫心理獨白。",
        "必須鎖定這一位女子；若有 visualEn，英文 tags 必須服從它並可加細。",
        "成人露骨描寫允許（含胸部、下體、結合、精液等，依牌意）。",
        "輸出格式（嚴格兩段，不要其他字）：",
        "VISUAL_ZH:",
        "（繁中 2～4 句：她的身體被做了什麼、部位、衣物、表情肢體。）",
        "VISUAL_EN:",
        "（英文視覺 tags：her body state, molestation or sex act on her, contact points, clothing state, face/pose. No Chinese. No dialogue.）",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `女子：${girl?.name || bctx.name || "—"} · 眼:${bctx.eye || "—"} · 胸:${bctx.breast || "—"} · 髮:${bctx.hair || "—"}`,
        `玩家：${player}`,
        `卡牌：${def?.name || play?.name || ""} tags=${tags || "—"}`,
        vEn ? `【卡牌畫圖描述 visualEn·權威·主動寫她】\n${vEn}` : "",
        vZh ? `【卡牌畫圖中文備註】\n${vZh}` : "",
        `場面旁白（已綁定；須對齊對她做的事）：\n${sceneBound}`,
        play?.open?.success === false ? "肢體結果：她推開／退開，但仍可見被碰過的身體狀態。" : "",
        play?.open?.success ? "肢體結果：侵犯／親密有被推進。" : "",
        "請輸出 VISUAL_ZH 與 VISUAL_EN。英文段必須主動描寫她的身體與性場面，不要只寫 camera。",
      ].filter(Boolean).join("\n"),
    },
  ];
}

function parseVisualBeat(raw) {
  const t = String(raw || "").trim();
  let zh = "", en = "";
  const mZh = t.match(/VISUAL_ZH\s*[:：]\s*([\s\S]*?)(?=VISUAL_EN\s*[:：]|$)/i);
  const mEn = t.match(/VISUAL_EN\s*[:：]\s*([\s\S]*?)$/i);
  if (mZh) zh = mZh[1].trim();
  if (mEn) en = mEn[1].trim();
  if (!zh && !en) {
    // 整段當中文定格
    zh = t.slice(0, 280);
  }
  zh = zh.replace(/^["「]+|["」]+$/g, "").slice(0, 320);
  en = en.replace(/^["']+|["']+$/g, "").slice(0, 500);
  return { visual_zh: zh, visual_en: en };
}

/**
 * 為這一拍產出畫面定格（寫入 play.visualBeatZh / visualBeatEn）。
 * 圖與回話都必須用這份，才不會各講各的。
 */
async function ensurePlayVisualBeat(girl, play, gen) {
  const def = play.cardId ? Cards.cardById(play.cardId) : null;
  // 先把 scene 綁到這位女子，後續定格／圖都吃同一份
  if (play.sceneStart || def?.sceneStart) {
    const raw = play.sceneStart || def?.sceneStart || "";
    play.sceneStart = Cards.resolveCardBinds?.(
      raw,
      Cards.bindContextFromGirl?.(girl, playerBindName()),
    ) || raw;
  }
  const fb = visualBeatFallback(play, def, girl);
  if (!state.settings?.model) {
    play.visualBeatZh = fb.visual_zh;
    play.visualBeatEn = fb.visual_en;
    return fb;
  }
  const key = `cardbeat:${girl.id}:${play.cardId}:${gen}`;
  const deadline = Date.now() + 75000;
  let r = await genPost(key, visualBeatMsgs(girl, play, def), 11);
  while (r && Date.now() < deadline) {
    if (cardSceneJob.gen !== gen) return null;
    if (r.status === "done" && r.result) {
      const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
      const parsed = parseVisualBeat(text);
      const visual_zh = parsed.visual_zh.length >= 8 ? parsed.visual_zh : fb.visual_zh;
      const visual_en = parsed.visual_en.length >= 12 ? parsed.visual_en : fb.visual_en;
      play.visualBeatZh = visual_zh;
      play.visualBeatEn = visual_en;
      return { visual_zh, visual_en };
    }
    if (r.status === "error") break;
    await new Promise(res => setTimeout(res, 700));
    r = await genPost(key, visualBeatMsgs(girl, play, def), 11);
  }
  play.visualBeatZh = fb.visual_zh;
  play.visualBeatEn = fb.visual_en;
  return fb;
}

/**
 * 出卡場景圖（文字就緒後呼叫）：
 * 1) 依「動作 + 她的回話」產純英文畫圖句
 * 2) 再生圖（不塞 card token / stage direction 等標籤）
 */
function queueCardSceneArt(girl, play, onDone) {
  const done = (ok) => {
    try { onDone && onDone(ok); } catch (e) { console.warn(e); }
  };

  if (!girl || !play?.cardId) {
    console.warn("[cardSceneArt] skip: no girl/cardId");
    done(false);
    return;
  }
  if (!cardSceneArtOn()) {
    const why = cardSceneArtWhyOff();
    console.warn("[cardSceneArt] skip:", why);
    if (!cardUi._sceneArtWarned) {
      cardUi._sceneArtWarned = true;
      toast(`出卡場景圖略過：${why}`, "");
    }
    done(false);
    return;
  }
  // 同一 play 物件不重複排；但「卡上已有舊圖」絕不能當完成而跳過——每次出卡都要重畫
  if (play._sceneArtQueued) return;
  play._sceneArtQueued = true;

  const gen = (cardSceneJob.gen || 0) + 1;
  cardSceneJob.gen = gen;
  cardSceneJob.cardId = play.cardId;
  cardSceneJob.girlId = girl.id;

  const cg = ensureCardCgMap(girl);
  const key = `card:${play.cardId}`;
  delete cg[key];
  syncPortraitCgCache(girl);
  // 占位：本桌上一張場景（連續感）；首張才是半身
  const placeUrl = cardTablePlaceUrl(girl);
  // 失敗回退：仍留在鏈上／半身，不要空白
  const fallbackUrl = placeUrl || "";
  cg[key] = {
    url: placeUrl,
    status: "pending",
    at: Date.now(),
    source: cardSceneChainUrl() ? "scene_chain_hold" : "scene_pending",
  };

  cardUi.sceneArtPending = true;
  if (document.body.classList.contains("card-mode") && girlForSession()?.id === girl.id) {
    setCtPortrait(girl, { cardId: play.cardId });
  }

  (async () => {
    let ok = false;
    try {
      // 1) 純英文場面（吃 girlLine + visualEn），不要 meta 標籤
      const sceneEn = await ensureCardImgEnAfterText(girl, play, gen);
      if (cardSceneJob.gen !== gen) { done(false); return; }
      if (cardUi.lastPlay === play || cardUi.lastPlay?.cardId === play.cardId) {
        if (cardUi.lastPlay) {
          cardUi.lastPlay.imgEn = play.imgEn;
          cardUi.lastPlay.visualBeatEn = play.visualBeatEn;
          cardUi.lastPlay.visualBeatZh = play.visualBeatZh;
        }
      }
      const en = scrubImgPromptLabels(sceneEn || play.imgEn || play.visualBeatEn || "");
      console.info("[cardSceneArt] imgEn:", en.slice(0, 160));

      // 2) 生圖：key 必須每次唯一（含時間戳），否則 gen_tasks 會回舊 done 同圖
      const imgKey = `cardscene-img:${girl.id}:${play.cardId}:${gen}:${Date.now().toString(36)}`;
      cardSceneJob.key = imgKey;
      const url = await weaveCardSceneShot(girl, en, imgKey, play);
      const stillThisJob = cardSceneJob.gen === gen;

      if (url) {
        // 加版本避免瀏覽器把同 path 舊場景圖當完成
        const bust = url.includes("?") ? url : `${url.split("#")[0]}?v=${Date.now()}`;
        cg[key] = {
          url: bust,
          status: "ready",
          at: Date.now(),
          source: "scene_play",
          sceneEn,
          visualBeatZh: play.visualBeatZh || "",
        };
        // 本桌鏈：下一張從此圖 image_edit 接續
        rememberCardSceneChain(bust);
        ok = true;
        dirty = true;
        scheduleSave();
        if (stillThisJob
          && document.body.classList.contains("card-mode")
          && girlForSession()?.id === girl.id
          && cardUi.lastPlay?.cardId === play.cardId) {
          setCtPortrait(girl, { cardId: play.cardId });
        }
      } else if (stillThisJob) {
        console.warn("[cardSceneArt] imggen failed", { imgKey, provider: imgProvider() });
        if (cg[key]?.status === "pending") {
          cg[key] = {
            url: fallbackUrl,
            status: fallbackUrl ? "ready" : "error",
            at: Date.now(),
            source: fallbackUrl ? "alias_portrait" : "scene_error",
            visualBeatZh: play.visualBeatZh || "",
          };
        }
        if (document.body.classList.contains("card-mode") && girlForSession()?.id === girl.id) {
          setCtPortrait(girl, { cardId: play.cardId });
        }
      }
      if (stillThisJob) done(ok);
    } catch (e) {
      console.warn("[cardSceneArt] exception", e);
      if (cardSceneJob.gen === gen) done(false);
    }
  })();
}

/**
 * 出卡場景圖生圖（新預設）：
 *   ★ 以半身／全身立繪為基底（同人同衣）
 *   ★ 只改：簡單表情 + 站／坐／走
 *   ★ visualEn 只在「玩家伸手」或「視線特殊（胸／腿／看別處）」時加特化
 * 色情卡仍走較完整 visualEn 路徑。
 */
async function weaveCardSceneShot(s, sceneEn, key, play = null) {
  if (!s) return "";
  if (!canWeaveNow()) {
    console.warn("[cardSceneArt] weave skip canWeaveNow=false", imgProvider());
    return "";
  }
  const def = play?.cardId ? Cards.cardById(play.cardId) : null;
  const tags = def?.tags || [];
  const fb = visualBeatFallback(play, def, s);
  const intimate = isIntimateContactCard(def);
  const girlLewd = isGirlLedLewdTrait(def);

  const halfRef = (s.portraits?.half || s.portraits?.full || s.portrait || "").split("?")[0] || "";
  const fullRef = (s.portraits?.full || s.portraits?.half || s.portrait || "").split("?")[0] || "";

  let actionEn = "";
  let framing = "half";
  let ref = halfRef;
  let refMode = halfRef ? "portrait_base" : "none";
  let imgRating = "sfw";
  let charPayload = characterForConversationScene(s);
  let specials = play?.sceneSpecials || parseCardSceneSpecials(def, play);

  const ntrSt = Number(play?.dateChapterStage ?? def?.dateStage ?? 1) || 1;
  const isNtrShot = def?.dateTrack === "ntr" || play?.dateTrack === "ntr"
    || !!(play?.rivalName) || (def?.tags || []).includes("rival_shadow");
  const ntrMolestShot = isNtrShot && ntrSt >= 3;
  const ntrMatingShot = isNtrShot && ntrSt >= 4;
  const ntrClimaxShot = isNtrShot && ntrSt >= 5;
  // NTR 一律走旁觀第三人稱基底，禁止落入「first-person POV + male hands」色情路徑
  const usePortraitBase = isNtrShot || (!intimate && !girlLewd);

  if (usePortraitBase) {
    // ── 立繪基底路線（話術／妹子日常／約會場地／NTR 旁觀）──
    actionEn = buildPortraitBasedSceneExtra(def, {
      ...play,
      dateTrack: isNtrShot ? "ntr" : (play?.dateTrack || def?.dateTrack),
      dateChapterStage: ntrSt,
      rivalName: play?.rivalName,
      sceneStart: play?.sceneStart || def?.sceneStart,
      cameraEn: isNtrShot
        ? scrubNtrObserverCamEn(play?.cameraEn || cardVisualEn(def) || "")
        : (play?.cameraEn || cardVisualEn(def)),
    });
    framing = (specials.posture === "walking" || ntrMatingShot || ntrClimaxShot) ? "full" : "half";
    if ((specials.posture === "walking" || ntrMatingShot || ntrClimaxShot) && fullRef) {
      ref = fullRef;
      refMode = "portrait_full_base";
    }
    // NTR L3+：生圖分級跟設定
    imgRating = (ntrMolestShot || ntrMatingShot || ntrClimaxShot)
      ? (state.settings.rating || "nsfw") : "sfw";
    if (ntrClimaxShot) refMode = ref ? "portrait_ntr_climax" : "none";
    else if (ntrMatingShot) refMode = ref ? "portrait_ntr_mating" : "none";
    else if (ntrMolestShot) refMode = ref ? "portrait_ntr_molest" : "none";
    else if (isNtrShot) refMode = ref ? "portrait_ntr_observe" : "none";
  } else {
    // ── 色情／她主動偏色：保留較完整 visualEn（僅非 NTR）──
    let layer2 = finalizeCardVisualEn(
      def,
      scrubImgPromptLabels(play?.cameraEn || cardVisualEn(def) || fb.visual_en || ""),
    );
    let layer3 = scrubImgPromptLabels(sceneEn || play?.imgEn || play?.visualBeatEn || "");
    const needsHands = cardNeedsContactHands(def, layer2);
    const parts = [];
    if (layer2) parts.push(layer2);
    if (layer3 && layer3.toLowerCase() !== layer2.toLowerCase()) parts.push(layer3);
    if (needsHands) parts.push("male hands", "first-person POV");
    parts.push("nsfw", "explicit", "same character as reference");
    actionEn = scrubImgPromptLabels(parts.join(", "));
    framing = framingFromCameraEn(layer2, tags);
    ref = halfRef || fullRef;
    refMode = ref ? "portrait_base_nsfw" : "none";
    imgRating = state.settings.rating || "nsfw";
    charPayload = s;
  }

  const refOk = /^\/assets\/(portraits|testword)\//.test(ref);

  console.info("[cardSceneArt] portrait-base", {
    identity: s.name || s.id,
    kind: def?.kind || "?",
    intimate: !!intimate,
    specials,
    expression: simpleExpressionTags(play, def),
    framing,
    rating: imgRating,
    extra: actionEn.slice(0, 200),
    ref: refOk ? ref : "(none)",
    refMode,
  });

  const comfy = imgProvider() === "comfy";
  const girlCkpt = comfy ? await ensureGirlComfyCkpt(s) : "";
  // 出卡場景：每次隨機 seed（不可用人設固定 seed，否則同一人每張卡同一圖）
  const sceneSeed = (Math.floor(Math.random() * 2147483646) + 1);
  const body = {
    key,
    provider: imgProvider(),
    model: state.settings.model || "grok-4.5",
    framing,
    rating: imgRating,
    // 跟立繪同一風格（pixel 立繪則出卡也 pixel；否則 anime）
    style: state.settings.imgStyle || "anime",
    character: charPayload,
    extra: actionEn,
    // 關鍵：Comfy 不可把 action 當整段 prompt，否則跳過 sdtags 人設 → 變臉
    prompt: "",
    // 鎖人設 tags；seed 則每次隨機（見 sceneSeed）
    lock_identity: true,
    cutout: false,
    flat_bg: false,
    retry: true,
    ...(refOk ? { ref } : {}),
    ...(comfy ? {
      comfy_url: state.settings.comfyUrl || "",
      ckpt: girlCkpt || "",
      seed: sceneSeed,
      // 不傳 shot/char_id 當肖像檔名，避免覆寫 half/full 立繪檔
    } : {}),
  };
  console.info("[cardSceneArt] seed/key", { seed: sceneSeed, key, extra: actionEn.slice(0, 100) });
  let url = "";
  try {
    let r = await imgGenPost(body);
    if (!r) {
      console.warn("[cardSceneArt] imgGenPost null（/api/imggen 連不上？）");
      return "";
    }
    let k = r?.key || key;
    const deadline = Date.now() + 180000;
    while (r && Date.now() < deadline) {
      if (r.status === "done") { url = r.result || ""; break; }
      if (r.status === "error") {
        console.warn("[cardSceneArt] imggen error:", r.error);
        break;
      }
      await new Promise(res => setTimeout(res, 1500));
      r = await imgGenPost({ ...body, key: k, retry: false });
      k = r?.key || k;
    }
  } catch (e) {
    console.warn("[cardSceneArt] weave exception", e);
  }
  return url;
}

// 詳細頁「補織缺的那幾張」用:三張補齊,已經有的跳過。
// force=true(換衣服後)則三張全部重織——舊圖穿的是舊衣服,留著只會不一致。
async function weaveMissing(s, force = false) {
  if (!s || portraitGenning.has(s.id)) return;
  portraitGenning.add(s.id);
  try {
    for (const shot of ["full", "half", "head"]) {
      if (!force && s.portraits?.[shot]) continue;
      setShot(s, shot, await weaveShot(s, shot));
      renderAll();
    }
  } finally {
    portraitGenning.delete(s.id);
    renderAll();
  }
}

// ===== 服裝:生涯服裝 + 個人喜好衣櫃 =====
// 兩個維度(規格見 README「服裝」):
//   生涯服裝 —— 職業給的那一身。女高中生就是制服,不會穿西裝套裝。立繪畫這套。
//   個人衣櫃 —— 她自己喜歡的穿搭,依關係解鎖:朋友 1 套、女友 3 套、妻子 6 套。
// 陌生階段一套都沒有:你只見過她工作時的樣子。
//
// **詳細頁不再顯示衣櫃**(那頁精簡過,只留她的人生)。所以現在沒有玩家入口,
// 她固定穿生涯服裝;衣櫃仍然抽好存在 look.wardrobe 裡,換衣服的機制也還在,
// 只是要從 DBG.wearOutfit(id, i) 進去。之後要接自動輪替或別的入口,改這裡即可。
function careerOutfit(s) { return s?.look?.career_outfit || ""; }
function wardrobeAll(s) {
  const w = s?.look?.wardrobe;
  if (Array.isArray(w) && w.length) return w;
  return s?.look?.style ? [s.look.style] : [];   // 舊存檔只有單一 style
}
function wardrobeOpen(s) { return WARDROBE_UNLOCK[s?.stage] ?? 0; }
// 解鎖到的那幾套(依關係階段截斷)
function wardrobeUnlocked(s) { return wardrobeAll(s).slice(0, wardrobeOpen(s)); }
// 她現在身上穿的。-1 / 沒挑 = 生涯服裝
function outfitWorn(s) {
  const i = s?.outfitPick;
  const w = wardrobeAll(s);
  if (Number.isInteger(i) && i >= 0 && i < w.length && i < wardrobeOpen(s)) return w[i];
  return careerOutfit(s) || w[0] || "";
}
// 換衣服 → 立繪要重織(舊圖穿的是舊衣服)
async function changeOutfit(s, pick) {
  if (s.outfitPick === pick) return;
  s.outfitPick = pick;
  dirty = true;
  saveNow();
  renderAll();
  if (!canWeaveNow()) { toast(`她換上了${outfitWorn(s)}(立繪等能生圖時再重織)`); return; }
  toast(`她換上了${outfitWorn(s)}——重織立繪中……`, "good");
  await weaveMissing(s, true);
  toast(lastWeaveError ? `重織失敗:${lastWeaveError}` : `${s.name} 換好了`,
        lastWeaveError ? "bad" : "good");
}

// Grok Build 召喚生圖:當場織出形體,輪詢到 done 才顯示「接受契約」。
// 期間無收尾鈕——「等待到生成結束才完成」。逾時/失敗則退回今晚作夢,不卡死玩家。
async function genSummonPortrait(ov, s) {
  const paint = sec => {
    ov.innerHTML = `
      <div class="summon-result r-${s.rarity}">
        <div class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</div>
        <h3>${esc(s.name)}</h3>
        <div class="portrait summon-brewing">${girlSVG("#241333", 7)}</div>
        <p>正在為她織出形體……(${sec}s)</p>
        ${imgProvider() === "comfy"
          ? `<p class="small dim">先織全身像;大頭照與半身在你讀這張卡的時候補上</p>` : ""}
        <p class="small dim">${s.personality.join("・")} / ${s.speech}</p>
      </div>`;
  };
  paint(0);
  await weavePortrait(s, paint);
  renderSummonCard(ov, s);   // 有圖顯示圖、沒圖退回今晚作夢,並露出「接受契約」
  renderAll();
}

// ===== 情感、需求、NTR =====

// ===== 防備狀態:他越界了,她冷幾句(規格見 docs/relationship-axes.md)=====
// 遊戲測不到越界(玩家自由輸入,中文關鍵字比對很脆),所以讓她自己回報:
// 陌生階段的 prompt 會要求第 2 行輸出 #越界 / #正常,而 app 取她的回覆本來就只取第一行,
// 第 2 行是免費的回報通道——零額外呼叫、零延遲、零顯示風險。
const GUARD_COOL = 4;   // 冷幾則玩家訊息後回溫

// ===== 飢渴:被改造過的身體會自己上來(規格見 docs/relationship-axes.md)=====
// 她不會因此衰弱或生病——沒有存活機制要維護,這純粹是一層會起伏的身體狀態。
// 做成起伏而非常駐設定:常駐的話 AI 每句都演,三句就膩了;平靜時完全不注入 prompt。
// 懶算:只存 {v, at},要用的時候才依經過時間推算,不需要任何 ticker。
const CRAVE_RATE = 4;        // 每小時累積
const CRAVE_MID = 35, CRAVE_HIGH = 72;
const CRAVE_ON_CROSS = 15;   // 他越界調戲 → 跳升(陌生階段:她更兇,而且更難受)
const CRAVE_AFTER_DATE = 40; // 約會後消掉的量

function craveValue(s) {
  if (!s.crave) return 0;
  const hrs = Math.max(0, (Date.now() - (s.crave.at || 0)) / HOUR);
  return Math.max(0, Math.min(100, (s.crave.v || 0) + hrs * CRAVE_RATE));
}
function craveSet(s, v) {
  s.crave = { v: Math.max(0, Math.min(100, v)), at: Date.now() };
  dirty = true;
}
function craveAdd(s, d) { craveSet(s, craveValue(s) + d); }
/** 注入 prompt 的檔位:平靜時回 null(完全不提),她就只是個被擄來的普通人 */
function craveTier(s) {
  const v = craveValue(s);
  return v >= CRAVE_HIGH ? "high" : v >= CRAVE_MID ? "mid" : null;
}

function guardActive(s) { return s.stage === "stranger" && (s.guard?.cool > 0); }

/** 剝 Qwen3.5 等 thinking 塊（伺服器也會剝，雙保險） */
function stripThinking(raw) {
  if (!raw) return "";
  let s = String(raw);
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "");
  s = s.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking\s*>/gi, "");
  s = s.replace(/<\/?think(?:ing)?\b[^>]*>/gi, "");
  return s.trim();
}

/** 從她的回覆抽出 #越界 旗標,並回傳乾淨的台詞(多行保留,只拿掉旗標)。
 *  所有消費她回覆的地方都要走這裡——包含約會即時模式,否則旗標會漏進畫面與歷史。 */
function stripGuardFlag(raw) {
  if (!raw) return { text: "", crossed: false };
  const cleaned = stripThinking(raw);
  const crossed = /#\s*越界/.test(cleaned);
  const text = cleaned
    .split("\n")
    // 尾端也可能是串流到一半的殘缺旗標(「#」「#越」),一併吃掉免得閃一下
    .map(l => l.replace(/#\s*(越界|正常|越|正)?\s*$/g, "").trim())
    .filter(Boolean)
    .join("\n");
  return { text, crossed };
}
// 淫紋訊息只留一句:取第一個非空行(修掉舊的 `[0] || 整段` fallback——
// 第 0 行為空時它會把整段連旗標一起顯示出來)
function firstLine(text) { return (text || "").split("\n").find(l => l.trim()) || ""; }

/** 收到她的回覆後更新防備狀態(只有陌生階段有效) */
function applyGuard(s, crossed) {
  // 越界會拉高飢渴(不分階段):他調戲她,身體先替她回答了。
  // 陌生階段因此出現整套設計的重點——她最兇的時候,正好也是她最難受的時候。
  if (crossed) craveAdd(s, CRAVE_ON_CROSS);
  if (s.stage !== "stranger") { if (s.guard) { s.guard = null; dirty = true; } return; }
  if (!crossed) return;
  s.guard = { hits: (s.guard?.hits || 0) + 1, cool: GUARD_COOL };
  dirty = true;
}

/** 玩家每送出一則就降溫;歸零時連 hits 一起清掉(回溫) */
function guardTick(s) {
  if (!s.guard) return;
  if (s.stage !== "stranger") { s.guard = null; dirty = true; return; }
  s.guard.cool--;
  if (s.guard.cool <= 0) s.guard = null;
  dirty = true;
}

function stageInfo(key) { return STAGES.find(s => s[0] === key); }
function nextStage(s) { const i = STAGES.findIndex(x => x[0] === s.stage); return STAGES[i + 1] || null; }
function stageLabel(key) { return stageInfo(key)[1]; }

/**
 * @param opts.skipBreak 打牌／NSFW 卡感情：只改數值與升階，不觸發「離開名冊／NTR」。
 *   猥褻卡固定 -15～-5，若不跳過，陌生階段一張就 affection≤-10 → 從名冊永久刪除。
 */
function applyAffection(s, base, opts = {}) {
  if (!s) return 0;
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
  if (!opts.skipBreak) checkBreak(s);
  return d;
}

/**
 * 感情崩潰後果：陌生離開／熟人 NTR。
 * 打牌中、或來源是牌局感情骰時，絕不可刪名冊（那是猥褻扣分，不是獻祭／流失）。
 */
function checkBreak(s) {
  if (!s || s.affection > -10 || s.ntr) return;
  // 正在跟她打牌：鎖定名冊，最多只記 log
  if (state.cardSession?.girlId === s.id) {
    log(`${s.name} 感情崩到谷底（打牌中，暫不離開名冊） affection=${s.affection}`);
    return;
  }
  if (s.stage === "stranger") {
    state.succubi = state.succubi.filter(x => x.id !== s.id);
    state.kanbans = (state.kanbans || []).filter(k => k.id !== s.id);
    if (detailId === s.id) detailId = null;
    if (state.lastKanbanId === s.id) state.lastKanbanId = null;
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
      // 妻子交代的事拖過一天還沒做:她不鬧,但真的失望(四階段唯一的懲罰,只扣一次)
      if (s.stage === "wife" && s.errand && s.errand.asked && !s.errand.late && d > s.errand.day) {
        s.errand.late = true;
        applyAffection(s, -1);
        log(`${s.name} 交代的「${s.errand.text}」一直沒做,她沒說什麼,但情感 -1`);
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

function enterChat(id, type = "chat", location = null, prepaid = false) {
  const s = state.succubi.find(x => x.id === id);
  if (!s) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  if (s.ntr) { toast("她不在你身邊……", "bad"); return; }
  // M2/M3/M6：自由聊退役 → 日常聊改牌桌；約會改電話＋場地牌局
  if (freeChatRetired() && type === "chat") {
    if (isKanban(id)) {
      toast("想說話就靠近她（牌桌）", "");
      openKanbanTable(id);
    } else {
      toast("先召喚她為看板娘，再靠近互動", "bad");
    }
    return;
  }
  if (cardSystemOn() && type === "date") {
    beginDateFlow(id);
    return;
  }
  const today = dayNum();
  if (type === "date") {
    // 被召喚走：電話窺視（不扣約會費、不佔一天兩次）
    if (isSummonerTaken(s)) {
      beginTakenPhoneCall(id);
      return;
    }
    if (!prepaid) {
      if (state.gold < 0) { toast("負債中,先去做委託還債吧", "bad"); return; }
      if (state.gold < DATE_COST) { toast("金幣不夠", "bad"); return; }
      if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
      if (s.datesToday.count >= DATE_LIMIT) { toast(`今天約會夠多了（每天 ${DATE_LIMIT} 次）,她需要休息`, "bad"); return; }
      state.gold -= DATE_COST;
      log(`與 ${s.name} 去${location}約會 -${DATE_COST} 金`);
    }
    if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
    s.datesToday.count++;
    s.lastDateDay = today;
    s.lastChatDay = today;
  } else {
    // 聊天不花任何資源:淫紋只是「她想跟你說話」的燈,點開就是聊起來。
    // 她被召喚走：引導去打電話（窺視路徑）
    if (!prepaid) {
      if (isSummonerTaken(s)) {
        toast(`${s.name} 正被召喚走——打電話給她（1/5 接通，不佔約會次數）`, "bad");
        return;
      }
      if (s.typing) { toast(`${s.name} 正在回你……`, ""); return; }
      // 紋亮著就能聊:她的話備好了就她先說,還沒備好(或是接續沒聊完的那場)就你先說
      if (!s.chatLine && !s.wantsTalk && !s.chatSess) { toast("她現在沒有話要跟你說", "bad"); return; }
    }
    s.wantsTalk = 0;   // 這一盞紋在這一場兌現了
    s.lastChatDay = today;
  }
  chatWith = id;
  const spot = DATE_SPOTS.find(x => x[0] === location);
  // 聊天:一場對話跨多次進出(送出即跳出、她慢慢打字),回合數記在她身上
  if (type === "chat") {
    s.chatSess ??= { turnCap: randInt(...CHAT_TURNS), playerMsgs: 0, at: Date.now() };
    s.chatSess.at = Date.now();
  }
  const sess = type === "chat" ? s.chatSess : null;
  const turnCap = sess ? sess.turnCap : randInt(...DATE_TURNS);
  chatSession = {
    type, location, locationDesc: spot ? spot[1] : null,
    playerMsgs: sess ? sess.playerMsgs : 0, turnCap, gotReply: false, busy: false,
  };
  dateChooser = false;
  document.body.classList.add("chat-mode");
  s.history ??= [];
  // 場景邊界標記:只有約會另起場景;聊天是跨日連續的簡訊串,不切斷上下文
  if (type === "date") {
    s.history.push({ role: "sys", content: `兩人抵達「${location}」,約會開始`, t: Date.now() });
  }
  // 重置輸入狀態(修復:上一場鎖住的輸入框會殘留到下一場)
  const inputEl = document.getElementById("chat-input");
  if (inputEl) { inputEl.disabled = false; inputEl.placeholder = "說點什麼…(Enter 送出)"; inputEl.value = ""; }
  const sendBtn = document.getElementById("chat-send");
  if (sendBtn) { sendBtn.disabled = false; sendBtn.textContent = "送出"; }
  const askBtn = document.getElementById("chat-ask");
  if (askBtn) askBtn.disabled = false;
  setChatWaiting(false);
  scheduleSave(); renderAll();
  renderChatLog(s);
  inputEl?.focus();
  if (type === "date") {
    vnShow("", `—— ${location}・約會開始 ——`, "sys");
    sceneOpener(s);   // 約會:她先開口,描述場景與心情(即時 session)
  } else if (s.chatLine) {
    // 她那句話早已在背景寫好(開場白或上一句的回覆)——秒顯示,你回一句就換她慢慢打字
    const line = s.chatLine.text;
    s.chatLine = null;
    s.history.push({ role: "assistant", content: line, t: Date.now() });
    s.history = s.history.slice(-200);
    vnShow(s.name, line, "ai");
    vnDone();
    // 這場的回合已用完:這句是收尾,讀完按鈕結束(結算情感)
    if (sess && sess.playerMsgs >= sess.turnCap) {
      chatSession.ended = true;
      chatSession.gotReply = true;
      chatEndButton("結束對話 ▶");
    }
    dirty = true;
    saveNow();
  } else {
    // 紋亮著但她還沒開口(話還在背景寫、或剛被釋放):換你先說——
    // 完全不等生成,輸入框直接可用;你送出後她才開始回你。
    vnShow("", `(淫紋亮著——${s.name} 在等你開口)`, "sys");
    vnDone();
  }
}

// (chatOpenerLive 已移除:紋亮著她還沒開口時,直接換玩家先說——
//  進場一律零等待,不再有「點進去看她慢慢生成開場白」的畫面。)

// 送出後隱藏輸入列,等她回完才出現(避免連發沒人回)
function setChatWaiting(b) {
  const row = document.getElementById("chat-input-row");
  if (row) row.style.visibility = b ? "hidden" : "";
}

// 對話收尾:不自動跳出,把「送出」鈕換成收尾鈕,讓玩家讀完最後一句自己按著結束
// (按鈕點擊在 chatSession.ended 時改導向 exitChat,見底部事件接線)
function chatEndButton(label = "結束對話 ▶") {
  setChatWaiting(false);   // 送出時被隱藏的輸入列要重新露出,收尾鈕才看得到
  const inputEl = document.getElementById("chat-input");
  if (inputEl) { inputEl.disabled = true; inputEl.placeholder = "這次對話結束了…"; }
  const askBtn = document.getElementById("chat-ask");
  if (askBtn) askBtn.disabled = true;
  const btn = document.getElementById("chat-send");
  if (btn) { btn.disabled = false; btn.textContent = label; }
}

// 約會進場開場白:她先開口,不佔玩家回合、不寫入玩家訊息(聊天則由玩家先說話,不走這裡)
async function sceneOpener(s) {
  if (!chatSession) return;
  chatSession.busy = true;
  setChatWaiting(true);
  vnTyping(true);
  const inst = `(旁白:你們剛抵達「${chatSession.location}」——${chatSession.locationDesc || ""}。請用一兩句話開場:描述你眼前看到的場景和此刻的真實感受,依你的個性可以期待興奮、也可以嫌棄抱怨。不要延續之前任何話題。)`;
  try {
    const reply = await llmReply(s, acc => vnShow(s.name, acc, "ai"), inst);
    s.history.push({ role: "assistant", content: reply, t: Date.now() });
    s.history = s.history.slice(-200);
    vnDone();
    dirty = true;
    saveNow();
  } catch (e) {
    if (e.name !== "AbortError") {
      vnShow("", `—— ${chatSession.location}・約會開始 ——`, "sys");
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
      craveAdd(s, -CRAVE_AFTER_DATE);   // 一整場貼身相處後,身體暫時安靜下來
      s.history.push({ role: "sys", content: `「${chatSession.location}」的約會結束了,兩人回到日常`, t: Date.now() });
      s.chatLine = null;   // 約會另起了話頭,作廢她待命中的預製話重生
      log(`與 ${s.name} 的${chatSession.location}約會結束,情感 +${d}`);
      toast(`約會結束,情感 +${d}`, "good");
    } else if (chatSession.type === "chat" && s.chatSess && s.chatSess.playerMsgs >= s.chatSess.turnCap && !s.typing) {
      // 聊天:整場(跨多次進出)聊完才結算一次 -1~+2;中途跳出去等她打字不結算
      const d = applyAffection(s, randInt(-1, 2));
      const n = s.chatSess.playerMsgs;
      s.chatSess = null;
      s.chatLine = null;   // 這一盞燈熄了,下一句等委託操作再判定
      log(`與 ${s.name} 聊了 ${n} 句,情感 ${d >= 0 ? "+" : ""}${d}`);
      toast(`聊天結束,情感 ${d >= 0 ? "+" : ""}${d}`, d >= 0 ? "good" : "bad");
    } else if (chatSession.type === "chat" && s.chatSess && !s.typing) {
      // 讀完她的話卻沒回就離開:這場就散了(不結算),下次委託操作再開新的一場
      s.chatSess = null;
      s.chatLine = null;
    }
    // 聊天對話串是跨日連續的簡訊串,不加場景標記
  }
  chatAbort?.abort();
  chatWith = null; chatSession = null;
  document.body.classList.remove("chat-mode");
  scheduleSave(); renderAll();
}

// ===== 觀戰模式:她被另一位召喚師召喚走(持續狀態),聊天/約會變成看他們互動,伺機釋放 =====

let watchWith = null;     // 觀戰中的魅魔 id
let watchSession = null;  // {playerType:'chat'|'date', playerLocation, releaseChance, turnCap, presses, busy, ended}
let sacrificeWith = null; // 獻祭儀式中的魅魔 id
let sacSession = null;    // 獻祭三場景 session {id,name,method,opening,pages[6],idx,settled,price}
let sacSummon = null;     // 召喚獻祭 session {count}

function exitSacrifice() {
  chatAbort?.abort();
  sacrificeWith = null; sacSession = null;
  document.body.classList.remove("chat-mode");
  renderAll();
}

// 召喚師×她 的關係階段(交配環系統)。進度由「交配次數」推進,不再是好感數字。
// ⓪強烈嫌惡排斥 ①嫌惡抗拒 ②抗拒冷淡 ③抗拒 ④偶爾互動 ⑤女友 (⑥妻子=懷孕娶走,終局不可玩)
const RIVAL_STAGE_NAMES = ["強烈嫌惡排斥", "嫌惡抗拒", "抗拒冷淡", "抗拒", "偶爾互動", "女友", "妻子"];
// 各階段基礎抵抗值(=交配機率分母 1/resist);每個 act 讓 resist −1,直到 1(=100%)。
const STAGE_RESIST = [40, 20, 10, 10, 5, 1];
// ⓪~③:交配 N 次推進下一階段
const STAGE_ADVANCE = [2, 3, 5, 5];
const CONFESS_CHANCE = 1 / 5;      // ④偶爾互動:每次交配 1/5 她主動告白 → 升女友
const FIANCEE_MATINGS = 20;        // ⑤女友:累積 20 次交配 → 她主動解開魔法環
const PREGNANCY_CHANCE = 1 / 2;    // 解環後每次交配內射 1/2 懷孕 → 娶走
function rivalStageName(idx) { return RIVAL_STAGE_NAMES[Math.min(idx, 6)] || RIVAL_STAGE_NAMES[0]; }
// 舊存檔 affection(0~240)→ 新階段索引(移轉用)
function affToStageIdx(aff) {
  const th = [30, 60, 90, 120, 150, 180];
  for (let i = 0; i < th.length; i++) if (aff < th[i]) return i;
  return 5;
}

// 性趣池(交配環節);召喚師纏上魅魔時隨機抽 4~10 個給該對
let KINKS = [];
fetch("content/kinks.json").then(r => r.ok ? r.json() : null).then(j => { KINKS = (j && j.kinks) || []; }).catch(() => {});

// 獻祭儀式腳本(開場 + 三場景 method);廠商件,SFW 佔位在 content/sacrifice.json
let SACRIFICE = { opening: "{name} 被帶到了祭壇前,眼神帶著疑惑。", methods: [] };
fetch("content/sacrifice.json").then(r => r.ok ? r.json() : null).then(j => { if (j) SACRIFICE = j; }).catch(() => {});

// Testword 撰寫的階段語氣腳本(watch_stage=觀戰演出 / chat_rival=她對你的變化)。
// method=階段名;存在就蓋掉內容模組內建版。核心不檢視內容,原樣傳給 AI。
const STAGE_SCRIPTS = { watch_stage: {}, chat_rival: {} };
for (const cat of Object.keys(STAGE_SCRIPTS)) {
  fetch(`/api/scripts?category=${cat}`).then(r => r.ok ? r.json() : []).then(list => {
    for (const it of list || []) STAGE_SCRIPTS[cat][it.method] = it.body;
  }).catch(() => {});
}

/** 電話窺視：一通最多聽幾則 act（預設 2） */
const PHONE_WATCH_TURN_CAP = 2;

/**
 * 觀戰：播放召喚師×她的 act 紀錄。
 * opts.onlyExisting = true → 只播已有未讀，佇列空不 live_act 現生（電話窺視）
 * opts.noRelease = true → 不判定掙脫搶回
 * opts.turnCap → 本場最多幾則（電話預設 2；其他 1～2）
 * opts.wantSceneArt → 聽完後用 AI 依台詞生圖 prompt 並出圖
 */
async function enterWatch(s, playerType, playerLocation = null, opts = {}) {
  const gid = s.id;
  const onlyExisting = !!opts.onlyExisting;
  const noRelease = !!opts.noRelease;
  const isPhone = playerType === "phone" || onlyExisting;
  // 尚未鎖 watchWith → simSync 可覆蓋這隻的 summoner 鏡像
  await simSync(true);
  s = state.succubi.find(x => x.id === gid) || s;
  if (!s?.summoner) {
    toast("召喚師紀錄同步失敗,稍後再試", "bad");
    return;
  }
  const taken = !!s.summoner?.taken;
  const ready = readyUnseen(s);
  const unseen = unseenActs(s);
  // 電話路徑：優先文字已備妥；否則結構未讀（仍不現生新 slot）
  const available = onlyExisting
    ? (ready.length ? ready.length : unseen.length)
    : unseen.length;
  if (onlyExisting && available <= 0) {
    toast(`${s.name}：……我在忙。（掛斷）`, "");
    return;
  }

  watchWith = s.id;
  // 電話：固定最多 2 則；其他：1～2
  const defaultCap = isPhone
    ? Math.min(PHONE_WATCH_TURN_CAP, Math.max(1, available))
    : Math.min(randInt(1, 2), Math.max(1, available || 1));
  const turnCap = Math.max(1, Number(opts.turnCap) || defaultCap);
  watchSession = {
    playerType, playerLocation,
    onlyExisting,
    noRelease,
    wantSceneArt: !!(opts.wantSceneArt || isPhone),
    // 舊：約會進場可搶回；電話窺視不搶回
    releaseChance: (noRelease || !taken) ? 0
      : (playerType === "date" ? 1 / 10 : playerType === "chat" ? 1 / 20 : 0),
    turnCap,
    presses: 0, busy: false, ended: false,
    heardLines: [],   // 本通聽到的台詞（給 AI 生圖）
    sceneArtUrl: null,
  };
  document.body.classList.add("chat-mode");
  const su = summonerById(s.summoner?.id);
  scheduleSave(); renderAll();
  let opener;
  if (isPhone) {
    opener = taken
      ? `電話接通了……線路另一頭，${s.name} 正和 ${su?.name || "另一個男人"} 在一起。（這通聽兩句）`
      : `電話裡傳來 ${s.name} 與 ${su?.name || "另一個男人"} 之間的片段……（這通聽兩句）`;
  } else if (taken) {
    opener = `${s.name} 不在你身邊——她正被 ${su?.name || "另一個男人"} 召喚著……`;
  } else {
    opener = `${s.name} 與 ${su?.name || "另一個男人"} 之間，那些你不在場時的紀錄……`;
  }
  vnShow("", `—— ${opener} ——`, "sys");
  const wnBtn = document.getElementById("watch-next");
  if (wnBtn) { wnBtn.textContent = "下一句 ▶"; wnBtn.disabled = false; }
  // 僅幫「已有未讀」下文字單；不現生新 act
  try { genActOrders(); } catch { /* 下輪 genTick 會補 */ }
  watchNext();
}

// 相對時間:紀錄發生在多久之前
function relTime(t) {
  const m = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (m < 2) return "剛剛";
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} 小時前`;
  return `${Math.round(h / 24)} 天前`;
}

async function watchNext() {
  const s = state.succubi.find(x => x.id === watchWith);
  if (!s || !watchSession || watchSession.busy || watchSession.ended) return;
  const su = summonerById(s.summoner?.id);
  if (!su) { exitWatch(); return; }
  const onlyExisting = !!watchSession.onlyExisting;

  // 取最舊的未讀。onlyExisting：不 live_act；優先文字已備妥的。
  let act = onlyExisting
    ? (readyUnseen(s)[0] || unseenActs(s)[0] || null)
    : unseenActs(s)[0];
  if (!act && !onlyExisting && s.summoner?.taken) {
    // 舊路徑（非電話）：佇列空才 live 補一則
    const r = await simLiveAct(s);
    if (r?.married || !state.succubi.includes(s)) { exitWatch(true); return; }
    if (r?.rel) s.summoner = r.rel;
    act = unseenActs(s)[0];
  }
  if (!act) {
    // 電話窺視：沒場了 → 她說在忙，結束
    if (onlyExisting) {
      watchSession.ended = true;
      setWatchBtns(false);
      vnShow("", `${s.name}：……我在忙。先這樣。（掛斷）`, "sys");
      watchSession.atEnd = true;
      const wn = document.getElementById("watch-next");
      if (wn) { wn.textContent = "掛斷 ▶"; wn.disabled = false; }
      scheduleSave();
      return;
    }
    exitWatch();
    return;
  }
  watchSession.busy = true;
  setWatchBtns(false);

  try {
    if (act.text) {
      vnShowWatch(su, s, act.text, true, act);
      vnDone();
    } else {
      // 結構已存在、文字未備：只為這一則生字，不新開 act slot
      vnTyping(true);
      const raw = await llmJobRun(actMsgs(s, su, act), acc => vnShowWatch(su, s, acc, false, act), "他:哼,別扭什麼,乖一點嘛。\n她:……別碰我。");
      act.text = raw;
      vnShowWatch(su, s, raw, true, act);
      vnDone();
    }
  } catch (e) {
    if (e.name === "AbortError") return;
    vnShow("", "(線路斷斷續續……再按一次下一句)", "sys");
    watchSession.busy = false;
    setWatchBtns(true);
    return;
  }
  act.seen = true;
  simSeenOf(s, act);
  // 記下本則台詞（生圖用）
  if (act.text) {
    (watchSession.heardLines ??= []).push(String(act.text).trim());
  }
  watchSession.busy = false;
  watchSession.presses++;

  // 釋放判定（電話窺視 noRelease=0）
  if (s.summoner?.taken && watchSession.releaseChance > 0
    && Math.random() < watchSession.releaseChance) {
    rescueFromWatch(s);
    return;
  }

  const noMore = !unseenActs(s).length;
  const hitCap = watchSession.presses >= watchSession.turnCap;
  // 電話：聽滿 2 則（或沒場了）就收；舊路徑同理
  if (hitCap || noMore) {
    watchSession.ended = true;
    setWatchBtns(false);
    const isPhone = onlyExisting || watchSession.playerType === "phone";
    let endMsg;
    if (isPhone) {
      endMsg = hitCap
        ? `（這通聽到這裡——兩句片段。線路裡還有畫面在成形……）`
        : `${s.name}：……我在忙。先這樣。（掛斷）`;
    } else if (s.summoner?.taken) {
      endMsg = "(你只能看著……她還被召喚在對方那邊)";
    } else {
      endMsg = `(紀錄到此為止${unseenActs(s).length ? `，還有 ${unseenActs(s).length} 則未讀` : ""})`;
    }
    // 電話：依聽到的台詞 AI 生圖 prompt → 出圖
    if (isPhone && watchSession.wantSceneArt && (watchSession.heardLines || []).length) {
      try {
        weavePhoneWatchSceneArt(s, su, watchSession.heardLines.slice());
      } catch (e) {
        console.warn("[phoneWatch] scene art failed", e);
      }
    }
    setTimeout(() => {
      if (!watchSession?.ended) return;
      vnShow("", endMsg, "sys");
      watchSession.atEnd = true;
      const wn = document.getElementById("watch-next");
      if (wn) {
        wn.textContent = isPhone ? "掛斷 ▶" : "結束觀戰 ▶";
        wn.disabled = false;
      }
    }, 900);
    scheduleSave();
    return;
  }
  setWatchBtns(true);
  scheduleSave();
}

/**
 * 電話窺視生圖：
 *  1) 用聽到的 1～2 則台詞請 AI 產出英文 visualEn tags
 *  2) 以立繪為 ref + 1man 1girl 旁觀構圖送 /api/imggen
 *  3) 完成後換到 #vn-figure
 */
async function weavePhoneWatchSceneArt(girl, su, lines) {
  if (!girl || !lines?.length) return;
  if (!canWeaveNow()) {
    console.warn("[phoneWatch] canWeaveNow=false，略過生圖");
    return;
  }
  const sessionGen = watchWith; // 若掛斷換人則不再貼圖
  const visualEn = await genPhoneWatchVisualEn(girl, su, lines);
  if (!visualEn) return;
  if (watchWith !== girl.id && watchWith !== sessionGen) return;

  const halfRef = (girl.portraits?.half || girl.portraits?.full || girl.portrait || "").split("?")[0] || "";
  const fullRef = (girl.portraits?.full || girl.portraits?.half || girl.portrait || "").split("?")[0] || "";
  const ref = fullRef || halfRef;
  const key = `phonewatch:${girl.id}:${Date.now().toString(36)}`;

  // 強制雙人旁觀 + AI 產的場面 tag
  const extra = scrubImgPromptLabels([
    "1man", "1girl", "1boy", "2people",
    "third person view", "no first person", "not pov",
    "couple interaction", "man and woman together",
    "not looking at viewer",
    visualEn,
    "same woman as reference portrait",
    "keep same face", "same hair", "anime",
    "cinematic",
  ].join(", "));

  const rating = (state.settings.rating || "nsfw");
  // 台詞含性暗示 → nsfw
  const lewd = /交配|插入|射|胸|揉|摸|裸|喘|高潮|sex|fuck|grope|mating|kink/i
    .test(lines.join(" ") + " " + visualEn);
  const body = {
    key,
    provider: imgProvider(),
    model: state.settings.model || "grok-4.5",
    framing: lewd ? "full" : "half",
    rating: lewd ? rating : "sfw",
    style: state.settings.imgStyle || "anime",
    character: girl,
    extra,
    prompt: "",
    lock_identity: true,
    cutout: false,
    flat_bg: false,
    retry: true,
    ...(ref && /^\/assets\/(portraits|testword)\//.test(ref) ? { ref } : {}),
    ...(imgProvider() === "comfy" ? {
      comfy_url: state.settings.comfyUrl || "",
      seed: Math.floor(Math.random() * 2147483646) + 1,
    } : {}),
  };

  console.info("[phoneWatch] imggen", { girl: girl.name, extra: extra.slice(0, 180) });
  let url = "";
  try {
    let r = await imgGenPost(body);
    if (!r) return;
    let k = r?.key || key;
    const deadline = Date.now() + 180000;
    while (r && Date.now() < deadline) {
      if (r.status === "done") { url = r.result || ""; break; }
      if (r.status === "error") {
        console.warn("[phoneWatch] imggen error", r.error);
        break;
      }
      await new Promise(res => setTimeout(res, 1500));
      r = await imgGenPost({ ...body, key: k, retry: false });
      k = r?.key || k;
    }
  } catch (e) {
    console.warn("[phoneWatch] weave exception", e);
  }
  if (!url) return;
  // 仍在同一場電話觀戰才換圖
  if (watchWith !== girl.id) return;
  const bust = url.includes("?") ? url : `${url.split("#")[0]}?v=${Date.now()}`;
  if (watchSession) watchSession.sceneArtUrl = bust;
  setVnFigureUrl(bust);
  toast("（電話那頭的畫面成形了）", "good");
}

/** AI：依 1～2 則觀戰台詞 → 英文生圖 tags（只輸出 tag，不要敘事） */
async function genPhoneWatchVisualEn(girl, su, lines) {
  const blob = lines.map((t, i) => `【片段${i + 1}】\n${t}`).join("\n\n");
  const gName = girl?.name || "她";
  const mName = su?.name || "另一個男人";
  const stage = rivalStageName(girl?.summoner?.stage ?? 0);
  const sys = [
    "你是動漫插畫的 prompt 工程師。",
    "根據玩家電話偷聽到的「他／她」對白（或旁白），輸出一組英文 danbooru 風格生圖 tags。",
    "硬性規則：",
    "- 必須含：1man, 1girl（或 1boy, 1girl）",
    "- 第三人稱旁觀構圖：third person view, no first person, not pov, no viewer hands",
    "- 畫面要有兩人互動（talking / touching / sex 等依內容）",
    "- 女子外貌不要重寫（鎖臉由立繪參考負責）；只寫姿勢、互動、表情、環境、鏡頭",
    "- NSFW 若對白暗示性接觸：加入 groping / sex / fucking 等相應 tag",
    "- 只輸出一行英文逗號分隔 tags，不要中文、不要解釋、不要引號",
  ].join("\n");
  const user = [
    `女方「${gName}」、男方「${mName}」。她對他的階段：${stage}。`,
    "電話偷聽到的片段：",
    blob,
    "",
    "請輸出 VISUAL_EN tags：",
  ].join("\n");
  const canned = "1man, 1girl, 1boy, third person view, no first person, not pov, couple, man and woman close together, talking, cinematic, anime";
  try {
    const raw = await llmJobRun(
      [{ role: "system", content: sys }, { role: "user", content: user }],
      () => {},
      canned,
    );
    let en = String(raw || "").trim();
    // 去掉可能的前綴
    en = en.replace(/^VISUAL_EN\s*[:=：]\s*/i, "");
    en = en.replace(/^```[\s\S]*?\n/, "").replace(/```$/, "");
    en = en.split("\n").map(l => l.trim()).filter(Boolean)[0] || "";
    en = scrubImgPromptLabels(en);
    if (!/\b1(man|boy|girl)\b/i.test(en)) {
      en = `1man, 1girl, ${en}`;
    }
    if (!/\bthird person|not pov|no first person\b/i.test(en)) {
      en = `third person view, no first person, not pov, ${en}`;
    }
    return en.slice(0, 600) || canned;
  } catch (e) {
    console.warn("[phoneWatch] visualEn LLM failed", e);
    return canned;
  }
}

/** 觀戰／聊天立繪換場景圖 */
function setVnFigureUrl(url) {
  const fig = document.getElementById("vn-figure");
  if (!fig) return;
  if (!url) {
    fig.classList.add("hidden");
    document.body.classList.remove("has-figure");
    return;
  }
  fig.classList.remove("hidden");
  fig.src = url;
  fig.alt = "電話窺視場面";
  document.body.classList.add("has-figure");
}

// 生成單則紀錄文字的 LLM 訊息(觀看時現生/背景佇列共用);act.kind 分流猥褻/交配
function actMsgs(s, su, act) {
  const stageIdx = s.summoner?.stage ?? 0;
  const stageName = rivalStageName(stageIdx);
  const char = { name: s.name, personality: s.personality, backstory: s.backstory, appearance_dna: s.dna,
                 look: s.look || null, special_traits: s.specialTraits || null, libido: s.libido || null };
  // 交配紀錄:起承合三步,用該對的性趣 + 環狀態
  if (act.kind === "mating") {
    const kink = KINKS.find(k => k.name === act.kinkName) || {};
    const beatText = { "起": kink.qi, "承": kink.cheng, "合": kink.he }[act.beat] || "";
    const ctx = {
      world: WORLD_LORE, content_rating: state.settings.rating || "nsfw",
      character: char, summoner: su,
      mating: { kink: act.kinkName, beat: act.beat, beat_text: beatText, ring_locked: !!act.ring,
                stage_name: stageName },
    };
    return [
      { role: "system", content: buildMatingPrompt(ctx) },
      { role: "user", content: `描寫這一段(${act.beat})的交配,3~4 句旁白。` },
    ];
  }
  // 猥褻/拒絕紀錄:沿用觀戰演出 prompt
  const spot = (su.spots || []).find(x => x.name === act.location);
  const ctx = {
    world: WORLD_LORE,
    content_rating: state.settings.rating || "nsfw",
    character: char,
    summoner: su,
    scene: { type: act.type, location: act.location, location_style: spot?.desc || null },
    rival: { stage_idx: stageIdx, stage_name: stageName,
             tone_override: STAGE_SCRIPTS.watch_stage[stageName] || null },
  };
  return [
    { role: "system", content: buildWatchPrompt(ctx) },
    { role: "user", content: "生成他們這一刻的一來一往,嚴格照「他:…／她:…」兩行輸出。" },
  ];
}

// ── 代工生成:手機只「下單/收貨」,實際排隊跑 LLM 在 RP5 伺服器背景——
//    手機切走/鎖屏/待機都不影響生成;下次開 app 收貨即亮。
//    key = 內容狀態指紋(伺服器以 key 去重;狀態變了 key 就變,舊單自然作廢過期)。
function strHash(x) { let h = 5381; for (let i = 0; i < x.length; i++) h = ((h * 33) ^ x.charCodeAt(i)) >>> 0; return h.toString(36); }

function llmProvider() {
  const p = (state.settings.llmProvider || "ollama").toLowerCase();
  // 舊存檔 xai/api/grok → 一律 Grok Build 無頭(已移除 HTTP API)
  if (p === "grok-build" || p === "build" || p === "grok" || p === "xai" || p === "spacexai" || p === "api") {
    return "grok-build";
  }
  return "ollama";
}

function llmIsOrder() {
  return llmProvider() === "grok-build";
}

/** 組出 /api/gen 與 /api/llm/* 共用的 provider/endpoint 欄位 */
function llmRouteFields() {
  const provider = llmProvider();
  if (provider === "grok-build") return { provider: "grok-build", endpoint: "grok-build" };
  return {
    provider: "ollama",
    endpoint: state.settings.ollamaUrl || "http://localhost:11434",
  };
}

// prio:佇列優先序(大的先跑)。玩家正在等的回覆 10 > 她主動的開場白 5 > 背景素材 0。
async function genPost(key, messages, prio = 0) {
  try {
    const r = await fetch("/api/gen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        key, retry: true, prio, ...llmRouteFields(),
        model: state.settings.model, messages, options: { temperature: 0.9 },
      }),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// 生圖下單/收貨(召喚立繪、testword 共用同一佇列):回 {key,status,result,error}
async function imgGenPost(body) {
  try {
    const r = await fetch("/api/imggen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}

// 她的下一句聊天:最優先(失敗計次退避;連敗 3 次改用罐頭台詞保底,見 crestFallback)
function chatLineMsgs(s) {
  const hist = s.history || [];
  let cut = 0;
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].role === "sys") { cut = i + 1; break; }
  const recent = hist.slice(cut).slice(-40)
    .filter(m => m.role === "user" || m.role === "assistant")
    .map(m => ({ role: m.role, content: m.content }));
  const last = recent[recent.length - 1];
  const inst = !recent.length
    ? "(旁白:淫紋亮起——你想找他說話。依你的個性主動開啟一個新話題,一句像簡訊的話。)"
    : last.role === "user"
      ? "(旁白:回覆他最後那句話。一句像簡訊的話,依你的個性。)"
      : "(旁白:他還沒回你,隔了一段時間,你忍不住又主動傳了一句。換個說法或話題,不要重複之前的話。)";
  return [{ role: "system", content: buildSystemPrompt(buildCtx(s)) }, ...recent, { role: "user", content: inst }];
}

// 她正在回你(玩家送出後跳出對話,回覆在背景寫)——M6 起僅 !freeChatRetired 才會跑
async function genReplyOrder() {
  if (freeChatRetired()) return;
  for (const s of state.succubi) {
    if (!s.typing || s.ntr) continue;
    const key = `reply:${s.id}:${s.typing.at}`;   // 綁這一次送出:同一句不重複下單
    const r = await genPost(key, chatLineMsgs(s), 10);   // 玩家正在等 → 插隊到最前面
    if (!r) continue;
    if (r.status === "done" && r.result) {
      chatGenFail = { count: 0, at: 0 };
      const { text, crossed } = stripGuardFlag(r.result);
      applyGuard(s, crossed);            // 他剛才越界了 → 她進入防備,接下來幾句更冷
      markErrandAsked(s);                   // 她已經把盯的那件講出去了(女友下次會追問)
      s.chatLine = { text: firstLine(text).slice(0, 300), t: Date.now() };
      s.typing = null;
      dirty = true; scheduleSave(); renderAll();
      toast(`${s.name} 回你了`, "good");
    } else if (r.status === "error") chatGenFail = { count: chatGenFail.count + 1, at: Date.now() };
  }
}

async function genChatOrder() {
  if (freeChatRetired()) return;
  if (chatGenFail.count && Date.now() - chatGenFail.at < Math.min(60000, 10000 * chatGenFail.count)) return;
  let anyErr = false, anyDone = false;
  // 只寫「委託操作判定中了」的那幾位;沒亮紋就不生話——她開口與否跟著你做事的節奏走。
  for (const s of kanbanSuccubi()) {   // 多看板娘:每位各自的下一句
    if (!s.wantsTalk || s.summoner?.taken || s.ntr) continue;
    const key = `chat:${s.id}:${s.wantsTalk}`;   // 綁這一次判定:刷新時重寫,不吃到舊快取
    const r = await genPost(key, chatLineMsgs(s), 5);   // 紋已經亮了,玩家隨時會點進來
    if (!r) continue;
    if (r.status === "done" && r.result) {
      anyDone = true;
      if (isKanban(s.id) && !s.summoner?.taken) {
        // 覆寫:她有新想法時,舊的那句未讀就直接被刷掉(同時只留最新一句)
        // 這是她主動開口(不是回他的話),所以不判越界,只記下盯的那件講過了
        markErrandAsked(s);
        s.chatLine = { text: firstLine(stripGuardFlag(r.result).text).slice(0, 300), t: Date.now() };
        s.wantsTalk = 0;                             // 念頭落地成未讀訊息(紋早就亮著了)
        dirty = true; scheduleSave(); renderAll();
      }
    } else if (r.status === "error") anyErr = true;
  }
  if (anyDone) chatGenFail = { count: 0, at: 0 };
  else if (anyErr) {
    chatGenFail = { count: chatGenFail.count + 1, at: Date.now() };
    if (chatGenFail.count === 3) renderAll();   // 保底生效:改用罐頭台詞讓紋亮起來
  }
}

// (她的回覆一律走 genReplyOrder 在背景寫:玩家送出即跳出對話,
//  淫紋顯示「對話框 …」表示她正在輸入,寫好才變回亮紋等你點進來讀。)

// 觀戰紀錄文字:每輪最多下 3 單
async function genActOrders() {
  let n = 0;
  for (const g of state.succubi) {
    const su = g.summoner ? summonerById(g.summoner.id) : null;
    if (!su) continue;
    for (const a of (g.summoner.acts || [])) {
      if (a.text || a.seen) continue;
      a.id ??= uid();
      const r = await genPost(`act:${g.id}:${a.id}`, actMsgs(g, su, a));
      if (r?.status === "done" && r.result) { a.text = r.result; simTextOf(g, a); dirty = true; scheduleSave(); }
      if (++n >= 3) return;
    }
  }
}

// 看板娘委託台詞:每狀態備 3 句;state.quips.got 記已收貨的 key(重啟不重複)
const QUIP_STOCK = 3;
function quipMsgs(s) {
  return [
    { role: "system", content: buildQuipPrompt({
        character: { name: s.name, personality: s.personality, speech_style: s.speech,
                     tone: s.tone || null, backstory: s.backstory || "" },
        relationship: { stage: s.stage },
        player: { name: state.settings.player || "主人" },
        quests: questSnapshot(),
        pinned_quest: ensureErrand(s),   // 氣泡講的就是她盯的那件(遊戲挑好,她只負責講)
        content_rating: state.settings.rating || "nsfw",
      }) },
    { role: "user", content: "輸出她此刻想對他說的那一句話。" },
  ];
}

async function genQuipOrders() {
  if (!state.quests.length) return;
  const hash = questHash();
  state.quips ??= {};
  for (const s of kanbanSuccubi()) {   // 多看板娘:每位各自的台詞庫
    let q = state.quips[s.id];
    if (!q || q.hash !== hash) q = state.quips[s.id] = { hash, lines: [], got: [] };   // 狀態變了:舊台詞作廢
    for (let i = 0; i < QUIP_STOCK; i++) {
      if (q.lines.length >= QUIP_STOCK) break;
      const key = `quip:${s.id}:${strHash(hash)}:${i}`;
      if (q.got.includes(key)) continue;
      const r = await genPost(key, quipMsgs(s));
      if (r?.status === "done" && r.result && state.quips[s.id] === q && q.hash === questHash()) {
        const line = bubbleLineFromAi(r.result) || r.result.split("\n")[0].slice(0, 60);
        if (line) {
          q.lines.push(line);
          q.got.push(key);
          dirty = true; scheduleSave();
        }
      }
    }
  }
}

// 每 2 秒一輪:下單+收貨(伺服器排隊生成;對話/獻祭/睡眠中不下聊天與氣泡單)
// 例外:睡眠時段(01:00 起)專門跑 genSacOrders 預織獻祭文;無模型時也要進 tick 填罐頭。
let genTickBusy = false, lastGenAt = 0;
// 玩家正在等她的那句話(舊自由聊：typing／wantsTalk)——牌制下不應再觸發
function waitingOnHer() {
  if (freeChatRetired()) return false;
  return state.succubi.some(s => s.typing || (s.wantsTalk && !s.chatLine));
}

async function genTick(force = false) {
  if (genTickBusy) return;
  // 打牌即時反應／氣泡 AI 時收貨加快
  const waitingCard = !!(cardUi.awaitReaction && (cardUi.playAiPending || cardUi.sceneArtPending));
  const waitingBubble = !!(bubbleShowingItem?.pending
    || bubbleQueue.some(b => b.pending));
  if (!force && Date.now() - lastGenAt < ((waitingOnHer() || waitingCard || waitingBubble) ? 700 : 2000)) return;
  lastGenAt = Date.now();
  genTickBusy = true;
  try {
    if (isAsleep()) await genSacOrders();
    if (state.settings.model) {
      // 打牌即時反應最優先（玩家盯著牌桌）
      await genCardPlayOrder();
      // M6：自由聊天退役 → 不再下 reply／開場白 chat 單
      if (!freeChatRetired()) {
        await genReplyOrder();
      }
      // 看板委託氣泡（玩家剛操作完委託）
      await genBubbleOrders();
      const idle = !chatWith && !watchWith && !sacrificeWith && !sacSummon && !isAsleep()
        && !document.body.classList.contains("card-mode");
      if (idle && !freeChatRetired()) await genChatOrder();
      if (!waitingOnHer() && !waitingCard) {
        await genActOrders();
        // 看板點立繪碎嘴台詞庫（非自由聊）；牌制仍可備
        if (idle) await genQuipOrders();
      }
    }
  } catch (e) { /* 下輪再試 */ }
  genTickBusy = false;
}

// ── M4/實驗 打牌：先她的文字 → 英文畫圖句 → 再生圖 ──
// 兩拍 UI：① 動作旁白 ② 場景圖備妥後才出她的回應
// 避免「文字先好就能結束，圖還在跑」。

/** 出卡【玩家台詞】：正常對話，1～4 句 */
function cardPlayLines(text) {
  let t = (text || "").trim();
  t = t.replace(/^["「『]+|["」』]+$/g, "").trim();
  // 若模型誤輸出「表情：」格式，不當成玩家主台詞
  if (/^\s*表情\s*[：:]/m.test(t) && /^\s*動作\s*[：:]/m.test(t) && !t.includes("「")) {
    return "";
  }
  const lines = t.split("\n").map(l => l.trim()).filter(Boolean);
  let out = lines.slice(0, 5).join("\n").slice(0, 320).trim();
  if (Cards.isWeakLine?.(out)) return "";
  return out;
}

function applyPlayReact(play, rawText) {
  const line = cardPlayLines(rawText);
  if (line) {
    play.girlLine = line;
    play.reactTriple = null; // 畫圖用 pose 另產
    return line;
  }
  return "";
}

/** 玩家顯示名（綁定 [player]） */
function playerBindName() {
  return state.playerProfile?.name || state.settings?.playerName || "你";
}

/** 卡面 scene/hint 的 [name][eye][breast]… → 當前女子實值 */
function bindPlayScene(girl, raw, def) {
  const g = girl || girlForSession();
  const player = playerBindName();
  const bound = Cards.bindCardText?.(raw, g, player)
    || { text: raw, ctx: null };
  return bound;
}

/** 強制把 [name] 等綁到當前妹子；綁失敗也用名字硬換。extra.rival = 其他召喚師名 */
function bindSceneToGirl(girl, raw, extra = {}) {
  const g = girl || girlForSession();
  const player = playerBindName();
  let text = String(raw || "");
  if (!text) return "";
  const ctx = Cards.bindContextFromGirl?.(g, player);
  if (ctx && Cards.resolveCardBinds) {
    text = Cards.resolveCardBinds(text, ctx) || text;
  }
  const gname = sessionGirlName(g);
  const rival = String(
    extra.rival
    || state.cardSession?.dateChapter?.rivalName
    || summonerById(g?.summoner?.id)?.name
    || "另一個男人",
  );
  // 殘留占位符最後保險
  text = text
    .replace(/\[name\]/gi, gname)
    .replace(/\{name\}/gi, gname)
    .replace(/\[player\]/gi, player)
    .replace(/\{player\}/gi, player)
    .replace(/\[rival\]/gi, rival)
    .replace(/\{rival\}/gi, rival)
    .replace(/\[summoner\]/gi, rival)
    .replace(/\{summoner\}/gi, rival);
  return text;
}

function cardPlayMsgs(girl, play) {
  const sess = state.cardSession;
  const g = girl || girlForSession();
  const def = play?.cardId ? Cards.cardById(play.cardId) : null;
  let venueName = null;
  if (sess?.mode === "date" && sess.venueId) {
    venueName = (Cards.venuesList?.() || []).find(v => v.id === sess.venueId)?.name || null;
  }
  const kind = def?.kind || "speech";
  const ctx = g ? buildCtx(g) : { character: { name: sessionGirlName(g) }, relationship: { stage: "stranger" }, player: { name: playerBindName() } };
  ctx.want_guard_flag = false;
  const player = playerBindName();
  // 餵完整動態場面，並把 [name]/[eye]/[breast] 綁到這位女子（連續出卡必重綁）
  const rivalName = play?.rivalName
    || sess?.dateChapter?.rivalName
    || summonerById(g?.summoner?.id)?.name
    || "";
  const sceneRaw = play?.sceneStart || Cards.sceneTextFor?.(state, play?.cardId) || def?.sceneStart || "";
  const scene = bindSceneToGirl(g, sceneRaw, { rival: rivalName });
  const hintRaw = def?.promptHint || "";
  const hintBound = bindSceneToGirl(g, hintRaw, { rival: rivalName });
  // 寫回 play，讓 UI／生圖也吃綁定後文案
  if (play) {
    play.sceneStart = scene;
    play._boundName = sessionGirlName(g);
    play.girlId = g?.id || sess?.girlId || null;
    if (rivalName) play.rivalName = rivalName;
  }
  ctx.card_play = {
    mode: sess?.mode || "kanban",
    venue_name: venueName,
    kind,
    card_name: play?.name || def?.name || "",
    scene_start: scene,
    visual_beat_zh: "",
    prompt_hint: hintBound,
    open_fail: !!(play?.open && play.open.success === false),
    open_ok: !!(play?.open && play.open.success),
    feel_label: play?.feelLabel || "",
    chain_attr: play?.chain?.attr || sess?.chain?.attr || "",
    emotion_delta: play?.emotionDelta ?? 0,
    sex_phase: play?.sexPhase || def?.sexPhase || "",
    sex_tier: play?.sexTier || def?.sexTier || "",
    sex_end: !!(play?.sexEnd || def?.sexEnd),
    date_track: play?.dateTrack || def?.dateTrack || sess?.dateChapter?.track || "normal",
    date_stage: play?.dateChapterStage ?? def?.dateStage ?? sess?.dateChapter?.stage ?? 1,
    date_ending: play?.dateEnding || def?.dateEnding || sess?.dateChapter?.ntrEnding || "",
    rival_name: rivalName,
  };
  try {
    const tier = craveTier?.(girl);
    if (tier) ctx.craving = { tier };
  } catch { /* */ }
  const sys = buildCardPlayPrompt(ctx);
  const act = String(scene || play?.name || "").replace(/\s+/g, " ").slice(0, 160);
  const whoName = sessionGirlName(g);
  const who = `你是「${whoName}」，對方是「${player}」。外貌與職業以 system 人設為準，不可變成路人或「？」。`;
  let user;
  if (play?.open && play.open.success === false) {
    user = `（${who}旁白：他做了「${act}」，你沒接住。用 1～3 句回話：兇／慌／嘴硬。只有台詞，不要寫表情：動作：。）`;
  } else if (kind === "girl_trait") {
    user = `（${who}旁白：這一拍是「${act}」。用 1～3 句接話。只有台詞。）`;
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) >= 6
  ) {
    const rn = rivalName || "那個男人";
    const end = play?.dateEnding || def?.dateEnding || sess?.dateChapter?.ntrEnding || "";
    if (end === "taken") {
      user = `（${who}結局：召喚師「${rn}」正帶你走，你會成為他那邊的看板娘。「${act}」。用 1～3 句——被帶走的心虛／軟／隻字片語。只有台詞。）`;
    } else {
      user = `（${who}結局：你走回「${player}」身邊。「${act}」。用 1～3 句安撫他——沒事了、回去吧之類；可心虛但明確回到玩家。只有台詞。）`;
    }
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) >= 5
  ) {
    const rn = rivalName || "那個男人";
    user = `（${who}NTR場面：正在幹你、讓你高潮的是「${rn}」，不是「${player}」。「${act}」。用 1～3 句——對${rn}甜膩失神求更深／接受他的中出；「${player}」不在場。只有台詞，不要寫表情：動作：。）`;
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) >= 4
  ) {
    const rn = rivalName || "那個男人";
    user = `（${who}場面：你正與召喚師「${rn}」交配「${act}」。用 1～3 句台詞——被插入的驚怒羞喘慌；「${player}」不在近處。只有台詞，不要寫表情：動作：。）`;
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) >= 3
  ) {
    const rn = rivalName || "那個男人";
    user = `（${who}場面：召喚師「${rn}」正在猥褻你「${act}」。用 1～3 句台詞——驚／怒／羞／慌／想推開；「${player}」不在近處。只有台詞，不要寫表情：動作：。）`;
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) >= 2
  ) {
    const rn = rivalName || "那個男人";
    user = `（${who}【玩家不在場】：在「${player}」不在的地方，召喚師「${rn}」正在與你互動「${act}」。用 1～3 句台詞接住——對${rn}／對當下，可帶驚或心虛；禁止對「${player}」當面說話。只有台詞，不要寫表情：動作：。）`;
  } else if (
    kind === "venue_event"
    && (play?.dateTrack === "ntr" || def?.dateTrack === "ntr")
    && Number(play?.dateChapterStage || def?.dateStage || 1) === 1
  ) {
    const rn = rivalName || "那個男人";
    user = `（${who}【玩家旁觀】：「${player}」看著召喚師「${rn}」介入你「${act}」。用 1～3 句——接住${rn}對你做的事與你的反應（驚／尷尬／心虛），可瞥向「${player}」。只有台詞，不要寫表情：動作：。）`;
  } else if (kind === "venue_event") {
    user = `（${who}旁白：現場是「${act}」。用 1～3 句反應。只有台詞。）`;
  } else if (kind === "erotic" || kind === "foreplay" || kind === "intercourse" || kind === "sex") {
    const stage = g?.stage || "stranger";
    const attHint =
      stage === "wife" ? "妻子態度＝順從、享受、投入（可軟可要，不是仇視）"
        : stage === "girlfriend" ? "女友態度＝羞恥但享受（嗔、臉紅、情動，不是盛怒仇視）"
          : stage === "friend" ? "朋友態度＝憤怒＋羞恥（太過分、尷尬拒絕，不是撒嬌求歡）"
            : "陌生態度＝盛怒＋羞恥＋強烈抗拒（罵、推、放開，禁止享受語氣）";
    if (kind === "erotic") {
      user = `（${who}旁白：猥褻「${act}」。${attHint}。用 1～3 句正常說話呈現該態度。禁止整段只剩啊嗯。只有台詞。）`;
    } else if (kind === "foreplay") {
      user = `（${who}旁白：前戲「${act}」。${attHint}。完整句子；可略喘。禁止整段胡言。只有台詞。）`;
    } else {
      const phase = play?.sexPhase || def?.sexPhase || "";
      if (phase === "climax") {
        user = `（${who}旁白：L4 高潮「${act}」。大腦空白淫聲；碎渣仍符合：${attHint}。只有台詞。）`;
      } else if (phase === "player_climax") {
        user = `（${who}旁白：L5 中出「${act}」。失神氣音；碎渣仍符合：${attHint}。只有台詞。）`;
      } else if (phase === "intercourse_intense") {
        user = `（${who}旁白：L3 激烈「${act}」。喘碎語；態度碎渣：${attHint}。只有台詞。）`;
      } else {
        user = `（${who}旁白：L2 正戲「${act}」。淫聲碎語；態度碎渣：${attHint}。禁止正常長句。只有台詞。）`;
      }
    }
  } else {
    user = `（${who}旁白：他剛做的是「${act}」。用 1～3 句回話，像真人（例如打招呼就回打招呼）。只有台詞，禁止寫「表情：」「動作：」。）`;
  }
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

/**
 * 作廢進行中的出卡文字 AI（看完反應／離開）。
 * 遞增 playAiGen：已下單的收貨若 gen 不符就丟，不寫入 girlLine。
 */
function voidCardPlayAi() {
  cardUi.playAiGen = (cardUi.playAiGen || 0) + 1;
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  cardUi.playAiStartedGen = null;
}

/** 離開牌桌或換下一張卡時作廢文字＋場景 */
function voidCardPlayAiAndScene() {
  voidCardPlayAi();
  voidCardSceneArt();
  cardUi.sceneArtPending = false;
}

/**
 * 場景圖是否還在等（要擋「繼續」）。
 * 開著出卡場景圖時：pending 就擋；關了就不擋，避免卡死。
 */
function isCardSceneArtWaiting(girl, play) {
  if (!play?.cardId) return false;
  if (!cardSceneArtOn()) return false;
  if (cardUi.sceneArtPending) return true;
  return girl?.cardCg?.[`card:${play.cardId}`]?.status === "pending";
}

/** 場景圖結束（成功／失敗／關掉）：清 pending，必要時回退立繪，避免永遠卡住繼續 */
function settleCardSceneArtWait(girl, cardId, { ok = false, url = "" } = {}) {
  cardUi.sceneArtPending = false;
  if (!girl || !cardId) return;
  const cg = ensureCardCgMap(girl);
  const key = `card:${cardId}`;
  const cur = cg[key];
  if (ok && url) {
    const bust = url.includes("?") ? url : `${String(url).split("#")[0]}?v=${Date.now()}`;
    cg[key] = {
      url: bust,
      status: "ready",
      at: Date.now(),
      source: "scene_play",
      ...(cur?.sceneEn ? { sceneEn: cur.sceneEn } : {}),
      ...(cur?.visualBeatZh ? { visualBeatZh: cur.visualBeatZh } : {}),
    };
    rememberCardSceneChain(bust);
    return;
  }
  if (cur?.status !== "pending") return;
  delete cg[key];
  syncPortraitCgCache(girl);
  // 失敗也盡量留在本桌場景鏈上，不要硬切半身
  const place = cardTablePlaceUrl(girl) || cur.url || "";
  cg[key] = {
    url: place,
    status: place ? "ready" : "error",
    at: Date.now(),
    source: place ? (cardSceneChainUrl() ? "scene_chain_hold" : "alias_portrait") : "scene_error",
  };
}

/** 台詞就緒後才排場景圖（文字 → 英文畫圖句 → 圖） */
function startSceneArtAfterText(girl, play) {
  if (!girl || !play?.ok) return;
  if (!cardUi.awaitReaction || cardUi.lastPlay !== play) return;
  if (!cardSceneArtOn()) {
    settleCardSceneArtWait(girl, play.cardId, { ok: false });
    return;
  }
  if (play._sceneArtQueued) return;
  cardUi.sceneArtPending = true;
  queueCardSceneArt(girl, play, (ok) => {
    if (cardUi.lastPlay === play) {
      // queue 內已寫 cardCg；這裡確保 pending 旗標清掉
      if (!ok) settleCardSceneArtWait(girl, play.cardId, { ok: false });
      else cardUi.sceneArtPending = false;
    }
    if (cardUi.awaitReaction && document.body.classList.contains("card-mode")) {
      renderCardTable();
    }
  });
  if (document.body.classList.contains("card-mode")) renderCardTable();
}

/** 先下她的文字單（不先生圖） */
function beginCardPlayText(girl, play) {
  if (!girl || !play?.ok) return;
  if (!cardUi.awaitReaction || cardUi.lastPlay !== play) return;

  if (!state.settings?.model) {
    // 罐頭已在 play.girlLine
    play.fromAi = false;
    cardUi.playAiPending = false;
    startSceneArtAfterText(girl, play);
    if (document.body.classList.contains("card-mode")) renderCardTable();
    return;
  }
  const token = `${Date.now().toString(36)}_${play.cardId || "x"}`;
  const gen = cardUi.playAiGen || 0;
  cardUi.playAiToken = token;
  cardUi.playAiKey = `cardplay:${girl.id}:${token}`;
  cardUi.playAiPending = true;
  cardUi.playAiStartedGen = gen;
  // 保留 sceneArtPending：出卡時已 prime 成「要重畫」；文字好了再真正 queue
  if (cardSceneArtOn() && play.cardId) {
    const st = girl?.cardCg?.[`card:${play.cardId}`]?.status;
    if (st === "pending") cardUi.sceneArtPending = true;
  }
  genPost(cardUi.playAiKey, cardPlayMsgs(girl, play), 12).catch(() => {});
  if (document.body.classList.contains("card-mode")) renderCardTable();
}

/**
 * 出卡管線：
 *  - 有預回話且非例外 → 直接採用，立刻開畫圖（準備時已產動作＋回話）
 *  - 否則 → 現場 AI 回話 → 再畫圖
 * 每次出卡都重畫場景（prime 已作廢舊 cardCg）。
 */
function beginCardPlayAi(girl, play) {
  voidCardPlayAiAndScene();
  if (!girl || !play?.ok) return;

  cardUi.playAiPending = false;
  if (cardSceneArtOn() && play.cardId && girl?.cardCg?.[`card:${play.cardId}`]?.status === "pending") {
    cardUi.sceneArtPending = true;
  }

  const narr = state.cardSession?.cardNarr?.[play.cardId];
  if (canUsePrefetchReply(play, narr)) {
    applyPlayReact(play, narr.reply);
    play.fromAi = narr.replyFrom === "ai";
    play.fromPrefetch = true;
    cardUi.playAiPending = false;
    // 動作旁白用準備好的 text（commit 已 sceneTextFor）；回話已齊 → 直接畫圖
    startSceneArtAfterText(girl, play);
    if (document.body.classList.contains("card-mode")) renderCardTable();
    return;
  }

  play.fromPrefetch = false;
  beginCardPlayText(girl, play);
}

async function genCardPlayOrder() {
  // 先收文字；圖在文字完成後另排
  if (!cardUi.awaitReaction || !cardUi.playAiPending || !cardUi.playAiKey) return;
  if (!cardUi.lastPlay || !state.settings?.model) {
    voidCardPlayAi();
    return;
  }
  const girl = girlForSession();
  if (!girl) {
    voidCardPlayAi();
    return;
  }
  const token = cardUi.playAiToken;
  const key = cardUi.playAiKey;
  const startedGen = cardUi.playAiStartedGen;
  const play = cardUi.lastPlay;
  const r = await genPost(key, cardPlayMsgs(girl, play), 12);
  if (!r) return;
  if (cardUi.playAiStartedGen !== startedGen) return;
  if (cardUi.playAiToken !== token || !cardUi.awaitReaction) return;
  if (r.status === "pending" || r.status === "running" || r.status === "queued") return;

  if (r.status === "done" && r.result) {
    const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
    let line = applyPlayReact(play, text);
    if (!line || Cards.isWeakLine?.(line)) {
      const defFb = play?.cardId ? Cards.cardById(play.cardId) : null;
      line = Cards.girlReactionLine({
        stage: girl.stage || "stranger",
        emotionDelta: play.emotionDelta || 0,
        openFail: !!(play.open && play.open.success === false),
        kind: defFb?.kind || play?.kind || "",
        sexPhase: play?.sexPhase || defFb?.sexPhase || "",
      });
      applyPlayReact(play, line);
      play.fromAi = false;
    } else {
      play.fromAi = true;
    }
    cardUi.playAiPending = false;
    cardUi.playAiKey = null;
    cardUi.playAiToken = null;
    cardUi.playAiStartedGen = null;
    // 台詞給玩家看完 → 再依台詞產表情／動作 → 英文 → 生圖
    startSceneArtAfterText(girl, play);
    if (cardUi.awaitReaction && document.body.classList.contains("card-mode")) {
      renderCardTable();
    }
  } else if (r.status === "error") {
    cardUi.playAiPending = false;
    cardUi.playAiKey = null;
    cardUi.playAiToken = null;
    cardUi.playAiStartedGen = null;
    if (play) play.fromAi = false;
    if (!play.girlLine || Cards.isWeakLine?.(play.girlLine)) {
      const defFb = play?.cardId ? Cards.cardById(play.cardId) : null;
      applyPlayReact(play, Cards.girlReactionLine?.({
        stage: girl.stage || "stranger",
        emotionDelta: play.emotionDelta || 0,
        openFail: !!(play.open && play.open.success === false),
        kind: defFb?.kind || play?.kind || "",
        sexPhase: play?.sexPhase || defFb?.sexPhase || "",
      }) || "……啊……嗯……");
    }
    startSceneArtAfterText(girl, play);
    if (cardUi.awaitReaction && document.body.classList.contains("card-mode")) {
      renderCardTable();
    }
  }
}

// 半預製聊天的失敗計數:連敗 3 次 → 改用罐頭台詞讓紋亮起來(crestFallback 參照),不無聲卡死
let chatGenFail = { count: 0, at: 0 };

// 點某位看板娘時取她的一句預生台詞(即取即消耗);沒有就回 null 讓罐頭上場
function popQuip(s) {
  const q = s && state.quips?.[s.id];
  if (!q || q.hash !== questHash()) return null;
  const line = q.lines.shift();
  if (line) scheduleSave();
  return line || null;
}

// 釋放成功:她脫離「被召喚」狀態回到你身邊,原本的動作接著開始(費用已在進觀戰時付過)
function rescueFromWatch(s) {
  const { playerType, playerLocation } = watchSession || {};
  watchSession.ended = true;
  chatAbort?.abort();
  if (s.summoner) s.summoner.taken = null;
  simRescueOf(s);   // 回報伺服器:她掙脫召喚
  vnShow("", `${s.name} 掙脫了召喚,回到你身邊!`, "sys");
  toast(`${s.name} 回來了!`, "good");
  setTimeout(() => {
    watchWith = null; watchSession = null;
    document.body.classList.remove("chat-mode");
    // M6：牌制下接回牌桌／約會桌，不進自由聊
    if (cardSystemOn()) {
      if (playerType === "date") {
        const venues = Cards.venuesList?.() || [];
        const vid = venues.find(x => x.id === playerLocation)?.id
          || venues.find(x => x.name === playerLocation)?.id
          || playerLocation;
        if (vid && venues.some(x => x.id === vid)) {
          openDateTable(s.id, vid);
        } else {
          toast("回來了——再開一次約會吧", "good");
          renderAll();
        }
      } else if (isKanban(s.id)) {
        openKanbanTable(s.id);
      } else {
        toast(`${s.name} 回來了`, "good");
        renderAll();
      }
      return;
    }
    enterChat(s.id, playerType || "chat", playerLocation, true);
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

// 觀戰 VN:解析「他:…／她:…」,分兩行顯示;解析失敗則整段當旁白。act 給的話標示紀錄時間。
function vnShowWatch(su, s, raw, done = false, act = null) {
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
  const when = act?.t ? ` ・ ${relTime(act.t)}` : "";
  $("#vn-name").textContent = `${su.emoji || "👤"} ${su.name} ／ ${s.name}${when}`;
  $("#vn-name").style.color = "var(--red)";
}

function setWatchBtns(enabled) {
  const nx = document.getElementById("watch-next");
  if (nx) nx.disabled = !enabled;
}

// 階段內的前後期:取代舊版直接餵給她的好感數值(world.md 明寫她絕不知道任何數值)
function stageProgress(s) {
  const cur = stageInfo(s.stage)?.[2] ?? 0;
  const ns = nextStage(s);
  if (s.affection < 0) return "你們最近有點僵,你自己也說不上來為什麼。";
  if (!ns) return "你們早就穩定下來了,這樣的日子過得理所當然。";
  const p = (s.affection - cur) / Math.max(1, ns[2] - cur);
  if (p < 0.25) return "你們才剛走到這一步沒多久,你自己都還有點不習慣。";
  if (p > 0.75) return "你隱隱覺得你們之間又要變了,但還沒說破。";
  return null;
}

function buildCtx(s) {
  if (!s) {
    const snap = state.cardSession?.girlSnap;
    if (snap) return buildCtx(snap);
    return {
      character: { name: "她", look: {} },
      relationship: { stage: "stranger", progress: null, days_since_summon: 0 },
      player: { name: playerBindName() },
      world: WORLD_LORE,
      content_rating: state.settings?.rating || "nsfw",
    };
  }
  const slot = timeSlot();
  const sch = s.schedule || {};
  return {
    character: {
      name: s.name || sessionGirlName(s), rarity: s.rarity, personality: s.personality,
      speech_style: s.speech, appearance_dna: s.dna, backstory: s.backstory || "",
      schedule: sch,
      current_activity: sch[slot] || null,   // 這個時段她原本的生活在做什麼
      // 新制人設(原型骨幹;舊魅魔沒有這些欄位,persona_builder 會自動略過)
      tone: s.tone || null, catchphrases: s.catchphrases || null, reactions: s.reactions || null,
      quirk: s.quirk || null, contrast: s.contrast || null,
      likes: s.likes || null, dislikes: s.dislikes || null, hobbies: s.hobbies || null,
      chrono: s.chrono || null, arc: s.arc || null,
      libido: s.libido || null, look: s.look || null, special_traits: s.specialTraits || null,
      // 她身上穿的是哪一套(生涯服裝 or 衣櫃第幾套)——聊天講的要跟立繪畫的一致
      outfitPick: s.outfitPick ?? null,
      job_desc: s.jobDesc || null,
    },
    relationship: {
      stage: s.stage,
      // 好感數值不再餵給她——改成階段內的模糊進度感
      progress: stageProgress(s),
      days_since_summon: Math.floor((Date.now() - s.summonedAt) / 86400000),
    },
    // 她盯著的那一件委託:由遊戲挑好(ensureErrand),AI 只負責用她的個性講出來
    pinned_quest: ensureErrand(s),
    // 防備狀態:他剛才越界的話,接下來幾句更冷(只有陌生階段有)
    guard: guardActive(s) ? { hits: s.guard.hits } : null,
    // 飢渴檔位:平靜時回 null,persona_builder 就完全不提這件事
    craving: craveTier(s),
    // 陌生階段才要她回報 #越界 旗標(其他階段用不到,也省 token)
    want_guard_flag: s.stage === "stranger",
    scene: {
      type: chatSession?.type || "chat", location: chatSession?.location || null,
      scene_prompt: chatSession?.locationDesc || null,
      // 場景變化只取真的有場景意義的那種(約會開始/結束…);
      // 「新的一次對話」只是切上下文用的分隔線,不必唸給她聽
      transition: [...(s.history || [])].reverse()
        .find(m => m.role === "sys" && !m.content.includes("新的一次對話"))?.content || null,
      time_of_day: slot,
      time_label: SLOT_LABEL[slot],
    },
    content_rating: state.settings.rating || "nsfw",
    player: { name: state.settings.player || "主人" },
    world: WORLD_LORE,
    quests: questSnapshot(),   // 她看得見你的待辦清單(聊天話題素材)
    // 她被另一個召喚師纏上時,那段關係對「她跟你互動」的滲透(變心)
    rival: s.summoner ? (() => {
      const idx = s.summoner.stage ?? 0;
      const name = rivalStageName(idx);
      return {
        summoner_name: summonerById(s.summoner.id)?.name || "另一個男人",
        stage_idx: idx, stage_name: name,
        tone_override: STAGE_SCRIPTS.chat_rival[name] || null,
      };
    })() : null,
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

// 通用 LLM 執行:
// - Grok Build: /api/gen 訂單佇列(streaming-json end 即完成)
// - Ollama: chat_job 串流輪詢
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

  // ── Grok Build 訂單制 ──
  if (llmIsOrder()) {
    const key = `live:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
    const t0 = Date.now();
    let fails = 0;
    while (true) {
      if (chatAbort.signal.aborted) { const e = new Error("aborted"); e.name = "AbortError"; throw e; }
      if (Date.now() - t0 > 300000) throw new Error("等太久了(逾時)");
      if (document.hidden) { await new Promise(r => setTimeout(r, 800)); continue; }
      let j;
      try {
        const r = await fetch("/api/gen", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            key, retry: true, ...llmRouteFields(),
            model: state.settings.model, messages, options: { temperature: 0.9 },
          }),
          signal: chatAbort.signal,
        });
        if (!r.ok) throw new Error("http " + r.status);
        j = await r.json();
        fails = 0;
      } catch (e) {
        if (e.name === "AbortError") throw e;
        if (++fails > 40) throw new Error("網路中斷太久");
        await new Promise(r => setTimeout(r, 800));
        continue;
      }
      if (j.status === "error") throw new Error(j.error || "Grok Build 失敗");
      if (j.status === "done") {
        const text = (j.result || "").trim();
        if (!text) throw new Error("模型回了空訊息");
        onToken(text);
        return text;
      }
      await new Promise(r => setTimeout(r, 800));
    }
  }

  // ── Ollama:chat_job 串流 ──
  const startRes = await fetch("/api/llm/chat_job", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...llmRouteFields(),
      model: state.settings.model, messages, options: { temperature: 0.9 },
    }),
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
  // 串流顯示與最終結果都過濾旗標,免得 #越界 漏到畫面或對話歷史裡
  const raw = await llmJobRun(msgs, acc => onToken(stripGuardFlag(acc).text || acc), canned);
  const { text, crossed } = stripGuardFlag(raw);
  applyGuard(s, crossed);
  markErrandAsked(s);
  return text || raw;
}

async function sendChatMsg() {
  const s = state.succubi.find(x => x.id === chatWith);
  const input = document.getElementById("chat-input");
  if (!s || !chatSession || chatSession.busy) return;
  // M6：自由聊已退役——擋掉殘 session 再寫 history
  if (freeChatRetired() && chatSession.type === "chat") {
    toast("日常互動改走牌桌了", "");
    exitChat();
    if (isKanban(s.id)) openKanbanTable(s.id);
    return;
  }
  const text = input.value.trim();
  if (!text) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }

  input.value = "";
  s.history ??= [];
  s.history.push({ role: "user", content: text, t: Date.now() });
  guardTick(s);   // 防備降溫:玩家每送一則就退一格,冷完自然回溫
  vnShow(state.settings.player || "你", text, "user");

  // 聊天:送出就跳出對話——她要花時間打字,不讓玩家對著空畫面等。
  // 淫紋改成「對話框 …」表示她正在輸入;她寫完就變回淫紋,點進來讀她的回覆、接著聊。
  if (chatSession.type === "chat") {
    chatSession.ended = true;
    chatSession.gotReply = true;
    s.lastChatDay = dayNum();
    s.chatSess ??= { turnCap: chatSession.turnCap, playerMsgs: 0, at: Date.now() };
    s.chatSess.playerMsgs = ++chatSession.playerMsgs;
    s.chatSess.at = Date.now();
    s.chatLine = null;
    s.typing = { at: Date.now() };   // 她正在回你(背景生成,見 genReplyOrder)
    dirty = true;
    saveNow();
    toast(`訊息傳出去了……${s.name} 正在回你`, "good");
    exitChat();
    try { genTick(true); } catch { /* 下輪 tick 會再下單 */ }
    return;
  }

  // 約會:即時往返——她當場回話,聊到回合上限她才喊停
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

    // 回合上限(每次隨機):達標後鎖輸入、顯示收尾鈕,由玩家讀完最後一句自己按著結束(結算情感)
    if (chatSession.playerMsgs >= chatSession.turnCap) {
      chatSession.ended = true;
      chatEndButton(chatSession.type === "date" ? "結束約會 ▶" : "結束對話 ▶");
      return;
    }
  } catch (e) {
    s.history.pop();
    if (e.name !== "AbortError") {
      console.error("LLM error:", e);
      const why = e.message && e.message !== "proxy error" ? `原因:${e.message}` : "連不上 LLM";
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

// 玩家詢問她「你不在的時候發生了什麼」的台詞/她的反應(SFW 佔位,可日後移到內容模組)
const ASK_PLAYER_LINE = "「老實說……我不在的時候,有沒有發生什麼事?」";
const ASK_NONE_LINES = [   // 沒有可說的紀錄 → 她生氣離開
  "「你什麼意思?懷疑我?……我不想跟你說話了。」",
  "「莫名其妙。沒有的事你也要問——我走了。」",
  "「你就是這樣不信任我對吧。……夠了。」",
];
const ASK_AFTER_LINES = [   // 說完了 → 不悅、心累,不會加分
  "「……問完了?開心了嗎。」",
  "「你要我全說出來,說完了你又是這種表情。」",
  "「別再問了。這種事,你以為我想講?」",
];

// 詢問:不送出玩家輸入,而是問她不在時發生的事,她坦白 1~2 則未看過的紀錄。
// 這種對談不加情感(0~−1),沒有可說的就生氣離開。她此刻若正被召喚中會走觀戰,不會進到這裡。
async function askAboutActs() {
  const s = state.succubi.find(x => x.id === chatWith);
  if (!s || !chatSession || chatSession.busy) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  // 她的召喚師紀錄由伺服器權威運算;進聊天前的同步已把鏡像更新到 s.summoner.acts
  const su = s.summoner ? summonerById(s.summoner.id) : null;
  const unseen = su ? unseenActs(s) : [];

  chatSession.busy = true;
  setChatWaiting(true);
  const sendBtn = document.getElementById("chat-send");
  const askBtn = document.getElementById("chat-ask");
  if (sendBtn) sendBtn.disabled = true;
  if (askBtn) askBtn.disabled = true;
  vnShow(state.settings.player || "你", ASK_PLAYER_LINE, "user");
  await new Promise(r => setTimeout(r, 900));

  // 沒有未看過的紀錄(含她根本沒被纏上)→ 她生氣,情感 −1,離開對話
  if (!su || !unseen.length) {
    vnShow(s.name, pick(ASK_NONE_LINES), "ai");
    vnDone();
    applyAffection(s, -1);
    chatSession.ended = true;
    // 她生氣走人:這場聊天就此中斷(不另外結算,淫紋熄滅)
    s.chatSess = null; s.chatLine = null; s.typing = null;
    scheduleSave();
    setTimeout(() => { if (chatSession?.ended) exitChat(); }, 2400);
    return;
  }

  // 坦白 1~2 則(從最舊開始);沒生成好的文字當場現生
  const take = Math.min(randInt(1, 2), unseen.length);
  for (let i = 0; i < take; i++) {
    const act = unseenActs(s)[0];
    if (!act) break;
    try {
      if (!act.text) {
        vnTyping(true);
        act.text = await llmJobRun(actMsgs(s, su, act), acc => vnShowWatch(su, s, acc, false, act), "他:過來。\n她:……別這樣。");
      }
      vnShowWatch(su, s, act.text, true, act);
      vnDone();
    } catch (e) {
      if (e.name === "AbortError") return;
      break;
    }
    act.seen = true;
    simSeenOf(s, act);   // 回報伺服器:這則已被詢問揭露
    await new Promise(r => setTimeout(r, 2400));
  }

  // 詢問不加情感,反而 0~−1(她被逼著全招,心更遠了)
  applyAffection(s, randInt(-1, 0));
  vnShow(s.name, pick(ASK_AFTER_LINES), "ai");
  vnDone();
  scheduleSave();
  if (chatSession && !chatSession.ended) {
    chatSession.busy = false;
    setChatWaiting(false);
    if (sendBtn) sendBtn.disabled = false;
    if (askBtn) askBtn.disabled = false;
    document.getElementById("chat-input")?.focus();
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

// 限時多看板娘:必須付費召喚、到期自動解除、無自動遞補。
// 費用:第 1 位 1 金;第 n 位(n≥2)= 50×(n-1) − 召喚減費等級,地板 2 金。
function kanbanSuccubi() {
  const now = Date.now();
  const out = [];
  for (const k of (state.kanbans || [])) {
    if (!k.until || now >= k.until) continue;
    const s = state.succubi.find(x => x.id === k.id);
    if (s && !s.ntr) out.push(s);
  }
  return out;
}
function kanbanSuccubus() { return kanbanSuccubi()[0] || null; }   // 主看板娘(最早召喚仍在任)
function isKanban(id) { return kanbanSuccubi().some(s => s.id === id); }
function kanbanCost() {
  const n = kanbanSuccubi().length;
  if (n === 0) return 1;
  return Math.max(2, 50 * n - expLv("cheap"));
}
// ⚠ 召喚師模擬的權威實作已搬到 server/sim.py(纏上=每 30 分一輪 1/5、召喚=每小時判定)。
// 以下客戶端版與常數僅供 DBG 測試殘留,不再參與正式流程(正式一律由 simSync 取伺服器狀態)。
const DRAW_CHANCE = 1 / 20;   // (legacy)未纏上抽召喚師機率——實際規則見 sim.py 的 ENTANGLE_CHANCE(1/5)
const TAKEN_CHANCE = 1 / 3;   // (legacy)已纏上被召喚機率——實際規則見 sim.py 的 TAKEN_CHANCE
const ACT_CAP = 60;           // 每隻魅魔保留的互動紀錄上限(好感早已入帳,丟的只是舊文字)

// ── 召喚師互動紀錄(act):猥褻(1則)或交配(起承合3則,算1次交配)。文字由背景佇列補生成 ──
function pushRec(s, rec) {
  (s.summoner.acts ??= []).push({ id: uid(), text: null, seen: false, ...rec });
  if (s.summoner.acts.length > ACT_CAP) s.summoner.acts.splice(0, s.summoner.acts.length - ACT_CAP);
}
function unseenActs(s) { return (s.summoner?.acts || []).filter(a => !a.seen); }
// 「可看」的未讀:文字已在背景生成好的才算(沒生好的不顯示、不給看,生好才浮出)
function readyUnseen(s) { return (s.summoner?.acts || []).filter(a => !a.seen && a.text); }

// 懷孕/娶走:她脫離魅魔身分、跟召喚師走,永久消失(只留日誌)
function marryAway(s) {
  const su = summonerById(s.summoner.id);
  log(`${s.name} 懷了 ${su?.name || "召喚師"} 的孩子,脫離魅魔身分、跟他走了,永遠離開萬事屋。`);
  toast(`${s.name} 懷孕了……她成了 ${su?.name || "他"} 的妻子,永遠消失了。`, "bad");
  Cards.closeSessionIfGirl(state, s.id);
  state.succubi = state.succubi.filter(x => x.id !== s.id);
  state.kanbans = (state.kanbans || []).filter(k => k.id !== s.id);
  document.body.classList.remove("card-mode");
}
function advanceRivalStage(s) {
  const sm = s.summoner;
  sm.stage = Math.min(5, (sm.stage ?? 0) + 1);
  sm.resist = STAGE_RESIST[sm.stage];
  sm.matingCount = 0;
}
// 一次交配:生起承合三則(算一次),依階段推進/告白/解環/懷孕。回傳她是否被娶走。
function doMating(s, at) {
  const sm = s.summoner;
  const su = summonerById(sm.id);
  const pool = (sm.kinks && sm.kinks.length) ? sm.kinks : KINKS.map(k => k.name);
  const kink = pool.length ? pick(pool) : "交合";
  const matingId = uid();
  const ringLocked = !sm.ringUnlocked;
  for (const beat of ["起", "承", "合"])
    pushRec(s, { t: at, kind: "mating", matingId, beat, kinkName: kink, ring: ringLocked });
  sm.matingCount = (sm.matingCount || 0) + 1;
  const stg = sm.stage ?? 0;
  if (stg <= 3) {
    if (sm.matingCount >= STAGE_ADVANCE[stg]) advanceRivalStage(s);
  } else if (stg === 4) {
    if (Math.random() < CONFESS_CHANCE) { log(`${s.name} 對 ${su?.name || "他"} 主動告白了……`); advanceRivalStage(s); }
  } else if (stg === 5) {
    if (!sm.ringUnlocked && sm.matingCount >= FIANCEE_MATINGS) {
      sm.ringUnlocked = true;
      log(`${s.name} 主動解開了 ${su?.name || "他"} 的魔法環……`);
    }
    if (sm.ringUnlocked && Math.random() < PREGNANCY_CHANCE) { marryAway(s); return true; }
  }
  return false;
}
// 一個 act slot:NSFW 才擲交配(1/resist),中=交配(3則)、沒中=猥褻(1則);每 slot 抵抗 −1。
// 回傳她是否被娶走。SFW 一律只有猥褻,不交配、不推進、不會失去她。
function processActSlot(s, at) {
  const sm = s.summoner;
  sm.stage ??= 0;
  sm.resist ??= STAGE_RESIST[sm.stage];
  const nsfw = (state.settings.rating || "nsfw") === "nsfw";
  let removed = false;
  if (nsfw && Math.random() < 1 / Math.max(1, sm.resist)) removed = doMating(s, at);
  else pushRec(s, { t: at, kind: "flirt", type: sm.taken?.type || "kanban", location: sm.taken?.location || null });
  sm.resist = Math.max(1, sm.resist - 1);
  return removed;
}

// 召喚師擲骰(離線會補算,at 用歷史時點):
// 未纏上 → 每 drawIvlH(2~5)小時擲一次,1/20 被召喚師纏上(同時抽 4~10 個性趣給這對)。
// 已纏上且未被召喚中 → 每「一小時」判定一次,TAKEN_CHANCE 機率他召喚她。
//   召喚(看板型)持續 2~5 小時,約會(date 型)固定持續 1 小時;解召喚後隔一小時才會再判定。
function checkSummonerDraws() {
  if (!SUMMONERS.length) return false;
  const now = Date.now();
  let changed = false;
  const kanIds = new Set(kanbanSuccubi().map(x => x.id));
  for (const s of state.succubi) {
    if (s.nextDraw == null) { s.drawIvlH ??= randInt(2, 5); s.nextDraw = now + s.drawIvlH * HOUR; }
    let rolls = 0;
    while (now >= s.nextDraw && rolls < 60) {
      rolls++;
      const at = s.nextDraw;
      const busyWithPlayer = (chatWith === s.id && chatSession) || watchWith === s.id;
      // 已纏上 → 每小時判定;未纏上 → 每 drawIvlH 小時判定
      let step = s.summoner ? HOUR : s.drawIvlH * HOUR;
      if (!s.summoner) {
        const blocked = s.ntr || kanIds.has(s.id) || busyWithPlayer;
        if (!blocked && Math.random() < DRAW_CHANCE) {
          const su = pick(SUMMONERS);
          s.summoner = makeSummonerRel(su.id);
          log(`${su.name} 纏上了 ${s.name}!`);
          toast(`⚠ ${su.name} 纏上了 ${s.name}`, "bad");
        }
      } else if (s.summoner.taken) {
        // 被召喚中:不重判,等時效到(processTakenActs 會解召喚),此小時空過
      } else if (!s.ntr && !busyWithPlayer && Math.random() < TAKEN_CHANCE) {
        const su = summonerById(s.summoner.id);
        const isDate = Math.random() < (su?.dateChance ?? 0.5);
        const loc = isDate ? (su?.spots?.length ? pick(su.spots).name : pick(DATE_SPOTS)[0]) : null;
        const dur = isDate ? 1 : randInt(2, 5);   // 約會 1 小時;召喚 2~5 小時
        s.summoner.taken = { type: isDate ? "date" : "kanban", location: loc, until: at + dur * HOUR, actAt: at };
      }
      s.nextDraw += step;
      changed = true;
    }
    if (s.nextDraw <= now) { s.nextDraw = now + (s.summoner ? HOUR : s.drawIvlH * HOUR); changed = true; }
  }
  return changed;
}

// 建一段新的召喚師關係(纏上時):抽 4~10 個性趣
function makeSummonerRel(suId) {
  const n = randInt(4, 10);
  const kinks = KINKS.length ? sampleN(KINKS.map(k => k.name), n) : [];
  return { id: suId, sinceDay: dayNum(), stage: 0, resist: STAGE_RESIST[0], matingCount: 0, ringUnlocked: false, kinks, taken: null, acts: [] };
}
function sampleN(arr, n) { const a = [...arr].sort(() => Math.random() - 0.5); return a.slice(0, Math.min(n, a.length)); }

// taken 持續狀態:每小時生 3~5 個 act slot(離線補算);時效到她自己回來(不通知)。
function processTakenActs() {
  const now = Date.now();
  let changed = false;
  for (const s of [...state.succubi]) {
    const tk = s.summoner?.taken;
    if (!tk) continue;
    tk.until ??= now + randInt(2, 5) * HOUR;
    tk.actAt ??= now;
    let guard = 0, married = false;
    while (tk.actAt <= now && tk.actAt < tk.until && guard < 200) {
      guard++;
      const n = randInt(3, 5);
      for (let i = 0; i < n; i++) { if (processActSlot(s, tk.actAt)) { married = true; break; } }
      tk.actAt += HOUR;
      changed = true;
      if (married) break;
    }
    if (!married && now >= tk.until && s.summoner) { s.summoner.taken = null; changed = true; }
  }
  return changed;
}

// ── 伺服器端召喚師模擬:同步層 ──────────────────────────────────────────
// 判定(召喚/約會)與召喚師 act 一律在伺服器運算,手機關螢幕也照跑;此處只負責
// 上傳名冊快照/回報玩家動作,並把權威狀態鏡像到 s.summoner 顯示。存檔仍只有手機寫。
let simPatch = {};              // 待送的玩家動作:{succId: {seen:[actId], texts:{actId:text}, rescue, clear}}
let simSyncBusy = false, lastSimSyncAt = 0;
let simSyncWaiters = [];        // force 同步排隊:busy 時後續 await 同一輪結果
function simBuf(s) { return (simPatch[s.id] ??= { seen: [], texts: {} }); }
function simTextOf(s, act) { if (act?.text && s?.summoner) simBuf(s).texts[act.id] = act.text; }   // 回填已生成文字
function simSeenOf(s, act) { if (!act || !s?.summoner) return; const p = simBuf(s); if (!p.seen.includes(act.id)) p.seen.push(act.id); if (act.text) p.texts[act.id] = act.text; }
function simRescueOf(s) { if (s?.summoner) simBuf(s).rescue = true; }
/** 破除纏身:伺服器寫 mem(同類型階段)後拔掉 rel;下次同召喚師再纏會接續 */
function simClearOf(s) { if (s) simBuf(s).clear = true; }

/** @param {boolean} [force] 為 true 時略過 15 秒節流(進觀戰前必須拉到最新預生 acts) */
async function simSync(force = false) {
  if (!state) return false;
  if (simSyncBusy) {
    // 已在飛:等這一輪結束;force 再補一槍確保拿到最新
    await new Promise(r => simSyncWaiters.push(r));
    if (force) return simSync(true);
    return false;
  }
  if (!force && Date.now() - lastSimSyncAt <= 15000) return false;
  simSyncBusy = true;
  const patches = simPatch; simPatch = {};   // 交出並清空(失敗補回)
  try {
    const roster = state.succubi.map(s => ({
      id: s.id, ntr: !!s.ntr, kanban: isKanban(s.id), rarity: s.rarity,
      busy: (chatWith === s.id && !!chatSession) || watchWith === s.id,
    }));
    const seeds = {};
    for (const s of state.succubi) if (s.summoner) seeds[s.id] = s.summoner;
    // 權威時鐘計時清單:看板娘到期、執行中委託逾期、當前日序(跨日結算)——伺服器據此判定
    const kanbans = (state.kanbans || []).map(k => ({ id: k.id, until: k.until }));
    const quests = execQuests().map(q => ({ id: q.id, deadline: q.deadline }));
    let resp;
    try {
      const r = await fetch("/api/sim/sync", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ now: Date.now(), rating: state.settings.rating || "nsfw", roster, seeds, patches,
                               kanbans, quests, day: dayNum() }),
      });
      if (!r.ok) throw new Error("sim http " + r.status);
      resp = await r.json();
    } catch (e) {
      // 失敗:把 patch 併回下次再送
      for (const [id, p] of Object.entries(patches)) {
        const q = (simPatch[id] ??= { seen: [], texts: {} });
        q.seen = [...new Set([...(q.seen || []), ...(p.seen || [])])];
        Object.assign((q.texts ??= {}), p.texts || {});
        if (p.rescue) q.rescue = true;
        if (p.clear) q.clear = true;
      }
      return false;
    }
    const rels = resp.rels || {};
    let changed = false;
    for (const s of state.succubi) {
      // 觀戰/聊天中不覆蓋:避免直播途中被整包蓋掉(進場前 enterWatch 會 force sync 且尚未設 watchWith)
      if (watchWith === s.id || (chatWith === s.id && chatSession)) continue;
      let rel = rels[s.id] ?? null;
      // 伺服器 act 文字常為 null(由手機背景 gen 填);覆蓋鏡像時保留本地已生成的 text,避免預生白做
      if (rel && s.summoner?.acts?.length) {
        const localText = Object.fromEntries(
          (s.summoner.acts || []).filter(a => a.id && a.text).map(a => [a.id, a.text]));
        if (Object.keys(localText).length) {
          rel = { ...rel, acts: (rel.acts || []).map(a =>
            (!a.text && localText[a.id]) ? { ...a, text: localText[a.id] } : a) };
        }
      }
      if (JSON.stringify(s.summoner ?? null) !== JSON.stringify(rel)) { s.summoner = rel; changed = true; }
    }
    for (const o of resp.outcomes || []) { applySimOutcome(o); changed = true; }
    lastSimSyncAt = Date.now();
    if (changed) { scheduleSave(); renderAll(); }
    return changed;
  } finally {
    simSyncBusy = false;
    const ws = simSyncWaiters.splice(0);
    for (const w of ws) w();
  }
}

// 觀戰直播:請伺服器現生一個 act slot(她此刻被召喚中),回傳 {rel, married}
async function simLiveAct(s) {
  try {
    const r = await fetch("/api/sim/live_act", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, now: Date.now() }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.married) applySimOutcome({ type: "married", id: s.id, suName: summonerById(s.summoner?.id)?.name });
    return j;
  } catch (e) { return null; }
}

// 伺服器回報的結局/事件:纏上/娶走(召喚師),以及權威時鐘的計時觸發(看板娘到期/委託逾期/跨日)。
// 後果一律走手機既有邏輯(伺服器只負責「判定時間到了」),且全部具冪等性,重複套用無害。
function applySimOutcome(o) {
  // 權威時鐘計時觸發 ──────────────────────────────
  if (o.type === "kanban_expired") {
    state.kanbans = (state.kanbans || []).filter(k => k.id !== o.id);
    return;
  }
  if (o.type === "quest_due") {
    const q = state.quests.find(x => x.id === o.id && x.lv === 2);   // 仍在執行中才違約(冪等)
    if (q) failQuest(q, true);
    return;
  }
  if (o.type === "day_rollover") {
    settleDays();   // 每日結算:需求逾期扣好感 / NTR 期限 / 離開(內部以 lastSettledDay 防重跑)
    ensureShop();   // 商店與獻祭費每日重擲(內部以 shop.day 防重跑)
    return;
  }
  // 召喚師事件 ────────────────────────────────────
  const s = state.succubi.find(x => x.id === o.id);
  if (o.type === "entangled") {
    if (o.resumed) {
      const st = rivalStageName(o.stage ?? 0);
      log(`${o.suName || "一位召喚師"} 再次纏上了 ${s?.name || "一位魅魔"}——舊情未了(「${st}」)`);
      toast(`⚠ ${o.suName || "召喚師"} 再次纏上了 ${s?.name || "魅魔"}(接續「${st}」)`, "bad");
    } else {
      log(`${o.suName || "一位召喚師"} 纏上了 ${s?.name || "一位魅魔"}!`);
      toast(`⚠ ${o.suName || "召喚師"} 纏上了 ${s?.name || "魅魔"}`, "bad");
    }
  } else if (o.type === "married") {
    const nm = s?.name || "一位魅魔";
    log(`${nm} 懷了 ${o.suName || "召喚師"} 的孩子,脫離魅魔身分、跟他走了,永遠離開萬事屋。`);
    toast(`${nm} 懷孕了……她成了 ${o.suName || "他"} 的妻子,永遠消失了。`, "bad");
    state.succubi = state.succubi.filter(x => x.id !== o.id);
    state.kanbans = (state.kanbans || []).filter(k => k.id !== o.id);
    if (detailId === o.id) detailId = null;
    if (chatWith === o.id) exitChat();
    if (watchWith === o.id) exitWatch(true);
  }
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

function summonKanban(id) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || s.ntr) return;
  if (isKanban(id)) { toast("她已經在店頭了", ""); return; }
  // 她正被另一位召喚師召喚走:你的召喚傳不到她那裡——這段時間不能把她叫來當看板娘
  if (s.summoner?.taken) {
    const su = summonerById(s.summoner.id);
    toast(`${s.name} 正被 ${su?.name || "另一個召喚師"} 召喚走——你的召喚傳不到她那裡`, "bad");
    return;
  }
  if (cardSystemOn() && Cards.sessionActive(state)) {
    // 重整後常見：session 還在但牌桌 UI 沒開 → 先幫打開，勿只擋路
    const rec = resumeOrRecoverCardSession({ forceUi: true });
    const nm = rec.girlName || "她";
    toast(`先結束與 ${nm} 的牌局（已幫你打開牌桌；左上「結束」會解除看板）`, "bad");
    return;
  }
  const cost = kanbanCost();
  if (state.gold < cost) { toast(`召喚第 ${kanbanSuccubi().length + 1} 位看板娘需 ${cost} 金`, "bad"); return; }
  state.gold -= cost;
  (state.kanbans ??= []).push({ id, until: Date.now() + kanbanHours() * HOUR });
  state.lastKanbanId = id;
  log(`召喚 ${s.name} 為看板娘 -${cost} 金(第 ${state.kanbans.length} 位)`);
  toast(`${s.name} 來到店頭——右下角可開始打牌`, "good");
  // 時機：按下「召喚為看板娘」當下 → 背景織「全身 full」
  // 織完立刻替換主畫面站姿立繪（#kanban-girl）。1/3 另換半身。
  syncPortraitCgCache(s);
  scheduleSave();
  renderAll(); // 先讓她站上店頭（可能還是舊圖／剪影）
  weaveKanbanArrival(s); // 完成後 replaceKanbanFullStand
}

// 到期解除(每秒 tick 呼叫);逐位到期、不提醒玩家。回傳是否有變化
function expireKanban() {
  const now = Date.now();
  const before = (state.kanbans || []).length;
  const kept = [];
  for (const k of (state.kanbans || [])) {
    if (k.until && now < k.until) kept.push(k);
    else Cards.closeSessionIfGirl(state, k.id);
  }
  state.kanbans = kept;
  if (state.cardSession?.girlId && !kept.some(k => k.id === state.cardSession.girlId)) {
    // 看板全沒了仍可能 session 指到已過期 id
    if (state.cardSession.mode === "kanban") Cards.closeSession(state, "kanban_expired");
  }
  return kept.length !== before;
}

let bubbleTimer = null;
let bubbleQueue = [];
let bubbleShowing = false;
let bubbleBound = false;
/** 正在顯示的氣泡（可能 pending AI） */
let bubbleShowingItem = null;

function kanbanSay(text) {
  // 無指定角色：用主看板娘半身
  const g = kanbanSuccubus();
  enqueueKanbanBubbles([{
    girlId: g?.id || null,
    name: g?.name || "",
    text,
    emotionDelta: 0,
    pending: false,
  }]);
}

/** 多句氣泡依序播（M2 委託碎嘴：半身＋對話框；點一下繼續，不進全螢幕聊天） */
function enqueueKanbanBubbles(items) {
  if (!items?.length) return;
  for (const it of items) {
    // pending 的可以沒有 text（等 AI）；定稿的必須有字
    if (!it) continue;
    if (!it.pending && !it.text) continue;
    bubbleQueue.push(it);
  }
  pumpKanbanBubbles();
}

function hideBubbleOverlay() {
  const ov = document.getElementById("bubble-overlay");
  if (ov) ov.classList.add("hidden");
  bubbleShowing = false;
  bubbleShowingItem = null;
  clearTimeout(bubbleTimer);
  bubbleTimer = null;
}

function dismissBubble() {
  if (!bubbleShowing) return;
  // 還在等 AI 時點一下：用罐頭落地再關，避免卡住
  if (bubbleShowingItem?.pending) {
    bubbleShowingItem.pending = false;
    bubbleShowingItem.text = bubbleShowingItem.canned || bubbleShowingItem.text || "……";
  }
  hideBubbleOverlay();
  if (bubbleQueue.length) setTimeout(pumpKanbanBubbles, 160);
}

function bindBubbleOverlayOnce() {
  if (bubbleBound) return;
  const ov = document.getElementById("bubble-overlay");
  if (!ov) return;
  bubbleBound = true;
  ov.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    dismissBubble();
  });
}

function setBubblePortrait(girl) {
  const img = document.getElementById("bubble-portrait");
  const fb = document.getElementById("bubble-portrait-fb");
  if (!img || !fb) return;
  const url = girl ? girlShot(girl, "half") : "";
  if (url) {
    if (img.getAttribute("src") !== url) img.src = url;
    img.alt = girl?.name || "";
    img.classList.remove("hidden");
    fb.classList.add("hidden");
  } else {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("hidden");
    fb.textContent = (girl?.name || "？").slice(0, 1);
    fb.classList.remove("hidden");
  }
}

function pumpKanbanBubbles() {
  if (bubbleShowing) return;
  // 打牌全螢幕中不插播（規格：round_play 不擲；此處再擋 UI）
  if (document.body.classList.contains("card-mode")) return;
  const next = bubbleQueue.shift();
  if (!next) return;
  const ov = document.getElementById("bubble-overlay");
  const nameEl = document.getElementById("bubble-name");
  const textEl = document.getElementById("bubble-text");
  const affEl = document.getElementById("bubble-aff");
  const hint = document.getElementById("bubble-hint");
  if (!ov || !nameEl || !textEl) return;

  bindBubbleOverlayOnce();
  bubbleShowing = true;
  bubbleShowingItem = next;

  const girl = next.girlId
    ? state.succubi.find(x => x.id === next.girlId)
    : kanbanSuccubus();
  const gname = next.name || girl?.name || "";
  setBubblePortrait(girl || null);
  nameEl.textContent = gname || "……";
  if (next.pending) {
    textEl.textContent = "……";
    if (hint) hint.textContent = "她正在想……點一下可跳過";
  } else {
    textEl.textContent = next.text || next.canned || "……";
    if (hint) hint.textContent = "點一下繼續";
  }
  if (affEl) {
    if (next.emotionDelta) {
      affEl.textContent = `♥+${next.emotionDelta}`;
      affEl.classList.remove("hidden");
    } else {
      affEl.textContent = "";
      affEl.classList.add("hidden");
    }
  }
  ov.classList.remove("hidden");

  // 等 AI 時拉長一點；寫好後仍可點掉
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    if (!bubbleShowing) return;
    dismissBubble();
  }, next.pending ? 12000 : 5200);
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

// 召喚三連拍:一位妹子固定出三張,各處各取所需。
//   head 大頭照 → 名冊縮圖、聊天頭像
//   half 半身   → 詳細頁(身份)、看板娘
//   full 全身   → 召喚結果卡(第一次見到她,要看完整形體)
const SHOT_FALLBACK = {
  head: ["head", "half", "full"],
  half: ["half", "full", "head"],
  full: ["full", "half", "head"],
};

// 想要的那張還沒生好就退而求其次,而不是掉回剪影——有圖總比沒圖好
function girlShot(s, kind = "half") {
  const p = s?.portraits;
  if (p) for (const k of SHOT_FALLBACK[kind] || SHOT_FALLBACK.half) if (p[k]) return p[k];
  return s?.portrait || "";   // 舊存檔只有單張
}

const SHOT_LABEL = { head: "大頭照", half: "半身", full: "全身" };

// 詳細頁那行:缺哪幾張、能不能現在補。ComfyUI 是本機顯卡,隨時可織;
// Grok 是雲端訂單,維持原本只有訂單模式才給按的規則。
function shotsLine(s) {
  const have = ["full", "half", "head"].filter(k => s.portraits?.[k]);
  const missing = ["full", "half", "head"].filter(k => !s.portraits?.[k]);
  const busy = portraitGenning.has(s.id);
  // 去背跳過時的原因。立繪已經齊了但還是白底,唯一能講清楚的就是這一行。
  const cutNote = lastCutNote
    ? `<div class="aff-line small" style="color:var(--gold)">去背沒成功:${esc(lastCutNote)}
       ${have.length ? `<button class="link-btn" id="act-recut">🩹 再摳一次</button>` : ""}</div>`
    : "";
  const ckptLine = (imgProvider() === "comfy" && s.comfyCkpt)
    ? `<div class="aff-line dim small">生圖模型 · ${esc(shortCkptName(s.comfyCkpt))}</div>`
    : "";
  if (!missing.length) return ckptLine + cutNote;
  if (!canWeaveNow()) {
    return `${ckptLine}<div class="aff-line dim small">${have.length ? "" : "尚未成形——"}今晚讓她織夢,明早見到她的臉(M3)</div>`;
  }
  const what = have.length
    ? `還差 ${missing.map(k => SHOT_LABEL[k]).join("、")}`
    : "尚未成形——大頭照 / 半身 / 全身三張都還沒織";
  const why = !busy && lastWeaveError
    ? `<div class="aff-line small" style="color:var(--red)">上次失敗:${esc(lastWeaveError)}</div>` : "";
  return `${ckptLine}<div class="aff-line dim small">${what}</div>${why}${cutNote}
    <div class="detail-actions"><button class="cyan" id="act-weave" ${busy ? "disabled" : ""}>${
      busy ? "織出形體中…" : "✦ 織出她的形體"}</button></div>`;
}

// 對已經生好的立繪重摳一次。補裝 Pillow 之後、或摳失敗想再試一次時用——
// 不必重生(那要再燒一次 GPU),伺服器直接對現有檔案再跑一遍去背。
async function recutShots(s) {
  const urls = ["full", "half", "head"].map(k => s.portraits?.[k]).filter(Boolean);
  if (!urls.length) return;
  toast("重新去背中……");
  let ok = 0, last = "";
  for (const u of urls) {
    try {
      const j = await fetch("/api/cutout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: u }),
      }).then(r => r.json());
      last = j.why || "";
      if (j.changed) {
        // 檔名沒變、內容變了,URL 要帶新版本號才不會拿到瀏覽器快取那張舊的
        const k = Object.keys(s.portraits).find(x => s.portraits[x] === u);
        if (k && j.url) s.portraits[k] = j.url;
        ok++;
      }
    } catch (e) { last = String(e?.message || e); }
  }
  if (ok) { dirty = true; saveNow(); }
  lastCutNote = ok === urls.length ? "" : last;
  toast(ok ? `摳掉 ${ok}/${urls.length} 張的背景` : `還是摳不掉:${last}`, ok ? "good" : "bad");
  renderAll();
}

// 立繪:生圖好了顯示圖,還沒好退回 SVG 剪影
function girlPortrait(s, scale = 6, kind = "half") {
  const url = girlShot(s, kind);
  return url
    ? `<img class="portrait-img shot-${kind}" src="${esc(url)}" alt="${esc(s.name || "")}" loading="lazy">`
    : girlSVG("#241333", scale);
}

// ===== Tick =====

let lastTickDay = null;

setInterval(() => {
  if (!state) return;
  const now = Date.now();
  let changed = false;

  // 時間檢查的權威已搬到伺服器世界時鐘(看板娘到期/委託逾期/跨日),手機同步時套用其 outcome。
  // 以下客戶端檢查保留為「離線/伺服器連不上」時的在地保底,與伺服器判定同結果且皆冪等。
  // 每一步各自 try/catch:任何一步出錯都不會拖垮後面的 simSync / genTick,runtime 不會整個停擺。
  try {
    for (const q of [...execQuests()]) {
      if (now >= q.deadline) { failQuest(q); changed = true; }
      else {
        // 不顯示倒數——只有她會在快超時的時候催你一句
        const frac = (q.deadline - now) / (q.deadline - q.startedAt);
        if (frac <= 0.2 && !q._warned) { q._warned = true; kanbanReact("hurry"); }
      }
    }

    const today = dayNum();
    if (lastTickDay !== null && today !== lastTickDay) { settleDays(); ensureShop(); changed = true; }
    lastTickDay = today;

    if (expireKanban()) changed = true;

    const asleep = isAsleep();
    if (asleep !== lastSleepState) {
      if (asleep && chatWith) { toast("睡眠時段到了,她回夢境了", "bad"); exitChat(); }
      // 01:00(睡眠開始)切入:立刻排一輪預織獻祭文(有缺才生、已備妥略過)
      if (asleep) { try { genSacOrders(); } catch { /* 下輪 genTick 會再試 */ } }
      lastSleepState = asleep;
      changed = true;
    }
  } catch (e) { console.error("tick 在地檢查出錯(不影響同步):", e); }

  // 淫紋保底:沒設模型(或連敗到保底)時,把已亮的念頭補成罐頭台詞,不讓紋卡在醞釀中
  try { if (crestFallback()) changed = true; } catch (e) { console.error("淫紋保底失敗:", e); }
  try { if (expireChatSess()) changed = true; } catch (e) { console.error("對話逾期清理失敗:", e); }

  // 伺服器世界時鐘:每 15 秒同步一次(拿權威 outcome + 召喚師鏡像);與上面的在地檢查各自獨立
  try { if (Date.now() - lastSimSyncAt > 15000) simSync(); } catch (e) { console.error("simSync 失敗:", e); }
  try { genTick(); } catch (e) { console.error("genTick 失敗:", e); }   // 代工生成:下單+收貨

  if (changed) { scheduleSave(); renderAll(); }
}, 1000);

// 玩家在等她那句話時的快輪詢:每 500ms 問一次伺服器收貨了沒(平常的 1 秒 tick 太鈍)
setInterval(() => {
  try { if (waitingOnHer()) genTick(true); } catch { /* 下輪再說 */ }
}, 500);

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
  document.body.classList.toggle("card-center", !!state.settings.cardCenter);
  root.setProperty("--card-font-scale", state.settings.cardFontScale ?? 1);
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
  for (const fn of [applyTheme, renderHud, renderQuests, renderShop, renderSuccubi, renderChatView, renderKanban, renderCrests, renderSettings, renderCardSystem]) {
    try { fn(); } catch (e) { console.error(fn.name, e); }
  }
}

// 淫紋:每位看板娘各自一盞燈,兩種狀態——
//   ① 亮紋:判定中了就亮,點開即可對話(她的開場白寫好了就是她先說,
//      還沒寫好就換你先說——兩種都零等待)
//   ② 對話框「…」:你剛送出、她正在回你 → 不能點,等她打完自動變回亮紋
// 睡眠、對話中、觀戰中、獻祭中不顯示;被召喚走的不判定,自然不亮。
const TYPING_SVG = `<svg class="typing-svg" viewBox="0 0 52 44" width="44" height="38" aria-hidden="true">
  <path class="tbub" d="M7 4h38a6 6 0 0 1 6 6v18a6 6 0 0 1-6 6H22l-10 8v-8H7a6 6 0 0 1-6-6V10a6 6 0 0 1 6-6z"/>
  <circle class="tdot d1" cx="17" cy="19" r="3.2"/>
  <circle class="tdot d2" cx="26" cy="19" r="3.2"/>
  <circle class="tdot d3" cx="35" cy="19" r="3.2"/>
</svg>`;

function renderCrests() {
  const el = $("#crests");
  if (!el) return;
  // 打牌全螢幕／其他全螢幕演出時藏入口
  if (document.body.classList.contains("card-mode") || chatWith || watchWith || sacrificeWith || sacSummon) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }

  // v6 牌制：右下角小方塊打牌鍵（不擋委託輸入列）
  if (cardSystemOn()) {
    const girls = isAsleep()
      ? []
      : kanbanSuccubi().filter(s => !s.ntr && !s.summoner?.taken);
    el.classList.toggle("hidden", !girls.length);
    el.innerHTML = girls.map(s => {
      const sess = state.cardSession?.girlId === s.id ? state.cardSession : null;
      const phase = sess?.phase || null;
      const prepping = phase === "narr_prep";
      const prepReady = phase === "narr_ready";
      // 重整後可能 playsLeft=0 但仍卡在做愛／反應；只要有 session 就算進行中
      const playing = !!sess && (
        phase === "round_play" || phase === "round_setup" || phase === "round_end"
        || Cards.hasPendingSex?.(state)
      );
      const prog = prepping ? Cards.narrProgress?.(sess) : null;
      const face = girlShot(s, "head");
      const title = prepping
        ? `準備 ${prog?.done || 0}/${prog?.total || "?"}（動作 ${prog?.actionDone || 0}／回話 ${prog?.replyDone || 0}）`
        : prepReady
          ? `與 ${s.name}：動作＋回話備妥，按開始打牌`
          : playing
            ? `繼續與 ${s.name} 的牌局（卡住可按左上「結束」）`
            : `與 ${s.name} 開始打牌`;
      const badge = prepping
        ? `${prog?.done || 0}/${prog?.total || "?"}`
        : prepReady
          ? "始"
          : playing ? "中" : "牌";
      return `
      <button type="button" class="play-fab r-${s.rarity}${playing || prepping || prepReady ? " active-sess" : ""}" data-cid="${s.id}"
              title="${esc(title)}" aria-label="${esc(title)}">
        ${face
          ? `<img class="play-fab-face" src="${esc(face)}" alt="">`
          : `<span class="play-fab-icon" aria-hidden="true">✦</span>`}
        <span class="play-fab-badge" aria-hidden="true">${badge}</span>
      </button>`;
    }).join("");
    el.querySelectorAll(".play-fab").forEach(b => {
      b.onclick = () => openKanbanTable(b.dataset.cid);
    });
    return;
  }

  // 舊路徑：淫紋燈 → 進聊天
  const busy = isAsleep();
  const girls = busy ? [] : kanbanSuccubi().filter(s =>
    !s.summoner?.taken && (s.chatLine || s.wantsTalk || s.typing || s.chatSess));
  el.classList.toggle("hidden", !girls.length);
  el.innerHTML = girls.map(s => {
    const typing = !s.chatLine && !!s.typing;
    return `
    <button class="crest-btn r-${s.rarity}${typing ? " typing" : ""}" data-cid="${s.id}"
            title="${esc(s.name)}${typing ? " 正在輸入…" : ""}" ${typing ? "disabled" : ""}>
      ${typing ? TYPING_SVG : `<svg viewBox="0 0 200 210" width="46" height="48"><use href="#crest-sym"/></svg>`}
      <span class="cname">${esc(s.name)}</span>
    </button>`;
  }).join("");
  el.querySelectorAll(".crest-btn").forEach(b => b.onclick = () => enterChat(b.dataset.cid));
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

// (倒數條已移除——期限完全不顯示,超時直接跳提示扣錢退回)

// ===== 委託卡片場景(cthulhu-note 式:一次一張,手勢操作)=====

let qScene = "exec";        // exec(執行中三格)| proc(處理)
let pinIdx = 0;
let procPool = null;        // 強制池:0 發現 | 1 已承接 | null 自動
let procIdx = { 0: 0, 1: 0 };
let _pinAbort = null;
let _pinSnapTok = 0;        // 無縫輪動:克隆張跳回真身的排程令牌(新動作作廢舊排程)
const PIN_EASE = "transform .3s cubic-bezier(.4,0,.2,1)";

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

// 飢渴:玩家看得到她現在的狀態,但看不到數字(她自己也不會承認)。
// 平靜時不顯示——沒事就別提醒,免得變成一條永遠在那裡的儀表板。
function craveLine(s) {
  const t = craveTier(s);
  if (!t) return "";
  const txt = t === "high"
    ? { stranger: "她很不對勁,話裡帶刺,眼神不看你", friend: "她坐立難安,快裝不下去了",
        girlfriend: "她忍不住了,一直在暗示你", wife: "她直說了,等你的下一步" }
    : { stranger: "她煩躁、坐不住,問她只會被兇", friend: "她突然安靜下來,岔開了話題",
        girlfriend: "她拐著彎在跟你討什麼", wife: "她順口提了一句" };
  return `<div class="aff-line small crave-${t}">身體:${txt[s.stage] || txt.stranger}</div>`;
}

// 她盯著的那件委託 → 卡片上的便利貼。她的要求會留在畫面上,不是聊天講完就消失。
function errandNoteHTML(qid) {
  const who = state.succubi.filter(s => !s.ntr && s.errand?.qid === qid);
  if (!who.length) return "";
  const s = who[0];
  const more = who.length > 1 ? ` +${who.length - 1}` : "";
  const late = s.stage === "wife" && s.errand.late;
  return `<div class="q-errand${late ? " late" : ""}">
    <span class="qe-who">${esc(s.name)}${more}</span> 盯著這件${late ? "・她失望了" : ""}
  </div>`;
}

// --- 場景一:執行中三格輪播 ---

// 無縫輪動:頭尾各補一張克隆(頭=最後一張、尾=第一張),往同一方向一直滑會回到第一/最後一張。
// 邏輯索引 pinIdx=0..N-1;有克隆時真身在軌道位置 pinIdx+1(loopOff=1)。
function loopOff() { return execCap() > 1 ? 1 : 0; }

function renderExec() {
  const exec = execQuests();
  const N = execCap();
  $("#exec-count").textContent = `執行中 ${exec.length}/${N}`;
  const track = $("#pin-track");
  const slideHTML = (i) => {
    const q = exec[i];
    if (q) return `<div class="pin-slide"><div class="q-card c-exec">
        <div class="q-body">${esc(q.text)}</div>
        ${errandNoteHTML(q.id)}
        <div class="swind"></div>
      </div></div>`;
    return `<div class="pin-slide"><div class="pin-slot" data-slot>
        <div class="pin-slot-icon">+</div>
        <div class="pin-slot-txt">${poolItems(0).length + poolItems(1).length ? "去承接/開始委託" : "先在下方輸入待辦"}</div>
      </div></div>`;
  };
  const slides = Array.from({ length: N }, (_, i) => slideHTML(i));
  const loop = N > 1;
  // 頭放最後一張克隆、尾放第一張克隆
  track.innerHTML = loop ? slideHTML(N - 1) + slides.join("") + slideHTML(0) : slides.join("");
  pinIdx = Math.min(pinIdx, N - 1);
  _pinSnapTok++;   // 作廢任何待跳的克隆排程
  track.style.transition = "none";
  track.style.transform = `translateX(-${(pinIdx + loopOff()) * 100}%)`;
  $("#pin-dots").innerHTML = Array.from({ length: N }, (_, i) => `<div class="dot${i === pinIdx ? " on" : ""}"></div>`).join("");
  track.querySelectorAll("[data-slot]").forEach(el => el.onclick = () => goProc());
  attachPinSwipe($("#pin-carousel"), exec);
}

// 越過頭尾時:先動畫滑到克隆張,再瞬間(無動畫)跳回真身,達成無縫輪動
function pinSnapAfter(fn) {
  const tok = ++_pinSnapTok;
  setTimeout(() => { if (tok === _pinSnapTok) fn(); }, 320);
}

function setPinIdx(i) {
  const N = execCap();
  const loop = N > 1;
  const track = $("#pin-track");
  _pinSnapTok++;   // 新的定位動作:作廢先前待跳
  track.style.transition = PIN_EASE;
  if (loop && i < 0) {
    // 往回越過第一張 → 滑到頭部克隆(=最後一張),再跳到真正的最後一張
    track.style.transform = `translateX(-0%)`;
    pinIdx = N - 1;
    pinSnapAfter(() => { track.style.transition = "none"; track.style.transform = `translateX(-${N * 100}%)`; });
  } else if (loop && i >= N) {
    // 往前越過最後一張 → 滑到尾部克隆(=第一張),再跳到真正的第一張
    track.style.transform = `translateX(-${(N + 1) * 100}%)`;
    pinIdx = 0;
    pinSnapAfter(() => { track.style.transition = "none"; track.style.transform = `translateX(-100%)`; });
  } else {
    pinIdx = Math.max(0, Math.min(N - 1, i));
    track.style.transform = `translateX(-${(pinIdx + loopOff()) * 100}%)`;
  }
  document.querySelectorAll("#pin-dots .dot").forEach((d, idx) => d.classList.toggle("on", idx === pinIdx));
}

function attachPinSwipe(el, exec) {
  if (_pinAbort) _pinAbort.abort();
  _pinAbort = new AbortController();
  const sig = _pinAbort.signal;
  const track = $("#pin-track");
  const THRESH = 50;
  let sx, sy, dragBase = 0, dragging = false;

  // 跟手拖曳:以拖曳起點的軌道位置(dragBase+loopOff)為基準平移
  const follow = (dx) => { track.style.transform = `translateX(${-((dragBase + loopOff()) * 100 - (dx / el.offsetWidth) * 100)}%)`; };
  const startDrag = () => { _pinSnapTok++; dragBase = pinIdx; track.style.transition = "none"; };
  // 放手:水平過門檻就往該方向一格(setPinIdx 會處理越界輪動),否則回正
  const release = (dx, dy) => {
    track.style.transition = PIN_EASE;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx < -THRESH) setPinIdx(dragBase + 1);
      else if (dx > THRESH) setPinIdx(dragBase - 1);
      else setPinIdx(dragBase);
    } else {
      setPinIdx(dragBase);
      if (dy < -THRESH) { const q = exec[pinIdx]; if (q) flyPinCard(() => complete(q.id)); }
    }
  };

  el.addEventListener("touchstart", e => {
    sx = e.touches[0].clientX; sy = e.touches[0].clientY; dragging = true; startDrag();
  }, { passive: true, signal: sig });
  el.addEventListener("touchmove", e => {
    if (!dragging) return;
    const dx = e.touches[0].clientX - sx, dy = e.touches[0].clientY - sy;
    if (Math.abs(dx) > Math.abs(dy)) { follow(dx); if (e.cancelable) e.preventDefault(); }
  }, { passive: false, signal: sig });
  el.addEventListener("touchend", e => {
    if (!dragging) return; dragging = false;
    release(e.changedTouches[0].clientX - sx, e.changedTouches[0].clientY - sy);
  }, { passive: true, signal: sig });

  let mdown = false, msx, msy;
  el.addEventListener("mousedown", e => { mdown = true; msx = e.clientX; msy = e.clientY; startDrag(); }, { signal: sig });
  window.addEventListener("mousemove", e => { if (mdown) follow(e.clientX - msx); }, { signal: sig });
  window.addEventListener("mouseup", e => {
    if (!mdown) return; mdown = false;
    release(e.clientX - msx, e.clientY - msy);
  }, { signal: sig });
}

function flyPinCard(action) {
  const slide = document.querySelectorAll("#pin-track .pin-slide")[pinIdx + loopOff()];
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

  // 卡片只放項目本身;狀態靠徽章/卡色分辨,操作靠手勢(規則玩家已熟)
  stage.innerHTML = `<div class="q-card ${lv === 0 ? "c-found" : "c-acc"}" id="proc-card">
    <div class="q-body">${esc(q.text)}</div>
    ${errandNoteHTML(q.id)}
    <div class="swind"></div>
  </div>`;
  nav.textContent = list.length > 1 ? `${i + 1} / ${list.length}` : "";

  const card = $("#proc-card");
  const nav2 = dir => {
    const n = poolItems(lv).length;
    if (n <= 1) return;
    procIdx[lv] = (procIdx[lv] + dir + n) % n;   // 循環:第一張往右→最後一張,最後一張往左→第一張
    renderProc();
  };
  const H = lv === 0 ? {
    up: () => flyCard(card, "up", () => { accept(q.id); toast("已承接", "good"); }),
    down: () => flyCard(card, "down", () => drop(q.id)),
    left: () => nav2(1), right: () => nav2(-1),
  } : {
    up: () => {
      if (execQuests().length >= execCap()) { toast(`執行中已滿 ${execCap()} 件`, "bad"); return; }
      flyCard(card, "up", () => { start(q.id); goExec(); });
    },
    down: () => flyCard(card, "down", () => drop(q.id)),
    left: () => nav2(1), right: () => nav2(-1),
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

  renderCardShopPanel();
  renderPlayerAttrs();
}

// ===== v6 互動牌制：商店貨架／牌庫／創角／牌桌 =====

/** 清掉只存在記憶體、重整後會卡死的牌桌 UI 旗標 */
function resetCardUiEphemeral() {
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  cardUi.sexChoice = false;
  cardUi.lastPlay = null;
  cardUi.playAiPending = false;
  cardUi.sceneArtPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  try { voidCardPlayAiAndScene?.(); } catch { /* boot 早期可能尚未定義完整 */ }
}

/**
 * 重整後 cardSession 還在、但 body 沒有 card-mode → 看起來像任務畫面，
 * 卻擋「召喚看板娘／約會」。此函式：
 * - 孤兒 session（妹子沒了、看板沒了）→ 強制關閉解鎖
 * - 有效 session → 重開牌桌 UI，並清掉等生圖／等 AI 的記憶體鎖
 */
function resumeOrRecoverCardSession({ forceUi = false, silent = false } = {}) {
  if (!state || !cardSystemOn()) return { ok: false };
  if (!state.cardSession) return { ok: false };
  try { Cards.normalizeSessionPhase?.(state.cardSession); } catch { /* */ }

  if (!Cards.sessionActive(state)) {
    state.cardSession = null;
    resetCardUiEphemeral();
    return { ok: false };
  }

  const sess = state.cardSession;
  const girl = state.succubi.find(x => x.id === sess.girlId);
  const girlName = girl?.name || null;

  // 孤兒：沒這隻／被娶走
  if (!girl || girl.ntr) {
    Cards.closeSession(state, "recover_orphan");
    resetCardUiEphemeral();
    document.body.classList.remove("card-mode", "has-ct-figure");
    if (!silent) toast("未完成的牌局已清除（妹子不在了）", "");
    scheduleSave();
    return { ok: true, closed: true, girlName };
  }

  // 看板模式但她已不在店頭（且不是被召喚走）→ 關 session
  if (sess.mode === "kanban" && !isKanban(sess.girlId) && !girl.summoner?.taken) {
    Cards.closeSession(state, "recover_no_kanban");
    resetCardUiEphemeral();
    document.body.classList.remove("card-mode", "has-ct-figure");
    if (!silent) toast("未完成的牌局已清除（她已不在店頭）", "");
    scheduleSave();
    return { ok: true, closed: true, girlName };
  }

  // 有效：清記憶體卡死旗（await 生圖／AI 不會跨重整恢復）
  resetCardUiEphemeral();
  if (Cards.sexNeedsChoice?.(state)) cardUi.sexChoice = true;

  // 輪數用完又沒做愛待辦 → 進輪末，避免空牌桌
  if (
    sess.phase === "round_play"
    && Cards.playsLeft(sess) <= 0
    && !Cards.hasPendingSex?.(state)
    && !Cards.sexNeedsChoice?.(state)
  ) {
    try { Cards.playerEndRound?.(state); } catch { /* */ }
  }

  const needUi = forceUi || !document.body.classList.contains("card-mode");
  if (needUi) {
    document.body.classList.add("card-mode");
    try {
      syncPortraitCgCache?.(girl);
      ensureArtCacheBg?.(girl);
    } catch { /* */ }
    if (!silent) {
      toast(`已恢復與 ${girl.name} 的牌局——可繼續，或按左上「結束」（解除看板）`, "good");
    }
  }
  return { ok: true, resumed: true, girlId: girl.id, girlName: girl.name, needUi };
}

let cardUi = {
  injectPick: [],      // round_setup 勾選的 cardId 列表
  lastPlay: null,      // 上一張演出結果
  invOpen: true,
  invFilter: "all",    // all | speech | shatter
  invSelected: null,   // cardId 詳情
  handIdx: 0,          // round_play 手牌輪播索引
  injectIdx: 0,        // round_setup 牌庫輪播索引
  awaitReaction: false, // 出卡後必看反應，按「繼續」才往下
  // 出卡兩拍：action=你的動作旁白 → reply=她的即時 AI 回應
  reactBeat: null,     // null | "action" | "reply"
  // 輪末判定結果面板：null | "stay" | "leave"（不要跳回「靠近／離開」）
  endPanel: null,
  // M4 出卡即時 AI（voidCardPlayAi 遞增 playAiGen 作廢在途訂單）
  playAiPending: false,
  playAiKey: null,
  playAiToken: null,
  playAiGen: 0,
  playAiStartedGen: null,
  // 先文字後生圖：sceneArtPending = 圖還在畫（回覆節拍會擋「繼續」）
  sceneArtPending: false,
  // 做愛前戲 2 選 1
  sexChoice: false,
  // 約會章節 L2/L3 選卡
  datePick: false,
};

/** 出卡第一拍：動作旁白（誰、做了什麼） */
function playActionBeat(last, girl) {
  const g = girl || girlForSession();
  const def = last?.cardId ? Cards.cardById(last.cardId) : null;
  const kind = def?.kind || "speech";
  // 旁白必綁當前妹子（連續猥褻卡最容易殘留 [name]）
  const action = bindSceneToGirl(g, last.sceneStart || last.name || "……").trim();
  const pname = playerBindName();
  const gname = sessionGirlName(g);
  if (kind === "girl_trait") {
    return {
      speaker: gname,
      text: action,
      meta: `「${esc(last.name || "")}」· 點一下看她接著說`,
    };
  }
  if (kind === "venue_event") {
    return {
      speaker: "場面",
      text: action,
      meta: `「${esc(last.name || "")}」· 點一下看她的反應`,
    };
  }
  // 玩家出手：名字 + 動作描述（sceneStart）
  return {
    speaker: pname,
    text: action,
    meta: `對 ${esc(gname)} ·「${esc(last.name || "")}」· 點一下看她的反應`,
  };
}

function advanceReactBeat() {
  if (!cardUi.awaitReaction || !cardUi.lastPlay) return;
  if (cardUi.reactBeat === "action") {
    cardUi.reactBeat = "reply";
    renderCardTable();
    return;
  }
  if (cardUi.reactBeat === "reply") {
    const girl = girlForSession();
    const play = cardUi.lastPlay;
    // 台詞還沒好 → 不能結束
    if (cardUi.playAiPending && !play.fromAi && state.settings?.model) {
      toast("她還在想怎麼回…", "");
      return;
    }
    // 場景圖還沒好 → 不能結束（避免只看文字就飛走）
    if (isCardSceneArtWaiting(girl, play)) {
      toast("場景還在畫，畫完才能繼續", "");
      return;
    }
    ackPlayReaction();
  }
}

function renderCardShopPanel() {
  const shelf = $("#card-shop-stock");
  const invBtns = $("#card-inv-btns");
  const invDetail = $("#card-inv-detail");
  const invFilters = $("#card-inv-filters");
  const invCount = $("#card-inv-count");
  const refreshEl = $("#card-shop-refresh");
  if (!shelf || !invBtns) return;
  if (!cardSystemOn()) {
    shelf.innerHTML = `<div class="dim small">卡牌資料未載入</div>`;
    invBtns.innerHTML = "";
    if (invDetail) { invDetail.classList.add("hidden"); invDetail.innerHTML = ""; }
    if (invFilters) invFilters.innerHTML = "";
    if (refreshEl) refreshEl.textContent = "";
    renderCardDeckPanel();
    return;
  }
  Cards.ensureCardShop(state);
  Cards.pruneDeck?.(state);
  const shop = state.cardShop;
  const leftMs = Math.max(0, (shop.nextRefreshAt || 0) - Date.now());
  const leftH = Math.floor(leftMs / 3600000);
  const leftM = Math.floor((leftMs % 3600000) / 60000);
  if (refreshEl) {
    refreshEl.textContent = leftMs <= 0
      ? "即將刷新"
      : `下次刷新約 ${leftH}h ${leftM}m`;
  }
  shelf.innerHTML = (shop.slots || []).map((slot, i) => {
    const def = Cards.cardById(slot.cardId);
    const name = def?.name || slot.cardId;
    const price = slot.isSale && slot.salePrice != null ? slot.salePrice : slot.price;
    const isErotic = def?.kind === "erotic";
    const shatter = isErotic || !!def?.shatterOnUse;
    const ownedSpeech = def && !shatter && Cards.invOwns(state, slot.cardId);
    const sold = slot.sold || ownedSpeech;
    const tag = isErotic ? "色" : (shatter ? "碎" : "話術");
    const tagCls = isErotic ? "shatter erotic" : (shatter ? "shatter" : "speech");
    const sale = slot.isSale && !sold ? `<span class="card-sale">特價</span>` : "";
    const canBuy = !sold && state.gold >= price;
    return `<div class="shop-item card-shop-item${sold ? " sold" : ""}">
      <span class="sname"><span class="card-tag ${tagCls}">${tag}</span>${esc(name)} ${sale}
        <span class="dim small"> ${esc((def?.tags || []).join("·"))}</span></span>
      <span class="sprice">${slot.isSale && !sold ? `<s class="dim">${slot.price}</s> ${price}` : price} 金</span>
      <button data-cslot="${i}" ${canBuy ? "" : "disabled"}>${ownedSpeech ? "已擁有" : slot.sold ? "已售出" : "購買"}</button>
    </div>`;
  }).join("") || `<div class="dim small">貨架空空</div>`;
  shelf.querySelectorAll("[data-cslot]").forEach(btn => {
    btn.onclick = () => {
      const r = Cards.buyFromCardShop(state, +btn.dataset.cslot);
      if (!r.ok) { toast(r.err, "bad"); return; }
      toast(`買下「${r.name}」 -${r.price} 金${r.shatter ? "（用則碎）" : ""}`, "good");
      log(`購入卡牌「${r.name}」 -${r.price} 金`);
      // 買完自動選中詳情
      cardUi.invSelected = r.cardId;
      if (r.shatter) cardUi.invFilter = "shatter";
      else cardUi.invFilter = "speech";
      scheduleSave(); renderAll();
    };
  });

  renderCardDeckPanel();
  renderCardInventoryPanel();
}

function renderCardDeckPanel() {
  const list = $("#card-deck-list");
  const countEl = $("#card-deck-count");
  if (!list) return;
  if (!cardSystemOn()) {
    list.innerHTML = "";
    if (countEl) countEl.textContent = "";
    return;
  }
  const deck = Cards.getDeck?.(state) || state.cardDeck || [];
  const maxI = Cards.maxInject(state);
  if (countEl) countEl.textContent = `(${deck.length}/${maxI})`;
  if (!deck.length) {
    list.innerHTML = `<div class="dim small">牌組是空的——長按下方牌庫卡片加入。空組開戰只會有妹子本體卡。</div>`;
    return;
  }
  list.innerHTML = deck.map((id, i) => {
    const def = Cards.cardById(id);
    const name = def?.name || id;
    const tag = def?.shatterOnUse ? "碎" : "話";
    return `<button type="button" class="deck-chip ${def?.shatterOnUse ? "is-shatter" : "is-speech"}" data-di="${i}" title="長按移出牌組">
      <span class="deck-chip-tag">${tag}</span>${esc(name)}
    </button>`;
  }).join("");
  list.querySelectorAll("[data-di]").forEach(btn => {
    const idx = +btn.dataset.di;
    attachLongPress(btn, {
      ms: 420,
      onTap: () => {
        // 短按：選中牌庫詳情（若庫裡有）
        const id = deck[idx];
        if (id) {
          cardUi.invSelected = id;
          renderCardInventoryPanel();
        }
      },
      onLong: () => {
        const r = Cards.removeFromDeckAt(state, idx);
        if (!r.ok) { toast(r.err, "bad"); return; }
        toast("已移出牌組", "");
        scheduleSave();
        renderCardShopPanel();
      },
    });
  });
}

/** 長按／短按（觸控＋滑鼠）；移動超過門檻取消長按 */
function attachLongPress(el, { onTap, onLong, ms = 450 } = {}) {
  if (!el) return;
  let timer = null, sx = 0, sy = 0, longFired = false;
  const clear = () => {
    if (timer) { clearTimeout(timer); timer = null; }
  };
  const start = (x, y) => {
    sx = x; sy = y; longFired = false;
    clear();
    timer = setTimeout(() => {
      timer = null;
      longFired = true;
      try { if (navigator.vibrate) navigator.vibrate(12); } catch (_) { /* */ }
      onLong?.();
    }, ms);
  };
  const move = (x, y) => {
    if (Math.abs(x - sx) > 12 || Math.abs(y - sy) > 12) clear();
  };
  const end = () => {
    const pending = !!timer;
    clear();
    if (!longFired && pending) onTap?.();
  };
  el.addEventListener("touchstart", e => {
    const t = e.touches[0];
    start(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener("touchmove", e => {
    const t = e.touches[0];
    move(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener("touchend", end, { passive: true });
  el.addEventListener("touchcancel", clear, { passive: true });
  el.addEventListener("mousedown", e => {
    if (e.button !== 0) return;
    start(e.clientX, e.clientY);
  });
  el.addEventListener("mousemove", e => {
    if (timer) move(e.clientX, e.clientY);
  });
  el.addEventListener("mouseup", end);
  el.addEventListener("mouseleave", clear);
  el.addEventListener("contextmenu", e => e.preventDefault());
}

const STAGE_LABEL_SHORT = {
  stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子",
};

function renderCardInventoryPanel() {
  const invBtns = $("#card-inv-btns");
  const invDetail = $("#card-inv-detail");
  const invFilters = $("#card-inv-filters");
  const invCount = $("#card-inv-count");
  if (!invBtns) return;

  const rows = Cards.inventoryList(state);
  const nSpeech = rows.filter(r => !r.shatterOnUse).length;
  const nShatter = rows.filter(r => r.shatterOnUse).length;
  if (invCount) invCount.textContent = rows.length ? `(${rows.length})` : "";

  // 若選中的卡已不在庫，清掉
  if (cardUi.invSelected && !rows.some(r => r.cardId === cardUi.invSelected)) {
    cardUi.invSelected = null;
  }

  const filter = cardUi.invFilter || "all";
  if (invFilters) {
    const tabs = [
      { id: "all", label: `全部 ${rows.length}` },
      { id: "speech", label: `話術 ${nSpeech}` },
      { id: "shatter", label: `碎卡 ${nShatter}` },
    ];
    invFilters.innerHTML = tabs.map(t =>
      `<button type="button" class="card-inv-filter${filter === t.id ? " on" : ""}" data-if="${t.id}">${esc(t.label)}</button>`
    ).join("");
    invFilters.querySelectorAll("[data-if]").forEach(b => {
      b.onclick = () => {
        cardUi.invFilter = b.dataset.if;
        renderCardInventoryPanel();
      };
    });
  }

  const shown = rows.filter(r => {
    if (filter === "speech") return !r.shatterOnUse;
    if (filter === "shatter") return r.shatterOnUse;
    return true;
  });

  if (!shown.length) {
    invBtns.innerHTML = `<div class="dim small" style="padding:.4em 0">${
      rows.length ? "此分類沒有卡。" : "牌庫空——完成創角或到上方貨架購買。"
    }</div>`;
  } else {
    invBtns.innerHTML = shown.map(r => {
      const starter = state.playerProfile?.starterSpeechCardId === r.cardId;
      const on = cardUi.invSelected === r.cardId;
      const inDeck = (Cards.deckCountOf?.(state, r.cardId) || 0) > 0;
      const kindCls = r.shatterOnUse ? "shatter" : "speech";
      const countTxt = r.shatterOnUse ? `×${r.count}` : (starter ? "底" : "");
      return `<button type="button" class="card-inv-btn ${kindCls}${on ? " on" : ""}${inDeck ? " in-deck" : ""}" data-cid="${r.cardId}" title="點看說明 · 長按加入／移出牌組">
        <span class="cib-name">${esc(r.name)}</span>
        <span class="cib-meta">${esc(r.rarity || "N")}${countTxt ? " · " + countTxt : ""}${inDeck ? " · 組" : ""}</span>
      </button>`;
    }).join("");
    invBtns.querySelectorAll("[data-cid]").forEach(b => {
      const id = b.dataset.cid;
      attachLongPress(b, {
        ms: 420,
        onTap: () => {
          cardUi.invSelected = cardUi.invSelected === id ? null : id;
          renderCardInventoryPanel();
        },
        onLong: () => {
          const def = Cards.cardById(id);
          const inDeckN = Cards.deckCountOf?.(state, id) || 0;
          if (inDeckN > 0) {
            // 已在牌組：長按移出一張
            const deck = Cards.getDeck(state);
            const idx = deck.lastIndexOf(id);
            const r = Cards.removeFromDeckAt(state, idx);
            if (!r.ok) { toast(r.err, "bad"); return; }
            toast(`「${def?.name || id}」移出牌組`, "");
          } else {
            const r = Cards.addToDeck(state, id);
            if (!r.ok) { toast(r.err, "bad"); return; }
            toast(`「${def?.name || id}」加入牌組`, "good");
          }
          scheduleSave();
          renderCardShopPanel();
        },
      });
    });
  }

  if (!invDetail) return;
  if (!cardUi.invSelected) {
    invDetail.classList.add("hidden");
    invDetail.innerHTML = "";
    return;
  }
  const row = rows.find(r => r.cardId === cardUi.invSelected);
  const def = Cards.cardById(cardUi.invSelected);
  if (!row || !def) {
    invDetail.classList.add("hidden");
    invDetail.innerHTML = "";
    return;
  }
  invDetail.classList.remove("hidden");
  invDetail.innerHTML = formatCardDetailHtml(def, row);
  invDetail.querySelector("#cid-close")?.addEventListener("click", () => {
    cardUi.invSelected = null;
    renderCardInventoryPanel();
  });
}

function formatCardDetailHtml(def, row) {
  const starter = state.playerProfile?.starterSpeechCardId === def.id;
  const isErotic = def.kind === "erotic" || !!row?.erotic;
  const shatter = isErotic || !!def.shatterOnUse || !!row?.shatterOnUse;
  const kind = isErotic ? "色情卡" : (shatter ? "高級碎卡" : "話術");
  const tags = (def.tags || []).join(" · ") || "—";
  const minSt = def.minStage ? (STAGE_LABEL_SHORT[def.minStage] || def.minStage) : "無限制";
  let openLine = "—";
  if (def.openChain) {
    openLine = `開門鍊 ${def.openChain.attr} ×${def.openChain.k}` +
      (def.forceable ? "（可硬開）" : "");
  }
  const emo = def.emotion || {};
  const emoLine = ["stranger", "friend", "girlfriend", "wife"].map(st => {
    const t = emo[st];
    if (!t) return null;
    const a = t.min ?? 0, b = t.max ?? 0;
    return `${STAGE_LABEL_SHORT[st] || st} ${a >= 0 ? "+" : ""}${a}~${b >= 0 ? "+" : ""}${b}`;
  }).filter(Boolean).join("　");
  const eff = def.effect;
  let effLine = "";
  const bits = [];
  if (isErotic) {
    bits.push("用後消失", "無條件可下一輪");
    bits.push("機率觸發做愛（陌生1/10·朋友1/8·女友1/3·妻子1/2）");
  }
  if (eff) {
    if (eff.forceAnotherRound && !isErotic) bits.push("強制再一輪");
    if (Array.isArray(eff.setFlags) && eff.setFlags.length) bits.push("旗標：" + eff.setFlags.join("、"));
    if (eff.guardDelta) bits.push(`防備 ${eff.guardDelta > 0 ? "+" : ""}${eff.guardDelta}`);
    if (eff.cravingDelta) bits.push(`飢渴 ${eff.cravingDelta > 0 ? "+" : ""}${eff.cravingDelta}`);
    if (eff.mentionErrand) bits.push("可提待辦");
  }
  if (bits.length) effLine = bits.join(" · ");
  const countLine = shatter
    ? `持有 <b>${row.count}</b> 張 · 確認打出後 −1${isErotic ? "（色情卡必碎）" : "（失敗開門也碎）"}`
    : `永久持有${starter ? " · <b>創角底色</b>" : ""} · 打出不碎`;
  const inDeck = Cards.deckCountOf?.(state, def.id) || 0;
  const maxI = Cards.maxInject(state);
  const tagCls = isErotic ? "shatter erotic" : (shatter ? "shatter" : "speech");

  return `
    <div class="cid-head">
      <span class="card-tag ${tagCls}">${kind}</span>
      <span class="cid-rarity r-${esc(def.rarity || "N")}">${esc(def.rarity || "N")}</span>
      <h3 class="cid-title">${esc(def.name)}</h3>
    </div>
    <p class="cid-scene">${esc(def.sceneStart || "（無場景句）")}</p>
    <div class="cid-rows">
      <div class="cid-row"><span class="k">持有</span><span class="v">${countLine}</span></div>
      <div class="cid-row"><span class="k">牌組</span><span class="v">${inDeck ? `已放 <b>${inDeck}</b> 張` : "未放入"} · 上限 ${maxI} · <b>長按</b>加入／移出</span></div>
      <div class="cid-row"><span class="k">標籤</span><span class="v">${esc(tags)}</span></div>
      <div class="cid-row"><span class="k">關係門檻</span><span class="v">${esc(minSt)}</span></div>
      <div class="cid-row"><span class="k">鍊</span><span class="v">${esc(openLine)}</span></div>
      ${emoLine ? `<div class="cid-row"><span class="k">感情骰</span><span class="v">${esc(emoLine)}</span></div>` : ""}
      ${effLine ? `<div class="cid-row"><span class="k">效果</span><span class="v">${esc(effLine)}</span></div>` : ""}
      ${def.price ? `<div class="cid-row"><span class="k">參考價</span><span class="v">${def.price} 金</span></div>` : ""}
    </div>
    ${Cards.cardTokenString?.(def) ? `<p class="cid-hint" style="color:var(--gold,#ffd75f)">${esc(Cards.cardTokenString(def))}</p>` : ""}
    ${def.promptHint ? `<p class="cid-hint dim small">${esc(def.promptHint)}</p>` : ""}
    <div class="cid-actions">
      <button type="button" class="cid-close" id="cid-close">收起說明</button>
    </div>`;
}

// ===== 創角輪巡（全新／清空重來）=====
// 歡迎 → 姓名 → 隨機發一張 starter 基礎話術（已取消測驗／體型／喜好）
// NSFW 包若無 starter 池：姓名後可直接進入，到商店買碎卡。

/** 步驟：0 歡迎 · 1 姓名 · 2 結果（隨機基礎卡／無池則略過） */
function onboardStepMeta() {
  return { intro: 0, name: 1, result: 2, total: 3 };
}

let onboardUi = {
  step: 0,
  name: "",
  resultCardId: null,
  started: false,
};

/** 目前上線卡組有沒有可發的基礎話術 */
function hasStarterPool() {
  return (Cards.starterPoolIds?.() || []).length > 0;
}

function needsStarterPick() {
  if (!cardSystemOn()) return false;
  // 已領底色，或曾完成創角（含「無 starter 池直接進」）
  if (state.playerProfile?.starterSpeechCardId) return false;
  if (state.playerProfile?.onboardDone) return false;
  return true;
}

function resetOnboardUi() {
  onboardUi = {
    step: 0,
    name: state?.playerProfile?.name || state?.settings?.player || "",
    resultCardId: null,
    started: true,
  };
}

/** 從目前上線卡組的 starter 池隨機一張基礎話術；池空回 null（不擋流程） */
function finishOnboardPickCard() {
  const pool = Cards.starterPoolIds?.() || [];
  const pick = Cards.pickStarterRandom?.() || pool[0] || null;
  if (!pick) {
    onboardUi.resultCardId = null;
    return null;
  }
  onboardUi.resultCardId = pick;
  return onboardUi.resultCardId;
}

function canAdvanceOnboard(step) {
  const m = onboardStepMeta();
  if (step === m.intro) return true;
  if (step === m.name) return !!(onboardUi.name || "").trim();
  // 結果步：有抽到卡，或本包本來就沒 starter（允許略過）
  if (step === m.result) return !!onboardUi.resultCardId || !hasStarterPool();
  return false;
}

function commitOnboard() {
  const name = (onboardUi.name || "").trim().slice(0, 12) || "主人";
  state.playerProfile.name = name;
  state.playerProfile.body = state.playerProfile.body || "";
  state.playerProfile.prefs = state.playerProfile.prefs || [];
  state.playerProfile.quiz = state.playerProfile.quiz || {};
  state.settings.player = name;

  // 無 starter 池（例如 NSFW 純碎卡包）：只取名進入，不發卡
  if (!hasStarterPool()) {
    state.playerProfile.starterSpeechCardId = null;
    state.playerProfile.onboardDone = true;
    state.cardDeck = Cards.getDeck?.(state) || state.cardDeck || [];
    log(`創角完成：${name}／本卡組無基礎話術（略過底色）`);
    toast("創角完成——本卡組沒有基礎話術，請到商店買牌編組", "good");
    scheduleSave();
    return true;
  }

  const cardId = onboardUi.resultCardId || finishOnboardPickCard();
  if (!cardId) {
    toast("抽不到基礎卡，請到 /cardedit 勾 starter 並上線", "bad");
    return false;
  }
  const r = Cards.grantStarter(state, cardId);
  if (!r.ok) { toast(r.err || "創角失敗", "bad"); return false; }
  state.playerProfile.starterSpeechCardId = cardId;
  state.playerProfile.onboardDone = true;
  // 創角話術預設放進出戰牌組
  state.cardDeck = [cardId];
  const def = Cards.cardById(cardId);
  log(`創角完成：${name}／隨機話術「${def?.name || cardId}」`);
  toast(`你的底色話術：${def?.name || cardId}（已放進牌組）`, "good");
  scheduleSave();
  return true;
}

function renderStarterModal() {
  const ov = $("#starter-modal");
  if (!ov) return;
  if (!needsStarterPick()) {
    ov.classList.add("hidden");
    onboardUi.started = false;
    return;
  }
  ov.classList.remove("hidden");
  if (!onboardUi.started) resetOnboardUi();

  const m = onboardStepMeta();
  const step = Math.max(0, Math.min(onboardUi.step, m.total - 1));
  onboardUi.step = step;

  const prog = $("#onboard-progress");
  if (prog) {
    const labels = ["迎", "名", "卡"];
    const phase = step === m.intro ? 0 : step === m.name ? 1 : 2;
    prog.innerHTML = labels.map((lb, i) =>
      `<span class="onboard-dot${i === phase ? " on" : i < phase ? " done" : ""}" title="${lb}"></span>`
    ).join("");
  }

  const panel = $("#onboard-panel");
  const nav = $("#onboard-nav");
  if (!panel || !nav) return;

  panel.style.animation = "none";
  void panel.offsetWidth;
  panel.style.animation = "";

  const poolN = (Cards.starterPoolIds?.() || []).length;
  const noStarterPool = poolN <= 0;

  if (step === m.intro) {
    panel.innerHTML = `
      <h2>歡迎來到魅魔萬事屋</h2>
      <p class="lead">在召喚任何人之前，先取個名字——她們會這樣叫你。</p>
      <p class="lead">${noStarterPool
        ? "目前上線卡組<strong>沒有基礎話術</strong>（例如 NSFW 碎卡包）。取名後即可進入，再到<strong>商店買牌、編牌組</strong>。"
        : "接著系統會<strong>隨機給你一張基礎話術</strong>（永久、不碎），當作你說話的底色。之後仍可在商店買更多牌。"}</p>`;
    nav.innerHTML = `<span></span><button type="button" class="ob-next" id="ob-next">開始</button>`;
  } else if (step === m.name) {
    panel.innerHTML = `
      <h2>怎麼稱呼你</h2>
      <p class="lead">她們會用這個名字叫你。之後可在設定改顯示。</p>
      <input class="onboard-name-input" id="ob-name" maxlength="12" placeholder="例如：主人、阿澤、店長…" value="${esc(onboardUi.name)}">`;
    const nameIn = panel.querySelector("#ob-name");
    nameIn?.focus();
    nameIn?.addEventListener("input", () => {
      onboardUi.name = nameIn.value;
      const btn = nav.querySelector("#ob-next");
      if (btn) btn.disabled = !canAdvanceOnboard(step);
    });
    nav.innerHTML = `
      <button type="button" class="ob-back" id="ob-back">上一步</button>
      <button type="button" class="ob-next" id="ob-next" ${canAdvanceOnboard(step) ? "" : "disabled"}>${
        noStarterPool ? "下一步" : "抽基礎卡"
      }</button>`;
  } else {
    // result：有池 → 隨機抽；無池 → 直接可進
    if (!noStarterPool && !onboardUi.resultCardId) finishOnboardPickCard();
    const def = onboardUi.resultCardId ? Cards.cardById(onboardUi.resultCardId) : null;
    const pack = CARDS_PACK_INFO || {};
    if (noStarterPool || !def) {
      panel.innerHTML = `
        <h2>${noStarterPool ? "跳過基礎話術" : "抽不到基礎卡"}</h2>
        <p class="lead">目前掛載的卡組 <b>${esc(pack.name || pack.packId || "?")}</b>
          （${esc(pack.file || "?")}）裡
          <b>沒有 starter 基礎卡</b>（池子 ${poolN} 張）。</p>
        <p class="lead">${noStarterPool
          ? "可以直接進入萬事屋。請到<strong>商店</strong>購買碎卡，長按加入<strong>出戰牌組</strong>後再開戰。"
          : "請到 <a href=\"/cardedit\" target=\"_blank\">/cardedit</a> 勾 starter 並上線，或直接進入後用商店買牌。"}</p>
        <div class="onboard-summary">${esc(onboardUi.name || "主人")}</div>`;
      nav.innerHTML = `
        <button type="button" class="ob-back" id="ob-back">上一步</button>
        <div style="display:flex;gap:.5em;flex-wrap:wrap;justify-content:flex-end">
          ${noStarterPool ? "" : `<button type="button" class="ob-next" id="ob-reroll">再試一次</button>`}
          <button type="button" class="ob-finish" id="ob-finish">進入萬事屋</button>
        </div>`;
    } else {
      panel.innerHTML = `
        <h2>你的底色話術</h2>
        <p class="lead">從卡組 <b>${esc(pack.name || pack.packId || "上線組")}</b> 的基礎池
          （${poolN} 張）<strong>隨機</strong>抽到——永久、不碎。</p>
        <div class="onboard-result-card">
          <div class="tag">STARTER · 隨機 · ${esc(pack.file || "")}</div>
          <h3>${esc(def?.name || onboardUi.resultCardId)}</h3>
          <p>${esc(def?.sceneStart || "")}</p>
        </div>
        <div class="onboard-summary">
          ${esc(onboardUi.name || "主人")}
        </div>
        <p class="lead dim" style="margin-top:.6em">不滿意？可按「再抽一張」重骰（進遊戲前都行）。</p>`;
      nav.innerHTML = `
        <button type="button" class="ob-back" id="ob-back">上一步</button>
        <div style="display:flex;gap:.5em;flex-wrap:wrap;justify-content:flex-end">
          <button type="button" class="ob-next" id="ob-reroll">再抽一張</button>
          <button type="button" class="ob-finish" id="ob-finish">進入萬事屋</button>
        </div>`;
    }
  }

  nav.querySelector("#ob-back")?.addEventListener("click", () => {
    if (onboardUi.step > 0) {
      if (onboardUi.step === m.result) onboardUi.resultCardId = null;
      onboardUi.step--;
      renderStarterModal();
    }
  });
  nav.querySelector("#ob-next")?.addEventListener("click", () => {
    if (!canAdvanceOnboard(onboardUi.step)) return;
    if (onboardUi.step === m.name) {
      onboardUi.name = (onboardUi.name || "").trim().slice(0, 12);
      // 輸入姓名後立刻隨機抽卡
      finishOnboardPickCard();
    }
    onboardUi.step++;
    renderStarterModal();
  });
  nav.querySelector("#ob-reroll")?.addEventListener("click", () => {
    finishOnboardPickCard();
    renderStarterModal();
  });
  nav.querySelector("#ob-finish")?.addEventListener("click", () => {
    if (!commitOnboard()) return;
    onboardUi.started = false;
    renderAll();
  });
}

/**
 * 牌局中的妹子。優先 live 名冊；找不到時用 session 開桌時快取的 girlSnap，
 * 避免連續出卡／背景同步時短暫對不到人 → 立繪與名字變「？」、人設斷線。
 */
function girlForSession() {
  const sess = state.cardSession;
  const id = sess?.girlId;
  if (!id) return null;
  const live = state.succubi.find(x => x.id === id);
  if (live) {
    // 同步刷新 snap（名字／立繪若更新）
    cacheGirlSnapOnSession(live);
    return live;
  }
  const snap = sess.girlSnap;
  if (snap && (snap.id === id || !snap.id)) {
    return { ...snap, id, _fromSnap: true };
  }
  return null;
}

/** 開桌／恢復時寫入，供 girlForSession 回退 */
function cacheGirlSnapOnSession(girl) {
  const sess = state.cardSession;
  if (!sess || !girl?.id) return;
  if (sess.girlId && sess.girlId !== girl.id) return;
  sess.girlId = girl.id;
  sess.girlSnap = {
    id: girl.id,
    name: girl.name || sess.girlSnap?.name || "她",
    stage: girl.stage || sess.girlSnap?.stage || "stranger",
    rarity: girl.rarity,
    personality: girl.personality,
    speech: girl.speech,
    tone: girl.tone,
    look: girl.look,
    specialTraits: girl.specialTraits,
    job: girl.job,
    jobDesc: girl.jobDesc,
    dna: girl.dna,
    backstory: girl.backstory,
    portraits: girl.portraits ? { ...girl.portraits } : sess.girlSnap?.portraits,
    portrait: girl.portrait || sess.girlSnap?.portrait,
    portraitReady: girl.portraitReady,
    cardCg: girl.cardCg, // 同一參考，場景圖 cache 不丟
    seed: girl.seed,
    comfyCkpt: girl.comfyCkpt,
    outfitPick: girl.outfitPick,
    libido: girl.libido,
    chrono: girl.chrono,
    likes: girl.likes,
    dislikes: girl.dislikes,
    hobbies: girl.hobbies,
    catchphrases: girl.catchphrases,
    reactions: girl.reactions,
    quirk: girl.quirk,
    contrast: girl.contrast,
    affection: girl.affection,
  };
}

function sessionGirlName(girl) {
  return (girl?.name && String(girl.name).trim())
    || state.cardSession?.girlSnap?.name
    || "她";
}

// ── M3 約會牌局 ──────────────────────────────────────────

function dateLimitPerDay() {
  return Cards.d?.("dates_per_girl_per_day", DATE_LIMIT) ?? DATE_LIMIT;
}

/** 電話費固定 1 金（defaults.phone_cost；舊 phone_cost_range 僅作後備） */
function phoneCostRoll() {
  const fixed = Cards.d("phone_cost", null);
  if (fixed != null && fixed !== "") {
    const n = Number(fixed);
    if (Number.isFinite(n) && n >= 0) return Math.floor(n);
  }
  const range = Cards.d("phone_cost_range", [1, 1]);
  const lo = Array.isArray(range) ? (range[0] ?? 1) : 1;
  const hi = Array.isArray(range) ? (range[1] ?? lo) : lo;
  return randInt(lo, hi);
}

/** 接通率固定 2/3（defaults.answer_rate；不再依關係階段） */
function dateAnswerRate(_stage) {
  const r = Cards.d("answer_rate", 2 / 3);
  const n = Number(r);
  if (Number.isFinite(n) && n >= 0 && n <= 1) return n;
  return 2 / 3;
}

function availableVenues() {
  // 全域 NSFW：不再依 nsfwOnly 過濾場地
  return (Cards.venuesList?.() || []).slice();
}

function datesLeftToday(s) {
  const today = dayNum();
  const lim = dateLimitPerDay();
  if (s.datesToday?.day !== today) return lim;
  return Math.max(0, lim - (s.datesToday.count || 0));
}

/** 是否正被其他召喚師「帶走／召喚中」（taken） */
function isSummonerTaken(s) {
  return !!(s && s.summoner?.taken && !s.ntr);
}

/**
 * 電話鈕是否可按：
 *  · 被召喚走 → 永遠可打（窺視，不限一天兩次）
 *  · 沒被召喚 → 一般約會流程，受「一天兩次」限制
 *  · 看板中／睡眠 → 不可
 */
function canPressPhone(s) {
  if (!s || s.ntr) return false;
  if (isAsleep()) return false;
  if (isKanban(s.id)) return false;
  if (isSummonerTaken(s)) return true;           // 被帶走：可連打
  return datesLeftToday(s) > 0;                  // 一般約會：一天兩次
}

function venueById(venueId) {
  return availableVenues().find(x => x.id === venueId)
    || (Cards.venuesList?.() || []).find(x => x.id === venueId)
    || null;
}

/** 被召喚走時打電話：接通率 1/5（可連打、不扣金、不佔約會額度） */
const TAKEN_PHONE_ANSWER_RATE = 1 / 5;

/**
 * 被召喚走：打電話窺視已預生的 act（不現生新場）。
 *  1/5 接通 → 有未讀場就進觀戰；沒場／看完 =「我在忙」
 *  沒接通 → 可再打
 */
async function beginTakenPhoneCall(girlId) {
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) { toast("她不在你身邊……", "bad"); return; }
  // 已不在 taken → 改走一般約會（會判斷一天兩次）
  if (!isSummonerTaken(s)) {
    beginDateFlow(girlId);
    return;
  }
  if (Cards.sessionActive(state)) {
    const rec = resumeOrRecoverCardSession({ forceUi: true });
    toast(`先結束與 ${rec.girlName || "她"} 的牌局（已打開牌桌）`, "bad");
    return;
  }
  if (watchWith) {
    toast("先結束目前的觀戰", "bad");
    return;
  }

  // 先同步，讓伺服器已預生的 acts 鏡像進來（不 live 現生）
  try { await simSync(true); } catch { /* */ }
  const girl = state.succubi.find(x => x.id === girlId) || s;
  if (!girl.summoner?.taken) {
    toast(`${girl.name} 好像回來了——再打一次一般電話吧`, "good");
    return;
  }

  const su = summonerById(girl.summoner.id);
  log(`打電話給 ${girl.name}（她正被 ${su?.name || "召喚師"} 帶走）`);

  // 1/5 接通
  if (Math.random() >= TAKEN_PHONE_ANSWER_RATE) {
    toast(`${girl.name} 沒接……（可再打）`, "bad");
    scheduleSave();
    renderAll();
    return;
  }

  // 接通：只看「已經產生」的未讀場——不 live_act
  const ready = readyUnseen(girl);
  const unseen = unseenActs(girl);
  // 優先播文字已備妥的；沒有備妥文則用結構未讀（觀戰時才生字，不新開 slot）
  const pool = ready.length ? ready : unseen;
  if (!pool.length) {
    toast(`${girl.name}：……我在忙。（掛斷）`, "");
    log(`${girl.name} 接了電話，但說在忙（沒有可看的紀錄）`);
    scheduleSave();
    renderAll();
    return;
  }

  toast(`${girl.name} 接了……？線路裡有別的聲音`, "good");
  // 一通只播兩則（有幾則算幾則，最多 2）
  await enterWatch(girl, "phone", null, {
    onlyExisting: true,   // 禁止 live_act 現生
    noRelease: true,      // 電話窺視不判定搶回
    turnCap: Math.min(PHONE_WATCH_TURN_CAP, pool.length),
    wantSceneArt: true,   // 兩句聽完 → AI 產 prompt → 生圖
  });
}

/**
 * 電話入口（詳細頁「電話」）：
 *  ┌─ 被召喚走（taken）→ 窺視電話：1/5 接通、可連打、不扣額度
 *  └─ 沒被召喚         → 約會流程：扣電話費、2/3 接通、一天兩次、抽場地
 */
function beginDateFlow(girlId) {
  if (!cardSystemOn()) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) { toast("她不在你身邊……", "bad"); return; }

  // ★ 分支 1：被召喚走 → 只走窺視，不進約會額度
  if (isSummonerTaken(s)) {
    beginTakenPhoneCall(girlId);
    return;
  }

  // ★ 分支 2：一般約會（一天兩次）
  if (isKanban(girlId)) { toast("看板中不可約會——先結束店頭互動", "bad"); return; }
  if (state.gold < 0) { toast("負債中,先去做委託還債吧", "bad"); return; }
  if (Cards.sessionActive(state)) {
    const rec = resumeOrRecoverCardSession({ forceUi: true });
    toast(`先結束與 ${rec.girlName || "她"} 的牌局（已打開牌桌）`, "bad");
    return;
  }
  // 已抽好地點、待確認：再按電話只是重顯確認列
  if (dateFlow?.girlId === girlId && dateFlow.venueId) {
    dateChooser = true;
    renderAll();
    return;
  }
  // 一天兩次只套在「沒被召喚」的約會
  if (datesLeftToday(s) <= 0) {
    toast(`今天約會夠多了（每天 ${dateLimitPerDay()} 次）,她需要休息`, "bad");
    return;
  }

  const venues = availableVenues();
  if (!venues.length) {
    toast("還沒有可去的約會場地", "bad");
    return;
  }

  const cost = phoneCostRoll();
  if (state.gold < cost) {
    toast(`電話費要 ${cost} 金（目前 ${state.gold}）`, "bad");
    return;
  }
  state.gold -= cost;
  log(`打電話給 ${s.name} -${cost} 金`);

  const rate = dateAnswerRate(s.stage || "stranger");
  if (Math.random() >= rate) {
    toast(`${s.name} 沒接……（電話費不退）`, "bad");
    dateFlow = null;
    dateChooser = false;
    scheduleSave();
    renderAll();
    return;
  }

  // 成功接聽才算一次約會額度（不去也算用掉）
  const today = dayNum();
  if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
  s.datesToday.count++;
  s.lastDateDay = today;
  s.lastChatDay = today;

  // 全池隨機抽地點（不可選）；玩家再決定要不要付錢去
  const v = venues[Math.floor(Math.random() * venues.length)];
  dateFlow = { girlId, phoneCost: cost, venueId: v.id };
  dateChooser = true;
  toast(`${s.name} 接了——抽到「${v.name}」`, "good");
  scheduleSave();
  renderAll();
}

/** 拒絕這次抽到的地點（電話費與額度不退） */
function declineDateVenue(girlId) {
  if (dateFlow?.girlId !== girlId) return;
  const v = venueById(dateFlow.venueId);
  log(`婉拒「${v?.name || dateFlow.venueId}」的約會`);
  dateFlow = null;
  dateChooser = false;
  toast("下次再約吧（電話費不退）", "");
  scheduleSave();
  renderAll();
}

/**
 * 付場地費 → 開約會牌桌（被召喚中則改觀戰）。
 * 必須已接通並抽到該 venueId（dateFlow）。
 */
function confirmDateVenue(girlId, venueId) {
  if (!cardSystemOn()) return;
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (dateFlow?.girlId !== girlId) {
    toast("請先打電話", "bad");
    return;
  }
  const wantId = venueId || dateFlow.venueId;
  if (dateFlow.venueId && wantId !== dateFlow.venueId) {
    toast("地點已抽定，不能換", "bad");
    return;
  }
  const v = venueById(wantId);
  if (!v) { toast("找不到這個場地", "bad"); return; }
  if (state.gold < (v.fee || 0)) {
    toast(`場地費 ${v.fee} 金不夠`, "bad");
    scheduleSave();
    renderAll();
    return;
  }
  state.gold -= (v.fee || 0);
  log(`與 ${s.name} 去「${v.name}」約會 -${v.fee || 0} 金`);

  dateFlow = null;
  dateChooser = false;

  // 被召喚走：錢已付，改觀戰；釋放後用 venueId 接回約會牌桌
  if (s.summoner?.taken) {
    log(`約 ${s.name} 出門——她卻被召喚到別人身邊`);
    enterWatch(s, "date", v.id);
    scheduleSave();
    renderAll();
    return;
  }

  openDateTable(girlId, v.id);
}

/**
 * 約會章節制（非看板牌桌）：
 *  L1 固定打出基礎卡 → 感情 2～5
 *  ½ → 正常 L2 二選一 → 感情 5～10；¼ → L3 三選一
 *  ½ → NTR：L1 遇召喚師 → 繼續時 ⅓ 帶走／⅓ L2a／⅓ L2b（不可選）
 *  NTR 中途逃離／離開 → 她與該召喚師關係進一階
 */
function openDateTable(girlId, venueId, opts = {}) {
  if (!cardSystemOn()) { toast("卡牌系統未就緒", "bad"); return; }
  if (!opts.force && isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (isKanban(girlId)) { toast("看板中不可約會", "bad"); return; }
  if (Cards.sessionActive(state)) {
    toast("先結束進行中的牌局", "bad");
    return;
  }

  const venue = (Cards.venuesList?.() || []).find(x => x.id === venueId);
  const chapters = Cards.getVenueDateChapters?.(venueId);
  if (!chapters?.[1]?.length) {
    toast("這個場地還沒有約會章節卡", "bad");
    return;
  }
  const venueCards = Cards.buildVenueCards(venueId);
  if (!venueCards.length) {
    toast("這場約會沒有可用的卡", "bad");
    return;
  }

  // 約會不塞妹子本體／玩家牌組——只走場地章節
  const r = Cards.openSession(state, {
    mode: "date",
    girlId,
    girlCards: [],
    venueId,
    venueCards,
  });
  if (!r.ok) { toast(r.err, "bad"); return; }

  state.cardSession.dateChapter = {
    stage: 0,           // 尚未開打；開始後 1/2/3
    pickOptions: null,  // L2/L3 待選 id[]
    track: "normal",
  };
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.injectIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  cardUi.datePick = false;
  detailId = null;
  touchInteractDay(s);
  syncPortraitCgCache(s);
  ensureArtCacheBg(s);
  cacheGirlSnapOnSession(s);
  document.body.classList.add("card-mode");

  // 準備：只演繹本場地「正常線」章節卡（動作＋預回話）；NTR 岔路現場現演
  log(`約會・${s.name} @ ${venue?.name || venueId}（L1→½正常L2／½NTR）`);
  toast(`抵達「${venue?.name || "約會地"}」——準備約會章節`, "good");
  beginCardNarrPrep(s);
  scheduleSave();
  renderAll();
}

/**
 * 確保約會對象身上有「其他召喚師」：
 *  - 已有 → 用他（像是跟來了）
 *  - 沒有 → 當場從池子纏上一個，並 seed 給 sim
 *  - 池子還沒載入 → 用後備路人，絕不讓 NTR 線因此整段跳過
 */
function ensureDateRivalSummoner(girl) {
  if (!girl) return null;
  if (girl.summoner?.id) {
    const su = summonerById(girl.summoner.id);
    return {
      rel: girl.summoner,
      su: su || { id: girl.summoner.id, name: "另一個男人", emoji: "👤" },
      freshlyEntangled: false,
    };
  }
  let su = SUMMONERS.length ? pick(SUMMONERS) : null;
  if (!su) {
    // summoners.json 尚未載入或池空：後備，避免 NTR 機率骰中卻整段 recede 成正常 L2
    su = { id: "street_stranger", name: "路人男", emoji: "👤" };
    console.warn("[dateNtr] SUMMONERS 空，使用後備召喚師", su);
  }
  girl.summoner = makeSummonerRel(su.id);
  log(`${su.name} 纏上了 ${girl.name}！（約會現場）`);
  toast(`⚠ ${su.name} 纏上了 ${girl.name}`, "bad");
  // 讓伺服器 adopt 這段關係，避免下一輪 simSync 被蓋掉／漏記
  try { simSync(true); } catch { /* */ }
  scheduleSave();
  return { rel: girl.summoner, su, freshlyEntangled: true };
}

/** 約會章節：打出指定場地卡，感情骰用章節區間（覆寫卡面） */
function playDateChapterCard(cardId, stage) {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  const girl = girlForSession();
  if (!girl) { toast("找不到約會對象", "bad"); return; }
  const def = Cards.cardById(cardId);
  if (!def) { toast("找不到這張約會卡", "bad"); return; }

  stage = Number(stage) || 1;
  // 以 session 軌道為準；勿被卡面 dateTrack 蓋掉（正常 L1 卡若誤標會整段進錯線）
  const track = String(sess.dateChapter?.track || "normal");
  const range = Cards.dateChapterEmotion?.(stage, { track }) || { min: 2, max: 5 };
  const lo = Math.min(range.min, range.max);
  const hi = Math.max(range.min, range.max);
  const delta = randInt(lo, hi);

  const rivalName = sess.dateChapter?.rivalName
    || summonerById(girl.summoner?.id)?.name
    || "";
  const sceneRaw = Cards.sceneTextFor?.(state, cardId) || def.sceneStart || def.name || "";
  const play = {
    ok: true,
    cardId: def.id,
    name: def.name,
    kind: "venue_event",
    erotic: false,
    sceneStart: bindSceneToGirl(girl, sceneRaw, { rival: rivalName }),
    girlLine: "",
    feelLabel: Cards.emotionFeelLabel?.(delta) || "",
    open: null,
    emotionDelta: delta,
    shattered: false,
    chain: null,
    forceAnotherRound: false,
    sexTriggered: false,
    effects: [],
    playsLeft: 1,
    roundEnded: false,
    dateChapterStage: stage,
    dateTrack: track,
    fromDateChapter: true,
    rivalName: rivalName || "",
    _boundName: sessionGirlName(girl),
    girlId: girl.id,
  };

  // 罐頭先墊；beginCardPlayAi 會優先用預回話
  play.girlLine = Cards.girlReactionLine?.({
    stage: girl.stage || "stranger",
    emotionDelta: delta,
    openFail: false,
    kind: "venue_event",
  }) || "……";
  play.fromAi = false;

  sess.dateChapter = {
    ...(sess.dateChapter || {}),
    stage,
    track,
    pickOptions: null,
    // NTR：記住目前卡，供 L2 衍生／中離懲罰
    ...(track === "ntr" ? {
      ntrCardId: def.id,
      ntrParentId: stage === 1 ? def.id : (sess.dateChapter?.ntrParentId || def.parentId || def.id),
      ...(def.dateEnding ? { ntrEnding: def.dateEnding } : {}),
    } : {}),
  };
  // 結局卡標記
  if (def.dateEnding) play.dateEnding = def.dateEnding;
  cardUi.datePick = false;
  cardUi.lastPlay = play;
  cardUi.awaitReaction = true;
  cardUi.reactBeat = "action";
  cardUi.endPanel = null;
  touchInteractDay(girl);
  primeCardSceneArtOnPlay(girl, play.cardId);
  applyAffection(girl, delta, { skipBreak: true });
  beginCardPlayAi(girl, play);

  const trackLabel = track === "ntr" ? (stage >= 2 ? "岔路·續" : "岔路") : `第${stage}章`;
  log(`約會${trackLabel}「${def.name}」情感 ${delta >= 0 ? "+" : ""}${delta}${rivalName ? ` · ${rivalName}` : ""}`);
  toast(`${trackLabel}・${def.name}（情感 ${delta >= 0 ? "+" : ""}${delta}）`, track === "ntr" ? "bad" : "good");
  scheduleSave();
  renderCardTable();
}

/** 第1章：固定打出基礎卡（normal track） */
function startDateChapterOne() {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  sess.dateChapter = {
    ...(sess.dateChapter || {}),
    track: "normal",
    rivalId: null,
    rivalName: "",
  };
  const ids = Cards.dateChapterOptionIds?.(sess.venueId, 1, { track: "normal" }) || [];
  const cardId = ids[0];
  if (!cardId) {
    toast("沒有第1章卡", "bad");
    endDateSession("date_no_l1");
    return;
  }
  playDateChapterCard(cardId, 1);
}

/** 玩家在 L2/L3 選了一張 */
function pickDateChapterOption(cardId) {
  const sess = state.cardSession;
  if (!sess?.dateChapter?.pickOptions?.includes(cardId)) {
    toast("請選這一章的選項", "bad");
    return;
  }
  const stage = sess.dateChapter.stage;
  playDateChapterCard(cardId, stage);
}

/** 正常線：進 L2／L3 選項（或單卡直打） */
function beginDateNormalChapter(next) {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  const girl = girlForSession();
  const opts = Cards.dateChapterOptionIds?.(sess.venueId, next, { track: "normal" }) || [];
  if (opts.length < (next === 2 ? 2 : 1)) {
    toast("下一章卡不足，約會結束", "bad");
    endDateSession("date_no_next_cards");
    return;
  }
  sess.dateChapter.track = "normal";
  sess.dateChapter.stage = next;
  sess.dateChapter.pickOptions = opts.slice();
  cardUi.datePick = true;
  toast(
    next === 2
      ? `約會繼續——第2章（${opts.length} 選 1，感情 5～10）`
      : `氣氛還在——第3章（${opts.length} 選 1，感情 10～15）`,
    "good",
  );
  if (opts.length === 1) {
    cardUi.datePick = false;
    sess.dateChapter.pickOptions = null;
    playDateChapterCard(opts[0], next);
    return;
  }
  scheduleSave();
  renderCardTable();
  if (girl) touchInteractDay(girl);
}

/**
 * NTR 第一階段：其他召喚師出現在約會現場。
 * 沒有纏身關係 → 當場從池子纏上一個。
 */
function beginDateNtrStage1() {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  const girl = girlForSession();
  if (!girl) {
    endDateSession("date_ntr_no_girl");
    return;
  }

  const rival = ensureDateRivalSummoner(girl);
  if (!rival) {
    // 理論上 ensure 已有後備，仍失敗才退正常線
    console.error("[dateNtr] ensureDateRivalSummoner 失敗");
    toast("岔路生成失敗——改走正常第2章", "bad");
    beginDateNormalChapter(2);
    return;
  }

  const suName = rival.su?.name || "另一個男人";
  sess.dateChapter.track = "ntr";
  sess.dateChapter.rivalId = rival.su?.id || girl.summoner?.id || null;
  sess.dateChapter.rivalName = suName;
  sess.dateChapter.ntrEscaped = false; // 中離懲罰旗標用

  const opts = Cards.dateChapterOptionIds?.(sess.venueId, 1, { track: "ntr" }) || [];
  let cardId = opts[0];
  if (!cardId) {
    // 後備：掃該場地 dateTrack=ntr 的卡
    const all = Cards.buildVenueCards?.(sess.venueId, { track: "ntr" }) || [];
    cardId = all.find(c => (Cards.cardById(c.cardId || c.id)?.dateStage || 1) === 1)?.cardId
      || all[0]?.cardId || all[0]?.id;
  }
  if (!cardId) {
    toast("還沒有這場地的岔路卡——約會先散", "bad");
    endDateSession("date_ntr_no_card");
    return;
  }

  if (rival.freshlyEntangled) {
    log(`約會岔路：${suName} 當場纏上 ${girl.name}，闖入約會`);
    toast(`⚠ ${suName} 跟來了——而且纏上了她`, "bad");
  } else {
    log(`約會岔路：${suName} 出現在約會現場`);
    toast(`⚠ ${suName} 跟來了……`, "bad");
  }

  // 固定一張，直接打（NTR 不可選卡，只能繼續）
  cardUi.datePick = false;
  sess.dateChapter.track = "ntr";
  sess.dateChapter.stage = 1;
  sess.dateChapter.pickOptions = null;
  sess.dateChapter.ntrParentId = cardId;
  console.info("[dateNtr] 進入 NTR L1", { cardId, venueId: sess.venueId, rival: suName });
  playDateChapterCard(cardId, 1);
}

/**
 * NTR 三岔口：
 *   1/6 玩家抽離
 *   5/12 衍生卡 A
 *   5/12 衍生卡 B
 * 實作：均勻 0..11
 *   0,1     → 抽離（2/12=1/6）
 *   2..6    → 卡 A（5/12）
 *   7..11   → 卡 B（5/12）
 * 除錯：yoro_force_ntr_fork = "pull" | "a" | "b"
 */
function rollNtrThreeWay() {
  let force = "";
  try {
    force = String(
      localStorage.getItem("yoro_force_ntr_fork")
      || localStorage.getItem("yoro_force_ntr_l2")
      || localStorage.getItem("yoro_force_ntr_l3")
      || ""
    ).toLowerCase().trim();
  } catch { /* */ }

  let face; // 0 pull / 1 A / 2 B
  if (force === "pull" || force === "leave" || force === "escape" || force === "out") face = 0;
  else if (force === "a") face = 1;
  else if (force === "b") face = 2;
  else {
    const slot = Math.floor(Math.random() * 12); // 0..11
    if (slot < 2) face = 0;       // 2/12 = 1/6 抽離
    else if (slot < 7) face = 1;  // 5/12 卡 A
    else face = 2;                // 5/12 卡 B
  }

  if (!Number.isFinite(face) || face < 0 || face > 2) face = 1;
  return { face, force: force || "", pullP: 1 / 6 };
}

/**
 * NTR 某章演完、玩家按繼續後：
 *   1/6 玩家抽離（脫出 NTR；不是召喚師帶走她）
 *   5/12 衍生卡 A
 *   5/12 衍生卡 B
 * 每一層繼續各骰一次（L1→L2、L2→L3 各一次）。
 */
function resolveNtrContinue(fromStage) {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  const girl = girlForSession();
  const nextStage = fromStage + 1;
  const parentId = sess.dateChapter?.ntrCardId
    || sess.dateChapter?.ntrParentId
    || (Cards.dateChapterOptionIds?.(sess.venueId, fromStage, { track: "ntr" }) || [])[0];

  let kids = Cards.dateNtrChildIds?.(parentId) || [];
  kids = kids.filter((id) => {
    const d = Cards.cardById(id);
    return d && (Number(d.dateStage) || 0) === nextStage;
  });
  if (kids.length < 2) {
    const pool = Cards.dateChapterOptionIds?.(sess.venueId, nextStage, { track: "ntr" }) || [];
    // 若有 parent，優先同 parent 的；否則用地點池
    for (const id of pool) {
      if (kids.includes(id)) continue;
      const d = Cards.cardById(id);
      if (parentId && d?.parentId && d.parentId !== parentId && kids.length >= 2) continue;
      kids.push(id);
    }
  }
  // 剛好兩張：A / B
  kids = kids.slice(0, 2);

  const rn = sess.dateChapter?.rivalName
    || summonerById(girl?.summoner?.id)?.name
    || "那個男人";

  const { face, force, pullP } = rollNtrThreeWay();
  const faceLabel = face === 0 ? "抽離" : face === 1 ? "卡A" : "卡B";
  console.info("[dateNtr] 三岔", { fromStage, nextStage, face, faceLabel, force, pullP, parentId, kids });
  log(`NTR 三岔 L${fromStage}→：${faceLabel}（抽離率 1/6${force ? " force=" + force : ""}）`);

  // face 0：玩家抽離（1/6）
  if (face === 0) {
    toast(`🎲 1/6 抽離`, "good");
    ntrPlayerPullOut(girl, rn, fromStage);
    return;
  }

  if (kids.length < 1) {
    // 無 L5：跳結局 L6（帶走／回來）
    if (fromStage >= 4 || nextStage >= 5) {
      beginNtrL6Ending();
      return;
    }
    console.warn("[dateNtr] 無衍生卡", { parentId, nextStage, venueId: sess.venueId });
    toast(`${rn} 還纏著……但沒有下一幕卡`, "bad");
    endDateSession(
      nextStage >= 4 ? "date_ntr_no_l4" : nextStage >= 3 ? "date_ntr_no_l3" : "date_ntr_no_l2",
      { skipNtrPenalty: true },
    );
    return;
  }

  // face 1 → kids[0]；face 2 → kids[1]（若只有一張就重複用）
  const pickIdx = Math.min(face - 1, kids.length - 1);
  const cardId = kids[pickIdx] || kids[0];
  const def = Cards.cardById(cardId);
  cardUi.datePick = false;
  sess.dateChapter.pickOptions = null;
  sess.dateChapter.stage = nextStage;
  sess.dateChapter.track = "ntr";
  const stageHint = nextStage >= 5 ? "高潮迎合"
    : nextStage >= 4 ? "交配"
    : nextStage >= 3 ? "猥褻" : "續";
  toast(
    `🎲 沒抽離（5/12→${def?.name || cardId}）·${stageHint}`,
    "bad",
  );
  playDateChapterCard(cardId, nextStage);
}

/** @deprecated 別名 */
function resolveNtrAfterL1() {
  resolveNtrContinue(1);
}

/**
 * NTR：玩家骰中「抽離」——你帶著場面／自己離開這個狀態。
 * 約會收束；不設 taken；不推進她與召喚師關係（成功脫出）。
 * （中途按結束逃跑仍會吃 applyNtrLeavePenalty）
 */
function ntrPlayerPullOut(girl, rivalName, fromStage = 1) {
  const sess = state.cardSession;
  const rn = rivalName || sess?.dateChapter?.rivalName || "那個男人";
  const gname = girl?.name || "她";
  const where = (Cards.venuesList?.() || []).find(v => v.id === sess?.venueId)?.name || "約會";
  log(`你在「${where}」抽離了 NTR 場面（L${fromStage} 後）——沒讓 ${rn} 把節奏帶走；${gname} 還在`);
  toast(`你抽離了——沒跟 ${rn} 的節奏走下去`, "good");
  endDateSession("date_ntr_player_pullout", {
    skipNtrPenalty: true,
    toastMsg: `抽離成功——這場岔路到此為止`,
  });
}

/**
 * NTR L6 雙結局：½ 被他帶走當看板／½ 回到玩家身邊。
 * 先播結局卡，玩家按繼續後再套用狀態（applyNtrL6Outcome）。
 */
function beginNtrL6Ending() {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date") return;
  const girl = girlForSession();
  const rn = sess.dateChapter?.rivalName
    || summonerById(girl?.summoner?.id)?.name
    || "那個男人";

  let ending = "return";
  try {
    const f = String(localStorage.getItem("yoro_force_ntr_end") || "").toLowerCase();
    if (f === "taken" || f === "take" || f === "away" || f === "kanban") ending = "taken";
    else if (f === "return" || f === "home" || f === "back") ending = "return";
    else ending = Math.random() < 0.5 ? "taken" : "return";
  } catch {
    ending = Math.random() < 0.5 ? "taken" : "return";
  }

  sess.dateChapter.ntrEnding = ending;
  sess.dateChapter.track = "ntr";
  sess.dateChapter.stage = 6;
  sess.dateChapter.pickOptions = null;
  cardUi.datePick = false;

  // 場地結局卡：venue_{id}_ntr6_taken | _return
  const vid = sess.venueId || "park";
  let cardId = `venue_${vid}_ntr6_${ending}`;
  if (!Cards.cardById(cardId)) {
    const pool = Cards.dateChapterOptionIds?.(vid, 6, { track: "ntr" }) || [];
    cardId = pool.find((id) => {
      const d = Cards.cardById(id);
      return d?.dateEnding === ending || (id || "").includes(ending);
    }) || pool[0];
  }
  if (!cardId || !Cards.cardById(cardId)) {
    // 無卡面也直接結算
    console.warn("[dateNtr] L6 無結局卡，直接結算", ending);
    applyNtrL6Outcome();
    return;
  }

  console.info("[dateNtr] L6 結局", { ending, cardId, rival: rn });
  log(`NTR 結局骰：${ending === "taken" ? `${rn} 帶走她` : "她回到你身邊"}`);
  toast(
    ending === "taken"
      ? `🎲 結局——${rn} 要帶她走`
      : `🎲 結局——她朝你走回來`,
    ending === "taken" ? "bad" : "good",
  );
  playDateChapterCard(cardId, 6);
}

/**
 * L6 場面看完：套用結局狀態。
 *  - taken：她成為其他召喚師的「看板娘」（taken=kanban，從玩家看板撤下）
 *  - return：她回到你身邊，taken 清除，可聽她「沒事了」
 */
function applyNtrL6Outcome() {
  const sess = state.cardSession;
  const girl = girlForSession();
  const ending = sess?.dateChapter?.ntrEnding
    || (Cards.cardById(sess?.dateChapter?.ntrCardId)?.dateEnding)
    || "return";
  const rn = sess?.dateChapter?.rivalName
    || summonerById(girl?.summoner?.id)?.name
    || "那個男人";

  if (!girl) {
    endDateSession("date_ntr6_no_girl", { skipNtrPenalty: true });
    return;
  }

  if (ending === "taken") {
    ensureDateRivalSummoner(girl);
    // 從玩家看板撤下
    state.kanbans = (state.kanbans || []).filter((k) => k.id !== girl.id);
    if (state.lastKanbanId === girl.id) state.lastKanbanId = null;
    const hours = Math.max(4, (typeof kanbanHours === "function" ? kanbanHours() : 4) + 2);
    const su = summonerById(girl.summoner?.id);
    const loc = (su?.spots?.length ? pick(su.spots).name : null) || "他的據點";
    girl.summoner.taken = {
      type: "kanban",
      location: loc,
      until: Date.now() + hours * HOUR,
      actAt: Date.now(),
      fromNtrDateEnd: true,
    };
    // 關係至少推進一階（被帶走當看板）
    if ((girl.summoner.stage ?? 0) < 5) {
      try { advanceRivalStage(girl); } catch { /* */ }
    }
    log(`${rn} 帶走了 ${girl.name}——她成為他的看板娘（${hours}h · ${loc}）`);
    try { simSync(true); } catch { /* */ }
    endDateSession("date_ntr6_taken", {
      skipNtrPenalty: true,
      toastMsg: `${rn} 帶走了 ${girl.name}——她成了他的看板娘`,
    });
    return;
  }

  // return：回到玩家
  if (girl.summoner?.taken) girl.summoner.taken = null;
  log(`${girl.name} 回到你身邊——對你說沒事了（NTR 結局·回歸）`);
  try { simSync(true); } catch { /* */ }
  endDateSession("date_ntr6_return", {
    skipNtrPenalty: true,
    toastMsg: `${girl.name} 回到你身邊……「沒事了」`,
  });
}

/**
 * 玩家在 NTR 線中途逃離／離開（按結束、沒骰中抽離）→ 她與該召喚師關係進一階。
 * 正常演完 L3、或骰中「玩家抽離」，不吃這罰。
 */
function applyNtrLeavePenalty(girl, reason) {
  if (!girl?.summoner) return false;
  const before = girl.summoner.stage ?? 0;
  if (before >= 5) {
    // 已是女友階段：不再用「進階」嚇，略過（懷孕線仍靠交配）
    log(`${girl.name} 與 ${summonerById(girl.summoner.id)?.name || "他"} 已是「${rivalStageName(before)}」——逃離沒再推進`);
    return false;
  }
  advanceRivalStage(girl);
  const after = girl.summoner.stage ?? before;
  const su = summonerById(girl.summoner.id);
  const suName = su?.name || "那個男人";
  log(`你逃離／中離約會（${reason}）——${girl.name} 與 ${suName} 的關係：${rivalStageName(before)} → ${rivalStageName(after)}`);
  toast(`你走了……${girl.name} 與 ${suName} 更近一步（${rivalStageName(after)}）`, "bad");
  try { simSync(true); } catch { /* */ }
  return true;
}

function isNtrPlayerAbortReason(reason) {
  const r = String(reason || "");
  return /player_abort|player_leave|narr_abort|player_dismiss|eject|flee|escape/i.test(r)
    || r === "date_player_stop_pick";
}

/**
 * 正常線 L1 打完後的分歧：½ NTR／½ 正常 L2。
 * 抽出純函式方便測試；強制預設 0.5（defaults 可覆寫）。
 */
function rollDateL1Branch(rng = Math.random) {
  let ntrP = 0.5;
  try {
    const raw = Cards.dateNtrBranchChance?.();
    const n = Number(raw);
    if (Number.isFinite(n)) ntrP = Math.min(1, Math.max(0, n));
  } catch { /* keep 0.5 */ }
  // 若機率表異常（NaN／缺）一律回 0.5
  if (!Number.isFinite(ntrP)) ntrP = 0.5;

  let force = "";
  try {
    const f = localStorage.getItem("yoro_force_date_ntr");
    if (f === "1" || f === "true" || f === "on") { ntrP = 1; force = "ON"; }
    else if (f === "0" || f === "false" || f === "off") { ntrP = 0; force = "OFF"; }
  } catch { /* */ }

  const roll = Number(rng());
  const goNtr = roll < ntrP;
  return { goNtr, roll, ntrP, force };
}

/** 一章演出結束 → 骰是否進下一章／NTR，或結束約會 */
function afterDateChapterBeat() {
  const sess = state.cardSession;
  if (!sess || sess.mode !== "date" || !sess.dateChapter) {
    exitCardModeFully("約會到此散了");
    return;
  }
  const girl = girlForSession();
  // ★ 以剛打完的 play 為準（session.stage 可能被存檔／正規化弄歪）
  const last = cardUi.lastPlay;
  const stage = Number(
    last?.dateChapterStage != null ? last.dateChapterStage : sess.dateChapter?.stage
  ) || 1;
  const track = String(
    last?.dateTrack || sess.dateChapter?.track || "normal"
  );
  sess.dateChapter.stage = stage;
  sess.dateChapter.track = track;

  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.lastPlay = null;
  voidCardPlayAiAndScene();

  console.info("[dateChapter] after beat", {
    stage, track, lastCard: last?.cardId, lastName: last?.name,
    sessStage: sess.dateChapter?.stage, venueId: sess.venueId,
  });

  // ── NTR 線（不可選卡，只能繼續）──
  if (track === "ntr") {
    if (stage === 1) {
      resolveNtrContinue(1); // → L2
      return;
    }
    if (stage === 2) {
      resolveNtrContinue(2); // → L3 猥褻
      return;
    }
    if (stage === 3) {
      resolveNtrContinue(3); // → L4 交配
      return;
    }
    if (stage === 4) {
      // 約一半 L4 → L5；無 L5 則內層會轉 L6 結局
      resolveNtrContinue(4);
      return;
    }
    if (stage === 5) {
      // L5 後進雙結局
      beginNtrL6Ending();
      return;
    }
    if (stage === 6) {
      applyNtrL6Outcome();
      return;
    }
    // 後備
    beginNtrL6Ending();
    return;
  }

  // 正常線 L3 結束
  if (stage >= 3) {
    toast("這一場約會到此結束", "good");
    endDateSession("date_chapter3_end");
    return;
  }

  // ── 正常 L1 之後：½ NTR／½ 正常 L2（一定會進其中一個，不再「直接散」）──
  if (stage === 1) {
    const br = rollDateL1Branch();
    console.info("[dateNtr] L1 分歧", br);
    log(`約會分歧：${br.goNtr ? "→ NTR 岔路" : "→ 正常第2章"}（骰 ${br.roll.toFixed(3)} / 門檻 ${br.ntrP}${br.force ? " force=" + br.force : ""}）`);
    // 必出 toast，方便你確認骰子有在跑
    toast(
      br.goNtr
        ? `🎲 岔路（${(br.roll * 100).toFixed(0)}% < ${(br.ntrP * 100).toFixed(0)}%）→ 其他召喚師`
        : `🎲 正常續（${(br.roll * 100).toFixed(0)}% ≥ ${(br.ntrP * 100).toFixed(0)}%）→ 第2章`,
      br.goNtr ? "bad" : "good",
    );
    if (br.force === "OFF") {
      toast("除錯：localStorage 把 NTR 關了（yoro_force_date_ntr=0）", "bad");
    }
    if (br.goNtr) {
      beginDateNtrStage1();
      return;
    }
    beginDateNormalChapter(2);
    return;
  }

  // 正常 L2 → ¼ 進 L3，否則散
  const next = stage + 1;
  const chance = Cards.dateContinueChance?.(next) ?? 0.25;
  if (Math.random() >= chance) {
    toast("氣氛剛好——就到這章", "");
    endDateSession("date_stop_after_l2");
    return;
  }
  beginDateNormalChapter(next);
}

/**
 * @param {string} reason
 * @param {{ skipNtrPenalty?: boolean, toastMsg?: string }} [opts]
 */
function endDateSession(reason = "date_end", opts = {}) {
  const sess = state.cardSession;
  const girl = sess?.girlId ? state.succubi.find(x => x.id === sess.girlId) : girlForSession();
  const track = sess?.dateChapter?.track || "normal";
  const ntrActive = sess?.mode === "date" && track === "ntr";

  // NTR 中途逃離／離開 → 推進她與召喚師關係一階
  if (ntrActive && !opts.skipNtrPenalty && isNtrPlayerAbortReason(reason)) {
    applyNtrLeavePenalty(girl, reason);
  }

  cardUi.datePick = false;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.lastPlay = null;
  cardUi.endPanel = null;
  voidCardPlayAiAndScene();
  if (state.cardSession) Cards.closeSession(state, reason);
  document.body.classList.remove("card-mode", "has-ct-figure");
  clearCardTableDom();
  const view = document.getElementById("card-table-view");
  if (view) view.classList.add("hidden");
  if (opts.toastMsg) toast(opts.toastMsg, "bad");
  else if (!ntrActive || opts.skipNtrPenalty) toast("約會到此散了", "");
  // NTR 中離：applyNtrLeavePenalty 已 toast
  else if (!isNtrPlayerAbortReason(reason)) toast("約會到此散了", "");
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
}

/** 用 state.cardDeck 開戰；回傳 startPlayRound 結果 */
function dealFromDeck(girl) {
  const stage = girl?.stage || "stranger";
  return Cards.startPlayRound(state, { stage, guardHigh: guardActive(girl) });
}

function deckKeyForNarr(state) {
  const deck = (Cards.getDeck?.(state) || state.cardDeck || []).slice().sort().join(",");
  return deck;
}

/**
 * 牌意演繹：寫「玩家這一拍的動作／話語／將做的事」。
 * 禁止妹子內心戲、情緒獨白、大段她的心理——頂多肢體接觸的客觀描述。
 */
function cardNarrMsgs(girl, def) {
  const you = state.settings?.player || "你";
  const kind = def?.kind || "speech";
  let kindRule = "寫玩家（第二人稱「你」）的動作、說出口的話、或正要做的事。";
  if (kind === "girl_trait") {
    kindRule = "這一張是「她外顯的舉動」（可觀察的動作／開口），用「她……」客觀描述外在行為，不要寫她心裡怎麼想。玩家是旁觀／被作用的一方。";
  } else if (kind === "venue_event") {
    kindRule = "寫現場發生的客觀事件與玩家當下的動作／處境，不要寫她的內心戲。";
  }
  return [
    {
      role: "system",
      content: [
        "你是卡牌遊戲的「玩家動作旁白」作者。",
        "輸出會直接顯示成：玩家打出這張牌時的場面字——代表玩家的行動，不是妹子的獨白。",
        "硬性規則：",
        "1. 只輸出繁體中文，3 到 4 句，句號結尾。",
        "2. " + kindRule,
        "3. 禁止：她的感想、恐懼、喜歡、內心獨白、大段心理、替她決定情緒標籤。",
        "4. 允許：玩家碰她時的客觀肢體（手放到哪、距離、說了哪類話的方向），用外部可觀察的寫法。",
        "5. 禁止照抄範例原文；用同一牌意重寫。不要 markdown、編號、引號包整段。",
        "6. 不要寫「她覺得／她心想／她暗自」。",
        "7. NSFW：可依牌意寫露骨動作（猥褻、解衣、性交），仍以「你對她做了什麼」為主，並寫清碰／插到她哪個部位。",
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `對象女子（被作用的身體）：${girl?.name || "她"}`,
        `關係距離（只影響你敢做多近，不要寫她的感受）：${girl?.stage || "stranger"}`,
        `玩家：${you}`,
        `卡牌：${def?.name || ""}（${kind}）`,
        `標籤：${(def?.tags || []).join("、") || "—"}`,
        `牌意（動作方向，重寫成你對她的行動，勿抄）：${def?.promptHint || def?.name || ""}`,
        `固定文參考（可參考動作，勿抄情緒）：${(def?.sceneStart || "").slice(0, 80)}`,
        "請只輸出 3～4 句「你對她做了什麼」旁白（部位與動作要具體）。",
      ].join("\n"),
    },
  ];
}

function narrFallbackText(def) {
  // 無模型：仍用加長固定句，至少能開戰
  return (def?.sceneStart || def?.name || "你靠近她，這一拍發生了什麼。").trim();
}

function narrFallbackReply(girl, def, actionText) {
  const line = Cards.girlReactionLine?.({
    stage: girl?.stage || "stranger",
    emotionDelta: 0,
    openFail: false,
    kind: def?.kind || "speech",
    sexPhase: def?.sexPhase || "",
  }) || "……嗯。";
  return String(line).trim() || "……";
}

function narrAllReady(sess) {
  return !!Cards.narrProgress?.(sess)?.ready;
}

/**
 * 準備時預產回話用的 prompt（不綁骰／開門；出卡例外再重產）。
 * 輸入：已備好的玩家動作旁白 + 人設。
 */
function cardReplyPrefetchMsgs(girl, def, actionText) {
  const scene = bindSceneToGirl(girl, actionText || narrFallbackText(def));
  const fakePlay = {
    ok: true,
    cardId: def?.id,
    name: def?.name || "",
    kind: def?.kind || "speech",
    sceneStart: scene,
    open: null,
    emotionDelta: 0,
    feelLabel: "",
    sexPhase: def?.sexPhase || "",
    sexTier: def?.sexTier || "",
  };
  return cardPlayMsgs(girl, fakePlay);
}

/**
 * 開戰前：每張卡先「玩家動作」再「妹子預回話」。
 * 全好之前 phase=narr_prep，不能 deal。
 */
function beginCardNarrPrep(girl) {
  const sess = state.cardSession;
  if (!sess || !girl) return;
  const ids = Cards.sessionCardIds?.(state) || [];
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  sess.phase = "narr_prep";
  sess.narrToken = token;
  sess.narrDeckKey = deckKeyForNarr(state);
  sess.cardNarr = {};
  for (const id of ids) {
    sess.cardNarr[id] = {
      status: "pending",
      text: "",
      reply: "",
      actionStatus: "pending",
      replyStatus: "pending",
    };
  }
  sess.log = sess.log || [];
  sess.log.push({ t: Date.now(), kind: "narr_prep_start", n: ids.length, withReply: true });

  if (!ids.length) {
    finishCardNarrPrep(girl, "empty");
    return;
  }

  // 無模型：動作固定句 + 罐頭回話
  if (!state.settings?.model) {
    for (const id of ids) {
      const def = Cards.cardById(id);
      const text = narrFallbackText(def);
      sess.cardNarr[id] = {
        status: "done",
        text,
        reply: narrFallbackReply(girl, def, text),
        actionStatus: "done",
        replyStatus: "done",
        from: "fallback",
        replyFrom: "canned",
      };
    }
    finishCardNarrPrep(girl, "fallback");
    return;
  }

  runCardNarrPrep(girl, token);
}

async function runCardNarrPrep(girl, token) {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "narr_prep" || sess.narrToken !== token) return;

  const ids = Object.keys(sess.cardNarr || {});
  // 未完成＝缺動作或缺回話
  const pending = ids.filter((id) => {
    const e = sess.cardNarr[id];
    if (!e) return false;
    if (e.status === "done" && e.text && e.reply) return false;
    return e.actionStatus === "pending" || e.replyStatus === "pending"
      || !e.text || !e.reply;
  });
  if (!pending.length) {
    if (narrAllReady(sess)) finishCardNarrPrep(girl, "done");
    return;
  }

  // 一次最多 2 張並行（每張內部：動作→回話）
  const batch = pending.slice(0, 2);
  await Promise.all(batch.map(id => genOneCardNarr(girl, id, token)));

  if (!state.cardSession || state.cardSession.narrToken !== token) return;
  const prog = Cards.narrProgress(state.cardSession);
  if (document.body.classList.contains("card-mode")) renderCardTable();
  else renderCrests();

  if (prog.ready) {
    finishCardNarrPrep(girl, "done");
  } else {
    runCardNarrPrep(girl, token);
  }
}

/** 單卡：先動作旁白，再用該旁白預產妹子回話 */
async function genOneCardNarr(girl, cardId, token) {
  const sess = state.cardSession;
  if (!sess || sess.narrToken !== token || !sess.cardNarr?.[cardId]) return;
  const entry = sess.cardNarr[cardId];
  if (entry.status === "done" && entry.text && entry.reply) return;

  const def = Cards.cardById(cardId);

  // ── A) 玩家動作 ──
  if (entry.actionStatus === "pending" || !entry.text) {
    entry.actionStatus = "pending";
    const key = `cardnarr:${girl.id}:${cardId}:${token}`;
    const deadline = Date.now() + 120000;
    let r = await genPost(key, cardNarrMsgs(girl, def), 9);
    let line = "";
    while (r && Date.now() < deadline) {
      if (state.cardSession?.narrToken !== token) return;
      if (r.status === "done" && r.result) {
        const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
        line = (text || "").trim();
        const parts = line.split(/(?<=[。！？])/).map(x => x.trim()).filter(Boolean);
        if (parts.length > 4) line = parts.slice(0, 4).join("");
        break;
      }
      if (r.status === "error") break;
      await new Promise(res => setTimeout(res, 700));
      r = await genPost(key, cardNarrMsgs(girl, def), 9);
    }
    if (Cards.isWeakLine?.(line) || line.length < 12) {
      line = narrFallbackText(def);
      entry.from = "fallback";
    } else {
      entry.from = "ai";
    }
    entry.text = line;
    entry.actionStatus = "done";
    dirty = true;
    scheduleSave();
    if (document.body.classList.contains("card-mode")) renderCardTable();
  }

  // ── B) 妹子預回話（吃剛寫好的動作）──
  if (entry.replyStatus === "pending" || !entry.reply) {
    entry.replyStatus = "pending";
    const action = entry.text || narrFallbackText(def);
    const rkey = `cardreply:${girl.id}:${cardId}:${token}`;
    const deadline = Date.now() + 120000;
    let r = await genPost(rkey, cardReplyPrefetchMsgs(girl, def, action), 10);
    let reply = "";
    while (r && Date.now() < deadline) {
      if (state.cardSession?.narrToken !== token) return;
      if (r.status === "done" && r.result) {
        const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
        reply = cardPlayLines(text) || String(text || "").trim();
        break;
      }
      if (r.status === "error") break;
      await new Promise(res => setTimeout(res, 700));
      r = await genPost(rkey, cardReplyPrefetchMsgs(girl, def, action), 10);
    }
    if (!reply || Cards.isWeakLine?.(reply) || reply.length < 2) {
      reply = narrFallbackReply(girl, def, action);
      entry.replyFrom = "canned";
    } else {
      entry.replyFrom = "ai";
    }
    entry.reply = reply;
    entry.replyStatus = "done";
    entry.status = "done";
    dirty = true;
    scheduleSave();
  } else {
    entry.status = "done";
  }
}

/**
 * 準備完成（動作＋預回話）→ narr_ready，等「開始打牌」。
 */
function finishCardNarrPrep(girl, why = "done") {
  const sess = state.cardSession;
  if (!sess || !girl) return;
  // 已開戰／已在待命 → 不要重跑
  if (sess.phase === "round_play" || sess.phase === "narr_ready") return;
  if (sess.phase !== "narr_prep" && why !== "empty") return;

  const prog = Cards.narrProgress?.(sess) || { done: 0, total: 0, ready: true };
  if (sess.phase === "narr_prep" && prog.total && !prog.ready) return;

  sess.phase = "narr_ready";
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  touchInteractDay(girl);
  syncPortraitCgCache(girl);
  ensureArtCacheBg(girl);
  document.body.classList.add("card-mode");
  const nAi = Object.values(sess.cardNarr || {}).filter(x => x.from === "ai").length;
  const nRep = Object.values(sess.cardNarr || {}).filter(x => x.replyFrom === "ai").length;
  log(`與 ${girl.name} 牌組備妥（${prog.done}/${prog.total}，動作AI ${nAi}，回話AI ${nRep}）——待開始`);
  toast("牌組準備好了（動作＋回話）——按「開始打牌」", "good");
  scheduleSave();
  renderAll();
}

/**
 * 出卡時能否直接用準備好的預回話。
 * 例外（須重產）：開門失敗、觸發做愛、大負分、正戲鏈、預產太弱。
 */
function canUsePrefetchReply(play, narr) {
  if (!play || !narr) return false;
  const reply = String(narr.reply || "").trim();
  if (!reply || Cards.isWeakLine?.(reply)) return false;
  if (play.open && play.open.success === false) return false;
  if (play.sexTriggered || play.sexScene || play.pendingSex) return false;
  const kind = play.kind || "";
  if (kind === "intercourse" || kind === "sex" || kind === "foreplay") return false;
  if ((play.emotionDelta ?? 0) <= -10) return false;
  return true;
}

/** 玩家確認後開戰：看板＝抽手牌；約會＝第1章固定打出基礎卡 */
function beginCardDealFromPrep(girl) {
  const sess = state.cardSession;
  if (!sess || !girl) return;
  if (!["narr_ready", "idle_present", "round_setup", "round_end"].includes(sess.phase)) {
    toast("現在不能開戰", "bad");
    return;
  }

  // 約會章節制：不進玩家牌桌，直接第1章
  if (sess.mode === "date" && sess.dateChapter) {
    cardUi.injectPick = [];
    cardUi.lastPlay = null;
    cardUi.handIdx = 0;
    cardUi.awaitReaction = false;
    cardUi.reactBeat = null;
    cardUi.endPanel = null;
    cardUi.datePick = false;
    touchInteractDay(girl);
    syncPortraitCgCache(girl);
    ensureArtCacheBg(girl);
    document.body.classList.add("card-mode");
    // 讓 sceneTextFor 吃得到 cardNarr
    sess.phase = "round_play";
    sess.nLeft = 1;
    toast("約會開始——第1章", "good");
    scheduleSave();
    startDateChapterOne();
    return;
  }

  const deal = dealFromDeck(girl);
  if (!deal.ok) {
    toast(deal.err || "開戰失敗", "bad");
    return;
  }
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  touchInteractDay(girl);
  syncPortraitCgCache(girl);
  ensureArtCacheBg(girl);
  document.body.classList.add("card-mode");
  toast(`開始——約 ${deal.nLeft} 輪互動`, "good");
  scheduleSave();
  renderAll();
}

/**
 * 開看板牌桌。
 * 新局：先 narr_prep（每張卡 AI 演繹 3～4 句）→ 全好才 deal。
 * 已在 round_play：直接繼續。
 */
function openKanbanTable(girlId, opts = {}) {
  if (!cardSystemOn()) { toast("卡牌系統未就緒", "bad"); return; }
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (!isKanban(girlId)) { toast("她不在店頭，先召喚為看板娘", "bad"); return; }
  if (s.summoner?.taken) { toast("她正被召喚走", "bad"); return; }
  if (Cards.sessionActive(state) && state.cardSession.girlId !== girlId) {
    // 別隻卡住：先恢復那一桌 UI，讓玩家能推出
    resumeOrRecoverCardSession({ forceUi: true, silent: true });
    const other = state.succubi.find(x => x.id === state.cardSession?.girlId);
    toast(`先結束與 ${other?.name || "另一人"} 的牌局（已打開；可按返回強制結束）`, "bad");
    renderCardTable();
    renderCrests();
    return;
  }

  // 既有 session
  if (Cards.sessionActive(state) && state.cardSession.girlId === girlId) {
    const phase = state.cardSession.phase;
    document.body.classList.add("card-mode");
    touchInteractDay(s);
    cacheGirlSnapOnSession(s);
    syncPortraitCgCache(s);
    ensureArtCacheBg(s);
    // 重整後進桌：清掉等生圖／等 AI 的記憶體鎖，避免永久卡「場景繪製中」
    resetCardUiEphemeral();
    if (Cards.sexNeedsChoice?.(state)) cardUi.sexChoice = true;
    cardUi.endPanel = null;

    if (phase === "narr_prep") {
      if (state.settings?.model && state.cardSession.narrToken) {
        runCardNarrPrep(s, state.cardSession.narrToken);
      }
      scheduleSave();
      renderCardTable();
      renderCrests();
      return;
    }

    // 演繹完、等玩家按開始——不要偷偷 deal
    if (phase === "narr_ready") {
      scheduleSave();
      renderCardTable();
      renderCrests();
      return;
    }

    if (phase === "round_play" && Cards.playsLeft(state.cardSession) > 0) {
      scheduleSave();
      renderCardTable();
      renderCrests();
      return;
    }

    // 新一輪：牌組沒變且演繹還在 → 回待命；否則重演繹（都不自動出牌）
    if (phase === "round_play" || phase === "idle_present" || phase === "round_setup"
      || phase === "round_end") {
      const dk = deckKeyForNarr(state);
      if (state.cardSession.narrDeckKey === dk && narrAllReady(state.cardSession)
        && state.cardSession.cardNarr) {
        state.cardSession.phase = "narr_ready";
      } else {
        beginCardNarrPrep(s);
      }
    }
    scheduleSave();
    renderCardTable();
    renderCrests();
    return;
  }

  // 新 session：本體卡 + 牌組 → 先演繹，不准直接打
  const girlCards = Cards.buildGirlCards(s, {
    cravingMidOrHigh: !!craveTier(s),
  });
  const r = Cards.openSession(state, { mode: "kanban", girlId, girlCards });
  if (!r.ok) { toast(r.err, "bad"); return; }
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.injectIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  touchInteractDay(s);
  syncPortraitCgCache(s);
  ensureArtCacheBg(s);
  cacheGirlSnapOnSession(s);
  document.body.classList.add("card-mode");
  log(`與 ${s.name} 準備牌組`);
  beginCardNarrPrep(s);
  scheduleSave();
  renderAll();
}

/**
 * 關掉牌桌 UI／session 共用收尾。
 * 硬規則：絕不從 state.succubi 刪人（結束打牌 ≠ 獻祭／離開名冊）。
 */
function teardownCardTableUi(reason = "card_end") {
  const sess = state.cardSession;
  const girlId = sess?.girlId || null;
  const mode = sess?.mode || "kanban";
  // 關閉前先抓名冊引用；關 session 後也必須還在
  const sBefore = girlId ? state.succubi.find(x => x.id === girlId) : null;
  const gname = sBefore?.name || state.cardSession?.girlSnap?.name || "她";
  const rosterCountBefore = (state.succubi || []).length;

  if (sess) Cards.closeSession(state, reason);
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  cardUi.sexChoice = false;
  voidCardPlayAiAndScene();
  document.body.classList.remove("card-mode", "has-ct-figure");
  clearCardTableDom();

  // 安全網：若有路徑誤刪名冊，立刻從 girlSnap 救回（不應發生）
  if (girlId && sBefore && !state.succubi.some(x => x.id === girlId)) {
    console.error("[card] roster mutation detected on teardown — restoring", girlId, reason);
    state.succubi.push(sBefore);
    log(`【修復】結束牌局時名冊被誤刪，已救回 ${gname}`);
  }
  if ((state.succubi || []).length < rosterCountBefore && girlId && sBefore) {
    // 若刪的是別人則不動；只保證這位還在
    if (!state.succubi.some(x => x.id === girlId)) state.succubi.push(sBefore);
  }

  return {
    gname,
    girlId,
    mode,
    stillInRoster: !!(girlId && state.succubi.some(x => x.id === girlId)),
  };
}

/**
 * 只關牌桌、不碰看板（約會散場用；看板不應走這條）。
 */
function endCardTableKeepKanban(reason = "card_end") {
  const r = teardownCardTableUi(reason);
  if (r.mode === "kanban" && r.girlId) {
    log(`${r.gname} 結束牌局（未解除看板·應改走 release）`);
  }
  return { ...r, released: false };
}

/**
 * 關牌桌並解除看板召喚（人回名冊，**不是刪除／不是獻祭**）。
 * 看板規格：打完牌／關桌 ＝ 這次召喚結束，不再是看板娘。
 * 約會 mode 只關 session。
 */
function endCardTableAndReleaseKanban(reason = "card_end") {
  const r = teardownCardTableUi(reason);
  let released = false;
  if (r.mode === "kanban" && r.girlId) {
    state.kanbans = (state.kanbans || []).filter(k => k.id !== r.girlId);
    state.lastKanbanId = r.girlId;
    log(`${r.gname} 結束牌局並解除看板（仍在名冊，可再召喚）`);
    released = true;
  }
  return { gname: r.gname, released, stillInRoster: r.stillInRoster };
}

/**
 * 中止／推出牌桌並解除看板。可選 confirm。
 * 名冊保留；不是獻祭。
 */
function ejectCardTable(reason = "player_eject", { skipConfirm = false, silent = false, toastMsg = "" } = {}) {
  if (!skipConfirm) {
    const ok = confirm(
      "結束牌局並解除看板召喚？\n\n"
      + "・她會回後台，主畫面看板會空\n"
      + "・名冊還在（不是獻祭、人沒刪）\n"
      + "・可再「召喚為看板娘」\n\n"
      + "取消＝繼續打牌。",
    );
    if (!ok) return false;
  }
  voidCardPlayAiAndScene();
  const r = endCardTableAndReleaseKanban(reason);
  if (!silent) {
    if (toastMsg) toast(toastMsg, "good");
    else if (r.released) toast(`${r.gname} 解除看板了——名冊還在，可再召喚`, "");
    else toast("先到這吧", "");
  }
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
  return true;
}

/**
 * 正常收工：關牌桌 + 解除看板召喚（預設路徑）。
 * 約會不會解看板（mode 不是 kanban）。
 */
function finishCardTableEndKanban(reason = "card_finish") {
  const r = endCardTableAndReleaseKanban(reason);
  if (r.released) {
    toast(`${r.gname} 牌局結束——已解除看板（名冊還在，可再召喚）`, "good");
  } else {
    toast("先到這吧", "");
  }
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
  return r;
}

/** @deprecated 舊名：結束牌局現在一律解除看板 */
function finishCardTableStayKanban(reason = "card_finish") {
  return finishCardTableEndKanban(reason);
}

/**
 * 左上角返回／結束。
 * 規格：看板模式結束牌局 ＝ 解除這次看板召喚（名冊保留）。
 */
function leaveCardTableUi() {
  if (cardUi.endPanel) {
    finishEndPanel("stop");
    return;
  }
  const sess = state.cardSession;
  if (!sess) {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    scheduleSave();
    renderAll();
    pumpKanbanBubbles();
    return;
  }

  const busy = !!(
    cardUi.awaitReaction
    || cardUi.sceneArtPending
    || cardUi.sexChoice
    || Cards.hasPendingSex?.(state)
    || Cards.sexNeedsChoice?.(state)
  );
  const midPlay = ["round_play", "round_setup", "round_end", "narr_prep", "narr_ready", "idle_present"].includes(sess.phase);
  const isDate = sess.mode === "date";

  if (busy || midPlay || cardUi.datePick) {
    const ntr = isDate && sess.dateChapter?.track === "ntr";
    const msg = isDate
      ? (ntr
        ? "結束這次約會？\n\n⚠ 岔路進行中——你若現在離開，她與那位召喚師的關係會推進一階。"
        : "結束這次約會？\n\n確定＝散場。")
      : "結束這次牌局？\n\n確定＝結束打牌並解除看板召喚。\n名冊還在，可再召喚為看板娘。";
    if (!confirm(msg)) return;
    if (isDate) {
      endDateSession(busy ? "player_abort_date" : "player_leave_date");
      return;
    }
    finishCardTableEndKanban(busy ? "player_abort" : "player_back_end");
    return;
  }
  if (isDate) {
    endDateSession("player_leave_date");
    return;
  }
  finishCardTableEndKanban("player_leave");
}

function dismissCardSession() {
  if (!state.cardSession) {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    renderAll();
    pumpKanbanBubbles();
    return;
  }
  const isDate = state.cardSession.mode === "date";
  const ntr = isDate && state.cardSession.dateChapter?.track === "ntr";
  if (cardUi.awaitReaction || cardUi.sceneArtPending || cardUi.sexChoice
    || Cards.hasPendingSex?.(state) || Cards.sexNeedsChoice?.(state)) {
    if (isDate) endDateSession("player_dismiss");
    else finishCardTableEndKanban("player_dismiss");
    return;
  }
  if (state.cardSession.phase === "round_play" || state.cardSession.phase === "round_setup") {
    const msg = isDate
      ? (ntr
        ? "結束這次約會？\n\n⚠ 岔路進行中——離開會推進她與那位召喚師的關係。"
        : "結束這次約會？")
      : "結束這次牌局？\n\n會解除看板召喚（名冊還在）。";
    if (confirm(msg)) {
      if (isDate) endDateSession("player_dismiss");
      else finishCardTableEndKanban("player_dismiss");
    }
    return;
  }
  if (isDate) endDateSession("player_dismiss");
  else finishCardTableEndKanban("player_dismiss");
}

function applyPlaySideEffects(girl, result) {
  if (!girl || !result?.ok) return;
  if (result.emotionDelta) {
    // 牌局感情（含猥褻大負分）：改數值即可，禁止觸發 checkBreak 刪名冊
    applyAffection(girl, result.emotionDelta, { skipBreak: true });
  }
  for (const eff of result.effects || []) {
    if (eff && typeof eff === "object") {
      if (eff.guardDelta && girl.stage === "stranger") {
        girl.guard ??= { hits: 0, cool: 0 };
        girl.guard.hits = (girl.guard.hits || 0) + eff.guardDelta;
        girl.guard.cool = Math.max(girl.guard.cool || 0, GUARD_COOL);
      }
      if (typeof eff.cravingDelta === "number") craveAdd(girl, eff.cravingDelta);
    }
  }
}

/** 碎卡確認後真正打出：有預回話則立刻開畫圖，否則現場產回話再畫 */
function commitHandPlay(instanceId, girl, stage) {
  // 連續出卡時呼叫端可能傳了過期 girl 參考——一律以 session 即時解析
  const g = girlForSession() || girl;
  if (!g) {
    toast("找不到這位看板娘（牌局人設斷線）", "bad");
    return;
  }
  cacheGirlSnapOnSession(g);
  const st = stage || g.stage || "stranger";
  const r = Cards.commitPlay(state, instanceId, { stage: st, guardHigh: guardActive(g) });
  if (!r.ok) { toast(r.err, "bad"); return; }
  // 出卡當下就把 [name]/[eye]/[breast]… 綁到這位看板娘（每張都重綁）
  r.sceneStart = bindSceneToGirl(g, r.sceneStart || Cards.sceneTextFor?.(state, r.cardId) || "");
  r._boundName = sessionGirlName(g);
  r.girlId = g.id;
  cardUi.lastPlay = r;
  cardUi.awaitReaction = true;
  cardUi.reactBeat = "action"; // 先讀動作文；回話可能已預產
  cardUi.endPanel = null;
  touchInteractDay(g);
  // 每次出卡強制重畫場景（不要直接顯示上次 cardCg）
  primeCardSceneArtOnPlay(g, r.cardId);
  applyPlaySideEffects(g, r);
  // 優先預回話 → 立刻畫圖；例外才現場 AI
  beginCardPlayAi(g, r);
  const n = state.cardSession?.hand?.length || 0;
  if (cardUi.handIdx >= n) cardUi.handIdx = Math.max(0, n - 1);
  scheduleSave(); renderCardTable();
}

/** 做愛演出上桌（前戲／正戲共用） */
function presentSexPlay(sx, girl, stage) {
  const g = girlForSession() || girl;
  if (!g) {
    toast("找不到這位看板娘（做愛鏈人設斷線）", "bad");
    return;
  }
  cacheGirlSnapOnSession(g);
  sx.sceneStart = bindSceneToGirl(g, sx.sceneStart || Cards.sceneTextFor?.(state, sx.cardId) || "");
  sx._boundName = sessionGirlName(g);
  sx.girlId = g.id;
  cardUi.lastPlay = sx;
  cardUi.awaitReaction = true;
  cardUi.reactBeat = "action";
  cardUi.endPanel = null;
  cardUi.sexChoice = false;
  touchInteractDay(g);
  primeCardSceneArtOnPlay(g, sx.cardId);
  applyPlaySideEffects(g, sx);
  beginCardPlayAi(g, sx);
  const tierNote =
    sx.sexEnd || sx.sexTier === "sex_act_l5" || sx.sexPhase === "player_climax" ? "收束"
      : sx.sexTier === "sex_act_l4" || sx.sexPhase === "climax" ? "她的高潮"
        : sx.kind === "intercourse" || (sx.sexTier || "").startsWith("sex_act") ? "正戲"
          : "前戲";
  let more = "";
  if (sx.sexEnd || sx.sexChainDone) more = " · 收束後結束牌局並解除看板";
  else if (sx.needSexChoice) more = " · 接著選前戲";
  else if (sx.sexBranch === "same") more = " · 同卡再來";
  else if (sx.sexBranch === "finish" || sx.sexBranch === "finish_fallback" || sx.sexBranch === "finish_cap") more = " · 將收束射精";
  else if (sx.sexChainNext) more = " · 還有下一幕";
  toast(`做愛${tierNote}：「${sx.name}」${more}`, "good");
  scheduleSave();
  renderCardTable();
}

/** 玩家點選前戲 */
function pickSexForeplay(cardId) {
  const girl = girlForSession();
  const stage = girl?.stage || "stranger";
  const sx = Cards.commitSexChoice?.(state, cardId, { stage, guardHigh: guardActive(girl) })
    || Cards.commitSexPlay(state, { stage, guardHigh: guardActive(girl), cardId });
  if (!sx?.ok) {
    toast(sx?.err || "無法選擇", "bad");
    return;
  }
  presentSexPlay(sx, girl, stage);
}

/**
 * 做愛鏈全部演完（高潮／收束看完）→ 結束牌局 + 解除看板。
 * 不再回到打牌；名冊保留（不是獻祭）。
 */
function afterSexEndAndReleaseKanban(girl, stage, last) {
  const sess = state.cardSession;
  if (sess) {
    sess.pendingSex = null;
    sess.forceAnotherRound = false;
  }
  cardUi.sexChoice = false;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.lastPlay = null;
  cardUi.endPanel = null;

  const gname = girl?.name || last?._boundName || "她";
  // 規則收束：跳過確認，直接結束＋解除看板（名冊保留）
  ejectCardTable("sex_climax_end", {
    skipConfirm: true,
    toastMsg: `${gname} 高潮收束——牌局結束，已解除看板（名冊還在，可再召喚）`,
  });
}

/** @deprecated 舊名：做愛結束不再回打牌 */
function afterSexReturnToCards(girl, stage, last) {
  afterSexEndAndReleaseKanban(girl, stage, last);
}

/** 看完出卡反應 → 若觸發做愛則接做愛卡；否則輪末或回手牌 */
function ackPlayReaction() {
  const sess = state.cardSession;
  const girl = girlForSession();
  const stage = girl?.stage || "stranger";
  const last = cardUi.lastPlay;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  voidCardPlayAi(); // 看完也作廢，避免遲到結果覆寫下一張
  if (!sess) {
    renderCardTable();
    return;
  }

  // 約會章節制：一章演完 → 骰下一章或結束（不走看板輪末）
  if (sess.mode === "date" && sess.dateChapter) {
    afterDateChapterBeat();
    return;
  }

  // 做愛：前戲 2 選 1 或正戲自動下一幕
  if (Cards.hasPendingSex?.(state)) {
    if (Cards.sexNeedsChoice?.(state)) {
      cardUi.sexChoice = true;
      cardUi.awaitReaction = false;
      toast("選擇前戲（2 選 1）", "");
      scheduleSave();
      renderCardTable();
      return;
    }
    const sx = Cards.commitSexPlay(state, { stage, guardHigh: guardActive(girl) });
    if (sx.needChoice) {
      cardUi.sexChoice = true;
      scheduleSave();
      renderCardTable();
      return;
    }
    if (sx.ok) {
      presentSexPlay(sx, girl, stage);
      return;
    }
    if (sx.err) toast(sx.err, "bad");
  }

  // 正戲／做愛鏈剛收束 → 結束牌局 + 解除看板（不回打牌）
  if (last?.sexScene && (last.sexEnd || last.sexChainDone)) {
    afterSexEndAndReleaseKanban(girl, stage, last);
    return;
  }

  // 輪數用完／可抽池空（或引擎已標 roundEnded）→ 進輪末，只做「能否再來一輪」
  if (last?.roundEnded || sess.phase === "round_end" || Cards.playsLeft(sess) <= 0) {
    if (sess.phase === "round_play") {
      const er = Cards.playerEndRound(state);
      if (!er.ok) { toast(er.err, "bad"); renderCardTable(); return; }
    }
    resolveRoundEndToPanel(girl, stage);
    return;
  }
  // 手牌空但還有輪數 → 嘗試再抽（容錯）
  if (!sess.hand?.length && Cards.playsLeft(sess) > 0 && Cards.drawHandV7) {
    Cards.drawHandV7(sess);
  }
  if (!sess.hand?.length) {
    if (sess.phase === "round_play") Cards.playerEndRound(state);
    resolveRoundEndToPanel(girl, stage);
    return;
  }
  scheduleSave();
  renderCardTable();
  // 不再 microtask 自動打妹子卡——改由「她出手」按鈕（避免準備完就連打）
}

/**
 * v7：手牌有妹子本體卡時由她出手（兩張皆妹子則引擎隨機選一）。
 * 必須玩家點「她出手」才 commit——禁止 silent auto-play。
 */
function maybeAutoPlayGirlCard() {
  if (cardUi.awaitReaction || cardUi.endPanel) return;
  if (!document.body.classList.contains("card-mode")) return;
  const sess = state.cardSession;
  if (!sess || sess.phase !== "round_play" || sess.pending) return;
  if (Cards.playsLeft(sess) <= 0) return;
  const pick = Cards.pickGirlAutoPlay?.(sess);
  if (!pick) return;
  const girl = girlForSession();
  if (!girl) return;
  const stage = girl.stage || "stranger";
  const def = Cards.cardById(pick.cardId);
  toast(`${girl.name} 出手「${def?.name || pick.cardId}」`, "");
  commitHandPlay(pick.instanceId, girl, stage);
}

/** 強制退出牌桌全螢幕（清 session／card-mode），避免主畫面被藏成空白 */
function exitCardModeFully(msg = "") {
  cardUi.endPanel = null;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.lastPlay = null;
  cardUi.injectPick = [];
  cardUi.handIdx = 0;
  voidCardPlayAiAndScene();
  if (state.cardSession) Cards.closeSession(state, "ui_exit");
  document.body.classList.remove("card-mode", "has-ct-figure");
  clearCardTableDom();
  const view = document.getElementById("card-table-view");
  if (view) view.classList.add("hidden");
  if (msg) toast(msg, "");
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
}

/**
 * 輪末判定：留下 → 下一輪組牌；不留下 → 看板顯示結束面板／約會直接散場退主畫面
 */
function resolveRoundEndToPanel(girl, stage) {
  const gname = girl?.name || "她";
  const mode = state.cardSession?.mode;
  const r = Cards.resolveRoundEnd(state, { stage });
  if (!r.ok) {
    toast(r.err || "結算失敗", "bad");
    scheduleSave();
    // session 可能已壞：寧可退主畫面也不要卡死
    if (!Cards.sessionActive(state)) exitCardModeFully(r.err || "牌局結束");
    else renderCardTable();
    return;
  }
  cardUi.injectPick = [];
  cardUi.handIdx = 0;
  cardUi.lastPlay = null;
  if (r.stay) {
    // 再來一輪：進待命，由玩家按「開始打牌」才 deal（不 silent 連打）
    cardUi.endPanel = null;
    if (state.cardSession) {
      if (narrAllReady(state.cardSession) && state.cardSession.cardNarr) {
        state.cardSession.phase = "narr_ready";
      } else {
        beginCardNarrPrep(girl);
        scheduleSave();
        renderCardTable();
        return;
      }
    }
    toast(`${gname} 還願意再來——按「開始打牌」`, "good");
    scheduleSave();
    renderCardTable();
    return;
  }
  // 約會 resolveRoundEnd 會直接 closeSession → sessionActive=false
  // 若仍留 card-mode，主 UI 被 visibility:hidden，牌桌又畫不出 → 一片空白
  if (r.closed || mode === "date" || !Cards.sessionActive(state)) {
    if (mode === "date" || r.closed) {
      exitCardModeFully("約會到此散了");
    } else {
      // 看板異常收尾：關桌並解除召喚
      finishCardTableEndKanban("round_end_recover");
    }
    return;
  }
  // 看板：session 仍在 idle_present，顯示結束牌局面板（結束＝解除看板）
  cardUi.endPanel = "leave";
  toast(`${gname} 這輪不想再打牌了——結束後會解除看板`, "good");
  scheduleSave();
  renderCardTable();
}

/** 輪末面板：再來一輪 → 牌組重開；結束 → 關牌桌並解除看板召喚 */
function finishEndPanel(choice) {
  const sess = state.cardSession;
  const girl = girlForSession();
  if (choice === "continue" && cardUi.endPanel === "stay") {
    cardUi.endPanel = null;
    cardUi.injectPick = [];
    cardUi.injectIdx = 0;
    if (sess) {
      if (narrAllReady(sess) && sess.cardNarr) sess.phase = "narr_ready";
      else if (girl) {
        beginCardNarrPrep(girl);
        scheduleSave();
        renderCardTable();
        return;
      }
    }
    toast("再來——按「開始打牌」", "good");
    scheduleSave();
    renderCardTable();
    return;
  }
  const mode = sess?.mode;
  if (!sess || !Cards.sessionActive(state)) {
    exitCardModeFully(mode === "date" ? "約會到此散了" : "先到這吧");
    return;
  }
  if (mode === "date") {
    endCardTableKeepKanban("round_end_leave");
    toast("約會到此散了", "");
    scheduleSave();
    renderAll();
    pumpKanbanBubbles();
    return;
  }
  // 看板：結束打牌 ＝ 結束這次看板召喚
  finishCardTableEndKanban("round_end_leave");
}

/** 長按看卡內容（標題卡本身不展開） */
function attachCardPeek(el, def, extraLines = []) {
  if (!el || !def) return;
  let timer = null, sx = 0, sy = 0;
  const clear = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const open = () => {
    clear();
    const tags = (def.tags || []).join(" · ");
    const bits = [
      def.kind === "erotic" ? "色情·用後消失" : (def.shatterOnUse ? "用後消失" : "可反覆使用"),
      def.kind === "erotic" ? "無條件可下一輪" : "",
      def.kind === "erotic" ? "機率觸發做愛" : "",
      def.openChain ? `開門 ${def.openChain.attr}×${def.openChain.k}` : "",
      def.effect?.forceAnotherRound && def.kind !== "erotic" ? "她這回走不了" : "",
      tags,
      ...extraLines,
    ].filter(Boolean);
    setCtConfirm(`
      <div class="card-peek">
        <div class="card-peek-name">${esc(def.name)}</div>
        <div class="card-peek-scene">${esc(
          (Cards.sceneTextFor?.(state, def.id) && state.cardSession?.cardNarr?.[def.id]?.status === "done"
            ? Cards.sceneTextFor(state, def.id)
            : null)
          || def.sceneStart || def.promptHint || "（沒有更多描述）"
        )}</div>
        ${bits.length ? `<div class="card-peek-meta dim small">${bits.map(b => esc(b)).join(" · ")}</div>` : ""}
        <button type="button" class="link-btn" id="ct-peek-close">關閉</button>
      </div>`);
    $("#ct-peek-close")?.addEventListener("click", () => setCtConfirm(""));
  };
  const onStart = (x, y) => {
    sx = x; sy = y;
    clear();
    timer = setTimeout(open, 420);
  };
  const onMove = (x, y) => {
    if (Math.abs(x - sx) > 10 || Math.abs(y - sy) > 10) clear();
  };
  el.addEventListener("touchstart", e => {
    const t = e.touches[0]; onStart(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener("touchmove", e => {
    const t = e.touches[0]; onMove(t.clientX, t.clientY);
  }, { passive: true });
  el.addEventListener("touchend", clear, { passive: true });
  el.addEventListener("touchcancel", clear, { passive: true });
  el.addEventListener("mousedown", e => onStart(e.clientX, e.clientY));
  el.addEventListener("mousemove", e => { if (timer) onMove(e.clientX, e.clientY); });
  el.addEventListener("mouseup", clear);
  el.addEventListener("mouseleave", clear);
  el.addEventListener("contextmenu", e => e.preventDefault());
}

/**
 * 牌桌立繪（M5）：同步取 cache／立繪／字首占位，**絕不 await GPU**。
 * opts.cardId — 出卡時優先該卡別名 CG
 */
function setCtPortrait(girl, opts = {}) {
  const img = $("#ct-portrait-img");
  const fb = $("#ct-portrait-fallback");
  const badge = $("#ct-portrait-badge");
  if (!img || !fb) return;
  // 呼叫端若傳 null，仍試 session 妹子（連續出卡中途別掉成「？」）
  const g = girl || girlForSession();
  const art = g
    ? resolveCardTableArt(g, { cardId: opts.cardId || null, prefer: opts.prefer || "half" })
    : { url: "", kind: "empty", weaving: false };
  const gname = sessionGirlName(g);

  if (art.url) {
    if (img.getAttribute("src") !== art.url) img.src = art.url;
    img.alt = gname;
    img.classList.remove("hidden");
    fb.classList.add("hidden");
    document.body.classList.add("has-ct-figure");
  } else {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("hidden");
    // 有名字用名字首字；沒妹子才用「她」，避免「？」像壞掉
    fb.textContent = (gname && gname !== "她" ? gname : "她").slice(0, 1);
    fb.classList.remove("hidden");
    document.body.classList.remove("has-ct-figure");
  }

  // 織夢／場景圖提示：有占位也能開戰，背景補圖
  if (badge) {
    const cardKey = opts.cardId ? `card:${opts.cardId}` : null;
    const scenePending = !!(g && cardKey && g.cardCg?.[cardKey]?.status === "pending");
    if (scenePending) {
      badge.textContent = "繪場景中…";
      badge.classList.remove("hidden");
    } else if (art.weaving || (g && portraitGenning.has(g.id) && !art.url)) {
      badge.textContent = "成形中…";
      badge.classList.remove("hidden");
    } else if (!art.url && g && canWeaveNow()) {
      badge.textContent = "尚無立繪";
      badge.classList.remove("hidden");
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
    }
  }
}

/** 中間旁白框。textHtml 有值時用 HTML（點點點讀取中） */
function setCtVn({ name = "", text = "", meta = "", textHtml = null } = {}) {
  const n = $("#ct-vn-name");
  const t = $("#ct-vn-text");
  const m = $("#ct-vn-meta");
  if (n) n.textContent = name;
  if (t) {
    if (textHtml != null) t.innerHTML = textHtml;
    else t.textContent = text;
  }
  if (m) m.innerHTML = meta;
}

/**
 * 牌桌頂欄。
 * 左鈕＝結束／返回（看板：結束＝解除召喚）；右上「推出」同義。
 */
function syncCardTableChrome({ ejectMode = false } = {}) {
  const back = $("#card-table-back");
  const close = $("#card-table-close");
  const busy = ejectMode
    || cardUi.awaitReaction
    || cardUi.sceneArtPending
    || cardUi.sexChoice
    || Cards.hasPendingSex?.(state)
    || Cards.sexNeedsChoice?.(state)
    || state.cardSession?.phase === "round_play";
  const isDate = state.cardSession?.mode === "date";
  if (back) {
    back.textContent = busy ? "結束" : "‹ 返回";
    back.title = isDate
      ? "結束約會"
      : "結束牌局並解除看板召喚（名冊還在）";
    back.classList.toggle("ct-eject-btn", !!busy);
  }
  if (close) {
    close.classList.remove("hidden");
    close.textContent = isDate ? "散了" : "推出";
    close.title = isDate
      ? "結束約會"
      : "結束牌局並解除看板（名冊還在，不是獻祭）";
  }
}

function setCtConfirm(html) {
  const el = $("#ct-confirm");
  if (!el) return;
  if (!html) {
    el.classList.add("hidden");
    el.innerHTML = "";
    return;
  }
  el.classList.remove("hidden");
  el.innerHTML = html;
}

function setCtHand(html) {
  const el = $("#ct-hand");
  if (el) el.innerHTML = html || "";
}

function clearCardTableDom() {
  setCtPortrait(null);
  setCtVn();
  setCtConfirm("");
  setCtHand("");
  document.body.classList.remove("has-ct-figure");
}

function renderCardTable() {
  const view = $("#card-table-view");
  if (!view) return;

  // 防呆：card-mode 開著但 session 已死（約會散場曾卡成全白）
  if (
    document.body.classList.contains("card-mode") &&
    !Cards.sessionActive(state) &&
    !cardUi.endPanel &&
    !cardUi.awaitReaction
  ) {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    view.classList.add("hidden");
    return;
  }

  const active = cardSystemOn() && Cards.sessionActive(state) && document.body.classList.contains("card-mode");
  view.classList.toggle("hidden", !active);
  if (!active) {
    clearCardTableDom();
    return;
  }

  const sess = state.cardSession;
  if (!sess) {
    // session 應存在卻沒有 → 退 card-mode
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    view.classList.add("hidden");
    return;
  }
  const girl = girlForSession();
  const gname = sessionGirlName(girl);
  const stage = girl?.stage || state.cardSession?.girlSnap?.stage || "stranger";
  if (girl && !girl._fromSnap) cacheGirlSnapOnSession(girl);
  const title = $("#card-table-title");

  // ── 做愛前戲 2 選 1 ────────────────────────────────────
  if ((cardUi.sexChoice || Cards.sexNeedsChoice?.(state)) && !cardUi.awaitReaction) {
    const opts = Cards.sexChoiceOptions?.(state) || [];
    if (title) title.textContent = `${gname} · 前戲 · 二選一`;
    syncCardTableChrome({ ejectMode: true });
    setCtPortrait(girl, { cardId: null });
    setCtVn({
      name: gname,
      text: `接下來要怎麼對${gname}？選一張前戲。`,
      meta: "前戲由你選 · 正戲之後系統決定",
    });
    if (!opts.length) {
      setCtHand(`<div class="dim small">沒有可選前戲</div>`);
      return;
    }
    setCtHand(`
      <div class="ct-sex-choice">
        <div class="dim small" style="margin-bottom:.5rem">點選一張進入前戲</div>
        <div class="ct-sex-choice-row">
          ${opts.map((def) => `
            <button type="button" class="ct-sex-choice-card" data-sex-pick="${esc(def.id)}">
              <span class="card-tag shatter erotic">前戲</span>
              <span class="ct-sex-choice-name">${esc(def.name || def.id)}</span>
              <span class="dim small">${esc((def.tokenDesc || def.token || def.promptHint || "").slice(0, 48))}</span>
            </button>`).join("")}
        </div>
      </div>`);
    setCtConfirm("");
    view.querySelectorAll("[data-sex-pick]").forEach((btn) => {
      btn.onclick = () => pickSexForeplay(btn.getAttribute("data-sex-pick"));
    });
    return;
  }

  if (title) {
    let place = "店頭";
    if (sess.mode === "date") {
      const vn = (Cards.venuesList?.() || []).find(x => x.id === sess.venueId);
      place = vn ? `約會・${vn.name}` : "約會";
    }
    title.textContent = `${gname} · ${place} · ${phaseLabel(sess.phase)}`;
  }

  // M5：反應節拍用該卡 cache／別名；否則半身立繪；無圖占位——不 await
  setCtPortrait(girl, {
    cardId: cardUi.awaitReaction && cardUi.lastPlay?.cardId
      ? cardUi.lastPlay.cardId
      : null,
    prefer: "half",
  });
  // 有碎卡確認或長按詳情時不要整頁清掉；本輪開始時清
  if (!sess.pending && !cardUi._keepPeek) setCtConfirm("");
  cardUi._keepPeek = false;

  // ── 開戰前：準備牌組（每張＝玩家動作＋妹子預回話）────────────────
  if (sess.phase === "narr_prep" || sess.phase === "narr_ready") {
    const prog = Cards.narrProgress?.(sess) || { done: 0, total: 0, actionDone: 0, replyDone: 0 };
    const ready = sess.phase === "narr_ready" || !!(prog.total && prog.ready);
    const isDatePrep = sess.mode === "date";
    // 每個點：· 等待 → ◐ 動作好 → ✓ 動作＋回話都好
    const dots = Object.keys(sess.cardNarr || {}).map((id) => {
      const e = sess.cardNarr[id] || {};
      const hasAct = !!(e.text && String(e.text).trim()) || e.actionStatus === "done";
      const hasRep = !!(e.reply && String(e.reply).trim()) || e.replyStatus === "done";
      if (hasAct && hasRep) {
        return `<span class="narr-dot ok" aria-label="動作與回話完成">✓</span>`;
      }
      if (hasAct) {
        return `<span class="narr-dot mid" aria-label="動作完成，回話中">◐</span>`;
      }
      return `<span class="narr-dot" aria-label="準備中">·</span>`;
    }).join("");
    if (title) title.textContent = ready ? (isDatePrep ? "約會準備完成" : "準備完成") : (isDatePrep ? "準備約會" : "準備牌組");
    syncCardTableChrome({ ejectMode: true });
    const prepMeta = ready
      ? (isDatePrep
        ? "按「開始約會」→ 第1章後：½ 正常第2章／½ 岔路（遇召喚師→繼續骰 L2 或被帶走）"
        : "動作＋回話都備好了。按「開始打牌」才抽手牌")
      : (prog.total
        ? `卡 ${prog.done}/${prog.total} · 動作 ${prog.actionDone || 0} · 回話 ${prog.replyDone || 0}`
        : "正在寫場面與她的回應…");
    setCtVn({
      name: "",
      text: ready ? (isDatePrep ? "約會章節備妥" : "牌組準備好了") : (isDatePrep ? "準備約會章節" : "準備牌組"),
      meta: prepMeta,
    });
    setCtHand(`
      <div class="ct-react-beat narr-prep-list">
        <div class="dim small" style="text-align:center;margin-bottom:.4em">
          ${ready
            ? (isDatePrep ? "第1章 → ½正常L2／½岔路（只能繼續；中離推進她與召喚師關係）" : "出卡時直接用預回話開畫圖（例外才重產）")
            : "每張：先場面，再她的回應"}
        </div>
        <div class="narr-dots" role="status">${dots || `<span class="narr-dot">·</span>`}</div>
        <div class="detail-actions card-actions">
          ${ready
            ? `<button type="button" class="cyan" id="ct-narr-start">${isDatePrep ? "開始約會" : "開始打牌"}</button>`
            : ""}
          <button type="button" id="ct-narr-leave">先離開</button>
        </div>
      </div>`);
    $("#ct-narr-start")?.addEventListener("click", () => {
      beginCardDealFromPrep(girl);
    });
    $("#ct-narr-leave")?.addEventListener("click", () => {
      if (isDatePrep) endDateSession("narr_abort_date");
      else finishCardTableStayKanban("narr_abort");
    });
    return;
  }

  // ── 約會章節：L2/L3 選下一幕 ────────────────────────────
  if (sess.mode === "date" && cardUi.datePick && sess.dateChapter?.pickOptions?.length) {
    const st = sess.dateChapter.stage || 2;
    const opts = sess.dateChapter.pickOptions;
    const range = Cards.dateChapterEmotion?.(st) || { min: 5, max: 10 };
    if (title) title.textContent = `${gname} · 約會第${st}章`;
    syncCardTableChrome({ ejectMode: true });
    setCtVn({
      name: gname,
      text: st === 2 ? "約會還能繼續——選下一幕" : "氣氛還在——選最後一章",
      meta: `${opts.length} 選 1 · 感情 ${range.min}～${range.max}`,
    });
    setCtHand(`
      <div class="detail-actions card-actions" style="flex-direction:column;gap:.45em;align-items:stretch">
        ${opts.map((id) => {
          const def = Cards.cardById(id);
          return `<button type="button" class="cyan" data-date-pick="${esc(id)}">${esc(def?.name || id)}</button>`;
        }).join("")}
        <button type="button" id="ct-date-end-now">就約到這</button>
      </div>`);
    setCtConfirm("");
    view.querySelectorAll("[data-date-pick]").forEach((btn) => {
      btn.onclick = () => pickDateChapterOption(btn.getAttribute("data-date-pick"));
    });
    $("#ct-date-end-now")?.addEventListener("click", () => endDateSession("date_player_stop_pick"));
    return;
  }

  // ── 出卡反應兩拍：①動作 → ②她的文字＋場景圖（圖好才能結束）──
  if (cardUi.awaitReaction && cardUi.lastPlay) {
    const last = cardUi.lastPlay;
    if (!cardUi.reactBeat) cardUi.reactBeat = "action";
    const waitingText = !!(cardUi.playAiPending && !last.fromAi && state.settings?.model);
    const waitingScene = isCardSceneArtWaiting(girl, last);
    // 回覆節拍：台詞或場景任一未好都算管線等待（擋結束／推出）
    const waitingPipe = waitingText || (cardUi.reactBeat === "reply" && waitingScene);

    syncCardTableChrome({ ejectMode: waitingPipe && cardUi.reactBeat === "reply" });

    // ① 動作旁白——台詞在背景生成
    if (cardUi.reactBeat === "action") {
      const beat = playActionBeat(last, girl);
      const textHint = waitingText ? " · 她正在想怎麼回…" : "";
      setCtVn({
        name: beat.speaker,
        text: beat.text,
        meta: `${beat.meta || ""}${textHint}`,
      });
      const vn = $("#ct-vn");
      if (vn) {
        vn.classList.add("ct-vn-tap");
        vn.onclick = () => advanceReactBeat();
      }
      setCtHand(`
        <div class="ct-react-beat">
          <div class="dim small ct-react-wait">${
            waitingText
              ? "她還在組織台詞——慢慢看完這段再點繼續"
              : "慢慢看完這段，再點繼續看她怎麼接"
          }</div>
          <div class="detail-actions card-actions">
            <button type="button" class="cyan" id="ct-ack-react">繼續</button>
          </div>
        </div>`);
      $("#ct-ack-react").onclick = () => advanceReactBeat();
      return;
    }

    // ② 回覆節拍：先等台詞；台詞好了可先看，但場景圖好了才能「繼續」結束
    const openNote = last.open && !last.open.success
      ? "沒接住"
      : last.open?.success
        ? "門開了"
        : "";
    const feel = last.feelLabel || Cards.emotionFeelLabel?.(last.emotionDelta) || "";
    const deltaTxt = `情感 ${last.emotionDelta >= 0 ? "+" : ""}${last.emotionDelta}${feel ? ` · ${feel}` : ""}`;
    const more = last.sexScene
      ? (last.sexChainNext
        ? (last.sexTier === "sex_act_l4" || last.sexPhase === "climax"
          ? "她的高潮——繼續後進入你的收束"
          : last.sexTier === "sex_act_l3" || last.sexPhase === "intercourse_intense"
            ? "激烈正戲——繼續後進入迎合高潮"
            : last.sexTier === "sex_act" || last.sexPhase === "intercourse"
              ? "正戲——繼續後進入更激烈 L3"
              : last.sexTier === "foreplay_l1"
                ? "前戲 L1——繼續後進入正戲"
                : "前戲——繼續後進入 L1")
        : last.sexEnd || last.sexChainDone || last.sexTier === "sex_act_l5" || last.sexPhase === "player_climax"
          ? "高潮收束——繼續後結束牌局並解除看板"
          : last.roundEnded
            ? "做愛場面結束——繼續後結算"
            : `做愛場面 · 之後還能互動 ${last.playsLeft ?? "?"} 輪`)
      : last.forceAnotherRound && last.roundEnded
        ? (last.erotic || last.kind === "erotic"
          ? "色情卡：這輪必留下——繼續後無條件再來"
          : "她這回走不了——繼續後無條件再來")
        : last.roundEnded
          ? "這是最後一輪互動——繼續後判定她願不願意再來"
          : `之後還能互動 ${last.playsLeft ?? "?"} 輪`;
    const sexNote = last.sexScene
      ? (last.sexTier === "sex_act_l5" || last.sexPhase === "player_climax" || last.sexEnd ? " · 你的高潮"
        : last.sexTier === "sex_act_l4" || last.sexPhase === "climax" ? " · 她的高潮"
          : last.sexTier === "sex_act_l3" || last.sexPhase === "intercourse_intense" ? " · 正戲L3"
            : last.sexTier === "sex_act" || last.sexPhase === "intercourse" ? " · 正戲"
              : last.sexTier === "foreplay_l1" ? " · 前戲L1"
                : " · 前戲")
      : (last.sexTriggered ? " · 觸發做愛（下一幕）" : "");

    if (waitingText) {
      setCtVn({
        name: gname,
        text: "",
        textHtml: `<span class="ct-typing" aria-label="她正在讀取"><i></i><i></i><i></i></span>`,
        meta: `${esc(deltaTxt)}${openNote ? ` · ${openNote}` : ""} · 她正在讀取…`,
      });
      const vnW = $("#ct-vn");
      if (vnW) {
        vnW.classList.remove("ct-vn-tap");
        vnW.onclick = null;
      }
      setCtHand(`
        <div class="ct-react-beat">
          <div class="dim small ct-react-you">剛才：${esc(last.name || "")}</div>
          <div class="dim small ct-react-wait">等她開口——左上角可「結束」（看板會解除）</div>
        </div>`);
      return;
    }

    let showLine = last.girlLine || "";
    if (Cards.isWeakLine?.(showLine)) {
      const defShow = last.cardId ? Cards.cardById(last.cardId) : null;
      showLine = Cards.girlReactionLine({
        stage: girl?.stage || "stranger",
        emotionDelta: last.emotionDelta || 0,
        openFail: !!(last.open && last.open.success === false),
        kind: defShow?.kind || last.kind || "",
        sexPhase: last.sexPhase || defShow?.sexPhase || "",
      });
      applyPlayReact(last, showLine);
      showLine = last.girlLine;
    }
    // 畫圖用的表情／動作可選顯示在 meta，主框只放對話
    const pose = last.visualPose;
    const poseNote = pose
      ? ` · 繪：${pose.face}/${pose.body}`
      : "";
    const srcNote = last.fromPrefetch
      ? " · 預產"
      : last.fromAi
        ? ""
        : (state.settings?.model ? " · 保底" : "");
    const sceneNote = waitingScene ? " · 場景繪製中…" : "";
    setCtVn({
      name: gname,
      text: showLine || "……",
      meta: `${esc(deltaTxt)}${openNote ? ` · ${openNote}` : ""}${last.shattered ? " · 卡消了" : ""}${sexNote}${srcNote}${poseNote}${sceneNote} · ${esc(more)}`,
    });
    const vn2 = $("#ct-vn");
    if (vn2) {
      if (waitingScene) {
        // 圖沒好：不能點旁白跳過
        vn2.classList.remove("ct-vn-tap");
        vn2.onclick = null;
      } else {
        vn2.classList.add("ct-vn-tap");
        vn2.onclick = () => advanceReactBeat();
      }
    }
    setCtHand(`
      <div class="ct-react-beat">
        <div class="dim small ct-react-you">剛才：${esc(last.name || "")}</div>
        <div class="dim small ct-react-wait">${
          waitingScene
            ? "場景還在畫——畫完才能繼續（可先看台詞）"
            : ""
        }</div>
        <div class="detail-actions card-actions">
          <button type="button" class="cyan" id="ct-ack-react"
            ${waitingScene ? "disabled aria-disabled=\"true\"" : ""}>${
            waitingScene
              ? "場景繪製中…"
              : (last.sexScene && (last.sexEnd || last.sexChainDone
                || last.sexTier === "sex_act_l5" || last.sexPhase === "player_climax")
                ? "結束（收束·解除看板）"
                : last.roundEnded
                  ? (last.forceAnotherRound ? "繼續（必留下）" : "繼續（輪末判定）")
                  : "繼續")
          }</button>
        </div>
      </div>`);
    const ackBtn = $("#ct-ack-react");
    if (ackBtn && !waitingScene) {
      ackBtn.onclick = () => advanceReactBeat();
    } else if (ackBtn && waitingScene) {
      ackBtn.onclick = () => toast("場景還在畫，畫完才能繼續", "");
    }
    return;
  }

  // 非反應節拍：對話框不要留 click
  {
    const vn = $("#ct-vn");
    if (vn) {
      vn.classList.remove("ct-vn-tap");
      vn.onclick = null;
    }
  }

  // 舊存檔卡在 pregen/ready → 正規成 round_play
  Cards.normalizeSessionPhase?.(sess);

  syncCardTableChrome({ ejectMode: false });

  // ── 輪末結果面板：只問「能否再來一輪」；結束＝關桌並解除看板 ──
  if (cardUi.endPanel === "stay" || cardUi.endPanel === "leave") {
    const stay = cardUi.endPanel === "stay";
    setCtVn({
      name: gname,
      text: stay
        ? `這輪結束了。${gname} 還願意再來一輪。`
        : `這輪結束了。${gname} 不想再繼續了。`,
      meta: stay
        ? "再來一輪會重新組牌、重新計出手次數"
        : (sess.mode === "date"
          ? "約會到此散了"
          : "結束牌局＝解除這次看板召喚（名冊還在，可再召喚）"),
    });
    setCtHand(`
      <div class="detail-actions card-actions">
        ${stay
          ? `<button type="button" class="cyan" id="ct-end-continue">再來一輪</button>
             <button type="button" id="ct-end-stop">結束牌局</button>`
          : `<button type="button" class="cyan" id="ct-end-stop">結束牌局（解除看板）</button>`}
      </div>`);
    $("#ct-end-continue")?.addEventListener("click", () => finishEndPanel("continue"));
    $("#ct-end-stop")?.addEventListener("click", () => finishEndPanel("stop"));
    return;
  }

  // ── 輪末：若沒反應佇列、直接進來 → 做判定進面板 ────────
  if (sess.phase === "round_end") {
    setCtVn({ name: gname, text: "……", meta: "這輪結束，看她還願不願意再來" });
    setCtHand(`<div class="dim small ct-empty">判定中……</div>`);
    setTimeout(() => resolveRoundEndToPanel(girl, stage), 0);
    return;
  }

  // ── 陪伴／舊 round_setup：提示開始，不要 silent deal ────────────
  if (sess.phase === "idle_present" || sess.phase === "round_setup") {
    cardUi.endPanel = null;
    setCtVn({
      name: gname,
      text: "要開始這輪互動嗎？",
      meta: "會用商店出戰牌組抽牌（不會自動出牌）",
    });
    setCtHand(`
      <div class="detail-actions card-actions">
        <button type="button" class="cyan" id="ct-retry-deal">開始打牌</button>
        <button type="button" id="ct-dismiss">結束並離開</button>
      </div>`);
    $("#ct-retry-deal").onclick = () => beginCardDealFromPrep(girl);
    $("#ct-dismiss").onclick = () => dismissCardSession();
    return;
  }

  // ── 互動中：每輪出示 2 張，打 1 張（v7）────────────────
  if (sess.phase === "round_play") {
    const left = Cards.playsLeft(sess);
    const chain = sess.chain;
    const chainTxt = chain
      ? `節奏正熱（${chain.attr}）`
      : "";
    const hand = sess.hand || [];
    const girlPick = (!sess.pending && Cards.playsLeft(sess) > 0)
      ? Cards.pickGirlAutoPlay?.(sess)
      : null;

    setCtVn({
      name: gname,
      text: girlPick
        ? "她要先動——按「她出手」才會打出（不會自動連打）"
        : "左右滑挑選，上滑用出去。長按看內容。",
      meta: `還能互動 <b>${left}</b> 輪 · 本輪 ${hand.length}/2 張${chainTxt ? ` · <span class="chain-hint">${esc(chainTxt)}</span>` : ""}`,
    });

    if (sess.pending) {
      const pinst = hand.find(h => h.instanceId === sess.pending.instanceId);
      const pd = pinst ? Cards.cardById(pinst.cardId) : null;
      const eroticHint = pd?.kind === "erotic"
        ? `<p class="dim small">色情卡：用後消失 · 無條件可下一輪 · 有機率觸發做愛</p>`
        : "";
      setCtConfirm(`
        <div class="card-confirm">
          <p>真的要用「${esc(pd?.name || "?")}」？<b class="bad">用後消失</b></p>
          ${eroticHint}
          <div class="detail-actions">
            <button type="button" class="danger-btn" id="ct-confirm-play">確認</button>
            <button type="button" id="ct-cancel-play">取消</button>
          </div>
        </div>`);
      $("#ct-confirm-play")?.addEventListener("click", () => {
        const iid = sess.pending?.instanceId;
        if (!iid) return;
        commitHandPlay(iid, girl, stage);
      });
      $("#ct-cancel-play")?.addEventListener("click", () => {
        Cards.cancelPending(state);
        renderCardTable();
      });
    }

    if (!hand.length) {
      setCtHand(`
        <div class="dim small ct-empty">可抽池空了——無法再抽</div>
        <div class="detail-actions card-actions">
          <button type="button" id="ct-end-round">結束互動</button>
        </div>`);
    } else if (girlPick) {
      // 妹子卡：必須按按鈕才出，禁止 microtask 自動 commit
      const defG = Cards.cardById(girlPick.cardId);
      setCtHand(`
        <div class="ct-card-wrap">
          <div class="ct-play-card compact is-selected is-girl" id="ct-play-card">
            <div class="ct-pc-body">${esc(defG?.name || girlPick.cardId)} · 她</div>
          </div>
        </div>
        <div class="dim small ct-card-nav">本輪她先動（不用上滑）</div>
        <div class="detail-actions card-actions">
          <button type="button" class="cyan" id="ct-girl-play">她出手</button>
          <button type="button" id="ct-end-round">結束互動</button>
        </div>`);
      $("#ct-girl-play")?.addEventListener("click", () => maybeAutoPlayGirlCard());
    } else {
      cardUi.handIdx = Math.min(Math.max(0, cardUi.handIdx || 0), hand.length - 1);
      const inst = hand[cardUi.handIdx];
      const def = Cards.cardById(inst.cardId);
      const check = Cards.canSelectCard(sess, inst, stage);
      const blocked = !check.ok || !!sess.pending;
      const isGirl = inst.source === "girl";
      const srcCls = isGirl
        ? "is-girl"
        : (def?.kind === "erotic" ? "is-shatter is-erotic" : (def?.shatterOnUse ? "is-shatter" : "is-speech"));

      setCtHand(`
        <div class="ct-card-wrap">
          <div class="ct-play-card compact is-selected ${srcCls}${blocked ? " is-blocked" : ""}"
               id="ct-play-card" data-iid="${inst.instanceId}">
            <div class="ct-pc-body">${esc(def?.name || inst.cardId)}${isGirl ? " · 她" : ""}</div>
            <div class="swind"></div>
          </div>
        </div>
        <div class="ct-card-dots">${hand.map((_, i) =>
          `<div class="dot${i === cardUi.handIdx ? " on" : ""}"></div>`).join("")}</div>
        <div class="ct-card-nav dim small">${cardUi.handIdx + 1}/${hand.length} · 上滑使用 · 長按內容</div>
        <div class="detail-actions card-actions">
          <button type="button" id="ct-end-round">結束互動</button>
        </div>`);

      const playCard = $("#ct-play-card");
      const navHand = dir => {
        const n = hand.length;
        if (n <= 1) return;
        cardUi.handIdx = (cardUi.handIdx + dir + n) % n;
        renderCardTable();
      };
      const doPlay = () => {
        if (sess.pending) return;
        if (!check.ok) { toast(check.err || "現在用不了", "bad"); return; }
        const r = Cards.requestPlay(state, inst.instanceId, { stage, guardHigh: guardActive(girl) });
        if (!r.ok) { toast(r.err, "bad"); return; }
        if (r.needConfirm) { renderCardTable(); return; }
        // 出卡當下立刻開場景圖（不要等飛牌動畫結束才 begin）
        if (r.sceneStart && girl) {
          r.sceneStart = Cards.resolveCardBinds?.(
            r.sceneStart,
            Cards.bindContextFromGirl?.(girl, playerBindName()),
          ) || r.sceneStart;
          r._boundName = girl.name;
        }
        cardUi.lastPlay = r;
        cardUi.awaitReaction = true;
        cardUi.reactBeat = "action";
        cardUi.endPanel = null;
        touchInteractDay(girl);
        // 每次出卡強制重畫場景（不要直接顯示上次 cardCg）
        primeCardSceneArtOnPlay(girl, r.cardId);
        applyPlaySideEffects(girl, r);
        beginCardPlayAi(girl, r);
        const n = state.cardSession?.hand?.length || 0;
        if (cardUi.handIdx >= n) cardUi.handIdx = Math.max(0, n - 1);
        scheduleSave();
        flyCard(playCard, "up", () => {
          renderCardTable();
        });
      };
      if (playCard && !sess.pending) {
        swipeable(playCard, {
          left: () => navHand(1),
          right: () => navHand(-1),
          up: doPlay,
        });
        attachCardPeek(playCard, def, !check.ok ? [check.err] : []);
      }
    }

    $("#ct-end-round").onclick = () => {
      // 主動結束本輪 → 輪末判定（能否再來一輪）
      Cards.playerEndRound(state);
      cardUi.awaitReaction = false;
      resolveRoundEndToPanel(girl, stage);
    };
    return;
  }
}

function phaseLabel(p) {
  const sess = state.cardSession;
  if (sess?.mode === "date" && sess.dateChapter?.track === "ntr") {
    const rn = sess.dateChapter.rivalName || "其他召喚師";
    return `約會岔路·${rn}`;
  }
  if (sess?.mode === "date" && sess.dateChapter?.stage) {
    return `約會第${sess.dateChapter.stage}章`;
  }
  if (sess?.mode === "date" && cardUi.datePick) return "選下一幕";
  return ({
    idle_present: "陪伴",
    round_setup: "組牌",
    narr_prep: "準備牌組",
    narr_ready: "待開始",
    round_play: "互動中",
    round_end: "……",
    summoning_prep: "成形中",
    closed: "結束",
  })[p] || p || "";
}

function renderCardSystem() {
  renderStarterModal();
  // 若 session 還在但 UI 被關掉，不強制打開
  if (document.body.classList.contains("card-mode")) {
    // session 已死卻仍 card-mode → 清掉，恢復主畫面
    if (!Cards.sessionActive(state) && !cardUi.endPanel && !cardUi.awaitReaction) {
      document.body.classList.remove("card-mode", "has-ct-figure");
      clearCardTableDom();
      const view = $("#card-table-view");
      if (view) view.classList.add("hidden");
      return;
    }
    renderCardTable();
  } else {
    const view = $("#card-table-view");
    if (view) view.classList.add("hidden");
    clearCardTableDom();
  }
}

// 玩家屬性面板(商店底部):金幣、名額、擴充(擴充系統將於後續階段填入)
function renderPlayerAttrs() {
  const el = $("#player-attrs");
  if (!el) return;
  const derived = [
    ["金幣", `${state.gold} 金`],
    ["名冊名額", `${state.succubi.length} / ${rosterCap()}`],
    ["執行中格數", `${execCap()} 格`],
    ["完成金額", `${1 + expLv("reward")}~${3 + expLv("reward")} 金`],
    ["商店祭品", `每日 ${2 + expLv("offering")} 人`],
    ["淫紋機率(每次委託操作)", kanbanSuccubi().map(s => `${s.name} ${Math.round(crestChance(s) * 100)}%`).join("、") || "(沒有看板娘)"],
  ];
  // 看板娘時長刻意不顯示——玩家無法得知她何時解除,需自行察看
  const lvs = Object.keys(EXPANSIONS).filter(k => k !== "kanban").map(k => `${EXPANSIONS[k]} Lv${expLv(k)}`).join("、");
  el.innerHTML =
    derived.map(([a, b]) => `<div class="setting-row"><label>${a}</label><span>${b}</span></div>`).join("") +
    `<div class="setting-row"><label>擴充等級</label><span class="dim" style="text-align:right">${lvs}</span></div>`;
}

// 聊天插播層:蓋在所有分頁之上,只有「結束對話」能退出
// 聊天畫面的她:名字旁的小頭像(head)+ 對話框上方的立繪(half,已去背)。
// 沒有(舊存檔、還沒織完)就整個藏起來,不留破圖框。
function vnFace(s) {
  const face = $("#vn-face");
  if (face) {
    const url = s ? girlShot(s, "head") : "";
    face.classList.toggle("hidden", !url);
    if (url && face.getAttribute("src") !== url) face.src = url;
    face.alt = s?.name || "";
  }
  const fig = $("#vn-figure");
  if (fig) {
    // 立繪只認 half:head 是方形大頭照,拉大當立繪只會變成一顆浮在半空的頭
    const url = s?.portraits?.half || "";
    fig.classList.toggle("hidden", !url);
    if (url && fig.getAttribute("src") !== url) fig.src = url;
    fig.alt = s?.name || "";
    // 有立繪時背景那尊看板娘要讓位,不然同一個人站兩次
    document.body.classList.toggle("has-figure", !!url);
  }
}

function renderChatView() {
  const chatV = $("#chat-view");
  const inputRow = $("#chat-input-row");
  const watchCtl = $("#watch-controls");
  const sacCtl = $("#sac-controls");

  const ssacCtl = $("#ssac-controls");
  // 召喚獻祭最優先
  if (sacSummon) {
    chatV.classList.remove("hidden");
    inputRow?.classList.add("hidden");
    watchCtl?.classList.add("hidden");
    sacCtl?.classList.add("hidden");
    ssacCtl?.classList.remove("hidden");
    $("#chat-title").textContent = `召喚獻祭(已獻 ${sacSummon.count} 人)`;
      vnFace(null);
    return;
  }
  ssacCtl?.classList.add("hidden");

  // 魅魔獻祭
  if (sacrificeWith) {
    chatV.classList.remove("hidden");
    inputRow?.classList.add("hidden");
    watchCtl?.classList.add("hidden");
    sacCtl?.classList.remove("hidden");
    $("#chat-title").textContent = sacSession
      ? `獻祭儀式:${sacSession.name}${sacSession.idx ? `(${sacSession.idx}/6)` : "(準備中)"}`
      : "獻祭儀式";
    vnFace(null);
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
      vnFace(null);
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
      vnFace(cs);
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
      <div class="thumb">${girlPortrait(s, 2.5, "head")}</div>
      <div class="sinfo">
        <div class="sname"><b>${esc(s.name)}</b><span class="rbadge">${s.rarity}</span>
          <span class="stage-chip">${s.ntr ? "被奪走" : stageLabel(s.stage)}</span>
          ${!s.ntr && s.summoner?.taken ? `<span class="stage-chip" style="color:var(--red)">→ 被召喚走</span>`
            : isKanban(s.id) ? `<span class="stage-chip" style="color:var(--gold)">★ 在店頭</span>` : ""}
          ${s.summoner && !s.ntr ? `<span class="stage-chip" style="color:var(--red)">⚠ ${esc(summonerById(s.summoner.id)?.name || "被纏上")}${s.summoner.ringUnlocked ? "・已解環" : ""}</span>` : ""}</div>
        <div class="aff-bar"><div class="${s.affection < 0 ? "neg" : ""}" style="width:${barW}%"></div></div>
      </div>
      <div class="status-dot ${st}"></div>`;
    el.onclick = () => { detailId = s.id; dateChooser = false; dateFlow = null; severChooser = false; renderAll(); };
    roster.appendChild(el);
  }
  if (!state.succubi.length) roster.innerHTML = `<div class="empty">一個魅魔都沒有。桌上只有那本召喚之書。</div>`;

  document.querySelector("#roster-panel h2").textContent = `魅魔名冊(${state.succubi.length}/${rosterCap()})`;
  const hint = $("#summon-hint");
  const counts = $("#summon-counts");
  const full = state.succubi.length >= rosterCap();
  hint.textContent = state.gold < 0 ? "負債中不可召喚"
    : full ? `名冊名額已滿(${rosterCap()} 格)——靠擴充增加名額`
    : `地牢裡有 ${state.dungeon.length} 名祭品(獻越多、稀有度越高)`;
  counts.innerHTML = "";
  const b = document.createElement("button");
  b.id = "start-summon";
  b.textContent = "開始獻祭召喚";
  b.disabled = !canSummon();
  b.onclick = () => startSummonSacrifice();
  counts.appendChild(b);
}

function renderDetail(s, root) {
  const asleep = isAsleep();
  const st = needStatus(s);
  const ns = nextStage(s);
  const today = dayNum();
  const datesLeft = datesLeftToday(s);
  // 電話鈕文案：被召喚 → 窺視（不限次）；沒被召喚 → 約會（顯示今日剩餘）
  const takenAway = isSummonerTaken(s);
  let dateBtnLabel;
  if (takenAway) {
    dateBtnLabel = "電話（窺視）";
  } else if (cardSystemOn()) {
    dateBtnLabel = datesLeft > 0 ? `電話（今剩 ${datesLeft}）` : "電話（今日已滿）";
  } else {
    dateBtnLabel = datesLeft > 0 ? `約會（今剩 ${datesLeft}）` : "約會（今日已滿）";
  }

  let needLine;
  if (s.ntr) {
    needLine = `<div class="ntr-note">她被另一位召喚師奪走了。剩 ${s.ntr.deadlineDay - today} 天可贖回(${RANSOM[s.stage]} 金)</div>`;
  } else {
    const interactWord = freeChatRetired() ? "靠近／互動" : "聊";
    const bits = [`每 ${CHAT_GAP[s.rarity]} 天至少${interactWord} 1 次`];
    if (DATE_GAP[s.rarity]) bits.push(`每 ${DATE_GAP[s.rarity]} 天至少約會 1 次`);
    if (!takenAway) bits.push(`約會一天最多 ${dateLimitPerDay()} 次（今剩 ${datesLeft}）`);
    const stTxt = { ok: "心情不錯", due: "今天想見你", danger: "快要離開了!" }[st];
    needLine = `<div class="aff-line dim small">${bits.join(" / ")} — ${stTxt}</div>`;
  }
  // 被別的召喚師纏上:名字 + 關係階段；被帶走時提示打電話窺視
  let summonerLine = "";
  if (s.summoner && !s.ntr) {
    const su = summonerById(s.summoner.id);
    const nm = su?.name || "召喚師";
    const em = su?.emoji ? `${su.emoji} ` : "";
    const takenNote = takenAway
      ? `<div class="summoner-note" style="opacity:.9">📞 被帶走中——可一直打電話（1/5 接通）；只播已有片段，沒了會說在忙。不佔約會次數。</div>`
      : "";
    summonerLine = `<div class="summoner-note">⚠ ${em}<b>${esc(nm)}</b> · ${esc(rivalStageName(s.summoner.stage ?? 0))}</div>${takenNote}`;
  }

  // 破除纏身:獻祭一名祭品 → ≥2 人被纏則隨機解一人;僅 1 人則 1/3(機率不對玩家顯示)
  const entangledOthers = state.succubi.filter(x => x.id !== s.id && x.summoner && !x.ntr);
  const anyEntangled = !!(s.summoner && !s.ntr) || entangledOthers.length > 0;
  const severOffers = anyEntangled
    ? state.succubi.filter(x => !x.ntr && canSacrifice(x) && (
        state.succubi.some(y => y.id !== x.id && y.summoner && !y.ntr)
      ))
    : [];
  const severFee = dismissPriceToday();
  const entangledCount = state.succubi.filter(x => x.summoner && !x.ntr).length;
  let severBlock = "";
  if (anyEntangled && !severOffers.length) {
    severBlock = entangledCount ? "需要可獻祭的祭品" : "沒有被纏住的魅魔";
  }

  root.className = `r-${s.rarity}`;
  root.innerHTML = `
    <div class="panel">
      <button class="back-btn" id="detail-back">‹ 名冊</button>
      <div class="portrait">${girlPortrait(s, 6, "half")}</div>
      <div class="aff-line">
        <b>${esc(s.name)}</b> <span class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</span>
        ・${s.ntr ? "被奪走" : stageLabel(s.stage)}
      </div>
      ${s.backstory ? `<div class="aff-line dim small" style="max-width:32em;margin:0 auto">${esc(s.backstory)}</div>` : ""}
      ${s.schedule ? `<div class="schedule">${SCHEDULE_SLOTS.map(k => {
        const now = timeSlot() === k;
        return `<div class="sch-row${now ? " now" : ""}"><span class="sch-t">${SLOT_LABEL[k]}</span><span>${esc(s.schedule[k])}</span></div>`;
      }).join("")}</div>` : ""}
      <div class="aff-line">情感 <b>${s.affection}</b>${ns && !s.ntr ? ` <span class="dim small">/ ${ns[2]} 升【${ns[1]}】</span>` : ""}</div>
      ${!s.ntr ? craveLine(s) : ""}
      ${needLine}
      ${summonerLine}
      ${anyEntangled ? `
        <div class="detail-actions">
          <button class="danger-btn" id="act-sever" ${severOffers.length ? "" : "disabled"}>
            ${severOffers.length
              ? `破除纏身(獻祭・${severFee} 金)`
              : `破除纏身(${esc(severBlock)})`}
          </button>
        </div>
        ${severChooser ? `
          <div class="chooser" style="justify-content:center;flex-wrap:wrap;gap:.4em">
            <div class="dim small" style="width:100%;text-align:center;margin:.3em 0 .2em">選祭品(永遠消失)</div>
            ${severOffers.map(o =>
              `<button type="button" data-sever-offer="${esc(o.id)}" class="danger-btn">${esc(o.name)} · ${o.rarity} · ${stageLabel(o.stage)}</button>`
            ).join("")}
            <button type="button" data-sever-cancel>取消</button>
          </div>` : ""}
      ` : ""}
      ${shotsLine(s)}
      <div class="detail-actions">
        ${s.ntr
          ? `<button class="gold" id="act-ransom">贖回 ${RANSOM[s.stage]} 金</button>`
          : (() => {
              // 被帶走 → 可連打；沒帶走 → 一天兩次（canPressPhone）
              const phoneDisabled = !canPressPhone(s);
              return `<button class="cyan" id="act-date" ${phoneDisabled ? "disabled" : ""}>${esc(dateBtnLabel)}</button>
             ${isKanban(s.id)
               ? `<button disabled>★ 看板娘(陪伴中)</button>
                  ${cardSystemOn() ? `<button class="cyan" id="act-cardtable" ${asleep ? "disabled" : ""}>✦ 靠近她</button>` : ""}`
               : takenAway
                 ? `<button disabled>召喚不到她(被召喚走)</button>`
                 : `<button id="act-kanban">召喚為看板娘(${kanbanCost()} 金)</button>`}`;
            })()}
      </div>
      ${(() => {
        if (!dateChooser || s.ntr || isKanban(s.id)) return "";
        if (cardSystemOn() && dateFlow?.girlId === s.id && dateFlow.venueId) {
          const v = venueById(dateFlow.venueId);
          const fee = Number(v?.fee) || 0;
          const canPay = state.gold >= fee;
          return `<div class="chooser date-venues" style="justify-content:center;flex-wrap:wrap;gap:.4em">
            <div class="dim small" style="width:100%;text-align:center;margin:.3em 0 .2em">
              她接了（電話 −${dateFlow.phoneCost ?? 1} 金）。抽到 <b>${esc(v?.name || "？")}</b>
              ${v?.desc ? ` — ${esc(v.desc)}` : ""}
            </div>
            <button type="button" class="cyan" id="date-go" ${canPay ? "" : "disabled"} title="${canPay ? "" : "金幣不夠"}">
              ${canPay ? `去（${fee} 金）` : `不夠 ${fee} 金`}
            </button>
            <button type="button" id="date-decline">不去了</button>
          </div>`;
        }
        if (!cardSystemOn()) {
          return `<div class="chooser" style="justify-content:center">${dateChoices.map(([l]) => `<button data-loc="${l}">${l}</button>`).join("")}<button data-reroll title="換一批">🎲</button></div>`;
        }
        return "";
      })()}
      ${!s.ntr && !cardSystemOn() ? `<div class="aff-line dim small">淫紋出現率 <b>${Math.round(crestChance(s) * 100)}%</b></div>` : ""}
      ${asleep ? `<div class="aff-line dim small">(睡眠時段——她回夢境了)</div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">天賦:${esc(giftLabel(s.gift))}</div>
        ${SAC_RITUAL ? `<div class="aff-line dim small">${sacScriptReady(s)
          ? "獻祭文已備妥"
          : (isAsleep() ? "獻祭文織夢中…" : "獻祭文於 01:00 起在夢中織就")}</div>` : ""}
        <div class="detail-actions"><button class="danger-btn" id="act-dismiss" ${canSacrifice(s) ? "" : "disabled"}>${
          canSacrifice(s)
            ? `獻祭(${dismissPriceToday()} 金)`
            : sacrificeBlockReason(s)
        }</button></div>` : ""}
    </div>`;

  root.querySelector("#detail-back").onclick = () => {
    detailId = null;
    dateChooser = false;
    dateFlow = null;
    severChooser = false;
    renderAll();
  };
  root.querySelector("#act-sever")?.addEventListener("click", () => {
    if (!severOffers.length) { toast(severBlock || "無法破除", "bad"); return; }
    severChooser = !severChooser;
    renderAll();
  });
  root.querySelectorAll("[data-sever-offer]").forEach(b => {
    b.onclick = () => severSummonerWithSacrifice(b.dataset.severOffer, s.id);
  });
  root.querySelector("[data-sever-cancel]")?.addEventListener("click", () => {
    severChooser = false;
    renderAll();
  });
  root.querySelector("#act-kanban")?.addEventListener("click", () => summonKanban(s.id));
  root.querySelector("#act-cardtable")?.addEventListener("click", () => openKanbanTable(s.id));
  root.querySelector("#act-weave")?.addEventListener("click", async () => {
    toast(`為 ${s.name} 織出形體中……`, "good");
    renderAll();   // 立即把按鈕切成「織出形體中…」
    await weaveMissing(s);   // 只補缺的那幾張,已經有的不重生
    const left = ["full", "half", "head"].filter(k => !s.portraits?.[k]);
    toast(left.length ? `還差 ${left.map(k => SHOT_LABEL[k]).join("、")},稍後再試` : `${s.name} 成形了`,
          left.length ? "bad" : "good");
    renderAll();
  });
  root.querySelector("#act-recut")?.addEventListener("click", () => recutShots(s));
  root.querySelector("#act-dismiss")?.addEventListener("click", () => sacrificeSuccubus(s.id));
  root.querySelector("#act-date")?.addEventListener("click", () => {
    if (cardSystemOn()) {
      // 牌制：電話 → 2/3 接通 → 抽地點 → 確認是否付費去
      beginDateFlow(s.id);
      return;
    }
    dateChooser = !dateChooser;
    if (dateChooser) dateChoices = pickN(DATE_SPOTS, 5);
    renderAll();
  });
  root.querySelector("#date-go")?.addEventListener("click", () => {
    if (dateFlow?.girlId === s.id) confirmDateVenue(s.id, dateFlow.venueId);
  });
  root.querySelector("#date-decline")?.addEventListener("click", () => declineDateVenue(s.id));
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

  // 主畫面只站「此刻真的在店頭」的看板娘:對話中的那位,或在任且沒被召喚走的。
  // 沒召喚看板娘(或她被召喚走)→ 店頭空無一人;名冊全空 → 召喚書。狀態一律看魅魔欄。
  const chatGirl = chatWith && state.succubi.find(x => x.id === chatWith);
  const girls = chatGirl ? [chatGirl] : kanbanSuccubi().filter(g => !g.summoner?.taken);

  if (girls.length) {
    book.classList.add("hidden");
    girl.classList.remove("hidden");
    girl.className = `r-${girls[0].rarity}` + (girls.length > 1 ? " multi" : "");
    const size = girls.length >= 3 ? 5 : girls.length === 2 ? 7 : 9;   // 人多站小一點
    girl.innerHTML = girls.map(g =>
      `<div class="kgirl r-${g.rarity}" data-kid="${g.id}">${girlPortrait(g, size, "full")}<div class="kname">${esc(g.name)}</div></div>`
    ).join("");
    girl.onclick = null;
    girl.querySelectorAll(".kgirl").forEach(el => el.onclick = () => {
      const g = state.succubi.find(x => x.id === el.dataset.kid);
      if (!g) return;
      // 優先冒她自己的預生委託台詞(秒出,零等待);沒貨才用罐頭
      kanbanSay(asleep ? pick(REACT.sleepClick) : (popQuip(g) || pick(REACT.idle)));
    });
  } else if (!state.succubi.length) {
    girl.classList.add("hidden");
    book.classList.remove("hidden");
    book.onclick = () => kanbanSay(asleep ? pick(REACT.sleepClick) : pick(TAUNTS));
  } else {
    // 有魅魔但沒人在店頭：提示去名冊再召看板（不要像人間蒸發）
    girl.classList.add("hidden");
    book.classList.add("hidden");
    // 若有 lastKanbanId 可顯示休息提示（不佔立繪層，避免誤點）
  }
}

function applyLlmProviderUi() {
  const p = llmProvider();
  const ollamaRow = $("#row-ollama-url");
  const grokRow = $("#row-grok-hint");
  if (ollamaRow) ollamaRow.classList.toggle("hidden", p !== "ollama");
  if (grokRow) grokRow.classList.toggle("hidden", p !== "grok-build");
  const model = $("#set-model");
  if (model) {
    model.placeholder = p === "grok-build"
      ? "grok-4.5(留空 = 罐頭模式)"
      : "(留空 = 罐頭模式)";
  }
}

function renderSettings() {
  $("#set-player").value = state.settings.player || "";
  $("#set-sleep-start").value = state.settings.sleepStart;
  $("#set-sleep-end").value = state.settings.sleepEnd;
  const prov = $("#set-llm-provider");
  if (prov) prov.value = llmProvider();
  $("#set-ollama").value = state.settings.ollamaUrl || "";
  $("#set-comfy").value = state.settings.comfyUrl || "";
  $("#set-imgprov").value = imgProvider();
  $("#row-comfy-url").classList.toggle("hidden", imgProvider() !== "comfy");
  $("#row-comfy-note").classList.toggle("hidden", imgProvider() !== "comfy");
  $("#row-comfy-test").classList.toggle("hidden", imgProvider() !== "comfy");
  // 全局模型下拉已廢:每位妹子 s.comfyCkpt 自帶,生圖時用她自己的
  const ckptRow = $("#row-comfy-ckpt");
  if (ckptRow) ckptRow.classList.add("hidden");
  const csa = $("#set-card-scene-art");
  if (csa) csa.checked = state.settings.features?.cardSceneArt !== false;
  $("#set-model").value = state.settings.model || "";
  $("#set-rating").value = state.settings.rating || "nsfw";
  applyLlmProviderUi();
  $("#set-ver").textContent = version ? "v" + version : "(尚未寫入)";

  $("#set-theme").innerHTML = THEMES.map(([k, label]) =>
    `<option value="${k}" ${(state.settings.theme || "aqua") === k ? "selected" : ""}>${label}</option>`).join("");

  // 版面:卡片顏色列
  const THEME_CARD_DEFAULT = { aqua: "#120c22", pink: "#220c1c", green: "#0a1a10", amber: "#261808", ice: "#0c162c", day: "#ffffff", sakura: "#fff8fb", crimson: "#080304", violet: "#07040e", goldtemple: "#fffae4", mint: "#e4fff5", bloodmoon: "#090302", abyssocean: "#031b21", cyber: "#070111", toxic: "#040701", rosedusk: "#fff1f6", steel: "#eff4fa", plumwine: "#130418", jade: "#e6faf1", lavasunset: "#ffede4", lavender: "#f7f1ff", copper: "#130904", voidabyss: "#040411", cherry: "#ffedf1", forest: "#ecfadb", ember: "#070301", glacier: "#edf8ff", peacock: "#020c0b", bordeaux: "#1e040c", sulfur: "#f6ffcd", indigo: "#070523", coral: "#ffe8e2", obsidian: "#09090a", aurora: "#03100b", pumpkin: "#ffefd8", sapphire: "#030614", venom: "#06020d", dawn: "#fff5ed", parchment: "#f9f5e9", mist: "#f4f6f8" };
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

  const cctr = $("#set-card-center"); if (cctr) cctr.checked = !!state.settings.cardCenter;
  const cfs = state.settings.cardFontScale ?? 1;
  const cf = $("#set-card-font"); if (cf) cf.value = cfs;
  const cfv = $("#card-font-val"); if (cfv) cfv.textContent = Math.round(cfs * 100) + "%";
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

  $("#set-appver").textContent = APP_VER;
  {
    const el = $("#set-cardpack");
    if (el) {
      const p = CARDS_PACK_INFO || {};
      if (p.via === "static-fallback") {
        el.textContent = `⚠ 未掛 API，退回 ${p.file}（卡組上線無效）`;
        el.style.color = "#ff9d4d";
      } else if (p.packId) {
        const ep = p.liveEpoch != null ? ` · e${p.liveEpoch}` : "";
        el.textContent = `${p.name || p.packId} · ${p.file || "?"} · ${p.cardCount ?? "?"} 張 · 基礎 ${p.starterCount ?? "?"}${ep}`;
        el.style.color = "";
      } else {
        el.textContent = "載入中…";
      }
    }
  }
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

on("set-player", "change", e => { state.settings.player = e.target.value.trim(); scheduleSave(); });
on("set-sleep-start", "change", e => { state.settings.sleepStart = e.target.value; scheduleSave(); renderAll(); });
on("set-sleep-end", "change", e => { state.settings.sleepEnd = e.target.value; scheduleSave(); renderAll(); });
on("set-theme", "change", e => { state.settings.theme = e.target.value; scheduleSave(); renderAll(); });

on("btn-card-reset", "click", () => { state.settings.cardColors = null; applyLayoutVars(); scheduleSave(); renderSettings(); });
on("set-card-center", "change", e => { state.settings.cardCenter = e.target.checked; applyLayoutVars(); scheduleSave(); });
on("set-card-font", "input", e => {
  state.settings.cardFontScale = parseFloat(e.target.value);
  const v = $("#card-font-val"); if (v) v.textContent = Math.round(e.target.value * 100) + "%";
  applyLayoutVars(); scheduleSave();
});
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
on("card-table-back", "click", () => leaveCardTableUi());
// 右上「推出」＝結束牌局並解除看板（與左上結束同效）
on("card-table-close", "click", () => {
  ejectCardTable("player_eject_btn");
});

on("chat-back", "click", () => {
  if (sacrificeWith) { exitSacrifice(); return; }   // 儀式中途離開=中止(她未結算、存活)
  if (watchWith) exitWatch(); else exitChat();
});
on("chat-send", "click", () => { if (chatSession?.ended) exitChat(); else sendChatMsg(); });
on("chat-ask", "click", () => askAboutActs());
on("watch-next", "click", () => { if (watchSession?.atEnd) exitWatch(); else watchNext(); });
on("watch-end", "click", () => exitWatch());
on("sac-done", "click", () => sacAdvance());
on("ssac-more", "click", () => sacrificeNextOffering());
on("ssac-summon", "click", () => doSummonNow());
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
on("set-llm-provider", "change", e => {
  const raw = (e.target.value || "ollama").toLowerCase();
  const p = (raw === "grok-build" || raw === "build" || raw === "grok" || raw === "xai")
    ? "grok-build" : "ollama";
  state.settings.llmProvider = p;
  if (p === "grok-build") {
    const m = (state.settings.model || "").trim();
    if (!m || m.includes(":") || m.startsWith("llama") || m.startsWith("qwen") || m.startsWith("mistral")) {
      state.settings.model = "grok-4.5";
      const mi = $("#set-model"); if (mi) mi.value = "grok-4.5";
    }
  }
  applyLlmProviderUi();
  scheduleSave();
});
on("set-ollama", "change", e => { state.settings.ollamaUrl = e.target.value.trim() || "http://localhost:11434"; scheduleSave(); });
on("set-comfy", "change", e => { state.settings.comfyUrl = e.target.value.trim(); scheduleSave(); });
on("set-imgprov", "change", e => {
  state.settings.imgProvider = e.target.value;
  scheduleSave();
  renderSettings();
  // 切到本機時預抓 checkpoint 清單,之後召喚/生圖才能立刻幫妹子綁模型
  if (imgProvider() === "comfy") {
    refreshComfyCkpts({ force: true }).then(ok => {
      if (ok) {
        const n = assignMissingGirlCkpts();
        if (n) toast(`已為 ${n} 位魅魔綁定生圖模型`, "good");
      }
    });
  }
});
on("set-card-scene-art", "change", e => {
  state.settings.features ??= {};
  state.settings.features.cardSceneArt = !!e.target.checked;
  scheduleSave();
});
on("btn-comfy-test", "click", async () => {
  const r = $("#comfy-test-result");
  if (!r) return;
  r.textContent = "測試中…";
  try {
    const ok = await refreshComfyCkpts({ force: true });
    if (!ok) {
      const u = (state.settings.comfyUrl || "").trim() || "(伺服器預設)";
      // localhost 是最常見的錯:那是遊戲伺服器自己,不是顯卡那台
      r.textContent = `連不上 ${u}` + (/\/\/(localhost|127\.0\.0\.1)/.test(String(u))
        ? "——這是伺服器自己。請填顯卡主機的 IP。" : "(ComfyUI 沒開?防火牆?)");
      return;
    }
    const filled = assignMissingGirlCkpts();
    // 去背要 Pillow。沒裝的話圖照生,只是留著白底疊在遊戲畫面上——那是「怎麼還是
    // 白底」最常見的原因,而且原本只印在伺服器 log 裡,手機上完全看不到。
    const cut = await fetch("/api/cutout").then(x => x.json()).catch(() => null);
    const v = comfyLastStatus?.vram && comfyLastStatus.vram[0];
    const vramTxt = v
      ? ` · ${v.name} ${Math.round(v.free_mb / 1024 * 10) / 10}/${Math.round(v.total_mb / 1024 * 10) / 10}GB 可用`
      : "";
    r.textContent = `OK · ${comfyCkpts.length} 個模型(每位妹子自帶其一)`
      + vramTxt
      + (filled ? ` · 已為 ${filled} 位補綁模型` : "")
      + (cut ? (cut.available ? " · 去背可用" : " · ⚠ 沒裝 Pillow,立繪不會去背") : "");
  } catch (e) { r.textContent = "失敗:" + e.message; }
});
on("set-model", "change", e => { state.settings.model = e.target.value.trim(); scheduleSave(); });
on("set-rating", "change", () => { state.settings.rating = "nsfw"; scheduleSave(); });
on("btn-llm-test", "click", async () => {
  const r = $("#llm-test-result");
  if (!r) return;
  r.textContent = "測試中…";
  const provider = llmProvider();
  try {
    const q = new URLSearchParams({ provider, endpoint: state.settings.ollamaUrl || "http://localhost:11434" });
    const res = await fetch(`/api/llm/tags?${q}`);
    if (!res.ok) {
      let detail = "";
      try { const j = await res.json(); detail = j.detail || ""; } catch { }
      throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
    }
    const j = await res.json();
    const names = (j.models || []).map(m => m.name);
    const dl = $("#model-list"); if (dl) dl.innerHTML = names.map(n => `<option value="${esc(n)}">`).join("");
    if (provider === "grok-build") {
      r.textContent = names.length
        ? `Grok Build OK,${names.length} 個模型(無頭·訂單)`
        : "Grok Build 可執行";
    } else {
      r.textContent = names.length ? `OK,${names.length} 個模型(模型欄可下拉選)` : "OK,但沒有已安裝的模型";
    }
  } catch (e) {
    r.textContent = provider === "grok-build"
      ? (`連線失敗——${e.message || "檢查 grok CLI 與 login"}`)
      : "連線失敗——檢查端點與 Ollama 是否啟動";
  }
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
// 強制更新:解除 SW、清光快取、重載——專治「更新了但頁面還是舊版」;存檔在伺服器,不受影響
on("btn-force-update", "click", async () => {
  toast("清快取中,馬上重載…", "");
  try {
    const regs = await (navigator.serviceWorker?.getRegistrations?.() || Promise.resolve([]));
    for (const r of regs) await r.unregister();
    if (window.caches) for (const k of await caches.keys()) await caches.delete(k);
  } catch (e) { /* 盡力而為 */ }
  location.replace(location.pathname + "?u=" + Date.now());   // 帶參數繞過殘餘快取
});

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
  cards: () => Cards.debugDump(),
  cardShop: () => { Cards.ensureCardShop(state); return state.cardShop; },
  cardInv: () => Cards.inventoryList(state),
  openTable: (id) => openKanbanTable(id || kanbanSuccubi()[0]?.id),
  /** 測 L1→NTR 五成機率：DBG.testDateNtr(1000) */
  testDateNtr: (n = 1000) => {
    let ntr = 0, normal = 0;
    let last = null;
    for (let i = 0; i < n; i++) {
      last = rollDateL1Branch();
      if (last.goNtr) ntr++; else normal++;
    }
    const out = {
      n, ntr, normal,
      rate: ntr / n,
      ntrP: last?.ntrP,
      force: last?.force || "(none)",
      pack: CARDS_PACK_INFO,
      ntrL1: (Cards.venuesList?.() || []).map(v => ({
        venue: v.id,
        cards: Cards.dateChapterOptionIds?.(v.id, 1, { track: "ntr" }) || [],
      })),
    };
    console.table?.([{ 次數: n, NTR: ntr, 正常L2: normal, 比率: (out.rate * 100).toFixed(1) + "%", 門檻: out.ntrP, 強制: out.force }]);
    return out;
  },
  /** 測 NTR 三岔：抽離≈1/6、A/B 各≈5/12。DBG.testNtrFork(3000) */
  testNtrFork: (n = 3000) => {
    let pull = 0, a = 0, b = 0;
    for (let i = 0; i < n; i++) {
      const { face } = rollNtrThreeWay();
      if (face === 0) pull++;
      else if (face === 1) a++;
      else b++;
    }
    const out = { n, pull, a, b, pullRate: pull / n, aRate: a / n, bRate: b / n, expect: { pull: 1 / 6, a: 5 / 12, b: 5 / 12 } };
    console.table?.([{
      次數: n,
      抽離: (out.pullRate * 100).toFixed(1) + "% (目標16.7%)",
      卡A: (out.aRate * 100).toFixed(1) + "% (目標41.7%)",
      卡B: (out.bRate * 100).toFixed(1) + "% (目標41.7%)",
    }]);
    return out;
  },
  /** 強制下一場 L1 後進 NTR：DBG.forceNtr(true/false/null) */
  forceNtr: (on) => {
    if (on === null || on === undefined) {
      localStorage.removeItem("yoro_force_date_ntr");
      return "cleared";
    }
    localStorage.setItem("yoro_force_date_ntr", on ? "1" : "0");
    return localStorage.getItem("yoro_force_date_ntr");
  },
  /** L6 結局：DBG.forceNtrEnd("taken"|"return"|null) */
  forceNtrEnd: (kind) => {
    if (!kind) {
      localStorage.removeItem("yoro_force_ntr_end");
      return "cleared";
    }
    localStorage.setItem("yoro_force_ntr_end", String(kind));
    return localStorage.getItem("yoro_force_ntr_end");
  },
  // 出卡場景圖診斷
  sceneArt: () => ({
    appVer: APP_VER,
    on: cardSceneArtOn(),
    whyOff: cardSceneArtWhyOff() || null,
    feature: state.settings?.features?.cardSceneArt,
    imgProvider: imgProvider(),
    canWeave: canWeaveNow(),
    llm: llmProvider(),
    model: state.settings?.model || null,
    job: { ...cardSceneJob },
    lastPlay: cardUi.lastPlay ? {
      cardId: cardUi.lastPlay.cardId,
      queued: !!cardUi.lastPlay._sceneArtQueued,
      girlLine: (cardUi.lastPlay.girlLine || "").slice(0, 40),
    } : null,
    girlCg: (() => {
      const g = girlForSession();
      if (!g) return null;
      const cid = cardUi.lastPlay?.cardId;
      return {
        girl: g.name,
        cardKey: cid ? g.cardCg?.[`card:${cid}`] : null,
        portraits: Object.keys(g.portraits || {}),
      };
    })(),
  }),
  refreshCardShop: () => { Cards.refreshCardShop(state); scheduleSave(); renderAll(); return state.cardShop; },
  grantCard: (id, n = 1) => { Cards.invAdd(state, id, n); scheduleSave(); renderAll(); return Cards.invEntry(state, id); },
  // 測試:直接把她設成「被召喚中」並以玩家動作進窺視
  watch: (id, playerType = "chat", hours = 2) => {
    const s = state.succubi.find(x => x.id === id);
    if (!s) return;
    s.summoner ??= makeSummonerRel(SUMMONERS[0]?.id);
    s.summoner.taken = { type: "kanban", location: null, until: Date.now() + hours * HOUR, actAt: Date.now() };
    enterWatch(s, playerType);
  },
  summonKanban: (id) => summonKanban(id),
  // 服裝:i = -1 生涯服裝,0..5 個人衣櫃(要關係解得夠)。換了會重織三張立繪。
  // 詳細頁上的衣櫃選擇器收掉了,這是目前唯一的入口。
  wearOutfit: (id, i) => changeOutfit(state.succubi.find(x => x.id === id), i),
  wardrobe: (id) => {
    const s = state.succubi.find(x => x.id === id);
    return s && { 生涯: careerOutfit(s), 全部: wardrobeAll(s),
                  已解鎖: wardrobeUnlocked(s), 身上: outfitWorn(s) };
  },
  summon: (n) => summonWithCount(n),
  genGirl: (luck = 0, rating = "nsfw") => generateGirl({ luck, rating }),
  tickActs: () => processTakenActs(),
  pumpActs: () => genTick(true),
  pumpChat: () => genTick(true),
  // 測試:設好召喚師關係(可指定 stage/resist)並強制一次交配
  rel: (id, suId) => { const s = state.succubi.find(x => x.id === id); if (s) { s.summoner = makeSummonerRel(suId || SUMMONERS[0]?.id); scheduleSave(); renderAll(); } return s?.summoner; },
  mate: (id) => { const s = state.succubi.find(x => x.id === id); if (!s?.summoner) return null; const rm = doMating(s, Date.now()); scheduleSave(); renderAll(); return { removed: rm, sm: s.summoner }; },
  actSlot: (id) => { const s = state.succubi.find(x => x.id === id); if (!s?.summoner) return null; const rm = processActSlot(s, Date.now()); scheduleSave(); renderAll(); return { removed: rm, sm: s.summoner }; },
  // 測試:模擬一次委託操作的淫紋判定(看誰亮了紋、話寫好沒)
  crestRoll: () => {
    const changed = crestRoll() | crestFallback();
    renderAll();
    return {
      changed: !!changed,
      cardSystem: cardSystemOn(),
      girls: kanbanSuccubi().map(s => ({
        name: s.name, chance: crestChance(s), wantsTalk: !!s.wantsTalk, line: s.chatLine?.text || null,
      })),
    };
  },
  // 測試 M2 氣泡: eventKey = discover|accept|complete
  bubble: (eventKey = "complete", questText = "測試委託") => {
    const hit = questBubbleRoll(eventKey, questText);
    scheduleSave(); renderAll();
    return {
      hit: !!hit,
      cardSystem: cardSystemOn(),
      bubbleAff: state.bubbleAff,
      queue: bubbleQueue.length,
    };
  },
  // 測試 M3 約會：跳過電話骰，直接開指定場地牌桌（預設公園）
  dateTable: (id, venueId = "park") => {
    const s = id ? state.succubi.find(x => x.id === id) : state.succubi.find(x => !isKanban(x.id) && !x.ntr);
    if (!s) return { ok: false, err: "沒有可約的魅魔" };
    if (isKanban(s.id)) return { ok: false, err: "看板中不可約" };
    openDateTable(s.id, venueId, { force: true });
    return { ok: true, girl: s.name, venueId };
  },
  /** 測試：隨機一隻非 NTR 名冊妹子直接開約會（等同 testword 按鈕） */
  randomDate: (venueId) => {
    const pool = state.succubi.filter(x => !x.ntr);
    if (!pool.length) return { ok: false, err: "沒有可約的魅魔" };
    const s = pool[Math.floor(Math.random() * pool.length)];
    if (Cards.sessionActive(state) || state.cardSession) {
      try { Cards.closeSession?.(state, "dbg_random_date"); } catch { /* */ }
      state.cardSession = null;
      document.body.classList.remove("card-mode");
    }
    if (isKanban(s.id)) state.kanbans = (state.kanbans || []).filter(k => k.id !== s.id);
    if (s.summoner?.taken) delete s.summoner.taken;
    const vid = venueId
      || (availableVenues()[Math.floor(Math.random() * Math.max(1, availableVenues().length))]?.id)
      || "park";
    openDateTable(s.id, vid, { force: true });
    return { ok: !!state.cardSession, girl: s.name, venueId: vid };
  },
  venues: () => availableVenues(),
  // 測試:直接進互動（牌制下 chat→牌桌／date→電話流）
  chat: (id, type = "chat") => enterChat(id, type, null, true),
  ask: () => askAboutActs(),
  chatState: () => ({
    chatWith, watchWith, ended: chatSession?.ended ?? null,
    freeChatRetired: freeChatRetired(), cardSystem: cardSystemOn(),
  }),
  render: () => renderAll(),   // 測試:手動改了 state 之後強制重畫
  // 測試/調 prompt:看她下一句實際會送出去的訊息陣列(system prompt + 這一場的上下文)
  chatPrompt: (id) => {
    if (freeChatRetired()) return { retired: true, note: "自由聊已退役；打牌用 cardPlay / bubble" };
    const s = state.succubi.find(x => x.id === id) || kanbanSuccubi()[0];
    return s ? chatLineMsgs(s) : null;
  },
  // 手機上自我診斷:為什麼淫紋沒出現?把每個關卡的判定結果一次列出來
  whyNoCrest: () => {
    if (freeChatRetired()) {
      return {
        note: "M6：淫紋自由聊已退役。委託碎嘴走氣泡 15%；深度互動走牌桌。",
        cardSystem: cardSystemOn(),
        freeChatRetired: true,
        看板: kanbanSuccubi().map(s => s.name),
      };
    }
    const now = Date.now();
    const globals = {
      睡眠時段: isAsleep(), 對話中: !!chatWith, 觀戰中: !!watchWith,
      在任看板娘: kanbanSuccubi().map(s => s.name),
      模型: state.settings.model || "(空=罐頭模式)",
    };
    const girls = state.succubi.map(s => {
      const k = (state.kanbans || []).find(x => x.id === s.id);
      const why = [];
      if (!isKanban(s.id)) why.push(k ? "看板娘時段已到期(要重新付費召喚)" : "不是看板娘(要先召喚為看板娘)");
      if (s.summoner?.taken) why.push("被別的召喚師召喚走了");
      if (isAsleep()) why.push("睡眠時段不判定");
      if (s.typing) why.push(`正在回你(等 ${Math.round((now - s.typing.at) / 1000)} 秒,超過 ${TYPING_STUCK_MS / 60000} 分改罐頭)`);
      if (s.chatSess && now - (s.chatSess.at || 0) < CHAT_SESS_TTL)
        why.push(`上一場還沒聊完(${s.chatSess.playerMsgs}/${s.chatSess.turnCap} 句,擱置 ${CHAT_SESS_TTL / 60000} 分自動作廢)`);
      return {
        name: s.name, 出現率: Math.round(crestChance(s) * 100) + "%",
        看板娘剩餘分鐘: k ? Math.round((k.until - now) / 60000) : null,
        紋現在亮著: !!(s.chatLine || s.wantsTalk || s.typing || s.chatSess),
        她的話: s.chatLine?.text || null,
        不判定的原因: why.length ? why : "(沒有阻礙,下次委託操作就會判定)",
      };
    });
    return { globals, girls };
  },
  // 測試:看每位看板娘的淫紋狀態(亮紋 / 正在輸入 / 這場聊到第幾句)
  crestState: () => kanbanSuccubi().map(s => ({
    name: s.name, line: s.chatLine?.text || null, typing: !!s.typing,
    wantsTalk: !!s.wantsTalk, sess: s.chatSess ? { ...s.chatSess } : null,
  })),
  drawTick: () => checkSummonerDraws(),
  simSync: () => simSync(),
  simLiveAct: (id) => simLiveAct(state.succubi.find(x => x.id === id)),
  sac: (id) => sacrificeSuccubus(id),
  sacNext: () => sacAdvance(),
  sacState: () => sacSession && { idx: sacSession.idx, pages: sacSession.pages.map(p => !!p.text), settled: sacSession.settled, opening: sacSession.opening },
  // 測試:查看/強制備妥某隻的預織獻祭文(僅 SAC_RITUAL=true 時的儀式會用到)
  sacScript: (id) => state.succubi.find(x => x.id === id)?.sacScript,
  sacReady: (id) => {
    const s = state.succubi.find(x => x.id === id); if (!s) return null;
    fillSacCanned(s); scheduleSave(); renderAll();
    return s.sacScript;
  },
  sacUnlock: (id) => {
    const s = state.succubi.find(x => x.id === id); if (!s) return null;
    if (!sacScriptReady(s)) fillSacCanned(s);
    scheduleSave(); renderAll();
    return { ready: sacScriptReady(s), can: canSacrifice(s) };
  },
  pumpSac: () => genSacOrders(),
  pin: () => ({ pinIdx, execCap: execCap(), tx: $("#pin-track")?.style.transform, slides: document.querySelectorAll("#pin-track .pin-slide").length }),
  pinGo: (i) => setPinIdx(i),
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
