/* 調戲的態度弧線（2026-11-25 使用者：調戲時她的回應不帶感——陌生、朋友、女友、妻子的拒絕／無奈拒絕／無奈順從／迎合都差一點）。
   四個態度：拒絕 → 無奈拒絕 → 無奈順從 → 迎合。
   - 關係階決定「起點」和「上限」（使用者確認：陌生最多到無奈拒絕、朋友最多到無奈順從）；
   - 同一場裡越被撩（性奮、這一場被碰了幾下、性慾、飢渴）就往後推一到兩格；
   - 侵犯值高、心裡還在生氣／受傷、個性比較硬 → 往回拉；女友以前這一下侵犯感太大：斥責級最多無奈拒絕、暴怒級回到拒絕。
   - 表現：嘴硬、身體誠實（性奮起來後，嘴上的拒絕會斷、會抖、會偷偷承認）。
   只放純函式（算態度、記這一場、給 LLM 的 prompt、黑影反應用哪一種）；呼叫端在 test_room_summon.js。 */
import { STAGE_IDX, stageIndexOf } from "./girl_voice.js?v=1";

export const ATTITUDES = ["refuse", "reluctant_refuse", "reluctant_yield", "welcome"];
export const ATTITUDE_ZH = { refuse: "拒絕", reluctant_refuse: "無奈拒絕", reluctant_yield: "無奈順從", welcome: "迎合" };

/** 關係階的起點分數（整數部分＝態度格；小數＝離下一格多近）。 */
export const STAGE_BASE = {
  stranger: 0, acquaintance: 0.15, friend: 0.3, close_friend: 0.6,
  girlfriend: 1.0, passionate: 1.3, lover: 1.6,
  wife: 2.0, devoted_wife: 2.3, obedient_wife: 2.6, pathological_wife: 2.6,
};
/** 上限（使用者：陌生到無奈拒絕、朋友到無奈順從；女友以上可以到迎合）。 */
export const STAGE_CAP = {
  stranger: 1, acquaintance: 1, friend: 2, close_friend: 2,
  girlfriend: 3, passionate: 3, lover: 3, wife: 3, devoted_wife: 3, obedient_wife: 3, pathological_wife: 3,
};
/** 下限：妻子以上再怎麼不高興也只到無奈拒絕（不會像陌生人那樣真的翻臉）。 */
export const STAGE_FLOOR = { wife: 1, devoted_wife: 1, obedient_wife: 1, pathological_wife: 1 };

/** 性奮（動作之前她已經有的）往後推多少。 */
export const AROUSAL_PUSH = { none: 0, slight: 0.4, aroused: 0.9, wantFill: 1.4, climax: 1.8 };
/** 性慾傾向（低／中／高／頂）。 */
export const LIBIDO_PUSH = { low: -0.15, mid: 0, high: 0.2, peak: 0.4 };
/** 這一場每被碰一下 +0.08，最多 +0.6（被摸久了就鬆了）。 */
export const COUNT_PUSH_STEP = 0.08;
export const COUNT_PUSH_MAX = 0.6;
/** 兩次碰之間超過 20 分鐘＝新的一場。 */
export const SESSION_GAP_MS = 20 * 60 * 1000;

function arousalStageOf(n) {
  const a = Number(n) || 0;
  if (a <= 0) return "none";
  if (a <= 7) return "slight";
  if (a <= 15) return "aroused";
  if (a <= 22) return "wantFill";
  return "climax";
}
function libidoStageOf(n) {
  const a = Number(n) || 0;
  if (a <= 7) return "low";
  if (a <= 15) return "mid";
  if (a <= 22) return "high";
  return "peak";
}
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

/**
 * 算現在的態度。
 * @param {object} o
 *   stage：房間 11 階 key；arousal：性奮數值（動作之前）；libido：身體性慾數值；count：這一場已經被碰幾下（不含這一下）；
 *   invasion：侵犯值 0–100；mood：情緒餘溫 type（angry／hurt／flustered…）；moodLevel：0–100；
 *   persMult：個性抗拒倍率（invasion.js personalityResistMult，1＝一般，<1 比較放得開，>1 比較硬）；
 *   hunger：性飢渴 0–100（沒開給 0）；
 *   turnTier：這一下的抗議語氣階（invasion.js protestTone().tier：none／light／clear／harsh／furious／token）；
 *   willing：這一下是不是半推半就。
 * @returns {{ idx:number, key:string, zh:string, score:number, cap:number, reasons:string[] }}
 */
