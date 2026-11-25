/* 摸她的回應（2026-11-20 使用者）：
   - 摸她一下就等模型生一句太慢 → 回應台詞跟著召喚流程一起先產好，摸的時候直接拿。
   - 2026-11-25 使用者（調戲不帶感）：每個關係帶再分「態度」——拒絕／無奈拒絕／無奈順從／迎合（tease_attitude.js 算這一下是哪一種）；
     陌生＝拒絕～無奈拒絕、朋友＝拒絕～無奈順從、女友＝無奈拒絕～迎合、妻子＝無奈順從～迎合（關係帶 × 態度 × 部位，每格 5 句）。
     無奈的兩格要有幾句「嘴硬、身體誠實」（話說到一半卡住、聲音變軟、被戳破說才沒有）。
   - 回應：摸胸部、下體先一聲嬌喘（依高潮程度，只有一聲）再接台詞；腰臀只在已經興奮時輕輕一聲（2026-11-21 使用者：只是一下而已，不會有一連串叫聲）。
   這個檔只放純函式（分帶、prompt、解析、內建保底台詞、嬌喘）；呼叫模型、存到她身上在 test_room_summon.js。 */
import { STAGE_IDX, stageIndexOf, familyStageLine, addressRule } from "./girl_voice.js?v=1";
import { ATTITUDES, ATTITUDE_ZH, attitudeRange, nearestAttitude } from "./tease_attitude.js?v=1";

export const TOUCH_TIERS = ["stranger", "friend", "girlfriend", "wife"];
export const TOUCH_TIER_ZH = { stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子" };
export const TOUCH_BANK_ZONES = ["breast", "groin", "waist"];
const ZONE_ZH = { breast: "胸部", groin: "下體（陰唇）", waist: "腰、屁股" };
const ZONE_TAG = { breast: "胸", groin: "下體", waist: "腰臀" };
/** 每個關係帶的代表階（拿口氣規則、稱呼規則、會用到哪些態度）。 */
const TIER_STAGE = { stranger: "stranger", friend: "friend", girlfriend: "girlfriend", wife: "wife" };
export const TOUCH_BANK_PER = 5;
export const TOUCH_BANK_REV = 2;

/** 11 階 → 關係帶。 */
export function touchTierOf(stageKey) {
  const i = stageIndexOf(stageKey || "stranger");
  if (i >= STAGE_IDX.wife) return "wife";
  if (i >= STAGE_IDX.girlfriend) return "girlfriend";
  if (i >= STAGE_IDX.friend) return "friend";
  return "stranger";
}

/** 這個關係帶要產哪幾種態度。 */
export function tierAttitudes(tier) {
  return attitudeRange(TIER_STAGE[tier] || "stranger");
}

const TIER_CTX = {
  stranger: "你們還不熟，他突然伸手摸你。",
  friend: "你們是朋友，他越界摸你。",
  girlfriend: "你是他女朋友，他又動手動腳。",
  wife: "你是他老婆，他摸你。",
};
const ATT_FEEL = {
  refuse: "真的不要：很生氣、嫌惡或慌張，要他馬上住手（可以罵、可以兇、可以威脅）。",
  reluctant_refuse: "嘴上還在拒絕，但已經沒力氣真的推開：嘆氣、抱怨、碎念、討價還價（只能一下、不要在這裡）；其中兩句要露出「嘴硬、身體誠實」（話說到一半卡住、聲音變軟、被戳破就說才沒有）。",
  reluctant_yield: "放棄抵抗讓他碰，但嘴上裝作是被他逼的：害羞地碎念（就一下喔、真拿你沒辦法、要摸就快一點）；其中兩句不小心說出真心又馬上否認。不要再叫他住手。",
  welcome: "喜歡、接受，會撒嬌、主動要求（再一下、這邊也要），或反過來挑逗他、勾他。",
};

/** 叫模型產一個關係帶的台詞（system＋user）。persona：{name, base, pet, playerName}。 */
export function touchBankMessages(tier, persona = {}) {
  const st = TIER_STAGE[tier] || "stranger";
  const name = persona.name || "她";
  const base = persona.base || "文靜溫柔";
  const atts = tierAttitudes(tier);
  const sys = [
    `你是魅魔「${name}」，個性是${base}。用繁體中文、台灣口語。`,
    familyStageLine(base, st),
    addressRule(st, tier === "wife" || tier === "girlfriend" ? persona.pet || "" : "", persona.playerName || ""),
    `現在的關係：${TOUCH_TIER_ZH[tier]}。${TIER_CTX[tier]}`,
    "他摸你的時候，你的態度會隨著被撩的程度改變。每一種態度的意思：",
    ...atts.map((a) => `・${ATTITUDE_ZH[a]}：${ATT_FEEL[a]}`),
    "同一種態度也要照你的個性說（嘴硬的嘴硬、害羞的小聲、從容的調侃）。",
  ].filter(Boolean).join("\n");
  const heads = [];
  for (const a of atts) for (const z of TOUCH_BANK_ZONES) heads.push(`[${ATTITUDE_ZH[a]}・${ZONE_TAG[z]}]`);
  const user = [
    `照下面每一格（態度 × 他摸你的部位：${TOUCH_BANK_ZONES.map((z) => `${ZONE_TAG[z]}＝${ZONE_ZH[z]}`).join("、")}），各寫 ${TOUCH_BANK_PER} 句你被摸當下脫口而出的話。`,
    "規則：每句 6～22 個字，只寫說出口的話（不要旁白、不要括號、不要動作描寫、不要引號）；每句口氣不同、不要重複；",
    "要對那個部位有反應；不要寫嗯、啊之類的呻吟（之後會另外加）。",
    "格式（一定照這個，標題一字不改，不要別的字）：",
    ...heads.flatMap((h) => [h, "一句", "…"]),
  ].join("\n");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

const HEAD_RE = /^[\[【［]\s*(無奈拒絕|無奈順從|拒絕|迎合)?\s*[・·\-\/、×x ]*\s*(胸|下體|腰臀)[^\]】］]*[\]】］]/;

/** 解析模型回的格式 → {態度: {breast:[], groin:[], waist:[]}}；atts（要的態度）每格至少 2 句才算，不夠回 null。
 *  沒給 atts：舊格式（只有部位標題）→ 回 {breast, groin, waist}。 */
export function parseTouchBank(text, atts = null) {
  const byTag = Object.fromEntries(Object.entries(ZONE_TAG).map(([z, t]) => [t, z]));
  const byZh = Object.fromEntries(ATTITUDES.map((a) => [ATTITUDE_ZH[a], a]));
  const want = Array.isArray(atts) && atts.length ? atts : null;
  const out = {};
  const cell = (a, z) => { const k = a || "_"; out[k] = out[k] || { breast: [], groin: [], waist: [] }; return out[k][z]; };
  let att = "", zone = "";
  for (let raw of String(text || "").replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").split(/\r?\n/)) {
    raw = raw.trim();
    if (!raw) continue;
    const h = raw.match(HEAD_RE);
    if (h) { att = h[1] ? byZh[h[1]] : (want ? att : ""); zone = byTag[h[2]]; continue; }
    if (!zone) continue;
    const line = raw.replace(/^(\d+[.、)）]|[-*•・])\s*/, "").replace(/^["「『]+|["」』]+$/g, "").replace(/[（(][^）)]*[）)]/g, "").trim();
    if (line.length < 2 || line.length > 40 || /^[…\.。]+$/.test(line)) continue;
    const c = cell(want ? att : "", zone);
    if (!c.includes(line)) c.push(line);
  }
  if (!want) {
    const o = out._;
    return o && TOUCH_BANK_ZONES.every((z) => o[z].length >= 2) ? o : null;
  }
  const got = {};
  for (const a of want) {
    const o = out[a];
    if (!o || !TOUCH_BANK_ZONES.every((z) => o[z].length >= 2)) return null;
    got[a] = o;
  }
  return got;
}

