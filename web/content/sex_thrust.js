/**
 * 肏（抽插）互動的數值與排程（2026-10-04，test_room 閘門 data-sex-poses；純邏輯，房間 UI 在 test_room_summon.js）。
 *
 * 每按一下「肏」＝一次抽插：
 *   - 激情度（她）+1～2：拿到 2 的機率看性奮（arousal 0–100）與關係階；激情 >20 → 她高潮（④ 高潮圖；潮吹旗 SQUIRT_IN_FLOW 預設關），
 *     感情 +10，激情只降一點（−3），之後更容易連續高潮。高潮判定在她那句話打完之後（不擋按鈕）。
 *   - 玩家興奮 +5～8：到 20 → 射精（⑥ 內射圖，預設 creampie），興奮歸零。
 *     這一射讓精液變負（射完 <0）→ 血精（⑦ 血精圖，沒產就用內射圖；旁白／她的反應跟著變）。
 *   - 精液＝玩家真正剩下的精液（player.semenCc，同一個值；2026-10-04 使用者決定，不再每場 18cc）：每射一次 −6cc（可到負）；
 *     <6 或下一次射完就 <1 → 危險提示；射完 <1 → 這一輪結束。進來時已經 <1：照樣可以進、量條紅字，射一次就結束。
 *   - 每下感情 +1。
 *   - 換圖（flow2）：第一下立刻換抽插圖；之後每下 1/3 機率在抽插圖（多組／多變體）之間換；加入圖不進池。
 *     射精 → 立刻換內射圖；她高潮 → 換高潮圖、藏「肏」到她那句打完＋停滿 EVENT_HOLD_MS；下一下回抽插圖。
 *   - 開場：① 開場圖出來後她先說一句（openingDirective：關係階態度＋個性口吻＋體位），打完才出「掏出陰莖」→ ② 加入 →「肏」。
 *   - 局部動畫（舊做愛系統的四幀）：第一下播 1-2-3-4，之後每下播 2-3-4，播放中藏「肏」。
 * 她的台詞：每下都要一句，但跟動畫／數值脫鉤（ThrustReplyPump）：
 *   - 正在等 AI 時先顯示本地喘息（啊…嗯…）；AI 回來後逐字貼上（呻吟字 ~0.08s、一般字 ~0.12s）。
 *   - 只留最新一下的請求（舊的丟掉）；一句打完時，0.8 秒內有按過「肏」就立刻開下一句。
 */

import { expansionLevel } from "./player_state.js";

export const THRUST = {
  /** 只在呼叫端沒給玩家精液時用（舊呼叫的退路）；正常一律用 player.semenCc。 */
  SEMEN_FALLBACK_CC: 18,
  SEMEN_PER_EJAC_CC: 6,
  SEMEN_WARN_BELOW: 6,
  SEMEN_END_BELOW: 1,
  EXCITE_MIN: 5,
  EXCITE_MAX: 8,
  /** 玩家興奮到這裡就射（2026-10-04 使用者：20，原本 100）；射完歸零重累積。每下 +5～8 → 3～4 下射一次。 */
  EXCITE_CUM_AT: 20,
  PASSION_ORGASM_ABOVE: 20,
  PASSION_ORGASM_DROP: 3,
  AFF_PER_THRUST: 1,
  AFF_PER_ORGASM: 10,
  SWITCH_CHANCE: 1 / 3,
  /** 舊做愛系統：首輪慢快快慢 1–4；連按只播 2–4。 */
  FIRST_HOLDS: [300, 180, 180, 300],
  CONTINUE_HOLDS: [180, 180, 300],
  /** 第 4 幀一出現就算播完，只留 0.4 秒就收（2026-10-04 使用者；取代 holds 最後一格的 300ms）；這段時間內再按「肏」就直接接下一輪 2-3-4。 */
  ANIM_LINGER_MS: 400,
  /** 幀圖預載最多等這麼久；每幀也最多等這麼久才換下一幀（停留從真的顯示才算）。 */
  ANIM_PRELOAD_MAX_MS: 1500,
  TYPE_MOAN_MS: 80,
  TYPE_WORD_MS: 120,
  CHAIN_WINDOW_MS: 800,
  /** 她那句一直沒回來：最多等這麼久就先把換圖／高潮判定做掉（不讓 AI 卡住畫面）。 */
  DEFER_MAX_MS: 8000,
  /** 高潮圖至少停留（她那句也要打完，「肏」才回來）。 */
  EVENT_HOLD_MS: 2400,
  /** 高潮那句一直沒打完的保險：最多藏「肏」這麼久。 */
  ORGASM_LOCK_MAX_MS: 25000,
  /** 潮吹圖不進自動流程（2026-10-04 flow2；圖組／編輯器分頁保留）。改 true 就恢復「高潮 → 潮吹」。 */
  SQUIRT_IN_FLOW: false,
  /** AI 台詞最多等這麼久，逾時用本地台詞。 */
  REPLY_TIMEOUT_MS: 15000,
  /** 開場那句最多等這麼久。 */
  OPENING_TIMEOUT_MS: 15000,
};