export function teaseAttitude({
  stage = "stranger", arousal = 0, libido = 0, count = 0, invasion = 0,
  mood = "", moodLevel = 0, persMult = 1, hunger = 0, turnTier = "", willing = false,
} = {}) {
  const st = stage in STAGE_BASE ? stage : "stranger";
  const reasons = [];
  let score = STAGE_BASE[st];
  const ar = arousalStageOf(arousal);
  const pa = AROUSAL_PUSH[ar] || 0;
  if (pa) { score += pa; reasons.push(`性奮${ar}+${pa}`); }
  const pl = LIBIDO_PUSH[libidoStageOf(libido)] || 0;
  if (pl) { score += pl; reasons.push(`性慾${pl > 0 ? "+" : ""}${pl}`); }
  const pc = Math.min(COUNT_PUSH_MAX, Math.max(0, Number(count) || 0) * COUNT_PUSH_STEP);
  if (pc) { score += pc; reasons.push(`這場第${(Number(count) || 0) + 1}下+${Math.round(pc * 100) / 100}`); }
  const h = Number(hunger) || 0;
  if (h >= 65 && stageIndexOf(st) >= STAGE_IDX.friend) { score += 0.3; reasons.push("飢渴+0.3"); }
  const pm = Number(persMult) || 1;
  if (pm !== 1) {
    const ps = Math.round((1 - pm) * 100) / 100;
    score += ps; reasons.push(`個性${ps > 0 ? "+" : ""}${ps}`);
  }
  const inv = Number(invasion) || 0;
  if (inv >= 85) { score -= 0.6; reasons.push("侵犯快滿−0.6"); }
  else if (inv >= 60) { score -= 0.3; reasons.push("侵犯−0.3"); }
  if ((mood === "angry" || mood === "hurt") && (Number(moodLevel) || 0) >= 15) { score -= 0.6; reasons.push(`還在${mood === "angry" ? "生氣" : "難過"}−0.6`); }

  const cap = STAGE_CAP[st] ?? 1;
  const floor = STAGE_FLOOR[st] ?? 0;
  let idx = clamp(Math.floor(score), floor, cap);
  if (willing && idx < 1) { idx = Math.min(cap, 1); reasons.push("半推半就"); }
  // 這一下侵犯感太大（女友以前）：斥責級最多無奈拒絕（不會順從）、暴怒級回到真的拒絕
  if (stageIndexOf(st) < STAGE_IDX.girlfriend) {
    if (turnTier === "furious") { if (idx > 0) reasons.push("這下太超過→拒絕"); idx = 0; }
    else if (turnTier === "harsh" && idx > 1) { reasons.push("這下太過分→無奈拒絕"); idx = 1; }
  }
  idx = clamp(idx, floor, cap);
  const key = ATTITUDES[idx];
  return { idx, key, zh: ATTITUDE_ZH[key], score: Math.round(score * 100) / 100, cap, reasons };
}

/** 這一場被碰了幾下（不含這一下）；超過 20 分鐘沒碰就重算。sess 存在 bodyState.teaseSess。 */
export function teaseSessionCount(sess, now = Date.now()) {
  if (!sess || typeof sess !== "object") return 0;
  const last = Number(sess.at) || 0;
  if (!last || now - last > SESSION_GAP_MS) return 0;
  return Math.max(0, Number(sess.n) || 0);
}

/** 記一下：回傳新的 sess（{n, at, last, prev}）；last＝這一下的態度，prev＝上一下的態度（同一場才有）。 */
export function noteTeaseSession(sess, attitudeKey, now = Date.now()) {
  const n = teaseSessionCount(sess, now);
  const prev = n > 0 ? (sess?.last || "") : "";
  return { n: n + 1, at: now, last: attitudeKey || "", prev };
}

/** 態度轉變（同一場、跟上一下比）：+1 鬆了、−1 硬回去、0 一樣。 */
export function attitudeShift(prevKey, nowKey) {
  const a = ATTITUDES.indexOf(prevKey), b = ATTITUDES.indexOf(nowKey);
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}

const ZONE_CUE = {
  waist: "腰／屁股被摟住、撫過",
  breast: "胸部被摸、被揉",
  nipple: "乳頭被含住、被舔",
  labia: "陰唇被手指撫弄",
  vagina: "手指在裡面",
  uterus: "最裡面被頂到",
};

/** 動作 hitId → 部位提示。 */
export function zoneCueOf(hitId) {
  return ZONE_CUE[hitId] || "";
}

/**
 * 給 LLM 的態度區塊（動作按鈕那條路）。
 * @param {object} att teaseAttitude 的結果
 * @param {object} o  stage／arousal／shift（attitudeShift）／hitId／persToken（個性半推半就語氣）／persProtest（個性抗議語氣）／wifeCall（可以叫老公）
 */