/** 內建保底（還沒產好、模型失敗）：一樣分帶、分態度、分部位。 */
export const TOUCH_FALLBACK = {
  stranger: {
    refuse: {
      breast: ["你幹嘛！手拿開！", "誰准你碰我的？", "變態！不要摸！", "再碰一下試試看！", "你、你在摸哪裡啊！"],
      groin: ["你瘋了嗎！住手！", "不准碰那裡！", "滾開！噁心死了！", "你敢再摸一次看看！"],
      waist: ["別碰我！", "手放哪裡啊你！", "走開，不要靠過來！", "你很煩欸，放手！"],
    },
    reluctant_refuse: {
      breast: ["你……手、手拿開啦……", "不要再摸了……我說真的……", "誰准你……放開啦……", "別、別一直摸那裡……"],
      groin: ["那裡不行……真的不行……", "你、你給我住……住手……", "不要碰那裡啦……拜託……", "才、才沒有感覺……放開……"],
      waist: ["放手啦……你很煩欸……", "不要黏過來……", "手……拿開一點啦……", "我們又不熟……別這樣……"],
    },
  },
  friend: {
    refuse: {
      breast: ["喂！我們只是朋友耶！", "你在幹嘛啦，手拿開！", "這樣很過分欸！", "不要鬧了，我會生氣喔！"],
      groin: ["你搞什麼！那裡不行！", "太超過了吧你！", "住手！我真的生氣了！", "你把我當什麼了啊！"],
      waist: ["幹嘛摟我啦，放開！", "別亂摸，很奇怪欸！", "喂，手很不安分喔！", "不要碰，我說真的！"],
    },
    reluctant_refuse: {
      breast: ["喂……不是說了不要嗎……", "只、只能一下……不對，不行啦……", "你真的很煩欸……手拿開……", "別揉了……會被你弄得很奇怪……"],
      groin: ["那裡……那裡真的不行啦……", "不要在這裡啦……笨蛋……", "我們是朋友耶……你這樣……", "才、才沒有濕……別亂說……"],
      waist: ["又摟……你很黏欸……", "放開啦……被看到怎麼辦……", "唉……你到底想怎樣……", "不要一直摸屁股啦……"],
    },
    reluctant_yield: {
      breast: ["……就一下喔，真的就一下。", "真拿你沒辦法……輕一點。", "不准跟別人說喔……", "要摸就快一點啦……"],
      groin: ["……只准碰外面喔。", "我、我才不是想要……", "你喔……真的很壞……再一下就好……", "不要看我的臉啦……"],
      waist: ["……抱就抱啦，不准亂動。", "好啦好啦，讓你摟一下。", "就今天喔……", "手不准往下……算了。"],
    },
  },
  girlfriend: {
    reluctant_refuse: {
      breast: ["又來了……你很煩欸。", "現在不要啦，好好講話。", "你腦袋只有這個嗎？", "唉……手很癢是不是？"],
      groin: ["不要啦……現在不是時候。", "你喔……真拿你沒辦法。", "手拿開啦，討厭。", "就知道你會這樣……"],
      waist: ["幹嘛啦，黏人精。", "又抱又摸的，煩不煩。", "好啦好啦……摸夠了沒？", "別鬧，我在跟你說話耶。"],
    },
    reluctant_yield: {
      breast: ["真是的……要摸就摸吧。", "……輕一點啦，笨蛋。", "你喔，每次都這樣……", "好啦……讓你摸一下下。"],
      groin: ["……那裡要溫柔一點喔。", "討厭……又被你弄濕了……", "才、才沒有很舒服……再一下。", "不要笑啦……我也沒辦法……"],
      waist: ["抱緊一點也可以啦……", "黏人精……好啦。", "……就這樣待著也不錯。", "手很熱欸……沒說不行。"],
    },
    welcome: {
      breast: ["……再用力一點也可以喔。", "你的手……好舒服。", "喜歡嗎？那、那多摸一下……", "這邊也要……"],
      groin: ["不要停……拜託……", "那裡……再一下下……", "都是你害的……要負責喔。", "……想要你再碰裡面一點。"],
      waist: ["抱我嘛……再緊一點。", "嘿嘿……被你抓到了。", "屁股……你很喜歡吼？", "不要放開喔。"],
    },
  },
  wife: {
    reluctant_yield: {
      breast: ["老公……現在？好啦……", "真是的，就知道你會來摸。", "輕一點啦，老公。", "等等還要煮飯耶……算了，給你摸。"],
      groin: ["又來……好啦，只准一下。", "老公好壞……我不管了。", "現在不要啦……好吧。", "你喔……摸完要負責。"],
      waist: ["好啦好啦，讓你抱。", "又黏過來了……拿你沒辦法。", "老公手很不安分欸。", "抱一下就要放開喔……騙你的。"],
    },
    welcome: {
      breast: ["喜歡嗎？再用力一點也可以喔。", "老公的手好熱……", "今天這麼想要？", "摸這裡……我會忍不住的。"],
      groin: ["那裡……老公好壞。", "想要了嗎？我也是……", "再往裡面一點嘛。", "你這樣摸，我會濕掉的。"],
      waist: ["抱緊一點嘛，老公。", "屁股好摸嗎？", "嘻……又想做壞事了？", "手不要停，我喜歡。"],
    },
  },
};

/** 這個帶、這個態度的句子（台詞庫優先；舊格式或沒有那一格＝內建）。att 沒給＝這個帶的起點態度。 */
function poolOf(bank, tier, zone, att) {
  const t = TOUCH_TIERS.includes(tier) ? tier : "stranger";
  const own = bank?.tiers?.[t];
  const ownAtts = own && !Array.isArray(own.breast) ? Object.keys(own).filter((k) => ATTITUDES.includes(k)) : [];
  const fb = TOUCH_FALLBACK[t];
  const want = att && ATTITUDES.includes(att) ? att : tierAttitudes(t)[0];
  if (ownAtts.length) {
    const a = nearestAttitude(want, ownAtts);
    if (own[a]?.[zone]?.length) return own[a][zone];
  }
  const a = nearestAttitude(want, Object.keys(fb));
  return fb[a]?.[zone] || TOUCH_FALLBACK.stranger.refuse.breast;
}

/** 從台詞庫挑一句（最近用過的先不挑）。bank：{tiers:{tier:{態度:{zone:[]}}}}；recent：最近用過的句子陣列（會被改）；att：這一下的態度。 */
export function pickTouchLine(bank, tier, zone, recent = [], att = "") {
  const pool = poolOf(bank, tier, zone, att);
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
