// 魅魔萬事屋 遊戲核心
// M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔
// M1:商店/地牢/召喚 + 名冊 + 情感需求 + NTR + 睡眠時鐘 + 看板娘罐頭反應
// M2:Ollama 聊天/約會(galgame 式)+ PersonaBuilder 銜接口 + history 存檔

import { buildSystemPrompt, buildWatchPrompt, buildSacrificePrompt, buildOfferingPrompt, buildQuipPrompt, buildCardPlayPrompt, buildMatingPrompt, buildSacScenePrompt, buildSacReactPrompt } from "./content/persona_builder.js";
import { loadPools, generateGirl, WARDROBE_UNLOCK } from "./content/girl_gen.js";
import * as Cards from "./content/card_engine.js";
loadPools();   // 人物生成池(persona_pools.json;載入失敗時召喚退回舊制簡易骰)

// 遊戲版本(顯示在設定頁最下方;每次改版遞增——手機顯示的就是「正在跑的 app.js」的版本)
const APP_VER = "v6.7h(2026-08-05)預產佇列降載／逐張／逾時回落";

// 世界觀文件(內容模組件,可自由編輯):開機載入一次,注入每次對話。
// 核心零解析——只把整份文字透傳給 PersonaBuilder。
let WORLD_LORE = "";
fetch("content/world.md").then(r => r.ok ? r.text() : "").then(t => { WORLD_LORE = t; }).catch(() => {});

// 其他召喚師池(內容模組件,可自由編輯):開機載入一次
let SUMMONERS = [];
fetch("content/summoners.json").then(r => r.ok ? r.json() : null).then(j => { SUMMONERS = (j && j.summoners) || []; }).catch(() => {});
function summonerById(id) { return SUMMONERS.find(x => x.id === id) || null; }

