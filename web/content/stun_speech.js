/** 房間聊天：程式化「失神」亂語（非只靠 prompt）。 */

import { ensureBody, talkActById, arousalStage, stimulationState } from "./body_state.js?v=11";
import { insertUnlocked } from "./tease.js?v=4";

export const SHOCK_MAX = 45;

/** 痙攣持續 10 分鐘。 */
export const SPASM_MS = 10 * 60 * 1000;
export const SPASM_ENTER_STUN = 70;

/** 餘韻（afterglow）：高潮後幾句保持喘／空白，不立刻正常聊天。 */
export const AFTERGLOW_HERS_MS = 90 * 1000;
export const AFTERGLOW_HERS_REPLIES = 3;
export const AFTERGLOW_HIS_MS = 60 * 1000;
export const AFTERGLOW_HIS_REPLIES = 2;
/** 朋友線肉體／炮友：短餘韻鎖（弱於她高潮 90s／3句）。 */
export const AFTERGLOW_FRIEND_MS = 50 * 1000;
export const AFTERGLOW_FRIEND_REPLIES = 2;
/** 朋友線連續交配／虛脫：較長餘韻。 */
export const AFTERGLOW_FRIEND_CONT_MS = 70 * 1000;
export const AFTERGLOW_FRIEND_CONT_REPLIES = 3;
export const AFTERGLOW_FRIEND_MARATHON_MS = 90 * 1000;
export const AFTERGLOW_FRIEND_MARATHON_REPLIES = 3;

/** 動作／命中部位 → 短暫衝擊 */
const SHOCK_BY_ID = {
  waist: 2,
  butt: 4,
  thigh: 5,
  breast: 5,
  breast_knead: 8,
  breast_suck: 10,
  nipple: 8,
  nipple_lick: 10,
  labia: 10,
  labia_rub: 14,
  clit: 14,
  vagina: 12,
  vagina_finger: 18,
  finger_in: 28,
  fingers_out: 12,
  pull_out: 12,
  uterus: 22,
  cervix_rub: 24,
  creampie: 24,
  penis_in: 26,
  vibe_in: 18,
  dildo_in: 20,
  cucumber_in: 18,
  anus: 14,
  lips: 4,
};

/** 動作地板：深部較高。 */
const FLOOR_ACT = {
  waist: 0,
  butt: 0,
  breast: 4,
  breast_knead: 8,
  breast_suck: 10,
  nipple_lick: 10,
  labia: 12,
  labia_rub: 16,
  finger_in: 42,
  vagina_finger: 48,
  cervix_rub: 55,
  pull_out: 16,
};

const VOICES = ["scream", "refuse", "gasp", "beggy", "blankish"];

export const MOAN_VOICE_LABELS = {
  scream: "連叫型",
  refuse: "碎拒崩壞型",
  gasp: "短喘型",
  beggy: "黏求型",
  blankish: "失語含糊型",
};

