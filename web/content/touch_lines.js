/* 摸她的回應（2026-11-20 使用者）：
   - 摸她一下就等模型生一句太慢 → 回應台詞跟著召喚流程一起先產好（每個關係帶 × 胸部／下體／腰臀各幾句），摸的時候直接拿。
   - 關係帶：陌生（陌生、認識）生氣；朋友（朋友、親密好友）生氣；女友（女友、熱戀、愛人）無奈、嫌煩；妻子（妻子以上）喜歡、調情。
   - 回應：摸胸部、下體先一聲嬌喘（依高潮程度，只有一聲）再接台詞；腰臀只在已經興奮時輕輕一聲（2026-11-21 使用者：只是一下而已，不會有一連串叫聲）。
   這個檔只放純函式（分帶、prompt、解析、內建保底台詞、嬌喘）；呼叫模型、存到她身上在 test_room_summon.js。 */
import { STAGE_IDX, stageIndexOf, familyStageLine, addressRule } from "./girl_voice.js?v=1";

export const TOUCH_TIERS = ["stranger", "friend", "girlfriend", "wife"];
export const TOUCH_TIER_ZH = { stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子" };
export const TOUCH_BANK_ZONES = ["breast", "groin", "waist"];
const ZONE_ZH = { breast: "胸部", groin: "下體（陰唇）", waist: "腰、屁股" };
const ZONE_TAG = { breast: "胸", groin: "下體", waist: "腰臀" };
/** 每個關係帶的代表階（拿口氣規則、稱呼規則用）。 */
const TIER_STAGE = { stranger: "stranger", friend: "friend", girlfriend: "girlfriend", wife: "wife" };
export const TOUCH_BANK_PER = 6;
export const TOUCH_BANK_REV = 1;

/** 11 階 → 關係帶。 */
export function touchTierOf(stageKey) {
  const i = stageIndexOf(stageKey || "stranger");
  if (i >= STAGE_IDX.wife) return "wife";
  if (i >= STAGE_IDX.girlfriend) return "girlfriend";
  if (i >= STAGE_IDX.friend) return "friend";
  return "stranger";
}

const TIER_FEEL = {
  stranger: "你們還不熟，他突然伸手摸你——你很生氣、嫌惡、覺得被冒犯，要他馬上住手（可以罵、可以兇、可以威脅）。",
  friend: "你們是朋友，他越界摸你——你生氣、責怪他、要他住手；比對陌生人收斂一點，但真的不高興。",
  girlfriend: "你是他女朋友，他又動手動腳——你覺得無奈、有點煩（「又來了」「現在不要啦」），嘴上嫌他，但不是真的翻臉。",
  wife: "你是他老婆，他摸你——你喜歡、會撒嬌、會調情，反過來挑逗他、勾他。",
};

/** 叫模型產一個關係帶的台詞（system＋user）。persona：{name, base, pet, playerName}。 */
export function touchBankMessages(tier, persona = {}) {
  const st = TIER_STAGE[tier] || "stranger";
  const name = persona.name || "她";
  const base = persona.base || "文靜溫柔";
  const sys = [
    `你是魅魔「${name}」，個性是${base}。用繁體中文、台灣口語。`,
    familyStageLine(base, st),
    addressRule(st, tier === "wife" || tier === "girlfriend" ? persona.pet || "" : "", persona.playerName || ""),
    `現在的關係：${TOUCH_TIER_ZH[tier]}。${TIER_FEEL[tier]}`,
  ].filter(Boolean).join("\n");
  const zones = TOUCH_BANK_ZONES.map((z) => `[${ZONE_TAG[z]}]（他摸你的${ZONE_ZH[z]}）`).join("、");
  const user = [
    `他會在不同時候摸你。照下面三個部位，各寫 ${TOUCH_BANK_PER} 句你被摸當下脫口而出的話：${zones}。`,
    "規則：每句 6～22 個字，只寫說出口的話（不要旁白、不要括號、不要動作描寫、不要引號）；每句口氣不同、不要重複；",
    "不要寫嗯、啊之類的呻吟（之後會另外加）。",
    "格式（一定照這個，不要別的字）：",
    "[胸]", "一句", "一句", "…", "[下體]", "一句", "…", "[腰臀]", "一句", "…",
  ].join("\n");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

/** 解析模型回的格式 → {breast:[], groin:[], waist:[]}；不夠就回 null。 */
export function parseTouchBank(text) {
  const out = { breast: [], groin: [], waist: [] };
  const byTag = Object.fromEntries(Object.entries(ZONE_TAG).map(([z, t]) => [t, z]));
  let zone = "";
  for (let raw of String(text || "").replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").split(/\r?\n/)) {
    raw = raw.trim();
    if (!raw) continue;
    const h = raw.match(/^[\[【［]\s*(胸|下體|腰臀)[^\]】］]*[\]】］]/);
    if (h) { zone = byTag[h[1]]; continue; }
    if (!zone) continue;
    const line = raw.replace(/^(\d+[.、)）]|[-*•・])\s*/, "").replace(/^["「『]+|["」』]+$/g, "").replace(/[（(][^）)]*[）)]/g, "").trim();
    if (line.length < 2 || line.length > 40 || /^[…\.。]+$/.test(line)) continue;
    if (!out[zone].includes(line)) out[zone].push(line);
  }
  return TOUCH_BANK_ZONES.every((z) => out[z].length >= 2) ? out : null;
}

