/** 房間聊天：程式化「失神」亂語（非只靠 prompt）。 */

import { ensureBody, talkActById } from "./body_state.js?v=8";
import { insertUnlocked } from "./tease.js?v=4";

const SHOCK_MAX = 45;

/** 痙攣持續 10 分鐘。 */
export const SPASM_MS = 10 * 60 * 1000;
export const SPASM_ENTER_STUN = 70;

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
  if (b.shockRepliesLeft > 0) {
    b.shockRepliesLeft -= 1;
    b.shock = clamp((b.shock || 0) - 16, 0, SHOCK_MAX);
  } else {
    b.shock = clamp((b.shock || 0) - 10, 0, SHOCK_MAX);
  }
  b.shockAt = Date.now();
}

/**
 * 失神分數 0–100。
 * arousal→最多約40；libido 加成／倍率；器官濕腫塞；shock 暫衝。
 * 軟頂改依開放度（取代 teaseStage）。
 */
export function calcStun(who) {
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
  return Math.max(calcStun(who), stunFloorForAct(actId, who));
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
  return clamp(stun, 0, 100) >= 75;
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
export function scrambleReply(text, stun, actId = "", who = null) {
  if (who && inSpasm(who)) {
    return spasmTemplate(who, actId);
  }
  const style = voicePools(who);
  const s = clamp(stun, 0, 100);
  const tier = stunTier(s);
  const raw = String(text || "").trim();
  if (tier === "calm") {
    if (raw.length > 80) return raw.slice(0, 72) + "…";
    return raw || "……";
  }
  if (tier === "stun" || !raw) return stunTemplate(s, actId, who);
  if (tier === "blank") {
    // LLM 回覆壓成空白碎片，或整段換成空白模板
    if (Math.random() < 0.6) return blankTemplate(actId, who);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 2);
    if (!scraps.length) return blankTemplate(actId, who);
    return (scraps.join("") + (Math.random() < 0.5 ? "……" : "")).slice(0, 18);
  }
  if (tier === "beg") {
    // 求饒模板為主，偶留一點原文碎片
    if (Math.random() < 0.7 || !raw) return begTemplate(actId, who);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 1);
    const beg = pick(style.begBits);
    return (beg + (scraps[0] || pick(style.blankBits))).replace(/(…)+/g, "…").slice(0, 24);
  }
  if (tier === "interfere") {
    let out = insertBreaths(raw, who);
    if (out.length > 56) out = out.slice(0, 52) + "…";
    return out || pick(style.moans);
  }
  return scrambleBroken(raw, actId, who);
}

/** 給 UI／除錯：當前分數與階。 */
export function stunSnapshot(who, actId = "") {
  const score = effectiveStun(who, actId);
  const mode = inOverstim(who) ? "pain" : inSpasm(who) ? "spasm" : "normal";
  return {
    stun: score,
    base: calcStun(who),
    tier: stunTier(score),
    skipLlm: shouldSkipLlm(score, who),
    shock: ensureStunFields(who)?.shock || 0,
    mode,
    spasmUntil: ensureStunFields(who)?.spasmUntil || 0,
    moanVoice: ensureMoanVoice(who),
  };
}