/** 五種呻吟／失神語氣池；每女永久抽一種。 */
const VOICE_POOLS = {
  scream: {
    moans: [
      "誒誒誒…", "啊啊啊…", "咿咿咿…", "嗯嗯嗯！", "啊啊…！", "咿啊啊…",
      "誒啊啊啊…", "嗯啊啊…！", "咿咿…啊啊！", "啊啊嗯嗯…", "誒誒…咿…", "啊——！",
      "嗯嗯啊啊…", "咿啊…誒…",
    ],
    blankBits: [
      "啊啊……", "……誒", "嗯嗯……", "……啊啊", "咿……", "啊……啊",
      "誒誒……", "……嗯嗯", "啊啊、啊", "……咿啊", "嗯……啊啊", "啊……誒",
      "咿咿……", "……啊、嗯",
    ],
    begBits: [
      "啊啊…慢、慢一點…", "不要啊啊…求你…", "嗯嗯…停、停一下…", "啊啊啊…受不了…",
      "咿…求你慢…啊啊", "不要那麼…啊啊啊", "誒誒…拜託…輕一點…", "啊啊…求你停一下…",
      "嗯嗯嗯…太、太深…啊啊", "咿啊…慢點…求你…", "不要一直…啊啊啊…", "啊…受不了了…嗯嗯！",
      "求你…啊啊…慢一點…", "誒…不要那麼用力…啊",
    ],
    stunBits: [
      "啊啊啊啊…！", "誒誒誒誒…", "嗯嗯嗯…！", "咿咿咿…啊！", "啊…啊啊啊…",
      "頭、腦袋…啊啊…", "說不了…啊啊啊！", "等、等一下…啊啊", "誒啊啊…空白…！",
      "嗯嗯…說不出…啊啊", "咿…頭好熱…啊啊！", "啊啊…什麼都…啊…", "誒誒…受不了…嗯嗯",
      "啊啊啊…不行了…！", "嗯…啊啊…腦袋…嗡…", "咿啊啊…說不了話…",
    ],
    spasmBits: [
      "啊啊啊…身、身體…抽…！", "嗯嗯嗯…停、停不下來…", "咿啊啊…腳軟…！",
      "去、去了…啊啊啊！", "顫、顫抖…嗯嗯…！", "啊啊…頭…空白…！",
      "誒誒…腰、腰在跳…！", "嗯啊啊…抽搐…停不了…", "咿…腳…站不住…啊啊！",
      "啊啊啊…整個人…顫…！", "嗯嗯…身體自己…動…！",
    ],
    painBits: [
      "痛啊啊…！不要碰…！", "過、過敏…好痛啊啊…", "啊痛…求你停…嗯嗯！",
      "碰不得…太、太過了…啊！", "不要…痛死了…啊啊！", "禁、禁臠…碰一下就…痛啊…",
      "啊啊…痛…別再碰…！", "嗯嗯…過敏了…好痛…啊！", "咿…痛死…求你停…",
      "太過了…啊啊…碰不得…！", "痛…啊啊啊…不要再…！",
    ],
    climaxBits: [
      "去了…啊啊啊啊！", "要去了…嗯嗯嗯！", "高潮…啊啊…！", "不行…去了啊啊！",
      "咿啊啊…射、腦子…！", "誒誒…要去了…啊啊！", "嗯嗯…高潮了…啊啊啊！",
      "啊啊…去了…頭空白…！", "咿…去了去了…嗯嗯！", "啊啊啊…洩…了…！",
      "嗯啊啊…高潮…說不了…！",
    ],
  },
  refuse: {
    moans: [
      "不…", "不要…", "停…", "要要…阿…", "不、不要…", "嗯…不…",
      "要…不要…", "停停…", "不要啊…", "不、不…", "要要阿…", "嗯不…停…",
      "不要…嗯…", "阿…不要…",
    ],
    blankBits: [
      "不……", "……不要", "停……", "……不", "要……", "不、……",
      "……停", "要要……", "不、不……", "……阿", "不要……嗯", "停、……",
      "……不要啊", "要……不",
    ],
    begBits: [
      "不要…求你…停…", "不、不要再…", "停停…拜託…", "求你…不要啊…",
      "要要…不要…慢…", "不要那麼…深…求你", "不要…拜託停…", "求你…不要再弄…",
      "停…求你…慢一點…", "不、不要那麼用力…", "不要啊…輕一點…求你", "停停…不要進…",
      "求你…不要一直…", "不要…求你放開…",
    ],
    stunBits: [
      "不要啊啊…", "不、不…要要阿阿…", "停停…求你…", "不要…嗯…不…",
      "求你…停…啊", "頭…不要…說不了…", "不…還要…不…", "等、等一下…不要",
      "不要…頭…空白…", "停…說不了…不要…", "不、不要…阿阿…", "求你…不要…嗯…",
      "要要…停…不要…", "不要啊…腦袋…不…", "停停…頭熱…不要…", "不…說不出…停…",
    ],
    spasmBits: [
      "不要…身、身體…抽…！", "停…停不下來…不要…", "不…腳軟…嗯…！",
      "去了…不要啊…", "顫…求你停…", "不要…頭…空白…",
      "停…腰自己…跳…不要…", "不…抽搐…停不了…", "不要…腳…站不住…",
      "顫…不要碰…停…", "不要啊…身體…失控…",
    ],
    painBits: [
      "痛…！不要碰…！", "不要…好痛…停…", "啊痛…求你停…不要…",
      "碰不得…不要再…", "不要…痛死了…停…！", "禁…不要碰…痛…",
      "痛…求你…不要碰…！", "不要…過敏了…好痛…", "停…痛死…不要再…",
      "碰不得…痛…不要…！", "不要啊…太痛了…停…",
    ],
    climaxBits: [
      "不要…去了…啊…", "求你…要去了…不…", "不要高潮…啊啊…", "停…去了…不要…",
      "不…腦子…去了…", "不要…要去了…停…", "求你…不要讓我去…", "停…高潮了…不要…",
      "不…去了…阿…", "不要啊…洩了…", "停停…去了…不要…",
    ],
  },
  gasp: {
    moans: [
      "哈…", "啊…", "嗯…", "唔…", "哈啊…", "……啊",
      "嗯哈…", "啊唔…", "哈、", "唔嗯…", "啊…哈", "嗯…唔",
      "哈啊嗯…", "……唔",
    ],
    blankBits: [
      "哈……", "……啊", "嗯……", "……唔", "啊、", "哈啊……",
      "唔……", "……哈", "嗯、啊", "……嗯哈", "啊……唔", "哈、……",
      "……啊嗯", "唔、……",
    ],
    begBits: [
      "哈…慢、慢一點…", "啊…求你…停…", "嗯…等一下…", "唔…輕、輕一點…",
      "哈啊…受不了…", "啊…慢…求你…", "嗯…求你…慢點…", "哈…停一下…求你…",
      "唔…太、太深…哈…", "啊…輕一點…嗯…", "哈啊…拜託…慢…", "嗯唔…受不了了…",
      "啊…求你…等一下…", "哈…不要那麼…唔…",
    ],
    stunBits: [
      "哈…啊…！", "嗯…唔…", "啊、啊…", "哈啊…說不了…", "唔…頭、腦袋…",
      "啊…等一下…哈…", "嗯…哈啊…", "……啊、唔", "哈…頭熱…啊…",
      "唔…說不出…嗯…", "啊…空白…哈啊…", "嗯哈…腦袋…嗡…", "唔…受不了…啊…",
      "哈啊…什麼都…唔…", "啊…說不了話…嗯…", "……哈、頭…空白",
    ],
    spasmBits: [
      "哈…哈…身、身體…抽…", "啊…停、停不下來…", "嗯…腳軟…唔…！",
      "哈啊…去了…啊…", "顫…哈…說不了…", "唔…頭…空白…",
      "哈…腰…自己跳…", "嗯…抽搐…哈啊…", "啊唔…腳…站不住…",
      "哈啊…整個人…顫…", "唔…身體…失控…嗯…",
    ],
    painBits: [
      "痛…！哈…不要碰…", "過感…好痛…啊…", "啊痛…求你停…唔…",
      "碰不得…太過了…哈…", "不要…痛…嗯…！", "禁…碰一下就…痛…啊",
      "哈…痛…別碰…！", "嗯…過敏…好痛…唔…", "啊…痛死…求你停…",
      "碰不得…哈啊…痛…", "唔…太痛了…不要…",
    ],
    climaxBits: [
      "哈…要去了…啊…", "嗯…去了…唔…", "哈啊…高潮…", "啊…去了…哈…",
      "唔…腦子…空白…去了…", "哈…高潮了…嗯…", "啊唔…要去了…",
      "嗯哈…去了…空白…", "哈啊…洩了…唔…", "啊…高潮…說不了…",
      "唔…去了去了…哈…",
    ],
  },
  beggy: {
    moans: [
      "還要…", "嗯…還要…", "不要停…", "啊…要…", "慢一點啦…", "嗯啊…要…",
      "還要啦…", "要…還要…", "嗯…不要停…", "啊嗯…還要…", "慢點啦…要…", "還要…嗯啊…",
      "要嘛…", "不要停啦…",
    ],
    blankBits: [
      "還要……", "……要", "嗯……還", "不要停……", "……啦", "要……嗯",
      "還……要", "……慢", "要嘛……", "嗯……要", "……還要", "不要停、……",
      "……啊要", "慢……啦",
    ],
    begBits: [
      "慢一點啦…求你…", "還要…可是慢…", "不要停…可是輕一點…", "受不了了…慢…",
      "要去了…抱緊…", "拜託…慢一點啦…還要…", "還要…求你輕一點…", "慢點啦…可是不要停…",
      "要…抱緊我…慢…", "還要啦…太深了…慢…", "不要停…求你慢一點…", "嗯…還要…輕一點啦…",
      "拜託…還要…可是慢…", "受不了…還要…慢點啦…",
    ],
    stunBits: [
      "還要…啊…", "不要停…嗯…", "慢一點啦…啊嗯…", "受不了了…還要…",
      "要去了…說不了…", "頭…還要…空白…", "嗯…求你…不要停…", "等、等一下…還要…",
      "還要…頭熱…啊…", "不要停…說不出…嗯…", "慢一點啦…腦袋…嗡…", "要…空白…還要…",
      "嗯啊…還要…受不了…", "不要停啦…頭…啊…", "還要…什麼都…嗯…", "慢…還要…說不了…",
    ],
    spasmBits: [
      "還要…身、身體…抽…！", "不要停…哈啊…停不下來…", "慢一點啦…腳軟…嗯嗯…！",
      "要去了…啊啊…還要…", "顫、顫抖…不要停…", "嗯咿…頭…還要…空白…",
      "還要…腰自己…跳…！", "不要停…抽搐…還要…", "慢點啦…腳…站不住…還要…",
      "還要…整個人…顫…！", "嗯…身體…失控…還要…",
    ],
    painBits: [
      "痛…！可是…不要停…", "過感…好痛…還要…慢…", "啊痛…求你輕一點…還要…",
      "碰不得…太過了…可是要…", "不要那麼用力…痛…還要…", "禁…碰一下就…痛…可是…",
      "痛…慢一點啦…還要…", "好痛…可是不要停…", "過敏了…痛…還要…輕…",
      "碰不得…痛…可是要…", "太痛了…慢點…還要…",
    ],
    climaxBits: [
      "要去了…還要…啊…", "去了…不要停…嗯…", "高潮…抱緊…還要…", "受不了了…去了…！",
      "慢一點啦…要去了…啊啊…", "還要…高潮了…嗯…", "去了…還要…抱緊…",
      "不要停…洩了…啊…", "還要啦…去了…！", "嗯…高潮…還要…",
      "要去了…慢點啦…還要…",
    ],
  },
  blankish: {
    moans: [
      "……", "嗯……", "啊", "唔", "……嗯", "……啊",
      "……唔", "嗯", "啊……", "……。", "唔……", "……哈",
      "……嗯啊", "、……",
    ],
    blankBits: [
      "……", "嗯……", "啊", "唔", "說、說不了…", "頭…空白…",
      "…………", "……。", "……啊", "嗯、……", "……唔", "頭……",
      "……說不了", "空白……", "……嗯。",
    ],
    begBits: [
      "……求…停…", "慢……", "不要……", "……輕一點…", "受、……停…", "……求你…",
      "……慢…求…", "停……求你", "……不要…深…", "輕……一點…", "……受不了…停…",
      "求……慢…", "……拜託…停…", "不要……那麼…",
    ],
    stunBits: [
      "……啊", "嗯……", "說、說不了…", "頭、腦袋…", "……哈", "唔……",
      "……空白…", "等、……啊", "……頭熱…", "說不出……", "……嗡…", "腦袋……空白",
      "……受不了…", "嗯……頭…", "……什麼都…", "唔……說不了…",
    ],
    spasmBits: [
      "……身、身體…抽…", "……停不下來…", "腳…軟……嗯…", "去……啊…",
      "顫……說不了…", "嗯……頭…空白…", "……腰…跳…", "……抽搐…",
      "腳……站不住…", "……顫…整個人…", "身體……失控…嗯…",
    ],
    painBits: [
      "痛……不要碰…", "……好痛…", "啊痛……停…", "碰不得……太過了…",
      "不要……痛……", "禁……痛…", "……痛…別碰…", "過敏……好痛…",
      "……痛死…停…", "碰不得……痛…", "……太痛了…",
    ],
    climaxBits: [
      "……去了…", "要……去…", "……高潮…", "頭…空白…去了…", "說不了…去了…",
      "……要去了…", "去了……嗯…", "……洩了…", "高潮……空白…", "……去了。",
      "頭……去了…",
    ],
  },
};