// 互動牌制內容(cards.json → card_engine)
let CARDS_LOAD = fetch("content/cards.json")
  .then(r => r.ok ? r.json() : null)
  .then(j => { if (j) Cards.setCardsData(j); return j; })
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
function giftLabel(g) { return g === "cleanse" ? "取消所有召喚師(特殊)" : (EXPANSIONS[g] || "?"); }
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
  if (cardSystemOn()) return false; // M2：養成改氣泡，不再亮淫紋進聊天
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
  for (const h of hits) {
    const s = state.succubi.find(x => x.id === h.girlId);
    if (!s) continue;
    if (h.emotionDelta) applyAffection(s, h.emotionDelta);
    queue.push({
      girlId: s.id,
      name: s.name,
      text: h.text,
      emotionDelta: h.emotionDelta || 0,
    });
  }
  if (!queue.length) return false;
  enqueueKanbanBubbles(queue);
  dirty = true;
  return true;
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
  if (cardSystemOn()) return false; // M2：不再補淫紋開場白
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
let dateChooser = false; // 詳情頁展開約會地點（舊）／場地清單（牌制）
let dateFlow = null;     // M3：{ girlId, phoneCost } 電話已接通、待選場地
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
    deckPresets: [],     // [{ id, name, cardIds }]
    cardShop: null,      // { nextRefreshAt, slots:[{cardId,price,sold,isSale,salePrice?}] }
    cardSession: null,   // 當前牌桌 session（見 card_engine）
    bubbleAff: { day: null, byGirl: {} }, // M2 氣泡情感日 cap { day, byGirl: { id: used } }
    playerProfile: {
      name: "", body: "", look: "", habit: "",
      prefs: [], quiz: {},
      starterSpeechCardId: null, cardPlayerLv: 0,
    },
    kanbans: [],        // 在任看板娘 [{id, until}](多看板娘制;until=到期時間戳)
    lastKanbanId: null, // 最後一位看板娘(全過期後背景顯示她的休息剪影)
    lastSettledDay: null,
    log: [],
    settings: {
      player: "", sleepStart: "01:00", sleepEnd: "06:00", theme: "aqua",
      // llmProvider: "ollama" | "grok-build"(無頭訂單;舊 xai/grok 會自動映射)
      llmProvider: "ollama",
      ollamaUrl: "http://localhost:11434", model: "", rating: "sfw",
      // 織夢生圖那台(顯卡主機)。跟 ollamaUrl 一樣是「別台機器的位址」——
      // 伺服器不會知道,只能由這裡填進去。留空 = 用伺服器的 COMFY_URL 預設。
      comfyUrl: "",
      // 生圖走哪條:"comfy"(本機顯卡,召喚出三連拍)或 "grok-img"(雲端,單張)
      imgProvider: "grok-img",
      // ComfyUI 用哪個 checkpoint。留空 = 伺服器自動挑清單第一個能用的
      // ——models/checkpoints 混著「只含主模型」的單件檔時,自動挑會踩雷,
      // 所以這裡最好指定。測試 ComfyUI 會把清單抓回來填進下拉。
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
  state.deckPresets ??= [];
  state.cardShop ??= null;
  state.cardSession ??= null;
  state.bubbleAff ??= { day: null, byGirl: {} }; // M2 氣泡情感日 cap
  state.playerProfile = {
    name: "", body: "", look: "", habit: "",
    prefs: [], quiz: {},
    starterSpeechCardId: null, cardPlayerLv: 0,
    ...(state.playerProfile || {}),
  };
  state.playerProfile.prefs ??= [];
  state.playerProfile.quiz ??= {};
  if (!state.playerProfile.name && state.settings?.player) {
    state.playerProfile.name = state.settings.player;
  }
  state.settings.features = { cardSystem: true, ...(state.settings.features || {}) };
  if (Cards.cardsReady()) Cards.ensureStarterFallback(state);
  // 牌制開啟：清掉舊淫紋燈狀態，避免殘燈卻點不進聊天
  if (cardSystemOn()) {
    for (const s of state.succubi) {
      if (s.wantsTalk || s.chatLine || s.typing) {
        s.wantsTalk = 0;
        s.chatLine = null;
        s.typing = null;
      }
    }
  }
  // 召喚師系統移轉:舊魅魔補發抽取間隔
  for (const s of state.succubi) {
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
  if (offline) {
    toast("目前離線,進度會在恢復連線後自動同步", "bad");
    dirty = true;              // 讓 saveNow 的重試迴圈持續嘗試回推
    saveTimer = setTimeout(saveNow, 5000);
  } else {
    cacheLocal();
    simSync();   // 進場即向伺服器要召喚師模擬的最新狀態(關機期間的判定/act 都補回來)
  }
}

let bootFailed = false;   // 存檔載入/渲染爆掉 → 臨時全新狀態、且不自動存(保住伺服器上的舊檔待修)
async function load() {
  try { await CARDS_LOAD; } catch { /* 牌制內容載失敗仍可跑舊路徑 */ }
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
  const rating = state.settings.rating || "sfw";
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
function sacSettle(ss) {
  ss.settled = true;
  const dropped = Math.random() < sacrificeDropChance(ss.stage);
  let dropMsg = "";
  if (dropped) {
    if (ss.gift === "cleanse") {
      const n = state.succubi.filter(x => x.id !== ss.id && x.summoner).length;
      for (const x of state.succubi) if (x.id !== ss.id) x.summoner = null;
      dropMsg = `\n\n✦ 特殊天賦發動:所有魅魔身上的召喚師都被抹除了!(${n} 名解除)`;
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
  log(`獻祭了 ${ss.name}(-${ss.price} 金)${dropped ? `,獲得 ${EXPANSIONS[ss.gift]} 擴充` : ""}`);
  toast(dropMsg.includes("✦") ? "✦ 獲得永久擴充!" : `${ss.name} 化作了獻祭的光`, dropMsg.includes("✦") ? "good" : "");
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
    world: WORLD_LORE, content_rating: state.settings.rating || "sfw",
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
      rating: state.settings.rating || "sfw",
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

// 現在生得出圖嗎。ComfyUI 是本機顯卡隨時可織;Grok 要伺服器上有 grok CLI,
// 那件事沿用 llmIsOrder()(選了 Grok Build 就代表 CLI 在)。
function canWeaveNow() {
  return imgProvider() === "comfy" || llmIsOrder();
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

// ComfyUI 的 checkpoint 清單(按「測試 ComfyUI」時抓)。bad = 試過確定沒有
// 文字編碼器的單件檔,在下拉裡標出來,免得又選到同一顆地雷。
let comfyCkpts = [];
let comfyBadCkpts = [];

function comfyCkptOptions(selected) {
  const sel = $("#set-comfy-ckpt");
  if (!sel) return;
  const opts = [`<option value="">(自動:清單第一個能用的)</option>`];
  for (const c of comfyCkpts) {
    const bad = comfyBadCkpts.includes(c);
    opts.push(`<option value="${esc(c)}"${c === selected ? " selected" : ""}${bad ? " disabled" : ""}>${
      esc(c)}${bad ? "(沒有文字編碼器,載不動)" : ""}</option>`);
  }
  // 存檔裡指定的那個還沒在清單裡(還沒按過測試)也要留著,不然一進設定就被清掉
  if (selected && !comfyCkpts.includes(selected)) {
    opts.push(`<option value="${esc(selected)}" selected>${esc(selected)}</option>`);
  }
  sel.innerHTML = opts.join("");
}

// 一張的下單→輪詢。shot 給值(head|half|full)= 三連拍其中一張,尺寸與 seed
// 由伺服器依規格決定(三張同 seed 才是同一張臉)。回 URL 或 ""。
async function weaveShot(s, shot, onTick) {
  const comfy = imgProvider() === "comfy";
  const body = {
    provider: imgProvider(),
    model: state.settings.model || "grok-4.5",
    // Grok 那條沒有三連拍,只認 framing;head 對它而言最接近半身
    framing: comfy ? "full" : (shot === "full" ? "full" : "half"),
    rating: state.settings.rating || "sfw",
    style: state.settings.imgStyle || "pixel",
    character: s,   // 完整人設(generateGirl 結果),生圖以此為準
    retry: true,
    ...(comfy ? { shot, char_id: s.id, comfy_url: state.settings.comfyUrl || "",
                ckpt: state.settings.comfyCkpt || "" } : {}),
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
  s.portraits[shot] = url;
  s.portrait = s.portraits.full || s.portraits.half || url;   // 舊欄位仍指得到東西
  s.portraitReady = true;
  dirty = true;
  saveNow();
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
    if (ok && imgProvider() === "comfy") weaveRest(s);   // 不 await:讓召喚立刻往下走
  } finally {
    portraitGenning.delete(s.id);
  }
  return ok;
}

// 背景補剩下兩張。失敗不重試也不吵——girlShot 會自動退回已經有的那張。
async function weaveRest(s) {
  for (const shot of ["head", "half"]) {
    if (girlShot(s, shot) && s.portraits?.[shot]) continue;
    setShot(s, shot, await weaveShot(s, shot));
    renderAll();
  }
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

/** 從她的回覆抽出 #越界 旗標,並回傳乾淨的台詞(多行保留,只拿掉旗標)。
 *  所有消費她回覆的地方都要走這裡——包含約會即時模式,否則旗標會漏進畫面與歷史。 */
function stripGuardFlag(raw) {
  if (!raw) return { text: "", crossed: false };
  const crossed = /#\s*越界/.test(raw);
  const text = raw
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
  // M2/M3：牌制開啟時，日常聊→牌桌；約會→電話＋場地牌局
  if (cardSystemOn() && type === "chat") {
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
    if (!prepaid) {
      if (state.gold < 0) { toast("負債中,先去做委託還債吧", "bad"); return; }
      if (state.gold < DATE_COST) { toast("金幣不夠", "bad"); return; }
      if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
      if (s.datesToday.count >= DATE_LIMIT) { toast("今天約會夠多了,她需要休息", "bad"); return; }
      state.gold -= DATE_COST;
      // 她被另一位召喚師召喚走了:錢照付,但看到的是他們的互動(觀戰);釋放成功會接回這場約會
      if (s.summoner?.taken) {
        log(`約 ${s.name} 出門 -${DATE_COST} 金——她卻被召喚到別人身邊`);
        enterWatch(s, "date", location);
        return;
      }
      log(`與 ${s.name} 去${location}約會 -${DATE_COST} 金`);
    }
    if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
    s.datesToday.count++;
    s.lastDateDay = today;
    s.lastChatDay = today;
  } else {
    // 聊天不花任何資源:淫紋只是「她想跟你說話」的燈,點開就是聊起來。
    // 話還沒寫好(念頭剛起)也照樣能點——進場現生開場白,不讓玩家對著暗紋乾等。
    // 她被召喚走時不會產生話,也不從這裡進觀戰——想撞見實況要付約會費。
    if (!prepaid) {
      if (s.summoner?.taken) { toast(`${s.name} 正被召喚走——約她出門才撞得見`, "bad"); return; }
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

// 窺視紀錄:一淫紋(或一次約會費)看 1~2 則未讀,從最舊開始——照時間順序目睹他們的進展。
// playerType 決定釋放機率(chat 1/20 / date 1/10);釋放只對「她此刻被召喚中」有意義,
// 事後翻舊紀錄(未被召喚中)沒有釋放判定。
// 進場前強制 simSync:拉伺服器已預生的 acts;若先設 watchWith 會被鏡像跳過覆蓋,整場只剩 live_act 現生。
async function enterWatch(s, playerType, playerLocation = null) {
  const gid = s.id;
  // 尚未鎖 watchWith → simSync 可覆蓋這隻的 summoner 鏡像
  await simSync(true);
  s = state.succubi.find(x => x.id === gid) || s;
  if (!s?.summoner) {
    toast("召喚師紀錄同步失敗,稍後再試", "bad");
    return;
  }
  watchWith = s.id;
  const taken = !!s.summoner?.taken;
  const nUnseen = unseenActs(s).length;
  watchSession = {
    playerType, playerLocation,
    releaseChance: taken ? (playerType === "date" ? 1 / 10 : 1 / 20) : 0,
    // 一淫紋看 1~2 則;優先消耗預生未讀。taken 中且佇列空才靠 live 補,turnCap 至少 1
    turnCap: Math.min(randInt(1, 2), taken ? Math.max(1, Math.min(2, nUnseen || 1)) : (nUnseen || 1)),
    presses: 0, busy: false, ended: false,
  };
  document.body.classList.add("chat-mode");
  const su = summonerById(s.summoner?.id);
  scheduleSave(); renderAll();
  const opener = taken
    ? `${s.name} 不在你身邊——她正被 ${su?.name || "另一個男人"} 召喚著。淫紋映出他們的互動……`
    : `淫紋映出 ${s.name} 與 ${su?.name || "另一個男人"} 之間,那些你不在場時的紀錄……`;
  vnShow("", `—— ${opener} ——`, "sys");
  const wnBtn = document.getElementById("watch-next");
  if (wnBtn) { wnBtn.textContent = "下一句 ▶"; wnBtn.disabled = false; }   // 重置上一場殘留的收尾文字
  // 背景先幫未讀 act 下文字單(有文字則秒開;沒有才邊看邊生)
  try { genActOrders(); } catch { /* 下輪 genTick 會補 */ }
  watchNext();   // 自動放第一則
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
  // 取最舊的未讀(伺服器預生的結構);文字備好就秒開,沒備好才當場生。
  // 佇列空且仍 taken → live_act 會先補算 actAt 節奏再必要時現生 1 則(直播)。
  let act = unseenActs(s)[0];
  if (!act && s.summoner?.taken) {
    const r = await simLiveAct(s);
    if (r?.married || !state.succubi.includes(s)) { exitWatch(true); return; }
    if (r?.rel) s.summoner = r.rel;   // 更新鏡像(含補算出來的預生 acts)
    act = unseenActs(s)[0];
  }
  if (!act) { exitWatch(); return; }
  watchSession.busy = true;
  setWatchBtns(false);

  try {
    if (act.text) {
      vnShowWatch(su, s, act.text, true, act);   // 背景已生成:秒開
      vnDone();
    } else {
      vnTyping(true);
      const raw = await llmJobRun(actMsgs(s, su, act), acc => vnShowWatch(su, s, acc, false, act), "他:哼,別扭什麼,乖一點嘛。\n她:……別碰我。");
      act.text = raw;
      vnShowWatch(su, s, raw, true, act);
      vnDone();
    }
  } catch (e) {
    if (e.name === "AbortError") return;
    vnShow("", "(畫面一陣模糊……再按一次下一句)", "sys");
    watchSession.busy = false;
    setWatchBtns(true);
    return;
  }
  act.seen = true;
  simSeenOf(s, act);   // 回報伺服器:這則看過了(順帶回填已生成文字)
  watchSession.busy = false;
  watchSession.presses++;

  // 釋放判定(只在她被召喚中):聊天 1/20、約會 1/10
  if (s.summoner?.taken && Math.random() < watchSession.releaseChance) {
    rescueFromWatch(s);
    return;
  }
  // 這一淫紋能看的看完了:留 2 秒讓玩家讀完最後一則,再顯示收尾。她被召喚中時還能請伺服器現生,故不因無備好紀錄而收尾
  if (watchSession.presses >= watchSession.turnCap || (!unseenActs(s).length && !s.summoner?.taken)) {
    watchSession.ended = true;
    setWatchBtns(false);
    const endMsg = s.summoner?.taken
      ? "(你只能看著……她還被召喚在對方那邊)"
      : `(紀錄到此為止${unseenActs(s).length ? `,還有 ${unseenActs(s).length} 則未讀` : ""})`;
    // 不自動跳出:讀完最後一則後顯示收尾,把「下一句 ▶」換成「結束觀戰 ▶」由玩家自己按著離開
    setTimeout(() => {
      if (!watchSession?.ended) return;
      vnShow("", endMsg, "sys");
      watchSession.atEnd = true;
      const wn = document.getElementById("watch-next");
      if (wn) { wn.textContent = "結束觀戰 ▶"; wn.disabled = false; }
    }, 2200);
    scheduleSave();
    return;
  }
  setWatchBtns(true);
  scheduleSave();
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
      world: WORLD_LORE, content_rating: state.settings.rating || "sfw",
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
    content_rating: state.settings.rating || "sfw",
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

// 她正在回你(玩家送出後跳出對話,回覆在背景寫)——最優先,寫好淫紋就從「…」變回亮紋
async function genReplyOrder() {
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
        content_rating: state.settings.rating || "sfw",
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
        q.lines.push(r.result.split("\n")[0].slice(0, 60));
        q.got.push(key);
        dirty = true; scheduleSave();
      }
    }
  }
}

// 每 2 秒一輪:下單+收貨(伺服器排隊生成;對話/獻祭/睡眠中不下聊天與氣泡單)
// 例外:睡眠時段(01:00 起)專門跑 genSacOrders 預織獻祭文;無模型時也要進 tick 填罐頭。
let genTickBusy = false, lastGenAt = 0;
// 玩家正在等她的那句話(她在回你、或紋亮了話還沒寫好)——用來提高輪詢頻率、壓住背景單
function waitingOnHer() {
  return state.succubi.some(s => s.typing || (s.wantsTalk && !s.chatLine));
}

async function genTick(force = false) {
  if (genTickBusy) return;
  // 等她那句話的時候收貨頻率拉高(每 700ms 問一次),平常維持 2 秒一輪
  const sessPregen = state.cardSession?.phase === "pregen";
  // 背景預產：即使 pregenStarted 被重載清掉也要續跑
  if (sessPregen && !cardUi.pregenStarted) {
    const g = girlForSession();
    if (g) beginRoundPregen(g);
  }
  const waitingPregen = !!(sessPregen && cardUi.pregenStarted);
  if (!force && Date.now() - lastGenAt < ((waitingOnHer() || waitingPregen) ? 700 : 2000)) return;
  lastGenAt = Date.now();
  genTickBusy = true;
  try {
    // 獻祭文:睡眠時段織夢(有無模型都跑;無模型走罐頭)
    if (isAsleep()) await genSacOrders();
    if (state.settings.model) {
      // 玩家在等的回覆永遠優先於牌桌預產（預產 prio 也較低，雙保險）
      await genReplyOrder();
      const idle = !chatWith && !watchWith && !sacrificeWith && !sacSummon && !isAsleep()
        && !document.body.classList.contains("card-mode");
      if (idle) await genChatOrder();
      if (!waitingOnHer()) {
        await genActOrders();
        if (idle) await genQuipOrders();
      }
    }
    // 組牌後預產：逐張背景收／下單，不擋聊天
    if (waitingPregen) await genRoundPregenOrders();
  } catch (e) { /* 下輪再試 */ }
  genTickBusy = false;
}

// ── M4 打牌短 AI：組牌後整輪預產，開打後直接播 ────────────
// 原則：感情骰出卡時才擲；台詞在 pregen 階段依「組好的每張卡」預先寫好。
// 佇列：prio 低（2）、一次只跑一張，避免塞爆 grok 把整站 AI 卡死。
// 無模型／失敗／逾時 → 罐頭。

/** 打牌預產優先序：必須低於玩家回覆(10)／開場白(5) */
const CARD_PREGEN_PRIO = 2;
/** 整輪預產最長等這秒數，超時其餘用罐頭，避免永遠「準備中」 */
const CARD_PREGEN_TIMEOUT_MS = 90_000;

/** 打牌 AI 取 1～2 行台詞（規格允許兩句；勿只砍第一行） */
function cardPlayLines(text) {
  const lines = (text || "").split("\n").map(l => l.trim()).filter(Boolean);
  return lines.slice(0, 2).join("\n").slice(0, 220).trim();
}

/** 依卡定義組預產 prompt（尚無本拍骰子；chain 只帶卡面 open 屬性作提示） */
function cardPregenMsgs(girl, def, { openFail = false } = {}) {
  const sess = state.cardSession;
  let venueName = null;
  if (sess?.mode === "date" && sess.venueId) {
    venueName = (Cards.venuesList?.() || []).find(v => v.id === sess.venueId)?.name || null;
  }
  const kind = def?.kind || "speech";
  const ctx = buildCtx(girl);
  ctx.want_guard_flag = false;
  // 精簡：打牌預產不塞 world／委託全文（buildCardPlayPrompt 本身已短）
  ctx.card_play = {
    mode: sess?.mode || "kanban",
    venue_name: venueName,
    kind,
    card_name: def?.name || "",
    scene_start: def?.sceneStart || def?.name || "",
    prompt_hint: def?.promptHint || "",
    open_fail: !!openFail,
    open_ok: !!(!openFail && def?.openChain),
    feel_label: "",
    chain_attr: def?.openChain?.attr || "",
    emotion_delta: 0,
  };
  const sys = buildCardPlayPrompt(ctx);
  let user;
  if (openFail) {
    user = "(旁白:他剛才那一下你沒接住。用 1～2 句話反應——只有台詞。)";
  } else if (kind === "girl_trait") {
    user = "(旁白:這一拍是你主動帶的節奏。用 1～2 句話開口或接下去——只有台詞。)";
  } else if (kind === "venue_event") {
    user = "(旁白:現場剛發生那件事。用 1～2 句話反應——只有台詞。)";
  } else if (def?.openChain) {
    user = "(旁白:他剛才把門打開了、節奏被他帶住。用 1～2 句話反應——只有台詞。)";
  } else {
    user = "(旁白:對他剛才的舉動,用 1～2 句話反應——只有台詞。)";
  }
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

function cannedForDef(def, girl, openFail = false) {
  const stage = girl?.stage || "stranger";
  const line = Cards.girlReactionLine({
    stage,
    emotionDelta: openFail ? -2 : 0,
    openFail,
  });
  // 再保險：絕不回只有省略號
  if (Cards.isWeakLine?.(line)) {
    return openFail ? "我沒接住。別這樣。" : "我聽到了。";
  }
  return line;
}

/** 把 AI／罐頭寫進 instance；弱台詞丟棄改罐頭 */
function applyPregenText(inst, def, girl, kind, rawText) {
  const openFail = kind === "fail";
  let line = cardPlayLines(rawText);
  if (Cards.isWeakLine?.(line)) line = cannedForDef(def, girl, openFail);
  inst.pregen ??= { status: "pending", line: null, lineFail: null };
  if (openFail) inst.pregen.lineFail = line;
  else inst.pregen.line = line;
}

function settlePregenJob(job, inst, girl, rawText) {
  if (!inst) {
    job.settled = true;
    return;
  }
  inst.pregen ??= { status: "pending", line: null, lineFail: null };
  applyPregenText(inst, job.def, girl, job.kind, rawText ?? "");
  job.settled = true;
  const related = cardUi.pregenJobs.filter(j => j.instanceId === inst.instanceId);
  if (related.every(j => j.settled)) {
    const def = job.def || Cards.cardById(inst.cardId);
    if (Cards.isWeakLine?.(inst.pregen.line)) {
      inst.pregen.line = cannedForDef(def, girl, false);
    }
    if (def?.openChain && Cards.isWeakLine?.(inst.pregen.lineFail)) {
      inst.pregen.lineFail = cannedForDef(def, girl, true);
    }
    inst.pregen.status = "done";
  }
}

/**
 * 組牌完成 → 建立預產 job 清單（不一次全下單）。
 * genRoundPregenOrders 逐張 POST，避免佇列塞死。
 */
function beginRoundPregen(girl) {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "pregen") return;
  // 已有進行中的 job 就別重開（避免重載/tick 重複下單）
  if (cardUi.pregenStarted && cardUi.pregenJobs?.length) return;

  const list = Cards.roundCardInstances(sess);
  cardUi.pregenJobs = [];
  cardUi.pregenStarted = true;
  cardUi.pregenStartedAt = Date.now();

  if (!list.length) {
    finishRoundPregenIfReady();
    return;
  }

  // 無 AI：全數罐頭 → ready
  if (!state.settings?.model) {
    for (const inst of list) {
      const def = Cards.cardById(inst.cardId);
      inst.pregen = {
        status: "done",
        line: cannedForDef(def, girl, false),
        lineFail: def?.openChain ? cannedForDef(def, girl, true) : null,
      };
    }
    finishRoundPregenIfReady();
    return;
  }

  for (const inst of list) {
    const def = Cards.cardById(inst.cardId);
    const keepLine = inst.pregen?.line && !Cards.isWeakLine?.(inst.pregen.line);
    const keepFail = inst.pregen?.lineFail && !Cards.isWeakLine?.(inst.pregen.lineFail);
    inst.pregen = {
      status: "pending",
      line: keepLine ? inst.pregen.line : null,
      lineFail: keepFail ? inst.pregen.lineFail : null,
    };

    if (!keepLine) {
      cardUi.pregenJobs.push({
        instanceId: inst.instanceId,
        key: `cardpre:${sess.girlId}:${sess.roundIndex}:${inst.instanceId}:ok`,
        kind: "ok",
        def,
        posted: false,
        settled: false,
      });
    }
    // 開門失敗句：出卡當下才需要；預產只做成功版，失敗用罐頭（減半佇列壓力）
    if (def?.openChain && !keepFail) {
      inst.pregen.lineFail = cannedForDef(def, girl, true);
    }
    if (keepLine && (!def?.openChain || inst.pregen.lineFail)) {
      inst.pregen.status = "done";
    }
  }

  if (!cardUi.pregenJobs.length) {
    finishRoundPregenIfReady();
    return;
  }
  scheduleSave();
  if (document.body.classList.contains("card-mode")) renderCardTable();
  else renderCrests();
}

function findInstInRound(instanceId) {
  const sess = state.cardSession;
  if (!sess) return null;
  return Cards.roundCardInstances(sess).find(c => c.instanceId === instanceId) || null;
}

/**
 * 逐張預產：同時最多一張在佇列裡。
 * 修：API 狀態是 pending（不是 queued）——舊碼把 pending 當完成，邏輯錯亂。
 * 逾時：其餘罐頭收尾，避免永遠準備中、也避免高優佔線。
 */
async function genRoundPregenOrders() {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "pregen" || !cardUi.pregenJobs?.length) return;
  const girl = girlForSession();
  if (!girl) return;

  const startedAt = cardUi.pregenStartedAt || Date.now();
  if (Date.now() - startedAt > CARD_PREGEN_TIMEOUT_MS) {
    // 逾時：未完成的全罐頭，放行開戰
    for (const job of cardUi.pregenJobs) {
      if (job.settled) continue;
      const inst = findInstInRound(job.instanceId);
      settlePregenJob(job, inst, girl, "");
    }
    finishRoundPregenIfReady();
    toast("準備較久——其餘用即時感覺接上", "");
    return;
  }

  let changed = false;

  // 1) 先收「已下單」那一張
  const inflight = cardUi.pregenJobs.find(j => j.posted && !j.settled);
  if (inflight) {
    const r = await genPost(
      inflight.key,
      cardPregenMsgs(girl, inflight.def, { openFail: inflight.kind === "fail" }),
      CARD_PREGEN_PRIO,
    );
    if (!r) return; // 網路閃斷：下輪再問
    // 伺服器實際狀態：pending | running | done | error（沒有 queued）
    if (r.status === "pending" || r.status === "running" || r.status === "queued") {
      return; // 還在跑，別塞下一張
    }
    const inst = findInstInRound(inflight.instanceId);
    if (r.status === "done" && r.result) {
      const { text } = stripGuardFlag(typeof r.result === "string" ? r.result : String(r.result ?? ""));
      settlePregenJob(inflight, inst, girl, text);
    } else {
      // error 或其他 → 罐頭
      settlePregenJob(inflight, inst, girl, "");
    }
    changed = true;
  }

  // 2) 沒有在飛的 → 下一張未下單的 POST 一筆
  if (!cardUi.pregenJobs.some(j => j.posted && !j.settled)) {
    const next = cardUi.pregenJobs.find(j => !j.posted && !j.settled);
    if (next) {
      next.posted = true;
      await genPost(
        next.key,
        cardPregenMsgs(girl, next.def, { openFail: next.kind === "fail" }),
        CARD_PREGEN_PRIO,
      );
      changed = true;
    }
  }

  if (changed) {
    scheduleSave();
    if (Cards.pregenAllReady(sess) || cardUi.pregenJobs.every(j => j.settled)) {
      finishRoundPregenIfReady();
    } else if (document.body.classList.contains("card-mode")) {
      renderCardTable();
    } else {
      renderCrests();
    }
  }
}

function finishRoundPregenIfReady() {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "pregen") return;
  // 補齊／踢掉弱台詞
  const girl = girlForSession();
  for (const inst of Cards.roundCardInstances(sess)) {
    const def = Cards.cardById(inst.cardId);
    inst.pregen ??= { status: "idle", line: null, lineFail: null };
    if (Cards.isWeakLine?.(inst.pregen.line)) {
      inst.pregen.line = cannedForDef(def, girl, false);
    }
    if (def?.openChain && Cards.isWeakLine?.(inst.pregen.lineFail)) {
      inst.pregen.lineFail = cannedForDef(def, girl, true);
    }
    inst.pregen.status = "done";
  }
  // 進 ready 待命——不自動開打；看板燈亮後玩家再按
  const r = Cards.markPregenComplete(state);
  cardUi.pregenJobs = [];
  cardUi.pregenStarted = false;
  if (!r.ok) {
    toast(r.err || "預產結算失敗", "bad");
    return;
  }
  const gname = girl?.name || "她";
  toast(`${gname} 的回應備妥了——右下角燈亮了`, "good");
  scheduleSave();
  // 看板模式已在主畫面：刷新燈；約會若還在牌桌 UI 則畫待命
  if (document.body.classList.contains("card-mode") && sess.mode === "date") {
    renderCardTable();
  } else {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    const view = $("#card-table-view");
    if (view) view.classList.add("hidden");
    renderAll();
  }
}

/** ready／round_play 開打前再掃一次：弱台詞補罐頭（防存檔沖掉） */
function hardenRoundPregenLines() {
  const sess = state.cardSession;
  if (!sess || (sess.phase !== "ready" && sess.phase !== "round_play" && sess.phase !== "pregen")) return;
  const girl = girlForSession();
  if (!girl) return;
  for (const inst of Cards.roundCardInstances(sess)) {
    const def = Cards.cardById(inst.cardId);
    inst.pregen ??= { status: "done", line: null, lineFail: null };
    if (Cards.isWeakLine?.(inst.pregen.line)) {
      inst.pregen.line = cannedForDef(def, girl, false);
    }
    if (def?.openChain && Cards.isWeakLine?.(inst.pregen.lineFail)) {
      inst.pregen.lineFail = cannedForDef(def, girl, true);
    }
  }
}

/** 關牌桌 UI，但保留 cardSession（背景預產／待命） */
function dismissCardTableUiKeepSession() {
  document.body.classList.remove("card-mode", "has-ct-figure");
  clearCardTableDom();
  const view = $("#card-table-view");
  if (view) view.classList.add("hidden");
}

/** 出卡後：預產已備好，不再現場等 AI */
function beginCardPlayAi(_girl, play) {
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  if (play?.ok) {
    play.fromAi = !!play.fromPregen;
  }
}

async function genCardPlayOrder() {
  // 現場出卡 AI 已廢；預產走 genRoundPregenOrders
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

// 釋放成功:她脫離「被召喚」狀態回到你身邊,原本的動作(聊天/約會)接著開始(費用已在進觀戰時付過)
function rescueFromWatch(s) {
  const { playerType, playerLocation } = watchSession;
  watchSession.ended = true;
  chatAbort?.abort();
  if (s.summoner) s.summoner.taken = null;
  simRescueOf(s);   // 回報伺服器:她掙脫召喚
  vnShow("", `${s.name} 掙脫了召喚,回到你身邊!`, "sys");
  toast(`${s.name} 回來了!`, "good");
  setTimeout(() => {
    watchWith = null; watchSession = null;
    document.body.classList.remove("chat-mode");
    enterChat(s.id, playerType, playerLocation, true);
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
  const slot = timeSlot();
  const sch = s.schedule || {};
  return {
    character: {
      name: s.name, rarity: s.rarity, personality: s.personality,
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
    content_rating: state.settings.rating || "sfw",
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
  const nsfw = (state.settings.rating || "sfw") === "nsfw";
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
let simPatch = {};              // 待送的玩家動作:{succId: {seen:[actId], texts:{actId:text}, rescue}}
let simSyncBusy = false, lastSimSyncAt = 0;
let simSyncWaiters = [];        // force 同步排隊:busy 時後續 await 同一輪結果
function simBuf(s) { return (simPatch[s.id] ??= { seen: [], texts: {} }); }
function simTextOf(s, act) { if (act?.text && s?.summoner) simBuf(s).texts[act.id] = act.text; }   // 回填已生成文字
function simSeenOf(s, act) { if (!act || !s?.summoner) return; const p = simBuf(s); if (!p.seen.includes(act.id)) p.seen.push(act.id); if (act.text) p.texts[act.id] = act.text; }
function simRescueOf(s) { if (s?.summoner) simBuf(s).rescue = true; }

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
        body: JSON.stringify({ now: Date.now(), rating: state.settings.rating || "sfw", roster, seeds, patches,
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
    log(`${o.suName || "一位召喚師"} 纏上了 ${s?.name || "一位魅魔"}!`);
    toast(`⚠ ${o.suName || "召喚師"} 纏上了 ${s?.name || "魅魔"}`, "bad");
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
    toast("先結束進行中的牌局，再召喚看板娘", "bad");
    return;
  }
  const cost = kanbanCost();
  if (state.gold < cost) { toast(`召喚第 ${kanbanSuccubi().length + 1} 位看板娘需 ${cost} 金`, "bad"); return; }
  state.gold -= cost;
  (state.kanbans ??= []).push({ id, until: Date.now() + kanbanHours() * HOUR });
  state.lastKanbanId = id;
  log(`召喚 ${s.name} 為看板娘 -${cost} 金(第 ${state.kanbans.length} 位)`);
  toast(`${s.name} 來到你身邊——先組牌`, "good");
  // 牌制：召看板必須組牌（再開戰才預產）
  scheduleSave();
  if (cardSystemOn()) {
    openKanbanTable(id, { forceSetup: true });
  } else {
    renderAll();
  }
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

function kanbanSay(text) {
  // 無指定角色：用主看板娘半身
  const g = kanbanSuccubus();
  enqueueKanbanBubbles([{
    girlId: g?.id || null,
    name: g?.name || "",
    text,
    emotionDelta: 0,
  }]);
}

/** 多句氣泡依序播（M2 委託碎嘴：半身＋對話框；點一下繼續，不進全螢幕聊天） */
function enqueueKanbanBubbles(items) {
  if (!items?.length) return;
  for (const it of items) {
    if (!it?.text) continue;
    bubbleQueue.push({
      girlId: it.girlId || null,
      name: it.name || "",
      text: it.text,
      emotionDelta: it.emotionDelta || 0,
    });
  }
  pumpKanbanBubbles();
}

function hideBubbleOverlay() {
  const ov = document.getElementById("bubble-overlay");
  if (ov) ov.classList.add("hidden");
  bubbleShowing = false;
  clearTimeout(bubbleTimer);
  bubbleTimer = null;
}

function dismissBubble() {
  if (!bubbleShowing) return;
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
  if (!ov || !nameEl || !textEl) return;

  bindBubbleOverlayOnce();
  bubbleShowing = true;

  const girl = next.girlId
    ? state.succubi.find(x => x.id === next.girlId)
    : kanbanSuccubus();
  const gname = next.name || girl?.name || "";
  setBubblePortrait(girl || null);
  nameEl.textContent = gname || "……";
  textEl.textContent = next.text || "……";
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

  // 自動前進當後備；玩家點一下也可提早關
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => {
    if (!bubbleShowing) return;
    dismissBubble();
  }, 5200);
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
  if (!missing.length) return cutNote;
  if (!canWeaveNow()) {
    return `<div class="aff-line dim small">${have.length ? "" : "尚未成形——"}今晚讓她織夢,明早見到她的臉(M3)</div>`;
  }
  const what = have.length
    ? `還差 ${missing.map(k => SHOT_LABEL[k]).join("、")}`
    : "尚未成形——大頭照 / 半身 / 全身三張都還沒織";
  const why = !busy && lastWeaveError
    ? `<div class="aff-line small" style="color:var(--red)">上次失敗:${esc(lastWeaveError)}</div>` : "";
  return `<div class="aff-line dim small">${what}</div>${why}${cutNote}
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

  // v6 牌制：右下角狀態燈——準備中／可打牌／繼續／靠近
  if (cardSystemOn()) {
    const girls = isAsleep()
      ? []
      : kanbanSuccubi().filter(s => !s.ntr && !s.summoner?.taken);
    el.classList.toggle("hidden", !girls.length);
    el.innerHTML = girls.map(s => {
      const sess = state.cardSession?.girlId === s.id ? state.cardSession : null;
      const phase = sess?.phase || null;
      let label = "靠近";
      let extra = "";
      let title = `與 ${s.name} 互動`;
      if (phase === "pregen") {
        const prog = Cards.pregenProgress(sess);
        label = "準備中";
        extra = " pregen-busy";
        title = `${s.name} 正在準備回應（${prog.done}/${prog.total}）`;
      } else if (phase === "ready") {
        label = "可打牌";
        extra = " play-ready";
        title = `${s.name} 回應備妥——點擊開始`;
      } else if (phase === "round_play" || phase === "round_setup" || phase === "round_end") {
        label = "繼續";
        extra = " active-sess";
        title = `繼續與 ${s.name} 的牌局`;
      } else if (phase === "idle_present") {
        label = "靠近";
        extra = " active-sess";
      }
      const face = girlShot(s, "head");
      return `
      <button type="button" class="play-chip r-${s.rarity}${extra}" data-cid="${s.id}"
              title="${esc(title)}" ${phase === "pregen" ? "disabled" : ""}>
        ${face
          ? `<img class="play-chip-face" src="${esc(face)}" alt="">`
          : `<span class="play-chip-icon" aria-hidden="true">✦</span>`}
        <span class="play-chip-label">${label}</span>
        <span class="cname">${esc(s.name)}</span>
      </button>`;
    }).join("");
    el.querySelectorAll(".play-chip").forEach(b => {
      b.onclick = () => {
        if (b.disabled) {
          toast("她還在準備回應…", "");
          return;
        }
        openKanbanTable(b.dataset.cid);
      };
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

let cardUi = {
  injectPick: [],      // round_setup 勾選的 cardId 列表
  lastPlay: null,      // 上一張演出結果
  invOpen: true,
  invFilter: "all",    // all | speech | shatter
  invSelected: null,   // cardId 詳情
  handIdx: 0,          // round_play 手牌輪播索引
  injectIdx: 0,        // round_setup 牌庫輪播索引
  awaitReaction: false, // 出卡後必看反應，按「繼續」才往下
  // 出卡兩拍：action=你的動作旁白 → reply=她的預產回應
  reactBeat: null,     // null | "action" | "reply"
  // 輪末判定結果面板：null | "stay" | "leave"（不要跳回「靠近／離開」）
  endPanel: null,
  // 現場 AI 已廢（保留欄位相容）
  playAiPending: false,
  playAiKey: null,
  playAiToken: null,
  // 組牌後整輪預產
  pregenJobs: [],
  pregenStarted: false,
  pregenStartedAt: 0,
};

/** 出卡第一拍：動作旁白（誰、做了什麼） */
function playActionBeat(last, girl) {
  const def = last?.cardId ? Cards.cardById(last.cardId) : null;
  const kind = def?.kind || "speech";
  const action = (last.sceneStart || last.name || "……").trim();
  const pname = state.settings?.player || "你";
  if (kind === "girl_trait") {
    return {
      speaker: girl?.name || "她",
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
    meta: `「${esc(last.name || "")}」· 點一下看她的反應`,
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
    return;
  }
  Cards.ensureCardShop(state);
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
    const ownedSpeech = def && !def.shatterOnUse && Cards.invOwns(state, slot.cardId);
    const sold = slot.sold || ownedSpeech;
    const tag = def?.shatterOnUse ? "碎" : "話術";
    const sale = slot.isSale && !sold ? `<span class="card-sale">特價</span>` : "";
    const canBuy = !sold && state.gold >= price;
    return `<div class="shop-item card-shop-item${sold ? " sold" : ""}">
      <span class="sname"><span class="card-tag ${def?.shatterOnUse ? "shatter" : "speech"}">${tag}</span>${esc(name)} ${sale}
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

  renderCardInventoryPanel();
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
      const kindCls = r.shatterOnUse ? "shatter" : "speech";
      const countTxt = r.shatterOnUse ? `×${r.count}` : (starter ? "底" : "");
      return `<button type="button" class="card-inv-btn ${kindCls}${on ? " on" : ""}" data-cid="${r.cardId}" title="${esc(r.name)}">
        <span class="cib-name">${esc(r.name)}</span>
        <span class="cib-meta">${esc(r.rarity || "N")}${countTxt ? " · " + countTxt : ""}</span>
      </button>`;
    }).join("");
    invBtns.querySelectorAll("[data-cid]").forEach(b => {
      b.onclick = () => {
        const id = b.dataset.cid;
        cardUi.invSelected = cardUi.invSelected === id ? null : id;
        renderCardInventoryPanel();
      };
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
  const kind = def.shatterOnUse ? "高級碎卡" : "話術";
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
  if (eff) {
    const bits = [];
    if (eff.forceAnotherRound) bits.push("強制再一輪");
    if (Array.isArray(eff.setFlags) && eff.setFlags.length) bits.push("旗標：" + eff.setFlags.join("、"));
    if (eff.guardDelta) bits.push(`防備 ${eff.guardDelta > 0 ? "+" : ""}${eff.guardDelta}`);
    if (eff.cravingDelta) bits.push(`飢渴 ${eff.cravingDelta > 0 ? "+" : ""}${eff.cravingDelta}`);
    if (eff.mentionErrand) bits.push("可提待辦");
    if (bits.length) effLine = bits.join(" · ");
  }
  const countLine = def.shatterOnUse
    ? `持有 <b>${row.count}</b> 張 · 確認打出後 −1（失敗開門也碎）`
    : `永久持有${starter ? " · <b>創角底色</b>" : ""} · 打出不碎`;

  return `
    <div class="cid-head">
      <span class="card-tag ${def.shatterOnUse ? "shatter" : "speech"}">${kind}</span>
      <span class="cid-rarity r-${esc(def.rarity || "N")}">${esc(def.rarity || "N")}</span>
      <h3 class="cid-title">${esc(def.name)}</h3>
    </div>
    <p class="cid-scene">${esc(def.sceneStart || "（無場景句）")}</p>
    <div class="cid-rows">
      <div class="cid-row"><span class="k">持有</span><span class="v">${countLine}</span></div>
      <div class="cid-row"><span class="k">標籤</span><span class="v">${esc(tags)}</span></div>
      <div class="cid-row"><span class="k">關係門檻</span><span class="v">${esc(minSt)}</span></div>
      <div class="cid-row"><span class="k">鍊</span><span class="v">${esc(openLine)}</span></div>
      ${emoLine ? `<div class="cid-row"><span class="k">感情骰</span><span class="v">${esc(emoLine)}</span></div>` : ""}
      ${effLine ? `<div class="cid-row"><span class="k">效果</span><span class="v">${esc(effLine)}</span></div>` : ""}
      ${def.price ? `<div class="cid-row"><span class="k">參考價</span><span class="v">${def.price} 金</span></div>` : ""}
    </div>
    ${def.promptHint ? `<p class="cid-hint dim small">${esc(def.promptHint)}</p>` : ""}
    <button type="button" class="cid-close" id="cid-close">收起說明</button>`;
}

// ===== 創角輪巡（全新／清空重來）=====
// 姓名 → 心理測驗 ×5 → 體型 → 喜好 → 依分數配 1 張 starter 話術

const ONBOARD_QUIZ = [
  {
    id: "q_first",
    text: "店裡來了個明顯彆扭的人。你開口比較像？",
    choices: [
      { id: "a", label: "「……別緊張。慢慢來就好。」", tags: { soft: 2, listen: 1 } },
      { id: "b", label: "「有話直說，我聽得懂。」", tags: { blunt: 2 } },
      { id: "c", label: "「怎麼，怕我吃人？」", tags: { tease: 2, joke: 1 } },
      { id: "d", label: "「先坐下。聽我說。」", tags: { command: 2 } },
    ],
  },
  {
    id: "q_ask",
    text: "她問你：「你到底要我做什麼？」你會？",
    choices: [
      { id: "a", label: "把需求拆成一件一件，講清楚先做哪件。", tags: { errand: 2, blunt: 1 } },
      { id: "b", label: "反問她現在最想／最怕什麼。", tags: { listen: 2, soft: 1 } },
      { id: "c", label: "半開玩笑丟一句，看她怎麼接。", tags: { tease: 2, joke: 1 } },
      { id: "d", label: "直接下指令，不留模糊地帶。", tags: { command: 2 } },
    ],
  },
  {
    id: "q_tense",
    text: "氣氛突然緊起來——她眼神冷了半拍。你？",
    choices: [
      { id: "a", label: "先軟化語氣，把聲音放輕。", tags: { soft: 2, awkward: 1 } },
      { id: "b", label: "照實說你在想什麼，不包裝。", tags: { blunt: 2 } },
      { id: "c", label: "丟個無關痛癢的玩笑，把空氣掀過去。", tags: { joke: 2, tease: 1 } },
      { id: "d", label: "不硬找話，就站在旁邊陪著。", tags: { silence: 2, listen: 1 } },
    ],
  },
  {
    id: "q_good",
    text: "她把一件難事做成了。你第一反應是？",
    choices: [
      { id: "a", label: "挑一個具體細節認真稱讚。", tags: { praise: 2, soft: 1 } },
      { id: "b", label: "「不錯。」——短、真、不囉嗦。", tags: { blunt: 1, silence: 1, praise: 1 } },
      { id: "c", label: "帶點刺：「終於啊。」但眼神是笑的。", tags: { tease: 2, joke: 1 } },
      { id: "d", label: "馬上問下一件待辦要不要一起排。", tags: { errand: 2 } },
    ],
  },
  {
    id: "q_quiet",
    text: "兩人安靜坐著，誰也沒硬找話題。你覺得？",
    choices: [
      { id: "a", label: "這樣很好——沉默也可以是陪伴。", tags: { silence: 2, listen: 1 } },
      { id: "b", label: "有點慌，會笨拙地丟一句關心。", tags: { awkward: 2, soft: 1 } },
      { id: "c", label: "找個輕的玩笑或小事打破靜默。", tags: { joke: 2 } },
      { id: "d", label: "把節奏拉回你身上，開下一個話題。", tags: { command: 1, blunt: 1, errand: 1 } },
    ],
  },
];

const ONBOARD_BODY = [
  { id: "slim", label: "精瘦", desc: "線條乾淨，站著也輕" },
  { id: "average", label: "普通", desc: "不張揚，剛剛好" },
  { id: "solid", label: "厚實", desc: "有存在感、好靠" },
  { id: "tall", label: "高挑", desc: "視線容易落到你這" },
  { id: "soft", label: "圓潤", desc: "看起來好相處" },
];

const ONBOARD_PREFS = [
  { id: "gentle", label: "溫柔安撫", tags: { soft: 2 } },
  { id: "direct", label: "有話直說", tags: { blunt: 2 } },
  { id: "tease", label: "帶刺調侃", tags: { tease: 2, joke: 1 } },
  { id: "lead", label: "掌握節奏", tags: { command: 2 } },
  { id: "shy_care", label: "笨拙關心", tags: { awkward: 2 } },
  { id: "humor", label: "用笑化解", tags: { joke: 2 } },
  { id: "listen", label: "多聽少說", tags: { listen: 2, silence: 1 } },
  { id: "praise", label: "認真稱讚", tags: { praise: 2 } },
  { id: "practical", label: "盯進度做事", tags: { errand: 2 } },
  { id: "quiet", label: "安靜陪著", tags: { silence: 2 } },
];

const ONBOARD_PREF_MAX = 3;

/** 輪巡步驟：intro, name, quiz0..quizN-1, body, prefs, result */
function onboardStepMeta() {
  const nQ = ONBOARD_QUIZ.length;
  // indices: 0 intro, 1 name, 2..1+nQ quiz, then body, prefs, result
  return {
    intro: 0,
    name: 1,
    quiz0: 2,
    body: 2 + nQ,
    prefs: 3 + nQ,
    result: 4 + nQ,
    total: 5 + nQ,
    nQ,
  };
}

let onboardUi = {
  step: 0,
  name: "",
  quiz: {},       // qid → choiceId
  body: null,
  prefs: [],      // pref ids
  resultCardId: null,
  started: false,
};

function needsStarterPick() {
  if (!cardSystemOn()) return false;
  return !state.playerProfile?.starterSpeechCardId;
}

function resetOnboardUi() {
  onboardUi = {
    step: 0,
    name: state?.playerProfile?.name || state?.settings?.player || "",
    quiz: {},
    body: null,
    prefs: [],
    resultCardId: null,
    started: true,
  };
}

function addTags(scores, tags, mult = 1) {
  if (!tags) return;
  for (const [k, v] of Object.entries(tags)) {
    scores[k] = (scores[k] || 0) + v * mult;
  }
}

function computeOnboardScores() {
  const scores = Object.create(null);
  for (const q of ONBOARD_QUIZ) {
    const cid = onboardUi.quiz[q.id];
    const ch = q.choices.find(c => c.id === cid);
    if (ch) addTags(scores, ch.tags, 1);
  }
  for (const pid of onboardUi.prefs) {
    const p = ONBOARD_PREFS.find(x => x.id === pid);
    if (p) addTags(scores, p.tags, 1.25); // 喜好略加重
  }
  // 體型微調（很輕，不當主軸）
  const bodyBoost = {
    slim: { silence: 0.3, blunt: 0.2 },
    average: { listen: 0.2, soft: 0.2 },
    solid: { command: 0.3, praise: 0.2 },
    tall: { command: 0.2, tease: 0.2 },
    soft: { soft: 0.4, awkward: 0.2 },
  };
  if (onboardUi.body && bodyBoost[onboardUi.body]) {
    addTags(scores, bodyBoost[onboardUi.body], 1);
  }
  return scores;
}

function finishOnboardPickCard() {
  const scores = computeOnboardScores();
  onboardUi.resultCardId = Cards.pickStarterByScores(scores);
  return onboardUi.resultCardId;
}

function canAdvanceOnboard(step) {
  const m = onboardStepMeta();
  if (step === m.intro) return true;
  if (step === m.name) return !!(onboardUi.name || "").trim();
  if (step >= m.quiz0 && step < m.body) {
    const q = ONBOARD_QUIZ[step - m.quiz0];
    return !!(q && onboardUi.quiz[q.id]);
  }
  if (step === m.body) return !!onboardUi.body;
  if (step === m.prefs) return onboardUi.prefs.length >= 1 && onboardUi.prefs.length <= ONBOARD_PREF_MAX;
  if (step === m.result) return !!onboardUi.resultCardId;
  return false;
}

function commitOnboard() {
  const name = (onboardUi.name || "").trim().slice(0, 12) || "主人";
  const cardId = onboardUi.resultCardId || finishOnboardPickCard();
  const r = Cards.grantStarter(state, cardId);
  if (!r.ok) { toast(r.err || "創角失敗", "bad"); return false; }
  state.playerProfile.name = name;
  state.playerProfile.body = onboardUi.body || "";
  state.playerProfile.prefs = [...onboardUi.prefs];
  state.playerProfile.quiz = { ...onboardUi.quiz };
  state.playerProfile.starterSpeechCardId = cardId;
  state.settings.player = name;
  const def = Cards.cardById(cardId);
  const bodyL = ONBOARD_BODY.find(b => b.id === onboardUi.body)?.label || onboardUi.body;
  log(`創角完成：${name}／${bodyL}／話術「${def?.name || cardId}」`);
  toast(`你的底色話術：${def?.name || cardId}`, "good");
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

  // progress dots
  const prog = $("#onboard-progress");
  if (prog) {
    // 合併顯示：歡迎·姓名·測驗(當1)·體型·喜好·結果
    const labels = ["迎", "名", "測", "型", "好", "卡"];
    const phase = step === m.intro ? 0
      : step === m.name ? 1
      : step >= m.quiz0 && step < m.body ? 2
      : step === m.body ? 3
      : step === m.prefs ? 4
      : 5;
    prog.innerHTML = labels.map((lb, i) =>
      `<span class="onboard-dot${i === phase ? " on" : i < phase ? " done" : ""}" title="${lb}"></span>`
    ).join("");
  }

  const panel = $("#onboard-panel");
  const nav = $("#onboard-nav");
  if (!panel || !nav) return;

  // force reflow animation
  panel.style.animation = "none";
  void panel.offsetWidth;
  panel.style.animation = "";

  if (step === m.intro) {
    panel.innerHTML = `
      <h2>歡迎來到魅魔萬事屋</h2>
      <p class="lead">在召喚任何人之前，先弄清楚——你是用什麼樣子的聲音，跟她們說話的。</p>
      <p class="lead">接下來會問你姓名、幾題直覺題、體型與喜好。<b>不會讓你手挑卡</b>：系統會依你的答案，配一張永久的基礎話術（不碎）。</p>`;
    nav.innerHTML = `<span></span><button type="button" class="ob-next" id="ob-next">開始</button>`;
  } else if (step === m.name) {
    panel.innerHTML = `
      <h2>怎麼稱呼你</h2>
      <p class="lead">她們會用這個名字叫你。之後可在設定改顯示，但創角會記一筆。</p>
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
      <button type="button" class="ob-next" id="ob-next" ${canAdvanceOnboard(step) ? "" : "disabled"}>下一步</button>`;
  } else if (step >= m.quiz0 && step < m.body) {
    const qi = step - m.quiz0;
    const q = ONBOARD_QUIZ[qi];
    const picked = onboardUi.quiz[q.id];
    panel.innerHTML = `
      <h2>直覺測驗 ${qi + 1}/${m.nQ}</h2>
      <p class="ob-q">${esc(q.text)}</p>
      <div class="onboard-choices">
        ${q.choices.map(c => `
          <button type="button" class="onboard-choice${picked === c.id ? " selected" : ""}" data-qid="${q.id}" data-cid="${c.id}">
            ${esc(c.label)}
          </button>`).join("")}
      </div>`;
    panel.querySelectorAll(".onboard-choice").forEach(b => {
      b.onclick = () => {
        onboardUi.quiz[b.dataset.qid] = b.dataset.cid;
        renderStarterModal();
      };
    });
    nav.innerHTML = `
      <button type="button" class="ob-back" id="ob-back">上一步</button>
      <button type="button" class="ob-next" id="ob-next" ${canAdvanceOnboard(step) ? "" : "disabled"}>下一步</button>`;
  } else if (step === m.body) {
    panel.innerHTML = `
      <h2>體型印象</h2>
      <p class="lead">不是數值，是她們第一眼對你的身體印象。</p>
      <div class="onboard-grid">
        ${ONBOARD_BODY.map(b => `
          <button type="button" class="onboard-choice${onboardUi.body === b.id ? " selected" : ""}" data-body="${b.id}">
            <b>${esc(b.label)}</b>
            <span class="dim">${esc(b.desc)}</span>
          </button>`).join("")}
      </div>`;
    panel.querySelectorAll("[data-body]").forEach(b => {
      b.onclick = () => { onboardUi.body = b.dataset.body; renderStarterModal(); };
    });
    nav.innerHTML = `
      <button type="button" class="ob-back" id="ob-back">上一步</button>
      <button type="button" class="ob-next" id="ob-next" ${canAdvanceOnboard(step) ? "" : "disabled"}>下一步</button>`;
  } else if (step === m.prefs) {
    panel.innerHTML = `
      <h2>你比較喜歡的相處方式</h2>
      <p class="lead">選 1～${ONBOARD_PREF_MAX} 項（已選 ${onboardUi.prefs.length}）。這會明顯影響配到哪張話術。</p>
      <div class="onboard-grid">
        ${ONBOARD_PREFS.map(p => `
          <button type="button" class="onboard-choice${onboardUi.prefs.includes(p.id) ? " selected" : ""}" data-pref="${p.id}">
            ${esc(p.label)}
          </button>`).join("")}
      </div>`;
    panel.querySelectorAll("[data-pref]").forEach(b => {
      b.onclick = () => {
        const id = b.dataset.pref;
        const i = onboardUi.prefs.indexOf(id);
        if (i >= 0) onboardUi.prefs.splice(i, 1);
        else if (onboardUi.prefs.length < ONBOARD_PREF_MAX) onboardUi.prefs.push(id);
        else toast(`最多選 ${ONBOARD_PREF_MAX} 項`, "");
        renderStarterModal();
      };
    });
    nav.innerHTML = `
      <button type="button" class="ob-back" id="ob-back">上一步</button>
      <button type="button" class="ob-next" id="ob-next" ${canAdvanceOnboard(step) ? "" : "disabled"}>看結果</button>`;
  } else {
    // result
    if (!onboardUi.resultCardId) finishOnboardPickCard();
    const def = Cards.cardById(onboardUi.resultCardId);
    const bodyL = ONBOARD_BODY.find(b => b.id === onboardUi.body)?.label || "—";
    const prefL = onboardUi.prefs.map(id => ONBOARD_PREFS.find(p => p.id === id)?.label || id).join("、");
    panel.innerHTML = `
      <h2>你的底色話術</h2>
      <p class="lead">依測驗與喜好配給——永久、不碎。之後仍可在商店買更多話術。</p>
      <div class="onboard-result-card">
        <div class="tag">STARTER · SPEECH</div>
        <h3>${esc(def?.name || onboardUi.resultCardId)}</h3>
        <p>${esc(def?.sceneStart || "")}</p>
      </div>
      <div class="onboard-summary">
        ${esc(onboardUi.name || "主人")} · ${esc(bodyL)} · ${esc(prefL || "—")}
      </div>`;
    nav.innerHTML = `
      <button type="button" class="ob-back" id="ob-back">上一步</button>
      <button type="button" class="ob-finish" id="ob-finish">進入萬事屋</button>`;
  }

  nav.querySelector("#ob-back")?.addEventListener("click", () => {
    if (onboardUi.step > 0) {
      // 從結果退回時清掉已算的卡，讓喜好還能改
      if (onboardUi.step === m.result) onboardUi.resultCardId = null;
      onboardUi.step--;
      renderStarterModal();
    }
  });
  nav.querySelector("#ob-next")?.addEventListener("click", () => {
    if (!canAdvanceOnboard(onboardUi.step)) return;
    if (onboardUi.step === m.name) {
      onboardUi.name = (onboardUi.name || "").trim().slice(0, 12);
    }
    if (onboardUi.step === m.prefs) {
      finishOnboardPickCard();
    }
    onboardUi.step++;
    renderStarterModal();
  });
  nav.querySelector("#ob-finish")?.addEventListener("click", () => {
    if (!commitOnboard()) return;
    onboardUi.started = false;
    renderAll();
  });
}

function girlForSession() {
  const id = state.cardSession?.girlId;
  return id ? state.succubi.find(x => x.id === id) : null;
}

// ── M3 約會牌局 ──────────────────────────────────────────

function dateLimitPerDay() {
  return Cards.d?.("dates_per_girl_per_day", DATE_LIMIT) ?? DATE_LIMIT;
}

function phoneCostRoll() {
  const range = Cards.d("phone_cost_range", [10, 30]);
  const lo = Array.isArray(range) ? (range[0] ?? 10) : 10;
  const hi = Array.isArray(range) ? (range[1] ?? 30) : 30;
  return randInt(lo, hi);
}

function dateAnswerRate(stage) {
  const t = Cards.d("answer_rate_by_stage", {
    stranger: 0.1, friend: 0.35, girlfriend: 0.6, wife: 0.8,
  });
  return t[stage] ?? t.stranger ?? 0.1;
}

function availableVenues() {
  const rating = state.settings?.rating || "sfw";
  return (Cards.venuesList?.() || []).filter(v => !v.nsfwOnly || rating === "nsfw");
}

function datesLeftToday(s) {
  const today = dayNum();
  const lim = dateLimitPerDay();
  if (s.datesToday?.day !== today) return lim;
  return Math.max(0, lim - (s.datesToday.count || 0));
}

/**
 * 打電話：扣電話費 → 接聽骰。
 * 失敗：金不退、不計 datesToday。
 * 成功：datesToday+1，展開場地選擇。
 */
function beginDateFlow(girlId) {
  if (!cardSystemOn()) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) { toast("她不在你身邊……", "bad"); return; }
  if (isKanban(girlId)) { toast("看板中不可約會——先結束店頭互動", "bad"); return; }
  if (state.gold < 0) { toast("負債中,先去做委託還債吧", "bad"); return; }
  if (Cards.sessionActive(state)) {
    toast("先結束進行中的牌局", "bad");
    return;
  }
  if (datesLeftToday(s) <= 0) {
    toast("今天約會夠多了,她需要休息", "bad");
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

  // 成功接聽才算一次約會額度
  const today = dayNum();
  if (s.datesToday?.day !== today) s.datesToday = { day: today, count: 0 };
  s.datesToday.count++;
  s.lastDateDay = today;
  s.lastChatDay = today;

  dateFlow = { girlId, phoneCost: cost };
  dateChooser = true;
  toast(`${s.name} 接了。要去哪？`, "good");
  scheduleSave();
  renderAll();
}

/** 付場地費 → 開約會牌桌（被召喚中則改觀戰） */
function confirmDateVenue(girlId, venueId) {
  if (!cardSystemOn()) return;
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (dateFlow?.girlId !== girlId) {
    toast("請先打電話", "bad");
    return;
  }
  const v = availableVenues().find(x => x.id === venueId)
    || (Cards.venuesList?.() || []).find(x => x.id === venueId);
  if (!v) { toast("找不到這個場地", "bad"); return; }
  if (state.gold < (v.fee || 0)) {
    toast(`場地費 ${v.fee} 金不夠`, "bad");
    return;
  }
  state.gold -= (v.fee || 0);
  log(`與 ${s.name} 去「${v.name}」約會 -${v.fee || 0} 金`);

  dateFlow = null;
  dateChooser = false;

  // 被召喚走：錢已付，改觀戰（舊機制）
  if (s.summoner?.taken) {
    log(`約 ${s.name} 出門——她卻被召喚到別人身邊`);
    enterWatch(s, "date", v.name);
    scheduleSave();
    return;
  }

  openDateTable(girlId, venueId);
}

function openDateTable(girlId, venueId) {
  if (!cardSystemOn()) { toast("卡牌系統未就緒", "bad"); return; }
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (isKanban(girlId)) { toast("看板中不可約會", "bad"); return; }
  if (Cards.sessionActive(state)) {
    toast("先結束進行中的牌局", "bad");
    return;
  }

  const venue = (Cards.venuesList?.() || []).find(x => x.id === venueId);
  const girlCards = Cards.buildGirlCards(s, {
    cravingMidOrHigh: !!craveTier(s),
  });
  const venueCards = Cards.buildVenueCards(venueId);
  if (!girlCards.length && !venueCards.length) {
    toast("這場約會沒有可用的卡", "bad");
    return;
  }

  const r = Cards.openSession(state, {
    mode: "date",
    girlId,
    girlCards,
    venueId,
    venueCards,
  });
  if (!r.ok) { toast(r.err, "bad"); return; }

  // 約會直接進組牌（已出門，不必再「陪伴」）
  const setup = Cards.enterRoundSetup(state);
  if (!setup.ok) { toast(setup.err, "bad"); return; }

  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.injectIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.endPanel = null;
  detailId = null;
  document.body.classList.add("card-mode");
  log(`約會牌桌・${s.name} @ ${venue?.name || venueId}（場地卡 ${venueCards.length}）`);
  toast(`抵達「${venue?.name || "約會地"}」——組牌開始`, "good");
  scheduleSave();
  renderAll();
}

/**
 * 開看板牌桌。
 * @param {{ forceSetup?: boolean }} opts forceSetup=召看板後強制進組牌
 *
 * 狀態：
 * - pregen：背景準備中，不進桌
 * - ready：備妥 → 开战進 round_play
 * - round_play / setup：回牌桌繼續
 * - 無 session / idle：組牌
 */
function openKanbanTable(girlId, opts = {}) {
  if (!cardSystemOn()) { toast("卡牌系統未就緒", "bad"); return; }
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  const s = state.succubi.find(x => x.id === girlId);
  if (!s || s.ntr) return;
  if (!isKanban(girlId)) { toast("她不在店頭，先召喚為看板娘", "bad"); return; }
  if (s.summoner?.taken) { toast("她正被召喚走", "bad"); return; }
  if (Cards.sessionActive(state) && state.cardSession.girlId !== girlId) {
    toast("先結束與另一人的牌局", "bad");
    return;
  }

  // 既有 session
  if (Cards.sessionActive(state) && state.cardSession.girlId === girlId) {
    const phase = state.cardSession.phase;

    // 背景預產中：留在看板，不開桌
    if (phase === "pregen") {
      const prog = Cards.pregenProgress(state.cardSession);
      toast(`她還在準備回應…（${prog.done}/${prog.total}）`, "");
      renderCrests();
      return;
    }

    // 燈亮：按了才開戰
    if (phase === "ready") {
      hardenRoundPregenLines();
      const r = Cards.beginPlayAfterPregen(state);
      if (!r.ok) { toast(r.err, "bad"); return; }
      cardUi.lastPlay = null;
      cardUi.handIdx = 0;
      cardUi.awaitReaction = false;
      cardUi.endPanel = null;
      document.body.classList.add("card-mode");
      toast("開始互動", "good");
      scheduleSave();
      renderAll();
      return;
    }

    document.body.classList.add("card-mode");
    if (opts.forceSetup && phase === "idle_present") {
      const setup = Cards.enterRoundSetup(state);
      if (!setup.ok) toast(setup.err, "bad");
    }
    renderCardTable();
    renderCrests();
    return;
  }

  // 新 session：組牌
  const girlCards = Cards.buildGirlCards(s, {
    cravingMidOrHigh: !!craveTier(s),
  });
  const r = Cards.openSession(state, { mode: "kanban", girlId, girlCards });
  if (!r.ok) { toast(r.err, "bad"); return; }
  const setup = Cards.enterRoundSetup(state);
  if (!setup.ok) { toast(setup.err, "bad"); return; }
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.handIdx = 0;
  cardUi.injectIdx = 0;
  cardUi.awaitReaction = false;
  cardUi.endPanel = null;
  cardUi.pregenJobs = [];
  cardUi.pregenStarted = false;
  document.body.classList.add("card-mode");
  log(`與 ${s.name} 開桌組牌（本體卡 ${girlCards.length}）`);
  scheduleSave(); renderAll();
}

/**
 * 結束牌桌並解除看板（產品鎖：互動結束／離開牌桌 = 她回後台，不再掛在店頭）。
 * 約會 mode 只關 session，不動看板。
 */
function endCardTableAndReleaseKanban(reason = "card_end") {
  const sess = state.cardSession;
  const girlId = sess?.girlId || null;
  const mode = sess?.mode || "kanban";
  const s = girlId ? state.succubi.find(x => x.id === girlId) : null;
  const gname = s?.name || "她";

  if (sess) Cards.closeSession(state, reason);
  cardUi.injectPick = [];
  cardUi.lastPlay = null;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.endPanel = null;
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  cardUi.pregenJobs = [];
  cardUi.pregenStarted = false;
  document.body.classList.remove("card-mode", "has-ct-figure");
  clearCardTableDom();

  if (mode === "kanban" && girlId) {
    state.kanbans = (state.kanbans || []).filter(k => k.id !== girlId);
    state.lastKanbanId = girlId; // 休息剪影仍顯示最後這位
    log(`${gname} 結束店頭互動，看板解除`);
    return { gname, released: true };
  }
  return { gname, released: false };
}

/** 中止牌桌（推出）：取消 AI pending、關 session、看板解除 */
function ejectCardTable(reason = "player_eject") {
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  const r = endCardTableAndReleaseKanban(reason);
  toast(r.released ? `${r.gname} 被推出店頭了` : "先到這吧", "");
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
}

function leaveCardTableUi() {
  // 預產中／待命／反應節拍：左上角「推出」= 中止這次靠近
  if (cardUi.awaitReaction
    || state.cardSession?.phase === "pregen"
    || state.cardSession?.phase === "ready") {
    ejectCardTable("player_eject");
    return;
  }
  // 打牌中不允許直接走；idle／輪末結束面板等用這條離開 = 解除看板
  const sess = state.cardSession;
  if (sess && (sess.phase === "round_play" || sess.phase === "round_setup" || sess.phase === "round_end")) {
    toast("先告一段落，或直接結束這次靠近", "bad");
    return;
  }
  if (cardUi.endPanel) {
    // 輪末面板開著時走同一套結束
    finishEndPanel("stop");
    return;
  }
  if (sess) {
    const r = endCardTableAndReleaseKanban("player_leave");
    toast(r.released ? `${r.gname} 離開店頭了` : "先到這吧", "");
  } else {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
  }
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
}

function dismissCardSession() {
  if (!state.cardSession) {
    document.body.classList.remove("card-mode", "has-ct-figure");
    clearCardTableDom();
    renderAll();
    pumpKanbanBubbles();
    return;
  }
  // 預產／待命／反應節拍 → 與「推出」相同，允許中止
  if (cardUi.awaitReaction
    || state.cardSession.phase === "pregen"
    || state.cardSession.phase === "ready") {
    ejectCardTable("player_dismiss");
    return;
  }
  if (state.cardSession.phase === "round_play") {
    toast("正互動中——先按「結束本輪」", "bad");
    return;
  }
  // setup／idle／round_end：先離開 = 結束這次 + 解除看板
  const r = endCardTableAndReleaseKanban("player_dismiss");
  toast(r.released ? `${r.gname} 離開店頭了` : "先離開了", "");
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
}

function applyPlaySideEffects(girl, result) {
  if (!girl || !result?.ok) return;
  if (result.emotionDelta) {
    const d = applyAffection(girl, result.emotionDelta);
    // applyAffection 已寫入；顯示用 result 原值
    void d;
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

/** 碎卡確認後真正打出（台詞已在 pregen 備好） */
function commitHandPlay(instanceId, girl, stage) {
  const r = Cards.commitPlay(state, instanceId, { stage, guardHigh: guardActive(girl) });
  if (!r.ok) { toast(r.err, "bad"); return; }
  cardUi.lastPlay = r;
  cardUi.awaitReaction = true;
  cardUi.reactBeat = "action"; // 先播動作，再點一下才出她的回應
  cardUi.endPanel = null;
  applyPlaySideEffects(girl, r);
  beginCardPlayAi(girl, r);
  const n = state.cardSession?.hand?.length || 0;
  if (cardUi.handIdx >= n) cardUi.handIdx = Math.max(0, n - 1);
  scheduleSave(); renderCardTable();
}

/** 看完出卡反應 → 若本輪次數用完則進輪末判定；否則回手牌 */
function ackPlayReaction() {
  const sess = state.cardSession;
  const girl = girlForSession();
  const stage = girl?.stage || "stranger";
  const last = cardUi.lastPlay;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
  if (!sess) {
    renderCardTable();
    return;
  }
  // 次數用完（或引擎已標 roundEnded）→ 進輪末，只做「能否再來一輪」
  if (last?.roundEnded || sess.phase === "round_end" || Cards.playsLeft(sess) <= 0) {
    if (sess.phase === "round_play") {
      const er = Cards.playerEndRound(state);
      if (!er.ok) { toast(er.err, "bad"); renderCardTable(); return; }
    }
    resolveRoundEndToPanel(girl, stage);
    return;
  }
  scheduleSave();
  renderCardTable();
}

/** 強制退出牌桌全螢幕（清 session／card-mode），避免主畫面被藏成空白 */
function exitCardModeFully(msg = "") {
  cardUi.endPanel = null;
  cardUi.awaitReaction = false;
  cardUi.reactBeat = null;
  cardUi.lastPlay = null;
  cardUi.injectPick = [];
  cardUi.handIdx = 0;
  cardUi.playAiPending = false;
  cardUi.playAiKey = null;
  cardUi.playAiToken = null;
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
    cardUi.endPanel = "stay";
    toast(`${gname} 還願意再來一輪`, "good");
    scheduleSave();
    renderCardTable();
    return;
  }
  // 約會 resolveRoundEnd 會直接 closeSession → sessionActive=false
  // 若仍留 card-mode，主 UI 被 visibility:hidden，牌桌又畫不出 → 一片空白
  if (r.closed || mode === "date" || !Cards.sessionActive(state)) {
    exitCardModeFully(mode === "date" || r.closed ? "約會到此散了" : `${gname} 離開了`);
    return;
  }
  // 看板：session 仍在 idle_present，顯示「結束並離開」
  cardUi.endPanel = "leave";
  toast(`${gname} 不想再繼續了`, "");
  scheduleSave();
  renderCardTable();
}

/** 輪末面板：再來一輪 → 組牌；結束／先到這 → 關牌桌並解除看板 */
function finishEndPanel(choice) {
  const sess = state.cardSession;
  const girl = girlForSession();
  if (choice === "continue" && cardUi.endPanel === "stay") {
    cardUi.endPanel = null;
    cardUi.injectPick = [];
    cardUi.injectIdx = 0;
    // resolveRoundEnd 留下時已 phase=round_setup
    if (sess && sess.phase !== "round_setup") {
      const r = Cards.enterRoundSetup(state);
      if (!r.ok) toast(r.err, "bad");
    }
    scheduleSave();
    renderCardTable();
    return;
  }
  // 結束這次：看板模式一併解除在任；約會／無 session 也一律退 card-mode
  const mode = sess?.mode;
  if (!sess || !Cards.sessionActive(state)) {
    exitCardModeFully(mode === "date" ? "約會到此散了" : "先到這吧");
    return;
  }
  const r = endCardTableAndReleaseKanban("round_end_leave");
  // endCardTable 已清 card-mode；再 renderAll 保險
  toast(r.released ? `${r.gname} 離開店頭了` : (mode === "date" ? "約會到此散了" : "先到這吧"), "");
  scheduleSave();
  renderAll();
  pumpKanbanBubbles();
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
      def.shatterOnUse ? "用後消失" : "可反覆使用",
      def.openChain ? `開門 ${def.openChain.attr}×${def.openChain.k}` : "",
      def.effect?.forceAnotherRound ? "她這回走不了" : "",
      tags,
      ...extraLines,
    ].filter(Boolean);
    setCtConfirm(`
      <div class="card-peek">
        <div class="card-peek-name">${esc(def.name)}</div>
        <div class="card-peek-scene">${esc(def.sceneStart || def.promptHint || "（沒有更多描述）")}</div>
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

/** 牌桌立繪：半身優先，沒圖用字首 fallback */
function setCtPortrait(girl) {
  const img = $("#ct-portrait-img");
  const fb = $("#ct-portrait-fallback");
  if (!img || !fb) return;
  const url = girl ? girlShot(girl, "half") : "";
  if (url) {
    if (img.getAttribute("src") !== url) img.src = url;
    img.alt = girl?.name || "";
    img.classList.remove("hidden");
    fb.classList.add("hidden");
    document.body.classList.add("has-ct-figure");
  } else {
    img.removeAttribute("src");
    img.alt = "";
    img.classList.add("hidden");
    fb.textContent = (girl?.name || "？").slice(0, 1);
    fb.classList.remove("hidden");
    document.body.classList.remove("has-ct-figure");
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

/** 牌桌頂欄：等 AI 時左＝推出、右藏；其餘還原 */
function syncCardTableChrome({ ejectMode = false } = {}) {
  const back = $("#card-table-back");
  const close = $("#card-table-close");
  if (back) {
    back.textContent = ejectMode ? "推出" : "‹ 返回";
    back.title = ejectMode ? "中止這次靠近，她離開店頭" : "";
    back.classList.toggle("ct-eject-btn", ejectMode);
  }
  if (close) {
    close.classList.toggle("hidden", ejectMode);
    if (!ejectMode) {
      close.textContent = "先走";
      close.title = "結束這次靠近";
    }
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
  const gname = girl?.name || "？";
  const stage = girl?.stage || "stranger";
  const title = $("#card-table-title");
  if (title) {
    let place = "店頭";
    if (sess.mode === "date") {
      const vn = (Cards.venuesList?.() || []).find(x => x.id === sess.venueId);
      place = vn ? `約會・${vn.name}` : "約會";
    }
    title.textContent = `${gname} · ${place} · ${phaseLabel(sess.phase)}`;
  }

  setCtPortrait(girl);
  // 有碎卡確認或長按詳情時不要整頁清掉；本輪開始時清
  if (!sess.pending && !cardUi._keepPeek) setCtConfirm("");
  cardUi._keepPeek = false;

  // ── 出卡反應兩拍：①動作旁白 → 點一下 → ②她的預產回應 ──
  if (cardUi.awaitReaction && cardUi.lastPlay) {
    const last = cardUi.lastPlay;
    if (!cardUi.reactBeat) cardUi.reactBeat = "action";
    syncCardTableChrome({ ejectMode: false });

    // ① 玩家／場面動作（sceneStart）
    if (cardUi.reactBeat === "action") {
      const beat = playActionBeat(last, girl);
      setCtVn({
        name: beat.speaker,
        text: beat.text,
        meta: beat.meta,
      });
      // 對話框可點
      const vn = $("#ct-vn");
      if (vn) {
        vn.classList.add("ct-vn-tap");
        vn.onclick = () => advanceReactBeat();
      }
      setCtHand(`
        <div class="ct-react-beat">
          <div class="dim small ct-react-wait">點對話框繼續——她會接下一句</div>
          <div class="detail-actions card-actions">
            <button type="button" class="cyan" id="ct-ack-react">繼續</button>
          </div>
        </div>`);
      $("#ct-ack-react").onclick = () => advanceReactBeat();
      return;
    }

    // ② 她的回應（預產 AI／罐頭）
    const openNote = last.open && !last.open.success
      ? "沒接住"
      : last.open?.success
        ? "門開了"
        : "";
    const feel = last.feelLabel || Cards.emotionFeelLabel?.(last.emotionDelta) || "";
    const deltaTxt = `情感 ${last.emotionDelta >= 0 ? "+" : ""}${last.emotionDelta}${feel ? ` · ${feel}` : ""}`;
    const more = last.roundEnded
      ? "這是本輪最後一次——繼續後判定她願不願意再來一輪"
      : `之後還能應付 ${last.playsLeft ?? "?"} 次`;
    const srcNote = last.fromPregen || last.fromAi ? "" : " · 保底";

    let showLine = last.girlLine || "";
    if (Cards.isWeakLine?.(showLine)) {
      showLine = Cards.girlReactionLine({
        stage: girl?.stage || "stranger",
        emotionDelta: last.emotionDelta || 0,
        openFail: !!(last.open && last.open.success === false),
      });
      last.girlLine = showLine;
    }
    setCtVn({
      name: gname,
      text: showLine || "我聽到了。",
      meta: `${esc(deltaTxt)}${openNote ? ` · ${openNote}` : ""}${last.shattered ? " · 卡消了" : ""}${srcNote} · ${esc(more)}`,
    });
    const vn2 = $("#ct-vn");
    if (vn2) {
      vn2.classList.add("ct-vn-tap");
      vn2.onclick = () => advanceReactBeat();
    }
    setCtHand(`
      <div class="ct-react-beat">
        <div class="dim small ct-react-you">剛才：${esc(last.name || "")}</div>
        <div class="detail-actions card-actions">
          <button type="button" class="cyan" id="ct-ack-react">${
            last.roundEnded ? "繼續（輪末判定）" : "繼續"
          }</button>
        </div>
      </div>`);
    $("#ct-ack-react").onclick = () => advanceReactBeat();
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

  // ── 預產中（多半是約會；看板已回主畫面）────────────────
  if (sess.phase === "pregen") {
    // 看板誤進桌：踢回主畫面繼續背景產
    if (sess.mode === "kanban") {
      if (!cardUi.pregenStarted) beginRoundPregen(girl);
      dismissCardTableUiKeepSession();
      renderAll();
      return;
    }
    syncCardTableChrome({ ejectMode: true });
    if (!cardUi.pregenStarted) beginRoundPregen(girl);
    const prog = Cards.pregenProgress(sess);
    setCtVn({
      name: gname,
      text: "",
      textHtml: `<span class="ct-typing" aria-label="她正在準備"><i></i><i></i><i></i></span>`,
      meta: `正在依你組的牌準備回應… <b>${prog.done}</b>/${prog.total}`,
    });
    setCtHand(`
      <div class="ct-react-beat">
        <div class="dim small ct-react-wait">備妥後會提示開戰——左上角可「推出」中止</div>
      </div>`);
    return;
  }

  // ── 待命 ready（約會牌桌內：按開始才進 play）──────────
  if (sess.phase === "ready") {
    syncCardTableChrome({ ejectMode: true });
    // 看板應在主畫面等燈；誤進桌則踢回
    if (sess.mode === "kanban") {
      dismissCardTableUiKeepSession();
      renderAll();
      return;
    }
    setCtVn({
      name: gname,
      text: "回應都備好了。準備好就開始。",
      meta: `今晚約還肯應付 <b>${sess.nLeft}</b> 次`,
    });
    setCtHand(`
      <div class="detail-actions card-actions">
        <button type="button" class="cyan" id="ct-start-play">開始打牌</button>
        <button type="button" id="ct-eject-ready">先離開</button>
      </div>`);
    $("#ct-start-play").onclick = () => {
      hardenRoundPregenLines();
      const r = Cards.beginPlayAfterPregen(state);
      if (!r.ok) { toast(r.err, "bad"); return; }
      cardUi.lastPlay = null;
      cardUi.handIdx = 0;
      scheduleSave();
      renderCardTable();
    };
    $("#ct-eject-ready").onclick = () => ejectCardTable("player_dismiss");
    return;
  }

  // 非反應／預產：還原頂欄
  syncCardTableChrome({ ejectMode: false });

  // ── 輪末結果面板：只問「能否再來一輪」；結束＝解除看板 ──
  if (cardUi.endPanel === "stay" || cardUi.endPanel === "leave") {
    const stay = cardUi.endPanel === "stay";
    setCtVn({
      name: gname,
      text: stay
        ? `這輪結束了。${gname} 還願意再來一輪。`
        : `這輪結束了。${gname} 不想再繼續了。`,
      meta: stay
        ? "再來一輪會重新組牌、重新計出手次數"
        : (sess.mode === "date" ? "約會到此散了" : "結束後她會離開店頭（看板解除）"),
    });
    setCtHand(`
      <div class="detail-actions card-actions">
        ${stay
          ? `<button type="button" class="cyan" id="ct-end-continue">再來一輪</button>
             <button type="button" id="ct-end-stop">結束並離開</button>`
          : `<button type="button" class="cyan" id="ct-end-stop">結束並離開</button>`}
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

  // ── 陪伴（剛開桌／尚未開戰）────────────────────────────
  if (sess.phase === "idle_present") {
    cardUi.endPanel = null;
    setCtVn({
      name: gname,
      text: `${gname} 在店頭陪著你。可以開始互動；離開的話她會回後台。`,
      meta: `${esc(stageLabel(stage))} · 她願意應付的次數由關係決定`,
    });
    setCtHand(`
      <div class="detail-actions card-actions">
        <button type="button" class="cyan" id="ct-start-setup">開始互動</button>
        <button type="button" id="ct-dismiss">結束並離開</button>
      </div>`);
    $("#ct-start-setup").onclick = () => {
      const r = Cards.enterRoundSetup(state);
      if (!r.ok) { toast(r.err, "bad"); return; }
      cardUi.injectPick = [];
      cardUi.endPanel = null;
      cardUi.awaitReaction = false;
      scheduleSave(); renderCardTable();
    };
    $("#ct-dismiss").onclick = () => dismissCardSession();
    return;
  }

  // ── 準備：押入（精簡標題卡）────────────────────────────
  if (sess.phase === "round_setup") {
    const maxI = Cards.maxInject(state);
    const inv = Cards.inventoryList(state);
    const pickedCount = Object.create(null);
    for (const id of cardUi.injectPick) pickedCount[id] = (pickedCount[id] || 0) + 1;

    setCtVn({
      name: gname,
      text: `組好這輪要帶的牌。按「開始」後她會依整副牌預先準備回應，備妥才能打。`,
      meta: `已帶 <b>${cardUi.injectPick.length}</b>/${maxI}`,
    });

    if (!inv.length) {
      setCtHand(`
        <div class="dim small ct-empty">庫裡什麼都沒有——就這樣開始也行</div>
        <div class="detail-actions card-actions">
          <button type="button" class="cyan" id="ct-deal">開始準備</button>
          <button type="button" id="ct-cancel-setup">取消</button>
        </div>`);
    } else {
      cardUi.injectIdx = Math.min(Math.max(0, cardUi.injectIdx || 0), inv.length - 1);
      const row = inv[cardUi.injectIdx];
      const picked = pickedCount[row.cardId] || 0;
      const maxThis = row.shatterOnUse ? row.count : 1;
      const canAdd = cardUi.injectPick.length < maxI && picked < maxThis;
      const def = Cards.cardById(row.cardId);
      setCtHand(`
        <div class="ct-card-wrap">
          <div class="ct-play-card compact ${row.shatterOnUse ? "is-shatter" : "is-speech"}${picked ? " is-selected" : ""}" id="ct-setup-card">
            ${picked ? `<span class="ct-pc-badge">×${picked}</span>` : ""}
            <div class="ct-pc-body">${esc(row.name)}</div>
            <div class="swind"></div>
          </div>
        </div>
        <div class="ct-card-dots">${inv.map((_, i) =>
          `<div class="dot${i === cardUi.injectIdx ? " on" : ""}"></div>`).join("")}</div>
        <div class="ct-card-nav dim small">${cardUi.injectIdx + 1}/${inv.length} · 長按看內容</div>
        <div class="detail-actions card-actions">
          <button type="button" class="cyan" id="ct-deal">開始準備</button>
          <button type="button" id="ct-cancel-setup">取消</button>
        </div>`);

      const setupCard = $("#ct-setup-card");
      const navInj = dir => {
        const n = inv.length;
        if (n <= 1) return;
        cardUi.injectIdx = (cardUi.injectIdx + dir + n) % n;
        renderCardTable();
      };
      const addInj = () => {
        if (!canAdd) {
          toast(cardUi.injectPick.length >= maxI ? `最多帶 ${maxI} 樣` : "這張已經夠了", "bad");
          return;
        }
        flyCard(setupCard, "up", () => {
          cardUi.injectPick.push(row.cardId);
          renderCardTable();
        });
      };
      const subInj = () => {
        const i = cardUi.injectPick.lastIndexOf(row.cardId);
        if (i < 0) { toast("還沒帶上這張", "bad"); return; }
        flyCard(setupCard, "down", () => {
          cardUi.injectPick.splice(i, 1);
          renderCardTable();
        });
      };
      if (setupCard) {
        swipeable(setupCard, {
          left: () => navInj(1),
          right: () => navInj(-1),
          up: addInj,
          down: subInj,
        });
        attachCardPeek(setupCard, def, [`已帶 ${picked}/${maxThis}`]);
      }
    }

    $("#ct-deal").onclick = () => {
      const ir = Cards.setInject(state, cardUi.injectPick);
      if (!ir.ok) { toast(ir.err, "bad"); return; }
      const sr = Cards.startRound(state, { stage, guardHigh: guardActive(girl) });
      if (!sr.ok) { toast(sr.err, "bad"); return; }
      cardUi.lastPlay = null;
      cardUi.handIdx = 0;
      cardUi.awaitReaction = false;
      cardUi.endPanel = null;
      scheduleSave();
      beginRoundPregen(girl);
      // 看板：回店頭背景預產，燈亮再打；約會：留在牌桌等備妥
      if (sess.mode === "kanban") {
        toast(`牌組好了——${gname} 在背景準備回應`, "good");
        dismissCardTableUiKeepSession();
        renderAll();
      } else {
        toast(`牌組好了——她在準備回應（約 ${sr.nLeft} 次）`, "good");
        renderCardTable();
      }
    };
    $("#ct-cancel-setup").onclick = () => {
      if (sess.mode === "date") {
        // 已出門付費：取消組牌 = 散場
        const r = endCardTableAndReleaseKanban("date_cancel");
        toast(r.released ? `${r.gname} 離開店頭了` : "約會到此散了", "");
        scheduleSave();
        renderAll();
        pumpKanbanBubbles();
        return;
      }
      sess.phase = "idle_present";
      cardUi.injectPick = [];
      cardUi.injectIdx = 0;
      cardUi.endPanel = null;
      cardUi.awaitReaction = false;
      scheduleSave(); renderCardTable();
    };
    return;
  }

  // ── 互動中：精簡標題卡左右滑 ────────────────────────────
  if (sess.phase === "round_play") {
    const left = Cards.playsLeft(sess);
    const chain = sess.chain;
    const chainTxt = chain
      ? `節奏正熱（${chain.attr}）`
      : "";
    const hand = sess.hand || [];

    setCtVn({
      name: gname,
      text: "左右滑挑選，上滑用出去。長按看內容。",
      meta: `還肯應付 <b>${left}</b> 次${chainTxt ? ` · <span class="chain-hint">${esc(chainTxt)}</span>` : ""}`,
    });

    if (sess.pending) {
      const pinst = hand.find(h => h.instanceId === sess.pending.instanceId);
      const pd = pinst ? Cards.cardById(pinst.cardId) : null;
      setCtConfirm(`
        <div class="card-confirm">
          <p>真的要用「${esc(pd?.name || "?")}」？<b class="bad">用後消失</b></p>
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
        <div class="dim small ct-empty">手上沒東西了</div>
        <div class="detail-actions card-actions">
          <button type="button" id="ct-end-round">結束本輪</button>
        </div>`);
    } else {
      cardUi.handIdx = Math.min(Math.max(0, cardUi.handIdx || 0), hand.length - 1);
      const inst = hand[cardUi.handIdx];
      const def = Cards.cardById(inst.cardId);
      const check = Cards.canSelectCard(sess, inst, stage);
      const blocked = !check.ok || !!sess.pending;

      setCtHand(`
        <div class="ct-card-wrap">
          <div class="ct-play-card compact is-selected ${def?.shatterOnUse ? "is-shatter" : "is-speech"}${blocked ? " is-blocked" : ""}"
               id="ct-play-card" data-iid="${inst.instanceId}">
            <div class="ct-pc-body">${esc(def?.name || inst.cardId)}</div>
            <div class="swind"></div>
          </div>
        </div>
        <div class="ct-card-dots">${hand.map((_, i) =>
          `<div class="dot${i === cardUi.handIdx ? " on" : ""}"></div>`).join("")}</div>
        <div class="ct-card-nav dim small">${cardUi.handIdx + 1}/${hand.length} · 上滑使用 · 長按內容</div>
        <div class="detail-actions card-actions">
          <button type="button" id="ct-end-round">結束本輪</button>
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
        // requestPlay 對非碎卡會直接 commitPlay；台詞來自預產
        flyCard(playCard, "up", () => {
          cardUi.lastPlay = r;
          cardUi.awaitReaction = true;
          cardUi.reactBeat = "action";
          cardUi.endPanel = null;
          applyPlaySideEffects(girl, r);
          beginCardPlayAi(girl, r);
          const n = state.cardSession?.hand?.length || 0;
          if (cardUi.handIdx >= n) cardUi.handIdx = Math.max(0, n - 1);
          scheduleSave(); renderCardTable();
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
  return ({
    idle_present: "陪伴",
    round_setup: "組牌",
    pregen: "準備回應",
    ready: "可打牌",
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
    el.onclick = () => { detailId = s.id; dateChooser = false; dateFlow = null; renderAll(); };
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
  const phoneRange = Cards.d?.("phone_cost_range", [10, 30]) || [10, 30];
  const dateBtnLabel = cardSystemOn()
    ? `約會 電話${phoneRange[0]}~${phoneRange[1]}+場地(今日剩 ${datesLeft})${isKanban(s.id) ? "·看板中不可約" : ""}`
    : `約會 ${DATE_COST} 金(今日剩 ${datesLeft})${isKanban(s.id) ? "·看板中不可約" : ""}`;

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
    if (su) {
      // 玩家看不到過去的紀錄——只有「此刻正被召喚中」才顯示,且要靠聊天/約會當場撞見或事後詢問她
      const takenTxt = s.summoner.taken
        ? "她此刻正被召喚到對方身邊——召喚不動她(當不了看板娘);現在約她出門,能撞見實況、有機會把她拉回來"
        : "他隨時可能把她召喚過去";
      const ringTxt = s.summoner.ringUnlocked
        ? `<br><span style="color:var(--red)">⚠ 她已為他解開魔法環——隨時可能懷孕被娶走</span>`
        : "";
      summonerLine = `<div class="summoner-note">⚠ ${su.emoji} <b>${esc(su.name)}</b> 纏上了她(${esc(su.desc)})<br>
      她對他的態度:<b>${rivalStageName(s.summoner.stage ?? 0)}</b> — ${takenTxt}${ringTxt}</div>`;
    }
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
      ${shotsLine(s)}
      <div class="detail-actions">
        ${s.ntr
          ? `<button class="gold" id="act-ransom">贖回 ${RANSOM[s.stage]} 金</button>`
          : `<button class="cyan" id="act-date" ${asleep || datesLeft <= 0 || isKanban(s.id) ? "disabled" : ""}>${esc(dateBtnLabel)}</button>
             ${isKanban(s.id)
               ? `<button disabled>★ 看板娘(陪伴中)</button>
                  ${cardSystemOn() ? `<button class="cyan" id="act-cardtable" ${asleep ? "disabled" : ""}>✦ 靠近她</button>` : ""}`
               : s.summoner?.taken
                 ? `<button disabled>召喚不到她(被召喚走)</button>`
                 : `<button id="act-kanban">召喚為看板娘(${kanbanCost()} 金)</button>`}`}
      </div>
      ${dateChooser && !s.ntr && !isKanban(s.id) && cardSystemOn() && dateFlow?.girlId === s.id ? `
        <div class="chooser date-venues" style="justify-content:center;flex-wrap:wrap;gap:.4em">
          <div class="dim small" style="width:100%;text-align:center;margin:.3em 0 .2em">
            她接了（電話 −${dateFlow.phoneCost} 金）。選場地（另付場地費）
          </div>
          ${availableVenues().map(v =>
            `<button type="button" data-venue="${esc(v.id)}" title="${esc(v.desc || "")}">${esc(v.name)} ${v.fee}金</button>`
          ).join("")}
          <button type="button" data-date-cancel>先不約了</button>
        </div>` : ""}
      ${dateChooser && !s.ntr && !isKanban(s.id) && !cardSystemOn() ? `<div class="chooser" style="justify-content:center">${dateChoices.map(([l]) => `<button data-loc="${l}">${l}</button>`).join("")}<button data-reroll title="換一批">🎲</button></div>` : ""}
      ${!s.ntr && !cardSystemOn() ? `<div class="aff-line dim small">淫紋出現率 <b>${Math.round(crestChance(s) * 100)}%</b></div>` : ""}
      ${!s.ntr && cardSystemOn() ? `<div class="aff-line dim small">看板：靠近她打牌；非看板可約會（電話→場地牌局）。委託時 15% 碎嘴。</div>` : ""}
      ${asleep ? `<div class="aff-line dim small">(睡眠時段——她回夢境了)</div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">天賦:${giftLabel(s.gift)}(${s.gift === "cleanse" ? "獻祭刷到即清除所有召喚師" : "當看板娘時暫時 +1"};獻祭有 1/${Math.round(1 / sacrificeDropChance(s.stage))} 機率觸發)</div>
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
    renderAll();
  };
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
      // 已接通：再按一次約會可收起場地列（電話費已付、額度已算）
      if (dateChooser && dateFlow?.girlId === s.id) {
        dateChooser = false;
        // 不退電話、不退額度
        renderAll();
        return;
      }
      beginDateFlow(s.id);
      return;
    }
    dateChooser = !dateChooser;
    if (dateChooser) dateChoices = pickN(DATE_SPOTS, 5);
    renderAll();
  });
  root.querySelector("#act-ransom")?.addEventListener("click", () => ransom(s.id));
  root.querySelector("[data-reroll]")?.addEventListener("click", () => { dateChoices = pickN(DATE_SPOTS, 5); renderAll(); });
  root.querySelectorAll("[data-loc]").forEach(b => b.onclick = () => enterChat(s.id, "date", b.dataset.loc));
  root.querySelectorAll("[data-venue]").forEach(b => {
    b.onclick = () => confirmDateVenue(s.id, b.dataset.venue);
  });
  root.querySelector("[data-date-cancel]")?.addEventListener("click", () => {
    dateChooser = false;
    // 電話已付、額度已算；取消只是不選場地
    toast("下次再約吧（電話費不退）", "");
    // 保留 dateFlow 清掉，避免殘狀態
    dateFlow = null;
    renderAll();
  });
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
    // 有魅魔但沒人在店頭:空無一人(去魅魔欄召喚看板娘)
    girl.classList.add("hidden");
    book.classList.add("hidden");
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
  $("#row-comfy-ckpt").classList.toggle("hidden", imgProvider() !== "comfy");
  comfyCkptOptions(state.settings.comfyCkpt || "");
  $("#set-model").value = state.settings.model || "";
  $("#set-rating").value = state.settings.rating || "sfw";
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
on("card-table-close", "click", () => dismissCardSession());

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
on("set-imgprov", "change", e => { state.settings.imgProvider = e.target.value; scheduleSave(); renderSettings(); });
on("set-comfy-ckpt", "change", e => { state.settings.comfyCkpt = e.target.value; scheduleSave(); });
on("btn-comfy-test", "click", async () => {
  const r = $("#comfy-test-result");
  if (!r) return;
  r.textContent = "測試中…";
  const u = (state.settings.comfyUrl || "").trim();
  try {
    const res = await fetch("/api/comfy/status" + (u ? "?url=" + encodeURIComponent(u) : ""));
    const j = await res.json();
    if (!j.ok) {
      // localhost 是最常見的錯:那是遊戲伺服器自己,不是顯卡那台
      r.textContent = `連不上 ${j.url}` + (/\/\/(localhost|127\.0\.0\.1)/.test(j.url)
        ? "——這是伺服器自己。請填顯卡主機的 IP。" : "(ComfyUI 沒開?防火牆?)");
      return;
    }
    comfyCkpts = j.checkpoints || [];
    comfyBadCkpts = j.bad_checkpoints || [];
    comfyCkptOptions(state.settings.comfyCkpt || "");
    const v = j.vram && j.vram[0];
    // 去背要 Pillow。沒裝的話圖照生,只是留著白底疊在遊戲畫面上——那是「怎麼還是
    // 白底」最常見的原因,而且原本只印在伺服器 log 裡,手機上完全看不到。
    const cut = await fetch("/api/cutout").then(x => x.json()).catch(() => null);
    r.textContent = `OK · ${comfyCkpts.length} 個模型`
      + (v ? ` · ${v.name} ${Math.round(v.free_mb / 1024 * 10) / 10}/${Math.round(v.total_mb / 1024 * 10) / 10}GB 可用` : "")
      + (cut ? (cut.available ? " · 去背可用" : " · ⚠ 沒裝 Pillow,立繪不會去背") : "");
  } catch (e) { r.textContent = "失敗:" + e.message; }
});
on("set-model", "change", e => { state.settings.model = e.target.value.trim(); scheduleSave(); });
on("set-rating", "change", e => { state.settings.rating = e.target.value; scheduleSave(); });
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
  genGirl: (luck = 0, rating = "sfw") => generateGirl({ luck, rating }),
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
    openDateTable(s.id, venueId);
    return { ok: true, girl: s.name, venueId };
  },
  venues: () => availableVenues(),
  // 測試:直接進聊天/約會(prepaid 跳過金幣消耗),與詢問機制
  chat: (id, type = "chat") => enterChat(id, type, null, true),
  ask: () => askAboutActs(),
  chatState: () => ({ chatWith, watchWith, ended: chatSession?.ended ?? null }),
  render: () => renderAll(),   // 測試:手動改了 state 之後強制重畫
  // 測試/調 prompt:看她下一句實際會送出去的訊息陣列(system prompt + 這一場的上下文)
  chatPrompt: (id) => {
    const s = state.succubi.find(x => x.id === id) || kanbanSuccubi()[0];
    return s ? chatLineMsgs(s) : null;
  },
  // 手機上自我診斷:為什麼淫紋沒出現?把每個關卡的判定結果一次列出來
  whyNoCrest: () => {
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