/** 她高潮時自動流程要顯示的圖（預設只有 ④ 高潮；潮吹旗開才接 ⑤ 潮吹）。 */
export function orgasmEventSteps(squirt = THRUST.SQUIRT_IN_FLOW) {
  return squirt ? ["orgasm", "squirt"] : ["orgasm"];
}

/** 進「肏」流程背景預產的步驟（加入之後）。 */
export function flowPregenSteps(squirt = THRUST.SQUIRT_IN_FLOW) {
  return ["thrust", "orgasm", ...(squirt ? ["squirt"] : []), "cum"];
}

/* ───────── 開場那句（她先開口；按「做愛」出 ① 開場圖後） ───────── */

/** 關係階 → 開場態度：陌生／認識＝拒絕卻屈服；朋友／好友＝我們不是這種關係；女友／熱戀＝害羞；愛人＝有點想要；妻子以上＝求他。 */
export function openingBand(stageKey) {
  const k = String(stageKey || "stranger");
  if (k === "stranger" || k === "acquaintance") return "resist";
  if (k === "friend" || k === "close_friend") return "notthis";
  if (k === "girlfriend" || k === "passionate") return "shy";
  if (k === "lover") return "eager";
  if (THRUST_STAGE_ORDER.indexOf(k) >= THRUST_STAGE_ORDER.indexOf("wife")) return "beg";
  return "resist";
}

export const OPENING_BAND_ZH = { resist: "拒絕卻屈服", notthis: "我們不是這種關係", shy: "害羞", eager: "有點想要", beg: "求他" };

const OPENING_BAND_RULE = {
  resist: "你們還不熟，你嘴上拒絕、說不要、想推開他，可是身體已經軟了、只能乖乖照做（拒絕卻屈服）。",
  notthis: "你們只是朋友，你害羞又慌亂，嘴上說「我們不是這種關係…」，卻沒有真的逃開。",
  shy: "你是他的女朋友，很害羞、聲音很小、不敢看他，但願意給他。",
  eager: "你是他的愛人，已經有點等不及了，帶著害羞主動催他、說想要。",
  beg: "你是他的妻子，主動求他、撒嬌討要，直接說想要他進來。",
};

const OPENING_POSE_RULE = {
  missionary: "你躺在床上，自己把腿張開、用手把自己掰開給他看。",
  doggy: "你趴在床上、屁股翹高對著他。",
};

/** 個性 → 開場口吻（傲嬌／清純／高冷／病嬌／活潑／御姊／天然呆／文靜）。 */
export const OPENING_STYLE = {
  "傲嬌": "傲嬌：嘴硬、結巴帶兇（「才、才不是想要」「笨蛋、變態」），口是心非。",
  "清純反差": "清純反差：外表清純、聲音很小很羞恥，說出口的話卻意外淫蕩。",
  "高冷": "高冷：話很短、語氣冷淡克制，但聲音發抖、藏不住。",
  "病嬌": "病嬌：黏膩、佔有慾，要他只看著你、只能肏你一個（「你是我的」）。",
  "活潑開朗": "活潑開朗：直率、有精神，害羞也會笑著說出來。",
  "御姊": "御姊：成熟從容、帶點挑逗和引導，像姊姊在教他。",
  "天然呆": "天然呆：懵懵的、搞不太清楚狀況，說話迷糊又直白。",
  "文靜溫柔": "文靜溫柔：輕聲細語、溫柔體貼，害羞地接納他。",
};

