/** 侵犯值 0–100：依關係階段倍率與失神抑制累加；滿值則逃離房間。 */

import { ensureBody, arousalStage, libidoStage } from "./body_state.js?v=9";

export const INVASION_MAX = 100;
/** 時間衰減：每滿 20 分鐘真實時間才 −1..2（2026-10-02 使用者：原本每 5 秒閒置扣太快）。 */
export const INVASION_TIME_STEP_MS = 20 * 60 * 1000;

/** 與 test_room_summon STAGE_LADDER key 對齊。 */
export const STAGE_INVASION_MULT = {
  stranger: 1.0,
  acquaintance: 0.85,
  friend: 0.7,
  close_friend: 0.55,
  girlfriend: 0.4,
  passionate: 0.28,
  lover: 0.18,
  wife: 0.12,
  devoted_wife: 0.06,
  obedient_wife: 0,
  pathological_wife: 0,
};

/** 陌生階段基礎亂數區間（含端點）。 */
export const INVASION_RANGES = {
  waist:         [15, 20],
  breast:        [22, 28],
  butt:          [22, 28],
  breast_knead:  [28, 35],
  breast_suck:   [30, 38],
  nipple_lick:   [30, 38],
  labia:         [35, 45],
  labia_rub:     [42, 52],
  finger_in:     [50, 65],
  vagina_finger: [55, 70],
  cervix_rub:    [60, 80],
  // 抽出不另加侵犯（或極低）；未列則 0
  pull_out:      [0, 0],
};

function clampInv(n) {
  return Math.max(0, Math.min(INVASION_MAX, Math.round(Number(n) || 0)));
}

