/* 接客偷看的「聲音」（2026-10-10 Al）：只有字幕、沒有音效。門開著時每 2～4 秒在門縫旁冒一句，客人／她輪流。
 * 客人（藍字）：粗話。她（她的顏色）：呻吟、求饒式的撒嬌（慢一點、會壞掉）——都是你情我願的激烈，不寫強迫。
 * 本地句庫，不叫模型。她的句子再過一層她的呻吟語氣（stun_speech 的五種 moanVoice）和個性家族。 */

export const CLIENT_LINES = {
  common: ["肏死你", "喔喔…這妹子好爽", "夾得好緊", "幹…裡面好熱", "叫大聲一點啊", "這錢花得值", "妳老公知道妳這麼騷嗎", "爽不爽？說啊",
    "再夾緊一點", "下次還點妳", "整個吸住了…", "水好多啊妳", "這身體太犯規了", "嘖…受不了"],
  missionary: ["腿再張開一點", "看著我", "頂到最裡面了吧", "胸晃成這樣…", "抱緊我的腰", "抬高一點", "每一下都頂到底", "叫我的名字"],
  cowgirl: ["自己動啊", "坐深一點", "屁股扭起來", "對…就這樣上下", "奶子在我眼前晃", "再快一點", "整根吞進去了", "腰好會動"],
  doggy: ["屁股翹高", "回頭看我", "這屁股真棒", "從後面最深了吧", "抓好了喔", "腰別塌下去", "撞得啪啪響", "跪好"],
  reverse: ["奶子好軟", "自己坐下去", "捏一下就夾緊了", "這手感…", "往後靠著我", "腰扭起來", "乳頭硬了喔", "看前面別回頭", "抓著才不會晃", "整個坐進來了"],
  kiss: ["親我", "舌頭伸出來", "抱緊一點", "腿勾著我", "嘴好甜", "貼這麼緊…", "慢慢來…喜歡嗎", "在我腿上扭啊"],
};

export const WIFE_LINES = {
  common: ["啊啊…不要這麼用力…", "會壞掉的…", "慢一點…", "嗯…好深…", "等、等一下…", "啊…那裡…", "太、太激烈了…", "嗯嗯…要去了…",
    "哈啊…好燙…", "不行…腿在抖…", "輕一點嘛…", "嗚…好滿…"],
  missionary: ["不要一直看我…", "腿、腿好酸…", "頂到了…頂到了…", "抱、抱我…", "啊…最裡面…", "壓得好深…", "嗯…看著我做…", "胸…別一直揉…"],
  cowgirl: ["我、我自己動…", "坐不下去了…太深了…", "腰…腰沒力了…", "嗯…一直往上頂…", "不要從下面頂…", "要掉下來了…", "這樣…舒服嗎…", "啊…進到最裡面…"],
  doggy: ["屁股…不要打…", "從後面…好深…", "膝蓋好痛…慢一點…", "撞、撞到了…", "頭…頭髮…", "不要看那裡…", "啊…整個人被撞前面了…", "嗚…抓好緊…"],
  reverse: ["胸…不要一直捏…", "嗯…手好燙…", "坐、坐太深了…", "不要捏那麼用力…", "背後…好熱…", "嗚…會被看到…", "腿沒力了…", "啊…一邊揉一邊…", "抓著…不要放…", "嗯…往後靠…"],
  kiss: ["嗯…親…", "嘴…嗯嗯…", "抱緊…", "嗯…好近…", "這樣…好害羞…", "舌頭…嗯…", "一邊親一邊…", "嗯…不要停…"],
};

/** 五種呻吟語氣（stun_speech VOICES）怎麼改一句。 */
const VOICE_WRAP = {
  scream: (t) => t.replace(/…$/, "") + "啊啊啊…！",
  refuse: (t) => `不、不要…${t}`,
  gasp: (t) => `哈…${t.split("…")[0]}…哈…`,
  beggy: (t) => `${t.replace(/…$/, "")}…求你…`,
  blankish: (t) => `嗯…${t.replace(/[，、]/g, "…").slice(0, 6)}…嗚…`,
};
/** 個性家族加的尾巴（只偶爾加）。 */
const FAMILY_TAIL = { 冷淡: ["…哼。", "…"], 溫柔: ["…", "…嗚。"], 熱絡: ["♡", "～"], 佔有: ["…你是我的…", "…"], 反差: ["…好舒服…", "♡"] };

export function poolFor(side, pose) {
  const src = side === "client" ? CLIENT_LINES : WIFE_LINES;
  return [...src.common, ...(src[pose] || [])];
}

/** 抽一句：side＝client／wife；voice＝moanVoice；family＝個性家族；recent＝最近說過的（不重複）。 */
export function peekLine(side, pose, { voice = "", family = "", recent = [], rnd = Math.random } = {}) {
  const pool = poolFor(side, pose).filter((t) => !recent.includes(t));
  const base = pool[Math.floor(rnd() * pool.length)] || poolFor(side, pose)[0];
  if (side === "client") return { key: base, text: base };
  let text = base;
  if (VOICE_WRAP[voice] && rnd() < 0.45) text = VOICE_WRAP[voice](text);
  const tails = FAMILY_TAIL[family];
  if (tails && rnd() < 0.3) text = text.replace(/[…！]*$/, "") + tails[Math.floor(rnd() * tails.length)];
  return { key: base, text };
}
/** 下一句隔多久：2～4 秒。 */
export function nextGapMs(rnd = Math.random) { return 2000 + Math.floor(rnd() * 2000); }