export function attitudePromptBlock(att, {
  stage = "stranger", arousal = 0, shift = 0, hitId = "", persToken = "", persProtest = "",
} = {}) {
  if (!att) return "";
  const ar = arousalStageOf(arousal);
  const hot = ar === "aroused" || ar === "wantFill" || ar === "climax";
  const veryHot = ar === "wantFill" || ar === "climax";
  const idx = stageIndexOf(stage);
  const out = [`【這一下你的態度：${att.zh}——只准用說出口的話演，不准唸出態度名、數字】`];
  const zone = zoneCueOf(hitId);
  if (zone) out.push(`他這一下是：${zone}。第一句就要對這個部位有反應，不要像沒被碰到。`);

  if (att.key === "refuse") {
    out.push("你是真的不要：拒絕要清楚、有力，要他住手；可以罵、可以兇，依個性。不准配合、不准說舒服。");
    if (persProtest) out.push(`個性語氣——${persProtest}`);
    if (veryHot) out.push("【嘴硬・身體誠實】可是身體已經很有感覺了：罵到一半聲音會抖、會突然吸一口氣或卡住半拍，你自己也氣自己；嘴上絕對不承認。");
    else if (hot) out.push("【嘴硬・身體誠實】身體有一點反應：語氣兇，但有一個字會不小心發抖；嘴上絕不承認。");
  } else if (att.key === "reluctant_refuse") {
    out.push("你嘴上還在拒絕，但已經沒力氣真的推開：嘆氣、抱怨、碎念、討價還價（像「不是說了不要嗎……」「你很煩欸……」「只能一下喔……」「不要在這裡啦……」），語尾變軟。不要大吼、不要暴怒、不要威脅要走。");
    if (persToken) out.push(`個性語氣——${persToken}`);
    if (veryHot) out.push("【嘴硬・身體誠實】拒絕的話講到一半會斷掉、變成喘或小聲的「……那裡不行」；被他說中有感覺就嘴硬「才、才沒有」。");
    else if (hot) out.push("【嘴硬・身體誠實】拒絕的聲音比你想的還軟，偶爾停頓一下；被戳破就嘴硬。");
  } else if (att.key === "reluctant_yield") {
    out.push("你放棄抵抗、讓他碰了，但嘴上還要裝作是被他逼的：碎念、害羞、別開臉的口氣（像「……就一下喔」「真拿你沒辦法」「要摸就快一點啦」「不准跟別人說」）。不再說「住手」「放開」。");
    if (persToken) out.push(`個性語氣——${persToken}`);
    if (veryHot) out.push("【嘴硬・身體誠實】聲音越來越軟、會不小心說出「……那邊」「再、再一下」這種半句，說完又慌張否認或叫他不准笑。");
    else if (hot) out.push("【嘴硬・身體誠實】偶爾漏出一句真心（像「……其實沒有很討厭」），說完又馬上嘴硬。");
  } else {
    out.push(idx >= STAGE_IDX.wife
      ? "你很喜歡他這樣碰你：大方撒嬌、主動要求（「再用力一點」「這邊也要」），會反過來挑逗他、勾他，說些讓他更想要的話。"
      : "你接受了、其實很喜歡：害羞但誠實地迎合，會小聲要求（「……再一下」「不要停」），偶爾撒嬌或小小地挑逗回去。");
    if (veryHot) out.push("身體很想要：可以直白說想被他碰更裡面、更多；照下面的說話規則決定能不能說完整句子。");
  }
  if (shift > 0) out.push("跟剛才比，你明顯鬆動了：讓這個轉變聽得出來（例如本來要罵卻卡住、改口、語氣一下子軟掉）。");
  else if (shift < 0) out.push("跟剛才比，你又硬起來了：這一下讓你回過神，語氣要比上一句更堅決。");
  return out.join("\n");
}

/** 黑影被摸的反應用哪一種動作（chat_shadow.js 的 r_breast_stranger…）：拒絕＝推開遮住掙扎、無奈拒絕＝輕推遮住、無奈順從＝一手遮嘆氣、迎合＝不遮、仰頭一顫。 */
export const ATTITUDE_REACT = { refuse: "stranger", reluctant_refuse: "friend", reluctant_yield: "girlfriend", welcome: "wife" };

/** 這個關係階平常會用到的態度（起點～上限），給台詞庫和黑影先算；更低的（生氣時）用最接近的那格。 */
export function attitudeRange(stage = "stranger") {
  const st = stage in STAGE_BASE ? stage : "stranger";
  const lo = Math.max(STAGE_FLOOR[st] ?? 0, Math.floor(STAGE_BASE[st]));
  const hi = STAGE_CAP[st] ?? 1;
  const out = [];
  for (let i = lo; i <= hi; i++) out.push(ATTITUDES[i]);
  return out;
}

/** 在 list 裡找跟 key 最接近的態度（往下找不到就往上）。 */
export function nearestAttitude(key, list) {
  if (!Array.isArray(list) || !list.length) return key;
  if (list.includes(key)) return key;
  const i = ATTITUDES.indexOf(key);
  let best = list[0], bd = 99;
  for (const k of list) { const d = Math.abs(ATTITUDES.indexOf(k) - i); if (d < bd) { bd = d; best = k; } }
  return best;
}