function randInclusive(lo, hi) {
  const a = Math.round(Number(lo) || 0);
  const b = Math.round(Number(hi) || 0);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function ensureInvasion(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.invasion = clampInv(b.invasion);
  const at = Number(b.invasionDecayAt);
  b.invasionDecayAt = Number.isFinite(at) && at > 0 ? at : 0;
  return b;
}

export function getInvasion(who) {
  return ensureInvasion(who)?.invasion || 0;
}

export function stageInvasionMult(stageKey) {
  const key = String(stageKey || "stranger");
  if (key in STAGE_INVASION_MULT) return STAGE_INVASION_MULT[key];
  return STAGE_INVASION_MULT.stranger;
}

/**
 * 半推半就（2026-10-03 使用者）：她自己被撩起來／性慾高時，侵犯增益打折。
 * 依興奮階段：none 1.0、slight 0.85、aroused 0.6、wantFill 0.35、climax 0.2；
 * 性慾階段再乘：high ×0.9、peak ×0.8（low/mid ×1）。
 * 再乘個性倍率（PERSONALITY_RESIST＋stats 修正，夾在 0.75–1.3）。
 * 關係下限（2026-10-03 第二版：胸部級也有）：見 BREAST_FLOOR／INVASIVE_FLOOR；女友以上無下限。
 *   下限也乘個性倍率中 >1 的部分（高冷／清純等更硬），但 <1 的個性不會把下限壓低。
 * 最終倍率上限 1.3。
 * willing（語氣改「半推半就」）＝最終倍率 ≤ 個性門檻 willingAt，且：
 *   陌生／認識：只有輕度動作（摟腰級）才可能 willing，且只取代 light 階（增益 ≤5）；胸部級以上一律真的抗拒。
 *   朋友以上：取代 light／clear（增益 ≤12）。harsh／furious 永遠照舊。
 */
export const AROUSAL_INVASION_MULT = { none: 1.0, slight: 0.85, aroused: 0.6, wantFill: 0.35, climax: 0.2 };
export const LIBIDO_INVASION_MULT = { low: 1.0, mid: 1.0, high: 0.9, peak: 0.8 };
/** 胸部級動作（區間下限 22–34：摸奶、摸臀、揉奶、吸奶、舔奶頭）。 */
export const BREAST_FLOOR = { stranger: 0.75, acquaintance: 0.65, friend: 0.45, close_friend: 0.3 };
/** 侵入性動作（區間下限 ≥35：摸陰唇以上）。 */
export const INVASIVE_FLOOR = { stranger: 0.9, acquaintance: 0.8, friend: 0.55, close_friend: 0.4 };
export const WILLING_AT = 0.6;
export const RESIST_MULT_MAX = 1.3;
export const PERS_MULT_MIN = 0.75;
const BREAST_LO = 22;
const INVASIVE_LO = 35;
const STAGE_KEYS = Object.keys(STAGE_INVASION_MULT);
const GF_IDX = 4;
const LOVER_IDX = 6;

/**
 * 個性抗拒表（key＝girl_gen PERSONALITY_NAMES）。
 * mult(stageIdx)：乘在興奮倍率上；willingAt：半推半就門檻（最終倍率 ≤ 才算）；
 * token／protest：給 LLM 的個性語氣；tokenScraps：半推半就保底碎句。
 */
export const PERSONALITY_RESIST = {
  "活潑開朗": {
    mult: () => 0.85, willingAt: 0.7,
    token: "活潑開朗：笑著拍他一下、「討厭啦～」「你很色欸！」，嘴上鬧、身體不躲。",
    protest: "活潑開朗：直接大聲說不喜歡、會推他，但不陰沉。",
    tokenScraps: ["討厭啦～你很色欸……", "欸欸、不要鬧啦……", "真是的……只有一下喔……"],
  },
  "天然呆": {
    mult: () => 0.9, willingAt: 0.65,
    token: "天然呆：迷糊地「欸？等、等一下……」「這樣好奇怪喔……」，慢半拍才害羞，沒有真的推開。",
    protest: "天然呆：一臉困惑但明確說「不要這樣」，會往後縮。",
    tokenScraps: ["欸？等、等一下啦……", "這樣……好奇怪喔……", "嗚……你在幹嘛啦……"],
  },
  "文靜溫柔": {
    mult: () => 1.0, willingAt: 0.6,
    token: "文靜溫柔：小聲、軟軟地拜託「不要啦……」，臉紅低頭，語氣溫柔不兇。",
    protest: "文靜溫柔：輕聲但堅定地請他住手，不罵人。",
    tokenScraps: ["不要啦……", "別在這裡啦……", "你、你真的很壞……"],
  },
  "御姊": {
    mult: () => 0.9, willingAt: 0.65,
    token: "御姊：從容地調侃「膽子不小嘛」「就這樣而已？」，像在縱容他，不慌。",
    protest: "御姊：居高臨下地冷聲警告「手拿開，別讓我說第二次」。",
    tokenScraps: ["膽子不小嘛……", "呵……就只敢這樣？", "真拿你沒辦法……"],
  },
  "傲嬌": {
    mult: () => 1.0, willingAt: 0.6,
    token: "傲嬌：嘴上要比平常更大聲——「哼！才、才不是想讓你碰！」「笨蛋！變態！」——但其實不推開、不離開，口是心非。",
    protest: "傲嬌：大聲罵「笨蛋！變態！」，臉紅但是真的在拒絕。",
    tokenScraps: ["哼！才、才不是想讓你碰的……", "笨蛋……變態……", "我、我只是懶得推開而已！"],
  },
  "高冷": {
    mult: (i) => (i < GF_IDX ? 1.2 : 1.0), willingAt: 0.5,
    token: "高冷：冷冷一句「……隨便你」「別得寸進尺」，聲音壓低、別開臉，沒有真的推開。",
    protest: "高冷：極短、極冷地「手拿開。」「你找死？」，不需要大吼。",
    tokenScraps: ["……隨便你。", "別得寸進尺。", "……就這一次。"],
  },
  "病嬌": {
    mult: (i) => (i < GF_IDX ? 1.1 : 0.8), willingAt: 0.6,
    token: "病嬌：甜甜地、有點危險地「只有你可以喔……」「不准對別人這樣」，半推是試探。",
    protest: "病嬌：笑容消失、語氣陰冷地警告他，帶威脅感。",
    tokenScraps: ["只有你可以喔……", "嗯……不准對別人這樣……", "壞人……要負責喔……"],
  },
  "清純反差": {
    mult: (i) => (i < LOVER_IDX ? 1.15 : 0.9), willingAt: 0.5,
    token: "清純反差：慌張又羞恥「不、不可以這樣……」，聲音發抖但沒有推開，像在跟自己掙扎。",
    protest: "清純反差：嚇到、慌張地遮住自己、說「不可以！」，是真的害怕被碰。",
    tokenScraps: ["不、不可以這樣……", "會、會被看到的……", "嗚……怎麼可以……"],
  },
};

function persKeyOf(personality) {
  const k = String(personality || "");
  return k in PERSONALITY_RESIST ? k : "文靜溫柔";
}

/** 個性倍率（含 stats：害羞 ≥70 ×1.1、≤30 ×0.95；主動 ≥70 ×0.9、≤30 ×1.05），夾 0.75–1.3。 */
export function personalityResistMult(personality, stats = null, stage = "stranger") {
  const idx = Math.max(0, STAGE_KEYS.indexOf(String(stage || "stranger")));
  let m = PERSONALITY_RESIST[persKeyOf(personality)].mult(idx);
  const shy = Number(stats?.shyness);
  const pro = Number(stats?.proactivity);
  if (stats && Number.isFinite(shy)) { if (shy >= 70) m *= 1.1; else if (shy <= 30) m *= 0.95; }
  if (stats && Number.isFinite(pro)) { if (pro >= 70) m *= 0.9; else if (pro <= 30) m *= 1.05; }
  return Math.round(Math.max(PERS_MULT_MIN, Math.min(RESIST_MULT_MAX, m)) * 1000) / 1000;
}

/** 動作強度級：light（摟腰）、breast（胸部級）、invasive（陰唇以上）、none（不加侵犯）。 */
export function actTier(actId) {
  const range = INVASION_RANGES[actId];
  if (!range || range[1] <= 0) return "none";
  if (range[0] >= INVASIVE_LO) return "invasive";
  if (range[0] >= BREAST_LO) return "breast";
  return "light";
}

/**
 * @returns {{ mult, raw, persMult, floor, floored, willing, tokenCap, personality }}
 */
export function arousalInvasionMult(arousal = 0, libido = 0, {
  stage = "stranger", actId = "", personality = "", stats = null,
} = {}) {
  const st = String(stage || "stranger");
  const persKey = persKeyOf(personality);
  const persMult = personalityResistMult(persKey, stats, st);
  const raw = (AROUSAL_INVASION_MULT[arousalStage(arousal)] ?? 1)
    * (LIBIDO_INVASION_MULT[libidoStage(libido)] ?? 1);
  const tier = actTier(actId);
  const baseFloor = tier === "invasive" ? (INVASIVE_FLOOR[st] ?? 0)
    : tier === "breast" ? (BREAST_FLOOR[st] ?? 0) : 0;
  const floor = baseFloor * Math.max(1, persMult);
  const scaled = raw * persMult;
  const mult = Math.round(Math.min(RESIST_MULT_MAX, Math.max(scaled, floor)) * 1000) / 1000;
  const floored = floor > scaled;
  const lowStage = st === "stranger" || st === "acquaintance";
  let willing = mult <= PERSONALITY_RESIST[persKey].willingAt;
  if (lowStage && (tier === "breast" || tier === "invasive")) willing = false;
  return {
    mult,
    raw: Math.round(raw * 1000) / 1000,
    persMult,
    floor: Math.round(floor * 1000) / 1000,
    floored,
    willing,
    tokenCap: lowStage ? 5 : 12,
    personality: persKey,
  };
}

/**
 * round(rand(lo,hi) * stageMult * (1 - stun/150) * arousalMult)
 * arousalMult＝max(興奮×性慾×個性, 關係下限×max(1,個性))，上限 1.3
 * mult 0 → add 0。arousal/libido 不給就讀 bodyState（應在 applyAct 之後呼叫）。
 * @returns {{ added: number, invasion: number, fled: boolean, arousalMult: number, willing: boolean }}
 */
export function applyInvasionRoll(who, actId, {
  stage = "stranger", stun = 0, arousal = null, libido = null, personality = "", stats = null,
} = {}) {
  const b = ensureInvasion(who);
  if (!b) return { added: 0, invasion: 0, fled: false, arousalMult: 1, willing: false, tokenCap: 5, personality: "" };
  const am = arousalInvasionMult(
    arousal == null ? b.arousal : arousal,
    libido == null ? b.libido : libido,
    { stage, actId, personality, stats: stats ?? who?.stats ?? null },
  );
  const extra = { arousalMult: am.mult, willing: am.willing, tokenCap: am.tokenCap, personality: am.personality };
  const range = INVASION_RANGES[actId];
  if (!range) return { added: 0, invasion: b.invasion || 0, fled: false, ...extra };
  const mult = stageInvasionMult(stage);
  if (mult <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX, ...extra };
  }
  const [lo, hi] = range;
  if (hi <= 0 && lo <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX, ...extra };
  }
  const base = randInclusive(lo, hi);
  const stunDamp = Math.max(0, 1 - (Math.max(0, Number(stun) || 0) / 150));
  const added = Math.round(base * mult * stunDamp * am.mult);
  const before = b.invasion || 0;
  b.invasion = clampInv(before + added);
  // 從 0 開始累積：時間衰減從現在起算（不拿舊時間戳一口氣扣）
  if (before <= 0 && b.invasion > 0) b.invasionDecayAt = Date.now();
  return {
    added,
    invasion: b.invasion,
    fled: b.invasion >= INVASION_MAX,
    ...extra,
  };
}