/** 內建保底（還沒產好、模型失敗）：一樣分帶分部位。 */
export const TOUCH_FALLBACK = {
  stranger: {
    breast: ["你幹嘛！手拿開！", "誰准你碰我的？", "變態！不要摸！", "再碰一下試試看！", "你、你在摸哪裡啊！"],
    groin: ["你瘋了嗎！住手！", "不准碰那裡！", "滾開！噁心死了！", "你敢再摸一次看看！"],
    waist: ["別碰我！", "手放哪裡啊你！", "走開，不要靠過來！", "你很煩欸，放手！"],
  },
  friend: {
    breast: ["喂！我們只是朋友耶！", "你在幹嘛啦，手拿開！", "這樣很過分欸！", "不要鬧了，我會生氣喔！"],
    groin: ["你搞什麼！那裡不行！", "太超過了吧你！", "住手！我真的生氣了！", "你把我當什麼了啊！"],
    waist: ["幹嘛摟我啦，放開！", "別亂摸，很奇怪欸！", "喂，手很不安分喔！", "不要碰，我說真的！"],
  },
  girlfriend: {
    breast: ["又來了……你很煩欸。", "現在不要啦，好好講話。", "你腦袋只有這個嗎？", "唉……手很癢是不是？"],
    groin: ["不要啦……現在不是時候。", "你喔……真拿你沒辦法。", "手拿開啦，討厭。", "就知道你會這樣……"],
    waist: ["幹嘛啦，黏人精。", "又抱又摸的，煩不煩。", "好啦好啦……摸夠了沒？", "別鬧，我在跟你說話耶。"],
  },
  wife: {
    breast: ["喜歡嗎？再用力一點也可以喔。", "老公的手好熱……", "今天這麼想要？", "摸這裡……我會忍不住的。"],
    groin: ["那裡……老公好壞。", "想要了嗎？我也是……", "再往裡面一點嘛。", "你這樣摸，我會濕掉的。"],
    waist: ["抱緊一點嘛，老公。", "屁股好摸嗎？", "嘻……又想做壞事了？", "手不要停，我喜歡。"],
  },
};

/** 從台詞庫挑一句（最近用過的先不挑）。bank：{tiers:{tier:{zone:[]}}}；recent：最近用過的句子陣列（會被改）。 */
export function pickTouchLine(bank, tier, zone, recent = []) {
  const pool = (bank?.tiers?.[tier]?.[zone]?.length ? bank.tiers[tier][zone] : null) || TOUCH_FALLBACK[tier]?.[zone] || TOUCH_FALLBACK.stranger.breast;
  const fresh = pool.filter((l) => !recent.includes(l));
  const pick = (fresh.length ? fresh : pool)[Math.floor(Math.random() * (fresh.length ? fresh : pool).length)];
  recent.push(pick);
  while (recent.length > 8) recent.shift();
  return pick;
}

/** 高潮程度 0～4（性奮階段 none／slight／aroused／wantFill／climax；剛高潮、痙攣算 4）。 */
export function moanLevelOf(arousalStageKey, { climaxNow = false, spasm = false } = {}) {
  if (climaxNow || spasm) return 4;
  return { none: 0, slight: 1, aroused: 2, wantFill: 3, climax: 4 }[arousalStageKey] ?? 0;
}

const rnd = (n) => Math.floor(Math.random() * n);
/** 被摸那一下的嬌喘（2026-11-21 使用者：摸胸部、下體應該馬上一聲嬌喘就是回應；只是一下而已，不會有後面一連串叫聲）。
 *  只有一聲、很短；越接近高潮越嬌、越長一點。程度 0 是嚇一跳的短叫。 */
const GASP = [
  ["呀！", "啊！", "咿！", "嗯…！"],
  ["嗯…♡", "啊♡", "呀…♡", "嗯！♡"],
  ["嗯啊♡", "哈啊…♡", "啊嗯♡", "呀啊♡"],
  ["啊啊♡", "嗯啊啊…♡", "哈啊啊♡", "呀啊啊♡"],
  ["啊啊啊♡", "嗯啊啊啊…♡", "哈啊啊…♡", "咿啊啊♡"],
];
export function touchGasp(level) {
  const row = GASP[Math.max(0, Math.min(4, Number(level) || 0))];
  return row[rnd(row.length)];
}

/** 摸她的回應：胸部、下體＝先一聲嬌喘再接台詞；腰臀不是敏感帶，只有已經有點興奮（程度 ≥2）才輕輕一聲「嗯…」。 */
export function touchReply(line, zone, level) {
  const t = String(line || "").trim();
  if (zone === "breast" || zone === "groin") return touchGasp(level) + t;
  if (level >= 2) return (level >= 3 ? "嗯…♡" : "嗯…") + t;
  return t;
}