const ACT_BITS = {
  waist: ["腰…嗯…", "好癢…", "腰側…哈…", "別捏腰…", "腰軟…嗯", "摸腰…啊…"],
  butt: ["臀…嗯…", "不要摸…", "屁股…哈…", "揉臀…唔…", "臀尖…麻…", "別打…嗯"],
  thigh: ["大腿…熱…", "再往上…嗯", "腿根…啊…", "大腿內側…", "夾緊…嗯…", "腿軟…哈…"],
  clit: ["陰蒂…！", "那裡…不行…", "嗯咿…！", "碰、碰到…", "小核…麻…！", "陰蒂…顫…", "頂到…嗯啊…"],
  labia: ["陰唇…熱…", "滑…嗯…", "不要摸…啊", "唇瓣…腫…", "外側…哈…", "陰唇…濕…"],
  labia_rub: ["陰唇…揉…！", "滑膩…嗯啊…", "不要一直揉…", "來回…蹭…！", "揉開…啊…", "唇…發燙…"],
  vagina: ["裡面…", "穴口…嗯…", "進、進來…", "穴…熱…", "入口…顫…", "裡面…緊…"],
  vagina_finger: ["扣…！", "裡面…攪…", "指尖…啊嗯…", "彎指…！", "攪弄…哈…", "扣到…那裡…"],
  finger_in: ["手指…！", "裡面滿…", "攪…啊嗯…", "拔、不要拔…", "指…好深…", "塞滿…嗯…", "手指…動…！"],
  fingers_out: ["空了…嗯…", "抽出…哈…", "手指…離開…", "裡面…空虛…"],
  pull_out: ["空了…！", "嗯啊…抽出…", "還、還要…", "拔出…哈…", "突然空…！", "不要抽…嗯"],
  breast: ["胸…嗯…", "摸…哈…", "乳…軟…", "胸部…熱…", "握著…唔…", "奶…嗯啊…"],
  breast_knead: ["奶…揉…嗯…", "用力…哈啊…", "揉胸…！", "乳肉…擠…", "捏揉…啊…", "胸部…變形…嗯"],
  breast_suck: ["吸…！", "乳…含著…嗯", "吮…哈啊…", "含住…唔…", "吸奶…麻…", "唇…吸着…"],
  nipple: ["乳頭…！", "乳尖…麻…", "奶頭…硬…", "尖端…顫…", "乳頭…碰不得…", "乳尖…啊…"],
  nipple_lick: ["舔…奶頭…！", "舌尖…麻…", "舔弄…嗯…", "舌…繞著…！", "舔濕…哈…", "乳尖…被舔…"],
  cervix_rub: ["宮口…！", "最裡面…啊…", "揉、揉到…！", "子宮口…麻…", "頂到最深…！", "宮口…顫…"],
  uterus: ["子宮…！", "宮口…麻…", "最深處…啊…", "宮…熱…", "裡面最深…！"],
  anus: ["後面…！", "肛…嗯…", "不要後面…", "後穴…熱…", "後面…麻…"],
  lips: ["唇…嗯…", "嘴…哈…", "接吻…唔…", "唇瓣…軟…"],
  penis_in: ["進來…！", "好大…嗯…", "塞滿…啊…", "進、進去了…", "裡面…滿滿…"],
  vibe_in: ["震動…！", "嗡…嗯啊…", "跳蛋…麻…", "震得…不行…"],
  dildo_in: ["假…進…！", "好硬…嗯…", "塞…啊…", "玩具…深…"],
  cucumber_in: ["冰…！嗯…", "黃瓜…進…", "好涼…啊…", "異物…裡面…"],
  creampie: ["射…裡面…！", "熱…灌…", "精…滿…嗯…", "中出…啊…"],
};


function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)] || "";
}

export function moanVoiceId(who) {
  const id = who?.bodyState?.moanVoice;
  return VOICES.includes(id) ? id : null;
}

/** 每人永久抽一種呻吟語氣；缺／無效才賦值一次。 */
export function ensureMoanVoice(who) {
  const b = ensureBody(who);
  if (!b) return "gasp";
  if (!VOICES.includes(b.moanVoice)) {
    b.moanVoice = pick(VOICES);
  }
  return b.moanVoice;
}


