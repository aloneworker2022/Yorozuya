// 魅魔萬事屋 遊戲核心
// M0:委託狀態機 + 金幣 + 違約結算 + 伺服器存檔
// M1:商店/地牢/召喚 + 名冊 + 情感需求 + NTR + 睡眠時鐘 + 看板娘罐頭反應
// M2:Ollama 聊天/約會(galgame 式)+ PersonaBuilder 銜接口 + history 存檔

import { buildSystemPrompt, buildWatchPrompt, buildSacrificePrompt, buildOfferingPrompt, buildQuipPrompt, buildMatingPrompt, buildSacScenePrompt, buildSacReactPrompt } from "./content/persona_builder.js";
import { loadPools, generateGirl, RARITY_MARK } from "./content/girl_gen.js";
loadPools();   // 人物生成池(persona_pools.json;載入失敗時召喚退回舊制簡易骰)

// 遊戲版本(顯示在設定頁最下方;每次改版遞增——手機顯示的就是「正在跑的 app.js」的版本)
const APP_VER = "v5.24(2026-07-21)壞存檔不再卡死+急救重設";

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
  crest:    "淫紋機率",     // 每級 +5% 她想找你說話的機率(基礎值由稀有度決定)
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
// 聊天改半預製(一紋一來一往),不再有隨機回合數;約會維持 DATE_TURNS
const DATE_TURNS = [2, 5];      // 約會 2~5 來回(付了 5 金,多聊幾句)

// ===== 淫紋:她有話要跟你說 =====
// 淫紋不是點數、不是入場券,是一盞「她有一句話還沒給你看」的燈。
// 每位看板娘各自一條訊息串,同時只留最新的一句——她起了新的念頭就把舊的刷掉。
// 每 10 分鐘巡一次,依稀有度問她「現在想不想找他說話」:愈稀有的愈黏人。
// 她說什麼則取決於你這段時間在委託上做了什麼(chatLineMsgs → buildCtx.quests)。
const CREST_PATROL_MS = 10 * 60 * 1000;
const CREST_CATCHUP = 3;         // 離線最多補算 3 輪:久沒開 App 不等於一定有話等著你
const CREST_P = { N: 1 / 6, R: 1 / 5, S: 1 / 4, SS: 1 / 3, SSR: 1 / 2 };
// 「淫紋機率」擴充:每級 +5%(上限 90%),讓低稀有度的孩子也能養到話多一點
function crestChance(s) {
  return Math.min(0.9, (CREST_P[s.rarity] ?? CREST_P.N) + expLv("crest") * 0.05);
}

// 巡邏:每 10 分鐘一輪,問每位在你身邊的看板娘有沒有起念頭。
// 中了只代表「她想說話」,話還要在背景寫出來(genChatOrder)淫紋才會亮。
// 被召喚走的不巡(她不在你身邊);睡眠與對話/觀戰中不巡(不打擾),但時鐘照走。
function crestPatrol() {
  const now = Date.now();
  if (!state.crestPatrolAt) { state.crestPatrolAt = now; return false; }
  const rounds = Math.floor((now - state.crestPatrolAt) / CREST_PATROL_MS);
  if (rounds < 1) return false;
  state.crestPatrolAt = now;
  if (isAsleep() || chatWith || watchWith) return true;
  let changed = false;
  for (const s of kanbanSuccubi()) {
    if (s.summoner?.taken || s.wantsTalk) continue;   // 她不在身邊 / 已經在醞釀了
    for (let i = 0; i < Math.min(rounds, CREST_CATCHUP); i++) {
      if (Math.random() < crestChance(s)) { s.wantsTalk = now; changed = true; break; }
    }
  }
  return changed;
}