export function openingStyleFor(personality) {
  const k = String(personality || "");
  if (OPENING_STYLE[k]) return OPENING_STYLE[k];
  const hit = k ? Object.keys(OPENING_STYLE).find((n) => k.includes(n) || n.includes(k)) : "";
  return hit ? OPENING_STYLE[hit] : OPENING_STYLE["文靜溫柔"];
}

/** 開場那句的要求（接在一般對話 system prompt 之後；那邊已有個性家族／關係階／稱呼規則）。 */
export function openingDirective({ stage = "stranger", pose = "missionary", personality = "", dazed = "" } = {}) {
  const band = openingBand(stage);
  const wife = band === "beg";
  return [
    `（旁白：你已經全裸，你們要做愛了。${OPENING_POSE_RULE[pose] || OPENING_POSE_RULE.missionary}他還沒插進來。`,
    `態度：${OPENING_BAND_RULE[band]}`,
    `口吻：${openingStyleFor(personality)}`,
    dazed ? dazedSpeechRule(dazed) : "",
    dazed ? "你主動先開口，說一句很色、很羞恥的話，十五字以內；" : "你主動先開口，說一句很色、很羞恥的話（可以提到自己的姿勢、身體，夾一點喘息），二十五字以內；",
    wife ? "可以叫他老公。" : "不要叫他老公（還沒結婚）。",
    "只寫你說出口的那句話；不要旁白、不要描述動作、不要引號。）",
  ].filter(Boolean).join("");
}

const OPENING_FALLBACK = {
  resist: {
    missionary: ["不、不要看…腿、腿合不起來了…", "住手…為什麼我自己張開了…不要…", "不可以…可是…身體不聽話…"],
    doggy: ["不要…這個姿勢好丟臉…屁股別、別看…", "放開…嗚…為什麼要翹起來…", "不行…不要從後面…可是動不了…"],
  },
  notthis: {
    missionary: ["我、我們不是這種關係吧…可是腿…", "等一下…我們只是朋友啊…不要一直看那裡…", "這樣張開…好奇怪…我們不是這種關係…"],
    doggy: ["我們不是這種關係…屁股翹這麼高好丟臉…", "朋友不會這樣的吧…你、你別看後面…", "嗚…我們不是這種關係…可是…"],
  },
  shy: {
    missionary: ["那、那個…我張開了…你輕一點…", "好害羞…不要一直盯著看啦…", "給你看…只給你看喔…"],
    doggy: ["這樣…翹起來好害羞…你輕一點…", "不要一直看屁股啦…好丟臉…", "從後面…我、我準備好了…"],
  },
  eager: {
    missionary: ["快點嘛…我已經張開等你了…", "都濕成這樣了…你還不進來嗎…", "看…這裡在等你…快一點…"],
    doggy: ["屁股都翹好了…快點進來嘛…", "不要只看…我等不及了…", "從後面…快、快點給我…"],
  },
  beg: {
    missionary: ["老公…我張開了…快插進來…", "老公～求你了…裡面好空…快給我…", "老公，我想要…用力肏我…"],
    doggy: ["老公…屁股翹好了…快從後面插進來…", "求你了老公…快點給我…", "老公～人家等好久了…快肏我…"],
  },
};