/** 每一句閒聊都降。一般 −1..2；她開心 −8..10。 */
export const INVASION_HAPPY_DROP = [8, 10];
export const INVASION_CHAT_DROP = [1, 2];

/**
 * 這句閒聊她算不算「開心／被哄到」（侵犯走 −8..10，不是一般 −1..2）：
 *   - judge 判定「接住」（感情 +5 的那一種），或
 *   - 這句前後感情有上升，但不是「喜歡」「有趣」那兩筆小加分，或
 *   - 她今天的生活心情是「愉快」，而且這句沒冒犯、身上沒有生氣／受傷的情緒餘溫。
 * 「喜歡」「有趣」會加感情，但不算這檔。用文字摸她（身體命中）或這句被判冒犯 → 一律不算。
 * @param {{ mark?: string, affBefore?: number, affAfter?: number, worldMood?: string, moodType?: string, bodyHit?: boolean }} o
 */
export function chatLineHappy({ mark = "平常", affBefore = 0, affAfter = 0, worldMood = "", moodType = "", bodyHit = false } = {}) {
  if (bodyHit) return false;
  if (mark === "冒犯") return false;
  const pleasantDay = worldMood === "愉快" && moodType !== "angry" && moodType !== "hurt";
  if (mark === "喜歡" || mark === "有趣") return pleasantDay;
  if (mark === "接住") return true;
  if ((Number(affAfter) || 0) > (Number(affBefore) || 0)) return true;
  if (pleasantDay) return true;
  return false;
}

