/**
 * 言語調戲（2026-10-04 使用者：原本「打字提到部位就加性奮」的 bug 當功能保留）。
 * 玩家除了按調戲鈕，也可以用話挑逗她。規則：
 *   - 台詞命中身體部位（body_state BODY_HITS）但**沒有動手的動詞** → 言語調戲：
 *       性奮小加（輕 +1／中 +2／重 +3），而且只能把性奮推到「剛好解鎖摸陰唇」那一點（verbalArousalCap），
 *       不會再往上（揉陰唇以上、想被填滿、高潮都要動手）；不碰器官、不算刺激（不會推失神／痙攣）、不加衝擊；
 *       侵犯只微微漲（1～2 × 關係階倍率，陌生 1～2、女友起多半 0），失神／痙攣中不漲。
 *   - 有動手動詞、而且對得上一顆調戲鈕 → 當成按那顆鈕（同一套鎖、侵犯擲骰、失神、動作圖、射精）；
 *     那顆鈕還沒解鎖（或現在不能調戲）→ 降成言語調戲（話說了，手沒碰到）。
 *   - 有動手動詞但沒有對應的鈕（玩具、陰莖、內射、大腿、親嘴、後穴、抽出玩具…）→ 照舊走 applyBodyFromUserText。
 * 純函式；房間 UI 在 test_room_summon.js deliverUserTalk。
 */
import { ensureBody, matchBodyHit, textHasTouchVerb, clampBody } from "./body_state.js?v=17";
import { ACT_UNLOCK, affectionDiscounts } from "./openness.js?v=1";
import { stageInvasionMult, INVASION_MAX } from "./invasion.js?v=6";

/** 言語調戲每句加的性奮（依部位輕重）。 */
export const VERBAL_GAIN = {
  waist: 1, thigh: 1, butt: 1, lips: 1, breast: 1,
  nipple: 2, labia: 2, anus: 2, vibe_in: 2, dildo_in: 2, cucumber_in: 2,
  clit: 3, vagina: 3, uterus: 3, penis_in: 3, creampie: 3,
};
/** 上限至少到「微微性奮」上緣附近，感情很高（摸陰唇的性奮門檻被折到 ~0）時話語仍有一點作用。 */
export const VERBAL_CAP_FLOOR = 5;
/** 言語調戲的侵犯基礎值（再乘關係階倍率）。 */
export const VERBAL_INVASION = [1, 2];

/** 摸陰唇的性奮門檻（含感情折扣）＝言語調戲能把性奮推到的最高點。 */
export function verbalArousalCap(affection = 0) {
  const { aroDisc } = affectionDiscounts(affection);
  return Math.max(VERBAL_CAP_FLOOR, Math.max(0, ACT_UNLOCK.labia.aroThr - aroDisc));
}

/** 動手的台詞對應哪顆調戲鈕（沒有對應 → ""）。 */
export function textActId(hit, text = "") {
  const id = String(hit?.id || "");
  const s = String(text || "");
  if (id === "waist") return "waist";
  if (id === "butt") return "butt";
  if (id === "breast") return /揉|捏|搓|抓/.test(s) ? "breast_knead" : "breast";
  if (id === "nipple") return /舔/.test(s) ? "nipple_lick" : /吸|吮|含/.test(s) ? "breast_suck" : "breast_knead";
  if (id === "labia") return /揉|搓|磨|蹭/.test(s) ? "labia_rub" : "labia";
  if (id === "clit") return "labia_rub";
  if (id === "vagina") return /扣|摳|攪/.test(s) ? "vagina_finger" : "finger_in";
  if (id === "uterus") return "cervix_rub";
  if (id === "fingers_out") return "pull_out";
  return "";
}

/**
 * 這句台詞是什麼：none（沒提到身體）／verbal（言語調戲）／touch（動手）。
 * @returns {{ kind: "none"|"verbal"|"touch", hit: object|null, actId: string }}
 */
export function classifyUserText(text) {
  const hit = matchBodyHit(text);
  if (!hit) return { kind: "none", hit: null, actId: "" };
  if (!textHasTouchVerb(text)) return { kind: "verbal", hit, actId: "" };
  return { kind: "touch", hit, actId: textActId(hit, text) };
}

/**
 * 套用言語調戲：性奮小加（不超過上限、已超過就不動）、侵犯微漲；不碰器官、不算刺激。
 * @returns {{ gain, cap, arousal, invasion, invAdded, fled }}
 */
export function applyVerbalTease(who, hit, { affection = 0, stage = "stranger", dazed = false, rng = Math.random } = {}) {
  const b = ensureBody(who);
  if (!b || !hit) return { gain: 0, cap: 0, arousal: 0, invasion: 0, invAdded: 0, fled: false };
  const cap = verbalArousalCap(affection);
  const base = VERBAL_GAIN[hit.id] || 1;
  const before = b.arousal || 0;
  const gain = Math.max(0, Math.min(base, cap - before));
  b.arousal = clampBody(before + gain);
  // 不算正在被碰：stimulationState／失神都不看這句
  b.lastPart = "";
  b.lastVerb = "talk";
  b.touchVerb = false;
  b.verbalTease = { part: hit.id, at: Date.now() };
  let invAdded = 0;
  if (!dazed) {
    const [lo, hi] = VERBAL_INVASION;
    const roll = lo + Math.floor(rng() * (hi - lo + 1));
    invAdded = Math.round(roll * stageInvasionMult(stage));
    if (invAdded > 0) {
      const inv0 = Math.max(0, Math.round(Number(b.invasion) || 0));
      b.invasion = Math.min(INVASION_MAX, inv0 + invAdded);
      if (inv0 <= 0 && b.invasion > 0) b.invasionDecayAt = Date.now();
    }
  }
  return { gain, cap, arousal: b.arousal, invasion: b.invasion || 0, invAdded, fled: (b.invasion || 0) >= INVASION_MAX };
}

const PART_ZH = {
  waist: "腰", thigh: "大腿", butt: "屁股", lips: "嘴唇", breast: "胸部", nipple: "乳頭",
  labia: "下面", anus: "後面", clit: "陰蒂", vagina: "小穴裡面", uterus: "最裡面",
  vibe_in: "玩具", dildo_in: "玩具", cucumber_in: "玩具", penis_in: "做愛", creampie: "射在裡面",
};

/** 給她回話的 prompt：他只是用話挑逗（沒碰到）。blocked＝他想動手但還沒到那一步。 */
export function verbalTeasePrompt(hit, { blocked = false } = {}) {
  const part = PART_ZH[hit?.id] || "身體";
  return [
    `【言語調戲】他剛才是用話在挑逗你（說到你的${part}相關的事），${blocked ? "說要對你動手，但其實還沒碰到你" : "沒有碰你"}。`,
    "照你們的關係階和你的個性回應：可以害羞、嗔他、裝沒聽到、反嗆、或順著接話；身體最多只是微微有感覺，不准演成被摸、喘、失神或高潮。",
  ].join("");
}