/** AI 失敗時的開場本地台詞（看關係階＋體位；老公只有妻子以上）。 */
export function openingFallback(stage = "stranger", pose = "missionary", rng = Math.random) {
  const band = openingBand(stage);
  const pool = (OPENING_FALLBACK[band] || OPENING_FALLBACK.resist)[pose === "doggy" ? "doggy" : "missionary"];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/* ───────── 失神／痙攣中的開場那句（2026-10-04 使用者） ─────────
 * 失神／痙攣時開場那句要像其他失神台詞一樣「大部分聽不懂」（字拆開黏進呻吟＝weaveStunReply），
 * 但留一小段聽得懂的話（stunMixLine）。AI 那邊先告訴它她失神，只寫心裡想說的那一句、不要自己加呻吟。 */

/** 給 AI 的失神規則（dazed："stun" 失神／"spasm" 痙攣／true）。 */
export function dazedSpeechRule(dazed) {
  const what = dazed === "spasm" ? "你還在高潮後的痙攣裡，身體一抽一抽的" : "你還在失神裡，意識模糊、腦袋一片空白";
  return `${what}，幾乎說不出完整的話；心裡仍有一句想對他說的話——只寫那一句、要短，不要自己寫呻吟（呻吟之後另外加）。`;
}

const CJK = /[\u3400-\u9fff]/u;

/**
 * 從她想說的那句挑出「聽得懂的一小段」與「要拆碎的其餘」：
 * clear＝最後一個 2～5 字的片語（都太長就取最後一段的最後 4 字）；garble＝其他字（照原順序、最多 10 字，給 weaveStunReply 拆）。
 */
export function stunOpeningParts(text) {
  const t = String(text || "").trim();
  const clauses = t.split(/[，,、…．。！？!?~～\s「」『』"（）()]+/u).map((c) => Array.from(c).filter((ch) => CJK.test(ch)).join("")).filter(Boolean);
  if (!clauses.length) return { garble: "", clear: "" };
  let k = -1;
  for (let n = clauses.length - 1; n >= 0; n--) {
    const len = Array.from(clauses[n]).length;
    if (len >= 2 && len <= 5) { k = n; break; }
  }
  if (k < 0) k = clauses.length - 1;
  const ck = Array.from(clauses[k]);
  // 太長：聽得懂的取最後 4 字，前面併進要拆碎的
  const clear = ck.length > 5 ? ck.slice(-4).join("") : clauses[k];
  const head = ck.length > 5 ? ck.slice(0, -4).join("") : "";
  const rest = [...clauses.slice(0, k), head, ...clauses.slice(k + 1)].join("");
  const garble = Array.from(rest || clauses[k]).slice(0, 10).join("");
  return { garble, clear };
}

/**
 * 失神開場那句：大部分是拆碎的呻吟（weave＝test_room 的 weaveStunReply），最後留一小段聽得懂的（「…不要看…」）。
 * weave(words) → 多行字串。
 */
export function stunMixLine(text, weave, rng = Math.random) {
  const { garble, clear } = stunOpeningParts(text);
  const broken = String(weave(garble || "嗯") || "").trim();
  if (!clear) return broken;
  const lead = ["哈…", "嗯…", "啊…", "…"][Math.min(3, Math.floor(rng() * 4))];
  return `${broken}\n${lead}${clear}…`;
}

/** 妻子以下的台詞不能叫老公（AI 偶爾會叫）：換成「你」。 */
export function scrubHusband(text, stage = "stranger") {
  const t = String(text || "");
  if (openingBand(stage) === "beg") return t;
  return t.replace(/老公/g, "你");
}

/** 給 promise 一個期限：逾時回 fallback（不丟錯）。 */
export function withTimeout(promise, ms, fallback = "") {
  let timer = 0;
  return Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((resolve) => { timer = setTimeout(() => resolve(fallback), ms); }),
  ]).finally(() => clearTimeout(timer));
}

/** 關係階 → 0..1（與 test_room_summon STAGE_LADDER 對齊）。 */
export const THRUST_STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];