/** 日常 LLM：依 moanVoice 描述斷句／發熱時怎麼破句（不唸類型名）。 */
export function moanVoicePromptLines(who, actId = "") {
  const b = ensureStunFields(who);
  if (!b) return [];
  const id = ensureMoanVoice(who);
  const ar = arousalStage(b.arousal);
  const sm = speechMode(who, actId);
  // 沒被刺激（只是性奮／性慾高）→ 不給任何喘／叫聲習慣，正常說話。
  if (sm.mode === "composed") return [];
  if (sm.mode === "stimulated" && sm.level <= 1) {
    return ["【發聲習慣】只是被輕碰一下：最多一瞬短反應，其餘正常說完整句子，不要喘、不要叫。"];
  }
  const stun = sm.stun;
  const strong = sm.mode !== "stimulated" || sm.level >= 3
    || (sm.level >= 2 && (["aroused", "wantFill", "climax"].includes(ar) || stun >= 25));
  const hard = "硬性規則：不准唸出語氣類型名稱；只准用斷句與叫聲習慣演出。";
  const byId = {
    scream: strong
      ? "被刺激時容易拉長母音（啊啊、誒誒），句子不平穩，常被叫聲截斷。"
      : "斷句略不穩；偶爾把母音拉長一點點，仍以日常話為主。",
    refuse: strong
      ? "習慣碎成「不要／不／要…」式推拒或口是心非，正常話裡會夾短拒。"
      : "偶爾把否定縮成短音（不、不要…），仍能說完整句。",
    gasp: strong
      ? "短促換氣、哈…啊… 斷句；話說一半會喘一下再接。"
      : "習慣在句中留一點氣口，偶爾「哈…」一下，不要整段變喘。",
    beggy: strong
      ? "黏、求慢／還要 會夾在正常話裡；語氣軟、愛撒一點。"
      : "語氣偏黏，偶夾「慢點／還要」意味，但仍是日常回話。",
    blankish: strong
      ? "話變短、多省略、常 ……；說不完整句也沒關係。"
      : "習慣話短一點、偶用省略，不要無故整句空白。",
  };
  const line = byId[id] || byId.gasp;
  return [hard, `【發聲習慣】${line}`];
}

function voicePools(who) {
  const id = ensureMoanVoice(who);
  return VOICE_POOLS[id] || VOICE_POOLS.gasp;
}

function mixClimax(pool, style, chance = 0.3) {
  if (Math.random() >= chance) return pool;
  const bits = style.climaxBits || [];
  if (!bits.length) return pool;
  return [...pool, ...bits];
}


function decayShock(b) {
  if (!b) return;
  const now = Date.now();
  const at = Number(b.shockAt) || 0;
  if (!at || !(b.shock > 0)) return;
  const elapsed = now - at;
  if (elapsed < 3500) return;
  const steps = Math.floor(elapsed / 3500);
  b.shock = clamp((b.shock || 0) - steps * 12, 0, SHOCK_MAX);
  b.shockAt = now;
}

/** 確保冲击欄位存在（寫在 bodyState 上，隨 persistRoom 保存）。 */
export function ensureStunFields(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.shock = clamp(b.shock, 0, SHOCK_MAX);
  b.shockAt = Number(b.shockAt) || 0;
  b.shockRepliesLeft = Math.max(0, Number(b.shockRepliesLeft) || 0);
  b.talkExchangeCount = Math.max(0, Math.round(Number(b.talkExchangeCount) || 0));
  b.spasmUntil = Math.max(0, Number(b.spasmUntil) || 0);
  b.overstim = !!b.overstim;
  if (b.spasmUntil && Date.now() >= b.spasmUntil) {
    b.spasmUntil = 0;
    b.overstim = false;
  }
  b.stunCarry = clamp(b.stunCarry, 0, 100);
  b.stunCarryAt = Number(b.stunCarryAt) || 0;
  b.afterglowUntil = Math.max(0, Number(b.afterglowUntil) || 0);
  b.afterglowReplies = Math.max(0, Math.round(Number(b.afterglowReplies) || 0));
  if (!["hers", "his", "both"].includes(b.afterglowKind)) b.afterglowKind = "";
  b.afterglowSource = b.afterglowSource === "friend" ? "friend" : "";
  if (!["creampie", "external"].includes(b.afterglowEjac)) b.afterglowEjac = "";
  // 雙重門檻：時間與回覆數皆耗盡才清掉
  if (!(b.afterglowUntil && Date.now() < b.afterglowUntil) && !(b.afterglowReplies > 0)) {
    b.afterglowUntil = 0;
    b.afterglowReplies = 0;
    b.afterglowKind = "";
    b.afterglowSource = "";
    b.afterglowEjac = "";
  }
  ensureMoanVoice(who);
  return b;
}

export function noteActShock(who, actOrHitId) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  const id = String(actOrHitId || "");
  let add = SHOCK_BY_ID[id] || (id ? 8 : 0);
  if ((id === "finger_in" || id === "vagina_finger" || id === "cervix_rub") && !insertUnlocked(who)) {
    add = Math.min(add, 5);
  }
  const peripheral = ["waist", "butt", "thigh", "breast", "breast_knead"].includes(id);
  if (peripheral) add = Math.min(add, id === "breast_knead" ? 8 : 6);
  if (!add) return b.shock;
  if (peripheral) {
    b.shock = clamp(Math.max(b.shock || 0, add) + Math.floor(add / 2), 0, 16);
  } else if (id === "labia" || id === "labia_rub" || id === "clit" || id === "nipple_lick" || id === "breast_suck") {
    b.shock = clamp((b.shock || 0) + add, 0, 32);
  } else {
    b.shock = clamp((b.shock || 0) + add, 0, SHOCK_MAX);
  }
  b.shockAt = Date.now();
  const deep = id === "finger_in" || id === "vagina_finger" || id === "cervix_rub";
  b.shockRepliesLeft = Math.max(b.shockRepliesLeft || 0, deep ? 2 : 1);
  return b.shock;
}

export function tickStunAfterReply(who) {
  const b = ensureStunFields(who);
  if (!b) return;
  // 刺激留下的失神殘量：每句回覆再退一截（沒被刺激時才會用到）
  if (b.stunCarry > 0) b.stunCarry = clamp(decayedCarry(b) - STUN_CARRY_PER_REPLY, 0, 100);
  b.stunCarryAt = Date.now();
  if (b.shockRepliesLeft > 0) {
    b.shockRepliesLeft -= 1;
    b.shock = clamp((b.shock || 0) - 16, 0, SHOCK_MAX);
  } else {
    b.shock = clamp((b.shock || 0) - 10, 0, SHOCK_MAX);
  }
  b.shockAt = Date.now();
}

/**
 * 沒有實際刺激時的失神上限：低於失神(75)也低於痙攣門檻(70)，
 * 性奮／開放度再高也不能單獨把她推進失神或一碰就痙攣。
 */
export const UNSTIM_STUN_CAP = 69;
/** 刺激留下的失神殘量衰減：每秒 0.5、每句回覆再 −8。 */
const STUN_CARRY_PER_SEC = 0.5;
const STUN_CARRY_PER_REPLY = 8;

function decayedCarry(b) {
  const carry = Number(b?.stunCarry) || 0;
  if (carry <= 0) return 0;
  const at = Number(b.stunCarryAt) || 0;
  const sec = at ? Math.max(0, (Date.now() - at) / 1000) : 0;
  return Math.max(0, carry - sec * STUN_CARRY_PER_SEC);
}

/** 失神是否不受上限（正被性刺激 level≥2／痙攣／餘韻）。 */
function stunUncapped(who, actId = "") {
  if (inSpasm(who) || inAfterglow(who)) return true;
  return stimulationState(who, actId).level >= 2;
}