// 沒設 AI 模型(或連敗到保底)時:念頭直接落地成罐頭台詞,循環照樣跑得動
function crestFallback() {
  if (state.settings.model && chatGenFail.count < 3) return false;
  let changed = false;
  for (const s of kanbanSuccubi()) {
    if (!s.wantsTalk || s.summoner?.taken) continue;
    s.chatLine = { text: pick(CHAT_LINES[s.stage] || CHAT_LINES.stranger), t: Date.now() };
    s.wantsTalk = 0;
    changed = true;
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
let dateChooser = false; // 詳情頁展開約會地點
let lastSleepState = null;

function defaultState() {
  return {
    gold: 0,
    quests: [],   // {id, text, lv:0|1|2, startedAt?, deadline?}
    discover: null, // {day, count} 每日發現獎勵計數
    crestPatrolAt: 0, // 上次淫紋巡邏的時間戳(每 10 分一輪,問看板娘想不想找你說話)
    expansions: {}, // 擴充等級(8 軸,見 EXPANSIONS);名額/格數等由此推導
    dismiss: null,  // {day, price} 今日遣散費
    succubi: [],  // 見 summon()
    dungeon: [],  // [{name}]
    shop: null,   // {day, stock:[{id,name,price,sold}], line}
    kanbans: [],        // 在任看板娘 [{id, until}](多看板娘制;until=到期時間戳)
    lastKanbanId: null, // 最後一位看板娘(全過期後背景顯示她的休息剪影)
    lastSettledDay: null,
    log: [],
    settings: {
      player: "", sleepStart: "01:00", sleepEnd: "06:00", theme: "aqua",
      ollamaUrl: "http://localhost:11434", model: "", rating: "sfw",
      cardColors: null,   // null = 主題預設;{exec|found|acc|vn: {color,opacity}}
      cardCenter: false,  // 卡牌文字水平置中
      cardFontScale: 1,   // 卡牌文字大小倍率(0.7~1.6)
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
  // 召喚師系統移轉:舊魅魔補發抽取間隔
  for (const s of state.succubi) {
    if (s.summoner === undefined) s.summoner = null;
    if (s.nextDraw == null) { s.drawIvlH = randInt(2, 5); s.nextDraw = Date.now() + s.drawIvlH * HOUR; }
    if (!s.gift) s.gift = pick(GIFT_KEYS);
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

async function saveNow(keepalive = false) {
  if (bootFailed || !dirty || !state) return;
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
  scheduleSave(); renderAll();
}

function accept(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q) return;
  q.lv = 1;
  scheduleSave(); renderAll();
}

function start(id) {
  const q = state.quests.find(q => q.id === id);
  if (!q || execQuests().length >= execCap()) return;
  q.lv = 2;
  q.startedAt = Date.now();
  q.deadline = q.startedAt + QUEST_HOURS * HOUR;
  log(`開始執行「${q.text}」(期限 ${QUEST_HOURS}h)`);
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

// 魅魔獻祭:三場景 VN(開場 → 準備/獻祭/收尾,每景 AI 生「描述+反應」共六句)。
// 流程:先載入預先設計好的開場 → 停在「等待獻祭儀式」樣式,期間一次把三段六句全部生成好
//       → 六句全備妥,儀式才開始;玩家一直按「下一句」看完六句,最後「完成獻祭」才結算移除+掉落。
async function sacrificeSuccubus(id) {
  const s = state.succubi.find(x => x.id === id);
  if (!s || s.ntr) return;
  const price = dismissPriceToday();
  if (state.gold < price) { toast(`今日獻祭費 ${price} 金,你付不起`, "bad"); return; }
  if (!confirm(`獻祭 ${s.name}?\n費用 ${price} 金。她將被獻給地獄惡魔,永遠消失。`)) return;
  state.gold -= price;

  const method = (SACRIFICE.methods && SACRIFICE.methods.length)
    ? pick(SACRIFICE.methods) : { name: null, prep: null, ritual: null, finale: null };
  const opening = (SACRIFICE.opening || "{name} 被帶到了祭壇前,眼神帶著疑惑。").replaceAll("{name}", s.name);
  sacrificeWith = id;
  sacSession = {
    id, name: s.name, persona: s.personality, backstory: s.backstory, stage: s.stage, gift: s.gift,
    method, opening,
    pages: Array.from({ length: 6 }, () => ({ text: null })),   // [描述,反應] × 準備/獻祭/收尾
    idx: 0, ready: false, settled: false, price,   // ready:六句是否全生成完(生成完儀式才能開始)
  };
  document.body.classList.add("chat-mode");
  detailId = null;
  renderAll();
  sacShowCurrent();               // 開場:載入預設好的開場,進入「等待獻祭儀式」樣式
  generateSacPages(sacSession);   // 等待期間,一次把後面六句全部生成好
}

// 已生成好的句數(0~6)
function sacReadyCount(ss) { return ss.pages.filter(p => p && p.text).length; }

// 背景生成六句:三場景 ×(讀腳本生描述 → 讀描述生反應),依序填入 pages。
// 全部備妥後標記 ready,「等待獻祭儀式」的開場鈕才解鎖成「開始儀式」。
async function generateSacPages(ss) {
  const rating = state.settings.rating || "sfw";
  const char = { name: ss.name, personality: ss.persona, backstory: ss.backstory };
  const scenes = [["準備", ss.method.prep], ["獻祭", ss.method.ritual], ["收尾", ss.method.finale]];
  for (let sc = 0; sc < 3; sc++) {
    const [label, script] = scenes[sc];
    const body = (script || "").replaceAll("{name}", ss.name);
    // ① 場景描述(讀入腳本)
    const di = sc * 2;
    const dctx = { world: WORLD_LORE, content_rating: rating, character: char,
                   method_name: ss.method.name, scene_label: label, scene_stage: sc + 1, scene_script: body };
    if (!await sacGen(ss, di, [
      { role: "system", content: buildSacScenePrompt(dctx) },
      { role: "user", content: `讀入本場景「${label}」的腳本,寫 1~2 句第三人稱旁白描述這一段。只輸出旁白。` },
    ], sacCannedDesc(label, ss.name, body))) return;
    // ② 人物反應(讀入剛生成的描述)
    const ri = sc * 2 + 1;
    const rctx = { world: WORLD_LORE, content_rating: rating, character: char,
                   scene_label: label, scene_stage: sc + 1, narration: ss.pages[di].text };
    if (!await sacGen(ss, ri, [
      { role: "system", content: buildSacReactPrompt(rctx) },
      { role: "user", content: `讀入上面的旁白,寫出「${ss.name}」此刻的反應(台詞或肢體),1~2 句。` },
    ], sacCannedResp(label, ss.name))) return;
  }
  if (sacSession !== ss) return;
  ss.ready = true;                // 六句全備妥 → 儀式可以開始
  if (ss.idx === 0) sacShowCurrent();   // 還停在開場:刷新等待樣式為「可開始」
  else sacBtn();
}

// 生成單一頁;若玩家正好在等這頁就即時串流/補上。回傳 false 表示 session 已中止
async function sacGen(ss, idx, msgs, canned) {
  if (sacSession !== ss) return false;
  try {
    const text = await llmJobRun(msgs,
      acc => { if (sacSession === ss && ss.idx === idx + 1) sacRender(idx + 1, acc); }, canned);
    if (sacSession !== ss) return false;
    ss.pages[idx].text = text;
  } catch (e) {
    if (e.name === "AbortError" || sacSession !== ss) return false;
    ss.pages[idx].text = canned;
  }
  if (sacSession === ss && ss.idx === idx + 1) { sacRender(idx + 1); vnDone(); sacBtn(); }
  else if (sacSession === ss && ss.idx === 0) sacBtn();   // 還停在開場:更新等待進度
  return true;
}

// 顯示目前這一頁(0=開場,1~6=六句)
function sacShowCurrent() {
  const ss = sacSession; if (!ss) return;
  const title = document.getElementById("chat-title");
  if (title) title.textContent = `獻祭儀式:${ss.name}${ss.idx ? `(${ss.idx}/6)` : "(準備中)"}`;
  // 開場:載入預設好的開場,若六句還沒備妥就以打字指示器呈現「等待獻祭儀式」樣式
  if (ss.idx === 0) {
    vnShow(ss.name, ss.opening, "ai");
    if (ss.ready) vnDone(); else vnTyping(true);
    sacBtn();
    return;
  }
  // 儀式進行中:六句已全備妥,直接顯示這一句
  const p = ss.pages[ss.idx - 1];
  if (p && p.text) { sacRender(ss.idx); vnDone(); }
  else { vnTyping(true); sacRender(ss.idx, ""); }   // 保險:萬一未備妥,打字中等背景補上
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

// 獻祭鈕:開場等待六句生成→「獻祭儀式準備中… n/6」(停用),全備妥→「開始儀式 ▶」;
// 儀式進行中→「下一句 ▶」;最後一句→「完成獻祭」。
function sacBtn() {
  const ss = sacSession; const b = document.getElementById("sac-done");
  if (!b || !ss) return;
  if (ss.idx === 0) {
    if (ss.ready) { b.textContent = "開始儀式 ▶"; b.disabled = false; }
    else { b.textContent = `獻祭儀式準備中…(${sacReadyCount(ss)}/6)`; b.disabled = true; }
    return;
  }
  b.textContent = ss.idx >= 6 ? "完成獻祭" : "下一句 ▶";
  b.disabled = !(ss.pages[ss.idx - 1] && ss.pages[ss.idx - 1].text);
}

function sacAdvance() {
  const ss = sacSession; if (!ss) return;
  if (ss.idx === 0 && !ss.ready) return;   // 六句還沒備妥,儀式尚不能開始
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
  state.succubi = state.succubi.filter(x => x.id !== ss.id);
  state.kanbans = (state.kanbans || []).filter(k => k.id !== ss.id);
  if (state.lastKanbanId === ss.id) state.lastKanbanId = null;
  log(`獻祭了 ${ss.name}(-${ss.price} 金)${dropped ? `,獲得 ${EXPANSIONS[ss.gift]} 擴充` : ""}`);
  toast(dropMsg.includes("✦") ? "✦ 獲得永久擴充!" : `${ss.name} 化作了獻祭的光`, dropMsg.includes("✦") ? "good" : "");
  scheduleSave();
}

// 無模型/失敗時的 SFW 罐頭
function sacCannedDesc(label, name, body) {
  if (body) return body;   // 有腳本 → 無模型時直接用腳本原文當描述
  return ({ "準備": `祭壇的紋路亮起,${name} 被引到了魔法陣中央。`,
            "獻祭": `力量順著紋路攀升,一寸寸自 ${name} 的身上抽離。`,
            "收尾": `光芒散去,${name} 的身影靜靜癱軟、消融。` })[label] || "儀式繼續進行。";
}
function sacCannedResp(label, name) {
  return ({ "準備": "「……這是要做什麼?放開我。」",
            "獻祭": "「唔……不、不要……!」",
            "收尾": "她再也發不出聲音,身子軟軟地垂了下去。" })[label] || "「……」";
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

function enterChat(id, type = "chat", location = null, prepaid = false) {
  const s = state.succubi.find(x => x.id === id);
  if (!s) return;
  if (isAsleep()) { toast("睡眠時段——她回夢境了", "bad"); return; }
  if (s.ntr) { toast("她不在你身邊……", "bad"); return; }
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
    // 聊天不花任何資源:淫紋只是「她有一句話還沒給你看」的燈,點開就是讀那一句。
    // 她被召喚走時不會產生話,也不從這裡進觀戰——想撞見實況要付約會費。
    if (!prepaid) {
      if (s.summoner?.taken) { toast(`${s.name} 正被召喚走——約她出門才撞得見`, "bad"); return; }
      if (!s.chatLine) { toast("她現在沒有話要跟你說", "bad"); return; }
    }
    s.lastChatDay = today;
  }
  chatWith = id;
  const spot = DATE_SPOTS.find(x => x[0] === location);
  const turnCap = type === "date" ? randInt(...DATE_TURNS) : 1;   // 聊天=一紋一來一往
  chatSession = { type, location, locationDesc: spot ? spot[1] : null, playerMsgs: 0, turnCap, gotReply: false, busy: false };
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
  if (sendBtn) sendBtn.disabled = false;
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
    // 半預製:她的話早已生成好——秒顯示,你回一句,這一紋就結束
    const line = s.chatLine.text;
    s.chatLine = null;
    s.history.push({ role: "assistant", content: line, t: Date.now() });
    s.history = s.history.slice(-200);
    vnShow(s.name, line, "ai");
    vnDone();
    dirty = true;
    saveNow();
  } else {
    chatOpenerLive(s);   // 沒有預製話(無模型/剛被釋放):現場生她的開場白
  }
}

// 聊天即時開場白(半預製沒貨時的後備):她先開口,串流生成
async function chatOpenerLive(s) {
  if (!chatSession) return;
  chatSession.busy = true;
  setChatWaiting(true);
  vnTyping(true);
  const inst = "(旁白:淫紋亮起——是你想找他說話。依你的個性與你們的關係,對他說第一句話:可以聊他的委託、你原本生活的事,或撒嬌抱怨。一句像簡訊的話。)";
  try {
    const reply = await llmReply(s, acc => vnShow(s.name, acc, "ai"), inst);
    s.history.push({ role: "assistant", content: reply, t: Date.now() });
    s.history = s.history.slice(-200);
    vnDone();
    dirty = true;
    saveNow();
  } catch (e) {
    if (e.name !== "AbortError") vnShow("", "(她欲言又止……)", "sys");
  }
  if (chatSession && !chatSession.ended) {
    chatSession.busy = false;
    setChatWaiting(false);
    document.getElementById("chat-input")?.focus();
  }
}

// 送出後隱藏輸入列,等她回完才出現(避免連發沒人回)
function setChatWaiting(b) {
  const row = document.getElementById("chat-input-row");
  if (row) row.style.visibility = b ? "hidden" : "";
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
      s.history.push({ role: "sys", content: `「${chatSession.location}」的約會結束了,兩人回到日常`, t: Date.now() });
      s.chatLine = null;   // 約會另起了話頭,作廢她待命中的預製話重生
      log(`與 ${s.name} 的${chatSession.location}約會結束,情感 +${d}`);
      toast(`約會結束,情感 +${d}`, "good");
    }
    // 聊天(半預製):情感已在送出時結算,這裡不再結;對話串連續,不加場景標記
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
function enterWatch(s, playerType, playerLocation = null) {
  // 紀錄由伺服器權威運算;直播時 watchNext 會向伺服器現生 act
  watchWith = s.id;
  const taken = !!s.summoner?.taken;
  watchSession = {
    playerType, playerLocation,
    releaseChance: taken ? (playerType === "date" ? 1 / 10 : 1 / 20) : 0,
    // 一淫紋看 1~2 則;被召喚中時 watchNext 會向伺服器現生,故至少 1
    turnCap: Math.min(randInt(1, 2), taken ? 2 : (unseenActs(s).length || 1)),
    presses: 0, busy: false, ended: false,
  };
  document.body.classList.add("chat-mode");
  const su = summonerById(s.summoner?.id);
  scheduleSave(); renderAll();
  const opener = taken
    ? `${s.name} 不在你身邊——她正被 ${su?.name || "另一個男人"} 召喚著。淫紋映出他們的互動……`
    : `淫紋映出 ${s.name} 與 ${su?.name || "另一個男人"} 之間,那些你不在場時的紀錄……`;
  vnShow("", `—— ${opener} ——`, "sys");
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
  // 取最舊的未讀紀錄(文字備好就秒開,沒備好就當場生);她被召喚中而沒有未讀 → 請伺服器現生一則(直播)
  let act = unseenActs(s)[0];
  if (!act && s.summoner?.taken) {
    const r = await simLiveAct(s);
    if (r?.married || !state.succubi.includes(s)) { exitWatch(true); return; }
    if (r?.rel) s.summoner = r.rel;   // 更新鏡像(她仍是觀戰對象)
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
  // 這一淫紋能看的看完了:留 2 秒讓玩家讀完最後一則,再收尾退出。她被召喚中時還能請伺服器現生,故不因無備好紀錄而收尾
  if (watchSession.presses >= watchSession.turnCap || (!unseenActs(s).length && !s.summoner?.taken)) {
    watchSession.ended = true;
    setWatchBtns(false);
    const endMsg = s.summoner?.taken
      ? "(你只能看著……她還被召喚在對方那邊)"
      : `(紀錄到此為止${unseenActs(s).length ? `,還有 ${unseenActs(s).length} 則未讀` : ""})`;
    setTimeout(() => { if (watchSession?.ended) vnShow("", endMsg, "sys"); }, 2200);
    setTimeout(() => { if (watchSession?.ended) exitWatch(); }, 4200);
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

// ── 代工生成:手機只「下單/收貨」,實際排隊跑 Ollama 在 RP5 伺服器背景——
//    手機切走/鎖屏/待機都不影響生成;下次開 app 收貨即亮。
//    key = 內容狀態指紋(伺服器以 key 去重;狀態變了 key 就變,舊單自然作廢過期)。
function strHash(x) { let h = 5381; for (let i = 0; i < x.length; i++) h = ((h * 33) ^ x.charCodeAt(i)) >>> 0; return h.toString(36); }

async function genPost(key, messages) {
  try {
    const r = await fetch("/api/gen", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, retry: true, endpoint: state.settings.ollamaUrl, model: state.settings.model, messages, options: { temperature: 0.9 } }),
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

async function genChatOrder() {
  if (chatGenFail.count && Date.now() - chatGenFail.at < Math.min(60000, 10000 * chatGenFail.count)) return;
  let anyErr = false, anyDone = false;
  // 只寫「巡邏勾起了念頭」的那幾位;沒起念頭就不生話——她開口與否跟著你做事的節奏走。
  for (const s of kanbanSuccubi()) {   // 多看板娘:每位各自的下一句
    if (!s.wantsTalk || s.summoner?.taken || s.ntr) continue;
    const key = `chat:${s.id}:${s.wantsTalk}`;   // 綁這一輪念頭:刷新時重寫,不吃到舊快取
    const r = await genPost(key, chatLineMsgs(s));
    if (!r) continue;
    if (r.status === "done" && r.result) {
      anyDone = true;
      if (isKanban(s.id) && !s.summoner?.taken) {
        // 覆寫:她有新想法時,舊的那句未讀就直接被刷掉(同時只留最新一句)
        s.chatLine = { text: r.result.split("\n")[0].slice(0, 300) || r.result.slice(0, 300), t: Date.now() };
        s.wantsTalk = 0;                             // 念頭落地成未讀訊息
        dirty = true; scheduleSave(); renderAll();   // 淫紋亮起
      }
    } else if (r.status === "error") anyErr = true;
  }
  if (anyDone) chatGenFail = { count: 0, at: 0 };
  else if (anyErr) {
    chatGenFail = { count: chatGenFail.count + 1, at: Date.now() };
    if (chatGenFail.count === 3) renderAll();   // 保底生效:改用罐頭台詞讓紋亮起來
  }
}

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
        character: { name: s.name, personality: s.personality, speech_style: s.speech, backstory: s.backstory || "" },
        relationship: { stage: s.stage, affection: s.affection },
        player: { name: state.settings.player || "主人" },
        quests: questSnapshot(),
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
let genTickBusy = false, lastGenAt = 0;
async function genTick(force = false) {
  if (genTickBusy || !state.settings.model) return;
  if (!force && Date.now() - lastGenAt < 2000) return;
  lastGenAt = Date.now();
  genTickBusy = true;
  try {
    const idle = !chatWith && !watchWith && !sacrificeWith && !sacSummon && !isAsleep();
    if (idle) await genChatOrder();
    await genActOrders();
    if (idle) await genQuipOrders();
  } catch (e) { /* 下輪再試 */ }
  genTickBusy = false;
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
      job_desc: s.jobDesc || null,
    },
    relationship: {
      stage: s.stage, affection: s.affection,
      days_since_summon: Math.floor((Date.now() - s.summonedAt) / 86400000),
    },
    // 她就在店頭看著你做事:委託清單是她開口的材料(persona_builder 會挑最值得說的一件)
    quests: questSnapshot(),
    scene: {
      type: chatSession?.type || "chat", location: chatSession?.location || null,
      scene_prompt: chatSession?.locationDesc || null,
      transition: [...(s.history || [])].reverse().find(m => m.role === "sys")?.content || null,
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
  vnShow(state.settings.player || "你", text, "user");

  // 聊天(半預製):送出即結束這一紋——情感當場結算,她的回應在背景生成、下次淫紋亮起才看得到
  if (chatSession.type === "chat") {
    chatSession.ended = true;
    chatSession.gotReply = true;
    s.lastChatDay = dayNum();
    const d = applyAffection(s, randInt(-1, 2));
    log(`回了 ${s.name} 一句,情感 ${d >= 0 ? "+" : ""}${d}`);
    toast(`傳出去了,情感 ${d >= 0 ? "+" : ""}${d}`, d >= 0 ? "good" : "bad");
    setChatWaiting(true);
    const inputEl = document.getElementById("chat-input");
    if (inputEl) inputEl.disabled = true;
    document.getElementById("chat-send").disabled = true;
    dirty = true;
    saveNow();
    setTimeout(() => {
      if (chatSession?.ended) {
        vnShow("", "(訊息傳出去了……她的回覆,下次淫紋亮起時就會知道)", "sys");
        setTimeout(() => { if (chatSession?.ended) exitChat(); }, 1600);
      }
    }, 900);
    return;
  }

  // 約會:即時往返
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
  state.succubi = state.succubi.filter(x => x.id !== s.id);
  state.kanbans = (state.kanbans || []).filter(k => k.id !== s.id);
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
function simBuf(s) { return (simPatch[s.id] ??= { seen: [], texts: {} }); }
function simTextOf(s, act) { if (act?.text && s?.summoner) simBuf(s).texts[act.id] = act.text; }   // 回填已生成文字
function simSeenOf(s, act) { if (!act || !s?.summoner) return; const p = simBuf(s); if (!p.seen.includes(act.id)) p.seen.push(act.id); if (act.text) p.texts[act.id] = act.text; }
function simRescueOf(s) { if (s?.summoner) simBuf(s).rescue = true; }

async function simSync() {
  if (!state || simSyncBusy) return false;
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
      if (watchWith === s.id || (chatWith === s.id && chatSession)) continue;   // 互動中不覆蓋鏡像
      const rel = rels[s.id] ?? null;
      if (JSON.stringify(s.summoner ?? null) !== JSON.stringify(rel)) { s.summoner = rel; changed = true; }
    }
    for (const o of resp.outcomes || []) { applySimOutcome(o); changed = true; }
    lastSimSyncAt = Date.now();
    if (changed) { scheduleSave(); renderAll(); }
    return changed;
  } finally {
    simSyncBusy = false;
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
  const cost = kanbanCost();
  if (state.gold < cost) { toast(`召喚第 ${kanbanSuccubi().length + 1} 位看板娘需 ${cost} 金`, "bad"); return; }
  state.gold -= cost;
  (state.kanbans ??= []).push({ id, until: Date.now() + kanbanHours() * HOUR });
  state.lastKanbanId = id;
  log(`召喚 ${s.name} 為看板娘 -${cost} 金(第 ${state.kanbans.length} 位)`);
  toast(`${s.name} 來到你身邊♥`, "good");   // 不透露持續時間
  scheduleSave(); renderAll();
}

// 到期解除(每秒 tick 呼叫);逐位到期、不提醒玩家。回傳是否有變化
function expireKanban() {
  const now = Date.now();
  const before = (state.kanbans || []).length;
  state.kanbans = (state.kanbans || []).filter(k => k.until && now < k.until);
  return state.kanbans.length !== before;
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
      lastSleepState = asleep;
      changed = true;
    }
  } catch (e) { console.error("tick 在地檢查出錯(不影響同步):", e); }

  // 淫紋巡邏:每 10 分鐘問一次在場的看板娘想不想找你說話(中了才會去生成她那句話)
  try { if (crestPatrol()) changed = true; } catch (e) { console.error("淫紋巡邏失敗:", e); }
  try { if (crestFallback()) changed = true; } catch (e) { console.error("淫紋保底失敗:", e); }

  // 伺服器世界時鐘:每 15 秒同步一次(拿權威 outcome + 召喚師鏡像);與上面的在地檢查各自獨立
  try { if (Date.now() - lastSimSyncAt > 15000) simSync(); } catch (e) { console.error("simSync 失敗:", e); }
  try { genTick(); } catch (e) { console.error("genTick 失敗:", e); }   // 代工生成:下單+收貨

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
  for (const fn of [applyTheme, renderHud, renderQuests, renderShop, renderSuccubi, renderChatView, renderKanban, renderCrests, renderSettings]) {
    try { fn(); } catch (e) { console.error(fn.name, e); }
  }
}

// 淫紋:每位看板娘各自一盞燈——她的話寫好了就亮,點開讀那一句、回一句就關。
// 起了念頭但話還沒寫好時顯示極暗呼吸(brewing),讓「她在想」跟「沒動靜」看得出差別。
// 睡眠、對話中、觀戰中不顯示;被召喚走的不會有話,自然不亮。
function renderCrests() {
  const el = $("#crests");
  if (!el) return;
  const busy = isAsleep() || chatWith || watchWith;
  const girls = busy ? [] : kanbanSuccubi().filter(s => !s.summoner?.taken && (s.chatLine || s.wantsTalk));
  el.classList.toggle("hidden", !girls.length);
  el.innerHTML = girls.map(s => `
    <button class="crest-btn r-${s.rarity}${s.chatLine ? "" : " brewing"}" data-cid="${s.id}" title="${esc(s.name)}">
      <svg viewBox="0 0 200 210" width="46" height="48"><use href="#crest-sym"/></svg>
      <span class="cname">${esc(s.name)}</span>
    </button>`).join("");
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
    ["完成金額", `${1 + expLv("reward")}~${3 + expLv("reward")} 金`],
    ["商店祭品", `每日 ${2 + expLv("offering")} 人`],
    ["淫紋機率", kanbanSuccubi().map(s => `${s.name} ${Math.round(crestChance(s) * 100)}%`).join("、") || "(沒有看板娘)"],
  ];
  // 看板娘時長刻意不顯示——玩家無法得知她何時解除,需自行察看
  const lvs = Object.keys(EXPANSIONS).filter(k => k !== "kanban").map(k => `${EXPANSIONS[k]} Lv${expLv(k)}`).join("、");
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

  const ssacCtl = $("#ssac-controls");
  // 召喚獻祭最優先
  if (sacSummon) {
    chatV.classList.remove("hidden");
    inputRow?.classList.add("hidden");
    watchCtl?.classList.add("hidden");
    sacCtl?.classList.add("hidden");
    ssacCtl?.classList.remove("hidden");
    $("#chat-title").textContent = `召喚獻祭(已獻 ${sacSummon.count} 人)`;
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
          ${!s.ntr && s.summoner?.taken ? `<span class="stage-chip" style="color:var(--red)">→ 被召喚走</span>`
            : isKanban(s.id) ? `<span class="stage-chip" style="color:var(--gold)">★ 在店頭</span>` : ""}
          ${s.summoner && !s.ntr ? `<span class="stage-chip" style="color:var(--red)">⚠ ${esc(summonerById(s.summoner.id)?.name || "被纏上")}${s.summoner.ringUnlocked ? "・已解環" : ""}</span>` : ""}</div>
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
    if (su) {
      // 玩家看不到過去的紀錄——只有「此刻正被召喚中」才顯示,且要靠聊天/約會當場撞見或事後詢問她
      const takenTxt = s.summoner.taken
        ? "她此刻正被召喚到對方身邊——現在約她出門,能撞見實況、有機會把她拉回來"
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
      <div class="portrait">${girlSVG("#241333", 6)}</div>
      <div class="aff-line">
        <b>${esc(s.name)}</b> <span class="rbadge">${"★".repeat(RARITIES.indexOf(s.rarity) + 1)} ${s.rarity}</span>
        ・${s.ntr ? "被奪走" : stageLabel(s.stage)}
      </div>
      <div class="traits">${s.job ? `<span style="color:var(--cyan)">前${esc(s.job)}</span>` : ""}${s.personality.map(p => `<span>${p}</span>`).join("")}<span>${s.speech}</span>${s.dna.traits.map(t => `<span>${t}</span>`).join("")}</div>
      ${s.backstory ? `<div class="aff-line dim small" style="max-width:32em;margin:0 auto">${esc(s.backstory)}</div>` : ""}
      ${s.specialTraits?.length ? `<div class="aff-line small" style="color:var(--gold)">${s.specialTraits.map(t => `${RARITY_MARK[t.rarity] || ""}${esc(t.name)}`).join("  ")}</div>` : ""}
      ${s.look ? `<div class="aff-line dim small">${esc([s.look.build, s.look.bust, s.look.hair, s.look.eyes].filter(Boolean).join("、"))}</div>` : ""}
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
             ${isKanban(s.id)
               ? `<button disabled>★ 看板娘(陪伴中)</button>`
               : `<button id="act-kanban">召喚為看板娘(${kanbanCost()} 金)</button>`}`}
      </div>
      ${dateChooser && !s.ntr ? `<div class="chooser" style="justify-content:center">${dateChoices.map(([l]) => `<button data-loc="${l}">${l}</button>`).join("")}<button data-reroll title="換一批">🎲</button></div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">聊天等她開口:她在店頭陪你時會自己想找你說話,淫紋亮了就是有話沒讀</div>` : ""}
      ${asleep ? `<div class="aff-line dim small">(睡眠時段——她回夢境了)</div>` : ""}
      ${!s.ntr ? `<div class="aff-line dim small">天賦:${giftLabel(s.gift)}(${s.gift === "cleanse" ? "獻祭刷到即清除所有召喚師" : "當看板娘時暫時 +1"};獻祭有 1/${Math.round(1 / sacrificeDropChance(s.stage))} 機率觸發)</div>
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
      `<div class="kgirl r-${g.rarity}" data-kid="${g.id}">${girlSVG("#241333", size)}<div class="kname">${esc(g.name)}</div></div>`
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
on("chat-back", "click", () => {
  if (sacrificeWith) { exitSacrifice(); return; }   // 儀式中途離開=中止(她未結算、存活)
  if (watchWith) exitWatch(); else exitChat();
});
on("chat-send", "click", () => sendChatMsg());
on("chat-ask", "click", () => askAboutActs());
on("watch-next", "click", () => watchNext());
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
  // 測試:直接把她設成「被召喚中」並以玩家動作進窺視
  watch: (id, playerType = "chat", hours = 2) => {
    const s = state.succubi.find(x => x.id === id);
    if (!s) return;
    s.summoner ??= makeSummonerRel(SUMMONERS[0]?.id);
    s.summoner.taken = { type: "kanban", location: null, until: Date.now() + hours * HOUR, actAt: Date.now() };
    enterWatch(s, playerType);
  },
  summonKanban: (id) => summonKanban(id),
  summon: (n) => summonWithCount(n),
  genGirl: (luck = 0, rating = "sfw") => generateGirl({ luck, rating }),
  tickActs: () => processTakenActs(),
  pumpActs: () => genTick(true),
  pumpChat: () => genTick(true),
  // 測試:設好召喚師關係(可指定 stage/resist)並強制一次交配
  rel: (id, suId) => { const s = state.succubi.find(x => x.id === id); if (s) { s.summoner = makeSummonerRel(suId || SUMMONERS[0]?.id); scheduleSave(); renderAll(); } return s?.summoner; },
  mate: (id) => { const s = state.succubi.find(x => x.id === id); if (!s?.summoner) return null; const rm = doMating(s, Date.now()); scheduleSave(); renderAll(); return { removed: rm, sm: s.summoner }; },
  actSlot: (id) => { const s = state.succubi.find(x => x.id === id); if (!s?.summoner) return null; const rm = processActSlot(s, Date.now()); scheduleSave(); renderAll(); return { removed: rm, sm: s.summoner }; },
  // 測試:把巡邏時鐘往前撥一輪並立刻跑一次(看誰起了念頭、話寫好沒)
  crestPatrol: () => {
    state.crestPatrolAt = Date.now() - CREST_PATROL_MS;
    const changed = crestPatrol() | crestFallback();
    renderAll();
    return {
      changed: !!changed,
      girls: kanbanSuccubi().map(s => ({
        name: s.name, chance: crestChance(s), wantsTalk: !!s.wantsTalk, line: s.chatLine?.text || null,
      })),
    };
  },
  // 測試:直接進聊天/約會(prepaid 跳過金幣消耗),與詢問機制
  chat: (id, type = "chat") => enterChat(id, type, null, true),
  ask: () => askAboutActs(),
  chatState: () => ({ chatWith, watchWith, ended: chatSession?.ended ?? null }),
  drawTick: () => checkSummonerDraws(),
  simSync: () => simSync(),
  simLiveAct: (id) => simLiveAct(state.succubi.find(x => x.id === id)),
  sac: (id) => sacrificeSuccubus(id),
  sacNext: () => sacAdvance(),
  sacState: () => sacSession && { idx: sacSession.idx, pages: sacSession.pages.map(p => !!p.text), settled: sacSession.settled, opening: sacSession.opening },
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