export function stageFactor(stageKey) {
  const i = THRUST_STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i / (THRUST_STAGE_ORDER.length - 1);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

export function newThrustSession(opts = {}) {
  return {
    thrusts: 0,
    passion: 0,
    excite: 0,
    semen: Number.isFinite(Number(opts.semenCc)) && opts.semenCc !== null && opts.semenCc !== undefined ? Number(opts.semenCc) : THRUST.SEMEN_FALLBACK_CC,
    orgasms: 0,
    ejacs: 0,
    ended: false,
    startedAt: Number(opts.now) || Date.now(),
  };
}

/** 激情一下拿到 2 的機率：性奮與關係越高越容易（0.15～0.9）。 */
export function passionTwoChance(arousal = 0, stageKey = "stranger") {
  return clamp(0.15 + (clamp(arousal, 0, 100) / 100) * 0.45 + stageFactor(stageKey) * 0.3, 0.1, 0.9);
}

export function passionGain(arousal, stageKey, rng = Math.random) {
  return rng() < passionTwoChance(arousal, stageKey) ? 2 : 1;
}

/** 肏的時候玩家興奮到這裡就射。基礎 20，加上「興奮上限」擴充。 */
export function exciteCumAt() {
  return THRUST.EXCITE_CUM_AT + expansionLevel("excite");
}

export function exciteGain(rng = Math.random) {
  const span = THRUST.EXCITE_MAX - THRUST.EXCITE_MIN + 1;
  return THRUST.EXCITE_MIN + Math.min(span - 1, Math.floor(rng() * span));
}

/** 下一次射完會不會見底（或已經 <6）→ 危險提示。 */
export function semenDanger(s) {
  if (!s) return false;
  return s.semen < THRUST.SEMEN_WARN_BELOW || s.semen - THRUST.SEMEN_PER_EJAC_CC < THRUST.SEMEN_END_BELOW;
}

/** 同步玩家真正的精液（每下之前；精液回復／恢復精液按鈕都算進來）。 */
export function syncSemen(s, semenCc) {
  if (!s || !Number.isFinite(Number(semenCc))) return s;
  s.semen = Number(semenCc);
  return s;
}

/**
 * 一下抽插：激情／興奮／感情立刻算；射精也在這一下判（玩家自己的身體，不等她說話）。
 * 高潮不在這裡判（等她那句打完：checkOrgasm）。
 * @returns {{ passionAdd, exciteAdd, affection, ejac, semenBefore, semenAfter, ended, danger, switchRoll }}
 */
export function applyThrust(s, { arousal = 0, stage = "stranger", rng = Math.random } = {}) {
  if (!s || s.ended) return null;
  const passionAdd = passionGain(arousal, stage, rng);
  const exciteAdd = exciteGain(rng);
  s.thrusts += 1;
  s.passion += passionAdd;
  const cumAt = exciteCumAt();
  s.excite = Math.min(cumAt, s.excite + exciteAdd);
  const switchRoll = rng() < THRUST.SWITCH_CHANCE;
  const semenBefore = s.semen;
  let ejac = false;
  if (s.excite >= cumAt) {
    ejac = true;
    s.excite = 0;
    s.ejacs += 1;
    s.semen -= THRUST.SEMEN_PER_EJAC_CC;
    if (s.semen < THRUST.SEMEN_END_BELOW) s.ended = true;
  }
  const blood = ejac && isBloodShot(semenBefore);
  return {
    passionAdd,
    exciteAdd,
    affection: THRUST.AFF_PER_THRUST,
    ejac,
    blood,
    semenBefore,
    semenAfter: s.semen,
    ended: s.ended,
    danger: semenDanger(s),
    switchRoll,
  };
}

/**
 * 血精（2026-10-04 使用者）：這一射會讓精液變負（射前 < 6cc，射完 < 0）就射出混血的精液。
 * 選這個（而不是「射前已經 ≤0」）：精液不夠一射就是在透支，正常一場的最後一射也看得到。
 */
export function isBloodShot(semenBefore) {
  return Number(semenBefore) - THRUST.SEMEN_PER_EJAC_CC < 0;
}

/** 她那句打完時判：激情 >20 → 高潮（激情 −3，感情 +10）。 */
export function checkOrgasm(s) {
  if (!s || s.passion <= THRUST.PASSION_ORGASM_ABOVE) return null;
  const before = s.passion;
  s.passion = Math.max(0, s.passion - THRUST.PASSION_ORGASM_DROP);
  s.orgasms += 1;
  return { before, after: s.passion, affection: THRUST.AFF_PER_ORGASM, count: s.orgasms };
}

/** 抽插期換圖：從池子挑一張跟現在不一樣的（池子只有一張就不換）。 */
export function pickOtherImage(pool, current, rng = Math.random) {
  const list = [...new Set((pool || []).map((u) => String(u || "")).filter(Boolean))];
  const others = list.filter((u) => u !== current);
  if (!others.length) return current || list[0] || "";
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
}

/** 動畫幀：第一下 1-2-3-4，之後 2-3-4。 */
export function animFramesFor(urls, firstRoundDone) {
  const list = (urls || []).map((u) => String(u || "")).filter(Boolean).slice(0, 4);
  if (!list.length) return { frames: [], holds: [] };
  if (firstRoundDone && list.length > 1) return { frames: list.slice(1), holds: THRUST.CONTINUE_HOLDS.slice(0, list.length - 1) };
  return { frames: list, holds: THRUST.FIRST_HOLDS.slice(0, list.length) };
}

const MOAN_CH = /[啊嗯哈唔喔呃哼噢嗚呀咿啦~～♡❤…\.．・、，,！!？?\s—]/;
/** 逐字打字的每字停頓：呻吟／標點快（~0.08s），一般字 ~0.12s。 */
export function typeDelayFor(ch) {
  return MOAN_CH.test(String(ch || "")) ? THRUST.TYPE_MOAN_MS : THRUST.TYPE_WORD_MS;
}

const PANTS = ["啊…嗯…", "嗯…哈啊…", "啊、啊…", "哈…嗯啊…", "唔…嗯…"];
/** 等 AI 時的本地喘息。 */
export function pantPlaceholder(rng = Math.random) {
  return PANTS[Math.min(PANTS.length - 1, Math.floor(rng() * PANTS.length))];
}

/** AI 失敗時的本地台詞。 */
export function fallbackMoan(event = "", rng = Math.random) {
  const pool = event === "orgasm"
    ? ["啊啊…要、要去了…！", "不行…要去了…啊啊…！"]
    : event === "bloodcum"
      ? ["欸…這、這是血嗎…你、你沒事吧…", "粉、粉紅色的…你射出血了…不要緊嗎…"]
      : event === "cum"
      ? ["好燙…裡面…都是…", "啊…射、射進來了…"]
      : ["啊…嗯…好深…", "嗯啊…慢、慢一點…", "哈啊…啊…", "啊…那裡…嗯…"];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * 台詞幫浦：動畫／數值不等它；同時只跑一句。
 *   press(seq)   每按一下呼叫：閒著就馬上開一句；忙著就記「最新一下」（舊的丟掉）。
 *   一句打完（finish）：最後一下在 0.8 秒內（打完前按的，或打完後 0.8 秒內按的）→ 立刻開下一句。
 * deps：{ request(seq) → Promise<string>, type(text) → Promise<void>, placeholder(), now(), onDone(seq) }
 */
export class ThrustReplyPump {
  constructor(deps) {
    this.d = deps;
    this.busy = false;
    this.pendingSeq = 0;
    this.lastPressAt = 0;
    this.lastFinishAt = 0;
    this.started = [];
    this.done = [];
    this.dropped = 0;
    this.urgentSeq = 0;
    this.closed = false;
  }

  press(seq) {
    if (this.closed) return;
    const now = this.d.now();
    this.lastPressAt = now;
    if (!this.busy) {
      this._run(seq);
      return;
    }
    if (this.pendingSeq) this.dropped += 1;
    this.pendingSeq = seq;
  }

  /** 一定要說的一句（她高潮）：舊的排隊丟掉；忙著就排在下一句、打完立刻接（不看 0.8 秒）。 */
  urgent(seq) {
    if (this.closed) return;
    if (this.pendingSeq) this.dropped += 1;
    this.urgentSeq = seq;
    if (!this.busy) {
      this.pendingSeq = 0;
      this._run(seq);
      return;
    }
    this.pendingSeq = seq;
  }

  close() {
    this.closed = true;
    this.pendingSeq = 0;
  }

  async _run(seq) {
    this.busy = true;
    this.started.push(seq);
    try {
      try { this.d.placeholder?.(seq); } catch { /* */ }
      let text = "";
      try {
        text = await this.d.request(seq);
      } catch {
        text = "";
      }
      if (this.closed) return;
      await this.d.type(text, seq);
    } finally {
      this.busy = false;
      this.lastFinishAt = this.d.now();
      this.done.push(seq);
      if (!this.closed) {
        try { this.d.onDone?.(seq); } catch { /* */ }
        // onDone 裡已經開了下一句（例如高潮那句）→ 排隊的留給那句打完再判
        if (!this.busy && !this.closed) {
          const next = this.pendingSeq;
          this.pendingSeq = 0;
          // 打完前 0.8 秒內有按（或是一定要說的那句）→ 立刻接下一句；更早的那下算過期，丟掉（下次按再開）
          if (next && (next === this.urgentSeq || this.lastFinishAt - this.lastPressAt <= THRUST.CHAIN_WINDOW_MS)) this._run(next);
          else if (next) this.dropped += 1;
        }
      }
    }
  }
}