/**
 * 失神分數 0–100。
 * arousal→最多約40；libido 加成／倍率；器官濕腫塞；shock 暫衝。
 * 軟頂改依開放度（取代 teaseStage）。
 * 沒被實際刺激時：上限 UNSTIM_STUN_CAP，只允許「剛才刺激留下的殘量」照常退去（stunCarry），
 * 性奮／開放度本身不能製造或維持失神。
 */
export function calcStun(who, actId = "") {
  const raw = calcStunRaw(who);
  const b = ensureStunFields(who);
  if (!b) return raw;
  if (stunUncapped(who, actId)) {
    // 記住刺激中的失神值，刺激停止後讓它自然退
    b.stunCarry = clamp(Math.max(decayedCarry(b), raw), 0, 100);
    b.stunCarryAt = Date.now();
    return raw;
  }
  const ceiling = Math.max(UNSTIM_STUN_CAP, decayedCarry(b));
  return clamp(Math.min(raw, ceiling), 0, 100);
}

/** 未套「沒刺激上限」的原始失神分數。 */
function calcStunRaw(who) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  decayShock(b);
  const o = b.organs || {};
  const arousalPts = (clamp(b.arousal, 0, 30) / 30) * 34;
  const libidoBoost = (clamp(b.libido, 0, 30) / 30) * 12;
  const open = Math.max(0, Math.min(100, Number(b.openness) || 0));
  // 開放度壓低週邊失神：0→0.35，55→約0.7，100→1.0
  const openScale = 0.35 + (open / 100) * 0.65;
  let organ = 0;
  organ += (o.clit?.swell || 0) * 3;
  if (o.clit?.wet) organ += 4;
  organ += (o.labia?.swell || 0) * 2;
  if (o.labia?.wet) organ += 3;
  organ += (o.vagina?.wet || 0) * 3;
  if (o.vagina?.stuffed) organ += insertUnlocked(who) ? 10 : 4;
  if (o.anus?.stuffed) organ += 5;
  organ += (o.uterus?.semen || 0) * 2;
  if ((o.nipples?.swell || 0) >= 2) organ += 2;
  if ((o.breasts?.swell || 0) >= 2) organ += 2;
  organ *= openScale;

  const libMult = 0.85 + (clamp(b.libido, 0, 30) / 30) * 0.25;
  const shock = clamp(b.shock || 0, 0, SHOCK_MAX);
  let score = (arousalPts + organ) * libMult + libidoBoost + shock;
  // 未插入前軟頂：低開放度壓失神跳過 LLM
  if (!o.vagina?.stuffed) {
    const softCap = open < 32 ? 38 : open < 55 ? 50 : open < 78 ? 64 : 80;
    score = Math.min(score, softCap);
  }
  return clamp(score, 0, 100);
}

export function stunFloorForAct(actId, who = null) {
  if (!actId) return 0;
  if (actId === "finger_in" || actId === "vagina_finger" || actId === "cervix_rub") {
    if (who && insertUnlocked(who)) return FLOOR_ACT[actId] ?? 42;
    return 8;
  }
  return FLOOR_ACT[actId] ?? 0;
}

/** 含動作地板的有效失神值。 */
export function effectiveStun(who, actId = "") {
  return Math.max(calcStun(who, actId), stunFloorForAct(actId, who));
}

/**
 * calm <25 | interfere 25–49 | blank 50–64 | beg 65–74 | stun ≥75
 * （舊 broken 拆成 blank／beg）
 */
export function stunTier(stun) {
  const s = clamp(stun, 0, 100);
  if (s >= 75) return "stun";
  if (s >= 65) return "beg";
  if (s >= 50) return "blank";
  if (s >= 25) return "interfere";
  return "calm";
}

export function inSpasm(who) {
  const b = ensureStunFields(who);
  if (!b) return false;
  return !!(b.spasmUntil && Date.now() < b.spasmUntil);
}

export function inOverstim(who) {
  const b = ensureStunFields(who);
  return !!(b && b.overstim && inSpasm(who));
}

/** 是否處於餘韻（時間未到 或 尚有強制餘韻回覆）。 */
export function inAfterglow(who) {
  const b = ensureStunFields(who);
  if (!b) return false;
  const timeOk = !!(b.afterglowUntil && Date.now() < b.afterglowUntil);
  const repliesOk = (b.afterglowReplies || 0) > 0;
  if (!timeOk && !repliesOk) return false;
  return true;
}

/**
 * 標記餘韻。kind: "hers" | "his" | "both"
 * opts: { ms?, replies?, source? } — source="friend" 為朋友線短餘韻
 * 疊加：until=max；若 hers+his → kind=both、replies=max(replies,3)
 */
export function noteAfterglow(who, kind = "hers", opts = {}) {
  const b = ensureStunFields(who);
  if (!b) return null;
  const k = kind === "his" ? "his" : kind === "both" ? "both" : "hers";
  const now = Date.now();
  const addMs = Number(opts?.ms) > 0
    ? Math.round(Number(opts.ms))
    : (k === "his" ? AFTERGLOW_HIS_MS : AFTERGLOW_HERS_MS);
  const addReplies = Number(opts?.replies) > 0
    ? Math.max(1, Math.round(Number(opts.replies)))
    : (k === "his" ? AFTERGLOW_HIS_REPLIES : AFTERGLOW_HERS_REPLIES);
  const prevUntil = Math.max(0, Number(b.afterglowUntil) || 0);
  const prevReplies = Math.max(0, Number(b.afterglowReplies) || 0);
  const prevKind = ["hers", "his", "both"].includes(b.afterglowKind) ? b.afterglowKind : "";
  const prevActive = (prevUntil && now < prevUntil) || prevReplies > 0;

  b.afterglowUntil = Math.max(prevUntil, now + addMs);

  if (k === "both" || (prevActive && prevKind && prevKind !== k && prevKind !== "both")) {
    b.afterglowKind = "both";
    b.afterglowReplies = Math.max(prevReplies, addReplies, 3);
  } else if (prevActive && prevKind === "both") {
    b.afterglowKind = "both";
    b.afterglowReplies = Math.max(prevReplies, addReplies, 3);
  } else {
    b.afterglowKind = k;
    b.afterglowReplies = Math.max(prevReplies, addReplies);
  }
  if (opts?.source) b.afterglowSource = String(opts.source);
  else if (!prevActive) b.afterglowSource = "";
  // ejac: "creampie" | "external" — 玩家射精途徑（內射 vs 外射／興奮洩精）
  if (opts?.ejac === "creampie" || opts?.ejac === "external") {
    b.afterglowEjac = opts.ejac;
  } else if (!prevActive && (k === "his" || k === "both")) {
    // 未標明時：有子宮精液視為內射，否則外射／興奮洩精
    const semen = b.organs?.uterus?.semen || 0;
    b.afterglowEjac = semen > 0 ? "creampie" : "external";
  }
  return b;
}

/** 每句助手回覆後消耗一次強制餘韻回覆數。 */
export function consumeAfterglowReply(who) {
  const b = ensureStunFields(who);
  if (!b) return;
  if (!inAfterglow(who)) return;
  if ((b.afterglowReplies || 0) > 0) b.afterglowReplies -= 1;
  if (!(b.afterglowUntil && Date.now() < b.afterglowUntil) && !(b.afterglowReplies > 0)) {
    b.afterglowUntil = 0;
    b.afterglowReplies = 0;
    b.afterglowKind = "";
    b.afterglowSource = "";
    b.afterglowEjac = "";
  }
}