/** 這句閒聊該降多少：開心 8..10，否則 1..2。 */
export function chatInvasionDrop(happy, rng = Math.random) {
  const [lo, hi] = happy ? INVASION_HAPPY_DROP : INVASION_CHAT_DROP;
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** 每句閒聊都扣。沒傳量時用一般句 −1..2。開心那句由呼叫端傳 chatInvasionDrop(true)。 */
export function decayInvasion(who, amount = null) {
  const b = ensureInvasion(who);
  if (!b) return 0;
  const drop = amount == null
    ? chatInvasionDrop(false)
    : Math.max(0, Math.round(Number(amount) || 0));
  const before = b.invasion || 0;
  b.invasion = clampInv(before - drop);
  return before - b.invasion;
}

/**
 * 時間衰減：以 bodyState.invasionDecayAt（隨 bodyState 存檔，重新整理／換裝置不會重置）計算，
 * 每滿 INVASION_TIME_STEP_MS（20 分鐘）扣一次 −1..2；關掉很久就補 floor(經過/20分) 次，最多扣到 0。
 * 侵犯為 0 時只把時鐘推到現在（下次累積從頭算 20 分鐘）。
 * @returns {number} 實際扣掉的量
 */
export function decayInvasionByTime(who, now = Date.now(), rng = Math.random) {
  const b = ensureInvasion(who);
  if (!b) return 0;
  const t = Number(now) || Date.now();
  const at = Number(b.invasionDecayAt) || 0;
  if ((b.invasion || 0) <= 0 || at <= 0 || at > t + 60 * 1000) {
    b.invasionDecayAt = t;   // 沒有侵犯／沒有時鐘／時鐘在未來（換裝置時差）→ 從現在起算
    return 0;
  }
  const steps = Math.floor((t - at) / INVASION_TIME_STEP_MS);
  if (steps <= 0) return 0;
  b.invasionDecayAt = at + steps * INVASION_TIME_STEP_MS;
  const before = b.invasion || 0;
  let drop = 0;
  for (let i = 0; i < steps && drop < before; i++) drop += 1 + Math.floor(rng() * 2);
  b.invasion = clampInv(before - drop);
  return before - b.invasion;
}

export function clearInvasion(who) {
  const b = ensureInvasion(who);
  if (!b) return;
  b.invasion = 0;
}

export function invasionHint(who) {
  const inv = getInvasion(who);
  return `侵犯 ${inv}/${INVASION_MAX}`;
}

const TOKEN_TONE = {
  tier: "token",
  label: "半推半就",
  promptLine:
    "你自己其實也被撩起來了、有點想要：嘴上輕輕說不要（像「不要啦…」「討厭，你很壞欸…」），但不是真的拒絕，不推開他、不生氣斥責，語氣軟、帶點撒嬌或嗔怪；依你的個性表現（嘴硬的就嘴硬、害羞的就小聲）。若身體刺激規則允許才可帶喘／斷字，否則說完整句子。",
  scraps: ["不要啦……", "討厭，你很壞欸……", "別在這裡啦……", "你、你真的很壞……", "說了不要了啦……"],
};

/**
 * 依「本回合」侵犯增益決定抗議語氣階（非總表）。
 * opts.willing（半推半就）：增益 ≤ tokenCap（陌生／認識 5、其餘 12）改為 token；harsh／furious 不變。
 * opts.personality：附上該個性的語氣指引（token／抗議各一句）。
 */
export function protestTone(gain, { willing = false, tokenCap = 12, personality = "" } = {}) {
  const g = Math.max(0, Math.round(Number(gain) || 0));
  if (willing && g > 1 && g <= Math.min(12, Number(tokenCap) || 0)) {
    const pr = personality ? PERSONALITY_RESIST[persKeyOf(personality)] : null;
    return {
      gain: g,
      ...TOKEN_TONE,
      promptLine: pr ? `${TOKEN_TONE.promptLine}個性語氣——${pr.token}` : TOKEN_TONE.promptLine,
      scraps: pr ? pr.tokenScraps : TOKEN_TONE.scraps,
    };
  }
  const t = protestToneBase(g);
  if (personality && t.tier !== "none") {
    const pr = PERSONALITY_RESIST[persKeyOf(personality)];
    return { ...t, promptLine: `${t.promptLine}個性語氣——${pr.protest}` };
  }
  return t;
}

function protestToneBase(g) {
  if (g <= 1) {
    return {
      gain: g,
      tier: "none",
      label: "幾乎無抗拒",
      promptLine: "",
      scraps: [],
    };
  }
  if (g <= 5) {
    return {
      gain: g,
      tier: "light",
      label: "輕微推拒／害羞",
      promptLine:
        "本回合侵犯感只微微增加。語氣輕推、害羞或軟軟的不悅即可，不要大吼，也不要完全配合。",
      scraps: ["……別、別這樣…", "嗯…有點過分…", "你幹嘛…", "稍微…離遠一點…"],
    };
  }
  if (g <= 12) {
    return {
      gain: g,
      tier: "clear",
      label: "明顯抗議",
      promptLine:
        "本回合侵犯感明顯上升。要用清楚抗議、較硬的語氣拒絕；可以生氣，但不要空白或求饒（失神另論）。",
      scraps: ["放開…！", "不要碰我！", "太過分了…", "給我住手！", "你有病啊…"],
    };
  }
  if (g <= 19) {
    return {
      gain: g,
      tier: "harsh",
      label: "嚴厲斥責",
      promptLine:
        "本回合侵犯感大幅上升。必須嚴厲斥責、提高音量、要求立刻住手；語氣兇、可以罵人；不准平靜、不准害羞軟語、不准享受。",
      scraps: ["給我住手！！", "放開！你幹嘛碰我！", "太過分了吧！？", "再碰我就翻臉！", "滾——別碰我！"],
    };
  }
  return {
    gain: g,
    tier: "furious",
    label: "暴怒／要離開",
    promptLine:
      "本回合侵犯感暴衝。必須暴怒痛罵、揚言要離開或推開對方；語氣失控。不准平靜、不准配合。",
    scraps: ["夠了！！我要走了！", "再碰我一下試試！", "滾！別靠近我！", "受不了了——放開！", "再這樣我真的離開！"],
  };
}

/**
 * 給 LLM 的本回合抗議指令（無增益則空字串）。
 * @param {number} gain 本回合 added
 * @param {{ invasion?: number, max?: number, willing?: boolean }} [opts]
 */
export function protestPromptBlock(gain, { invasion = null, max = INVASION_MAX, willing = false, tokenCap = 12, personality = "" } = {}) {
  const p = protestTone(gain, { willing, tokenCap, personality });
  if (p.tier === "none" || !p.promptLine) return "";
  const near =
    invasion != null && Number(invasion) >= max - 15
      ? "（侵犯感已接近上限，可暗示再繼續就離開。）"
      : "";
  return `【本回合抗議語氣・侵犯＋${p.gain}・${p.label}】${p.promptLine}${near}只准說出口的話，不要旁白。`;
}

function pickScrap(scraps) {
  if (!scraps?.length) return "";
  return scraps[Math.floor(Math.random() * scraps.length)];
}

const PROTEST_CUE = /住手|放開|滾|過分|離|走|不准|別碰|不要碰|給我|有病|翻臉/;

/**
 * 後處理：高增益時確保回覆聽得出抗議（低增益幾乎不動）。
 * 痙攣／空白／求饒／失神路徑不應呼叫此函式。
 */
const TOKEN_CUE = /不要|討厭|壞|別|才不|不行|笨蛋|色狼|哼|變態|隨便|不可以|膽子/;

export function blendProtestReply(text, gain, { willing = false, tokenCap = 12, personality = "" } = {}) {
  const p = protestTone(gain, { willing, tokenCap, personality });
  const raw = String(text || "").trim();
  if (p.tier === "none") return raw || "……";

  if (p.tier === "token") {
    // 半推半就：嘴上有一點「不要」就好，不硬塞斥責
    if (TOKEN_CUE.test(raw) || Math.random() < 0.5) return raw || pickScrap(p.scraps) || "……";
    const scrap = pickScrap(p.scraps);
    if (!raw) return scrap || "……";
    return `${scrap}${raw}`.slice(0, 80);
  }

  if (p.tier === "light") {
    if (PROTEST_CUE.test(raw) || Math.random() < 0.55) return raw || "……";
    const scrap = pickScrap(p.scraps);
    if (!scrap) return raw || "……";
    if (!raw) return scrap;
    return `${scrap}${raw}`.slice(0, 80);
  }

  const scrap = pickScrap(p.scraps);
  if (p.tier === "clear") {
    if (PROTEST_CUE.test(raw)) return raw || scrap || "……";
    if (!raw) return scrap || "……";
    return `${scrap}${raw}`.slice(0, 72);
  }

  // harsh / furious：一定要聽得出斥責
  if (PROTEST_CUE.test(raw)) {
    return raw.length > 72 ? `${raw.slice(0, 70)}！` : raw;
  }
  if (!raw) return scrap || "給我住手！！";
  return `${scrap}${raw}`.slice(0, 80);
}