/** 陌生～親密好友：外射時可嘲／調侃。 */
function isShallowRelStage(stage) {
  const s = String(stage || "stranger");
  return s === "stranger" || s === "acquaintance" || s === "friend" || s === "close_friend";
}

/** 餘韻射精途徑：explicit afterglowEjac，否則依子宮精液推斷。 */
function resolveAfterglowEjac(b, semen = null) {
  if (b?.afterglowEjac === "creampie" || b?.afterglowEjac === "external") return b.afterglowEjac;
  const n = semen != null ? semen : (b?.organs?.uterus?.semen || 0);
  return n > 0 ? "creampie" : "external";
}

/** 外射／興奮洩精時，把誤說的內射句改成外射承認（模板／LLM 雙保險）。 */
export function scrubFalseCreampieLine(line, who = null) {
  const s = String(line || "");
  if (!s) return s;
  const b = who ? ensureStunFields(who) : null;
  if (b) {
    const kind = b.afterglowKind || "";
    if (kind !== "his" && kind !== "both") return s;
    if (resolveAfterglowEjac(b) === "creampie") return s;
  }
  return s
    .replace(/又?射進來了/g, "射精了")
    .replace(/射進來/g, "射了")
    .replace(/射進去/g, "射出來")
    .replace(/中出了?/g, "射了")
    .replace(/灌進(?:子宮|去|來)/g, "射了")
    .replace(/裡面(?:好熱|燙|滿了|滿滿)/g, "外面…熱");
}

/** 餘韻模板：高潮碎片＋空白／短喘，依 kind 微調。 */
export function afterglowTemplate(who, actId = "") {
  ensureStunFields(who);
  const b = ensureStunFields(who);
  const style = voicePools(who);
  const kind = b?.afterglowKind || "hers";
  const actBits = ACT_BITS[actId] || [];
  const semen = b?.organs?.uterus?.semen || 0;
  // 朋友線短餘韻：較輕的喘／腿軟，不當她剛被玩家弄到高潮
  if (b?.afterglowSource === "friend") {
    const friendBits = [
      "哈…身體還熱…", "腿…有點軟…", "嗯…別盯著看…",
      "剛…外面…哈…", "還有點喘…", "身體…還沒平…",
      "……哈。", "嗯…等一下…",
    ];
    const pool = [
      ...friendBits,
      ...style.blankBits.slice(0, 3),
      ...style.moans.slice(0, 2),
    ];
    const n = 1 + Math.floor(Math.random() * 2);
    const parts = [];
    for (let i = 0; i < n; i++) parts.push(pick(pool));
    return parts.join("").replace(/(…)+/g, "…").slice(0, 22);
  }
  const hisCreampieBits = [
    "被射到…裡面…熱…", "裡面好熱…嗯…", "精液…還在…啊…",
    "滿、滿的…哈…", "射進來了…腿軟…", "裡面…燙…說不了…",
  ];
  // 外射／興奮洩精：知道他射了，但不說射進來
  const hisExternalBits = [
    "啊…你剛剛…是不是射精了…", "你…哈…射了…？", "精…外面…嗯…",
    "射、射了…腿軟…", "哈…你射了…", "外面…熱…說不了…",
  ];
  const hisExternalTeaseBits = [
    "就這樣射了？…哈", "只是摸摸…就…？", "還沒進來…就射了？",
    "這麼快…？嘻…", "射在外面…真沒用…", "啊…這麼快就…洩了？",
  ];
  const ejac = resolveAfterglowEjac(b, semen);
  const shallow = isShallowRelStage(who?.stage);
  let hisBits = ejac === "creampie" ? hisCreampieBits : hisExternalBits;
  if (ejac !== "creampie" && shallow) {
    hisBits = [...hisExternalTeaseBits, ...hisExternalBits];
  }
  const hersBits = style.climaxBits || [];
  const bothBits = [...hersBits.slice(0, 4), ...hisBits.slice(0, 3)];
  let flavor = hersBits;
  if (kind === "his") flavor = hisBits;
  else if (kind === "both") {
    flavor = (ejac === "creampie" && Math.random() < 0.55) ? hisBits : bothBits;
  }

  let pool = [
    ...flavor,
    ...style.blankBits.slice(0, 5),
    ...style.moans.slice(0, 4),
    ...(actBits.length ? actBits.slice(0, 2) : []),
  ];
  if (kind === "his" || kind === "both") pool = [...pool, ...hisBits];
  // 外射時絕不用內射 ACT 碎片
  if (ejac !== "creampie" && actId === "creampie") {
    pool = pool.filter((s) => !(ACT_BITS.creampie || []).includes(s));
  }
  pool = mixClimax(pool, style, 0.55);
  const n = 2 + Math.floor(Math.random() * 2);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 26);
}

/** LLM 仍跑時：強制餘韻語氣（不准恢復冷靜長句）。 */
export function afterglowPromptLines(who) {
  const b = ensureStunFields(who);
  if (!b || !inAfterglow(who)) return [];
  const kind = b.afterglowKind || "hers";
  const semen = b.organs?.uterus?.semen || 0;
  if (b.afterglowSource === "friend") {
    return [
      "【餘韻・外人】你剛與房間外的人有過身體關係，身體還軟、喘還沒完全平。",
      "硬性：這幾句偏短、帶餘韻；不准突然冷靜長句；不准報狀態名（餘韻／高潮等）。",
      "不要詳細交代過程；可帶一點心虛或坦然（看個性），仍以短喘／空白為主。",
    ];
  }
  const lines = [
    "【餘韻】你剛高潮／剛被弄到洩身（或剛被他射過），這幾句必須餘韻、喘、空白、腿軟。",
    "硬性：不准突然恢復冷靜長句；不准報狀態名（高潮／失神／餘韻等）；句子要短、斷、多省略。",
  ];
  if (kind === "hers") {
    lines.push("剛自己去過：頭還空白、腿軟、呼吸亂；可夾「去了…」「還在顫…」碎片。");
  } else if (kind === "his") {
    const ejac = resolveAfterglowEjac(b, semen);
    if (ejac === "creampie") {
      lines.push("剛被他內射／裡面還熱：可夾「被射到…」「射進來了…」「裡面好熱…」；仍是喘與空白，不是敘事。");
    } else {
      lines.push("他剛射精，但是外射／興奮洩精——精液不在裡面。硬性：禁止說「射進來」「中出」「灌進子宮」「裡面滿了」等內射句。");
      lines.push("最多承認他在外面射了，例如「啊 你剛剛是不是射精了」「你…」「射了…哈」。");
      if (isShallowRelStage(who?.stage)) {
        lines.push("關係尚淺（陌生／朋友）：可以嘲弄／調侃他太快或只是摸摸就射，短句即可。");
      }
    }
  } else {
    const ejac = resolveAfterglowEjac(b, semen);
    if (ejac === "creampie") {
      lines.push("兩人剛一起過：你剛去、他又射在裡面——餘韻＋裡面熱；短喘空白為主。");
    } else {
      lines.push("兩人剛一起過：雙重餘韻；他若剛射是外射／興奮洩精——禁止說射進來／內射；喘、空白、腿軟；不准長篇冷靜回話。");
      if (isShallowRelStage(who?.stage)) {
        lines.push("關係尚淺：可短短嘲他外面射了／太快。");
      }
    }
  }
  return lines;
}

/**
 * 高失神後繼續挑逗 → 痙攣；痙攣中再挑逗 → 過感痛苦。
 */
export function applyTeaseSpasm(who, actId = "", stunBefore = null) {
  const b = ensureStunFields(who);
  if (!b) return { enteredSpasm: false, enteredPain: false, mode: "normal" };
  let enteredSpasm = false;
  let enteredPain = false;
  if (inSpasm(who)) {
    if (actId) {
      b.overstim = true;
      enteredPain = true;
      b.spasmUntil = Math.max(b.spasmUntil, Date.now() + Math.floor(SPASM_MS / 2));
    }
  } else if (actId && stunBefore != null && stunBefore >= SPASM_ENTER_STUN) {
    b.spasmUntil = Date.now() + SPASM_MS;
    b.overstim = false;
    enteredSpasm = true;
  }
  const mode = inOverstim(who) ? "pain" : inSpasm(who) ? "spasm" : "normal";
  return { enteredSpasm, enteredPain, mode };
}

export function spasmTemplate(who, actId = "") {
  ensureStunFields(who);
  const style = voicePools(who);
  let pool = inOverstim(who)
    ? [...style.painBits, ...style.stunBits.slice(0, 3)]
    : [...style.spasmBits, ...(ACT_BITS[actId] || []), ...style.moans];
  pool = mixClimax(pool, style, 0.3);
  const n = 2 + Math.floor(Math.random() * 2);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 28);
}

/** 每完成一輪對話 +1；每 2–3 輪降性奮／衝擊。 */
export function noteTalkExchange(who) {
  const b = ensureStunFields(who);
  if (!b) return b;
  b.talkExchangeCount = (b.talkExchangeCount || 0) + 1;
  if (b.talkExchangeCount % 3 === 0 && !inSpasm(who)) {
    b.arousal = clamp((b.arousal || 0) - 2, 0, 30);
    b.shock = clamp((b.shock || 0) - 8, 0, SHOCK_MAX);
  }
  return b;
}

export function shouldSkipLlm(stun, who = null) {
  if (who && inSpasm(who)) return true;
  // 餘韻強制回覆數尚餘：優先走模板（與 blank/beg 同層偏好）
  if (who && inAfterglow(who)) {
    const b = ensureStunFields(who);
    if (b && (b.afterglowReplies || 0) > 0) return true;
  }
  return clamp(stun, 0, 100) >= 75;
}

/**
 * 說話模式：決定她能不能正常講話。性奮／性慾高低「本身」不會讓說話崩壞。
 * - spasm：痙攣／過感中
 * - afterglow：剛高潮的餘韻
 * - stun：有效失神 ≥75
 * - stimulated：身體正被刺激（手指／玩具／陰莖插著、跳蛋、本回合正被摸）；level 1 輕觸、2 性感帶／插著、3 強刺激
 * - composed：以上皆無 → 盡力鎮定、正常完整句子
 */
export function speechMode(who, actId = "") {
  const b = ensureStunFields(who);
  if (!b) return { mode: "composed", level: 0, reasons: [], stun: 0, tier: "calm" };
  const stun = effectiveStun(who, actId);
  const tier = stunTier(stun);
  const stim = stimulationState(who, actId);
  const base = { level: stim.level, reasons: stim.reasons, stun, tier, inserted: stim.inserted };
  if (inSpasm(who)) return { ...base, mode: "spasm", level: Math.max(3, stim.level) };
  if (inAfterglow(who)) return { ...base, mode: "afterglow", level: Math.max(2, stim.level) };
  if (tier === "stun") return { ...base, mode: "stun", level: Math.max(3, stim.level) };
  if (stim.active) return { ...base, mode: "stimulated" };
  return { ...base, mode: "composed", level: 0 };
}

/** 是否允許「嗯／啊」喘息與斷句（失神／痙攣／餘韻／正被刺激 level≥2）。 */
export function speechMayBreak(who, actId = "") {
  const sm = speechMode(who, actId);
  return sm.mode !== "composed" && !(sm.mode === "stimulated" && sm.level <= 1);
}

function stripCausal(text) {
  return String(text || "")
    .replace(/(?:因為|所以|畢竟|也就是說|總之|簡單說|換句話說)[^。！？…\n]*/g, "")
    .replace(/(?:我覺得|其實|不過|但是|雖然|如果|而且)[^，。！？…\n]*/g, "")
    .replace(/[，,]{2,}/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function splitClauses(text) {
  return String(text || "")
    .split(/(?<=[。！？…!?]|\n)|[，,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function keepScrap(clause) {
  const s = String(clause || "").trim();
  if (!s) return "";
  if (/^(嗯|啊|唔|哈|咿|呀|喔|哦|……|…)+[!！?？]*$/.test(s)) return s;
  if (/不要|還要|不行|等一下|那裡|裡面|陰蒂|陰唇|乳頭|好爽|不行了|求|停|慢/.test(s)) {
    return s.length > 10 ? s.slice(0, 10) : s;
  }
  if (s.length <= 6) return s;
  if (s.length <= 12 && /[嗯啊唔哈咿呀]/.test(s)) return s.slice(0, 8);
  return "";
}

function insertBreaths(text, who = null) {
  const moans = who ? voicePools(who).moans : VOICE_POOLS.gasp.moans;
  const parts = splitClauses(text);
  if (!parts.length) return pick(moans);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    if (p.length > 18) {
      const cut = Math.max(6, Math.floor(p.length / 2));
      out.push(`${p.slice(0, cut)}…`);
      out.push(pick(moans));
      out.push(p.slice(cut));
    } else {
      out.push(p);
    }
    if (i < parts.length - 1 && Math.random() < 0.55) out.push(pick(moans));
  }
  return out.join("").replace(/(…)+/g, "…").trim();
}

function scrambleBroken(text, actId = "", who = null) {
  const style = voicePools(who);
  const stripped = stripCausal(text);
  const scraps = splitClauses(stripped).map(keepScrap).filter(Boolean);
  const bits = scraps.slice(0, 3);
  if (bits.join("").replace(/[。．…！!？?\s]/g, "").length < 4) {
    return blankTemplate(actId, who);
  }
  if (Math.random() < 0.75) bits.splice(Math.min(1, bits.length), 0, pick(style.moans));
  while (bits.length < 2) bits.push(pick(style.moans));
  let out = bits.join("");
  if (out.length > 28) out = out.slice(0, 28) + "…";
  out = stripCausal(out).replace(/^[。．…！!？?\s]+/, "").trim();
  if (!out || out.length < 2) return blankTemplate(actId, who);
  return out;
}

function blankTemplate(actId = "", who = null) {
  const style = voicePools(who);
  const actBits = ACT_BITS[actId] || [];
  const pool = [...style.blankBits, ...style.moans.slice(0, 3)];
  // 極稀疏：1–2 片，常只有 ……
  if (Math.random() < 0.45) return pick(style.blankBits);
  const parts = [pick(pool)];
  if (Math.random() < 0.5 && actBits.length) parts.push(pick(actBits).slice(0, 5));
  else if (Math.random() < 0.4) parts.push(pick(style.blankBits));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 16);
}

function begTemplate(actId = "", who = null) {
  const style = voicePools(who);
  const actBits = ACT_BITS[actId] || [];
  const pool = [...style.begBits, ...style.blankBits.slice(0, 3), ...actBits];
  const parts = [];
  // 求饒為主，偶爾夾空白／部位
  parts.push(pick(style.begBits));
  if (Math.random() < 0.55) {
    if (actBits.length && Math.random() < 0.45) parts.push(pick(actBits));
    else parts.push(Math.random() < 0.4 ? pick(style.blankBits) : pick(pool));
  } else if (actBits.length && Math.random() < 0.35) {
    parts.push(pick(actBits));
  }
  return parts.join("").replace(/(…)+/g, "…").slice(0, 24);
}

export function stunTemplate(stun, actId = "", who = null) {
  const style = voicePools(who);
  const tier = stunTier(stun);
  if (tier === "blank") return blankTemplate(actId, who);
  if (tier === "beg") return begTemplate(actId, who);
  const actBits = ACT_BITS[actId] || ACT_BITS[talkActById(actId)?.hitId] || [];
  let pool = tier === "stun"
    ? [...style.stunBits, ...actBits, ...actBits, ...style.moans]
    : [...style.moans, ...actBits, "等、等一下…", "嗯…哈…"];
  if (tier === "stun") pool = mixClimax(pool, style, 0.3);
  const n = tier === "stun" ? 2 + Math.floor(Math.random() * 2) : 2;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 24);
}

/**
 * 依失神階改寫回覆。≥75 應走模板；若仍傳入則整段替換。
 * 50–64 空白；65–74 求饒混空白；痙攣／過感覆寫。
 */

/**
 * 日常回覆輕量點綴：不整段替換成模板。
 * calm：僅在 aroused+ 或 stun≥25 時偶插短喘／斷句。
 * interfere：可稍強一點，仍保留原文可讀。
 */
function lightMoanSprinkle(text, who, stun, interfere, actId = "") {
  if (!who || !text) return text;
  const b = ensureStunFields(who);
  if (!b) return text;
  // 只有性奮高、身體沒被刺激 → 不插任何喘息（正常說話）。
  if (!speechMayBreak(who, actId)) return text;
  const ar = arousalStage(b.arousal);
  const hot = ["aroused", "wantFill", "climax"].includes(ar) || stun >= 25;
  if (!hot) return text;
  const style = voicePools(who);
  const moan = pick(style.moans);
  if (!moan) return text;
  const chance = interfere ? 0.55 : 0.35;
  if (Math.random() >= chance) return text;
  const mode = Math.random();
  // 插入短喘、或在中段斷開、或句尾加省略＋短音
  if (mode < 0.4 && text.length >= 8) {
    const cut = Math.max(3, Math.floor(text.length * (0.35 + Math.random() * 0.3)));
    return `${text.slice(0, cut)}…${moan}${text.slice(cut)}`.replace(/(…)+/g, "…");
  }
  if (mode < 0.7) {
    return `${moan}${text}`.replace(/(…)+/g, "…");
  }
  const trimmed = text.length > 40 ? text.slice(0, 36) + "…" : text;
  return `${trimmed}${moan}`.replace(/(…)+/g, "…");
}

export function scrambleReply(text, stun, actId = "", who = null) {
  if (who && inSpasm(who)) {
    return spasmTemplate(who, actId);
  }
  // 餘韻：優先模板；若仍有原文則大幅壓成喘／空白碎片
  if (who && inAfterglow(who)) {
    const rawAg = String(text || "").trim();
    if (!rawAg || Math.random() < 0.8) return afterglowTemplate(who, actId);
    const styleAg = voicePools(who);
    const scraps = splitClauses(stripCausal(rawAg)).map(keepScrap).filter(Boolean).slice(0, 2);
    const bit = pick((styleAg.climaxBits || []).concat(styleAg.blankBits.slice(0, 4), styleAg.moans.slice(0, 3)));
    if (!scraps.length) return afterglowTemplate(who, actId);
    return (bit + scraps.join("")).replace(/(…)+/g, "…").slice(0, 24) || afterglowTemplate(who, actId);
  }
  const style = voicePools(who);
  const s = clamp(stun, 0, 100);
  const tier = stunTier(s);
  const raw = String(text || "").trim();
  // 普通閒聊（無挑逗 act）：僅失神／痙攣改寫；干擾／空白／求饒保持可讀
  // 週邊輕觸（摟腰／摸臀等）不算會讓說話崩壞的刺激：同閒聊處理。
  const teasing = !!String(actId || "").trim() && speechMayBreak(who, actId);
  if (!teasing && tier !== "stun") {
    let out = raw;
    if (out.length > 80) out = out.slice(0, 72) + "…";
    out = lightMoanSprinkle(out, who, s, false, actId) || out;
    return out || "……";
  }
  if (tier === "calm") {
    let out = raw;
    if (out.length > 80) out = out.slice(0, 72) + "…";
    out = lightMoanSprinkle(out, who, s, false, actId) || out;
    return out || "……";
  }
  if (tier === "stun" || !raw) return stunTemplate(s, actId, who);
  if (tier === "blank") {
    // LLM 回覆壓成空白碎片，或整段換成空白模板（僅挑逗中）
    if (Math.random() < 0.6) return blankTemplate(actId, who);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 2);
    if (!scraps.length) return blankTemplate(actId, who);
    return (scraps.join("") + (Math.random() < 0.5 ? "……" : "")).slice(0, 18);
  }
  if (tier === "beg") {
    // 求饒模板為主，偶留一點原文碎片（僅挑逗中）
    if (Math.random() < 0.7 || !raw) return begTemplate(actId, who);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 1);
    const beg = pick(style.begBits);
    return (beg + (scraps[0] || pick(style.blankBits))).replace(/(…)+/g, "…").slice(0, 24);
  }
  if (tier === "interfere") {
    let out = insertBreaths(raw, who);
    if (out.length > 56) out = out.slice(0, 52) + "…";
    out = lightMoanSprinkle(out, who, s, true, actId) || out;
    return out || pick(style.moans);
  }
  return scrambleBroken(raw, actId, who);
}

/** 給 UI／除錯：當前分數與階。 */
export function stunSnapshot(who, actId = "") {
  const score = effectiveStun(who, actId);
  const mode = inOverstim(who) ? "pain" : inSpasm(who) ? "spasm" : inAfterglow(who) ? "afterglow" : "normal";
  const b = ensureStunFields(who);
  return {
    stun: score,
    base: calcStun(who),
    tier: stunTier(score),
    skipLlm: shouldSkipLlm(score, who),
    shock: b?.shock || 0,
    mode,
    spasmUntil: b?.spasmUntil || 0,
    afterglowUntil: b?.afterglowUntil || 0,
    afterglowReplies: b?.afterglowReplies || 0,
    afterglowKind: b?.afterglowKind || "",
    moanVoice: ensureMoanVoice(who),
  };
}
